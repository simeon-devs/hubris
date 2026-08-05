import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Bot, Check } from "lucide-react";
import { useMemo, useState } from "react";

import { CopilotDrawer } from "@/components/atlas/CopilotDrawer";
import { AtlasButton, Card, Chip, PageHead, SectionTitle } from "@/components/atlas/ui";
import { currentAlerts } from "@/lib/atlas-alerts";
import { useAtlas } from "@/lib/atlas-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/agents")({
  head: () => ({
    meta: [
      { title: "Agents — EMX ATLAS" },
      {
        name: "description",
        content: "Build monitoring agents over the EMX digital twin — goal, allowed tools, on-demand or monitoring — plus the live alert history.",
      },
      { property: "og:title", content: "Agents — EMX ATLAS" },
      { property: "og:description", content: "Agent builder and alert history for the EMX control tower." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgentsPage,
});

const TOOLS = ["Read KPIs", "Run simulations", "Watch breaking points", "Check costs", "Send alerts", "Save reports"];

const SEV_CHIP: Record<string, "risk" | "warn" | "teal"> = { critical: "risk", warning: "warn", info: "teal" };

function AgentsPage() {
  const { agents, addAgent, events, acked, ackAlert, showOnMap } = useAtlas();
  const navigate = useNavigate();
  const alerts = useMemo(() => currentAlerts(), []);
  const open = alerts.filter((a) => !acked.includes(a.id));

  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [tools, setTools] = useState<string[]>(["Read KPIs", "Send alerts"]);
  const [mode, setMode] = useState<"on-demand" | "monitoring">("monitoring");

  const toggleTool = (t: string) => setTools((list) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]));
  const canDeploy = name.trim().length > 0 && goal.trim().length > 0 && tools.length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <PageHead
        kicker="Open alerts"
        value={String(open.length)}
        unit={`of ${alerts.length} findings`}
        sub="Deploy an agent to watch the twin around the clock — it uses the same engine, data and guardrails as every screen here."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left · agent builder */}
        <div className="space-y-4">
          <Card className="p-5">
            <SectionTitle hint="runs on the twin">Agent builder</SectionTitle>
            <div className="space-y-3">
              <div>
                <label className="block font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-text-secondary">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. RAK Watchdog"
                  className="mt-1.5 w-full rounded-lg border bg-background/60 px-3 py-2 text-[12.5px] outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-text-secondary">Goal</label>
                <textarea
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  rows={3}
                  placeholder="e.g. Warn me the moment any hub passes 90% utilisation and suggest the cheapest fix."
                  className="mt-1.5 w-full resize-none rounded-lg border bg-background/60 px-3 py-2 text-[12.5px] outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-text-secondary">Allowed tools</label>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  {TOOLS.map((t) => (
                    <button
                      key={t}
                      onClick={() => toggleTool(t)}
                      aria-pressed={tools.includes(t)}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[11.5px] font-medium transition-colors",
                        tools.includes(t) ? "border-primary/40 bg-primary/12 text-primary" : "bg-background/60 text-text-secondary hover:text-foreground",
                      )}
                    >
                      <span className={cn("flex h-4 w-4 items-center justify-center rounded border", tools.includes(t) ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}>
                        {tools.includes(t) ? <Check className="h-3 w-3" /> : null}
                      </span>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-text-secondary">Run mode</span>
                <div className="flex gap-1.5">
                  {(["monitoring", "on-demand"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors",
                        mode === m ? "border-primary/40 bg-primary/15 text-primary" : "bg-background/60 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <AtlasButton
                className="w-full"
                disabled={!canDeploy}
                onClick={() => {
                  addAgent({ name: name.trim(), goal: goal.trim(), tools, mode });
                  setName("");
                  setGoal("");
                }}
              >
                <Bot className="h-3.5 w-3.5" /> Deploy agent
              </AtlasButton>
            </div>
          </Card>

          {agents.length > 0 ? (
            <Card className="p-5">
              <SectionTitle hint={`${agents.length} deployed`}>Your agents</SectionTitle>
              <div className="space-y-2">
                {agents.map((a) => (
                  <div key={a.id} className="rounded-xl border bg-background/50 px-3.5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[12.5px] font-semibold text-foreground">{a.name}</p>
                      <Chip tone={a.mode === "monitoring" ? "teal" : "neutral"}>{a.mode}</Chip>
                    </div>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-text-secondary">{a.goal}</p>
                    <p className="mt-1.5 font-mono text-[9.5px] text-muted-foreground">
                      {a.tools.join(" · ")} — deployed {a.createdAt}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>

        {/* Right · alert history feed */}
        <Card className="p-5">
          <SectionTitle hint="derived from Network_Performance W13">Alert history</SectionTitle>
          <div className="space-y-2">
            {alerts.map((a) => {
              const isAcked = acked.includes(a.id);
              return (
                <div key={a.id} className={cn("rounded-xl border bg-background/50 px-3.5 py-3", isAcked && "opacity-55")}>
                  <div className="flex items-center justify-between gap-2">
                    <Chip tone={SEV_CHIP[a.severity] ?? "neutral"}>{a.severity}</Chip>
                    {isAcked ? (
                      <Chip tone="ok">Acked</Chip>
                    ) : (
                      <button onClick={() => ackAlert(a.id)} className="font-mono text-[10px] font-semibold uppercase tracking-wider text-primary hover:underline">
                        Acknowledge
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-[12.5px] font-semibold leading-snug text-foreground">{a.title}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">{a.finding}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    <span className="font-semibold text-foreground">Action: </span>
                    {a.action}
                  </p>
                </div>
              );
            })}
          </div>

          {events.length > 0 ? (
            <div className="mt-5 border-t pt-4">
              <p className="kicker mb-2">Session activity</p>
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {[...events].reverse().map((e, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-2 text-[11.5px]">
                    <span className="truncate text-text-secondary">{e.label}</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{e.time}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      </div>

      {/* Atlas AI copilot — same right-edge spot as the map; "Show on map" navigates home */}
      <CopilotDrawer
        onShowOnMap={(f) => {
          showOnMap(f);
          void navigate({ to: "/" });
        }}
      />
    </div>
  );
}
