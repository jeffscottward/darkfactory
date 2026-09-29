import { PublicLink, PublicPage } from "../_components/public-content.tsx";

const repositoryBase = "https://github.com/jeffscottward/darkfactory";

const resources = [
  {
    title: "Architecture",
    type: "Authored source",
    href: `${repositoryBase}/blob/main/ARCHITECTURE.md`,
    body: "The boundary map, request flow, PostgreSQL-first decision order, state ownership, provider ports, and deployment posture.",
  },
  {
    title: "Generated OpenAPI",
    type: "Generated contract artifact",
    href: `${repositoryBase}/blob/main/packages/api/openapi.json`,
    body: "The HTTP-facing description generated from the same oRPC contracts used by application clients and handlers.",
  },
  {
    title: "Capability manifest",
    type: "Machine-readable declaration",
    href: `${repositoryBase}/blob/main/capabilities.yaml`,
    body: "The enabled and available capability inventory, including ownership and readiness information for optional infrastructure.",
  },
  {
    title: "Repository",
    type: "Implementation source",
    href: repositoryBase,
    body: "The complete workspace, tests, generated artifacts, infrastructure definitions, and history behind the public description.",
  },
] as const;

export const metadata = {
  title: "Resources",
  description:
    "Stable links to the DarkFactory architecture, generated OpenAPI, capability manifest, and repository.",
};

export default function ResourcesPage() {
  return (
    <PublicPage
      actions={
        <PublicLink href={repositoryBase}>Open the repository</PublicLink>
      }
      description="This index links to files that exist in the repository. Authored guidance, generated contracts, machine-readable declarations, and examples are labeled separately so their authority is clear."
      eyebrow="Resources"
      title="Start from source, not a marketing claim."
    >
      <section aria-labelledby="source-index-title" className="py-16 md:py-20">
        <h2
          className="font-heading font-semibold text-3xl text-foreground tracking-tight"
          id="source-index-title"
        >
          Stable source index
        </h2>
        <ul className="mt-8 divide-y divide-border border-border border-y">
          {resources.map((resource) => (
            <li
              className="grid gap-5 py-8 md:grid-cols-12"
              key={resource.title}
            >
              <div className="md:col-span-4">
                <p className="font-semibold text-primary text-xs uppercase tracking-wide">
                  {resource.type}
                </p>
                <h3 className="mt-3 font-heading font-semibold text-2xl text-foreground tracking-tight">
                  {resource.title}
                </h3>
              </div>
              <div className="md:col-span-6 md:col-start-6">
                <p className="text-base text-muted-foreground leading-7">
                  {resource.body}
                </p>
                <a
                  className="mt-4 inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  href={resource.href}
                  rel="noreferrer"
                  target="_blank"
                >
                  View {resource.title.toLowerCase()} on GitHub
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="example-labels-title"
        className="grid gap-12 border-border border-y bg-surface py-16 md:grid-cols-12 md:py-20"
      >
        <div className="md:col-span-5">
          <p className="font-semibold text-primary text-sm tracking-wide">
            Reading the examples
          </p>
          <h2
            className="mt-4 font-heading font-semibold text-3xl text-foreground tracking-tight"
            id="example-labels-title"
          >
            Architecture evidence is not product proof.
          </h2>
        </div>
        <dl className="divide-y divide-border border-border border-y md:col-span-6 md:col-start-7">
          <div className="py-6">
            <dt className="font-heading font-semibold text-foreground text-xl">
              Architecture example
            </dt>
            <dd className="mt-2 text-base text-muted-foreground leading-7">
              Request flows and boundary diagrams describe the intended
              dependency direction. Tests and implementation remain the
              behavioral evidence.
            </dd>
          </div>
          <div className="py-6">
            <dt className="font-heading font-semibold text-foreground text-xl">
              Product example
            </dt>
            <dd className="mt-2 text-base text-muted-foreground leading-7">
              The neutral Feature Item exists to demonstrate a vertical slice.
              It is example vocabulary, not a recommended customer, industry, or
              data model.
            </dd>
          </div>
          <div className="py-6">
            <dt className="font-heading font-semibold text-foreground text-xl">
              Optional capability
            </dt>
            <dd className="mt-2 text-base text-muted-foreground leading-7">
              A manifest entry declares an extension boundary. It does not imply
              that every provider is configured in every environment.
            </dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="resources-next-title"
        className="grid gap-8 pt-16 md:grid-cols-12 md:items-end md:pt-20"
      >
        <div className="md:col-span-7">
          <h2
            className="font-heading font-semibold text-3xl text-foreground tracking-tight"
            id="resources-next-title"
          >
            Need the reasoning behind the boundaries?
          </h2>
          <p className="mt-4 max-w-reading text-base text-muted-foreground leading-7">
            The about page explains why the starter keeps its core small, its
            adapters visible, and its context useful to both people and AI
            agents.
          </p>
        </div>
        <div className="md:col-span-4 md:col-start-9 md:text-right">
          <PublicLink href="/about" variant="secondary">
            Read the approach
          </PublicLink>
        </div>
      </section>
    </PublicPage>
  );
}
