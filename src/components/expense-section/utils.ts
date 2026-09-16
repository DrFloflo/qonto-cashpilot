import type { Collaborator, ExpenseItem, ExpenseReimbursement } from "@/db/schema";
import type {
  CollaboratorFormState,
  CollaboratorStat,
  ExpenseFormState,
  ReimbursementFormState,
} from "./types";

export const today = () => new Date().toISOString().slice(0, 10);

export function createExpenseForm(collaboratorId = ""): ExpenseFormState {
  return {
    collaboratorId,
    type: "ndf",
    date: today(),
    label: "",
    amountTtc: "",
    vatRate: "20",
    prorataRate: "100",
    distanceKm: "",
  };
}

export function createExpenseFormFromItem(expense: ExpenseItem): ExpenseFormState {
  return {
    collaboratorId: expense.collaboratorId,
    type: expense.type as "ndf" | "ik",
    date: expense.date,
    label: expense.label,
    amountTtc: expense.amountTtc.toString(),
    vatRate: expense.vatRate.toString(),
    prorataRate: expense.prorataRate.toString(),
    distanceKm: expense.distanceKm?.toString() ?? "",
  };
}

export function createCollaboratorForm(collaborator?: Collaborator): CollaboratorFormState {
  return {
    name: collaborator?.name ?? "",
    email: collaborator?.email ?? "",
    mileageRate: collaborator?.mileageRate.toString() ?? "0.603",
  };
}

export function createReimbursementForm(
  collaborator: Collaborator,
  remaining: number,
): ReimbursementFormState {
  return {
    collaboratorId: collaborator.id,
    transactionId: "",
    amount: remaining > 0 ? remaining.toString() : "",
    date: today(),
    note: `Remboursement NDF/IK ${collaborator.name}`,
  };
}

export function computeCollaboratorStats(
  collaborators: Collaborator[],
  expenses: ExpenseItem[],
  reimbursements: ExpenseReimbursement[],
): CollaboratorStat[] {
  return collaborators.map((collaborator) => {
    const collaboratorExpenses = expenses.filter(
      (expense) => expense.collaboratorId === collaborator.id,
    );
    const collaboratorReimbursements = reimbursements.filter(
      (reimbursement) => reimbursement.collaboratorId === collaborator.id,
    );
    const totalDue = collaboratorExpenses.reduce(
      (sum, expense) => sum + expense.reimbursableAmount,
      0,
    );
    const totalReimbursed = collaboratorReimbursements.reduce(
      (sum, reimbursement) => sum + reimbursement.amount,
      0,
    );
    const vatDeductibleTotal = collaboratorExpenses.reduce(
      (sum, expense) => sum + expense.vatDeductible,
      0,
    );

    return {
      collaborator,
      expenseCount: collaboratorExpenses.length,
      totalDue: roundCurrency(totalDue),
      totalReimbursed: roundCurrency(totalReimbursed),
      remaining: roundCurrency(totalDue - totalReimbursed),
      vatDeductibleTotal: roundCurrency(vatDeductibleTotal),
    };
  });
}

export const getCollaboratorName = (collaborators: Collaborator[], id: string) =>
  collaborators.find((collaborator) => collaborator.id === id)?.name ?? "Inconnu";

export function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function buildExpenseCsv(
  expenses: ExpenseItem[],
  getCollaborator: (id: string) => string,
) {
  const headers = [
    "Date",
    "Type",
    "Collaborateur",
    "Objet",
    "Montant TTC",
    "Montant HT",
    "Taux TVA %",
    "Prorata %",
    "TVA Déductible",
    "Montant Remboursable",
    "Distance km",
  ];
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const rows = expenses.map((expense) => [
    expense.date,
    expense.type.toUpperCase(),
    escape(getCollaborator(expense.collaboratorId)),
    escape(expense.label),
    expense.amountTtc.toFixed(2),
    expense.amountHt.toFixed(2),
    expense.type === "ik" ? "0" : expense.vatRate.toString(),
    expense.prorataRate.toString(),
    expense.vatDeductible.toFixed(2),
    expense.reimbursableAmount.toFixed(2),
    expense.distanceKm?.toString() ?? "",
  ]);

  return `\uFEFF${[headers, ...rows].map((row) => row.join(";")).join("\n")}`;
}

export function buildExpenseTemplate() {
  const date = today();
  return `date;type;collaborateur;description;montant_ttc;taux_tva;prorata;km\n${date};NDF;Jean Dupont;Abonnement téléphone;48.00;20;50;\n${date};NDF;Jean Dupont;Restaurant client;94.05;10;100;\n${date};IK;Jean Dupont;Rendez-vous client Lyon;;0;100;120\n`;
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}
