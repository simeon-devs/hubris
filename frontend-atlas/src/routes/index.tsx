import { createFileRoute } from "@tanstack/react-router";
import { Bell, Check, Layers, MapPin, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { CopilotDrawer } from "@/components/atlas/CopilotDrawer";
import { AtlasButton, Card, Chip, LabelValueRow, StatusBadge, UtilBar } from "@/components/atlas/ui";
import { ackAlertRemote, fetchAlerts, type AtlasAlert } from "@/lib/atlas-alerts";
import { fmtAed, fmtInt, fmtNum, type HubInfo } from "@/lib/atlas-data";
import { hubSnapshot, type HubSnapshot } from "@/lib/atlas-engine";
import { getKpis, getNetwork, type ApiNetwork } from "@/lib/api";
import { useAtlas } from "@/lib/atlas-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Network Map — EMX ATLAS" },
      {
        name: "description",
        content:
          "Live control-tower map of the EMX UAE network: 10 hubs, 10 dark stores and on-demand coverage, with alerts, a copilot and one-click scenarios.",
      },
      { property: "og:title", content: "Network Map — EMX ATLAS" },
      { property: "og:description", content: "Live control-tower map of the EMX UAE delivery network." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MapHomePage,
});

type LeafletMapModule = typeof import("@/components/atlas/LeafletMap");

const SEVERITY_STYLES: Record<AtlasAlert["severity"], { bar: string; chip: "risk" | "warn" | "teal"; label: string }> = {
  critical: { bar: "border-l-risk", chip: "risk", label: "Critical" },
  warning: { bar: "border-l-warn", chip: "warn", label: "Warning" },
  info: { bar: "border-l-cyan", chip: "teal", label: "Info" },
};

