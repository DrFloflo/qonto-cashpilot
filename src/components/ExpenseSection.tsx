"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  createCollaboratorAction,
  createExpenseItemAction,
  createReimbursementAction,
  deleteCollaboratorAction,
  deleteExpenseItemAction,
  deleteReimbursementAction,
  getExpenseDataAction,
  importExpenseCsvAction,
  updateCollaboratorAction,
  updateExpenseItemAction,
} from "@/app/actions";
import type { Collaborator, ExpenseItem, ExpenseReimbursement } from "@/db/schema";
import type { DashboardData } from "@/lib/calculations";
import { CollaboratorOverview, ExpenseHeader, ExpenseKpis } from "./expense-section/ExpenseOverview";
import { CollaboratorModal, ExpenseModal, ImportModal, ReimbursementModal } from "./expense-section/ExpenseModals";
import { ExpenseTable, ReimbursementTable } from "./expense-section/ExpenseTables";
import type { CollaboratorFormState, DebitTransaction, ImportStatus, ReimbursementFormState } from "./expense-section/types";
import {
  buildExpenseCsv,
  buildExpenseTemplate,
  computeCollaboratorStats,
  createCollaboratorForm,
  createExpenseForm,
  createExpenseFormFromItem,
  createReimbursementForm,
  downloadCsv,
  getCollaboratorName,
  today,
} from "./expense-section/utils";

interface ExpenseSectionProps {
  onDataUpdated?: (newData: DashboardData) => void;
}

