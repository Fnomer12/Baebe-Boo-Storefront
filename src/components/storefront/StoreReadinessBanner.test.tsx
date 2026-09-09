import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import StoreReadinessBanner from "./StoreReadinessBanner";

function mockStatus(payload: unknown, ok = true) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(payload),
  }) as unknown as typeof fetch;
}

describe("StoreReadinessBanner", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the getting-ready banner while the store flag is off", async () => {
    mockStatus({ status: true, ready: false });
    render(<StoreReadinessBanner />);

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/getting ready/i);
    });
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/storefront/status", { cache: "no-store" });
  });

  it("renders nothing when the store is live", async () => {
    mockStatus({ status: true, ready: true });
    const { container } = render(<StoreReadinessBanner />);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("fails open with no banner when the status cannot be read", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
    const { container } = render(<StoreReadinessBanner />);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
  });
});
