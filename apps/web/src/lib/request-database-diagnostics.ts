import type {
  RequestDatabaseDiagnostic,
  RequestDatabaseDiagnosticSink,
} from "@darkfactory/db/server"
import type {
  SemanticEvent,
  StructuredEventSink,
} from "@darkfactory/observability"

import type {
  BackgroundTaskScheduler,
} from "./background-task-lifecycle.ts"


type RequestDatabaseDiagnosticAdapterOptions = Readonly<{
  sink: StructuredEventSink
  scheduleBackgroundTask: BackgroundTaskScheduler
  requestId: string
}>

const eventProfileFor = (
  diagnostic: RequestDatabaseDiagnostic,
): Readonly<{ name: string; errorCategory: string }> | undefined => {
  switch(diagnostic.code) {
    case "REQUEST_DATABASE_CLIENT_ERROR": {
      return Object.freeze({
        name: "request-database.client-failed",
        errorCategory: "REQUEST_DATABASE_CLIENT_ERROR",
      })
    }
    case "REQUEST_DATABASE_CLIENT_CLOSE_ERROR": {
      return Object.freeze({
        name: "request-database.client-close-failed",
        errorCategory: "REQUEST_DATABASE_CLIENT_CLOSE_ERROR",
      })
    }
    default: { return undefined }
  }
}

export const createRequestDatabaseDiagnosticSink = (
  options: RequestDatabaseDiagnosticAdapterOptions,
): RequestDatabaseDiagnosticSink => {
  return (diagnostic) => {
    const profile = eventProfileFor(diagnostic)
    if (profile === undefined) return
    const event = Object.freeze<SemanticEvent>({
      eventId: globalThis.crypto.randomUUID(),
      name: profile.name,
      occurredAt: new Date().toISOString(),
      correlation: Object.freeze({ requestId: options.requestId }),
      outcome: "failure",
      source: "worker",
      errorCategory: profile.errorCategory,
    })
    const emission = Promise.resolve().then(() => options.sink.emit(event))
    try {
      return options.scheduleBackgroundTask(emission)
    }
    catch {
      return void emission.catch(() => undefined)
    }
  }
}
