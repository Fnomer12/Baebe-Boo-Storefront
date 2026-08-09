/**
 * What a campaign send actually consists of, minus the network.
 *
 * WHY THIS EXISTS
 * ---------------
 * The birthday campaign shipped as a convincing shell:
 *
 *   - `sendBulkEmail` returned `{ sent: true, simulated: true }` whenever no
 *     Resend or SendGrid key was set, the send route stamped `status = 'sent'`
 *     regardless, and the UI dropped the `simulated` flag on the floor. The
 *     screen said "sent" for a campaign that never left the building.
 *   - `personalizeHtml` (now `personalize`, below) substituted `{{child_name}}`
 *     and `{{days_until_birthday}}` into templates that contained neither token,
 *     and `birthdayTemplate()` was called with no arguments — so every parent
 *     received "A birthday is coming up!" with no name in it.
 *   - The recipient upsert used `onConflict: "campaign_id, user_id"`, and
 *     `user_id` is nullable. NULL never conflicts in Postgres, so every save
 *     duplicated every recipient without an account.
 *
 * The substitution, the de-duplication, the batching and the rule about when a
 * campaign may be called "sent" are all pure, so they are pinned here rather
 * than re-argued inside a route that needs a live mailbox to exercise.
 */

import { daysUntilBirthday } from "@/domain/admin-customers";

/** Resend's batch endpoint accepts at most 100 messages per call. */
export const RESEND_BATCH_LIMIT = 100;

export type CampaignRecipient = {
  userId?: string | null;
  email: string;
  parentName?: string;
  childName?: string;
  daysUntilBirthday?: number | null;
  childDateOfBirth?: string | null;
};

/**
 * The tokens a campaign template may use, in the plain language the shop owner
 * sees next to the preview. Keep this in step with `campaignTokens` below —
 * it is what the admin screen lists as "you can use these in the email".
 */
export const CAMPAIGN_TOKENS: readonly { token: string; describes: string }[] = [
  { token: "{{parent_name}}", describes: "The parent's name, e.g. Ama Mensah" },
  { token: "{{child_name}}", describes: "The child's first name, e.g. Kojo" },
  { token: "{{days_until_birthday}}", describes: "How many days until the birthday, e.g. 7" },
  { token: "{{birthday_countdown}}", describes: "The countdown in words, e.g. \"in 7 days\" or \"today\"" },
];

/**
 * "today" / "tomorrow" / "in 7 days".
 *
 * A template that reads "the big day is in 0 days" is the kind of detail that
 * makes an automated email obviously automated, and this is the one line of
 * every birthday email a parent actually reads.
 */
