"use client";

import React from "react";
import { formatCurrency } from "@/lib/utils";
import type { DashboardData } from "@/lib/calculations";
import {
  Wallet,
  Calendar,
  Percent,
  TrendingUp,
  TrendingDown,
  ChevronRight,
} from "lucide-react";

export type DetailModalType = "revenue" | "expenses" | "vat" | "accountingRevenue" | "accountingExpenses" | null;

interface DashboardKpiCardsProps {
  kpis: DashboardData["kpis"];
  onOpenModal: (type: DetailModalType) => void;
}

export function DashboardKpiCards({ kpis, onOpenModal }: DashboardKpiCardsProps) {
  const { vatFiscalSummary } = kpis;

  return (
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

      {/* Card 3: TVA à Provisionner / Crédit (Interactive clickable) */}
      <div
        onClick={() => onOpenModal("vat")}
        className="rounded-xl border border-border bg-card p-4 shadow-xs hover:border-amber-500/50 hover:shadow-sm transition-all cursor-pointer group"
      >
        <div className="flex items-center justify-between text-muted-foreground mb-2">
          <span className="text-xs font-medium uppercase tracking-wider group-hover:text-foreground transition-colors flex items-center gap-1">
            {vatFiscalSummary?.status === "credit_eligible"
              ? "Crédit TVA Éligible"
              : vatFiscalSummary?.status === "credit_carried_over"
              ? "Crédit TVA Reporté"
              : "TVA à Provisionner"}
            <ChevronRight className="w-3.5 h-3.5 opacity-60 group-hover:translate-x-0.5 transition-transform" />
          </span>
          <div
            className={`p-1.5 rounded-md ${
              vatFiscalSummary?.status === "credit_eligible"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : vatFiscalSummary?.status === "credit_carried_over"
                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
            }`}
          >
            <Percent className="w-4 h-4" />
          </div>
        </div>
        <div
          className={`text-2xl font-bold tracking-tight ${
            vatFiscalSummary?.status === "credit_eligible"
              ? "text-emerald-600 dark:text-emerald-400"
              : vatFiscalSummary?.status === "credit_carried_over"
              ? "text-blue-600 dark:text-blue-400"
              : "text-amber-600 dark:text-amber-400"
          }`}
        >
          {vatFiscalSummary?.status === "credit_eligible"
            ? `-${formatCurrency(vatFiscalSummary.refundableVat)}`
            : vatFiscalSummary?.status === "credit_carried_over"
            ? formatCurrency(vatFiscalSummary.carriedOverVat)
            : formatCurrency(kpis.vatToProvision)}
        </div>
        <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center justify-between">
          <span className="truncate max-w-[160px]" title={vatFiscalSummary?.statusLabel || "Solde exercice fiscal"}>
            {vatFiscalSummary?.status === "credit_carried_over"
              ? `Reporté (< ${vatFiscalSummary.threshold} €)`
              : vatFiscalSummary?.status === "credit_eligible"
              ? `Demande possible (≥ ${vatFiscalSummary.threshold} €)`
              : "TVA réelle de l'exercice"}
          </span>
          <span className="text-primary font-medium underline text-[10px]">Voir détail</span>
        </p>
      </div>

      {/* Card 4: Encaissements bancaires du mois */}
      <div
        onClick={() => onOpenModal("revenue")}
        className="rounded-xl border border-border bg-card p-4 shadow-xs hover:border-emerald-500/50 hover:shadow-sm transition-all cursor-pointer group"
      >
        <div className="flex items-center justify-between text-muted-foreground mb-2">
          <span className="text-xs font-medium uppercase tracking-wider group-hover:text-foreground transition-colors flex items-center gap-1">
            Encaissements du mois
            <ChevronRight className="w-3.5 h-3.5 opacity-60 group-hover:translate-x-0.5 transition-transform" />
          </span>
          <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tracking-tight">
          {formatCurrency(kpis.monthInflows)}
        </div>
        <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center justify-between">
          <span>{kpis.monthInflowItems.length} mouvement(s) bancaire(s)</span>
          <span className="text-primary font-medium underline text-[10px]">Voir détail</span>
        </p>
      </div>

      {/* Card 5: Décaissements bancaires du mois */}
      <div
        onClick={() => onOpenModal("expenses")}
        className="rounded-xl border border-border bg-card p-4 shadow-xs hover:border-rose-500/50 hover:shadow-sm transition-all cursor-pointer group"
      >
        <div className="flex items-center justify-between text-muted-foreground mb-2">
          <span className="text-xs font-medium uppercase tracking-wider group-hover:text-foreground transition-colors flex items-center gap-1">
            Décaissements du mois
            <ChevronRight className="w-3.5 h-3.5 opacity-60 group-hover:translate-x-0.5 transition-transform" />
          </span>
          <div className="p-1.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400">
            <TrendingDown className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl font-bold text-rose-600 dark:text-rose-400 tracking-tight">
          {formatCurrency(kpis.monthOutflows)}
        </div>
        <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center justify-between">
          <span>{kpis.monthOutflowItems.length} mouvement(s) bancaire(s)</span>
          <span className="text-primary font-medium underline text-[10px]">Voir détail</span>
        </p>
      </div>
    </section>
  );
}
