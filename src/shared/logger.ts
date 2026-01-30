import { LogLevel, Preferences } from "./types.js";

const PREFIX = "[TabSorter]";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  critical: 4
};

let currentLevel: LogLevel = "info";

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

export const logDebug = (message: string, context?: Record<string, unknown>) => {
  if (shouldLog("debug")) {
    console.debug(`${PREFIX} [DEBUG] ${formatMessage(message, context)}`);
  }
};

export const logInfo = (message: string, context?: Record<string, unknown>) => {
  if (shouldLog("info")) {
    console.info(`${PREFIX} [INFO] ${formatMessage(message, context)}`);
  }
};

export const logWarn = (message: string, context?: Record<string, unknown>) => {
  if (shouldLog("warn")) {
    console.warn(`${PREFIX} [WARN] ${formatMessage(message, context)}`);
  }
};

export const logError = (message: string, context?: Record<string, unknown>) => {
  if (shouldLog("error")) {
    console.error(`${PREFIX} [ERROR] ${formatMessage(message, context)}`);
  }
};

export const logCritical = (message: string, context?: Record<string, unknown>) => {
  if (shouldLog("critical")) {
    // Critical logs use error console but with distinct prefix and maybe styling if supported
    console.error(`${PREFIX} [CRITICAL] 🚨 ${formatMessage(message, context)}`);
  }
};
