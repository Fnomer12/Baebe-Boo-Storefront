"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Baby,
  Cake,
  CalendarClock,
  CalendarDays,
  Gift,
  Mail,
  MailCheck,
  PackageOpen,
  Pencil,
  Phone,
  Plus,
  Search,
  Send,
  ShoppingBag,
  Sparkles,
  Trash2,
  UserRound,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import {
  ageInMonths,
  ageInYears,
  daysUntilBirthday,
  filterAdminCustomers,
  type AdminCustomer,
} from "@/domain/admin-customers";
import { countFamilies } from "@/domain/crm/campaign-send";
import {
  AdminDataTable,
  AdminEmptyState,
  AdminErrorState,
  AdminFilterBar,
  AdminModal,
  AdminSelect,
  type AdminTableColumn,
} from "@/components/admin/AdminWorkspacePrimitives";
import { AdminHint, HintedField } from "@/components/admin/AdminHint";
import ExportCsvButton from "@/components/admin/ExportCsvButton";

type CustomerView = "all" | "birthdays";
type DetailTab = "overview" | "orders" | "children" | "recommendations" | "returns" | "loyalty";
type FieldErrors = Record<string, string>;

type AdminOrderItem = {
  id: string;
  productId: string | null;
  productName: string;
  quantity: number;
  price: number;
};

type AdminOrder = {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  totalAmount: number;
  paymentStatus: string;
  status: string;
  orderType: string;
  createdAt: string;
  updatedAt: string;
  items: AdminOrderItem[];
};

type AdminReturnItem = {
  orderItemId: string;
  productName: string;
  quantity: number;
  condition: string;
  resolution: string;
};

type AdminReturn = {
  id: string;
  orderId: string;
  status: string;
  reason: string;
  notes: string;
  requestedAt: string;
  resolvedAt: string | null;
  updatedAt: string;
  items: AdminReturnItem[];
};

type AdminChild = {
  id: string;
  firstName: string;
  dateOfBirth: string | null;
  ageRangeTaxonomyId: string | null;
  createdAt: string;
  /** `"member"` children have no account to attach to until the merge backfill runs. */
  source: "profile" | "member";
};

type AdminProfile = {
  userId: string;
  email: string;
  fullName: string;
  phone: string;
  dateOfBirth: string | null;
  marketingStatus: string;
  createdAt: string;
  updatedAt: string;
} | null;

type AdminRecommendationProduct = {
  id: string;
  name: string;
  category: string;
  ageRange: string;
  gender: string;
  price: number;
  imageUrl: string;
};

type AdminCampaign = {
  id: string;
  name: string;
  campaignType: string;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  audienceCount: number;
  recipientCount: number;
  pendingCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

type BirthdayRecipient = {
  userId: string | null;
  email: string;
  parentName: string;
  childName: string;
  childDateOfBirth: string | null;
  daysUntilBirthday: number;
};

type CampaignPreview = {
  daysAhead: number;
  count: number;
  recipients: BirthdayRecipient[];
  preview: { subject: string; html: string; sampledFrom: string | null; unresolved: string[] };
  tokens: { token: string; describes: string }[];
  emailConfigured: boolean;
};

/**
 * Move the server's per-child errors onto the rows the admin can actually see.
 *
 * THE BUG THIS FIXES
 * ------------------
 * `PATCH /api/admin/customers/[id]` answers a bad child with
 * `errors: { "children.0.firstName": "Give the child a name." }` — and the form
 * rendered none of it. The admin got "Check the highlighted fields." with
 * nothing highlighted, no clue which of six children was wrong, and no way to
 * proceed except to guess.
 *
 * The remapping is necessary because blank rows are stripped before the
 * request, so `children.0` on the wire is not `children[0]` on the screen. Sent
 * from a form holding [blank, Kojo], the server's `children.0` IS Kojo, the
 * second row. `rowForSentIndex[sent] = row` puts the message back where the
 * offending input is. The create path only sends one child, under
 * `childFirstName` / `childDateOfBirth`, so those map onto the first row sent.
 */
export function mapChildErrors(
  errors: FieldErrors,
  rowForSentIndex: readonly number[],
): FieldErrors {
  const mapped: FieldErrors = {};

  for (const [key, message] of Object.entries(errors)) {
    const indexed = /^children\.(\d+)\.(firstName|dateOfBirth)$/.exec(key);
    if (indexed) {
      const row = rowForSentIndex[Number(indexed[1])];
      mapped[row === undefined ? key : `children.${row}.${indexed[2]}`] = message;
      continue;
    }
    if (key === "childFirstName" || key === "childDateOfBirth") {
      const row = rowForSentIndex[0];
      const field = key === "childFirstName" ? "firstName" : "dateOfBirth";
      mapped[row === undefined ? key : `children.${row}.${field}`] = message;
      continue;
    }
    mapped[key] = message;
  }

  return mapped;
}

async function readFailure(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
    errors?: FieldErrors;
  };
  return {
    message: payload.message || fallback,
    errors: payload.errors && typeof payload.errors === "object" ? payload.errors : {},
  };
}

function normalizeCustomers(value: unknown): AdminCustomer[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const loyalty =
      row.loyalty && typeof row.loyalty === "object"
        ? (row.loyalty as Record<string, unknown>)
        : {};
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) return [];

    return [
      {
        id,
        userId: typeof row.userId === "string" ? row.userId : null,
        memberCode: typeof row.memberCode === "string" ? row.memberCode : "",
        parentName: typeof row.parentName === "string" ? row.parentName : "",
        childName: typeof row.childName === "string" ? row.childName : "",
        phone: typeof row.phone === "string" ? row.phone : "",
        email: typeof row.email === "string" ? row.email : "",
        childDob: typeof row.childDob === "string" ? row.childDob : "",
        createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
        hasAccount: row.hasAccount === true,
        marketingStatus: typeof row.marketingStatus === "string" ? row.marketingStatus : "unknown",
        children: Array.isArray(row.children)
          ? row.children.map((child) => {
              const childRow = (child || {}) as Record<string, unknown>;
              return {
                firstName: String(childRow.firstName || ""),
                dateOfBirth: childRow.dateOfBirth ? String(childRow.dateOfBirth) : null,
              };
            })
          : [],
        loyalty: {
          availablePoints: Number(loyalty.availablePoints || 0),
          pendingPoints: Number(loyalty.pendingPoints || 0),
          lifetimePoints: Number(loyalty.lifetimePoints || 0),
          paidOrders: Number(loyalty.paidOrders || 0),
          lifetimeSpend: Number(loyalty.lifetimeSpend || 0),
        },
      },
    ];
  });
}

