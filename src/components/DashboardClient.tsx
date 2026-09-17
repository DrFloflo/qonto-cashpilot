"use client";

import React, { useState } from "react";
import type { DashboardData } from "@/lib/calculations";
import { CashProjectionChart } from "@/components/CashProjectionChart";
import { FutureFlowsSection } from "@/components/FutureFlowsSection";
import { FiscalSettingsModal } from "@/components/FiscalSettingsModal";
import { DashboardHeader } from "@/components/DashboardHeader";
import { DashboardNotification, type DashboardNotificationState } from "@/components/DashboardNotification";
import { DashboardKpiCards, type DetailModalType } from "@/components/DashboardKpiCards";
import { VatFiscalSection } from "@/components/VatFiscalSection";
import { DashboardDetailModal } from "@/components/DashboardDetailModal";
import { ExpenseSection } from "@/components/ExpenseSection";
import { syncAction } from "@/app/actions";
import { LayoutDashboard, Receipt } from "lucide-react";

interface DashboardClientProps {
  initialData: DashboardData;
}

export function DashboardClient({ initialData }: DashboardClientProps) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [notification, setNotification] = useState<DashboardNotificationState | null>(null);
  const [activeModal, setActiveModal] = useState<DetailModalType>(null);
  const [selectedFiscalOffset, setSelectedFiscalOffset] = useState(0);
  const [activeTab, setActiveTab] = useState<"dashboard" | "expenses">("dashboard");

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

  const { account, syncState, kpis, projectionChart, fiscalYearCharts, futureFlows } = data;

  const selectedVatYear =
    kpis.vatFiscalYears.find((year) => year.offset === selectedFiscalOffset)
    ?? kpis.vatFiscalYears[0];
  const currentVatSummary = selectedVatYear?.vatFiscalSummary ?? kpis.vatFiscalSummary;
  const currentVatItems = selectedVatYear?.vatProvisionItems ?? kpis.vatProvisionItems;
  const selectedFiscalChart = fiscalYearCharts.find((year) => year.offset === selectedFiscalOffset)?.data
    ?? fiscalYearCharts[0]?.data;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <DashboardHeader
        accountName={account.name}
        lastSyncAt={syncState.lastSyncAt}
        isSyncing={isSyncing}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onSync={handleSync}
      />

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Notification banner */}
        <DashboardNotification
          notification={notification}
          onDismiss={() => setNotification(null)}
        />

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-border/80 pb-3">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === "dashboard"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            Trésorerie & Prévisions
          </button>
          <button
            onClick={() => setActiveTab("expenses")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === "expenses"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            <Receipt className="w-4 h-4" />
            Notes de Frais & IK
          </button>
        </div>

        {activeTab === "dashboard" ? (
          <>
            {/* Top KPIs Grid */}
            <DashboardKpiCards
              kpis={kpis}
              onOpenModal={(modalType) => setActiveModal(modalType)}
            />

            {/* Detailed Breakdown Card (TVA Details) */}
            <VatFiscalSection
              summary={currentVatSummary}
              fiscalYears={kpis.vatFiscalYears}
              chartData={selectedFiscalChart}
              selectedFiscalOffset={selectedFiscalOffset}
              onOffsetChange={setSelectedFiscalOffset}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenVatDetail={() => setActiveModal("vat")}
            />

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
          </>
        ) : (
          <section>
            <ExpenseSection onDataUpdated={handleDataUpdated} />
          </section>
        )}
      </main>

      {/* Drill-down Modal (CA du mois, Charges du mois, TVA) */}
      <DashboardDetailModal
        activeModal={activeModal}
        onClose={() => setActiveModal(null)}
        kpis={kpis}
        currentVatSummary={currentVatSummary}
        currentVatItems={currentVatItems}
        fiscalYears={kpis.vatFiscalYears}
        selectedFiscalOffset={selectedFiscalOffset}
        onOffsetChange={setSelectedFiscalOffset}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Fiscal Settings Modal */}
      {data.settings && (
        <FiscalSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settings={data.settings}
          onSaved={handleDataUpdated}
        />
      )}
    </div>
  );
}
