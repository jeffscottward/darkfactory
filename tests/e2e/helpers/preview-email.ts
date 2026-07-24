import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { normalizeRecipient } from "@darkfactory/email/recipient";

import { e2eRunPathsFromEnvironment } from "./run-artifacts";
import { canonicalBaseURL, parsePortlessPort } from "./runtime";

const HTTPS_LINK_PATTERN = /https:\/\/[^\s<>"']+/gu;
const RESET_PATH_PATTERN = /^\/api\/auth\/reset-password\/[A-Za-z0-9_-]+$/u;
const VERIFICATION_PATH = "/api/auth/verify-email";
const VERIFICATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){2}$/u;
const POLL_INTERVAL_MILLISECONDS = 50;
const DEFAULT_TIMEOUT_MILLISECONDS = 5000;
const HEX_64_PATTERN = /^[a-f0-9]{64}$/u;
const METADATA_SUFFIX = ".metadata.json";

export type PreviewOperation = "reset-password" | "verify-email";
export type PreviewRecipient = Readonly<{ email: string; name: string }>;

const isTrustedCallback = (value: string, appOrigin: string): boolean => {
  try {
    const callback = new URL(value, appOrigin);
    return (
      callback.origin === appOrigin &&
      (callback.pathname === "/reset-password" ||
        callback.pathname === "/verify-email")
    );
  } catch {
    return false;
  }
};

export const extractPreviewLink = ({
  appOrigin,
  operation,
  text,
}: {
  readonly appOrigin: string;
  readonly operation: PreviewOperation;
  readonly text: string;
}): URL => {
  for (const match of text.matchAll(HTTPS_LINK_PATTERN)) {
    try {
      const candidate = new URL(match[0]);
      if (
        candidate.origin !== appOrigin ||
        candidate.username !== "" ||
        candidate.password !== "" ||
        candidate.hash !== ""
      ) {
        continue;
      }

      const callbackValues = candidate.searchParams.getAll("callbackURL");
      if (
        callbackValues.length !== 1 ||
        !isTrustedCallback(callbackValues[0] ?? "", appOrigin)
      ) {
        continue;
      }

      if (
        operation === "reset-password" &&
        RESET_PATH_PATTERN.test(candidate.pathname) &&
        [...candidate.searchParams.keys()].length === 1
      ) {
        return candidate;
      }

      const tokens = candidate.searchParams.getAll("token");
      if (
        operation === "verify-email" &&
        candidate.pathname === VERIFICATION_PATH &&
        [...candidate.searchParams.keys()].join(",") === "token,callbackURL" &&
        tokens.length === 1 &&
        VERIFICATION_TOKEN_PATTERN.test(tokens[0] ?? "")
      ) {
        return candidate;
      }
    } catch {
      // Continue scanning without exposing token-bearing artifact content.
    }
  }

  throw new Error(
    `Preview artifact did not contain a trusted ${operation} link.`
  );
};

type PreviewMetadata = Readonly<{
  artifact: string;
  binding: Readonly<{ algorithm: "hmac-sha256"; hmac: string }>;
  content: Readonly<{ htmlSha256: string; textSha256: string }>;
  operation: PreviewOperation;
  runId: string;
  version: 1;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object";

const hasExactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[]
): boolean => {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
};

const parseMetadata = (value: string): PreviewMetadata | undefined => {
  const metadata = JSON.parse(value) as unknown;
  if (
    !(
      isRecord(metadata) &&
      hasExactKeys(metadata, [
        "artifact",
        "binding",
        "content",
        "operation",
        "runId",
        "version",
      ])
    ) ||
    metadata["version"] !== 1 ||
    typeof metadata["runId"] !== "string" ||
    typeof metadata["operation"] !== "string" ||
    typeof metadata["artifact"] !== "string" ||
    !isRecord(metadata["content"]) ||
    !hasExactKeys(metadata["content"], ["htmlSha256", "textSha256"]) ||
    typeof metadata["content"]["htmlSha256"] !== "string" ||
    !HEX_64_PATTERN.test(metadata["content"]["htmlSha256"]) ||
    typeof metadata["content"]["textSha256"] !== "string" ||
    !HEX_64_PATTERN.test(metadata["content"]["textSha256"]) ||
    !isRecord(metadata["binding"]) ||
    !hasExactKeys(metadata["binding"], ["algorithm", "hmac"]) ||
    metadata["binding"]["algorithm"] !== "hmac-sha256" ||
    typeof metadata["binding"]["hmac"] !== "string" ||
    !HEX_64_PATTERN.test(metadata["binding"]["hmac"])
  ) {
    return undefined;
  }
  return metadata as PreviewMetadata;
};

