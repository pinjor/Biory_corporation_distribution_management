/// <reference types="vite-plugin-pwa/client" />
/**
 * The only place the offline service worker is registered.
 * Never in dev, inside an iframe, or on Lovable preview hosts; `?sw=off` removes it.
 */

const SW_PATH = "/sw.js";
const PROJECT_ID = "1a5a7adf-3a9e-4e46-a412-287063b7472e";
const LOVABLE_DOMAINS = [".lovable.app", ".gpt-eng.com", ".gptengineer.run"];

export function isPreviewHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  const first = h.split(".")[0] ?? "";
  if (LOVABLE_DOMAINS.some((d) => h.endsWith(d))) {
    if (/^(?:id-preview|preview)(?:-[a-z0-9]+)?--.+$/.test(first)) return true;
    if (first === `project--${PROJECT_ID}-dev`) return true;
  }
  if (h === "lovableproject.com" || h.endsWith(".lovableproject.com")) return true;
  if (h === "lovableproject-dev.com" || h.endsWith(".lovableproject-dev.com")) return true;
  if (h === "beta.lovable.dev" || h.endsWith(".beta.lovable.dev")) return true;
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
