"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Coins,
  Pause,
  Pencil,
  Percent,
  Play,
  Plus,
  Save,
  Ticket,
  Trash2,
  Truck,
} from "lucide-react";
import {
  AdminDataTable,
  AdminEmptyState,
  AdminErrorState,
  AdminModal,
  AdminSelect,
  type AdminTableColumn,
} from "@/components/admin/AdminWorkspacePrimitives";
import { AdminHint, HintedField } from "@/components/admin/AdminHint";
import {
  describePromotion,
  presetById,
  presetForPromotionType,
  promotionPresets,
  promotionReachWarning,
  toPromotionPayload,
  type PromotionPresetId,
  type PromotionStatus,
} from "@/domain/commerce/promotion-presets";
import {
  isoToLocalDateTime,
  localDateTimeToIso,
  optionalNumber,
  optionalText,
} from "@/domain/forms/form-values";
import { formatCedis } from "@/domain/money";

type Promotion = {
  id: string;
  name: string;
  description: string | null;
  promotionType: string;
  value: number;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  minimumOrderAmount: number | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  stackable: boolean;
  automatic: boolean;
  code: string | null;
  codeUsageCount: number;
  productIds: string[];
  excludedProductIds: string[];
  createdAt: string;
  updatedAt: string;
};

type Voucher = {
  id: string;
  code: string;
  initialValue: number;
  balance: number;
  recipientEmail: string | null;
  status: string;
  expiresAt: string | null;
  createdAt: string;
};

type LoyaltyRule = {
  id: string;
  eventType: string;
  points: number;
  isActive: boolean;
  updatedAt: string;
};

type Tab = "promotions" | "vouchers" | "loyalty";

/** Field messages from the API, keyed the same way the form names its inputs. */
type FieldErrors = Record<string, string>;

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function toStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
}

function normalizePromotions(value: unknown): Promotion[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = (item || {}) as Record<string, unknown>;
    return {
      id: String(row.id || ""),
      name: String(row.name || ""),
      description: row.description ? String(row.description) : null,
      promotionType: String(row.promotionType || row.promotion_type || ""),
      value: Number(row.value || 0),
      status: String(row.status || ""),
      startsAt: row.startsAt ? String(row.startsAt) : null,
      endsAt: row.endsAt ? String(row.endsAt) : null,
      minimumOrderAmount: row.minimumOrderAmount === null || row.minimumOrderAmount === undefined
        ? null
        : Number(row.minimumOrderAmount),
      usageLimit: row.usageLimit ? Number(row.usageLimit) : null,
      perCustomerLimit: row.perCustomerLimit ? Number(row.perCustomerLimit) : null,
      stackable: Boolean(row.stackable),
      automatic: Boolean(row.automatic),
      code: row.code ? String(row.code) : null,
      codeUsageCount: Number(row.codeUsageCount || 0),
      productIds: toStringList(row.productIds),
      excludedProductIds: toStringList(row.excludedProductIds),
      createdAt: String(row.createdAt || ""),
      updatedAt: String(row.updatedAt || ""),
    };
  });
}

function normalizeVouchers(value: unknown): Voucher[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = (item || {}) as Record<string, unknown>;
    return {
      id: String(row.id || ""),
      code: String(row.code || ""),
      initialValue: Number(row.initialValue ?? row.initial_value ?? 0),
      balance: Number(row.balance ?? 0),
      recipientEmail: row.recipientEmail ? String(row.recipientEmail) : row.recipient_email ? String(row.recipient_email) : null,
      status: String(row.status || ""),
      expiresAt: row.expiresAt ? String(row.expiresAt) : row.expires_at ? String(row.expires_at) : null,
      createdAt: String(row.createdAt || row.created_at || ""),
    };
  });
}

function normalizeLoyaltyRules(value: unknown): LoyaltyRule[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = (item || {}) as Record<string, unknown>;
    return {
      id: String(row.id || ""),
      eventType: String(row.eventType || row.event_type || ""),
      points: Number(row.points || 0),
      isActive: "isActive" in row ? Boolean(row.isActive) : "is_active" in row ? Boolean(row.is_active) : true,
      updatedAt: String(row.updatedAt || row.updated_at || ""),
    };
  });
}

/** Reads `{ message, errors }` off any admin API failure. */
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