function normalizeOrders(value: unknown): AdminOrder[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = (item || {}) as Record<string, unknown>;
    const items = Array.isArray(row.items) ? row.items : [];
    return {
      id: String(row.id || ""),
      orderNumber: String(row.orderNumber || ""),
      customerName: String(row.customerName || ""),
      customerEmail: String(row.customerEmail || ""),
      customerPhone: String(row.customerPhone || ""),
      totalAmount: Number(row.totalAmount || 0),
      paymentStatus: String(row.paymentStatus || ""),
      status: String(row.status || ""),
      orderType: String(row.orderType || ""),
      createdAt: String(row.createdAt || ""),
      updatedAt: String(row.updatedAt || ""),
      items: items.map((entry) => {
        const itemRow = (entry || {}) as Record<string, unknown>;
        return {
          id: String(itemRow.id || ""),
          productId: itemRow.productId ? String(itemRow.productId) : null,
          productName: String(itemRow.productName || ""),
          quantity: Number(itemRow.quantity || 0),
          price: Number(itemRow.price || 0),
        };
      }),
    };
  });
}

function normalizeReturns(value: unknown): AdminReturn[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = (item || {}) as Record<string, unknown>;
    const items = Array.isArray(row.items) ? row.items : [];
    return {
      id: String(row.id || ""),
      orderId: String(row.orderId || ""),
      status: String(row.status || ""),
      reason: String(row.reason || ""),
      notes: String(row.notes || ""),
      requestedAt: String(row.requestedAt || ""),
      resolvedAt: row.resolvedAt ? String(row.resolvedAt) : null,
      updatedAt: String(row.updatedAt || ""),
      items: items.map((entry) => {
        const itemRow = (entry || {}) as Record<string, unknown>;
        return {
          orderItemId: String(itemRow.orderItemId || ""),
          productName: String(itemRow.productName || ""),
          quantity: Number(itemRow.quantity || 0),
          condition: String(itemRow.condition || ""),
          resolution: String(itemRow.resolution || ""),
        };
      }),
    };
  });
}

function normalizeChildren(value: unknown): AdminChild[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = (item || {}) as Record<string, unknown>;
    return {
      id: String(row.id || ""),
      firstName: String(row.firstName || ""),
      dateOfBirth: row.dateOfBirth ? String(row.dateOfBirth) : null,
      ageRangeTaxonomyId: row.ageRangeTaxonomyId ? String(row.ageRangeTaxonomyId) : null,
      createdAt: String(row.createdAt || ""),
      source: row.source === "member" ? "member" : "profile",
    };
  });
}

function normalizeRecommendations(value: unknown): {
  childName: string;
  ageRangeLabels: string[];
  products: AdminRecommendationProduct[];
} {
  const row = (value || {}) as Record<string, unknown>;
  const products = Array.isArray(row.products) ? row.products : [];
  return {
    childName: String(row.childName || "Child"),
    ageRangeLabels: Array.isArray(row.ageRangeLabels) ? row.ageRangeLabels.map(String) : [],
    products: products.map((entry) => {
      const productRow = (entry || {}) as Record<string, unknown>;
      return {
        id: String(productRow.id || ""),
        name: String(productRow.name || ""),
        category: String(productRow.category || ""),
        ageRange: String(productRow.ageRange || ""),
        gender: String(productRow.gender || ""),
        price: Number(productRow.price || 0),
        imageUrl: String(productRow.imageUrl || ""),
      };
    }),
  };
}

function normalizeProfile(value: unknown): AdminProfile {
  const row = (value || {}) as Record<string, unknown>;
  const profile = row.profile;
  if (!profile || typeof profile !== "object") return null;
  const p = profile as Record<string, unknown>;
  return {
    userId: String(p.userId || ""),
    email: String(p.email || ""),
    fullName: String(p.fullName || ""),
    phone: String(p.phone || ""),
    dateOfBirth: p.dateOfBirth ? String(p.dateOfBirth) : null,
    marketingStatus: String(p.marketingStatus || ""),
    createdAt: String(p.createdAt || ""),
    updatedAt: String(p.updatedAt || ""),
  };
}

function normalizeCampaigns(value: unknown): AdminCampaign[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = (item || {}) as Record<string, unknown>;
    return {
      id: String(row.id || ""),
      name: String(row.name || ""),
      campaignType: String(row.campaignType || ""),
      status: String(row.status || ""),
      scheduledAt: row.scheduledAt ? String(row.scheduledAt) : null,
      sentAt: row.sentAt ? String(row.sentAt) : null,
      audienceCount: Number(row.audienceCount || 0),
      recipientCount: Number(row.recipientCount || 0),
      pendingCount: Number(row.pendingCount || 0),
      lastError: row.lastError ? String(row.lastError) : null,
      createdAt: String(row.createdAt || ""),
      updatedAt: String(row.updatedAt || ""),
    };
  });
}

