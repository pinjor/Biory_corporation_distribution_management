import * as React from "react";
import { cn } from "@/lib/utils";

/** Lightweight native select styled like shadcn Input — fast on low-end phones. */
export const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "select-chevron flex h-9 w-full min-w-0 cursor-pointer appearance-none truncate rounded-lg border border-input bg-card py-1 pl-3 pr-9 text-sm font-medium shadow-xs transition-[border-color,box-shadow] hover:border-primary/40 focus-visible:outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
NativeSelect.displayName = "NativeSelect";
