import type { FutureFlow } from "@/db/schema";
import type { FutureFlowFormState } from "./types";

export const CATEGORIES_INFLOW = ["CA / Vente", "Autre entrée"];
export const CATEGORIES_OUTFLOW = [
  "Salaires",
  "URSSAF",
  "Loyer",
  "Fournisseur",
  "Abonnement",
  "Impôt / taxe",
  "Autre charge",
];

export const RECURRENCE_LABELS: Record<string, string> = {
  none: "Ponctuel",
  monthly: "Mensuel",
  quarterly: "Trimestriel",
  yearly: "Annuel",
};

export function today(): string {
  return new Date().toISOString().split("T")[0];
}

export function createFutureFlowForm(flow?: FutureFlow): FutureFlowFormState {
  if (flow) {
    return {
      type: flow.type as FutureFlowFormState["type"],
      label: flow.label,
      category: flow.category,
      amountHt: flow.amountHt,
      vatRate: flow.vatRate,
      date: flow.date,
      recurrence: flow.recurrence as FutureFlowFormState["recurrence"],
    };
  }

  return {
    type: "outflow",
    label: "",
    category: "Fournisseur",
    amountHt: "",
    vatRate: 20,
    date: today(),
    recurrence: "none",
  };
}

export function calculateFlowAmounts(amountHt: number | "", vatRate: number) {
  const ht = typeof amountHt === "number" ? amountHt : 0;
  const vat = (ht * vatRate) / 100;

  return { ht, vat, ttc: ht + vat };
}
