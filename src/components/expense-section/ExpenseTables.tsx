import { Car, CheckCircle2, Download, Edit2, Link as LinkIcon, Receipt, Trash2 } from "lucide-react";
import type { Collaborator, ExpenseItem, ExpenseReimbursement } from "@/db/schema";
import type { DebitTransaction } from "./types";

interface ExpenseTableProps {
  collaborators: Collaborator[];
  expenses: ExpenseItem[];
  collaboratorFilter: string;
  typeFilter: string;
  getCollaboratorName: (id: string) => string;
  onCollaboratorFilterChange: (value: string) => void;
  onTypeFilterChange: (value: string) => void;
  onExport: () => void;
  onEdit: (expense: ExpenseItem) => void;
  onDelete: (id: string) => void;
}

export function ExpenseTable({ collaborators, expenses, collaboratorFilter, typeFilter, getCollaboratorName, onCollaboratorFilterChange, onTypeFilterChange, onExport, onEdit, onDelete }: ExpenseTableProps) {
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-xs">
      <div className="p-4 sm:p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">Historique des Dépenses (NDF & IK)</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Toutes les lignes enregistrées ou importées par CSV</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={collaboratorFilter} onChange={(event) => onCollaboratorFilterChange(event.target.value)} className="text-xs px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground">
            <option value="all">Tous les collaborateurs</option>
            {collaborators.map((collaborator) => <option key={collaborator.id} value={collaborator.id}>{collaborator.name}</option>)}
          </select>
          <select value={typeFilter} onChange={(event) => onTypeFilterChange(event.target.value)} className="text-xs px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground">
            <option value="all">Tous types (NDF + IK)</option>
            <option value="ndf">Notes de Frais (NDF)</option>
            <option value="ik">Indemnités Km (IK)</option>
          </select>
          <button onClick={onExport} disabled={expenses.length === 0} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors disabled:opacity-40" title="Exporter les dépenses affichées en CSV">
            <Download className="w-3.5 h-3.5 text-muted-foreground" /> Exporter CSV
          </button>
        </div>
      </div>
      {expenses.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground"><Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" /><p className="text-sm">Aucune dépense trouvée pour les critères sélectionnés.</p></div>
      ) : (
        <div className="w-full overflow-hidden">
          <table className="w-full table-fixed text-left text-xs">
            <thead className="bg-muted/50 text-muted-foreground text-[11px] font-semibold border-b border-border">
              <tr><th className="w-[85px] px-2.5 py-2.5">Date</th><th className="w-[75px] px-2 py-2.5">Type</th><th className="w-[120px] px-2.5 py-2.5">Collaborateur</th><th className="px-2.5 py-2.5">Objet</th><th className="w-[85px] px-2 py-2.5 text-right">TTC</th><th className="w-[75px] px-2 py-2.5 text-right">HT</th><th className="w-[50px] px-1.5 py-2.5 text-right">TVA</th><th className="w-[55px] px-1.5 py-2.5 text-right">Pro %</th><th className="w-[80px] px-2 py-2.5 text-right">TVA Déd.</th><th className="w-[95px] px-2.5 py-2.5 text-right font-bold text-foreground">À rembourser</th><th className="w-[55px] px-1.5 py-2.5 text-center" /></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {expenses.map((expense) => <ExpenseRow key={expense.id} expense={expense} collaboratorName={getCollaboratorName(expense.collaboratorId)} onEdit={onEdit} onDelete={onDelete} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ExpenseRow({ expense, collaboratorName, onEdit, onDelete }: { expense: ExpenseItem; collaboratorName: string; onEdit: (expense: ExpenseItem) => void; onDelete: (id: string) => void }) {
  const isMileage = expense.type === "ik";
  return (
    <tr className="hover:bg-muted/30 transition-colors">
      <td className="px-2.5 py-2 text-muted-foreground truncate">{expense.date}</td>
      <td className="px-2 py-2"><span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-tight ${isMileage ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20" : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20"}`} title={isMileage ? `${expense.distanceKm || 0} km` : "Note de frais"}>{isMileage ? <Car className="w-2.5 h-2.5" /> : <Receipt className="w-2.5 h-2.5" />}{isMileage ? `${expense.distanceKm || 0}km` : "NDF"}</span></td>
      <td className="px-2.5 py-2 font-medium text-foreground truncate" title={collaboratorName}>{collaboratorName}</td>
      <td className="px-2.5 py-2 text-foreground font-normal truncate" title={expense.label}>{expense.label}</td>
      <td className="px-2 py-2 text-right font-medium text-foreground truncate">{formatAmount(expense.amountTtc)}</td>
      <td className="px-2 py-2 text-right text-muted-foreground truncate">{formatAmount(expense.amountHt)}</td>
      <td className="px-1.5 py-2 text-right text-muted-foreground">{isMileage ? "-" : `${expense.vatRate}%`}</td>
      <td className="px-1.5 py-2 text-right text-muted-foreground">{expense.prorataRate}%</td>
      <td className="px-2 py-2 text-right font-medium text-purple-600 dark:text-purple-400 truncate">{expense.vatDeductible > 0 ? formatAmount(expense.vatDeductible) : "-"}</td>
      <td className="px-2.5 py-2 text-right font-bold text-foreground truncate">{formatAmount(expense.reimbursableAmount)}</td>
      <td className="px-1.5 py-2 text-center"><div className="inline-flex items-center gap-0.5 justify-center"><button onClick={() => onEdit(expense)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Modifier"><Edit2 className="w-3 h-3" /></button><button onClick={() => onDelete(expense.id)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Supprimer"><Trash2 className="w-3 h-3" /></button></div></td>
    </tr>
  );
}

interface ReimbursementTableProps {
  reimbursements: ExpenseReimbursement[];
  transactions: DebitTransaction[];
  getCollaboratorName: (id: string) => string;
  onDelete: (id: string) => void;
}

export function ReimbursementTable({ reimbursements, transactions, getCollaboratorName, onDelete }: ReimbursementTableProps) {
  if (reimbursements.length === 0) return null;
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-xs">
      <div className="p-4 sm:p-5 border-b border-border"><h3 className="text-base font-semibold text-foreground flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" />Historique des Virements de Remboursement Liés</h3><p className="text-xs text-muted-foreground mt-0.5">Remboursements globaux enregistrés et rattachés aux collaborateurs</p></div>
      <div className="overflow-x-auto"><table className="w-full text-left text-xs sm:text-sm"><thead className="bg-muted/50 text-muted-foreground text-xs font-semibold border-b border-border"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Collaborateur</th><th className="px-4 py-3">Virement Qonto / Transaction</th><th className="px-4 py-3">Note / Objet</th><th className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">Montant Remboursé</th><th className="px-4 py-3 text-center">Actions</th></tr></thead>
        <tbody className="divide-y divide-border">{reimbursements.map((reimbursement) => {
          const transaction = transactions.find((item) => item.id === reimbursement.transactionId);
          return <tr key={reimbursement.id} className="hover:bg-muted/30 transition-colors"><td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{reimbursement.date}</td><td className="px-4 py-3 whitespace-nowrap font-medium text-foreground">{getCollaboratorName(reimbursement.collaboratorId)}</td><td className="px-4 py-3 whitespace-nowrap">{transaction ? <span className="inline-flex items-center gap-1 text-xs text-foreground font-medium"><LinkIcon className="w-3 h-3 text-primary" />{transaction.label} ({formatAmount(transaction.amount)})</span> : <span className="text-xs text-muted-foreground italic">Virement direct</span>}</td><td className="px-4 py-3 text-muted-foreground">{reimbursement.note || "-"}</td><td className="px-4 py-3 text-right whitespace-nowrap font-bold text-emerald-600 dark:text-emerald-400">{formatAmount(reimbursement.amount)}</td><td className="px-4 py-3 text-center whitespace-nowrap"><button onClick={() => onDelete(reimbursement.id)} className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Supprimer ce virement"><Trash2 className="w-3.5 h-3.5" /></button></td></tr>;
        })}</tbody></table></div>
    </div>
  );
}

const formatAmount = (amount: number) => `${amount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €`;
