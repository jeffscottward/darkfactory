const SENSITIVE_RESPONSE_KEY_PATTERN = /(?:password|secret|token)/iu;

export const containsSensitiveData = (
  value: unknown,
  sensitiveValues: readonly string[]
): boolean => {
  if (typeof value === "string") {
    return sensitiveValues.some(
      (sensitiveValue) =>
        sensitiveValue.length > 0 && value.includes(sensitiveValue)
    );
  }
  if (Array.isArray(value)) {
    return value.some((entry) => containsSensitiveData(entry, sensitiveValues));
  }
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return Object.entries(value).some(
    ([key, entry]) =>
      SENSITIVE_RESPONSE_KEY_PATTERN.test(key) ||
      containsSensitiveData(entry, sensitiveValues)
  );
};

export const assertNoSensitiveData = (
  value: unknown,
  sensitiveValues: readonly string[]
): void => {
  if (containsSensitiveData(value, sensitiveValues)) {
    throw new Error("Auth surface exposed sensitive data.");
  }
};
