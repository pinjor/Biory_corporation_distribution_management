import { getRouteApi } from "@tanstack/react-router";
import type { Database } from "@/lib/database.types";

export type AppRole = Database["public"]["Enums"]["app_role"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  finance_admin: "Finance Admin",
  warehouse_admin: "Warehouse Admin",
  sales_officer: "Sales Officer",
};

export const ALL_ROLES: AppRole[] = ["super_admin", "admin", "finance_admin", "warehouse_admin", "sales_officer"];

export interface SessionInfo {
  userId: string;
  email: string;
  profile: Profile | null;
  roles: AppRole[];
}

export function roleHelpers(roles: AppRole[]) {
  const has = (...r: AppRole[]) => r.some((x) => roles.includes(x));
  return {
    has,
    isSuper: has("super_admin"),
    isAdmin: has("super_admin", "admin"),
    isFinance: has("super_admin", "admin", "finance_admin"),
    isWarehouse: has("super_admin", "admin", "warehouse_admin"),
    isStaff: has("super_admin", "admin", "finance_admin", "warehouse_admin"),
    isSO: has("sales_officer"),
  };
}

const authApi = getRouteApi("/_authenticated");

export function useSession() {
  const ctx = authApi.useRouteContext();
  const s = ctx.session as SessionInfo;
  return { ...s, ...roleHelpers(s.roles) };
}
