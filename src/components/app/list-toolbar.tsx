import { useState, type ReactNode } from "react";
import { Calendar, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addDays, todayBD } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Last `days` in Dhaka. Pass 0 to leave both dates blank (no date limit). */
export function useListRange(days = 90) {
  const today = todayBD();
  const start = days > 0 ? addDays(today, -days) : "";
  const end = days > 0 ? today : "";
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(end);
  function reset() {
    setFrom(start);
    setTo(end);
  }
  return { today, from, to, setFrom, setTo, reset };
}

/** Same search box the orders list uses: icon inside, fixed height. */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative shrink-0", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        className="h-9 w-44 pl-8"
      />
    </div>
  );
}

export function DateField({
  value,
  onChange,
  label,
  max,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  max?: string | undefined;
}) {
  return (
    <div className="relative shrink-0">
      <Calendar className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="date"
        value={value}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-9 w-40 pl-8"
      />
    </div>
  );
}

export function FilterClear({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" className="h-9 shrink-0 rounded-xl" onClick={onClick}>
      <RotateCcw /> Reset
    </Button>
  );
}

/**
 * Horizontal filter row used by list pages. Search and dates are shared.
 * Pass each page's own dropdowns as children.
 */
export function ListToolbar({
  query,
  onQuery,
  placeholder,
  from,
  to,
  onFrom,
  onTo,
  maxTo,
  children,
}: {
  query?: string;
  onQuery?: (value: string) => void;
  placeholder?: string;
  from?: string;
  to?: string;
  onFrom?: (value: string) => void;
  onTo?: (value: string) => void;
  maxTo?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
      {onQuery && <SearchField value={query ?? ""} onChange={onQuery} placeholder={placeholder ?? "Search…"} />}
      {onFrom && <DateField value={from ?? ""} onChange={onFrom} label="From date" />}
      {onTo && <DateField value={to ?? ""} onChange={onTo} label="To date" max={maxTo} />}
      {children}
    </div>
  );
}
