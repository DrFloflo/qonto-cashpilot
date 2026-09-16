import type { CustomerInvoice, FutureFlow, SupplierInvoice } from "@/db/schema";
import { addDays, addMonths, isAfter, parseISO } from "date-fns";
import type { ExpandedFlow } from "./types";

const MAX_RECURRING_OCCURRENCES = 52;

export function expandFutureFlows(flows: FutureFlow[], horizonDate: Date): ExpandedFlow[] {
  const expanded: ExpandedFlow[] = [];

  for (const flow of flows) {
    const amountHt = flow.amountHt;
    const vatAmount = (amountHt * flow.vatRate) / 100;
    const baseFlow = {
      id: flow.id,
      type: flow.type as ExpandedFlow["type"],
      amountHt,
      vatAmount,
      amountTtc: amountHt + vatAmount,
      category: flow.category,
      source: "future_flow" as const,
    };

    if (flow.recurrence === "none") {
      expanded.push({ ...baseFlow, date: flow.date, label: flow.label });
      continue;
    }

    let currentDate = parseISO(flow.date);
    let occurrences = 0;

    while (!isAfter(currentDate, horizonDate) && occurrences < MAX_RECURRING_OCCURRENCES) {
      expanded.push({
        ...baseFlow,
        id: `${flow.id}-${occurrences}`,
        date: currentDate.toISOString().split("T")[0],
        label: `${flow.label}${occurrences > 0 ? " (récurrent)" : ""}`,
      });

      occurrences++;
      const monthsToAdd = getRecurrenceMonths(flow.recurrence);
      if (monthsToAdd === null) break;
      currentDate = addMonths(currentDate, monthsToAdd);
    }
  }

  return expanded;
}

export function buildFutureEvents(
  manualExpanded: ExpandedFlow[],
  customerInvoiceRows: CustomerInvoice[],
  supplierInvoiceRows: SupplierInvoice[],
  todayStr: string,
): ExpandedFlow[] {
  const events = [...manualExpanded];
  const overdueInvoiceDate = addDays(parseISO(todayStr), 14).toISOString().split("T")[0];

  for (const invoice of customerInvoiceRows) {
    if (isOutstanding(invoice.status)) {
      const dueDate = invoice.dueDate || todayStr;
      events.push({
        id: invoice.id,
        date: dueDate < todayStr ? overdueInvoiceDate : dueDate,
        type: "inflow",
        amountHt: invoice.totalAmountHt,
        vatAmount: invoice.totalVatAmount,
        amountTtc: invoice.totalAmountTtc,
        label: `Facture client: ${invoice.clientName} (${invoice.invoiceNumber})`,
        category: "CA / Vente",
        source: "invoice_customer",
        status: invoice.status,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate ?? undefined,
      });
    }
  }

  for (const invoice of supplierInvoiceRows) {
    if (isOutstanding(invoice.status)) {
      const dueDate = invoice.dueDate || todayStr;
      events.push({
        id: invoice.id,
        date: dueDate < todayStr ? overdueInvoiceDate : dueDate,
        type: "outflow",
        amountHt: invoice.totalAmountHt,
        vatAmount: invoice.totalVatAmount,
        amountTtc: invoice.totalAmountTtc,
        label: `Facture fournisseur: ${invoice.supplierName} (${invoice.invoiceNumber || "N/A"})`,
        category: "Fournisseur",
        source: "invoice_supplier",
        status: invoice.status,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate ?? undefined,
      });
    }
  }

  return events;
}

export function isOutstanding(status: string): boolean {
  return status !== "paid" && status !== "canceled";
}

function getRecurrenceMonths(recurrence: string): number | null {
  if (recurrence === "monthly") return 1;
  if (recurrence === "quarterly") return 3;
  if (recurrence === "yearly") return 12;
  return null;
}
