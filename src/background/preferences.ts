import { Preferences, SortingStrategy } from "../shared/types.js";
import { getStoredValue, setStoredValue } from "./storage.js";
import { setLoggerPreferences } from "./logger.js";

const PREFERENCES_KEY = "preferences";

export const defaultPreferences: Preferences = {
  sorting: ["pinned", "recency"],
  debug: false,
  theme: "dark",
  customGenera: {}
};

const normalizeSorting = (sorting: unknown): SortingStrategy[] => {
  if (Array.isArray(sorting)) {
    return sorting.filter((value): value is SortingStrategy => typeof value === "string");
  }
  if (typeof sorting === "string") {
    return [sorting];
  }
  return [...defaultPreferences.sorting];
};

const normalizePreferences = (prefs?: Partial<Preferences> | null): Preferences => {
  const merged = { ...defaultPreferences, ...(prefs ?? {}) };
  return {
    ...merged,
    sorting: normalizeSorting(merged.sorting),
    customStrategies: Array.isArray(merged.customStrategies) ? merged.customStrategies : undefined
  };
};

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