export default function CustomerManagement() {
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<CustomerView>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ customer: AdminCustomer | null } | null>(null);

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
          : (nextCustomers[0]?.id ?? null),
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Customers could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const searched = useMemo(() => filterAdminCustomers(customers, query), [customers, query]);
  const visibleCustomers = useMemo(
    () =>
      view === "birthdays"
        ? searched
            .filter((customer) => daysUntilBirthday(customer.childDob) <= 30)
            .sort(
              (first, second) =>
                daysUntilBirthday(first.childDob) - daysUntilBirthday(second.childDob),
            )
        : searched,
    [searched, view],
  );
  const selected = customers.find((customer) => customer.id === selectedId) ?? null;
  const birthdayCount = customers.filter(
    (customer) => daysUntilBirthday(customer.childDob) <= 30,
  ).length;
  const totalPoints = customers.reduce(
    (sum, customer) => sum + customer.loyalty.availablePoints,
    0,
  );
  const leadCount = customers.filter((customer) => !customer.hasAccount).length;

  async function deleteCustomer(customer: AdminCustomer) {
    const warning = customer.hasAccount
      ? `Delete ${customer.parentName || "this customer"}?\n\nThis removes their sign-in account, their saved children, addresses and reward points. Orders they have already placed are kept for your records.\n\nThis cannot be undone.`
      : `Delete ${customer.parentName || "this family lead"}?\n\nThey have never signed in, so this only removes their family sign-up.\n\nThis cannot be undone.`;
    if (!window.confirm(warning)) return;

    const response = await fetch(`/api/admin/customers/${customer.id}`, { method: "DELETE" });
    if (!response.ok) {
      const failure = await readFailure(response, "Customer could not be deleted.");
      setError(failure.message);
      return;
    }
    setCustomers((current) => current.filter((candidate) => candidate.id !== customer.id));
    setSelectedId((current) => (current === customer.id ? null : current));
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#28637d]">
          Relationships and loyalty
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Customers</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">
          Keep parent contacts, children&apos;s milestones, birthday moments and loyalty activity
          together in one family-friendly view.
        </p>
      </header>

      <section aria-label="Customer summary" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Customers"
          value={customers.length.toLocaleString()}
          detail={
            leadCount > 0
              ? `${leadCount.toLocaleString()} have not signed in yet`
              : "Everyone has a sign-in account"
          }
          icon={<Users size={19} />}
        />
        <SummaryCard
          label="Children"
          value={customers
            .reduce((sum, customer) => sum + customer.children.length, 0)
            .toLocaleString()}
          detail="Across all families"
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
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ExportCsvButton href="/api/admin/reports/export?report=top-customers&limit=100" />
            <button
              type="button"
              onClick={() => setEditing({ customer: null })}
              className="flex h-11 items-center gap-2 rounded-2xl bg-[#28637d] px-4 text-sm font-semibold text-white transition hover:bg-[#1e4a5e]"
            >
              <Plus size={16} /> Add customer
            </button>
          </div>
        }
      >
        <div className="flex rounded-2xl bg-[#f3f5f7] p-1">
          <ViewButton active={view === "all"} onClick={() => setView("all")} label="All customers" />
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
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_28rem]">
          <div className="space-y-5">
            <CustomerList
              customers={visibleCustomers}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
            <CampaignSection />
          </div>
          {selected && (
            <CustomerDetailPanel
              customer={selected}
              onEdit={() => setEditing({ customer: selected })}
              onDelete={() => void deleteCustomer(selected)}
            />
          )}
        </div>
      )}

      {editing && (
        <CustomerFormModal
          customer={editing.customer}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

/**
 * Create and edit a customer.
 *
 * There was no create and no edit in this admin panel at all — a wrong name or
 * a mistyped birthday could only be fixed with SQL. Everything a birthday
 * campaign depends on is here: the parent's mailbox, and each child with a
 * date of birth.
 */
function CustomerFormModal({
  customer,
  onClose,
  onSaved,
}: {
  customer: AdminCustomer | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const isEdit = Boolean(customer);
  const [email, setEmail] = useState(customer?.email || "");
  const [fullName, setFullName] = useState(customer?.parentName || "");
  const [phone, setPhone] = useState(customer?.phone || "");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [marketingStatus, setMarketingStatus] = useState(customer?.marketingStatus || "unknown");
  const [children, setChildren] = useState<{ id?: string; firstName: string; dateOfBirth: string }[]>(
    [],
  );
  const [childrenLoaded, setChildrenLoaded] = useState(!isEdit);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!customer) return;
    let cancelled = false;

    fetch(`/api/admin/customers/${customer.id}/profile`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (cancelled || !response.ok) return;
        const profile = normalizeProfile(payload);
        if (profile) {
          setFullName((current) => current || profile.fullName);
          setPhone((current) => current || profile.phone);
          setDateOfBirth(profile.dateOfBirth || "");
          setMarketingStatus(profile.marketingStatus || "unknown");
        }
        setChildren(
          normalizeChildren(payload?.children).map((child) => ({
            // A child that only exists on a members row has no id to update, so
            // saving turns it into a real customer_children row.
            id: child.source === "profile" ? child.id : undefined,
            firstName: child.firstName,
            dateOfBirth: child.dateOfBirth || "",
          })),
        );
      })
      .finally(() => {
        if (!cancelled) setChildrenLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [customer]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError("");

    // Which form row each SENT child came from. Blank rows never reach the
    // server, so without this the server's `children.2` would be pinned to the
    // wrong input — see `mapChildErrors`.
    const rowForSentIndex: number[] = [];
    const cleanedChildren: { id?: string; firstName: string; dateOfBirth?: string }[] = [];
    children.forEach((child, index) => {
      if (!child.firstName.trim() && !child.dateOfBirth) return;
      rowForSentIndex.push(index);
      cleanedChildren.push({
        ...(child.id ? { id: child.id } : {}),
        firstName: child.firstName.trim(),
        dateOfBirth: child.dateOfBirth || undefined,
      });
    });

    const response = await fetch(
      isEdit ? `/api/admin/customers/${customer!.id}` : "/api/admin/customers",
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isEdit
            ? {
                fullName: fullName.trim(),
                phone: phone.trim() || undefined,
                dateOfBirth: dateOfBirth || undefined,
                marketingStatus,
                children: cleanedChildren,
              }
            : {
                email: email.trim(),
                fullName: fullName.trim(),
                phone: phone.trim() || undefined,
                dateOfBirth: dateOfBirth || undefined,
                marketingStatus,
                childFirstName: cleanedChildren[0]?.firstName,
                childDateOfBirth: cleanedChildren[0]?.dateOfBirth,
              },
        ),
      },
    );
    setSaving(false);

    if (!response.ok) {
      // The form stays exactly as the user left it: nothing is unmounted and
      // nothing is cleared, so a rejected save costs a correction, not a retype.
      const failure = await readFailure(
        response,
        isEdit ? "This customer could not be saved." : "This customer could not be added.",
      );
      setErrors(mapChildErrors(failure.errors, rowForSentIndex));
      setFormError(failure.message);
      return;
    }

    await onSaved();
  }

  return (
    <AdminModal
      open
      onClose={onClose}
      size="md"
      subtitle={isEdit ? "Edit customer" : "New customer"}
      title={isEdit ? customer!.parentName || "Customer" : "Add a customer"}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-2xl border border-[var(--color-line)] px-4 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="customer-form"
            disabled={saving || !childrenLoaded}
            className="h-11 rounded-2xl bg-[#28637d] px-5 text-sm font-semibold text-white transition hover:bg-[#1e4a5e] disabled:opacity-60"
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add customer"}
          </button>
        </div>
      }
    >
      <form id="customer-form" onSubmit={handleSubmit} className="space-y-5">
        {formError && <InlineError message={formError} />}
        {isEdit && customer && !customer.hasAccount && (
          <InlineNote>
            This family filled in the sign-up form on the website but has never signed in, so they
            have no account yet. You can correct their name, phone and their child&apos;s birthday
            here, and their birthday emails work either way. Marketing emails and the parent&apos;s
            own birthday can only be recorded once they sign in — the form will tell you rather
            than pretend to save them.
          </InlineNote>
        )}

        <HintedField
          label="Email"
          required={!isEdit}
          htmlFor="customer-email"
          error={errors.email}
          hint="Where their birthday emails, receipts and sign-in codes go. This is also how they sign in — there is no password. It cannot be changed here once the customer exists."
        >
          <input
            id="customer-email"
            type="email"
            className="admin-input"
            value={isEdit ? customer!.email : email}
            onChange={(event) => setEmail(event.target.value)}
            readOnly={isEdit}
            disabled={isEdit}
            required={!isEdit}
          />
        </HintedField>

        <HintedField
          label="Parent or guardian name"
          required
          htmlFor="customer-name"
          error={errors.fullName}
          hint="How you greet them. This is the name that appears at the top of every email — “Hi Ama,”."
        >
          <input
            id="customer-name"
            className="admin-input"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
          />
        </HintedField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <HintedField
            label="Phone"
            htmlFor="customer-phone"
            error={errors.phone}
            hint="For calling about a delivery or a click-and-collect pickup. Not used for marketing."
          >
            <input
              id="customer-phone"
              type="tel"
              inputMode="tel"
              className="admin-input"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </HintedField>

          <HintedField
            label="Parent's own birthday"
            htmlFor="customer-dob"
            error={errors.dateOfBirth}
            hint="The PARENT's birthday, not the child's. Children go in the list below — birthday campaigns and birthday points use the children's dates, never this one."
          >
            <input
              id="customer-dob"
              type="date"
              className="admin-input"
              value={dateOfBirth}
              onChange={(event) => setDateOfBirth(event.target.value)}
            />
          </HintedField>
        </div>

        <HintedField
          label="Marketing emails"
          htmlFor="customer-marketing"
          error={errors.marketingStatus}
          hint="“Subscribed” means they have agreed to hear from you. “Not asked” is for someone who has never been asked — a customer added by your team, for example. Set “Unsubscribed” if they ask to be taken off the list."
        >
          <AdminSelect
            id="customer-marketing"
            value={marketingStatus}
            onChange={(event) => setMarketingStatus(event.target.value)}
          >
            <option value="unknown">Not asked</option>
            <option value="subscribed">Subscribed</option>
            <option value="unsubscribed">Unsubscribed</option>
          </AdminSelect>
        </HintedField>

        <fieldset className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-cream)]/60 p-4">
          <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold">
            Children
            <AdminHint label="Why record children?">
              Every birthday email and every birthday reward comes from these dates. A child with no
              date of birth will never appear in a birthday campaign.
            </AdminHint>
          </legend>

          <div className="mt-2 space-y-3">
            {children.length === 0 && (
              <p className="text-sm text-[var(--color-ink-soft)]">No children recorded yet.</p>
            )}
            {children.map((child, index) => {
              // Rendered, at last. The server has always sent these; the form
              // threw them away and said "Check the highlighted fields."
              const nameError = errors[`children.${index}.firstName`];
              const dobError = errors[`children.${index}.dateOfBirth`];
              // Every message for this row, including any field the form does
              // not render an input for, so nothing can be returned and lost.
              const rowErrors = Object.entries(errors)
                .filter(([key]) => key.startsWith(`children.${index}.`))
                .map(([, message]) => message);

              return (
                <div key={child.id || `new-${index}`} className="space-y-1">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_2.75rem]">
                    <input
                      aria-label={`Child ${index + 1} first name`}
                      aria-invalid={nameError ? true : undefined}
                      className="admin-input"
                      placeholder="First name"
                      value={child.firstName}
                      onChange={(event) =>
                        setChildren((current) =>
                          current.map((row, position) =>
                            position === index ? { ...row, firstName: event.target.value } : row,
                          ),
                        )
                      }
                    />
                    <input
                      aria-label={`Child ${index + 1} date of birth`}
                      aria-invalid={dobError ? true : undefined}
                      type="date"
                      className="admin-input"
                      value={child.dateOfBirth}
                      onChange={(event) =>
                        setChildren((current) =>
                          current.map((row, position) =>
                            position === index ? { ...row, dateOfBirth: event.target.value } : row,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      aria-label={`Remove child ${index + 1}`}
                      onClick={() =>
                        setChildren((current) => current.filter((_, position) => position !== index))
                      }
                      className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--color-line)] text-red-700 transition hover:bg-red-50"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  {rowErrors.length > 0 && (
                    <p role="alert" className="text-xs font-medium text-red-700">
                      {rowErrors.join(" ")}
                    </p>
                  )}
                </div>
              );
            })}
            {errors.children && (
              <p role="alert" className="text-xs font-medium text-red-700">
                {errors.children}
              </p>
            )}
            <button
              type="button"
              onClick={() =>
                setChildren((current) => [...current, { firstName: "", dateOfBirth: "" }])
              }
              className="flex h-11 items-center gap-2 rounded-2xl border border-dashed border-[var(--color-line)] px-4 text-sm font-semibold"
            >
              <Plus size={15} /> Add a child
            </button>
            {!isEdit && children.length > 1 && (
              <InlineNote>
                Only the first child is saved when adding a new customer. Save, then open them again
                to add the rest.
              </InlineNote>
            )}
            {isEdit && customer && !customer.hasAccount && children.length > 1 && (
              // A lead lives on a `members` row, which holds exactly one child.
              // Said before the save rather than discovered afterwards.
              <InlineNote>
                Only the first child is kept for a family that has never signed in. The rest can be
                added once they do.
              </InlineNote>
            )}
          </div>
        </fieldset>
      </form>
    </AdminModal>
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
  icon: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-black/[0.07] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">
            {label}
          </p>
          <strong className="mt-2 block text-2xl">{value}</strong>
        </div>
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#eaf6fb] text-[#28637d]">
          {icon}
        </span>
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
      className={`min-h-11 rounded-xl px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#28637d] focus-visible:ring-offset-2 ${
        active ? "bg-white text-black shadow-sm" : "text-black/45 hover:bg-white/50 hover:text-black"
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
    <section
      aria-label="Customer families"
      className="overflow-hidden rounded-3xl border border-black/[0.07] bg-white shadow-sm"
    >
      <div className="divide-y divide-black/[0.06]">
        {customers.map((customer) => {
          const birthday = daysUntilBirthday(customer.childDob);
          return (
            <button
              type="button"
              key={customer.id}
              onClick={() => onSelect(customer.id)}
              aria-pressed={selectedId === customer.id}
              className={`grid w-full grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 text-left transition focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#28637d] sm:grid-cols-[3.25rem_minmax(0,1fr)_10rem_7rem] ${
                selectedId === customer.id ? "bg-[#eaf6fb]" : "hover:bg-[#f8fafb]"
              }`}
            >
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#f4e8df] text-[#8c5946]">
                <UserRound size={20} />
              </span>
              <span className="min-w-0">
                <strong className="block truncate text-sm">
                  {customer.parentName || "Parent"}
                </strong>
                <small className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-black/45">
                  <span className="truncate">
                    {customer.childName || "Child details pending"}
                    {customer.children.length > 1 && ` +${customer.children.length - 1}`}
                  </span>
                  {!customer.hasAccount && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                      No account
                    </span>
                  )}
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
                    <small className="text-[10px] uppercase tracking-wide text-black/40">
                      birthday
                    </small>
                  </>
                ) : (
                  <>
                    <strong className="block text-sm">{customer.loyalty.availablePoints}</strong>
                    <small className="text-[10px] uppercase tracking-wide text-black/40">
                      points
                    </small>
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

function CustomerDetailPanel({
  customer,
  onEdit,
  onDelete,
}: {
  customer: AdminCustomer;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [tab, setTab] = useState<DetailTab>("overview");

  return (
    <aside className="h-fit rounded-3xl border border-black/[0.07] bg-white p-5 shadow-sm xl:sticky xl:top-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#28637d]">
            {customer.memberCode || (customer.hasAccount ? "Customer" : "Family lead")}
          </p>
          <h2 className="mt-2 text-xl font-semibold">{customer.parentName || "Parent"}</h2>
          <p className="mt-1 text-sm text-black/45">
            {customer.hasAccount ? "Can sign in and shop" : "Has never signed in"}
          </p>
        </div>
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#eaf6fb] text-[#28637d]">
          <UserRound size={21} />
        </span>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {(
          [
            ["overview", "Overview"],
            ["orders", "Orders"],
            ["children", "Children"],
            ["recommendations", "For you"],
            ["returns", "Returns"],
            ["loyalty", "Loyalty"],
          ] as const
        ).map(([key, label]) => (
          <TabButton key={key} active={tab === key} onClick={() => setTab(key)} label={label} />
        ))}
      </div>

      <div className="mt-5" key={customer.id}>
        {tab === "overview" && <OverviewTab customer={customer} />}
        {tab === "orders" && <OrdersTab customerId={customer.id} />}
        {tab === "children" && <ChildrenTab customerId={customer.id} />}
        {tab === "recommendations" && <RecommendationsTab customerId={customer.id} />}
        {tab === "returns" && <ReturnsTab customerId={customer.id} />}
        {tab === "loyalty" && <LoyaltyTab customer={customer} />}
      </div>

      {tab === "overview" && (
        <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={onEdit}
            className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#28637d] text-sm font-semibold text-white transition hover:bg-[#1e4a5e]"
          >
            <Pencil size={16} /> Edit customer
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-red-200 text-sm font-semibold text-red-700 transition hover:bg-red-50"
          >
            <Trash2 size={16} /> Delete
          </button>
        </div>
      )}
    </aside>
  );
}

function TabButton({
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
      className={`min-h-11 rounded-xl px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#28637d] focus-visible:ring-offset-2 ${
        active
          ? "bg-[#28637d] text-white"
          : "bg-[#f3f5f7] text-black/55 hover:bg-[#eaf6fb] hover:text-[#28637d]"
      }`}
    >
      {label}
    </button>
  );
}

function OverviewTab({ customer }: { customer: AdminCustomer }) {
  const birthday = daysUntilBirthday(customer.childDob);
  const age = ageInYears(customer.childDob);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <ContactRow
          href={`tel:${customer.phone}`}
          icon={<Phone size={15} />}
          value={customer.phone || "No phone"}
        />
        <ContactRow
          href={`mailto:${customer.email}`}
          icon={<Mail size={15} />}
          value={customer.email || "No email"}
        />
      </div>

      {!customer.hasAccount && (
        <InlineNote>
          This family signed up on the website but has never signed in, so they have no orders,
          points or saved addresses yet.
        </InlineNote>
      )}

      <section className="rounded-3xl bg-[#f9e9ef] p-4">
        <div className="flex items-center gap-2 text-[#9b446b]">
          <Baby size={17} />
          <h3 className="text-sm font-semibold">Next birthday</h3>
        </div>
        <strong className="mt-3 block text-lg">
          {customer.childName || "Child details pending"}
        </strong>
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

      <section>
        <div className="flex items-center gap-2">
          <Gift size={17} />
          <h3 className="font-semibold">Loyalty summary</h3>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2">
          <LoyaltyStat
            icon={<Sparkles size={14} />}
            label="Available"
            value={`${customer.loyalty.availablePoints} pts`}
          />
          <LoyaltyStat
            icon={<WalletCards size={14} />}
            label="Lifetime"
            value={`${customer.loyalty.lifetimePoints} pts`}
          />
          <LoyaltyStat
            icon={<ShoppingBag size={14} />}
            label="Paid orders"
            value={customer.loyalty.paidOrders.toLocaleString()}
          />
          <LoyaltyStat
            icon={<WalletCards size={14} />}
            label="Lifetime spend"
            value={`GH₵${customer.loyalty.lifetimeSpend.toLocaleString()}`}
          />
        </dl>
        {customer.loyalty.pendingPoints > 0 && (
          <p className="mt-3 text-xs text-black/45">
            {customer.loyalty.pendingPoints} points are pending order completion.
          </p>
        )}
      </section>
    </div>
  );
}

function OrdersTab({ customerId }: { customerId: string }) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/admin/customers/${customerId}/orders`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok) throw new Error(payload?.message || "Orders could not be loaded.");
        setOrders(normalizeOrders(payload?.orders));
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Orders could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [customerId]);

  if (loading) return <DetailLoadingState />;
  if (error) return <AdminErrorState description={error} />;
  if (orders.length === 0)
    return (
      <AdminEmptyState
        title="No orders yet"
        description="This family has no recorded orders."
        icon={<ShoppingBag size={24} />}
      />
    );

  const columns: AdminTableColumn<AdminOrder>[] = [
    {
      key: "orderNumber",
      header: "Order",
      cell: (row) => (
        <span>
          <span className="block font-medium">{row.orderNumber || "—"}</span>
          <span className="text-xs text-black/45">{row.orderType}</span>
        </span>
      ),
    },
    { key: "total", header: "Total", cell: (row) => `GH₵${row.totalAmount.toLocaleString()}` },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <span className="inline-flex items-center rounded-full bg-[#f3f5f7] px-2 py-1 text-xs font-medium">
          {row.status}
        </span>
      ),
    },
    { key: "payment", header: "Payment", cell: (row) => row.paymentStatus },
    { key: "items", header: "Items", cell: (row) => row.items.length },
    { key: "date", header: "Date", cell: (row) => formatDateTime(row.createdAt) },
  ];

  return (
    <div className="space-y-3">
      <AdminDataTable
        rows={orders}
        columns={columns}
        rowKey={(row) => row.id}
        caption="Customer orders"
      />
    </div>
  );
}

