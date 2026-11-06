import { cn } from "@darkfactory/ui";
import { useState } from "react";

export type AccountFeedback = Readonly<{
  tone: "error" | "success" | "info";
  message: string;
}>;

export const AccountFeedbackMessage = ({
  feedback,
}: {
  readonly feedback?: AccountFeedback | null | undefined;
}) => {
  // Each submit sets a new feedback object. A new key remounts the message,
  // so the one-time success pulse plays again on a repeated success.
  const [shown, setShown] = useState({ feedback, key: 0 });
  let key = shown.key;
  if (shown.feedback !== feedback) {
    key += 1;
    setShown({ feedback, key });
  }
  if (feedback === undefined || feedback === null) return null;
  return (
    <p
      aria-live="polite"
      className={cn(
        "border-l-2 py-1 pl-3 text-sm",
        feedback.tone === "error" && "border-destructive text-destructive",
        feedback.tone === "success" &&
          "animate-success-pulse border-primary text-foreground",
        feedback.tone === "info" && "border-border-strong text-muted-foreground"
      )}
      key={key}
      role={feedback.tone === "error" ? "alert" : "status"}
    >
      {feedback.message}
    </p>
  );
};
