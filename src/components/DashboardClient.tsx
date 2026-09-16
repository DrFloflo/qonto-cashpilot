"use client";

import React, { useState } from "react";
import { formatCurrency, formatDateTime, formatDate } from "@/lib/utils";
import type { DashboardData } from "@/lib/calculations";
import { CashProjectionChart } from "@/components/CashProjectionChart";
import { FutureFlowsSection } from "@/components/FutureFlowsSection";
import { syncAction } from "@/app/actions";
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Wallet,
  Calendar,
  Percent,
  Receipt,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  X,
} from "lucide-react";

interface DashboardClientProps {
  initialData: DashboardData;
}

type DetailModalType = "revenue" | "expenses" | "vat" | null;

export function DashboardClient({ initialData }: DashboardClientProps) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [isSyncing, setIsSyncing] = useState(false);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [activeModal, setActiveModal] = useState<DetailModalType>(null);

  const handleSync = async () => {
    setIsSyncing(true);
    setNotification(null);
    try {
      const res = await syncAction();
      if (res.updatedData) {
        setData(res.updatedData);
      }
      if (res.success) {
        setNotification({ type: "success", message: res.message });
      } else {
        setNotification({ type: "error", message: res.message });
      }
    } catch (e: unknown) {
      setNotification({
        type: "error",
        message: (e as Error).message || "Erreur de synchronisation",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDataUpdated = (newData: DashboardData) => {
    setData(newData);
  };

  const { account, syncState, kpis, projectionChart, futureFlows } = data;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-foreground text-background flex items-center justify-center font-bold text-base shadow-xs">
              Q
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold text-foreground tracking-tight">
                  Qonto Prévi
                </h1>
                <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded font-mono">
                  {account.name}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Dernière synchronisation :{" "}
                <span className="font-medium text-foreground">
                  {formatDateTime(syncState.lastSyncAt)}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-foreground text-background px-3.5 py-1.5 text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
              {isSyncing ? "Synchronisation..." : "Synchroniser Qonto"}
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Notification banner */}
        {notification && (
          <div
            className={`p-3.5 rounded-lg text-xs flex items-center justify-between gap-2 border ${
              notification.type === "success"
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                : "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20"
            }`}
          >
            <div className="flex items-center gap-2">
              {notification.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              )}
              <span>{notification.message}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-muted-foreground hover:text-foreground font-semibold px-1 cursor-pointer"
            >
              ×
            </button>
          </div>
        )}

        {/* Top KPIs Grid */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Card 1: Trésorerie Actuelle */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between text-muted-foreground mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Trésorerie Actuelle</span>
              <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-foreground tracking-tight">
              {formatCurrency(kpis.currentCash)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Solde en temps réel du compte
            </p>
          </div>

          {/* Card 2: Trésorerie Projetée */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between text-muted-foreground mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Trésorerie Projetée</span>
              <div className="p-1.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <Calendar className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400 tracking-tight">
              {formatCurrency(kpis.projected30d)}
              <span className="text-[11px] font-normal text-muted-foreground ml-1">(30j)</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-2 pt-2 border-t border-border/60">
              <span>À 60j: <strong className="text-foreground">{formatCurrency(kpis.projected60d)}</strong></span>
              <span>À 90j: <strong className="text-foreground">{formatCurrency(kpis.projected90d)}</strong></span>
            </div>
          </div>

          {/* Card 3: TVA à Provisionner (Interactive clickable) */}
          <div
            onClick={() => setActiveModal("vat")}
            className="rounded-xl border border-border bg-card p-4 shadow-xs hover:border-amber-500/50 hover:shadow-sm transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-muted-foreground mb-2">
              <span className="text-xs font-medium uppercase tracking-wider group-hover:text-foreground transition-colors flex items-center gap-1">
                TVA à Provisionner
                <ChevronRight className="w-3.5 h-3.5 opacity-60 group-hover:translate-x-0.5 transition-transform" />
              </span>
              <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Percent className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 tracking-tight">
              {formatCurrency(kpis.vatToProvision)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center justify-between">
              <span>Collectée nette déductible</span>
              <span className="text-primary font-medium underline text-[10px]">Voir détail</span>
            </p>
          </div>

          {/* Card 4: CA du Mois (Interactive clickable) */}
          <div
            onClick={() => setActiveModal("revenue")}
            className="rounded-xl border border-border bg-card p-4 shadow-xs hover:border-emerald-500/50 hover:shadow-sm transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-muted-foreground mb-2">
              <span className="text-xs font-medium uppercase tracking-wider group-hover:text-foreground transition-colors flex items-center gap-1">
                CA du Mois
                <ChevronRight className="w-3.5 h-3.5 opacity-60 group-hover:translate-x-0.5 transition-transform" />
              </span>
              <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tracking-tight">
              {formatCurrency(kpis.monthRevenue)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center justify-between">
              <span>{kpis.monthRevenueItems.length} encaissement(s) ce mois</span>
              <span className="text-primary font-medium underline text-[10px]">Voir détail</span>
            </p>
          </div>

          {/* Card 5: Charges du Mois (Interactive clickable) */}
          <div
            onClick={() => setActiveModal("expenses")}
            className="rounded-xl border border-border bg-card p-4 shadow-xs hover:border-rose-500/50 hover:shadow-sm transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-muted-foreground mb-2">
              <span className="text-xs font-medium uppercase tracking-wider group-hover:text-foreground transition-colors flex items-center gap-1">
                Charges du Mois
                <ChevronRight className="w-3.5 h-3.5 opacity-60 group-hover:translate-x-0.5 transition-transform" />
              </span>
              <div className="p-1.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <TrendingDown className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-rose-600 dark:text-rose-400 tracking-tight">
              {formatCurrency(kpis.monthExpenses)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center justify-between">
              <span>{kpis.monthExpenseItems.length} décaissement(s) ce mois</span>
              <span className="text-primary font-medium underline text-[10px]">Voir détail</span>
            </p>
          </div>
        </section>

        {/* Detailed Breakdown Card (TVA Details) */}
        <section className="rounded-xl border border-border bg-card/60 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Décomposition TVA & Vigilance Fiscale
              </h3>
            </div>
            <button
              onClick={() => setActiveModal("vat")}
              className="text-[11px] text-primary hover:underline font-medium cursor-pointer self-start sm:self-auto"
            >
              Afficher la liste détaillée des lignes de TVA →
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-2.5 rounded-lg bg-background border border-border/60">
              <div className="text-muted-foreground text-[11px]">TVA Réelle Encaissée</div>
              <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                +{formatCurrency(kpis.vatDetails.collectedReal)}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-background border border-border/60">
              <div className="text-muted-foreground text-[11px]">TVA Réelle Décaissée</div>
              <div className="text-sm font-semibold text-rose-600 dark:text-rose-400 mt-0.5">
                -{formatCurrency(kpis.vatDetails.deductibleReal)}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-background border border-border/60">
              <div className="text-muted-foreground text-[11px]">TVA Factures Clients non payées</div>
              <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                +{formatCurrency(kpis.vatDetails.futureToCollect)}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-background border border-border/60">
              <div className="text-muted-foreground text-[11px]">TVA Fournisseurs à payer</div>
              <div className="text-sm font-semibold text-rose-600 dark:text-rose-400 mt-0.5">
                -{formatCurrency(kpis.vatDetails.futureToDeduct)}
              </div>
            </div>
          </div>
        </section>

        {/* Chart Section */}
        <section>
          <CashProjectionChart
            timeframe30d={projectionChart.timeframe30d}
            timeframe60d={projectionChart.timeframe60d}
            timeframe90d={projectionChart.timeframe90d}
            timeframe12m={projectionChart.timeframe12m}
            past7d={projectionChart.past7d}
            past14d={projectionChart.past14d}
            past30d={projectionChart.past30d}
            past90d={projectionChart.past90d}
            currentCash={kpis.currentCash}
          />
        </section>

        {/* Future Flows Management Section */}
        <section>
          <FutureFlowsSection flows={futureFlows} onDataUpdated={handleDataUpdated} />
        </section>
      </main>

      {/* Drill-down Modal (CA du mois, Charges du mois, TVA) */}
      {activeModal && (
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
                onClick={() => setActiveModal(null)}
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
                kpis.vatProvisionItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">Aucune ligne de TVA identifiée pour le calcul.</p>
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
                      {kpis.vatProvisionItems.map((item) => {
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
                )
              )}
            </div>

            {/* Footer Modal */}
            <div className="p-4 border-t border-border/60 bg-muted/20 flex justify-end shrink-0">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
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
