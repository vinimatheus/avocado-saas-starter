export function appendStringField(
  formData: FormData,
  key: string,
  value: string | number | boolean | null | undefined,
) {
  if (value === null || value === undefined) {
    formData.set(key, "");
    return;
  }

  formData.set(key, String(value));
}

