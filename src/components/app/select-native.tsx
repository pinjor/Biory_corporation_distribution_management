import * as React from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Drop-in replacement for <select> that renders the app's own styled dropdown (the browser's
 * native option list can't be themed). Keeps the <select> API used across the app:
 * <option>/<optgroup> children and onChange(e) reading e.target.value.
 */
type Opt = { value: string; label: string; disabled: boolean };
type Group = { label: string | null; options: Opt[] };

// Radix Select reserves "" for "no value", so empty option values are mapped to a sentinel.
const EMPTY = "__empty__";
const toKey = (v: string) => (v === "" ? EMPTY : v);
const fromKey = (v: string) => (v === EMPTY ? "" : v);

function textOf(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node))
    return textOf(node.props.children);
  return "";
}

function collect(children: React.ReactNode, groups: Group[], current: Group) {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const props = child.props as {
      value?: string | number;
      children?: React.ReactNode;
      disabled?: boolean;
      label?: string;
    };
    if (child.type === React.Fragment) {
      collect(props.children, groups, current);
    } else if (child.type === "optgroup") {
      const g: Group = { label: props.label ?? null, options: [] };
      groups.push(g);
      collect(props.children, groups, g);
    } else if (child.type === "option") {
      const label = textOf(props.children).replace(/\s+/g, " ").trim();
      current.options.push({
        value: String(props.value ?? label),
        label,
        disabled: !!props.disabled,
      });
    }
  });
}

export interface NativeSelectProps {
  value?: string | number | null | undefined;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
  "aria-label"?: string;
}

export function NativeSelect({
  value,
  onChange,
  children,
  className,
  disabled,
  required,
  name,
  id,
  ...rest
}: NativeSelectProps) {
  const groups = React.useMemo(() => {
    const root: Group = { label: null, options: [] };
    const gs: Group[] = [root];
    collect(children, gs, root);
    return gs.filter((g) => g.options.length > 0);
  }, [children]);

  const all = groups.flatMap((g) => g.options);
  const current = value === null || value === undefined ? "" : String(value);
  const known = all.some((o) => o.value === current);
  const placeholder = all.find((o) => o.value === "")?.label ?? all[0]?.label ?? "Select…";

  return (
    <Select
      {...(known ? { value: toKey(current) } : { value: "" })}
      onValueChange={(v) => {
        const next = fromKey(v);
        onChange?.({
          target: { value: next },
          currentTarget: { value: next },
        } as React.ChangeEvent<HTMLSelectElement>);
      }}
      {...(disabled !== undefined && { disabled })}
      {...(required !== undefined && { required })}
      {...(name !== undefined && { name })}
    >
      <SelectTrigger id={id} aria-label={rest["aria-label"]} className={cn("min-w-0", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {groups.map((g, gi) => (
          <SelectGroup key={gi}>
            {g.label && <SelectLabel>{g.label}</SelectLabel>}
            {g.options.map((o) => (
              <SelectItem key={o.value} value={toKey(o.value)} disabled={o.disabled}>
                {o.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