function ChildrenTab({ customerId }: { customerId: string }) {
  const [profile, setProfile] = useState<AdminProfile>(null);
  const [children, setChildren] = useState<AdminChild[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/admin/customers/${customerId}/profile`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok) throw new Error(payload?.message || "Profile could not be loaded.");
        setProfile(normalizeProfile(payload));
        setChildren(normalizeChildren(payload?.children));
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Children could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [customerId]);

  if (loading) return <DetailLoadingState />;
  if (error) return <AdminErrorState description={error} />;
  if (children.length === 0)
    return (
      <AdminEmptyState
        title="No children on file"
        description="Use Edit customer to add a child and their birthday."
        icon={<Baby size={24} />}
      />
    );

  return (
    <div className="space-y-3">
      {profile?.marketingStatus && (
        <p className="text-xs text-black/50">
          Marketing status:{" "}
          <span className="font-medium capitalize text-[#28637d]">{profile.marketingStatus}</span>
        </p>
      )}
      {children.map((child) => {
        const ageMonths = child.dateOfBirth ? ageInMonths(child.dateOfBirth) : null;
        return (
          <div
            key={child.id}
            className="rounded-3xl border border-black/[0.07] bg-[#f8fafb] p-4"
          >
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#f4e8df] text-[#8c5946]">
                <Baby size={18} />
              </span>
              <div className="min-w-0">
                <strong className="block text-sm">{child.firstName || "Child"}</strong>
                <span className="text-xs text-black/45">
                  {ageMonths !== null ? `${ageMonths} months old` : "Age not set"}
                </span>
              </div>
            </div>
            {child.dateOfBirth && (
              <p className="mt-3 flex items-center gap-2 text-xs text-black/50">
                <CalendarDays size={14} />
                {formatDate(child.dateOfBirth)}
              </p>
            )}
            {child.source === "member" && (
              <p className="mt-2 text-xs text-amber-800">
                From the website sign-up form. Saving this customer moves them onto the account.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RecommendationsTab({ customerId }: { customerId: string }) {
  const [data, setData] = useState<{
    childName: string;
    ageRangeLabels: string[];
    products: AdminRecommendationProduct[];
  }>({ childName: "Child", ageRangeLabels: [], products: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/admin/customers/${customerId}/recommendations`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok)
          throw new Error(payload?.message || "Recommendations could not be loaded.");
        setData(normalizeRecommendations(payload));
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error ? loadError.message : "Recommendations could not be loaded.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [customerId]);

  if (loading) return <DetailLoadingState />;
  if (error) return <AdminErrorState description={error} />;
  if (data.products.length === 0)
    return (
      <AdminEmptyState
        title="No recommendations"
        description="We could not find any products matching this child's age range."
        icon={<Gift size={24} />}
      />
    );

  return (
    <div className="space-y-4">
      <p className="text-xs text-black/50">
        Picked for {data.childName}
        {data.ageRangeLabels.length > 0 && (
          <>
            {" "}
            ·{" "}
            <span className="text-[#28637d]">{data.ageRangeLabels.slice(0, 2).join(", ")}</span>
          </>
        )}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {data.products.map((product) => (
          <a
            key={product.id}
            href={`/products/${product.id}`}
            className="group overflow-hidden rounded-3xl border border-black/[0.07] bg-white shadow-sm transition hover:shadow-md"
          >
            <div className="aspect-[4/3] bg-[#f3f5f7]">
              {product.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-black/25">
                  <Gift size={24} />
                </div>
              )}
            </div>
            <div className="p-4">
              <p className="truncate text-xs font-semibold text-[#28637d]">
                {product.category || product.ageRange || product.gender}
              </p>
              <strong className="mt-1 block truncate text-sm">{product.name}</strong>
              <p className="mt-2 text-sm font-semibold">GH₵{product.price.toLocaleString()}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function ReturnsTab({ customerId }: { customerId: string }) {
  const [returns, setReturns] = useState<AdminReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/admin/customers/${customerId}/returns`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok) throw new Error(payload?.message || "Returns could not be loaded.");
        setReturns(normalizeReturns(payload?.returns));
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Returns could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [customerId]);

  if (loading) return <DetailLoadingState />;
  if (error) return <AdminErrorState description={error} />;
  if (returns.length === 0)
    return (
      <AdminEmptyState
        title="No returns"
        description="This family has not requested any returns."
        icon={<PackageOpen size={24} />}
      />
    );

  const columns: AdminTableColumn<AdminReturn>[] = [
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <span className="inline-flex items-center rounded-full bg-[#f3f5f7] px-2 py-1 text-xs font-medium capitalize">
          {row.status}
        </span>
      ),
    },
    { key: "reason", header: "Reason", cell: (row) => row.reason },
    { key: "items", header: "Items", cell: (row) => row.items.length },
    { key: "requested", header: "Requested", cell: (row) => formatDateTime(row.requestedAt) },
  ];

  return (
    <div className="space-y-3">
      <AdminDataTable
        rows={returns}
        columns={columns}
        rowKey={(row) => row.id}
        caption="Customer returns"
      />
    </div>
  );
}

function LoyaltyTab({ customer }: { customer: AdminCustomer }) {
  return (
    <div className="space-y-5">
      <section className="rounded-3xl bg-[#eaf6fb] p-4">
        <div className="flex items-center gap-2 text-[#28637d]">
          <Sparkles size={17} />
          <h3 className="text-sm font-semibold">Reward points</h3>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Detail label="Available" value={`${customer.loyalty.availablePoints} pts`} />
          <Detail label="Pending" value={`${customer.loyalty.pendingPoints} pts`} />
          <Detail label="Lifetime" value={`${customer.loyalty.lifetimePoints} pts`} />
          <Detail label="Paid orders" value={customer.loyalty.paidOrders.toLocaleString()} />
        </div>
      </section>

      <section className="rounded-3xl border border-black/[0.07] bg-white p-4">
        <div className="flex items-center gap-2">
          <WalletCards size={17} />
          <h3 className="text-sm font-semibold">Lifetime spend</h3>
        </div>
        <strong className="mt-3 block text-2xl">
          GH₵{customer.loyalty.lifetimeSpend.toLocaleString()}
        </strong>
        <p className="mt-1 text-xs text-black/45">
          Total across completed paid orders for this family.
        </p>
      </section>
    </div>
  );
}

/**
 * Birthday campaigns.
 *
 * The old flow created a draft campaign row and only THEN asked whether there
 * were any recipients, so every exploratory click left an orphan draft with no
 * way to delete it. It also called a send "sent" whether or not anything left
 * the building. Here the order is: preview (creates nothing) → look at the
 * actual email → optionally mail yourself a test → create and send.
 */
function CampaignSection() {
  const [campaigns, setCampaigns] = useState<AdminCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [preview, setPreview] = useState<CampaignPreview | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/admin/campaigns", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok) throw new Error(payload?.message || "Campaigns could not be loaded.");
        setCampaigns(normalizeCampaigns(payload?.campaigns));
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Campaigns could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  function refresh() {
    setLoading(true);
    setRefreshKey((key) => key + 1);
  }

  async function openPreview() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/campaigns/preview?days=30", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "Recipients could not be built.");
      setPreview(payload as CampaignPreview);
    } catch (previewError) {
      setError(
        previewError instanceof Error ? previewError.message : "Recipients could not be built.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteCampaign(campaign: AdminCampaign) {
    if (!window.confirm(`Delete “${campaign.name}”? Its recipient list goes with it.`)) return;
    setError("");
    const response = await fetch(`/api/admin/campaigns/${campaign.id}`, { method: "DELETE" });
    if (!response.ok) {
      const failure = await readFailure(response, "Campaign could not be deleted.");
      setError(failure.message);
      return;
    }
    refresh();
  }

  async function sendCampaign(campaign: AdminCampaign) {
    setBusy(true);
    setError("");
    setNotice("");
    const response = await fetch(`/api/admin/campaigns/${campaign.id}/send`, { method: "POST" });
    const payload = await response.json().catch(() => null);
    setBusy(false);

    if (!response.ok) {
      setError(payload?.message || "Campaign could not be sent.");
      refresh();
      return;
    }
    setNotice(payload?.message || `Sent to ${payload?.sent ?? 0} families.`);
    refresh();
  }

  return (
    <section className="rounded-3xl border border-black/[0.07] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[#28637d]">
            <Cake size={17} />
            <h3 className="font-semibold">Birthday campaigns</h3>
            <AdminHint label="What is a birthday campaign?">
              One email to every family with a child whose birthday is in the next 30 days. Each
              parent gets their own child&apos;s name and a countdown, and birthday reward points
              are added to their wallet the morning of the birthday.
            </AdminHint>
          </div>
          <p className="mt-1 text-xs text-black/45">
            See who would receive it and what the email looks like before anything is created.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void openPreview()}
          disabled={busy}
          className="flex min-h-11 items-center gap-2 rounded-2xl bg-[#28637d] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#1e4a5e] disabled:opacity-60"
        >
          <Sparkles size={14} />
          {busy ? "Working…" : "Preview birthday campaign"}
        </button>
      </div>

      {error && (
        <div className="mt-4">
          <InlineError message={error} onDismiss={() => setError("")} />
        </div>
      )}
      {notice && (
        <p className="mt-4 rounded-2xl bg-emerald-50 px-3 py-2 text-xs text-emerald-900">{notice}</p>
      )}

      <div className="mt-5 space-y-2">
        {loading ? (
          <div className="h-24 animate-pulse rounded-2xl bg-black/5" />
        ) : campaigns.length === 0 ? (
          <AdminEmptyState
            title="No campaigns yet"
            description="Preview a birthday campaign to see who it would reach."
            icon={<Cake size={24} />}
          />
        ) : (
          campaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="rounded-2xl border border-black/[0.06] bg-[#f8fafb] px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{campaign.name}</p>
                  <p className="text-xs capitalize text-black/45">
                    {campaign.campaignType} · {campaign.status}
                    {campaign.recipientCount > 0 && ` · ${campaign.recipientCount} recipients`}
                    {campaign.pendingCount > 0 && ` · ${campaign.pendingCount} still queued`}
                  </p>
                  {campaign.scheduledAt && campaign.status !== "sent" && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-black/45">
                      <CalendarClock size={13} /> Scheduled for{" "}
                      {formatDateTime(campaign.scheduledAt)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <CampaignStatusBadge status={campaign.status} />
                  {campaign.status !== "sent" && campaign.recipientCount > 0 && (
                    <button
                      type="button"
                      onClick={() => void sendCampaign(campaign)}
                      disabled={busy}
                      className="flex min-h-11 items-center gap-1.5 rounded-xl bg-[#28637d] px-3 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      <Send size={13} /> Send now
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void deleteCampaign(campaign)}
                    aria-label={`Delete ${campaign.name}`}
                    className="grid h-11 w-11 place-items-center rounded-xl border border-red-200 text-red-700 transition hover:bg-red-50"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              {campaign.lastError && (
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                  {campaign.lastError}
                </p>
              )}
            </div>
          ))
        )}
      </div>

      {preview && (
        <CampaignPreviewModal
          preview={preview}
          onClose={() => setPreview(null)}
          onSent={(message) => {
            setPreview(null);
            setNotice(message);
            refresh();
          }}
          onFailed={(message) => {
            setError(message);
            refresh();
          }}
        />
      )}
    </section>
  );
}

function CampaignPreviewModal({
  preview,
  onClose,
  onSent,
  onFailed,
}: {
  preview: CampaignPreview;
  onClose: () => void;
  onSent: (message: string) => void;
  onFailed: (message: string) => void;
}) {
  /**
   * How many EMAILS this send is: families, not children.
   *
   * `preview.count` is the length of the candidate list, and a candidate is one
   * CHILD. `recipientUpsertRows` then collapses that list on the mailbox, so a
   * parent of twins is two candidates and exactly one recipient — the heading
   * promised "12 families would receive this" for a send that reached eight,
   * and the count the admin was shown before pressing Send never matched the
   * count reported after it.
   */
  const familyCount = useMemo(() => countFamilies(preview.recipients), [preview.recipients]);

  const [tab, setTab] = useState<"email" | "recipients">("email");
  const [busy, setBusy] = useState(false);
  const [testNotice, setTestNotice] = useState("");
  const [testError, setTestError] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");

  async function sendTest() {
    setBusy(true);
    setTestError("");
    setTestNotice("");
    const response = await fetch("/api/admin/campaigns/test", { method: "POST" });
    const payload = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setTestError(payload?.message || "The test email could not be sent.");
      return;
    }
    setTestNotice(`Test email sent to ${payload?.to}. Check your inbox.`);
  }

  /** `schedule` writes the campaign as `ready`; the cron picks it up. */
  async function createCampaign(mode: "now" | "schedule") {
    setBusy(true);
    setErrors({});
    setFormError("");

    const createResponse = await fetch("/api/admin/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Birthday campaign — ${new Date().toLocaleDateString("en-GH")}`,
        campaign_type: "birthday",
        status: mode === "schedule" ? "ready" : "draft",
        scheduled_at: mode === "schedule" ? scheduleAt || undefined : undefined,
      }),
    });
    if (!createResponse.ok) {
      const failure = await readFailure(createResponse, "The campaign could not be created.");
      setErrors(failure.errors);
      setFormError(failure.message);
      setBusy(false);
      return;
    }
    const campaignId = (await createResponse.json().catch(() => null))?.campaign?.id;
    if (!campaignId) {
      setFormError("The campaign could not be created.");
      setBusy(false);
      return;
    }

    const saveResponse = await fetch(`/api/admin/campaigns/${campaignId}/recipients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipients: preview.recipients }),
    });
    if (!saveResponse.ok) {
      const failure = await readFailure(saveResponse, "The recipient list could not be saved.");
      setFormError(failure.message);
      setBusy(false);
      return;
    }

    if (mode === "schedule") {
      setBusy(false);
      onSent(
        `Scheduled for ${formatDateTime(new Date(scheduleAt).toISOString())}. It will go out automatically.`,
      );
      return;
    }

    const sendResponse = await fetch(`/api/admin/campaigns/${campaignId}/send`, { method: "POST" });
    const sendPayload = await sendResponse.json().catch(() => null);
    setBusy(false);

    if (!sendResponse.ok) {
      onFailed(sendPayload?.message || "The campaign could not be sent.");
      onClose();
      return;
    }
    onSent(sendPayload?.message || `Sent to ${sendPayload?.sent ?? 0} families.`);
  }

  return (
    <AdminModal
      open
      onClose={onClose}
      size="lg"
      subtitle="Birthday campaign"
      title={`${familyCount} ${familyCount === 1 ? "family" : "families"} would receive this`}
      footer={
        <div className="flex flex-col gap-3">
          {formError && <InlineError message={formError} />}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-[14rem]">
              <HintedField
                label="Send later"
                htmlFor="campaign-schedule"
                error={errors.scheduled_at}
                hint="Leave this empty and press Send now to email everyone straight away. Pick a date and time to have it go out on its own — the site checks every 15 minutes between 7am and 10am."
              >
                <input
                  id="campaign-schedule"
                  type="datetime-local"
                  className="admin-input"
                  value={scheduleAt}
                  onChange={(event) => setScheduleAt(event.target.value)}
                />
              </HintedField>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-11 rounded-2xl border border-[var(--color-line)] px-4 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || familyCount === 0 || !scheduleAt}
                onClick={() => void createCampaign("schedule")}
                className="flex h-11 items-center gap-2 rounded-2xl border border-[#28637d] px-4 text-sm font-semibold text-[#28637d] disabled:opacity-50"
              >
                <CalendarClock size={16} /> Schedule
              </button>
              <button
                type="button"
                disabled={busy || familyCount === 0}
                onClick={() => void createCampaign("now")}
                className="flex h-11 items-center gap-2 rounded-2xl bg-[#28637d] px-5 text-sm font-semibold text-white transition hover:bg-[#1e4a5e] disabled:opacity-60"
              >
                <Send size={16} /> {busy ? "Working…" : "Send now"}
              </button>
            </div>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {!preview.emailConfigured && (
          <InlineNote>
            This site has no email provider set up, so nothing can actually be delivered. You can
            still build the list — the campaign will be kept unsent until email is working, rather
            than being marked as sent when it was not.
          </InlineNote>
        )}
        {familyCount === 0 && (
          <InlineNote>
            No child has a birthday in the next {preview.daysAhead} days. Add children and their
            birthdays on a customer to build a list.
          </InlineNote>
        )}
        {preview.recipients.length > familyCount && (
          <InlineNote>
            {preview.recipients.length} children have a birthday coming up, but some of them are
            siblings — each family receives one email, named for the child whose birthday is
            nearest.
          </InlineNote>
        )}
        {preview.preview.unresolved.length > 0 && (
          <InlineError
            message={`This email still contains ${preview.preview.unresolved.join(", ")}, which will be sent to parents exactly as written. Tell your developer.`}
          />
        )}

        <div className="flex flex-wrap gap-2">
          <TabButton active={tab === "email"} onClick={() => setTab("email")} label="The email" />
          <TabButton
            active={tab === "recipients"}
            onClick={() => setTab("recipients")}
            label={`Who gets it (${familyCount})`}
          />
        </div>

        {tab === "email" ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-cream)]/60 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-black/40">
                Subject
              </p>
              <p className="mt-1 text-sm font-semibold">{preview.preview.subject}</p>
              {preview.preview.sampledFrom && (
                <p className="mt-2 text-xs text-black/50">
                  Shown with the real details for {preview.preview.sampledFrom}. Every parent gets
                  their own child&apos;s name.
                </p>
              )}
            </div>

            {/*
              An iframe rather than injected markup: the template is a whole
              HTML document with its own <head>, and rendering it inside the
              admin page would let its styles and the panel's fight each other.
              Sandboxed, so nothing in a customer-facing template can run here.
            */}
            <iframe
              title="Email preview"
              sandbox=""
              srcDoc={preview.preview.html}
              className="h-[26rem] w-full rounded-2xl border border-[var(--color-line)] bg-white"
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void sendTest()}
                disabled={busy}
                className="flex h-11 items-center gap-2 rounded-2xl border border-[var(--color-line)] px-4 text-sm font-semibold disabled:opacity-60"
              >
                <MailCheck size={16} /> Send a test to me
              </button>
              {testNotice && <span className="text-xs text-emerald-800">{testNotice}</span>}
            </div>
            {testError && <InlineError message={testError} />}

            <details className="rounded-2xl border border-[var(--color-line)] p-3">
              <summary className="cursor-pointer text-sm font-semibold">
                What gets filled in for each parent
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-black/60">
                {preview.tokens.map((token) => (
                  <li key={token.token}>
                    <code className="rounded bg-black/[0.06] px-1 py-0.5">{token.token}</code> —{" "}
                    {token.describes}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        ) : (
          <div className="max-h-[26rem] overflow-y-auto rounded-2xl border border-[var(--color-line)]">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Birthday campaign recipients</caption>
              <thead className="sticky top-0 bg-[var(--color-cream)] text-xs uppercase tracking-wide text-black/45">
                <tr>
                  <th scope="col" className="px-3 py-2">
                    Parent
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Child
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Birthday
                  </th>
                </tr>
              </thead>
              <tbody>
                {preview.recipients.map((recipient, index) => (
                  // Keyed on the CHILD, not the mailbox: siblings share an
                  // address, so `key={recipient.email}` gave two rows the same
                  // key. React warns and then reconciles them as one identity,
                  // which is how a re-render of this list can show one sibling's
                  // details under the other's row — on the one screen whose
                  // whole job is to be checked before a send.
                  <tr
                    key={`${recipient.email}|${recipient.childDateOfBirth || recipient.childName}|${index}`}
                    className="border-t border-black/[0.06]"
                  >
                    <td className="px-3 py-2">
                      <span className="block font-medium">{recipient.parentName || "Parent"}</span>
                      <span className="block text-xs text-black/45">{recipient.email}</span>
                    </td>
                    <td className="px-3 py-2">{recipient.childName || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {recipient.daysUntilBirthday === 0
                        ? "Today"
                        : `in ${recipient.daysUntilBirthday} days`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminModal>
  );
}

function CampaignStatusBadge({ status }: { status: string }) {
  const colorClasses: Record<string, string> = {
    draft: "bg-black/[0.06] text-black/55",
    ready: "bg-[#eaf6fb] text-[#28637d]",
    sent: "bg-[#e8f5e9] text-[#2e7d32]",
    cancelled: "bg-red-50 text-red-700",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
        colorClasses[status] || colorClasses.draft
      }`}
    >
      {status}
    </span>
  );
}

function ContactRow({ href, icon, value }: { href: string; icon: ReactNode; value: string }) {
  return (
    <a
      href={href}
      className="flex min-h-11 items-center gap-3 rounded-2xl bg-[#f6f7f9] px-3 py-2.5 text-sm"
    >
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
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-[#f6f7f9] p-3">
      <dt className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wide text-black/40">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold">{value}</dd>
    </div>
  );
}

function InlineError({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3"
    >
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-700" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm text-red-900">{message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs font-semibold text-red-900 underline underline-offset-4"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}

function InlineNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {children}
    </p>
  );
}

function DetailLoadingState() {
  return (
    <div className="space-y-3">
      <div className="h-24 animate-pulse rounded-2xl bg-black/5" />
      <div className="h-24 animate-pulse rounded-2xl bg-black/5" />
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? "Date not set"
    : new Intl.DateTimeFormat("en-GH", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-GH", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
}

function LoadingState() {
  return (
    <div
      aria-label="Loading customers"
      className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_28rem]"
    >
      <div className="h-[32rem] animate-pulse rounded-3xl bg-black/5" />
      <div className="h-[30rem] animate-pulse rounded-3xl bg-black/5" />
    </div>
  );
}
