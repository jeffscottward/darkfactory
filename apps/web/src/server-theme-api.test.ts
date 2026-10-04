import { afterEach, describe, expect, it, vi } from "vitest";
import {
  INDETERMINATE_THEME,
  resolveRequestTheme,
} from "./lib/server-theme.ts";
import {
  forwardThemeApiRequest,
  loadApiThemePreference,
  type ThemeApiRequestOptions,
} from "./lib/server-theme-api.ts";

const ACTIVE_SESSION_COOKIE = "better-auth.session_token=trusted";
const SECURE_SESSION_COOKIE = "__Secure-better-auth.session_token=trusted";

describe("server theme API forwarding", () => {
  afterEach(() => vi.useRealTimers());

  it("forwards only explicit request identity with no-store semantics", async () => {
    const requests: Request[] = [];
    const fetchRequest: typeof globalThis.fetch = async (input, init) => {
      requests.push(
        input instanceof Request ? input : new Request(input, init)
      );
      return new Response(null, { status: 204 });
    };
    const request = new Request("https://darkfactory.example/api/orpc", {
      body: "{}",
      headers: {
        authorization: "Bearer untrusted",
        "content-type": "application/json",
        cookie: "session=untrusted",
        "x-orpc-procedure": "preferences.theme.get",
      },
      method: "POST",
    });

    await forwardThemeApiRequest({
      cookieHeader: "session=trusted",
      fetchRequest,
      request,
      requestId: "request-123",
      trustedOrigin: "https://darkfactory.example",
    });

    const forwarded = requests[0]!;
    expect(forwarded).toBeInstanceOf(Request);
    expect(forwarded?.cache).toBe("no-store");
    expect(forwarded?.headers.get("cookie")).toBe("session=trusted");
    expect(forwarded?.headers.get("x-request-id")).toBe("request-123");
    expect(forwarded?.headers.get("content-type")).toBe("application/json");
    expect(forwarded?.headers.get("origin")).toBe(
      "https://darkfactory.example"
    );
    expect(forwarded?.headers.get("sec-fetch-site")).toBe("same-origin");
    expect(forwarded?.headers.get("authorization")).toBeNull();
    return expect(forwarded.redirect).toBe("manual");
  });

  it("rebuilds structurally compatible Worker requests from their URL", async () => {
    let forwarded: Request | undefined;
    const source = new Request("https://darkfactory.example/api/orpc", {
      body: '{"json":{"theme":"nord"}}',
      headers: {
        "content-type": "application/json",
        "x-orpc-procedure": "preferences.theme.set",
      },
      method: "POST",
    });
    const workerRequest = {
      body: source.body,
      headers: source.headers,
      method: source.method,
      url: source.url,
    } as Request;

    await forwardThemeApiRequest({
      cookieHeader: "session=trusted",
      fetchRequest: async (input) => {
        forwarded = input as Request;
        return new Response(null, { status: 204 });
      },
      request: workerRequest,
      requestId: null,
      trustedOrigin: "https://darkfactory.example",
    });

    expect(forwarded?.url).toBe(source.url);
    expect(forwarded?.method).toBe("POST");
    return expect(await forwarded?.text()).toBe('{"json":{"theme":"nord"}}');
  });

  it("aborts a stalled request and clears its timeout", async () => {
    vi.useFakeTimers();
    let aborted = false;
    const fetchRequest: typeof globalThis.fetch = async (input, init) => {
      const stalled =
        input instanceof Request ? input : new Request(input, init);
      return new Promise<Response>((_resolve, reject) => {
        return void stalled.signal.addEventListener(
          "abort",
          () => {
            aborted = true;
            return void reject(stalled.signal.reason);
          },
          { once: true }
        );
      });
    };
    const pending = forwardThemeApiRequest({
      cookieHeader: null,
      fetchRequest,
      request: new Request("https://darkfactory.example/api/orpc"),
      requestId: null,
      timeoutMs: 25,
      trustedOrigin: "https://darkfactory.example",
    });
    const rejection = expect(pending).rejects.toMatchObject({
      name: "TimeoutError",
    });
    await vi.advanceTimersByTimeAsync(25);
    await rejection;
    expect(aborted).toBe(true);
    return expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects cross-origin requests before forwarding credentials", async () => {
    const fetchRequest = vi.fn(async () => new Response("{}"));
    await expect(
      forwardThemeApiRequest({
        cookieHeader: "session=trusted",
        fetchRequest,
        request: new Request("https://attacker.invalid/api/orpc", {
          headers: {
            authorization: "Bearer untrusted",
            cookie: "session=untrusted",
          },
        }),
        requestId: null,
        trustedOrigin: "https://darkfactory.example",
      })
    ).rejects.toThrow("Theme request origin did not match");
    return expect(fetchRequest).not.toHaveBeenCalled();
  });

  it("cancels an oversized chunked theme response", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      cancel,
      start: (controller) => {
        controller.enqueue(new Uint8Array(10_000));
        return controller.enqueue(new Uint8Array(10_000));
      },
    });
    const fetchRequest = vi.fn(async () => new Response(body));
    await expect(
      forwardThemeApiRequest({
        cookieHeader: null,
        fetchRequest,
        request: new Request("https://darkfactory.example/api/orpc"),
        requestId: null,
        trustedOrigin: "https://darkfactory.example",
      })
    ).rejects.toThrow("Theme response exceeded the safe size limit");
    return expect(cancel).toHaveBeenCalledOnce();
  });

  it("skips trusted theme transport without a session cookie", async () => {
    const clientFactory = vi.fn(() => {
      throw new Error("anonymous requests must not create an API client");
    }) as unknown as NonNullable<ThemeApiRequestOptions["clientFactory"]>;

    for (const cookieHeader of [
      null,
      "",
      "better-auth.session_token=",
      "__Secure-better-auth.session_token=",
      "darkfactory-theme=dark%3Arose",
      "unrelated=value; darkfactory-theme=light%3Ablue",
    ]) {
      await expect(
        loadApiThemePreference({
          appUrl: "https://darkfactory.example",
          clientFactory,
          cookieHeader,
          requestId: "request-anonymous",
        })
      ).resolves.toBeUndefined();
    }
    return expect(clientFactory).not.toHaveBeenCalled();
  });

  it("maps unauthorized, trusted, and infrastructure outcomes to distinct authorities", async () => {
    const load = async (get: () => Promise<unknown>) =>
      loadApiThemePreference({
        appUrl: "https://darkfactory.example",
        clientFactory: (() => ({
          preferences: { theme: { get } },
        })) as unknown as NonNullable<ThemeApiRequestOptions["clientFactory"]>,
        cookieHeader: ACTIVE_SESSION_COOKIE,
        requestId: "request-123",
      });

    await expect(
      load(async () => {
        throw { code: "UNAUTHORIZED", status: 401 };
      })
    ).resolves.toBeUndefined();
    await expect(
      load(async () => ({
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "rose-pine",
      }))
    ).resolves.toEqual({
      density: "compact",
      fontSize: "large",
      radius: "none",
      theme: "rose-pine",
    });
    return await expect(
      load(async () => {
        throw new Error("upstream unavailable");
      })
    ).resolves.toBe(INDETERMINATE_THEME);
  });

  it("requires the forwarding origin to be one clean HTTPS origin", async () => {
    const fetchRequest = vi.fn(async () => new Response(null, { status: 204 }));
    for (const trustedOrigin of [
      "http://darkfactory.example",
      "https://darkfactory.example/path",
    ]) {
      await expect(
        forwardThemeApiRequest({
          cookieHeader: "session=trusted",
          fetchRequest,
          request: new Request("https://darkfactory.example/api/orpc"),
          requestId: null,
          trustedOrigin,
        })
      ).rejects.toThrow("Theme transport requires a clean HTTPS app origin");
    }
    return expect(fetchRequest).not.toHaveBeenCalled();
  });

  it("executes the client transport through bounded same-origin forwarding", async () => {
    const fetchRequest = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const request =
        input instanceof Request ? input : new Request(input, init);
      expect(request.headers.get("cookie")).toBe(SECURE_SESSION_COOKIE);
      expect(request.headers.get("x-request-id")).toBe("request-transport");
      return Response.json({
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "rose-pine",
        updatedAt: null,
      });
    });
    type ClientOptions = Parameters<
      NonNullable<ThemeApiRequestOptions["clientFactory"]>
    >[0];
    const clientFactory = ((options: ClientOptions) => ({
      preferences: {
        theme: {
          get: async () => {
            const response = await options.fetch!(
              new Request(new URL("/api/orpc", options.baseUrl), {
                headers: {
                  accept: "application/json",
                  "x-orpc-procedure": "preferences.theme.get",
                },
              })
            );
            return response.json();
          },
        },
      },
    })) as unknown as NonNullable<ThemeApiRequestOptions["clientFactory"]>;

    await expect(
      loadApiThemePreference({
        appUrl: "https://darkfactory.example",
        clientFactory,
        cookieHeader: SECURE_SESSION_COOKIE,
        fetch: fetchRequest,
        requestId: "request-transport",
      })
    ).resolves.toEqual({
      density: "compact",
      fontSize: "large",
      radius: "none",
      theme: "rose-pine",
      updatedAt: null,
    });
    return expect(fetchRequest).toHaveBeenCalledOnce();
  });

  return it("does not treat partial or primitive failures as unauthorized", async () => {
    const load = (failure: unknown) =>
      loadApiThemePreference({
        appUrl: "https://darkfactory.example",
        clientFactory: (() => ({
          preferences: {
            theme: {
              async get() {
                throw failure;
              },
            },
          },
        })) as unknown as NonNullable<ThemeApiRequestOptions["clientFactory"]>,
        cookieHeader: ACTIVE_SESSION_COOKIE,
        requestId: null,
      });

    for (const failure of [
      null,
      { code: "OTHER", status: 401 },
      { code: "UNAUTHORIZED", status: 403 },
    ]) {
      await expect(load(failure)).resolves.toBe(INDETERMINATE_THEME);
    }
  });
});

