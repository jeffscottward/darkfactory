import { redirect } from "next/navigation";

import { SETTINGS_HOME_PATH } from "../../../../lib/navigation.ts";

export default function AccountSettingsPage() {
  return redirect(SETTINGS_HOME_PATH);
}
