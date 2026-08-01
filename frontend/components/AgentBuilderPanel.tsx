"use client";

import { useState } from "react";
import { createAgent, deleteAgent } from "@/lib/api";
import type { AgentSpec } from "@/lib/types";

const ALL_TOOLS = [
  "get_kpis",
  "find_spare_capacity",
  "simulate_scenario",
  "optimise_network",
  "compare_scenarios",
];

interface AgentBuilderPanelProps {
  agents: AgentSpec[];
  onChange: () => void;
}

export default function AgentBuilderPanel({ agents, onChange }: AgentBuilderPanelProps) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [allowedTools, setAllowedTools] = useState<string[]>([]);
  const [autonomy, setAutonomy] = useState<"on-demand" | "monitoring">("on-demand");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function toggleTool(tool: string) {
    setAllowedTools((prev) => (prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]));
  }

  async function handleCreate() {
    setError(null);
    if (!name.trim() || !goal.trim() || allowedTools.length === 0) {
      setError("Name, goal, and at least one tool are required.");
      return;
    }
    setCreating(true);
    try {
      await createAgent({ name: name.trim(), goal: goal.trim(), allowed_tools: allowedTools, autonomy });
      setName("");
      setGoal("");
      setAllowedTools([]);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(agentName: string) {
    await deleteAgent(agentName);
    onChange();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {agents.map((a) => (
          <div
            key={a.name}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 12,
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              padding: "4px 8px",
              gap: 8,
            }}
          >
            <span>
              <strong>{a.name}</strong> ({a.autonomy}) — {a.allowed_tools.join(", ")}
            </span>
            <button
              onClick={() => handleDelete(a.name)}
              style={{ fontSize: 11, color: "#dc2626", background: "none", border: "none", cursor: "pointer" }}
            >
              delete
            </button>
          </div>
        ))}
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Agent name"
        style={{ fontSize: 13, padding: 6, border: "1px solid #e5e7eb", borderRadius: 6 }}
      />
      <textarea
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        placeholder="Plain-English goal"
        rows={2}
        style={{ fontSize: 13, padding: 6, border: "1px solid #e5e7eb", borderRadius: 6, resize: "vertical" }}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {ALL_TOOLS.map((tool) => (
          <label key={tool} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
            <input type="checkbox" checked={allowedTools.includes(tool)} onChange={() => toggleTool(tool)} />
            {tool}
          </label>
        ))}
      </div>
      <select
        value={autonomy}
        onChange={(e) => setAutonomy(e.target.value as "on-demand" | "monitoring")}
        style={{ fontSize: 12, padding: 6, borderRadius: 6, border: "1px solid #e5e7eb" }}
      >
        <option value="on-demand">on-demand</option>
        <option value="monitoring">monitoring</option>
      </select>
      <button
        onClick={handleCreate}
        disabled={creating}
        style={{
          padding: "8px 12px",
          borderRadius: 6,
          background: "#111827",
          color: "white",
          border: "none",
          cursor: creating ? "default" : "pointer",
          opacity: creating ? 0.6 : 1,
        }}
      >
        {creating ? "Creating…" : "Create agent"}
      </button>
      {error && <div style={{ color: "#dc2626", fontSize: 12 }}>{error}</div>}
    </div>
  );
}
