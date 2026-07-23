export type AdminRole = "boss" | "manager" | "inventory_clerk";

export type AdminCapability =
  | "catalog:read"
  | "catalog:write"
  | "inventory:read"
  | "inventory:write";

const roleCapabilities: Record<AdminRole, ReadonlySet<AdminCapability>> = {
  boss: new Set([
    "catalog:read",
    "catalog:write",
    "inventory:read",
    "inventory:write",
  ]),
  manager: new Set([
    "catalog:read",
    "catalog:write",
    "inventory:read",
    "inventory:write",
  ]),
  inventory_clerk: new Set([
    "catalog:read",
    "inventory:read",
    "inventory:write",
  ]),
};

export function hasAdminCapability(
  role: AdminRole,
  capability: AdminCapability,
) {
  return roleCapabilities[role].has(capability);
}
