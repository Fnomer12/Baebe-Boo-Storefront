import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import CounterPaymentSelector from "./CounterPaymentSelector";

// vitest runs without `globals`, so RTL's automatic cleanup never registers.
afterEach(cleanup);

describe("CounterPaymentSelector", () => {
  it("exposes the three supported methods as a radio group", () => {
    render(<CounterPaymentSelector value="cash" onChange={vi.fn()} />);

    expect(screen.getByRole("radiogroup", { name: "Payment method" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    for (const label of ["Cash", "Card", "Mobile money"]) {
      expect(screen.getByRole("radio", { name: label })).toBeInTheDocument();
    }
  });

  it("marks only the selected method as checked", () => {
    render(<CounterPaymentSelector value="momo" onChange={vi.fn()} />);

    expect(screen.getByRole("radio", { name: "Mobile money" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Cash" })).not.toBeChecked();
  });

  it("reports the method the cashier picked", async () => {
    const onChange = vi.fn();
    render(<CounterPaymentSelector value="cash" onChange={onChange} />);

    await userEvent.click(screen.getByRole("radio", { name: "Card" }));
    expect(onChange).toHaveBeenCalledWith("visa");
  });

  it("cannot be changed while a sale is in flight", async () => {
    const onChange = vi.fn();
    render(<CounterPaymentSelector value="cash" onChange={onChange} disabled />);

    await userEvent.click(screen.getByRole("radio", { name: "Card" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
