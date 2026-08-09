"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Pencil,
  Plus,
  Save,
  ShoppingCart,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminFilterBar,
  AdminModal,
  AdminSelect,
} from "@/components/admin/AdminWorkspacePrimitives";
import { HintedField, HintedLabel } from "@/components/admin/AdminHint";
import ExportCsvButton from "@/components/admin/ExportCsvButton";
import {
  calculatePurchaseOrderTotal,
  canReceivePurchaseOrder,
  type PurchaseOrder,
  type Supplier,
  type SupplierBalance,
} from "@/domain/admin-procurement";
import { formatCedis } from "@/domain/money";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const poStatusBadge: Record<PurchaseOrder["status"], string> = {
  draft: "admin-badge-pending",
  sent: "admin-badge-shipped",
  partial: "admin-badge-paid",
  received: "admin-badge-delivered",
  cancelled: "admin-badge-cancelled",
};

const poStatusLabel: Record<PurchaseOrder["status"], string> = {
  draft: "Draft",
  sent: "Sent",
  partial: "Partial",
  received: "Received",
  cancelled: "Cancelled",
};

export default function ProcurementWorkspace() {
  const [activeTab, setActiveTab] = useState<"orders" | "suppliers">("orders");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [balances, setBalances] = useState<SupplierBalance[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string; variants: { id: string; sku: string; title: string }[] }[]>([]);
  const [shops, setShops] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  const [showOrderForm, setShowOrderForm] = useState(false);
  const [receivingOrder, setReceivingOrder] = useState<PurchaseOrder | null>(null);

  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [suppliersRes, ordersRes, productsRes, shopsRes] = await Promise.all([
        fetch("/api/admin/suppliers"),
        fetch("/api/admin/purchase-orders"),
        fetch("/api/admin/products?status=active&pageSize=200"),
        fetch("/api/admin/stores"),
      ]);

      const suppliersJson = await suppliersRes.json().catch(() => ({}));
      const ordersJson = await ordersRes.json().catch(() => ({}));
      const productsJson = await productsRes.json().catch(() => ({}));
      const shopsJson = await shopsRes.json().catch(() => ({}));

      if (!suppliersRes.ok) throw new Error(suppliersJson.message || "Suppliers could not be loaded.");
      if (!ordersRes.ok) throw new Error(ordersJson.message || "Purchase orders could not be loaded.");

      setSuppliers(suppliersJson.suppliers || []);
      setBalances(suppliersJson.balances || []);
      setOrders(ordersJson.orders || []);
      setProducts(normalizeProducts(productsJson.products));
      setShops((shopsJson.stores || []).map((s: Record<string, unknown>) => ({ id: String(s.id), name: String(s.name) })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load procurement data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const supplierBalance = useCallback(
    (supplierId: string) => balances.find((b) => b.supplierId === supplierId),
    [balances],
  );

  const visibleOrders = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return orders;
    return orders.filter(
      (o) =>
        o.referenceNumber.toLowerCase().includes(needle) ||
        o.supplierName.toLowerCase().includes(needle) ||
        poStatusLabel[o.status].toLowerCase().includes(needle),
    );
  }, [orders, query]);

  const visibleSuppliers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return suppliers;
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(needle) ||
        s.email?.toLowerCase().includes(needle) ||
        s.phone?.toLowerCase().includes(needle),
    );
  }, [suppliers, query]);

  async function handleSupplierSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      name: String(formData.get("name")),
      contactName: String(formData.get("contactName")),
      email: String(formData.get("email")),
      phone: String(formData.get("phone")),
      address: String(formData.get("address")),
      paymentTerms: String(formData.get("paymentTerms")),
      notes: String(formData.get("notes")),
      isActive: formData.get("isActive") === "on",
    };

    const url = editingSupplier ? "/api/admin/suppliers" : "/api/admin/suppliers";
    const method = editingSupplier ? "PUT" : "POST";
    const body = editingSupplier ? { ...payload, id: editingSupplier.id } : payload;

    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(json.message || "Supplier could not be saved.");
      return;
    }
    setShowSupplierForm(false);
    setEditingSupplier(null);
    await load();
  }

  async function handleDeleteSupplier(supplier: Supplier) {
    if (!window.confirm(`Delete supplier "${supplier.name}"?`)) return;
    const response = await fetch(`/api/admin/suppliers?id=${supplier.id}`, { method: "DELETE" });
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      setError(json.message || "Supplier could not be deleted.");
      return;
    }
    await load();
  }

  async function handleStatusChange(order: PurchaseOrder, status: PurchaseOrder["status"]) {
    const response = await fetch("/api/admin/purchase-orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: order.id, status }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(json.message || "Status could not be updated.");
      return;
    }
    await load();
  }

  if (error) {
    return <AdminErrorState description={error} onRetry={() => window.location.reload()} />;
  }

  return (
    <div className="space-y-6">
      <div className="admin-header">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--color-brand-deep)" }}>
            Buying & stock
          </p>
          <h1>Procurement</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("orders")}
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${
              activeTab === "orders"
                ? "bg-[var(--color-ink)] text-white"
                : "border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)]"
            }`}
          >
            Purchase orders
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("suppliers")}
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${
              activeTab === "suppliers"
                ? "bg-[var(--color-ink)] text-white"
                : "border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)]"
            }`}
          >
            Suppliers
          </button>
        </div>
      </div>

      {activeTab === "orders" && (
        <>
          <AdminFilterBar
            query={query}
            onQueryChange={setQuery}
            queryLabel="Search purchase orders"
            placeholder="Search reference, supplier or status…"
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <ExportCsvButton href="/api/admin/reports/export?report=purchase-orders" />
                <button
                  type="button"
                  onClick={() => setShowOrderForm(true)}
                  className="admin-button px-4 py-2 text-sm"
                >
                  <Plus size={16} /> New purchase order
                </button>
              </div>
            }
          />

          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="admin-card admin-card-padding h-20 animate-pulse" />
              ))}
            </div>
          ) : visibleOrders.length === 0 ? (
            <AdminEmptyState
              title="No purchase orders"
              description="Create your first purchase order to start tracking supplier deliveries and costs."
              icon={<ShoppingCart size={24} />}
              action={
                <button
                  type="button"
                  onClick={() => setShowOrderForm(true)}
                  className="admin-button px-4 py-2 text-sm"
                >
                  <Plus size={16} /> New purchase order
                </button>
              }
            />
          ) : (
            <div className="space-y-3">
              {visibleOrders.map((order) => (
                <div key={order.id} className="admin-card admin-card-padding">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-lg font-semibold">
                          {order.referenceNumber || `PO-${order.id.slice(0, 8).toUpperCase()}`}
                        </p>
                        <span className={`admin-badge ${poStatusBadge[order.status]}`}>
                          {poStatusLabel[order.status]}
                        </span>
                      </div>
                      <p className="text-sm" style={{ color: "var(--color-ink-soft)" }}>
                        {order.supplierName} {order.shopName ? `· ${order.shopName}` : ""}
                      </p>
                      <p className="text-xs" style={{ color: "var(--color-ink-soft)", opacity: 0.75 }}>
                        Expected: {formatDate(order.expectedDeliveryDate)} · {order.items.length} item(s)
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-lg font-semibold">{formatCedis(order.totalAmount)}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {order.status === "draft" && (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(order, "sent")}
                            className="admin-button-secondary px-3 py-1.5 text-xs"
                          >
                            <Truck size={14} /> Mark sent
                          </button>
                        )}
                        {canReceivePurchaseOrder(order.status) && (
                          <button
                            type="button"
                            onClick={() => setReceivingOrder(order)}
                            className="admin-button px-3 py-1.5 text-xs"
                          >
                            <CheckCircle2 size={14} /> Receive
                          </button>
                        )}
                        {order.status !== "cancelled" && order.status !== "received" && (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(order, "cancelled")}
                            className="admin-button-secondary px-3 py-1.5 text-xs"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  {order.items.length > 0 && (
                    <div className="mt-4 border-t border-[var(--color-line)] pt-4">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr style={{ color: "var(--color-ink-soft)" }}>
                            <th className="pb-2 font-semibold">Product</th>
                            <th className="pb-2 font-semibold">SKU</th>
                            <th className="pb-2 font-semibold">Qty</th>
                            <th className="pb-2 font-semibold">Unit cost</th>
                            <th className="pb-2 font-semibold">Received</th>
                          </tr>
                        </thead>
                        <tbody>
                          {order.items.map((item) => (
                            <tr key={item.id}>
                              <td className="py-1 font-semibold">{item.productName}</td>
                              <td className="py-1" style={{ color: "var(--color-ink-soft)" }}>{item.sku}</td>
                              <td className="py-1">{item.quantity}</td>
                              <td className="py-1">{formatCedis(item.unitCost)}</td>
                              <td className="py-1">{item.receivedQuantity}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === "suppliers" && (
        <>
          <AdminFilterBar
            query={query}
            onQueryChange={setQuery}
            queryLabel="Search suppliers"
            placeholder="Search name, email or phone…"
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <ExportCsvButton href="/api/admin/reports/export?report=suppliers" />
                <button
                  type="button"
                  onClick={() => {
                    setEditingSupplier(null);
                    setShowSupplierForm(true);
                  }}
                  className="admin-button px-4 py-2 text-sm"
                >
                  <Plus size={16} /> Add supplier
                </button>
              </div>
            }
          />

          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="admin-card admin-card-padding h-20 animate-pulse" />
              ))}
            </div>
          ) : visibleSuppliers.length === 0 ? (
            <AdminEmptyState
              title="No suppliers"
              description="Add suppliers so you can raise purchase orders and track balances."
              icon={<Building2 size={24} />}
              action={
                <button
                  type="button"
                  onClick={() => {
                    setEditingSupplier(null);
                    setShowSupplierForm(true);
                  }}
                  className="admin-button px-4 py-2 text-sm"
                >
                  <Plus size={16} /> Add supplier
                </button>
              }
            />
          ) : (
            <div className="space-y-3">
              {visibleSuppliers.map((supplier) => {
                const balance = supplierBalance(supplier.id);
                return (
                  <div key={supplier.id} className="admin-card admin-card-padding">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-lg font-semibold">{supplier.name}</p>
                        <p className="text-sm" style={{ color: "var(--color-ink-soft)" }}>
                          {supplier.contactName} {supplier.email ? `· ${supplier.email}` : ""} {supplier.phone ? `· ${supplier.phone}` : ""}
                        </p>
                        {balance && (
                          <p className="mt-1 text-xs" style={{ color: "var(--color-ink-soft)", opacity: 0.75 }}>
                            Outstanding balance: {formatCedis(balance.outstandingBalance)}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSupplier(supplier);
                            setShowSupplierForm(true);
                          }}
                          className="admin-button-secondary px-3 py-1.5 text-xs"
                        >
                          <Pencil size={14} /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSupplier(supplier)}
                          className="admin-button-secondary px-3 py-1.5 text-xs"
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {showSupplierForm && (
        <SupplierForm
          supplier={editingSupplier}
          onClose={() => {
            setShowSupplierForm(false);
            setEditingSupplier(null);
          }}
          onSubmit={handleSupplierSubmit}
        />
      )}

      {showOrderForm && (
        <PurchaseOrderForm
          suppliers={suppliers}
          shops={shops}
          products={products}
          onClose={() => setShowOrderForm(false)}
          onSaved={load}
          onError={setError}
        />
      )}

      {receivingOrder && (
        <ReceiveGoodsForm
          order={receivingOrder}
          onClose={() => setReceivingOrder(null)}
          onSaved={load}
          onError={setError}
        />
      )}
    </div>
  );
}

function SupplierForm({
  supplier,
  onClose,
  onSubmit,
}: {
  supplier: Supplier | null;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <AdminModal
      open
      onClose={onClose}
      subtitle="Suppliers"
      title={supplier ? "Edit supplier" : "Add supplier"}
      size="md"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <HintedField
          label="Name"
          htmlFor="supplier-name"
          required
          hint="The business you buy from, as you would say it out loud. This is what shows on every purchase order."
        >
          <input id="supplier-name" name="name" defaultValue={supplier?.name} required className="admin-input" />
        </HintedField>
        <HintedField
          label="Contact name"
          htmlFor="supplier-contact"
          hint="The person you actually deal with there. Optional, but it saves hunting through messages later."
        >
          <input id="supplier-contact" name="contactName" defaultValue={supplier?.contactName} className="admin-input" />
        </HintedField>
        <HintedField label="Email" htmlFor="supplier-email">
          <input id="supplier-email" name="email" type="email" defaultValue={supplier?.email} className="admin-input" />
        </HintedField>
        <HintedField label="Phone" htmlFor="supplier-phone">
          <input id="supplier-phone" name="phone" defaultValue={supplier?.phone} className="admin-input" />
        </HintedField>
        <HintedField label="Address" htmlFor="supplier-address">
          <textarea id="supplier-address" name="address" defaultValue={supplier?.address} className="admin-input min-h-[5rem] py-3" />
        </HintedField>
        <HintedField
          label="Payment terms"
          htmlFor="supplier-terms"
          hint="How long you have to pay — “30 days”, “on delivery”, “50% upfront”. Free text; it is a reminder for you, not a rule the system enforces."
        >
          <input id="supplier-terms" name="paymentTerms" defaultValue={supplier?.paymentTerms} className="admin-input" />
        </HintedField>
        <HintedField label="Notes" htmlFor="supplier-notes">
          <textarea id="supplier-notes" name="notes" defaultValue={supplier?.notes} className="admin-input min-h-[5rem] py-3" />
        </HintedField>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input name="isActive" type="checkbox" defaultChecked={!supplier || supplier.isActive} />
          Active
        </label>
        <button type="submit" className="admin-button h-12 w-full">
          <Save size={18} /> {supplier ? "Save changes" : "Add supplier"}
        </button>
      </form>
    </AdminModal>
  );
}

function PurchaseOrderForm({
  suppliers,
  shops,
  products,
  onClose,
  onSaved,
  onError,
}: {
  suppliers: Supplier[];
  shops: { id: string; name: string }[];
  products: { id: string; name: string; variants: { id: string; sku: string; title: string }[] }[];
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [shopId, setShopId] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([{ variantId: "", quantity: 1, unitCost: 0 }]);
  const [saving, setSaving] = useState(false);

  // The tested helper rather than an inline reduce — it is imported here
  // already and the duplicate was how the order total and the reports could
  // drift apart.
  const total = useMemo(() => calculatePurchaseOrderTotal(items), [items]);

  function updateItem(index: number, patch: Partial<(typeof items)[number]>) {
    setItems((current) => current.map((item, position) => (position === index ? { ...item, ...patch } : item)));
  }

  function addItem() {
    setItems((current) => [...current, { variantId: "", quantity: 1, unitCost: 0 }]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    onError("");
    try {
      const response = await fetch("/api/admin/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          shopId: shopId || null,
          referenceNumber: referenceNumber || null,
          expectedDeliveryDate: expectedDeliveryDate || null,
          notes: notes || null,
          items,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.message || "Purchase order could not be created.");
      onSaved();
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminModal
      open
      onClose={onClose}
      subtitle="Purchase order"
      title="New purchase order"
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <HintedField
            label="Supplier"
            htmlFor="po-supplier"
            required
            hint="Who you are ordering from. Add them under Suppliers first if they are not in this list."
          >
            <AdminSelect
              id="po-supplier"
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
              required
            >
              <option value="">Select supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </AdminSelect>
          </HintedField>
          <HintedField
            label="Destination branch"
            htmlFor="po-shop"
            hint="Which shop the stock is going to. That is the shelf it gets added to when you receive the goods."
          >
            <AdminSelect id="po-shop" value={shopId} onChange={(event) => setShopId(event.target.value)}>
              <option value="">Select branch</option>
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>{shop.name}</option>
              ))}
            </AdminSelect>
          </HintedField>
          <HintedField
            label="Reference number"
            htmlFor="po-reference"
            hint="The supplier’s own invoice or order number, so you can match this against their paperwork."
          >
            <input
              id="po-reference"
              value={referenceNumber}
              onChange={(event) => setReferenceNumber(event.target.value)}
              className="admin-input"
            />
          </HintedField>
          <HintedField
            label="Expected delivery"
            htmlFor="po-expected"
            hint="When they promised it. Used to flag orders that are running late."
          >
            <input
              id="po-expected"
              type="date"
              value={expectedDeliveryDate}
              onChange={(event) => setExpectedDeliveryDate(event.target.value)}
              className="admin-input"
            />
          </HintedField>
        </div>

        <HintedField label="Notes" htmlFor="po-notes">
          <textarea
            id="po-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="admin-input min-h-[5rem] py-3"
          />
        </HintedField>

        <div>
          <HintedLabel
            label="Items"
            hint="What you are ordering, and what you agreed to pay per unit. The unit cost is what your profit reports are measured against, so put in the real price rather than the list price."
          />
          <div className="mt-2 space-y-2">
            {items.map((item, index) => (
              <div
                key={index}
                className="grid grid-cols-1 gap-2 rounded-2xl border border-[var(--color-line)] bg-[var(--color-cream)] p-3 sm:grid-cols-12"
              >
                <div className="sm:col-span-6">
                  <AdminSelect
                    aria-label={`Product for item ${index + 1}`}
                    value={item.variantId}
                    onChange={(event) => updateItem(index, { variantId: event.target.value })}
                    required
                  >
                    <option value="">Select product</option>
                    {products.flatMap((product) =>
                      product.variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {product.name} — {variant.sku || variant.title}
                        </option>
                      )),
                    )}
                  </AdminSelect>
                </div>
                <div className="sm:col-span-2">
                  <input
                    type="number"
                    min={1}
                    aria-label={`Quantity for item ${index + 1}`}
                    value={item.quantity}
                    onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })}
                    className="admin-input"
                    required
                  />
                </div>
                <div className="sm:col-span-3">
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    aria-label={`Unit cost for item ${index + 1}`}
                    value={item.unitCost}
                    onChange={(event) => updateItem(index, { unitCost: Number(event.target.value) })}
                    className="admin-input"
                    placeholder="Unit cost"
                    required
                  />
                </div>
                <div className="sm:col-span-1">
                  <button
                    type="button"
                    aria-label={`Remove item ${index + 1}`}
                    onClick={() => setItems((current) => current.filter((_, position) => position !== index))}
                    className="grid h-full w-full place-items-center rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addItem}
            className="admin-button-secondary mt-2 w-full px-4 py-2 text-sm"
          >
            <Plus size={16} /> Add item
          </button>
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-[var(--color-cream)] p-4">
          <span className="text-sm font-semibold" style={{ color: "var(--color-ink-soft)" }}>Total</span>
          <span className="text-xl font-bold">{formatCedis(total)}</span>
        </div>

        <button type="submit" disabled={saving} className="admin-button h-12 w-full">
          <Save size={18} /> {saving ? "Saving…" : "Create purchase order"}
        </button>
      </form>
    </AdminModal>
  );
}

function ReceiveGoodsForm({
  order,
  onClose,
  onSaved,
  onError,
}: {
  order: PurchaseOrder;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [items, setItems] = useState(
    order.items.map((item) => ({
      purchaseOrderItemId: item.id,
      quantityReceived: Math.max(0, item.quantity - item.receivedQuantity),
      unitCost: item.unitCost,
    })),
  );
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  function updateItem(index: number, patch: Partial<(typeof items)[number]>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    onError("");
    try {
      const response = await fetch("/api/admin/purchase-orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "receive",
          id: order.id,
          items: items.filter((i) => i.quantityReceived > 0),
          notes,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.message || "Goods could not be received.");
      onSaved();
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminModal
      open
      onClose={onClose}
      subtitle="Goods receipt"
      title="Receive goods"
      size="lg"
    >
      <p className="-mt-4 mb-4 text-sm" style={{ color: "var(--color-ink-soft)" }}>
        {order.supplierName}
      </p>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          {order.items.map((item, index) => (
            <div
              key={item.id}
              className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-cream)] p-4"
            >
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="font-semibold">{item.productName}</p>
                  <p className="text-xs" style={{ color: "var(--color-ink-soft)" }}>{item.sku}</p>
                </div>
                <p className="text-sm" style={{ color: "var(--color-ink-soft)" }}>
                  Ordered: {item.quantity} · Received: {item.receivedQuantity}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <HintedField
                  label="Quantity received now"
                  htmlFor={`receive-qty-${item.id}`}
                  hint="How many arrived in this delivery — not the whole order. Part-deliveries are normal; receive what turned up and the rest stays outstanding."
                >
                  <input
                    id={`receive-qty-${item.id}`}
                    type="number"
                    min={0}
                    max={item.quantity - item.receivedQuantity}
                    value={items[index]?.quantityReceived || 0}
                    onChange={(event) =>
                      updateItem(index, { quantityReceived: Number(event.target.value) })
                    }
                    className="admin-input"
                  />
                </HintedField>
                <HintedField
                  label="Unit cost"
                  htmlFor={`receive-cost-${item.id}`}
                  hint="What you were actually charged per unit this time. If it differs from the order, correct it here — this is the figure your profit is measured against."
                >
                  <input
                    id={`receive-cost-${item.id}`}
                    type="number"
                    min={0}
                    step={0.01}
                    value={items[index]?.unitCost || 0}
                    onChange={(event) => updateItem(index, { unitCost: Number(event.target.value) })}
                    className="admin-input"
                  />
                </HintedField>
              </div>
            </div>
          ))}
        </div>
        <HintedField label="Notes" htmlFor="receive-notes">
          <textarea
            id="receive-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="admin-input min-h-[5rem] py-3"
          />
        </HintedField>
        <button type="submit" disabled={saving} className="admin-button h-12 w-full">
          <CheckCircle2 size={18} /> {saving ? "Receiving…" : "Receive goods"}
        </button>
      </form>
    </AdminModal>
  );
}

function normalizeProducts(value: unknown): { id: string; name: string; variants: { id: string; sku: string; title: string }[] }[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = item as Record<string, unknown>;
    const variants = Array.isArray(row.variants)
      ? row.variants.map((v) => {
          const variant = v as Record<string, unknown>;
          return {
            id: String(variant.id),
            sku: String(variant.sku || ""),
            title: String(variant.title || ""),
          };
        })
      : [];
    return {
      id: String(row.id),
      name: String(row.name || "Untitled"),
      variants,
    };
  });
}