export function birthdayCountdown(days: number | null | undefined): string {
  if (typeof days !== "number" || !Number.isFinite(days) || days < 0) return "coming up";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${Math.round(days)} days`;
}

/**
 * The substitution values for one recipient, as stored in
 * `campaign_recipients.metadata`.
 *
 * `child_date_of_birth` is carried alongside the countdown deliberately. The
 * countdown here is only a snapshot of the moment the LIST was built; the
 * date of birth is the fact it was derived from, and it is what
 * `sendTimeTokens` re-derives the countdown from when the mail actually goes
 * out. See that function for why.
 */
export function campaignTokens(recipient: CampaignRecipient): Record<string, string> {
  const childName = (recipient.childName || "").trim();
  const parentName = (recipient.parentName || "").trim();
  const dateOfBirth = (recipient.childDateOfBirth || "").trim();
  const days = typeof recipient.daysUntilBirthday === "number" ? recipient.daysUntilBirthday : null;

  return {
    // Fallbacks are addressed to a person rather than blank: "Hi ," is worse
    // than "Hi there," and a missing child name must not read as an empty gap
    // in the middle of a sentence.
    parent_name: parentName || "there",
    child_name: childName || "your little one",
    days_until_birthday: days === null ? "" : String(days),
    birthday_countdown: birthdayCountdown(days),
    child_date_of_birth: dateOfBirth,
  };
}

/**
 * The substitution values as they are true AT SEND TIME.
 *
 * THE BUG THIS FIXES
 * ------------------
 * `days_until_birthday` and `birthday_countdown` were frozen into the metadata
 * when the admin built the list and then sent verbatim, however much later the
 * send happened. Schedule a campaign on Monday for the following Monday and
 * every parent received "Kojo's birthday is in 7 days" on the morning of the
 * birthday itself. The whole point of the countdown is that it is the one line
 * of the email a parent reads, so a stale one is worse than none.
 *
 * The stored date of birth is the fact; the countdown is a derivation of it and
 * `now`. Deriving it here means the delay between building a list and sending
 * it — a schedule, a retry the next morning, a batch that spilled to the next
 * cron tick — cannot make the email wrong.
 *
 * Metadata that predates the `child_date_of_birth` key is left exactly as it
 * was: an old row's frozen countdown is the best answer still available for it,
 * and blanking it would put "{{birthday_countdown}}" in front of a customer.
 */
export function sendTimeTokens(
  metadata: Record<string, unknown> | null | undefined,
  now = new Date(),
): Record<string, unknown> {
  const values = { ...(metadata || {}) };
  const dateOfBirth = typeof values.child_date_of_birth === "string" ? values.child_date_of_birth.trim() : "";
  if (!dateOfBirth) return values;

  const days = daysUntilBirthday(dateOfBirth, now);
  if (!Number.isFinite(days)) return values;

  values.days_until_birthday = String(days);
  values.birthday_countdown = birthdayCountdown(days);
  return values;
}

/**
 * How many FAMILIES a candidate list will email.
 *
 * One email goes to one mailbox: `recipientUpsertRows` collapses a list on the
 * lower-cased address, so a parent of three children is three candidates and
 * one recipient. Counting the candidates told the admin "12 families would
 * receive this" for a send that reached eight.
 */
export function countFamilies(recipients: readonly { email: string }[]): number {
  const mailboxes = new Set<string>();
  for (const recipient of recipients) {
    const email = String(recipient.email || "").trim().toLowerCase();
    if (email.includes("@")) mailboxes.add(email);
  }
  return mailboxes.size;
}

/**
 * Replace `{{token}}` occurrences in a template — a body or a subject line.
 *
 * Whitespace inside the braces is tolerated because the tokens are typed by
 * hand into a template by someone who is not thinking about a regex. Keys that
 * are not plain identifiers are ignored rather than compiled: metadata is
 * `jsonb` written by a route, and a key of `.*` must not become a pattern that
 * rewrites the entire email.
 *
 * The replacement is a FUNCTION, not a string. `String.replace` treats `$&`,
 * `` $` ``, `$'` and `$1` in a replacement STRING as substitution patterns, and
 * every value substituted here is customer-supplied — the child's name is typed
 * into the unauthenticated "Join the family" form on the homepage. A child
 * named `$&` would otherwise expand to the token itself, and `` $` `` to the
 * entire email up to that point, repeated for every occurrence. A replacer
 * function is returned verbatim, whatever it contains.
 */
export function personalize(template: string, metadata?: Record<string, unknown> | null): string {
  if (!metadata) return template;
  return Object.entries(metadata).reduce((body, [key, value]) => {
    if (!/^[a-z0-9_]+$/i.test(key)) return body;
    const replacement = String(value ?? "");
    return body.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"), () => replacement);
  }, template);
}

/**
 * The same substitution, for an HTML body.
 *
 * Every token value ultimately comes from a customer: the child's name is
 * typed into the public "Join the family" form on the homepage. Dropping that
 * straight into an HTML email is the same mistake `postPurchaseTemplate`
 * already guards against with its own `escapeHtml`, so the values are escaped
 * here and the plain `personalize` is left for subject lines, where an entity
 * would be displayed literally.
 */
export function personalizeHtml(template: string, metadata?: Record<string, unknown> | null): string {
  if (!metadata) return template;
  const escaped: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    escaped[key] = escapeHtml(String(value ?? ""));
  }
  return personalize(template, escaped);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Tokens still unresolved after substitution — what the preview warns about. */
export function unresolvedTokens(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)) {
    found.add(`{{${match[1]}}}`);
  }
  return [...found];
}

export type RecipientUpsertRow = {
  campaign_id: string;
  user_id: string | null;
  email: string;
  metadata: Record<string, string>;
};

/**
 * Build the rows to upsert, one per mailbox.
 *
 * De-duplicating on the lower-cased email — rather than trusting the database
 * constraint — is what actually fixes the duplicate-recipient bug, because the
 * old `onConflict: "campaign_id, user_id"` could not fire for the rows that
 * duplicated: theirs was NULL, and NULL is never equal to NULL. The matching
 * unique index on `(campaign_id, email)` arrives in
 * `20260807_customer_merge_and_schedule.sql`; until it does, this keeps a
 * single save clean on its own.
 */
export function recipientUpsertRows(
  campaignId: string,
  recipients: readonly CampaignRecipient[],
): RecipientUpsertRow[] {
  const byEmail = new Map<string, RecipientUpsertRow>();

  for (const recipient of recipients) {
    const email = String(recipient.email || "").trim().toLowerCase();
    if (!email.includes("@")) continue;

    const row: RecipientUpsertRow = {
      campaign_id: campaignId,
      user_id: recipient.userId || null,
      email,
      metadata: campaignTokens(recipient),
    };

    const existing = byEmail.get(email);
    // Keep whichever copy knows the account, so the send can be attributed.
    if (!existing || (!existing.user_id && row.user_id)) byEmail.set(email, row);
  }

  return [...byEmail.values()];
}

/** Split a work list into batches the provider will accept. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const limit = Math.max(1, Math.floor(size));
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += limit) {
    batches.push(items.slice(index, index + limit));
  }
  return batches;
}

export type BulkSendResult =
  | {
      sent: true;
      simulated?: boolean;
      count: number;
      provider?: string;
      /**
       * The addresses the provider actually accepted, when the transport knows
       * them individually.
       *
       * The per-recipient SMTP and SendGrid paths send one message at a time
       * and therefore know exactly which addresses failed — but they used to
       * return only a total, and the caller stamped the FIRST `count` rows of
       * the batch. With three bounces in the middle of a hundred, that stamped
       * three people who were never emailed and left three who were, so the
       * next cron tick mailed the wrong three again.
       */
      acceptedEmails?: string[];
    }
  | { sent: false; error: string };

export type SendOutcome = {
  /** May the campaign be stamped `status = 'sent'`? */
  markSent: boolean;
  simulated: boolean;
  delivered: number;
  /** Addresses to stamp, when the transport reported them individually. */
  acceptedEmails?: string[];
  /** Non-null whenever the operator needs to be told something. */
  message: string | null;
};

/**
 * Decide what a send result means for the campaign row.
 *
 * The rule that was missing: a simulated send is a success that delivers
 * nothing, and marking the campaign "sent" on the back of one destroys the
 * only record that these people still need to be emailed. This is the same
 * stance `src/lib/auth/login-code-service.ts` takes for sign-in codes, where
 * telling someone to check an inbox that will never receive anything is the
 * exact failure the flow was built to fix.
 */
export function resolveSendOutcome(result: BulkSendResult): SendOutcome {
  if (!result.sent) {
    return {
      markSent: false,
      simulated: false,
      delivered: 0,
      message: result.error || "The email provider rejected the send.",
    };
  }

  if (result.simulated) {
    return {
      markSent: false,
      simulated: true,
      delivered: 0,
      message:
        "Nothing was actually emailed — this site has no working email provider configured, so the send was only simulated. The campaign has been left unsent so you can send it for real once email is set up.",
    };
  }

  if (result.count === 0) {
    return {
      markSent: false,
      simulated: false,
      delivered: 0,
      message: "No emails were accepted by the provider, so the campaign has been left unsent.",
    };
  }

  return {
    markSent: true,
    simulated: false,
    delivered: result.count,
    acceptedEmails: result.acceptedEmails,
    message: null,
  };
}

/**
 * Which of a batch may be stamped `sent_at`.
 *
 * THE BUG THIS FIXES
 * ------------------
 * The dispatcher stamped the WHOLE batch whenever the provider accepted
 * anything at all, throwing away the honest count `sendBulkEmail` had gone to
 * the trouble of computing. Resend answers a batch of a hundred with one object
 * per ACCEPTED message; ninety-nine accepted and one rejected marked all
 * hundred as delivered, and the parent whose message was rejected was recorded
 * as emailed and never retried. The count is the campaign's only record of what
 * really left the building, so it decides what gets stamped.
 *
 * The provider does not say WHICH messages it took, only how many, so the
 * prefix is stamped and the tail is left pending for the next tick. That errs
 * towards a duplicate email rather than a silently dropped one, which for a
 * birthday greeting is the right way round: a parent receiving two is a small
 * embarrassment, a parent receiving none is the failure the campaign exists to
 * prevent.
 */
export function acceptedForStamping<T>(
  batch: readonly T[],
  delivered: number,
  acceptedEmails?: readonly string[],
): T[] {
  // When the transport told us WHICH addresses it accepted, stamp exactly
  // those. The count-prefix below is a fallback for batch transports that
  // only report a total, and it is correct only if failures cluster at the end
  // of the batch — which is an assumption, not a fact.
  //
  // `email` is read structurally rather than demanded in the signature: rows
  // reach this from several shapes, and a caller that cannot supply an email
  // should fall through to the count rather than fail to compile.
  if (acceptedEmails && acceptedEmails.length > 0) {
    const accepted = new Set(
      acceptedEmails.map((email) => String(email).trim().toLowerCase()).filter(Boolean),
    );
    const addressed = batch.filter((row) => {
      const email = (row as { email?: unknown } | null)?.email;
      return typeof email === "string" && accepted.has(email.trim().toLowerCase());
    });
    if (addressed.length > 0) return addressed;
  }
  if (!Number.isFinite(delivered) || delivered <= 0) return [];
  return batch.slice(0, Math.min(Math.floor(delivered), batch.length));
}
