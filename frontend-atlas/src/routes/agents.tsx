import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Bot, Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { CopilotDrawer } from "@/components/atlas/CopilotDrawer";
import {
  createAgent,
  getAgents,
  getMonitoringStatus,
  type ApiAgentSpec,
  type ApiMonitoringStatus,
} from "@/lib/api";
import { AtlasButton, Card, Chip, PageHead, SectionTitle } from "@/components/atlas/ui";
import { ackAlertRemote, fetchAlerts, type AtlasAlert } from "@/lib/atlas-alerts";
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

/** Builder choices = REAL registry tools, labelled for planners. */
const TOOLS: { label: string; tool: string }[] = [
  { label: "Read KPIs", tool: "get_kpis" },
  { label: "Run simulations", tool: "simulate_scenario" },
  { label: "Find breaking points", tool: "find_demand_growth_break" },
  { label: "Optimise the network", tool: "optimise_network" },
  { label: "Scan spare capacity", tool: "find_spare_capacity" },
  { label: "Write decision briefs", tool: "generate_decision_brief" },
];

const SEV_CHIP: Record<string, "risk" | "warn" | "teal"> = { critical: "risk", warning: "warn", info: "teal" };

function AgentsPage() {
  const { events, acked, ackAlert, showOnMap } = useAtlas();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<AtlasAlert[]>([]);
  // The REAL agent registry + the monitoring scheduler's live status.
  const [specs, setSpecs] = useState<ApiAgentSpec[]>([]);
  const [mon, setMon] = useState<ApiMonitoringStatus | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);
  const refreshAgents = () => {
    getAgents().then(setSpecs).catch(() => {});
    getMonitoringStatus().then(setMon).catch(() => {});
  };
  useEffect(() => {
    let cancelled = false;
    const poll = () => fetchAlerts().then((list) => !cancelled && setAlerts(list));
    poll();
    refreshAgents();
    const timer = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  const open = alerts.filter((a) => !a.acknowledged && !acked.includes(a.id));
  const alertCountFor = (agent: string) => alerts.filter((a) => a.agentName === agent).length;
  const latestAlertFor = (agent: string) => alerts.find((a) => a.agentName === agent && !a.acknowledged);

  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [tools, setTools] = useState<string[]>(["get_kpis", "find_spare_capacity"]);
  const [mode, setMode] = useState<"on-demand" | "monitoring">("monitoring");

  const toggleTool = (t: string) => setTools((list) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]));
  const canDeploy = name.trim().length > 0 && goal.trim().length > 0 && tools.length > 0;

  const deploy = () => {
    setDeployError(null);
    createAgent({
      name: name.trim().toLowerCase().replace(/\s+/g, "_"),
      goal: goal.trim(),
      allowed_tools: tools,
      autonomy: mode === "monitoring" ? "monitoring" : "on-demand",
    })
      .then(() => {
        setName("");
        setGoal("");
        refreshAgents();
      })
      .catch((e: Error) => setDeployError(e.message));
  };

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
                  {TOOLS.map(({ label, tool }) => (
                    <button
                      key={tool}
                      onClick={() => toggleTool(tool)}
                      aria-pressed={tools.includes(tool)}
                      title={tool}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[11.5px] font-medium transition-colors",
                        tools.includes(tool) ? "border-primary/40 bg-primary/12 text-primary" : "bg-background/60 text-text-secondary hover:text-foreground",
                      )}
                    >
                      <span className={cn("flex h-4 w-4 items-center justify-center rounded border", tools.includes(tool) ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}>
                        {tools.includes(tool) ? <Check className="h-3 w-3" /> : null}
                      </span>
                      {label}
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
              {deployError ? (
                <p className="rounded-lg border border-risk/30 bg-risk/10 px-3 py-2 text-[11px] text-risk">{deployError}</p>
              ) : null}
              <AtlasButton className="w-full" disabled={!canDeploy} onClick={deploy}>
                <Bot className="h-3.5 w-3.5" /> Deploy agent
              </AtlasButton>
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle hint={mon ? `scheduler live · sweep every ${Math.round(mon.interval_seconds / 60)} min · ${mon.runs} runs` : `${specs.length} registered`}>
              Deployed agents — live registry
            </SectionTitle>
            {specs.length === 0 ? (
              <p className="text-[11.5px] text-muted-foreground">Engine offline — start the backend to load the agent registry.</p>
            ) : (
              <div className="space-y-2">
                {specs.map((a) => {
                  const raised = alertCountFor(a.name);
                  const latest = latestAlertFor(a.name);
                  return (
                    <div key={a.name} className="rounded-xl border bg-background/50 px-3.5 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-mono text-[12px] font-semibold text-foreground">{a.name}</p>
                        <div className="flex items-center gap-1.5">
                          {raised > 0 ? <Chip tone="warn">{raised} alert{raised === 1 ? "" : "s"}</Chip> : null}
                          <Chip tone={a.autonomy === "monitoring" ? "teal" : "neutral"}>{a.autonomy}</Chip>
                        </div>
                      </div>
                      <p className="mt-1 text-[11.5px] leading-relaxed text-text-secondary">{a.goal}</p>
                      <p className="mt-1.5 font-mono text-[9.5px] text-muted-foreground">
                        {a.allowed_tools.join(" · ")}
                        {a.autonomy === "monitoring" && mon?.last_run_at
                          ? ` — last sweep ${mon.last_run_at.slice(11, 19)} UTC`
                          : ""}
                      </p>
                      {latest?.target ? (
                        <button
                          onClick={() => {
                            showOnMap(latest.target!);
                            void navigate({ to: "/" });
                          }}
                          className="mt-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-primary hover:underline"
                        >
                          Show its latest alert on the map →
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
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
                      <button onClick={() => { ackAlert(a.id); ackAlertRemote(a.id); }} className="font-mono text-[10px] font-semibold uppercase tracking-wider text-primary hover:underline">
                        Acknowledge
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-[12.5px] font-semibold leading-snug text-foreground">{a.title}</p>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">by {a.agentName}</p>
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
