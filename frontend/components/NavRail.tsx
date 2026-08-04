"use client";

/**
 * NavRail — the 56px workspace switcher. Five spaces, one job each:
 * Command (see), Simulate (try), Optimize (decide), Agents (delegate),
 * Reports (take away). Active page: brand-red left border + filled icon.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAtlas } from "@/lib/atlas-context";

const BRAND_RED = "#E8112D";

const ITEMS: { href: string; icon: string; label: string }[] = [
  { href: "/", icon: "⬢", label: "Command" },
  { href: "/simulate", icon: "◈", label: "Simulate" },
  { href: "/optimize", icon: "◉", label: "Optimize" },
  { href: "/agents", icon: "⬡", label: "Agents" },
  { href: "/reports", icon: "▦", label: "Reports" },
];

export default function NavRail() {
  const pathname = usePathname();
  const { setTourOpen } = useAtlas();

  return (
    <nav
      className="fixed left-0 top-0 bottom-0 z-40 w-14 flex flex-col items-center
                 bg-black/80 backdrop-blur-xl border-r border-white/10"
      aria-label="Workspace"
    >
      {/* Spacer under the fixed header */}
      <div className="h-14 flex-none" />

      <div className="flex-1 flex flex-col items-center gap-1 pt-2 w-full">
        {ITEMS.map(({ href, icon, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className="group relative w-full h-12 flex items-center justify-center"
            >
              {/* Active: brand-red left border */}
              <span
                className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full transition-all duration-200"
                style={{
                  background: active ? BRAND_RED : "transparent",
                  boxShadow: active ? `0 0 10px ${BRAND_RED}88` : "none",
                }}
              />
              <span
                className={`text-[17px] leading-none transition-all duration-200
                  ${active ? "text-white" : "text-slate-500 group-hover:text-slate-200"}`}
                style={active ? { textShadow: `0 0 14px ${BRAND_RED}aa` } : undefined}
              >
                {icon}
              </span>

              {/* Tooltip */}
              <span
                className="pointer-events-none absolute left-full ml-2 px-2.5 py-1 rounded-lg
                           text-[11px] font-medium text-slate-100 whitespace-nowrap
                           bg-black/90 border border-white/15 opacity-0 -translate-x-1
                           group-hover:opacity-100 group-hover:translate-x-0
                           transition-all duration-150 z-50"
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Tour — bottom of the rail */}
      <button
        onClick={() => setTourOpen(true)}
        title="Replay the 30-second tour"
        className="mb-4 w-8 h-8 rounded-full text-xs font-bold text-slate-400 hover:text-white
                   bg-white/5 border border-white/10 hover:border-white/25 cursor-pointer"
      >
        ?
      </button>
    </nav>
  );
}
