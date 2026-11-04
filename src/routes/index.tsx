import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Boxes, HandCoins, PackageCheck, Stethoscope, Truck, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import heroImg from "@/assets/field-hero.jpg";
import logo from "@/assets/biory-logo.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BIORY Corporation — Pharma field sales, stock & collections" },
      {
        name: "description",
        content:
          "One platform for central warehouse, SO inventory, chemist orders, partial deliveries, collections, SO wallets and doctor visits.",
      },
      { property: "og:title", content: "BIORY Corporation — Pharma field sales, stock & collections" },
      {
        property: "og:description",
        content: "Batch-and-expiry stock ledger, FEFO issue, partial delivery, partial payment and approved SO deposits.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const chain = [
  { icon: Warehouse, label: "Central warehouse", text: "Batch & expiry stock, FEFO" },
  { icon: Boxes, label: "SO inventory", text: "Requisition → issue → receive" },
  { icon: PackageCheck, label: "Chemist order", text: "Live stock, MRP & TRP" },
  { icon: Truck, label: "Delivery", text: "Full or partial challan" },
  { icon: HandCoins, label: "Collection", text: "Wallet → deposit → receipt" },
  { icon: Stethoscope, label: "Doctor visit", text: "Samples & gifts from SO stock" },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-hero text-sidebar-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <span className="inline-flex rounded-lg bg-card px-3 py-1.5 shadow-card">
            <img src={logo.url} alt="BIORY Corporation" className="h-11 w-auto" />
          </span>
          <Button asChild variant="highlight" size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-8 md:grid-cols-[1.1fr_0.9fr] md:pb-24">
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-sidebar-primary">
              Field sales · Inventory · Collections
            </p>
            <h1 className="text-4xl font-semibold leading-[1.05] text-sidebar-accent-foreground sm:text-5xl lg:text-6xl">
              Every strip, every taka, accounted for.
            </h1>
            <p className="mt-5 max-w-xl text-base text-sidebar-foreground/85">
              From the central warehouse to the chemist counter: stock moves on an append-only ledger, orders deliver in
              parts, payments arrive in parts, and every SO deposit is approved with a receipt.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild variant="highlight" size="lg">
                <Link to="/auth">
                  Open the workspace <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
          <div className="relative">
            <img
              src={heroImg}
              alt="Sales officer with a phone beside medicine stock at a pharmacy counter"
              className="aspect-square w-full rounded-3xl object-cover shadow-lift"
              width={1280}
              height={1280}
            />
            <div className="surface-card absolute -bottom-6 left-4 right-4 p-4 text-card-foreground sm:left-8 sm:right-auto sm:w-72">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">ORD-2026-000182 · MA Pharmacy</div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Delivered</span>
                <span className="num text-sm font-semibold">৳8,500.00</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Collected</span>
                <span className="num text-sm font-semibold text-success">৳6,500.00</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between border-t pt-1">
                <span className="text-sm font-medium">Due</span>
                <span className="num text-base font-semibold text-destructive">৳2,000.00</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="text-2xl font-semibold">One chain, no gaps</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Orders describe intent, deliveries establish fulfilment, collections settle receivables — and stock and money are
          governed by immutable ledgers.
        </p>
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {chain.map((c, i) => (
            <li key={c.label} className="surface-card flex items-start gap-4 p-5">
              <span className="num text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              <c.icon className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <div className="font-semibold">{c.label}</div>
                <div className="text-sm text-muted-foreground">{c.text}</div>
              </div>
            </li>
          ))}
        </ol>
      </main>
      <footer className="border-t py-8 text-center text-xs text-muted-foreground">BIORY Corporation · Asia/Dhaka</footer>
    </div>
  );
}
