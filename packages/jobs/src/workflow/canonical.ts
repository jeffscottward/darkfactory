import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import {
  WORKFLOW_MACHINE_ID,
  WORKFLOW_MACHINE_VERSION,
  type WorkflowEffectProposalV1,
  type WorkflowEventV1,
} from "./types.ts";

type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue | undefined };

const encodeCanonical = (
  value: unknown,
  ancestors: Set<object>,
  arrayElement: boolean
): string | undefined => {
  if (value === null) return "null";

  switch (typeof value) {
    case "string":
    case "boolean": {
      return JSON.stringify(value);
    }
    case "number": {
      if (!Number.isFinite(value)) {
        throw new TypeError("Canonical JSON numbers must be finite");
      }
      return JSON.stringify(value);
    }
    case "undefined":
    case "function":
    case "symbol": {
      return arrayElement ? "null" : undefined;
    }
    case "bigint": {
      throw new TypeError("Unsupported canonical JSON value: bigint");
    }
    default: {
      const objectValue = value as object;
      if (ancestors.has(objectValue)) {
        throw new TypeError("Canonical JSON cannot encode cyclic values");
      }

      ancestors.add(objectValue);
      try {
        if (Array.isArray(value)) {
          const items = value.map((item) =>
            encodeCanonical(item, ancestors, true)
          );
          return `[${items.join(",")}]`;
        }

        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
          throw new TypeError("Canonical JSON objects must be plain objects");
        }

        const fields: string[] = [];
        for (const key of Object.keys(value).sort()) {
          const encoded = encodeCanonical(
            (value as Record<string, unknown>)[key],
            ancestors,
            false
          );
          if (encoded !== undefined) {
            fields.push(`${JSON.stringify(key)}:${encoded}`);
          }
        }
        return `{${fields.join(",")}}`;
      } finally {
        ancestors.delete(objectValue);
      }
    }
  }
};

export const canonicalJsonV1 = (
  value: CanonicalJsonValue | unknown
): string => {
  const encoded = encodeCanonical(value, new Set(), false);
  if (encoded === undefined) {
    throw new TypeError("Unsupported canonical JSON root value");
  }
  return encoded;
};

export const sha256Hex = (material: string): string => {
  return bytesToHex(sha256(utf8ToBytes(material)));
};

export const hashWorkflowEffectProposalV1 = (
  proposal: WorkflowEffectProposalV1
): string =>
  sha256Hex(
    canonicalJsonV1({
      machineId: WORKFLOW_MACHINE_ID,
      machineVersion: WORKFLOW_MACHINE_VERSION,
      proposal,
    })
  );

export interface WorkflowJournalHashMaterialV1 {
  readonly sequence: number;
  readonly previousHash: string;
  readonly event: WorkflowEventV1;
}

export const journalHashMaterialV1 = (
  material: WorkflowJournalHashMaterialV1
): string =>
  canonicalJsonV1({
    machineId: WORKFLOW_MACHINE_ID,
    machineVersion: WORKFLOW_MACHINE_VERSION,
    sequence: material.sequence,
    previousHash: material.previousHash,
    event: material.event,
  });

export const hashWorkflowJournalEntryV1 = (
  material: WorkflowJournalHashMaterialV1
): string => sha256Hex(journalHashMaterialV1(material));
