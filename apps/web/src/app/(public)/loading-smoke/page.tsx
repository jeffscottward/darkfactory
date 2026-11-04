import { notFound } from "next/navigation";

import { isE2eFixtureEnabled } from "../../../lib/e2e-fixtures.ts";
import { PublicPage } from "../_components/public-content.tsx";

// The loading boundary must stay on screen long enough to be seen and audited
// on a loaded runner. At half a CPU core, with a 1500 ms delay, the browser
// showed the boundary 1-3 s after the first byte for only 0.1-1.5 s, and
// Playwright missed it in 3 of 6 loads.
const fixtureDelayMilliseconds = 5000;

export default async function LoadingSmokePage() {
  if (!isE2eFixtureEnabled()) notFound();

  await new Promise((resolve) => setTimeout(resolve, fixtureDelayMilliseconds));

  return (
    <PublicPage
      description="The guarded loading boundary completed its deterministic delay."
      eyebrow="E2E fixture"
      title="The loading fixture completed."
    >
      <p className="py-8 text-base text-muted-foreground leading-7">
        This route is available only to the isolated end-to-end server.
      </p>
    </PublicPage>
  );
}
