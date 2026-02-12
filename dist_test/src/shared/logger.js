"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logCritical = exports.logError = exports.logWarn = exports.logInfo = exports.logDebug = exports.clearLogs = exports.getLogs = exports.addLogEntry = exports.setLoggerPreferences = exports.initLogger = exports.loggerReady = void 0;
const PREFIX = "[TabSorter]";
const LEVEL_PRIORITY = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    critical: 4
};
let currentLevel = "info";
let logs = [];
const MAX_LOGS = 1000;
const STORAGE_KEY = "sessionLogs";
// Safe context check
const isServiceWorker = typeof self !== 'undefined' &&
    typeof self.ServiceWorkerGlobalScope !== 'undefined' &&
    self instanceof self.ServiceWorkerGlobalScope;
let isSaving = false;
let pendingSave = false;
let saveTimer = null;
const doSave = () => {
    if (!isServiceWorker || !chrome?.storage?.session || isSaving) {
        pendingSave = true;
        return;
    }
    isSaving = true;
    pendingSave = false;
    chrome.storage.session.set({ [STORAGE_KEY]: logs }).then(() => {
        isSaving = false;
        if (pendingSave) {
            saveLogsToStorage();
        }
    }).catch(err => {
        console.error("Failed to save logs", err);
        isSaving = false;
    });
};
const saveLogsToStorage = () => {
    if (saveTimer)
        clearTimeout(saveTimer);
    saveTimer = setTimeout(doSave, 1000);
};
let resolveLoggerReady;
exports.loggerReady = new Promise(resolve => {
    resolveLoggerReady = resolve;
});
const initLogger = async () => {
    if (isServiceWorker && chrome?.storage?.session) {
        try {
            const result = await chrome.storage.session.get(STORAGE_KEY);
            if (result[STORAGE_KEY] && Array.isArray(result[STORAGE_KEY])) {
                logs = result[STORAGE_KEY];
                if (logs.length > MAX_LOGS)
                    logs = logs.slice(0, MAX_LOGS);
            }
        }
        catch (e) {
            console.error("Failed to restore logs", e);
        }
    }
    if (resolveLoggerReady)
        resolveLoggerReady();
};
exports.initLogger = initLogger;
const setLoggerPreferences = (prefs) => {
    if (prefs.logLevel) {
        currentLevel = prefs.logLevel;
    }
    else if (prefs.debug) {
        currentLevel = "debug";
    }
    else {
        currentLevel = "info";
    }
};
exports.setLoggerPreferences = setLoggerPreferences;
const shouldLog = (level) => {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];
};
const formatMessage = (message, context) => {
    return context ? `${message} :: ${JSON.stringify(context)}` : message;
};
const addLog = (level, message, context) => {
    // Always add to buffer regardless of current console level setting,
    // or should we respect it? Usually debug logs are noisy.
    // Let's respect shouldLog for the buffer too to save memory/noise,
    // OR we can store everything but filter on view.
    // Given we want to debug issues, storing everything might be better,
    // but if we store everything we might fill buffer with debug noise quickly.
    // Let's stick to storing what is configured to be logged.
    // Wait, if I want to "debug" something, I usually turn on debug logs.
    // If I can't see past logs because they weren't stored, I have to repro.
    // Let's store if it passes `shouldLog`.
    if (shouldLog(level)) {
        const entry = {
            timestamp: Date.now(),
            level,
            message,
            context
        };
        if (isServiceWorker) {
            logs.unshift(entry);
            if (logs.length > MAX_LOGS) {
                logs.pop();
            }
            saveLogsToStorage();
        }
        else {
            // In other contexts, send to SW
            if (chrome?.runtime?.sendMessage) {
                chrome.runtime.sendMessage({ type: 'logEntry', payload: entry }).catch(() => {
                    // Ignore if message fails (e.g. context invalidated)
                });
            }
        }
    }
};
const addLogEntry = (entry) => {
    if (isServiceWorker) {
        logs.unshift(entry);
        if (logs.length > MAX_LOGS) {
            logs.pop();
        }
        saveLogsToStorage();
    }
};
exports.addLogEntry = addLogEntry;
const getLogs = () => [...logs];
exports.getLogs = getLogs;
const clearLogs = () => {
    logs.length = 0;
    if (isServiceWorker)
        saveLogsToStorage();
};
exports.clearLogs = clearLogs;
const logDebug = (message, context) => {
    addLog("debug", message, context);
    if (shouldLog("debug")) {
        console.debug(`${PREFIX} [DEBUG] ${formatMessage(message, context)}`);
    }
};
exports.logDebug = logDebug;
const logInfo = (message, context) => {
    addLog("info", message, context);
    if (shouldLog("info")) {
        console.info(`${PREFIX} [INFO] ${formatMessage(message, context)}`);
    }
};
exports.logInfo = logInfo;
const logWarn = (message, context) => {
    addLog("warn", message, context);
    if (shouldLog("warn")) {
        console.warn(`${PREFIX} [WARN] ${formatMessage(message, context)}`);
    }
};
exports.logWarn = logWarn;
const logError = (message, context) => {
    addLog("error", message, context);
    if (shouldLog("error")) {
        console.error(`${PREFIX} [ERROR] ${formatMessage(message, context)}`);
    }
};
exports.logError = logError;
const logCritical = (message, context) => {
    addLog("critical", message, context);
    if (shouldLog("critical")) {
        // Critical logs use error console but with distinct prefix and maybe styling if supported
        console.error(`${PREFIX} [CRITICAL] 🚨 ${formatMessage(message, context)}`);
    }
};
exports.logCritical = logCritical;
