import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PATCH /api/admin/customers/[id].
 *
 * The mocks stop at `resolveCustomer` — whether the id is a profile or a legacy
 * members row is that function's problem and is pinned by its own tests. What is
 * pinned here is what the route DOES with the answer, and specifically what it
 * claims to have saved.
 */

const { resolveCustomerMock, writes, failures } = vi.hoisted(() => ({
  resolveCustomerMock: vi.fn(),
  writes: [] as { table: string; values: Record<string, unknown> }[],
  failures: { update: null as string | null },
}));

vi.mock("@/lib/auth", () => ({
  authorizeAdminApi: async () => ({ authorized: true, admin: { userId: "admin-1" } }),
}));

vi.mock("../_customer-record", () => ({ resolveCustomer: resolveCustomerMock }));

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      update: (values: Record<string, unknown>) => ({
        eq: async () => {
          writes.push({ table, values });
          return { error: failures.update ? { message: failures.update } : null };
        },
      }),
      select: () => ({ eq: async () => ({ data: [], error: null }) }),
    }),
  },
}));

import { PATCH } from "./route";

const ID = "11111111-1111-4111-8111-111111111111";

function patch(body: Record<string, unknown>) {
  return PATCH(
    new Request(`https://example.com/api/admin/customers/${ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: ID }) },
  );
}

/** A family who filled in the homepage form and has never signed in. */
function asLead() {
  resolveCustomerMock.mockResolvedValue({
    id: ID,
    userId: null,
    email: "ama@example.com",
    profile: null,
    members: [{ id: ID }],
  });
}

function asCustomer() {
  resolveCustomerMock.mockResolvedValue({
    id: ID,
    userId: ID,
    email: "ama@example.com",
    profile: { user_id: ID },
    members: [],
  });
}

beforeEach(() => {
  writes.length = 0;
  failures.update = null;
  resolveCustomerMock.mockReset();
});

describe("editing a family with no account", () => {
  it("refuses a marketing preference instead of reporting it saved", async () => {
    // THE BUG: a members row has no marketing_status column — that lives on
    // customer_profiles, which cannot exist without an auth user. The route
    // accepted the field, wrote nothing, and answered { saved: true }. An admin
    // could mark a family "Unsubscribed", be told it saved, reopen them and
    // find them subscribable again.
    asLead();

    const response = await patch({
      fullName: "Ama Mensah",
      marketingStatus: "unsubscribed",
    });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.errors.marketingStatus).toMatch(/never signed in/i);
    expect(payload.saved).toBeUndefined();
    // And nothing was written, so the screen and the database still agree.
    expect(writes).toEqual([]);
  });

  it("refuses the parent's own birthday for the same reason", async () => {
    asLead();

    const response = await patch({
      fullName: "Ama Mensah",
      marketingStatus: "unknown",
      dateOfBirth: "1990-04-23",
    });

    expect(response.status).toBe(400);
    expect((await response.json()).errors.dateOfBirth).toMatch(/never signed in/i);
    expect(writes).toEqual([]);
  });

  it("still saves everything a members row can actually hold", async () => {
    asLead();

    const response = await patch({
      fullName: "Ama Mensah",
      phone: "0244000000",
      marketingStatus: "unknown",
      children: [{ firstName: "Kojo", dateOfBirth: "2022-08-13" }],
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ saved: true, id: ID, hasAccount: false });
    expect(writes).toEqual([
      {
        table: "members",
        values: {
          parent_name: "Ama Mensah",
          phone: "0244000000",
          child_first_name: "Kojo",
          child_date_of_birth: "2022-08-13",
        },
      },
    ]);
  });
});

describe("editing a family with an account", () => {
  it("saves the marketing preference and the parent's birthday as before", async () => {
    asCustomer();

    const response = await patch({
      fullName: "Ama Mensah",
      marketingStatus: "unsubscribed",
      dateOfBirth: "1990-04-23",
    });

    expect(response.status).toBe(200);
    expect(writes[0]!.table).toBe("customer_profiles");
    expect(writes[0]!.values).toMatchObject({
      marketing_status: "unsubscribed",
      date_of_birth: "1990-04-23",
    });
  });
});
