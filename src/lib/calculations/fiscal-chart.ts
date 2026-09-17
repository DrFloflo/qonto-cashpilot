import type { Transaction } from "@/db/schema";
import { addDays, addMonths, format } from "date-fns";
import type { ExpandedFlow, FiscalYearChartData, FiscalMonthPoint } from "./types";

interface BuildFiscalYearChartInput {
  fiscalStart: Date;
  fiscalEnd: Date;
  todayStr: string;
  currentCash: number;
  transactions: Transaction[];
  futureEvents: ExpandedFlow[];
}

export function buildFiscalYearChart({
  fiscalStart,
  fiscalEnd,
  todayStr,
  currentCash,
  transactions,
  futureEvents,
}: BuildFiscalYearChartInput): FiscalYearChartData {
  const fiscalStartStr = format(fiscalStart, "yyyy-MM-dd");
  const fiscalEndStr = format(fiscalEnd, "yyyy-MM-dd");
  const transactionsSinceOpening = transactions.filter((transaction) => {
    const date = transaction.settledAt.slice(0, 10);
    return date >= fiscalStartStr && date <= todayStr;
  });
  const relevantTransactions = transactionsSinceOpening.filter((transaction) => {
    const date = transaction.settledAt.slice(0, 10);
    return date <= fiscalEndStr;
  });
  const openingBalance = currentCash - transactionsSinceOpening.reduce(
    (total, transaction) => total + getSignedTransactionAmount(transaction),
    0,
  );
  const months: FiscalMonthPoint[] = [];
  let endingBalance = openingBalance;

  for (let index = 0; index < 12; index++) {
    const periodStart = addMonths(fiscalStart, index);
    const naturalPeriodEnd = addDays(addMonths(fiscalStart, index + 1), -1);
    const periodEnd = naturalPeriodEnd > fiscalEnd ? fiscalEnd : naturalPeriodEnd;
    const startDate = format(periodStart, "yyyy-MM-dd");
    const endDate = format(periodEnd, "yyyy-MM-dd");
    let inflow = 0;
    let outflow = 0;

    for (const transaction of relevantTransactions) {
      const date = transaction.settledAt.slice(0, 10);
      if (date < startDate || date > endDate) continue;
      const amount = Math.abs(transaction.amount);
      if (isCredit(transaction)) inflow += amount;
      else outflow += amount;
    }

    for (const event of futureEvents) {
      if (
        event.date < todayStr
        || event.date < startDate
        || event.date > endDate
        || event.date > fiscalEndStr
      ) continue;
      if (event.type === "inflow") inflow += event.amountTtc;
      else outflow += event.amountTtc;
    }

    inflow = roundCurrency(inflow);
    outflow = roundCurrency(outflow);
    const netFlow = roundCurrency(inflow - outflow);
    endingBalance = roundCurrency(endingBalance + netFlow);
    const labelDate = periodEnd;

    months.push({
      key: startDate,
      label: new Intl.DateTimeFormat("fr-FR", { month: "short" })
        .format(labelDate)
        .replace(".", ""),
      fullLabel: new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" })
        .format(labelDate),
      startDate,
      endDate,
      inflow,
      outflow,
      endingBalance,
      netFlow,
      isCurrent: todayStr >= startDate && todayStr <= endDate,
      isProjected: endDate > todayStr,
    });
  }

  return {
    label: `${format(fiscalStart, "dd/MM/yyyy")} – ${format(fiscalEnd, "dd/MM/yyyy")}`,
    startDate: fiscalStartStr,
    endDate: fiscalEndStr,
    months,
  };
}

function isCredit(transaction: Transaction): boolean {
  return transaction.side === "credit" || transaction.amount > 0;
}

function getSignedTransactionAmount(transaction: Transaction): number {
  const amount = Math.abs(transaction.amount);
  return isCredit(transaction) ? amount : -amount;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
