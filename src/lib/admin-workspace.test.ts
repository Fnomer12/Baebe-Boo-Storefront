import { describe, expect, it } from "vitest";
import {
  adminWorkspaceRoutes,
  adminWorkspaceTabFromPathname,
  isAdminWorkspaceTab,
} from "./admin-workspace";

describe("admin workspace routes", () => {
  it("exposes the nine primary workspaces", () => {
    expect(adminWorkspaceRoutes.map((route) => route.label)).toEqual([
      "Dashboard",
      "Products",
      "Procurement",
      "Finance",
      "Promotions",
      "Orders",
      "Customers",
      "Stores",
      "Delivery",
      "Parenting",
    ]);
  });

  it("derives the active workspace from a portal pathname", () => {
    expect(adminWorkspaceTabFromPathname("/BaebeAdmin")).toBe("dashboard");
    expect(adminWorkspaceTabFromPathname("/BaebeAdmin/products")).toBe("products");
    expect(adminWorkspaceTabFromPathname("/BaebeAdmin/procurement")).toBe("procurement");
    expect(adminWorkspaceTabFromPathname("/BaebeAdmin/finance")).toBe("finance");
    expect(adminWorkspaceTabFromPathname("/BaebeAdmin/promotions")).toBe("promotions");
    expect(adminWorkspaceTabFromPathname("/BaebeAdmin/orders")).toBe("orders");
    expect(adminWorkspaceTabFromPathname("/BaebeAdmin/customers")).toBe("customers");
    expect(adminWorkspaceTabFromPathname("/BaebeAdmin/stores")).toBe("stores");
    expect(adminWorkspaceTabFromPathname("/BaebeAdmin/parenting")).toBe("parenting");
    expect(adminWorkspaceTabFromPathname("/BaebeAdmin/not-a-workspace")).toBe("dashboard");
  });

  it("accepts known tabs and rejects unknown segments", () => {
    expect(isAdminWorkspaceTab("dashboard")).toBe(true);
    expect(isAdminWorkspaceTab("products")).toBe(true);
    expect(isAdminWorkspaceTab("procurement")).toBe(true);
    expect(isAdminWorkspaceTab("finance")).toBe(true);
    expect(isAdminWorkspaceTab("promotions")).toBe(true);
    expect(isAdminWorkspaceTab("not-a-workspace")).toBe(false);
  });
});
