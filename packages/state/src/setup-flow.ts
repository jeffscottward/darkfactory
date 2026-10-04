import { assign, createActor, setup } from "xstate";

export interface SetupFlowContext {
  readonly detailsComplete: boolean;
  readonly error: string | null;
  readonly preferencesComplete: boolean;
  readonly submissionAttempts: number;
}

export type SetupFlowEvent =
  | { readonly type: "SET_DETAILS_COMPLETE"; readonly value: boolean }
  | { readonly type: "SET_PREFERENCES_COMPLETE"; readonly value: boolean }
  | { readonly type: "NEXT" }
  | { readonly type: "BACK" }
  | { readonly type: "SUBMIT" }
  | { readonly type: "SUCCEED" }
  | { readonly type: "FAIL"; readonly message: string }
  | { readonly type: "RETRY" };

const setupFlow = setup({
  actions: {
    clearFailure: assign(({ context }) => ({ ...context, error: null })),
    prepareSubmission: assign(({ context }) => ({
      ...context,
      error: null,
      submissionAttempts: context.submissionAttempts + 1,
    })),
    recordFailure: assign(({ context, event }) => {
      if (event.type !== "FAIL") return context;
      return { ...context, error: event.message };
    }),
    setDetailsComplete: assign(({ context, event }) => {
      if (event.type !== "SET_DETAILS_COMPLETE") return context;
      return { ...context, detailsComplete: event.value };
    }),
    setPreferencesComplete: assign(({ context, event }) => {
      if (event.type !== "SET_PREFERENCES_COMPLETE") {
        return context;
      }
      return { ...context, preferencesComplete: event.value };
    }),
  },
  guards: {
    detailsAreComplete: ({ context }) => context.detailsComplete,
    preferencesAreComplete: ({ context }) => context.preferencesComplete,
  },
  types: {} as {
    context: SetupFlowContext;
    events: SetupFlowEvent;
  },
});

export const setupFlowMachine = setupFlow.createMachine({
  context: () => ({
    detailsComplete: false,
    error: null,
    preferencesComplete: false,
    submissionAttempts: 0,
  }),
  id: "darkfactory-setup-flow",
  initial: "details",
  states: {
    details: {
      on: {
        NEXT: {
          guard: "detailsAreComplete",
          target: "preferences",
        },
        SET_DETAILS_COMPLETE: { actions: "setDetailsComplete" },
      },
    },
    failure: {
      on: {
        BACK: {
          actions: "clearFailure",
          target: "review",
        },
        RETRY: {
          actions: "prepareSubmission",
          target: "submitting",
        },
      },
    },
    preferences: {
      on: {
        BACK: { target: "details" },
        NEXT: {
          guard: "preferencesAreComplete",
          target: "review",
        },
        SET_PREFERENCES_COMPLETE: { actions: "setPreferencesComplete" },
      },
    },
    review: {
      on: {
        BACK: { target: "preferences" },
        SUBMIT: {
          actions: "prepareSubmission",
          target: "submitting",
        },
      },
    },
    submitting: {
      on: {
        FAIL: {
          actions: "recordFailure",
          target: "failure",
        },
        SUCCEED: { target: "success" },
      },
    },
    success: { type: "final" },
  },
});

export const createSetupFlowActor = () => createActor(setupFlowMachine);
