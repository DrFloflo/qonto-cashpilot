"use client";

import React, { useState } from "react";
import type { AppSettings } from "@/db/schema";
import type { DashboardData } from "@/lib/calculations";
import { saveSettingsAction } from "@/app/actions";
import { X, Settings, Calendar, HelpCircle, Check, Loader2 } from "lucide-react";

interface FiscalSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaved: (newData: DashboardData) => void;
}

const MONTHS = [
  { value: 1, label: "Janvier" },
  { value: 2, label: "Février" },
  { value: 3, label: "Mars" },
  { value: 4, label: "Avril" },
  { value: 5, label: "Mai" },
  { value: 6, label: "Juin" },
  { value: 7, label: "Juillet" },
  { value: 8, label: "Août" },
  { value: 9, label: "Septembre" },
  { value: 10, label: "Octobre" },
  { value: 11, label: "Novembre" },
  { value: 12, label: "Décembre" },
];

export function FiscalSettingsModal({
  isOpen,
  onClose,
  settings,
  onSaved,
}: FiscalSettingsModalProps) {
  const [endDay, setEndDay] = useState(settings.fiscalYearEndDay || 31);
  const [endMonth, setEndMonth] = useState(settings.fiscalYearEndMonth || 12);
  const [vatRegime, setVatRegime] = useState<"normal_monthly" | "normal_quarterly" | "simplified">(
    (settings.vatRegime as "normal_monthly" | "normal_quarterly" | "simplified") || "normal_monthly"
  );
  const [vatPaymentMethod, setVatPaymentMethod] = useState<"debits" | "encaissements">(
    (settings.vatPaymentMethod as "debits" | "encaissements") || "debits"
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const res = await saveSettingsAction({
        fiscalYearEndDay: Number(endDay),
        fiscalYearEndMonth: Number(endMonth),
        vatRegime,
        vatPaymentMethod,
      });

      if (res.success && res.updatedData) {
        onSaved(res.updatedData);
        onClose();
      }
    } catch (err: unknown) {
      setError((err as Error).message || "Erreur lors de la sauvegarde des paramètres");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-border/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Paramètres Fiscaux</h2>
              <p className="text-xs text-muted-foreground">Configuration de l&apos;exercice et du régime de TVA</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-lg text-xs bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
              {error}
            </div>
          )}

          {/* Date de clôture de l'exercice fiscal */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-primary" />
              Date de clôture d&apos;exercice fiscal
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Jour</label>
                <select
                  value={endDay}
                  onChange={(e) => setEndDay(Number(e.target.value))}
                  className="w-full h-9 px-3 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary cursor-pointer"
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Mois</label>
                <select
                  value={endMonth}
                  onChange={(e) => setEndMonth(Number(e.target.value))}
                  className="w-full h-9 px-3 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary cursor-pointer"
                >
                  {MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Exemple : <span className="font-medium text-foreground">31 Décembre</span> pour une année civile classique, ou <span className="font-medium text-foreground">30 Juin</span> pour un exercice décalé.
            </p>
          </div>

          {/* Régime fiscal de TVA */}
          <div className="space-y-2 pt-2 border-t border-border/60">
            <label className="text-xs font-semibold text-foreground uppercase tracking-wider block">
              Régime d&apos;imposition à la TVA
            </label>
            <div className="space-y-2">
              <label className={`flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer ${vatRegime === "normal_monthly" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/20"}`}>
                <input
                  type="radio"
                  name="vatRegime"
                  value="normal_monthly"
                  checked={vatRegime === "normal_monthly"}
                  onChange={() => setVatRegime("normal_monthly")}
                  className="mt-0.5 accent-primary"
                />
                <div className="text-xs">
                  <span className="font-semibold text-foreground block">Régime Réel Normal (Mensuel - CA3)</span>
                  <span className="text-[11px] text-muted-foreground block mt-0.5">
                    Déclaration mensuelle. Remboursement du crédit de TVA si solde ≥ 760 €, sinon reporté automatiquement sur le mois suivant.
                  </span>
                </div>
              </label>

              <label className={`flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer ${vatRegime === "normal_quarterly" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/20"}`}>
                <input
                  type="radio"
                  name="vatRegime"
                  value="normal_quarterly"
                  checked={vatRegime === "normal_quarterly"}
                  onChange={() => setVatRegime("normal_quarterly")}
                  className="mt-0.5 accent-primary"
                />
                <div className="text-xs">
                  <span className="font-semibold text-foreground block">Régime Réel Normal (Trimestriel)</span>
                  <span className="text-[11px] text-muted-foreground block mt-0.5">
                    Déclaration trimestrielle (si TVA nette annuelle &lt; 4 000 €). Seuil de remboursement à 760 €.
                  </span>
                </div>
              </label>

              <label className={`flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer ${vatRegime === "simplified" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/20"}`}>
                <input
                  type="radio"
                  name="vatRegime"
                  value="simplified"
                  checked={vatRegime === "simplified"}
                  onChange={() => setVatRegime("simplified")}
                  className="mt-0.5 accent-primary"
                />
                <div className="text-xs">
                  <span className="font-semibold text-foreground block">Régime Réel Simplifié (RSI - Acomptes + CA12)</span>
                  <span className="text-[11px] text-muted-foreground block mt-0.5">
                    2 acomptes semestriels (juillet 55%, décembre 40%) et solde liquidé sur la déclaration annuelle CA12 (seuil de remboursement à 150 €).
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Méthode d'exigibilité de TVA */}
          <div className="space-y-2 pt-2 border-t border-border/60">
            <label className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Exigibilité de la TVA</span>
              <span className="text-[10px] text-muted-foreground lowercase font-normal flex items-center gap-1">
                <HelpCircle className="w-3 h-3" /> par défaut
              </span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setVatPaymentMethod("debits")}
                className={`p-2.5 rounded-lg border text-left text-xs transition-all cursor-pointer ${vatPaymentMethod === "debits" ? "border-primary bg-primary/5 font-semibold text-foreground" : "border-border text-muted-foreground hover:bg-muted/20"}`}
              >
                <div className="font-medium">Sur les débits</div>
                <div className="text-[10px] text-muted-foreground font-normal mt-0.5">Ventes de marchandises / option débits</div>
              </button>

              <button
                type="button"
                onClick={() => setVatPaymentMethod("encaissements")}
                className={`p-2.5 rounded-lg border text-left text-xs transition-all cursor-pointer ${vatPaymentMethod === "encaissements" ? "border-primary bg-primary/5 font-semibold text-foreground" : "border-border text-muted-foreground hover:bg-muted/20"}`}
              >
                <div className="font-medium">Sur les encaissements</div>
                <div className="text-[10px] text-muted-foreground font-normal mt-0.5">Prestations de services standard</div>
              </button>
            </div>
          </div>

          {/* Footer actions */}
          <div className="pt-4 border-t border-border/80 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium rounded-lg border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 shadow-xs"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Sauvegarde...
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Enregistrer les paramètres
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
