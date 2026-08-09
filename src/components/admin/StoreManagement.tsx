"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import {
  Building2,
  CheckCircle2,
  Copy,
  Edit3,
  KeyRound,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Trash2,
  UploadCloud,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminFilterBar,
  AdminModal,
} from "@/components/admin/AdminWorkspacePrimitives";
import { HintedField } from "@/components/admin/AdminHint";
import { fieldErrors } from "@/lib/admin/schema-helpers";
import {
  staffCreateBody,
  staffCreateSchema,
  staffPatchBody,
  staffPatchSchema,
  storeCreateBody,
  storeCreateSchema,
  storePatchBody,
  storePatchSchema,
  type StaffFormValues,
  type StoreFormValues,
} from "@/lib/admin/store-schemas";
import { supabase } from "@/lib/supabase";
import type { ZodType } from "zod";

type StoreStatus = "all" | "active" | "inactive";

/**
 * Which editor is open, and what it is editing.
 *
 * Deliberately carries its own ids rather than leaning on `selectedStoreId`.
 * The create form used to live inside the selected store's detail aside, which
 * broke it three ways at once: the aside only renders when a store is selected,
 * the whole branch is skipped when the list is empty — so the FIRST store could
 * never be created at all — and when stores did exist the create form appeared
 * under a header naming a different store, next to its Edit and Deactivate
 * buttons, which reads as editing that store rather than making a new one.
 */
type Editor =
  | { kind: "store-create" }
  | { kind: "store-edit"; storeId: string }
  | { kind: "staff-create"; storeId: string }
  | { kind: "staff-edit"; storeId: string; staffId: string }
  | null;

type StoreStaff = {
  id: string;
  shopId: string;
  staffName: string;
  staffContact: string;
  profileImageUrl: string;
  staffCode: string;
  authorizedEmail: string;
  accessActive: boolean;
  accessConfigured: boolean;
  /** `null` = unknown, because this deployment predates shop_staff.auth_user_id. */
  signInReady: boolean | null;
  createdAt: string;
};

/** Shown once, never stored. Cleared as soon as the admin acknowledges it. */
type IssuedCredentials = {
  staffName: string;
  staffCode: string;
  email: string;
  password: string;
};

type AdminStore = {
  id: string;
  name: string;
  location: string;
  whatsappNumber: string;
  isActive: boolean;
  createdAt: string;
  staff: StoreStaff[];
};

const emptyStoreForm: StoreFormValues = {
  name: "",
  location: "",
  whatsappNumber: "",
  isActive: true,
};

const emptyStaffForm: StaffFormValues = {
  staffName: "",
  staffContact: "",
  profileImageUrl: "",
  accessActive: true,
};

function normalizeStaff(value: unknown): StoreStaff[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : "";
    const shopId = typeof row.shopId === "string" ? row.shopId : "";
    if (!id || !shopId) return [];

    return [{
      id,
      shopId,
      staffName: typeof row.staffName === "string" ? row.staffName : "Unnamed staff",
      staffContact: typeof row.staffContact === "string" ? row.staffContact : "",
      profileImageUrl: typeof row.profileImageUrl === "string" ? row.profileImageUrl : "",
      staffCode: typeof row.staffCode === "string" ? row.staffCode : "",
      authorizedEmail: typeof row.authorizedEmail === "string" ? row.authorizedEmail : "",
      accessActive: Boolean(row.accessActive),
      accessConfigured: row.accessConfigured === true,
      signInReady: typeof row.signInReady === "boolean" ? row.signInReady : null,
      createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
    }];
  });
}

function normalizeStores(value: unknown): AdminStore[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) return [];

    return [{
      id,
      name: typeof row.name === "string" ? row.name : "Unnamed store",
      location: typeof row.location === "string" ? row.location : "",
      whatsappNumber: typeof row.whatsappNumber === "string" ? row.whatsappNumber : "",
      isActive: row.isActive !== false,
      createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
      staff: normalizeStaff(row.staff),
    }];
  });
}

/**
 * The two editors, submitted as real forms.
 *
 * Save lives in `AdminModal`'s footer, which is a sibling of the scrolling body
 * the fields are in, so the button is tied to its form by `form=` rather than
 * by containment. Constants rather than `useId()` because at most one modal is
 * open at a time and a stable id is easier to reason about.
 */
const STORE_FORM_ID = "store-editor-form";
const STAFF_FORM_ID = "staff-editor-form";

/** The photo picker's own id, so its `HintedField` label can point at it. */
const STAFF_PHOTO_INPUT_ID = "staff-photo-input";

/** Shown above a form whose fields already carry their own messages. */
const CHECK_FIELDS_MESSAGE = "Check the highlighted details and try again.";

/**
 * Validate with the very schema the API validates with, before anything leaves
 * the browser.
 *
 * The inputs are marked `required`, but that used to validate nothing at all:
 * there was no `<form>` and Save was a plain `type="button"`, so the attribute
 * had no submission to block and Enter did nothing. Now there is a form — and
 * it is `noValidate`, because the browser's "Please fill out this field" bubble
 * would otherwise preempt the schema's own wording, which is written for a shop
 * owner ("Give the branch a name.") rather than for whoever wrote the schema.
 */
function validateBody(schema: ZodType, body: unknown): Record<string, string> | null {
  const parsed = schema.safeParse(body);
  return parsed.success ? null : fieldErrors(parsed.error);
}

/** Per-field messages from `fieldErrors()`, ignoring anything else on the body. */
function readFieldErrors(payload: unknown): Record<string, string> {
  if (!payload || typeof payload !== "object") return {};
  const errors = (payload as { errors?: unknown }).errors;
  if (!errors || typeof errors !== "object") return {};
  const result: Record<string, string> = {};
  for (const [field, message] of Object.entries(errors as Record<string, unknown>)) {
    if (typeof message === "string") result[field] = message;
  }
  return result;
}

