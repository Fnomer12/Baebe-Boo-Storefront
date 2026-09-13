import { describe, expect, it, vi } from "vitest";

vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://baebe-boo.jtechinnovations.tech");

import {
  excludeStaffMembers,
  excludeStaffProfiles,
  isStaffCustomerEmail,
} from "@/lib/auth/staff-customers";

describe("staff customer exclusion", () => {
  it("treats synthetic till and admin logins as staff", () => {
    expect(isStaffCustomerEmail("bb1a2b3c@counter.baebe-boo.jtechinnovations.tech")).toBe(true);
    expect(isStaffCustomerEmail("BB1A2B3C@counter.baebe-boo.local")).toBe(true);
    expect(isStaffCustomerEmail("owner@admin.baebe-boo.local")).toBe(true);
    expect(isStaffCustomerEmail("ama@example.com")).toBe(false);
    expect(isStaffCustomerEmail(null)).toBe(false);
  });

  it("drops staff profiles by email or linked staff user id", () => {
    const profiles = [
      { user_id: "staff-1", email: "bb1@counter.baebe-boo.local" },
      { user_id: "staff-2", email: "renamed@example.com" },
      { user_id: "cust-1", email: "ama@example.com" },
    ];
    expect(excludeStaffProfiles(profiles, new Set(["staff-2"]))).toEqual([
      { user_id: "cust-1", email: "ama@example.com" },
    ]);
  });

  it("keeps genuine customers, including staff personal mailboxes", () => {
    const members = [
      { user_id: null as string | null, email: "ama@example.com" },
      { user_id: "staff-1", email: "cashier-personal@example.com" },
    ];
    // Linked to a staff auth account (e.g. family merged into the till login)
    // the row is staff; a personal email with no staff link stays.
    expect(excludeStaffMembers(members, new Set(["staff-1"]))).toEqual([
      { user_id: null, email: "ama@example.com" },
    ]);
    expect(
      excludeStaffMembers(
        [{ user_id: null, email: "cashier-personal@example.com" }],
        new Set(["staff-1"]),
      ),
    ).toHaveLength(1);
  });
});
