import { PublicLink, PublicPage } from "./_components/public-content.tsx";

export default function PublicNotFound() {
  return (
    <PublicPage
      actions={<PublicLink href="/">Return home</PublicLink>}
      description="The requested public route is not part of this DarkFactory build. Use the current source index or return to the application overview."
      eyebrow="404"
      title="That page is not available."
    >
      <section
        aria-labelledby="not-found-next-title"
        className="grid gap-5 py-8 md:grid-cols-12 md:py-10"
      >
        <div className="md:col-span-7">
          <h2
            className="font-heading font-semibold text-3xl text-foreground tracking-tight"
            id="not-found-next-title"
          >
            Continue with a real destination
          </h2>
          <p className="mt-4 max-w-reading text-base text-muted-foreground leading-7">
            Resources links the architecture, generated OpenAPI document,
            capability manifest, and repository source.
          </p>
        </div>
        <div className="md:col-span-4 md:col-start-9 md:text-right">
          <PublicLink href="/resources" variant="secondary">
            Open resources
          </PublicLink>
        </div>
      </section>
    </PublicPage>
  );
}