function MapHomePage() {
  const { acked, ackAlert, mapFocus, clearMapFocus } = useAtlas();

  const [MapComp, setMapComp] = useState<LeafletMapModule["LeafletMap"] | null>(null);
  const [layers, setLayers] = useState({ hubs: true, stores: true, od: true });
  const [selectedHubId, setSelectedHubId] = useState<string | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [focus, setFocus] = useState<{ lat: number; lng: number; zoom?: number; stamp?: number } | null>(null);

  const [alerts, setAlerts] = useState<AtlasAlert[]>([]);
  useEffect(() => {
    let cancelled = false;
    const poll = () => fetchAlerts().then((list) => !cancelled && setAlerts(list));
    poll();
    const timer = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  const unacked = alerts.filter((a) => !a.acknowledged && !acked.includes(a.id));
  // Headline + hub facts come from the ENGINE; the embedded snapshot is the
  // offline fallback (VIEW mode) only.
  const [cps, setCps] = useState<number | null>(null);
  const [liveNet, setLiveNet] = useState<ApiNetwork | null>(null);
  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      getKpis()
        .then((k) => !cancelled && setCps(k.cost_to_serve.value))
        .catch(() => !cancelled && setCps(null));
      getNetwork()
        .then((n) => !cancelled && setLiveNet(n))
        .catch(() => {});
    };
    poll();
    const timer = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  const snapshot: HubSnapshot | null = useMemo(() => {
    if (!selectedHubId) return null;
    const base = hubSnapshot(selectedHubId);
    if (!base) return null;
    const live = liveNet?.hubs.find((h) => h.id === selectedHubId);
    if (!live) return base;
    // Live engine fields override the embedded copy where they exist.
    return {
      ...base,
      util: live.utilization_pct,
      dailyLoad: live.rider_capacity_daily != null && live.utilization_pct != null ? base.dailyLoad : base.dailyLoad,
      effCap: live.capacity,
      fte: live.riders_fte ?? base.fte,
      ftc: live.riders_ftc ?? base.ftc,
    };
  }, [selectedHubId, liveNet]);

  useEffect(() => {
    void import("@/components/atlas/LeafletMap").then((m) => setMapComp(() => m.LeafletMap));
  }, []);

  /* ONE path for every "Show on map" (alert cards, Copilot, crisis chip,
     cross-page): fly the camera, reveal the layer the target lives on, and
     when the target is a hub actually SELECT it — same pin styling and
     live card as clicking it. Navigation wins over analysis filters: a
     selected target must never sit on a hidden layer or behind a filter. */
  const showOnMap = (t: { lat: number; lng: number; zoom?: number; hubId?: string }) => {
    setFocus({ ...t, stamp: Date.now() });
    const id = t.hubId;
    if (!id) return;
    const layerKey = id.startsWith("QED") ? "stores" : id.startsWith("OD") ? "od" : "hubs";
    setLayers((l) => (l[layerKey] ? l : { ...l, [layerKey]: true }));
    if (id.startsWith("CAND")) setShowCandidates(true);
    if (hubSnapshot(id)) {
      setSelectedHubId(id);
      setTypeFilter("all");
      setStatusFilter("all");
    }
  };

  /* A "Show on map" pressed on another page lands here. */
  useEffect(() => {
    if (mapFocus) {
      showOnMap(mapFocus);
      clearMapFocus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- showOnMap is stable in effect: guarded by mapFocus, cleared after use
  }, [mapFocus, clearMapFocus]);

  const toggleLayer = (key: keyof typeof layers) => setLayers((l) => ({ ...l, [key]: !l[key] }));
  // Analyse-from-many-angles filters (hub layer only)
  const [typeFilter, setTypeFilter] = useState<"all" | "Full Hub" | "Micro Hub">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "At Risk" | "High Load" | "Normal">("all");
  const [showCandidates, setShowCandidates] = useState(true);

  return (
    <div className="relative h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Legend — the colors mean something now */}
      <div className="absolute bottom-4 left-4 z-[1000] flex flex-wrap items-center gap-2 rounded-full border bg-card/85 px-3 py-1.5 backdrop-blur-md">
        {(
          [
            ["#5b9dff", "Hubs & flows"],
            ["#8b7cf6", "Dark stores (15-min radius)"],
            ["#3fd2ef", "On-Demand coverage"],
            ["#f0504d", "Point of concern"],
          ] as const
        ).map(([hex, label]) => (
          <span key={label} className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: hex }} />
            {label}
          </span>
        ))}
      </div>

      {/* Map */}
      <div className="absolute inset-0">
        {MapComp ? (
          <MapComp
            layers={layers}
            focus={focus}
            selectedHubId={selectedHubId}
            onSelectHub={(hub: HubInfo) => setSelectedHubId(hub.id)}
            typeFilter={typeFilter}
            statusFilter={statusFilter}
            showCandidates={showCandidates}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[12.5px] text-muted-foreground">Loading map…</div>
        )}
      </div>

      {/* Headline — the ONE big number */}
      <div className="absolute left-4 top-4 z-[1000] w-[292px]">
        <Card className="p-4">
          <p className="kicker">Cost / shipment · Hub &amp; Spoke · live</p>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="font-mono text-[36px] font-bold leading-none tracking-tight text-foreground">
              {cps === null ? "—" : fmtNum(cps, 2)}
            </span>
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-primary">AED</span>
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground">
            Fully loaded, computed by the engine on the current network. Click any hub for its live card.
          </p>
        </Card>

        {/* Layer toggles */}
        <div className="mt-2 flex items-center gap-1.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border bg-card/80 text-text-secondary backdrop-blur-md">
            <Layers className="h-3.5 w-3.5" />
          </span>
          {(
            [
              ["hubs", "Hubs", "#5b9dff"],
              ["stores", "Dark stores", "#8b7cf6"],
              ["od", "On-Demand", "#3fd2ef"],
            ] as const
          ).map(([key, label, hex]) => (
            <button
              key={key}
              onClick={() => toggleLayer(key)}
              aria-pressed={layers[key]}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider backdrop-blur-md transition-colors",
                layers[key] ? "" : "bg-card/80 text-muted-foreground hover:text-foreground",
              )}
              style={layers[key] ? { borderColor: `${hex}66`, background: `${hex}22`, color: hex } : undefined}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: layers[key] ? hex : "#556" }} />
              {label}
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {(["all", "Full Hub", "Micro Hub"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={cn(
                "rounded-full border px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-wider backdrop-blur-md",
                typeFilter === t ? "border-primary/40 bg-primary/15 text-primary" : "bg-card/80 text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "all" ? "All types" : t === "Full Hub" ? "Full (same-day)" : "Micro (next-day)"}
            </button>
          ))}
          {(["all", "At Risk", "High Load", "Normal"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={cn(
                "rounded-full border px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-wider backdrop-blur-md",
                statusFilter === st ? "border-warn/50 bg-warn/15 text-warn" : "bg-card/80 text-muted-foreground hover:text-foreground",
              )}
            >
              {st === "all" ? "Any status" : st}
            </button>
          ))}
          <button
            onClick={() => setShowCandidates((v) => !v)}
            className={cn(
              "rounded-full border px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-wider backdrop-blur-md",
              showCandidates ? "border-primary/40 bg-primary/10 text-primary" : "bg-card/80 text-muted-foreground",
            )}
          >
            Candidates
          </button>
        </div>
      </div>

      {/* Crisis chip — renders ONLY while a live critical infeasible alert
          exists; the number is the alert's own computed shortfall. */}
      {(() => {
        const crisis = alerts.find((a) => a.severity === "critical" && !a.acknowledged);
        if (!crisis) return null;
        const unserved = crisis.finding.match(/([0-9.]+)\/day/g)?.map((m) => parseFloat(m)) ?? [];
        const total = unserved.length ? unserved.reduce((x, y) => x + y, 0) : null;
        return (
          <div className="absolute left-1/2 top-4 z-[1200] -translate-x-1/2">
            <button
              onClick={() => {
                if (crisis.target) showOnMap(crisis.target);
                else setLayers((l) => ({ ...l, stores: true }));
                setAlertsOpen(true);
              }}
              className="animate-pulse rounded-full border border-risk/50 bg-risk/15 px-3.5 py-1.5
                         font-mono text-[10px] font-bold uppercase tracking-wider text-risk
                         backdrop-blur-md shadow-card hover:bg-risk/25"
              title={crisis.finding}
            >
              ⚠ {crisis.title}{total !== null ? ` — ${total}/day unserved` : ""}
            </button>
          </div>
        );
      })()}

      {/* Alert bell */}
      <div className="absolute right-4 top-4 z-[1250]">
        <button
          onClick={() => setAlertsOpen((o) => !o)}
          aria-label="Open alerts"
          className="relative flex h-10 w-10 items-center justify-center rounded-xl border bg-card/80 text-foreground shadow-card backdrop-blur-md transition-colors hover:bg-muted"
        >
          <Bell className="h-4.5 w-4.5" />
          {unacked.length > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-risk px-1 font-mono text-[10px] font-bold text-primary-foreground">
              {unacked.length}
            </span>
          ) : null}
        </button>
      </div>

      {/* Alerts drawer */}
      {alertsOpen ? (
        <div className="absolute right-4 top-16 z-[1240] max-h-[calc(100%-7rem)] w-[384px] animate-slide-in overflow-y-auto">
          <Card className="p-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="kicker">Alerts · {unacked.length} open</p>
              <button onClick={() => setAlertsOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close alerts">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-2">
              {alerts.map((a) => {
                const s = SEVERITY_STYLES[a.severity];
                const isAcked = acked.includes(a.id);
                return (
                  <div key={a.id} className={cn("rounded-xl border border-l-[3px] bg-background/50 p-3", s.bar, isAcked && "opacity-55")}>
                    <div className="flex items-center justify-between gap-2">
                      <Chip tone={s.chip}>{s.label}</Chip>
                      {isAcked ? <Chip tone="ok">Acked</Chip> : null}
                    </div>
                    <p className="mt-2 text-[12.5px] font-semibold leading-snug text-foreground">{a.title}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">{a.finding}</p>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                      <span className="font-semibold text-foreground">Action: </span>
                      {a.action}
                    </p>
                    <div className="mt-2.5 flex gap-1.5">
                      {a.target ? (
                        <AtlasButton
                          variant="outline"
                          className="h-7 px-2.5 py-0 text-[11px]"
                          onClick={() => {
                            showOnMap(a.target!);
                            setAlertsOpen(false);
                          }}
                        >
                          <MapPin className="h-3 w-3" /> Show on map
                        </AtlasButton>
                      ) : null}
                      {!isAcked ? (
                        <AtlasButton variant="ghost" className="h-7 px-2.5 py-0 text-[11px]" onClick={() => { ackAlert(a.id); ackAlertRemote(a.id); }}>
                          <Check className="h-3 w-3" /> Acknowledge
                        </AtlasButton>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      ) : null}

      {/* Hub side card */}
      {snapshot ? (
        <div className="absolute bottom-4 left-4 z-[1100] max-h-[74%] w-[336px] animate-rise overflow-y-auto">
          <Card>
            <div className="flex items-start justify-between gap-2 border-b px-4 pb-3 pt-3.5">
              <div>
                <p className="text-[14px] font-bold leading-tight text-foreground">{snapshot.hub.name}</p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {snapshot.hub.emirate} · {snapshot.hub.hubType} · {snapshot.hub.id}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <StatusBadge status={snapshot.status} />
                <button onClick={() => setSelectedHubId(null)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close hub card">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="px-1 py-1">
              <LabelValueRow label="Today's load" value={`${fmtInt(Math.round(snapshot.dailyLoad))} parcels`} />
              <LabelValueRow label="Effective capacity" value={`${fmtInt(Math.round(snapshot.effCap))} /day`} />
              <div className="px-3.5 py-2">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11.5px] text-muted-foreground">Courier utilisation</span>
                  <span className="font-mono text-[12px] font-semibold text-foreground">{fmtNum(snapshot.util)}%</span>
                </div>
                <UtilBar value={snapshot.util} status={snapshot.status} />
              </div>
              <LabelValueRow label="Riders — FTE" value={fmtInt(snapshot.fte)} />
              <LabelValueRow label="Riders — FTC" value={fmtInt(snapshot.ftc)} />
              <LabelValueRow label="On-time delivery" value={`${fmtNum(snapshot.otd)}%`} />
              <LabelValueRow label="SLA breaches (W13)" value={fmtInt(Math.round(snapshot.breaches))} />
              {snapshot.costs.map((c) => (
                <LabelValueRow key={c.model} label={`Cost / shipment · ${c.model}`} value={fmtAed(c.cps)} />
              ))}
            </div>

            {/* Fleet — straight from Fleet_Roster */}
            <details className="group border-t" open>
              <summary className="cursor-pointer list-none px-4 py-2.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em] text-text-secondary hover:text-foreground">
                Fleet · {fmtInt(snapshot.fleet.reduce((s, f) => s + f.totalMonthlyCost, 0))} AED/mo
              </summary>
              <div className="space-y-1.5 px-3 pb-3">
                {snapshot.fleet.map((f, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-background/50 px-2.5 py-1.5">
                    <div className="min-w-0">
                      <p className="truncate text-[11.5px] font-semibold text-foreground">
                        {f.count}× {f.vehicleType}
                      </p>
                      <p className="font-mono text-[9.5px] text-muted-foreground">
                        {f.role} · {f.ownership} · {fmtNum(f.fuelPerKm, 2)} AED/km
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] font-semibold text-foreground">
                      {fmtInt(f.totalMonthlyCost)}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          </Card>
        </div>
      ) : null}

      {/* Atlas AI copilot — EMX-branded white bot chip, right edge */}
      <CopilotDrawer onShowOnMap={showOnMap} />
    </div>
  );
}
