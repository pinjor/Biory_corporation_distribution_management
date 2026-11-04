import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

async function unwrap<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

export const settingsQuery = queryOptions({
  queryKey: ["settings"],
  queryFn: () => unwrap(supabase.from("app_settings").select("*").eq("id", 1).single()),
  staleTime: 60_000,
});

export const productsQuery = queryOptions({
  queryKey: ["products"],
  queryFn: () => unwrap(supabase.from("products").select("*").order("name")),
  staleTime: 30_000,
});

export const territoriesQuery = queryOptions({
  queryKey: ["territories"],
  queryFn: () => unwrap(supabase.from("territories").select("*").order("name")),
  staleTime: 60_000,
});

export const locationsQuery = queryOptions({
  queryKey: ["locations"],
  queryFn: () => unwrap(supabase.from("locations").select("*").order("kind").order("name")),
  staleTime: 30_000,
});

/** All Sales Officers (profiles holding the sales_officer role). Visible to admins. */
export const salesOfficersQuery = queryOptions({
  queryKey: ["sales-officers"],
  queryFn: async () => {
    const roles = await unwrap(supabase.from("user_roles").select("user_id").eq("role", "sales_officer"));
    const ids = roles.map((r) => r.user_id);
    if (ids.length === 0) return [];
    return unwrap(supabase.from("profiles").select("*").in("id", ids).order("full_name"));
  },
  staleTime: 30_000,
});

export const profilesQuery = queryOptions({
  queryKey: ["profiles"],
  queryFn: () => unwrap(supabase.from("profiles").select("*").order("full_name")),
  staleTime: 30_000,
});

export const myAvailableStockQuery = queryOptions({
  queryKey: ["my-available-stock"],
  queryFn: () => unwrap(supabase.rpc("my_available_stock")),
});

export { unwrap };
