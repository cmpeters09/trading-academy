// ENGINEERING_PRINCIPLES.md §7 / §20 rule 3 — every Edge Function returns
// `{ error: { code, message, details? } }` with a stable, machine-readable
// `code`. The client switches on `code`, never on `message` text.
//
// Codes this function can return THIS session (skeleton scope — no engine
// re-run, no DB writes). Re-validation codes (e.g. `INVALID_STOP`,
// `STALE_CANDLE_DATA`) belong to the session that wires ADR-007's actual
// re-run and are deliberately not enumerated yet — adding them now would be
// guessing at a shape that session hasn't decided.
export const VALIDATE_TRADE_ERROR_CODES = [
  "METHOD_NOT_ALLOWED",
  "UNAUTHORIZED",
  "INVALID_JSON",
  "VALIDATION_FAILED",
] as const;

export type ValidateTradeErrorCode = (typeof VALIDATE_TRADE_ERROR_CODES)[number];

export type TypedError = {
  error: {
    code: ValidateTradeErrorCode;
    message: string;
    details?: unknown;
  };
};

const STATUS_BY_CODE: Record<ValidateTradeErrorCode, number> = {
  METHOD_NOT_ALLOWED: 405,
  UNAUTHORIZED: 401,
  INVALID_JSON: 400,
  VALIDATION_FAILED: 400,
};

export function errorResponse(
  code: ValidateTradeErrorCode,
  message: string,
  details: unknown,
  corsHeaders: HeadersInit,
): Response {
  const body: TypedError = {
    error: { code, message, ...(details !== undefined ? { details } : {}) },
  };
  return new Response(JSON.stringify(body), {
    status: STATUS_BY_CODE[code],
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
