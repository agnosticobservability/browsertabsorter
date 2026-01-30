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
const logs: LogEntry[] = [];
const MAX_LOGS = 1000;

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
      logs.unshift(entry);
      if (logs.length > MAX_LOGS) {
          logs.pop();
      }
  }
};

export const getLogs = () => [...logs];
export const clearLogs = () => { logs.length = 0; };

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
