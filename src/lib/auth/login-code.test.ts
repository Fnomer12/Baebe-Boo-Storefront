import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  generateLoginCode,
  hashLoginCode,
  isLoginCodeShape,
  isStaffLoginEmail,
  normalizeLoginEmail,
} from "./login-code";

const requestId = "6b3f9c1e-5a2d-4f7b-9c11-2f8e7a4d5b60";
const otherRequestId = "0f2e1d3c-4b5a-4c6d-8e9f-1a2b3c4d5e6f";

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

beforeEach(() => {
  process.env.LOGIN_CODE_PEPPER = "test-pepper";
  // The staff domains derive from the site URL at call time. CI pins
  // NEXT_PUBLIC_SITE_URL to a localhost URL, which silently changed what
  // isStaffLoginEmail bars — pin the production host so the assertions mean
  // the same thing everywhere.
  process.env.NEXT_PUBLIC_SITE_URL = "https://baebe-boo.jtechinnovations.tech";
});

afterEach(() => {
  if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
});

describe("normalizeLoginEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeLoginEmail("  A@B.Com ")).toBe("a@b.com");
  });

  it("leaves plus tags alone", () => {
    // a+tag@gmail.com and atag@gmail.com are different Supabase users — folding
    // them would hand one person's session to another.
    expect(normalizeLoginEmail("a+tag@gmail.com")).toBe("a+tag@gmail.com");
    expect(normalizeLoginEmail("first.last@gmail.com")).toBe("first.last@gmail.com");
  });
});

describe("isStaffLoginEmail", () => {
  it("matches the staff domains regardless of case", () => {
    expect(isStaffLoginEmail("boss@ADMIN.BAEBE-BOO.LOCAL")).toBe(true);
    expect(isStaffLoginEmail("till1@counter.baebe-boo.local")).toBe(true);
  });

  it("still bars a cashier left on the retired .local domain", () => {
    // Both suffixes stay barred for as long as both can still sign in. A
    // cashier who has not been migrated yet must not be able to take a customer
    // session at the counter address instead.
    expect(isStaffLoginEmail("bb14228e@counter.baebe-boo.local")).toBe(true);
    expect(isStaffLoginEmail("bb14228e@counter.baebe-boo.jtechinnovations.tech")).toBe(true);
  });

  it("does not match a lookalike domain", () => {
    expect(isStaffLoginEmail("x@admin.baebe-boo.local.evil.com")).toBe(false);
    expect(isStaffLoginEmail("admin.baebe-boo.local@gmail.com")).toBe(false);
  });

  it("treats ordinary customer addresses as customers", () => {
    expect(isStaffLoginEmail("parent@example.com")).toBe(false);
  });
});

describe("generateLoginCode", () => {
  it("always produces six digits", () => {
    for (let index = 0; index < 2000; index += 1) {
      expect(isLoginCodeShape(generateLoginCode())).toBe(true);
    }
  });

  it("can produce codes with a leading zero", () => {
    // Guards against a randomInt(100000, 999999) "fix" that silently drops 10%
    // of the space and makes every code start with 1-9.
    const codes = Array.from({ length: 4000 }, () => generateLoginCode());
    expect(codes.some((code) => code.startsWith("0"))).toBe(true);
    expect(codes.some((code) => code.startsWith("9"))).toBe(true);
  });
});

describe("hashLoginCode", () => {
  it("never returns the code itself", () => {
    expect(hashLoginCode(requestId, "123456")).not.toContain("123456");
  });

  it("is stable and 64 hex characters", () => {
    const digest = hashLoginCode(requestId, "123456");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(hashLoginCode(requestId, "123456")).toBe(digest);
  });

  it("differs per request id, so one row's digest cannot verify another", () => {
    expect(hashLoginCode(requestId, "123456")).not.toBe(hashLoginCode(otherRequestId, "123456"));
  });

  it("differs per code", () => {
    expect(hashLoginCode(requestId, "123456")).not.toBe(hashLoginCode(requestId, "123457"));
  });

  it("differs when the pepper changes", () => {
    const before = hashLoginCode(requestId, "123456");
    process.env.LOGIN_CODE_PEPPER = "a-different-pepper";
    expect(hashLoginCode(requestId, "123456")).not.toBe(before);
  });
});

describe("isLoginCodeShape", () => {
  it("rejects anything that is not exactly six digits", () => {
    expect(isLoginCodeShape("12345")).toBe(false);
    expect(isLoginCodeShape("1234567")).toBe(false);
    expect(isLoginCodeShape("12345a")).toBe(false);
    expect(isLoginCodeShape("")).toBe(false);
    expect(isLoginCodeShape("000000")).toBe(true);
  });
});
