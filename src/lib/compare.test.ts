import { describe, expect, it } from "vitest";
import { buildCompareSpecRows } from "./compare";
import { fallbackProducts } from "../components/storefront/catalog-data";

describe("buildCompareSpecRows", () => {
  it("returns no rows when nothing is being compared", () => {
    expect(buildCompareSpecRows([])).toEqual([]);
  });

  it("aligns shared labels and pads missing values with an em dash", () => {
    const rows = buildCompareSpecRows([fallbackProducts[0], fallbackProducts[1]]);
    const material = rows.find((row) => row.label === "Material");
    const sole = rows.find((row) => row.label === "Sole");
    const fastening = rows.find((row) => row.label === "Fastening");
    expect(material?.values).toEqual(["Soft organic cotton blend", "—"]);
    expect(sole?.values).toEqual(["—", "Flexible non-slip rubber"]);
    expect(fastening?.values).toEqual(["Nickel-free poppers", "Hook and loop"]);
  });

  it("keeps first-seen label order across products", () => {
    const rows = buildCompareSpecRows([fallbackProducts[1], fallbackProducts[0]]);
    expect(rows.map((row) => row.label)).toEqual(["Sole", "Fit", "Fastening", "Material", "Care"]);
  });
});
