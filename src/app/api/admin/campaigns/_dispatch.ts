import "server-only";

import { sendBulkEmail } from "@/lib/email";
import { birthdayTemplate, reactivationTemplate, welcomeTemplate } from "@/lib/email/templates";
import {
  acceptedForStamping,
  resolveSendOutcome,
  sendTimeTokens,
  RESEND_BATCH_LIMIT,
} from "@/domain/crm/campaign-send";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * One implementation of "send the next batch of this campaign", shared by the
 * admin's Send button and the scheduled dispatcher at
 * `src/app/api/cron/campaigns/route.ts`.
 *
 * It lives under the admin route folder rather than in `src/lib` only because
 * that is the ownership boundary this change was made inside; the cron route
 * imports it by path. If it grows, `src/lib/crm/` is where it belongs.
 *
 * The contract that makes the schedule safe:
 *
 *   - IDEMPOTENT. The work list is `campaign_recipients.sent_at is null`, so a
 *     tick that runs twice does nothing the second time, and a tick that dies
 *     half way leaves the rest of the list still queued.
 *   - BOUNDED. At most `RESEND_BATCH_LIMIT` recipients per call, matching
 *     Resend's batch ceiling, and the caller is told how many are left.
 *
 * Both matter because pg_net is fire-and-forget: it cannot retry, cannot see
 * the response body, and cannot branch on an error. The only recovery
 * mechanism available is "the next tick picks up whatever is still unsent".
 */

export const CAMPAIGN_BATCH_SIZE = RESEND_BATCH_LIMIT;

/** Only birthday campaigns can be built; see `campaigns/route.ts`. */
export function campaignTemplate(campaignType: string): { subject: string; html: string } {
  switch (campaignType) {
    case "birthday":
      return birthdayTemplate();
    case "reengagement":
      return reactivationTemplate();
    default:
      return welcomeTemplate();
  }
}

export type DispatchResult = {
  /** Recipients this call actually delivered to. */
  sent: number;
  /** Recipients still waiting, after this call. */
  remaining: number;
  simulated: boolean;
  status: string;
  /** What to show the operator. Null when everything went as intended. */
  message: string | null;
};

