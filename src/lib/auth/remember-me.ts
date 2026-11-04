/**
 * "Remember me" for password sign-in.
 *
 * Supabase keeps its session in localStorage, which survives browser restarts. When the user opts out,
 * we drop a browser-session cookie (no expiry, shared by all tabs, gone when the browser closes);
 * a later visit without that cookie signs the user out locally.
 */
const PREF_KEY = "biory.auth.remember";
const EMAIL_KEY = "biory.auth.remembered-email";
const ALIVE_COOKIE = "biory_session_alive";

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function getRememberPreference(): boolean {
  return safe(() => localStorage.getItem(PREF_KEY) !== "0", true);
}

export function getRememberedEmail(): string {
  return safe(() => localStorage.getItem(EMAIL_KEY) ?? "", "");
}

/** Call right before signing in. */
export function setRememberPreference(remember: boolean, email?: string) {
  safe(() => {
    localStorage.setItem(PREF_KEY, remember ? "1" : "0");
    if (remember && email) localStorage.setItem(EMAIL_KEY, email);
    if (!remember) localStorage.removeItem(EMAIL_KEY);
    document.cookie = `${ALIVE_COOKIE}=1; path=/; SameSite=Lax`;
  }, undefined);
}

/** True when the user chose not to be remembered and the browser has been closed since. */
export function sessionShouldEnd(): boolean {
  return safe(
    () =>
      localStorage.getItem(PREF_KEY) === "0" &&
      !document.cookie.split("; ").some((c) => c.startsWith(`${ALIVE_COOKIE}=`)),
    false,
  );
}