export default function PromotionsWorkspace() {
  const [tab, setTab] = useState<Tab>("promotions");

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-brand-deep)]">Marketing</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Promotions</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-ink-soft)]">
          Manage promotions, gift vouchers and loyalty point rules from one place.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <TabButton active={tab === "promotions"} onClick={() => setTab("promotions")} icon={<Percent size={16} />} label="Promotions" />
        <TabButton active={tab === "vouchers"} onClick={() => setTab("vouchers")} icon={<Ticket size={16} />} label="Vouchers" />
        <TabButton active={tab === "loyalty"} onClick={() => setTab("loyalty")} icon={<Coins size={16} />} label="Loyalty rules" />
      </div>

      {tab === "promotions" && <PromotionsTab />}
      {tab === "vouchers" && <VouchersTab />}
      {tab === "loyalty" && <LoyaltyRulesTab />}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
        active
          ? "bg-[var(--color-brand-deep)] text-white"
          : "bg-[var(--color-cream)] text-[var(--color-ink-soft)] hover:bg-[var(--color-brand-tint)] hover:text-[var(--color-brand-deep)]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Promotions
 * ------------------------------------------------------------------ */

const presetIcons: Record<PromotionPresetId, ReactNode> = {
  percent_off: <Percent size={18} />,
  amount_off: <Coins size={18} />,
  free_delivery: <Truck size={18} />,
};

