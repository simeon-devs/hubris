import { Link, useRouterState } from "@tanstack/react-router";
import { Bot, FileText, FlaskConical, Map as MapIcon, Sparkles } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";


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
      {/* Left nav rail — desktop only; phones get the bottom tab bar */}
      <aside className="app-chrome fixed inset-y-0 left-0 z-40 hidden w-[216px] flex-col border-r bg-sidebar lg:flex">
        <div className="border-b px-5 py-4">
          <div className="logo-chip inline-flex rounded-lg px-2.5 py-1.5">
            <img src="/emx-logo.jpeg" alt="EMX — a 7X company" className="h-6 w-auto" />
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
      <div className="lg:pl-[216px]">
        <header className="app-chrome sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/85 px-4 backdrop-blur lg:px-6">
          <div className="flex min-w-0 items-center gap-2 text-[12.5px]">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">EMX ATLAS</span>
            <span className="hidden text-muted-foreground sm:inline">/</span>
            <span className="hidden truncate font-semibold text-foreground sm:inline">{pageName}</span>
          </div>
          <div className="flex items-center gap-3 lg:gap-4">
            <div className="hidden sm:block">
              <LiveClock />
            </div>
            <span className="hidden rounded-full border bg-muted px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-secondary md:inline-block">
              3 networks · 22 entities · 13 weeks
            </span>
            <div className="logo-chip rounded-md px-1.5 py-1">
              <img src="/emx-logo.jpeg" alt="EMX" className="h-4 w-auto" />
            </div>
          </div>
        </header>
        {/* pb clears the mobile tab bar; zero on desktop */}
        <main className="min-h-[calc(100vh-3.5rem)] pb-16 print:p-0 lg:pb-0">{children}</main>
      </div>

      {/* Phone bottom tab bar — the judges-on-their-phone navigation */}
      <nav
        className="app-chrome fixed inset-x-0 bottom-0 z-[1300] flex items-stretch justify-around border-t bg-background/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Primary"
      >
        {NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.to === "/" }}
            activeProps={{ className: "text-primary" }}
            inactiveProps={{ className: "text-muted-foreground" }}
            className="flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[9px] font-semibold uppercase tracking-wider"
          >
            <item.icon className="h-4.5 w-4.5" />
            <span className="truncate">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
