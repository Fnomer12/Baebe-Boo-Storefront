import { describe, expect, it } from "vitest";
import {
  acceptedForStamping,
  birthdayCountdown,
  campaignTokens,
  chunk,
  countFamilies,
  personalize,
  personalizeHtml,
  recipientUpsertRows,
  resolveSendOutcome,
  sendTimeTokens,
  unresolvedTokens,
  RESEND_BATCH_LIMIT,
} from "./campaign-send";

describe("personalisation", () => {
  it("substitutes the tokens the recipient metadata already carried", () => {
    // The bug: the metadata was written at campaigns/[id]/recipients but NO
    // template contained a single token, so every parent got the same generic
    // "A birthday is coming up!".
    const html = "<p>Hi {{parent_name}}, {{child_name}} turns 3 {{birthday_countdown}}!</p>";
    expect(personalize(html, campaignTokens({ email: "a@b.com", parentName: "Ama", childName: "Kojo", daysUntilBirthday: 7 })))
      .toBe("<p>Hi Ama, Kojo turns 3 in 7 days!</p>");
  });

  it("tolerates whitespace inside the braces", () => {
    expect(personalize("{{ child_name }}", { child_name: "Kojo" })).toBe("Kojo");
  });

  it("replaces every occurrence, not just the first", () => {
    expect(personalize("{{child_name}} and {{child_name}}", { child_name: "Kojo" })).toBe("Kojo and Kojo");
  });

  it("addresses a person when a name is missing rather than leaving a gap", () => {
    const tokens = campaignTokens({ email: "a@b.com" });
    expect(personalize("Hi {{parent_name}}, {{child_name}}", tokens)).toBe("Hi there, your little one");
  });

  it("ignores metadata keys that are not plain tokens", () => {
    // Metadata is jsonb written by a route; a key like ".*" must not become a
    // regex that rewrites the whole email.
    expect(personalize("<p>safe</p>", { ".*": "boom" })).toBe("<p>safe</p>");
  });

  it("escapes token values in an HTML body", () => {
    // The child's name is typed into the public homepage form, so it reaches
    // the email as customer-supplied HTML unless something escapes it.
    expect(personalizeHtml("<p>{{child_name}}</p>", { child_name: "<script>x</script>" })).toBe(
      "<p>&lt;script&gt;x&lt;/script&gt;</p>",
    );
    expect(personalizeHtml("<p>{{parent_name}}</p>", { parent_name: "Ama & Kofi" })).toBe(
      "<p>Ama &amp; Kofi</p>",
    );
  });

  it("leaves a subject line as plain text", () => {
    // An entity in a subject is displayed literally by every mail client.
    expect(personalize("{{parent_name}} & you", { parent_name: "Ama" })).toBe("Ama & you");
  });

  it("treats a name containing $& as text, not as a replacement pattern", () => {
    // THE BUG: the replacement was a STRING, and String.replace reads `$&`,
    // "$'", "$`" and `$1` in a replacement string as substitution patterns.
    // Both names come from the UNAUTHENTICATED "Join the family" form on the
    // homepage, so a customer chooses this value.
    expect(personalize("Hi {{parent_name}}!", { parent_name: "$&" })).toBe("Hi $&!");
    expect(personalize("Hi {{parent_name}}!", { parent_name: "$'" })).toBe("Hi $'!");
    expect(personalize("Hi {{parent_name}}!", { parent_name: "$`" })).toBe("Hi $`!");
    expect(personalize("Hi {{parent_name}}!", { parent_name: "$1$2" })).toBe("Hi $1$2!");
  });

  it("does not let $` splice the rest of the email into every token", () => {
    // "$`" is "everything before the match". With a string replacement, a child
    // named "$`" turned a two-token template into the email quoting itself.
    const html = "<p>secret-header</p><p>{{child_name}}</p><p>{{child_name}}</p>";
    expect(personalizeHtml(html, { child_name: "$`" })).toBe(
      "<p>secret-header</p><p>$`</p><p>$`</p>",
    );
  });

  it("reports tokens a template still contains after substitution", () => {
    expect(unresolvedTokens("Hi {{parent_name}}, meet {{mystery_field}}")).toEqual([
      "{{parent_name}}",
      "{{mystery_field}}",
    ]);
    expect(unresolvedTokens("<p>Hi Ama</p>")).toEqual([]);
  });
});

describe("birthdayCountdown", () => {
  it("reads like a person wrote it", () => {
    expect(birthdayCountdown(0)).toBe("today");
    expect(birthdayCountdown(1)).toBe("tomorrow");
    expect(birthdayCountdown(7)).toBe("in 7 days");
  });

  it("degrades to something sendable when the count is unknown", () => {
    expect(birthdayCountdown(null)).toBe("coming up");
    expect(birthdayCountdown(undefined)).toBe("coming up");
    expect(birthdayCountdown(-3)).toBe("coming up");
  });
});

