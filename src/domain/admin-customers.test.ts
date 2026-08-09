import { describe, expect, it } from "vitest";
import {
  ageInMonths,
  ageRangeLabelsForChild,
  daysUntilBirthday,
  filterAdminCustomers,
  nextBirthdayChild,
  type AdminCustomer,
} from "./admin-customers";

const customer: AdminCustomer = {
  id: "customer-one",
  userId: "customer-one",
  memberCode: "BBF-1001",
  parentName: "Ama Mensah",
  childName: "Kojo Mensah",
  phone: "+233200000000",
  email: "ama@example.com",
  childDob: "2022-08-05",
  createdAt: "2026-01-01T00:00:00.000Z",
  hasAccount: true,
  marketingStatus: "subscribed",
  children: [{ firstName: "Kojo", dateOfBirth: "2022-08-05" }],
  loyalty: {
    availablePoints: 120,
    pendingPoints: 10,
    lifetimePoints: 300,
    paidOrders: 4,
    lifetimeSpend: 1_200,
  },
};

describe("admin customer helpers", () => {
  it("finds customers by parent, child and member code", () => {
    expect(filterAdminCustomers([customer], "kojo")).toHaveLength(1);
    expect(filterAdminCustomers([customer], "bbf-1001")).toHaveLength(1);
    expect(filterAdminCustomers([customer], "unknown")).toHaveLength(0);
  });

  it("finds a family by a sibling who is not the one on show", () => {
    // The row shows the child whose birthday is next; searching for the other
    // one used to return nothing for a family that is plainly in the list.
    const family: AdminCustomer = {
      ...customer,
      children: [
        { firstName: "Kojo", dateOfBirth: "2022-08-05" },
        { firstName: "Abena", dateOfBirth: "2024-03-01" },
      ],
    };
    expect(filterAdminCustomers([family], "abena")).toHaveLength(1);
  });

  it("leads with the child whose birthday is soonest", () => {
    const now = new Date("2026-07-15T12:00:00Z");
    const children = [
      { firstName: "Kojo", dateOfBirth: "2022-12-25" },
      { firstName: "Abena", dateOfBirth: "2024-07-20" },
    ];
    expect(nextBirthdayChild(children, now)?.firstName).toBe("Abena");
  });

  it("still names a child when nobody has a recorded birthday", () => {
    expect(nextBirthdayChild([{ firstName: "Kojo", dateOfBirth: null }])?.firstName).toBe("Kojo");
    expect(nextBirthdayChild([])).toBeNull();
  });

  it("rolls birthdays into the next calendar year", () => {
    expect(daysUntilBirthday("2022-01-02", new Date("2026-12-31T12:00:00Z"))).toBe(2);
    expect(daysUntilBirthday("2022-07-23", new Date("2026-07-23T12:00:00Z"))).toBe(0);
  });

  it("puts a 29 February child on 28 February in a common year", () => {
    // Date.UTC(2027, 1, 29) rolls over to 1 March, so the countdown used to be
    // a day out for a leap-day child and disagreed with the SQL recipient
    // builder and with isBirthdayToday, which both land on 28 February.
    expect(daysUntilBirthday("2024-02-29", new Date("2027-02-27T12:00:00Z"))).toBe(1);
    expect(daysUntilBirthday("2024-02-29", new Date("2027-02-28T12:00:00Z"))).toBe(0);
    // A leap year still has the real day.
    expect(daysUntilBirthday("2024-02-29", new Date("2028-02-28T12:00:00Z"))).toBe(1);
  });

  it("computes age in whole months", () => {
    const now = new Date("2026-07-15T12:00:00Z");
    expect(ageInMonths("2024-01-15", now)).toBe(30);
    expect(ageInMonths("2026-06-20", now)).toBe(0);
    expect(ageInMonths("2026-04-15", now)).toBe(3);
    expect(ageInMonths("invalid-date", now)).toBeNull();
  });

  it("maps dates of birth to catalog age range labels", () => {
    const now = new Date("2026-07-15T12:00:00Z");
    expect(ageRangeLabelsForChild("2026-05-01", now)).toContain("newborn/0-3 months");
    expect(ageRangeLabelsForChild("2025-09-01", now)).toContain("6-12 months");
    expect(ageRangeLabelsForChild("2024-07-01", now)).toContain("1-2 years");
    expect(ageRangeLabelsForChild("2019-01-01", now)).toContain("5+ years");
    expect(ageRangeLabelsForChild("not-a-date", now)).toEqual(["all ages"]);
  });
});
