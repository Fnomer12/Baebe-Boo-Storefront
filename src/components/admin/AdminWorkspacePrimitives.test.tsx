import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  AdminDataTable,
  AdminEmptyState,
  AdminErrorState,
  AdminFilterBar,
  AdminModal,
} from "./AdminWorkspacePrimitives";

describe("admin workspace primitives", () => {
  it("renders an accessible data table", () => {
    render(
      <AdminDataTable
        caption="Branch inventory"
        rows={[{ id: "one", name: "Romper" }]}
        rowKey={(row) => row.id}
        columns={[
          { key: "name", header: "Product", cell: (row) => row.name },
        ]}
      />,
    );

    expect(screen.getByRole("table", { name: "Branch inventory" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Product" })).toBeInTheDocument();
    expect(screen.getByText("Romper")).toBeInTheDocument();
  });

  it("labels every cell so it still reads as a card on a narrow screen", () => {
    // Below `md` the table stacks and the header row is hidden, so each cell
    // has to carry its own label via `td::before { content: attr(data-label) }`.
    // Rendering a separate card list instead would duplicate every button in
    // every cell, and two controls with the same accessible name is worse than
    // an unusual layout.
    render(
      <AdminDataTable
        caption="Branch inventory"
        rows={[{ id: "one", name: "Romper", stock: 4 }]}
        rowKey={(row) => row.id}
        columns={[
          { key: "name", header: "Product", cell: (row) => row.name },
          { key: "stock", header: "Available", cell: (row) => row.stock },
          // A non-string header still needs a label for the stacked layout.
          { key: "actions", header: <span>Actions</span>, label: "Actions", cell: () => "—" },
        ]}
      />,
    );

    const cells = screen.getAllByRole("cell");
    expect(cells.map((cell) => cell.getAttribute("data-label"))).toEqual([
      "Product",
      "Available",
      "Actions",
    ]);
  });

  it("falls back to the column key when a header is not a string and no label is given", () => {
    render(
      <AdminDataTable
        caption="Branch inventory"
        rows={[{ id: "one" }]}
        rowKey={(row) => row.id}
        columns={[{ key: "reorder", header: <em>Reorder</em>, cell: () => "—" }]}
      />,
    );

    expect(screen.getByRole("cell").getAttribute("data-label")).toBe("reorder");
  });

  it("renders filters and workspace states", () => {
    render(
      <>
        <AdminFilterBar query="" onQueryChange={vi.fn()} queryLabel="Search orders" />
        <AdminEmptyState title="No orders" description="Orders will appear here." />
        <AdminErrorState description="Try the request again." />
      </>,
    );

    expect(screen.getByRole("searchbox", { name: "Search orders" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No orders" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Try the request again.");
  });
});

describe("AdminModal", () => {
  function open(props: Partial<React.ComponentProps<typeof AdminModal>> = {}) {
    const onClose = vi.fn();
    render(
      <AdminModal open onClose={onClose} title="Create store" {...props}>
        <input aria-label="Store name" />
      </AdminModal>,
    );
    return { onClose };
  }

  it("exposes itself as a dialog named by its title", () => {
    open();
    expect(screen.getByRole("dialog", { name: "Create store" })).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    render(
      <AdminModal open={false} onClose={vi.fn()} title="Create store">
        <input aria-label="Store name" />
      </AdminModal>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on Escape", async () => {
    // A non-technical user reaches for Escape long before they find the X.
    const user = userEvent.setup();
    const { onClose } = open();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes from the header button", async () => {
    const user = userEvent.setup();
    const { onClose } = open();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("defaults to the narrow width the existing modals shipped with", () => {
    open();
    // Guards the six call sites that predate the `size` prop.
    expect(screen.getByRole("dialog").className).toContain("max-w-md");
  });

  it("widens for the variant matrix", () => {
    open({ size: "xl" });
    expect(screen.getByRole("dialog").className).toContain("max-w-6xl");
  });

  it("pins a footer outside the scrolling body", () => {
    open({ footer: <button type="button">Save product</button> });
    // Save has to stay reachable on a form long enough to scroll.
    expect(screen.getByRole("button", { name: "Save product" })).toBeInTheDocument();
  });

  it("locks the page behind it and restores the scroll on close", () => {
    const { unmount } = render(
      <AdminModal open onClose={vi.fn()} title="Create store">
        <input aria-label="Store name" />
      </AdminModal>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("keeps Tab inside the dialog", async () => {
    // Without this, Tab walks into the page behind and the next Enter presses
    // a button the user cannot see.
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Behind the modal</button>
        <AdminModal open onClose={vi.fn()} title="Create store">
          <input aria-label="Store name" />
        </AdminModal>
      </>,
    );
    const dialog = screen.getByRole("dialog");
    await user.tab();
    await user.tab();
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});
