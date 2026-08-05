import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { toast } from "sonner";

import type { MapFocus } from "@/components/atlas/LeafletMap";

export interface Decision {
  label: string;
  costDeltaPct: number | null;
  time: string;
}

export interface SessionEvent {
  label: string;
  time: string;
}

export interface SavedReport {
  id: string;
  title: string;
  date: string;
  summary: string;
  bodyMd: string;
  auto?: boolean;
}

export interface AgentConfig {
  id: string;
  name: string;
  goal: string;
  tools: string[];
  mode: "on-demand" | "monitoring";
  createdAt: string;
}

interface AtlasStore {
  decisions: Decision[];
  events: SessionEvent[];
  adopt: (label: string, costDeltaPct: number | null) => void;
  logEvent: (label: string) => void;
  savedReports: SavedReport[];
  saveReport: (r: { title: string; summary: string; bodyMd: string }) => void;
  agents: AgentConfig[];
  addAgent: (a: { name: string; goal: string; tools: string[]; mode: AgentConfig["mode"] }) => void;
  acked: string[];
  ackAlert: (id: string) => void;
  mapFocus: MapFocus | null;
  showOnMap: (f: MapFocus) => void;
  clearMapFocus: () => void;
}

const AtlasContext = createContext<AtlasStore | null>(null);

function now(): string {
  return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(idCounter += 1)}`;

export function AtlasProvider({ children }: { children: ReactNode }) {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [acked, setAcked] = useState<string[]>([]);

  const adopt = useCallback((label: string, costDeltaPct: number | null) => {
    setDecisions((d) => [...d, { label, costDeltaPct, time: now() }]);
    setEvents((e) => [...e, { label: `Adopted — ${label}`, time: now() }]);
    toast.success("Decision adopted — added to the report");
  }, []);

  const logEvent = useCallback((label: string) => {
    setEvents((e) => [...e, { label, time: now() }]);
  }, []);

  const saveReport = useCallback((r: { title: string; summary: string; bodyMd: string }) => {
    setSavedReports((list) => [
      { id: nextId("RPT"), date: new Date().toISOString().slice(0, 10), ...r },
      ...list,
    ]);
    setEvents((e) => [...e, { label: `Saved report — ${r.title}`, time: now() }]);
    toast.success("Saved — find it on the Reports page");
  }, []);

  const addAgent = useCallback((a: { name: string; goal: string; tools: string[]; mode: AgentConfig["mode"] }) => {
    setAgents((list) => [...list, { id: nextId("AGT"), createdAt: now(), ...a }]);
    setEvents((e) => [...e, { label: `Deployed agent — ${a.name}`, time: now() }]);
    toast.success(`Agent "${a.name}" deployed`);
  }, []);

  const ackAlert = useCallback((id: string) => {
    setAcked((list) => (list.includes(id) ? list : [...list, id]));
  }, []);

  const [mapFocus, setMapFocus] = useState<MapFocus | null>(null);
  const showOnMap = useCallback((f: MapFocus) => setMapFocus({ ...f, stamp: Date.now() }), []);
  const clearMapFocus = useCallback(() => setMapFocus(null), []);

  return (
    <AtlasContext.Provider
      value={{ decisions, events, adopt, logEvent, savedReports, saveReport, agents, addAgent, acked, ackAlert, mapFocus, showOnMap, clearMapFocus }}
    >
      {children}
    </AtlasContext.Provider>
  );
}

export function useAtlas(): AtlasStore {
  const ctx = useContext(AtlasContext);
  if (!ctx) throw new Error("useAtlas must be used inside AtlasProvider");
  return ctx;
}
