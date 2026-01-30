import { LogEntry, LogLevel, Preferences } from "./types.js";

const PREFIX = "[TabSorter]";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  critical: 4
};

let currentLevel: LogLevel = "info";
let logs: LogEntry[] = [];
const MAX_LOGS = 1000;
const STORAGE_KEY = "sessionLogs";

// Safe context check
const isServiceWorker = typeof self !== 'undefined' &&
                        typeof (self as any).ServiceWorkerGlobalScope !== 'undefined' &&
                        self instanceof (self as any).ServiceWorkerGlobalScope;
let isSaving = false;
let pendingSave = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

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
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(doSave, 1000);
};

let resolveLoggerReady: () => void;
export const loggerReady = new Promise<void>(resolve => {
    resolveLoggerReady = resolve;
});

export const initLogger = async () => {
    if (isServiceWorker && chrome?.storage?.session) {
        try {
            const result = await chrome.storage.session.get(STORAGE_KEY);
            if (result[STORAGE_KEY] && Array.isArray(result[STORAGE_KEY])) {
                logs = result[STORAGE_KEY];
                if (logs.length > MAX_LOGS) logs = logs.slice(0, MAX_LOGS);
            }
        } catch (e) {
            console.error("Failed to restore logs", e);
        }
    }
    if (resolveLoggerReady) resolveLoggerReady();
};

export const setLoggerPreferences = (prefs: Preferences) => {
  if (prefs.logLevel) {
    currentLevel = prefs.logLevel;
  } else if (prefs.debug) {
    currentLevel = "debug";
  } else {
    currentLevel = "info";
  }
};

const shouldLog = (level: LogLevel): boolean => {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];
};

const formatMessage = (message: string, context?: Record<string, unknown>) => {
  return context ? `${message} :: ${JSON.stringify(context)}` : message;
};

const addLog = (level: LogLevel, message: string, context?: Record<string, unknown>) => {
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
      const entry: LogEntry = {
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
      } else {
          // In other contexts, send to SW
          if (chrome?.runtime?.sendMessage) {
             chrome.runtime.sendMessage({ type: 'logEntry', payload: entry }).catch(() => {
                 // Ignore if message fails (e.g. context invalidated)
             });
          }
      }
  }
};

export const addLogEntry = (entry: LogEntry) => {
    if (isServiceWorker) {
        logs.unshift(entry);
        if (logs.length > MAX_LOGS) {
            logs.pop();
        }
        saveLogsToStorage();
    }
};

export const getLogs = () => [...logs];
export const clearLogs = () => {
    logs.length = 0;
    if (isServiceWorker) saveLogsToStorage();
};

export const logDebug = (message: string, context?: Record<string, unknown>) => {
  addLog("debug", message, context);
  if (shouldLog("debug")) {
    console.debug(`${PREFIX} [DEBUG] ${formatMessage(message, context)}`);
  }
};

export const logInfo = (message: string, context?: Record<string, unknown>) => {
  addLog("info", message, context);
  if (shouldLog("info")) {
    console.info(`${PREFIX} [INFO] ${formatMessage(message, context)}`);
  }
};

export const logWarn = (message: string, context?: Record<string, unknown>) => {
  addLog("warn", message, context);
  if (shouldLog("warn")) {
    console.warn(`${PREFIX} [WARN] ${formatMessage(message, context)}`);
  }
};

export const logError = (message: string, context?: Record<string, unknown>) => {
  addLog("error", message, context);
  if (shouldLog("error")) {
    console.error(`${PREFIX} [ERROR] ${formatMessage(message, context)}`);
  }
};

export const logCritical = (message: string, context?: Record<string, unknown>) => {
  addLog("critical", message, context);
  if (shouldLog("critical")) {
    // Critical logs use error console but with distinct prefix and maybe styling if supported
    console.error(`${PREFIX} [CRITICAL] 🚨 ${formatMessage(message, context)}`);
  }
};
