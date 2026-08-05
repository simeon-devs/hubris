import { MapPin, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import emxLogo from "@/assets/emx-logo.svg.asset.json";
import { PRESET_QUESTIONS, answerQuestion } from "@/lib/atlas-copilot";
import { useAtlas } from "@/lib/atlas-store";
import { cn } from "@/lib/utils";

import type { MapFocus } from "./LeafletMap";
import { Chip, PulseDot, VerifyPill } from "./ui";

interface ChatMsg {
  role: "user" | "assistant";
  text: string;
  pill?: "verified" | "self-corrected" | "flagged";
  mapTarget?: MapFocus;
  toolCalls?: { tool: string; summary: string }[];
  untraceableFigures?: number[];
  error?: boolean;
}

/** The EMX wordmark on a white paper chip — the Atlas AI identity mark. */
function BotMark({ className }: { className?: string }) {
  return (
    <span className={cn("logo-chip inline-flex shrink-0 items-center rounded-lg px-1.5 py-1 shadow-card", className)}>
      <img src={emxLogo.url} alt="EMX Atlas AI" className="h-3.5 w-auto" />
    </span>
  );
}

/**
 * Atlas AI Copilot — right-edge chat drawer, shared by Map and Agents.
 * The bot speaks from an EMX-branded white chip; every answer is grounded
 * in the local digital twin and carries a verification pill.
 */
export function CopilotDrawer({ onShowOnMap }: { onShowOnMap?: (f: MapFocus) => void }) {
  const { logEvent } = useAtlas();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, open]);

  // The REAL agent: async, with loading + honest error states. Every answer
  // is provenance-verified server-side before it arrives here.
  const send = (q: string) => {
    const t = q.trim();
    if (!t || busy) return;
    setBusy(true);
    setMsgs((m) => [...m, { role: "user", text: t }]);
    setInput("");
    logEvent(`Copilot — asked "${t.slice(0, 48)}"`);
    answerQuestion(t)
      .then((a) => {
        setMsgs((m) => [
          ...m,
          {
            role: "assistant",
            text: a.text,
            pill: a.pill,
            toolCalls: a.toolCalls,
            untraceableFigures: a.untraceableFigures,
            ...(a.mapTarget ? { mapTarget: a.mapTarget } : {}),
          },
        ]);
      })
      .catch((e: Error) => {
        setMsgs((m) => [
          ...m,
          {
            role: "assistant",
            text: `The engine is unreachable or the agent failed (${e.message.slice(0, 140)}). The numbers on screen remain engine-computed; try again once the backend is up.`,
            error: true,
          },
        ]);
      })
      .finally(() => setBusy(false));
  };

  return (
    <>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="glass-panel no-print fixed right-0 top-[38%] z-[1260] flex flex-col items-center gap-2.5 rounded-l-xl border border-r-0 px-2 py-3.5 backdrop-blur-xl transition-transform hover:-translate-x-1"
          aria-label="Open Atlas AI copilot"
        >
          <BotMark />
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-primary [writing-mode:vertical-rl]">
            Atlas AI
          </span>
        </button>
      ) : (
        <aside className="glass-panel no-print fixed bottom-0 right-0 top-14 z-[1260] flex w-[382px] flex-col border-l backdrop-blur-xl animate-slide-in">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2.5">
              <BotMark className="px-2 py-1.5" />
              <div>
                <p className="text-[12.5px] font-bold text-foreground">Atlas AI Copilot</p>
                <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  <PulseDot tone="ok" className="h-1.5 w-1.5" /> grounded in the local 7X twin
                </p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close copilot"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3.5 overflow-y-auto px-4 py-4">
            {msgs.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <BotMark className="px-2.5 py-2" />
                <p className="text-[12px] font-semibold text-foreground">Ask about your network</p>
                <p className="max-w-[250px] text-[10.5px] leading-relaxed text-muted-foreground">
                  Costs, utilization, fleet, scenarios, optimizer logic — every answer is grounded in the official
                  7X dataset running locally.
                </p>
              </div>
            ) : (
              msgs.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="ml-8 rounded-xl rounded-br-sm border border-primary/25 bg-primary/15 px-3.5 py-2.5 text-[12px] font-medium leading-relaxed text-foreground">
                    {m.text}
                  </div>
                ) : (
                  <div key={i} className="flex items-start gap-2.5">
                    <BotMark className="mt-0.5" />
                    <div className="glass-panel min-w-0 flex-1 rounded-xl rounded-tl-sm border px-3.5 py-2.5">
                      <p className="text-[12px] leading-relaxed text-foreground">{m.text}</p>
                      {m.pill === "flagged" && m.untraceableFigures && m.untraceableFigures.length > 0 ? (
                        <p className="mt-1.5 text-[10px] leading-relaxed text-warn">
                          Unverified figures — could not be traced to any engine result:{" "}
                          {m.untraceableFigures.join(", ")}. Treat them with caution; the tool
                          results below remain authoritative.
                        </p>
                      ) : null}
                      {m.toolCalls && m.toolCalls.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {m.toolCalls.map((c, j) => (
                            <span
                              key={j}
                              className="rounded-full border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground"
                              title="An engine tool this answer is grounded in"
                            >
                              ⚙ {c.summary}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {m.pill ? (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <VerifyPill pill={m.pill} />
                          {m.mapTarget && onShowOnMap ? (
                            <button
                              onClick={() => onShowOnMap(m.mapTarget!)}
                              className="inline-flex items-center gap-1 rounded-full border border-primary/35 bg-primary/12 px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wider text-primary transition-colors hover:bg-primary/25"
                            >
                              <MapPin className="h-2.5 w-2.5" /> Show on map
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ),
              )
            )}
            {busy ? (
              <div className="flex items-start gap-2.5">
                <BotMark className="mt-0.5" />
                <div className="glass-panel rounded-xl rounded-tl-sm border px-3.5 py-2.5 text-[11px] text-muted-foreground">
                  Running the engine — real tools, then a provenance check on every figure…
                </div>
              </div>
            ) : null}
          </div>

          <div className="border-t px-4 pb-4 pt-3">
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {PRESET_QUESTIONS.slice(0, 6).map((p) => (
                <button key={p} onClick={() => send(p)}>
                  <Chip tone="blue" className="cursor-pointer normal-case tracking-normal transition-colors hover:bg-primary/20">
                    {p.length > 36 ? `${p.slice(0, 36)}…` : p}
                  </Chip>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send(input)}
                placeholder="Ask Atlas AI…"
                className="min-w-0 flex-1 rounded-lg border bg-background/60 px-3 py-2 text-[12px] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={() => send(input)}
                disabled={!input.trim()}
                className="btn-primary-gloss flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-primary-foreground transition-opacity disabled:opacity-50"
                aria-label="Send"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </aside>
      )}
    </>
  );
}