describe("trusted theme load under request-database capacity", () => {
  afterEach(() => vi.useRealTimers());

  const capacityResponse = (): Response =>
    Response.json(
      { code: "DATABASE_CAPACITY", error: "Service temporarily at capacity" },
      { headers: { "retry-after": "1" }, status: 503 }
    );
  const themeResponse = (): Response =>
    Response.json({
      json: {
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "rose-pine",
        updatedAt: null,
      },
    });
  const resolveTheme = (fetch: typeof globalThis.fetch) =>
    resolveRequestTheme({
      cookieHeader: ACTIVE_SESSION_COOKIE,
      loadTrustedPreference: () =>
        loadApiThemePreference({
          appUrl: "https://darkfactory.example",
          cookieHeader: ACTIVE_SESSION_COOKIE,
          fetch,
          requestId: "request-capacity",
        }),
    });

  it("stays trusted when the first attempt meets the capacity 503", async () => {
    vi.useFakeTimers();
    const fetchRequest = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(capacityResponse())
      .mockResolvedValueOnce(themeResponse());
    const theme = resolveTheme(fetchRequest);

    await vi.advanceTimersByTimeAsync(999);
    expect(fetchRequest).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    await expect(theme).resolves.toMatchObject({
      authority: "trusted",
      preference: {
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "rose-pine",
      },
    });
    expect(fetchRequest).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fails closed to indeterminate after three consecutive capacity responses", async () => {
    vi.useFakeTimers();
    const fetchRequest = vi.fn<typeof globalThis.fetch>(async () =>
      capacityResponse()
    );
    const theme = resolveTheme(fetchRequest);

    await vi.advanceTimersByTimeAsync(2000);
    await expect(theme).resolves.toMatchObject({ authority: "indeterminate" });
    expect(fetchRequest).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never retries a 503 that is not the exact capacity response", async () => {
    const fetchRequest = vi.fn<typeof globalThis.fetch>(
      async () => new Response(null, { status: 503 })
    );

    await expect(resolveTheme(fetchRequest)).resolves.toMatchObject({
      authority: "indeterminate",
    });
    expect(fetchRequest).toHaveBeenCalledOnce();
  });

  it("spends one theme deadline across attempts and capacity waits", async () => {
    vi.useFakeTimers();
    const fetchRequest = vi.fn<typeof globalThis.fetch>(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 7500));
      return capacityResponse();
    });
    const theme = resolveTheme(fetchRequest);

    await vi.advanceTimersByTimeAsync(8000);
    await expect(theme).resolves.toMatchObject({ authority: "indeterminate" });
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchRequest).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
