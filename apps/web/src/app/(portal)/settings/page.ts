import { redirect } from "next/navigation";

import { SETTINGS_HOME_PATH } from "../../../lib/navigation.ts";

export default function SettingsPage() {
  return redirect(SETTINGS_HOME_PATH);
}
