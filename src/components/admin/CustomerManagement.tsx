"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Baby,
  Cake,
  CalendarDays,
  Gift,
  Mail,
  Phone,
  Search,
  ShoppingBag,
  Sparkles,
  Trash2,
  UserRound,
  Users,
  WalletCards,
} from "lucide-react";
import {
  ageInYears,
  daysUntilBirthday,
  filterAdminCustomers,
  type AdminCustomer,
} from "@/domain/admin-customers";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminFilterBar,
} from "@/components/admin/AdminWorkspacePrimitives";

type CustomerView = "all" | "birthdays";

function normalizeCustomers(value: unknown): AdminCustomer[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const loyalty =
      row.loyalty && typeof row.loyalty === "object"
        ? row.loyalty as Record<string, unknown>
        : {};
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) return [];

    return [{
      id,
      memberCode: typeof row.memberCode === "string" ? row.memberCode : "",
      parentName: typeof row.parentName === "string" ? row.parentName : "",
      childName: typeof row.childName === "string" ? row.childName : "",
      phone: typeof row.phone === "string" ? row.phone : "",
      email: typeof row.email === "string" ? row.email : "",
      childDob: typeof row.childDob === "string" ? row.childDob : "",
      createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
      loyalty: {
        availablePoints: Number(loyalty.availablePoints || 0),
        pendingPoints: Number(loyalty.pendingPoints || 0),
        lifetimePoints: Number(loyalty.lifetimePoints || 0),
        paidOrders: Number(loyalty.paidOrders || 0),
        lifetimeSpend: Number(loyalty.lifetimeSpend || 0),
      },
    }];
  });
}

export default function CustomerManagement() {
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<CustomerView>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/customers", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || "Customers could not be loaded.");
      }
      const nextCustomers = normalizeCustomers(payload?.customers);
      setCustomers(nextCustomers);
      setSelectedId((current) =>
        current && nextCustomers.some((customer) => customer.id === current)
          ? current
          : nextCustomers[0]?.id ?? null,
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Customers could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const searched = useMemo(
    () => filterAdminCustomers(customers, query),
    [customers, query],
  );
  const visibleCustomers = useMemo(
    () =>
      view === "birthdays"
        ? searched
            .filter((customer) => daysUntilBirthday(customer.childDob) <= 30)
            .sort(
              (first, second) =>
                daysUntilBirthday(first.childDob) -
                daysUntilBirthday(second.childDob),
            )
        : searched,
    [searched, view],
  );
  const selected =
    customers.find((customer) => customer.id === selectedId) ?? null;
  const birthdayCount = customers.filter(
    (customer) => daysUntilBirthday(customer.childDob) <= 30,
  ).length;
  const totalPoints = customers.reduce(
    (sum, customer) => sum + customer.loyalty.availablePoints,
    0,
  );

  async function deleteCustomer(customer: AdminCustomer) {
    if (!window.confirm(
      `Delete ${customer.parentName || "this customer"} and their family membership permanently?`,
    )) return;

    const response = await fetch(`/api/admin/customers/${customer.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.message || "Customer could not be deleted.");
      return;
    }
    setCustomers((current) =>
      current.filter((candidate) => candidate.id !== customer.id),
    );
    setSelectedId((current) => current === customer.id ? null : current);
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#28637d]">
          Relationships and loyalty
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Customers
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">
          Keep parent contacts, children&apos;s milestones, birthday moments and
          loyalty activity together in one family-friendly view.
        </p>
      </header>

      <section aria-label="Customer summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Families"
          value={customers.length.toLocaleString()}
          detail="Active membership records"
          icon={<Users size={19} />}
        />
        <SummaryCard
          label="Children"
          value={customers.filter((customer) => customer.childName).length.toLocaleString()}
          detail="Profiles with child details"
          icon={<Baby size={19} />}
        />
        <SummaryCard
          label="Birthdays"
          value={birthdayCount.toLocaleString()}
          detail="Coming up in 30 days"
          icon={<Cake size={19} />}
        />
        <SummaryCard
          label="Points available"
          value={totalPoints.toLocaleString()}
          detail="Across linked accounts"
          icon={<Sparkles size={19} />}
        />
      </section>

      <AdminFilterBar
        query={query}
        onQueryChange={setQuery}
        queryLabel="Search customers"
        placeholder="Search parent, child, email or member code…"
      >
        <div className="flex rounded-2xl bg-[#f3f5f7] p-1">
          <ViewButton
            active={view === "all"}
            onClick={() => setView("all")}
            label="All customers"
          />
          <ViewButton
            active={view === "birthdays"}
            onClick={() => setView("birthdays")}
            label={`Birthdays (${birthdayCount})`}
          />
        </div>
      </AdminFilterBar>

      {error ? (
        <AdminErrorState description={error} onRetry={() => void load()} />
      ) : loading ? (
        <LoadingState />
      ) : visibleCustomers.length === 0 ? (
        <AdminEmptyState
          title={view === "birthdays" ? "No birthdays coming up" : "No customers found"}
          description={
            view === "birthdays"
              ? "There are no recorded child birthdays in the next 30 days."
              : "Try a different parent, child, contact detail or member code."
          }
          icon={view === "birthdays" ? <Cake size={24} /> : <Search size={24} />}
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_28rem]">
          <CustomerList
            customers={visibleCustomers}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          {selected && (
            <CustomerDetail
              customer={selected}
              onDelete={() => void deleteCustomer(selected)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-black/[0.07] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">{label}</p>
          <strong className="mt-2 block text-2xl">{value}</strong>
        </div>
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#eaf6fb] text-[#28637d]">{icon}</span>
      </div>
      <p className="mt-3 text-xs text-black/45">{detail}</p>
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
        active ? "bg-white text-black shadow-sm" : "text-black/45"
      }`}
    >
      {label}
    </button>
  );
}

