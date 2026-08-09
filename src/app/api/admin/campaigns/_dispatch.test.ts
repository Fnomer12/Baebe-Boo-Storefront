import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The dispatcher, against an in-memory stand-in for the two tables it touches.
 *
 * A fake rather than a per-call stub because every bug here is about what is
 * left BEHIND in the database after a send — which recipients still have a null
 * `sent_at`, what status the campaign row ends up in — and a stub that only
 * records calls cannot answer that.
 */

type Row = Record<string, unknown>;

const { db, sendBulkEmailMock, failures } = vi.hoisted(() => ({
  db: {
    campaign_recipients: [] as Row[],
    campaigns: [] as Row[],
  },
  sendBulkEmailMock: vi.fn(),
  failures: { stamp: null as string | null },
}));

class FakeQuery implements PromiseLike<{ data: unknown; error: unknown; count?: number | null }> {
  private op: "select" | "update" = "select";
  private values: Row = {};
  private matchers: ((row: Row) => boolean)[] = [];
  private countExact = false;
  private head = false;
  private rowLimit: number | null = null;

  constructor(private readonly table: keyof typeof db) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    if (options?.count === "exact") this.countExact = true;
    if (options?.head) this.head = true;
    return this;
  }

  update(values: Row) {
    this.op = "update";
    this.values = values;
    return this;
  }

  eq(column: string, value: unknown) {
    this.matchers.push((row) => row[column] === value);
    return this;
  }

  is(column: string, value: unknown) {
    this.matchers.push((row) => (row[column] ?? null) === value);
    return this;
  }

  in(column: string, values: readonly unknown[]) {
    this.matchers.push((row) => values.includes(row[column]));
    return this;
  }

  order() {
    return this;
  }

  limit(count: number) {
    this.rowLimit = count;
    return this;
  }

  private run() {
    const matched = db[this.table].filter((row) => this.matchers.every((matches) => matches(row)));

    if (this.op === "update") {
      if (this.table === "campaign_recipients" && failures.stamp) {
        return { data: null, error: { message: failures.stamp }, count: null };
      }
      for (const row of matched) Object.assign(row, this.values);
      return { data: null, error: null, count: null };
    }

    if (this.countExact) {
      return { data: this.head ? null : matched, error: null, count: matched.length };
    }

    const rows = this.rowLimit === null ? matched : matched.slice(0, this.rowLimit);
    return { data: rows.map((row) => ({ ...row })), error: null, count: null };
  }

  then<Result1 = { data: unknown; error: unknown }, Result2 = never>(
    onFulfilled?:
      | ((value: { data: unknown; error: unknown; count?: number | null }) => Result1 | PromiseLike<Result1>)
      | null,
    onRejected?: ((reason: unknown) => Result2 | PromiseLike<Result2>) | null,
  ): PromiseLike<Result1 | Result2> {
    return Promise.resolve(this.run()).then(onFulfilled, onRejected);
  }
}

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    from: (table: keyof typeof db) => new FakeQuery(table),
  },
}));

vi.mock("@/lib/email", () => ({
  sendBulkEmail: sendBulkEmailMock,
  isEmailDeliveryConfigured: () => true,
}));

import { dispatchCampaignBatch } from "./_dispatch";

const CAMPAIGN_ID = "campaign-1";

function seedCampaign(overrides: Row = {}) {
  db.campaigns.push({
    id: CAMPAIGN_ID,
    status: "ready",
    campaign_type: "birthday",
    scheduled_at: "2026-08-13T07:00:00.000Z",
    sent_at: null,
    audience_count: 0,
    last_error: null,
    last_attempted_at: null,
    ...overrides,
  });
}

function seedRecipient(id: string, metadata: Row) {
  db.campaign_recipients.push({
    id,
    campaign_id: CAMPAIGN_ID,
    email: `${id}@example.com`,
    metadata,
    sent_at: null,
    created_at: `2026-08-06T0${db.campaign_recipients.length}:00:00.000Z`,
  });
}

function campaignRow() {
  return db.campaigns.find((row) => row.id === CAMPAIGN_ID)!;
}

function pending() {
  return db.campaign_recipients.filter((row) => row.sent_at === null).map((row) => row.id);
}

beforeEach(() => {
  db.campaign_recipients.length = 0;
  db.campaigns.length = 0;
  failures.stamp = null;
  sendBulkEmailMock.mockReset();
  vi.useRealTimers();
});

