export type PaidPayoutForTaxExport = {
  taxProfileReference: string;
  payoutReference: string;
  paidAt: Date;
  currency: "USD";
  grossAmountMinor: number;
};

const csvCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;

/**
 * Produce a transaction-level CSV for review by a tax professional or an
 * approved reporting provider. This is not a tax calculation, tax form, or
 * filing. Only confirmed paid transactions should be passed to this function.
 */
export function buildPaidPayoutTaxExport(year: number, payouts: readonly PaidPayoutForTaxExport[]): string {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new Error("Tax export year must be a four-digit calendar year");
  }

  const rows = ["tax_year,tax_profile_reference,paid_at,currency,gross_amount_minor,payout_reference"];
  for (const payout of payouts) {
    if (!payout.taxProfileReference.trim() || !payout.payoutReference.trim()) {
      throw new Error("Tax and payout references are required");
    }
    if (!(payout.paidAt instanceof Date) || Number.isNaN(payout.paidAt.getTime()) || payout.paidAt.getUTCFullYear() !== year) {
      throw new Error("Every payout must have a valid paid date within the requested tax year");
    }
    if (!Number.isSafeInteger(payout.grossAmountMinor) || payout.grossAmountMinor <= 0) {
      throw new Error("Gross payout amount must be a positive safe integer in minor currency units");
    }
    rows.push([
      year,
      payout.taxProfileReference,
      payout.paidAt.toISOString(),
      payout.currency,
      payout.grossAmountMinor,
      payout.payoutReference,
    ].map(csvCell).join(","));
  }
  return `${rows.join("\n")}\n`;
}
