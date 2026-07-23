import { describe, expect, it } from "vitest";
import {
  daysUntilBirthday,
  filterAdminCustomers,
  type AdminCustomer,
} from "./admin-customers";

const customer: AdminCustomer = {
  id: "customer-one",
  memberCode: "BBF-1001",
  parentName: "Ama Mensah",
  childName: "Kojo Mensah",
  phone: "+233200000000",
  email: "ama@example.com",
  childDob: "2022-08-05",
  createdAt: "2026-01-01T00:00:00.000Z",
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

  it("rolls birthdays into the next calendar year", () => {
    expect(daysUntilBirthday("2022-01-02", new Date("2026-12-31T12:00:00Z"))).toBe(2);
    expect(daysUntilBirthday("2022-07-23", new Date("2026-07-23T12:00:00Z"))).toBe(0);
  });
});
