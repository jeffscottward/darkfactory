var range: (start: number, end: number) => number[] = (start, end) => {
  const length = end - start;
  if (length <= 0) return [];
  const arr = Array(length);
  for (let i = 0; i < length; ++i) {
    arr[i] = i + start;
  }
  return arr;
};
import { afterEach, describe, expect, it, vi } from "vitest"

import type {
  MetricObservation,
  SemanticEvent,
  SpanHandle,
  StructuredEventSink,
} from "../port.ts"
import { createSemanticEventFanout } from "./fanout.ts"

const correlation = {
  requestId: "request_01",
  traceId: "11111111111111111111111111111111",
  spanId: "2222222222222222",
  actorId: "actor_opaque_01",
  route: "/rpc/feature.create",
  procedure: "feature.create",
} as const

const baseEvent: SemanticEvent = {
  eventId: "event_01",
  name: "feature-item.created",
  occurredAt: "2026-07-23T12:00:00.000Z",
  correlation,
  action: "create",
  entityId: "feature_01",
  entityType: "feature-item",
  outcome: "success",
  source: "api",
  attributes: { status: "draft", password: "raw-password" },
}

const createSpan = function() {
  const events: SemanticEvent[] = []
  const metrics: MetricObservation[] = []
  const span: SpanHandle = {
    correlation,
    addEvent: function(event) { return events.push(event) },
    recordMetric: function(metric) { return metrics.push(metric) },
  }
  return { span, events, metrics }
}

afterEach(function() { return vi.restoreAllMocks() })

