"use client";

import {
  type ApiClient,
  type ContactSubmitInput,
  type ContactSubmitOutput,
  createApiClient,
} from "@darkfactory/api";

export type ContactFieldName = "name" | "email" | "subject" | "message";

export type ContactFeedback = Readonly<{
  tone: "success" | "info" | "warning" | "error";
  message: string;
}>;

export interface ContactGateway {
  readonly submit: (input: ContactSubmitInput) => Promise<ContactSubmitOutput>;
}

const MAILBOX_PATTERN =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
const SINGLE_LINE_TEXT_PATTERN = /^[^\u0000-\u001f\u007f]*$/;
const MESSAGE_TEXT_PATTERN =
  /^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/;

export const validateContactField = (
  field: ContactFieldName,
  value: string
): string | undefined => {
  const trimmed = value.trim();
  switch (field) {
    case "name": {
      if (trimmed.length === 0) return "Enter your name.";
      if (trimmed.length > 100) return "Name must be 100 characters or fewer.";
      if (!SINGLE_LINE_TEXT_PATTERN.test(trimmed)) {
        return "Name contains unsupported control characters.";
      }
      break;
    }
    case "email": {
      if (trimmed.length > 254) return "Email must be 254 characters or fewer.";
      if (!MAILBOX_PATTERN.test(trimmed)) return "Enter a valid email address.";
      break;
    }
    case "subject": {
      if (trimmed.length === 0) return "Enter a subject.";
      if (trimmed.length > 200)
        return "Subject must be 200 characters or fewer.";
      if (!SINGLE_LINE_TEXT_PATTERN.test(trimmed)) {
        return "Subject contains unsupported control characters.";
      }
      break;
    }
    case "message": {
      if (trimmed.length === 0) return "Enter a message.";
      if (trimmed.length > 5000)
        return "Message must be 5,000 characters or fewer.";
      if (!MESSAGE_TEXT_PATTERN.test(trimmed)) {
        return "Message contains unsupported control characters.";
      }
      break;
    }
  }
  return undefined;
};

export const createContactGateway = (client: ApiClient): ContactGateway => ({
  submit: (input) => client.contact.submit(input),
});

export const createBrowserContactGateway = (): ContactGateway => {
  return createContactGateway(
    createApiClient({ baseUrl: window.location.origin })
  );
};

export const contactFeedbackForOutput = (
  output: ContactSubmitOutput
): ContactFeedback => {
  switch (output.status) {
    case "sent": {
      return { tone: "success", message: "Your message was sent." };
    }
    case "previewed": {
      return {
        tone: "info",
        message:
          "Your message was saved to the local email preview. It was not sent.",
      };
    }
    case "not-delivered": {
      return {
        tone: "warning",
        message:
          "Contact delivery is not configured. Your message was not sent.",
      };
    }
  }
  throw new TypeError("Unsupported contact delivery status");
};

const errorCode = (error: unknown): string | null => {
  if (typeof error !== "object" || error === null) return null;
  const code = Reflect.get(error, "code");
  if (typeof code === "string") return code;
  const data = Reflect.get(error, "data");
  if (typeof data !== "object" || data === null) return null;
  const nestedCode = Reflect.get(data, "code");
  return typeof nestedCode === "string" ? nestedCode : null;
};

export const safeContactFailure = (error: unknown): ContactFeedback => {
  switch (errorCode(error)) {
    case "TOO_MANY_REQUESTS": {
      return {
        tone: "error",
        message: "Too many messages were submitted. Try again in 15 minutes.",
      };
    }
    case "PAYLOAD_TOO_LARGE": {
      return {
        tone: "error",
        message:
          "Your message is too large to submit. Reduce it and try again.",
      };
    }
    case "SERVICE_UNAVAILABLE": {
      return {
        tone: "error",
        message:
          "Email delivery is temporarily unavailable. Your message was not sent. Try again later.",
      };
    }
    case "BAD_REQUEST":
    case "VALIDATION_ERROR": {
      return {
        tone: "error",
        message: "Check the highlighted fields and try again.",
      };
    }
    default: {
      return {
        tone: "error",
        message:
          "Your message could not be submitted. It was not sent. Try again.",
      };
    }
  }
};
