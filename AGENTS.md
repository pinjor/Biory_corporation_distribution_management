<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Every stock or money change goes through a SECURITY DEFINER Postgres function (supabase.rpc) that re-checks role, recalculates prices and locks rows; the browser only reads via RLS. Why: business rules can't be bypassed from a client, and multi-row changes stay atomic.
- Stock lives in the append-only `stock_movements` ledger; `stock_balances` is maintained only by its trigger. Wallet money lives in the append-only `wallet_ledger`. Why: auditability — corrections are new reversal/adjustment rows, never edits.
- Batch allocation is FEFO via `_allocate_fefo`; the movement trigger blocks expired batches for issue, transfer, delivery and promotion. Why: pharma expiry control in one place.
- Order lines snapshot MRP, trade discount, base TRP and net unit price at booking. Why: price changes must not rewrite history.
- Mutating RPCs for orders, deliveries, collections, deposits and visits take a client-generated idempotency key. Why: retries on poor mobile networks must not duplicate.
- `src/lib/pricing.ts` mirrors the server pricing only for live previews; keep it in sync with `create_order` and its tests. Why: the preview should match what the server stores.
- New users get no role until a Super Admin assigns one (the very first signup becomes Super Admin). Why: least privilege for a company-internal tool.
- Signed-in pages live under `src/routes/_authenticated/` (client-only gate that loads profile + roles into route context; read with `useSession()`).
- Offline orders: SO orders made without a connection go to a per-user localStorage outbox (`src/lib/offline/outbox.ts`) keyed by their idempotency key and are synced by `OfflineProvider` (app shell) on reconnect/focus/interval; only definitive server rejections park an order as failed. Why: retries must never duplicate, and bad connections must never lose an order.
- Offline reads: whitelisted queries (`OFFLINE_QUERY_ROOTS`) persist to localStorage per user, and the `_authenticated` gate falls back to the cached profile + roles only on network failure. Why: the order form must open in the field; the server still enforces every rule.
- The app-shell service worker comes from vite-plugin-pwa (generateSW, output in dist/client) and is registered only by `src/lib/pwa.ts`, never in dev, iframes or Lovable preview hosts. Why: a cached shell in previews causes stale builds.
- Receipt/proof files live in private buckets under `<uid>/...`; submit RPCs reject paths outside the caller's folder. Why: staff can't attach or read other people's files.

