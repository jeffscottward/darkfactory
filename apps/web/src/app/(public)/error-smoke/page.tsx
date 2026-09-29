import { notFound } from "next/navigation";

import { isE2eFixtureEnabled } from "../../../lib/e2e-fixtures.ts";
import { RecoverableErrorFixture } from "./recoverable-error-fixture.tsx";

export default function ErrorSmokePage() {
  if (!isE2eFixtureEnabled()) notFound();
  return <RecoverableErrorFixture />;
}
