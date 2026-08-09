import type { CounterCatalogItem } from "./catalog";

export const ALL_CATEGORIES = "All Categories";
export const ALL_AGE_RANGES = "All Ages";

function distinctSorted(values: readonly string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort(
    (first, second) => first.localeCompare(second),
  );
}

export function catalogCategories(items: readonly CounterCatalogItem[]) {
  return [ALL_CATEGORIES, ...distinctSorted(items.map((item) => item.category))];
}

/**
 * Age ranges are derived from the catalogue rather than hard-coded.
 *
 * The previous screen carried a fixed list ("0–3 Months", "3–6 Months", …)
 * that silently stopped matching as soon as a product used a different label,
 * filtering the product out of the till entirely.
 */
export function catalogAgeRanges(items: readonly CounterCatalogItem[]) {
  return [ALL_AGE_RANGES, ...distinctSorted(items.map((item) => item.ageRange))];
}

export function filterCatalog(
  items: readonly CounterCatalogItem[],
  filters: { query?: string; category?: string; ageRange?: string },
): CounterCatalogItem[] {
  const query = (filters.query || "").trim().toLowerCase();
  const category = filters.category || ALL_CATEGORIES;
  const ageRange = filters.ageRange || ALL_AGE_RANGES;

  return items.filter((item) => {
    if (category !== ALL_CATEGORIES && item.category !== category) return false;
    if (ageRange !== ALL_AGE_RANGES && item.ageRange !== ageRange) return false;
    if (!query) return true;
    // The version label is part of the haystack: a cashier asked for "the pink
    // one" types "pink", and before this that matched nothing at all because
    // the colour lives on the variant, not the product name.
    const options = Object.values(item.optionValues || {}).join(" ");
    return `${item.name} ${item.sku} ${item.variantTitle || ""} ${options}`
      .toLowerCase()
      .includes(query);
  });
}

export function paginate<Row>(rows: readonly Row[], page: number, pageSize: number) {
  const size = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(rows.length / size));
  // Clamped, so deleting the last row of the last page cannot strand the user
  // on an empty view.
  const current = Math.min(Math.max(1, Math.floor(page)), totalPages);
  return {
    page: current,
    totalPages,
    rows: rows.slice((current - 1) * size, current * size),
  };
}
