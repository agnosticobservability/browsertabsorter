import { Preferences } from "../shared/types.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

const PREFIX = "[TabSorter]";

let currentPreferences: Preferences | null = null;

export const setLoggerPreferences = (prefs: Preferences) => {
  currentPreferences = prefs;
};

const shouldLog = (level: LogLevel) => {
  if (!currentPreferences) return level !== "debug";
  if (!currentPreferences.debug && level === "debug") return false;
  return true;
};

const log = (level: LogLevel, message: string, context?: Record<string, unknown>) => {
  if (!shouldLog(level)) return;
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

export const logDebug = (message: string, context?: Record<string, unknown>) =>
  log("debug", message, context);
export const logInfo = (message: string, context?: Record<string, unknown>) =>
  log("info", message, context);
export const logWarn = (message: string, context?: Record<string, unknown>) =>
  log("warn", message, context);
export const logError = (message: string, context?: Record<string, unknown>) =>
  log("error", message, context);
