"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Plus, Truck } from "lucide-react";
import {
  AdminDataTable,
  AdminEmptyState,
  AdminErrorState,
  AdminFilterBar,
  AdminModal,
  type AdminTableColumn,
} from "@/components/admin/AdminWorkspacePrimitives";
import { formatCedis } from "@/domain/money";
import { HintedField } from "@/components/admin/AdminHint";

type DeliveryZone = {
  id: string;
  name: string;
  regions: string[];
  baseFee: number;
  freeDeliveryThreshold: number | null;
  estimatedDaysMin: number | null;
  estimatedDaysMax: number | null;
  isActive: boolean;
  createdAt: string;
};

type ZoneForm = {
  name: string;
  regions: string;
  baseFee: string;
  freeDeliveryThreshold: string;
  estimatedDaysMin: string;
  estimatedDaysMax: string;
  isActive: boolean;
};

const emptyForm: ZoneForm = {
  name: "",
  regions: "",
  baseFee: "",
  freeDeliveryThreshold: "",
  estimatedDaysMin: "",
  estimatedDaysMax: "",
  isActive: true,
};

function toForm(zone: DeliveryZone): ZoneForm {
  return {
    name: zone.name,
    regions: zone.regions.join(", "),
    baseFee: String(zone.baseFee),
    freeDeliveryThreshold:
      zone.freeDeliveryThreshold === null ? "" : String(zone.freeDeliveryThreshold),
    estimatedDaysMin: zone.estimatedDaysMin === null ? "" : String(zone.estimatedDaysMin),
    estimatedDaysMax: zone.estimatedDaysMax === null ? "" : String(zone.estimatedDaysMax),
    isActive: zone.isActive,
  };
}

/** "" stays "" so the API can tell "clear this" from "leave it alone". */
function toPayload(form: ZoneForm) {
  return {
    name: form.name.trim(),
    regions: form.regions
      .split(",")
      .map((region) => region.trim())
      .filter(Boolean),
    baseFee: Number(form.baseFee || 0),
    freeDeliveryThreshold: form.freeDeliveryThreshold.trim() === "" ? null : Number(form.freeDeliveryThreshold),
    estimatedDaysMin: form.estimatedDaysMin.trim() === "" ? null : Number(form.estimatedDaysMin),
    estimatedDaysMax: form.estimatedDaysMax.trim() === "" ? null : Number(form.estimatedDaysMax),
    isActive: form.isActive,
  };
}

