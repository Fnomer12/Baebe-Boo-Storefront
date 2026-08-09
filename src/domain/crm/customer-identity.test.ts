import { describe, expect, it } from "vitest";
import {
  childAlreadyRecorded,
  collectChildren,
  childFromMember,
  chooseCanonicalProfile,
  escapeLikePattern,
  fullChildName,
  normalizeEmail,
  planCustomerMerge,
  profileUpdatesFromMember,
  type MemberRow,
  type ProfileRow,
} from "./customer-identity";

function member(overrides: Partial<MemberRow> = {}): MemberRow {
  return {
    id: "member-1",
    email: "ama@example.com",
    parent_name: "Ama Mensah",
    child_first_name: "Kojo",
    child_last_name: "Mensah",
    phone: "0200000000",
    child_date_of_birth: "2022-08-05",
    created_at: "2026-01-01T00:00:00.000Z",
    user_id: null,
    ...overrides,
  };
}

function profile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    user_id: "user-1",
    email: "ama@example.com",
    full_name: null,
    phone: null,
    date_of_birth: null,
    created_at: "2026-02-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("email matching", () => {
  it("escapes the LIKE wildcards that are legal in an email local part", () => {
    // The bug: the detail routes used `.ilike(email)`, so a lookup for
    // ama_1@example.com also matched ama01@example.com — reproduced against
    // production, where hijackermills_7@ returned the row for hijackermills07@.
    expect(escapeLikePattern("ama_1@example.com")).toBe("ama\\_1@example.com");
    expect(escapeLikePattern("100%off@example.com")).toBe("100\\%off@example.com");
    // The escape character itself has to go first or it eats the next escape.
    expect(escapeLikePattern("a\\_b@example.com")).toBe("a\\\\\\_b@example.com");
  });

  it("leaves an ordinary address untouched", () => {
    expect(escapeLikePattern("ama@example.com")).toBe("ama@example.com");
  });

  it("normalises whatever the caller hands over", () => {
    expect(normalizeEmail("  AMA@Example.COM ")).toBe("ama@example.com");
    expect(normalizeEmail(null)).toBe("");
    expect(normalizeEmail(42)).toBe("");
  });
});

describe("chooseCanonicalProfile", () => {
  it("returns the oldest account instead of throwing on a duplicate", () => {
    // The bug: `.maybeSingle()` ERRORS when two rows match, so a customer with
    // two profiles 500'd the detail panel rather than showing either one.
    const older = profile({ user_id: "user-old", created_at: "2025-01-01T00:00:00.000Z" });
    const newer = profile({ user_id: "user-new", created_at: "2026-06-01T00:00:00.000Z" });
    expect(chooseCanonicalProfile([newer, older])?.user_id).toBe("user-old");
  });

  it("prefers an exact email match over a case variant", () => {
    const exact = profile({ user_id: "user-exact", email: "ama@example.com", created_at: "2026-06-01T00:00:00.000Z" });
    const variant = profile({ user_id: "user-variant", email: "AMA@example.com", created_at: "2020-01-01T00:00:00.000Z" });
    expect(chooseCanonicalProfile([variant, exact], "ama@example.com")?.user_id).toBe("user-exact");
  });

  it("is stable when creation timestamps tie or are missing", () => {
    const first = profile({ user_id: "aaa", created_at: null });
    const second = profile({ user_id: "bbb", created_at: null });
    expect(chooseCanonicalProfile([second, first])?.user_id).toBe("aaa");
  });

  it("returns null for no candidates", () => {
    expect(chooseCanonicalProfile([])).toBeNull();
  });
});

