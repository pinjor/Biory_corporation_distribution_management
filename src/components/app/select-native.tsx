import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Opt = { value: string; label: string; disabled: boolean };

function optionText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(optionText).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return optionText(node.props.children);
  return "";
}

function readOptions(children: React.ReactNode): Opt[] {
  const opts: Opt[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement<{ value?: string | number; disabled?: boolean; children?: React.ReactNode }>(child)) return;
    if (child.type !== "option") return;
    const label = optionText(child.props.children).replace(/\s+/g, " ").trim();
    const value = child.props.value != null ? String(child.props.value) : label;
    opts.push({ value, label: label || value, disabled: !!child.props.disabled });
  });
  return opts;
}

/** Custom list so every dropdown uses the pine menu instead of the system blue highlight. */
export const NativeSelect = React.forwardRef<
  HTMLButtonElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { leading?: React.ReactNode }
>(({ className, children, value, defaultValue, onChange, disabled, id, leading, ...props }, ref) => {
    const options = React.useMemo(() => readOptions(children), [children]);
    const [inner, setInner] = React.useState(defaultValue != null ? String(defaultValue) : "");
    const current = value !== undefined ? String(value ?? "") : inner;
    const selected = options.find((o) => o.value === current) ?? options[0];
    const [open, setOpen] = React.useState(false);
    const [cursor, setCursor] = React.useState(0);
    const root = React.useRef<HTMLDivElement>(null);
    const button = React.useRef<HTMLButtonElement>(null);
    const menu = React.useRef<HTMLDivElement>(null);
    const [box, setBox] = React.useState<{ top: number; left: number; width: number; maxH: number; up: boolean } | null>(null);

    React.useEffect(() => {
      if (typeof ref === "function") ref(button.current);
      else if (ref) ref.current = button.current;
    }, [ref]);

    const place = React.useCallback(() => {
      const el = button.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom;
      const up = below < 220 && rect.top > below;
      const maxH = Math.max(140, Math.min(288, (up ? rect.top : below) - 16));
      setBox({
        top: up ? rect.top - 6 : rect.bottom + 6,
        left: Math.min(rect.left, window.innerWidth - Math.max(rect.width, 180) - 8),
        width: Math.max(rect.width, 180),
        maxH,
        up,
      });
    }, []);

    React.useEffect(() => {
      if (!open) return;
      place();
      const frame = requestAnimationFrame(() => {
        menu.current?.focus();
        menu.current?.querySelector<HTMLElement>("[aria-selected='true']")?.scrollIntoView({ block: "nearest" });
      });
      const onScroll = () => place();
      const onPointer = (event: PointerEvent) => {
        const target = event.target as Node;
        if (root.current?.contains(target) || menu.current?.contains(target)) return;
        setOpen(false);
      };
      const onKey = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          setOpen(false);
          button.current?.focus();
        }
      };
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", onScroll);
      document.addEventListener("pointerdown", onPointer);
      document.addEventListener("keydown", onKey);
      return () => {
        cancelAnimationFrame(frame);
        window.removeEventListener("scroll", onScroll, true);
        window.removeEventListener("resize", onScroll);
        document.removeEventListener("pointerdown", onPointer);
        document.removeEventListener("keydown", onKey);
      };
    }, [open, place]);

    function choose(next: string) {
      if (value === undefined) setInner(next);
      onChange?.({ target: { value: next }, currentTarget: { value: next } } as React.ChangeEvent<HTMLSelectElement>);
      setOpen(false);
      button.current?.focus();
    }

    function onButtonKey(event: React.KeyboardEvent) {
      if (disabled) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const index = Math.max(0, options.findIndex((o) => o.value === current));
        setCursor(index);
        setOpen(true);
      }
    }

    function onMenuKey(event: React.KeyboardEvent) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        let next = cursor;
        for (let i = 0; i < options.length; i++) {
          next = (next + step + options.length) % options.length;
          if (!options[next]?.disabled) break;
        }
        setCursor(next);
      } else if (event.key === "Enter") {
        event.preventDefault();
        const opt = options[cursor];
        if (opt && !opt.disabled) choose(opt.value);
      }
    }

    return (
      <div ref={root} className={cn("relative inline-flex h-9 w-full min-w-0", className)}>
        <button
          ref={button}
          type="button"
          id={id}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-required={props.required || undefined}
          aria-label={typeof props["aria-label"] === "string" ? props["aria-label"] : undefined}
          onClick={() => {
            if (disabled) return;
            setCursor(Math.max(0, options.findIndex((o) => o.value === current)));
            setOpen((v) => !v);
          }}
          onKeyDown={onButtonKey}
          className={cn(
            "flex h-full w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-lg border border-input bg-card py-1 pr-2.5 text-left text-sm font-medium shadow-xs transition-[border-color,box-shadow] hover:border-primary/40 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50 data-[open=true]:border-primary data-[open=true]:ring-[3px] data-[open=true]:ring-ring/20",
            leading ? "pl-9" : "pl-3",
          )}
          data-open={open}
        >
          {leading ? <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground [&_svg]:size-4">{leading}</span> : null}
          <span className="truncate">{selected?.label ?? "Choose"}</span>
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180 text-primary")} />
        </button>
        {open && box && typeof document !== "undefined"
          ? createPortal(
              <div
                ref={menu}
                role="listbox"
                tabIndex={-1}
                onKeyDown={onMenuKey}
                className={cn(
                  "pointer-events-auto fixed z-[60] overflow-y-auto rounded-xl border border-border/80 bg-popover p-1.5 text-popover-foreground shadow-[0_18px_40px_-18px_color-mix(in_oklab,var(--primary)_45%,transparent),0_2px_8px_-2px_color-mix(in_oklab,var(--foreground)_12%,transparent)] outline-none",
                  box.up ? "-translate-y-full" : "",
                )}
                style={{ top: box.top, left: box.left, minWidth: box.width, maxHeight: box.maxH }}
              >
                {options.map((opt, i) => {
                  const on = opt.value === current;
                  return (
                    <button
                      key={`${opt.value}-${i}`}
                      type="button"
                      role="option"
                      aria-selected={on}
                      disabled={opt.disabled}
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => choose(opt.value)}
                      className={cn(
                        "flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                        on
                          ? "bg-primary font-semibold text-primary-foreground"
                          : i === cursor
                            ? "bg-primary-soft text-foreground"
                            : "text-foreground hover:bg-primary-soft",
                        opt.disabled && "pointer-events-none opacity-40",
                      )}
                    >
                      <span className="truncate">{opt.label}</span>
                      {on ? <Check className="size-3.5 shrink-0" /> : null}
                    </button>
                  );
                })}
              </div>,
              document.body,
            )
          : null}
      </div>
    );
  },
);
NativeSelect.displayName = "NativeSelect";
