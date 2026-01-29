"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logError = exports.logWarn = exports.logInfo = exports.logDebug = exports.setLoggerPreferences = void 0;
const PREFIX = "[TabSorter]";
let currentPreferences = null;
const setLoggerPreferences = (prefs) => {
    currentPreferences = prefs;
};
exports.setLoggerPreferences = setLoggerPreferences;
const shouldLog = (level) => {
    if (!currentPreferences)
        return level !== "debug";
    if (!currentPreferences.debug && level === "debug")
        return false;
    return true;
};
const log = (level, message, context) => {
    if (!shouldLog(level))
        return;
    const payload = context ? `${message} :: ${JSON.stringify(context)}` : message;
    switch (level) {
        case "debug":
            console.debug(`${PREFIX} ${payload}`);
            break;
        case "info":
            console.info(`${PREFIX} ${payload}`);
            break;
        case "warn":
            console.warn(`${PREFIX} ${payload}`);
            break;
        case "error":
            console.error(`${PREFIX} ${payload}`);
            break;
    }
};
const logDebug = (message, context) => log("debug", message, context);
exports.logDebug = logDebug;
const logInfo = (message, context) => log("info", message, context);
exports.logInfo = logInfo;
const logWarn = (message, context) => log("warn", message, context);
exports.logWarn = logWarn;
const logError = (message, context) => log("error", message, context);
exports.logError = logError;
