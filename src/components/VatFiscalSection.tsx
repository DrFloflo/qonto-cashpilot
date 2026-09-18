"use client";

import React from "react";
import { formatCurrency } from "@/lib/utils";
import type { FiscalYearChartData, VatFiscalSummary, VatYearData } from "@/lib/calculations";
import { FiscalYearFlowChart } from "@/components/FiscalYearFlowChart";
import { ChevronRight, Receipt, Settings, TrendingUp, TrendingDown, Scale } from "lucide-react";

interface VatFiscalSectionProps {
  summary: VatFiscalSummary | undefined;
  fiscalYears: VatYearData[];
  chartData: FiscalYearChartData | undefined;
  selectedFiscalOffset: number;
  onOffsetChange: (offset: number) => void;
  onOpenSettings: () => void;
  onOpenVatDetail: () => void;
  onOpenAccountingRevenueDetail: () => void;
  onOpenAccountingExpensesDetail: () => void;
}

export function VatFiscalSection({
  summary,
  fiscalYears,
  chartData,
  selectedFiscalOffset,
  onOffsetChange,
  onOpenSettings,
  onOpenVatDetail,
  onOpenAccountingRevenueDetail,
  onOpenAccountingExpensesDetail,
}: VatFiscalSectionProps) {
  return (
    <section className="rounded-xl border border-border bg-card/60 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-muted-foreground" />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                TVA — estimation annuelle ({summary?.fiscalYear.startDateStr} au {summary?.fiscalYear.endDateStr})
              </h3>
              <select
                value={selectedFiscalOffset}
                onChange={(event) => onOffsetChange(Number(event.target.value))}
                aria-label="Sélectionner un exercice fiscal"
                className="rounded-md bg-muted border border-border/50 px-2 py-1 text-[10px] font-medium text-foreground"
              >
                {fiscalYears.map((year) => (
                  <option key={year.offset} value={year.offset}>
                    {formatFiscalYearOption(year)}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-[10px] text-muted-foreground">
              {summary?.fiscalYear.regimeLabel} • Exigibilité {summary?.fiscalYear.paymentMethod === "debits" ? "sur les débits" : "sur encaissements"} • estimation annuelle, hors calendrier déclaratif périodique
              {selectedFiscalOffset < 0 && " (Exercice clôturé)"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenSettings}
            className="text-[11px] text-muted-foreground hover:text-foreground font-medium flex items-center gap-1 cursor-pointer"
          >
            <Settings className="w-3 h-3" /> Modifier l&apos;exercice
          </button>
          <button
            onClick={onOpenVatDetail}
            className="text-[11px] text-primary hover:underline font-medium cursor-pointer self-start sm:self-auto"
          >
            Détail des pièces de TVA →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="p-2.5 rounded-lg bg-background border border-border/60">
          <div className="text-muted-foreground text-[11px]">TVA collectée réelle</div>
          <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
            +{formatCurrency(summary?.collectedReal ?? 0)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            Prévision séparée : +{formatCurrency(summary?.collectedFuture ?? 0)}
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-background border border-border/60">
          <div className="text-muted-foreground text-[11px]">TVA déductible réelle</div>
          <div className="text-sm font-semibold text-rose-600 dark:text-rose-400 mt-0.5">
            -{formatCurrency(summary?.deductibleReal ?? 0)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            Prévision séparée : -{formatCurrency(summary?.deductibleFuture ?? 0)}
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-background border border-border/60">
          <div className="text-muted-foreground text-[11px]">Crédit antérieur imputé</div>
          <div className="text-sm font-semibold text-blue-600 dark:text-blue-400 mt-0.5">
            -{formatCurrency(summary?.openingVatCredit ?? 0)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            Report issu de l’exercice précédent
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-background border border-border/60">
          <div className="text-muted-foreground text-[11px]">Solde réel de TVA</div>
          <div className={`text-sm font-semibold mt-0.5 ${(summary?.rawBalance ?? 0) >= 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
            {(summary?.rawBalance ?? 0) >= 0 ? "+" : ""}{formatCurrency(summary?.rawBalance ?? 0)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {(summary?.rawBalance ?? 0) >= 0 ? "TVA nette à décaisser" : "Crédit de TVA brut"}
          </div>
        </div>

      </div>

      {/* Accounting activity is invoice/expense-document based and HT. */}
      <div className="mt-4 pt-3 border-t border-border/60">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground uppercase tracking-wider">
            <Scale className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Activité {selectedFiscalOffset === 0 ? "de l'Exercice en cours" : "de l'Exercice clôturé"}</span>
          </div>
          <span className="text-[10px] text-muted-foreground">
            {summary?.fiscalYear.startDateStr} au {summary?.fiscalYear.endDateStr}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {/* Realized figures are accounting documents; forecasts stay separate. */}
          <button
            type="button"
            onClick={onOpenAccountingRevenueDetail}
            className="p-2.5 rounded-lg bg-background border border-border/60 text-left hover:border-emerald-500/50 hover:shadow-sm transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-[11px] group-hover:text-foreground transition-colors flex items-center gap-1">
                Produits comptabilisés HT ({selectedFiscalOffset === 0 ? "Année en cours" : "Année N-1"})
                <ChevronRight className="w-3 h-3 opacity-60 group-hover:translate-x-0.5 transition-transform" />
              </span>
              <div className="p-1 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
              +{formatCurrency(summary?.totalRevenue ?? 0)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-between">
              <span>Réel : {formatCurrency(summary?.revenueReal ?? 0)}</span>
              <span className="text-primary font-medium underline">Voir détail</span>
            </div>
            {selectedFiscalOffset === 0 && (
              <div className="text-[10px] text-muted-foreground mt-0.5">Prévi : +{formatCurrency(summary?.revenueFuture ?? 0)}</div>
            )}
          </button>

          {/* Encart Charges de l'année en cours */}
          <button
            type="button"
            onClick={onOpenAccountingExpensesDetail}
            className="p-2.5 rounded-lg bg-background border border-border/60 text-left hover:border-rose-500/50 hover:shadow-sm transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-[11px] group-hover:text-foreground transition-colors flex items-center gap-1">
                Charges comptabilisées HT ({selectedFiscalOffset === 0 ? "exercice en cours" : "exercice clôturé"})
                <ChevronRight className="w-3 h-3 opacity-60 group-hover:translate-x-0.5 transition-transform" />
              </span>
              <div className="p-1 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <TrendingDown className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-sm font-semibold text-rose-600 dark:text-rose-400 mt-1">
              -{formatCurrency(summary?.totalExpenses ?? 0)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-between">
              <span>Réel : {formatCurrency(summary?.expensesReal ?? 0)}</span>
              <span className="text-primary font-medium underline">Voir détail</span>
            </div>
            {selectedFiscalOffset === 0 && (
              <div className="text-[10px] text-muted-foreground mt-0.5">Prévi : -{formatCurrency(summary?.expensesFuture ?? 0)}</div>
            )}
          </button>

          {/* This is not statutory net profit: tax, depreciation and adjustments are excluded. */}
          <div className="p-2.5 rounded-lg bg-background border border-border/60">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-[11px]">Solde d&apos;activité estimé HT</span>
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                  (summary?.activityBalance ?? 0) >= 0
                    ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                    : "text-rose-600 dark:text-rose-400 bg-rose-500/10"
                }`}
              >
                {(summary?.activityBalance ?? 0) >= 0 ? "Positif" : "Négatif"}
              </span>
            </div>
            <div
              className={`text-sm font-semibold mt-1 ${
                (summary?.activityBalance ?? 0) >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {(summary?.activityBalance ?? 0) >= 0 ? "+" : ""}
              {formatCurrency(summary?.activityBalance ?? 0)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              Produits moins charges identifiés, hors impôts, amortissements et écritures de clôture
            </div>
          </div>
        </div>

        {chartData && (
          <div className="mt-4">
            <FiscalYearFlowChart data={chartData} embedded />
          </div>
        )}
      </div>
    </section>
  );
}

function formatFiscalYearOption(year: VatYearData): string {
  const startYear = year.vatFiscalSummary.fiscalYear.startDateStr.slice(0, 4);
  const endYear = year.vatFiscalSummary.fiscalYear.endDateStr.slice(0, 4);
  return startYear === endYear ? endYear : `${startYear}-${endYear}`;
}
