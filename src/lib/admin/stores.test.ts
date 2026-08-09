import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Stores and staff, against an in-memory stand-in for PostgREST.
 *
 * The credential flows are the dangerous part of this module: each one deletes
 * and rewrites a `staff_authorizations` row, and that row is the authoritative
 * kill switch behind `is_authorized_counter()`. A fake table rather than a pile
 * of per-call `vi.fn()`s, because the bugs here are about what SURVIVES a
 * rewrite, which only shows up if the rows persist between calls.
 */

type Row = Record<string, unknown>;

const mocks = vi.hoisted(() => {
  const db: Record<string, Row[]> = {};
  /** Injected failures keyed `table:operation`, consumed once. */
  const failures = new Map<string, { code?: string; message: string }>();

  function table(name: string) {
    return (db[name] ??= []);
  }

  function matches(row: Row, filters: [string, unknown][]) {
    return filters.every(([column, value]) => row[column] === value);
  }

  function from(name: string) {
    let operation = "select";
    let payload: Row = {};
    let conflictTarget = "";
    const filters: [string, unknown][] = [];

    function run(mode: "many" | "one") {
      const key = `${name}:${operation}`;
      const failure = failures.get(key);
      if (failure) {
        failures.delete(key);
        return Promise.resolve({ data: null, error: failure });
      }

      const rows = table(name);
      const matched = rows.filter((row) => matches(row, filters));
      let result = matched;

      if (operation === "insert") {
        const row = { id: `${name}-${rows.length + 1}`, ...payload };
        rows.push(row);
        result = [row];
      } else if (operation === "update") {
        for (const row of matched) Object.assign(row, payload);
      } else if (operation === "delete") {
        db[name] = rows.filter((row) => !matches(row, filters));
        result = [];
      } else if (operation === "upsert") {
        const existing = conflictTarget
          ? rows.find((row) => row[conflictTarget] === payload[conflictTarget])
          : undefined;
        if (existing) {
          Object.assign(existing, payload);
          result = [existing];
        } else {
          const row = { id: `${name}-${rows.length + 1}`, ...payload };
          rows.push(row);
          result = [row];
        }
      }

      // Copies, so a caller holding a result cannot mutate the store by accident.
      const data =
        mode === "many"
          ? result.map((row) => ({ ...row }))
          : result[0]
            ? { ...result[0] }
            : null;
      return Promise.resolve({ data, error: null });
    }

    const api = {
      // Column lists are ignored: this fake stores whole rows, and every
      // production select here is a subset of one.
      select: () => api,
      insert: (values: Row) => {
        operation = "insert";
        payload = values;
        return api;
      },
      update: (values: Row) => {
        operation = "update";
        payload = values;
        return api;
      },
      upsert: (values: Row, options?: { onConflict?: string }) => {
        operation = "upsert";
        payload = values;
        conflictTarget = options?.onConflict ?? "";
        return api;
      },
      delete: () => {
        operation = "delete";
        return api;
      },
      eq: (column: string, value: unknown) => {
        filters.push([column, value]);
        return api;
      },
      order: () => api,
      maybeSingle: () => run("one"),
      single: () => run("one"),
      then: (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => run("many").then(resolve, reject),
    };
    return api;
  }

  return {
    db,
    failures,
    from,
    provisionCounterUser: vi.fn(),
    rotateCounterUserCode: vi.fn(),
    resetCounterUserPassword: vi.fn(),
    deleteCounterUser: vi.fn(),
  };
});

vi.mock("@/lib/supabase-admin", () => ({
  isSupabaseAdminConfigured: true,
  supabaseAdmin: { from: mocks.from },
}));

vi.mock("@/lib/admin/counter-credentials", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/admin/counter-credentials")>();
  return {
    ...actual,
    // Only the GoTrue calls are doubled. `counterEmailForCode` and
    // `CounterCredentialError` stay real, because the addresses this module
    // writes are the whole point of several assertions below.
    provisionCounterUser: mocks.provisionCounterUser,
    rotateCounterUserCode: mocks.rotateCounterUserCode,
    resetCounterUserPassword: mocks.resetCounterUserPassword,
    deleteCounterUser: mocks.deleteCounterUser,
  };
});

