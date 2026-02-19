var __defProp = Object.defineProperty;
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateWrapper = (obj, member, setter, getter) => ({
  set _(value) {
    __privateSet(obj, member, value, setter);
  },
  get _() {
    return __privateGet(obj, member, getter);
  }
});

// src/shared/strategyRegistry.ts
var STRATEGIES = [
  { id: "domain", label: "Domain", isGrouping: true, isSorting: true, tags: ["group", "sort"] },
  { id: "domain_full", label: "Full Domain", isGrouping: true, isSorting: true, tags: ["group", "sort"] },
  { id: "topic", label: "Topic", isGrouping: true, isSorting: true, tags: ["group", "sort"] },
  { id: "context", label: "Context", isGrouping: true, isSorting: true, tags: ["group", "sort"] },
  { id: "lineage", label: "Lineage", isGrouping: true, isSorting: true, tags: ["group", "sort"] },
  { id: "pinned", label: "Pinned", isGrouping: true, isSorting: true, tags: ["group", "sort"] },
  { id: "recency", label: "Recency", isGrouping: true, isSorting: true, tags: ["group", "sort"] },
  { id: "age", label: "Age", isGrouping: true, isSorting: true, tags: ["group", "sort"] },
  { id: "url", label: "URL", isGrouping: true, isSorting: true, tags: ["group", "sort"] },
  { id: "nesting", label: "Nesting", isGrouping: true, isSorting: true, tags: ["group", "sort"] },
  { id: "title", label: "Title", isGrouping: true, isSorting: true, tags: ["group", "sort"] }
];
var getStrategies = (customStrategies2) => {
  if (!customStrategies2 || customStrategies2.length === 0) return STRATEGIES;
  const combined = [...STRATEGIES];
  customStrategies2.forEach((custom) => {
    const existingIndex = combined.findIndex((s) => s.id === custom.id);
    const hasGrouping = custom.groupingRules && custom.groupingRules.length > 0 || custom.rules && custom.rules.length > 0 || false;
    const hasSorting = custom.sortingRules && custom.sortingRules.length > 0 || custom.rules && custom.rules.length > 0 || false;
    const tags = [];
    if (hasGrouping) tags.push("group");
    if (hasSorting) tags.push("sort");
    const definition = {
      id: custom.id,
      label: custom.label,
      isGrouping: hasGrouping,
      isSorting: hasSorting,
      tags,
      autoRun: custom.autoRun,
      isCustom: true
    };
    if (existingIndex !== -1) {
      combined[existingIndex] = definition;
    } else {
      combined.push(definition);
    }
  });
  return combined;
};

// src/shared/logger.ts
var PREFIX = "[TabSorter]";
var LEVEL_PRIORITY = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  critical: 4
};
var currentLevel = "info";
var logs = [];
var MAX_LOGS = 1e3;
var STORAGE_KEY = "sessionLogs";
var isServiceWorker = typeof self !== "undefined" && typeof self.ServiceWorkerGlobalScope !== "undefined" && self instanceof self.ServiceWorkerGlobalScope;
var isSaving = false;
var pendingSave = false;
var saveTimer = null;
var doSave = () => {
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
  }).catch((err) => {
    console.error("Failed to save logs", err);
    isSaving = false;
  });
};
var saveLogsToStorage = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 1e3);
};
var resolveLoggerReady;
var loggerReady = new Promise((resolve) => {
  resolveLoggerReady = resolve;
});
var initLogger = async () => {
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
var setLoggerPreferences = (prefs) => {
  if (prefs.logLevel) {
    currentLevel = prefs.logLevel;
  } else if (prefs.debug) {
    currentLevel = "debug";
  } else {
    currentLevel = "info";
  }
};
var shouldLog = (level) => {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];
};
var formatMessage = (message, context) => {
  return context ? `${message} :: ${JSON.stringify(context)}` : message;
};
var addLog = (level, message, context) => {
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
    } else {
      if (chrome?.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: "logEntry", payload: entry }).catch(() => {
        });
      }
    }
  }
};
var addLogEntry = (entry) => {
  if (isServiceWorker) {
    logs.unshift(entry);
    if (logs.length > MAX_LOGS) {
      logs.pop();
    }
    saveLogsToStorage();
  }
};
var getLogs = () => [...logs];
var clearLogs = () => {
  logs.length = 0;
  if (isServiceWorker) saveLogsToStorage();
};
var logDebug = (message, context) => {
  addLog("debug", message, context);
  if (shouldLog("debug")) {
    console.debug(`${PREFIX} [DEBUG] ${formatMessage(message, context)}`);
  }
};
var logInfo = (message, context) => {
  addLog("info", message, context);
  if (shouldLog("info")) {
    console.info(`${PREFIX} [INFO] ${formatMessage(message, context)}`);
  }
};
var logError = (message, context) => {
  addLog("error", message, context);
  if (shouldLog("error")) {
    console.error(`${PREFIX} [ERROR] ${formatMessage(message, context)}`);
  }
};

// src/shared/utils.ts
var mapChromeTab = (tab) => {
  if (!tab.id || tab.id === chrome.tabs.TAB_ID_NONE || !tab.windowId) return null;
  return {
    id: tab.id,
    windowId: tab.windowId,
    title: tab.title || "Untitled",
    url: tab.pendingUrl || tab.url || "about:blank",
    pinned: Boolean(tab.pinned),
    lastAccessed: tab.lastAccessed,
    openerTabId: tab.openerTabId ?? void 0,
    favIconUrl: tab.favIconUrl,
    groupId: tab.groupId,
    index: tab.index,
    active: tab.active,
    status: tab.status,
    selected: tab.highlighted
  };
};
var asArray = (value) => {
  if (Array.isArray(value)) return value;
  return [];
};

// src/background/groupingStrategies.ts
var customStrategies = [];
var setCustomStrategies = (strategies) => {
  customStrategies = strategies;
};
var getCustomStrategies = () => customStrategies;
var COLORS = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];
var regexCache = /* @__PURE__ */ new Map();
var domainCache = /* @__PURE__ */ new Map();
var subdomainCache = /* @__PURE__ */ new Map();
var MAX_CACHE_SIZE = 1e3;
var domainFromUrl = (url) => {
  if (domainCache.has(url)) return domainCache.get(url);
  try {
    const parsed = new URL(url);
    const domain = parsed.hostname.replace(/^www\./, "");
    if (domainCache.size >= MAX_CACHE_SIZE) domainCache.clear();
    domainCache.set(url, domain);
    return domain;
  } catch (error) {
    logDebug("Failed to parse domain", { url, error: String(error) });
    return "unknown";
  }
};
var subdomainFromUrl = (url) => {
  if (subdomainCache.has(url)) return subdomainCache.get(url);
  try {
    const parsed = new URL(url);
    let hostname = parsed.hostname;
    hostname = hostname.replace(/^www\./, "");
    let result = "";
    const parts = hostname.split(".");
    if (parts.length > 2) {
      result = parts.slice(0, parts.length - 2).join(".");
    }
    if (subdomainCache.size >= MAX_CACHE_SIZE) subdomainCache.clear();
    subdomainCache.set(url, result);
    return result;
  } catch {
    return "";
  }
};
var getNestedProperty = (obj, path) => {
  if (!obj || typeof obj !== "object") return void 0;
  if (!path.includes(".")) {
    return obj[path];
  }
  const parts = path.split(".");
  let current = obj;
  for (const key of parts) {
    if (!current || typeof current !== "object") return void 0;
    current = current[key];
  }
  return current;
};
var getFieldValue = (tab, field) => {
  switch (field) {
    case "id":
      return tab.id;
    case "index":
      return tab.index;
    case "windowId":
      return tab.windowId;
    case "groupId":
      return tab.groupId;
    case "title":
      return tab.title;
    case "url":
      return tab.url;
    case "status":
      return tab.status;
    case "active":
      return tab.active;
    case "selected":
      return tab.selected;
    case "pinned":
      return tab.pinned;
    case "openerTabId":
      return tab.openerTabId;
    case "lastAccessed":
      return tab.lastAccessed;
    case "context":
      return tab.context;
    case "genre":
      return tab.contextData?.genre;
    case "siteName":
      return tab.contextData?.siteName;
    // Derived or mapped fields
    case "domain":
      return domainFromUrl(tab.url);
    case "subdomain":
      return subdomainFromUrl(tab.url);
    default:
      return getNestedProperty(tab, field);
  }
};
var stripTld = (domain) => {
  return domain.replace(/\.(com|org|gov|net|edu|io)$/i, "");
};
var semanticBucket = (title, url) => {
  const key = `${title} ${url}`.toLowerCase();
  if (key.includes("doc") || key.includes("readme") || key.includes("guide")) return "Docs";
  if (key.includes("mail") || key.includes("inbox")) return "Chat";
  if (key.includes("dashboard") || key.includes("console")) return "Dash";
  if (key.includes("issue") || key.includes("ticket")) return "Tasks";
  if (key.includes("drive") || key.includes("storage")) return "Files";
  return "Misc";
};
var navigationKey = (tab) => {
  if (tab.openerTabId !== void 0) {
    return `child-of-${tab.openerTabId}`;
  }
  return `window-${tab.windowId}`;
};
var getRecencyLabel = (lastAccessed) => {
  const now = Date.now();
  const diff = now - lastAccessed;
  if (diff < 36e5) return "Just now";
  if (diff < 864e5) return "Today";
  if (diff < 1728e5) return "Yesterday";
  if (diff < 6048e5) return "This Week";
  return "Older";
};
var colorForKey = (key, offset) => COLORS[(Math.abs(hashCode(key)) + offset) % COLORS.length];
var hashCode = (value) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
};
var getLabelComponent = (strategy, tabs, allTabsMap) => {
  const firstTab = tabs[0];
  if (!firstTab) return "Unknown";
  const custom = customStrategies.find((s) => s.id === strategy);
  if (custom) {
    return groupingKey(firstTab, strategy);
  }
  switch (strategy) {
    case "domain": {
      const siteNames = new Set(tabs.map((t) => t.contextData?.siteName).filter(Boolean));
      if (siteNames.size === 1) {
        return stripTld(Array.from(siteNames)[0]);
      }
      return stripTld(domainFromUrl(firstTab.url));
    }
    case "domain_full":
      return domainFromUrl(firstTab.url);
    case "topic":
      return semanticBucket(firstTab.title, firstTab.url);
    case "lineage":
      if (firstTab.openerTabId !== void 0) {
        const parent = allTabsMap.get(firstTab.openerTabId);
        if (parent) {
          const parentTitle = parent.title.length > 20 ? parent.title.substring(0, 20) + "..." : parent.title;
          return `From: ${parentTitle}`;
        }
        return `From: Tab ${firstTab.openerTabId}`;
      }
      return `Window ${firstTab.windowId}`;
    case "context":
      return firstTab.context || "Uncategorized";
    case "pinned":
      return firstTab.pinned ? "Pinned" : "Unpinned";
    case "age":
      return getRecencyLabel(firstTab.lastAccessed ?? 0);
    case "url":
      return "URL Group";
    case "recency":
      return "Time Group";
    case "nesting":
      return firstTab.openerTabId !== void 0 ? "Children" : "Roots";
    default:
      const val = getFieldValue(firstTab, strategy);
      if (val !== void 0 && val !== null) {
        return String(val);
      }
      return "Unknown";
  }
};
var generateLabel = (strategies, tabs, allTabsMap) => {
  const labels = strategies.map((s) => getLabelComponent(s, tabs, allTabsMap)).filter((l) => l && l !== "Unknown" && l !== "Group" && l !== "URL Group" && l !== "Time Group" && l !== "Misc");
  if (labels.length === 0) return "Group";
  return Array.from(new Set(labels)).join(" - ");
};
var getStrategyColorRule = (strategyId) => {
  const custom = customStrategies.find((s) => s.id === strategyId);
  if (!custom) return void 0;
  const groupingRulesList = asArray(custom.groupingRules);
  for (let i = groupingRulesList.length - 1; i >= 0; i--) {
    const rule = groupingRulesList[i];
    if (rule && rule.color && rule.color !== "random") {
      return rule;
    }
  }
  return void 0;
};
var resolveWindowMode = (modes) => {
  if (modes.includes("new")) return "new";
  if (modes.includes("compound")) return "compound";
  return "current";
};
var groupTabs = (tabs, strategies) => {
  const availableStrategies = getStrategies(customStrategies);
  const effectiveStrategies = strategies.filter((s) => availableStrategies.find((avail) => avail.id === s)?.isGrouping);
  const buckets = /* @__PURE__ */ new Map();
  const allTabsMap = /* @__PURE__ */ new Map();
  tabs.forEach((t) => allTabsMap.set(t.id, t));
  tabs.forEach((tab) => {
    let keys = [];
    const appliedStrategies = [];
    const collectedModes = [];
    try {
      for (const s of effectiveStrategies) {
        const result = getGroupingResult(tab, s);
        if (result.key !== null) {
          keys.push(`${s}:${result.key}`);
          appliedStrategies.push(s);
          collectedModes.push(result.mode);
        }
      }
    } catch (e) {
      logDebug("Error generating grouping key", { tabId: tab.id, error: String(e) });
      return;
    }
    if (keys.length === 0) {
      return;
    }
    const effectiveMode = resolveWindowMode(collectedModes);
    const valueKey = keys.join("::");
    let bucketKey = "";
    if (effectiveMode === "current") {
      bucketKey = `window-${tab.windowId}::` + valueKey;
    } else {
      bucketKey = `global::` + valueKey;
    }
    let group = buckets.get(bucketKey);
    if (!group) {
      let groupColor = null;
      let colorField;
      let colorTransform;
      let colorTransformPattern;
      for (const sId of appliedStrategies) {
        const rule = getStrategyColorRule(sId);
        if (rule) {
          groupColor = rule.color;
          colorField = rule.colorField;
          colorTransform = rule.colorTransform;
          colorTransformPattern = rule.colorTransformPattern;
          break;
        }
      }
      if (groupColor === "match") {
        groupColor = colorForKey(valueKey, 0);
      } else if (groupColor === "field" && colorField) {
        const val = getFieldValue(tab, colorField);
        let key = val !== void 0 && val !== null ? String(val) : "";
        if (colorTransform) {
          key = applyValueTransform(key, colorTransform, colorTransformPattern);
        }
        groupColor = colorForKey(key, 0);
      } else if (!groupColor || groupColor === "field") {
        groupColor = colorForKey(bucketKey, buckets.size);
      }
      group = {
        id: bucketKey,
        windowId: tab.windowId,
        label: "",
        color: groupColor,
        tabs: [],
        reason: appliedStrategies.join(" + "),
        windowMode: effectiveMode
      };
      buckets.set(bucketKey, group);
    }
    group.tabs.push(tab);
  });
  const groups = Array.from(buckets.values());
  groups.forEach((group) => {
    group.label = generateLabel(effectiveStrategies, group.tabs, allTabsMap);
  });
  return groups;
};
var checkValueMatch = (operator, rawValue, ruleValue) => {
  const valueStr = rawValue !== void 0 && rawValue !== null ? String(rawValue) : "";
  const valueToCheck = valueStr.toLowerCase();
  const patternToCheck = ruleValue ? ruleValue.toLowerCase() : "";
  let isMatch = false;
  let matchObj = null;
  switch (operator) {
    case "contains":
      isMatch = valueToCheck.includes(patternToCheck);
      break;
    case "doesNotContain":
      isMatch = !valueToCheck.includes(patternToCheck);
      break;
    case "equals":
      isMatch = valueToCheck === patternToCheck;
      break;
    case "startsWith":
      isMatch = valueToCheck.startsWith(patternToCheck);
      break;
    case "endsWith":
      isMatch = valueToCheck.endsWith(patternToCheck);
      break;
    case "exists":
      isMatch = rawValue !== void 0;
      break;
    case "doesNotExist":
      isMatch = rawValue === void 0;
      break;
    case "isNull":
      isMatch = rawValue === null;
      break;
    case "isNotNull":
      isMatch = rawValue !== null;
      break;
    case "matches":
      try {
        const regex = new RegExp(ruleValue, "i");
        matchObj = regex.exec(valueStr);
        isMatch = !!matchObj;
      } catch {
      }
      break;
  }
  return { isMatch, matchObj };
};
var checkCondition = (condition, tab) => {
  if (!condition) return false;
  const rawValue = getFieldValue(tab, condition.field);
  const { isMatch } = checkValueMatch(condition.operator, rawValue, condition.value);
  return isMatch;
};
var applyValueTransform = (val, transform, pattern, replacement) => {
  if (!val || !transform || transform === "none") return val;
  switch (transform) {
    case "stripTld":
      return stripTld(val);
    case "lowercase":
      return val.toLowerCase();
    case "uppercase":
      return val.toUpperCase();
    case "firstChar":
      return val.charAt(0);
    case "domain":
      return domainFromUrl(val);
    case "hostname":
      try {
        return new URL(val).hostname;
      } catch {
        return val;
      }
    case "regex":
      if (pattern) {
        try {
          let regex = regexCache.get(pattern);
          if (!regex) {
            regex = new RegExp(pattern);
            regexCache.set(pattern, regex);
          }
          const match = regex.exec(val);
          if (match) {
            let extracted = "";
            for (let i = 1; i < match.length; i++) {
              extracted += match[i] || "";
            }
            return extracted;
          } else {
            return "";
          }
        } catch (e) {
          logDebug("Invalid regex in transform", { pattern, error: String(e) });
          return "";
        }
      } else {
        return "";
      }
    case "regexReplace":
      if (pattern) {
        try {
          return val.replace(new RegExp(pattern, "g"), replacement || "");
        } catch (e) {
          logDebug("Invalid regex in transform", { pattern, error: String(e) });
          return val;
        }
      }
      return val;
    default:
      return val;
  }
};
function evaluateLegacyRules(legacyRules, tab) {
  if (!legacyRules || !Array.isArray(legacyRules)) {
    if (!legacyRules) return null;
  }
  const legacyRulesList = asArray(legacyRules);
  if (legacyRulesList.length === 0) return null;
  try {
    for (const rule of legacyRulesList) {
      if (!rule) continue;
      const rawValue = getFieldValue(tab, rule.field);
      const { isMatch, matchObj } = checkValueMatch(rule.operator, rawValue, rule.value);
      if (isMatch) {
        let result = rule.result;
        if (matchObj) {
          for (let i = 1; i < matchObj.length; i++) {
            result = result.replace(new RegExp(`\\$${i}`, "g"), matchObj[i] || "");
          }
        }
        return result;
      }
    }
  } catch (error) {
    logDebug("Error evaluating legacy rules", { error: String(error) });
  }
  return null;
}
var getGroupingResult = (tab, strategy) => {
  const custom = customStrategies.find((s) => s.id === strategy);
  if (custom) {
    const filterGroupsList = asArray(custom.filterGroups);
    const filtersList = asArray(custom.filters);
    let match = false;
    if (filterGroupsList.length > 0) {
      for (const group of filterGroupsList) {
        const groupRules = asArray(group);
        if (groupRules.length === 0 || groupRules.every((r) => checkCondition(r, tab))) {
          match = true;
          break;
        }
      }
    } else if (filtersList.length > 0) {
      if (filtersList.every((f) => checkCondition(f, tab))) {
        match = true;
      }
    } else {
      match = true;
    }
    if (!match) {
      return { key: null, mode: "current" };
    }
    const groupingRulesList = asArray(custom.groupingRules);
    if (groupingRulesList.length > 0) {
      const parts = [];
      const modes = [];
      try {
        for (const rule of groupingRulesList) {
          if (!rule) continue;
          let val = "";
          if (rule.source === "field") {
            const raw = getFieldValue(tab, rule.value);
            val = raw !== void 0 && raw !== null ? String(raw) : "";
          } else {
            val = rule.value;
          }
          if (val && rule.transform && rule.transform !== "none") {
            val = applyValueTransform(val, rule.transform, rule.transformPattern, rule.transformReplacement);
          }
          if (val) {
            parts.push(val);
            if (rule.windowMode) modes.push(rule.windowMode);
          }
        }
      } catch (e) {
        logDebug("Error applying grouping rules", { error: String(e) });
      }
      if (parts.length > 0) {
        return { key: parts.join(" - "), mode: resolveWindowMode(modes) };
      }
      return { key: custom.fallback || "Misc", mode: "current" };
    } else if (custom.rules) {
      const result = evaluateLegacyRules(asArray(custom.rules), tab);
      if (result) return { key: result, mode: "current" };
    }
    return { key: custom.fallback || "Misc", mode: "current" };
  }
  let simpleKey = null;
  switch (strategy) {
    case "domain":
    case "domain_full":
      simpleKey = domainFromUrl(tab.url);
      break;
    case "topic":
      simpleKey = semanticBucket(tab.title, tab.url);
      break;
    case "lineage":
      simpleKey = navigationKey(tab);
      break;
    case "context":
      simpleKey = tab.context || "Uncategorized";
      break;
    case "pinned":
      simpleKey = tab.pinned ? "pinned" : "unpinned";
      break;
    case "age":
      simpleKey = getRecencyLabel(tab.lastAccessed ?? 0);
      break;
    case "url":
      simpleKey = tab.url;
      break;
    case "title":
      simpleKey = tab.title;
      break;
    case "recency":
      simpleKey = String(tab.lastAccessed ?? 0);
      break;
    case "nesting":
      simpleKey = tab.openerTabId !== void 0 ? "child" : "root";
      break;
    default:
      const val = getFieldValue(tab, strategy);
      if (val !== void 0 && val !== null) {
        simpleKey = String(val);
      } else {
        simpleKey = "Unknown";
      }
      break;
  }
  return { key: simpleKey, mode: "current" };
};
var groupingKey = (tab, strategy) => {
  return getGroupingResult(tab, strategy).key;
};
function isContextField(field) {
  return field === "context" || field === "genre" || field === "siteName" || field.startsWith("contextData.");
}
var requiresContextAnalysis = (strategyIds) => {
  if (strategyIds.includes("context")) return true;
  const strategies = getStrategies(customStrategies);
  const activeDefs = strategies.filter((s) => strategyIds.includes(s.id));
  for (const def of activeDefs) {
    if (def.id === "context") return true;
    const custom = customStrategies.find((c) => c.id === def.id);
    if (custom) {
      const groupRulesList = asArray(custom.groupingRules);
      const sortRulesList = asArray(custom.sortingRules);
      const groupSortRulesList = asArray(custom.groupSortingRules);
      const filtersList = asArray(custom.filters);
      const filterGroupsList = asArray(custom.filterGroups);
      for (const rule of groupRulesList) {
        if (rule && rule.source === "field" && isContextField(rule.value)) return true;
        if (rule && rule.color === "field" && rule.colorField && isContextField(rule.colorField)) return true;
      }
      for (const rule of sortRulesList) {
        if (rule && isContextField(rule.field)) return true;
      }
      for (const rule of groupSortRulesList) {
        if (rule && isContextField(rule.field)) return true;
      }
      for (const rule of filtersList) {
        if (rule && isContextField(rule.field)) return true;
      }
      for (const group of filterGroupsList) {
        const groupRules = asArray(group);
        for (const rule of groupRules) {
          if (rule && isContextField(rule.field)) return true;
        }
      }
    }
  }
  return false;
};

// src/background/sortingStrategies.ts
var hierarchyScore = (tab) => tab.openerTabId !== void 0 ? 1 : 0;
var pinnedScore = (tab) => tab.pinned ? 0 : 1;
var sortTabs = (tabs, strategies) => {
  const scoring = strategies.length ? strategies : ["pinned", "recency"];
  return [...tabs].sort((a, b) => {
    for (const strategy of scoring) {
      const diff = compareBy(strategy, a, b);
      if (diff !== 0) return diff;
    }
    return a.id - b.id;
  });
};
var compareBy = (strategy, a, b) => {
  const customStrats = getCustomStrategies();
  const custom = customStrats.find((s) => s.id === strategy);
  if (custom) {
    const sortRulesList = asArray(custom.sortingRules);
    if (sortRulesList.length > 0) {
      try {
        for (const rule of sortRulesList) {
          if (!rule) continue;
          const valA = getFieldValue(a, rule.field);
          const valB = getFieldValue(b, rule.field);
          let result = 0;
          if (valA < valB) result = -1;
          else if (valA > valB) result = 1;
          if (result !== 0) {
            return rule.order === "desc" ? -result : result;
          }
        }
      } catch (e) {
        logDebug("Error evaluating custom sorting rules", { error: String(e) });
      }
      return 0;
    }
  }
  switch (strategy) {
    case "recency":
      return (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0);
    case "nesting":
      return hierarchyScore(a) - hierarchyScore(b);
    case "pinned":
      return pinnedScore(a) - pinnedScore(b);
    case "title":
      return a.title.localeCompare(b.title);
    case "url":
      return a.url.localeCompare(b.url);
    case "context":
      return (a.context ?? "").localeCompare(b.context ?? "");
    case "domain":
    case "domain_full":
      return domainFromUrl(a.url).localeCompare(domainFromUrl(b.url));
    case "topic":
      return semanticBucket(a.title, a.url).localeCompare(semanticBucket(b.title, b.url));
    case "lineage":
      return navigationKey(a).localeCompare(navigationKey(b));
    case "age":
      return (groupingKey(a, "age") || "").localeCompare(groupingKey(b, "age") || "");
    default:
      const valA = getFieldValue(a, strategy);
      const valB = getFieldValue(b, strategy);
      if (valA !== void 0 && valB !== void 0) {
        if (valA < valB) return -1;
        if (valA > valB) return 1;
        return 0;
      }
      return (groupingKey(a, strategy) || "").localeCompare(groupingKey(b, strategy) || "");
  }
};

// src/background/extraction/logic.ts
function normalizeUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    const params = new URLSearchParams(url.search);
    const keys = [];
    params.forEach((_, key) => keys.push(key));
    const hostname = url.hostname.replace(/^www\./, "");
    const TRACKING = [/^utm_/, /^fbclid$/, /^gclid$/, /^_ga$/, /^ref$/, /^yclid$/, /^_hs/];
    const isYoutube = hostname.endsWith("youtube.com") || hostname.endsWith("youtu.be");
    const isGoogle = hostname.endsWith("google.com");
    const keep = [];
    if (isYoutube) keep.push("v", "list", "t", "c", "channel", "playlist");
    if (isGoogle) keep.push("q", "id", "sourceid");
    for (const key of keys) {
      if (TRACKING.some((r) => r.test(key))) {
        params.delete(key);
        continue;
      }
      if ((isYoutube || isGoogle) && !keep.includes(key)) {
        params.delete(key);
      }
    }
    url.search = params.toString();
    return url.toString();
  } catch (e) {
    return urlStr;
  }
}
function parseYouTubeUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    const v = url.searchParams.get("v");
    const isShorts = url.pathname.includes("/shorts/");
    let videoId = v || (isShorts ? url.pathname.split("/shorts/")[1] : null) || (url.hostname === "youtu.be" ? url.pathname.replace("/", "") : null);
    const playlistId = url.searchParams.get("list");
    const playlistIndex = parseInt(url.searchParams.get("index") || "0", 10);
    return { videoId, isShorts, playlistId, playlistIndex };
  } catch (e) {
    return { videoId: null, isShorts: false, playlistId: null, playlistIndex: null };
  }
}
function extractAuthor(entity) {
  if (!entity || !entity.author) return null;
  if (typeof entity.author === "string") return entity.author;
  if (Array.isArray(entity.author)) return entity.author[0]?.name || null;
  if (typeof entity.author === "object") return entity.author.name || null;
  return null;
}
function extractKeywords(entity) {
  if (!entity || !entity.keywords) return [];
  if (typeof entity.keywords === "string") {
    return entity.keywords.split(",").map((s) => s.trim());
  }
  if (Array.isArray(entity.keywords)) return entity.keywords;
  return [];
}
function extractBreadcrumbs(jsonLd) {
  const breadcrumbLd = jsonLd.find((i) => i && i["@type"] === "BreadcrumbList");
  if (!breadcrumbLd || !Array.isArray(breadcrumbLd.itemListElement)) return [];
  const list = breadcrumbLd.itemListElement.sort((a, b) => (a.position || 0) - (b.position || 0));
  const breadcrumbs = [];
  list.forEach((item) => {
    if (item.name) breadcrumbs.push(item.name);
    else if (item.item && item.item.name) breadcrumbs.push(item.item.name);
  });
  return breadcrumbs;
}
function extractJsonLdFields(jsonLd) {
  const mainEntity = jsonLd.find((i) => i && (i["@type"] === "Article" || i["@type"] === "VideoObject" || i["@type"] === "NewsArticle")) || jsonLd[0];
  let author = null;
  let publishedAt = null;
  let modifiedAt = null;
  let tags = [];
  if (mainEntity) {
    author = extractAuthor(mainEntity);
    publishedAt = mainEntity.datePublished || null;
    modifiedAt = mainEntity.dateModified || null;
    tags = extractKeywords(mainEntity);
  }
  const breadcrumbs = extractBreadcrumbs(jsonLd);
  return { author, publishedAt, modifiedAt, tags, breadcrumbs };
}
function extractYouTubeChannelFromHtml(html) {
  const scriptRegex = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const json = JSON.parse(match[1]);
      const array = Array.isArray(json) ? json : [json];
      const fields = extractJsonLdFields(array);
      if (fields.author) return fields.author;
    } catch (e) {
    }
  }
  const linkNameRegex = /<link\s+itemprop=["']name["']\s+content=["']([^"']+)["']\s*\/?>/i;
  const linkMatch = linkNameRegex.exec(html);
  if (linkMatch && linkMatch[1]) return decodeHtmlEntities(linkMatch[1]);
  const metaAuthorRegex = /<meta\s+name=["']author["']\s+content=["']([^"']+)["']\s*\/?>/i;
  const metaMatch = metaAuthorRegex.exec(html);
  if (metaMatch && metaMatch[1]) {
    return decodeHtmlEntities(metaMatch[1]);
  }
  return null;
}
function extractYouTubeGenreFromHtml(html) {
  const metaGenreRegex = /<meta\s+itemprop=["']genre["']\s+content=["']([^"']+)["']\s*\/?>/i;
  const metaMatch = metaGenreRegex.exec(html);
  if (metaMatch && metaMatch[1]) {
    return decodeHtmlEntities(metaMatch[1]);
  }
  const categoryRegex = /"category"\s*:\s*"([^"]+)"/;
  const catMatch = categoryRegex.exec(html);
  if (catMatch && catMatch[1]) {
    return decodeHtmlEntities(catMatch[1]);
  }
  return null;
}
function decodeHtmlEntities(text) {
  if (!text) return text;
  const entities = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " "
  };
  return text.replace(/&([a-z0-9]+|#[0-9]{1,6}|#x[0-9a-fA-F]{1,6});/ig, (match) => {
    const lower = match.toLowerCase();
    if (entities[lower]) return entities[lower];
    if (entities[match]) return entities[match];
    if (lower.startsWith("&#x")) {
      try {
        return String.fromCharCode(parseInt(lower.slice(3, -1), 16));
      } catch {
        return match;
      }
    }
    if (lower.startsWith("&#")) {
      try {
        return String.fromCharCode(parseInt(lower.slice(2, -1), 10));
      } catch {
        return match;
      }
    }
    return match;
  });
}

// src/background/extraction/generaRegistry.ts
var GENERA_REGISTRY = {
  // Search
  "google.com": "Search",
  "bing.com": "Search",
  "duckduckgo.com": "Search",
  "yahoo.com": "Search",
  "baidu.com": "Search",
  "yandex.com": "Search",
  "kagi.com": "Search",
  "ecosia.org": "Search",
  // Social
  "facebook.com": "Social",
  "twitter.com": "Social",
  "x.com": "Social",
  "instagram.com": "Social",
  "linkedin.com": "Social",
  "reddit.com": "Social",
  "tiktok.com": "Social",
  "pinterest.com": "Social",
  "snapchat.com": "Social",
  "tumblr.com": "Social",
  "threads.net": "Social",
  "bluesky.app": "Social",
  "mastodon.social": "Social",
  // Video
  "youtube.com": "Video",
  "youtu.be": "Video",
  "vimeo.com": "Video",
  "twitch.tv": "Video",
  "netflix.com": "Video",
  "hulu.com": "Video",
  "disneyplus.com": "Video",
  "dailymotion.com": "Video",
  "primevideo.com": "Video",
  "hbomax.com": "Video",
  "max.com": "Video",
  "peacocktv.com": "Video",
  // Development
  "github.com": "Development",
  "gitlab.com": "Development",
  "stackoverflow.com": "Development",
  "npmjs.com": "Development",
  "pypi.org": "Development",
  "developer.mozilla.org": "Development",
  "w3schools.com": "Development",
  "geeksforgeeks.org": "Development",
  "jira.com": "Development",
  "atlassian.net": "Development",
  // often jira
  "bitbucket.org": "Development",
  "dev.to": "Development",
  "hashnode.com": "Development",
  "medium.com": "Development",
  // General but often dev
  "vercel.com": "Development",
  "netlify.com": "Development",
  "heroku.com": "Development",
  "aws.amazon.com": "Development",
  "console.aws.amazon.com": "Development",
  "cloud.google.com": "Development",
  "azure.microsoft.com": "Development",
  "portal.azure.com": "Development",
  "docker.com": "Development",
  "kubernetes.io": "Development",
  // News
  "cnn.com": "News",
  "bbc.com": "News",
  "nytimes.com": "News",
  "washingtonpost.com": "News",
  "theguardian.com": "News",
  "forbes.com": "News",
  "bloomberg.com": "News",
  "reuters.com": "News",
  "wsj.com": "News",
  "cnbc.com": "News",
  "huffpost.com": "News",
  "news.google.com": "News",
  "foxnews.com": "News",
  "nbcnews.com": "News",
  "abcnews.go.com": "News",
  "usatoday.com": "News",
  // Shopping
  "amazon.com": "Shopping",
  "ebay.com": "Shopping",
  "walmart.com": "Shopping",
  "etsy.com": "Shopping",
  "target.com": "Shopping",
  "bestbuy.com": "Shopping",
  "aliexpress.com": "Shopping",
  "shopify.com": "Shopping",
  "temu.com": "Shopping",
  "shein.com": "Shopping",
  "wayfair.com": "Shopping",
  "costco.com": "Shopping",
  // Communication
  "mail.google.com": "Communication",
  "outlook.live.com": "Communication",
  "slack.com": "Communication",
  "discord.com": "Communication",
  "zoom.us": "Communication",
  "teams.microsoft.com": "Communication",
  "whatsapp.com": "Communication",
  "telegram.org": "Communication",
  "messenger.com": "Communication",
  "skype.com": "Communication",
  // Finance
  "paypal.com": "Finance",
  "chase.com": "Finance",
  "bankofamerica.com": "Finance",
  "wellsfargo.com": "Finance",
  "americanexpress.com": "Finance",
  "stripe.com": "Finance",
  "coinbase.com": "Finance",
  "binance.com": "Finance",
  "kraken.com": "Finance",
  "robinhood.com": "Finance",
  "fidelity.com": "Finance",
  "vanguard.com": "Finance",
  "schwab.com": "Finance",
  "mint.intuit.com": "Finance",
  // Education
  "wikipedia.org": "Education",
  "coursera.org": "Education",
  "udemy.com": "Education",
  "edx.org": "Education",
  "khanacademy.org": "Education",
  "quizlet.com": "Education",
  "duolingo.com": "Education",
  "canvas.instructure.com": "Education",
  "blackboard.com": "Education",
  "mit.edu": "Education",
  "harvard.edu": "Education",
  "stanford.edu": "Education",
  "academia.edu": "Education",
  "researchgate.net": "Education",
  // Design
  "figma.com": "Design",
  "canva.com": "Design",
  "behance.net": "Design",
  "dribbble.com": "Design",
  "adobe.com": "Design",
  "unsplash.com": "Design",
  "pexels.com": "Design",
  "pixabay.com": "Design",
  "shutterstock.com": "Design",
  // Productivity
  "docs.google.com": "Productivity",
  "sheets.google.com": "Productivity",
  "slides.google.com": "Productivity",
  "drive.google.com": "Productivity",
  "notion.so": "Productivity",
  "trello.com": "Productivity",
  "asana.com": "Productivity",
  "monday.com": "Productivity",
  "airtable.com": "Productivity",
  "evernote.com": "Productivity",
  "dropbox.com": "Productivity",
  "clickup.com": "Productivity",
  "linear.app": "Productivity",
  "miro.com": "Productivity",
  "lucidchart.com": "Productivity",
  // AI
  "openai.com": "AI",
  "chatgpt.com": "AI",
  "anthropic.com": "AI",
  "midjourney.com": "AI",
  "huggingface.co": "AI",
  "bard.google.com": "AI",
  "gemini.google.com": "AI",
  "claude.ai": "AI",
  "perplexity.ai": "AI",
  "poe.com": "AI",
  // Music/Audio
  "spotify.com": "Music",
  "soundcloud.com": "Music",
  "music.apple.com": "Music",
  "pandora.com": "Music",
  "tidal.com": "Music",
  "bandcamp.com": "Music",
  "audible.com": "Music",
  // Gaming
  "steampowered.com": "Gaming",
  "roblox.com": "Gaming",
  "epicgames.com": "Gaming",
  "xbox.com": "Gaming",
  "playstation.com": "Gaming",
  "nintendo.com": "Gaming",
  "ign.com": "Gaming",
  "gamespot.com": "Gaming",
  "kotaku.com": "Gaming",
  "polygon.com": "Gaming"
};
function getGenera(hostname, customRegistry) {
  if (!hostname) return null;
  if (customRegistry) {
    const parts2 = hostname.split(".");
    for (let i = 0; i < parts2.length - 1; i++) {
      const domain = parts2.slice(i).join(".");
      if (customRegistry[domain]) {
        return customRegistry[domain];
      }
    }
  }
  if (GENERA_REGISTRY[hostname]) {
    return GENERA_REGISTRY[hostname];
  }
  const parts = hostname.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const domain = parts.slice(i).join(".");
    if (GENERA_REGISTRY[domain]) {
      return GENERA_REGISTRY[domain];
    }
  }
  return null;
}

// src/background/storage.ts
var getStoredValue = async (key) => {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (items) => {
      resolve(items[key] ?? null);
    });
  });
};
var setStoredValue = async (key, value) => {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => resolve());
  });
};

// src/background/preferences.ts
var PREFERENCES_KEY = "preferences";
var defaultPreferences = {
  sorting: ["pinned", "recency"],
  debug: false,
  logLevel: "info",
  theme: "dark",
  customGenera: {}
};
var normalizeSorting = (sorting) => {
  if (Array.isArray(sorting)) {
    return sorting.filter((value) => typeof value === "string");
  }
  if (typeof sorting === "string") {
    return [sorting];
  }
  return [...defaultPreferences.sorting];
};
var normalizeStrategies = (strategies) => {
  const arr = asArray(strategies).filter((s) => typeof s === "object" && s !== null);
  return arr.map((s) => ({
    ...s,
    groupingRules: asArray(s.groupingRules),
    sortingRules: asArray(s.sortingRules),
    groupSortingRules: s.groupSortingRules ? asArray(s.groupSortingRules) : void 0,
    filters: s.filters ? asArray(s.filters) : void 0,
    filterGroups: s.filterGroups ? asArray(s.filterGroups).map((g) => asArray(g)) : void 0,
    rules: s.rules ? asArray(s.rules) : void 0
  }));
};
var normalizePreferences = (prefs) => {
  const merged = { ...defaultPreferences, ...prefs ?? {} };
  return {
    ...merged,
    sorting: normalizeSorting(merged.sorting),
    customStrategies: normalizeStrategies(merged.customStrategies)
  };
};
var loadPreferences = async () => {
  const stored = await getStoredValue(PREFERENCES_KEY);
  const merged = normalizePreferences(stored ?? void 0);
  setLoggerPreferences(merged);
  return merged;
};
var savePreferences = async (prefs) => {
  logDebug("Updating preferences", { keys: Object.keys(prefs) });
  const current = await loadPreferences();
  const merged = normalizePreferences({ ...current, ...prefs });
  await setStoredValue(PREFERENCES_KEY, merged);
  setLoggerPreferences(merged);
  return merged;
};

// node_modules/yocto-queue/index.js
var Node = class {
  constructor(value) {
    __publicField(this, "value");
    __publicField(this, "next");
    this.value = value;
  }
};
var _head, _tail, _size;
var Queue = class {
  constructor() {
    __privateAdd(this, _head);
    __privateAdd(this, _tail);
    __privateAdd(this, _size);
    this.clear();
  }
  enqueue(value) {
    const node = new Node(value);
    if (__privateGet(this, _head)) {
      __privateGet(this, _tail).next = node;
      __privateSet(this, _tail, node);
    } else {
      __privateSet(this, _head, node);
      __privateSet(this, _tail, node);
    }
    __privateWrapper(this, _size)._++;
  }
  dequeue() {
    const current = __privateGet(this, _head);
    if (!current) {
      return;
    }
    __privateSet(this, _head, __privateGet(this, _head).next);
    __privateWrapper(this, _size)._--;
    if (!__privateGet(this, _head)) {
      __privateSet(this, _tail, void 0);
    }
    return current.value;
  }
  peek() {
    if (!__privateGet(this, _head)) {
      return;
    }
    return __privateGet(this, _head).value;
  }
  clear() {
    __privateSet(this, _head, void 0);
    __privateSet(this, _tail, void 0);
    __privateSet(this, _size, 0);
  }
  get size() {
    return __privateGet(this, _size);
  }
  *[Symbol.iterator]() {
    let current = __privateGet(this, _head);
    while (current) {
      yield current.value;
      current = current.next;
    }
  }
  *drain() {
    while (__privateGet(this, _head)) {
      yield this.dequeue();
    }
  }
};
_head = new WeakMap();
_tail = new WeakMap();
_size = new WeakMap();

// node_modules/p-limit/index.js
function pLimit(concurrency) {
  let rejectOnClear = false;
  if (typeof concurrency === "object") {
    ({ concurrency, rejectOnClear = false } = concurrency);
  }
  validateConcurrency(concurrency);
  if (typeof rejectOnClear !== "boolean") {
    throw new TypeError("Expected `rejectOnClear` to be a boolean");
  }
  const queue = new Queue();
  let activeCount = 0;
  const resumeNext = () => {
    if (activeCount < concurrency && queue.size > 0) {
      activeCount++;
      queue.dequeue().run();
    }
  };
  const next = () => {
    activeCount--;
    resumeNext();
  };
  const run = async (function_, resolve, arguments_) => {
    const result = (async () => function_(...arguments_))();
    resolve(result);
    try {
      await result;
    } catch {
    }
    next();
  };
  const enqueue = (function_, resolve, reject, arguments_) => {
    const queueItem = { reject };
    new Promise((internalResolve) => {
      queueItem.run = internalResolve;
      queue.enqueue(queueItem);
    }).then(run.bind(void 0, function_, resolve, arguments_));
    if (activeCount < concurrency) {
      resumeNext();
    }
  };
  const generator = (function_, ...arguments_) => new Promise((resolve, reject) => {
    enqueue(function_, resolve, reject, arguments_);
  });
  Object.defineProperties(generator, {
    activeCount: {
      get: () => activeCount
    },
    pendingCount: {
      get: () => queue.size
    },
    clearQueue: {
      value() {
        if (!rejectOnClear) {
          queue.clear();
          return;
        }
        const abortError = AbortSignal.abort().reason;
        while (queue.size > 0) {
          queue.dequeue().reject(abortError);
        }
      }
    },
    concurrency: {
      get: () => concurrency,
      set(newConcurrency) {
        validateConcurrency(newConcurrency);
        concurrency = newConcurrency;
        queueMicrotask(() => {
          while (activeCount < concurrency && queue.size > 0) {
            resumeNext();
          }
        });
      }
    },
    map: {
      async value(iterable, function_) {
        const promises = Array.from(iterable, (value, index) => this(function_, value, index));
        return Promise.all(promises);
      }
    }
  });
  return generator;
}
function validateConcurrency(concurrency) {
  if (!((Number.isInteger(concurrency) || concurrency === Number.POSITIVE_INFINITY) && concurrency > 0)) {
    throw new TypeError("Expected `concurrency` to be a number from 1 and up");
  }
}

// src/background/extraction/index.ts
var MAX_CONCURRENT_FETCHES = 5;
var limit = pLimit(MAX_CONCURRENT_FETCHES);
var fetchWithTimeout = async (url, timeout = 2e3) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(id);
  }
};
var extractPageContext = async (tab) => {
  try {
    if (!tab || !tab.url) {
      return { data: null, error: "Tab not found or no URL", status: "NO_RESPONSE" };
    }
    if (tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:") || tab.url.startsWith("chrome-extension://") || tab.url.startsWith("chrome-error://")) {
      return { data: null, error: "Restricted URL scheme", status: "RESTRICTED" };
    }
    const prefs = await loadPreferences();
    let baseline = buildBaselineContext(tab, prefs.customGenera);
    const targetUrl = tab.url;
    const urlObj = new URL(targetUrl);
    const hostname = urlObj.hostname.replace(/^www\./, "");
    if ((hostname.endsWith("youtube.com") || hostname.endsWith("youtu.be")) && (!baseline.authorOrCreator || baseline.genre === "Video")) {
      try {
        await limit(async () => {
          const response = await fetchWithTimeout(targetUrl);
          if (response.ok) {
            const html = await response.text();
            const channel = extractYouTubeChannelFromHtml(html);
            if (channel) {
              baseline.authorOrCreator = channel;
            }
            const genre = extractYouTubeGenreFromHtml(html);
            if (genre) {
              baseline.genre = genre;
            }
          }
        });
      } catch (fetchErr) {
        logDebug("Failed to fetch YouTube page content", { error: String(fetchErr) });
      }
    }
    return {
      data: baseline,
      status: "OK"
    };
  } catch (e) {
    logDebug(`Extraction failed for tab ${tab?.id}`, { error: String(e) });
    return {
      data: null,
      error: String(e),
      status: "INJECTION_FAILED"
    };
  }
};
var buildBaselineContext = (tab, customGenera) => {
  const url = tab.url || "";
  let hostname = "";
  try {
    hostname = new URL(url).hostname.replace(/^www\./, "");
  } catch (e) {
    hostname = "";
  }
  let objectType = "unknown";
  let authorOrCreator = null;
  if (url.includes("/login") || url.includes("/signin")) {
    objectType = "login";
  } else if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) {
    const { videoId } = parseYouTubeUrl(url);
    if (videoId) objectType = "video";
    if (url.includes("/@")) {
      const parts = url.split("/@");
      if (parts.length > 1) {
        const handle = parts[1].split("/")[0];
        authorOrCreator = "@" + handle;
      }
    } else if (url.includes("/c/")) {
      const parts = url.split("/c/");
      if (parts.length > 1) {
        authorOrCreator = decodeURIComponent(parts[1].split("/")[0]);
      }
    } else if (url.includes("/user/")) {
      const parts = url.split("/user/");
      if (parts.length > 1) {
        authorOrCreator = decodeURIComponent(parts[1].split("/")[0]);
      }
    }
  } else if (hostname === "github.com" && url.includes("/pull/")) {
    objectType = "ticket";
  } else if (hostname === "github.com" && !url.includes("/pull/") && url.split("/").length >= 5) {
    objectType = "repo";
  }
  let genre;
  if (objectType === "video") genre = "Video";
  else if (objectType === "repo" || objectType === "ticket") genre = "Development";
  if (!genre) {
    genre = getGenera(hostname, customGenera) || void 0;
  }
  return {
    canonicalUrl: url || null,
    normalizedUrl: normalizeUrl(url),
    siteName: hostname || null,
    platform: hostname || null,
    objectType,
    objectId: url || null,
    title: tab.title || null,
    genre,
    description: null,
    authorOrCreator,
    publishedAt: null,
    modifiedAt: null,
    language: null,
    tags: [],
    breadcrumbs: [],
    isAudible: false,
    isMuted: false,
    isCapturing: false,
    progress: null,
    hasUnsavedChangesLikely: false,
    isAuthenticatedLikely: false,
    sources: {
      canonicalUrl: "url",
      normalizedUrl: "url",
      siteName: "url",
      platform: "url",
      objectType: "url",
      title: tab.title ? "tab" : "url",
      genre: "registry"
    },
    confidence: {}
  };
};

// src/background/categoryRules.ts
var CATEGORY_DEFINITIONS = [
  {
    category: "Development",
    rules: ["github", "stackoverflow", "localhost", "jira", "gitlab"]
  },
  {
    category: "Work",
    rules: [
      ["google", "docs"],
      ["google", "sheets"],
      ["google", "slides"],
      "linkedin",
      "slack",
      "zoom",
      "teams"
    ]
  },
  {
    category: "Entertainment",
    rules: ["netflix", "spotify", "hulu", "disney", "youtube"]
  },
  {
    category: "Social",
    rules: ["twitter", "facebook", "instagram", "reddit", "tiktok", "pinterest"]
  },
  {
    category: "Shopping",
    rules: ["amazon", "ebay", "walmart", "target", "shopify"]
  },
  {
    category: "News",
    rules: ["cnn", "bbc", "nytimes", "washingtonpost", "foxnews"]
  },
  {
    category: "Education",
    rules: ["coursera", "udemy", "edx", "khanacademy", "canvas"]
  },
  {
    category: "Travel",
    rules: ["expedia", "booking", "airbnb", "tripadvisor", "kayak"]
  },
  {
    category: "Health",
    rules: ["webmd", "mayoclinic", "nih.gov", "health"]
  },
  {
    category: "Sports",
    rules: ["espn", "nba", "nfl", "mlb", "fifa"]
  },
  {
    category: "Technology",
    rules: ["techcrunch", "wired", "theverge", "arstechnica"]
  },
  {
    category: "Science",
    rules: ["science", "nature.com", "nasa.gov"]
  },
  {
    category: "Gaming",
    rules: ["twitch", "steam", "roblox", "ign", "gamespot"]
  },
  {
    category: "Music",
    rules: ["soundcloud", "bandcamp", "last.fm"]
  },
  {
    category: "Art",
    rules: ["deviantart", "behance", "dribbble", "artstation"]
  }
];
var getCategoryFromUrl = (url) => {
  const lowerUrl = url.toLowerCase();
  for (const def of CATEGORY_DEFINITIONS) {
    for (const rule of def.rules) {
      if (Array.isArray(rule)) {
        if (rule.every((part) => lowerUrl.includes(part))) {
          return def.category;
        }
      } else {
        if (lowerUrl.includes(rule)) {
          return def.category;
        }
      }
    }
  }
  return "Uncategorized";
};

// src/background/contextAnalysis.ts
var contextCache = /* @__PURE__ */ new Map();
var CACHE_TTL_SUCCESS = 24 * 60 * 60 * 1e3;
var CACHE_TTL_ERROR = 5 * 60 * 1e3;
var analyzeTabContext = async (tabs, onProgress) => {
  const contextMap = /* @__PURE__ */ new Map();
  let completed = 0;
  const total = tabs.length;
  const promises = tabs.map(async (tab) => {
    try {
      const cacheKey = `${tab.id}::${tab.url}`;
      const cached = contextCache.get(cacheKey);
      if (cached) {
        const isError = cached.result.status === "ERROR" || !!cached.result.error;
        const ttl = isError ? CACHE_TTL_ERROR : CACHE_TTL_SUCCESS;
        if (Date.now() - cached.timestamp < ttl) {
          contextMap.set(tab.id, cached.result);
          return;
        } else {
          contextCache.delete(cacheKey);
        }
      }
      const result = await fetchContextForTab(tab);
      contextCache.set(cacheKey, {
        result,
        timestamp: Date.now()
      });
      contextMap.set(tab.id, result);
    } catch (error) {
      logError(`Failed to analyze context for tab ${tab.id}`, { error: String(error) });
      contextMap.set(tab.id, { context: "Uncategorized", source: "Heuristic", error: String(error), status: "ERROR" });
    } finally {
      completed++;
      if (onProgress) onProgress(completed, total);
    }
  });
  await Promise.all(promises);
  return contextMap;
};
var fetchContextForTab = async (tab) => {
  let data = null;
  let error;
  let status;
  try {
    const extraction = await extractPageContext(tab);
    data = extraction.data;
    error = extraction.error;
    status = extraction.status;
  } catch (e) {
    logDebug(`Extraction failed for tab ${tab.id}`, { error: String(e) });
    error = String(e);
    status = "ERROR";
  }
  let context = "Uncategorized";
  let source = "Heuristic";
  if (data) {
    if (data.platform === "YouTube" || data.platform === "Netflix" || data.platform === "Spotify" || data.platform === "Twitch") {
      context = "Entertainment";
      source = "Extraction";
    } else if (data.platform === "GitHub" || data.platform === "Stack Overflow" || data.platform === "Jira" || data.platform === "GitLab") {
      context = "Development";
      source = "Extraction";
    } else if (data.platform === "Google" && (data.normalizedUrl.includes("docs") || data.normalizedUrl.includes("sheets") || data.normalizedUrl.includes("slides"))) {
      context = "Work";
      source = "Extraction";
    } else {
      if (data.objectType && data.objectType !== "unknown") {
        if (data.objectType === "video") context = "Entertainment";
        else if (data.objectType === "article") context = "News";
        else context = data.objectType.charAt(0).toUpperCase() + data.objectType.slice(1);
      } else {
        context = "General Web";
      }
      source = "Extraction";
    }
  }
  if (context === "Uncategorized") {
    const h = await localHeuristic(tab);
    if (h.context !== "Uncategorized") {
      context = h.context;
    }
  }
  if (context !== "Uncategorized" && source !== "Extraction") {
    error = void 0;
    status = void 0;
  }
  return { context, source, data: data || void 0, error, status };
};
var localHeuristic = async (tab) => {
  const context = getCategoryFromUrl(tab.url);
  return { context, source: "Heuristic" };
};

// src/background/tabManager.ts
var getTabsForFilter = async (filter) => {
  const windowIds = filter?.windowIds;
  const tabIds = filter?.tabIds;
  const hasWindowIds = windowIds && windowIds.length > 0;
  const hasTabIds = tabIds && tabIds.length > 0;
  if (!filter || !hasWindowIds && !hasTabIds) {
    return chrome.tabs.query({});
  }
  const promises = [];
  if (hasWindowIds) {
    windowIds.forEach((windowId) => {
      promises.push(chrome.tabs.query({ windowId }).catch(() => []));
    });
  }
  if (hasTabIds) {
    tabIds.forEach((tabId) => {
      promises.push(chrome.tabs.get(tabId).catch(() => null));
    });
  }
  const results = await Promise.all(promises);
  const allTabs = [];
  for (const res of results) {
    if (Array.isArray(res)) {
      allTabs.push(...res);
    } else if (res) {
      allTabs.push(res);
    }
  }
  const uniqueTabs = /* @__PURE__ */ new Map();
  for (const tab of allTabs) {
    if (tab.id !== void 0) {
      uniqueTabs.set(tab.id, tab);
    }
  }
  return Array.from(uniqueTabs.values());
};
var fetchCurrentTabGroups = async (preferences, onProgress) => {
  try {
    const tabs = await chrome.tabs.query({});
    const groups = await chrome.tabGroups.query({});
    const groupMap = new Map(groups.map((g) => [g.id, g]));
    const mapped = tabs.map(mapChromeTab).filter((t) => Boolean(t));
    if (requiresContextAnalysis(preferences.sorting)) {
      const contextMap = await analyzeTabContext(mapped, onProgress);
      mapped.forEach((tab) => {
        const res = contextMap.get(tab.id);
        tab.context = res?.context;
        tab.contextData = res?.data;
      });
    }
    const resultGroups = [];
    const tabsByGroupId = /* @__PURE__ */ new Map();
    const tabsByWindowUngrouped = /* @__PURE__ */ new Map();
    mapped.forEach((tab) => {
      const groupId = tab.groupId ?? -1;
      if (groupId !== -1) {
        if (!tabsByGroupId.has(groupId)) tabsByGroupId.set(groupId, []);
        tabsByGroupId.get(groupId).push(tab);
      } else {
        if (!tabsByWindowUngrouped.has(tab.windowId)) tabsByWindowUngrouped.set(tab.windowId, []);
        tabsByWindowUngrouped.get(tab.windowId).push(tab);
      }
    });
    for (const [groupId, groupTabs2] of tabsByGroupId) {
      const browserGroup = groupMap.get(groupId);
      if (browserGroup) {
        resultGroups.push({
          id: `group-${groupId}`,
          windowId: browserGroup.windowId,
          label: browserGroup.title || "Untitled Group",
          color: browserGroup.color,
          tabs: sortTabs(groupTabs2, preferences.sorting),
          reason: "Manual"
        });
      }
    }
    for (const [windowId, tabs2] of tabsByWindowUngrouped) {
      resultGroups.push({
        id: `ungrouped-${windowId}`,
        windowId,
        label: "Ungrouped",
        color: "grey",
        tabs: sortTabs(tabs2, preferences.sorting),
        reason: "Ungrouped"
      });
    }
    logInfo("Fetched current tab groups", { groups: resultGroups.length, tabs: mapped.length });
    return resultGroups;
  } catch (e) {
    logError("Error in fetchCurrentTabGroups", { error: String(e) });
    throw e;
  }
};
var calculateTabGroups = async (preferences, filter, onProgress) => {
  const chromeTabs = await getTabsForFilter(filter);
  const windowIdSet = new Set(filter?.windowIds ?? []);
  const tabIdSet = new Set(filter?.tabIds ?? []);
  const hasFilters = windowIdSet.size > 0 || tabIdSet.size > 0;
  const filteredTabs = chromeTabs.filter((tab) => {
    if (!hasFilters) return true;
    return tab.windowId && windowIdSet.has(tab.windowId) || tab.id && tabIdSet.has(tab.id);
  });
  const mapped = filteredTabs.map(mapChromeTab).filter((tab) => Boolean(tab));
  if (requiresContextAnalysis(preferences.sorting)) {
    const contextMap = await analyzeTabContext(mapped, onProgress);
    mapped.forEach((tab) => {
      const res = contextMap.get(tab.id);
      tab.context = res?.context;
      tab.contextData = res?.data;
    });
  }
  const grouped = groupTabs(mapped, preferences.sorting);
  grouped.forEach((group) => {
    group.tabs = sortTabs(group.tabs, preferences.sorting);
  });
  logInfo("Calculated tab groups", { groups: grouped.length, tabs: mapped.length });
  return grouped;
};
var VALID_COLORS = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];
var applyTabGroups = async (groups) => {
  const claimedGroupIds = /* @__PURE__ */ new Set();
  for (const group of groups) {
    let tabsToProcess = [];
    if (group.windowMode === "new") {
      if (group.tabs.length > 0) {
        try {
          const first = group.tabs[0];
          const win = await chrome.windows.create({ tabId: first.id });
          const winId = win.id;
          const others = group.tabs.slice(1).map((t) => t.id);
          if (others.length > 0) {
            await chrome.tabs.move(others, { windowId: winId, index: -1 });
          }
          tabsToProcess.push({ windowId: winId, tabs: group.tabs });
        } catch (e) {
          logError("Error creating new window for group", { error: String(e) });
        }
      }
    } else if (group.windowMode === "compound") {
      if (group.tabs.length > 0) {
        const counts = /* @__PURE__ */ new Map();
        group.tabs.forEach((t) => counts.set(t.windowId, (counts.get(t.windowId) || 0) + 1));
        let targetWindowId = group.tabs[0].windowId;
        let max = 0;
        for (const [wid, count] of counts) {
          if (count > max) {
            max = count;
            targetWindowId = wid;
          }
        }
        const toMove = group.tabs.filter((t) => t.windowId !== targetWindowId).map((t) => t.id);
        if (toMove.length > 0) {
          try {
            await chrome.tabs.move(toMove, { windowId: targetWindowId, index: -1 });
          } catch (e) {
            logError("Error moving tabs for compound group", { error: String(e) });
          }
        }
        tabsToProcess.push({ windowId: targetWindowId, tabs: group.tabs });
      }
    } else {
      const map = group.tabs.reduce((acc, tab) => {
        const existing = acc.get(tab.windowId) ?? [];
        existing.push(tab);
        acc.set(tab.windowId, existing);
        return acc;
      }, /* @__PURE__ */ new Map());
      for (const [wid, t] of map) {
        tabsToProcess.push({ windowId: wid, tabs: t });
      }
    }
    for (const { windowId: targetWinId, tabs } of tabsToProcess) {
      let candidateGroupId;
      const counts = /* @__PURE__ */ new Map();
      for (const t of tabs) {
        if (t.groupId && t.groupId !== -1 && t.windowId === targetWinId) {
          counts.set(t.groupId, (counts.get(t.groupId) || 0) + 1);
        }
      }
      const sortedCandidates = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([id]) => id);
      for (const id of sortedCandidates) {
        if (!claimedGroupIds.has(id)) {
          candidateGroupId = id;
          break;
        }
      }
      if (candidateGroupId === void 0) {
        try {
          const windowGroups = await chrome.tabGroups.query({ windowId: targetWinId });
          const matchingGroup = windowGroups.find((g) => g.title === group.label && !claimedGroupIds.has(g.id));
          if (matchingGroup) {
            candidateGroupId = matchingGroup.id;
          }
        } catch (e) {
          logError("Error finding matching group by label", { error: String(e) });
        }
      }
      let finalGroupId;
      if (candidateGroupId !== void 0) {
        claimedGroupIds.add(candidateGroupId);
        finalGroupId = candidateGroupId;
        try {
          const existingTabs = await chrome.tabs.query({ groupId: finalGroupId });
          const existingTabIds = new Set(existingTabs.map((t) => t.id));
          const targetTabIds = new Set(tabs.map((t) => t.id));
          const leftovers = existingTabs.filter((t) => t.id !== void 0 && !targetTabIds.has(t.id));
          if (leftovers.length > 0) {
            await chrome.tabs.ungroup(leftovers.map((t) => t.id));
          }
          const tabsToAdd = tabs.filter((t) => !existingTabIds.has(t.id));
          if (tabsToAdd.length > 0) {
            await chrome.tabs.group({ groupId: finalGroupId, tabIds: tabsToAdd.map((t) => t.id) });
          }
        } catch (e) {
          logError("Error managing group reuse", { error: String(e) });
        }
      } else {
        finalGroupId = await chrome.tabs.group({
          tabIds: tabs.map((t) => t.id),
          createProperties: { windowId: targetWinId }
        });
        claimedGroupIds.add(finalGroupId);
      }
      const updateProps = {
        title: group.label
      };
      if (VALID_COLORS.includes(group.color)) {
        updateProps.color = group.color;
      }
      await chrome.tabGroups.update(finalGroupId, updateProps);
    }
  }
  logInfo("Applied tab groups", { count: groups.length });
};
var applyTabSorting = async (preferences, filter, onProgress) => {
  const targetWindowIds = /* @__PURE__ */ new Set();
  let chromeTabs = [];
  const explicitWindowIds = filter?.windowIds ?? [];
  const explicitTabIds = filter?.tabIds ?? [];
  const hasFilter = explicitWindowIds.length > 0 || explicitTabIds.length > 0;
  if (!hasFilter) {
    chromeTabs = await chrome.tabs.query({});
    chromeTabs.forEach((t) => {
      if (t.windowId) targetWindowIds.add(t.windowId);
    });
  } else {
    explicitWindowIds.forEach((id) => targetWindowIds.add(id));
    if (explicitTabIds.length > 0) {
      const specificTabs = await Promise.all(explicitTabIds.map((id) => chrome.tabs.get(id).catch(() => null)));
      specificTabs.forEach((t) => {
        if (t && t.windowId) targetWindowIds.add(t.windowId);
      });
    }
    const windowPromises = Array.from(targetWindowIds).map(
      (windowId) => chrome.tabs.query({ windowId }).catch(() => [])
    );
    const results = await Promise.all(windowPromises);
    chromeTabs = results.flat();
  }
  for (const windowId of targetWindowIds) {
    const windowTabs = chromeTabs.filter((t) => t.windowId === windowId);
    const mapped = windowTabs.map(mapChromeTab).filter((t) => Boolean(t));
    if (requiresContextAnalysis(preferences.sorting)) {
      const contextMap = await analyzeTabContext(mapped, onProgress);
      mapped.forEach((tab) => {
        const res = contextMap.get(tab.id);
        tab.context = res?.context;
        tab.contextData = res?.data;
      });
    }
    const tabsByGroup = /* @__PURE__ */ new Map();
    const ungroupedTabs = [];
    mapped.forEach((tab) => {
      const groupId = tab.groupId ?? -1;
      if (groupId !== -1) {
        const group = tabsByGroup.get(groupId) ?? [];
        group.push(tab);
        tabsByGroup.set(groupId, group);
      } else {
        ungroupedTabs.push(tab);
      }
    });
    for (const [groupId, tabs] of tabsByGroup) {
      const groupTabIndices = windowTabs.filter((t) => t.groupId === groupId).map((t) => t.index).sort((a, b) => a - b);
      const startIndex = groupTabIndices[0] ?? 0;
      const sortedGroupTabs = sortTabs(tabs, preferences.sorting);
      const sortedIds = sortedGroupTabs.map((t) => t.id);
      if (sortedIds.length > 0) {
        await chrome.tabs.move(sortedIds, { index: startIndex });
      }
    }
    if (ungroupedTabs.length > 0) {
      const sortedUngrouped = sortTabs(ungroupedTabs, preferences.sorting);
      const sortedIds = sortedUngrouped.map((t) => t.id);
      await chrome.tabs.move(sortedIds, { index: 0 });
    }
    await sortGroupsIfEnabled(windowId, preferences.sorting, tabsByGroup);
  }
  logInfo("Applied tab sorting");
};
var compareBySortingRules = (sortingRulesArg, a, b) => {
  const sortRulesList = asArray(sortingRulesArg);
  if (sortRulesList.length === 0) return 0;
  try {
    for (const rule of sortRulesList) {
      if (!rule) continue;
      const valA = getFieldValue(a, rule.field);
      const valB = getFieldValue(b, rule.field);
      let result = 0;
      if (valA < valB) result = -1;
      else if (valA > valB) result = 1;
      if (result !== 0) {
        return rule.order === "desc" ? -result : result;
      }
    }
  } catch (error) {
    logError("Error evaluating sorting rules", { error: String(error) });
  }
  return 0;
};
var sortGroupsIfEnabled = async (windowId, sortingPreferences, tabsByGroup) => {
  const customStrats = getCustomStrategies();
  let groupSorterStrategy = null;
  for (const id of sortingPreferences) {
    const strategy = customStrats.find((s) => s.id === id);
    if (strategy && (strategy.sortGroups || strategy.groupSortingRules && strategy.groupSortingRules.length > 0)) {
      groupSorterStrategy = strategy;
      break;
    }
  }
  if (!groupSorterStrategy) return;
  const groups = await chrome.tabGroups.query({ windowId });
  if (groups.length <= 1) return;
  const groupReps = [];
  for (const group of groups) {
    const tabs = tabsByGroup.get(group.id);
    if (tabs && tabs.length > 0) {
      groupReps.push({ group, rep: tabs[0] });
    }
  }
  if (groupSorterStrategy.groupSortingRules && Array.isArray(groupSorterStrategy.groupSortingRules) && groupSorterStrategy.groupSortingRules.length > 0) {
    groupReps.sort((a, b) => compareBySortingRules(groupSorterStrategy.groupSortingRules, a.rep, b.rep));
  } else {
    groupReps.sort((a, b) => compareBy(groupSorterStrategy.id, a.rep, b.rep));
  }
  for (const item of groupReps) {
    await chrome.tabGroups.move(item.group.id, { index: -1 });
  }
};
var getTabsByIds = async (tabIds) => {
  if (!tabIds.length) return [];
  const allTabs = await chrome.tabs.query({});
  const tabMap = new Map(allTabs.map((t) => [t.id, t]));
  return tabIds.map((id) => tabMap.get(id)).filter((t) => t !== void 0 && t.id !== void 0 && t.windowId !== void 0);
};
var mergeTabs = async (tabIds) => {
  if (!tabIds.length) return;
  const validTabs = await getTabsByIds(tabIds);
  if (validTabs.length === 0) return;
  const targetWindowId = validTabs[0].windowId;
  const tabsToMove = validTabs.filter((t) => t.windowId !== targetWindowId);
  if (tabsToMove.length > 0) {
    const moveIds = tabsToMove.map((t) => t.id);
    await chrome.tabs.move(moveIds, { windowId: targetWindowId, index: -1 });
  }
  const firstTabGroupId = validTabs[0].groupId;
  let targetGroupId;
  if (firstTabGroupId && firstTabGroupId !== -1) {
    targetGroupId = firstTabGroupId;
  } else {
    const otherGroup = validTabs.find((t) => t.windowId === targetWindowId && t.groupId !== -1);
    if (otherGroup) {
      targetGroupId = otherGroup.groupId;
    }
  }
  const ids = validTabs.map((t) => t.id);
  await chrome.tabs.group({ tabIds: ids, groupId: targetGroupId });
  logInfo("Merged tabs", { count: ids.length, targetWindowId, targetGroupId });
};
var splitTabs = async (tabIds) => {
  if (tabIds.length === 0) return;
  const validTabs = await getTabsByIds(tabIds);
  if (validTabs.length === 0) return;
  const firstTab = validTabs[0];
  const newWindow = await chrome.windows.create({ tabId: firstTab.id });
  if (validTabs.length > 1) {
    const remainingTabIds = validTabs.slice(1).map((t) => t.id);
    await chrome.tabs.move(remainingTabIds, { windowId: newWindow.id, index: -1 });
  }
  logInfo("Split tabs to new window", { count: validTabs.length, newWindowId: newWindow.id });
};

// src/background/stateManager.ts
var MAX_UNDO_STACK = 10;
var UNDO_STACK_KEY = "undoStack";
var SAVED_STATES_KEY = "savedStates";
var captureCurrentState = async () => {
  const windows = await chrome.windows.getAll({ populate: true });
  const windowStates = [];
  for (const win of windows) {
    if (!win.tabs) continue;
    const tabStates = win.tabs.map((tab) => {
      let groupTitle;
      let groupColor;
      return {
        id: tab.id,
        url: tab.url || "",
        pinned: Boolean(tab.pinned),
        groupId: tab.groupId,
        groupTitle,
        // Will need to fetch if grouped
        groupColor
      };
    });
    windowStates.push({ tabs: tabStates });
  }
  const allGroups = await chrome.tabGroups.query({});
  const groupMap = new Map(allGroups.map((g) => [g.id, g]));
  for (const win of windowStates) {
    for (const tab of win.tabs) {
      if (tab.groupId && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
        const g = groupMap.get(tab.groupId);
        if (g) {
          tab.groupTitle = g.title;
          tab.groupColor = g.color;
        }
      }
    }
  }
  return {
    timestamp: Date.now(),
    windows: windowStates
  };
};
var pushUndoState = async () => {
  const state = await captureCurrentState();
  const stack = await getStoredValue(UNDO_STACK_KEY) || [];
  stack.push(state);
  if (stack.length > MAX_UNDO_STACK) {
    stack.shift();
  }
  await setStoredValue(UNDO_STACK_KEY, stack);
  logInfo("Pushed undo state", { stackSize: stack.length });
};
var saveState = async (name) => {
  const undoState = await captureCurrentState();
  const savedState = {
    name,
    timestamp: undoState.timestamp,
    windows: undoState.windows
  };
  const savedStates = await getStoredValue(SAVED_STATES_KEY) || [];
  savedStates.push(savedState);
  await setStoredValue(SAVED_STATES_KEY, savedStates);
  logInfo("Saved state", { name });
};
var getSavedStates = async () => {
  return await getStoredValue(SAVED_STATES_KEY) || [];
};
var deleteSavedState = async (name) => {
  let savedStates = await getStoredValue(SAVED_STATES_KEY) || [];
  savedStates = savedStates.filter((s) => s.name !== name);
  await setStoredValue(SAVED_STATES_KEY, savedStates);
  logInfo("Deleted saved state", { name });
};
var undo = async () => {
  const stack = await getStoredValue(UNDO_STACK_KEY) || [];
  const state = stack.pop();
  if (!state) {
    logInfo("Undo stack empty");
    return;
  }
  await setStoredValue(UNDO_STACK_KEY, stack);
  await restoreState(state);
  logInfo("Undid last action");
};
var restoreState = async (state) => {
  const currentTabs = await chrome.tabs.query({});
  const currentTabMap = /* @__PURE__ */ new Map();
  const currentUrlMap = /* @__PURE__ */ new Map();
  currentTabs.forEach((t) => {
    if (t.id) currentTabMap.set(t.id, t);
    if (t.url) {
      const list = currentUrlMap.get(t.url) || [];
      list.push(t);
      currentUrlMap.set(t.url, list);
    }
  });
  const findOrCreateTab = async (stored) => {
    if (stored.id && currentTabMap.has(stored.id)) {
      const t = currentTabMap.get(stored.id);
      currentTabMap.delete(stored.id);
      if (t?.url) {
        const list2 = currentUrlMap.get(t.url);
        if (list2) {
          const idx = list2.findIndex((x) => x.id === t.id);
          if (idx !== -1) list2.splice(idx, 1);
        }
      }
      return t;
    }
    const list = currentUrlMap.get(stored.url);
    if (list && list.length > 0) {
      const t = list.shift();
      if (t?.id) currentTabMap.delete(t.id);
      return t;
    }
    if (stored.url) {
      try {
        const t = await chrome.tabs.create({ url: stored.url, active: false });
        return t;
      } catch (e) {
        logError("Failed to create tab", { url: stored.url, error: e });
      }
    }
    return void 0;
  };
  const currentWindows = await chrome.windows.getAll();
  for (let i = 0; i < state.windows.length; i++) {
    const winState = state.windows[i];
    const tabsToMove = [];
    for (const storedTab of winState.tabs) {
      const found = await findOrCreateTab(storedTab);
      if (found && found.id) {
        tabsToMove.push({ tabId: found.id, stored: storedTab });
      }
    }
    if (tabsToMove.length === 0) continue;
    let targetWindowId;
    if (i < currentWindows.length) {
      targetWindowId = currentWindows[i].id;
    } else {
      const win = await chrome.windows.create({});
      targetWindowId = win.id;
    }
    const tabIds = tabsToMove.map((t) => t.tabId);
    try {
      await chrome.tabs.move(tabIds, { windowId: targetWindowId, index: 0 });
    } catch (e) {
      logError("Failed to batch move tabs, falling back to individual moves", { error: e });
      for (let j = 0; j < tabsToMove.length; j++) {
        const { tabId } = tabsToMove[j];
        try {
          await chrome.tabs.move(tabId, { windowId: targetWindowId, index: j });
        } catch (e2) {
          logError("Failed to move tab individually", { tabId, error: e2 });
        }
      }
    }
    for (const { tabId, stored } of tabsToMove) {
      try {
        if (stored.pinned) {
          await chrome.tabs.update(tabId, { pinned: true });
        } else {
          const current = await chrome.tabs.get(tabId);
          if (current.pinned) await chrome.tabs.update(tabId, { pinned: false });
        }
      } catch (e) {
        logError("Failed to update tab pin state", { tabId, error: e });
      }
    }
    const groups = /* @__PURE__ */ new Map();
    const groupColors = /* @__PURE__ */ new Map();
    for (const item of tabsToMove) {
      if (item.stored.groupTitle !== void 0) {
        const key = item.stored.groupTitle;
        const list = groups.get(key) || [];
        list.push(item.tabId);
        groups.set(key, list);
        if (item.stored.groupColor) {
          groupColors.set(key, item.stored.groupColor);
        }
      } else {
        await chrome.tabs.ungroup(item.tabId);
      }
    }
    for (const [title, ids] of groups.entries()) {
      if (ids.length > 0) {
        const groupId = await chrome.tabs.group({ tabIds: ids });
        await chrome.tabGroups.update(groupId, {
          title,
          color: groupColors.get(title) || "grey"
        });
      }
    }
  }
};

// src/background/serviceWorker.ts
chrome.runtime.onInstalled.addListener(async () => {
  const prefs = await loadPreferences();
  setCustomStrategies(prefs.customStrategies || []);
  logInfo("Extension installed", {
    version: chrome.runtime.getManifest().version,
    logLevel: prefs.logLevel,
    strategiesCount: prefs.customStrategies?.length || 0
  });
});
loadPreferences().then(async (prefs) => {
  setCustomStrategies(prefs.customStrategies || []);
  await initLogger();
  logInfo("Service Worker Initialized", {
    version: chrome.runtime.getManifest().version,
    logLevel: prefs.logLevel
  });
});
var handleMessage = async (message, sender) => {
  logDebug("Received message", { type: message.type, from: sender.id });
  switch (message.type) {
    case "getState": {
      const prefs = await loadPreferences();
      setCustomStrategies(prefs.customStrategies || []);
      const groups = await fetchCurrentTabGroups(prefs);
      return { ok: true, data: { groups, preferences: prefs } };
    }
    case "applyGrouping": {
      logInfo("Applying grouping from message", { sorting: message.payload?.sorting });
      await pushUndoState();
      const prefs = await loadPreferences();
      setCustomStrategies(prefs.customStrategies || []);
      const payload = message.payload ?? {};
      const selection = payload.selection ?? {};
      const sorting = payload.sorting?.length ? payload.sorting : void 0;
      const preferences = sorting ? { ...prefs, sorting } : prefs;
      const onProgress = (completed, total) => {
        chrome.runtime.sendMessage({
          type: "groupingProgress",
          payload: { completed, total }
        }).catch(() => {
        });
      };
      const groups = await calculateTabGroups(preferences, selection, onProgress);
      await applyTabGroups(groups);
      return { ok: true, data: { groups } };
    }
    case "applySorting": {
      logInfo("Applying sorting from message");
      await pushUndoState();
      const prefs = await loadPreferences();
      setCustomStrategies(prefs.customStrategies || []);
      const payload = message.payload ?? {};
      const selection = payload.selection ?? {};
      const sorting = payload.sorting?.length ? payload.sorting : void 0;
      const preferences = sorting ? { ...prefs, sorting } : prefs;
      const onProgress = (completed, total) => {
        chrome.runtime.sendMessage({
          type: "groupingProgress",
          payload: { completed, total }
        }).catch(() => {
        });
      };
      await applyTabSorting(preferences, selection, onProgress);
      return { ok: true };
    }
    case "mergeSelection": {
      logInfo("Merging selection from message");
      await pushUndoState();
      const payload = message.payload;
      if (payload?.tabIds?.length) {
        await mergeTabs(payload.tabIds);
        return { ok: true };
      }
      return { ok: false, error: "No tabs selected" };
    }
    case "splitSelection": {
      logInfo("Splitting selection from message");
      await pushUndoState();
      const payload = message.payload;
      if (payload?.tabIds?.length) {
        await splitTabs(payload.tabIds);
        return { ok: true };
      }
      return { ok: false, error: "No tabs selected" };
    }
    case "undo": {
      logInfo("Undoing last action");
      await undo();
      return { ok: true };
    }
    case "saveState": {
      const name = message.payload?.name;
      if (typeof name === "string") {
        logInfo("Saving state from message", { name });
        await saveState(name);
        return { ok: true };
      }
      return { ok: false, error: "Invalid name" };
    }
    case "getSavedStates": {
      const states = await getSavedStates();
      return { ok: true, data: states };
    }
    case "restoreState": {
      const state = message.payload?.state;
      if (state) {
        logInfo("Restoring state from message", { name: state.name });
        await restoreState(state);
        return { ok: true };
      }
      return { ok: false, error: "Invalid state" };
    }
    case "deleteSavedState": {
      const name = message.payload?.name;
      if (typeof name === "string") {
        logInfo("Deleting saved state from message", { name });
        await deleteSavedState(name);
        return { ok: true };
      }
      return { ok: false, error: "Invalid name" };
    }
    case "loadPreferences": {
      const prefs = await loadPreferences();
      setCustomStrategies(prefs.customStrategies || []);
      return { ok: true, data: prefs };
    }
    case "savePreferences": {
      logInfo("Saving preferences from message");
      const prefs = await savePreferences(message.payload);
      setCustomStrategies(prefs.customStrategies || []);
      setLoggerPreferences(prefs);
      return { ok: true, data: prefs };
    }
    case "getLogs": {
      await loggerReady;
      const logs2 = getLogs();
      return { ok: true, data: logs2 };
    }
    case "clearLogs": {
      clearLogs();
      return { ok: true };
    }
    case "logEntry": {
      const entry = message.payload;
      if (entry && entry.level && entry.message) {
        addLogEntry(entry);
      }
      return { ok: true };
    }
    default:
      return { ok: false, error: "Unknown message" };
  }
};
chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {
    handleMessage(message, sender).then((response) => sendResponse(response)).catch((error) => {
      sendResponse({ ok: false, error: String(error) });
    });
    return true;
  }
);
chrome.tabGroups.onRemoved.addListener(async (group) => {
  logInfo("Tab group removed", { group });
});
var autoRunTimeout = null;
var dirtyTabIds = /* @__PURE__ */ new Set();
var tabProcessingTimeout = null;
var triggerAutoRun = (tabId) => {
  if (tabId !== void 0) {
    dirtyTabIds.add(tabId);
    if (tabProcessingTimeout) clearTimeout(tabProcessingTimeout);
    tabProcessingTimeout = setTimeout(async () => {
      const ids = Array.from(dirtyTabIds);
      dirtyTabIds.clear();
      if (ids.length === 0) return;
      try {
        const prefs = await loadPreferences();
        setCustomStrategies(prefs.customStrategies || []);
        const autoRunStrats = prefs.customStrategies?.filter((s) => s.autoRun);
        if (autoRunStrats && autoRunStrats.length > 0) {
          const strategyIds = autoRunStrats.map((s) => s.id);
          const groups = await calculateTabGroups({ ...prefs, sorting: strategyIds }, { tabIds: ids });
          await applyTabGroups(groups);
          logInfo("Auto-run targeted", { tabs: ids, strategies: strategyIds });
        }
      } catch (e) {
        console.error("Auto-run targeted failed", e);
      }
    }, 200);
  }
  if (autoRunTimeout) clearTimeout(autoRunTimeout);
  autoRunTimeout = setTimeout(async () => {
    try {
      const prefs = await loadPreferences();
      setCustomStrategies(prefs.customStrategies || []);
      const autoRunStrats = prefs.customStrategies?.filter((s) => s.autoRun);
      if (autoRunStrats && autoRunStrats.length > 0) {
        logInfo("Auto-running strategies (global)", {
          strategies: autoRunStrats.map((s) => s.id),
          count: autoRunStrats.length
        });
        const ids = autoRunStrats.map((s) => s.id);
        const groups = await calculateTabGroups({ ...prefs, sorting: ids });
        await applyTabGroups(groups);
      }
    } catch (e) {
      console.error("Auto-run failed", e);
    }
  }, 1e3);
};
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id) triggerAutoRun(tab.id);
  else triggerAutoRun();
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    triggerAutoRun(tabId);
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3NoYXJlZC9zdHJhdGVneVJlZ2lzdHJ5LnRzIiwgIi4uLy4uL3NyYy9zaGFyZWQvbG9nZ2VyLnRzIiwgIi4uLy4uL3NyYy9zaGFyZWQvdXRpbHMudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZ3JvdXBpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3NvcnRpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL2V4dHJhY3Rpb24vbG9naWMudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZXh0cmFjdGlvbi9nZW5lcmFSZWdpc3RyeS50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9zdG9yYWdlLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3ByZWZlcmVuY2VzLnRzIiwgIi4uLy4uL25vZGVfbW9kdWxlcy95b2N0by1xdWV1ZS9pbmRleC5qcyIsICIuLi8uLi9ub2RlX21vZHVsZXMvcC1saW1pdC9pbmRleC5qcyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9leHRyYWN0aW9uL2luZGV4LnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL2NhdGVnb3J5UnVsZXMudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvY29udGV4dEFuYWx5c2lzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3RhYk1hbmFnZXIudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvc3RhdGVNYW5hZ2VyLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3NlcnZpY2VXb3JrZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IEN1c3RvbVN0cmF0ZWd5LCBTb3J0aW5nU3RyYXRlZ3kgfSBmcm9tIFwiLi90eXBlcy5qc1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0cmF0ZWd5RGVmaW5pdGlvbiB7XG4gICAgaWQ6IFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZztcbiAgICBsYWJlbDogc3RyaW5nO1xuICAgIGlzR3JvdXBpbmc6IGJvb2xlYW47XG4gICAgaXNTb3J0aW5nOiBib29sZWFuO1xuICAgIHRhZ3M/OiBzdHJpbmdbXTtcbiAgICBhdXRvUnVuPzogYm9vbGVhbjtcbiAgICBpc0N1c3RvbT86IGJvb2xlYW47XG59XG5cbi8vIFJlc3RvcmVkIHN0cmF0ZWdpZXMgbWF0Y2hpbmcgYmFja2dyb3VuZCBjYXBhYmlsaXRpZXMuXG5leHBvcnQgY29uc3QgU1RSQVRFR0lFUzogU3RyYXRlZ3lEZWZpbml0aW9uW10gPSBbXG4gICAgeyBpZDogXCJkb21haW5cIiwgbGFiZWw6IFwiRG9tYWluXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJkb21haW5fZnVsbFwiLCBsYWJlbDogXCJGdWxsIERvbWFpblwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwidG9waWNcIiwgbGFiZWw6IFwiVG9waWNcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImNvbnRleHRcIiwgbGFiZWw6IFwiQ29udGV4dFwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwibGluZWFnZVwiLCBsYWJlbDogXCJMaW5lYWdlXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJwaW5uZWRcIiwgbGFiZWw6IFwiUGlubmVkXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJyZWNlbmN5XCIsIGxhYmVsOiBcIlJlY2VuY3lcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImFnZVwiLCBsYWJlbDogXCJBZ2VcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInVybFwiLCBsYWJlbDogXCJVUkxcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcIm5lc3RpbmdcIiwgbGFiZWw6IFwiTmVzdGluZ1wiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwidGl0bGVcIiwgbGFiZWw6IFwiVGl0bGVcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbl07XG5cbmV4cG9ydCBjb25zdCBnZXRTdHJhdGVnaWVzID0gKGN1c3RvbVN0cmF0ZWdpZXM/OiBDdXN0b21TdHJhdGVneVtdKTogU3RyYXRlZ3lEZWZpbml0aW9uW10gPT4ge1xuICAgIGlmICghY3VzdG9tU3RyYXRlZ2llcyB8fCBjdXN0b21TdHJhdGVnaWVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIFNUUkFURUdJRVM7XG5cbiAgICAvLyBDdXN0b20gc3RyYXRlZ2llcyBjYW4gb3ZlcnJpZGUgYnVpbHQtaW5zIGlmIElEcyBtYXRjaCwgb3IgYWRkIG5ldyBvbmVzLlxuICAgIGNvbnN0IGNvbWJpbmVkID0gWy4uLlNUUkFURUdJRVNdO1xuXG4gICAgY3VzdG9tU3RyYXRlZ2llcy5mb3JFYWNoKGN1c3RvbSA9PiB7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nSW5kZXggPSBjb21iaW5lZC5maW5kSW5kZXgocyA9PiBzLmlkID09PSBjdXN0b20uaWQpO1xuXG4gICAgICAgIC8vIERldGVybWluZSBjYXBhYmlsaXRpZXMgYmFzZWQgb24gcnVsZXMgcHJlc2VuY2VcbiAgICAgICAgY29uc3QgaGFzR3JvdXBpbmcgPSAoY3VzdG9tLmdyb3VwaW5nUnVsZXMgJiYgY3VzdG9tLmdyb3VwaW5nUnVsZXMubGVuZ3RoID4gMCkgfHwgKGN1c3RvbS5ydWxlcyAmJiBjdXN0b20ucnVsZXMubGVuZ3RoID4gMCkgfHwgZmFsc2U7XG4gICAgICAgIGNvbnN0IGhhc1NvcnRpbmcgPSAoY3VzdG9tLnNvcnRpbmdSdWxlcyAmJiBjdXN0b20uc29ydGluZ1J1bGVzLmxlbmd0aCA+IDApIHx8IChjdXN0b20ucnVsZXMgJiYgY3VzdG9tLnJ1bGVzLmxlbmd0aCA+IDApIHx8IGZhbHNlO1xuXG4gICAgICAgIGNvbnN0IHRhZ3M6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGlmIChoYXNHcm91cGluZykgdGFncy5wdXNoKFwiZ3JvdXBcIik7XG4gICAgICAgIGlmIChoYXNTb3J0aW5nKSB0YWdzLnB1c2goXCJzb3J0XCIpO1xuXG4gICAgICAgIGNvbnN0IGRlZmluaXRpb246IFN0cmF0ZWd5RGVmaW5pdGlvbiA9IHtcbiAgICAgICAgICAgIGlkOiBjdXN0b20uaWQsXG4gICAgICAgICAgICBsYWJlbDogY3VzdG9tLmxhYmVsLFxuICAgICAgICAgICAgaXNHcm91cGluZzogaGFzR3JvdXBpbmcsXG4gICAgICAgICAgICBpc1NvcnRpbmc6IGhhc1NvcnRpbmcsXG4gICAgICAgICAgICB0YWdzOiB0YWdzLFxuICAgICAgICAgICAgYXV0b1J1bjogY3VzdG9tLmF1dG9SdW4sXG4gICAgICAgICAgICBpc0N1c3RvbTogdHJ1ZVxuICAgICAgICB9O1xuXG4gICAgICAgIGlmIChleGlzdGluZ0luZGV4ICE9PSAtMSkge1xuICAgICAgICAgICAgY29tYmluZWRbZXhpc3RpbmdJbmRleF0gPSBkZWZpbml0aW9uO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29tYmluZWQucHVzaChkZWZpbml0aW9uKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGNvbWJpbmVkO1xufTtcblxuZXhwb3J0IGNvbnN0IGdldFN0cmF0ZWd5ID0gKGlkOiBTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmcpOiBTdHJhdGVneURlZmluaXRpb24gfCB1bmRlZmluZWQgPT4gU1RSQVRFR0lFUy5maW5kKHMgPT4gcy5pZCA9PT0gaWQpO1xuIiwgImltcG9ydCB7IExvZ0VudHJ5LCBMb2dMZXZlbCwgUHJlZmVyZW5jZXMgfSBmcm9tIFwiLi90eXBlcy5qc1wiO1xuXG5jb25zdCBQUkVGSVggPSBcIltUYWJTb3J0ZXJdXCI7XG5cbmNvbnN0IExFVkVMX1BSSU9SSVRZOiBSZWNvcmQ8TG9nTGV2ZWwsIG51bWJlcj4gPSB7XG4gIGRlYnVnOiAwLFxuICBpbmZvOiAxLFxuICB3YXJuOiAyLFxuICBlcnJvcjogMyxcbiAgY3JpdGljYWw6IDRcbn07XG5cbmxldCBjdXJyZW50TGV2ZWw6IExvZ0xldmVsID0gXCJpbmZvXCI7XG5sZXQgbG9nczogTG9nRW50cnlbXSA9IFtdO1xuY29uc3QgTUFYX0xPR1MgPSAxMDAwO1xuY29uc3QgU1RPUkFHRV9LRVkgPSBcInNlc3Npb25Mb2dzXCI7XG5cbi8vIFNhZmUgY29udGV4dCBjaGVja1xuY29uc3QgaXNTZXJ2aWNlV29ya2VyID0gdHlwZW9mIHNlbGYgIT09ICd1bmRlZmluZWQnICYmXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlb2YgKHNlbGYgYXMgYW55KS5TZXJ2aWNlV29ya2VyR2xvYmFsU2NvcGUgIT09ICd1bmRlZmluZWQnICYmXG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmIGluc3RhbmNlb2YgKHNlbGYgYXMgYW55KS5TZXJ2aWNlV29ya2VyR2xvYmFsU2NvcGU7XG5sZXQgaXNTYXZpbmcgPSBmYWxzZTtcbmxldCBwZW5kaW5nU2F2ZSA9IGZhbHNlO1xubGV0IHNhdmVUaW1lcjogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCBudWxsID0gbnVsbDtcblxuY29uc3QgZG9TYXZlID0gKCkgPT4ge1xuICAgIGlmICghaXNTZXJ2aWNlV29ya2VyIHx8ICFjaHJvbWU/LnN0b3JhZ2U/LnNlc3Npb24gfHwgaXNTYXZpbmcpIHtcbiAgICAgICAgcGVuZGluZ1NhdmUgPSB0cnVlO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaXNTYXZpbmcgPSB0cnVlO1xuICAgIHBlbmRpbmdTYXZlID0gZmFsc2U7XG5cbiAgICBjaHJvbWUuc3RvcmFnZS5zZXNzaW9uLnNldCh7IFtTVE9SQUdFX0tFWV06IGxvZ3MgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIGlzU2F2aW5nID0gZmFsc2U7XG4gICAgICAgIGlmIChwZW5kaW5nU2F2ZSkge1xuICAgICAgICAgICAgc2F2ZUxvZ3NUb1N0b3JhZ2UoKTtcbiAgICAgICAgfVxuICAgIH0pLmNhdGNoKGVyciA9PiB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gc2F2ZSBsb2dzXCIsIGVycik7XG4gICAgICAgIGlzU2F2aW5nID0gZmFsc2U7XG4gICAgfSk7XG59O1xuXG5jb25zdCBzYXZlTG9nc1RvU3RvcmFnZSA9ICgpID0+IHtcbiAgICBpZiAoc2F2ZVRpbWVyKSBjbGVhclRpbWVvdXQoc2F2ZVRpbWVyKTtcbiAgICBzYXZlVGltZXIgPSBzZXRUaW1lb3V0KGRvU2F2ZSwgMTAwMCk7XG59O1xuXG5sZXQgcmVzb2x2ZUxvZ2dlclJlYWR5OiAoKSA9PiB2b2lkO1xuZXhwb3J0IGNvbnN0IGxvZ2dlclJlYWR5ID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG4gICAgcmVzb2x2ZUxvZ2dlclJlYWR5ID0gcmVzb2x2ZTtcbn0pO1xuXG5leHBvcnQgY29uc3QgaW5pdExvZ2dlciA9IGFzeW5jICgpID0+IHtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyICYmIGNocm9tZT8uc3RvcmFnZT8uc2Vzc2lvbikge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY2hyb21lLnN0b3JhZ2Uuc2Vzc2lvbi5nZXQoU1RPUkFHRV9LRVkpO1xuICAgICAgICAgICAgaWYgKHJlc3VsdFtTVE9SQUdFX0tFWV0gJiYgQXJyYXkuaXNBcnJheShyZXN1bHRbU1RPUkFHRV9LRVldKSkge1xuICAgICAgICAgICAgICAgIGxvZ3MgPSByZXN1bHRbU1RPUkFHRV9LRVldO1xuICAgICAgICAgICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSBsb2dzID0gbG9ncy5zbGljZSgwLCBNQVhfTE9HUyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gcmVzdG9yZSBsb2dzXCIsIGUpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGlmIChyZXNvbHZlTG9nZ2VyUmVhZHkpIHJlc29sdmVMb2dnZXJSZWFkeSgpO1xufTtcblxuZXhwb3J0IGNvbnN0IHNldExvZ2dlclByZWZlcmVuY2VzID0gKHByZWZzOiBQcmVmZXJlbmNlcykgPT4ge1xuICBpZiAocHJlZnMubG9nTGV2ZWwpIHtcbiAgICBjdXJyZW50TGV2ZWwgPSBwcmVmcy5sb2dMZXZlbDtcbiAgfSBlbHNlIGlmIChwcmVmcy5kZWJ1Zykge1xuICAgIGN1cnJlbnRMZXZlbCA9IFwiZGVidWdcIjtcbiAgfSBlbHNlIHtcbiAgICBjdXJyZW50TGV2ZWwgPSBcImluZm9cIjtcbiAgfVxufTtcblxuY29uc3Qgc2hvdWxkTG9nID0gKGxldmVsOiBMb2dMZXZlbCk6IGJvb2xlYW4gPT4ge1xuICByZXR1cm4gTEVWRUxfUFJJT1JJVFlbbGV2ZWxdID49IExFVkVMX1BSSU9SSVRZW2N1cnJlbnRMZXZlbF07XG59O1xuXG5jb25zdCBmb3JtYXRNZXNzYWdlID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIHJldHVybiBjb250ZXh0ID8gYCR7bWVzc2FnZX0gOjogJHtKU09OLnN0cmluZ2lmeShjb250ZXh0KX1gIDogbWVzc2FnZTtcbn07XG5cbmNvbnN0IGFkZExvZyA9IChsZXZlbDogTG9nTGV2ZWwsIG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGlmIChzaG91bGRMb2cobGV2ZWwpKSB7XG4gICAgICBjb25zdCBlbnRyeTogTG9nRW50cnkgPSB7XG4gICAgICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxuICAgICAgICAgIGxldmVsLFxuICAgICAgICAgIG1lc3NhZ2UsXG4gICAgICAgICAgY29udGV4dFxuICAgICAgfTtcblxuICAgICAgaWYgKGlzU2VydmljZVdvcmtlcikge1xuICAgICAgICAgIGxvZ3MudW5zaGlmdChlbnRyeSk7XG4gICAgICAgICAgaWYgKGxvZ3MubGVuZ3RoID4gTUFYX0xPR1MpIHtcbiAgICAgICAgICAgICAgbG9ncy5wb3AoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgc2F2ZUxvZ3NUb1N0b3JhZ2UoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gSW4gb3RoZXIgY29udGV4dHMsIHNlbmQgdG8gU1dcbiAgICAgICAgICBpZiAoY2hyb21lPy5ydW50aW1lPy5zZW5kTWVzc2FnZSkge1xuICAgICAgICAgICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2xvZ0VudHJ5JywgcGF5bG9hZDogZW50cnkgfSkuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgICAgICAgICAvLyBJZ25vcmUgaWYgbWVzc2FnZSBmYWlscyAoZS5nLiBjb250ZXh0IGludmFsaWRhdGVkKVxuICAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgIH1cbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGFkZExvZ0VudHJ5ID0gKGVudHJ5OiBMb2dFbnRyeSkgPT4ge1xuICAgIGlmIChpc1NlcnZpY2VXb3JrZXIpIHtcbiAgICAgICAgbG9ncy51bnNoaWZ0KGVudHJ5KTtcbiAgICAgICAgaWYgKGxvZ3MubGVuZ3RoID4gTUFYX0xPR1MpIHtcbiAgICAgICAgICAgIGxvZ3MucG9wKCk7XG4gICAgICAgIH1cbiAgICAgICAgc2F2ZUxvZ3NUb1N0b3JhZ2UoKTtcbiAgICB9XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0TG9ncyA9ICgpID0+IFsuLi5sb2dzXTtcbmV4cG9ydCBjb25zdCBjbGVhckxvZ3MgPSAoKSA9PiB7XG4gICAgbG9ncy5sZW5ndGggPSAwO1xuICAgIGlmIChpc1NlcnZpY2VXb3JrZXIpIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG59O1xuXG5leHBvcnQgY29uc3QgbG9nRGVidWcgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwiZGVidWdcIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJkZWJ1Z1wiKSkge1xuICAgIGNvbnNvbGUuZGVidWcoYCR7UFJFRklYfSBbREVCVUddICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0luZm8gPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwiaW5mb1wiLCBtZXNzYWdlLCBjb250ZXh0KTtcbiAgaWYgKHNob3VsZExvZyhcImluZm9cIikpIHtcbiAgICBjb25zb2xlLmluZm8oYCR7UFJFRklYfSBbSU5GT10gJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nV2FybiA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBhZGRMb2coXCJ3YXJuXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwid2FyblwiKSkge1xuICAgIGNvbnNvbGUud2FybihgJHtQUkVGSVh9IFtXQVJOXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgY29udGV4dCl9YCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBsb2dFcnJvciA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBhZGRMb2coXCJlcnJvclwiLCBtZXNzYWdlLCBjb250ZXh0KTtcbiAgaWYgKHNob3VsZExvZyhcImVycm9yXCIpKSB7XG4gICAgY29uc29sZS5lcnJvcihgJHtQUkVGSVh9IFtFUlJPUl0gJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nQ3JpdGljYWwgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwiY3JpdGljYWxcIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJjcml0aWNhbFwiKSkge1xuICAgIC8vIENyaXRpY2FsIGxvZ3MgdXNlIGVycm9yIGNvbnNvbGUgYnV0IHdpdGggZGlzdGluY3QgcHJlZml4IGFuZCBtYXliZSBzdHlsaW5nIGlmIHN1cHBvcnRlZFxuICAgIGNvbnNvbGUuZXJyb3IoYCR7UFJFRklYfSBbQ1JJVElDQUxdIFx1RDgzRFx1REVBOCAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgY29udGV4dCl9YCk7XG4gIH1cbn07XG4iLCAiaW1wb3J0IHsgUHJlZmVyZW5jZXMsIFNvcnRpbmdTdHJhdGVneSwgVGFiTWV0YWRhdGEgfSBmcm9tIFwiLi90eXBlcy5qc1wiO1xuXG5leHBvcnQgY29uc3QgbWFwQ2hyb21lVGFiID0gKHRhYjogY2hyb21lLnRhYnMuVGFiKTogVGFiTWV0YWRhdGEgfCBudWxsID0+IHtcbiAgaWYgKCF0YWIuaWQgfHwgdGFiLmlkID09PSBjaHJvbWUudGFicy5UQUJfSURfTk9ORSB8fCAhdGFiLndpbmRvd0lkKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHtcbiAgICBpZDogdGFiLmlkLFxuICAgIHdpbmRvd0lkOiB0YWIud2luZG93SWQsXG4gICAgdGl0bGU6IHRhYi50aXRsZSB8fCBcIlVudGl0bGVkXCIsXG4gICAgdXJsOiB0YWIucGVuZGluZ1VybCB8fCB0YWIudXJsIHx8IFwiYWJvdXQ6YmxhbmtcIixcbiAgICBwaW5uZWQ6IEJvb2xlYW4odGFiLnBpbm5lZCksXG4gICAgbGFzdEFjY2Vzc2VkOiB0YWIubGFzdEFjY2Vzc2VkLFxuICAgIG9wZW5lclRhYklkOiB0YWIub3BlbmVyVGFiSWQgPz8gdW5kZWZpbmVkLFxuICAgIGZhdkljb25Vcmw6IHRhYi5mYXZJY29uVXJsLFxuICAgIGdyb3VwSWQ6IHRhYi5ncm91cElkLFxuICAgIGluZGV4OiB0YWIuaW5kZXgsXG4gICAgYWN0aXZlOiB0YWIuYWN0aXZlLFxuICAgIHN0YXR1czogdGFiLnN0YXR1cyxcbiAgICBzZWxlY3RlZDogdGFiLmhpZ2hsaWdodGVkXG4gIH07XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0U3RvcmVkUHJlZmVyZW5jZXMgPSBhc3luYyAoKTogUHJvbWlzZTxQcmVmZXJlbmNlcyB8IG51bGw+ID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFwicHJlZmVyZW5jZXNcIiwgKGl0ZW1zKSA9PiB7XG4gICAgICByZXNvbHZlKChpdGVtc1tcInByZWZlcmVuY2VzXCJdIGFzIFByZWZlcmVuY2VzKSA/PyBudWxsKTtcbiAgICB9KTtcbiAgfSk7XG59O1xuXG5leHBvcnQgY29uc3QgYXNBcnJheSA9IDxUPih2YWx1ZTogdW5rbm93bik6IFRbXSA9PiB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSByZXR1cm4gdmFsdWUgYXMgVFtdO1xuICAgIHJldHVybiBbXTtcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBlc2NhcGVIdG1sKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGlmICghdGV4dCkgcmV0dXJuICcnO1xuICByZXR1cm4gdGV4dFxuICAgIC5yZXBsYWNlKC8mL2csICcmYW1wOycpXG4gICAgLnJlcGxhY2UoLzwvZywgJyZsdDsnKVxuICAgIC5yZXBsYWNlKC8+L2csICcmZ3Q7JylcbiAgICAucmVwbGFjZSgvXCIvZywgJyZxdW90OycpXG4gICAgLnJlcGxhY2UoLycvZywgJyYjMDM5OycpO1xufVxuIiwgImltcG9ydCB7IEdyb3VwaW5nU3RyYXRlZ3ksIFNvcnRpbmdTdHJhdGVneSwgVGFiR3JvdXAsIFRhYk1ldGFkYXRhLCBDdXN0b21TdHJhdGVneSwgU3RyYXRlZ3lSdWxlLCBSdWxlQ29uZGl0aW9uLCBHcm91cGluZ1J1bGUsIFNvcnRpbmdSdWxlIH0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgZ2V0U3RyYXRlZ2llcyB9IGZyb20gXCIuLi9zaGFyZWQvc3RyYXRlZ3lSZWdpc3RyeS5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcblxubGV0IGN1c3RvbVN0cmF0ZWdpZXM6IEN1c3RvbVN0cmF0ZWd5W10gPSBbXTtcblxuZXhwb3J0IGNvbnN0IHNldEN1c3RvbVN0cmF0ZWdpZXMgPSAoc3RyYXRlZ2llczogQ3VzdG9tU3RyYXRlZ3lbXSkgPT4ge1xuICAgIGN1c3RvbVN0cmF0ZWdpZXMgPSBzdHJhdGVnaWVzO1xufTtcblxuZXhwb3J0IGNvbnN0IGdldEN1c3RvbVN0cmF0ZWdpZXMgPSAoKTogQ3VzdG9tU3RyYXRlZ3lbXSA9PiBjdXN0b21TdHJhdGVnaWVzO1xuXG5jb25zdCBDT0xPUlMgPSBbXCJncmV5XCIsIFwiYmx1ZVwiLCBcInJlZFwiLCBcInllbGxvd1wiLCBcImdyZWVuXCIsIFwicGlua1wiLCBcInB1cnBsZVwiLCBcImN5YW5cIiwgXCJvcmFuZ2VcIl07XG5cbmNvbnN0IHJlZ2V4Q2FjaGUgPSBuZXcgTWFwPHN0cmluZywgUmVnRXhwPigpO1xuY29uc3QgZG9tYWluQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuY29uc3Qgc3ViZG9tYWluQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuY29uc3QgTUFYX0NBQ0hFX1NJWkUgPSAxMDAwO1xuXG5leHBvcnQgY29uc3QgZG9tYWluRnJvbVVybCA9ICh1cmw6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGlmIChkb21haW5DYWNoZS5oYXModXJsKSkgcmV0dXJuIGRvbWFpbkNhY2hlLmdldCh1cmwpITtcblxuICB0cnkge1xuICAgIGNvbnN0IHBhcnNlZCA9IG5ldyBVUkwodXJsKTtcbiAgICBjb25zdCBkb21haW4gPSBwYXJzZWQuaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sIFwiXCIpO1xuXG4gICAgaWYgKGRvbWFpbkNhY2hlLnNpemUgPj0gTUFYX0NBQ0hFX1NJWkUpIGRvbWFpbkNhY2hlLmNsZWFyKCk7XG4gICAgZG9tYWluQ2FjaGUuc2V0KHVybCwgZG9tYWluKTtcblxuICAgIHJldHVybiBkb21haW47XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgbG9nRGVidWcoXCJGYWlsZWQgdG8gcGFyc2UgZG9tYWluXCIsIHsgdXJsLCBlcnJvcjogU3RyaW5nKGVycm9yKSB9KTtcbiAgICByZXR1cm4gXCJ1bmtub3duXCI7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBzdWJkb21haW5Gcm9tVXJsID0gKHVybDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICBpZiAoc3ViZG9tYWluQ2FjaGUuaGFzKHVybCkpIHJldHVybiBzdWJkb21haW5DYWNoZS5nZXQodXJsKSE7XG5cbiAgICB0cnkge1xuICAgICAgICBjb25zdCBwYXJzZWQgPSBuZXcgVVJMKHVybCk7XG4gICAgICAgIGxldCBob3N0bmFtZSA9IHBhcnNlZC5ob3N0bmFtZTtcbiAgICAgICAgLy8gUmVtb3ZlIHd3dy5cbiAgICAgICAgaG9zdG5hbWUgPSBob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgXCJcIik7XG5cbiAgICAgICAgbGV0IHJlc3VsdCA9IFwiXCI7XG4gICAgICAgIGNvbnN0IHBhcnRzID0gaG9zdG5hbWUuc3BsaXQoJy4nKTtcbiAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDIpIHtcbiAgICAgICAgICAgICByZXN1bHQgPSBwYXJ0cy5zbGljZSgwLCBwYXJ0cy5sZW5ndGggLSAyKS5qb2luKCcuJyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3ViZG9tYWluQ2FjaGUuc2l6ZSA+PSBNQVhfQ0FDSEVfU0laRSkgc3ViZG9tYWluQ2FjaGUuY2xlYXIoKTtcbiAgICAgICAgc3ViZG9tYWluQ2FjaGUuc2V0KHVybCwgcmVzdWx0KTtcblxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gXCJcIjtcbiAgICB9XG59XG5cbmNvbnN0IGdldE5lc3RlZFByb3BlcnR5ID0gKG9iajogdW5rbm93biwgcGF0aDogc3RyaW5nKTogdW5rbm93biA9PiB7XG4gICAgaWYgKCFvYmogfHwgdHlwZW9mIG9iaiAhPT0gJ29iamVjdCcpIHJldHVybiB1bmRlZmluZWQ7XG5cbiAgICBpZiAoIXBhdGguaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICByZXR1cm4gKG9iaiBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbcGF0aF07XG4gICAgfVxuXG4gICAgY29uc3QgcGFydHMgPSBwYXRoLnNwbGl0KCcuJyk7XG4gICAgbGV0IGN1cnJlbnQ6IHVua25vd24gPSBvYmo7XG5cbiAgICBmb3IgKGNvbnN0IGtleSBvZiBwYXJ0cykge1xuICAgICAgICBpZiAoIWN1cnJlbnQgfHwgdHlwZW9mIGN1cnJlbnQgIT09ICdvYmplY3QnKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICBjdXJyZW50ID0gKGN1cnJlbnQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW2tleV07XG4gICAgfVxuXG4gICAgcmV0dXJuIGN1cnJlbnQ7XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0RmllbGRWYWx1ZSA9ICh0YWI6IFRhYk1ldGFkYXRhLCBmaWVsZDogc3RyaW5nKTogYW55ID0+IHtcbiAgICBzd2l0Y2goZmllbGQpIHtcbiAgICAgICAgY2FzZSAnaWQnOiByZXR1cm4gdGFiLmlkO1xuICAgICAgICBjYXNlICdpbmRleCc6IHJldHVybiB0YWIuaW5kZXg7XG4gICAgICAgIGNhc2UgJ3dpbmRvd0lkJzogcmV0dXJuIHRhYi53aW5kb3dJZDtcbiAgICAgICAgY2FzZSAnZ3JvdXBJZCc6IHJldHVybiB0YWIuZ3JvdXBJZDtcbiAgICAgICAgY2FzZSAndGl0bGUnOiByZXR1cm4gdGFiLnRpdGxlO1xuICAgICAgICBjYXNlICd1cmwnOiByZXR1cm4gdGFiLnVybDtcbiAgICAgICAgY2FzZSAnc3RhdHVzJzogcmV0dXJuIHRhYi5zdGF0dXM7XG4gICAgICAgIGNhc2UgJ2FjdGl2ZSc6IHJldHVybiB0YWIuYWN0aXZlO1xuICAgICAgICBjYXNlICdzZWxlY3RlZCc6IHJldHVybiB0YWIuc2VsZWN0ZWQ7XG4gICAgICAgIGNhc2UgJ3Bpbm5lZCc6IHJldHVybiB0YWIucGlubmVkO1xuICAgICAgICBjYXNlICdvcGVuZXJUYWJJZCc6IHJldHVybiB0YWIub3BlbmVyVGFiSWQ7XG4gICAgICAgIGNhc2UgJ2xhc3RBY2Nlc3NlZCc6IHJldHVybiB0YWIubGFzdEFjY2Vzc2VkO1xuICAgICAgICBjYXNlICdjb250ZXh0JzogcmV0dXJuIHRhYi5jb250ZXh0O1xuICAgICAgICBjYXNlICdnZW5yZSc6IHJldHVybiB0YWIuY29udGV4dERhdGE/LmdlbnJlO1xuICAgICAgICBjYXNlICdzaXRlTmFtZSc6IHJldHVybiB0YWIuY29udGV4dERhdGE/LnNpdGVOYW1lO1xuICAgICAgICAvLyBEZXJpdmVkIG9yIG1hcHBlZCBmaWVsZHNcbiAgICAgICAgY2FzZSAnZG9tYWluJzogcmV0dXJuIGRvbWFpbkZyb21VcmwodGFiLnVybCk7XG4gICAgICAgIGNhc2UgJ3N1YmRvbWFpbic6IHJldHVybiBzdWJkb21haW5Gcm9tVXJsKHRhYi51cmwpO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgcmV0dXJuIGdldE5lc3RlZFByb3BlcnR5KHRhYiwgZmllbGQpO1xuICAgIH1cbn07XG5cbmNvbnN0IHN0cmlwVGxkID0gKGRvbWFpbjogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIGRvbWFpbi5yZXBsYWNlKC9cXC4oY29tfG9yZ3xnb3Z8bmV0fGVkdXxpbykkL2ksIFwiXCIpO1xufTtcblxuZXhwb3J0IGNvbnN0IHNlbWFudGljQnVja2V0ID0gKHRpdGxlOiBzdHJpbmcsIHVybDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3Qga2V5ID0gYCR7dGl0bGV9ICR7dXJsfWAudG9Mb3dlckNhc2UoKTtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImRvY1wiKSB8fCBrZXkuaW5jbHVkZXMoXCJyZWFkbWVcIikgfHwga2V5LmluY2x1ZGVzKFwiZ3VpZGVcIikpIHJldHVybiBcIkRvY3NcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcIm1haWxcIikgfHwga2V5LmluY2x1ZGVzKFwiaW5ib3hcIikpIHJldHVybiBcIkNoYXRcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImRhc2hib2FyZFwiKSB8fCBrZXkuaW5jbHVkZXMoXCJjb25zb2xlXCIpKSByZXR1cm4gXCJEYXNoXCI7XG4gIGlmIChrZXkuaW5jbHVkZXMoXCJpc3N1ZVwiKSB8fCBrZXkuaW5jbHVkZXMoXCJ0aWNrZXRcIikpIHJldHVybiBcIlRhc2tzXCI7XG4gIGlmIChrZXkuaW5jbHVkZXMoXCJkcml2ZVwiKSB8fCBrZXkuaW5jbHVkZXMoXCJzdG9yYWdlXCIpKSByZXR1cm4gXCJGaWxlc1wiO1xuICByZXR1cm4gXCJNaXNjXCI7XG59O1xuXG5leHBvcnQgY29uc3QgbmF2aWdhdGlvbktleSA9ICh0YWI6IFRhYk1ldGFkYXRhKTogc3RyaW5nID0+IHtcbiAgaWYgKHRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIGBjaGlsZC1vZi0ke3RhYi5vcGVuZXJUYWJJZH1gO1xuICB9XG4gIHJldHVybiBgd2luZG93LSR7dGFiLndpbmRvd0lkfWA7XG59O1xuXG5jb25zdCBnZXRSZWNlbmN5TGFiZWwgPSAobGFzdEFjY2Vzc2VkOiBudW1iZXIpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICBjb25zdCBkaWZmID0gbm93IC0gbGFzdEFjY2Vzc2VkO1xuICBpZiAoZGlmZiA8IDM2MDAwMDApIHJldHVybiBcIkp1c3Qgbm93XCI7IC8vIDFoXG4gIGlmIChkaWZmIDwgODY0MDAwMDApIHJldHVybiBcIlRvZGF5XCI7IC8vIDI0aFxuICBpZiAoZGlmZiA8IDE3MjgwMDAwMCkgcmV0dXJuIFwiWWVzdGVyZGF5XCI7IC8vIDQ4aFxuICBpZiAoZGlmZiA8IDYwNDgwMDAwMCkgcmV0dXJuIFwiVGhpcyBXZWVrXCI7IC8vIDdkXG4gIHJldHVybiBcIk9sZGVyXCI7XG59O1xuXG5jb25zdCBjb2xvckZvcktleSA9IChrZXk6IHN0cmluZywgb2Zmc2V0OiBudW1iZXIpOiBzdHJpbmcgPT4gQ09MT1JTWyhNYXRoLmFicyhoYXNoQ29kZShrZXkpKSArIG9mZnNldCkgJSBDT0xPUlMubGVuZ3RoXTtcblxuY29uc3QgaGFzaENvZGUgPSAodmFsdWU6IHN0cmluZyk6IG51bWJlciA9PiB7XG4gIGxldCBoYXNoID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB2YWx1ZS5sZW5ndGg7IGkgKz0gMSkge1xuICAgIGhhc2ggPSAoaGFzaCA8PCA1KSAtIGhhc2ggKyB2YWx1ZS5jaGFyQ29kZUF0KGkpO1xuICAgIGhhc2ggfD0gMDtcbiAgfVxuICByZXR1cm4gaGFzaDtcbn07XG5cbi8vIEhlbHBlciB0byBnZXQgYSBodW1hbi1yZWFkYWJsZSBsYWJlbCBjb21wb25lbnQgZnJvbSBhIHN0cmF0ZWd5IGFuZCBhIHNldCBvZiB0YWJzXG5jb25zdCBnZXRMYWJlbENvbXBvbmVudCA9IChzdHJhdGVneTogR3JvdXBpbmdTdHJhdGVneSB8IHN0cmluZywgdGFiczogVGFiTWV0YWRhdGFbXSwgYWxsVGFic01hcDogTWFwPG51bWJlciwgVGFiTWV0YWRhdGE+KTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gIGNvbnN0IGZpcnN0VGFiID0gdGFic1swXTtcbiAgaWYgKCFmaXJzdFRhYikgcmV0dXJuIFwiVW5rbm93blwiO1xuXG4gIC8vIENoZWNrIGN1c3RvbSBzdHJhdGVnaWVzIGZpcnN0XG4gIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5KTtcbiAgaWYgKGN1c3RvbSkge1xuICAgICAgcmV0dXJuIGdyb3VwaW5nS2V5KGZpcnN0VGFiLCBzdHJhdGVneSk7XG4gIH1cblxuICBzd2l0Y2ggKHN0cmF0ZWd5KSB7XG4gICAgY2FzZSBcImRvbWFpblwiOiB7XG4gICAgICBjb25zdCBzaXRlTmFtZXMgPSBuZXcgU2V0KHRhYnMubWFwKHQgPT4gdC5jb250ZXh0RGF0YT8uc2l0ZU5hbWUpLmZpbHRlcihCb29sZWFuKSk7XG4gICAgICBpZiAoc2l0ZU5hbWVzLnNpemUgPT09IDEpIHtcbiAgICAgICAgcmV0dXJuIHN0cmlwVGxkKEFycmF5LmZyb20oc2l0ZU5hbWVzKVswXSBhcyBzdHJpbmcpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHN0cmlwVGxkKGRvbWFpbkZyb21VcmwoZmlyc3RUYWIudXJsKSk7XG4gICAgfVxuICAgIGNhc2UgXCJkb21haW5fZnVsbFwiOlxuICAgICAgcmV0dXJuIGRvbWFpbkZyb21VcmwoZmlyc3RUYWIudXJsKTtcbiAgICBjYXNlIFwidG9waWNcIjpcbiAgICAgIHJldHVybiBzZW1hbnRpY0J1Y2tldChmaXJzdFRhYi50aXRsZSwgZmlyc3RUYWIudXJsKTtcbiAgICBjYXNlIFwibGluZWFnZVwiOlxuICAgICAgaWYgKGZpcnN0VGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgY29uc3QgcGFyZW50ID0gYWxsVGFic01hcC5nZXQoZmlyc3RUYWIub3BlbmVyVGFiSWQpO1xuICAgICAgICBpZiAocGFyZW50KSB7XG4gICAgICAgICAgY29uc3QgcGFyZW50VGl0bGUgPSBwYXJlbnQudGl0bGUubGVuZ3RoID4gMjAgPyBwYXJlbnQudGl0bGUuc3Vic3RyaW5nKDAsIDIwKSArIFwiLi4uXCIgOiBwYXJlbnQudGl0bGU7XG4gICAgICAgICAgcmV0dXJuIGBGcm9tOiAke3BhcmVudFRpdGxlfWA7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGBGcm9tOiBUYWIgJHtmaXJzdFRhYi5vcGVuZXJUYWJJZH1gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGBXaW5kb3cgJHtmaXJzdFRhYi53aW5kb3dJZH1gO1xuICAgIGNhc2UgXCJjb250ZXh0XCI6XG4gICAgICByZXR1cm4gZmlyc3RUYWIuY29udGV4dCB8fCBcIlVuY2F0ZWdvcml6ZWRcIjtcbiAgICBjYXNlIFwicGlubmVkXCI6XG4gICAgICByZXR1cm4gZmlyc3RUYWIucGlubmVkID8gXCJQaW5uZWRcIiA6IFwiVW5waW5uZWRcIjtcbiAgICBjYXNlIFwiYWdlXCI6XG4gICAgICByZXR1cm4gZ2V0UmVjZW5jeUxhYmVsKGZpcnN0VGFiLmxhc3RBY2Nlc3NlZCA/PyAwKTtcbiAgICBjYXNlIFwidXJsXCI6XG4gICAgICByZXR1cm4gXCJVUkwgR3JvdXBcIjtcbiAgICBjYXNlIFwicmVjZW5jeVwiOlxuICAgICAgcmV0dXJuIFwiVGltZSBHcm91cFwiO1xuICAgIGNhc2UgXCJuZXN0aW5nXCI6XG4gICAgICByZXR1cm4gZmlyc3RUYWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCA/IFwiQ2hpbGRyZW5cIiA6IFwiUm9vdHNcIjtcbiAgICBkZWZhdWx0OlxuICAgICAgY29uc3QgdmFsID0gZ2V0RmllbGRWYWx1ZShmaXJzdFRhYiwgc3RyYXRlZ3kpO1xuICAgICAgaWYgKHZhbCAhPT0gdW5kZWZpbmVkICYmIHZhbCAhPT0gbnVsbCkge1xuICAgICAgICAgIHJldHVybiBTdHJpbmcodmFsKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBcIlVua25vd25cIjtcbiAgfVxufTtcblxuY29uc3QgZ2VuZXJhdGVMYWJlbCA9IChcbiAgc3RyYXRlZ2llczogKEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcpW10sXG4gIHRhYnM6IFRhYk1ldGFkYXRhW10sXG4gIGFsbFRhYnNNYXA6IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhPlxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgbGFiZWxzID0gc3RyYXRlZ2llc1xuICAgIC5tYXAocyA9PiBnZXRMYWJlbENvbXBvbmVudChzLCB0YWJzLCBhbGxUYWJzTWFwKSlcbiAgICAuZmlsdGVyKGwgPT4gbCAmJiBsICE9PSBcIlVua25vd25cIiAmJiBsICE9PSBcIkdyb3VwXCIgJiYgbCAhPT0gXCJVUkwgR3JvdXBcIiAmJiBsICE9PSBcIlRpbWUgR3JvdXBcIiAmJiBsICE9PSBcIk1pc2NcIik7XG5cbiAgaWYgKGxhYmVscy5sZW5ndGggPT09IDApIHJldHVybiBcIkdyb3VwXCI7XG4gIHJldHVybiBBcnJheS5mcm9tKG5ldyBTZXQobGFiZWxzKSkuam9pbihcIiAtIFwiKTtcbn07XG5cbmNvbnN0IGdldFN0cmF0ZWd5Q29sb3JSdWxlID0gKHN0cmF0ZWd5SWQ6IHN0cmluZyk6IEdyb3VwaW5nUnVsZSB8IHVuZGVmaW5lZCA9PiB7XG4gICAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3lJZCk7XG4gICAgaWYgKCFjdXN0b20pIHJldHVybiB1bmRlZmluZWQ7XG5cbiAgICBjb25zdCBncm91cGluZ1J1bGVzTGlzdCA9IGFzQXJyYXk8R3JvdXBpbmdSdWxlPihjdXN0b20uZ3JvdXBpbmdSdWxlcyk7XG4gICAgLy8gSXRlcmF0ZSBtYW51YWxseSB0byBjaGVjayBjb2xvclxuICAgIGZvciAobGV0IGkgPSBncm91cGluZ1J1bGVzTGlzdC5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICBjb25zdCBydWxlID0gZ3JvdXBpbmdSdWxlc0xpc3RbaV07XG4gICAgICAgIGlmIChydWxlICYmIHJ1bGUuY29sb3IgJiYgcnVsZS5jb2xvciAhPT0gJ3JhbmRvbScpIHtcbiAgICAgICAgICAgIHJldHVybiBydWxlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB1bmRlZmluZWQ7XG59O1xuXG5jb25zdCByZXNvbHZlV2luZG93TW9kZSA9IChtb2RlczogKHN0cmluZyB8IHVuZGVmaW5lZClbXSk6IFwiY3VycmVudFwiIHwgXCJuZXdcIiB8IFwiY29tcG91bmRcIiA9PiB7XG4gICAgaWYgKG1vZGVzLmluY2x1ZGVzKFwibmV3XCIpKSByZXR1cm4gXCJuZXdcIjtcbiAgICBpZiAobW9kZXMuaW5jbHVkZXMoXCJjb21wb3VuZFwiKSkgcmV0dXJuIFwiY29tcG91bmRcIjtcbiAgICByZXR1cm4gXCJjdXJyZW50XCI7XG59O1xuXG5leHBvcnQgY29uc3QgZ3JvdXBUYWJzID0gKFxuICB0YWJzOiBUYWJNZXRhZGF0YVtdLFxuICBzdHJhdGVnaWVzOiAoU29ydGluZ1N0cmF0ZWd5IHwgc3RyaW5nKVtdXG4pOiBUYWJHcm91cFtdID0+IHtcbiAgY29uc3QgYXZhaWxhYmxlU3RyYXRlZ2llcyA9IGdldFN0cmF0ZWdpZXMoY3VzdG9tU3RyYXRlZ2llcyk7XG4gIGNvbnN0IGVmZmVjdGl2ZVN0cmF0ZWdpZXMgPSBzdHJhdGVnaWVzLmZpbHRlcihzID0+IGF2YWlsYWJsZVN0cmF0ZWdpZXMuZmluZChhdmFpbCA9PiBhdmFpbC5pZCA9PT0gcyk/LmlzR3JvdXBpbmcpO1xuICBjb25zdCBidWNrZXRzID0gbmV3IE1hcDxzdHJpbmcsIFRhYkdyb3VwPigpO1xuXG4gIGNvbnN0IGFsbFRhYnNNYXAgPSBuZXcgTWFwPG51bWJlciwgVGFiTWV0YWRhdGE+KCk7XG4gIHRhYnMuZm9yRWFjaCh0ID0+IGFsbFRhYnNNYXAuc2V0KHQuaWQsIHQpKTtcblxuICB0YWJzLmZvckVhY2goKHRhYikgPT4ge1xuICAgIGxldCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IGFwcGxpZWRTdHJhdGVnaWVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IGNvbGxlY3RlZE1vZGVzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgZm9yIChjb25zdCBzIG9mIGVmZmVjdGl2ZVN0cmF0ZWdpZXMpIHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGdldEdyb3VwaW5nUmVzdWx0KHRhYiwgcyk7XG4gICAgICAgICAgICBpZiAocmVzdWx0LmtleSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGtleXMucHVzaChgJHtzfToke3Jlc3VsdC5rZXl9YCk7XG4gICAgICAgICAgICAgICAgYXBwbGllZFN0cmF0ZWdpZXMucHVzaChzKTtcbiAgICAgICAgICAgICAgICBjb2xsZWN0ZWRNb2Rlcy5wdXNoKHJlc3VsdC5tb2RlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgbG9nRGVidWcoXCJFcnJvciBnZW5lcmF0aW5nIGdyb3VwaW5nIGtleVwiLCB7IHRhYklkOiB0YWIuaWQsIGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgIHJldHVybjsgLy8gU2tpcCB0aGlzIHRhYiBvbiBlcnJvclxuICAgIH1cblxuICAgIC8vIElmIG5vIHN0cmF0ZWdpZXMgYXBwbGllZCAoZS5nLiBhbGwgZmlsdGVyZWQgb3V0KSwgc2tpcCBncm91cGluZyBmb3IgdGhpcyB0YWJcbiAgICBpZiAoa2V5cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGVmZmVjdGl2ZU1vZGUgPSByZXNvbHZlV2luZG93TW9kZShjb2xsZWN0ZWRNb2Rlcyk7XG4gICAgY29uc3QgdmFsdWVLZXkgPSBrZXlzLmpvaW4oXCI6OlwiKTtcbiAgICBsZXQgYnVja2V0S2V5ID0gXCJcIjtcbiAgICBpZiAoZWZmZWN0aXZlTW9kZSA9PT0gJ2N1cnJlbnQnKSB7XG4gICAgICAgICBidWNrZXRLZXkgPSBgd2luZG93LSR7dGFiLndpbmRvd0lkfTo6YCArIHZhbHVlS2V5O1xuICAgIH0gZWxzZSB7XG4gICAgICAgICBidWNrZXRLZXkgPSBgZ2xvYmFsOjpgICsgdmFsdWVLZXk7XG4gICAgfVxuXG4gICAgbGV0IGdyb3VwID0gYnVja2V0cy5nZXQoYnVja2V0S2V5KTtcbiAgICBpZiAoIWdyb3VwKSB7XG4gICAgICBsZXQgZ3JvdXBDb2xvciA9IG51bGw7XG4gICAgICBsZXQgY29sb3JGaWVsZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgbGV0IGNvbG9yVHJhbnNmb3JtOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICBsZXQgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbiAgICAgIGZvciAoY29uc3Qgc0lkIG9mIGFwcGxpZWRTdHJhdGVnaWVzKSB7XG4gICAgICAgIGNvbnN0IHJ1bGUgPSBnZXRTdHJhdGVneUNvbG9yUnVsZShzSWQpO1xuICAgICAgICBpZiAocnVsZSkge1xuICAgICAgICAgICAgZ3JvdXBDb2xvciA9IHJ1bGUuY29sb3I7XG4gICAgICAgICAgICBjb2xvckZpZWxkID0gcnVsZS5jb2xvckZpZWxkO1xuICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm0gPSBydWxlLmNvbG9yVHJhbnNmb3JtO1xuICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuID0gcnVsZS5jb2xvclRyYW5zZm9ybVBhdHRlcm47XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoZ3JvdXBDb2xvciA9PT0gJ21hdGNoJykge1xuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkodmFsdWVLZXksIDApO1xuICAgICAgfSBlbHNlIGlmIChncm91cENvbG9yID09PSAnZmllbGQnICYmIGNvbG9yRmllbGQpIHtcbiAgICAgICAgY29uc3QgdmFsID0gZ2V0RmllbGRWYWx1ZSh0YWIsIGNvbG9yRmllbGQpO1xuICAgICAgICBsZXQga2V5ID0gdmFsICE9PSB1bmRlZmluZWQgJiYgdmFsICE9PSBudWxsID8gU3RyaW5nKHZhbCkgOiBcIlwiO1xuICAgICAgICBpZiAoY29sb3JUcmFuc2Zvcm0pIHtcbiAgICAgICAgICAgIGtleSA9IGFwcGx5VmFsdWVUcmFuc2Zvcm0oa2V5LCBjb2xvclRyYW5zZm9ybSwgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuKTtcbiAgICAgICAgfVxuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkoa2V5LCAwKTtcbiAgICAgIH0gZWxzZSBpZiAoIWdyb3VwQ29sb3IgfHwgZ3JvdXBDb2xvciA9PT0gJ2ZpZWxkJykge1xuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkoYnVja2V0S2V5LCBidWNrZXRzLnNpemUpO1xuICAgICAgfVxuXG4gICAgICBncm91cCA9IHtcbiAgICAgICAgaWQ6IGJ1Y2tldEtleSxcbiAgICAgICAgd2luZG93SWQ6IHRhYi53aW5kb3dJZCxcbiAgICAgICAgbGFiZWw6IFwiXCIsXG4gICAgICAgIGNvbG9yOiBncm91cENvbG9yLFxuICAgICAgICB0YWJzOiBbXSxcbiAgICAgICAgcmVhc29uOiBhcHBsaWVkU3RyYXRlZ2llcy5qb2luKFwiICsgXCIpLFxuICAgICAgICB3aW5kb3dNb2RlOiBlZmZlY3RpdmVNb2RlXG4gICAgICB9O1xuICAgICAgYnVja2V0cy5zZXQoYnVja2V0S2V5LCBncm91cCk7XG4gICAgfVxuICAgIGdyb3VwLnRhYnMucHVzaCh0YWIpO1xuICB9KTtcblxuICBjb25zdCBncm91cHMgPSBBcnJheS5mcm9tKGJ1Y2tldHMudmFsdWVzKCkpO1xuICBncm91cHMuZm9yRWFjaChncm91cCA9PiB7XG4gICAgZ3JvdXAubGFiZWwgPSBnZW5lcmF0ZUxhYmVsKGVmZmVjdGl2ZVN0cmF0ZWdpZXMsIGdyb3VwLnRhYnMsIGFsbFRhYnNNYXApO1xuICB9KTtcblxuICByZXR1cm4gZ3JvdXBzO1xufTtcblxuY29uc3QgY2hlY2tWYWx1ZU1hdGNoID0gKFxuICAgIG9wZXJhdG9yOiBzdHJpbmcsXG4gICAgcmF3VmFsdWU6IGFueSxcbiAgICBydWxlVmFsdWU6IHN0cmluZ1xuKTogeyBpc01hdGNoOiBib29sZWFuOyBtYXRjaE9iajogUmVnRXhwRXhlY0FycmF5IHwgbnVsbCB9ID0+IHtcbiAgICBjb25zdCB2YWx1ZVN0ciA9IHJhd1ZhbHVlICE9PSB1bmRlZmluZWQgJiYgcmF3VmFsdWUgIT09IG51bGwgPyBTdHJpbmcocmF3VmFsdWUpIDogXCJcIjtcbiAgICBjb25zdCB2YWx1ZVRvQ2hlY2sgPSB2YWx1ZVN0ci50b0xvd2VyQ2FzZSgpO1xuICAgIGNvbnN0IHBhdHRlcm5Ub0NoZWNrID0gcnVsZVZhbHVlID8gcnVsZVZhbHVlLnRvTG93ZXJDYXNlKCkgOiBcIlwiO1xuXG4gICAgbGV0IGlzTWF0Y2ggPSBmYWxzZTtcbiAgICBsZXQgbWF0Y2hPYmo6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGwgPSBudWxsO1xuXG4gICAgc3dpdGNoIChvcGVyYXRvcikge1xuICAgICAgICBjYXNlICdjb250YWlucyc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suaW5jbHVkZXMocGF0dGVyblRvQ2hlY2spOyBicmVhaztcbiAgICAgICAgY2FzZSAnZG9lc05vdENvbnRhaW4nOiBpc01hdGNoID0gIXZhbHVlVG9DaGVjay5pbmNsdWRlcyhwYXR0ZXJuVG9DaGVjayk7IGJyZWFrO1xuICAgICAgICBjYXNlICdlcXVhbHMnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrID09PSBwYXR0ZXJuVG9DaGVjazsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3N0YXJ0c1dpdGgnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrLnN0YXJ0c1dpdGgocGF0dGVyblRvQ2hlY2spOyBicmVhaztcbiAgICAgICAgY2FzZSAnZW5kc1dpdGgnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrLmVuZHNXaXRoKHBhdHRlcm5Ub0NoZWNrKTsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2V4aXN0cyc6IGlzTWF0Y2ggPSByYXdWYWx1ZSAhPT0gdW5kZWZpbmVkOyBicmVhaztcbiAgICAgICAgY2FzZSAnZG9lc05vdEV4aXN0JzogaXNNYXRjaCA9IHJhd1ZhbHVlID09PSB1bmRlZmluZWQ7IGJyZWFrO1xuICAgICAgICBjYXNlICdpc051bGwnOiBpc01hdGNoID0gcmF3VmFsdWUgPT09IG51bGw7IGJyZWFrO1xuICAgICAgICBjYXNlICdpc05vdE51bGwnOiBpc01hdGNoID0gcmF3VmFsdWUgIT09IG51bGw7IGJyZWFrO1xuICAgICAgICBjYXNlICdtYXRjaGVzJzpcbiAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChydWxlVmFsdWUsICdpJyk7XG4gICAgICAgICAgICAgICAgbWF0Y2hPYmogPSByZWdleC5leGVjKHZhbHVlU3RyKTtcbiAgICAgICAgICAgICAgICBpc01hdGNoID0gISFtYXRjaE9iajtcbiAgICAgICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICByZXR1cm4geyBpc01hdGNoLCBtYXRjaE9iaiB9O1xufTtcblxuZXhwb3J0IGNvbnN0IGNoZWNrQ29uZGl0aW9uID0gKGNvbmRpdGlvbjogUnVsZUNvbmRpdGlvbiwgdGFiOiBUYWJNZXRhZGF0YSk6IGJvb2xlYW4gPT4ge1xuICAgIGlmICghY29uZGl0aW9uKSByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgcmF3VmFsdWUgPSBnZXRGaWVsZFZhbHVlKHRhYiwgY29uZGl0aW9uLmZpZWxkKTtcbiAgICBjb25zdCB7IGlzTWF0Y2ggfSA9IGNoZWNrVmFsdWVNYXRjaChjb25kaXRpb24ub3BlcmF0b3IsIHJhd1ZhbHVlLCBjb25kaXRpb24udmFsdWUpO1xuICAgIHJldHVybiBpc01hdGNoO1xufTtcblxuZXhwb3J0IGNvbnN0IGFwcGx5VmFsdWVUcmFuc2Zvcm0gPSAodmFsOiBzdHJpbmcsIHRyYW5zZm9ybTogc3RyaW5nLCBwYXR0ZXJuPzogc3RyaW5nLCByZXBsYWNlbWVudD86IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgaWYgKCF2YWwgfHwgIXRyYW5zZm9ybSB8fCB0cmFuc2Zvcm0gPT09ICdub25lJykgcmV0dXJuIHZhbDtcblxuICAgIHN3aXRjaCAodHJhbnNmb3JtKSB7XG4gICAgICAgIGNhc2UgJ3N0cmlwVGxkJzpcbiAgICAgICAgICAgIHJldHVybiBzdHJpcFRsZCh2YWwpO1xuICAgICAgICBjYXNlICdsb3dlcmNhc2UnOlxuICAgICAgICAgICAgcmV0dXJuIHZhbC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICBjYXNlICd1cHBlcmNhc2UnOlxuICAgICAgICAgICAgcmV0dXJuIHZhbC50b1VwcGVyQ2FzZSgpO1xuICAgICAgICBjYXNlICdmaXJzdENoYXInOlxuICAgICAgICAgICAgcmV0dXJuIHZhbC5jaGFyQXQoMCk7XG4gICAgICAgIGNhc2UgJ2RvbWFpbic6XG4gICAgICAgICAgICByZXR1cm4gZG9tYWluRnJvbVVybCh2YWwpO1xuICAgICAgICBjYXNlICdob3N0bmFtZSc6XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICByZXR1cm4gbmV3IFVSTCh2YWwpLmhvc3RuYW1lO1xuICAgICAgICAgICAgfSBjYXRjaCB7IHJldHVybiB2YWw7IH1cbiAgICAgICAgY2FzZSAncmVnZXgnOlxuICAgICAgICAgICAgaWYgKHBhdHRlcm4pIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBsZXQgcmVnZXggPSByZWdleENhY2hlLmdldChwYXR0ZXJuKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFyZWdleCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVnZXggPSBuZXcgUmVnRXhwKHBhdHRlcm4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVnZXhDYWNoZS5zZXQocGF0dGVybiwgcmVnZXgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1hdGNoID0gcmVnZXguZXhlYyh2YWwpO1xuICAgICAgICAgICAgICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBleHRyYWN0ZWQgPSBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBtYXRjaC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4dHJhY3RlZCArPSBtYXRjaFtpXSB8fCBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGV4dHJhY3RlZDtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkludmFsaWQgcmVnZXggaW4gdHJhbnNmb3JtXCIsIHsgcGF0dGVybjogcGF0dGVybiwgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgY2FzZSAncmVnZXhSZXBsYWNlJzpcbiAgICAgICAgICAgICBpZiAocGF0dGVybikge1xuICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgLy8gVXNpbmcgJ2cnIGdsb2JhbCBmbGFnIGJ5IGRlZmF1bHQgZm9yIHJlcGxhY2VtZW50XG4gICAgICAgICAgICAgICAgICAgICByZXR1cm4gdmFsLnJlcGxhY2UobmV3IFJlZ0V4cChwYXR0ZXJuLCAnZycpLCByZXBsYWNlbWVudCB8fCBcIlwiKTtcbiAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICAgbG9nRGVidWcoXCJJbnZhbGlkIHJlZ2V4IGluIHRyYW5zZm9ybVwiLCB7IHBhdHRlcm46IHBhdHRlcm4sIGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgICAgICAgICAgICAgICByZXR1cm4gdmFsO1xuICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgfVxuICAgICAgICAgICAgIHJldHVybiB2YWw7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICByZXR1cm4gdmFsO1xuICAgIH1cbn07XG5cbmZ1bmN0aW9uIGV2YWx1YXRlTGVnYWN5UnVsZXMobGVnYWN5UnVsZXM6IFN0cmF0ZWd5UnVsZVtdLCB0YWI6IFRhYk1ldGFkYXRhKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgLy8gRGVmZW5zaXZlIGNoZWNrXG4gICAgaWYgKCFsZWdhY3lSdWxlcyB8fCAhQXJyYXkuaXNBcnJheShsZWdhY3lSdWxlcykpIHtcbiAgICAgICAgaWYgKCFsZWdhY3lSdWxlcykgcmV0dXJuIG51bGw7XG4gICAgICAgIC8vIFRyeSBhc0FycmF5IGlmIGl0J3Mgbm90IGFycmF5IGJ1dCB0cnV0aHkgKHVubGlrZWx5IGdpdmVuIHByZXZpb3VzIGxvZ2ljIGJ1dCBzYWZlKVxuICAgIH1cblxuICAgIGNvbnN0IGxlZ2FjeVJ1bGVzTGlzdCA9IGFzQXJyYXk8U3RyYXRlZ3lSdWxlPihsZWdhY3lSdWxlcyk7XG4gICAgaWYgKGxlZ2FjeVJ1bGVzTGlzdC5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGxlZ2FjeVJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IHJhd1ZhbHVlID0gZ2V0RmllbGRWYWx1ZSh0YWIsIHJ1bGUuZmllbGQpO1xuICAgICAgICAgICAgY29uc3QgeyBpc01hdGNoLCBtYXRjaE9iaiB9ID0gY2hlY2tWYWx1ZU1hdGNoKHJ1bGUub3BlcmF0b3IsIHJhd1ZhbHVlLCBydWxlLnZhbHVlKTtcblxuICAgICAgICAgICAgaWYgKGlzTWF0Y2gpIHtcbiAgICAgICAgICAgICAgICBsZXQgcmVzdWx0ID0gcnVsZS5yZXN1bHQ7XG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoT2JqKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgbWF0Y2hPYmoubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShuZXcgUmVnRXhwKGBcXFxcJCR7aX1gLCAnZycpLCBtYXRjaE9ialtpXSB8fCBcIlwiKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgbG9nRGVidWcoXCJFcnJvciBldmFsdWF0aW5nIGxlZ2FjeSBydWxlc1wiLCB7IGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGNvbnN0IGdldEdyb3VwaW5nUmVzdWx0ID0gKHRhYjogVGFiTWV0YWRhdGEsIHN0cmF0ZWd5OiBHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nKTogeyBrZXk6IHN0cmluZyB8IG51bGwsIG1vZGU6IFwiY3VycmVudFwiIHwgXCJuZXdcIiB8IFwiY29tcG91bmRcIiB9ID0+IHtcbiAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3kpO1xuICBpZiAoY3VzdG9tKSB7XG4gICAgICBjb25zdCBmaWx0ZXJHcm91cHNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uW10+KGN1c3RvbS5maWx0ZXJHcm91cHMpO1xuICAgICAgY29uc3QgZmlsdGVyc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGN1c3RvbS5maWx0ZXJzKTtcblxuICAgICAgbGV0IG1hdGNoID0gZmFsc2U7XG5cbiAgICAgIGlmIChmaWx0ZXJHcm91cHNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAvLyBPUiBsb2dpY1xuICAgICAgICAgIGZvciAoY29uc3QgZ3JvdXAgb2YgZmlsdGVyR3JvdXBzTGlzdCkge1xuICAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihncm91cCk7XG4gICAgICAgICAgICAgIGlmIChncm91cFJ1bGVzLmxlbmd0aCA9PT0gMCB8fCBncm91cFJ1bGVzLmV2ZXJ5KHIgPT4gY2hlY2tDb25kaXRpb24ociwgdGFiKSkpIHtcbiAgICAgICAgICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChmaWx0ZXJzTGlzdC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgLy8gTGVnYWN5L1NpbXBsZSBBTkQgbG9naWNcbiAgICAgICAgICBpZiAoZmlsdGVyc0xpc3QuZXZlcnkoZiA9PiBjaGVja0NvbmRpdGlvbihmLCB0YWIpKSkge1xuICAgICAgICAgICAgICBtYXRjaCA9IHRydWU7XG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBObyBmaWx0ZXJzIC0+IE1hdGNoIGFsbFxuICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFtYXRjaCkge1xuICAgICAgICAgIHJldHVybiB7IGtleTogbnVsbCwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZ3JvdXBpbmdSdWxlc0xpc3QgPSBhc0FycmF5PEdyb3VwaW5nUnVsZT4oY3VzdG9tLmdyb3VwaW5nUnVsZXMpO1xuICAgICAgaWYgKGdyb3VwaW5nUnVsZXNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICBjb25zdCBtb2Rlczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwaW5nUnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICBsZXQgdmFsID0gXCJcIjtcbiAgICAgICAgICAgICAgICBpZiAocnVsZS5zb3VyY2UgPT09ICdmaWVsZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJhdyA9IGdldEZpZWxkVmFsdWUodGFiLCBydWxlLnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHJhdyAhPT0gdW5kZWZpbmVkICYmIHJhdyAhPT0gbnVsbCA/IFN0cmluZyhyYXcpIDogXCJcIjtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgdmFsID0gcnVsZS52YWx1ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodmFsICYmIHJ1bGUudHJhbnNmb3JtICYmIHJ1bGUudHJhbnNmb3JtICE9PSAnbm9uZScpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFsID0gYXBwbHlWYWx1ZVRyYW5zZm9ybSh2YWwsIHJ1bGUudHJhbnNmb3JtLCBydWxlLnRyYW5zZm9ybVBhdHRlcm4sIHJ1bGUudHJhbnNmb3JtUmVwbGFjZW1lbnQpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh2YWwpIHtcbiAgICAgICAgICAgICAgICAgICAgcGFydHMucHVzaCh2YWwpO1xuICAgICAgICAgICAgICAgICAgICBpZiAocnVsZS53aW5kb3dNb2RlKSBtb2Rlcy5wdXNoKHJ1bGUud2luZG93TW9kZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGFwcGx5aW5nIGdyb3VwaW5nIHJ1bGVzXCIsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICByZXR1cm4geyBrZXk6IHBhcnRzLmpvaW4oXCIgLSBcIiksIG1vZGU6IHJlc29sdmVXaW5kb3dNb2RlKG1vZGVzKSB9O1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4geyBrZXk6IGN1c3RvbS5mYWxsYmFjayB8fCBcIk1pc2NcIiwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH0gZWxzZSBpZiAoY3VzdG9tLnJ1bGVzKSB7XG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0gZXZhbHVhdGVMZWdhY3lSdWxlcyhhc0FycmF5PFN0cmF0ZWd5UnVsZT4oY3VzdG9tLnJ1bGVzKSwgdGFiKTtcbiAgICAgICAgICBpZiAocmVzdWx0KSByZXR1cm4geyBrZXk6IHJlc3VsdCwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHsga2V5OiBjdXN0b20uZmFsbGJhY2sgfHwgXCJNaXNjXCIsIG1vZGU6IFwiY3VycmVudFwiIH07XG4gIH1cblxuICAvLyBCdWlsdC1pbiBzdHJhdGVnaWVzXG4gIGxldCBzaW1wbGVLZXk6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBzd2l0Y2ggKHN0cmF0ZWd5KSB7XG4gICAgY2FzZSBcImRvbWFpblwiOlxuICAgIGNhc2UgXCJkb21haW5fZnVsbFwiOlxuICAgICAgc2ltcGxlS2V5ID0gZG9tYWluRnJvbVVybCh0YWIudXJsKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJ0b3BpY1wiOlxuICAgICAgc2ltcGxlS2V5ID0gc2VtYW50aWNCdWNrZXQodGFiLnRpdGxlLCB0YWIudXJsKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJsaW5lYWdlXCI6XG4gICAgICBzaW1wbGVLZXkgPSBuYXZpZ2F0aW9uS2V5KHRhYik7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwiY29udGV4dFwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLmNvbnRleHQgfHwgXCJVbmNhdGVnb3JpemVkXCI7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwicGlubmVkXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIucGlubmVkID8gXCJwaW5uZWRcIiA6IFwidW5waW5uZWRcIjtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJhZ2VcIjpcbiAgICAgIHNpbXBsZUtleSA9IGdldFJlY2VuY3lMYWJlbCh0YWIubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInVybFwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLnVybDtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJ0aXRsZVwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLnRpdGxlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInJlY2VuY3lcIjpcbiAgICAgIHNpbXBsZUtleSA9IFN0cmluZyh0YWIubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcIm5lc3RpbmdcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkID8gXCJjaGlsZFwiIDogXCJyb290XCI7XG4gICAgICBicmVhaztcbiAgICBkZWZhdWx0OlxuICAgICAgICBjb25zdCB2YWwgPSBnZXRGaWVsZFZhbHVlKHRhYiwgc3RyYXRlZ3kpO1xuICAgICAgICBpZiAodmFsICE9PSB1bmRlZmluZWQgJiYgdmFsICE9PSBudWxsKSB7XG4gICAgICAgICAgICBzaW1wbGVLZXkgPSBTdHJpbmcodmFsKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNpbXBsZUtleSA9IFwiVW5rbm93blwiO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICB9XG4gIHJldHVybiB7IGtleTogc2ltcGxlS2V5LCBtb2RlOiBcImN1cnJlbnRcIiB9O1xufTtcblxuZXhwb3J0IGNvbnN0IGdyb3VwaW5nS2V5ID0gKHRhYjogVGFiTWV0YWRhdGEsIHN0cmF0ZWd5OiBHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gICAgcmV0dXJuIGdldEdyb3VwaW5nUmVzdWx0KHRhYiwgc3RyYXRlZ3kpLmtleTtcbn07XG5cbmZ1bmN0aW9uIGlzQ29udGV4dEZpZWxkKGZpZWxkOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICByZXR1cm4gZmllbGQgPT09ICdjb250ZXh0JyB8fCBmaWVsZCA9PT0gJ2dlbnJlJyB8fCBmaWVsZCA9PT0gJ3NpdGVOYW1lJyB8fCBmaWVsZC5zdGFydHNXaXRoKCdjb250ZXh0RGF0YS4nKTtcbn1cblxuZXhwb3J0IGNvbnN0IHJlcXVpcmVzQ29udGV4dEFuYWx5c2lzID0gKHN0cmF0ZWd5SWRzOiAoc3RyaW5nIHwgU29ydGluZ1N0cmF0ZWd5KVtdKTogYm9vbGVhbiA9PiB7XG4gICAgLy8gQ2hlY2sgaWYgXCJjb250ZXh0XCIgc3RyYXRlZ3kgaXMgZXhwbGljaXRseSByZXF1ZXN0ZWRcbiAgICBpZiAoc3RyYXRlZ3lJZHMuaW5jbHVkZXMoXCJjb250ZXh0XCIpKSByZXR1cm4gdHJ1ZTtcblxuICAgIGNvbnN0IHN0cmF0ZWdpZXMgPSBnZXRTdHJhdGVnaWVzKGN1c3RvbVN0cmF0ZWdpZXMpO1xuICAgIC8vIGZpbHRlciBvbmx5IHRob3NlIHRoYXQgbWF0Y2ggdGhlIHJlcXVlc3RlZCBJRHNcbiAgICBjb25zdCBhY3RpdmVEZWZzID0gc3RyYXRlZ2llcy5maWx0ZXIocyA9PiBzdHJhdGVneUlkcy5pbmNsdWRlcyhzLmlkKSk7XG5cbiAgICBmb3IgKGNvbnN0IGRlZiBvZiBhY3RpdmVEZWZzKSB7XG4gICAgICAgIC8vIElmIGl0J3MgYSBidWlsdC1pbiBzdHJhdGVneSB0aGF0IG5lZWRzIGNvbnRleHQgKG9ubHkgJ2NvbnRleHQnIGRvZXMpXG4gICAgICAgIGlmIChkZWYuaWQgPT09ICdjb250ZXh0JykgcmV0dXJuIHRydWU7XG5cbiAgICAgICAgLy8gSWYgaXQgaXMgYSBjdXN0b20gc3RyYXRlZ3kgKG9yIG92ZXJyaWRlcyBidWlsdC1pbiksIGNoZWNrIGl0cyBydWxlc1xuICAgICAgICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQoYyA9PiBjLmlkID09PSBkZWYuaWQpO1xuICAgICAgICBpZiAoY3VzdG9tKSB7XG4gICAgICAgICAgICAgY29uc3QgZ3JvdXBSdWxlc0xpc3QgPSBhc0FycmF5PEdyb3VwaW5nUnVsZT4oY3VzdG9tLmdyb3VwaW5nUnVsZXMpO1xuICAgICAgICAgICAgIGNvbnN0IHNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihjdXN0b20uc29ydGluZ1J1bGVzKTtcbiAgICAgICAgICAgICBjb25zdCBncm91cFNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihjdXN0b20uZ3JvdXBTb3J0aW5nUnVsZXMpO1xuICAgICAgICAgICAgIGNvbnN0IGZpbHRlcnNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihjdXN0b20uZmlsdGVycyk7XG4gICAgICAgICAgICAgY29uc3QgZmlsdGVyR3JvdXBzTGlzdCA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbltdPihjdXN0b20uZmlsdGVyR3JvdXBzKTtcblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBydWxlLnNvdXJjZSA9PT0gJ2ZpZWxkJyAmJiBpc0NvbnRleHRGaWVsZChydWxlLnZhbHVlKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIHJ1bGUuY29sb3IgPT09ICdmaWVsZCcgJiYgcnVsZS5jb2xvckZpZWxkICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuY29sb3JGaWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBzb3J0UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZ3JvdXBTb3J0UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZmlsdGVyc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgZ3JvdXAgb2YgZmlsdGVyR3JvdXBzTGlzdCkge1xuICAgICAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihncm91cCk7XG4gICAgICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFJ1bGVzKSB7XG4gICAgICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBpc0NvbnRleHRGaWVsZChydWxlLmZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufTtcbiIsICJpbXBvcnQgeyBTb3J0aW5nU3RyYXRlZ3ksIFRhYk1ldGFkYXRhLCBDdXN0b21TdHJhdGVneSwgU29ydGluZ1J1bGUgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBkb21haW5Gcm9tVXJsLCBzZW1hbnRpY0J1Y2tldCwgbmF2aWdhdGlvbktleSwgZ3JvdXBpbmdLZXksIGdldEZpZWxkVmFsdWUsIGdldEN1c3RvbVN0cmF0ZWdpZXMgfSBmcm9tIFwiLi9ncm91cGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tIFwiLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5cbmV4cG9ydCBjb25zdCByZWNlbmN5U2NvcmUgPSAodGFiOiBUYWJNZXRhZGF0YSkgPT4gdGFiLmxhc3RBY2Nlc3NlZCA/PyAwO1xuZXhwb3J0IGNvbnN0IGhpZXJhcmNoeVNjb3JlID0gKHRhYjogVGFiTWV0YWRhdGEpID0+ICh0YWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCA/IDEgOiAwKTtcbmV4cG9ydCBjb25zdCBwaW5uZWRTY29yZSA9ICh0YWI6IFRhYk1ldGFkYXRhKSA9PiAodGFiLnBpbm5lZCA/IDAgOiAxKTtcblxuZXhwb3J0IGNvbnN0IHNvcnRUYWJzID0gKHRhYnM6IFRhYk1ldGFkYXRhW10sIHN0cmF0ZWdpZXM6IFNvcnRpbmdTdHJhdGVneVtdKTogVGFiTWV0YWRhdGFbXSA9PiB7XG4gIGNvbnN0IHNjb3Jpbmc6IFNvcnRpbmdTdHJhdGVneVtdID0gc3RyYXRlZ2llcy5sZW5ndGggPyBzdHJhdGVnaWVzIDogW1wicGlubmVkXCIsIFwicmVjZW5jeVwiXTtcbiAgcmV0dXJuIFsuLi50YWJzXS5zb3J0KChhLCBiKSA9PiB7XG4gICAgZm9yIChjb25zdCBzdHJhdGVneSBvZiBzY29yaW5nKSB7XG4gICAgICBjb25zdCBkaWZmID0gY29tcGFyZUJ5KHN0cmF0ZWd5LCBhLCBiKTtcbiAgICAgIGlmIChkaWZmICE9PSAwKSByZXR1cm4gZGlmZjtcbiAgICB9XG4gICAgcmV0dXJuIGEuaWQgLSBiLmlkO1xuICB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBjb21wYXJlQnkgPSAoc3RyYXRlZ3k6IFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZywgYTogVGFiTWV0YWRhdGEsIGI6IFRhYk1ldGFkYXRhKTogbnVtYmVyID0+IHtcbiAgLy8gMS4gQ2hlY2sgQ3VzdG9tIFN0cmF0ZWdpZXMgZm9yIFNvcnRpbmcgUnVsZXNcbiAgY29uc3QgY3VzdG9tU3RyYXRzID0gZ2V0Q3VzdG9tU3RyYXRlZ2llcygpO1xuICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdHMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5KTtcbiAgaWYgKGN1c3RvbSkge1xuICAgICAgY29uc3Qgc29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KGN1c3RvbS5zb3J0aW5nUnVsZXMpO1xuICAgICAgaWYgKHNvcnRSdWxlc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIC8vIEV2YWx1YXRlIGN1c3RvbSBzb3J0aW5nIHJ1bGVzIGluIG9yZGVyXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIHNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgIGlmICghcnVsZSkgY29udGludWU7XG4gICAgICAgICAgICAgICAgICBjb25zdCB2YWxBID0gZ2V0RmllbGRWYWx1ZShhLCBydWxlLmZpZWxkKTtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IHZhbEIgPSBnZXRGaWVsZFZhbHVlKGIsIHJ1bGUuZmllbGQpO1xuXG4gICAgICAgICAgICAgICAgICBsZXQgcmVzdWx0ID0gMDtcbiAgICAgICAgICAgICAgICAgIGlmICh2YWxBIDwgdmFsQikgcmVzdWx0ID0gLTE7XG4gICAgICAgICAgICAgICAgICBlbHNlIGlmICh2YWxBID4gdmFsQikgcmVzdWx0ID0gMTtcblxuICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdCAhPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBydWxlLm9yZGVyID09PSAnZGVzYycgPyAtcmVzdWx0IDogcmVzdWx0O1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGV2YWx1YXRpbmcgY3VzdG9tIHNvcnRpbmcgcnVsZXNcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBJZiBhbGwgcnVsZXMgZXF1YWwsIGNvbnRpbnVlIHRvIG5leHQgc3RyYXRlZ3kgKHJldHVybiAwKVxuICAgICAgICAgIHJldHVybiAwO1xuICAgICAgfVxuICB9XG5cbiAgLy8gMi4gQnVpbHQtaW4gb3IgZmFsbGJhY2tcbiAgc3dpdGNoIChzdHJhdGVneSkge1xuICAgIGNhc2UgXCJyZWNlbmN5XCI6XG4gICAgICByZXR1cm4gKGIubGFzdEFjY2Vzc2VkID8/IDApIC0gKGEubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgIGNhc2UgXCJuZXN0aW5nXCI6IC8vIEZvcm1lcmx5IGhpZXJhcmNoeVxuICAgICAgcmV0dXJuIGhpZXJhcmNoeVNjb3JlKGEpIC0gaGllcmFyY2h5U2NvcmUoYik7XG4gICAgY2FzZSBcInBpbm5lZFwiOlxuICAgICAgcmV0dXJuIHBpbm5lZFNjb3JlKGEpIC0gcGlubmVkU2NvcmUoYik7XG4gICAgY2FzZSBcInRpdGxlXCI6XG4gICAgICByZXR1cm4gYS50aXRsZS5sb2NhbGVDb21wYXJlKGIudGl0bGUpO1xuICAgIGNhc2UgXCJ1cmxcIjpcbiAgICAgIHJldHVybiBhLnVybC5sb2NhbGVDb21wYXJlKGIudXJsKTtcbiAgICBjYXNlIFwiY29udGV4dFwiOlxuICAgICAgcmV0dXJuIChhLmNvbnRleHQgPz8gXCJcIikubG9jYWxlQ29tcGFyZShiLmNvbnRleHQgPz8gXCJcIik7XG4gICAgY2FzZSBcImRvbWFpblwiOlxuICAgIGNhc2UgXCJkb21haW5fZnVsbFwiOlxuICAgICAgcmV0dXJuIGRvbWFpbkZyb21VcmwoYS51cmwpLmxvY2FsZUNvbXBhcmUoZG9tYWluRnJvbVVybChiLnVybCkpO1xuICAgIGNhc2UgXCJ0b3BpY1wiOlxuICAgICAgcmV0dXJuIHNlbWFudGljQnVja2V0KGEudGl0bGUsIGEudXJsKS5sb2NhbGVDb21wYXJlKHNlbWFudGljQnVja2V0KGIudGl0bGUsIGIudXJsKSk7XG4gICAgY2FzZSBcImxpbmVhZ2VcIjpcbiAgICAgIHJldHVybiBuYXZpZ2F0aW9uS2V5KGEpLmxvY2FsZUNvbXBhcmUobmF2aWdhdGlvbktleShiKSk7XG4gICAgY2FzZSBcImFnZVwiOlxuICAgICAgLy8gUmV2ZXJzZSBhbHBoYWJldGljYWwgZm9yIGFnZSBidWNrZXRzIChUb2RheSA8IFllc3RlcmRheSksIHJvdWdoIGFwcHJveFxuICAgICAgcmV0dXJuIChncm91cGluZ0tleShhLCBcImFnZVwiKSB8fCBcIlwiKS5sb2NhbGVDb21wYXJlKGdyb3VwaW5nS2V5KGIsIFwiYWdlXCIpIHx8IFwiXCIpO1xuICAgIGRlZmF1bHQ6XG4gICAgICAvLyBDaGVjayBpZiBpdCdzIGEgZ2VuZXJpYyBmaWVsZCBmaXJzdFxuICAgICAgY29uc3QgdmFsQSA9IGdldEZpZWxkVmFsdWUoYSwgc3RyYXRlZ3kpO1xuICAgICAgY29uc3QgdmFsQiA9IGdldEZpZWxkVmFsdWUoYiwgc3RyYXRlZ3kpO1xuXG4gICAgICBpZiAodmFsQSAhPT0gdW5kZWZpbmVkICYmIHZhbEIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGlmICh2YWxBIDwgdmFsQikgcmV0dXJuIC0xO1xuICAgICAgICAgIGlmICh2YWxBID4gdmFsQikgcmV0dXJuIDE7XG4gICAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9XG5cbiAgICAgIC8vIEZhbGxiYWNrIGZvciBjdXN0b20gc3RyYXRlZ2llcyBncm91cGluZyBrZXkgKGlmIHVzaW5nIGN1c3RvbSBzdHJhdGVneSBhcyBzb3J0aW5nIGJ1dCBubyBzb3J0aW5nIHJ1bGVzIGRlZmluZWQpXG4gICAgICAvLyBvciB1bmhhbmRsZWQgYnVpbHQtaW5zXG4gICAgICByZXR1cm4gKGdyb3VwaW5nS2V5KGEsIHN0cmF0ZWd5KSB8fCBcIlwiKS5sb2NhbGVDb21wYXJlKGdyb3VwaW5nS2V5KGIsIHN0cmF0ZWd5KSB8fCBcIlwiKTtcbiAgfVxufTtcbiIsICIvLyBsb2dpYy50c1xuLy8gUHVyZSBmdW5jdGlvbnMgZm9yIGV4dHJhY3Rpb24gbG9naWNcblxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZVVybCh1cmxTdHI6IHN0cmluZyk6IHN0cmluZyB7XG4gIHRyeSB7XG4gICAgY29uc3QgdXJsID0gbmV3IFVSTCh1cmxTdHIpO1xuICAgIGNvbnN0IHBhcmFtcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXModXJsLnNlYXJjaCk7XG4gICAgY29uc3Qga2V5czogc3RyaW5nW10gPSBbXTtcbiAgICBwYXJhbXMuZm9yRWFjaCgoXywga2V5KSA9PiBrZXlzLnB1c2goa2V5KSk7XG4gICAgY29uc3QgaG9zdG5hbWUgPSB1cmwuaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sICcnKTtcblxuICAgIGNvbnN0IFRSQUNLSU5HID0gWy9edXRtXy8sIC9eZmJjbGlkJC8sIC9eZ2NsaWQkLywgL15fZ2EkLywgL15yZWYkLywgL155Y2xpZCQvLCAvXl9ocy9dO1xuICAgIGNvbnN0IGlzWW91dHViZSA9IGhvc3RuYW1lLmVuZHNXaXRoKCd5b3V0dWJlLmNvbScpIHx8IGhvc3RuYW1lLmVuZHNXaXRoKCd5b3V0dS5iZScpO1xuICAgIGNvbnN0IGlzR29vZ2xlID0gaG9zdG5hbWUuZW5kc1dpdGgoJ2dvb2dsZS5jb20nKTtcblxuICAgIGNvbnN0IGtlZXA6IHN0cmluZ1tdID0gW107XG4gICAgaWYgKGlzWW91dHViZSkga2VlcC5wdXNoKCd2JywgJ2xpc3QnLCAndCcsICdjJywgJ2NoYW5uZWwnLCAncGxheWxpc3QnKTtcbiAgICBpZiAoaXNHb29nbGUpIGtlZXAucHVzaCgncScsICdpZCcsICdzb3VyY2VpZCcpO1xuXG4gICAgZm9yIChjb25zdCBrZXkgb2Yga2V5cykge1xuICAgICAgaWYgKFRSQUNLSU5HLnNvbWUociA9PiByLnRlc3Qoa2V5KSkpIHtcbiAgICAgICAgIHBhcmFtcy5kZWxldGUoa2V5KTtcbiAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKChpc1lvdXR1YmUgfHwgaXNHb29nbGUpICYmICFrZWVwLmluY2x1ZGVzKGtleSkpIHtcbiAgICAgICAgIHBhcmFtcy5kZWxldGUoa2V5KTtcbiAgICAgIH1cbiAgICB9XG4gICAgdXJsLnNlYXJjaCA9IHBhcmFtcy50b1N0cmluZygpO1xuICAgIHJldHVybiB1cmwudG9TdHJpbmcoKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIHJldHVybiB1cmxTdHI7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlWW91VHViZVVybCh1cmxTdHI6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHVybCA9IG5ldyBVUkwodXJsU3RyKTtcbiAgICAgICAgY29uc3QgdiA9IHVybC5zZWFyY2hQYXJhbXMuZ2V0KCd2Jyk7XG4gICAgICAgIGNvbnN0IGlzU2hvcnRzID0gdXJsLnBhdGhuYW1lLmluY2x1ZGVzKCcvc2hvcnRzLycpO1xuICAgICAgICBsZXQgdmlkZW9JZCA9XG4gICAgICAgICAgdiB8fFxuICAgICAgICAgIChpc1Nob3J0cyA/IHVybC5wYXRobmFtZS5zcGxpdCgnL3Nob3J0cy8nKVsxXSA6IG51bGwpIHx8XG4gICAgICAgICAgKHVybC5ob3N0bmFtZSA9PT0gJ3lvdXR1LmJlJyA/IHVybC5wYXRobmFtZS5yZXBsYWNlKCcvJywgJycpIDogbnVsbCk7XG5cbiAgICAgICAgY29uc3QgcGxheWxpc3RJZCA9IHVybC5zZWFyY2hQYXJhbXMuZ2V0KCdsaXN0Jyk7XG4gICAgICAgIGNvbnN0IHBsYXlsaXN0SW5kZXggPSBwYXJzZUludCh1cmwuc2VhcmNoUGFyYW1zLmdldCgnaW5kZXgnKSB8fCAnMCcsIDEwKTtcblxuICAgICAgICByZXR1cm4geyB2aWRlb0lkLCBpc1Nob3J0cywgcGxheWxpc3RJZCwgcGxheWxpc3RJbmRleCB9O1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcmV0dXJuIHsgdmlkZW9JZDogbnVsbCwgaXNTaG9ydHM6IGZhbHNlLCBwbGF5bGlzdElkOiBudWxsLCBwbGF5bGlzdEluZGV4OiBudWxsIH07XG4gICAgfVxufVxuXG5mdW5jdGlvbiBleHRyYWN0QXV0aG9yKGVudGl0eTogYW55KTogc3RyaW5nIHwgbnVsbCB7XG4gICAgaWYgKCFlbnRpdHkgfHwgIWVudGl0eS5hdXRob3IpIHJldHVybiBudWxsO1xuICAgIGlmICh0eXBlb2YgZW50aXR5LmF1dGhvciA9PT0gJ3N0cmluZycpIHJldHVybiBlbnRpdHkuYXV0aG9yO1xuICAgIGlmIChBcnJheS5pc0FycmF5KGVudGl0eS5hdXRob3IpKSByZXR1cm4gZW50aXR5LmF1dGhvclswXT8ubmFtZSB8fCBudWxsO1xuICAgIGlmICh0eXBlb2YgZW50aXR5LmF1dGhvciA9PT0gJ29iamVjdCcpIHJldHVybiBlbnRpdHkuYXV0aG9yLm5hbWUgfHwgbnVsbDtcbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gZXh0cmFjdEtleXdvcmRzKGVudGl0eTogYW55KTogc3RyaW5nW10ge1xuICAgIGlmICghZW50aXR5IHx8ICFlbnRpdHkua2V5d29yZHMpIHJldHVybiBbXTtcbiAgICBpZiAodHlwZW9mIGVudGl0eS5rZXl3b3JkcyA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmV0dXJuIGVudGl0eS5rZXl3b3Jkcy5zcGxpdCgnLCcpLm1hcCgoczogc3RyaW5nKSA9PiBzLnRyaW0oKSk7XG4gICAgfVxuICAgIGlmIChBcnJheS5pc0FycmF5KGVudGl0eS5rZXl3b3JkcykpIHJldHVybiBlbnRpdHkua2V5d29yZHM7XG4gICAgcmV0dXJuIFtdO1xufVxuXG5mdW5jdGlvbiBleHRyYWN0QnJlYWRjcnVtYnMoanNvbkxkOiBhbnlbXSk6IHN0cmluZ1tdIHtcbiAgICBjb25zdCBicmVhZGNydW1iTGQgPSBqc29uTGQuZmluZChpID0+IGkgJiYgaVsnQHR5cGUnXSA9PT0gJ0JyZWFkY3J1bWJMaXN0Jyk7XG4gICAgaWYgKCFicmVhZGNydW1iTGQgfHwgIUFycmF5LmlzQXJyYXkoYnJlYWRjcnVtYkxkLml0ZW1MaXN0RWxlbWVudCkpIHJldHVybiBbXTtcblxuICAgIGNvbnN0IGxpc3QgPSBicmVhZGNydW1iTGQuaXRlbUxpc3RFbGVtZW50LnNvcnQoKGE6IGFueSwgYjogYW55KSA9PiAoYS5wb3NpdGlvbiB8fCAwKSAtIChiLnBvc2l0aW9uIHx8IDApKTtcbiAgICBjb25zdCBicmVhZGNydW1iczogc3RyaW5nW10gPSBbXTtcbiAgICBsaXN0LmZvckVhY2goKGl0ZW06IGFueSkgPT4ge1xuICAgICAgICBpZiAoaXRlbS5uYW1lKSBicmVhZGNydW1icy5wdXNoKGl0ZW0ubmFtZSk7XG4gICAgICAgIGVsc2UgaWYgKGl0ZW0uaXRlbSAmJiBpdGVtLml0ZW0ubmFtZSkgYnJlYWRjcnVtYnMucHVzaChpdGVtLml0ZW0ubmFtZSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIGJyZWFkY3J1bWJzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXh0cmFjdEpzb25MZEZpZWxkcyhqc29uTGQ6IGFueVtdKSB7XG4gICAgLy8gRmluZCBtYWluIGVudGl0eVxuICAgIC8vIEFkZGVkIHNhZmV0eSBjaGVjazogaSAmJiBpWydAdHlwZSddXG4gICAgY29uc3QgbWFpbkVudGl0eSA9IGpzb25MZC5maW5kKGkgPT4gaSAmJiAoaVsnQHR5cGUnXSA9PT0gJ0FydGljbGUnIHx8IGlbJ0B0eXBlJ10gPT09ICdWaWRlb09iamVjdCcgfHwgaVsnQHR5cGUnXSA9PT0gJ05ld3NBcnRpY2xlJykpIHx8IGpzb25MZFswXTtcblxuICAgIGxldCBhdXRob3I6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgIGxldCBwdWJsaXNoZWRBdDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgbGV0IG1vZGlmaWVkQXQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgIGxldCB0YWdzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgaWYgKG1haW5FbnRpdHkpIHtcbiAgICAgICAgYXV0aG9yID0gZXh0cmFjdEF1dGhvcihtYWluRW50aXR5KTtcbiAgICAgICAgcHVibGlzaGVkQXQgPSBtYWluRW50aXR5LmRhdGVQdWJsaXNoZWQgfHwgbnVsbDtcbiAgICAgICAgbW9kaWZpZWRBdCA9IG1haW5FbnRpdHkuZGF0ZU1vZGlmaWVkIHx8IG51bGw7XG4gICAgICAgIHRhZ3MgPSBleHRyYWN0S2V5d29yZHMobWFpbkVudGl0eSk7XG4gICAgfVxuXG4gICAgY29uc3QgYnJlYWRjcnVtYnMgPSBleHRyYWN0QnJlYWRjcnVtYnMoanNvbkxkKTtcblxuICAgIHJldHVybiB7IGF1dGhvciwgcHVibGlzaGVkQXQsIG1vZGlmaWVkQXQsIHRhZ3MsIGJyZWFkY3J1bWJzIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0WW91VHViZUNoYW5uZWxGcm9tSHRtbChodG1sOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcbiAgLy8gMS4gVHJ5IEpTT04tTERcbiAgLy8gTG9vayBmb3IgPHNjcmlwdCB0eXBlPVwiYXBwbGljYXRpb24vbGQranNvblwiPi4uLjwvc2NyaXB0PlxuICAvLyBXZSBuZWVkIHRvIGxvb3AgYmVjYXVzZSB0aGVyZSBtaWdodCBiZSBtdWx0aXBsZSBzY3JpcHRzXG4gIGNvbnN0IHNjcmlwdFJlZ2V4ID0gLzxzY3JpcHRcXHMrdHlwZT1bXCInXWFwcGxpY2F0aW9uXFwvbGRcXCtqc29uW1wiJ11bXj5dKj4oW1xcc1xcU10qPyk8XFwvc2NyaXB0Pi9naTtcbiAgbGV0IG1hdGNoO1xuICB3aGlsZSAoKG1hdGNoID0gc2NyaXB0UmVnZXguZXhlYyhodG1sKSkgIT09IG51bGwpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QganNvbiA9IEpTT04ucGFyc2UobWF0Y2hbMV0pO1xuICAgICAgICAgIGNvbnN0IGFycmF5ID0gQXJyYXkuaXNBcnJheShqc29uKSA/IGpzb24gOiBbanNvbl07XG4gICAgICAgICAgY29uc3QgZmllbGRzID0gZXh0cmFjdEpzb25MZEZpZWxkcyhhcnJheSk7XG4gICAgICAgICAgaWYgKGZpZWxkcy5hdXRob3IpIHJldHVybiBmaWVsZHMuYXV0aG9yO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIC8vIGlnbm9yZSBwYXJzZSBlcnJvcnNcbiAgICAgIH1cbiAgfVxuXG4gIC8vIDIuIFRyeSA8bGluayBpdGVtcHJvcD1cIm5hbWVcIiBjb250ZW50PVwiLi4uXCI+IChZb3VUdWJlIG9mdGVuIHB1dHMgY2hhbm5lbCBuYW1lIGhlcmUgaW4gc29tZSBjb250ZXh0cylcbiAgLy8gT3IgPG1ldGEgaXRlbXByb3A9XCJjaGFubmVsSWRcIiBjb250ZW50PVwiLi4uXCI+IC0+IGJ1dCB0aGF0J3MgSUQuXG4gIC8vIDxsaW5rIGl0ZW1wcm9wPVwibmFtZVwiIGNvbnRlbnQ9XCJDaGFubmVsIE5hbWVcIj5cbiAgLy8gPHNwYW4gaXRlbXByb3A9XCJhdXRob3JcIiBpdGVtc2NvcGUgaXRlbXR5cGU9XCJodHRwOi8vc2NoZW1hLm9yZy9QZXJzb25cIj48bGluayBpdGVtcHJvcD1cIm5hbWVcIiBjb250ZW50PVwiQ2hhbm5lbCBOYW1lXCI+PC9zcGFuPlxuICBjb25zdCBsaW5rTmFtZVJlZ2V4ID0gLzxsaW5rXFxzK2l0ZW1wcm9wPVtcIiddbmFtZVtcIiddXFxzK2NvbnRlbnQ9W1wiJ10oW15cIiddKylbXCInXVxccypcXC8/Pi9pO1xuICBjb25zdCBsaW5rTWF0Y2ggPSBsaW5rTmFtZVJlZ2V4LmV4ZWMoaHRtbCk7XG4gIGlmIChsaW5rTWF0Y2ggJiYgbGlua01hdGNoWzFdKSByZXR1cm4gZGVjb2RlSHRtbEVudGl0aWVzKGxpbmtNYXRjaFsxXSk7XG5cbiAgLy8gMy4gVHJ5IG1ldGEgYXV0aG9yXG4gIGNvbnN0IG1ldGFBdXRob3JSZWdleCA9IC88bWV0YVxccytuYW1lPVtcIiddYXV0aG9yW1wiJ11cXHMrY29udGVudD1bXCInXShbXlwiJ10rKVtcIiddXFxzKlxcLz8+L2k7XG4gIGNvbnN0IG1ldGFNYXRjaCA9IG1ldGFBdXRob3JSZWdleC5leGVjKGh0bWwpO1xuICBpZiAobWV0YU1hdGNoICYmIG1ldGFNYXRjaFsxXSkge1xuICAgICAgLy8gWW91VHViZSBtZXRhIGF1dGhvciBpcyBvZnRlbiBcIkNoYW5uZWwgTmFtZVwiXG4gICAgICByZXR1cm4gZGVjb2RlSHRtbEVudGl0aWVzKG1ldGFNYXRjaFsxXSk7XG4gIH1cblxuICByZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RZb3VUdWJlR2VucmVGcm9tSHRtbChodG1sOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcbiAgLy8gMS4gVHJ5IDxtZXRhIGl0ZW1wcm9wPVwiZ2VucmVcIiBjb250ZW50PVwiLi4uXCI+XG4gIGNvbnN0IG1ldGFHZW5yZVJlZ2V4ID0gLzxtZXRhXFxzK2l0ZW1wcm9wPVtcIiddZ2VucmVbXCInXVxccytjb250ZW50PVtcIiddKFteXCInXSspW1wiJ11cXHMqXFwvPz4vaTtcbiAgY29uc3QgbWV0YU1hdGNoID0gbWV0YUdlbnJlUmVnZXguZXhlYyhodG1sKTtcbiAgaWYgKG1ldGFNYXRjaCAmJiBtZXRhTWF0Y2hbMV0pIHtcbiAgICAgIHJldHVybiBkZWNvZGVIdG1sRW50aXRpZXMobWV0YU1hdGNoWzFdKTtcbiAgfVxuXG4gIC8vIDIuIFRyeSBKU09OIFwiY2F0ZWdvcnlcIiBpbiBzY3JpcHRzXG4gIC8vIFwiY2F0ZWdvcnlcIjpcIkdhbWluZ1wiXG4gIGNvbnN0IGNhdGVnb3J5UmVnZXggPSAvXCJjYXRlZ29yeVwiXFxzKjpcXHMqXCIoW15cIl0rKVwiLztcbiAgY29uc3QgY2F0TWF0Y2ggPSBjYXRlZ29yeVJlZ2V4LmV4ZWMoaHRtbCk7XG4gIGlmIChjYXRNYXRjaCAmJiBjYXRNYXRjaFsxXSkge1xuICAgICAgcmV0dXJuIGRlY29kZUh0bWxFbnRpdGllcyhjYXRNYXRjaFsxXSk7XG4gIH1cblxuICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gZGVjb2RlSHRtbEVudGl0aWVzKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGlmICghdGV4dCkgcmV0dXJuIHRleHQ7XG5cbiAgY29uc3QgZW50aXRpZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgJyZhbXA7JzogJyYnLFxuICAgICcmbHQ7JzogJzwnLFxuICAgICcmZ3Q7JzogJz4nLFxuICAgICcmcXVvdDsnOiAnXCInLFxuICAgICcmIzM5Oyc6IFwiJ1wiLFxuICAgICcmYXBvczsnOiBcIidcIixcbiAgICAnJm5ic3A7JzogJyAnXG4gIH07XG5cbiAgcmV0dXJuIHRleHQucmVwbGFjZSgvJihbYS16MC05XSt8I1swLTldezEsNn18I3hbMC05YS1mQS1GXXsxLDZ9KTsvaWcsIChtYXRjaCkgPT4ge1xuICAgICAgY29uc3QgbG93ZXIgPSBtYXRjaC50b0xvd2VyQ2FzZSgpO1xuICAgICAgaWYgKGVudGl0aWVzW2xvd2VyXSkgcmV0dXJuIGVudGl0aWVzW2xvd2VyXTtcbiAgICAgIGlmIChlbnRpdGllc1ttYXRjaF0pIHJldHVybiBlbnRpdGllc1ttYXRjaF07XG5cbiAgICAgIGlmIChsb3dlci5zdGFydHNXaXRoKCcmI3gnKSkge1xuICAgICAgICAgIHRyeSB7IHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlKHBhcnNlSW50KGxvd2VyLnNsaWNlKDMsIC0xKSwgMTYpKTsgfSBjYXRjaCB7IHJldHVybiBtYXRjaDsgfVxuICAgICAgfVxuICAgICAgaWYgKGxvd2VyLnN0YXJ0c1dpdGgoJyYjJykpIHtcbiAgICAgICAgICB0cnkgeyByZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZShwYXJzZUludChsb3dlci5zbGljZSgyLCAtMSksIDEwKSk7IH0gY2F0Y2ggeyByZXR1cm4gbWF0Y2g7IH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBtYXRjaDtcbiAgfSk7XG59XG4iLCAiXG5leHBvcnQgY29uc3QgR0VORVJBX1JFR0lTVFJZOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAvLyBTZWFyY2hcbiAgJ2dvb2dsZS5jb20nOiAnU2VhcmNoJyxcbiAgJ2JpbmcuY29tJzogJ1NlYXJjaCcsXG4gICdkdWNrZHVja2dvLmNvbSc6ICdTZWFyY2gnLFxuICAneWFob28uY29tJzogJ1NlYXJjaCcsXG4gICdiYWlkdS5jb20nOiAnU2VhcmNoJyxcbiAgJ3lhbmRleC5jb20nOiAnU2VhcmNoJyxcbiAgJ2thZ2kuY29tJzogJ1NlYXJjaCcsXG4gICdlY29zaWEub3JnJzogJ1NlYXJjaCcsXG5cbiAgLy8gU29jaWFsXG4gICdmYWNlYm9vay5jb20nOiAnU29jaWFsJyxcbiAgJ3R3aXR0ZXIuY29tJzogJ1NvY2lhbCcsXG4gICd4LmNvbSc6ICdTb2NpYWwnLFxuICAnaW5zdGFncmFtLmNvbSc6ICdTb2NpYWwnLFxuICAnbGlua2VkaW4uY29tJzogJ1NvY2lhbCcsXG4gICdyZWRkaXQuY29tJzogJ1NvY2lhbCcsXG4gICd0aWt0b2suY29tJzogJ1NvY2lhbCcsXG4gICdwaW50ZXJlc3QuY29tJzogJ1NvY2lhbCcsXG4gICdzbmFwY2hhdC5jb20nOiAnU29jaWFsJyxcbiAgJ3R1bWJsci5jb20nOiAnU29jaWFsJyxcbiAgJ3RocmVhZHMubmV0JzogJ1NvY2lhbCcsXG4gICdibHVlc2t5LmFwcCc6ICdTb2NpYWwnLFxuICAnbWFzdG9kb24uc29jaWFsJzogJ1NvY2lhbCcsXG5cbiAgLy8gVmlkZW9cbiAgJ3lvdXR1YmUuY29tJzogJ1ZpZGVvJyxcbiAgJ3lvdXR1LmJlJzogJ1ZpZGVvJyxcbiAgJ3ZpbWVvLmNvbSc6ICdWaWRlbycsXG4gICd0d2l0Y2gudHYnOiAnVmlkZW8nLFxuICAnbmV0ZmxpeC5jb20nOiAnVmlkZW8nLFxuICAnaHVsdS5jb20nOiAnVmlkZW8nLFxuICAnZGlzbmV5cGx1cy5jb20nOiAnVmlkZW8nLFxuICAnZGFpbHltb3Rpb24uY29tJzogJ1ZpZGVvJyxcbiAgJ3ByaW1ldmlkZW8uY29tJzogJ1ZpZGVvJyxcbiAgJ2hib21heC5jb20nOiAnVmlkZW8nLFxuICAnbWF4LmNvbSc6ICdWaWRlbycsXG4gICdwZWFjb2NrdHYuY29tJzogJ1ZpZGVvJyxcblxuICAvLyBEZXZlbG9wbWVudFxuICAnZ2l0aHViLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdnaXRsYWIuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ3N0YWNrb3ZlcmZsb3cuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ25wbWpzLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdweXBpLm9yZyc6ICdEZXZlbG9wbWVudCcsXG4gICdkZXZlbG9wZXIubW96aWxsYS5vcmcnOiAnRGV2ZWxvcG1lbnQnLFxuICAndzNzY2hvb2xzLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdnZWVrc2ZvcmdlZWtzLm9yZyc6ICdEZXZlbG9wbWVudCcsXG4gICdqaXJhLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdhdGxhc3NpYW4ubmV0JzogJ0RldmVsb3BtZW50JywgLy8gb2Z0ZW4gamlyYVxuICAnYml0YnVja2V0Lm9yZyc6ICdEZXZlbG9wbWVudCcsXG4gICdkZXYudG8nOiAnRGV2ZWxvcG1lbnQnLFxuICAnaGFzaG5vZGUuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ21lZGl1bS5jb20nOiAnRGV2ZWxvcG1lbnQnLCAvLyBHZW5lcmFsIGJ1dCBvZnRlbiBkZXZcbiAgJ3ZlcmNlbC5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnbmV0bGlmeS5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnaGVyb2t1LmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdhd3MuYW1hem9uLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdjb25zb2xlLmF3cy5hbWF6b24uY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2Nsb3VkLmdvb2dsZS5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnYXp1cmUubWljcm9zb2Z0LmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdwb3J0YWwuYXp1cmUuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2RvY2tlci5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAna3ViZXJuZXRlcy5pbyc6ICdEZXZlbG9wbWVudCcsXG5cbiAgLy8gTmV3c1xuICAnY25uLmNvbSc6ICdOZXdzJyxcbiAgJ2JiYy5jb20nOiAnTmV3cycsXG4gICdueXRpbWVzLmNvbSc6ICdOZXdzJyxcbiAgJ3dhc2hpbmd0b25wb3N0LmNvbSc6ICdOZXdzJyxcbiAgJ3RoZWd1YXJkaWFuLmNvbSc6ICdOZXdzJyxcbiAgJ2ZvcmJlcy5jb20nOiAnTmV3cycsXG4gICdibG9vbWJlcmcuY29tJzogJ05ld3MnLFxuICAncmV1dGVycy5jb20nOiAnTmV3cycsXG4gICd3c2ouY29tJzogJ05ld3MnLFxuICAnY25iYy5jb20nOiAnTmV3cycsXG4gICdodWZmcG9zdC5jb20nOiAnTmV3cycsXG4gICduZXdzLmdvb2dsZS5jb20nOiAnTmV3cycsXG4gICdmb3huZXdzLmNvbSc6ICdOZXdzJyxcbiAgJ25iY25ld3MuY29tJzogJ05ld3MnLFxuICAnYWJjbmV3cy5nby5jb20nOiAnTmV3cycsXG4gICd1c2F0b2RheS5jb20nOiAnTmV3cycsXG5cbiAgLy8gU2hvcHBpbmdcbiAgJ2FtYXpvbi5jb20nOiAnU2hvcHBpbmcnLFxuICAnZWJheS5jb20nOiAnU2hvcHBpbmcnLFxuICAnd2FsbWFydC5jb20nOiAnU2hvcHBpbmcnLFxuICAnZXRzeS5jb20nOiAnU2hvcHBpbmcnLFxuICAndGFyZ2V0LmNvbSc6ICdTaG9wcGluZycsXG4gICdiZXN0YnV5LmNvbSc6ICdTaG9wcGluZycsXG4gICdhbGlleHByZXNzLmNvbSc6ICdTaG9wcGluZycsXG4gICdzaG9waWZ5LmNvbSc6ICdTaG9wcGluZycsXG4gICd0ZW11LmNvbSc6ICdTaG9wcGluZycsXG4gICdzaGVpbi5jb20nOiAnU2hvcHBpbmcnLFxuICAnd2F5ZmFpci5jb20nOiAnU2hvcHBpbmcnLFxuICAnY29zdGNvLmNvbSc6ICdTaG9wcGluZycsXG5cbiAgLy8gQ29tbXVuaWNhdGlvblxuICAnbWFpbC5nb29nbGUuY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnb3V0bG9vay5saXZlLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ3NsYWNrLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ2Rpc2NvcmQuY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnem9vbS51cyc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ3RlYW1zLm1pY3Jvc29mdC5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICd3aGF0c2FwcC5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICd0ZWxlZ3JhbS5vcmcnOiAnQ29tbXVuaWNhdGlvbicsXG4gICdtZXNzZW5nZXIuY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnc2t5cGUuY29tJzogJ0NvbW11bmljYXRpb24nLFxuXG4gIC8vIEZpbmFuY2VcbiAgJ3BheXBhbC5jb20nOiAnRmluYW5jZScsXG4gICdjaGFzZS5jb20nOiAnRmluYW5jZScsXG4gICdiYW5rb2ZhbWVyaWNhLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ3dlbGxzZmFyZ28uY29tJzogJ0ZpbmFuY2UnLFxuICAnYW1lcmljYW5leHByZXNzLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ3N0cmlwZS5jb20nOiAnRmluYW5jZScsXG4gICdjb2luYmFzZS5jb20nOiAnRmluYW5jZScsXG4gICdiaW5hbmNlLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2tyYWtlbi5jb20nOiAnRmluYW5jZScsXG4gICdyb2Jpbmhvb2QuY29tJzogJ0ZpbmFuY2UnLFxuICAnZmlkZWxpdHkuY29tJzogJ0ZpbmFuY2UnLFxuICAndmFuZ3VhcmQuY29tJzogJ0ZpbmFuY2UnLFxuICAnc2Nod2FiLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ21pbnQuaW50dWl0LmNvbSc6ICdGaW5hbmNlJyxcblxuICAvLyBFZHVjYXRpb25cbiAgJ3dpa2lwZWRpYS5vcmcnOiAnRWR1Y2F0aW9uJyxcbiAgJ2NvdXJzZXJhLm9yZyc6ICdFZHVjYXRpb24nLFxuICAndWRlbXkuY29tJzogJ0VkdWNhdGlvbicsXG4gICdlZHgub3JnJzogJ0VkdWNhdGlvbicsXG4gICdraGFuYWNhZGVteS5vcmcnOiAnRWR1Y2F0aW9uJyxcbiAgJ3F1aXpsZXQuY29tJzogJ0VkdWNhdGlvbicsXG4gICdkdW9saW5nby5jb20nOiAnRWR1Y2F0aW9uJyxcbiAgJ2NhbnZhcy5pbnN0cnVjdHVyZS5jb20nOiAnRWR1Y2F0aW9uJyxcbiAgJ2JsYWNrYm9hcmQuY29tJzogJ0VkdWNhdGlvbicsXG4gICdtaXQuZWR1JzogJ0VkdWNhdGlvbicsXG4gICdoYXJ2YXJkLmVkdSc6ICdFZHVjYXRpb24nLFxuICAnc3RhbmZvcmQuZWR1JzogJ0VkdWNhdGlvbicsXG4gICdhY2FkZW1pYS5lZHUnOiAnRWR1Y2F0aW9uJyxcbiAgJ3Jlc2VhcmNoZ2F0ZS5uZXQnOiAnRWR1Y2F0aW9uJyxcblxuICAvLyBEZXNpZ25cbiAgJ2ZpZ21hLmNvbSc6ICdEZXNpZ24nLFxuICAnY2FudmEuY29tJzogJ0Rlc2lnbicsXG4gICdiZWhhbmNlLm5ldCc6ICdEZXNpZ24nLFxuICAnZHJpYmJibGUuY29tJzogJ0Rlc2lnbicsXG4gICdhZG9iZS5jb20nOiAnRGVzaWduJyxcbiAgJ3Vuc3BsYXNoLmNvbSc6ICdEZXNpZ24nLFxuICAncGV4ZWxzLmNvbSc6ICdEZXNpZ24nLFxuICAncGl4YWJheS5jb20nOiAnRGVzaWduJyxcbiAgJ3NodXR0ZXJzdG9jay5jb20nOiAnRGVzaWduJyxcblxuICAvLyBQcm9kdWN0aXZpdHlcbiAgJ2RvY3MuZ29vZ2xlLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnc2hlZXRzLmdvb2dsZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ3NsaWRlcy5nb29nbGUuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdkcml2ZS5nb29nbGUuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdub3Rpb24uc28nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ3RyZWxsby5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2FzYW5hLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnbW9uZGF5LmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnYWlydGFibGUuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdldmVybm90ZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2Ryb3Bib3guY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdjbGlja3VwLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnbGluZWFyLmFwcCc6ICdQcm9kdWN0aXZpdHknLFxuICAnbWlyby5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2x1Y2lkY2hhcnQuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG5cbiAgLy8gQUlcbiAgJ29wZW5haS5jb20nOiAnQUknLFxuICAnY2hhdGdwdC5jb20nOiAnQUknLFxuICAnYW50aHJvcGljLmNvbSc6ICdBSScsXG4gICdtaWRqb3VybmV5LmNvbSc6ICdBSScsXG4gICdodWdnaW5nZmFjZS5jbyc6ICdBSScsXG4gICdiYXJkLmdvb2dsZS5jb20nOiAnQUknLFxuICAnZ2VtaW5pLmdvb2dsZS5jb20nOiAnQUknLFxuICAnY2xhdWRlLmFpJzogJ0FJJyxcbiAgJ3BlcnBsZXhpdHkuYWknOiAnQUknLFxuICAncG9lLmNvbSc6ICdBSScsXG5cbiAgLy8gTXVzaWMvQXVkaW9cbiAgJ3Nwb3RpZnkuY29tJzogJ011c2ljJyxcbiAgJ3NvdW5kY2xvdWQuY29tJzogJ011c2ljJyxcbiAgJ211c2ljLmFwcGxlLmNvbSc6ICdNdXNpYycsXG4gICdwYW5kb3JhLmNvbSc6ICdNdXNpYycsXG4gICd0aWRhbC5jb20nOiAnTXVzaWMnLFxuICAnYmFuZGNhbXAuY29tJzogJ011c2ljJyxcbiAgJ2F1ZGlibGUuY29tJzogJ011c2ljJyxcblxuICAvLyBHYW1pbmdcbiAgJ3N0ZWFtcG93ZXJlZC5jb20nOiAnR2FtaW5nJyxcbiAgJ3JvYmxveC5jb20nOiAnR2FtaW5nJyxcbiAgJ2VwaWNnYW1lcy5jb20nOiAnR2FtaW5nJyxcbiAgJ3hib3guY29tJzogJ0dhbWluZycsXG4gICdwbGF5c3RhdGlvbi5jb20nOiAnR2FtaW5nJyxcbiAgJ25pbnRlbmRvLmNvbSc6ICdHYW1pbmcnLFxuICAnaWduLmNvbSc6ICdHYW1pbmcnLFxuICAnZ2FtZXNwb3QuY29tJzogJ0dhbWluZycsXG4gICdrb3Rha3UuY29tJzogJ0dhbWluZycsXG4gICdwb2x5Z29uLmNvbSc6ICdHYW1pbmcnXG59O1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0R2VuZXJhKGhvc3RuYW1lOiBzdHJpbmcsIGN1c3RvbVJlZ2lzdHJ5PzogUmVjb3JkPHN0cmluZywgc3RyaW5nPik6IHN0cmluZyB8IG51bGwge1xuICBpZiAoIWhvc3RuYW1lKSByZXR1cm4gbnVsbDtcblxuICAvLyAwLiBDaGVjayBjdXN0b20gcmVnaXN0cnkgZmlyc3RcbiAgaWYgKGN1c3RvbVJlZ2lzdHJ5KSB7XG4gICAgICBjb25zdCBwYXJ0cyA9IGhvc3RuYW1lLnNwbGl0KCcuJyk7XG4gICAgICAvLyBDaGVjayBmdWxsIGhvc3RuYW1lIGFuZCBwcm9ncmVzc2l2ZWx5IHNob3J0ZXIgc3VmZml4ZXNcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGFydHMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICAgICAgY29uc3QgZG9tYWluID0gcGFydHMuc2xpY2UoaSkuam9pbignLicpO1xuICAgICAgICAgIGlmIChjdXN0b21SZWdpc3RyeVtkb21haW5dKSB7XG4gICAgICAgICAgICAgIHJldHVybiBjdXN0b21SZWdpc3RyeVtkb21haW5dO1xuICAgICAgICAgIH1cbiAgICAgIH1cbiAgfVxuXG4gIC8vIDEuIEV4YWN0IG1hdGNoXG4gIGlmIChHRU5FUkFfUkVHSVNUUllbaG9zdG5hbWVdKSB7XG4gICAgcmV0dXJuIEdFTkVSQV9SRUdJU1RSWVtob3N0bmFtZV07XG4gIH1cblxuICAvLyAyLiBTdWJkb21haW4gY2hlY2sgKHN0cmlwcGluZyBzdWJkb21haW5zKVxuICAvLyBlLmcuIFwiY29uc29sZS5hd3MuYW1hem9uLmNvbVwiIC0+IFwiYXdzLmFtYXpvbi5jb21cIiAtPiBcImFtYXpvbi5jb21cIlxuICBjb25zdCBwYXJ0cyA9IGhvc3RuYW1lLnNwbGl0KCcuJyk7XG5cbiAgLy8gVHJ5IG1hdGNoaW5nIHByb2dyZXNzaXZlbHkgc2hvcnRlciBzdWZmaXhlc1xuICAvLyBlLmcuIGEuYi5jLmNvbSAtPiBiLmMuY29tIC0+IGMuY29tXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcGFydHMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICBjb25zdCBkb21haW4gPSBwYXJ0cy5zbGljZShpKS5qb2luKCcuJyk7XG4gICAgICBpZiAoR0VORVJBX1JFR0lTVFJZW2RvbWFpbl0pIHtcbiAgICAgICAgICByZXR1cm4gR0VORVJBX1JFR0lTVFJZW2RvbWFpbl07XG4gICAgICB9XG4gIH1cblxuICByZXR1cm4gbnVsbDtcbn1cbiIsICJleHBvcnQgY29uc3QgZ2V0U3RvcmVkVmFsdWUgPSBhc3luYyA8VD4oa2V5OiBzdHJpbmcpOiBQcm9taXNlPFQgfCBudWxsPiA9PiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChrZXksIChpdGVtcykgPT4ge1xuICAgICAgcmVzb2x2ZSgoaXRlbXNba2V5XSBhcyBUKSA/PyBudWxsKTtcbiAgICB9KTtcbiAgfSk7XG59O1xuXG5leHBvcnQgY29uc3Qgc2V0U3RvcmVkVmFsdWUgPSBhc3luYyA8VD4oa2V5OiBzdHJpbmcsIHZhbHVlOiBUKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IFtrZXldOiB2YWx1ZSB9LCAoKSA9PiByZXNvbHZlKCkpO1xuICB9KTtcbn07XG4iLCAiaW1wb3J0IHsgQ3VzdG9tU3RyYXRlZ3ksIFByZWZlcmVuY2VzLCBTb3J0aW5nU3RyYXRlZ3kgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBnZXRTdG9yZWRWYWx1ZSwgc2V0U3RvcmVkVmFsdWUgfSBmcm9tIFwiLi9zdG9yYWdlLmpzXCI7XG5pbXBvcnQgeyBzZXRMb2dnZXJQcmVmZXJlbmNlcywgbG9nRGVidWcgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcblxuY29uc3QgUFJFRkVSRU5DRVNfS0VZID0gXCJwcmVmZXJlbmNlc1wiO1xuXG5leHBvcnQgY29uc3QgZGVmYXVsdFByZWZlcmVuY2VzOiBQcmVmZXJlbmNlcyA9IHtcbiAgc29ydGluZzogW1wicGlubmVkXCIsIFwicmVjZW5jeVwiXSxcbiAgZGVidWc6IGZhbHNlLFxuICBsb2dMZXZlbDogXCJpbmZvXCIsXG4gIHRoZW1lOiBcImRhcmtcIixcbiAgY3VzdG9tR2VuZXJhOiB7fVxufTtcblxuY29uc3Qgbm9ybWFsaXplU29ydGluZyA9IChzb3J0aW5nOiB1bmtub3duKTogU29ydGluZ1N0cmF0ZWd5W10gPT4ge1xuICBpZiAoQXJyYXkuaXNBcnJheShzb3J0aW5nKSkge1xuICAgIHJldHVybiBzb3J0aW5nLmZpbHRlcigodmFsdWUpOiB2YWx1ZSBpcyBTb3J0aW5nU3RyYXRlZ3kgPT4gdHlwZW9mIHZhbHVlID09PSBcInN0cmluZ1wiKTtcbiAgfVxuICBpZiAodHlwZW9mIHNvcnRpbmcgPT09IFwic3RyaW5nXCIpIHtcbiAgICByZXR1cm4gW3NvcnRpbmddO1xuICB9XG4gIHJldHVybiBbLi4uZGVmYXVsdFByZWZlcmVuY2VzLnNvcnRpbmddO1xufTtcblxuY29uc3Qgbm9ybWFsaXplU3RyYXRlZ2llcyA9IChzdHJhdGVnaWVzOiB1bmtub3duKTogQ3VzdG9tU3RyYXRlZ3lbXSA9PiB7XG4gICAgY29uc3QgYXJyID0gYXNBcnJheTxhbnk+KHN0cmF0ZWdpZXMpLmZpbHRlcihzID0+IHR5cGVvZiBzID09PSAnb2JqZWN0JyAmJiBzICE9PSBudWxsKTtcbiAgICByZXR1cm4gYXJyLm1hcChzID0+ICh7XG4gICAgICAgIC4uLnMsXG4gICAgICAgIGdyb3VwaW5nUnVsZXM6IGFzQXJyYXkocy5ncm91cGluZ1J1bGVzKSxcbiAgICAgICAgc29ydGluZ1J1bGVzOiBhc0FycmF5KHMuc29ydGluZ1J1bGVzKSxcbiAgICAgICAgZ3JvdXBTb3J0aW5nUnVsZXM6IHMuZ3JvdXBTb3J0aW5nUnVsZXMgPyBhc0FycmF5KHMuZ3JvdXBTb3J0aW5nUnVsZXMpIDogdW5kZWZpbmVkLFxuICAgICAgICBmaWx0ZXJzOiBzLmZpbHRlcnMgPyBhc0FycmF5KHMuZmlsdGVycykgOiB1bmRlZmluZWQsXG4gICAgICAgIGZpbHRlckdyb3Vwczogcy5maWx0ZXJHcm91cHMgPyBhc0FycmF5KHMuZmlsdGVyR3JvdXBzKS5tYXAoKGc6IGFueSkgPT4gYXNBcnJheShnKSkgOiB1bmRlZmluZWQsXG4gICAgICAgIHJ1bGVzOiBzLnJ1bGVzID8gYXNBcnJheShzLnJ1bGVzKSA6IHVuZGVmaW5lZFxuICAgIH0pKTtcbn07XG5cbmNvbnN0IG5vcm1hbGl6ZVByZWZlcmVuY2VzID0gKHByZWZzPzogUGFydGlhbDxQcmVmZXJlbmNlcz4gfCBudWxsKTogUHJlZmVyZW5jZXMgPT4ge1xuICBjb25zdCBtZXJnZWQgPSB7IC4uLmRlZmF1bHRQcmVmZXJlbmNlcywgLi4uKHByZWZzID8/IHt9KSB9O1xuICByZXR1cm4ge1xuICAgIC4uLm1lcmdlZCxcbiAgICBzb3J0aW5nOiBub3JtYWxpemVTb3J0aW5nKG1lcmdlZC5zb3J0aW5nKSxcbiAgICBjdXN0b21TdHJhdGVnaWVzOiBub3JtYWxpemVTdHJhdGVnaWVzKG1lcmdlZC5jdXN0b21TdHJhdGVnaWVzKVxuICB9O1xufTtcblxuZXhwb3J0IGNvbnN0IGxvYWRQcmVmZXJlbmNlcyA9IGFzeW5jICgpOiBQcm9taXNlPFByZWZlcmVuY2VzPiA9PiB7XG4gIGNvbnN0IHN0b3JlZCA9IGF3YWl0IGdldFN0b3JlZFZhbHVlPFByZWZlcmVuY2VzPihQUkVGRVJFTkNFU19LRVkpO1xuICBjb25zdCBtZXJnZWQgPSBub3JtYWxpemVQcmVmZXJlbmNlcyhzdG9yZWQgPz8gdW5kZWZpbmVkKTtcbiAgc2V0TG9nZ2VyUHJlZmVyZW5jZXMobWVyZ2VkKTtcbiAgcmV0dXJuIG1lcmdlZDtcbn07XG5cbmV4cG9ydCBjb25zdCBzYXZlUHJlZmVyZW5jZXMgPSBhc3luYyAocHJlZnM6IFBhcnRpYWw8UHJlZmVyZW5jZXM+KTogUHJvbWlzZTxQcmVmZXJlbmNlcz4gPT4ge1xuICBsb2dEZWJ1ZyhcIlVwZGF0aW5nIHByZWZlcmVuY2VzXCIsIHsga2V5czogT2JqZWN0LmtleXMocHJlZnMpIH0pO1xuICBjb25zdCBjdXJyZW50ID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gIGNvbnN0IG1lcmdlZCA9IG5vcm1hbGl6ZVByZWZlcmVuY2VzKHsgLi4uY3VycmVudCwgLi4ucHJlZnMgfSk7XG4gIGF3YWl0IHNldFN0b3JlZFZhbHVlKFBSRUZFUkVOQ0VTX0tFWSwgbWVyZ2VkKTtcbiAgc2V0TG9nZ2VyUHJlZmVyZW5jZXMobWVyZ2VkKTtcbiAgcmV0dXJuIG1lcmdlZDtcbn07XG4iLCAiLypcbkhvdyBpdCB3b3JrczpcbmB0aGlzLiNoZWFkYCBpcyBhbiBpbnN0YW5jZSBvZiBgTm9kZWAgd2hpY2gga2VlcHMgdHJhY2sgb2YgaXRzIGN1cnJlbnQgdmFsdWUgYW5kIG5lc3RzIGFub3RoZXIgaW5zdGFuY2Ugb2YgYE5vZGVgIHRoYXQga2VlcHMgdGhlIHZhbHVlIHRoYXQgY29tZXMgYWZ0ZXIgaXQuIFdoZW4gYSB2YWx1ZSBpcyBwcm92aWRlZCB0byBgLmVucXVldWUoKWAsIHRoZSBjb2RlIG5lZWRzIHRvIGl0ZXJhdGUgdGhyb3VnaCBgdGhpcy4jaGVhZGAsIGdvaW5nIGRlZXBlciBhbmQgZGVlcGVyIHRvIGZpbmQgdGhlIGxhc3QgdmFsdWUuIEhvd2V2ZXIsIGl0ZXJhdGluZyB0aHJvdWdoIGV2ZXJ5IHNpbmdsZSBpdGVtIGlzIHNsb3cuIFRoaXMgcHJvYmxlbSBpcyBzb2x2ZWQgYnkgc2F2aW5nIGEgcmVmZXJlbmNlIHRvIHRoZSBsYXN0IHZhbHVlIGFzIGB0aGlzLiN0YWlsYCBzbyB0aGF0IGl0IGNhbiByZWZlcmVuY2UgaXQgdG8gYWRkIGEgbmV3IHZhbHVlLlxuKi9cblxuY2xhc3MgTm9kZSB7XG5cdHZhbHVlO1xuXHRuZXh0O1xuXG5cdGNvbnN0cnVjdG9yKHZhbHVlKSB7XG5cdFx0dGhpcy52YWx1ZSA9IHZhbHVlO1xuXHR9XG59XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFF1ZXVlIHtcblx0I2hlYWQ7XG5cdCN0YWlsO1xuXHQjc2l6ZTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHR0aGlzLmNsZWFyKCk7XG5cdH1cblxuXHRlbnF1ZXVlKHZhbHVlKSB7XG5cdFx0Y29uc3Qgbm9kZSA9IG5ldyBOb2RlKHZhbHVlKTtcblxuXHRcdGlmICh0aGlzLiNoZWFkKSB7XG5cdFx0XHR0aGlzLiN0YWlsLm5leHQgPSBub2RlO1xuXHRcdFx0dGhpcy4jdGFpbCA9IG5vZGU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuI2hlYWQgPSBub2RlO1xuXHRcdFx0dGhpcy4jdGFpbCA9IG5vZGU7XG5cdFx0fVxuXG5cdFx0dGhpcy4jc2l6ZSsrO1xuXHR9XG5cblx0ZGVxdWV1ZSgpIHtcblx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy4jaGVhZDtcblx0XHRpZiAoIWN1cnJlbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLiNoZWFkID0gdGhpcy4jaGVhZC5uZXh0O1xuXHRcdHRoaXMuI3NpemUtLTtcblxuXHRcdC8vIENsZWFuIHVwIHRhaWwgcmVmZXJlbmNlIHdoZW4gcXVldWUgYmVjb21lcyBlbXB0eVxuXHRcdGlmICghdGhpcy4jaGVhZCkge1xuXHRcdFx0dGhpcy4jdGFpbCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gY3VycmVudC52YWx1ZTtcblx0fVxuXG5cdHBlZWsoKSB7XG5cdFx0aWYgKCF0aGlzLiNoZWFkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuI2hlYWQudmFsdWU7XG5cblx0XHQvLyBUT0RPOiBOb2RlLmpzIDE4LlxuXHRcdC8vIHJldHVybiB0aGlzLiNoZWFkPy52YWx1ZTtcblx0fVxuXG5cdGNsZWFyKCkge1xuXHRcdHRoaXMuI2hlYWQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy4jdGFpbCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLiNzaXplID0gMDtcblx0fVxuXG5cdGdldCBzaXplKCkge1xuXHRcdHJldHVybiB0aGlzLiNzaXplO1xuXHR9XG5cblx0KiBbU3ltYm9sLml0ZXJhdG9yXSgpIHtcblx0XHRsZXQgY3VycmVudCA9IHRoaXMuI2hlYWQ7XG5cblx0XHR3aGlsZSAoY3VycmVudCkge1xuXHRcdFx0eWllbGQgY3VycmVudC52YWx1ZTtcblx0XHRcdGN1cnJlbnQgPSBjdXJyZW50Lm5leHQ7XG5cdFx0fVxuXHR9XG5cblx0KiBkcmFpbigpIHtcblx0XHR3aGlsZSAodGhpcy4jaGVhZCkge1xuXHRcdFx0eWllbGQgdGhpcy5kZXF1ZXVlKCk7XG5cdFx0fVxuXHR9XG59XG4iLCAiaW1wb3J0IFF1ZXVlIGZyb20gJ3lvY3RvLXF1ZXVlJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gcExpbWl0KGNvbmN1cnJlbmN5KSB7XG5cdGxldCByZWplY3RPbkNsZWFyID0gZmFsc2U7XG5cblx0aWYgKHR5cGVvZiBjb25jdXJyZW5jeSA9PT0gJ29iamVjdCcpIHtcblx0XHQoe2NvbmN1cnJlbmN5LCByZWplY3RPbkNsZWFyID0gZmFsc2V9ID0gY29uY3VycmVuY3kpO1xuXHR9XG5cblx0dmFsaWRhdGVDb25jdXJyZW5jeShjb25jdXJyZW5jeSk7XG5cblx0aWYgKHR5cGVvZiByZWplY3RPbkNsZWFyICE9PSAnYm9vbGVhbicpIHtcblx0XHR0aHJvdyBuZXcgVHlwZUVycm9yKCdFeHBlY3RlZCBgcmVqZWN0T25DbGVhcmAgdG8gYmUgYSBib29sZWFuJyk7XG5cdH1cblxuXHRjb25zdCBxdWV1ZSA9IG5ldyBRdWV1ZSgpO1xuXHRsZXQgYWN0aXZlQ291bnQgPSAwO1xuXG5cdGNvbnN0IHJlc3VtZU5leHQgPSAoKSA9PiB7XG5cdFx0Ly8gUHJvY2VzcyB0aGUgbmV4dCBxdWV1ZWQgZnVuY3Rpb24gaWYgd2UncmUgdW5kZXIgdGhlIGNvbmN1cnJlbmN5IGxpbWl0XG5cdFx0aWYgKGFjdGl2ZUNvdW50IDwgY29uY3VycmVuY3kgJiYgcXVldWUuc2l6ZSA+IDApIHtcblx0XHRcdGFjdGl2ZUNvdW50Kys7XG5cdFx0XHRxdWV1ZS5kZXF1ZXVlKCkucnVuKCk7XG5cdFx0fVxuXHR9O1xuXG5cdGNvbnN0IG5leHQgPSAoKSA9PiB7XG5cdFx0YWN0aXZlQ291bnQtLTtcblx0XHRyZXN1bWVOZXh0KCk7XG5cdH07XG5cblx0Y29uc3QgcnVuID0gYXN5bmMgKGZ1bmN0aW9uXywgcmVzb2x2ZSwgYXJndW1lbnRzXykgPT4ge1xuXHRcdC8vIEV4ZWN1dGUgdGhlIGZ1bmN0aW9uIGFuZCBjYXB0dXJlIHRoZSByZXN1bHQgcHJvbWlzZVxuXHRcdGNvbnN0IHJlc3VsdCA9IChhc3luYyAoKSA9PiBmdW5jdGlvbl8oLi4uYXJndW1lbnRzXykpKCk7XG5cblx0XHQvLyBSZXNvbHZlIGltbWVkaWF0ZWx5IHdpdGggdGhlIHByb21pc2UgKGRvbid0IHdhaXQgZm9yIGNvbXBsZXRpb24pXG5cdFx0cmVzb2x2ZShyZXN1bHQpO1xuXG5cdFx0Ly8gV2FpdCBmb3IgdGhlIGZ1bmN0aW9uIHRvIGNvbXBsZXRlIChzdWNjZXNzIG9yIGZhaWx1cmUpXG5cdFx0Ly8gV2UgY2F0Y2ggZXJyb3JzIGhlcmUgdG8gcHJldmVudCB1bmhhbmRsZWQgcmVqZWN0aW9ucyxcblx0XHQvLyBidXQgdGhlIG9yaWdpbmFsIHByb21pc2UgcmVqZWN0aW9uIGlzIHByZXNlcnZlZCBmb3IgdGhlIGNhbGxlclxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCByZXN1bHQ7XG5cdFx0fSBjYXRjaCB7fVxuXG5cdFx0Ly8gRGVjcmVtZW50IGFjdGl2ZSBjb3VudCBhbmQgcHJvY2VzcyBuZXh0IHF1ZXVlZCBmdW5jdGlvblxuXHRcdG5leHQoKTtcblx0fTtcblxuXHRjb25zdCBlbnF1ZXVlID0gKGZ1bmN0aW9uXywgcmVzb2x2ZSwgcmVqZWN0LCBhcmd1bWVudHNfKSA9PiB7XG5cdFx0Y29uc3QgcXVldWVJdGVtID0ge3JlamVjdH07XG5cblx0XHQvLyBRdWV1ZSB0aGUgaW50ZXJuYWwgcmVzb2x2ZSBmdW5jdGlvbiBpbnN0ZWFkIG9mIHRoZSBydW4gZnVuY3Rpb25cblx0XHQvLyB0byBwcmVzZXJ2ZSB0aGUgYXN5bmNocm9ub3VzIGV4ZWN1dGlvbiBjb250ZXh0LlxuXHRcdG5ldyBQcm9taXNlKGludGVybmFsUmVzb2x2ZSA9PiB7IC8vIGVzbGludC1kaXNhYmxlLWxpbmUgcHJvbWlzZS9wYXJhbS1uYW1lc1xuXHRcdFx0cXVldWVJdGVtLnJ1biA9IGludGVybmFsUmVzb2x2ZTtcblx0XHRcdHF1ZXVlLmVucXVldWUocXVldWVJdGVtKTtcblx0XHR9KS50aGVuKHJ1bi5iaW5kKHVuZGVmaW5lZCwgZnVuY3Rpb25fLCByZXNvbHZlLCBhcmd1bWVudHNfKSk7IC8vIGVzbGludC1kaXNhYmxlLWxpbmUgcHJvbWlzZS9wcmVmZXItYXdhaXQtdG8tdGhlblxuXG5cdFx0Ly8gU3RhcnQgcHJvY2Vzc2luZyBpbW1lZGlhdGVseSBpZiB3ZSBoYXZlbid0IHJlYWNoZWQgdGhlIGNvbmN1cnJlbmN5IGxpbWl0XG5cdFx0aWYgKGFjdGl2ZUNvdW50IDwgY29uY3VycmVuY3kpIHtcblx0XHRcdHJlc3VtZU5leHQoKTtcblx0XHR9XG5cdH07XG5cblx0Y29uc3QgZ2VuZXJhdG9yID0gKGZ1bmN0aW9uXywgLi4uYXJndW1lbnRzXykgPT4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGVucXVldWUoZnVuY3Rpb25fLCByZXNvbHZlLCByZWplY3QsIGFyZ3VtZW50c18pO1xuXHR9KTtcblxuXHRPYmplY3QuZGVmaW5lUHJvcGVydGllcyhnZW5lcmF0b3IsIHtcblx0XHRhY3RpdmVDb3VudDoge1xuXHRcdFx0Z2V0OiAoKSA9PiBhY3RpdmVDb3VudCxcblx0XHR9LFxuXHRcdHBlbmRpbmdDb3VudDoge1xuXHRcdFx0Z2V0OiAoKSA9PiBxdWV1ZS5zaXplLFxuXHRcdH0sXG5cdFx0Y2xlYXJRdWV1ZToge1xuXHRcdFx0dmFsdWUoKSB7XG5cdFx0XHRcdGlmICghcmVqZWN0T25DbGVhcikge1xuXHRcdFx0XHRcdHF1ZXVlLmNsZWFyKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgYWJvcnRFcnJvciA9IEFib3J0U2lnbmFsLmFib3J0KCkucmVhc29uO1xuXG5cdFx0XHRcdHdoaWxlIChxdWV1ZS5zaXplID4gMCkge1xuXHRcdFx0XHRcdHF1ZXVlLmRlcXVldWUoKS5yZWplY3QoYWJvcnRFcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fSxcblx0XHRjb25jdXJyZW5jeToge1xuXHRcdFx0Z2V0OiAoKSA9PiBjb25jdXJyZW5jeSxcblxuXHRcdFx0c2V0KG5ld0NvbmN1cnJlbmN5KSB7XG5cdFx0XHRcdHZhbGlkYXRlQ29uY3VycmVuY3kobmV3Q29uY3VycmVuY3kpO1xuXHRcdFx0XHRjb25jdXJyZW5jeSA9IG5ld0NvbmN1cnJlbmN5O1xuXG5cdFx0XHRcdHF1ZXVlTWljcm90YXNrKCgpID0+IHtcblx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tdW5tb2RpZmllZC1sb29wLWNvbmRpdGlvblxuXHRcdFx0XHRcdHdoaWxlIChhY3RpdmVDb3VudCA8IGNvbmN1cnJlbmN5ICYmIHF1ZXVlLnNpemUgPiAwKSB7XG5cdFx0XHRcdFx0XHRyZXN1bWVOZXh0KCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0sXG5cdFx0fSxcblx0XHRtYXA6IHtcblx0XHRcdGFzeW5jIHZhbHVlKGl0ZXJhYmxlLCBmdW5jdGlvbl8pIHtcblx0XHRcdFx0Y29uc3QgcHJvbWlzZXMgPSBBcnJheS5mcm9tKGl0ZXJhYmxlLCAodmFsdWUsIGluZGV4KSA9PiB0aGlzKGZ1bmN0aW9uXywgdmFsdWUsIGluZGV4KSk7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcyk7XG5cdFx0XHR9LFxuXHRcdH0sXG5cdH0pO1xuXG5cdHJldHVybiBnZW5lcmF0b3I7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsaW1pdEZ1bmN0aW9uKGZ1bmN0aW9uXywgb3B0aW9ucykge1xuXHRjb25zdCBsaW1pdCA9IHBMaW1pdChvcHRpb25zKTtcblxuXHRyZXR1cm4gKC4uLmFyZ3VtZW50c18pID0+IGxpbWl0KCgpID0+IGZ1bmN0aW9uXyguLi5hcmd1bWVudHNfKSk7XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlQ29uY3VycmVuY3koY29uY3VycmVuY3kpIHtcblx0aWYgKCEoKE51bWJlci5pc0ludGVnZXIoY29uY3VycmVuY3kpIHx8IGNvbmN1cnJlbmN5ID09PSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFkpICYmIGNvbmN1cnJlbmN5ID4gMCkpIHtcblx0XHR0aHJvdyBuZXcgVHlwZUVycm9yKCdFeHBlY3RlZCBgY29uY3VycmVuY3lgIHRvIGJlIGEgbnVtYmVyIGZyb20gMSBhbmQgdXAnKTtcblx0fVxufVxuIiwgImltcG9ydCB7IFBhZ2VDb250ZXh0LCBUYWJNZXRhZGF0YSB9IGZyb20gXCIuLi8uLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IG5vcm1hbGl6ZVVybCwgcGFyc2VZb3VUdWJlVXJsLCBleHRyYWN0WW91VHViZUNoYW5uZWxGcm9tSHRtbCwgZXh0cmFjdFlvdVR1YmVHZW5yZUZyb21IdG1sIH0gZnJvbSBcIi4vbG9naWMuanNcIjtcbmltcG9ydCB7IGdldEdlbmVyYSB9IGZyb20gXCIuL2dlbmVyYVJlZ2lzdHJ5LmpzXCI7XG5pbXBvcnQgeyBsb2dEZWJ1ZyB9IGZyb20gXCIuLi8uLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBsb2FkUHJlZmVyZW5jZXMgfSBmcm9tIFwiLi4vcHJlZmVyZW5jZXMuanNcIjtcbmltcG9ydCBwTGltaXQgZnJvbSBcInAtbGltaXRcIjtcblxuaW50ZXJmYWNlIEV4dHJhY3Rpb25SZXNwb25zZSB7XG4gIGRhdGE6IFBhZ2VDb250ZXh0IHwgbnVsbDtcbiAgZXJyb3I/OiBzdHJpbmc7XG4gIHN0YXR1czpcbiAgICB8ICdPSydcbiAgICB8ICdSRVNUUklDVEVEJ1xuICAgIHwgJ0lOSkVDVElPTl9GQUlMRUQnXG4gICAgfCAnTk9fUkVTUE9OU0UnXG4gICAgfCAnTk9fSE9TVF9QRVJNSVNTSU9OJ1xuICAgIHwgJ0ZSQU1FX0FDQ0VTU19ERU5JRUQnO1xufVxuXG4vLyBTaW1wbGUgY29uY3VycmVuY3kgY29udHJvbFxuY29uc3QgTUFYX0NPTkNVUlJFTlRfRkVUQ0hFUyA9IDU7IC8vIENvbnNlcnZhdGl2ZSBsaW1pdCB0byBhdm9pZCByYXRlIGxpbWl0aW5nXG5jb25zdCBsaW1pdCA9IHBMaW1pdChNQVhfQ09OQ1VSUkVOVF9GRVRDSEVTKTtcblxuY29uc3QgZmV0Y2hXaXRoVGltZW91dCA9IGFzeW5jICh1cmw6IHN0cmluZywgdGltZW91dCA9IDIwMDApOiBQcm9taXNlPFJlc3BvbnNlPiA9PiB7XG4gICAgY29uc3QgY29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgICBjb25zdCBpZCA9IHNldFRpbWVvdXQoKCkgPT4gY29udHJvbGxlci5hYm9ydCgpLCB0aW1lb3V0KTtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHVybCwgeyBzaWduYWw6IGNvbnRyb2xsZXIuc2lnbmFsIH0pO1xuICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KGlkKTtcbiAgICB9XG59O1xuXG5leHBvcnQgY29uc3QgZXh0cmFjdFBhZ2VDb250ZXh0ID0gYXN5bmMgKHRhYjogVGFiTWV0YWRhdGEgfCBjaHJvbWUudGFicy5UYWIpOiBQcm9taXNlPEV4dHJhY3Rpb25SZXNwb25zZT4gPT4ge1xuICB0cnkge1xuICAgIGlmICghdGFiIHx8ICF0YWIudXJsKSB7XG4gICAgICAgIHJldHVybiB7IGRhdGE6IG51bGwsIGVycm9yOiBcIlRhYiBub3QgZm91bmQgb3Igbm8gVVJMXCIsIHN0YXR1czogJ05PX1JFU1BPTlNFJyB9O1xuICAgIH1cblxuICAgIGlmIChcbiAgICAgIHRhYi51cmwuc3RhcnRzV2l0aCgnY2hyb21lOi8vJykgfHxcbiAgICAgIHRhYi51cmwuc3RhcnRzV2l0aCgnZWRnZTovLycpIHx8XG4gICAgICB0YWIudXJsLnN0YXJ0c1dpdGgoJ2Fib3V0OicpIHx8XG4gICAgICB0YWIudXJsLnN0YXJ0c1dpdGgoJ2Nocm9tZS1leHRlbnNpb246Ly8nKSB8fFxuICAgICAgdGFiLnVybC5zdGFydHNXaXRoKCdjaHJvbWUtZXJyb3I6Ly8nKVxuICAgICkge1xuICAgICAgICByZXR1cm4geyBkYXRhOiBudWxsLCBlcnJvcjogXCJSZXN0cmljdGVkIFVSTCBzY2hlbWVcIiwgc3RhdHVzOiAnUkVTVFJJQ1RFRCcgfTtcbiAgICB9XG5cbiAgICBjb25zdCBwcmVmcyA9IGF3YWl0IGxvYWRQcmVmZXJlbmNlcygpO1xuICAgIGxldCBiYXNlbGluZSA9IGJ1aWxkQmFzZWxpbmVDb250ZXh0KHRhYiBhcyBjaHJvbWUudGFicy5UYWIsIHByZWZzLmN1c3RvbUdlbmVyYSk7XG5cbiAgICAvLyBGZXRjaCBhbmQgZW5yaWNoIGZvciBZb3VUdWJlIGlmIGF1dGhvciBpcyBtaXNzaW5nIGFuZCBpdCBpcyBhIHZpZGVvXG4gICAgY29uc3QgdGFyZ2V0VXJsID0gdGFiLnVybDtcbiAgICBjb25zdCB1cmxPYmogPSBuZXcgVVJMKHRhcmdldFVybCk7XG4gICAgY29uc3QgaG9zdG5hbWUgPSB1cmxPYmouaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sICcnKTtcbiAgICBpZiAoKGhvc3RuYW1lLmVuZHNXaXRoKCd5b3V0dWJlLmNvbScpIHx8IGhvc3RuYW1lLmVuZHNXaXRoKCd5b3V0dS5iZScpKSAmJiAoIWJhc2VsaW5lLmF1dGhvck9yQ3JlYXRvciB8fCBiYXNlbGluZS5nZW5yZSA9PT0gJ1ZpZGVvJykpIHtcbiAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgLy8gV2UgdXNlIGEgcXVldWUgdG8gcHJldmVudCBmbG9vZGluZyByZXF1ZXN0c1xuICAgICAgICAgICAgIGF3YWl0IGxpbWl0KGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaFdpdGhUaW1lb3V0KHRhcmdldFVybCk7XG4gICAgICAgICAgICAgICAgIGlmIChyZXNwb25zZS5vaykge1xuICAgICAgICAgICAgICAgICAgICAgY29uc3QgaHRtbCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNoYW5uZWwgPSBleHRyYWN0WW91VHViZUNoYW5uZWxGcm9tSHRtbChodG1sKTtcbiAgICAgICAgICAgICAgICAgICAgIGlmIChjaGFubmVsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgYmFzZWxpbmUuYXV0aG9yT3JDcmVhdG9yID0gY2hhbm5lbDtcbiAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGdlbnJlID0gZXh0cmFjdFlvdVR1YmVHZW5yZUZyb21IdG1sKGh0bWwpO1xuICAgICAgICAgICAgICAgICAgICAgaWYgKGdlbnJlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgYmFzZWxpbmUuZ2VucmUgPSBnZW5yZTtcbiAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgIH0pO1xuICAgICAgICAgfSBjYXRjaCAoZmV0Y2hFcnIpIHtcbiAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkZhaWxlZCB0byBmZXRjaCBZb3VUdWJlIHBhZ2UgY29udGVudFwiLCB7IGVycm9yOiBTdHJpbmcoZmV0Y2hFcnIpIH0pO1xuICAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBkYXRhOiBiYXNlbGluZSxcbiAgICAgIHN0YXR1czogJ09LJ1xuICAgIH07XG5cbiAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgbG9nRGVidWcoYEV4dHJhY3Rpb24gZmFpbGVkIGZvciB0YWIgJHt0YWI/LmlkfWAsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICByZXR1cm4ge1xuICAgICAgZGF0YTogbnVsbCxcbiAgICAgIGVycm9yOiBTdHJpbmcoZSksXG4gICAgICBzdGF0dXM6ICdJTkpFQ1RJT05fRkFJTEVEJ1xuICAgIH07XG4gIH1cbn07XG5cbmNvbnN0IGJ1aWxkQmFzZWxpbmVDb250ZXh0ID0gKHRhYjogY2hyb21lLnRhYnMuVGFiLCBjdXN0b21HZW5lcmE/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogUGFnZUNvbnRleHQgPT4ge1xuICBjb25zdCB1cmwgPSB0YWIudXJsIHx8IFwiXCI7XG4gIGxldCBob3N0bmFtZSA9IFwiXCI7XG4gIHRyeSB7XG4gICAgaG9zdG5hbWUgPSBuZXcgVVJMKHVybCkuaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sICcnKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGhvc3RuYW1lID0gXCJcIjtcbiAgfVxuXG4gIC8vIERldGVybWluZSBPYmplY3QgVHlwZSBmaXJzdFxuICBsZXQgb2JqZWN0VHlwZTogUGFnZUNvbnRleHRbJ29iamVjdFR5cGUnXSA9ICd1bmtub3duJztcbiAgbGV0IGF1dGhvck9yQ3JlYXRvcjogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cbiAgaWYgKHVybC5pbmNsdWRlcygnL2xvZ2luJykgfHwgdXJsLmluY2x1ZGVzKCcvc2lnbmluJykpIHtcbiAgICAgIG9iamVjdFR5cGUgPSAnbG9naW4nO1xuICB9IGVsc2UgaWYgKGhvc3RuYW1lLmluY2x1ZGVzKCd5b3V0dWJlLmNvbScpIHx8IGhvc3RuYW1lLmluY2x1ZGVzKCd5b3V0dS5iZScpKSB7XG4gICAgICBjb25zdCB7IHZpZGVvSWQgfSA9IHBhcnNlWW91VHViZVVybCh1cmwpO1xuICAgICAgaWYgKHZpZGVvSWQpIG9iamVjdFR5cGUgPSAndmlkZW8nO1xuXG4gICAgICAvLyBUcnkgdG8gZ3Vlc3MgY2hhbm5lbCBmcm9tIFVSTCBpZiBwb3NzaWJsZVxuICAgICAgaWYgKHVybC5pbmNsdWRlcygnL0AnKSkge1xuICAgICAgICAgIGNvbnN0IHBhcnRzID0gdXJsLnNwbGl0KCcvQCcpO1xuICAgICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGhhbmRsZSA9IHBhcnRzWzFdLnNwbGl0KCcvJylbMF07XG4gICAgICAgICAgICAgIGF1dGhvck9yQ3JlYXRvciA9ICdAJyArIGhhbmRsZTtcbiAgICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHVybC5pbmNsdWRlcygnL2MvJykpIHtcbiAgICAgICAgICBjb25zdCBwYXJ0cyA9IHVybC5zcGxpdCgnL2MvJyk7XG4gICAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgYXV0aG9yT3JDcmVhdG9yID0gZGVjb2RlVVJJQ29tcG9uZW50KHBhcnRzWzFdLnNwbGl0KCcvJylbMF0pO1xuICAgICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodXJsLmluY2x1ZGVzKCcvdXNlci8nKSkge1xuICAgICAgICAgIGNvbnN0IHBhcnRzID0gdXJsLnNwbGl0KCcvdXNlci8nKTtcbiAgICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICBhdXRob3JPckNyZWF0b3IgPSBkZWNvZGVVUklDb21wb25lbnQocGFydHNbMV0uc3BsaXQoJy8nKVswXSk7XG4gICAgICAgICAgfVxuICAgICAgfVxuICB9IGVsc2UgaWYgKGhvc3RuYW1lID09PSAnZ2l0aHViLmNvbScgJiYgdXJsLmluY2x1ZGVzKCcvcHVsbC8nKSkge1xuICAgICAgb2JqZWN0VHlwZSA9ICd0aWNrZXQnO1xuICB9IGVsc2UgaWYgKGhvc3RuYW1lID09PSAnZ2l0aHViLmNvbScgJiYgIXVybC5pbmNsdWRlcygnL3B1bGwvJykgJiYgdXJsLnNwbGl0KCcvJykubGVuZ3RoID49IDUpIHtcbiAgICAgIC8vIHJvdWdoIGNoZWNrIGZvciByZXBvXG4gICAgICBvYmplY3RUeXBlID0gJ3JlcG8nO1xuICB9XG5cbiAgLy8gRGV0ZXJtaW5lIEdlbnJlXG4gIC8vIFByaW9yaXR5IDE6IFNpdGUtc3BlY2lmaWMgZXh0cmFjdGlvbiAoZGVyaXZlZCBmcm9tIG9iamVjdFR5cGUpXG4gIGxldCBnZW5yZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG4gIGlmIChvYmplY3RUeXBlID09PSAndmlkZW8nKSBnZW5yZSA9ICdWaWRlbyc7XG4gIGVsc2UgaWYgKG9iamVjdFR5cGUgPT09ICdyZXBvJyB8fCBvYmplY3RUeXBlID09PSAndGlja2V0JykgZ2VucmUgPSAnRGV2ZWxvcG1lbnQnO1xuXG4gIC8vIFByaW9yaXR5IDI6IEZhbGxiYWNrIHRvIFJlZ2lzdHJ5XG4gIGlmICghZ2VucmUpIHtcbiAgICAgZ2VucmUgPSBnZXRHZW5lcmEoaG9zdG5hbWUsIGN1c3RvbUdlbmVyYSkgfHwgdW5kZWZpbmVkO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjYW5vbmljYWxVcmw6IHVybCB8fCBudWxsLFxuICAgIG5vcm1hbGl6ZWRVcmw6IG5vcm1hbGl6ZVVybCh1cmwpLFxuICAgIHNpdGVOYW1lOiBob3N0bmFtZSB8fCBudWxsLFxuICAgIHBsYXRmb3JtOiBob3N0bmFtZSB8fCBudWxsLFxuICAgIG9iamVjdFR5cGUsXG4gICAgb2JqZWN0SWQ6IHVybCB8fCBudWxsLFxuICAgIHRpdGxlOiB0YWIudGl0bGUgfHwgbnVsbCxcbiAgICBnZW5yZSxcbiAgICBkZXNjcmlwdGlvbjogbnVsbCxcbiAgICBhdXRob3JPckNyZWF0b3I6IGF1dGhvck9yQ3JlYXRvcixcbiAgICBwdWJsaXNoZWRBdDogbnVsbCxcbiAgICBtb2RpZmllZEF0OiBudWxsLFxuICAgIGxhbmd1YWdlOiBudWxsLFxuICAgIHRhZ3M6IFtdLFxuICAgIGJyZWFkY3J1bWJzOiBbXSxcbiAgICBpc0F1ZGlibGU6IGZhbHNlLFxuICAgIGlzTXV0ZWQ6IGZhbHNlLFxuICAgIGlzQ2FwdHVyaW5nOiBmYWxzZSxcbiAgICBwcm9ncmVzczogbnVsbCxcbiAgICBoYXNVbnNhdmVkQ2hhbmdlc0xpa2VseTogZmFsc2UsXG4gICAgaXNBdXRoZW50aWNhdGVkTGlrZWx5OiBmYWxzZSxcbiAgICBzb3VyY2VzOiB7XG4gICAgICBjYW5vbmljYWxVcmw6ICd1cmwnLFxuICAgICAgbm9ybWFsaXplZFVybDogJ3VybCcsXG4gICAgICBzaXRlTmFtZTogJ3VybCcsXG4gICAgICBwbGF0Zm9ybTogJ3VybCcsXG4gICAgICBvYmplY3RUeXBlOiAndXJsJyxcbiAgICAgIHRpdGxlOiB0YWIudGl0bGUgPyAndGFiJyA6ICd1cmwnLFxuICAgICAgZ2VucmU6ICdyZWdpc3RyeSdcbiAgICB9LFxuICAgIGNvbmZpZGVuY2U6IHt9XG4gIH07XG59O1xuIiwgImV4cG9ydCB0eXBlIENhdGVnb3J5UnVsZSA9IHN0cmluZyB8IHN0cmluZ1tdO1xuXG5leHBvcnQgaW50ZXJmYWNlIENhdGVnb3J5RGVmaW5pdGlvbiB7XG4gIGNhdGVnb3J5OiBzdHJpbmc7XG4gIHJ1bGVzOiBDYXRlZ29yeVJ1bGVbXTtcbn1cblxuZXhwb3J0IGNvbnN0IENBVEVHT1JZX0RFRklOSVRJT05TOiBDYXRlZ29yeURlZmluaXRpb25bXSA9IFtcbiAge1xuICAgIGNhdGVnb3J5OiBcIkRldmVsb3BtZW50XCIsXG4gICAgcnVsZXM6IFtcImdpdGh1YlwiLCBcInN0YWNrb3ZlcmZsb3dcIiwgXCJsb2NhbGhvc3RcIiwgXCJqaXJhXCIsIFwiZ2l0bGFiXCJdXG4gIH0sXG4gIHtcbiAgICBjYXRlZ29yeTogXCJXb3JrXCIsXG4gICAgcnVsZXM6IFtcbiAgICAgIFtcImdvb2dsZVwiLCBcImRvY3NcIl0sIFtcImdvb2dsZVwiLCBcInNoZWV0c1wiXSwgW1wiZ29vZ2xlXCIsIFwic2xpZGVzXCJdLFxuICAgICAgXCJsaW5rZWRpblwiLCBcInNsYWNrXCIsIFwiem9vbVwiLCBcInRlYW1zXCJcbiAgICBdXG4gIH0sXG4gIHtcbiAgICBjYXRlZ29yeTogXCJFbnRlcnRhaW5tZW50XCIsXG4gICAgcnVsZXM6IFtcIm5ldGZsaXhcIiwgXCJzcG90aWZ5XCIsIFwiaHVsdVwiLCBcImRpc25leVwiLCBcInlvdXR1YmVcIl1cbiAgfSxcbiAge1xuICAgIGNhdGVnb3J5OiBcIlNvY2lhbFwiLFxuICAgIHJ1bGVzOiBbXCJ0d2l0dGVyXCIsIFwiZmFjZWJvb2tcIiwgXCJpbnN0YWdyYW1cIiwgXCJyZWRkaXRcIiwgXCJ0aWt0b2tcIiwgXCJwaW50ZXJlc3RcIl1cbiAgfSxcbiAge1xuICAgIGNhdGVnb3J5OiBcIlNob3BwaW5nXCIsXG4gICAgcnVsZXM6IFtcImFtYXpvblwiLCBcImViYXlcIiwgXCJ3YWxtYXJ0XCIsIFwidGFyZ2V0XCIsIFwic2hvcGlmeVwiXVxuICB9LFxuICB7XG4gICAgY2F0ZWdvcnk6IFwiTmV3c1wiLFxuICAgIHJ1bGVzOiBbXCJjbm5cIiwgXCJiYmNcIiwgXCJueXRpbWVzXCIsIFwid2FzaGluZ3RvbnBvc3RcIiwgXCJmb3huZXdzXCJdXG4gIH0sXG4gIHtcbiAgICBjYXRlZ29yeTogXCJFZHVjYXRpb25cIixcbiAgICBydWxlczogW1wiY291cnNlcmFcIiwgXCJ1ZGVteVwiLCBcImVkeFwiLCBcImtoYW5hY2FkZW15XCIsIFwiY2FudmFzXCJdXG4gIH0sXG4gIHtcbiAgICBjYXRlZ29yeTogXCJUcmF2ZWxcIixcbiAgICBydWxlczogW1wiZXhwZWRpYVwiLCBcImJvb2tpbmdcIiwgXCJhaXJibmJcIiwgXCJ0cmlwYWR2aXNvclwiLCBcImtheWFrXCJdXG4gIH0sXG4gIHtcbiAgICBjYXRlZ29yeTogXCJIZWFsdGhcIixcbiAgICBydWxlczogW1wid2VibWRcIiwgXCJtYXlvY2xpbmljXCIsIFwibmloLmdvdlwiLCBcImhlYWx0aFwiXVxuICB9LFxuICB7XG4gICAgY2F0ZWdvcnk6IFwiU3BvcnRzXCIsXG4gICAgcnVsZXM6IFtcImVzcG5cIiwgXCJuYmFcIiwgXCJuZmxcIiwgXCJtbGJcIiwgXCJmaWZhXCJdXG4gIH0sXG4gIHtcbiAgICBjYXRlZ29yeTogXCJUZWNobm9sb2d5XCIsXG4gICAgcnVsZXM6IFtcInRlY2hjcnVuY2hcIiwgXCJ3aXJlZFwiLCBcInRoZXZlcmdlXCIsIFwiYXJzdGVjaG5pY2FcIl1cbiAgfSxcbiAge1xuICAgIGNhdGVnb3J5OiBcIlNjaWVuY2VcIixcbiAgICBydWxlczogW1wic2NpZW5jZVwiLCBcIm5hdHVyZS5jb21cIiwgXCJuYXNhLmdvdlwiXVxuICB9LFxuICB7XG4gICAgY2F0ZWdvcnk6IFwiR2FtaW5nXCIsXG4gICAgcnVsZXM6IFtcInR3aXRjaFwiLCBcInN0ZWFtXCIsIFwicm9ibG94XCIsIFwiaWduXCIsIFwiZ2FtZXNwb3RcIl1cbiAgfSxcbiAge1xuICAgIGNhdGVnb3J5OiBcIk11c2ljXCIsXG4gICAgcnVsZXM6IFtcInNvdW5kY2xvdWRcIiwgXCJiYW5kY2FtcFwiLCBcImxhc3QuZm1cIl1cbiAgfSxcbiAge1xuICAgIGNhdGVnb3J5OiBcIkFydFwiLFxuICAgIHJ1bGVzOiBbXCJkZXZpYW50YXJ0XCIsIFwiYmVoYW5jZVwiLCBcImRyaWJiYmxlXCIsIFwiYXJ0c3RhdGlvblwiXVxuICB9XG5dO1xuXG5leHBvcnQgY29uc3QgZ2V0Q2F0ZWdvcnlGcm9tVXJsID0gKHVybDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3QgbG93ZXJVcmwgPSB1cmwudG9Mb3dlckNhc2UoKTtcbiAgZm9yIChjb25zdCBkZWYgb2YgQ0FURUdPUllfREVGSU5JVElPTlMpIHtcbiAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZGVmLnJ1bGVzKSB7XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShydWxlKSkge1xuICAgICAgICBpZiAocnVsZS5ldmVyeShwYXJ0ID0+IGxvd2VyVXJsLmluY2x1ZGVzKHBhcnQpKSkge1xuICAgICAgICAgIHJldHVybiBkZWYuY2F0ZWdvcnk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChsb3dlclVybC5pbmNsdWRlcyhydWxlKSkge1xuICAgICAgICAgIHJldHVybiBkZWYuY2F0ZWdvcnk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIFwiVW5jYXRlZ29yaXplZFwiO1xufTtcbiIsICJpbXBvcnQgeyBUYWJNZXRhZGF0YSwgUGFnZUNvbnRleHQgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBsb2dEZWJ1ZywgbG9nRXJyb3IgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgZXh0cmFjdFBhZ2VDb250ZXh0IH0gZnJvbSBcIi4vZXh0cmFjdGlvbi9pbmRleC5qc1wiO1xuaW1wb3J0IHsgZ2V0Q2F0ZWdvcnlGcm9tVXJsIH0gZnJvbSBcIi4vY2F0ZWdvcnlSdWxlcy5qc1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIENvbnRleHRSZXN1bHQge1xuICBjb250ZXh0OiBzdHJpbmc7XG4gIHNvdXJjZTogJ0FJJyB8ICdIZXVyaXN0aWMnIHwgJ0V4dHJhY3Rpb24nO1xuICBkYXRhPzogUGFnZUNvbnRleHQ7XG4gIGVycm9yPzogc3RyaW5nO1xuICBzdGF0dXM/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBDYWNoZUVudHJ5IHtcbiAgcmVzdWx0OiBDb250ZXh0UmVzdWx0O1xuICB0aW1lc3RhbXA6IG51bWJlcjtcbiAgLy8gV2UgdXNlIHRoaXMgdG8gZGVjaWRlIHdoZW4gdG8gaW52YWxpZGF0ZSBjYWNoZVxufVxuXG5jb25zdCBjb250ZXh0Q2FjaGUgPSBuZXcgTWFwPHN0cmluZywgQ2FjaGVFbnRyeT4oKTtcbmNvbnN0IENBQ0hFX1RUTF9TVUNDRVNTID0gMjQgKiA2MCAqIDYwICogMTAwMDsgLy8gMjQgaG91cnNcbmNvbnN0IENBQ0hFX1RUTF9FUlJPUiA9IDUgKiA2MCAqIDEwMDA7IC8vIDUgbWludXRlc1xuXG5leHBvcnQgY29uc3QgYW5hbHl6ZVRhYkNvbnRleHQgPSBhc3luYyAoXG4gIHRhYnM6IFRhYk1ldGFkYXRhW10sXG4gIG9uUHJvZ3Jlc3M/OiAoY29tcGxldGVkOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+IHZvaWRcbik6IFByb21pc2U8TWFwPG51bWJlciwgQ29udGV4dFJlc3VsdD4+ID0+IHtcbiAgY29uc3QgY29udGV4dE1hcCA9IG5ldyBNYXA8bnVtYmVyLCBDb250ZXh0UmVzdWx0PigpO1xuICBsZXQgY29tcGxldGVkID0gMDtcbiAgY29uc3QgdG90YWwgPSB0YWJzLmxlbmd0aDtcblxuICBjb25zdCBwcm9taXNlcyA9IHRhYnMubWFwKGFzeW5jICh0YWIpID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgY2FjaGVLZXkgPSBgJHt0YWIuaWR9Ojoke3RhYi51cmx9YDtcbiAgICAgIGNvbnN0IGNhY2hlZCA9IGNvbnRleHRDYWNoZS5nZXQoY2FjaGVLZXkpO1xuXG4gICAgICBpZiAoY2FjaGVkKSB7XG4gICAgICAgIGNvbnN0IGlzRXJyb3IgPSBjYWNoZWQucmVzdWx0LnN0YXR1cyA9PT0gJ0VSUk9SJyB8fCAhIWNhY2hlZC5yZXN1bHQuZXJyb3I7XG4gICAgICAgIGNvbnN0IHR0bCA9IGlzRXJyb3IgPyBDQUNIRV9UVExfRVJST1IgOiBDQUNIRV9UVExfU1VDQ0VTUztcblxuICAgICAgICBpZiAoRGF0ZS5ub3coKSAtIGNhY2hlZC50aW1lc3RhbXAgPCB0dGwpIHtcbiAgICAgICAgICBjb250ZXh0TWFwLnNldCh0YWIuaWQsIGNhY2hlZC5yZXN1bHQpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb250ZXh0Q2FjaGUuZGVsZXRlKGNhY2hlS2V5KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBmZXRjaENvbnRleHRGb3JUYWIodGFiKTtcblxuICAgICAgLy8gQ2FjaGUgd2l0aCBleHBpcmF0aW9uIGxvZ2ljXG4gICAgICBjb250ZXh0Q2FjaGUuc2V0KGNhY2hlS2V5LCB7XG4gICAgICAgIHJlc3VsdCxcbiAgICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpXG4gICAgICB9KTtcblxuICAgICAgY29udGV4dE1hcC5zZXQodGFiLmlkLCByZXN1bHQpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dFcnJvcihgRmFpbGVkIHRvIGFuYWx5emUgY29udGV4dCBmb3IgdGFiICR7dGFiLmlkfWAsIHsgZXJyb3I6IFN0cmluZyhlcnJvcikgfSk7XG4gICAgICAvLyBFdmVuIGlmIGZldGNoQ29udGV4dEZvclRhYiBmYWlscyBjb21wbGV0ZWx5LCB3ZSB0cnkgYSBzYWZlIHN5bmMgZmFsbGJhY2tcbiAgICAgIGNvbnRleHRNYXAuc2V0KHRhYi5pZCwgeyBjb250ZXh0OiBcIlVuY2F0ZWdvcml6ZWRcIiwgc291cmNlOiAnSGV1cmlzdGljJywgZXJyb3I6IFN0cmluZyhlcnJvciksIHN0YXR1czogJ0VSUk9SJyB9KTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgY29tcGxldGVkKys7XG4gICAgICBpZiAob25Qcm9ncmVzcykgb25Qcm9ncmVzcyhjb21wbGV0ZWQsIHRvdGFsKTtcbiAgICB9XG4gIH0pO1xuXG4gIGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgcmV0dXJuIGNvbnRleHRNYXA7XG59O1xuXG5jb25zdCBmZXRjaENvbnRleHRGb3JUYWIgPSBhc3luYyAodGFiOiBUYWJNZXRhZGF0YSk6IFByb21pc2U8Q29udGV4dFJlc3VsdD4gPT4ge1xuICAvLyAxLiBSdW4gR2VuZXJpYyBFeHRyYWN0aW9uIChBbHdheXMpXG4gIGxldCBkYXRhOiBQYWdlQ29udGV4dCB8IG51bGwgPSBudWxsO1xuICBsZXQgZXJyb3I6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgbGV0IHN0YXR1czogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG4gIHRyeSB7XG4gICAgICBjb25zdCBleHRyYWN0aW9uID0gYXdhaXQgZXh0cmFjdFBhZ2VDb250ZXh0KHRhYik7XG4gICAgICBkYXRhID0gZXh0cmFjdGlvbi5kYXRhO1xuICAgICAgZXJyb3IgPSBleHRyYWN0aW9uLmVycm9yO1xuICAgICAgc3RhdHVzID0gZXh0cmFjdGlvbi5zdGF0dXM7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZ0RlYnVnKGBFeHRyYWN0aW9uIGZhaWxlZCBmb3IgdGFiICR7dGFiLmlkfWAsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgIGVycm9yID0gU3RyaW5nKGUpO1xuICAgICAgc3RhdHVzID0gJ0VSUk9SJztcbiAgfVxuXG4gIGxldCBjb250ZXh0ID0gXCJVbmNhdGVnb3JpemVkXCI7XG4gIGxldCBzb3VyY2U6IENvbnRleHRSZXN1bHRbJ3NvdXJjZSddID0gJ0hldXJpc3RpYyc7XG5cbiAgLy8gMi4gVHJ5IHRvIERldGVybWluZSBDYXRlZ29yeSBmcm9tIEV4dHJhY3Rpb24gRGF0YVxuICBpZiAoZGF0YSkge1xuICAgICAgaWYgKGRhdGEucGxhdGZvcm0gPT09ICdZb3VUdWJlJyB8fCBkYXRhLnBsYXRmb3JtID09PSAnTmV0ZmxpeCcgfHwgZGF0YS5wbGF0Zm9ybSA9PT0gJ1Nwb3RpZnknIHx8IGRhdGEucGxhdGZvcm0gPT09ICdUd2l0Y2gnKSB7XG4gICAgICAgICAgY29udGV4dCA9IFwiRW50ZXJ0YWlubWVudFwiO1xuICAgICAgICAgIHNvdXJjZSA9ICdFeHRyYWN0aW9uJztcbiAgICAgIH0gZWxzZSBpZiAoZGF0YS5wbGF0Zm9ybSA9PT0gJ0dpdEh1YicgfHwgZGF0YS5wbGF0Zm9ybSA9PT0gJ1N0YWNrIE92ZXJmbG93JyB8fCBkYXRhLnBsYXRmb3JtID09PSAnSmlyYScgfHwgZGF0YS5wbGF0Zm9ybSA9PT0gJ0dpdExhYicpIHtcbiAgICAgICAgICBjb250ZXh0ID0gXCJEZXZlbG9wbWVudFwiO1xuICAgICAgICAgIHNvdXJjZSA9ICdFeHRyYWN0aW9uJztcbiAgICAgIH0gZWxzZSBpZiAoZGF0YS5wbGF0Zm9ybSA9PT0gJ0dvb2dsZScgJiYgKGRhdGEubm9ybWFsaXplZFVybC5pbmNsdWRlcygnZG9jcycpIHx8IGRhdGEubm9ybWFsaXplZFVybC5pbmNsdWRlcygnc2hlZXRzJykgfHwgZGF0YS5ub3JtYWxpemVkVXJsLmluY2x1ZGVzKCdzbGlkZXMnKSkpIHtcbiAgICAgICAgICBjb250ZXh0ID0gXCJXb3JrXCI7XG4gICAgICAgICAgc291cmNlID0gJ0V4dHJhY3Rpb24nO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gSWYgd2UgaGF2ZSBzdWNjZXNzZnVsIGV4dHJhY3Rpb24gZGF0YSBidXQgbm8gc3BlY2lmaWMgcnVsZSBtYXRjaGVkLFxuICAgICAgICAvLyB1c2UgdGhlIE9iamVjdCBUeXBlIG9yIGdlbmVyaWMgXCJHZW5lcmFsIFdlYlwiIHRvIGluZGljYXRlIGV4dHJhY3Rpb24gd29ya2VkLlxuICAgICAgICAvLyBXZSBwcmVmZXIgc3BlY2lmaWMgY2F0ZWdvcmllcywgYnV0IFwiQXJ0aWNsZVwiIG9yIFwiVmlkZW9cIiBhcmUgYmV0dGVyIHRoYW4gXCJVbmNhdGVnb3JpemVkXCIuXG4gICAgICAgIGlmIChkYXRhLm9iamVjdFR5cGUgJiYgZGF0YS5vYmplY3RUeXBlICE9PSAndW5rbm93bicpIHtcbiAgICAgICAgICAgICAvLyBNYXAgb2JqZWN0IHR5cGVzIHRvIGNhdGVnb3JpZXMgaWYgcG9zc2libGVcbiAgICAgICAgICAgICBpZiAoZGF0YS5vYmplY3RUeXBlID09PSAndmlkZW8nKSBjb250ZXh0ID0gJ0VudGVydGFpbm1lbnQnO1xuICAgICAgICAgICAgIGVsc2UgaWYgKGRhdGEub2JqZWN0VHlwZSA9PT0gJ2FydGljbGUnKSBjb250ZXh0ID0gJ05ld3MnOyAvLyBMb29zZSBtYXBwaW5nLCBidXQgYmV0dGVyIHRoYW4gbm90aGluZ1xuICAgICAgICAgICAgIGVsc2UgY29udGV4dCA9IGRhdGEub2JqZWN0VHlwZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGRhdGEub2JqZWN0VHlwZS5zbGljZSgxKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICBjb250ZXh0ID0gXCJHZW5lcmFsIFdlYlwiO1xuICAgICAgICB9XG4gICAgICAgIHNvdXJjZSA9ICdFeHRyYWN0aW9uJztcbiAgICAgIH1cbiAgfVxuXG4gIC8vIDMuIEZhbGxiYWNrIHRvIExvY2FsIEhldXJpc3RpYyAoVVJMIFJlZ2V4KVxuICBpZiAoY29udGV4dCA9PT0gXCJVbmNhdGVnb3JpemVkXCIpIHtcbiAgICAgIGNvbnN0IGggPSBhd2FpdCBsb2NhbEhldXJpc3RpYyh0YWIpO1xuICAgICAgaWYgKGguY29udGV4dCAhPT0gXCJVbmNhdGVnb3JpemVkXCIpIHtcbiAgICAgICAgICBjb250ZXh0ID0gaC5jb250ZXh0O1xuICAgICAgICAgIC8vIHNvdXJjZSByZW1haW5zICdIZXVyaXN0aWMnIChvciBtYXliZSB3ZSBzaG91bGQgc2F5ICdIZXVyaXN0aWMnIGlzIHRoZSBzb3VyY2U/KVxuICAgICAgICAgIC8vIFRoZSBsb2NhbEhldXJpc3RpYyBmdW5jdGlvbiByZXR1cm5zIHsgc291cmNlOiAnSGV1cmlzdGljJyB9XG4gICAgICB9XG4gIH1cblxuICAvLyA0LiBGYWxsYmFjayB0byBBSSAoTExNKSAtIFJFTU9WRURcbiAgLy8gVGhlIEh1Z2dpbmdGYWNlIEFQSSBlbmRwb2ludCBpcyA0MTAgR29uZSBhbmQvb3IgcmVxdWlyZXMgYXV0aGVudGljYXRpb24gd2hpY2ggd2UgZG8gbm90IGhhdmUuXG4gIC8vIFRoZSBjb2RlIGhhcyBiZWVuIHJlbW92ZWQgdG8gcHJldmVudCBlcnJvcnMuXG5cbiAgaWYgKGNvbnRleHQgIT09IFwiVW5jYXRlZ29yaXplZFwiICYmIHNvdXJjZSAhPT0gXCJFeHRyYWN0aW9uXCIpIHtcbiAgICBlcnJvciA9IHVuZGVmaW5lZDtcbiAgICBzdGF0dXMgPSB1bmRlZmluZWQ7XG4gIH1cblxuICByZXR1cm4geyBjb250ZXh0LCBzb3VyY2UsIGRhdGE6IGRhdGEgfHwgdW5kZWZpbmVkLCBlcnJvciwgc3RhdHVzIH07XG59O1xuXG5jb25zdCBsb2NhbEhldXJpc3RpYyA9IGFzeW5jICh0YWI6IFRhYk1ldGFkYXRhKTogUHJvbWlzZTxDb250ZXh0UmVzdWx0PiA9PiB7XG4gIGNvbnN0IGNvbnRleHQgPSBnZXRDYXRlZ29yeUZyb21VcmwodGFiLnVybCk7XG4gIHJldHVybiB7IGNvbnRleHQsIHNvdXJjZTogJ0hldXJpc3RpYycgfTtcbn07XG4iLCAiaW1wb3J0IHsgZ3JvdXBUYWJzLCBnZXRDdXN0b21TdHJhdGVnaWVzLCBnZXRGaWVsZFZhbHVlLCByZXF1aXJlc0NvbnRleHRBbmFseXNpcyB9IGZyb20gXCIuL2dyb3VwaW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgc29ydFRhYnMsIGNvbXBhcmVCeSB9IGZyb20gXCIuL3NvcnRpbmdTdHJhdGVnaWVzLmpzXCI7XG5pbXBvcnQgeyBhbmFseXplVGFiQ29udGV4dCB9IGZyb20gXCIuL2NvbnRleHRBbmFseXNpcy5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcsIGxvZ0Vycm9yLCBsb2dJbmZvIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IEdyb3VwaW5nU2VsZWN0aW9uLCBQcmVmZXJlbmNlcywgVGFiR3JvdXAsIFRhYk1ldGFkYXRhLCBTb3J0aW5nUnVsZSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGdldFN0b3JlZFZhbHVlLCBzZXRTdG9yZWRWYWx1ZSB9IGZyb20gXCIuL3N0b3JhZ2UuanNcIjtcbmltcG9ydCB7IG1hcENocm9tZVRhYiwgYXNBcnJheSB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcblxuY29uc3QgZ2V0VGFic0ZvckZpbHRlciA9IGFzeW5jIChmaWx0ZXI/OiBHcm91cGluZ1NlbGVjdGlvbik6IFByb21pc2U8Y2hyb21lLnRhYnMuVGFiW10+ID0+IHtcbiAgY29uc3Qgd2luZG93SWRzID0gZmlsdGVyPy53aW5kb3dJZHM7XG4gIGNvbnN0IHRhYklkcyA9IGZpbHRlcj8udGFiSWRzO1xuICBjb25zdCBoYXNXaW5kb3dJZHMgPSB3aW5kb3dJZHMgJiYgd2luZG93SWRzLmxlbmd0aCA+IDA7XG4gIGNvbnN0IGhhc1RhYklkcyA9IHRhYklkcyAmJiB0YWJJZHMubGVuZ3RoID4gMDtcblxuICBpZiAoIWZpbHRlciB8fCAoIWhhc1dpbmRvd0lkcyAmJiAhaGFzVGFiSWRzKSkge1xuICAgIHJldHVybiBjaHJvbWUudGFicy5xdWVyeSh7fSk7XG4gIH1cblxuICBjb25zdCBwcm9taXNlczogUHJvbWlzZTxhbnk+W10gPSBbXTtcblxuICBpZiAoaGFzV2luZG93SWRzKSB7XG4gICAgd2luZG93SWRzLmZvckVhY2god2luZG93SWQgPT4ge1xuICAgICAgcHJvbWlzZXMucHVzaChjaHJvbWUudGFicy5xdWVyeSh7IHdpbmRvd0lkIH0pLmNhdGNoKCgpID0+IFtdKSk7XG4gICAgfSk7XG4gIH1cblxuICBpZiAoaGFzVGFiSWRzKSB7XG4gICAgdGFiSWRzLmZvckVhY2godGFiSWQgPT4ge1xuICAgICAgcHJvbWlzZXMucHVzaChjaHJvbWUudGFicy5nZXQodGFiSWQpLmNhdGNoKCgpID0+IG51bGwpKTtcbiAgICB9KTtcbiAgfVxuXG4gIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG5cbiAgLy8gRmxhdHRlbiBhbmQgZmlsdGVyIG91dCBudWxsc1xuICBjb25zdCBhbGxUYWJzOiBjaHJvbWUudGFicy5UYWJbXSA9IFtdO1xuICBmb3IgKGNvbnN0IHJlcyBvZiByZXN1bHRzKSB7XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShyZXMpKSB7XG4gICAgICAgICAgYWxsVGFicy5wdXNoKC4uLnJlcyk7XG4gICAgICB9IGVsc2UgaWYgKHJlcykge1xuICAgICAgICAgIGFsbFRhYnMucHVzaChyZXMpO1xuICAgICAgfVxuICB9XG5cbiAgLy8gRGVkdXBsaWNhdGUgYnkgSURcbiAgY29uc3QgdW5pcXVlVGFicyA9IG5ldyBNYXA8bnVtYmVyLCBjaHJvbWUudGFicy5UYWI+KCk7XG4gIGZvciAoY29uc3QgdGFiIG9mIGFsbFRhYnMpIHtcbiAgICAgIGlmICh0YWIuaWQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHVuaXF1ZVRhYnMuc2V0KHRhYi5pZCwgdGFiKTtcbiAgICAgIH1cbiAgfVxuXG4gIHJldHVybiBBcnJheS5mcm9tKHVuaXF1ZVRhYnMudmFsdWVzKCkpO1xufTtcblxuZXhwb3J0IGNvbnN0IGZldGNoQ3VycmVudFRhYkdyb3VwcyA9IGFzeW5jIChcbiAgcHJlZmVyZW5jZXM6IFByZWZlcmVuY2VzLFxuICBvblByb2dyZXNzPzogKGNvbXBsZXRlZDogbnVtYmVyLCB0b3RhbDogbnVtYmVyKSA9PiB2b2lkXG4pOiBQcm9taXNlPFRhYkdyb3VwW10+ID0+IHtcbiAgdHJ5IHtcbiAgY29uc3QgdGFicyA9IGF3YWl0IGNocm9tZS50YWJzLnF1ZXJ5KHt9KTtcbiAgY29uc3QgZ3JvdXBzID0gYXdhaXQgY2hyb21lLnRhYkdyb3Vwcy5xdWVyeSh7fSk7XG4gIGNvbnN0IGdyb3VwTWFwID0gbmV3IE1hcChncm91cHMubWFwKGcgPT4gW2cuaWQsIGddKSk7XG5cbiAgLy8gTWFwIHRhYnMgdG8gbWV0YWRhdGFcbiAgY29uc3QgbWFwcGVkID0gdGFicy5tYXAobWFwQ2hyb21lVGFiKS5maWx0ZXIoKHQpOiB0IGlzIFRhYk1ldGFkYXRhID0+IEJvb2xlYW4odCkpO1xuXG4gIGlmIChyZXF1aXJlc0NvbnRleHRBbmFseXNpcyhwcmVmZXJlbmNlcy5zb3J0aW5nKSkge1xuICAgICAgY29uc3QgY29udGV4dE1hcCA9IGF3YWl0IGFuYWx5emVUYWJDb250ZXh0KG1hcHBlZCwgb25Qcm9ncmVzcyk7XG4gICAgICBtYXBwZWQuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgICBjb25zdCByZXMgPSBjb250ZXh0TWFwLmdldCh0YWIuaWQpO1xuICAgICAgICB0YWIuY29udGV4dCA9IHJlcz8uY29udGV4dDtcbiAgICAgICAgdGFiLmNvbnRleHREYXRhID0gcmVzPy5kYXRhO1xuICAgICAgfSk7XG4gIH1cblxuICBjb25zdCByZXN1bHRHcm91cHM6IFRhYkdyb3VwW10gPSBbXTtcbiAgY29uc3QgdGFic0J5R3JvdXBJZCA9IG5ldyBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YVtdPigpO1xuICBjb25zdCB0YWJzQnlXaW5kb3dVbmdyb3VwZWQgPSBuZXcgTWFwPG51bWJlciwgVGFiTWV0YWRhdGFbXT4oKTtcblxuICBtYXBwZWQuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgY29uc3QgZ3JvdXBJZCA9IHRhYi5ncm91cElkID8/IC0xO1xuICAgICAgaWYgKGdyb3VwSWQgIT09IC0xKSB7XG4gICAgICAgICAgaWYgKCF0YWJzQnlHcm91cElkLmhhcyhncm91cElkKSkgdGFic0J5R3JvdXBJZC5zZXQoZ3JvdXBJZCwgW10pO1xuICAgICAgICAgIHRhYnNCeUdyb3VwSWQuZ2V0KGdyb3VwSWQpIS5wdXNoKHRhYik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgICBpZiAoIXRhYnNCeVdpbmRvd1VuZ3JvdXBlZC5oYXModGFiLndpbmRvd0lkKSkgdGFic0J5V2luZG93VW5ncm91cGVkLnNldCh0YWIud2luZG93SWQsIFtdKTtcbiAgICAgICAgICAgdGFic0J5V2luZG93VW5ncm91cGVkLmdldCh0YWIud2luZG93SWQpIS5wdXNoKHRhYik7XG4gICAgICB9XG4gIH0pO1xuXG4gIC8vIENyZWF0ZSBUYWJHcm91cCBvYmplY3RzIGZvciBhY3R1YWwgZ3JvdXBzXG4gIGZvciAoY29uc3QgW2dyb3VwSWQsIGdyb3VwVGFic10gb2YgdGFic0J5R3JvdXBJZCkge1xuICAgICAgY29uc3QgYnJvd3Nlckdyb3VwID0gZ3JvdXBNYXAuZ2V0KGdyb3VwSWQpO1xuICAgICAgaWYgKGJyb3dzZXJHcm91cCkge1xuICAgICAgICAgIHJlc3VsdEdyb3Vwcy5wdXNoKHtcbiAgICAgICAgICAgICAgaWQ6IGBncm91cC0ke2dyb3VwSWR9YCxcbiAgICAgICAgICAgICAgd2luZG93SWQ6IGJyb3dzZXJHcm91cC53aW5kb3dJZCxcbiAgICAgICAgICAgICAgbGFiZWw6IGJyb3dzZXJHcm91cC50aXRsZSB8fCBcIlVudGl0bGVkIEdyb3VwXCIsXG4gICAgICAgICAgICAgIGNvbG9yOiBicm93c2VyR3JvdXAuY29sb3IsXG4gICAgICAgICAgICAgIHRhYnM6IHNvcnRUYWJzKGdyb3VwVGFicywgcHJlZmVyZW5jZXMuc29ydGluZyksXG4gICAgICAgICAgICAgIHJlYXNvbjogXCJNYW51YWxcIlxuICAgICAgICAgIH0pO1xuICAgICAgfVxuICB9XG5cbiAgLy8gSGFuZGxlIHVuZ3JvdXBlZCB0YWJzXG4gIGZvciAoY29uc3QgW3dpbmRvd0lkLCB0YWJzXSBvZiB0YWJzQnlXaW5kb3dVbmdyb3VwZWQpIHtcbiAgICAgIHJlc3VsdEdyb3Vwcy5wdXNoKHtcbiAgICAgICAgICBpZDogYHVuZ3JvdXBlZC0ke3dpbmRvd0lkfWAsXG4gICAgICAgICAgd2luZG93SWQ6IHdpbmRvd0lkLFxuICAgICAgICAgIGxhYmVsOiBcIlVuZ3JvdXBlZFwiLFxuICAgICAgICAgIGNvbG9yOiBcImdyZXlcIixcbiAgICAgICAgICB0YWJzOiBzb3J0VGFicyh0YWJzLCBwcmVmZXJlbmNlcy5zb3J0aW5nKSxcbiAgICAgICAgICByZWFzb246IFwiVW5ncm91cGVkXCJcbiAgICAgIH0pO1xuICB9XG5cbiAgbG9nSW5mbyhcIkZldGNoZWQgY3VycmVudCB0YWIgZ3JvdXBzXCIsIHsgZ3JvdXBzOiByZXN1bHRHcm91cHMubGVuZ3RoLCB0YWJzOiBtYXBwZWQubGVuZ3RoIH0pO1xuICByZXR1cm4gcmVzdWx0R3JvdXBzO1xuICB9IGNhdGNoIChlKSB7XG4gICAgbG9nRXJyb3IoXCJFcnJvciBpbiBmZXRjaEN1cnJlbnRUYWJHcm91cHNcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgIHRocm93IGU7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBjYWxjdWxhdGVUYWJHcm91cHMgPSBhc3luYyAoXG4gIHByZWZlcmVuY2VzOiBQcmVmZXJlbmNlcyxcbiAgZmlsdGVyPzogR3JvdXBpbmdTZWxlY3Rpb24sXG4gIG9uUHJvZ3Jlc3M/OiAoY29tcGxldGVkOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+IHZvaWRcbik6IFByb21pc2U8VGFiR3JvdXBbXT4gPT4ge1xuICBjb25zdCBjaHJvbWVUYWJzID0gYXdhaXQgZ2V0VGFic0ZvckZpbHRlcihmaWx0ZXIpO1xuICBjb25zdCB3aW5kb3dJZFNldCA9IG5ldyBTZXQoZmlsdGVyPy53aW5kb3dJZHMgPz8gW10pO1xuICBjb25zdCB0YWJJZFNldCA9IG5ldyBTZXQoZmlsdGVyPy50YWJJZHMgPz8gW10pO1xuICBjb25zdCBoYXNGaWx0ZXJzID0gd2luZG93SWRTZXQuc2l6ZSA+IDAgfHwgdGFiSWRTZXQuc2l6ZSA+IDA7XG4gIGNvbnN0IGZpbHRlcmVkVGFicyA9IGNocm9tZVRhYnMuZmlsdGVyKCh0YWIpID0+IHtcbiAgICBpZiAoIWhhc0ZpbHRlcnMpIHJldHVybiB0cnVlO1xuICAgIHJldHVybiAodGFiLndpbmRvd0lkICYmIHdpbmRvd0lkU2V0Lmhhcyh0YWIud2luZG93SWQpKSB8fCAodGFiLmlkICYmIHRhYklkU2V0Lmhhcyh0YWIuaWQpKTtcbiAgfSk7XG4gIGNvbnN0IG1hcHBlZCA9IGZpbHRlcmVkVGFic1xuICAgIC5tYXAobWFwQ2hyb21lVGFiKVxuICAgIC5maWx0ZXIoKHRhYik6IHRhYiBpcyBUYWJNZXRhZGF0YSA9PiBCb29sZWFuKHRhYikpO1xuXG4gIGlmIChyZXF1aXJlc0NvbnRleHRBbmFseXNpcyhwcmVmZXJlbmNlcy5zb3J0aW5nKSkge1xuICAgIGNvbnN0IGNvbnRleHRNYXAgPSBhd2FpdCBhbmFseXplVGFiQ29udGV4dChtYXBwZWQsIG9uUHJvZ3Jlc3MpO1xuICAgIG1hcHBlZC5mb3JFYWNoKHRhYiA9PiB7XG4gICAgICBjb25zdCByZXMgPSBjb250ZXh0TWFwLmdldCh0YWIuaWQpO1xuICAgICAgdGFiLmNvbnRleHQgPSByZXM/LmNvbnRleHQ7XG4gICAgICB0YWIuY29udGV4dERhdGEgPSByZXM/LmRhdGE7XG4gICAgfSk7XG4gIH1cblxuICBjb25zdCBncm91cGVkID0gZ3JvdXBUYWJzKG1hcHBlZCwgcHJlZmVyZW5jZXMuc29ydGluZyk7XG4gIGdyb3VwZWQuZm9yRWFjaCgoZ3JvdXApID0+IHtcbiAgICBncm91cC50YWJzID0gc29ydFRhYnMoZ3JvdXAudGFicywgcHJlZmVyZW5jZXMuc29ydGluZyk7XG4gIH0pO1xuICBsb2dJbmZvKFwiQ2FsY3VsYXRlZCB0YWIgZ3JvdXBzXCIsIHsgZ3JvdXBzOiBncm91cGVkLmxlbmd0aCwgdGFiczogbWFwcGVkLmxlbmd0aCB9KTtcbiAgcmV0dXJuIGdyb3VwZWQ7XG59O1xuXG5jb25zdCBWQUxJRF9DT0xPUlMgPSBbXCJncmV5XCIsIFwiYmx1ZVwiLCBcInJlZFwiLCBcInllbGxvd1wiLCBcImdyZWVuXCIsIFwicGlua1wiLCBcInB1cnBsZVwiLCBcImN5YW5cIiwgXCJvcmFuZ2VcIl07XG5cbmV4cG9ydCBjb25zdCBhcHBseVRhYkdyb3VwcyA9IGFzeW5jIChncm91cHM6IFRhYkdyb3VwW10pID0+IHtcbiAgY29uc3QgY2xhaW1lZEdyb3VwSWRzID0gbmV3IFNldDxudW1iZXI+KCk7XG5cbiAgZm9yIChjb25zdCBncm91cCBvZiBncm91cHMpIHtcbiAgICBsZXQgdGFic1RvUHJvY2VzczogeyB3aW5kb3dJZDogbnVtYmVyLCB0YWJzOiBUYWJNZXRhZGF0YVtdIH1bXSA9IFtdO1xuXG4gICAgaWYgKGdyb3VwLndpbmRvd01vZGUgPT09ICduZXcnKSB7XG4gICAgICBpZiAoZ3JvdXAudGFicy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgZmlyc3QgPSBncm91cC50YWJzWzBdO1xuICAgICAgICAgIGNvbnN0IHdpbiA9IGF3YWl0IGNocm9tZS53aW5kb3dzLmNyZWF0ZSh7IHRhYklkOiBmaXJzdC5pZCB9KTtcbiAgICAgICAgICBjb25zdCB3aW5JZCA9IHdpbi5pZCE7XG4gICAgICAgICAgY29uc3Qgb3RoZXJzID0gZ3JvdXAudGFicy5zbGljZSgxKS5tYXAodCA9PiB0LmlkKTtcbiAgICAgICAgICBpZiAob3RoZXJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGF3YWl0IGNocm9tZS50YWJzLm1vdmUob3RoZXJzLCB7IHdpbmRvd0lkOiB3aW5JZCwgaW5kZXg6IC0xIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0YWJzVG9Qcm9jZXNzLnB1c2goeyB3aW5kb3dJZDogd2luSWQsIHRhYnM6IGdyb3VwLnRhYnMgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBsb2dFcnJvcihcIkVycm9yIGNyZWF0aW5nIG5ldyB3aW5kb3cgZm9yIGdyb3VwXCIsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZ3JvdXAud2luZG93TW9kZSA9PT0gJ2NvbXBvdW5kJykge1xuICAgICAgaWYgKGdyb3VwLnRhYnMubGVuZ3RoID4gMCkge1xuICAgICAgICAvLyBEZXRlcm1pbmUgdGFyZ2V0IHdpbmRvdyAobWFqb3JpdHkgd2lucylcbiAgICAgICAgY29uc3QgY291bnRzID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcj4oKTtcbiAgICAgICAgZ3JvdXAudGFicy5mb3JFYWNoKHQgPT4gY291bnRzLnNldCh0LndpbmRvd0lkLCAoY291bnRzLmdldCh0LndpbmRvd0lkKSB8fCAwKSArIDEpKTtcbiAgICAgICAgbGV0IHRhcmdldFdpbmRvd0lkID0gZ3JvdXAudGFic1swXS53aW5kb3dJZDtcbiAgICAgICAgbGV0IG1heCA9IDA7XG4gICAgICAgIGZvciAoY29uc3QgW3dpZCwgY291bnRdIG9mIGNvdW50cykge1xuICAgICAgICAgIGlmIChjb3VudCA+IG1heCkgeyBtYXggPSBjb3VudDsgdGFyZ2V0V2luZG93SWQgPSB3aWQ7IH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE1vdmUgdGFicyBub3QgaW4gdGFyZ2V0XG4gICAgICAgIGNvbnN0IHRvTW92ZSA9IGdyb3VwLnRhYnMuZmlsdGVyKHQgPT4gdC53aW5kb3dJZCAhPT0gdGFyZ2V0V2luZG93SWQpLm1hcCh0ID0+IHQuaWQpO1xuICAgICAgICBpZiAodG9Nb3ZlLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMubW92ZSh0b01vdmUsIHsgd2luZG93SWQ6IHRhcmdldFdpbmRvd0lkLCBpbmRleDogLTEgfSk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgbG9nRXJyb3IoXCJFcnJvciBtb3ZpbmcgdGFicyBmb3IgY29tcG91bmQgZ3JvdXBcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0YWJzVG9Qcm9jZXNzLnB1c2goeyB3aW5kb3dJZDogdGFyZ2V0V2luZG93SWQsIHRhYnM6IGdyb3VwLnRhYnMgfSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIEN1cnJlbnQgbW9kZTogc3BsaXQgYnkgc291cmNlIHdpbmRvd1xuICAgICAgY29uc3QgbWFwID0gZ3JvdXAudGFicy5yZWR1Y2U8TWFwPG51bWJlciwgVGFiTWV0YWRhdGFbXT4+KChhY2MsIHRhYikgPT4ge1xuICAgICAgICBjb25zdCBleGlzdGluZyA9IGFjYy5nZXQodGFiLndpbmRvd0lkKSA/PyBbXTtcbiAgICAgICAgZXhpc3RpbmcucHVzaCh0YWIpO1xuICAgICAgICBhY2Muc2V0KHRhYi53aW5kb3dJZCwgZXhpc3RpbmcpO1xuICAgICAgICByZXR1cm4gYWNjO1xuICAgICAgfSwgbmV3IE1hcCgpKTtcbiAgICAgIGZvciAoY29uc3QgW3dpZCwgdF0gb2YgbWFwKSB7XG4gICAgICAgIHRhYnNUb1Byb2Nlc3MucHVzaCh7IHdpbmRvd0lkOiB3aWQsIHRhYnM6IHQgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCB7IHdpbmRvd0lkOiB0YXJnZXRXaW5JZCwgdGFicyB9IG9mIHRhYnNUb1Byb2Nlc3MpIHtcbiAgICAgIC8vIEZpbmQgY2FuZGlkYXRlIGdyb3VwIElEIHRvIHJldXNlXG4gICAgICBsZXQgY2FuZGlkYXRlR3JvdXBJZDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuICAgICAgY29uc3QgY291bnRzID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcj4oKTtcbiAgICAgIGZvciAoY29uc3QgdCBvZiB0YWJzKSB7XG4gICAgICAgIC8vIE9ubHkgY29uc2lkZXIgZ3JvdXBzIHRoYXQgd2VyZSBhbHJlYWR5IGluIHRoaXMgd2luZG93XG4gICAgICAgIGlmICh0Lmdyb3VwSWQgJiYgdC5ncm91cElkICE9PSAtMSAmJiB0LndpbmRvd0lkID09PSB0YXJnZXRXaW5JZCkge1xuICAgICAgICAgIGNvdW50cy5zZXQodC5ncm91cElkLCAoY291bnRzLmdldCh0Lmdyb3VwSWQpIHx8IDApICsgMSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gUHJpb3JpdGl6ZSB0aGUgbW9zdCBmcmVxdWVudCBncm91cCBJRCB0aGF0IGhhc24ndCBiZWVuIGNsYWltZWQgeWV0XG4gICAgICBjb25zdCBzb3J0ZWRDYW5kaWRhdGVzID0gQXJyYXkuZnJvbShjb3VudHMuZW50cmllcygpKVxuICAgICAgICAuc29ydCgoYSwgYikgPT4gYlsxXSAtIGFbMV0pXG4gICAgICAgIC5tYXAoKFtpZF0pID0+IGlkKTtcblxuICAgICAgZm9yIChjb25zdCBpZCBvZiBzb3J0ZWRDYW5kaWRhdGVzKSB7XG4gICAgICAgIGlmICghY2xhaW1lZEdyb3VwSWRzLmhhcyhpZCkpIHtcbiAgICAgICAgICBjYW5kaWRhdGVHcm91cElkID0gaWQ7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gRmFsbGJhY2s6IElmIG5vIGNhbmRpZGF0ZSBncm91cCBJRCBmcm9tIHRhYnMgKGUuZy4gc2luZ2xlIG5ldyB0YWIpLCBsb29rIGZvciBleGlzdGluZyBncm91cCBieSBsYWJlbCBpbiB0YXJnZXQgd2luZG93XG4gICAgICBpZiAoY2FuZGlkYXRlR3JvdXBJZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgIGNvbnN0IHdpbmRvd0dyb3VwcyA9IGF3YWl0IGNocm9tZS50YWJHcm91cHMucXVlcnkoeyB3aW5kb3dJZDogdGFyZ2V0V2luSWQgfSk7XG4gICAgICAgICAgIC8vIEZpbmQgYSBncm91cCB3aXRoIHRoZSBzYW1lIHRpdGxlIHRoYXQgaGFzbid0IGJlZW4gY2xhaW1lZCB5ZXRcbiAgICAgICAgICAgY29uc3QgbWF0Y2hpbmdHcm91cCA9IHdpbmRvd0dyb3Vwcy5maW5kKGcgPT4gZy50aXRsZSA9PT0gZ3JvdXAubGFiZWwgJiYgIWNsYWltZWRHcm91cElkcy5oYXMoZy5pZCkpO1xuICAgICAgICAgICBpZiAobWF0Y2hpbmdHcm91cCkge1xuICAgICAgICAgICAgIGNhbmRpZGF0ZUdyb3VwSWQgPSBtYXRjaGluZ0dyb3VwLmlkO1xuICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgbG9nRXJyb3IoXCJFcnJvciBmaW5kaW5nIG1hdGNoaW5nIGdyb3VwIGJ5IGxhYmVsXCIsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBsZXQgZmluYWxHcm91cElkOiBudW1iZXI7XG5cbiAgICAgIGlmIChjYW5kaWRhdGVHcm91cElkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgY2xhaW1lZEdyb3VwSWRzLmFkZChjYW5kaWRhdGVHcm91cElkKTtcbiAgICAgICAgZmluYWxHcm91cElkID0gY2FuZGlkYXRlR3JvdXBJZDtcblxuICAgICAgICAvLyBDbGVhbiB1cCBsZWZ0b3ZlcnMgYW5kIGFkZCBtaXNzaW5nIHRhYnNcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBleGlzdGluZ1RhYnMgPSBhd2FpdCBjaHJvbWUudGFicy5xdWVyeSh7IGdyb3VwSWQ6IGZpbmFsR3JvdXBJZCB9KTtcbiAgICAgICAgICBjb25zdCBleGlzdGluZ1RhYklkcyA9IG5ldyBTZXQoZXhpc3RpbmdUYWJzLm1hcCh0ID0+IHQuaWQpKTtcbiAgICAgICAgICBjb25zdCB0YXJnZXRUYWJJZHMgPSBuZXcgU2V0KHRhYnMubWFwKHQgPT4gdC5pZCkpO1xuXG4gICAgICAgICAgLy8gMS4gVW5ncm91cCB0YWJzIHRoYXQgc2hvdWxkbid0IGJlIGhlcmVcbiAgICAgICAgICBjb25zdCBsZWZ0b3ZlcnMgPSBleGlzdGluZ1RhYnMuZmlsdGVyKHQgPT4gdC5pZCAhPT0gdW5kZWZpbmVkICYmICF0YXJnZXRUYWJJZHMuaGFzKHQuaWQpKTtcbiAgICAgICAgICBpZiAobGVmdG92ZXJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGF3YWl0IGNocm9tZS50YWJzLnVuZ3JvdXAobGVmdG92ZXJzLm1hcCh0ID0+IHQuaWQhKSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gMi4gQWRkIG9ubHkgdGhlIHRhYnMgdGhhdCBhcmVuJ3QgYWxyZWFkeSBpbiB0aGUgZ3JvdXBcbiAgICAgICAgICBjb25zdCB0YWJzVG9BZGQgPSB0YWJzLmZpbHRlcih0ID0+ICFleGlzdGluZ1RhYklkcy5oYXModC5pZCkpO1xuICAgICAgICAgIGlmICh0YWJzVG9BZGQubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgIC8vIEZvciBuZXcvY29tcG91bmQsIHRhYnMgbWlnaHQgaGF2ZSBiZWVuIG1vdmVkLCBzbyB3ZSBtdXN0IHBhc3MgdGFiSWRzXG4gICAgICAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMuZ3JvdXAoeyBncm91cElkOiBmaW5hbEdyb3VwSWQsIHRhYklkczogdGFic1RvQWRkLm1hcCh0ID0+IHQuaWQpIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIGxvZ0Vycm9yKFwiRXJyb3IgbWFuYWdpbmcgZ3JvdXAgcmV1c2VcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBDcmVhdGUgbmV3IGdyb3VwIChkZWZhdWx0IGJlaGF2aW9yOiBleHBhbmRlZClcbiAgICAgICAgLy8gRW5zdXJlIHdlIGNyZWF0ZSBpdCBpbiB0aGUgdGFyZ2V0IHdpbmRvdyAoaWYgc3RyaWN0bHkgbmV3LCB0YWJJZHMgaW1wbGllcyB3aW5kb3cgaWYgdGhleSBhcmUgaW4gaXQpXG4gICAgICAgIC8vIElmIHRhYnMgd2VyZSBqdXN0IG1vdmVkLCB0aGV5IGFyZSBpbiB0YXJnZXRXaW5JZC5cbiAgICAgICAgLy8gY2hyb21lLnRhYnMuZ3JvdXAgd2l0aCB0YWJJZHMgd2lsbCBpbmZlciB3aW5kb3cgZnJvbSB0YWJzLlxuICAgICAgICBmaW5hbEdyb3VwSWQgPSBhd2FpdCBjaHJvbWUudGFicy5ncm91cCh7XG4gICAgICAgICAgdGFiSWRzOiB0YWJzLm1hcCh0ID0+IHQuaWQpLFxuICAgICAgICAgIGNyZWF0ZVByb3BlcnRpZXM6IHsgd2luZG93SWQ6IHRhcmdldFdpbklkIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGNsYWltZWRHcm91cElkcy5hZGQoZmluYWxHcm91cElkKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgdXBkYXRlUHJvcHM6IGNocm9tZS50YWJHcm91cHMuVXBkYXRlUHJvcGVydGllcyA9IHtcbiAgICAgICAgdGl0bGU6IGdyb3VwLmxhYmVsXG4gICAgICB9O1xuICAgICAgaWYgKFZBTElEX0NPTE9SUy5pbmNsdWRlcyhncm91cC5jb2xvcikpIHtcbiAgICAgICAgICB1cGRhdGVQcm9wcy5jb2xvciA9IGdyb3VwLmNvbG9yIGFzIGNocm9tZS50YWJHcm91cHMuQ29sb3JFbnVtO1xuICAgICAgfVxuICAgICAgYXdhaXQgY2hyb21lLnRhYkdyb3Vwcy51cGRhdGUoZmluYWxHcm91cElkLCB1cGRhdGVQcm9wcyk7XG4gICAgfVxuICB9XG4gIGxvZ0luZm8oXCJBcHBsaWVkIHRhYiBncm91cHNcIiwgeyBjb3VudDogZ3JvdXBzLmxlbmd0aCB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBhcHBseVRhYlNvcnRpbmcgPSBhc3luYyAoXG4gIHByZWZlcmVuY2VzOiBQcmVmZXJlbmNlcyxcbiAgZmlsdGVyPzogR3JvdXBpbmdTZWxlY3Rpb24sXG4gIG9uUHJvZ3Jlc3M/OiAoY29tcGxldGVkOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+IHZvaWRcbikgPT4ge1xuICBjb25zdCB0YXJnZXRXaW5kb3dJZHMgPSBuZXcgU2V0PG51bWJlcj4oKTtcbiAgbGV0IGNocm9tZVRhYnM6IGNocm9tZS50YWJzLlRhYltdID0gW107XG5cbiAgY29uc3QgZXhwbGljaXRXaW5kb3dJZHMgPSBmaWx0ZXI/LndpbmRvd0lkcyA/PyBbXTtcbiAgY29uc3QgZXhwbGljaXRUYWJJZHMgPSBmaWx0ZXI/LnRhYklkcyA/PyBbXTtcbiAgY29uc3QgaGFzRmlsdGVyID0gZXhwbGljaXRXaW5kb3dJZHMubGVuZ3RoID4gMCB8fCBleHBsaWNpdFRhYklkcy5sZW5ndGggPiAwO1xuXG4gIGlmICghaGFzRmlsdGVyKSB7XG4gICAgICBjaHJvbWVUYWJzID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoe30pO1xuICAgICAgY2hyb21lVGFicy5mb3JFYWNoKHQgPT4geyBpZiAodC53aW5kb3dJZCkgdGFyZ2V0V2luZG93SWRzLmFkZCh0LndpbmRvd0lkKTsgfSk7XG4gIH0gZWxzZSB7XG4gICAgICBleHBsaWNpdFdpbmRvd0lkcy5mb3JFYWNoKGlkID0+IHRhcmdldFdpbmRvd0lkcy5hZGQoaWQpKTtcblxuICAgICAgaWYgKGV4cGxpY2l0VGFiSWRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBjb25zdCBzcGVjaWZpY1RhYnMgPSBhd2FpdCBQcm9taXNlLmFsbChleHBsaWNpdFRhYklkcy5tYXAoaWQgPT4gY2hyb21lLnRhYnMuZ2V0KGlkKS5jYXRjaCgoKSA9PiBudWxsKSkpO1xuICAgICAgICAgIHNwZWNpZmljVGFicy5mb3JFYWNoKHQgPT4ge1xuICAgICAgICAgICAgICBpZiAodCAmJiB0LndpbmRvd0lkKSB0YXJnZXRXaW5kb3dJZHMuYWRkKHQud2luZG93SWQpO1xuICAgICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB3aW5kb3dQcm9taXNlcyA9IEFycmF5LmZyb20odGFyZ2V0V2luZG93SWRzKS5tYXAod2luZG93SWQgPT5cbiAgICAgICAgICBjaHJvbWUudGFicy5xdWVyeSh7IHdpbmRvd0lkIH0pLmNhdGNoKCgpID0+IFtdKVxuICAgICAgKTtcbiAgICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbCh3aW5kb3dQcm9taXNlcyk7XG4gICAgICBjaHJvbWVUYWJzID0gcmVzdWx0cy5mbGF0KCk7XG4gIH1cblxuICBmb3IgKGNvbnN0IHdpbmRvd0lkIG9mIHRhcmdldFdpbmRvd0lkcykge1xuICAgICAgY29uc3Qgd2luZG93VGFicyA9IGNocm9tZVRhYnMuZmlsdGVyKHQgPT4gdC53aW5kb3dJZCA9PT0gd2luZG93SWQpO1xuICAgICAgY29uc3QgbWFwcGVkID0gd2luZG93VGFicy5tYXAobWFwQ2hyb21lVGFiKS5maWx0ZXIoKHQpOiB0IGlzIFRhYk1ldGFkYXRhID0+IEJvb2xlYW4odCkpO1xuXG4gICAgICBpZiAocmVxdWlyZXNDb250ZXh0QW5hbHlzaXMocHJlZmVyZW5jZXMuc29ydGluZykpIHtcbiAgICAgICAgY29uc3QgY29udGV4dE1hcCA9IGF3YWl0IGFuYWx5emVUYWJDb250ZXh0KG1hcHBlZCwgb25Qcm9ncmVzcyk7XG4gICAgICAgIG1hcHBlZC5mb3JFYWNoKHRhYiA9PiB7XG4gICAgICAgICAgY29uc3QgcmVzID0gY29udGV4dE1hcC5nZXQodGFiLmlkKTtcbiAgICAgICAgICB0YWIuY29udGV4dCA9IHJlcz8uY29udGV4dDtcbiAgICAgICAgICB0YWIuY29udGV4dERhdGEgPSByZXM/LmRhdGE7XG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICAvLyBHcm91cCB0YWJzIGJ5IGdyb3VwSWQgdG8gc29ydCB3aXRoaW4gZ3JvdXBzXG4gICAgICBjb25zdCB0YWJzQnlHcm91cCA9IG5ldyBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YVtdPigpO1xuICAgICAgY29uc3QgdW5ncm91cGVkVGFiczogVGFiTWV0YWRhdGFbXSA9IFtdO1xuXG4gICAgICBtYXBwZWQuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgICBjb25zdCBncm91cElkID0gdGFiLmdyb3VwSWQgPz8gLTE7XG4gICAgICAgIGlmIChncm91cElkICE9PSAtMSkge1xuICAgICAgICAgIGNvbnN0IGdyb3VwID0gdGFic0J5R3JvdXAuZ2V0KGdyb3VwSWQpID8/IFtdO1xuICAgICAgICAgIGdyb3VwLnB1c2godGFiKTtcbiAgICAgICAgICB0YWJzQnlHcm91cC5zZXQoZ3JvdXBJZCwgZ3JvdXApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHVuZ3JvdXBlZFRhYnMucHVzaCh0YWIpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgLy8gMS4gU29ydCB0YWJzIHdpdGhpbiBlYWNoIGdyb3VwXG4gICAgICBmb3IgKGNvbnN0IFtncm91cElkLCB0YWJzXSBvZiB0YWJzQnlHcm91cCkge1xuICAgICAgICBjb25zdCBncm91cFRhYkluZGljZXMgPSB3aW5kb3dUYWJzXG4gICAgICAgICAgLmZpbHRlcih0ID0+IHQuZ3JvdXBJZCA9PT0gZ3JvdXBJZClcbiAgICAgICAgICAubWFwKHQgPT4gdC5pbmRleClcbiAgICAgICAgICAuc29ydCgoYSwgYikgPT4gYSAtIGIpO1xuXG4gICAgICAgIGNvbnN0IHN0YXJ0SW5kZXggPSBncm91cFRhYkluZGljZXNbMF0gPz8gMDtcblxuICAgICAgICBjb25zdCBzb3J0ZWRHcm91cFRhYnMgPSBzb3J0VGFicyh0YWJzLCBwcmVmZXJlbmNlcy5zb3J0aW5nKTtcbiAgICAgICAgY29uc3Qgc29ydGVkSWRzID0gc29ydGVkR3JvdXBUYWJzLm1hcCh0ID0+IHQuaWQpO1xuXG4gICAgICAgIGlmIChzb3J0ZWRJZHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICBhd2FpdCBjaHJvbWUudGFicy5tb3ZlKHNvcnRlZElkcywgeyBpbmRleDogc3RhcnRJbmRleCB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyAyLiBTb3J0IHVuZ3JvdXBlZCB0YWJzXG4gICAgICBpZiAodW5ncm91cGVkVGFicy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvbnN0IHNvcnRlZFVuZ3JvdXBlZCA9IHNvcnRUYWJzKHVuZ3JvdXBlZFRhYnMsIHByZWZlcmVuY2VzLnNvcnRpbmcpO1xuICAgICAgICBjb25zdCBzb3J0ZWRJZHMgPSBzb3J0ZWRVbmdyb3VwZWQubWFwKHQgPT4gdC5pZCk7XG5cbiAgICAgICAgLy8gTW92ZSB0byBpbmRleCAwICh0b3Agb2Ygd2luZG93KVxuICAgICAgICBhd2FpdCBjaHJvbWUudGFicy5tb3ZlKHNvcnRlZElkcywgeyBpbmRleDogMCB9KTtcbiAgICAgIH1cblxuICAgICAgLy8gMy4gU29ydCBHcm91cHMgKGlmIGVuYWJsZWQpXG4gICAgICBhd2FpdCBzb3J0R3JvdXBzSWZFbmFibGVkKHdpbmRvd0lkLCBwcmVmZXJlbmNlcy5zb3J0aW5nLCB0YWJzQnlHcm91cCk7XG4gIH1cbiAgbG9nSW5mbyhcIkFwcGxpZWQgdGFiIHNvcnRpbmdcIik7XG59O1xuXG5jb25zdCBjb21wYXJlQnlTb3J0aW5nUnVsZXMgPSAoc29ydGluZ1J1bGVzQXJnOiBTb3J0aW5nUnVsZVtdLCBhOiBUYWJNZXRhZGF0YSwgYjogVGFiTWV0YWRhdGEpOiBudW1iZXIgPT4ge1xuICBjb25zdCBzb3J0UnVsZXNMaXN0ID0gYXNBcnJheTxTb3J0aW5nUnVsZT4oc29ydGluZ1J1bGVzQXJnKTtcbiAgaWYgKHNvcnRSdWxlc0xpc3QubGVuZ3RoID09PSAwKSByZXR1cm4gMDtcblxuICB0cnkge1xuICAgIGZvciAoY29uc3QgcnVsZSBvZiBzb3J0UnVsZXNMaXN0KSB7XG4gICAgICBpZiAoIXJ1bGUpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgdmFsQSA9IGdldEZpZWxkVmFsdWUoYSwgcnVsZS5maWVsZCk7XG4gICAgICBjb25zdCB2YWxCID0gZ2V0RmllbGRWYWx1ZShiLCBydWxlLmZpZWxkKTtcblxuICAgICAgbGV0IHJlc3VsdCA9IDA7XG4gICAgICBpZiAodmFsQSA8IHZhbEIpIHJlc3VsdCA9IC0xO1xuICAgICAgZWxzZSBpZiAodmFsQSA+IHZhbEIpIHJlc3VsdCA9IDE7XG5cbiAgICAgIGlmIChyZXN1bHQgIT09IDApIHtcbiAgICAgICAgcmV0dXJuIHJ1bGUub3JkZXIgPT09IFwiZGVzY1wiID8gLXJlc3VsdCA6IHJlc3VsdDtcbiAgICAgIH1cbiAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgbG9nRXJyb3IoXCJFcnJvciBldmFsdWF0aW5nIHNvcnRpbmcgcnVsZXNcIiwgeyBlcnJvcjogU3RyaW5nKGVycm9yKSB9KTtcbiAgfVxuXG4gIHJldHVybiAwO1xufTtcblxuY29uc3Qgc29ydEdyb3Vwc0lmRW5hYmxlZCA9IGFzeW5jIChcbiAgICB3aW5kb3dJZDogbnVtYmVyLFxuICAgIHNvcnRpbmdQcmVmZXJlbmNlczogc3RyaW5nW10sXG4gICAgdGFic0J5R3JvdXA6IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhW10+XG4pID0+IHtcbiAgICAvLyBDaGVjayBpZiBhbnkgYWN0aXZlIHN0cmF0ZWd5IGhhcyBzb3J0R3JvdXBzOiB0cnVlXG4gICAgY29uc3QgY3VzdG9tU3RyYXRzID0gZ2V0Q3VzdG9tU3RyYXRlZ2llcygpO1xuICAgIGxldCBncm91cFNvcnRlclN0cmF0ZWd5OiBSZXR1cm5UeXBlPHR5cGVvZiBjdXN0b21TdHJhdHMuZmluZD4gfCBudWxsID0gbnVsbDtcblxuICAgIGZvciAoY29uc3QgaWQgb2Ygc29ydGluZ1ByZWZlcmVuY2VzKSB7XG4gICAgICAgIGNvbnN0IHN0cmF0ZWd5ID0gY3VzdG9tU3RyYXRzLmZpbmQocyA9PiBzLmlkID09PSBpZCk7XG4gICAgICAgIGlmIChzdHJhdGVneSAmJiAoc3RyYXRlZ3kuc29ydEdyb3VwcyB8fCAoc3RyYXRlZ3kuZ3JvdXBTb3J0aW5nUnVsZXMgJiYgc3RyYXRlZ3kuZ3JvdXBTb3J0aW5nUnVsZXMubGVuZ3RoID4gMCkpKSB7XG4gICAgICAgICAgICBncm91cFNvcnRlclN0cmF0ZWd5ID0gc3RyYXRlZ3k7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmICghZ3JvdXBTb3J0ZXJTdHJhdGVneSkgcmV0dXJuO1xuXG4gICAgLy8gR2V0IGdyb3VwIGRldGFpbHNcbiAgICBjb25zdCBncm91cHMgPSBhd2FpdCBjaHJvbWUudGFiR3JvdXBzLnF1ZXJ5KHsgd2luZG93SWQgfSk7XG4gICAgaWYgKGdyb3Vwcy5sZW5ndGggPD0gMSkgcmV0dXJuO1xuXG4gICAgLy8gV2Ugc29ydCBncm91cHMgYmFzZWQgb24gdGhlIHN0cmF0ZWd5LlxuICAgIC8vIFNpbmNlIGNvbXBhcmVCeSBleHBlY3RzIFRhYk1ldGFkYXRhLCB3ZSBuZWVkIHRvIGNyZWF0ZSBhIHJlcHJlc2VudGF0aXZlIFRhYk1ldGFkYXRhIGZvciBlYWNoIGdyb3VwLlxuICAgIC8vIFdlJ2xsIHVzZSB0aGUgZmlyc3QgdGFiIG9mIHRoZSBncm91cCAoc29ydGVkKSBhcyB0aGUgcmVwcmVzZW50YXRpdmUuXG5cbiAgICBjb25zdCBncm91cFJlcHM6IHsgZ3JvdXA6IGNocm9tZS50YWJHcm91cHMuVGFiR3JvdXA7IHJlcDogVGFiTWV0YWRhdGEgfVtdID0gW107XG5cbiAgICBmb3IgKGNvbnN0IGdyb3VwIG9mIGdyb3Vwcykge1xuICAgICAgICBjb25zdCB0YWJzID0gdGFic0J5R3JvdXAuZ2V0KGdyb3VwLmlkKTtcbiAgICAgICAgaWYgKHRhYnMgJiYgdGFicy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAvLyB0YWJzIGFyZSBhbHJlYWR5IHNvcnRlZCBieSBzb3J0VGFicyBpbiBwcmV2aW91cyBzdGVwIGlmIHRoYXQgc3RyYXRlZ3kgd2FzIGFwcGxpZWRcbiAgICAgICAgICAgIC8vIG9yIHdlIGp1c3QgdGFrZSB0aGUgZmlyc3Qgb25lLlxuICAgICAgICAgICAgLy8gSWRlYWxseSB3ZSB1c2UgdGhlIFwiYmVzdFwiIHRhYi5cbiAgICAgICAgICAgIC8vIEJ1dCBzaW5jZSB3ZSBhbHJlYWR5IHNvcnRlZCB0YWJzIHdpdGhpbiBncm91cHMsIHRhYnNbMF0gaXMgdGhlIGZpcnN0IG9uZS5cbiAgICAgICAgICAgIGdyb3VwUmVwcy5wdXNoKHsgZ3JvdXAsIHJlcDogdGFic1swXSB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIFNvcnQgdGhlIGdyb3Vwc1xuICAgIGlmIChncm91cFNvcnRlclN0cmF0ZWd5Lmdyb3VwU29ydGluZ1J1bGVzICYmIEFycmF5LmlzQXJyYXkoZ3JvdXBTb3J0ZXJTdHJhdGVneS5ncm91cFNvcnRpbmdSdWxlcykgJiYgZ3JvdXBTb3J0ZXJTdHJhdGVneS5ncm91cFNvcnRpbmdSdWxlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGdyb3VwUmVwcy5zb3J0KChhLCBiKSA9PiBjb21wYXJlQnlTb3J0aW5nUnVsZXMoZ3JvdXBTb3J0ZXJTdHJhdGVneSEuZ3JvdXBTb3J0aW5nUnVsZXMhLCBhLnJlcCwgYi5yZXApKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBncm91cFJlcHMuc29ydCgoYSwgYikgPT4gY29tcGFyZUJ5KGdyb3VwU29ydGVyU3RyYXRlZ3khLmlkLCBhLnJlcCwgYi5yZXApKTtcbiAgICB9XG5cbiAgICAvLyBBcHBseSB0aGUgb3JkZXJcbiAgICAvLyBjaHJvbWUudGFiR3JvdXBzLm1vdmUoZ3JvdXBJZCwgeyBpbmRleDogLi4uIH0pXG4gICAgLy8gV2Ugd2FudCB0aGVtIHRvIGJlIGFmdGVyIHVuZ3JvdXBlZCB0YWJzICh3aGljaCBhcmUgYXQgaW5kZXggMC4uTikuXG4gICAgLy8gQWN0dWFsbHksIGNocm9tZS50YWJHcm91cHMubW92ZSBpbmRleCBpcyB0aGUgdGFiIGluZGV4IHdoZXJlIHRoZSBncm91cCBzdGFydHMuXG4gICAgLy8gSWYgd2Ugd2FudCB0byBzdHJpY3RseSBvcmRlciBncm91cHMsIHdlIHNob3VsZCBjYWxjdWxhdGUgdGhlIHRhcmdldCBpbmRleC5cbiAgICAvLyBCdXQgc2luY2UgZ3JvdXBzIGFyZSBjb250aWd1b3VzIGJsb2NrcyBvZiB0YWJzLCB3ZSBqdXN0IG5lZWQgdG8gcGxhY2UgdGhlbSBpbiBvcmRlci5cblxuICAgIC8vIENhbGN1bGF0ZSB0aGUgc3RhcnRpbmcgaW5kZXggZm9yIGdyb3Vwcy5cbiAgICAvLyBVbmdyb3VwZWQgdGFicyBhcmUgYXQgdGhlIHN0YXJ0IChpbmRleCAwKS5cbiAgICAvLyBTbyB0aGUgZmlyc3QgZ3JvdXAgc2hvdWxkIHN0YXJ0IGFmdGVyIHRoZSBsYXN0IHVuZ3JvdXBlZCB0YWIuXG4gICAgLy8gV2FpdCwgZWFybGllciB3ZSBtb3ZlZCB1bmdyb3VwZWQgdGFicyB0byBpbmRleCAwLlxuICAgIC8vIEJ1dCB3ZSBuZWVkIHRvIGtub3cgaG93IG1hbnkgdW5ncm91cGVkIHRhYnMgdGhlcmUgYXJlIGluIHRoaXMgd2luZG93LlxuXG4gICAgLy8gTGV0J3MgZ2V0IGN1cnJlbnQgdGFicyBhZ2FpbiBvciB0cmFjayBjb3VudD9cbiAgICAvLyBXZSBjYW4gYXNzdW1lIHVuZ3JvdXBlZCB0YWJzIGFyZSBhdCB0aGUgdG9wLlxuICAgIC8vIEJ1dCBgdGFic0J5R3JvdXBgIG9ubHkgY29udGFpbnMgZ3JvdXBlZCB0YWJzLlxuICAgIC8vIFdlIG5lZWQgdG8ga25vdyB3aGVyZSB0byBzdGFydCBwbGFjaW5nIGdyb3Vwcy5cbiAgICAvLyBUaGUgc2FmZXN0IHdheSBpcyB0byBtb3ZlIHRoZW0gb25lIGJ5IG9uZSB0byB0aGUgZW5kIChvciBzcGVjaWZpYyBpbmRleCkuXG5cbiAgICAvLyBJZiB3ZSBqdXN0IG1vdmUgdGhlbSBpbiBvcmRlciB0byBpbmRleCAtMSwgdGhleSB3aWxsIGFwcGVuZCB0byB0aGUgZW5kLlxuICAgIC8vIElmIHdlIHdhbnQgdGhlbSBhZnRlciB1bmdyb3VwZWQgdGFicywgd2UgbmVlZCB0byBmaW5kIHRoZSBpbmRleC5cblxuICAgIC8vIExldCdzIHVzZSBpbmRleCA9IC0xIHRvIHB1c2ggdG8gZW5kLCBzZXF1ZW50aWFsbHkuXG4gICAgLy8gQnV0IHdhaXQsIGlmIHdlIHB1c2ggdG8gZW5kLCB0aGUgb3JkZXIgaXMgcHJlc2VydmVkP1xuICAgIC8vIE5vLCBpZiB3ZSBpdGVyYXRlIHNvcnRlZCBncm91cHMgYW5kIG1vdmUgZWFjaCB0byAtMSwgdGhlIGxhc3Qgb25lIG1vdmVkIHdpbGwgYmUgYXQgdGhlIGVuZC5cbiAgICAvLyBTbyB3ZSBzaG91bGQgaXRlcmF0ZSBpbiBvcmRlciBhbmQgbW92ZSB0byAtMT8gTm8sIHRoYXQgd291bGQgcmV2ZXJzZSB0aGVtIGlmIHdlIGNvbnNpZGVyIFwiZW5kXCIuXG4gICAgLy8gQWN0dWFsbHksIGlmIHdlIG1vdmUgR3JvdXAgQSB0byAtMSwgaXQgZ29lcyB0byBlbmQuIFRoZW4gR3JvdXAgQiB0byAtMSwgaXQgZ29lcyBhZnRlciBBLlxuICAgIC8vIFNvIGl0ZXJhdGluZyBpbiBzb3J0ZWQgb3JkZXIgYW5kIG1vdmluZyB0byAtMSB3b3JrcyB0byBhcnJhbmdlIHRoZW0gYXQgdGhlIGVuZCBvZiB0aGUgd2luZG93LlxuXG4gICAgLy8gSG93ZXZlciwgaWYgdGhlcmUgYXJlIHBpbm5lZCB0YWJzIG9yIHVuZ3JvdXBlZCB0YWJzLCB0aGV5IHNob3VsZCBzdGF5IGF0IHRvcD9cbiAgICAvLyBVbmdyb3VwZWQgdGFicyB3ZXJlIG1vdmVkIHRvIGluZGV4IDAuXG4gICAgLy8gUGlubmVkIHRhYnM6IGBjaHJvbWUudGFicy5tb3ZlYCBoYW5kbGVzIHBpbm5lZCBjb25zdHJhaW50IChwaW5uZWQgdGFicyBtdXN0IGJlIGZpcnN0KS5cbiAgICAvLyBHcm91cHMgY2Fubm90IGNvbnRhaW4gcGlubmVkIHRhYnMuXG4gICAgLy8gU28gZ3JvdXBzIHdpbGwgYmUgYWZ0ZXIgcGlubmVkIHRhYnMuXG4gICAgLy8gSWYgd2UgbW92ZSB0byAtMSwgdGhleSBnbyB0byB0aGUgdmVyeSBlbmQuXG5cbiAgICAvLyBXaGF0IGlmIHdlIHdhbnQgdGhlbSBzcGVjaWZpY2FsbHkgYXJyYW5nZWQ/XG4gICAgLy8gSWYgd2UgbW92ZSB0aGVtIHNlcXVlbnRpYWxseSB0byAtMSwgdGhleSB3aWxsIGJlIG9yZGVyZWQgQSwgQiwgQy4uLiBhdCB0aGUgYm90dG9tLlxuICAgIC8vIFRoaXMgc2VlbXMgY29ycmVjdCBmb3IgXCJzb3J0aW5nIGdyb3Vwc1wiLlxuXG4gICAgZm9yIChjb25zdCBpdGVtIG9mIGdyb3VwUmVwcykge1xuICAgICAgICBhd2FpdCBjaHJvbWUudGFiR3JvdXBzLm1vdmUoaXRlbS5ncm91cC5pZCwgeyBpbmRleDogLTEgfSk7XG4gICAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGNsb3NlR3JvdXAgPSBhc3luYyAoZ3JvdXA6IFRhYkdyb3VwKSA9PiB7XG4gIGNvbnN0IGlkcyA9IGdyb3VwLnRhYnMubWFwKCh0YWIpID0+IHRhYi5pZCk7XG4gIGF3YWl0IGNocm9tZS50YWJzLnJlbW92ZShpZHMpO1xuICBsb2dJbmZvKFwiQ2xvc2VkIGdyb3VwXCIsIHsgbGFiZWw6IGdyb3VwLmxhYmVsLCBjb3VudDogaWRzLmxlbmd0aCB9KTtcbn07XG5cbmNvbnN0IGdldFRhYnNCeUlkcyA9IGFzeW5jICh0YWJJZHM6IG51bWJlcltdKTogUHJvbWlzZTxjaHJvbWUudGFicy5UYWJbXT4gPT4ge1xuICBpZiAoIXRhYklkcy5sZW5ndGgpIHJldHVybiBbXTtcbiAgY29uc3QgYWxsVGFicyA9IGF3YWl0IGNocm9tZS50YWJzLnF1ZXJ5KHt9KTtcbiAgY29uc3QgdGFiTWFwID0gbmV3IE1hcChhbGxUYWJzLm1hcCh0ID0+IFt0LmlkLCB0XSkpO1xuICByZXR1cm4gdGFiSWRzXG4gICAgLm1hcChpZCA9PiB0YWJNYXAuZ2V0KGlkKSlcbiAgICAuZmlsdGVyKCh0KTogdCBpcyBjaHJvbWUudGFicy5UYWIgPT4gdCAhPT0gdW5kZWZpbmVkICYmIHQuaWQgIT09IHVuZGVmaW5lZCAmJiB0LndpbmRvd0lkICE9PSB1bmRlZmluZWQpO1xufTtcblxuZXhwb3J0IGNvbnN0IG1lcmdlVGFicyA9IGFzeW5jICh0YWJJZHM6IG51bWJlcltdKSA9PiB7XG4gIGlmICghdGFiSWRzLmxlbmd0aCkgcmV0dXJuO1xuICBjb25zdCB2YWxpZFRhYnMgPSBhd2FpdCBnZXRUYWJzQnlJZHModGFiSWRzKTtcblxuICBpZiAodmFsaWRUYWJzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuXG4gIC8vIFRhcmdldCBXaW5kb3c6IFRoZSBvbmUgd2l0aCB0aGUgbW9zdCBzZWxlY3RlZCB0YWJzLCBvciB0aGUgZmlyc3Qgb25lLlxuICAvLyBVc2luZyB0aGUgZmlyc3QgdGFiJ3Mgd2luZG93IGFzIHRoZSB0YXJnZXQuXG4gIGNvbnN0IHRhcmdldFdpbmRvd0lkID0gdmFsaWRUYWJzWzBdLndpbmRvd0lkO1xuXG4gIC8vIDEuIE1vdmUgdGFicyB0byB0YXJnZXQgd2luZG93XG4gIGNvbnN0IHRhYnNUb01vdmUgPSB2YWxpZFRhYnMuZmlsdGVyKHQgPT4gdC53aW5kb3dJZCAhPT0gdGFyZ2V0V2luZG93SWQpO1xuICBpZiAodGFic1RvTW92ZS5sZW5ndGggPiAwKSB7XG4gICAgY29uc3QgbW92ZUlkcyA9IHRhYnNUb01vdmUubWFwKHQgPT4gdC5pZCEpO1xuICAgIGF3YWl0IGNocm9tZS50YWJzLm1vdmUobW92ZUlkcywgeyB3aW5kb3dJZDogdGFyZ2V0V2luZG93SWQsIGluZGV4OiAtMSB9KTtcbiAgfVxuXG4gIC8vIDIuIEdyb3VwIHRoZW1cbiAgLy8gQ2hlY2sgaWYgdGhlcmUgaXMgYW4gZXhpc3RpbmcgZ3JvdXAgaW4gdGhlIHRhcmdldCB3aW5kb3cgdGhhdCB3YXMgcGFydCBvZiB0aGUgc2VsZWN0aW9uLlxuICAvLyBXZSBwcmlvcml0aXplIHRoZSBncm91cCBvZiB0aGUgZmlyc3QgdGFiIGlmIGl0IGhhcyBvbmUuXG4gIGNvbnN0IGZpcnN0VGFiR3JvdXBJZCA9IHZhbGlkVGFic1swXS5ncm91cElkO1xuICBsZXQgdGFyZ2V0R3JvdXBJZDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG4gIGlmIChmaXJzdFRhYkdyb3VwSWQgJiYgZmlyc3RUYWJHcm91cElkICE9PSAtMSkge1xuICAgICAgLy8gVmVyaWZ5IHRoZSBncm91cCBpcyBpbiB0aGUgdGFyZ2V0IHdpbmRvdyAoaXQgc2hvdWxkIGJlLCBhcyB3ZSBwaWNrZWQgdGFyZ2V0V2luZG93SWQgZnJvbSB2YWxpZFRhYnNbMF0pXG4gICAgICAvLyBCdXQgaWYgdmFsaWRUYWJzWzBdIHdhcyBtb3ZlZCAoaXQgd2Fzbid0LCBhcyBpdCBkZWZpbmVkIHRoZSB0YXJnZXQpLCBpdCdzIGZpbmUuXG4gICAgICB0YXJnZXRHcm91cElkID0gZmlyc3RUYWJHcm91cElkO1xuICB9IGVsc2Uge1xuICAgICAgLy8gTG9vayBmb3IgYW55IG90aGVyIGdyb3VwIGluIHRoZSBzZWxlY3Rpb24gdGhhdCBpcyBpbiB0aGUgdGFyZ2V0IHdpbmRvd1xuICAgICAgY29uc3Qgb3RoZXJHcm91cCA9IHZhbGlkVGFicy5maW5kKHQgPT4gdC53aW5kb3dJZCA9PT0gdGFyZ2V0V2luZG93SWQgJiYgdC5ncm91cElkICE9PSAtMSk7XG4gICAgICBpZiAob3RoZXJHcm91cCkge1xuICAgICAgICAgIHRhcmdldEdyb3VwSWQgPSBvdGhlckdyb3VwLmdyb3VwSWQ7XG4gICAgICB9XG4gIH1cblxuICBjb25zdCBpZHMgPSB2YWxpZFRhYnMubWFwKHQgPT4gdC5pZCEpO1xuICBhd2FpdCBjaHJvbWUudGFicy5ncm91cCh7IHRhYklkczogaWRzLCBncm91cElkOiB0YXJnZXRHcm91cElkIH0pO1xuICBsb2dJbmZvKFwiTWVyZ2VkIHRhYnNcIiwgeyBjb3VudDogaWRzLmxlbmd0aCwgdGFyZ2V0V2luZG93SWQsIHRhcmdldEdyb3VwSWQgfSk7XG59O1xuXG5leHBvcnQgY29uc3Qgc3BsaXRUYWJzID0gYXN5bmMgKHRhYklkczogbnVtYmVyW10pID0+IHtcbiAgaWYgKHRhYklkcy5sZW5ndGggPT09IDApIHJldHVybjtcblxuICAvLyAxLiBWYWxpZGF0ZSB0YWJzXG4gIGNvbnN0IHZhbGlkVGFicyA9IGF3YWl0IGdldFRhYnNCeUlkcyh0YWJJZHMpO1xuXG4gIGlmICh2YWxpZFRhYnMubGVuZ3RoID09PSAwKSByZXR1cm47XG5cbiAgLy8gMi4gQ3JlYXRlIG5ldyB3aW5kb3cgd2l0aCB0aGUgZmlyc3QgdGFiXG4gIGNvbnN0IGZpcnN0VGFiID0gdmFsaWRUYWJzWzBdO1xuICBjb25zdCBuZXdXaW5kb3cgPSBhd2FpdCBjaHJvbWUud2luZG93cy5jcmVhdGUoeyB0YWJJZDogZmlyc3RUYWIuaWQgfSk7XG5cbiAgLy8gMy4gTW92ZSByZW1haW5pbmcgdGFicyB0byBuZXcgd2luZG93XG4gIGlmICh2YWxpZFRhYnMubGVuZ3RoID4gMSkge1xuICAgIGNvbnN0IHJlbWFpbmluZ1RhYklkcyA9IHZhbGlkVGFicy5zbGljZSgxKS5tYXAodCA9PiB0LmlkISk7XG4gICAgYXdhaXQgY2hyb21lLnRhYnMubW92ZShyZW1haW5pbmdUYWJJZHMsIHsgd2luZG93SWQ6IG5ld1dpbmRvdy5pZCEsIGluZGV4OiAtMSB9KTtcbiAgfVxuXG4gIGxvZ0luZm8oXCJTcGxpdCB0YWJzIHRvIG5ldyB3aW5kb3dcIiwgeyBjb3VudDogdmFsaWRUYWJzLmxlbmd0aCwgbmV3V2luZG93SWQ6IG5ld1dpbmRvdy5pZCB9KTtcbn07XG4iLCAiaW1wb3J0IHsgVW5kb1N0YXRlLCBTYXZlZFN0YXRlLCBXaW5kb3dTdGF0ZSwgU3RvcmVkVGFiU3RhdGUgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBnZXRTdG9yZWRWYWx1ZSwgc2V0U3RvcmVkVmFsdWUgfSBmcm9tIFwiLi9zdG9yYWdlLmpzXCI7XG5pbXBvcnQgeyBsb2dJbmZvLCBsb2dFcnJvciB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5cbmNvbnN0IE1BWF9VTkRPX1NUQUNLID0gMTA7XG5jb25zdCBVTkRPX1NUQUNLX0tFWSA9IFwidW5kb1N0YWNrXCI7XG5jb25zdCBTQVZFRF9TVEFURVNfS0VZID0gXCJzYXZlZFN0YXRlc1wiO1xuXG5leHBvcnQgY29uc3QgY2FwdHVyZUN1cnJlbnRTdGF0ZSA9IGFzeW5jICgpOiBQcm9taXNlPFVuZG9TdGF0ZT4gPT4ge1xuICBjb25zdCB3aW5kb3dzID0gYXdhaXQgY2hyb21lLndpbmRvd3MuZ2V0QWxsKHsgcG9wdWxhdGU6IHRydWUgfSk7XG4gIGNvbnN0IHdpbmRvd1N0YXRlczogV2luZG93U3RhdGVbXSA9IFtdO1xuXG4gIGZvciAoY29uc3Qgd2luIG9mIHdpbmRvd3MpIHtcbiAgICBpZiAoIXdpbi50YWJzKSBjb250aW51ZTtcbiAgICBjb25zdCB0YWJTdGF0ZXM6IFN0b3JlZFRhYlN0YXRlW10gPSB3aW4udGFicy5tYXAoKHRhYikgPT4ge1xuICAgICAgbGV0IGdyb3VwVGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgIGxldCBncm91cENvbG9yOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICAvLyBOb3RlOiB0YWIuZ3JvdXBJZCBpcyAtMSBpZiBub3QgZ3JvdXBlZC5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIGlkOiB0YWIuaWQsXG4gICAgICAgIHVybDogdGFiLnVybCB8fCBcIlwiLFxuICAgICAgICBwaW5uZWQ6IEJvb2xlYW4odGFiLnBpbm5lZCksXG4gICAgICAgIGdyb3VwSWQ6IHRhYi5ncm91cElkLFxuICAgICAgICBncm91cFRpdGxlLCAvLyBXaWxsIG5lZWQgdG8gZmV0Y2ggaWYgZ3JvdXBlZFxuICAgICAgICBncm91cENvbG9yLFxuICAgICAgfTtcbiAgICB9KTtcblxuICAgIC8vIFBvcHVsYXRlIGdyb3VwIGluZm8gaWYgbmVlZGVkXG4gICAgLy8gV2UgZG8gdGhpcyBpbiBhIHNlY29uZCBwYXNzIHRvIGJhdGNoIG9yIGp1c3QgaW5kaXZpZHVhbGx5IGlmIG5lZWRlZC5cbiAgICAvLyBBY3R1YWxseSwgd2UgY2FuIGdldCBncm91cCBpbmZvIGZyb20gY2hyb21lLnRhYkdyb3Vwcy5cbiAgICAvLyBIb3dldmVyLCB0aGUgdGFiIG9iamVjdCBkb2Vzbid0IGhhdmUgdGhlIGdyb3VwIHRpdGxlIGRpcmVjdGx5LlxuXG4gICAgLy8gT3B0aW1pemF0aW9uOiBHZXQgYWxsIGdyb3VwcyBmaXJzdC5cblxuICAgIHdpbmRvd1N0YXRlcy5wdXNoKHsgdGFiczogdGFiU3RhdGVzIH0pO1xuICB9XG5cbiAgLy8gRW5yaWNoIHdpdGggZ3JvdXAgaW5mb1xuICBjb25zdCBhbGxHcm91cHMgPSBhd2FpdCBjaHJvbWUudGFiR3JvdXBzLnF1ZXJ5KHt9KTtcbiAgY29uc3QgZ3JvdXBNYXAgPSBuZXcgTWFwKGFsbEdyb3Vwcy5tYXAoZyA9PiBbZy5pZCwgZ10pKTtcblxuICBmb3IgKGNvbnN0IHdpbiBvZiB3aW5kb3dTdGF0ZXMpIHtcbiAgICBmb3IgKGNvbnN0IHRhYiBvZiB3aW4udGFicykge1xuICAgICAgaWYgKHRhYi5ncm91cElkICYmIHRhYi5ncm91cElkICE9PSBjaHJvbWUudGFiR3JvdXBzLlRBQl9HUk9VUF9JRF9OT05FKSB7XG4gICAgICAgIGNvbnN0IGcgPSBncm91cE1hcC5nZXQodGFiLmdyb3VwSWQpO1xuICAgICAgICBpZiAoZykge1xuICAgICAgICAgIHRhYi5ncm91cFRpdGxlID0gZy50aXRsZTtcbiAgICAgICAgICB0YWIuZ3JvdXBDb2xvciA9IGcuY29sb3I7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcbiAgICB3aW5kb3dzOiB3aW5kb3dTdGF0ZXMsXG4gIH07XG59O1xuXG5leHBvcnQgY29uc3QgcHVzaFVuZG9TdGF0ZSA9IGFzeW5jICgpID0+IHtcbiAgY29uc3Qgc3RhdGUgPSBhd2FpdCBjYXB0dXJlQ3VycmVudFN0YXRlKCk7XG4gIGNvbnN0IHN0YWNrID0gKGF3YWl0IGdldFN0b3JlZFZhbHVlPFVuZG9TdGF0ZVtdPihVTkRPX1NUQUNLX0tFWSkpIHx8IFtdO1xuICBzdGFjay5wdXNoKHN0YXRlKTtcbiAgaWYgKHN0YWNrLmxlbmd0aCA+IE1BWF9VTkRPX1NUQUNLKSB7XG4gICAgc3RhY2suc2hpZnQoKTtcbiAgfVxuICBhd2FpdCBzZXRTdG9yZWRWYWx1ZShVTkRPX1NUQUNLX0tFWSwgc3RhY2spO1xuICBsb2dJbmZvKFwiUHVzaGVkIHVuZG8gc3RhdGVcIiwgeyBzdGFja1NpemU6IHN0YWNrLmxlbmd0aCB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBzYXZlU3RhdGUgPSBhc3luYyAobmFtZTogc3RyaW5nKSA9PiB7XG4gIGNvbnN0IHVuZG9TdGF0ZSA9IGF3YWl0IGNhcHR1cmVDdXJyZW50U3RhdGUoKTtcbiAgY29uc3Qgc2F2ZWRTdGF0ZTogU2F2ZWRTdGF0ZSA9IHtcbiAgICBuYW1lLFxuICAgIHRpbWVzdGFtcDogdW5kb1N0YXRlLnRpbWVzdGFtcCxcbiAgICB3aW5kb3dzOiB1bmRvU3RhdGUud2luZG93cyxcbiAgfTtcbiAgY29uc3Qgc2F2ZWRTdGF0ZXMgPSAoYXdhaXQgZ2V0U3RvcmVkVmFsdWU8U2F2ZWRTdGF0ZVtdPihTQVZFRF9TVEFURVNfS0VZKSkgfHwgW107XG4gIHNhdmVkU3RhdGVzLnB1c2goc2F2ZWRTdGF0ZSk7XG4gIGF3YWl0IHNldFN0b3JlZFZhbHVlKFNBVkVEX1NUQVRFU19LRVksIHNhdmVkU3RhdGVzKTtcbiAgbG9nSW5mbyhcIlNhdmVkIHN0YXRlXCIsIHsgbmFtZSB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRTYXZlZFN0YXRlcyA9IGFzeW5jICgpOiBQcm9taXNlPFNhdmVkU3RhdGVbXT4gPT4ge1xuICByZXR1cm4gKGF3YWl0IGdldFN0b3JlZFZhbHVlPFNhdmVkU3RhdGVbXT4oU0FWRURfU1RBVEVTX0tFWSkpIHx8IFtdO1xufTtcblxuZXhwb3J0IGNvbnN0IGRlbGV0ZVNhdmVkU3RhdGUgPSBhc3luYyAobmFtZTogc3RyaW5nKSA9PiB7XG4gIGxldCBzYXZlZFN0YXRlcyA9IChhd2FpdCBnZXRTdG9yZWRWYWx1ZTxTYXZlZFN0YXRlW10+KFNBVkVEX1NUQVRFU19LRVkpKSB8fCBbXTtcbiAgc2F2ZWRTdGF0ZXMgPSBzYXZlZFN0YXRlcy5maWx0ZXIocyA9PiBzLm5hbWUgIT09IG5hbWUpO1xuICBhd2FpdCBzZXRTdG9yZWRWYWx1ZShTQVZFRF9TVEFURVNfS0VZLCBzYXZlZFN0YXRlcyk7XG4gIGxvZ0luZm8oXCJEZWxldGVkIHNhdmVkIHN0YXRlXCIsIHsgbmFtZSB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCB1bmRvID0gYXN5bmMgKCkgPT4ge1xuICBjb25zdCBzdGFjayA9IChhd2FpdCBnZXRTdG9yZWRWYWx1ZTxVbmRvU3RhdGVbXT4oVU5ET19TVEFDS19LRVkpKSB8fCBbXTtcbiAgY29uc3Qgc3RhdGUgPSBzdGFjay5wb3AoKTtcbiAgaWYgKCFzdGF0ZSkge1xuICAgIGxvZ0luZm8oXCJVbmRvIHN0YWNrIGVtcHR5XCIpO1xuICAgIHJldHVybjtcbiAgfVxuICBhd2FpdCBzZXRTdG9yZWRWYWx1ZShVTkRPX1NUQUNLX0tFWSwgc3RhY2spO1xuICBhd2FpdCByZXN0b3JlU3RhdGUoc3RhdGUpO1xuICBsb2dJbmZvKFwiVW5kaWQgbGFzdCBhY3Rpb25cIik7XG59O1xuXG5leHBvcnQgY29uc3QgcmVzdG9yZVN0YXRlID0gYXN5bmMgKHN0YXRlOiBVbmRvU3RhdGUgfCBTYXZlZFN0YXRlKSA9PiB7XG4gIC8vIFN0cmF0ZWd5OlxuICAvLyAxLiBVbmdyb3VwIGFsbCB0YWJzIChvcHRpb25hbCwgYnV0IGNsZWFuZXIpLlxuICAvLyAyLiBNb3ZlIHRhYnMgdG8gY29ycmVjdCB3aW5kb3dzIGFuZCBpbmRpY2VzLlxuICAvLyAzLiBSZS1ncm91cCB0YWJzLlxuXG4gIC8vIFdlIG5lZWQgdG8gbWF0Y2ggY3VycmVudCB0YWJzIHRvIHN0b3JlZCB0YWJzLlxuICAvLyBQcmlvcml0eTogSUQgbWF0Y2ggLT4gVVJMIG1hdGNoLlxuXG4gIGNvbnN0IGN1cnJlbnRUYWJzID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoe30pO1xuICBjb25zdCBjdXJyZW50VGFiTWFwID0gbmV3IE1hcDxudW1iZXIsIGNocm9tZS50YWJzLlRhYj4oKTtcbiAgY29uc3QgY3VycmVudFVybE1hcCA9IG5ldyBNYXA8c3RyaW5nLCBjaHJvbWUudGFicy5UYWJbXT4oKTsgLy8gVVJMIC0+IGxpc3Qgb2YgdGFic1xuXG4gIGN1cnJlbnRUYWJzLmZvckVhY2godCA9PiB7XG4gICAgaWYgKHQuaWQpIGN1cnJlbnRUYWJNYXAuc2V0KHQuaWQsIHQpO1xuICAgIGlmICh0LnVybCkge1xuICAgICAgY29uc3QgbGlzdCA9IGN1cnJlbnRVcmxNYXAuZ2V0KHQudXJsKSB8fCBbXTtcbiAgICAgIGxpc3QucHVzaCh0KTtcbiAgICAgIGN1cnJlbnRVcmxNYXAuc2V0KHQudXJsLCBsaXN0KTtcbiAgICB9XG4gIH0pO1xuXG4gIC8vIEhlbHBlciB0byBmaW5kIGEgdGFiIChhc3luYyB0byBhbGxvdyBjcmVhdGlvbilcbiAgY29uc3QgZmluZE9yQ3JlYXRlVGFiID0gYXN5bmMgKHN0b3JlZDogU3RvcmVkVGFiU3RhdGUpOiBQcm9taXNlPGNocm9tZS50YWJzLlRhYiB8IHVuZGVmaW5lZD4gPT4ge1xuICAgIC8vIFRyeSBJRFxuICAgIGlmIChzdG9yZWQuaWQgJiYgY3VycmVudFRhYk1hcC5oYXMoc3RvcmVkLmlkKSkge1xuICAgICAgY29uc3QgdCA9IGN1cnJlbnRUYWJNYXAuZ2V0KHN0b3JlZC5pZCk7XG4gICAgICBjdXJyZW50VGFiTWFwLmRlbGV0ZShzdG9yZWQuaWQhKTsgLy8gQ29uc3VtZVxuICAgICAgLy8gQWxzbyByZW1vdmUgZnJvbSB1cmwgbWFwIHRvIGF2b2lkIGRvdWJsZSB1c2FnZVxuICAgICAgaWYgKHQ/LnVybCkge1xuICAgICAgICAgY29uc3QgbGlzdCA9IGN1cnJlbnRVcmxNYXAuZ2V0KHQudXJsKTtcbiAgICAgICAgIGlmIChsaXN0KSB7XG4gICAgICAgICAgICBjb25zdCBpZHggPSBsaXN0LmZpbmRJbmRleCh4ID0+IHguaWQgPT09IHQuaWQpO1xuICAgICAgICAgICAgaWYgKGlkeCAhPT0gLTEpIGxpc3Quc3BsaWNlKGlkeCwgMSk7XG4gICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gdDtcbiAgICB9XG4gICAgLy8gVHJ5IFVSTFxuICAgIGNvbnN0IGxpc3QgPSBjdXJyZW50VXJsTWFwLmdldChzdG9yZWQudXJsKTtcbiAgICBpZiAobGlzdCAmJiBsaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnN0IHQgPSBsaXN0LnNoaWZ0KCk7XG4gICAgICBpZiAodD8uaWQpIGN1cnJlbnRUYWJNYXAuZGVsZXRlKHQuaWQpOyAvLyBDb25zdW1lXG4gICAgICByZXR1cm4gdDtcbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgaWYgbWlzc2luZ1xuICAgIGlmIChzdG9yZWQudXJsKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB0ID0gYXdhaXQgY2hyb21lLnRhYnMuY3JlYXRlKHsgdXJsOiBzdG9yZWQudXJsLCBhY3RpdmU6IGZhbHNlIH0pO1xuICAgICAgICAgICAgcmV0dXJuIHQ7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGxvZ0Vycm9yKFwiRmFpbGVkIHRvIGNyZWF0ZSB0YWJcIiwgeyB1cmw6IHN0b3JlZC51cmwsIGVycm9yOiBlIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfTtcblxuICAvLyBXZSBuZWVkIHRvIHJlY29uc3RydWN0IHdpbmRvd3MuXG4gIC8vIElkZWFsbHksIHdlIG1hcCBzdGF0ZSB3aW5kb3dzIHRvIGN1cnJlbnQgd2luZG93cy5cbiAgLy8gQnV0IHN0cmljdGx5LCB3ZSBjYW4ganVzdCBtb3ZlIHRhYnMuXG5cbiAgLy8gRm9yIHNpbXBsaWNpdHksIGxldCdzIGFzc3VtZSB3ZSB1c2UgZXhpc3Rpbmcgd2luZG93cyBhcyBtdWNoIGFzIHBvc3NpYmxlLlxuICAvLyBPciBjcmVhdGUgbmV3IG9uZXMgaWYgd2UgcnVuIG91dD9cbiAgLy8gTGV0J3MgaXRlcmF0ZSBzdG9yZWQgd2luZG93cy5cblxuICBjb25zdCBjdXJyZW50V2luZG93cyA9IGF3YWl0IGNocm9tZS53aW5kb3dzLmdldEFsbCgpO1xuXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgc3RhdGUud2luZG93cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHdpblN0YXRlID0gc3RhdGUud2luZG93c1tpXTtcblxuICAgIC8vIElkZW50aWZ5IGFsbCB0YWJzIGZvciB0aGlzIHdpbmRvdyBmaXJzdC5cbiAgICAvLyBXZSBkbyB0aGlzIEJFRk9SRSBjcmVhdGluZyBhIHdpbmRvdyB0byBhdm9pZCBjcmVhdGluZyBlbXB0eSB3aW5kb3dzLlxuICAgIGNvbnN0IHRhYnNUb01vdmU6IHsgdGFiSWQ6IG51bWJlciwgc3RvcmVkOiBTdG9yZWRUYWJTdGF0ZSB9W10gPSBbXTtcblxuICAgIGZvciAoY29uc3Qgc3RvcmVkVGFiIG9mIHdpblN0YXRlLnRhYnMpIHtcbiAgICAgIGNvbnN0IGZvdW5kID0gYXdhaXQgZmluZE9yQ3JlYXRlVGFiKHN0b3JlZFRhYik7XG4gICAgICBpZiAoZm91bmQgJiYgZm91bmQuaWQpIHtcbiAgICAgICAgdGFic1RvTW92ZS5wdXNoKHsgdGFiSWQ6IGZvdW5kLmlkLCBzdG9yZWQ6IHN0b3JlZFRhYiB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAodGFic1RvTW92ZS5sZW5ndGggPT09IDApIGNvbnRpbnVlO1xuXG4gICAgbGV0IHRhcmdldFdpbmRvd0lkOiBudW1iZXI7XG5cbiAgICBpZiAoaSA8IGN1cnJlbnRXaW5kb3dzLmxlbmd0aCkge1xuICAgICAgdGFyZ2V0V2luZG93SWQgPSBjdXJyZW50V2luZG93c1tpXS5pZCE7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIENyZWF0ZSBuZXcgd2luZG93XG4gICAgICBjb25zdCB3aW4gPSBhd2FpdCBjaHJvbWUud2luZG93cy5jcmVhdGUoe30pO1xuICAgICAgdGFyZ2V0V2luZG93SWQgPSB3aW4uaWQhO1xuICAgICAgLy8gTm90ZTogTmV3IHdpbmRvdyBjcmVhdGlvbiBhZGRzIGEgdGFiLiBXZSBtaWdodCB3YW50IHRvIHJlbW92ZSBpdCBsYXRlciBvciBpZ25vcmUgaXQuXG4gICAgfVxuXG4gICAgLy8gTW92ZSBhbGwgdG8gd2luZG93LlxuICAgIC8vIE5vdGU6IElmIHdlIG1vdmUgdG8gaW5kZXggMCwgdGhleSB3aWxsIGJlIHByZXBlbmRlZC5cbiAgICAvLyBXZSBzaG91bGQgcHJvYmFibHkganVzdCBtb3ZlIHRoZW0gdG8gdGhlIHdpbmRvdyBmaXJzdC5cbiAgICAvLyBJZiB3ZSBtb3ZlIHRoZW0gaW5kaXZpZHVhbGx5IHRvIGNvcnJlY3QgaW5kZXgsIGl0J3Mgc2FmZXIuXG5cbiAgICBjb25zdCB0YWJJZHMgPSB0YWJzVG9Nb3ZlLm1hcCh0ID0+IHQudGFiSWQpO1xuICAgIHRyeSB7XG4gICAgICAvLyBPcHRpbWl6YXRpb246IEJhdGNoIG1vdmUgYWxsIHRhYnMgYXQgb25jZVxuICAgICAgYXdhaXQgY2hyb21lLnRhYnMubW92ZSh0YWJJZHMsIHsgd2luZG93SWQ6IHRhcmdldFdpbmRvd0lkLCBpbmRleDogMCB9KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2dFcnJvcihcIkZhaWxlZCB0byBiYXRjaCBtb3ZlIHRhYnMsIGZhbGxpbmcgYmFjayB0byBpbmRpdmlkdWFsIG1vdmVzXCIsIHsgZXJyb3I6IGUgfSk7XG4gICAgICAvLyBGYWxsYmFjazogTW92ZSBpbmRpdmlkdWFsbHkgaWYgYmF0Y2ggZmFpbHNcbiAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgdGFic1RvTW92ZS5sZW5ndGg7IGorKykge1xuICAgICAgICBjb25zdCB7IHRhYklkIH0gPSB0YWJzVG9Nb3ZlW2pdO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGF3YWl0IGNocm9tZS50YWJzLm1vdmUodGFiSWQsIHsgd2luZG93SWQ6IHRhcmdldFdpbmRvd0lkLCBpbmRleDogaiB9KTtcbiAgICAgICAgfSBjYXRjaCAoZTIpIHtcbiAgICAgICAgICBsb2dFcnJvcihcIkZhaWxlZCB0byBtb3ZlIHRhYiBpbmRpdmlkdWFsbHlcIiwgeyB0YWJJZCwgZXJyb3I6IGUyIH0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gSGFuZGxlIHBpbm5pbmcgYWZ0ZXIgbW92ZVxuICAgIGZvciAoY29uc3QgeyB0YWJJZCwgc3RvcmVkIH0gb2YgdGFic1RvTW92ZSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgaWYgKHN0b3JlZC5waW5uZWQpIHtcbiAgICAgICAgICBhd2FpdCBjaHJvbWUudGFicy51cGRhdGUodGFiSWQsIHsgcGlubmVkOiB0cnVlIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIElmIGN1cnJlbnRseSBwaW5uZWQgYnV0IHNob3VsZG4ndCBiZVxuICAgICAgICAgIGNvbnN0IGN1cnJlbnQgPSBhd2FpdCBjaHJvbWUudGFicy5nZXQodGFiSWQpO1xuICAgICAgICAgIGlmIChjdXJyZW50LnBpbm5lZCkgYXdhaXQgY2hyb21lLnRhYnMudXBkYXRlKHRhYklkLCB7IHBpbm5lZDogZmFsc2UgfSk7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgbG9nRXJyb3IoXCJGYWlsZWQgdG8gdXBkYXRlIHRhYiBwaW4gc3RhdGVcIiwgeyB0YWJJZCwgZXJyb3I6IGUgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gSGFuZGxlIEdyb3Vwc1xuICAgIC8vIElkZW50aWZ5IGdyb3VwcyBpbiB0aGlzIHdpbmRvd1xuICAgIGNvbnN0IGdyb3VwcyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXJbXT4oKTsgLy8gdGl0bGUrY29sb3IgLT4gdGFiSWRzXG4gICAgY29uc3QgZ3JvdXBDb2xvcnMgPSBuZXcgTWFwPHN0cmluZywgY2hyb21lLnRhYkdyb3Vwcy5Db2xvckVudW0+KCk7XG5cbiAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgdGFic1RvTW92ZSkge1xuICAgICAgaWYgKGl0ZW0uc3RvcmVkLmdyb3VwVGl0bGUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAvLyBVc2UgdGl0bGUgYXMga2V5IChvciB1bmlxdWUgSUQgaWYgd2UgaGFkIG9uZSwgYnV0IHdlIGRvbid0IHBlcnNpc3QgZ3JvdXAgSURzKVxuICAgICAgICAvLyBHcm91cCBJRCBpbiBzdG9yYWdlIGlzIGVwaGVtZXJhbC4gVGl0bGUgaXMga2V5LlxuICAgICAgICBjb25zdCBrZXkgPSBpdGVtLnN0b3JlZC5ncm91cFRpdGxlO1xuICAgICAgICBjb25zdCBsaXN0ID0gZ3JvdXBzLmdldChrZXkpIHx8IFtdO1xuICAgICAgICBsaXN0LnB1c2goaXRlbS50YWJJZCk7XG4gICAgICAgIGdyb3Vwcy5zZXQoa2V5LCBsaXN0KTtcbiAgICAgICAgaWYgKGl0ZW0uc3RvcmVkLmdyb3VwQ29sb3IpIHtcbiAgICAgICAgICAgICBncm91cENvbG9ycy5zZXQoa2V5LCBpdGVtLnN0b3JlZC5ncm91cENvbG9yIGFzIGNocm9tZS50YWJHcm91cHMuQ29sb3JFbnVtKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgIC8vIFVuZ3JvdXAgaWYgbmVlZGVkXG4gICAgICAgICBhd2FpdCBjaHJvbWUudGFicy51bmdyb3VwKGl0ZW0udGFiSWQpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgW3RpdGxlLCBpZHNdIG9mIGdyb3Vwcy5lbnRyaWVzKCkpIHtcbiAgICAgIGlmIChpZHMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCBncm91cElkID0gYXdhaXQgY2hyb21lLnRhYnMuZ3JvdXAoeyB0YWJJZHM6IGlkcyB9KTtcbiAgICAgICAgYXdhaXQgY2hyb21lLnRhYkdyb3Vwcy51cGRhdGUoZ3JvdXBJZCwge1xuICAgICAgICAgICAgIHRpdGxlOiB0aXRsZSxcbiAgICAgICAgICAgICBjb2xvcjogZ3JvdXBDb2xvcnMuZ2V0KHRpdGxlKSB8fCBcImdyZXlcIlxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG4iLCAiaW1wb3J0IHsgYXBwbHlUYWJHcm91cHMsIGFwcGx5VGFiU29ydGluZywgY2FsY3VsYXRlVGFiR3JvdXBzLCBmZXRjaEN1cnJlbnRUYWJHcm91cHMsIG1lcmdlVGFicywgc3BsaXRUYWJzIH0gZnJvbSBcIi4vdGFiTWFuYWdlci5qc1wiO1xuaW1wb3J0IHsgbG9hZFByZWZlcmVuY2VzLCBzYXZlUHJlZmVyZW5jZXMgfSBmcm9tIFwiLi9wcmVmZXJlbmNlcy5qc1wiO1xuaW1wb3J0IHsgc2V0Q3VzdG9tU3RyYXRlZ2llcyB9IGZyb20gXCIuL2dyb3VwaW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcsIGxvZ0luZm8sIGdldExvZ3MsIGNsZWFyTG9ncywgc2V0TG9nZ2VyUHJlZmVyZW5jZXMsIGluaXRMb2dnZXIsIGFkZExvZ0VudHJ5LCBsb2dnZXJSZWFkeSB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBwdXNoVW5kb1N0YXRlLCBzYXZlU3RhdGUsIHVuZG8sIGdldFNhdmVkU3RhdGVzLCBkZWxldGVTYXZlZFN0YXRlLCByZXN0b3JlU3RhdGUgfSBmcm9tIFwiLi9zdGF0ZU1hbmFnZXIuanNcIjtcbmltcG9ydCB7XG4gIEFwcGx5R3JvdXBpbmdQYXlsb2FkLFxuICBHcm91cGluZ1NlbGVjdGlvbixcbiAgR3JvdXBpbmdTdHJhdGVneSxcbiAgUHJlZmVyZW5jZXMsXG4gIFJ1bnRpbWVNZXNzYWdlLFxuICBSdW50aW1lUmVzcG9uc2UsXG4gIFNvcnRpbmdTdHJhdGVneSxcbiAgVGFiR3JvdXBcbn0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuXG5jaHJvbWUucnVudGltZS5vbkluc3RhbGxlZC5hZGRMaXN0ZW5lcihhc3luYyAoKSA9PiB7XG4gIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gIHNldEN1c3RvbVN0cmF0ZWdpZXMocHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXSk7XG4gIGxvZ0luZm8oXCJFeHRlbnNpb24gaW5zdGFsbGVkXCIsIHtcbiAgICB2ZXJzaW9uOiBjaHJvbWUucnVudGltZS5nZXRNYW5pZmVzdCgpLnZlcnNpb24sXG4gICAgbG9nTGV2ZWw6IHByZWZzLmxvZ0xldmVsLFxuICAgIHN0cmF0ZWdpZXNDb3VudDogcHJlZnMuY3VzdG9tU3RyYXRlZ2llcz8ubGVuZ3RoIHx8IDBcbiAgfSk7XG59KTtcblxuLy8gSW5pdGlhbGl6ZSBsb2dnZXIgb24gc3RhcnR1cFxubG9hZFByZWZlcmVuY2VzKCkudGhlbihhc3luYyAocHJlZnMpID0+IHtcbiAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuICAgIGF3YWl0IGluaXRMb2dnZXIoKTtcbiAgICBsb2dJbmZvKFwiU2VydmljZSBXb3JrZXIgSW5pdGlhbGl6ZWRcIiwge1xuICAgICAgICB2ZXJzaW9uOiBjaHJvbWUucnVudGltZS5nZXRNYW5pZmVzdCgpLnZlcnNpb24sXG4gICAgICAgIGxvZ0xldmVsOiBwcmVmcy5sb2dMZXZlbFxuICAgIH0pO1xufSk7XG5cbmNvbnN0IGhhbmRsZU1lc3NhZ2UgPSBhc3luYyA8VERhdGE+KFxuICBtZXNzYWdlOiBSdW50aW1lTWVzc2FnZSxcbiAgc2VuZGVyOiBjaHJvbWUucnVudGltZS5NZXNzYWdlU2VuZGVyXG4pOiBQcm9taXNlPFJ1bnRpbWVSZXNwb25zZTxURGF0YT4+ID0+IHtcbiAgbG9nRGVidWcoXCJSZWNlaXZlZCBtZXNzYWdlXCIsIHsgdHlwZTogbWVzc2FnZS50eXBlLCBmcm9tOiBzZW5kZXIuaWQgfSk7XG4gIHN3aXRjaCAobWVzc2FnZS50eXBlKSB7XG4gICAgY2FzZSBcImdldFN0YXRlXCI6IHtcbiAgICAgIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuICAgICAgLy8gVXNlIGZldGNoQ3VycmVudFRhYkdyb3VwcyB0byByZXR1cm4gdGhlIGFjdHVhbCBzdGF0ZSBvZiB0aGUgYnJvd3NlciB0YWJzXG4gICAgICBjb25zdCBncm91cHMgPSBhd2FpdCBmZXRjaEN1cnJlbnRUYWJHcm91cHMocHJlZnMpO1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGRhdGE6IHsgZ3JvdXBzLCBwcmVmZXJlbmNlczogcHJlZnMgfSBhcyBURGF0YSB9O1xuICAgIH1cbiAgICBjYXNlIFwiYXBwbHlHcm91cGluZ1wiOiB7XG4gICAgICBsb2dJbmZvKFwiQXBwbHlpbmcgZ3JvdXBpbmcgZnJvbSBtZXNzYWdlXCIsIHsgc29ydGluZzogKG1lc3NhZ2UucGF5bG9hZCBhcyBhbnkpPy5zb3J0aW5nIH0pO1xuICAgICAgYXdhaXQgcHVzaFVuZG9TdGF0ZSgpO1xuICAgICAgY29uc3QgcHJlZnMgPSBhd2FpdCBsb2FkUHJlZmVyZW5jZXMoKTtcbiAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMocHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXSk7XG4gICAgICBjb25zdCBwYXlsb2FkID0gKG1lc3NhZ2UucGF5bG9hZCBhcyBBcHBseUdyb3VwaW5nUGF5bG9hZCB8IHVuZGVmaW5lZCkgPz8ge307XG4gICAgICBjb25zdCBzZWxlY3Rpb24gPSBwYXlsb2FkLnNlbGVjdGlvbiA/PyB7fTtcbiAgICAgIGNvbnN0IHNvcnRpbmcgPSBwYXlsb2FkLnNvcnRpbmc/Lmxlbmd0aCA/IHBheWxvYWQuc29ydGluZyA6IHVuZGVmaW5lZDtcblxuICAgICAgY29uc3QgcHJlZmVyZW5jZXMgPSBzb3J0aW5nID8geyAuLi5wcmVmcywgc29ydGluZyB9IDogcHJlZnM7XG5cbiAgICAgIGNvbnN0IG9uUHJvZ3Jlc3MgPSAoY29tcGxldGVkOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+IHtcbiAgICAgICAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICAgIHR5cGU6IFwiZ3JvdXBpbmdQcm9ncmVzc1wiLFxuICAgICAgICAgICAgICBwYXlsb2FkOiB7IGNvbXBsZXRlZCwgdG90YWwgfVxuICAgICAgICAgIH0pLmNhdGNoKCgpID0+IHt9KTtcbiAgICAgIH07XG5cbiAgICAgIC8vIFVzZSBjYWxjdWxhdGVUYWJHcm91cHMgdG8gZGV0ZXJtaW5lIHRoZSB0YXJnZXQgZ3JvdXBpbmdcbiAgICAgIGNvbnN0IGdyb3VwcyA9IGF3YWl0IGNhbGN1bGF0ZVRhYkdyb3VwcyhwcmVmZXJlbmNlcywgc2VsZWN0aW9uLCBvblByb2dyZXNzKTtcbiAgICAgIGF3YWl0IGFwcGx5VGFiR3JvdXBzKGdyb3Vwcyk7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSwgZGF0YTogeyBncm91cHMgfSBhcyBURGF0YSB9O1xuICAgIH1cbiAgICBjYXNlIFwiYXBwbHlTb3J0aW5nXCI6IHtcbiAgICAgIGxvZ0luZm8oXCJBcHBseWluZyBzb3J0aW5nIGZyb20gbWVzc2FnZVwiKTtcbiAgICAgIGF3YWl0IHB1c2hVbmRvU3RhdGUoKTtcbiAgICAgIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuICAgICAgY29uc3QgcGF5bG9hZCA9IChtZXNzYWdlLnBheWxvYWQgYXMgQXBwbHlHcm91cGluZ1BheWxvYWQgfCB1bmRlZmluZWQpID8/IHt9O1xuICAgICAgY29uc3Qgc2VsZWN0aW9uID0gcGF5bG9hZC5zZWxlY3Rpb24gPz8ge307XG4gICAgICBjb25zdCBzb3J0aW5nID0gcGF5bG9hZC5zb3J0aW5nPy5sZW5ndGggPyBwYXlsb2FkLnNvcnRpbmcgOiB1bmRlZmluZWQ7XG4gICAgICBjb25zdCBwcmVmZXJlbmNlcyA9IHNvcnRpbmcgPyB7IC4uLnByZWZzLCBzb3J0aW5nIH0gOiBwcmVmcztcblxuICAgICAgY29uc3Qgb25Qcm9ncmVzcyA9IChjb21wbGV0ZWQ6IG51bWJlciwgdG90YWw6IG51bWJlcikgPT4ge1xuICAgICAgICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgICAgdHlwZTogXCJncm91cGluZ1Byb2dyZXNzXCIsXG4gICAgICAgICAgICAgIHBheWxvYWQ6IHsgY29tcGxldGVkLCB0b3RhbCB9XG4gICAgICAgICAgfSkuY2F0Y2goKCkgPT4ge30pO1xuICAgICAgfTtcblxuICAgICAgYXdhaXQgYXBwbHlUYWJTb3J0aW5nKHByZWZlcmVuY2VzLCBzZWxlY3Rpb24sIG9uUHJvZ3Jlc3MpO1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICB9XG4gICAgY2FzZSBcIm1lcmdlU2VsZWN0aW9uXCI6IHtcbiAgICAgIGxvZ0luZm8oXCJNZXJnaW5nIHNlbGVjdGlvbiBmcm9tIG1lc3NhZ2VcIik7XG4gICAgICBhd2FpdCBwdXNoVW5kb1N0YXRlKCk7XG4gICAgICBjb25zdCBwYXlsb2FkID0gbWVzc2FnZS5wYXlsb2FkIGFzIHsgdGFiSWRzOiBudW1iZXJbXSB9O1xuICAgICAgaWYgKHBheWxvYWQ/LnRhYklkcz8ubGVuZ3RoKSB7XG4gICAgICAgIGF3YWl0IG1lcmdlVGFicyhwYXlsb2FkLnRhYklkcyk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICB9XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIk5vIHRhYnMgc2VsZWN0ZWRcIiB9O1xuICAgIH1cbiAgICBjYXNlIFwic3BsaXRTZWxlY3Rpb25cIjoge1xuICAgICAgbG9nSW5mbyhcIlNwbGl0dGluZyBzZWxlY3Rpb24gZnJvbSBtZXNzYWdlXCIpO1xuICAgICAgYXdhaXQgcHVzaFVuZG9TdGF0ZSgpO1xuICAgICAgY29uc3QgcGF5bG9hZCA9IG1lc3NhZ2UucGF5bG9hZCBhcyB7IHRhYklkczogbnVtYmVyW10gfTtcbiAgICAgIGlmIChwYXlsb2FkPy50YWJJZHM/Lmxlbmd0aCkge1xuICAgICAgICBhd2FpdCBzcGxpdFRhYnMocGF5bG9hZC50YWJJZHMpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJObyB0YWJzIHNlbGVjdGVkXCIgfTtcbiAgICB9XG4gICAgY2FzZSBcInVuZG9cIjoge1xuICAgICAgbG9nSW5mbyhcIlVuZG9pbmcgbGFzdCBhY3Rpb25cIik7XG4gICAgICBhd2FpdCB1bmRvKCk7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgIH1cbiAgICBjYXNlIFwic2F2ZVN0YXRlXCI6IHtcbiAgICAgIGNvbnN0IG5hbWUgPSAobWVzc2FnZS5wYXlsb2FkIGFzIGFueSk/Lm5hbWU7XG4gICAgICBpZiAodHlwZW9mIG5hbWUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgbG9nSW5mbyhcIlNhdmluZyBzdGF0ZSBmcm9tIG1lc3NhZ2VcIiwgeyBuYW1lIH0pO1xuICAgICAgICBhd2FpdCBzYXZlU3RhdGUobmFtZSk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICB9XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgbmFtZVwiIH07XG4gICAgfVxuICAgIGNhc2UgXCJnZXRTYXZlZFN0YXRlc1wiOiB7XG4gICAgICBjb25zdCBzdGF0ZXMgPSBhd2FpdCBnZXRTYXZlZFN0YXRlcygpO1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGRhdGE6IHN0YXRlcyBhcyBURGF0YSB9O1xuICAgIH1cbiAgICBjYXNlIFwicmVzdG9yZVN0YXRlXCI6IHtcbiAgICAgIGNvbnN0IHN0YXRlID0gKG1lc3NhZ2UucGF5bG9hZCBhcyBhbnkpPy5zdGF0ZTtcbiAgICAgIGlmIChzdGF0ZSkge1xuICAgICAgICBsb2dJbmZvKFwiUmVzdG9yaW5nIHN0YXRlIGZyb20gbWVzc2FnZVwiLCB7IG5hbWU6IHN0YXRlLm5hbWUgfSk7XG4gICAgICAgIGF3YWl0IHJlc3RvcmVTdGF0ZShzdGF0ZSk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICB9XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgc3RhdGVcIiB9O1xuICAgIH1cbiAgICBjYXNlIFwiZGVsZXRlU2F2ZWRTdGF0ZVwiOiB7XG4gICAgICBjb25zdCBuYW1lID0gKG1lc3NhZ2UucGF5bG9hZCBhcyBhbnkpPy5uYW1lO1xuICAgICAgaWYgKHR5cGVvZiBuYW1lID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIGxvZ0luZm8oXCJEZWxldGluZyBzYXZlZCBzdGF0ZSBmcm9tIG1lc3NhZ2VcIiwgeyBuYW1lIH0pO1xuICAgICAgICBhd2FpdCBkZWxldGVTYXZlZFN0YXRlKG5hbWUpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIG5hbWVcIiB9O1xuICAgIH1cbiAgICBjYXNlIFwibG9hZFByZWZlcmVuY2VzXCI6IHtcbiAgICAgIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGRhdGE6IHByZWZzIGFzIFREYXRhIH07XG4gICAgfVxuICAgIGNhc2UgXCJzYXZlUHJlZmVyZW5jZXNcIjoge1xuICAgICAgbG9nSW5mbyhcIlNhdmluZyBwcmVmZXJlbmNlcyBmcm9tIG1lc3NhZ2VcIik7XG4gICAgICBjb25zdCBwcmVmcyA9IGF3YWl0IHNhdmVQcmVmZXJlbmNlcyhtZXNzYWdlLnBheWxvYWQgYXMgYW55KTtcbiAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMocHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXSk7XG4gICAgICBzZXRMb2dnZXJQcmVmZXJlbmNlcyhwcmVmcyk7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSwgZGF0YTogcHJlZnMgYXMgVERhdGEgfTtcbiAgICB9XG4gICAgY2FzZSBcImdldExvZ3NcIjoge1xuICAgICAgICBhd2FpdCBsb2dnZXJSZWFkeTtcbiAgICAgICAgY29uc3QgbG9ncyA9IGdldExvZ3MoKTtcbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGRhdGE6IGxvZ3MgYXMgVERhdGEgfTtcbiAgICB9XG4gICAgY2FzZSBcImNsZWFyTG9nc1wiOiB7XG4gICAgICAgIGNsZWFyTG9ncygpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgIH1cbiAgICBjYXNlIFwibG9nRW50cnlcIjoge1xuICAgICAgICBjb25zdCBlbnRyeSA9IG1lc3NhZ2UucGF5bG9hZCBhcyBhbnk7XG4gICAgICAgIGlmIChlbnRyeSAmJiBlbnRyeS5sZXZlbCAmJiBlbnRyeS5tZXNzYWdlKSB7XG4gICAgICAgICAgICBhZGRMb2dFbnRyeShlbnRyeSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICB9XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiVW5rbm93biBtZXNzYWdlXCIgfTtcbiAgfVxufTtcblxuY2hyb21lLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKFxuICAoXG4gICAgbWVzc2FnZTogUnVudGltZU1lc3NhZ2UsXG4gICAgc2VuZGVyOiBjaHJvbWUucnVudGltZS5NZXNzYWdlU2VuZGVyLFxuICAgIHNlbmRSZXNwb25zZTogKHJlc3BvbnNlOiBSdW50aW1lUmVzcG9uc2UpID0+IHZvaWRcbiAgKSA9PiB7XG4gICAgaGFuZGxlTWVzc2FnZShtZXNzYWdlLCBzZW5kZXIpXG4gICAgLnRoZW4oKHJlc3BvbnNlKSA9PiBzZW5kUmVzcG9uc2UocmVzcG9uc2UpKVxuICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiBmYWxzZSwgZXJyb3I6IFN0cmluZyhlcnJvcikgfSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbik7XG5cbmNocm9tZS50YWJHcm91cHMub25SZW1vdmVkLmFkZExpc3RlbmVyKGFzeW5jIChncm91cCkgPT4ge1xuICBsb2dJbmZvKFwiVGFiIGdyb3VwIHJlbW92ZWRcIiwgeyBncm91cCB9KTtcbn0pO1xuXG5sZXQgYXV0b1J1blRpbWVvdXQ6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgbnVsbCA9IG51bGw7XG5jb25zdCBkaXJ0eVRhYklkcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xubGV0IHRhYlByb2Nlc3NpbmdUaW1lb3V0OiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsO1xuXG5jb25zdCB0cmlnZ2VyQXV0b1J1biA9ICh0YWJJZD86IG51bWJlcikgPT4ge1xuICAvLyAxLiBTY2hlZHVsZSBmYXN0LCB0YXJnZXRlZCB1cGRhdGUgZm9yIHNwZWNpZmljIHRhYnNcbiAgaWYgKHRhYklkICE9PSB1bmRlZmluZWQpIHtcbiAgICBkaXJ0eVRhYklkcy5hZGQodGFiSWQpO1xuICAgIGlmICh0YWJQcm9jZXNzaW5nVGltZW91dCkgY2xlYXJUaW1lb3V0KHRhYlByb2Nlc3NpbmdUaW1lb3V0KTtcblxuICAgIHRhYlByb2Nlc3NpbmdUaW1lb3V0ID0gc2V0VGltZW91dChhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBpZHMgPSBBcnJheS5mcm9tKGRpcnR5VGFiSWRzKTtcbiAgICAgIGRpcnR5VGFiSWRzLmNsZWFyKCk7XG4gICAgICBpZiAoaWRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBwcmVmcyA9IGF3YWl0IGxvYWRQcmVmZXJlbmNlcygpO1xuICAgICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuXG4gICAgICAgIGNvbnN0IGF1dG9SdW5TdHJhdHMgPSBwcmVmcy5jdXN0b21TdHJhdGVnaWVzPy5maWx0ZXIocyA9PiBzLmF1dG9SdW4pO1xuICAgICAgICBpZiAoYXV0b1J1blN0cmF0cyAmJiBhdXRvUnVuU3RyYXRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBjb25zdCBzdHJhdGVneUlkcyA9IGF1dG9SdW5TdHJhdHMubWFwKHMgPT4gcy5pZCk7XG4gICAgICAgICAgLy8gT25seSBwcm9jZXNzIHRoZSBkaXJ0eSB0YWJzIGZvciBxdWljayBncm91cGluZ1xuICAgICAgICAgIGNvbnN0IGdyb3VwcyA9IGF3YWl0IGNhbGN1bGF0ZVRhYkdyb3Vwcyh7IC4uLnByZWZzLCBzb3J0aW5nOiBzdHJhdGVneUlkcyB9LCB7IHRhYklkczogaWRzIH0pO1xuICAgICAgICAgIGF3YWl0IGFwcGx5VGFiR3JvdXBzKGdyb3Vwcyk7XG4gICAgICAgICAgbG9nSW5mbyhcIkF1dG8tcnVuIHRhcmdldGVkXCIsIHsgdGFiczogaWRzLCBzdHJhdGVnaWVzOiBzdHJhdGVneUlkcyB9KTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiQXV0by1ydW4gdGFyZ2V0ZWQgZmFpbGVkXCIsIGUpO1xuICAgICAgfVxuICAgIH0sIDIwMCk7IC8vIEZhc3QgZGVib3VuY2UgZm9yIHJlc3BvbnNpdmVuZXNzXG4gIH1cblxuICAvLyAyLiBTY2hlZHVsZSBnbG9iYWwgdXBkYXRlIChzbG93ZXIgZGVib3VuY2UpIHRvIGVuc3VyZSBjb25zaXN0ZW5jeSBhbmQgc29ydGluZ1xuICBpZiAoYXV0b1J1blRpbWVvdXQpIGNsZWFyVGltZW91dChhdXRvUnVuVGltZW91dCk7XG4gIGF1dG9SdW5UaW1lb3V0ID0gc2V0VGltZW91dChhc3luYyAoKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuXG4gICAgICBjb25zdCBhdXRvUnVuU3RyYXRzID0gcHJlZnMuY3VzdG9tU3RyYXRlZ2llcz8uZmlsdGVyKHMgPT4gcy5hdXRvUnVuKTtcbiAgICAgIGlmIChhdXRvUnVuU3RyYXRzICYmIGF1dG9SdW5TdHJhdHMubGVuZ3RoID4gMCkge1xuICAgICAgICBsb2dJbmZvKFwiQXV0by1ydW5uaW5nIHN0cmF0ZWdpZXMgKGdsb2JhbClcIiwge1xuICAgICAgICAgIHN0cmF0ZWdpZXM6IGF1dG9SdW5TdHJhdHMubWFwKHMgPT4gcy5pZCksXG4gICAgICAgICAgY291bnQ6IGF1dG9SdW5TdHJhdHMubGVuZ3RoXG4gICAgICAgIH0pO1xuICAgICAgICBjb25zdCBpZHMgPSBhdXRvUnVuU3RyYXRzLm1hcChzID0+IHMuaWQpO1xuXG4gICAgICAgIC8vIFdlIGFwcGx5IGdyb3VwaW5nIHVzaW5nIHRoZXNlIHN0cmF0ZWdpZXNcbiAgICAgICAgY29uc3QgZ3JvdXBzID0gYXdhaXQgY2FsY3VsYXRlVGFiR3JvdXBzKHsgLi4ucHJlZnMsIHNvcnRpbmc6IGlkcyB9KTtcbiAgICAgICAgYXdhaXQgYXBwbHlUYWJHcm91cHMoZ3JvdXBzKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiQXV0by1ydW4gZmFpbGVkXCIsIGUpO1xuICAgIH1cbiAgfSwgMTAwMCk7XG59O1xuXG5jaHJvbWUudGFicy5vbkNyZWF0ZWQuYWRkTGlzdGVuZXIoKHRhYikgPT4ge1xuICBpZiAodGFiLmlkKSB0cmlnZ2VyQXV0b1J1bih0YWIuaWQpO1xuICBlbHNlIHRyaWdnZXJBdXRvUnVuKCk7XG59KTtcbmNocm9tZS50YWJzLm9uVXBkYXRlZC5hZGRMaXN0ZW5lcigodGFiSWQsIGNoYW5nZUluZm8pID0+IHtcbiAgaWYgKGNoYW5nZUluZm8udXJsIHx8IGNoYW5nZUluZm8uc3RhdHVzID09PSAnY29tcGxldGUnKSB7XG4gICAgdHJpZ2dlckF1dG9SdW4odGFiSWQpO1xuICB9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBYU8sSUFBTSxhQUFtQztBQUFBLEVBQzVDLEVBQUUsSUFBSSxVQUFVLE9BQU8sVUFBVSxZQUFZLE1BQU0sV0FBVyxNQUFNLE1BQU0sQ0FBQyxTQUFTLE1BQU0sRUFBRTtBQUFBLEVBQzVGLEVBQUUsSUFBSSxlQUFlLE9BQU8sZUFBZSxZQUFZLE1BQU0sV0FBVyxNQUFNLE1BQU0sQ0FBQyxTQUFTLE1BQU0sRUFBRTtBQUFBLEVBQ3RHLEVBQUUsSUFBSSxTQUFTLE9BQU8sU0FBUyxZQUFZLE1BQU0sV0FBVyxNQUFNLE1BQU0sQ0FBQyxTQUFTLE1BQU0sRUFBRTtBQUFBLEVBQzFGLEVBQUUsSUFBSSxXQUFXLE9BQU8sV0FBVyxZQUFZLE1BQU0sV0FBVyxNQUFNLE1BQU0sQ0FBQyxTQUFTLE1BQU0sRUFBRTtBQUFBLEVBQzlGLEVBQUUsSUFBSSxXQUFXLE9BQU8sV0FBVyxZQUFZLE1BQU0sV0FBVyxNQUFNLE1BQU0sQ0FBQyxTQUFTLE1BQU0sRUFBRTtBQUFBLEVBQzlGLEVBQUUsSUFBSSxVQUFVLE9BQU8sVUFBVSxZQUFZLE1BQU0sV0FBVyxNQUFNLE1BQU0sQ0FBQyxTQUFTLE1BQU0sRUFBRTtBQUFBLEVBQzVGLEVBQUUsSUFBSSxXQUFXLE9BQU8sV0FBVyxZQUFZLE1BQU0sV0FBVyxNQUFNLE1BQU0sQ0FBQyxTQUFTLE1BQU0sRUFBRTtBQUFBLEVBQzlGLEVBQUUsSUFBSSxPQUFPLE9BQU8sT0FBTyxZQUFZLE1BQU0sV0FBVyxNQUFNLE1BQU0sQ0FBQyxTQUFTLE1BQU0sRUFBRTtBQUFBLEVBQ3RGLEVBQUUsSUFBSSxPQUFPLE9BQU8sT0FBTyxZQUFZLE1BQU0s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QUFNLGtCQUFrQixPQUFPLE9BQUssRUFBRSxPQUFPO0FBQ25FLFVBQUksaUJBQWlCLGNBQWMsU0FBUyxHQUFHO0FBQzdDLGdCQUFRLG9DQUFvQztBQUFBLFVBQzFDLFlBQVksY0FBYyxJQUFJLE9BQUssRUFBRSxFQUFFO0FBQUEsVUFDdkMsT0FBTyxjQUFjO0FBQUEsUUFDdkIsQ0FBQztBQUNELGNBQU0sTUFBTSxjQUFjLElBQUksT0FBSyxFQUFFLEVBQUU7QUFHdkMsY0FBTSxTQUFTLE1BQU0sbUJBQW1CLEVBQUUsR0FBRyxPQUFPLFNBQVMsSUFBSSxDQUFDO0FBQ2xFLGNBQU0sZUFBZSxNQUFNO0FBQUEsTUFDN0I7QUFBQSxJQUNGLFNBQVMsR0FBRztBQUNWLGNBQVEsTUFBTSxtQkFBbUIsQ0FBQztBQUFBLElBQ3BDO0FBQUEsRUFDRixHQUFHLEdBQUk7QUFDVDtBQUVBLE9BQU8sS0FBSyxVQUFVLFlBQVksQ0FBQyxRQUFRO0FBQ3pDLE1BQUksSUFBSSxHQUFJLGdCQUFlLElBQUksRUFBRTtBQUFBLE1BQzVCLGdCQUFlO0FBQ3RCLENBQUM7QUFDRCxPQUFPLEtBQUssVUFBVSxZQUFZLENBQUMsT0FBTyxlQUFlO0FBQ3ZELE1BQUksV0FBVyxPQUFPLFdBQVcsV0FBVyxZQUFZO0FBQ3RELG1CQUFlLEtBQUs7QUFBQSxFQUN0QjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbImN1c3RvbVN0cmF0ZWdpZXMiLCAicGFydHMiLCAiZ3JvdXBUYWJzIiwgInRhYnMiLCAibGlzdCIsICJsb2dzIl0KfQo=
