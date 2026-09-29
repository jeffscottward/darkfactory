import { PublicLink, PublicPage } from "../_components/public-content.tsx";

const archetypes = [
  {
    number: "01",
    title: "Account-scoped workflow",
    label: "Example archetype — not included product functionality",
    body: "Adapt the neutral item lifecycle into a team-owned record with validation, status transitions, permissions, and an auditable history.",
    foundation:
      "Reuses authenticated ownership, typed mutations, PostgreSQL transactions, semantic events, and complete collection states.",
  },
  {
    number: "02",
    title: "AI-assisted review",
    label: "Example archetype — optional capability composition",
    body: "Place model inference behind an application port, preserve the human decision as durable state, and keep provider payloads out of the domain.",
    foundation:
      "Reuses provider-neutral inference, request context, bounded jobs when needed, and explicit disabled behavior without credentials.",
  },
  {
    number: "03",
    title: "Document-backed operation",
    label: "Example archetype — storage is not core",
    body: "Associate durable metadata with an optional object-storage capability while keeping access checks and lifecycle rules inside the application.",
    foundation:
      "Reuses PostgreSQL authority, an explicit storage port, owner scoping, and traceable create, access, and archive operations.",
  },
] as const;

export const metadata = {
  title: "Solutions",
  description:
    "Truthfully labeled example archetypes for adapting the domain-neutral DarkFactory foundation.",
};

export default function SolutionsPage() {
  return (
    <PublicPage
      actions={
        <PublicLink href="/features" variant="secondary">
          Review the foundation first
        </PublicLink>
      }
      description="These are architecture examples, not finished products, customer stories, or promised integrations. Each one shows how a real domain could reuse the stable core without pushing that domain back into the starter."
      eyebrow="Solutions"
      title="Example compositions, deliberately not a business model."
    >
      <section aria-labelledby="archetypes-title" className="py-16 md:py-20">
        <h2 className="sr-only" id="archetypes-title">
          Example solution archetypes
        </h2>
        <ol className="divide-y divide-border border-border border-y">
          {archetypes.map((archetype) => (
            <li
              className="grid gap-6 py-10 md:grid-cols-12 md:py-12"
              key={archetype.title}
            >
              <p
                aria-hidden="true"
                className="font-semibold text-muted-foreground text-sm md:col-span-1"
              >
                {archetype.number}
              </p>
              <div className="md:col-span-4">
                <p className="font-semibold text-primary text-xs uppercase tracking-wide">
                  {archetype.label}
                </p>
                <h3 className="mt-3 font-heading font-semibold text-3xl text-foreground tracking-tight">
                  {archetype.title}
                </h3>
              </div>
              <div className="space-y-5 md:col-span-6 md:col-start-7">
                <p className="text-foreground text-lg leading-8">
                  {archetype.body}
                </p>
                <p className="text-base text-muted-foreground leading-7">
                  <strong className="font-semibold text-foreground">
                    Foundation path:
                  </strong>{" "}
                  {archetype.foundation}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="adaptation-title"
        className="grid gap-12 border-border border-y bg-surface py-16 md:grid-cols-12 md:py-20"
      >
        <div className="md:col-span-5">
          <p className="font-semibold text-primary text-sm tracking-wide">
            A clean adaptation test
          </p>
          <h2
            className="mt-4 font-heading font-semibold text-3xl text-foreground tracking-tight"
            id="adaptation-title"
          >
            Your domain should replace the example, not fight it.
          </h2>
        </div>
        <div className="md:col-span-6 md:col-start-7">
          <ul className="divide-y divide-border border-border border-y text-base text-muted-foreground leading-7">
            <li className="py-5">
              Name the real entity and invariants before generating files.
            </li>
            <li className="py-5">
              Keep the contract, application service, repository, and provider
              boundaries visible.
            </li>
            <li className="py-5">
              Remove every neutral Feature Item reference from the generated
              vertical.
            </li>
            <li className="py-5">
              Verify permissions, persistence, events, errors, and user-visible
              states together.
            </li>
          </ul>
        </div>
      </section>

      <section
        aria-labelledby="solutions-next-title"
        className="grid gap-8 pt-16 md:grid-cols-12 md:items-end md:pt-20"
      >
        <div className="md:col-span-7">
          <h2
            className="font-heading font-semibold text-3xl text-foreground tracking-tight"
            id="solutions-next-title"
          >
            Ground the example in repository evidence.
          </h2>
          <p className="mt-4 max-w-reading text-base text-muted-foreground leading-7">
            The resource index points to the architecture, generated API
            description, capability manifest, and repository itself.
          </p>
        </div>
        <div className="md:col-span-4 md:col-start-9 md:text-right">
          <PublicLink href="/resources">Open the source index</PublicLink>
        </div>
      </section>
    </PublicPage>
  );
}
