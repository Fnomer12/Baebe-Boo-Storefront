import "server-only";

import { createHmac, hkdfSync, randomInt } from "node:crypto";
import { isStaffLoginEmail as isStaffLoginDomain } from "@/lib/auth/login-domains";

/**
 * Pure helpers for customer sign-in codes. Kept free of I/O so the rules that
 * matter — code shape, hashing, and which addresses are barred from a customer
 * session — can be tested directly.
 */

export const loginCodeTtlSeconds = 600; // 10 minutes
export const loginCodeResendSeconds = 60;
export const loginCodeHourlyLimit = 5; // per email
export const loginCodeGlobalHourlyLimit = 500; // circuit breaker for the sending domain
export const loginCodeMaxAttempts = 5;

export function normalizeLoginEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Staff sign in through their own portals and must never get a customer session.
 *
 * The suffix list lives in `login-domains.ts` because it is derived from
 * `NEXT_PUBLIC_SITE_URL` and covers the retired `.local` pair as well — a
 * cashier still provisioned under the old domain must stay barred from a
 * customer session for exactly as long as that address can still sign in.
 *
 * This is only the cheap first pass. The authoritative check is the
 * `is_staff_login_email` RPC, which also covers staff whose login is an ordinary
 * mailbox listed in `admin_users`.
 */
export function isStaffLoginEmail(value: string): boolean {
  return isStaffLoginDomain(normalizeLoginEmail(value));
}

/** Uniform over the full six-digit space, including values with leading zeros. */
export function generateLoginCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Derived from a secret the database never holds, so a dump of `login_codes`
 * cannot be brute-forced offline. `LOGIN_CODE_PEPPER` overrides it when set;
 * otherwise it is derived from the service key, which is already required,
 * already server-only, and never stored in the database.
 */
function loginCodePepper(): Buffer {
  const override = process.env.LOGIN_CODE_PEPPER;
  if (override) return Buffer.from(override, "utf8");
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Cannot derive a login code pepper without SUPABASE_SECRET_KEY.");
  return Buffer.from(hkdfSync("sha256", secret, "baebe-boo", "login-code:v1", 32));
}

/**
 * Keyed on the request id rather than the email, which gives per-row domain
 * separation and lets the verify step carry only `{ requestId, code }` — the
 * caller never has to re-send the address.
 */
export function hashLoginCode(requestId: string, code: string): string {
  return createHmac("sha256", loginCodePepper()).update(`v1:${requestId}:${code}`).digest("hex");
}

export function isLoginCodeShape(value: string): boolean {
  return /^\d{6}$/.test(value);
}
