"use client";

/**
 * BuildConfirmCard — the floating card that turns a map click into a real
 * engine run. Collects INPUTS only; on confirm the caller POSTs /simulate
 * (save_as) and the whole canvas flips into BASELINE | SIMULATION compare.
 */

import { useState } from "react";
import type { ReactNode } from "react";
import type { AddCustomerDefaults, AddHubDefaults, PendingBuild } from "@/lib/build";

interface BuildConfirmCardProps {
  pending: PendingBuild;
  hubDefaults: AddHubDefaults | null;
  customerDefaults: AddCustomerDefaults | null;
  emirates: string[];
  movingHubName?: string;
  busy: boolean;
  error: string | null;
  onConfirm: (params: Record<string, unknown>) => void;
  onCancel: () => void;
}

export default function BuildConfirmCard({
  pending,
  hubDefaults,
  customerDefaults,
  emirates,
  movingHubName,
  busy,
  error,
  onConfirm,
  onCancel,
}: BuildConfirmCardProps) {
  const [hub, setHub] = useState<AddHubDefaults | null>(hubDefaults);
  const [customer, setCustomer] = useState<AddCustomerDefaults | null>(customerDefaults);

  const title =
    pending.mode === "add_hub"
      ? "New hub here?"
      : pending.mode === "add_customer"
        ? "New customer here?"
        : `Move ${movingHubName ?? pending.hubId} here?`;

  function confirm() {
    if (pending.mode === "add_hub" && hub) {
      onConfirm({
        id: hub.id,
        name: hub.name,
        lat: pending.lat,
        lon: pending.lon,
        emirate: hub.emirate,
        capacity: hub.capacity,
        fixed_cost: hub.fixed_cost,
        handling_cost: hub.handling_cost,
        status: "open",
      });
    } else if (pending.mode === "add_customer" && customer) {
      onConfirm({
        id: customer.id,
        name: customer.name,
        lat: pending.lat,
        lon: pending.lon,
        emirate: customer.emirate,
        demand: customer.demand,
        sla_hours: customer.sla_hours,
      });
    } else if (pending.mode === "move_hub") {
      onConfirm({ hub_id: pending.hubId, new_lat: pending.lat, new_lon: pending.lon });
    }
  }

  return (
    <div
      className="w-[300px] rounded-2xl bg-black/85 backdrop-blur-xl border border-white/15 p-4
                 flex flex-col gap-3"
      style={{ boxShadow: "0 16px 48px rgba(0,0,0,0.6), 0 0 24px rgba(232,17,45,0.12)" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-white">{title}</span>
        <span className="text-[10px] font-mono text-slate-500">
          {pending.lat.toFixed(4)}, {pending.lon.toFixed(4)}
        </span>
      </div>

      {pending.mode === "add_hub" && hub && (
        <>
          <Row label="Name">
            <TextInput value={hub.name} onChange={(v) => setHub({ ...hub, name: v })} />
          </Row>
          <Row label="Emirate">
            <select
              value={hub.emirate}
              onChange={(e) => setHub({ ...hub, emirate: e.target.value })}
              className="input-dark"
            >
              {emirates.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </Row>
          <Row label="Capacity (parcels)">
            <NumInput value={hub.capacity} onChange={(v) => setHub({ ...hub, capacity: v })} />
          </Row>
          <Row label="Fixed cost (AED)">
            <NumInput value={hub.fixed_cost} onChange={(v) => setHub({ ...hub, fixed_cost: v })} />
          </Row>
          <Row label="Handling (AED/parcel)">
            <NumInput
              value={hub.handling_cost}
              step={0.1}
              onChange={(v) => setHub({ ...hub, handling_cost: v })}
            />
          </Row>
        </>
      )}

      {pending.mode === "add_customer" && customer && (
        <>
          <Row label="Name">
            <TextInput value={customer.name} onChange={(v) => setCustomer({ ...customer, name: v })} />
          </Row>
          <Row label="Emirate">
            <select
              value={customer.emirate}
              onChange={(e) => setCustomer({ ...customer, emirate: e.target.value })}
              className="input-dark"
            >
              {emirates.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </Row>
          <Row label="Daily demand (parcels)">
            <NumInput value={customer.demand} onChange={(v) => setCustomer({ ...customer, demand: v })} />
          </Row>
          <Row label="SLA (hours)">
            <NumInput value={customer.sla_hours} onChange={(v) => setCustomer({ ...customer, sla_hours: v })} />
          </Row>
        </>
      )}

      {pending.mode === "move_hub" && (
        <p className="text-xs text-slate-400 leading-relaxed">
          The engine re-computes every road distance from the new location and re-solves the whole
          network. You&rsquo;ll see baseline vs simulation side by side.
        </p>
      )}

      {error && (
        <div className="text-[11px] px-3 py-2 rounded-lg text-rose-400 bg-rose-500/10 border border-rose-500/20">
          {error}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={confirm}
          disabled={busy}
          className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer
            ${busy
              ? "bg-white/5 text-slate-600"
              : "bg-[#E8112D] hover:bg-[#ff2542] text-white"}`}
          style={busy ? {} : { boxShadow: "0 0 20px rgba(232,17,45,0.35)" }}
        >
          {busy ? "Engine re-solving…" : "Run in the twin ▷"}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="px-4 py-2.5 rounded-xl text-xs text-slate-400 hover:text-white bg-white/5
                     border border-white/10 cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function TextInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="input-dark"
    />
  );
}

function NumInput({
  value,
  step = 1,
  onChange,
}: {
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      value={value}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      className="input-dark"
    />
  );
}
