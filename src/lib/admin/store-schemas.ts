import { z } from "zod";
import { blankToUndefined } from "@/lib/admin/schema-helpers";

/**
 * Request bodies for the Stores workspace.
 *
 * Every message here is read by a shop owner, not by whoever wrote the schema,
 * so they say what to do rather than what failed. `fieldErrors()` carries them
 * back to the specific input in the modal.
 *
 * `databaseName` used to live on these schemas and is gone on purpose: it was
 * required-if-present (`min(1).optional()`) while the form always sent `""`,
 * so **every** store creation answered 400. It is an internal slug nobody
 * outside the database ever needs, and `createStore` derives it from the name.
 */

const imageUrlSchema = z.url("Enter a full image address, starting with https://");

const whatsappNumberSchema = z
  .string()
  .trim()
  .regex(
    /^\+?[0-9][0-9\s-]{6,19}$/,
    "Enter a WhatsApp number with digits only, for example +233 24 000 0000.",
  );

/** On a create, blank means "not given". */
const optionalWhatsappSchema = blankToUndefined(whatsappNumberSchema);
const optionalImageUrlSchema = blankToUndefined(imageUrlSchema);

/**
 * On a patch, blank means "remove this" — otherwise a WhatsApp number or a
 * staff photo typed in by mistake can never be taken back out, because the
 * blank the form sends would be read as "leave it alone".
 */
function clearable<Schema extends z.ZodType>(schema: Schema) {
  return z.preprocess(
    (value) => (value === "" ? null : value),
    z.union([schema, z.null()]).optional(),
  );
}

export const storeIdSchema = z.uuid();
export const staffIdSchema = z.uuid();

export const storeCreateSchema = z.object({
  name: z.string().trim().min(1, "Give the branch a name.").max(120, "Keep the name under 120 characters."),
  location: z
    .string()
    .trim()
    .min(1, "Say where this branch is, for example Sakumono.")
    .max(240, "Keep the location under 240 characters."),
  whatsappNumber: optionalWhatsappSchema,
  isActive: z.boolean().default(true),
});

export const storePatchSchema = z
  .object({
    name: z.string().trim().min(1, "Give the branch a name.").max(120, "Keep the name under 120 characters.").optional(),
    location: z
      .string()
      .trim()
      .min(1, "Say where this branch is, for example Sakumono.")
      .max(240, "Keep the location under 240 characters.")
      .optional(),
    whatsappNumber: clearable(whatsappNumberSchema),
    isActive: z.boolean().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Change at least one detail before saving.",
  });

/**
 * `authorizedEmail` is gone too. The sign-in address is always derived from the
 * CounterID — `patchStaff` already ignored anything sent here — and accepting a
 * field the server discards is how an admin ends up believing they set an
 * address that never took effect.
 */
export const staffCreateSchema = z.object({
  staffName: z.string().trim().min(1, "Enter the staff member's name.").max(140, "Keep the name under 140 characters."),
  staffContact: z.string().trim().max(80, "Keep the contact under 80 characters.").default(""),
  profileImageUrl: optionalImageUrlSchema,
  accessActive: z.boolean().default(true),
});

export const staffPatchSchema = z
  .object({
    staffName: z
      .string()
      .trim()
      .min(1, "Enter the staff member's name.")
      .max(140, "Keep the name under 140 characters.")
      .optional(),
    staffContact: z.string().trim().max(80, "Keep the contact under 80 characters.").optional(),
    profileImageUrl: clearable(imageUrlSchema),
    accessActive: z.boolean().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Change at least one detail before saving.",
  });

export type StoreCreateInput = z.infer<typeof storeCreateSchema>;
export type StorePatchInput = z.infer<typeof storePatchSchema>;
export type StaffCreateInput = z.infer<typeof staffCreateSchema>;
export type StaffPatchInput = z.infer<typeof staffPatchSchema>;

/* -------------------------------------------------------------------------- */
/* What the Stores workspace sends                                            */
/* -------------------------------------------------------------------------- */

/**
 * The request bodies live next to the schemas that accept them on purpose.
 *
 * The add-store bug was a mismatch between the two halves — the form posted
 * `""` for a field the schema would only accept as absent — and it survived
 * because the two halves were written in different files by different people
 * with nothing asserting they agreed. Keeping them adjacent means the tests
 * below can feed one straight into the other.
 */

export type StoreFormValues = {
  name: string;
  location: string;
  whatsappNumber: string;
  isActive: boolean;
};

export type StaffFormValues = {
  staffName: string;
  staffContact: string;
  profileImageUrl: string;
  accessActive: boolean;
};

/** Blank optional fields are omitted, because `.optional()` means absent, not `""`. */
export function storeCreateBody(form: StoreFormValues): Record<string, unknown> {
  const whatsappNumber = form.whatsappNumber.trim();
  return {
    name: form.name.trim(),
    location: form.location.trim(),
    isActive: form.isActive,
    ...(whatsappNumber ? { whatsappNumber } : {}),
  };
}

/** Blank optional fields are sent as `""`, which the patch schema reads as "clear it". */
export function storePatchBody(form: StoreFormValues): Record<string, unknown> {
  return {
    name: form.name.trim(),
    location: form.location.trim(),
    whatsappNumber: form.whatsappNumber.trim(),
    isActive: form.isActive,
  };
}

export function staffCreateBody(form: StaffFormValues): Record<string, unknown> {
  const profileImageUrl = form.profileImageUrl.trim();
  return {
    staffName: form.staffName.trim(),
    staffContact: form.staffContact.trim(),
    accessActive: form.accessActive,
    ...(profileImageUrl ? { profileImageUrl } : {}),
  };
}

export function staffPatchBody(form: StaffFormValues): Record<string, unknown> {
  return {
    staffName: form.staffName.trim(),
    staffContact: form.staffContact.trim(),
    profileImageUrl: form.profileImageUrl.trim(),
    accessActive: form.accessActive,
  };
}
