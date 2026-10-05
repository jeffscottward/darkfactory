// Legacy URL: redirects to its settings tab so old links keep working.
import { redirect } from "next/navigation";

import { LEGACY_ROUTE_REDIRECTS } from "../../../lib/navigation.ts";

export default function LegacyAccountPage() {
  return redirect(LEGACY_ROUTE_REDIRECTS["/account"]);
}
