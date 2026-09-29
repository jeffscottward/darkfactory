import { createAuthClient as createBetterAuthClient } from "better-auth/client"
import { inferAdditionalFields } from "better-auth/client/plugins"

import type { DarkFactoryAuth } from "./server.ts"

export const createAuthClient = (baseURL?: string) => {
  return createBetterAuthClient({
    ...(baseURL === undefined ? {} : { baseURL }),
    plugins: [inferAdditionalFields<DarkFactoryAuth>()],
  })
}

export const authClient = createAuthClient()

export type {
  SafeAuthSession,
  SafeAuthUser,
  SafePrincipal,
  UserRole,
  UserStatus,
} from "./types.ts"
