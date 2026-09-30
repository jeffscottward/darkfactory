// What: the Linux process filter (seccomp) for OMP runs and git. The macOS
// sandbox-exec profiles (omp.ts#sandboxProfileFor, omp.ts#gitSandboxProfileFor)
// leave out process-fork; this filter is their Linux counterpart. bubblewrap
// loads it just before it starts the sandboxed program, which then cannot
// start another process (fork, vfork and process-creating clone fail with
// EPERM) but can still run threads.
// Used by: packages/jobs/src/server/omp.ts (ompSandboxCommand, gitSandboxCommand, runGit, requireBubblewrap).
// See: docs/operator.md#platform-support

import type { Writable } from "node:stream";

// struct seccomp_data (linux/seccomp.h): the system call number, its audit
// architecture and, on these little-endian targets, the low 32 bits of the
// first argument, which holds the clone flags.
const SYSCALL_NUMBER = 0;
const AUDIT_ARCHITECTURE = 4;
const FIRST_ARGUMENT_LOW_WORD = 16;

// Classic BPF opcodes (linux/bpf_common.h).
const LOAD_WORD = 0x20; // BPF_LD | BPF_W | BPF_ABS
const JUMP_IF_EQUAL = 0x15; // BPF_JMP | BPF_JEQ | BPF_K
const JUMP_IF_AT_LEAST = 0x35; // BPF_JMP | BPF_JGE | BPF_K
const JUMP_IF_ANY_BIT = 0x45; // BPF_JMP | BPF_JSET | BPF_K
const RETURN = 0x06; // BPF_RET | BPF_K

// Filter results (linux/seccomp.h, asm-generic/errno-base.h).
const RESULTS = Object.freeze({
  allow: 0x7f_ff_00_00, // SECCOMP_RET_ALLOW
  deny: 0x00_05_00_01, // SECCOMP_RET_ERRNO | EPERM
  // clone3 passes its flags in memory, which a filter cannot read. ENOSYS
  // makes the C library fall back to clone, whose flags it can read.
  unsupported: 0x00_05_00_26, // SECCOMP_RET_ERRNO | ENOSYS
  kill: 0x80_00_00_00, // SECCOMP_RET_KILL_PROCESS
} as const);
type Result = keyof typeof RESULTS;
const RESULT_ORDER = Object.freeze(Object.keys(RESULTS) as Result[]);

// A thread shares its process (linux/sched.h CLONE_THREAD); anything else that
// clone creates is a new process.
const CLONE_THREAD = 0x00_01_00_00;
// x32 system calls run on x86_64 kernels with this bit in their number, so
// they would not match the x86_64 numbers below.
const X32_SYSCALL_BIT = 0x40_00_00_00;

type ArchitectureSyscalls = Readonly<{
  audit: number;
  clone: number;
  clone3: number;
  forks: readonly number[];
  x32: boolean;
}>;

// The architectures that Node.js and OMP ship Linux builds for.
const SYSCALLS: ReadonlyMap<string, ArchitectureSyscalls> = new Map<
  string,
  ArchitectureSyscalls
>([
  // AUDIT_ARCH_X86_64; arch/x86/entry/syscalls/syscall_64.tbl.
  [
    "x64",
    Object.freeze({
      audit: 0xc0_00_00_3e,
      clone: 56,
      clone3: 435,
      forks: Object.freeze([57, 58]),
      x32: true,
    }),
  ],
  // AUDIT_ARCH_AARCH64; include/uapi/asm-generic/unistd.h has no fork or vfork.
  [
    "arm64",
    Object.freeze({
      audit: 0xc0_00_00_b7,
      clone: 220,
      clone3: 435,
      forks: Object.freeze([]),
      x32: false,
    }),
  ],
]);

type Target = Result | "next";
type Step = Readonly<{
  code: number;
  value: number;
  match: Target;
  otherwise: Target;
}>;

const load = (offset: number): Step => ({
  code: LOAD_WORD,
  value: offset,
  match: "next",
  otherwise: "next",
});

const jump = (
  code: number,
  value: number,
  match: Target,
  otherwise: Target
): Step => ({ code, value, match, otherwise });

// struct sock_filter is { u16 code; u8 jt; u8 jf; u32 k } in host byte order,
// little-endian on both supported architectures. Every jump goes forward to
// the next step or to one of the result steps at the end.
const INSTRUCTION_BYTES = 8;

// The seccomp program for one architecture: other architectures (i386 or
// arm32 compat calls) and x32 calls kill the process, clone3 reports ENOSYS,
// fork, vfork and clone without CLONE_THREAD report EPERM, and every other
// system call runs as usual. exec stays allowed, since bubblewrap uses it to
// start the program after loading the filter; without fork, an exec can only
// replace the sandboxed process itself, still inside the sandbox and filter.
export const processFilterFor = (architecture: string): Buffer => {
  const syscalls = SYSCALLS.get(architecture);
  if (syscalls === undefined) {
    throw new Error(`process filter is unsupported on ${architecture}`);
  }
  const steps: readonly Step[] = [
    load(AUDIT_ARCHITECTURE),
    jump(JUMP_IF_EQUAL, syscalls.audit, "next", "kill"),
    load(SYSCALL_NUMBER),
    ...(syscalls.x32
      ? [jump(JUMP_IF_AT_LEAST, X32_SYSCALL_BIT, "kill", "next")]
      : []),
    jump(JUMP_IF_EQUAL, syscalls.clone3, "unsupported", "next"),
    ...syscalls.forks.map((fork) => jump(JUMP_IF_EQUAL, fork, "deny", "next")),
    jump(JUMP_IF_EQUAL, syscalls.clone, "next", "allow"),
    load(FIRST_ARGUMENT_LOW_WORD),
    jump(JUMP_IF_ANY_BIT, CLONE_THREAD, "allow", "deny"),
  ];
  const offsetFrom = (index: number, target: Target): number =>
    target === "next"
      ? 0
      : steps.length + RESULT_ORDER.indexOf(target) - index - 1;
  const program = Buffer.alloc(
    (steps.length + RESULT_ORDER.length) * INSTRUCTION_BYTES
  );
  for (const [index, step] of steps.entries()) {
    const at = index * INSTRUCTION_BYTES;
    program.writeUInt16LE(step.code, at);
    program.writeUInt8(offsetFrom(index, step.match), at + 2);
    program.writeUInt8(offsetFrom(index, step.otherwise), at + 3);
    program.writeUInt32LE(step.value, at + 4);
  }
  for (const [position, result] of RESULT_ORDER.entries()) {
    const at = (steps.length + position) * INSTRUCTION_BYTES;
    program.writeUInt16LE(RETURN, at);
    program.writeUInt32LE(RESULTS[result], at + 4);
  }
  return program;
};

// bwrap reads the filter from this descriptor, closes it and loads the filter
// right before it starts the sandboxed program.
export const processFilterArguments = (fd: number): readonly string[] =>
  Object.freeze(["--seccomp", String(fd)]);

// Sends the whole filter and closes the stream, so bwrap sees its end.
export const sendProcessFilter = (stream: Writable, filter: Buffer): void => {
  stream.on("error", () => {
    // bwrap exited before it read the filter, so it started nothing, and its
    // exit already fails the run.
  });
  stream.end(filter);
};
