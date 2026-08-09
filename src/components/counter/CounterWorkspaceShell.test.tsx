import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted above the imports, so the doubles it closes over have to
// be created by vi.hoisted rather than declared as ordinary consts.
const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/BaebeCounter/sales",
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { signOut: mocks.signOut } },
}));

import CounterWorkspaceShell from "./CounterWorkspaceShell";

// vitest runs without `globals`, so RTL's automatic cleanup never registers.
afterEach(cleanup);

const identity = {
  staffName: "Ama Mensah",
  staffCode: "BB1A2B3C",
  shopName: "Osu Branch",
  shopLocation: "Accra",
};

function renderShell() {
  return render(
    <CounterWorkspaceShell identity={identity}>
      <p>workspace content</p>
    </CounterWorkspaceShell>,
  );
}

describe("CounterWorkspaceShell", () => {
  it("links to every counter workspace", () => {
    renderShell();

    expect(
      screen.getByRole("navigation", { name: "Counter workspace navigation" }),
    ).toBeInTheDocument();

    for (const label of ["Sell", "Orders", "Sales", "Stock"]) {
      expect(screen.getByRole("link", { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it("marks the workspace matching the pathname as the current page", () => {
    renderShell();
    expect(screen.getByRole("link", { current: "page" })).toHaveAttribute(
      "href",
      "/BaebeCounter/sales",
    );
  });

  it("shows who is signed in and where", () => {
    renderShell();
    expect(screen.getByText("Ama Mensah")).toBeInTheDocument();
    expect(screen.getByText(/BB1A2B3C/)).toBeInTheDocument();
    expect(screen.getByText(/Osu Branch/)).toBeInTheDocument();
  });

  it("renders the workspace content", () => {
    renderShell();
    expect(screen.getByText("workspace content")).toBeInTheDocument();
  });

  it("offers a sign-out control", () => {
    renderShell();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });
});
