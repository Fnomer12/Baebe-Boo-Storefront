import { beforeEach, describe, expect, it, vi } from "vitest";

const { listProductsMock, createProductMock, authorizeMock } = vi.hoisted(() => ({
  listProductsMock: vi.fn(),
  createProductMock: vi.fn(),
  authorizeMock: vi.fn(),
}));

// `@/lib/admin/catalog` imports `server-only` and talks to PostgREST, so it is
// replaced wholesale: what is under test here is the translation between the
// query string the workspace sends and the arguments it is called with.
vi.mock("@/lib/admin/catalog", () => ({
  AdminCatalogError: class AdminCatalogError extends Error {
    constructor(
      public readonly status: number,
      message: string,
      public readonly errors?: Record<string, string>,
    ) {
      super(message);
    }
  },
  listProducts: listProductsMock,
  createProduct: createProductMock,
}));

vi.mock("@/lib/auth", () => ({ authorizeAdminApi: authorizeMock }));

import { GET } from "./route";

async function list(search: string) {
  const response = await GET(new Request(`https://example.com/api/admin/products?${search}`));
  return { status: response.status, body: await response.json() };
}

describe("admin products list route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorizeMock.mockResolvedValue({
      authorized: true,
      admin: { userId: "admin-1", role: "owner" },
    });
    listProductsMock.mockResolvedValue({ products: [], total: 0 });
  });

  it("filters on the word the workspace's own dropdown sends", async () => {
    // THE BUG: the Status filter sends `all | active | archived` — the words on
    // the control — and this route understood only `active | inactive`, so
    // `archived` fell through to "no filter". Invisible while the browser held
    // the whole catalogue and re-filtered it; once paging moved into Postgres,
    // choosing "Archived" quietly returned page one of every product there is.
    await list("query=&status=archived&page=1&pageSize=24");

    expect(listProductsMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "inactive" }),
    );
  });

  it("passes the other two lifecycle choices through unchanged", async () => {
    await list("status=active");
    expect(listProductsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "active" }),
    );

    await list("status=all");
    expect(listProductsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: undefined }),
    );
  });

  it("keeps paging sane when the numbers are missing or nonsense", async () => {
    await list("page=0&pageSize=abc");
    expect(listProductsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, pageSize: 24 }),
    );
  });

  it("answers with the products and the total the catalogue reported", async () => {
    listProductsMock.mockResolvedValue({ products: [{ id: "one" }], total: 97 });

    expect(await list("status=all")).toEqual({
      status: 200,
      body: { products: [{ id: "one" }], total: 97 },
    });
  });
});
