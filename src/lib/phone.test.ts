import { describe, expect, it } from "vitest";
import {
  formatGhanaPhoneInput,
  isValidGhanaPhone,
  normalizeGhanaPhoneCanonical,
} from "@/lib/phone";

describe("Ghana phone helper", () => {
  it("normalizes the accepted input shapes to +233 form", () => {
    expect(normalizeGhanaPhoneCanonical("+233241234567")).toBe("+233241234567");
    expect(normalizeGhanaPhoneCanonical("+233 24 123 4567")).toBe("+233241234567");
    expect(normalizeGhanaPhoneCanonical("233241234567")).toBe("+233241234567");
    expect(normalizeGhanaPhoneCanonical("0241234567")).toBe("+233241234567");
    expect(normalizeGhanaPhoneCanonical("241234567")).toBe("+233241234567");
  });

  it("rejects incomplete and non-Ghana numbers", () => {
    expect(normalizeGhanaPhoneCanonical("+233")).toBeNull();
    expect(normalizeGhanaPhoneCanonical("02412345")).toBeNull();
    expect(normalizeGhanaPhoneCanonical("+1 555 123 4567")).toBeNull();
    expect(normalizeGhanaPhoneCanonical("")).toBeNull();
    expect(normalizeGhanaPhoneCanonical(null)).toBeNull();
    expect(isValidGhanaPhone("0241234567")).toBe(true);
    expect(isValidGhanaPhone("+233")).toBe(false);
  });

  it("formats live typing with a stable +233 prefix", () => {
    expect(formatGhanaPhoneInput("")).toBe("+233");
    expect(formatGhanaPhoneInput("0241234567")).toBe("+233241234567");
    expect(formatGhanaPhoneInput("+23324123456789")).toBe("+233241234567");
  });
});
