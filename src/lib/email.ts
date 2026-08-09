import "server-only";
import nodemailer from "nodemailer";
import {
  chunk,
  personalize,
  personalizeHtml,
  RESEND_BATCH_LIMIT,
  type BulkSendResult,
} from "@/domain/crm/campaign-send";

export type SendResult =
  | { sent: true; simulated?: boolean; provider?: string; error?: never }
  | { sent: false; error: string };

/**
 * A file to hang off a single email. Small documents only — a receipt PDF is
 * tens of kilobytes, against Resend's ~40 MB message ceiling.
 */
export type EmailAttachment = {
  /** What the recipient's client shows and saves. */
  filename: string;
  content: Buffer;
  /** SendGrid requires it; Resend and nodemailer infer it from `filename`. */
  contentType?: string;
};

export type SendEmailOptions = {
  /** Plain-text alternative. Derived from `html` when omitted. */
  text?: string;
  attachments?: readonly EmailAttachment[];
  /**
   * Where replies should go. Mail is sent from a `no-reply@` address on the
   * verified sending domain, so without this a customer's reply vanishes.
   * Resend only requires domain verification for `from`, not `reply_to`, so
   * this can be any mailbox that is actually read.
   */
  replyTo?: string;
};

/**
 * Whether a send would actually leave the building.
 *
 * `sendEmail` reports `{ sent: true, simulated: true }` when nothing is
 * configured — a success that delivers nothing. That is tolerable for marketing
 * mail but not for anything the user is told to go and look for, so callers
 * that gate a user flow on delivery should check this first and fail loudly.
 */
export function isEmailDeliveryConfigured(): boolean {
  const provider = process.env.EMAIL_PROVIDER || "log";
  if (provider === "log") return false;
  if (provider === "smtp") return true;
  return Boolean(process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY);
}

/**
 * Send one email.
 *
 * The fourth parameter used to be a bare `text?: string`. It became an options
 * bag when the receipt gained a PDF: a fifth positional would have forced
 * `sendEmail(to, subject, html, undefined, [pdf])` at the one call site that
 * wants an attachment, which is the shape that makes a sixth parameter
 * inevitable. No caller was passing `text`, so nothing had to change.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  options: SendEmailOptions = {},
): Promise<SendResult> {
  const provider = process.env.EMAIL_PROVIDER || "log";

  // SMTP is excluded from the key check on purpose: it authenticates with
  // SMTP_USER/SMTP_PASSWORD, so the old condition made `EMAIL_PROVIDER=smtp`
  // silently simulate every send instead of ever reaching the transport.
  if (!isEmailDeliveryConfigured()) {
    return { sent: true, simulated: true, provider: "log" };
  }

  if (provider === "resend" && process.env.RESEND_API_KEY) {
    return sendResendEmail(to, subject, html, options);
  }

  if (provider === "sendgrid" && process.env.SENDGRID_API_KEY) {
    return sendSendGridEmail(to, subject, html, options);
  }

  if (provider === "smtp") {
    return sendSmtpEmail(to, subject, html, options);
  }

  return { sent: true, simulated: true, provider: "log" };
}

/** The address replies should go to, when one is configured. */
function replyToAddress(options: SendEmailOptions): string | undefined {
  return options.replyTo || process.env.EMAIL_REPLY_TO?.trim() || undefined;
}

/**
 * Send one personalised copy of `html` per recipient.
 *
 * Two bugs lived here. The configured-check was its own copy of the logic in
 * `isEmailDeliveryConfigured` and it EXCLUDED smtp, so `EMAIL_PROVIDER=smtp`
 * silently simulated every campaign it was ever asked to send. And the loop
 * sent one HTTP request per recipient, which for a birthday list is hundreds
 * of round trips inside a single serverless invocation.
 *
 * `simulated` is now load-bearing: `resolveSendOutcome` refuses to mark a
 * campaign sent on the back of it. Never drop the flag.
 *
 * CAMPAIGN MAIL CARRIES NO ATTACHMENTS, DELIBERATELY. There is no parameter for
 * one, and that absence is the enforcement: `sendResendBatch` below builds its
 * own per-recipient bodies, so anything passed in here would be silently
 * dropped rather than sent. A base64 file repeated across a hundred messages in
 * one request is also a real size problem, and attachments on marketing mail
 * are a deliverability liability on a domain that also carries sign-in codes.
 * If this ever has to change, widen `sendResendBatch` in the same commit.
 */
