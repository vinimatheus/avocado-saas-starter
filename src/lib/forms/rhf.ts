export function stripFieldRef<TValue extends { ref?: unknown }>(
  value: TValue,
): Omit<TValue, "ref"> {
  const { ref, ...rest } = value;
  void ref;
  return rest;
}

