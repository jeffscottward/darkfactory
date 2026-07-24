import { Transform, type TransformCallback } from "node:stream";
import { StringDecoder } from "node:string_decoder";

import {
  redactSensitiveBindingValues,
  type E2EProcessEnvironment,
} from "./runtime.ts";

const MAXIMUM_PENDING_LINE_LENGTH = 64 * 1024;
const OVERSIZED_OUTPUT_MARKER = "[REDACTED OVERSIZED PROCESS OUTPUT]\n";

export const createSensitiveOutputRedactor = (
  environment: E2EProcessEnvironment
): Transform => {
  const decoder = new StringDecoder("utf8");
  let pending = "";

  const flushLines = (stream: Transform): void => {
    let newline = pending.indexOf("\n");
    while (newline >= 0) {
      const line = pending.slice(0, newline + 1);
      pending = pending.slice(newline + 1);
      stream.push(redactSensitiveBindingValues(line, environment));
      newline = pending.indexOf("\n");
    }
    if (pending.length > MAXIMUM_PENDING_LINE_LENGTH) {
      pending = "";
      stream.push(OVERSIZED_OUTPUT_MARKER);
    }
  };

  return new Transform({
    transform(
      chunk: Buffer,
      _encoding: BufferEncoding,
      callback: TransformCallback
    ) {
      pending += decoder.write(chunk);
      flushLines(this);
      callback();
    },
    flush(callback: TransformCallback) {
      pending += decoder.end();
      if (pending.length > 0) {
        this.push(redactSensitiveBindingValues(pending, environment));
      }
      pending = "";
      callback();
    },
  });
};