export async function sendBulkEmail(
  recipients: readonly { email: string; metadata?: Record<string, unknown> }[],
  subject: string,
  html: string,
): Promise<BulkSendResult> {
  if (recipients.length === 0) {
    return { sent: true, count: 0 };
  }

  if (!isEmailDeliveryConfigured()) {
    return { sent: true, simulated: true, count: recipients.length, provider: "log" };
  }

  const provider = process.env.EMAIL_PROVIDER || "log";
  if (provider === "resend" && process.env.RESEND_API_KEY) {
    return sendResendBatch(recipients, subject, html);
  }

  // This path sends one message at a time, so it knows exactly which addresses
  // were accepted — record them rather than a bare total. The caller stamps
  // `sent_at` from this, and a count alone made it stamp the first N rows of
  // the batch: with three bounces in the middle of a hundred that marked three
  // people who were never emailed and left three who were, so the next tick
  // mailed the wrong three again.
  const acceptedEmails: string[] = [];
  let lastError: string | null = null;

  for (const recipient of recipients) {
    // The subject is tokenised too — it is the only part of a birthday email
    // a parent sees before deciding whether to open it.
    const result = await sendEmail(
      recipient.email,
      personalize(subject, recipient.metadata),
      personalizeHtml(html, recipient.metadata),
    );
    if (result.sent && !result.simulated) {
      acceptedEmails.push(recipient.email);
    } else if (!result.sent) {
      lastError = result.error;
    }
  }

  if (acceptedEmails.length === 0) {
    return { sent: false, error: lastError || "No emails were accepted by the provider." };
  }

  return { sent: true, count: acceptedEmails.length, acceptedEmails, provider };
}

/**
 * Resend's batch endpoint, which takes up to 100 messages per call.
 *
 * A partial failure still counts what got through: a birthday list where one
 * address bounces at the API must not report the other ninety-nine as unsent,
 * because the caller stamps `sent_at` from that count and the next cron tick
 * would mail them all again.
 */
async function sendResendBatch(
  recipients: readonly { email: string; metadata?: Record<string, unknown> }[],
  subject: string,
  html: string,
): Promise<BulkSendResult> {
  const from = process.env.EMAIL_FROM || "Baebe Boo <hello@baebeeboo.com>";
  const replyTo = process.env.EMAIL_REPLY_TO?.trim();
  let successes = 0;
  let lastError: string | null = null;

  for (const batch of chunk(recipients, RESEND_BATCH_LIMIT)) {
    const body = batch.map((recipient) => {
      const personalised = personalizeHtml(html, recipient.metadata);
      return {
        from,
        to: [recipient.email],
        subject: personalize(subject, recipient.metadata),
        html: personalised,
        text: stripHtml(personalised),
        // A reply path, but still no attachments — see `sendBulkEmail`.
        ...(replyTo ? { reply_to: replyTo } : {}),
      };
    });

    let response: Response;
    try {
      response = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (networkError) {
      lastError = networkError instanceof Error ? networkError.message : "Resend request failed.";
      continue;
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      lastError = String(payload?.message || `Resend rejected the batch (${response.status}).`);
      continue;
    }

    const payload = (await response.json().catch(() => null)) as { data?: unknown[] } | null;
    // Resend answers with one object per accepted message; trust that count
    // rather than the batch length, so a partially accepted batch is honest.
    successes += Array.isArray(payload?.data) ? payload.data.length : batch.length;
  }

  if (successes === 0) {
    return { sent: false, error: lastError || "Resend accepted none of the messages." };
  }

  return { sent: true, count: successes, provider: "resend" };
}

async function sendResendEmail(
  to: string,
  subject: string,
  html: string,
  options: SendEmailOptions,
): Promise<SendResult> {
  const from = process.env.EMAIL_FROM || "Baebe Boo <hello@baebeeboo.com>";
  const replyTo = replyToAddress(options);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    // The optional keys are spread in only when there is something to say, so
    // an ordinary email produces a request byte-identical to the one this code
    // sent before attachments existed.
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      text: options.text ?? stripHtml(html),
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(options.attachments?.length
        ? {
            attachments: options.attachments.map((attachment) => ({
              filename: attachment.filename,
              // Base64 is the only encoding the API accepts for inline content.
              content: attachment.content.toString("base64"),
            })),
          }
        : {}),
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    return { sent: false, error: String(payload?.message || "Resend request failed.") };
  }

  return { sent: true, provider: "resend" };
}

