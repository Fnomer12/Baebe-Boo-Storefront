import { describe, expect, it } from "vitest";
import {
  staffCreateBody,
  staffCreateSchema,
  staffPatchBody,
  staffPatchSchema,
  storeCreateBody,
  storeCreateSchema,
  storePatchBody,
  storePatchSchema,
} from "./store-schemas";

const blankStore = {
  name: "Baebe Boo Sogakope",
  location: "Sogakope",
  whatsappNumber: "",
  isActive: true,
};

describe("storeCreateBody + storeCreateSchema", () => {
  it("accepts a store with every optional field left blank", () => {
    // THE add-store bug: `emptyStoreForm.databaseName = ""` was posted verbatim
    // against `databaseName: z.string().trim().min(1).max(120).optional()`, and
    // `.optional()` admits `undefined`, never `""`. Every single creation
    // answered 400 — and leaving that field blank was the normal case, because
    // nothing marked it required. The field is gone; this asserts the blank
    // form now parses.
    const parsed = storeCreateSchema.safeParse(storeCreateBody(blankStore));

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toEqual({
      name: "Baebe Boo Sogakope",
      location: "Sogakope",
      isActive: true,
    });
  });

  it("no longer accepts a database name, so it can only ever be derived", () => {
    const parsed = storeCreateSchema.safeParse({
      ...storeCreateBody(blankStore),
      databaseName: "hand_typed_slug",
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).not.toHaveProperty("databaseName");
  });

  it("carries a WhatsApp number through when one is given", () => {
    const parsed = storeCreateSchema.safeParse(
      storeCreateBody({ ...blankStore, whatsappNumber: " +233 24 000 0000 " }),
    );

    expect(parsed.success && parsed.data.whatsappNumber).toBe("+233 24 000 0000");
  });

  it("names the offending field rather than failing the whole form", () => {
    const parsed = storeCreateSchema.safeParse(
      storeCreateBody({ ...blankStore, name: "  ", whatsappNumber: "not a number" }),
    );

    expect(parsed.success).toBe(false);
    const paths = parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join("."));
    expect(paths).toContain("name");
    expect(paths).toContain("whatsappNumber");
  });
});

describe("storePatchBody + storePatchSchema", () => {
  it("round-trips an edit", () => {
    const parsed = storePatchSchema.safeParse(
      storePatchBody({ ...blankStore, whatsappNumber: "0240000000", isActive: false }),
    );

    expect(parsed.success && parsed.data).toEqual({
      name: "Baebe Boo Sogakope",
      location: "Sogakope",
      whatsappNumber: "0240000000",
      isActive: false,
    });
  });

  it("clears a WhatsApp number that was typed in by mistake", () => {
    // A blank on a patch has to mean "remove it". Treating it as "leave it
    // alone" — which is what `blankToUndefined` does, and what the create
    // schema wants — makes a wrong number permanent.
    const parsed = storePatchSchema.safeParse(storePatchBody(blankStore));

    expect(parsed.success && parsed.data.whatsappNumber).toBeNull();
  });
});

const blankStaff = {
  staffName: "Amanda",
  staffContact: "",
  profileImageUrl: "",
  accessActive: true,
};

describe("staffCreateBody + staffCreateSchema", () => {
  it("accepts a staff member with no photo and no contact", () => {
    const parsed = staffCreateSchema.safeParse(staffCreateBody(blankStaff));

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toEqual({
      staffName: "Amanda",
      staffContact: "",
      accessActive: true,
    });
  });

  it("no longer accepts an authorized email", () => {
    // `patchStaff` already ignored it, and a field the server silently discards
    // is how an admin ends up believing they set a sign-in address that never
    // took effect — while the real one is derived from the CounterID.
    const parsed = staffCreateSchema.safeParse({
      ...staffCreateBody(blankStaff),
      authorizedEmail: "amanda@example.com",
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).not.toHaveProperty("authorizedEmail");
  });

  it("rejects a photo address that is not a URL, on the photo field", () => {
    const parsed = staffCreateSchema.safeParse(
      staffCreateBody({ ...blankStaff, profileImageUrl: "not-a-url" }),
    );

    expect(parsed.success).toBe(false);
    expect(parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join("."))).toEqual([
      "profileImageUrl",
    ]);
  });
});

describe("staffPatchBody + staffPatchSchema", () => {
  it("keeps an uploaded photo", () => {
    const parsed = staffPatchSchema.safeParse(
      staffPatchBody({ ...blankStaff, profileImageUrl: "https://example.com/a.jpg" }),
    );

    expect(parsed.success && parsed.data.profileImageUrl).toBe("https://example.com/a.jpg");
  });

  it("clears a photo when it has been removed", () => {
    const parsed = staffPatchSchema.safeParse(staffPatchBody(blankStaff));

    expect(parsed.success && parsed.data.profileImageUrl).toBeNull();
  });

  it("still carries the access switch, which is the only thing that revokes a till login", () => {
    const parsed = staffPatchSchema.safeParse(
      staffPatchBody({ ...blankStaff, accessActive: false }),
    );

    expect(parsed.success && parsed.data.accessActive).toBe(false);
  });
});
