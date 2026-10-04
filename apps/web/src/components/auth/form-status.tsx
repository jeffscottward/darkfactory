import { CheckCircle2, CircleAlert } from "lucide-react";
import Link from "next/link";

import type { AuthFlowResult } from "./auth-flow.ts";

export const FormStatus = ({
  result,
}: {
  readonly result: AuthFlowResult | null;
}) => (
  <div aria-atomic="true" aria-live="polite" className="min-h-6">
    {result && "message" in result ? (
      <div
        className={
          result.status === "error"
            ? "grid grid-cols-[auto_1fr] gap-2 text-destructive text-sm leading-6"
            : "grid grid-cols-[auto_1fr] gap-2 text-foreground text-sm leading-6"
        }
        role={result.status === "error" ? "alert" : "status"}
      >
        {result.status === "error" ? (
          <CircleAlert aria-hidden="true" className="mt-1" size={16} />
        ) : (
          <CheckCircle2
            aria-hidden="true"
            className="mt-1 text-primary"
            size={16}
          />
        )}
        <div>
          <p>{result.message}</p>
          {result.status === "error" &&
          result.actionHref &&
          result.actionLabel ? (
            <Link
              className="inline-flex min-h-11 min-w-11 items-center justify-center font-semibold text-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={result.actionHref}
            >
              {result.actionLabel}
            </Link>
          ) : null}
        </div>
      </div>
    ) : null}
  </div>
);
