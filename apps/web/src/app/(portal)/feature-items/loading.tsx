import { Skeleton } from "@darkfactory/ui";

export default function FeatureItemsLoading() {
  return (
    <div aria-busy="true" className="space-y-4" role="status">
      <span className="sr-only">Loading feature items page</span>
      <Skeleton className="h-7 w-48" />
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}
