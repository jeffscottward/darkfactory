/**
 * Narrows a value that an upstream invariant guarantees to be present.
 * Violations fail closed instead of propagating `null` or `undefined`.
 */
export const required = <Value>(
  value: Value | null | undefined,
  description: string
): Value => {
  if (value === null || value === undefined) {
    throw new Error(`${description} is unexpectedly missing`);
  }
  return value;
};
