import { describe, expect, it } from "vitest";
import { frequentlyBoughtTogether, type OrderItemRow } from "./co-purchase";

const row = (orderId: string, productId: string): OrderItemRow => ({ orderId, productId });

describe("frequentlyBoughtTogether", () => {
  it("ranks co-purchased products by distinct-order co-occurrence count", () => {
    const rows = [
      row("o1", "romper"), row("o1", "hat"), row("o1", "bib"),
      row("o2", "romper"), row("o2", "hat"),
      row("o3", "romper"), row("o3", "hat"), row("o3", "socks"),
      // unrelated order — must not influence ranking
      row("o4", "rattle"), row("o4", "bib"),
    ];

    expect(frequentlyBoughtTogether("romper", rows)).toEqual(["hat", "bib", "socks"]);
  });

  it("never returns the product being viewed", () => {
    const rows = [row("o1", "romper"), row("o1", "hat"), row("o2", "romper"), row("o2", "romper")];

    expect(frequentlyBoughtTogether("romper", rows)).toEqual(["hat"]);
  });

  it("breaks ties by first-seen order so output is deterministic", () => {
    const rows = [
      row("o1", "romper"), row("o1", "bib"), row("o1", "hat"),
      row("o2", "romper"), row("o2", "hat"), row("o2", "bib"),
    ];

    expect(frequentlyBoughtTogether("romper", rows)).toEqual(["bib", "hat"]);
  });

  it("returns an empty list for empty input or unknown products", () => {
    expect(frequentlyBoughtTogether("romper", [])).toEqual([]);
    expect(frequentlyBoughtTogether("romper", [row("o1", "hat")])).toEqual([]);
  });

  it("counts duplicate line items in the same order only once", () => {
    const rows = [
      row("o1", "romper"), row("o1", "hat"), row("o1", "hat"),
      row("o2", "romper"), row("o2", "bib"),
    ];

    expect(frequentlyBoughtTogether("romper", rows)).toEqual(["hat", "bib"]);
  });

  it("honours the result limit", () => {
    const rows = [
      row("o1", "romper"), row("o1", "a"), row("o1", "b"), row("o1", "c"),
    ];

    expect(frequentlyBoughtTogether("romper", rows, 2)).toEqual(["a", "b"]);
  });
});
