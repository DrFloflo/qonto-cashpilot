"use client";

import React from "react";
import { formatDateTime } from "@/lib/utils";
import { RefreshCw, Settings } from "lucide-react";

interface DashboardHeaderProps {
  accountName: string;
  lastSyncAt: string | null;
  isSyncing: boolean;
  onOpenSettings: () => void;
  onSync: () => void;
}

export function DashboardHeader({
  accountName,
  lastSyncAt,
  isSyncing,
  onOpenSettings,
  onSync,
}: DashboardHeaderProps) {
  return (
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
                {accountName}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Dernière synchronisation :{" "}
              <span className="font-medium text-foreground">
                {formatDateTime(lastSyncAt)}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
          <button
            onClick={onOpenSettings}
            title="Paramètres fiscaux (date de clôture, régime TVA)"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/70 transition-colors cursor-pointer shadow-xs"
          >
            <Settings className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Paramètres</span>
          </button>
          <button
            onClick={onSync}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 rounded-lg bg-foreground text-background px-3.5 py-1.5 text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Synchronisation..." : "Synchroniser Qonto"}
          </button>
        </div>
      </div>
    </header>
  );
}
