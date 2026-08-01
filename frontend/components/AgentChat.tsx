"use client";

import { useState } from "react";
import { queryAgent } from "@/lib/api";
import type { AgentSpec, ToolCallTrace } from "@/lib/types";

interface ChatMessage {
  role: "user" | "agent" | "error";
  text: string;
  toolCalls?: ToolCallTrace[];
  agentRole?: string | null;
  agentName?: string | null;
}

interface AgentChatProps {
  agents: AgentSpec[];
}

export default function AgentChat({ agents }: AgentChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  async function send() {
    const question = input.trim();
    if (!question || loading) return;
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setInput("");
    setLoading(true);
    try {
      const response = await queryAgent({ question, agent_name: selectedAgent || null });
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          text: response.answer,
          toolCalls: response.tool_calls,
          agentRole: response.role,
          agentName: response.agent_name,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "error", text: (err as Error).message }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <select
        value={selectedAgent}
        onChange={(e) => setSelectedAgent(e.target.value)}
        style={{ fontSize: 12, padding: 6, borderRadius: 6, border: "1px solid #e5e7eb" }}
      >
        <option value="">Workforce (auto-routed)</option>
        {agents.map((a) => (
          <option key={a.name} value={a.name}>
            {a.name}
          </option>
        ))}
      </select>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 340, overflowY: "auto" }}>
        {messages.length === 0 && (
          <div style={{ fontSize: 12, color: "#9ca3af" }}>
            Ask a question — e.g. &quot;What&apos;s our cost-to-serve?&quot; or &quot;Should we close any
            hubs?&quot;
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ fontSize: 13 }}>
            <div
              style={{
                fontWeight: 600,
                color: m.role === "user" ? "#111827" : m.role === "error" ? "#dc2626" : "#2563eb",
              }}
            >
              {m.role === "user"
                ? "You"
                : m.role === "error"
                  ? "Error"
                  : m.agentName
                    ? `Agent (${m.agentName})`
                    : m.agentRole
                      ? `Agent (${m.agentRole})`
                      : "Agent"}
            </div>
            <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
            {m.toolCalls && m.toolCalls.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {m.toolCalls.map((tc, j) => {
                  const key = `${i}-${j}`;
                  return (
                    <div key={key}>
                      <button
                        onClick={() => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))}
                        style={{
                          fontSize: 11,
                          padding: "2px 6px",
                          borderRadius: 4,
                          border: "1px solid #d1d5db",
                          background: "#f3f4f6",
                          cursor: "pointer",
                        }}
                      >
                        source: {tc.tool}
                      </button>
                      {expanded[key] && (
                        <pre
                          style={{
                            fontSize: 10,
                            background: "#111827",
                            color: "#e5e7eb",
                            padding: 8,
                            borderRadius: 6,
                            overflowX: "auto",
                            marginTop: 4,
                            maxWidth: 320,
                          }}
                        >
                          {JSON.stringify(tc.result, null, 2)}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        {loading && <div style={{ fontSize: 13, color: "#9ca3af" }}>Thinking…</div>}
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="Ask about the network…"
          style={{ flex: 1, fontSize: 13, padding: 8, border: "1px solid #e5e7eb", borderRadius: 6 }}
        />
        <button
          onClick={send}
          disabled={loading}
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            background: "#111827",
            color: "white",
            border: "none",
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
