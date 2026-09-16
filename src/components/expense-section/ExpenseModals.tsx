import type { ChangeEvent, FormEvent } from "react";
import { AlertCircle, ArrowDownLeft, Car, CheckCircle2, Download, FileSpreadsheet, Receipt, Users } from "lucide-react";
import type { Collaborator, ExpenseItem } from "@/db/schema";
import type { CollaboratorFormState, DebitTransaction, ExpenseFormState, ImportStatus, ReimbursementFormState, StateSetter } from "./types";

const fieldClass = "w-full text-sm px-3 py-2 rounded-xl border border-border bg-background text-foreground";
const labelClass = "block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5";

function Modal({ title, icon, onClose, children, maxWidth = "max-w-lg" }: { title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode; maxWidth?: string }) {
  return <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"><div className={`bg-card w-full ${maxWidth} rounded-2xl border border-border shadow-xl overflow-hidden animate-in fade-in zoom-in-95`}><div className="px-6 py-4 border-b border-border flex items-center justify-between"><h3 className="text-lg font-bold text-foreground flex items-center gap-2">{icon}{title}</h3><button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm font-medium">Fermer</button></div>{children}</div></div>;
}

function ModalActions({ onClose, isPending, submitLabel }: { onClose: () => void; isPending: boolean; submitLabel: string }) {
  return <div className="pt-4 border-t border-border flex items-center justify-end gap-2"><button type="button" onClick={onClose} className="px-4 py-2 text-xs font-medium rounded-xl border border-border hover:bg-muted text-foreground transition-colors">Annuler</button><button type="submit" disabled={isPending} className="px-5 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50">{submitLabel}</button></div>;
}

interface ExpenseModalProps {
  form: ExpenseFormState;
  setForm: StateSetter<ExpenseFormState>;
  collaborators: Collaborator[];
  editingExpense: ExpenseItem | null;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}

export function ExpenseModal({ form, setForm, collaborators, editingExpense, isPending, onClose, onSubmit }: ExpenseModalProps) {
  const isMileage = form.type === "ik";
  return <Modal title={editingExpense ? "Modifier la dépense" : "Ajouter une dépense"} icon={isMileage ? <Car className="w-5 h-5 text-sky-500" /> : <Receipt className="w-5 h-5 text-primary" />} onClose={onClose}>
    <form onSubmit={onSubmit} className="p-6 space-y-4">
      <div className="grid grid-cols-2 gap-4"><Field label="Type de dépense"><select value={form.type} onChange={(event) => setForm((previous) => ({ ...previous, type: event.target.value as "ndf" | "ik" }))} className={fieldClass}><option value="ndf">Note de Frais (NDF)</option><option value="ik">Indemnités Km (IK)</option></select></Field><Field label="Collaborateur"><select value={form.collaboratorId} onChange={(event) => setForm((previous) => ({ ...previous, collaboratorId: event.target.value }))} required className={fieldClass}>{collaborators.map((collaborator) => <option key={collaborator.id} value={collaborator.id}>{collaborator.name} ({collaborator.mileageRate} €/km)</option>)}</select></Field></div>
      <div className="grid grid-cols-2 gap-4"><Field label="Date"><input type="date" value={form.date} onChange={(event) => setForm((previous) => ({ ...previous, date: event.target.value }))} required className={fieldClass} /></Field><Field label="Objet / Libellé"><input type="text" placeholder="ex: Péage, Restaurant, Trajet Lyon..." value={form.label} onChange={(event) => setForm((previous) => ({ ...previous, label: event.target.value }))} required className={fieldClass} /></Field></div>
      {isMileage ? <Field label="Distance parcourue (km)"><div className="relative"><input type="number" step="0.1" placeholder="ex: 120" value={form.distanceKm} onChange={(event) => setForm((previous) => ({ ...previous, distanceKm: event.target.value }))} required className={fieldClass} /><span className="absolute right-3 top-2.5 text-xs text-muted-foreground">km</span></div><p className="text-xs text-muted-foreground mt-1">Le montant remboursable sera calculé automatiquement sur le barème du collaborateur (TVA 0%).</p></Field> : <><div className="grid grid-cols-3 gap-3"><Field label="Montant TTC"><NumberField value={form.amountTtc} suffix="€" step="0.01" required onChange={(value) => setForm((previous) => ({ ...previous, amountTtc: value }))} /></Field><Field label="Taux TVA (%)"><div className="flex items-center gap-1.5"><NumberField value={form.vatRate} suffix="%" step="0.1" onChange={(value) => setForm((previous) => ({ ...previous, vatRate: value }))} /><select value={["20", "10", "8.5", "5.5", "2.1", "0"].includes(form.vatRate) ? form.vatRate : "custom"} onChange={(event) => event.target.value !== "custom" && setForm((previous) => ({ ...previous, vatRate: event.target.value }))} className="text-xs px-2 py-2 rounded-xl border border-border bg-muted/40 text-foreground"><option value="20">20%</option><option value="10">10%</option><option value="8.5">8.5%</option><option value="5.5">5.5%</option><option value="2.1">2.1%</option><option value="0">0%</option><option value="custom" disabled>Autre</option></select></div></Field><Field label="Prorata Pro (%)"><NumberField value={form.prorataRate} suffix="%" step="1" required onChange={(value) => setForm((previous) => ({ ...previous, prorataRate: value }))} /></Field></div><p className="text-xs text-muted-foreground bg-muted/40 p-3 rounded-xl">💡 Remboursement = TTC engagé au prorata ({form.prorataRate}%). Le HT et la TVA déductible sont calculés arithmétiquement.</p></>}
      <ModalActions onClose={onClose} isPending={isPending} submitLabel={editingExpense ? "Mettre à jour" : "Enregistrer la dépense"} />
    </form>
  </Modal>;
}

