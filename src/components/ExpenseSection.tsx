"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  Users,
  Plus,
  Receipt,
  Car,
  FileSpreadsheet,
  Download,
  Upload,
  Trash2,
  Edit2,
  CheckCircle2,
  Clock,
  ArrowDownLeft,
  ChevronRight,
  Sparkles,
  AlertCircle,
  Link as LinkIcon,
} from "lucide-react";
import {
  getExpenseDataAction,
  createExpenseItemAction,
  updateExpenseItemAction,
  deleteExpenseItemAction,
  createCollaboratorAction,
  updateCollaboratorAction,
  deleteCollaboratorAction,
  createReimbursementAction,
  deleteReimbursementAction,
  importExpenseCsvAction,
} from "@/app/actions";
import type { Collaborator, ExpenseItem, ExpenseReimbursement } from "@/db/schema";
import type { DashboardData } from "@/lib/calculations";

interface ExpenseSectionProps {
  onDataUpdated?: (newData: DashboardData) => void;
}

export function ExpenseSection({ onDataUpdated }: ExpenseSectionProps) {
  const [isPending, startTransition] = useTransition();

  // Loaded data
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [reimbursements, setReimbursements] = useState<ExpenseReimbursement[]>([]);
  const [debitTransactions, setDebitTransactions] = useState<
    { id: string; label: string; amount: number; settledAt: string }[]
  >([]);

  // Filtering
  const [selectedCollabFilter, setSelectedCollabFilter] = useState<string>("all");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>("all");

  // Modals
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [isCollabModalOpen, setIsCollabModalOpen] = useState(false);
  const [isReimbModalOpen, setIsReimbModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Editing state
  const [editingExpense, setEditingExpense] = useState<ExpenseItem | null>(null);
  const [editingCollab, setEditingCollab] = useState<Collaborator | null>(null);
  const [selectedCollabForReimb, setSelectedCollabForReimb] = useState<Collaborator | null>(null);

  // Form states
  const [expenseForm, setExpenseForm] = useState({
    collaboratorId: "",
    type: "ndf" as "ndf" | "ik",
    date: new Date().toISOString().slice(0, 10),
    label: "",
    amountTtc: "",
    vatRate: "20",
    prorataRate: "100",
    distanceKm: "",
  });

  const [collabForm, setCollabForm] = useState({
    name: "",
    email: "",
    mileageRate: "0.603",
  });

  const [reimbForm, setReimbForm] = useState({
    collaboratorId: "",
    transactionId: "",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    note: "",
  });

  const [csvText, setCsvText] = useState("");
  const [importStatus, setImportStatus] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const loadData = () => {
    startTransition(async () => {
      try {
        const data = await getExpenseDataAction();
        setCollaborators(data.collaborators);
        setExpenses(data.expenses);
        setReimbursements(data.reimbursements);
        setDebitTransactions(data.debitTransactions);
      } catch (e) {
        console.error("Failed to load expense data", e);
      }
    });
  };

  useEffect(() => {
    loadData();
  }, []);

  // Compute summary stats
  const collaboratorStats = collaborators.map((c) => {
    const collabExpenses = expenses.filter((e) => e.collaboratorId === c.id);
    const collabReimbursements = reimbursements.filter((r) => r.collaboratorId === c.id);

    const totalDue = collabExpenses.reduce((sum, e) => sum + e.reimbursableAmount, 0);
    const totalReimbursed = collabReimbursements.reduce((sum, r) => sum + r.amount, 0);
    const remaining = Math.round((totalDue - totalReimbursed) * 100) / 100;
    const vatDeductibleTotal = collabExpenses.reduce((sum, e) => sum + e.vatDeductible, 0);

    return {
      collaborator: c,
      expenseCount: collabExpenses.length,
      totalDue: Math.round(totalDue * 100) / 100,
      totalReimbursed: Math.round(totalReimbursed * 100) / 100,
      remaining,
      vatDeductibleTotal: Math.round(vatDeductibleTotal * 100) / 100,
    };
  });

  const totalGlobalDue = collaboratorStats.reduce((sum, s) => sum + s.totalDue, 0);
  const totalGlobalReimbursed = collaboratorStats.reduce((sum, s) => sum + s.totalReimbursed, 0);
  const totalGlobalRemaining = Math.round((totalGlobalDue - totalGlobalReimbursed) * 100) / 100;
  const totalGlobalVatDeductible = collaboratorStats.reduce((sum, s) => sum + s.vatDeductibleTotal, 0);

  // Filtered expenses list
  const filteredExpenses = expenses.filter((e) => {
    if (selectedCollabFilter !== "all" && e.collaboratorId !== selectedCollabFilter) return false;
    if (selectedTypeFilter !== "all" && e.type !== selectedTypeFilter) return false;
    return true;
  });

  // Handlers for Expenses
  const handleOpenAddExpense = (collabId?: string) => {
    setEditingExpense(null);
    setExpenseForm({
      collaboratorId: collabId || (collaborators[0]?.id ?? ""),
      type: "ndf",
      date: new Date().toISOString().slice(0, 10),
      label: "",
      amountTtc: "",
      vatRate: "20",
      prorataRate: "100",
      distanceKm: "",
    });
    setIsAddExpenseOpen(true);
  };

  const handleOpenEditExpense = (exp: ExpenseItem) => {
    setEditingExpense(exp);
    setExpenseForm({
      collaboratorId: exp.collaboratorId,
      type: exp.type as "ndf" | "ik",
      date: exp.date,
      label: exp.label,
      amountTtc: exp.amountTtc.toString(),
      vatRate: exp.vatRate.toString(),
      prorataRate: exp.prorataRate.toString(),
      distanceKm: exp.distanceKm ? exp.distanceKm.toString() : "",
    });
    setIsAddExpenseOpen(true);
  };

  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        if (editingExpense) {
          const res = await updateExpenseItemAction(editingExpense.id, {
            collaboratorId: expenseForm.collaboratorId,
            type: expenseForm.type,
            date: expenseForm.date,
            label: expenseForm.label,
            amountTtc: parseFloat(expenseForm.amountTtc) || 0,
            vatRate: parseFloat(expenseForm.vatRate) || 0,
            prorataRate: parseFloat(expenseForm.prorataRate) || 100,
            distanceKm: parseFloat(expenseForm.distanceKm) || 0,
          });
          if (res.updatedDashboard && onDataUpdated) onDataUpdated(res.updatedDashboard);
        } else {
          const res = await createExpenseItemAction({
            collaboratorId: expenseForm.collaboratorId,
            type: expenseForm.type,
            date: expenseForm.date,
            label: expenseForm.label,
            amountTtc: parseFloat(expenseForm.amountTtc) || 0,
            vatRate: parseFloat(expenseForm.vatRate) || 0,
            prorataRate: parseFloat(expenseForm.prorataRate) || 100,
            distanceKm: parseFloat(expenseForm.distanceKm) || 0,
          });
          if (res.updatedDashboard && onDataUpdated) onDataUpdated(res.updatedDashboard);
        }
        setIsAddExpenseOpen(false);
        loadData();
      } catch (err) {
        console.error("Error saving expense", err);
      }
    });
  };

  const handleDeleteExpense = async (id: string) => {
    if (!confirm("Voulez-vous vraiment supprimer cette dépense ?")) return;
    startTransition(async () => {
      const res = await deleteExpenseItemAction(id);
      if (res.updatedDashboard && onDataUpdated) onDataUpdated(res.updatedDashboard);
      loadData();
    });
  };

  // Handlers for Collaborators
  const handleOpenCollabModal = (collab?: Collaborator) => {
    if (collab) {
      setEditingCollab(collab);
      setCollabForm({
        name: collab.name,
        email: collab.email || "",
        mileageRate: collab.mileageRate.toString(),
      });
    } else {
      setEditingCollab(null);
      setCollabForm({
        name: "",
        email: "",
        mileageRate: "0.603",
      });
    }
    setIsCollabModalOpen(true);
  };

  const handleSubmitCollab = async (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      if (editingCollab) {
        await updateCollaboratorAction(editingCollab.id, {
          name: collabForm.name,
          email: collabForm.email,
          mileageRate: parseFloat(collabForm.mileageRate) || 0.603,
        });
      } else {
        await createCollaboratorAction({
          name: collabForm.name,
          email: collabForm.email,
          mileageRate: parseFloat(collabForm.mileageRate) || 0.603,
        });
      }
      setIsCollabModalOpen(false);
      loadData();
    });
  };

  const handleDeleteCollab = async (id: string) => {
    if (!confirm("Supprimer ce collaborateur supprimera aussi toutes ses notes de frais associées. Continuer ?")) return;
    startTransition(async () => {
      await deleteCollaboratorAction(id);
      loadData();
    });
  };

  // Handlers for Reimbursements
  const handleOpenReimbModal = (collab: Collaborator) => {
    setSelectedCollabForReimb(collab);
    const stats = collaboratorStats.find((s) => s.collaborator.id === collab.id);
    const defaultAmount = stats && stats.remaining > 0 ? stats.remaining.toString() : "";

    setReimbForm({
      collaboratorId: collab.id,
      transactionId: "",
      amount: defaultAmount,
      date: new Date().toISOString().slice(0, 10),
      note: `Remboursement NDF/IK ${collab.name}`,
    });
    setIsReimbModalOpen(true);
  };

  const handleSubmitReimb = async (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      await createReimbursementAction({
        collaboratorId: reimbForm.collaboratorId,
        transactionId: reimbForm.transactionId || null,
        amount: parseFloat(reimbForm.amount) || 0,
        date: reimbForm.date,
        note: reimbForm.note,
      });
      setIsReimbModalOpen(false);
      loadData();
    });
  };

  const handleDeleteReimbursement = async (id: string) => {
    if (!confirm("Supprimer ce virement de remboursement ?")) return;
    startTransition(async () => {
      await deleteReimbursementAction(id);
      loadData();
    });
  };

  // CSV Template download
  const handleDownloadTemplate = () => {
    const template = `date;type;collaborateur;description;montant_ttc;taux_tva;prorata;km\n${new Date().toISOString().slice(0, 10)};NDF;Jean Dupont;Abonnement téléphone;48.00;20;50;\n${new Date().toISOString().slice(0, 10)};NDF;Jean Dupont;Restaurant client;94.05;10;100;\n${new Date().toISOString().slice(0, 10)};IK;Jean Dupont;Rendez-vous client Lyon;;0;100;120\n`;
    const blob = new Blob([template], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "template_notes_de_frais_ik.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export current filtered expenses to CSV
  const handleExportExpenses = () => {
    if (filteredExpenses.length === 0) return;

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

    const rows = filteredExpenses.map((exp) => [
      exp.date,
      exp.type.toUpperCase(),
      `"${(getCollabName(exp.collaboratorId) || "").replace(/"/g, '""')}"`,
      `"${(exp.label || "").replace(/"/g, '""')}"`,
      exp.amountTtc.toFixed(2),
      exp.amountHt.toFixed(2),
      exp.type === "ik" ? "0" : exp.vatRate.toString(),
      exp.prorataRate.toString(),
      exp.vatDeductible.toFixed(2),
      exp.reimbursableAmount.toFixed(2),
      exp.distanceKm ? exp.distanceKm.toString() : "",
    ]);

    const csvContent = [
      headers.join(";"),
      ...rows.map((row) => row.join(";")),
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `export_depenses_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCsv = async () => {
    if (!csvText.trim()) return;
    startTransition(async () => {
      setImportStatus(null);
      const res = await importExpenseCsvAction(csvText);
      if (res.success) {
        setImportStatus({
          type: "success",
          message: `${res.importedCount} ligne(s) importée(s) avec succès !`,
        });
        if (res.updatedDashboard && onDataUpdated) {
          onDataUpdated(res.updatedDashboard);
        }
        setCsvText("");
        loadData();
      } else {
        setImportStatus({
          type: "error",
          message: res.error || "Erreur lors de l'import",
        });
      }
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      setCsvText(text);
    };
    reader.readAsText(file, "UTF-8");
  };

  const getCollabName = (id: string) => {
    return collaborators.find((c) => c.id === id)?.name || "Inconnu";
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card/60 p-5 rounded-2xl border border-border/80 shadow-xs backdrop-blur-md">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Receipt className="w-5 h-5 text-primary" />
            Notes de Frais & Indemnités Kilométriques
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Gérez les notes de frais (TTC, TVA déductible), barèmes IK et suivez les remboursements globaux par collaborateur.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleOpenCollabModal()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium rounded-xl border border-border bg-card hover:bg-muted/80 text-foreground transition-colors shadow-xs"
          >
            <Users className="w-4 h-4 text-muted-foreground" />
            Collaborateurs ({collaborators.length})
          </button>

          <button
            onClick={() => setIsImportModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium rounded-xl border border-border bg-card hover:bg-muted/80 text-foreground transition-colors shadow-xs"
          >
            <Upload className="w-4 h-4 text-muted-foreground" />
            Importer CSV
          </button>

          <button
            onClick={() => handleOpenAddExpense()}
            disabled={collaborators.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-xs disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Ajouter une dépense
          </button>
        </div>
      </div>

      {/* KPI Cards Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card p-4 rounded-2xl border border-border shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Reste à rembourser
            </span>
            <div className={`p-2 rounded-xl ${totalGlobalRemaining > 0 ? "bg-amber-500/10 text-amber-500" : "bg-emerald-500/10 text-emerald-500"}`}>
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold mt-2 text-foreground">
            {totalGlobalRemaining.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Total dû net restant tous collaborateurs
          </p>
        </div>

        <div className="bg-card p-4 rounded-2xl border border-border shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total engagé (Pro)
            </span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold mt-2 text-foreground">
            {totalGlobalDue.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {expenses.length} dépense(s) validée(s)
          </p>
        </div>

        <div className="bg-card p-4 rounded-2xl border border-border shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total remboursé
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold mt-2 text-emerald-600 dark:text-emerald-400">
            {totalGlobalReimbursed.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {reimbursements.length} virement(s) enregistré(s)
          </p>
        </div>

        <div className="bg-card p-4 rounded-2xl border border-border shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              TVA Déductible générée
            </span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold mt-2 text-purple-600 dark:text-purple-400">
            {totalGlobalVatDeductible.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Inclus dans les déclarations de TVA
          </p>
        </div>
      </div>

      {/* Collaborators Overview & Quick Reimbursement */}
      <div className="bg-card rounded-2xl border border-border p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Soldes & Remboursements par Collaborateur
          </h3>
          {collaborators.length === 0 && (
            <span className="text-xs text-amber-500 font-medium">
              Aucun collaborateur créé
            </span>
          )}
        </div>

        {collaborators.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-border rounded-xl">
            <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium text-foreground">Commencez par ajouter un collaborateur</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Définissez le barème kilométrique (€/km) pour permettre la saisie des indemnités et notes de frais.
            </p>
            <button
              onClick={() => handleOpenCollabModal()}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Ajouter un collaborateur
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {collaboratorStats.map((stat) => {
              const hasDebt = stat.remaining > 0;
              return (
                <div
                  key={stat.collaborator.id}
                  className="bg-muted/30 hover:bg-muted/50 transition-colors p-4 rounded-xl border border-border/70 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-foreground">
                          {stat.collaborator.name}
                        </h4>
                        {stat.collaborator.email && (
                          <p className="text-xs text-muted-foreground">{stat.collaborator.email}</p>
                        )}
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-secondary text-secondary-foreground">
                        {stat.collaborator.mileageRate} €/km
                      </span>
                    </div>

                    <div className="mt-3 space-y-1.5 text-xs">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Total dû :</span>
                        <span className="font-semibold text-foreground">
                          {stat.totalDue.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €
                        </span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Remboursé :</span>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {stat.totalReimbursed.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €
                        </span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-border/60">
                        <span className="font-medium text-foreground">Reste à payer :</span>
                        <span
                          className={`font-bold ${
                            hasDebt
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-emerald-600 dark:text-emerald-400"
                          }`}
                        >
                          {stat.remaining.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleOpenAddExpense(stat.collaborator.id)}
                      className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Dépense
                    </button>

                    <button
                      onClick={() => handleOpenReimbModal(stat.collaborator)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                    >
                      <ArrowDownLeft className="w-3.5 h-3.5" />
                      Lier virement
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Expenses Table */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-xs">
        <div className="p-4 sm:p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Historique des Dépenses (NDF & IK)
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Toutes les lignes enregistrées ou importées par CSV
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter by collaborator */}
            <select
              value={selectedCollabFilter}
              onChange={(e) => setSelectedCollabFilter(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground"
            >
              <option value="all">Tous les collaborateurs</option>
              {collaborators.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            {/* Filter by type */}
            <select
              value={selectedTypeFilter}
              onChange={(e) => setSelectedTypeFilter(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground"
            >
              <option value="all">Tous types (NDF + IK)</option>
              <option value="ndf">Notes de Frais (NDF)</option>
              <option value="ik">Indemnités Km (IK)</option>
            </select>

            {/* Export CSV Button */}
            <button
              onClick={handleExportExpenses}
              disabled={filteredExpenses.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors disabled:opacity-40"
              title="Exporter les dépenses affichées en CSV"
            >
              <Download className="w-3.5 h-3.5 text-muted-foreground" />
              Exporter CSV
            </button>
          </div>
        </div>

        {filteredExpenses.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Aucune dépense trouvée pour les critères sélectionnés.</p>
          </div>
        ) : (
          <div className="w-full overflow-hidden">
            <table className="w-full table-fixed text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground text-[11px] font-semibold border-b border-border">
                <tr>
                  <th className="w-[85px] px-2.5 py-2.5">Date</th>
                  <th className="w-[75px] px-2 py-2.5">Type</th>
                  <th className="w-[120px] px-2.5 py-2.5">Collaborateur</th>
                  <th className="px-2.5 py-2.5">Objet</th>
                  <th className="w-[85px] px-2 py-2.5 text-right">TTC</th>
                  <th className="w-[75px] px-2 py-2.5 text-right">HT</th>
                  <th className="w-[50px] px-1.5 py-2.5 text-right">TVA</th>
                  <th className="w-[55px] px-1.5 py-2.5 text-right">Pro %</th>
                  <th className="w-[80px] px-2 py-2.5 text-right">TVA Déd.</th>
                  <th className="w-[95px] px-2.5 py-2.5 text-right font-bold text-foreground">À rembourser</th>
                  <th className="w-[55px] px-1.5 py-2.5 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredExpenses.map((exp) => {
                  const isIk = exp.type === "ik";
                  return (
                    <tr key={exp.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-2.5 py-2 text-muted-foreground truncate">
                        {exp.date}
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-tight ${
                            isIk
                              ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20"
                              : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20"
                          }`}
                          title={isIk ? `${exp.distanceKm || 0} km` : "Note de frais"}
                        >
                          {isIk ? <Car className="w-2.5 h-2.5" /> : <Receipt className="w-2.5 h-2.5" />}
                          {isIk ? `${exp.distanceKm || 0}km` : "NDF"}
                        </span>
                      </td>
                      <td className="px-2.5 py-2 font-medium text-foreground truncate" title={getCollabName(exp.collaboratorId)}>
                        {getCollabName(exp.collaboratorId)}
                      </td>
                      <td className="px-2.5 py-2 text-foreground font-normal truncate" title={exp.label}>
                        {exp.label}
                      </td>
                      <td className="px-2 py-2 text-right font-medium text-foreground truncate">
                        {exp.amountTtc.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €
                      </td>
                      <td className="px-2 py-2 text-right text-muted-foreground truncate">
                        {exp.amountHt.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €
                      </td>
                      <td className="px-1.5 py-2 text-right text-muted-foreground">
                        {isIk ? "-" : `${exp.vatRate}%`}
                      </td>
                      <td className="px-1.5 py-2 text-right text-muted-foreground">
                        {exp.prorataRate}%
                      </td>
                      <td className="px-2 py-2 text-right font-medium text-purple-600 dark:text-purple-400 truncate">
                        {exp.vatDeductible > 0
                          ? `${exp.vatDeductible.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €`
                          : "-"}
                      </td>
                      <td className="px-2.5 py-2 text-right font-bold text-foreground truncate">
                        {exp.reimbursableAmount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €
                      </td>
                      <td className="px-1.5 py-2 text-center">
                        <div className="inline-flex items-center gap-0.5 justify-center">
                          <button
                            onClick={() => handleOpenEditExpense(exp)}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Modifier"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteExpense(exp.id)}
                            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                            title="Supprimer"
                          >
                            <Trash2 className="w-3 h-3" />
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
      </div>

      {/* Reimbursements History Table */}
      {reimbursements.length > 0 && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-xs">
          <div className="p-4 sm:p-5 border-b border-border">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Historique des Virements de Remboursement Liés
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Remboursements globaux enregistrés et rattachés aux collaborateurs
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs font-semibold border-b border-border">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Collaborateur</th>
                  <th className="px-4 py-3">Virement Qonto / Transaction</th>
                  <th className="px-4 py-3">Note / Objet</th>
                  <th className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                    Montant Remboursé
                  </th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {reimbursements.map((r) => {
                  const tx = debitTransactions.find((t) => t.id === r.transactionId);
                  return (
                    <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{r.date}</td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-foreground">
                        {getCollabName(r.collaboratorId)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {tx ? (
                          <span className="inline-flex items-center gap-1 text-xs text-foreground font-medium">
                            <LinkIcon className="w-3 h-3 text-primary" />
                            {tx.label} ({tx.amount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €)
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Virement direct</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.note || "-"}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap font-bold text-emerald-600 dark:text-emerald-400">
                        {r.amount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <button
                          onClick={() => handleDeleteReimbursement(r.id)}
                          className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          title="Supprimer ce virement"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Add / Edit Expense */}
      {isAddExpenseOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-lg rounded-2xl border border-border shadow-xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                {expenseForm.type === "ik" ? <Car className="w-5 h-5 text-sky-500" /> : <Receipt className="w-5 h-5 text-primary" />}
                {editingExpense ? "Modifier la dépense" : "Ajouter une dépense"}
              </h3>
              <button
                onClick={() => setIsAddExpenseOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm font-medium"
              >
                Fermer
              </button>
            </div>

            <form onSubmit={handleSubmitExpense} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Type de dépense
                  </label>
                  <select
                    value={expenseForm.type}
                    onChange={(e) =>
                      setExpenseForm((prev) => ({ ...prev, type: e.target.value as "ndf" | "ik" }))
                    }
                    className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background text-foreground"
                  >
                    <option value="ndf">Note de Frais (NDF)</option>
                    <option value="ik">Indemnités Km (IK)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Collaborateur
                  </label>
                  <select
                    value={expenseForm.collaboratorId}
                    onChange={(e) =>
                      setExpenseForm((prev) => ({ ...prev, collaboratorId: e.target.value }))
                    }
                    required
                    className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background text-foreground"
                  >
                    {collaborators.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.mileageRate} €/km)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Date
                  </label>
                  <input
                    type="date"
                    value={expenseForm.date}
                    onChange={(e) => setExpenseForm((prev) => ({ ...prev, date: e.target.value }))}
                    required
                    className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background text-foreground"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Objet / Libellé
                  </label>
                  <input
                    type="text"
                    placeholder="ex: Péage, Restaurant, Trajet Lyon..."
                    value={expenseForm.label}
                    onChange={(e) => setExpenseForm((prev) => ({ ...prev, label: e.target.value }))}
                    required
                    className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background text-foreground"
                  />
                </div>
              </div>

              {expenseForm.type === "ik" ? (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Distance parcourue (km)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      placeholder="ex: 120"
                      value={expenseForm.distanceKm}
                      onChange={(e) => setExpenseForm((prev) => ({ ...prev, distanceKm: e.target.value }))}
                      required
                      className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background text-foreground"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">km</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Le montant remboursable sera calculé automatiquement sur le barème du collaborateur (TVA 0%).
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                        Montant TTC
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={expenseForm.amountTtc}
                          onChange={(e) => setExpenseForm((prev) => ({ ...prev, amountTtc: e.target.value }))}
                          required
                          className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background text-foreground"
                        />
                        <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">€</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                        Taux TVA (%)
                      </label>
                      <div className="flex items-center gap-1.5">
                        <div className="relative flex-1">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            placeholder="20"
                            value={expenseForm.vatRate}
                            onChange={(e) => setExpenseForm((prev) => ({ ...prev, vatRate: e.target.value }))}
                            className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background text-foreground"
                          />
                          <span className="absolute right-2.5 top-2.5 text-xs text-muted-foreground">%</span>
                        </div>
                        <select
                          value={["20", "10", "8.5", "5.5", "2.1", "0"].includes(expenseForm.vatRate) ? expenseForm.vatRate : "custom"}
                          onChange={(e) => {
                            if (e.target.value !== "custom") {
                              setExpenseForm((prev) => ({ ...prev, vatRate: e.target.value }));
                            }
                          }}
                          className="text-xs px-2 py-2 rounded-xl border border-border bg-muted/40 text-foreground"
                          title="Sélectionner un taux standard"
                        >
                          <option value="20">20%</option>
                          <option value="10">10%</option>
                          <option value="8.5">8.5%</option>
                          <option value="5.5">5.5%</option>
                          <option value="2.1">2.1%</option>
                          <option value="0">0%</option>
                          <option value="custom" disabled>Autre</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                        Prorata Pro (%)
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          max="100"
                          value={expenseForm.prorataRate}
                          onChange={(e) => setExpenseForm((prev) => ({ ...prev, prorataRate: e.target.value }))}
                          required
                          className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background text-foreground"
                        />
                        <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">%</span>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground bg-muted/40 p-3 rounded-xl">
                    💡 Remboursement = TTC engagé au prorata ({expenseForm.prorataRate}%). Le HT et la TVA déductible sont calculés arithmétiquement.
                  </p>
                </>
              )}

              <div className="pt-4 border-t border-border flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddExpenseOpen(false)}
                  className="px-4 py-2 text-xs font-medium rounded-xl border border-border hover:bg-muted text-foreground transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  {editingExpense ? "Mettre à jour" : "Enregistrer la dépense"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Collaborator management */}
      {isCollabModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-lg rounded-2xl border border-border shadow-xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                {editingCollab ? "Modifier le collaborateur" : "Nouveau Collaborateur"}
              </h3>
              <button
                onClick={() => setIsCollabModalOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm font-medium"
              >
                Fermer
              </button>
            </div>

            <form onSubmit={handleSubmitCollab} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Nom & Prénom
                </label>
                <input
                  type="text"
                  placeholder="ex: Jean Dupont"
                  value={collabForm.name}
                  onChange={(e) => setCollabForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                  className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background text-foreground"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Email (optionnel)
                </label>
                <input
                  type="email"
                  placeholder="jean.dupont@entreprise.fr"
                  value={collabForm.email}
                  onChange={(e) => setCollabForm((prev) => ({ ...prev, email: e.target.value }))}
                  className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background text-foreground"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Barème kilométrique (€ / km)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.001"
                    placeholder="0.603"
                    value={collabForm.mileageRate}
                    onChange={(e) => setCollabForm((prev) => ({ ...prev, mileageRate: e.target.value }))}
                    required
                    className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background text-foreground"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">€/km</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {"Appliqué automatiquement lors de la saisie ou de l'import des IK pour ce collaborateur."}
                </p>
              </div>

              <div className="pt-4 border-t border-border flex items-center justify-between">
                {editingCollab ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCollabModalOpen(false);
                      handleDeleteCollab(editingCollab.id);
                    }}
                    className="text-xs font-medium text-destructive hover:underline"
                  >
                    Supprimer le collaborateur
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCollabModalOpen(false)}
                    className="px-4 py-2 text-xs font-medium rounded-xl border border-border hover:bg-muted text-foreground transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="px-5 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                  >
                    {editingCollab ? "Mettre à jour" : "Créer le collaborateur"}
                  </button>
                </div>
              </div>
            </form>

            {/* List of existing collaborators */}
            <div className="p-6 bg-muted/20 border-t border-border">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Collaborateurs existants
              </h4>
              <div className="space-y-2">
                {collaborators.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-card border border-border text-xs"
                  >
                    <div>
                      <span className="font-semibold text-foreground">{c.name}</span>
                      <span className="text-muted-foreground ml-2">({c.mileageRate} €/km)</span>
                    </div>
                    <button
                      onClick={() => handleOpenCollabModal(c)}
                      className="text-primary hover:underline text-xs"
                    >
                      Éditer
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Link Reimbursement / Bank Transfer */}
      {isReimbModalOpen && selectedCollabForReimb && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-lg rounded-2xl border border-border shadow-xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <ArrowDownLeft className="w-5 h-5 text-emerald-500" />
                Lier un virement pour {selectedCollabForReimb.name}
              </h3>
              <button
                onClick={() => setIsReimbModalOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm font-medium"
              >
                Fermer
              </button>
            </div>

            <form onSubmit={handleSubmitReimb} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Virement Bancaire Qonto (optionnel)
                </label>
                <select
                  value={reimbForm.transactionId}
                  onChange={(e) => {
                    const txId = e.target.value;
                    const selectedTx = debitTransactions.find((t) => t.id === txId);
                    setReimbForm((prev) => ({
                      ...prev,
                      transactionId: txId,
                      amount: selectedTx ? selectedTx.amount.toString() : prev.amount,
                      date: selectedTx ? selectedTx.settledAt.slice(0, 10) : prev.date,
                      note: selectedTx ? `Virement Qonto: ${selectedTx.label}` : prev.note,
                    }));
                  }}
                  className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background text-foreground"
                >
                  <option value="">-- Saisie manuelle ou virement externe --</option>
                  {debitTransactions.slice(0, 30).map((tx) => (
                    <option key={tx.id} value={tx.id}>
                      {tx.settledAt.slice(0, 10)} - {tx.label} ({tx.amount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €)
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Sélectionnez le débit Qonto correspondant au virement global envoyé au collaborateur.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Montant du virement (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={reimbForm.amount}
                    onChange={(e) => setReimbForm((prev) => ({ ...prev, amount: e.target.value }))}
                    required
                    className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background text-foreground"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Date du virement
                  </label>
                  <input
                    type="date"
                    value={reimbForm.date}
                    onChange={(e) => setReimbForm((prev) => ({ ...prev, date: e.target.value }))}
                    required
                    className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background text-foreground"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Note / Libellé
                </label>
                <input
                  type="text"
                  value={reimbForm.note}
                  onChange={(e) => setReimbForm((prev) => ({ ...prev, note: e.target.value }))}
                  className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background text-foreground"
                />
              </div>

              <div className="pt-4 border-t border-border flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsReimbModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium rounded-xl border border-border hover:bg-muted text-foreground transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 text-white hover:opacity-90 transition-opacity"
                >
                  Enregistrer le virement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: CSV Import */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-xl rounded-2xl border border-border shadow-xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-primary" />
                Importer des Notes de Frais & IK via CSV
              </h3>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm font-medium"
              >
                Fermer
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between bg-muted/40 p-4 rounded-xl border border-border">
                <div>
                  <h4 className="text-xs font-bold text-foreground">Template CSV</h4>
                  <p className="text-xs text-muted-foreground">
                    Colonnes : date, type (NDF/IK), collaborateur, description, montant_ttc, taux_tva, prorata, km
                  </p>
                </div>
                <button
                  onClick={handleDownloadTemplate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Télécharger le template
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Fichier CSV
                </label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileUpload}
                  className="w-full text-xs file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground hover:file:opacity-90"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Ou coller le contenu CSV :
                </label>
                <textarea
                  rows={6}
                  placeholder={`date;type;collaborateur;description;montant_ttc;taux_tva;prorata;km\n2026-03-01;NDF;Jean Dupont;Abonnement téléphone;48.00;20;50;\n2026-03-05;IK;Jean Dupont;Rendez-vous client;;0;100;120`}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  className="w-full font-mono text-xs p-3 rounded-xl border border-border bg-background text-foreground"
                />
              </div>

              {importStatus && (
                <div
                  className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                    importStatus.type === "success"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                      : "bg-destructive/10 text-destructive border border-destructive/20"
                  }`}
                >
                  {importStatus.type === "success" ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  {importStatus.message}
                </div>
              )}

              <div className="pt-4 border-t border-border flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium rounded-xl border border-border hover:bg-muted text-foreground transition-colors"
                >
                  Fermer
                </button>
                <button
                  onClick={handleImportCsv}
                  disabled={isPending || !csvText.trim()}
                  className="px-5 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  Importer les dépenses
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
