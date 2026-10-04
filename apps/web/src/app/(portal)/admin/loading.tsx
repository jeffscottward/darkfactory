import { Skeleton } from "@darkfactory/ui";

export default function AdminLoading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="mx-auto w-full max-w-portal space-y-4"
      role="status"
    >
      <span className="sr-only">Loading administration</span>
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-9 w-full max-w-xl" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
