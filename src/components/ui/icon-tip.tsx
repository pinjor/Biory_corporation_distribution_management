import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Hover label for an icon button. Renders inside the button and floats above it. */
export function IconTip({ label }: { label: string }) {
  const marker = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<{ x: number; y: number; below: boolean } | null>(null);

  useLayoutEffect(() => {
    const el = tip.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let shift = 0;
    if (rect.left < pad) shift = pad - rect.left;
    else if (rect.right > window.innerWidth - pad) shift = window.innerWidth - pad - rect.right;
    el.style.marginLeft = shift ? `${shift}px` : "";
  }, [box]);

  useEffect(() => {
    const host = marker.current?.parentElement;
    if (!host) return;
    const show = () => {
      const rect = host.getBoundingClientRect();
      const below = rect.top < 44;
      setBox({ x: rect.left + rect.width / 2, y: below ? rect.bottom : rect.top, below });
    };
    const hide = () => setBox(null);
    host.addEventListener("pointerenter", show);
    host.addEventListener("pointerleave", hide);
    host.addEventListener("focus", show);
    host.addEventListener("blur", hide);
    return () => {
      host.removeEventListener("pointerenter", show);
      host.removeEventListener("pointerleave", hide);
      host.removeEventListener("focus", show);
      host.removeEventListener("blur", hide);
    };
  }, []);

  return (
    <>
      <span ref={marker} className="sr-only" aria-hidden />
      {box && typeof document !== "undefined"
        ? createPortal(
            <span
              ref={tip}
              role="tooltip"
              className={`pointer-events-none fixed z-[80] max-w-56 -translate-x-1/2 rounded-md bg-primary px-2.5 py-1 text-center text-xs font-medium text-primary-foreground shadow-md ${box.below ? "translate-y-2" : "-translate-y-[calc(100%+8px)]"}`}
              style={{ left: box.x, top: box.y }}
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}
