import { createFileRoute, redirect } from "@tanstack/react-router";
import { api } from "@/lib/api/client";
import { AppShell } from "@/components/app/app-shell";
import { canOpen, firstOpenPath } from "@/lib/access";
import type { AppRole, SessionInfo } from "@/lib/session";
import {
  clearOfflineCaches,
  isNetworkAuthError,
  readSessionCache,
  saveSessionCache,
} from "@/lib/offline/session-cache";
import { sessionShouldEnd } from "@/lib/auth/remember-me";

const GET_USER_TIMEOUT_MS = 8000;

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // "Remember me" was off and the browser has been closed since: end the session on this device.
    if (sessionShouldEnd()) {
      clearOfflineCaches();
      await api.auth.signOut({ scope: "local" }).catch(() => undefined);
      throw redirect({ to: "/auth", search: { redirect: location.href } as never });
    }

    const cached = readSessionCache();
    // No connection: open with the identity last seen on this device (server calls still need a valid sign-in).
    if (cached && typeof navigator !== "undefined" && navigator.onLine === false) {
      redirectIfBlocked(location.pathname, cached.roles, cached.menus);
      return { session: cached, offline: true };
    }

    let result: Awaited<ReturnType<typeof api.auth.getUser>> | null = null;
    let networkError = false;
    try {
      result = await Promise.race([
        api.auth.getUser(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Sign-in check timed out")), GET_USER_TIMEOUT_MS),
        ),
      ]);
      networkError = !result.data.user && isNetworkAuthError(result.error);
    } catch {
      networkError = true;
    }

    if (!result?.data.user) {
      if (networkError && cached) {
        redirectIfBlocked(location.pathname, cached.roles, cached.menus);
        return { session: cached, offline: true };
      }
      throw redirect({ to: "/auth", search: { redirect: location.href } as never });
    }

    const user = result.data.user;
    const [{ data: profile }, { data: roles, error: rolesError }] = await Promise.all([
      api.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      api.from("user_roles").select("role").eq("user_id", user.id),
    ]);
    if (rolesError && cached?.userId === user.id) {
      redirectIfBlocked(location.pathname, cached.roles, cached.menus);
      return { session: cached, offline: true };
    }

    const session: SessionInfo = {
      userId: user.id,
      email: user.email ?? "",
      profile: profile ?? null,
      roles: (roles ?? []).map((r) => r.role as AppRole),
    };
    const menuResult = await api.rpc("list_role_menus");
    if (!menuResult.error && Array.isArray(menuResult.data)) {
      const granted = menuResult.data as { role: AppRole; menu_key: string }[];
      session.menus = granted.filter((row) => session.roles.includes(row.role)).map((row) => row.menu_key);
    }
    saveSessionCache(session);
    redirectIfBlocked(location.pathname, session.roles, session.menus);
    return { session, offline: false };
  },
  component: AppShell,
});

function redirectIfBlocked(pathname: string, roles: AppRole[], menus?: string[]) {
  if (roles.length === 0 || canOpen(pathname, roles, menus)) return;
  const next = (firstOpenPath(roles, menus) ?? "/dashboard") as "/dashboard";
  if (next !== pathname) throw redirect({ to: next });
}