const verifiedPreviewText = async ({
  directory,
  hmacKey,
  metadataName,
  operation,
  recipient,
  runId,
}: {
  readonly directory: string;
  readonly hmacKey: string;
  readonly metadataName: string;
  readonly operation: PreviewOperation;
  readonly recipient: PreviewRecipient;
  readonly runId: string;
}): Promise<string | undefined> => {
  try {
    const artifactName = metadataName.slice(0, -METADATA_SUFFIX.length);
    const metadataPath = join(directory, metadataName);
    const htmlPath = join(directory, `${artifactName}.html`);
    const textPath = join(directory, `${artifactName}.txt`);
    const [metadataDetails, htmlDetails, textDetails] = await Promise.all([
      lstat(metadataPath),
      lstat(htmlPath),
      lstat(textPath),
    ]);
    if (
      !metadataDetails.isFile() ||
      metadataDetails.isSymbolicLink() ||
      !htmlDetails.isFile() ||
      htmlDetails.isSymbolicLink() ||
      !textDetails.isFile() ||
      textDetails.isSymbolicLink()
    ) {
      return undefined;
    }
    const [metadataValue, html, text] = await Promise.all([
      readFile(metadataPath, "utf8"),
      readFile(htmlPath, "utf8"),
      readFile(textPath, "utf8"),
    ]);
    const metadata = parseMetadata(metadataValue);
    const normalizedRecipient = normalizeRecipient(recipient.email);
    if (
      metadata === undefined ||
      normalizedRecipient === null ||
      metadata.runId !== runId ||
      metadata.operation !== operation ||
      metadata.artifact !== artifactName
    ) {
      return undefined;
    }
    const htmlSha256 = createHash("sha256").update(html, "utf8").digest("hex");
    const textSha256 = createHash("sha256").update(text, "utf8").digest("hex");
    if (
      metadata.content.htmlSha256 !== htmlSha256 ||
      metadata.content.textSha256 !== textSha256
    ) {
      return undefined;
    }
    const expectedHmac = createHmac("sha256", Buffer.from(hmacKey, "base64url"))
      .update(
        JSON.stringify([
          1,
          runId,
          operation,
          normalizedRecipient,
          artifactName,
          htmlSha256,
          textSha256,
        ]),
        "utf8"
      )
      .digest();
    const actualHmac = Buffer.from(metadata.binding.hmac, "hex");
    if (!timingSafeEqual(actualHmac, expectedHmac)) {
      return undefined;
    }
    return text;
  } catch {
    // Metadata is the commit marker; incomplete, malformed, or changing units retry.
    return undefined;
  }
};

const matchingPreviewMetadata = async ({
  after,
  directory,
  operation,
}: {
  readonly after: number;
  readonly directory: string;
  readonly operation: PreviewOperation;
}): Promise<readonly string[]> => {
  let names: readonly string[];
  try {
    names = await readdir(directory);
  } catch {
    return [];
  }

  const candidates = names.filter(
    (name) => name.startsWith(`${operation}-`) && name.endsWith(METADATA_SUFFIX)
  );
  const freshCandidates: Array<{ name: string; modifiedAt: number }> = [];
  for (const name of candidates) {
    try {
      const details = await lstat(join(directory, name));
      if (
        details.isFile() &&
        !details.isSymbolicLink() &&
        details.mtimeMs >= after
      ) {
        freshCandidates.push({ name, modifiedAt: details.mtimeMs });
      }
    } catch {
      // A bounded publisher cleanup race is retried on the next poll.
    }
  }

  return freshCandidates
    .sort(
      (left, right) =>
        right.modifiedAt - left.modifiedAt ||
        left.name.localeCompare(right.name)
    )
    .map(({ name }) => name);
};