export async function dispatchCampaignBatch(
  campaignId: string,
  campaignType: string,
  batchSize = CAMPAIGN_BATCH_SIZE,
): Promise<DispatchResult> {
  const { data: pending, error } = await supabaseAdmin
    .from("campaign_recipients")
    .select("id, email, metadata")
    .eq("campaign_id", campaignId)
    .is("sent_at", null)
    .order("created_at", { ascending: true })
    .limit(batchSize);
  if (error) throw new Error(error.message);

  const batch = pending || [];
  if (batch.length === 0) {
    // Nothing left. Close the campaign off if it has an audience at all — a
    // campaign with no recipients is not "sent", it was never built.
    const total = await countRecipients(campaignId);
    if (total > 0) {
      await updateCampaign(campaignId, {
        status: "sent",
        sent_at: new Date().toISOString(),
        audience_count: total,
        last_error: null,
      });
      return { sent: 0, remaining: 0, simulated: false, status: "sent", message: null };
    }

    /**
     * An empty campaign is closed off too — as a DRAFT, because it was never
     * built rather than sent.
     *
     * This used to return `status: "draft"` while leaving the row saying
     * `ready`. The cron's work list is `status = 'ready'` with a `scheduled_at`
     * in the past, so a `ready` campaign whose recipient save had failed stayed
     * due forever, was picked up on every tick, and permanently occupied one of
     * the five slots a tick has — starving real campaigns behind it. Demoting
     * it to `draft` takes it off that list and puts it back in front of the
     * admin as the unfinished thing it is.
     */
    const message =
      "This campaign has nobody on its list, so there was nothing to send. It has been put back to draft — build the list again to send it.";
    await updateCampaign(campaignId, {
      status: "draft",
      audience_count: 0,
      last_error: message,
      last_attempted_at: new Date().toISOString(),
    });
    return { sent: 0, remaining: 0, simulated: false, status: "draft", message };
  }

  const template = campaignTemplate(campaignType);
  const sentAt = new Date();
  const outcome = resolveSendOutcome(
    await sendBulkEmail(
      batch.map((recipient) => ({
        email: recipient.email,
        // Re-derived NOW, not read back as it was when the list was built. A
        // campaign scheduled a week ahead would otherwise arrive on the
        // birthday itself announcing that it is "in 7 days".
        metadata: sendTimeTokens(recipient.metadata as Record<string, unknown> | null, sentAt),
      })),
      template.subject,
      template.html,
    ),
  );

  if (!outcome.markSent) {
    // Deliberately leaves sent_at null on every recipient in the batch. The
    // campaign row records why, and the next attempt — a retry by hand or the
    // next cron tick — finds exactly the same work list.
    await updateCampaign(campaignId, {
      last_error: outcome.message,
      last_attempted_at: new Date().toISOString(),
    });
    const remaining = await countPending(campaignId);
    return {
      sent: 0,
      remaining,
      simulated: outcome.simulated,
      status: "ready",
      message: outcome.message,
    };
  }

  const stampedAt = sentAt.toISOString();

  /**
   * Stamp what was actually accepted, not the whole batch.
   *
   * `sendBulkEmail` counts the messages the provider took — Resend answers a
   * batch with one object per accepted message, and the SMTP path counts
   * successes one at a time. Stamping every recipient in the batch regardless
   * threw that count away and recorded rejected addresses as emailed, so the
   * next tick never retried them. Whatever the provider did not take stays on
   * the work list.
   */
  const accepted = acceptedForStamping(batch, outcome.delivered, outcome.acceptedEmails);
  const unconfirmed = batch.length - accepted.length;

  const { error: stampError } = await supabaseAdmin
    .from("campaign_recipients")
    .update({ sent_at: stampedAt })
    .in(
      "id",
      accepted.map((recipient) => recipient.id),
    );
  if (stampError) {
    // The mail is gone and we cannot record it. Say so loudly rather than let
    // the next tick send the same batch again.
    throw new Error(
      `${accepted.length} emails were sent but could not be marked as sent (${stampError.message}). Do not retry until this is fixed.`,
    );
  }

  const remaining = await countPending(campaignId);
  const total = await countRecipients(campaignId);

  // A shortfall is the operator's business: it is the difference between "this
  // campaign went out" and "most of it did, and the rest is queued".
  const message =
    unconfirmed > 0
      ? `The email provider accepted ${accepted.length} of ${batch.length} messages. The other ${unconfirmed} are still queued and will be retried.`
      : null;

  await updateCampaign(campaignId, {
    audience_count: total,
    last_error: message,
    last_attempted_at: stampedAt,
    // Only a campaign with nothing left pending is finished. A batch that was
    // partly rejected leaves `remaining > 0`, so it stays `ready` and the next
    // tick picks the rest up.
    ...(remaining === 0 ? { status: "sent", sent_at: stampedAt } : {}),
  });

  return {
    sent: accepted.length,
    remaining,
    simulated: false,
    status: remaining === 0 ? "sent" : "ready",
    message,
  };
}

async function countPending(campaignId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("campaign_recipients")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .is("sent_at", null);
  return count || 0;
}

export async function countRecipients(campaignId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("campaign_recipients")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId);
  return count || 0;
}

/**
 * Update a campaign, tolerating a database that has not had
 * 20260807_customer_merge_and_schedule.sql applied yet.
 *
 * `last_error` and `last_attempted_at` arrive in that migration. Writing to a
 * column PostgREST does not know about is a 400 for the whole statement, so
 * without this a send would fail outright on an un-migrated database — which is
 * a worse outcome than losing the diagnostic message.
 */
async function updateCampaign(campaignId: string, values: Record<string, unknown>): Promise<void> {
  const { error } = await supabaseAdmin.from("campaigns").update(values).eq("id", campaignId);
  if (!error) return;
  if (!isMissingColumn(error)) throw new Error(error.message);

  const supported = { ...values };
  delete supported.last_error;
  delete supported.last_attempted_at;
  if (Object.keys(supported).length === 0) return;
  const retry = await supabaseAdmin.from("campaigns").update(supported).eq("id", campaignId);
  if (retry.error) throw new Error(retry.error.message);
}

function isMissingColumn(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* does not exist/i.test(error.message || "")
  );
}

/**
 * Send the SMS channel for the next batch of a campaign via FROG by Wigal.
 * SMS delivery is tracked separately from email (`sms_sent_at`) so an operator
 * can send both channels without either one suppressing the other.
 */
