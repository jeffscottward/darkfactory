import type {
  ThemePreferenceOutput,
  UpdateThemePreferenceInput,
} from "@darkfactory/api";
import { createUiStore } from "@darkfactory/state/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchThemeApiRequest } from "./lib/theme-api-timeout.ts";
import { updateTrustedThemePreference } from "./lib/theme-update.ts";

const deferred = <Value>() => {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((settle) => {
    return void (resolve = settle);
  });
  return { promise, resolve };
};

describe("trusted theme updates", () => {
  afterEach(() => vi.useRealTimers());

  const versionA = new Date("2026-07-23T10:00:00.000Z");
  const versionB = new Date("2026-07-23T10:00:00.001Z");

  it("preflights the current version, patches with it, and projects only saved UI fields", async () => {
    const store = createUiStore();
    const calls: string[] = [];
    let updateInput: UpdateThemePreferenceInput | undefined;
    const result = await updateTrustedThemePreference({
      authority: () => "trusted",
      authorityEpoch: () => 0,
      get: async () => {
        calls.push("get");
        return {
          density: "default",
          fontSize: "default",
          radius: "small",
          theme: "system",
          updatedAt: versionA,
        };
      },
      preference: {
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "rose-pine",
      },
      sequence: { current: 0 },
      store,
      update: async (input) => {
        calls.push("update");
        updateInput = input;
        return {
          density: "comfortable",
          fontSize: "small",
          radius: "large",
          theme: "tokyo-night",
          updatedAt: versionB,
        };
      },
    });

    expect(calls).toEqual(["get", "update"]);
    expect(updateInput).toEqual({
      density: "compact",
      expectedUpdatedAt: versionA,
      fontSize: "large",
      radius: "none",
      theme: "rose-pine",
    });
    expect(result).toBe("applied");
    expect(store.getState()).toMatchObject({
      density: "comfortable",
      fontSize: "small",
      radius: "large",
      theme: "tokyo-night",
    });
    return expect(store.getState()).not.toHaveProperty("updatedAt");
  });

  it("propagates a primitive PATCH failure instead of treating it as a lost response", async () => {
    const store = createUiStore();
    const failure = "primitive theme update failure";
    const get = vi.fn(async () => ({
      density: "default" as const,
      fontSize: "default" as const,
      radius: "small" as const,
      theme: "system" as const,
      updatedAt: versionA,
    }));

    await expect(
      updateTrustedThemePreference({
        authority: () => "trusted",
        authorityEpoch: () => 0,
        get,
        preference: {
          density: "compact",
          fontSize: "large",
          radius: "none",
          theme: "rose-pine",
        },
        sequence: { current: 0 },
        store,
        async update() {
          throw failure;
        },
      })
    ).rejects.toBe(failure);
    expect(get).toHaveBeenCalledOnce();
    return expect(store.getState()).toMatchObject({
      density: "default",
      fontSize: "default",
      radius: "small",
      theme: "system",
    });
  });

  it("passes a null missing-row version as insert-only expectedUpdatedAt", async () => {
    const store = createUiStore();
    const update = vi.fn(async () => ({
      density: "compact" as const,
      fontSize: "large" as const,
      radius: "none" as const,
      theme: "rose-pine" as const,
      updatedAt: versionA,
    }));
    await updateTrustedThemePreference({
      authority: () => "trusted",
      authorityEpoch: () => 0,
      get: async () => ({
        density: "default",
        fontSize: "default",
        radius: "small",
        theme: "system",
        updatedAt: null,
      }),
      preference: {
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "rose-pine",
      },
      sequence: { current: 0 },
      store,
      update,
    });

    return expect(update).toHaveBeenCalledWith({
      density: "compact",
      expectedUpdatedAt: null,
      fontSize: "large",
      radius: "none",
      theme: "rose-pine",
    });
  });

  it("does not retry a conflict and leaves equal reconciled state untouched", async () => {
    const store = createUiStore();
    const before = store.getState();
    const get = vi.fn(async () => ({
      density: "default" as const,
      fontSize: "default" as const,
      radius: "small" as const,
      theme: "system" as const,
      updatedAt: versionA,
    }));
    const update = vi.fn(async () => {
      throw Object.assign(new Error("stale"), { code: "CONFLICT" });
    });
    const result = await updateTrustedThemePreference({
      authority: () => "trusted",
      authorityEpoch: () => 0,
      get,
      preference: {
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "rose-pine",
      },
      sequence: { current: 0 },
      store,
      update,
    });

    expect(result).toBe("reconciled");
    expect(get).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledTimes(1);
    return expect(store.getState()).toBe(before);
  });

  it("rejects trusted re-acquisition during a deferred GET before PATCH", async () => {
    const store = createUiStore();
    const current = deferred<ThemePreferenceOutput>();
    let authorityEpoch = 0;
    const update = vi.fn();
    const pending = updateTrustedThemePreference({
      authority: () => "trusted",
      authorityEpoch: () => authorityEpoch,
      get: async () => current.promise,
      preference: {
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "rose-pine",
      },
      sequence: { current: 0 },
      store,
      update,
    });

    authorityEpoch += 2;
    current.resolve({
      density: "default",
      fontSize: "default",
      radius: "small",
      theme: "system",
      updatedAt: versionA,
    });

    await expect(pending).resolves.toBe("superseded");
    expect(update).not.toHaveBeenCalled();
    return expect(store.getState()).toMatchObject({
      density: "default",
      fontSize: "default",
      radius: "small",
      theme: "system",
    });
  });

  it("rejects trusted re-acquisition during a deferred PATCH before store mutation", async () => {
    const store = createUiStore();
    const saved = deferred<ThemePreferenceOutput>();
    let authorityEpoch = 0;
    const update = vi.fn(async () => saved.promise);
    const pending = updateTrustedThemePreference({
      authority: () => "trusted",
      authorityEpoch: () => authorityEpoch,
      get: async () => ({
        density: "default",
        fontSize: "default",
        radius: "small",
        theme: "system",
        updatedAt: versionA,
      }),
      preference: {
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "rose-pine",
      },
      sequence: { current: 0 },
      store,
      update,
    });

    await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());
    authorityEpoch += 2;
    saved.resolve({
      density: "compact",
      fontSize: "large",
      radius: "none",
      theme: "rose-pine",
      updatedAt: versionB,
    });

    await expect(pending).resolves.toBe("superseded");
    return expect(store.getState()).toMatchObject({
      density: "default",
      fontSize: "default",
      radius: "small",
      theme: "system",
    });
  });

  it("rejects malformed preflight and saved outputs at the runtime boundary", async () => {
    const store = createUiStore();
    const invalidGetUpdate = vi.fn();
    const invalidGet = await updateTrustedThemePreference({
      authority: () => "trusted",
      authorityEpoch: () => 0,
      get: async () =>
        ({
          density: "default",
          fontSize: "default",
          radius: "small",
          theme: "night",
          updatedAt: versionA,
        }) as never,
      preference: {
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "rose-pine",
      },
      sequence: { current: 0 },
      store,
      update: invalidGetUpdate,
    });
    const invalidSaveGet = vi
      .fn()
      .mockResolvedValueOnce({
        density: "default",
        fontSize: "default",
        radius: "small",
        theme: "system",
        updatedAt: versionA,
      })
      .mockRejectedValueOnce(new Error("reconciliation unavailable"));
    const invalidSave = await updateTrustedThemePreference({
      authority: () => "trusted",
      authorityEpoch: () => 0,
      get: invalidSaveGet,
      preference: {
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "rose-pine",
      },
      sequence: { current: 0 },
      store,
      update: async () => ({
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "rose-pine",
        updatedAt: new Date(Number.NaN),
      }),
    });

    expect(invalidGet).toBe("failed");
    expect(invalidGetUpdate).not.toHaveBeenCalled();
    expect(invalidSave).toBe("unconfirmed");
    expect(invalidSaveGet).toHaveBeenCalledTimes(2);
    return expect(store.getState()).toMatchObject({
      density: "default",
      fontSize: "default",
      radius: "small",
      theme: "system",
    });
  });

  it("reconciles a PATCH that commits before its response is lost", async () => {
    const store = createUiStore();
    let remote: ThemePreferenceOutput = {
      density: "default",
      fontSize: "default",
      radius: "small",
      theme: "system",
      updatedAt: versionA,
    };
    const result = await updateTrustedThemePreference({
      authority: () => "trusted",
      authorityEpoch: () => 0,
      get: async () => remote,
      preference: {
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "rose-pine",
      },
      sequence: { current: 0 },
      store,
      update: async () => {
        remote = {
          density: "compact",
          fontSize: "large",
          radius: "none",
          theme: "rose-pine",
          updatedAt: versionB,
        };
        throw new Error("response lost");
      },
    });

    expect(result).toBe("reconciled");
    return expect(store.getState()).toMatchObject({
      density: "compact",
      fontSize: "large",
      radius: "none",
      theme: "rose-pine",
    });
  });

  it("does not apply a deferred reconciliation after authority is superseded", async () => {
    const store = createUiStore();
    const reconciliation = deferred<ThemePreferenceOutput>();
    let getCount = 0;
    let authorityEpoch = 0;
    const pending = updateTrustedThemePreference({
      authority: () => "trusted",
      authorityEpoch: () => authorityEpoch,
      get: async () => {
        getCount += 1;
        return getCount === 1
          ? {
              density: "default",
              fontSize: "default",
              radius: "small",
              theme: "system",
              updatedAt: versionA,
            }
          : reconciliation.promise;
      },
      preference: {
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "rose-pine",
      },
      sequence: { current: 0 },
      store,
      async update() {
        throw new Error("response lost");
      },
    });

    await vi.waitFor(() => expect(getCount).toBe(2));
    authorityEpoch += 2;
    reconciliation.resolve({
      density: "compact",
      fontSize: "large",
      radius: "none",
      theme: "rose-pine",
      updatedAt: versionB,
    });

    await expect(pending).resolves.toBe("superseded");
    return expect(store.getState()).toMatchObject({
      density: "default",
      fontSize: "default",
      radius: "small",
      theme: "system",
    });
  });

  it("does not PATCH or mutate state when authority is lost during the preflight", async () => {
    const store = createUiStore();
    const current = deferred<ThemePreferenceOutput>();
    let authority: "trusted" | "anonymous" = "trusted";
    const update = vi.fn(async () => ({
      density: "compact" as const,
      fontSize: "large" as const,
      radius: "none" as const,
      theme: "rose-pine" as const,
      updatedAt: versionB,
    }));
    const pending = updateTrustedThemePreference({
      authority: () => authority,
      authorityEpoch: () => 0,
      get: async () => current.promise,
      preference: {
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "rose-pine",
      },
      sequence: { current: 0 },
      store,
      update,
    });

    authority = "anonymous";
    current.resolve({
      density: "default",
      fontSize: "default",
      radius: "small",
      theme: "system",
      updatedAt: versionA,
    });

    await expect(pending).resolves.toBe("superseded");
    expect(update).not.toHaveBeenCalled();
    return expect(store.getState()).toMatchObject({
      density: "default",
      fontSize: "default",
      radius: "small",
      theme: "system",
    });
  });

  it("allows only the latest selection to advance from GET to PATCH", async () => {
    const store = createUiStore();
    const sequence = { current: 0 };
    const firstGet = deferred<ThemePreferenceOutput>();
    const secondGet = deferred<ThemePreferenceOutput>();
    const firstUpdate = vi.fn();
    const secondUpdate = vi.fn(async () => ({
      density: "comfortable" as const,
      fontSize: "large" as const,
      radius: "medium" as const,
      theme: "catppuccin-latte" as const,
      updatedAt: versionB,
    }));
    const first = updateTrustedThemePreference({
      authority: () => "trusted",
      authorityEpoch: () => 0,
      get: async () => firstGet.promise,
      preference: {
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "rose-pine",
      },
      sequence,
      store,
      update: firstUpdate,
    });
    const second = updateTrustedThemePreference({
      authority: () => "trusted",
      authorityEpoch: () => 0,
      get: async () => secondGet.promise,
      preference: {
        density: "comfortable",
        fontSize: "large",
        radius: "medium",
        theme: "catppuccin-latte",
      },
      sequence,
      store,
      update: secondUpdate,
    });

    firstGet.resolve({
      density: "default",
      fontSize: "default",
      radius: "small",
      theme: "system",
      updatedAt: versionA,
    });
    await expect(first).resolves.toBe("superseded");
    expect(firstUpdate).not.toHaveBeenCalled();

    secondGet.resolve({
      density: "default",
      fontSize: "default",
      radius: "small",
      theme: "system",
      updatedAt: versionA,
    });
    await expect(second).resolves.toBe("applied");
    expect(secondUpdate).toHaveBeenCalledWith({
      density: "comfortable",
      expectedUpdatedAt: versionA,
      fontSize: "large",
      radius: "medium",
      theme: "catppuccin-latte",
    });
    return expect(store.getState()).toMatchObject({
      density: "comfortable",
      fontSize: "large",
      radius: "medium",
      theme: "catppuccin-latte",
    });
  });

  it("applies only the latest completed trusted PATCH", async () => {
    const store = createUiStore();
    const sequence = { current: 0 };
    const first = deferred<ThemePreferenceOutput>();
    const second = deferred<ThemePreferenceOutput>();
    const firstUpdate = updateTrustedThemePreference({
      authority: () => "trusted",
      authorityEpoch: () => 0,
      get: async () => ({
        density: "default",
        fontSize: "default",
        radius: "small",
        theme: "system",
        updatedAt: versionA,
      }),
      preference: {
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "rose-pine",
      },
      sequence,
      store,
      update: async () => first.promise,
    });
    const secondUpdate = updateTrustedThemePreference({
      authority: () => "trusted",
      authorityEpoch: () => 0,
      get: async () => ({
        density: "default",
        fontSize: "default",
        radius: "small",
        theme: "system",
        updatedAt: versionA,
      }),
      preference: {
        density: "comfortable",
        fontSize: "large",
        radius: "medium",
        theme: "catppuccin-latte",
      },
      sequence,
      store,
      update: async () => second.promise,
    });

    first.resolve({
      density: "compact",
      fontSize: "large",
      radius: "none",
      theme: "rose-pine",
      updatedAt: versionB,
    });
    await expect(firstUpdate).resolves.toBe("superseded");
    expect(store.getState()).toMatchObject({
      density: "default",
      fontSize: "default",
      radius: "small",
      theme: "system",
    });

    second.resolve({
      density: "comfortable",
      fontSize: "large",
      radius: "medium",
      theme: "catppuccin-latte",
      updatedAt: versionB,
    });
    await expect(secondUpdate).resolves.toBe("applied");
    return expect(store.getState()).toMatchObject({
      density: "comfortable",
      fontSize: "large",
      radius: "medium",
      theme: "catppuccin-latte",
    });
  });

  return it("fails safely when either trusted request exceeds its bound", async () => {
    vi.useFakeTimers();
    const store = createUiStore();
    const stalledRequest = async (request: Request): Promise<Response> => {
      return new Promise<Response>((_resolve, reject) => {
        return void request.signal.addEventListener(
          "abort",
          () => reject(request.signal.reason),
          { once: true }
        );
      });
    };
    const boundedRequest = (httpMethod: "GET" | "PATCH") =>
      fetchThemeApiRequest({
        fetchRequest: async (request) => stalledRequest(request),
        request: new Request("https://darkfactory.example/api/orpc", {
          method: httpMethod,
        }),
        timeoutMs: 25,
      });
    const getPending = updateTrustedThemePreference({
      authority: () => "trusted",
      authorityEpoch: () => 0,
      get: async () => {
        await boundedRequest("GET");
        return {
          density: "default",
          fontSize: "default",
          radius: "small",
          theme: "system",
          updatedAt: versionA,
        };
      },
      preference: {
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "rose-pine",
      },
      sequence: { current: 0 },
      store,
      update: vi.fn(),
    });

    await vi.advanceTimersByTimeAsync(25);
    await expect(getPending).resolves.toBe("failed");

    let patchGetCount = 0;
    const patchPending = updateTrustedThemePreference({
      authority: () => "trusted",
      authorityEpoch: () => 0,
      get: async () => {
        patchGetCount += 1;
        if (patchGetCount === 1) {
          return {
            density: "default",
            fontSize: "default",
            radius: "small",
            theme: "system",
            updatedAt: versionA,
          };
        }
        await boundedRequest("GET");
        return {
          density: "default",
          fontSize: "default",
          radius: "small",
          theme: "system",
          updatedAt: versionA,
        };
      },
      preference: {
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "rose-pine",
      },
      sequence: { current: 0 },
      store,
      update: async () => {
        await boundedRequest("PATCH");
        return {
          density: "compact",
          fontSize: "large",
          radius: "none",
          theme: "rose-pine",
          updatedAt: versionB,
        };
      },
    });

    await vi.advanceTimersByTimeAsync(25);
    await vi.advanceTimersByTimeAsync(25);
    await expect(patchPending).resolves.toBe("unconfirmed");
    expect(patchGetCount).toBe(2);
    expect(store.getState()).toMatchObject({
      density: "default",
      fontSize: "default",
      radius: "small",
      theme: "system",
    });
    return expect(vi.getTimerCount()).toBe(0);
  });
});

