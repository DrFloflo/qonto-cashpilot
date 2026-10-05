export interface RevenueAllocationInput {
  customerInvoiceId: string;
  collaboratorId: string;
  shareBasisPoints: number;
}

export interface RevenueCollaboratorInput {
  id: string;
  name: string;
}

export interface AllocatableRevenueDocument {
  id: string;
  originalInvoiceId?: string | null;
  documentType: "invoice" | "credit_note";
  amountHtCents: number;
}

export interface CollaboratorRevenueRow {
  collaboratorId: string;
  collaboratorName: string;
  revenueCents: number;
  sharePercent: number;
  invoiceCount: number;
  creditNoteCount: number;
}

export interface CollaboratorRevenueResult {
  rows: CollaboratorRevenueRow[];
  allocatedRevenueCents: number;
  unallocatedInvoiceCount: number;
}

/**
 * Splits cents deterministically: each executor receives the rounded amount except
 * the final executor, who receives the remainder. Credit notes inherit their
 * original invoice's allocation and therefore never require duplicate assignment.
 */
export function calculateCollaboratorRevenue(
  documents: AllocatableRevenueDocument[],
  allocations: RevenueAllocationInput[],
  collaborators: RevenueCollaboratorInput[],
): CollaboratorRevenueResult {
  const allocationMap = new Map<string, RevenueAllocationInput[]>();
  for (const allocation of allocations) {
    const list = allocationMap.get(allocation.customerInvoiceId) ?? [];
    list.push(allocation);
    allocationMap.set(allocation.customerInvoiceId, list);
  }
  const totals = new Map<string, { cents: number; invoices: Set<string>; credits: Set<string> }>();
  let unallocatedInvoiceCount = 0;

  for (const document of documents) {
    const allocationSourceId = document.documentType === "credit_note" ? document.originalInvoiceId : document.id;
    const documentAllocations = allocationSourceId ? allocationMap.get(allocationSourceId) : undefined;
    if (!documentAllocations?.length) {
      if (document.documentType === "invoice") unallocatedInvoiceCount++;
      continue;
    }
    const sorted = [...documentAllocations].sort((a, b) => a.collaboratorId.localeCompare(b.collaboratorId));
    let allocated = 0;
    sorted.forEach((allocation, index) => {
      const cents = index === sorted.length - 1
        ? document.amountHtCents - allocated
        : Math.round(document.amountHtCents * allocation.shareBasisPoints / 10_000);
      allocated += cents;
      const total = totals.get(allocation.collaboratorId) ?? { cents: 0, invoices: new Set<string>(), credits: new Set<string>() };
      total.cents += cents;
      if (document.documentType === "credit_note") total.credits.add(document.id);
      else total.invoices.add(document.id);
      totals.set(allocation.collaboratorId, total);
    });
  }

  const allocatedRevenueCents = [...totals.values()].reduce((sum, item) => sum + item.cents, 0);
  const names = new Map(collaborators.map((collaborator) => [collaborator.id, collaborator.name]));
  const rows = [...totals.entries()].map(([collaboratorId, total]) => ({
    collaboratorId,
    collaboratorName: names.get(collaboratorId) ?? "Collaborateur supprimé",
    revenueCents: total.cents,
    sharePercent: allocatedRevenueCents === 0 ? 0 : total.cents / allocatedRevenueCents * 100,
    invoiceCount: total.invoices.size,
    creditNoteCount: total.credits.size,
  })).sort((a, b) => b.revenueCents - a.revenueCents || a.collaboratorName.localeCompare(b.collaboratorName, "fr"));
  return { rows, allocatedRevenueCents, unallocatedInvoiceCount };
}

export function validateRevenueAllocations(allocations: Array<{ collaboratorId: string; sharePercent: number }>): RevenueAllocationInput[] {
  if (allocations.length === 0) throw new Error("Sélectionnez au moins un exécutant.");
  const ids = new Set<string>();
  const normalized = allocations.map((allocation) => {
    if (!allocation.collaboratorId || ids.has(allocation.collaboratorId)) throw new Error("Chaque exécutant doit être sélectionné une seule fois.");
    ids.add(allocation.collaboratorId);
    const shareBasisPoints = Math.round(allocation.sharePercent * 100);
    if (!Number.isInteger(shareBasisPoints) || shareBasisPoints <= 0 || shareBasisPoints > 10_000) throw new Error("Chaque part doit être comprise entre 0,01 % et 100 %.");
    return { customerInvoiceId: "", collaboratorId: allocation.collaboratorId, shareBasisPoints };
  });
  if (normalized.reduce((sum, allocation) => sum + allocation.shareBasisPoints, 0) !== 10_000) throw new Error("La somme des parts doit être exactement égale à 100 %.");
  return normalized;
}
