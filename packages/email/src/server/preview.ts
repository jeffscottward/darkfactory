// What: Local preview email port: writes messages to packages/email/previews/ instead of sending.
// Used by: packages/email/src/server/provider.ts#selectEmailPort, packages/email/src/server.ts.
// See: docs/debugging.md#symptom--where-to-look (Local email never arrives).
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import {
  chmod,
  type FileHandle,
  link,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { basename, dirname, join, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  EmailDeliveryResult,
  EmailPort,
  EmailVerificationEmailInput,
  PasswordResetEmailInput,
} from "../index.ts";
import { normalizeRecipient } from "../recipient.ts";
import { renderEmailVerificationEmail } from "./render-email-verification.ts";
import { renderPasswordResetEmail } from "./render-reset-password.ts";

const DEFAULT_MAX_ARTIFACTS = 20;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const defaultPreviewDirectory = (): string => {
  return fileURLToPath(new URL("../../previews/", import.meta.url));
};

export type PreviewEmailBinding = Readonly<{
  runId: string;
  hmacKey: string;
}>;

export type PreviewEmailPortOptions = Readonly<{
  environment: "development" | "test" | "production";
  directory?: string | undefined;
  maxArtifacts?: number | undefined;
  maxBytes?: number | undefined;
  binding?: PreviewEmailBinding | undefined;
  trustedAppOrigin?: string | undefined;
}>;

type PreviewOperation = "reset-password" | "verify-email";
type PreviewMetadata = Readonly<{
  version: 1;
  runId: string;
  operation: PreviewOperation;
  artifact: string;
  content: Readonly<{
    htmlSha256: string;
    textSha256: string;
  }>;
  binding: Readonly<{
    algorithm: "hmac-sha256";
    hmac: string;
  }>;
}>;
type RemoveFile = (path: string) => Promise<void>;

type PreviewEmailPortTestOptions = PreviewEmailPortOptions &
  Readonly<{
    artifactName: (operation: PreviewOperation) => string;
    removeFile?: RemoveFile | undefined;
  }>;
const defaultArtifactName = (operation: PreviewOperation): string =>
  `${operation}-${randomUUID()}`;

const sanitizeArtifactName = (candidate: string): string => {
  const leafName = basename(candidate.replaceAll("\\", "/"));
  const safeName = leafName
    .replaceAll(/[^a-zA-Z0-9._-]+/g, "-")
    .replaceAll(/^[.-]+|[.-]+$/g, "");

  return safeName || `email-preview-${randomUUID()}`;
};

const assertCanonicalDirectory = async (directory: string): Promise<string> => {
  const requestedPath = resolve(directory);
  await mkdir(requestedPath, { recursive: true, mode: 0o700 });
  const requestedDirectory = await lstat(requestedPath);
  if (!requestedDirectory.isDirectory()) {
    throw new Error("Unsafe preview directory");
  }

  const canonicalDirectory = await realpath(requestedPath);
  if (canonicalDirectory !== requestedPath) {
    throw new Error("Unsafe preview directory ancestry");
  }
  const root = parse(requestedPath).root;
  let currentDirectory = requestedPath;
  while (currentDirectory !== root) {
    const current = await lstat(currentDirectory);
    if (!current.isDirectory()) {
      throw new Error("Unsafe preview directory ancestry");
    }
    currentDirectory = dirname(currentDirectory);
  }

  await chmod(canonicalDirectory, 0o700);
  return canonicalDirectory;
};

const METADATA_SUFFIX = ".metadata.json";
const DELETING_SUFFIX = ".deleting.json";
const LOCK_SUFFIX = ".preview.lock";
const STALE_PARTIAL_MILLISECONDS = 5 * 60 * 1000;

const MAX_METADATA_BYTES = 1024;

interface ArtifactInventory {
  artifactName: string;
  modifiedAt: number;
  totalBytes: number;
  hasHtml: boolean;
  hasText: boolean;
  hasMetadata: boolean;
  hasDeleting: boolean;
}

const removeFile = async (path: string): Promise<void> => {
  await rm(path, { force: true });
};

const lstatIfPresent = async (path: string): Promise<Stats | undefined> => {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
};
const quarantineMetadata = async (
  directory: string,
  artifactName: string
): Promise<string> => {
  const metadataPath = join(directory, `${artifactName}${METADATA_SUFFIX}`);
  const deletingPath = join(directory, `${artifactName}${DELETING_SUFFIX}`);
  try {
    await rename(metadataPath, deletingPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return deletingPath;
};

const deleteArtifactUnit = async (
  directory: string,
  artifactName: string,
  removeArtifactFile: RemoveFile
): Promise<void> => {
  const deletingPath = await quarantineMetadata(directory, artifactName);
  const contentResults = await Promise.allSettled([
    removeArtifactFile(join(directory, `${artifactName}.html`)),
    removeArtifactFile(join(directory, `${artifactName}.txt`)),
  ]);
  if (contentResults.some((result) => result.status === "rejected")) {
    throw new Error("Preview content cleanup failed");
  }
  await removeArtifactFile(deletingPath);
};

type ResolvedPreviewBinding = Readonly<{
  runId: string;
  hmacKey: Buffer;
}>;

const resolveBinding = (
  binding?: PreviewEmailBinding
): ResolvedPreviewBinding => {
  if (!binding) {
    return { runId: "local", hmacKey: randomBytes(32) };
  }
  const runId = binding.runId.trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(runId)) {
    throw new TypeError("Preview email binding runId is invalid");
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(binding.hmacKey)) {
    throw new TypeError("Preview email binding HMAC key is invalid");
  }
  const hmacKey = Buffer.from(binding.hmacKey, "base64url");
  return { runId, hmacKey };
};

const createMetadata = (
  operation: PreviewOperation,
  recipient: string,
  artifactName: string,
  html: string,
  text: string,
  binding: ResolvedPreviewBinding
): string => {
  const htmlSha256 = createHash("sha256").update(html, "utf8").digest("hex");
  const textSha256 = createHash("sha256").update(text, "utf8").digest("hex");
  const hmacPayload = JSON.stringify([
    1,
    binding.runId,
    operation,
    recipient,
    artifactName,
    htmlSha256,
    textSha256,
  ]);
  const metadata: PreviewMetadata = {
    version: 1,
    runId: binding.runId,
    operation,
    artifact: artifactName,
    content: {
      htmlSha256,
      textSha256,
    },
    binding: {
      algorithm: "hmac-sha256",
      hmac: createHmac("sha256", binding.hmacKey)
        .update(hmacPayload, "utf8")
        .digest("hex"),
    },
  };
  return JSON.stringify(metadata);
};

const removeExpiredArtifacts = async (
  directory: string,
  maxArtifacts: number,
  maxBytes: number,
  removeArtifactFile: RemoveFile
): Promise<void> => {
  const fileNames = await readdir(directory);
  const activeArtifactNames = new Set<string>();
  const inventories = new Map<string, ArtifactInventory>();
  const now = Date.now();

  for (const fileName of fileNames) {
    const path = join(directory, fileName);
    if (fileName.startsWith(".") && fileName.endsWith(LOCK_SUFFIX)) {
      const fileDetails = await lstatIfPresent(path);
      if (!fileDetails) continue;
      if (now - fileDetails.mtimeMs >= STALE_PARTIAL_MILLISECONDS) {
        await removeArtifactFile(path);
      } else {
        activeArtifactNames.add(fileName.slice(1, -LOCK_SUFFIX.length));
      }
      continue;
    }

    if (fileName.startsWith(".") && fileName.endsWith(".tmp")) {
      const fileDetails = await lstatIfPresent(path);
      if (!fileDetails) continue;
      if (now - fileDetails.mtimeMs >= STALE_PARTIAL_MILLISECONDS) {
        await removeArtifactFile(path);
      }
      continue;
    }

    let artifactName: string | undefined;
    let member: "html" | "text" | "metadata" | "deleting" | undefined;
    if (fileName.endsWith(DELETING_SUFFIX)) {
      artifactName = fileName.slice(0, -DELETING_SUFFIX.length);
      member = "deleting";
    } else if (fileName.endsWith(METADATA_SUFFIX)) {
      artifactName = fileName.slice(0, -METADATA_SUFFIX.length);
      member = "metadata";
    } else if (fileName.endsWith(".html")) {
      artifactName = fileName.slice(0, -".html".length);
      member = "html";
    } else if (fileName.endsWith(".txt")) {
      artifactName = fileName.slice(0, -".txt".length);
      member = "text";
    }
    if (!artifactName) continue;

    const fileDetails = await lstatIfPresent(path);
    if (!fileDetails) continue;
    const inventory = inventories.get(artifactName) ?? {
      artifactName,
      modifiedAt: 0,
      totalBytes: 0,
      hasHtml: false,
      hasText: false,
      hasMetadata: false,
      hasDeleting: false,
    };
    if (fileDetails.mtimeMs > inventory.modifiedAt) {
      inventory.modifiedAt = fileDetails.mtimeMs;
    }
    inventory.totalBytes += fileDetails.size;
    if (member === "html") inventory.hasHtml = true;
    if (member === "text") inventory.hasText = true;
    if (member === "metadata") inventory.hasMetadata = true;
    if (member === "deleting") inventory.hasDeleting = true;
    inventories.set(artifactName, inventory);
  }

  const completeArtifacts: ArtifactInventory[] = [];
  for (const inventory of inventories.values()) {
    if (activeArtifactNames.has(inventory.artifactName)) continue;
    if (
      inventory.hasDeleting ||
      !inventory.hasHtml ||
      !inventory.hasText ||
      !inventory.hasMetadata
    ) {
      await deleteArtifactUnit(
        directory,
        inventory.artifactName,
        removeArtifactFile
      );
    } else {
      completeArtifacts.push(inventory);
    }
  }

  const sortedArtifacts = completeArtifacts.sort((left, right) => {
    return (
      left.modifiedAt - right.modifiedAt ||
      left.artifactName.localeCompare(right.artifactName)
    );
  });
  let remainingBytes = sortedArtifacts.reduce(
    (total, artifact) => total + artifact.totalBytes,
    0
  );
  const expiredArtifacts: ArtifactInventory[] = [];
  for (const artifact of sortedArtifacts) {
    const remainingCount = sortedArtifacts.length - expiredArtifacts.length;
    if (remainingCount <= maxArtifacts && remainingBytes <= maxBytes) break;
    expiredArtifacts.push(artifact);
    remainingBytes -= artifact.totalBytes;
  }

  await Promise.all(
    expiredArtifacts.map(({ artifactName }) => {
      return deleteArtifactUnit(directory, artifactName, removeArtifactFile);
    })
  );
};
const cleanupPartialArtifacts = async (
  handles: readonly FileHandle[],
  temporaryPaths: readonly string[],
  publishedContentPaths: readonly string[],
  publishedMetadataPath: string | undefined
): Promise<void> => {
  await Promise.allSettled(handles.map((handle) => handle.close()));
  await Promise.allSettled(
    temporaryPaths.map((path) => rm(path, { force: true }))
  );

  let deletingPath: string | undefined;
  if (publishedMetadataPath) {
    const artifactName = basename(publishedMetadataPath, METADATA_SUFFIX);
    try {
      deletingPath = await quarantineMetadata(
        dirname(publishedMetadataPath),
        artifactName
      );
    } catch {
      return;
    }
  }
  const contentResults = await Promise.allSettled(
    publishedContentPaths.map((path) => rm(path, { force: true }))
  );
  if (
    deletingPath &&
    contentResults.every((result) => result.status === "fulfilled")
  ) {
    await rm(deletingPath, { force: true }).catch(() => undefined);
  }
};

const renderFailure = (): EmailDeliveryResult => ({
  status: "failed",
  provider: "preview",
  code: "EMAIL_RENDER_FAILED",
  retryable: false,
});

const writeFailure = (): EmailDeliveryResult => ({
  status: "failed",
  provider: "preview",
  code: "EMAIL_PREVIEW_WRITE_FAILED",
  retryable: false,
});

const recipientFailure = (): EmailDeliveryResult => ({
  status: "failed",
  provider: "preview",
  code: "EMAIL_RECIPIENT_INVALID",
  retryable: false,
});

type PreviewRendererOptions = Readonly<{
  trustedAppOrigin?: string | undefined;
}>;
type PreviewRenderer<Input> = (
  input: Input,
  options: PreviewRendererOptions
) => Promise<{ html: string; text: string }>;
type PreviewWriter = <Input>(
  operation: PreviewOperation,
  recipient: string,
  renderer: PreviewRenderer<Input>,
  input: Input
) => Promise<EmailDeliveryResult>;

async function sendPasswordResetPreview(
  writePreview: PreviewWriter,
  input: PasswordResetEmailInput
): Promise<EmailDeliveryResult> {
  return await writePreview(
    "reset-password",
    input.to,
    renderPasswordResetEmail,
    input
  );
}

async function sendEmailVerificationPreview(
  writePreview: PreviewWriter,
  input: EmailVerificationEmailInput
): Promise<EmailDeliveryResult> {
  return await writePreview(
    "verify-email",
    input.to,
    renderEmailVerificationEmail,
    input
  );
}

const createPreviewPort = (
  options: PreviewEmailPortOptions,
  artifactName: (operation: PreviewOperation) => string,
  removeArtifactFile: RemoveFile
): EmailPort => {
  if (options.environment === "production") {
    throw new Error("Preview email transport is unavailable in production");
  }

  const directory = options.directory ?? defaultPreviewDirectory();
  const maxArtifacts = options.maxArtifacts ?? DEFAULT_MAX_ARTIFACTS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const binding = resolveBinding(options.binding);
  if (
    !Number.isInteger(maxArtifacts) ||
    maxArtifacts <= 0 ||
    !Number.isInteger(maxBytes) ||
    maxBytes <= 0
  ) {
    throw new RangeError("Preview retention bounds must be positive integers");
  }

  const writePreview = async <Input>(
    operation: PreviewOperation,
    recipient: string,
    renderer: PreviewRenderer<Input>,
    input: Input
  ): Promise<EmailDeliveryResult> => {
    const normalizedRecipient = normalizeRecipient(recipient);
    if (!normalizedRecipient) return recipientFailure();

    let rendered: Awaited<ReturnType<typeof renderer>>;
    try {
      rendered = await renderer(input, {
        trustedAppOrigin: options.trustedAppOrigin,
      });
    } catch {
      return renderFailure();
    }

    let safeArtifactName: string;
    let canonicalDirectory: string;
    try {
      safeArtifactName = sanitizeArtifactName(artifactName(operation));
      canonicalDirectory = await assertCanonicalDirectory(directory);
    } catch {
      return writeFailure();
    }

    const metadata = createMetadata(
      operation,
      normalizedRecipient,
      safeArtifactName,
      rendered.html,
      rendered.text,
      binding
    );
    if (Buffer.byteLength(metadata, "utf8") > MAX_METADATA_BYTES) {
      return writeFailure();
    }
    if (
      Buffer.byteLength(rendered.html, "utf8") +
        Buffer.byteLength(rendered.text, "utf8") +
        Buffer.byteLength(metadata, "utf8") >
      maxBytes
    ) {
      return writeFailure();
    }

    const htmlPath = join(canonicalDirectory, `${safeArtifactName}.html`);
    const textPath = join(canonicalDirectory, `${safeArtifactName}.txt`);
    const metadataPath = join(
      canonicalDirectory,
      `${safeArtifactName}${METADATA_SUFFIX}`
    );
    const reservationPath = join(
      canonicalDirectory,
      `.${safeArtifactName}.preview.lock`
    );
    const temporaryId = randomUUID();
    const temporaryHtmlPath = join(
      canonicalDirectory,
      `.${safeArtifactName}-${temporaryId}.html.tmp`
    );
    const temporaryTextPath = join(
      canonicalDirectory,
      `.${safeArtifactName}-${temporaryId}.txt.tmp`
    );
    const temporaryMetadataPath = join(
      canonicalDirectory,
      `.${safeArtifactName}-${temporaryId}.metadata.json.tmp`
    );
    const temporaryPaths = [
      temporaryHtmlPath,
      temporaryTextPath,
      temporaryMetadataPath,
    ];
    const handles: FileHandle[] = [];
    const publishedContentPaths: string[] = [];
    let publishedMetadataPath: string | undefined;
    let reservationOwned = false;

    try {
      const reservationHandle = await open(reservationPath, "wx", 0o600);
      reservationOwned = true;
      handles.push(reservationHandle);
      const htmlHandle = await open(temporaryHtmlPath, "wx", 0o600);
      handles.push(htmlHandle);
      const textHandle = await open(temporaryTextPath, "wx", 0o600);
      handles.push(textHandle);
      const metadataHandle = await open(temporaryMetadataPath, "wx", 0o600);
      handles.push(metadataHandle);

      const writeResults = await Promise.allSettled([
        htmlHandle.writeFile(rendered.html, "utf8"),
        textHandle.writeFile(rendered.text, "utf8"),
        metadataHandle.writeFile(metadata, "utf8"),
      ]);
      if (writeResults.some((result) => result.status === "rejected")) {
        throw new Error("Preview write failed");
      }

      const syncResults = await Promise.allSettled(
        handles.map((handle) => handle.sync())
      );
      if (syncResults.some((result) => result.status === "rejected")) {
        throw new Error("Preview sync failed");
      }
      const closeResults = await Promise.allSettled(
        handles.map((handle) => handle.close())
      );
      if (closeResults.some((result) => result.status === "rejected")) {
        throw new Error("Preview handle close failed");
      }
      handles.length = 0;

      const publishResults = await Promise.allSettled([
        link(temporaryHtmlPath, htmlPath),
        link(temporaryTextPath, textPath),
      ] as const);
      const [htmlPublishResult, textPublishResult] = publishResults;
      if (htmlPublishResult.status === "fulfilled") {
        publishedContentPaths.push(htmlPath);
      }
      if (textPublishResult.status === "fulfilled") {
        publishedContentPaths.push(textPath);
      }
      if (publishResults.some((result) => result.status === "rejected")) {
        throw new Error("Preview content publish failed");
      }

      await link(temporaryMetadataPath, metadataPath);
      publishedMetadataPath = metadataPath;

      const unlinkResults = await Promise.allSettled(
        temporaryPaths.map((path) => rm(path, { force: true }))
      );
      if (unlinkResults.some((result) => result.status === "rejected")) {
        throw new Error("Preview temporary cleanup failed");
      }
      await rm(reservationPath, { force: true });
      reservationOwned = false;
      await removeExpiredArtifacts(
        canonicalDirectory,
        maxArtifacts,
        maxBytes,
        removeArtifactFile
      );
    } catch {
      await cleanupPartialArtifacts(
        handles,
        temporaryPaths,
        publishedContentPaths,
        publishedMetadataPath
      );
      if (reservationOwned) {
        await rm(reservationPath, { force: true }).catch(() => undefined);
      }
      return writeFailure();
    }

    return {
      status: "previewed",
      provider: "preview",
      artifactPath: htmlPath,
    };
  };

  async function sendPasswordReset(
    input: PasswordResetEmailInput
  ): Promise<EmailDeliveryResult> {
    return await sendPasswordResetPreview(writePreview, input);
  }
  async function sendEmailVerification(
    input: EmailVerificationEmailInput
  ): Promise<EmailDeliveryResult> {
    return await sendEmailVerificationPreview(writePreview, input);
  }

  return Object.freeze({
    sendPasswordReset,
    sendEmailVerification,
  });
};

export const createPreviewEmailPort = (
  options: PreviewEmailPortOptions
): EmailPort => createPreviewPort(options, defaultArtifactName, removeFile);

export const createPreviewEmailPortForTest = (
  options: PreviewEmailPortTestOptions
): EmailPort => {
  return createPreviewPort(
    options,
    options.artifactName,
    options.removeFile ?? removeFile
  );
};
