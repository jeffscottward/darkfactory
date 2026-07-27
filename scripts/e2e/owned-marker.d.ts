import type { FileHandle } from "node:fs/promises";

export type OwnedMarkerIdentity = Readonly<{ dev: number; ino: number }>;
export type OwnedFileCapability = Readonly<{
  dev: number;
  ino: number;
  mode: number;
  uid: number;
  gid: number;
  nlink: number;
  ctimeMs: number;
  mtimeMs: number;
  size: number;
}>;
export type OwnedMarkerRead = Readonly<{
  expected: OwnedMarkerIdentity;
  before: OwnedFileCapability;
  after: OwnedFileCapability;
  content: string;
  expectedContent: string;
}>;

type OwnedMarkerHandle = Pick<FileHandle, "close" | "readFile" | "stat">;

export declare const requireFileFlag: (flag: number | undefined) => number;

export declare const rethrowOwnedLifecycleReadError: (error: unknown) => never;

export declare const assertStableOwnedRoot: (
  before: OwnedFileCapability,
  after: OwnedFileCapability
) => void;

export declare const assertStableOwnedMarkerRead: (
  expected: OwnedMarkerRead["expected"],
  before: OwnedMarkerRead["before"],
  after: OwnedMarkerRead["after"],
  content: string,
  expectedContent: string
) => void;

export declare const inspectAndCloseOwnedMarker: (
  marker: OwnedMarkerHandle,
  expected: OwnedMarkerIdentity,
  owner: Readonly<{ uid: number; gid: number }>,
  expectedContent: string
) => Promise<void>;

export declare const assertStableOwnedLifecycleRoot: (
  path: string,
  ownerFile: string,
  expected: Readonly<{
    root: OwnedMarkerIdentity;
    marker: OwnedMarkerIdentity;
  }>,
  expectedContent: string,
  assertDirectory: (path: string) => Promise<void>
) => Promise<void>;
