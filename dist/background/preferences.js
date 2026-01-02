import { getStoredValue, setStoredValue } from "./storage.js";
import { setLoggerPreferences } from "./logger.js";
const PREFERENCES_KEY = "preferences";
export const defaultPreferences = {
    primaryGrouping: "domain",
    secondaryGrouping: "semantic",
    sorting: ["pinned", "recency"],
    debug: false,
    popupVariant: "default"
};
export const loadPreferences = async () => {
    const stored = await getStoredValue(PREFERENCES_KEY);
    const merged = { ...defaultPreferences, ...stored };
    setLoggerPreferences(merged);
    return merged;
};
export const savePreferences = async (prefs) => {
    const merged = { ...defaultPreferences, ...prefs };
    await setStoredValue(PREFERENCES_KEY, merged);
    setLoggerPreferences(merged);
    return merged;
};
