"use client";

import React, { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import type { ChartPoint, ChartDayOperation } from "@/lib/calculations";
import { X, ArrowUpRight, ArrowDownRight, Calendar, Info } from "lucide-react";

interface CashChartProps {
  timeframe30d: ChartPoint[];
  timeframe60d: ChartPoint[];
  timeframe90d: ChartPoint[];
  timeframe12m: ChartPoint[];
  past7d?: { timeframe30d: ChartPoint[]; timeframe60d: ChartPoint[]; timeframe90d: ChartPoint[]; timeframe12m: ChartPoint[] };
  past14d?: { timeframe30d: ChartPoint[]; timeframe60d: ChartPoint[]; timeframe90d: ChartPoint[]; timeframe12m: ChartPoint[] };
  past30d?: { timeframe30d: ChartPoint[]; timeframe60d: ChartPoint[]; timeframe90d: ChartPoint[]; timeframe12m: ChartPoint[] };
  past90d?: { timeframe30d: ChartPoint[]; timeframe60d: ChartPoint[]; timeframe90d: ChartPoint[]; timeframe12m: ChartPoint[] };
  currentCash: number;
}

export function CashProjectionChart({
  timeframe30d,
  timeframe60d,
  timeframe90d,
  timeframe12m,
  past7d,
  past14d,
  past30d,
  past90d,
  currentCash,
}: CashChartProps) {
  const [activeTab, setActiveTab] = useState<"30d" | "60d" | "90d" | "12m">("60d");
  const [activePastTab, setActivePastTab] = useState<"7d" | "14d" | "30d" | "90d">("30d");
  const [selectedPoint, setSelectedPoint] = useState<ChartPoint | null>(null);

  const pastMap: Record<"7d" | "14d" | "30d" | "90d", { timeframe30d: ChartPoint[]; timeframe60d: ChartPoint[]; timeframe90d: ChartPoint[]; timeframe12m: ChartPoint[] } | undefined> = {
    "7d": past7d,
    "14d": past14d,
    "30d": past30d,
    "90d": past90d,
  };

  const currentPast = pastMap[activePastTab] || {
    timeframe30d,
    timeframe60d,
    timeframe90d,
    timeframe12m,
  };

  const dataMap: Record<"30d" | "60d" | "90d" | "12m", ChartPoint[]> = {
    "30d": currentPast.timeframe30d,
    "60d": currentPast.timeframe60d,
    "90d": currentPast.timeframe90d,
    "12m": currentPast.timeframe12m,
  };

  const data = dataMap[activeTab] || currentPast.timeframe60d;

  const todayPoint = data.find((p) => p.isToday);
  const todayLabel = todayPoint?.label || "";

  const handleChartClick = (state: unknown) => {
    if (!state || typeof state !== "object") return;
    const payloadContainer = state as { activePayload?: Array<{ payload?: ChartPoint }> };
    if (!payloadContainer.activePayload || !payloadContainer.activePayload.length) return;
    const point = payloadContainer.activePayload[0]?.payload;
    if (point && ((point.inflow && point.inflow > 0) || (point.outflow && point.outflow > 0))) {
      setSelectedPoint(point);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">
            Évolution & Projection de Trésorerie
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Historique réel récent et modélisation prévisionnelle avec factures et flux futurs
          </p>
        </div>

        {/* Selectors: Past history & Future projection */}
        <div className="flex flex-wrap items-center gap-3 self-start sm:self-auto">
          {/* Past history selector */}
          <div className="flex items-center space-x-1 rounded-lg bg-muted/60 p-1 border border-border/50">
            <span className="text-[10px] uppercase font-semibold text-emerald-600 dark:text-emerald-400 px-1.5">
              Réel :
            </span>
            {(
              [
                { key: "7d", label: "7j" },
                { key: "14d", label: "14j" },
                { key: "30d", label: "30j" },
                { key: "90d", label: "90j" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActivePastTab(tab.key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  activePastTab === tab.key
                    ? "bg-emerald-600 text-white shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Future projection selector */}
          <div className="flex items-center space-x-1 rounded-lg bg-muted/60 p-1 border border-border/50">
            <span className="text-[10px] uppercase font-semibold text-indigo-600 dark:text-indigo-400 px-1.5">
              Projeté :
            </span>
            {(
              [
                { key: "30d", label: "30j" },
                { key: "60d", label: "60j" },
                { key: "90d", label: "90j" },
                { key: "12m", label: "12m" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  activeTab === tab.key
                    ? "bg-indigo-600 text-white shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Legend guide */}
      <div className="flex flex-wrap items-center gap-6 mb-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-xs bg-emerald-500" />
          <span>Historique réel (compte Qonto)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-xs bg-indigo-500 border border-dashed border-indigo-300" />
          <span>Trésorerie projetée</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-0.5 bg-amber-500" />
          <span>Aujourd&apos;hui ({formatCurrency(currentCash)})</span>
        </div>
      </div>

      {/* Chart container */}
      <div className="h-72 sm:h-80 w-full cursor-pointer">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            onClick={handleChartClick}
            margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="colorProjected" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border/50" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "currentColor" }}
              className="text-muted-foreground"
              minTickGap={24}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "currentColor" }}
              className="text-muted-foreground"
              tickFormatter={(val) => `${Math.round(val / 1000)}k€`}
              domain={["auto", "auto"]}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const point = payload[0].payload as ChartPoint;
                return (
                  <div className="rounded-lg border border-border bg-popover p-3 shadow-md text-xs space-y-1.5 min-w-[170px]">
                    <div className="font-semibold text-foreground border-b border-border/60 pb-1 flex justify-between items-center">
                      <span>{point.label}</span>
                      {point.isToday && <span className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 font-medium px-1.5 py-0.5 rounded">Aujourd&apos;hui</span>}
                    </div>
                    {point.actualBalance !== undefined && (
                      <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                        <span>Solde réel :</span>
                        <span className="font-semibold">{formatCurrency(point.actualBalance)}</span>
                      </div>
                    )}
                    {point.projectedBalance !== undefined && (
                      <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400">
                        <span>Solde projeté :</span>
                        <span className="font-semibold">{formatCurrency(point.projectedBalance)}</span>
                      </div>
                    )}
                    {Boolean(point.inflow && point.inflow > 0) && (
                      <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 text-[11px] pt-1 border-t border-border/40">
                        <span>+ Entrées du jour :</span>
                        <span className="font-medium">{formatCurrency(point.inflow!)}</span>
                      </div>
                    )}
                    {Boolean(point.outflow && point.outflow > 0) && (
                      <div className="flex items-center justify-between text-rose-600 dark:text-rose-400 text-[11px]">
                        <span>- Sorties du jour :</span>
                        <span className="font-medium">{formatCurrency(point.outflow!)}</span>
                      </div>
                    )}
                    {Boolean((point.inflow && point.inflow > 0) || (point.outflow && point.outflow > 0)) && (
                      <div className="text-[10px] text-primary/80 pt-1 border-t border-border/40 text-center font-medium">
                        💡 Cliquer pour voir les opérations
                      </div>
                    )}
                  </div>
                );
              }}
            />
            {todayLabel && (
              <ReferenceLine
                x={todayLabel}
                stroke="#f59e0b"
                strokeWidth={2}
                strokeDasharray="4 4"
                label={{
                  value: "Aujourd'hui",
                  position: "top",
                  fill: "#f59e0b",
                  fontSize: 10,
                  fontWeight: 600,
                }}
              />
            )}
            <Area
              type="monotone"
              dataKey="actualBalance"
              stroke="#10b981"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#colorActual)"
              name="Réel"
              connectNulls={false}
              activeDot={{ r: 6, stroke: "#10b981", strokeWidth: 2, fill: "#fff", cursor: "pointer" }}
            />
            <Area
              type="monotone"
              dataKey="projectedBalance"
              stroke="#6366f1"
              strokeWidth={2.5}
              strokeDasharray="4 4"
              fillOpacity={1}
              fill="url(#colorProjected)"
              name="Projeté"
              connectNulls={false}
              activeDot={{ r: 6, stroke: "#6366f1", strokeWidth: 2, fill: "#fff", cursor: "pointer" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Modal Detail Operations of the Day */}
      {selectedPoint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-card border border-border rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    Opérations du {selectedPoint.label} ({selectedPoint.date})
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    {selectedPoint.inflow !== undefined && selectedPoint.inflow > 0 && (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        + Entrées : {formatCurrency(selectedPoint.inflow)}
                      </span>
                    )}
                    {selectedPoint.outflow !== undefined && selectedPoint.outflow > 0 && (
                      <span className="text-rose-600 dark:text-rose-400 font-medium">
                        - Sorties : {formatCurrency(selectedPoint.outflow)}
                      </span>
                    )}
                    {selectedPoint.actualBalance !== undefined && (
                      <span>Solde réel : {formatCurrency(selectedPoint.actualBalance)}</span>
                    )}
                    {selectedPoint.projectedBalance !== undefined && (
                      <span>Solde projeté : {formatCurrency(selectedPoint.projectedBalance)}</span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedPoint(null)}
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 divide-y divide-border/60">
              {selectedPoint.operations && selectedPoint.operations.length > 0 ? (
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="pb-2 font-medium">Type</th>
                      <th className="pb-2 font-medium">Libellé</th>
                      <th className="pb-2 font-medium">Catégorie / Source</th>
                      <th className="pb-2 font-medium text-right">Montant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {selectedPoint.operations.map((op, idx) => (
                      <tr key={`${op.id}-${idx}`} className="hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 pr-2">
                          {op.type === "inflow" ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                              <ArrowUpRight className="w-3 h-3" /> Entrée
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded">
                              <ArrowDownRight className="w-3 h-3" /> Sortie
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 font-medium text-foreground max-w-[200px] truncate">
                          {op.label}
                        </td>
                        <td className="py-2.5 text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <span>{op.category}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted font-mono">
                              {op.source === "qonto_transaction"
                                ? "Qonto réel"
                                : op.source === "invoice_customer"
                                ? "Facture client"
                                : op.source === "invoice_supplier"
                                ? "Facture fourn."
                                : "Flux manuel"}
                            </span>
                          </div>
                        </td>
                        <td
                          className={`py-2.5 font-semibold text-right ${
                            op.type === "inflow"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {op.type === "inflow" ? "+" : "-"}
                          {formatCurrency(op.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-8 text-center text-muted-foreground text-xs">
                  Aucun détail spécifique enregistré pour cette journée.
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-border bg-muted/20 flex justify-end">
              <button
                onClick={() => setSelectedPoint(null)}
                className="px-4 py-1.5 rounded-lg bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
