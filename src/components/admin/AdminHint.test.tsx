import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminHint, HintedField } from "./AdminHint";

describe("AdminHint", () => {
  it("stays hidden until asked for", () => {
    render(<AdminHint>Stock keeping unit</AdminHint>);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("opens on hover", async () => {
    const user = userEvent.setup();
    render(<AdminHint>Stock keeping unit</AdminHint>);
    await user.hover(screen.getByRole("button"));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Stock keeping unit");
  });

  it("closes when the pointer leaves again", async () => {
    const user = userEvent.setup();
    render(<AdminHint>Stock keeping unit</AdminHint>);
    const trigger = screen.getByRole("button");
    await user.hover(trigger);
    await user.unhover(trigger);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("opens on keyboard focus", async () => {
    // Hover-only would make every hint invisible to a keyboard user.
    const user = userEvent.setup();
    render(<AdminHint>Stock keeping unit</AdminHint>);
    await user.tab();
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("pins open on click so it survives on a touch screen", async () => {
    // Shop staff are on tablets. A hint that needs a sustained hover is a hint
    // they can never read.
    const user = userEvent.setup();
    render(<AdminHint>Stock keeping unit</AdminHint>);
    const trigger = screen.getByRole("button");
    await user.click(trigger);
    await user.unhover(trigger);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("closes again on a second click", async () => {
    const user = userEvent.setup();
    render(<AdminHint>Stock keeping unit</AdminHint>);
    const trigger = screen.getByRole("button");
    await user.click(trigger);
    await user.click(trigger);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("describes the trigger while open", async () => {
    const user = userEvent.setup();
    render(<AdminHint>Stock keeping unit</AdminHint>);
    const trigger = screen.getByRole("button");
    await user.click(trigger);
    expect(trigger.getAttribute("aria-describedby")).toBe(
      screen.getByRole("tooltip").getAttribute("id"),
    );
  });

  it("closes on Escape without letting it reach a surrounding modal", async () => {
    const user = userEvent.setup();
    let escapesSeen = 0;
    render(
      <div onKeyDown={(event) => event.key === "Escape" && (escapesSeen += 1)}>
        <AdminHint>Stock keeping unit</AdminHint>
      </div>,
    );
    await user.click(screen.getByRole("button"));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
    // Otherwise dismissing a hint also discards the half-filled form behind it.
    expect(escapesSeen).toBe(0);
  });
});

describe("HintedField", () => {
  it("associates the label with its control", () => {
    render(
      <HintedField label="Reorder point" hint="When to restock" htmlFor="reorder">
        <input id="reorder" />
      </HintedField>,
    );
    expect(screen.getByLabelText("Reorder point")).toBeInTheDocument();
  });

  it("renders a field error as an alert", () => {
    render(
      <HintedField label="SKU" error="That code is already used by another product.">
        <input />
      </HintedField>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("already used");
  });

  it("omits the hint trigger when there is nothing to explain", () => {
    render(
      <HintedField label="Name">
        <input />
      </HintedField>,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });
});
