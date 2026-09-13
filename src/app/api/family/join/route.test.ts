import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock, fromMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  isSupabaseAdminConfigured: true,
  supabaseAdmin: { rpc: rpcMock, from: fromMock },
}));

vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => ({ allowed: true }) }));

import { POST } from "./route";

function joinRequest(overrides: Record<string, unknown> = {}) {
  return new Request("https://example.com/api/family/join", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      parentName: "Ama Mensah",
      email: "ama@example.com",
      phone: "0241234567",
      childName: "Kofi Mensah",
      childDateOfBirth: "2022-05-01",
      marketingConsent: true,
      smsConsent: true,
      ...overrides,
    }),
  });
}

describe("family join phone + SMS consent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ error: null });
    fromMock.mockImplementation(() => ({
      insert: async () => ({ error: null }),
    }));
  });

  it("normalizes a local number and records SMS consent", async () => {
    const response = await POST(joinRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.joined).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith(
      "join_family",
      expect.objectContaining({ p_phone: "+233241234567" }),
    );
    expect(fromMock).toHaveBeenCalledWith("customer_consents");
  });

  it("skips the SMS consent row when the customer opts out", async () => {
    const response = await POST(joinRequest({ smsConsent: false }));

    expect(response.status).toBe(200);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects a non-Ghana number", async () => {
    const response = await POST(joinRequest({ phone: "+1 555 123 4567" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toMatch(/family details/i);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
