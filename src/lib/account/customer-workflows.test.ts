import { describe, expect, it } from "vitest";
import {
  addressMutationSchema,
  returnRequestSchema,
  verifiedReviewSchema,
} from "./customer-workflows";

describe("customer workflow validation", () => {
  it("normalizes a GhanaPost address without accepting identity fields", () => {
    const result = addressMutationSchema.parse({
      label: " Home ",
      recipientName: " Ama Mensah ",
      phone: "+233 24 123 4567",
      addressLine1: "12 Independence Avenue",
      city: "Accra",
      region: "Greater Accra",
      digitalAddress: "ga-183-8164",
      isDefault: true,
    });

    expect(result.digitalAddress).toBe("GA-183-8164");
    expect(result.recipientName).toBe("Ama Mensah");
    expect(result).not.toHaveProperty("userId");
  });

  it("rejects duplicate return line items and excessive quantities", () => {
    const itemId = "11111111-1111-4111-8111-111111111111";
    const result = returnRequestSchema.safeParse({
      orderId: "22222222-2222-4222-8222-222222222222",
      reason: "The size was not right for my child.",
      items: [
        { orderItemId: itemId, quantity: 1 },
        { orderItemId: itemId, quantity: 2 },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("requires a useful review body and valid purchase identifiers", () => {
    expect(
      verifiedReviewSchema.safeParse({
        orderId: "not-an-id",
        productId: "also-not-an-id",
        rating: 5,
        body: "Nice",
      }).success,
    ).toBe(false);

    expect(
      verifiedReviewSchema.safeParse({
        orderId: "22222222-2222-4222-8222-222222222222",
        productId: "33333333-3333-4333-8333-333333333333",
        rating: 5,
        title: "A family favourite",
        body: "The quality is excellent and it has held up well to daily use.",
      }).success,
    ).toBe(true);
  });
});
