export type AdminInventoryLevel = {
  id: string;
  variantId: string;
  shopId: string;
  shopName: string;
  shopLocation: string;
  onHand: number;
  reserved: number;
  available: number;
  reorderPoint: number;
  updatedAt: string;
};

export type AdminProductVariant = {
  id: string;
  sku: string;
  title: string;
  price: number;
  active: boolean;
  isDefault: boolean;
  optionValues: Record<string, unknown>;
  inventory: AdminInventoryLevel[];
};

export type AdminProduct = {
  id: string;
  name: string;
  description: string;
  category: string;
  ageRange: string;
  gender: string;
  price: number;
  sku: string;
  imageUrl: string;
  active: boolean;
  createdAt: string;
  variants: AdminProductVariant[];
};

export type AdminProductFilters = {
  query: string;
  status: "all" | "active" | "archived";
  category: string;
};

export function filterAdminProducts(
  products: AdminProduct[],
  filters: AdminProductFilters,
) {
  const query = filters.query.trim().toLocaleLowerCase();

  return products.filter((product) => {
    const matchesQuery =
      !query ||
      [
        product.name,
        product.sku,
        product.category,
        ...product.variants.map((variant) => variant.sku),
      ].some((value) => value.toLocaleLowerCase().includes(query));
    const matchesStatus =
      filters.status === "all" ||
      (filters.status === "active" ? product.active : !product.active);
    const matchesCategory =
      filters.category === "all" || product.category === filters.category;

    return matchesQuery && matchesStatus && matchesCategory;
  });
}
