import type { SessionInfo } from "@/lib/session";

/**
 * Last known signed-in identity (profile + roles), so the app can open while offline.
 * This only unlocks the screens on this device — every server call still needs a
 * valid sign-in, so nothing can be read or changed without one.
 */
const KEY = "pf-session-cache";
export const queryCacheKey = (userId: string) => `pf-cache:${userId}`;

export function saveSessionCache(s: SessionInfo) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, savedAt: Date.now() }));
  } catch {
    /* storage full or blocked */
  }
}

export function readSessionCache(): SessionInfo | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SessionInfo;
    return s && typeof s.userId === "string" && Array.isArray(s.roles) ? s : null;
  } catch {
    return null;
  }
}

/** Forget cached identity and cached lists. Queued orders are kept so they can sync on next sign-in. */
export function clearOfflineCaches() {
  try {
    const s = readSessionCache();
    if (s) localStorage.removeItem(queryCacheKey(s.userId));
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function isNetworkAuthError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { name?: string; status?: number; message?: string };
  if (err.name === "AuthRetryableFetchError") return true;
  if (err.status === 0) return true;
  return /failed to fetch|network|load failed|timed out/i.test(err.message ?? "");
}
