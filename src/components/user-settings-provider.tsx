'use client';

import React, { createContext, useContext, useMemo, useState } from 'react';

export type PronunciationAccent = 'us' | 'uk';

type Settings = {
  timezone?: string;
  pronunciationAccent?: PronunciationAccent;
  [key: string]: any;
};

type UserSettingsContextType = {
  settings: Settings;
  setSettings: (settings: Settings) => void;
  timezone: string;
  pronunciationAccent: PronunciationAccent;
};

const UserSettingsContext = createContext<UserSettingsContextType | undefined>(undefined);

export function UserSettingsProvider({ initialSettings, children }: { initialSettings?: Settings; children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(initialSettings || {});
  const timezone = settings?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const pronunciationAccent: PronunciationAccent = settings?.pronunciationAccent || 'us';

  const value = useMemo(
    () => ({
      settings,
      setSettings,
      timezone,
      pronunciationAccent,
    }),
    [settings, timezone, pronunciationAccent]
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
