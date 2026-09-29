import { describe, expect, it, vi } from "vitest";

import { createBackgroundTaskLifecycle } from "./lib/background-task-lifecycle.ts";

describe("request background task lifecycle", () => {
  it("closes immediately when no task was scheduled", async () => {
    const close = vi.fn(async () => undefined);
    const scheduleExternal = vi.fn();
    const lifecycle = createBackgroundTaskLifecycle(scheduleExternal, close);

    const finalization = lifecycle.finalize();
    expect(lifecycle.finalize()).toBe(finalization);
    await finalization;
    expect(lifecycle.finalize()).toBe(finalization);

    expect(close).toHaveBeenCalledOnce();
    return expect(scheduleExternal).not.toHaveBeenCalled();
  });

  it("keeps finalization behind scheduled tasks and confirmed database close", async () => {
    let releaseTask!: () => void;
    const task = new Promise<void>((resolve) => {
      return (releaseTask = resolve);
    });
    let releaseClose!: () => void;
    const close = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          return (releaseClose = resolve);
        })
    );
    const scheduled: Promise<unknown>[] = [];
    const lifecycle = createBackgroundTaskLifecycle(
      (promise) => scheduled.push(promise),
      close
    );

    lifecycle.schedule(task);
    let finalized = false;
    const finalization = lifecycle.finalize().then(() => {
      return (finalized = true);
    });
    await Promise.resolve();

    expect(finalized).toBe(false);
    expect(close).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);

    releaseTask();
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(finalized).toBe(false);

    releaseClose();
    await finalization;
    expect(finalized).toBe(true);
    return expect(close).toHaveBeenCalledOnce();
  });

  it("drains tasks added by an earlier scheduled task", async () => {
    let releaseFirst!: () => void;
    const first = new Promise<void>((resolve) => {
      return (releaseFirst = resolve);
    });
    let releaseSecond!: () => void;
    const second = new Promise<void>((resolve) => {
      return (releaseSecond = resolve);
    });
    const close = vi.fn(async () => undefined);
    const scheduleExternal = vi.fn((task: Promise<unknown>) => {
      return void task.catch(() => undefined);
    });
    const lifecycle = createBackgroundTaskLifecycle(scheduleExternal, close);
    lifecycle.schedule(
      first.then(() => {
        return lifecycle.schedule(second);
      })
    );

    const finalization = lifecycle.finalize();
    releaseFirst();
    await vi.waitFor(() => expect(scheduleExternal).toHaveBeenCalledTimes(2));
    expect(close).not.toHaveBeenCalled();
    releaseSecond();
    await finalization;
    return expect(close).toHaveBeenCalledOnce();
  });

  it("memoizes close rejection without closing twice", async () => {
    const closeFailure = new Error("close failed");
    const close = vi.fn(async () => {
      throw closeFailure;
    });
    const lifecycle = createBackgroundTaskLifecycle(vi.fn(), close);

    const finalization = lifecycle.finalize();
    const rejection = expect(finalization).rejects.toBe(closeFailure);
    expect(lifecycle.finalize()).toBe(finalization);
    await rejection;
    expect(lifecycle.finalize()).toBe(finalization);
    return expect(close).toHaveBeenCalledOnce();
  });

  it("rejects tasks added after database close starts", async () => {
    let releaseClose!: () => void;
    const close = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          return (releaseClose = resolve);
        })
    );
    const scheduleExternal = vi.fn();
    const lifecycle = createBackgroundTaskLifecycle(scheduleExternal, close);

    const finalization = lifecycle.finalize();
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(() => {
      return lifecycle.schedule(Promise.resolve());
    }).toThrow("Request background task lifecycle is closing");
    expect(scheduleExternal).not.toHaveBeenCalled();
    releaseClose();
    return await finalization;
  });

  return it("settles rejected scheduled work before closing", async () => {
    const close = vi.fn(async () => undefined);
    const scheduleExternal = vi.fn((task: Promise<unknown>) => {
      return void task.catch(() => undefined);
    });
    const lifecycle = createBackgroundTaskLifecycle(scheduleExternal, close);
    lifecycle.schedule(Promise.reject(new Error("background task failed")));

    await expect(lifecycle.finalize()).resolves.toBeUndefined();
    expect(scheduleExternal).toHaveBeenCalledOnce();
    return expect(close).toHaveBeenCalledOnce();
  });
});
