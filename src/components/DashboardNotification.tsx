"use client";

import React from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";

export interface DashboardNotificationState {
  type: "success" | "error";
  message: string;
}

interface DashboardNotificationProps {
  notification: DashboardNotificationState | null;
  onDismiss: () => void;
}

export function DashboardNotification({
  notification,
  onDismiss,
}: DashboardNotificationProps) {
  if (!notification) return null;

  return (
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
        onClick={onDismiss}
        className="text-muted-foreground hover:text-foreground font-semibold px-1 cursor-pointer"
      >
        ×
      </button>
    </div>
  );
}
