import { ArrowDownLeft, CheckCircle2, Clock, Plus, Receipt, Sparkles, Users } from "lucide-react";
import type { Collaborator } from "@/db/schema";
import type { CollaboratorStat } from "./types";

interface ExpenseHeaderProps {
  collaboratorCount: number;
  onAddCollaborator: () => void;
  onImport: () => void;
  onAddExpense: () => void;
}

export function ExpenseHeader({
  collaboratorCount,
  onAddCollaborator,
  onImport,
  onAddExpense,
}: ExpenseHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card/60 p-5 rounded-2xl border border-border/80 shadow-xs backdrop-blur-md">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
          <Receipt className="w-5 h-5 text-primary" />
          Notes de Frais & Indemnités Kilométriques
        </h2>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
          La charge HT professionnelle et la TVA sont comptabilisées à la date de dépense ; le remboursement règle uniquement la dette collaborateur.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={onAddCollaborator} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium rounded-xl border border-border bg-card hover:bg-muted/80 text-foreground transition-colors shadow-xs">
          <Users className="w-4 h-4 text-muted-foreground" />
          Collaborateurs ({collaboratorCount})
        </button>
        <button onClick={onImport} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium rounded-xl border border-border bg-card hover:bg-muted/80 text-foreground transition-colors shadow-xs">
          Importer CSV
        </button>
        <button onClick={onAddExpense} disabled={collaboratorCount === 0} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-xs disabled:opacity-50">
          <Plus className="w-4 h-4" />
          Ajouter une dépense
        </button>
      </div>
    </div>
  );
}

interface ExpenseKpisProps {
  remaining: number;
  due: number;
  reimbursed: number;
  deductibleVat: number;
  expenseCount: number;
  reimbursementCount: number;
}

export function ExpenseKpis({ remaining, due, reimbursed, deductibleVat, expenseCount, reimbursementCount }: ExpenseKpisProps) {
  const cards = [
    {
      label: "Reste à rembourser",
      value: remaining,
      description: "Total dû net restant tous collaborateurs",
      icon: <Clock className="w-4 h-4" />,
      iconClass: remaining > 0 ? "bg-amber-500/10 text-amber-500" : "bg-emerald-500/10 text-emerald-500",
      valueClass: "text-foreground",
    },
    {
      label: "Total engagé (Pro)",
      value: due,
      description: `${expenseCount} dépense(s) validée(s)`,
      icon: <Receipt className="w-4 h-4" />,
      iconClass: "bg-blue-500/10 text-blue-500",
      valueClass: "text-foreground",
    },
    {
      label: "Total remboursé",
      value: reimbursed,
      description: `${reimbursementCount} virement(s) enregistré(s)`,
      icon: <CheckCircle2 className="w-4 h-4" />,
      iconClass: "bg-emerald-500/10 text-emerald-500",
      valueClass: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "TVA déductible documentée",
      value: deductibleVat,
      description: "Attachée à la date des notes de frais",
      icon: <Sparkles className="w-4 h-4" />,
      iconClass: "bg-purple-500/10 text-purple-500",
      valueClass: "text-purple-600 dark:text-purple-400",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="bg-card p-4 rounded-2xl border border-border shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{card.label}</span>
            <div className={`p-2 rounded-xl ${card.iconClass}`}>{card.icon}</div>
          </div>
          <div className={`text-2xl font-bold mt-2 ${card.valueClass}`}>
            {card.value.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €
          </div>
          <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
        </div>
      ))}
    </div>
  );
}

interface CollaboratorOverviewProps {
  stats: CollaboratorStat[];
  onAddCollaborator: () => void;
  onAddExpense: (collaboratorId: string) => void;
  onReimburse: (collaborator: Collaborator) => void;
}

export function CollaboratorOverview({ stats, onAddCollaborator, onAddExpense, onReimburse }: CollaboratorOverviewProps) {
  return (
    <div className="bg-card rounded-2xl border border-border p-5 shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          Soldes & Remboursements par Collaborateur
        </h3>
        {stats.length === 0 && <span className="text-xs text-amber-500 font-medium">Aucun collaborateur créé</span>}
      </div>
      {stats.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-border rounded-xl">
          <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
          <p className="text-sm font-medium text-foreground">Commencez par ajouter un collaborateur</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">Définissez le barème kilométrique (€/km) pour permettre la saisie des indemnités et notes de frais.</p>
          <button onClick={onAddCollaborator} className="px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity">Ajouter un collaborateur</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stats.map((stat) => (
            <div key={stat.collaborator.id} className="bg-muted/30 hover:bg-muted/50 transition-colors p-4 rounded-xl border border-border/70 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-foreground">{stat.collaborator.name}</h4>
                    {stat.collaborator.email && <p className="text-xs text-muted-foreground">{stat.collaborator.email}</p>}
                  </div>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-secondary text-secondary-foreground">{stat.collaborator.mileageRate} €/km</span>
                </div>
                <div className="mt-3 space-y-1.5 text-xs">
                  <BalanceRow label="Total dû :" value={stat.totalDue} />
                  <BalanceRow label="Remboursé :" value={stat.totalReimbursed} valueClass="text-emerald-600 dark:text-emerald-400" />
                  <div className="flex justify-between pt-1 border-t border-border/60">
                    <span className="font-medium text-foreground">Reste à payer :</span>
                    <span className={`font-bold ${stat.remaining > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>{formatAmount(stat.remaining)}</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between gap-2">
                <button onClick={() => onAddExpense(stat.collaborator.id)} className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Dépense</button>
                <button onClick={() => onReimburse(stat.collaborator)} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors"><ArrowDownLeft className="w-3.5 h-3.5" /> Lier virement</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BalanceRow({ label, value, valueClass = "text-foreground" }: { label: string; value: number; valueClass?: string }) {
  return <div className="flex justify-between text-muted-foreground"><span>{label}</span><span className={`font-semibold ${valueClass}`}>{formatAmount(value)}</span></div>;
}

const formatAmount = (amount: number) => `${amount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €`;
