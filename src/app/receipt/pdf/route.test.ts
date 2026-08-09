// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReceiptOrder } from "@/lib/orders/receipt-order";

const mocks = vi.hoisted(() => ({
  authorizeByEmail: vi.fn(),
  renderPdf: vi.fn(),
}));

vi.mock("@/lib/orders/receipt-order", () => ({
  authorizeReceiptByEmail: mocks.authorizeByEmail,
}));
vi.mock("@/lib/pdf/receipt-pdf", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pdf/receipt-pdf")>()),
  renderReceiptPdf: mocks.renderPdf,
}));

import { GET } from "./route";

const ORDER = { orderNumber: "BB-1001" } as ReceiptOrder;
const PDF = Buffer.from("%PDF-1.3 pretend", "utf8");

function request(query: string) {
  return new Request(`https://example.com/receipt/pdf${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorizeByEmail.mockResolvedValue(ORDER);
  mocks.renderPdf.mockResolvedValue(PDF);
});

describe("the public receipt PDF", () => {
  it("streams the PDF when the order number and checkout email match", async () => {
    const response = await GET(request("?order=BB-1001&email=ama@example.com"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PDF);
  });

  it("names the download after the order", async () => {
    const response = await GET(request("?order=BB-1001&email=ama@example.com"));
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="baebe-boo-receipt-BB-1001.pdf"',
    );
  });

  it("marks the response private and no-store, because it is reachable without a session", async () => {
    // The body carries the customer's name, address, phone and payment
    // references. This header is the only thing stopping a shared cache from
    // holding one customer's receipt and serving it to the next caller.
    const response = await GET(request("?order=BB-1001&email=ama@example.com"));
    expect(response.headers.get("Cache-Control")).toContain("private");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("answers 404 when the email does not match, so the URL is not an order-number oracle", async () => {
    mocks.authorizeByEmail.mockResolvedValue(null);
    const response = await GET(request("?order=BB-1001&email=someone@else.com"));
    expect(response.status).toBe(404);
    expect(mocks.renderPdf).not.toHaveBeenCalled();
  });

  it("answers the same 404 when a parameter is missing, rather than a different error", async () => {
    expect((await GET(request("?order=BB-1001"))).status).toBe(404);
    expect((await GET(request("?email=ama@example.com"))).status).toBe(404);
    expect((await GET(request(""))).status).toBe(404);
    expect(mocks.authorizeByEmail).not.toHaveBeenCalled();
  });

  it("passes the email through untouched, leaving normalisation to the authorizer", async () => {
    await GET(request("?order=BB-1001&email=AMA%40Example.com"));
    expect(mocks.authorizeByEmail).toHaveBeenCalledWith("BB-1001", "AMA@Example.com");
  });

  it("answers 500 without leaking the renderer's error when the PDF cannot be built", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.renderPdf.mockRejectedValue(new Error("fonts are missing from /srv/app"));

    const response = await GET(request("?order=BB-1001&email=ama@example.com"));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.message).toBe("The receipt could not be generated.");
    expect(JSON.stringify(body)).not.toContain("/srv/app");
  });
});
