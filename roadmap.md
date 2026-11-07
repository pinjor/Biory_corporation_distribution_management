# Roadmap — PharmaField (field sales, inventory, delivery & collection)

## Phase 1 (this build)
- [x] Cloud backend: roles, settings, products, batches, locations, stock ledger, requisitions, chemists, doctors, orders, deliveries, collections, wallet ledger, deposits, visits, audit, notifications
- [x] Sign-in (email and password) + role-gated app shell
- [x] Dashboard (admin KPIs + SO home)
- [x] Products & pricing policy settings
- [x] Central/SO inventory, stock receipt, CSV bulk opening stock, adjustments, ledger
- [x] Requisitions (submit → approve/partial → issue FEFO → receive)
- [x] Chemists & doctors with duplicate detection
- [x] Orders with live pricing, discount limits & approval
- [x] Full/partial delivery + printable challan
- [x] Full/partial collection, SO wallet, deposits with proof upload, finance approval, receipt
- [x] Doctor visits with promo stock issue
- [x] Reports with CSV export, users & roles, audit log, notifications

## Phase 2
- [x] Expenses: staff submit with receipts → Finance approve/reject (+ submitter can cancel while pending)
- [x] Offline orders: queue on device when disconnected, auto-sync on reconnect, cached chemists/products/stock, offline-tolerant sign-in gate
- [x] Installable app shell that opens offline (published app only)

## Later
- PDF exports (server-generated), SMS/push adapters
- Barcode/DataMatrix scanning, recall workflow, GPS rules
