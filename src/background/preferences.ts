import { CustomStrategy, Preferences, SortingStrategy } from "../shared/types.js";
import { getStoredValue, setStoredValue } from "./storage.js";
import { setLoggerPreferences, logDebug } from "../shared/logger.js";
import { asArray } from "../shared/utils.js";

const PREFERENCES_KEY = "preferences";

export const defaultPreferences: Preferences = {
  sorting: ["pinned", "recency"],
  debug: false,
  logLevel: "info",
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

const normalizeStrategies = (strategies: unknown): CustomStrategy[] => {
    const arr = asArray<any>(strategies).filter(s => typeof s === 'object' && s !== null);
    return arr.map(s => ({
        ...s,
        groupingRules: asArray(s.groupingRules),
        sortingRules: asArray(s.sortingRules),
        groupSortingRules: s.groupSortingRules ? asArray(s.groupSortingRules) : undefined,
        filters: s.filters ? asArray(s.filters) : undefined,
        filterGroups: s.filterGroups ? asArray(s.filterGroups).map((g: any) => asArray(g)) : undefined,
        rules: s.rules ? asArray(s.rules) : undefined
    }));
};

const normalizePreferences = (prefs?: Partial<Preferences> | null): Preferences => {
  const merged = { ...defaultPreferences, ...(prefs ?? {}) };
  return {
    ...merged,
    sorting: normalizeSorting(merged.sorting),
    customStrategies: normalizeStrategies(merged.customStrategies)
  };
};

export const loadPreferences = async (): Promise<Preferences> => {
  try {
    const stored = await getStoredValue<Preferences>(PREFERENCES_KEY);
    const merged = normalizePreferences(stored ?? undefined);
    setLoggerPreferences(merged);
    return merged;
  } catch (e) {
    console.error("Failed to load preferences", e);
    return defaultPreferences;
  }
};

export const savePreferences = async (prefs: Partial<Preferences>): Promise<Preferences> => {
  logDebug("Updating preferences", { keys: Object.keys(prefs) });
  const current = await loadPreferences();
  const merged = normalizePreferences({ ...current, ...prefs });
  await setStoredValue(PREFERENCES_KEY, merged);
  setLoggerPreferences(merged);
  return merged;
};
