import { Preferences } from "../shared/types.js";
import { getStoredValue, setStoredValue } from "./storage.js";
import { setLoggerPreferences } from "./logger.js";
import { normalizePreferences } from "../shared/preferences.js";

const PREFERENCES_KEY = "preferences";

export const loadPreferences = async (): Promise<Preferences> => {
  const stored = await getStoredValue<Preferences>(PREFERENCES_KEY);
  const merged = normalizePreferences(stored ?? undefined);
  setLoggerPreferences(merged);
  return merged;
};

export const savePreferences = async (prefs: Partial<Preferences>): Promise<Preferences> => {
  const current = await loadPreferences();
  const merged = normalizePreferences({ ...current, ...prefs });
  await setStoredValue(PREFERENCES_KEY, merged);
  setLoggerPreferences(merged);
  return merged;
};
