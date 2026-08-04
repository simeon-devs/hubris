"use client";

/**
 * AtlasProvider — the workspace's shared state, lifted out of the old
 * single-page component so the 5-page shell can switch routes without losing
 * the working context (selected scenario, loaded network, ledger, agents).
 *
 * Everything here is orchestration state. Every displayed figure still comes
 * from the engine via lib/api — the provider only holds what it fetched.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { LedgerEntry } from "@/components/KaizenLedger";
import {
  deleteSavedScenario,
  getKpis,
  getNetwork,
  listAgents,
  listSavedScenarios,
  refreshDistances,
} from "@/lib/api";
import type { CorridorMode } from "@/lib/corridors";
import type {
  AgentSpec,
  KpisResponse,
  NetworkMapResponse,
  RefreshDistancesResponse,
  SavedScenarioInfo,
  SimulateResponse,
} from "@/lib/types";

const LEDGER_KEY = "atlas_kaizen_ledger";

interface AtlasState {
  // Engine data
  network: NetworkMapResponse | null;
  baselineNetwork: NetworkMapResponse | null;
  kpis: KpisResponse | null;
  savedScenarios: SavedScenarioInfo[];
  agents: AgentSpec[];
  error: string | null;
  // Working state
  scenarioId: string | null;
  setScenarioId: (id: string | null) => void;
  simResult: SimulateResponse | null;
  setSimResult: (result: SimulateResponse | null) => void;
  corridorMode: CorridorMode;
  setCorridorMode: (mode: CorridorMode) => void;
  isDarkMode: boolean;
  setIsDarkMode: (dark: boolean) => void;
  ledger: LedgerEntry[];
  adoptEntry: (entry: Omit<LedgerEntry, "id" | "ts">) => void;
  removeLedgerEntry: (id: string) => void;
  // Header controls
  refreshingDistances: boolean;
  refreshResult: RefreshDistancesResponse | null;
  refreshDistancesNow: () => void;
  tourOpen: boolean;
  setTourOpen: (open: boolean) => void;
  // Actions
  reloadNetwork: () => void;
  reloadScenarios: () => void;
  reloadAgents: () => void;
  deleteScenario: (id: string) => void;
  onIngested: () => void;
}

const AtlasContext = createContext<AtlasState | null>(null);

export function useAtlas(): AtlasState {
  const ctx = useContext(AtlasContext);
  if (!ctx) throw new Error("useAtlas must be used inside <AtlasProvider>");
  return ctx;
}

export function AtlasProvider({ children }: { children: ReactNode }) {
  const [network, setNetwork] = useState<NetworkMapResponse | null>(null);
  const [baselineNetwork, setBaselineNetwork] = useState<NetworkMapResponse | null>(null);
  const [kpis, setKpis] = useState<KpisResponse | null>(null);
  const [savedScenarios, setSavedScenarios] = useState<SavedScenarioInfo[]>([]);
  const [agents, setAgents] = useState<AgentSpec[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [simResult, setSimResult] = useState<SimulateResponse | null>(null);
  const [corridorMode, setCorridorMode] = useState<CorridorMode>("domestic");
  const [isDarkMode, setIsDarkMode] = useState(true);
  // Ledger persistence (pre-existing team behaviour) — hydrated lazily so no
  // effect has to setState; the server render just starts empty.
  const [ledger, setLedger] = useState<LedgerEntry[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem(LEDGER_KEY) ?? "[]") as LedgerEntry[];
    } catch {
      return [];
    }
  });
  const [refreshingDistances, setRefreshingDistances] = useState(false);
  const [refreshResult, setRefreshResult] = useState<RefreshDistancesResponse | null>(null);
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
    } catch {
      /* non-persistent session */
    }
  }, [ledger]);

  const reloadNetwork = useCallback(() => {
    Promise.all([
      getNetwork(scenarioId),
      getKpis(scenarioId),
      scenarioId ? getNetwork(null) : Promise.resolve(null),
    ])
      .then(([net, k, base]) => {
        setNetwork(net);
        setKpis(k);
        setBaselineNetwork(base);
        setError(null);
      })
      .catch((err: Error) => setError(err.message));
  }, [scenarioId]);

  const reloadScenarios = useCallback(() => {
    listSavedScenarios().then(setSavedScenarios).catch(() => setSavedScenarios([]));
  }, []);

  const reloadAgents = useCallback(() => {
    listAgents().then(setAgents).catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    reloadNetwork();
  }, [reloadNetwork]);
  useEffect(() => {
    reloadAgents();
    reloadScenarios();
  }, [reloadAgents, reloadScenarios]);
  useEffect(() => {
    reloadScenarios();
  }, [reloadScenarios, simResult]);

  const adoptEntry = useCallback((entry: Omit<LedgerEntry, "id" | "ts">) => {
    setLedger((current) => [
      { ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ts: Date.now() },
      ...current,
    ]);
  }, []);

  const removeLedgerEntry = useCallback((id: string) => {
    setLedger((current) => current.filter((e) => e.id !== id));
  }, []);

  const refreshDistancesNow = useCallback(() => {
    setRefreshingDistances(true);
    refreshDistances()
      .then((result) => {
        setRefreshResult(result);
        reloadNetwork();
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setRefreshingDistances(false));
  }, [reloadNetwork]);

  const deleteScenario = useCallback(
    (id: string) => {
      deleteSavedScenario(id)
        .then(() => {
          setScenarioId((current) => (current === id ? null : current));
          reloadScenarios();
        })
        .catch((err: Error) => setError(err.message));
    },
    [reloadScenarios],
  );

  const onIngested = useCallback(() => {
    setScenarioId(null);
    setSimResult(null);
    reloadNetwork();
    reloadScenarios();
  }, [reloadNetwork, reloadScenarios]);

  const value = useMemo<AtlasState>(
    () => ({
      network,
      baselineNetwork,
      kpis,
      savedScenarios,
      agents,
      error,
      scenarioId,
      setScenarioId,
      simResult,
      setSimResult,
      corridorMode,
      setCorridorMode,
      isDarkMode,
      setIsDarkMode,
      ledger,
      adoptEntry,
      removeLedgerEntry,
      refreshingDistances,
      refreshResult,
      refreshDistancesNow,
      tourOpen,
      setTourOpen,
      reloadNetwork,
      reloadScenarios,
      reloadAgents,
      deleteScenario,
      onIngested,
    }),
    [
      network, baselineNetwork, kpis, savedScenarios, agents, error, scenarioId, simResult,
      corridorMode, isDarkMode, ledger, adoptEntry, removeLedgerEntry, refreshingDistances,
      refreshResult, refreshDistancesNow, tourOpen, reloadNetwork, reloadScenarios,
      reloadAgents, deleteScenario, onIngested,
    ],
  );

  return <AtlasContext.Provider value={value}>{children}</AtlasContext.Provider>;
}
