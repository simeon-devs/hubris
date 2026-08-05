"use client";

import { useEffect, useRef, useState } from "react";
import ActionCard from "@/components/ActionCard";
import { extractActions } from "@/lib/action-cards";
import { queryAgent } from "@/lib/api";
import { useAtlas } from "@/lib/atlas-context";
import type { AgentSpec, ToolCallTrace, VerificationInfo } from "@/lib/types";

interface ChatMessage {
  role: "user" | "agent" | "error";
  text: string;
  toolCalls?: ToolCallTrace[];
  agentRole?: string | null;
  agentName?: string | null;
  verification?: VerificationInfo | null;
}

interface AgentChatProps {
  agents: AgentSpec[];
}

export default function AgentChat({ agents }: AgentChatProps) {
  const { network } = useAtlas(); // hub names for plain-language card titles
  const [messages, setMessages]           = useState<ChatMessage[]>([]);
  const [input, setInput]                 = useState("");
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [loading, setLoading]             = useState(false);
  const [expanded, setExpanded]           = useState<Record<string, boolean>>({});
  const bottomRef                         = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

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
          verification: response.verification,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "error", text: (err as Error).message }]);
    } finally {
      setLoading(false);
    }
  }

  const agentLabel = (m: ChatMessage) =>
    m.agentName ? m.agentName : m.agentRole ? m.agentRole : "Agent";

  /** The provenance guardrail's verdict (T-33), worn on the answer itself.
   *  Three states, all machine-checked server-side:
   *  verified — every figure traced to an engine tool result first pass;
   *  regenerated — the check CAUGHT untraceable figures and forced a
   *  correction that then verified (the guardrail working, on camera);
   *  flagged — still untraceable after the retry: the exact figures are
   *  named and must never be presented as trustworthy. */
  function VerifiedBadge({ verification }: { verification: VerificationInfo }) {
    if (verification.status === "verified" || verification.status === "regenerated") {
      const selfCorrected = verification.status === "regenerated";
      return (
        <span
          className="normal-case tracking-wide text-[10px] font-bold text-emerald-300
                     bg-emerald-500/15 border border-emerald-500/40 rounded-full px-2.5 py-0.5"
          style={{ boxShadow: "0 0 12px rgba(52,211,153,0.25)" }}
          title={
            selfCorrected
              ? "The runtime check caught unverified figures in the first draft and forced a self-correction; every number in THIS answer now traces to the calculation engine."
              : "Every number in this answer was checked against the calculation engine. The AI cannot invent figures here."
          }
        >
          {selfCorrected ? "✓ VERIFIED · SELF-CORRECTED" : "✓ VERIFIED"}
        </span>
      );
    }
    return (
      <span
        className="normal-case tracking-wide text-[10px] font-bold text-amber-300
                   bg-amber-500/15 border border-amber-500/40 rounded-full px-2.5 py-0.5"
        style={{ boxShadow: "0 0 12px rgba(251,191,36,0.25)" }}
        title={`These figures could not be matched to the engine even after a forced retry: ${verification.untraceable_figures.join(", ")}. Treat them with caution — the engine numbers in the traces below remain authoritative.`}
      >
        ⚠ UNVERIFIED FIGURES: {verification.untraceable_figures.join(", ")}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-3">

      {/* Agent selector */}
      <select
        value={selectedAgent}
        onChange={(e) => setSelectedAgent(e.target.value)}
        className="w-full text-sm px-3 py-2.5 rounded-lg bg-white/8 border border-white/12
                   text-slate-100 focus:outline-none focus:border-cyan-500/40 cursor-pointer"
      >
        <option value="">Workforce — auto-routed</option>
        {agents.map((a) => (
          <option key={a.name} value={a.name}>{a.name}</option>
        ))}
      </select>

      {/* Message thread */}
      <div
        className="flex flex-col gap-3 overflow-y-auto pr-0.5"
        style={{ maxHeight: 300, minHeight: 60 }}
      >
        {messages.length === 0 && !loading && (
          <p className="text-xs leading-relaxed italic text-slate-400">
            Ask about the network — e.g. &ldquo;What&apos;s our cost-to-serve?&rdquo; or
            &ldquo;Should we close any hubs?&rdquo;
          </p>
        )}

        {messages.map((m, i) => {
          if (m.role === "user") {
            return (
              <div key={i} className="flex flex-col items-end gap-1">
                <span className="text-[9px] uppercase tracking-widest text-cyan-500 pr-0.5">You</span>
                <div className="max-w-[88%] px-3.5 py-2.5 rounded-2xl rounded-br-sm text-sm text-slate-100
                                leading-relaxed bg-cyan-500/15 border border-cyan-500/25">
                  {m.text}
                </div>
              </div>
            );
          }

          if (m.role === "error") {
            return (
              <div key={i} className="text-xs px-3.5 py-2.5 rounded-xl text-rose-400
                                       bg-rose-500/10 border border-rose-500/20">
                ⚠ {m.text}
              </div>
            );
          }

          return (
            <div key={i} className="flex flex-col items-start gap-1">
              <span className="text-[9px] uppercase tracking-widest text-slate-400 pl-0.5 flex items-center gap-1.5">
                {agentLabel(m)}
                {m.verification && <VerifiedBadge verification={m.verification} />}
              </span>
              <div className="max-w-[92%] px-3.5 py-2.5 rounded-2xl rounded-bl-sm text-sm
                              text-slate-100 leading-relaxed whitespace-pre-wrap
                              bg-white/[0.06] border border-white/10">
                {m.text}
              </div>

              {/* Action cards — every runnable proposal in the trace */}
              {m.toolCalls && network && (
                <div className="flex flex-col gap-2 mt-1.5 w-full">
                  {extractActions(m.toolCalls, network.hubs).map((action, k) => (
                    <ActionCard key={`${i}-action-${k}`} action={action} />
                  ))}
                </div>
              )}

              {/* Tool call traces */}
              {m.toolCalls && m.toolCalls.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pl-1 mt-1">
                  {m.toolCalls.map((tc, j) => {
                    const key = `${i}-${j}`;
                    return (
                      <div key={key}>
                        <button
                          onClick={() => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))}
                          className="text-[10px] px-2.5 py-1 rounded-lg transition-colors duration-150
                                     bg-cyan-500/8 border border-cyan-500/20 text-cyan-500/70
                                     hover:text-cyan-400 hover:border-cyan-500/30 cursor-pointer"
                        >
                          ⬡ {tc.tool}
                        </button>
                        {expanded[key] && (
                          <pre className="text-[10px] p-3 rounded-xl mt-1 overflow-x-auto
                                          bg-black/60 border border-white/8 text-slate-300"
                               style={{ maxWidth: 300, fontFamily: "var(--font-geist-mono), monospace" }}>
                            {JSON.stringify(tc.result, null, 2)}
                          </pre>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {loading && (
          <div className="flex items-start">
            <div className="px-3.5 py-3 rounded-2xl rounded-bl-sm flex items-center gap-1.5
                            bg-white/[0.06] border border-white/10">
              {[0, 1, 2].map((i) => (
                <span key={i} className="typing-dot inline-block w-1.5 h-1.5 rounded-full bg-cyan-400/50" />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div className="flex gap-2 mt-1">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder="Ask about the network…"
          className="flex-1 text-sm px-3.5 py-2.5 rounded-xl text-slate-100
                     bg-white/8 border border-white/12 focus:outline-none
                     placeholder:text-slate-500 transition-colors duration-150"
          onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(34,211,238,0.35)"; }}
          onBlur={(e)  => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
        />
        <button
          onClick={send}
          disabled={loading}
          className={`text-sm px-4 rounded-xl font-medium transition-all duration-150 flex-shrink-0
            ${loading
              ? "bg-cyan-500/5 border border-cyan-500/10 text-cyan-700 cursor-default"
              : "bg-cyan-500/15 border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/20 hover:text-white cursor-pointer"
            }`}
        >
          Send
        </button>
      </div>
    </div>
  );
}
