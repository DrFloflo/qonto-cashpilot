import type { Transaction } from "@/db/schema";
import { addDays, isAfter } from "date-fns";
import type { ChartDayOperation, ChartPoint, ExpandedFlow, ProjectionTimeframes } from "./types";

interface GenerateChartSeriesInput {
  now: Date;
  todayStr: string;
  currentCash: number;
  transactions: Transaction[];
  futureEvents: ExpandedFlow[];
  pastDays?: number;
  daysAhead?: number;
  stepDays?: number;
}

type TransactionDay = {
  inflow: number;
  outflow: number;
  net: number;
  settledBalance?: number;
  operations: ChartDayOperation[];
};

type FutureDay = {
  inflow: number;
  outflow: number;
  operations: ChartDayOperation[];
};

export function calculateProjectedCash(
  currentCash: number,
  futureEvents: ExpandedFlow[],
  todayStr: string,
  targetDate: string,
): number {
  const projected = futureEvents.reduce((cash, event) => {
    if (event.date < todayStr || event.date > targetDate) return cash;
    return cash + (event.type === "inflow" ? event.amountTtc : -event.amountTtc);
  }, currentCash);

  return roundCurrency(projected);
}

export function generateProjectionTimeframes(
  input: Omit<GenerateChartSeriesInput, "daysAhead">,
): ProjectionTimeframes {
  return {
    timeframe30d: generateChartSeries({ ...input, daysAhead: 30 }),
    timeframe60d: generateChartSeries({ ...input, daysAhead: 60 }),
    timeframe90d: generateChartSeries({ ...input, daysAhead: 90 }),
    timeframe12m: generateChartSeries({ ...input, daysAhead: 365 }),
  };
}

export function generateChartSeries({
  now,
  todayStr,
  currentCash,
  transactions,
  futureEvents,
  pastDays = 30,
  daysAhead = 60,
  stepDays = 1,
}: GenerateChartSeriesInput): ChartPoint[] {
  const transactionDays = groupTransactionsByDate(transactions);
  const futureDays = groupFutureEventsByDate(futureEvents);
  const pastBalances = calculatePastBalances(now, pastDays, currentCash, transactionDays);
  const points: ChartPoint[] = [];
  const endDate = addDays(now, daysAhead);
  let currentDate = addDays(now, -pastDays);
  let projectedCash = currentCash;

  while (!isAfter(currentDate, endDate)) {
    const date = currentDate.toISOString().split("T")[0];
    const isToday = date === todayStr;
    const isPast = date < todayStr;
    const transactionDay = transactionDays[date];
    const futureDay = futureDays[date];
    let actualBalance: number | undefined;
    let projectedBalance: number | undefined;

    if (isPast) {
      actualBalance = pastBalances[date] ?? currentCash;
    } else if (isToday) {
      actualBalance = currentCash;
      projectedBalance = currentCash;
    } else {
      if (futureDay) projectedCash += futureDay.inflow - futureDay.outflow;
      projectedBalance = roundCurrency(projectedCash);
    }

    const inflow = isPast
      ? transactionDay?.inflow || 0
      : isToday
        ? transactionDay?.inflow || futureDay?.inflow || 0
        : futureDay?.inflow || 0;
    const outflow = isPast
      ? transactionDay?.outflow || 0
      : isToday
        ? transactionDay?.outflow || futureDay?.outflow || 0
        : futureDay?.outflow || 0;
    const operations = getDayOperations(isPast, isToday, transactionDay, futureDay);

    points.push({
      date,
      label: new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(currentDate),
      actualBalance: actualBalance === undefined ? undefined : roundCurrency(actualBalance),
      projectedBalance: projectedBalance === undefined ? undefined : roundCurrency(projectedBalance),
      inflow: inflow > 0 ? roundCurrency(inflow) : undefined,
      outflow: outflow > 0 ? roundCurrency(outflow) : undefined,
      isToday,
      operations: operations.length > 0 ? operations : undefined,
    });

    currentDate = addDays(currentDate, stepDays);
  }

  return points;
}

function groupTransactionsByDate(transactions: Transaction[]): Record<string, TransactionDay> {
  const days: Record<string, TransactionDay> = {};
  const sortedTransactions = [...transactions].sort((a, b) => a.settledAt.localeCompare(b.settledAt));

  for (const transaction of sortedTransactions) {
    const date = transaction.settledAt.split("T")[0];
    const day = days[date] ??= { inflow: 0, outflow: 0, net: 0, operations: [] };
    const isCredit = transaction.side === "credit" || transaction.amount > 0;
    const amount = Math.abs(transaction.amount);

    if (isCredit) {
      day.inflow += amount;
      day.net += amount;
    } else {
      day.outflow += amount;
      day.net -= amount;
    }
    if (transaction.settledBalance !== null && transaction.settledBalance !== undefined) {
      day.settledBalance = transaction.settledBalance;
    }
    day.operations.push({
      id: transaction.id,
      label: transaction.label,
      category: transaction.category || (isCredit ? "CA / Vente" : "Charge"),
      amount,
      type: isCredit ? "inflow" : "outflow",
      source: "qonto_transaction",
    });
  }

  return days;
}

function groupFutureEventsByDate(events: ExpandedFlow[]): Record<string, FutureDay> {
  const days: Record<string, FutureDay> = {};

  for (const event of events) {
    const day = days[event.date] ??= { inflow: 0, outflow: 0, operations: [] };
    if (event.type === "inflow") day.inflow += event.amountTtc;
    else day.outflow += event.amountTtc;
    day.operations.push({
      id: `future-${event.date}-${event.label}`,
      label: event.label,
      category: event.category,
      amount: event.amountTtc,
      type: event.type,
      source: event.source,
    });
  }

  return days;
}

function calculatePastBalances(
  now: Date,
  pastDays: number,
  currentCash: number,
  transactionDays: Record<string, TransactionDay>,
): Record<string, number> {
  const balances: Record<string, number> = {};
  let balance = currentCash;

  for (let dayOffset = 0; dayOffset <= pastDays; dayOffset++) {
    const date = addDays(now, -dayOffset).toISOString().split("T")[0];
    const day = transactionDays[date];
    if (day?.settledBalance !== undefined) {
      balances[date] = day.settledBalance;
      balance = day.settledBalance - day.net;
    } else {
      balances[date] = balance;
      if (day) balance -= day.net;
    }
  }

  return balances;
}

function getDayOperations(
  isPast: boolean,
  isToday: boolean,
  transactionDay?: TransactionDay,
  futureDay?: FutureDay,
): ChartDayOperation[] {
  if (isPast) return transactionDay?.operations ? [...transactionDay.operations] : [];
  if (!isToday) return futureDay?.operations ? [...futureDay.operations] : [];
  return [...(transactionDay?.operations || []), ...(futureDay?.operations || [])];
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
