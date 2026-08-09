"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Save } from "lucide-react";
import {
  productAgeRanges,
  productCategories,
  productGenders,
  generateSku,
} from "@/domain/catalog/product-taxonomy";
import type { ProductOption } from "@/domain/catalog/product-options";
import type { AdminProduct } from "@/domain/admin-products";
import { AdminErrorState, AdminModal, AdminSelect } from "@/components/admin/AdminWorkspacePrimitives";
import { HintedField } from "@/components/admin/AdminHint";
import ProductImageUploader, {
  resolvePhotoUrls,
  type PhotoDraft,
} from "./ProductImageUploader";
import ProductOptionsEditor from "./ProductOptionsEditor";
import VariantBulkBar from "./VariantBulkBar";
import VariantMatrixTable from "./VariantMatrixTable";
import {
  applyBulkAction,
  cleanOptionDrafts,
  conflictingSkuKeys,
  defaultReorderPoint,
  draftsFromVariants,
  invalidPriceKeys,
  removalWarningText,
  removalWarnings,
  resolveDefaultKey,
  syncVariantDrafts,
  variantCountSummary,
  variantPayload,
  type BulkAction,
  type OptionDraft,
  type VariantDraft,
  type VariantSyncContext,
} from "./wizard-state";

export type WizardMode = "create" | "details" | "versions";

type Shop = { id: string; name: string };

type BasicsForm = {
  name: string;
  description: string;
  category: string;
  ageRange: string;
  gender: string;
  sku: string;
  price: string;
  isActive: boolean;
  isFeatured: boolean;
};

/**
 * Which of the four screens each entry point shows.
 *
 * "Edit details" and "Edit versions & stock" are two buttons rather than one
 * editor with four steps because they hit two different endpoints with two
 * different failure modes: PATCH cannot touch a variable product's price at
 * all, and PUT rewrites the whole grid. Opening the wrong half of that on a
 * product with twelve versions is how a seller saves something they did not
 * mean to.
 */
const stepsForMode: Record<WizardMode, number[]> = {
  create: [1, 2, 3, 4],
  details: [1, 2],
  versions: [3, 4],
};

const stepNames: Record<number, string> = {
  1: "Basics",
  2: "Photos",
  3: "Options",
  4: "Versions, shops & stock",
};

const modeTitles: Record<WizardMode, string> = {
  create: "Add a product",
  details: "Edit details",
  versions: "Edit versions & stock",
};

function blankForm(): BasicsForm {
  const category = productCategories[0];
  return {
    name: "",
    description: "",
    category,
    ageRange: productAgeRanges[0],
    gender: "Unisex",
    sku: generateSku(category),
    price: "",
    isActive: true,
    isFeatured: false,
  };
}

function formFromProduct(product: AdminProduct): BasicsForm {
  return {
    name: product.name,
    description: product.description,
    category: product.category,
    ageRange: product.ageRange || productAgeRanges[0],
    gender: product.gender || "Unisex",
    sku: product.sku,
    price: String(product.price),
    isActive: product.active,
    isFeatured: product.featured,
  };
}