describe("bounded theme API transport", () => {
  afterEach(() => vi.useRealTimers());

  it("reconstructs a bounded streaming response with its response metadata", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"theme":'));
        controller.enqueue(encoder.encode('"nord"}'));
        return void controller.close();
      },
    });

    const response = await fetchThemeApiRequest({
      fetchRequest: async () =>
        new Response(body, {
          headers: {
            "content-type": "application/json",
            "x-result": "bounded",
          },
          status: 206,
          statusText: "Partial Content",
        }),
      request: new Request("https://darkfactory.example/api/orpc"),
    });

    expect(response.status).toBe(206);
    expect(response.statusText).toBe("Partial Content");
    expect(response.headers.get("x-result")).toBe("bounded");
    return expect(await response.text()).toBe('{"theme":"nord"}');
  });

  it("returns a bodyless response without replacing it", async () => {
    const source = new Response(null, { status: 204 });

    return await expect(
      fetchThemeApiRequest({
        fetchRequest: async () => source,
        request: new Request("https://darkfactory.example/api/orpc"),
      })
    ).resolves.toBe(source);
  });

  it("fails closed when cancellation of declared or streamed excess rejects", async () => {
    const declaredCancel = vi.fn(async () => {
      throw new Error("declared cancellation unavailable");
    });
    const declaredBody = new ReadableStream<Uint8Array>({
      cancel: declaredCancel,
    });
    await expect(
      fetchThemeApiRequest({
        fetchRequest: async () =>
          new Response(declaredBody, {
            headers: { "content-length": "16385" },
          }),
        request: new Request("https://darkfactory.example/api/orpc"),
      })
    ).rejects.toThrow("Theme response exceeded the safe size limit");
    expect(declaredCancel).toHaveBeenCalledOnce();

    const streamedCancel = vi.fn(async () => {
      throw new Error("stream cancellation unavailable");
    });
    const streamedBody = new ReadableStream<Uint8Array>({
      cancel: streamedCancel,
      start(controller) {
        return void controller.enqueue(new Uint8Array(16_385));
      },
    });
    await expect(
      fetchThemeApiRequest({
        fetchRequest: async () => new Response(streamedBody),
        request: new Request("https://darkfactory.example/api/orpc"),
      })
    ).rejects.toThrow("Theme response exceeded the safe size limit");
    return expect(streamedCancel).toHaveBeenCalledOnce();
  });

  it("propagates primitive cancellation failures for declared and streamed excess", async () => {
    const declaredFailure = "primitive declared cancellation failure";
    const declaredCancel = vi.fn(async () => {
      throw declaredFailure;
    });
    await expect(
      fetchThemeApiRequest({
        fetchRequest: async () =>
          new Response(
            new ReadableStream<Uint8Array>({ cancel: declaredCancel }),
            { headers: { "content-length": "16385" } }
          ),
        request: new Request("https://darkfactory.example/api/orpc"),
      })
    ).rejects.toBe(declaredFailure);
    expect(declaredCancel).toHaveBeenCalledOnce();

    const streamedFailure = "primitive streamed cancellation failure";
    const streamedCancel = vi.fn(async () => {
      throw streamedFailure;
    });
    await expect(
      fetchThemeApiRequest({
        fetchRequest: async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              cancel: streamedCancel,
              start(controller) {
                return void controller.enqueue(new Uint8Array(16_385));
              },
            })
          ),
        request: new Request("https://darkfactory.example/api/orpc"),
      })
    ).rejects.toBe(streamedFailure);
    return expect(streamedCancel).toHaveBeenCalledOnce();
  });

  it("propagates an already-aborted caller signal through the forwarded request", async () => {
    const controller = new AbortController();
    const reason = new DOMException("caller cancelled", "AbortError");
    controller.abort(reason);
    let forwardedSignal: AbortSignal | undefined;

    await expect(
      fetchThemeApiRequest({
        fetchRequest: async (forwarded) => {
          forwardedSignal = forwarded.signal;
          return new Response(new ReadableStream<Uint8Array>());
        },
        request: new Request("https://darkfactory.example/api/orpc", {
          signal: controller.signal,
        }),
      })
    ).rejects.toBe(reason);
    return expect(forwardedSignal?.aborted).toBe(true);
  });

  return it("absorbs body-cancellation failure while preserving the timeout reason", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(async () => {
      throw new Error("deadline cancellation unavailable");
    });
    const pending = fetchThemeApiRequest({
      fetchRequest: async () =>
        new Response(new ReadableStream<Uint8Array>({ cancel })),
      request: new Request("https://darkfactory.example/api/orpc"),
      timeoutMs: 5,
    });
    const rejection = expect(pending).rejects.toMatchObject({
      message: "Theme preference request timed out",
      name: "TimeoutError",
    });

    await vi.advanceTimersByTimeAsync(5);
    await rejection;
    expect(cancel).toHaveBeenCalledOnce();
    return expect(vi.getTimerCount()).toBe(0);
  });
});

