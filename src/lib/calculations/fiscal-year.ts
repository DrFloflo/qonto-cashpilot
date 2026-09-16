import { addDays, format } from "date-fns";

export interface FiscalYearBounds {
  startDate: Date;
  endDate: Date;
  startDateStr: string;
  endDateStr: string;
}

export function getFiscalYearBounds(
  now: Date,
  endDay: number,
  endMonth: number,
  offsetYears: number = 0,
): FiscalYearBounds {
  const currentYear = now.getFullYear();
  const safeDay = getSafeDay(currentYear, endMonth, endDay);
  const candidateEnd = new Date(currentYear, endMonth - 1, safeDay, 23, 59, 59, 999);

  let endDate = now.getTime() <= candidateEnd.getTime()
    ? candidateEnd
    : createFiscalYearEnd(currentYear + 1, endMonth, safeDay);

  if (offsetYears !== 0) {
    endDate = createFiscalYearEnd(endDate.getFullYear() + offsetYears, endMonth, safeDay);
  }

  const previousEndYear = endDate.getFullYear() - 1;
  const previousEnd = new Date(
    previousEndYear,
    endMonth - 1,
    getSafeDay(previousEndYear, endMonth, safeDay),
    0,
    0,
    0,
    0,
  );
  const startDate = addDays(previousEnd, 1);
  startDate.setHours(0, 0, 0, 0);

  return {
    startDate,
    endDate,
    startDateStr: format(startDate, "yyyy-MM-dd"),
    endDateStr: format(endDate, "yyyy-MM-dd"),
  };
}

function createFiscalYearEnd(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, getSafeDay(year, month, day), 23, 59, 59, 999);
}

function getSafeDay(year: number, month: number, day: number): number {
  const lastDayOfMonth = new Date(year, month, 0).getDate();
  return Math.min(Math.max(1, day), lastDayOfMonth);
}
