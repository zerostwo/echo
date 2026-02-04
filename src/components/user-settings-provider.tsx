'use client';

import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';
import { updateSettings as updateSettingsAction } from '@/actions/user-actions';

export type PronunciationAccent = 'us' | 'uk';

type Settings = {
  timezone?: string;
  pronunciationAccent?: PronunciationAccent;
  // Vocabulary page settings
  vocabColumns?: string[];
  vocabPageSize?: number;
  vocabSortBy?: string;
  vocabSortOrder?: 'asc' | 'desc';
  // Materials page settings
  materialsColumns?: string[];
  materialsPageSize?: number;
  materialsSortBy?: string;
  materialsSortOrder?: 'asc' | 'desc';
  // Dictionary page settings
  dictionaryColumns?: string[];
  dictionaryPageSize?: number;
  dictionarySortBy?: string;
  dictionarySortOrder?: 'asc' | 'desc';
  // Trash page settings
  trashColumns?: string[];
  trashPageSize?: number;
  trashSortBy?: string;
  trashSortOrder?: 'asc' | 'desc';
  // Learning settings
  dailyWordGoal?: number;
  sessionSize?: number;
  preferredLearningMode?: 'typing' | 'multiple_choice' | 'context_listening';
  vocabShowMastered?: boolean;
  [key: string]: any;
};

type UserSettingsContextType = {
  settings: Settings;
  setSettings: (settings: Settings) => void;
  updateSettings: (partialSettings: Partial<Settings>) => Promise<void>;
  timezone: string;
  pronunciationAccent: PronunciationAccent;
};

const UserSettingsContext = createContext<UserSettingsContextType | undefined>(undefined);
let warnedMissingProvider = false;

export function UserSettingsProvider({ initialSettings, children }: { initialSettings?: Settings; children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(initialSettings || {});
  const timezone = settings?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const pronunciationAccent: PronunciationAccent = settings?.pronunciationAccent || 'us';

  // Sync with initialSettings when it changes (e.g. after server revalidation)
  React.useEffect(() => {
    if (initialSettings) {
      setSettings(initialSettings);
    }
  }, [initialSettings]);

  // Update settings and persist to database
  const updateSettings = useCallback(async (partialSettings: Partial<Settings>) => {
    const newSettings = { ...settings, ...partialSettings };
    setSettings(newSettings);
    // Persist to database in background
    await updateSettingsAction(newSettings);
  }, [settings]);

  const value = useMemo(
    () => ({
      settings,
      setSettings,
      updateSettings,
      timezone,
      pronunciationAccent,
    }),
    [settings, updateSettings, timezone, pronunciationAccent]
  );

  return <UserSettingsContext.Provider value={value}>{children}</UserSettingsContext.Provider>;
}

export function useUserSettings() {
  const ctx = useContext(UserSettingsContext);
  if (!ctx) {
    if (!warnedMissingProvider) {
      console.warn('useUserSettings used without UserSettingsProvider. Falling back to defaults.');
      warnedMissingProvider = true;
    }
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const pronunciationAccent: PronunciationAccent = 'us';
    return {
      settings: {},
      setSettings: () => {},
      updateSettings: async () => {},
      timezone,
      pronunciationAccent,
    };
  }
  return ctx;
}
