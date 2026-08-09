import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `loadMembers`, against a stand-in that behaves like PostgREST: it honours
 * `.range()` and `.limit()`, and it has more rows than either default ceiling.
 */

const { table, calls, schema } = vi.hoisted(() => ({
  table: { rows: [] as Record<string, unknown>[] },
  calls: { ranges: [] as [number, number][], limits: [] as number[] },
  schema: { hasUserId: true },
}));

class FakeQuery implements PromiseLike<{ data: unknown; error: unknown }> {
  private wantsUserId = false;
  private matchers: ((row: Record<string, unknown>) => boolean)[] = [];
  private from = 0;
  private to = Number.MAX_SAFE_INTEGER;

  select(columns: string) {
    this.wantsUserId = columns.includes("user_id");
    return this;
  }

  order() {
    return this;
  }

  limit(count: number) {
    calls.limits.push(count);
    this.to = count - 1;
    return this;
  }

  range(from: number, to: number) {
    calls.ranges.push([from, to]);
    this.from = from;
    this.to = to;
    return this;
  }

  in(column: string, values: readonly unknown[]) {
    this.matchers.push((row) => values.includes(row[column]));
    return this;
  }

  private run() {
    if (this.wantsUserId && !schema.hasUserId) {
      return { data: null, error: { code: "42703", message: 'column members.user_id does not exist' } };
    }
    const matched = table.rows.filter((row) => this.matchers.every((matches) => matches(row)));
    return { data: matched.slice(this.from, this.to + 1), error: null };
  }

  then<Result1 = unknown, Result2 = never>(
    onFulfilled?: ((value: { data: unknown; error: unknown }) => Result1 | PromiseLike<Result1>) | null,
    onRejected?: ((reason: unknown) => Result2 | PromiseLike<Result2>) | null,
  ): PromiseLike<Result1 | Result2> {
    return Promise.resolve(this.run()).then(onFulfilled, onRejected);
  }
}

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: { from: () => new FakeQuery() },
}));

import { loadMembers } from "./_customer-record";

function seed(count: number) {
  table.rows = Array.from({ length: count }, (_, index) => ({
    id: `member-${index}`,
    member_code: `BB-${index}`,
    parent_name: `Parent ${index}`,
    child_first_name: "Kojo",
    child_last_name: "Mensah",
    phone: "",
    email: `parent${index}@example.com`,
    child_date_of_birth: "2022-08-13",
    created_at: "2026-01-01T00:00:00.000Z",
    user_id: null,
  }));
}

beforeEach(() => {
  calls.ranges.length = 0;
  calls.limits.length = 0;
  schema.hasUserId = true;
});

describe("loadMembers", () => {
  it("reads past the row ceiling instead of silently truncating", async () => {
    // THE BUG: a flat `.limit(2000)` with no paging — the same silent
    // truncation `loadProfiles` was rewritten to avoid, reintroduced on the
    // leads half of the customer base. The 2001st family is not a slow page;
    // they are missing from the customer list, missing from search and missing
    // from every birthday campaign, with nothing on screen to say so.
    seed(2500);

    const members = await loadMembers();

    expect(members).toHaveLength(2500);
    expect(members.at(-1)!.id).toBe("member-2499");
    // Read in pages rather than one unbounded query.
    expect(calls.ranges.length).toBeGreaterThan(1);
  });

  it("stops as soon as a short page arrives", async () => {
    seed(1200);

    expect(await loadMembers()).toHaveLength(1200);
    expect(calls.ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("asks for nothing when the filter is empty", async () => {
    seed(10);

    expect(await loadMembers({ ids: [] })).toEqual([]);
    expect(calls.ranges).toEqual([]);
  });

  it("still filters while paging", async () => {
    seed(2500);

    const members = await loadMembers({ ids: ["member-7", "member-2400"] });

    expect(members.map((member) => member.id)).toEqual(["member-7", "member-2400"]);
  });

  it("falls back to the pre-migration shape without user_id", async () => {
    // `members.user_id` arrives with 20260807_customer_merge_and_schedule.sql.
    // Selecting it before then is a 400 for the whole query, not an empty
    // result, so the fallback keeps the customers screen alive — and it has to
    // page too.
    schema.hasUserId = false;
    seed(1500);

    const members = await loadMembers();

    expect(members).toHaveLength(1500);
    expect(members.every((member) => member.user_id === null)).toBe(true);
  });
});