interface CollaboratorModalProps {
  form: CollaboratorFormState;
  setForm: StateSetter<CollaboratorFormState>;
  collaborators: Collaborator[];
  editingCollaborator: Collaborator | null;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  onEdit: (collaborator: Collaborator) => void;
  onDelete: (id: string) => void;
}

export function CollaboratorModal({ form, setForm, collaborators, editingCollaborator, isPending, onClose, onSubmit, onEdit, onDelete }: CollaboratorModalProps) {
  return <Modal title={editingCollaborator ? "Modifier le collaborateur" : "Nouveau Collaborateur"} icon={<Users className="w-5 h-5 text-primary" />} onClose={onClose}>
    <form onSubmit={onSubmit} className="p-6 space-y-4"><Field label="Nom & Prénom"><input type="text" placeholder="ex: Jean Dupont" value={form.name} onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))} required className={fieldClass} /></Field><Field label="Email (optionnel)"><input type="email" placeholder="jean.dupont@entreprise.fr" value={form.email} onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))} className={fieldClass} /></Field><Field label="Barème kilométrique (€ / km)"><div className="relative"><input type="number" step="0.001" value={form.mileageRate} onChange={(event) => setForm((previous) => ({ ...previous, mileageRate: event.target.value }))} required className={fieldClass} /><span className="absolute right-3 top-2.5 text-xs text-muted-foreground">€/km</span></div><p className="text-xs text-muted-foreground mt-1">Appliqué automatiquement lors de la saisie ou de l&apos;import des IK pour ce collaborateur.</p></Field><div className="pt-4 border-t border-border flex items-center justify-between">{editingCollaborator ? <button type="button" onClick={() => { onClose(); onDelete(editingCollaborator.id); }} className="text-xs font-medium text-destructive hover:underline">Supprimer le collaborateur</button> : <div />}<div className="flex items-center gap-2"><button type="button" onClick={onClose} className="px-4 py-2 text-xs font-medium rounded-xl border border-border hover:bg-muted text-foreground">Annuler</button><button type="submit" disabled={isPending} className="px-5 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground disabled:opacity-50">{editingCollaborator ? "Mettre à jour" : "Créer le collaborateur"}</button></div></div></form>
    <div className="p-6 bg-muted/20 border-t border-border"><h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Collaborateurs existants</h4><div className="space-y-2">{collaborators.map((collaborator) => <div key={collaborator.id} className="flex items-center justify-between p-2.5 rounded-lg bg-card border border-border text-xs"><div><span className="font-semibold text-foreground">{collaborator.name}</span><span className="text-muted-foreground ml-2">({collaborator.mileageRate} €/km)</span></div><button onClick={() => onEdit(collaborator)} className="text-primary hover:underline text-xs">Éditer</button></div>)}</div></div>
  </Modal>;
}

interface ReimbursementModalProps {
  collaborator: Collaborator;
  form: ReimbursementFormState;
  setForm: StateSetter<ReimbursementFormState>;
  transactions: DebitTransaction[];
  isPending: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}