function PromotionsTab() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [rowError, setRowError] = useState("");
  const [editing, setEditing] = useState<{ promotion: Promotion | null } | null>(null);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/admin/promotions", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Promotions could not be loaded.");
      setPromotions(normalizePromotions(payload.promotions));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Promotions could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function setStatus(promotion: Promotion, status: PromotionStatus) {
    setBusyId(promotion.id);
    setRowError("");
    const response = await fetch(`/api/admin/promotions/${promotion.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusyId("");
    if (!response.ok) {
      const failure = await readFailure(response, "This promotion could not be updated.");
      // The generic "some details need fixing" is useless without the form
      // open, so surface the specific complaint the API attached to a field.
      setRowError(Object.values(failure.errors)[0] || failure.message);
      return;
    }
    await load();
  }

  async function remove(promotion: Promotion) {
    if (!window.confirm(`Delete “${promotion.name}”? This cannot be undone.`)) return;
    setBusyId(promotion.id);
    setRowError("");
    const response = await fetch(`/api/admin/promotions/${promotion.id}`, { method: "DELETE" });
    setBusyId("");
    if (!response.ok) {
      const failure = await readFailure(response, "This promotion could not be deleted.");
      setRowError(failure.message);
      return;
    }
    await load();
  }

  // Only a failed *load* takes the screen over. A failed row action leaves the
  // table where it is and explains itself above it, because replacing the list
  // with an error page is how an admin loses their place mid-task.
  if (loadError && promotions.length === 0) {
    return <AdminErrorState description={loadError} onRetry={() => void load()} />;
  }
  if (loading && promotions.length === 0) return <LoadingState />;

  const columns: AdminTableColumn<Promotion>[] = [
    {
      key: "name",
      header: "Name",
      cell: (row) => (
        <div className="min-w-0">
          <p className="font-semibold text-[var(--color-ink)]">{row.name}</p>
          <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">{promotionSummary(row)}</p>
        </div>
      ),
    },
    {
      key: "reach",
      header: "How it applies",
      cell: (row) => <ReachCell promotion={row} />,
    },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
    { key: "dates", header: "Dates", cell: (row) => `${formatDate(row.startsAt)} – ${formatDate(row.endsAt)}` },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (row) => (
        <div className="flex flex-wrap items-center justify-end gap-1">
          <RowAction label="Edit" icon={<Pencil size={15} />} onClick={() => setEditing({ promotion: row })} disabled={busyId === row.id} />
          {row.status === "active" ? (
            <RowAction label="Pause" icon={<Pause size={15} />} onClick={() => void setStatus(row, "paused")} disabled={busyId === row.id} />
          ) : (
            <RowAction label="Activate" icon={<Play size={15} />} onClick={() => void setStatus(row, "active")} disabled={busyId === row.id} />
          )}
          <RowAction label="Delete" icon={<Trash2 size={15} />} onClick={() => void remove(row)} disabled={busyId === row.id} destructive />
        </div>
      ),
    },
  ];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-[var(--color-ink-soft)]">
          Offers that apply on the online shop. Pick a type, name it, and it goes live.
        </p>
        <button type="button" onClick={() => setEditing({ promotion: null })} className="admin-button min-h-11 px-4 text-sm">
          <Plus size={16} /> New promotion
        </button>
      </div>

      {rowError && <InlineError message={rowError} onDismiss={() => setRowError("")} />}
      {loadError && promotions.length > 0 && <InlineError message={loadError} onDismiss={() => setLoadError("")} />}

      {promotions.length === 0 ? (
        <AdminEmptyState
          title="No promotions"
          description="Create a promotion to get started — percent off, an amount off, or free delivery."
          icon={<Percent size={24} />}
        />
      ) : (
        <AdminDataTable rows={promotions} columns={columns} rowKey={(row) => row.id} caption="Promotions" />
      )}

      {editing && (
        <PromotionFormModal
          promotion={editing.promotion}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </section>
  );
}

function promotionSummary(promotion: Promotion): string {
  const preset = presetForPromotionType(promotion.promotionType);
  if (!preset) return "This type cannot run on the online shop.";
  return describePromotion({
    preset,
    amount: promotion.value,
    minimumOrderAmount: promotion.minimumOrderAmount ?? undefined,
  });
}

function ReachCell({ promotion }: { promotion: Promotion }) {
  const warning = promotionReachWarning({
    automatic: promotion.automatic,
    code: promotion.code ?? undefined,
  });
  if (warning) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700">
        <AlertTriangle size={14} aria-hidden="true" />
        Nobody can use it
      </span>
    );
  }
  return (
    <span className="text-xs text-[var(--color-ink-soft)]">
      {promotion.automatic ? "Automatic" : null}
      {promotion.automatic && promotion.code ? " · " : null}
      {promotion.code ? <span className="font-mono uppercase">{promotion.code}</span> : null}
    </span>
  );
}

function RowAction({
  label,
  icon,
  onClick,
  disabled,
  destructive,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition disabled:opacity-40 ${
        destructive
          ? "text-red-700 hover:bg-red-50"
          : "text-[var(--color-ink-soft)] hover:bg-[var(--color-cream)] hover:text-[var(--color-ink)]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

type PromotionFormState = {
  preset: PromotionPresetId;
  name: string;
  amount: string;
  code: string;
  automatic: boolean;
  status: PromotionStatus;
  description: string;
  minimumOrderAmount: string;
  startsAt: string;
  endsAt: string;
  usageLimit: string;
  perCustomerLimit: string;
  stackable: boolean;
  targeting: "all" | "only" | "except";
  targetProductIds: string[];
};

function initialFormState(promotion: Promotion | null): PromotionFormState {
  if (!promotion) {
    return {
      preset: "percent_off",
      name: "",
      amount: "",
      code: "",
      automatic: true,
      status: "active",
      description: "",
      minimumOrderAmount: "",
      startsAt: "",
      endsAt: "",
      usageLimit: "",
      perCustomerLimit: "",
      stackable: false,
      targeting: "all",
      targetProductIds: [],
    };
  }
  const targeting = promotion.excludedProductIds.length > 0
    ? "except"
    : promotion.productIds.length > 0
      ? "only"
      : "all";
  return {
    preset: presetForPromotionType(promotion.promotionType) ?? "percent_off",
    name: promotion.name,
    amount: promotion.value ? String(promotion.value) : "",
    code: promotion.code ?? "",
    automatic: promotion.automatic,
    status: (["draft", "active", "paused", "expired"] as const).includes(
      promotion.status as PromotionStatus,
    )
      ? (promotion.status as PromotionStatus)
      : "draft",
    description: promotion.description ?? "",
    minimumOrderAmount: promotion.minimumOrderAmount === null ? "" : String(promotion.minimumOrderAmount),
    startsAt: isoToLocalDateTime(promotion.startsAt),
    endsAt: isoToLocalDateTime(promotion.endsAt),
    usageLimit: promotion.usageLimit === null ? "" : String(promotion.usageLimit),
    perCustomerLimit: promotion.perCustomerLimit === null ? "" : String(promotion.perCustomerLimit),
    stackable: promotion.stackable,
    targeting,
    targetProductIds: targeting === "except" ? promotion.excludedProductIds : promotion.productIds,
  };
}

/**
 * Create and edit, in one modal.
 *
 * The form is controlled and lives here rather than in the tab, so a rejected
 * submit only ever repaints error text: nothing unmounts, and everything the
 * admin typed is still on screen. The old version returned an error page from
 * above the modal, which threw the whole form away on a 400 — and a 400 was
 * what the normal case returned.
 */
function PromotionFormModal({
  promotion,
  onClose,
  onSaved,
}: {
  promotion: Promotion | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [form, setForm] = useState<PromotionFormState>(() => initialFormState(promotion));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const preset = presetById(form.preset);
  const set = <Key extends keyof PromotionFormState>(key: Key, value: PromotionFormState[Key]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const draft = useMemo(
    () => ({
      preset: form.preset,
      name: form.name,
      description: optionalText(form.description),
      amount: optionalNumber(form.amount),
      minimumOrderAmount: optionalNumber(form.minimumOrderAmount),
      code: optionalText(form.code),
      automatic: form.automatic,
      stackable: form.stackable,
      status: form.status,
      startsAt: localDateTimeToIso(form.startsAt),
      endsAt: localDateTimeToIso(form.endsAt),
      usageLimit: optionalNumber(form.usageLimit),
      perCustomerLimit: optionalNumber(form.perCustomerLimit),
      productIds: form.targeting === "only" ? form.targetProductIds : [],
      excludedProductIds: form.targeting === "except" ? form.targetProductIds : [],
    }),
    [form],
  );

  const reachWarning = promotionReachWarning({ automatic: form.automatic, code: form.code });
  const legacyType = promotion !== null && presetForPromotionType(promotion.promotionType) === null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError("");

    const payload = toPromotionPayload(draft);
    // On an edit every field is on screen, so a field left blank means "remove
    // this", which the API only understands as an explicit null.
    const body = promotion
      ? {
          ...payload,
          description: payload.description ?? null,
          code: payload.code ?? null,
          startsAt: payload.startsAt ?? null,
          endsAt: payload.endsAt ?? null,
          minimumOrderAmount: payload.minimumOrderAmount ?? null,
          usageLimit: payload.usageLimit ?? null,
          perCustomerLimit: payload.perCustomerLimit ?? null,
        }
      : payload;

    const response = await fetch(
      promotion ? `/api/admin/promotions/${promotion.id}` : "/api/admin/promotions",
      {
        method: promotion ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    setSaving(false);

    if (!response.ok) {
      const failure = await readFailure(
        response,
        promotion ? "This promotion could not be saved." : "This promotion could not be created.",
      );
      setErrors(failure.errors);
      setFormError(failure.message);
      // A field error may sit inside the collapsed section; opening it is the
      // difference between "fix this" and "fix what, where?".
      if (
        ["startsAt", "endsAt", "minimumOrderAmount", "usageLimit", "perCustomerLimit", "productIds", "excludedProductIds"].some(
          (field) => failure.errors[field],
        )
      ) {
        setAdvancedOpen(true);
      }
      return;
    }

    await onSaved();
  }

  return (
    <AdminModal
      open
      onClose={onClose}
      size="md"
      subtitle={promotion ? "Edit promotion" : "New promotion"}
      title={promotion ? promotion.name || "Promotion" : "Create a promotion"}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {formError && <InlineError message={formError} />}
        {legacyType && (
          <InlineNote>
            This promotion uses an old type the online shop cannot apply, so customers never see it.
            Pick one of the three below to bring it back to life.
          </InlineNote>
        )}

        <fieldset>
          <legend className="text-sm font-semibold text-[var(--color-ink)]">What is the offer?</legend>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {promotionPresets.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={form.preset === option.id}
                onClick={() => set("preset", option.id)}
                className={`flex min-h-[5.5rem] flex-col items-start gap-1 rounded-2xl border p-3 text-left transition ${
                  form.preset === option.id
                    ? "border-[var(--color-brand)] bg-[var(--color-brand-tint)]"
                    : "border-[var(--color-line)] bg-[var(--color-surface)] hover:bg-[var(--color-cream)]"
                }`}
              >
                <span className="text-[var(--color-brand-deep)]">{presetIcons[option.id]}</span>
                <span className="text-sm font-semibold">{option.label}</span>
                <span className="text-xs leading-4 text-[var(--color-ink-soft)]">{option.blurb}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <HintedField
          label="Name"
          required
          htmlFor="promotion-name"
          error={errors.name}
          hint="What your team calls this offer. Customers see it on their basket when it applies, so write it the way you would say it out loud."
        >
          <input
            id="promotion-name"
            className="admin-input"
            value={form.name}
            placeholder={preset.namePlaceholder}
            onChange={(event) => set("name", event.target.value)}
            required
          />
        </HintedField>

        {preset.amountLabel && (
          <HintedField
            label={preset.amountLabel}
            required
            htmlFor="promotion-amount"
            error={errors.value}
            hint={preset.amountHint}
          >
            <input
              id="promotion-amount"
              type="number"
              inputMode="decimal"
              min={0}
              step={0.01}
              className="admin-input"
              value={form.amount}
              onChange={(event) => set("amount", event.target.value)}
              required
            />
          </HintedField>
        )}

        <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-cream)]/60 p-4">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-[var(--color-ink)]">How do customers get it?</p>
            <AdminHint label="How do customers get a promotion?">
              A promotion reaches a basket in one of two ways. <strong>Apply automatically</strong> takes
              it off every qualifying order without the customer doing anything. A <strong>code</strong>{" "}
              only applies when they type it at checkout — use that for a poster, an influencer or an
              apology. You can switch on both.
            </AdminHint>
          </div>

          <label className="mt-3 flex min-h-11 items-center gap-3 text-sm font-medium text-[var(--color-ink)]">
            <input
              type="checkbox"
              className="h-5 w-5 accent-[var(--color-brand-deep)]"
              checked={form.automatic}
              onChange={(event) => set("automatic", event.target.checked)}
            />
            Apply automatically to every qualifying order
          </label>

          <div className="mt-3">
            <HintedField
              label="Code (optional)"
              htmlFor="promotion-code"
              error={errors.code}
              hint="What a customer types at checkout, like SUMMER26. Letters, numbers, dashes and underscores only — a space or a symbol is easy to mistype. Leave it blank if the offer applies automatically."
            >
              <input
                id="promotion-code"
                className="admin-input font-mono uppercase"
                value={form.code}
                placeholder="SUMMER26"
                onChange={(event) => set("code", event.target.value.toUpperCase())}
              />
            </HintedField>
          </div>

          {reachWarning && !errors.code && (
            <p className="mt-3 flex items-start gap-2 text-xs font-medium text-amber-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              {reachWarning}
            </p>
          )}
        </div>

        <p className="rounded-2xl bg-[var(--color-brand-tint)] px-4 py-3 text-sm text-[var(--color-brand-deep)]">
          <span className="font-semibold">In plain words: </span>
          {describePromotion({
            preset: form.preset,
            amount: optionalNumber(form.amount),
            minimumOrderAmount: optionalNumber(form.minimumOrderAmount),
          })}
        </p>

        <div className="rounded-2xl border border-[var(--color-line)]">
          <button
            type="button"
            onClick={() => setAdvancedOpen((open) => !open)}
            aria-expanded={advancedOpen}
            className="flex min-h-12 w-full items-center justify-between gap-2 px-4 text-sm font-semibold"
          >
            More options — dates, limits, which products
            <ChevronDown size={16} className={advancedOpen ? "rotate-180 transition" : "transition"} aria-hidden="true" />
          </button>
          {advancedOpen && (
            <div className="space-y-4 border-t border-[var(--color-line)] p-4">
              <HintedField
                label="Status"
                htmlFor="promotion-status"
                error={errors.status}
                hint="Draft is a promotion you are still writing — nobody can use it. Active is live. Paused stops it without deleting it, and you can switch it back on later."
              >
                <AdminSelect
                  id="promotion-status"
                  value={form.status}
                  onChange={(event) => set("status", event.target.value as PromotionStatus)}
                >
                  <option value="draft">Draft — not in use yet</option>
                  <option value="active">Active — customers can use it</option>
                  <option value="paused">Paused — temporarily off</option>
                  {form.status === "expired" && <option value="expired">Expired</option>}
                </AdminSelect>
              </HintedField>

              <HintedField
                label="Minimum order (GH₵)"
                htmlFor="promotion-minimum"
                error={errors.minimumOrderAmount}
                hint="The basket has to be worth at least this much before the offer applies. Delivery is not counted. Leave blank to apply it to any order."
              >
                <input
                  id="promotion-minimum"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.01}
                  className="admin-input"
                  value={form.minimumOrderAmount}
                  onChange={(event) => set("minimumOrderAmount", event.target.value)}
                />
              </HintedField>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <HintedField
                  label="Starts"
                  htmlFor="promotion-starts"
                  error={errors.startsAt}
                  hint="Ghana time. Leave blank to start the moment you make it active."
                >
                  <input
                    id="promotion-starts"
                    type="datetime-local"
                    className="admin-input"
                    value={form.startsAt}
                    onChange={(event) => set("startsAt", event.target.value)}
                  />
                </HintedField>
                <HintedField
                  label="Ends"
                  htmlFor="promotion-ends"
                  error={errors.endsAt}
                  hint="Ghana time. After this moment the offer stops applying on its own. Leave blank to run it until you pause it."
                >
                  <input
                    id="promotion-ends"
                    type="datetime-local"
                    className="admin-input"
                    value={form.endsAt}
                    onChange={(event) => set("endsAt", event.target.value)}
                  />
                </HintedField>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <HintedField
                  label="Total uses"
                  htmlFor="promotion-usage"
                  error={errors.usageLimit}
                  hint="How many orders in total may use this offer, across all customers. Once it is reached the offer stops applying. Leave blank for no limit."
                >
                  <input
                    id="promotion-usage"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    className="admin-input"
                    value={form.usageLimit}
                    onChange={(event) => set("usageLimit", event.target.value)}
                  />
                </HintedField>
                <HintedField
                  label="Uses per customer"
                  htmlFor="promotion-per-customer"
                  error={errors.perCustomerLimit}
                  hint="How many times one signed-in customer may use it. Leave blank for no limit. Guests who are not signed in cannot be counted, so this only holds for account holders."
                >
                  <input
                    id="promotion-per-customer"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    className="admin-input"
                    value={form.perCustomerLimit}
                    onChange={(event) => set("perCustomerLimit", event.target.value)}
                  />
                </HintedField>
              </div>

              <HintedField
                label="Description (optional)"
                htmlFor="promotion-description"
                hint="A note for your team about why this offer exists. Customers never see it."
              >
                <textarea
                  id="promotion-description"
                  className="admin-input min-h-[4.5rem] py-3"
                  value={form.description}
                  onChange={(event) => set("description", event.target.value)}
                />
              </HintedField>

              <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-[var(--color-ink)]">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[var(--color-brand-deep)]"
                  checked={form.stackable}
                  onChange={(event) => set("stackable", event.target.checked)}
                />
                Can be combined with another offer
                <AdminHint label="What does combining offers mean?">
                  Off by default: a customer gets the single best offer their basket qualifies for.
                  Switch this on — on both offers — to let this one be added on top of another.
                </AdminHint>
              </label>

              <ProductTargeting
                mode={form.targeting}
                selectedIds={form.targetProductIds}
                error={errors.productIds || errors.excludedProductIds}
                onModeChange={(mode) => set("targeting", mode)}
                onSelectionChange={(ids) => set("targetProductIds", ids)}
              />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <button type="submit" disabled={saving} className="admin-button h-12 flex-1 disabled:opacity-60">
            <Save size={18} /> {saving ? "Saving…" : promotion ? "Save changes" : "Create promotion"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="admin-button admin-button-secondary h-12 sm:flex-1"
          >
            Cancel
          </button>
        </div>
      </form>
    </AdminModal>
  );
}

type PickerProduct = { id: string; name: string };

/**
 * Which products a promotion applies to.
 *
 * `promotion_products` has been read at checkout since the first commerce
 * migration and had no writer anywhere in the admin, so every promotion
 * applied to the entire catalogue whether or not that was the intent.
 */
function ProductTargeting({
  mode,
  selectedIds,
  error,
  onModeChange,
  onSelectionChange,
}: {
  mode: "all" | "only" | "except";
  selectedIds: string[];
  error?: string;
  onModeChange: (mode: "all" | "only" | "except") => void;
  onSelectionChange: (ids: string[]) => void;
}) {
  const [products, setProducts] = useState<PickerProduct[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (mode === "all" || products || unavailable) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/admin/products?pageSize=200", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error("unavailable");
        const rows = Array.isArray(payload.products) ? payload.products : [];
        if (cancelled) return;
        setProducts(
          rows.map((row: Record<string, unknown>) => ({
            id: String(row.id ?? ""),
            name: String(row.name ?? "Product"),
          })).filter((row: PickerProduct) => row.id),
        );
      } catch {
        if (!cancelled) setUnavailable(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, products, unavailable]);

  const visible = (products || []).filter((product) =>
    product.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  function toggle(id: string) {
    onSelectionChange(
      selectedIds.includes(id) ? selectedIds.filter((entry) => entry !== id) : [...selectedIds, id],
    );
  }

  return (
    <div>
      <HintedField
        label="Which products"
        htmlFor="promotion-targeting"
        error={error}
        hint="By default the offer applies to any basket. Narrow it to a chosen list, or apply it to everything except a chosen list — useful for keeping already-reduced lines out of a sale. The offer only applies when EVERY item in the basket qualifies."
      >
        <AdminSelect
          id="promotion-targeting"
          value={mode}
          onChange={(event) => {
            const next = event.target.value as "all" | "only" | "except";
            onModeChange(next);
            if (next === "all") onSelectionChange([]);
          }}
        >
          <option value="all">All products</option>
          <option value="only">Only the products I choose</option>
          <option value="except">Everything except the products I choose</option>
        </AdminSelect>
      </HintedField>

      {mode !== "all" && (
        <div className="mt-3 rounded-2xl border border-[var(--color-line)] p-3">
          {unavailable ? (
            <p className="text-xs text-[var(--color-ink-soft)]">
              The product list could not be loaded, so this promotion will apply to everything. Try
              again after reloading the page.
            </p>
          ) : products === null ? (
            <p className="text-xs text-[var(--color-ink-soft)]">Loading products…</p>
          ) : (
            <>
              <input
                type="search"
                className="admin-input"
                placeholder="Search products…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search products"
              />
              <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
                {selectedIds.length} selected
              </p>
              <div className="mt-2 max-h-56 overflow-y-auto">
                {visible.map((product) => (
                  <label
                    key={product.id}
                    className="flex min-h-11 items-center gap-3 rounded-xl px-2 text-sm hover:bg-[var(--color-cream)]"
                  >
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-[var(--color-brand-deep)]"
                      checked={selectedIds.includes(product.id)}
                      onChange={() => toggle(product.id)}
                    />
                    <span className="min-w-0 flex-1 truncate">{product.name}</span>
                  </label>
                ))}
                {visible.length === 0 && (
                  <p className="px-2 py-3 text-xs text-[var(--color-ink-soft)]">No products match that search.</p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Vouchers
 * ------------------------------------------------------------------ */

function VouchersTab() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [rowError, setRowError] = useState("");
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/admin/vouchers", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Vouchers could not be loaded.");
      setVouchers(normalizeVouchers(payload.vouchers));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Vouchers could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function cancelVoucher(voucher: Voucher) {
    if (!window.confirm(`Cancel voucher ${voucher.code}? This cannot be undone.`)) return;
    setRowError("");
    const response = await fetch(`/api/admin/vouchers/${voucher.id}/cancel`, { method: "POST" });
    if (!response.ok) {
      const failure = await readFailure(response, "Voucher could not be cancelled.");
      setRowError(failure.message);
      return;
    }
    await load();
  }

  if (loadError && vouchers.length === 0) {
    return <AdminErrorState description={loadError} onRetry={() => void load()} />;
  }
  if (loading && vouchers.length === 0) return <LoadingState />;

  const columns: AdminTableColumn<Voucher>[] = [
    { key: "code", header: "Code", cell: (row) => <span className="font-mono uppercase">{row.code}</span> },
    { key: "balance", header: "Balance", cell: (row) => formatCedis(row.balance) },
    { key: "initial", header: "Issued for", cell: (row) => formatCedis(row.initialValue) },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: "recipient",
      header: "Reserved for",
      cell: (row) => row.recipientEmail || "Anyone with the code",
    },
    { key: "expires", header: "Expires", cell: (row) => formatDate(row.expiresAt) },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (row) =>
        row.status === "active" ? (
          <RowAction label="Cancel" icon={<Trash2 size={15} />} onClick={() => void cancelVoucher(row)} destructive />
        ) : null,
    },
  ];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-[var(--color-ink-soft)]">
          Gift vouchers are spent at checkout. Every voucher is in cedis.
        </p>
        <button type="button" onClick={() => setShowForm(true)} className="admin-button min-h-11 px-4 text-sm">
          <Plus size={16} /> New voucher
        </button>
      </div>

      {rowError && <InlineError message={rowError} onDismiss={() => setRowError("")} />}
      {loadError && vouchers.length > 0 && <InlineError message={loadError} onDismiss={() => setLoadError("")} />}

      {vouchers.length === 0 ? (
        <AdminEmptyState title="No vouchers" description="Create a gift voucher to get started." icon={<Ticket size={24} />} />
      ) : (
        <AdminDataTable rows={vouchers} columns={columns} rowKey={(row) => row.id} caption="Gift vouchers" />
      )}

      {showForm && (
        <VoucherFormModal
          onClose={() => setShowForm(false)}
          onSaved={async () => {
            setShowForm(false);
            await load();
          }}
        />
      )}
    </section>
  );
}

function VoucherFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> | void }) {
  const [initialValue, setInitialValue] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [message, setMessage] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError("");

    const response = await fetch("/api/admin/vouchers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // No currency: this shop sells in cedis and checkout never read the old
      // free-text box anyway.
      body: JSON.stringify({
        initialValue: optionalNumber(initialValue),
        recipientEmail: optionalText(recipientEmail),
        message: optionalText(message),
        expiresAt: localDateTimeToIso(expiresAt),
      }),
    });
    setSaving(false);

    if (!response.ok) {
      const failure = await readFailure(response, "This voucher could not be issued.");
      setErrors(failure.errors);
      setFormError(failure.message);
      return;
    }
    await onSaved();
  }

  return (
    <AdminModal open onClose={onClose} title="Issue a gift voucher" subtitle="Gift voucher">
      <form onSubmit={handleSubmit} className="space-y-4">
        {formError && <InlineError message={formError} />}

        <HintedField
          label="Value (GH₵)"
          required
          htmlFor="voucher-value"
          error={errors.initialValue}
          hint="What the voucher is worth. The customer can spend it across several orders until the balance runs out. Vouchers are always in cedis."
        >
          <input
            id="voucher-value"
            type="number"
            inputMode="decimal"
            min={1}
            step={0.01}
            className="admin-input"
            value={initialValue}
            onChange={(event) => setInitialValue(event.target.value)}
            required
          />
        </HintedField>

        <HintedField
          label="Reserve for an email (optional)"
          htmlFor="voucher-recipient"
          error={errors.recipientEmail}
          hint="Locks the voucher to one person: only someone signed in with this address can spend it. Leave it blank and anyone holding the code can use it — right for a printed gift card, wrong for a refund."
        >
          <input
            id="voucher-recipient"
            type="email"
            className="admin-input"
            value={recipientEmail}
            onChange={(event) => setRecipientEmail(event.target.value)}
          />
        </HintedField>

        <HintedField
          label="Message (optional)"
          htmlFor="voucher-message"
          error={errors.message}
          hint="A short note stored with the voucher, for example why it was issued."
        >
          <textarea
            id="voucher-message"
            className="admin-input min-h-[5rem] py-3"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </HintedField>

        <HintedField
          label="Expires (optional)"
          htmlFor="voucher-expires"
          error={errors.expiresAt}
          hint="After this moment the balance can no longer be spent. Leave blank for a voucher that never expires."
        >
          <input
            id="voucher-expires"
            type="datetime-local"
            className="admin-input"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
          />
        </HintedField>

        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <button type="submit" disabled={saving} className="admin-button h-12 flex-1 disabled:opacity-60">
            <Save size={18} /> {saving ? "Issuing…" : "Issue voucher"}
          </button>
          <button type="button" onClick={onClose} className="admin-button admin-button-secondary h-12 sm:flex-1">
            Cancel
          </button>
        </div>
      </form>
    </AdminModal>
  );
}

/* ------------------------------------------------------------------ *
 * Loyalty rules
 * ------------------------------------------------------------------ */

function LoyaltyRulesTab() {
  const [rules, setRules] = useState<LoyaltyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [edits, setEdits] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/admin/loyalty-rules", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Loyalty rules could not be loaded.");
      const loaded = normalizeLoyaltyRules(payload.rules);
      setRules(loaded);
      setEdits(Object.fromEntries(loaded.map((rule) => [rule.id, rule.points])));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Loyalty rules could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function saveRule(rule: LoyaltyRule) {
    const points = edits[rule.id];
    if (points === undefined || points === rule.points) return;
    setSaveError("");
    const response = await fetch("/api/admin/loyalty-rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rule.id, points }),
    });
    if (!response.ok) {
      // Keeps the edited numbers on screen; the old version replaced the whole
      // list with an error page and threw the pending edit away.
      const failure = await readFailure(response, "That rule could not be saved.");
      setSaveError(failure.message);
      return;
    }
    await load();
  }

  if (loadError && rules.length === 0) {
    return <AdminErrorState description={loadError} onRetry={() => void load()} />;
  }
  if (loading && rules.length === 0) return <LoadingState />;

  return (
    <section className="space-y-4">
      <p className="text-sm text-[var(--color-ink-soft)]">Adjust how many points each loyalty event awards.</p>
      {saveError && <InlineError message={saveError} onDismiss={() => setSaveError("")} />}
      <div className="grid grid-cols-1 gap-3">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className="flex flex-col gap-3 rounded-3xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-semibold capitalize">{rule.eventType.replaceAll("_", " ")}</p>
              <p className="text-xs text-[var(--color-ink-soft)]">{rule.isActive ? "Active" : "Inactive"}</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor={`points-${rule.id}`}>
                Points for {rule.eventType.replaceAll("_", " ")}
              </label>
              <input
                id={`points-${rule.id}`}
                type="number"
                min={1}
                value={edits[rule.id] ?? rule.points}
                onChange={(event) => setEdits((current) => ({ ...current, [rule.id]: Number(event.target.value) }))}
                className="admin-input w-28"
              />
              <button
                type="button"
                onClick={() => void saveRule(rule)}
                disabled={(edits[rule.id] ?? rule.points) === rule.points}
                className="admin-button min-h-11 px-4 text-xs disabled:opacity-40"
              >
                <Save size={14} /> Save
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Shared bits
 * ------------------------------------------------------------------ */

function InlineError({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-700" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm text-red-900">{message}</p>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="text-xs font-semibold text-red-900 underline underline-offset-4">
          Dismiss
        </button>
      )}
    </div>
  );
}

function InlineNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{children}</p>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "active"
      ? "bg-emerald-100 text-emerald-800"
      : status === "sent" || status === "paid" || status === "redeemed"
        ? "bg-sky-100 text-sky-800"
        : status === "expired" || status === "cancelled" || status === "rejected"
          ? "bg-red-100 text-red-800"
          : "bg-amber-100 text-amber-800";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${color}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

function LoadingState() {
  return (
    <div className="space-y-2">
      {[...Array(4)].map((_, index) => (
        <div key={index} className="h-12 animate-pulse rounded-2xl bg-black/[0.04]" />
      ))}
    </div>
  );
}