describe("recipientUpsertRows", () => {
  it("does not duplicate a recipient who has no account", () => {
    // The bug: onConflict was "campaign_id, user_id" and user_id is nullable.
    // NULL never conflicts in Postgres, so every save re-inserted every row
    // without a user.
    const rows = recipientUpsertRows("campaign-1", [
      { email: "ama@example.com", userId: null, childName: "Kojo" },
      { email: "AMA@example.com", userId: null, childName: "Kojo" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.email).toBe("ama@example.com");
  });

  it("keeps the copy that knows the account", () => {
    const rows = recipientUpsertRows("campaign-1", [
      { email: "ama@example.com", userId: null },
      { email: "ama@example.com", userId: "user-1" },
    ]);
    expect(rows[0]!.user_id).toBe("user-1");
  });

  it("drops anything that is not an address", () => {
    expect(recipientUpsertRows("campaign-1", [{ email: "" }, { email: "not-an-email" }])).toEqual([]);
  });

  it("stores the substitution values as metadata", () => {
    const rows = recipientUpsertRows("campaign-1", [
      { email: "ama@example.com", parentName: "Ama", childName: "Kojo", daysUntilBirthday: 0 },
    ]);
    expect(rows[0]!.metadata).toMatchObject({
      parent_name: "Ama",
      child_name: "Kojo",
      days_until_birthday: "0",
      birthday_countdown: "today",
    });
  });

  it("keeps the child's date of birth so the countdown can be re-derived at send time", () => {
    // Without the date, the only record of when the birthday is is a countdown
    // frozen at list-build time — see the sendTimeTokens tests below.
    const rows = recipientUpsertRows("campaign-1", [
      { email: "ama@example.com", childName: "Kojo", childDateOfBirth: "2022-08-13", daysUntilBirthday: 7 },
    ]);
    expect(rows[0]!.metadata.child_date_of_birth).toBe("2022-08-13");
  });
});

describe("sendTimeTokens", () => {
  it("re-derives the countdown at send time instead of sending a stale one", () => {
    // THE BUG: the recipient metadata froze days_until_birthday and
    // birthday_countdown when the LIST was built. A campaign built on 6 August
    // and scheduled for the 13th emailed "Kojo's birthday is in 7 days" on the
    // morning of the birthday itself.
    const metadata = campaignTokens({
      email: "ama@example.com",
      childName: "Kojo",
      childDateOfBirth: "2022-08-13",
      daysUntilBirthday: 7,
    });
    expect(metadata.birthday_countdown).toBe("in 7 days");

    const sentOn = new Date("2026-08-13T07:15:00Z");
    const fresh = sendTimeTokens(metadata, sentOn);
    expect(fresh.days_until_birthday).toBe("0");
    expect(fresh.birthday_countdown).toBe("today");

    // And the rest of the personalisation is untouched.
    expect(fresh.child_name).toBe("Kojo");
    expect(personalize("{{child_name}}'s birthday is {{birthday_countdown}}", fresh)).toBe(
      "Kojo's birthday is today",
    );
    // The snapshot really was wrong by exactly the scheduling delay.
    expect(personalize("{{birthday_countdown}}", metadata)).toBe("in 7 days");
  });

  it("counts down as the days pass rather than repeating the stored number", () => {
    const metadata = campaignTokens({
      email: "ama@example.com",
      childDateOfBirth: "2022-08-13",
      daysUntilBirthday: 30,
    });
    expect(sendTimeTokens(metadata, new Date("2026-08-12T07:00:00Z")).birthday_countdown).toBe(
      "tomorrow",
    );
    expect(sendTimeTokens(metadata, new Date("2026-08-06T07:00:00Z")).birthday_countdown).toBe(
      "in 7 days",
    );
  });

  it("leaves metadata written before the date was stored exactly as it was", () => {
    // An old row's frozen countdown is the best answer still available for it.
    // Blanking it would put a raw {{birthday_countdown}} in front of a parent.
    const legacy = { parent_name: "Ama", birthday_countdown: "in 3 days", days_until_birthday: "3" };
    expect(sendTimeTokens(legacy, new Date("2026-08-13T07:00:00Z"))).toEqual(legacy);
  });

  it("ignores a stored date that is not a date", () => {
    const metadata = { child_date_of_birth: "not-a-date", birthday_countdown: "in 2 days" };
    expect(sendTimeTokens(metadata, new Date("2026-08-13T07:00:00Z")).birthday_countdown).toBe(
      "in 2 days",
    );
  });

  it("survives no metadata at all", () => {
    expect(sendTimeTokens(null)).toEqual({});
    expect(sendTimeTokens(undefined)).toEqual({});
  });
});

describe("countFamilies", () => {
  it("counts mailboxes, not children", () => {
    // THE BUG: the preview showed "3 families would receive this" for a list of
    // three children who share two parents, so the number promised before the
    // send could never match the number reported after it.
    expect(
      countFamilies([
        { email: "ama@example.com" },
        { email: "AMA@example.com" },
        { email: "kofi@example.com" },
      ]),
    ).toBe(2);
  });

  it("ignores anything that is not an address", () => {
    expect(countFamilies([{ email: "" }, { email: "nope" }])).toBe(0);
  });

  it("agrees with the rows that will actually be saved", () => {
    const recipients = [
      { email: "ama@example.com", childName: "Kojo" },
      { email: "ama@example.com", childName: "Akua" },
      { email: "kofi@example.com", childName: "Yaw" },
    ];
    expect(countFamilies(recipients)).toBe(recipientUpsertRows("c1", recipients).length);
  });
});

describe("acceptedForStamping", () => {
  it("stamps only what the provider actually accepted", () => {
    // THE BUG: the whole batch was stamped sent_at whenever anything at all was
    // accepted, so a rejected address was recorded as emailed and never
    // retried — the honest count sendBulkEmail computes was discarded.
    const batch = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(acceptedForStamping(batch, 2)).toEqual([{ id: "a" }, { id: "b" }]);
  });

  it("stamps nothing when nothing was accepted", () => {
    expect(acceptedForStamping([{ id: "a" }], 0)).toEqual([]);
    expect(acceptedForStamping([{ id: "a" }], -1)).toEqual([]);
    expect(acceptedForStamping([{ id: "a" }], Number.NaN)).toEqual([]);
  });

  it("never stamps more than it was given", () => {
    expect(acceptedForStamping([{ id: "a" }], 99)).toHaveLength(1);
  });
});

describe("chunk", () => {
  it("splits a work list into provider-sized batches", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 10)).toEqual([]);
  });

  it("never produces an infinite loop for a nonsense size", () => {
    expect(chunk([1, 2], 0)).toEqual([[1], [2]]);
  });

  it("matches Resend's documented batch ceiling", () => {
    expect(RESEND_BATCH_LIMIT).toBe(100);
    expect(chunk(Array.from({ length: 250 }, (_, index) => index), RESEND_BATCH_LIMIT)).toHaveLength(3);
  });
});