import { CounterCredentialError } from "@/lib/admin/counter-credentials";
import {
  createStaff,
  patchStaff,
  regenerateStaffCode,
  resetStaffCredentials,
} from "./stores";

const actor = { userId: "admin-1", role: "owner" };
const SHOP_ID = "shop-1";
const STAFF_ID = "staff-1";
const COUNTER_DOMAIN = "counter.baebe-boo.jtechinnovations.tech";

function authorizations() {
  return mocks.db.staff_authorizations ?? [];
}

function authorizationFor(staffId = STAFF_ID) {
  return authorizations().find((row) => row.staff_id === staffId);
}

function staffRow(staffId = STAFF_ID) {
  return (mocks.db.shop_staff ?? []).find((row) => row.id === staffId);
}

/** One store, one cashier with a login, and an authorization row. */
function seed(options: { active?: boolean; authorized?: boolean; staffCode?: string } = {}) {
  const staffCode = options.staffCode ?? "BBOLD001";
  mocks.db.shops = [
    {
      id: SHOP_ID,
      name: "Baebe Boo Sakumono",
      location: "Sakumono",
      database_name: "baebe_boo_sakumono",
      whatsapp_number: null,
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
    },
  ];
  mocks.db.shop_staff = [
    {
      id: STAFF_ID,
      shop_id: SHOP_ID,
      staff_name: "Adjei Mensah",
      staff_contact: "0240000000",
      profile_image_url: null,
      staff_code: staffCode,
      auth_user_id: "auth-1",
      created_at: "2026-01-02T00:00:00.000Z",
    },
  ];
  mocks.db.staff_authorizations =
    options.authorized === false
      ? []
      : [
          {
            id: "authorization-1",
            email: `${staffCode.toLowerCase()}@${COUNTER_DOMAIN}`,
            staff_id: STAFF_ID,
            active: options.active ?? true,
          },
        ];
}

beforeEach(() => {
  // The sign-in address is derived from the site host, so pin it rather than
  // depending on whatever the runner inherited.
  process.env.NEXT_PUBLIC_SITE_URL = "https://baebe-boo.jtechinnovations.tech";
  vi.clearAllMocks();
  for (const key of Object.keys(mocks.db)) delete mocks.db[key];
  mocks.failures.clear();
  mocks.provisionCounterUser.mockResolvedValue({
    authUserId: "auth-new",
    email: `bbnew001@${COUNTER_DOMAIN}`,
    password: "NEWPASSWORD123",
  });
  mocks.rotateCounterUserCode.mockResolvedValue({
    email: `bbnew001@${COUNTER_DOMAIN}`,
    password: "ROTATEDPASS12",
  });
  mocks.resetCounterUserPassword.mockResolvedValue({ password: "RESETPASS1234" });
  mocks.deleteCounterUser.mockResolvedValue(undefined);
});

describe("revoked counter access does not come back on its own", () => {
  // The bug: both credential flows passed a hard-coded `active: true` to
  // `syncStaffAuthorization`. An admin who had revoked a cashier and later
  // pressed "Reset password" or "Issue a new CounterID" on that same card
  // silently re-granted access to someone they had removed, with nothing on
  // screen saying so.

  it("keeps a revoked cashier revoked when their password is reset", async () => {
    seed({ active: false });

    await resetStaffCredentials(STAFF_ID, actor);

    expect(authorizationFor()?.active).toBe(false);
  });

  it("keeps a revoked cashier revoked when a new CounterID is issued", async () => {
    seed({ active: false });

    await regenerateStaffCode(STAFF_ID, actor);

    expect(authorizationFor()?.active).toBe(false);
  });

  it("leaves an allowed cashier allowed, so the fix does not revoke by accident", async () => {
    seed({ active: true });

    await resetStaffCredentials(STAFF_ID, actor);
    await regenerateStaffCode(STAFF_ID, actor);

    expect(authorizationFor()?.active).toBe(true);
  });

  it("still repairs a staff member who never had an authorization row", async () => {
    // No row is "never configured", not "revoked" — this is the state the
    // Create login button exists to fix, so it must end up switched on.
    seed({ authorized: false });

    await resetStaffCredentials(STAFF_ID, actor);

    expect(authorizationFor()?.active).toBe(true);
  });

  it("still lets the staff editor turn access back on deliberately", async () => {
    // Preserving state must not make the toggle a one-way switch.
    seed({ active: false });

    await patchStaff(STAFF_ID, { accessActive: true });

    expect(authorizationFor()?.active).toBe(true);
  });
});

