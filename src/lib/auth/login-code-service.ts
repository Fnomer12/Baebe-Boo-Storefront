import "server-only";

import { randomUUID } from "node:crypto";
import { isEmailDeliveryConfigured, sendEmail } from "@/lib/email";
import {
  loginCodeSmsTemplate,
  loginCodeTemplate,
  staffLoginRedirectSmsTemplate,
  staffLoginRedirectTemplate,
} from "@/lib/email/templates";
import { isSmsDeliveryConfigured, normalizeGhanaPhone, sendSms } from "@/lib/sms";
import { completeCustomerSignIn } from "@/lib/auth/post-sign-in";
import {
  generateLoginCode,
  hashLoginCode,
  isStaffLoginEmail,
  loginCodeGlobalHourlyLimit,
  loginCodeHourlyLimit,
  loginCodeResendSeconds,
  loginCodeTtlSeconds,
  normalizeLoginEmail,
} from "@/lib/auth/login-code";
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type RequestLoginCodeResult =
  | { status: "issued"; requestId: string; expiresInSeconds: number; resendAfterSeconds: number }
  | { status: "suppressed"; requestId: string; expiresInSeconds: number; resendAfterSeconds: number }
  | { status: "unavailable" };

export type VerifyLoginCodeResult =
  | { status: "verified" }
  | { status: "rejected"; attemptsRemaining?: number }
  | { status: "staff" }
  | { status: "unavailable" };

/**
 * Requests a code.
 *
 * Every outcome that depends on the address — unknown account, staff address,
 * cooldown, hourly quota — returns a caller-identical shape. Anything else would
 * turn this endpoint into an account-enumeration oracle. Only conditions that do
 * not depend on the address (misconfiguration) surface as a distinct result.
 */
export async function requestLoginCode(email: string, requestIp: string | null): Promise<RequestLoginCodeResult> {
  if (!isSupabaseAdminConfigured || (!isEmailDeliveryConfigured() && !isSmsDeliveryConfigured())) {
    return { status: "unavailable" };
  }

  const normalized = normalizeLoginEmail(email);
  const requestId = randomUUID();
  const suppressed: RequestLoginCodeResult = {
    status: "suppressed",
    requestId,
    expiresInSeconds: loginCodeTtlSeconds,
    resendAfterSeconds: loginCodeResendSeconds,
  };

  const staff = isStaffLoginEmail(normalized) ? "staff" : await checkStaffAccount(normalized);
  // Cannot prove the address is a customer, so do not mint anything for it.
  if (staff === "unknown") return { status: "unavailable" };
  if (staff === "staff") {
    // Tell the mailbox owner where to sign in, but never tell the caller.
    const staffMail = staffLoginRedirectTemplate();
    const phone = await phoneForEmail(normalized);
    await Promise.all([
      isEmailDeliveryConfigured()
        ? sendEmail(normalized, staffMail.subject, staffMail.html).catch(() => undefined)
        : Promise.resolve(),
      phone && isSmsDeliveryConfigured()
        ? sendSms(phone, staffLoginRedirectSmsTemplate()).catch(() => undefined)
        : Promise.resolve(),
    ]);
    return suppressed;
  }

  const code = generateLoginCode();
  const { data, error } = await supabaseAdmin.rpc("issue_login_code", {
    p_id: requestId,
    p_email: normalized,
    p_code_hash: hashLoginCode(requestId, code),
    p_ttl_seconds: loginCodeTtlSeconds,
    p_cooldown_seconds: loginCodeResendSeconds,
    p_hourly_limit: loginCodeHourlyLimit,
    p_global_hourly_limit: loginCodeGlobalHourlyLimit,
    p_request_ip: requestIp,
  });

  const outcome = Array.isArray(data) ? data[0] : data;
  if (error) return { status: "unavailable" };
  // Cooldown and quota are per-address, so they must look like success.
  if (!outcome || outcome.status !== "issued") return suppressed;

  const mail = loginCodeTemplate(code, Math.round(loginCodeTtlSeconds / 60));
  const expiryMinutes = Math.round(loginCodeTtlSeconds / 60);
  const phone = await phoneForEmail(normalized);
  const [emailDelivery, smsDelivery] = await Promise.all([
    isEmailDeliveryConfigured()
      ? sendEmail(normalized, mail.subject, mail.html)
      : Promise.resolve({ sent: false as const, error: "Email is not configured." }),
    phone && isSmsDeliveryConfigured()
      ? sendSms(phone, loginCodeSmsTemplate(code, expiryMinutes))
      : Promise.resolve({ sent: false as const, error: "SMS is not configured or no phone is on file." }),
  ]);

  // A simulated send is a success that delivers nothing. Telling someone to
  // check an inbox that will never receive anything is the exact failure this
  // flow replaces, so treat it as hard breakage rather than quiet success. A
  // real SMS is an equally valid delivery path when email is unavailable.
  const emailDelivered = emailDelivery.sent && !emailDelivery.simulated;
  const smsDelivered = smsDelivery.sent && !smsDelivery.simulated;
  if (!emailDelivered && !smsDelivered) {
    await invalidate(requestId);
    return { status: "unavailable" };
  }

  return {
    status: "issued",
    requestId,
    expiresInSeconds: loginCodeTtlSeconds,
    resendAfterSeconds: loginCodeResendSeconds,
  };
}

