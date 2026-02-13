export const BILLING_CANCELLATION_REASON_CODES = [
  "TOO_EXPENSIVE",
  "MISSING_FEATURES",
  "LOW_USAGE",
  "SWITCHING_PROVIDER",
  "TEMPORARY_PAUSE",
  "SUPPORT_ISSUES",
  "OTHER",
] as const;

export type BillingCancellationReasonCode = (typeof BILLING_CANCELLATION_REASON_CODES)[number];

export const BILLING_CANCELLATION_REASON_LABELS: Record<BillingCancellationReasonCode, string> = {
  TOO_EXPENSIVE: "Preco alto para o momento",
  MISSING_FEATURES: "Funcionalidades que preciso nao estao disponiveis",
  LOW_USAGE: "Estou usando pouco o produto",
  SWITCHING_PROVIDER: "Vou migrar para outra ferramenta",
  TEMPORARY_PAUSE: "Pausa temporaria do negocio",
  SUPPORT_ISSUES: "Problemas de suporte ou operacao",
  OTHER: "Outro motivo",
};

export const BILLING_CANCELLATION_REASON_OPTIONS = BILLING_CANCELLATION_REASON_CODES.map((code) => ({
  code,
  label: BILLING_CANCELLATION_REASON_LABELS[code],
}));

export function isBillingCancellationReasonCode(
  value: string,
): value is BillingCancellationReasonCode {
  return (BILLING_CANCELLATION_REASON_CODES as readonly string[]).includes(value);
}
