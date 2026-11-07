import type { AppRole } from "@/lib/session";

/** Every signed-in role. Super Admin is on each list below as well. */
export const EVERY_ROLE: AppRole[] = [
  "super_admin",
  "admin",
  "finance_admin",
  "warehouse_admin",
  "sales_officer",
];

/**
 * Who may open a page. The longest matching prefix wins, so
 * /inventory/receive stays with the warehouse even though /inventory is wider.
 * The database still rejects a mutation the role is not allowed to perform.
 */
export const PAGE_ACCESS: { prefix: string; roles: AppRole[] }[] = [
  { prefix: "/inventory/receive", roles: ["super_admin", "admin", "warehouse_admin"] },
  { prefix: "/inventory/opening", roles: ["super_admin", "admin", "warehouse_admin"] },
  { prefix: "/inventory/adjust", roles: ["super_admin", "admin", "warehouse_admin"] },
  { prefix: "/inventory", roles: ["super_admin", "admin", "warehouse_admin", "sales_officer"] },
  { prefix: "/requisitions", roles: ["super_admin", "admin", "warehouse_admin", "sales_officer"] },
  { prefix: "/products", roles: ["super_admin", "admin", "warehouse_admin", "sales_officer"] },
  { prefix: "/wallet", roles: ["super_admin", "admin", "finance_admin", "sales_officer"] },
  { prefix: "/deposits", roles: ["super_admin", "admin", "finance_admin", "sales_officer"] },
  { prefix: "/expenses", roles: ["super_admin", "admin", "finance_admin", "sales_officer"] },
  { prefix: "/chemists", roles: ["super_admin", "admin", "sales_officer"] },
  { prefix: "/doctors", roles: ["super_admin", "admin", "sales_officer"] },
  { prefix: "/visits", roles: ["super_admin", "admin", "sales_officer"] },
  { prefix: "/deliveries", roles: ["super_admin", "admin", "finance_admin", "warehouse_admin", "sales_officer"] },
  { prefix: "/orders", roles: EVERY_ROLE },
  { prefix: "/reports", roles: EVERY_ROLE },
  { prefix: "/users", roles: ["super_admin", "admin"] },
  { prefix: "/settings", roles: ["super_admin", "admin"] },
  { prefix: "/audit", roles: ["super_admin", "admin"] },
  { prefix: "/dashboard", roles: EVERY_ROLE },
];

export function rolesForPath(pathname: string): AppRole[] {
  const matches = PAGE_ACCESS.filter(
    (page) => pathname === page.prefix || pathname.startsWith(`${page.prefix}/`),
  ).sort((a, b) => b.prefix.length - a.prefix.length);
  return matches[0]?.roles ?? EVERY_ROLE;
}

export function canOpen(pathname: string, roles: readonly AppRole[]): boolean {
  if (roles.length === 0) return false;
  return rolesForPath(pathname).some((role) => roles.includes(role));
}
