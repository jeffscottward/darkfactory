export type CorrelationContext = Readonly<{
  requestId: string
  traceId?: string
  spanId?: string
  actorId?: string
  route?: string
  procedure?: string
}>

export type EventOutcome = "success" | "failure"
export type EventSource = "api" | "system" | "web" | "worker"

export type SemanticEvent = Readonly<{
  eventId: string
  name: string
  occurredAt: string
  correlation: CorrelationContext
  action?: string
  entityId?: string
  entityType?: string
  outcome?: EventOutcome
  source?: EventSource
  errorCategory?: string
  durationMs?: number
  attributes?: Readonly<Record<string, unknown>>
}>

export interface StructuredEventSink {
  emit(event: SemanticEvent): void | Promise<void>
}

export type MetricObservation = Readonly<{
  name: string
  value: number
  attributes?: Readonly<Record<string, string | number | boolean>>
}>

export interface SpanHandle {
  readonly correlation: CorrelationContext
  addEvent(event: SemanticEvent): void
  recordMetric(metric: MetricObservation): void
}

export type SpanInput = Readonly<{
  name: string
  correlation: CorrelationContext
  procedure?: string
  attributes?: Readonly<Record<string, string | number | boolean>>
}>

export interface TelemetryPort {
  withSpan<T>(
    input: SpanInput,
    run: (span: SpanHandle) => T | Promise<T>
  ): Promise<T>
}

export type TelemetryRuntimeState =
  | Readonly<{ status: "disabled" }>
  | Readonly<{
      status: "unconfigured"
      reason: "service-name-missing" | "endpoint-invalid" | "headers-invalid"
    }>
  | Readonly<{ status: "no-export" }>
  | Readonly<{ status: "in-memory" }>
  | Readonly<{ status: "exporting" }>

export interface TelemetryRuntime extends TelemetryPort {
  readonly state: TelemetryRuntimeState
  forceFlush(): Promise<void>
  dispose(): Promise<void>
}

export type AnalyticsConsent = "granted" | "denied" | "unknown"

export type AnalyticsCapture = Readonly<{
  consent: AnalyticsConsent
  distinctId: string
  event: string
  eventId: string
  properties: Readonly<{
    action?: string
    entityId?: string
    entityType?: string
    outcome?: EventOutcome
    requestId?: string
    source?: EventSource
    traceId?: string
  }>
  timestamp?: string
}>

export type AnalyticsResult =
  | Readonly<{ status: "captured"; eventId: string }>
  | Readonly<{
      status: "skipped"
      reason: "consent-denied" | "consent-unknown" | "disabled" | "unconfigured"
    }>
  | Readonly<{
      status: "failed"
      category: "invalid-capture" | "network" | "provider-rejected" | "timeout"
      retryable: boolean
      statusCode?: number
    }>

export interface AnalyticsCaptureFacade {
  capture(input: AnalyticsCapture): Promise<AnalyticsResult>
}

export type ConsentResolver = (
  correlation: CorrelationContext
) => AnalyticsConsent | Promise<AnalyticsConsent>

export type WaitUntil = (promise: Promise<unknown>) => void

export type SemanticEmissionContext = Readonly<{
  span?: SpanHandle
  waitUntil?: WaitUntil
}>

export type SemanticEmissionResult = Readonly<{
  structuredEvent: "emitted" | "failed"
  span: "recorded" | "skipped" | "failed"
  analytics: "captured" | "skipped" | "failed"
}>

export interface SemanticEventPort {
  emit(
    event: SemanticEvent,
    context?: SemanticEmissionContext
  ): Promise<SemanticEmissionResult>
}
