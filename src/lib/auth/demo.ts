import { supabase } from "@/integrations/supabase/client";

/**
 * Shared demo account. Migration 0003_demo_account auto-confirms this email and grants it every role,
 * so signing in with it shows the whole application. Hide the button with VITE_DEMO_LOGIN=false.
 */
export const DEMO_EMAIL = "demo@biory.app";
export const DEMO_PASSWORD = "BioryDemo@2026";

export const demoLoginEnabled = import.meta.env["VITE_DEMO_LOGIN"] !== "false";

export function isDemoEmail(email: string | null | undefined) {
  return (email ?? "").trim().toLowerCase() === DEMO_EMAIL;
}

/** Signs in as the demo user, creating the account on first use. */
export async function signInAsDemo() {
  const first = await supabase.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  if (!first.error) return;
  if (
    first.error.code !== "invalid_credentials" &&
    !/invalid login credentials/i.test(first.error.message)
  ) {
    throw first.error;
  }

  const { error: signUpError } = await supabase.auth.signUp({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    options: { data: { full_name: "Demo User" } },
  });
  if (signUpError && !/already registered/i.test(signUpError.message)) throw signUpError;

  const second = await supabase.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  if (second.error) {
    if (
      second.error.code === "email_not_confirmed" ||
      /not confirmed/i.test(second.error.message)
    ) {
      throw new Error(
        "The demo account isn't set up on this backend yet (database migration 0003_demo_account is pending).",
      );
    }
    throw second.error;
  }
}
