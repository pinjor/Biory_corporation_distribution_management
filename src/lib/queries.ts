import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const settingsQuery = queryOptions({
  queryKey: ["settings"],
  queryFn: async () => {
    const { data, error } = await supabase.from("app_settings").select("*").eq("id", 1).single();
    if (error) throw error;
    return data;
  },
  staleTime: 60_000,
});

export const productsQuery = queryOptions({
  queryKey: ["products"],
  queryFn: async () => {
    const { data, error } = await supabase.from("products").select("*").order("name");
    if (error) throw error;
    return data;
  },
  staleTime: 30_000,
});

export const territoriesQuery = queryOptions({
  queryKey: ["territories"],
  queryFn: async () => {
    const { data, error } = await supabase.from("territories").select("*").order("name");
    if (error) throw error;
    return data;
  },
  staleTime: 60_000,
});

export const locationsQuery = queryOptions({
  queryKey: ["locations"],
  queryFn: async () => {
    const { data, error } = await supabase.from("locations").select("*").order("kind").order("name");
    if (error) throw error;
    return data;
  },
  staleTime: 30_000,
});

/** All Sales Officers (profiles holding the sales_officer role). */
export const salesOfficersQuery = queryOptions({
  queryKey: ["sales-officers"],
  queryFn: async () => {
    const { data: roles, error } = await supabase.from("user_roles").select("user_id").eq("role", "sales_officer");
    if (error) throw error;
    const ids = roles.map((r) => r.user_id);
    if (ids.length === 0) return [];
    const { data, error: e2 } = await supabase.from("profiles").select("*").in("id", ids).order("full_name");
    if (e2) throw e2;
    return data;
  },
  staleTime: 30_000,
});

export const profilesQuery = queryOptions({
  queryKey: ["profiles"],
  queryFn: async () => {
    const { data, error } = await supabase.from("profiles").select("*").order("full_name");
    if (error) throw error;
    return data;
  },
  staleTime: 30_000,
});

export const myAvailableStockQuery = queryOptions({
  queryKey: ["my-available-stock"],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("my_available_stock");
    if (error) throw error;
    return data;
  },
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
