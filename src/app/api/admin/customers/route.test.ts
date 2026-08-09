import { beforeEach, describe, expect, it, vi } from "vitest";

const { createUserMock, failures, inserts } = vi.hoisted(() => ({
  createUserMock: vi.fn(),
  failures: { profile: null as string | null, child: null as string | null },
  inserts: [] as { table: string; values: Record<string, unknown> }[],
}));

vi.mock("@/lib/auth", () => ({
  authorizeAdminApi: async () => ({ authorized: true, admin: { userId: "admin-1" } }),
}));

vi.mock("./_customer-record", () => ({ loadMembers: async () => [] }));

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    auth: { admin: { createUser: createUserMock } },
    from: (table: string) => ({
      upsert: async (values: Record<string, unknown>) => {
        inserts.push({ table, values });
        return { error: failures.profile ? { message: failures.profile } : null };
      },
      insert: async (values: Record<string, unknown>) => {
        inserts.push({ table, values });
        return { error: failures.child ? { message: failures.child, code: "23502" } : null };
      },
    }),
  },
}));

import { POST } from "./route";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function post(body: Record<string, unknown>) {
  return POST(
    new Request("https://example.com/api/admin/customers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const NEW_CUSTOMER = {
  email: "ama@example.com",
  fullName: "Ama Mensah",
  childFirstName: "Kojo",
  childDateOfBirth: "2022-08-13",
};

beforeEach(() => {
  inserts.length = 0;
  failures.profile = null;
  failures.child = null;
  createUserMock.mockReset();
  createUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
});

describe("creating a customer with a child", () => {
  it("does not report a full success when the child could not be saved", async () => {
    // THE BUG: the `customer_children` insert discarded its error result, so a
    // rejected child write was answered with 201 and a customer id. The child
    // is the whole point of the family record — no child row means no birthday,
    // which means no birthday campaign and no birthday points, and nobody would
    // find out until the birthday had quietly passed.
    failures.child = "null value in column \"first_name\"";

    const response = await post(NEW_CUSTOMER);

    expect(response.status).toBe(500);
    expect((await response.json()).message).toMatch(/child could not be saved/i);
  });

  it("reports success when the child really was saved", async () => {
    const response = await post(NEW_CUSTOMER);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      customer: { id: USER_ID, email: "ama@example.com" },
    });
    expect(inserts).toContainEqual({
      table: "customer_children",
      values: { user_id: USER_ID, first_name: "Kojo", date_of_birth: "2022-08-13" },
    });
  });

  it("writes no child row at all when none was given", async () => {
    const response = await post({ email: "kofi@example.com", fullName: "Kofi Boateng" });

    expect(response.status).toBe(201);
    expect(inserts.map((write) => write.table)).toEqual(["customer_profiles"]);
  });
});