export default function StoreManagement() {
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StoreStatus>("all");
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor>(null);
  const [storeForm, setStoreForm] = useState<StoreFormValues>(emptyStoreForm);
  const [staffForm, setStaffForm] = useState<StaffFormValues>(emptyStaffForm);
  const [staffPhoto, setStaffPhoto] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /** Only ever a failure to LOAD the workspace — it replaces the whole screen. */
  const [error, setError] = useState("");
  /**
   * A failed action on a store or a staff member that is already on screen.
   *
   * Kept apart from `error` on purpose: these four actions have no modal to
   * report into, and routing them through the workspace error state swapped the
   * store list and the detail pane for a full-page "This workspace could not
   * load". A password reset that failed should say so and leave the admin
   * looking at the card they pressed it on.
   */
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [storeEditorError, setStoreEditorError] = useState("");
  const [storeFieldErrors, setStoreFieldErrors] = useState<Record<string, string>>({});
  const [staffEditorError, setStaffEditorError] = useState("");
  const [staffFieldErrors, setStaffFieldErrors] = useState<Record<string, string>>({});
  const [issued, setIssued] = useState<IssuedCredentials | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setActionError("");
    try {
      const response = await fetch("/api/admin/stores", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || "Stores could not be loaded.");
      }
      const nextStores = normalizeStores(payload?.stores);
      setStores(nextStores);
      setSelectedStoreId((current) =>
        current && nextStores.some((store) => store.id === current)
          ? current
          : nextStores[0]?.id ?? null,
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Stores could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visibleStores = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return stores.filter((store) => {
      const statusMatch =
        status === "all" ||
        (status === "active" && store.isActive) ||
        (status === "inactive" && !store.isActive);
      const queryMatch =
        !normalizedQuery ||
        [store.name, store.location, store.whatsappNumber]
          .some((value) => value.toLowerCase().includes(normalizedQuery)) ||
        store.staff.some((staff) =>
          [staff.staffName, staff.staffContact, staff.authorizedEmail, staff.staffCode]
            .some((value) => value.toLowerCase().includes(normalizedQuery)),
        );
      return statusMatch && queryMatch;
    });
  }, [query, status, stores]);

  const selectedStore =
    visibleStores.find((store) => store.id === selectedStoreId) ??
    visibleStores[0] ??
    stores.find((store) => store.id === selectedStoreId) ??
    stores[0] ??
    null;
  const selectedStaff =
    selectedStore?.staff.find((staff) => staff.id === selectedStaffId) ??
    selectedStore?.staff[0] ??
    null;
  const staffCount = stores.reduce((sum, store) => sum + store.staff.length, 0);
  const counterStaffCount = stores.reduce(
    (sum, store) => sum + store.staff.filter((staff) => staff.accessActive).length,
    0,
  );
  const counterAccessConfigured = stores.some((store) =>
    store.staff.some((staff) => staff.accessConfigured),
  );
  const storeBeingEdited =
    editor?.kind === "store-edit"
      ? stores.find((store) => store.id === editor.storeId) ?? null
      : null;
  const staffStore =
    editor?.kind === "staff-create" || editor?.kind === "staff-edit"
      ? stores.find((store) => store.id === editor.storeId) ?? null
      : null;

  function replaceStore(nextStore: AdminStore) {
    setStores((current) => {
      const exists = current.some((store) => store.id === nextStore.id);
      if (!exists) return [...current, nextStore];
      return current.map((store) => store.id === nextStore.id ? nextStore : store);
    });
    setSelectedStoreId(nextStore.id);
  }

  function clearStoreEditorErrors() {
    setStoreEditorError("");
    setStoreFieldErrors({});
  }

  function clearStaffEditorErrors() {
    setStaffEditorError("");
    setStaffFieldErrors({});
  }

  function openStoreCreate() {
    setError("");
    setActionError("");
    setNotice("");
    clearStoreEditorErrors();
    setStoreForm(emptyStoreForm);
    setEditor({ kind: "store-create" });
  }

  function openStoreEdit(store: AdminStore) {
    setError("");
    setActionError("");
    setNotice("");
    clearStoreEditorErrors();
    setSelectedStoreId(store.id);
    setStoreForm({
      name: store.name,
      location: store.location,
      whatsappNumber: store.whatsappNumber,
      isActive: store.isActive,
    });
    setEditor({ kind: "store-edit", storeId: store.id });
  }

  function openStaffCreate(store: AdminStore) {
    setError("");
    setActionError("");
    setNotice("");
    clearStaffEditorErrors();
    setSelectedStoreId(store.id);
    setSelectedStaffId(null);
    setStaffForm(emptyStaffForm);
    setStaffPhoto(null);
    setEditor({ kind: "staff-create", storeId: store.id });
  }

  function openStaffEdit(staff: StoreStaff) {
    setError("");
    setActionError("");
    setNotice("");
    clearStaffEditorErrors();
    setSelectedStaffId(staff.id);
    setStaffForm({
      staffName: staff.staffName,
      staffContact: staff.staffContact,
      profileImageUrl: staff.profileImageUrl,
      accessActive: staff.accessActive,
    });
    setStaffPhoto(null);
    setEditor({ kind: "staff-edit", storeId: staff.shopId, staffId: staff.id });
  }

  async function uploadStaffPhoto() {
    if (!staffPhoto) return staffForm.profileImageUrl;

    const extension = staffPhoto.name.split(".").pop()?.toLowerCase() || "jpg";
    const filePath = `staff/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("staff-images")
      .upload(filePath, staffPhoto, {
        contentType: staffPhoto.type || "image/jpeg",
      });

    if (uploadError) throw new Error(uploadError.message);

    const { data } = supabase.storage
      .from("staff-images")
      .getPublicUrl(filePath);
    return data.publicUrl;
  }

  async function saveStore() {
    // Enter reaches this through the form's default button, which is not the
    // one the footer disables while a save is in flight.
    if (saving) return;
    if (!editor || (editor.kind !== "store-create" && editor.kind !== "store-edit")) return;
    const isEdit = editor.kind === "store-edit";
    const body = isEdit ? storePatchBody(storeForm) : storeCreateBody(storeForm);

    const invalid = validateBody(isEdit ? storePatchSchema : storeCreateSchema, body);
    if (invalid) {
      setStoreFieldErrors(invalid);
      setStoreEditorError(CHECK_FIELDS_MESSAGE);
      return;
    }

    setSaving(true);
    clearStoreEditorErrors();
    setNotice("");
    try {
      const response = await fetch(
        isEdit ? `/api/admin/stores/${editor.storeId}` : "/api/admin/stores",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setStoreFieldErrors(readFieldErrors(payload));
        throw new Error(payload?.message || "Store could not be saved.");
      }
      const [store] = normalizeStores([payload?.store]);
      if (!store) throw new Error("Store response was invalid.");
      replaceStore(store);
      setEditor(null);
      setNotice(isEdit ? "Store updated." : `${store.name} created.`);
    } catch (saveError) {
      // Save failures surface inside the open modal, never as the workspace
      // error state — that would unmount the form and discard everything typed.
      setStoreEditorError(saveError instanceof Error ? saveError.message : "Store could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function deactivateSelectedStore(store: AdminStore) {
    if (!window.confirm(`Deactivate ${store.name}? It will disappear from public active-store lists.`)) return;

    setSaving(true);
    setActionError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/stores/${store.id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || "Store could not be deactivated.");
      }
      const [nextStore] = normalizeStores([payload?.store]);
      if (nextStore) replaceStore(nextStore);
      setNotice("Store deactivated.");
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : "Store could not be deactivated.");
    } finally {
      setSaving(false);
    }
  }

  async function saveStaff() {
    // Same reason as `saveStore`: the default button Enter presses is inside
    // the form, not the footer Save that goes disabled.
    if (saving) return;
    if (!editor || (editor.kind !== "staff-create" && editor.kind !== "staff-edit")) return;
    const isEdit = editor.kind === "staff-edit";

    // Checked before `uploadStaffPhoto()` runs: a form that is going to be
    // rejected should not leave an orphaned file in the bucket on the way.
    const invalid = validateBody(
      isEdit ? staffPatchSchema : staffCreateSchema,
      isEdit ? staffPatchBody(staffForm) : staffCreateBody(staffForm),
    );
    if (invalid) {
      setStaffFieldErrors(invalid);
      setStaffEditorError(CHECK_FIELDS_MESSAGE);
      return;
    }

    setSaving(true);
    clearStaffEditorErrors();
    setNotice("");
    try {
      const profileImageUrl = await uploadStaffPhoto();
      const values = { ...staffForm, profileImageUrl };
      const response = await fetch(
        isEdit
          ? `/api/admin/store-staff/${editor.staffId}`
          : `/api/admin/stores/${editor.storeId}/staff`,
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(isEdit ? staffPatchBody(values) : staffCreateBody(values)),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setStaffFieldErrors(readFieldErrors(payload));
        throw new Error(payload?.message || "Staff member could not be saved.");
      }
      const [store] = normalizeStores([payload?.store]);
      if (!store) throw new Error("Store response was invalid.");
      replaceStore(store);
      // Identify the new staff member by the CounterID that was just issued for
      // them. Taking the last entry instead, as this did, selected whoever
      // sorts last alphabetically — the server returns staff by name, not by
      // creation — so the credentials panel named one person while the detail
      // pane showed another.
      const createdStaffId =
        typeof payload?.credentials?.staffCode === "string"
          ? store.staff.find((staff) => staff.staffCode === payload.credentials.staffCode)?.id
          : undefined;
      setSelectedStaffId(isEdit ? editor.staffId : createdStaffId ?? null);
      setEditor(null);
      setStaffPhoto(null);
      if (!isEdit && payload?.credentials) {
        setIssued({ staffName: staffForm.staffName, ...payload.credentials });
      }
      setNotice(isEdit ? "Staff member updated." : "Staff member added.");
    } catch (saveError) {
      setStaffEditorError(
        saveError instanceof Error ? saveError.message : "Staff member could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteSelectedStaff(staff: StoreStaff) {
    // A soft revoke, not a delete: orders.staff_id is `on delete set null`, so
    // removing the row would erase who rang up every past sale.
    if (
      !window.confirm(
        `Revoke counter access for ${staff.staffName}? They will be signed out immediately and cannot sell, but their past sales stay attributed to them.`,
      )
    ) {
      return;
    }

    setSaving(true);
    setActionError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/store-staff/${staff.id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || "Counter access could not be revoked.");
      }
      const [store] = normalizeStores([payload?.store]);
      if (store) replaceStore(store);
      setEditor(null);
      setNotice("Counter access revoked.");
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : "Counter access could not be revoked.");
    } finally {
      setSaving(false);
    }
  }

  async function regenerateCode(staff: StoreStaff) {
    if (
      !window.confirm(
        `Issue a new CounterID for ${staff.staffName}? Their old CounterID and password stop working straight away.`,
      )
    ) {
      return;
    }

    setSaving(true);
    setActionError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/store-staff/${staff.id}/code`, { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || "Staff code could not be regenerated.");
      }
      const [store] = normalizeStores([payload?.store]);
      if (store) replaceStore(store);
      setSelectedStaffId(staff.id);
      if (payload?.credentials) {
        setIssued({ staffName: staff.staffName, ...payload.credentials });
      }
      setNotice("New CounterID issued.");
    } catch (codeError) {
      setActionError(codeError instanceof Error ? codeError.message : "Staff code could not be regenerated.");
    } finally {
      setSaving(false);
    }
  }

  /** Resets the password, and creates the login first if it never existed. */
  async function resetCredentials(staff: StoreStaff) {
    setSaving(true);
    setActionError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/store-staff/${staff.id}/credentials`, {
        method: "POST",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || "The counter login could not be updated.");
      }
      const [store] = normalizeStores([payload?.store]);
      if (store) replaceStore(store);
      setSelectedStaffId(staff.id);
      if (payload?.credentials) {
        setIssued({ staffName: staff.staffName, ...payload.credentials });
      }
      setNotice("Counter login ready.");
    } catch (resetError) {
      setActionError(resetError instanceof Error ? resetError.message : "The counter login could not be updated.");
    } finally {
      setSaving(false);
    }
  }

  const storeEditorOpen = editor?.kind === "store-create" || editor?.kind === "store-edit";
  const staffEditorOpen = editor?.kind === "staff-create" || editor?.kind === "staff-edit";

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#28637d]">
            Branch operations
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Stores
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">
            Manage branches, counter staff, access codes and store visibility
            from one operational workspace.
          </p>
        </div>
        <button
          type="button"
          onClick={openStoreCreate}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#101820] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1d2b36] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#28637d] focus-visible:ring-offset-2"
        >
          <Plus size={16} />
          Add store
        </button>
      </header>

      <section aria-label="Store summary" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile label="Stores" value={stores.length} detail="Total branch records" icon={<Building2 size={19} />} />
        <SummaryTile label="Active" value={stores.filter((store) => store.isActive).length} detail="Visible to storefront flows" icon={<CheckCircle2 size={19} />} />
        <SummaryTile label="Staff" value={staffCount} detail="Counter team profiles" icon={<Users size={19} />} />
        <SummaryTile label="Counter access" value={counterStaffCount} detail={counterAccessConfigured ? "Active authorized users" : "Awaiting auth table"} icon={<KeyRound size={19} />} />
      </section>

      <AdminFilterBar
        query={query}
        onQueryChange={setQuery}
        queryLabel="Search stores"
        placeholder="Search store, location, staff, email or code..."
      >
        <div className="flex rounded-xl bg-[#eef2f5] p-1">
          <StatusButton active={status === "all"} onClick={() => setStatus("all")}>All</StatusButton>
          <StatusButton active={status === "active"} onClick={() => setStatus("active")}>Active</StatusButton>
          <StatusButton active={status === "inactive"} onClick={() => setStatus("inactive")}>Inactive</StatusButton>
        </div>
      </AdminFilterBar>

      {notice && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          {notice}
        </div>
      )}

      {/* A failed action, reported without taking the workspace away. The store
          list and the staff card the admin pressed stay exactly where they
          were, so the obvious thing — press it again — is still possible. */}
      {actionError && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900"
        >
          {actionError}
        </div>
      )}

      {issued && (
        <CredentialPanel credentials={issued} onAcknowledge={() => setIssued(null)} />
      )}

      {!counterAccessConfigured && staffCount > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          Store staff profiles and counter codes are available. Email-based
          counter authorization is waiting on the `staff_authorizations` table
          to be exposed in Supabase.
        </div>
      )}

      {error ? (
        <AdminErrorState description={error} onRetry={() => void load()} />
      ) : loading ? (
        <LoadingState />
      ) : visibleStores.length === 0 ? (
        <AdminEmptyState
          title={stores.length === 0 ? "No stores yet" : "No stores found"}
          description={
            stores.length === 0
              ? "Add your first branch. You can add counter staff to it straight afterwards."
              : "Try a different branch, location, staff member, email or code."
          }
          icon={stores.length === 0 ? <Building2 size={24} /> : <Search size={24} />}
          action={
            <button
              type="button"
              onClick={openStoreCreate}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#101820] px-4 text-sm font-semibold text-white"
            >
              <Plus size={15} />
              Add store
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_30rem]">
          <StoreList
            stores={visibleStores}
            selectedStoreId={selectedStore?.id ?? null}
            onSelect={(store) => {
              setSelectedStoreId(store.id);
              setSelectedStaffId(store.staff[0]?.id ?? null);
            }}
            onEdit={openStoreEdit}
            onAddStaff={openStaffCreate}
          />

          {selectedStore && (
            <StoreDetail
              store={selectedStore}
              selectedStaff={selectedStaff}
              saving={saving}
              onEditStore={() => openStoreEdit(selectedStore)}
              onDeactivateStore={() => void deactivateSelectedStore(selectedStore)}
              onAddStaff={() => openStaffCreate(selectedStore)}
              onEditStaff={openStaffEdit}
              onSelectStaff={setSelectedStaffId}
              onDeleteStaff={(staff) => void deleteSelectedStaff(staff)}
              onRegenerateCode={(staff) => void regenerateCode(staff)}
              onResetCredentials={(staff) => void resetCredentials(staff)}
            />
          )}
        </div>
      )}

      {/* Both editors live here, at the top level: outside the empty state and
          independent of `selectedStore`, so creating the first store works. */}
      <AdminModal
        open={storeEditorOpen}
        onClose={() => setEditor(null)}
        subtitle="Store"
        title={storeBeingEdited ? `Edit ${storeBeingEdited.name}` : "Add a store"}
        size="md"
        footer={
          <EditorActions
            formId={STORE_FORM_ID}
            saving={saving}
            saveLabel={storeBeingEdited ? "Save changes" : "Create store"}
            onCancel={() => setEditor(null)}
          />
        }
      >
        <StoreFormFields
          formId={STORE_FORM_ID}
          form={storeForm}
          errors={storeFieldErrors}
          formError={storeEditorError}
          onChange={setStoreForm}
          onSubmit={() => void saveStore()}
        />
      </AdminModal>

      <AdminModal
        open={staffEditorOpen}
        onClose={() => setEditor(null)}
        subtitle={staffStore ? staffStore.name : "Staff"}
        title={editor?.kind === "staff-edit" ? "Edit staff member" : "Add a staff member"}
        size="md"
        footer={
          <EditorActions
            formId={STAFF_FORM_ID}
            saving={saving}
            saveLabel={editor?.kind === "staff-edit" ? "Save changes" : "Add staff member"}
            onCancel={() => setEditor(null)}
          />
        }
      >
        <StaffFormFields
          formId={STAFF_FORM_ID}
          form={staffForm}
          errors={staffFieldErrors}
          formError={staffEditorError}
          staffPhoto={staffPhoto}
          isNew={editor?.kind === "staff-create"}
          onChange={setStaffForm}
          onPhotoChange={setStaffPhoto}
          onSubmit={() => void saveStaff()}
        />
      </AdminModal>
    </div>
  );
}

/**
 * The one and only time these credentials are visible.
 *
 * The sign-in address has no mailbox behind it, so there is no reset email and
 * no second chance — the password is never stored, never audited, and this
 * panel is cleared from React state the moment the admin acknowledges it.
 */
function CredentialPanel({
  credentials,
  onAcknowledge,
}: {
  credentials: IssuedCredentials;
  onAcknowledge: () => void;
}) {
  // This panel renders near the top of the workspace, but the buttons that
  // issue credentials sit in the staff detail card further down. On a short
  // viewport the admin presses "Reset password", the password appears
  // off-screen above them, and the only copy of it is lost the moment they
  // acknowledge or navigate. Pull it into view and move focus to it.
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    // Guarded because scrollIntoView is not implemented in jsdom, and a missing
    // scroll must never stop the password itself from being focused and read.
    panel.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    panel.current?.focus();
  }, []);

  return (
    <section
      ref={panel}
      tabIndex={-1}
      aria-label="New counter sign-in details"
      className="scroll-mt-6 rounded-2xl border-2 border-[#28637d] bg-[#f2f8fb] p-5 shadow-sm focus-visible:outline-none"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#28637d] text-white">
          <KeyRound size={19} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold">
            Sign-in details for {credentials.staffName}
          </h2>
          <p className="mt-1 text-sm leading-6 text-black/60">
            Write these down or hand them over now. The password is not stored
            anywhere and cannot be shown again — you can only issue a new one.
          </p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <CredentialField label="CounterID" value={credentials.staffCode} />
        <CredentialField label="Password" value={credentials.password} />
        <CredentialField label="Sign-in address" value={credentials.email} />
      </dl>

      <button
        type="button"
        onClick={onAcknowledge}
        className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-[#101820] px-4 text-sm font-semibold text-white"
      >
        <CheckCircle2 size={15} />
        I have saved these details
      </button>
    </section>
  );
}

/**
 * Whether this cashier can actually sign in.
 *
 * `signInReady === null` means the deployment predates
 * `shop_staff.auth_user_id`, so we genuinely do not know — saying "no login"
 * there would send an admin chasing a problem that may not exist.
 */
function SignInBadge({
  signInReady,
  accessActive,
}: {
  signInReady: boolean | null;
  accessActive: boolean;
}) {
  const { label, className } = !accessActive
    ? { label: "Access revoked", className: "bg-red-50 text-red-800" }
    : signInReady === true
      ? { label: "Sign-in ready", className: "bg-emerald-50 text-emerald-800" }
      : signInReady === false
        ? { label: "Login missing", className: "bg-amber-50 text-amber-900" }
        : { label: "Login status unknown", className: "bg-black/[0.06] text-black/50" };

  return (
    <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${className}`}>
      {label}
    </span>
  );
}

