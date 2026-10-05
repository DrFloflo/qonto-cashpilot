"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Merge, Search, Undo2, UserRoundCog, X } from "lucide-react";
import { cancelCustomerMergeAction, createCustomerMergeAction, getCustomerRevenueAction, saveInvoiceExecutorAllocationsAction } from "@/app/actions";
import type { CustomerRevenueDocument, CustomerRevenueRow } from "@/lib/calculations/customer-revenue";

type Data = Awaited<ReturnType<typeof getCustomerRevenueAction>>;
type SortKey = "netRevenueCents" | "sharePercent" | "customerName" | "invoiceCount" | "lastPaymentDate";
const COLORS = ["#18181b", "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#ca8a04", "#16a34a", "#0891b2", "#4f46e5", "#9333ea", "#71717a"];
const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
const money = (cents: number) => euro.format(cents / 100);
const percent = (value: number) => `${value.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

export function CustomerRevenueSection() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [showZero, setShowZero] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; direction: 1 | -1 }>({ key: "netRevenueCents", direction: -1 });
  const [selected, setSelected] = useState<CustomerRevenueRow | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeName, setMergeName] = useState("");
  const [mergeKeys, setMergeKeys] = useState<string[]>([]);
  const [assignmentDocument, setAssignmentDocument] = useState<CustomerRevenueDocument | null>(null);
  const [assignmentShares, setAssignmentShares] = useState<Array<{ collaboratorId: string; sharePercent: string }>>([]);

  const load = useCallback((year?: number) => startTransition(async () => {
    try { setData(await getCustomerRevenueAction(year)); setError(null); }
    catch (reason) { setError((reason as Error).message || "Erreur de chargement."); }
  }), []);
  useEffect(() => load(), [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    const normalizedQuery = query.trim().toLocaleLowerCase("fr");
    return data.result.rows.filter((row) => (showZero || row.netRevenueCents !== 0) && (!normalizedQuery || `${row.customerName} ${row.variants.join(" ")}`.toLocaleLowerCase("fr").includes(normalizedQuery))).sort((a, b) => {
      const left = a[sort.key]; const right = b[sort.key];
      return (typeof left === "string" ? left.localeCompare(String(right), "fr") : Number(left) - Number(right)) * sort.direction;
    });
  }, [data, query, showZero, sort]);

  const changeSort = (key: SortKey) => setSort((current) => ({ key, direction: current.key === key ? (current.direction === 1 ? -1 : 1) : key === "customerName" ? 1 : -1 }));
  const submitMerge = () => startTransition(async () => {
    try { const next = await createCustomerMergeAction({ displayName: mergeName, identityKeys: mergeKeys }, data?.result.year); setData(next); setMergeOpen(false); setMergeName(""); setMergeKeys([]); setError(null); }
    catch (reason) { setError((reason as Error).message); }
  });
  const cancelMerge = (id: string) => startTransition(async () => {
    try { setData(await cancelCustomerMergeAction(id, data?.result.year)); setSelected(null); }
    catch (reason) { setError((reason as Error).message); }
  });
  const openAssignment = (document: CustomerRevenueDocument) => {
    const current = data?.executorAllocations.filter((item) => item.customerInvoiceId === document.id) ?? [];
    setAssignmentDocument(document);
    setAssignmentShares(current.length
      ? current.map((item) => ({ collaboratorId: item.collaboratorId, sharePercent: String(item.shareBasisPoints / 100) }))
      : [{ collaboratorId: data?.collaborators.find((item) => item.active)?.id ?? "", sharePercent: "100" }]);
  };
  const saveAssignment = () => {
    if (!assignmentDocument || !data) return;
    startTransition(async () => {
      try {
        setData(await saveInvoiceExecutorAllocationsAction(assignmentDocument.id, assignmentShares.map((item) => ({ collaboratorId: item.collaboratorId, sharePercent: Number(item.sharePercent) })), data.result.year));
        setAssignmentDocument(null);
        setError(null);
      } catch (reason) { setError((reason as Error).message); }
    });
  };

  if (!data && isPending) return <State title="Chargement du CA par client…" />;
  if (!data) return <State title={error || "Impossible de charger les données."} danger />;
  const { result } = data;
  const emptyMessage = data.sourceDocumentCount === 0 ? (data.configured ? "Aucune facture client synchronisée." : "Synchronisation Qonto non configurée ou aucune facture synchronisée.") : "Aucune facture payée éligible sur cette année civile.";

  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-bold">CA par client</h2><p className="text-sm text-muted-foreground">CA HT encaissé du {result.periodStart} au {result.periodEnd}</p></div><div className="flex gap-2"><label className="text-sm"><span className="mb-1 block text-muted-foreground">Année civile</span><select className="input min-w-32" value={result.year} disabled={isPending} onChange={(event) => load(Number(event.target.value))}>{data.availableYears.map((year) => <option key={year}>{year}</option>)}</select></label><button className="self-end rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted" onClick={() => setMergeOpen(true)}><Merge className="mr-2 inline h-4 w-4"/>Fusionner</button></div></header>
    {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Kpi label="CA net encaissé HT" value={money(result.netRevenueCents)} /><Kpi label="Avoirs HT déduits" value={money(result.creditNotesCents)} /><Kpi label="Clients actifs" value={String(result.activeCustomerCount)} /><Kpi label="Poids du top 1" value={percent(result.topOnePercent)} /><Kpi label="Poids cumulé top 3" value={percent(result.topThreePercent)} /></div>
    {result.eligibleDocumentCount === 0 ? <State title={emptyMessage} /> : <>
      {result.netRevenueCents <= 0 && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Le CA net total est {result.netRevenueCents === 0 ? "nul" : "négatif"}. Les parts sont indicatives et valent 0 % lorsque le total est nul.</p>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(17rem,1fr)]"><section className="rounded-2xl border border-border bg-card p-4"><h3 className="font-semibold">Répartition des clients positifs</h3><p className="text-xs text-muted-foreground">Le dénominateur inclut les clients négatifs ; l’anneau peut donc ne pas représenter 100 % du total net.</p>{result.chart.length ? <div className="h-96"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={result.chart} dataKey="valueCents" nameKey="name" innerRadius="48%" outerRadius="72%" paddingAngle={1}>{result.chart.map((item, index) => <Cell key={item.customerKey} fill={COLORS[index % COLORS.length]}/>)}</Pie><Tooltip formatter={(value, _name, entry) => [money(Number(value)), `${entry.payload.name} · ${percent(entry.payload.sharePercent)}`]}/><Legend formatter={(value, entry) => `${value} — ${percent(Number((entry.payload as { sharePercent?: number })?.sharePercent ?? 0))}`}/></PieChart></ResponsiveContainer></div> : <State title="Aucun client au CA strictement positif." />}</section>
      <section className="rounded-2xl border border-border bg-card p-4"><h3 className="font-semibold text-red-700">CA net négatif</h3>{result.negativeCustomers.length ? <ul className="mt-3 space-y-2">{result.negativeCustomers.map((row) => <li key={row.customerKey} className="flex justify-between gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-800"><button className="text-left font-medium hover:underline" onClick={() => setSelected(row)}>{row.customerName}</button><strong>{money(row.netRevenueCents)}</strong></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">Aucun client avec un solde négatif.</p>}</section></div>
      <section className="rounded-2xl border border-border bg-card p-4"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><label className="relative min-w-64 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><input className="input input-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un client…"/></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showZero} onChange={(event) => setShowZero(event.target.checked)}/>Afficher les CA nuls</label></div><div className="max-h-[38rem] overflow-auto"><table className="w-full min-w-[900px] text-sm"><thead className="sticky top-0 bg-card"><tr className="border-b text-left text-muted-foreground"><th className="p-3">Rang</th><Sortable label="Client canonique" field="customerName" onSort={changeSort}/><Sortable label="CA net HT" field="netRevenueCents" onSort={changeSort}/><Sortable label="Part" field="sharePercent" onSort={changeSort}/><Sortable label="Factures" field="invoiceCount" onSort={changeSort}/><th className="p-3">Avoirs HT</th><th className="p-3">Panier moyen HT</th><Sortable label="Dernier encaissement" field="lastPaymentDate" onSort={changeSort}/></tr></thead><tbody>{rows.map((row) => <tr key={row.customerKey} className="cursor-pointer border-b border-border/60 hover:bg-muted/50" onClick={() => setSelected(row)}><td className="p-3">{row.rank}</td><td className="p-3 font-semibold">{row.customerName}<div className="text-xs font-normal text-muted-foreground">{row.variants.join(" · ")}</div></td><td className={`p-3 font-semibold ${row.netRevenueCents < 0 ? "text-red-600" : ""}`}>{money(row.netRevenueCents)}</td><td className={row.sharePercent < 0 ? "p-3 text-red-600" : "p-3"}>{percent(row.sharePercent)}</td><td className="p-3">{row.invoiceCount}</td><td className="p-3">{money(row.creditNotesCents)}</td><td className="p-3">{money(row.averageBasketCents)}</td><td className="p-3">{row.lastPaymentDate}</td></tr>)}</tbody></table></div>{rows.length === 0 && <State title="Aucun client ne correspond aux filtres." />}</section>
    </>}
    <CollaboratorRevenuePanel data={data}/>
    {selected && <DetailModal row={selected} onClose={() => setSelected(null)} onCancelMerge={selected.canonicalCustomerId ? () => cancelMerge(selected.canonicalCustomerId!) : undefined} onAssign={openAssignment} pending={isPending}/>}
    {mergeOpen && <Modal title="Fusionner des identités client" onClose={() => setMergeOpen(false)}><div className="space-y-4"><label className="block text-sm"><span className="mb-1 block font-medium">Nom canonique</span><input className="input" value={mergeName} onChange={(event) => setMergeName(event.target.value)} placeholder="Ex. Acme Groupe"/></label><fieldset><legend className="mb-2 text-sm font-medium">Identités à fusionner (2 minimum)</legend><div className="max-h-64 space-y-1 overflow-auto rounded-xl border border-border p-2">{data.mergeCandidates.map((item) => <label key={item.key} className="flex items-center gap-2 rounded-lg p-2 text-sm hover:bg-muted"><input type="checkbox" checked={mergeKeys.includes(item.key)} onChange={(event) => setMergeKeys((current) => event.target.checked ? [...current, item.key] : current.filter((key) => key !== item.key))}/><span>{item.label}</span><code className="ml-auto text-xs text-muted-foreground">{item.key}</code></label>)}</div></fieldset><div className="flex justify-end"><button disabled={isPending || mergeKeys.length < 2 || !mergeName.trim()} onClick={submitMerge} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{isPending ? "Fusion…" : "Créer la fusion"}</button></div>{data.merges.length > 0 && <div className="border-t border-border pt-4"><h4 className="mb-2 font-semibold">Fusions existantes</h4>{data.merges.map((merge) => <div key={merge.id} className="mb-2 flex items-center justify-between rounded-lg bg-muted p-3 text-sm"><span><strong>{merge.displayName}</strong> — {merge.mappings.map((item) => item.sourceLabel).join(", ")}</span><button disabled={isPending} className="rounded-lg p-2 hover:bg-background" title="Annuler" onClick={() => cancelMerge(merge.id)}><Undo2 className="h-4 w-4"/></button></div>)}</div>}</div></Modal>}
    {assignmentDocument && <AssignmentModal document={assignmentDocument} collaborators={data.collaborators.filter((item) => item.active)} shares={assignmentShares} setShares={setAssignmentShares} pending={isPending} onSave={saveAssignment} onClose={() => setAssignmentDocument(null)}/>}
  </div>;
}

function Sortable({ label, field, onSort }: { label: string; field: SortKey; onSort: (key: SortKey) => void }) { return <th className="p-3"><button className="font-medium hover:text-foreground" onClick={() => onSort(field)}>{label} ↕</button></th>; }
function Kpi({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-bold">{value}</p></div>; }
function State({ title, danger = false }: { title: string; danger?: boolean }) { return <div className={`rounded-2xl border border-border bg-card p-10 text-center text-sm ${danger ? "text-red-600" : "text-muted-foreground"}`}>{title}</div>; }
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={onClose}><div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-2xl bg-background p-6 shadow-xl" onMouseDown={(event) => event.stopPropagation()}><div className="mb-5 flex items-center justify-between"><h3 className="text-xl font-bold">{title}</h3><button onClick={onClose} aria-label="Fermer"><X/></button></div>{children}</div></div>; }
function DetailModal({ row, onClose, onCancelMerge, onAssign, pending }: { row: CustomerRevenueRow; onClose: () => void; onCancelMerge?: () => void; onAssign: (document: CustomerRevenueDocument) => void; pending: boolean }) { return <Modal title={row.customerName} onClose={onClose}><div className="space-y-5"><div className="grid gap-3 sm:grid-cols-4"><Kpi label="CA net HT" value={money(row.netRevenueCents)}/><Kpi label="Part" value={percent(row.sharePercent)}/><Kpi label="Factures payées" value={String(row.invoiceCount)}/><Kpi label="Avoirs" value={`${row.creditNoteCount} · ${money(row.creditNotesCents)}`}/></div><p className="text-sm text-muted-foreground">Variantes : {row.variants.join(", ")}</p>{onCancelMerge && <button disabled={pending} onClick={onCancelMerge} className="rounded-xl border border-border px-3 py-2 text-sm font-semibold"><Undo2 className="mr-2 inline h-4 w-4"/>Annuler cette fusion</button>}<div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b text-left text-muted-foreground">{["Document", "Type", "Émission", "Encaissement retenu", "Statut", "HT", "TVA", "TTC", "Exécutants"].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{row.documents.map((document) => <tr key={document.id} className="border-b border-border/60"><td className="p-3 font-medium">{document.invoiceNumber}</td><td className="p-3">{document.documentType === "credit_note" ? "Avoir" : "Facture"}</td><td className="p-3">{document.issueDate}</td><td className="p-3">{document.recognitionDate}{document.usedIssueDateFallback && <div className="text-xs text-amber-700">Date d’émission utilisée (paiement absent)</div>}</td><td className="p-3">{document.status}</td><td className="p-3">{money(document.amountHtCents)}</td><td className="p-3">{money(document.vatCents)}</td><td className="p-3">{money(document.amountTtcCents)}</td><td className="p-3">{document.documentType === "invoice" ? <button className="rounded-lg border border-border p-2 hover:bg-muted" title="Attribuer les exécutants" onClick={() => onAssign(document)}><UserRoundCog className="h-4 w-4"/></button> : <span className="text-xs text-muted-foreground">Hérités de la facture</span>}</td></tr>)}</tbody><tfoot><tr className="font-bold"><td className="p-3" colSpan={5}>Sous-totaux</td><td className="p-3">Factures {money(row.invoiceRevenueCents)}<br/>Avoirs −{money(row.creditNotesCents)}<br/>Net {money(row.netRevenueCents)}</td><td/><td/><td/></tr></tfoot></table></div></div></Modal>; }

function CollaboratorRevenuePanel({ data }: { data: Data }) {
  const revenue = data.collaboratorRevenue;
  return <section className="rounded-2xl border border-border bg-card p-4"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">CA par collaborateur exécutant</h3><p className="text-xs text-muted-foreground">Répartition des factures attribuées ; les avoirs reprennent automatiquement les parts de leur facture d’origine.</p></div><Kpi label="CA attribué HT" value={money(revenue.allocatedRevenueCents)}/></div>{revenue.unallocatedInvoiceCount > 0 && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{revenue.unallocatedInvoiceCount} facture(s) payée(s) sans attribution.</p>}<div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Collaborateur</th><th className="p-3">CA net attribué HT</th><th className="p-3">Part du CA attribué</th><th className="p-3">Factures</th><th className="p-3">Avoirs</th></tr></thead><tbody>{revenue.rows.map((row) => <tr key={row.collaboratorId} className="border-b border-border/60"><td className="p-3 font-semibold">{row.collaboratorName}</td><td className="p-3">{money(row.revenueCents)}</td><td className="p-3">{percent(row.sharePercent)}</td><td className="p-3">{row.invoiceCount}</td><td className="p-3">{row.creditNoteCount}</td></tr>)}</tbody></table></div>{revenue.rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Aucun CA n’est encore attribué à un collaborateur.</p>}</section>;
}

function AssignmentModal({ document, collaborators, shares, setShares, pending, onSave, onClose }: { document: CustomerRevenueDocument; collaborators: Data["collaborators"]; shares: Array<{ collaboratorId: string; sharePercent: string }>; setShares: React.Dispatch<React.SetStateAction<Array<{ collaboratorId: string; sharePercent: string }>>>; pending: boolean; onSave: () => void; onClose: () => void }) {
  const total = shares.reduce((sum, item) => sum + (Number(item.sharePercent) || 0), 0);
  return <Modal title={`Exécutants — ${document.invoiceNumber}`} onClose={onClose}><div className="space-y-4"><p className="text-sm text-muted-foreground">Montant HT : {money(document.amountHtCents)}. La somme des parts doit être exactement égale à 100 %.</p>{collaborators.length === 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Créez d’abord des collaborateurs dans l’onglet Notes de Frais & IK.</p>}{shares.map((share, index) => <div key={index} className="grid grid-cols-[1fr_8rem_auto] gap-2"><select className="input" value={share.collaboratorId} onChange={(event) => setShares((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, collaboratorId: event.target.value } : item))}><option value="">Sélectionner…</option>{collaborators.map((collaborator) => <option key={collaborator.id} value={collaborator.id}>{collaborator.name}</option>)}</select><label className="relative"><input className="input pr-7" type="number" min="0.01" max="100" step="0.01" value={share.sharePercent} onChange={(event) => setShares((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, sharePercent: event.target.value } : item))}/><span className="absolute right-3 top-2.5 text-sm">%</span></label><button className="rounded-lg border border-border px-3" onClick={() => setShares((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X className="h-4 w-4"/></button></div>)}<button disabled={!collaborators.length} className="rounded-xl border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50" onClick={() => setShares((current) => [...current, { collaboratorId: "", sharePercent: "0" }])}>Ajouter un exécutant</button><div className={`text-right text-sm font-bold ${Math.round(total * 100) === 10000 ? "text-green-700" : "text-red-600"}`}>Total : {total.toFixed(2)} %</div><div className="flex justify-end"><button disabled={pending || !collaborators.length || Math.round(total * 100) !== 10000 || shares.some((item) => !item.collaboratorId)} onClick={onSave} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{pending ? "Enregistrement…" : "Enregistrer l’attribution"}</button></div></div></Modal>;
}
