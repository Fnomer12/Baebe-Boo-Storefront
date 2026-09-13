import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { StorefrontPage } from "./StorefrontChrome";

function mockStatus(ready: boolean) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ status: true, ready }),
  }) as unknown as typeof fetch;
}

describe("StorefrontPage readiness banner scope", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(cleanup);

  it("hides the banner by default (sign-in, account, content pages)", async () => {
    mockStatus(false);
    render(
      <StorefrontPage>
        <p>sign-in content</p>
      </StorefrontPage>,
    );

    await waitFor(() => {
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("sign-in content")).toBeDefined();
  });

  it("shows the getting-ready banner on commerce pages that opt in", async () => {
    mockStatus(false);
    render(
      <StorefrontPage showReadinessBanner>
        <p>store content</p>
      </StorefrontPage>,
    );

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/getting ready/i);
    });
  });

  it("hides the banner on the homepage when suppressed", async () => {
    mockStatus(false);
    render(
      <StorefrontPage showReadinessBanner={false}>
        <p>home content</p>
      </StorefrontPage>,
    );

    await waitFor(() => {
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("home content")).toBeDefined();
  });
});
