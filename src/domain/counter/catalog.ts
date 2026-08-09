/**
 * Shapes shared by the counter domain modules and the counter server layer.
 *
 * `variantId` is nullable on purpose: a deployment still on the legacy schema
 * has no `product_variants` rows, and `complete_counter_sale` sells by variant.
 * Such a line is displayable but not sellable, and the UI has to say so rather
 * than invent an id.
 */
export type CounterCatalogItem = {
  productId: string;
  variantId: string | null;
  name: string;
  category: string;
  ageRange: string;
  gender: string;
  sku: string;
  price: number;
  imageUrl: string;
  onHand: number;
  reserved: number;
  /**
   * The version label, e.g. "Pink / 3M". Null when the product has only one
   * version, or when its title is the placeholder "Default Title" — in both
   * cases there is nothing to disambiguate and showing a label would be noise.
   *
   * This existed in the database from the start and was never selected, which
   * is why a four-size hoodie rendered as four identical cards separated only
   * by a SKU suffix.
   */
  variantTitle: string | null;
  /** e.g. `{ color: "Pink", size: "3M" }`. Lowercase keys, as stored. */
  optionValues: Record<string, string>;
};

export type CounterCartLine = {
  productId: string;
  variantId: string;
  name: string;
  sku: string;
  imageUrl: string;
  price: number;
  quantity: number;
  available: number;
  /** Carried onto the line so the cart and the receipt say which version sold. */
  variantTitle: string | null;
};

export type CounterPaymentMethod = "cash" | "visa" | "momo";

export const counterPaymentMethods: readonly CounterPaymentMethod[] = [
  "cash",
  "visa",
  "momo",
] as const;

export function isCounterPaymentMethod(value: string): value is CounterPaymentMethod {
  return counterPaymentMethods.some((method) => method === value);
}
