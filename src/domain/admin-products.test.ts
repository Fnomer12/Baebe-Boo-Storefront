import { describe, expect, it } from "vitest";
import {
  filterAdminProducts,
  type AdminProduct,
} from "./admin-products";

const products: AdminProduct[] = [
  {
    id: "one",
    name: "Organic Cotton Romper",
    description: "A soft newborn essential.",
    category: "Baby Clothing",
    ageRange: "0–3 Months",
    gender: "Unisex",
    price: 120,
    sku: "CL-001",
    imageUrl: "",
    active: true,
    createdAt: "2026-07-23T00:00:00.000Z",
    variants: [],
  },
  {
    id: "two",
    name: "Wooden Activity Cube",
    description: "Playtime favourite.",
    category: "Toys",
    ageRange: "1–2 Years",
    gender: "Unisex",
    price: 240,
    sku: "TY-002",
    imageUrl: "",
    active: false,
    createdAt: "2026-07-22T00:00:00.000Z",
    variants: [],
  },
];

describe("filterAdminProducts", () => {
  it("searches names and SKUs without case sensitivity", () => {
    expect(
      filterAdminProducts(products, {
        query: "cl-001",
        status: "all",
        category: "all",
      }).map((product) => product.id),
    ).toEqual(["one"]);
  });

  it("combines lifecycle and category filters", () => {
    expect(
      filterAdminProducts(products, {
        query: "",
        status: "archived",
        category: "Toys",
      }).map((product) => product.id),
    ).toEqual(["two"]);
  });
});
