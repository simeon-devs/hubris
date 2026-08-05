import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import type { HubStatus } from "@/lib/atlas-data";
import { cn } from "@/lib/utils";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("glass-panel rounded-[13px] border backdrop-blur-md", className)}>{children}</div>
  );
}

type DotTone = "ok" | "warn" | "risk" | "primary";

const DOT_CLASSES: Record<DotTone, string> = {
  ok: "bg-ok text-ok/40",
  warn: "bg-warn text-warn/40",
  risk: "bg-risk text-risk/40",
  primary: "bg-primary text-primary/40",
};

export function PulseDot({ tone, className }: { tone: DotTone; className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 shrink-0 rounded-full animate-pulse-dot",
        DOT_CLASSES[tone],
        className,
      )}
    />
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h3 className="text-[13px] font-semibold tracking-tight text-foreground">{children}</h3>
      {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

type Tone = "ok" | "warn" | "risk" | "violet" | "blue" | "teal" | "neutral";

const TONE_CLASSES: Record<Tone, string> = {
  ok: "bg-ok/10 text-ok border-ok/25",
  warn: "bg-warn/10 text-warn border-warn/25",
  risk: "bg-risk/10 text-risk border-risk/25",
  violet: "bg-violet/10 text-violet border-violet/25",
  blue: "bg-primary/10 text-primary border-primary/25",
  teal: "bg-cyan/10 text-cyan border-cyan/25",
  neutral: "bg-muted text-muted-foreground border-border",
};

export function Chip({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wider",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const STATUS_TONE: Record<HubStatus, Tone> = {
  Normal: "ok",
  "High Load": "warn",
  "At Risk": "risk",
};

export function StatusBadge({ status }: { status: HubStatus }) {
  return <Chip tone={STATUS_TONE[status]}>{status}</Chip>;
}

const BAR_TONE: Record<HubStatus, string> = {
  Normal: "bg-ok",
  "High Load": "bg-warn",
  "At Risk": "bg-risk",
};

export function UtilBar({ value, status }: { value: number; status: HubStatus }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", BAR_TONE[status])}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

interface AtlasButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  variant?: "primary" | "outline" | "ghost" | "danger";
}

export function AtlasButton({ loading, variant = "primary", className, children, disabled, ...rest }: AtlasButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" && "btn-primary-gloss text-primary-foreground",
        variant === "outline" && "border bg-card text-foreground hover:bg-muted",
        variant === "ghost" && "text-text-secondary hover:bg-muted",
        variant === "danger" && "bg-risk text-primary-foreground hover:opacity-90",
        className,
      )}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function LabelValueRow({ label, value, mono = true }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 px-3.5 py-1.5 last:border-0">
      <span className="text-[11.5px] text-muted-foreground">{label}</span>
      <span className={cn("text-[12px] font-semibold text-foreground", mono && "font-mono")}>{value}</span>
    </div>
  );
}

/* ---------------- control-tower primitives ---------------- */

/** Every screen gets ONE big headline number; everything else hides behind clicks. */
export function PageHead({ kicker, value, unit, sub }: { kicker: string; value: string; unit?: string; sub?: string }) {
  return (
    <div className="mb-5 animate-rise">
      <p className="kicker">{kicker}</p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="font-mono text-[42px] font-bold leading-none tracking-tight text-foreground">{value}</span>
        {unit ? (
          <span className="font-mono text-[12px] font-semibold uppercase tracking-wider text-primary">{unit}</span>
        ) : null}
      </div>
      {sub ? <p className="mt-2 max-w-xl text-[11.5px] leading-relaxed text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

/** Green FEASIBLE / red CANNOT SERVE ALL badge for scenario results. */
export function FeasBadge({ feasible }: { feasible: boolean }) {
  return feasible ? <Chip tone="ok">Feasible</Chip> : <Chip tone="risk">Cannot serve all</Chip>;
}

/** Copilot answer pill: VERIFIED / VERIFIED · SELF-CORRECTED / FLAGGED. */
export function VerifyPill({ pill }: { pill: "verified" | "self-corrected" | "flagged" }) {
  if (pill === "verified") return <Chip tone="ok">Verified</Chip>;
  if (pill === "self-corrected") return <Chip tone="teal">Verified · Self-corrected</Chip>;
  return <Chip tone="warn">Flagged</Chip>;
}

/** Shared form field styles for scenario cards. */
export const FIELD_CLASS =
  "mt-1.5 w-full rounded-lg border bg-background/60 px-3 py-2 text-[12.5px] font-medium text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring";

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="block font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
      {children}
    </label>
  );
}
