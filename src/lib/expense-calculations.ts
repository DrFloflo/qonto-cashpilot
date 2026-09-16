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

  const amountTtc = Number(input.amountTtc) || 0;
  const vatRate = Number(input.vatRate) || 0;
  const prorataRate = input.prorataRate !== undefined ? Number(input.prorataRate) : 100;
  const amountHt = roundCurrency(amountTtc / (1 + vatRate / 100));
  const vatTotal = Math.max(0, roundCurrency(amountTtc - amountHt));

  return {
    amountTtc,
    amountHt,
    vatRate,
    prorataRate,
    vatDeductible: roundCurrency(vatTotal * (prorataRate / 100)),
    reimbursableAmount: roundCurrency(amountTtc * (prorataRate / 100)),
    distanceKm: null,
  };
}
