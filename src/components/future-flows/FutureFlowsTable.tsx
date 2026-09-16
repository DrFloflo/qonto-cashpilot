import {
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  Pencil,
  Repeat,
  Sparkles,
  Trash2,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { FutureFlowsTableProps } from "./types";
import { RECURRENCE_LABELS } from "./utils";

export function FutureFlowsTable({
  flows,
  deletingId,
  togglingId,
  onEdit,
  onDelete,
  onToggle,
}: FutureFlowsTableProps) {
  if (flows.length === 0) {
    return (
      <div className="p-12 text-center text-muted-foreground">
        <p className="text-sm">Aucun flux futur enregistré pour l&apos;instant.</p>
        <p className="mt-1 text-xs">
          Ajoutez un flux ponctuel ou récurrent pour enrichir votre simulation de trésorerie.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-border/40 bg-muted/40 font-medium text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Libellé</th>
            <th className="px-4 py-3">Origine</th>
            <th className="px-4 py-3">Catégorie</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3 text-right">Montant HT</th>
            <th className="px-4 py-3 text-right">TVA</th>
            <th className="px-4 py-3 text-right">TTC</th>
            <th className="px-4 py-3">Récurrence</th>
            <th className="px-4 py-3">Actif</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40 text-foreground">
          {flows.map((flow) => {
            const vat = (flow.amountHt * flow.vatRate) / 100;
            const ttc = flow.amountHt + vat;
            const isInflow = flow.type === "inflow";
            const isAutomatic = flow.origin === "automatic";

            return (
              <tr
                key={flow.id}
                className={`transition-colors hover:bg-muted/20 ${!flow.enabled ? "opacity-55" : ""}`}
              >
                <td className="whitespace-nowrap px-4 py-3.5 font-medium text-foreground">
                  {formatDate(flow.date)}
                </td>
                <td className="max-w-[200px] truncate px-4 py-3.5 font-medium text-foreground">
                  {flow.label}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5">
                  {isAutomatic ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-2 py-1 text-[11px] font-medium text-sky-700 dark:text-sky-300">
                      <Sparkles className="h-3 w-3" />
                      Ajout automatique
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Manuel</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5">
                  <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                    {flow.category}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3.5">
                  <span
                    className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium ${
                      isInflow
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {isInflow ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownLeft className="h-3 w-3" />}
                    {isInflow ? "Entrée" : "Sortie"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-right text-muted-foreground">
                  {formatCurrency(flow.amountHt)}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-right text-muted-foreground">
                  {formatCurrency(vat)} ({flow.vatRate}%)
                </td>
                <td
                  className={`whitespace-nowrap px-4 py-3.5 text-right font-semibold ${
                    isInflow
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {isInflow ? "+" : "-"}
                  {formatCurrency(ttc)}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5">
                  {flow.recurrence !== "none" ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                      <Repeat className="h-3 w-3" />
                      {RECURRENCE_LABELS[flow.recurrence] || flow.recurrence}
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Ponctuel</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={flow.enabled}
                    aria-label={`${flow.enabled ? "Désactiver" : "Activer"} le flux ${flow.label}`}
                    title={flow.enabled ? "Désactiver" : "Activer"}
                    disabled={togglingId === flow.id}
                    onClick={() => onToggle(flow)}
                    className={`relative inline-flex h-5 w-9 cursor-pointer items-center rounded-full transition-colors disabled:cursor-wait disabled:opacity-50 ${
                      flow.enabled ? "bg-emerald-500" : "bg-muted-foreground/30"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                        flow.enabled ? "translate-x-4.5" : "translate-x-1"
                      }`}
                    />
                  </button>
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {!isAutomatic && (
                      <button
                        type="button"
                        onClick={() => onEdit(flow)}
                        className="cursor-pointer rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        title="Modifier"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDelete(flow.id)}
                      disabled={deletingId === flow.id}
                      className="cursor-pointer rounded p-1.5 text-rose-500 transition-colors hover:bg-rose-500/10 hover:text-rose-600 disabled:opacity-50"
                      title="Supprimer"
                    >
                      {deletingId === flow.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
