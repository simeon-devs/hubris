"use client";

/**
 * COMMAND — the situational-awareness view. Full-bleed twin, and only what a
 * duty manager needs at a glance: scenario chips, the KPI strip, Andon
 * alerts, the Kaizen ledger. All work happens on the other pages.
 */

import AndonAlerts from "@/components/AndonAlerts";
import KaizenLedger from "@/components/KaizenLedger";
import KpiStrip from "@/components/KpiStrip";
import MapCanvas from "@/components/MapCanvas";
import MapViewControls from "@/components/MapViewControls";
import ScenarioChips from "@/components/ScenarioChips";
import { useAtlas } from "@/lib/atlas-context";

export default function CommandPage() {
  const {
    kpis,
    simResult,
    savedScenarios,
    scenarioId,
    setScenarioId,
    deleteScenario,
    ledger,
    removeLedgerEntry,
  } = useAtlas();

  return (
    <div className="relative w-full h-full overflow-hidden">
      <MapCanvas />

      {/* Scenario chips — top center */}
      <div className="absolute left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 top-3">
        <ScenarioChips
          scenarios={savedScenarios}
          activeId={scenarioId}
          onSelect={setScenarioId}
          onDelete={deleteScenario}
        />
        {/* KPI strip — right under the chips */}
        {kpis && <KpiStrip kpis={kpis} deltaPct={simResult?.delta_pct} />}
      </div>

      {/* Andon alerts — right edge */}
      <div className="absolute right-4 top-3 z-20">
        <AndonAlerts />
      </div>

      {/* Kaizen ledger — bottom center */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-4 z-20">
        <KaizenLedger entries={ledger} onRemove={removeLedgerEntry} />
      </div>

      {/* Map furniture — theme + corridor mode (bottom right, legend-class) */}
      <div className="absolute right-4 bottom-4 z-20">
        <MapViewControls />
      </div>
    </div>
  );
}