/** Find the best-known phone for an email without exposing it to the client. */
async function phoneForEmail(email: string): Promise<string | null> {
  const [{ data: profile }, { data: member }] = await Promise.all([
    supabaseAdmin
      .from("customer_profiles")
      .select("phone")
      .eq("email", email)
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("members")
      .select("phone")
      .eq("email", email)
      .limit(1)
      .maybeSingle(),
  ]);
  return normalizeGhanaPhone(profile?.phone || member?.phone);
}

export async function verifyLoginCode(
  requestId: string,
  code: string,
  supabaseOverride?: Awaited<ReturnType<typeof createServerSupabaseClient>>,
): Promise<VerifyLoginCodeResult> {
  if (!isSupabaseAdminConfigured) return { status: "unavailable" };

  const { data, error } = await supabaseAdmin.rpc("consume_login_code", {
    p_id: requestId,
    p_code_hash: hashLoginCode(requestId, code),
  });
  const outcome = Array.isArray(data) ? data[0] : data;
  if (error) return { status: "unavailable" };
  if (!outcome || outcome.status !== "consumed" || !outcome.email) {
    return {
      status: "rejected",
      attemptsRemaining: typeof outcome?.attempts_remaining === "number" && outcome.attempts_remaining > 0
        ? outcome.attempts_remaining
        : undefined,
    };
  }

  const email = normalizeLoginEmail(String(outcome.email));
  // Re-checked after consumption: an account can gain staff rights between the
  // code being issued and being used.
  const staff = isStaffLoginEmail(email) ? "staff" : await checkStaffAccount(email);
  if (staff === "staff") return { status: "staff" };
  if (staff === "unknown") return { status: "unavailable" };

  const tokenHash = await mintTokenHash(email);
  if (!tokenHash) return { status: "unavailable" };

  const supabase = supabaseOverride ?? (await createServerSupabaseClient());
  const { data: session, error: verifyError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (verifyError || !session.user) return { status: "unavailable" };

  // Last line of defence, independent of the email conventions above: if the
  // minted session carries staff claims, drop it rather than hand it over.
  const claims = session.user.app_metadata ?? {};
  if (claims.staff_role || claims.counter_staff_id) {
    await supabase.auth.signOut();
    return { status: "staff" };
  }

  await completeCustomerSignIn(supabase);
  return { status: "verified" };
}

/**
 * Authoritative staff check — covers staff whose login is an ordinary mailbox.
 *
 * Tri-state on purpose. Failing closed is right, but "the check could not run"
 * must not be reported as "this is a staff address": that would mail a customer
 * a staff notice and hide a missing migration behind a success response.
 */
async function checkStaffAccount(email: string): Promise<"staff" | "customer" | "unknown"> {
  const { data, error } = await supabaseAdmin.rpc("is_staff_login_email", { p_email: email });
  if (error) return "unknown";
  return data === true ? "staff" : "customer";
}

/**
 * Produces a single-use token for `email` without a password. The account is
 * created on first sign-in, which now happens only after mailbox control has
 * been proven. The token is used immediately and never stored.
 */
async function mintTokenHash(email: string): Promise<string | null> {
  const first = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email });
  if (!first.error && first.data.properties?.hashed_token) {
    return first.data.properties.hashed_token;
  }

  const created = await supabaseAdmin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error && !/already/i.test(created.error.message)) return null;

  const retry = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email });
  if (retry.error || !retry.data.properties?.hashed_token) return null;
  return retry.data.properties.hashed_token;
}

async function invalidate(requestId: string): Promise<void> {
  await supabaseAdmin
    .from("login_codes")
    .update({ invalidated_at: new Date().toISOString() })
    .eq("id", requestId);
}
