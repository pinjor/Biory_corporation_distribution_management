import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";

export function PlaceCombo({
  label,
  value,
  options,
  placeholder,
  disabled,
  onChange,
  onCreate,
}: {
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  disabled?: boolean;
  onChange: (name: string) => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const openedAt = useRef(0);
  const [box, setBox] = useState<{ top: number; left: number; width: number; maxH: number } | null>(null);
  const typed = (editing ? q : value).trim();
  const needle = (editing ? q : "").trim().toLowerCase();
  const matches = options.filter((name) => !needle || name.toLowerCase().includes(needle));
  const exact = options.find((name) => name.toLowerCase() === typed.toLowerCase());
  const canAdd = typed.length > 0 && !exact && !disabled;

  const place = () => {
    const el = root.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setBox({
      top: rect.bottom + 6,
      left: Math.min(rect.left, window.innerWidth - rect.width - 8),
      width: rect.width,
      maxH: Math.max(140, Math.min(280, window.innerHeight - rect.bottom - 16)),
    });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const onPointer = (event: PointerEvent) => {
      if (performance.now() - openedAt.current < 250) return;
      const target = event.target as Node;
      if (root.current?.contains(target) || menu.current?.contains(target)) return;
      setOpen(false);
      setEditing(false);
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

  function choose(name: string) {
    onChange(name);
    setQ("");
    setEditing(false);
    setOpen(false);
  }

  async function add() {
    if (!canAdd || saving) return;
    setSaving(true);
    try {
      await onCreate(typed);
      setQ("");
      setEditing(false);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={root} className="relative w-full">
      <Input
        disabled={disabled}
        placeholder={placeholder}
        value={editing ? q : value}
        aria-label={label}
        role="combobox"
        aria-expanded={open}
        onChange={(e) => {
          setEditing(true);
          setQ(e.target.value);
          setOpen(true);
        }}
        onPointerDown={() => {
          if (disabled) return;
          openedAt.current = performance.now();
          setOpen(true);
        }}
        onFocus={(e) => {
          if (disabled) return;
          openedAt.current = performance.now();
          setEditing(true);
          setQ(value);
          setOpen(true);
          e.currentTarget.select();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setEditing(false);
            setQ("");
          }
          if (e.key === "Enter") {
            e.preventDefault();
            if (exact) choose(exact);
            else void add();
          }
        }}
        className="pr-9"
      />
      <ChevronDown className={`pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground ${open ? "rotate-180 text-primary" : ""}`} />
      {open && box && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menu}
              role="listbox"
              className="pointer-events-auto fixed z-[60] overflow-y-auto rounded-xl border border-border/80 bg-popover p-1.5 text-popover-foreground shadow-[0_18px_40px_-18px_color-mix(in_oklab,var(--primary)_45%,transparent),0_2px_8px_-2px_color-mix(in_oklab,var(--foreground)_12%,transparent)]"
              style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxH }}
            >
              {canAdd && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-primary hover:bg-primary-soft"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void add()}
                >
                  <Plus className="size-3.5" /> Add “{typed}”
                </button>
              )}
              {matches.length === 0 && !canAdd ? (
                <p className="px-2.5 py-2 text-sm text-muted-foreground">{disabled ? placeholder : "No matches. Type a name and press Enter to add it."}</p>
              ) : (
                matches.map((name) => (
                  <button
                    key={name}
                    type="button"
                    role="option"
                    aria-selected={name === value}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(name)}
                    className={`flex w-full cursor-pointer rounded-lg px-2.5 py-2 text-left text-sm ${name === value ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-primary-soft"}`}
                  >
                    {name}
                  </button>
                ))
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