describe("the countdown is computed when the mail goes out", () => {
  it("does not send a countdown frozen at list-build time", async () => {
    // THE BUG: campaign_recipients.metadata carried days_until_birthday and
    // birthday_countdown as they were when the admin built the list, and the
    // dispatcher passed them to the provider verbatim. A campaign built on 6
    // August and scheduled for the 13th told every parent their child's
    // birthday was "in 7 days" — on the morning of the birthday.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T07:15:00Z"));

    seedCampaign();
    seedRecipient("ama", {
      parent_name: "Ama",
      child_name: "Kojo",
      child_date_of_birth: "2022-08-13",
      // Stale by exactly the scheduling delay.
      days_until_birthday: "7",
      birthday_countdown: "in 7 days",
    });
    sendBulkEmailMock.mockResolvedValue({ sent: true, count: 1, provider: "resend" });

    await dispatchCampaignBatch(CAMPAIGN_ID, "birthday");

    const [recipients] = sendBulkEmailMock.mock.calls[0] as [{ metadata: Row }[]];
    expect(recipients[0]!.metadata.birthday_countdown).toBe("today");
    expect(recipients[0]!.metadata.days_until_birthday).toBe("0");
    // The name is still the one that was saved with the list.
    expect(recipients[0]!.metadata.child_name).toBe("Kojo");
  });

  it("leaves a recipient saved before the date was stored alone", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T07:15:00Z"));

    seedCampaign();
    seedRecipient("legacy", { child_name: "Kojo", birthday_countdown: "in 3 days" });
    sendBulkEmailMock.mockResolvedValue({ sent: true, count: 1, provider: "resend" });

    await dispatchCampaignBatch(CAMPAIGN_ID, "birthday");

    const [recipients] = sendBulkEmailMock.mock.calls[0] as [{ metadata: Row }[]];
    expect(recipients[0]!.metadata.birthday_countdown).toBe("in 3 days");
  });
});

describe("only what was really sent is marked sent", () => {
  it("leaves the recipients the provider did not accept on the work list", async () => {
    // THE BUG: the whole batch was stamped sent_at whenever the provider
    // accepted anything at all. Resend answers a batch with one object per
    // ACCEPTED message, so two accepted out of three marked all three as
    // emailed and the third parent was never retried — the campaign then
    // reported itself fully sent.
    seedCampaign();
    seedRecipient("one", { child_name: "A" });
    seedRecipient("two", { child_name: "B" });
    seedRecipient("three", { child_name: "C" });
    sendBulkEmailMock.mockResolvedValue({ sent: true, count: 2, provider: "resend" });

    const result = await dispatchCampaignBatch(CAMPAIGN_ID, "birthday");

    expect(result.sent).toBe(2);
    expect(result.remaining).toBe(1);
    expect(pending()).toEqual(["three"]);
    // Not finished, so it stays on the cron's work list rather than closing.
    expect(campaignRow().status).toBe("ready");
    expect(campaignRow().sent_at).toBeNull();
    expect(result.message).toMatch(/accepted 2 of 3/i);
    expect(campaignRow().last_error).toMatch(/accepted 2 of 3/i);
  });

  it("closes the campaign when the provider took every message", async () => {
    seedCampaign();
    seedRecipient("one", { child_name: "A" });
    seedRecipient("two", { child_name: "B" });
    sendBulkEmailMock.mockResolvedValue({ sent: true, count: 2, provider: "resend" });

    const result = await dispatchCampaignBatch(CAMPAIGN_ID, "birthday");

    expect(result).toMatchObject({ sent: 2, remaining: 0, status: "sent", message: null });
    expect(pending()).toEqual([]);
    expect(campaignRow().status).toBe("sent");
    expect(campaignRow().last_error).toBeNull();
  });

  it("stamps nothing at all when the send was only simulated", async () => {
    seedCampaign();
    seedRecipient("one", { child_name: "A" });
    sendBulkEmailMock.mockResolvedValue({ sent: true, simulated: true, count: 1, provider: "log" });

    const result = await dispatchCampaignBatch(CAMPAIGN_ID, "birthday");

    expect(result.sent).toBe(0);
    expect(result.simulated).toBe(true);
    expect(pending()).toEqual(["one"]);
    expect(campaignRow().status).toBe("ready");
  });

  it("names only the messages that really went out if they cannot be recorded", async () => {
    seedCampaign();
    seedRecipient("one", { child_name: "A" });
    seedRecipient("two", { child_name: "B" });
    sendBulkEmailMock.mockResolvedValue({ sent: true, count: 1, provider: "resend" });
    failures.stamp = "connection reset";

    await expect(dispatchCampaignBatch(CAMPAIGN_ID, "birthday")).rejects.toThrow(
      /^1 emails were sent but could not be marked as sent/,
    );
  });
});

describe("a campaign with nobody on its list", () => {
  it("is put back to draft instead of staying due forever", async () => {
    // THE BUG: a `ready` campaign with a past scheduled_at and zero recipients
    // was never written to. The cron's work list is exactly that query, so it
    // matched on every tick, for ever, and permanently consumed one of the five
    // campaign slots a tick has — starving whatever was queued behind it.
    seedCampaign({ status: "ready" });

    const result = await dispatchCampaignBatch(CAMPAIGN_ID, "birthday");

    expect(result.status).toBe("draft");
    expect(campaignRow().status).toBe("draft");
    expect(campaignRow().last_error).toMatch(/nobody on its list/i);
    // Not "sent": it was never built.
    expect(campaignRow().sent_at).toBeNull();
    expect(sendBulkEmailMock).not.toHaveBeenCalled();
  });

  it("still closes a campaign whose whole list has already gone out", async () => {
    seedCampaign({ status: "ready" });
    db.campaign_recipients.push({
      id: "done",
      campaign_id: CAMPAIGN_ID,
      email: "done@example.com",
      metadata: {},
      sent_at: "2026-08-13T07:00:00.000Z",
      created_at: "2026-08-06T00:00:00.000Z",
    });

    const result = await dispatchCampaignBatch(CAMPAIGN_ID, "birthday");

    expect(result.status).toBe("sent");
    expect(campaignRow().status).toBe("sent");
    expect(campaignRow().audience_count).toBe(1);
  });
});