export function ExpenseSection({ onDataUpdated }: ExpenseSectionProps) {
  const [isPending, startTransition] = useTransition();
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [reimbursements, setReimbursements] = useState<ExpenseReimbursement[]>([]);
  const [debitTransactions, setDebitTransactions] = useState<DebitTransaction[]>([]);
  const [collaboratorFilter, setCollaboratorFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [editingExpense, setEditingExpense] = useState<ExpenseItem | null>(null);
  const [editingCollaborator, setEditingCollaborator] = useState<Collaborator | null>(null);
  const [reimbursementCollaborator, setReimbursementCollaborator] = useState<Collaborator | null>(null);
  const [expenseForm, setExpenseForm] = useState(() => createExpenseForm());
  const [collaboratorForm, setCollaboratorForm] = useState<CollaboratorFormState>(() => createCollaboratorForm());
  const [reimbursementForm, setReimbursementForm] = useState<ReimbursementFormState>(() => ({ collaboratorId: "", transactionId: "", amount: "", date: today(), note: "" }));
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isCollaboratorModalOpen, setIsCollaboratorModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importStatus, setImportStatus] = useState<ImportStatus | null>(null);

  const loadData = useCallback(() => {
    startTransition(async () => {
      try {
        const data = await getExpenseDataAction();
        setCollaborators(data.collaborators);
        setExpenses(data.expenses);
        setReimbursements(data.reimbursements);
        setDebitTransactions(data.debitTransactions);
      } catch (error) {
        console.error("Failed to load expense data", error);
      }
    });
  }, []);

  useEffect(() => loadData(), [loadData]);

  const collaboratorStats = useMemo(
    () => computeCollaboratorStats(collaborators, expenses, reimbursements),
    [collaborators, expenses, reimbursements],
  );
  const totals = useMemo(() => collaboratorStats.reduce(
    (result, stat) => ({ due: result.due + stat.totalDue, reimbursed: result.reimbursed + stat.totalReimbursed, vat: result.vat + stat.vatDeductibleTotal }),
    { due: 0, reimbursed: 0, vat: 0 },
  ), [collaboratorStats]);
  const filteredExpenses = useMemo(() => expenses.filter((expense) =>
    (collaboratorFilter === "all" || expense.collaboratorId === collaboratorFilter)
    && (typeFilter === "all" || expense.type === typeFilter)), [expenses, collaboratorFilter, typeFilter]);
  const collaboratorName = useCallback((id: string) => getCollaboratorName(collaborators, id), [collaborators]);
  const notifyDashboard = (result: { updatedDashboard?: DashboardData }) => {
    if (result.updatedDashboard) onDataUpdated?.(result.updatedDashboard);
  };

  const openExpenseModal = (collaboratorId?: string) => {
    setEditingExpense(null);
    setExpenseForm(createExpenseForm(collaboratorId ?? collaborators[0]?.id ?? ""));
    setIsExpenseModalOpen(true);
  };
  const editExpense = (expense: ExpenseItem) => {
    setEditingExpense(expense);
    setExpenseForm(createExpenseFormFromItem(expense));
    setIsExpenseModalOpen(true);
  };
  const submitExpense = (event: FormEvent) => {
    event.preventDefault();
    const values = { collaboratorId: expenseForm.collaboratorId, type: expenseForm.type, date: expenseForm.date, label: expenseForm.label, amountTtc: Number.parseFloat(expenseForm.amountTtc) || 0, vatRate: Number.parseFloat(expenseForm.vatRate) || 0, prorataRate: Number.parseFloat(expenseForm.prorataRate) || 100, distanceKm: Number.parseFloat(expenseForm.distanceKm) || 0 };
    startTransition(async () => {
      try {
        const result = editingExpense ? await updateExpenseItemAction(editingExpense.id, values) : await createExpenseItemAction(values);
        notifyDashboard(result);
        setIsExpenseModalOpen(false);
        loadData();
      } catch (error) {
        console.error("Error saving expense", error);
      }
    });
  };
  const deleteExpense = (id: string) => {
    if (!confirm("Voulez-vous vraiment supprimer cette dépense ?")) return;
    startTransition(async () => { notifyDashboard(await deleteExpenseItemAction(id)); loadData(); });
  };

  const openCollaboratorModal = (collaborator?: Collaborator) => {
    setEditingCollaborator(collaborator ?? null);
    setCollaboratorForm(createCollaboratorForm(collaborator));
    setIsCollaboratorModalOpen(true);
  };
  const submitCollaborator = (event: FormEvent) => {
    event.preventDefault();
    const values = { name: collaboratorForm.name, email: collaboratorForm.email, mileageRate: Number.parseFloat(collaboratorForm.mileageRate) || 0.603 };
    startTransition(async () => {
      if (editingCollaborator) await updateCollaboratorAction(editingCollaborator.id, values);
      else await createCollaboratorAction(values);
      setIsCollaboratorModalOpen(false);
      loadData();
    });
  };
  const deleteCollaborator = (id: string) => {
    if (!confirm("Supprimer ce collaborateur supprimera aussi toutes ses notes de frais associées. Continuer ?")) return;
    startTransition(async () => { await deleteCollaboratorAction(id); loadData(); });
  };

  const openReimbursementModal = (collaborator: Collaborator) => {
    const remaining = collaboratorStats.find((stat) => stat.collaborator.id === collaborator.id)?.remaining ?? 0;
    setReimbursementCollaborator(collaborator);
    setReimbursementForm(createReimbursementForm(collaborator, remaining));
  };
  const submitReimbursement = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      await createReimbursementAction({ collaboratorId: reimbursementForm.collaboratorId, transactionId: reimbursementForm.transactionId || null, amount: Number.parseFloat(reimbursementForm.amount) || 0, date: reimbursementForm.date, note: reimbursementForm.note });
      setReimbursementCollaborator(null);
      loadData();
    });
  };
  const deleteReimbursement = (id: string) => {
    if (!confirm("Supprimer ce virement de remboursement ?")) return;
    startTransition(async () => { await deleteReimbursementAction(id); loadData(); });
  };

  const importCsv = () => {
    if (!csvText.trim()) return;
    startTransition(async () => {
      setImportStatus(null);
      const result = await importExpenseCsvAction(csvText);
      if (!result.success) return setImportStatus({ type: "error", message: result.error || "Erreur lors de l'import" });
      setImportStatus({ type: "success", message: `${result.importedCount} ligne(s) importée(s) avec succès !` });
      notifyDashboard(result);
      setCsvText("");
      loadData();
    });
  };
  const uploadCsv = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEvent) => setCsvText(loadEvent.target?.result as string);
    reader.readAsText(file, "UTF-8");
  };

  return <div className="space-y-6">
    <ExpenseHeader collaboratorCount={collaborators.length} onAddCollaborator={() => openCollaboratorModal()} onImport={() => setIsImportModalOpen(true)} onAddExpense={() => openExpenseModal()} />
    <ExpenseKpis remaining={Math.round((totals.due - totals.reimbursed) * 100) / 100} due={totals.due} reimbursed={totals.reimbursed} deductibleVat={totals.vat} expenseCount={expenses.length} reimbursementCount={reimbursements.length} />
    <CollaboratorOverview stats={collaboratorStats} onAddCollaborator={() => openCollaboratorModal()} onAddExpense={openExpenseModal} onReimburse={openReimbursementModal} />
    <ExpenseTable collaborators={collaborators} expenses={filteredExpenses} collaboratorFilter={collaboratorFilter} typeFilter={typeFilter} getCollaboratorName={collaboratorName} onCollaboratorFilterChange={setCollaboratorFilter} onTypeFilterChange={setTypeFilter} onExport={() => downloadCsv(buildExpenseCsv(filteredExpenses, collaboratorName), `export_depenses_${today()}.csv`)} onEdit={editExpense} onDelete={deleteExpense} />
    <ReimbursementTable reimbursements={reimbursements} transactions={debitTransactions} getCollaboratorName={collaboratorName} onDelete={deleteReimbursement} />
    {isExpenseModalOpen && <ExpenseModal form={expenseForm} setForm={setExpenseForm} collaborators={collaborators} editingExpense={editingExpense} isPending={isPending} onClose={() => setIsExpenseModalOpen(false)} onSubmit={submitExpense} />}
    {isCollaboratorModalOpen && <CollaboratorModal form={collaboratorForm} setForm={setCollaboratorForm} collaborators={collaborators} editingCollaborator={editingCollaborator} isPending={isPending} onClose={() => setIsCollaboratorModalOpen(false)} onSubmit={submitCollaborator} onEdit={openCollaboratorModal} onDelete={deleteCollaborator} />}
    {reimbursementCollaborator && <ReimbursementModal collaborator={reimbursementCollaborator} form={reimbursementForm} setForm={setReimbursementForm} transactions={debitTransactions} isPending={isPending} onClose={() => setReimbursementCollaborator(null)} onSubmit={submitReimbursement} />}
    {isImportModalOpen && <ImportModal csvText={csvText} setCsvText={setCsvText} status={importStatus} isPending={isPending} onClose={() => setIsImportModalOpen(false)} onDownloadTemplate={() => downloadCsv(buildExpenseTemplate(), "template_notes_de_frais_ik.csv")} onImport={importCsv} onFileUpload={uploadCsv} />}
  </div>;
}
