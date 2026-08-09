import { describe, expect, it } from "vitest";
import {
  checkbox,
  compact,
  isoToLocalDateTime,
  localDateTimeToIso,
  optionalNumber,
  optionalText,
  requiredNumber,
  requiredText,
} from "./form-values";

describe("optionalText", () => {
  it("turns an untouched field into undefined, not an empty string", () => {
    // THE bug. `.optional()` in zod admits undefined, never "". Sending ""
    // made "create promotion", "create voucher" and "add store" all 400 for
    // the normal case of leaving an optional field blank.
    expect(optionalText("")).toBeUndefined();
    expect(optionalText(null)).toBeUndefined();
    expect(optionalText(undefined)).toBeUndefined();
  });

  it("treats whitespace as blank", () => {
    expect(optionalText("   ")).toBeUndefined();
  });

  it("trims a real value", () => {
    expect(optionalText("  SUMMER20  ")).toBe("SUMMER20");
  });

  it("ignores a File, which is never a text field", () => {
    expect(optionalText(new File([], "photo.png"))).toBeUndefined();
  });
});

describe("requiredText", () => {
  it("returns empty string so zod reports the real field error", () => {
    // Deliberately NOT undefined: a required field left blank should fail as
    // "too small", not as "expected string, received undefined".
    expect(requiredText("")).toBe("");
  });

  it("trims", () => {
    expect(requiredText("  Osu Branch ")).toBe("Osu Branch");
  });
});

describe("optionalNumber", () => {
  it("returns undefined when blank", () => {
    expect(optionalNumber("")).toBeUndefined();
  });

  it("keeps a literal zero", () => {
    // The idiom this replaces was `Number(x || 0) || undefined`, which threw
    // zero away — so "0% off" and "minimum order GH₵0" both became "not set".
    expect(optionalNumber("0")).toBe(0);
  });

  it("parses decimals", () => {
    expect(optionalNumber("12.5")).toBe(12.5);
  });

  it("returns undefined for junk rather than NaN", () => {
    expect(optionalNumber("abc")).toBeUndefined();
  });
});

describe("requiredNumber", () => {
  it("returns NaN for blank so zod says 'expected number'", () => {
    expect(requiredNumber("")).toBeNaN();
  });

  it("parses a value", () => {
    expect(requiredNumber("20")).toBe(20);
  });
});

describe("checkbox", () => {
  it("reads the browser's 'on'", () => {
    expect(checkbox("on")).toBe(true);
  });

  it("is false when the box is absent from FormData", () => {
    // An unchecked box is not submitted at all, so the value is null.
    expect(checkbox(null)).toBe(false);
  });
});

describe("localDateTimeToIso", () => {
  it("returns undefined when blank", () => {
    expect(localDateTimeToIso("")).toBeUndefined();
  });

  it("converts the browser's zone-less wall clock to a full ISO instant", () => {
    // datetime-local yields "2026-08-06T14:30" — no seconds, no zone — which
    // fails z.string().datetime() outright. Filling the date in was therefore
    // just as broken as leaving it blank.
    const iso = localDateTimeToIso("2026-08-06T14:30");
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(iso as string).getTime()).toBe(
      new Date("2026-08-06T14:30").getTime(),
    );
  });

  it("accepts a value that includes seconds", () => {
    expect(localDateTimeToIso("2026-08-06T14:30:45")).toBeDefined();
  });

  it("returns undefined for junk rather than 'Invalid Date'", () => {
    expect(localDateTimeToIso("not a date")).toBeUndefined();
  });

  it("round-trips through isoToLocalDateTime", () => {
    const iso = localDateTimeToIso("2026-08-06T14:30");
    expect(isoToLocalDateTime(iso)).toBe("2026-08-06T14:30");
  });
});

describe("isoToLocalDateTime", () => {
  it("is empty for null", () => {
    expect(isoToLocalDateTime(null)).toBe("");
  });

  it("strips the timezone datetime-local refuses to accept", () => {
    // A stored instant handed straight to the input renders as blank, which
    // reads as "this promotion has no end date" on an edit form.
    expect(isoToLocalDateTime("2026-08-06T14:30:00.000Z")).not.toContain("Z");
    expect(isoToLocalDateTime("2026-08-06T14:30:00.000Z")).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
    );
  });

  it("is empty for junk", () => {
    expect(isoToLocalDateTime("nonsense")).toBe("");
  });
});

describe("compact", () => {
  it("drops undefined entries", () => {
    expect(compact({ name: "Summer", code: undefined, value: 0 })).toEqual({
      name: "Summer",
      value: 0,
    });
  });

  it("keeps null, which is a deliberate 'clear this field'", () => {
    expect(compact({ endsAt: null })).toEqual({ endsAt: null });
  });
});
