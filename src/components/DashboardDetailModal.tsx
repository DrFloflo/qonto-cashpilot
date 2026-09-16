"use client";

import React from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { DashboardData, VatItem, VatFiscalSummary, VatYearData } from "@/lib/calculations";
import type { DetailModalType } from "@/components/DashboardKpiCards";
import { X, Settings } from "lucide-react";

interface DashboardDetailModalProps {
  activeModal: DetailModalType;
  onClose: () => void;
  kpis: DashboardData["kpis"];
  currentVatSummary: VatFiscalSummary | undefined;
  currentVatItems: VatItem[];
  fiscalYears: VatYearData[];
  selectedFiscalOffset: number;
  onOffsetChange: (offset: number) => void;
  onOpenSettings: () => void;
}

export function DashboardDetailModal({
  activeModal,
  onClose,
  kpis,
  currentVatSummary,
  currentVatItems,
  fiscalYears,
  selectedFiscalOffset,
  onOffsetChange,
  onOpenSettings,
}: DashboardDetailModalProps) {
  if (!activeModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="bg-card border border-border w-full max-w-3xl rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
        {/* Header Modal */}
        <div className="flex items-center justify-between p-5 border-b border-border/60 shrink-0">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              {activeModal === "revenue" && "Détail du Chiffre d'Affaires du Mois (Encaissements)"}
              {activeModal === "expenses" && "Détail des Charges du Mois (Décaissements)"}
              {activeModal === "vat" && "Détail de la TVA à Provisionner"}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {activeModal === "revenue" && `Total encaissé : ${formatCurrency(kpis.monthRevenue)} (${kpis.monthRevenueItems.length} ligne(s))`}
              {activeModal === "expenses" && `Total décaissé : ${formatCurrency(kpis.monthExpenses)} (${kpis.monthExpenseItems.length} ligne(s))`}
              {activeModal === "vat" && `Estimation nette : ${formatCurrency(kpis.vatToProvision)} (${kpis.vatProvisionItems.length} élément(s))`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="overflow-y-auto p-5 grow">
          {activeModal === "revenue" && (
            kpis.monthRevenueItems.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Aucun encaissement enregistré pour ce mois.</p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 text-muted-foreground border-b border-border/40 font-medium">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Libellé</th>
                    <th className="py-2.5 px-3">Catégorie</th>
                    <th className="py-2.5 px-3 text-right">Montant Encaissé</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {kpis.monthRevenueItems.map((tx) => (
                    <tr key={tx.id} className="hover:bg-muted/20">
                      <td className="py-2.5 px-3 whitespace-nowrap">{formatDate(tx.settledAt)}</td>
                      <td className="py-2.5 px-3 font-medium">{tx.label}</td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-muted-foreground">{tx.category}</td>
                      <td className="py-2.5 px-3 text-right font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        +{formatCurrency(Math.abs(tx.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}

          {activeModal === "expenses" && (
            kpis.monthExpenseItems.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Aucun décaissement enregistré pour ce mois.</p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 text-muted-foreground border-b border-border/40 font-medium">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Libellé</th>
                    <th className="py-2.5 px-3">Catégorie</th>
                    <th className="py-2.5 px-3 text-right">Montant Décaissé</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {kpis.monthExpenseItems.map((tx) => (
                    <tr key={tx.id} className="hover:bg-muted/20">
                      <td className="py-2.5 px-3 whitespace-nowrap">{formatDate(tx.settledAt)}</td>
                      <td className="py-2.5 px-3 font-medium">{tx.label}</td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-muted-foreground">{tx.category}</td>
                      <td className="py-2.5 px-3 text-right font-semibold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                        -{formatCurrency(Math.abs(tx.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}

          {activeModal === "vat" && (
            <div className="space-y-4">
              {/* Fiscal summary banner with fiscal-year selector */}
              <div className="p-3.5 rounded-lg border border-border/80 bg-muted/30 text-xs space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-border/60">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="font-semibold text-foreground">
                        {currentVatSummary?.fiscalYear.label}
                      </div>
                      <select
                        value={selectedFiscalOffset}
                        onChange={(event) => onOffsetChange(Number(event.target.value))}
                        aria-label="Sélectionner un exercice fiscal"
                        className="rounded-md bg-background border border-border/60 px-2 py-1 text-[10px] font-medium text-foreground"
                      >
                        {fiscalYears.map((year) => (
                          <option key={year.offset} value={year.offset}>
                            {formatFiscalYearOption(year)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {currentVatSummary?.fiscalYear.regimeLabel} • Exigibilité {currentVatSummary?.fiscalYear.paymentMethod === "debits" ? "sur les débits" : "sur les encaissements"}
                      {selectedFiscalOffset < 0 && " (Exercice clôturé)"}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      onClose();
                      onOpenSettings();
                    }}
                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium cursor-pointer self-start sm:self-auto"
                  >
                    <Settings className="w-3 h-3" />
                    Changer les paramètres
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="text-[11px] text-muted-foreground block">Total Collectée</span>
                    <strong className="text-emerald-600 dark:text-emerald-400">
                      +{formatCurrency(currentVatSummary?.totalCollected ?? 0)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground block">Total Déductible</span>
                    <strong className="text-rose-600 dark:text-rose-400">
                      -{formatCurrency(currentVatSummary?.totalDeductible ?? 0)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground block">Crédit antérieur imputé</span>
                    <strong className="text-blue-600 dark:text-blue-400">
                      -{formatCurrency(currentVatSummary?.openingVatCredit ?? 0)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground block">Solde net</span>
                    <strong className={(currentVatSummary?.rawBalance ?? 0) >= 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}>
                      {(currentVatSummary?.rawBalance ?? 0) >= 0 ? "+" : ""}{formatCurrency(currentVatSummary?.rawBalance ?? 0)}
                    </strong>
                  </div>
                </div>
              </div>

              {currentVatItems.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">Aucune ligne de TVA identifiée pour cet exercice fiscal ({currentVatSummary?.fiscalYear.startDateStr} au {currentVatSummary?.fiscalYear.endDateStr}).</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 text-muted-foreground border-b border-border/40 font-medium">
                    <tr>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Origine</th>
                      <th className="py-2.5 px-3">Libellé</th>
                      <th className="py-2.5 px-3 text-right">Base HT</th>
                      <th className="py-2.5 px-3 text-right">TVA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {currentVatItems.map((item) => {
                      const isCollectee = item.type === "collectee";
                      return (
                        <tr key={item.id} className="hover:bg-muted/20">
                          <td className="py-2.5 px-3 whitespace-nowrap">{formatDate(item.date)}</td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="inline-flex text-[10px] rounded px-1.5 py-0.5 bg-muted text-muted-foreground">
                              {item.source}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-medium max-w-[220px] truncate">{item.label}</td>
                          <td className="py-2.5 px-3 text-right text-muted-foreground whitespace-nowrap">
                            {formatCurrency(item.amountHt)}
                          </td>
                          <td className={`py-2.5 px-3 text-right font-semibold whitespace-nowrap ${isCollectee ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                            {isCollectee ? "+" : "-"}{formatCurrency(item.vatAmount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* Footer Modal */}
        <div className="p-4 border-t border-border/60 bg-muted/20 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

function formatFiscalYearOption(year: VatYearData): string {
  const startYear = year.vatFiscalSummary.fiscalYear.startDateStr.slice(0, 4);
  const endYear = year.vatFiscalSummary.fiscalYear.endDateStr.slice(0, 4);
  return startYear === endYear ? endYear : `${startYear}-${endYear}`;
}
