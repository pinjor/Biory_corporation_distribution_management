import { useId } from "react";
import { cn } from "@/lib/utils";

/** Pine-and-saffron lockup for the home and sign-in headers. */
export function BrandMark({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const pine = `biory-pine-${uid}`;
  const gold = `biory-gold-${uid}`;
  const sheen = `biory-sheen-${uid}`;

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 48 48" className="size-10 shrink-0" aria-hidden>
        <defs>
          <linearGradient id={pine} x1="4" y1="2" x2="44" y2="46" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#46c484" />
            <stop offset="0.42" stopColor="#1c7a52" />
            <stop offset="1" stopColor="#0b2e24" />
          </linearGradient>
          <linearGradient id={gold} x1="22" y1="3" x2="42" y2="24" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff6d2" />
            <stop offset="0.4" stopColor="#f3c453" />
            <stop offset="1" stopColor="#b8861d" />
          </linearGradient>
          <radialGradient id={sheen} cx="28%" cy="18%" r="75%">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.38" />
            <stop offset="0.55" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="48" height="48" rx="15" fill={`url(#${pine})`} />
        <rect width="48" height="48" rx="15" fill={`url(#${sheen})`} />
        <rect
          x="1.15"
          y="1.15"
          width="45.7"
          height="45.7"
          rx="14"
          fill="none"
          stroke={`url(#${gold})`}
          strokeWidth="1.4"
        />
        <path
          fill="#fff"
          fillRule="evenodd"
          d="M15.2 12.2h4.2c5.9 0 9.5 2.6 9.5 6.9 0 2.8-1.6 5-4.2 5.9 3.3 1 5.4 3.4 5.4 6.7 0 4.7-3.9 7.7-10.2 7.7h-4.7V12.2zm4.6 5.1v4.8h.2c2.4 0 3.8-1 3.8-2.4s-1.4-2.4-3.8-2.4h-.2zm0 8.8V34h.8c2.9 0 4.6-1.3 4.6-3.5s-1.7-3.4-4.6-3.4h-.8z"
        />
        <path
          fill={`url(#${gold})`}
          d="M31.2 7.2c5.6 1.2 9.2 6.4 8 12.2-5.2-1.6-9.2-6.4-8-12.2z"
        />
        <path
          d="M34.6 10.2c1.5 2.2 2.2 4.4 2.1 6.4"
          fill="none"
          stroke="#fff8e4"
          strokeWidth="0.7"
          strokeLinecap="round"
          opacity="0.8"
        />
      </svg>
      <span className="flex flex-col justify-center leading-none">
        <span className="font-display text-[15px] font-semibold tracking-[0.2em] text-[#12352c]">BIORY</span>
        <span className="mt-[5px] h-px w-full bg-gradient-to-r from-[#e0b03a] via-[#e0b03a] to-transparent" />
        <span className="mt-[5px] font-display text-[8px] font-medium tracking-[0.32em] text-[#a87412]">
          CORPORATION
        </span>
      </span>
    </span>
  );
}
