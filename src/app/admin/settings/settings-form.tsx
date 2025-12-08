"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { updateSystemSettings } from "@/actions/admin-actions";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";

export function SettingsForm({ initialSettings }: { initialSettings: any }) {
  const [settings, setSettings] = useState(initialSettings);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await updateSystemSettings(settings);
    setLoading(false);
    if (res.success) {
      toast.success("Settings saved");
    } else {
      toast.error("Failed to save settings");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Email Configuration</CardTitle>
          <CardDescription>Configure SMTP settings for sending emails.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="smtpHost">SMTP Host</Label>
            <Input
              id="smtpHost"
              value={settings.email?.smtpHost || ""}
              onChange={(e) => setSettings({ ...settings, email: { ...settings.email, smtpHost: e.target.value } })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="smtpPort">SMTP Port</Label>
            <Input
              id="smtpPort"
              type="number"
              value={settings.email?.smtpPort || 587}
              onChange={(e) => setSettings({ ...settings, email: { ...settings.email, smtpPort: parseInt(e.target.value) } })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="smtpUser">SMTP User</Label>
            <Input
              id="smtpUser"
              value={settings.email?.smtpUser || ""}
              onChange={(e) => setSettings({ ...settings, email: { ...settings.email, smtpUser: e.target.value } })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="smtpPass">SMTP Password</Label>
            <Input
              id="smtpPass"
              type="password"
              value={settings.email?.smtpPass || ""}
              onChange={(e) => setSettings({ ...settings, email: { ...settings.email, smtpPass: e.target.value } })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="fromEmail">From Email</Label>
            <Input
              id="fromEmail"
              value={settings.email?.fromEmail || ""}
              onChange={(e) => setSettings({ ...settings, email: { ...settings.email, fromEmail: e.target.value } })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Site Settings</CardTitle>
          <CardDescription>General site configuration.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Maintenance Mode</Label>
              <div className="text-sm text-muted-foreground">Disable access for non-admin users.</div>
            </div>
            <Switch
              checked={settings.site?.maintenanceMode || false}
              onCheckedChange={(checked) => setSettings({ ...settings, site: { ...settings.site, maintenanceMode: checked } })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Allow Registration</Label>
              <div className="text-sm text-muted-foreground">Allow new users to sign up.</div>
            </div>
            <Switch
              checked={settings.site?.allowRegistration !== false}
              onCheckedChange={(checked) => setSettings({ ...settings, site: { ...settings.site, allowRegistration: checked } })}
            />
          </div>
        </CardContent>
      </Card>

      <Button type="submit" disabled={loading}>
        {loading ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}
