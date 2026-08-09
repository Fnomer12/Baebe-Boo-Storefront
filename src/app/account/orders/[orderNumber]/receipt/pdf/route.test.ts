// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReceiptOrder } from "@/lib/orders/receipt-order";

const mocks = vi.hoisted(() => ({
  authorizeBySession: vi.fn(),
  renderPdf: vi.fn(),
}));

vi.mock("@/lib/orders/receipt-order", () => ({
  authorizeReceiptBySession: mocks.authorizeBySession,
}));
vi.mock("@/lib/pdf/receipt-pdf", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pdf/receipt-pdf")>()),
  renderReceiptPdf: mocks.renderPdf,
}));

import { GET } from "./route";

const ORDER = { orderNumber: "BB-1001" } as ReceiptOrder;
const PDF = Buffer.from("%PDF-1.3 pretend", "utf8");

function call(orderNumber: string) {
  return GET(new Request("https://example.com/account/orders/BB-1001/receipt/pdf"), {
    params: Promise.resolve({ orderNumber }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorizeBySession.mockResolvedValue(ORDER);
  mocks.renderPdf.mockResolvedValue(PDF);
});

describe("the account receipt PDF", () => {
  it("streams the PDF to the customer who owns the order", async () => {
    const response = await call("BB-1001");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PDF);
  });

  it("authorises by session exactly as the receipt page does, and by nothing else", async () => {
    // The download must not be reachable by any route the page is not.
    await call("BB-1001");
    expect(mocks.authorizeBySession).toHaveBeenCalledWith("BB-1001");
  });

  it("answers 404 for an order that belongs to someone else", async () => {
    mocks.authorizeBySession.mockResolvedValue(null);
    const response = await call("BB-9999");
    expect(response.status).toBe(404);
    expect(mocks.renderPdf).not.toHaveBeenCalled();
  });

  it("answers 404 when nobody is signed in", async () => {
    // `authorizeReceiptBySession` returns null with no session, and the route
    // cannot tell that apart from a wrong owner — deliberately.
    mocks.authorizeBySession.mockResolvedValue(null);
    expect((await call("BB-1001")).status).toBe(404);
  });

  it("forbids caching, because the body carries an address and payment references", async () => {
    const response = await call("BB-1001");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("answers 500 without leaking the renderer's error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.renderPdf.mockRejectedValue(new Error("ENOENT /srv/app/fonts"));

    const response = await call("BB-1001");

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("ENOENT");
  });
});
