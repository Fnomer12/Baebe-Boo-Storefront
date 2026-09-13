import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdminApi } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";
import { isSmsDeliveryConfigured, normalizeGhanaPhone, sendSms } from "@/lib/sms";
import {
  orderStatusSmsTemplate,
  orderStatusTemplate,
  type OrderStatusKey,
} from "@/lib/email/templates";

const statusSchema = z.object({
  status: z.enum([
    "payment_failed",
    "received",
    "processing",
    "on_hold",
    "dispatched",
    "shipped",
    "delivered",
    "completed",
    "cancelled",
    "refunded",
  ]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("orders:write");
  if (!authorization.authorized) return authorization.response;
  const input = statusSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ message: "Invalid order status." }, { status: 400 });
  }

  const { id } = await params;
  const { error } = await supabaseAdmin.rpc("transition_order", {
    p_order_id: id,
    p_next_status: input.data.status,
  });

  if (error) {
    return NextResponse.json(
      { message: error.message || "Could not update the order." },
      { status: 409 },
    );
  }

  // Status notifications are best-effort and must never fail the update.
  // Only customer-facing transitions notify; payment_failed/received/on_hold
  // are internal steps, not moments the customer waits for.
  const notifyStatus = input.data.status as OrderStatusKey;
  if (
    notifyStatus === "processing" ||
    notifyStatus === "dispatched" ||
    notifyStatus === "shipped" ||
    notifyStatus === "delivered" ||
    notifyStatus === "completed" ||
    notifyStatus === "cancelled" ||
    notifyStatus === "refunded"
  ) {
    try {
      const { data: order } = await supabaseAdmin
        .from("orders")
        .select("order_number, customer_name, customer_email, customer_phone")
        .eq("id", id)
        .maybeSingle();
      const recipient = (order?.customer_email || "").trim();
      const phone = normalizeGhanaPhone(order?.customer_phone);
      const template = orderStatusTemplate(notifyStatus, {
        orderNumber: order?.order_number,
        customerName: order?.customer_name,
      });
      const emailPromise = recipient
        ? sendEmail(recipient, template.subject, template.html).then(
            (result) => ({ result }),
            (sendError) => ({
              result: {
                sent: false as const,
                error: sendError instanceof Error ? sendError.message : "Email send failed.",
              },
            }),
          )
        : Promise.resolve(null);
      const smsPromise =
        phone && isSmsDeliveryConfigured()
          ? sendSms(
              phone,
              orderStatusSmsTemplate(notifyStatus, { orderNumber: order?.order_number }),
            ).then(
              (result) => ({ result }),
              (sendError) => ({
                result: {
                  sent: false as const,
                  error: sendError instanceof Error ? sendError.message : "SMS send failed.",
                },
              }),
            )
          : Promise.resolve(null);
      const [emailOutcome, smsOutcome] = await Promise.all([emailPromise, smsPromise]);
      if (emailOutcome && !emailOutcome.result.sent) {
        console.error("order status notification email failed", {
          orderId: id,
          status: notifyStatus,
          error: emailOutcome.result.error,
        });
      }
      if (smsOutcome && !smsOutcome.result.sent) {
        console.error("order status notification SMS failed", {
          orderId: id,
          status: notifyStatus,
          error: smsOutcome.result.error,
        });
      }
      // A simulated send delivers nothing; surface it like a failure so a
      // misconfigured deployment cannot silently swallow status updates.
      if (
        emailOutcome?.result.sent &&
        "simulated" in emailOutcome.result &&
        emailOutcome.result.simulated
      ) {
        console.error("order status notification email was simulated, not delivered", {
          orderId: id,
          status: notifyStatus,
        });
      }
      if (
        smsOutcome?.result.sent &&
        "simulated" in smsOutcome.result &&
        smsOutcome.result.simulated
      ) {
        console.error("order status notification SMS was simulated, not delivered", {
          orderId: id,
          status: notifyStatus,
        });
      }
    } catch (notifyError) {
      console.error("order status notification failed", {
        orderId: id,
        status: notifyStatus,
        error: notifyError instanceof Error ? notifyError.message : String(notifyError),
      });
    }
  }

  return NextResponse.json({ status: input.data.status });
}
