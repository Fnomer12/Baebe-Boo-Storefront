import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  orderLookup: vi.fn(),
  claim: vi.fn(),
  release: vi.fn(),
  items: vi.fn(),
  sendEmail: vi.fn(),
  loadReceipt: vi.fn(),
  renderAttachment: vi.fn(),
}));

/**
 * A thin stand-in for the PostgREST builder. `from("orders").update(...)` is
 * used for both the claim and the release, so they are told apart by whether
 * the chain ends in `.is(...)` (claim) or `.eq(...)` (release).
 */
vi.mock("@/lib/supabase-admin", () => ({
  isSupabaseAdminConfigured: true,
  supabaseAdmin: {
    from: (table: string) => ({
      select: () => ({
        // `orders` ends the chain with .maybeSingle(); `order_items` awaits
        // .eq() directly, so that link has to be thenable.
        eq: () =>
          table === "order_items"
            ? mocks.items()
            : { maybeSingle: mocks.orderLookup },
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: () => ({
          is: () => ({ select: mocks.claim }),
          eq: () => {
            mocks.release(patch);
            return Promise.resolve({ data: null, error: null });
          },
        }),
      }),
    }),
  },
}));

vi.mock("@/lib/email", () => ({ sendEmail: mocks.sendEmail }));

// The itemised receipt and the PDF are both loaded through these now, rather
// than the bare `order_items` query this file used to stub.
vi.mock("@/lib/orders/receipt-order", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./receipt-order")>()),
  loadReceiptOrderById: mocks.loadReceipt,
}));
vi.mock("@/lib/orders/receipt-attachment", () => ({
  renderReceiptAttachment: mocks.renderAttachment,
}));

import { sendOrderConfirmation } from "./order-confirmation";
import type { ReceiptOrder } from "./receipt-order";

const ORDER = {
  id: "order-1",
  order_number: "BB-1001",
  customer_name: "Ama Mensah",
  customer_email: "ama@example.com",
  total_amount: 250,
  delivery_address: "Click-and-collect",
  confirmation_email_sent_at: null,
};

const RECEIPT: ReceiptOrder = {
  id: "order-1",
  orderNumber: "BB-1001",
  recordCode: null,
  customerName: "Ama Mensah",
  customerEmail: "ama@example.com",
  customerPhone: "+233240000000",
  deliveryAddress: "Click-and-collect",
  digitalAddress: null,
  orderStatus: "received",
  paymentStatus: "paid",
  orderType: "online",
  totalAmount: 250,
  voucherCredit: 0,
  createdAt: "2026-08-08T21:26:09.387Z",
  shop: null,
  items: [
    { id: "a", productName: "Cotton Sleepsuit", quantity: 2, unitPrice: 100, totalPrice: 200 },
    { id: "b", productName: "Sun Hat", quantity: 1, unitPrice: 50, totalPrice: 50 },
  ],
  payments: [],
  appliedDiscount: 0,
  deliveryFee: 0,
};

const PDF = Buffer.from("%PDF-1.3 pretend", "utf8");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.orderLookup.mockResolvedValue({ data: { ...ORDER }, error: null });
  mocks.claim.mockResolvedValue({ data: [{ id: "order-1" }], error: null });
  mocks.items.mockResolvedValue({
    data: [
      { product_name: "Cotton Sleepsuit", quantity: 2 },
      { product_name: "Sun Hat", quantity: 1 },
    ],
    error: null,
  });
  mocks.sendEmail.mockResolvedValue({ sent: true });
  mocks.loadReceipt.mockResolvedValue({ ...RECEIPT });
  mocks.renderAttachment.mockResolvedValue({
    attachment: {
      filename: "baebe-boo-receipt-BB-1001.pdf",
      content: PDF,
      contentType: "application/pdf",
    },
  });
});

