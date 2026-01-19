import { Preferences, SortingStrategy } from "./types.js";

export const defaultPreferences: Preferences = {
  sorting: ["pinned", "recency"],
  debug: false,
  theme: "dark",
  customGenera: {}
};

export const normalizeSorting = (sorting: unknown): SortingStrategy[] => {
  if (Array.isArray(sorting)) {
    return sorting.filter((value): value is SortingStrategy => typeof value === "string");
  }
  if (typeof sorting === "string") {
    return [sorting];
  }
  return [...defaultPreferences.sorting];
};

export const normalizePreferences = (prefs?: Partial<Preferences> | null): Preferences => {
  const merged = { ...defaultPreferences, ...(prefs ?? {}) };
  return {
    ...merged,
    sorting: normalizeSorting(merged.sorting),
    customStrategies: Array.isArray(merged.customStrategies) ? merged.customStrategies : undefined
  };
};
