/// <reference types="vite-plugin-pwa/client" />
/**
 * The only place the offline service worker is registered.
 * Never in dev or inside an iframe; `?sw=off` removes it.
 */

const SW_PATH = "/sw.js";

export function isPreviewHost(_hostname: string): boolean {
  return false;
}

function inIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

async function unregisterAppWorkers() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    regs
      .filter((r) => [r.active, r.waiting, r.installing].some((w) => w && new URL(w.scriptURL).pathname === SW_PATH))
      .map((r) => r.unregister()),
  );
}

export async function registerAppServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const refused =
    !import.meta.env.PROD ||
    inIframe() ||
    isPreviewHost(window.location.hostname) ||
    new URLSearchParams(window.location.search).get("sw") === "off";
  if (refused) {
    await unregisterAppWorkers().catch(() => {});
    return;
  }
  const { registerSW } = await import("virtual:pwa-register");
  registerSW({ immediate: true });
}

/** Store copies of the main field pages so they open offline even if not visited yet. */
export async function warmOfflinePages(paths: string[]) {
  if (typeof caches === "undefined" || !navigator.serviceWorker?.controller || !navigator.onLine) return;
  try {
    const cache = await caches.open("pf-pages");
    await Promise.all(
      paths.map(async (p) => {
        const res = await fetch(p, { credentials: "same-origin", headers: { accept: "text/html" } });
        if (res.ok && (res.headers.get("content-type") ?? "").includes("text/html")) await cache.put(p, res);
      }),
    );
  } catch {
    /* best effort */
  }
}
