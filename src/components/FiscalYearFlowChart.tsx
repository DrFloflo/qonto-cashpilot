"use client";

import React from "react";
import {
  Area,
  Bar,
  Cell,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FiscalMonthPoint, FiscalYearChartData } from "@/lib/calculations";
import { formatCurrency } from "@/lib/utils";

interface FiscalYearFlowChartProps {
  data: FiscalYearChartData;
  embedded?: boolean;
}

const compactCurrency = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function FiscalYearFlowChart({ data, embedded = false }: FiscalYearFlowChartProps) {
  const currentMonth = data.months.find((month) => month.isCurrent);

  return (
    <section className={embedded ? "rounded-lg border border-border/60 bg-background p-3 sm:p-4 overflow-hidden" : "rounded-xl border border-border bg-card p-4 sm:p-6 shadow-sm overflow-hidden"}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-5">
        <div>
          <h2 className={embedded ? "text-xs font-semibold text-foreground uppercase tracking-wider" : "text-lg font-semibold text-foreground tracking-tight"}>
            Flux mensuels de l&apos;exercice
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Réalisé jusqu&apos;à aujourd&apos;hui, puis factures et flux prévisionnels · {data.label}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <LegendItem color="bg-blue-500" label="Solde fin de mois" variant="line" />
          <LegendItem color="bg-emerald-500" label="Entrées" />
          <LegendItem color="bg-rose-500" label="Sorties" />
        </div>
      </div>

      <div className="h-72 sm:h-80 w-full min-w-0" role="img" aria-label="Graphique des entrées, sorties et soldes mensuels de l’exercice fiscal en cours">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data.months} margin={{ top: 14, right: 8, left: 0, bottom: 0 }} barGap={3}>
            <defs>
              <linearGradient id="fiscalBalanceArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.22} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
              </linearGradient>
              <pattern id="projectedInflow" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="#dcfce7" />
                <rect width="2" height="6" fill="#22c55e" />
              </pattern>
              <pattern id="projectedOutflow" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="#fee2e2" />
                <rect width="2" height="6" fill="#ef4444" />
              </pattern>
            </defs>
            <CartesianGrid strokeDasharray="2 5" vertical={false} stroke="currentColor" className="text-border/70" />
            <XAxis
              dataKey="key"
              tickLine={false}
              axisLine={false}
              interval={0}
              height={34}
              tick={{ fontSize: 10, fill: "currentColor" }}
              className="text-muted-foreground"
              tickFormatter={(key: string) => {
                const month = data.months.find((item) => item.key === key);
                return month ? `${month.label}${month.isProjected ? "*" : ""}` : key;
              }}
            />
            <YAxis
              yAxisId="balance"
              tickLine={false}
              axisLine={false}
              width={54}
              tick={{ fontSize: 10, fill: "currentColor" }}
              className="text-muted-foreground"
              tickFormatter={(value: number) => compactCurrency.format(value)}
            />
            <YAxis yAxisId="flows" hide domain={[0, "dataMax"]} />
            <Tooltip content={<FiscalMonthTooltip />} cursor={{ fill: "currentColor", opacity: 0.05 }} />
            {currentMonth && (
              <ReferenceLine
                yAxisId="balance"
                x={currentMonth.key}
                stroke="#94a3b8"
                strokeOpacity={0.55}
                strokeDasharray="3 4"
              />
            )}
            <Area
              yAxisId="balance"
              type="monotone"
              dataKey="endingBalance"
              stroke="none"
              fill="url(#fiscalBalanceArea)"
              isAnimationActive={false}
            />
            <Bar yAxisId="flows" dataKey="inflow" radius={[5, 5, 0, 0]} maxBarSize={18}>
              {data.months.map((month) => (
                <Cell key={`inflow-${month.key}`} fill={month.isProjected ? "url(#projectedInflow)" : "#22c55e"} />
              ))}
            </Bar>
            <Bar yAxisId="flows" dataKey="outflow" radius={[5, 5, 0, 0]} maxBarSize={18}>
              {data.months.map((month) => (
                <Cell key={`outflow-${month.key}`} fill={month.isProjected ? "url(#projectedOutflow)" : "#ef4444"} />
              ))}
            </Bar>
            <Line
              yAxisId="balance"
              type="monotone"
              dataKey="endingBalance"
              stroke="#3b82f6"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, stroke: "#3b82f6", strokeWidth: 2, fill: "#fff" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Les mois marqués d&apos;un astérisque incluent tout ou partie des flux prévisionnels.
      </p>
    </section>
  );
}

function LegendItem({ color, label, variant = "square" }: { color: string; label: string; variant?: "square" | "line" }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={variant === "line" ? `h-0.5 w-4 rounded-full ${color}` : `h-2.5 w-2.5 rounded-sm ${color}`} />
      {label}
    </span>
  );
}

function FiscalMonthTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: FiscalMonthPoint }> }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="min-w-[250px] overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
      <div className="flex items-center justify-between gap-4 border-b border-border/70 px-3.5 py-2.5 text-xs">
        <span className="font-semibold text-foreground capitalize">{point.fullLabel}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${point.isProjected ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"}`}>
          {point.isProjected ? "Prévisionnel" : "Réalisé"}
        </span>
      </div>
      <div className="space-y-2 px-3.5 py-3 text-xs">
        <TooltipRow color="bg-blue-500" label="Solde fin de mois" value={formatCurrency(point.endingBalance)} />
        <TooltipRow color="bg-emerald-500" label="Entrées" value={formatCurrency(point.inflow)} />
        <TooltipRow color="bg-rose-500" label="Sorties" value={formatCurrency(point.outflow)} />
      </div>
      <div className="flex items-center justify-between border-t border-border/70 bg-muted/35 px-3.5 py-2.5 text-sm">
        <span className="font-medium text-foreground">Flux net</span>
        <span className={`font-semibold ${point.netFlow >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
          {point.netFlow >= 0 ? "+" : "−"}{formatCurrency(Math.abs(point.netFlow))}
        </span>
      </div>
    </div>
  );
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        <span className={`h-2 w-2 rounded-full ${color}`} />
        {label}
      </span>
      <span className="font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}
