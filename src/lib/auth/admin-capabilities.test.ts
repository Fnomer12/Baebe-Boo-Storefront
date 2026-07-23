import { describe, expect, it } from "vitest";
import { hasAdminCapability } from "./admin-capabilities";

describe("admin capabilities", () => {
  it("allows the owner role to manage catalog and inventory", () => {
    expect(hasAdminCapability("boss", "catalog:write")).toBe(true);
    expect(hasAdminCapability("boss", "inventory:write")).toBe(true);
  });
});
