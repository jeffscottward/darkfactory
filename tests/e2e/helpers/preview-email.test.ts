import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createPreviewEmailPort } from "@darkfactory/email/server";
import { afterEach, describe, expect, it } from "vitest";

import { waitForContactPreview, waitForPreviewLink } from "./preview-email";

const APP_ORIGIN = "https://darkfactory.localhost";
const HMAC_KEY = Buffer.alloc(32, 7).toString("base64url");
const RUN_ID = "preview_reader_contract";
const directories: string[] = [];

const createDirectory = async (): Promise<string> => {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), "darkfactory-preview-reader-"))
  );
  directories.push(directory);
  return directory;
};

const publishReset = async (directory: string, email = "alice@domain.test") => {
  const emailPort = createPreviewEmailPort({
    binding: { hmacKey: HMAC_KEY, runId: RUN_ID },
    directory,
    environment: "test",
    trustedAppOrigin: APP_ORIGIN,
  });
  const result = await emailPort.sendPasswordReset({
    expiresInMinutes: 60,
    recipientName: "Shared Name",
    resetUrl:
      `${APP_ORIGIN}/api/auth/reset-password/authenticated-token` +
      `?callbackURL=${encodeURIComponent(`${APP_ORIGIN}/reset-password`)}`,
    to: email,
  });
  if (result.status !== "previewed") {
    throw new Error("Preview setup failed.");
  }
  return result.artifactPath;
};

const waitForReset = (
  directory: string,
  email: string,
  timeoutMs = 100
): Promise<URL> =>
  waitForPreviewLink({
    after: Date.now() - 1000,
    appOrigin: APP_ORIGIN,
    directory,
    hmacKey: HMAC_KEY,
    operation: "reset-password",
    recipient: { email, name: "Shared Name" },
    runId: RUN_ID,
    timeoutMs,
  });

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe("authenticated preview polling", () => {
  it("binds a same-name artifact to the exact normalized recipient", async () => {
    const directory = await createDirectory();
    await publishReset(directory, "Alice.Tag@DOMAIN.TEST ");

    await expect(
      waitForReset(directory, "alice.Tag@domain.test", 20)
    ).rejects.toThrowError(
      "Timed out waiting for reset-password preview artifact."
    );
    await expect(
      waitForReset(directory, " Alice.Tag@domain.test ")
    ).resolves.toMatchObject({
      pathname: "/api/auth/reset-password/authenticated-token",
    });
  });

  it.each([
    "body",
    "basename",
    "operation",
  ] as const)("rejects a committed artifact with tampered %s binding", async (tamper) => {
    const directory = await createDirectory();
    const htmlPath = await publishReset(directory);
    const textPath = htmlPath.replace(/\.html$/u, ".txt");
    const metadataPath = htmlPath.replace(/\.html$/u, ".metadata.json");
    if (tamper === "body") {
      await writeFile(textPath, "tampered body", "utf8");
    } else {
      const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as {
        artifact: string;
        operation: string;
      };
      if (tamper === "basename") {
        metadata.artifact = "other-artifact";
      }
      if (tamper === "operation") {
        metadata.operation = "verify-email";
      }
      await writeFile(metadataPath, JSON.stringify(metadata), "utf8");
    }

    await expect(
      waitForReset(directory, "alice@domain.test", 20)
    ).rejects.toThrowError(
      "Timed out waiting for reset-password preview artifact."
    );
  });
});

describe("run-owned contact preview polling", () => {
  it("requires a fresh regular HTML/text pair with unique contact markers", async () => {
    const directory = await createDirectory();
    const artifactName = "contact-00000000-0000-4000-8000-000000000001";
    await Promise.all([
      writeFile(
        join(directory, `${artifactName}.html`),
        "<main>Contact</main>"
      ),
      writeFile(
        join(directory, `${artifactName}.txt`),
        "From: unique-contact@domain.test\nSubject: Unique contact subject"
      ),
    ]);

    await expect(
      waitForContactPreview({
        after: Date.now() - 1000,
        directory,
        recipientEmail: "unique-contact@domain.test",
        subject: "Wrong subject",
        timeoutMs: 20,
      })
    ).rejects.toThrowError("Timed out waiting for contact preview artifact.");
    await expect(
      waitForContactPreview({
        after: Date.now() - 1000,
        directory,
        recipientEmail: "unique-contact@domain.test",
        subject: "Unique contact subject",
      })
    ).resolves.toBeUndefined();
  });
});
