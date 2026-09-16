import { createHash } from "node:crypto";
import { addMonths, differenceInCalendarDays, parseISO } from "date-fns";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { futureFlows, transactions, type Transaction } from "@/db/schema";

const MIN_MONTHLY_GAP_DAYS = 25;
const MAX_MONTHLY_GAP_DAYS = 35;

export interface RecurringTransactionCandidate {
  detectionKey: string;
  label: string;
  type: "inflow" | "outflow";
  category: string;
  amountHt: number;
  vatRate: number;
  date: string;
  sourceTransactionIds: string[];
}

function normalizeSupplier(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getSupplier(transaction: Transaction): string {
  if (transaction.rawJson) {
    try {
      const raw = JSON.parse(transaction.rawJson) as Record<string, unknown>;
      const cleanCounterpartyName = raw.clean_counterparty_name;
      if (typeof cleanCounterpartyName === "string" && cleanCounterpartyName.trim()) {
        return cleanCounterpartyName.trim();
      }
    } catch {
      // Fall back to the transaction label when Qonto's raw payload is unavailable.
    }
  }

  return transaction.label.trim();
}

function toDateString(value: string): string {
  return value.slice(0, 10);
}

function getFinancialBreakdown(transaction: Transaction): Pick<RecurringTransactionCandidate, "amountHt" | "vatRate"> {
  const amountTtc = Math.abs(transaction.amount);
  const vatAmount = Math.min(Math.abs(transaction.vatAmount ?? 0), amountTtc);
  const amountHt = Math.max(0, amountTtc - vatAmount);
  const vatRate = amountHt > 0 ? (vatAmount / amountHt) * 100 : 0;

  return {
    amountHt: Math.round(amountHt * 100) / 100,
    vatRate: Math.round(vatRate * 10) / 10,
  };
}

/**
 * Detects equal transactions from the same counterparty on two consecutive
 * monthly cycles. An approximate monthly interval is considered 25–35 days.
 */
export function detectRecurringTransactions(
  rows: Transaction[],
  referenceDate = new Date(),
): RecurringTransactionCandidate[] {
  const groups = new Map<string, Transaction[]>();
  const recentCutoff = addMonths(referenceDate, -2).toISOString().slice(0, 10);

  for (const transaction of rows) {
    // Only recent activity can establish an active recurrence. Older recurring
    // payments may have ended and must not keep generating forecasts.
    if (toDateString(transaction.settledAt) < recentCutoff) continue;
    const supplier = normalizeSupplier(getSupplier(transaction));
    if (!supplier || transaction.amountCents === 0) continue;

    const side = transaction.side === "credit" || transaction.amountCents > 0 ? "credit" : "debit";
    const groupKey = `${side}:${Math.abs(transaction.amountCents)}:${supplier}`;
    const group = groups.get(groupKey) ?? [];
    group.push(transaction);
    groups.set(groupKey, group);
  }

  const candidates: RecurringTransactionCandidate[] = [];

  for (const [groupKey, group] of groups) {
    const ordered = group.sort((a, b) => a.settledAt.localeCompare(b.settledAt));
    let latestMatchingPair: [Transaction, Transaction] | null = null;

    for (let index = 1; index < ordered.length; index++) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      const gapDays = differenceInCalendarDays(
        parseISO(toDateString(current.settledAt)),
        parseISO(toDateString(previous.settledAt)),
      );

      if (gapDays >= MIN_MONTHLY_GAP_DAYS && gapDays <= MAX_MONTHLY_GAP_DAYS) {
        latestMatchingPair = [previous, current];
      }
    }

    if (!latestMatchingPair) continue;

    const [previous, latest] = latestMatchingPair;
    const supplier = getSupplier(latest);
    const type = latest.side === "credit" || latest.amountCents > 0 ? "inflow" : "outflow";
    const detectionKey = createHash("sha256").update(groupKey).digest("hex");
    const nextDate = addMonths(parseISO(toDateString(latest.settledAt)), 1)
      .toISOString()
      .slice(0, 10);

    candidates.push({
      detectionKey,
      label: supplier,
      type,
      category: latest.category,
      ...getFinancialBreakdown(latest),
      date: nextDate,
      sourceTransactionIds: [previous.id, latest.id],
    });
  }

  return candidates;
}

/**
 * Creates or refreshes automatic monthly flows. A user's disabled state is
 * intentionally not overwritten when a recurrence is detected again.
 */
export function syncAutomaticRecurringFlows(): number {
  const candidates = detectRecurringTransactions(db.select().from(transactions).all());
  const activeDetectionKeys = new Set(candidates.map((candidate) => candidate.detectionKey));
  const automaticFlows = db
    .select()
    .from(futureFlows)
    .all()
    .filter((flow) => flow.origin === "automatic");
  const nowIso = new Date().toISOString();

  // Remove obsolete automatic forecasts when no matching pair exists in the
  // rolling two-month window. Manual flows are never affected.
  for (const flow of automaticFlows) {
    if (!flow.detectionKey || !activeDetectionKeys.has(flow.detectionKey)) {
      db.delete(futureFlows).where(eq(futureFlows.id, flow.id)).run();
    }
  }

  for (const candidate of candidates) {
    const id = `auto-recurring-${candidate.detectionKey.slice(0, 24)}`;

    db.insert(futureFlows)
      .values({
        id,
        label: candidate.label,
        type: candidate.type,
        category: candidate.category,
        amountHt: candidate.amountHt,
        vatRate: candidate.vatRate,
        date: candidate.date,
        recurrence: "monthly",
        origin: "automatic",
        enabled: true,
        detectionKey: candidate.detectionKey,
        sourceTransactionIds: JSON.stringify(candidate.sourceTransactionIds),
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .onConflictDoUpdate({
        target: futureFlows.id,
        set: {
          label: candidate.label,
          type: candidate.type,
          category: candidate.category,
          amountHt: candidate.amountHt,
          vatRate: candidate.vatRate,
          date: candidate.date,
          recurrence: "monthly",
          sourceTransactionIds: JSON.stringify(candidate.sourceTransactionIds),
          updatedAt: nowIso,
        },
      })
      .run();
  }

  return candidates.length;
}
