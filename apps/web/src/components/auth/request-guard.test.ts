import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock("next/link", () => ({ default: "a" }))

import {
  createRequestGuard,
  runGuardedRequest,
  type RequestGuard,
} from "./request-guard.ts"
import { signInRequestController } from "./sign-in-form.tsx"
import { resetPasswordRequestController } from "./reset-password-form.tsx"

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    return resolve = next
  }
  )
  return { promise, resolve }
}

const run = <T,>(
  guard: RequestGuard,
  promise: Promise<T>,
  commit: (value: T) => void,
  settle = vi.fn(),
) => ({
  completion: runGuardedRequest({ guard, request: () => promise, commit, settle }),
  settle,
})

describe("auth request guard", function() {
  it("commits and settles the current request", async function() {
    const guard = createRequestGuard()
    const request = deferred<string>()
    const commit = vi.fn()
    const { completion, settle } = run(guard, request.promise, commit)

    request.resolve("current")

    await expect(completion).resolves.toBe(true)
    expect(commit).toHaveBeenCalledWith("current")
    return expect(settle).toHaveBeenCalledOnce()
  })

  it("prevents completion after disposal from committing or settling state", async function() {
    const guard = createRequestGuard()
    const request = deferred<string>()
    const commit = vi.fn()
    const { completion, settle } = run(guard, request.promise, commit)

    guard.dispose()
    request.resolve("stale")

    await expect(completion).resolves.toBe(false)
    expect(commit).not.toHaveBeenCalled()
    return expect(settle).not.toHaveBeenCalled()
  })

  it("allows only the newest request to commit after supersession", async function() {
    const guard = createRequestGuard()
    const first = deferred<string>()
    const second = deferred<string>()
    const commit = vi.fn()
    const firstRun = run(guard, first.promise, commit)
    const secondRun = run(guard, second.promise, commit)

    first.resolve("first")
    second.resolve("second")

    await expect(firstRun.completion).resolves.toBe(false)
    await expect(secondRun.completion).resolves.toBe(true)
    expect(commit).toHaveBeenCalledOnce()
    expect(commit).toHaveBeenCalledWith("second")
    expect(firstRun.settle).not.toHaveBeenCalled()
    return expect(secondRun.settle).toHaveBeenCalledOnce()
  })

  it("invalidates an active request and allows the next request to recover", async function() {
    const guard = createRequestGuard()
    const stale = deferred<string>()
    const staleCommit = vi.fn()
    const staleRun = run(guard, stale.promise, staleCommit)

    guard.invalidate()
    stale.resolve("stale")

    await expect(staleRun.completion).resolves.toBe(false)
    expect(staleCommit).not.toHaveBeenCalled()
    expect(staleRun.settle).not.toHaveBeenCalled()

    const currentCommit = vi.fn()
    await expect(
      runGuardedRequest({
        guard,
        request: async () => "recovered",
        commit: currentCommit,
      }),
    ).resolves.toBe(true)
    return expect(currentCommit).toHaveBeenCalledWith("recovered")
  })

  it("settles a failed current request and keeps the guard reusable", async function() {
    const guard = createRequestGuard()
    const failure = new Error("request failed")
    const commit = vi.fn()
    const settle = vi.fn()

    await expect(
      runGuardedRequest({
        guard,
        request: async () => {
          throw failure
        },
        commit,
        settle,
      }),
    ).rejects.toBe(failure)
    expect(commit).not.toHaveBeenCalled()
    expect(settle).toHaveBeenCalledOnce()

    await expect(
      runGuardedRequest({
        guard,
        request: async () => "next request",
        commit,
      }),
    ).resolves.toBe(true)
    return expect(commit).toHaveBeenCalledWith("next request")
  })

  return it("binds both redirecting auth forms to the shared guarded controller", function() {
    expect(signInRequestController).toBe(runGuardedRequest)
    return expect(resetPasswordRequestController).toBe(runGuardedRequest)
  })
})
