import "server-only";
import { chunk, personalize, type BulkSendResult } from "@/domain/crm/campaign-send";

const FROG_ENDPOINT = "https://frogapi.wigal.com.gh/api/v3/sms/send";
const FROG_BATCH_LIMIT = 100;

export type SmsResult =
  | { sent: true; simulated?: boolean; provider?: string; error?: never }
  | { sent: false; error: string };

export type SmsRecipient = { phone: string; metadata?: Record<string, unknown> };

/** FROG requires all three values to authenticate and identify the sender. */
export function isSmsDeliveryConfigured(): boolean {
  return Boolean(
    process.env.FROG_API_KEY?.trim() &&
      process.env.FROG_USERNAME?.trim() &&
      process.env.FROG_SENDER_ID?.trim(),
  );
}

/**
 * Normalise Ghanaian numbers to the local 0XXXXXXXXX form accepted by FROG.
 * International (+233...) and already-local values are both supported.
 */
export function normalizeGhanaPhone(value: string | null | undefined): string | null {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("233") && digits.length === 12) return `0${digits.slice(3)}`;
  if (digits.startsWith("0") && digits.length === 10) return digits;
  return null;
}

/** Send one SMS via the FROG API. */
export async function sendSms(to: string, message: string): Promise<SmsResult> {
  const destination = normalizeGhanaPhone(to);
  if (!destination) return { sent: false, error: "The recipient phone number is not a valid Ghana number." };
  if (!isSmsDeliveryConfigured()) {
    return { sent: true, simulated: true, provider: "log" };
  }

  try {
    const response = await fetch(FROG_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "API-KEY": process.env.FROG_API_KEY!.trim(),
        USERNAME: process.env.FROG_USERNAME!.trim(),
      },
      body: JSON.stringify({
        senderid: process.env.FROG_SENDER_ID!.trim(),
        destinations: [{ destination, msgid: `BB-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }],
        message,
        smstype: "text",
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      status?: string;
      message?: string;
    };
    if (!response.ok || String(payload.status || "").toUpperCase() !== "ACCEPTD") {
      return {
        sent: false,
        error: payload.message || `FROG rejected the SMS (${response.status}).`,
      };
    }
    return { sent: true, provider: "frog" };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "FROG request failed." };
  }
}

/** Send one personalised SMS per recipient, in bounded FROG batches. */
export async function sendBulkSms(
  recipients: readonly SmsRecipient[],
  message: string,
): Promise<BulkSendResult> {
  if (recipients.length === 0) return { sent: true, count: 0 };
  if (!isSmsDeliveryConfigured()) {
    return { sent: true, simulated: true, count: recipients.length, provider: "log" };
  }

  let successes = 0;
  let lastError: string | null = null;
  const acceptedPhones: string[] = [];
  for (const batch of chunk(recipients, FROG_BATCH_LIMIT)) {
    // FROG's general endpoint shares one body across destinations. Personalise
    // per recipient by sending each message individually; this keeps names
    // private and lets us report exactly which numbers were accepted.
    for (const recipient of batch) {
      const result = await sendSms(
        recipient.phone,
        personalize(message, recipient.metadata),
      );
      if (result.sent && !result.simulated) {
        successes += 1;
        const normalized = normalizeGhanaPhone(recipient.phone);
        if (normalized) acceptedPhones.push(normalized);
      } else if (!result.sent) {
        lastError = result.error;
      }
    }
  }

  if (successes === 0) return { sent: false, error: lastError || "FROG accepted none of the SMS messages." };
  return { sent: true, count: successes, provider: "frog", acceptedRecipients: acceptedPhones };
}
