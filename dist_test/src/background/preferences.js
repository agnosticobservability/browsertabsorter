"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.savePreferences = exports.loadPreferences = exports.defaultPreferences = void 0;
const storage_js_1 = require("./storage.js");
const logger_js_1 = require("../shared/logger.js");
const utils_js_1 = require("../shared/utils.js");
const PREFERENCES_KEY = "preferences";
exports.defaultPreferences = {
    sorting: ["pinned", "recency"],
    debug: false,
    logLevel: "info",
    theme: "dark",
    customGenera: {},
    enableYouTubeGenreDetection: false,
    youtubeApiKey: "",
    colorByField: ""
};
const normalizeSorting = (sorting) => {
    if (Array.isArray(sorting)) {
        return sorting.filter((value) => typeof value === "string");
    }
    if (typeof sorting === "string") {
        return [sorting];
    }
    return [...exports.defaultPreferences.sorting];
};
const normalizeStrategies = (strategies) => {
    const arr = (0, utils_js_1.asArray)(strategies).filter(s => typeof s === 'object' && s !== null);
    return arr.map(s => ({
        ...s,
        groupingRules: (0, utils_js_1.asArray)(s.groupingRules),
        sortingRules: (0, utils_js_1.asArray)(s.sortingRules),
        groupSortingRules: s.groupSortingRules ? (0, utils_js_1.asArray)(s.groupSortingRules) : undefined,
        filters: s.filters ? (0, utils_js_1.asArray)(s.filters) : undefined,
        filterGroups: s.filterGroups ? (0, utils_js_1.asArray)(s.filterGroups).map((g) => (0, utils_js_1.asArray)(g)) : undefined,
        rules: s.rules ? (0, utils_js_1.asArray)(s.rules) : undefined
    }));
};
const normalizePreferences = (prefs) => {
    const merged = { ...exports.defaultPreferences, ...(prefs ?? {}) };
    return {
        ...merged,
        sorting: normalizeSorting(merged.sorting),
        customStrategies: normalizeStrategies(merged.customStrategies)
    };
};
const loadPreferences = async () => {
    const stored = await (0, storage_js_1.getStoredValue)(PREFERENCES_KEY);
    const merged = normalizePreferences(stored ?? undefined);
    (0, logger_js_1.setLoggerPreferences)(merged);
    return merged;
};
exports.loadPreferences = loadPreferences;
const savePreferences = async (prefs) => {
    (0, logger_js_1.logDebug)("Updating preferences", { keys: Object.keys(prefs) });
    const current = await (0, exports.loadPreferences)();
    const merged = normalizePreferences({ ...current, ...prefs });
    await (0, storage_js_1.setStoredValue)(PREFERENCES_KEY, merged);
    (0, logger_js_1.setLoggerPreferences)(merged);
    return merged;
};
exports.savePreferences = savePreferences;
