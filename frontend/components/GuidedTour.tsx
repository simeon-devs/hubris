"use client";

/**
 * GuidedTour — a 5-step first-run walkthrough so a judge understands the
 * twin in under 30 seconds with zero explanation. Dismissible, remembers
 * completion in localStorage, restartable from the header's "?" button.
 */

import { useEffect, useState } from "react";

const STEPS: { title: string; body: string; anchor: string }[] = [
  {
    title: "This is EMX's entire network, live.",
    body: "Every hub is a pillar — height is required couriers, color is health (red = understaffed). The animated lines are real parcel flows from the optimizer.",
    anchor: "center",
  },
  {
    title: "Touch the network.",
    body: "Use BUILD to add a hub, add a customer, or move a hub — just click the map. The engine re-solves the whole network in about a second.",
    anchor: "top-center",
  },
  {
    title: "Every what-if becomes a chip.",
    body: "Select a chip to compare BASELINE vs SIMULATION side-by-side — the cameras stay locked together.",
    anchor: "top-right",
  },
  {
    title: "Ask anything. Verified.",
    body: "The AI agents answer with numbers computed by the optimization engine — each answer is machine-checked so the AI cannot invent a figure. Look for the green VERIFIED badge.",
    anchor: "right",
  },
  {
    title: "Adopt what works.",
    body: "When the engine finds a saving, adopt it — the Kaizen Ledger tracks progress toward the official −5% cost-to-serve target.",
    anchor: "bottom-center",
  },
];

const STORAGE_KEY = "atlas_tour_done";

export default function GuidedTour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  if (!open) return null;

  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  function finish() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* storage unavailable — tour just reappears next load */
    }
    onClose();
  }

  return (
    <div className="absolute inset-0 z-50 bg-black/55 backdrop-blur-[2px] flex items-center justify-center">
      <div
        className="w-[420px] rounded-3xl bg-[#0d1424]/95 border border-white/15 p-7 flex flex-col gap-4"
        style={{ boxShadow: "0 24px 80px rgba(0,0,0,0.7), 0 0 40px rgba(232,17,45,0.10)" }}
      >
        <div className="flex items-center gap-2">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className="h-1 flex-1 rounded-full transition-all duration-300"
              style={{ background: i <= step ? "#E8112D" : "rgba(255,255,255,0.10)" }}
            />
          ))}
        </div>

        <div className="text-lg font-bold text-white leading-snug">{current.title}</div>
        <p className="text-sm text-slate-300 leading-relaxed">{current.body}</p>

        <div className="flex items-center justify-between pt-2">
          <button
            onClick={finish}
            className="text-xs text-slate-500 hover:text-slate-300 cursor-pointer"
          >
            Skip tour
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="px-4 py-2 rounded-xl text-xs text-slate-300 bg-white/5 border border-white/10
                           hover:border-white/25 cursor-pointer"
              >
                Back
              </button>
            )}
            <button
              onClick={() => (last ? finish() : setStep(step + 1))}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-[#E8112D] hover:bg-[#ff2542]
                         cursor-pointer"
              style={{ boxShadow: "0 0 18px rgba(232,17,45,0.35)" }}
            >
              {last ? "Start planning ▷" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function tourAlreadySeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}
