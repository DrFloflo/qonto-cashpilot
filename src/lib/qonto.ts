/**
 * Qonto API Service
 * Handles server-side calls to Qonto API v2 and syncs data idempotently into SQLite.
 */

import { db } from "@/db";
import { syncAutomaticRecurringFlows } from "@/lib/recurring-transactions";
import {
  accounts,
  transactions,
  customerInvoices,
  supplierInvoices,
  syncStates,
} from "@/db/schema";

interface QontoConfig {
  apiKey: string;
  organizationId: string;
}

export function getQontoConfig(): QontoConfig | null {
  const apiKey = process.env.QONTO_API_KEY;
  const organizationId = process.env.QONTO_ORGANIZATION_ID;

  if (!apiKey || !organizationId) {
    return null;
  }

  return { apiKey: apiKey.trim(), organizationId: organizationId.trim() };
}

const QONTO_API_BASE = "https://thirdparty.qonto.com/v2";

async function qontoFetch(endpoint: string, config: QontoConfig) {
  const url = `${QONTO_API_BASE}${endpoint}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `${config.organizationId}:${config.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Qonto API Error (${res.status} ${res.statusText}): ${errorText}`);
  }

  return res.json();
}

/* Qonto invoice payloads are not published as a stable TypeScript contract. */
/* eslint-disable @typescript-eslint/no-explicit-any */
type QontoApiRecord = Record<string, any>;

async function qontoFetchAllPages(
  endpoint: string,
  collectionKeys: string[],
  config: QontoConfig,
): Promise<QontoApiRecord[]> {
  // Qonto responses vary by endpoint/version and are normalized while syncing.
  const rows: QontoApiRecord[] = [];
  const separator = endpoint.includes("?") ? "&" : "?";
  let currentPage = 1;

  while (true) {
    const data = await qontoFetch(`${endpoint}${separator}per_page=100&current_page=${currentPage}`, config);
    const pageRows = collectionKeys.reduce<QontoApiRecord[]>((found, key) => {
      if (found.length > 0) return found;
      const candidate = data?.[key];
      return Array.isArray(candidate) ? candidate as QontoApiRecord[] : found;
    }, []);
    rows.push(...pageRows);

    const meta = data?.meta;
    const hasNextPage = meta
      ? meta.next_page !== null && Number(meta.current_page ?? currentPage) < Number(meta.total_pages ?? currentPage)
      : pageRows.length === 100;
    if (!hasNextPage || pageRows.length === 0) break;
    currentPage++;
  }

  return rows;
}

export async function syncQontoData(): Promise<{ success: boolean; message: string; counts?: Record<string, number> }> {
  const config = getQontoConfig();

  if (!config) {
    return {
      success: false,
      message: "Credentials Qonto non configurés dans le fichier .env (QONTO_API_KEY, QONTO_ORGANIZATION_ID).",
    };
  }

  const nowIso = new Date().toISOString();

  try {
    // 1. Fetch organization & account details to get bank_account_id and iban
    const orgData = await qontoFetch("/organization", config);
    const bankAccounts = orgData?.organization?.bank_accounts || [];

    const mainAccount = bankAccounts[0];
    if (!mainAccount) {
      throw new Error("Aucun compte bancaire trouvé pour cette organisation dans Qonto.");
    }

    const bankAccountId = mainAccount.id || mainAccount.slug;
    const iban = mainAccount.iban;
    const balance = mainAccount.balance ?? (mainAccount.balance_cents ? mainAccount.balance_cents / 100 : 0);
    const balanceCents = mainAccount.balance_cents ?? Math.round(balance * 100);

    // Upsert account
    db.insert(accounts)
      .values({
        id: bankAccountId,
        name: mainAccount.name || orgData.organization.legal_name || "Compte principal",
        currency: mainAccount.currency || "EUR",
        balance: Number(balance),
        balanceCents: Number(balanceCents),
        updatedAt: nowIso,
      })
      .onConflictDoUpdate({
        target: accounts.id,
        set: {
          name: mainAccount.name || "Compte principal",
          balance: Number(balance),
          balanceCents: Number(balanceCents),
          updatedAt: nowIso,
        },
      })
      .run();

    // 2. Fetch transactions using bank_account_id / iban parameter
    let fetchedTransactionsCount = 0;
    try {
      let currentPage = 1;
      let hasMorePages = true;
      const MAX_PAGES = 10; // Récupère jusqu'à 1 000 transactions (100 par page)

      while (hasMorePages && currentPage <= MAX_PAGES) {
        const txParams = new URLSearchParams();
        if (bankAccountId) txParams.set("bank_account_id", bankAccountId);
        else if (iban) txParams.set("iban", iban);
        txParams.append("status[]", "completed");
        txParams.append("includes[]", "vat_details");
        txParams.set("per_page", "100");
        txParams.set("current_page", currentPage.toString());
        txParams.set("sort_by", "settled_at:desc");

        const txData = await qontoFetch(`/transactions?${txParams.toString()}`, config);
        const rawTxList = txData?.transactions || [];

        if (rawTxList.length === 0) {
          hasMorePages = false;
          break;
        }

        for (const tx of rawTxList) {
          const rawAmount = typeof tx.amount === "number" ? tx.amount : (tx.amount_cents ? tx.amount_cents / 100 : 0);
          const side = tx.side || (rawAmount >= 0 ? "credit" : "debit");
          const signedAmount = side === "debit" ? -Math.abs(rawAmount) : Math.abs(rawAmount);
          const signedCents = side === "debit" ? -Math.abs(tx.amount_cents || Math.round(rawAmount * 100)) : Math.abs(tx.amount_cents || Math.round(rawAmount * 100));

          let settledBalance: number | null = null;
          if (typeof tx.settled_balance === "number") {
            settledBalance = tx.settled_balance;
          } else if (typeof tx.settled_balance_cents === "number") {
            settledBalance = tx.settled_balance_cents / 100;
          }

          let vatAmount = 0;
          if (tx.vat_details && Array.isArray(tx.vat_details)) {
            vatAmount = tx.vat_details.reduce((acc: number, v: { amount?: number }) => acc + (v.amount || 0), 0);
          } else if (tx.vat_amount) {
            vatAmount = typeof tx.vat_amount === "object" ? parseFloat(tx.vat_amount.value || "0") : Number(tx.vat_amount);
          } else if (tx.vat_amount_cents) {
            vatAmount = tx.vat_amount_cents / 100;
          }

          let category = "Autre charge";
          if (side === "credit") {
            category = "CA / Vente";
          } else {
            const lowerLabel = (tx.label || "").toLowerCase();
            if (lowerLabel.includes("urssaf")) category = "URSSAF";
            else if (lowerLabel.includes("salaire") || lowerLabel.includes("remuneration")) category = "Salaires";
            else if (lowerLabel.includes("loyer")) category = "Loyer";
            else if (lowerLabel.includes("impot") || lowerLabel.includes("dgfip") || lowerLabel.includes("cfe") || lowerLabel.includes("tva")) category = "Impôt / taxe";
            else if (lowerLabel.includes("sub") || lowerLabel.includes("adobe") || lowerLabel.includes("google") || lowerLabel.includes("slack") || lowerLabel.includes("aws") || lowerLabel.includes("github")) category = "Abonnement";
            else category = "Fournisseur";
          }

          db.insert(transactions)
            .values({
              id: tx.id || tx.transaction_id,
              label: tx.label || "Transaction",
              amount: signedAmount,
              amountCents: signedCents,
              settledBalance: settledBalance,
              settledAt: tx.settled_at || tx.emitted_at || nowIso,
              side: side,
              operationType: tx.operation_type || null,
              category: category,
              vatAmount: vatAmount,
              rawJson: JSON.stringify(tx),
            })
            .onConflictDoUpdate({
              target: transactions.id,
              set: {
                label: tx.label || "Transaction",
                amount: signedAmount,
                amountCents: signedCents,
                settledBalance: settledBalance,
                settledAt: tx.settled_at || tx.emitted_at || nowIso,
                side: side,
                operationType: tx.operation_type || null,
                category: category,
                vatAmount: vatAmount,
                rawJson: JSON.stringify(tx),
              },
            })
            .run();
          fetchedTransactionsCount++;
        }

        // Vérification métadonnées de pagination Qonto
        const meta = txData?.meta;
        if (meta) {
          if (meta.next_page === null || meta.current_page >= meta.total_pages) {
            hasMorePages = false;
          } else {
            currentPage++;
          }
        } else if (rawTxList.length < 100) {
          hasMorePages = false;
        } else {
          currentPage++;
        }
      }
    } catch (e: unknown) {
      console.warn("Could not fetch Qonto transactions:", (e as Error).message);
    }

    // Detect recurring transactions after all transaction pages have been persisted.
    const detectedRecurringFlowsCount = syncAutomaticRecurringFlows();

    // 3. Fetch customer invoices via /v2/client_invoices
    let fetchedClientInvoicesCount = 0;
    try {
      const rawInvoices = await qontoFetchAllPages(
        "/client_invoices?exclude_imported=false",
        ["client_invoices", "invoices"],
        config,
      );

      for (const inv of rawInvoices) {
        let totalTtc = 0;
        if (inv.total_amount && typeof inv.total_amount === "object") {
          totalTtc = parseFloat(inv.total_amount.value || "0");
        } else if (typeof inv.total_amount === "number") {
          totalTtc = inv.total_amount;
        } else if (inv.total_amount_cents) {
          totalTtc = inv.total_amount_cents / 100;
        }

        let totalVat = 0;
        if (inv.vat_amount && typeof inv.vat_amount === "object") {
          totalVat = parseFloat(inv.vat_amount.value || "0");
        } else if (typeof inv.vat_amount === "number") {
          totalVat = inv.vat_amount;
        } else if (inv.vat_amount_cents) {
          totalVat = inv.vat_amount_cents / 100;
        }

        let totalHt = 0;
        if (inv.total_amount_ht) {
          totalHt = typeof inv.total_amount_ht === "object" ? parseFloat(inv.total_amount_ht.value || "0") : Number(inv.total_amount_ht);
        } else if (inv.subtotal) {
          totalHt = typeof inv.subtotal === "object" ? parseFloat(inv.subtotal.value || "0") : Number(inv.subtotal);
        } else if (inv.subtotal_cents) {
          totalHt = inv.subtotal_cents / 100;
        } else {
          totalHt = Math.max(0, totalTtc - totalVat);
        }

        const clientName = inv.client?.name || (inv.client?.first_name ? `${inv.client.first_name} ${inv.client.last_name || ""}`.trim() : "Client");

        db.insert(customerInvoices)
          .values({
            id: inv.id,
            invoiceNumber: inv.number || inv.invoice_number || `FAC-${inv.id}`,
            clientName: clientName,
            status: inv.status || "unpaid",
            issueDate: inv.issue_date || inv.created_at?.split("T")[0] || nowIso.split("T")[0],
            dueDate: inv.due_date || null,
            paidAt: inv.paid_at || null,
            totalAmountHt: Number(totalHt),
            totalVatAmount: Number(totalVat),
            totalAmountTtc: Number(totalTtc),
            rawJson: JSON.stringify(inv),
          })
          .onConflictDoUpdate({
            target: customerInvoices.id,
            set: {
              invoiceNumber: inv.number || inv.invoice_number || `FAC-${inv.id}`,
              clientName: clientName,
              status: inv.status || "unpaid",
              dueDate: inv.due_date || null,
              paidAt: inv.paid_at || null,
              totalAmountHt: Number(totalHt),
              totalVatAmount: Number(totalVat),
              totalAmountTtc: Number(totalTtc),
              rawJson: JSON.stringify(inv),
            },
          })
          .run();
        fetchedClientInvoicesCount++;
      }
    } catch (e: unknown) {
      console.warn("Could not fetch customer invoices:", (e as Error).message);
    }

    // 4. Fetch supplier invoices
    let fetchedSupplierInvoicesCount = 0;
    try {
      const rawSupplierInvoices = await qontoFetchAllPages(
        "/supplier_invoices",
        ["supplier_invoices", "invoices"],
        config,
      );

      for (const inv of rawSupplierInvoices) {
        let totalTtc = 0;
        if (inv.total_amount && typeof inv.total_amount === "object") {
          totalTtc = parseFloat(inv.total_amount.value || "0");
        } else if (typeof inv.total_amount === "number") {
          totalTtc = inv.total_amount;
        } else if (inv.total_amount_cents) {
          totalTtc = inv.total_amount_cents / 100;
        }

        let totalVat = 0;
        if (inv.vat_amount && typeof inv.vat_amount === "object") {
          totalVat = parseFloat(inv.vat_amount.value || "0");
        } else if (typeof inv.vat_amount === "number") {
          totalVat = inv.vat_amount;
        } else if (inv.vat_amount_cents) {
          totalVat = inv.vat_amount_cents / 100;
        }

        let totalHt = 0;
        if (inv.total_amount_ht) {
          totalHt = typeof inv.total_amount_ht === "object" ? parseFloat(inv.total_amount_ht.value || "0") : Number(inv.total_amount_ht);
        } else if (inv.subtotal) {
          totalHt = typeof inv.subtotal === "object" ? parseFloat(inv.subtotal.value || "0") : Number(inv.subtotal);
        } else {
          totalHt = Math.max(0, totalTtc - totalVat);
        }

        const supplierName = inv.supplier?.name || inv.supplier_name || "Fournisseur";

        db.insert(supplierInvoices)
          .values({
            id: inv.id,
            invoiceNumber: inv.invoice_number || inv.number || `FOURN-${inv.id}`,
            supplierName: supplierName,
            status: inv.status || "unpaid",
            issueDate: inv.issue_date || inv.created_at?.split("T")[0] || nowIso.split("T")[0],
            dueDate: inv.due_date || null,
            paidAt: inv.paid_at || null,
            totalAmountHt: Number(totalHt),
            totalVatAmount: Number(totalVat),
            totalAmountTtc: Number(totalTtc),
            rawJson: JSON.stringify(inv),
          })
          .onConflictDoUpdate({
            target: supplierInvoices.id,
            set: {
              invoiceNumber: inv.invoice_number || inv.number || `FOURN-${inv.id}`,
              supplierName: supplierName,
              status: inv.status || "unpaid",
              dueDate: inv.due_date || null,
              paidAt: inv.paid_at || null,
              totalAmountHt: Number(totalHt),
              totalVatAmount: Number(totalVat),
              totalAmountTtc: Number(totalTtc),
              rawJson: JSON.stringify(inv),
            },
          })
          .run();
        fetchedSupplierInvoicesCount++;
      }
    } catch (e: unknown) {
      console.warn("Could not fetch supplier invoices:", (e as Error).message);
    }

    // Update sync state
    db.insert(syncStates)
      .values({
        id: "default",
        lastSyncAt: nowIso,
        status: "success",
        errorMessage: null,
      })
      .onConflictDoUpdate({
        target: syncStates.id,
        set: {
          lastSyncAt: nowIso,
          status: "success",
          errorMessage: null,
        },
      })
      .run();

    return {
      success: true,
      message: `Synchronisation réussie ! (${fetchedTransactionsCount} transaction(s), ${fetchedClientInvoicesCount} facture(s) client, ${fetchedSupplierInvoicesCount} facture(s) fournisseur, ${detectedRecurringFlowsCount} récurrence(s) détectée(s))`,
      counts: {
        transactions: fetchedTransactionsCount,
        customerInvoices: fetchedClientInvoicesCount,
        supplierInvoices: fetchedSupplierInvoicesCount,
        recurringFlows: detectedRecurringFlowsCount,
      },
    };
  } catch (error: unknown) {
    const errorMsg = (error as Error).message || "Erreur inconnue";
    db.insert(syncStates)
      .values({
        id: "default",
        lastSyncAt: nowIso,
        status: "error",
        errorMessage: errorMsg,
      })
      .onConflictDoUpdate({
        target: syncStates.id,
        set: {
          status: "error",
          errorMessage: errorMsg,
        },
      })
      .run();

    return {
      success: false,
      message: `Erreur lors de la synchronisation : ${errorMsg}`,
    };
  }
}
