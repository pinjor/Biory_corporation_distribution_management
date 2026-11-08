import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type SearchProduct = { id: string; name: string; code: string };

/** Searchable product dropdown. The menu is portaled so card overflow does not clip it. */
export function ProductSearch({
  products,
  value,
  onChange,
  placeholder = "Search product…",
  disabled,
  className,
  display = "both",
  "aria-label": ariaLabel = "Search product",
}: {
  products: SearchProduct[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Closed field shows the code, the name, or both. Search always matches either. */
  display?: "both" | "code" | "name";
  "aria-label"?: string;
}) {
  const selected = products.find((p) => p.id === value);
  const closed = selected
    ? display === "code"
      ? selected.code
      : display === "name"
        ? selected.name
        : `${selected.code} · ${selected.name}`
    : "";
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const ignore = useRef(0);
  const [box, setBox] = useState<{ top: number; left: number; width: number; maxH: number } | null>(null);
  const matches = products
    .filter((p) => !q || `${p.name} ${p.code}`.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 40);

  const place = () => {
    const el = root.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setBox({
      top: rect.bottom + 6,
      left: rect.left,
      width: Math.max(rect.width, 280),
      maxH: Math.max(140, Math.min(280, window.innerHeight - rect.bottom - 16)),
    });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const onPointer = (event: PointerEvent) => {
      if (Date.now() < ignore.current) return;
      const target = event.target as Node;
      if (root.current?.contains(target) || menu.current?.contains(target)) return;
      setOpen(false);
      setQ("");
    };
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const pick = (id: string) => {
    onChange(id);
    setQ("");
    setOpen(false);
  };

  return (
    <div ref={root} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        disabled={disabled}
        placeholder={placeholder}
        value={open ? q : closed}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          ignore.current = Date.now() + 250;
          setQ("");
          setOpen(true);
        }}
        onPointerDown={() => {
          ignore.current = Date.now() + 250;
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setQ("");
          }
          if (e.key === "Enter" && open && matches[0]) {
            e.preventDefault();
            pick(matches[0].id);
          }
        }}
        className={cn("h-9 pl-9", className)}
        role="combobox"
        aria-expanded={open}
        aria-label={ariaLabel}
        autoComplete="off"
      />
      {open && box && createPortal(
        <div
          ref={menu}
          role="listbox"
          className="pointer-events-auto fixed z-[60] overflow-y-auto rounded-xl border bg-popover p-1.5 shadow-lg"
          style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxH }}
        >
          {matches.length === 0 ? (
            <p className="px-2.5 py-2 text-sm text-muted-foreground">No products match.</p>
          ) : matches.map((p) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={p.id === value}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-primary-soft",
                p.id === value && "bg-primary-soft",
              )}
              onClick={() => pick(p.id)}
            >
              <span className="truncate font-medium">{p.name}</span>
              <span className="num shrink-0 text-xs text-muted-foreground">{p.code}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

export function Labeled({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5 text-sm", className)}>
      <span className="font-medium text-foreground">{label}</span>
      {children}
    </div>
  );
}
