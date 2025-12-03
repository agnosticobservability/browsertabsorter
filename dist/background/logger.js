const PREFIX = "[TabSorter]";
let currentPreferences = null;
export const setLoggerPreferences = (prefs) => {
    currentPreferences = prefs;
};
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
export const logDebug = (message, context) => log("debug", message, context);
export const logInfo = (message, context) => log("info", message, context);
export const logWarn = (message, context) => log("warn", message, context);
export const logError = (message, context) => log("error", message, context);
