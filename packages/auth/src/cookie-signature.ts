import { getSessionCookie } from "better-auth/cookies";

export const hasValidBetterAuthSessionCookie = async (
  headers: Headers,
  secret: string
): Promise<boolean> => {
  const signedValue = getSessionCookie(headers);
  if (signedValue === null) {
    return false;
  }
  const separator = signedValue.lastIndexOf(".");
  if (separator <= 0 || separator === signedValue.length - 1) {
    return false;
  }

  try {
    const value = signedValue.slice(0, separator);
    const encodedSignature = signedValue.slice(separator + 1);
    const binarySignature = atob(encodedSignature);
    const signature = Uint8Array.from(binarySignature, (character) =>
      character.charCodeAt(0)
    );
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    return await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      new TextEncoder().encode(value)
    );
  } catch {
    return false;
  }
};
