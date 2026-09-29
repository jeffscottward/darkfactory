import { oc } from "@orpc/contract"
import { z } from "zod"

export const AdminUserSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  email: z.string().email(),
  emailVerified: z.boolean(),
  image: z.string().nullable(),
  role: z.enum(["member", "admin"]),
  status: z.enum(["active", "suspended", "deactivated"]),
  createdAt: z.date(),
  profile: z.object({
    displayName: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    businessName: z.string().nullable(),
    jobTitle: z.string().nullable(),
  }).strict().nullable(),
}).strict()

export const AdminUsersListInputSchema = z.object({
  query: z.string().trim().min(1).max(200).optional(),
  cursor: z.string().min(1).max(2_048).optional(),
  limit: z.number().int().min(1).max(100).default(20),
}).strict()

export const AdminUsersListOutputSchema = z.object({
  items: z.array(AdminUserSummarySchema),
  nextCursor: z.string().nullable(),
}).strict()

export const ADMIN_USERS_ERRORS = {
  BAD_REQUEST: { status: 400, message: "Invalid request" },
  UNAUTHORIZED: { status: 401, message: "Authentication required" },
  FORBIDDEN: { status: 403, message: "Forbidden" },
  NOT_FOUND: { status: 404, message: "User not found" },
  CONFLICT: { status: 409, message: "User directory conflict" },
  VALIDATION_ERROR: { status: 422, message: "User directory validation failed" },
  STORAGE_ERROR: { status: 503, message: "User directory unavailable" },
} as const

const adminUsers = oc.errors(ADMIN_USERS_ERRORS)

const list = adminUsers.route({
  method: "GET",
  path: "/admin/users",
  operationId: "admin.users.list",
  summary: "Search and paginate the user directory",
  tags: ["Admin"],
}).input(AdminUsersListInputSchema).output(AdminUsersListOutputSchema)

export const adminUsersContract = { list }

export type AdminUserSummaryOutput = z.infer<typeof AdminUserSummarySchema>
export type AdminUsersListInput = z.input<typeof AdminUsersListInputSchema>
export type AdminUsersListOutput = z.infer<typeof AdminUsersListOutputSchema>
