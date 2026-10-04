import { Skeleton } from "@darkfactory/ui";

export default function PublicLoading() {
  return (
    <section
      aria-labelledby="public-loading-title"
      aria-live="polite"
      className="df-container py-8 md:py-10 lg:py-12"
      role="status"
    >
      <p className="font-semibold text-primary text-sm tracking-wide">
        DarkFactory
      </p>
      <h1
        className="mt-4 font-heading font-semibold text-4xl text-foreground tracking-tight"
        id="public-loading-title"
      >
        Loading this page
      </h1>
      <p className="mt-4 max-w-reading text-base text-muted-foreground leading-7">
        Preparing the requested public content.
      </p>
      <div
        aria-hidden="true"
        className="mt-6 grid gap-5 border-border border-y py-6 md:grid-cols-12"
      >
        <div className="space-y-4 md:col-span-4">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-4 md:col-span-6 md:col-start-7">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
        </div>
      </div>
    </section>
  );
}
