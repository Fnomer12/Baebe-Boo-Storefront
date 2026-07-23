import { describe, expect, it } from "vitest";
import {
  adminWorkspaceHref,
  adminWorkspaceTabFromPathname,
  isAdminWorkspaceTab,
} from "./admin-workspace";

describe("admin workspace routes", () => {
  it("maps workspace tabs to stable portal URLs", () => {
    expect(adminWorkspaceHref("dashboard")).toBe("/BaebeAdmin");
    expect(adminWorkspaceHref("orders")).toBe("/BaebeAdmin/orders");
  });

  it("derives the active workspace from a portal pathname", () => {
    expect(adminWorkspaceTabFromPathname("/BaebeAdmin")).toBe("dashboard");
    expect(adminWorkspaceTabFromPathname("/BaebeAdmin/members")).toBe("members");
    expect(adminWorkspaceTabFromPathname("/BaebeAdmin/not-a-workspace")).toBe("dashboard");
  });

  it("rejects unknown workspace route segments", () => {
    expect(isAdminWorkspaceTab("settings")).toBe(true);
    expect(isAdminWorkspaceTab("customers")).toBe(false);
  });
});