export function ReimbursementModal({ collaborator, form, setForm, transactions, isPending, onClose, onSubmit }: ReimbursementModalProps) {
  return <Modal title={`Lier un virement pour ${collaborator.name}`} icon={<ArrowDownLeft className="w-5 h-5 text-emerald-500" />} onClose={onClose}>
    <form onSubmit={onSubmit} className="p-6 space-y-4"><Field label="Virement Bancaire Qonto (optionnel)"><select value={form.transactionId} onChange={(event) => { const transaction = transactions.find((item) => item.id === event.target.value); setForm((previous) => ({ ...previous, transactionId: event.target.value, amount: transaction?.amount.toString() ?? previous.amount, date: transaction?.settledAt.slice(0, 10) ?? previous.date, note: transaction ? `Virement Qonto: ${transaction.label}` : previous.note })); }} className={fieldClass}><option value="">-- Saisie manuelle ou virement externe --</option>{transactions.slice(0, 30).map((transaction) => <option key={transaction.id} value={transaction.id}>{transaction.settledAt.slice(0, 10)} - {transaction.label} ({transaction.amount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €)</option>)}</select><p className="text-xs text-muted-foreground mt-1">Sélectionnez le débit Qonto correspondant au virement global envoyé au collaborateur.</p></Field><div className="grid grid-cols-2 gap-4"><Field label="Montant du virement (€)"><input type="number" step="0.01" value={form.amount} onChange={(event) => setForm((previous) => ({ ...previous, amount: event.target.value }))} required className={fieldClass} /></Field><Field label="Date du virement"><input type="date" value={form.date} onChange={(event) => setForm((previous) => ({ ...previous, date: event.target.value }))} required className={fieldClass} /></Field></div><Field label="Note / Libellé"><input type="text" value={form.note} onChange={(event) => setForm((previous) => ({ ...previous, note: event.target.value }))} className={fieldClass} /></Field><ModalActions onClose={onClose} isPending={isPending} submitLabel="Enregistrer le virement" /></form>
  </Modal>;
}

interface ImportModalProps { csvText: string; setCsvText: (value: string) => void; status: ImportStatus | null; isPending: boolean; onClose: () => void; onDownloadTemplate: () => void; onImport: () => void; onFileUpload: (event: ChangeEvent<HTMLInputElement>) => void; }

export function ImportModal({ csvText, setCsvText, status, isPending, onClose, onDownloadTemplate, onImport, onFileUpload }: ImportModalProps) {
  return <Modal title="Importer des Notes de Frais & IK via CSV" icon={<FileSpreadsheet className="w-5 h-5 text-primary" />} onClose={onClose} maxWidth="max-w-xl"><div className="p-6 space-y-4"><div className="flex items-center justify-between bg-muted/40 p-4 rounded-xl border border-border"><div><h4 className="text-xs font-bold text-foreground">Template CSV</h4><p className="text-xs text-muted-foreground">Colonnes : date, type (NDF/IK), collaborateur, description, montant_ttc, taux_tva, prorata, km</p></div><button onClick={onDownloadTemplate} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-card hover:bg-muted text-foreground"><Download className="w-3.5 h-3.5" />Télécharger le template</button></div><Field label="Fichier CSV"><input type="file" accept=".csv,text/csv" onChange={onFileUpload} className="w-full text-xs file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground" /></Field><Field label="Ou coller le contenu CSV :"><textarea rows={6} placeholder="date;type;collaborateur;description;montant_ttc;taux_tva;prorata;km" value={csvText} onChange={(event) => setCsvText(event.target.value)} className="w-full font-mono text-xs p-3 rounded-xl border border-border bg-background text-foreground" /></Field>{status && <div className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${status.type === "success" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" : "bg-destructive/10 text-destructive border border-destructive/20"}`}>{status.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}{status.message}</div>}<div className="pt-4 border-t border-border flex items-center justify-end gap-2"><button type="button" onClick={onClose} className="px-4 py-2 text-xs font-medium rounded-xl border border-border hover:bg-muted text-foreground">Fermer</button><button onClick={onImport} disabled={isPending || !csvText.trim()} className="px-5 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground disabled:opacity-50">Importer les dépenses</button></div></div></Modal>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><label className={labelClass}>{label}</label>{children}</div>; }
function NumberField({ value, suffix, step, required, onChange }: { value: string; suffix: string; step: string; required?: boolean; onChange: (value: string) => void }) { return <div className="relative flex-1"><input type="number" step={step} min="0" value={value} onChange={(event) => onChange(event.target.value)} required={required} className={fieldClass} /><span className="absolute right-3 top-2.5 text-xs text-muted-foreground">{suffix}</span></div>; }