export const waitForPreviewLink = async ({
  after,
  appOrigin = canonicalBaseURL(parsePortlessPort(process.env["PORTLESS_PORT"])),
  directory = e2eRunPathsFromEnvironment().authPreviews,
  hmacKey = process.env["E2E_EMAIL_PREVIEW_HMAC_KEY"],
  operation,
  recipient,
  runId,
  timeoutMs = DEFAULT_TIMEOUT_MILLISECONDS,
}: {
  readonly after: number;
  readonly appOrigin?: string;
  readonly directory?: string;
  readonly hmacKey?: string;
  readonly operation: PreviewOperation;
  readonly recipient: PreviewRecipient;
  readonly runId?: string;
  readonly timeoutMs?: number;
}): Promise<URL> => {
  const expectedRunId = runId ?? e2eRunPathsFromEnvironment().runId;
  if (
    !Number.isFinite(after) ||
    after < 0 ||
    recipient.email.trim().length === 0 ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    hmacKey === undefined ||
    !/^[A-Za-z0-9_-]{43}$/u.test(hmacKey) ||
    Buffer.from(hmacKey, "base64url").length !== 32
  ) {
    throw new TypeError("Invalid preview polling contract.");
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const names = await matchingPreviewMetadata({
      after,
      directory,
      operation,
    });
    for (const metadataName of names) {
      const text = await verifiedPreviewText({
        directory,
        hmacKey,
        metadataName,
        operation,
        recipient,
        runId: expectedRunId,
      });
      if (text === undefined) {
        continue;
      }
      try {
        return extractPreviewLink({ appOrigin, operation, text });
      } catch {
        // A committed but invalid link is ignored without exposing its contents.
      }
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, POLL_INTERVAL_MILLISECONDS);
    });
  }

  throw new Error(`Timed out waiting for ${operation} preview artifact.`);
};

export const waitForContactPreview = async ({
  after,
  directory = e2eRunPathsFromEnvironment().contactPreviews,
  recipientEmail,
  subject,
  timeoutMs = DEFAULT_TIMEOUT_MILLISECONDS,
}: {
  readonly after: number;
  readonly directory?: string;
  readonly recipientEmail: string;
  readonly subject: string;
  readonly timeoutMs?: number;
}): Promise<void> => {
  if (
    !Number.isFinite(after) ||
    after < 0 ||
    recipientEmail.trim().length === 0 ||
    recipientEmail.includes("\r") ||
    recipientEmail.includes("\n") ||
    subject.trim().length === 0 ||
    subject.includes("\r") ||
    subject.includes("\n") ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs <= 0
  ) {
    throw new TypeError("Invalid contact preview polling contract.");
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    let names: readonly string[] = [];
    try {
      names = await readdir(directory);
    } catch {
      // The run-owned contact directory is created lazily by the publisher.
    }
    const candidates = names
      .filter((name) => /^contact-[a-f0-9-]+\.txt$/u.test(name))
      .sort();
    for (const textName of candidates) {
      try {
        const artifactName = textName.slice(0, -".txt".length);
        const textPath = join(directory, textName);
        const htmlPath = join(directory, `${artifactName}.html`);
        const [textDetails, htmlDetails] = await Promise.all([
          lstat(textPath),
          lstat(htmlPath),
        ]);
        if (
          !textDetails.isFile() ||
          textDetails.isSymbolicLink() ||
          !htmlDetails.isFile() ||
          htmlDetails.isSymbolicLink() ||
          Math.max(textDetails.mtimeMs, htmlDetails.mtimeMs) < after
        ) {
          continue;
        }
        const text = await readFile(textPath, "utf8");
        if (text.includes(recipientEmail) && text.includes(subject)) {
          return;
        }
      } catch {
        // Incomplete publisher units retry without exposing contact content.
      }
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, POLL_INTERVAL_MILLISECONDS);
    });
  }

  throw new Error("Timed out waiting for contact preview artifact.");
};
