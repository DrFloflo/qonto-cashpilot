"use client";

import React from "react";
import { formatCurrency } from "@/lib/utils";
import type { VatFiscalSummary, VatYearData } from "@/lib/calculations";
import { Receipt, Settings, TrendingUp, TrendingDown, Scale } from "lucide-react";

interface VatFiscalSectionProps {
  summary: VatFiscalSummary | undefined;
  fiscalYears: VatYearData[];
  selectedFiscalOffset: number;
  onOffsetChange: (offset: number) => void;
  onOpenSettings: () => void;
  onOpenVatDetail: () => void;
}

export function VatFiscalSection({
  summary,
  fiscalYears,
  selectedFiscalOffset,
  onOffsetChange,
  onOpenSettings,
  onOpenVatDetail,
}: VatFiscalSectionProps) {
  return (
    <section className="rounded-xl border border-border bg-card/60 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-muted-foreground" />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                TVA sur l&apos;Exercice Fiscal ({summary?.fiscalYear.startDateStr} au {summary?.fiscalYear.endDateStr})
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
              {summary?.fiscalYear.regimeLabel} • Exigibilité {summary?.fiscalYear.paymentMethod === "debits" ? "sur les débits" : "sur encaissements"}
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
          <div className="text-muted-foreground text-[11px]">Total TVA Collectée (Réelle + Prévi)</div>
          <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
            +{formatCurrency(summary?.totalCollected ?? 0)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            Réel: {formatCurrency(summary?.collectedReal ?? 0)}
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-background border border-border/60">
          <div className="text-muted-foreground text-[11px]">Total TVA Déductible (Réelle + Prévi)</div>
          <div className="text-sm font-semibold text-rose-600 dark:text-rose-400 mt-0.5">
            -{formatCurrency(summary?.totalDeductible ?? 0)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            Réel: {formatCurrency(summary?.deductibleReal ?? 0)}
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
          <div className="text-muted-foreground text-[11px]">Solde net de TVA</div>
          <div className={`text-sm font-semibold mt-0.5 ${(summary?.rawBalance ?? 0) >= 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
            {(summary?.rawBalance ?? 0) >= 0 ? "+" : ""}{formatCurrency(summary?.rawBalance ?? 0)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {(summary?.rawBalance ?? 0) >= 0 ? "TVA nette à décaisser" : "Crédit de TVA brut"}
          </div>
        </div>

      </div>

      {/* Encarts Activité : CA et Charges de l'année en cours / exercice */}
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
          {/* Encart CA de l'année en cours */}
          <div className="p-2.5 rounded-lg bg-background border border-border/60">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-[11px]">
                Chiffre d&apos;Affaires ({selectedFiscalOffset === 0 ? "Année en cours" : "Année N-1"})
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
              {selectedFiscalOffset === 0 && (
                <span>Prévi : +{formatCurrency(summary?.revenueFuture ?? 0)}</span>
              )}
            </div>
          </div>

          {/* Encart Charges de l'année en cours */}
          <div className="p-2.5 rounded-lg bg-background border border-border/60">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-[11px]">
                Total des Charges ({selectedFiscalOffset === 0 ? "Exercice en cours" : "Exercice clôturé"})
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
              {selectedFiscalOffset === 0 && (
                <span>Prévi : -{formatCurrency(summary?.expensesFuture ?? 0)}</span>
              )}
            </div>
          </div>

          {/* Encart Résultat Net Estimé */}
          <div className="p-2.5 rounded-lg bg-background border border-border/60">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-[11px]">Résultat Estimé (CA - Charges)</span>
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                  (summary?.netResult ?? 0) >= 0
                    ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                    : "text-rose-600 dark:text-rose-400 bg-rose-500/10"
                }`}
              >
                {(summary?.netResult ?? 0) >= 0 ? "Bénéfice" : "Déficit"}
              </span>
            </div>
            <div
              className={`text-sm font-semibold mt-1 ${
                (summary?.netResult ?? 0) >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {(summary?.netResult ?? 0) >= 0 ? "+" : ""}
              {formatCurrency(summary?.netResult ?? 0)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {summary?.totalRevenue && summary.totalRevenue > 0
                ? `Marge nette : ${Math.round(((summary.netResult ?? 0) / summary.totalRevenue) * 100)}% du CA`
                : "Solde net estimé"}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function formatFiscalYearOption(year: VatYearData): string {
  const startYear = year.vatFiscalSummary.fiscalYear.startDateStr.slice(0, 4);
  const endYear = year.vatFiscalSummary.fiscalYear.endDateStr.slice(0, 4);
  return startYear === endYear ? endYear : `${startYear}-${endYear}`;
}
