import { getSystemSettings } from "@/actions/admin-actions";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const settings = await getSystemSettings();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">System Settings</h1>
      <SettingsForm initialSettings={settings} />
    </div>
  );
}
