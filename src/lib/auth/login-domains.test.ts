import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * These read `process.env.NEXT_PUBLIC_SITE_URL` at call time rather than at
 * import time, so each case can set the host it needs. That is also the
 * production behaviour worth pinning: the derivation must not be frozen into a
 * module-level constant that a later `NEXT_PUBLIC_SITE_URL` change silently
 * fails to move.
 */
import {
  adminEmailForUsername,
  adminLoginDomain,
  adminSignInAddresses,
  counterEmailForCode,
  counterLoginDomain,
  counterSignInAddresses,
  hostFromSiteUrl,
  isAdminLoginEmail,
  isCounterLoginEmailForCode,
  isStaffLoginEmail,
  legacyAdminLoginDomain,
  legacyCounterLoginDomain,
  resolveCounterAuthorizationEmail,
  siteHost,
  staffLoginDomains,
} from "./login-domains";

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://baebe-boo.jtechinnovations.tech";
});

afterEach(() => {
  if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
});

describe("hostFromSiteUrl", () => {
  it("takes the host out of a full URL", () => {
    expect(hostFromSiteUrl("https://baebe-boo.jtechinnovations.tech/")).toBe(
      "baebe-boo.jtechinnovations.tech",
    );
  });

  it("accepts a bare host, which is what people actually paste into .env", () => {
    expect(hostFromSiteUrl("baebe-boo.jtechinnovations.tech")).toBe(
      "baebe-boo.jtechinnovations.tech",
    );
  });

  it("drops www so apex and www do not derive two different sign-in addresses", () => {
    expect(hostFromSiteUrl("https://www.baebe-boo.jtechinnovations.tech")).toBe(
      "baebe-boo.jtechinnovations.tech",
    );
  });

  it("ignores a port and a path", () => {
    expect(hostFromSiteUrl("http://localhost:3000/BaebeAdmin")).toBe("localhost");
  });

  it("falls back rather than throwing on junk", () => {
    // A misconfigured env var must not be able to move every staff sign-in
    // address to a domain nobody was ever provisioned under.
    expect(hostFromSiteUrl("://///")).toBe("baebe-boo.jtechinnovations.tech");
    expect(hostFromSiteUrl("")).toBe("baebe-boo.jtechinnovations.tech");
    expect(hostFromSiteUrl(undefined)).toBe("baebe-boo.jtechinnovations.tech");
    expect(hostFromSiteUrl(null)).toBe("baebe-boo.jtechinnovations.tech");
  });
});

describe("siteHost", () => {
  it("tracks NEXT_PUBLIC_SITE_URL at call time", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://shop.example.com";
    expect(siteHost()).toBe("shop.example.com");
    expect(counterLoginDomain()).toBe("counter.shop.example.com");
    expect(adminLoginDomain()).toBe("admin.shop.example.com");
  });
});

describe("counterEmailForCode", () => {
  it("derives from the site host, not the retired .local suffix", () => {
    expect(counterEmailForCode("BB1A2B3C")).toBe(
      "bb1a2b3c@counter.baebe-boo.jtechinnovations.tech",
    );
  });

  it("lowercases and trims, so a code typed on a tablet still resolves", () => {
    expect(counterEmailForCode("  Bb1A2b3C  ")).toBe(
      "bb1a2b3c@counter.baebe-boo.jtechinnovations.tech",
    );
  });
});

describe("counterSignInAddresses", () => {
  it("offers the legacy address as a fallback so no cashier is locked out", () => {
    // The bug this prevents: Adjei and Jack were provisioned under
    // @counter.baebe-boo.local. Deriving only the new address would make their
    // password look wrong from the moment this shipped.
    expect(counterSignInAddresses("BB14228E")).toEqual([
      "bb14228e@counter.baebe-boo.jtechinnovations.tech",
      "bb14228e@counter.baebe-boo.local",
    ]);
  });

  it("does not offer a duplicate when the site host is already the legacy one", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://baebe-boo.local";
    expect(counterSignInAddresses("BB14228E")).toEqual(["bb14228e@counter.baebe-boo.local"]);
  });

  it("is empty for an empty CounterID rather than yielding '@domain'", () => {
    expect(counterSignInAddresses("   ")).toEqual([]);
  });
});