function count(text: string): number {
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

/**
 * The four-step popup: create a product, or edit half of one.
 *
 * Every field is seeded ONCE, from props, by a lazy `useState` initialiser
 * rather than by an effect that resets on open. That is not a style
 * preference. The parent re-fetches the whole catalogue after any save and
 * hands back a brand-new product object each time, so an effect keyed on the
 * product would wipe a half-filled grid whenever anything else on the page
 * reloaded. The caller mounts this component only while it is open, and gives
 * it a `key` per session, so "reopen" and "fresh state" are the same event.
 */
export default function ProductWizardModal({
  mode,
  product,
  onClose,
  onSaved,
}: {
  mode: WizardMode;
  /** The product being edited. Null for a create. */
  product: AdminProduct | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const steps = stepsForMode[mode];
  const declaredOptions: ProductOption[] = useMemo(() => product?.options ?? [], [product]);

  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState<BasicsForm>(() =>
    product ? formFromProduct(product) : blankForm(),
  );
  const [mainPhoto, setMainPhoto] = useState<PhotoDraft | null>(() =>
    product?.imageUrl ? { kind: "stored", url: product.imageUrl } : null,
  );
  const [gallery, setGallery] = useState<PhotoDraft[]>(() =>
    (product?.gallery ?? []).map((url) => ({ kind: "stored", url }) as PhotoDraft),
  );
  const [variable, setVariable] = useState(declaredOptions.length > 0);
  const [optionDrafts, setOptionDrafts] = useState<OptionDraft[]>(() =>
    declaredOptions.length > 0
      ? declaredOptions.map((option) => ({ name: option.name, values: [...option.values] }))
      : [{ name: "", values: [] }],
  );
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopsError, setShopsError] = useState("");
  const [selectedShops, setSelectedShops] = useState<string[]>(() => [
    ...new Set(
      (product?.variants ?? []).flatMap((variant) =>
        variant.inventory.map((level) => level.shopId),
      ),
    ),
  ]);
  // Blank when editing: this box overwrites every count in the grid, and a
  // pre-filled one is a stray keystroke away from zeroing a shop's shelves.
  const [stockSeed, setStockSeed] = useState(product ? "" : "0");
  // The grid as the product was loaded, so "what is going off sale" is measured
  // against the database and not against the previous keystroke.
  const [baseline] = useState<VariantDraft[]>(() =>
    product ? draftsFromVariants(product.variants, declaredOptions) : [],
  );
  const [rows, setRows] = useState<VariantDraft[]>(baseline);
  const [selectedRows, setSelectedRows] = useState<ReadonlySet<string>>(new Set<string>());
  const [defaultKey, setDefaultKey] = useState(
    () =>
      baseline.find(
        (row) => product?.variants.find((variant) => variant.id === row.id)?.isDefault,
      )?.key ??
      baseline[0]?.key ??
      "",
  );
  const [showComparePrices, setShowComparePrices] = useState(() =>
    (product?.variants ?? []).some(
      (variant) => variant.compareAtPrice !== null && variant.compareAtPrice !== undefined,
    ),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [skuErrors, setSkuErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const options = useMemo(
    () => cleanOptionDrafts(variable ? optionDrafts : []),
    [variable, optionDrafts],
  );
  const summary = useMemo(() => variantCountSummary(options), [options]);
  const priceErrorKeys = useMemo(() => new Set(invalidPriceKeys(rows)), [rows]);
  const warnings = useMemo(() => removalWarnings(baseline, rows), [baseline, rows]);

  /** Payload order, so `variants.3.price` from the API can find row three. */
  const payloadKeys = useRef<string[]>([]);

  const productIsVariable = declaredOptions.length > 0;

  /**
   * What new rows are seeded from, read fresh at the moment of the change.
   *
   * Deliberately not memoised and not a ref: these are only ever read from an
   * event handler, where the current render's values are exactly the right
   * ones, and a ref written during render is a bug waiting for React to
   * re-order a render around it.
   */
  function syncContext(overrides: Partial<VariantSyncContext> = {}): VariantSyncContext {
    return {
      skuBase: form.sku || form.name,
      price: form.price,
      shopIds: selectedShops,
      stockSeed,
      ...overrides,
    };
  }

  useEffect(() => {
    let cancelled = false;
    async function loadShops() {
      setShopsError("");
      try {
        const response = await fetch("/api/admin/stores", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.message || "Could not load your shops.");
        const active = ((payload.stores as Array<Record<string, unknown>>) || [])
          .filter((store) => store.isActive !== false)
          .map((store) => ({ id: String(store.id), name: String(store.name ?? "Shop") }));
        if (cancelled) return;
        setShops(active);
        setSelectedShops((current) => {
          const live = current.filter((id) => active.some((shop) => shop.id === id));
          if (live.length > 0) return live;
          return active[0] ? [active[0].id] : [];
        });
      } catch (error) {
        if (!cancelled) {
          setShopsError(error instanceof Error ? error.message : "Could not load your shops.");
        }
      }
    }
    void loadShops();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ------------------------------------------------------------------ */
  /* the grid, resynced only when something structural changes           */
  /* ------------------------------------------------------------------ */

  function resync(nextOptions: readonly ProductOption[], shopIds: readonly string[]) {
    setRows((previous) => syncVariantDrafts(nextOptions, previous, syncContext({ shopIds })));
  }

  function changeOptions(next: OptionDraft[]) {
    setOptionDrafts(next);
    const cleaned = cleanOptionDrafts(variable ? next : []);
    // Ten thousand rows would be built before the warning could be read.
    if (variantCountSummary(cleaned).level === "refused") return;
    resync(cleaned, selectedShops);
  }

  function changeVariable(next: boolean) {
    setVariable(next);
    resync(cleanOptionDrafts(next ? optionDrafts : []), selectedShops);
  }

  function toggleShop(shopId: string, checked: boolean) {
    const next = checked
      ? [...selectedShops, shopId]
      : selectedShops.filter((id) => id !== shopId);
    setSelectedShops(next);
    resync(options, next);
  }

  function changeStockSeed(value: string) {
    setStockSeed(value);
    if (value.trim() === "") return;
    // "Seeds every cell" literally: this is the number the seller expects to
    // see in the table underneath, not a default that quietly applies later.
    setRows((previous) =>
      applyBulkAction(previous, new Set<string>(), { kind: "stock", value }, {
        skuBase: syncContext().skuBase,
        options,
        shopIds: selectedShops,
      }),
    );
  }

  function changeProductSku(value: string) {
    setForm((current) => ({ ...current, sku: value }));
    // Only while creating: an existing version's code is printed on labels and
    // referenced by purchase orders, so it is never rewritten behind a seller.
    if (mode !== "create") return;
    setRows((previous) =>
      applyBulkAction(previous, new Set<string>(), { kind: "sku" }, {
        skuBase: value,
        options,
        shopIds: selectedShops,
      }),
    );
  }

  function changeRow(key: string, patch: Partial<VariantDraft>) {
    setRows((previous) => previous.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    if (patch.sku !== undefined) {
      setSkuErrors((current) => {
        if (!current[key]) return current;
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }

  function applyBulk(action: BulkAction) {
    setRows((previous) =>
      applyBulkAction(previous, selectedRows, action, {
        skuBase: syncContext().skuBase,
        options,
        shopIds: selectedShops,
      }),
    );
    if (action.kind === "sku") setSkuErrors({});
  }

  const effectiveDefaultKey = resolveDefaultKey(rows, defaultKey);

  /* ------------------------------------------------------------------ */
  /* moving between steps                                                */
  /* ------------------------------------------------------------------ */

  const step = steps[stepIndex];
  const optionsBlocked = variable && summary.level === "refused";

  function validateBasics(): Record<string, string> {
    const found: Record<string, string> = {};
    if (!form.name.trim()) found.name = "Give the product a name shoppers will recognise.";
    if (!form.category.trim()) found.category = "Choose a category.";
    if (!form.ageRange.trim()) found.ageRange = "Choose an age range.";
    if (!form.gender.trim()) found.gender = "Choose who this is for.";
    const price = Number(form.price);
    if (form.price.trim() === "" || !Number.isFinite(price) || price < 0) {
      found.price = "Enter a price, like 45 or 45.50.";
    }
    return found;
  }

  function validatePhotos(): Record<string, string> {
    if (mainPhoto) return {};
    return { imageUrl: "Choose a main photo — shoppers will not open a product without one." };
  }

  function validateVersions(): Record<string, string> {
    const found: Record<string, string> = {};
    if (selectedShops.length === 0) {
      found.availability = "Choose at least one shop that will sell this product.";
    }
    // An empty grid is only legal on a create: the server synthesizes the one
    // version a simple product needs. `PUT .../variants` refuses it outright,
    // because applying it would switch every version of a live product off.
    const live = rows.filter((row) => !row.removed);
    if (rows.length > 0 && live.length === 0) {
      found.variants = "Keep at least one version — a product with none cannot be sold.";
    } else if (mode !== "create" && live.length === 0) {
      found.variants = "Keep at least one version — a product with none cannot be sold.";
    } else if (live.length > 0 && !live.some((row) => row.isActive)) {
      found.variants = "Switch at least one version on, or nobody can buy this product.";
    }
    if (priceErrorKeys.size > 0) {
      found.variants =
        "Check the prices in red: every version needs a price, and a was-price has to be higher than the price you charge.";
    }
    return found;
  }

  /** The first screen carrying a problem, so a failure never lands out of sight. */
  function stepForErrors(found: Record<string, string>, skuRowsAffected: boolean): number | null {
    if (skuRowsAffected) return 4;
    if (found.name || found.category || found.ageRange || found.gender || found.price || found.sku || found.description) {
      return 1;
    }
    if (found.imageUrl || found.gallery) return 2;
    if (found.options) return 3;
    if (found.variants || found.availability) return 4;
    return null;
  }

  function showProblems(found: Record<string, string>, message: string) {
    setErrors(found);
    setFormError(message);
    const target = stepForErrors(found, false);
    if (target === null) return;
    const index = steps.indexOf(target);
    if (index >= 0) setStepIndex(index);
  }

  function goNext() {
    const found =
      step === 1 ? validateBasics() : step === 2 ? validatePhotos() : ({} as Record<string, string>);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setStepIndex((current) => Math.min(steps.length - 1, current + 1));
  }

  function goBack() {
    setErrors({});
    setStepIndex((current) => Math.max(0, current - 1));
  }

  /* ------------------------------------------------------------------ */
  /* saving                                                              */
  /* ------------------------------------------------------------------ */

  /**
   * Turn the API's answer into something attached to the input that caused it.
   *
   * A 409 is the one that matters most: it names a SKU and no field at all,
   * because the collision is found by a unique index rather than by the
   * schema. "Could not save" on a hundred-row grid with no indication of which
   * cell is wrong is a dead end for a non-technical user.
   */
  function absorbFailure(status: number, message: string, apiErrors: Record<string, string>) {
    const nextErrors: Record<string, string> = {};
    const nextSkuErrors: Record<string, string> = {};

    for (const [path, text] of Object.entries(apiErrors)) {
      const variantMatch = /^variants\.(\d+)/.exec(path);
      if (variantMatch) {
        const key = payloadKeys.current[Number(variantMatch[1])];
        if (key) {
          if (path.endsWith(".sku")) nextSkuErrors[key] = text;
          else nextErrors.variants = text;
        } else {
          nextErrors.variants = text;
        }
        continue;
      }
      if (path.startsWith("options")) {
        nextErrors.options = text;
        continue;
      }
      nextErrors[path.split(".")[0]] = text;
    }

    if (status === 409) {
      for (const key of conflictingSkuKeys(rows, message)) {
        nextSkuErrors[key] = "This code is already used elsewhere. Give this version a different one.";
      }
    }

    setErrors(nextErrors);
    setSkuErrors(nextSkuErrors);
    setFormError(message);

    // Land the seller on the screen carrying the problem rather than leaving
    // them on step 4 hunting for a message about the product name.
    const target = stepForErrors(nextErrors, Object.keys(nextSkuErrors).length > 0);
    if (target === null) return;
    const index = steps.indexOf(target);
    if (index >= 0) setStepIndex(index);
  }

  async function save() {
    setSaving(true);
    setFormError("");
    setErrors({});
    setSkuErrors({});
    try {
      if (mode === "versions") {
        await saveVersions();
      } else if (mode === "details") {
        await saveDetails();
      } else {
        await saveNewProduct();
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not save this product.");
    } finally {
      setSaving(false);
    }
  }

  async function send(url: string, method: string, body: unknown): Promise<boolean> {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as
      | { message?: string; errors?: Record<string, string> }
      | null;
    if (response.ok) return true;
    absorbFailure(
      response.status,
      payload?.message || "Could not save this product.",
      payload?.errors || {},
    );
    return false;
  }

  async function saveNewProduct() {
    const found = { ...validateBasics(), ...validatePhotos(), ...validateVersions() };
    if (Object.keys(found).length > 0) {
      showProblems(found, "Check the highlighted details and try again.");
      return;
    }

    const imageUrl = mainPhoto ? (await resolvePhotoUrls([mainPhoto], "products"))[0] : "";
    const galleryUrls = await resolvePhotoUrls(gallery, "products/gallery");
    const variants = variantPayload(rows, selectedShops, effectiveDefaultKey);
    payloadKeys.current = rows.filter((row) => !row.removed).map((row) => row.key);

    const ok = await send("/api/admin/products", "POST", {
      name: form.name.trim(),
      description: form.description.trim(),
      category: form.category,
      ageRange: form.ageRange,
      gender: form.gender,
      sku: form.sku.trim() || undefined,
      price: Number(form.price),
      imageUrl,
      gallery: galleryUrls,
      isActive: form.isActive,
      isFeatured: form.isFeatured,
      availability: selectedShops.map((shopId) => ({
        shopId,
        onHand: count(stockSeed),
        reorderPoint: defaultReorderPoint,
      })),
      options,
      variants,
    });
    if (ok) {
      await onSaved();
      onClose();
    }
  }

  async function saveDetails() {
    if (!product) return;
    const found = validateBasics();
    if (Object.keys(found).length > 0) {
      showProblems(found, "Check the highlighted details and try again.");
      return;
    }

    const imageUrl = mainPhoto ? (await resolvePhotoUrls([mainPhoto], "products"))[0] : "";
    const galleryUrls = await resolvePhotoUrls(gallery, "products/gallery");

    const ok = await send(`/api/admin/products/${product.id}`, "PATCH", {
      name: form.name.trim(),
      description: form.description.trim(),
      category: form.category,
      ageRange: form.ageRange,
      gender: form.gender,
      sku: form.sku.trim() || undefined,
      // A variable product's price is the cheapest live version and is
      // recomputed after every write; sending one is a 409 by design.
      ...(productIsVariable ? {} : { price: Number(form.price) }),
      imageUrl,
      gallery: galleryUrls,
      // Only when it actually changed: `isActive` on a patch switches every
      // version on or off with it, which would undo a version the seller
      // deliberately turned off in the other editor.
      ...(form.isActive !== product.active && { isActive: form.isActive }),
      ...(form.isFeatured !== product.featured && { isFeatured: form.isFeatured }),
    });
    if (ok) {
      await onSaved();
      onClose();
    }
  }

  async function saveVersions() {
    if (!product) return;
    const found = validateVersions();
    if (Object.keys(found).length > 0) {
      showProblems(found, "Check the highlighted versions and try again.");
      return;
    }

    const variants = variantPayload(rows, selectedShops, effectiveDefaultKey);
    payloadKeys.current = rows.filter((row) => !row.removed).map((row) => row.key);

    const ok = await send(`/api/admin/products/${product.id}/variants`, "PUT", {
      options,
      variants,
      availability: selectedShops.map((shopId) => ({
        shopId,
        onHand: count(stockSeed),
        reorderPoint: defaultReorderPoint,
      })),
    });
    if (ok) {
      await onSaved();
      onClose();
    }
  }

  /* ------------------------------------------------------------------ */

  const isLastStep = stepIndex === steps.length - 1;
  const nextDisabled = step === 3 && optionsBlocked;

  return (
    <AdminModal
      open
      onClose={onClose}
      size="xl"
      subtitle={`Step ${stepIndex + 1} of ${steps.length} · ${stepNames[step]}`}
      title={modeTitles[mode]}
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-ink-soft)]">
            Step {stepIndex + 1} of {steps.length} · {stepNames[step]}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="admin-button-ghost min-h-11 rounded-2xl px-4 text-sm font-semibold"
            >
              Cancel
            </button>
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={goBack}
                className="admin-button-secondary min-h-11 rounded-2xl px-4 text-sm font-semibold"
              >
                <ChevronLeft size={16} /> Back
              </button>
            )}
            {isLastStep ? (
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="admin-button min-h-11 px-5 disabled:opacity-50"
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                {saving ? "Saving…" : "Save"}
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                disabled={nextDisabled}
                className="admin-button min-h-11 px-5 disabled:opacity-45"
              >
                Next <ChevronRight size={16} />
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {formError && <AdminErrorState title="This could not be saved" description={formError} />}
        {shopsError && <AdminErrorState title="Your shops could not be loaded" description={shopsError} />}

        {step === 1 && (
          <BasicsStep
            form={form}
            errors={errors}
            priceLocked={mode === "details" && productIsVariable}
            onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
            onSkuChange={changeProductSku}
          />
        )}

        {step === 2 && (
          <ProductImageUploader
            main={mainPhoto}
            gallery={gallery}
            error={errors.imageUrl}
            onMainChange={setMainPhoto}
            onGalleryChange={setGallery}
          />
        )}

        {step === 3 && (
          <>
            <ProductOptionsEditor
              variable={variable}
              options={optionDrafts}
              summary={summary}
              onVariableChange={changeVariable}
              onOptionsChange={changeOptions}
            />
            {errors.options && (
              <p role="alert" className="text-xs font-medium text-red-700">
                {errors.options}
              </p>
            )}
          </>
        )}

        {step === 4 && (
          <VersionsStep
            rows={rows}
            baselineWarnings={warnings.map(removalWarningText)}
            options={options}
            shops={shops}
            selectedShops={selectedShops}
            selectedRows={selectedRows}
            defaultKey={effectiveDefaultKey}
            stockSeed={stockSeed}
            showComparePrices={showComparePrices}
            productImageUrl={
              mainPhoto ? (mainPhoto.kind === "stored" ? mainPhoto.url : mainPhoto.preview) : ""
            }
            skuErrors={skuErrors}
            priceErrorKeys={priceErrorKeys}
            errors={errors}
            onToggleShop={toggleShop}
            onStockSeedChange={changeStockSeed}
            onToggleSelect={(key, checked) =>
              setSelectedRows((current) => {
                const next = new Set(current);
                if (checked) next.add(key);
                else next.delete(key);
                return next;
              })
            }
            onToggleAll={(checked) =>
              setSelectedRows(
                checked ? new Set(rows.filter((row) => !row.removed).map((row) => row.key)) : new Set<string>(),
              )
            }
            onChangeRow={changeRow}
            onDefaultChange={setDefaultKey}
            onShowComparePricesChange={setShowComparePrices}
            onBulk={applyBulk}
          />
        )}
      </div>
    </AdminModal>
  );
}

function BasicsStep({
  form,
  errors,
  priceLocked,
  onChange,
  onSkuChange,
}: {
  form: BasicsForm;
  errors: Record<string, string>;
  /** A variable product's price is the cheapest live version, not a field. */
  priceLocked: boolean;
  onChange: (patch: Partial<BasicsForm>) => void;
  onSkuChange: (sku: string) => void;
}) {
  const nameId = useId();
  const categoryId = useId();
  const ageId = useId();
  const genderId = useId();
  const skuId = useId();
  const priceId = useId();
  const descriptionId = useId();
  const activeId = useId();
  const featuredId = useId();

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <HintedField
          label="Product name"
          required
          htmlFor={nameId}
          error={errors.name}
          hint="What a shopper sees on the shop page. Say what it is and what makes it different — “2-Pack Cotton Sleepsuits” beats “Sleepsuit”."
        >
          <input
            id={nameId}
            value={form.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="e.g. 2-Pack Cotton Sleepsuits"
            className="admin-input"
          />
        </HintedField>
      </div>

      <HintedField
        label="Category"
        required
        htmlFor={categoryId}
        error={errors.category}
        hint="Which shelf of the shop this belongs on. It decides the page shoppers find it on, and the first two letters of the product code."
      >
        <AdminSelect
          id={categoryId}
          value={form.category}
          onChange={(event) => {
            const category = event.target.value;
            onChange({ category });
            onSkuChange(generateSku(category));
          }}
        >
          {productCategories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </AdminSelect>
      </HintedField>

      <HintedField
        label="Product code"
        htmlFor={skuId}
        error={errors.sku}
        hint="The short code your team uses to find this product on a shelf or a delivery note. We make one up for you — change it if your shop already has its own."
      >
        <input
          id={skuId}
          value={form.sku}
          onChange={(event) => onSkuChange(event.target.value)}
          className="admin-input"
        />
      </HintedField>

      <HintedField
        label="Age range"
        required
        htmlFor={ageId}
        error={errors.ageRange}
        hint="Who the product fits. Parents filter by this more than by anything else, so pick the range on the label."
      >
        <AdminSelect
          id={ageId}
          value={form.ageRange}
          onChange={(event) => onChange({ ageRange: event.target.value })}
        >
          {productAgeRanges.map((age) => (
            <option key={age} value={age}>
              {age}
            </option>
          ))}
        </AdminSelect>
      </HintedField>

      <HintedField
        label="Who it is for"
        required
        htmlFor={genderId}
        error={errors.gender}
        hint="Choose Unisex when it suits any baby. Shoppers use this as a filter, so guessing narrows who ever sees it."
      >
        <AdminSelect
          id={genderId}
          value={form.gender}
          onChange={(event) => onChange({ gender: event.target.value })}
        >
          {productGenders.map((gender) => (
            <option key={gender} value={gender}>
              {gender}
            </option>
          ))}
        </AdminSelect>
      </HintedField>

      <HintedField
        label="Price"
        required={!priceLocked}
        htmlFor={priceId}
        error={errors.price}
        hint={
          priceLocked
            ? "This product is priced per version, so the shop shows the cheapest one on sale. Use “Edit versions & stock” to change what each version costs."
            : "What one costs, in cedis. Type just the number — 45 or 45.50."
        }
      >
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-[var(--color-ink-soft)]"
          >
            GH₵
          </span>
          <input
            id={priceId}
            type="number"
            min={0}
            step={0.01}
            value={form.price}
            readOnly={priceLocked}
            onChange={(event) => onChange({ price: event.target.value })}
            placeholder="0.00"
            className={`admin-input !pl-14 ${priceLocked ? "bg-[var(--color-cream)] text-[var(--color-ink-soft)]" : ""}`}
          />
        </div>
      </HintedField>

      <div className="sm:col-span-2">
        <HintedField
          label="Description"
          htmlFor={descriptionId}
          error={errors.description}
          hint="A few lines for the product page: what it is made of, how it washes, what is in the pack. Shoppers read this before they buy."
        >
          <textarea
            id={descriptionId}
            value={form.description}
            onChange={(event) => onChange({ description: event.target.value })}
            rows={4}
            className="admin-input min-h-[6.5rem] py-3"
            placeholder="Soft combed cotton, machine washable, two-way zip for night changes."
          />
        </HintedField>
      </div>

      <div className="sm:col-span-2">
        <label htmlFor={activeId} className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input
            id={activeId}
            type="checkbox"
            checked={form.isActive}
            onChange={(event) => onChange({ isActive: event.target.checked })}
            className="h-5 w-5 accent-[var(--color-brand)]"
          />
          On sale as soon as it is saved
        </label>
      </div>

      <div className="sm:col-span-2">
        <label htmlFor={featuredId} className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input
            id={featuredId}
            type="checkbox"
            checked={form.isFeatured}
            onChange={(event) => onChange({ isFeatured: event.target.checked })}
            className="h-5 w-5 accent-[var(--color-brand)]"
          />
          Feature on the homepage
        </label>
      </div>
    </div>
  );
}

function VersionsStep({
  rows,
  baselineWarnings,
  options,
  shops,
  selectedShops,
  selectedRows,
  defaultKey,
  stockSeed,
  showComparePrices,
  productImageUrl,
  skuErrors,
  priceErrorKeys,
  errors,
  onToggleShop,
  onStockSeedChange,
  onToggleSelect,
  onToggleAll,
  onChangeRow,
  onDefaultChange,
  onShowComparePricesChange,
  onBulk,
}: {
  rows: readonly VariantDraft[];
  baselineWarnings: readonly string[];
  options: readonly ProductOption[];
  shops: readonly Shop[];
  selectedShops: readonly string[];
  selectedRows: ReadonlySet<string>;
  defaultKey: string;
  stockSeed: string;
  showComparePrices: boolean;
  productImageUrl: string;
  skuErrors: Record<string, string>;
  priceErrorKeys: ReadonlySet<string>;
  errors: Record<string, string>;
  onToggleShop: (shopId: string, checked: boolean) => void;
  onStockSeedChange: (value: string) => void;
  onToggleSelect: (key: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onChangeRow: (key: string, patch: Partial<VariantDraft>) => void;
  onDefaultChange: (key: string) => void;
  onShowComparePricesChange: (show: boolean) => void;
  onBulk: (action: BulkAction) => void;
}) {
  const stockId = useId();
  const chosenShops = shops.filter((shop) => selectedShops.includes(shop.id));
  const simple = options.length === 0;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold">Which shops sell this?</p>
        <p className="mt-1 text-sm leading-6 text-[var(--color-ink-soft)]">
          Each shop keeps its own stock count. Untick a shop and this product will not show as
          available there.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {shops.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-soft)]">No shops are set up yet.</p>
          ) : (
            shops.map((shop) => (
              <label
                key={shop.id}
                className={`flex min-h-11 cursor-pointer items-center rounded-2xl border px-4 text-sm font-semibold transition ${
                  selectedShops.includes(shop.id)
                    ? "border-[var(--color-brand)] bg-[var(--color-brand-tint)]"
                    : "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)]"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={selectedShops.includes(shop.id)}
                  onChange={(event) => onToggleShop(shop.id, event.target.checked)}
                />
                {shop.name}
              </label>
            ))
          )}
        </div>
        {errors.availability && (
          <p role="alert" className="mt-2 text-xs font-medium text-red-700">
            {errors.availability}
          </p>
        )}
      </div>

      <HintedField
        label={simple ? "Stock per shop" : "Stock per shop to start with"}
        htmlFor={stockId}
        hint={
          simple
            ? "How many you have on the shelf in each of the shops ticked above."
            : "Fills in this count for every version and every shop in the table below. Change any single box afterwards to correct just that one."
        }
      >
        <input
          id={stockId}
          type="number"
          min={0}
          step={1}
          value={stockSeed}
          onChange={(event) => onStockSeedChange(event.target.value)}
          placeholder="0"
          className="admin-input sm:max-w-48"
        />
      </HintedField>

      {baselineWarnings.length > 0 && (
        <section
          role="status"
          className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900"
        >
          <p className="font-semibold">These versions are going off sale</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {baselineWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      )}

      {errors.variants && (
        <p role="alert" className="text-xs font-medium text-red-700">
          {errors.variants}
        </p>
      )}

      {!simple && (
        <>
          <VariantBulkBar
            rows={rows}
            selected={selectedRows}
            shops={chosenShops}
            onApply={onBulk}
          />
          <VariantMatrixTable
            rows={rows}
            options={options}
            shops={chosenShops}
            selected={selectedRows}
            defaultKey={defaultKey}
            showComparePrices={showComparePrices}
            productImageUrl={productImageUrl}
            skuErrors={skuErrors}
            priceErrorKeys={priceErrorKeys}
            onToggleSelect={onToggleSelect}
            onToggleAll={onToggleAll}
            onChangeRow={onChangeRow}
            onDefaultChange={onDefaultChange}
            onShowComparePricesChange={onShowComparePricesChange}
          />
        </>
      )}
    </div>
  );
}
