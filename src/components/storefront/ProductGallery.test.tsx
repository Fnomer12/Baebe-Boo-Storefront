import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import ProductGallery from "./ProductGallery";
import { variantSelectedEvent } from "./ProductActions";
import type { StorefrontProduct } from "./catalog-data";

const MAIN = "https://cdn.example.com/romper-main.jpg";
const PINK = "https://cdn.example.com/romper-pink.jpg";
const LIFESTYLE = "https://cdn.example.com/romper-lifestyle.jpg";

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
    imageUrl: MAIN,
    description: "",
    options: [],
    specifications: [],
    media: [
      { type: "image", url: MAIN, alt: "Romper" },
      { type: "image", url: PINK, alt: "Romper in pink", variantId: "variant-pink" },
    ],
    ...overrides,
  };
}

/** The photo currently filling the main frame. */
function shownImage() {
  return document.querySelector(".storefront-product-gallery-main img")?.getAttribute("src");
}

function chooseVariant(detail: { productId: string; variantId?: string; imageUrl?: string }) {
  act(() => {
    window.dispatchEvent(new CustomEvent(variantSelectedEvent, { detail }));
  });
}

describe("ProductGallery", () => {
  it("follows a version that has its own photo", () => {
    render(<ProductGallery product={product()} />);

    chooseVariant({ productId: product().id, variantId: "variant-pink", imageUrl: PINK });

    expect(shownImage()).toBe(PINK);
  });

  it("returns to the product photo when the chosen version has none", () => {
    // Regression: the gallery only reacted to a version that carried a photo,
    // so picking Pink and then Blue (which has none) left the PINK photo on
    // screen. The picture then contradicted the pickers, and a shopper saw the
    // wrong colour of the thing they were about to buy.
    render(<ProductGallery product={product()} />);
    chooseVariant({ productId: product().id, variantId: "variant-pink", imageUrl: PINK });
    expect(shownImage()).toBe(PINK);

    chooseVariant({ productId: product().id, variantId: "variant-blue" });

    expect(shownImage()).toBe(MAIN);
  });

  it("leaves another product's gallery alone", () => {
    render(<ProductGallery product={product()} />);
    chooseVariant({ productId: product().id, variantId: "variant-pink", imageUrl: PINK });

    chooseVariant({ productId: "some-other-product" });

    expect(shownImage()).toBe(PINK);
  });

  it("does not yank a browsing shopper back when no photo is tagged to a version", () => {
    // Every product predating variant photography emits this event on load and
    // on every chip click. Snapping to photo one each time would make the
    // thumbnails unusable on the products that need them most.
    render(
      <ProductGallery
        product={product({
          media: [
            { type: "image", url: MAIN, alt: "Romper" },
            { type: "image", url: LIFESTYLE, alt: "Romper being worn" },
          ],
        })}
      />,
    );
    act(() => {
      screen.getByLabelText("Romper being worn").click();
    });
    expect(shownImage()).toBe(LIFESTYLE);

    chooseVariant({ productId: product().id, variantId: "variant-3m" });

    expect(shownImage()).toBe(LIFESTYLE);
  });
});
