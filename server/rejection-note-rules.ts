export const riskRejectionReasonCodes = [
  "FRAUD_RISK_REVIEW",
  "LEDGER_RESERVATION_CONFLICT",
  "TERMS_VIOLATION",
] as const;

export type RiskRejectionReasonCode = (typeof riskRejectionReasonCodes)[number];
export type RejectionNoteValidationCode =
  | "OK"
  | "INTERNAL_NOTE_REQUIRED"
  | "INTERNAL_NOTE_TOO_SHORT"
  | "INTERNAL_NOTE_TOO_LONG"
  | "INTERNAL_NOTE_CONTAINS_SENSITIVE_DATA";

export type RejectionNoteValidation = {
  ok: boolean;
  code: RejectionNoteValidationCode;
  normalizedNote: string | null;
};

const MINIMUM_NOTE_LENGTH = 20;
const MAXIMUM_NOTE_LENGTH = 2_000;
const controlCharacterPattern = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
const sensitiveDataPatterns = [
  /\b(?:\d[ -]*?){13,19}\b/u, // payment-card-like number
  /\b(?:\d[ -]*?){8,17}\b/u, // bank/account-like number
  /\b(?:ssn|social security|government id|driver(?:'s)? license|passport)\b\s*[:#-]?\s*[a-z0-9 -]{4,}/iu,
  /\b(?:token|secret|password|api[_ -]?key)\b\s*[:=]\s*\S+/iu,
];

export function requiresInternalNote(reasonCode: string): boolean {
  return reasonCode === "FRAUD_RISK_REVIEW" || reasonCode === "LEDGER_RESERVATION_CONFLICT" || reasonCode === "TERMS_VIOLATION";
}

export function validateRejectionInternalNote(reasonCode: string, note?: string | null): RejectionNoteValidation {
  if (!requiresInternalNote(reasonCode)) return { ok: true, code: "OK", normalizedNote: null };
  const normalizedNote = note?.replace(/\r\n?/gu, "\n").trim() ?? "";
  if (normalizedNote.length === 0) return { ok: false, code: "INTERNAL_NOTE_REQUIRED", normalizedNote: null };
  if (normalizedNote.length < MINIMUM_NOTE_LENGTH) return { ok: false, code: "INTERNAL_NOTE_TOO_SHORT", normalizedNote: null };
  if (normalizedNote.length > MAXIMUM_NOTE_LENGTH) return { ok: false, code: "INTERNAL_NOTE_TOO_LONG", normalizedNote: null };
  if (controlCharacterPattern.test(normalizedNote) || sensitiveDataPatterns.some((pattern) => pattern.test(normalizedNote))) {
    return { ok: false, code: "INTERNAL_NOTE_CONTAINS_SENSITIVE_DATA", normalizedNote: null };
  }
  return { ok: true, code: "OK", normalizedNote };
}

export const rejectionNoteLimits = { minimumCharacters: MINIMUM_NOTE_LENGTH, maximumCharacters: MAXIMUM_NOTE_LENGTH } as const;
