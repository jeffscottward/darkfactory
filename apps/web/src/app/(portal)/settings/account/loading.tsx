import { Skeleton } from "@darkfactory/ui";

export default function AccountSettingsLoading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="space-y-4"
      role="status"
    >
      <span className="sr-only">Loading account settings</span>
      <Skeleton className="h-7 w-40 max-w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
