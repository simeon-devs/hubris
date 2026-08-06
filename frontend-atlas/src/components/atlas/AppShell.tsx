import { Link, useRouterState } from "@tanstack/react-router";
import { Bot, FileText, FlaskConical, Map as MapIcon, Sparkles } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { EmxLockup } from "@/components/atlas/EmxLockup";
import { getHealth } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PulseDot } from "./ui";

const NAV = [
  { to: "/", label: "Map", icon: MapIcon },
  { to: "/simulate", label: "Simulate", icon: FlaskConical },
  { to: "/optimize", label: "Optimize", icon: Sparkles },
  { to: "/agents", label: "Agents", icon: Bot },
  { to: "/reports", label: "Reports", icon: FileText },
] as const;

const PAGE_NAMES: Record<string, string> = {
  "/": "Map",
  "/simulate": "Simulate",
  "/optimize": "Optimize",
  "/agents": "Agents",
  "/reports": "Reports",
};

function LiveClock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () =>
      setTime(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="font-mono text-[12.5px] font-medium tabular-nums text-text-secondary">
      {time || "—:—:—"}
    </span>
  );
}

function EnginePill() {
  // Honest status: a real /health poll every 20s — never a painted-green pill.
  const [live, setLive] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    const ping = () =>
      getHealth()
        .then(() => !cancelled && setLive(true))
        .catch(() => !cancelled && setLive(false));
    ping();
    const timer = setInterval(ping, 20_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  const tone = live ? "ok" : "risk";
  return (
    <div
      className={cn(
        "flex w-full items-center gap-2 rounded-full border px-3 py-1.5",
        live ? "border-ok/30 bg-ok/10" : "border-risk/30 bg-risk/10",
      )}
    >
      <PulseDot tone={tone} />
      <span className="min-w-0">
        <span className={cn("block text-[10px] font-bold uppercase tracking-wider", live ? "text-ok" : "text-risk")}>
          {live === null ? "Engine · connecting" : live ? "Live engine" : "Engine offline"}
        </span>
        <span className={cn("block truncate text-[9.5px]", live ? "text-ok/70" : "text-risk/70")}>
          {live ? "real solver · real 7X dataset" : "start the backend, results paused"}
        </span>
      </span>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const pageName = PAGE_NAMES[pathname] ?? "EMX ATLAS";

  return (
    <div className="min-h-screen">
      {/* Left nav rail */}
      <aside className="app-chrome fixed inset-y-0 left-0 z-40 flex w-[216px] flex-col border-r bg-sidebar">
        <div className="border-b px-5 py-4">
          <div className="logo-chip inline-flex rounded-lg px-2.5 py-1.5">
            <EmxLockup label="EMX — a 7X company" fontPx={24} />
          </div>
          <p className="kicker mt-3">Atlas · Control Tower</p>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              activeProps={{ className: "bg-primary/12 text-primary shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-primary)_30%,transparent)] hover:bg-primary/12 hover:text-primary" }}
              inactiveProps={{ className: "text-text-secondary hover:bg-muted hover:text-foreground" }}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-semibold transition-colors"
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t p-3">
          <EnginePill />
        </div>
      </aside>

      {/* Main column */}
      <div className="pl-[216px]">
        <header className="app-chrome sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/85 px-6 backdrop-blur">
          <div className="flex items-center gap-2 text-[12.5px]">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">EMX ATLAS</span>
            <span className="text-muted-foreground">/</span>
            <span className="font-semibold text-foreground">{pageName}</span>
          </div>
          <div className="flex items-center gap-4">
            <LiveClock />
            <span className="hidden rounded-full border bg-muted px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-secondary md:inline-block">
              3 networks · 22 entities · 13 weeks
            </span>
            <div className="logo-chip rounded-md px-1.5 py-1">
              <EmxLockup label="EMX" fontPx={15} />
            </div>
          </div>
        </header>
        <main className="min-h-[calc(100vh-3.5rem)] print:p-0">{children}</main>
      </div>
    </div>
  );
}
