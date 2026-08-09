import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/auth";
import { isEmailDeliveryConfigured, sendEmail } from "@/lib/email";
import { campaignTokens, personalize, personalizeHtml } from "@/domain/crm/campaign-send";
import { campaignTemplate } from "../_dispatch";

/**
 * Send one copy of the campaign email to the signed-in admin.
 *
 * Always to their own address, never to an address in the request body. A
 * "send a test to…" field would make the admin panel an open mail relay
 * addressed from a verified Baebe Boo domain, which is a spam problem with a
 * customer-facing brand attached to it.
 *
 * It goes through exactly the same render path as a real send —
 * `campaignTemplate` then `personalize` — so what lands in the inbox is what a
 * parent gets, not an approximation of it.
 */
export async function POST(request: Request) {
  const authorization = await authorizeAdminApi("customers:write");
  if (!authorization.authorized) return authorization.response;

  const recipient = String(authorization.admin.email || "").trim();
  if (!recipient) {
    return NextResponse.json(
      { message: "Your admin account has no email address on it, so there is nowhere to send a test." },
      { status: 400 },
    );
  }

  if (!isEmailDeliveryConfigured()) {
    return NextResponse.json(
      {
        message:
          "No email provider is set up on this site, so nothing can be sent — not a test and not a real campaign. Ask your developer to set EMAIL_PROVIDER and the matching API key.",
      },
      { status: 503 },
    );
  }

  let body: { childName?: string; parentName?: string; daysUntilBirthday?: number } = {};
  try {
    body = (await request.json()) || {};
  } catch {
    // A test send with no body is the normal case; sample values fill in.
  }

  const tokens = campaignTokens({
    email: recipient,
    parentName: body.parentName || "Ama Mensah",
    childName: body.childName || "Kojo",
    daysUntilBirthday: typeof body.daysUntilBirthday === "number" ? body.daysUntilBirthday : 7,
  });

  const template = campaignTemplate("birthday");
  const result = await sendEmail(
    recipient,
    `[Test] ${personalize(template.subject, tokens)}`,
    personalizeHtml(template.html, tokens),
  );

  if (!result.sent) {
    return NextResponse.json({ message: result.error }, { status: 502 });
  }
  if (result.simulated) {
    // Same rule as a real send: a simulated success is not a success.
    return NextResponse.json(
      { message: "The email provider is not really configured, so nothing was sent." },
      { status: 503 },
    );
  }

  return NextResponse.json({ sent: true, to: recipient });
}
