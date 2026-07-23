import { describe, expect, it } from "vitest";
import {
  adminWorkspaceHref,
  adminWorkspaceRoutes,
  adminWorkspaceTabFromPathname,
  isAdminWorkspaceSection,
} from "./admin-workspace";

describe("admin workspace routes", () => {
  it("exposes only the five primary workspaces", () => {
    expect(adminWorkspaceRoutes.map((route) => route.label)).toEqual([
      "Dashboard",
      "Products",
      "Orders",
      "Customers",
      "Stores",
    ]);
  });

  it("maps workspace tabs to stable portal URLs", () => {
    expect(adminWorkspaceHref("dashboard")).toBe("/BaebeAdmin");
    expect(adminWorkspaceHref("orders")).toBe("/BaebeAdmin/orders");
    expect(adminWorkspaceHref("notifications")).toBe("/BaebeAdmin/orders");
    expect(adminWorkspaceHref("settings")).toBe("/BaebeAdmin/stores");
  });

  it("derives the active workspace from a portal pathname", () => {
    expect(adminWorkspaceTabFromPathname("/BaebeAdmin")).toBe("dashboard");
    expect(adminWorkspaceTabFromPathname("/BaebeAdmin/members")).toBe("customers");
    expect(adminWorkspaceTabFromPathname("/BaebeAdmin/notifications")).toBe("orders");
    expect(adminWorkspaceTabFromPathname("/BaebeAdmin/store")).toBe("products");
    expect(adminWorkspaceTabFromPathname("/BaebeAdmin/not-a-workspace")).toBe("dashboard");
  });

  it("rejects unknown workspace route segments", () => {
    expect(isAdminWorkspaceSection("settings")).toBe(true);
    expect(isAdminWorkspaceSection("customers")).toBe(true);
    expect(isAdminWorkspaceSection("not-a-workspace")).toBe(false);
  });
});
