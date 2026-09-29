export type PasswordResetEmailInput = Readonly<{
  to: string
  resetUrl: string
  expiresInMinutes: number
  recipientName?: string
}>

export type EmailVerificationEmailInput = Readonly<{
  to: string
  verificationUrl: string
  expiresInMinutes: number
  recipientName?: string
}>

export type ContactEmailInput = Readonly<{
  name: string
  email: string
  subject: string
  message: string
}>

export type ContactEmailProvider = "preview" | "resend" | "disabled"
export type ContactEmailFailureCode =
  | "CONTACT_DELIVERY_DISABLED"
  | "CONTACT_PROVIDER_NOT_CONFIGURED"
  | "CONTACT_RECIPIENT_INVALID"
  | "CONTACT_INPUT_INVALID"
  | "CONTACT_RENDER_FAILED"
  | "CONTACT_PREVIEW_WRITE_FAILED"
  | "CONTACT_PROVIDER_REJECTED"
  | "CONTACT_PROVIDER_INVALID_RESPONSE"
  | "CONTACT_PROVIDER_UNAVAILABLE"

export type ContactEmailDeliveryResult =
  | Readonly<{ status: "sent"; provider: "resend"; messageId: string }>
  | Readonly<{ status: "previewed"; provider: "preview"; artifactPath: string }>
  | Readonly<{
      status: "not-delivered"
      provider: ContactEmailProvider
      code: ContactEmailFailureCode
      retryable: boolean
    }>

export interface ContactEmailPort {
  sendContact(input: ContactEmailInput): Promise<ContactEmailDeliveryResult>
}

export type EmailProvider = "preview" | "resend" | "disabled"

export type EmailDeliveryFailureCode =
  | "EMAIL_DELIVERY_DISABLED"
  | "EMAIL_PROVIDER_NOT_CONFIGURED"
  | "EMAIL_RECIPIENT_INVALID"
  | "EMAIL_RENDER_FAILED"
  | "EMAIL_PREVIEW_WRITE_FAILED"
  | "EMAIL_PROVIDER_REJECTED"
  | "EMAIL_PROVIDER_INVALID_RESPONSE"
  | "EMAIL_PROVIDER_UNAVAILABLE"

export type SentEmailDelivery = Readonly<{
  status: "sent"
  provider: "resend"
  messageId: string
}>

export type PreviewedEmailDelivery = Readonly<{
  status: "previewed"
  provider: "preview"
  artifactPath: string
}>

export type FailedEmailDelivery = Readonly<{
  status: "failed"
  provider: EmailProvider
  code: EmailDeliveryFailureCode
  retryable: boolean
}>

export type EmailDeliveryResult =
  | SentEmailDelivery
  | PreviewedEmailDelivery
  | FailedEmailDelivery

export interface EmailPort {
  sendPasswordReset(
    input: PasswordResetEmailInput,
  ): Promise<EmailDeliveryResult>
  sendEmailVerification(
    input: EmailVerificationEmailInput,
  ): Promise<EmailDeliveryResult>
}
