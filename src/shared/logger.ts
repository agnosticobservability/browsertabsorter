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

const SENSITIVE_KEYS = /password|secret|token|credential|cookie|session|authorization|((api|access|secret|private)[-_]?key)/i;

const sanitizeContext = (context: Record<string, unknown> | undefined): Record<string, unknown> | undefined => {
    if (!context) return undefined;
    try {
        // Deep clone to ensure we don't modify the original object and remove non-serializable data
        const json = JSON.stringify(context);
        const obj = JSON.parse(json);

        const redact = (o: any) => {
            if (typeof o !== 'object' || o === null) return;
            for (const k in o) {
                if (SENSITIVE_KEYS.test(k)) {
                    o[k] = '[REDACTED]';
                } else {
                    redact(o[k]);
                }
            }
        };
        redact(obj);
        return obj;
    } catch (e) {
        return { error: "Failed to sanitize context" };
    }
};

// Safe context check
const isServiceWorker = typeof self !== 'undefined' &&
                        typeof (self as any).ServiceWorkerGlobalScope === 'function' &&
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
        // Ensure context is sanitized before storing
        const safeContext = sanitizeContext(entry.context);
        const safeEntry = { ...entry, context: safeContext };

        logs.unshift(safeEntry);
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
  if (shouldLog("debug")) {
      const safeContext = sanitizeContext(context);
      addLog("debug", message, safeContext);
      console.debug(`${PREFIX} [DEBUG] ${formatMessage(message, safeContext)}`);
  }
};

export const logInfo = (message: string, context?: Record<string, unknown>) => {
  if (shouldLog("info")) {
      const safeContext = sanitizeContext(context);
      addLog("info", message, safeContext);
      console.info(`${PREFIX} [INFO] ${formatMessage(message, safeContext)}`);
  }
};

export const logWarn = (message: string, context?: Record<string, unknown>) => {
  if (shouldLog("warn")) {
      const safeContext = sanitizeContext(context);
      addLog("warn", message, safeContext);
      console.warn(`${PREFIX} [WARN] ${formatMessage(message, safeContext)}`);
  }
};

export const logError = (message: string, context?: Record<string, unknown>) => {
  if (shouldLog("error")) {
      const safeContext = sanitizeContext(context);
      addLog("error", message, safeContext);
      console.error(`${PREFIX} [ERROR] ${formatMessage(message, safeContext)}`);
  }
};

export const logCritical = (message: string, context?: Record<string, unknown>) => {
  if (shouldLog("critical")) {
      const safeContext = sanitizeContext(context);
      addLog("critical", message, safeContext);
      // Critical logs use error console but with distinct prefix and maybe styling if supported
      console.error(`${PREFIX} [CRITICAL] 🚨 ${formatMessage(message, safeContext)}`);
  }
};