export async function dispatchSmsCampaignBatch(
  campaignId: string,
  campaignType: string,
  batchSize = CAMPAIGN_BATCH_SIZE,
): Promise<DispatchResult> {
  const { data: pending, error } = await supabaseAdmin
    .from("campaign_recipients")
    .select("id, email, metadata")
    .eq("campaign_id", campaignId)
    .is("sms_sent_at", null)
    .order("created_at", { ascending: true })
    .limit(batchSize);
  if (error) throw new Error(error.message);

  const batch = pending || [];
  if (batch.length === 0) {
    return { sent: 0, remaining: 0, simulated: false, status: "sent", message: null };
  }

  const template = campaignType === "birthday"
    ? (await import("@/lib/email/templates")).birthdaySmsTemplate()
    : "Baebe Boo has an update for you.";
  const now = new Date();
  const recipients = batch.flatMap((recipient) => {
    const metadata = sendTimeTokens((recipient.metadata || {}) as Record<string, unknown>, now);
    const phone = typeof metadata.phone === "string" ? metadata.phone.trim() : "";
    return phone ? [{ id: recipient.id, phone, metadata }] : [];
  });

  // Numbers absent from the saved audience cannot ever be delivered. Mark them
  // attempted so they do not occupy every future scheduled batch forever.
  const undeliverable = batch.filter((recipient) => {
    const metadata = (recipient.metadata || {}) as Record<string, unknown>;
    return !(typeof metadata.phone === "string" && metadata.phone.trim());
  });
  if (undeliverable.length > 0) {
    const { error: skipError } = await supabaseAdmin
      .from("campaign_recipients")
      .update({ sms_sent_at: now.toISOString() })
      .in("id", undeliverable.map((recipient) => recipient.id));
    if (skipError) throw new Error(skipError.message);
  }

  if (recipients.length === 0) {
    return {
      sent: 0,
      remaining: await countSmsPending(campaignId),
      simulated: false,
      status: "ready",
      message: `${undeliverable.length} recipient${undeliverable.length === 1 ? " has" : "s have"} no valid phone number, so no SMS was sent.`,
    };
  }

  const { sendBulkSms } = await import("@/lib/sms");
  const outcome = await sendBulkSms(
    recipients.map((recipient) => ({ phone: recipient.phone, metadata: recipient.metadata })),
    template,
  );
  if (!outcome.sent) {
    return {
      sent: 0,
      remaining: await countSmsPending(campaignId),
      simulated: false,
      status: "ready",
      message: outcome.error,
    };
  }
  if (outcome.simulated) {
    return {
      sent: 0,
      remaining: await countSmsPending(campaignId),
      simulated: true,
      status: "ready",
      message: "Nothing was sent — FROG is not configured yet. Add FROG_API_KEY, FROG_USERNAME and FROG_SENDER_ID before sending SMS.",
    };
  }

  const acceptedPhones = new Set((outcome.acceptedRecipients || []).map((phone) => phone.trim()));
  const accepted = recipients.filter((recipient) => {
    const normalized = recipient.phone.replace(/\D/g, "");
    return acceptedPhones.has(normalized) || acceptedPhones.has(recipient.phone);
  });
  const stampedIds = accepted.length > 0 ? accepted.map((recipient) => recipient.id) : recipients.slice(0, outcome.count).map((recipient) => recipient.id);
  const { error: stampError } = await supabaseAdmin
    .from("campaign_recipients")
    .update({ sms_sent_at: now.toISOString() })
    .in("id", stampedIds);
  if (stampError) throw new Error(`${stampedIds.length} SMS were sent but could not be marked as sent (${stampError.message}).`);

  const remaining = await countSmsPending(campaignId);
  return {
    sent: stampedIds.length,
    remaining,
    simulated: false,
    status: remaining === 0 ? "sent" : "ready",
    message: undeliverable.length > 0
      ? `${stampedIds.length} SMS sent. ${undeliverable.length} recipient${undeliverable.length === 1 ? " had" : "s had"} no valid phone number.`
      : null,
  };
}

export async function countSmsPending(campaignId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("campaign_recipients")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .is("sms_sent_at", null);
  return count || 0;
}
