export interface ExpenseCalculationInput {
  type: "ndf" | "ik";
  amountTtc?: number;
  vatRate?: number;
  prorataRate?: number;
  distanceKm?: number;
}

export interface ExpenseAmounts {
  amountTtc: number;
  amountHt: number;
  vatRate: number;
  prorataRate: number;
  vatDeductible: number;
  reimbursableAmount: number;
  distanceKm: number | null;
}

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

export function calculateExpenseAmounts(
  input: ExpenseCalculationInput,
  mileageRate = 0.603,
): ExpenseAmounts {
  if (input.type === "ik") {
    const distanceKm = Number(input.distanceKm) || 0;
    const amount = roundCurrency(distanceKm * mileageRate);

    return {
      amountTtc: amount,
      amountHt: amount,
      vatRate: 0,
      prorataRate: 100,
      vatDeductible: 0,
      reimbursableAmount: amount,
      distanceKm,
    };
  }

  const amountTtc = Math.max(0, roundCurrency(Number(input.amountTtc) || 0));
  const vatRate = Math.max(0, Number(input.vatRate) || 0);
  const prorataRate = Math.min(100, Math.max(0, input.prorataRate !== undefined ? Number(input.prorataRate) : 100));
  const professionalTtcCents = Math.round(amountTtc * 100 * (prorataRate / 100));
  const professionalHtCents = Math.round(professionalTtcCents / (1 + vatRate / 100));
  const deductibleVatCents = Math.max(0, professionalTtcCents - professionalHtCents);

  return {
    amountTtc,
    // Accounting values contain only the professional portion. The original
    // receipt total remains available in amountTtc for audit/display purposes.
    amountHt: professionalHtCents / 100,
    vatRate,
    prorataRate,
    vatDeductible: deductibleVatCents / 100,
    reimbursableAmount: professionalTtcCents / 100,
    distanceKm: null,
  };
}
