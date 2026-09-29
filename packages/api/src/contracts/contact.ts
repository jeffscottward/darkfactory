import { oc } from "@orpc/contract"
import { z } from "zod"

const MAILBOX_PATTERN =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/
const SINGLE_LINE_TEXT_PATTERN = /^[^\u0000-\u001f\u007f]*$/
const MESSAGE_TEXT_PATTERN = /^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/

export const ContactSubmitInputSchema = z.object({
  name: z.string().trim().min(1).max(100).regex(SINGLE_LINE_TEXT_PATTERN),
  email: z.string().trim().max(254).regex(MAILBOX_PATTERN),
  subject: z.string().trim().min(1).max(200).regex(SINGLE_LINE_TEXT_PATTERN),
  message: z.string().trim().min(1).max(5_000).regex(MESSAGE_TEXT_PATTERN),
  website: z.string().max(200).optional(),
}).strict()

export const ContactSubmitOutputSchema = z.object({
  status: z.enum(["sent", "previewed", "not-delivered"]),
}).strict()

export const CONTACT_ERRORS = {
  BAD_REQUEST: { status: 400, message: "Invalid contact request" },
  VALIDATION_ERROR: {
    status: 422,
    message: "Contact request validation failed",
  },
  PAYLOAD_TOO_LARGE: {
    status: 413,
    message: "Contact request payload too large",
  },
  TOO_MANY_REQUESTS: {
    status: 429,
    message: "Too many contact requests",
  },
  SERVICE_UNAVAILABLE: {
    status: 503,
    message: "Contact delivery unavailable",
  },
} as const

const contact = oc.errors(CONTACT_ERRORS)

const submit = contact
  .route({
    method: "POST",
    path: "/contact",
    operationId: "contact.submit",
    summary: "Submit a public contact request",
    tags: ["Contact"],
  })
  .input(ContactSubmitInputSchema)
  .output(ContactSubmitOutputSchema)

export const contactContract = { submit }

export type ContactSubmitInput = z.input<typeof ContactSubmitInputSchema>
export type ContactSubmitOutput = z.infer<typeof ContactSubmitOutputSchema>
