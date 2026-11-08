import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-card shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        highlight:
          "bg-highlight text-highlight-foreground font-semibold shadow-sm hover:bg-highlight/90",
        success: "bg-success text-success-foreground shadow-sm hover:bg-success/90",
        tile: "h-auto flex-col items-start justify-between gap-3 whitespace-normal rounded-xl border bg-card p-4 text-left text-foreground shadow-sm hover:border-primary/40 hover:bg-primary-soft [&_svg]:size-5",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

let iconTip: HTMLDivElement | null = null;
let iconTipScrollBound = false;

function placeIconTip(text: string, anchor: HTMLElement) {
  if (typeof document === "undefined") return;
  if (!iconTip || !iconTip.isConnected) {
    iconTip = document.createElement("div");
    iconTip.setAttribute("role", "tooltip");
    iconTip.className =
      "pointer-events-none fixed z-[80] whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md";
    document.body.appendChild(iconTip);
  }
  if (!iconTipScrollBound) {
    iconTipScrollBound = true;
    window.addEventListener("scroll", hideIconTip, true);
    window.addEventListener("resize", hideIconTip);
  }
  const rect = anchor.getBoundingClientRect();
  const below = rect.top < 40;
  iconTip.textContent = text;
  iconTip.style.left = `${rect.left + rect.width / 2}px`;
  iconTip.style.top = below ? `${rect.bottom + 6}px` : `${rect.top - 6}px`;
  iconTip.style.transform = below ? "translate(-50%, 0)" : "translate(-50%, -100%)";
  iconTip.hidden = false;
}

function hideIconTip() {
  if (iconTip) iconTip.hidden = true;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, title, onPointerEnter, onPointerLeave, onFocus, onBlur, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const ariaLabel = props["aria-label"];
    const tip =
      size === "icon"
        ? (typeof title === "string" && title) || (typeof ariaLabel === "string" ? ariaLabel : "")
        : "";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
        title={tip ? undefined : title}
        onPointerEnter={(event: React.PointerEvent<HTMLButtonElement>) => {
          onPointerEnter?.(event);
          if (tip) placeIconTip(tip, event.currentTarget);
        }}
        onPointerLeave={(event: React.PointerEvent<HTMLButtonElement>) => {
          onPointerLeave?.(event);
          if (tip) hideIconTip();
        }}
        onFocus={(event: React.FocusEvent<HTMLButtonElement>) => {
          onFocus?.(event);
          if (tip) placeIconTip(tip, event.currentTarget);
        }}
        onBlur={(event: React.FocusEvent<HTMLButtonElement>) => {
          onBlur?.(event);
          if (tip) hideIconTip();
        }}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
