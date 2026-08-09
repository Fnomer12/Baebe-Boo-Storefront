export type AdminRole = "boss" | "manager" | "inventory_clerk";

export type AdminCapability =
  | "catalog:read"
  | "catalog:write"
  | "inventory:read"
  | "inventory:write"
  | "stores:read"
  | "stores:write"
  | "customers:read"
  | "customers:write"
  | "orders:read"
  | "orders:write"
  | "content:read"
  | "content:write";

const roleCapabilities: Record<AdminRole, ReadonlySet<AdminCapability>> = {
  boss: new Set([
    "catalog:read",
    "catalog:write",
    "inventory:read",
    "inventory:write",
    "stores:read",
    "stores:write",
    "customers:read",
    "customers:write",
    "orders:read",
    "orders:write",
    "content:read",
    "content:write",
  ]),
  manager: new Set([
    "catalog:read",
    "catalog:write",
    "inventory:read",
    "inventory:write",
    "stores:read",
    "stores:write",
    "customers:read",
    "customers:write",
    "orders:read",
    "orders:write",
    "content:read",
    "content:write",
  ]),
  inventory_clerk: new Set([
    "catalog:read",
    "inventory:read",
    "inventory:write",
    "stores:read",
    "customers:read",
    "orders:read",
  ]),
};

export function hasAdminCapability(
  role: AdminRole,
  capability: AdminCapability,
) {
  return roleCapabilities[role].has(capability);
}
