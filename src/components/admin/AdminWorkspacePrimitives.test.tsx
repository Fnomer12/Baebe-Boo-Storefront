import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AdminDataTable,
  AdminEmptyState,
  AdminErrorState,
  AdminFilterBar,
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
