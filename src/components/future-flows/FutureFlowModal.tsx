import type { FormEvent } from "react";
import { ArrowDownLeft, ArrowUpRight, Loader2, X } from "lucide-react";
import type { FutureFlow } from "@/db/schema";
import { formatCurrency } from "@/lib/utils";
import type { FutureFlowFormSetter, FutureFlowFormState } from "./types";
import { CATEGORIES_INFLOW, CATEGORIES_OUTFLOW, calculateFlowAmounts } from "./utils";

interface FutureFlowModalProps {
  editingFlow: FutureFlow | null;
  form: FutureFlowFormState;
  isSubmitting: boolean;
  onChange: FutureFlowFormSetter;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}

const fieldClassName =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary";

export function FutureFlowModal({
  editingFlow,
  form,
  isSubmitting,
  onChange,
  onClose,
  onSubmit,
}: FutureFlowModalProps) {
  const { ht, vat, ttc } = calculateFlowAmounts(form.amountHt, form.vatRate);
  const categories = form.type === "inflow" ? CATEGORIES_INFLOW : CATEGORIES_OUTFLOW;

  const changeType = (type: FutureFlowFormState["type"]) => {
    onChange("type", type);
    onChange("category", type === "inflow" ? "CA / Vente" : "Fournisseur");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="animate-in fade-in zoom-in-95 w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-xl duration-150">
        <div className="flex items-center justify-between border-b border-border/60 p-5">
          <h3 className="text-base font-semibold text-foreground">
            {editingFlow ? "Modifier le flux futur" : "Ajouter un flux futur"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">Type de flux</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => changeType("inflow")}
                className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  form.type === "inflow"
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
                Entrée (Encaissement)
              </button>
              <button
                type="button"
                onClick={() => changeType("outflow")}
                className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  form.type === "outflow"
                    ? "border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                <ArrowDownLeft className="h-3.5 w-3.5" />
                Sortie (Décaissement)
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="future-flow-label" className="mb-1 block text-xs font-medium text-foreground">
              Libellé
            </label>
            <input
              id="future-flow-label"
              type="text"
              required
              placeholder="Ex: Abonnement SaaS, URSSAF, Facture client..."
              value={form.label}
              onChange={(event) => onChange("label", event.target.value)}
              className={`${fieldClassName} placeholder:text-muted-foreground`}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="future-flow-category" className="mb-1 block text-xs font-medium text-foreground">
                Catégorie
              </label>
              <select
                id="future-flow-category"
                value={form.category}
                onChange={(event) => onChange("category", event.target.value)}
                className={fieldClassName}
              >
                {categories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="future-flow-date" className="mb-1 block text-xs font-medium text-foreground">
                Date d&apos;effet
              </label>
              <input
                id="future-flow-date"
                type="date"
                required
                value={form.date}
                onChange={(event) => onChange("date", event.target.value)}
                className={fieldClassName}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="future-flow-amount" className="mb-1 block text-xs font-medium text-foreground">
                Montant HT (€)
              </label>
              <input
                id="future-flow-amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="1000.00"
                value={form.amountHt}
                onChange={(event) => onChange("amountHt", event.target.value === "" ? "" : Number.parseFloat(event.target.value))}
                className={`${fieldClassName} placeholder:text-muted-foreground`}
              />
            </div>
            <div>
              <label htmlFor="future-flow-vat" className="mb-1 block text-xs font-medium text-foreground">
                Taux TVA
              </label>
              <select
                id="future-flow-vat"
                value={form.vatRate}
                onChange={(event) => onChange("vatRate", Number.parseFloat(event.target.value))}
                className={fieldClassName}
              >
                <option value={20}>20 % (Standard)</option>
                <option value={10}>10 % (Intermédiaire)</option>
                <option value={5.5}>5.5 % (Réduit)</option>
                <option value={2.1}>2.1 % (Super réduit)</option>
                <option value={0}>0 % (Exonéré / URSSAF / Salaires)</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="future-flow-recurrence" className="mb-1 block text-xs font-medium text-foreground">
              Récurrence
            </label>
            <select
              id="future-flow-recurrence"
              value={form.recurrence}
              onChange={(event) => onChange("recurrence", event.target.value as FutureFlowFormState["recurrence"])}
              className={fieldClassName}
            >
              <option value="none">Aucune (Ponctuel)</option>
              <option value="monthly">Mensuelle</option>
              <option value="quarterly">Trimestrielle</option>
              <option value="yearly">Annuelle</option>
            </select>
          </div>

          <div className="space-y-1 rounded-lg border border-border/50 bg-muted/60 p-3 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>Montant HT :</span>
              <span className="font-mono">{formatCurrency(ht)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>TVA ({form.vatRate}%) :</span>
              <span className="font-mono">{formatCurrency(vat)}</span>
            </div>
            <div className="flex justify-between border-t border-border/60 pt-1 font-semibold text-foreground">
              <span>Total TTC (Impact Trésorerie) :</span>
              <span className={`font-mono ${form.type === "inflow" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {form.type === "inflow" ? "+" : "-"}{formatCurrency(ttc)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border/60 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !form.label.trim() || ht <= 0}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-xs font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {editingFlow ? "Enregistrer" : "Créer le flux"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
