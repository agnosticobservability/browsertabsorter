import { getStoredValue, setStoredValue } from "./storage.js";
import { setLoggerPreferences } from "./logger.js";
const PREFERENCES_KEY = "preferences";
export const defaultPreferences = {
    primaryGrouping: "domain",
    secondaryGrouping: "semantic",
    sorting: ["pinned", "recency"],
    debug: false
};
export const loadPreferences = async () => {
    const stored = await getStoredValue(PREFERENCES_KEY);
    const merged = { ...defaultPreferences, ...stored };
    setLoggerPreferences(merged);
    return merged;
};
export const savePreferences = async (prefs) => {
    const current = await loadPreferences();
    const merged = { ...current, ...prefs };
    await setStoredValue(PREFERENCES_KEY, merged);
    setLoggerPreferences(merged);
    return merged;
};
