import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  processFilterArguments,
  processFilterFor,
  sendProcessFilter,
} from "./seccomp.ts";

const ALLOW = 0x7f_ff_00_00;
const EPERM = 0x00_05_00_01;
const ENOSYS = 0x00_05_00_26;
const KILL = 0x80_00_00_00;
const X86_64 = 0xc0_00_00_3e;
const AARCH64 = 0xc0_00_00_b7;
const I386 = 0x40_00_00_03;
const ARM = 0x40_00_00_28;
// What glibc's pthread_create passes to clone (CLONE_VM, CLONE_FS,
// CLONE_FILES, CLONE_SIGHAND, CLONE_THREAD, CLONE_SYSVSEM, CLONE_SETTLS,
// CLONE_PARENT_SETTID, CLONE_CHILD_CLEARTID), and what fork and posix_spawn
// pass (SIGCHLD; CLONE_VM | CLONE_VFORK | SIGCHLD).
const THREAD_FLAGS = 0x00_3d_0f_00;
const FORK_FLAGS = 17;
const SPAWN_FLAGS = 0x41_11;

// struct sock_filter: [code, jt, jf, k].
const instructionsOf = (program: Buffer): number[][] =>
  Array.from({ length: program.byteLength / 8 }, (_, index) => [
    program.readUInt16LE(index * 8),
    program.readUInt8(index * 8 + 2),
    program.readUInt8(index * 8 + 3),
    program.readUInt32LE(index * 8 + 4),
  ]);

// Runs the program the way the kernel does over one struct seccomp_data,
// for the instructions the filter uses.
const evaluate = (
  program: Buffer,
  call: Readonly<{ arch: number; nr: number; flags?: number }>
): number => {
  const instructions = instructionsOf(program);
  const fields = new Map([
    [0, call.nr],
    [4, call.arch],
    [16, call.flags ?? 0],
  ]);
  let accumulator = 0;
  let index = 0;
  while (index < instructions.length) {
    const [code, jt, jf, k] = instructions[index]!;
    if (code === 0x20) {
      accumulator = fields.get(k!)!;
      index += 1;
    } else if (code === 0x06) {
      return k!;
    } else {
      const matched =
        code === 0x15
          ? accumulator === k
          : code === 0x35
            ? accumulator >= k!
            : (accumulator & k!) >>> 0 !== 0;
      index += 1 + (matched ? jt! : jf!);
    }
  }
  throw new Error("the program ran past its end");
};

describe("process filter", () => {
  it("builds the x86_64 program", () =>
    expect(instructionsOf(processFilterFor("x64"))).toEqual([
      [0x20, 0, 0, 4],
      [0x15, 0, 11, X86_64],
      [0x20, 0, 0, 0],
      [0x35, 9, 0, 0x40_00_00_00],
      [0x15, 7, 0, 435],
      [0x15, 5, 0, 57],
      [0x15, 4, 0, 58],
      [0x15, 0, 2, 56],
      [0x20, 0, 0, 16],
      [0x45, 0, 1, 0x00_01_00_00],
      [0x06, 0, 0, ALLOW],
      [0x06, 0, 0, EPERM],
      [0x06, 0, 0, ENOSYS],
      [0x06, 0, 0, KILL],
    ]));

  it("builds the aarch64 program, which has no fork or vfork", () =>
    expect(instructionsOf(processFilterFor("arm64"))).toEqual([
      [0x20, 0, 0, 4],
      [0x15, 0, 8, AARCH64],
      [0x20, 0, 0, 0],
      [0x15, 5, 0, 435],
      [0x15, 0, 2, 220],
      [0x20, 0, 0, 16],
      [0x45, 0, 1, 0x00_01_00_00],
      [0x06, 0, 0, ALLOW],
      [0x06, 0, 0, EPERM],
      [0x06, 0, 0, ENOSYS],
      [0x06, 0, 0, KILL],
    ]));

  it("allows threads and denies every other new process on x86_64", () => {
    const program = processFilterFor("x64");
    const run = (nr: number, flags?: number, arch = X86_64) =>
      evaluate(program, {
        arch,
        nr,
        ...(flags === undefined ? {} : { flags }),
      });
    return expect({
      read: run(0),
      execve: run(59),
      thread: run(56, THREAD_FLAGS),
      forkingClone: run(56, FORK_FLAGS),
      spawningClone: run(56, SPAWN_FLAGS),
      fork: run(57),
      vfork: run(58),
      clone3: run(435),
      x32Fork: run(0x40_00_00_39),
      x32Read: run(0x40_00_00_00),
      i386Fork: run(2, undefined, I386),
      aarch64: run(220, THREAD_FLAGS, AARCH64),
    }).toEqual({
      read: ALLOW,
      execve: ALLOW,
      thread: ALLOW,
      forkingClone: EPERM,
      spawningClone: EPERM,
      fork: EPERM,
      vfork: EPERM,
      clone3: ENOSYS,
      x32Fork: KILL,
      x32Read: KILL,
      i386Fork: KILL,
      aarch64: KILL,
    });
  });

  it("allows threads and denies every other new process on aarch64", () => {
    const program = processFilterFor("arm64");
    const run = (nr: number, flags?: number, arch = AARCH64) =>
      evaluate(program, {
        arch,
        nr,
        ...(flags === undefined ? {} : { flags }),
      });
    return expect({
      // 57 and 58 are close and vhangup here, not fork and vfork.
      close: run(57),
      vhangup: run(58),
      execve: run(221),
      thread: run(220, THREAD_FLAGS),
      forkingClone: run(220, FORK_FLAGS),
      spawningClone: run(220, SPAWN_FLAGS),
      clone3: run(435),
      arm32: run(2, undefined, ARM),
      x86_64: run(56, THREAD_FLAGS, X86_64),
    }).toEqual({
      close: ALLOW,
      vhangup: ALLOW,
      execve: ALLOW,
      thread: ALLOW,
      forkingClone: EPERM,
      spawningClone: EPERM,
      clone3: ENOSYS,
      arm32: KILL,
      x86_64: KILL,
    });
  });

  it("fails closed on other architectures", () => {
    for (const architecture of ["ia32", "arm", "riscv64", "constructor"]) {
      expect(() => processFilterFor(architecture)).toThrow(
        `process filter is unsupported on ${architecture}`
      );
    }
  });

  it("names the descriptor that bwrap reads the filter from", () =>
    expect(processFilterArguments(5)).toEqual(["--seccomp", "5"]));

  it("sends the whole filter, ends the stream and tolerates a reader that left", async () => {
    const stream = new PassThrough();
    const filter = processFilterFor("x64");
    sendProcessFilter(stream, filter);
    const received: Buffer[] = [];
    for await (const chunk of stream) received.push(chunk as Buffer);
    expect(Buffer.concat(received)).toEqual(filter);
    // bwrap exited before reading: it never started the program, and the run
    // reports bwrap's exit, so the write error itself is dropped.
    return expect(
      stream.emit(
        "error",
        Object.assign(new Error("write EPIPE"), { code: "EPIPE" })
      )
    ).toBe(true);
  });
});