export default function DeliveryZoneManagement() {
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<DeliveryZone | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<ZoneForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/delivery-zones");
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || "Delivery zones could not be loaded.");
      }
      setZones((payload?.zones || []) as DeliveryZone[]);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Delivery zones could not be loaded.",
      );
      setZones([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const activeCount = zones.filter((zone) => zone.isActive).length;

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return zones;
    return zones.filter((zone) =>
      `${zone.name} ${zone.regions.join(" ")}`.toLowerCase().includes(needle),
    );
  }, [zones, query]);

  const openCreate = () => {
    setForm(emptyForm);
    setFormError("");
    setEditing(null);
    setCreating(true);
  };

  const openEdit = (zone: DeliveryZone) => {
    setForm(toForm(zone));
    setFormError("");
    setCreating(false);
    setEditing(zone);
  };

  const closeEditor = () => {
    setCreating(false);
    setEditing(null);
    setFormError("");
  };

  const save = async () => {
    if (!form.name.trim()) {
      setFormError("Give the zone a name.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const response = await fetch(
        editing ? `/api/admin/delivery-zones/${editing.id}` : "/api/admin/delivery-zones",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toPayload(form)),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || "The delivery zone could not be saved.");
      }
      await load();
      setNotice(editing ? "Delivery zone updated." : "Delivery zone added.");
      closeEditor();
    } catch (saveError) {
      setFormError(
        saveError instanceof Error ? saveError.message : "The delivery zone could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (zone: DeliveryZone, isActive: boolean) => {
    if (
      !isActive &&
      activeCount <= 1 &&
      !window.confirm(
        `${zone.name} is the last active zone. Turning it off removes delivery from checkout entirely — customers will only be able to click and collect. Continue?`,
      )
    ) {
      return;
    }

    setBusyId(zone.id);
    setError("");
    try {
      const response = await fetch(`/api/admin/delivery-zones/${zone.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || "The delivery zone could not be updated.");
      }
      await load();
      setNotice(isActive ? `${zone.name} is live at checkout.` : `${zone.name} is hidden from checkout.`);
    } catch (toggleError) {
      setError(
        toggleError instanceof Error ? toggleError.message : "The delivery zone could not be updated.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const columns: AdminTableColumn<DeliveryZone>[] = [
    {
      key: "name",
      header: "Zone",
      cell: (row) => (
        <div className="min-w-0">
          <strong className="block truncate">{row.name}</strong>
          <span className="text-xs text-[var(--color-ink-soft)]">
            {row.regions.length ? row.regions.join(", ") : "No regions listed"}
          </span>
        </div>
      ),
    },
    { key: "fee", header: "Delivery fee", cell: (row) => formatCedis(row.baseFee) },
    {
      key: "free",
      header: "Free over",
      cell: (row) =>
        row.freeDeliveryThreshold === null ? "—" : formatCedis(row.freeDeliveryThreshold),
    },
    {
      key: "days",
      header: "Estimate",
      cell: (row) =>
        row.estimatedDaysMin === null
          ? "—"
          : `${row.estimatedDaysMin}-${row.estimatedDaysMax ?? row.estimatedDaysMin} days`,
    },
    {
      key: "status",
      header: "Checkout",
      cell: (row) => (
        <span
          className={`admin-badge ${
            row.isActive ? "bg-emerald-100 text-emerald-800" : "bg-black/[0.06] text-black/45"
          }`}
        >
          {row.isActive ? "Live" : "Hidden"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      cell: (row) => (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openEdit(row)}
            className="admin-button admin-button-secondary"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => void setActive(row, !row.isActive)}
            disabled={busyId === row.id}
            className="admin-button admin-button-ghost disabled:opacity-50"
          >
            {busyId === row.id ? "Saving…" : row.isActive ? "Hide" : "Make live"}
          </button>
        </div>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-16 animate-pulse rounded-3xl bg-black/5" />
        <div className="h-[26rem] animate-pulse rounded-3xl bg-black/5" />
      </div>
    );
  }

  if (error && zones.length === 0) {
    return <AdminErrorState description={error} onRetry={() => void load()} />;
  }

  return (
    <div className="space-y-4">
      <header className="admin-header">
        <div>
          <h1>Delivery</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Zones and fees offered at checkout. {activeCount} live.
          </p>
        </div>
        <button type="button" onClick={openCreate} className="admin-button">
          <Plus size={16} />
          Add zone
        </button>
      </header>

      {activeCount === 0 && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          No zone is live, so customers cannot choose delivery at checkout — only
          click and collect. Make at least one zone live to accept delivery orders.
        </p>
      )}

      {notice && (
        <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
          {notice}
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">
          {error}
        </p>
      )}

      <AdminFilterBar
        query={query}
        onQueryChange={setQuery}
        queryLabel="Search delivery zones"
        placeholder="Search zone or region…"
      />

      {rows.length === 0 ? (
        <AdminEmptyState
          icon={<Truck size={24} />}
          title={zones.length === 0 ? "No delivery zones yet" : "Nothing matches"}
          description={
            zones.length === 0
              ? "Add a zone to offer delivery at checkout. Until then customers can only click and collect."
              : "No delivery zone matches that search."
          }
          action={
            zones.length === 0 ? (
              <button type="button" onClick={openCreate} className="admin-button">
                <Plus size={15} />
                Add zone
              </button>
            ) : undefined
          }
        />
      ) : (
        <AdminDataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          caption="Delivery zones offered at checkout"
        />
      )}

      <AdminModal
        open={creating || Boolean(editing)}
        onClose={closeEditor}
        subtitle="Delivery"
        title={editing ? "Edit zone" : "Add zone"}
      >
        <div className="space-y-3">
          <Field
            label="Zone name"
            hint="A name your team will recognise, like &quot;Accra Central&quot;. Customers never see it — they just see the delivery fee it produces."
            value={form.name}
            onChange={(name) => setForm({ ...form, name })}
            placeholder="Accra Central"
          />
          <Field
            label="Regions covered (comma separated)"
            hint="The places this fee applies to, separated by commas. A customer&rsquo;s delivery address is matched against this list."
            value={form.regions}
            onChange={(regions) => setForm({ ...form, regions })}
            placeholder="Greater Accra"
          />
          <Field
            label="Delivery fee (GH₵)"
            hint="What the customer pays for delivery to this zone. Enter 0 if delivery here is always free."
            value={form.baseFee}
            onChange={(baseFee) => setForm({ ...form, baseFee })}
            type="number"
            placeholder="25"
          />
          <Field
            label="Free delivery over (GH₵, blank for none)"
            hint="Spend this much and delivery becomes free. Leave it blank if this zone never gets free delivery."
            value={form.freeDeliveryThreshold}
            onChange={(freeDeliveryThreshold) => setForm({ ...form, freeDeliveryThreshold })}
            type="number"
            placeholder="500"
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Fastest (days)"
            hint="The best case you want to promise. Shown to the customer as a range at checkout."
              value={form.estimatedDaysMin}
              onChange={(estimatedDaysMin) => setForm({ ...form, estimatedDaysMin })}
              type="number"
              placeholder="1"
            />
            <Field
              label="Slowest (days)"
            hint="The worst case you want to promise. Be realistic — this is the number people hold you to."
              value={form.estimatedDaysMax}
              onChange={(estimatedDaysMax) => setForm({ ...form, estimatedDaysMax })}
              type="number"
              placeholder="2"
            />
          </div>

          <label className="flex items-center justify-between rounded-xl bg-[var(--color-cream)] px-4 py-3 text-sm">
            <span>
              <strong className="block">Live at checkout</strong>
              <small className="text-[var(--color-ink-soft)]">
                Customers can pick this zone when paying.
              </small>
            </span>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
              className="h-5 w-5 accent-[var(--color-ink)]"
            />
          </label>

          {formError && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-900">
              {formError}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="admin-button flex-1 disabled:opacity-50"
            >
              {saving ? "Saving…" : editing ? "Save changes" : "Add zone"}
            </button>
            <button
              type="button"
              onClick={closeEditor}
              className="admin-button admin-button-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  hint?: ReactNode;
}) {
  // An explicit `htmlFor` rather than wrapping the input in the <label>: the
  // hint trigger is a real button, and a button inside a label inherits the
  // label's activation behaviour, so tapping "what is this?" would also focus
  // the field underneath it.
  const id = useId();
  return (
    <HintedField label={label} hint={hint} htmlFor={id}>
      <input
        id={id}
        className="admin-input"
        type={type}
        value={value}
        placeholder={placeholder}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? "0.01" : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </HintedField>
  );
}