function CredentialField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-3">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">
        {label}
      </dt>
      <dd className="mt-2 flex items-center justify-between gap-2">
        <code className="min-w-0 break-all text-sm font-semibold text-[#101820]">{value}</code>
        <IconButton
          label={`Copy ${label.toLowerCase()}`}
          onClick={() => void navigator.clipboard?.writeText(value)}
        >
          <Copy size={15} />
        </IconButton>
      </dd>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: number;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">{label}</p>
          <strong className="mt-2 block text-2xl">{value.toLocaleString()}</strong>
        </div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e8f3f8] text-[#245d78]">{icon}</span>
      </div>
      <p className="mt-3 text-xs text-black/45">{detail}</p>
    </div>
  );
}

function StatusButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 rounded-lg px-3 text-xs font-semibold transition ${
        active ? "bg-white text-[#101820] shadow-sm" : "text-black/50 hover:text-black"
      }`}
    >
      {children}
    </button>
  );
}

function StoreList({
  stores,
  selectedStoreId,
  onSelect,
  onEdit,
  onAddStaff,
}: {
  stores: AdminStore[];
  selectedStoreId: string | null;
  onSelect: (store: AdminStore) => void;
  onEdit: (store: AdminStore) => void;
  onAddStaff: (store: AdminStore) => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white shadow-sm">
      <div className="hidden grid-cols-[minmax(10rem,1fr)_6rem_7rem_7rem] gap-3 border-b border-black/[0.07] bg-[#f8fafb] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-black/45 lg:grid">
        <span>Store</span>
        <span>Staff</span>
        <span>Status</span>
        <span className="text-right">Actions</span>
      </div>
      <div className="divide-y divide-black/[0.06]">
        {stores.map((store) => {
          const selected = store.id === selectedStoreId;
          return (
            <div
              key={store.id}
              className={`flex flex-col gap-3 px-4 py-4 transition sm:flex-row sm:items-center sm:justify-between lg:grid lg:grid-cols-[minmax(10rem,1fr)_6rem_7rem_7rem] ${
                selected ? "bg-[#f2f8fb]" : "hover:bg-[#f8fafb]"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(store)}
                className="min-w-0 text-left"
              >
                <strong className="block truncate text-sm text-[#101820]">{store.name}</strong>
                <span className="mt-1 flex min-w-0 items-center gap-1 text-xs text-black/50">
                  <MapPin size={13} className="shrink-0" />
                  <span className="truncate">{store.location || "No location set"}</span>
                </span>
                {store.whatsappNumber && (
                  <span className="mt-1 flex min-w-0 items-center gap-1 text-[11px] text-black/35">
                    <Phone size={12} className="shrink-0" />
                    <span className="truncate">{store.whatsappNumber}</span>
                  </span>
                )}
              </button>
              <div className="flex items-center justify-between gap-3 sm:flex-1 lg:contents">
                <div className="flex items-center gap-2 text-sm font-semibold text-black/70 lg:block">
                  <span className="text-[10px] uppercase tracking-[0.12em] text-black/35 lg:hidden">Staff</span>
                  <span>{store.staff.length}</span>
                </div>
                <div className="flex items-center gap-2 lg:block">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/35 lg:hidden">Status</span>
                  <StatusPill active={store.isActive} />
                </div>
                <div className="flex items-center justify-end gap-1 lg:justify-end">
                  <IconButton label={`Edit ${store.name}`} onClick={() => onEdit(store)}>
                    <Edit3 size={15} />
                  </IconButton>
                  <IconButton label={`Add staff to ${store.name}`} onClick={() => onAddStaff(store)}>
                    <UserPlus size={15} />
                  </IconButton>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StoreDetail({
  store,
  selectedStaff,
  saving,
  onEditStore,
  onDeactivateStore,
  onAddStaff,
  onEditStaff,
  onSelectStaff,
  onDeleteStaff,
  onRegenerateCode,
  onResetCredentials,
}: {
  store: AdminStore;
  selectedStaff: StoreStaff | null;
  saving: boolean;
  onEditStore: () => void;
  onDeactivateStore: () => void;
  onAddStaff: () => void;
  onEditStaff: (staff: StoreStaff) => void;
  onSelectStaff: (id: string) => void;
  onDeleteStaff: (staff: StoreStaff) => void;
  onRegenerateCode: (staff: StoreStaff) => void;
  onResetCredentials: (staff: StoreStaff) => void;
}) {
  return (
    <aside className="space-y-4 xl:sticky xl:top-8 xl:self-start">
      <section className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#28637d]">Selected store</p>
            <h2 className="mt-2 truncate text-2xl font-semibold">{store.name}</h2>
            <p className="mt-1 flex items-center gap-1 text-sm text-black/55">
              <MapPin size={15} />
              {store.location || "No location set"}
            </p>
            <p className="mt-1 flex items-center gap-1 text-sm text-black/55">
              <Phone size={15} />
              {store.whatsappNumber || "No WhatsApp number set"}
            </p>
          </div>
          <StatusPill active={store.isActive} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <Metric label="Staff" value={store.staff.length.toLocaleString()} />
          <Metric label="Access" value={store.staff.filter((staff) => staff.accessActive && staff.accessConfigured).length.toLocaleString()} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <ActionButton onClick={onEditStore} icon={<Edit3 size={15} />}>Edit</ActionButton>
          <ActionButton onClick={onAddStaff} icon={<UserPlus size={15} />}>Add staff</ActionButton>
          {store.isActive && (
            <button
              type="button"
              onClick={onDeactivateStore}
              disabled={saving}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-red-200 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
            >
              <X size={15} />
              Deactivate
            </button>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Store staff</h3>
            <p className="mt-1 text-xs text-black/45">Counter profiles and access codes.</p>
          </div>
          <button
            type="button"
            onClick={onAddStaff}
            className="grid h-11 w-11 place-items-center rounded-xl bg-[#101820] text-white"
            aria-label={`Add staff to ${store.name}`}
          >
            <Plus size={17} />
          </button>
        </div>

        {store.staff.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-black/15 p-5 text-center">
            <Users className="mx-auto text-black/35" size={24} />
            <p className="mt-3 text-sm font-semibold">No staff assigned</p>
            <p className="mt-1 text-xs text-black/45">
              Nobody can sell from this branch until you add a counter profile.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {store.staff.map((staff) => (
              <button
                key={staff.id}
                type="button"
                onClick={() => onSelectStaff(staff.id)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
                  selectedStaff?.id === staff.id
                    ? "border-[#28637d] bg-[#f2f8fb]"
                    : "border-black/[0.07] hover:bg-[#f8fafb]"
                }`}
              >
                <Avatar staff={staff} />
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm">{staff.staffName}</strong>
                  <small className="mt-0.5 block truncate text-xs text-black/45">{staff.staffContact || "No contact"}</small>
                </span>
                <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                  staff.accessActive && staff.accessConfigured
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-black/[0.06] text-black/45"
                }`}>
                  {staff.accessConfigured ? (staff.accessActive ? "Access" : "Off") : "Code"}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedStaff && (
        <section className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <Avatar staff={selectedStaff} large />
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-semibold">{selectedStaff.staffName}</h3>
              <p className="mt-1 flex items-center gap-1 text-xs text-black/50">
                <Phone size={13} />
                {selectedStaff.staffContact || "No contact recorded"}
              </p>
              {/* Derived from the CounterID, never typed. The counter login
                  page derives the same address through login-domains.ts and
                  is_authorized_counter() compares the two. */}
              <p className="mt-1 flex items-center gap-1 break-all text-xs text-black/50">
                <Mail size={13} className="shrink-0" />
                {selectedStaff.authorizedEmail || "Login address not set up yet"}
              </p>
              <SignInBadge signInReady={selectedStaff.signInReady} accessActive={selectedStaff.accessActive} />
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-[#f3f5f7] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">CounterID</p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <code className="rounded-lg bg-white px-3 py-2 text-sm font-semibold tracking-[0.2em] text-[#101820]">
                {selectedStaff.staffCode || "UNSET"}
              </code>
              <div className="flex gap-1">
                <IconButton
                  label="Copy CounterID"
                  onClick={() => void navigator.clipboard?.writeText(selectedStaff.staffCode)}
                >
                  <Copy size={15} />
                </IconButton>
                <IconButton label="Issue a new CounterID" onClick={() => onRegenerateCode(selectedStaff)}>
                  <RefreshCcw size={15} />
                </IconButton>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton onClick={() => onEditStaff(selectedStaff)} icon={<Edit3 size={15} />}>Edit staff</ActionButton>
            <ActionButton
              onClick={() => onResetCredentials(selectedStaff)}
              icon={<KeyRound size={15} />}
            >
              {selectedStaff.signInReady === false ? "Create login" : "Reset password"}
            </ActionButton>
            <button
              type="button"
              onClick={() => onDeleteStaff(selectedStaff)}
              disabled={saving || !selectedStaff.accessActive}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-red-200 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
            >
              <Trash2 size={15} />
              {selectedStaff.accessActive ? "Revoke access" : "Access revoked"}
            </button>
          </div>
        </section>
      )}
    </aside>
  );
}

/**
 * The form's default button, so Enter in any field saves.
 *
 * Save itself lives in `AdminModal`'s pinned footer, which is a sibling of the
 * scrolling body rather than a descendant of this form — it submits through
 * `form=`, but "the button Enter presses" is looked up inside the form. Without
 * this, filling in three fields on a tablet and hitting Enter did nothing at
 * all. Hidden, untabbable and unannounced: it duplicates a button the admin can
 * already see.
 */
function DefaultSubmitButton() {
  return (
    <button type="submit" tabIndex={-1} aria-hidden="true" className="hidden">
      Save
    </button>
  );
}

function FormError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-900">
      {message}
    </p>
  );
}

function StoreFormFields({
  formId,
  form,
  errors,
  formError,
  onChange,
  onSubmit,
}: {
  formId: string;
  form: StoreFormValues;
  errors: Record<string, string>;
  formError: string;
  onChange: (form: StoreFormValues) => void;
  onSubmit: () => void;
}) {
  return (
    // `noValidate`: the fields keep `required` for the asterisk and for
    // aria-required, but the messages come from the same schema the API uses,
    // which speaks to a shop owner rather than showing a browser bubble.
    <form
      id={formId}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="space-y-4"
    >
      <DefaultSubmitButton />
      <FormError message={formError} />

      <TextField
        label="Store name"
        value={form.name}
        error={errors.name}
        onChange={(name) => onChange({ ...form, name })}
        required
        placeholder="Baebe Boo Sakumono"
        hint="What you and your customers call this branch. It appears on the storefront store list and on receipts."
      />
      <TextField
        label="Location"
        value={form.location}
        error={errors.location}
        onChange={(location) => onChange({ ...form, location })}
        required
        placeholder="Sakumono"
        hint="The town or neighbourhood this branch is in, so customers picking click-and-collect know where they are going."
      />
      <TextField
        label="WhatsApp number"
        value={form.whatsappNumber}
        error={errors.whatsappNumber}
        onChange={(whatsappNumber) => onChange({ ...form, whatsappNumber })}
        placeholder="+233 24 000 0000"
        type="tel"
        hint="The number customers message about this branch. Leave it blank to use the shop's main WhatsApp number instead."
      />

      <CheckboxField
        label="Active store"
        description="Show this branch in storefront and admin operations."
        hint="Turning this off hides the branch from customers and from checkout pickup. Nothing is deleted, and past sales keep their branch."
        checked={form.isActive}
        onChange={(isActive) => onChange({ ...form, isActive })}
      />

      <p className="rounded-xl bg-[#f3f5f7] px-4 py-3 text-xs leading-5 text-black/55">
        You can add counter staff to this branch as soon as it is saved.
      </p>
    </form>
  );
}

function StaffFormFields({
  formId,
  form,
  errors,
  formError,
  staffPhoto,
  isNew,
  onChange,
  onPhotoChange,
  onSubmit,
}: {
  formId: string;
  form: StaffFormValues;
  errors: Record<string, string>;
  formError: string;
  staffPhoto: File | null;
  isNew: boolean;
  onChange: (form: StaffFormValues) => void;
  onPhotoChange: (file: File | null) => void;
  onSubmit: () => void;
}) {
  // Created once per pick and revoked when it changes. Building it inline
  // during render, as this form used to, leaks a blob URL on every keystroke in
  // any other field.
  const objectUrl = useMemo(
    () => (staffPhoto ? URL.createObjectURL(staffPhoto) : ""),
    [staffPhoto],
  );
  useEffect(() => {
    if (!objectUrl) return;
    return () => URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  const preview = objectUrl || form.profileImageUrl;

  return (
    <form
      id={formId}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="space-y-4"
    >
      <DefaultSubmitButton />
      <FormError message={formError} />

      {/* Wrapped like every other field. It used to be the one control in
          either modal with no `HintedField` around it, so it was also the one
          control with no hint — on the only field whose consequences are not
          obvious from its label. */}
      <HintedField
        label="Staff photo"
        htmlFor={STAFF_PHOTO_INPUT_ID}
        error={errors.profileImageUrl}
        hint="Optional. Shown beside this person's name at the till, so whoever is on the counter can see they are ringing up under their own profile. It is never shown to customers, and leaving it out changes nothing else."
      >
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[#f3f5f7] p-3">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-white text-black/40">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="h-full w-full object-cover" />
            ) : (
              <Users size={22} />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {/* The typed "Photo URL" field that used to sit below is gone: it
                conflicted with this upload. `uploadStaffPhoto()` returns the
                typed URL only when no file is picked, so choosing a file
                silently threw the typed address away. Upload is the only way
                in now. */}
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-white px-3 text-xs font-semibold text-[#101820] shadow-sm">
                <UploadCloud size={15} />
                {preview ? "Change photo" : "Upload photo"}
                <input
                  id={STAFF_PHOTO_INPUT_ID}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    onPhotoChange(event.target.files?.[0] ?? null)
                  }
                />
              </label>
              {preview && (
                <button
                  type="button"
                  onClick={() => {
                    onPhotoChange(null);
                    onChange({ ...form, profileImageUrl: "" });
                  }}
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-black/10 px-3 text-xs font-semibold text-black/60"
                >
                  <Trash2 size={14} />
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
      </HintedField>

      <TextField
        label="Staff name"
        value={form.staffName}
        error={errors.staffName}
        onChange={(staffName) => onChange({ ...form, staffName })}
        required
        placeholder="Adjei Mensah"
        hint="The name shown on the till and against every sale this person rings up."
      />
      <TextField
        label="Contact"
        value={form.staffContact}
        error={errors.staffContact}
        onChange={(staffContact) => onChange({ ...form, staffContact })}
        placeholder="024 000 0000"
        type="tel"
        hint="A phone number so you can reach them about a shift or a sale. Never shown to customers."
      />

      <CheckboxField
        label="Counter access"
        description="Allow this staff profile to sign in at the till."
        hint="Turning this off signs them out straight away and stops them selling. Their past sales stay attributed to them."
        checked={form.accessActive}
        onChange={(accessActive) => onChange({ ...form, accessActive })}
      />

      {isNew && (
        <p className="rounded-xl bg-[#f3f5f7] px-4 py-3 text-xs leading-5 text-black/55">
          A CounterID, sign-in address and one-time password are issued
          automatically when you save. The password is shown once and is not
          stored anywhere — write it down before closing that panel.
        </p>
      )}
    </form>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  placeholder,
  hint,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  hint?: ReactNode;
  error?: string;
}) {
  const id = `store-field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <HintedField label={label} hint={hint} htmlFor={id} required={required} error={error}>
      <input
        id={id}
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={`h-11 w-full rounded-xl border bg-white px-3 text-sm outline-none transition focus:border-[#28637d] focus:ring-2 focus:ring-[#28637d]/15 ${
          error ? "border-red-400" : "border-black/[0.08]"
        }`}
      />
    </HintedField>
  );
}

function CheckboxField({
  label,
  description,
  hint,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  hint?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = `store-toggle-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <HintedField label={label} hint={hint} htmlFor={id}>
      <label
        htmlFor={id}
        className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl bg-[#f3f5f7] px-4 py-3 text-sm"
      >
        <span className="text-black/55">{description}</span>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="h-5 w-5 shrink-0 accent-[#101820]"
        />
      </label>
    </HintedField>
  );
}

function EditorActions({
  formId,
  saving,
  saveLabel,
  onCancel,
}: {
  /**
   * The form this footer saves. `AdminModal` renders the footer as a sibling of
   * its scrolling body, so Save cannot be inside the `<form>` it submits — the
   * `form=` attribute associates them across that boundary, which is also what
   * gives the fields a default button for Enter to press.
   */
  formId: string;
  saving: boolean;
  saveLabel: string;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={onCancel}
        className="h-11 rounded-xl border border-black/10 px-4 text-sm font-semibold text-black/55"
      >
        Cancel
      </button>
      <button
        type="submit"
        form={formId}
        disabled={saving}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#101820] px-4 text-sm font-semibold text-white disabled:opacity-60"
      >
        {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
        {saving ? "Saving…" : saveLabel}
      </button>
    </div>
  );
}

function Avatar({ staff, large = false }: { staff: StoreStaff; large?: boolean }) {
  const size = large ? "h-14 w-14" : "h-10 w-10";
  return (
    <span className={`grid ${size} shrink-0 place-items-center overflow-hidden rounded-xl bg-[#e8f3f8] text-[#245d78]`}>
      {staff.profileImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={staff.profileImageUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <Users size={large ? 22 : 17} />
      )}
    </span>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
      active ? "bg-emerald-50 text-emerald-800" : "bg-black/[0.06] text-black/45"
    }`}>
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#f3f5f7] p-3">
      <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">{label}</span>
      <strong className="mt-1 block text-sm">{value}</strong>
    </div>
  );
}

function ActionButton({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#101820] px-3 text-xs font-semibold text-white transition hover:bg-[#1d2b36]"
    >
      {icon}
      {children}
    </button>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-11 w-11 place-items-center rounded-xl text-black/45 transition hover:bg-black/[0.06] hover:text-black"
    >
      {children}
    </button>
  );
}

function LoadingState() {
  return (
    <section className="rounded-2xl border border-black/[0.07] bg-white p-8 shadow-sm">
      <div className="flex items-center gap-3 text-sm font-medium text-black/55">
        <Loader2 size={18} className="animate-spin" />
        Loading store management...
      </div>
    </section>
  );
}
