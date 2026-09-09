// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authorizeMock, fromMock } = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ authorizeAdminApi: authorizeMock }));
vi.mock("@/lib/supabase-admin", () => ({
  isSupabaseAdminConfigured: true,
  supabaseAdmin: { from: fromMock },
}));
vi.mock("@/lib/labels/native-print", () => ({
  buildNativeCalibrationJob: vi.fn(() => Buffer.from("calibration")),
  buildNativeLabelJob: vi.fn(() => Buffer.from("labels")),
}));

import { POST } from "./route";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const VARIANT_ID = "22222222-2222-4222-8222-222222222222";

function mockCatalogue() {
  fromMock.mockImplementation((table: string) => {
    if (table === "products") {
      return {
        select: () => ({
          in: async () => ({
            data: [{ id: PRODUCT_ID, name: "Cloud-Soft Romper" }],
            error: null,
          }),
        }),
      };
    }
    if (table === "product_variants") {
      return {
        select: () => ({
          in: async () => ({
            data: [
              { id: VARIANT_ID, product_id: PRODUCT_ID, sku: "CL-1", title: "Blue", option_values: { color: "Blue" }, price: 89 },
            ],
            error: null,
          }),
        }),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });
}

describe("admin labels route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorizeMock.mockResolvedValue({ authorized: true });
    mockCatalogue();
  });

  it("refuses unauthenticated requests", async () => {
    authorizeMock.mockResolvedValue({
      authorized: false,
      response: new Response("no", { status: 401 }),
    });
    const response = await POST(
      new Request("https://example.com/api/admin/labels", {
        method: "POST",
        body: JSON.stringify({ calibration: true }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("returns the calibration page as a PDF", async () => {
    const response = await POST(
      new Request("https://example.com/api/admin/labels", {
        method: "POST",
        body: JSON.stringify({ calibration: true }),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("returns the calibration payload for the local printer connector", async () => {
    const response = await POST(
      new Request("https://example.com/api/admin/labels", {
        method: "POST",
        body: JSON.stringify({ calibration: true, print: true, transport: "local" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      printed: false,
      transport: "local-bridge",
      jobBase64: Buffer.from("calibration").toString("base64"),
    });
  });

  it("renders one sticker per copy requested", async () => {
    const response = await POST(
      new Request("https://example.com/api/admin/labels", {
        method: "POST",
        body: JSON.stringify({
          items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, copies: 3 }],
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toContain("baebe-boo-labels-3.pdf");
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("answers 400 when nothing in the selection is printable", async () => {
    const response = await POST(
      new Request("https://example.com/api/admin/labels", {
        method: "POST",
        body: JSON.stringify({
          items: [{ productId: "33333333-3333-4333-8333-333333333333" }],
        }),
      }),
    );
    // The catalogue mock knows no such product, so nothing is printable.
    expect(response.status).toBe(400);
  });

  it("rejects an empty selection and an invalid body", async () => {
    const empty = await POST(
      new Request("https://example.com/api/admin/labels", {
        method: "POST",
        body: JSON.stringify({ items: [] }),
      }),
    );
    expect(empty.status).toBe(400);

    const garbage = await POST(
      new Request("https://example.com/api/admin/labels", {
        method: "POST",
        body: "not json",
      }),
    );
    expect(garbage.status).toBe(400);
  });
});