describe("resolveSendOutcome", () => {
  it("refuses to mark a campaign sent when the send was only simulated", () => {
    // The bug: sendBulkEmail returns { sent: true, simulated: true } when no
    // provider key is configured, the route stamped status='sent' regardless,
    // and the UI discarded the flag. The list then said "sent" for a campaign
    // that never left the building — and the recipient list was gone.
    const outcome = resolveSendOutcome({ sent: true, simulated: true, count: 12 });
    expect(outcome.markSent).toBe(false);
    expect(outcome.simulated).toBe(true);
    expect(outcome.delivered).toBe(0);
    expect(outcome.message).toMatch(/never|simulated/i);
  });

  it("marks a real send sent", () => {
    expect(resolveSendOutcome({ sent: true, count: 12, provider: "resend" })).toEqual({
      markSent: true,
      simulated: false,
      delivered: 12,
      message: null,
    });
  });

  it("does not mark sent when the provider accepted nothing", () => {
    const outcome = resolveSendOutcome({ sent: true, count: 0, provider: "resend" });
    expect(outcome.markSent).toBe(false);
    expect(outcome.message).toBeTruthy();
  });

  it("surfaces the provider's own error", () => {
    const outcome = resolveSendOutcome({ sent: false, error: "Domain is not verified." });
    expect(outcome.markSent).toBe(false);
    expect(outcome.message).toBe("Domain is not verified.");
  });
});

describe("acceptedForStamping — per-recipient transports", () => {
  const batch = [
    { id: "r1", email: "ama@example.test" },
    { id: "r2", email: "kojo@example.test" },
    { id: "r3", email: "efua@example.test" },
  ];

  it("stamps exactly the addresses the provider accepted, not the first N", () => {
    // The SMTP/SendGrid path sends one at a time and knows which bounced, but
    // used to return only a total. Stamping the first N then marked people who
    // were never emailed and left people who were — so the next cron tick
    // mailed the wrong ones again.
    const accepted = acceptedForStamping(batch, 2, [
      "ama@example.test",
      "efua@example.test",
    ]);

    expect(accepted.map((row) => row.id)).toEqual(["r1", "r3"]);
  });

  it("is case- and whitespace-insensitive about addresses", () => {
    const accepted = acceptedForStamping(batch, 1, ["  KOJO@Example.TEST "]);
    expect(accepted.map((row) => row.id)).toEqual(["r2"]);
  });

  it("falls back to the count when the transport only reported a total", () => {
    // Resend's batch endpoint answers with a count, not per-address outcomes.
    expect(acceptedForStamping(batch, 2).map((row) => row.id)).toEqual(["r1", "r2"]);
  });

  it("falls back to the count when no address in the batch matches", () => {
    // Defensive: a mismatch must not silently stamp nobody and strand the
    // whole batch as permanently pending.
    expect(acceptedForStamping(batch, 1, ["nobody@example.test"]).map((r) => r.id)).toEqual([
      "r1",
    ]);
  });

  it("stamps nothing when nothing was delivered", () => {
    expect(acceptedForStamping(batch, 0)).toEqual([]);
  });
});
