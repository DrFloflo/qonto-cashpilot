import type { FutureFlow } from "@/db/schema";

export type FutureFlowType = "inflow" | "outflow";
export type FutureFlowRecurrence = "none" | "monthly" | "quarterly" | "yearly";

export interface FutureFlowFormState {
  type: FutureFlowType;
  label: string;
  category: string;
  amountHt: number | "";
  vatRate: number;
  date: string;
  recurrence: FutureFlowRecurrence;
}

export type FutureFlowFormSetter = <K extends keyof FutureFlowFormState>(
  field: K,
  value: FutureFlowFormState[K],
) => void;

export interface FutureFlowsTableProps {
  flows: FutureFlow[];
  deletingId: string | null;
  togglingId: string | null;
  onEdit: (flow: FutureFlow) => void;
  onDelete: (id: string) => void;
  onToggle: (flow: FutureFlow) => void;
}
