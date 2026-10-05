"use client";

import { Button, EmptyState } from "@darkfactory/ui";
import { RotateCcw } from "lucide-react";

export default function AccountSettingsError({
  reset,
}: {
  readonly error: Error;
  readonly reset: () => void;
}) {
  return (
    <div>
      <EmptyState
        action={
          <Button onClick={reset} variant="secondary">
            <RotateCcw aria-hidden="true" className="size-4" />
            Try again
          </Button>
        }
        description="Account settings could not be displayed. No saved values were changed."
        icon={<RotateCcw />}
        title="Account settings unavailable"
      />
    </div>
  );
}