describe("a CounterID rename GoTrue refuses is put back", () => {
  // The bug: the new `staff_code` and the rewritten `staff_authorizations` row
  // were committed BEFORE the Auth user was renamed, with no compensation. A
  // GoTrue failure left Postgres naming the new CounterID while the login was
  // still the old address, so the cashier could sign in with neither.

  it("restores the old CounterID when the login cannot be renamed", async () => {
    seed({ staffCode: "BBOLD001" });
    mocks.rotateCounterUserCode.mockRejectedValue(
      new CounterCredentialError("The counter login could not be renamed.", 502),
    );

    await expect(regenerateStaffCode(STAFF_ID, actor)).rejects.toThrow(
      /could not be renamed/i,
    );

    expect(staffRow()?.staff_code).toBe("BBOLD001");
  });

  it("restores the address the cashier is actually authorized under", async () => {
    seed({ staffCode: "BBOLD001" });
    mocks.rotateCounterUserCode.mockRejectedValue(
      new CounterCredentialError("The counter login could not be renamed.", 502),
    );

    await expect(regenerateStaffCode(STAFF_ID, actor)).rejects.toThrow();

    // `is_authorized_counter()` compares the JWT email against this row, so a
    // row left on the new address refuses the login that still works.
    expect(authorizationFor()?.email).toBe(`bbold001@${COUNTER_DOMAIN}`);
    expect(authorizationFor()?.active).toBe(true);
  });

  it("leaves no authorization row behind when there was none to begin with", async () => {
    seed({ staffCode: "BBOLD001", authorized: false });
    mocks.rotateCounterUserCode.mockRejectedValue(
      new CounterCredentialError("The counter login could not be renamed.", 502),
    );

    await expect(regenerateStaffCode(STAFF_ID, actor)).rejects.toThrow();

    expect(authorizationFor()).toBeUndefined();
  });

  it("does not roll anything back when the rename succeeds", async () => {
    seed({ staffCode: "BBOLD001" });

    const result = await regenerateStaffCode(STAFF_ID, actor);

    expect(result.credentials.staffCode).not.toBe("BBOLD001");
    expect(staffRow()?.staff_code).toBe(result.credentials.staffCode);
    expect(authorizationFor()?.email).toBe(
      `${String(result.credentials.staffCode).toLowerCase()}@${COUNTER_DOMAIN}`,
    );
  });
});

describe("createStaff", () => {
  it("still rolls the staff row back when the login cannot be created", async () => {
    // Unchanged behaviour, asserted so the rollback added to the rotate path
    // cannot be mistaken for the one that already existed here.
    mocks.db.shops = [{ id: SHOP_ID, name: "Baebe Boo Sakumono", is_active: true }];
    mocks.provisionCounterUser.mockRejectedValue(
      new CounterCredentialError("The counter login could not be created.", 502),
    );

    await expect(
      createStaff(
        SHOP_ID,
        { staffName: "Amanda", staffContact: "", accessActive: true },
        actor,
      ),
    ).rejects.toThrow(/could not be created/i);

    expect(mocks.db.shop_staff).toEqual([]);
    expect(authorizations()).toEqual([]);
  });
});
