import type { SemanticEvent } from "@darkfactory/observability";
import { describe, expect, it, vi } from "vitest";

import { createRequestDatabaseDiagnosticSink } from "./request-database-diagnostics.ts";

describe("createRequestDatabaseDiagnosticSink", () => {
  it.each([
    ["REQUEST_DATABASE_CLIENT_ERROR", "request-database.client-failed"],
    [
      "REQUEST_DATABASE_CLIENT_CLOSE_ERROR",
      "request-database.client-close-failed",
    ],
  ] as const)("schedules one minimal secret-safe event for %s", async (code, name) => {
    const events: SemanticEvent[] = [];
    const sink = {
      emit: vi.fn((event: SemanticEvent) => {
        events.push(event);
      }),
    };
    const scheduled: Promise<unknown>[] = [];
    const scheduleBackgroundTask = vi.fn((task: Promise<unknown>) => {
      return scheduled.push(task);
    });
    const diagnosticSink = createRequestDatabaseDiagnosticSink({
      sink,
      scheduleBackgroundTask,
      requestId: "request-safe",
    });

    diagnosticSink(Object.freeze({ code }));
    await Promise.all(scheduled);

    expect(scheduleBackgroundTask).toHaveBeenCalledOnce();
    expect(sink.emit).toHaveBeenCalledOnce();
    expect(events).toEqual([
      {
        eventId: expect.any(String),
        name,
        occurredAt: expect.any(String),
        correlation: { requestId: "request-safe" },
        outcome: "failure",
        source: "worker",
        errorCategory: code,
      },
    ]);
    expect(Number.isNaN(Date.parse(events[0]!.occurredAt))).toBe(false);
    expect(JSON.stringify(events)).not.toContain("cookie");
    expect(JSON.stringify(events)).not.toContain("postgres");
    return expect(JSON.stringify(events)).not.toContain("token");
  });

  it("rejects forged diagnostic codes without scheduling or emitting", () => {
    const emit = vi.fn();
    const scheduleBackgroundTask = vi.fn();
    const diagnosticSink = createRequestDatabaseDiagnosticSink({
      sink: { emit },
      scheduleBackgroundTask,
      requestId: "request-safe",
    });

    diagnosticSink({
      code: "provider-secret\r\nforged-log-entry",
    } as never);

    expect(scheduleBackgroundTask).not.toHaveBeenCalled();
    return expect(emit).not.toHaveBeenCalled();
  });

  it("contains emission failure in the tracked background task", async () => {
    const emissionFailure = new Error("private provider failure");
    const scheduled: Promise<unknown>[] = [];
    const diagnosticSink = createRequestDatabaseDiagnosticSink({
      sink: {
        emit: vi.fn(() => {
          throw emissionFailure;
        }),
      },
      scheduleBackgroundTask: (task) => scheduled.push(task),
      requestId: "request-safe",
    });

    expect(() =>
      diagnosticSink(
        Object.freeze({
          code: "REQUEST_DATABASE_CLIENT_CLOSE_ERROR",
        })
      )
    ).not.toThrow();
    return expect(await Promise.allSettled(scheduled)).toEqual([
      { status: "rejected", reason: emissionFailure },
    ]);
  });

  return it("contains emission rejection when background scheduling throws", async () => {
    const emissionFailure = new Error("private provider failure");
    const schedulingFailure = new Error("background scheduling unavailable");
    const emit = vi.fn(async () => {
      throw emissionFailure;
    });
    const diagnosticSink = createRequestDatabaseDiagnosticSink({
      sink: { emit },
      scheduleBackgroundTask: () => {
        throw schedulingFailure;
      },
      requestId: "request-safe",
    });

    expect(() =>
      diagnosticSink(
        Object.freeze({
          code: "REQUEST_DATABASE_CLIENT_CLOSE_ERROR",
        })
      )
    ).not.toThrow();
    return await vi.waitFor(() => {
      return expect(emit).toHaveBeenCalledOnce();
    });
  });
});
