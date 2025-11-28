'use client';

import React, { createContext, useContext, useMemo, useState } from 'react';

type Settings = {
  timezone?: string;
  [key: string]: any;
};

type UserSettingsContextType = {
  settings: Settings;
  setSettings: (settings: Settings) => void;
  timezone: string;
};

const UserSettingsContext = createContext<UserSettingsContextType | undefined>(undefined);

export function UserSettingsProvider({ initialSettings, children }: { initialSettings?: Settings; children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(initialSettings || {});
  const timezone = settings?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const value = useMemo(
    () => ({
      settings,
      setSettings,
      timezone,
    }),
    [settings, timezone]
  );

  return <UserSettingsContext.Provider value={value}>{children}</UserSettingsContext.Provider>;
}

export function useUserSettings() {
  const ctx = useContext(UserSettingsContext);
  if (!ctx) {
    throw new Error('useUserSettings must be used within a UserSettingsProvider');
  }
  return ctx;
}
