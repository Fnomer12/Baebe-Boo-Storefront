import { describe, expect, it } from "vitest";
import {
  counterWorkspaceRoutes,
  counterWorkspaceTabFromPathname,
  counterWorkspaceTabs,
  isCounterWorkspaceTab,
} from "./counter-workspace";

describe("counter workspace navigation", () => {
  it("exposes one route per tab, in tab order", () => {
    expect(counterWorkspaceRoutes.map((route) => route.tab)).toEqual([
      ...counterWorkspaceTabs,
    ]);
  });

  it("keeps every route under /BaebeCounter", () => {
    for (const route of counterWorkspaceRoutes) {
      expect(route.href.startsWith("/BaebeCounter")).toBe(true);
      expect(route.label.length).toBeGreaterThan(0);
      expect(route.description.length).toBeGreaterThan(0);
    }
  });

  it("recognises only the known tabs", () => {
    expect(isCounterWorkspaceTab("sell")).toBe(true);
    expect(isCounterWorkspaceTab("stock")).toBe(true);
    expect(isCounterWorkspaceTab("dashboard")).toBe(false);
    expect(isCounterWorkspaceTab("")).toBe(false);
  });

  it("maps a pathname to its tab", () => {
    expect(counterWorkspaceTabFromPathname("/BaebeCounter/orders")).toBe("orders");
    expect(counterWorkspaceTabFromPathname("/BaebeCounter/sales")).toBe("sales");
    expect(counterWorkspaceTabFromPathname("/BaebeCounter/stock")).toBe("stock");
  });

  it("falls back to sell for the index and for anything unknown", () => {
    expect(counterWorkspaceTabFromPathname("/BaebeCounter")).toBe("sell");
    expect(counterWorkspaceTabFromPathname("/BaebeCounter/")).toBe("sell");
    expect(counterWorkspaceTabFromPathname("/BaebeCounter/nonsense")).toBe("sell");
    expect(counterWorkspaceTabFromPathname("/")).toBe("sell");
  });

  it("does not pick up an admin tab that shares a segment position", () => {
    expect(counterWorkspaceTabFromPathname("/BaebeAdmin/products")).toBe("sell");
  });
});
