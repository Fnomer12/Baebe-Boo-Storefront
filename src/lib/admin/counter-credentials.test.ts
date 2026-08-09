import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createUser: vi.fn(),
  updateUserById: vi.fn(),
  deleteUser: vi.fn(),
  listUsers: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  isSupabaseAdminConfigured: true,
  supabaseAdmin: {
    auth: {
      admin: {
        createUser: mocks.createUser,
        updateUserById: mocks.updateUserById,
        deleteUser: mocks.deleteUser,
        listUsers: mocks.listUsers,
      },
    },
  },
}));

import {
  counterEmailForCode,
  generateCounterPassword,
  provisionCounterUser,
  resetCounterUserPassword,
  rotateCounterUserCode,
} from "./counter-credentials";

const PASSWORD_ALPHABET = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{14}$/;

beforeEach(() => {
  // The login address is derived from the site host now, so pin it rather than
  // depending on whatever the test runner inherited.
  process.env.NEXT_PUBLIC_SITE_URL = "https://baebe-boo.jtechinnovations.tech";
  vi.clearAllMocks();
  mocks.createUser.mockResolvedValue({ data: { user: { id: "auth-1" } }, error: null });
  mocks.updateUserById.mockResolvedValue({ data: { user: { id: "auth-1" } }, error: null });
  mocks.deleteUser.mockResolvedValue({ data: { user: null }, error: null });
  mocks.listUsers.mockResolvedValue({ data: { users: [] }, error: null });
});

describe("counterEmailForCode", () => {
  it("matches the address the counter login page derives", () => {
    // Both sides now call the same `login-domains` helper. Asserting the
    // literal here is still worth it: if the derivation ever changes shape, a
    // cashier signs in successfully and is then refused by the counter guard,
    // because `staff_authorizations.email` was written with the old shape.
    expect(counterEmailForCode("BB1A2B3C")).toBe("bb1a2b3c@counter.baebe-boo.jtechinnovations.tech");
  });

  it("lowercases and trims, so a typed-in code still resolves", () => {
    expect(counterEmailForCode("  Bb1A2b3C  ")).toBe("bb1a2b3c@counter.baebe-boo.jtechinnovations.tech");
  });
});

describe("generateCounterPassword", () => {
  it("is 14 characters from the unambiguous alphabet", () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      expect(generateCounterPassword()).toMatch(PASSWORD_ALPHABET);
    }
  });

  it("excludes glyphs a cashier would misread off a slip", () => {
    const sample = Array.from({ length: 200 }, () => generateCounterPassword()).join("");
    for (const forbidden of ["0", "O", "1", "l", "I"]) {
      expect(sample).not.toContain(forbidden);
    }
  });

  it("does not repeat itself", () => {
    const passwords = new Set(Array.from({ length: 100 }, () => generateCounterPassword()));
    expect(passwords.size).toBe(100);
  });
});

describe("provisionCounterUser", () => {
  it("never grants a staff role", async () => {
    // The highest-value assertion here. `private.has_staff_role()` reads
    // app_metadata.staff_role and treats 'owner' as a full administrator, so
    // writing one would hand a cashier owner-level RLS across finance,
    // procurement, vouchers and loyalty.
    await provisionCounterUser({ staffId: "staff-1", staffCode: "BB1A2B3C" });

    const payload = mocks.createUser.mock.calls[0][0] as {
      app_metadata: Record<string, unknown>;
    };
    expect(payload.app_metadata).toEqual({ counter_staff_id: "staff-1" });
    expect(payload.app_metadata).not.toHaveProperty("staff_role");
    expect(payload.app_metadata).not.toHaveProperty("role");
  });

  it("creates a confirmed user at the derived address", async () => {
    const result = await provisionCounterUser({ staffId: "staff-1", staffCode: "BB1A2B3C" });

    const payload = mocks.createUser.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.email).toBe("bb1a2b3c@counter.baebe-boo.jtechinnovations.tech");
    // No mailbox exists at .local, so an unconfirmed user could never confirm.
    expect(payload.email_confirm).toBe(true);
    expect(result.authUserId).toBe("auth-1");
    expect(result.password).toMatch(PASSWORD_ALPHABET);
  });

  it("adopts and resets a leftover login from an interrupted provision", async () => {
    mocks.createUser.mockResolvedValue({
      data: { user: null },
      error: { message: "A user with this email address has already been registered" },
    });
    mocks.listUsers.mockResolvedValue({
      data: { users: [{ id: "auth-existing", email: "bb1a2b3c@counter.baebe-boo.jtechinnovations.tech" }] },
      error: null,
    });

    const result = await provisionCounterUser({ staffId: "staff-1", staffCode: "BB1A2B3C" });

    expect(result.authUserId).toBe("auth-existing");
    expect(mocks.updateUserById).toHaveBeenCalledWith(
      "auth-existing",
      expect.objectContaining({ app_metadata: { counter_staff_id: "staff-1" } }),
    );
  });

  it("fails loudly when the address is taken by someone unfindable", async () => {
    mocks.createUser.mockResolvedValue({
      data: { user: null },
      error: { message: "already registered" },
    });
    mocks.listUsers.mockResolvedValue({ data: { users: [] }, error: null });

    await expect(
      provisionCounterUser({ staffId: "staff-1", staffCode: "BB1A2B3C" }),
    ).rejects.toThrow(/could not be created/i);
  });

  it("surfaces a thrown client error rather than hanging", async () => {
    mocks.createUser.mockRejectedValue(new Error("socket hang up"));
    mocks.listUsers.mockResolvedValue({ data: { users: [] }, error: null });

    await expect(
      provisionCounterUser({ staffId: "staff-1", staffCode: "BB1A2B3C" }),
    ).rejects.toThrow();
  });
});

describe("rotateCounterUserCode", () => {
  it("renames the existing login instead of creating a second one", async () => {
    const result = await rotateCounterUserCode({
      authUserId: "auth-1",
      staffId: "staff-1",
      staffCode: "BBNEWID9",
    });

    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.updateUserById).toHaveBeenCalledWith(
      "auth-1",
      expect.objectContaining({
        email: "bbnewid9@counter.baebe-boo.jtechinnovations.tech",
        email_confirm: true,
      }),
    );
    expect(result.email).toBe("bbnewid9@counter.baebe-boo.jtechinnovations.tech");
    expect(result.password).toMatch(PASSWORD_ALPHABET);
  });

  it("still grants no staff role", async () => {
    await rotateCounterUserCode({
      authUserId: "auth-1",
      staffId: "staff-1",
      staffCode: "BBNEWID9",
    });
    const payload = mocks.updateUserById.mock.calls[0][1] as {
      app_metadata: Record<string, unknown>;
    };
    expect(payload.app_metadata).toEqual({ counter_staff_id: "staff-1" });
  });
});

describe("resetCounterUserPassword", () => {
  it("changes only the password", async () => {
    const result = await resetCounterUserPassword("auth-1");
    expect(mocks.updateUserById).toHaveBeenCalledWith("auth-1", {
      password: expect.stringMatching(PASSWORD_ALPHABET),
    });
    expect(result.password).toMatch(PASSWORD_ALPHABET);
  });

  it("reports a GoTrue failure as an error", async () => {
    mocks.updateUserById.mockResolvedValue({
      data: { user: null },
      error: { message: "user not found" },
    });
    await expect(resetCounterUserPassword("auth-1")).rejects.toThrow(/could not be reset/i);
  });
});
