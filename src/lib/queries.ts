import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

/** Lists the order form needs offline are kept for a day in memory and persisted on the device. */
const OFFLINE_GC = 24 * 60 * 60 * 1000;
export const OFFLINE_QUERY_ROOTS = new Set(["settings", "products", "chemists", "my-available-stock", "territories"]);

export const settingsQuery = queryOptions({
  queryKey: ["settings"],
  queryFn: async () => {
    const { data, error } = await api.from("app_settings").select("*").eq("id", 1).single();
    if (error) throw error;
    return data;
  },
  staleTime: 60_000,
  gcTime: OFFLINE_GC,
});

export const productsQuery = queryOptions({
  queryKey: ["products"],
  queryFn: async () => {
    const { data, error } = await api.from("products").select("*").order("name");
    if (error) throw error;
    return data;
  },
  staleTime: 30_000,
  gcTime: OFFLINE_GC,
});

export const territoriesQuery = queryOptions({
  queryKey: ["territories"],
  queryFn: async () => {
    const { data, error } = await api.from("territories").select("*").order("name");
    if (error) throw error;
    return data;
  },
  staleTime: 60_000,
});

export const locationsQuery = queryOptions({
  queryKey: ["locations"],
  queryFn: async () => {
    const { data, error } = await api.from("locations").select("*").order("kind").order("name");
    if (error) throw error;
    return data;
  },
  staleTime: 30_000,
});

/** All Sales Officers (profiles holding the sales_officer role). */
export const salesOfficersQuery = queryOptions({
  queryKey: ["sales-officers"],
  queryFn: async () => {
    const { data: roles, error } = await api.from("user_roles").select("user_id").eq("role", "sales_officer");
    if (error) throw error;
    const ids = roles.map((r) => r.user_id);
    if (ids.length === 0) return [];
    const { data, error: e2 } = await api.from("profiles").select("*").in("id", ids).order("full_name");
    if (e2) throw e2;
    return data;
  },
  staleTime: 30_000,
});

export const profilesQuery = queryOptions({
  queryKey: ["profiles"],
  queryFn: async () => {
    const { data, error } = await api.from("profiles").select("*").order("full_name");
    if (error) throw error;
    return data;
  },
  staleTime: 30_000,
});

export const myAvailableStockQuery = queryOptions({
  queryKey: ["my-available-stock"],
  queryFn: async () => {
    const { data, error } = await api.rpc("my_available_stock");
    if (error) throw error;
    return (data ?? []) as any[];
  },
  gcTime: OFFLINE_GC,
});

/** Active chemists assigned to this Sales Officer (used by the order form, also offline). */
export const myChemistsQuery = (userId: string) =>
  queryOptions({
    queryKey: ["chemists", "mine", userId],
    queryFn: async () => {
      const { data, error } = await api
        .from("chemists")
        .select("*")
        .eq("assigned_so", userId)
        .eq("status", "active")
        .order("business_name");
      if (error) throw error;
      return data;
    },
    gcTime: OFFLINE_GC,
  });

/** Drop undefined/empty-string values so optional RPC args are simply omitted. */
export function clean<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== "") out[k] = v;
  return out as T;
}

/**
 * Generated RPC types mark every argument as a non-null string/number, but the
 * database functions accept SQL NULL for optional values. These helpers send NULL.
 */
export const opt = (v: string | null | undefined) => (v === undefined || v === null || v.trim() === "" ? null : v) as string;
export const optNum = (v: number | string | null | undefined) =>
  (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v)) as number;
