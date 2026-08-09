import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ProductCard from "./ProductCard";
import type { StorefrontProduct } from "./catalog-data";

function product(overrides: Partial<StorefrontProduct> = {}): StorefrontProduct {
  return {
    id: "c1a21cf2-6c41-45e9-92f2-30ab037e9b80",
    slug: "cloud-soft-organic-romper-c1a21cf2",
    name: "Cloud-Soft Organic Romper",
    category: "Baby Clothing",
    categorySlug: "baby-clothing",
    age: "0–3 Months",
    ageSlug: "0-3-months",
    gender: "Unisex",
    price: 189,
    imageUrl: "",
    description: "",
    options: [],
    specifications: [],
    ...overrides,
  };
}

describe("ProductCard", () => {
  it("advertises the cheapest version as a starting price, not the price", () => {
    // Regression: the card rendered `product.price`, which for a variable
    // product is now the CHEAPEST live version. A romper sold at GH₵89 and
    // GH₵189 advertised a flat GH₵89 — a promise the product page broke the
    // moment the shopper picked a size.
    render(<ProductCard product={product({ price: 89, priceFrom: 89, priceTo: 189 })} />);

    expect(screen.getByText("From GH₵89.00")).toBeInTheDocument();
    expect(screen.queryByText("GH₵89.00")).not.toBeInTheDocument();
  });

  it("shows one price when every version costs the same", () => {
    render(<ProductCard product={product({ price: 189, priceFrom: 189, priceTo: 189 })} />);

    expect(screen.getByText("GH₵189.00")).toBeInTheDocument();
  });

  it("shows one price for a product with no versions at all", () => {
    render(<ProductCard product={product()} />);

    expect(screen.getByText("GH₵189.00")).toBeInTheDocument();
  });

  it("keeps the was-price beside a single price", () => {
    render(<ProductCard product={product({ compareAtPrice: 220 })} />);

    expect(screen.getByText("GH₵220.00")).toBeInTheDocument();
  });

  it("drops the was-price beside a range, where it claims a saving nobody offered", () => {
    render(
      <ProductCard product={product({ price: 89, priceFrom: 89, priceTo: 189, compareAtPrice: 220 })} />,
    );

    expect(screen.getByText("From GH₵89.00")).toBeInTheDocument();
    expect(screen.queryByText("GH₵220.00")).not.toBeInTheDocument();
  });
});
