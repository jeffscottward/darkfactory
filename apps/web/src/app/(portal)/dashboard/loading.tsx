import { Skeleton } from "@darkfactory/ui";

export default function DashboardLoading() {
  return (
    <div aria-busy="true" className="space-y-4" role="status">
      <span className="sr-only">Loading dashboard</span>
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
