import type { Dispatch, SetStateAction } from "react";
import type { Collaborator } from "@/db/schema";

export interface DebitTransaction {
  id: string;
  label: string;
  amount: number;
  settledAt: string;
}

export interface CollaboratorStat {
  collaborator: Collaborator;
  expenseCount: number;
  totalDue: number;
  totalReimbursed: number;
  remaining: number;
  vatDeductibleTotal: number;
}

export interface ExpenseFormState {
  collaboratorId: string;
  type: "ndf" | "ik";
  date: string;
  label: string;
  amountTtc: string;
  vatRate: string;
  prorataRate: string;
  distanceKm: string;
}

export interface CollaboratorFormState {
  name: string;
  email: string;
  mileageRate: string;
}

export interface ReimbursementFormState {
  collaboratorId: string;
  transactionId: string;
  amount: string;
  date: string;
  note: string;
}

export interface ImportStatus {
  message: string;
  type: "success" | "error";
}

export type StateSetter<T> = Dispatch<SetStateAction<T>>;
