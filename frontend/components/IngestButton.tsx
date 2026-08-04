"use client";

/**
 * IngestButton — the event-day moment: upload the real 7X dataset and the
 * twin re-lights with it. Schema-agnostic on the backend (fuzzy + LLM column
 * mapping); when a column is ambiguous the API answers 422 with best
 * guesses, and this dialog lets the operator confirm the mapping and retry —
 * the ingestion fire-drill path, now fully reachable from the UI.
 */

import { useRef, useState } from "react";
import { ingest } from "@/lib/api";
import type { IngestResponse } from "@/lib/types";

interface AmbiguousField {
  best_guess_column: string;
  confidence: number;
}

interface MappingIssue {
  table: string;
  fields: Record<string, AmbiguousField>;
}

interface IngestButtonProps {
  onIngested: (result: IngestResponse) => void;
}

export default function IngestButton({ onIngested }: IngestButtonProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pendingFile = useRef<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<MappingIssue | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<IngestResponse | null>(null);

  async function upload(file: File, columnOverrides?: Record<string, Record<string, string>>) {
    setBusy(true);
    setError(null);
    try {
      const result = await ingest(file, { columnOverrides });
      setIssue(null);
      setDone(result);
      onIngested(result);
      setTimeout(() => setDone(null), 6000);
    } catch (err) {
      const message = (err as Error).message;
      // 422 carries the ambiguous-mapping payload as JSON detail text.
      const match = message.match(/\{.*\}$/s);
      let parsed: unknown = null;
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          parsed = null;
        }
      }
      const detail = (parsed as { detail?: { table?: string; ambiguous_fields?: Record<string, AmbiguousField> } } | null)?.detail;
      if (detail?.table && detail.ambiguous_fields) {
        setIssue({ table: detail.table, fields: detail.ambiguous_fields });
        setOverrides(
          Object.fromEntries(
            Object.entries(detail.ambiguous_fields).map(([field, guess]) => [
              field,
              guess.best_guess_column,
            ])
          )
        );
      } else {
        setError(message);
        setTimeout(() => setError(null), 8000);
      }
    } finally {
      setBusy(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    pendingFile.current = file;
    void upload(file);
  }

  function confirmMapping() {
    const file = pendingFile.current;
    if (!file || !issue) return;
    void upload(file, { [issue.table]: overrides });
  }

  return (
    <>
      <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onPick} />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors duration-150
          ${busy
            ? "border-white/5 text-slate-600 cursor-default"
            : "border-[#E8112D]/40 text-red-200 hover:text-white hover:border-[#E8112D]/70 cursor-pointer"}
          bg-[#E8112D]/10`}
        title="Upload the 7X dataset (xlsx) — schema-agnostic mapping to the canonical model"
      >
        {busy ? "Mapping dataset…" : "⇪ Load 7X dataset"}
      </button>

      {done && (
        <span className="text-[11px] text-emerald-400 font-mono whitespace-nowrap">
          ✓ {done.hubs} hubs · {done.zones} zones · {done.fleet_types} fleets loaded
        </span>
      )}
      {error && (
        <span className="text-[11px] text-rose-400 max-w-[260px] truncate" title={error}>
          {error}
        </span>
      )}

      {issue && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <div
            className="w-[420px] rounded-3xl bg-[#0d1424]/95 border border-white/15 p-6 flex flex-col gap-4"
            style={{ boxShadow: "0 24px 80px rgba(0,0,0,0.7)" }}
          >
            <div>
              <div className="text-sm font-bold text-white">Confirm column mapping</div>
              <div className="text-[11px] text-slate-400 mt-1">
                The mapper is unsure about {Object.keys(issue.fields).length} column(s) in the
                <span className="font-mono text-amber-300"> {issue.table}</span> sheet. Confirm or
                correct, then reload — nothing downstream ever reads raw column names.
              </div>
            </div>

            {Object.entries(issue.fields).map(([field, guess]) => (
              <label key={field} className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-slate-500">
                  {field}{" "}
                  <span className="text-slate-600">
                    (best guess: {guess.best_guess_column}, {(guess.confidence * 100).toFixed(0)}%)
                  </span>
                </span>
                <input
                  value={overrides[field] ?? ""}
                  onChange={(e) => setOverrides({ ...overrides, [field]: e.target.value })}
                  className="input-dark"
                  placeholder="Exact column name in the sheet"
                />
              </label>
            ))}

            <div className="flex gap-2 pt-1">
              <button
                onClick={confirmMapping}
                disabled={busy}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-[#E8112D]
                           hover:bg-[#ff2542] cursor-pointer"
              >
                {busy ? "Reloading…" : "Confirm mapping & load"}
              </button>
              <button
                onClick={() => setIssue(null)}
                className="px-4 py-2.5 rounded-xl text-xs text-slate-400 hover:text-white bg-white/5
                           border border-white/10 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
