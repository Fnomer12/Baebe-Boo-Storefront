import { describe, expect, it } from "vitest";
import { addressMutationSchema } from "@/lib/account/customer-workflows";
import {
  buildAutoSaveAddressPayload,
  composeAddressText,
  normalizeGhanaPhone,
  type SavedAddressSummary,
} from "./account-prefill";

const savedAddress: SavedAddressSummary = {
  id: "a1",
  label: "Home",
  recipientName: "Ama Mensah",
  phone: "+233541234567",
  addressLine1: "12 Palm Street",
  addressLine2: "East Legon",
  city: "Accra",
  region: "Greater Accra",
  digitalAddress: "GA-183-8164",
  deliveryInstructions: "Call at the gate",
  isDefault: true,
};

describe("normalizeGhanaPhone", () => {
  it("accepts the +233 international form", () => {
    expect(normalizeGhanaPhone("+233 54 123 4567")).toBe("+233541234567");
  });

  it("accepts the leading-zero national form", () => {
    expect(normalizeGhanaPhone("0541234567")).toBe("+233541234567");
  });

  it("accepts a bare 233-prefixed number", () => {
    expect(normalizeGhanaPhone("233541234567")).toBe("+233541234567");
  });

  it("rejects short, empty, and missing values", () => {
    expect(normalizeGhanaPhone("54123")).toBeNull();
    expect(normalizeGhanaPhone("")).toBeNull();
    expect(normalizeGhanaPhone(null)).toBeNull();
    expect(normalizeGhanaPhone(undefined)).toBeNull();
  });
});

describe("composeAddressText", () => {
  it("joins the structured parts into one line", () => {
    expect(composeAddressText(savedAddress)).toBe(
      "12 Palm Street, East Legon, Accra, Greater Accra",
    );
  });

  it("skips empty parts", () => {
    expect(composeAddressText({ ...savedAddress, addressLine2: null })).toBe(
      "12 Palm Street, Accra, Greater Accra",
    );
  });
});

describe("buildAutoSaveAddressPayload", () => {
  const base = {
    customerName: "Ama Mensah",
    customerPhone: "+233541234567",
    deliveryAddress: "12 Palm Street\nEast Legon",
    digitalAddress: "ga-183-8164",
    deliveryInstructions: "Call at the gate",
    zoneName: "Accra Central",
    zoneRegions: ["Greater Accra"],
  };

  it("builds a payload the address schema accepts", () => {
    const payload = buildAutoSaveAddressPayload(base);
    expect(payload).not.toBeNull();
    expect(payload).toMatchObject({
      label: "Delivery address",
      recipientName: "Ama Mensah",
      phone: "+233541234567",
      addressLine1: "12 Palm Street",
      addressLine2: "East Legon",
      city: "Accra Central",
      region: "Greater Accra",
      digitalAddress: "GA-183-8164",
      deliveryInstructions: "Call at the gate",
    });
    expect(addressMutationSchema.safeParse(payload).success).toBe(true);
  });

  it("falls back to the zone name when the zone has no regions", () => {
    const payload = buildAutoSaveAddressPayload({ ...base, zoneRegions: [] });
    expect(payload?.region).toBe("Accra Central");
  });

  it("omits an invalid GhanaPost code instead of failing the payload", () => {
    const payload = buildAutoSaveAddressPayload({ ...base, digitalAddress: "not-a-code" });
    expect(payload).not.toBeNull();
    expect(payload?.digitalAddress).toBeUndefined();
    expect(addressMutationSchema.safeParse(payload).success).toBe(true);
  });

  it("returns null when the address is too short to be real", () => {
    expect(buildAutoSaveAddressPayload({ ...base, deliveryAddress: "x" })).toBeNull();
  });

  it("returns null without a zone (no city to store)", () => {
    expect(buildAutoSaveAddressPayload({ ...base, zoneName: null })).toBeNull();
  });

  it("returns null when the phone never validated", () => {
    expect(buildAutoSaveAddressPayload({ ...base, customerPhone: "+23354" })).toBeNull();
  });

  it("wraps an over-long first line at a word boundary and stays schema-valid", () => {
    const longLine = `${"Baobab Close ".repeat(15)}near the school`;
    const payload = buildAutoSaveAddressPayload({ ...base, deliveryAddress: longLine });
    expect(payload).not.toBeNull();
    expect(payload!.addressLine1.length).toBeLessThanOrEqual(160);
    expect(addressMutationSchema.safeParse(payload).success).toBe(true);
  });
});