describe("sendOrderConfirmation", () => {
  it("emails the customer once and reports it sent", async () => {
    const result = await sendOrderConfirmation("order-1");

    expect(result).toEqual({ status: "sent", simulated: false });
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail.mock.calls[0][0]).toBe("ama@example.com");
    expect(mocks.sendEmail.mock.calls[0][1]).toContain("BB-1001");
  });

  it("renders a real receipt: line items, quantities and the total", () => {
    return sendOrderConfirmation("order-1").then(() => {
      const html = mocks.sendEmail.mock.calls[0][2] as string;
      expect(html).toContain("Cotton Sleepsuit");
      expect(html).toContain("Sun Hat");
      // The receipt now explains its own total. It used to show names and
      // quantities and a bare figure, so a customer charged GH₵360.75 for a
      // GH₵395 item had nothing to reconcile the two against.
      expect(html).toContain("2 × GH₵100.00");
      expect(html).toContain("Subtotal");
      // The quantity used to render as the literal `&times;` entity, which
      // `stripHtml` does not decode — so every plaintext receipt read
      // "Cotton Sleepsuit &times; 2".
      expect(html).not.toContain("&times;");
      expect(html).toContain("GH₵250.00");
      expect(html).toContain("Ama Mensah");
    });
  });

  it("explains collection rather than printing the address sentinel", async () => {
    await sendOrderConfirmation("order-1");
    const html = mocks.sendEmail.mock.calls[0][2] as string;
    expect(html).toContain("ready to pick up in store");
    expect(html).not.toContain("Delivering to:");
  });

  it("shows the delivery address for a delivery order", async () => {
    mocks.loadReceipt.mockResolvedValue({
      ...RECEIPT,
      deliveryAddress: "12 Oxford St, Osu",
    });
    await sendOrderConfirmation("order-1");
    expect(mocks.sendEmail.mock.calls[0][2]).toContain("Delivering to: 12 Oxford St, Osu");
  });

  it("escapes customer-supplied text instead of injecting it as HTML", async () => {
    mocks.loadReceipt.mockResolvedValue({
      ...RECEIPT,
      customerName: '<img src=x onerror="alert(1)">',
      items: [
        {
          id: "a",
          productName: "<script>alert(1)</script>",
          quantity: 1,
          unitPrice: 10,
          totalPrice: 10,
        },
      ],
    });

    await sendOrderConfirmation("order-1");
    const html = mocks.sendEmail.mock.calls[0][2] as string;
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain('<img src=x onerror="alert(1)">');
    expect(html).toContain("&lt;script&gt;");
  });

  it("claims the send before emailing, so a concurrent caller cannot duplicate it", async () => {
    // The webhook and the browser both reach finalizeVerifiedOrder for the same
    // payment. The loser's conditional UPDATE matches zero rows.
    mocks.claim.mockResolvedValue({ data: [], error: null });

    const result = await sendOrderConfirmation("order-1");

    expect(result).toEqual({ status: "skipped", reason: "already-sent" });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("skips an order that already carries a sent timestamp", async () => {
    mocks.orderLookup.mockResolvedValue({
      data: { ...ORDER, confirmation_email_sent_at: "2026-07-30T10:00:00Z" },
      error: null,
    });

    const result = await sendOrderConfirmation("order-1");

    expect(result).toEqual({ status: "skipped", reason: "already-sent" });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("releases the claim when the provider fails, so a retry can send", async () => {
    mocks.sendEmail.mockResolvedValue({ sent: false, error: "Resend request failed." });

    const result = await sendOrderConfirmation("order-1");

    expect(result).toEqual({ status: "failed", reason: "Resend request failed." });
    // Released back to null rather than left marked as receipted.
    expect(mocks.release).toHaveBeenCalledWith({ confirmation_email_sent_at: null });
  });

  it("does not release the claim on success", async () => {
    await sendOrderConfirmation("order-1");
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("skips a guest order with no email address", async () => {
    mocks.orderLookup.mockResolvedValue({
      data: { ...ORDER, customer_email: "  " },
      error: null,
    });

    const result = await sendOrderConfirmation("order-1");

    expect(result).toEqual({ status: "skipped", reason: "no-email" });
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("reports a simulated send rather than pretending a real one happened", async () => {
    mocks.sendEmail.mockResolvedValue({ sent: true, simulated: true, provider: "log" });
    expect(await sendOrderConfirmation("order-1")).toEqual({
      status: "sent",
      simulated: true,
    });
  });

  it("stays silent when the migration has not been applied", async () => {
    mocks.orderLookup.mockResolvedValue({
      data: null,
      error: { code: "42703", message: 'column "confirmation_email_sent_at" does not exist' },
    });

    const result = await sendOrderConfirmation("order-1");

    expect(result).toEqual({ status: "failed", reason: "confirmation-column-missing" });
    // Sending anyway would mean a duplicate receipt on every webhook retry.
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("never throws, so a paid order is never undone by the email provider", async () => {
    mocks.orderLookup.mockRejectedValue(new Error("socket hang up"));
    await expect(sendOrderConfirmation("order-1")).resolves.toEqual({
      status: "failed",
      reason: "socket hang up",
    });
  });
});

describe("the PDF attachment", () => {
  it("attaches the rendered receipt, named after the order", async () => {
    await sendOrderConfirmation("order-1");

    const options = mocks.sendEmail.mock.calls[0][3];
    expect(options.attachments).toHaveLength(1);
    expect(options.attachments[0].filename).toBe("baebe-boo-receipt-BB-1001.pdf");
    expect(options.attachments[0].contentType).toBe("application/pdf");
  });

  it("tells the customer the PDF is attached only when it actually is", async () => {
    await sendOrderConfirmation("order-1");
    expect(mocks.sendEmail.mock.calls[0][2]).toContain("attached to this email as a PDF");
  });

  it("still sends the receipt when the PDF fails, so a rendering bug never costs the customer their confirmation", async () => {
    mocks.renderAttachment.mockResolvedValue({
      attachment: null,
      reason: "receipt-pdf-timeout-after-5000ms",
    });

    const result = await sendOrderConfirmation("order-1");

    expect(result).toEqual({
      status: "sent",
      simulated: false,
      attachmentFailed: "receipt-pdf-timeout-after-5000ms",
    });
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    // And the copy must not promise a document that is not there.
    expect(mocks.sendEmail.mock.calls[0][2]).not.toContain("attached to this email as a PDF");
    expect(mocks.sendEmail.mock.calls[0][3].attachments).toBeUndefined();
  });

  it("still sends a receipt when the full order could not be loaded, using what the claim already read", async () => {
    mocks.loadReceipt.mockResolvedValue(null);

    const result = await sendOrderConfirmation("order-1");

    expect(result.status).toBe("sent");
    const html = mocks.sendEmail.mock.calls[0][2] as string;
    expect(html).toContain("BB-1001");
    expect(html).toContain("GH₵250.00");
  });

  it("links the public receipt so a guest with no account is not sent to a login page", async () => {
    await sendOrderConfirmation("order-1");
    expect(mocks.sendEmail.mock.calls[0][2]).toContain(
      "/receipt?order=BB-1001&amp;email=ama%40example.com",
    );
  });
});

describe("the claim, once it has been taken", () => {
  it("releases it when the receipt load throws, so an order is never marked as receipted with no email sent", async () => {
    // THE BUG: the release used to fire only when `sendEmail` reported failure.
    // Anything that threw between the claim and the send left the order marked
    // as receipted for ever with no email — and nothing retries a webhook that
    // already answered 200.
    mocks.loadReceipt.mockRejectedValue(new Error("connection reset"));
    mocks.renderAttachment.mockRejectedValue(new Error("should not be reached"));

    const result = await sendOrderConfirmation("order-1");

    expect(result.status).toBe("sent"); // it degraded rather than failing
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("releases it when anything after it throws, not only a rejected provider", async () => {
    mocks.sendEmail.mockRejectedValue(new Error("socket hang up"));

    const result = await sendOrderConfirmation("order-1");

    expect(result).toEqual({ status: "failed", reason: "socket hang up" });
    expect(mocks.release).toHaveBeenCalledWith({ confirmation_email_sent_at: null });
  });

  it("releases it when the attachment step throws rather than returning a reason", async () => {
    // `renderReceiptAttachment` is built never to reject, but this proves the
    // structure holds even if that contract is ever broken.
    mocks.renderAttachment.mockRejectedValue(new Error("out of memory"));

    const result = await sendOrderConfirmation("order-1");

    expect(result).toEqual({ status: "failed", reason: "out of memory" });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledWith({ confirmation_email_sent_at: null });
  });

  it("does not release it on a successful send", async () => {
    await sendOrderConfirmation("order-1");
    expect(mocks.release).not.toHaveBeenCalled();
  });
});