function CustomerList({
  customers,
  selectedId,
  onSelect,
}: {
  customers: AdminCustomer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section aria-label="Customer families" className="overflow-hidden rounded-3xl border border-black/[0.07] bg-white shadow-sm">
      <div className="divide-y divide-black/[0.06]">
        {customers.map((customer) => {
          const birthday = daysUntilBirthday(customer.childDob);
          return (
            <button
              type="button"
              key={customer.id}
              onClick={() => onSelect(customer.id)}
              aria-pressed={selectedId === customer.id}
              className={`grid w-full grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 text-left transition sm:grid-cols-[3.25rem_minmax(0,1fr)_10rem_7rem] ${
                selectedId === customer.id ? "bg-[#eaf6fb]" : "hover:bg-[#f8fafb]"
              }`}
            >
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#f4e8df] text-[#8c5946]">
                <UserRound size={20} />
              </span>
              <span className="min-w-0">
                <strong className="block truncate text-sm">{customer.parentName || "Parent"}</strong>
                <small className="mt-1 block truncate text-xs text-black/45">
                  {customer.childName || "Child details pending"} · {customer.memberCode || "Member"}
                </small>
              </span>
              <span className="hidden min-w-0 sm:block">
                <small className="block truncate text-xs text-black/45">{customer.email}</small>
                <small className="mt-1 block truncate text-xs text-black/45">{customer.phone}</small>
              </span>
              <span className="text-right">
                {birthday <= 30 ? (
                  <>
                    <strong className="block text-sm text-[#a64d74]">
                      {birthday === 0 ? "Today" : `${birthday}d`}
                    </strong>
                    <small className="text-[10px] uppercase tracking-wide text-black/40">birthday</small>
                  </>
                ) : (
                  <>
                    <strong className="block text-sm">{customer.loyalty.availablePoints}</strong>
                    <small className="text-[10px] uppercase tracking-wide text-black/40">points</small>
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function CustomerDetail({
  customer,
  onDelete,
}: {
  customer: AdminCustomer;
  onDelete: () => void;
}) {
  const birthday = daysUntilBirthday(customer.childDob);
  const age = ageInYears(customer.childDob);

  return (
    <aside className="h-fit rounded-3xl border border-black/[0.07] bg-white p-5 shadow-sm xl:sticky xl:top-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#28637d]">
            {customer.memberCode || "Family member"}
          </p>
          <h2 className="mt-2 text-xl font-semibold">{customer.parentName || "Parent"}</h2>
          <p className="mt-1 text-sm text-black/45">Parent or guardian</p>
        </div>
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#eaf6fb] text-[#28637d]">
          <UserRound size={21} />
        </span>
      </div>

      <div className="mt-5 space-y-2">
        <ContactRow href={`tel:${customer.phone}`} icon={<Phone size={15} />} value={customer.phone || "No phone"} />
        <ContactRow href={`mailto:${customer.email}`} icon={<Mail size={15} />} value={customer.email || "No email"} />
      </div>

      <section className="mt-5 rounded-3xl bg-[#f9e9ef] p-4">
        <div className="flex items-center gap-2 text-[#9b446b]">
          <Baby size={17} />
          <h3 className="text-sm font-semibold">Child and birthday</h3>
        </div>
        <strong className="mt-3 block text-lg">{customer.childName || "Child details pending"}</strong>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Detail label="Age" value={age === null ? "Not set" : `${age} years`} />
          <Detail
            label="Birthday"
            value={
              birthday === Number.POSITIVE_INFINITY
                ? "Not set"
                : birthday === 0
                  ? "Today"
                  : `In ${birthday} days`
            }
          />
        </div>
        {customer.childDob && (
          <p className="mt-3 flex items-center gap-2 text-xs text-black/50">
            <CalendarDays size={14} />
            {formatDate(customer.childDob)}
          </p>
        )}
      </section>

      <section className="mt-5">
        <div className="flex items-center gap-2">
          <Gift size={17} />
          <h3 className="font-semibold">Loyalty summary</h3>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2">
          <LoyaltyStat icon={<Sparkles size={14} />} label="Available" value={`${customer.loyalty.availablePoints} pts`} />
          <LoyaltyStat icon={<WalletCards size={14} />} label="Lifetime" value={`${customer.loyalty.lifetimePoints} pts`} />
          <LoyaltyStat icon={<ShoppingBag size={14} />} label="Paid orders" value={customer.loyalty.paidOrders.toLocaleString()} />
          <LoyaltyStat icon={<WalletCards size={14} />} label="Lifetime spend" value={`GH₵${customer.loyalty.lifetimeSpend.toLocaleString()}`} />
        </dl>
        {customer.loyalty.pendingPoints > 0 && (
          <p className="mt-3 text-xs text-black/45">
            {customer.loyalty.pendingPoints} points are pending order completion.
          </p>
        )}
      </section>

      <button
        type="button"
        onClick={onDelete}
        className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-red-200 text-sm font-semibold text-red-700 transition hover:bg-red-50"
      >
        <Trash2 size={16} /> Delete customer
      </button>
    </aside>
  );
}

function ContactRow({
  href,
  icon,
  value,
}: {
  href: string;
  icon: React.ReactNode;
  value: string;
}) {
  return (
    <a href={href} className="flex items-center gap-3 rounded-2xl bg-[#f6f7f9] px-3 py-2.5 text-sm">
      <span className="text-black/40">{icon}</span>
      <span className="min-w-0 truncate">{value}</span>
    </a>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/70 p-3">
      <dt className="text-[9px] font-semibold uppercase tracking-wide text-black/40">{label}</dt>
      <dd className="mt-1 text-xs font-semibold">{value}</dd>
    </div>
  );
}

function LoyaltyStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-[#f6f7f9] p-3">
      <dt className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wide text-black/40">{icon}{label}</dt>
      <dd className="mt-1 text-sm font-semibold">{value}</dd>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? "Birthday not set"
    : new Intl.DateTimeFormat("en-GH", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
}

function LoadingState() {
  return (
    <div aria-label="Loading customers" className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_28rem]">
      <div className="h-[32rem] animate-pulse rounded-3xl bg-black/5" />
      <div className="h-[30rem] animate-pulse rounded-3xl bg-black/5" />
    </div>
  );
}
