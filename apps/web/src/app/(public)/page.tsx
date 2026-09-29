import { PublicLink } from "./_components/public-content.tsx";

const requestPath = [
  {
    label: "Interface",
    detail:
      "A neutral Feature Item flow demonstrates useful states without prescribing a product domain.",
  },
  {
    label: "Contract",
    detail:
      "Typed oRPC procedures and schemas define the browser-to-server boundary once.",
  },
  {
    label: "Application",
    detail:
      "Services coordinate authorization, persistence, and provider ports without framework business logic.",
  },
  {
    label: "Evidence",
    detail:
      "PostgreSQL state, semantic events, traces, analytics, and tests leave an inspectable trail.",
  },
] as const;

const foundationLayers = [
  {
    title: "Stable core",
    body: "Contract-first core choices keep strict TypeScript, Vinext, PostgreSQL, Drizzle, Better Auth, oRPC, and the shared UI system aligned.",
    href: "/features",
    link: "Review the implemented layers",
  },
  {
    title: "Explicit capabilities",
    body: "Replaceable boundaries keep AI, email, storage, jobs, and other integrations declared, removable, and isolated behind ports.",
    href: "/resources",
    link: "Inspect the capability sources",
  },
  {
    title: "Safe adaptation",
    body: "Observable operations and a feature generator verify parse, validate, plan, apply, verify, and report—without overwriting existing work.",
    href: "/solutions",
    link: "See adaptation examples",
  },
] as const;

export const metadata = {
  title: "Application foundation",
  description:
    "A candid, domain-neutral foundation for production applications and inspectable AI workflows.",
};

export default function HomePage() {
  return (
    <>
      <section
        aria-labelledby="home-title"
        className="df-container grid gap-12 py-20 md:grid-cols-12 md:items-end md:py-24 lg:py-32"
      >
        <div className="space-y-8 md:col-span-7">
          <p className="font-semibold text-primary text-sm tracking-wide">
            Domain-neutral application foundation
          </p>
          <h1
            className="max-w-4xl font-heading font-semibold text-display text-foreground tracking-tight"
            id="home-title"
          >
            Build the product. Keep the foundation legible.
          </h1>
          <p className="max-w-reading text-lg text-muted-foreground leading-8">
            DarkFactory connects a refined public surface, an authenticated
            portal, typed contracts, PostgreSQL persistence, and observable
            operations. The seams stay explicit so a team can adapt the system
            without first removing someone else’s business model.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <PublicLink href="/features">Explore the foundation</PublicLink>
            <PublicLink href="#foundation-capabilities" variant="secondary">
              Read the foundation
            </PublicLink>
          </div>
        </div>
        <aside
          aria-label="Foundation posture"
          className="border-border border-y py-8 md:col-span-4 md:col-start-9"
        >
          <p className="font-heading font-semibold text-2xl text-foreground tracking-tight">
            Opinionated about structure. Quiet about your domain.
          </p>
          <p className="mt-4 text-base text-muted-foreground leading-7">
            Core choices are documented. Optional infrastructure is declared.
            Example product language is kept neutral and labeled for what it is.
          </p>
          <a
            className="mt-6 inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            href="/about"
          >
            Read the design posture
          </a>
        </aside>
      </section>

      <section
        aria-labelledby="foundation-layers-title"
        className="border-border border-y bg-surface"
        id="foundation-capabilities"
        tabIndex={-1}
      >
        <div className="df-container grid gap-12 py-20 md:grid-cols-12 md:py-24">
          <div className="md:col-span-4">
            <p className="font-semibold text-primary text-sm tracking-wide">
              The capability story
            </p>
            <h2
              className="mt-4 font-heading font-semibold text-3xl text-foreground tracking-tight"
              id="foundation-layers-title"
            >
              A small core with visible extension points.
            </h2>
            <p className="mt-5 text-base text-muted-foreground leading-7">
              The architecture distinguishes what every project needs from what
              a particular deployment may enable.
            </p>
            <PublicLink className="mt-4" href="#request-path" variant="link">
              Trace one request
            </PublicLink>
          </div>
          <dl className="divide-y divide-border border-border border-y md:col-span-7 md:col-start-6">
            {foundationLayers.map((layer, index) => (
              <div
                className="grid gap-4 py-8 sm:grid-cols-12"
                key={layer.title}
              >
                <dt className="sm:col-span-5">
                  <span
                    aria-hidden="true"
                    className="font-semibold text-muted-foreground text-sm"
                  >
                    0{index + 1}
                  </span>
                  <h3 className="mt-2 font-heading font-semibold text-2xl text-foreground tracking-tight">
                    {layer.title}
                  </h3>
                </dt>
                <dd className="sm:col-span-7">
                  <p className="max-w-reading text-base text-muted-foreground leading-7">
                    {layer.body}
                  </p>
                  <a
                    className="mt-4 inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    href={layer.href}
                  >
                    {layer.link}
                  </a>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section
        aria-labelledby="request-path-title"
        className="df-container py-20 md:py-24 lg:py-32"
        id="request-path"
        tabIndex={-1}
      >
        <div className="grid gap-12 md:grid-cols-12">
          <div className="md:col-span-5">
            <p className="font-semibold text-primary text-sm tracking-wide">
              One vertical, end to end
            </p>
            <h2
              className="mt-4 font-heading font-semibold text-3xl text-foreground tracking-tight"
              id="request-path-title"
            >
              Follow behavior instead of guessing at wiring.
            </h2>
            <p className="mt-5 max-w-reading text-base text-muted-foreground leading-7">
              The neutral slice is not a product recommendation. It is working
              evidence of the boundaries a real feature will cross.
            </p>
          </div>
          <ol className="grid gap-8 md:col-span-6 md:col-start-7">
            {requestPath.map((step, index) => (
              <li className="grid grid-cols-[auto_1fr] gap-4" key={step.label}>
                <span
                  aria-hidden="true"
                  className="flex size-11 items-center justify-center rounded-pill border border-border-strong font-semibold text-foreground"
                >
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-heading font-semibold text-foreground text-xl tracking-tight">
                    {step.label}
                  </h3>
                  <p className="mt-2 text-base text-muted-foreground leading-7">
                    {step.detail}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        aria-labelledby="home-next-title"
        className="border-border border-t bg-muted"
      >
        <div className="df-container grid gap-8 py-16 md:grid-cols-12 md:items-end md:py-20">
          <div className="md:col-span-7">
            <p className="font-semibold text-primary text-sm tracking-wide">
              Start with evidence
            </p>
            <h2
              className="mt-4 font-heading font-semibold text-3xl text-foreground tracking-tight"
              id="home-next-title"
            >
              Inspect the contracts, then enter the portal.
            </h2>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row md:col-span-4 md:col-start-9 md:justify-end">
            <PublicLink href="/resources" variant="secondary">
              Open the source index
            </PublicLink>
            <PublicLink href="/sign-in">Sign in to the portal</PublicLink>
          </div>
        </div>
      </section>
    </>
  );
}