describe("trusted theme fail-closed branches", () => {
  const currentVersion = new Date("2026-07-25T10:00:00.000Z");

  it("supersedes before preflight when trusted authority is already absent", async () => {
    const get = vi.fn();
    const update = vi.fn();
    const result = await updateTrustedThemePreference({
      authority: () => "anonymous",
      authorityEpoch: () => 0,
      get,
      preference: {
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "rose-pine",
      },
      sequence: { current: 0 },
      store: createUiStore(),
      update,
    });

    expect(result).toBe("superseded");
    expect(get).not.toHaveBeenCalled();
    return expect(update).not.toHaveBeenCalled();
  });

  it("preserves supersession when a failed preflight also loses authority", async () => {
    let authority: "trusted" | "anonymous" = "trusted";
    const result = await updateTrustedThemePreference({
      authority: () => authority,
      authorityEpoch: () => 0,
      get: async () => {
        authority = "anonymous";
        throw new Error("preflight unavailable");
      },
      preference: {
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "rose-pine",
      },
      sequence: { current: 0 },
      store: createUiStore(),
      update: vi.fn(),
    });

    return expect(result).toBe("superseded");
  });

  it("preserves supersession when failed reconciliation loses authority", async () => {
    let authority: "trusted" | "anonymous" = "trusted";
    let getCount = 0;
    const result = await updateTrustedThemePreference({
      authority: () => authority,
      authorityEpoch: () => 0,
      get: async () => {
        getCount += 1;
        if (getCount === 1) {
          return {
            density: "default" as const,
            fontSize: "default" as const,
            radius: "small" as const,
            theme: "system" as const,
            updatedAt: currentVersion,
          };
        }
        authority = "anonymous";
        throw new Error("reconciliation unavailable");
      },
      preference: {
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "rose-pine",
      },
      sequence: { current: 0 },
      store: createUiStore(),
      async update() {
        throw new Error("save response unavailable");
      },
    });

    expect(result).toBe("superseded");
    return expect(getCount).toBe(2);
  });

  return it("reports an unconfirmed update when saved and reconciled values are malformed", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        density: "default",
        fontSize: "default",
        radius: "small",
        theme: "system",
        updatedAt: currentVersion,
      })
      .mockResolvedValueOnce(null);
    const result = await updateTrustedThemePreference({
      authority: () => "trusted",
      authorityEpoch: () => 0,
      get,
      preference: {
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "rose-pine",
      },
      sequence: { current: 0 },
      store: createUiStore(),
      update: async () => null as never,
    });

    expect(result).toBe("unconfirmed");
    return expect(get).toHaveBeenCalledTimes(2);
  });
});

describe("bodyless declared theme responses", () =>
  it("rejects declared excess without requiring a response body", async () =>
    await expect(
      fetchThemeApiRequest({
        fetchRequest: async () =>
          new Response(null, {
            headers: { "content-length": "16385" },
          }),
        request: new Request("https://darkfactory.example/api/orpc"),
      })
    ).rejects.toThrow("Theme response exceeded the safe size limit")));
