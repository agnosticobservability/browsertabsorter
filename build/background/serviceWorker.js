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

// src/background/extraction/generaRegistry.json
var generaRegistry_default = {
  AI: [
    "anthropic.com",
    "bard.google.com",
    "chatgpt.com",
    "claude.ai",
    "gemini.google.com",
    "huggingface.co",
    "midjourney.com",
    "openai.com",
    "perplexity.ai",
    "poe.com"
  ],
  Communication: [
    "discord.com",
    "mail.google.com",
    "messenger.com",
    "outlook.live.com",
    "skype.com",
    "slack.com",
    "teams.microsoft.com",
    "telegram.org",
    "whatsapp.com",
    "zoom.us"
  ],
  Design: [
    "adobe.com",
    "behance.net",
    "canva.com",
    "dribbble.com",
    "figma.com",
    "pexels.com",
    "pixabay.com",
    "shutterstock.com",
    "unsplash.com"
  ],
  Development: [
    "atlassian.net",
    "aws.amazon.com",
    "azure.microsoft.com",
    "bitbucket.org",
    "cloud.google.com",
    "console.aws.amazon.com",
    "dev.to",
    "developer.mozilla.org",
    "docker.com",
    "geeksforgeeks.org",
    "github.com",
    "gitlab.com",
    "hashnode.com",
    "heroku.com",
    "jira.com",
    "kubernetes.io",
    "medium.com",
    "netlify.com",
    "npmjs.com",
    "portal.azure.com",
    "pypi.org",
    "stackoverflow.com",
    "vercel.com",
    "w3schools.com"
  ],
  Education: [
    "academia.edu",
    "blackboard.com",
    "canvas.instructure.com",
    "coursera.org",
    "duolingo.com",
    "edx.org",
    "harvard.edu",
    "khanacademy.org",
    "mit.edu",
    "quizlet.com",
    "researchgate.net",
    "stanford.edu",
    "udemy.com",
    "wikipedia.org"
  ],
  Finance: [
    "americanexpress.com",
    "bankofamerica.com",
    "binance.com",
    "chase.com",
    "coinbase.com",
    "fidelity.com",
    "kraken.com",
    "mint.intuit.com",
    "paypal.com",
    "robinhood.com",
    "schwab.com",
    "stripe.com",
    "vanguard.com",
    "wellsfargo.com"
  ],
  Gaming: [
    "epicgames.com",
    "gamespot.com",
    "ign.com",
    "kotaku.com",
    "nintendo.com",
    "playstation.com",
    "polygon.com",
    "roblox.com",
    "steampowered.com",
    "xbox.com"
  ],
  Music: [
    "audible.com",
    "bandcamp.com",
    "music.apple.com",
    "pandora.com",
    "soundcloud.com",
    "spotify.com",
    "tidal.com"
  ],
  News: [
    "abcnews.go.com",
    "bbc.com",
    "bloomberg.com",
    "cnbc.com",
    "cnn.com",
    "forbes.com",
    "foxnews.com",
    "huffpost.com",
    "nbcnews.com",
    "news.google.com",
    "nytimes.com",
    "reuters.com",
    "theguardian.com",
    "usatoday.com",
    "washingtonpost.com",
    "wsj.com"
  ],
  Productivity: [
    "airtable.com",
    "asana.com",
    "clickup.com",
    "docs.google.com",
    "drive.google.com",
    "dropbox.com",
    "evernote.com",
    "linear.app",
    "lucidchart.com",
    "miro.com",
    "monday.com",
    "notion.so",
    "sheets.google.com",
    "slides.google.com",
    "trello.com"
  ],
  Search: [
    "baidu.com",
    "bing.com",
    "duckduckgo.com",
    "ecosia.org",
    "google.com",
    "kagi.com",
    "yahoo.com",
    "yandex.com"
  ],
  Shopping: [
    "aliexpress.com",
    "amazon.com",
    "bestbuy.com",
    "costco.com",
    "ebay.com",
    "etsy.com",
    "shein.com",
    "shopify.com",
    "target.com",
    "temu.com",
    "walmart.com",
    "wayfair.com"
  ],
  Social: [
    "bluesky.app",
    "facebook.com",
    "instagram.com",
    "linkedin.com",
    "mastodon.social",
    "pinterest.com",
    "reddit.com",
    "snapchat.com",
    "threads.net",
    "tiktok.com",
    "tumblr.com",
    "twitter.com",
    "x.com"
  ],
  Video: [
    "dailymotion.com",
    "disneyplus.com",
    "hbomax.com",
    "hulu.com",
    "max.com",
    "netflix.com",
    "peacocktv.com",
    "primevideo.com",
    "twitch.tv",
    "vimeo.com",
    "youtu.be",
    "youtube.com"
  ]
};

// src/background/extraction/generaRegistry.ts
var registry = {};
for (const [category, domains] of Object.entries(generaRegistry_default)) {
  for (const domain of domains) {
    registry[domain] = category;
  }
}
var GENERA_REGISTRY = registry;
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

// src/background/extraction/index.ts
var activeFetches = 0;
var MAX_CONCURRENT_FETCHES = 5;
var FETCH_QUEUE = [];
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
var enqueueFetch = async (fn) => {
  if (activeFetches >= MAX_CONCURRENT_FETCHES) {
    await new Promise((resolve) => FETCH_QUEUE.push(resolve));
  }
  activeFetches++;
  try {
    return await fn();
  } finally {
    activeFetches--;
    if (FETCH_QUEUE.length > 0) {
      const next = FETCH_QUEUE.shift();
      if (next) next();
    }
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
        await enqueueFetch(async () => {
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
    logDebug(`Extraction failed for tab ${tab.id}`, { error: String(e) });
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
  const url = tab.url.toLowerCase();
  let context = "Uncategorized";
  if (url.includes("github") || url.includes("stackoverflow") || url.includes("localhost") || url.includes("jira") || url.includes("gitlab")) context = "Development";
  else if (url.includes("google") && (url.includes("docs") || url.includes("sheets") || url.includes("slides"))) context = "Work";
  else if (url.includes("linkedin") || url.includes("slack") || url.includes("zoom") || url.includes("teams")) context = "Work";
  else if (url.includes("netflix") || url.includes("spotify") || url.includes("hulu") || url.includes("disney") || url.includes("youtube")) context = "Entertainment";
  else if (url.includes("twitter") || url.includes("facebook") || url.includes("instagram") || url.includes("reddit") || url.includes("tiktok") || url.includes("pinterest")) context = "Social";
  else if (url.includes("amazon") || url.includes("ebay") || url.includes("walmart") || url.includes("target") || url.includes("shopify")) context = "Shopping";
  else if (url.includes("cnn") || url.includes("bbc") || url.includes("nytimes") || url.includes("washingtonpost") || url.includes("foxnews")) context = "News";
  else if (url.includes("coursera") || url.includes("udemy") || url.includes("edx") || url.includes("khanacademy") || url.includes("canvas")) context = "Education";
  else if (url.includes("expedia") || url.includes("booking") || url.includes("airbnb") || url.includes("tripadvisor") || url.includes("kayak")) context = "Travel";
  else if (url.includes("webmd") || url.includes("mayoclinic") || url.includes("nih.gov") || url.includes("health")) context = "Health";
  else if (url.includes("espn") || url.includes("nba") || url.includes("nfl") || url.includes("mlb") || url.includes("fifa")) context = "Sports";
  else if (url.includes("techcrunch") || url.includes("wired") || url.includes("theverge") || url.includes("arstechnica")) context = "Technology";
  else if (url.includes("science") || url.includes("nature.com") || url.includes("nasa.gov")) context = "Science";
  else if (url.includes("twitch") || url.includes("steam") || url.includes("roblox") || url.includes("ign") || url.includes("gamespot")) context = "Gaming";
  else if (url.includes("soundcloud") || url.includes("bandcamp") || url.includes("last.fm")) context = "Music";
  else if (url.includes("deviantart") || url.includes("behance") || url.includes("dribbble") || url.includes("artstation")) context = "Art";
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
    for (let j = 0; j < tabsToMove.length; j++) {
      const { tabId, stored } = tabsToMove[j];
      try {
        await chrome.tabs.move(tabId, { windowId: targetWindowId, index: j });
        if (stored.pinned) {
          await chrome.tabs.update(tabId, { pinned: true });
        } else {
          const current = await chrome.tabs.get(tabId);
          if (current.pinned) await chrome.tabs.update(tabId, { pinned: false });
        }
      } catch (e) {
        logError("Failed to move tab", { tabId, error: e });
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3NoYXJlZC9zdHJhdGVneVJlZ2lzdHJ5LnRzIiwgIi4uLy4uL3NyYy9zaGFyZWQvbG9nZ2VyLnRzIiwgIi4uLy4uL3NyYy9zaGFyZWQvdXRpbHMudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZ3JvdXBpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3NvcnRpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL2V4dHJhY3Rpb24vbG9naWMudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZXh0cmFjdGlvbi9nZW5lcmFSZWdpc3RyeS5qc29uIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL2V4dHJhY3Rpb24vZ2VuZXJhUmVnaXN0cnkudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvc3RvcmFnZS50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9wcmVmZXJlbmNlcy50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9leHRyYWN0aW9uL2luZGV4LnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL2NvbnRleHRBbmFseXNpcy50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC90YWJNYW5hZ2VyLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3N0YXRlTWFuYWdlci50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9zZXJ2aWNlV29ya2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyBDdXN0b21TdHJhdGVneSwgU29ydGluZ1N0cmF0ZWd5IH0gZnJvbSBcIi4vdHlwZXMuanNcIjtcblxuZXhwb3J0IGludGVyZmFjZSBTdHJhdGVneURlZmluaXRpb24ge1xuICAgIGlkOiBTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmc7XG4gICAgbGFiZWw6IHN0cmluZztcbiAgICBpc0dyb3VwaW5nOiBib29sZWFuO1xuICAgIGlzU29ydGluZzogYm9vbGVhbjtcbiAgICB0YWdzPzogc3RyaW5nW107XG4gICAgYXV0b1J1bj86IGJvb2xlYW47XG4gICAgaXNDdXN0b20/OiBib29sZWFuO1xufVxuXG4vLyBSZXN0b3JlZCBzdHJhdGVnaWVzIG1hdGNoaW5nIGJhY2tncm91bmQgY2FwYWJpbGl0aWVzLlxuZXhwb3J0IGNvbnN0IFNUUkFURUdJRVM6IFN0cmF0ZWd5RGVmaW5pdGlvbltdID0gW1xuICAgIHsgaWQ6IFwiZG9tYWluXCIsIGxhYmVsOiBcIkRvbWFpblwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwiZG9tYWluX2Z1bGxcIiwgbGFiZWw6IFwiRnVsbCBEb21haW5cIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInRvcGljXCIsIGxhYmVsOiBcIlRvcGljXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJjb250ZXh0XCIsIGxhYmVsOiBcIkNvbnRleHRcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImxpbmVhZ2VcIiwgbGFiZWw6IFwiTGluZWFnZVwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwicGlubmVkXCIsIGxhYmVsOiBcIlBpbm5lZFwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwicmVjZW5jeVwiLCBsYWJlbDogXCJSZWNlbmN5XCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJhZ2VcIiwgbGFiZWw6IFwiQWdlXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJ1cmxcIiwgbGFiZWw6IFwiVVJMXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJuZXN0aW5nXCIsIGxhYmVsOiBcIk5lc3RpbmdcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInRpdGxlXCIsIGxhYmVsOiBcIlRpdGxlXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG5dO1xuXG5leHBvcnQgY29uc3QgZ2V0U3RyYXRlZ2llcyA9IChjdXN0b21TdHJhdGVnaWVzPzogQ3VzdG9tU3RyYXRlZ3lbXSk6IFN0cmF0ZWd5RGVmaW5pdGlvbltdID0+IHtcbiAgICBpZiAoIWN1c3RvbVN0cmF0ZWdpZXMgfHwgY3VzdG9tU3RyYXRlZ2llcy5sZW5ndGggPT09IDApIHJldHVybiBTVFJBVEVHSUVTO1xuXG4gICAgLy8gQ3VzdG9tIHN0cmF0ZWdpZXMgY2FuIG92ZXJyaWRlIGJ1aWx0LWlucyBpZiBJRHMgbWF0Y2gsIG9yIGFkZCBuZXcgb25lcy5cbiAgICBjb25zdCBjb21iaW5lZCA9IFsuLi5TVFJBVEVHSUVTXTtcblxuICAgIGN1c3RvbVN0cmF0ZWdpZXMuZm9yRWFjaChjdXN0b20gPT4ge1xuICAgICAgICBjb25zdCBleGlzdGluZ0luZGV4ID0gY29tYmluZWQuZmluZEluZGV4KHMgPT4gcy5pZCA9PT0gY3VzdG9tLmlkKTtcblxuICAgICAgICAvLyBEZXRlcm1pbmUgY2FwYWJpbGl0aWVzIGJhc2VkIG9uIHJ1bGVzIHByZXNlbmNlXG4gICAgICAgIGNvbnN0IGhhc0dyb3VwaW5nID0gKGN1c3RvbS5ncm91cGluZ1J1bGVzICYmIGN1c3RvbS5ncm91cGluZ1J1bGVzLmxlbmd0aCA+IDApIHx8IChjdXN0b20ucnVsZXMgJiYgY3VzdG9tLnJ1bGVzLmxlbmd0aCA+IDApIHx8IGZhbHNlO1xuICAgICAgICBjb25zdCBoYXNTb3J0aW5nID0gKGN1c3RvbS5zb3J0aW5nUnVsZXMgJiYgY3VzdG9tLnNvcnRpbmdSdWxlcy5sZW5ndGggPiAwKSB8fCAoY3VzdG9tLnJ1bGVzICYmIGN1c3RvbS5ydWxlcy5sZW5ndGggPiAwKSB8fCBmYWxzZTtcblxuICAgICAgICBjb25zdCB0YWdzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBpZiAoaGFzR3JvdXBpbmcpIHRhZ3MucHVzaChcImdyb3VwXCIpO1xuICAgICAgICBpZiAoaGFzU29ydGluZykgdGFncy5wdXNoKFwic29ydFwiKTtcblxuICAgICAgICBjb25zdCBkZWZpbml0aW9uOiBTdHJhdGVneURlZmluaXRpb24gPSB7XG4gICAgICAgICAgICBpZDogY3VzdG9tLmlkLFxuICAgICAgICAgICAgbGFiZWw6IGN1c3RvbS5sYWJlbCxcbiAgICAgICAgICAgIGlzR3JvdXBpbmc6IGhhc0dyb3VwaW5nLFxuICAgICAgICAgICAgaXNTb3J0aW5nOiBoYXNTb3J0aW5nLFxuICAgICAgICAgICAgdGFnczogdGFncyxcbiAgICAgICAgICAgIGF1dG9SdW46IGN1c3RvbS5hdXRvUnVuLFxuICAgICAgICAgICAgaXNDdXN0b206IHRydWVcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAoZXhpc3RpbmdJbmRleCAhPT0gLTEpIHtcbiAgICAgICAgICAgIGNvbWJpbmVkW2V4aXN0aW5nSW5kZXhdID0gZGVmaW5pdGlvbjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbWJpbmVkLnB1c2goZGVmaW5pdGlvbik7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBjb21iaW5lZDtcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRTdHJhdGVneSA9IChpZDogU29ydGluZ1N0cmF0ZWd5IHwgc3RyaW5nKTogU3RyYXRlZ3lEZWZpbml0aW9uIHwgdW5kZWZpbmVkID0+IFNUUkFURUdJRVMuZmluZChzID0+IHMuaWQgPT09IGlkKTtcbiIsICJpbXBvcnQgeyBMb2dFbnRyeSwgTG9nTGV2ZWwsIFByZWZlcmVuY2VzIH0gZnJvbSBcIi4vdHlwZXMuanNcIjtcblxuY29uc3QgUFJFRklYID0gXCJbVGFiU29ydGVyXVwiO1xuXG5jb25zdCBMRVZFTF9QUklPUklUWTogUmVjb3JkPExvZ0xldmVsLCBudW1iZXI+ID0ge1xuICBkZWJ1ZzogMCxcbiAgaW5mbzogMSxcbiAgd2FybjogMixcbiAgZXJyb3I6IDMsXG4gIGNyaXRpY2FsOiA0XG59O1xuXG5sZXQgY3VycmVudExldmVsOiBMb2dMZXZlbCA9IFwiaW5mb1wiO1xubGV0IGxvZ3M6IExvZ0VudHJ5W10gPSBbXTtcbmNvbnN0IE1BWF9MT0dTID0gMTAwMDtcbmNvbnN0IFNUT1JBR0VfS0VZID0gXCJzZXNzaW9uTG9nc1wiO1xuXG4vLyBTYWZlIGNvbnRleHQgY2hlY2tcbmNvbnN0IGlzU2VydmljZVdvcmtlciA9IHR5cGVvZiBzZWxmICE9PSAndW5kZWZpbmVkJyAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZW9mIChzZWxmIGFzIGFueSkuU2VydmljZVdvcmtlckdsb2JhbFNjb3BlICE9PSAndW5kZWZpbmVkJyAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZiBpbnN0YW5jZW9mIChzZWxmIGFzIGFueSkuU2VydmljZVdvcmtlckdsb2JhbFNjb3BlO1xubGV0IGlzU2F2aW5nID0gZmFsc2U7XG5sZXQgcGVuZGluZ1NhdmUgPSBmYWxzZTtcbmxldCBzYXZlVGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgbnVsbCA9IG51bGw7XG5cbmNvbnN0IGRvU2F2ZSA9ICgpID0+IHtcbiAgICBpZiAoIWlzU2VydmljZVdvcmtlciB8fCAhY2hyb21lPy5zdG9yYWdlPy5zZXNzaW9uIHx8IGlzU2F2aW5nKSB7XG4gICAgICAgIHBlbmRpbmdTYXZlID0gdHJ1ZTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlzU2F2aW5nID0gdHJ1ZTtcbiAgICBwZW5kaW5nU2F2ZSA9IGZhbHNlO1xuXG4gICAgY2hyb21lLnN0b3JhZ2Uuc2Vzc2lvbi5zZXQoeyBbU1RPUkFHRV9LRVldOiBsb2dzIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICBpc1NhdmluZyA9IGZhbHNlO1xuICAgICAgICBpZiAocGVuZGluZ1NhdmUpIHtcbiAgICAgICAgICAgIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG4gICAgICAgIH1cbiAgICB9KS5jYXRjaChlcnIgPT4ge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIHNhdmUgbG9nc1wiLCBlcnIpO1xuICAgICAgICBpc1NhdmluZyA9IGZhbHNlO1xuICAgIH0pO1xufTtcblxuY29uc3Qgc2F2ZUxvZ3NUb1N0b3JhZ2UgPSAoKSA9PiB7XG4gICAgaWYgKHNhdmVUaW1lcikgY2xlYXJUaW1lb3V0KHNhdmVUaW1lcik7XG4gICAgc2F2ZVRpbWVyID0gc2V0VGltZW91dChkb1NhdmUsIDEwMDApO1xufTtcblxubGV0IHJlc29sdmVMb2dnZXJSZWFkeTogKCkgPT4gdm9pZDtcbmV4cG9ydCBjb25zdCBsb2dnZXJSZWFkeSA9IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuICAgIHJlc29sdmVMb2dnZXJSZWFkeSA9IHJlc29sdmU7XG59KTtcblxuZXhwb3J0IGNvbnN0IGluaXRMb2dnZXIgPSBhc3luYyAoKSA9PiB7XG4gICAgaWYgKGlzU2VydmljZVdvcmtlciAmJiBjaHJvbWU/LnN0b3JhZ2U/LnNlc3Npb24pIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNocm9tZS5zdG9yYWdlLnNlc3Npb24uZ2V0KFNUT1JBR0VfS0VZKTtcbiAgICAgICAgICAgIGlmIChyZXN1bHRbU1RPUkFHRV9LRVldICYmIEFycmF5LmlzQXJyYXkocmVzdWx0W1NUT1JBR0VfS0VZXSkpIHtcbiAgICAgICAgICAgICAgICBsb2dzID0gcmVzdWx0W1NUT1JBR0VfS0VZXTtcbiAgICAgICAgICAgICAgICBpZiAobG9ncy5sZW5ndGggPiBNQVhfTE9HUykgbG9ncyA9IGxvZ3Muc2xpY2UoMCwgTUFYX0xPR1MpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIHJlc3RvcmUgbG9nc1wiLCBlKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAocmVzb2x2ZUxvZ2dlclJlYWR5KSByZXNvbHZlTG9nZ2VyUmVhZHkoKTtcbn07XG5cbmV4cG9ydCBjb25zdCBzZXRMb2dnZXJQcmVmZXJlbmNlcyA9IChwcmVmczogUHJlZmVyZW5jZXMpID0+IHtcbiAgaWYgKHByZWZzLmxvZ0xldmVsKSB7XG4gICAgY3VycmVudExldmVsID0gcHJlZnMubG9nTGV2ZWw7XG4gIH0gZWxzZSBpZiAocHJlZnMuZGVidWcpIHtcbiAgICBjdXJyZW50TGV2ZWwgPSBcImRlYnVnXCI7XG4gIH0gZWxzZSB7XG4gICAgY3VycmVudExldmVsID0gXCJpbmZvXCI7XG4gIH1cbn07XG5cbmNvbnN0IHNob3VsZExvZyA9IChsZXZlbDogTG9nTGV2ZWwpOiBib29sZWFuID0+IHtcbiAgcmV0dXJuIExFVkVMX1BSSU9SSVRZW2xldmVsXSA+PSBMRVZFTF9QUklPUklUWVtjdXJyZW50TGV2ZWxdO1xufTtcblxuY29uc3QgZm9ybWF0TWVzc2FnZSA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICByZXR1cm4gY29udGV4dCA/IGAke21lc3NhZ2V9IDo6ICR7SlNPTi5zdHJpbmdpZnkoY29udGV4dCl9YCA6IG1lc3NhZ2U7XG59O1xuXG5jb25zdCBhZGRMb2cgPSAobGV2ZWw6IExvZ0xldmVsLCBtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBpZiAoc2hvdWxkTG9nKGxldmVsKSkge1xuICAgICAgY29uc3QgZW50cnk6IExvZ0VudHJ5ID0ge1xuICAgICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcbiAgICAgICAgICBsZXZlbCxcbiAgICAgICAgICBtZXNzYWdlLFxuICAgICAgICAgIGNvbnRleHRcbiAgICAgIH07XG5cbiAgICAgIGlmIChpc1NlcnZpY2VXb3JrZXIpIHtcbiAgICAgICAgICBsb2dzLnVuc2hpZnQoZW50cnkpO1xuICAgICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSB7XG4gICAgICAgICAgICAgIGxvZ3MucG9wKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIEluIG90aGVyIGNvbnRleHRzLCBzZW5kIHRvIFNXXG4gICAgICAgICAgaWYgKGNocm9tZT8ucnVudGltZT8uc2VuZE1lc3NhZ2UpIHtcbiAgICAgICAgICAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdsb2dFbnRyeScsIHBheWxvYWQ6IGVudHJ5IH0pLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgLy8gSWdub3JlIGlmIG1lc3NhZ2UgZmFpbHMgKGUuZy4gY29udGV4dCBpbnZhbGlkYXRlZClcbiAgICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICB9XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBhZGRMb2dFbnRyeSA9IChlbnRyeTogTG9nRW50cnkpID0+IHtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSB7XG4gICAgICAgIGxvZ3MudW5zaGlmdChlbnRyeSk7XG4gICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSB7XG4gICAgICAgICAgICBsb2dzLnBvcCgpO1xuICAgICAgICB9XG4gICAgICAgIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG4gICAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGdldExvZ3MgPSAoKSA9PiBbLi4ubG9nc107XG5leHBvcnQgY29uc3QgY2xlYXJMb2dzID0gKCkgPT4ge1xuICAgIGxvZ3MubGVuZ3RoID0gMDtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSBzYXZlTG9nc1RvU3RvcmFnZSgpO1xufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0RlYnVnID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImRlYnVnXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwiZGVidWdcIikpIHtcbiAgICBjb25zb2xlLmRlYnVnKGAke1BSRUZJWH0gW0RFQlVHXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgY29udGV4dCl9YCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBsb2dJbmZvID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImluZm9cIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJpbmZvXCIpKSB7XG4gICAgY29uc29sZS5pbmZvKGAke1BSRUZJWH0gW0lORk9dICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ1dhcm4gPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwid2FyblwiLCBtZXNzYWdlLCBjb250ZXh0KTtcbiAgaWYgKHNob3VsZExvZyhcIndhcm5cIikpIHtcbiAgICBjb25zb2xlLndhcm4oYCR7UFJFRklYfSBbV0FSTl0gJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nRXJyb3IgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwiZXJyb3JcIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJlcnJvclwiKSkge1xuICAgIGNvbnNvbGUuZXJyb3IoYCR7UFJFRklYfSBbRVJST1JdICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0NyaXRpY2FsID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImNyaXRpY2FsXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwiY3JpdGljYWxcIikpIHtcbiAgICAvLyBDcml0aWNhbCBsb2dzIHVzZSBlcnJvciBjb25zb2xlIGJ1dCB3aXRoIGRpc3RpbmN0IHByZWZpeCBhbmQgbWF5YmUgc3R5bGluZyBpZiBzdXBwb3J0ZWRcbiAgICBjb25zb2xlLmVycm9yKGAke1BSRUZJWH0gW0NSSVRJQ0FMXSBcdUQ4M0RcdURFQTggJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuIiwgImltcG9ydCB7IFByZWZlcmVuY2VzLCBTb3J0aW5nU3RyYXRlZ3ksIFRhYk1ldGFkYXRhIH0gZnJvbSBcIi4vdHlwZXMuanNcIjtcblxuZXhwb3J0IGNvbnN0IG1hcENocm9tZVRhYiA9ICh0YWI6IGNocm9tZS50YWJzLlRhYik6IFRhYk1ldGFkYXRhIHwgbnVsbCA9PiB7XG4gIGlmICghdGFiLmlkIHx8IHRhYi5pZCA9PT0gY2hyb21lLnRhYnMuVEFCX0lEX05PTkUgfHwgIXRhYi53aW5kb3dJZCkgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7XG4gICAgaWQ6IHRhYi5pZCxcbiAgICB3aW5kb3dJZDogdGFiLndpbmRvd0lkLFxuICAgIHRpdGxlOiB0YWIudGl0bGUgfHwgXCJVbnRpdGxlZFwiLFxuICAgIHVybDogdGFiLnBlbmRpbmdVcmwgfHwgdGFiLnVybCB8fCBcImFib3V0OmJsYW5rXCIsXG4gICAgcGlubmVkOiBCb29sZWFuKHRhYi5waW5uZWQpLFxuICAgIGxhc3RBY2Nlc3NlZDogdGFiLmxhc3RBY2Nlc3NlZCxcbiAgICBvcGVuZXJUYWJJZDogdGFiLm9wZW5lclRhYklkID8/IHVuZGVmaW5lZCxcbiAgICBmYXZJY29uVXJsOiB0YWIuZmF2SWNvblVybCxcbiAgICBncm91cElkOiB0YWIuZ3JvdXBJZCxcbiAgICBpbmRleDogdGFiLmluZGV4LFxuICAgIGFjdGl2ZTogdGFiLmFjdGl2ZSxcbiAgICBzdGF0dXM6IHRhYi5zdGF0dXMsXG4gICAgc2VsZWN0ZWQ6IHRhYi5oaWdobGlnaHRlZFxuICB9O1xufTtcblxuZXhwb3J0IGNvbnN0IGdldFN0b3JlZFByZWZlcmVuY2VzID0gYXN5bmMgKCk6IFByb21pc2U8UHJlZmVyZW5jZXMgfCBudWxsPiA9PiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChcInByZWZlcmVuY2VzXCIsIChpdGVtcykgPT4ge1xuICAgICAgcmVzb2x2ZSgoaXRlbXNbXCJwcmVmZXJlbmNlc1wiXSBhcyBQcmVmZXJlbmNlcykgPz8gbnVsbCk7XG4gICAgfSk7XG4gIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IGFzQXJyYXkgPSA8VD4odmFsdWU6IHVua25vd24pOiBUW10gPT4ge1xuICAgIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkgcmV0dXJuIHZhbHVlIGFzIFRbXTtcbiAgICByZXR1cm4gW107XG59O1xuIiwgImltcG9ydCB7IEdyb3VwaW5nU3RyYXRlZ3ksIFNvcnRpbmdTdHJhdGVneSwgVGFiR3JvdXAsIFRhYk1ldGFkYXRhLCBDdXN0b21TdHJhdGVneSwgU3RyYXRlZ3lSdWxlLCBSdWxlQ29uZGl0aW9uLCBHcm91cGluZ1J1bGUsIFNvcnRpbmdSdWxlIH0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgZ2V0U3RyYXRlZ2llcyB9IGZyb20gXCIuLi9zaGFyZWQvc3RyYXRlZ3lSZWdpc3RyeS5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcblxubGV0IGN1c3RvbVN0cmF0ZWdpZXM6IEN1c3RvbVN0cmF0ZWd5W10gPSBbXTtcblxuZXhwb3J0IGNvbnN0IHNldEN1c3RvbVN0cmF0ZWdpZXMgPSAoc3RyYXRlZ2llczogQ3VzdG9tU3RyYXRlZ3lbXSkgPT4ge1xuICAgIGN1c3RvbVN0cmF0ZWdpZXMgPSBzdHJhdGVnaWVzO1xufTtcblxuZXhwb3J0IGNvbnN0IGdldEN1c3RvbVN0cmF0ZWdpZXMgPSAoKTogQ3VzdG9tU3RyYXRlZ3lbXSA9PiBjdXN0b21TdHJhdGVnaWVzO1xuXG5jb25zdCBDT0xPUlMgPSBbXCJncmV5XCIsIFwiYmx1ZVwiLCBcInJlZFwiLCBcInllbGxvd1wiLCBcImdyZWVuXCIsIFwicGlua1wiLCBcInB1cnBsZVwiLCBcImN5YW5cIiwgXCJvcmFuZ2VcIl07XG5cbmNvbnN0IHJlZ2V4Q2FjaGUgPSBuZXcgTWFwPHN0cmluZywgUmVnRXhwPigpO1xuY29uc3QgZG9tYWluQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuY29uc3Qgc3ViZG9tYWluQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuY29uc3QgTUFYX0NBQ0hFX1NJWkUgPSAxMDAwO1xuXG5leHBvcnQgY29uc3QgZG9tYWluRnJvbVVybCA9ICh1cmw6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGlmIChkb21haW5DYWNoZS5oYXModXJsKSkgcmV0dXJuIGRvbWFpbkNhY2hlLmdldCh1cmwpITtcblxuICB0cnkge1xuICAgIGNvbnN0IHBhcnNlZCA9IG5ldyBVUkwodXJsKTtcbiAgICBjb25zdCBkb21haW4gPSBwYXJzZWQuaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sIFwiXCIpO1xuXG4gICAgaWYgKGRvbWFpbkNhY2hlLnNpemUgPj0gTUFYX0NBQ0hFX1NJWkUpIGRvbWFpbkNhY2hlLmNsZWFyKCk7XG4gICAgZG9tYWluQ2FjaGUuc2V0KHVybCwgZG9tYWluKTtcblxuICAgIHJldHVybiBkb21haW47XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgbG9nRGVidWcoXCJGYWlsZWQgdG8gcGFyc2UgZG9tYWluXCIsIHsgdXJsLCBlcnJvcjogU3RyaW5nKGVycm9yKSB9KTtcbiAgICByZXR1cm4gXCJ1bmtub3duXCI7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBzdWJkb21haW5Gcm9tVXJsID0gKHVybDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICBpZiAoc3ViZG9tYWluQ2FjaGUuaGFzKHVybCkpIHJldHVybiBzdWJkb21haW5DYWNoZS5nZXQodXJsKSE7XG5cbiAgICB0cnkge1xuICAgICAgICBjb25zdCBwYXJzZWQgPSBuZXcgVVJMKHVybCk7XG4gICAgICAgIGxldCBob3N0bmFtZSA9IHBhcnNlZC5ob3N0bmFtZTtcbiAgICAgICAgLy8gUmVtb3ZlIHd3dy5cbiAgICAgICAgaG9zdG5hbWUgPSBob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgXCJcIik7XG5cbiAgICAgICAgbGV0IHJlc3VsdCA9IFwiXCI7XG4gICAgICAgIGNvbnN0IHBhcnRzID0gaG9zdG5hbWUuc3BsaXQoJy4nKTtcbiAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDIpIHtcbiAgICAgICAgICAgICByZXN1bHQgPSBwYXJ0cy5zbGljZSgwLCBwYXJ0cy5sZW5ndGggLSAyKS5qb2luKCcuJyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3ViZG9tYWluQ2FjaGUuc2l6ZSA+PSBNQVhfQ0FDSEVfU0laRSkgc3ViZG9tYWluQ2FjaGUuY2xlYXIoKTtcbiAgICAgICAgc3ViZG9tYWluQ2FjaGUuc2V0KHVybCwgcmVzdWx0KTtcblxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gXCJcIjtcbiAgICB9XG59XG5cbmNvbnN0IGdldE5lc3RlZFByb3BlcnR5ID0gKG9iajogdW5rbm93biwgcGF0aDogc3RyaW5nKTogdW5rbm93biA9PiB7XG4gICAgaWYgKCFvYmogfHwgdHlwZW9mIG9iaiAhPT0gJ29iamVjdCcpIHJldHVybiB1bmRlZmluZWQ7XG5cbiAgICBpZiAoIXBhdGguaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICByZXR1cm4gKG9iaiBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbcGF0aF07XG4gICAgfVxuXG4gICAgY29uc3QgcGFydHMgPSBwYXRoLnNwbGl0KCcuJyk7XG4gICAgbGV0IGN1cnJlbnQ6IHVua25vd24gPSBvYmo7XG5cbiAgICBmb3IgKGNvbnN0IGtleSBvZiBwYXJ0cykge1xuICAgICAgICBpZiAoIWN1cnJlbnQgfHwgdHlwZW9mIGN1cnJlbnQgIT09ICdvYmplY3QnKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICBjdXJyZW50ID0gKGN1cnJlbnQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW2tleV07XG4gICAgfVxuXG4gICAgcmV0dXJuIGN1cnJlbnQ7XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0RmllbGRWYWx1ZSA9ICh0YWI6IFRhYk1ldGFkYXRhLCBmaWVsZDogc3RyaW5nKTogYW55ID0+IHtcbiAgICBzd2l0Y2goZmllbGQpIHtcbiAgICAgICAgY2FzZSAnaWQnOiByZXR1cm4gdGFiLmlkO1xuICAgICAgICBjYXNlICdpbmRleCc6IHJldHVybiB0YWIuaW5kZXg7XG4gICAgICAgIGNhc2UgJ3dpbmRvd0lkJzogcmV0dXJuIHRhYi53aW5kb3dJZDtcbiAgICAgICAgY2FzZSAnZ3JvdXBJZCc6IHJldHVybiB0YWIuZ3JvdXBJZDtcbiAgICAgICAgY2FzZSAndGl0bGUnOiByZXR1cm4gdGFiLnRpdGxlO1xuICAgICAgICBjYXNlICd1cmwnOiByZXR1cm4gdGFiLnVybDtcbiAgICAgICAgY2FzZSAnc3RhdHVzJzogcmV0dXJuIHRhYi5zdGF0dXM7XG4gICAgICAgIGNhc2UgJ2FjdGl2ZSc6IHJldHVybiB0YWIuYWN0aXZlO1xuICAgICAgICBjYXNlICdzZWxlY3RlZCc6IHJldHVybiB0YWIuc2VsZWN0ZWQ7XG4gICAgICAgIGNhc2UgJ3Bpbm5lZCc6IHJldHVybiB0YWIucGlubmVkO1xuICAgICAgICBjYXNlICdvcGVuZXJUYWJJZCc6IHJldHVybiB0YWIub3BlbmVyVGFiSWQ7XG4gICAgICAgIGNhc2UgJ2xhc3RBY2Nlc3NlZCc6IHJldHVybiB0YWIubGFzdEFjY2Vzc2VkO1xuICAgICAgICBjYXNlICdjb250ZXh0JzogcmV0dXJuIHRhYi5jb250ZXh0O1xuICAgICAgICBjYXNlICdnZW5yZSc6IHJldHVybiB0YWIuY29udGV4dERhdGE/LmdlbnJlO1xuICAgICAgICBjYXNlICdzaXRlTmFtZSc6IHJldHVybiB0YWIuY29udGV4dERhdGE/LnNpdGVOYW1lO1xuICAgICAgICAvLyBEZXJpdmVkIG9yIG1hcHBlZCBmaWVsZHNcbiAgICAgICAgY2FzZSAnZG9tYWluJzogcmV0dXJuIGRvbWFpbkZyb21VcmwodGFiLnVybCk7XG4gICAgICAgIGNhc2UgJ3N1YmRvbWFpbic6IHJldHVybiBzdWJkb21haW5Gcm9tVXJsKHRhYi51cmwpO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgcmV0dXJuIGdldE5lc3RlZFByb3BlcnR5KHRhYiwgZmllbGQpO1xuICAgIH1cbn07XG5cbmNvbnN0IHN0cmlwVGxkID0gKGRvbWFpbjogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIGRvbWFpbi5yZXBsYWNlKC9cXC4oY29tfG9yZ3xnb3Z8bmV0fGVkdXxpbykkL2ksIFwiXCIpO1xufTtcblxuZXhwb3J0IGNvbnN0IHNlbWFudGljQnVja2V0ID0gKHRpdGxlOiBzdHJpbmcsIHVybDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3Qga2V5ID0gYCR7dGl0bGV9ICR7dXJsfWAudG9Mb3dlckNhc2UoKTtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImRvY1wiKSB8fCBrZXkuaW5jbHVkZXMoXCJyZWFkbWVcIikgfHwga2V5LmluY2x1ZGVzKFwiZ3VpZGVcIikpIHJldHVybiBcIkRvY3NcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcIm1haWxcIikgfHwga2V5LmluY2x1ZGVzKFwiaW5ib3hcIikpIHJldHVybiBcIkNoYXRcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImRhc2hib2FyZFwiKSB8fCBrZXkuaW5jbHVkZXMoXCJjb25zb2xlXCIpKSByZXR1cm4gXCJEYXNoXCI7XG4gIGlmIChrZXkuaW5jbHVkZXMoXCJpc3N1ZVwiKSB8fCBrZXkuaW5jbHVkZXMoXCJ0aWNrZXRcIikpIHJldHVybiBcIlRhc2tzXCI7XG4gIGlmIChrZXkuaW5jbHVkZXMoXCJkcml2ZVwiKSB8fCBrZXkuaW5jbHVkZXMoXCJzdG9yYWdlXCIpKSByZXR1cm4gXCJGaWxlc1wiO1xuICByZXR1cm4gXCJNaXNjXCI7XG59O1xuXG5leHBvcnQgY29uc3QgbmF2aWdhdGlvbktleSA9ICh0YWI6IFRhYk1ldGFkYXRhKTogc3RyaW5nID0+IHtcbiAgaWYgKHRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIGBjaGlsZC1vZi0ke3RhYi5vcGVuZXJUYWJJZH1gO1xuICB9XG4gIHJldHVybiBgd2luZG93LSR7dGFiLndpbmRvd0lkfWA7XG59O1xuXG5jb25zdCBnZXRSZWNlbmN5TGFiZWwgPSAobGFzdEFjY2Vzc2VkOiBudW1iZXIpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICBjb25zdCBkaWZmID0gbm93IC0gbGFzdEFjY2Vzc2VkO1xuICBpZiAoZGlmZiA8IDM2MDAwMDApIHJldHVybiBcIkp1c3Qgbm93XCI7IC8vIDFoXG4gIGlmIChkaWZmIDwgODY0MDAwMDApIHJldHVybiBcIlRvZGF5XCI7IC8vIDI0aFxuICBpZiAoZGlmZiA8IDE3MjgwMDAwMCkgcmV0dXJuIFwiWWVzdGVyZGF5XCI7IC8vIDQ4aFxuICBpZiAoZGlmZiA8IDYwNDgwMDAwMCkgcmV0dXJuIFwiVGhpcyBXZWVrXCI7IC8vIDdkXG4gIHJldHVybiBcIk9sZGVyXCI7XG59O1xuXG5jb25zdCBjb2xvckZvcktleSA9IChrZXk6IHN0cmluZywgb2Zmc2V0OiBudW1iZXIpOiBzdHJpbmcgPT4gQ09MT1JTWyhNYXRoLmFicyhoYXNoQ29kZShrZXkpKSArIG9mZnNldCkgJSBDT0xPUlMubGVuZ3RoXTtcblxuY29uc3QgaGFzaENvZGUgPSAodmFsdWU6IHN0cmluZyk6IG51bWJlciA9PiB7XG4gIGxldCBoYXNoID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB2YWx1ZS5sZW5ndGg7IGkgKz0gMSkge1xuICAgIGhhc2ggPSAoaGFzaCA8PCA1KSAtIGhhc2ggKyB2YWx1ZS5jaGFyQ29kZUF0KGkpO1xuICAgIGhhc2ggfD0gMDtcbiAgfVxuICByZXR1cm4gaGFzaDtcbn07XG5cbi8vIEhlbHBlciB0byBnZXQgYSBodW1hbi1yZWFkYWJsZSBsYWJlbCBjb21wb25lbnQgZnJvbSBhIHN0cmF0ZWd5IGFuZCBhIHNldCBvZiB0YWJzXG5jb25zdCBnZXRMYWJlbENvbXBvbmVudCA9IChzdHJhdGVneTogR3JvdXBpbmdTdHJhdGVneSB8IHN0cmluZywgdGFiczogVGFiTWV0YWRhdGFbXSwgYWxsVGFic01hcDogTWFwPG51bWJlciwgVGFiTWV0YWRhdGE+KTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gIGNvbnN0IGZpcnN0VGFiID0gdGFic1swXTtcbiAgaWYgKCFmaXJzdFRhYikgcmV0dXJuIFwiVW5rbm93blwiO1xuXG4gIC8vIENoZWNrIGN1c3RvbSBzdHJhdGVnaWVzIGZpcnN0XG4gIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5KTtcbiAgaWYgKGN1c3RvbSkge1xuICAgICAgcmV0dXJuIGdyb3VwaW5nS2V5KGZpcnN0VGFiLCBzdHJhdGVneSk7XG4gIH1cblxuICBzd2l0Y2ggKHN0cmF0ZWd5KSB7XG4gICAgY2FzZSBcImRvbWFpblwiOiB7XG4gICAgICBjb25zdCBzaXRlTmFtZXMgPSBuZXcgU2V0KHRhYnMubWFwKHQgPT4gdC5jb250ZXh0RGF0YT8uc2l0ZU5hbWUpLmZpbHRlcihCb29sZWFuKSk7XG4gICAgICBpZiAoc2l0ZU5hbWVzLnNpemUgPT09IDEpIHtcbiAgICAgICAgcmV0dXJuIHN0cmlwVGxkKEFycmF5LmZyb20oc2l0ZU5hbWVzKVswXSBhcyBzdHJpbmcpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHN0cmlwVGxkKGRvbWFpbkZyb21VcmwoZmlyc3RUYWIudXJsKSk7XG4gICAgfVxuICAgIGNhc2UgXCJkb21haW5fZnVsbFwiOlxuICAgICAgcmV0dXJuIGRvbWFpbkZyb21VcmwoZmlyc3RUYWIudXJsKTtcbiAgICBjYXNlIFwidG9waWNcIjpcbiAgICAgIHJldHVybiBzZW1hbnRpY0J1Y2tldChmaXJzdFRhYi50aXRsZSwgZmlyc3RUYWIudXJsKTtcbiAgICBjYXNlIFwibGluZWFnZVwiOlxuICAgICAgaWYgKGZpcnN0VGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgY29uc3QgcGFyZW50ID0gYWxsVGFic01hcC5nZXQoZmlyc3RUYWIub3BlbmVyVGFiSWQpO1xuICAgICAgICBpZiAocGFyZW50KSB7XG4gICAgICAgICAgY29uc3QgcGFyZW50VGl0bGUgPSBwYXJlbnQudGl0bGUubGVuZ3RoID4gMjAgPyBwYXJlbnQudGl0bGUuc3Vic3RyaW5nKDAsIDIwKSArIFwiLi4uXCIgOiBwYXJlbnQudGl0bGU7XG4gICAgICAgICAgcmV0dXJuIGBGcm9tOiAke3BhcmVudFRpdGxlfWA7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGBGcm9tOiBUYWIgJHtmaXJzdFRhYi5vcGVuZXJUYWJJZH1gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGBXaW5kb3cgJHtmaXJzdFRhYi53aW5kb3dJZH1gO1xuICAgIGNhc2UgXCJjb250ZXh0XCI6XG4gICAgICByZXR1cm4gZmlyc3RUYWIuY29udGV4dCB8fCBcIlVuY2F0ZWdvcml6ZWRcIjtcbiAgICBjYXNlIFwicGlubmVkXCI6XG4gICAgICByZXR1cm4gZmlyc3RUYWIucGlubmVkID8gXCJQaW5uZWRcIiA6IFwiVW5waW5uZWRcIjtcbiAgICBjYXNlIFwiYWdlXCI6XG4gICAgICByZXR1cm4gZ2V0UmVjZW5jeUxhYmVsKGZpcnN0VGFiLmxhc3RBY2Nlc3NlZCA/PyAwKTtcbiAgICBjYXNlIFwidXJsXCI6XG4gICAgICByZXR1cm4gXCJVUkwgR3JvdXBcIjtcbiAgICBjYXNlIFwicmVjZW5jeVwiOlxuICAgICAgcmV0dXJuIFwiVGltZSBHcm91cFwiO1xuICAgIGNhc2UgXCJuZXN0aW5nXCI6XG4gICAgICByZXR1cm4gZmlyc3RUYWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCA/IFwiQ2hpbGRyZW5cIiA6IFwiUm9vdHNcIjtcbiAgICBkZWZhdWx0OlxuICAgICAgY29uc3QgdmFsID0gZ2V0RmllbGRWYWx1ZShmaXJzdFRhYiwgc3RyYXRlZ3kpO1xuICAgICAgaWYgKHZhbCAhPT0gdW5kZWZpbmVkICYmIHZhbCAhPT0gbnVsbCkge1xuICAgICAgICAgIHJldHVybiBTdHJpbmcodmFsKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBcIlVua25vd25cIjtcbiAgfVxufTtcblxuY29uc3QgZ2VuZXJhdGVMYWJlbCA9IChcbiAgc3RyYXRlZ2llczogKEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcpW10sXG4gIHRhYnM6IFRhYk1ldGFkYXRhW10sXG4gIGFsbFRhYnNNYXA6IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhPlxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgbGFiZWxzID0gc3RyYXRlZ2llc1xuICAgIC5tYXAocyA9PiBnZXRMYWJlbENvbXBvbmVudChzLCB0YWJzLCBhbGxUYWJzTWFwKSlcbiAgICAuZmlsdGVyKGwgPT4gbCAmJiBsICE9PSBcIlVua25vd25cIiAmJiBsICE9PSBcIkdyb3VwXCIgJiYgbCAhPT0gXCJVUkwgR3JvdXBcIiAmJiBsICE9PSBcIlRpbWUgR3JvdXBcIiAmJiBsICE9PSBcIk1pc2NcIik7XG5cbiAgaWYgKGxhYmVscy5sZW5ndGggPT09IDApIHJldHVybiBcIkdyb3VwXCI7XG4gIHJldHVybiBBcnJheS5mcm9tKG5ldyBTZXQobGFiZWxzKSkuam9pbihcIiAtIFwiKTtcbn07XG5cbmNvbnN0IGdldFN0cmF0ZWd5Q29sb3JSdWxlID0gKHN0cmF0ZWd5SWQ6IHN0cmluZyk6IEdyb3VwaW5nUnVsZSB8IHVuZGVmaW5lZCA9PiB7XG4gICAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3lJZCk7XG4gICAgaWYgKCFjdXN0b20pIHJldHVybiB1bmRlZmluZWQ7XG5cbiAgICBjb25zdCBncm91cGluZ1J1bGVzTGlzdCA9IGFzQXJyYXk8R3JvdXBpbmdSdWxlPihjdXN0b20uZ3JvdXBpbmdSdWxlcyk7XG4gICAgLy8gSXRlcmF0ZSBtYW51YWxseSB0byBjaGVjayBjb2xvclxuICAgIGZvciAobGV0IGkgPSBncm91cGluZ1J1bGVzTGlzdC5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICBjb25zdCBydWxlID0gZ3JvdXBpbmdSdWxlc0xpc3RbaV07XG4gICAgICAgIGlmIChydWxlICYmIHJ1bGUuY29sb3IgJiYgcnVsZS5jb2xvciAhPT0gJ3JhbmRvbScpIHtcbiAgICAgICAgICAgIHJldHVybiBydWxlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB1bmRlZmluZWQ7XG59O1xuXG5jb25zdCByZXNvbHZlV2luZG93TW9kZSA9IChtb2RlczogKHN0cmluZyB8IHVuZGVmaW5lZClbXSk6IFwiY3VycmVudFwiIHwgXCJuZXdcIiB8IFwiY29tcG91bmRcIiA9PiB7XG4gICAgaWYgKG1vZGVzLmluY2x1ZGVzKFwibmV3XCIpKSByZXR1cm4gXCJuZXdcIjtcbiAgICBpZiAobW9kZXMuaW5jbHVkZXMoXCJjb21wb3VuZFwiKSkgcmV0dXJuIFwiY29tcG91bmRcIjtcbiAgICByZXR1cm4gXCJjdXJyZW50XCI7XG59O1xuXG5leHBvcnQgY29uc3QgZ3JvdXBUYWJzID0gKFxuICB0YWJzOiBUYWJNZXRhZGF0YVtdLFxuICBzdHJhdGVnaWVzOiAoU29ydGluZ1N0cmF0ZWd5IHwgc3RyaW5nKVtdXG4pOiBUYWJHcm91cFtdID0+IHtcbiAgY29uc3QgYXZhaWxhYmxlU3RyYXRlZ2llcyA9IGdldFN0cmF0ZWdpZXMoY3VzdG9tU3RyYXRlZ2llcyk7XG4gIGNvbnN0IGVmZmVjdGl2ZVN0cmF0ZWdpZXMgPSBzdHJhdGVnaWVzLmZpbHRlcihzID0+IGF2YWlsYWJsZVN0cmF0ZWdpZXMuZmluZChhdmFpbCA9PiBhdmFpbC5pZCA9PT0gcyk/LmlzR3JvdXBpbmcpO1xuICBjb25zdCBidWNrZXRzID0gbmV3IE1hcDxzdHJpbmcsIFRhYkdyb3VwPigpO1xuXG4gIGNvbnN0IGFsbFRhYnNNYXAgPSBuZXcgTWFwPG51bWJlciwgVGFiTWV0YWRhdGE+KCk7XG4gIHRhYnMuZm9yRWFjaCh0ID0+IGFsbFRhYnNNYXAuc2V0KHQuaWQsIHQpKTtcblxuICB0YWJzLmZvckVhY2goKHRhYikgPT4ge1xuICAgIGxldCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IGFwcGxpZWRTdHJhdGVnaWVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IGNvbGxlY3RlZE1vZGVzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgZm9yIChjb25zdCBzIG9mIGVmZmVjdGl2ZVN0cmF0ZWdpZXMpIHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGdldEdyb3VwaW5nUmVzdWx0KHRhYiwgcyk7XG4gICAgICAgICAgICBpZiAocmVzdWx0LmtleSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGtleXMucHVzaChgJHtzfToke3Jlc3VsdC5rZXl9YCk7XG4gICAgICAgICAgICAgICAgYXBwbGllZFN0cmF0ZWdpZXMucHVzaChzKTtcbiAgICAgICAgICAgICAgICBjb2xsZWN0ZWRNb2Rlcy5wdXNoKHJlc3VsdC5tb2RlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgbG9nRGVidWcoXCJFcnJvciBnZW5lcmF0aW5nIGdyb3VwaW5nIGtleVwiLCB7IHRhYklkOiB0YWIuaWQsIGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgIHJldHVybjsgLy8gU2tpcCB0aGlzIHRhYiBvbiBlcnJvclxuICAgIH1cblxuICAgIC8vIElmIG5vIHN0cmF0ZWdpZXMgYXBwbGllZCAoZS5nLiBhbGwgZmlsdGVyZWQgb3V0KSwgc2tpcCBncm91cGluZyBmb3IgdGhpcyB0YWJcbiAgICBpZiAoa2V5cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGVmZmVjdGl2ZU1vZGUgPSByZXNvbHZlV2luZG93TW9kZShjb2xsZWN0ZWRNb2Rlcyk7XG4gICAgY29uc3QgdmFsdWVLZXkgPSBrZXlzLmpvaW4oXCI6OlwiKTtcbiAgICBsZXQgYnVja2V0S2V5ID0gXCJcIjtcbiAgICBpZiAoZWZmZWN0aXZlTW9kZSA9PT0gJ2N1cnJlbnQnKSB7XG4gICAgICAgICBidWNrZXRLZXkgPSBgd2luZG93LSR7dGFiLndpbmRvd0lkfTo6YCArIHZhbHVlS2V5O1xuICAgIH0gZWxzZSB7XG4gICAgICAgICBidWNrZXRLZXkgPSBgZ2xvYmFsOjpgICsgdmFsdWVLZXk7XG4gICAgfVxuXG4gICAgbGV0IGdyb3VwID0gYnVja2V0cy5nZXQoYnVja2V0S2V5KTtcbiAgICBpZiAoIWdyb3VwKSB7XG4gICAgICBsZXQgZ3JvdXBDb2xvciA9IG51bGw7XG4gICAgICBsZXQgY29sb3JGaWVsZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgbGV0IGNvbG9yVHJhbnNmb3JtOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICBsZXQgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbiAgICAgIGZvciAoY29uc3Qgc0lkIG9mIGFwcGxpZWRTdHJhdGVnaWVzKSB7XG4gICAgICAgIGNvbnN0IHJ1bGUgPSBnZXRTdHJhdGVneUNvbG9yUnVsZShzSWQpO1xuICAgICAgICBpZiAocnVsZSkge1xuICAgICAgICAgICAgZ3JvdXBDb2xvciA9IHJ1bGUuY29sb3I7XG4gICAgICAgICAgICBjb2xvckZpZWxkID0gcnVsZS5jb2xvckZpZWxkO1xuICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm0gPSBydWxlLmNvbG9yVHJhbnNmb3JtO1xuICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuID0gcnVsZS5jb2xvclRyYW5zZm9ybVBhdHRlcm47XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoZ3JvdXBDb2xvciA9PT0gJ21hdGNoJykge1xuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkodmFsdWVLZXksIDApO1xuICAgICAgfSBlbHNlIGlmIChncm91cENvbG9yID09PSAnZmllbGQnICYmIGNvbG9yRmllbGQpIHtcbiAgICAgICAgY29uc3QgdmFsID0gZ2V0RmllbGRWYWx1ZSh0YWIsIGNvbG9yRmllbGQpO1xuICAgICAgICBsZXQga2V5ID0gdmFsICE9PSB1bmRlZmluZWQgJiYgdmFsICE9PSBudWxsID8gU3RyaW5nKHZhbCkgOiBcIlwiO1xuICAgICAgICBpZiAoY29sb3JUcmFuc2Zvcm0pIHtcbiAgICAgICAgICAgIGtleSA9IGFwcGx5VmFsdWVUcmFuc2Zvcm0oa2V5LCBjb2xvclRyYW5zZm9ybSwgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuKTtcbiAgICAgICAgfVxuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkoa2V5LCAwKTtcbiAgICAgIH0gZWxzZSBpZiAoIWdyb3VwQ29sb3IgfHwgZ3JvdXBDb2xvciA9PT0gJ2ZpZWxkJykge1xuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkoYnVja2V0S2V5LCBidWNrZXRzLnNpemUpO1xuICAgICAgfVxuXG4gICAgICBncm91cCA9IHtcbiAgICAgICAgaWQ6IGJ1Y2tldEtleSxcbiAgICAgICAgd2luZG93SWQ6IHRhYi53aW5kb3dJZCxcbiAgICAgICAgbGFiZWw6IFwiXCIsXG4gICAgICAgIGNvbG9yOiBncm91cENvbG9yLFxuICAgICAgICB0YWJzOiBbXSxcbiAgICAgICAgcmVhc29uOiBhcHBsaWVkU3RyYXRlZ2llcy5qb2luKFwiICsgXCIpLFxuICAgICAgICB3aW5kb3dNb2RlOiBlZmZlY3RpdmVNb2RlXG4gICAgICB9O1xuICAgICAgYnVja2V0cy5zZXQoYnVja2V0S2V5LCBncm91cCk7XG4gICAgfVxuICAgIGdyb3VwLnRhYnMucHVzaCh0YWIpO1xuICB9KTtcblxuICBjb25zdCBncm91cHMgPSBBcnJheS5mcm9tKGJ1Y2tldHMudmFsdWVzKCkpO1xuICBncm91cHMuZm9yRWFjaChncm91cCA9PiB7XG4gICAgZ3JvdXAubGFiZWwgPSBnZW5lcmF0ZUxhYmVsKGVmZmVjdGl2ZVN0cmF0ZWdpZXMsIGdyb3VwLnRhYnMsIGFsbFRhYnNNYXApO1xuICB9KTtcblxuICByZXR1cm4gZ3JvdXBzO1xufTtcblxuY29uc3QgY2hlY2tWYWx1ZU1hdGNoID0gKFxuICAgIG9wZXJhdG9yOiBzdHJpbmcsXG4gICAgcmF3VmFsdWU6IGFueSxcbiAgICBydWxlVmFsdWU6IHN0cmluZ1xuKTogeyBpc01hdGNoOiBib29sZWFuOyBtYXRjaE9iajogUmVnRXhwRXhlY0FycmF5IHwgbnVsbCB9ID0+IHtcbiAgICBjb25zdCB2YWx1ZVN0ciA9IHJhd1ZhbHVlICE9PSB1bmRlZmluZWQgJiYgcmF3VmFsdWUgIT09IG51bGwgPyBTdHJpbmcocmF3VmFsdWUpIDogXCJcIjtcbiAgICBjb25zdCB2YWx1ZVRvQ2hlY2sgPSB2YWx1ZVN0ci50b0xvd2VyQ2FzZSgpO1xuICAgIGNvbnN0IHBhdHRlcm5Ub0NoZWNrID0gcnVsZVZhbHVlID8gcnVsZVZhbHVlLnRvTG93ZXJDYXNlKCkgOiBcIlwiO1xuXG4gICAgbGV0IGlzTWF0Y2ggPSBmYWxzZTtcbiAgICBsZXQgbWF0Y2hPYmo6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGwgPSBudWxsO1xuXG4gICAgc3dpdGNoIChvcGVyYXRvcikge1xuICAgICAgICBjYXNlICdjb250YWlucyc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suaW5jbHVkZXMocGF0dGVyblRvQ2hlY2spOyBicmVhaztcbiAgICAgICAgY2FzZSAnZG9lc05vdENvbnRhaW4nOiBpc01hdGNoID0gIXZhbHVlVG9DaGVjay5pbmNsdWRlcyhwYXR0ZXJuVG9DaGVjayk7IGJyZWFrO1xuICAgICAgICBjYXNlICdlcXVhbHMnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrID09PSBwYXR0ZXJuVG9DaGVjazsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3N0YXJ0c1dpdGgnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrLnN0YXJ0c1dpdGgocGF0dGVyblRvQ2hlY2spOyBicmVhaztcbiAgICAgICAgY2FzZSAnZW5kc1dpdGgnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrLmVuZHNXaXRoKHBhdHRlcm5Ub0NoZWNrKTsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2V4aXN0cyc6IGlzTWF0Y2ggPSByYXdWYWx1ZSAhPT0gdW5kZWZpbmVkOyBicmVhaztcbiAgICAgICAgY2FzZSAnZG9lc05vdEV4aXN0JzogaXNNYXRjaCA9IHJhd1ZhbHVlID09PSB1bmRlZmluZWQ7IGJyZWFrO1xuICAgICAgICBjYXNlICdpc051bGwnOiBpc01hdGNoID0gcmF3VmFsdWUgPT09IG51bGw7IGJyZWFrO1xuICAgICAgICBjYXNlICdpc05vdE51bGwnOiBpc01hdGNoID0gcmF3VmFsdWUgIT09IG51bGw7IGJyZWFrO1xuICAgICAgICBjYXNlICdtYXRjaGVzJzpcbiAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChydWxlVmFsdWUsICdpJyk7XG4gICAgICAgICAgICAgICAgbWF0Y2hPYmogPSByZWdleC5leGVjKHZhbHVlU3RyKTtcbiAgICAgICAgICAgICAgICBpc01hdGNoID0gISFtYXRjaE9iajtcbiAgICAgICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICByZXR1cm4geyBpc01hdGNoLCBtYXRjaE9iaiB9O1xufTtcblxuZXhwb3J0IGNvbnN0IGNoZWNrQ29uZGl0aW9uID0gKGNvbmRpdGlvbjogUnVsZUNvbmRpdGlvbiwgdGFiOiBUYWJNZXRhZGF0YSk6IGJvb2xlYW4gPT4ge1xuICAgIGlmICghY29uZGl0aW9uKSByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgcmF3VmFsdWUgPSBnZXRGaWVsZFZhbHVlKHRhYiwgY29uZGl0aW9uLmZpZWxkKTtcbiAgICBjb25zdCB7IGlzTWF0Y2ggfSA9IGNoZWNrVmFsdWVNYXRjaChjb25kaXRpb24ub3BlcmF0b3IsIHJhd1ZhbHVlLCBjb25kaXRpb24udmFsdWUpO1xuICAgIHJldHVybiBpc01hdGNoO1xufTtcblxuZXhwb3J0IGNvbnN0IGFwcGx5VmFsdWVUcmFuc2Zvcm0gPSAodmFsOiBzdHJpbmcsIHRyYW5zZm9ybTogc3RyaW5nLCBwYXR0ZXJuPzogc3RyaW5nLCByZXBsYWNlbWVudD86IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgaWYgKCF2YWwgfHwgIXRyYW5zZm9ybSB8fCB0cmFuc2Zvcm0gPT09ICdub25lJykgcmV0dXJuIHZhbDtcblxuICAgIHN3aXRjaCAodHJhbnNmb3JtKSB7XG4gICAgICAgIGNhc2UgJ3N0cmlwVGxkJzpcbiAgICAgICAgICAgIHJldHVybiBzdHJpcFRsZCh2YWwpO1xuICAgICAgICBjYXNlICdsb3dlcmNhc2UnOlxuICAgICAgICAgICAgcmV0dXJuIHZhbC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICBjYXNlICd1cHBlcmNhc2UnOlxuICAgICAgICAgICAgcmV0dXJuIHZhbC50b1VwcGVyQ2FzZSgpO1xuICAgICAgICBjYXNlICdmaXJzdENoYXInOlxuICAgICAgICAgICAgcmV0dXJuIHZhbC5jaGFyQXQoMCk7XG4gICAgICAgIGNhc2UgJ2RvbWFpbic6XG4gICAgICAgICAgICByZXR1cm4gZG9tYWluRnJvbVVybCh2YWwpO1xuICAgICAgICBjYXNlICdob3N0bmFtZSc6XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICByZXR1cm4gbmV3IFVSTCh2YWwpLmhvc3RuYW1lO1xuICAgICAgICAgICAgfSBjYXRjaCB7IHJldHVybiB2YWw7IH1cbiAgICAgICAgY2FzZSAncmVnZXgnOlxuICAgICAgICAgICAgaWYgKHBhdHRlcm4pIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBsZXQgcmVnZXggPSByZWdleENhY2hlLmdldChwYXR0ZXJuKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFyZWdleCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVnZXggPSBuZXcgUmVnRXhwKHBhdHRlcm4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVnZXhDYWNoZS5zZXQocGF0dGVybiwgcmVnZXgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1hdGNoID0gcmVnZXguZXhlYyh2YWwpO1xuICAgICAgICAgICAgICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBleHRyYWN0ZWQgPSBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBtYXRjaC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4dHJhY3RlZCArPSBtYXRjaFtpXSB8fCBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGV4dHJhY3RlZDtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkludmFsaWQgcmVnZXggaW4gdHJhbnNmb3JtXCIsIHsgcGF0dGVybjogcGF0dGVybiwgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgY2FzZSAncmVnZXhSZXBsYWNlJzpcbiAgICAgICAgICAgICBpZiAocGF0dGVybikge1xuICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgLy8gVXNpbmcgJ2cnIGdsb2JhbCBmbGFnIGJ5IGRlZmF1bHQgZm9yIHJlcGxhY2VtZW50XG4gICAgICAgICAgICAgICAgICAgICByZXR1cm4gdmFsLnJlcGxhY2UobmV3IFJlZ0V4cChwYXR0ZXJuLCAnZycpLCByZXBsYWNlbWVudCB8fCBcIlwiKTtcbiAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICAgbG9nRGVidWcoXCJJbnZhbGlkIHJlZ2V4IGluIHRyYW5zZm9ybVwiLCB7IHBhdHRlcm46IHBhdHRlcm4sIGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgICAgICAgICAgICAgICByZXR1cm4gdmFsO1xuICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgfVxuICAgICAgICAgICAgIHJldHVybiB2YWw7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICByZXR1cm4gdmFsO1xuICAgIH1cbn07XG5cbmZ1bmN0aW9uIGV2YWx1YXRlTGVnYWN5UnVsZXMobGVnYWN5UnVsZXM6IFN0cmF0ZWd5UnVsZVtdLCB0YWI6IFRhYk1ldGFkYXRhKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgLy8gRGVmZW5zaXZlIGNoZWNrXG4gICAgaWYgKCFsZWdhY3lSdWxlcyB8fCAhQXJyYXkuaXNBcnJheShsZWdhY3lSdWxlcykpIHtcbiAgICAgICAgaWYgKCFsZWdhY3lSdWxlcykgcmV0dXJuIG51bGw7XG4gICAgICAgIC8vIFRyeSBhc0FycmF5IGlmIGl0J3Mgbm90IGFycmF5IGJ1dCB0cnV0aHkgKHVubGlrZWx5IGdpdmVuIHByZXZpb3VzIGxvZ2ljIGJ1dCBzYWZlKVxuICAgIH1cblxuICAgIGNvbnN0IGxlZ2FjeVJ1bGVzTGlzdCA9IGFzQXJyYXk8U3RyYXRlZ3lSdWxlPihsZWdhY3lSdWxlcyk7XG4gICAgaWYgKGxlZ2FjeVJ1bGVzTGlzdC5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGxlZ2FjeVJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IHJhd1ZhbHVlID0gZ2V0RmllbGRWYWx1ZSh0YWIsIHJ1bGUuZmllbGQpO1xuICAgICAgICAgICAgY29uc3QgeyBpc01hdGNoLCBtYXRjaE9iaiB9ID0gY2hlY2tWYWx1ZU1hdGNoKHJ1bGUub3BlcmF0b3IsIHJhd1ZhbHVlLCBydWxlLnZhbHVlKTtcblxuICAgICAgICAgICAgaWYgKGlzTWF0Y2gpIHtcbiAgICAgICAgICAgICAgICBsZXQgcmVzdWx0ID0gcnVsZS5yZXN1bHQ7XG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoT2JqKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgbWF0Y2hPYmoubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShuZXcgUmVnRXhwKGBcXFxcJCR7aX1gLCAnZycpLCBtYXRjaE9ialtpXSB8fCBcIlwiKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgbG9nRGVidWcoXCJFcnJvciBldmFsdWF0aW5nIGxlZ2FjeSBydWxlc1wiLCB7IGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGNvbnN0IGdldEdyb3VwaW5nUmVzdWx0ID0gKHRhYjogVGFiTWV0YWRhdGEsIHN0cmF0ZWd5OiBHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nKTogeyBrZXk6IHN0cmluZyB8IG51bGwsIG1vZGU6IFwiY3VycmVudFwiIHwgXCJuZXdcIiB8IFwiY29tcG91bmRcIiB9ID0+IHtcbiAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3kpO1xuICBpZiAoY3VzdG9tKSB7XG4gICAgICBjb25zdCBmaWx0ZXJHcm91cHNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uW10+KGN1c3RvbS5maWx0ZXJHcm91cHMpO1xuICAgICAgY29uc3QgZmlsdGVyc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGN1c3RvbS5maWx0ZXJzKTtcblxuICAgICAgbGV0IG1hdGNoID0gZmFsc2U7XG5cbiAgICAgIGlmIChmaWx0ZXJHcm91cHNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAvLyBPUiBsb2dpY1xuICAgICAgICAgIGZvciAoY29uc3QgZ3JvdXAgb2YgZmlsdGVyR3JvdXBzTGlzdCkge1xuICAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihncm91cCk7XG4gICAgICAgICAgICAgIGlmIChncm91cFJ1bGVzLmxlbmd0aCA9PT0gMCB8fCBncm91cFJ1bGVzLmV2ZXJ5KHIgPT4gY2hlY2tDb25kaXRpb24ociwgdGFiKSkpIHtcbiAgICAgICAgICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChmaWx0ZXJzTGlzdC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgLy8gTGVnYWN5L1NpbXBsZSBBTkQgbG9naWNcbiAgICAgICAgICBpZiAoZmlsdGVyc0xpc3QuZXZlcnkoZiA9PiBjaGVja0NvbmRpdGlvbihmLCB0YWIpKSkge1xuICAgICAgICAgICAgICBtYXRjaCA9IHRydWU7XG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBObyBmaWx0ZXJzIC0+IE1hdGNoIGFsbFxuICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFtYXRjaCkge1xuICAgICAgICAgIHJldHVybiB7IGtleTogbnVsbCwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZ3JvdXBpbmdSdWxlc0xpc3QgPSBhc0FycmF5PEdyb3VwaW5nUnVsZT4oY3VzdG9tLmdyb3VwaW5nUnVsZXMpO1xuICAgICAgaWYgKGdyb3VwaW5nUnVsZXNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICBjb25zdCBtb2Rlczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwaW5nUnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICBsZXQgdmFsID0gXCJcIjtcbiAgICAgICAgICAgICAgICBpZiAocnVsZS5zb3VyY2UgPT09ICdmaWVsZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJhdyA9IGdldEZpZWxkVmFsdWUodGFiLCBydWxlLnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHJhdyAhPT0gdW5kZWZpbmVkICYmIHJhdyAhPT0gbnVsbCA/IFN0cmluZyhyYXcpIDogXCJcIjtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgdmFsID0gcnVsZS52YWx1ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodmFsICYmIHJ1bGUudHJhbnNmb3JtICYmIHJ1bGUudHJhbnNmb3JtICE9PSAnbm9uZScpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFsID0gYXBwbHlWYWx1ZVRyYW5zZm9ybSh2YWwsIHJ1bGUudHJhbnNmb3JtLCBydWxlLnRyYW5zZm9ybVBhdHRlcm4sIHJ1bGUudHJhbnNmb3JtUmVwbGFjZW1lbnQpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh2YWwpIHtcbiAgICAgICAgICAgICAgICAgICAgcGFydHMucHVzaCh2YWwpO1xuICAgICAgICAgICAgICAgICAgICBpZiAocnVsZS53aW5kb3dNb2RlKSBtb2Rlcy5wdXNoKHJ1bGUud2luZG93TW9kZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGFwcGx5aW5nIGdyb3VwaW5nIHJ1bGVzXCIsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICByZXR1cm4geyBrZXk6IHBhcnRzLmpvaW4oXCIgLSBcIiksIG1vZGU6IHJlc29sdmVXaW5kb3dNb2RlKG1vZGVzKSB9O1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4geyBrZXk6IGN1c3RvbS5mYWxsYmFjayB8fCBcIk1pc2NcIiwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH0gZWxzZSBpZiAoY3VzdG9tLnJ1bGVzKSB7XG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0gZXZhbHVhdGVMZWdhY3lSdWxlcyhhc0FycmF5PFN0cmF0ZWd5UnVsZT4oY3VzdG9tLnJ1bGVzKSwgdGFiKTtcbiAgICAgICAgICBpZiAocmVzdWx0KSByZXR1cm4geyBrZXk6IHJlc3VsdCwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHsga2V5OiBjdXN0b20uZmFsbGJhY2sgfHwgXCJNaXNjXCIsIG1vZGU6IFwiY3VycmVudFwiIH07XG4gIH1cblxuICAvLyBCdWlsdC1pbiBzdHJhdGVnaWVzXG4gIGxldCBzaW1wbGVLZXk6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBzd2l0Y2ggKHN0cmF0ZWd5KSB7XG4gICAgY2FzZSBcImRvbWFpblwiOlxuICAgIGNhc2UgXCJkb21haW5fZnVsbFwiOlxuICAgICAgc2ltcGxlS2V5ID0gZG9tYWluRnJvbVVybCh0YWIudXJsKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJ0b3BpY1wiOlxuICAgICAgc2ltcGxlS2V5ID0gc2VtYW50aWNCdWNrZXQodGFiLnRpdGxlLCB0YWIudXJsKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJsaW5lYWdlXCI6XG4gICAgICBzaW1wbGVLZXkgPSBuYXZpZ2F0aW9uS2V5KHRhYik7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwiY29udGV4dFwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLmNvbnRleHQgfHwgXCJVbmNhdGVnb3JpemVkXCI7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwicGlubmVkXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIucGlubmVkID8gXCJwaW5uZWRcIiA6IFwidW5waW5uZWRcIjtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJhZ2VcIjpcbiAgICAgIHNpbXBsZUtleSA9IGdldFJlY2VuY3lMYWJlbCh0YWIubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInVybFwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLnVybDtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJ0aXRsZVwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLnRpdGxlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInJlY2VuY3lcIjpcbiAgICAgIHNpbXBsZUtleSA9IFN0cmluZyh0YWIubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcIm5lc3RpbmdcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkID8gXCJjaGlsZFwiIDogXCJyb290XCI7XG4gICAgICBicmVhaztcbiAgICBkZWZhdWx0OlxuICAgICAgICBjb25zdCB2YWwgPSBnZXRGaWVsZFZhbHVlKHRhYiwgc3RyYXRlZ3kpO1xuICAgICAgICBpZiAodmFsICE9PSB1bmRlZmluZWQgJiYgdmFsICE9PSBudWxsKSB7XG4gICAgICAgICAgICBzaW1wbGVLZXkgPSBTdHJpbmcodmFsKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNpbXBsZUtleSA9IFwiVW5rbm93blwiO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICB9XG4gIHJldHVybiB7IGtleTogc2ltcGxlS2V5LCBtb2RlOiBcImN1cnJlbnRcIiB9O1xufTtcblxuZXhwb3J0IGNvbnN0IGdyb3VwaW5nS2V5ID0gKHRhYjogVGFiTWV0YWRhdGEsIHN0cmF0ZWd5OiBHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gICAgcmV0dXJuIGdldEdyb3VwaW5nUmVzdWx0KHRhYiwgc3RyYXRlZ3kpLmtleTtcbn07XG5cbmZ1bmN0aW9uIGlzQ29udGV4dEZpZWxkKGZpZWxkOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICByZXR1cm4gZmllbGQgPT09ICdjb250ZXh0JyB8fCBmaWVsZCA9PT0gJ2dlbnJlJyB8fCBmaWVsZCA9PT0gJ3NpdGVOYW1lJyB8fCBmaWVsZC5zdGFydHNXaXRoKCdjb250ZXh0RGF0YS4nKTtcbn1cblxuZXhwb3J0IGNvbnN0IHJlcXVpcmVzQ29udGV4dEFuYWx5c2lzID0gKHN0cmF0ZWd5SWRzOiAoc3RyaW5nIHwgU29ydGluZ1N0cmF0ZWd5KVtdKTogYm9vbGVhbiA9PiB7XG4gICAgLy8gQ2hlY2sgaWYgXCJjb250ZXh0XCIgc3RyYXRlZ3kgaXMgZXhwbGljaXRseSByZXF1ZXN0ZWRcbiAgICBpZiAoc3RyYXRlZ3lJZHMuaW5jbHVkZXMoXCJjb250ZXh0XCIpKSByZXR1cm4gdHJ1ZTtcblxuICAgIGNvbnN0IHN0cmF0ZWdpZXMgPSBnZXRTdHJhdGVnaWVzKGN1c3RvbVN0cmF0ZWdpZXMpO1xuICAgIC8vIGZpbHRlciBvbmx5IHRob3NlIHRoYXQgbWF0Y2ggdGhlIHJlcXVlc3RlZCBJRHNcbiAgICBjb25zdCBhY3RpdmVEZWZzID0gc3RyYXRlZ2llcy5maWx0ZXIocyA9PiBzdHJhdGVneUlkcy5pbmNsdWRlcyhzLmlkKSk7XG5cbiAgICBmb3IgKGNvbnN0IGRlZiBvZiBhY3RpdmVEZWZzKSB7XG4gICAgICAgIC8vIElmIGl0J3MgYSBidWlsdC1pbiBzdHJhdGVneSB0aGF0IG5lZWRzIGNvbnRleHQgKG9ubHkgJ2NvbnRleHQnIGRvZXMpXG4gICAgICAgIGlmIChkZWYuaWQgPT09ICdjb250ZXh0JykgcmV0dXJuIHRydWU7XG5cbiAgICAgICAgLy8gSWYgaXQgaXMgYSBjdXN0b20gc3RyYXRlZ3kgKG9yIG92ZXJyaWRlcyBidWlsdC1pbiksIGNoZWNrIGl0cyBydWxlc1xuICAgICAgICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQoYyA9PiBjLmlkID09PSBkZWYuaWQpO1xuICAgICAgICBpZiAoY3VzdG9tKSB7XG4gICAgICAgICAgICAgY29uc3QgZ3JvdXBSdWxlc0xpc3QgPSBhc0FycmF5PEdyb3VwaW5nUnVsZT4oY3VzdG9tLmdyb3VwaW5nUnVsZXMpO1xuICAgICAgICAgICAgIGNvbnN0IHNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihjdXN0b20uc29ydGluZ1J1bGVzKTtcbiAgICAgICAgICAgICBjb25zdCBncm91cFNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihjdXN0b20uZ3JvdXBTb3J0aW5nUnVsZXMpO1xuICAgICAgICAgICAgIGNvbnN0IGZpbHRlcnNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihjdXN0b20uZmlsdGVycyk7XG4gICAgICAgICAgICAgY29uc3QgZmlsdGVyR3JvdXBzTGlzdCA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbltdPihjdXN0b20uZmlsdGVyR3JvdXBzKTtcblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBydWxlLnNvdXJjZSA9PT0gJ2ZpZWxkJyAmJiBpc0NvbnRleHRGaWVsZChydWxlLnZhbHVlKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIHJ1bGUuY29sb3IgPT09ICdmaWVsZCcgJiYgcnVsZS5jb2xvckZpZWxkICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuY29sb3JGaWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBzb3J0UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZ3JvdXBTb3J0UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZmlsdGVyc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgZ3JvdXAgb2YgZmlsdGVyR3JvdXBzTGlzdCkge1xuICAgICAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihncm91cCk7XG4gICAgICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFJ1bGVzKSB7XG4gICAgICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBpc0NvbnRleHRGaWVsZChydWxlLmZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufTtcbiIsICJpbXBvcnQgeyBTb3J0aW5nU3RyYXRlZ3ksIFRhYk1ldGFkYXRhLCBDdXN0b21TdHJhdGVneSwgU29ydGluZ1J1bGUgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBkb21haW5Gcm9tVXJsLCBzZW1hbnRpY0J1Y2tldCwgbmF2aWdhdGlvbktleSwgZ3JvdXBpbmdLZXksIGdldEZpZWxkVmFsdWUsIGdldEN1c3RvbVN0cmF0ZWdpZXMgfSBmcm9tIFwiLi9ncm91cGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tIFwiLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5cbmV4cG9ydCBjb25zdCByZWNlbmN5U2NvcmUgPSAodGFiOiBUYWJNZXRhZGF0YSkgPT4gdGFiLmxhc3RBY2Nlc3NlZCA/PyAwO1xuZXhwb3J0IGNvbnN0IGhpZXJhcmNoeVNjb3JlID0gKHRhYjogVGFiTWV0YWRhdGEpID0+ICh0YWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCA/IDEgOiAwKTtcbmV4cG9ydCBjb25zdCBwaW5uZWRTY29yZSA9ICh0YWI6IFRhYk1ldGFkYXRhKSA9PiAodGFiLnBpbm5lZCA/IDAgOiAxKTtcblxuZXhwb3J0IGNvbnN0IHNvcnRUYWJzID0gKHRhYnM6IFRhYk1ldGFkYXRhW10sIHN0cmF0ZWdpZXM6IFNvcnRpbmdTdHJhdGVneVtdKTogVGFiTWV0YWRhdGFbXSA9PiB7XG4gIGNvbnN0IHNjb3Jpbmc6IFNvcnRpbmdTdHJhdGVneVtdID0gc3RyYXRlZ2llcy5sZW5ndGggPyBzdHJhdGVnaWVzIDogW1wicGlubmVkXCIsIFwicmVjZW5jeVwiXTtcbiAgcmV0dXJuIFsuLi50YWJzXS5zb3J0KChhLCBiKSA9PiB7XG4gICAgZm9yIChjb25zdCBzdHJhdGVneSBvZiBzY29yaW5nKSB7XG4gICAgICBjb25zdCBkaWZmID0gY29tcGFyZUJ5KHN0cmF0ZWd5LCBhLCBiKTtcbiAgICAgIGlmIChkaWZmICE9PSAwKSByZXR1cm4gZGlmZjtcbiAgICB9XG4gICAgcmV0dXJuIGEuaWQgLSBiLmlkO1xuICB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBjb21wYXJlQnkgPSAoc3RyYXRlZ3k6IFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZywgYTogVGFiTWV0YWRhdGEsIGI6IFRhYk1ldGFkYXRhKTogbnVtYmVyID0+IHtcbiAgLy8gMS4gQ2hlY2sgQ3VzdG9tIFN0cmF0ZWdpZXMgZm9yIFNvcnRpbmcgUnVsZXNcbiAgY29uc3QgY3VzdG9tU3RyYXRzID0gZ2V0Q3VzdG9tU3RyYXRlZ2llcygpO1xuICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdHMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5KTtcbiAgaWYgKGN1c3RvbSkge1xuICAgICAgY29uc3Qgc29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KGN1c3RvbS5zb3J0aW5nUnVsZXMpO1xuICAgICAgaWYgKHNvcnRSdWxlc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIC8vIEV2YWx1YXRlIGN1c3RvbSBzb3J0aW5nIHJ1bGVzIGluIG9yZGVyXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIHNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgIGlmICghcnVsZSkgY29udGludWU7XG4gICAgICAgICAgICAgICAgICBjb25zdCB2YWxBID0gZ2V0RmllbGRWYWx1ZShhLCBydWxlLmZpZWxkKTtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IHZhbEIgPSBnZXRGaWVsZFZhbHVlKGIsIHJ1bGUuZmllbGQpO1xuXG4gICAgICAgICAgICAgICAgICBsZXQgcmVzdWx0ID0gMDtcbiAgICAgICAgICAgICAgICAgIGlmICh2YWxBIDwgdmFsQikgcmVzdWx0ID0gLTE7XG4gICAgICAgICAgICAgICAgICBlbHNlIGlmICh2YWxBID4gdmFsQikgcmVzdWx0ID0gMTtcblxuICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdCAhPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBydWxlLm9yZGVyID09PSAnZGVzYycgPyAtcmVzdWx0IDogcmVzdWx0O1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGV2YWx1YXRpbmcgY3VzdG9tIHNvcnRpbmcgcnVsZXNcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBJZiBhbGwgcnVsZXMgZXF1YWwsIGNvbnRpbnVlIHRvIG5leHQgc3RyYXRlZ3kgKHJldHVybiAwKVxuICAgICAgICAgIHJldHVybiAwO1xuICAgICAgfVxuICB9XG5cbiAgLy8gMi4gQnVpbHQtaW4gb3IgZmFsbGJhY2tcbiAgc3dpdGNoIChzdHJhdGVneSkge1xuICAgIGNhc2UgXCJyZWNlbmN5XCI6XG4gICAgICByZXR1cm4gKGIubGFzdEFjY2Vzc2VkID8/IDApIC0gKGEubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgIGNhc2UgXCJuZXN0aW5nXCI6IC8vIEZvcm1lcmx5IGhpZXJhcmNoeVxuICAgICAgcmV0dXJuIGhpZXJhcmNoeVNjb3JlKGEpIC0gaGllcmFyY2h5U2NvcmUoYik7XG4gICAgY2FzZSBcInBpbm5lZFwiOlxuICAgICAgcmV0dXJuIHBpbm5lZFNjb3JlKGEpIC0gcGlubmVkU2NvcmUoYik7XG4gICAgY2FzZSBcInRpdGxlXCI6XG4gICAgICByZXR1cm4gYS50aXRsZS5sb2NhbGVDb21wYXJlKGIudGl0bGUpO1xuICAgIGNhc2UgXCJ1cmxcIjpcbiAgICAgIHJldHVybiBhLnVybC5sb2NhbGVDb21wYXJlKGIudXJsKTtcbiAgICBjYXNlIFwiY29udGV4dFwiOlxuICAgICAgcmV0dXJuIChhLmNvbnRleHQgPz8gXCJcIikubG9jYWxlQ29tcGFyZShiLmNvbnRleHQgPz8gXCJcIik7XG4gICAgY2FzZSBcImRvbWFpblwiOlxuICAgIGNhc2UgXCJkb21haW5fZnVsbFwiOlxuICAgICAgcmV0dXJuIGRvbWFpbkZyb21VcmwoYS51cmwpLmxvY2FsZUNvbXBhcmUoZG9tYWluRnJvbVVybChiLnVybCkpO1xuICAgIGNhc2UgXCJ0b3BpY1wiOlxuICAgICAgcmV0dXJuIHNlbWFudGljQnVja2V0KGEudGl0bGUsIGEudXJsKS5sb2NhbGVDb21wYXJlKHNlbWFudGljQnVja2V0KGIudGl0bGUsIGIudXJsKSk7XG4gICAgY2FzZSBcImxpbmVhZ2VcIjpcbiAgICAgIHJldHVybiBuYXZpZ2F0aW9uS2V5KGEpLmxvY2FsZUNvbXBhcmUobmF2aWdhdGlvbktleShiKSk7XG4gICAgY2FzZSBcImFnZVwiOlxuICAgICAgLy8gUmV2ZXJzZSBhbHBoYWJldGljYWwgZm9yIGFnZSBidWNrZXRzIChUb2RheSA8IFllc3RlcmRheSksIHJvdWdoIGFwcHJveFxuICAgICAgcmV0dXJuIChncm91cGluZ0tleShhLCBcImFnZVwiKSB8fCBcIlwiKS5sb2NhbGVDb21wYXJlKGdyb3VwaW5nS2V5KGIsIFwiYWdlXCIpIHx8IFwiXCIpO1xuICAgIGRlZmF1bHQ6XG4gICAgICAvLyBDaGVjayBpZiBpdCdzIGEgZ2VuZXJpYyBmaWVsZCBmaXJzdFxuICAgICAgY29uc3QgdmFsQSA9IGdldEZpZWxkVmFsdWUoYSwgc3RyYXRlZ3kpO1xuICAgICAgY29uc3QgdmFsQiA9IGdldEZpZWxkVmFsdWUoYiwgc3RyYXRlZ3kpO1xuXG4gICAgICBpZiAodmFsQSAhPT0gdW5kZWZpbmVkICYmIHZhbEIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGlmICh2YWxBIDwgdmFsQikgcmV0dXJuIC0xO1xuICAgICAgICAgIGlmICh2YWxBID4gdmFsQikgcmV0dXJuIDE7XG4gICAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9XG5cbiAgICAgIC8vIEZhbGxiYWNrIGZvciBjdXN0b20gc3RyYXRlZ2llcyBncm91cGluZyBrZXkgKGlmIHVzaW5nIGN1c3RvbSBzdHJhdGVneSBhcyBzb3J0aW5nIGJ1dCBubyBzb3J0aW5nIHJ1bGVzIGRlZmluZWQpXG4gICAgICAvLyBvciB1bmhhbmRsZWQgYnVpbHQtaW5zXG4gICAgICByZXR1cm4gKGdyb3VwaW5nS2V5KGEsIHN0cmF0ZWd5KSB8fCBcIlwiKS5sb2NhbGVDb21wYXJlKGdyb3VwaW5nS2V5KGIsIHN0cmF0ZWd5KSB8fCBcIlwiKTtcbiAgfVxufTtcbiIsICIvLyBsb2dpYy50c1xuLy8gUHVyZSBmdW5jdGlvbnMgZm9yIGV4dHJhY3Rpb24gbG9naWNcblxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZVVybCh1cmxTdHI6IHN0cmluZyk6IHN0cmluZyB7XG4gIHRyeSB7XG4gICAgY29uc3QgdXJsID0gbmV3IFVSTCh1cmxTdHIpO1xuICAgIGNvbnN0IHBhcmFtcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXModXJsLnNlYXJjaCk7XG4gICAgY29uc3Qga2V5czogc3RyaW5nW10gPSBbXTtcbiAgICBwYXJhbXMuZm9yRWFjaCgoXywga2V5KSA9PiBrZXlzLnB1c2goa2V5KSk7XG4gICAgY29uc3QgaG9zdG5hbWUgPSB1cmwuaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sICcnKTtcblxuICAgIGNvbnN0IFRSQUNLSU5HID0gWy9edXRtXy8sIC9eZmJjbGlkJC8sIC9eZ2NsaWQkLywgL15fZ2EkLywgL15yZWYkLywgL155Y2xpZCQvLCAvXl9ocy9dO1xuICAgIGNvbnN0IGlzWW91dHViZSA9IGhvc3RuYW1lLmVuZHNXaXRoKCd5b3V0dWJlLmNvbScpIHx8IGhvc3RuYW1lLmVuZHNXaXRoKCd5b3V0dS5iZScpO1xuICAgIGNvbnN0IGlzR29vZ2xlID0gaG9zdG5hbWUuZW5kc1dpdGgoJ2dvb2dsZS5jb20nKTtcblxuICAgIGNvbnN0IGtlZXA6IHN0cmluZ1tdID0gW107XG4gICAgaWYgKGlzWW91dHViZSkga2VlcC5wdXNoKCd2JywgJ2xpc3QnLCAndCcsICdjJywgJ2NoYW5uZWwnLCAncGxheWxpc3QnKTtcbiAgICBpZiAoaXNHb29nbGUpIGtlZXAucHVzaCgncScsICdpZCcsICdzb3VyY2VpZCcpO1xuXG4gICAgZm9yIChjb25zdCBrZXkgb2Yga2V5cykge1xuICAgICAgaWYgKFRSQUNLSU5HLnNvbWUociA9PiByLnRlc3Qoa2V5KSkpIHtcbiAgICAgICAgIHBhcmFtcy5kZWxldGUoa2V5KTtcbiAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKChpc1lvdXR1YmUgfHwgaXNHb29nbGUpICYmICFrZWVwLmluY2x1ZGVzKGtleSkpIHtcbiAgICAgICAgIHBhcmFtcy5kZWxldGUoa2V5KTtcbiAgICAgIH1cbiAgICB9XG4gICAgdXJsLnNlYXJjaCA9IHBhcmFtcy50b1N0cmluZygpO1xuICAgIHJldHVybiB1cmwudG9TdHJpbmcoKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIHJldHVybiB1cmxTdHI7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlWW91VHViZVVybCh1cmxTdHI6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHVybCA9IG5ldyBVUkwodXJsU3RyKTtcbiAgICAgICAgY29uc3QgdiA9IHVybC5zZWFyY2hQYXJhbXMuZ2V0KCd2Jyk7XG4gICAgICAgIGNvbnN0IGlzU2hvcnRzID0gdXJsLnBhdGhuYW1lLmluY2x1ZGVzKCcvc2hvcnRzLycpO1xuICAgICAgICBsZXQgdmlkZW9JZCA9XG4gICAgICAgICAgdiB8fFxuICAgICAgICAgIChpc1Nob3J0cyA/IHVybC5wYXRobmFtZS5zcGxpdCgnL3Nob3J0cy8nKVsxXSA6IG51bGwpIHx8XG4gICAgICAgICAgKHVybC5ob3N0bmFtZSA9PT0gJ3lvdXR1LmJlJyA/IHVybC5wYXRobmFtZS5yZXBsYWNlKCcvJywgJycpIDogbnVsbCk7XG5cbiAgICAgICAgY29uc3QgcGxheWxpc3RJZCA9IHVybC5zZWFyY2hQYXJhbXMuZ2V0KCdsaXN0Jyk7XG4gICAgICAgIGNvbnN0IHBsYXlsaXN0SW5kZXggPSBwYXJzZUludCh1cmwuc2VhcmNoUGFyYW1zLmdldCgnaW5kZXgnKSB8fCAnMCcsIDEwKTtcblxuICAgICAgICByZXR1cm4geyB2aWRlb0lkLCBpc1Nob3J0cywgcGxheWxpc3RJZCwgcGxheWxpc3RJbmRleCB9O1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcmV0dXJuIHsgdmlkZW9JZDogbnVsbCwgaXNTaG9ydHM6IGZhbHNlLCBwbGF5bGlzdElkOiBudWxsLCBwbGF5bGlzdEluZGV4OiBudWxsIH07XG4gICAgfVxufVxuXG5mdW5jdGlvbiBleHRyYWN0QXV0aG9yKGVudGl0eTogYW55KTogc3RyaW5nIHwgbnVsbCB7XG4gICAgaWYgKCFlbnRpdHkgfHwgIWVudGl0eS5hdXRob3IpIHJldHVybiBudWxsO1xuICAgIGlmICh0eXBlb2YgZW50aXR5LmF1dGhvciA9PT0gJ3N0cmluZycpIHJldHVybiBlbnRpdHkuYXV0aG9yO1xuICAgIGlmIChBcnJheS5pc0FycmF5KGVudGl0eS5hdXRob3IpKSByZXR1cm4gZW50aXR5LmF1dGhvclswXT8ubmFtZSB8fCBudWxsO1xuICAgIGlmICh0eXBlb2YgZW50aXR5LmF1dGhvciA9PT0gJ29iamVjdCcpIHJldHVybiBlbnRpdHkuYXV0aG9yLm5hbWUgfHwgbnVsbDtcbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gZXh0cmFjdEtleXdvcmRzKGVudGl0eTogYW55KTogc3RyaW5nW10ge1xuICAgIGlmICghZW50aXR5IHx8ICFlbnRpdHkua2V5d29yZHMpIHJldHVybiBbXTtcbiAgICBpZiAodHlwZW9mIGVudGl0eS5rZXl3b3JkcyA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmV0dXJuIGVudGl0eS5rZXl3b3Jkcy5zcGxpdCgnLCcpLm1hcCgoczogc3RyaW5nKSA9PiBzLnRyaW0oKSk7XG4gICAgfVxuICAgIGlmIChBcnJheS5pc0FycmF5KGVudGl0eS5rZXl3b3JkcykpIHJldHVybiBlbnRpdHkua2V5d29yZHM7XG4gICAgcmV0dXJuIFtdO1xufVxuXG5mdW5jdGlvbiBleHRyYWN0QnJlYWRjcnVtYnMoanNvbkxkOiBhbnlbXSk6IHN0cmluZ1tdIHtcbiAgICBjb25zdCBicmVhZGNydW1iTGQgPSBqc29uTGQuZmluZChpID0+IGkgJiYgaVsnQHR5cGUnXSA9PT0gJ0JyZWFkY3J1bWJMaXN0Jyk7XG4gICAgaWYgKCFicmVhZGNydW1iTGQgfHwgIUFycmF5LmlzQXJyYXkoYnJlYWRjcnVtYkxkLml0ZW1MaXN0RWxlbWVudCkpIHJldHVybiBbXTtcblxuICAgIGNvbnN0IGxpc3QgPSBicmVhZGNydW1iTGQuaXRlbUxpc3RFbGVtZW50LnNvcnQoKGE6IGFueSwgYjogYW55KSA9PiAoYS5wb3NpdGlvbiB8fCAwKSAtIChiLnBvc2l0aW9uIHx8IDApKTtcbiAgICBjb25zdCBicmVhZGNydW1iczogc3RyaW5nW10gPSBbXTtcbiAgICBsaXN0LmZvckVhY2goKGl0ZW06IGFueSkgPT4ge1xuICAgICAgICBpZiAoaXRlbS5uYW1lKSBicmVhZGNydW1icy5wdXNoKGl0ZW0ubmFtZSk7XG4gICAgICAgIGVsc2UgaWYgKGl0ZW0uaXRlbSAmJiBpdGVtLml0ZW0ubmFtZSkgYnJlYWRjcnVtYnMucHVzaChpdGVtLml0ZW0ubmFtZSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIGJyZWFkY3J1bWJzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXh0cmFjdEpzb25MZEZpZWxkcyhqc29uTGQ6IGFueVtdKSB7XG4gICAgLy8gRmluZCBtYWluIGVudGl0eVxuICAgIC8vIEFkZGVkIHNhZmV0eSBjaGVjazogaSAmJiBpWydAdHlwZSddXG4gICAgY29uc3QgbWFpbkVudGl0eSA9IGpzb25MZC5maW5kKGkgPT4gaSAmJiAoaVsnQHR5cGUnXSA9PT0gJ0FydGljbGUnIHx8IGlbJ0B0eXBlJ10gPT09ICdWaWRlb09iamVjdCcgfHwgaVsnQHR5cGUnXSA9PT0gJ05ld3NBcnRpY2xlJykpIHx8IGpzb25MZFswXTtcblxuICAgIGxldCBhdXRob3I6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgIGxldCBwdWJsaXNoZWRBdDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgbGV0IG1vZGlmaWVkQXQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgIGxldCB0YWdzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgaWYgKG1haW5FbnRpdHkpIHtcbiAgICAgICAgYXV0aG9yID0gZXh0cmFjdEF1dGhvcihtYWluRW50aXR5KTtcbiAgICAgICAgcHVibGlzaGVkQXQgPSBtYWluRW50aXR5LmRhdGVQdWJsaXNoZWQgfHwgbnVsbDtcbiAgICAgICAgbW9kaWZpZWRBdCA9IG1haW5FbnRpdHkuZGF0ZU1vZGlmaWVkIHx8IG51bGw7XG4gICAgICAgIHRhZ3MgPSBleHRyYWN0S2V5d29yZHMobWFpbkVudGl0eSk7XG4gICAgfVxuXG4gICAgY29uc3QgYnJlYWRjcnVtYnMgPSBleHRyYWN0QnJlYWRjcnVtYnMoanNvbkxkKTtcblxuICAgIHJldHVybiB7IGF1dGhvciwgcHVibGlzaGVkQXQsIG1vZGlmaWVkQXQsIHRhZ3MsIGJyZWFkY3J1bWJzIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0WW91VHViZUNoYW5uZWxGcm9tSHRtbChodG1sOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcbiAgLy8gMS4gVHJ5IEpTT04tTERcbiAgLy8gTG9vayBmb3IgPHNjcmlwdCB0eXBlPVwiYXBwbGljYXRpb24vbGQranNvblwiPi4uLjwvc2NyaXB0PlxuICAvLyBXZSBuZWVkIHRvIGxvb3AgYmVjYXVzZSB0aGVyZSBtaWdodCBiZSBtdWx0aXBsZSBzY3JpcHRzXG4gIGNvbnN0IHNjcmlwdFJlZ2V4ID0gLzxzY3JpcHRcXHMrdHlwZT1bXCInXWFwcGxpY2F0aW9uXFwvbGRcXCtqc29uW1wiJ11bXj5dKj4oW1xcc1xcU10qPyk8XFwvc2NyaXB0Pi9naTtcbiAgbGV0IG1hdGNoO1xuICB3aGlsZSAoKG1hdGNoID0gc2NyaXB0UmVnZXguZXhlYyhodG1sKSkgIT09IG51bGwpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QganNvbiA9IEpTT04ucGFyc2UobWF0Y2hbMV0pO1xuICAgICAgICAgIGNvbnN0IGFycmF5ID0gQXJyYXkuaXNBcnJheShqc29uKSA/IGpzb24gOiBbanNvbl07XG4gICAgICAgICAgY29uc3QgZmllbGRzID0gZXh0cmFjdEpzb25MZEZpZWxkcyhhcnJheSk7XG4gICAgICAgICAgaWYgKGZpZWxkcy5hdXRob3IpIHJldHVybiBmaWVsZHMuYXV0aG9yO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIC8vIGlnbm9yZSBwYXJzZSBlcnJvcnNcbiAgICAgIH1cbiAgfVxuXG4gIC8vIDIuIFRyeSA8bGluayBpdGVtcHJvcD1cIm5hbWVcIiBjb250ZW50PVwiLi4uXCI+IChZb3VUdWJlIG9mdGVuIHB1dHMgY2hhbm5lbCBuYW1lIGhlcmUgaW4gc29tZSBjb250ZXh0cylcbiAgLy8gT3IgPG1ldGEgaXRlbXByb3A9XCJjaGFubmVsSWRcIiBjb250ZW50PVwiLi4uXCI+IC0+IGJ1dCB0aGF0J3MgSUQuXG4gIC8vIDxsaW5rIGl0ZW1wcm9wPVwibmFtZVwiIGNvbnRlbnQ9XCJDaGFubmVsIE5hbWVcIj5cbiAgLy8gPHNwYW4gaXRlbXByb3A9XCJhdXRob3JcIiBpdGVtc2NvcGUgaXRlbXR5cGU9XCJodHRwOi8vc2NoZW1hLm9yZy9QZXJzb25cIj48bGluayBpdGVtcHJvcD1cIm5hbWVcIiBjb250ZW50PVwiQ2hhbm5lbCBOYW1lXCI+PC9zcGFuPlxuICBjb25zdCBsaW5rTmFtZVJlZ2V4ID0gLzxsaW5rXFxzK2l0ZW1wcm9wPVtcIiddbmFtZVtcIiddXFxzK2NvbnRlbnQ9W1wiJ10oW15cIiddKylbXCInXVxccypcXC8/Pi9pO1xuICBjb25zdCBsaW5rTWF0Y2ggPSBsaW5rTmFtZVJlZ2V4LmV4ZWMoaHRtbCk7XG4gIGlmIChsaW5rTWF0Y2ggJiYgbGlua01hdGNoWzFdKSByZXR1cm4gZGVjb2RlSHRtbEVudGl0aWVzKGxpbmtNYXRjaFsxXSk7XG5cbiAgLy8gMy4gVHJ5IG1ldGEgYXV0aG9yXG4gIGNvbnN0IG1ldGFBdXRob3JSZWdleCA9IC88bWV0YVxccytuYW1lPVtcIiddYXV0aG9yW1wiJ11cXHMrY29udGVudD1bXCInXShbXlwiJ10rKVtcIiddXFxzKlxcLz8+L2k7XG4gIGNvbnN0IG1ldGFNYXRjaCA9IG1ldGFBdXRob3JSZWdleC5leGVjKGh0bWwpO1xuICBpZiAobWV0YU1hdGNoICYmIG1ldGFNYXRjaFsxXSkge1xuICAgICAgLy8gWW91VHViZSBtZXRhIGF1dGhvciBpcyBvZnRlbiBcIkNoYW5uZWwgTmFtZVwiXG4gICAgICByZXR1cm4gZGVjb2RlSHRtbEVudGl0aWVzKG1ldGFNYXRjaFsxXSk7XG4gIH1cblxuICByZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RZb3VUdWJlR2VucmVGcm9tSHRtbChodG1sOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcbiAgLy8gMS4gVHJ5IDxtZXRhIGl0ZW1wcm9wPVwiZ2VucmVcIiBjb250ZW50PVwiLi4uXCI+XG4gIGNvbnN0IG1ldGFHZW5yZVJlZ2V4ID0gLzxtZXRhXFxzK2l0ZW1wcm9wPVtcIiddZ2VucmVbXCInXVxccytjb250ZW50PVtcIiddKFteXCInXSspW1wiJ11cXHMqXFwvPz4vaTtcbiAgY29uc3QgbWV0YU1hdGNoID0gbWV0YUdlbnJlUmVnZXguZXhlYyhodG1sKTtcbiAgaWYgKG1ldGFNYXRjaCAmJiBtZXRhTWF0Y2hbMV0pIHtcbiAgICAgIHJldHVybiBkZWNvZGVIdG1sRW50aXRpZXMobWV0YU1hdGNoWzFdKTtcbiAgfVxuXG4gIC8vIDIuIFRyeSBKU09OIFwiY2F0ZWdvcnlcIiBpbiBzY3JpcHRzXG4gIC8vIFwiY2F0ZWdvcnlcIjpcIkdhbWluZ1wiXG4gIGNvbnN0IGNhdGVnb3J5UmVnZXggPSAvXCJjYXRlZ29yeVwiXFxzKjpcXHMqXCIoW15cIl0rKVwiLztcbiAgY29uc3QgY2F0TWF0Y2ggPSBjYXRlZ29yeVJlZ2V4LmV4ZWMoaHRtbCk7XG4gIGlmIChjYXRNYXRjaCAmJiBjYXRNYXRjaFsxXSkge1xuICAgICAgcmV0dXJuIGRlY29kZUh0bWxFbnRpdGllcyhjYXRNYXRjaFsxXSk7XG4gIH1cblxuICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gZGVjb2RlSHRtbEVudGl0aWVzKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGlmICghdGV4dCkgcmV0dXJuIHRleHQ7XG5cbiAgY29uc3QgZW50aXRpZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgJyZhbXA7JzogJyYnLFxuICAgICcmbHQ7JzogJzwnLFxuICAgICcmZ3Q7JzogJz4nLFxuICAgICcmcXVvdDsnOiAnXCInLFxuICAgICcmIzM5Oyc6IFwiJ1wiLFxuICAgICcmYXBvczsnOiBcIidcIixcbiAgICAnJm5ic3A7JzogJyAnXG4gIH07XG5cbiAgcmV0dXJuIHRleHQucmVwbGFjZSgvJihbYS16MC05XSt8I1swLTldezEsNn18I3hbMC05YS1mQS1GXXsxLDZ9KTsvaWcsIChtYXRjaCkgPT4ge1xuICAgICAgY29uc3QgbG93ZXIgPSBtYXRjaC50b0xvd2VyQ2FzZSgpO1xuICAgICAgaWYgKGVudGl0aWVzW2xvd2VyXSkgcmV0dXJuIGVudGl0aWVzW2xvd2VyXTtcbiAgICAgIGlmIChlbnRpdGllc1ttYXRjaF0pIHJldHVybiBlbnRpdGllc1ttYXRjaF07XG5cbiAgICAgIGlmIChsb3dlci5zdGFydHNXaXRoKCcmI3gnKSkge1xuICAgICAgICAgIHRyeSB7IHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlKHBhcnNlSW50KGxvd2VyLnNsaWNlKDMsIC0xKSwgMTYpKTsgfSBjYXRjaCB7IHJldHVybiBtYXRjaDsgfVxuICAgICAgfVxuICAgICAgaWYgKGxvd2VyLnN0YXJ0c1dpdGgoJyYjJykpIHtcbiAgICAgICAgICB0cnkgeyByZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZShwYXJzZUludChsb3dlci5zbGljZSgyLCAtMSksIDEwKSk7IH0gY2F0Y2ggeyByZXR1cm4gbWF0Y2g7IH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBtYXRjaDtcbiAgfSk7XG59XG4iLCAie1xuICBcIkFJXCI6IFtcbiAgICBcImFudGhyb3BpYy5jb21cIixcbiAgICBcImJhcmQuZ29vZ2xlLmNvbVwiLFxuICAgIFwiY2hhdGdwdC5jb21cIixcbiAgICBcImNsYXVkZS5haVwiLFxuICAgIFwiZ2VtaW5pLmdvb2dsZS5jb21cIixcbiAgICBcImh1Z2dpbmdmYWNlLmNvXCIsXG4gICAgXCJtaWRqb3VybmV5LmNvbVwiLFxuICAgIFwib3BlbmFpLmNvbVwiLFxuICAgIFwicGVycGxleGl0eS5haVwiLFxuICAgIFwicG9lLmNvbVwiXG4gIF0sXG4gIFwiQ29tbXVuaWNhdGlvblwiOiBbXG4gICAgXCJkaXNjb3JkLmNvbVwiLFxuICAgIFwibWFpbC5nb29nbGUuY29tXCIsXG4gICAgXCJtZXNzZW5nZXIuY29tXCIsXG4gICAgXCJvdXRsb29rLmxpdmUuY29tXCIsXG4gICAgXCJza3lwZS5jb21cIixcbiAgICBcInNsYWNrLmNvbVwiLFxuICAgIFwidGVhbXMubWljcm9zb2Z0LmNvbVwiLFxuICAgIFwidGVsZWdyYW0ub3JnXCIsXG4gICAgXCJ3aGF0c2FwcC5jb21cIixcbiAgICBcInpvb20udXNcIlxuICBdLFxuICBcIkRlc2lnblwiOiBbXG4gICAgXCJhZG9iZS5jb21cIixcbiAgICBcImJlaGFuY2UubmV0XCIsXG4gICAgXCJjYW52YS5jb21cIixcbiAgICBcImRyaWJiYmxlLmNvbVwiLFxuICAgIFwiZmlnbWEuY29tXCIsXG4gICAgXCJwZXhlbHMuY29tXCIsXG4gICAgXCJwaXhhYmF5LmNvbVwiLFxuICAgIFwic2h1dHRlcnN0b2NrLmNvbVwiLFxuICAgIFwidW5zcGxhc2guY29tXCJcbiAgXSxcbiAgXCJEZXZlbG9wbWVudFwiOiBbXG4gICAgXCJhdGxhc3NpYW4ubmV0XCIsXG4gICAgXCJhd3MuYW1hem9uLmNvbVwiLFxuICAgIFwiYXp1cmUubWljcm9zb2Z0LmNvbVwiLFxuICAgIFwiYml0YnVja2V0Lm9yZ1wiLFxuICAgIFwiY2xvdWQuZ29vZ2xlLmNvbVwiLFxuICAgIFwiY29uc29sZS5hd3MuYW1hem9uLmNvbVwiLFxuICAgIFwiZGV2LnRvXCIsXG4gICAgXCJkZXZlbG9wZXIubW96aWxsYS5vcmdcIixcbiAgICBcImRvY2tlci5jb21cIixcbiAgICBcImdlZWtzZm9yZ2Vla3Mub3JnXCIsXG4gICAgXCJnaXRodWIuY29tXCIsXG4gICAgXCJnaXRsYWIuY29tXCIsXG4gICAgXCJoYXNobm9kZS5jb21cIixcbiAgICBcImhlcm9rdS5jb21cIixcbiAgICBcImppcmEuY29tXCIsXG4gICAgXCJrdWJlcm5ldGVzLmlvXCIsXG4gICAgXCJtZWRpdW0uY29tXCIsXG4gICAgXCJuZXRsaWZ5LmNvbVwiLFxuICAgIFwibnBtanMuY29tXCIsXG4gICAgXCJwb3J0YWwuYXp1cmUuY29tXCIsXG4gICAgXCJweXBpLm9yZ1wiLFxuICAgIFwic3RhY2tvdmVyZmxvdy5jb21cIixcbiAgICBcInZlcmNlbC5jb21cIixcbiAgICBcInczc2Nob29scy5jb21cIlxuICBdLFxuICBcIkVkdWNhdGlvblwiOiBbXG4gICAgXCJhY2FkZW1pYS5lZHVcIixcbiAgICBcImJsYWNrYm9hcmQuY29tXCIsXG4gICAgXCJjYW52YXMuaW5zdHJ1Y3R1cmUuY29tXCIsXG4gICAgXCJjb3Vyc2VyYS5vcmdcIixcbiAgICBcImR1b2xpbmdvLmNvbVwiLFxuICAgIFwiZWR4Lm9yZ1wiLFxuICAgIFwiaGFydmFyZC5lZHVcIixcbiAgICBcImtoYW5hY2FkZW15Lm9yZ1wiLFxuICAgIFwibWl0LmVkdVwiLFxuICAgIFwicXVpemxldC5jb21cIixcbiAgICBcInJlc2VhcmNoZ2F0ZS5uZXRcIixcbiAgICBcInN0YW5mb3JkLmVkdVwiLFxuICAgIFwidWRlbXkuY29tXCIsXG4gICAgXCJ3aWtpcGVkaWEub3JnXCJcbiAgXSxcbiAgXCJGaW5hbmNlXCI6IFtcbiAgICBcImFtZXJpY2FuZXhwcmVzcy5jb21cIixcbiAgICBcImJhbmtvZmFtZXJpY2EuY29tXCIsXG4gICAgXCJiaW5hbmNlLmNvbVwiLFxuICAgIFwiY2hhc2UuY29tXCIsXG4gICAgXCJjb2luYmFzZS5jb21cIixcbiAgICBcImZpZGVsaXR5LmNvbVwiLFxuICAgIFwia3Jha2VuLmNvbVwiLFxuICAgIFwibWludC5pbnR1aXQuY29tXCIsXG4gICAgXCJwYXlwYWwuY29tXCIsXG4gICAgXCJyb2Jpbmhvb2QuY29tXCIsXG4gICAgXCJzY2h3YWIuY29tXCIsXG4gICAgXCJzdHJpcGUuY29tXCIsXG4gICAgXCJ2YW5ndWFyZC5jb21cIixcbiAgICBcIndlbGxzZmFyZ28uY29tXCJcbiAgXSxcbiAgXCJHYW1pbmdcIjogW1xuICAgIFwiZXBpY2dhbWVzLmNvbVwiLFxuICAgIFwiZ2FtZXNwb3QuY29tXCIsXG4gICAgXCJpZ24uY29tXCIsXG4gICAgXCJrb3Rha3UuY29tXCIsXG4gICAgXCJuaW50ZW5kby5jb21cIixcbiAgICBcInBsYXlzdGF0aW9uLmNvbVwiLFxuICAgIFwicG9seWdvbi5jb21cIixcbiAgICBcInJvYmxveC5jb21cIixcbiAgICBcInN0ZWFtcG93ZXJlZC5jb21cIixcbiAgICBcInhib3guY29tXCJcbiAgXSxcbiAgXCJNdXNpY1wiOiBbXG4gICAgXCJhdWRpYmxlLmNvbVwiLFxuICAgIFwiYmFuZGNhbXAuY29tXCIsXG4gICAgXCJtdXNpYy5hcHBsZS5jb21cIixcbiAgICBcInBhbmRvcmEuY29tXCIsXG4gICAgXCJzb3VuZGNsb3VkLmNvbVwiLFxuICAgIFwic3BvdGlmeS5jb21cIixcbiAgICBcInRpZGFsLmNvbVwiXG4gIF0sXG4gIFwiTmV3c1wiOiBbXG4gICAgXCJhYmNuZXdzLmdvLmNvbVwiLFxuICAgIFwiYmJjLmNvbVwiLFxuICAgIFwiYmxvb21iZXJnLmNvbVwiLFxuICAgIFwiY25iYy5jb21cIixcbiAgICBcImNubi5jb21cIixcbiAgICBcImZvcmJlcy5jb21cIixcbiAgICBcImZveG5ld3MuY29tXCIsXG4gICAgXCJodWZmcG9zdC5jb21cIixcbiAgICBcIm5iY25ld3MuY29tXCIsXG4gICAgXCJuZXdzLmdvb2dsZS5jb21cIixcbiAgICBcIm55dGltZXMuY29tXCIsXG4gICAgXCJyZXV0ZXJzLmNvbVwiLFxuICAgIFwidGhlZ3VhcmRpYW4uY29tXCIsXG4gICAgXCJ1c2F0b2RheS5jb21cIixcbiAgICBcIndhc2hpbmd0b25wb3N0LmNvbVwiLFxuICAgIFwid3NqLmNvbVwiXG4gIF0sXG4gIFwiUHJvZHVjdGl2aXR5XCI6IFtcbiAgICBcImFpcnRhYmxlLmNvbVwiLFxuICAgIFwiYXNhbmEuY29tXCIsXG4gICAgXCJjbGlja3VwLmNvbVwiLFxuICAgIFwiZG9jcy5nb29nbGUuY29tXCIsXG4gICAgXCJkcml2ZS5nb29nbGUuY29tXCIsXG4gICAgXCJkcm9wYm94LmNvbVwiLFxuICAgIFwiZXZlcm5vdGUuY29tXCIsXG4gICAgXCJsaW5lYXIuYXBwXCIsXG4gICAgXCJsdWNpZGNoYXJ0LmNvbVwiLFxuICAgIFwibWlyby5jb21cIixcbiAgICBcIm1vbmRheS5jb21cIixcbiAgICBcIm5vdGlvbi5zb1wiLFxuICAgIFwic2hlZXRzLmdvb2dsZS5jb21cIixcbiAgICBcInNsaWRlcy5nb29nbGUuY29tXCIsXG4gICAgXCJ0cmVsbG8uY29tXCJcbiAgXSxcbiAgXCJTZWFyY2hcIjogW1xuICAgIFwiYmFpZHUuY29tXCIsXG4gICAgXCJiaW5nLmNvbVwiLFxuICAgIFwiZHVja2R1Y2tnby5jb21cIixcbiAgICBcImVjb3NpYS5vcmdcIixcbiAgICBcImdvb2dsZS5jb21cIixcbiAgICBcImthZ2kuY29tXCIsXG4gICAgXCJ5YWhvby5jb21cIixcbiAgICBcInlhbmRleC5jb21cIlxuICBdLFxuICBcIlNob3BwaW5nXCI6IFtcbiAgICBcImFsaWV4cHJlc3MuY29tXCIsXG4gICAgXCJhbWF6b24uY29tXCIsXG4gICAgXCJiZXN0YnV5LmNvbVwiLFxuICAgIFwiY29zdGNvLmNvbVwiLFxuICAgIFwiZWJheS5jb21cIixcbiAgICBcImV0c3kuY29tXCIsXG4gICAgXCJzaGVpbi5jb21cIixcbiAgICBcInNob3BpZnkuY29tXCIsXG4gICAgXCJ0YXJnZXQuY29tXCIsXG4gICAgXCJ0ZW11LmNvbVwiLFxuICAgIFwid2FsbWFydC5jb21cIixcbiAgICBcIndheWZhaXIuY29tXCJcbiAgXSxcbiAgXCJTb2NpYWxcIjogW1xuICAgIFwiYmx1ZXNreS5hcHBcIixcbiAgICBcImZhY2Vib29rLmNvbVwiLFxuICAgIFwiaW5zdGFncmFtLmNvbVwiLFxuICAgIFwibGlua2VkaW4uY29tXCIsXG4gICAgXCJtYXN0b2Rvbi5zb2NpYWxcIixcbiAgICBcInBpbnRlcmVzdC5jb21cIixcbiAgICBcInJlZGRpdC5jb21cIixcbiAgICBcInNuYXBjaGF0LmNvbVwiLFxuICAgIFwidGhyZWFkcy5uZXRcIixcbiAgICBcInRpa3Rvay5jb21cIixcbiAgICBcInR1bWJsci5jb21cIixcbiAgICBcInR3aXR0ZXIuY29tXCIsXG4gICAgXCJ4LmNvbVwiXG4gIF0sXG4gIFwiVmlkZW9cIjogW1xuICAgIFwiZGFpbHltb3Rpb24uY29tXCIsXG4gICAgXCJkaXNuZXlwbHVzLmNvbVwiLFxuICAgIFwiaGJvbWF4LmNvbVwiLFxuICAgIFwiaHVsdS5jb21cIixcbiAgICBcIm1heC5jb21cIixcbiAgICBcIm5ldGZsaXguY29tXCIsXG4gICAgXCJwZWFjb2NrdHYuY29tXCIsXG4gICAgXCJwcmltZXZpZGVvLmNvbVwiLFxuICAgIFwidHdpdGNoLnR2XCIsXG4gICAgXCJ2aW1lby5jb21cIixcbiAgICBcInlvdXR1LmJlXCIsXG4gICAgXCJ5b3V0dWJlLmNvbVwiXG4gIF1cbn0iLCAiaW1wb3J0IHJlZ2lzdHJ5RGF0YSBmcm9tICcuL2dlbmVyYVJlZ2lzdHJ5Lmpzb24nO1xuXG4vLyBGbGF0dGVuIHRoZSBncm91cGVkIHJlZ2lzdHJ5IGludG8gYSBzaW5nbGUgbWFwXG5jb25zdCByZWdpc3RyeTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuZm9yIChjb25zdCBbY2F0ZWdvcnksIGRvbWFpbnNdIG9mIE9iamVjdC5lbnRyaWVzKHJlZ2lzdHJ5RGF0YSkpIHtcbiAgICBmb3IgKGNvbnN0IGRvbWFpbiBvZiBkb21haW5zKSB7XG4gICAgICAgIHJlZ2lzdHJ5W2RvbWFpbl0gPSBjYXRlZ29yeTtcbiAgICB9XG59XG5cbmV4cG9ydCBjb25zdCBHRU5FUkFfUkVHSVNUUlkgPSByZWdpc3RyeTtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldEdlbmVyYShob3N0bmFtZTogc3RyaW5nLCBjdXN0b21SZWdpc3RyeT86IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pOiBzdHJpbmcgfCBudWxsIHtcbiAgaWYgKCFob3N0bmFtZSkgcmV0dXJuIG51bGw7XG5cbiAgLy8gMC4gQ2hlY2sgY3VzdG9tIHJlZ2lzdHJ5IGZpcnN0XG4gIGlmIChjdXN0b21SZWdpc3RyeSkge1xuICAgICAgY29uc3QgcGFydHMgPSBob3N0bmFtZS5zcGxpdCgnLicpO1xuICAgICAgLy8gQ2hlY2sgZnVsbCBob3N0bmFtZSBhbmQgcHJvZ3Jlc3NpdmVseSBzaG9ydGVyIHN1ZmZpeGVzXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHBhcnRzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgICAgIGNvbnN0IGRvbWFpbiA9IHBhcnRzLnNsaWNlKGkpLmpvaW4oJy4nKTtcbiAgICAgICAgICBpZiAoY3VzdG9tUmVnaXN0cnlbZG9tYWluXSkge1xuICAgICAgICAgICAgICByZXR1cm4gY3VzdG9tUmVnaXN0cnlbZG9tYWluXTtcbiAgICAgICAgICB9XG4gICAgICB9XG4gIH1cblxuICAvLyAxLiBFeGFjdCBtYXRjaFxuICBpZiAoR0VORVJBX1JFR0lTVFJZW2hvc3RuYW1lXSkge1xuICAgIHJldHVybiBHRU5FUkFfUkVHSVNUUllbaG9zdG5hbWVdO1xuICB9XG5cbiAgLy8gMi4gU3ViZG9tYWluIGNoZWNrIChzdHJpcHBpbmcgc3ViZG9tYWlucylcbiAgLy8gZS5nLiBcImNvbnNvbGUuYXdzLmFtYXpvbi5jb21cIiAtPiBcImF3cy5hbWF6b24uY29tXCIgLT4gXCJhbWF6b24uY29tXCJcbiAgY29uc3QgcGFydHMgPSBob3N0bmFtZS5zcGxpdCgnLicpO1xuXG4gIC8vIFRyeSBtYXRjaGluZyBwcm9ncmVzc2l2ZWx5IHNob3J0ZXIgc3VmZml4ZXNcbiAgLy8gZS5nLiBhLmIuYy5jb20gLT4gYi5jLmNvbSAtPiBjLmNvbVxuICBmb3IgKGxldCBpID0gMDsgaSA8IHBhcnRzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgY29uc3QgZG9tYWluID0gcGFydHMuc2xpY2UoaSkuam9pbignLicpO1xuICAgICAgaWYgKEdFTkVSQV9SRUdJU1RSWVtkb21haW5dKSB7XG4gICAgICAgICAgcmV0dXJuIEdFTkVSQV9SRUdJU1RSWVtkb21haW5dO1xuICAgICAgfVxuICB9XG5cbiAgcmV0dXJuIG51bGw7XG59XG4iLCAiZXhwb3J0IGNvbnN0IGdldFN0b3JlZFZhbHVlID0gYXN5bmMgPFQ+KGtleTogc3RyaW5nKTogUHJvbWlzZTxUIHwgbnVsbD4gPT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoa2V5LCAoaXRlbXMpID0+IHtcbiAgICAgIHJlc29sdmUoKGl0ZW1zW2tleV0gYXMgVCkgPz8gbnVsbCk7XG4gICAgfSk7XG4gIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IHNldFN0b3JlZFZhbHVlID0gYXN5bmMgPFQ+KGtleTogc3RyaW5nLCB2YWx1ZTogVCk6IFByb21pc2U8dm9pZD4gPT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBba2V5XTogdmFsdWUgfSwgKCkgPT4gcmVzb2x2ZSgpKTtcbiAgfSk7XG59O1xuIiwgImltcG9ydCB7IEN1c3RvbVN0cmF0ZWd5LCBQcmVmZXJlbmNlcywgU29ydGluZ1N0cmF0ZWd5IH0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgZ2V0U3RvcmVkVmFsdWUsIHNldFN0b3JlZFZhbHVlIH0gZnJvbSBcIi4vc3RvcmFnZS5qc1wiO1xuaW1wb3J0IHsgc2V0TG9nZ2VyUHJlZmVyZW5jZXMsIGxvZ0RlYnVnIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tIFwiLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5cbmNvbnN0IFBSRUZFUkVOQ0VTX0tFWSA9IFwicHJlZmVyZW5jZXNcIjtcblxuZXhwb3J0IGNvbnN0IGRlZmF1bHRQcmVmZXJlbmNlczogUHJlZmVyZW5jZXMgPSB7XG4gIHNvcnRpbmc6IFtcInBpbm5lZFwiLCBcInJlY2VuY3lcIl0sXG4gIGRlYnVnOiBmYWxzZSxcbiAgbG9nTGV2ZWw6IFwiaW5mb1wiLFxuICB0aGVtZTogXCJkYXJrXCIsXG4gIGN1c3RvbUdlbmVyYToge31cbn07XG5cbmNvbnN0IG5vcm1hbGl6ZVNvcnRpbmcgPSAoc29ydGluZzogdW5rbm93bik6IFNvcnRpbmdTdHJhdGVneVtdID0+IHtcbiAgaWYgKEFycmF5LmlzQXJyYXkoc29ydGluZykpIHtcbiAgICByZXR1cm4gc29ydGluZy5maWx0ZXIoKHZhbHVlKTogdmFsdWUgaXMgU29ydGluZ1N0cmF0ZWd5ID0+IHR5cGVvZiB2YWx1ZSA9PT0gXCJzdHJpbmdcIik7XG4gIH1cbiAgaWYgKHR5cGVvZiBzb3J0aW5nID09PSBcInN0cmluZ1wiKSB7XG4gICAgcmV0dXJuIFtzb3J0aW5nXTtcbiAgfVxuICByZXR1cm4gWy4uLmRlZmF1bHRQcmVmZXJlbmNlcy5zb3J0aW5nXTtcbn07XG5cbmNvbnN0IG5vcm1hbGl6ZVN0cmF0ZWdpZXMgPSAoc3RyYXRlZ2llczogdW5rbm93bik6IEN1c3RvbVN0cmF0ZWd5W10gPT4ge1xuICAgIGNvbnN0IGFyciA9IGFzQXJyYXk8YW55PihzdHJhdGVnaWVzKS5maWx0ZXIocyA9PiB0eXBlb2YgcyA9PT0gJ29iamVjdCcgJiYgcyAhPT0gbnVsbCk7XG4gICAgcmV0dXJuIGFyci5tYXAocyA9PiAoe1xuICAgICAgICAuLi5zLFxuICAgICAgICBncm91cGluZ1J1bGVzOiBhc0FycmF5KHMuZ3JvdXBpbmdSdWxlcyksXG4gICAgICAgIHNvcnRpbmdSdWxlczogYXNBcnJheShzLnNvcnRpbmdSdWxlcyksXG4gICAgICAgIGdyb3VwU29ydGluZ1J1bGVzOiBzLmdyb3VwU29ydGluZ1J1bGVzID8gYXNBcnJheShzLmdyb3VwU29ydGluZ1J1bGVzKSA6IHVuZGVmaW5lZCxcbiAgICAgICAgZmlsdGVyczogcy5maWx0ZXJzID8gYXNBcnJheShzLmZpbHRlcnMpIDogdW5kZWZpbmVkLFxuICAgICAgICBmaWx0ZXJHcm91cHM6IHMuZmlsdGVyR3JvdXBzID8gYXNBcnJheShzLmZpbHRlckdyb3VwcykubWFwKChnOiBhbnkpID0+IGFzQXJyYXkoZykpIDogdW5kZWZpbmVkLFxuICAgICAgICBydWxlczogcy5ydWxlcyA/IGFzQXJyYXkocy5ydWxlcykgOiB1bmRlZmluZWRcbiAgICB9KSk7XG59O1xuXG5jb25zdCBub3JtYWxpemVQcmVmZXJlbmNlcyA9IChwcmVmcz86IFBhcnRpYWw8UHJlZmVyZW5jZXM+IHwgbnVsbCk6IFByZWZlcmVuY2VzID0+IHtcbiAgY29uc3QgbWVyZ2VkID0geyAuLi5kZWZhdWx0UHJlZmVyZW5jZXMsIC4uLihwcmVmcyA/PyB7fSkgfTtcbiAgcmV0dXJuIHtcbiAgICAuLi5tZXJnZWQsXG4gICAgc29ydGluZzogbm9ybWFsaXplU29ydGluZyhtZXJnZWQuc29ydGluZyksXG4gICAgY3VzdG9tU3RyYXRlZ2llczogbm9ybWFsaXplU3RyYXRlZ2llcyhtZXJnZWQuY3VzdG9tU3RyYXRlZ2llcylcbiAgfTtcbn07XG5cbmV4cG9ydCBjb25zdCBsb2FkUHJlZmVyZW5jZXMgPSBhc3luYyAoKTogUHJvbWlzZTxQcmVmZXJlbmNlcz4gPT4ge1xuICBjb25zdCBzdG9yZWQgPSBhd2FpdCBnZXRTdG9yZWRWYWx1ZTxQcmVmZXJlbmNlcz4oUFJFRkVSRU5DRVNfS0VZKTtcbiAgY29uc3QgbWVyZ2VkID0gbm9ybWFsaXplUHJlZmVyZW5jZXMoc3RvcmVkID8/IHVuZGVmaW5lZCk7XG4gIHNldExvZ2dlclByZWZlcmVuY2VzKG1lcmdlZCk7XG4gIHJldHVybiBtZXJnZWQ7XG59O1xuXG5leHBvcnQgY29uc3Qgc2F2ZVByZWZlcmVuY2VzID0gYXN5bmMgKHByZWZzOiBQYXJ0aWFsPFByZWZlcmVuY2VzPik6IFByb21pc2U8UHJlZmVyZW5jZXM+ID0+IHtcbiAgbG9nRGVidWcoXCJVcGRhdGluZyBwcmVmZXJlbmNlc1wiLCB7IGtleXM6IE9iamVjdC5rZXlzKHByZWZzKSB9KTtcbiAgY29uc3QgY3VycmVudCA9IGF3YWl0IGxvYWRQcmVmZXJlbmNlcygpO1xuICBjb25zdCBtZXJnZWQgPSBub3JtYWxpemVQcmVmZXJlbmNlcyh7IC4uLmN1cnJlbnQsIC4uLnByZWZzIH0pO1xuICBhd2FpdCBzZXRTdG9yZWRWYWx1ZShQUkVGRVJFTkNFU19LRVksIG1lcmdlZCk7XG4gIHNldExvZ2dlclByZWZlcmVuY2VzKG1lcmdlZCk7XG4gIHJldHVybiBtZXJnZWQ7XG59O1xuIiwgImltcG9ydCB7IFBhZ2VDb250ZXh0LCBUYWJNZXRhZGF0YSB9IGZyb20gXCIuLi8uLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IG5vcm1hbGl6ZVVybCwgcGFyc2VZb3VUdWJlVXJsLCBleHRyYWN0WW91VHViZUNoYW5uZWxGcm9tSHRtbCwgZXh0cmFjdFlvdVR1YmVHZW5yZUZyb21IdG1sIH0gZnJvbSBcIi4vbG9naWMuanNcIjtcbmltcG9ydCB7IGdldEdlbmVyYSB9IGZyb20gXCIuL2dlbmVyYVJlZ2lzdHJ5LmpzXCI7XG5pbXBvcnQgeyBsb2dEZWJ1ZyB9IGZyb20gXCIuLi8uLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBsb2FkUHJlZmVyZW5jZXMgfSBmcm9tIFwiLi4vcHJlZmVyZW5jZXMuanNcIjtcblxuaW50ZXJmYWNlIEV4dHJhY3Rpb25SZXNwb25zZSB7XG4gIGRhdGE6IFBhZ2VDb250ZXh0IHwgbnVsbDtcbiAgZXJyb3I/OiBzdHJpbmc7XG4gIHN0YXR1czpcbiAgICB8ICdPSydcbiAgICB8ICdSRVNUUklDVEVEJ1xuICAgIHwgJ0lOSkVDVElPTl9GQUlMRUQnXG4gICAgfCAnTk9fUkVTUE9OU0UnXG4gICAgfCAnTk9fSE9TVF9QRVJNSVNTSU9OJ1xuICAgIHwgJ0ZSQU1FX0FDQ0VTU19ERU5JRUQnO1xufVxuXG4vLyBTaW1wbGUgY29uY3VycmVuY3kgY29udHJvbFxubGV0IGFjdGl2ZUZldGNoZXMgPSAwO1xuY29uc3QgTUFYX0NPTkNVUlJFTlRfRkVUQ0hFUyA9IDU7IC8vIENvbnNlcnZhdGl2ZSBsaW1pdCB0byBhdm9pZCByYXRlIGxpbWl0aW5nXG5jb25zdCBGRVRDSF9RVUVVRTogKCgpID0+IHZvaWQpW10gPSBbXTtcblxuY29uc3QgZmV0Y2hXaXRoVGltZW91dCA9IGFzeW5jICh1cmw6IHN0cmluZywgdGltZW91dCA9IDIwMDApOiBQcm9taXNlPFJlc3BvbnNlPiA9PiB7XG4gICAgY29uc3QgY29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgICBjb25zdCBpZCA9IHNldFRpbWVvdXQoKCkgPT4gY29udHJvbGxlci5hYm9ydCgpLCB0aW1lb3V0KTtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHVybCwgeyBzaWduYWw6IGNvbnRyb2xsZXIuc2lnbmFsIH0pO1xuICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KGlkKTtcbiAgICB9XG59O1xuXG5jb25zdCBlbnF1ZXVlRmV0Y2ggPSBhc3luYyA8VD4oZm46ICgpID0+IFByb21pc2U8VD4pOiBQcm9taXNlPFQ+ID0+IHtcbiAgICBpZiAoYWN0aXZlRmV0Y2hlcyA+PSBNQVhfQ09OQ1VSUkVOVF9GRVRDSEVTKSB7XG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gRkVUQ0hfUVVFVUUucHVzaChyZXNvbHZlKSk7XG4gICAgfVxuICAgIGFjdGl2ZUZldGNoZXMrKztcbiAgICB0cnkge1xuICAgICAgICByZXR1cm4gYXdhaXQgZm4oKTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgICBhY3RpdmVGZXRjaGVzLS07XG4gICAgICAgIGlmIChGRVRDSF9RVUVVRS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb25zdCBuZXh0ID0gRkVUQ0hfUVVFVUUuc2hpZnQoKTtcbiAgICAgICAgICAgIGlmIChuZXh0KSBuZXh0KCk7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5leHBvcnQgY29uc3QgZXh0cmFjdFBhZ2VDb250ZXh0ID0gYXN5bmMgKHRhYjogVGFiTWV0YWRhdGEgfCBjaHJvbWUudGFicy5UYWIpOiBQcm9taXNlPEV4dHJhY3Rpb25SZXNwb25zZT4gPT4ge1xuICB0cnkge1xuICAgIGlmICghdGFiIHx8ICF0YWIudXJsKSB7XG4gICAgICAgIHJldHVybiB7IGRhdGE6IG51bGwsIGVycm9yOiBcIlRhYiBub3QgZm91bmQgb3Igbm8gVVJMXCIsIHN0YXR1czogJ05PX1JFU1BPTlNFJyB9O1xuICAgIH1cblxuICAgIGlmIChcbiAgICAgIHRhYi51cmwuc3RhcnRzV2l0aCgnY2hyb21lOi8vJykgfHxcbiAgICAgIHRhYi51cmwuc3RhcnRzV2l0aCgnZWRnZTovLycpIHx8XG4gICAgICB0YWIudXJsLnN0YXJ0c1dpdGgoJ2Fib3V0OicpIHx8XG4gICAgICB0YWIudXJsLnN0YXJ0c1dpdGgoJ2Nocm9tZS1leHRlbnNpb246Ly8nKSB8fFxuICAgICAgdGFiLnVybC5zdGFydHNXaXRoKCdjaHJvbWUtZXJyb3I6Ly8nKVxuICAgICkge1xuICAgICAgICByZXR1cm4geyBkYXRhOiBudWxsLCBlcnJvcjogXCJSZXN0cmljdGVkIFVSTCBzY2hlbWVcIiwgc3RhdHVzOiAnUkVTVFJJQ1RFRCcgfTtcbiAgICB9XG5cbiAgICBjb25zdCBwcmVmcyA9IGF3YWl0IGxvYWRQcmVmZXJlbmNlcygpO1xuICAgIGxldCBiYXNlbGluZSA9IGJ1aWxkQmFzZWxpbmVDb250ZXh0KHRhYiBhcyBjaHJvbWUudGFicy5UYWIsIHByZWZzLmN1c3RvbUdlbmVyYSk7XG5cbiAgICAvLyBGZXRjaCBhbmQgZW5yaWNoIGZvciBZb3VUdWJlIGlmIGF1dGhvciBpcyBtaXNzaW5nIGFuZCBpdCBpcyBhIHZpZGVvXG4gICAgY29uc3QgdGFyZ2V0VXJsID0gdGFiLnVybDtcbiAgICBjb25zdCB1cmxPYmogPSBuZXcgVVJMKHRhcmdldFVybCk7XG4gICAgY29uc3QgaG9zdG5hbWUgPSB1cmxPYmouaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sICcnKTtcbiAgICBpZiAoKGhvc3RuYW1lLmVuZHNXaXRoKCd5b3V0dWJlLmNvbScpIHx8IGhvc3RuYW1lLmVuZHNXaXRoKCd5b3V0dS5iZScpKSAmJiAoIWJhc2VsaW5lLmF1dGhvck9yQ3JlYXRvciB8fCBiYXNlbGluZS5nZW5yZSA9PT0gJ1ZpZGVvJykpIHtcbiAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgLy8gV2UgdXNlIGEgcXVldWUgdG8gcHJldmVudCBmbG9vZGluZyByZXF1ZXN0c1xuICAgICAgICAgICAgIGF3YWl0IGVucXVldWVGZXRjaChhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2hXaXRoVGltZW91dCh0YXJnZXRVcmwpO1xuICAgICAgICAgICAgICAgICBpZiAocmVzcG9uc2Uub2spIHtcbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGh0bWwgPSBhd2FpdCByZXNwb25zZS50ZXh0KCk7XG4gICAgICAgICAgICAgICAgICAgICBjb25zdCBjaGFubmVsID0gZXh0cmFjdFlvdVR1YmVDaGFubmVsRnJvbUh0bWwoaHRtbCk7XG4gICAgICAgICAgICAgICAgICAgICBpZiAoY2hhbm5lbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgIGJhc2VsaW5lLmF1dGhvck9yQ3JlYXRvciA9IGNoYW5uZWw7XG4gICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICBjb25zdCBnZW5yZSA9IGV4dHJhY3RZb3VUdWJlR2VucmVGcm9tSHRtbChodG1sKTtcbiAgICAgICAgICAgICAgICAgICAgIGlmIChnZW5yZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgIGJhc2VsaW5lLmdlbnJlID0gZ2VucmU7XG4gICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9KTtcbiAgICAgICAgIH0gY2F0Y2ggKGZldGNoRXJyKSB7XG4gICAgICAgICAgICAgbG9nRGVidWcoXCJGYWlsZWQgdG8gZmV0Y2ggWW91VHViZSBwYWdlIGNvbnRlbnRcIiwgeyBlcnJvcjogU3RyaW5nKGZldGNoRXJyKSB9KTtcbiAgICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgZGF0YTogYmFzZWxpbmUsXG4gICAgICBzdGF0dXM6ICdPSydcbiAgICB9O1xuXG4gIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgIGxvZ0RlYnVnKGBFeHRyYWN0aW9uIGZhaWxlZCBmb3IgdGFiICR7dGFiLmlkfWAsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICByZXR1cm4ge1xuICAgICAgZGF0YTogbnVsbCxcbiAgICAgIGVycm9yOiBTdHJpbmcoZSksXG4gICAgICBzdGF0dXM6ICdJTkpFQ1RJT05fRkFJTEVEJ1xuICAgIH07XG4gIH1cbn07XG5cbmNvbnN0IGJ1aWxkQmFzZWxpbmVDb250ZXh0ID0gKHRhYjogY2hyb21lLnRhYnMuVGFiLCBjdXN0b21HZW5lcmE/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogUGFnZUNvbnRleHQgPT4ge1xuICBjb25zdCB1cmwgPSB0YWIudXJsIHx8IFwiXCI7XG4gIGxldCBob3N0bmFtZSA9IFwiXCI7XG4gIHRyeSB7XG4gICAgaG9zdG5hbWUgPSBuZXcgVVJMKHVybCkuaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sICcnKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGhvc3RuYW1lID0gXCJcIjtcbiAgfVxuXG4gIC8vIERldGVybWluZSBPYmplY3QgVHlwZSBmaXJzdFxuICBsZXQgb2JqZWN0VHlwZTogUGFnZUNvbnRleHRbJ29iamVjdFR5cGUnXSA9ICd1bmtub3duJztcbiAgbGV0IGF1dGhvck9yQ3JlYXRvcjogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cbiAgaWYgKHVybC5pbmNsdWRlcygnL2xvZ2luJykgfHwgdXJsLmluY2x1ZGVzKCcvc2lnbmluJykpIHtcbiAgICAgIG9iamVjdFR5cGUgPSAnbG9naW4nO1xuICB9IGVsc2UgaWYgKGhvc3RuYW1lLmluY2x1ZGVzKCd5b3V0dWJlLmNvbScpIHx8IGhvc3RuYW1lLmluY2x1ZGVzKCd5b3V0dS5iZScpKSB7XG4gICAgICBjb25zdCB7IHZpZGVvSWQgfSA9IHBhcnNlWW91VHViZVVybCh1cmwpO1xuICAgICAgaWYgKHZpZGVvSWQpIG9iamVjdFR5cGUgPSAndmlkZW8nO1xuXG4gICAgICAvLyBUcnkgdG8gZ3Vlc3MgY2hhbm5lbCBmcm9tIFVSTCBpZiBwb3NzaWJsZVxuICAgICAgaWYgKHVybC5pbmNsdWRlcygnL0AnKSkge1xuICAgICAgICAgIGNvbnN0IHBhcnRzID0gdXJsLnNwbGl0KCcvQCcpO1xuICAgICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGhhbmRsZSA9IHBhcnRzWzFdLnNwbGl0KCcvJylbMF07XG4gICAgICAgICAgICAgIGF1dGhvck9yQ3JlYXRvciA9ICdAJyArIGhhbmRsZTtcbiAgICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHVybC5pbmNsdWRlcygnL2MvJykpIHtcbiAgICAgICAgICBjb25zdCBwYXJ0cyA9IHVybC5zcGxpdCgnL2MvJyk7XG4gICAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgYXV0aG9yT3JDcmVhdG9yID0gZGVjb2RlVVJJQ29tcG9uZW50KHBhcnRzWzFdLnNwbGl0KCcvJylbMF0pO1xuICAgICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodXJsLmluY2x1ZGVzKCcvdXNlci8nKSkge1xuICAgICAgICAgIGNvbnN0IHBhcnRzID0gdXJsLnNwbGl0KCcvdXNlci8nKTtcbiAgICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICBhdXRob3JPckNyZWF0b3IgPSBkZWNvZGVVUklDb21wb25lbnQocGFydHNbMV0uc3BsaXQoJy8nKVswXSk7XG4gICAgICAgICAgfVxuICAgICAgfVxuICB9IGVsc2UgaWYgKGhvc3RuYW1lID09PSAnZ2l0aHViLmNvbScgJiYgdXJsLmluY2x1ZGVzKCcvcHVsbC8nKSkge1xuICAgICAgb2JqZWN0VHlwZSA9ICd0aWNrZXQnO1xuICB9IGVsc2UgaWYgKGhvc3RuYW1lID09PSAnZ2l0aHViLmNvbScgJiYgIXVybC5pbmNsdWRlcygnL3B1bGwvJykgJiYgdXJsLnNwbGl0KCcvJykubGVuZ3RoID49IDUpIHtcbiAgICAgIC8vIHJvdWdoIGNoZWNrIGZvciByZXBvXG4gICAgICBvYmplY3RUeXBlID0gJ3JlcG8nO1xuICB9XG5cbiAgLy8gRGV0ZXJtaW5lIEdlbnJlXG4gIC8vIFByaW9yaXR5IDE6IFNpdGUtc3BlY2lmaWMgZXh0cmFjdGlvbiAoZGVyaXZlZCBmcm9tIG9iamVjdFR5cGUpXG4gIGxldCBnZW5yZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG4gIGlmIChvYmplY3RUeXBlID09PSAndmlkZW8nKSBnZW5yZSA9ICdWaWRlbyc7XG4gIGVsc2UgaWYgKG9iamVjdFR5cGUgPT09ICdyZXBvJyB8fCBvYmplY3RUeXBlID09PSAndGlja2V0JykgZ2VucmUgPSAnRGV2ZWxvcG1lbnQnO1xuXG4gIC8vIFByaW9yaXR5IDI6IEZhbGxiYWNrIHRvIFJlZ2lzdHJ5XG4gIGlmICghZ2VucmUpIHtcbiAgICAgZ2VucmUgPSBnZXRHZW5lcmEoaG9zdG5hbWUsIGN1c3RvbUdlbmVyYSkgfHwgdW5kZWZpbmVkO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjYW5vbmljYWxVcmw6IHVybCB8fCBudWxsLFxuICAgIG5vcm1hbGl6ZWRVcmw6IG5vcm1hbGl6ZVVybCh1cmwpLFxuICAgIHNpdGVOYW1lOiBob3N0bmFtZSB8fCBudWxsLFxuICAgIHBsYXRmb3JtOiBob3N0bmFtZSB8fCBudWxsLFxuICAgIG9iamVjdFR5cGUsXG4gICAgb2JqZWN0SWQ6IHVybCB8fCBudWxsLFxuICAgIHRpdGxlOiB0YWIudGl0bGUgfHwgbnVsbCxcbiAgICBnZW5yZSxcbiAgICBkZXNjcmlwdGlvbjogbnVsbCxcbiAgICBhdXRob3JPckNyZWF0b3I6IGF1dGhvck9yQ3JlYXRvcixcbiAgICBwdWJsaXNoZWRBdDogbnVsbCxcbiAgICBtb2RpZmllZEF0OiBudWxsLFxuICAgIGxhbmd1YWdlOiBudWxsLFxuICAgIHRhZ3M6IFtdLFxuICAgIGJyZWFkY3J1bWJzOiBbXSxcbiAgICBpc0F1ZGlibGU6IGZhbHNlLFxuICAgIGlzTXV0ZWQ6IGZhbHNlLFxuICAgIGlzQ2FwdHVyaW5nOiBmYWxzZSxcbiAgICBwcm9ncmVzczogbnVsbCxcbiAgICBoYXNVbnNhdmVkQ2hhbmdlc0xpa2VseTogZmFsc2UsXG4gICAgaXNBdXRoZW50aWNhdGVkTGlrZWx5OiBmYWxzZSxcbiAgICBzb3VyY2VzOiB7XG4gICAgICBjYW5vbmljYWxVcmw6ICd1cmwnLFxuICAgICAgbm9ybWFsaXplZFVybDogJ3VybCcsXG4gICAgICBzaXRlTmFtZTogJ3VybCcsXG4gICAgICBwbGF0Zm9ybTogJ3VybCcsXG4gICAgICBvYmplY3RUeXBlOiAndXJsJyxcbiAgICAgIHRpdGxlOiB0YWIudGl0bGUgPyAndGFiJyA6ICd1cmwnLFxuICAgICAgZ2VucmU6ICdyZWdpc3RyeSdcbiAgICB9LFxuICAgIGNvbmZpZGVuY2U6IHt9XG4gIH07XG59O1xuIiwgImltcG9ydCB7IFRhYk1ldGFkYXRhLCBQYWdlQ29udGV4dCB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnLCBsb2dFcnJvciB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBleHRyYWN0UGFnZUNvbnRleHQgfSBmcm9tIFwiLi9leHRyYWN0aW9uL2luZGV4LmpzXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29udGV4dFJlc3VsdCB7XG4gIGNvbnRleHQ6IHN0cmluZztcbiAgc291cmNlOiAnQUknIHwgJ0hldXJpc3RpYycgfCAnRXh0cmFjdGlvbic7XG4gIGRhdGE/OiBQYWdlQ29udGV4dDtcbiAgZXJyb3I/OiBzdHJpbmc7XG4gIHN0YXR1cz86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIENhY2hlRW50cnkge1xuICByZXN1bHQ6IENvbnRleHRSZXN1bHQ7XG4gIHRpbWVzdGFtcDogbnVtYmVyO1xufVxuXG5jb25zdCBjb250ZXh0Q2FjaGUgPSBuZXcgTWFwPHN0cmluZywgQ2FjaGVFbnRyeT4oKTtcbmNvbnN0IENBQ0hFX1RUTF9TVUNDRVNTID0gMjQgKiA2MCAqIDYwICogMTAwMDsgLy8gMjQgaG91cnNcbmNvbnN0IENBQ0hFX1RUTF9FUlJPUiA9IDUgKiA2MCAqIDEwMDA7IC8vIDUgbWludXRlc1xuXG5leHBvcnQgY29uc3QgYW5hbHl6ZVRhYkNvbnRleHQgPSBhc3luYyAoXG4gIHRhYnM6IFRhYk1ldGFkYXRhW10sXG4gIG9uUHJvZ3Jlc3M/OiAoY29tcGxldGVkOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+IHZvaWRcbik6IFByb21pc2U8TWFwPG51bWJlciwgQ29udGV4dFJlc3VsdD4+ID0+IHtcbiAgY29uc3QgY29udGV4dE1hcCA9IG5ldyBNYXA8bnVtYmVyLCBDb250ZXh0UmVzdWx0PigpO1xuICBsZXQgY29tcGxldGVkID0gMDtcbiAgY29uc3QgdG90YWwgPSB0YWJzLmxlbmd0aDtcblxuICBjb25zdCBwcm9taXNlcyA9IHRhYnMubWFwKGFzeW5jICh0YWIpID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgY2FjaGVLZXkgPSBgJHt0YWIuaWR9Ojoke3RhYi51cmx9YDtcbiAgICAgIGNvbnN0IGNhY2hlZCA9IGNvbnRleHRDYWNoZS5nZXQoY2FjaGVLZXkpO1xuXG4gICAgICBpZiAoY2FjaGVkKSB7XG4gICAgICAgIGNvbnN0IGlzRXJyb3IgPSBjYWNoZWQucmVzdWx0LnN0YXR1cyA9PT0gJ0VSUk9SJyB8fCAhIWNhY2hlZC5yZXN1bHQuZXJyb3I7XG4gICAgICAgIGNvbnN0IHR0bCA9IGlzRXJyb3IgPyBDQUNIRV9UVExfRVJST1IgOiBDQUNIRV9UVExfU1VDQ0VTUztcblxuICAgICAgICBpZiAoRGF0ZS5ub3coKSAtIGNhY2hlZC50aW1lc3RhbXAgPCB0dGwpIHtcbiAgICAgICAgICBjb250ZXh0TWFwLnNldCh0YWIuaWQsIGNhY2hlZC5yZXN1bHQpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb250ZXh0Q2FjaGUuZGVsZXRlKGNhY2hlS2V5KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBmZXRjaENvbnRleHRGb3JUYWIodGFiKTtcblxuICAgICAgLy8gQ2FjaGUgd2l0aCBleHBpcmF0aW9uIGxvZ2ljXG4gICAgICBjb250ZXh0Q2FjaGUuc2V0KGNhY2hlS2V5LCB7XG4gICAgICAgIHJlc3VsdCxcbiAgICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpXG4gICAgICB9KTtcblxuICAgICAgY29udGV4dE1hcC5zZXQodGFiLmlkLCByZXN1bHQpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dFcnJvcihgRmFpbGVkIHRvIGFuYWx5emUgY29udGV4dCBmb3IgdGFiICR7dGFiLmlkfWAsIHsgZXJyb3I6IFN0cmluZyhlcnJvcikgfSk7XG4gICAgICAvLyBFdmVuIGlmIGZldGNoQ29udGV4dEZvclRhYiBmYWlscyBjb21wbGV0ZWx5LCB3ZSB0cnkgYSBzYWZlIHN5bmMgZmFsbGJhY2tcbiAgICAgIGNvbnRleHRNYXAuc2V0KHRhYi5pZCwgeyBjb250ZXh0OiBcIlVuY2F0ZWdvcml6ZWRcIiwgc291cmNlOiAnSGV1cmlzdGljJywgZXJyb3I6IFN0cmluZyhlcnJvciksIHN0YXR1czogJ0VSUk9SJyB9KTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgY29tcGxldGVkKys7XG4gICAgICBpZiAob25Qcm9ncmVzcykgb25Qcm9ncmVzcyhjb21wbGV0ZWQsIHRvdGFsKTtcbiAgICB9XG4gIH0pO1xuXG4gIGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgcmV0dXJuIGNvbnRleHRNYXA7XG59O1xuXG5jb25zdCBmZXRjaENvbnRleHRGb3JUYWIgPSBhc3luYyAodGFiOiBUYWJNZXRhZGF0YSk6IFByb21pc2U8Q29udGV4dFJlc3VsdD4gPT4ge1xuICAvLyAxLiBSdW4gR2VuZXJpYyBFeHRyYWN0aW9uIChBbHdheXMpXG4gIGxldCBkYXRhOiBQYWdlQ29udGV4dCB8IG51bGwgPSBudWxsO1xuICBsZXQgZXJyb3I6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgbGV0IHN0YXR1czogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG4gIHRyeSB7XG4gICAgICBjb25zdCBleHRyYWN0aW9uID0gYXdhaXQgZXh0cmFjdFBhZ2VDb250ZXh0KHRhYik7XG4gICAgICBkYXRhID0gZXh0cmFjdGlvbi5kYXRhO1xuICAgICAgZXJyb3IgPSBleHRyYWN0aW9uLmVycm9yO1xuICAgICAgc3RhdHVzID0gZXh0cmFjdGlvbi5zdGF0dXM7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZ0RlYnVnKGBFeHRyYWN0aW9uIGZhaWxlZCBmb3IgdGFiICR7dGFiLmlkfWAsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgIGVycm9yID0gU3RyaW5nKGUpO1xuICAgICAgc3RhdHVzID0gJ0VSUk9SJztcbiAgfVxuXG4gIGxldCBjb250ZXh0ID0gXCJVbmNhdGVnb3JpemVkXCI7XG4gIGxldCBzb3VyY2U6IENvbnRleHRSZXN1bHRbJ3NvdXJjZSddID0gJ0hldXJpc3RpYyc7XG5cbiAgLy8gMi4gVHJ5IHRvIERldGVybWluZSBDYXRlZ29yeSBmcm9tIEV4dHJhY3Rpb24gRGF0YVxuICBpZiAoZGF0YSkge1xuICAgICAgaWYgKGRhdGEucGxhdGZvcm0gPT09ICdZb3VUdWJlJyB8fCBkYXRhLnBsYXRmb3JtID09PSAnTmV0ZmxpeCcgfHwgZGF0YS5wbGF0Zm9ybSA9PT0gJ1Nwb3RpZnknIHx8IGRhdGEucGxhdGZvcm0gPT09ICdUd2l0Y2gnKSB7XG4gICAgICAgICAgY29udGV4dCA9IFwiRW50ZXJ0YWlubWVudFwiO1xuICAgICAgICAgIHNvdXJjZSA9ICdFeHRyYWN0aW9uJztcbiAgICAgIH0gZWxzZSBpZiAoZGF0YS5wbGF0Zm9ybSA9PT0gJ0dpdEh1YicgfHwgZGF0YS5wbGF0Zm9ybSA9PT0gJ1N0YWNrIE92ZXJmbG93JyB8fCBkYXRhLnBsYXRmb3JtID09PSAnSmlyYScgfHwgZGF0YS5wbGF0Zm9ybSA9PT0gJ0dpdExhYicpIHtcbiAgICAgICAgICBjb250ZXh0ID0gXCJEZXZlbG9wbWVudFwiO1xuICAgICAgICAgIHNvdXJjZSA9ICdFeHRyYWN0aW9uJztcbiAgICAgIH0gZWxzZSBpZiAoZGF0YS5wbGF0Zm9ybSA9PT0gJ0dvb2dsZScgJiYgKGRhdGEubm9ybWFsaXplZFVybC5pbmNsdWRlcygnZG9jcycpIHx8IGRhdGEubm9ybWFsaXplZFVybC5pbmNsdWRlcygnc2hlZXRzJykgfHwgZGF0YS5ub3JtYWxpemVkVXJsLmluY2x1ZGVzKCdzbGlkZXMnKSkpIHtcbiAgICAgICAgICBjb250ZXh0ID0gXCJXb3JrXCI7XG4gICAgICAgICAgc291cmNlID0gJ0V4dHJhY3Rpb24nO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gSWYgd2UgaGF2ZSBzdWNjZXNzZnVsIGV4dHJhY3Rpb24gZGF0YSBidXQgbm8gc3BlY2lmaWMgcnVsZSBtYXRjaGVkLFxuICAgICAgICAvLyB1c2UgdGhlIE9iamVjdCBUeXBlIG9yIGdlbmVyaWMgXCJHZW5lcmFsIFdlYlwiIHRvIGluZGljYXRlIGV4dHJhY3Rpb24gd29ya2VkLlxuICAgICAgICAvLyBXZSBwcmVmZXIgc3BlY2lmaWMgY2F0ZWdvcmllcywgYnV0IFwiQXJ0aWNsZVwiIG9yIFwiVmlkZW9cIiBhcmUgYmV0dGVyIHRoYW4gXCJVbmNhdGVnb3JpemVkXCIuXG4gICAgICAgIGlmIChkYXRhLm9iamVjdFR5cGUgJiYgZGF0YS5vYmplY3RUeXBlICE9PSAndW5rbm93bicpIHtcbiAgICAgICAgICAgICAvLyBNYXAgb2JqZWN0IHR5cGVzIHRvIGNhdGVnb3JpZXMgaWYgcG9zc2libGVcbiAgICAgICAgICAgICBpZiAoZGF0YS5vYmplY3RUeXBlID09PSAndmlkZW8nKSBjb250ZXh0ID0gJ0VudGVydGFpbm1lbnQnO1xuICAgICAgICAgICAgIGVsc2UgaWYgKGRhdGEub2JqZWN0VHlwZSA9PT0gJ2FydGljbGUnKSBjb250ZXh0ID0gJ05ld3MnOyAvLyBMb29zZSBtYXBwaW5nLCBidXQgYmV0dGVyIHRoYW4gbm90aGluZ1xuICAgICAgICAgICAgIGVsc2UgY29udGV4dCA9IGRhdGEub2JqZWN0VHlwZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGRhdGEub2JqZWN0VHlwZS5zbGljZSgxKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICBjb250ZXh0ID0gXCJHZW5lcmFsIFdlYlwiO1xuICAgICAgICB9XG4gICAgICAgIHNvdXJjZSA9ICdFeHRyYWN0aW9uJztcbiAgICAgIH1cbiAgfVxuXG4gIC8vIDMuIEZhbGxiYWNrIHRvIExvY2FsIEhldXJpc3RpYyAoVVJMIFJlZ2V4KVxuICBpZiAoY29udGV4dCA9PT0gXCJVbmNhdGVnb3JpemVkXCIpIHtcbiAgICAgIGNvbnN0IGggPSBhd2FpdCBsb2NhbEhldXJpc3RpYyh0YWIpO1xuICAgICAgaWYgKGguY29udGV4dCAhPT0gXCJVbmNhdGVnb3JpemVkXCIpIHtcbiAgICAgICAgICBjb250ZXh0ID0gaC5jb250ZXh0O1xuICAgICAgICAgIC8vIHNvdXJjZSByZW1haW5zICdIZXVyaXN0aWMnIChvciBtYXliZSB3ZSBzaG91bGQgc2F5ICdIZXVyaXN0aWMnIGlzIHRoZSBzb3VyY2U/KVxuICAgICAgICAgIC8vIFRoZSBsb2NhbEhldXJpc3RpYyBmdW5jdGlvbiByZXR1cm5zIHsgc291cmNlOiAnSGV1cmlzdGljJyB9XG4gICAgICB9XG4gIH1cblxuICAvLyA0LiBGYWxsYmFjayB0byBBSSAoTExNKSAtIFJFTU9WRURcbiAgLy8gVGhlIEh1Z2dpbmdGYWNlIEFQSSBlbmRwb2ludCBpcyA0MTAgR29uZSBhbmQvb3IgcmVxdWlyZXMgYXV0aGVudGljYXRpb24gd2hpY2ggd2UgZG8gbm90IGhhdmUuXG4gIC8vIFRoZSBjb2RlIGhhcyBiZWVuIHJlbW92ZWQgdG8gcHJldmVudCBlcnJvcnMuXG5cbiAgaWYgKGNvbnRleHQgIT09IFwiVW5jYXRlZ29yaXplZFwiICYmIHNvdXJjZSAhPT0gXCJFeHRyYWN0aW9uXCIpIHtcbiAgICBlcnJvciA9IHVuZGVmaW5lZDtcbiAgICBzdGF0dXMgPSB1bmRlZmluZWQ7XG4gIH1cblxuICByZXR1cm4geyBjb250ZXh0LCBzb3VyY2UsIGRhdGE6IGRhdGEgfHwgdW5kZWZpbmVkLCBlcnJvciwgc3RhdHVzIH07XG59O1xuXG5jb25zdCBsb2NhbEhldXJpc3RpYyA9IGFzeW5jICh0YWI6IFRhYk1ldGFkYXRhKTogUHJvbWlzZTxDb250ZXh0UmVzdWx0PiA9PiB7XG4gIGNvbnN0IHVybCA9IHRhYi51cmwudG9Mb3dlckNhc2UoKTtcbiAgbGV0IGNvbnRleHQgPSBcIlVuY2F0ZWdvcml6ZWRcIjtcblxuICBpZiAodXJsLmluY2x1ZGVzKFwiZ2l0aHViXCIpIHx8IHVybC5pbmNsdWRlcyhcInN0YWNrb3ZlcmZsb3dcIikgfHwgdXJsLmluY2x1ZGVzKFwibG9jYWxob3N0XCIpIHx8IHVybC5pbmNsdWRlcyhcImppcmFcIikgfHwgdXJsLmluY2x1ZGVzKFwiZ2l0bGFiXCIpKSBjb250ZXh0ID0gXCJEZXZlbG9wbWVudFwiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJnb29nbGVcIikgJiYgKHVybC5pbmNsdWRlcyhcImRvY3NcIikgfHwgdXJsLmluY2x1ZGVzKFwic2hlZXRzXCIpIHx8IHVybC5pbmNsdWRlcyhcInNsaWRlc1wiKSkpIGNvbnRleHQgPSBcIldvcmtcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwibGlua2VkaW5cIikgfHwgdXJsLmluY2x1ZGVzKFwic2xhY2tcIikgfHwgdXJsLmluY2x1ZGVzKFwiem9vbVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJ0ZWFtc1wiKSkgY29udGV4dCA9IFwiV29ya1wiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJuZXRmbGl4XCIpIHx8IHVybC5pbmNsdWRlcyhcInNwb3RpZnlcIikgfHwgdXJsLmluY2x1ZGVzKFwiaHVsdVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJkaXNuZXlcIikgfHwgdXJsLmluY2x1ZGVzKFwieW91dHViZVwiKSkgY29udGV4dCA9IFwiRW50ZXJ0YWlubWVudFwiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJ0d2l0dGVyXCIpIHx8IHVybC5pbmNsdWRlcyhcImZhY2Vib29rXCIpIHx8IHVybC5pbmNsdWRlcyhcImluc3RhZ3JhbVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJyZWRkaXRcIikgfHwgdXJsLmluY2x1ZGVzKFwidGlrdG9rXCIpIHx8IHVybC5pbmNsdWRlcyhcInBpbnRlcmVzdFwiKSkgY29udGV4dCA9IFwiU29jaWFsXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcImFtYXpvblwiKSB8fCB1cmwuaW5jbHVkZXMoXCJlYmF5XCIpIHx8IHVybC5pbmNsdWRlcyhcIndhbG1hcnRcIikgfHwgdXJsLmluY2x1ZGVzKFwidGFyZ2V0XCIpIHx8IHVybC5pbmNsdWRlcyhcInNob3BpZnlcIikpIGNvbnRleHQgPSBcIlNob3BwaW5nXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcImNublwiKSB8fCB1cmwuaW5jbHVkZXMoXCJiYmNcIikgfHwgdXJsLmluY2x1ZGVzKFwibnl0aW1lc1wiKSB8fCB1cmwuaW5jbHVkZXMoXCJ3YXNoaW5ndG9ucG9zdFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJmb3huZXdzXCIpKSBjb250ZXh0ID0gXCJOZXdzXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcImNvdXJzZXJhXCIpIHx8IHVybC5pbmNsdWRlcyhcInVkZW15XCIpIHx8IHVybC5pbmNsdWRlcyhcImVkeFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJraGFuYWNhZGVteVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJjYW52YXNcIikpIGNvbnRleHQgPSBcIkVkdWNhdGlvblwiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJleHBlZGlhXCIpIHx8IHVybC5pbmNsdWRlcyhcImJvb2tpbmdcIikgfHwgdXJsLmluY2x1ZGVzKFwiYWlyYm5iXCIpIHx8IHVybC5pbmNsdWRlcyhcInRyaXBhZHZpc29yXCIpIHx8IHVybC5pbmNsdWRlcyhcImtheWFrXCIpKSBjb250ZXh0ID0gXCJUcmF2ZWxcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwid2VibWRcIikgfHwgdXJsLmluY2x1ZGVzKFwibWF5b2NsaW5pY1wiKSB8fCB1cmwuaW5jbHVkZXMoXCJuaWguZ292XCIpIHx8IHVybC5pbmNsdWRlcyhcImhlYWx0aFwiKSkgY29udGV4dCA9IFwiSGVhbHRoXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcImVzcG5cIikgfHwgdXJsLmluY2x1ZGVzKFwibmJhXCIpIHx8IHVybC5pbmNsdWRlcyhcIm5mbFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJtbGJcIikgfHwgdXJsLmluY2x1ZGVzKFwiZmlmYVwiKSkgY29udGV4dCA9IFwiU3BvcnRzXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcInRlY2hjcnVuY2hcIikgfHwgdXJsLmluY2x1ZGVzKFwid2lyZWRcIikgfHwgdXJsLmluY2x1ZGVzKFwidGhldmVyZ2VcIikgfHwgdXJsLmluY2x1ZGVzKFwiYXJzdGVjaG5pY2FcIikpIGNvbnRleHQgPSBcIlRlY2hub2xvZ3lcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwic2NpZW5jZVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJuYXR1cmUuY29tXCIpIHx8IHVybC5pbmNsdWRlcyhcIm5hc2EuZ292XCIpKSBjb250ZXh0ID0gXCJTY2llbmNlXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcInR3aXRjaFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJzdGVhbVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJyb2Jsb3hcIikgfHwgdXJsLmluY2x1ZGVzKFwiaWduXCIpIHx8IHVybC5pbmNsdWRlcyhcImdhbWVzcG90XCIpKSBjb250ZXh0ID0gXCJHYW1pbmdcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwic291bmRjbG91ZFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJiYW5kY2FtcFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJsYXN0LmZtXCIpKSBjb250ZXh0ID0gXCJNdXNpY1wiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJkZXZpYW50YXJ0XCIpIHx8IHVybC5pbmNsdWRlcyhcImJlaGFuY2VcIikgfHwgdXJsLmluY2x1ZGVzKFwiZHJpYmJibGVcIikgfHwgdXJsLmluY2x1ZGVzKFwiYXJ0c3RhdGlvblwiKSkgY29udGV4dCA9IFwiQXJ0XCI7XG5cbiAgcmV0dXJuIHsgY29udGV4dCwgc291cmNlOiAnSGV1cmlzdGljJyB9O1xufTtcbiIsICJpbXBvcnQgeyBncm91cFRhYnMsIGdldEN1c3RvbVN0cmF0ZWdpZXMsIGdldEZpZWxkVmFsdWUsIHJlcXVpcmVzQ29udGV4dEFuYWx5c2lzIH0gZnJvbSBcIi4vZ3JvdXBpbmdTdHJhdGVnaWVzLmpzXCI7XG5pbXBvcnQgeyBzb3J0VGFicywgY29tcGFyZUJ5IH0gZnJvbSBcIi4vc29ydGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IGFuYWx5emVUYWJDb250ZXh0IH0gZnJvbSBcIi4vY29udGV4dEFuYWx5c2lzLmpzXCI7XG5pbXBvcnQgeyBsb2dEZWJ1ZywgbG9nRXJyb3IsIGxvZ0luZm8gfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgR3JvdXBpbmdTZWxlY3Rpb24sIFByZWZlcmVuY2VzLCBUYWJHcm91cCwgVGFiTWV0YWRhdGEsIFNvcnRpbmdSdWxlIH0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgZ2V0U3RvcmVkVmFsdWUsIHNldFN0b3JlZFZhbHVlIH0gZnJvbSBcIi4vc3RvcmFnZS5qc1wiO1xuaW1wb3J0IHsgbWFwQ2hyb21lVGFiLCBhc0FycmF5IH0gZnJvbSBcIi4uL3NoYXJlZC91dGlscy5qc1wiO1xuXG5jb25zdCBnZXRUYWJzRm9yRmlsdGVyID0gYXN5bmMgKGZpbHRlcj86IEdyb3VwaW5nU2VsZWN0aW9uKTogUHJvbWlzZTxjaHJvbWUudGFicy5UYWJbXT4gPT4ge1xuICBjb25zdCB3aW5kb3dJZHMgPSBmaWx0ZXI/LndpbmRvd0lkcztcbiAgY29uc3QgdGFiSWRzID0gZmlsdGVyPy50YWJJZHM7XG4gIGNvbnN0IGhhc1dpbmRvd0lkcyA9IHdpbmRvd0lkcyAmJiB3aW5kb3dJZHMubGVuZ3RoID4gMDtcbiAgY29uc3QgaGFzVGFiSWRzID0gdGFiSWRzICYmIHRhYklkcy5sZW5ndGggPiAwO1xuXG4gIGlmICghZmlsdGVyIHx8ICghaGFzV2luZG93SWRzICYmICFoYXNUYWJJZHMpKSB7XG4gICAgcmV0dXJuIGNocm9tZS50YWJzLnF1ZXJ5KHt9KTtcbiAgfVxuXG4gIGNvbnN0IHByb21pc2VzOiBQcm9taXNlPGFueT5bXSA9IFtdO1xuXG4gIGlmIChoYXNXaW5kb3dJZHMpIHtcbiAgICB3aW5kb3dJZHMuZm9yRWFjaCh3aW5kb3dJZCA9PiB7XG4gICAgICBwcm9taXNlcy5wdXNoKGNocm9tZS50YWJzLnF1ZXJ5KHsgd2luZG93SWQgfSkuY2F0Y2goKCkgPT4gW10pKTtcbiAgICB9KTtcbiAgfVxuXG4gIGlmIChoYXNUYWJJZHMpIHtcbiAgICB0YWJJZHMuZm9yRWFjaCh0YWJJZCA9PiB7XG4gICAgICBwcm9taXNlcy5wdXNoKGNocm9tZS50YWJzLmdldCh0YWJJZCkuY2F0Y2goKCkgPT4gbnVsbCkpO1xuICAgIH0pO1xuICB9XG5cbiAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcblxuICAvLyBGbGF0dGVuIGFuZCBmaWx0ZXIgb3V0IG51bGxzXG4gIGNvbnN0IGFsbFRhYnM6IGNocm9tZS50YWJzLlRhYltdID0gW107XG4gIGZvciAoY29uc3QgcmVzIG9mIHJlc3VsdHMpIHtcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KHJlcykpIHtcbiAgICAgICAgICBhbGxUYWJzLnB1c2goLi4ucmVzKTtcbiAgICAgIH0gZWxzZSBpZiAocmVzKSB7XG4gICAgICAgICAgYWxsVGFicy5wdXNoKHJlcyk7XG4gICAgICB9XG4gIH1cblxuICAvLyBEZWR1cGxpY2F0ZSBieSBJRFxuICBjb25zdCB1bmlxdWVUYWJzID0gbmV3IE1hcDxudW1iZXIsIGNocm9tZS50YWJzLlRhYj4oKTtcbiAgZm9yIChjb25zdCB0YWIgb2YgYWxsVGFicykge1xuICAgICAgaWYgKHRhYi5pZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgdW5pcXVlVGFicy5zZXQodGFiLmlkLCB0YWIpO1xuICAgICAgfVxuICB9XG5cbiAgcmV0dXJuIEFycmF5LmZyb20odW5pcXVlVGFicy52YWx1ZXMoKSk7XG59O1xuXG5leHBvcnQgY29uc3QgZmV0Y2hDdXJyZW50VGFiR3JvdXBzID0gYXN5bmMgKFxuICBwcmVmZXJlbmNlczogUHJlZmVyZW5jZXMsXG4gIG9uUHJvZ3Jlc3M/OiAoY29tcGxldGVkOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+IHZvaWRcbik6IFByb21pc2U8VGFiR3JvdXBbXT4gPT4ge1xuICB0cnkge1xuICBjb25zdCB0YWJzID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoe30pO1xuICBjb25zdCBncm91cHMgPSBhd2FpdCBjaHJvbWUudGFiR3JvdXBzLnF1ZXJ5KHt9KTtcbiAgY29uc3QgZ3JvdXBNYXAgPSBuZXcgTWFwKGdyb3Vwcy5tYXAoZyA9PiBbZy5pZCwgZ10pKTtcblxuICAvLyBNYXAgdGFicyB0byBtZXRhZGF0YVxuICBjb25zdCBtYXBwZWQgPSB0YWJzLm1hcChtYXBDaHJvbWVUYWIpLmZpbHRlcigodCk6IHQgaXMgVGFiTWV0YWRhdGEgPT4gQm9vbGVhbih0KSk7XG5cbiAgaWYgKHJlcXVpcmVzQ29udGV4dEFuYWx5c2lzKHByZWZlcmVuY2VzLnNvcnRpbmcpKSB7XG4gICAgICBjb25zdCBjb250ZXh0TWFwID0gYXdhaXQgYW5hbHl6ZVRhYkNvbnRleHQobWFwcGVkLCBvblByb2dyZXNzKTtcbiAgICAgIG1hcHBlZC5mb3JFYWNoKHRhYiA9PiB7XG4gICAgICAgIGNvbnN0IHJlcyA9IGNvbnRleHRNYXAuZ2V0KHRhYi5pZCk7XG4gICAgICAgIHRhYi5jb250ZXh0ID0gcmVzPy5jb250ZXh0O1xuICAgICAgICB0YWIuY29udGV4dERhdGEgPSByZXM/LmRhdGE7XG4gICAgICB9KTtcbiAgfVxuXG4gIGNvbnN0IHJlc3VsdEdyb3VwczogVGFiR3JvdXBbXSA9IFtdO1xuICBjb25zdCB0YWJzQnlHcm91cElkID0gbmV3IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhW10+KCk7XG4gIGNvbnN0IHRhYnNCeVdpbmRvd1VuZ3JvdXBlZCA9IG5ldyBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YVtdPigpO1xuXG4gIG1hcHBlZC5mb3JFYWNoKHRhYiA9PiB7XG4gICAgICBjb25zdCBncm91cElkID0gdGFiLmdyb3VwSWQgPz8gLTE7XG4gICAgICBpZiAoZ3JvdXBJZCAhPT0gLTEpIHtcbiAgICAgICAgICBpZiAoIXRhYnNCeUdyb3VwSWQuaGFzKGdyb3VwSWQpKSB0YWJzQnlHcm91cElkLnNldChncm91cElkLCBbXSk7XG4gICAgICAgICAgdGFic0J5R3JvdXBJZC5nZXQoZ3JvdXBJZCkhLnB1c2godGFiKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgIGlmICghdGFic0J5V2luZG93VW5ncm91cGVkLmhhcyh0YWIud2luZG93SWQpKSB0YWJzQnlXaW5kb3dVbmdyb3VwZWQuc2V0KHRhYi53aW5kb3dJZCwgW10pO1xuICAgICAgICAgICB0YWJzQnlXaW5kb3dVbmdyb3VwZWQuZ2V0KHRhYi53aW5kb3dJZCkhLnB1c2godGFiKTtcbiAgICAgIH1cbiAgfSk7XG5cbiAgLy8gQ3JlYXRlIFRhYkdyb3VwIG9iamVjdHMgZm9yIGFjdHVhbCBncm91cHNcbiAgZm9yIChjb25zdCBbZ3JvdXBJZCwgZ3JvdXBUYWJzXSBvZiB0YWJzQnlHcm91cElkKSB7XG4gICAgICBjb25zdCBicm93c2VyR3JvdXAgPSBncm91cE1hcC5nZXQoZ3JvdXBJZCk7XG4gICAgICBpZiAoYnJvd3Nlckdyb3VwKSB7XG4gICAgICAgICAgcmVzdWx0R3JvdXBzLnB1c2goe1xuICAgICAgICAgICAgICBpZDogYGdyb3VwLSR7Z3JvdXBJZH1gLFxuICAgICAgICAgICAgICB3aW5kb3dJZDogYnJvd3Nlckdyb3VwLndpbmRvd0lkLFxuICAgICAgICAgICAgICBsYWJlbDogYnJvd3Nlckdyb3VwLnRpdGxlIHx8IFwiVW50aXRsZWQgR3JvdXBcIixcbiAgICAgICAgICAgICAgY29sb3I6IGJyb3dzZXJHcm91cC5jb2xvcixcbiAgICAgICAgICAgICAgdGFiczogc29ydFRhYnMoZ3JvdXBUYWJzLCBwcmVmZXJlbmNlcy5zb3J0aW5nKSxcbiAgICAgICAgICAgICAgcmVhc29uOiBcIk1hbnVhbFwiXG4gICAgICAgICAgfSk7XG4gICAgICB9XG4gIH1cblxuICAvLyBIYW5kbGUgdW5ncm91cGVkIHRhYnNcbiAgZm9yIChjb25zdCBbd2luZG93SWQsIHRhYnNdIG9mIHRhYnNCeVdpbmRvd1VuZ3JvdXBlZCkge1xuICAgICAgcmVzdWx0R3JvdXBzLnB1c2goe1xuICAgICAgICAgIGlkOiBgdW5ncm91cGVkLSR7d2luZG93SWR9YCxcbiAgICAgICAgICB3aW5kb3dJZDogd2luZG93SWQsXG4gICAgICAgICAgbGFiZWw6IFwiVW5ncm91cGVkXCIsXG4gICAgICAgICAgY29sb3I6IFwiZ3JleVwiLFxuICAgICAgICAgIHRhYnM6IHNvcnRUYWJzKHRhYnMsIHByZWZlcmVuY2VzLnNvcnRpbmcpLFxuICAgICAgICAgIHJlYXNvbjogXCJVbmdyb3VwZWRcIlxuICAgICAgfSk7XG4gIH1cblxuICBsb2dJbmZvKFwiRmV0Y2hlZCBjdXJyZW50IHRhYiBncm91cHNcIiwgeyBncm91cHM6IHJlc3VsdEdyb3Vwcy5sZW5ndGgsIHRhYnM6IG1hcHBlZC5sZW5ndGggfSk7XG4gIHJldHVybiByZXN1bHRHcm91cHM7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBsb2dFcnJvcihcIkVycm9yIGluIGZldGNoQ3VycmVudFRhYkdyb3Vwc1wiLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgdGhyb3cgZTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGNhbGN1bGF0ZVRhYkdyb3VwcyA9IGFzeW5jIChcbiAgcHJlZmVyZW5jZXM6IFByZWZlcmVuY2VzLFxuICBmaWx0ZXI/OiBHcm91cGluZ1NlbGVjdGlvbixcbiAgb25Qcm9ncmVzcz86IChjb21wbGV0ZWQ6IG51bWJlciwgdG90YWw6IG51bWJlcikgPT4gdm9pZFxuKTogUHJvbWlzZTxUYWJHcm91cFtdPiA9PiB7XG4gIGNvbnN0IGNocm9tZVRhYnMgPSBhd2FpdCBnZXRUYWJzRm9yRmlsdGVyKGZpbHRlcik7XG4gIGNvbnN0IHdpbmRvd0lkU2V0ID0gbmV3IFNldChmaWx0ZXI/LndpbmRvd0lkcyA/PyBbXSk7XG4gIGNvbnN0IHRhYklkU2V0ID0gbmV3IFNldChmaWx0ZXI/LnRhYklkcyA/PyBbXSk7XG4gIGNvbnN0IGhhc0ZpbHRlcnMgPSB3aW5kb3dJZFNldC5zaXplID4gMCB8fCB0YWJJZFNldC5zaXplID4gMDtcbiAgY29uc3QgZmlsdGVyZWRUYWJzID0gY2hyb21lVGFicy5maWx0ZXIoKHRhYikgPT4ge1xuICAgIGlmICghaGFzRmlsdGVycykgcmV0dXJuIHRydWU7XG4gICAgcmV0dXJuICh0YWIud2luZG93SWQgJiYgd2luZG93SWRTZXQuaGFzKHRhYi53aW5kb3dJZCkpIHx8ICh0YWIuaWQgJiYgdGFiSWRTZXQuaGFzKHRhYi5pZCkpO1xuICB9KTtcbiAgY29uc3QgbWFwcGVkID0gZmlsdGVyZWRUYWJzXG4gICAgLm1hcChtYXBDaHJvbWVUYWIpXG4gICAgLmZpbHRlcigodGFiKTogdGFiIGlzIFRhYk1ldGFkYXRhID0+IEJvb2xlYW4odGFiKSk7XG5cbiAgaWYgKHJlcXVpcmVzQ29udGV4dEFuYWx5c2lzKHByZWZlcmVuY2VzLnNvcnRpbmcpKSB7XG4gICAgY29uc3QgY29udGV4dE1hcCA9IGF3YWl0IGFuYWx5emVUYWJDb250ZXh0KG1hcHBlZCwgb25Qcm9ncmVzcyk7XG4gICAgbWFwcGVkLmZvckVhY2godGFiID0+IHtcbiAgICAgIGNvbnN0IHJlcyA9IGNvbnRleHRNYXAuZ2V0KHRhYi5pZCk7XG4gICAgICB0YWIuY29udGV4dCA9IHJlcz8uY29udGV4dDtcbiAgICAgIHRhYi5jb250ZXh0RGF0YSA9IHJlcz8uZGF0YTtcbiAgICB9KTtcbiAgfVxuXG4gIGNvbnN0IGdyb3VwZWQgPSBncm91cFRhYnMobWFwcGVkLCBwcmVmZXJlbmNlcy5zb3J0aW5nKTtcbiAgZ3JvdXBlZC5mb3JFYWNoKChncm91cCkgPT4ge1xuICAgIGdyb3VwLnRhYnMgPSBzb3J0VGFicyhncm91cC50YWJzLCBwcmVmZXJlbmNlcy5zb3J0aW5nKTtcbiAgfSk7XG4gIGxvZ0luZm8oXCJDYWxjdWxhdGVkIHRhYiBncm91cHNcIiwgeyBncm91cHM6IGdyb3VwZWQubGVuZ3RoLCB0YWJzOiBtYXBwZWQubGVuZ3RoIH0pO1xuICByZXR1cm4gZ3JvdXBlZDtcbn07XG5cbmNvbnN0IFZBTElEX0NPTE9SUyA9IFtcImdyZXlcIiwgXCJibHVlXCIsIFwicmVkXCIsIFwieWVsbG93XCIsIFwiZ3JlZW5cIiwgXCJwaW5rXCIsIFwicHVycGxlXCIsIFwiY3lhblwiLCBcIm9yYW5nZVwiXTtcblxuZXhwb3J0IGNvbnN0IGFwcGx5VGFiR3JvdXBzID0gYXN5bmMgKGdyb3VwczogVGFiR3JvdXBbXSkgPT4ge1xuICBjb25zdCBjbGFpbWVkR3JvdXBJZHMgPSBuZXcgU2V0PG51bWJlcj4oKTtcblxuICBmb3IgKGNvbnN0IGdyb3VwIG9mIGdyb3Vwcykge1xuICAgIGxldCB0YWJzVG9Qcm9jZXNzOiB7IHdpbmRvd0lkOiBudW1iZXIsIHRhYnM6IFRhYk1ldGFkYXRhW10gfVtdID0gW107XG5cbiAgICBpZiAoZ3JvdXAud2luZG93TW9kZSA9PT0gJ25ldycpIHtcbiAgICAgIGlmIChncm91cC50YWJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBmaXJzdCA9IGdyb3VwLnRhYnNbMF07XG4gICAgICAgICAgY29uc3Qgd2luID0gYXdhaXQgY2hyb21lLndpbmRvd3MuY3JlYXRlKHsgdGFiSWQ6IGZpcnN0LmlkIH0pO1xuICAgICAgICAgIGNvbnN0IHdpbklkID0gd2luLmlkITtcbiAgICAgICAgICBjb25zdCBvdGhlcnMgPSBncm91cC50YWJzLnNsaWNlKDEpLm1hcCh0ID0+IHQuaWQpO1xuICAgICAgICAgIGlmIChvdGhlcnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMubW92ZShvdGhlcnMsIHsgd2luZG93SWQ6IHdpbklkLCBpbmRleDogLTEgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRhYnNUb1Byb2Nlc3MucHVzaCh7IHdpbmRvd0lkOiB3aW5JZCwgdGFiczogZ3JvdXAudGFicyB9KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIGxvZ0Vycm9yKFwiRXJyb3IgY3JlYXRpbmcgbmV3IHdpbmRvdyBmb3IgZ3JvdXBcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChncm91cC53aW5kb3dNb2RlID09PSAnY29tcG91bmQnKSB7XG4gICAgICBpZiAoZ3JvdXAudGFicy5sZW5ndGggPiAwKSB7XG4gICAgICAgIC8vIERldGVybWluZSB0YXJnZXQgd2luZG93IChtYWpvcml0eSB3aW5zKVxuICAgICAgICBjb25zdCBjb3VudHMgPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyPigpO1xuICAgICAgICBncm91cC50YWJzLmZvckVhY2godCA9PiBjb3VudHMuc2V0KHQud2luZG93SWQsIChjb3VudHMuZ2V0KHQud2luZG93SWQpIHx8IDApICsgMSkpO1xuICAgICAgICBsZXQgdGFyZ2V0V2luZG93SWQgPSBncm91cC50YWJzWzBdLndpbmRvd0lkO1xuICAgICAgICBsZXQgbWF4ID0gMDtcbiAgICAgICAgZm9yIChjb25zdCBbd2lkLCBjb3VudF0gb2YgY291bnRzKSB7XG4gICAgICAgICAgaWYgKGNvdW50ID4gbWF4KSB7IG1heCA9IGNvdW50OyB0YXJnZXRXaW5kb3dJZCA9IHdpZDsgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gTW92ZSB0YWJzIG5vdCBpbiB0YXJnZXRcbiAgICAgICAgY29uc3QgdG9Nb3ZlID0gZ3JvdXAudGFicy5maWx0ZXIodCA9PiB0LndpbmRvd0lkICE9PSB0YXJnZXRXaW5kb3dJZCkubWFwKHQgPT4gdC5pZCk7XG4gICAgICAgIGlmICh0b01vdmUubGVuZ3RoID4gMCkge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCBjaHJvbWUudGFicy5tb3ZlKHRvTW92ZSwgeyB3aW5kb3dJZDogdGFyZ2V0V2luZG93SWQsIGluZGV4OiAtMSB9KTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBsb2dFcnJvcihcIkVycm9yIG1vdmluZyB0YWJzIGZvciBjb21wb3VuZCBncm91cFwiLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRhYnNUb1Byb2Nlc3MucHVzaCh7IHdpbmRvd0lkOiB0YXJnZXRXaW5kb3dJZCwgdGFiczogZ3JvdXAudGFicyB9KTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy8gQ3VycmVudCBtb2RlOiBzcGxpdCBieSBzb3VyY2Ugd2luZG93XG4gICAgICBjb25zdCBtYXAgPSBncm91cC50YWJzLnJlZHVjZTxNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YVtdPj4oKGFjYywgdGFiKSA9PiB7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nID0gYWNjLmdldCh0YWIud2luZG93SWQpID8/IFtdO1xuICAgICAgICBleGlzdGluZy5wdXNoKHRhYik7XG4gICAgICAgIGFjYy5zZXQodGFiLndpbmRvd0lkLCBleGlzdGluZyk7XG4gICAgICAgIHJldHVybiBhY2M7XG4gICAgICB9LCBuZXcgTWFwKCkpO1xuICAgICAgZm9yIChjb25zdCBbd2lkLCB0XSBvZiBtYXApIHtcbiAgICAgICAgdGFic1RvUHJvY2Vzcy5wdXNoKHsgd2luZG93SWQ6IHdpZCwgdGFiczogdCB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IHsgd2luZG93SWQ6IHRhcmdldFdpbklkLCB0YWJzIH0gb2YgdGFic1RvUHJvY2Vzcykge1xuICAgICAgLy8gRmluZCBjYW5kaWRhdGUgZ3JvdXAgSUQgdG8gcmV1c2VcbiAgICAgIGxldCBjYW5kaWRhdGVHcm91cElkOiBudW1iZXIgfCB1bmRlZmluZWQ7XG4gICAgICBjb25zdCBjb3VudHMgPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyPigpO1xuICAgICAgZm9yIChjb25zdCB0IG9mIHRhYnMpIHtcbiAgICAgICAgLy8gT25seSBjb25zaWRlciBncm91cHMgdGhhdCB3ZXJlIGFscmVhZHkgaW4gdGhpcyB3aW5kb3dcbiAgICAgICAgaWYgKHQuZ3JvdXBJZCAmJiB0Lmdyb3VwSWQgIT09IC0xICYmIHQud2luZG93SWQgPT09IHRhcmdldFdpbklkKSB7XG4gICAgICAgICAgY291bnRzLnNldCh0Lmdyb3VwSWQsIChjb3VudHMuZ2V0KHQuZ3JvdXBJZCkgfHwgMCkgKyAxKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBQcmlvcml0aXplIHRoZSBtb3N0IGZyZXF1ZW50IGdyb3VwIElEIHRoYXQgaGFzbid0IGJlZW4gY2xhaW1lZCB5ZXRcbiAgICAgIGNvbnN0IHNvcnRlZENhbmRpZGF0ZXMgPSBBcnJheS5mcm9tKGNvdW50cy5lbnRyaWVzKCkpXG4gICAgICAgIC5zb3J0KChhLCBiKSA9PiBiWzFdIC0gYVsxXSlcbiAgICAgICAgLm1hcCgoW2lkXSkgPT4gaWQpO1xuXG4gICAgICBmb3IgKGNvbnN0IGlkIG9mIHNvcnRlZENhbmRpZGF0ZXMpIHtcbiAgICAgICAgaWYgKCFjbGFpbWVkR3JvdXBJZHMuaGFzKGlkKSkge1xuICAgICAgICAgIGNhbmRpZGF0ZUdyb3VwSWQgPSBpZDtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBGYWxsYmFjazogSWYgbm8gY2FuZGlkYXRlIGdyb3VwIElEIGZyb20gdGFicyAoZS5nLiBzaW5nbGUgbmV3IHRhYiksIGxvb2sgZm9yIGV4aXN0aW5nIGdyb3VwIGJ5IGxhYmVsIGluIHRhcmdldCB3aW5kb3dcbiAgICAgIGlmIChjYW5kaWRhdGVHcm91cElkID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgY29uc3Qgd2luZG93R3JvdXBzID0gYXdhaXQgY2hyb21lLnRhYkdyb3Vwcy5xdWVyeSh7IHdpbmRvd0lkOiB0YXJnZXRXaW5JZCB9KTtcbiAgICAgICAgICAgLy8gRmluZCBhIGdyb3VwIHdpdGggdGhlIHNhbWUgdGl0bGUgdGhhdCBoYXNuJ3QgYmVlbiBjbGFpbWVkIHlldFxuICAgICAgICAgICBjb25zdCBtYXRjaGluZ0dyb3VwID0gd2luZG93R3JvdXBzLmZpbmQoZyA9PiBnLnRpdGxlID09PSBncm91cC5sYWJlbCAmJiAhY2xhaW1lZEdyb3VwSWRzLmhhcyhnLmlkKSk7XG4gICAgICAgICAgIGlmIChtYXRjaGluZ0dyb3VwKSB7XG4gICAgICAgICAgICAgY2FuZGlkYXRlR3JvdXBJZCA9IG1hdGNoaW5nR3JvdXAuaWQ7XG4gICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICBsb2dFcnJvcihcIkVycm9yIGZpbmRpbmcgbWF0Y2hpbmcgZ3JvdXAgYnkgbGFiZWxcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGxldCBmaW5hbEdyb3VwSWQ6IG51bWJlcjtcblxuICAgICAgaWYgKGNhbmRpZGF0ZUdyb3VwSWQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBjbGFpbWVkR3JvdXBJZHMuYWRkKGNhbmRpZGF0ZUdyb3VwSWQpO1xuICAgICAgICBmaW5hbEdyb3VwSWQgPSBjYW5kaWRhdGVHcm91cElkO1xuXG4gICAgICAgIC8vIENsZWFuIHVwIGxlZnRvdmVycyBhbmQgYWRkIG1pc3NpbmcgdGFic1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGV4aXN0aW5nVGFicyA9IGF3YWl0IGNocm9tZS50YWJzLnF1ZXJ5KHsgZ3JvdXBJZDogZmluYWxHcm91cElkIH0pO1xuICAgICAgICAgIGNvbnN0IGV4aXN0aW5nVGFiSWRzID0gbmV3IFNldChleGlzdGluZ1RhYnMubWFwKHQgPT4gdC5pZCkpO1xuICAgICAgICAgIGNvbnN0IHRhcmdldFRhYklkcyA9IG5ldyBTZXQodGFicy5tYXAodCA9PiB0LmlkKSk7XG5cbiAgICAgICAgICAvLyAxLiBVbmdyb3VwIHRhYnMgdGhhdCBzaG91bGRuJ3QgYmUgaGVyZVxuICAgICAgICAgIGNvbnN0IGxlZnRvdmVycyA9IGV4aXN0aW5nVGFicy5maWx0ZXIodCA9PiB0LmlkICE9PSB1bmRlZmluZWQgJiYgIXRhcmdldFRhYklkcy5oYXModC5pZCkpO1xuICAgICAgICAgIGlmIChsZWZ0b3ZlcnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMudW5ncm91cChsZWZ0b3ZlcnMubWFwKHQgPT4gdC5pZCEpKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyAyLiBBZGQgb25seSB0aGUgdGFicyB0aGF0IGFyZW4ndCBhbHJlYWR5IGluIHRoZSBncm91cFxuICAgICAgICAgIGNvbnN0IHRhYnNUb0FkZCA9IHRhYnMuZmlsdGVyKHQgPT4gIWV4aXN0aW5nVGFiSWRzLmhhcyh0LmlkKSk7XG4gICAgICAgICAgaWYgKHRhYnNUb0FkZC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgLy8gRm9yIG5ldy9jb21wb3VuZCwgdGFicyBtaWdodCBoYXZlIGJlZW4gbW92ZWQsIHNvIHdlIG11c3QgcGFzcyB0YWJJZHNcbiAgICAgICAgICAgICBhd2FpdCBjaHJvbWUudGFicy5ncm91cCh7IGdyb3VwSWQ6IGZpbmFsR3JvdXBJZCwgdGFiSWRzOiB0YWJzVG9BZGQubWFwKHQgPT4gdC5pZCkgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgbG9nRXJyb3IoXCJFcnJvciBtYW5hZ2luZyBncm91cCByZXVzZVwiLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIENyZWF0ZSBuZXcgZ3JvdXAgKGRlZmF1bHQgYmVoYXZpb3I6IGV4cGFuZGVkKVxuICAgICAgICAvLyBFbnN1cmUgd2UgY3JlYXRlIGl0IGluIHRoZSB0YXJnZXQgd2luZG93IChpZiBzdHJpY3RseSBuZXcsIHRhYklkcyBpbXBsaWVzIHdpbmRvdyBpZiB0aGV5IGFyZSBpbiBpdClcbiAgICAgICAgLy8gSWYgdGFicyB3ZXJlIGp1c3QgbW92ZWQsIHRoZXkgYXJlIGluIHRhcmdldFdpbklkLlxuICAgICAgICAvLyBjaHJvbWUudGFicy5ncm91cCB3aXRoIHRhYklkcyB3aWxsIGluZmVyIHdpbmRvdyBmcm9tIHRhYnMuXG4gICAgICAgIGZpbmFsR3JvdXBJZCA9IGF3YWl0IGNocm9tZS50YWJzLmdyb3VwKHtcbiAgICAgICAgICB0YWJJZHM6IHRhYnMubWFwKHQgPT4gdC5pZCksXG4gICAgICAgICAgY3JlYXRlUHJvcGVydGllczogeyB3aW5kb3dJZDogdGFyZ2V0V2luSWQgfVxuICAgICAgICB9KTtcbiAgICAgICAgY2xhaW1lZEdyb3VwSWRzLmFkZChmaW5hbEdyb3VwSWQpO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB1cGRhdGVQcm9wczogY2hyb21lLnRhYkdyb3Vwcy5VcGRhdGVQcm9wZXJ0aWVzID0ge1xuICAgICAgICB0aXRsZTogZ3JvdXAubGFiZWxcbiAgICAgIH07XG4gICAgICBpZiAoVkFMSURfQ09MT1JTLmluY2x1ZGVzKGdyb3VwLmNvbG9yKSkge1xuICAgICAgICAgIHVwZGF0ZVByb3BzLmNvbG9yID0gZ3JvdXAuY29sb3IgYXMgY2hyb21lLnRhYkdyb3Vwcy5Db2xvckVudW07XG4gICAgICB9XG4gICAgICBhd2FpdCBjaHJvbWUudGFiR3JvdXBzLnVwZGF0ZShmaW5hbEdyb3VwSWQsIHVwZGF0ZVByb3BzKTtcbiAgICB9XG4gIH1cbiAgbG9nSW5mbyhcIkFwcGxpZWQgdGFiIGdyb3Vwc1wiLCB7IGNvdW50OiBncm91cHMubGVuZ3RoIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IGFwcGx5VGFiU29ydGluZyA9IGFzeW5jIChcbiAgcHJlZmVyZW5jZXM6IFByZWZlcmVuY2VzLFxuICBmaWx0ZXI/OiBHcm91cGluZ1NlbGVjdGlvbixcbiAgb25Qcm9ncmVzcz86IChjb21wbGV0ZWQ6IG51bWJlciwgdG90YWw6IG51bWJlcikgPT4gdm9pZFxuKSA9PiB7XG4gIGNvbnN0IHRhcmdldFdpbmRvd0lkcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuICBsZXQgY2hyb21lVGFiczogY2hyb21lLnRhYnMuVGFiW10gPSBbXTtcblxuICBjb25zdCBleHBsaWNpdFdpbmRvd0lkcyA9IGZpbHRlcj8ud2luZG93SWRzID8/IFtdO1xuICBjb25zdCBleHBsaWNpdFRhYklkcyA9IGZpbHRlcj8udGFiSWRzID8/IFtdO1xuICBjb25zdCBoYXNGaWx0ZXIgPSBleHBsaWNpdFdpbmRvd0lkcy5sZW5ndGggPiAwIHx8IGV4cGxpY2l0VGFiSWRzLmxlbmd0aCA+IDA7XG5cbiAgaWYgKCFoYXNGaWx0ZXIpIHtcbiAgICAgIGNocm9tZVRhYnMgPSBhd2FpdCBjaHJvbWUudGFicy5xdWVyeSh7fSk7XG4gICAgICBjaHJvbWVUYWJzLmZvckVhY2godCA9PiB7IGlmICh0LndpbmRvd0lkKSB0YXJnZXRXaW5kb3dJZHMuYWRkKHQud2luZG93SWQpOyB9KTtcbiAgfSBlbHNlIHtcbiAgICAgIGV4cGxpY2l0V2luZG93SWRzLmZvckVhY2goaWQgPT4gdGFyZ2V0V2luZG93SWRzLmFkZChpZCkpO1xuXG4gICAgICBpZiAoZXhwbGljaXRUYWJJZHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNvbnN0IHNwZWNpZmljVGFicyA9IGF3YWl0IFByb21pc2UuYWxsKGV4cGxpY2l0VGFiSWRzLm1hcChpZCA9PiBjaHJvbWUudGFicy5nZXQoaWQpLmNhdGNoKCgpID0+IG51bGwpKSk7XG4gICAgICAgICAgc3BlY2lmaWNUYWJzLmZvckVhY2godCA9PiB7XG4gICAgICAgICAgICAgIGlmICh0ICYmIHQud2luZG93SWQpIHRhcmdldFdpbmRvd0lkcy5hZGQodC53aW5kb3dJZCk7XG4gICAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHdpbmRvd1Byb21pc2VzID0gQXJyYXkuZnJvbSh0YXJnZXRXaW5kb3dJZHMpLm1hcCh3aW5kb3dJZCA9PlxuICAgICAgICAgIGNocm9tZS50YWJzLnF1ZXJ5KHsgd2luZG93SWQgfSkuY2F0Y2goKCkgPT4gW10pXG4gICAgICApO1xuICAgICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKHdpbmRvd1Byb21pc2VzKTtcbiAgICAgIGNocm9tZVRhYnMgPSByZXN1bHRzLmZsYXQoKTtcbiAgfVxuXG4gIGZvciAoY29uc3Qgd2luZG93SWQgb2YgdGFyZ2V0V2luZG93SWRzKSB7XG4gICAgICBjb25zdCB3aW5kb3dUYWJzID0gY2hyb21lVGFicy5maWx0ZXIodCA9PiB0LndpbmRvd0lkID09PSB3aW5kb3dJZCk7XG4gICAgICBjb25zdCBtYXBwZWQgPSB3aW5kb3dUYWJzLm1hcChtYXBDaHJvbWVUYWIpLmZpbHRlcigodCk6IHQgaXMgVGFiTWV0YWRhdGEgPT4gQm9vbGVhbih0KSk7XG5cbiAgICAgIGlmIChyZXF1aXJlc0NvbnRleHRBbmFseXNpcyhwcmVmZXJlbmNlcy5zb3J0aW5nKSkge1xuICAgICAgICBjb25zdCBjb250ZXh0TWFwID0gYXdhaXQgYW5hbHl6ZVRhYkNvbnRleHQobWFwcGVkLCBvblByb2dyZXNzKTtcbiAgICAgICAgbWFwcGVkLmZvckVhY2godGFiID0+IHtcbiAgICAgICAgICBjb25zdCByZXMgPSBjb250ZXh0TWFwLmdldCh0YWIuaWQpO1xuICAgICAgICAgIHRhYi5jb250ZXh0ID0gcmVzPy5jb250ZXh0O1xuICAgICAgICAgIHRhYi5jb250ZXh0RGF0YSA9IHJlcz8uZGF0YTtcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIC8vIEdyb3VwIHRhYnMgYnkgZ3JvdXBJZCB0byBzb3J0IHdpdGhpbiBncm91cHNcbiAgICAgIGNvbnN0IHRhYnNCeUdyb3VwID0gbmV3IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhW10+KCk7XG4gICAgICBjb25zdCB1bmdyb3VwZWRUYWJzOiBUYWJNZXRhZGF0YVtdID0gW107XG5cbiAgICAgIG1hcHBlZC5mb3JFYWNoKHRhYiA9PiB7XG4gICAgICAgIGNvbnN0IGdyb3VwSWQgPSB0YWIuZ3JvdXBJZCA/PyAtMTtcbiAgICAgICAgaWYgKGdyb3VwSWQgIT09IC0xKSB7XG4gICAgICAgICAgY29uc3QgZ3JvdXAgPSB0YWJzQnlHcm91cC5nZXQoZ3JvdXBJZCkgPz8gW107XG4gICAgICAgICAgZ3JvdXAucHVzaCh0YWIpO1xuICAgICAgICAgIHRhYnNCeUdyb3VwLnNldChncm91cElkLCBncm91cCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdW5ncm91cGVkVGFicy5wdXNoKHRhYik7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICAvLyAxLiBTb3J0IHRhYnMgd2l0aGluIGVhY2ggZ3JvdXBcbiAgICAgIGZvciAoY29uc3QgW2dyb3VwSWQsIHRhYnNdIG9mIHRhYnNCeUdyb3VwKSB7XG4gICAgICAgIGNvbnN0IGdyb3VwVGFiSW5kaWNlcyA9IHdpbmRvd1RhYnNcbiAgICAgICAgICAuZmlsdGVyKHQgPT4gdC5ncm91cElkID09PSBncm91cElkKVxuICAgICAgICAgIC5tYXAodCA9PiB0LmluZGV4KVxuICAgICAgICAgIC5zb3J0KChhLCBiKSA9PiBhIC0gYik7XG5cbiAgICAgICAgY29uc3Qgc3RhcnRJbmRleCA9IGdyb3VwVGFiSW5kaWNlc1swXSA/PyAwO1xuXG4gICAgICAgIGNvbnN0IHNvcnRlZEdyb3VwVGFicyA9IHNvcnRUYWJzKHRhYnMsIHByZWZlcmVuY2VzLnNvcnRpbmcpO1xuICAgICAgICBjb25zdCBzb3J0ZWRJZHMgPSBzb3J0ZWRHcm91cFRhYnMubWFwKHQgPT4gdC5pZCk7XG5cbiAgICAgICAgaWYgKHNvcnRlZElkcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgIGF3YWl0IGNocm9tZS50YWJzLm1vdmUoc29ydGVkSWRzLCB7IGluZGV4OiBzdGFydEluZGV4IH0pO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIDIuIFNvcnQgdW5ncm91cGVkIHRhYnNcbiAgICAgIGlmICh1bmdyb3VwZWRUYWJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29uc3Qgc29ydGVkVW5ncm91cGVkID0gc29ydFRhYnModW5ncm91cGVkVGFicywgcHJlZmVyZW5jZXMuc29ydGluZyk7XG4gICAgICAgIGNvbnN0IHNvcnRlZElkcyA9IHNvcnRlZFVuZ3JvdXBlZC5tYXAodCA9PiB0LmlkKTtcblxuICAgICAgICAvLyBNb3ZlIHRvIGluZGV4IDAgKHRvcCBvZiB3aW5kb3cpXG4gICAgICAgIGF3YWl0IGNocm9tZS50YWJzLm1vdmUoc29ydGVkSWRzLCB7IGluZGV4OiAwIH0pO1xuICAgICAgfVxuXG4gICAgICAvLyAzLiBTb3J0IEdyb3VwcyAoaWYgZW5hYmxlZClcbiAgICAgIGF3YWl0IHNvcnRHcm91cHNJZkVuYWJsZWQod2luZG93SWQsIHByZWZlcmVuY2VzLnNvcnRpbmcsIHRhYnNCeUdyb3VwKTtcbiAgfVxuICBsb2dJbmZvKFwiQXBwbGllZCB0YWIgc29ydGluZ1wiKTtcbn07XG5cbmNvbnN0IGNvbXBhcmVCeVNvcnRpbmdSdWxlcyA9IChzb3J0aW5nUnVsZXNBcmc6IFNvcnRpbmdSdWxlW10sIGE6IFRhYk1ldGFkYXRhLCBiOiBUYWJNZXRhZGF0YSk6IG51bWJlciA9PiB7XG4gIGNvbnN0IHNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihzb3J0aW5nUnVsZXNBcmcpO1xuICBpZiAoc29ydFJ1bGVzTGlzdC5sZW5ndGggPT09IDApIHJldHVybiAwO1xuXG4gIHRyeSB7XG4gICAgZm9yIChjb25zdCBydWxlIG9mIHNvcnRSdWxlc0xpc3QpIHtcbiAgICAgIGlmICghcnVsZSkgY29udGludWU7XG4gICAgICBjb25zdCB2YWxBID0gZ2V0RmllbGRWYWx1ZShhLCBydWxlLmZpZWxkKTtcbiAgICAgIGNvbnN0IHZhbEIgPSBnZXRGaWVsZFZhbHVlKGIsIHJ1bGUuZmllbGQpO1xuXG4gICAgICBsZXQgcmVzdWx0ID0gMDtcbiAgICAgIGlmICh2YWxBIDwgdmFsQikgcmVzdWx0ID0gLTE7XG4gICAgICBlbHNlIGlmICh2YWxBID4gdmFsQikgcmVzdWx0ID0gMTtcblxuICAgICAgaWYgKHJlc3VsdCAhPT0gMCkge1xuICAgICAgICByZXR1cm4gcnVsZS5vcmRlciA9PT0gXCJkZXNjXCIgPyAtcmVzdWx0IDogcmVzdWx0O1xuICAgICAgfVxuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBsb2dFcnJvcihcIkVycm9yIGV2YWx1YXRpbmcgc29ydGluZyBydWxlc1wiLCB7IGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICB9XG5cbiAgcmV0dXJuIDA7XG59O1xuXG5jb25zdCBzb3J0R3JvdXBzSWZFbmFibGVkID0gYXN5bmMgKFxuICAgIHdpbmRvd0lkOiBudW1iZXIsXG4gICAgc29ydGluZ1ByZWZlcmVuY2VzOiBzdHJpbmdbXSxcbiAgICB0YWJzQnlHcm91cDogTWFwPG51bWJlciwgVGFiTWV0YWRhdGFbXT5cbikgPT4ge1xuICAgIC8vIENoZWNrIGlmIGFueSBhY3RpdmUgc3RyYXRlZ3kgaGFzIHNvcnRHcm91cHM6IHRydWVcbiAgICBjb25zdCBjdXN0b21TdHJhdHMgPSBnZXRDdXN0b21TdHJhdGVnaWVzKCk7XG4gICAgbGV0IGdyb3VwU29ydGVyU3RyYXRlZ3k6IFJldHVyblR5cGU8dHlwZW9mIGN1c3RvbVN0cmF0cy5maW5kPiB8IG51bGwgPSBudWxsO1xuXG4gICAgZm9yIChjb25zdCBpZCBvZiBzb3J0aW5nUHJlZmVyZW5jZXMpIHtcbiAgICAgICAgY29uc3Qgc3RyYXRlZ3kgPSBjdXN0b21TdHJhdHMuZmluZChzID0+IHMuaWQgPT09IGlkKTtcbiAgICAgICAgaWYgKHN0cmF0ZWd5ICYmIChzdHJhdGVneS5zb3J0R3JvdXBzIHx8IChzdHJhdGVneS5ncm91cFNvcnRpbmdSdWxlcyAmJiBzdHJhdGVneS5ncm91cFNvcnRpbmdSdWxlcy5sZW5ndGggPiAwKSkpIHtcbiAgICAgICAgICAgIGdyb3VwU29ydGVyU3RyYXRlZ3kgPSBzdHJhdGVneTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKCFncm91cFNvcnRlclN0cmF0ZWd5KSByZXR1cm47XG5cbiAgICAvLyBHZXQgZ3JvdXAgZGV0YWlsc1xuICAgIGNvbnN0IGdyb3VwcyA9IGF3YWl0IGNocm9tZS50YWJHcm91cHMucXVlcnkoeyB3aW5kb3dJZCB9KTtcbiAgICBpZiAoZ3JvdXBzLmxlbmd0aCA8PSAxKSByZXR1cm47XG5cbiAgICAvLyBXZSBzb3J0IGdyb3VwcyBiYXNlZCBvbiB0aGUgc3RyYXRlZ3kuXG4gICAgLy8gU2luY2UgY29tcGFyZUJ5IGV4cGVjdHMgVGFiTWV0YWRhdGEsIHdlIG5lZWQgdG8gY3JlYXRlIGEgcmVwcmVzZW50YXRpdmUgVGFiTWV0YWRhdGEgZm9yIGVhY2ggZ3JvdXAuXG4gICAgLy8gV2UnbGwgdXNlIHRoZSBmaXJzdCB0YWIgb2YgdGhlIGdyb3VwIChzb3J0ZWQpIGFzIHRoZSByZXByZXNlbnRhdGl2ZS5cblxuICAgIGNvbnN0IGdyb3VwUmVwczogeyBncm91cDogY2hyb21lLnRhYkdyb3Vwcy5UYWJHcm91cDsgcmVwOiBUYWJNZXRhZGF0YSB9W10gPSBbXTtcblxuICAgIGZvciAoY29uc3QgZ3JvdXAgb2YgZ3JvdXBzKSB7XG4gICAgICAgIGNvbnN0IHRhYnMgPSB0YWJzQnlHcm91cC5nZXQoZ3JvdXAuaWQpO1xuICAgICAgICBpZiAodGFicyAmJiB0YWJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIC8vIHRhYnMgYXJlIGFscmVhZHkgc29ydGVkIGJ5IHNvcnRUYWJzIGluIHByZXZpb3VzIHN0ZXAgaWYgdGhhdCBzdHJhdGVneSB3YXMgYXBwbGllZFxuICAgICAgICAgICAgLy8gb3Igd2UganVzdCB0YWtlIHRoZSBmaXJzdCBvbmUuXG4gICAgICAgICAgICAvLyBJZGVhbGx5IHdlIHVzZSB0aGUgXCJiZXN0XCIgdGFiLlxuICAgICAgICAgICAgLy8gQnV0IHNpbmNlIHdlIGFscmVhZHkgc29ydGVkIHRhYnMgd2l0aGluIGdyb3VwcywgdGFic1swXSBpcyB0aGUgZmlyc3Qgb25lLlxuICAgICAgICAgICAgZ3JvdXBSZXBzLnB1c2goeyBncm91cCwgcmVwOiB0YWJzWzBdIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gU29ydCB0aGUgZ3JvdXBzXG4gICAgaWYgKGdyb3VwU29ydGVyU3RyYXRlZ3kuZ3JvdXBTb3J0aW5nUnVsZXMgJiYgQXJyYXkuaXNBcnJheShncm91cFNvcnRlclN0cmF0ZWd5Lmdyb3VwU29ydGluZ1J1bGVzKSAmJiBncm91cFNvcnRlclN0cmF0ZWd5Lmdyb3VwU29ydGluZ1J1bGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgZ3JvdXBSZXBzLnNvcnQoKGEsIGIpID0+IGNvbXBhcmVCeVNvcnRpbmdSdWxlcyhncm91cFNvcnRlclN0cmF0ZWd5IS5ncm91cFNvcnRpbmdSdWxlcyEsIGEucmVwLCBiLnJlcCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGdyb3VwUmVwcy5zb3J0KChhLCBiKSA9PiBjb21wYXJlQnkoZ3JvdXBTb3J0ZXJTdHJhdGVneSEuaWQsIGEucmVwLCBiLnJlcCkpO1xuICAgIH1cblxuICAgIC8vIEFwcGx5IHRoZSBvcmRlclxuICAgIC8vIGNocm9tZS50YWJHcm91cHMubW92ZShncm91cElkLCB7IGluZGV4OiAuLi4gfSlcbiAgICAvLyBXZSB3YW50IHRoZW0gdG8gYmUgYWZ0ZXIgdW5ncm91cGVkIHRhYnMgKHdoaWNoIGFyZSBhdCBpbmRleCAwLi5OKS5cbiAgICAvLyBBY3R1YWxseSwgY2hyb21lLnRhYkdyb3Vwcy5tb3ZlIGluZGV4IGlzIHRoZSB0YWIgaW5kZXggd2hlcmUgdGhlIGdyb3VwIHN0YXJ0cy5cbiAgICAvLyBJZiB3ZSB3YW50IHRvIHN0cmljdGx5IG9yZGVyIGdyb3Vwcywgd2Ugc2hvdWxkIGNhbGN1bGF0ZSB0aGUgdGFyZ2V0IGluZGV4LlxuICAgIC8vIEJ1dCBzaW5jZSBncm91cHMgYXJlIGNvbnRpZ3VvdXMgYmxvY2tzIG9mIHRhYnMsIHdlIGp1c3QgbmVlZCB0byBwbGFjZSB0aGVtIGluIG9yZGVyLlxuXG4gICAgLy8gQ2FsY3VsYXRlIHRoZSBzdGFydGluZyBpbmRleCBmb3IgZ3JvdXBzLlxuICAgIC8vIFVuZ3JvdXBlZCB0YWJzIGFyZSBhdCB0aGUgc3RhcnQgKGluZGV4IDApLlxuICAgIC8vIFNvIHRoZSBmaXJzdCBncm91cCBzaG91bGQgc3RhcnQgYWZ0ZXIgdGhlIGxhc3QgdW5ncm91cGVkIHRhYi5cbiAgICAvLyBXYWl0LCBlYXJsaWVyIHdlIG1vdmVkIHVuZ3JvdXBlZCB0YWJzIHRvIGluZGV4IDAuXG4gICAgLy8gQnV0IHdlIG5lZWQgdG8ga25vdyBob3cgbWFueSB1bmdyb3VwZWQgdGFicyB0aGVyZSBhcmUgaW4gdGhpcyB3aW5kb3cuXG5cbiAgICAvLyBMZXQncyBnZXQgY3VycmVudCB0YWJzIGFnYWluIG9yIHRyYWNrIGNvdW50P1xuICAgIC8vIFdlIGNhbiBhc3N1bWUgdW5ncm91cGVkIHRhYnMgYXJlIGF0IHRoZSB0b3AuXG4gICAgLy8gQnV0IGB0YWJzQnlHcm91cGAgb25seSBjb250YWlucyBncm91cGVkIHRhYnMuXG4gICAgLy8gV2UgbmVlZCB0byBrbm93IHdoZXJlIHRvIHN0YXJ0IHBsYWNpbmcgZ3JvdXBzLlxuICAgIC8vIFRoZSBzYWZlc3Qgd2F5IGlzIHRvIG1vdmUgdGhlbSBvbmUgYnkgb25lIHRvIHRoZSBlbmQgKG9yIHNwZWNpZmljIGluZGV4KS5cblxuICAgIC8vIElmIHdlIGp1c3QgbW92ZSB0aGVtIGluIG9yZGVyIHRvIGluZGV4IC0xLCB0aGV5IHdpbGwgYXBwZW5kIHRvIHRoZSBlbmQuXG4gICAgLy8gSWYgd2Ugd2FudCB0aGVtIGFmdGVyIHVuZ3JvdXBlZCB0YWJzLCB3ZSBuZWVkIHRvIGZpbmQgdGhlIGluZGV4LlxuXG4gICAgLy8gTGV0J3MgdXNlIGluZGV4ID0gLTEgdG8gcHVzaCB0byBlbmQsIHNlcXVlbnRpYWxseS5cbiAgICAvLyBCdXQgd2FpdCwgaWYgd2UgcHVzaCB0byBlbmQsIHRoZSBvcmRlciBpcyBwcmVzZXJ2ZWQ/XG4gICAgLy8gTm8sIGlmIHdlIGl0ZXJhdGUgc29ydGVkIGdyb3VwcyBhbmQgbW92ZSBlYWNoIHRvIC0xLCB0aGUgbGFzdCBvbmUgbW92ZWQgd2lsbCBiZSBhdCB0aGUgZW5kLlxuICAgIC8vIFNvIHdlIHNob3VsZCBpdGVyYXRlIGluIG9yZGVyIGFuZCBtb3ZlIHRvIC0xPyBObywgdGhhdCB3b3VsZCByZXZlcnNlIHRoZW0gaWYgd2UgY29uc2lkZXIgXCJlbmRcIi5cbiAgICAvLyBBY3R1YWxseSwgaWYgd2UgbW92ZSBHcm91cCBBIHRvIC0xLCBpdCBnb2VzIHRvIGVuZC4gVGhlbiBHcm91cCBCIHRvIC0xLCBpdCBnb2VzIGFmdGVyIEEuXG4gICAgLy8gU28gaXRlcmF0aW5nIGluIHNvcnRlZCBvcmRlciBhbmQgbW92aW5nIHRvIC0xIHdvcmtzIHRvIGFycmFuZ2UgdGhlbSBhdCB0aGUgZW5kIG9mIHRoZSB3aW5kb3cuXG5cbiAgICAvLyBIb3dldmVyLCBpZiB0aGVyZSBhcmUgcGlubmVkIHRhYnMgb3IgdW5ncm91cGVkIHRhYnMsIHRoZXkgc2hvdWxkIHN0YXkgYXQgdG9wP1xuICAgIC8vIFVuZ3JvdXBlZCB0YWJzIHdlcmUgbW92ZWQgdG8gaW5kZXggMC5cbiAgICAvLyBQaW5uZWQgdGFiczogYGNocm9tZS50YWJzLm1vdmVgIGhhbmRsZXMgcGlubmVkIGNvbnN0cmFpbnQgKHBpbm5lZCB0YWJzIG11c3QgYmUgZmlyc3QpLlxuICAgIC8vIEdyb3VwcyBjYW5ub3QgY29udGFpbiBwaW5uZWQgdGFicy5cbiAgICAvLyBTbyBncm91cHMgd2lsbCBiZSBhZnRlciBwaW5uZWQgdGFicy5cbiAgICAvLyBJZiB3ZSBtb3ZlIHRvIC0xLCB0aGV5IGdvIHRvIHRoZSB2ZXJ5IGVuZC5cblxuICAgIC8vIFdoYXQgaWYgd2Ugd2FudCB0aGVtIHNwZWNpZmljYWxseSBhcnJhbmdlZD9cbiAgICAvLyBJZiB3ZSBtb3ZlIHRoZW0gc2VxdWVudGlhbGx5IHRvIC0xLCB0aGV5IHdpbGwgYmUgb3JkZXJlZCBBLCBCLCBDLi4uIGF0IHRoZSBib3R0b20uXG4gICAgLy8gVGhpcyBzZWVtcyBjb3JyZWN0IGZvciBcInNvcnRpbmcgZ3JvdXBzXCIuXG5cbiAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgZ3JvdXBSZXBzKSB7XG4gICAgICAgIGF3YWl0IGNocm9tZS50YWJHcm91cHMubW92ZShpdGVtLmdyb3VwLmlkLCB7IGluZGV4OiAtMSB9KTtcbiAgICB9XG59O1xuXG5leHBvcnQgY29uc3QgY2xvc2VHcm91cCA9IGFzeW5jIChncm91cDogVGFiR3JvdXApID0+IHtcbiAgY29uc3QgaWRzID0gZ3JvdXAudGFicy5tYXAoKHRhYikgPT4gdGFiLmlkKTtcbiAgYXdhaXQgY2hyb21lLnRhYnMucmVtb3ZlKGlkcyk7XG4gIGxvZ0luZm8oXCJDbG9zZWQgZ3JvdXBcIiwgeyBsYWJlbDogZ3JvdXAubGFiZWwsIGNvdW50OiBpZHMubGVuZ3RoIH0pO1xufTtcblxuY29uc3QgZ2V0VGFic0J5SWRzID0gYXN5bmMgKHRhYklkczogbnVtYmVyW10pOiBQcm9taXNlPGNocm9tZS50YWJzLlRhYltdPiA9PiB7XG4gIGlmICghdGFiSWRzLmxlbmd0aCkgcmV0dXJuIFtdO1xuICBjb25zdCBhbGxUYWJzID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoe30pO1xuICBjb25zdCB0YWJNYXAgPSBuZXcgTWFwKGFsbFRhYnMubWFwKHQgPT4gW3QuaWQsIHRdKSk7XG4gIHJldHVybiB0YWJJZHNcbiAgICAubWFwKGlkID0+IHRhYk1hcC5nZXQoaWQpKVxuICAgIC5maWx0ZXIoKHQpOiB0IGlzIGNocm9tZS50YWJzLlRhYiA9PiB0ICE9PSB1bmRlZmluZWQgJiYgdC5pZCAhPT0gdW5kZWZpbmVkICYmIHQud2luZG93SWQgIT09IHVuZGVmaW5lZCk7XG59O1xuXG5leHBvcnQgY29uc3QgbWVyZ2VUYWJzID0gYXN5bmMgKHRhYklkczogbnVtYmVyW10pID0+IHtcbiAgaWYgKCF0YWJJZHMubGVuZ3RoKSByZXR1cm47XG4gIGNvbnN0IHZhbGlkVGFicyA9IGF3YWl0IGdldFRhYnNCeUlkcyh0YWJJZHMpO1xuXG4gIGlmICh2YWxpZFRhYnMubGVuZ3RoID09PSAwKSByZXR1cm47XG5cbiAgLy8gVGFyZ2V0IFdpbmRvdzogVGhlIG9uZSB3aXRoIHRoZSBtb3N0IHNlbGVjdGVkIHRhYnMsIG9yIHRoZSBmaXJzdCBvbmUuXG4gIC8vIFVzaW5nIHRoZSBmaXJzdCB0YWIncyB3aW5kb3cgYXMgdGhlIHRhcmdldC5cbiAgY29uc3QgdGFyZ2V0V2luZG93SWQgPSB2YWxpZFRhYnNbMF0ud2luZG93SWQ7XG5cbiAgLy8gMS4gTW92ZSB0YWJzIHRvIHRhcmdldCB3aW5kb3dcbiAgY29uc3QgdGFic1RvTW92ZSA9IHZhbGlkVGFicy5maWx0ZXIodCA9PiB0LndpbmRvd0lkICE9PSB0YXJnZXRXaW5kb3dJZCk7XG4gIGlmICh0YWJzVG9Nb3ZlLmxlbmd0aCA+IDApIHtcbiAgICBjb25zdCBtb3ZlSWRzID0gdGFic1RvTW92ZS5tYXAodCA9PiB0LmlkISk7XG4gICAgYXdhaXQgY2hyb21lLnRhYnMubW92ZShtb3ZlSWRzLCB7IHdpbmRvd0lkOiB0YXJnZXRXaW5kb3dJZCwgaW5kZXg6IC0xIH0pO1xuICB9XG5cbiAgLy8gMi4gR3JvdXAgdGhlbVxuICAvLyBDaGVjayBpZiB0aGVyZSBpcyBhbiBleGlzdGluZyBncm91cCBpbiB0aGUgdGFyZ2V0IHdpbmRvdyB0aGF0IHdhcyBwYXJ0IG9mIHRoZSBzZWxlY3Rpb24uXG4gIC8vIFdlIHByaW9yaXRpemUgdGhlIGdyb3VwIG9mIHRoZSBmaXJzdCB0YWIgaWYgaXQgaGFzIG9uZS5cbiAgY29uc3QgZmlyc3RUYWJHcm91cElkID0gdmFsaWRUYWJzWzBdLmdyb3VwSWQ7XG4gIGxldCB0YXJnZXRHcm91cElkOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cbiAgaWYgKGZpcnN0VGFiR3JvdXBJZCAmJiBmaXJzdFRhYkdyb3VwSWQgIT09IC0xKSB7XG4gICAgICAvLyBWZXJpZnkgdGhlIGdyb3VwIGlzIGluIHRoZSB0YXJnZXQgd2luZG93IChpdCBzaG91bGQgYmUsIGFzIHdlIHBpY2tlZCB0YXJnZXRXaW5kb3dJZCBmcm9tIHZhbGlkVGFic1swXSlcbiAgICAgIC8vIEJ1dCBpZiB2YWxpZFRhYnNbMF0gd2FzIG1vdmVkIChpdCB3YXNuJ3QsIGFzIGl0IGRlZmluZWQgdGhlIHRhcmdldCksIGl0J3MgZmluZS5cbiAgICAgIHRhcmdldEdyb3VwSWQgPSBmaXJzdFRhYkdyb3VwSWQ7XG4gIH0gZWxzZSB7XG4gICAgICAvLyBMb29rIGZvciBhbnkgb3RoZXIgZ3JvdXAgaW4gdGhlIHNlbGVjdGlvbiB0aGF0IGlzIGluIHRoZSB0YXJnZXQgd2luZG93XG4gICAgICBjb25zdCBvdGhlckdyb3VwID0gdmFsaWRUYWJzLmZpbmQodCA9PiB0LndpbmRvd0lkID09PSB0YXJnZXRXaW5kb3dJZCAmJiB0Lmdyb3VwSWQgIT09IC0xKTtcbiAgICAgIGlmIChvdGhlckdyb3VwKSB7XG4gICAgICAgICAgdGFyZ2V0R3JvdXBJZCA9IG90aGVyR3JvdXAuZ3JvdXBJZDtcbiAgICAgIH1cbiAgfVxuXG4gIGNvbnN0IGlkcyA9IHZhbGlkVGFicy5tYXAodCA9PiB0LmlkISk7XG4gIGF3YWl0IGNocm9tZS50YWJzLmdyb3VwKHsgdGFiSWRzOiBpZHMsIGdyb3VwSWQ6IHRhcmdldEdyb3VwSWQgfSk7XG4gIGxvZ0luZm8oXCJNZXJnZWQgdGFic1wiLCB7IGNvdW50OiBpZHMubGVuZ3RoLCB0YXJnZXRXaW5kb3dJZCwgdGFyZ2V0R3JvdXBJZCB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBzcGxpdFRhYnMgPSBhc3luYyAodGFiSWRzOiBudW1iZXJbXSkgPT4ge1xuICBpZiAodGFiSWRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuXG4gIC8vIDEuIFZhbGlkYXRlIHRhYnNcbiAgY29uc3QgdmFsaWRUYWJzID0gYXdhaXQgZ2V0VGFic0J5SWRzKHRhYklkcyk7XG5cbiAgaWYgKHZhbGlkVGFicy5sZW5ndGggPT09IDApIHJldHVybjtcblxuICAvLyAyLiBDcmVhdGUgbmV3IHdpbmRvdyB3aXRoIHRoZSBmaXJzdCB0YWJcbiAgY29uc3QgZmlyc3RUYWIgPSB2YWxpZFRhYnNbMF07XG4gIGNvbnN0IG5ld1dpbmRvdyA9IGF3YWl0IGNocm9tZS53aW5kb3dzLmNyZWF0ZSh7IHRhYklkOiBmaXJzdFRhYi5pZCB9KTtcblxuICAvLyAzLiBNb3ZlIHJlbWFpbmluZyB0YWJzIHRvIG5ldyB3aW5kb3dcbiAgaWYgKHZhbGlkVGFicy5sZW5ndGggPiAxKSB7XG4gICAgY29uc3QgcmVtYWluaW5nVGFiSWRzID0gdmFsaWRUYWJzLnNsaWNlKDEpLm1hcCh0ID0+IHQuaWQhKTtcbiAgICBhd2FpdCBjaHJvbWUudGFicy5tb3ZlKHJlbWFpbmluZ1RhYklkcywgeyB3aW5kb3dJZDogbmV3V2luZG93LmlkISwgaW5kZXg6IC0xIH0pO1xuICB9XG5cbiAgbG9nSW5mbyhcIlNwbGl0IHRhYnMgdG8gbmV3IHdpbmRvd1wiLCB7IGNvdW50OiB2YWxpZFRhYnMubGVuZ3RoLCBuZXdXaW5kb3dJZDogbmV3V2luZG93LmlkIH0pO1xufTtcbiIsICJpbXBvcnQgeyBVbmRvU3RhdGUsIFNhdmVkU3RhdGUsIFdpbmRvd1N0YXRlLCBTdG9yZWRUYWJTdGF0ZSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGdldFN0b3JlZFZhbHVlLCBzZXRTdG9yZWRWYWx1ZSB9IGZyb20gXCIuL3N0b3JhZ2UuanNcIjtcbmltcG9ydCB7IGxvZ0luZm8sIGxvZ0Vycm9yIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcblxuY29uc3QgTUFYX1VORE9fU1RBQ0sgPSAxMDtcbmNvbnN0IFVORE9fU1RBQ0tfS0VZID0gXCJ1bmRvU3RhY2tcIjtcbmNvbnN0IFNBVkVEX1NUQVRFU19LRVkgPSBcInNhdmVkU3RhdGVzXCI7XG5cbmV4cG9ydCBjb25zdCBjYXB0dXJlQ3VycmVudFN0YXRlID0gYXN5bmMgKCk6IFByb21pc2U8VW5kb1N0YXRlPiA9PiB7XG4gIGNvbnN0IHdpbmRvd3MgPSBhd2FpdCBjaHJvbWUud2luZG93cy5nZXRBbGwoeyBwb3B1bGF0ZTogdHJ1ZSB9KTtcbiAgY29uc3Qgd2luZG93U3RhdGVzOiBXaW5kb3dTdGF0ZVtdID0gW107XG5cbiAgZm9yIChjb25zdCB3aW4gb2Ygd2luZG93cykge1xuICAgIGlmICghd2luLnRhYnMpIGNvbnRpbnVlO1xuICAgIGNvbnN0IHRhYlN0YXRlczogU3RvcmVkVGFiU3RhdGVbXSA9IHdpbi50YWJzLm1hcCgodGFiKSA9PiB7XG4gICAgICBsZXQgZ3JvdXBUaXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgbGV0IGdyb3VwQ29sb3I6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgIC8vIE5vdGU6IHRhYi5ncm91cElkIGlzIC0xIGlmIG5vdCBncm91cGVkLlxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgaWQ6IHRhYi5pZCxcbiAgICAgICAgdXJsOiB0YWIudXJsIHx8IFwiXCIsXG4gICAgICAgIHBpbm5lZDogQm9vbGVhbih0YWIucGlubmVkKSxcbiAgICAgICAgZ3JvdXBJZDogdGFiLmdyb3VwSWQsXG4gICAgICAgIGdyb3VwVGl0bGUsIC8vIFdpbGwgbmVlZCB0byBmZXRjaCBpZiBncm91cGVkXG4gICAgICAgIGdyb3VwQ29sb3IsXG4gICAgICB9O1xuICAgIH0pO1xuXG4gICAgLy8gUG9wdWxhdGUgZ3JvdXAgaW5mbyBpZiBuZWVkZWRcbiAgICAvLyBXZSBkbyB0aGlzIGluIGEgc2Vjb25kIHBhc3MgdG8gYmF0Y2ggb3IganVzdCBpbmRpdmlkdWFsbHkgaWYgbmVlZGVkLlxuICAgIC8vIEFjdHVhbGx5LCB3ZSBjYW4gZ2V0IGdyb3VwIGluZm8gZnJvbSBjaHJvbWUudGFiR3JvdXBzLlxuICAgIC8vIEhvd2V2ZXIsIHRoZSB0YWIgb2JqZWN0IGRvZXNuJ3QgaGF2ZSB0aGUgZ3JvdXAgdGl0bGUgZGlyZWN0bHkuXG5cbiAgICAvLyBPcHRpbWl6YXRpb246IEdldCBhbGwgZ3JvdXBzIGZpcnN0LlxuXG4gICAgd2luZG93U3RhdGVzLnB1c2goeyB0YWJzOiB0YWJTdGF0ZXMgfSk7XG4gIH1cblxuICAvLyBFbnJpY2ggd2l0aCBncm91cCBpbmZvXG4gIGNvbnN0IGFsbEdyb3VwcyA9IGF3YWl0IGNocm9tZS50YWJHcm91cHMucXVlcnkoe30pO1xuICBjb25zdCBncm91cE1hcCA9IG5ldyBNYXAoYWxsR3JvdXBzLm1hcChnID0+IFtnLmlkLCBnXSkpO1xuXG4gIGZvciAoY29uc3Qgd2luIG9mIHdpbmRvd1N0YXRlcykge1xuICAgIGZvciAoY29uc3QgdGFiIG9mIHdpbi50YWJzKSB7XG4gICAgICBpZiAodGFiLmdyb3VwSWQgJiYgdGFiLmdyb3VwSWQgIT09IGNocm9tZS50YWJHcm91cHMuVEFCX0dST1VQX0lEX05PTkUpIHtcbiAgICAgICAgY29uc3QgZyA9IGdyb3VwTWFwLmdldCh0YWIuZ3JvdXBJZCk7XG4gICAgICAgIGlmIChnKSB7XG4gICAgICAgICAgdGFiLmdyb3VwVGl0bGUgPSBnLnRpdGxlO1xuICAgICAgICAgIHRhYi5ncm91cENvbG9yID0gZy5jb2xvcjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxuICAgIHdpbmRvd3M6IHdpbmRvd1N0YXRlcyxcbiAgfTtcbn07XG5cbmV4cG9ydCBjb25zdCBwdXNoVW5kb1N0YXRlID0gYXN5bmMgKCkgPT4ge1xuICBjb25zdCBzdGF0ZSA9IGF3YWl0IGNhcHR1cmVDdXJyZW50U3RhdGUoKTtcbiAgY29uc3Qgc3RhY2sgPSAoYXdhaXQgZ2V0U3RvcmVkVmFsdWU8VW5kb1N0YXRlW10+KFVORE9fU1RBQ0tfS0VZKSkgfHwgW107XG4gIHN0YWNrLnB1c2goc3RhdGUpO1xuICBpZiAoc3RhY2subGVuZ3RoID4gTUFYX1VORE9fU1RBQ0spIHtcbiAgICBzdGFjay5zaGlmdCgpO1xuICB9XG4gIGF3YWl0IHNldFN0b3JlZFZhbHVlKFVORE9fU1RBQ0tfS0VZLCBzdGFjayk7XG4gIGxvZ0luZm8oXCJQdXNoZWQgdW5kbyBzdGF0ZVwiLCB7IHN0YWNrU2l6ZTogc3RhY2subGVuZ3RoIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IHNhdmVTdGF0ZSA9IGFzeW5jIChuYW1lOiBzdHJpbmcpID0+IHtcbiAgY29uc3QgdW5kb1N0YXRlID0gYXdhaXQgY2FwdHVyZUN1cnJlbnRTdGF0ZSgpO1xuICBjb25zdCBzYXZlZFN0YXRlOiBTYXZlZFN0YXRlID0ge1xuICAgIG5hbWUsXG4gICAgdGltZXN0YW1wOiB1bmRvU3RhdGUudGltZXN0YW1wLFxuICAgIHdpbmRvd3M6IHVuZG9TdGF0ZS53aW5kb3dzLFxuICB9O1xuICBjb25zdCBzYXZlZFN0YXRlcyA9IChhd2FpdCBnZXRTdG9yZWRWYWx1ZTxTYXZlZFN0YXRlW10+KFNBVkVEX1NUQVRFU19LRVkpKSB8fCBbXTtcbiAgc2F2ZWRTdGF0ZXMucHVzaChzYXZlZFN0YXRlKTtcbiAgYXdhaXQgc2V0U3RvcmVkVmFsdWUoU0FWRURfU1RBVEVTX0tFWSwgc2F2ZWRTdGF0ZXMpO1xuICBsb2dJbmZvKFwiU2F2ZWQgc3RhdGVcIiwgeyBuYW1lIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IGdldFNhdmVkU3RhdGVzID0gYXN5bmMgKCk6IFByb21pc2U8U2F2ZWRTdGF0ZVtdPiA9PiB7XG4gIHJldHVybiAoYXdhaXQgZ2V0U3RvcmVkVmFsdWU8U2F2ZWRTdGF0ZVtdPihTQVZFRF9TVEFURVNfS0VZKSkgfHwgW107XG59O1xuXG5leHBvcnQgY29uc3QgZGVsZXRlU2F2ZWRTdGF0ZSA9IGFzeW5jIChuYW1lOiBzdHJpbmcpID0+IHtcbiAgbGV0IHNhdmVkU3RhdGVzID0gKGF3YWl0IGdldFN0b3JlZFZhbHVlPFNhdmVkU3RhdGVbXT4oU0FWRURfU1RBVEVTX0tFWSkpIHx8IFtdO1xuICBzYXZlZFN0YXRlcyA9IHNhdmVkU3RhdGVzLmZpbHRlcihzID0+IHMubmFtZSAhPT0gbmFtZSk7XG4gIGF3YWl0IHNldFN0b3JlZFZhbHVlKFNBVkVEX1NUQVRFU19LRVksIHNhdmVkU3RhdGVzKTtcbiAgbG9nSW5mbyhcIkRlbGV0ZWQgc2F2ZWQgc3RhdGVcIiwgeyBuYW1lIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IHVuZG8gPSBhc3luYyAoKSA9PiB7XG4gIGNvbnN0IHN0YWNrID0gKGF3YWl0IGdldFN0b3JlZFZhbHVlPFVuZG9TdGF0ZVtdPihVTkRPX1NUQUNLX0tFWSkpIHx8IFtdO1xuICBjb25zdCBzdGF0ZSA9IHN0YWNrLnBvcCgpO1xuICBpZiAoIXN0YXRlKSB7XG4gICAgbG9nSW5mbyhcIlVuZG8gc3RhY2sgZW1wdHlcIik7XG4gICAgcmV0dXJuO1xuICB9XG4gIGF3YWl0IHNldFN0b3JlZFZhbHVlKFVORE9fU1RBQ0tfS0VZLCBzdGFjayk7XG4gIGF3YWl0IHJlc3RvcmVTdGF0ZShzdGF0ZSk7XG4gIGxvZ0luZm8oXCJVbmRpZCBsYXN0IGFjdGlvblwiKTtcbn07XG5cbmV4cG9ydCBjb25zdCByZXN0b3JlU3RhdGUgPSBhc3luYyAoc3RhdGU6IFVuZG9TdGF0ZSB8IFNhdmVkU3RhdGUpID0+IHtcbiAgLy8gU3RyYXRlZ3k6XG4gIC8vIDEuIFVuZ3JvdXAgYWxsIHRhYnMgKG9wdGlvbmFsLCBidXQgY2xlYW5lcikuXG4gIC8vIDIuIE1vdmUgdGFicyB0byBjb3JyZWN0IHdpbmRvd3MgYW5kIGluZGljZXMuXG4gIC8vIDMuIFJlLWdyb3VwIHRhYnMuXG5cbiAgLy8gV2UgbmVlZCB0byBtYXRjaCBjdXJyZW50IHRhYnMgdG8gc3RvcmVkIHRhYnMuXG4gIC8vIFByaW9yaXR5OiBJRCBtYXRjaCAtPiBVUkwgbWF0Y2guXG5cbiAgY29uc3QgY3VycmVudFRhYnMgPSBhd2FpdCBjaHJvbWUudGFicy5xdWVyeSh7fSk7XG4gIGNvbnN0IGN1cnJlbnRUYWJNYXAgPSBuZXcgTWFwPG51bWJlciwgY2hyb21lLnRhYnMuVGFiPigpO1xuICBjb25zdCBjdXJyZW50VXJsTWFwID0gbmV3IE1hcDxzdHJpbmcsIGNocm9tZS50YWJzLlRhYltdPigpOyAvLyBVUkwgLT4gbGlzdCBvZiB0YWJzXG5cbiAgY3VycmVudFRhYnMuZm9yRWFjaCh0ID0+IHtcbiAgICBpZiAodC5pZCkgY3VycmVudFRhYk1hcC5zZXQodC5pZCwgdCk7XG4gICAgaWYgKHQudXJsKSB7XG4gICAgICBjb25zdCBsaXN0ID0gY3VycmVudFVybE1hcC5nZXQodC51cmwpIHx8IFtdO1xuICAgICAgbGlzdC5wdXNoKHQpO1xuICAgICAgY3VycmVudFVybE1hcC5zZXQodC51cmwsIGxpc3QpO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gSGVscGVyIHRvIGZpbmQgYSB0YWIgKGFzeW5jIHRvIGFsbG93IGNyZWF0aW9uKVxuICBjb25zdCBmaW5kT3JDcmVhdGVUYWIgPSBhc3luYyAoc3RvcmVkOiBTdG9yZWRUYWJTdGF0ZSk6IFByb21pc2U8Y2hyb21lLnRhYnMuVGFiIHwgdW5kZWZpbmVkPiA9PiB7XG4gICAgLy8gVHJ5IElEXG4gICAgaWYgKHN0b3JlZC5pZCAmJiBjdXJyZW50VGFiTWFwLmhhcyhzdG9yZWQuaWQpKSB7XG4gICAgICBjb25zdCB0ID0gY3VycmVudFRhYk1hcC5nZXQoc3RvcmVkLmlkKTtcbiAgICAgIGN1cnJlbnRUYWJNYXAuZGVsZXRlKHN0b3JlZC5pZCEpOyAvLyBDb25zdW1lXG4gICAgICAvLyBBbHNvIHJlbW92ZSBmcm9tIHVybCBtYXAgdG8gYXZvaWQgZG91YmxlIHVzYWdlXG4gICAgICBpZiAodD8udXJsKSB7XG4gICAgICAgICBjb25zdCBsaXN0ID0gY3VycmVudFVybE1hcC5nZXQodC51cmwpO1xuICAgICAgICAgaWYgKGxpc3QpIHtcbiAgICAgICAgICAgIGNvbnN0IGlkeCA9IGxpc3QuZmluZEluZGV4KHggPT4geC5pZCA9PT0gdC5pZCk7XG4gICAgICAgICAgICBpZiAoaWR4ICE9PSAtMSkgbGlzdC5zcGxpY2UoaWR4LCAxKTtcbiAgICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiB0O1xuICAgIH1cbiAgICAvLyBUcnkgVVJMXG4gICAgY29uc3QgbGlzdCA9IGN1cnJlbnRVcmxNYXAuZ2V0KHN0b3JlZC51cmwpO1xuICAgIGlmIChsaXN0ICYmIGxpc3QubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgdCA9IGxpc3Quc2hpZnQoKTtcbiAgICAgIGlmICh0Py5pZCkgY3VycmVudFRhYk1hcC5kZWxldGUodC5pZCk7IC8vIENvbnN1bWVcbiAgICAgIHJldHVybiB0O1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSBpZiBtaXNzaW5nXG4gICAgaWYgKHN0b3JlZC51cmwpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHQgPSBhd2FpdCBjaHJvbWUudGFicy5jcmVhdGUoeyB1cmw6IHN0b3JlZC51cmwsIGFjdGl2ZTogZmFsc2UgfSk7XG4gICAgICAgICAgICByZXR1cm4gdDtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgbG9nRXJyb3IoXCJGYWlsZWQgdG8gY3JlYXRlIHRhYlwiLCB7IHVybDogc3RvcmVkLnVybCwgZXJyb3I6IGUgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9O1xuXG4gIC8vIFdlIG5lZWQgdG8gcmVjb25zdHJ1Y3Qgd2luZG93cy5cbiAgLy8gSWRlYWxseSwgd2UgbWFwIHN0YXRlIHdpbmRvd3MgdG8gY3VycmVudCB3aW5kb3dzLlxuICAvLyBCdXQgc3RyaWN0bHksIHdlIGNhbiBqdXN0IG1vdmUgdGFicy5cblxuICAvLyBGb3Igc2ltcGxpY2l0eSwgbGV0J3MgYXNzdW1lIHdlIHVzZSBleGlzdGluZyB3aW5kb3dzIGFzIG11Y2ggYXMgcG9zc2libGUuXG4gIC8vIE9yIGNyZWF0ZSBuZXcgb25lcyBpZiB3ZSBydW4gb3V0P1xuICAvLyBMZXQncyBpdGVyYXRlIHN0b3JlZCB3aW5kb3dzLlxuXG4gIGNvbnN0IGN1cnJlbnRXaW5kb3dzID0gYXdhaXQgY2hyb21lLndpbmRvd3MuZ2V0QWxsKCk7XG5cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdGF0ZS53aW5kb3dzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3Qgd2luU3RhdGUgPSBzdGF0ZS53aW5kb3dzW2ldO1xuXG4gICAgLy8gSWRlbnRpZnkgYWxsIHRhYnMgZm9yIHRoaXMgd2luZG93IGZpcnN0LlxuICAgIC8vIFdlIGRvIHRoaXMgQkVGT1JFIGNyZWF0aW5nIGEgd2luZG93IHRvIGF2b2lkIGNyZWF0aW5nIGVtcHR5IHdpbmRvd3MuXG4gICAgY29uc3QgdGFic1RvTW92ZTogeyB0YWJJZDogbnVtYmVyLCBzdG9yZWQ6IFN0b3JlZFRhYlN0YXRlIH1bXSA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBzdG9yZWRUYWIgb2Ygd2luU3RhdGUudGFicykge1xuICAgICAgY29uc3QgZm91bmQgPSBhd2FpdCBmaW5kT3JDcmVhdGVUYWIoc3RvcmVkVGFiKTtcbiAgICAgIGlmIChmb3VuZCAmJiBmb3VuZC5pZCkge1xuICAgICAgICB0YWJzVG9Nb3ZlLnB1c2goeyB0YWJJZDogZm91bmQuaWQsIHN0b3JlZDogc3RvcmVkVGFiIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICh0YWJzVG9Nb3ZlLmxlbmd0aCA9PT0gMCkgY29udGludWU7XG5cbiAgICBsZXQgdGFyZ2V0V2luZG93SWQ6IG51bWJlcjtcblxuICAgIGlmIChpIDwgY3VycmVudFdpbmRvd3MubGVuZ3RoKSB7XG4gICAgICB0YXJnZXRXaW5kb3dJZCA9IGN1cnJlbnRXaW5kb3dzW2ldLmlkITtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gQ3JlYXRlIG5ldyB3aW5kb3dcbiAgICAgIGNvbnN0IHdpbiA9IGF3YWl0IGNocm9tZS53aW5kb3dzLmNyZWF0ZSh7fSk7XG4gICAgICB0YXJnZXRXaW5kb3dJZCA9IHdpbi5pZCE7XG4gICAgICAvLyBOb3RlOiBOZXcgd2luZG93IGNyZWF0aW9uIGFkZHMgYSB0YWIuIFdlIG1pZ2h0IHdhbnQgdG8gcmVtb3ZlIGl0IGxhdGVyIG9yIGlnbm9yZSBpdC5cbiAgICB9XG5cbiAgICBjb25zdCB0YWJJZHMgPSB0YWJzVG9Nb3ZlLm1hcCh0ID0+IHQudGFiSWQpO1xuXG4gICAgLy8gTW92ZSBhbGwgdG8gd2luZG93LlxuICAgIC8vIE5vdGU6IElmIHdlIG1vdmUgdG8gaW5kZXggMCwgdGhleSB3aWxsIGJlIHByZXBlbmRlZC5cbiAgICAvLyBXZSBzaG91bGQgcHJvYmFibHkganVzdCBtb3ZlIHRoZW0gdG8gdGhlIHdpbmRvdyBmaXJzdC5cbiAgICAvLyBJZiB3ZSBtb3ZlIHRoZW0gaW5kaXZpZHVhbGx5IHRvIGNvcnJlY3QgaW5kZXgsIGl0J3Mgc2FmZXIuXG5cbiAgICBmb3IgKGxldCBqID0gMDsgaiA8IHRhYnNUb01vdmUubGVuZ3RoOyBqKyspIHtcbiAgICAgIGNvbnN0IHsgdGFiSWQsIHN0b3JlZCB9ID0gdGFic1RvTW92ZVtqXTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGNocm9tZS50YWJzLm1vdmUodGFiSWQsIHsgd2luZG93SWQ6IHRhcmdldFdpbmRvd0lkLCBpbmRleDogaiB9KTtcbiAgICAgICAgaWYgKHN0b3JlZC5waW5uZWQpIHtcbiAgICAgICAgICAgICBhd2FpdCBjaHJvbWUudGFicy51cGRhdGUodGFiSWQsIHsgcGlubmVkOiB0cnVlIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgIC8vIElmIGN1cnJlbnRseSBwaW5uZWQgYnV0IHNob3VsZG4ndCBiZVxuICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnQgPSBhd2FpdCBjaHJvbWUudGFicy5nZXQodGFiSWQpO1xuICAgICAgICAgICAgIGlmIChjdXJyZW50LnBpbm5lZCkgYXdhaXQgY2hyb21lLnRhYnMudXBkYXRlKHRhYklkLCB7IHBpbm5lZDogZmFsc2UgfSk7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgbG9nRXJyb3IoXCJGYWlsZWQgdG8gbW92ZSB0YWJcIiwgeyB0YWJJZCwgZXJyb3I6IGUgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gSGFuZGxlIEdyb3Vwc1xuICAgIC8vIElkZW50aWZ5IGdyb3VwcyBpbiB0aGlzIHdpbmRvd1xuICAgIGNvbnN0IGdyb3VwcyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXJbXT4oKTsgLy8gdGl0bGUrY29sb3IgLT4gdGFiSWRzXG4gICAgY29uc3QgZ3JvdXBDb2xvcnMgPSBuZXcgTWFwPHN0cmluZywgY2hyb21lLnRhYkdyb3Vwcy5Db2xvckVudW0+KCk7XG5cbiAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgdGFic1RvTW92ZSkge1xuICAgICAgaWYgKGl0ZW0uc3RvcmVkLmdyb3VwVGl0bGUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAvLyBVc2UgdGl0bGUgYXMga2V5IChvciB1bmlxdWUgSUQgaWYgd2UgaGFkIG9uZSwgYnV0IHdlIGRvbid0IHBlcnNpc3QgZ3JvdXAgSURzKVxuICAgICAgICAvLyBHcm91cCBJRCBpbiBzdG9yYWdlIGlzIGVwaGVtZXJhbC4gVGl0bGUgaXMga2V5LlxuICAgICAgICBjb25zdCBrZXkgPSBpdGVtLnN0b3JlZC5ncm91cFRpdGxlO1xuICAgICAgICBjb25zdCBsaXN0ID0gZ3JvdXBzLmdldChrZXkpIHx8IFtdO1xuICAgICAgICBsaXN0LnB1c2goaXRlbS50YWJJZCk7XG4gICAgICAgIGdyb3Vwcy5zZXQoa2V5LCBsaXN0KTtcbiAgICAgICAgaWYgKGl0ZW0uc3RvcmVkLmdyb3VwQ29sb3IpIHtcbiAgICAgICAgICAgICBncm91cENvbG9ycy5zZXQoa2V5LCBpdGVtLnN0b3JlZC5ncm91cENvbG9yIGFzIGNocm9tZS50YWJHcm91cHMuQ29sb3JFbnVtKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgIC8vIFVuZ3JvdXAgaWYgbmVlZGVkXG4gICAgICAgICBhd2FpdCBjaHJvbWUudGFicy51bmdyb3VwKGl0ZW0udGFiSWQpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgW3RpdGxlLCBpZHNdIG9mIGdyb3Vwcy5lbnRyaWVzKCkpIHtcbiAgICAgIGlmIChpZHMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCBncm91cElkID0gYXdhaXQgY2hyb21lLnRhYnMuZ3JvdXAoeyB0YWJJZHM6IGlkcyB9KTtcbiAgICAgICAgYXdhaXQgY2hyb21lLnRhYkdyb3Vwcy51cGRhdGUoZ3JvdXBJZCwge1xuICAgICAgICAgICAgIHRpdGxlOiB0aXRsZSxcbiAgICAgICAgICAgICBjb2xvcjogZ3JvdXBDb2xvcnMuZ2V0KHRpdGxlKSB8fCBcImdyZXlcIlxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG4iLCAiaW1wb3J0IHsgYXBwbHlUYWJHcm91cHMsIGFwcGx5VGFiU29ydGluZywgY2FsY3VsYXRlVGFiR3JvdXBzLCBmZXRjaEN1cnJlbnRUYWJHcm91cHMsIG1lcmdlVGFicywgc3BsaXRUYWJzIH0gZnJvbSBcIi4vdGFiTWFuYWdlci5qc1wiO1xuaW1wb3J0IHsgbG9hZFByZWZlcmVuY2VzLCBzYXZlUHJlZmVyZW5jZXMgfSBmcm9tIFwiLi9wcmVmZXJlbmNlcy5qc1wiO1xuaW1wb3J0IHsgc2V0Q3VzdG9tU3RyYXRlZ2llcyB9IGZyb20gXCIuL2dyb3VwaW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcsIGxvZ0luZm8sIGdldExvZ3MsIGNsZWFyTG9ncywgc2V0TG9nZ2VyUHJlZmVyZW5jZXMsIGluaXRMb2dnZXIsIGFkZExvZ0VudHJ5LCBsb2dnZXJSZWFkeSB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBwdXNoVW5kb1N0YXRlLCBzYXZlU3RhdGUsIHVuZG8sIGdldFNhdmVkU3RhdGVzLCBkZWxldGVTYXZlZFN0YXRlLCByZXN0b3JlU3RhdGUgfSBmcm9tIFwiLi9zdGF0ZU1hbmFnZXIuanNcIjtcbmltcG9ydCB7XG4gIEFwcGx5R3JvdXBpbmdQYXlsb2FkLFxuICBHcm91cGluZ1NlbGVjdGlvbixcbiAgR3JvdXBpbmdTdHJhdGVneSxcbiAgUHJlZmVyZW5jZXMsXG4gIFJ1bnRpbWVNZXNzYWdlLFxuICBSdW50aW1lUmVzcG9uc2UsXG4gIFNvcnRpbmdTdHJhdGVneSxcbiAgVGFiR3JvdXBcbn0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuXG5jaHJvbWUucnVudGltZS5vbkluc3RhbGxlZC5hZGRMaXN0ZW5lcihhc3luYyAoKSA9PiB7XG4gIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gIHNldEN1c3RvbVN0cmF0ZWdpZXMocHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXSk7XG4gIGxvZ0luZm8oXCJFeHRlbnNpb24gaW5zdGFsbGVkXCIsIHtcbiAgICB2ZXJzaW9uOiBjaHJvbWUucnVudGltZS5nZXRNYW5pZmVzdCgpLnZlcnNpb24sXG4gICAgbG9nTGV2ZWw6IHByZWZzLmxvZ0xldmVsLFxuICAgIHN0cmF0ZWdpZXNDb3VudDogcHJlZnMuY3VzdG9tU3RyYXRlZ2llcz8ubGVuZ3RoIHx8IDBcbiAgfSk7XG59KTtcblxuLy8gSW5pdGlhbGl6ZSBsb2dnZXIgb24gc3RhcnR1cFxubG9hZFByZWZlcmVuY2VzKCkudGhlbihhc3luYyAocHJlZnMpID0+IHtcbiAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuICAgIGF3YWl0IGluaXRMb2dnZXIoKTtcbiAgICBsb2dJbmZvKFwiU2VydmljZSBXb3JrZXIgSW5pdGlhbGl6ZWRcIiwge1xuICAgICAgICB2ZXJzaW9uOiBjaHJvbWUucnVudGltZS5nZXRNYW5pZmVzdCgpLnZlcnNpb24sXG4gICAgICAgIGxvZ0xldmVsOiBwcmVmcy5sb2dMZXZlbFxuICAgIH0pO1xufSk7XG5cbmNvbnN0IGhhbmRsZU1lc3NhZ2UgPSBhc3luYyA8VERhdGE+KFxuICBtZXNzYWdlOiBSdW50aW1lTWVzc2FnZSxcbiAgc2VuZGVyOiBjaHJvbWUucnVudGltZS5NZXNzYWdlU2VuZGVyXG4pOiBQcm9taXNlPFJ1bnRpbWVSZXNwb25zZTxURGF0YT4+ID0+IHtcbiAgbG9nRGVidWcoXCJSZWNlaXZlZCBtZXNzYWdlXCIsIHsgdHlwZTogbWVzc2FnZS50eXBlLCBmcm9tOiBzZW5kZXIuaWQgfSk7XG4gIHN3aXRjaCAobWVzc2FnZS50eXBlKSB7XG4gICAgY2FzZSBcImdldFN0YXRlXCI6IHtcbiAgICAgIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuICAgICAgLy8gVXNlIGZldGNoQ3VycmVudFRhYkdyb3VwcyB0byByZXR1cm4gdGhlIGFjdHVhbCBzdGF0ZSBvZiB0aGUgYnJvd3NlciB0YWJzXG4gICAgICBjb25zdCBncm91cHMgPSBhd2FpdCBmZXRjaEN1cnJlbnRUYWJHcm91cHMocHJlZnMpO1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGRhdGE6IHsgZ3JvdXBzLCBwcmVmZXJlbmNlczogcHJlZnMgfSBhcyBURGF0YSB9O1xuICAgIH1cbiAgICBjYXNlIFwiYXBwbHlHcm91cGluZ1wiOiB7XG4gICAgICBsb2dJbmZvKFwiQXBwbHlpbmcgZ3JvdXBpbmcgZnJvbSBtZXNzYWdlXCIsIHsgc29ydGluZzogKG1lc3NhZ2UucGF5bG9hZCBhcyBhbnkpPy5zb3J0aW5nIH0pO1xuICAgICAgYXdhaXQgcHVzaFVuZG9TdGF0ZSgpO1xuICAgICAgY29uc3QgcHJlZnMgPSBhd2FpdCBsb2FkUHJlZmVyZW5jZXMoKTtcbiAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMocHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXSk7XG4gICAgICBjb25zdCBwYXlsb2FkID0gKG1lc3NhZ2UucGF5bG9hZCBhcyBBcHBseUdyb3VwaW5nUGF5bG9hZCB8IHVuZGVmaW5lZCkgPz8ge307XG4gICAgICBjb25zdCBzZWxlY3Rpb24gPSBwYXlsb2FkLnNlbGVjdGlvbiA/PyB7fTtcbiAgICAgIGNvbnN0IHNvcnRpbmcgPSBwYXlsb2FkLnNvcnRpbmc/Lmxlbmd0aCA/IHBheWxvYWQuc29ydGluZyA6IHVuZGVmaW5lZDtcblxuICAgICAgY29uc3QgcHJlZmVyZW5jZXMgPSBzb3J0aW5nID8geyAuLi5wcmVmcywgc29ydGluZyB9IDogcHJlZnM7XG5cbiAgICAgIGNvbnN0IG9uUHJvZ3Jlc3MgPSAoY29tcGxldGVkOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+IHtcbiAgICAgICAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICAgIHR5cGU6IFwiZ3JvdXBpbmdQcm9ncmVzc1wiLFxuICAgICAgICAgICAgICBwYXlsb2FkOiB7IGNvbXBsZXRlZCwgdG90YWwgfVxuICAgICAgICAgIH0pLmNhdGNoKCgpID0+IHt9KTtcbiAgICAgIH07XG5cbiAgICAgIC8vIFVzZSBjYWxjdWxhdGVUYWJHcm91cHMgdG8gZGV0ZXJtaW5lIHRoZSB0YXJnZXQgZ3JvdXBpbmdcbiAgICAgIGNvbnN0IGdyb3VwcyA9IGF3YWl0IGNhbGN1bGF0ZVRhYkdyb3VwcyhwcmVmZXJlbmNlcywgc2VsZWN0aW9uLCBvblByb2dyZXNzKTtcbiAgICAgIGF3YWl0IGFwcGx5VGFiR3JvdXBzKGdyb3Vwcyk7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSwgZGF0YTogeyBncm91cHMgfSBhcyBURGF0YSB9O1xuICAgIH1cbiAgICBjYXNlIFwiYXBwbHlTb3J0aW5nXCI6IHtcbiAgICAgIGxvZ0luZm8oXCJBcHBseWluZyBzb3J0aW5nIGZyb20gbWVzc2FnZVwiKTtcbiAgICAgIGF3YWl0IHB1c2hVbmRvU3RhdGUoKTtcbiAgICAgIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuICAgICAgY29uc3QgcGF5bG9hZCA9IChtZXNzYWdlLnBheWxvYWQgYXMgQXBwbHlHcm91cGluZ1BheWxvYWQgfCB1bmRlZmluZWQpID8/IHt9O1xuICAgICAgY29uc3Qgc2VsZWN0aW9uID0gcGF5bG9hZC5zZWxlY3Rpb24gPz8ge307XG4gICAgICBjb25zdCBzb3J0aW5nID0gcGF5bG9hZC5zb3J0aW5nPy5sZW5ndGggPyBwYXlsb2FkLnNvcnRpbmcgOiB1bmRlZmluZWQ7XG4gICAgICBjb25zdCBwcmVmZXJlbmNlcyA9IHNvcnRpbmcgPyB7IC4uLnByZWZzLCBzb3J0aW5nIH0gOiBwcmVmcztcblxuICAgICAgY29uc3Qgb25Qcm9ncmVzcyA9IChjb21wbGV0ZWQ6IG51bWJlciwgdG90YWw6IG51bWJlcikgPT4ge1xuICAgICAgICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgICAgdHlwZTogXCJncm91cGluZ1Byb2dyZXNzXCIsXG4gICAgICAgICAgICAgIHBheWxvYWQ6IHsgY29tcGxldGVkLCB0b3RhbCB9XG4gICAgICAgICAgfSkuY2F0Y2goKCkgPT4ge30pO1xuICAgICAgfTtcblxuICAgICAgYXdhaXQgYXBwbHlUYWJTb3J0aW5nKHByZWZlcmVuY2VzLCBzZWxlY3Rpb24sIG9uUHJvZ3Jlc3MpO1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICB9XG4gICAgY2FzZSBcIm1lcmdlU2VsZWN0aW9uXCI6IHtcbiAgICAgIGxvZ0luZm8oXCJNZXJnaW5nIHNlbGVjdGlvbiBmcm9tIG1lc3NhZ2VcIik7XG4gICAgICBhd2FpdCBwdXNoVW5kb1N0YXRlKCk7XG4gICAgICBjb25zdCBwYXlsb2FkID0gbWVzc2FnZS5wYXlsb2FkIGFzIHsgdGFiSWRzOiBudW1iZXJbXSB9O1xuICAgICAgaWYgKHBheWxvYWQ/LnRhYklkcz8ubGVuZ3RoKSB7XG4gICAgICAgIGF3YWl0IG1lcmdlVGFicyhwYXlsb2FkLnRhYklkcyk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICB9XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIk5vIHRhYnMgc2VsZWN0ZWRcIiB9O1xuICAgIH1cbiAgICBjYXNlIFwic3BsaXRTZWxlY3Rpb25cIjoge1xuICAgICAgbG9nSW5mbyhcIlNwbGl0dGluZyBzZWxlY3Rpb24gZnJvbSBtZXNzYWdlXCIpO1xuICAgICAgYXdhaXQgcHVzaFVuZG9TdGF0ZSgpO1xuICAgICAgY29uc3QgcGF5bG9hZCA9IG1lc3NhZ2UucGF5bG9hZCBhcyB7IHRhYklkczogbnVtYmVyW10gfTtcbiAgICAgIGlmIChwYXlsb2FkPy50YWJJZHM/Lmxlbmd0aCkge1xuICAgICAgICBhd2FpdCBzcGxpdFRhYnMocGF5bG9hZC50YWJJZHMpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJObyB0YWJzIHNlbGVjdGVkXCIgfTtcbiAgICB9XG4gICAgY2FzZSBcInVuZG9cIjoge1xuICAgICAgbG9nSW5mbyhcIlVuZG9pbmcgbGFzdCBhY3Rpb25cIik7XG4gICAgICBhd2FpdCB1bmRvKCk7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgIH1cbiAgICBjYXNlIFwic2F2ZVN0YXRlXCI6IHtcbiAgICAgIGNvbnN0IG5hbWUgPSAobWVzc2FnZS5wYXlsb2FkIGFzIGFueSk/Lm5hbWU7XG4gICAgICBpZiAodHlwZW9mIG5hbWUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgbG9nSW5mbyhcIlNhdmluZyBzdGF0ZSBmcm9tIG1lc3NhZ2VcIiwgeyBuYW1lIH0pO1xuICAgICAgICBhd2FpdCBzYXZlU3RhdGUobmFtZSk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICB9XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgbmFtZVwiIH07XG4gICAgfVxuICAgIGNhc2UgXCJnZXRTYXZlZFN0YXRlc1wiOiB7XG4gICAgICBjb25zdCBzdGF0ZXMgPSBhd2FpdCBnZXRTYXZlZFN0YXRlcygpO1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGRhdGE6IHN0YXRlcyBhcyBURGF0YSB9O1xuICAgIH1cbiAgICBjYXNlIFwicmVzdG9yZVN0YXRlXCI6IHtcbiAgICAgIGNvbnN0IHN0YXRlID0gKG1lc3NhZ2UucGF5bG9hZCBhcyBhbnkpPy5zdGF0ZTtcbiAgICAgIGlmIChzdGF0ZSkge1xuICAgICAgICBsb2dJbmZvKFwiUmVzdG9yaW5nIHN0YXRlIGZyb20gbWVzc2FnZVwiLCB7IG5hbWU6IHN0YXRlLm5hbWUgfSk7XG4gICAgICAgIGF3YWl0IHJlc3RvcmVTdGF0ZShzdGF0ZSk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICB9XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgc3RhdGVcIiB9O1xuICAgIH1cbiAgICBjYXNlIFwiZGVsZXRlU2F2ZWRTdGF0ZVwiOiB7XG4gICAgICBjb25zdCBuYW1lID0gKG1lc3NhZ2UucGF5bG9hZCBhcyBhbnkpPy5uYW1lO1xuICAgICAgaWYgKHR5cGVvZiBuYW1lID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIGxvZ0luZm8oXCJEZWxldGluZyBzYXZlZCBzdGF0ZSBmcm9tIG1lc3NhZ2VcIiwgeyBuYW1lIH0pO1xuICAgICAgICBhd2FpdCBkZWxldGVTYXZlZFN0YXRlKG5hbWUpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIG5hbWVcIiB9O1xuICAgIH1cbiAgICBjYXNlIFwibG9hZFByZWZlcmVuY2VzXCI6IHtcbiAgICAgIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGRhdGE6IHByZWZzIGFzIFREYXRhIH07XG4gICAgfVxuICAgIGNhc2UgXCJzYXZlUHJlZmVyZW5jZXNcIjoge1xuICAgICAgbG9nSW5mbyhcIlNhdmluZyBwcmVmZXJlbmNlcyBmcm9tIG1lc3NhZ2VcIik7XG4gICAgICBjb25zdCBwcmVmcyA9IGF3YWl0IHNhdmVQcmVmZXJlbmNlcyhtZXNzYWdlLnBheWxvYWQgYXMgYW55KTtcbiAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMocHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXSk7XG4gICAgICBzZXRMb2dnZXJQcmVmZXJlbmNlcyhwcmVmcyk7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSwgZGF0YTogcHJlZnMgYXMgVERhdGEgfTtcbiAgICB9XG4gICAgY2FzZSBcImdldExvZ3NcIjoge1xuICAgICAgICBhd2FpdCBsb2dnZXJSZWFkeTtcbiAgICAgICAgY29uc3QgbG9ncyA9IGdldExvZ3MoKTtcbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGRhdGE6IGxvZ3MgYXMgVERhdGEgfTtcbiAgICB9XG4gICAgY2FzZSBcImNsZWFyTG9nc1wiOiB7XG4gICAgICAgIGNsZWFyTG9ncygpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgIH1cbiAgICBjYXNlIFwibG9nRW50cnlcIjoge1xuICAgICAgICBjb25zdCBlbnRyeSA9IG1lc3NhZ2UucGF5bG9hZCBhcyBhbnk7XG4gICAgICAgIGlmIChlbnRyeSAmJiBlbnRyeS5sZXZlbCAmJiBlbnRyeS5tZXNzYWdlKSB7XG4gICAgICAgICAgICBhZGRMb2dFbnRyeShlbnRyeSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICB9XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiVW5rbm93biBtZXNzYWdlXCIgfTtcbiAgfVxufTtcblxuY2hyb21lLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKFxuICAoXG4gICAgbWVzc2FnZTogUnVudGltZU1lc3NhZ2UsXG4gICAgc2VuZGVyOiBjaHJvbWUucnVudGltZS5NZXNzYWdlU2VuZGVyLFxuICAgIHNlbmRSZXNwb25zZTogKHJlc3BvbnNlOiBSdW50aW1lUmVzcG9uc2UpID0+IHZvaWRcbiAgKSA9PiB7XG4gICAgaGFuZGxlTWVzc2FnZShtZXNzYWdlLCBzZW5kZXIpXG4gICAgLnRoZW4oKHJlc3BvbnNlKSA9PiBzZW5kUmVzcG9uc2UocmVzcG9uc2UpKVxuICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiBmYWxzZSwgZXJyb3I6IFN0cmluZyhlcnJvcikgfSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbik7XG5cbmNocm9tZS50YWJHcm91cHMub25SZW1vdmVkLmFkZExpc3RlbmVyKGFzeW5jIChncm91cCkgPT4ge1xuICBsb2dJbmZvKFwiVGFiIGdyb3VwIHJlbW92ZWRcIiwgeyBncm91cCB9KTtcbn0pO1xuXG5sZXQgYXV0b1J1blRpbWVvdXQ6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgbnVsbCA9IG51bGw7XG5jb25zdCBkaXJ0eVRhYklkcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xubGV0IHRhYlByb2Nlc3NpbmdUaW1lb3V0OiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsO1xuXG5jb25zdCB0cmlnZ2VyQXV0b1J1biA9ICh0YWJJZD86IG51bWJlcikgPT4ge1xuICAvLyAxLiBTY2hlZHVsZSBmYXN0LCB0YXJnZXRlZCB1cGRhdGUgZm9yIHNwZWNpZmljIHRhYnNcbiAgaWYgKHRhYklkICE9PSB1bmRlZmluZWQpIHtcbiAgICBkaXJ0eVRhYklkcy5hZGQodGFiSWQpO1xuICAgIGlmICh0YWJQcm9jZXNzaW5nVGltZW91dCkgY2xlYXJUaW1lb3V0KHRhYlByb2Nlc3NpbmdUaW1lb3V0KTtcblxuICAgIHRhYlByb2Nlc3NpbmdUaW1lb3V0ID0gc2V0VGltZW91dChhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBpZHMgPSBBcnJheS5mcm9tKGRpcnR5VGFiSWRzKTtcbiAgICAgIGRpcnR5VGFiSWRzLmNsZWFyKCk7XG4gICAgICBpZiAoaWRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBwcmVmcyA9IGF3YWl0IGxvYWRQcmVmZXJlbmNlcygpO1xuICAgICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuXG4gICAgICAgIGNvbnN0IGF1dG9SdW5TdHJhdHMgPSBwcmVmcy5jdXN0b21TdHJhdGVnaWVzPy5maWx0ZXIocyA9PiBzLmF1dG9SdW4pO1xuICAgICAgICBpZiAoYXV0b1J1blN0cmF0cyAmJiBhdXRvUnVuU3RyYXRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBjb25zdCBzdHJhdGVneUlkcyA9IGF1dG9SdW5TdHJhdHMubWFwKHMgPT4gcy5pZCk7XG4gICAgICAgICAgLy8gT25seSBwcm9jZXNzIHRoZSBkaXJ0eSB0YWJzIGZvciBxdWljayBncm91cGluZ1xuICAgICAgICAgIGNvbnN0IGdyb3VwcyA9IGF3YWl0IGNhbGN1bGF0ZVRhYkdyb3Vwcyh7IC4uLnByZWZzLCBzb3J0aW5nOiBzdHJhdGVneUlkcyB9LCB7IHRhYklkczogaWRzIH0pO1xuICAgICAgICAgIGF3YWl0IGFwcGx5VGFiR3JvdXBzKGdyb3Vwcyk7XG4gICAgICAgICAgbG9nSW5mbyhcIkF1dG8tcnVuIHRhcmdldGVkXCIsIHsgdGFiczogaWRzLCBzdHJhdGVnaWVzOiBzdHJhdGVneUlkcyB9KTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiQXV0by1ydW4gdGFyZ2V0ZWQgZmFpbGVkXCIsIGUpO1xuICAgICAgfVxuICAgIH0sIDIwMCk7IC8vIEZhc3QgZGVib3VuY2UgZm9yIHJlc3BvbnNpdmVuZXNzXG4gIH1cblxuICAvLyAyLiBTY2hlZHVsZSBnbG9iYWwgdXBkYXRlIChzbG93ZXIgZGVib3VuY2UpIHRvIGVuc3VyZSBjb25zaXN0ZW5jeSBhbmQgc29ydGluZ1xuICBpZiAoYXV0b1J1blRpbWVvdXQpIGNsZWFyVGltZW91dChhdXRvUnVuVGltZW91dCk7XG4gIGF1dG9SdW5UaW1lb3V0ID0gc2V0VGltZW91dChhc3luYyAoKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuXG4gICAgICBjb25zdCBhdXRvUnVuU3RyYXRzID0gcHJlZnMuY3VzdG9tU3RyYXRlZ2llcz8uZmlsdGVyKHMgPT4gcy5hdXRvUnVuKTtcbiAgICAgIGlmIChhdXRvUnVuU3RyYXRzICYmIGF1dG9SdW5TdHJhdHMubGVuZ3RoID4gMCkge1xuICAgICAgICBsb2dJbmZvKFwiQXV0by1ydW5uaW5nIHN0cmF0ZWdpZXMgKGdsb2JhbClcIiwge1xuICAgICAgICAgIHN0cmF0ZWdpZXM6IGF1dG9SdW5TdHJhdHMubWFwKHMgPT4gcy5pZCksXG4gICAgICAgICAgY291bnQ6IGF1dG9SdW5TdHJhdHMubGVuZ3RoXG4gICAgICAgIH0pO1xuICAgICAgICBjb25zdCBpZHMgPSBhdXRvUnVuU3RyYXRzLm1hcChzID0+IHMuaWQpO1xuXG4gICAgICAgIC8vIFdlIGFwcGx5IGdyb3VwaW5nIHVzaW5nIHRoZXNlIHN0cmF0ZWdpZXNcbiAgICAgICAgY29uc3QgZ3JvdXBzID0gYXdhaXQgY2FsY3VsYXRlVGFiR3JvdXBzKHsgLi4ucHJlZnMsIHNvcnRpbmc6IGlkcyB9KTtcbiAgICAgICAgYXdhaXQgYXBwbHlUYWJHcm91cHMoZ3JvdXBzKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiQXV0by1ydW4gZmFpbGVkXCIsIGUpO1xuICAgIH1cbiAgfSwgMTAwMCk7XG59O1xuXG5jaHJvbWUudGFicy5vbkNyZWF0ZWQuYWRkTGlzdGVuZXIoKHRhYikgPT4ge1xuICBpZiAodGFiLmlkKSB0cmlnZ2VyQXV0b1J1bih0YWIuaWQpO1xuICBlbHNlIHRyaWdnZXJBdXRvUnVuKCk7XG59KTtcbmNocm9tZS50YWJzLm9uVXBkYXRlZC5hZGRMaXN0ZW5lcigodGFiSWQsIGNoYW5nZUluZm8pID0+IHtcbiAgaWYgKGNoYW5nZUluZm8udXJsIHx8IGNoYW5nZUluZm8uc3RhdHVzID09PSAnY29tcGxldGUnKSB7XG4gICAgdHJpZ2dlckF1dG9SdW4odGFiSWQpO1xuICB9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFhTyxJQUFNLGFBQW1DO0FBQUEsRUFDNUMsRUFBRSxJQUFJLFVBQVUsT0FBTyxVQUFVLFlBQVksTUFBTSxXQUFXLE1BQU0sTUFBTSxDQUFDLFNBQVMsTUFBTSxFQUFFO0FBQUEsRUFDNUYsRUFBRSxJQUFJLGVBQWUsT0FBTyxlQUFlLFlBQVksTUFBTSxXQUFXLE1BQU0sTUFBTSxDQUFDLFNBQVMsTUFBTSxFQUFFO0FBQUEsRUFDdEcsRUFBRSxJQUFJLFNBQVMsT0FBTyxTQUFTLFlBQVksTUFBTSxXQUFXLE1BQU0sTUFBTSxDQUFDLFNBQVMsTUFBTSxFQUFFO0FBQUEsRUFDMUYsRUFBRSxJQUFJLFdBQVcsT0FBTyxXQUFXLFlBQVksTUFBTSxXQUFXLE1BQU0sTUFBTSxDQUFDLFNBQVMsTUFBTSxFQUFFO0FBQUEsRUFDOUYsRUFBRSxJQUFJLFdBQVcsT0FBTyxXQUFXLFlBQVksTUFBTSxXQUFXLE1BQU0sTUFBTSxDQUFDLFNBQVMsTUFBTSxFQUFFO0FBQUEsRUFDOUYsRUFBRSxJQUFJLFVBQVUsT0FBTyxVQUFVLFlBQVksTUFBTSxXQUFXLE1BQU0sTUFBTSxDQUFDLFNBQVMsTUFBTSxFQUFFO0FBQUEsRUFDNUYsRUFBRSxJQUFJLFdBQVcsT0FBTyxXQUFXLFlBQVksTUFBTSxXQUFXLE1BQU0sTUFBTSxDQUFDLFNBQVMsTUFBTSxFQUFFO0FBQUEsRUFDOUYsRUFBRSxJQUFJLE9BQU8sT0FBTyxPQUFPLFlBQVksTUFBTSxXQUFXLE1BQU0sTUFBTSxDQUFDLFNBQVMsTUFBTSxFQUFFO0FBQUEsRUFDdEYsRUFBRSxJQUFJLE9BQU8sT0FBTyxPQUFPLFlBQVksTUFBTSxXQUFXLE1BQU0sTUFBTSxDQUFDLFNBQVMsTUFBTSxFQUFFO0FBQUEsRUFDdEYsRUFBRSxJQUFJLFdBQVcsT0FBTyxXQUFXLFlBQVksTUFBTSxXQUFXLE1BQU0sTUFBTSxDQUFDLFNBQVMsTUFBTSxFQUFFO0FBQUEsRUFDOUYsRUFBRSxJQUFJLFNBQVMsT0FBTyxTQUFTLFlBQVksTUFBTSxXQUFXLE1BQU0sTUFBTSxDQUFDLFNBQVMsTUFBTSxFQUFFO0FBQzlGO0FBRU8sSUFBTSxnQkFBZ0IsQ0FBQ0Esc0JBQThEO0FBQ3hGLE1BQUksQ0FBQ0EscUJBQW9CQSxrQkFBaUIsV0FBVyxFQUFHLFFBQU87QUFHL0QsUUFBTSxXQUFXLENBQUMsR0FBRyxVQUFVO0FBRS9CLEVBQUFBLGtCQUFpQixRQUFRLFlBQVU7QUFDL0IsVUFBTSxnQkFBZ0IsU0FBUyxVQUFVLE9BQUssRUFBRSxPQUFPLE9BQU8sRUFBRTtBQUdoRSxVQUFNLGNBQWUsT0FBTyxpQkFBaUIsT0FBTyxjQUFjLFNBQVMsS0FBTyxPQUFPLFNBQVMsT0FBTyxNQUFNLFNBQVMsS0FBTTtBQUM5SCxVQUFNLGFBQWMsT0FBTyxnQkFBZ0IsT0FBTyxhQUFhLFNBQVMsS0FBTyxPQUFPLFNBQVMsT0FBTyxNQUFNLFNBQVMsS0FBTTtBQUUzSCxVQUFNLE9BQWlCLENBQUM7QUFDeEIsUUFBSSxZQUFhLE1BQUssS0FBSyxPQUFPO0FBQ2xDLFFBQUksV0FBWSxNQUFLLEtBQUssTUFBTTtBQUVoQyxVQUFNLGFBQWlDO0FBQUEsTUFDbkMsSUFBSSxPQUFPO0FBQUEsTUFDWCxPQUFPLE9BQU87QUFBQSxNQUNkLFlBQVk7QUFBQSxNQUNaLFdBQVc7QUFBQSxNQUNYO0FBQUEsTUFDQSxTQUFTLE9BQU87QUFBQSxNQUNoQixVQUFVO0FBQUEsSUFDZDtBQUVBLFFBQUksa0JBQWtCLElBQUk7QUFDdEIsZUFBUyxhQUFhLElBQUk7QUFBQSxJQUM5QixPQUFPO0FBQ0gsZUFBUyxLQUFLLFVBQVU7QUFBQSxJQUM1QjtBQUFBLEVBQ0osQ0FBQztBQUVELFNBQU87QUFDWDs7O0FDNURBLElBQU0sU0FBUztBQUVmLElBQU0saUJBQTJDO0FBQUEsRUFDL0MsT0FBTztBQUFBLEVBQ1AsTUFBTTtBQUFBLEVBQ04sTUFBTTtBQUFBLEVBQ04sT0FBTztBQUFBLEVBQ1AsVUFBVTtBQUNaO0FBRUEsSUFBSSxlQUF5QjtBQUM3QixJQUFJLE9BQW1CLENBQUM7QUFDeEIsSUFBTSxXQUFXO0FBQ2pCLElBQU0sY0FBYztBQUdwQixJQUFNLGtCQUFrQixPQUFPLFNBQVMsZUFDaEIsT0FBUSxLQUFhLDZCQUE2QixlQUNsRCxnQkFBaUIsS0FBYTtBQUN0RCxJQUFJLFdBQVc7QUFDZixJQUFJLGNBQWM7QUFDbEIsSUFBSSxZQUFrRDtBQUV0RCxJQUFNLFNBQVMsTUFBTTtBQUNqQixNQUFJLENBQUMsbUJBQW1CLENBQUMsUUFBUSxTQUFTLFdBQVcsVUFBVTtBQUMzRCxrQkFBYztBQUNkO0FBQUEsRUFDSjtBQUVBLGFBQVc7QUFDWCxnQkFBYztBQUVkLFNBQU8sUUFBUSxRQUFRLElBQUksRUFBRSxDQUFDLFdBQVcsR0FBRyxLQUFLLENBQUMsRUFBRSxLQUFLLE1BQU07QUFDM0QsZUFBVztBQUNYLFFBQUksYUFBYTtBQUNiLHdCQUFrQjtBQUFBLElBQ3RCO0FBQUEsRUFDSixDQUFDLEVBQUUsTUFBTSxTQUFPO0FBQ1osWUFBUSxNQUFNLHVCQUF1QixHQUFHO0FBQ3hDLGVBQVc7QUFBQSxFQUNmLENBQUM7QUFDTDtBQUVBLElBQU0sb0JBQW9CLE1BQU07QUFDNUIsTUFBSSxVQUFXLGNBQWEsU0FBUztBQUNyQyxjQUFZLFdBQVcsUUFBUSxHQUFJO0FBQ3ZDO0FBRUEsSUFBSTtBQUNHLElBQU0sY0FBYyxJQUFJLFFBQWMsYUFBVztBQUNwRCx1QkFBcUI7QUFDekIsQ0FBQztBQUVNLElBQU0sYUFBYSxZQUFZO0FBQ2xDLE1BQUksbUJBQW1CLFFBQVEsU0FBUyxTQUFTO0FBQzdDLFFBQUk7QUFDQSxZQUFNLFNBQVMsTUFBTSxPQUFPLFFBQVEsUUFBUSxJQUFJLFdBQVc7QUFDM0QsVUFBSSxPQUFPLFdBQVcsS0FBSyxNQUFNLFFBQVEsT0FBTyxXQUFXLENBQUMsR0FBRztBQUMzRCxlQUFPLE9BQU8sV0FBVztBQUN6QixZQUFJLEtBQUssU0FBUyxTQUFVLFFBQU8sS0FBSyxNQUFNLEdBQUcsUUFBUTtBQUFBLE1BQzdEO0FBQUEsSUFDSixTQUFTLEdBQUc7QUFDUixjQUFRLE1BQU0sMEJBQTBCLENBQUM7QUFBQSxJQUM3QztBQUFBLEVBQ0o7QUFDQSxNQUFJLG1CQUFvQixvQkFBbUI7QUFDL0M7QUFFTyxJQUFNLHVCQUF1QixDQUFDLFVBQXVCO0FBQzFELE1BQUksTUFBTSxVQUFVO0FBQ2xCLG1CQUFlLE1BQU07QUFBQSxFQUN2QixXQUFXLE1BQU0sT0FBTztBQUN0QixtQkFBZTtBQUFBLEVBQ2pCLE9BQU87QUFDTCxtQkFBZTtBQUFBLEVBQ2pCO0FBQ0Y7QUFFQSxJQUFNLFlBQVksQ0FBQyxVQUE2QjtBQUM5QyxTQUFPLGVBQWUsS0FBSyxLQUFLLGVBQWUsWUFBWTtBQUM3RDtBQUVBLElBQU0sZ0JBQWdCLENBQUMsU0FBaUIsWUFBc0M7QUFDNUUsU0FBTyxVQUFVLEdBQUcsT0FBTyxPQUFPLEtBQUssVUFBVSxPQUFPLENBQUMsS0FBSztBQUNoRTtBQUVBLElBQU0sU0FBUyxDQUFDLE9BQWlCLFNBQWlCLFlBQXNDO0FBQ3RGLE1BQUksVUFBVSxLQUFLLEdBQUc7QUFDbEIsVUFBTSxRQUFrQjtBQUFBLE1BQ3BCLFdBQVcsS0FBSyxJQUFJO0FBQUEsTUFDcEI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0o7QUFFQSxRQUFJLGlCQUFpQjtBQUNqQixXQUFLLFFBQVEsS0FBSztBQUNsQixVQUFJLEtBQUssU0FBUyxVQUFVO0FBQ3hCLGFBQUssSUFBSTtBQUFBLE1BQ2I7QUFDQSx3QkFBa0I7QUFBQSxJQUN0QixPQUFPO0FBRUgsVUFBSSxRQUFRLFNBQVMsYUFBYTtBQUMvQixlQUFPLFFBQVEsWUFBWSxFQUFFLE1BQU0sWUFBWSxTQUFTLE1BQU0sQ0FBQyxFQUFFLE1BQU0sTUFBTTtBQUFBLFFBRTdFLENBQUM7QUFBQSxNQUNKO0FBQUEsSUFDSjtBQUFBLEVBQ0o7QUFDRjtBQUVPLElBQU0sY0FBYyxDQUFDLFVBQW9CO0FBQzVDLE1BQUksaUJBQWlCO0FBQ2pCLFNBQUssUUFBUSxLQUFLO0FBQ2xCLFFBQUksS0FBSyxTQUFTLFVBQVU7QUFDeEIsV0FBSyxJQUFJO0FBQUEsSUFDYjtBQUNBLHNCQUFrQjtBQUFBLEVBQ3RCO0FBQ0o7QUFFTyxJQUFNLFVBQVUsTUFBTSxDQUFDLEdBQUcsSUFBSTtBQUM5QixJQUFNLFlBQVksTUFBTTtBQUMzQixPQUFLLFNBQVM7QUFDZCxNQUFJLGdCQUFpQixtQkFBa0I7QUFDM0M7QUFFTyxJQUFNLFdBQVcsQ0FBQyxTQUFpQixZQUFzQztBQUM5RSxTQUFPLFNBQVMsU0FBUyxPQUFPO0FBQ2hDLE1BQUksVUFBVSxPQUFPLEdBQUc7QUFDdEIsWUFBUSxNQUFNLEdBQUcsTUFBTSxZQUFZLGNBQWMsU0FBUyxPQUFPLENBQUMsRUFBRTtBQUFBLEVBQ3RFO0FBQ0Y7QUFFTyxJQUFNLFVBQVUsQ0FBQyxTQUFpQixZQUFzQztBQUM3RSxTQUFPLFFBQVEsU0FBUyxPQUFPO0FBQy9CLE1BQUksVUFBVSxNQUFNLEdBQUc7QUFDckIsWUFBUSxLQUFLLEdBQUcsTUFBTSxXQUFXLGNBQWMsU0FBUyxPQUFPLENBQUMsRUFBRTtBQUFBLEVBQ3BFO0FBQ0Y7QUFTTyxJQUFNLFdBQVcsQ0FBQyxTQUFpQixZQUFzQztBQUM5RSxTQUFPLFNBQVMsU0FBUyxPQUFPO0FBQ2hDLE1BQUksVUFBVSxPQUFPLEdBQUc7QUFDdEIsWUFBUSxNQUFNLEdBQUcsTUFBTSxZQUFZLGNBQWMsU0FBUyxPQUFPLENBQUMsRUFBRTtBQUFBLEVBQ3RFO0FBQ0Y7OztBQzFKTyxJQUFNLGVBQWUsQ0FBQyxRQUE2QztBQUN4RSxNQUFJLENBQUMsSUFBSSxNQUFNLElBQUksT0FBTyxPQUFPLEtBQUssZUFBZSxDQUFDLElBQUksU0FBVSxRQUFPO0FBQzNFLFNBQU87QUFBQSxJQUNMLElBQUksSUFBSTtBQUFBLElBQ1IsVUFBVSxJQUFJO0FBQUEsSUFDZCxPQUFPLElBQUksU0FBUztBQUFBLElBQ3BCLEtBQUssSUFBSSxjQUFjLElBQUksT0FBTztBQUFBLElBQ2xDLFFBQVEsUUFBUSxJQUFJLE1BQU07QUFBQSxJQUMxQixjQUFjLElBQUk7QUFBQSxJQUNsQixhQUFhLElBQUksZUFBZTtBQUFBLElBQ2hDLFlBQVksSUFBSTtBQUFBLElBQ2hCLFNBQVMsSUFBSTtBQUFBLElBQ2IsT0FBTyxJQUFJO0FBQUEsSUFDWCxRQUFRLElBQUk7QUFBQSxJQUNaLFFBQVEsSUFBSTtBQUFBLElBQ1osVUFBVSxJQUFJO0FBQUEsRUFDaEI7QUFDRjtBQVVPLElBQU0sVUFBVSxDQUFJLFVBQXdCO0FBQy9DLE1BQUksTUFBTSxRQUFRLEtBQUssRUFBRyxRQUFPO0FBQ2pDLFNBQU8sQ0FBQztBQUNaOzs7QUMzQkEsSUFBSSxtQkFBcUMsQ0FBQztBQUVuQyxJQUFNLHNCQUFzQixDQUFDLGVBQWlDO0FBQ2pFLHFCQUFtQjtBQUN2QjtBQUVPLElBQU0sc0JBQXNCLE1BQXdCO0FBRTNELElBQU0sU0FBUyxDQUFDLFFBQVEsUUFBUSxPQUFPLFVBQVUsU0FBUyxRQUFRLFVBQVUsUUFBUSxRQUFRO0FBRTVGLElBQU0sYUFBYSxvQkFBSSxJQUFvQjtBQUMzQyxJQUFNLGNBQWMsb0JBQUksSUFBb0I7QUFDNUMsSUFBTSxpQkFBaUIsb0JBQUksSUFBb0I7QUFDL0MsSUFBTSxpQkFBaUI7QUFFaEIsSUFBTSxnQkFBZ0IsQ0FBQyxRQUF3QjtBQUNwRCxNQUFJLFlBQVksSUFBSSxHQUFHLEVBQUcsUUFBTyxZQUFZLElBQUksR0FBRztBQUVwRCxNQUFJO0FBQ0YsVUFBTSxTQUFTLElBQUksSUFBSSxHQUFHO0FBQzFCLFVBQU0sU0FBUyxPQUFPLFNBQVMsUUFBUSxVQUFVLEVBQUU7QUFFbkQsUUFBSSxZQUFZLFFBQVEsZUFBZ0IsYUFBWSxNQUFNO0FBQzFELGdCQUFZLElBQUksS0FBSyxNQUFNO0FBRTNCLFdBQU87QUFBQSxFQUNULFNBQVMsT0FBTztBQUNkLGFBQVMsMEJBQTBCLEVBQUUsS0FBSyxPQUFPLE9BQU8sS0FBSyxFQUFFLENBQUM7QUFDaEUsV0FBTztBQUFBLEVBQ1Q7QUFDRjtBQUVPLElBQU0sbUJBQW1CLENBQUMsUUFBd0I7QUFDckQsTUFBSSxlQUFlLElBQUksR0FBRyxFQUFHLFFBQU8sZUFBZSxJQUFJLEdBQUc7QUFFMUQsTUFBSTtBQUNBLFVBQU0sU0FBUyxJQUFJLElBQUksR0FBRztBQUMxQixRQUFJLFdBQVcsT0FBTztBQUV0QixlQUFXLFNBQVMsUUFBUSxVQUFVLEVBQUU7QUFFeEMsUUFBSSxTQUFTO0FBQ2IsVUFBTSxRQUFRLFNBQVMsTUFBTSxHQUFHO0FBQ2hDLFFBQUksTUFBTSxTQUFTLEdBQUc7QUFDakIsZUFBUyxNQUFNLE1BQU0sR0FBRyxNQUFNLFNBQVMsQ0FBQyxFQUFFLEtBQUssR0FBRztBQUFBLElBQ3ZEO0FBRUEsUUFBSSxlQUFlLFFBQVEsZUFBZ0IsZ0JBQWUsTUFBTTtBQUNoRSxtQkFBZSxJQUFJLEtBQUssTUFBTTtBQUU5QixXQUFPO0FBQUEsRUFDWCxRQUFRO0FBQ0osV0FBTztBQUFBLEVBQ1g7QUFDSjtBQUVBLElBQU0sb0JBQW9CLENBQUMsS0FBYyxTQUEwQjtBQUMvRCxNQUFJLENBQUMsT0FBTyxPQUFPLFFBQVEsU0FBVSxRQUFPO0FBRTVDLE1BQUksQ0FBQyxLQUFLLFNBQVMsR0FBRyxHQUFHO0FBQ3JCLFdBQVEsSUFBZ0MsSUFBSTtBQUFBLEVBQ2hEO0FBRUEsUUFBTSxRQUFRLEtBQUssTUFBTSxHQUFHO0FBQzVCLE1BQUksVUFBbUI7QUFFdkIsYUFBVyxPQUFPLE9BQU87QUFDckIsUUFBSSxDQUFDLFdBQVcsT0FBTyxZQUFZLFNBQVUsUUFBTztBQUNwRCxjQUFXLFFBQW9DLEdBQUc7QUFBQSxFQUN0RDtBQUVBLFNBQU87QUFDWDtBQUVPLElBQU0sZ0JBQWdCLENBQUMsS0FBa0IsVUFBdUI7QUFDbkUsVUFBTyxPQUFPO0FBQUEsSUFDVixLQUFLO0FBQU0sYUFBTyxJQUFJO0FBQUEsSUFDdEIsS0FBSztBQUFTLGFBQU8sSUFBSTtBQUFBLElBQ3pCLEtBQUs7QUFBWSxhQUFPLElBQUk7QUFBQSxJQUM1QixLQUFLO0FBQVcsYUFBTyxJQUFJO0FBQUEsSUFDM0IsS0FBSztBQUFTLGFBQU8sSUFBSTtBQUFBLElBQ3pCLEtBQUs7QUFBTyxhQUFPLElBQUk7QUFBQSxJQUN2QixLQUFLO0FBQVUsYUFBTyxJQUFJO0FBQUEsSUFDMUIsS0FBSztBQUFVLGFBQU8sSUFBSTtBQUFBLElBQzFCLEtBQUs7QUFBWSxhQUFPLElBQUk7QUFBQSxJQUM1QixLQUFLO0FBQVUsYUFBTyxJQUFJO0FBQUEsSUFDMUIsS0FBSztBQUFlLGFBQU8sSUFBSTtBQUFBLElBQy9CLEtBQUs7QUFBZ0IsYUFBTyxJQUFJO0FBQUEsSUFDaEMsS0FBSztBQUFXLGFBQU8sSUFBSTtBQUFBLElBQzNCLEtBQUs7QUFBUyxhQUFPLElBQUksYUFBYTtBQUFBLElBQ3RDLEtBQUs7QUFBWSxhQUFPLElBQUksYUFBYTtBQUFBO0FBQUEsSUFFekMsS0FBSztBQUFVLGFBQU8sY0FBYyxJQUFJLEdBQUc7QUFBQSxJQUMzQyxLQUFLO0FBQWEsYUFBTyxpQkFBaUIsSUFBSSxHQUFHO0FBQUEsSUFDakQ7QUFDSSxhQUFPLGtCQUFrQixLQUFLLEtBQUs7QUFBQSxFQUMzQztBQUNKO0FBRUEsSUFBTSxXQUFXLENBQUMsV0FBMkI7QUFDM0MsU0FBTyxPQUFPLFFBQVEsZ0NBQWdDLEVBQUU7QUFDMUQ7QUFFTyxJQUFNLGlCQUFpQixDQUFDLE9BQWUsUUFBd0I7QUFDcEUsUUFBTSxNQUFNLEdBQUcsS0FBSyxJQUFJLEdBQUcsR0FBRyxZQUFZO0FBQzFDLE1BQUksSUFBSSxTQUFTLEtBQUssS0FBSyxJQUFJLFNBQVMsUUFBUSxLQUFLLElBQUksU0FBUyxPQUFPLEVBQUcsUUFBTztBQUNuRixNQUFJLElBQUksU0FBUyxNQUFNLEtBQUssSUFBSSxTQUFTLE9BQU8sRUFBRyxRQUFPO0FBQzFELE1BQUksSUFBSSxTQUFTLFdBQVcsS0FBSyxJQUFJLFNBQVMsU0FBUyxFQUFHLFFBQU87QUFDakUsTUFBSSxJQUFJLFNBQVMsT0FBTyxLQUFLLElBQUksU0FBUyxRQUFRLEVBQUcsUUFBTztBQUM1RCxNQUFJLElBQUksU0FBUyxPQUFPLEtBQUssSUFBSSxTQUFTLFNBQVMsRUFBRyxRQUFPO0FBQzdELFNBQU87QUFDVDtBQUVPLElBQU0sZ0JBQWdCLENBQUMsUUFBNkI7QUFDekQsTUFBSSxJQUFJLGdCQUFnQixRQUFXO0FBQ2pDLFdBQU8sWUFBWSxJQUFJLFdBQVc7QUFBQSxFQUNwQztBQUNBLFNBQU8sVUFBVSxJQUFJLFFBQVE7QUFDL0I7QUFFQSxJQUFNLGtCQUFrQixDQUFDLGlCQUFpQztBQUN4RCxRQUFNLE1BQU0sS0FBSyxJQUFJO0FBQ3JCLFFBQU0sT0FBTyxNQUFNO0FBQ25CLE1BQUksT0FBTyxLQUFTLFFBQU87QUFDM0IsTUFBSSxPQUFPLE1BQVUsUUFBTztBQUM1QixNQUFJLE9BQU8sT0FBVyxRQUFPO0FBQzdCLE1BQUksT0FBTyxPQUFXLFFBQU87QUFDN0IsU0FBTztBQUNUO0FBRUEsSUFBTSxjQUFjLENBQUMsS0FBYSxXQUEyQixRQUFRLEtBQUssSUFBSSxTQUFTLEdBQUcsQ0FBQyxJQUFJLFVBQVUsT0FBTyxNQUFNO0FBRXRILElBQU0sV0FBVyxDQUFDLFVBQTBCO0FBQzFDLE1BQUksT0FBTztBQUNYLFdBQVMsSUFBSSxHQUFHLElBQUksTUFBTSxRQUFRLEtBQUssR0FBRztBQUN4QyxZQUFRLFFBQVEsS0FBSyxPQUFPLE1BQU0sV0FBVyxDQUFDO0FBQzlDLFlBQVE7QUFBQSxFQUNWO0FBQ0EsU0FBTztBQUNUO0FBR0EsSUFBTSxvQkFBb0IsQ0FBQyxVQUFxQyxNQUFxQixlQUF3RDtBQUMzSSxRQUFNLFdBQVcsS0FBSyxDQUFDO0FBQ3ZCLE1BQUksQ0FBQyxTQUFVLFFBQU87QUFHdEIsUUFBTSxTQUFTLGlCQUFpQixLQUFLLE9BQUssRUFBRSxPQUFPLFFBQVE7QUFDM0QsTUFBSSxRQUFRO0FBQ1IsV0FBTyxZQUFZLFVBQVUsUUFBUTtBQUFBLEVBQ3pDO0FBRUEsVUFBUSxVQUFVO0FBQUEsSUFDaEIsS0FBSyxVQUFVO0FBQ2IsWUFBTSxZQUFZLElBQUksSUFBSSxLQUFLLElBQUksT0FBSyxFQUFFLGFBQWEsUUFBUSxFQUFFLE9BQU8sT0FBTyxDQUFDO0FBQ2hGLFVBQUksVUFBVSxTQUFTLEdBQUc7QUFDeEIsZUFBTyxTQUFTLE1BQU0sS0FBSyxTQUFTLEVBQUUsQ0FBQyxDQUFXO0FBQUEsTUFDcEQ7QUFDQSxhQUFPLFNBQVMsY0FBYyxTQUFTLEdBQUcsQ0FBQztBQUFBLElBQzdDO0FBQUEsSUFDQSxLQUFLO0FBQ0gsYUFBTyxjQUFjLFNBQVMsR0FBRztBQUFBLElBQ25DLEtBQUs7QUFDSCxhQUFPLGVBQWUsU0FBUyxPQUFPLFNBQVMsR0FBRztBQUFBLElBQ3BELEtBQUs7QUFDSCxVQUFJLFNBQVMsZ0JBQWdCLFFBQVc7QUFDdEMsY0FBTSxTQUFTLFdBQVcsSUFBSSxTQUFTLFdBQVc7QUFDbEQsWUFBSSxRQUFRO0FBQ1YsZ0JBQU0sY0FBYyxPQUFPLE1BQU0sU0FBUyxLQUFLLE9BQU8sTUFBTSxVQUFVLEdBQUcsRUFBRSxJQUFJLFFBQVEsT0FBTztBQUM5RixpQkFBTyxTQUFTLFdBQVc7QUFBQSxRQUM3QjtBQUNBLGVBQU8sYUFBYSxTQUFTLFdBQVc7QUFBQSxNQUMxQztBQUNBLGFBQU8sVUFBVSxTQUFTLFFBQVE7QUFBQSxJQUNwQyxLQUFLO0FBQ0gsYUFBTyxTQUFTLFdBQVc7QUFBQSxJQUM3QixLQUFLO0FBQ0gsYUFBTyxTQUFTLFNBQVMsV0FBVztBQUFBLElBQ3RDLEtBQUs7QUFDSCxhQUFPLGdCQUFnQixTQUFTLGdCQUFnQixDQUFDO0FBQUEsSUFDbkQsS0FBSztBQUNILGFBQU87QUFBQSxJQUNULEtBQUs7QUFDSCxhQUFPO0FBQUEsSUFDVCxLQUFLO0FBQ0gsYUFBTyxTQUFTLGdCQUFnQixTQUFZLGFBQWE7QUFBQSxJQUMzRDtBQUNFLFlBQU0sTUFBTSxjQUFjLFVBQVUsUUFBUTtBQUM1QyxVQUFJLFFBQVEsVUFBYSxRQUFRLE1BQU07QUFDbkMsZUFBTyxPQUFPLEdBQUc7QUFBQSxNQUNyQjtBQUNBLGFBQU87QUFBQSxFQUNYO0FBQ0Y7QUFFQSxJQUFNLGdCQUFnQixDQUNwQixZQUNBLE1BQ0EsZUFDVztBQUNYLFFBQU0sU0FBUyxXQUNaLElBQUksT0FBSyxrQkFBa0IsR0FBRyxNQUFNLFVBQVUsQ0FBQyxFQUMvQyxPQUFPLE9BQUssS0FBSyxNQUFNLGFBQWEsTUFBTSxXQUFXLE1BQU0sZUFBZSxNQUFNLGdCQUFnQixNQUFNLE1BQU07QUFFL0csTUFBSSxPQUFPLFdBQVcsRUFBRyxRQUFPO0FBQ2hDLFNBQU8sTUFBTSxLQUFLLElBQUksSUFBSSxNQUFNLENBQUMsRUFBRSxLQUFLLEtBQUs7QUFDL0M7QUFFQSxJQUFNLHVCQUF1QixDQUFDLGVBQWlEO0FBQzNFLFFBQU0sU0FBUyxpQkFBaUIsS0FBSyxPQUFLLEVBQUUsT0FBTyxVQUFVO0FBQzdELE1BQUksQ0FBQyxPQUFRLFFBQU87QUFFcEIsUUFBTSxvQkFBb0IsUUFBc0IsT0FBTyxhQUFhO0FBRXBFLFdBQVMsSUFBSSxrQkFBa0IsU0FBUyxHQUFHLEtBQUssR0FBRyxLQUFLO0FBQ3BELFVBQU0sT0FBTyxrQkFBa0IsQ0FBQztBQUNoQyxRQUFJLFFBQVEsS0FBSyxTQUFTLEtBQUssVUFBVSxVQUFVO0FBQy9DLGFBQU87QUFBQSxJQUNYO0FBQUEsRUFDSjtBQUNBLFNBQU87QUFDWDtBQUVBLElBQU0sb0JBQW9CLENBQUMsVUFBa0U7QUFDekYsTUFBSSxNQUFNLFNBQVMsS0FBSyxFQUFHLFFBQU87QUFDbEMsTUFBSSxNQUFNLFNBQVMsVUFBVSxFQUFHLFFBQU87QUFDdkMsU0FBTztBQUNYO0FBRU8sSUFBTSxZQUFZLENBQ3ZCLE1BQ0EsZUFDZTtBQUNmLFFBQU0sc0JBQXNCLGNBQWMsZ0JBQWdCO0FBQzFELFFBQU0sc0JBQXNCLFdBQVcsT0FBTyxPQUFLLG9CQUFvQixLQUFLLFdBQVMsTUFBTSxPQUFPLENBQUMsR0FBRyxVQUFVO0FBQ2hILFFBQU0sVUFBVSxvQkFBSSxJQUFzQjtBQUUxQyxRQUFNLGFBQWEsb0JBQUksSUFBeUI7QUFDaEQsT0FBSyxRQUFRLE9BQUssV0FBVyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFFekMsT0FBSyxRQUFRLENBQUMsUUFBUTtBQUNwQixRQUFJLE9BQWlCLENBQUM7QUFDdEIsVUFBTSxvQkFBOEIsQ0FBQztBQUNyQyxVQUFNLGlCQUEyQixDQUFDO0FBRWxDLFFBQUk7QUFDQSxpQkFBVyxLQUFLLHFCQUFxQjtBQUNqQyxjQUFNLFNBQVMsa0JBQWtCLEtBQUssQ0FBQztBQUN2QyxZQUFJLE9BQU8sUUFBUSxNQUFNO0FBQ3JCLGVBQUssS0FBSyxHQUFHLENBQUMsSUFBSSxPQUFPLEdBQUcsRUFBRTtBQUM5Qiw0QkFBa0IsS0FBSyxDQUFDO0FBQ3hCLHlCQUFlLEtBQUssT0FBTyxJQUFJO0FBQUEsUUFDbkM7QUFBQSxNQUNKO0FBQUEsSUFDSixTQUFTLEdBQUc7QUFDUixlQUFTLGlDQUFpQyxFQUFFLE9BQU8sSUFBSSxJQUFJLE9BQU8sT0FBTyxDQUFDLEVBQUUsQ0FBQztBQUM3RTtBQUFBLElBQ0o7QUFHQSxRQUFJLEtBQUssV0FBVyxHQUFHO0FBQ25CO0FBQUEsSUFDSjtBQUVBLFVBQU0sZ0JBQWdCLGtCQUFrQixjQUFjO0FBQ3RELFVBQU0sV0FBVyxLQUFLLEtBQUssSUFBSTtBQUMvQixRQUFJLFlBQVk7QUFDaEIsUUFBSSxrQkFBa0IsV0FBVztBQUM1QixrQkFBWSxVQUFVLElBQUksUUFBUSxPQUFPO0FBQUEsSUFDOUMsT0FBTztBQUNGLGtCQUFZLGFBQWE7QUFBQSxJQUM5QjtBQUVBLFFBQUksUUFBUSxRQUFRLElBQUksU0FBUztBQUNqQyxRQUFJLENBQUMsT0FBTztBQUNWLFVBQUksYUFBYTtBQUNqQixVQUFJO0FBQ0osVUFBSTtBQUNKLFVBQUk7QUFFSixpQkFBVyxPQUFPLG1CQUFtQjtBQUNuQyxjQUFNLE9BQU8scUJBQXFCLEdBQUc7QUFDckMsWUFBSSxNQUFNO0FBQ04sdUJBQWEsS0FBSztBQUNsQix1QkFBYSxLQUFLO0FBQ2xCLDJCQUFpQixLQUFLO0FBQ3RCLGtDQUF3QixLQUFLO0FBQzdCO0FBQUEsUUFDSjtBQUFBLE1BQ0Y7QUFFQSxVQUFJLGVBQWUsU0FBUztBQUMxQixxQkFBYSxZQUFZLFVBQVUsQ0FBQztBQUFBLE1BQ3RDLFdBQVcsZUFBZSxXQUFXLFlBQVk7QUFDL0MsY0FBTSxNQUFNLGNBQWMsS0FBSyxVQUFVO0FBQ3pDLFlBQUksTUFBTSxRQUFRLFVBQWEsUUFBUSxPQUFPLE9BQU8sR0FBRyxJQUFJO0FBQzVELFlBQUksZ0JBQWdCO0FBQ2hCLGdCQUFNLG9CQUFvQixLQUFLLGdCQUFnQixxQkFBcUI7QUFBQSxRQUN4RTtBQUNBLHFCQUFhLFlBQVksS0FBSyxDQUFDO0FBQUEsTUFDakMsV0FBVyxDQUFDLGNBQWMsZUFBZSxTQUFTO0FBQ2hELHFCQUFhLFlBQVksV0FBVyxRQUFRLElBQUk7QUFBQSxNQUNsRDtBQUVBLGNBQVE7QUFBQSxRQUNOLElBQUk7QUFBQSxRQUNKLFVBQVUsSUFBSTtBQUFBLFFBQ2QsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLFFBQ1AsTUFBTSxDQUFDO0FBQUEsUUFDUCxRQUFRLGtCQUFrQixLQUFLLEtBQUs7QUFBQSxRQUNwQyxZQUFZO0FBQUEsTUFDZDtBQUNBLGNBQVEsSUFBSSxXQUFXLEtBQUs7QUFBQSxJQUM5QjtBQUNBLFVBQU0sS0FBSyxLQUFLLEdBQUc7QUFBQSxFQUNyQixDQUFDO0FBRUQsUUFBTSxTQUFTLE1BQU0sS0FBSyxRQUFRLE9BQU8sQ0FBQztBQUMxQyxTQUFPLFFBQVEsV0FBUztBQUN0QixVQUFNLFFBQVEsY0FBYyxxQkFBcUIsTUFBTSxNQUFNLFVBQVU7QUFBQSxFQUN6RSxDQUFDO0FBRUQsU0FBTztBQUNUO0FBRUEsSUFBTSxrQkFBa0IsQ0FDcEIsVUFDQSxVQUNBLGNBQ3lEO0FBQ3pELFFBQU0sV0FBVyxhQUFhLFVBQWEsYUFBYSxPQUFPLE9BQU8sUUFBUSxJQUFJO0FBQ2xGLFFBQU0sZUFBZSxTQUFTLFlBQVk7QUFDMUMsUUFBTSxpQkFBaUIsWUFBWSxVQUFVLFlBQVksSUFBSTtBQUU3RCxNQUFJLFVBQVU7QUFDZCxNQUFJLFdBQW1DO0FBRXZDLFVBQVEsVUFBVTtBQUFBLElBQ2QsS0FBSztBQUFZLGdCQUFVLGFBQWEsU0FBUyxjQUFjO0FBQUc7QUFBQSxJQUNsRSxLQUFLO0FBQWtCLGdCQUFVLENBQUMsYUFBYSxTQUFTLGNBQWM7QUFBRztBQUFBLElBQ3pFLEtBQUs7QUFBVSxnQkFBVSxpQkFBaUI7QUFBZ0I7QUFBQSxJQUMxRCxLQUFLO0FBQWMsZ0JBQVUsYUFBYSxXQUFXLGNBQWM7QUFBRztBQUFBLElBQ3RFLEtBQUs7QUFBWSxnQkFBVSxhQUFhLFNBQVMsY0FBYztBQUFHO0FBQUEsSUFDbEUsS0FBSztBQUFVLGdCQUFVLGFBQWE7QUFBVztBQUFBLElBQ2pELEtBQUs7QUFBZ0IsZ0JBQVUsYUFBYTtBQUFXO0FBQUEsSUFDdkQsS0FBSztBQUFVLGdCQUFVLGFBQWE7QUFBTTtBQUFBLElBQzVDLEtBQUs7QUFBYSxnQkFBVSxhQUFhO0FBQU07QUFBQSxJQUMvQyxLQUFLO0FBQ0EsVUFBSTtBQUNELGNBQU0sUUFBUSxJQUFJLE9BQU8sV0FBVyxHQUFHO0FBQ3ZDLG1CQUFXLE1BQU0sS0FBSyxRQUFRO0FBQzlCLGtCQUFVLENBQUMsQ0FBQztBQUFBLE1BQ2YsUUFBUTtBQUFBLE1BQUU7QUFDVjtBQUFBLEVBQ1Q7QUFDQSxTQUFPLEVBQUUsU0FBUyxTQUFTO0FBQy9CO0FBRU8sSUFBTSxpQkFBaUIsQ0FBQyxXQUEwQixRQUE4QjtBQUNuRixNQUFJLENBQUMsVUFBVyxRQUFPO0FBQ3ZCLFFBQU0sV0FBVyxjQUFjLEtBQUssVUFBVSxLQUFLO0FBQ25ELFFBQU0sRUFBRSxRQUFRLElBQUksZ0JBQWdCLFVBQVUsVUFBVSxVQUFVLFVBQVUsS0FBSztBQUNqRixTQUFPO0FBQ1g7QUFFTyxJQUFNLHNCQUFzQixDQUFDLEtBQWEsV0FBbUIsU0FBa0IsZ0JBQWlDO0FBQ25ILE1BQUksQ0FBQyxPQUFPLENBQUMsYUFBYSxjQUFjLE9BQVEsUUFBTztBQUV2RCxVQUFRLFdBQVc7QUFBQSxJQUNmLEtBQUs7QUFDRCxhQUFPLFNBQVMsR0FBRztBQUFBLElBQ3ZCLEtBQUs7QUFDRCxhQUFPLElBQUksWUFBWTtBQUFBLElBQzNCLEtBQUs7QUFDRCxhQUFPLElBQUksWUFBWTtBQUFBLElBQzNCLEtBQUs7QUFDRCxhQUFPLElBQUksT0FBTyxDQUFDO0FBQUEsSUFDdkIsS0FBSztBQUNELGFBQU8sY0FBYyxHQUFHO0FBQUEsSUFDNUIsS0FBSztBQUNELFVBQUk7QUFDRixlQUFPLElBQUksSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUN0QixRQUFRO0FBQUUsZUFBTztBQUFBLE1BQUs7QUFBQSxJQUMxQixLQUFLO0FBQ0QsVUFBSSxTQUFTO0FBQ1QsWUFBSTtBQUNBLGNBQUksUUFBUSxXQUFXLElBQUksT0FBTztBQUNsQyxjQUFJLENBQUMsT0FBTztBQUNSLG9CQUFRLElBQUksT0FBTyxPQUFPO0FBQzFCLHVCQUFXLElBQUksU0FBUyxLQUFLO0FBQUEsVUFDakM7QUFDQSxnQkFBTSxRQUFRLE1BQU0sS0FBSyxHQUFHO0FBQzVCLGNBQUksT0FBTztBQUNQLGdCQUFJLFlBQVk7QUFDaEIscUJBQVMsSUFBSSxHQUFHLElBQUksTUFBTSxRQUFRLEtBQUs7QUFDbkMsMkJBQWEsTUFBTSxDQUFDLEtBQUs7QUFBQSxZQUM3QjtBQUNBLG1CQUFPO0FBQUEsVUFDWCxPQUFPO0FBQ0gsbUJBQU87QUFBQSxVQUNYO0FBQUEsUUFDSixTQUFTLEdBQUc7QUFDUixtQkFBUyw4QkFBOEIsRUFBRSxTQUFrQixPQUFPLE9BQU8sQ0FBQyxFQUFFLENBQUM7QUFDN0UsaUJBQU87QUFBQSxRQUNYO0FBQUEsTUFDSixPQUFPO0FBQ0gsZUFBTztBQUFBLE1BQ1g7QUFBQSxJQUNKLEtBQUs7QUFDQSxVQUFJLFNBQVM7QUFDVCxZQUFJO0FBRUEsaUJBQU8sSUFBSSxRQUFRLElBQUksT0FBTyxTQUFTLEdBQUcsR0FBRyxlQUFlLEVBQUU7QUFBQSxRQUNsRSxTQUFTLEdBQUc7QUFDUixtQkFBUyw4QkFBOEIsRUFBRSxTQUFrQixPQUFPLE9BQU8sQ0FBQyxFQUFFLENBQUM7QUFDN0UsaUJBQU87QUFBQSxRQUNYO0FBQUEsTUFDSjtBQUNBLGFBQU87QUFBQSxJQUNaO0FBQ0ksYUFBTztBQUFBLEVBQ2Y7QUFDSjtBQUVBLFNBQVMsb0JBQW9CLGFBQTZCLEtBQWlDO0FBRXZGLE1BQUksQ0FBQyxlQUFlLENBQUMsTUFBTSxRQUFRLFdBQVcsR0FBRztBQUM3QyxRQUFJLENBQUMsWUFBYSxRQUFPO0FBQUEsRUFFN0I7QUFFQSxRQUFNLGtCQUFrQixRQUFzQixXQUFXO0FBQ3pELE1BQUksZ0JBQWdCLFdBQVcsRUFBRyxRQUFPO0FBRXpDLE1BQUk7QUFDQSxlQUFXLFFBQVEsaUJBQWlCO0FBQ2hDLFVBQUksQ0FBQyxLQUFNO0FBQ1gsWUFBTSxXQUFXLGNBQWMsS0FBSyxLQUFLLEtBQUs7QUFDOUMsWUFBTSxFQUFFLFNBQVMsU0FBUyxJQUFJLGdCQUFnQixLQUFLLFVBQVUsVUFBVSxLQUFLLEtBQUs7QUFFakYsVUFBSSxTQUFTO0FBQ1QsWUFBSSxTQUFTLEtBQUs7QUFDbEIsWUFBSSxVQUFVO0FBQ1YsbUJBQVMsSUFBSSxHQUFHLElBQUksU0FBUyxRQUFRLEtBQUs7QUFDckMscUJBQVMsT0FBTyxRQUFRLElBQUksT0FBTyxNQUFNLENBQUMsSUFBSSxHQUFHLEdBQUcsU0FBUyxDQUFDLEtBQUssRUFBRTtBQUFBLFVBQzFFO0FBQUEsUUFDSjtBQUNBLGVBQU87QUFBQSxNQUNYO0FBQUEsSUFDSjtBQUFBLEVBQ0osU0FBUyxPQUFPO0FBQ1osYUFBUyxpQ0FBaUMsRUFBRSxPQUFPLE9BQU8sS0FBSyxFQUFFLENBQUM7QUFBQSxFQUN0RTtBQUNBLFNBQU87QUFDWDtBQUVPLElBQU0sb0JBQW9CLENBQUMsS0FBa0IsYUFBc0c7QUFDeEosUUFBTSxTQUFTLGlCQUFpQixLQUFLLE9BQUssRUFBRSxPQUFPLFFBQVE7QUFDM0QsTUFBSSxRQUFRO0FBQ1IsVUFBTSxtQkFBbUIsUUFBeUIsT0FBTyxZQUFZO0FBQ3JFLFVBQU0sY0FBYyxRQUF1QixPQUFPLE9BQU87QUFFekQsUUFBSSxRQUFRO0FBRVosUUFBSSxpQkFBaUIsU0FBUyxHQUFHO0FBRTdCLGlCQUFXLFNBQVMsa0JBQWtCO0FBQ2xDLGNBQU0sYUFBYSxRQUF1QixLQUFLO0FBQy9DLFlBQUksV0FBVyxXQUFXLEtBQUssV0FBVyxNQUFNLE9BQUssZUFBZSxHQUFHLEdBQUcsQ0FBQyxHQUFHO0FBQzFFLGtCQUFRO0FBQ1I7QUFBQSxRQUNKO0FBQUEsTUFDSjtBQUFBLElBQ0osV0FBVyxZQUFZLFNBQVMsR0FBRztBQUUvQixVQUFJLFlBQVksTUFBTSxPQUFLLGVBQWUsR0FBRyxHQUFHLENBQUMsR0FBRztBQUNoRCxnQkFBUTtBQUFBLE1BQ1o7QUFBQSxJQUNKLE9BQU87QUFFSCxjQUFRO0FBQUEsSUFDWjtBQUVBLFFBQUksQ0FBQyxPQUFPO0FBQ1IsYUFBTyxFQUFFLEtBQUssTUFBTSxNQUFNLFVBQVU7QUFBQSxJQUN4QztBQUVBLFVBQU0sb0JBQW9CLFFBQXNCLE9BQU8sYUFBYTtBQUNwRSxRQUFJLGtCQUFrQixTQUFTLEdBQUc7QUFDOUIsWUFBTSxRQUFrQixDQUFDO0FBQ3pCLFlBQU0sUUFBa0IsQ0FBQztBQUN6QixVQUFJO0FBQ0YsbUJBQVcsUUFBUSxtQkFBbUI7QUFDbEMsY0FBSSxDQUFDLEtBQU07QUFDWCxjQUFJLE1BQU07QUFDVixjQUFJLEtBQUssV0FBVyxTQUFTO0FBQ3hCLGtCQUFNLE1BQU0sY0FBYyxLQUFLLEtBQUssS0FBSztBQUN6QyxrQkFBTSxRQUFRLFVBQWEsUUFBUSxPQUFPLE9BQU8sR0FBRyxJQUFJO0FBQUEsVUFDN0QsT0FBTztBQUNGLGtCQUFNLEtBQUs7QUFBQSxVQUNoQjtBQUVBLGNBQUksT0FBTyxLQUFLLGFBQWEsS0FBSyxjQUFjLFFBQVE7QUFDcEQsa0JBQU0sb0JBQW9CLEtBQUssS0FBSyxXQUFXLEtBQUssa0JBQWtCLEtBQUssb0JBQW9CO0FBQUEsVUFDbkc7QUFFQSxjQUFJLEtBQUs7QUFDTCxrQkFBTSxLQUFLLEdBQUc7QUFDZCxnQkFBSSxLQUFLLFdBQVksT0FBTSxLQUFLLEtBQUssVUFBVTtBQUFBLFVBQ25EO0FBQUEsUUFDSjtBQUFBLE1BQ0YsU0FBUyxHQUFHO0FBQ1QsaUJBQVMsaUNBQWlDLEVBQUUsT0FBTyxPQUFPLENBQUMsRUFBRSxDQUFDO0FBQUEsTUFDakU7QUFFQSxVQUFJLE1BQU0sU0FBUyxHQUFHO0FBQ2xCLGVBQU8sRUFBRSxLQUFLLE1BQU0sS0FBSyxLQUFLLEdBQUcsTUFBTSxrQkFBa0IsS0FBSyxFQUFFO0FBQUEsTUFDcEU7QUFDQSxhQUFPLEVBQUUsS0FBSyxPQUFPLFlBQVksUUFBUSxNQUFNLFVBQVU7QUFBQSxJQUM3RCxXQUFXLE9BQU8sT0FBTztBQUNyQixZQUFNLFNBQVMsb0JBQW9CLFFBQXNCLE9BQU8sS0FBSyxHQUFHLEdBQUc7QUFDM0UsVUFBSSxPQUFRLFFBQU8sRUFBRSxLQUFLLFFBQVEsTUFBTSxVQUFVO0FBQUEsSUFDdEQ7QUFFQSxXQUFPLEVBQUUsS0FBSyxPQUFPLFlBQVksUUFBUSxNQUFNLFVBQVU7QUFBQSxFQUM3RDtBQUdBLE1BQUksWUFBMkI7QUFDL0IsVUFBUSxVQUFVO0FBQUEsSUFDaEIsS0FBSztBQUFBLElBQ0wsS0FBSztBQUNILGtCQUFZLGNBQWMsSUFBSSxHQUFHO0FBQ2pDO0FBQUEsSUFDRixLQUFLO0FBQ0gsa0JBQVksZUFBZSxJQUFJLE9BQU8sSUFBSSxHQUFHO0FBQzdDO0FBQUEsSUFDRixLQUFLO0FBQ0gsa0JBQVksY0FBYyxHQUFHO0FBQzdCO0FBQUEsSUFDRixLQUFLO0FBQ0gsa0JBQVksSUFBSSxXQUFXO0FBQzNCO0FBQUEsSUFDRixLQUFLO0FBQ0gsa0JBQVksSUFBSSxTQUFTLFdBQVc7QUFDcEM7QUFBQSxJQUNGLEtBQUs7QUFDSCxrQkFBWSxnQkFBZ0IsSUFBSSxnQkFBZ0IsQ0FBQztBQUNqRDtBQUFBLElBQ0YsS0FBSztBQUNILGtCQUFZLElBQUk7QUFDaEI7QUFBQSxJQUNGLEtBQUs7QUFDSCxrQkFBWSxJQUFJO0FBQ2hCO0FBQUEsSUFDRixLQUFLO0FBQ0gsa0JBQVksT0FBTyxJQUFJLGdCQUFnQixDQUFDO0FBQ3hDO0FBQUEsSUFDRixLQUFLO0FBQ0gsa0JBQVksSUFBSSxnQkFBZ0IsU0FBWSxVQUFVO0FBQ3REO0FBQUEsSUFDRjtBQUNJLFlBQU0sTUFBTSxjQUFjLEtBQUssUUFBUTtBQUN2QyxVQUFJLFFBQVEsVUFBYSxRQUFRLE1BQU07QUFDbkMsb0JBQVksT0FBTyxHQUFHO0FBQUEsTUFDMUIsT0FBTztBQUNILG9CQUFZO0FBQUEsTUFDaEI7QUFDQTtBQUFBLEVBQ047QUFDQSxTQUFPLEVBQUUsS0FBSyxXQUFXLE1BQU0sVUFBVTtBQUMzQztBQUVPLElBQU0sY0FBYyxDQUFDLEtBQWtCLGFBQXVEO0FBQ2pHLFNBQU8sa0JBQWtCLEtBQUssUUFBUSxFQUFFO0FBQzVDO0FBRUEsU0FBUyxlQUFlLE9BQXdCO0FBQzVDLFNBQU8sVUFBVSxhQUFhLFVBQVUsV0FBVyxVQUFVLGNBQWMsTUFBTSxXQUFXLGNBQWM7QUFDOUc7QUFFTyxJQUFNLDBCQUEwQixDQUFDLGdCQUF1RDtBQUUzRixNQUFJLFlBQVksU0FBUyxTQUFTLEVBQUcsUUFBTztBQUU1QyxRQUFNLGFBQWEsY0FBYyxnQkFBZ0I7QUFFakQsUUFBTSxhQUFhLFdBQVcsT0FBTyxPQUFLLFlBQVksU0FBUyxFQUFFLEVBQUUsQ0FBQztBQUVwRSxhQUFXLE9BQU8sWUFBWTtBQUUxQixRQUFJLElBQUksT0FBTyxVQUFXLFFBQU87QUFHakMsVUFBTSxTQUFTLGlCQUFpQixLQUFLLE9BQUssRUFBRSxPQUFPLElBQUksRUFBRTtBQUN6RCxRQUFJLFFBQVE7QUFDUCxZQUFNLGlCQUFpQixRQUFzQixPQUFPLGFBQWE7QUFDakUsWUFBTSxnQkFBZ0IsUUFBcUIsT0FBTyxZQUFZO0FBQzlELFlBQU0scUJBQXFCLFFBQXFCLE9BQU8saUJBQWlCO0FBQ3hFLFlBQU0sY0FBYyxRQUF1QixPQUFPLE9BQU87QUFDekQsWUFBTSxtQkFBbUIsUUFBeUIsT0FBTyxZQUFZO0FBRXJFLGlCQUFXLFFBQVEsZ0JBQWdCO0FBQy9CLFlBQUksUUFBUSxLQUFLLFdBQVcsV0FBVyxlQUFlLEtBQUssS0FBSyxFQUFHLFFBQU87QUFDMUUsWUFBSSxRQUFRLEtBQUssVUFBVSxXQUFXLEtBQUssY0FBYyxlQUFlLEtBQUssVUFBVSxFQUFHLFFBQU87QUFBQSxNQUNyRztBQUVBLGlCQUFXLFFBQVEsZUFBZTtBQUM5QixZQUFJLFFBQVEsZUFBZSxLQUFLLEtBQUssRUFBRyxRQUFPO0FBQUEsTUFDbkQ7QUFFQSxpQkFBVyxRQUFRLG9CQUFvQjtBQUNuQyxZQUFJLFFBQVEsZUFBZSxLQUFLLEtBQUssRUFBRyxRQUFPO0FBQUEsTUFDbkQ7QUFFQSxpQkFBVyxRQUFRLGFBQWE7QUFDNUIsWUFBSSxRQUFRLGVBQWUsS0FBSyxLQUFLLEVBQUcsUUFBTztBQUFBLE1BQ25EO0FBRUEsaUJBQVcsU0FBUyxrQkFBa0I7QUFDbEMsY0FBTSxhQUFhLFFBQXVCLEtBQUs7QUFDL0MsbUJBQVcsUUFBUSxZQUFZO0FBQzNCLGNBQUksUUFBUSxlQUFlLEtBQUssS0FBSyxFQUFHLFFBQU87QUFBQSxRQUNuRDtBQUFBLE1BQ0o7QUFBQSxJQUNMO0FBQUEsRUFDSjtBQUNBLFNBQU87QUFDWDs7O0FDcG5CTyxJQUFNLGlCQUFpQixDQUFDLFFBQXNCLElBQUksZ0JBQWdCLFNBQVksSUFBSTtBQUNsRixJQUFNLGNBQWMsQ0FBQyxRQUFzQixJQUFJLFNBQVMsSUFBSTtBQUU1RCxJQUFNLFdBQVcsQ0FBQyxNQUFxQixlQUFpRDtBQUM3RixRQUFNLFVBQTZCLFdBQVcsU0FBUyxhQUFhLENBQUMsVUFBVSxTQUFTO0FBQ3hGLFNBQU8sQ0FBQyxHQUFHLElBQUksRUFBRSxLQUFLLENBQUMsR0FBRyxNQUFNO0FBQzlCLGVBQVcsWUFBWSxTQUFTO0FBQzlCLFlBQU0sT0FBTyxVQUFVLFVBQVUsR0FBRyxDQUFDO0FBQ3JDLFVBQUksU0FBUyxFQUFHLFFBQU87QUFBQSxJQUN6QjtBQUNBLFdBQU8sRUFBRSxLQUFLLEVBQUU7QUFBQSxFQUNsQixDQUFDO0FBQ0g7QUFFTyxJQUFNLFlBQVksQ0FBQyxVQUFvQyxHQUFnQixNQUEyQjtBQUV2RyxRQUFNLGVBQWUsb0JBQW9CO0FBQ3pDLFFBQU0sU0FBUyxhQUFhLEtBQUssT0FBSyxFQUFFLE9BQU8sUUFBUTtBQUN2RCxNQUFJLFFBQVE7QUFDUixVQUFNLGdCQUFnQixRQUFxQixPQUFPLFlBQVk7QUFDOUQsUUFBSSxjQUFjLFNBQVMsR0FBRztBQUUxQixVQUFJO0FBQ0EsbUJBQVcsUUFBUSxlQUFlO0FBQzlCLGNBQUksQ0FBQyxLQUFNO0FBQ1gsZ0JBQU0sT0FBTyxjQUFjLEdBQUcsS0FBSyxLQUFLO0FBQ3hDLGdCQUFNLE9BQU8sY0FBYyxHQUFHLEtBQUssS0FBSztBQUV4QyxjQUFJLFNBQVM7QUFDYixjQUFJLE9BQU8sS0FBTSxVQUFTO0FBQUEsbUJBQ2pCLE9BQU8sS0FBTSxVQUFTO0FBRS9CLGNBQUksV0FBVyxHQUFHO0FBQ2QsbUJBQU8sS0FBSyxVQUFVLFNBQVMsQ0FBQyxTQUFTO0FBQUEsVUFDN0M7QUFBQSxRQUNKO0FBQUEsTUFDSixTQUFTLEdBQUc7QUFDUixpQkFBUyx5Q0FBeUMsRUFBRSxPQUFPLE9BQU8sQ0FBQyxFQUFFLENBQUM7QUFBQSxNQUMxRTtBQUVBLGFBQU87QUFBQSxJQUNYO0FBQUEsRUFDSjtBQUdBLFVBQVEsVUFBVTtBQUFBLElBQ2hCLEtBQUs7QUFDSCxjQUFRLEVBQUUsZ0JBQWdCLE1BQU0sRUFBRSxnQkFBZ0I7QUFBQSxJQUNwRCxLQUFLO0FBQ0gsYUFBTyxlQUFlLENBQUMsSUFBSSxlQUFlLENBQUM7QUFBQSxJQUM3QyxLQUFLO0FBQ0gsYUFBTyxZQUFZLENBQUMsSUFBSSxZQUFZLENBQUM7QUFBQSxJQUN2QyxLQUFLO0FBQ0gsYUFBTyxFQUFFLE1BQU0sY0FBYyxFQUFFLEtBQUs7QUFBQSxJQUN0QyxLQUFLO0FBQ0gsYUFBTyxFQUFFLElBQUksY0FBYyxFQUFFLEdBQUc7QUFBQSxJQUNsQyxLQUFLO0FBQ0gsY0FBUSxFQUFFLFdBQVcsSUFBSSxjQUFjLEVBQUUsV0FBVyxFQUFFO0FBQUEsSUFDeEQsS0FBSztBQUFBLElBQ0wsS0FBSztBQUNILGFBQU8sY0FBYyxFQUFFLEdBQUcsRUFBRSxjQUFjLGNBQWMsRUFBRSxHQUFHLENBQUM7QUFBQSxJQUNoRSxLQUFLO0FBQ0gsYUFBTyxlQUFlLEVBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxjQUFjLGVBQWUsRUFBRSxPQUFPLEVBQUUsR0FBRyxDQUFDO0FBQUEsSUFDcEYsS0FBSztBQUNILGFBQU8sY0FBYyxDQUFDLEVBQUUsY0FBYyxjQUFjLENBQUMsQ0FBQztBQUFBLElBQ3hELEtBQUs7QUFFSCxjQUFRLFlBQVksR0FBRyxLQUFLLEtBQUssSUFBSSxjQUFjLFlBQVksR0FBRyxLQUFLLEtBQUssRUFBRTtBQUFBLElBQ2hGO0FBRUUsWUFBTSxPQUFPLGNBQWMsR0FBRyxRQUFRO0FBQ3RDLFlBQU0sT0FBTyxjQUFjLEdBQUcsUUFBUTtBQUV0QyxVQUFJLFNBQVMsVUFBYSxTQUFTLFFBQVc7QUFDMUMsWUFBSSxPQUFPLEtBQU0sUUFBTztBQUN4QixZQUFJLE9BQU8sS0FBTSxRQUFPO0FBQ3hCLGVBQU87QUFBQSxNQUNYO0FBSUEsY0FBUSxZQUFZLEdBQUcsUUFBUSxLQUFLLElBQUksY0FBYyxZQUFZLEdBQUcsUUFBUSxLQUFLLEVBQUU7QUFBQSxFQUN4RjtBQUNGOzs7QUN0Rk8sU0FBUyxhQUFhLFFBQXdCO0FBQ25ELE1BQUk7QUFDRixVQUFNLE1BQU0sSUFBSSxJQUFJLE1BQU07QUFDMUIsVUFBTSxTQUFTLElBQUksZ0JBQWdCLElBQUksTUFBTTtBQUM3QyxVQUFNLE9BQWlCLENBQUM7QUFDeEIsV0FBTyxRQUFRLENBQUMsR0FBRyxRQUFRLEtBQUssS0FBSyxHQUFHLENBQUM7QUFDekMsVUFBTSxXQUFXLElBQUksU0FBUyxRQUFRLFVBQVUsRUFBRTtBQUVsRCxVQUFNLFdBQVcsQ0FBQyxTQUFTLFlBQVksV0FBVyxTQUFTLFNBQVMsV0FBVyxNQUFNO0FBQ3JGLFVBQU0sWUFBWSxTQUFTLFNBQVMsYUFBYSxLQUFLLFNBQVMsU0FBUyxVQUFVO0FBQ2xGLFVBQU0sV0FBVyxTQUFTLFNBQVMsWUFBWTtBQUUvQyxVQUFNLE9BQWlCLENBQUM7QUFDeEIsUUFBSSxVQUFXLE1BQUssS0FBSyxLQUFLLFFBQVEsS0FBSyxLQUFLLFdBQVcsVUFBVTtBQUNyRSxRQUFJLFNBQVUsTUFBSyxLQUFLLEtBQUssTUFBTSxVQUFVO0FBRTdDLGVBQVcsT0FBTyxNQUFNO0FBQ3RCLFVBQUksU0FBUyxLQUFLLE9BQUssRUFBRSxLQUFLLEdBQUcsQ0FBQyxHQUFHO0FBQ2xDLGVBQU8sT0FBTyxHQUFHO0FBQ2pCO0FBQUEsTUFDSDtBQUNBLFdBQUssYUFBYSxhQUFhLENBQUMsS0FBSyxTQUFTLEdBQUcsR0FBRztBQUNqRCxlQUFPLE9BQU8sR0FBRztBQUFBLE1BQ3BCO0FBQUEsSUFDRjtBQUNBLFFBQUksU0FBUyxPQUFPLFNBQVM7QUFDN0IsV0FBTyxJQUFJLFNBQVM7QUFBQSxFQUN0QixTQUFTLEdBQUc7QUFDVixXQUFPO0FBQUEsRUFDVDtBQUNGO0FBRU8sU0FBUyxnQkFBZ0IsUUFBZ0I7QUFDNUMsTUFBSTtBQUNBLFVBQU0sTUFBTSxJQUFJLElBQUksTUFBTTtBQUMxQixVQUFNLElBQUksSUFBSSxhQUFhLElBQUksR0FBRztBQUNsQyxVQUFNLFdBQVcsSUFBSSxTQUFTLFNBQVMsVUFBVTtBQUNqRCxRQUFJLFVBQ0YsTUFDQyxXQUFXLElBQUksU0FBUyxNQUFNLFVBQVUsRUFBRSxDQUFDLElBQUksVUFDL0MsSUFBSSxhQUFhLGFBQWEsSUFBSSxTQUFTLFFBQVEsS0FBSyxFQUFFLElBQUk7QUFFakUsVUFBTSxhQUFhLElBQUksYUFBYSxJQUFJLE1BQU07QUFDOUMsVUFBTSxnQkFBZ0IsU0FBUyxJQUFJLGFBQWEsSUFBSSxPQUFPLEtBQUssS0FBSyxFQUFFO0FBRXZFLFdBQU8sRUFBRSxTQUFTLFVBQVUsWUFBWSxjQUFjO0FBQUEsRUFDMUQsU0FBUyxHQUFHO0FBQ1IsV0FBTyxFQUFFLFNBQVMsTUFBTSxVQUFVLE9BQU8sWUFBWSxNQUFNLGVBQWUsS0FBSztBQUFBLEVBQ25GO0FBQ0o7QUFFQSxTQUFTLGNBQWMsUUFBNEI7QUFDL0MsTUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLE9BQVEsUUFBTztBQUN0QyxNQUFJLE9BQU8sT0FBTyxXQUFXLFNBQVUsUUFBTyxPQUFPO0FBQ3JELE1BQUksTUFBTSxRQUFRLE9BQU8sTUFBTSxFQUFHLFFBQU8sT0FBTyxPQUFPLENBQUMsR0FBRyxRQUFRO0FBQ25FLE1BQUksT0FBTyxPQUFPLFdBQVcsU0FBVSxRQUFPLE9BQU8sT0FBTyxRQUFRO0FBQ3BFLFNBQU87QUFDWDtBQUVBLFNBQVMsZ0JBQWdCLFFBQXVCO0FBQzVDLE1BQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxTQUFVLFFBQU8sQ0FBQztBQUN6QyxNQUFJLE9BQU8sT0FBTyxhQUFhLFVBQVU7QUFDckMsV0FBTyxPQUFPLFNBQVMsTUFBTSxHQUFHLEVBQUUsSUFBSSxDQUFDLE1BQWMsRUFBRSxLQUFLLENBQUM7QUFBQSxFQUNqRTtBQUNBLE1BQUksTUFBTSxRQUFRLE9BQU8sUUFBUSxFQUFHLFFBQU8sT0FBTztBQUNsRCxTQUFPLENBQUM7QUFDWjtBQUVBLFNBQVMsbUJBQW1CLFFBQXlCO0FBQ2pELFFBQU0sZUFBZSxPQUFPLEtBQUssT0FBSyxLQUFLLEVBQUUsT0FBTyxNQUFNLGdCQUFnQjtBQUMxRSxNQUFJLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxRQUFRLGFBQWEsZUFBZSxFQUFHLFFBQU8sQ0FBQztBQUUzRSxRQUFNLE9BQU8sYUFBYSxnQkFBZ0IsS0FBSyxDQUFDLEdBQVEsT0FBWSxFQUFFLFlBQVksTUFBTSxFQUFFLFlBQVksRUFBRTtBQUN4RyxRQUFNLGNBQXdCLENBQUM7QUFDL0IsT0FBSyxRQUFRLENBQUMsU0FBYztBQUN4QixRQUFJLEtBQUssS0FBTSxhQUFZLEtBQUssS0FBSyxJQUFJO0FBQUEsYUFDaEMsS0FBSyxRQUFRLEtBQUssS0FBSyxLQUFNLGFBQVksS0FBSyxLQUFLLEtBQUssSUFBSTtBQUFBLEVBQ3pFLENBQUM7QUFDRCxTQUFPO0FBQ1g7QUFFTyxTQUFTLG9CQUFvQixRQUFlO0FBRy9DLFFBQU0sYUFBYSxPQUFPLEtBQUssT0FBSyxNQUFNLEVBQUUsT0FBTyxNQUFNLGFBQWEsRUFBRSxPQUFPLE1BQU0saUJBQWlCLEVBQUUsT0FBTyxNQUFNLGNBQWMsS0FBSyxPQUFPLENBQUM7QUFFaEosTUFBSSxTQUF3QjtBQUM1QixNQUFJLGNBQTZCO0FBQ2pDLE1BQUksYUFBNEI7QUFDaEMsTUFBSSxPQUFpQixDQUFDO0FBRXRCLE1BQUksWUFBWTtBQUNaLGFBQVMsY0FBYyxVQUFVO0FBQ2pDLGtCQUFjLFdBQVcsaUJBQWlCO0FBQzFDLGlCQUFhLFdBQVcsZ0JBQWdCO0FBQ3hDLFdBQU8sZ0JBQWdCLFVBQVU7QUFBQSxFQUNyQztBQUVBLFFBQU0sY0FBYyxtQkFBbUIsTUFBTTtBQUU3QyxTQUFPLEVBQUUsUUFBUSxhQUFhLFlBQVksTUFBTSxZQUFZO0FBQ2hFO0FBRU8sU0FBUyw4QkFBOEIsTUFBNkI7QUFJekUsUUFBTSxjQUFjO0FBQ3BCLE1BQUk7QUFDSixVQUFRLFFBQVEsWUFBWSxLQUFLLElBQUksT0FBTyxNQUFNO0FBQzlDLFFBQUk7QUFDQSxZQUFNLE9BQU8sS0FBSyxNQUFNLE1BQU0sQ0FBQyxDQUFDO0FBQ2hDLFlBQU0sUUFBUSxNQUFNLFFBQVEsSUFBSSxJQUFJLE9BQU8sQ0FBQyxJQUFJO0FBQ2hELFlBQU0sU0FBUyxvQkFBb0IsS0FBSztBQUN4QyxVQUFJLE9BQU8sT0FBUSxRQUFPLE9BQU87QUFBQSxJQUNyQyxTQUFTLEdBQUc7QUFBQSxJQUVaO0FBQUEsRUFDSjtBQU1BLFFBQU0sZ0JBQWdCO0FBQ3RCLFFBQU0sWUFBWSxjQUFjLEtBQUssSUFBSTtBQUN6QyxNQUFJLGFBQWEsVUFBVSxDQUFDLEVBQUcsUUFBTyxtQkFBbUIsVUFBVSxDQUFDLENBQUM7QUFHckUsUUFBTSxrQkFBa0I7QUFDeEIsUUFBTSxZQUFZLGdCQUFnQixLQUFLLElBQUk7QUFDM0MsTUFBSSxhQUFhLFVBQVUsQ0FBQyxHQUFHO0FBRTNCLFdBQU8sbUJBQW1CLFVBQVUsQ0FBQyxDQUFDO0FBQUEsRUFDMUM7QUFFQSxTQUFPO0FBQ1Q7QUFFTyxTQUFTLDRCQUE0QixNQUE2QjtBQUV2RSxRQUFNLGlCQUFpQjtBQUN2QixRQUFNLFlBQVksZUFBZSxLQUFLLElBQUk7QUFDMUMsTUFBSSxhQUFhLFVBQVUsQ0FBQyxHQUFHO0FBQzNCLFdBQU8sbUJBQW1CLFVBQVUsQ0FBQyxDQUFDO0FBQUEsRUFDMUM7QUFJQSxRQUFNLGdCQUFnQjtBQUN0QixRQUFNLFdBQVcsY0FBYyxLQUFLLElBQUk7QUFDeEMsTUFBSSxZQUFZLFNBQVMsQ0FBQyxHQUFHO0FBQ3pCLFdBQU8sbUJBQW1CLFNBQVMsQ0FBQyxDQUFDO0FBQUEsRUFDekM7QUFFQSxTQUFPO0FBQ1Q7QUFFQSxTQUFTLG1CQUFtQixNQUFzQjtBQUNoRCxNQUFJLENBQUMsS0FBTSxRQUFPO0FBRWxCLFFBQU0sV0FBbUM7QUFBQSxJQUN2QyxTQUFTO0FBQUEsSUFDVCxRQUFRO0FBQUEsSUFDUixRQUFRO0FBQUEsSUFDUixVQUFVO0FBQUEsSUFDVixTQUFTO0FBQUEsSUFDVCxVQUFVO0FBQUEsSUFDVixVQUFVO0FBQUEsRUFDWjtBQUVBLFNBQU8sS0FBSyxRQUFRLGtEQUFrRCxDQUFDLFVBQVU7QUFDN0UsVUFBTSxRQUFRLE1BQU0sWUFBWTtBQUNoQyxRQUFJLFNBQVMsS0FBSyxFQUFHLFFBQU8sU0FBUyxLQUFLO0FBQzFDLFFBQUksU0FBUyxLQUFLLEVBQUcsUUFBTyxTQUFTLEtBQUs7QUFFMUMsUUFBSSxNQUFNLFdBQVcsS0FBSyxHQUFHO0FBQ3pCLFVBQUk7QUFBRSxlQUFPLE9BQU8sYUFBYSxTQUFTLE1BQU0sTUFBTSxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUM7QUFBQSxNQUFHLFFBQVE7QUFBRSxlQUFPO0FBQUEsTUFBTztBQUFBLElBQ2hHO0FBQ0EsUUFBSSxNQUFNLFdBQVcsSUFBSSxHQUFHO0FBQ3hCLFVBQUk7QUFBRSxlQUFPLE9BQU8sYUFBYSxTQUFTLE1BQU0sTUFBTSxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUM7QUFBQSxNQUFHLFFBQVE7QUFBRSxlQUFPO0FBQUEsTUFBTztBQUFBLElBQ2hHO0FBQ0EsV0FBTztBQUFBLEVBQ1gsQ0FBQztBQUNIOzs7QUMzTEE7QUFBQSxFQUNFLElBQU07QUFBQSxJQUNKO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsRUFDRjtBQUFBLEVBQ0EsZUFBaUI7QUFBQSxJQUNmO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsRUFDRjtBQUFBLEVBQ0EsUUFBVTtBQUFBLElBQ1I7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLEVBQ0Y7QUFBQSxFQUNBLGFBQWU7QUFBQSxJQUNiO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxFQUNGO0FBQUEsRUFDQSxXQUFhO0FBQUEsSUFDWDtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxFQUNGO0FBQUEsRUFDQSxTQUFXO0FBQUEsSUFDVDtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxFQUNGO0FBQUEsRUFDQSxRQUFVO0FBQUEsSUFDUjtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLEVBQ0Y7QUFBQSxFQUNBLE9BQVM7QUFBQSxJQUNQO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsRUFDRjtBQUFBLEVBQ0EsTUFBUTtBQUFBLElBQ047QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxFQUNGO0FBQUEsRUFDQSxjQUFnQjtBQUFBLElBQ2Q7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLEVBQ0Y7QUFBQSxFQUNBLFFBQVU7QUFBQSxJQUNSO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLEVBQ0Y7QUFBQSxFQUNBLFVBQVk7QUFBQSxJQUNWO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxFQUNGO0FBQUEsRUFDQSxRQUFVO0FBQUEsSUFDUjtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLEVBQ0Y7QUFBQSxFQUNBLE9BQVM7QUFBQSxJQUNQO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxFQUNGO0FBQ0Y7OztBQ3hNQSxJQUFNLFdBQW1DLENBQUM7QUFDMUMsV0FBVyxDQUFDLFVBQVUsT0FBTyxLQUFLLE9BQU8sUUFBUSxzQkFBWSxHQUFHO0FBQzVELGFBQVcsVUFBVSxTQUFTO0FBQzFCLGFBQVMsTUFBTSxJQUFJO0FBQUEsRUFDdkI7QUFDSjtBQUVPLElBQU0sa0JBQWtCO0FBRXhCLFNBQVMsVUFBVSxVQUFrQixnQkFBd0Q7QUFDbEcsTUFBSSxDQUFDLFNBQVUsUUFBTztBQUd0QixNQUFJLGdCQUFnQjtBQUNoQixVQUFNQyxTQUFRLFNBQVMsTUFBTSxHQUFHO0FBRWhDLGFBQVMsSUFBSSxHQUFHLElBQUlBLE9BQU0sU0FBUyxHQUFHLEtBQUs7QUFDdkMsWUFBTSxTQUFTQSxPQUFNLE1BQU0sQ0FBQyxFQUFFLEtBQUssR0FBRztBQUN0QyxVQUFJLGVBQWUsTUFBTSxHQUFHO0FBQ3hCLGVBQU8sZUFBZSxNQUFNO0FBQUEsTUFDaEM7QUFBQSxJQUNKO0FBQUEsRUFDSjtBQUdBLE1BQUksZ0JBQWdCLFFBQVEsR0FBRztBQUM3QixXQUFPLGdCQUFnQixRQUFRO0FBQUEsRUFDakM7QUFJQSxRQUFNLFFBQVEsU0FBUyxNQUFNLEdBQUc7QUFJaEMsV0FBUyxJQUFJLEdBQUcsSUFBSSxNQUFNLFNBQVMsR0FBRyxLQUFLO0FBQ3ZDLFVBQU0sU0FBUyxNQUFNLE1BQU0sQ0FBQyxFQUFFLEtBQUssR0FBRztBQUN0QyxRQUFJLGdCQUFnQixNQUFNLEdBQUc7QUFDekIsYUFBTyxnQkFBZ0IsTUFBTTtBQUFBLElBQ2pDO0FBQUEsRUFDSjtBQUVBLFNBQU87QUFDVDs7O0FDOUNPLElBQU0saUJBQWlCLE9BQVUsUUFBbUM7QUFDekUsU0FBTyxJQUFJLFFBQVEsQ0FBQyxZQUFZO0FBQzlCLFdBQU8sUUFBUSxNQUFNLElBQUksS0FBSyxDQUFDLFVBQVU7QUFDdkMsY0FBUyxNQUFNLEdBQUcsS0FBVyxJQUFJO0FBQUEsSUFDbkMsQ0FBQztBQUFBLEVBQ0gsQ0FBQztBQUNIO0FBRU8sSUFBTSxpQkFBaUIsT0FBVSxLQUFhLFVBQTRCO0FBQy9FLFNBQU8sSUFBSSxRQUFRLENBQUMsWUFBWTtBQUM5QixXQUFPLFFBQVEsTUFBTSxJQUFJLEVBQUUsQ0FBQyxHQUFHLEdBQUcsTUFBTSxHQUFHLE1BQU0sUUFBUSxDQUFDO0FBQUEsRUFDNUQsQ0FBQztBQUNIOzs7QUNQQSxJQUFNLGtCQUFrQjtBQUVqQixJQUFNLHFCQUFrQztBQUFBLEVBQzdDLFNBQVMsQ0FBQyxVQUFVLFNBQVM7QUFBQSxFQUM3QixPQUFPO0FBQUEsRUFDUCxVQUFVO0FBQUEsRUFDVixPQUFPO0FBQUEsRUFDUCxjQUFjLENBQUM7QUFDakI7QUFFQSxJQUFNLG1CQUFtQixDQUFDLFlBQXdDO0FBQ2hFLE1BQUksTUFBTSxRQUFRLE9BQU8sR0FBRztBQUMxQixXQUFPLFFBQVEsT0FBTyxDQUFDLFVBQW9DLE9BQU8sVUFBVSxRQUFRO0FBQUEsRUFDdEY7QUFDQSxNQUFJLE9BQU8sWUFBWSxVQUFVO0FBQy9CLFdBQU8sQ0FBQyxPQUFPO0FBQUEsRUFDakI7QUFDQSxTQUFPLENBQUMsR0FBRyxtQkFBbUIsT0FBTztBQUN2QztBQUVBLElBQU0sc0JBQXNCLENBQUMsZUFBMEM7QUFDbkUsUUFBTSxNQUFNLFFBQWEsVUFBVSxFQUFFLE9BQU8sT0FBSyxPQUFPLE1BQU0sWUFBWSxNQUFNLElBQUk7QUFDcEYsU0FBTyxJQUFJLElBQUksUUFBTTtBQUFBLElBQ2pCLEdBQUc7QUFBQSxJQUNILGVBQWUsUUFBUSxFQUFFLGFBQWE7QUFBQSxJQUN0QyxjQUFjLFFBQVEsRUFBRSxZQUFZO0FBQUEsSUFDcEMsbUJBQW1CLEVBQUUsb0JBQW9CLFFBQVEsRUFBRSxpQkFBaUIsSUFBSTtBQUFBLElBQ3hFLFNBQVMsRUFBRSxVQUFVLFFBQVEsRUFBRSxPQUFPLElBQUk7QUFBQSxJQUMxQyxjQUFjLEVBQUUsZUFBZSxRQUFRLEVBQUUsWUFBWSxFQUFFLElBQUksQ0FBQyxNQUFXLFFBQVEsQ0FBQyxDQUFDLElBQUk7QUFBQSxJQUNyRixPQUFPLEVBQUUsUUFBUSxRQUFRLEVBQUUsS0FBSyxJQUFJO0FBQUEsRUFDeEMsRUFBRTtBQUNOO0FBRUEsSUFBTSx1QkFBdUIsQ0FBQyxVQUFxRDtBQUNqRixRQUFNLFNBQVMsRUFBRSxHQUFHLG9CQUFvQixHQUFJLFNBQVMsQ0FBQyxFQUFHO0FBQ3pELFNBQU87QUFBQSxJQUNMLEdBQUc7QUFBQSxJQUNILFNBQVMsaUJBQWlCLE9BQU8sT0FBTztBQUFBLElBQ3hDLGtCQUFrQixvQkFBb0IsT0FBTyxnQkFBZ0I7QUFBQSxFQUMvRDtBQUNGO0FBRU8sSUFBTSxrQkFBa0IsWUFBa0M7QUFDL0QsUUFBTSxTQUFTLE1BQU0sZUFBNEIsZUFBZTtBQUNoRSxRQUFNLFNBQVMscUJBQXFCLFVBQVUsTUFBUztBQUN2RCx1QkFBcUIsTUFBTTtBQUMzQixTQUFPO0FBQ1Q7QUFFTyxJQUFNLGtCQUFrQixPQUFPLFVBQXNEO0FBQzFGLFdBQVMsd0JBQXdCLEVBQUUsTUFBTSxPQUFPLEtBQUssS0FBSyxFQUFFLENBQUM7QUFDN0QsUUFBTSxVQUFVLE1BQU0sZ0JBQWdCO0FBQ3RDLFFBQU0sU0FBUyxxQkFBcUIsRUFBRSxHQUFHLFNBQVMsR0FBRyxNQUFNLENBQUM7QUFDNUQsUUFBTSxlQUFlLGlCQUFpQixNQUFNO0FBQzVDLHVCQUFxQixNQUFNO0FBQzNCLFNBQU87QUFDVDs7O0FDMUNBLElBQUksZ0JBQWdCO0FBQ3BCLElBQU0seUJBQXlCO0FBQy9CLElBQU0sY0FBOEIsQ0FBQztBQUVyQyxJQUFNLG1CQUFtQixPQUFPLEtBQWEsVUFBVSxRQUE0QjtBQUMvRSxRQUFNLGFBQWEsSUFBSSxnQkFBZ0I7QUFDdkMsUUFBTSxLQUFLLFdBQVcsTUFBTSxXQUFXLE1BQU0sR0FBRyxPQUFPO0FBQ3ZELE1BQUk7QUFDQSxVQUFNLFdBQVcsTUFBTSxNQUFNLEtBQUssRUFBRSxRQUFRLFdBQVcsT0FBTyxDQUFDO0FBQy9ELFdBQU87QUFBQSxFQUNYLFVBQUU7QUFDRSxpQkFBYSxFQUFFO0FBQUEsRUFDbkI7QUFDSjtBQUVBLElBQU0sZUFBZSxPQUFVLE9BQXFDO0FBQ2hFLE1BQUksaUJBQWlCLHdCQUF3QjtBQUN6QyxVQUFNLElBQUksUUFBYyxhQUFXLFlBQVksS0FBSyxPQUFPLENBQUM7QUFBQSxFQUNoRTtBQUNBO0FBQ0EsTUFBSTtBQUNBLFdBQU8sTUFBTSxHQUFHO0FBQUEsRUFDcEIsVUFBRTtBQUNFO0FBQ0EsUUFBSSxZQUFZLFNBQVMsR0FBRztBQUN4QixZQUFNLE9BQU8sWUFBWSxNQUFNO0FBQy9CLFVBQUksS0FBTSxNQUFLO0FBQUEsSUFDbkI7QUFBQSxFQUNKO0FBQ0o7QUFFTyxJQUFNLHFCQUFxQixPQUFPLFFBQW9FO0FBQzNHLE1BQUk7QUFDRixRQUFJLENBQUMsT0FBTyxDQUFDLElBQUksS0FBSztBQUNsQixhQUFPLEVBQUUsTUFBTSxNQUFNLE9BQU8sMkJBQTJCLFFBQVEsY0FBYztBQUFBLElBQ2pGO0FBRUEsUUFDRSxJQUFJLElBQUksV0FBVyxXQUFXLEtBQzlCLElBQUksSUFBSSxXQUFXLFNBQVMsS0FDNUIsSUFBSSxJQUFJLFdBQVcsUUFBUSxLQUMzQixJQUFJLElBQUksV0FBVyxxQkFBcUIsS0FDeEMsSUFBSSxJQUFJLFdBQVcsaUJBQWlCLEdBQ3BDO0FBQ0UsYUFBTyxFQUFFLE1BQU0sTUFBTSxPQUFPLHlCQUF5QixRQUFRLGFBQWE7QUFBQSxJQUM5RTtBQUVBLFVBQU0sUUFBUSxNQUFNLGdCQUFnQjtBQUNwQyxRQUFJLFdBQVcscUJBQXFCLEtBQXdCLE1BQU0sWUFBWTtBQUc5RSxVQUFNLFlBQVksSUFBSTtBQUN0QixVQUFNLFNBQVMsSUFBSSxJQUFJLFNBQVM7QUFDaEMsVUFBTSxXQUFXLE9BQU8sU0FBUyxRQUFRLFVBQVUsRUFBRTtBQUNyRCxTQUFLLFNBQVMsU0FBUyxhQUFhLEtBQUssU0FBUyxTQUFTLFVBQVUsT0FBTyxDQUFDLFNBQVMsbUJBQW1CLFNBQVMsVUFBVSxVQUFVO0FBQ2pJLFVBQUk7QUFFQSxjQUFNLGFBQWEsWUFBWTtBQUMzQixnQkFBTSxXQUFXLE1BQU0saUJBQWlCLFNBQVM7QUFDakQsY0FBSSxTQUFTLElBQUk7QUFDYixrQkFBTSxPQUFPLE1BQU0sU0FBUyxLQUFLO0FBQ2pDLGtCQUFNLFVBQVUsOEJBQThCLElBQUk7QUFDbEQsZ0JBQUksU0FBUztBQUNULHVCQUFTLGtCQUFrQjtBQUFBLFlBQy9CO0FBQ0Esa0JBQU0sUUFBUSw0QkFBNEIsSUFBSTtBQUM5QyxnQkFBSSxPQUFPO0FBQ1AsdUJBQVMsUUFBUTtBQUFBLFlBQ3JCO0FBQUEsVUFDSjtBQUFBLFFBQ0osQ0FBQztBQUFBLE1BQ0wsU0FBUyxVQUFVO0FBQ2YsaUJBQVMsd0NBQXdDLEVBQUUsT0FBTyxPQUFPLFFBQVEsRUFBRSxDQUFDO0FBQUEsTUFDaEY7QUFBQSxJQUNMO0FBRUEsV0FBTztBQUFBLE1BQ0wsTUFBTTtBQUFBLE1BQ04sUUFBUTtBQUFBLElBQ1Y7QUFBQSxFQUVGLFNBQVMsR0FBUTtBQUNmLGFBQVMsNkJBQTZCLElBQUksRUFBRSxJQUFJLEVBQUUsT0FBTyxPQUFPLENBQUMsRUFBRSxDQUFDO0FBQ3BFLFdBQU87QUFBQSxNQUNMLE1BQU07QUFBQSxNQUNOLE9BQU8sT0FBTyxDQUFDO0FBQUEsTUFDZixRQUFRO0FBQUEsSUFDVjtBQUFBLEVBQ0Y7QUFDRjtBQUVBLElBQU0sdUJBQXVCLENBQUMsS0FBc0IsaUJBQXVEO0FBQ3pHLFFBQU0sTUFBTSxJQUFJLE9BQU87QUFDdkIsTUFBSSxXQUFXO0FBQ2YsTUFBSTtBQUNGLGVBQVcsSUFBSSxJQUFJLEdBQUcsRUFBRSxTQUFTLFFBQVEsVUFBVSxFQUFFO0FBQUEsRUFDdkQsU0FBUyxHQUFHO0FBQ1YsZUFBVztBQUFBLEVBQ2I7QUFHQSxNQUFJLGFBQXdDO0FBQzVDLE1BQUksa0JBQWlDO0FBRXJDLE1BQUksSUFBSSxTQUFTLFFBQVEsS0FBSyxJQUFJLFNBQVMsU0FBUyxHQUFHO0FBQ25ELGlCQUFhO0FBQUEsRUFDakIsV0FBVyxTQUFTLFNBQVMsYUFBYSxLQUFLLFNBQVMsU0FBUyxVQUFVLEdBQUc7QUFDMUUsVUFBTSxFQUFFLFFBQVEsSUFBSSxnQkFBZ0IsR0FBRztBQUN2QyxRQUFJLFFBQVMsY0FBYTtBQUcxQixRQUFJLElBQUksU0FBUyxJQUFJLEdBQUc7QUFDcEIsWUFBTSxRQUFRLElBQUksTUFBTSxJQUFJO0FBQzVCLFVBQUksTUFBTSxTQUFTLEdBQUc7QUFDbEIsY0FBTSxTQUFTLE1BQU0sQ0FBQyxFQUFFLE1BQU0sR0FBRyxFQUFFLENBQUM7QUFDcEMsMEJBQWtCLE1BQU07QUFBQSxNQUM1QjtBQUFBLElBQ0osV0FBVyxJQUFJLFNBQVMsS0FBSyxHQUFHO0FBQzVCLFlBQU0sUUFBUSxJQUFJLE1BQU0sS0FBSztBQUM3QixVQUFJLE1BQU0sU0FBUyxHQUFHO0FBQ2xCLDBCQUFrQixtQkFBbUIsTUFBTSxDQUFDLEVBQUUsTUFBTSxHQUFHLEVBQUUsQ0FBQyxDQUFDO0FBQUEsTUFDL0Q7QUFBQSxJQUNKLFdBQVcsSUFBSSxTQUFTLFFBQVEsR0FBRztBQUMvQixZQUFNLFFBQVEsSUFBSSxNQUFNLFFBQVE7QUFDaEMsVUFBSSxNQUFNLFNBQVMsR0FBRztBQUNsQiwwQkFBa0IsbUJBQW1CLE1BQU0sQ0FBQyxFQUFFLE1BQU0sR0FBRyxFQUFFLENBQUMsQ0FBQztBQUFBLE1BQy9EO0FBQUEsSUFDSjtBQUFBLEVBQ0osV0FBVyxhQUFhLGdCQUFnQixJQUFJLFNBQVMsUUFBUSxHQUFHO0FBQzVELGlCQUFhO0FBQUEsRUFDakIsV0FBVyxhQUFhLGdCQUFnQixDQUFDLElBQUksU0FBUyxRQUFRLEtBQUssSUFBSSxNQUFNLEdBQUcsRUFBRSxVQUFVLEdBQUc7QUFFM0YsaUJBQWE7QUFBQSxFQUNqQjtBQUlBLE1BQUk7QUFFSixNQUFJLGVBQWUsUUFBUyxTQUFRO0FBQUEsV0FDM0IsZUFBZSxVQUFVLGVBQWUsU0FBVSxTQUFRO0FBR25FLE1BQUksQ0FBQyxPQUFPO0FBQ1QsWUFBUSxVQUFVLFVBQVUsWUFBWSxLQUFLO0FBQUEsRUFDaEQ7QUFFQSxTQUFPO0FBQUEsSUFDTCxjQUFjLE9BQU87QUFBQSxJQUNyQixlQUFlLGFBQWEsR0FBRztBQUFBLElBQy9CLFVBQVUsWUFBWTtBQUFBLElBQ3RCLFVBQVUsWUFBWTtBQUFBLElBQ3RCO0FBQUEsSUFDQSxVQUFVLE9BQU87QUFBQSxJQUNqQixPQUFPLElBQUksU0FBUztBQUFBLElBQ3BCO0FBQUEsSUFDQSxhQUFhO0FBQUEsSUFDYjtBQUFBLElBQ0EsYUFBYTtBQUFBLElBQ2IsWUFBWTtBQUFBLElBQ1osVUFBVTtBQUFBLElBQ1YsTUFBTSxDQUFDO0FBQUEsSUFDUCxhQUFhLENBQUM7QUFBQSxJQUNkLFdBQVc7QUFBQSxJQUNYLFNBQVM7QUFBQSxJQUNULGFBQWE7QUFBQSxJQUNiLFVBQVU7QUFBQSxJQUNWLHlCQUF5QjtBQUFBLElBQ3pCLHVCQUF1QjtBQUFBLElBQ3ZCLFNBQVM7QUFBQSxNQUNQLGNBQWM7QUFBQSxNQUNkLGVBQWU7QUFBQSxNQUNmLFVBQVU7QUFBQSxNQUNWLFVBQVU7QUFBQSxNQUNWLFlBQVk7QUFBQSxNQUNaLE9BQU8sSUFBSSxRQUFRLFFBQVE7QUFBQSxNQUMzQixPQUFPO0FBQUEsSUFDVDtBQUFBLElBQ0EsWUFBWSxDQUFDO0FBQUEsRUFDZjtBQUNGOzs7QUN0TEEsSUFBTSxlQUFlLG9CQUFJLElBQXdCO0FBQ2pELElBQU0sb0JBQW9CLEtBQUssS0FBSyxLQUFLO0FBQ3pDLElBQU0sa0JBQWtCLElBQUksS0FBSztBQUUxQixJQUFNLG9CQUFvQixPQUMvQixNQUNBLGVBQ3dDO0FBQ3hDLFFBQU0sYUFBYSxvQkFBSSxJQUEyQjtBQUNsRCxNQUFJLFlBQVk7QUFDaEIsUUFBTSxRQUFRLEtBQUs7QUFFbkIsUUFBTSxXQUFXLEtBQUssSUFBSSxPQUFPLFFBQVE7QUFDdkMsUUFBSTtBQUNGLFlBQU0sV0FBVyxHQUFHLElBQUksRUFBRSxLQUFLLElBQUksR0FBRztBQUN0QyxZQUFNLFNBQVMsYUFBYSxJQUFJLFFBQVE7QUFFeEMsVUFBSSxRQUFRO0FBQ1YsY0FBTSxVQUFVLE9BQU8sT0FBTyxXQUFXLFdBQVcsQ0FBQyxDQUFDLE9BQU8sT0FBTztBQUNwRSxjQUFNLE1BQU0sVUFBVSxrQkFBa0I7QUFFeEMsWUFBSSxLQUFLLElBQUksSUFBSSxPQUFPLFlBQVksS0FBSztBQUN2QyxxQkFBVyxJQUFJLElBQUksSUFBSSxPQUFPLE1BQU07QUFDcEM7QUFBQSxRQUNGLE9BQU87QUFDTCx1QkFBYSxPQUFPLFFBQVE7QUFBQSxRQUM5QjtBQUFBLE1BQ0Y7QUFFQSxZQUFNLFNBQVMsTUFBTSxtQkFBbUIsR0FBRztBQUczQyxtQkFBYSxJQUFJLFVBQVU7QUFBQSxRQUN6QjtBQUFBLFFBQ0EsV0FBVyxLQUFLLElBQUk7QUFBQSxNQUN0QixDQUFDO0FBRUQsaUJBQVcsSUFBSSxJQUFJLElBQUksTUFBTTtBQUFBLElBQy9CLFNBQVMsT0FBTztBQUNkLGVBQVMscUNBQXFDLElBQUksRUFBRSxJQUFJLEVBQUUsT0FBTyxPQUFPLEtBQUssRUFBRSxDQUFDO0FBRWhGLGlCQUFXLElBQUksSUFBSSxJQUFJLEVBQUUsU0FBUyxpQkFBaUIsUUFBUSxhQUFhLE9BQU8sT0FBTyxLQUFLLEdBQUcsUUFBUSxRQUFRLENBQUM7QUFBQSxJQUNqSCxVQUFFO0FBQ0E7QUFDQSxVQUFJLFdBQVksWUFBVyxXQUFXLEtBQUs7QUFBQSxJQUM3QztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sUUFBUSxJQUFJLFFBQVE7QUFDMUIsU0FBTztBQUNUO0FBRUEsSUFBTSxxQkFBcUIsT0FBTyxRQUE2QztBQUU3RSxNQUFJLE9BQTJCO0FBQy9CLE1BQUk7QUFDSixNQUFJO0FBRUosTUFBSTtBQUNBLFVBQU0sYUFBYSxNQUFNLG1CQUFtQixHQUFHO0FBQy9DLFdBQU8sV0FBVztBQUNsQixZQUFRLFdBQVc7QUFDbkIsYUFBUyxXQUFXO0FBQUEsRUFDeEIsU0FBUyxHQUFHO0FBQ1IsYUFBUyw2QkFBNkIsSUFBSSxFQUFFLElBQUksRUFBRSxPQUFPLE9BQU8sQ0FBQyxFQUFFLENBQUM7QUFDcEUsWUFBUSxPQUFPLENBQUM7QUFDaEIsYUFBUztBQUFBLEVBQ2I7QUFFQSxNQUFJLFVBQVU7QUFDZCxNQUFJLFNBQWtDO0FBR3RDLE1BQUksTUFBTTtBQUNOLFFBQUksS0FBSyxhQUFhLGFBQWEsS0FBSyxhQUFhLGFBQWEsS0FBSyxhQUFhLGFBQWEsS0FBSyxhQUFhLFVBQVU7QUFDekgsZ0JBQVU7QUFDVixlQUFTO0FBQUEsSUFDYixXQUFXLEtBQUssYUFBYSxZQUFZLEtBQUssYUFBYSxvQkFBb0IsS0FBSyxhQUFhLFVBQVUsS0FBSyxhQUFhLFVBQVU7QUFDbkksZ0JBQVU7QUFDVixlQUFTO0FBQUEsSUFDYixXQUFXLEtBQUssYUFBYSxhQUFhLEtBQUssY0FBYyxTQUFTLE1BQU0sS0FBSyxLQUFLLGNBQWMsU0FBUyxRQUFRLEtBQUssS0FBSyxjQUFjLFNBQVMsUUFBUSxJQUFJO0FBQzlKLGdCQUFVO0FBQ1YsZUFBUztBQUFBLElBQ2IsT0FBTztBQUlMLFVBQUksS0FBSyxjQUFjLEtBQUssZUFBZSxXQUFXO0FBRWpELFlBQUksS0FBSyxlQUFlLFFBQVMsV0FBVTtBQUFBLGlCQUNsQyxLQUFLLGVBQWUsVUFBVyxXQUFVO0FBQUEsWUFDN0MsV0FBVSxLQUFLLFdBQVcsT0FBTyxDQUFDLEVBQUUsWUFBWSxJQUFJLEtBQUssV0FBVyxNQUFNLENBQUM7QUFBQSxNQUNyRixPQUFPO0FBQ0Ysa0JBQVU7QUFBQSxNQUNmO0FBQ0EsZUFBUztBQUFBLElBQ1g7QUFBQSxFQUNKO0FBR0EsTUFBSSxZQUFZLGlCQUFpQjtBQUM3QixVQUFNLElBQUksTUFBTSxlQUFlLEdBQUc7QUFDbEMsUUFBSSxFQUFFLFlBQVksaUJBQWlCO0FBQy9CLGdCQUFVLEVBQUU7QUFBQSxJQUdoQjtBQUFBLEVBQ0o7QUFNQSxNQUFJLFlBQVksbUJBQW1CLFdBQVcsY0FBYztBQUMxRCxZQUFRO0FBQ1IsYUFBUztBQUFBLEVBQ1g7QUFFQSxTQUFPLEVBQUUsU0FBUyxRQUFRLE1BQU0sUUFBUSxRQUFXLE9BQU8sT0FBTztBQUNuRTtBQUVBLElBQU0saUJBQWlCLE9BQU8sUUFBNkM7QUFDekUsUUFBTSxNQUFNLElBQUksSUFBSSxZQUFZO0FBQ2hDLE1BQUksVUFBVTtBQUVkLE1BQUksSUFBSSxTQUFTLFFBQVEsS0FBSyxJQUFJLFNBQVMsZUFBZSxLQUFLLElBQUksU0FBUyxXQUFXLEtBQUssSUFBSSxTQUFTLE1BQU0sS0FBSyxJQUFJLFNBQVMsUUFBUSxFQUFHLFdBQVU7QUFBQSxXQUM3SSxJQUFJLFNBQVMsUUFBUSxNQUFNLElBQUksU0FBUyxNQUFNLEtBQUssSUFBSSxTQUFTLFFBQVEsS0FBSyxJQUFJLFNBQVMsUUFBUSxHQUFJLFdBQVU7QUFBQSxXQUNoSCxJQUFJLFNBQVMsVUFBVSxLQUFLLElBQUksU0FBUyxPQUFPLEtBQUssSUFBSSxTQUFTLE1BQU0sS0FBSyxJQUFJLFNBQVMsT0FBTyxFQUFHLFdBQVU7QUFBQSxXQUM5RyxJQUFJLFNBQVMsU0FBUyxLQUFLLElBQUksU0FBUyxTQUFTLEtBQUssSUFBSSxTQUFTLE1BQU0sS0FBSyxJQUFJLFNBQVMsUUFBUSxLQUFLLElBQUksU0FBUyxTQUFTLEVBQUcsV0FBVTtBQUFBLFdBQzNJLElBQUksU0FBUyxTQUFTLEtBQUssSUFBSSxTQUFTLFVBQVUsS0FBSyxJQUFJLFNBQVMsV0FBVyxLQUFLLElBQUksU0FBUyxRQUFRLEtBQUssSUFBSSxTQUFTLFFBQVEsS0FBSyxJQUFJLFNBQVMsV0FBVyxFQUFHLFdBQVU7QUFBQSxXQUM3SyxJQUFJLFNBQVMsUUFBUSxLQUFLLElBQUksU0FBUyxNQUFNLEtBQUssSUFBSSxTQUFTLFNBQVMsS0FBSyxJQUFJLFNBQVMsUUFBUSxLQUFLLElBQUksU0FBUyxTQUFTLEVBQUcsV0FBVTtBQUFBLFdBQzFJLElBQUksU0FBUyxLQUFLLEtBQUssSUFBSSxTQUFTLEtBQUssS0FBSyxJQUFJLFNBQVMsU0FBUyxLQUFLLElBQUksU0FBUyxnQkFBZ0IsS0FBSyxJQUFJLFNBQVMsU0FBUyxFQUFHLFdBQVU7QUFBQSxXQUM5SSxJQUFJLFNBQVMsVUFBVSxLQUFLLElBQUksU0FBUyxPQUFPLEtBQUssSUFBSSxTQUFTLEtBQUssS0FBSyxJQUFJLFNBQVMsYUFBYSxLQUFLLElBQUksU0FBUyxRQUFRLEVBQUcsV0FBVTtBQUFBLFdBQzdJLElBQUksU0FBUyxTQUFTLEtBQUssSUFBSSxTQUFTLFNBQVMsS0FBSyxJQUFJLFNBQVMsUUFBUSxLQUFLLElBQUksU0FBUyxhQUFhLEtBQUssSUFBSSxTQUFTLE9BQU8sRUFBRyxXQUFVO0FBQUEsV0FDaEosSUFBSSxTQUFTLE9BQU8sS0FBSyxJQUFJLFNBQVMsWUFBWSxLQUFLLElBQUksU0FBUyxTQUFTLEtBQUssSUFBSSxTQUFTLFFBQVEsRUFBRyxXQUFVO0FBQUEsV0FDcEgsSUFBSSxTQUFTLE1BQU0sS0FBSyxJQUFJLFNBQVMsS0FBSyxLQUFLLElBQUksU0FBUyxLQUFLLEtBQUssSUFBSSxTQUFTLEtBQUssS0FBSyxJQUFJLFNBQVMsTUFBTSxFQUFHLFdBQVU7QUFBQSxXQUM3SCxJQUFJLFNBQVMsWUFBWSxLQUFLLElBQUksU0FBUyxPQUFPLEtBQUssSUFBSSxTQUFTLFVBQVUsS0FBSyxJQUFJLFNBQVMsYUFBYSxFQUFHLFdBQVU7QUFBQSxXQUMxSCxJQUFJLFNBQVMsU0FBUyxLQUFLLElBQUksU0FBUyxZQUFZLEtBQUssSUFBSSxTQUFTLFVBQVUsRUFBRyxXQUFVO0FBQUEsV0FDN0YsSUFBSSxTQUFTLFFBQVEsS0FBSyxJQUFJLFNBQVMsT0FBTyxLQUFLLElBQUksU0FBUyxRQUFRLEtBQUssSUFBSSxTQUFTLEtBQUssS0FBSyxJQUFJLFNBQVMsVUFBVSxFQUFHLFdBQVU7QUFBQSxXQUN4SSxJQUFJLFNBQVMsWUFBWSxLQUFLLElBQUksU0FBUyxVQUFVLEtBQUssSUFBSSxTQUFTLFNBQVMsRUFBRyxXQUFVO0FBQUEsV0FDN0YsSUFBSSxTQUFTLFlBQVksS0FBSyxJQUFJLFNBQVMsU0FBUyxLQUFLLElBQUksU0FBUyxVQUFVLEtBQUssSUFBSSxTQUFTLFlBQVksRUFBRyxXQUFVO0FBRXBJLFNBQU8sRUFBRSxTQUFTLFFBQVEsWUFBWTtBQUN4Qzs7O0FDeEpBLElBQU0sbUJBQW1CLE9BQU8sV0FBMkQ7QUFDekYsUUFBTSxZQUFZLFFBQVE7QUFDMUIsUUFBTSxTQUFTLFFBQVE7QUFDdkIsUUFBTSxlQUFlLGFBQWEsVUFBVSxTQUFTO0FBQ3JELFFBQU0sWUFBWSxVQUFVLE9BQU8sU0FBUztBQUU1QyxNQUFJLENBQUMsVUFBVyxDQUFDLGdCQUFnQixDQUFDLFdBQVk7QUFDNUMsV0FBTyxPQUFPLEtBQUssTUFBTSxDQUFDLENBQUM7QUFBQSxFQUM3QjtBQUVBLFFBQU0sV0FBMkIsQ0FBQztBQUVsQyxNQUFJLGNBQWM7QUFDaEIsY0FBVSxRQUFRLGNBQVk7QUFDNUIsZUFBUyxLQUFLLE9BQU8sS0FBSyxNQUFNLEVBQUUsU0FBUyxDQUFDLEVBQUUsTUFBTSxNQUFNLENBQUMsQ0FBQyxDQUFDO0FBQUEsSUFDL0QsQ0FBQztBQUFBLEVBQ0g7QUFFQSxNQUFJLFdBQVc7QUFDYixXQUFPLFFBQVEsV0FBUztBQUN0QixlQUFTLEtBQUssT0FBTyxLQUFLLElBQUksS0FBSyxFQUFFLE1BQU0sTUFBTSxJQUFJLENBQUM7QUFBQSxJQUN4RCxDQUFDO0FBQUEsRUFDSDtBQUVBLFFBQU0sVUFBVSxNQUFNLFFBQVEsSUFBSSxRQUFRO0FBRzFDLFFBQU0sVUFBNkIsQ0FBQztBQUNwQyxhQUFXLE9BQU8sU0FBUztBQUN2QixRQUFJLE1BQU0sUUFBUSxHQUFHLEdBQUc7QUFDcEIsY0FBUSxLQUFLLEdBQUcsR0FBRztBQUFBLElBQ3ZCLFdBQVcsS0FBSztBQUNaLGNBQVEsS0FBSyxHQUFHO0FBQUEsSUFDcEI7QUFBQSxFQUNKO0FBR0EsUUFBTSxhQUFhLG9CQUFJLElBQTZCO0FBQ3BELGFBQVcsT0FBTyxTQUFTO0FBQ3ZCLFFBQUksSUFBSSxPQUFPLFFBQVc7QUFDdEIsaUJBQVcsSUFBSSxJQUFJLElBQUksR0FBRztBQUFBLElBQzlCO0FBQUEsRUFDSjtBQUVBLFNBQU8sTUFBTSxLQUFLLFdBQVcsT0FBTyxDQUFDO0FBQ3ZDO0FBRU8sSUFBTSx3QkFBd0IsT0FDbkMsYUFDQSxlQUN3QjtBQUN4QixNQUFJO0FBQ0osVUFBTSxPQUFPLE1BQU0sT0FBTyxLQUFLLE1BQU0sQ0FBQyxDQUFDO0FBQ3ZDLFVBQU0sU0FBUyxNQUFNLE9BQU8sVUFBVSxNQUFNLENBQUMsQ0FBQztBQUM5QyxVQUFNLFdBQVcsSUFBSSxJQUFJLE9BQU8sSUFBSSxPQUFLLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBR25ELFVBQU0sU0FBUyxLQUFLLElBQUksWUFBWSxFQUFFLE9BQU8sQ0FBQyxNQUF3QixRQUFRLENBQUMsQ0FBQztBQUVoRixRQUFJLHdCQUF3QixZQUFZLE9BQU8sR0FBRztBQUM5QyxZQUFNLGFBQWEsTUFBTSxrQkFBa0IsUUFBUSxVQUFVO0FBQzdELGFBQU8sUUFBUSxTQUFPO0FBQ3BCLGNBQU0sTUFBTSxXQUFXLElBQUksSUFBSSxFQUFFO0FBQ2pDLFlBQUksVUFBVSxLQUFLO0FBQ25CLFlBQUksY0FBYyxLQUFLO0FBQUEsTUFDekIsQ0FBQztBQUFBLElBQ0w7QUFFQSxVQUFNLGVBQTJCLENBQUM7QUFDbEMsVUFBTSxnQkFBZ0Isb0JBQUksSUFBMkI7QUFDckQsVUFBTSx3QkFBd0Isb0JBQUksSUFBMkI7QUFFN0QsV0FBTyxRQUFRLFNBQU87QUFDbEIsWUFBTSxVQUFVLElBQUksV0FBVztBQUMvQixVQUFJLFlBQVksSUFBSTtBQUNoQixZQUFJLENBQUMsY0FBYyxJQUFJLE9BQU8sRUFBRyxlQUFjLElBQUksU0FBUyxDQUFDLENBQUM7QUFDOUQsc0JBQWMsSUFBSSxPQUFPLEVBQUcsS0FBSyxHQUFHO0FBQUEsTUFDeEMsT0FBTztBQUNGLFlBQUksQ0FBQyxzQkFBc0IsSUFBSSxJQUFJLFFBQVEsRUFBRyx1QkFBc0IsSUFBSSxJQUFJLFVBQVUsQ0FBQyxDQUFDO0FBQ3hGLDhCQUFzQixJQUFJLElBQUksUUFBUSxFQUFHLEtBQUssR0FBRztBQUFBLE1BQ3REO0FBQUEsSUFDSixDQUFDO0FBR0QsZUFBVyxDQUFDLFNBQVNDLFVBQVMsS0FBSyxlQUFlO0FBQzlDLFlBQU0sZUFBZSxTQUFTLElBQUksT0FBTztBQUN6QyxVQUFJLGNBQWM7QUFDZCxxQkFBYSxLQUFLO0FBQUEsVUFDZCxJQUFJLFNBQVMsT0FBTztBQUFBLFVBQ3BCLFVBQVUsYUFBYTtBQUFBLFVBQ3ZCLE9BQU8sYUFBYSxTQUFTO0FBQUEsVUFDN0IsT0FBTyxhQUFhO0FBQUEsVUFDcEIsTUFBTSxTQUFTQSxZQUFXLFlBQVksT0FBTztBQUFBLFVBQzdDLFFBQVE7QUFBQSxRQUNaLENBQUM7QUFBQSxNQUNMO0FBQUEsSUFDSjtBQUdBLGVBQVcsQ0FBQyxVQUFVQyxLQUFJLEtBQUssdUJBQXVCO0FBQ2xELG1CQUFhLEtBQUs7QUFBQSxRQUNkLElBQUksYUFBYSxRQUFRO0FBQUEsUUFDekI7QUFBQSxRQUNBLE9BQU87QUFBQSxRQUNQLE9BQU87QUFBQSxRQUNQLE1BQU0sU0FBU0EsT0FBTSxZQUFZLE9BQU87QUFBQSxRQUN4QyxRQUFRO0FBQUEsTUFDWixDQUFDO0FBQUEsSUFDTDtBQUVBLFlBQVEsOEJBQThCLEVBQUUsUUFBUSxhQUFhLFFBQVEsTUFBTSxPQUFPLE9BQU8sQ0FBQztBQUMxRixXQUFPO0FBQUEsRUFDUCxTQUFTLEdBQUc7QUFDVixhQUFTLGtDQUFrQyxFQUFFLE9BQU8sT0FBTyxDQUFDLEVBQUUsQ0FBQztBQUMvRCxVQUFNO0FBQUEsRUFDUjtBQUNGO0FBRU8sSUFBTSxxQkFBcUIsT0FDaEMsYUFDQSxRQUNBLGVBQ3dCO0FBQ3hCLFFBQU0sYUFBYSxNQUFNLGlCQUFpQixNQUFNO0FBQ2hELFFBQU0sY0FBYyxJQUFJLElBQUksUUFBUSxhQUFhLENBQUMsQ0FBQztBQUNuRCxRQUFNLFdBQVcsSUFBSSxJQUFJLFFBQVEsVUFBVSxDQUFDLENBQUM7QUFDN0MsUUFBTSxhQUFhLFlBQVksT0FBTyxLQUFLLFNBQVMsT0FBTztBQUMzRCxRQUFNLGVBQWUsV0FBVyxPQUFPLENBQUMsUUFBUTtBQUM5QyxRQUFJLENBQUMsV0FBWSxRQUFPO0FBQ3hCLFdBQVEsSUFBSSxZQUFZLFlBQVksSUFBSSxJQUFJLFFBQVEsS0FBTyxJQUFJLE1BQU0sU0FBUyxJQUFJLElBQUksRUFBRTtBQUFBLEVBQzFGLENBQUM7QUFDRCxRQUFNLFNBQVMsYUFDWixJQUFJLFlBQVksRUFDaEIsT0FBTyxDQUFDLFFBQTRCLFFBQVEsR0FBRyxDQUFDO0FBRW5ELE1BQUksd0JBQXdCLFlBQVksT0FBTyxHQUFHO0FBQ2hELFVBQU0sYUFBYSxNQUFNLGtCQUFrQixRQUFRLFVBQVU7QUFDN0QsV0FBTyxRQUFRLFNBQU87QUFDcEIsWUFBTSxNQUFNLFdBQVcsSUFBSSxJQUFJLEVBQUU7QUFDakMsVUFBSSxVQUFVLEtBQUs7QUFDbkIsVUFBSSxjQUFjLEtBQUs7QUFBQSxJQUN6QixDQUFDO0FBQUEsRUFDSDtBQUVBLFFBQU0sVUFBVSxVQUFVLFFBQVEsWUFBWSxPQUFPO0FBQ3JELFVBQVEsUUFBUSxDQUFDLFVBQVU7QUFDekIsVUFBTSxPQUFPLFNBQVMsTUFBTSxNQUFNLFlBQVksT0FBTztBQUFBLEVBQ3ZELENBQUM7QUFDRCxVQUFRLHlCQUF5QixFQUFFLFFBQVEsUUFBUSxRQUFRLE1BQU0sT0FBTyxPQUFPLENBQUM7QUFDaEYsU0FBTztBQUNUO0FBRUEsSUFBTSxlQUFlLENBQUMsUUFBUSxRQUFRLE9BQU8sVUFBVSxTQUFTLFFBQVEsVUFBVSxRQUFRLFFBQVE7QUFFM0YsSUFBTSxpQkFBaUIsT0FBTyxXQUF1QjtBQUMxRCxRQUFNLGtCQUFrQixvQkFBSSxJQUFZO0FBRXhDLGFBQVcsU0FBUyxRQUFRO0FBQzFCLFFBQUksZ0JBQTZELENBQUM7QUFFbEUsUUFBSSxNQUFNLGVBQWUsT0FBTztBQUM5QixVQUFJLE1BQU0sS0FBSyxTQUFTLEdBQUc7QUFDekIsWUFBSTtBQUNGLGdCQUFNLFFBQVEsTUFBTSxLQUFLLENBQUM7QUFDMUIsZ0JBQU0sTUFBTSxNQUFNLE9BQU8sUUFBUSxPQUFPLEVBQUUsT0FBTyxNQUFNLEdBQUcsQ0FBQztBQUMzRCxnQkFBTSxRQUFRLElBQUk7QUFDbEIsZ0JBQU0sU0FBUyxNQUFNLEtBQUssTUFBTSxDQUFDLEVBQUUsSUFBSSxPQUFLLEVBQUUsRUFBRTtBQUNoRCxjQUFJLE9BQU8sU0FBUyxHQUFHO0FBQ3JCLGtCQUFNLE9BQU8sS0FBSyxLQUFLLFFBQVEsRUFBRSxVQUFVLE9BQU8sT0FBTyxHQUFHLENBQUM7QUFBQSxVQUMvRDtBQUNBLHdCQUFjLEtBQUssRUFBRSxVQUFVLE9BQU8sTUFBTSxNQUFNLEtBQUssQ0FBQztBQUFBLFFBQzFELFNBQVMsR0FBRztBQUNWLG1CQUFTLHVDQUF1QyxFQUFFLE9BQU8sT0FBTyxDQUFDLEVBQUUsQ0FBQztBQUFBLFFBQ3RFO0FBQUEsTUFDRjtBQUFBLElBQ0YsV0FBVyxNQUFNLGVBQWUsWUFBWTtBQUMxQyxVQUFJLE1BQU0sS0FBSyxTQUFTLEdBQUc7QUFFekIsY0FBTSxTQUFTLG9CQUFJLElBQW9CO0FBQ3ZDLGNBQU0sS0FBSyxRQUFRLE9BQUssT0FBTyxJQUFJLEVBQUUsV0FBVyxPQUFPLElBQUksRUFBRSxRQUFRLEtBQUssS0FBSyxDQUFDLENBQUM7QUFDakYsWUFBSSxpQkFBaUIsTUFBTSxLQUFLLENBQUMsRUFBRTtBQUNuQyxZQUFJLE1BQU07QUFDVixtQkFBVyxDQUFDLEtBQUssS0FBSyxLQUFLLFFBQVE7QUFDakMsY0FBSSxRQUFRLEtBQUs7QUFBRSxrQkFBTTtBQUFPLDZCQUFpQjtBQUFBLFVBQUs7QUFBQSxRQUN4RDtBQUdBLGNBQU0sU0FBUyxNQUFNLEtBQUssT0FBTyxPQUFLLEVBQUUsYUFBYSxjQUFjLEVBQUUsSUFBSSxPQUFLLEVBQUUsRUFBRTtBQUNsRixZQUFJLE9BQU8sU0FBUyxHQUFHO0FBQ3JCLGNBQUk7QUFDRixrQkFBTSxPQUFPLEtBQUssS0FBSyxRQUFRLEVBQUUsVUFBVSxnQkFBZ0IsT0FBTyxHQUFHLENBQUM7QUFBQSxVQUN4RSxTQUFTLEdBQUc7QUFDVixxQkFBUyx3Q0FBd0MsRUFBRSxPQUFPLE9BQU8sQ0FBQyxFQUFFLENBQUM7QUFBQSxVQUN2RTtBQUFBLFFBQ0Y7QUFDQSxzQkFBYyxLQUFLLEVBQUUsVUFBVSxnQkFBZ0IsTUFBTSxNQUFNLEtBQUssQ0FBQztBQUFBLE1BQ25FO0FBQUEsSUFDRixPQUFPO0FBRUwsWUFBTSxNQUFNLE1BQU0sS0FBSyxPQUFtQyxDQUFDLEtBQUssUUFBUTtBQUN0RSxjQUFNLFdBQVcsSUFBSSxJQUFJLElBQUksUUFBUSxLQUFLLENBQUM7QUFDM0MsaUJBQVMsS0FBSyxHQUFHO0FBQ2pCLFlBQUksSUFBSSxJQUFJLFVBQVUsUUFBUTtBQUM5QixlQUFPO0FBQUEsTUFDVCxHQUFHLG9CQUFJLElBQUksQ0FBQztBQUNaLGlCQUFXLENBQUMsS0FBSyxDQUFDLEtBQUssS0FBSztBQUMxQixzQkFBYyxLQUFLLEVBQUUsVUFBVSxLQUFLLE1BQU0sRUFBRSxDQUFDO0FBQUEsTUFDL0M7QUFBQSxJQUNGO0FBRUEsZUFBVyxFQUFFLFVBQVUsYUFBYSxLQUFLLEtBQUssZUFBZTtBQUUzRCxVQUFJO0FBQ0osWUFBTSxTQUFTLG9CQUFJLElBQW9CO0FBQ3ZDLGlCQUFXLEtBQUssTUFBTTtBQUVwQixZQUFJLEVBQUUsV0FBVyxFQUFFLFlBQVksTUFBTSxFQUFFLGFBQWEsYUFBYTtBQUMvRCxpQkFBTyxJQUFJLEVBQUUsVUFBVSxPQUFPLElBQUksRUFBRSxPQUFPLEtBQUssS0FBSyxDQUFDO0FBQUEsUUFDeEQ7QUFBQSxNQUNGO0FBR0EsWUFBTSxtQkFBbUIsTUFBTSxLQUFLLE9BQU8sUUFBUSxDQUFDLEVBQ2pELEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsRUFDMUIsSUFBSSxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUU7QUFFbkIsaUJBQVcsTUFBTSxrQkFBa0I7QUFDakMsWUFBSSxDQUFDLGdCQUFnQixJQUFJLEVBQUUsR0FBRztBQUM1Qiw2QkFBbUI7QUFDbkI7QUFBQSxRQUNGO0FBQUEsTUFDRjtBQUdBLFVBQUkscUJBQXFCLFFBQVc7QUFDbEMsWUFBSTtBQUNELGdCQUFNLGVBQWUsTUFBTSxPQUFPLFVBQVUsTUFBTSxFQUFFLFVBQVUsWUFBWSxDQUFDO0FBRTNFLGdCQUFNLGdCQUFnQixhQUFhLEtBQUssT0FBSyxFQUFFLFVBQVUsTUFBTSxTQUFTLENBQUMsZ0JBQWdCLElBQUksRUFBRSxFQUFFLENBQUM7QUFDbEcsY0FBSSxlQUFlO0FBQ2pCLCtCQUFtQixjQUFjO0FBQUEsVUFDbkM7QUFBQSxRQUNILFNBQVMsR0FBRztBQUNULG1CQUFTLHlDQUF5QyxFQUFFLE9BQU8sT0FBTyxDQUFDLEVBQUUsQ0FBQztBQUFBLFFBQ3pFO0FBQUEsTUFDRjtBQUVBLFVBQUk7QUFFSixVQUFJLHFCQUFxQixRQUFXO0FBQ2xDLHdCQUFnQixJQUFJLGdCQUFnQjtBQUNwQyx1QkFBZTtBQUdmLFlBQUk7QUFDRixnQkFBTSxlQUFlLE1BQU0sT0FBTyxLQUFLLE1BQU0sRUFBRSxTQUFTLGFBQWEsQ0FBQztBQUN0RSxnQkFBTSxpQkFBaUIsSUFBSSxJQUFJLGFBQWEsSUFBSSxPQUFLLEVBQUUsRUFBRSxDQUFDO0FBQzFELGdCQUFNLGVBQWUsSUFBSSxJQUFJLEtBQUssSUFBSSxPQUFLLEVBQUUsRUFBRSxDQUFDO0FBR2hELGdCQUFNLFlBQVksYUFBYSxPQUFPLE9BQUssRUFBRSxPQUFPLFVBQWEsQ0FBQyxhQUFhLElBQUksRUFBRSxFQUFFLENBQUM7QUFDeEYsY0FBSSxVQUFVLFNBQVMsR0FBRztBQUN4QixrQkFBTSxPQUFPLEtBQUssUUFBUSxVQUFVLElBQUksT0FBSyxFQUFFLEVBQUcsQ0FBQztBQUFBLFVBQ3JEO0FBR0EsZ0JBQU0sWUFBWSxLQUFLLE9BQU8sT0FBSyxDQUFDLGVBQWUsSUFBSSxFQUFFLEVBQUUsQ0FBQztBQUM1RCxjQUFJLFVBQVUsU0FBUyxHQUFHO0FBRXZCLGtCQUFNLE9BQU8sS0FBSyxNQUFNLEVBQUUsU0FBUyxjQUFjLFFBQVEsVUFBVSxJQUFJLE9BQUssRUFBRSxFQUFFLEVBQUUsQ0FBQztBQUFBLFVBQ3RGO0FBQUEsUUFDRixTQUFTLEdBQUc7QUFDVixtQkFBUyw4QkFBOEIsRUFBRSxPQUFPLE9BQU8sQ0FBQyxFQUFFLENBQUM7QUFBQSxRQUM3RDtBQUFBLE1BQ0YsT0FBTztBQUtMLHVCQUFlLE1BQU0sT0FBTyxLQUFLLE1BQU07QUFBQSxVQUNyQyxRQUFRLEtBQUssSUFBSSxPQUFLLEVBQUUsRUFBRTtBQUFBLFVBQzFCLGtCQUFrQixFQUFFLFVBQVUsWUFBWTtBQUFBLFFBQzVDLENBQUM7QUFDRCx3QkFBZ0IsSUFBSSxZQUFZO0FBQUEsTUFDbEM7QUFFQSxZQUFNLGNBQWlEO0FBQUEsUUFDckQsT0FBTyxNQUFNO0FBQUEsTUFDZjtBQUNBLFVBQUksYUFBYSxTQUFTLE1BQU0sS0FBSyxHQUFHO0FBQ3BDLG9CQUFZLFFBQVEsTUFBTTtBQUFBLE1BQzlCO0FBQ0EsWUFBTSxPQUFPLFVBQVUsT0FBTyxjQUFjLFdBQVc7QUFBQSxJQUN6RDtBQUFBLEVBQ0Y7QUFDQSxVQUFRLHNCQUFzQixFQUFFLE9BQU8sT0FBTyxPQUFPLENBQUM7QUFDeEQ7QUFFTyxJQUFNLGtCQUFrQixPQUM3QixhQUNBLFFBQ0EsZUFDRztBQUNILFFBQU0sa0JBQWtCLG9CQUFJLElBQVk7QUFDeEMsTUFBSSxhQUFnQyxDQUFDO0FBRXJDLFFBQU0sb0JBQW9CLFFBQVEsYUFBYSxDQUFDO0FBQ2hELFFBQU0saUJBQWlCLFFBQVEsVUFBVSxDQUFDO0FBQzFDLFFBQU0sWUFBWSxrQkFBa0IsU0FBUyxLQUFLLGVBQWUsU0FBUztBQUUxRSxNQUFJLENBQUMsV0FBVztBQUNaLGlCQUFhLE1BQU0sT0FBTyxLQUFLLE1BQU0sQ0FBQyxDQUFDO0FBQ3ZDLGVBQVcsUUFBUSxPQUFLO0FBQUUsVUFBSSxFQUFFLFNBQVUsaUJBQWdCLElBQUksRUFBRSxRQUFRO0FBQUEsSUFBRyxDQUFDO0FBQUEsRUFDaEYsT0FBTztBQUNILHNCQUFrQixRQUFRLFFBQU0sZ0JBQWdCLElBQUksRUFBRSxDQUFDO0FBRXZELFFBQUksZUFBZSxTQUFTLEdBQUc7QUFDM0IsWUFBTSxlQUFlLE1BQU0sUUFBUSxJQUFJLGVBQWUsSUFBSSxRQUFNLE9BQU8sS0FBSyxJQUFJLEVBQUUsRUFBRSxNQUFNLE1BQU0sSUFBSSxDQUFDLENBQUM7QUFDdEcsbUJBQWEsUUFBUSxPQUFLO0FBQ3RCLFlBQUksS0FBSyxFQUFFLFNBQVUsaUJBQWdCLElBQUksRUFBRSxRQUFRO0FBQUEsTUFDdkQsQ0FBQztBQUFBLElBQ0w7QUFFQSxVQUFNLGlCQUFpQixNQUFNLEtBQUssZUFBZSxFQUFFO0FBQUEsTUFBSSxjQUNuRCxPQUFPLEtBQUssTUFBTSxFQUFFLFNBQVMsQ0FBQyxFQUFFLE1BQU0sTUFBTSxDQUFDLENBQUM7QUFBQSxJQUNsRDtBQUNBLFVBQU0sVUFBVSxNQUFNLFFBQVEsSUFBSSxjQUFjO0FBQ2hELGlCQUFhLFFBQVEsS0FBSztBQUFBLEVBQzlCO0FBRUEsYUFBVyxZQUFZLGlCQUFpQjtBQUNwQyxVQUFNLGFBQWEsV0FBVyxPQUFPLE9BQUssRUFBRSxhQUFhLFFBQVE7QUFDakUsVUFBTSxTQUFTLFdBQVcsSUFBSSxZQUFZLEVBQUUsT0FBTyxDQUFDLE1BQXdCLFFBQVEsQ0FBQyxDQUFDO0FBRXRGLFFBQUksd0JBQXdCLFlBQVksT0FBTyxHQUFHO0FBQ2hELFlBQU0sYUFBYSxNQUFNLGtCQUFrQixRQUFRLFVBQVU7QUFDN0QsYUFBTyxRQUFRLFNBQU87QUFDcEIsY0FBTSxNQUFNLFdBQVcsSUFBSSxJQUFJLEVBQUU7QUFDakMsWUFBSSxVQUFVLEtBQUs7QUFDbkIsWUFBSSxjQUFjLEtBQUs7QUFBQSxNQUN6QixDQUFDO0FBQUEsSUFDSDtBQUdBLFVBQU0sY0FBYyxvQkFBSSxJQUEyQjtBQUNuRCxVQUFNLGdCQUErQixDQUFDO0FBRXRDLFdBQU8sUUFBUSxTQUFPO0FBQ3BCLFlBQU0sVUFBVSxJQUFJLFdBQVc7QUFDL0IsVUFBSSxZQUFZLElBQUk7QUFDbEIsY0FBTSxRQUFRLFlBQVksSUFBSSxPQUFPLEtBQUssQ0FBQztBQUMzQyxjQUFNLEtBQUssR0FBRztBQUNkLG9CQUFZLElBQUksU0FBUyxLQUFLO0FBQUEsTUFDaEMsT0FBTztBQUNMLHNCQUFjLEtBQUssR0FBRztBQUFBLE1BQ3hCO0FBQUEsSUFDRixDQUFDO0FBR0QsZUFBVyxDQUFDLFNBQVMsSUFBSSxLQUFLLGFBQWE7QUFDekMsWUFBTSxrQkFBa0IsV0FDckIsT0FBTyxPQUFLLEVBQUUsWUFBWSxPQUFPLEVBQ2pDLElBQUksT0FBSyxFQUFFLEtBQUssRUFDaEIsS0FBSyxDQUFDLEdBQUcsTUFBTSxJQUFJLENBQUM7QUFFdkIsWUFBTSxhQUFhLGdCQUFnQixDQUFDLEtBQUs7QUFFekMsWUFBTSxrQkFBa0IsU0FBUyxNQUFNLFlBQVksT0FBTztBQUMxRCxZQUFNLFlBQVksZ0JBQWdCLElBQUksT0FBSyxFQUFFLEVBQUU7QUFFL0MsVUFBSSxVQUFVLFNBQVMsR0FBRztBQUN2QixjQUFNLE9BQU8sS0FBSyxLQUFLLFdBQVcsRUFBRSxPQUFPLFdBQVcsQ0FBQztBQUFBLE1BQzFEO0FBQUEsSUFDRjtBQUdBLFFBQUksY0FBYyxTQUFTLEdBQUc7QUFDNUIsWUFBTSxrQkFBa0IsU0FBUyxlQUFlLFlBQVksT0FBTztBQUNuRSxZQUFNLFlBQVksZ0JBQWdCLElBQUksT0FBSyxFQUFFLEVBQUU7QUFHL0MsWUFBTSxPQUFPLEtBQUssS0FBSyxXQUFXLEVBQUUsT0FBTyxFQUFFLENBQUM7QUFBQSxJQUNoRDtBQUdBLFVBQU0sb0JBQW9CLFVBQVUsWUFBWSxTQUFTLFdBQVc7QUFBQSxFQUN4RTtBQUNBLFVBQVEscUJBQXFCO0FBQy9CO0FBRUEsSUFBTSx3QkFBd0IsQ0FBQyxpQkFBZ0MsR0FBZ0IsTUFBMkI7QUFDeEcsUUFBTSxnQkFBZ0IsUUFBcUIsZUFBZTtBQUMxRCxNQUFJLGNBQWMsV0FBVyxFQUFHLFFBQU87QUFFdkMsTUFBSTtBQUNGLGVBQVcsUUFBUSxlQUFlO0FBQ2hDLFVBQUksQ0FBQyxLQUFNO0FBQ1gsWUFBTSxPQUFPLGNBQWMsR0FBRyxLQUFLLEtBQUs7QUFDeEMsWUFBTSxPQUFPLGNBQWMsR0FBRyxLQUFLLEtBQUs7QUFFeEMsVUFBSSxTQUFTO0FBQ2IsVUFBSSxPQUFPLEtBQU0sVUFBUztBQUFBLGVBQ2pCLE9BQU8sS0FBTSxVQUFTO0FBRS9CLFVBQUksV0FBVyxHQUFHO0FBQ2hCLGVBQU8sS0FBSyxVQUFVLFNBQVMsQ0FBQyxTQUFTO0FBQUEsTUFDM0M7QUFBQSxJQUNGO0FBQUEsRUFDRixTQUFTLE9BQU87QUFDZCxhQUFTLGtDQUFrQyxFQUFFLE9BQU8sT0FBTyxLQUFLLEVBQUUsQ0FBQztBQUFBLEVBQ3JFO0FBRUEsU0FBTztBQUNUO0FBRUEsSUFBTSxzQkFBc0IsT0FDeEIsVUFDQSxvQkFDQSxnQkFDQztBQUVELFFBQU0sZUFBZSxvQkFBb0I7QUFDekMsTUFBSSxzQkFBbUU7QUFFdkUsYUFBVyxNQUFNLG9CQUFvQjtBQUNqQyxVQUFNLFdBQVcsYUFBYSxLQUFLLE9BQUssRUFBRSxPQUFPLEVBQUU7QUFDbkQsUUFBSSxhQUFhLFNBQVMsY0FBZSxTQUFTLHFCQUFxQixTQUFTLGtCQUFrQixTQUFTLElBQUs7QUFDNUcsNEJBQXNCO0FBQ3RCO0FBQUEsSUFDSjtBQUFBLEVBQ0o7QUFFQSxNQUFJLENBQUMsb0JBQXFCO0FBRzFCLFFBQU0sU0FBUyxNQUFNLE9BQU8sVUFBVSxNQUFNLEVBQUUsU0FBUyxDQUFDO0FBQ3hELE1BQUksT0FBTyxVQUFVLEVBQUc7QUFNeEIsUUFBTSxZQUFzRSxDQUFDO0FBRTdFLGFBQVcsU0FBUyxRQUFRO0FBQ3hCLFVBQU0sT0FBTyxZQUFZLElBQUksTUFBTSxFQUFFO0FBQ3JDLFFBQUksUUFBUSxLQUFLLFNBQVMsR0FBRztBQUt6QixnQkFBVSxLQUFLLEVBQUUsT0FBTyxLQUFLLEtBQUssQ0FBQyxFQUFFLENBQUM7QUFBQSxJQUMxQztBQUFBLEVBQ0o7QUFHQSxNQUFJLG9CQUFvQixxQkFBcUIsTUFBTSxRQUFRLG9CQUFvQixpQkFBaUIsS0FBSyxvQkFBb0Isa0JBQWtCLFNBQVMsR0FBRztBQUNuSixjQUFVLEtBQUssQ0FBQyxHQUFHLE1BQU0sc0JBQXNCLG9CQUFxQixtQkFBb0IsRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDO0FBQUEsRUFDekcsT0FBTztBQUNILGNBQVUsS0FBSyxDQUFDLEdBQUcsTUFBTSxVQUFVLG9CQUFxQixJQUFJLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQztBQUFBLEVBQzdFO0FBMENBLGFBQVcsUUFBUSxXQUFXO0FBQzFCLFVBQU0sT0FBTyxVQUFVLEtBQUssS0FBSyxNQUFNLElBQUksRUFBRSxPQUFPLEdBQUcsQ0FBQztBQUFBLEVBQzVEO0FBQ0o7QUFRQSxJQUFNLGVBQWUsT0FBTyxXQUFpRDtBQUMzRSxNQUFJLENBQUMsT0FBTyxPQUFRLFFBQU8sQ0FBQztBQUM1QixRQUFNLFVBQVUsTUFBTSxPQUFPLEtBQUssTUFBTSxDQUFDLENBQUM7QUFDMUMsUUFBTSxTQUFTLElBQUksSUFBSSxRQUFRLElBQUksT0FBSyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztBQUNsRCxTQUFPLE9BQ0osSUFBSSxRQUFNLE9BQU8sSUFBSSxFQUFFLENBQUMsRUFDeEIsT0FBTyxDQUFDLE1BQTRCLE1BQU0sVUFBYSxFQUFFLE9BQU8sVUFBYSxFQUFFLGFBQWEsTUFBUztBQUMxRztBQUVPLElBQU0sWUFBWSxPQUFPLFdBQXFCO0FBQ25ELE1BQUksQ0FBQyxPQUFPLE9BQVE7QUFDcEIsUUFBTSxZQUFZLE1BQU0sYUFBYSxNQUFNO0FBRTNDLE1BQUksVUFBVSxXQUFXLEVBQUc7QUFJNUIsUUFBTSxpQkFBaUIsVUFBVSxDQUFDLEVBQUU7QUFHcEMsUUFBTSxhQUFhLFVBQVUsT0FBTyxPQUFLLEVBQUUsYUFBYSxjQUFjO0FBQ3RFLE1BQUksV0FBVyxTQUFTLEdBQUc7QUFDekIsVUFBTSxVQUFVLFdBQVcsSUFBSSxPQUFLLEVBQUUsRUFBRztBQUN6QyxVQUFNLE9BQU8sS0FBSyxLQUFLLFNBQVMsRUFBRSxVQUFVLGdCQUFnQixPQUFPLEdBQUcsQ0FBQztBQUFBLEVBQ3pFO0FBS0EsUUFBTSxrQkFBa0IsVUFBVSxDQUFDLEVBQUU7QUFDckMsTUFBSTtBQUVKLE1BQUksbUJBQW1CLG9CQUFvQixJQUFJO0FBRzNDLG9CQUFnQjtBQUFBLEVBQ3BCLE9BQU87QUFFSCxVQUFNLGFBQWEsVUFBVSxLQUFLLE9BQUssRUFBRSxhQUFhLGtCQUFrQixFQUFFLFlBQVksRUFBRTtBQUN4RixRQUFJLFlBQVk7QUFDWixzQkFBZ0IsV0FBVztBQUFBLElBQy9CO0FBQUEsRUFDSjtBQUVBLFFBQU0sTUFBTSxVQUFVLElBQUksT0FBSyxFQUFFLEVBQUc7QUFDcEMsUUFBTSxPQUFPLEtBQUssTUFBTSxFQUFFLFFBQVEsS0FBSyxTQUFTLGNBQWMsQ0FBQztBQUMvRCxVQUFRLGVBQWUsRUFBRSxPQUFPLElBQUksUUFBUSxnQkFBZ0IsY0FBYyxDQUFDO0FBQzdFO0FBRU8sSUFBTSxZQUFZLE9BQU8sV0FBcUI7QUFDbkQsTUFBSSxPQUFPLFdBQVcsRUFBRztBQUd6QixRQUFNLFlBQVksTUFBTSxhQUFhLE1BQU07QUFFM0MsTUFBSSxVQUFVLFdBQVcsRUFBRztBQUc1QixRQUFNLFdBQVcsVUFBVSxDQUFDO0FBQzVCLFFBQU0sWUFBWSxNQUFNLE9BQU8sUUFBUSxPQUFPLEVBQUUsT0FBTyxTQUFTLEdBQUcsQ0FBQztBQUdwRSxNQUFJLFVBQVUsU0FBUyxHQUFHO0FBQ3hCLFVBQU0sa0JBQWtCLFVBQVUsTUFBTSxDQUFDLEVBQUUsSUFBSSxPQUFLLEVBQUUsRUFBRztBQUN6RCxVQUFNLE9BQU8sS0FBSyxLQUFLLGlCQUFpQixFQUFFLFVBQVUsVUFBVSxJQUFLLE9BQU8sR0FBRyxDQUFDO0FBQUEsRUFDaEY7QUFFQSxVQUFRLDRCQUE0QixFQUFFLE9BQU8sVUFBVSxRQUFRLGFBQWEsVUFBVSxHQUFHLENBQUM7QUFDNUY7OztBQ3prQkEsSUFBTSxpQkFBaUI7QUFDdkIsSUFBTSxpQkFBaUI7QUFDdkIsSUFBTSxtQkFBbUI7QUFFbEIsSUFBTSxzQkFBc0IsWUFBZ0M7QUFDakUsUUFBTSxVQUFVLE1BQU0sT0FBTyxRQUFRLE9BQU8sRUFBRSxVQUFVLEtBQUssQ0FBQztBQUM5RCxRQUFNLGVBQThCLENBQUM7QUFFckMsYUFBVyxPQUFPLFNBQVM7QUFDekIsUUFBSSxDQUFDLElBQUksS0FBTTtBQUNmLFVBQU0sWUFBOEIsSUFBSSxLQUFLLElBQUksQ0FBQyxRQUFRO0FBQ3hELFVBQUk7QUFDSixVQUFJO0FBRUosYUFBTztBQUFBLFFBQ0wsSUFBSSxJQUFJO0FBQUEsUUFDUixLQUFLLElBQUksT0FBTztBQUFBLFFBQ2hCLFFBQVEsUUFBUSxJQUFJLE1BQU07QUFBQSxRQUMxQixTQUFTLElBQUk7QUFBQSxRQUNiO0FBQUE7QUFBQSxRQUNBO0FBQUEsTUFDRjtBQUFBLElBQ0YsQ0FBQztBQVNELGlCQUFhLEtBQUssRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUFBLEVBQ3ZDO0FBR0EsUUFBTSxZQUFZLE1BQU0sT0FBTyxVQUFVLE1BQU0sQ0FBQyxDQUFDO0FBQ2pELFFBQU0sV0FBVyxJQUFJLElBQUksVUFBVSxJQUFJLE9BQUssQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7QUFFdEQsYUFBVyxPQUFPLGNBQWM7QUFDOUIsZUFBVyxPQUFPLElBQUksTUFBTTtBQUMxQixVQUFJLElBQUksV0FBVyxJQUFJLFlBQVksT0FBTyxVQUFVLG1CQUFtQjtBQUNyRSxjQUFNLElBQUksU0FBUyxJQUFJLElBQUksT0FBTztBQUNsQyxZQUFJLEdBQUc7QUFDTCxjQUFJLGFBQWEsRUFBRTtBQUNuQixjQUFJLGFBQWEsRUFBRTtBQUFBLFFBQ3JCO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBRUEsU0FBTztBQUFBLElBQ0wsV0FBVyxLQUFLLElBQUk7QUFBQSxJQUNwQixTQUFTO0FBQUEsRUFDWDtBQUNGO0FBRU8sSUFBTSxnQkFBZ0IsWUFBWTtBQUN2QyxRQUFNLFFBQVEsTUFBTSxvQkFBb0I7QUFDeEMsUUFBTSxRQUFTLE1BQU0sZUFBNEIsY0FBYyxLQUFNLENBQUM7QUFDdEUsUUFBTSxLQUFLLEtBQUs7QUFDaEIsTUFBSSxNQUFNLFNBQVMsZ0JBQWdCO0FBQ2pDLFVBQU0sTUFBTTtBQUFBLEVBQ2Q7QUFDQSxRQUFNLGVBQWUsZ0JBQWdCLEtBQUs7QUFDMUMsVUFBUSxxQkFBcUIsRUFBRSxXQUFXLE1BQU0sT0FBTyxDQUFDO0FBQzFEO0FBRU8sSUFBTSxZQUFZLE9BQU8sU0FBaUI7QUFDL0MsUUFBTSxZQUFZLE1BQU0sb0JBQW9CO0FBQzVDLFFBQU0sYUFBeUI7QUFBQSxJQUM3QjtBQUFBLElBQ0EsV0FBVyxVQUFVO0FBQUEsSUFDckIsU0FBUyxVQUFVO0FBQUEsRUFDckI7QUFDQSxRQUFNLGNBQWUsTUFBTSxlQUE2QixnQkFBZ0IsS0FBTSxDQUFDO0FBQy9FLGNBQVksS0FBSyxVQUFVO0FBQzNCLFFBQU0sZUFBZSxrQkFBa0IsV0FBVztBQUNsRCxVQUFRLGVBQWUsRUFBRSxLQUFLLENBQUM7QUFDakM7QUFFTyxJQUFNLGlCQUFpQixZQUFtQztBQUMvRCxTQUFRLE1BQU0sZUFBNkIsZ0JBQWdCLEtBQU0sQ0FBQztBQUNwRTtBQUVPLElBQU0sbUJBQW1CLE9BQU8sU0FBaUI7QUFDdEQsTUFBSSxjQUFlLE1BQU0sZUFBNkIsZ0JBQWdCLEtBQU0sQ0FBQztBQUM3RSxnQkFBYyxZQUFZLE9BQU8sT0FBSyxFQUFFLFNBQVMsSUFBSTtBQUNyRCxRQUFNLGVBQWUsa0JBQWtCLFdBQVc7QUFDbEQsVUFBUSx1QkFBdUIsRUFBRSxLQUFLLENBQUM7QUFDekM7QUFFTyxJQUFNLE9BQU8sWUFBWTtBQUM5QixRQUFNLFFBQVMsTUFBTSxlQUE0QixjQUFjLEtBQU0sQ0FBQztBQUN0RSxRQUFNLFFBQVEsTUFBTSxJQUFJO0FBQ3hCLE1BQUksQ0FBQyxPQUFPO0FBQ1YsWUFBUSxrQkFBa0I7QUFDMUI7QUFBQSxFQUNGO0FBQ0EsUUFBTSxlQUFlLGdCQUFnQixLQUFLO0FBQzFDLFFBQU0sYUFBYSxLQUFLO0FBQ3hCLFVBQVEsbUJBQW1CO0FBQzdCO0FBRU8sSUFBTSxlQUFlLE9BQU8sVUFBa0M7QUFTbkUsUUFBTSxjQUFjLE1BQU0sT0FBTyxLQUFLLE1BQU0sQ0FBQyxDQUFDO0FBQzlDLFFBQU0sZ0JBQWdCLG9CQUFJLElBQTZCO0FBQ3ZELFFBQU0sZ0JBQWdCLG9CQUFJLElBQStCO0FBRXpELGNBQVksUUFBUSxPQUFLO0FBQ3ZCLFFBQUksRUFBRSxHQUFJLGVBQWMsSUFBSSxFQUFFLElBQUksQ0FBQztBQUNuQyxRQUFJLEVBQUUsS0FBSztBQUNULFlBQU0sT0FBTyxjQUFjLElBQUksRUFBRSxHQUFHLEtBQUssQ0FBQztBQUMxQyxXQUFLLEtBQUssQ0FBQztBQUNYLG9CQUFjLElBQUksRUFBRSxLQUFLLElBQUk7QUFBQSxJQUMvQjtBQUFBLEVBQ0YsQ0FBQztBQUdELFFBQU0sa0JBQWtCLE9BQU8sV0FBaUU7QUFFOUYsUUFBSSxPQUFPLE1BQU0sY0FBYyxJQUFJLE9BQU8sRUFBRSxHQUFHO0FBQzdDLFlBQU0sSUFBSSxjQUFjLElBQUksT0FBTyxFQUFFO0FBQ3JDLG9CQUFjLE9BQU8sT0FBTyxFQUFHO0FBRS9CLFVBQUksR0FBRyxLQUFLO0FBQ1QsY0FBTUMsUUFBTyxjQUFjLElBQUksRUFBRSxHQUFHO0FBQ3BDLFlBQUlBLE9BQU07QUFDUCxnQkFBTSxNQUFNQSxNQUFLLFVBQVUsT0FBSyxFQUFFLE9BQU8sRUFBRSxFQUFFO0FBQzdDLGNBQUksUUFBUSxHQUFJLENBQUFBLE1BQUssT0FBTyxLQUFLLENBQUM7QUFBQSxRQUNyQztBQUFBLE1BQ0g7QUFDQSxhQUFPO0FBQUEsSUFDVDtBQUVBLFVBQU0sT0FBTyxjQUFjLElBQUksT0FBTyxHQUFHO0FBQ3pDLFFBQUksUUFBUSxLQUFLLFNBQVMsR0FBRztBQUMzQixZQUFNLElBQUksS0FBSyxNQUFNO0FBQ3JCLFVBQUksR0FBRyxHQUFJLGVBQWMsT0FBTyxFQUFFLEVBQUU7QUFDcEMsYUFBTztBQUFBLElBQ1Q7QUFHQSxRQUFJLE9BQU8sS0FBSztBQUNaLFVBQUk7QUFDQSxjQUFNLElBQUksTUFBTSxPQUFPLEtBQUssT0FBTyxFQUFFLEtBQUssT0FBTyxLQUFLLFFBQVEsTUFBTSxDQUFDO0FBQ3JFLGVBQU87QUFBQSxNQUNYLFNBQVMsR0FBRztBQUNSLGlCQUFTLHdCQUF3QixFQUFFLEtBQUssT0FBTyxLQUFLLE9BQU8sRUFBRSxDQUFDO0FBQUEsTUFDbEU7QUFBQSxJQUNKO0FBRUEsV0FBTztBQUFBLEVBQ1Q7QUFVQSxRQUFNLGlCQUFpQixNQUFNLE9BQU8sUUFBUSxPQUFPO0FBRW5ELFdBQVMsSUFBSSxHQUFHLElBQUksTUFBTSxRQUFRLFFBQVEsS0FBSztBQUM3QyxVQUFNLFdBQVcsTUFBTSxRQUFRLENBQUM7QUFJaEMsVUFBTSxhQUEwRCxDQUFDO0FBRWpFLGVBQVcsYUFBYSxTQUFTLE1BQU07QUFDckMsWUFBTSxRQUFRLE1BQU0sZ0JBQWdCLFNBQVM7QUFDN0MsVUFBSSxTQUFTLE1BQU0sSUFBSTtBQUNyQixtQkFBVyxLQUFLLEVBQUUsT0FBTyxNQUFNLElBQUksUUFBUSxVQUFVLENBQUM7QUFBQSxNQUN4RDtBQUFBLElBQ0Y7QUFFQSxRQUFJLFdBQVcsV0FBVyxFQUFHO0FBRTdCLFFBQUk7QUFFSixRQUFJLElBQUksZUFBZSxRQUFRO0FBQzdCLHVCQUFpQixlQUFlLENBQUMsRUFBRTtBQUFBLElBQ3JDLE9BQU87QUFFTCxZQUFNLE1BQU0sTUFBTSxPQUFPLFFBQVEsT0FBTyxDQUFDLENBQUM7QUFDMUMsdUJBQWlCLElBQUk7QUFBQSxJQUV2QjtBQUVBLFVBQU0sU0FBUyxXQUFXLElBQUksT0FBSyxFQUFFLEtBQUs7QUFPMUMsYUFBUyxJQUFJLEdBQUcsSUFBSSxXQUFXLFFBQVEsS0FBSztBQUMxQyxZQUFNLEVBQUUsT0FBTyxPQUFPLElBQUksV0FBVyxDQUFDO0FBQ3RDLFVBQUk7QUFDRixjQUFNLE9BQU8sS0FBSyxLQUFLLE9BQU8sRUFBRSxVQUFVLGdCQUFnQixPQUFPLEVBQUUsQ0FBQztBQUNwRSxZQUFJLE9BQU8sUUFBUTtBQUNkLGdCQUFNLE9BQU8sS0FBSyxPQUFPLE9BQU8sRUFBRSxRQUFRLEtBQUssQ0FBQztBQUFBLFFBQ3JELE9BQU87QUFFRixnQkFBTSxVQUFVLE1BQU0sT0FBTyxLQUFLLElBQUksS0FBSztBQUMzQyxjQUFJLFFBQVEsT0FBUSxPQUFNLE9BQU8sS0FBSyxPQUFPLE9BQU8sRUFBRSxRQUFRLE1BQU0sQ0FBQztBQUFBLFFBQzFFO0FBQUEsTUFDRixTQUFTLEdBQUc7QUFDVixpQkFBUyxzQkFBc0IsRUFBRSxPQUFPLE9BQU8sRUFBRSxDQUFDO0FBQUEsTUFDcEQ7QUFBQSxJQUNGO0FBSUEsVUFBTSxTQUFTLG9CQUFJLElBQXNCO0FBQ3pDLFVBQU0sY0FBYyxvQkFBSSxJQUF3QztBQUVoRSxlQUFXLFFBQVEsWUFBWTtBQUM3QixVQUFJLEtBQUssT0FBTyxlQUFlLFFBQVc7QUFHeEMsY0FBTSxNQUFNLEtBQUssT0FBTztBQUN4QixjQUFNLE9BQU8sT0FBTyxJQUFJLEdBQUcsS0FBSyxDQUFDO0FBQ2pDLGFBQUssS0FBSyxLQUFLLEtBQUs7QUFDcEIsZUFBTyxJQUFJLEtBQUssSUFBSTtBQUNwQixZQUFJLEtBQUssT0FBTyxZQUFZO0FBQ3ZCLHNCQUFZLElBQUksS0FBSyxLQUFLLE9BQU8sVUFBd0M7QUFBQSxRQUM5RTtBQUFBLE1BQ0YsT0FBTztBQUVKLGNBQU0sT0FBTyxLQUFLLFFBQVEsS0FBSyxLQUFLO0FBQUEsTUFDdkM7QUFBQSxJQUNGO0FBRUEsZUFBVyxDQUFDLE9BQU8sR0FBRyxLQUFLLE9BQU8sUUFBUSxHQUFHO0FBQzNDLFVBQUksSUFBSSxTQUFTLEdBQUc7QUFDbEIsY0FBTSxVQUFVLE1BQU0sT0FBTyxLQUFLLE1BQU0sRUFBRSxRQUFRLElBQUksQ0FBQztBQUN2RCxjQUFNLE9BQU8sVUFBVSxPQUFPLFNBQVM7QUFBQSxVQUNsQztBQUFBLFVBQ0EsT0FBTyxZQUFZLElBQUksS0FBSyxLQUFLO0FBQUEsUUFDdEMsQ0FBQztBQUFBLE1BQ0g7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNGOzs7QUNsUEEsT0FBTyxRQUFRLFlBQVksWUFBWSxZQUFZO0FBQ2pELFFBQU0sUUFBUSxNQUFNLGdCQUFnQjtBQUNwQyxzQkFBb0IsTUFBTSxvQkFBb0IsQ0FBQyxDQUFDO0FBQ2hELFVBQVEsdUJBQXVCO0FBQUEsSUFDN0IsU0FBUyxPQUFPLFFBQVEsWUFBWSxFQUFFO0FBQUEsSUFDdEMsVUFBVSxNQUFNO0FBQUEsSUFDaEIsaUJBQWlCLE1BQU0sa0JBQWtCLFVBQVU7QUFBQSxFQUNyRCxDQUFDO0FBQ0gsQ0FBQztBQUdELGdCQUFnQixFQUFFLEtBQUssT0FBTyxVQUFVO0FBQ3BDLHNCQUFvQixNQUFNLG9CQUFvQixDQUFDLENBQUM7QUFDaEQsUUFBTSxXQUFXO0FBQ2pCLFVBQVEsOEJBQThCO0FBQUEsSUFDbEMsU0FBUyxPQUFPLFFBQVEsWUFBWSxFQUFFO0FBQUEsSUFDdEMsVUFBVSxNQUFNO0FBQUEsRUFDcEIsQ0FBQztBQUNMLENBQUM7QUFFRCxJQUFNLGdCQUFnQixPQUNwQixTQUNBLFdBQ29DO0FBQ3BDLFdBQVMsb0JBQW9CLEVBQUUsTUFBTSxRQUFRLE1BQU0sTUFBTSxPQUFPLEdBQUcsQ0FBQztBQUNwRSxVQUFRLFFBQVEsTUFBTTtBQUFBLElBQ3BCLEtBQUssWUFBWTtBQUNmLFlBQU0sUUFBUSxNQUFNLGdCQUFnQjtBQUNwQywwQkFBb0IsTUFBTSxvQkFBb0IsQ0FBQyxDQUFDO0FBRWhELFlBQU0sU0FBUyxNQUFNLHNCQUFzQixLQUFLO0FBQ2hELGFBQU8sRUFBRSxJQUFJLE1BQU0sTUFBTSxFQUFFLFFBQVEsYUFBYSxNQUFNLEVBQVc7QUFBQSxJQUNuRTtBQUFBLElBQ0EsS0FBSyxpQkFBaUI7QUFDcEIsY0FBUSxrQ0FBa0MsRUFBRSxTQUFVLFFBQVEsU0FBaUIsUUFBUSxDQUFDO0FBQ3hGLFlBQU0sY0FBYztBQUNwQixZQUFNLFFBQVEsTUFBTSxnQkFBZ0I7QUFDcEMsMEJBQW9CLE1BQU0sb0JBQW9CLENBQUMsQ0FBQztBQUNoRCxZQUFNLFVBQVcsUUFBUSxXQUFnRCxDQUFDO0FBQzFFLFlBQU0sWUFBWSxRQUFRLGFBQWEsQ0FBQztBQUN4QyxZQUFNLFVBQVUsUUFBUSxTQUFTLFNBQVMsUUFBUSxVQUFVO0FBRTVELFlBQU0sY0FBYyxVQUFVLEVBQUUsR0FBRyxPQUFPLFFBQVEsSUFBSTtBQUV0RCxZQUFNLGFBQWEsQ0FBQyxXQUFtQixVQUFrQjtBQUNyRCxlQUFPLFFBQVEsWUFBWTtBQUFBLFVBQ3ZCLE1BQU07QUFBQSxVQUNOLFNBQVMsRUFBRSxXQUFXLE1BQU07QUFBQSxRQUNoQyxDQUFDLEVBQUUsTUFBTSxNQUFNO0FBQUEsUUFBQyxDQUFDO0FBQUEsTUFDckI7QUFHQSxZQUFNLFNBQVMsTUFBTSxtQkFBbUIsYUFBYSxXQUFXLFVBQVU7QUFDMUUsWUFBTSxlQUFlLE1BQU07QUFDM0IsYUFBTyxFQUFFLElBQUksTUFBTSxNQUFNLEVBQUUsT0FBTyxFQUFXO0FBQUEsSUFDL0M7QUFBQSxJQUNBLEtBQUssZ0JBQWdCO0FBQ25CLGNBQVEsK0JBQStCO0FBQ3ZDLFlBQU0sY0FBYztBQUNwQixZQUFNLFFBQVEsTUFBTSxnQkFBZ0I7QUFDcEMsMEJBQW9CLE1BQU0sb0JBQW9CLENBQUMsQ0FBQztBQUNoRCxZQUFNLFVBQVcsUUFBUSxXQUFnRCxDQUFDO0FBQzFFLFlBQU0sWUFBWSxRQUFRLGFBQWEsQ0FBQztBQUN4QyxZQUFNLFVBQVUsUUFBUSxTQUFTLFNBQVMsUUFBUSxVQUFVO0FBQzVELFlBQU0sY0FBYyxVQUFVLEVBQUUsR0FBRyxPQUFPLFFBQVEsSUFBSTtBQUV0RCxZQUFNLGFBQWEsQ0FBQyxXQUFtQixVQUFrQjtBQUNyRCxlQUFPLFFBQVEsWUFBWTtBQUFBLFVBQ3ZCLE1BQU07QUFBQSxVQUNOLFNBQVMsRUFBRSxXQUFXLE1BQU07QUFBQSxRQUNoQyxDQUFDLEVBQUUsTUFBTSxNQUFNO0FBQUEsUUFBQyxDQUFDO0FBQUEsTUFDckI7QUFFQSxZQUFNLGdCQUFnQixhQUFhLFdBQVcsVUFBVTtBQUN4RCxhQUFPLEVBQUUsSUFBSSxLQUFLO0FBQUEsSUFDcEI7QUFBQSxJQUNBLEtBQUssa0JBQWtCO0FBQ3JCLGNBQVEsZ0NBQWdDO0FBQ3hDLFlBQU0sY0FBYztBQUNwQixZQUFNLFVBQVUsUUFBUTtBQUN4QixVQUFJLFNBQVMsUUFBUSxRQUFRO0FBQzNCLGNBQU0sVUFBVSxRQUFRLE1BQU07QUFDOUIsZUFBTyxFQUFFLElBQUksS0FBSztBQUFBLE1BQ3BCO0FBQ0EsYUFBTyxFQUFFLElBQUksT0FBTyxPQUFPLG1CQUFtQjtBQUFBLElBQ2hEO0FBQUEsSUFDQSxLQUFLLGtCQUFrQjtBQUNyQixjQUFRLGtDQUFrQztBQUMxQyxZQUFNLGNBQWM7QUFDcEIsWUFBTSxVQUFVLFFBQVE7QUFDeEIsVUFBSSxTQUFTLFFBQVEsUUFBUTtBQUMzQixjQUFNLFVBQVUsUUFBUSxNQUFNO0FBQzlCLGVBQU8sRUFBRSxJQUFJLEtBQUs7QUFBQSxNQUNwQjtBQUNBLGFBQU8sRUFBRSxJQUFJLE9BQU8sT0FBTyxtQkFBbUI7QUFBQSxJQUNoRDtBQUFBLElBQ0EsS0FBSyxRQUFRO0FBQ1gsY0FBUSxxQkFBcUI7QUFDN0IsWUFBTSxLQUFLO0FBQ1gsYUFBTyxFQUFFLElBQUksS0FBSztBQUFBLElBQ3BCO0FBQUEsSUFDQSxLQUFLLGFBQWE7QUFDaEIsWUFBTSxPQUFRLFFBQVEsU0FBaUI7QUFDdkMsVUFBSSxPQUFPLFNBQVMsVUFBVTtBQUM1QixnQkFBUSw2QkFBNkIsRUFBRSxLQUFLLENBQUM7QUFDN0MsY0FBTSxVQUFVLElBQUk7QUFDcEIsZUFBTyxFQUFFLElBQUksS0FBSztBQUFBLE1BQ3BCO0FBQ0EsYUFBTyxFQUFFLElBQUksT0FBTyxPQUFPLGVBQWU7QUFBQSxJQUM1QztBQUFBLElBQ0EsS0FBSyxrQkFBa0I7QUFDckIsWUFBTSxTQUFTLE1BQU0sZUFBZTtBQUNwQyxhQUFPLEVBQUUsSUFBSSxNQUFNLE1BQU0sT0FBZ0I7QUFBQSxJQUMzQztBQUFBLElBQ0EsS0FBSyxnQkFBZ0I7QUFDbkIsWUFBTSxRQUFTLFFBQVEsU0FBaUI7QUFDeEMsVUFBSSxPQUFPO0FBQ1QsZ0JBQVEsZ0NBQWdDLEVBQUUsTUFBTSxNQUFNLEtBQUssQ0FBQztBQUM1RCxjQUFNLGFBQWEsS0FBSztBQUN4QixlQUFPLEVBQUUsSUFBSSxLQUFLO0FBQUEsTUFDcEI7QUFDQSxhQUFPLEVBQUUsSUFBSSxPQUFPLE9BQU8sZ0JBQWdCO0FBQUEsSUFDN0M7QUFBQSxJQUNBLEtBQUssb0JBQW9CO0FBQ3ZCLFlBQU0sT0FBUSxRQUFRLFNBQWlCO0FBQ3ZDLFVBQUksT0FBTyxTQUFTLFVBQVU7QUFDNUIsZ0JBQVEscUNBQXFDLEVBQUUsS0FBSyxDQUFDO0FBQ3JELGNBQU0saUJBQWlCLElBQUk7QUFDM0IsZUFBTyxFQUFFLElBQUksS0FBSztBQUFBLE1BQ3BCO0FBQ0EsYUFBTyxFQUFFLElBQUksT0FBTyxPQUFPLGVBQWU7QUFBQSxJQUM1QztBQUFBLElBQ0EsS0FBSyxtQkFBbUI7QUFDdEIsWUFBTSxRQUFRLE1BQU0sZ0JBQWdCO0FBQ3BDLDBCQUFvQixNQUFNLG9CQUFvQixDQUFDLENBQUM7QUFDaEQsYUFBTyxFQUFFLElBQUksTUFBTSxNQUFNLE1BQWU7QUFBQSxJQUMxQztBQUFBLElBQ0EsS0FBSyxtQkFBbUI7QUFDdEIsY0FBUSxpQ0FBaUM7QUFDekMsWUFBTSxRQUFRLE1BQU0sZ0JBQWdCLFFBQVEsT0FBYztBQUMxRCwwQkFBb0IsTUFBTSxvQkFBb0IsQ0FBQyxDQUFDO0FBQ2hELDJCQUFxQixLQUFLO0FBQzFCLGFBQU8sRUFBRSxJQUFJLE1BQU0sTUFBTSxNQUFlO0FBQUEsSUFDMUM7QUFBQSxJQUNBLEtBQUssV0FBVztBQUNaLFlBQU07QUFDTixZQUFNQyxRQUFPLFFBQVE7QUFDckIsYUFBTyxFQUFFLElBQUksTUFBTSxNQUFNQSxNQUFjO0FBQUEsSUFDM0M7QUFBQSxJQUNBLEtBQUssYUFBYTtBQUNkLGdCQUFVO0FBQ1YsYUFBTyxFQUFFLElBQUksS0FBSztBQUFBLElBQ3RCO0FBQUEsSUFDQSxLQUFLLFlBQVk7QUFDYixZQUFNLFFBQVEsUUFBUTtBQUN0QixVQUFJLFNBQVMsTUFBTSxTQUFTLE1BQU0sU0FBUztBQUN2QyxvQkFBWSxLQUFLO0FBQUEsTUFDckI7QUFDQSxhQUFPLEVBQUUsSUFBSSxLQUFLO0FBQUEsSUFDdEI7QUFBQSxJQUNBO0FBQ0UsYUFBTyxFQUFFLElBQUksT0FBTyxPQUFPLGtCQUFrQjtBQUFBLEVBQ2pEO0FBQ0Y7QUFFQSxPQUFPLFFBQVEsVUFBVTtBQUFBLEVBQ3ZCLENBQ0UsU0FDQSxRQUNBLGlCQUNHO0FBQ0gsa0JBQWMsU0FBUyxNQUFNLEVBQzVCLEtBQUssQ0FBQyxhQUFhLGFBQWEsUUFBUSxDQUFDLEVBQ3pDLE1BQU0sQ0FBQyxVQUFVO0FBQ2hCLG1CQUFhLEVBQUUsSUFBSSxPQUFPLE9BQU8sT0FBTyxLQUFLLEVBQUUsQ0FBQztBQUFBLElBQ2xELENBQUM7QUFDRCxXQUFPO0FBQUEsRUFDVDtBQUNGO0FBRUEsT0FBTyxVQUFVLFVBQVUsWUFBWSxPQUFPLFVBQVU7QUFDdEQsVUFBUSxxQkFBcUIsRUFBRSxNQUFNLENBQUM7QUFDeEMsQ0FBQztBQUVELElBQUksaUJBQXVEO0FBQzNELElBQU0sY0FBYyxvQkFBSSxJQUFZO0FBQ3BDLElBQUksdUJBQTZEO0FBRWpFLElBQU0saUJBQWlCLENBQUMsVUFBbUI7QUFFekMsTUFBSSxVQUFVLFFBQVc7QUFDdkIsZ0JBQVksSUFBSSxLQUFLO0FBQ3JCLFFBQUkscUJBQXNCLGNBQWEsb0JBQW9CO0FBRTNELDJCQUF1QixXQUFXLFlBQVk7QUFDNUMsWUFBTSxNQUFNLE1BQU0sS0FBSyxXQUFXO0FBQ2xDLGtCQUFZLE1BQU07QUFDbEIsVUFBSSxJQUFJLFdBQVcsRUFBRztBQUV0QixVQUFJO0FBQ0YsY0FBTSxRQUFRLE1BQU0sZ0JBQWdCO0FBQ3BDLDRCQUFvQixNQUFNLG9CQUFvQixDQUFDLENBQUM7QUFFaEQsY0FBTSxnQkFBZ0IsTUFBTSxrQkFBa0IsT0FBTyxPQUFLLEVBQUUsT0FBTztBQUNuRSxZQUFJLGlCQUFpQixjQUFjLFNBQVMsR0FBRztBQUM3QyxnQkFBTSxjQUFjLGNBQWMsSUFBSSxPQUFLLEVBQUUsRUFBRTtBQUUvQyxnQkFBTSxTQUFTLE1BQU0sbUJBQW1CLEVBQUUsR0FBRyxPQUFPLFNBQVMsWUFBWSxHQUFHLEVBQUUsUUFBUSxJQUFJLENBQUM7QUFDM0YsZ0JBQU0sZUFBZSxNQUFNO0FBQzNCLGtCQUFRLHFCQUFxQixFQUFFLE1BQU0sS0FBSyxZQUFZLFlBQVksQ0FBQztBQUFBLFFBQ3JFO0FBQUEsTUFDRixTQUFTLEdBQUc7QUFDVixnQkFBUSxNQUFNLDRCQUE0QixDQUFDO0FBQUEsTUFDN0M7QUFBQSxJQUNGLEdBQUcsR0FBRztBQUFBLEVBQ1I7QUFHQSxNQUFJLGVBQWdCLGNBQWEsY0FBYztBQUMvQyxtQkFBaUIsV0FBVyxZQUFZO0FBQ3RDLFFBQUk7QUFDRixZQUFNLFFBQVEsTUFBTSxnQkFBZ0I7QUFDcEMsMEJBQW9CLE1BQU0sb0JBQW9CLENBQUMsQ0FBQztBQUVoRCxZQUFNLGdCQUFnQixNQUFNLGtCQUFrQixPQUFPLE9BQUssRUFBRSxPQUFPO0FBQ25FLFVBQUksaUJBQWlCLGNBQWMsU0FBUyxHQUFHO0FBQzdDLGdCQUFRLG9DQUFvQztBQUFBLFVBQzFDLFlBQVksY0FBYyxJQUFJLE9BQUssRUFBRSxFQUFFO0FBQUEsVUFDdkMsT0FBTyxjQUFjO0FBQUEsUUFDdkIsQ0FBQztBQUNELGNBQU0sTUFBTSxjQUFjLElBQUksT0FBSyxFQUFFLEVBQUU7QUFHdkMsY0FBTSxTQUFTLE1BQU0sbUJBQW1CLEVBQUUsR0FBRyxPQUFPLFNBQVMsSUFBSSxDQUFDO0FBQ2xFLGNBQU0sZUFBZSxNQUFNO0FBQUEsTUFDN0I7QUFBQSxJQUNGLFNBQVMsR0FBRztBQUNWLGNBQVEsTUFBTSxtQkFBbUIsQ0FBQztBQUFBLElBQ3BDO0FBQUEsRUFDRixHQUFHLEdBQUk7QUFDVDtBQUVBLE9BQU8sS0FBSyxVQUFVLFlBQVksQ0FBQyxRQUFRO0FBQ3pDLE1BQUksSUFBSSxHQUFJLGdCQUFlLElBQUksRUFBRTtBQUFBLE1BQzVCLGdCQUFlO0FBQ3RCLENBQUM7QUFDRCxPQUFPLEtBQUssVUFBVSxZQUFZLENBQUMsT0FBTyxlQUFlO0FBQ3ZELE1BQUksV0FBVyxPQUFPLFdBQVcsV0FBVyxZQUFZO0FBQ3RELG1CQUFlLEtBQUs7QUFBQSxFQUN0QjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbImN1c3RvbVN0cmF0ZWdpZXMiLCAicGFydHMiLCAiZ3JvdXBUYWJzIiwgInRhYnMiLCAibGlzdCIsICJsb2dzIl0KfQo=
