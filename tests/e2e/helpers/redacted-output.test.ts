import { once } from "node:events";

import { describe, expect, it } from "vitest";

import { createSensitiveOutputRedactor } from "./redacted-output";
import {
  E2E_SENSITIVE_BINDING_KEYS,
  redactSensitiveBindingValues,
  type E2EProcessEnvironment,
} from "./runtime";

const sensitiveEnvironment = (): E2EProcessEnvironment => ({
  APP_URL: "https://darkfactory.localhost",
  ...Object.fromEntries(
    E2E_SENSITIVE_BINDING_KEYS.map((key, index) => [
      key,
      `opaque-sensitive-${index}-value`,
    ])
  ),
});

const collectRedactedOutput = async (
  chunks: readonly string[],
  environment: E2EProcessEnvironment
): Promise<string> => {
  const redactor = createSensitiveOutputRedactor(environment);
  let output = "";
  redactor.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  for (const chunk of chunks) {
    redactor.write(Buffer.from(chunk));
  }
  redactor.end();
  await once(redactor, "end");
  return output;
};

describe("E2E Worker process output redaction", () => {
  it("redacts every explicit sensitive binding across chunk boundaries", async () => {
    const environment = sensitiveEnvironment();
    const values = E2E_SENSITIVE_BINDING_KEYS.map((key) => {
      const value = environment[key];
      if (value === undefined) {
        throw new Error("Sensitive binding fixture is incomplete");
      }
      return value;
    });
    const unsafe = `${values.join("|")}\n`;
    const midpoint = Math.floor(unsafe.length / 2);
    const output = await collectRedactedOutput(
      [unsafe.slice(0, midpoint), unsafe.slice(midpoint)],
      environment
    );

    for (const value of values) {
      expect(output).not.toContain(value);
    }
    expect(output).toContain("[REDACTED]");
  });

  it("preserves ordinary status and app URL text in streams and diagnostics", async () => {
    const environment = sensitiveEnvironment();
    const safe = "ready https://darkfactory.localhost status=200\n";

    await expect(collectRedactedOutput([safe], environment)).resolves.toBe(
      safe
    );
    expect(redactSensitiveBindingValues(safe, environment)).toBe(safe);
  });

  it("never emits an unterminated oversized line", async () => {
    const output = await collectRedactedOutput(["x".repeat(65 * 1024)], {});
    expect(output).toBe("[REDACTED OVERSIZED PROCESS OUTPUT]\n");
  });
});