describe("createSemanticEventFanout", function() {
  it("snapshots and redacts once, then performs exactly one sink, span-event, metric, and consented analytics call", async function() {
    const sinkEvents: SemanticEvent[] = []
    const sink: StructuredEventSink = {
      emit: vi.fn((event: SemanticEvent) => {
        sinkEvents.push(event)
        return undefined
      }
      ),
    }
    const analyticsCapture = vi.fn(async function() { return ({
      status: "captured" as const,
      eventId: "event_01",
    }) })
    const resolveConsent = vi.fn(async function() { return "granted" as const })
    const waitUntil = vi.fn(function(promise: Promise<unknown>) { return void promise })
    const { span, events: spanEvents, metrics } = createSpan()
    const consoleLog = vi.spyOn(console, "log").mockImplementation(function() { return undefined })
    const consoleError = vi.spyOn(console, "error").mockImplementation(function() { return undefined })
    const event = { ...baseEvent } as SemanticEvent
    Object.defineProperty(event, "attributes", {
      enumerable: true,
      value: baseEvent.attributes,
    })
    const fanout = createSemanticEventFanout({
      sink,
      analytics: { capture: analyticsCapture },
      resolveConsent,
    })

    const result = await fanout.emit(event, { span, waitUntil })

    expect(sink.emit).toHaveBeenCalledOnce()
    expect(spanEvents).toHaveLength(1)
    expect(metrics).toEqual([
      {
        name: "darkfactory.semantic_event",
        value: 1,
        attributes: {
          eventName: "feature-item.created",
          outcome: "success",
        },
      },
    ])
    expect(sinkEvents[0]).toBe(spanEvents[0])
    expect(Object.isFrozen(sinkEvents[0])).toBe(true)
    expect(JSON.stringify(sinkEvents[0])).not.toContain("raw-password")
    expect(resolveConsent).toHaveBeenCalledOnce()
    expect(analyticsCapture).toHaveBeenCalledOnce()
    expect(analyticsCapture).toHaveBeenCalledWith({
      consent: "granted",
      distinctId: "actor_opaque_01",
      event: "feature-item.created",
      eventId: "event_01",
      properties: {
        action: "create",
        entityId: "feature_01",
        entityType: "feature-item",
        outcome: "success",
        requestId: "request_01",
        source: "api",
        traceId: "11111111111111111111111111111111",
      },
      timestamp: "2026-07-23T12:00:00.000Z",
    })
    expect(waitUntil).toHaveBeenCalledOnce()
    expect(consoleLog).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
    return expect(result).toEqual({
      structuredEvent: "emitted",
      span: "recorded",
      analytics: "captured",
    })
  })

  it("does not call analytics for denied, unknown, absent actor, or failed consent", async function() {
    for (const resolveConsent of [
      vi.fn(async function() { return "denied" as const }),
      vi.fn(async function() { return "unknown" as const }),
      vi.fn(async function() { throw new Error("raw-consent-provider-body") }),
    ]) {
      const analyticsCapture = vi.fn()
      const fanout = createSemanticEventFanout({
        sink: { emit: vi.fn() },
        analytics: { capture: analyticsCapture },
        resolveConsent,
      })

      const result = await fanout.emit(baseEvent)

      expect(analyticsCapture).not.toHaveBeenCalled()
      expect(result.analytics).toBe("skipped")
      expect(JSON.stringify(result)).not.toContain("raw-consent-provider-body")
    }

    const analyticsCapture = vi.fn()
    const fanout = createSemanticEventFanout({
      sink: { emit: vi.fn() },
      analytics: { capture: analyticsCapture },
      resolveConsent: vi.fn(async function() { return "granted" as const }),
    })
    await fanout.emit({
      ...baseEvent,
      correlation: {
        requestId: correlation.requestId,
        traceId: correlation.traceId,
        spanId: correlation.spanId,
        route: correlation.route,
        procedure: correlation.procedure,
      },
    })
    await fanout.emit({
      ...baseEvent,
      correlation: {
        ...correlation,
        actorId: "[Undefined]",
      },
    })
    return expect(analyticsCapture).not.toHaveBeenCalled()
  })

  it("contains adapter failures as safe result states without retrying or duplicating calls", async function() {
    const sink = {
      emit: vi.fn(function() { throw new Error("raw-provider-payload secret=hidden") }),
    }
    const analyticsCapture = vi.fn(async function() { throw new Error("raw-analytics-body") })
    const { span, events, metrics } = createSpan()
    const fanout = createSemanticEventFanout({
      sink,
      analytics: { capture: analyticsCapture },
      resolveConsent: vi.fn(async function() { return "granted" as const }),
    })

    const result = await fanout.emit(baseEvent, { span })

    expect(sink.emit).toHaveBeenCalledOnce()
    expect(events).toHaveLength(1)
    expect(metrics).toHaveLength(1)
    expect(analyticsCapture).toHaveBeenCalledOnce()
    expect(result).toEqual({
      structuredEvent: "failed",
      span: "recorded",
      analytics: "failed",
    })
    return expect(JSON.stringify(result)).not.toMatch(
      /raw-provider-payload|secret=hidden|raw-analytics-body/
    )
  })


  it("canonicalizes required event fields before bounded optional data despite key floods", async function() {
    const flooded: Record<string, unknown> = {}
    for (const index in range(0,100)) {
      flooded[`attacker_${index.toString().padStart(3, "0")}`] = "ignored"
    }
    Object.assign(flooded, baseEvent, {
      attributes: Object.fromEntries(
        Array.from({ length: 100 }, function(_, index) { return [
          `optional_${index.toString().padStart(3, "0")}`,
          index,
        ] })
      ),
    })
    const sink = { emit: vi.fn() }
    const { span, events, metrics } = createSpan()
    const fanout = createSemanticEventFanout({ sink })

    await expect(
      fanout.emit(flooded as unknown as SemanticEvent, { span })
    ).resolves.toEqual({
      structuredEvent: "emitted",
      span: "recorded",
      analytics: "skipped",
    })
    expect(sink.emit).toHaveBeenCalledOnce()
    expect(events[0]?.eventId).toBe(baseEvent.eventId)
    expect(events[0]?.name).toBe(baseEvent.name)
    expect(events[0]?.correlation.requestId).toBe(correlation.requestId)
    expect(metrics).toHaveLength(1)
    expect(JSON.stringify(events[0])).not.toContain("attacker_")
    return expect(JSON.stringify(events[0])).not.toContain("optional_099")
  })

  it("rejects unsafe required-field access before any partial fanout", async function() {
    const unsafe = { ...baseEvent }
    Object.defineProperty(unsafe, "name", {
      enumerable: true,
      get: function() { throw new Error("raw-required-field-secret") },
    })
    const sink = { emit: vi.fn() }
    const analyticsCapture = vi.fn()
    const { span, events, metrics } = createSpan()
    const fanout = createSemanticEventFanout({
      sink,
      analytics: { capture: analyticsCapture },
      resolveConsent: vi.fn(async function() { return "granted" as const }),
    })

    await expect(
      fanout.emit(unsafe, { span })
    ).rejects.toThrow("Invalid semantic event")
    expect(sink.emit).not.toHaveBeenCalled()
    expect(events).toHaveLength(0)
    expect(metrics).toHaveLength(0)
    return expect(analyticsCapture).not.toHaveBeenCalled()
  })

  it("emits to the required sink when no optional targets exist", async function() {
    const sink = { emit: vi.fn() }
    const fanout = createSemanticEventFanout({ sink })

    const result = await fanout.emit(baseEvent)

    expect(sink.emit).toHaveBeenCalledOnce()
    expect(result).toEqual({
      structuredEvent: "emitted",
      span: "skipped",
      analytics: "skipped",
    })
    return expect(Object.isFrozen(result)).toBe(true)
  })

  it("maps skipped and failed analytics adapter results onto the fanout contract", async function() {
    const cases = [
      [
        {
          status: "skipped",
          reason: "disabled",
        } as const,
        "skipped" as const,
      ],
      [
        {
          status: "failed",
          category: "network",
          retryable: true,
        } as const,
        "failed" as const,
      ],
    ] as const

    const results=[];for (const [adapterResult, expectedStatus] of cases) {
      const capture = vi.fn(async () => adapterResult)
      const resolveConsent = vi.fn(() => "granted" as const)
      const fanout = createSemanticEventFanout({
        sink: { emit: vi.fn() },
        analytics: { capture },
        resolveConsent,
      })

      const result = await fanout.emit(baseEvent)

      expect(resolveConsent).toHaveBeenCalledWith(baseEvent.correlation)
      expect(capture).toHaveBeenCalledOnce()
      results.push(expect(result.analytics).toBe(expectedStatus))
    };return results;
  })

  it("records span failure while still attempting both span operations", async function() {
    const results1=[];for (const failingOperation of ["event", "metric"] as const) {
      const addEvent = vi.fn((_event: SemanticEvent) => {
        if (failingOperation === "event") {
          throw new Error("span event unavailable")
        };return
      }
      )
      const recordMetric = vi.fn((_metric: MetricObservation) => {
        if (failingOperation === "metric") {
          throw new Error("span metric unavailable")
        };return
      }
      )
      const span: SpanHandle = {
        correlation,
        addEvent,
        recordMetric,
      }
      const fanout = createSemanticEventFanout({
        sink: { emit: vi.fn() },
      })

      const result = await fanout.emit(baseEvent, { span })

      expect(addEvent).toHaveBeenCalledOnce()
      expect(recordMetric).toHaveBeenCalledOnce()
      results1.push(expect(result).toEqual({
        structuredEvent: "emitted",
        span: "failed",
        analytics: "skipped",
      }))
    };return results1;
  })

  it("contains an asynchronous sink failure and a broken lifetime hook", async function() {
    const sink = {
      emit: vi.fn(async () => {
        throw new Error("structured transport unavailable")
      }
      ),
    }
    const capture = vi.fn(async () => ({
      status: "captured" as const,
      eventId: baseEvent.eventId,
    }))
    const waitUntil = vi.fn((_task: Promise<unknown>) => {
      throw "raw-provider-token=hidden"
    }
    )
    const fanout = createSemanticEventFanout({
      sink,
      analytics: { capture },
      resolveConsent: () => "granted",
    })

    const result = await fanout.emit(baseEvent, { waitUntil })

    expect(sink.emit).toHaveBeenCalledOnce()
    expect(waitUntil).toHaveBeenCalledOnce()
    expect(capture).toHaveBeenCalledOnce()
    expect(result).toEqual({
      structuredEvent: "failed",
      span: "skipped",
      analytics: "captured",
    })
    return expect(JSON.stringify(result)).not.toMatch(/raw-provider|token=hidden/)
  })

  it("maps a required-only event to minimal analytics and metric payloads", async function() {
    const capture = vi.fn(async () => ({
      status: "captured" as const,
      eventId: "event_minimal",
    }))
    const { span, metrics } = createSpan()
    const event: SemanticEvent = {
      eventId: "event_minimal",
      name: "feature-item.created",
      occurredAt: "2026-07-23T12:00:00.000Z",
      correlation: {
        requestId: "request_minimal",
        actorId: "actor_minimal",
      },
    }
    const fanout = createSemanticEventFanout({
      sink: { emit: vi.fn() },
      analytics: { capture },
      resolveConsent: () => "granted",
    })

    await expect(fanout.emit(event, { span })).resolves.toEqual({
      structuredEvent: "emitted",
      span: "recorded",
      analytics: "captured",
    })
    expect(capture).toHaveBeenCalledWith({
      consent: "granted",
      distinctId: "actor_minimal",
      event: "feature-item.created",
      eventId: "event_minimal",
      properties: { requestId: "request_minimal" },
      timestamp: "2026-07-23T12:00:00.000Z",
    })
    return expect(metrics).toEqual([{
      name: "darkfactory.semantic_event",
      value: 1,
      attributes: { eventName: "feature-item.created" },
    }])
  })

  return it("skips analytics when a capture adapter has no consent resolver", async function() {
    const capture = vi.fn()
    const fanout = createSemanticEventFanout({
      sink: { emit: vi.fn() },
      analytics: { capture },
    })

    await expect(fanout.emit(baseEvent)).resolves.toEqual({
      structuredEvent: "emitted",
      span: "skipped",
      analytics: "skipped",
    })
    return expect(capture).not.toHaveBeenCalled()
  })
})
