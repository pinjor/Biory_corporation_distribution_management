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
 * /inventory/opening stays with the warehouse even though /inventory is wider.
 * The database still rejects a mutation the role is not allowed to perform.
 */
export const PAGE_ACCESS: { prefix: string; roles: AppRole[] }[] = [
  { prefix: "/inventory/receive", roles: ["super_admin", "admin", "warehouse_admin", "sales_officer"] },
  { prefix: "/inventory/opening", roles: ["super_admin", "admin", "warehouse_admin"] },
  { prefix: "/inventory/adjust", roles: ["super_admin", "admin", "warehouse_admin"] },
  { prefix: "/inventory", roles: ["super_admin", "admin", "warehouse_admin", "sales_officer"] },
  { prefix: "/requisitions", roles: ["super_admin", "admin", "warehouse_admin", "sales_officer"] },
  { prefix: "/products", roles: ["super_admin", "admin", "warehouse_admin", "sales_officer"] },
  { prefix: "/master/expense-categories", roles: ["super_admin", "admin", "finance_admin"] },
  { prefix: "/master", roles: ["super_admin", "admin", "warehouse_admin"] },
  { prefix: "/wallet", roles: ["super_admin", "admin", "finance_admin", "sales_officer"] },
  { prefix: "/deposits", roles: ["super_admin", "admin", "finance_admin", "sales_officer"] },
  { prefix: "/expenses", roles: ["super_admin", "admin", "finance_admin", "sales_officer"] },
  { prefix: "/sales-officers", roles: ["super_admin"] },
  { prefix: "/territories", roles: ["super_admin", "admin"] },
  { prefix: "/chemists", roles: ["super_admin", "admin", "sales_officer"] },
  { prefix: "/doctors", roles: ["super_admin", "admin", "sales_officer"] },
  { prefix: "/visits", roles: ["super_admin", "admin", "sales_officer"] },
  { prefix: "/attendance", roles: ["super_admin", "admin", "sales_officer"] },
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

/** Menus a Super Admin can tick on the Role access screen. */
export const MENU_CATALOG: { key: string; label: string; group: string; path: string }[] = [
  { key: "/dashboard", label: "Dashboard", group: "Overview", path: "/dashboard" },
  { key: "/orders", label: "Orders", group: "Sales", path: "/orders" },
  { key: "/visits", label: "Doctor visits", group: "Sales", path: "/visits" },
  { key: "/attendance", label: "Punch in / out", group: "Attendance", path: "/attendance" },
  { key: "/attendance/history", label: "Attendance history", group: "Attendance", path: "/attendance/history" },
  { key: "/inventory", label: "Stock", group: "Inventory", path: "/inventory" },
  { key: "/requisitions", label: "Requisitions", group: "Inventory", path: "/requisitions" },
  { key: "/inventory/receive", label: "Receive stock", group: "Inventory", path: "/inventory/receive" },
  { key: "/inventory/opening", label: "Opening stock", group: "Inventory", path: "/inventory/opening" },
  { key: "/inventory/adjust", label: "Stock adjustment", group: "Inventory", path: "/inventory/adjust" },
  { key: "/products", label: "Products", group: "Master data", path: "/products" },
  { key: "/chemists", label: "Chemists", group: "Master data", path: "/chemists" },
  { key: "/doctors", label: "Doctors", group: "Master data", path: "/doctors" },
  { key: "/sales-officers", label: "Sales officers", group: "Master data", path: "/sales-officers" },
  { key: "/territories", label: "Territories", group: "Master data", path: "/territories" },
  { key: "/settings", label: "Pricing & policy", group: "Master data", path: "/settings" },
  { key: "/master/pack-size", label: "Pack size", group: "Master data", path: "/master/pack-size" },
  { key: "/master/expense-categories", label: "Expense categories", group: "Master data", path: "/master/expense-categories" },
  { key: "/master/uom", label: "Product UOM", group: "Master data", path: "/master/uom" },
  { key: "/master/strength", label: "Strength", group: "Master data", path: "/master/strength" },
  { key: "/master/generic-name", label: "Generic name", group: "Master data", path: "/master/generic-name" },
  { key: "/wallet", label: "Wallet", group: "Money", path: "/wallet" },
  { key: "/deposits", label: "Deposits", group: "Money", path: "/deposits" },
  { key: "/expenses", label: "Expenses", group: "Money", path: "/expenses" },
  { key: "report:outstanding", label: "Outstanding & ageing", group: "Reports", path: "/reports" },
  { key: "report:so", label: "SO performance", group: "Reports", path: "/reports" },
  { key: "report:product", label: "Product sales", group: "Reports", path: "/reports" },
  { key: "report:collections", label: "Collections", group: "Reports", path: "/reports" },
  { key: "report:discounts", label: "Discounts", group: "Reports", path: "/reports" },
  { key: "report:stocklist", label: "Stock report", group: "Reports", path: "/reports" },
  { key: "report:batchstock", label: "Batch wise stock", group: "Reports", path: "/reports" },
  { key: "report:stock", label: "Re-order level", group: "Reports", path: "/reports" },
  { key: "report:expiry", label: "Near expiry", group: "Reports", path: "/reports" },
  { key: "report:promo", label: "Promotional usage", group: "Reports", path: "/reports" },
  { key: "report:issue", label: "Item wise issue", group: "Reports", path: "/reports" },
  { key: "report:receive", label: "Item wise receive", group: "Reports", path: "/reports" },
  { key: "report:itemstock", label: "Item stock", group: "Reports", path: "/reports" },
  { key: "/users", label: "Users", group: "Administration", path: "/users" },
  { key: "/role-access", label: "Role access", group: "Administration", path: "/role-access" },
  { key: "/audit", label: "Audit log", group: "Administration", path: "/audit" },
];

const MONEY_REPORTS = new Set(["outstanding", "so", "product", "collections", "discounts"]);

export function menuKeyForPath(pathname: string): string {
  const pages = MENU_CATALOG.filter((item) => !item.key.startsWith("report:"));
  const matches = pages.filter((item) => pathname === item.path || pathname.startsWith(`${item.path}/`));
  matches.sort((a, b) => b.path.length - a.path.length);
  return matches[0]?.key ?? pathname;
}

/** True when this role may open that menu. `menus` is the saved Role access list; without it the built-in defaults apply. */
export function menuAllowed(key: string, roles: readonly AppRole[], menus?: readonly string[] | null): boolean {
  if (roles.length === 0) return false;
  if (roles.includes("super_admin") && (key === "/dashboard" || key === "/users" || key === "/role-access")) return true;
  if (menus) return menus.includes(key);
  if (key.startsWith("report:")) {
    const name = key.slice("report:".length);
    const money = MONEY_REPORTS.has(name);
    const allowed: AppRole[] = money
      ? ["super_admin", "admin", "finance_admin", "sales_officer"]
      : ["super_admin", "admin", "warehouse_admin", "sales_officer"];
    return allowed.some((role) => roles.includes(role));
  }
  return rolesForPath(key).some((role) => roles.includes(role));
}

export function canOpen(pathname: string, roles: readonly AppRole[], menus?: readonly string[] | null): boolean {
  if (roles.length === 0) return false;
  if (pathname === "/reports" || pathname.startsWith("/reports/")) {
    return MENU_CATALOG.some((item) => item.key.startsWith("report:") && menuAllowed(item.key, roles, menus));
  }
  return menuAllowed(menuKeyForPath(pathname), roles, menus);
}

/** First page this role may open, so a blocked URL can land somewhere that is allowed. */
export function firstOpenPath(roles: readonly AppRole[], menus?: readonly string[] | null): string | null {
  const page = MENU_CATALOG.find((item) => !item.key.startsWith("report:") && menuAllowed(item.key, roles, menus));
  if (page) return page.path;
  if (canOpen("/reports", roles, menus)) return "/reports";
  return null;
}
