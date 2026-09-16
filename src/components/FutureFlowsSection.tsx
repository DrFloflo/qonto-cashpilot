"use client";

import React, { useState } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { FutureFlow } from "@/db/schema";
import type { DashboardData } from "@/lib/calculations";
import {
  createFutureFlowAction,
  updateFutureFlowAction,
  deleteFutureFlowAction,
  toggleFutureFlowAction,
} from "@/app/actions";
import {
  Plus,
  Pencil,
  Trash2,
  ArrowDownLeft,
  ArrowUpRight,
  Repeat,
  X,
  Loader2,
  Sparkles,
} from "lucide-react";

const CATEGORIES_INFLOW = ["CA / Vente", "Autre entrée"];
const CATEGORIES_OUTFLOW = [
  "Salaires",
  "URSSAF",
  "Loyer",
  "Fournisseur",
  "Abonnement",
  "Impôt / taxe",
  "Autre charge",
];

const RECURRENCE_LABELS: Record<string, string> = {
  none: "Ponctuel",
  monthly: "Mensuel",
  quarterly: "Trimestriel",
  yearly: "Annuel",
};

interface FutureFlowsSectionProps {
  flows: FutureFlow[];
  onDataUpdated?: (newData: DashboardData) => void;
}

export function FutureFlowsSection({ flows, onDataUpdated }: FutureFlowsSectionProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFlow, setEditingFlow] = useState<FutureFlow | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Form State
  const [type, setType] = useState<"inflow" | "outflow">("outflow");
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("Fournisseur");
  const [amountHt, setAmountHt] = useState<number | "">("");
  const [vatRate, setVatRate] = useState<number>(20);
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [recurrence, setRecurrence] = useState<"none" | "monthly" | "quarterly" | "yearly">("none");

  const computedHt = typeof amountHt === "number" ? amountHt : 0;
  const computedVat = (computedHt * vatRate) / 100;
  const computedTtc = computedHt + computedVat;

  const openCreateModal = () => {
    setEditingFlow(null);
    setType("outflow");
    setLabel("");
    setCategory("Fournisseur");
    setAmountHt("");
    setVatRate(20);
    setDate(new Date().toISOString().split("T")[0]);
    setRecurrence("none");
    setIsModalOpen(true);
  };

  const openEditModal = (flow: FutureFlow) => {
    setEditingFlow(flow);
    setType(flow.type as "inflow" | "outflow");
    setLabel(flow.label);
    setCategory(flow.category);
    setAmountHt(flow.amountHt);
    setVatRate(flow.vatRate);
    setDate(flow.date);
    setRecurrence(flow.recurrence as "none" | "monthly" | "quarterly" | "yearly");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingFlow(null);
  };

  const handleTypeChange = (newType: "inflow" | "outflow") => {
    setType(newType);
    if (newType === "inflow") {
      setCategory("CA / Vente");
    } else {
      setCategory("Fournisseur");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || computedHt <= 0) return;

    setIsSubmitting(true);
    try {
      if (editingFlow) {
        const res = await updateFutureFlowAction(editingFlow.id, {
          label,
          type,
          category,
          amountHt: computedHt,
          vatRate,
          date,
          recurrence,
        });
        if (res.updatedData && onDataUpdated) {
          onDataUpdated(res.updatedData);
        }
      } else {
        const res = await createFutureFlowAction({
          label,
          type,
          category,
          amountHt: computedHt,
          vatRate,
          date,
          recurrence,
        });
        if (res.updatedData && onDataUpdated) {
          onDataUpdated(res.updatedData);
        }
      }
      closeModal();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce flux prévisionnel ?")) return;
    setDeletingId(id);
    try {
      const res = await deleteFutureFlowAction(id);
      if (res.updatedData && onDataUpdated) {
        onDataUpdated(res.updatedData);
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggle = async (flow: FutureFlow) => {
    setTogglingId(flow.id);
    try {
      const res = await toggleFutureFlowAction(flow.id, !flow.enabled);
      if (res.updatedData && onDataUpdated) {
        onDataUpdated(res.updatedData);
      }
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-6 border-b border-border/60 gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">
            Flux Futurs & Prévisionnels
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Flux manuels et récurrences détectées automatiquement à partir de deux opérations mensuelles identiques
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-foreground text-background px-4 py-2 text-xs font-semibold hover:opacity-90 transition-opacity self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Ajouter un flux
        </button>
      </div>

      {flows.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground">
          <p className="text-sm">Aucun flux futur enregistré pour l&apos;instant.</p>
          <p className="text-xs mt-1">
            Ajoutez un flux ponctuel ou récurrent pour enrichir votre simulation de trésorerie.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 text-muted-foreground border-b border-border/40 font-medium">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Libellé</th>
                <th className="py-3 px-4">Origine</th>
                <th className="py-3 px-4">Catégorie</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4 text-right">Montant HT</th>
                <th className="py-3 px-4 text-right">TVA</th>
                <th className="py-3 px-4 text-right">TTC</th>
                <th className="py-3 px-4">Récurrence</th>
                <th className="py-3 px-4">Actif</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 text-foreground">
              {flows.map((flow) => {
                const vat = (flow.amountHt * flow.vatRate) / 100;
                const ttc = flow.amountHt + vat;
                const isInflow = flow.type === "inflow";
                const isAutomatic = flow.origin === "automatic";

                return (
                  <tr key={flow.id} className={`hover:bg-muted/20 transition-colors ${!flow.enabled ? "opacity-55" : ""}`}>
                    <td className="py-3.5 px-4 whitespace-nowrap font-medium text-foreground">
                      {formatDate(flow.date)}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-foreground max-w-[200px] truncate">
                      {flow.label}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {isAutomatic ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-2 py-1 text-[11px] font-medium text-sky-700 dark:text-sky-300">
                          <Sparkles className="h-3 w-3" />
                          Ajout automatique
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">Manuel</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                        {flow.category}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 font-medium px-2 py-0.5 rounded text-[11px] ${
                          isInflow
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {isInflow ? (
                          <ArrowUpRight className="w-3 h-3" />
                        ) : (
                          <ArrowDownLeft className="w-3 h-3" />
                        )}
                        {isInflow ? "Entrée" : "Sortie"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap text-muted-foreground">
                      {formatCurrency(flow.amountHt)}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap text-muted-foreground">
                      {formatCurrency(vat)} ({flow.vatRate}%)
                    </td>
                    <td
                      className={`py-3.5 px-4 text-right font-semibold whitespace-nowrap ${
                        isInflow
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {isInflow ? "+" : "-"}
                      {formatCurrency(ttc)}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {flow.recurrence !== "none" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                          <Repeat className="w-3 h-3" />
                          {RECURRENCE_LABELS[flow.recurrence] || flow.recurrence}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">Ponctuel</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={flow.enabled}
                        aria-label={`${flow.enabled ? "Désactiver" : "Activer"} le flux ${flow.label}`}
                        title={flow.enabled ? "Désactiver" : "Activer"}
                        disabled={togglingId === flow.id}
                        onClick={() => handleToggle(flow)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer disabled:cursor-wait disabled:opacity-50 ${
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
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        {!isAutomatic && (
                          <button
                            onClick={() => openEditModal(flow)}
                            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                            title="Modifier"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(flow.id)}
                          disabled={deletingId === flow.id}
                          className="p-1.5 rounded text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer disabled:opacity-50"
                          title="Supprimer"
                        >
                          {deletingId === flow.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
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
      )}

      {/* Modal / Dialog Form for Add & Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-card border border-border w-full max-w-lg rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-5 border-b border-border/60">
              <h3 className="text-base font-semibold text-foreground">
                {editingFlow ? "Modifier le flux futur" : "Ajouter un flux futur"}
              </h3>
              <button
                onClick={closeModal}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* Type Switcher */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">Type de flux</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleTypeChange("inflow")}
                    className={`py-2 px-3 text-xs font-medium rounded-lg border flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                      type === "inflow"
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    Entrée (Encaissement)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTypeChange("outflow")}
                    className={`py-2 px-3 text-xs font-medium rounded-lg border flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                      type === "outflow"
                        ? "border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <ArrowDownLeft className="w-3.5 h-3.5" />
                    Sortie (Décaissement)
                  </button>
                </div>
              </div>

              {/* Libellé */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Libellé</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Abonnement SaaS, URSSAF, Facture client..."
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Catégorie & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Catégorie</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary"
                  >
                    {(type === "inflow" ? CATEGORIES_INFLOW : CATEGORIES_OUTFLOW).map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Date d&apos;effet</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Montant HT & Taux TVA */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Montant HT (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="1000.00"
                    value={amountHt}
                    onChange={(e) => setAmountHt(e.target.value === "" ? "" : parseFloat(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Taux TVA</label>
                  <select
                    value={vatRate}
                    onChange={(e) => setVatRate(parseFloat(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary"
                  >
                    <option value={20}>20 % (Standard)</option>
                    <option value={10}>10 % (Intermédiaire)</option>
                    <option value={5.5}>5.5 % (Réduit)</option>
                    <option value={2.1}>2.1 % (Super réduit)</option>
                    <option value={0}>0 % (Exonéré / URSSAF / Salaires)</option>
                  </select>
                </div>
              </div>

              {/* Récurrence */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Récurrence</label>
                <select
                  value={recurrence}
                  onChange={(e) => setRecurrence(e.target.value as "none" | "monthly" | "quarterly" | "yearly")}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary"
                >
                  <option value="none">Aucune (Ponctuel)</option>
                  <option value="monthly">Mensuelle</option>
                  <option value="quarterly">Trimestrielle</option>
                  <option value="yearly">Annuelle</option>
                </select>
              </div>

              {/* Realtime Live Calculation Summary */}
              <div className="rounded-lg bg-muted/60 p-3 text-xs space-y-1 border border-border/50">
                <div className="flex justify-between text-muted-foreground">
                  <span>Montant HT :</span>
                  <span className="font-mono">{formatCurrency(computedHt)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>TVA ({vatRate}%) :</span>
                  <span className="font-mono">{formatCurrency(computedVat)}</span>
                </div>
                <div className="flex justify-between font-semibold text-foreground pt-1 border-t border-border/60">
                  <span>Total TTC (Impact Trésorerie) :</span>
                  <span className={`font-mono ${type === "inflow" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                    {type === "inflow" ? "+" : "-"}{formatCurrency(computedTtc)}
                  </span>
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !label.trim() || computedHt <= 0}
                  className="rounded-lg bg-foreground text-background px-4 py-2 text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {editingFlow ? "Enregistrer" : "Créer le flux"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
