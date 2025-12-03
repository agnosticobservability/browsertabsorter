import { Preferences } from "../shared/types.js";
import { getStoredValue, setStoredValue } from "./storage.js";
import { setLoggerPreferences } from "./logger.js";

const PREFERENCES_KEY = "preferences";

export const defaultPreferences: Preferences = {
  primaryGrouping: "domain",
  secondaryGrouping: "semantic",
  sorting: ["pinned", "recency"],
  autoGroupNewTabs: true,
  debug: false
};

export const loadPreferences = async (): Promise<Preferences> => {
  const stored = await getStoredValue<Preferences>(PREFERENCES_KEY);
  const merged = { ...defaultPreferences, ...stored };
  setLoggerPreferences(merged);
  return merged;
};

export const savePreferences = async (prefs: Preferences): Promise<Preferences> => {
  const merged = { ...defaultPreferences, ...prefs };
  await setStoredValue(PREFERENCES_KEY, merged);
  setLoggerPreferences(merged);
  return merged;
};
