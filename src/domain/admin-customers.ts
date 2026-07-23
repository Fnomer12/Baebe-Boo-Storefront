export type CustomerLoyaltySummary = {
  availablePoints: number;
  pendingPoints: number;
  lifetimePoints: number;
  paidOrders: number;
  lifetimeSpend: number;
};

export type AdminCustomer = {
  id: string;
  memberCode: string;
  parentName: string;
  childName: string;
  phone: string;
  email: string;
  childDob: string;
  createdAt: string;
  loyalty: CustomerLoyaltySummary;
};

function utcDay(date: Date) {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  ));
}

export function daysUntilBirthday(dateOfBirth: string, now = new Date()) {
  const birthDate = new Date(`${dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(birthDate.getTime())) return Number.POSITIVE_INFINITY;

  const today = utcDay(now);
  let birthday = new Date(Date.UTC(
    today.getUTCFullYear(),
    birthDate.getUTCMonth(),
    birthDate.getUTCDate(),
  ));
  if (birthday < today) {
    birthday = new Date(Date.UTC(
      today.getUTCFullYear() + 1,
      birthDate.getUTCMonth(),
      birthDate.getUTCDate(),
    ));
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
    ].some((value) => value.toLocaleLowerCase().includes(normalized)),
  );
}
