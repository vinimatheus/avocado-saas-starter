import type { FieldError, FieldErrors } from "react-hook-form";

function isFieldError(value: unknown): value is FieldError {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
  );
}

export function getFirstValidationErrorMessage(
  errors: FieldErrors,
): string | null {
  const queue: unknown[] = [...Object.values(errors)];
  const visited = new Set<object>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object") {
      continue;
    }

    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    if (isFieldError(current)) {
      const message = current.message;
      if (typeof message === "string" && message.trim()) {
        return message;
      }
    }

    const nestedValues = Array.isArray(current)
      ? current
      : Object.entries(current as Record<string, unknown>)
        .filter(([key]) => key !== "ref")
        .map(([, value]) => value);

    for (const nestedValue of nestedValues) {
      queue.push(nestedValue);
    }
  }

  return null;
}
