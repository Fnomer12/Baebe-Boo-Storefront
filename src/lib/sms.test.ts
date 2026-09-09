import { afterEach, describe, expect, it, vi } from "vitest";
import { isSmsDeliveryConfigured, normalizeGhanaPhone, sendBulkSms, sendSms } from "@/lib/sms";

describe("Frog SMS transport", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("normalizes Ghanaian phone numbers", () => {
    expect(normalizeGhanaPhone("+233 24 123 4567")).toBe("0241234567");
    expect(normalizeGhanaPhone("0241234567")).toBe("0241234567");
    expect(normalizeGhanaPhone("+1 555 123 4567")).toBeNull();
  });

  it("simulates safely until Frog credentials are configured", async () => {
    vi.stubEnv("FROG_API_KEY", "");
    vi.stubEnv("FROG_USERNAME", "");
    vi.stubEnv("FROG_SENDER_ID", "");
    expect(isSmsDeliveryConfigured()).toBe(false);
    expect(await sendSms("0241234567", "Hello")).toMatchObject({ sent: true, simulated: true });
    expect(await sendBulkSms([{ phone: "0241234567" }], "Hello")).toMatchObject({
      sent: true,
      simulated: true,
      count: 1,
    });
  });

  it("accepts Frog's ACCEPTD response", async () => {
    vi.stubEnv("FROG_API_KEY", "key");
    vi.stubEnv("FROG_USERNAME", "user");
    vi.stubEnv("FROG_SENDER_ID", "BaebeBoo");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "ACCEPTD" }), { status: 200 }),
    );
    const result = await sendSms("0241234567", "Hello");
    expect(result).toMatchObject({ sent: true, provider: "frog" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://frogapi.wigal.com.gh/api/v3/sms/send",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
