import {
  AUTHORIZATION_ERROR_CODES,
  AuthAuthorizationError,
  type SafeAuthSession,
} from "@darkfactory/auth/server";
import {
  DatabaseConflictError,
  DatabasePersistenceError,
  type FeatureItemRepository,
  InvalidRepositoryInputError,
  type Repositories,
  type UserPreferencesRepository,
  type UserThemePreference,
} from "@darkfactory/db/server";
import type {
  SemanticEvent,
  SemanticEventPort,
} from "@darkfactory/observability/port";
import { ORPCError } from "@orpc/client";
import { describe, expect, it, vi } from "vitest";

import { createApiClient } from "./client.ts";
import { createApiContext } from "./server/context.ts";
import { handleApiRequest } from "./server/handler.ts";
import {
  createThemePreferenceService,
  ThemePreferenceServiceError,
} from "./server/service.ts";

const THEME_VERSION = new Date("2026-01-02T03:04:05.000Z");

const memberSession: SafeAuthSession = {
  user: {
    id: "member-1",
    name: "member",
    email: "member@domain.test",
    emailVerified: true,
    image: null,
    createdAt: new Date("2026-01-02T03:04:05.000Z"),
    updatedAt: new Date("2026-01-02T03:04:05.000Z"),
    role: "member",
    status: "active",
  },
  session: {
    id: "session-member",
    userId: "member-1",
    expiresAt: new Date("2026-01-03T03:04:05.000Z"),
    createdAt: new Date("2026-01-02T03:04:05.000Z"),
    updatedAt: new Date("2026-01-02T03:04:05.000Z"),
    ipAddress: null,
    userAgent: null,
  },
  principal: { userId: "member-1", role: "member", status: "active" },
};

const themeRepository = (
  overrides: Partial<UserPreferencesRepository> = {}
): UserPreferencesRepository => ({
  findByUserId: vi.fn(async () => null),
  findThemeByUserId: vi.fn(async () => null),
  upsert: vi.fn(async () => {
    throw new Error("Legacy full-preference upsert must not be called");
  }),
  updateOptimistic: vi.fn(async () => {
    throw new Error("Full preference update must not be called");
  }),
  upsertTheme: vi.fn(async (input) => ({
    theme: input.theme,
    fontSize: input.fontSize,
    density: input.density,
    radius: input.radius,
    updatedAt: THEME_VERSION,
  })),
  ...overrides,
});

const repositories = (
  userPreferences: UserPreferencesRepository
): Repositories => ({
  profiles: {} as Repositories["profiles"],
  addresses: {} as Repositories["addresses"],
  userPreferences,
  featureItems: {} as FeatureItemRepository,
  adminUsers: {} as Repositories["adminUsers"],
  dashboard: {} as Repositories["dashboard"],
});

const clientFor = (
  requestSession: SafeAuthSession | null,
  userPreferences: UserPreferencesRepository = themeRepository(),
  semanticEvents?: SemanticEventPort
) => {
  const fetch = async (request: Request): Promise<Response> => {
    const context = createApiContext(request, {
      repositories: repositories(userPreferences),
      requestId: "request-theme-1",
      capabilities: {
        ai: false,
        emailDelivery: false,
        analytics: false,
        telemetryExport: false,
      },
      requireSession: async () => {
        if (requestSession === null) {
          throw new AuthAuthorizationError(
            AUTHORIZATION_ERROR_CODES.AUTH_REQUIRED,
            401
          );
        }
        return requestSession;
      },
      requireRole: async () => {
        if (requestSession === null) {
          throw new AuthAuthorizationError(
            AUTHORIZATION_ERROR_CODES.AUTH_REQUIRED,
            401
          );
        }
        return requestSession;
      },
      ...(semanticEvents === undefined ? {} : { semanticEvents }),
    });
    return handleApiRequest(request, context);
  };

  return createApiClient({ baseUrl: "https://darkfactory.localhost", fetch });
};

