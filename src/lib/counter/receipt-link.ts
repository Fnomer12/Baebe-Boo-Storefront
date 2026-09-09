import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const FALLBACK_SITE_ORIGIN = "https://baebe-boo.jtechinnovations.tech";
const TOKEN_TTL_SECONDS = 365 * 24 * 60 * 60;

function receiptLinkSecret() {
  return (
    process.env.COUNTER_RECEIPT_QR_SECRET?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    "baebe-boo-development-counter-receipt-secret"
  );
}

function sign(payload: string) {
  return createHmac("sha256", receiptLinkSecret()).update(payload).digest("base64url");
}

function tokenFor(orderNumber: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = Buffer.from(`${orderNumber}\n${expiresAt}`, "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyCounterReceiptToken(orderNumber: string, token: string) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expected = sign(payload);
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
    return false;
  }

  try {
    const decoded = Buffer.from(payload, "base64url").toString("utf8").split("\n");
    const expiresAt = Number(decoded[1]);
    return decoded[0] === orderNumber && Number.isSafeInteger(expiresAt) && expiresAt > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

/** Public digital copy link printed into the counter receipt QR code. */
export function counterReceiptUrl(orderNumber: string) {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || FALLBACK_SITE_ORIGIN).replace(/\/+$/, "");
  return `${origin}/receipt/counter?order=${encodeURIComponent(orderNumber)}&token=${encodeURIComponent(tokenFor(orderNumber))}`;
}
