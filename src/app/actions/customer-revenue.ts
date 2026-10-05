"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { canonicalCustomers, collaborators, customerInvoiceExecutorAllocations, customerInvoices, customerMergeMappings } from "@/db/schema";
import {
  calculateCustomerRevenue,
  getAvailableCustomerRevenueYears,
  getCustomerIdentity,
  type CustomerMergeRule,
} from "@/lib/calculations/customer-revenue";
import { calculateCollaboratorRevenue, validateRevenueAllocations } from "@/lib/calculations/collaborator-revenue";

export interface CustomerMergeInput {
  displayName: string;
  identityKeys: string[];
}

export async function getCustomerRevenueAction(year?: number) {
  const invoices = db.select().from(customerInvoices).all();
  const currentYear = new Date().getUTCFullYear();
  const availableYears = getAvailableCustomerRevenueYears(invoices);
  const selectedYear = year === undefined ? currentYear : validateYear(year, availableYears);
  const canonicals = db.select().from(canonicalCustomers).all();
  const canonicalById = new Map(canonicals.map((item) => [item.id, item]));
  const mappings = db.select().from(customerMergeMappings).all();
  const rules: CustomerMergeRule[] = mappings.flatMap((mapping) => {
    const canonical = canonicalById.get(mapping.canonicalCustomerId);
    return canonical ? [{ canonicalCustomerId: canonical.id, canonicalName: canonical.displayName, identityKey: mapping.identityKey, sourceLabel: mapping.sourceLabel }] : [];
  });
  const identities = new Map<string, { key: string; label: string; type: "qonto_id" | "normalized_name" | "unknown" }>();
  for (const invoice of invoices) {
    const identity = getCustomerIdentity(invoice);
    identities.set(identity.key, identity);
  }
  return {
    availableYears,
    result: calculateCustomerRevenue(invoices, selectedYear, rules),
    mergeCandidates: [...identities.values()].sort((a, b) => a.label.localeCompare(b.label, "fr")),
    merges: canonicals.map((canonical) => ({
      id: canonical.id,
      displayName: canonical.displayName,
      mappings: mappings.filter((mapping) => mapping.canonicalCustomerId === canonical.id),
    })).sort((a, b) => a.displayName.localeCompare(b.displayName, "fr")),
    configured: Boolean(process.env.QONTO_API_KEY && (process.env.QONTO_ORGANIZATION_SLUG || process.env.QONTO_ORGANIZATION_ID)),
    sourceDocumentCount: invoices.length,
    collaborators: db.select().from(collaborators).all().sort((a, b) => a.name.localeCompare(b.name, "fr")),
    executorAllocations: db.select().from(customerInvoiceExecutorAllocations).all(),
    collaboratorRevenue: calculateCollaboratorRevenue(
      calculateCustomerRevenue(invoices, selectedYear, rules).rows.flatMap((row) => row.documents.map((document) => ({
        id: document.id,
        originalInvoiceId: invoices.find((invoice) => invoice.id === document.id)?.originalInvoiceId,
        documentType: document.documentType,
        amountHtCents: document.amountHtCents,
      }))),
      db.select().from(customerInvoiceExecutorAllocations).all(),
      db.select().from(collaborators).all(),
    ),
  };
}

export async function saveInvoiceExecutorAllocationsAction(
  customerInvoiceId: string,
  allocations: Array<{ collaboratorId: string; sharePercent: number }>,
  year?: number,
) {
  const invoice = db.select().from(customerInvoices).where(eq(customerInvoices.id, customerInvoiceId)).all()[0];
  if (!invoice || invoice.documentType === "credit_note") throw new Error("Seules les factures sources peuvent être attribuées.");
  const normalized = validateRevenueAllocations(allocations);
  const knownCollaborators = new Set(db.select({ id: collaborators.id }).from(collaborators).all().map((item) => item.id));
  if (normalized.some((item) => !knownCollaborators.has(item.collaboratorId))) throw new Error("Un exécutant sélectionné n’existe plus.");
  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.delete(customerInvoiceExecutorAllocations).where(eq(customerInvoiceExecutorAllocations.customerInvoiceId, customerInvoiceId)).run();
    tx.insert(customerInvoiceExecutorAllocations).values(normalized.map((allocation) => ({
      id: `invoice-executor-${crypto.randomUUID()}`,
      customerInvoiceId,
      collaboratorId: allocation.collaboratorId,
      shareBasisPoints: allocation.shareBasisPoints,
      createdAt: now,
      updatedAt: now,
    }))).run();
  });
  revalidatePath("/");
  return getCustomerRevenueAction(year);
}

export async function createCustomerMergeAction(input: CustomerMergeInput, year?: number) {
  const displayName = input.displayName.trim();
  const identityKeys = [...new Set(input.identityKeys.map((key) => key.trim()).filter(Boolean))];
  if (!displayName) throw new Error("Le nom du client canonique est obligatoire.");
  if (identityKeys.length < 2) throw new Error("Sélectionnez au moins deux identités client à fusionner.");

  const invoices = db.select().from(customerInvoices).all();
  const identities = new Map(invoices.map((invoice) => {
    const identity = getCustomerIdentity(invoice);
    return [identity.key, identity] as const;
  }));
  const selected = identityKeys.map((key) => identities.get(key));
  if (selected.some((identity) => !identity)) throw new Error("Une identité client sélectionnée n’existe plus.");

  const now = new Date().toISOString();
  const canonicalId = `customer-${crypto.randomUUID()}`;
  db.transaction((tx) => {
    tx.insert(canonicalCustomers).values({ id: canonicalId, displayName, createdAt: now, updatedAt: now }).run();
    tx.insert(customerMergeMappings).values(selected.map((identity) => ({
      id: `customer-map-${crypto.randomUUID()}`,
      canonicalCustomerId: canonicalId,
      identityKey: identity!.key,
      identityType: identity!.type,
      sourceLabel: identity!.label,
      createdAt: now,
      updatedAt: now,
    }))).onConflictDoUpdate({
      target: customerMergeMappings.identityKey,
      set: { canonicalCustomerId: canonicalId, updatedAt: now },
    }).run();
  });
  cleanupEmptyCanonicals();
  revalidatePath("/");
  return getCustomerRevenueAction(year);
}

export async function cancelCustomerMergeAction(canonicalCustomerId: string, year?: number) {
  if (!canonicalCustomerId.trim()) throw new Error("Fusion client invalide.");
  const existing = db.select().from(canonicalCustomers).where(eq(canonicalCustomers.id, canonicalCustomerId)).all()[0];
  if (!existing) throw new Error("Fusion client introuvable.");
  db.delete(canonicalCustomers).where(eq(canonicalCustomers.id, canonicalCustomerId)).run();
  revalidatePath("/");
  return getCustomerRevenueAction(year);
}

function validateYear(year: number, availableYears: number[]): number {
  if (!Number.isInteger(year) || !availableYears.includes(year)) throw new Error("Année civile indisponible.");
  return year;
}

function cleanupEmptyCanonicals() {
  for (const canonical of db.select().from(canonicalCustomers).all()) {
    const mapping = db.select({ id: customerMergeMappings.id }).from(customerMergeMappings).where(eq(customerMergeMappings.canonicalCustomerId, canonical.id)).all()[0];
    if (!mapping) db.delete(canonicalCustomers).where(eq(canonicalCustomers.id, canonical.id)).run();
  }
}
