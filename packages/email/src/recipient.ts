const MAILBOX_PATTERN =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

export const normalizeRecipient = (recipient: string): string | null => {
  const trimmedRecipient = recipient.trim();
  const separatorIndex = trimmedRecipient.lastIndexOf("@");
  if (separatorIndex <= 0) {
    return null;
  }

  const normalizedRecipient =
    `${trimmedRecipient.slice(0, separatorIndex)}@` +
    trimmedRecipient.slice(separatorIndex + 1).toLowerCase();
  if (
    normalizedRecipient.length > 254 ||
    !MAILBOX_PATTERN.test(normalizedRecipient)
  ) {
    return null;
  }
  return normalizedRecipient;
};