async function sendSendGridEmail(
  to: string,
  subject: string,
  html: string,
  options: SendEmailOptions,
): Promise<SendResult> {
  const from = process.env.EMAIL_FROM || "Baebe Boo <hello@baebeeboo.com>";
  const replyTo = replyToAddress(options);

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: parseEmailAddress(from) },
      subject,
      content: [
        { type: "text/plain", value: options.text ?? stripHtml(html) },
        { type: "text/html", value: html },
      ],
      ...(replyTo ? { reply_to: { email: parseEmailAddress(replyTo) } } : {}),
      ...(options.attachments?.length
        ? {
            attachments: options.attachments.map((attachment) => ({
              filename: attachment.filename,
              content: attachment.content.toString("base64"),
              // SendGrid rejects an attachment with no type, unlike the others.
              type: attachment.contentType ?? "application/octet-stream",
              disposition: "attachment",
            })),
          }
        : {}),
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    return { sent: false, error: String(payload?.message || "SendGrid request failed.") };
  }

  return { sent: true, provider: "sendgrid" };
}

/**
 * SMTP.
 *
 * The catch used to return `{ sent: true, simulated: true }` — a connection
 * refused, a bad password, a rejected recipient, all reported as success. That
 * is how a sign-in code could be "sent" to an inbox it never reached. A failure
 * here is a failure.
 */
async function sendSmtpEmail(
  to: string,
  subject: string,
  html: string,
  options: SendEmailOptions,
): Promise<SendResult> {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
    const replyTo = replyToAddress(options);
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || "Baebe Boo <hello@baebeeboo.com>",
      to,
      subject,
      html,
      text: options.text ?? stripHtml(html),
      ...(replyTo ? { replyTo } : {}),
      // Nodemailer takes the raw Buffer and does its own transfer encoding —
      // handing it base64 would double-encode the file.
      ...(options.attachments?.length
        ? {
            attachments: options.attachments.map((attachment) => ({
              filename: attachment.filename,
              content: attachment.content,
              contentType: attachment.contentType,
            })),
          }
        : {}),
    });
    return { sent: true, provider: "smtp" };
  } catch (smtpError) {
    return {
      sent: false,
      error: smtpError instanceof Error ? smtpError.message : "SMTP delivery failed.",
    };
  }
}

/**
 * The plain-text alternative, derived from the HTML part.
 *
 * `&#39;` and `&quot;` are decoded because `escapeHtml` in the templates emits
 * them: without it a customer named "N'Dri" read as "N&#39;Dri" in every
 * plaintext receipt. Entities the templates do not produce are left alone
 * rather than growing an open-ended decoding table here — templates use real
 * characters (× ’ —) instead, which `templates.test.ts` enforces.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    // Last, or an escaped "&amp;lt;" would decode twice into a real tag.
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseEmailAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return match ? match[1]! : value;
}
