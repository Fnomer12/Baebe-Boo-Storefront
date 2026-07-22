export type CartLine = {
  variantId: string;
  quantity: number;
};

export type BranchStock = {
  branchId: string;
  stock: Record<string, number>;
};

export type BranchAllocation = {
  branchId: string;
  items: CartLine[];
};

export type AllocationResult =
  | {
      status: "allocated";
      split: boolean;
      allocations: BranchAllocation[];
    }
  | {
      status: "insufficient_stock";
      split: false;
      allocations: [];
      shortages: Array<{
        variantId: string;
        requested: number;
        available: number;
      }>;
    };

export function allocateInventory(
  lines: CartLine[],
  branches: BranchStock[],
  options: { preferredBranchId?: string } = {},
): AllocationResult {
  const normalizedLines = lines.filter((line) => line.quantity > 0);
  const orderedBranches = options.preferredBranchId
    ? [...branches].sort((left, right) =>
        Number(right.branchId === options.preferredBranchId) -
        Number(left.branchId === options.preferredBranchId),
      )
    : branches;
  const singleBranch = orderedBranches.find((branch) =>
    normalizedLines.every(
      (line) => (branch.stock[line.variantId] ?? 0) >= line.quantity,
    ),
  );

  if (singleBranch) {
    return {
      status: "allocated",
      split: false,
      allocations: [
        {
          branchId: singleBranch.branchId,
          items: normalizedLines.map((line) => ({ ...line })),
        },
      ],
    };
  }

  const shortages = normalizedLines.flatMap((line) => {
    const available = branches.reduce(
      (total, branch) => total + Math.max(0, branch.stock[line.variantId] ?? 0),
      0,
    );

    return available < line.quantity
      ? [{ variantId: line.variantId, requested: line.quantity, available }]
      : [];
  });

  if (shortages.length > 0) {
    return {
      status: "insufficient_stock",
      split: false,
      allocations: [],
      shortages,
    };
  }

  const remaining = new Map(
    normalizedLines.map((line) => [line.variantId, line.quantity]),
  );
  const rankedBranches = [...orderedBranches].sort((left, right) => {
    const score = (branch: BranchStock) =>
      normalizedLines.reduce(
        (total, line) =>
          total +
          Math.min(line.quantity, Math.max(0, branch.stock[line.variantId] ?? 0)),
        0,
      );
    return score(right) - score(left) ||
      Number(right.branchId === options.preferredBranchId) -
      Number(left.branchId === options.preferredBranchId);
  });
  const allocations: BranchAllocation[] = [];

  for (const branch of rankedBranches) {
    const items = normalizedLines.flatMap((line) => {
      const needed = remaining.get(line.variantId) ?? 0;
      const quantity = Math.min(
        needed,
        Math.max(0, branch.stock[line.variantId] ?? 0),
      );
      if (quantity === 0) return [];
      remaining.set(line.variantId, needed - quantity);
      return [{ variantId: line.variantId, quantity }];
    });

    if (items.length > 0) allocations.push({ branchId: branch.branchId, items });
    if ([...remaining.values()].every((quantity) => quantity === 0)) break;
  }

  return { status: "allocated", split: allocations.length > 1, allocations };
}