describe("adminEmailForUsername", () => {
  it("expands a short username onto the admin domain", () => {
    expect(adminEmailForUsername("Boss")).toBe("boss@admin.baebe-boo.jtechinnovations.tech");
  });

  it("leaves a real mailbox alone", () => {
    // Admins may be listed in admin_users under an ordinary address; rewriting
    // it would send them to a login that does not exist.
    expect(adminEmailForUsername("owner@example.com")).toBe("owner@example.com");
  });

  it("is empty for empty input", () => {
    expect(adminEmailForUsername("  ")).toBe("");
  });
});

describe("adminSignInAddresses", () => {
  it("tries the new domain then the legacy one for a short username", () => {
    expect(adminSignInAddresses("boss")).toEqual([
      "boss@admin.baebe-boo.jtechinnovations.tech",
      "boss@admin.baebe-boo.local",
    ]);
  });

  it("does not fan a typed mailbox out across staff domains", () => {
    expect(adminSignInAddresses("owner@example.com")).toEqual(["owner@example.com"]);
  });
});

describe("isStaffLoginEmail", () => {
  it("recognises both the current and the legacy staff domains", () => {
    expect(isStaffLoginEmail("boss@ADMIN.BAEBE-BOO.LOCAL")).toBe(true);
    expect(isStaffLoginEmail("till1@counter.baebe-boo.local")).toBe(true);
    expect(isStaffLoginEmail("boss@admin.baebe-boo.jtechinnovations.tech")).toBe(true);
    expect(isStaffLoginEmail("till1@counter.baebe-boo.jtechinnovations.tech")).toBe(true);
  });

  it("does not match a lookalike domain", () => {
    expect(isStaffLoginEmail("x@admin.baebe-boo.local.evil.com")).toBe(false);
    expect(isStaffLoginEmail("admin.baebe-boo.local@gmail.com")).toBe(false);
    expect(isStaffLoginEmail("x@counter.baebe-boo.jtechinnovations.tech.evil.com")).toBe(false);
  });

  it("does not match the bare site host, which is a customer-facing domain", () => {
    expect(isStaffLoginEmail("parent@baebe-boo.jtechinnovations.tech")).toBe(false);
    expect(isStaffLoginEmail("parent@example.com")).toBe(false);
  });

  it("keeps admin and counter apart", () => {
    expect(isAdminLoginEmail("till1@counter.baebe-boo.local")).toBe(false);
    expect(staffLoginDomains()).toContain(legacyAdminLoginDomain);
    expect(staffLoginDomains()).toContain(legacyCounterLoginDomain);
  });
});

describe("isCounterLoginEmailForCode", () => {
  it("matches this CounterID on either domain", () => {
    expect(isCounterLoginEmailForCode("bb14228e@counter.baebe-boo.local", "BB14228E")).toBe(true);
    expect(
      isCounterLoginEmailForCode(
        "bb14228e@counter.baebe-boo.jtechinnovations.tech",
        "bb14228e",
      ),
    ).toBe(true);
  });

  it("rejects another cashier's address on the same domain", () => {
    expect(isCounterLoginEmailForCode("bbffffff@counter.baebe-boo.local", "BB14228E")).toBe(false);
  });

  it("rejects an empty CounterID rather than matching '@domain'", () => {
    expect(isCounterLoginEmailForCode("@counter.baebe-boo.local", "")).toBe(false);
  });
});

describe("resolveCounterAuthorizationEmail", () => {
  it("keeps a legacy address that is still this CounterID's", () => {
    // The lockout this prevents: editing an existing cashier rewrote
    // staff_authorizations.email to the new domain while auth.users.email
    // stayed on .local. is_authorized_counter() compares the JWT email against
    // that row, so the cashier signed in and was then refused by the guard.
    expect(
      resolveCounterAuthorizationEmail("bb14228e@counter.baebe-boo.local", "BB14228E"),
    ).toBe("bb14228e@counter.baebe-boo.local");
  });

  it("derives the current address when there is no authorization row yet", () => {
    // Amanda's case: no staff_authorizations row and no Auth user at all.
    expect(resolveCounterAuthorizationEmail(null, "BB9DE9FC")).toBe(
      "bb9de9fc@counter.baebe-boo.jtechinnovations.tech",
    );
    expect(resolveCounterAuthorizationEmail("", "BB9DE9FC")).toBe(
      "bb9de9fc@counter.baebe-boo.jtechinnovations.tech",
    );
  });

  it("replaces a stale address left behind by an old CounterID", () => {
    expect(
      resolveCounterAuthorizationEmail("bboldcode@counter.baebe-boo.local", "BBNEWID9"),
    ).toBe("bbnewid9@counter.baebe-boo.jtechinnovations.tech");
  });
});
