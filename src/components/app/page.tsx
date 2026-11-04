import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatBDT, formatInt } from "@/lib/format";
import { Badge, type BadgeProps } from "@/components/ui/badge";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {eyebrow}
          </div>
        )}
        <h1 className="text-2xl font-semibold text-foreground sm:text-[28px]">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </div>
  );
}

export function Section({
  title,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("surface-card overflow-hidden", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5 border-b px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {actions && (
            <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 max-sm:w-full max-sm:[&>div]:w-full max-sm:[&>div]:flex-wrap max-sm:[&_input]:w-full max-sm:[&_input]:basis-full max-sm:[&_select]:w-auto max-sm:[&_select]:flex-1">
              {actions}
            </div>
          )}
        </header>
      )}
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "success" | "warning" | "destructive" | "info";
  icon?: ReactNode;
}) {
  const toneCls = {
    default: "text-primary bg-primary-soft",
    success: "text-success bg-success-soft",
    warning: "text-warning-foreground bg-warning-soft",
    destructive: "text-destructive bg-destructive-soft",
    info: "text-info bg-info-soft",
  }[tone];
  return (
    <div className="surface-card flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {icon && (
          <span className={cn("grid size-7 place-items-center rounded-lg [&_svg]:size-4", toneCls)}>
            {icon}
          </span>
        )}
      </div>
      <div className="num text-2xl font-semibold text-foreground">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function Money({ value, className }: { value: unknown; className?: string }) {
  return <span className={cn("num whitespace-nowrap", className)}>{formatBDT(value)}</span>;
}

export function Qty({ value, className }: { value: unknown; className?: string }) {
  return <span className={cn("num", className)}>{formatInt(value)}</span>;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string | undefined;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
      <div className="text-sm font-semibold text-foreground">{title}</div>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

const STATUS_VARIANTS: Record<string, BadgeProps["variant"]> = {
  DRAFT: "muted",
  SUBMITTED: "info",
  UNDER_REVIEW: "info",
  APPROVED: "success",
  PARTIALLY_APPROVED: "warning",
  ISSUED: "info",
  RECEIVED: "success",
  REJECTED: "destructive",
  CANCELLED: "muted",
  PENDING_APPROVAL: "warning",
  CONFIRMED: "info",
  CLOSED: "success",
  NOT_DELIVERED: "muted",
  PARTIALLY_DELIVERED: "warning",
  DELIVERED: "success",
  UNPAID: "destructive",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  VALID: "success",
  REVERSED: "muted",
  FULL: "success",
  PARTIAL: "warning",
  active: "success",
  inactive: "muted",
  EXPIRED: "destructive",
  NEAR_EXPIRY: "warning",
  OK: "success",
};

export function StatusBadge({
  status,
  label,
}: {
  status: string | null | undefined;
  label?: string | undefined;
}) {
  if (!status) return null;
  const text = label ?? status.replace(/_/g, " ").toLowerCase();
  return <Badge variant={STATUS_VARIANTS[status] ?? "outline"}>{text}</Badge>;
}

export function ExpiryBadge({
  days,
  nearDays,
}: {
  days: number | null | undefined;
  nearDays: number;
}) {
  if (days === null || days === undefined) return null;
  if (days <= 0) return <StatusBadge status="EXPIRED" label="expired" />;
  if (days <= nearDays) return <StatusBadge status="NEAR_EXPIRY" label={`${days}d left`} />;
  return <span className="num text-xs text-muted-foreground">{days}d</span>;
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function KeyValue({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="flex flex-col">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
          <dd className="font-medium text-foreground">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PageLoader() {
  return (
    <div className="grid min-h-[40vh] place-items-center">
      <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