const expectError = async (
  promise: Promise<unknown>,
  code: string,
  status: number
): Promise<void> => {
  try {
    await promise;
    throw new Error("Expected the oRPC call to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(ORPCError);
    expect(error).toMatchObject({ code, status, defined: true });
  }
};

const recordingPort = (): Readonly<{
  events: SemanticEvent[];
  port: SemanticEventPort;
}> => {
  const events: SemanticEvent[] = [];
  const port: SemanticEventPort = {
    emit: vi.fn(async (event) => {
      events.push(event);
      return {
        structuredEvent: "emitted" as const,
        span: "skipped" as const,
        analytics: "skipped" as const,
      };
    }),
  };
  return { events, port };
};

describe("DF-088 theme preference service", () => {
  it("maps missing storage to canonical database defaults", async () => {
    const findThemeByUserId = vi.fn(async () => null);
    const service = createThemePreferenceService(
      themeRepository({ findThemeByUserId })
    );

    await expect(service.get(memberSession.principal)).resolves.toEqual({
      theme: "system",
      fontSize: "default",
      density: "default",
      radius: "small",
      updatedAt: null,
    });
    return expect(findThemeByUserId).toHaveBeenCalledWith("member-1");
  });

  it("maps projected storage fields and always derives the owner from principal", async () => {
    const stored: UserThemePreference = {
      theme: "github-light",
      fontSize: "small",
      density: "default",
      radius: "medium",
      updatedAt: THEME_VERSION,
    };
    const findThemeByUserId = vi.fn(async () => stored);
    const upsertTheme = vi.fn(async (input) => ({
      theme: input.theme,
      fontSize: input.fontSize,
      density: input.density,
      radius: input.radius,
      updatedAt: THEME_VERSION,
    }));
    const service = createThemePreferenceService(
      themeRepository({ findThemeByUserId, upsertTheme })
    );

    await expect(service.get(memberSession.principal)).resolves.toEqual({
      theme: "github-light",
      fontSize: "small",
      density: "default",
      radius: "medium",
      updatedAt: THEME_VERSION,
    });
    await expect(
      service.update(memberSession.principal, {
        theme: "dracula",
        fontSize: "large",
        density: "compact",
        radius: "large",
        expectedUpdatedAt: THEME_VERSION,
      })
    ).resolves.toEqual({
      theme: "dracula",
      fontSize: "large",
      density: "compact",
      radius: "large",
      updatedAt: THEME_VERSION,
    });
    return expect(upsertTheme).toHaveBeenCalledWith({
      userId: "member-1",
      theme: "dracula",
      fontSize: "large",
      density: "compact",
      radius: "large",
      expectedUpdatedAt: THEME_VERSION,
    });
  });

  it("sanitizes expected storage failures", async () => {
    const service = createThemePreferenceService(
      themeRepository({
        findThemeByUserId: vi.fn(async () => {
          throw new DatabasePersistenceError("private preference query");
        }),
      })
    );

    await expect(service.get(memberSession.principal)).rejects.toMatchObject({
      name: "ThemePreferenceServiceError",
      code: "STORAGE_ERROR",
      message: "Theme preference storage is unavailable",
    });
    return expect(
      new ThemePreferenceServiceError("VALIDATION_ERROR", "Invalid theme")
    ).toMatchObject({ code: "VALIDATION_ERROR", message: "Invalid theme" });
  });

  it.each([
    {
      failure: new InvalidRepositoryInputError("private invalid theme"),
      code: "VALIDATION_ERROR",
      message: "Theme preference validation failed",
    },
    {
      failure: new DatabaseConflictError("theme preference"),
      code: "CONFLICT",
      message: "Theme preference conflict",
    },
  ] as const)(
    "maps repository failures to the stable $code contract",
    async ({ failure, code, message }) => {
      const service = createThemePreferenceService(
        themeRepository({
          upsertTheme: vi.fn(async () => {
            throw failure;
          }),
        })
      );

      return await expect(
        service.update(memberSession.principal, {
          theme: "night-owl",
          fontSize: "large",
          density: "comfortable",
          radius: "medium",
          expectedUpdatedAt: THEME_VERSION,
        })
      ).rejects.toMatchObject({
        name: "ThemePreferenceServiceError",
        code,
        message,
      });
    }
  );

  return it("preserves classified failures and does not disguise unexpected adapter errors", async () => {
    const classified = new ThemePreferenceServiceError(
      "CONFLICT",
      "Theme preference conflict"
    );
    const classifiedService = createThemePreferenceService(
      themeRepository({
        findThemeByUserId: vi.fn(async () => {
          throw classified;
        }),
      })
    );
    await expect(classifiedService.get(memberSession.principal)).rejects.toBe(
      classified
    );

    const unexpected = new Error("unexpected theme adapter contract violation");
    const unexpectedService = createThemePreferenceService(
      themeRepository({
        findThemeByUserId: vi.fn(async () => {
          throw unexpected;
        }),
      })
    );
    return await expect(
      unexpectedService.get(memberSession.principal)
    ).rejects.toBe(unexpected);
  });
});

describe("DF-088 authenticated theme preference router", () => {
  it("denies anonymous reads and updates", async () => {
    await expectError(
      clientFor(null).preferences.theme.get({}),
      "UNAUTHORIZED",
      401
    );
    return await expectError(
      clientFor(null).preferences.theme.update({
        theme: "night-owl",
        fontSize: "large",
        density: "comfortable",
        radius: "medium",
        expectedUpdatedAt: null,
      }),
      "UNAUTHORIZED",
      401
    );
  });

  it("reads defaults and persists exact canonical input for the principal", async () => {
    const upsertTheme = vi.fn(async (input) => ({
      theme: input.theme,
      fontSize: input.fontSize,
      density: input.density,
      radius: input.radius,
      updatedAt: THEME_VERSION,
    }));
    const client = clientFor(memberSession, themeRepository({ upsertTheme }));

    await expect(client.preferences.theme.get({})).resolves.toEqual({
      theme: "system",
      fontSize: "default",
      density: "default",
      radius: "small",
      updatedAt: null,
    });
    await expect(
      client.preferences.theme.update({
        theme: "night-owl",
        fontSize: "large",
        density: "comfortable",
        radius: "medium",
        expectedUpdatedAt: null,
      })
    ).resolves.toEqual({
      theme: "night-owl",
      fontSize: "large",
      density: "comfortable",
      radius: "medium",
      updatedAt: THEME_VERSION,
    });
    return expect(upsertTheme).toHaveBeenCalledWith({
      userId: "member-1",
      theme: "night-owl",
      fontSize: "large",
      density: "comfortable",
      radius: "medium",
      expectedUpdatedAt: null,
    });
  });

  it("rejects non-canonical and owner-bearing update payloads before persistence", async () => {
    const upsertTheme = vi.fn(async (input) => ({
      theme: input.theme,
      fontSize: input.fontSize,
      density: input.density,
      radius: input.radius,
      updatedAt: THEME_VERSION,
    }));
    const client = clientFor(memberSession, themeRepository({ upsertTheme }));

    await expectError(
      client.preferences.theme.update({
        theme: "sepia",
        fontSize: "large",
        density: "comfortable",
        radius: "medium",
        expectedUpdatedAt: null,
      } as never),
      "BAD_REQUEST",
      400
    );
    await expectError(
      client.preferences.theme.update({
        theme: "night-owl",
        fontSize: "large",
        density: "comfortable",
        radius: "medium",
        expectedUpdatedAt: null,
        ownerId: "victim-user",
      } as never),
      "BAD_REQUEST",
      400
    );
    return expect(upsertTheme).not.toHaveBeenCalled();
  });

  it("emits one safe correlated success event with an independent UUID", async () => {
    const recording = recordingPort();
    await expect(
      clientFor(
        memberSession,
        themeRepository(),
        recording.port
      ).preferences.theme.update({
        theme: "night-owl",
        fontSize: "large",
        density: "comfortable",
        radius: "medium",
        expectedUpdatedAt: null,
      })
    ).resolves.toEqual({
      theme: "night-owl",
      fontSize: "large",
      density: "comfortable",
      radius: "medium",
      updatedAt: THEME_VERSION,
    });

    expect(recording.events).toHaveLength(1);
    expect(recording.events[0]).toMatchObject({
      name: "user-preferences.theme-updated",
      correlation: {
        requestId: "request-theme-1",
        actorId: "member-1",
        procedure: "preferences.theme.update",
        route: "/api/orpc/preferences/theme/update",
      },
      action: "update",
      entityType: "user-preferences",
      outcome: "success",
      source: "api",
      attributes: { actorRole: "member" },
    });
    expect(recording.events[0]?.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(recording.events[0]?.eventId).not.toBe("request-theme-1");
    expect(JSON.stringify(recording.events[0])).not.toContain("night-owl");
    return expect(JSON.stringify(recording.events[0])).not.toContain(
      "comfortable"
    );
  });

  it("emits one sanitized failure event without replaying the update", async () => {
    const upsertTheme = vi.fn(async () => {
      throw new DatabasePersistenceError("private theme values");
    });
    const recording = recordingPort();

    await expectError(
      clientFor(
        memberSession,
        themeRepository({ upsertTheme }),
        recording.port
      ).preferences.theme.update({
        theme: "synthwave-84",
        fontSize: "default",
        density: "comfortable",
        radius: "none",
        expectedUpdatedAt: null,
      }),
      "STORAGE_ERROR",
      503
    );
    expect(upsertTheme).toHaveBeenCalledOnce();
    expect(recording.events).toHaveLength(1);
    expect(recording.events[0]).toMatchObject({
      name: "user-preferences.theme-updated",
      outcome: "failure",
      errorCategory: "storage_error",
    });
    expect(JSON.stringify(recording.events[0])).not.toContain(
      "private theme values"
    );
    return expect(JSON.stringify(recording.events[0])).not.toContain("amber");
  });

  return it("does not change a successful update when observability fails", async () => {
    const upsertTheme = vi.fn(async (input) => ({
      theme: input.theme,
      fontSize: input.fontSize,
      density: input.density,
      radius: input.radius,
      updatedAt: THEME_VERSION,
    }));
    const semanticEvents: SemanticEventPort = {
      emit: vi.fn(async () => {
        throw new Error("event provider unavailable");
      }),
    };

    await expect(
      clientFor(
        memberSession,
        themeRepository({ upsertTheme }),
        semanticEvents
      ).preferences.theme.update({
        theme: "system",
        fontSize: "small",
        density: "compact",
        radius: "small",
        expectedUpdatedAt: null,
      })
    ).resolves.toEqual({
      theme: "system",
      fontSize: "small",
      density: "compact",
      radius: "small",
      updatedAt: THEME_VERSION,
    });
    expect(upsertTheme).toHaveBeenCalledOnce();
    return expect(semanticEvents.emit).toHaveBeenCalledOnce();
  });
});
