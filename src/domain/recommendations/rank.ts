export interface RecommendationProduct {
  id: string;
  category: string;
  age: string;
  price: number;
}

export interface RecommendationSignals {
  coPurchaseCounts?: Readonly<Record<string, number>>;
}

/**
 * Ranks an anonymous candidate set using catalog attributes and aggregate
 * co-purchase counts. The function deliberately accepts no customer data.
 */
export function rankRecommendations<T extends RecommendationProduct>(
  current: RecommendationProduct,
  candidates: readonly T[],
  signals: RecommendationSignals = {},
): T[] {
  const score = (candidate: T) => {
    const categoryAffinity = candidate.category === current.category ? 50 : 0;
    const ageSuitability = candidate.age === current.age ? 40 : 0;
    const coPurchases = Math.min(
      Math.max(signals.coPurchaseCounts?.[candidate.id] ?? 0, 0),
      30,
    );
    const priceDistance = Math.abs(candidate.price - current.price);
    const priceAffinity = Math.max(0, 10 - priceDistance / Math.max(current.price, 1));

    return categoryAffinity + ageSuitability + coPurchases + priceAffinity;
  };

  return candidates
    .filter((candidate) => candidate.id !== current.id)
    .map((candidate, originalIndex) => ({ candidate, originalIndex, score: score(candidate) }))
    .sort((left, right) => right.score - left.score || left.originalIndex - right.originalIndex)
    .map(({ candidate }) => candidate);
}
