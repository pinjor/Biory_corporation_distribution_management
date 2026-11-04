import { supabase } from "@/integrations/supabase/client";

/**
 * Shared demo accounts. Migration 0006_two_demo_accounts auto-confirms these emails and assigns
 * their roles. Hide the demo buttons with VITE_DEMO_LOGIN=false.
 */
export type DemoKind = "super_admin" | "sales_officer";

export const DEMO_ACCOUNTS: Record<
  DemoKind,
  { email: string; password: string; name: string; role: string }
> = {
  super_admin: {
    email: "demo@biory.app",
    password: "BioryDemo@2026",
    name: "Demo Super Admin",
    role: "Super Admin",
  },
  sales_officer: {
    email: "so.demo@biory.app",
    password: "BiorySO@2026",
    name: "Demo Sales Officer",
    role: "Sales Officer",
  },
};

export const demoLoginEnabled = import.meta.env["VITE_DEMO_LOGIN"] !== "false";

export function isDemoEmail(email: string | null | undefined) {
  const e = (email ?? "").trim().toLowerCase();
  return Object.values(DEMO_ACCOUNTS).some((a) => a.email === e);
}

function isInvalidCredentials(err: { code?: string | undefined; message: string }) {
  return err.code === "invalid_credentials" || /invalid login credentials/i.test(err.message);
}

/** Signs in as a demo user, creating the account on first use. */
export async function signInAsDemo(kind: DemoKind) {
  const { email, password, name } = DEMO_ACCOUNTS[kind];
  const first = await supabase.auth.signInWithPassword({ email, password });
  if (!first.error) return;
  if (!isInvalidCredentials(first.error)) throw first.error;

  const { error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } },
  });
  if (signUpError && !/already registered/i.test(signUpError.message)) throw signUpError;

  const second = await supabase.auth.signInWithPassword({ email, password });
  if (second.error) {
    if (
      second.error.code === "email_not_confirmed" ||
      /not confirmed/i.test(second.error.message)
    ) {
      throw new Error(
        "The demo accounts aren't set up on this backend yet (database migration 0006_two_demo_accounts is pending).",
      );
    }
    throw second.error;
  }
}
