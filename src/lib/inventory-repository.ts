export type InventoryRecordWithRelations = {
  id: string;
  organizationId: string;
};

export function normalizeText(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

export function normalizeCode(value: FormDataEntryValue | null): string {
  return normalizeText(value).toUpperCase();
}

export function assertRequired(value: string, label: string): asserts value is string {
  if (!value || !value.trim()) {
    throw new Error(`${label} e obrigatorio.`);
  }
}
