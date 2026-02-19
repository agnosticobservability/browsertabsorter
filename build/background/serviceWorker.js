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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3NoYXJlZC9zdHJhdGVneVJlZ2lzdHJ5LnRzIiwgIi4uLy4uL3NyYy9zaGFyZWQvbG9nZ2VyLnRzIiwgIi4uLy4uL3NyYy9zaGFyZWQvdXRpbHMudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZ3JvdXBpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3NvcnRpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL2V4dHJhY3Rpb24vbG9naWMudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZXh0cmFjdGlvbi9nZW5lcmFSZWdpc3RyeS50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9zdG9yYWdlLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3ByZWZlcmVuY2VzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL2V4dHJhY3Rpb24vaW5kZXgudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvY2F0ZWdvcnlSdWxlcy50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9jb250ZXh0QW5hbHlzaXMudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvdGFiTWFuYWdlci50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9zdGF0ZU1hbmFnZXIudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvc2VydmljZVdvcmtlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgQ3VzdG9tU3RyYXRlZ3ksIFNvcnRpbmdTdHJhdGVneSB9IGZyb20gXCIuL3R5cGVzLmpzXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RyYXRlZ3lEZWZpbml0aW9uIHtcbiAgICBpZDogU29ydGluZ1N0cmF0ZWd5IHwgc3RyaW5nO1xuICAgIGxhYmVsOiBzdHJpbmc7XG4gICAgaXNHcm91cGluZzogYm9vbGVhbjtcbiAgICBpc1NvcnRpbmc6IGJvb2xlYW47XG4gICAgdGFncz86IHN0cmluZ1tdO1xuICAgIGF1dG9SdW4/OiBib29sZWFuO1xuICAgIGlzQ3VzdG9tPzogYm9vbGVhbjtcbn1cblxuLy8gUmVzdG9yZWQgc3RyYXRlZ2llcyBtYXRjaGluZyBiYWNrZ3JvdW5kIGNhcGFiaWxpdGllcy5cbmV4cG9ydCBjb25zdCBTVFJBVEVHSUVTOiBTdHJhdGVneURlZmluaXRpb25bXSA9IFtcbiAgICB7IGlkOiBcImRvbWFpblwiLCBsYWJlbDogXCJEb21haW5cIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImRvbWFpbl9mdWxsXCIsIGxhYmVsOiBcIkZ1bGwgRG9tYWluXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJ0b3BpY1wiLCBsYWJlbDogXCJUb3BpY1wiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwiY29udGV4dFwiLCBsYWJlbDogXCJDb250ZXh0XCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJsaW5lYWdlXCIsIGxhYmVsOiBcIkxpbmVhZ2VcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInBpbm5lZFwiLCBsYWJlbDogXCJQaW5uZWRcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInJlY2VuY3lcIiwgbGFiZWw6IFwiUmVjZW5jeVwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwiYWdlXCIsIGxhYmVsOiBcIkFnZVwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwidXJsXCIsIGxhYmVsOiBcIlVSTFwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwibmVzdGluZ1wiLCBsYWJlbDogXCJOZXN0aW5nXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJ0aXRsZVwiLCBsYWJlbDogXCJUaXRsZVwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuXTtcblxuZXhwb3J0IGNvbnN0IGdldFN0cmF0ZWdpZXMgPSAoY3VzdG9tU3RyYXRlZ2llcz86IEN1c3RvbVN0cmF0ZWd5W10pOiBTdHJhdGVneURlZmluaXRpb25bXSA9PiB7XG4gICAgaWYgKCFjdXN0b21TdHJhdGVnaWVzIHx8IGN1c3RvbVN0cmF0ZWdpZXMubGVuZ3RoID09PSAwKSByZXR1cm4gU1RSQVRFR0lFUztcblxuICAgIC8vIEN1c3RvbSBzdHJhdGVnaWVzIGNhbiBvdmVycmlkZSBidWlsdC1pbnMgaWYgSURzIG1hdGNoLCBvciBhZGQgbmV3IG9uZXMuXG4gICAgY29uc3QgY29tYmluZWQgPSBbLi4uU1RSQVRFR0lFU107XG5cbiAgICBjdXN0b21TdHJhdGVnaWVzLmZvckVhY2goY3VzdG9tID0+IHtcbiAgICAgICAgY29uc3QgZXhpc3RpbmdJbmRleCA9IGNvbWJpbmVkLmZpbmRJbmRleChzID0+IHMuaWQgPT09IGN1c3RvbS5pZCk7XG5cbiAgICAgICAgLy8gRGV0ZXJtaW5lIGNhcGFiaWxpdGllcyBiYXNlZCBvbiBydWxlcyBwcmVzZW5jZVxuICAgICAgICBjb25zdCBoYXNHcm91cGluZyA9IChjdXN0b20uZ3JvdXBpbmdSdWxlcyAmJiBjdXN0b20uZ3JvdXBpbmdSdWxlcy5sZW5ndGggPiAwKSB8fCAoY3VzdG9tLnJ1bGVzICYmIGN1c3RvbS5ydWxlcy5sZW5ndGggPiAwKSB8fCBmYWxzZTtcbiAgICAgICAgY29uc3QgaGFzU29ydGluZyA9IChjdXN0b20uc29ydGluZ1J1bGVzICYmIGN1c3RvbS5zb3J0aW5nUnVsZXMubGVuZ3RoID4gMCkgfHwgKGN1c3RvbS5ydWxlcyAmJiBjdXN0b20ucnVsZXMubGVuZ3RoID4gMCkgfHwgZmFsc2U7XG5cbiAgICAgICAgY29uc3QgdGFnczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgaWYgKGhhc0dyb3VwaW5nKSB0YWdzLnB1c2goXCJncm91cFwiKTtcbiAgICAgICAgaWYgKGhhc1NvcnRpbmcpIHRhZ3MucHVzaChcInNvcnRcIik7XG5cbiAgICAgICAgY29uc3QgZGVmaW5pdGlvbjogU3RyYXRlZ3lEZWZpbml0aW9uID0ge1xuICAgICAgICAgICAgaWQ6IGN1c3RvbS5pZCxcbiAgICAgICAgICAgIGxhYmVsOiBjdXN0b20ubGFiZWwsXG4gICAgICAgICAgICBpc0dyb3VwaW5nOiBoYXNHcm91cGluZyxcbiAgICAgICAgICAgIGlzU29ydGluZzogaGFzU29ydGluZyxcbiAgICAgICAgICAgIHRhZ3M6IHRhZ3MsXG4gICAgICAgICAgICBhdXRvUnVuOiBjdXN0b20uYXV0b1J1bixcbiAgICAgICAgICAgIGlzQ3VzdG9tOiB0cnVlXG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKGV4aXN0aW5nSW5kZXggIT09IC0xKSB7XG4gICAgICAgICAgICBjb21iaW5lZFtleGlzdGluZ0luZGV4XSA9IGRlZmluaXRpb247XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb21iaW5lZC5wdXNoKGRlZmluaXRpb24pO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gY29tYmluZWQ7XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0U3RyYXRlZ3kgPSAoaWQ6IFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZyk6IFN0cmF0ZWd5RGVmaW5pdGlvbiB8IHVuZGVmaW5lZCA9PiBTVFJBVEVHSUVTLmZpbmQocyA9PiBzLmlkID09PSBpZCk7XG4iLCAiaW1wb3J0IHsgTG9nRW50cnksIExvZ0xldmVsLCBQcmVmZXJlbmNlcyB9IGZyb20gXCIuL3R5cGVzLmpzXCI7XG5cbmNvbnN0IFBSRUZJWCA9IFwiW1RhYlNvcnRlcl1cIjtcblxuY29uc3QgTEVWRUxfUFJJT1JJVFk6IFJlY29yZDxMb2dMZXZlbCwgbnVtYmVyPiA9IHtcbiAgZGVidWc6IDAsXG4gIGluZm86IDEsXG4gIHdhcm46IDIsXG4gIGVycm9yOiAzLFxuICBjcml0aWNhbDogNFxufTtcblxubGV0IGN1cnJlbnRMZXZlbDogTG9nTGV2ZWwgPSBcImluZm9cIjtcbmxldCBsb2dzOiBMb2dFbnRyeVtdID0gW107XG5jb25zdCBNQVhfTE9HUyA9IDEwMDA7XG5jb25zdCBTVE9SQUdFX0tFWSA9IFwic2Vzc2lvbkxvZ3NcIjtcblxuLy8gU2FmZSBjb250ZXh0IGNoZWNrXG5jb25zdCBpc1NlcnZpY2VXb3JrZXIgPSB0eXBlb2Ygc2VsZiAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVvZiAoc2VsZiBhcyBhbnkpLlNlcnZpY2VXb3JrZXJHbG9iYWxTY29wZSAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYgaW5zdGFuY2VvZiAoc2VsZiBhcyBhbnkpLlNlcnZpY2VXb3JrZXJHbG9iYWxTY29wZTtcbmxldCBpc1NhdmluZyA9IGZhbHNlO1xubGV0IHBlbmRpbmdTYXZlID0gZmFsc2U7XG5sZXQgc2F2ZVRpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsO1xuXG5jb25zdCBkb1NhdmUgPSAoKSA9PiB7XG4gICAgaWYgKCFpc1NlcnZpY2VXb3JrZXIgfHwgIWNocm9tZT8uc3RvcmFnZT8uc2Vzc2lvbiB8fCBpc1NhdmluZykge1xuICAgICAgICBwZW5kaW5nU2F2ZSA9IHRydWU7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpc1NhdmluZyA9IHRydWU7XG4gICAgcGVuZGluZ1NhdmUgPSBmYWxzZTtcblxuICAgIGNocm9tZS5zdG9yYWdlLnNlc3Npb24uc2V0KHsgW1NUT1JBR0VfS0VZXTogbG9ncyB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgaXNTYXZpbmcgPSBmYWxzZTtcbiAgICAgICAgaWYgKHBlbmRpbmdTYXZlKSB7XG4gICAgICAgICAgICBzYXZlTG9nc1RvU3RvcmFnZSgpO1xuICAgICAgICB9XG4gICAgfSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBzYXZlIGxvZ3NcIiwgZXJyKTtcbiAgICAgICAgaXNTYXZpbmcgPSBmYWxzZTtcbiAgICB9KTtcbn07XG5cbmNvbnN0IHNhdmVMb2dzVG9TdG9yYWdlID0gKCkgPT4ge1xuICAgIGlmIChzYXZlVGltZXIpIGNsZWFyVGltZW91dChzYXZlVGltZXIpO1xuICAgIHNhdmVUaW1lciA9IHNldFRpbWVvdXQoZG9TYXZlLCAxMDAwKTtcbn07XG5cbmxldCByZXNvbHZlTG9nZ2VyUmVhZHk6ICgpID0+IHZvaWQ7XG5leHBvcnQgY29uc3QgbG9nZ2VyUmVhZHkgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcbiAgICByZXNvbHZlTG9nZ2VyUmVhZHkgPSByZXNvbHZlO1xufSk7XG5cbmV4cG9ydCBjb25zdCBpbml0TG9nZ2VyID0gYXN5bmMgKCkgPT4ge1xuICAgIGlmIChpc1NlcnZpY2VXb3JrZXIgJiYgY2hyb21lPy5zdG9yYWdlPy5zZXNzaW9uKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjaHJvbWUuc3RvcmFnZS5zZXNzaW9uLmdldChTVE9SQUdFX0tFWSk7XG4gICAgICAgICAgICBpZiAocmVzdWx0W1NUT1JBR0VfS0VZXSAmJiBBcnJheS5pc0FycmF5KHJlc3VsdFtTVE9SQUdFX0tFWV0pKSB7XG4gICAgICAgICAgICAgICAgbG9ncyA9IHJlc3VsdFtTVE9SQUdFX0tFWV07XG4gICAgICAgICAgICAgICAgaWYgKGxvZ3MubGVuZ3RoID4gTUFYX0xPR1MpIGxvZ3MgPSBsb2dzLnNsaWNlKDAsIE1BWF9MT0dTKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byByZXN0b3JlIGxvZ3NcIiwgZSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKHJlc29sdmVMb2dnZXJSZWFkeSkgcmVzb2x2ZUxvZ2dlclJlYWR5KCk7XG59O1xuXG5leHBvcnQgY29uc3Qgc2V0TG9nZ2VyUHJlZmVyZW5jZXMgPSAocHJlZnM6IFByZWZlcmVuY2VzKSA9PiB7XG4gIGlmIChwcmVmcy5sb2dMZXZlbCkge1xuICAgIGN1cnJlbnRMZXZlbCA9IHByZWZzLmxvZ0xldmVsO1xuICB9IGVsc2UgaWYgKHByZWZzLmRlYnVnKSB7XG4gICAgY3VycmVudExldmVsID0gXCJkZWJ1Z1wiO1xuICB9IGVsc2Uge1xuICAgIGN1cnJlbnRMZXZlbCA9IFwiaW5mb1wiO1xuICB9XG59O1xuXG5jb25zdCBzaG91bGRMb2cgPSAobGV2ZWw6IExvZ0xldmVsKTogYm9vbGVhbiA9PiB7XG4gIHJldHVybiBMRVZFTF9QUklPUklUWVtsZXZlbF0gPj0gTEVWRUxfUFJJT1JJVFlbY3VycmVudExldmVsXTtcbn07XG5cbmNvbnN0IGZvcm1hdE1lc3NhZ2UgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgcmV0dXJuIGNvbnRleHQgPyBgJHttZXNzYWdlfSA6OiAke0pTT04uc3RyaW5naWZ5KGNvbnRleHQpfWAgOiBtZXNzYWdlO1xufTtcblxuY29uc3QgYWRkTG9nID0gKGxldmVsOiBMb2dMZXZlbCwgbWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgaWYgKHNob3VsZExvZyhsZXZlbCkpIHtcbiAgICAgIGNvbnN0IGVudHJ5OiBMb2dFbnRyeSA9IHtcbiAgICAgICAgICB0aW1lc3RhbXA6IERhdGUubm93KCksXG4gICAgICAgICAgbGV2ZWwsXG4gICAgICAgICAgbWVzc2FnZSxcbiAgICAgICAgICBjb250ZXh0XG4gICAgICB9O1xuXG4gICAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSB7XG4gICAgICAgICAgbG9ncy51bnNoaWZ0KGVudHJ5KTtcbiAgICAgICAgICBpZiAobG9ncy5sZW5ndGggPiBNQVhfTE9HUykge1xuICAgICAgICAgICAgICBsb2dzLnBvcCgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBzYXZlTG9nc1RvU3RvcmFnZSgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBJbiBvdGhlciBjb250ZXh0cywgc2VuZCB0byBTV1xuICAgICAgICAgIGlmIChjaHJvbWU/LnJ1bnRpbWU/LnNlbmRNZXNzYWdlKSB7XG4gICAgICAgICAgICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiAnbG9nRW50cnknLCBwYXlsb2FkOiBlbnRyeSB9KS5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgIC8vIElnbm9yZSBpZiBtZXNzYWdlIGZhaWxzIChlLmcuIGNvbnRleHQgaW52YWxpZGF0ZWQpXG4gICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgfVxuICB9XG59O1xuXG5leHBvcnQgY29uc3QgYWRkTG9nRW50cnkgPSAoZW50cnk6IExvZ0VudHJ5KSA9PiB7XG4gICAgaWYgKGlzU2VydmljZVdvcmtlcikge1xuICAgICAgICBsb2dzLnVuc2hpZnQoZW50cnkpO1xuICAgICAgICBpZiAobG9ncy5sZW5ndGggPiBNQVhfTE9HUykge1xuICAgICAgICAgICAgbG9ncy5wb3AoKTtcbiAgICAgICAgfVxuICAgICAgICBzYXZlTG9nc1RvU3RvcmFnZSgpO1xuICAgIH1cbn07XG5cbmV4cG9ydCBjb25zdCBnZXRMb2dzID0gKCkgPT4gWy4uLmxvZ3NdO1xuZXhwb3J0IGNvbnN0IGNsZWFyTG9ncyA9ICgpID0+IHtcbiAgICBsb2dzLmxlbmd0aCA9IDA7XG4gICAgaWYgKGlzU2VydmljZVdvcmtlcikgc2F2ZUxvZ3NUb1N0b3JhZ2UoKTtcbn07XG5cbmV4cG9ydCBjb25zdCBsb2dEZWJ1ZyA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBhZGRMb2coXCJkZWJ1Z1wiLCBtZXNzYWdlLCBjb250ZXh0KTtcbiAgaWYgKHNob3VsZExvZyhcImRlYnVnXCIpKSB7XG4gICAgY29uc29sZS5kZWJ1ZyhgJHtQUkVGSVh9IFtERUJVR10gJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nSW5mbyA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBhZGRMb2coXCJpbmZvXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwiaW5mb1wiKSkge1xuICAgIGNvbnNvbGUuaW5mbyhgJHtQUkVGSVh9IFtJTkZPXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgY29udGV4dCl9YCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBsb2dXYXJuID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcIndhcm5cIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJ3YXJuXCIpKSB7XG4gICAgY29uc29sZS53YXJuKGAke1BSRUZJWH0gW1dBUk5dICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0Vycm9yID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImVycm9yXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwiZXJyb3JcIikpIHtcbiAgICBjb25zb2xlLmVycm9yKGAke1BSRUZJWH0gW0VSUk9SXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgY29udGV4dCl9YCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBsb2dDcml0aWNhbCA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBhZGRMb2coXCJjcml0aWNhbFwiLCBtZXNzYWdlLCBjb250ZXh0KTtcbiAgaWYgKHNob3VsZExvZyhcImNyaXRpY2FsXCIpKSB7XG4gICAgLy8gQ3JpdGljYWwgbG9ncyB1c2UgZXJyb3IgY29uc29sZSBidXQgd2l0aCBkaXN0aW5jdCBwcmVmaXggYW5kIG1heWJlIHN0eWxpbmcgaWYgc3VwcG9ydGVkXG4gICAgY29uc29sZS5lcnJvcihgJHtQUkVGSVh9IFtDUklUSUNBTF0gXHVEODNEXHVERUE4ICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcbiIsICJpbXBvcnQgeyBQcmVmZXJlbmNlcywgU29ydGluZ1N0cmF0ZWd5LCBUYWJNZXRhZGF0YSB9IGZyb20gXCIuL3R5cGVzLmpzXCI7XG5cbmV4cG9ydCBjb25zdCBtYXBDaHJvbWVUYWIgPSAodGFiOiBjaHJvbWUudGFicy5UYWIpOiBUYWJNZXRhZGF0YSB8IG51bGwgPT4ge1xuICBpZiAoIXRhYi5pZCB8fCB0YWIuaWQgPT09IGNocm9tZS50YWJzLlRBQl9JRF9OT05FIHx8ICF0YWIud2luZG93SWQpIHJldHVybiBudWxsO1xuICByZXR1cm4ge1xuICAgIGlkOiB0YWIuaWQsXG4gICAgd2luZG93SWQ6IHRhYi53aW5kb3dJZCxcbiAgICB0aXRsZTogdGFiLnRpdGxlIHx8IFwiVW50aXRsZWRcIixcbiAgICB1cmw6IHRhYi5wZW5kaW5nVXJsIHx8IHRhYi51cmwgfHwgXCJhYm91dDpibGFua1wiLFxuICAgIHBpbm5lZDogQm9vbGVhbih0YWIucGlubmVkKSxcbiAgICBsYXN0QWNjZXNzZWQ6IHRhYi5sYXN0QWNjZXNzZWQsXG4gICAgb3BlbmVyVGFiSWQ6IHRhYi5vcGVuZXJUYWJJZCA/PyB1bmRlZmluZWQsXG4gICAgZmF2SWNvblVybDogdGFiLmZhdkljb25VcmwsXG4gICAgZ3JvdXBJZDogdGFiLmdyb3VwSWQsXG4gICAgaW5kZXg6IHRhYi5pbmRleCxcbiAgICBhY3RpdmU6IHRhYi5hY3RpdmUsXG4gICAgc3RhdHVzOiB0YWIuc3RhdHVzLFxuICAgIHNlbGVjdGVkOiB0YWIuaGlnaGxpZ2h0ZWRcbiAgfTtcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRTdG9yZWRQcmVmZXJlbmNlcyA9IGFzeW5jICgpOiBQcm9taXNlPFByZWZlcmVuY2VzIHwgbnVsbD4gPT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoXCJwcmVmZXJlbmNlc1wiLCAoaXRlbXMpID0+IHtcbiAgICAgIHJlc29sdmUoKGl0ZW1zW1wicHJlZmVyZW5jZXNcIl0gYXMgUHJlZmVyZW5jZXMpID8/IG51bGwpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBhc0FycmF5ID0gPFQ+KHZhbHVlOiB1bmtub3duKTogVFtdID0+IHtcbiAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHJldHVybiB2YWx1ZSBhcyBUW107XG4gICAgcmV0dXJuIFtdO1xufTtcblxuZXhwb3J0IGZ1bmN0aW9uIGVzY2FwZUh0bWwodGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgaWYgKCF0ZXh0KSByZXR1cm4gJyc7XG4gIHJldHVybiB0ZXh0XG4gICAgLnJlcGxhY2UoLyYvZywgJyZhbXA7JylcbiAgICAucmVwbGFjZSgvPC9nLCAnJmx0OycpXG4gICAgLnJlcGxhY2UoLz4vZywgJyZndDsnKVxuICAgIC5yZXBsYWNlKC9cIi9nLCAnJnF1b3Q7JylcbiAgICAucmVwbGFjZSgvJy9nLCAnJiMwMzk7Jyk7XG59XG4iLCAiaW1wb3J0IHsgR3JvdXBpbmdTdHJhdGVneSwgU29ydGluZ1N0cmF0ZWd5LCBUYWJHcm91cCwgVGFiTWV0YWRhdGEsIEN1c3RvbVN0cmF0ZWd5LCBTdHJhdGVneVJ1bGUsIFJ1bGVDb25kaXRpb24sIEdyb3VwaW5nUnVsZSwgU29ydGluZ1J1bGUgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBnZXRTdHJhdGVnaWVzIH0gZnJvbSBcIi4uL3NoYXJlZC9zdHJhdGVneVJlZ2lzdHJ5LmpzXCI7XG5pbXBvcnQgeyBsb2dEZWJ1ZyB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBhc0FycmF5IH0gZnJvbSBcIi4uL3NoYXJlZC91dGlscy5qc1wiO1xuXG5sZXQgY3VzdG9tU3RyYXRlZ2llczogQ3VzdG9tU3RyYXRlZ3lbXSA9IFtdO1xuXG5leHBvcnQgY29uc3Qgc2V0Q3VzdG9tU3RyYXRlZ2llcyA9IChzdHJhdGVnaWVzOiBDdXN0b21TdHJhdGVneVtdKSA9PiB7XG4gICAgY3VzdG9tU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXM7XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0Q3VzdG9tU3RyYXRlZ2llcyA9ICgpOiBDdXN0b21TdHJhdGVneVtdID0+IGN1c3RvbVN0cmF0ZWdpZXM7XG5cbmNvbnN0IENPTE9SUyA9IFtcImdyZXlcIiwgXCJibHVlXCIsIFwicmVkXCIsIFwieWVsbG93XCIsIFwiZ3JlZW5cIiwgXCJwaW5rXCIsIFwicHVycGxlXCIsIFwiY3lhblwiLCBcIm9yYW5nZVwiXTtcblxuY29uc3QgcmVnZXhDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBSZWdFeHA+KCk7XG5jb25zdCBkb21haW5DYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5jb25zdCBzdWJkb21haW5DYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5jb25zdCBNQVhfQ0FDSEVfU0laRSA9IDEwMDA7XG5cbmV4cG9ydCBjb25zdCBkb21haW5Gcm9tVXJsID0gKHVybDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgaWYgKGRvbWFpbkNhY2hlLmhhcyh1cmwpKSByZXR1cm4gZG9tYWluQ2FjaGUuZ2V0KHVybCkhO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgcGFyc2VkID0gbmV3IFVSTCh1cmwpO1xuICAgIGNvbnN0IGRvbWFpbiA9IHBhcnNlZC5ob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgXCJcIik7XG5cbiAgICBpZiAoZG9tYWluQ2FjaGUuc2l6ZSA+PSBNQVhfQ0FDSEVfU0laRSkgZG9tYWluQ2FjaGUuY2xlYXIoKTtcbiAgICBkb21haW5DYWNoZS5zZXQodXJsLCBkb21haW4pO1xuXG4gICAgcmV0dXJuIGRvbWFpbjtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBsb2dEZWJ1ZyhcIkZhaWxlZCB0byBwYXJzZSBkb21haW5cIiwgeyB1cmwsIGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICAgIHJldHVybiBcInVua25vd25cIjtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IHN1YmRvbWFpbkZyb21VcmwgPSAodXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgIGlmIChzdWJkb21haW5DYWNoZS5oYXModXJsKSkgcmV0dXJuIHN1YmRvbWFpbkNhY2hlLmdldCh1cmwpITtcblxuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHBhcnNlZCA9IG5ldyBVUkwodXJsKTtcbiAgICAgICAgbGV0IGhvc3RuYW1lID0gcGFyc2VkLmhvc3RuYW1lO1xuICAgICAgICAvLyBSZW1vdmUgd3d3LlxuICAgICAgICBob3N0bmFtZSA9IGhvc3RuYW1lLnJlcGxhY2UoL153d3dcXC4vLCBcIlwiKTtcblxuICAgICAgICBsZXQgcmVzdWx0ID0gXCJcIjtcbiAgICAgICAgY29uc3QgcGFydHMgPSBob3N0bmFtZS5zcGxpdCgnLicpO1xuICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMikge1xuICAgICAgICAgICAgIHJlc3VsdCA9IHBhcnRzLnNsaWNlKDAsIHBhcnRzLmxlbmd0aCAtIDIpLmpvaW4oJy4nKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdWJkb21haW5DYWNoZS5zaXplID49IE1BWF9DQUNIRV9TSVpFKSBzdWJkb21haW5DYWNoZS5jbGVhcigpO1xuICAgICAgICBzdWJkb21haW5DYWNoZS5zZXQodXJsLCByZXN1bHQpO1xuXG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBcIlwiO1xuICAgIH1cbn1cblxuY29uc3QgZ2V0TmVzdGVkUHJvcGVydHkgPSAob2JqOiB1bmtub3duLCBwYXRoOiBzdHJpbmcpOiB1bmtub3duID0+IHtcbiAgICBpZiAoIW9iaiB8fCB0eXBlb2Ygb2JqICE9PSAnb2JqZWN0JykgcmV0dXJuIHVuZGVmaW5lZDtcblxuICAgIGlmICghcGF0aC5pbmNsdWRlcygnLicpKSB7XG4gICAgICAgIHJldHVybiAob2JqIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtwYXRoXTtcbiAgICB9XG5cbiAgICBjb25zdCBwYXJ0cyA9IHBhdGguc3BsaXQoJy4nKTtcbiAgICBsZXQgY3VycmVudDogdW5rbm93biA9IG9iajtcblxuICAgIGZvciAoY29uc3Qga2V5IG9mIHBhcnRzKSB7XG4gICAgICAgIGlmICghY3VycmVudCB8fCB0eXBlb2YgY3VycmVudCAhPT0gJ29iamVjdCcpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIGN1cnJlbnQgPSAoY3VycmVudCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilba2V5XTtcbiAgICB9XG5cbiAgICByZXR1cm4gY3VycmVudDtcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRGaWVsZFZhbHVlID0gKHRhYjogVGFiTWV0YWRhdGEsIGZpZWxkOiBzdHJpbmcpOiBhbnkgPT4ge1xuICAgIHN3aXRjaChmaWVsZCkge1xuICAgICAgICBjYXNlICdpZCc6IHJldHVybiB0YWIuaWQ7XG4gICAgICAgIGNhc2UgJ2luZGV4JzogcmV0dXJuIHRhYi5pbmRleDtcbiAgICAgICAgY2FzZSAnd2luZG93SWQnOiByZXR1cm4gdGFiLndpbmRvd0lkO1xuICAgICAgICBjYXNlICdncm91cElkJzogcmV0dXJuIHRhYi5ncm91cElkO1xuICAgICAgICBjYXNlICd0aXRsZSc6IHJldHVybiB0YWIudGl0bGU7XG4gICAgICAgIGNhc2UgJ3VybCc6IHJldHVybiB0YWIudXJsO1xuICAgICAgICBjYXNlICdzdGF0dXMnOiByZXR1cm4gdGFiLnN0YXR1cztcbiAgICAgICAgY2FzZSAnYWN0aXZlJzogcmV0dXJuIHRhYi5hY3RpdmU7XG4gICAgICAgIGNhc2UgJ3NlbGVjdGVkJzogcmV0dXJuIHRhYi5zZWxlY3RlZDtcbiAgICAgICAgY2FzZSAncGlubmVkJzogcmV0dXJuIHRhYi5waW5uZWQ7XG4gICAgICAgIGNhc2UgJ29wZW5lclRhYklkJzogcmV0dXJuIHRhYi5vcGVuZXJUYWJJZDtcbiAgICAgICAgY2FzZSAnbGFzdEFjY2Vzc2VkJzogcmV0dXJuIHRhYi5sYXN0QWNjZXNzZWQ7XG4gICAgICAgIGNhc2UgJ2NvbnRleHQnOiByZXR1cm4gdGFiLmNvbnRleHQ7XG4gICAgICAgIGNhc2UgJ2dlbnJlJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uZ2VucmU7XG4gICAgICAgIGNhc2UgJ3NpdGVOYW1lJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uc2l0ZU5hbWU7XG4gICAgICAgIC8vIERlcml2ZWQgb3IgbWFwcGVkIGZpZWxkc1xuICAgICAgICBjYXNlICdkb21haW4nOiByZXR1cm4gZG9tYWluRnJvbVVybCh0YWIudXJsKTtcbiAgICAgICAgY2FzZSAnc3ViZG9tYWluJzogcmV0dXJuIHN1YmRvbWFpbkZyb21VcmwodGFiLnVybCk7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICByZXR1cm4gZ2V0TmVzdGVkUHJvcGVydHkodGFiLCBmaWVsZCk7XG4gICAgfVxufTtcblxuY29uc3Qgc3RyaXBUbGQgPSAoZG9tYWluOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gZG9tYWluLnJlcGxhY2UoL1xcLihjb218b3JnfGdvdnxuZXR8ZWR1fGlvKSQvaSwgXCJcIik7XG59O1xuXG5leHBvcnQgY29uc3Qgc2VtYW50aWNCdWNrZXQgPSAodGl0bGU6IHN0cmluZywgdXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBrZXkgPSBgJHt0aXRsZX0gJHt1cmx9YC50b0xvd2VyQ2FzZSgpO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiZG9jXCIpIHx8IGtleS5pbmNsdWRlcyhcInJlYWRtZVwiKSB8fCBrZXkuaW5jbHVkZXMoXCJndWlkZVwiKSkgcmV0dXJuIFwiRG9jc1wiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwibWFpbFwiKSB8fCBrZXkuaW5jbHVkZXMoXCJpbmJveFwiKSkgcmV0dXJuIFwiQ2hhdFwiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiZGFzaGJvYXJkXCIpIHx8IGtleS5pbmNsdWRlcyhcImNvbnNvbGVcIikpIHJldHVybiBcIkRhc2hcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImlzc3VlXCIpIHx8IGtleS5pbmNsdWRlcyhcInRpY2tldFwiKSkgcmV0dXJuIFwiVGFza3NcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImRyaXZlXCIpIHx8IGtleS5pbmNsdWRlcyhcInN0b3JhZ2VcIikpIHJldHVybiBcIkZpbGVzXCI7XG4gIHJldHVybiBcIk1pc2NcIjtcbn07XG5cbmV4cG9ydCBjb25zdCBuYXZpZ2F0aW9uS2V5ID0gKHRhYjogVGFiTWV0YWRhdGEpOiBzdHJpbmcgPT4ge1xuICBpZiAodGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gYGNoaWxkLW9mLSR7dGFiLm9wZW5lclRhYklkfWA7XG4gIH1cbiAgcmV0dXJuIGB3aW5kb3ctJHt0YWIud2luZG93SWR9YDtcbn07XG5cbmNvbnN0IGdldFJlY2VuY3lMYWJlbCA9IChsYXN0QWNjZXNzZWQ6IG51bWJlcik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gIGNvbnN0IGRpZmYgPSBub3cgLSBsYXN0QWNjZXNzZWQ7XG4gIGlmIChkaWZmIDwgMzYwMDAwMCkgcmV0dXJuIFwiSnVzdCBub3dcIjsgLy8gMWhcbiAgaWYgKGRpZmYgPCA4NjQwMDAwMCkgcmV0dXJuIFwiVG9kYXlcIjsgLy8gMjRoXG4gIGlmIChkaWZmIDwgMTcyODAwMDAwKSByZXR1cm4gXCJZZXN0ZXJkYXlcIjsgLy8gNDhoXG4gIGlmIChkaWZmIDwgNjA0ODAwMDAwKSByZXR1cm4gXCJUaGlzIFdlZWtcIjsgLy8gN2RcbiAgcmV0dXJuIFwiT2xkZXJcIjtcbn07XG5cbmNvbnN0IGNvbG9yRm9yS2V5ID0gKGtleTogc3RyaW5nLCBvZmZzZXQ6IG51bWJlcik6IHN0cmluZyA9PiBDT0xPUlNbKE1hdGguYWJzKGhhc2hDb2RlKGtleSkpICsgb2Zmc2V0KSAlIENPTE9SUy5sZW5ndGhdO1xuXG5jb25zdCBoYXNoQ29kZSA9ICh2YWx1ZTogc3RyaW5nKTogbnVtYmVyID0+IHtcbiAgbGV0IGhhc2ggPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHZhbHVlLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgaGFzaCA9IChoYXNoIDw8IDUpIC0gaGFzaCArIHZhbHVlLmNoYXJDb2RlQXQoaSk7XG4gICAgaGFzaCB8PSAwO1xuICB9XG4gIHJldHVybiBoYXNoO1xufTtcblxuLy8gSGVscGVyIHRvIGdldCBhIGh1bWFuLXJlYWRhYmxlIGxhYmVsIGNvbXBvbmVudCBmcm9tIGEgc3RyYXRlZ3kgYW5kIGEgc2V0IG9mIHRhYnNcbmNvbnN0IGdldExhYmVsQ29tcG9uZW50ID0gKHN0cmF0ZWd5OiBHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nLCB0YWJzOiBUYWJNZXRhZGF0YVtdLCBhbGxUYWJzTWFwOiBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YT4pOiBzdHJpbmcgfCBudWxsID0+IHtcbiAgY29uc3QgZmlyc3RUYWIgPSB0YWJzWzBdO1xuICBpZiAoIWZpcnN0VGFiKSByZXR1cm4gXCJVbmtub3duXCI7XG5cbiAgLy8gQ2hlY2sgY3VzdG9tIHN0cmF0ZWdpZXMgZmlyc3RcbiAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3kpO1xuICBpZiAoY3VzdG9tKSB7XG4gICAgICByZXR1cm4gZ3JvdXBpbmdLZXkoZmlyc3RUYWIsIHN0cmF0ZWd5KTtcbiAgfVxuXG4gIHN3aXRjaCAoc3RyYXRlZ3kpIHtcbiAgICBjYXNlIFwiZG9tYWluXCI6IHtcbiAgICAgIGNvbnN0IHNpdGVOYW1lcyA9IG5ldyBTZXQodGFicy5tYXAodCA9PiB0LmNvbnRleHREYXRhPy5zaXRlTmFtZSkuZmlsdGVyKEJvb2xlYW4pKTtcbiAgICAgIGlmIChzaXRlTmFtZXMuc2l6ZSA9PT0gMSkge1xuICAgICAgICByZXR1cm4gc3RyaXBUbGQoQXJyYXkuZnJvbShzaXRlTmFtZXMpWzBdIGFzIHN0cmluZyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gc3RyaXBUbGQoZG9tYWluRnJvbVVybChmaXJzdFRhYi51cmwpKTtcbiAgICB9XG4gICAgY2FzZSBcImRvbWFpbl9mdWxsXCI6XG4gICAgICByZXR1cm4gZG9tYWluRnJvbVVybChmaXJzdFRhYi51cmwpO1xuICAgIGNhc2UgXCJ0b3BpY1wiOlxuICAgICAgcmV0dXJuIHNlbWFudGljQnVja2V0KGZpcnN0VGFiLnRpdGxlLCBmaXJzdFRhYi51cmwpO1xuICAgIGNhc2UgXCJsaW5lYWdlXCI6XG4gICAgICBpZiAoZmlyc3RUYWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBjb25zdCBwYXJlbnQgPSBhbGxUYWJzTWFwLmdldChmaXJzdFRhYi5vcGVuZXJUYWJJZCk7XG4gICAgICAgIGlmIChwYXJlbnQpIHtcbiAgICAgICAgICBjb25zdCBwYXJlbnRUaXRsZSA9IHBhcmVudC50aXRsZS5sZW5ndGggPiAyMCA/IHBhcmVudC50aXRsZS5zdWJzdHJpbmcoMCwgMjApICsgXCIuLi5cIiA6IHBhcmVudC50aXRsZTtcbiAgICAgICAgICByZXR1cm4gYEZyb206ICR7cGFyZW50VGl0bGV9YDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYEZyb206IFRhYiAke2ZpcnN0VGFiLm9wZW5lclRhYklkfWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYFdpbmRvdyAke2ZpcnN0VGFiLndpbmRvd0lkfWA7XG4gICAgY2FzZSBcImNvbnRleHRcIjpcbiAgICAgIHJldHVybiBmaXJzdFRhYi5jb250ZXh0IHx8IFwiVW5jYXRlZ29yaXplZFwiO1xuICAgIGNhc2UgXCJwaW5uZWRcIjpcbiAgICAgIHJldHVybiBmaXJzdFRhYi5waW5uZWQgPyBcIlBpbm5lZFwiIDogXCJVbnBpbm5lZFwiO1xuICAgIGNhc2UgXCJhZ2VcIjpcbiAgICAgIHJldHVybiBnZXRSZWNlbmN5TGFiZWwoZmlyc3RUYWIubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgIGNhc2UgXCJ1cmxcIjpcbiAgICAgIHJldHVybiBcIlVSTCBHcm91cFwiO1xuICAgIGNhc2UgXCJyZWNlbmN5XCI6XG4gICAgICByZXR1cm4gXCJUaW1lIEdyb3VwXCI7XG4gICAgY2FzZSBcIm5lc3RpbmdcIjpcbiAgICAgIHJldHVybiBmaXJzdFRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkID8gXCJDaGlsZHJlblwiIDogXCJSb290c1wiO1xuICAgIGRlZmF1bHQ6XG4gICAgICBjb25zdCB2YWwgPSBnZXRGaWVsZFZhbHVlKGZpcnN0VGFiLCBzdHJhdGVneSk7XG4gICAgICBpZiAodmFsICE9PSB1bmRlZmluZWQgJiYgdmFsICE9PSBudWxsKSB7XG4gICAgICAgICAgcmV0dXJuIFN0cmluZyh2YWwpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIFwiVW5rbm93blwiO1xuICB9XG59O1xuXG5jb25zdCBnZW5lcmF0ZUxhYmVsID0gKFxuICBzdHJhdGVnaWVzOiAoR3JvdXBpbmdTdHJhdGVneSB8IHN0cmluZylbXSxcbiAgdGFiczogVGFiTWV0YWRhdGFbXSxcbiAgYWxsVGFic01hcDogTWFwPG51bWJlciwgVGFiTWV0YWRhdGE+XG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBsYWJlbHMgPSBzdHJhdGVnaWVzXG4gICAgLm1hcChzID0+IGdldExhYmVsQ29tcG9uZW50KHMsIHRhYnMsIGFsbFRhYnNNYXApKVxuICAgIC5maWx0ZXIobCA9PiBsICYmIGwgIT09IFwiVW5rbm93blwiICYmIGwgIT09IFwiR3JvdXBcIiAmJiBsICE9PSBcIlVSTCBHcm91cFwiICYmIGwgIT09IFwiVGltZSBHcm91cFwiICYmIGwgIT09IFwiTWlzY1wiKTtcblxuICBpZiAobGFiZWxzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIFwiR3JvdXBcIjtcbiAgcmV0dXJuIEFycmF5LmZyb20obmV3IFNldChsYWJlbHMpKS5qb2luKFwiIC0gXCIpO1xufTtcblxuY29uc3QgZ2V0U3RyYXRlZ3lDb2xvclJ1bGUgPSAoc3RyYXRlZ3lJZDogc3RyaW5nKTogR3JvdXBpbmdSdWxlIHwgdW5kZWZpbmVkID0+IHtcbiAgICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneUlkKTtcbiAgICBpZiAoIWN1c3RvbSkgcmV0dXJuIHVuZGVmaW5lZDtcblxuICAgIGNvbnN0IGdyb3VwaW5nUnVsZXNMaXN0ID0gYXNBcnJheTxHcm91cGluZ1J1bGU+KGN1c3RvbS5ncm91cGluZ1J1bGVzKTtcbiAgICAvLyBJdGVyYXRlIG1hbnVhbGx5IHRvIGNoZWNrIGNvbG9yXG4gICAgZm9yIChsZXQgaSA9IGdyb3VwaW5nUnVsZXNMaXN0Lmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgIGNvbnN0IHJ1bGUgPSBncm91cGluZ1J1bGVzTGlzdFtpXTtcbiAgICAgICAgaWYgKHJ1bGUgJiYgcnVsZS5jb2xvciAmJiBydWxlLmNvbG9yICE9PSAncmFuZG9tJykge1xuICAgICAgICAgICAgcmV0dXJuIHJ1bGU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbn07XG5cbmNvbnN0IHJlc29sdmVXaW5kb3dNb2RlID0gKG1vZGVzOiAoc3RyaW5nIHwgdW5kZWZpbmVkKVtdKTogXCJjdXJyZW50XCIgfCBcIm5ld1wiIHwgXCJjb21wb3VuZFwiID0+IHtcbiAgICBpZiAobW9kZXMuaW5jbHVkZXMoXCJuZXdcIikpIHJldHVybiBcIm5ld1wiO1xuICAgIGlmIChtb2Rlcy5pbmNsdWRlcyhcImNvbXBvdW5kXCIpKSByZXR1cm4gXCJjb21wb3VuZFwiO1xuICAgIHJldHVybiBcImN1cnJlbnRcIjtcbn07XG5cbmV4cG9ydCBjb25zdCBncm91cFRhYnMgPSAoXG4gIHRhYnM6IFRhYk1ldGFkYXRhW10sXG4gIHN0cmF0ZWdpZXM6IChTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmcpW11cbik6IFRhYkdyb3VwW10gPT4ge1xuICBjb25zdCBhdmFpbGFibGVTdHJhdGVnaWVzID0gZ2V0U3RyYXRlZ2llcyhjdXN0b21TdHJhdGVnaWVzKTtcbiAgY29uc3QgZWZmZWN0aXZlU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gYXZhaWxhYmxlU3RyYXRlZ2llcy5maW5kKGF2YWlsID0+IGF2YWlsLmlkID09PSBzKT8uaXNHcm91cGluZyk7XG4gIGNvbnN0IGJ1Y2tldHMgPSBuZXcgTWFwPHN0cmluZywgVGFiR3JvdXA+KCk7XG5cbiAgY29uc3QgYWxsVGFic01hcCA9IG5ldyBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YT4oKTtcbiAgdGFicy5mb3JFYWNoKHQgPT4gYWxsVGFic01hcC5zZXQodC5pZCwgdCkpO1xuXG4gIHRhYnMuZm9yRWFjaCgodGFiKSA9PiB7XG4gICAgbGV0IGtleXM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgYXBwbGllZFN0cmF0ZWdpZXM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgY29sbGVjdGVkTW9kZXM6IHN0cmluZ1tdID0gW107XG5cbiAgICB0cnkge1xuICAgICAgICBmb3IgKGNvbnN0IHMgb2YgZWZmZWN0aXZlU3RyYXRlZ2llcykge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gZ2V0R3JvdXBpbmdSZXN1bHQodGFiLCBzKTtcbiAgICAgICAgICAgIGlmIChyZXN1bHQua2V5ICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAga2V5cy5wdXNoKGAke3N9OiR7cmVzdWx0LmtleX1gKTtcbiAgICAgICAgICAgICAgICBhcHBsaWVkU3RyYXRlZ2llcy5wdXNoKHMpO1xuICAgICAgICAgICAgICAgIGNvbGxlY3RlZE1vZGVzLnB1c2gocmVzdWx0Lm1vZGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGdlbmVyYXRpbmcgZ3JvdXBpbmcga2V5XCIsIHsgdGFiSWQ6IHRhYi5pZCwgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgcmV0dXJuOyAvLyBTa2lwIHRoaXMgdGFiIG9uIGVycm9yXG4gICAgfVxuXG4gICAgLy8gSWYgbm8gc3RyYXRlZ2llcyBhcHBsaWVkIChlLmcuIGFsbCBmaWx0ZXJlZCBvdXQpLCBza2lwIGdyb3VwaW5nIGZvciB0aGlzIHRhYlxuICAgIGlmIChrZXlzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgZWZmZWN0aXZlTW9kZSA9IHJlc29sdmVXaW5kb3dNb2RlKGNvbGxlY3RlZE1vZGVzKTtcbiAgICBjb25zdCB2YWx1ZUtleSA9IGtleXMuam9pbihcIjo6XCIpO1xuICAgIGxldCBidWNrZXRLZXkgPSBcIlwiO1xuICAgIGlmIChlZmZlY3RpdmVNb2RlID09PSAnY3VycmVudCcpIHtcbiAgICAgICAgIGJ1Y2tldEtleSA9IGB3aW5kb3ctJHt0YWIud2luZG93SWR9OjpgICsgdmFsdWVLZXk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgIGJ1Y2tldEtleSA9IGBnbG9iYWw6OmAgKyB2YWx1ZUtleTtcbiAgICB9XG5cbiAgICBsZXQgZ3JvdXAgPSBidWNrZXRzLmdldChidWNrZXRLZXkpO1xuICAgIGlmICghZ3JvdXApIHtcbiAgICAgIGxldCBncm91cENvbG9yID0gbnVsbDtcbiAgICAgIGxldCBjb2xvckZpZWxkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICBsZXQgY29sb3JUcmFuc2Zvcm06IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgIGxldCBjb2xvclRyYW5zZm9ybVBhdHRlcm46IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICAgICAgZm9yIChjb25zdCBzSWQgb2YgYXBwbGllZFN0cmF0ZWdpZXMpIHtcbiAgICAgICAgY29uc3QgcnVsZSA9IGdldFN0cmF0ZWd5Q29sb3JSdWxlKHNJZCk7XG4gICAgICAgIGlmIChydWxlKSB7XG4gICAgICAgICAgICBncm91cENvbG9yID0gcnVsZS5jb2xvcjtcbiAgICAgICAgICAgIGNvbG9yRmllbGQgPSBydWxlLmNvbG9yRmllbGQ7XG4gICAgICAgICAgICBjb2xvclRyYW5zZm9ybSA9IHJ1bGUuY29sb3JUcmFuc2Zvcm07XG4gICAgICAgICAgICBjb2xvclRyYW5zZm9ybVBhdHRlcm4gPSBydWxlLmNvbG9yVHJhbnNmb3JtUGF0dGVybjtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChncm91cENvbG9yID09PSAnbWF0Y2gnKSB7XG4gICAgICAgIGdyb3VwQ29sb3IgPSBjb2xvckZvcktleSh2YWx1ZUtleSwgMCk7XG4gICAgICB9IGVsc2UgaWYgKGdyb3VwQ29sb3IgPT09ICdmaWVsZCcgJiYgY29sb3JGaWVsZCkge1xuICAgICAgICBjb25zdCB2YWwgPSBnZXRGaWVsZFZhbHVlKHRhYiwgY29sb3JGaWVsZCk7XG4gICAgICAgIGxldCBrZXkgPSB2YWwgIT09IHVuZGVmaW5lZCAmJiB2YWwgIT09IG51bGwgPyBTdHJpbmcodmFsKSA6IFwiXCI7XG4gICAgICAgIGlmIChjb2xvclRyYW5zZm9ybSkge1xuICAgICAgICAgICAga2V5ID0gYXBwbHlWYWx1ZVRyYW5zZm9ybShrZXksIGNvbG9yVHJhbnNmb3JtLCBjb2xvclRyYW5zZm9ybVBhdHRlcm4pO1xuICAgICAgICB9XG4gICAgICAgIGdyb3VwQ29sb3IgPSBjb2xvckZvcktleShrZXksIDApO1xuICAgICAgfSBlbHNlIGlmICghZ3JvdXBDb2xvciB8fCBncm91cENvbG9yID09PSAnZmllbGQnKSB7XG4gICAgICAgIGdyb3VwQ29sb3IgPSBjb2xvckZvcktleShidWNrZXRLZXksIGJ1Y2tldHMuc2l6ZSk7XG4gICAgICB9XG5cbiAgICAgIGdyb3VwID0ge1xuICAgICAgICBpZDogYnVja2V0S2V5LFxuICAgICAgICB3aW5kb3dJZDogdGFiLndpbmRvd0lkLFxuICAgICAgICBsYWJlbDogXCJcIixcbiAgICAgICAgY29sb3I6IGdyb3VwQ29sb3IsXG4gICAgICAgIHRhYnM6IFtdLFxuICAgICAgICByZWFzb246IGFwcGxpZWRTdHJhdGVnaWVzLmpvaW4oXCIgKyBcIiksXG4gICAgICAgIHdpbmRvd01vZGU6IGVmZmVjdGl2ZU1vZGVcbiAgICAgIH07XG4gICAgICBidWNrZXRzLnNldChidWNrZXRLZXksIGdyb3VwKTtcbiAgICB9XG4gICAgZ3JvdXAudGFicy5wdXNoKHRhYik7XG4gIH0pO1xuXG4gIGNvbnN0IGdyb3VwcyA9IEFycmF5LmZyb20oYnVja2V0cy52YWx1ZXMoKSk7XG4gIGdyb3Vwcy5mb3JFYWNoKGdyb3VwID0+IHtcbiAgICBncm91cC5sYWJlbCA9IGdlbmVyYXRlTGFiZWwoZWZmZWN0aXZlU3RyYXRlZ2llcywgZ3JvdXAudGFicywgYWxsVGFic01hcCk7XG4gIH0pO1xuXG4gIHJldHVybiBncm91cHM7XG59O1xuXG5jb25zdCBjaGVja1ZhbHVlTWF0Y2ggPSAoXG4gICAgb3BlcmF0b3I6IHN0cmluZyxcbiAgICByYXdWYWx1ZTogYW55LFxuICAgIHJ1bGVWYWx1ZTogc3RyaW5nXG4pOiB7IGlzTWF0Y2g6IGJvb2xlYW47IG1hdGNoT2JqOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsIH0gPT4ge1xuICAgIGNvbnN0IHZhbHVlU3RyID0gcmF3VmFsdWUgIT09IHVuZGVmaW5lZCAmJiByYXdWYWx1ZSAhPT0gbnVsbCA/IFN0cmluZyhyYXdWYWx1ZSkgOiBcIlwiO1xuICAgIGNvbnN0IHZhbHVlVG9DaGVjayA9IHZhbHVlU3RyLnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3QgcGF0dGVyblRvQ2hlY2sgPSBydWxlVmFsdWUgPyBydWxlVmFsdWUudG9Mb3dlckNhc2UoKSA6IFwiXCI7XG5cbiAgICBsZXQgaXNNYXRjaCA9IGZhbHNlO1xuICAgIGxldCBtYXRjaE9iajogUmVnRXhwRXhlY0FycmF5IHwgbnVsbCA9IG51bGw7XG5cbiAgICBzd2l0Y2ggKG9wZXJhdG9yKSB7XG4gICAgICAgIGNhc2UgJ2NvbnRhaW5zJzogaXNNYXRjaCA9IHZhbHVlVG9DaGVjay5pbmNsdWRlcyhwYXR0ZXJuVG9DaGVjayk7IGJyZWFrO1xuICAgICAgICBjYXNlICdkb2VzTm90Q29udGFpbic6IGlzTWF0Y2ggPSAhdmFsdWVUb0NoZWNrLmluY2x1ZGVzKHBhdHRlcm5Ub0NoZWNrKTsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2VxdWFscyc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2sgPT09IHBhdHRlcm5Ub0NoZWNrOyBicmVhaztcbiAgICAgICAgY2FzZSAnc3RhcnRzV2l0aCc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suc3RhcnRzV2l0aChwYXR0ZXJuVG9DaGVjayk7IGJyZWFrO1xuICAgICAgICBjYXNlICdlbmRzV2l0aCc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suZW5kc1dpdGgocGF0dGVyblRvQ2hlY2spOyBicmVhaztcbiAgICAgICAgY2FzZSAnZXhpc3RzJzogaXNNYXRjaCA9IHJhd1ZhbHVlICE9PSB1bmRlZmluZWQ7IGJyZWFrO1xuICAgICAgICBjYXNlICdkb2VzTm90RXhpc3QnOiBpc01hdGNoID0gcmF3VmFsdWUgPT09IHVuZGVmaW5lZDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2lzTnVsbCc6IGlzTWF0Y2ggPSByYXdWYWx1ZSA9PT0gbnVsbDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2lzTm90TnVsbCc6IGlzTWF0Y2ggPSByYXdWYWx1ZSAhPT0gbnVsbDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ21hdGNoZXMnOlxuICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKHJ1bGVWYWx1ZSwgJ2knKTtcbiAgICAgICAgICAgICAgICBtYXRjaE9iaiA9IHJlZ2V4LmV4ZWModmFsdWVTdHIpO1xuICAgICAgICAgICAgICAgIGlzTWF0Y2ggPSAhIW1hdGNoT2JqO1xuICAgICAgICAgICAgIH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHJldHVybiB7IGlzTWF0Y2gsIG1hdGNoT2JqIH07XG59O1xuXG5leHBvcnQgY29uc3QgY2hlY2tDb25kaXRpb24gPSAoY29uZGl0aW9uOiBSdWxlQ29uZGl0aW9uLCB0YWI6IFRhYk1ldGFkYXRhKTogYm9vbGVhbiA9PiB7XG4gICAgaWYgKCFjb25kaXRpb24pIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCByYXdWYWx1ZSA9IGdldEZpZWxkVmFsdWUodGFiLCBjb25kaXRpb24uZmllbGQpO1xuICAgIGNvbnN0IHsgaXNNYXRjaCB9ID0gY2hlY2tWYWx1ZU1hdGNoKGNvbmRpdGlvbi5vcGVyYXRvciwgcmF3VmFsdWUsIGNvbmRpdGlvbi52YWx1ZSk7XG4gICAgcmV0dXJuIGlzTWF0Y2g7XG59O1xuXG5leHBvcnQgY29uc3QgYXBwbHlWYWx1ZVRyYW5zZm9ybSA9ICh2YWw6IHN0cmluZywgdHJhbnNmb3JtOiBzdHJpbmcsIHBhdHRlcm4/OiBzdHJpbmcsIHJlcGxhY2VtZW50Pzogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICBpZiAoIXZhbCB8fCAhdHJhbnNmb3JtIHx8IHRyYW5zZm9ybSA9PT0gJ25vbmUnKSByZXR1cm4gdmFsO1xuXG4gICAgc3dpdGNoICh0cmFuc2Zvcm0pIHtcbiAgICAgICAgY2FzZSAnc3RyaXBUbGQnOlxuICAgICAgICAgICAgcmV0dXJuIHN0cmlwVGxkKHZhbCk7XG4gICAgICAgIGNhc2UgJ2xvd2VyY2FzZSc6XG4gICAgICAgICAgICByZXR1cm4gdmFsLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGNhc2UgJ3VwcGVyY2FzZSc6XG4gICAgICAgICAgICByZXR1cm4gdmFsLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgIGNhc2UgJ2ZpcnN0Q2hhcic6XG4gICAgICAgICAgICByZXR1cm4gdmFsLmNoYXJBdCgwKTtcbiAgICAgICAgY2FzZSAnZG9tYWluJzpcbiAgICAgICAgICAgIHJldHVybiBkb21haW5Gcm9tVXJsKHZhbCk7XG4gICAgICAgIGNhc2UgJ2hvc3RuYW1lJzpcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIHJldHVybiBuZXcgVVJMKHZhbCkuaG9zdG5hbWU7XG4gICAgICAgICAgICB9IGNhdGNoIHsgcmV0dXJuIHZhbDsgfVxuICAgICAgICBjYXNlICdyZWdleCc6XG4gICAgICAgICAgICBpZiAocGF0dGVybikge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCByZWdleCA9IHJlZ2V4Q2FjaGUuZ2V0KHBhdHRlcm4pO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXJlZ2V4KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWdleCA9IG5ldyBSZWdFeHAocGF0dGVybik7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWdleENhY2hlLnNldChwYXR0ZXJuLCByZWdleCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbWF0Y2ggPSByZWdleC5leGVjKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGV4dHJhY3RlZCA9IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IG1hdGNoLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXh0cmFjdGVkICs9IG1hdGNoW2ldIHx8IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZXh0cmFjdGVkO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgIGxvZ0RlYnVnKFwiSW52YWxpZCByZWdleCBpbiB0cmFuc2Zvcm1cIiwgeyBwYXR0ZXJuOiBwYXR0ZXJuLCBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICAgICAgfVxuICAgICAgICBjYXNlICdyZWdleFJlcGxhY2UnOlxuICAgICAgICAgICAgIGlmIChwYXR0ZXJuKSB7XG4gICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAvLyBVc2luZyAnZycgZ2xvYmFsIGZsYWcgYnkgZGVmYXVsdCBmb3IgcmVwbGFjZW1lbnRcbiAgICAgICAgICAgICAgICAgICAgIHJldHVybiB2YWwucmVwbGFjZShuZXcgUmVnRXhwKHBhdHRlcm4sICdnJyksIHJlcGxhY2VtZW50IHx8IFwiXCIpO1xuICAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkludmFsaWQgcmVnZXggaW4gdHJhbnNmb3JtXCIsIHsgcGF0dGVybjogcGF0dGVybiwgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICAgICAgICAgICAgIHJldHVybiB2YWw7XG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgcmV0dXJuIHZhbDtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHJldHVybiB2YWw7XG4gICAgfVxufTtcblxuZnVuY3Rpb24gZXZhbHVhdGVMZWdhY3lSdWxlcyhsZWdhY3lSdWxlczogU3RyYXRlZ3lSdWxlW10sIHRhYjogVGFiTWV0YWRhdGEpOiBzdHJpbmcgfCBudWxsIHtcbiAgICAvLyBEZWZlbnNpdmUgY2hlY2tcbiAgICBpZiAoIWxlZ2FjeVJ1bGVzIHx8ICFBcnJheS5pc0FycmF5KGxlZ2FjeVJ1bGVzKSkge1xuICAgICAgICBpZiAoIWxlZ2FjeVJ1bGVzKSByZXR1cm4gbnVsbDtcbiAgICAgICAgLy8gVHJ5IGFzQXJyYXkgaWYgaXQncyBub3QgYXJyYXkgYnV0IHRydXRoeSAodW5saWtlbHkgZ2l2ZW4gcHJldmlvdXMgbG9naWMgYnV0IHNhZmUpXG4gICAgfVxuXG4gICAgY29uc3QgbGVnYWN5UnVsZXNMaXN0ID0gYXNBcnJheTxTdHJhdGVneVJ1bGU+KGxlZ2FjeVJ1bGVzKTtcbiAgICBpZiAobGVnYWN5UnVsZXNMaXN0Lmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG5cbiAgICB0cnkge1xuICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgbGVnYWN5UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICBpZiAoIXJ1bGUpIGNvbnRpbnVlO1xuICAgICAgICAgICAgY29uc3QgcmF3VmFsdWUgPSBnZXRGaWVsZFZhbHVlKHRhYiwgcnVsZS5maWVsZCk7XG4gICAgICAgICAgICBjb25zdCB7IGlzTWF0Y2gsIG1hdGNoT2JqIH0gPSBjaGVja1ZhbHVlTWF0Y2gocnVsZS5vcGVyYXRvciwgcmF3VmFsdWUsIHJ1bGUudmFsdWUpO1xuXG4gICAgICAgICAgICBpZiAoaXNNYXRjaCkge1xuICAgICAgICAgICAgICAgIGxldCByZXN1bHQgPSBydWxlLnJlc3VsdDtcbiAgICAgICAgICAgICAgICBpZiAobWF0Y2hPYmopIHtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBtYXRjaE9iai5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKG5ldyBSZWdFeHAoYFxcXFwkJHtpfWAsICdnJyksIG1hdGNoT2JqW2ldIHx8IFwiXCIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGV2YWx1YXRpbmcgbGVnYWN5IHJ1bGVzXCIsIHsgZXJyb3I6IFN0cmluZyhlcnJvcikgfSk7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgY29uc3QgZ2V0R3JvdXBpbmdSZXN1bHQgPSAodGFiOiBUYWJNZXRhZGF0YSwgc3RyYXRlZ3k6IEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcpOiB7IGtleTogc3RyaW5nIHwgbnVsbCwgbW9kZTogXCJjdXJyZW50XCIgfCBcIm5ld1wiIHwgXCJjb21wb3VuZFwiIH0gPT4ge1xuICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneSk7XG4gIGlmIChjdXN0b20pIHtcbiAgICAgIGNvbnN0IGZpbHRlckdyb3Vwc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb25bXT4oY3VzdG9tLmZpbHRlckdyb3Vwcyk7XG4gICAgICBjb25zdCBmaWx0ZXJzTGlzdCA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbj4oY3VzdG9tLmZpbHRlcnMpO1xuXG4gICAgICBsZXQgbWF0Y2ggPSBmYWxzZTtcblxuICAgICAgaWYgKGZpbHRlckdyb3Vwc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIC8vIE9SIGxvZ2ljXG4gICAgICAgICAgZm9yIChjb25zdCBncm91cCBvZiBmaWx0ZXJHcm91cHNMaXN0KSB7XG4gICAgICAgICAgICAgIGNvbnN0IGdyb3VwUnVsZXMgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGdyb3VwKTtcbiAgICAgICAgICAgICAgaWYgKGdyb3VwUnVsZXMubGVuZ3RoID09PSAwIHx8IGdyb3VwUnVsZXMuZXZlcnkociA9PiBjaGVja0NvbmRpdGlvbihyLCB0YWIpKSkge1xuICAgICAgICAgICAgICAgICAgbWF0Y2ggPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGZpbHRlcnNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAvLyBMZWdhY3kvU2ltcGxlIEFORCBsb2dpY1xuICAgICAgICAgIGlmIChmaWx0ZXJzTGlzdC5ldmVyeShmID0+IGNoZWNrQ29uZGl0aW9uKGYsIHRhYikpKSB7XG4gICAgICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIE5vIGZpbHRlcnMgLT4gTWF0Y2ggYWxsXG4gICAgICAgICAgbWF0Y2ggPSB0cnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoIW1hdGNoKSB7XG4gICAgICAgICAgcmV0dXJuIHsga2V5OiBudWxsLCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICAgICAgfVxuXG4gICAgICBjb25zdCBncm91cGluZ1J1bGVzTGlzdCA9IGFzQXJyYXk8R3JvdXBpbmdSdWxlPihjdXN0b20uZ3JvdXBpbmdSdWxlcyk7XG4gICAgICBpZiAoZ3JvdXBpbmdSdWxlc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgIGNvbnN0IG1vZGVzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZ3JvdXBpbmdSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXJ1bGUpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIGxldCB2YWwgPSBcIlwiO1xuICAgICAgICAgICAgICAgIGlmIChydWxlLnNvdXJjZSA9PT0gJ2ZpZWxkJykge1xuICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmF3ID0gZ2V0RmllbGRWYWx1ZSh0YWIsIHJ1bGUudmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgdmFsID0gcmF3ICE9PSB1bmRlZmluZWQgJiYgcmF3ICE9PSBudWxsID8gU3RyaW5nKHJhdykgOiBcIlwiO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICB2YWwgPSBydWxlLnZhbHVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh2YWwgJiYgcnVsZS50cmFuc2Zvcm0gJiYgcnVsZS50cmFuc2Zvcm0gIT09ICdub25lJykge1xuICAgICAgICAgICAgICAgICAgICB2YWwgPSBhcHBseVZhbHVlVHJhbnNmb3JtKHZhbCwgcnVsZS50cmFuc2Zvcm0sIHJ1bGUudHJhbnNmb3JtUGF0dGVybiwgcnVsZS50cmFuc2Zvcm1SZXBsYWNlbWVudCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHZhbCkge1xuICAgICAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChydWxlLndpbmRvd01vZGUpIG1vZGVzLnB1c2gocnVsZS53aW5kb3dNb2RlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgIGxvZ0RlYnVnKFwiRXJyb3IgYXBwbHlpbmcgZ3JvdXBpbmcgcnVsZXNcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIHJldHVybiB7IGtleTogcGFydHMuam9pbihcIiAtIFwiKSwgbW9kZTogcmVzb2x2ZVdpbmRvd01vZGUobW9kZXMpIH07XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7IGtleTogY3VzdG9tLmZhbGxiYWNrIHx8IFwiTWlzY1wiLCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICAgICAgfSBlbHNlIGlmIChjdXN0b20ucnVsZXMpIHtcbiAgICAgICAgICBjb25zdCByZXN1bHQgPSBldmFsdWF0ZUxlZ2FjeVJ1bGVzKGFzQXJyYXk8U3RyYXRlZ3lSdWxlPihjdXN0b20ucnVsZXMpLCB0YWIpO1xuICAgICAgICAgIGlmIChyZXN1bHQpIHJldHVybiB7IGtleTogcmVzdWx0LCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICAgICAgfVxuXG4gICAgICByZXR1cm4geyBrZXk6IGN1c3RvbS5mYWxsYmFjayB8fCBcIk1pc2NcIiwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgfVxuXG4gIC8vIEJ1aWx0LWluIHN0cmF0ZWdpZXNcbiAgbGV0IHNpbXBsZUtleTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIHN3aXRjaCAoc3RyYXRlZ3kpIHtcbiAgICBjYXNlIFwiZG9tYWluXCI6XG4gICAgY2FzZSBcImRvbWFpbl9mdWxsXCI6XG4gICAgICBzaW1wbGVLZXkgPSBkb21haW5Gcm9tVXJsKHRhYi51cmwpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInRvcGljXCI6XG4gICAgICBzaW1wbGVLZXkgPSBzZW1hbnRpY0J1Y2tldCh0YWIudGl0bGUsIHRhYi51cmwpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcImxpbmVhZ2VcIjpcbiAgICAgIHNpbXBsZUtleSA9IG5hdmlnYXRpb25LZXkodGFiKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJjb250ZXh0XCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIuY29udGV4dCB8fCBcIlVuY2F0ZWdvcml6ZWRcIjtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJwaW5uZWRcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi5waW5uZWQgPyBcInBpbm5lZFwiIDogXCJ1bnBpbm5lZFwiO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcImFnZVwiOlxuICAgICAgc2ltcGxlS2V5ID0gZ2V0UmVjZW5jeUxhYmVsKHRhYi5sYXN0QWNjZXNzZWQgPz8gMCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwidXJsXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIudXJsO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInRpdGxlXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIudGl0bGU7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwicmVjZW5jeVwiOlxuICAgICAgc2ltcGxlS2V5ID0gU3RyaW5nKHRhYi5sYXN0QWNjZXNzZWQgPz8gMCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwibmVzdGluZ1wiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQgPyBcImNoaWxkXCIgOiBcInJvb3RcIjtcbiAgICAgIGJyZWFrO1xuICAgIGRlZmF1bHQ6XG4gICAgICAgIGNvbnN0IHZhbCA9IGdldEZpZWxkVmFsdWUodGFiLCBzdHJhdGVneSk7XG4gICAgICAgIGlmICh2YWwgIT09IHVuZGVmaW5lZCAmJiB2YWwgIT09IG51bGwpIHtcbiAgICAgICAgICAgIHNpbXBsZUtleSA9IFN0cmluZyh2YWwpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2ltcGxlS2V5ID0gXCJVbmtub3duXCI7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gIH1cbiAgcmV0dXJuIHsga2V5OiBzaW1wbGVLZXksIG1vZGU6IFwiY3VycmVudFwiIH07XG59O1xuXG5leHBvcnQgY29uc3QgZ3JvdXBpbmdLZXkgPSAodGFiOiBUYWJNZXRhZGF0YSwgc3RyYXRlZ3k6IEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcpOiBzdHJpbmcgfCBudWxsID0+IHtcbiAgICByZXR1cm4gZ2V0R3JvdXBpbmdSZXN1bHQodGFiLCBzdHJhdGVneSkua2V5O1xufTtcblxuZnVuY3Rpb24gaXNDb250ZXh0RmllbGQoZmllbGQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBmaWVsZCA9PT0gJ2NvbnRleHQnIHx8IGZpZWxkID09PSAnZ2VucmUnIHx8IGZpZWxkID09PSAnc2l0ZU5hbWUnIHx8IGZpZWxkLnN0YXJ0c1dpdGgoJ2NvbnRleHREYXRhLicpO1xufVxuXG5leHBvcnQgY29uc3QgcmVxdWlyZXNDb250ZXh0QW5hbHlzaXMgPSAoc3RyYXRlZ3lJZHM6IChzdHJpbmcgfCBTb3J0aW5nU3RyYXRlZ3kpW10pOiBib29sZWFuID0+IHtcbiAgICAvLyBDaGVjayBpZiBcImNvbnRleHRcIiBzdHJhdGVneSBpcyBleHBsaWNpdGx5IHJlcXVlc3RlZFxuICAgIGlmIChzdHJhdGVneUlkcy5pbmNsdWRlcyhcImNvbnRleHRcIikpIHJldHVybiB0cnVlO1xuXG4gICAgY29uc3Qgc3RyYXRlZ2llcyA9IGdldFN0cmF0ZWdpZXMoY3VzdG9tU3RyYXRlZ2llcyk7XG4gICAgLy8gZmlsdGVyIG9ubHkgdGhvc2UgdGhhdCBtYXRjaCB0aGUgcmVxdWVzdGVkIElEc1xuICAgIGNvbnN0IGFjdGl2ZURlZnMgPSBzdHJhdGVnaWVzLmZpbHRlcihzID0+IHN0cmF0ZWd5SWRzLmluY2x1ZGVzKHMuaWQpKTtcblxuICAgIGZvciAoY29uc3QgZGVmIG9mIGFjdGl2ZURlZnMpIHtcbiAgICAgICAgLy8gSWYgaXQncyBhIGJ1aWx0LWluIHN0cmF0ZWd5IHRoYXQgbmVlZHMgY29udGV4dCAob25seSAnY29udGV4dCcgZG9lcylcbiAgICAgICAgaWYgKGRlZi5pZCA9PT0gJ2NvbnRleHQnKSByZXR1cm4gdHJ1ZTtcblxuICAgICAgICAvLyBJZiBpdCBpcyBhIGN1c3RvbSBzdHJhdGVneSAob3Igb3ZlcnJpZGVzIGJ1aWx0LWluKSwgY2hlY2sgaXRzIHJ1bGVzXG4gICAgICAgIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChjID0+IGMuaWQgPT09IGRlZi5pZCk7XG4gICAgICAgIGlmIChjdXN0b20pIHtcbiAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzTGlzdCA9IGFzQXJyYXk8R3JvdXBpbmdSdWxlPihjdXN0b20uZ3JvdXBpbmdSdWxlcyk7XG4gICAgICAgICAgICAgY29uc3Qgc29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KGN1c3RvbS5zb3J0aW5nUnVsZXMpO1xuICAgICAgICAgICAgIGNvbnN0IGdyb3VwU29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KGN1c3RvbS5ncm91cFNvcnRpbmdSdWxlcyk7XG4gICAgICAgICAgICAgY29uc3QgZmlsdGVyc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGN1c3RvbS5maWx0ZXJzKTtcbiAgICAgICAgICAgICBjb25zdCBmaWx0ZXJHcm91cHNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uW10+KGN1c3RvbS5maWx0ZXJHcm91cHMpO1xuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwUnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIHJ1bGUuc291cmNlID09PSAnZmllbGQnICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUudmFsdWUpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgcnVsZS5jb2xvciA9PT0gJ2ZpZWxkJyAmJiBydWxlLmNvbG9yRmllbGQgJiYgaXNDb250ZXh0RmllbGQocnVsZS5jb2xvckZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIHNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBmaWx0ZXJzTGlzdCkge1xuICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBpc0NvbnRleHRGaWVsZChydWxlLmZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBncm91cCBvZiBmaWx0ZXJHcm91cHNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGNvbnN0IGdyb3VwUnVsZXMgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGdyb3VwKTtcbiAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwUnVsZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59O1xuIiwgImltcG9ydCB7IFNvcnRpbmdTdHJhdGVneSwgVGFiTWV0YWRhdGEsIEN1c3RvbVN0cmF0ZWd5LCBTb3J0aW5nUnVsZSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGRvbWFpbkZyb21VcmwsIHNlbWFudGljQnVja2V0LCBuYXZpZ2F0aW9uS2V5LCBncm91cGluZ0tleSwgZ2V0RmllbGRWYWx1ZSwgZ2V0Q3VzdG9tU3RyYXRlZ2llcyB9IGZyb20gXCIuL2dyb3VwaW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcblxuZXhwb3J0IGNvbnN0IHJlY2VuY3lTY29yZSA9ICh0YWI6IFRhYk1ldGFkYXRhKSA9PiB0YWIubGFzdEFjY2Vzc2VkID8/IDA7XG5leHBvcnQgY29uc3QgaGllcmFyY2h5U2NvcmUgPSAodGFiOiBUYWJNZXRhZGF0YSkgPT4gKHRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkID8gMSA6IDApO1xuZXhwb3J0IGNvbnN0IHBpbm5lZFNjb3JlID0gKHRhYjogVGFiTWV0YWRhdGEpID0+ICh0YWIucGlubmVkID8gMCA6IDEpO1xuXG5leHBvcnQgY29uc3Qgc29ydFRhYnMgPSAodGFiczogVGFiTWV0YWRhdGFbXSwgc3RyYXRlZ2llczogU29ydGluZ1N0cmF0ZWd5W10pOiBUYWJNZXRhZGF0YVtdID0+IHtcbiAgY29uc3Qgc2NvcmluZzogU29ydGluZ1N0cmF0ZWd5W10gPSBzdHJhdGVnaWVzLmxlbmd0aCA/IHN0cmF0ZWdpZXMgOiBbXCJwaW5uZWRcIiwgXCJyZWNlbmN5XCJdO1xuICByZXR1cm4gWy4uLnRhYnNdLnNvcnQoKGEsIGIpID0+IHtcbiAgICBmb3IgKGNvbnN0IHN0cmF0ZWd5IG9mIHNjb3JpbmcpIHtcbiAgICAgIGNvbnN0IGRpZmYgPSBjb21wYXJlQnkoc3RyYXRlZ3ksIGEsIGIpO1xuICAgICAgaWYgKGRpZmYgIT09IDApIHJldHVybiBkaWZmO1xuICAgIH1cbiAgICByZXR1cm4gYS5pZCAtIGIuaWQ7XG4gIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IGNvbXBhcmVCeSA9IChzdHJhdGVneTogU29ydGluZ1N0cmF0ZWd5IHwgc3RyaW5nLCBhOiBUYWJNZXRhZGF0YSwgYjogVGFiTWV0YWRhdGEpOiBudW1iZXIgPT4ge1xuICAvLyAxLiBDaGVjayBDdXN0b20gU3RyYXRlZ2llcyBmb3IgU29ydGluZyBSdWxlc1xuICBjb25zdCBjdXN0b21TdHJhdHMgPSBnZXRDdXN0b21TdHJhdGVnaWVzKCk7XG4gIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0cy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3kpO1xuICBpZiAoY3VzdG9tKSB7XG4gICAgICBjb25zdCBzb3J0UnVsZXNMaXN0ID0gYXNBcnJheTxTb3J0aW5nUnVsZT4oY3VzdG9tLnNvcnRpbmdSdWxlcyk7XG4gICAgICBpZiAoc29ydFJ1bGVzTGlzdC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgLy8gRXZhbHVhdGUgY3VzdG9tIHNvcnRpbmcgcnVsZXMgaW4gb3JkZXJcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2Ygc29ydFJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IHZhbEEgPSBnZXRGaWVsZFZhbHVlKGEsIHJ1bGUuZmllbGQpO1xuICAgICAgICAgICAgICAgICAgY29uc3QgdmFsQiA9IGdldEZpZWxkVmFsdWUoYiwgcnVsZS5maWVsZCk7XG5cbiAgICAgICAgICAgICAgICAgIGxldCByZXN1bHQgPSAwO1xuICAgICAgICAgICAgICAgICAgaWYgKHZhbEEgPCB2YWxCKSByZXN1bHQgPSAtMTtcbiAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKHZhbEEgPiB2YWxCKSByZXN1bHQgPSAxO1xuXG4gICAgICAgICAgICAgICAgICBpZiAocmVzdWx0ICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJ1bGUub3JkZXIgPT09ICdkZXNjJyA/IC1yZXN1bHQgOiByZXN1bHQ7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgIGxvZ0RlYnVnKFwiRXJyb3IgZXZhbHVhdGluZyBjdXN0b20gc29ydGluZyBydWxlc1wiLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIElmIGFsbCBydWxlcyBlcXVhbCwgY29udGludWUgdG8gbmV4dCBzdHJhdGVneSAocmV0dXJuIDApXG4gICAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9XG4gIH1cblxuICAvLyAyLiBCdWlsdC1pbiBvciBmYWxsYmFja1xuICBzd2l0Y2ggKHN0cmF0ZWd5KSB7XG4gICAgY2FzZSBcInJlY2VuY3lcIjpcbiAgICAgIHJldHVybiAoYi5sYXN0QWNjZXNzZWQgPz8gMCkgLSAoYS5sYXN0QWNjZXNzZWQgPz8gMCk7XG4gICAgY2FzZSBcIm5lc3RpbmdcIjogLy8gRm9ybWVybHkgaGllcmFyY2h5XG4gICAgICByZXR1cm4gaGllcmFyY2h5U2NvcmUoYSkgLSBoaWVyYXJjaHlTY29yZShiKTtcbiAgICBjYXNlIFwicGlubmVkXCI6XG4gICAgICByZXR1cm4gcGlubmVkU2NvcmUoYSkgLSBwaW5uZWRTY29yZShiKTtcbiAgICBjYXNlIFwidGl0bGVcIjpcbiAgICAgIHJldHVybiBhLnRpdGxlLmxvY2FsZUNvbXBhcmUoYi50aXRsZSk7XG4gICAgY2FzZSBcInVybFwiOlxuICAgICAgcmV0dXJuIGEudXJsLmxvY2FsZUNvbXBhcmUoYi51cmwpO1xuICAgIGNhc2UgXCJjb250ZXh0XCI6XG4gICAgICByZXR1cm4gKGEuY29udGV4dCA/PyBcIlwiKS5sb2NhbGVDb21wYXJlKGIuY29udGV4dCA/PyBcIlwiKTtcbiAgICBjYXNlIFwiZG9tYWluXCI6XG4gICAgY2FzZSBcImRvbWFpbl9mdWxsXCI6XG4gICAgICByZXR1cm4gZG9tYWluRnJvbVVybChhLnVybCkubG9jYWxlQ29tcGFyZShkb21haW5Gcm9tVXJsKGIudXJsKSk7XG4gICAgY2FzZSBcInRvcGljXCI6XG4gICAgICByZXR1cm4gc2VtYW50aWNCdWNrZXQoYS50aXRsZSwgYS51cmwpLmxvY2FsZUNvbXBhcmUoc2VtYW50aWNCdWNrZXQoYi50aXRsZSwgYi51cmwpKTtcbiAgICBjYXNlIFwibGluZWFnZVwiOlxuICAgICAgcmV0dXJuIG5hdmlnYXRpb25LZXkoYSkubG9jYWxlQ29tcGFyZShuYXZpZ2F0aW9uS2V5KGIpKTtcbiAgICBjYXNlIFwiYWdlXCI6XG4gICAgICAvLyBSZXZlcnNlIGFscGhhYmV0aWNhbCBmb3IgYWdlIGJ1Y2tldHMgKFRvZGF5IDwgWWVzdGVyZGF5KSwgcm91Z2ggYXBwcm94XG4gICAgICByZXR1cm4gKGdyb3VwaW5nS2V5KGEsIFwiYWdlXCIpIHx8IFwiXCIpLmxvY2FsZUNvbXBhcmUoZ3JvdXBpbmdLZXkoYiwgXCJhZ2VcIikgfHwgXCJcIik7XG4gICAgZGVmYXVsdDpcbiAgICAgIC8vIENoZWNrIGlmIGl0J3MgYSBnZW5lcmljIGZpZWxkIGZpcnN0XG4gICAgICBjb25zdCB2YWxBID0gZ2V0RmllbGRWYWx1ZShhLCBzdHJhdGVneSk7XG4gICAgICBjb25zdCB2YWxCID0gZ2V0RmllbGRWYWx1ZShiLCBzdHJhdGVneSk7XG5cbiAgICAgIGlmICh2YWxBICE9PSB1bmRlZmluZWQgJiYgdmFsQiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgaWYgKHZhbEEgPCB2YWxCKSByZXR1cm4gLTE7XG4gICAgICAgICAgaWYgKHZhbEEgPiB2YWxCKSByZXR1cm4gMTtcbiAgICAgICAgICByZXR1cm4gMDtcbiAgICAgIH1cblxuICAgICAgLy8gRmFsbGJhY2sgZm9yIGN1c3RvbSBzdHJhdGVnaWVzIGdyb3VwaW5nIGtleSAoaWYgdXNpbmcgY3VzdG9tIHN0cmF0ZWd5IGFzIHNvcnRpbmcgYnV0IG5vIHNvcnRpbmcgcnVsZXMgZGVmaW5lZClcbiAgICAgIC8vIG9yIHVuaGFuZGxlZCBidWlsdC1pbnNcbiAgICAgIHJldHVybiAoZ3JvdXBpbmdLZXkoYSwgc3RyYXRlZ3kpIHx8IFwiXCIpLmxvY2FsZUNvbXBhcmUoZ3JvdXBpbmdLZXkoYiwgc3RyYXRlZ3kpIHx8IFwiXCIpO1xuICB9XG59O1xuIiwgIi8vIGxvZ2ljLnRzXG4vLyBQdXJlIGZ1bmN0aW9ucyBmb3IgZXh0cmFjdGlvbiBsb2dpY1xuXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplVXJsKHVybFN0cjogc3RyaW5nKTogc3RyaW5nIHtcbiAgdHJ5IHtcbiAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHVybFN0cik7XG4gICAgY29uc3QgcGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcyh1cmwuc2VhcmNoKTtcbiAgICBjb25zdCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuICAgIHBhcmFtcy5mb3JFYWNoKChfLCBrZXkpID0+IGtleXMucHVzaChrZXkpKTtcbiAgICBjb25zdCBob3N0bmFtZSA9IHVybC5ob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgJycpO1xuXG4gICAgY29uc3QgVFJBQ0tJTkcgPSBbL151dG1fLywgL15mYmNsaWQkLywgL15nY2xpZCQvLCAvXl9nYSQvLCAvXnJlZiQvLCAvXnljbGlkJC8sIC9eX2hzL107XG4gICAgY29uc3QgaXNZb3V0dWJlID0gaG9zdG5hbWUuZW5kc1dpdGgoJ3lvdXR1YmUuY29tJykgfHwgaG9zdG5hbWUuZW5kc1dpdGgoJ3lvdXR1LmJlJyk7XG4gICAgY29uc3QgaXNHb29nbGUgPSBob3N0bmFtZS5lbmRzV2l0aCgnZ29vZ2xlLmNvbScpO1xuXG4gICAgY29uc3Qga2VlcDogc3RyaW5nW10gPSBbXTtcbiAgICBpZiAoaXNZb3V0dWJlKSBrZWVwLnB1c2goJ3YnLCAnbGlzdCcsICd0JywgJ2MnLCAnY2hhbm5lbCcsICdwbGF5bGlzdCcpO1xuICAgIGlmIChpc0dvb2dsZSkga2VlcC5wdXNoKCdxJywgJ2lkJywgJ3NvdXJjZWlkJyk7XG5cbiAgICBmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG4gICAgICBpZiAoVFJBQ0tJTkcuc29tZShyID0+IHIudGVzdChrZXkpKSkge1xuICAgICAgICAgcGFyYW1zLmRlbGV0ZShrZXkpO1xuICAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAoKGlzWW91dHViZSB8fCBpc0dvb2dsZSkgJiYgIWtlZXAuaW5jbHVkZXMoa2V5KSkge1xuICAgICAgICAgcGFyYW1zLmRlbGV0ZShrZXkpO1xuICAgICAgfVxuICAgIH1cbiAgICB1cmwuc2VhcmNoID0gcGFyYW1zLnRvU3RyaW5nKCk7XG4gICAgcmV0dXJuIHVybC50b1N0cmluZygpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgcmV0dXJuIHVybFN0cjtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VZb3VUdWJlVXJsKHVybFN0cjogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgdXJsID0gbmV3IFVSTCh1cmxTdHIpO1xuICAgICAgICBjb25zdCB2ID0gdXJsLnNlYXJjaFBhcmFtcy5nZXQoJ3YnKTtcbiAgICAgICAgY29uc3QgaXNTaG9ydHMgPSB1cmwucGF0aG5hbWUuaW5jbHVkZXMoJy9zaG9ydHMvJyk7XG4gICAgICAgIGxldCB2aWRlb0lkID1cbiAgICAgICAgICB2IHx8XG4gICAgICAgICAgKGlzU2hvcnRzID8gdXJsLnBhdGhuYW1lLnNwbGl0KCcvc2hvcnRzLycpWzFdIDogbnVsbCkgfHxcbiAgICAgICAgICAodXJsLmhvc3RuYW1lID09PSAneW91dHUuYmUnID8gdXJsLnBhdGhuYW1lLnJlcGxhY2UoJy8nLCAnJykgOiBudWxsKTtcblxuICAgICAgICBjb25zdCBwbGF5bGlzdElkID0gdXJsLnNlYXJjaFBhcmFtcy5nZXQoJ2xpc3QnKTtcbiAgICAgICAgY29uc3QgcGxheWxpc3RJbmRleCA9IHBhcnNlSW50KHVybC5zZWFyY2hQYXJhbXMuZ2V0KCdpbmRleCcpIHx8ICcwJywgMTApO1xuXG4gICAgICAgIHJldHVybiB7IHZpZGVvSWQsIGlzU2hvcnRzLCBwbGF5bGlzdElkLCBwbGF5bGlzdEluZGV4IH07XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICByZXR1cm4geyB2aWRlb0lkOiBudWxsLCBpc1Nob3J0czogZmFsc2UsIHBsYXlsaXN0SWQ6IG51bGwsIHBsYXlsaXN0SW5kZXg6IG51bGwgfTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGV4dHJhY3RBdXRob3IoZW50aXR5OiBhbnkpOiBzdHJpbmcgfCBudWxsIHtcbiAgICBpZiAoIWVudGl0eSB8fCAhZW50aXR5LmF1dGhvcikgcmV0dXJuIG51bGw7XG4gICAgaWYgKHR5cGVvZiBlbnRpdHkuYXV0aG9yID09PSAnc3RyaW5nJykgcmV0dXJuIGVudGl0eS5hdXRob3I7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZW50aXR5LmF1dGhvcikpIHJldHVybiBlbnRpdHkuYXV0aG9yWzBdPy5uYW1lIHx8IG51bGw7XG4gICAgaWYgKHR5cGVvZiBlbnRpdHkuYXV0aG9yID09PSAnb2JqZWN0JykgcmV0dXJuIGVudGl0eS5hdXRob3IubmFtZSB8fCBudWxsO1xuICAgIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBleHRyYWN0S2V5d29yZHMoZW50aXR5OiBhbnkpOiBzdHJpbmdbXSB7XG4gICAgaWYgKCFlbnRpdHkgfHwgIWVudGl0eS5rZXl3b3JkcykgcmV0dXJuIFtdO1xuICAgIGlmICh0eXBlb2YgZW50aXR5LmtleXdvcmRzID09PSAnc3RyaW5nJykge1xuICAgICAgICByZXR1cm4gZW50aXR5LmtleXdvcmRzLnNwbGl0KCcsJykubWFwKChzOiBzdHJpbmcpID0+IHMudHJpbSgpKTtcbiAgICB9XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZW50aXR5LmtleXdvcmRzKSkgcmV0dXJuIGVudGl0eS5rZXl3b3JkcztcbiAgICByZXR1cm4gW107XG59XG5cbmZ1bmN0aW9uIGV4dHJhY3RCcmVhZGNydW1icyhqc29uTGQ6IGFueVtdKTogc3RyaW5nW10ge1xuICAgIGNvbnN0IGJyZWFkY3J1bWJMZCA9IGpzb25MZC5maW5kKGkgPT4gaSAmJiBpWydAdHlwZSddID09PSAnQnJlYWRjcnVtYkxpc3QnKTtcbiAgICBpZiAoIWJyZWFkY3J1bWJMZCB8fCAhQXJyYXkuaXNBcnJheShicmVhZGNydW1iTGQuaXRlbUxpc3RFbGVtZW50KSkgcmV0dXJuIFtdO1xuXG4gICAgY29uc3QgbGlzdCA9IGJyZWFkY3J1bWJMZC5pdGVtTGlzdEVsZW1lbnQuc29ydCgoYTogYW55LCBiOiBhbnkpID0+IChhLnBvc2l0aW9uIHx8IDApIC0gKGIucG9zaXRpb24gfHwgMCkpO1xuICAgIGNvbnN0IGJyZWFkY3J1bWJzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGxpc3QuZm9yRWFjaCgoaXRlbTogYW55KSA9PiB7XG4gICAgICAgIGlmIChpdGVtLm5hbWUpIGJyZWFkY3J1bWJzLnB1c2goaXRlbS5uYW1lKTtcbiAgICAgICAgZWxzZSBpZiAoaXRlbS5pdGVtICYmIGl0ZW0uaXRlbS5uYW1lKSBicmVhZGNydW1icy5wdXNoKGl0ZW0uaXRlbS5uYW1lKTtcbiAgICB9KTtcbiAgICByZXR1cm4gYnJlYWRjcnVtYnM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0SnNvbkxkRmllbGRzKGpzb25MZDogYW55W10pIHtcbiAgICAvLyBGaW5kIG1haW4gZW50aXR5XG4gICAgLy8gQWRkZWQgc2FmZXR5IGNoZWNrOiBpICYmIGlbJ0B0eXBlJ11cbiAgICBjb25zdCBtYWluRW50aXR5ID0ganNvbkxkLmZpbmQoaSA9PiBpICYmIChpWydAdHlwZSddID09PSAnQXJ0aWNsZScgfHwgaVsnQHR5cGUnXSA9PT0gJ1ZpZGVvT2JqZWN0JyB8fCBpWydAdHlwZSddID09PSAnTmV3c0FydGljbGUnKSkgfHwganNvbkxkWzBdO1xuXG4gICAgbGV0IGF1dGhvcjogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgbGV0IHB1Ymxpc2hlZEF0OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICBsZXQgbW9kaWZpZWRBdDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgbGV0IHRhZ3M6IHN0cmluZ1tdID0gW107XG5cbiAgICBpZiAobWFpbkVudGl0eSkge1xuICAgICAgICBhdXRob3IgPSBleHRyYWN0QXV0aG9yKG1haW5FbnRpdHkpO1xuICAgICAgICBwdWJsaXNoZWRBdCA9IG1haW5FbnRpdHkuZGF0ZVB1Ymxpc2hlZCB8fCBudWxsO1xuICAgICAgICBtb2RpZmllZEF0ID0gbWFpbkVudGl0eS5kYXRlTW9kaWZpZWQgfHwgbnVsbDtcbiAgICAgICAgdGFncyA9IGV4dHJhY3RLZXl3b3JkcyhtYWluRW50aXR5KTtcbiAgICB9XG5cbiAgICBjb25zdCBicmVhZGNydW1icyA9IGV4dHJhY3RCcmVhZGNydW1icyhqc29uTGQpO1xuXG4gICAgcmV0dXJuIHsgYXV0aG9yLCBwdWJsaXNoZWRBdCwgbW9kaWZpZWRBdCwgdGFncywgYnJlYWRjcnVtYnMgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RZb3VUdWJlQ2hhbm5lbEZyb21IdG1sKGh0bWw6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuICAvLyAxLiBUcnkgSlNPTi1MRFxuICAvLyBMb29rIGZvciA8c2NyaXB0IHR5cGU9XCJhcHBsaWNhdGlvbi9sZCtqc29uXCI+Li4uPC9zY3JpcHQ+XG4gIC8vIFdlIG5lZWQgdG8gbG9vcCBiZWNhdXNlIHRoZXJlIG1pZ2h0IGJlIG11bHRpcGxlIHNjcmlwdHNcbiAgY29uc3Qgc2NyaXB0UmVnZXggPSAvPHNjcmlwdFxccyt0eXBlPVtcIiddYXBwbGljYXRpb25cXC9sZFxcK2pzb25bXCInXVtePl0qPihbXFxzXFxTXSo/KTxcXC9zY3JpcHQ+L2dpO1xuICBsZXQgbWF0Y2g7XG4gIHdoaWxlICgobWF0Y2ggPSBzY3JpcHRSZWdleC5leGVjKGh0bWwpKSAhPT0gbnVsbCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBqc29uID0gSlNPTi5wYXJzZShtYXRjaFsxXSk7XG4gICAgICAgICAgY29uc3QgYXJyYXkgPSBBcnJheS5pc0FycmF5KGpzb24pID8ganNvbiA6IFtqc29uXTtcbiAgICAgICAgICBjb25zdCBmaWVsZHMgPSBleHRyYWN0SnNvbkxkRmllbGRzKGFycmF5KTtcbiAgICAgICAgICBpZiAoZmllbGRzLmF1dGhvcikgcmV0dXJuIGZpZWxkcy5hdXRob3I7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgLy8gaWdub3JlIHBhcnNlIGVycm9yc1xuICAgICAgfVxuICB9XG5cbiAgLy8gMi4gVHJ5IDxsaW5rIGl0ZW1wcm9wPVwibmFtZVwiIGNvbnRlbnQ9XCIuLi5cIj4gKFlvdVR1YmUgb2Z0ZW4gcHV0cyBjaGFubmVsIG5hbWUgaGVyZSBpbiBzb21lIGNvbnRleHRzKVxuICAvLyBPciA8bWV0YSBpdGVtcHJvcD1cImNoYW5uZWxJZFwiIGNvbnRlbnQ9XCIuLi5cIj4gLT4gYnV0IHRoYXQncyBJRC5cbiAgLy8gPGxpbmsgaXRlbXByb3A9XCJuYW1lXCIgY29udGVudD1cIkNoYW5uZWwgTmFtZVwiPlxuICAvLyA8c3BhbiBpdGVtcHJvcD1cImF1dGhvclwiIGl0ZW1zY29wZSBpdGVtdHlwZT1cImh0dHA6Ly9zY2hlbWEub3JnL1BlcnNvblwiPjxsaW5rIGl0ZW1wcm9wPVwibmFtZVwiIGNvbnRlbnQ9XCJDaGFubmVsIE5hbWVcIj48L3NwYW4+XG4gIGNvbnN0IGxpbmtOYW1lUmVnZXggPSAvPGxpbmtcXHMraXRlbXByb3A9W1wiJ11uYW1lW1wiJ11cXHMrY29udGVudD1bXCInXShbXlwiJ10rKVtcIiddXFxzKlxcLz8+L2k7XG4gIGNvbnN0IGxpbmtNYXRjaCA9IGxpbmtOYW1lUmVnZXguZXhlYyhodG1sKTtcbiAgaWYgKGxpbmtNYXRjaCAmJiBsaW5rTWF0Y2hbMV0pIHJldHVybiBkZWNvZGVIdG1sRW50aXRpZXMobGlua01hdGNoWzFdKTtcblxuICAvLyAzLiBUcnkgbWV0YSBhdXRob3JcbiAgY29uc3QgbWV0YUF1dGhvclJlZ2V4ID0gLzxtZXRhXFxzK25hbWU9W1wiJ11hdXRob3JbXCInXVxccytjb250ZW50PVtcIiddKFteXCInXSspW1wiJ11cXHMqXFwvPz4vaTtcbiAgY29uc3QgbWV0YU1hdGNoID0gbWV0YUF1dGhvclJlZ2V4LmV4ZWMoaHRtbCk7XG4gIGlmIChtZXRhTWF0Y2ggJiYgbWV0YU1hdGNoWzFdKSB7XG4gICAgICAvLyBZb3VUdWJlIG1ldGEgYXV0aG9yIGlzIG9mdGVuIFwiQ2hhbm5lbCBOYW1lXCJcbiAgICAgIHJldHVybiBkZWNvZGVIdG1sRW50aXRpZXMobWV0YU1hdGNoWzFdKTtcbiAgfVxuXG4gIHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXh0cmFjdFlvdVR1YmVHZW5yZUZyb21IdG1sKGh0bWw6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuICAvLyAxLiBUcnkgPG1ldGEgaXRlbXByb3A9XCJnZW5yZVwiIGNvbnRlbnQ9XCIuLi5cIj5cbiAgY29uc3QgbWV0YUdlbnJlUmVnZXggPSAvPG1ldGFcXHMraXRlbXByb3A9W1wiJ11nZW5yZVtcIiddXFxzK2NvbnRlbnQ9W1wiJ10oW15cIiddKylbXCInXVxccypcXC8/Pi9pO1xuICBjb25zdCBtZXRhTWF0Y2ggPSBtZXRhR2VucmVSZWdleC5leGVjKGh0bWwpO1xuICBpZiAobWV0YU1hdGNoICYmIG1ldGFNYXRjaFsxXSkge1xuICAgICAgcmV0dXJuIGRlY29kZUh0bWxFbnRpdGllcyhtZXRhTWF0Y2hbMV0pO1xuICB9XG5cbiAgLy8gMi4gVHJ5IEpTT04gXCJjYXRlZ29yeVwiIGluIHNjcmlwdHNcbiAgLy8gXCJjYXRlZ29yeVwiOlwiR2FtaW5nXCJcbiAgY29uc3QgY2F0ZWdvcnlSZWdleCA9IC9cImNhdGVnb3J5XCJcXHMqOlxccypcIihbXlwiXSspXCIvO1xuICBjb25zdCBjYXRNYXRjaCA9IGNhdGVnb3J5UmVnZXguZXhlYyhodG1sKTtcbiAgaWYgKGNhdE1hdGNoICYmIGNhdE1hdGNoWzFdKSB7XG4gICAgICByZXR1cm4gZGVjb2RlSHRtbEVudGl0aWVzKGNhdE1hdGNoWzFdKTtcbiAgfVxuXG4gIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBkZWNvZGVIdG1sRW50aXRpZXModGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgaWYgKCF0ZXh0KSByZXR1cm4gdGV4dDtcblxuICBjb25zdCBlbnRpdGllczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICAnJmFtcDsnOiAnJicsXG4gICAgJyZsdDsnOiAnPCcsXG4gICAgJyZndDsnOiAnPicsXG4gICAgJyZxdW90Oyc6ICdcIicsXG4gICAgJyYjMzk7JzogXCInXCIsXG4gICAgJyZhcG9zOyc6IFwiJ1wiLFxuICAgICcmbmJzcDsnOiAnICdcbiAgfTtcblxuICByZXR1cm4gdGV4dC5yZXBsYWNlKC8mKFthLXowLTldK3wjWzAtOV17MSw2fXwjeFswLTlhLWZBLUZdezEsNn0pOy9pZywgKG1hdGNoKSA9PiB7XG4gICAgICBjb25zdCBsb3dlciA9IG1hdGNoLnRvTG93ZXJDYXNlKCk7XG4gICAgICBpZiAoZW50aXRpZXNbbG93ZXJdKSByZXR1cm4gZW50aXRpZXNbbG93ZXJdO1xuICAgICAgaWYgKGVudGl0aWVzW21hdGNoXSkgcmV0dXJuIGVudGl0aWVzW21hdGNoXTtcblxuICAgICAgaWYgKGxvd2VyLnN0YXJ0c1dpdGgoJyYjeCcpKSB7XG4gICAgICAgICAgdHJ5IHsgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUocGFyc2VJbnQobG93ZXIuc2xpY2UoMywgLTEpLCAxNikpOyB9IGNhdGNoIHsgcmV0dXJuIG1hdGNoOyB9XG4gICAgICB9XG4gICAgICBpZiAobG93ZXIuc3RhcnRzV2l0aCgnJiMnKSkge1xuICAgICAgICAgIHRyeSB7IHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlKHBhcnNlSW50KGxvd2VyLnNsaWNlKDIsIC0xKSwgMTApKTsgfSBjYXRjaCB7IHJldHVybiBtYXRjaDsgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIG1hdGNoO1xuICB9KTtcbn1cbiIsICJcbmV4cG9ydCBjb25zdCBHRU5FUkFfUkVHSVNUUlk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gIC8vIFNlYXJjaFxuICAnZ29vZ2xlLmNvbSc6ICdTZWFyY2gnLFxuICAnYmluZy5jb20nOiAnU2VhcmNoJyxcbiAgJ2R1Y2tkdWNrZ28uY29tJzogJ1NlYXJjaCcsXG4gICd5YWhvby5jb20nOiAnU2VhcmNoJyxcbiAgJ2JhaWR1LmNvbSc6ICdTZWFyY2gnLFxuICAneWFuZGV4LmNvbSc6ICdTZWFyY2gnLFxuICAna2FnaS5jb20nOiAnU2VhcmNoJyxcbiAgJ2Vjb3NpYS5vcmcnOiAnU2VhcmNoJyxcblxuICAvLyBTb2NpYWxcbiAgJ2ZhY2Vib29rLmNvbSc6ICdTb2NpYWwnLFxuICAndHdpdHRlci5jb20nOiAnU29jaWFsJyxcbiAgJ3guY29tJzogJ1NvY2lhbCcsXG4gICdpbnN0YWdyYW0uY29tJzogJ1NvY2lhbCcsXG4gICdsaW5rZWRpbi5jb20nOiAnU29jaWFsJyxcbiAgJ3JlZGRpdC5jb20nOiAnU29jaWFsJyxcbiAgJ3Rpa3Rvay5jb20nOiAnU29jaWFsJyxcbiAgJ3BpbnRlcmVzdC5jb20nOiAnU29jaWFsJyxcbiAgJ3NuYXBjaGF0LmNvbSc6ICdTb2NpYWwnLFxuICAndHVtYmxyLmNvbSc6ICdTb2NpYWwnLFxuICAndGhyZWFkcy5uZXQnOiAnU29jaWFsJyxcbiAgJ2JsdWVza3kuYXBwJzogJ1NvY2lhbCcsXG4gICdtYXN0b2Rvbi5zb2NpYWwnOiAnU29jaWFsJyxcblxuICAvLyBWaWRlb1xuICAneW91dHViZS5jb20nOiAnVmlkZW8nLFxuICAneW91dHUuYmUnOiAnVmlkZW8nLFxuICAndmltZW8uY29tJzogJ1ZpZGVvJyxcbiAgJ3R3aXRjaC50dic6ICdWaWRlbycsXG4gICduZXRmbGl4LmNvbSc6ICdWaWRlbycsXG4gICdodWx1LmNvbSc6ICdWaWRlbycsXG4gICdkaXNuZXlwbHVzLmNvbSc6ICdWaWRlbycsXG4gICdkYWlseW1vdGlvbi5jb20nOiAnVmlkZW8nLFxuICAncHJpbWV2aWRlby5jb20nOiAnVmlkZW8nLFxuICAnaGJvbWF4LmNvbSc6ICdWaWRlbycsXG4gICdtYXguY29tJzogJ1ZpZGVvJyxcbiAgJ3BlYWNvY2t0di5jb20nOiAnVmlkZW8nLFxuXG4gIC8vIERldmVsb3BtZW50XG4gICdnaXRodWIuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2dpdGxhYi5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnc3RhY2tvdmVyZmxvdy5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnbnBtanMuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ3B5cGkub3JnJzogJ0RldmVsb3BtZW50JyxcbiAgJ2RldmVsb3Blci5tb3ppbGxhLm9yZyc6ICdEZXZlbG9wbWVudCcsXG4gICd3M3NjaG9vbHMuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2dlZWtzZm9yZ2Vla3Mub3JnJzogJ0RldmVsb3BtZW50JyxcbiAgJ2ppcmEuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2F0bGFzc2lhbi5uZXQnOiAnRGV2ZWxvcG1lbnQnLCAvLyBvZnRlbiBqaXJhXG4gICdiaXRidWNrZXQub3JnJzogJ0RldmVsb3BtZW50JyxcbiAgJ2Rldi50byc6ICdEZXZlbG9wbWVudCcsXG4gICdoYXNobm9kZS5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnbWVkaXVtLmNvbSc6ICdEZXZlbG9wbWVudCcsIC8vIEdlbmVyYWwgYnV0IG9mdGVuIGRldlxuICAndmVyY2VsLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICduZXRsaWZ5LmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdoZXJva3UuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2F3cy5hbWF6b24uY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2NvbnNvbGUuYXdzLmFtYXpvbi5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnY2xvdWQuZ29vZ2xlLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdhenVyZS5taWNyb3NvZnQuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ3BvcnRhbC5henVyZS5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnZG9ja2VyLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdrdWJlcm5ldGVzLmlvJzogJ0RldmVsb3BtZW50JyxcblxuICAvLyBOZXdzXG4gICdjbm4uY29tJzogJ05ld3MnLFxuICAnYmJjLmNvbSc6ICdOZXdzJyxcbiAgJ255dGltZXMuY29tJzogJ05ld3MnLFxuICAnd2FzaGluZ3RvbnBvc3QuY29tJzogJ05ld3MnLFxuICAndGhlZ3VhcmRpYW4uY29tJzogJ05ld3MnLFxuICAnZm9yYmVzLmNvbSc6ICdOZXdzJyxcbiAgJ2Jsb29tYmVyZy5jb20nOiAnTmV3cycsXG4gICdyZXV0ZXJzLmNvbSc6ICdOZXdzJyxcbiAgJ3dzai5jb20nOiAnTmV3cycsXG4gICdjbmJjLmNvbSc6ICdOZXdzJyxcbiAgJ2h1ZmZwb3N0LmNvbSc6ICdOZXdzJyxcbiAgJ25ld3MuZ29vZ2xlLmNvbSc6ICdOZXdzJyxcbiAgJ2ZveG5ld3MuY29tJzogJ05ld3MnLFxuICAnbmJjbmV3cy5jb20nOiAnTmV3cycsXG4gICdhYmNuZXdzLmdvLmNvbSc6ICdOZXdzJyxcbiAgJ3VzYXRvZGF5LmNvbSc6ICdOZXdzJyxcblxuICAvLyBTaG9wcGluZ1xuICAnYW1hem9uLmNvbSc6ICdTaG9wcGluZycsXG4gICdlYmF5LmNvbSc6ICdTaG9wcGluZycsXG4gICd3YWxtYXJ0LmNvbSc6ICdTaG9wcGluZycsXG4gICdldHN5LmNvbSc6ICdTaG9wcGluZycsXG4gICd0YXJnZXQuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ2Jlc3RidXkuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ2FsaWV4cHJlc3MuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ3Nob3BpZnkuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ3RlbXUuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ3NoZWluLmNvbSc6ICdTaG9wcGluZycsXG4gICd3YXlmYWlyLmNvbSc6ICdTaG9wcGluZycsXG4gICdjb3N0Y28uY29tJzogJ1Nob3BwaW5nJyxcblxuICAvLyBDb21tdW5pY2F0aW9uXG4gICdtYWlsLmdvb2dsZS5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICdvdXRsb29rLmxpdmUuY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnc2xhY2suY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnZGlzY29yZC5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICd6b29tLnVzJzogJ0NvbW11bmljYXRpb24nLFxuICAndGVhbXMubWljcm9zb2Z0LmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ3doYXRzYXBwLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ3RlbGVncmFtLm9yZyc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ21lc3Nlbmdlci5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICdza3lwZS5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG5cbiAgLy8gRmluYW5jZVxuICAncGF5cGFsLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2NoYXNlLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2JhbmtvZmFtZXJpY2EuY29tJzogJ0ZpbmFuY2UnLFxuICAnd2VsbHNmYXJnby5jb20nOiAnRmluYW5jZScsXG4gICdhbWVyaWNhbmV4cHJlc3MuY29tJzogJ0ZpbmFuY2UnLFxuICAnc3RyaXBlLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2NvaW5iYXNlLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2JpbmFuY2UuY29tJzogJ0ZpbmFuY2UnLFxuICAna3Jha2VuLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ3JvYmluaG9vZC5jb20nOiAnRmluYW5jZScsXG4gICdmaWRlbGl0eS5jb20nOiAnRmluYW5jZScsXG4gICd2YW5ndWFyZC5jb20nOiAnRmluYW5jZScsXG4gICdzY2h3YWIuY29tJzogJ0ZpbmFuY2UnLFxuICAnbWludC5pbnR1aXQuY29tJzogJ0ZpbmFuY2UnLFxuXG4gIC8vIEVkdWNhdGlvblxuICAnd2lraXBlZGlhLm9yZyc6ICdFZHVjYXRpb24nLFxuICAnY291cnNlcmEub3JnJzogJ0VkdWNhdGlvbicsXG4gICd1ZGVteS5jb20nOiAnRWR1Y2F0aW9uJyxcbiAgJ2VkeC5vcmcnOiAnRWR1Y2F0aW9uJyxcbiAgJ2toYW5hY2FkZW15Lm9yZyc6ICdFZHVjYXRpb24nLFxuICAncXVpemxldC5jb20nOiAnRWR1Y2F0aW9uJyxcbiAgJ2R1b2xpbmdvLmNvbSc6ICdFZHVjYXRpb24nLFxuICAnY2FudmFzLmluc3RydWN0dXJlLmNvbSc6ICdFZHVjYXRpb24nLFxuICAnYmxhY2tib2FyZC5jb20nOiAnRWR1Y2F0aW9uJyxcbiAgJ21pdC5lZHUnOiAnRWR1Y2F0aW9uJyxcbiAgJ2hhcnZhcmQuZWR1JzogJ0VkdWNhdGlvbicsXG4gICdzdGFuZm9yZC5lZHUnOiAnRWR1Y2F0aW9uJyxcbiAgJ2FjYWRlbWlhLmVkdSc6ICdFZHVjYXRpb24nLFxuICAncmVzZWFyY2hnYXRlLm5ldCc6ICdFZHVjYXRpb24nLFxuXG4gIC8vIERlc2lnblxuICAnZmlnbWEuY29tJzogJ0Rlc2lnbicsXG4gICdjYW52YS5jb20nOiAnRGVzaWduJyxcbiAgJ2JlaGFuY2UubmV0JzogJ0Rlc2lnbicsXG4gICdkcmliYmJsZS5jb20nOiAnRGVzaWduJyxcbiAgJ2Fkb2JlLmNvbSc6ICdEZXNpZ24nLFxuICAndW5zcGxhc2guY29tJzogJ0Rlc2lnbicsXG4gICdwZXhlbHMuY29tJzogJ0Rlc2lnbicsXG4gICdwaXhhYmF5LmNvbSc6ICdEZXNpZ24nLFxuICAnc2h1dHRlcnN0b2NrLmNvbSc6ICdEZXNpZ24nLFxuXG4gIC8vIFByb2R1Y3Rpdml0eVxuICAnZG9jcy5nb29nbGUuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdzaGVldHMuZ29vZ2xlLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnc2xpZGVzLmdvb2dsZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2RyaXZlLmdvb2dsZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ25vdGlvbi5zbyc6ICdQcm9kdWN0aXZpdHknLFxuICAndHJlbGxvLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnYXNhbmEuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdtb25kYXkuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdhaXJ0YWJsZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2V2ZXJub3RlLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnZHJvcGJveC5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2NsaWNrdXAuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdsaW5lYXIuYXBwJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdtaXJvLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnbHVjaWRjaGFydC5jb20nOiAnUHJvZHVjdGl2aXR5JyxcblxuICAvLyBBSVxuICAnb3BlbmFpLmNvbSc6ICdBSScsXG4gICdjaGF0Z3B0LmNvbSc6ICdBSScsXG4gICdhbnRocm9waWMuY29tJzogJ0FJJyxcbiAgJ21pZGpvdXJuZXkuY29tJzogJ0FJJyxcbiAgJ2h1Z2dpbmdmYWNlLmNvJzogJ0FJJyxcbiAgJ2JhcmQuZ29vZ2xlLmNvbSc6ICdBSScsXG4gICdnZW1pbmkuZ29vZ2xlLmNvbSc6ICdBSScsXG4gICdjbGF1ZGUuYWknOiAnQUknLFxuICAncGVycGxleGl0eS5haSc6ICdBSScsXG4gICdwb2UuY29tJzogJ0FJJyxcblxuICAvLyBNdXNpYy9BdWRpb1xuICAnc3BvdGlmeS5jb20nOiAnTXVzaWMnLFxuICAnc291bmRjbG91ZC5jb20nOiAnTXVzaWMnLFxuICAnbXVzaWMuYXBwbGUuY29tJzogJ011c2ljJyxcbiAgJ3BhbmRvcmEuY29tJzogJ011c2ljJyxcbiAgJ3RpZGFsLmNvbSc6ICdNdXNpYycsXG4gICdiYW5kY2FtcC5jb20nOiAnTXVzaWMnLFxuICAnYXVkaWJsZS5jb20nOiAnTXVzaWMnLFxuXG4gIC8vIEdhbWluZ1xuICAnc3RlYW1wb3dlcmVkLmNvbSc6ICdHYW1pbmcnLFxuICAncm9ibG94LmNvbSc6ICdHYW1pbmcnLFxuICAnZXBpY2dhbWVzLmNvbSc6ICdHYW1pbmcnLFxuICAneGJveC5jb20nOiAnR2FtaW5nJyxcbiAgJ3BsYXlzdGF0aW9uLmNvbSc6ICdHYW1pbmcnLFxuICAnbmludGVuZG8uY29tJzogJ0dhbWluZycsXG4gICdpZ24uY29tJzogJ0dhbWluZycsXG4gICdnYW1lc3BvdC5jb20nOiAnR2FtaW5nJyxcbiAgJ2tvdGFrdS5jb20nOiAnR2FtaW5nJyxcbiAgJ3BvbHlnb24uY29tJzogJ0dhbWluZydcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRHZW5lcmEoaG9zdG5hbWU6IHN0cmluZywgY3VzdG9tUmVnaXN0cnk/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogc3RyaW5nIHwgbnVsbCB7XG4gIGlmICghaG9zdG5hbWUpIHJldHVybiBudWxsO1xuXG4gIC8vIDAuIENoZWNrIGN1c3RvbSByZWdpc3RyeSBmaXJzdFxuICBpZiAoY3VzdG9tUmVnaXN0cnkpIHtcbiAgICAgIGNvbnN0IHBhcnRzID0gaG9zdG5hbWUuc3BsaXQoJy4nKTtcbiAgICAgIC8vIENoZWNrIGZ1bGwgaG9zdG5hbWUgYW5kIHByb2dyZXNzaXZlbHkgc2hvcnRlciBzdWZmaXhlc1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwYXJ0cy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgICAgICBjb25zdCBkb21haW4gPSBwYXJ0cy5zbGljZShpKS5qb2luKCcuJyk7XG4gICAgICAgICAgaWYgKGN1c3RvbVJlZ2lzdHJ5W2RvbWFpbl0pIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGN1c3RvbVJlZ2lzdHJ5W2RvbWFpbl07XG4gICAgICAgICAgfVxuICAgICAgfVxuICB9XG5cbiAgLy8gMS4gRXhhY3QgbWF0Y2hcbiAgaWYgKEdFTkVSQV9SRUdJU1RSWVtob3N0bmFtZV0pIHtcbiAgICByZXR1cm4gR0VORVJBX1JFR0lTVFJZW2hvc3RuYW1lXTtcbiAgfVxuXG4gIC8vIDIuIFN1YmRvbWFpbiBjaGVjayAoc3RyaXBwaW5nIHN1YmRvbWFpbnMpXG4gIC8vIGUuZy4gXCJjb25zb2xlLmF3cy5hbWF6b24uY29tXCIgLT4gXCJhd3MuYW1hem9uLmNvbVwiIC0+IFwiYW1hem9uLmNvbVwiXG4gIGNvbnN0IHBhcnRzID0gaG9zdG5hbWUuc3BsaXQoJy4nKTtcblxuICAvLyBUcnkgbWF0Y2hpbmcgcHJvZ3Jlc3NpdmVseSBzaG9ydGVyIHN1ZmZpeGVzXG4gIC8vIGUuZy4gYS5iLmMuY29tIC0+IGIuYy5jb20gLT4gYy5jb21cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBwYXJ0cy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgIGNvbnN0IGRvbWFpbiA9IHBhcnRzLnNsaWNlKGkpLmpvaW4oJy4nKTtcbiAgICAgIGlmIChHRU5FUkFfUkVHSVNUUllbZG9tYWluXSkge1xuICAgICAgICAgIHJldHVybiBHRU5FUkFfUkVHSVNUUllbZG9tYWluXTtcbiAgICAgIH1cbiAgfVxuXG4gIHJldHVybiBudWxsO1xufVxuIiwgImV4cG9ydCBjb25zdCBnZXRTdG9yZWRWYWx1ZSA9IGFzeW5jIDxUPihrZXk6IHN0cmluZyk6IFByb21pc2U8VCB8IG51bGw+ID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KGtleSwgKGl0ZW1zKSA9PiB7XG4gICAgICByZXNvbHZlKChpdGVtc1trZXldIGFzIFQpID8/IG51bGwpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBzZXRTdG9yZWRWYWx1ZSA9IGFzeW5jIDxUPihrZXk6IHN0cmluZywgdmFsdWU6IFQpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgW2tleV06IHZhbHVlIH0sICgpID0+IHJlc29sdmUoKSk7XG4gIH0pO1xufTtcbiIsICJpbXBvcnQgeyBDdXN0b21TdHJhdGVneSwgUHJlZmVyZW5jZXMsIFNvcnRpbmdTdHJhdGVneSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGdldFN0b3JlZFZhbHVlLCBzZXRTdG9yZWRWYWx1ZSB9IGZyb20gXCIuL3N0b3JhZ2UuanNcIjtcbmltcG9ydCB7IHNldExvZ2dlclByZWZlcmVuY2VzLCBsb2dEZWJ1ZyB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBhc0FycmF5IH0gZnJvbSBcIi4uL3NoYXJlZC91dGlscy5qc1wiO1xuXG5jb25zdCBQUkVGRVJFTkNFU19LRVkgPSBcInByZWZlcmVuY2VzXCI7XG5cbmV4cG9ydCBjb25zdCBkZWZhdWx0UHJlZmVyZW5jZXM6IFByZWZlcmVuY2VzID0ge1xuICBzb3J0aW5nOiBbXCJwaW5uZWRcIiwgXCJyZWNlbmN5XCJdLFxuICBkZWJ1ZzogZmFsc2UsXG4gIGxvZ0xldmVsOiBcImluZm9cIixcbiAgdGhlbWU6IFwiZGFya1wiLFxuICBjdXN0b21HZW5lcmE6IHt9XG59O1xuXG5jb25zdCBub3JtYWxpemVTb3J0aW5nID0gKHNvcnRpbmc6IHVua25vd24pOiBTb3J0aW5nU3RyYXRlZ3lbXSA9PiB7XG4gIGlmIChBcnJheS5pc0FycmF5KHNvcnRpbmcpKSB7XG4gICAgcmV0dXJuIHNvcnRpbmcuZmlsdGVyKCh2YWx1ZSk6IHZhbHVlIGlzIFNvcnRpbmdTdHJhdGVneSA9PiB0eXBlb2YgdmFsdWUgPT09IFwic3RyaW5nXCIpO1xuICB9XG4gIGlmICh0eXBlb2Ygc29ydGluZyA9PT0gXCJzdHJpbmdcIikge1xuICAgIHJldHVybiBbc29ydGluZ107XG4gIH1cbiAgcmV0dXJuIFsuLi5kZWZhdWx0UHJlZmVyZW5jZXMuc29ydGluZ107XG59O1xuXG5jb25zdCBub3JtYWxpemVTdHJhdGVnaWVzID0gKHN0cmF0ZWdpZXM6IHVua25vd24pOiBDdXN0b21TdHJhdGVneVtdID0+IHtcbiAgICBjb25zdCBhcnIgPSBhc0FycmF5PGFueT4oc3RyYXRlZ2llcykuZmlsdGVyKHMgPT4gdHlwZW9mIHMgPT09ICdvYmplY3QnICYmIHMgIT09IG51bGwpO1xuICAgIHJldHVybiBhcnIubWFwKHMgPT4gKHtcbiAgICAgICAgLi4ucyxcbiAgICAgICAgZ3JvdXBpbmdSdWxlczogYXNBcnJheShzLmdyb3VwaW5nUnVsZXMpLFxuICAgICAgICBzb3J0aW5nUnVsZXM6IGFzQXJyYXkocy5zb3J0aW5nUnVsZXMpLFxuICAgICAgICBncm91cFNvcnRpbmdSdWxlczogcy5ncm91cFNvcnRpbmdSdWxlcyA/IGFzQXJyYXkocy5ncm91cFNvcnRpbmdSdWxlcykgOiB1bmRlZmluZWQsXG4gICAgICAgIGZpbHRlcnM6IHMuZmlsdGVycyA/IGFzQXJyYXkocy5maWx0ZXJzKSA6IHVuZGVmaW5lZCxcbiAgICAgICAgZmlsdGVyR3JvdXBzOiBzLmZpbHRlckdyb3VwcyA/IGFzQXJyYXkocy5maWx0ZXJHcm91cHMpLm1hcCgoZzogYW55KSA9PiBhc0FycmF5KGcpKSA6IHVuZGVmaW5lZCxcbiAgICAgICAgcnVsZXM6IHMucnVsZXMgPyBhc0FycmF5KHMucnVsZXMpIDogdW5kZWZpbmVkXG4gICAgfSkpO1xufTtcblxuY29uc3Qgbm9ybWFsaXplUHJlZmVyZW5jZXMgPSAocHJlZnM/OiBQYXJ0aWFsPFByZWZlcmVuY2VzPiB8IG51bGwpOiBQcmVmZXJlbmNlcyA9PiB7XG4gIGNvbnN0IG1lcmdlZCA9IHsgLi4uZGVmYXVsdFByZWZlcmVuY2VzLCAuLi4ocHJlZnMgPz8ge30pIH07XG4gIHJldHVybiB7XG4gICAgLi4ubWVyZ2VkLFxuICAgIHNvcnRpbmc6IG5vcm1hbGl6ZVNvcnRpbmcobWVyZ2VkLnNvcnRpbmcpLFxuICAgIGN1c3RvbVN0cmF0ZWdpZXM6IG5vcm1hbGl6ZVN0cmF0ZWdpZXMobWVyZ2VkLmN1c3RvbVN0cmF0ZWdpZXMpXG4gIH07XG59O1xuXG5leHBvcnQgY29uc3QgbG9hZFByZWZlcmVuY2VzID0gYXN5bmMgKCk6IFByb21pc2U8UHJlZmVyZW5jZXM+ID0+IHtcbiAgY29uc3Qgc3RvcmVkID0gYXdhaXQgZ2V0U3RvcmVkVmFsdWU8UHJlZmVyZW5jZXM+KFBSRUZFUkVOQ0VTX0tFWSk7XG4gIGNvbnN0IG1lcmdlZCA9IG5vcm1hbGl6ZVByZWZlcmVuY2VzKHN0b3JlZCA/PyB1bmRlZmluZWQpO1xuICBzZXRMb2dnZXJQcmVmZXJlbmNlcyhtZXJnZWQpO1xuICByZXR1cm4gbWVyZ2VkO1xufTtcblxuZXhwb3J0IGNvbnN0IHNhdmVQcmVmZXJlbmNlcyA9IGFzeW5jIChwcmVmczogUGFydGlhbDxQcmVmZXJlbmNlcz4pOiBQcm9taXNlPFByZWZlcmVuY2VzPiA9PiB7XG4gIGxvZ0RlYnVnKFwiVXBkYXRpbmcgcHJlZmVyZW5jZXNcIiwgeyBrZXlzOiBPYmplY3Qua2V5cyhwcmVmcykgfSk7XG4gIGNvbnN0IGN1cnJlbnQgPSBhd2FpdCBsb2FkUHJlZmVyZW5jZXMoKTtcbiAgY29uc3QgbWVyZ2VkID0gbm9ybWFsaXplUHJlZmVyZW5jZXMoeyAuLi5jdXJyZW50LCAuLi5wcmVmcyB9KTtcbiAgYXdhaXQgc2V0U3RvcmVkVmFsdWUoUFJFRkVSRU5DRVNfS0VZLCBtZXJnZWQpO1xuICBzZXRMb2dnZXJQcmVmZXJlbmNlcyhtZXJnZWQpO1xuICByZXR1cm4gbWVyZ2VkO1xufTtcbiIsICJpbXBvcnQgeyBQYWdlQ29udGV4dCwgVGFiTWV0YWRhdGEgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBub3JtYWxpemVVcmwsIHBhcnNlWW91VHViZVVybCwgZXh0cmFjdFlvdVR1YmVDaGFubmVsRnJvbUh0bWwsIGV4dHJhY3RZb3VUdWJlR2VucmVGcm9tSHRtbCB9IGZyb20gXCIuL2xvZ2ljLmpzXCI7XG5pbXBvcnQgeyBnZXRHZW5lcmEgfSBmcm9tIFwiLi9nZW5lcmFSZWdpc3RyeS5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgbG9hZFByZWZlcmVuY2VzIH0gZnJvbSBcIi4uL3ByZWZlcmVuY2VzLmpzXCI7XG5cbmludGVyZmFjZSBFeHRyYWN0aW9uUmVzcG9uc2Uge1xuICBkYXRhOiBQYWdlQ29udGV4dCB8IG51bGw7XG4gIGVycm9yPzogc3RyaW5nO1xuICBzdGF0dXM6XG4gICAgfCAnT0snXG4gICAgfCAnUkVTVFJJQ1RFRCdcbiAgICB8ICdJTkpFQ1RJT05fRkFJTEVEJ1xuICAgIHwgJ05PX1JFU1BPTlNFJ1xuICAgIHwgJ05PX0hPU1RfUEVSTUlTU0lPTidcbiAgICB8ICdGUkFNRV9BQ0NFU1NfREVOSUVEJztcbn1cblxuLy8gU2ltcGxlIGNvbmN1cnJlbmN5IGNvbnRyb2xcbmxldCBhY3RpdmVGZXRjaGVzID0gMDtcbmNvbnN0IE1BWF9DT05DVVJSRU5UX0ZFVENIRVMgPSA1OyAvLyBDb25zZXJ2YXRpdmUgbGltaXQgdG8gYXZvaWQgcmF0ZSBsaW1pdGluZ1xuY29uc3QgRkVUQ0hfUVVFVUU6ICgoKSA9PiB2b2lkKVtdID0gW107XG5cbmNvbnN0IGZldGNoV2l0aFRpbWVvdXQgPSBhc3luYyAodXJsOiBzdHJpbmcsIHRpbWVvdXQgPSAyMDAwKTogUHJvbWlzZTxSZXNwb25zZT4gPT4ge1xuICAgIGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG4gICAgY29uc3QgaWQgPSBzZXRUaW1lb3V0KCgpID0+IGNvbnRyb2xsZXIuYWJvcnQoKSwgdGltZW91dCk7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCh1cmwsIHsgc2lnbmFsOiBjb250cm9sbGVyLnNpZ25hbCB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgIH0gZmluYWxseSB7XG4gICAgICAgIGNsZWFyVGltZW91dChpZCk7XG4gICAgfVxufTtcblxuY29uc3QgZW5xdWV1ZUZldGNoID0gYXN5bmMgPFQ+KGZuOiAoKSA9PiBQcm9taXNlPFQ+KTogUHJvbWlzZTxUPiA9PiB7XG4gICAgaWYgKGFjdGl2ZUZldGNoZXMgPj0gTUFYX0NPTkNVUlJFTlRfRkVUQ0hFUykge1xuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IEZFVENIX1FVRVVFLnB1c2gocmVzb2x2ZSkpO1xuICAgIH1cbiAgICBhY3RpdmVGZXRjaGVzKys7XG4gICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIGF3YWl0IGZuKCk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgICAgYWN0aXZlRmV0Y2hlcy0tO1xuICAgICAgICBpZiAoRkVUQ0hfUVVFVUUubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY29uc3QgbmV4dCA9IEZFVENIX1FVRVVFLnNoaWZ0KCk7XG4gICAgICAgICAgICBpZiAobmV4dCkgbmV4dCgpO1xuICAgICAgICB9XG4gICAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGV4dHJhY3RQYWdlQ29udGV4dCA9IGFzeW5jICh0YWI6IFRhYk1ldGFkYXRhIHwgY2hyb21lLnRhYnMuVGFiKTogUHJvbWlzZTxFeHRyYWN0aW9uUmVzcG9uc2U+ID0+IHtcbiAgdHJ5IHtcbiAgICBpZiAoIXRhYiB8fCAhdGFiLnVybCkge1xuICAgICAgICByZXR1cm4geyBkYXRhOiBudWxsLCBlcnJvcjogXCJUYWIgbm90IGZvdW5kIG9yIG5vIFVSTFwiLCBzdGF0dXM6ICdOT19SRVNQT05TRScgfTtcbiAgICB9XG5cbiAgICBpZiAoXG4gICAgICB0YWIudXJsLnN0YXJ0c1dpdGgoJ2Nocm9tZTovLycpIHx8XG4gICAgICB0YWIudXJsLnN0YXJ0c1dpdGgoJ2VkZ2U6Ly8nKSB8fFxuICAgICAgdGFiLnVybC5zdGFydHNXaXRoKCdhYm91dDonKSB8fFxuICAgICAgdGFiLnVybC5zdGFydHNXaXRoKCdjaHJvbWUtZXh0ZW5zaW9uOi8vJykgfHxcbiAgICAgIHRhYi51cmwuc3RhcnRzV2l0aCgnY2hyb21lLWVycm9yOi8vJylcbiAgICApIHtcbiAgICAgICAgcmV0dXJuIHsgZGF0YTogbnVsbCwgZXJyb3I6IFwiUmVzdHJpY3RlZCBVUkwgc2NoZW1lXCIsIHN0YXR1czogJ1JFU1RSSUNURUQnIH07XG4gICAgfVxuXG4gICAgY29uc3QgcHJlZnMgPSBhd2FpdCBsb2FkUHJlZmVyZW5jZXMoKTtcbiAgICBsZXQgYmFzZWxpbmUgPSBidWlsZEJhc2VsaW5lQ29udGV4dCh0YWIgYXMgY2hyb21lLnRhYnMuVGFiLCBwcmVmcy5jdXN0b21HZW5lcmEpO1xuXG4gICAgLy8gRmV0Y2ggYW5kIGVucmljaCBmb3IgWW91VHViZSBpZiBhdXRob3IgaXMgbWlzc2luZyBhbmQgaXQgaXMgYSB2aWRlb1xuICAgIGNvbnN0IHRhcmdldFVybCA9IHRhYi51cmw7XG4gICAgY29uc3QgdXJsT2JqID0gbmV3IFVSTCh0YXJnZXRVcmwpO1xuICAgIGNvbnN0IGhvc3RuYW1lID0gdXJsT2JqLmhvc3RuYW1lLnJlcGxhY2UoL153d3dcXC4vLCAnJyk7XG4gICAgaWYgKChob3N0bmFtZS5lbmRzV2l0aCgneW91dHViZS5jb20nKSB8fCBob3N0bmFtZS5lbmRzV2l0aCgneW91dHUuYmUnKSkgJiYgKCFiYXNlbGluZS5hdXRob3JPckNyZWF0b3IgfHwgYmFzZWxpbmUuZ2VucmUgPT09ICdWaWRlbycpKSB7XG4gICAgICAgICB0cnkge1xuICAgICAgICAgICAgIC8vIFdlIHVzZSBhIHF1ZXVlIHRvIHByZXZlbnQgZmxvb2RpbmcgcmVxdWVzdHNcbiAgICAgICAgICAgICBhd2FpdCBlbnF1ZXVlRmV0Y2goYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoV2l0aFRpbWVvdXQodGFyZ2V0VXJsKTtcbiAgICAgICAgICAgICAgICAgaWYgKHJlc3BvbnNlLm9rKSB7XG4gICAgICAgICAgICAgICAgICAgICBjb25zdCBodG1sID0gYXdhaXQgcmVzcG9uc2UudGV4dCgpO1xuICAgICAgICAgICAgICAgICAgICAgY29uc3QgY2hhbm5lbCA9IGV4dHJhY3RZb3VUdWJlQ2hhbm5lbEZyb21IdG1sKGh0bWwpO1xuICAgICAgICAgICAgICAgICAgICAgaWYgKGNoYW5uZWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICBiYXNlbGluZS5hdXRob3JPckNyZWF0b3IgPSBjaGFubmVsO1xuICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgY29uc3QgZ2VucmUgPSBleHRyYWN0WW91VHViZUdlbnJlRnJvbUh0bWwoaHRtbCk7XG4gICAgICAgICAgICAgICAgICAgICBpZiAoZ2VucmUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICBiYXNlbGluZS5nZW5yZSA9IGdlbnJlO1xuICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgfSk7XG4gICAgICAgICB9IGNhdGNoIChmZXRjaEVycikge1xuICAgICAgICAgICAgIGxvZ0RlYnVnKFwiRmFpbGVkIHRvIGZldGNoIFlvdVR1YmUgcGFnZSBjb250ZW50XCIsIHsgZXJyb3I6IFN0cmluZyhmZXRjaEVycikgfSk7XG4gICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGRhdGE6IGJhc2VsaW5lLFxuICAgICAgc3RhdHVzOiAnT0snXG4gICAgfTtcblxuICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICBsb2dEZWJ1ZyhgRXh0cmFjdGlvbiBmYWlsZWQgZm9yIHRhYiAke3RhYi5pZH1gLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIGRhdGE6IG51bGwsXG4gICAgICBlcnJvcjogU3RyaW5nKGUpLFxuICAgICAgc3RhdHVzOiAnSU5KRUNUSU9OX0ZBSUxFRCdcbiAgICB9O1xuICB9XG59O1xuXG5jb25zdCBidWlsZEJhc2VsaW5lQ29udGV4dCA9ICh0YWI6IGNocm9tZS50YWJzLlRhYiwgY3VzdG9tR2VuZXJhPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPik6IFBhZ2VDb250ZXh0ID0+IHtcbiAgY29uc3QgdXJsID0gdGFiLnVybCB8fCBcIlwiO1xuICBsZXQgaG9zdG5hbWUgPSBcIlwiO1xuICB0cnkge1xuICAgIGhvc3RuYW1lID0gbmV3IFVSTCh1cmwpLmhvc3RuYW1lLnJlcGxhY2UoL153d3dcXC4vLCAnJyk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBob3N0bmFtZSA9IFwiXCI7XG4gIH1cblxuICAvLyBEZXRlcm1pbmUgT2JqZWN0IFR5cGUgZmlyc3RcbiAgbGV0IG9iamVjdFR5cGU6IFBhZ2VDb250ZXh0WydvYmplY3RUeXBlJ10gPSAndW5rbm93bic7XG4gIGxldCBhdXRob3JPckNyZWF0b3I6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXG4gIGlmICh1cmwuaW5jbHVkZXMoJy9sb2dpbicpIHx8IHVybC5pbmNsdWRlcygnL3NpZ25pbicpKSB7XG4gICAgICBvYmplY3RUeXBlID0gJ2xvZ2luJztcbiAgfSBlbHNlIGlmIChob3N0bmFtZS5pbmNsdWRlcygneW91dHViZS5jb20nKSB8fCBob3N0bmFtZS5pbmNsdWRlcygneW91dHUuYmUnKSkge1xuICAgICAgY29uc3QgeyB2aWRlb0lkIH0gPSBwYXJzZVlvdVR1YmVVcmwodXJsKTtcbiAgICAgIGlmICh2aWRlb0lkKSBvYmplY3RUeXBlID0gJ3ZpZGVvJztcblxuICAgICAgLy8gVHJ5IHRvIGd1ZXNzIGNoYW5uZWwgZnJvbSBVUkwgaWYgcG9zc2libGVcbiAgICAgIGlmICh1cmwuaW5jbHVkZXMoJy9AJykpIHtcbiAgICAgICAgICBjb25zdCBwYXJ0cyA9IHVybC5zcGxpdCgnL0AnKTtcbiAgICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICBjb25zdCBoYW5kbGUgPSBwYXJ0c1sxXS5zcGxpdCgnLycpWzBdO1xuICAgICAgICAgICAgICBhdXRob3JPckNyZWF0b3IgPSAnQCcgKyBoYW5kbGU7XG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICh1cmwuaW5jbHVkZXMoJy9jLycpKSB7XG4gICAgICAgICAgY29uc3QgcGFydHMgPSB1cmwuc3BsaXQoJy9jLycpO1xuICAgICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgIGF1dGhvck9yQ3JlYXRvciA9IGRlY29kZVVSSUNvbXBvbmVudChwYXJ0c1sxXS5zcGxpdCgnLycpWzBdKTtcbiAgICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHVybC5pbmNsdWRlcygnL3VzZXIvJykpIHtcbiAgICAgICAgICBjb25zdCBwYXJ0cyA9IHVybC5zcGxpdCgnL3VzZXIvJyk7XG4gICAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgYXV0aG9yT3JDcmVhdG9yID0gZGVjb2RlVVJJQ29tcG9uZW50KHBhcnRzWzFdLnNwbGl0KCcvJylbMF0pO1xuICAgICAgICAgIH1cbiAgICAgIH1cbiAgfSBlbHNlIGlmIChob3N0bmFtZSA9PT0gJ2dpdGh1Yi5jb20nICYmIHVybC5pbmNsdWRlcygnL3B1bGwvJykpIHtcbiAgICAgIG9iamVjdFR5cGUgPSAndGlja2V0JztcbiAgfSBlbHNlIGlmIChob3N0bmFtZSA9PT0gJ2dpdGh1Yi5jb20nICYmICF1cmwuaW5jbHVkZXMoJy9wdWxsLycpICYmIHVybC5zcGxpdCgnLycpLmxlbmd0aCA+PSA1KSB7XG4gICAgICAvLyByb3VnaCBjaGVjayBmb3IgcmVwb1xuICAgICAgb2JqZWN0VHlwZSA9ICdyZXBvJztcbiAgfVxuXG4gIC8vIERldGVybWluZSBHZW5yZVxuICAvLyBQcmlvcml0eSAxOiBTaXRlLXNwZWNpZmljIGV4dHJhY3Rpb24gKGRlcml2ZWQgZnJvbSBvYmplY3RUeXBlKVxuICBsZXQgZ2VucmU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICBpZiAob2JqZWN0VHlwZSA9PT0gJ3ZpZGVvJykgZ2VucmUgPSAnVmlkZW8nO1xuICBlbHNlIGlmIChvYmplY3RUeXBlID09PSAncmVwbycgfHwgb2JqZWN0VHlwZSA9PT0gJ3RpY2tldCcpIGdlbnJlID0gJ0RldmVsb3BtZW50JztcblxuICAvLyBQcmlvcml0eSAyOiBGYWxsYmFjayB0byBSZWdpc3RyeVxuICBpZiAoIWdlbnJlKSB7XG4gICAgIGdlbnJlID0gZ2V0R2VuZXJhKGhvc3RuYW1lLCBjdXN0b21HZW5lcmEpIHx8IHVuZGVmaW5lZDtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY2Fub25pY2FsVXJsOiB1cmwgfHwgbnVsbCxcbiAgICBub3JtYWxpemVkVXJsOiBub3JtYWxpemVVcmwodXJsKSxcbiAgICBzaXRlTmFtZTogaG9zdG5hbWUgfHwgbnVsbCxcbiAgICBwbGF0Zm9ybTogaG9zdG5hbWUgfHwgbnVsbCxcbiAgICBvYmplY3RUeXBlLFxuICAgIG9iamVjdElkOiB1cmwgfHwgbnVsbCxcbiAgICB0aXRsZTogdGFiLnRpdGxlIHx8IG51bGwsXG4gICAgZ2VucmUsXG4gICAgZGVzY3JpcHRpb246IG51bGwsXG4gICAgYXV0aG9yT3JDcmVhdG9yOiBhdXRob3JPckNyZWF0b3IsXG4gICAgcHVibGlzaGVkQXQ6IG51bGwsXG4gICAgbW9kaWZpZWRBdDogbnVsbCxcbiAgICBsYW5ndWFnZTogbnVsbCxcbiAgICB0YWdzOiBbXSxcbiAgICBicmVhZGNydW1iczogW10sXG4gICAgaXNBdWRpYmxlOiBmYWxzZSxcbiAgICBpc011dGVkOiBmYWxzZSxcbiAgICBpc0NhcHR1cmluZzogZmFsc2UsXG4gICAgcHJvZ3Jlc3M6IG51bGwsXG4gICAgaGFzVW5zYXZlZENoYW5nZXNMaWtlbHk6IGZhbHNlLFxuICAgIGlzQXV0aGVudGljYXRlZExpa2VseTogZmFsc2UsXG4gICAgc291cmNlczoge1xuICAgICAgY2Fub25pY2FsVXJsOiAndXJsJyxcbiAgICAgIG5vcm1hbGl6ZWRVcmw6ICd1cmwnLFxuICAgICAgc2l0ZU5hbWU6ICd1cmwnLFxuICAgICAgcGxhdGZvcm06ICd1cmwnLFxuICAgICAgb2JqZWN0VHlwZTogJ3VybCcsXG4gICAgICB0aXRsZTogdGFiLnRpdGxlID8gJ3RhYicgOiAndXJsJyxcbiAgICAgIGdlbnJlOiAncmVnaXN0cnknXG4gICAgfSxcbiAgICBjb25maWRlbmNlOiB7fVxuICB9O1xufTtcbiIsICJleHBvcnQgdHlwZSBDYXRlZ29yeVJ1bGUgPSBzdHJpbmcgfCBzdHJpbmdbXTtcblxuZXhwb3J0IGludGVyZmFjZSBDYXRlZ29yeURlZmluaXRpb24ge1xuICBjYXRlZ29yeTogc3RyaW5nO1xuICBydWxlczogQ2F0ZWdvcnlSdWxlW107XG59XG5cbmV4cG9ydCBjb25zdCBDQVRFR09SWV9ERUZJTklUSU9OUzogQ2F0ZWdvcnlEZWZpbml0aW9uW10gPSBbXG4gIHtcbiAgICBjYXRlZ29yeTogXCJEZXZlbG9wbWVudFwiLFxuICAgIHJ1bGVzOiBbXCJnaXRodWJcIiwgXCJzdGFja292ZXJmbG93XCIsIFwibG9jYWxob3N0XCIsIFwiamlyYVwiLCBcImdpdGxhYlwiXVxuICB9LFxuICB7XG4gICAgY2F0ZWdvcnk6IFwiV29ya1wiLFxuICAgIHJ1bGVzOiBbXG4gICAgICBbXCJnb29nbGVcIiwgXCJkb2NzXCJdLCBbXCJnb29nbGVcIiwgXCJzaGVldHNcIl0sIFtcImdvb2dsZVwiLCBcInNsaWRlc1wiXSxcbiAgICAgIFwibGlua2VkaW5cIiwgXCJzbGFja1wiLCBcInpvb21cIiwgXCJ0ZWFtc1wiXG4gICAgXVxuICB9LFxuICB7XG4gICAgY2F0ZWdvcnk6IFwiRW50ZXJ0YWlubWVudFwiLFxuICAgIHJ1bGVzOiBbXCJuZXRmbGl4XCIsIFwic3BvdGlmeVwiLCBcImh1bHVcIiwgXCJkaXNuZXlcIiwgXCJ5b3V0dWJlXCJdXG4gIH0sXG4gIHtcbiAgICBjYXRlZ29yeTogXCJTb2NpYWxcIixcbiAgICBydWxlczogW1widHdpdHRlclwiLCBcImZhY2Vib29rXCIsIFwiaW5zdGFncmFtXCIsIFwicmVkZGl0XCIsIFwidGlrdG9rXCIsIFwicGludGVyZXN0XCJdXG4gIH0sXG4gIHtcbiAgICBjYXRlZ29yeTogXCJTaG9wcGluZ1wiLFxuICAgIHJ1bGVzOiBbXCJhbWF6b25cIiwgXCJlYmF5XCIsIFwid2FsbWFydFwiLCBcInRhcmdldFwiLCBcInNob3BpZnlcIl1cbiAgfSxcbiAge1xuICAgIGNhdGVnb3J5OiBcIk5ld3NcIixcbiAgICBydWxlczogW1wiY25uXCIsIFwiYmJjXCIsIFwibnl0aW1lc1wiLCBcIndhc2hpbmd0b25wb3N0XCIsIFwiZm94bmV3c1wiXVxuICB9LFxuICB7XG4gICAgY2F0ZWdvcnk6IFwiRWR1Y2F0aW9uXCIsXG4gICAgcnVsZXM6IFtcImNvdXJzZXJhXCIsIFwidWRlbXlcIiwgXCJlZHhcIiwgXCJraGFuYWNhZGVteVwiLCBcImNhbnZhc1wiXVxuICB9LFxuICB7XG4gICAgY2F0ZWdvcnk6IFwiVHJhdmVsXCIsXG4gICAgcnVsZXM6IFtcImV4cGVkaWFcIiwgXCJib29raW5nXCIsIFwiYWlyYm5iXCIsIFwidHJpcGFkdmlzb3JcIiwgXCJrYXlha1wiXVxuICB9LFxuICB7XG4gICAgY2F0ZWdvcnk6IFwiSGVhbHRoXCIsXG4gICAgcnVsZXM6IFtcIndlYm1kXCIsIFwibWF5b2NsaW5pY1wiLCBcIm5paC5nb3ZcIiwgXCJoZWFsdGhcIl1cbiAgfSxcbiAge1xuICAgIGNhdGVnb3J5OiBcIlNwb3J0c1wiLFxuICAgIHJ1bGVzOiBbXCJlc3BuXCIsIFwibmJhXCIsIFwibmZsXCIsIFwibWxiXCIsIFwiZmlmYVwiXVxuICB9LFxuICB7XG4gICAgY2F0ZWdvcnk6IFwiVGVjaG5vbG9neVwiLFxuICAgIHJ1bGVzOiBbXCJ0ZWNoY3J1bmNoXCIsIFwid2lyZWRcIiwgXCJ0aGV2ZXJnZVwiLCBcImFyc3RlY2huaWNhXCJdXG4gIH0sXG4gIHtcbiAgICBjYXRlZ29yeTogXCJTY2llbmNlXCIsXG4gICAgcnVsZXM6IFtcInNjaWVuY2VcIiwgXCJuYXR1cmUuY29tXCIsIFwibmFzYS5nb3ZcIl1cbiAgfSxcbiAge1xuICAgIGNhdGVnb3J5OiBcIkdhbWluZ1wiLFxuICAgIHJ1bGVzOiBbXCJ0d2l0Y2hcIiwgXCJzdGVhbVwiLCBcInJvYmxveFwiLCBcImlnblwiLCBcImdhbWVzcG90XCJdXG4gIH0sXG4gIHtcbiAgICBjYXRlZ29yeTogXCJNdXNpY1wiLFxuICAgIHJ1bGVzOiBbXCJzb3VuZGNsb3VkXCIsIFwiYmFuZGNhbXBcIiwgXCJsYXN0LmZtXCJdXG4gIH0sXG4gIHtcbiAgICBjYXRlZ29yeTogXCJBcnRcIixcbiAgICBydWxlczogW1wiZGV2aWFudGFydFwiLCBcImJlaGFuY2VcIiwgXCJkcmliYmJsZVwiLCBcImFydHN0YXRpb25cIl1cbiAgfVxuXTtcblxuZXhwb3J0IGNvbnN0IGdldENhdGVnb3J5RnJvbVVybCA9ICh1cmw6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGxvd2VyVXJsID0gdXJsLnRvTG93ZXJDYXNlKCk7XG4gIGZvciAoY29uc3QgZGVmIG9mIENBVEVHT1JZX0RFRklOSVRJT05TKSB7XG4gICAgZm9yIChjb25zdCBydWxlIG9mIGRlZi5ydWxlcykge1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkocnVsZSkpIHtcbiAgICAgICAgaWYgKHJ1bGUuZXZlcnkocGFydCA9PiBsb3dlclVybC5pbmNsdWRlcyhwYXJ0KSkpIHtcbiAgICAgICAgICByZXR1cm4gZGVmLmNhdGVnb3J5O1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAobG93ZXJVcmwuaW5jbHVkZXMocnVsZSkpIHtcbiAgICAgICAgICByZXR1cm4gZGVmLmNhdGVnb3J5O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBcIlVuY2F0ZWdvcml6ZWRcIjtcbn07XG4iLCAiaW1wb3J0IHsgVGFiTWV0YWRhdGEsIFBhZ2VDb250ZXh0IH0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcsIGxvZ0Vycm9yIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGV4dHJhY3RQYWdlQ29udGV4dCB9IGZyb20gXCIuL2V4dHJhY3Rpb24vaW5kZXguanNcIjtcbmltcG9ydCB7IGdldENhdGVnb3J5RnJvbVVybCB9IGZyb20gXCIuL2NhdGVnb3J5UnVsZXMuanNcIjtcblxuZXhwb3J0IGludGVyZmFjZSBDb250ZXh0UmVzdWx0IHtcbiAgY29udGV4dDogc3RyaW5nO1xuICBzb3VyY2U6ICdBSScgfCAnSGV1cmlzdGljJyB8ICdFeHRyYWN0aW9uJztcbiAgZGF0YT86IFBhZ2VDb250ZXh0O1xuICBlcnJvcj86IHN0cmluZztcbiAgc3RhdHVzPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgQ2FjaGVFbnRyeSB7XG4gIHJlc3VsdDogQ29udGV4dFJlc3VsdDtcbiAgdGltZXN0YW1wOiBudW1iZXI7XG4gIC8vIFdlIHVzZSB0aGlzIHRvIGRlY2lkZSB3aGVuIHRvIGludmFsaWRhdGUgY2FjaGVcbn1cblxuY29uc3QgY29udGV4dENhY2hlID0gbmV3IE1hcDxzdHJpbmcsIENhY2hlRW50cnk+KCk7XG5jb25zdCBDQUNIRV9UVExfU1VDQ0VTUyA9IDI0ICogNjAgKiA2MCAqIDEwMDA7IC8vIDI0IGhvdXJzXG5jb25zdCBDQUNIRV9UVExfRVJST1IgPSA1ICogNjAgKiAxMDAwOyAvLyA1IG1pbnV0ZXNcblxuZXhwb3J0IGNvbnN0IGFuYWx5emVUYWJDb250ZXh0ID0gYXN5bmMgKFxuICB0YWJzOiBUYWJNZXRhZGF0YVtdLFxuICBvblByb2dyZXNzPzogKGNvbXBsZXRlZDogbnVtYmVyLCB0b3RhbDogbnVtYmVyKSA9PiB2b2lkXG4pOiBQcm9taXNlPE1hcDxudW1iZXIsIENvbnRleHRSZXN1bHQ+PiA9PiB7XG4gIGNvbnN0IGNvbnRleHRNYXAgPSBuZXcgTWFwPG51bWJlciwgQ29udGV4dFJlc3VsdD4oKTtcbiAgbGV0IGNvbXBsZXRlZCA9IDA7XG4gIGNvbnN0IHRvdGFsID0gdGFicy5sZW5ndGg7XG5cbiAgY29uc3QgcHJvbWlzZXMgPSB0YWJzLm1hcChhc3luYyAodGFiKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGNhY2hlS2V5ID0gYCR7dGFiLmlkfTo6JHt0YWIudXJsfWA7XG4gICAgICBjb25zdCBjYWNoZWQgPSBjb250ZXh0Q2FjaGUuZ2V0KGNhY2hlS2V5KTtcblxuICAgICAgaWYgKGNhY2hlZCkge1xuICAgICAgICBjb25zdCBpc0Vycm9yID0gY2FjaGVkLnJlc3VsdC5zdGF0dXMgPT09ICdFUlJPUicgfHwgISFjYWNoZWQucmVzdWx0LmVycm9yO1xuICAgICAgICBjb25zdCB0dGwgPSBpc0Vycm9yID8gQ0FDSEVfVFRMX0VSUk9SIDogQ0FDSEVfVFRMX1NVQ0NFU1M7XG5cbiAgICAgICAgaWYgKERhdGUubm93KCkgLSBjYWNoZWQudGltZXN0YW1wIDwgdHRsKSB7XG4gICAgICAgICAgY29udGV4dE1hcC5zZXQodGFiLmlkLCBjYWNoZWQucmVzdWx0KTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29udGV4dENhY2hlLmRlbGV0ZShjYWNoZUtleSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZmV0Y2hDb250ZXh0Rm9yVGFiKHRhYik7XG5cbiAgICAgIC8vIENhY2hlIHdpdGggZXhwaXJhdGlvbiBsb2dpY1xuICAgICAgY29udGV4dENhY2hlLnNldChjYWNoZUtleSwge1xuICAgICAgICByZXN1bHQsXG4gICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKVxuICAgICAgfSk7XG5cbiAgICAgIGNvbnRleHRNYXAuc2V0KHRhYi5pZCwgcmVzdWx0KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nRXJyb3IoYEZhaWxlZCB0byBhbmFseXplIGNvbnRleHQgZm9yIHRhYiAke3RhYi5pZH1gLCB7IGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICAgICAgLy8gRXZlbiBpZiBmZXRjaENvbnRleHRGb3JUYWIgZmFpbHMgY29tcGxldGVseSwgd2UgdHJ5IGEgc2FmZSBzeW5jIGZhbGxiYWNrXG4gICAgICBjb250ZXh0TWFwLnNldCh0YWIuaWQsIHsgY29udGV4dDogXCJVbmNhdGVnb3JpemVkXCIsIHNvdXJjZTogJ0hldXJpc3RpYycsIGVycm9yOiBTdHJpbmcoZXJyb3IpLCBzdGF0dXM6ICdFUlJPUicgfSk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGNvbXBsZXRlZCsrO1xuICAgICAgaWYgKG9uUHJvZ3Jlc3MpIG9uUHJvZ3Jlc3MoY29tcGxldGVkLCB0b3RhbCk7XG4gICAgfVxuICB9KTtcblxuICBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gIHJldHVybiBjb250ZXh0TWFwO1xufTtcblxuY29uc3QgZmV0Y2hDb250ZXh0Rm9yVGFiID0gYXN5bmMgKHRhYjogVGFiTWV0YWRhdGEpOiBQcm9taXNlPENvbnRleHRSZXN1bHQ+ID0+IHtcbiAgLy8gMS4gUnVuIEdlbmVyaWMgRXh0cmFjdGlvbiAoQWx3YXlzKVxuICBsZXQgZGF0YTogUGFnZUNvbnRleHQgfCBudWxsID0gbnVsbDtcbiAgbGV0IGVycm9yOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gIGxldCBzdGF0dXM6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICB0cnkge1xuICAgICAgY29uc3QgZXh0cmFjdGlvbiA9IGF3YWl0IGV4dHJhY3RQYWdlQ29udGV4dCh0YWIpO1xuICAgICAgZGF0YSA9IGV4dHJhY3Rpb24uZGF0YTtcbiAgICAgIGVycm9yID0gZXh0cmFjdGlvbi5lcnJvcjtcbiAgICAgIHN0YXR1cyA9IGV4dHJhY3Rpb24uc3RhdHVzO1xuICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2dEZWJ1ZyhgRXh0cmFjdGlvbiBmYWlsZWQgZm9yIHRhYiAke3RhYi5pZH1gLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICBlcnJvciA9IFN0cmluZyhlKTtcbiAgICAgIHN0YXR1cyA9ICdFUlJPUic7XG4gIH1cblxuICBsZXQgY29udGV4dCA9IFwiVW5jYXRlZ29yaXplZFwiO1xuICBsZXQgc291cmNlOiBDb250ZXh0UmVzdWx0Wydzb3VyY2UnXSA9ICdIZXVyaXN0aWMnO1xuXG4gIC8vIDIuIFRyeSB0byBEZXRlcm1pbmUgQ2F0ZWdvcnkgZnJvbSBFeHRyYWN0aW9uIERhdGFcbiAgaWYgKGRhdGEpIHtcbiAgICAgIGlmIChkYXRhLnBsYXRmb3JtID09PSAnWW91VHViZScgfHwgZGF0YS5wbGF0Zm9ybSA9PT0gJ05ldGZsaXgnIHx8IGRhdGEucGxhdGZvcm0gPT09ICdTcG90aWZ5JyB8fCBkYXRhLnBsYXRmb3JtID09PSAnVHdpdGNoJykge1xuICAgICAgICAgIGNvbnRleHQgPSBcIkVudGVydGFpbm1lbnRcIjtcbiAgICAgICAgICBzb3VyY2UgPSAnRXh0cmFjdGlvbic7XG4gICAgICB9IGVsc2UgaWYgKGRhdGEucGxhdGZvcm0gPT09ICdHaXRIdWInIHx8IGRhdGEucGxhdGZvcm0gPT09ICdTdGFjayBPdmVyZmxvdycgfHwgZGF0YS5wbGF0Zm9ybSA9PT0gJ0ppcmEnIHx8IGRhdGEucGxhdGZvcm0gPT09ICdHaXRMYWInKSB7XG4gICAgICAgICAgY29udGV4dCA9IFwiRGV2ZWxvcG1lbnRcIjtcbiAgICAgICAgICBzb3VyY2UgPSAnRXh0cmFjdGlvbic7XG4gICAgICB9IGVsc2UgaWYgKGRhdGEucGxhdGZvcm0gPT09ICdHb29nbGUnICYmIChkYXRhLm5vcm1hbGl6ZWRVcmwuaW5jbHVkZXMoJ2RvY3MnKSB8fCBkYXRhLm5vcm1hbGl6ZWRVcmwuaW5jbHVkZXMoJ3NoZWV0cycpIHx8IGRhdGEubm9ybWFsaXplZFVybC5pbmNsdWRlcygnc2xpZGVzJykpKSB7XG4gICAgICAgICAgY29udGV4dCA9IFwiV29ya1wiO1xuICAgICAgICAgIHNvdXJjZSA9ICdFeHRyYWN0aW9uJztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIElmIHdlIGhhdmUgc3VjY2Vzc2Z1bCBleHRyYWN0aW9uIGRhdGEgYnV0IG5vIHNwZWNpZmljIHJ1bGUgbWF0Y2hlZCxcbiAgICAgICAgLy8gdXNlIHRoZSBPYmplY3QgVHlwZSBvciBnZW5lcmljIFwiR2VuZXJhbCBXZWJcIiB0byBpbmRpY2F0ZSBleHRyYWN0aW9uIHdvcmtlZC5cbiAgICAgICAgLy8gV2UgcHJlZmVyIHNwZWNpZmljIGNhdGVnb3JpZXMsIGJ1dCBcIkFydGljbGVcIiBvciBcIlZpZGVvXCIgYXJlIGJldHRlciB0aGFuIFwiVW5jYXRlZ29yaXplZFwiLlxuICAgICAgICBpZiAoZGF0YS5vYmplY3RUeXBlICYmIGRhdGEub2JqZWN0VHlwZSAhPT0gJ3Vua25vd24nKSB7XG4gICAgICAgICAgICAgLy8gTWFwIG9iamVjdCB0eXBlcyB0byBjYXRlZ29yaWVzIGlmIHBvc3NpYmxlXG4gICAgICAgICAgICAgaWYgKGRhdGEub2JqZWN0VHlwZSA9PT0gJ3ZpZGVvJykgY29udGV4dCA9ICdFbnRlcnRhaW5tZW50JztcbiAgICAgICAgICAgICBlbHNlIGlmIChkYXRhLm9iamVjdFR5cGUgPT09ICdhcnRpY2xlJykgY29udGV4dCA9ICdOZXdzJzsgLy8gTG9vc2UgbWFwcGluZywgYnV0IGJldHRlciB0aGFuIG5vdGhpbmdcbiAgICAgICAgICAgICBlbHNlIGNvbnRleHQgPSBkYXRhLm9iamVjdFR5cGUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBkYXRhLm9iamVjdFR5cGUuc2xpY2UoMSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgY29udGV4dCA9IFwiR2VuZXJhbCBXZWJcIjtcbiAgICAgICAgfVxuICAgICAgICBzb3VyY2UgPSAnRXh0cmFjdGlvbic7XG4gICAgICB9XG4gIH1cblxuICAvLyAzLiBGYWxsYmFjayB0byBMb2NhbCBIZXVyaXN0aWMgKFVSTCBSZWdleClcbiAgaWYgKGNvbnRleHQgPT09IFwiVW5jYXRlZ29yaXplZFwiKSB7XG4gICAgICBjb25zdCBoID0gYXdhaXQgbG9jYWxIZXVyaXN0aWModGFiKTtcbiAgICAgIGlmIChoLmNvbnRleHQgIT09IFwiVW5jYXRlZ29yaXplZFwiKSB7XG4gICAgICAgICAgY29udGV4dCA9IGguY29udGV4dDtcbiAgICAgICAgICAvLyBzb3VyY2UgcmVtYWlucyAnSGV1cmlzdGljJyAob3IgbWF5YmUgd2Ugc2hvdWxkIHNheSAnSGV1cmlzdGljJyBpcyB0aGUgc291cmNlPylcbiAgICAgICAgICAvLyBUaGUgbG9jYWxIZXVyaXN0aWMgZnVuY3Rpb24gcmV0dXJucyB7IHNvdXJjZTogJ0hldXJpc3RpYycgfVxuICAgICAgfVxuICB9XG5cbiAgLy8gNC4gRmFsbGJhY2sgdG8gQUkgKExMTSkgLSBSRU1PVkVEXG4gIC8vIFRoZSBIdWdnaW5nRmFjZSBBUEkgZW5kcG9pbnQgaXMgNDEwIEdvbmUgYW5kL29yIHJlcXVpcmVzIGF1dGhlbnRpY2F0aW9uIHdoaWNoIHdlIGRvIG5vdCBoYXZlLlxuICAvLyBUaGUgY29kZSBoYXMgYmVlbiByZW1vdmVkIHRvIHByZXZlbnQgZXJyb3JzLlxuXG4gIGlmIChjb250ZXh0ICE9PSBcIlVuY2F0ZWdvcml6ZWRcIiAmJiBzb3VyY2UgIT09IFwiRXh0cmFjdGlvblwiKSB7XG4gICAgZXJyb3IgPSB1bmRlZmluZWQ7XG4gICAgc3RhdHVzID0gdW5kZWZpbmVkO1xuICB9XG5cbiAgcmV0dXJuIHsgY29udGV4dCwgc291cmNlLCBkYXRhOiBkYXRhIHx8IHVuZGVmaW5lZCwgZXJyb3IsIHN0YXR1cyB9O1xufTtcblxuY29uc3QgbG9jYWxIZXVyaXN0aWMgPSBhc3luYyAodGFiOiBUYWJNZXRhZGF0YSk6IFByb21pc2U8Q29udGV4dFJlc3VsdD4gPT4ge1xuICBjb25zdCBjb250ZXh0ID0gZ2V0Q2F0ZWdvcnlGcm9tVXJsKHRhYi51cmwpO1xuICByZXR1cm4geyBjb250ZXh0LCBzb3VyY2U6ICdIZXVyaXN0aWMnIH07XG59O1xuIiwgImltcG9ydCB7IGdyb3VwVGFicywgZ2V0Q3VzdG9tU3RyYXRlZ2llcywgZ2V0RmllbGRWYWx1ZSwgcmVxdWlyZXNDb250ZXh0QW5hbHlzaXMgfSBmcm9tIFwiLi9ncm91cGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IHNvcnRUYWJzLCBjb21wYXJlQnkgfSBmcm9tIFwiLi9zb3J0aW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgYW5hbHl6ZVRhYkNvbnRleHQgfSBmcm9tIFwiLi9jb250ZXh0QW5hbHlzaXMuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnLCBsb2dFcnJvciwgbG9nSW5mbyB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBHcm91cGluZ1NlbGVjdGlvbiwgUHJlZmVyZW5jZXMsIFRhYkdyb3VwLCBUYWJNZXRhZGF0YSwgU29ydGluZ1J1bGUgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBnZXRTdG9yZWRWYWx1ZSwgc2V0U3RvcmVkVmFsdWUgfSBmcm9tIFwiLi9zdG9yYWdlLmpzXCI7XG5pbXBvcnQgeyBtYXBDaHJvbWVUYWIsIGFzQXJyYXkgfSBmcm9tIFwiLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5cbmNvbnN0IGdldFRhYnNGb3JGaWx0ZXIgPSBhc3luYyAoZmlsdGVyPzogR3JvdXBpbmdTZWxlY3Rpb24pOiBQcm9taXNlPGNocm9tZS50YWJzLlRhYltdPiA9PiB7XG4gIGNvbnN0IHdpbmRvd0lkcyA9IGZpbHRlcj8ud2luZG93SWRzO1xuICBjb25zdCB0YWJJZHMgPSBmaWx0ZXI/LnRhYklkcztcbiAgY29uc3QgaGFzV2luZG93SWRzID0gd2luZG93SWRzICYmIHdpbmRvd0lkcy5sZW5ndGggPiAwO1xuICBjb25zdCBoYXNUYWJJZHMgPSB0YWJJZHMgJiYgdGFiSWRzLmxlbmd0aCA+IDA7XG5cbiAgaWYgKCFmaWx0ZXIgfHwgKCFoYXNXaW5kb3dJZHMgJiYgIWhhc1RhYklkcykpIHtcbiAgICByZXR1cm4gY2hyb21lLnRhYnMucXVlcnkoe30pO1xuICB9XG5cbiAgY29uc3QgcHJvbWlzZXM6IFByb21pc2U8YW55PltdID0gW107XG5cbiAgaWYgKGhhc1dpbmRvd0lkcykge1xuICAgIHdpbmRvd0lkcy5mb3JFYWNoKHdpbmRvd0lkID0+IHtcbiAgICAgIHByb21pc2VzLnB1c2goY2hyb21lLnRhYnMucXVlcnkoeyB3aW5kb3dJZCB9KS5jYXRjaCgoKSA9PiBbXSkpO1xuICAgIH0pO1xuICB9XG5cbiAgaWYgKGhhc1RhYklkcykge1xuICAgIHRhYklkcy5mb3JFYWNoKHRhYklkID0+IHtcbiAgICAgIHByb21pc2VzLnB1c2goY2hyb21lLnRhYnMuZ2V0KHRhYklkKS5jYXRjaCgoKSA9PiBudWxsKSk7XG4gICAgfSk7XG4gIH1cblxuICBjb25zdCByZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuXG4gIC8vIEZsYXR0ZW4gYW5kIGZpbHRlciBvdXQgbnVsbHNcbiAgY29uc3QgYWxsVGFiczogY2hyb21lLnRhYnMuVGFiW10gPSBbXTtcbiAgZm9yIChjb25zdCByZXMgb2YgcmVzdWx0cykge1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkocmVzKSkge1xuICAgICAgICAgIGFsbFRhYnMucHVzaCguLi5yZXMpO1xuICAgICAgfSBlbHNlIGlmIChyZXMpIHtcbiAgICAgICAgICBhbGxUYWJzLnB1c2gocmVzKTtcbiAgICAgIH1cbiAgfVxuXG4gIC8vIERlZHVwbGljYXRlIGJ5IElEXG4gIGNvbnN0IHVuaXF1ZVRhYnMgPSBuZXcgTWFwPG51bWJlciwgY2hyb21lLnRhYnMuVGFiPigpO1xuICBmb3IgKGNvbnN0IHRhYiBvZiBhbGxUYWJzKSB7XG4gICAgICBpZiAodGFiLmlkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICB1bmlxdWVUYWJzLnNldCh0YWIuaWQsIHRhYik7XG4gICAgICB9XG4gIH1cblxuICByZXR1cm4gQXJyYXkuZnJvbSh1bmlxdWVUYWJzLnZhbHVlcygpKTtcbn07XG5cbmV4cG9ydCBjb25zdCBmZXRjaEN1cnJlbnRUYWJHcm91cHMgPSBhc3luYyAoXG4gIHByZWZlcmVuY2VzOiBQcmVmZXJlbmNlcyxcbiAgb25Qcm9ncmVzcz86IChjb21wbGV0ZWQ6IG51bWJlciwgdG90YWw6IG51bWJlcikgPT4gdm9pZFxuKTogUHJvbWlzZTxUYWJHcm91cFtdPiA9PiB7XG4gIHRyeSB7XG4gIGNvbnN0IHRhYnMgPSBhd2FpdCBjaHJvbWUudGFicy5xdWVyeSh7fSk7XG4gIGNvbnN0IGdyb3VwcyA9IGF3YWl0IGNocm9tZS50YWJHcm91cHMucXVlcnkoe30pO1xuICBjb25zdCBncm91cE1hcCA9IG5ldyBNYXAoZ3JvdXBzLm1hcChnID0+IFtnLmlkLCBnXSkpO1xuXG4gIC8vIE1hcCB0YWJzIHRvIG1ldGFkYXRhXG4gIGNvbnN0IG1hcHBlZCA9IHRhYnMubWFwKG1hcENocm9tZVRhYikuZmlsdGVyKCh0KTogdCBpcyBUYWJNZXRhZGF0YSA9PiBCb29sZWFuKHQpKTtcblxuICBpZiAocmVxdWlyZXNDb250ZXh0QW5hbHlzaXMocHJlZmVyZW5jZXMuc29ydGluZykpIHtcbiAgICAgIGNvbnN0IGNvbnRleHRNYXAgPSBhd2FpdCBhbmFseXplVGFiQ29udGV4dChtYXBwZWQsIG9uUHJvZ3Jlc3MpO1xuICAgICAgbWFwcGVkLmZvckVhY2godGFiID0+IHtcbiAgICAgICAgY29uc3QgcmVzID0gY29udGV4dE1hcC5nZXQodGFiLmlkKTtcbiAgICAgICAgdGFiLmNvbnRleHQgPSByZXM/LmNvbnRleHQ7XG4gICAgICAgIHRhYi5jb250ZXh0RGF0YSA9IHJlcz8uZGF0YTtcbiAgICAgIH0pO1xuICB9XG5cbiAgY29uc3QgcmVzdWx0R3JvdXBzOiBUYWJHcm91cFtdID0gW107XG4gIGNvbnN0IHRhYnNCeUdyb3VwSWQgPSBuZXcgTWFwPG51bWJlciwgVGFiTWV0YWRhdGFbXT4oKTtcbiAgY29uc3QgdGFic0J5V2luZG93VW5ncm91cGVkID0gbmV3IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhW10+KCk7XG5cbiAgbWFwcGVkLmZvckVhY2godGFiID0+IHtcbiAgICAgIGNvbnN0IGdyb3VwSWQgPSB0YWIuZ3JvdXBJZCA/PyAtMTtcbiAgICAgIGlmIChncm91cElkICE9PSAtMSkge1xuICAgICAgICAgIGlmICghdGFic0J5R3JvdXBJZC5oYXMoZ3JvdXBJZCkpIHRhYnNCeUdyb3VwSWQuc2V0KGdyb3VwSWQsIFtdKTtcbiAgICAgICAgICB0YWJzQnlHcm91cElkLmdldChncm91cElkKSEucHVzaCh0YWIpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgaWYgKCF0YWJzQnlXaW5kb3dVbmdyb3VwZWQuaGFzKHRhYi53aW5kb3dJZCkpIHRhYnNCeVdpbmRvd1VuZ3JvdXBlZC5zZXQodGFiLndpbmRvd0lkLCBbXSk7XG4gICAgICAgICAgIHRhYnNCeVdpbmRvd1VuZ3JvdXBlZC5nZXQodGFiLndpbmRvd0lkKSEucHVzaCh0YWIpO1xuICAgICAgfVxuICB9KTtcblxuICAvLyBDcmVhdGUgVGFiR3JvdXAgb2JqZWN0cyBmb3IgYWN0dWFsIGdyb3Vwc1xuICBmb3IgKGNvbnN0IFtncm91cElkLCBncm91cFRhYnNdIG9mIHRhYnNCeUdyb3VwSWQpIHtcbiAgICAgIGNvbnN0IGJyb3dzZXJHcm91cCA9IGdyb3VwTWFwLmdldChncm91cElkKTtcbiAgICAgIGlmIChicm93c2VyR3JvdXApIHtcbiAgICAgICAgICByZXN1bHRHcm91cHMucHVzaCh7XG4gICAgICAgICAgICAgIGlkOiBgZ3JvdXAtJHtncm91cElkfWAsXG4gICAgICAgICAgICAgIHdpbmRvd0lkOiBicm93c2VyR3JvdXAud2luZG93SWQsXG4gICAgICAgICAgICAgIGxhYmVsOiBicm93c2VyR3JvdXAudGl0bGUgfHwgXCJVbnRpdGxlZCBHcm91cFwiLFxuICAgICAgICAgICAgICBjb2xvcjogYnJvd3Nlckdyb3VwLmNvbG9yLFxuICAgICAgICAgICAgICB0YWJzOiBzb3J0VGFicyhncm91cFRhYnMsIHByZWZlcmVuY2VzLnNvcnRpbmcpLFxuICAgICAgICAgICAgICByZWFzb246IFwiTWFudWFsXCJcbiAgICAgICAgICB9KTtcbiAgICAgIH1cbiAgfVxuXG4gIC8vIEhhbmRsZSB1bmdyb3VwZWQgdGFic1xuICBmb3IgKGNvbnN0IFt3aW5kb3dJZCwgdGFic10gb2YgdGFic0J5V2luZG93VW5ncm91cGVkKSB7XG4gICAgICByZXN1bHRHcm91cHMucHVzaCh7XG4gICAgICAgICAgaWQ6IGB1bmdyb3VwZWQtJHt3aW5kb3dJZH1gLFxuICAgICAgICAgIHdpbmRvd0lkOiB3aW5kb3dJZCxcbiAgICAgICAgICBsYWJlbDogXCJVbmdyb3VwZWRcIixcbiAgICAgICAgICBjb2xvcjogXCJncmV5XCIsXG4gICAgICAgICAgdGFiczogc29ydFRhYnModGFicywgcHJlZmVyZW5jZXMuc29ydGluZyksXG4gICAgICAgICAgcmVhc29uOiBcIlVuZ3JvdXBlZFwiXG4gICAgICB9KTtcbiAgfVxuXG4gIGxvZ0luZm8oXCJGZXRjaGVkIGN1cnJlbnQgdGFiIGdyb3Vwc1wiLCB7IGdyb3VwczogcmVzdWx0R3JvdXBzLmxlbmd0aCwgdGFiczogbWFwcGVkLmxlbmd0aCB9KTtcbiAgcmV0dXJuIHJlc3VsdEdyb3VwcztcbiAgfSBjYXRjaCAoZSkge1xuICAgIGxvZ0Vycm9yKFwiRXJyb3IgaW4gZmV0Y2hDdXJyZW50VGFiR3JvdXBzXCIsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICB0aHJvdyBlO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgY2FsY3VsYXRlVGFiR3JvdXBzID0gYXN5bmMgKFxuICBwcmVmZXJlbmNlczogUHJlZmVyZW5jZXMsXG4gIGZpbHRlcj86IEdyb3VwaW5nU2VsZWN0aW9uLFxuICBvblByb2dyZXNzPzogKGNvbXBsZXRlZDogbnVtYmVyLCB0b3RhbDogbnVtYmVyKSA9PiB2b2lkXG4pOiBQcm9taXNlPFRhYkdyb3VwW10+ID0+IHtcbiAgY29uc3QgY2hyb21lVGFicyA9IGF3YWl0IGdldFRhYnNGb3JGaWx0ZXIoZmlsdGVyKTtcbiAgY29uc3Qgd2luZG93SWRTZXQgPSBuZXcgU2V0KGZpbHRlcj8ud2luZG93SWRzID8/IFtdKTtcbiAgY29uc3QgdGFiSWRTZXQgPSBuZXcgU2V0KGZpbHRlcj8udGFiSWRzID8/IFtdKTtcbiAgY29uc3QgaGFzRmlsdGVycyA9IHdpbmRvd0lkU2V0LnNpemUgPiAwIHx8IHRhYklkU2V0LnNpemUgPiAwO1xuICBjb25zdCBmaWx0ZXJlZFRhYnMgPSBjaHJvbWVUYWJzLmZpbHRlcigodGFiKSA9PiB7XG4gICAgaWYgKCFoYXNGaWx0ZXJzKSByZXR1cm4gdHJ1ZTtcbiAgICByZXR1cm4gKHRhYi53aW5kb3dJZCAmJiB3aW5kb3dJZFNldC5oYXModGFiLndpbmRvd0lkKSkgfHwgKHRhYi5pZCAmJiB0YWJJZFNldC5oYXModGFiLmlkKSk7XG4gIH0pO1xuICBjb25zdCBtYXBwZWQgPSBmaWx0ZXJlZFRhYnNcbiAgICAubWFwKG1hcENocm9tZVRhYilcbiAgICAuZmlsdGVyKCh0YWIpOiB0YWIgaXMgVGFiTWV0YWRhdGEgPT4gQm9vbGVhbih0YWIpKTtcblxuICBpZiAocmVxdWlyZXNDb250ZXh0QW5hbHlzaXMocHJlZmVyZW5jZXMuc29ydGluZykpIHtcbiAgICBjb25zdCBjb250ZXh0TWFwID0gYXdhaXQgYW5hbHl6ZVRhYkNvbnRleHQobWFwcGVkLCBvblByb2dyZXNzKTtcbiAgICBtYXBwZWQuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgY29uc3QgcmVzID0gY29udGV4dE1hcC5nZXQodGFiLmlkKTtcbiAgICAgIHRhYi5jb250ZXh0ID0gcmVzPy5jb250ZXh0O1xuICAgICAgdGFiLmNvbnRleHREYXRhID0gcmVzPy5kYXRhO1xuICAgIH0pO1xuICB9XG5cbiAgY29uc3QgZ3JvdXBlZCA9IGdyb3VwVGFicyhtYXBwZWQsIHByZWZlcmVuY2VzLnNvcnRpbmcpO1xuICBncm91cGVkLmZvckVhY2goKGdyb3VwKSA9PiB7XG4gICAgZ3JvdXAudGFicyA9IHNvcnRUYWJzKGdyb3VwLnRhYnMsIHByZWZlcmVuY2VzLnNvcnRpbmcpO1xuICB9KTtcbiAgbG9nSW5mbyhcIkNhbGN1bGF0ZWQgdGFiIGdyb3Vwc1wiLCB7IGdyb3VwczogZ3JvdXBlZC5sZW5ndGgsIHRhYnM6IG1hcHBlZC5sZW5ndGggfSk7XG4gIHJldHVybiBncm91cGVkO1xufTtcblxuY29uc3QgVkFMSURfQ09MT1JTID0gW1wiZ3JleVwiLCBcImJsdWVcIiwgXCJyZWRcIiwgXCJ5ZWxsb3dcIiwgXCJncmVlblwiLCBcInBpbmtcIiwgXCJwdXJwbGVcIiwgXCJjeWFuXCIsIFwib3JhbmdlXCJdO1xuXG5leHBvcnQgY29uc3QgYXBwbHlUYWJHcm91cHMgPSBhc3luYyAoZ3JvdXBzOiBUYWJHcm91cFtdKSA9PiB7XG4gIGNvbnN0IGNsYWltZWRHcm91cElkcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXG4gIGZvciAoY29uc3QgZ3JvdXAgb2YgZ3JvdXBzKSB7XG4gICAgbGV0IHRhYnNUb1Byb2Nlc3M6IHsgd2luZG93SWQ6IG51bWJlciwgdGFiczogVGFiTWV0YWRhdGFbXSB9W10gPSBbXTtcblxuICAgIGlmIChncm91cC53aW5kb3dNb2RlID09PSAnbmV3Jykge1xuICAgICAgaWYgKGdyb3VwLnRhYnMubGVuZ3RoID4gMCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGZpcnN0ID0gZ3JvdXAudGFic1swXTtcbiAgICAgICAgICBjb25zdCB3aW4gPSBhd2FpdCBjaHJvbWUud2luZG93cy5jcmVhdGUoeyB0YWJJZDogZmlyc3QuaWQgfSk7XG4gICAgICAgICAgY29uc3Qgd2luSWQgPSB3aW4uaWQhO1xuICAgICAgICAgIGNvbnN0IG90aGVycyA9IGdyb3VwLnRhYnMuc2xpY2UoMSkubWFwKHQgPT4gdC5pZCk7XG4gICAgICAgICAgaWYgKG90aGVycy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBhd2FpdCBjaHJvbWUudGFicy5tb3ZlKG90aGVycywgeyB3aW5kb3dJZDogd2luSWQsIGluZGV4OiAtMSB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGFic1RvUHJvY2Vzcy5wdXNoKHsgd2luZG93SWQ6IHdpbklkLCB0YWJzOiBncm91cC50YWJzIH0pO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgbG9nRXJyb3IoXCJFcnJvciBjcmVhdGluZyBuZXcgd2luZG93IGZvciBncm91cFwiLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGdyb3VwLndpbmRvd01vZGUgPT09ICdjb21wb3VuZCcpIHtcbiAgICAgIGlmIChncm91cC50YWJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgLy8gRGV0ZXJtaW5lIHRhcmdldCB3aW5kb3cgKG1ham9yaXR5IHdpbnMpXG4gICAgICAgIGNvbnN0IGNvdW50cyA9IG5ldyBNYXA8bnVtYmVyLCBudW1iZXI+KCk7XG4gICAgICAgIGdyb3VwLnRhYnMuZm9yRWFjaCh0ID0+IGNvdW50cy5zZXQodC53aW5kb3dJZCwgKGNvdW50cy5nZXQodC53aW5kb3dJZCkgfHwgMCkgKyAxKSk7XG4gICAgICAgIGxldCB0YXJnZXRXaW5kb3dJZCA9IGdyb3VwLnRhYnNbMF0ud2luZG93SWQ7XG4gICAgICAgIGxldCBtYXggPSAwO1xuICAgICAgICBmb3IgKGNvbnN0IFt3aWQsIGNvdW50XSBvZiBjb3VudHMpIHtcbiAgICAgICAgICBpZiAoY291bnQgPiBtYXgpIHsgbWF4ID0gY291bnQ7IHRhcmdldFdpbmRvd0lkID0gd2lkOyB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBNb3ZlIHRhYnMgbm90IGluIHRhcmdldFxuICAgICAgICBjb25zdCB0b01vdmUgPSBncm91cC50YWJzLmZpbHRlcih0ID0+IHQud2luZG93SWQgIT09IHRhcmdldFdpbmRvd0lkKS5tYXAodCA9PiB0LmlkKTtcbiAgICAgICAgaWYgKHRvTW92ZS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IGNocm9tZS50YWJzLm1vdmUodG9Nb3ZlLCB7IHdpbmRvd0lkOiB0YXJnZXRXaW5kb3dJZCwgaW5kZXg6IC0xIH0pO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGxvZ0Vycm9yKFwiRXJyb3IgbW92aW5nIHRhYnMgZm9yIGNvbXBvdW5kIGdyb3VwXCIsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGFic1RvUHJvY2Vzcy5wdXNoKHsgd2luZG93SWQ6IHRhcmdldFdpbmRvd0lkLCB0YWJzOiBncm91cC50YWJzIH0pO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBDdXJyZW50IG1vZGU6IHNwbGl0IGJ5IHNvdXJjZSB3aW5kb3dcbiAgICAgIGNvbnN0IG1hcCA9IGdyb3VwLnRhYnMucmVkdWNlPE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhW10+PigoYWNjLCB0YWIpID0+IHtcbiAgICAgICAgY29uc3QgZXhpc3RpbmcgPSBhY2MuZ2V0KHRhYi53aW5kb3dJZCkgPz8gW107XG4gICAgICAgIGV4aXN0aW5nLnB1c2godGFiKTtcbiAgICAgICAgYWNjLnNldCh0YWIud2luZG93SWQsIGV4aXN0aW5nKTtcbiAgICAgICAgcmV0dXJuIGFjYztcbiAgICAgIH0sIG5ldyBNYXAoKSk7XG4gICAgICBmb3IgKGNvbnN0IFt3aWQsIHRdIG9mIG1hcCkge1xuICAgICAgICB0YWJzVG9Qcm9jZXNzLnB1c2goeyB3aW5kb3dJZDogd2lkLCB0YWJzOiB0IH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgeyB3aW5kb3dJZDogdGFyZ2V0V2luSWQsIHRhYnMgfSBvZiB0YWJzVG9Qcm9jZXNzKSB7XG4gICAgICAvLyBGaW5kIGNhbmRpZGF0ZSBncm91cCBJRCB0byByZXVzZVxuICAgICAgbGV0IGNhbmRpZGF0ZUdyb3VwSWQ6IG51bWJlciB8IHVuZGVmaW5lZDtcbiAgICAgIGNvbnN0IGNvdW50cyA9IG5ldyBNYXA8bnVtYmVyLCBudW1iZXI+KCk7XG4gICAgICBmb3IgKGNvbnN0IHQgb2YgdGFicykge1xuICAgICAgICAvLyBPbmx5IGNvbnNpZGVyIGdyb3VwcyB0aGF0IHdlcmUgYWxyZWFkeSBpbiB0aGlzIHdpbmRvd1xuICAgICAgICBpZiAodC5ncm91cElkICYmIHQuZ3JvdXBJZCAhPT0gLTEgJiYgdC53aW5kb3dJZCA9PT0gdGFyZ2V0V2luSWQpIHtcbiAgICAgICAgICBjb3VudHMuc2V0KHQuZ3JvdXBJZCwgKGNvdW50cy5nZXQodC5ncm91cElkKSB8fCAwKSArIDEpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIFByaW9yaXRpemUgdGhlIG1vc3QgZnJlcXVlbnQgZ3JvdXAgSUQgdGhhdCBoYXNuJ3QgYmVlbiBjbGFpbWVkIHlldFxuICAgICAgY29uc3Qgc29ydGVkQ2FuZGlkYXRlcyA9IEFycmF5LmZyb20oY291bnRzLmVudHJpZXMoKSlcbiAgICAgICAgLnNvcnQoKGEsIGIpID0+IGJbMV0gLSBhWzFdKVxuICAgICAgICAubWFwKChbaWRdKSA9PiBpZCk7XG5cbiAgICAgIGZvciAoY29uc3QgaWQgb2Ygc29ydGVkQ2FuZGlkYXRlcykge1xuICAgICAgICBpZiAoIWNsYWltZWRHcm91cElkcy5oYXMoaWQpKSB7XG4gICAgICAgICAgY2FuZGlkYXRlR3JvdXBJZCA9IGlkO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIEZhbGxiYWNrOiBJZiBubyBjYW5kaWRhdGUgZ3JvdXAgSUQgZnJvbSB0YWJzIChlLmcuIHNpbmdsZSBuZXcgdGFiKSwgbG9vayBmb3IgZXhpc3RpbmcgZ3JvdXAgYnkgbGFiZWwgaW4gdGFyZ2V0IHdpbmRvd1xuICAgICAgaWYgKGNhbmRpZGF0ZUdyb3VwSWQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICBjb25zdCB3aW5kb3dHcm91cHMgPSBhd2FpdCBjaHJvbWUudGFiR3JvdXBzLnF1ZXJ5KHsgd2luZG93SWQ6IHRhcmdldFdpbklkIH0pO1xuICAgICAgICAgICAvLyBGaW5kIGEgZ3JvdXAgd2l0aCB0aGUgc2FtZSB0aXRsZSB0aGF0IGhhc24ndCBiZWVuIGNsYWltZWQgeWV0XG4gICAgICAgICAgIGNvbnN0IG1hdGNoaW5nR3JvdXAgPSB3aW5kb3dHcm91cHMuZmluZChnID0+IGcudGl0bGUgPT09IGdyb3VwLmxhYmVsICYmICFjbGFpbWVkR3JvdXBJZHMuaGFzKGcuaWQpKTtcbiAgICAgICAgICAgaWYgKG1hdGNoaW5nR3JvdXApIHtcbiAgICAgICAgICAgICBjYW5kaWRhdGVHcm91cElkID0gbWF0Y2hpbmdHcm91cC5pZDtcbiAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgIGxvZ0Vycm9yKFwiRXJyb3IgZmluZGluZyBtYXRjaGluZyBncm91cCBieSBsYWJlbFwiLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgbGV0IGZpbmFsR3JvdXBJZDogbnVtYmVyO1xuXG4gICAgICBpZiAoY2FuZGlkYXRlR3JvdXBJZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGNsYWltZWRHcm91cElkcy5hZGQoY2FuZGlkYXRlR3JvdXBJZCk7XG4gICAgICAgIGZpbmFsR3JvdXBJZCA9IGNhbmRpZGF0ZUdyb3VwSWQ7XG5cbiAgICAgICAgLy8gQ2xlYW4gdXAgbGVmdG92ZXJzIGFuZCBhZGQgbWlzc2luZyB0YWJzXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgZXhpc3RpbmdUYWJzID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoeyBncm91cElkOiBmaW5hbEdyb3VwSWQgfSk7XG4gICAgICAgICAgY29uc3QgZXhpc3RpbmdUYWJJZHMgPSBuZXcgU2V0KGV4aXN0aW5nVGFicy5tYXAodCA9PiB0LmlkKSk7XG4gICAgICAgICAgY29uc3QgdGFyZ2V0VGFiSWRzID0gbmV3IFNldCh0YWJzLm1hcCh0ID0+IHQuaWQpKTtcblxuICAgICAgICAgIC8vIDEuIFVuZ3JvdXAgdGFicyB0aGF0IHNob3VsZG4ndCBiZSBoZXJlXG4gICAgICAgICAgY29uc3QgbGVmdG92ZXJzID0gZXhpc3RpbmdUYWJzLmZpbHRlcih0ID0+IHQuaWQgIT09IHVuZGVmaW5lZCAmJiAhdGFyZ2V0VGFiSWRzLmhhcyh0LmlkKSk7XG4gICAgICAgICAgaWYgKGxlZnRvdmVycy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBhd2FpdCBjaHJvbWUudGFicy51bmdyb3VwKGxlZnRvdmVycy5tYXAodCA9PiB0LmlkISkpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIDIuIEFkZCBvbmx5IHRoZSB0YWJzIHRoYXQgYXJlbid0IGFscmVhZHkgaW4gdGhlIGdyb3VwXG4gICAgICAgICAgY29uc3QgdGFic1RvQWRkID0gdGFicy5maWx0ZXIodCA9PiAhZXhpc3RpbmdUYWJJZHMuaGFzKHQuaWQpKTtcbiAgICAgICAgICBpZiAodGFic1RvQWRkLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAvLyBGb3IgbmV3L2NvbXBvdW5kLCB0YWJzIG1pZ2h0IGhhdmUgYmVlbiBtb3ZlZCwgc28gd2UgbXVzdCBwYXNzIHRhYklkc1xuICAgICAgICAgICAgIGF3YWl0IGNocm9tZS50YWJzLmdyb3VwKHsgZ3JvdXBJZDogZmluYWxHcm91cElkLCB0YWJJZHM6IHRhYnNUb0FkZC5tYXAodCA9PiB0LmlkKSB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBsb2dFcnJvcihcIkVycm9yIG1hbmFnaW5nIGdyb3VwIHJldXNlXCIsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gQ3JlYXRlIG5ldyBncm91cCAoZGVmYXVsdCBiZWhhdmlvcjogZXhwYW5kZWQpXG4gICAgICAgIC8vIEVuc3VyZSB3ZSBjcmVhdGUgaXQgaW4gdGhlIHRhcmdldCB3aW5kb3cgKGlmIHN0cmljdGx5IG5ldywgdGFiSWRzIGltcGxpZXMgd2luZG93IGlmIHRoZXkgYXJlIGluIGl0KVxuICAgICAgICAvLyBJZiB0YWJzIHdlcmUganVzdCBtb3ZlZCwgdGhleSBhcmUgaW4gdGFyZ2V0V2luSWQuXG4gICAgICAgIC8vIGNocm9tZS50YWJzLmdyb3VwIHdpdGggdGFiSWRzIHdpbGwgaW5mZXIgd2luZG93IGZyb20gdGFicy5cbiAgICAgICAgZmluYWxHcm91cElkID0gYXdhaXQgY2hyb21lLnRhYnMuZ3JvdXAoe1xuICAgICAgICAgIHRhYklkczogdGFicy5tYXAodCA9PiB0LmlkKSxcbiAgICAgICAgICBjcmVhdGVQcm9wZXJ0aWVzOiB7IHdpbmRvd0lkOiB0YXJnZXRXaW5JZCB9XG4gICAgICAgIH0pO1xuICAgICAgICBjbGFpbWVkR3JvdXBJZHMuYWRkKGZpbmFsR3JvdXBJZCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHVwZGF0ZVByb3BzOiBjaHJvbWUudGFiR3JvdXBzLlVwZGF0ZVByb3BlcnRpZXMgPSB7XG4gICAgICAgIHRpdGxlOiBncm91cC5sYWJlbFxuICAgICAgfTtcbiAgICAgIGlmIChWQUxJRF9DT0xPUlMuaW5jbHVkZXMoZ3JvdXAuY29sb3IpKSB7XG4gICAgICAgICAgdXBkYXRlUHJvcHMuY29sb3IgPSBncm91cC5jb2xvciBhcyBjaHJvbWUudGFiR3JvdXBzLkNvbG9yRW51bTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IGNocm9tZS50YWJHcm91cHMudXBkYXRlKGZpbmFsR3JvdXBJZCwgdXBkYXRlUHJvcHMpO1xuICAgIH1cbiAgfVxuICBsb2dJbmZvKFwiQXBwbGllZCB0YWIgZ3JvdXBzXCIsIHsgY291bnQ6IGdyb3Vwcy5sZW5ndGggfSk7XG59O1xuXG5leHBvcnQgY29uc3QgYXBwbHlUYWJTb3J0aW5nID0gYXN5bmMgKFxuICBwcmVmZXJlbmNlczogUHJlZmVyZW5jZXMsXG4gIGZpbHRlcj86IEdyb3VwaW5nU2VsZWN0aW9uLFxuICBvblByb2dyZXNzPzogKGNvbXBsZXRlZDogbnVtYmVyLCB0b3RhbDogbnVtYmVyKSA9PiB2b2lkXG4pID0+IHtcbiAgY29uc3QgdGFyZ2V0V2luZG93SWRzID0gbmV3IFNldDxudW1iZXI+KCk7XG4gIGxldCBjaHJvbWVUYWJzOiBjaHJvbWUudGFicy5UYWJbXSA9IFtdO1xuXG4gIGNvbnN0IGV4cGxpY2l0V2luZG93SWRzID0gZmlsdGVyPy53aW5kb3dJZHMgPz8gW107XG4gIGNvbnN0IGV4cGxpY2l0VGFiSWRzID0gZmlsdGVyPy50YWJJZHMgPz8gW107XG4gIGNvbnN0IGhhc0ZpbHRlciA9IGV4cGxpY2l0V2luZG93SWRzLmxlbmd0aCA+IDAgfHwgZXhwbGljaXRUYWJJZHMubGVuZ3RoID4gMDtcblxuICBpZiAoIWhhc0ZpbHRlcikge1xuICAgICAgY2hyb21lVGFicyA9IGF3YWl0IGNocm9tZS50YWJzLnF1ZXJ5KHt9KTtcbiAgICAgIGNocm9tZVRhYnMuZm9yRWFjaCh0ID0+IHsgaWYgKHQud2luZG93SWQpIHRhcmdldFdpbmRvd0lkcy5hZGQodC53aW5kb3dJZCk7IH0pO1xuICB9IGVsc2Uge1xuICAgICAgZXhwbGljaXRXaW5kb3dJZHMuZm9yRWFjaChpZCA9PiB0YXJnZXRXaW5kb3dJZHMuYWRkKGlkKSk7XG5cbiAgICAgIGlmIChleHBsaWNpdFRhYklkcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgY29uc3Qgc3BlY2lmaWNUYWJzID0gYXdhaXQgUHJvbWlzZS5hbGwoZXhwbGljaXRUYWJJZHMubWFwKGlkID0+IGNocm9tZS50YWJzLmdldChpZCkuY2F0Y2goKCkgPT4gbnVsbCkpKTtcbiAgICAgICAgICBzcGVjaWZpY1RhYnMuZm9yRWFjaCh0ID0+IHtcbiAgICAgICAgICAgICAgaWYgKHQgJiYgdC53aW5kb3dJZCkgdGFyZ2V0V2luZG93SWRzLmFkZCh0LndpbmRvd0lkKTtcbiAgICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgd2luZG93UHJvbWlzZXMgPSBBcnJheS5mcm9tKHRhcmdldFdpbmRvd0lkcykubWFwKHdpbmRvd0lkID0+XG4gICAgICAgICAgY2hyb21lLnRhYnMucXVlcnkoeyB3aW5kb3dJZCB9KS5jYXRjaCgoKSA9PiBbXSlcbiAgICAgICk7XG4gICAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGwod2luZG93UHJvbWlzZXMpO1xuICAgICAgY2hyb21lVGFicyA9IHJlc3VsdHMuZmxhdCgpO1xuICB9XG5cbiAgZm9yIChjb25zdCB3aW5kb3dJZCBvZiB0YXJnZXRXaW5kb3dJZHMpIHtcbiAgICAgIGNvbnN0IHdpbmRvd1RhYnMgPSBjaHJvbWVUYWJzLmZpbHRlcih0ID0+IHQud2luZG93SWQgPT09IHdpbmRvd0lkKTtcbiAgICAgIGNvbnN0IG1hcHBlZCA9IHdpbmRvd1RhYnMubWFwKG1hcENocm9tZVRhYikuZmlsdGVyKCh0KTogdCBpcyBUYWJNZXRhZGF0YSA9PiBCb29sZWFuKHQpKTtcblxuICAgICAgaWYgKHJlcXVpcmVzQ29udGV4dEFuYWx5c2lzKHByZWZlcmVuY2VzLnNvcnRpbmcpKSB7XG4gICAgICAgIGNvbnN0IGNvbnRleHRNYXAgPSBhd2FpdCBhbmFseXplVGFiQ29udGV4dChtYXBwZWQsIG9uUHJvZ3Jlc3MpO1xuICAgICAgICBtYXBwZWQuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgICAgIGNvbnN0IHJlcyA9IGNvbnRleHRNYXAuZ2V0KHRhYi5pZCk7XG4gICAgICAgICAgdGFiLmNvbnRleHQgPSByZXM/LmNvbnRleHQ7XG4gICAgICAgICAgdGFiLmNvbnRleHREYXRhID0gcmVzPy5kYXRhO1xuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgLy8gR3JvdXAgdGFicyBieSBncm91cElkIHRvIHNvcnQgd2l0aGluIGdyb3Vwc1xuICAgICAgY29uc3QgdGFic0J5R3JvdXAgPSBuZXcgTWFwPG51bWJlciwgVGFiTWV0YWRhdGFbXT4oKTtcbiAgICAgIGNvbnN0IHVuZ3JvdXBlZFRhYnM6IFRhYk1ldGFkYXRhW10gPSBbXTtcblxuICAgICAgbWFwcGVkLmZvckVhY2godGFiID0+IHtcbiAgICAgICAgY29uc3QgZ3JvdXBJZCA9IHRhYi5ncm91cElkID8/IC0xO1xuICAgICAgICBpZiAoZ3JvdXBJZCAhPT0gLTEpIHtcbiAgICAgICAgICBjb25zdCBncm91cCA9IHRhYnNCeUdyb3VwLmdldChncm91cElkKSA/PyBbXTtcbiAgICAgICAgICBncm91cC5wdXNoKHRhYik7XG4gICAgICAgICAgdGFic0J5R3JvdXAuc2V0KGdyb3VwSWQsIGdyb3VwKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB1bmdyb3VwZWRUYWJzLnB1c2godGFiKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vIDEuIFNvcnQgdGFicyB3aXRoaW4gZWFjaCBncm91cFxuICAgICAgZm9yIChjb25zdCBbZ3JvdXBJZCwgdGFic10gb2YgdGFic0J5R3JvdXApIHtcbiAgICAgICAgY29uc3QgZ3JvdXBUYWJJbmRpY2VzID0gd2luZG93VGFic1xuICAgICAgICAgIC5maWx0ZXIodCA9PiB0Lmdyb3VwSWQgPT09IGdyb3VwSWQpXG4gICAgICAgICAgLm1hcCh0ID0+IHQuaW5kZXgpXG4gICAgICAgICAgLnNvcnQoKGEsIGIpID0+IGEgLSBiKTtcblxuICAgICAgICBjb25zdCBzdGFydEluZGV4ID0gZ3JvdXBUYWJJbmRpY2VzWzBdID8/IDA7XG5cbiAgICAgICAgY29uc3Qgc29ydGVkR3JvdXBUYWJzID0gc29ydFRhYnModGFicywgcHJlZmVyZW5jZXMuc29ydGluZyk7XG4gICAgICAgIGNvbnN0IHNvcnRlZElkcyA9IHNvcnRlZEdyb3VwVGFicy5tYXAodCA9PiB0LmlkKTtcblxuICAgICAgICBpZiAoc29ydGVkSWRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMubW92ZShzb3J0ZWRJZHMsIHsgaW5kZXg6IHN0YXJ0SW5kZXggfSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gMi4gU29ydCB1bmdyb3VwZWQgdGFic1xuICAgICAgaWYgKHVuZ3JvdXBlZFRhYnMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCBzb3J0ZWRVbmdyb3VwZWQgPSBzb3J0VGFicyh1bmdyb3VwZWRUYWJzLCBwcmVmZXJlbmNlcy5zb3J0aW5nKTtcbiAgICAgICAgY29uc3Qgc29ydGVkSWRzID0gc29ydGVkVW5ncm91cGVkLm1hcCh0ID0+IHQuaWQpO1xuXG4gICAgICAgIC8vIE1vdmUgdG8gaW5kZXggMCAodG9wIG9mIHdpbmRvdylcbiAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMubW92ZShzb3J0ZWRJZHMsIHsgaW5kZXg6IDAgfSk7XG4gICAgICB9XG5cbiAgICAgIC8vIDMuIFNvcnQgR3JvdXBzIChpZiBlbmFibGVkKVxuICAgICAgYXdhaXQgc29ydEdyb3Vwc0lmRW5hYmxlZCh3aW5kb3dJZCwgcHJlZmVyZW5jZXMuc29ydGluZywgdGFic0J5R3JvdXApO1xuICB9XG4gIGxvZ0luZm8oXCJBcHBsaWVkIHRhYiBzb3J0aW5nXCIpO1xufTtcblxuY29uc3QgY29tcGFyZUJ5U29ydGluZ1J1bGVzID0gKHNvcnRpbmdSdWxlc0FyZzogU29ydGluZ1J1bGVbXSwgYTogVGFiTWV0YWRhdGEsIGI6IFRhYk1ldGFkYXRhKTogbnVtYmVyID0+IHtcbiAgY29uc3Qgc29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KHNvcnRpbmdSdWxlc0FyZyk7XG4gIGlmIChzb3J0UnVsZXNMaXN0Lmxlbmd0aCA9PT0gMCkgcmV0dXJuIDA7XG5cbiAgdHJ5IHtcbiAgICBmb3IgKGNvbnN0IHJ1bGUgb2Ygc29ydFJ1bGVzTGlzdCkge1xuICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHZhbEEgPSBnZXRGaWVsZFZhbHVlKGEsIHJ1bGUuZmllbGQpO1xuICAgICAgY29uc3QgdmFsQiA9IGdldEZpZWxkVmFsdWUoYiwgcnVsZS5maWVsZCk7XG5cbiAgICAgIGxldCByZXN1bHQgPSAwO1xuICAgICAgaWYgKHZhbEEgPCB2YWxCKSByZXN1bHQgPSAtMTtcbiAgICAgIGVsc2UgaWYgKHZhbEEgPiB2YWxCKSByZXN1bHQgPSAxO1xuXG4gICAgICBpZiAocmVzdWx0ICE9PSAwKSB7XG4gICAgICAgIHJldHVybiBydWxlLm9yZGVyID09PSBcImRlc2NcIiA/IC1yZXN1bHQgOiByZXN1bHQ7XG4gICAgICB9XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGxvZ0Vycm9yKFwiRXJyb3IgZXZhbHVhdGluZyBzb3J0aW5nIHJ1bGVzXCIsIHsgZXJyb3I6IFN0cmluZyhlcnJvcikgfSk7XG4gIH1cblxuICByZXR1cm4gMDtcbn07XG5cbmNvbnN0IHNvcnRHcm91cHNJZkVuYWJsZWQgPSBhc3luYyAoXG4gICAgd2luZG93SWQ6IG51bWJlcixcbiAgICBzb3J0aW5nUHJlZmVyZW5jZXM6IHN0cmluZ1tdLFxuICAgIHRhYnNCeUdyb3VwOiBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YVtdPlxuKSA9PiB7XG4gICAgLy8gQ2hlY2sgaWYgYW55IGFjdGl2ZSBzdHJhdGVneSBoYXMgc29ydEdyb3VwczogdHJ1ZVxuICAgIGNvbnN0IGN1c3RvbVN0cmF0cyA9IGdldEN1c3RvbVN0cmF0ZWdpZXMoKTtcbiAgICBsZXQgZ3JvdXBTb3J0ZXJTdHJhdGVneTogUmV0dXJuVHlwZTx0eXBlb2YgY3VzdG9tU3RyYXRzLmZpbmQ+IHwgbnVsbCA9IG51bGw7XG5cbiAgICBmb3IgKGNvbnN0IGlkIG9mIHNvcnRpbmdQcmVmZXJlbmNlcykge1xuICAgICAgICBjb25zdCBzdHJhdGVneSA9IGN1c3RvbVN0cmF0cy5maW5kKHMgPT4gcy5pZCA9PT0gaWQpO1xuICAgICAgICBpZiAoc3RyYXRlZ3kgJiYgKHN0cmF0ZWd5LnNvcnRHcm91cHMgfHwgKHN0cmF0ZWd5Lmdyb3VwU29ydGluZ1J1bGVzICYmIHN0cmF0ZWd5Lmdyb3VwU29ydGluZ1J1bGVzLmxlbmd0aCA+IDApKSkge1xuICAgICAgICAgICAgZ3JvdXBTb3J0ZXJTdHJhdGVneSA9IHN0cmF0ZWd5O1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoIWdyb3VwU29ydGVyU3RyYXRlZ3kpIHJldHVybjtcblxuICAgIC8vIEdldCBncm91cCBkZXRhaWxzXG4gICAgY29uc3QgZ3JvdXBzID0gYXdhaXQgY2hyb21lLnRhYkdyb3Vwcy5xdWVyeSh7IHdpbmRvd0lkIH0pO1xuICAgIGlmIChncm91cHMubGVuZ3RoIDw9IDEpIHJldHVybjtcblxuICAgIC8vIFdlIHNvcnQgZ3JvdXBzIGJhc2VkIG9uIHRoZSBzdHJhdGVneS5cbiAgICAvLyBTaW5jZSBjb21wYXJlQnkgZXhwZWN0cyBUYWJNZXRhZGF0YSwgd2UgbmVlZCB0byBjcmVhdGUgYSByZXByZXNlbnRhdGl2ZSBUYWJNZXRhZGF0YSBmb3IgZWFjaCBncm91cC5cbiAgICAvLyBXZSdsbCB1c2UgdGhlIGZpcnN0IHRhYiBvZiB0aGUgZ3JvdXAgKHNvcnRlZCkgYXMgdGhlIHJlcHJlc2VudGF0aXZlLlxuXG4gICAgY29uc3QgZ3JvdXBSZXBzOiB7IGdyb3VwOiBjaHJvbWUudGFiR3JvdXBzLlRhYkdyb3VwOyByZXA6IFRhYk1ldGFkYXRhIH1bXSA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBncm91cCBvZiBncm91cHMpIHtcbiAgICAgICAgY29uc3QgdGFicyA9IHRhYnNCeUdyb3VwLmdldChncm91cC5pZCk7XG4gICAgICAgIGlmICh0YWJzICYmIHRhYnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgLy8gdGFicyBhcmUgYWxyZWFkeSBzb3J0ZWQgYnkgc29ydFRhYnMgaW4gcHJldmlvdXMgc3RlcCBpZiB0aGF0IHN0cmF0ZWd5IHdhcyBhcHBsaWVkXG4gICAgICAgICAgICAvLyBvciB3ZSBqdXN0IHRha2UgdGhlIGZpcnN0IG9uZS5cbiAgICAgICAgICAgIC8vIElkZWFsbHkgd2UgdXNlIHRoZSBcImJlc3RcIiB0YWIuXG4gICAgICAgICAgICAvLyBCdXQgc2luY2Ugd2UgYWxyZWFkeSBzb3J0ZWQgdGFicyB3aXRoaW4gZ3JvdXBzLCB0YWJzWzBdIGlzIHRoZSBmaXJzdCBvbmUuXG4gICAgICAgICAgICBncm91cFJlcHMucHVzaCh7IGdyb3VwLCByZXA6IHRhYnNbMF0gfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBTb3J0IHRoZSBncm91cHNcbiAgICBpZiAoZ3JvdXBTb3J0ZXJTdHJhdGVneS5ncm91cFNvcnRpbmdSdWxlcyAmJiBBcnJheS5pc0FycmF5KGdyb3VwU29ydGVyU3RyYXRlZ3kuZ3JvdXBTb3J0aW5nUnVsZXMpICYmIGdyb3VwU29ydGVyU3RyYXRlZ3kuZ3JvdXBTb3J0aW5nUnVsZXMubGVuZ3RoID4gMCkge1xuICAgICAgICBncm91cFJlcHMuc29ydCgoYSwgYikgPT4gY29tcGFyZUJ5U29ydGluZ1J1bGVzKGdyb3VwU29ydGVyU3RyYXRlZ3khLmdyb3VwU29ydGluZ1J1bGVzISwgYS5yZXAsIGIucmVwKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgZ3JvdXBSZXBzLnNvcnQoKGEsIGIpID0+IGNvbXBhcmVCeShncm91cFNvcnRlclN0cmF0ZWd5IS5pZCwgYS5yZXAsIGIucmVwKSk7XG4gICAgfVxuXG4gICAgLy8gQXBwbHkgdGhlIG9yZGVyXG4gICAgLy8gY2hyb21lLnRhYkdyb3Vwcy5tb3ZlKGdyb3VwSWQsIHsgaW5kZXg6IC4uLiB9KVxuICAgIC8vIFdlIHdhbnQgdGhlbSB0byBiZSBhZnRlciB1bmdyb3VwZWQgdGFicyAod2hpY2ggYXJlIGF0IGluZGV4IDAuLk4pLlxuICAgIC8vIEFjdHVhbGx5LCBjaHJvbWUudGFiR3JvdXBzLm1vdmUgaW5kZXggaXMgdGhlIHRhYiBpbmRleCB3aGVyZSB0aGUgZ3JvdXAgc3RhcnRzLlxuICAgIC8vIElmIHdlIHdhbnQgdG8gc3RyaWN0bHkgb3JkZXIgZ3JvdXBzLCB3ZSBzaG91bGQgY2FsY3VsYXRlIHRoZSB0YXJnZXQgaW5kZXguXG4gICAgLy8gQnV0IHNpbmNlIGdyb3VwcyBhcmUgY29udGlndW91cyBibG9ja3Mgb2YgdGFicywgd2UganVzdCBuZWVkIHRvIHBsYWNlIHRoZW0gaW4gb3JkZXIuXG5cbiAgICAvLyBDYWxjdWxhdGUgdGhlIHN0YXJ0aW5nIGluZGV4IGZvciBncm91cHMuXG4gICAgLy8gVW5ncm91cGVkIHRhYnMgYXJlIGF0IHRoZSBzdGFydCAoaW5kZXggMCkuXG4gICAgLy8gU28gdGhlIGZpcnN0IGdyb3VwIHNob3VsZCBzdGFydCBhZnRlciB0aGUgbGFzdCB1bmdyb3VwZWQgdGFiLlxuICAgIC8vIFdhaXQsIGVhcmxpZXIgd2UgbW92ZWQgdW5ncm91cGVkIHRhYnMgdG8gaW5kZXggMC5cbiAgICAvLyBCdXQgd2UgbmVlZCB0byBrbm93IGhvdyBtYW55IHVuZ3JvdXBlZCB0YWJzIHRoZXJlIGFyZSBpbiB0aGlzIHdpbmRvdy5cblxuICAgIC8vIExldCdzIGdldCBjdXJyZW50IHRhYnMgYWdhaW4gb3IgdHJhY2sgY291bnQ/XG4gICAgLy8gV2UgY2FuIGFzc3VtZSB1bmdyb3VwZWQgdGFicyBhcmUgYXQgdGhlIHRvcC5cbiAgICAvLyBCdXQgYHRhYnNCeUdyb3VwYCBvbmx5IGNvbnRhaW5zIGdyb3VwZWQgdGFicy5cbiAgICAvLyBXZSBuZWVkIHRvIGtub3cgd2hlcmUgdG8gc3RhcnQgcGxhY2luZyBncm91cHMuXG4gICAgLy8gVGhlIHNhZmVzdCB3YXkgaXMgdG8gbW92ZSB0aGVtIG9uZSBieSBvbmUgdG8gdGhlIGVuZCAob3Igc3BlY2lmaWMgaW5kZXgpLlxuXG4gICAgLy8gSWYgd2UganVzdCBtb3ZlIHRoZW0gaW4gb3JkZXIgdG8gaW5kZXggLTEsIHRoZXkgd2lsbCBhcHBlbmQgdG8gdGhlIGVuZC5cbiAgICAvLyBJZiB3ZSB3YW50IHRoZW0gYWZ0ZXIgdW5ncm91cGVkIHRhYnMsIHdlIG5lZWQgdG8gZmluZCB0aGUgaW5kZXguXG5cbiAgICAvLyBMZXQncyB1c2UgaW5kZXggPSAtMSB0byBwdXNoIHRvIGVuZCwgc2VxdWVudGlhbGx5LlxuICAgIC8vIEJ1dCB3YWl0LCBpZiB3ZSBwdXNoIHRvIGVuZCwgdGhlIG9yZGVyIGlzIHByZXNlcnZlZD9cbiAgICAvLyBObywgaWYgd2UgaXRlcmF0ZSBzb3J0ZWQgZ3JvdXBzIGFuZCBtb3ZlIGVhY2ggdG8gLTEsIHRoZSBsYXN0IG9uZSBtb3ZlZCB3aWxsIGJlIGF0IHRoZSBlbmQuXG4gICAgLy8gU28gd2Ugc2hvdWxkIGl0ZXJhdGUgaW4gb3JkZXIgYW5kIG1vdmUgdG8gLTE/IE5vLCB0aGF0IHdvdWxkIHJldmVyc2UgdGhlbSBpZiB3ZSBjb25zaWRlciBcImVuZFwiLlxuICAgIC8vIEFjdHVhbGx5LCBpZiB3ZSBtb3ZlIEdyb3VwIEEgdG8gLTEsIGl0IGdvZXMgdG8gZW5kLiBUaGVuIEdyb3VwIEIgdG8gLTEsIGl0IGdvZXMgYWZ0ZXIgQS5cbiAgICAvLyBTbyBpdGVyYXRpbmcgaW4gc29ydGVkIG9yZGVyIGFuZCBtb3ZpbmcgdG8gLTEgd29ya3MgdG8gYXJyYW5nZSB0aGVtIGF0IHRoZSBlbmQgb2YgdGhlIHdpbmRvdy5cblxuICAgIC8vIEhvd2V2ZXIsIGlmIHRoZXJlIGFyZSBwaW5uZWQgdGFicyBvciB1bmdyb3VwZWQgdGFicywgdGhleSBzaG91bGQgc3RheSBhdCB0b3A/XG4gICAgLy8gVW5ncm91cGVkIHRhYnMgd2VyZSBtb3ZlZCB0byBpbmRleCAwLlxuICAgIC8vIFBpbm5lZCB0YWJzOiBgY2hyb21lLnRhYnMubW92ZWAgaGFuZGxlcyBwaW5uZWQgY29uc3RyYWludCAocGlubmVkIHRhYnMgbXVzdCBiZSBmaXJzdCkuXG4gICAgLy8gR3JvdXBzIGNhbm5vdCBjb250YWluIHBpbm5lZCB0YWJzLlxuICAgIC8vIFNvIGdyb3VwcyB3aWxsIGJlIGFmdGVyIHBpbm5lZCB0YWJzLlxuICAgIC8vIElmIHdlIG1vdmUgdG8gLTEsIHRoZXkgZ28gdG8gdGhlIHZlcnkgZW5kLlxuXG4gICAgLy8gV2hhdCBpZiB3ZSB3YW50IHRoZW0gc3BlY2lmaWNhbGx5IGFycmFuZ2VkP1xuICAgIC8vIElmIHdlIG1vdmUgdGhlbSBzZXF1ZW50aWFsbHkgdG8gLTEsIHRoZXkgd2lsbCBiZSBvcmRlcmVkIEEsIEIsIEMuLi4gYXQgdGhlIGJvdHRvbS5cbiAgICAvLyBUaGlzIHNlZW1zIGNvcnJlY3QgZm9yIFwic29ydGluZyBncm91cHNcIi5cblxuICAgIGZvciAoY29uc3QgaXRlbSBvZiBncm91cFJlcHMpIHtcbiAgICAgICAgYXdhaXQgY2hyb21lLnRhYkdyb3Vwcy5tb3ZlKGl0ZW0uZ3JvdXAuaWQsIHsgaW5kZXg6IC0xIH0pO1xuICAgIH1cbn07XG5cbmV4cG9ydCBjb25zdCBjbG9zZUdyb3VwID0gYXN5bmMgKGdyb3VwOiBUYWJHcm91cCkgPT4ge1xuICBjb25zdCBpZHMgPSBncm91cC50YWJzLm1hcCgodGFiKSA9PiB0YWIuaWQpO1xuICBhd2FpdCBjaHJvbWUudGFicy5yZW1vdmUoaWRzKTtcbiAgbG9nSW5mbyhcIkNsb3NlZCBncm91cFwiLCB7IGxhYmVsOiBncm91cC5sYWJlbCwgY291bnQ6IGlkcy5sZW5ndGggfSk7XG59O1xuXG5jb25zdCBnZXRUYWJzQnlJZHMgPSBhc3luYyAodGFiSWRzOiBudW1iZXJbXSk6IFByb21pc2U8Y2hyb21lLnRhYnMuVGFiW10+ID0+IHtcbiAgaWYgKCF0YWJJZHMubGVuZ3RoKSByZXR1cm4gW107XG4gIGNvbnN0IGFsbFRhYnMgPSBhd2FpdCBjaHJvbWUudGFicy5xdWVyeSh7fSk7XG4gIGNvbnN0IHRhYk1hcCA9IG5ldyBNYXAoYWxsVGFicy5tYXAodCA9PiBbdC5pZCwgdF0pKTtcbiAgcmV0dXJuIHRhYklkc1xuICAgIC5tYXAoaWQgPT4gdGFiTWFwLmdldChpZCkpXG4gICAgLmZpbHRlcigodCk6IHQgaXMgY2hyb21lLnRhYnMuVGFiID0+IHQgIT09IHVuZGVmaW5lZCAmJiB0LmlkICE9PSB1bmRlZmluZWQgJiYgdC53aW5kb3dJZCAhPT0gdW5kZWZpbmVkKTtcbn07XG5cbmV4cG9ydCBjb25zdCBtZXJnZVRhYnMgPSBhc3luYyAodGFiSWRzOiBudW1iZXJbXSkgPT4ge1xuICBpZiAoIXRhYklkcy5sZW5ndGgpIHJldHVybjtcbiAgY29uc3QgdmFsaWRUYWJzID0gYXdhaXQgZ2V0VGFic0J5SWRzKHRhYklkcyk7XG5cbiAgaWYgKHZhbGlkVGFicy5sZW5ndGggPT09IDApIHJldHVybjtcblxuICAvLyBUYXJnZXQgV2luZG93OiBUaGUgb25lIHdpdGggdGhlIG1vc3Qgc2VsZWN0ZWQgdGFicywgb3IgdGhlIGZpcnN0IG9uZS5cbiAgLy8gVXNpbmcgdGhlIGZpcnN0IHRhYidzIHdpbmRvdyBhcyB0aGUgdGFyZ2V0LlxuICBjb25zdCB0YXJnZXRXaW5kb3dJZCA9IHZhbGlkVGFic1swXS53aW5kb3dJZDtcblxuICAvLyAxLiBNb3ZlIHRhYnMgdG8gdGFyZ2V0IHdpbmRvd1xuICBjb25zdCB0YWJzVG9Nb3ZlID0gdmFsaWRUYWJzLmZpbHRlcih0ID0+IHQud2luZG93SWQgIT09IHRhcmdldFdpbmRvd0lkKTtcbiAgaWYgKHRhYnNUb01vdmUubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IG1vdmVJZHMgPSB0YWJzVG9Nb3ZlLm1hcCh0ID0+IHQuaWQhKTtcbiAgICBhd2FpdCBjaHJvbWUudGFicy5tb3ZlKG1vdmVJZHMsIHsgd2luZG93SWQ6IHRhcmdldFdpbmRvd0lkLCBpbmRleDogLTEgfSk7XG4gIH1cblxuICAvLyAyLiBHcm91cCB0aGVtXG4gIC8vIENoZWNrIGlmIHRoZXJlIGlzIGFuIGV4aXN0aW5nIGdyb3VwIGluIHRoZSB0YXJnZXQgd2luZG93IHRoYXQgd2FzIHBhcnQgb2YgdGhlIHNlbGVjdGlvbi5cbiAgLy8gV2UgcHJpb3JpdGl6ZSB0aGUgZ3JvdXAgb2YgdGhlIGZpcnN0IHRhYiBpZiBpdCBoYXMgb25lLlxuICBjb25zdCBmaXJzdFRhYkdyb3VwSWQgPSB2YWxpZFRhYnNbMF0uZ3JvdXBJZDtcbiAgbGV0IHRhcmdldEdyb3VwSWQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuICBpZiAoZmlyc3RUYWJHcm91cElkICYmIGZpcnN0VGFiR3JvdXBJZCAhPT0gLTEpIHtcbiAgICAgIC8vIFZlcmlmeSB0aGUgZ3JvdXAgaXMgaW4gdGhlIHRhcmdldCB3aW5kb3cgKGl0IHNob3VsZCBiZSwgYXMgd2UgcGlja2VkIHRhcmdldFdpbmRvd0lkIGZyb20gdmFsaWRUYWJzWzBdKVxuICAgICAgLy8gQnV0IGlmIHZhbGlkVGFic1swXSB3YXMgbW92ZWQgKGl0IHdhc24ndCwgYXMgaXQgZGVmaW5lZCB0aGUgdGFyZ2V0KSwgaXQncyBmaW5lLlxuICAgICAgdGFyZ2V0R3JvdXBJZCA9IGZpcnN0VGFiR3JvdXBJZDtcbiAgfSBlbHNlIHtcbiAgICAgIC8vIExvb2sgZm9yIGFueSBvdGhlciBncm91cCBpbiB0aGUgc2VsZWN0aW9uIHRoYXQgaXMgaW4gdGhlIHRhcmdldCB3aW5kb3dcbiAgICAgIGNvbnN0IG90aGVyR3JvdXAgPSB2YWxpZFRhYnMuZmluZCh0ID0+IHQud2luZG93SWQgPT09IHRhcmdldFdpbmRvd0lkICYmIHQuZ3JvdXBJZCAhPT0gLTEpO1xuICAgICAgaWYgKG90aGVyR3JvdXApIHtcbiAgICAgICAgICB0YXJnZXRHcm91cElkID0gb3RoZXJHcm91cC5ncm91cElkO1xuICAgICAgfVxuICB9XG5cbiAgY29uc3QgaWRzID0gdmFsaWRUYWJzLm1hcCh0ID0+IHQuaWQhKTtcbiAgYXdhaXQgY2hyb21lLnRhYnMuZ3JvdXAoeyB0YWJJZHM6IGlkcywgZ3JvdXBJZDogdGFyZ2V0R3JvdXBJZCB9KTtcbiAgbG9nSW5mbyhcIk1lcmdlZCB0YWJzXCIsIHsgY291bnQ6IGlkcy5sZW5ndGgsIHRhcmdldFdpbmRvd0lkLCB0YXJnZXRHcm91cElkIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IHNwbGl0VGFicyA9IGFzeW5jICh0YWJJZHM6IG51bWJlcltdKSA9PiB7XG4gIGlmICh0YWJJZHMubGVuZ3RoID09PSAwKSByZXR1cm47XG5cbiAgLy8gMS4gVmFsaWRhdGUgdGFic1xuICBjb25zdCB2YWxpZFRhYnMgPSBhd2FpdCBnZXRUYWJzQnlJZHModGFiSWRzKTtcblxuICBpZiAodmFsaWRUYWJzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuXG4gIC8vIDIuIENyZWF0ZSBuZXcgd2luZG93IHdpdGggdGhlIGZpcnN0IHRhYlxuICBjb25zdCBmaXJzdFRhYiA9IHZhbGlkVGFic1swXTtcbiAgY29uc3QgbmV3V2luZG93ID0gYXdhaXQgY2hyb21lLndpbmRvd3MuY3JlYXRlKHsgdGFiSWQ6IGZpcnN0VGFiLmlkIH0pO1xuXG4gIC8vIDMuIE1vdmUgcmVtYWluaW5nIHRhYnMgdG8gbmV3IHdpbmRvd1xuICBpZiAodmFsaWRUYWJzLmxlbmd0aCA+IDEpIHtcbiAgICBjb25zdCByZW1haW5pbmdUYWJJZHMgPSB2YWxpZFRhYnMuc2xpY2UoMSkubWFwKHQgPT4gdC5pZCEpO1xuICAgIGF3YWl0IGNocm9tZS50YWJzLm1vdmUocmVtYWluaW5nVGFiSWRzLCB7IHdpbmRvd0lkOiBuZXdXaW5kb3cuaWQhLCBpbmRleDogLTEgfSk7XG4gIH1cblxuICBsb2dJbmZvKFwiU3BsaXQgdGFicyB0byBuZXcgd2luZG93XCIsIHsgY291bnQ6IHZhbGlkVGFicy5sZW5ndGgsIG5ld1dpbmRvd0lkOiBuZXdXaW5kb3cuaWQgfSk7XG59O1xuIiwgImltcG9ydCB7IFVuZG9TdGF0ZSwgU2F2ZWRTdGF0ZSwgV2luZG93U3RhdGUsIFN0b3JlZFRhYlN0YXRlIH0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgZ2V0U3RvcmVkVmFsdWUsIHNldFN0b3JlZFZhbHVlIH0gZnJvbSBcIi4vc3RvcmFnZS5qc1wiO1xuaW1wb3J0IHsgbG9nSW5mbywgbG9nRXJyb3IgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuXG5jb25zdCBNQVhfVU5ET19TVEFDSyA9IDEwO1xuY29uc3QgVU5ET19TVEFDS19LRVkgPSBcInVuZG9TdGFja1wiO1xuY29uc3QgU0FWRURfU1RBVEVTX0tFWSA9IFwic2F2ZWRTdGF0ZXNcIjtcblxuZXhwb3J0IGNvbnN0IGNhcHR1cmVDdXJyZW50U3RhdGUgPSBhc3luYyAoKTogUHJvbWlzZTxVbmRvU3RhdGU+ID0+IHtcbiAgY29uc3Qgd2luZG93cyA9IGF3YWl0IGNocm9tZS53aW5kb3dzLmdldEFsbCh7IHBvcHVsYXRlOiB0cnVlIH0pO1xuICBjb25zdCB3aW5kb3dTdGF0ZXM6IFdpbmRvd1N0YXRlW10gPSBbXTtcblxuICBmb3IgKGNvbnN0IHdpbiBvZiB3aW5kb3dzKSB7XG4gICAgaWYgKCF3aW4udGFicykgY29udGludWU7XG4gICAgY29uc3QgdGFiU3RhdGVzOiBTdG9yZWRUYWJTdGF0ZVtdID0gd2luLnRhYnMubWFwKCh0YWIpID0+IHtcbiAgICAgIGxldCBncm91cFRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICBsZXQgZ3JvdXBDb2xvcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgLy8gTm90ZTogdGFiLmdyb3VwSWQgaXMgLTEgaWYgbm90IGdyb3VwZWQuXG4gICAgICByZXR1cm4ge1xuICAgICAgICBpZDogdGFiLmlkLFxuICAgICAgICB1cmw6IHRhYi51cmwgfHwgXCJcIixcbiAgICAgICAgcGlubmVkOiBCb29sZWFuKHRhYi5waW5uZWQpLFxuICAgICAgICBncm91cElkOiB0YWIuZ3JvdXBJZCxcbiAgICAgICAgZ3JvdXBUaXRsZSwgLy8gV2lsbCBuZWVkIHRvIGZldGNoIGlmIGdyb3VwZWRcbiAgICAgICAgZ3JvdXBDb2xvcixcbiAgICAgIH07XG4gICAgfSk7XG5cbiAgICAvLyBQb3B1bGF0ZSBncm91cCBpbmZvIGlmIG5lZWRlZFxuICAgIC8vIFdlIGRvIHRoaXMgaW4gYSBzZWNvbmQgcGFzcyB0byBiYXRjaCBvciBqdXN0IGluZGl2aWR1YWxseSBpZiBuZWVkZWQuXG4gICAgLy8gQWN0dWFsbHksIHdlIGNhbiBnZXQgZ3JvdXAgaW5mbyBmcm9tIGNocm9tZS50YWJHcm91cHMuXG4gICAgLy8gSG93ZXZlciwgdGhlIHRhYiBvYmplY3QgZG9lc24ndCBoYXZlIHRoZSBncm91cCB0aXRsZSBkaXJlY3RseS5cblxuICAgIC8vIE9wdGltaXphdGlvbjogR2V0IGFsbCBncm91cHMgZmlyc3QuXG5cbiAgICB3aW5kb3dTdGF0ZXMucHVzaCh7IHRhYnM6IHRhYlN0YXRlcyB9KTtcbiAgfVxuXG4gIC8vIEVucmljaCB3aXRoIGdyb3VwIGluZm9cbiAgY29uc3QgYWxsR3JvdXBzID0gYXdhaXQgY2hyb21lLnRhYkdyb3Vwcy5xdWVyeSh7fSk7XG4gIGNvbnN0IGdyb3VwTWFwID0gbmV3IE1hcChhbGxHcm91cHMubWFwKGcgPT4gW2cuaWQsIGddKSk7XG5cbiAgZm9yIChjb25zdCB3aW4gb2Ygd2luZG93U3RhdGVzKSB7XG4gICAgZm9yIChjb25zdCB0YWIgb2Ygd2luLnRhYnMpIHtcbiAgICAgIGlmICh0YWIuZ3JvdXBJZCAmJiB0YWIuZ3JvdXBJZCAhPT0gY2hyb21lLnRhYkdyb3Vwcy5UQUJfR1JPVVBfSURfTk9ORSkge1xuICAgICAgICBjb25zdCBnID0gZ3JvdXBNYXAuZ2V0KHRhYi5ncm91cElkKTtcbiAgICAgICAgaWYgKGcpIHtcbiAgICAgICAgICB0YWIuZ3JvdXBUaXRsZSA9IGcudGl0bGU7XG4gICAgICAgICAgdGFiLmdyb3VwQ29sb3IgPSBnLmNvbG9yO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICB0aW1lc3RhbXA6IERhdGUubm93KCksXG4gICAgd2luZG93czogd2luZG93U3RhdGVzLFxuICB9O1xufTtcblxuZXhwb3J0IGNvbnN0IHB1c2hVbmRvU3RhdGUgPSBhc3luYyAoKSA9PiB7XG4gIGNvbnN0IHN0YXRlID0gYXdhaXQgY2FwdHVyZUN1cnJlbnRTdGF0ZSgpO1xuICBjb25zdCBzdGFjayA9IChhd2FpdCBnZXRTdG9yZWRWYWx1ZTxVbmRvU3RhdGVbXT4oVU5ET19TVEFDS19LRVkpKSB8fCBbXTtcbiAgc3RhY2sucHVzaChzdGF0ZSk7XG4gIGlmIChzdGFjay5sZW5ndGggPiBNQVhfVU5ET19TVEFDSykge1xuICAgIHN0YWNrLnNoaWZ0KCk7XG4gIH1cbiAgYXdhaXQgc2V0U3RvcmVkVmFsdWUoVU5ET19TVEFDS19LRVksIHN0YWNrKTtcbiAgbG9nSW5mbyhcIlB1c2hlZCB1bmRvIHN0YXRlXCIsIHsgc3RhY2tTaXplOiBzdGFjay5sZW5ndGggfSk7XG59O1xuXG5leHBvcnQgY29uc3Qgc2F2ZVN0YXRlID0gYXN5bmMgKG5hbWU6IHN0cmluZykgPT4ge1xuICBjb25zdCB1bmRvU3RhdGUgPSBhd2FpdCBjYXB0dXJlQ3VycmVudFN0YXRlKCk7XG4gIGNvbnN0IHNhdmVkU3RhdGU6IFNhdmVkU3RhdGUgPSB7XG4gICAgbmFtZSxcbiAgICB0aW1lc3RhbXA6IHVuZG9TdGF0ZS50aW1lc3RhbXAsXG4gICAgd2luZG93czogdW5kb1N0YXRlLndpbmRvd3MsXG4gIH07XG4gIGNvbnN0IHNhdmVkU3RhdGVzID0gKGF3YWl0IGdldFN0b3JlZFZhbHVlPFNhdmVkU3RhdGVbXT4oU0FWRURfU1RBVEVTX0tFWSkpIHx8IFtdO1xuICBzYXZlZFN0YXRlcy5wdXNoKHNhdmVkU3RhdGUpO1xuICBhd2FpdCBzZXRTdG9yZWRWYWx1ZShTQVZFRF9TVEFURVNfS0VZLCBzYXZlZFN0YXRlcyk7XG4gIGxvZ0luZm8oXCJTYXZlZCBzdGF0ZVwiLCB7IG5hbWUgfSk7XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0U2F2ZWRTdGF0ZXMgPSBhc3luYyAoKTogUHJvbWlzZTxTYXZlZFN0YXRlW10+ID0+IHtcbiAgcmV0dXJuIChhd2FpdCBnZXRTdG9yZWRWYWx1ZTxTYXZlZFN0YXRlW10+KFNBVkVEX1NUQVRFU19LRVkpKSB8fCBbXTtcbn07XG5cbmV4cG9ydCBjb25zdCBkZWxldGVTYXZlZFN0YXRlID0gYXN5bmMgKG5hbWU6IHN0cmluZykgPT4ge1xuICBsZXQgc2F2ZWRTdGF0ZXMgPSAoYXdhaXQgZ2V0U3RvcmVkVmFsdWU8U2F2ZWRTdGF0ZVtdPihTQVZFRF9TVEFURVNfS0VZKSkgfHwgW107XG4gIHNhdmVkU3RhdGVzID0gc2F2ZWRTdGF0ZXMuZmlsdGVyKHMgPT4gcy5uYW1lICE9PSBuYW1lKTtcbiAgYXdhaXQgc2V0U3RvcmVkVmFsdWUoU0FWRURfU1RBVEVTX0tFWSwgc2F2ZWRTdGF0ZXMpO1xuICBsb2dJbmZvKFwiRGVsZXRlZCBzYXZlZCBzdGF0ZVwiLCB7IG5hbWUgfSk7XG59O1xuXG5leHBvcnQgY29uc3QgdW5kbyA9IGFzeW5jICgpID0+IHtcbiAgY29uc3Qgc3RhY2sgPSAoYXdhaXQgZ2V0U3RvcmVkVmFsdWU8VW5kb1N0YXRlW10+KFVORE9fU1RBQ0tfS0VZKSkgfHwgW107XG4gIGNvbnN0IHN0YXRlID0gc3RhY2sucG9wKCk7XG4gIGlmICghc3RhdGUpIHtcbiAgICBsb2dJbmZvKFwiVW5kbyBzdGFjayBlbXB0eVwiKTtcbiAgICByZXR1cm47XG4gIH1cbiAgYXdhaXQgc2V0U3RvcmVkVmFsdWUoVU5ET19TVEFDS19LRVksIHN0YWNrKTtcbiAgYXdhaXQgcmVzdG9yZVN0YXRlKHN0YXRlKTtcbiAgbG9nSW5mbyhcIlVuZGlkIGxhc3QgYWN0aW9uXCIpO1xufTtcblxuZXhwb3J0IGNvbnN0IHJlc3RvcmVTdGF0ZSA9IGFzeW5jIChzdGF0ZTogVW5kb1N0YXRlIHwgU2F2ZWRTdGF0ZSkgPT4ge1xuICAvLyBTdHJhdGVneTpcbiAgLy8gMS4gVW5ncm91cCBhbGwgdGFicyAob3B0aW9uYWwsIGJ1dCBjbGVhbmVyKS5cbiAgLy8gMi4gTW92ZSB0YWJzIHRvIGNvcnJlY3Qgd2luZG93cyBhbmQgaW5kaWNlcy5cbiAgLy8gMy4gUmUtZ3JvdXAgdGFicy5cblxuICAvLyBXZSBuZWVkIHRvIG1hdGNoIGN1cnJlbnQgdGFicyB0byBzdG9yZWQgdGFicy5cbiAgLy8gUHJpb3JpdHk6IElEIG1hdGNoIC0+IFVSTCBtYXRjaC5cblxuICBjb25zdCBjdXJyZW50VGFicyA9IGF3YWl0IGNocm9tZS50YWJzLnF1ZXJ5KHt9KTtcbiAgY29uc3QgY3VycmVudFRhYk1hcCA9IG5ldyBNYXA8bnVtYmVyLCBjaHJvbWUudGFicy5UYWI+KCk7XG4gIGNvbnN0IGN1cnJlbnRVcmxNYXAgPSBuZXcgTWFwPHN0cmluZywgY2hyb21lLnRhYnMuVGFiW10+KCk7IC8vIFVSTCAtPiBsaXN0IG9mIHRhYnNcblxuICBjdXJyZW50VGFicy5mb3JFYWNoKHQgPT4ge1xuICAgIGlmICh0LmlkKSBjdXJyZW50VGFiTWFwLnNldCh0LmlkLCB0KTtcbiAgICBpZiAodC51cmwpIHtcbiAgICAgIGNvbnN0IGxpc3QgPSBjdXJyZW50VXJsTWFwLmdldCh0LnVybCkgfHwgW107XG4gICAgICBsaXN0LnB1c2godCk7XG4gICAgICBjdXJyZW50VXJsTWFwLnNldCh0LnVybCwgbGlzdCk7XG4gICAgfVxuICB9KTtcblxuICAvLyBIZWxwZXIgdG8gZmluZCBhIHRhYiAoYXN5bmMgdG8gYWxsb3cgY3JlYXRpb24pXG4gIGNvbnN0IGZpbmRPckNyZWF0ZVRhYiA9IGFzeW5jIChzdG9yZWQ6IFN0b3JlZFRhYlN0YXRlKTogUHJvbWlzZTxjaHJvbWUudGFicy5UYWIgfCB1bmRlZmluZWQ+ID0+IHtcbiAgICAvLyBUcnkgSURcbiAgICBpZiAoc3RvcmVkLmlkICYmIGN1cnJlbnRUYWJNYXAuaGFzKHN0b3JlZC5pZCkpIHtcbiAgICAgIGNvbnN0IHQgPSBjdXJyZW50VGFiTWFwLmdldChzdG9yZWQuaWQpO1xuICAgICAgY3VycmVudFRhYk1hcC5kZWxldGUoc3RvcmVkLmlkISk7IC8vIENvbnN1bWVcbiAgICAgIC8vIEFsc28gcmVtb3ZlIGZyb20gdXJsIG1hcCB0byBhdm9pZCBkb3VibGUgdXNhZ2VcbiAgICAgIGlmICh0Py51cmwpIHtcbiAgICAgICAgIGNvbnN0IGxpc3QgPSBjdXJyZW50VXJsTWFwLmdldCh0LnVybCk7XG4gICAgICAgICBpZiAobGlzdCkge1xuICAgICAgICAgICAgY29uc3QgaWR4ID0gbGlzdC5maW5kSW5kZXgoeCA9PiB4LmlkID09PSB0LmlkKTtcbiAgICAgICAgICAgIGlmIChpZHggIT09IC0xKSBsaXN0LnNwbGljZShpZHgsIDEpO1xuICAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHQ7XG4gICAgfVxuICAgIC8vIFRyeSBVUkxcbiAgICBjb25zdCBsaXN0ID0gY3VycmVudFVybE1hcC5nZXQoc3RvcmVkLnVybCk7XG4gICAgaWYgKGxpc3QgJiYgbGlzdC5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCB0ID0gbGlzdC5zaGlmdCgpO1xuICAgICAgaWYgKHQ/LmlkKSBjdXJyZW50VGFiTWFwLmRlbGV0ZSh0LmlkKTsgLy8gQ29uc3VtZVxuICAgICAgcmV0dXJuIHQ7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIGlmIG1pc3NpbmdcbiAgICBpZiAoc3RvcmVkLnVybCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgdCA9IGF3YWl0IGNocm9tZS50YWJzLmNyZWF0ZSh7IHVybDogc3RvcmVkLnVybCwgYWN0aXZlOiBmYWxzZSB9KTtcbiAgICAgICAgICAgIHJldHVybiB0O1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBsb2dFcnJvcihcIkZhaWxlZCB0byBjcmVhdGUgdGFiXCIsIHsgdXJsOiBzdG9yZWQudXJsLCBlcnJvcjogZSB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH07XG5cbiAgLy8gV2UgbmVlZCB0byByZWNvbnN0cnVjdCB3aW5kb3dzLlxuICAvLyBJZGVhbGx5LCB3ZSBtYXAgc3RhdGUgd2luZG93cyB0byBjdXJyZW50IHdpbmRvd3MuXG4gIC8vIEJ1dCBzdHJpY3RseSwgd2UgY2FuIGp1c3QgbW92ZSB0YWJzLlxuXG4gIC8vIEZvciBzaW1wbGljaXR5LCBsZXQncyBhc3N1bWUgd2UgdXNlIGV4aXN0aW5nIHdpbmRvd3MgYXMgbXVjaCBhcyBwb3NzaWJsZS5cbiAgLy8gT3IgY3JlYXRlIG5ldyBvbmVzIGlmIHdlIHJ1biBvdXQ/XG4gIC8vIExldCdzIGl0ZXJhdGUgc3RvcmVkIHdpbmRvd3MuXG5cbiAgY29uc3QgY3VycmVudFdpbmRvd3MgPSBhd2FpdCBjaHJvbWUud2luZG93cy5nZXRBbGwoKTtcblxuICBmb3IgKGxldCBpID0gMDsgaSA8IHN0YXRlLndpbmRvd3MubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCB3aW5TdGF0ZSA9IHN0YXRlLndpbmRvd3NbaV07XG5cbiAgICAvLyBJZGVudGlmeSBhbGwgdGFicyBmb3IgdGhpcyB3aW5kb3cgZmlyc3QuXG4gICAgLy8gV2UgZG8gdGhpcyBCRUZPUkUgY3JlYXRpbmcgYSB3aW5kb3cgdG8gYXZvaWQgY3JlYXRpbmcgZW1wdHkgd2luZG93cy5cbiAgICBjb25zdCB0YWJzVG9Nb3ZlOiB7IHRhYklkOiBudW1iZXIsIHN0b3JlZDogU3RvcmVkVGFiU3RhdGUgfVtdID0gW107XG5cbiAgICBmb3IgKGNvbnN0IHN0b3JlZFRhYiBvZiB3aW5TdGF0ZS50YWJzKSB7XG4gICAgICBjb25zdCBmb3VuZCA9IGF3YWl0IGZpbmRPckNyZWF0ZVRhYihzdG9yZWRUYWIpO1xuICAgICAgaWYgKGZvdW5kICYmIGZvdW5kLmlkKSB7XG4gICAgICAgIHRhYnNUb01vdmUucHVzaCh7IHRhYklkOiBmb3VuZC5pZCwgc3RvcmVkOiBzdG9yZWRUYWIgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHRhYnNUb01vdmUubGVuZ3RoID09PSAwKSBjb250aW51ZTtcblxuICAgIGxldCB0YXJnZXRXaW5kb3dJZDogbnVtYmVyO1xuXG4gICAgaWYgKGkgPCBjdXJyZW50V2luZG93cy5sZW5ndGgpIHtcbiAgICAgIHRhcmdldFdpbmRvd0lkID0gY3VycmVudFdpbmRvd3NbaV0uaWQhO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBDcmVhdGUgbmV3IHdpbmRvd1xuICAgICAgY29uc3Qgd2luID0gYXdhaXQgY2hyb21lLndpbmRvd3MuY3JlYXRlKHt9KTtcbiAgICAgIHRhcmdldFdpbmRvd0lkID0gd2luLmlkITtcbiAgICAgIC8vIE5vdGU6IE5ldyB3aW5kb3cgY3JlYXRpb24gYWRkcyBhIHRhYi4gV2UgbWlnaHQgd2FudCB0byByZW1vdmUgaXQgbGF0ZXIgb3IgaWdub3JlIGl0LlxuICAgIH1cblxuICAgIC8vIE1vdmUgYWxsIHRvIHdpbmRvdy5cbiAgICAvLyBOb3RlOiBJZiB3ZSBtb3ZlIHRvIGluZGV4IDAsIHRoZXkgd2lsbCBiZSBwcmVwZW5kZWQuXG4gICAgLy8gV2Ugc2hvdWxkIHByb2JhYmx5IGp1c3QgbW92ZSB0aGVtIHRvIHRoZSB3aW5kb3cgZmlyc3QuXG4gICAgLy8gSWYgd2UgbW92ZSB0aGVtIGluZGl2aWR1YWxseSB0byBjb3JyZWN0IGluZGV4LCBpdCdzIHNhZmVyLlxuXG4gICAgY29uc3QgdGFiSWRzID0gdGFic1RvTW92ZS5tYXAodCA9PiB0LnRhYklkKTtcbiAgICB0cnkge1xuICAgICAgLy8gT3B0aW1pemF0aW9uOiBCYXRjaCBtb3ZlIGFsbCB0YWJzIGF0IG9uY2VcbiAgICAgIGF3YWl0IGNocm9tZS50YWJzLm1vdmUodGFiSWRzLCB7IHdpbmRvd0lkOiB0YXJnZXRXaW5kb3dJZCwgaW5kZXg6IDAgfSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgbG9nRXJyb3IoXCJGYWlsZWQgdG8gYmF0Y2ggbW92ZSB0YWJzLCBmYWxsaW5nIGJhY2sgdG8gaW5kaXZpZHVhbCBtb3Zlc1wiLCB7IGVycm9yOiBlIH0pO1xuICAgICAgLy8gRmFsbGJhY2s6IE1vdmUgaW5kaXZpZHVhbGx5IGlmIGJhdGNoIGZhaWxzXG4gICAgICBmb3IgKGxldCBqID0gMDsgaiA8IHRhYnNUb01vdmUubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgY29uc3QgeyB0YWJJZCB9ID0gdGFic1RvTW92ZVtqXTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBhd2FpdCBjaHJvbWUudGFicy5tb3ZlKHRhYklkLCB7IHdpbmRvd0lkOiB0YXJnZXRXaW5kb3dJZCwgaW5kZXg6IGogfSk7XG4gICAgICAgIH0gY2F0Y2ggKGUyKSB7XG4gICAgICAgICAgbG9nRXJyb3IoXCJGYWlsZWQgdG8gbW92ZSB0YWIgaW5kaXZpZHVhbGx5XCIsIHsgdGFiSWQsIGVycm9yOiBlMiB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEhhbmRsZSBwaW5uaW5nIGFmdGVyIG1vdmVcbiAgICBmb3IgKGNvbnN0IHsgdGFiSWQsIHN0b3JlZCB9IG9mIHRhYnNUb01vdmUpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGlmIChzdG9yZWQucGlubmVkKSB7XG4gICAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMudXBkYXRlKHRhYklkLCB7IHBpbm5lZDogdHJ1ZSB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBJZiBjdXJyZW50bHkgcGlubmVkIGJ1dCBzaG91bGRuJ3QgYmVcbiAgICAgICAgICBjb25zdCBjdXJyZW50ID0gYXdhaXQgY2hyb21lLnRhYnMuZ2V0KHRhYklkKTtcbiAgICAgICAgICBpZiAoY3VycmVudC5waW5uZWQpIGF3YWl0IGNocm9tZS50YWJzLnVwZGF0ZSh0YWJJZCwgeyBwaW5uZWQ6IGZhbHNlIH0pO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGxvZ0Vycm9yKFwiRmFpbGVkIHRvIHVwZGF0ZSB0YWIgcGluIHN0YXRlXCIsIHsgdGFiSWQsIGVycm9yOiBlIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEhhbmRsZSBHcm91cHNcbiAgICAvLyBJZGVudGlmeSBncm91cHMgaW4gdGhpcyB3aW5kb3dcbiAgICBjb25zdCBncm91cHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyW10+KCk7IC8vIHRpdGxlK2NvbG9yIC0+IHRhYklkc1xuICAgIGNvbnN0IGdyb3VwQ29sb3JzID0gbmV3IE1hcDxzdHJpbmcsIGNocm9tZS50YWJHcm91cHMuQ29sb3JFbnVtPigpO1xuXG4gICAgZm9yIChjb25zdCBpdGVtIG9mIHRhYnNUb01vdmUpIHtcbiAgICAgIGlmIChpdGVtLnN0b3JlZC5ncm91cFRpdGxlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgLy8gVXNlIHRpdGxlIGFzIGtleSAob3IgdW5pcXVlIElEIGlmIHdlIGhhZCBvbmUsIGJ1dCB3ZSBkb24ndCBwZXJzaXN0IGdyb3VwIElEcylcbiAgICAgICAgLy8gR3JvdXAgSUQgaW4gc3RvcmFnZSBpcyBlcGhlbWVyYWwuIFRpdGxlIGlzIGtleS5cbiAgICAgICAgY29uc3Qga2V5ID0gaXRlbS5zdG9yZWQuZ3JvdXBUaXRsZTtcbiAgICAgICAgY29uc3QgbGlzdCA9IGdyb3Vwcy5nZXQoa2V5KSB8fCBbXTtcbiAgICAgICAgbGlzdC5wdXNoKGl0ZW0udGFiSWQpO1xuICAgICAgICBncm91cHMuc2V0KGtleSwgbGlzdCk7XG4gICAgICAgIGlmIChpdGVtLnN0b3JlZC5ncm91cENvbG9yKSB7XG4gICAgICAgICAgICAgZ3JvdXBDb2xvcnMuc2V0KGtleSwgaXRlbS5zdG9yZWQuZ3JvdXBDb2xvciBhcyBjaHJvbWUudGFiR3JvdXBzLkNvbG9yRW51bSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgICAvLyBVbmdyb3VwIGlmIG5lZWRlZFxuICAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMudW5ncm91cChpdGVtLnRhYklkKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IFt0aXRsZSwgaWRzXSBvZiBncm91cHMuZW50cmllcygpKSB7XG4gICAgICBpZiAoaWRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29uc3QgZ3JvdXBJZCA9IGF3YWl0IGNocm9tZS50YWJzLmdyb3VwKHsgdGFiSWRzOiBpZHMgfSk7XG4gICAgICAgIGF3YWl0IGNocm9tZS50YWJHcm91cHMudXBkYXRlKGdyb3VwSWQsIHtcbiAgICAgICAgICAgICB0aXRsZTogdGl0bGUsXG4gICAgICAgICAgICAgY29sb3I6IGdyb3VwQ29sb3JzLmdldCh0aXRsZSkgfHwgXCJncmV5XCJcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuIiwgImltcG9ydCB7IGFwcGx5VGFiR3JvdXBzLCBhcHBseVRhYlNvcnRpbmcsIGNhbGN1bGF0ZVRhYkdyb3VwcywgZmV0Y2hDdXJyZW50VGFiR3JvdXBzLCBtZXJnZVRhYnMsIHNwbGl0VGFicyB9IGZyb20gXCIuL3RhYk1hbmFnZXIuanNcIjtcbmltcG9ydCB7IGxvYWRQcmVmZXJlbmNlcywgc2F2ZVByZWZlcmVuY2VzIH0gZnJvbSBcIi4vcHJlZmVyZW5jZXMuanNcIjtcbmltcG9ydCB7IHNldEN1c3RvbVN0cmF0ZWdpZXMgfSBmcm9tIFwiLi9ncm91cGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnLCBsb2dJbmZvLCBnZXRMb2dzLCBjbGVhckxvZ3MsIHNldExvZ2dlclByZWZlcmVuY2VzLCBpbml0TG9nZ2VyLCBhZGRMb2dFbnRyeSwgbG9nZ2VyUmVhZHkgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgcHVzaFVuZG9TdGF0ZSwgc2F2ZVN0YXRlLCB1bmRvLCBnZXRTYXZlZFN0YXRlcywgZGVsZXRlU2F2ZWRTdGF0ZSwgcmVzdG9yZVN0YXRlIH0gZnJvbSBcIi4vc3RhdGVNYW5hZ2VyLmpzXCI7XG5pbXBvcnQge1xuICBBcHBseUdyb3VwaW5nUGF5bG9hZCxcbiAgR3JvdXBpbmdTZWxlY3Rpb24sXG4gIEdyb3VwaW5nU3RyYXRlZ3ksXG4gIFByZWZlcmVuY2VzLFxuICBSdW50aW1lTWVzc2FnZSxcbiAgUnVudGltZVJlc3BvbnNlLFxuICBTb3J0aW5nU3RyYXRlZ3ksXG4gIFRhYkdyb3VwXG59IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcblxuY2hyb21lLnJ1bnRpbWUub25JbnN0YWxsZWQuYWRkTGlzdGVuZXIoYXN5bmMgKCkgPT4ge1xuICBjb25zdCBwcmVmcyA9IGF3YWl0IGxvYWRQcmVmZXJlbmNlcygpO1xuICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuICBsb2dJbmZvKFwiRXh0ZW5zaW9uIGluc3RhbGxlZFwiLCB7XG4gICAgdmVyc2lvbjogY2hyb21lLnJ1bnRpbWUuZ2V0TWFuaWZlc3QoKS52ZXJzaW9uLFxuICAgIGxvZ0xldmVsOiBwcmVmcy5sb2dMZXZlbCxcbiAgICBzdHJhdGVnaWVzQ291bnQ6IHByZWZzLmN1c3RvbVN0cmF0ZWdpZXM/Lmxlbmd0aCB8fCAwXG4gIH0pO1xufSk7XG5cbi8vIEluaXRpYWxpemUgbG9nZ2VyIG9uIHN0YXJ0dXBcbmxvYWRQcmVmZXJlbmNlcygpLnRoZW4oYXN5bmMgKHByZWZzKSA9PiB7XG4gICAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhwcmVmcy5jdXN0b21TdHJhdGVnaWVzIHx8IFtdKTtcbiAgICBhd2FpdCBpbml0TG9nZ2VyKCk7XG4gICAgbG9nSW5mbyhcIlNlcnZpY2UgV29ya2VyIEluaXRpYWxpemVkXCIsIHtcbiAgICAgICAgdmVyc2lvbjogY2hyb21lLnJ1bnRpbWUuZ2V0TWFuaWZlc3QoKS52ZXJzaW9uLFxuICAgICAgICBsb2dMZXZlbDogcHJlZnMubG9nTGV2ZWxcbiAgICB9KTtcbn0pO1xuXG5jb25zdCBoYW5kbGVNZXNzYWdlID0gYXN5bmMgPFREYXRhPihcbiAgbWVzc2FnZTogUnVudGltZU1lc3NhZ2UsXG4gIHNlbmRlcjogY2hyb21lLnJ1bnRpbWUuTWVzc2FnZVNlbmRlclxuKTogUHJvbWlzZTxSdW50aW1lUmVzcG9uc2U8VERhdGE+PiA9PiB7XG4gIGxvZ0RlYnVnKFwiUmVjZWl2ZWQgbWVzc2FnZVwiLCB7IHR5cGU6IG1lc3NhZ2UudHlwZSwgZnJvbTogc2VuZGVyLmlkIH0pO1xuICBzd2l0Y2ggKG1lc3NhZ2UudHlwZSkge1xuICAgIGNhc2UgXCJnZXRTdGF0ZVwiOiB7XG4gICAgICBjb25zdCBwcmVmcyA9IGF3YWl0IGxvYWRQcmVmZXJlbmNlcygpO1xuICAgICAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhwcmVmcy5jdXN0b21TdHJhdGVnaWVzIHx8IFtdKTtcbiAgICAgIC8vIFVzZSBmZXRjaEN1cnJlbnRUYWJHcm91cHMgdG8gcmV0dXJuIHRoZSBhY3R1YWwgc3RhdGUgb2YgdGhlIGJyb3dzZXIgdGFic1xuICAgICAgY29uc3QgZ3JvdXBzID0gYXdhaXQgZmV0Y2hDdXJyZW50VGFiR3JvdXBzKHByZWZzKTtcbiAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBkYXRhOiB7IGdyb3VwcywgcHJlZmVyZW5jZXM6IHByZWZzIH0gYXMgVERhdGEgfTtcbiAgICB9XG4gICAgY2FzZSBcImFwcGx5R3JvdXBpbmdcIjoge1xuICAgICAgbG9nSW5mbyhcIkFwcGx5aW5nIGdyb3VwaW5nIGZyb20gbWVzc2FnZVwiLCB7IHNvcnRpbmc6IChtZXNzYWdlLnBheWxvYWQgYXMgYW55KT8uc29ydGluZyB9KTtcbiAgICAgIGF3YWl0IHB1c2hVbmRvU3RhdGUoKTtcbiAgICAgIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuICAgICAgY29uc3QgcGF5bG9hZCA9IChtZXNzYWdlLnBheWxvYWQgYXMgQXBwbHlHcm91cGluZ1BheWxvYWQgfCB1bmRlZmluZWQpID8/IHt9O1xuICAgICAgY29uc3Qgc2VsZWN0aW9uID0gcGF5bG9hZC5zZWxlY3Rpb24gPz8ge307XG4gICAgICBjb25zdCBzb3J0aW5nID0gcGF5bG9hZC5zb3J0aW5nPy5sZW5ndGggPyBwYXlsb2FkLnNvcnRpbmcgOiB1bmRlZmluZWQ7XG5cbiAgICAgIGNvbnN0IHByZWZlcmVuY2VzID0gc29ydGluZyA/IHsgLi4ucHJlZnMsIHNvcnRpbmcgfSA6IHByZWZzO1xuXG4gICAgICBjb25zdCBvblByb2dyZXNzID0gKGNvbXBsZXRlZDogbnVtYmVyLCB0b3RhbDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICB0eXBlOiBcImdyb3VwaW5nUHJvZ3Jlc3NcIixcbiAgICAgICAgICAgICAgcGF5bG9hZDogeyBjb21wbGV0ZWQsIHRvdGFsIH1cbiAgICAgICAgICB9KS5jYXRjaCgoKSA9PiB7fSk7XG4gICAgICB9O1xuXG4gICAgICAvLyBVc2UgY2FsY3VsYXRlVGFiR3JvdXBzIHRvIGRldGVybWluZSB0aGUgdGFyZ2V0IGdyb3VwaW5nXG4gICAgICBjb25zdCBncm91cHMgPSBhd2FpdCBjYWxjdWxhdGVUYWJHcm91cHMocHJlZmVyZW5jZXMsIHNlbGVjdGlvbiwgb25Qcm9ncmVzcyk7XG4gICAgICBhd2FpdCBhcHBseVRhYkdyb3Vwcyhncm91cHMpO1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGRhdGE6IHsgZ3JvdXBzIH0gYXMgVERhdGEgfTtcbiAgICB9XG4gICAgY2FzZSBcImFwcGx5U29ydGluZ1wiOiB7XG4gICAgICBsb2dJbmZvKFwiQXBwbHlpbmcgc29ydGluZyBmcm9tIG1lc3NhZ2VcIik7XG4gICAgICBhd2FpdCBwdXNoVW5kb1N0YXRlKCk7XG4gICAgICBjb25zdCBwcmVmcyA9IGF3YWl0IGxvYWRQcmVmZXJlbmNlcygpO1xuICAgICAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhwcmVmcy5jdXN0b21TdHJhdGVnaWVzIHx8IFtdKTtcbiAgICAgIGNvbnN0IHBheWxvYWQgPSAobWVzc2FnZS5wYXlsb2FkIGFzIEFwcGx5R3JvdXBpbmdQYXlsb2FkIHwgdW5kZWZpbmVkKSA/PyB7fTtcbiAgICAgIGNvbnN0IHNlbGVjdGlvbiA9IHBheWxvYWQuc2VsZWN0aW9uID8/IHt9O1xuICAgICAgY29uc3Qgc29ydGluZyA9IHBheWxvYWQuc29ydGluZz8ubGVuZ3RoID8gcGF5bG9hZC5zb3J0aW5nIDogdW5kZWZpbmVkO1xuICAgICAgY29uc3QgcHJlZmVyZW5jZXMgPSBzb3J0aW5nID8geyAuLi5wcmVmcywgc29ydGluZyB9IDogcHJlZnM7XG5cbiAgICAgIGNvbnN0IG9uUHJvZ3Jlc3MgPSAoY29tcGxldGVkOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+IHtcbiAgICAgICAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICAgIHR5cGU6IFwiZ3JvdXBpbmdQcm9ncmVzc1wiLFxuICAgICAgICAgICAgICBwYXlsb2FkOiB7IGNvbXBsZXRlZCwgdG90YWwgfVxuICAgICAgICAgIH0pLmNhdGNoKCgpID0+IHt9KTtcbiAgICAgIH07XG5cbiAgICAgIGF3YWl0IGFwcGx5VGFiU29ydGluZyhwcmVmZXJlbmNlcywgc2VsZWN0aW9uLCBvblByb2dyZXNzKTtcbiAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgfVxuICAgIGNhc2UgXCJtZXJnZVNlbGVjdGlvblwiOiB7XG4gICAgICBsb2dJbmZvKFwiTWVyZ2luZyBzZWxlY3Rpb24gZnJvbSBtZXNzYWdlXCIpO1xuICAgICAgYXdhaXQgcHVzaFVuZG9TdGF0ZSgpO1xuICAgICAgY29uc3QgcGF5bG9hZCA9IG1lc3NhZ2UucGF5bG9hZCBhcyB7IHRhYklkczogbnVtYmVyW10gfTtcbiAgICAgIGlmIChwYXlsb2FkPy50YWJJZHM/Lmxlbmd0aCkge1xuICAgICAgICBhd2FpdCBtZXJnZVRhYnMocGF5bG9hZC50YWJJZHMpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJObyB0YWJzIHNlbGVjdGVkXCIgfTtcbiAgICB9XG4gICAgY2FzZSBcInNwbGl0U2VsZWN0aW9uXCI6IHtcbiAgICAgIGxvZ0luZm8oXCJTcGxpdHRpbmcgc2VsZWN0aW9uIGZyb20gbWVzc2FnZVwiKTtcbiAgICAgIGF3YWl0IHB1c2hVbmRvU3RhdGUoKTtcbiAgICAgIGNvbnN0IHBheWxvYWQgPSBtZXNzYWdlLnBheWxvYWQgYXMgeyB0YWJJZHM6IG51bWJlcltdIH07XG4gICAgICBpZiAocGF5bG9hZD8udGFiSWRzPy5sZW5ndGgpIHtcbiAgICAgICAgYXdhaXQgc3BsaXRUYWJzKHBheWxvYWQudGFiSWRzKTtcbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiTm8gdGFicyBzZWxlY3RlZFwiIH07XG4gICAgfVxuICAgIGNhc2UgXCJ1bmRvXCI6IHtcbiAgICAgIGxvZ0luZm8oXCJVbmRvaW5nIGxhc3QgYWN0aW9uXCIpO1xuICAgICAgYXdhaXQgdW5kbygpO1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICB9XG4gICAgY2FzZSBcInNhdmVTdGF0ZVwiOiB7XG4gICAgICBjb25zdCBuYW1lID0gKG1lc3NhZ2UucGF5bG9hZCBhcyBhbnkpPy5uYW1lO1xuICAgICAgaWYgKHR5cGVvZiBuYW1lID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIGxvZ0luZm8oXCJTYXZpbmcgc3RhdGUgZnJvbSBtZXNzYWdlXCIsIHsgbmFtZSB9KTtcbiAgICAgICAgYXdhaXQgc2F2ZVN0YXRlKG5hbWUpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIG5hbWVcIiB9O1xuICAgIH1cbiAgICBjYXNlIFwiZ2V0U2F2ZWRTdGF0ZXNcIjoge1xuICAgICAgY29uc3Qgc3RhdGVzID0gYXdhaXQgZ2V0U2F2ZWRTdGF0ZXMoKTtcbiAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBkYXRhOiBzdGF0ZXMgYXMgVERhdGEgfTtcbiAgICB9XG4gICAgY2FzZSBcInJlc3RvcmVTdGF0ZVwiOiB7XG4gICAgICBjb25zdCBzdGF0ZSA9IChtZXNzYWdlLnBheWxvYWQgYXMgYW55KT8uc3RhdGU7XG4gICAgICBpZiAoc3RhdGUpIHtcbiAgICAgICAgbG9nSW5mbyhcIlJlc3RvcmluZyBzdGF0ZSBmcm9tIG1lc3NhZ2VcIiwgeyBuYW1lOiBzdGF0ZS5uYW1lIH0pO1xuICAgICAgICBhd2FpdCByZXN0b3JlU3RhdGUoc3RhdGUpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHN0YXRlXCIgfTtcbiAgICB9XG4gICAgY2FzZSBcImRlbGV0ZVNhdmVkU3RhdGVcIjoge1xuICAgICAgY29uc3QgbmFtZSA9IChtZXNzYWdlLnBheWxvYWQgYXMgYW55KT8ubmFtZTtcbiAgICAgIGlmICh0eXBlb2YgbmFtZSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICBsb2dJbmZvKFwiRGVsZXRpbmcgc2F2ZWQgc3RhdGUgZnJvbSBtZXNzYWdlXCIsIHsgbmFtZSB9KTtcbiAgICAgICAgYXdhaXQgZGVsZXRlU2F2ZWRTdGF0ZShuYW1lKTtcbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBuYW1lXCIgfTtcbiAgICB9XG4gICAgY2FzZSBcImxvYWRQcmVmZXJlbmNlc1wiOiB7XG4gICAgICBjb25zdCBwcmVmcyA9IGF3YWl0IGxvYWRQcmVmZXJlbmNlcygpO1xuICAgICAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhwcmVmcy5jdXN0b21TdHJhdGVnaWVzIHx8IFtdKTtcbiAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBkYXRhOiBwcmVmcyBhcyBURGF0YSB9O1xuICAgIH1cbiAgICBjYXNlIFwic2F2ZVByZWZlcmVuY2VzXCI6IHtcbiAgICAgIGxvZ0luZm8oXCJTYXZpbmcgcHJlZmVyZW5jZXMgZnJvbSBtZXNzYWdlXCIpO1xuICAgICAgY29uc3QgcHJlZnMgPSBhd2FpdCBzYXZlUHJlZmVyZW5jZXMobWVzc2FnZS5wYXlsb2FkIGFzIGFueSk7XG4gICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuICAgICAgc2V0TG9nZ2VyUHJlZmVyZW5jZXMocHJlZnMpO1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGRhdGE6IHByZWZzIGFzIFREYXRhIH07XG4gICAgfVxuICAgIGNhc2UgXCJnZXRMb2dzXCI6IHtcbiAgICAgICAgYXdhaXQgbG9nZ2VyUmVhZHk7XG4gICAgICAgIGNvbnN0IGxvZ3MgPSBnZXRMb2dzKCk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBkYXRhOiBsb2dzIGFzIFREYXRhIH07XG4gICAgfVxuICAgIGNhc2UgXCJjbGVhckxvZ3NcIjoge1xuICAgICAgICBjbGVhckxvZ3MoKTtcbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICB9XG4gICAgY2FzZSBcImxvZ0VudHJ5XCI6IHtcbiAgICAgICAgY29uc3QgZW50cnkgPSBtZXNzYWdlLnBheWxvYWQgYXMgYW55O1xuICAgICAgICBpZiAoZW50cnkgJiYgZW50cnkubGV2ZWwgJiYgZW50cnkubWVzc2FnZSkge1xuICAgICAgICAgICAgYWRkTG9nRW50cnkoZW50cnkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgfVxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIlVua25vd24gbWVzc2FnZVwiIH07XG4gIH1cbn07XG5cbmNocm9tZS5ydW50aW1lLm9uTWVzc2FnZS5hZGRMaXN0ZW5lcihcbiAgKFxuICAgIG1lc3NhZ2U6IFJ1bnRpbWVNZXNzYWdlLFxuICAgIHNlbmRlcjogY2hyb21lLnJ1bnRpbWUuTWVzc2FnZVNlbmRlcixcbiAgICBzZW5kUmVzcG9uc2U6IChyZXNwb25zZTogUnVudGltZVJlc3BvbnNlKSA9PiB2b2lkXG4gICkgPT4ge1xuICAgIGhhbmRsZU1lc3NhZ2UobWVzc2FnZSwgc2VuZGVyKVxuICAgIC50aGVuKChyZXNwb25zZSkgPT4gc2VuZFJlc3BvbnNlKHJlc3BvbnNlKSlcbiAgICAuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgICBzZW5kUmVzcG9uc2UoeyBvazogZmFsc2UsIGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICAgIH0pO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG4pO1xuXG5jaHJvbWUudGFiR3JvdXBzLm9uUmVtb3ZlZC5hZGRMaXN0ZW5lcihhc3luYyAoZ3JvdXApID0+IHtcbiAgbG9nSW5mbyhcIlRhYiBncm91cCByZW1vdmVkXCIsIHsgZ3JvdXAgfSk7XG59KTtcblxubGV0IGF1dG9SdW5UaW1lb3V0OiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsO1xuY29uc3QgZGlydHlUYWJJZHMgPSBuZXcgU2V0PG51bWJlcj4oKTtcbmxldCB0YWJQcm9jZXNzaW5nVGltZW91dDogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCBudWxsID0gbnVsbDtcblxuY29uc3QgdHJpZ2dlckF1dG9SdW4gPSAodGFiSWQ/OiBudW1iZXIpID0+IHtcbiAgLy8gMS4gU2NoZWR1bGUgZmFzdCwgdGFyZ2V0ZWQgdXBkYXRlIGZvciBzcGVjaWZpYyB0YWJzXG4gIGlmICh0YWJJZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgZGlydHlUYWJJZHMuYWRkKHRhYklkKTtcbiAgICBpZiAodGFiUHJvY2Vzc2luZ1RpbWVvdXQpIGNsZWFyVGltZW91dCh0YWJQcm9jZXNzaW5nVGltZW91dCk7XG5cbiAgICB0YWJQcm9jZXNzaW5nVGltZW91dCA9IHNldFRpbWVvdXQoYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgaWRzID0gQXJyYXkuZnJvbShkaXJ0eVRhYklkcyk7XG4gICAgICBkaXJ0eVRhYklkcy5jbGVhcigpO1xuICAgICAgaWYgKGlkcy5sZW5ndGggPT09IDApIHJldHVybjtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcHJlZnMgPSBhd2FpdCBsb2FkUHJlZmVyZW5jZXMoKTtcbiAgICAgICAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhwcmVmcy5jdXN0b21TdHJhdGVnaWVzIHx8IFtdKTtcblxuICAgICAgICBjb25zdCBhdXRvUnVuU3RyYXRzID0gcHJlZnMuY3VzdG9tU3RyYXRlZ2llcz8uZmlsdGVyKHMgPT4gcy5hdXRvUnVuKTtcbiAgICAgICAgaWYgKGF1dG9SdW5TdHJhdHMgJiYgYXV0b1J1blN0cmF0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgY29uc3Qgc3RyYXRlZ3lJZHMgPSBhdXRvUnVuU3RyYXRzLm1hcChzID0+IHMuaWQpO1xuICAgICAgICAgIC8vIE9ubHkgcHJvY2VzcyB0aGUgZGlydHkgdGFicyBmb3IgcXVpY2sgZ3JvdXBpbmdcbiAgICAgICAgICBjb25zdCBncm91cHMgPSBhd2FpdCBjYWxjdWxhdGVUYWJHcm91cHMoeyAuLi5wcmVmcywgc29ydGluZzogc3RyYXRlZ3lJZHMgfSwgeyB0YWJJZHM6IGlkcyB9KTtcbiAgICAgICAgICBhd2FpdCBhcHBseVRhYkdyb3Vwcyhncm91cHMpO1xuICAgICAgICAgIGxvZ0luZm8oXCJBdXRvLXJ1biB0YXJnZXRlZFwiLCB7IHRhYnM6IGlkcywgc3RyYXRlZ2llczogc3RyYXRlZ3lJZHMgfSk7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkF1dG8tcnVuIHRhcmdldGVkIGZhaWxlZFwiLCBlKTtcbiAgICAgIH1cbiAgICB9LCAyMDApOyAvLyBGYXN0IGRlYm91bmNlIGZvciByZXNwb25zaXZlbmVzc1xuICB9XG5cbiAgLy8gMi4gU2NoZWR1bGUgZ2xvYmFsIHVwZGF0ZSAoc2xvd2VyIGRlYm91bmNlKSB0byBlbnN1cmUgY29uc2lzdGVuY3kgYW5kIHNvcnRpbmdcbiAgaWYgKGF1dG9SdW5UaW1lb3V0KSBjbGVhclRpbWVvdXQoYXV0b1J1blRpbWVvdXQpO1xuICBhdXRvUnVuVGltZW91dCA9IHNldFRpbWVvdXQoYXN5bmMgKCkgPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBwcmVmcyA9IGF3YWl0IGxvYWRQcmVmZXJlbmNlcygpO1xuICAgICAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhwcmVmcy5jdXN0b21TdHJhdGVnaWVzIHx8IFtdKTtcblxuICAgICAgY29uc3QgYXV0b1J1blN0cmF0cyA9IHByZWZzLmN1c3RvbVN0cmF0ZWdpZXM/LmZpbHRlcihzID0+IHMuYXV0b1J1bik7XG4gICAgICBpZiAoYXV0b1J1blN0cmF0cyAmJiBhdXRvUnVuU3RyYXRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgbG9nSW5mbyhcIkF1dG8tcnVubmluZyBzdHJhdGVnaWVzIChnbG9iYWwpXCIsIHtcbiAgICAgICAgICBzdHJhdGVnaWVzOiBhdXRvUnVuU3RyYXRzLm1hcChzID0+IHMuaWQpLFxuICAgICAgICAgIGNvdW50OiBhdXRvUnVuU3RyYXRzLmxlbmd0aFxuICAgICAgICB9KTtcbiAgICAgICAgY29uc3QgaWRzID0gYXV0b1J1blN0cmF0cy5tYXAocyA9PiBzLmlkKTtcblxuICAgICAgICAvLyBXZSBhcHBseSBncm91cGluZyB1c2luZyB0aGVzZSBzdHJhdGVnaWVzXG4gICAgICAgIGNvbnN0IGdyb3VwcyA9IGF3YWl0IGNhbGN1bGF0ZVRhYkdyb3Vwcyh7IC4uLnByZWZzLCBzb3J0aW5nOiBpZHMgfSk7XG4gICAgICAgIGF3YWl0IGFwcGx5VGFiR3JvdXBzKGdyb3Vwcyk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc29sZS5lcnJvcihcIkF1dG8tcnVuIGZhaWxlZFwiLCBlKTtcbiAgICB9XG4gIH0sIDEwMDApO1xufTtcblxuY2hyb21lLnRhYnMub25DcmVhdGVkLmFkZExpc3RlbmVyKCh0YWIpID0+IHtcbiAgaWYgKHRhYi5pZCkgdHJpZ2dlckF1dG9SdW4odGFiLmlkKTtcbiAgZWxzZSB0cmlnZ2VyQXV0b1J1bigpO1xufSk7XG5jaHJvbWUudGFicy5vblVwZGF0ZWQuYWRkTGlzdGVuZXIoKHRhYklkLCBjaGFuZ2VJbmZvKSA9PiB7XG4gIGlmIChjaGFuZ2VJbmZvLnVybCB8fCBjaGFuZ2VJbmZvLnN0YXR1cyA9PT0gJ2NvbXBsZXRlJykge1xuICAgIHRyaWdnZXJBdXRvUnVuKHRhYklkKTtcbiAgfVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBYU8sSUFBTSxhQUFtQztBQUFBLEVBQzVDLEVBQUUsSUFBSSxVQUFVLE9BQU8sVUFBVSxZQUFZLE1BQU0sV0FBVyxNQUFNLE1BQU0sQ0FBQyxTQUFTLE1BQU0sRUFBRTtBQUFBLEVBQzVGLEVBQUUsSUFBSSxlQUFlLE9BQU8sZUFBZSxZQUFZLE1BQU0sV0FBVyxNQUFNLE1BQU0sQ0FBQyxTQUFTLE1BQU0sRUFBRTtBQUFBLEVBQ3RHLEVBQUUsSUFBSSxTQUFTLE9BQU8sU0FBUyxZQUFZLE1BQU0sV0FBVyxNQUFNLE1BQU0sQ0FBQyxTQUFTLE1BQU0sRUFBRTtBQUFBLEVBQzFGLEVBQUUsSUFBSSxXQUFXLE9BQU8sV0FBVyxZQUFZLE1BQU0sV0FBVyxNQUFNLE1BQU0sQ0FBQyxTQUFTLE1BQU0sRUFBRTtBQUFBLEVBQzlGLEVBQUUsSUFBSSxXQUFXLE9BQU8sV0FBVyxZQUFZLE1BQU0sV0FBVyxNQUFNLE1BQU0sQ0FBQyxTQUFTLE1BQU0sRUFBRTtBQUFBLEVBQzlGLEVB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QyxDQUFDO0FBRWhELGNBQU0sZ0JBQWdCLE1BQU0sa0JBQWtCLE9BQU8sT0FBSyxFQUFFLE9BQU87QUFDbkUsWUFBSSxpQkFBaUIsY0FBYyxTQUFTLEdBQUc7QUFDN0MsZ0JBQU0sY0FBYyxjQUFjLElBQUksT0FBSyxFQUFFLEVBQUU7QUFFL0MsZ0JBQU0sU0FBUyxNQUFNLG1CQUFtQixFQUFFLEdBQUcsT0FBTyxTQUFTLFlBQVksR0FBRyxFQUFFLFFBQVEsSUFBSSxDQUFDO0FBQzNGLGdCQUFNLGVBQWUsTUFBTTtBQUMzQixrQkFBUSxxQkFBcUIsRUFBRSxNQUFNLEtBQUssWUFBWSxZQUFZLENBQUM7QUFBQSxRQUNyRTtBQUFBLE1BQ0YsU0FBUyxHQUFHO0FBQ1YsZ0JBQVEsTUFBTSw0QkFBNEIsQ0FBQztBQUFBLE1BQzdDO0FBQUEsSUFDRixHQUFHLEdBQUc7QUFBQSxFQUNSO0FBR0EsTUFBSSxlQUFnQixjQUFhLGNBQWM7QUFDL0MsbUJBQWlCLFdBQVcsWUFBWTtBQUN0QyxRQUFJO0FBQ0YsWUFBTSxRQUFRLE1BQU0sZ0JBQWdCO0FBQ3BDLDBCQUFvQixNQUFNLG9CQUFvQixDQUFDLENBQUM7QUFFaEQsWUFBTSxnQkFBZ0IsTUFBTSxrQkFBa0IsT0FBTyxPQUFLLEVBQUUsT0FBTztBQUNuRSxVQUFJLGlCQUFpQixjQUFjLFNBQVMsR0FBRztBQUM3QyxnQkFBUSxvQ0FBb0M7QUFBQSxVQUMxQyxZQUFZLGNBQWMsSUFBSSxPQUFLLEVBQUUsRUFBRTtBQUFBLFVBQ3ZDLE9BQU8sY0FBYztBQUFBLFFBQ3ZCLENBQUM7QUFDRCxjQUFNLE1BQU0sY0FBYyxJQUFJLE9BQUssRUFBRSxFQUFFO0FBR3ZDLGNBQU0sU0FBUyxNQUFNLG1CQUFtQixFQUFFLEdBQUcsT0FBTyxTQUFTLElBQUksQ0FBQztBQUNsRSxjQUFNLGVBQWUsTUFBTTtBQUFBLE1BQzdCO0FBQUEsSUFDRixTQUFTLEdBQUc7QUFDVixjQUFRLE1BQU0sbUJBQW1CLENBQUM7QUFBQSxJQUNwQztBQUFBLEVBQ0YsR0FBRyxHQUFJO0FBQ1Q7QUFFQSxPQUFPLEtBQUssVUFBVSxZQUFZLENBQUMsUUFBUTtBQUN6QyxNQUFJLElBQUksR0FBSSxnQkFBZSxJQUFJLEVBQUU7QUFBQSxNQUM1QixnQkFBZTtBQUN0QixDQUFDO0FBQ0QsT0FBTyxLQUFLLFVBQVUsWUFBWSxDQUFDLE9BQU8sZUFBZTtBQUN2RCxNQUFJLFdBQVcsT0FBTyxXQUFXLFdBQVcsWUFBWTtBQUN0RCxtQkFBZSxLQUFLO0FBQUEsRUFDdEI7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogWyJjdXN0b21TdHJhdGVnaWVzIiwgInBhcnRzIiwgImdyb3VwVGFicyIsICJ0YWJzIiwgImxpc3QiLCAibG9ncyJdCn0K
