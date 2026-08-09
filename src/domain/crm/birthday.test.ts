import { describe, expect, it } from "vitest";
import {
  birthdayCreditSourceKey,
  dedupeBirthdayCandidates,
  isBirthdayToday,
  type BirthdayCandidate,
} from "./birthday";

describe("isBirthdayToday", () => {
  it("does not shift the date on a server west of UTC", () => {
    // The bug: birthday-credits parsed `YYYY-MM-DD` as UTC midnight and then
    // read it back with LOCAL getters, so anywhere west of UTC every birthday
    // resolved to the previous day and the credit fired 24 hours early.
    // 2026-08-06T02:00Z is still 5 August in Accra-minus-4, and this must not
    // care either way.
    expect(isBirthdayToday("2020-08-06", new Date("2026-08-06T02:00:00Z"))).toBe(true);
    expect(isBirthdayToday("2020-08-05", new Date("2026-08-06T02:00:00Z"))).toBe(false);
    expect(isBirthdayToday("2020-08-06", new Date("2026-08-06T23:30:00Z"))).toBe(true);
  });

  it("ignores the birth year", () => {
    expect(isBirthdayToday("1988-03-14", new Date("2026-03-14T09:00:00Z"))).toBe(true);
  });

  it("credits a 29 February child on 28 February in a common year", () => {
    expect(isBirthdayToday("2024-02-29", new Date("2027-02-28T12:00:00Z"))).toBe(true);
    expect(isBirthdayToday("2024-02-29", new Date("2028-02-29T12:00:00Z"))).toBe(true);
    // …and not twice in the leap year that has both days.
    expect(isBirthdayToday("2024-02-29", new Date("2028-02-28T12:00:00Z"))).toBe(false);
  });

  it("rejects junk rather than matching everything", () => {
    expect(isBirthdayToday(null, new Date("2026-08-06T12:00:00Z"))).toBe(false);
    expect(isBirthdayToday("", new Date("2026-08-06T12:00:00Z"))).toBe(false);
    expect(isBirthdayToday("not-a-date", new Date("2026-08-06T12:00:00Z"))).toBe(false);
    expect(isBirthdayToday("2026-02-31", new Date("2026-02-28T12:00:00Z"))).toBe(false);
  });

  it("accepts a full timestamp, which is what PostgREST returns for some columns", () => {
    expect(isBirthdayToday("2020-08-06T00:00:00+00:00", new Date("2026-08-06T12:00:00Z"))).toBe(true);
  });
});

describe("birthdayCreditSourceKey", () => {
  it("is the same string all day, so a 15-minute cron cannot pay twice", () => {
    const morning = birthdayCreditSourceKey("user-1", new Date("2026-08-06T07:00:00Z"));
    const later = birthdayCreditSourceKey("user-1", new Date("2026-08-06T09:45:00Z"));
    expect(morning).toBe(later);
    expect(morning).toBe("birthday:2026:user-1");
  });

  it("differs by year, so the same person is credited again next birthday", () => {
    expect(birthdayCreditSourceKey("user-1", new Date("2027-08-06T07:00:00Z"))).toBe("birthday:2027:user-1");
  });
});

describe("dedupeBirthdayCandidates", () => {
  function candidate(overrides: Partial<BirthdayCandidate> = {}): BirthdayCandidate {
    return {
      userId: "user-1",
      email: "ama@example.com",
      parentName: "Ama Mensah",
      childName: "Kojo",
      childDateOfBirth: "2022-08-05",
      daysUntilBirthday: 3,
      ...overrides,
    };
  }

  it("collapses the same child arriving from members and customer_children", () => {
    // During the backfill window a child exists in both tables. One parent,
    // one email.
    const rows = dedupeBirthdayCandidates([
      candidate({ userId: null }),
      candidate({ userId: "user-1" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe("user-1");
  });

  it("keeps siblings apart but not twins with the same birthday", () => {
    const rows = dedupeBirthdayCandidates([
      candidate({ childName: "Kojo", childDateOfBirth: "2022-08-05" }),
      candidate({ childName: "Abena", childDateOfBirth: "2024-03-01", daysUntilBirthday: 20 }),
      candidate({ childName: "Yaw", childDateOfBirth: "2022-08-05" }),
    ]);
    expect(rows.map((row) => row.childDateOfBirth)).toEqual(["2022-08-05", "2024-03-01"]);
  });

  it("orders by urgency so a bounded batch takes the soonest first", () => {
    const rows = dedupeBirthdayCandidates([
      candidate({ email: "c@example.com", daysUntilBirthday: 9 }),
      candidate({ email: "a@example.com", daysUntilBirthday: 0 }),
      candidate({ email: "b@example.com", daysUntilBirthday: 4 }),
    ]);
    expect(rows.map((row) => row.email)).toEqual(["a@example.com", "b@example.com", "c@example.com"]);
  });

  it("drops rows with no mailbox and lower-cases the rest", () => {
    const rows = dedupeBirthdayCandidates([
      candidate({ email: "  " }),
      candidate({ email: "AMA@Example.com" }),
    ]);
    expect(rows.map((row) => row.email)).toEqual(["ama@example.com"]);
  });
});
