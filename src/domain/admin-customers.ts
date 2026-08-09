export type CustomerLoyaltySummary = {
  availablePoints: number;
  pendingPoints: number;
  lifetimePoints: number;
  paidOrders: number;
  lifetimeSpend: number;
};

export type AdminCustomerChild = {
  firstName: string;
  dateOfBirth: string | null;
};

export type AdminCustomer = {
  /** `customer_profiles.user_id` for a real customer; `members.id` for a lead. */
  id: string;
  userId: string | null;
  memberCode: string;
  parentName: string;
  /** The child whose birthday is next — see `nextBirthdayChild`. */
  childName: string;
  phone: string;
  email: string;
  childDob: string;
  createdAt: string;
  /**
   * False for a `members` row that has never signed in. Those customers have no
   * orders, no points and no addresses, and telling the two apart is the whole
   * point of the merge — an admin needs to know whether "no orders" means
   * "has not bought anything" or "cannot buy anything yet".
   */
  hasAccount: boolean;
  marketingStatus: string;
  children: AdminCustomerChild[];
  loyalty: CustomerLoyaltySummary;
};

/**
 * The child a family view should lead with: whoever's birthday is soonest.
 *
 * The customer table has one row per family and shows one child. Picking the
 * first row that happened to come back meant a family with three children saw
 * a birthday countdown for whichever one Postgres returned first, which is not
 * a rule anybody could predict or check.
 */
export function nextBirthdayChild(
  children: readonly AdminCustomerChild[],
  now = new Date(),
): AdminCustomerChild | null {
  const dated = children.filter((child) => child.dateOfBirth);
  if (dated.length === 0) return children[0] ?? null;

  return [...dated].sort(
    (first, second) =>
      daysUntilBirthday(first.dateOfBirth as string, now) -
      daysUntilBirthday(second.dateOfBirth as string, now),
  )[0]!;
}

function utcDay(date: Date) {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  ));
}

/**
 * The anniversary of `dateOfBirth` in `year`, clamped to the end of the month.
 *
 * `Date.UTC(2027, 1, 29)` silently rolls over to 1 March, so a child born on 29
 * February had their birthday counted from the wrong day in three years out of
 * four — and disagreed with both the SQL recipient builder and
 * `isBirthdayToday`, which land on 28 February. All three now agree.
 */
function anniversary(year: number, month: number, day: number) {
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, daysInMonth)));
}

export function daysUntilBirthday(dateOfBirth: string, now = new Date()) {
  const birthDate = new Date(`${dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(birthDate.getTime())) return Number.POSITIVE_INFINITY;

  const today = utcDay(now);
  const month = birthDate.getUTCMonth();
  const day = birthDate.getUTCDate();

  let birthday = anniversary(today.getUTCFullYear(), month, day);
  if (birthday < today) {
    birthday = anniversary(today.getUTCFullYear() + 1, month, day);
  }

  return Math.round((birthday.getTime() - today.getTime()) / 86_400_000);
}

export function ageInYears(dateOfBirth: string, now = new Date()) {
  const birthDate = new Date(`${dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(birthDate.getTime())) return null;

  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < birthDate.getUTCMonth() ||
    (now.getUTCMonth() === birthDate.getUTCMonth() &&
      now.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age -= 1;
  return Math.max(0, age);
}

export function ageInMonths(dateOfBirth: string, now = new Date()): number | null {
  const birthDate = new Date(`${dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(birthDate.getTime())) return null;

  const years = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const months = now.getUTCMonth() - birthDate.getUTCMonth();
  const dayDiff = now.getUTCDate() - birthDate.getUTCDate();
  let totalMonths = years * 12 + months;
  if (dayDiff < 0) totalMonths -= 1;
  return Math.max(0, totalMonths);
}

/**
 * Map a child's date of birth to likely `products.age_range` labels used in the
 * Baebe Boo catalog. Labels are Ghana-centric baby age groups and ordered from
 * most specific to most inclusive so callers can query progressively.
 */
export function ageRangeLabelsForChild(
  dateOfBirth: string,
  now = new Date(),
): string[] {
  const months = ageInMonths(dateOfBirth, now);
  if (months === null) return ["all ages"];

  if (months <= 3) return ["newborn/0-3 months", "0-6 months", "0-12 months"];
  if (months <= 6) return ["3-6 months", "0-6 months", "0-12 months"];
  if (months <= 12) return ["6-12 months", "0-12 months", "12-18 months"];
  if (months <= 18) return ["12-18 months", "6-12 months", "1-2 years"];
  if (months <= 24) return ["18-24 months", "1-2 years", "2-3 years"];
  if (months <= 36) return ["2-3 years", "1-2 years", "3-5 years"];
  if (months <= 60) return ["3-5 years", "2-3 years", "5+ years"];
  return ["5+ years", "3-5 years", "all ages"];
}

export function filterAdminCustomers(
  customers: AdminCustomer[],
  query: string,
) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return customers;

  return customers.filter((customer) =>
    [
      customer.memberCode,
      customer.parentName,
      customer.childName,
      customer.phone,
      customer.email,
      // Every child, not only the one on show: searching for a sibling by name
      // used to return nothing for a family that is plainly in the list.
      ...customer.children.map((child) => child.firstName),
    ].some((value) => (value || "").toLocaleLowerCase().includes(normalized)),
  );
}
