import type { UserRole, UserStatus } from "@darkfactory/db/schema"

export const AUTH_BASE_URL = "https://darkfactory.localhost" as const

export const AUTHORIZATION_ERROR_CODES = {
  AUTH_REQUIRED: "AUTH_REQUIRED",
  FORBIDDEN: "FORBIDDEN",
  ACCOUNT_SUSPENDED: "ACCOUNT_SUSPENDED",
  ACCOUNT_DEACTIVATED: "ACCOUNT_DEACTIVATED",
} as const

export type AuthAuthorizationErrorCode =
  (typeof AUTHORIZATION_ERROR_CODES)[keyof typeof AUTHORIZATION_ERROR_CODES]

export class AuthAuthorizationError extends Error {
  readonly code: AuthAuthorizationErrorCode
  readonly status: 401 | 403

  constructor(code: AuthAuthorizationErrorCode, status: 401 | 403) {
    super(code)
    this.name = "AuthAuthorizationError"
    this.code = code
    this.status = status
  }
}

export type SafeAuthUser = Readonly<{
  id: string
  name: string
  email: string
  emailVerified: boolean
  image: string | null
  createdAt: Date
  updatedAt: Date
  role: UserRole
  status: UserStatus
}>

export type SafeSessionRecord = Readonly<{
  id: string
  userId: string
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
  ipAddress: string | null
  userAgent: string | null
}>

export type SafePrincipal = Readonly<{
  userId: string
  role: UserRole
  status: UserStatus
}>

export type SafeAuthSession = Readonly<{
  user: SafeAuthUser
  session: SafeSessionRecord
  principal: SafePrincipal
}>

export type { UserRole, UserStatus } from "@darkfactory/db/schema"