describe("planCustomerMerge", () => {
  it("links a member whose email already has an account", () => {
    const plan = planCustomerMerge([member()], [profile({ user_id: "user-9" })]);
    expect(plan.actions).toEqual([
      { kind: "link", memberId: "member-1", email: "ama@example.com", userId: "user-9" },
    ]);
    expect(plan.createEmails).toEqual([]);
  });

  it("matches across case differences", () => {
    const plan = planCustomerMerge(
      [member({ email: "  AMA@Example.com " })],
      [profile({ user_id: "user-9", email: "ama@example.com" })],
    );
    expect(plan.actions[0]).toMatchObject({ kind: "link", userId: "user-9" });
  });

  it("creates ONE auth user for a parent with several children", () => {
    // The bug this guards: a parent with three `members` rows must not end up
    // with three auth users, which is what a naive per-row create would do.
    const plan = planCustomerMerge(
      [
        member({ id: "member-1", child_first_name: "Kojo" }),
        member({ id: "member-2", child_first_name: "Abena" }),
        member({ id: "member-3", child_first_name: "Yaw" }),
      ],
      [],
    );
    expect(plan.createEmails).toEqual(["ama@example.com"]);
    expect(plan.actions.filter((action) => action.kind === "create")).toHaveLength(3);
  });

  it("skips rows that are already linked or have no email", () => {
    const plan = planCustomerMerge(
      [
        member({ id: "member-linked", user_id: "user-7" }),
        member({ id: "member-blank", email: "  " }),
      ],
      [],
    );
    expect(plan.actions).toEqual([
      { kind: "skip", memberId: "member-linked", email: "ama@example.com", reason: "already-linked" },
      { kind: "skip", memberId: "member-blank", email: "", reason: "no-email" },
    ]);
    expect(plan.createEmails).toEqual([]);
  });
});

describe("profileUpdatesFromMember", () => {
  it("fills blanks on the profile", () => {
    expect(profileUpdatesFromMember(member(), { full_name: null, phone: null })).toEqual({
      full_name: "Ama Mensah",
      phone: "0200000000",
    });
  });

  it("never overwrites what the customer maintains themselves", () => {
    // A lead captured on the homepage two years ago must not clobber the phone
    // number the customer corrected in /account last week.
    expect(
      profileUpdatesFromMember(member(), { full_name: "Ama K. Mensah", phone: "0559999999" }),
    ).toEqual({});
  });

  it("treats whitespace on either side as absent", () => {
    expect(
      profileUpdatesFromMember(member({ parent_name: "   " }), { full_name: "   ", phone: "   " }),
    ).toEqual({ phone: "0200000000" });
  });

  it("never copies the child's date of birth onto the parent profile", () => {
    // customer_profiles.date_of_birth is the PARENT's. Copying the child's
    // there is what made the loyalty credit fire for the wrong person.
    expect(profileUpdatesFromMember(member(), { full_name: null, phone: null })).not.toHaveProperty(
      "date_of_birth",
    );
  });
});

describe("children", () => {
  it("builds a child row from the member fields", () => {
    expect(childFromMember(member())).toEqual({ first_name: "Kojo", date_of_birth: "2022-08-05" });
  });

  it("returns null when the member holds no child at all", () => {
    expect(
      childFromMember(member({ child_first_name: "", child_last_name: "", child_date_of_birth: "" })),
    ).toBeNull();
  });

  it("does not add a second copy of a child on a repeat backfill run", () => {
    // --dry-run is the default, so the first real run always follows at least
    // one rehearsal and the script is guaranteed to see its own output.
    const existing = [{ first_name: "Kojo", date_of_birth: "2022-08-05" }];
    expect(childAlreadyRecorded(existing, { first_name: "Kojo Jnr", date_of_birth: "2022-08-05" })).toBe(true);
    expect(childAlreadyRecorded(existing, { first_name: "Abena", date_of_birth: "2024-03-01" })).toBe(false);
  });

  it("falls back to the name when a birthday is missing on either side", () => {
    const existing = [{ first_name: "Kojo", date_of_birth: null }];
    expect(childAlreadyRecorded(existing, { first_name: "kojo", date_of_birth: null })).toBe(true);
    expect(childAlreadyRecorded(existing, { first_name: "", date_of_birth: null })).toBe(false);
  });

  it("shows a child once when they exist in both tables", () => {
    const collected = collectChildren(
      [{ first_name: "Kojo", date_of_birth: "2022-08-05" }],
      [member({ child_first_name: "Kojo", child_date_of_birth: "2022-08-05" }), member({ id: "member-2", child_first_name: "Abena", child_date_of_birth: "2024-03-01" })],
    );
    expect(collected).toEqual([
      { first_name: "Kojo", date_of_birth: "2022-08-05" },
      { first_name: "Abena", date_of_birth: "2024-03-01" },
    ]);
  });

  it("joins the child's names without a stray space", () => {
    expect(fullChildName({ child_first_name: "Kojo", child_last_name: null })).toBe("Kojo");
    expect(fullChildName({ child_first_name: null, child_last_name: null })).toBe("");
  });
});
