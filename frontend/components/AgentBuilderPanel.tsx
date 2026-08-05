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
  agents:   AgentSpec[];
  onChange: () => void;
}

export default function AgentBuilderPanel({ agents, onChange }: AgentBuilderPanelProps) {
  const [name, setName]               = useState("");
  const [goal, setGoal]               = useState("");
  const [allowedTools, setAllowedTools] = useState<string[]>([]);
  const [autonomy, setAutonomy]       = useState<"on-demand" | "monitoring">("on-demand");
  const [error, setError]             = useState<string | null>(null);
  const [creating, setCreating]       = useState(false);

  function toggleTool(tool: string) {
    setAllowedTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]
    );
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
      setName(""); setGoal(""); setAllowedTools([]);
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
    <div className="flex flex-col gap-4">

      {/* Existing agents */}
      {agents.length > 0 && (
        <div className="flex flex-col gap-2 pb-4 border-b border-white/[0.07]">
          {agents.map((a) => (
            <div key={a.name}
                 className="flex items-start justify-between gap-3 px-3.5 py-3 rounded-xl
                            bg-white/[0.04] border border-white/[0.08]">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-medium text-slate-100 truncate">{a.name}</span>
                <span className="text-[10px] font-mono text-slate-400 truncate">
                  {a.autonomy} · {a.allowed_tools.join(", ")}
                </span>
              </div>
              <button
                onClick={() => handleDelete(a.name)}
                className="text-[10px] px-2 py-1 rounded-lg flex-shrink-0 cursor-pointer
                           bg-rose-500/8 border border-rose-500/18 text-rose-500/70
                           hover:text-rose-400 hover:border-rose-500/30 transition-colors duration-150"
              >
                delete
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create form */}
      <div className="flex flex-col gap-3.5">
        <FormInput
          value={name}
          onChange={setName}
          placeholder="Agent name"
        />
        <FormTextarea
          value={goal}
          onChange={setGoal}
          placeholder="Plain-English goal (e.g. flag when utilization exceeds 85%)"
          rows={2}
        />

        {/* Tool checkboxes */}
        <div className="flex flex-col gap-0.5">
          <label className="text-xs font-medium tracking-wide text-amber-100/70 mb-1.5">
            Allowed tools
          </label>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 pl-0.5">
            {ALL_TOOLS.map((tool) => (
              <label key={tool} className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowedTools.includes(tool)}
                  onChange={() => toggleTool(tool)}
                />
                <span className="text-xs font-mono text-slate-300">{tool}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Autonomy */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium tracking-wide text-amber-100/70">Autonomy mode</label>
          <select
            value={autonomy}
            onChange={(e) => setAutonomy(e.target.value as "on-demand" | "monitoring")}
            className="w-full text-sm px-3 py-2.5 rounded-xl bg-white/8 border border-white/12
                       text-slate-100 focus:outline-none focus:border-cyan-500/40 cursor-pointer"
          >
            <option value="on-demand">on-demand</option>
            <option value="monitoring">monitoring</option>
          </select>
        </div>

        {/* Create CTA */}
        <button
          onClick={handleCreate}
          disabled={creating}
          className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all duration-150
            ${creating
              ? "bg-cyan-500/5 border border-cyan-500/10 text-cyan-700 cursor-default"
              : "bg-cyan-500/15 border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/20 hover:text-white cursor-pointer"
            }`}
        >
          {creating ? "Creating…" : "+ Create Agent"}
        </button>

        {error && (
          <div className="text-xs px-3.5 py-2.5 rounded-xl text-rose-400
                          bg-rose-500/10 border border-rose-500/20">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function FormInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full text-sm px-3.5 py-2.5 rounded-xl text-slate-100 bg-white/8 border border-white/12
                 placeholder:text-slate-500 focus:outline-none transition-colors duration-150"
      onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(34,211,238,0.35)"; }}
      onBlur={(e)  => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
    />
  );
}

function FormTextarea({ value, onChange, placeholder, rows }: {
  value: string; onChange: (v: string) => void; placeholder: string; rows: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full text-sm px-3.5 py-2.5 rounded-xl text-slate-100 bg-white/8 border border-white/12
                 placeholder:text-slate-500 focus:outline-none resize-vertical transition-colors duration-150"
      onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(34,211,238,0.35)"; }}
      onBlur={(e)  => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
    />
  );
}
