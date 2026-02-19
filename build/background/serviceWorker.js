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
    url: tab.url || "about:blank",
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
var applyValueTransform = (val, transform, pattern) => {
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
            val = applyValueTransform(val, rule.transform, rule.transformPattern);
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
var triggerAutoRun = () => {
  if (autoRunTimeout) clearTimeout(autoRunTimeout);
  autoRunTimeout = setTimeout(async () => {
    try {
      const prefs = await loadPreferences();
      setCustomStrategies(prefs.customStrategies || []);
      const autoRunStrats = prefs.customStrategies?.filter((s) => s.autoRun);
      if (autoRunStrats && autoRunStrats.length > 0) {
        logInfo("Auto-running strategies", {
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
chrome.tabs.onCreated.addListener(() => triggerAutoRun());
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    triggerAutoRun();
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3NoYXJlZC9zdHJhdGVneVJlZ2lzdHJ5LnRzIiwgIi4uLy4uL3NyYy9zaGFyZWQvbG9nZ2VyLnRzIiwgIi4uLy4uL3NyYy9zaGFyZWQvdXRpbHMudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZ3JvdXBpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3NvcnRpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL2V4dHJhY3Rpb24vbG9naWMudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZXh0cmFjdGlvbi9nZW5lcmFSZWdpc3RyeS50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9zdG9yYWdlLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3ByZWZlcmVuY2VzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL2V4dHJhY3Rpb24vaW5kZXgudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvY29udGV4dEFuYWx5c2lzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3RhYk1hbmFnZXIudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvc3RhdGVNYW5hZ2VyLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3NlcnZpY2VXb3JrZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IEN1c3RvbVN0cmF0ZWd5LCBTb3J0aW5nU3RyYXRlZ3kgfSBmcm9tIFwiLi90eXBlcy5qc1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0cmF0ZWd5RGVmaW5pdGlvbiB7XG4gICAgaWQ6IFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZztcbiAgICBsYWJlbDogc3RyaW5nO1xuICAgIGlzR3JvdXBpbmc6IGJvb2xlYW47XG4gICAgaXNTb3J0aW5nOiBib29sZWFuO1xuICAgIHRhZ3M/OiBzdHJpbmdbXTtcbiAgICBhdXRvUnVuPzogYm9vbGVhbjtcbiAgICBpc0N1c3RvbT86IGJvb2xlYW47XG59XG5cbi8vIFJlc3RvcmVkIHN0cmF0ZWdpZXMgbWF0Y2hpbmcgYmFja2dyb3VuZCBjYXBhYmlsaXRpZXMuXG5leHBvcnQgY29uc3QgU1RSQVRFR0lFUzogU3RyYXRlZ3lEZWZpbml0aW9uW10gPSBbXG4gICAgeyBpZDogXCJkb21haW5cIiwgbGFiZWw6IFwiRG9tYWluXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJkb21haW5fZnVsbFwiLCBsYWJlbDogXCJGdWxsIERvbWFpblwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwidG9waWNcIiwgbGFiZWw6IFwiVG9waWNcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImNvbnRleHRcIiwgbGFiZWw6IFwiQ29udGV4dFwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwibGluZWFnZVwiLCBsYWJlbDogXCJMaW5lYWdlXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJwaW5uZWRcIiwgbGFiZWw6IFwiUGlubmVkXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJyZWNlbmN5XCIsIGxhYmVsOiBcIlJlY2VuY3lcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImFnZVwiLCBsYWJlbDogXCJBZ2VcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInVybFwiLCBsYWJlbDogXCJVUkxcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcIm5lc3RpbmdcIiwgbGFiZWw6IFwiTmVzdGluZ1wiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwidGl0bGVcIiwgbGFiZWw6IFwiVGl0bGVcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbl07XG5cbmV4cG9ydCBjb25zdCBnZXRTdHJhdGVnaWVzID0gKGN1c3RvbVN0cmF0ZWdpZXM/OiBDdXN0b21TdHJhdGVneVtdKTogU3RyYXRlZ3lEZWZpbml0aW9uW10gPT4ge1xuICAgIGlmICghY3VzdG9tU3RyYXRlZ2llcyB8fCBjdXN0b21TdHJhdGVnaWVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIFNUUkFURUdJRVM7XG5cbiAgICAvLyBDdXN0b20gc3RyYXRlZ2llcyBjYW4gb3ZlcnJpZGUgYnVpbHQtaW5zIGlmIElEcyBtYXRjaCwgb3IgYWRkIG5ldyBvbmVzLlxuICAgIGNvbnN0IGNvbWJpbmVkID0gWy4uLlNUUkFURUdJRVNdO1xuXG4gICAgY3VzdG9tU3RyYXRlZ2llcy5mb3JFYWNoKGN1c3RvbSA9PiB7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nSW5kZXggPSBjb21iaW5lZC5maW5kSW5kZXgocyA9PiBzLmlkID09PSBjdXN0b20uaWQpO1xuXG4gICAgICAgIC8vIERldGVybWluZSBjYXBhYmlsaXRpZXMgYmFzZWQgb24gcnVsZXMgcHJlc2VuY2VcbiAgICAgICAgY29uc3QgaGFzR3JvdXBpbmcgPSAoY3VzdG9tLmdyb3VwaW5nUnVsZXMgJiYgY3VzdG9tLmdyb3VwaW5nUnVsZXMubGVuZ3RoID4gMCkgfHwgKGN1c3RvbS5ydWxlcyAmJiBjdXN0b20ucnVsZXMubGVuZ3RoID4gMCkgfHwgZmFsc2U7XG4gICAgICAgIGNvbnN0IGhhc1NvcnRpbmcgPSAoY3VzdG9tLnNvcnRpbmdSdWxlcyAmJiBjdXN0b20uc29ydGluZ1J1bGVzLmxlbmd0aCA+IDApIHx8IChjdXN0b20ucnVsZXMgJiYgY3VzdG9tLnJ1bGVzLmxlbmd0aCA+IDApIHx8IGZhbHNlO1xuXG4gICAgICAgIGNvbnN0IHRhZ3M6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGlmIChoYXNHcm91cGluZykgdGFncy5wdXNoKFwiZ3JvdXBcIik7XG4gICAgICAgIGlmIChoYXNTb3J0aW5nKSB0YWdzLnB1c2goXCJzb3J0XCIpO1xuXG4gICAgICAgIGNvbnN0IGRlZmluaXRpb246IFN0cmF0ZWd5RGVmaW5pdGlvbiA9IHtcbiAgICAgICAgICAgIGlkOiBjdXN0b20uaWQsXG4gICAgICAgICAgICBsYWJlbDogY3VzdG9tLmxhYmVsLFxuICAgICAgICAgICAgaXNHcm91cGluZzogaGFzR3JvdXBpbmcsXG4gICAgICAgICAgICBpc1NvcnRpbmc6IGhhc1NvcnRpbmcsXG4gICAgICAgICAgICB0YWdzOiB0YWdzLFxuICAgICAgICAgICAgYXV0b1J1bjogY3VzdG9tLmF1dG9SdW4sXG4gICAgICAgICAgICBpc0N1c3RvbTogdHJ1ZVxuICAgICAgICB9O1xuXG4gICAgICAgIGlmIChleGlzdGluZ0luZGV4ICE9PSAtMSkge1xuICAgICAgICAgICAgY29tYmluZWRbZXhpc3RpbmdJbmRleF0gPSBkZWZpbml0aW9uO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29tYmluZWQucHVzaChkZWZpbml0aW9uKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGNvbWJpbmVkO1xufTtcblxuZXhwb3J0IGNvbnN0IGdldFN0cmF0ZWd5ID0gKGlkOiBTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmcpOiBTdHJhdGVneURlZmluaXRpb24gfCB1bmRlZmluZWQgPT4gU1RSQVRFR0lFUy5maW5kKHMgPT4gcy5pZCA9PT0gaWQpO1xuIiwgImltcG9ydCB7IExvZ0VudHJ5LCBMb2dMZXZlbCwgUHJlZmVyZW5jZXMgfSBmcm9tIFwiLi90eXBlcy5qc1wiO1xuXG5jb25zdCBQUkVGSVggPSBcIltUYWJTb3J0ZXJdXCI7XG5cbmNvbnN0IExFVkVMX1BSSU9SSVRZOiBSZWNvcmQ8TG9nTGV2ZWwsIG51bWJlcj4gPSB7XG4gIGRlYnVnOiAwLFxuICBpbmZvOiAxLFxuICB3YXJuOiAyLFxuICBlcnJvcjogMyxcbiAgY3JpdGljYWw6IDRcbn07XG5cbmxldCBjdXJyZW50TGV2ZWw6IExvZ0xldmVsID0gXCJpbmZvXCI7XG5sZXQgbG9nczogTG9nRW50cnlbXSA9IFtdO1xuY29uc3QgTUFYX0xPR1MgPSAxMDAwO1xuY29uc3QgU1RPUkFHRV9LRVkgPSBcInNlc3Npb25Mb2dzXCI7XG5cbi8vIFNhZmUgY29udGV4dCBjaGVja1xuY29uc3QgaXNTZXJ2aWNlV29ya2VyID0gdHlwZW9mIHNlbGYgIT09ICd1bmRlZmluZWQnICYmXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlb2YgKHNlbGYgYXMgYW55KS5TZXJ2aWNlV29ya2VyR2xvYmFsU2NvcGUgIT09ICd1bmRlZmluZWQnICYmXG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmIGluc3RhbmNlb2YgKHNlbGYgYXMgYW55KS5TZXJ2aWNlV29ya2VyR2xvYmFsU2NvcGU7XG5sZXQgaXNTYXZpbmcgPSBmYWxzZTtcbmxldCBwZW5kaW5nU2F2ZSA9IGZhbHNlO1xubGV0IHNhdmVUaW1lcjogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCBudWxsID0gbnVsbDtcblxuY29uc3QgZG9TYXZlID0gKCkgPT4ge1xuICAgIGlmICghaXNTZXJ2aWNlV29ya2VyIHx8ICFjaHJvbWU/LnN0b3JhZ2U/LnNlc3Npb24gfHwgaXNTYXZpbmcpIHtcbiAgICAgICAgcGVuZGluZ1NhdmUgPSB0cnVlO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaXNTYXZpbmcgPSB0cnVlO1xuICAgIHBlbmRpbmdTYXZlID0gZmFsc2U7XG5cbiAgICBjaHJvbWUuc3RvcmFnZS5zZXNzaW9uLnNldCh7IFtTVE9SQUdFX0tFWV06IGxvZ3MgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIGlzU2F2aW5nID0gZmFsc2U7XG4gICAgICAgIGlmIChwZW5kaW5nU2F2ZSkge1xuICAgICAgICAgICAgc2F2ZUxvZ3NUb1N0b3JhZ2UoKTtcbiAgICAgICAgfVxuICAgIH0pLmNhdGNoKGVyciA9PiB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gc2F2ZSBsb2dzXCIsIGVycik7XG4gICAgICAgIGlzU2F2aW5nID0gZmFsc2U7XG4gICAgfSk7XG59O1xuXG5jb25zdCBzYXZlTG9nc1RvU3RvcmFnZSA9ICgpID0+IHtcbiAgICBpZiAoc2F2ZVRpbWVyKSBjbGVhclRpbWVvdXQoc2F2ZVRpbWVyKTtcbiAgICBzYXZlVGltZXIgPSBzZXRUaW1lb3V0KGRvU2F2ZSwgMTAwMCk7XG59O1xuXG5sZXQgcmVzb2x2ZUxvZ2dlclJlYWR5OiAoKSA9PiB2b2lkO1xuZXhwb3J0IGNvbnN0IGxvZ2dlclJlYWR5ID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG4gICAgcmVzb2x2ZUxvZ2dlclJlYWR5ID0gcmVzb2x2ZTtcbn0pO1xuXG5leHBvcnQgY29uc3QgaW5pdExvZ2dlciA9IGFzeW5jICgpID0+IHtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyICYmIGNocm9tZT8uc3RvcmFnZT8uc2Vzc2lvbikge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY2hyb21lLnN0b3JhZ2Uuc2Vzc2lvbi5nZXQoU1RPUkFHRV9LRVkpO1xuICAgICAgICAgICAgaWYgKHJlc3VsdFtTVE9SQUdFX0tFWV0gJiYgQXJyYXkuaXNBcnJheShyZXN1bHRbU1RPUkFHRV9LRVldKSkge1xuICAgICAgICAgICAgICAgIGxvZ3MgPSByZXN1bHRbU1RPUkFHRV9LRVldO1xuICAgICAgICAgICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSBsb2dzID0gbG9ncy5zbGljZSgwLCBNQVhfTE9HUyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gcmVzdG9yZSBsb2dzXCIsIGUpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGlmIChyZXNvbHZlTG9nZ2VyUmVhZHkpIHJlc29sdmVMb2dnZXJSZWFkeSgpO1xufTtcblxuZXhwb3J0IGNvbnN0IHNldExvZ2dlclByZWZlcmVuY2VzID0gKHByZWZzOiBQcmVmZXJlbmNlcykgPT4ge1xuICBpZiAocHJlZnMubG9nTGV2ZWwpIHtcbiAgICBjdXJyZW50TGV2ZWwgPSBwcmVmcy5sb2dMZXZlbDtcbiAgfSBlbHNlIGlmIChwcmVmcy5kZWJ1Zykge1xuICAgIGN1cnJlbnRMZXZlbCA9IFwiZGVidWdcIjtcbiAgfSBlbHNlIHtcbiAgICBjdXJyZW50TGV2ZWwgPSBcImluZm9cIjtcbiAgfVxufTtcblxuY29uc3Qgc2hvdWxkTG9nID0gKGxldmVsOiBMb2dMZXZlbCk6IGJvb2xlYW4gPT4ge1xuICByZXR1cm4gTEVWRUxfUFJJT1JJVFlbbGV2ZWxdID49IExFVkVMX1BSSU9SSVRZW2N1cnJlbnRMZXZlbF07XG59O1xuXG5jb25zdCBmb3JtYXRNZXNzYWdlID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIHJldHVybiBjb250ZXh0ID8gYCR7bWVzc2FnZX0gOjogJHtKU09OLnN0cmluZ2lmeShjb250ZXh0KX1gIDogbWVzc2FnZTtcbn07XG5cbmNvbnN0IGFkZExvZyA9IChsZXZlbDogTG9nTGV2ZWwsIG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGlmIChzaG91bGRMb2cobGV2ZWwpKSB7XG4gICAgICBjb25zdCBlbnRyeTogTG9nRW50cnkgPSB7XG4gICAgICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxuICAgICAgICAgIGxldmVsLFxuICAgICAgICAgIG1lc3NhZ2UsXG4gICAgICAgICAgY29udGV4dFxuICAgICAgfTtcblxuICAgICAgaWYgKGlzU2VydmljZVdvcmtlcikge1xuICAgICAgICAgIGxvZ3MudW5zaGlmdChlbnRyeSk7XG4gICAgICAgICAgaWYgKGxvZ3MubGVuZ3RoID4gTUFYX0xPR1MpIHtcbiAgICAgICAgICAgICAgbG9ncy5wb3AoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgc2F2ZUxvZ3NUb1N0b3JhZ2UoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gSW4gb3RoZXIgY29udGV4dHMsIHNlbmQgdG8gU1dcbiAgICAgICAgICBpZiAoY2hyb21lPy5ydW50aW1lPy5zZW5kTWVzc2FnZSkge1xuICAgICAgICAgICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2xvZ0VudHJ5JywgcGF5bG9hZDogZW50cnkgfSkuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgICAgICAgICAvLyBJZ25vcmUgaWYgbWVzc2FnZSBmYWlscyAoZS5nLiBjb250ZXh0IGludmFsaWRhdGVkKVxuICAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgIH1cbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGFkZExvZ0VudHJ5ID0gKGVudHJ5OiBMb2dFbnRyeSkgPT4ge1xuICAgIGlmIChpc1NlcnZpY2VXb3JrZXIpIHtcbiAgICAgICAgbG9ncy51bnNoaWZ0KGVudHJ5KTtcbiAgICAgICAgaWYgKGxvZ3MubGVuZ3RoID4gTUFYX0xPR1MpIHtcbiAgICAgICAgICAgIGxvZ3MucG9wKCk7XG4gICAgICAgIH1cbiAgICAgICAgc2F2ZUxvZ3NUb1N0b3JhZ2UoKTtcbiAgICB9XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0TG9ncyA9ICgpID0+IFsuLi5sb2dzXTtcbmV4cG9ydCBjb25zdCBjbGVhckxvZ3MgPSAoKSA9PiB7XG4gICAgbG9ncy5sZW5ndGggPSAwO1xuICAgIGlmIChpc1NlcnZpY2VXb3JrZXIpIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG59O1xuXG5leHBvcnQgY29uc3QgbG9nRGVidWcgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwiZGVidWdcIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJkZWJ1Z1wiKSkge1xuICAgIGNvbnNvbGUuZGVidWcoYCR7UFJFRklYfSBbREVCVUddICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0luZm8gPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwiaW5mb1wiLCBtZXNzYWdlLCBjb250ZXh0KTtcbiAgaWYgKHNob3VsZExvZyhcImluZm9cIikpIHtcbiAgICBjb25zb2xlLmluZm8oYCR7UFJFRklYfSBbSU5GT10gJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nV2FybiA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBhZGRMb2coXCJ3YXJuXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwid2FyblwiKSkge1xuICAgIGNvbnNvbGUud2FybihgJHtQUkVGSVh9IFtXQVJOXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgY29udGV4dCl9YCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBsb2dFcnJvciA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBhZGRMb2coXCJlcnJvclwiLCBtZXNzYWdlLCBjb250ZXh0KTtcbiAgaWYgKHNob3VsZExvZyhcImVycm9yXCIpKSB7XG4gICAgY29uc29sZS5lcnJvcihgJHtQUkVGSVh9IFtFUlJPUl0gJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nQ3JpdGljYWwgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwiY3JpdGljYWxcIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJjcml0aWNhbFwiKSkge1xuICAgIC8vIENyaXRpY2FsIGxvZ3MgdXNlIGVycm9yIGNvbnNvbGUgYnV0IHdpdGggZGlzdGluY3QgcHJlZml4IGFuZCBtYXliZSBzdHlsaW5nIGlmIHN1cHBvcnRlZFxuICAgIGNvbnNvbGUuZXJyb3IoYCR7UFJFRklYfSBbQ1JJVElDQUxdIFx1RDgzRFx1REVBOCAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgY29udGV4dCl9YCk7XG4gIH1cbn07XG4iLCAiaW1wb3J0IHsgUHJlZmVyZW5jZXMsIFNvcnRpbmdTdHJhdGVneSwgVGFiTWV0YWRhdGEgfSBmcm9tIFwiLi90eXBlcy5qc1wiO1xuXG5leHBvcnQgY29uc3QgbWFwQ2hyb21lVGFiID0gKHRhYjogY2hyb21lLnRhYnMuVGFiKTogVGFiTWV0YWRhdGEgfCBudWxsID0+IHtcbiAgaWYgKCF0YWIuaWQgfHwgdGFiLmlkID09PSBjaHJvbWUudGFicy5UQUJfSURfTk9ORSB8fCAhdGFiLndpbmRvd0lkKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHtcbiAgICBpZDogdGFiLmlkLFxuICAgIHdpbmRvd0lkOiB0YWIud2luZG93SWQsXG4gICAgdGl0bGU6IHRhYi50aXRsZSB8fCBcIlVudGl0bGVkXCIsXG4gICAgdXJsOiB0YWIudXJsIHx8IFwiYWJvdXQ6YmxhbmtcIixcbiAgICBwaW5uZWQ6IEJvb2xlYW4odGFiLnBpbm5lZCksXG4gICAgbGFzdEFjY2Vzc2VkOiB0YWIubGFzdEFjY2Vzc2VkLFxuICAgIG9wZW5lclRhYklkOiB0YWIub3BlbmVyVGFiSWQgPz8gdW5kZWZpbmVkLFxuICAgIGZhdkljb25Vcmw6IHRhYi5mYXZJY29uVXJsLFxuICAgIGdyb3VwSWQ6IHRhYi5ncm91cElkLFxuICAgIGluZGV4OiB0YWIuaW5kZXgsXG4gICAgYWN0aXZlOiB0YWIuYWN0aXZlLFxuICAgIHN0YXR1czogdGFiLnN0YXR1cyxcbiAgICBzZWxlY3RlZDogdGFiLmhpZ2hsaWdodGVkXG4gIH07XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0U3RvcmVkUHJlZmVyZW5jZXMgPSBhc3luYyAoKTogUHJvbWlzZTxQcmVmZXJlbmNlcyB8IG51bGw+ID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFwicHJlZmVyZW5jZXNcIiwgKGl0ZW1zKSA9PiB7XG4gICAgICByZXNvbHZlKChpdGVtc1tcInByZWZlcmVuY2VzXCJdIGFzIFByZWZlcmVuY2VzKSA/PyBudWxsKTtcbiAgICB9KTtcbiAgfSk7XG59O1xuXG5leHBvcnQgY29uc3QgYXNBcnJheSA9IDxUPih2YWx1ZTogdW5rbm93bik6IFRbXSA9PiB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSByZXR1cm4gdmFsdWUgYXMgVFtdO1xuICAgIHJldHVybiBbXTtcbn07XG4iLCAiaW1wb3J0IHsgR3JvdXBpbmdTdHJhdGVneSwgU29ydGluZ1N0cmF0ZWd5LCBUYWJHcm91cCwgVGFiTWV0YWRhdGEsIEN1c3RvbVN0cmF0ZWd5LCBTdHJhdGVneVJ1bGUsIFJ1bGVDb25kaXRpb24sIEdyb3VwaW5nUnVsZSwgU29ydGluZ1J1bGUgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBnZXRTdHJhdGVnaWVzIH0gZnJvbSBcIi4uL3NoYXJlZC9zdHJhdGVneVJlZ2lzdHJ5LmpzXCI7XG5pbXBvcnQgeyBsb2dEZWJ1ZyB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBhc0FycmF5IH0gZnJvbSBcIi4uL3NoYXJlZC91dGlscy5qc1wiO1xuXG5sZXQgY3VzdG9tU3RyYXRlZ2llczogQ3VzdG9tU3RyYXRlZ3lbXSA9IFtdO1xuXG5leHBvcnQgY29uc3Qgc2V0Q3VzdG9tU3RyYXRlZ2llcyA9IChzdHJhdGVnaWVzOiBDdXN0b21TdHJhdGVneVtdKSA9PiB7XG4gICAgY3VzdG9tU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXM7XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0Q3VzdG9tU3RyYXRlZ2llcyA9ICgpOiBDdXN0b21TdHJhdGVneVtdID0+IGN1c3RvbVN0cmF0ZWdpZXM7XG5cbmNvbnN0IENPTE9SUyA9IFtcImdyZXlcIiwgXCJibHVlXCIsIFwicmVkXCIsIFwieWVsbG93XCIsIFwiZ3JlZW5cIiwgXCJwaW5rXCIsIFwicHVycGxlXCIsIFwiY3lhblwiLCBcIm9yYW5nZVwiXTtcblxuY29uc3QgcmVnZXhDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBSZWdFeHA+KCk7XG5jb25zdCBkb21haW5DYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5jb25zdCBzdWJkb21haW5DYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5jb25zdCBNQVhfQ0FDSEVfU0laRSA9IDEwMDA7XG5cbmV4cG9ydCBjb25zdCBkb21haW5Gcm9tVXJsID0gKHVybDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgaWYgKGRvbWFpbkNhY2hlLmhhcyh1cmwpKSByZXR1cm4gZG9tYWluQ2FjaGUuZ2V0KHVybCkhO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgcGFyc2VkID0gbmV3IFVSTCh1cmwpO1xuICAgIGNvbnN0IGRvbWFpbiA9IHBhcnNlZC5ob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgXCJcIik7XG5cbiAgICBpZiAoZG9tYWluQ2FjaGUuc2l6ZSA+PSBNQVhfQ0FDSEVfU0laRSkgZG9tYWluQ2FjaGUuY2xlYXIoKTtcbiAgICBkb21haW5DYWNoZS5zZXQodXJsLCBkb21haW4pO1xuXG4gICAgcmV0dXJuIGRvbWFpbjtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBsb2dEZWJ1ZyhcIkZhaWxlZCB0byBwYXJzZSBkb21haW5cIiwgeyB1cmwsIGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICAgIHJldHVybiBcInVua25vd25cIjtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IHN1YmRvbWFpbkZyb21VcmwgPSAodXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgIGlmIChzdWJkb21haW5DYWNoZS5oYXModXJsKSkgcmV0dXJuIHN1YmRvbWFpbkNhY2hlLmdldCh1cmwpITtcblxuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHBhcnNlZCA9IG5ldyBVUkwodXJsKTtcbiAgICAgICAgbGV0IGhvc3RuYW1lID0gcGFyc2VkLmhvc3RuYW1lO1xuICAgICAgICAvLyBSZW1vdmUgd3d3LlxuICAgICAgICBob3N0bmFtZSA9IGhvc3RuYW1lLnJlcGxhY2UoL153d3dcXC4vLCBcIlwiKTtcblxuICAgICAgICBsZXQgcmVzdWx0ID0gXCJcIjtcbiAgICAgICAgY29uc3QgcGFydHMgPSBob3N0bmFtZS5zcGxpdCgnLicpO1xuICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMikge1xuICAgICAgICAgICAgIHJlc3VsdCA9IHBhcnRzLnNsaWNlKDAsIHBhcnRzLmxlbmd0aCAtIDIpLmpvaW4oJy4nKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdWJkb21haW5DYWNoZS5zaXplID49IE1BWF9DQUNIRV9TSVpFKSBzdWJkb21haW5DYWNoZS5jbGVhcigpO1xuICAgICAgICBzdWJkb21haW5DYWNoZS5zZXQodXJsLCByZXN1bHQpO1xuXG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBcIlwiO1xuICAgIH1cbn1cblxuY29uc3QgZ2V0TmVzdGVkUHJvcGVydHkgPSAob2JqOiB1bmtub3duLCBwYXRoOiBzdHJpbmcpOiB1bmtub3duID0+IHtcbiAgICBpZiAoIW9iaiB8fCB0eXBlb2Ygb2JqICE9PSAnb2JqZWN0JykgcmV0dXJuIHVuZGVmaW5lZDtcblxuICAgIGlmICghcGF0aC5pbmNsdWRlcygnLicpKSB7XG4gICAgICAgIHJldHVybiAob2JqIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtwYXRoXTtcbiAgICB9XG5cbiAgICBjb25zdCBwYXJ0cyA9IHBhdGguc3BsaXQoJy4nKTtcbiAgICBsZXQgY3VycmVudDogdW5rbm93biA9IG9iajtcblxuICAgIGZvciAoY29uc3Qga2V5IG9mIHBhcnRzKSB7XG4gICAgICAgIGlmICghY3VycmVudCB8fCB0eXBlb2YgY3VycmVudCAhPT0gJ29iamVjdCcpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIGN1cnJlbnQgPSAoY3VycmVudCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilba2V5XTtcbiAgICB9XG5cbiAgICByZXR1cm4gY3VycmVudDtcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRGaWVsZFZhbHVlID0gKHRhYjogVGFiTWV0YWRhdGEsIGZpZWxkOiBzdHJpbmcpOiBhbnkgPT4ge1xuICAgIHN3aXRjaChmaWVsZCkge1xuICAgICAgICBjYXNlICdpZCc6IHJldHVybiB0YWIuaWQ7XG4gICAgICAgIGNhc2UgJ2luZGV4JzogcmV0dXJuIHRhYi5pbmRleDtcbiAgICAgICAgY2FzZSAnd2luZG93SWQnOiByZXR1cm4gdGFiLndpbmRvd0lkO1xuICAgICAgICBjYXNlICdncm91cElkJzogcmV0dXJuIHRhYi5ncm91cElkO1xuICAgICAgICBjYXNlICd0aXRsZSc6IHJldHVybiB0YWIudGl0bGU7XG4gICAgICAgIGNhc2UgJ3VybCc6IHJldHVybiB0YWIudXJsO1xuICAgICAgICBjYXNlICdzdGF0dXMnOiByZXR1cm4gdGFiLnN0YXR1cztcbiAgICAgICAgY2FzZSAnYWN0aXZlJzogcmV0dXJuIHRhYi5hY3RpdmU7XG4gICAgICAgIGNhc2UgJ3NlbGVjdGVkJzogcmV0dXJuIHRhYi5zZWxlY3RlZDtcbiAgICAgICAgY2FzZSAncGlubmVkJzogcmV0dXJuIHRhYi5waW5uZWQ7XG4gICAgICAgIGNhc2UgJ29wZW5lclRhYklkJzogcmV0dXJuIHRhYi5vcGVuZXJUYWJJZDtcbiAgICAgICAgY2FzZSAnbGFzdEFjY2Vzc2VkJzogcmV0dXJuIHRhYi5sYXN0QWNjZXNzZWQ7XG4gICAgICAgIGNhc2UgJ2NvbnRleHQnOiByZXR1cm4gdGFiLmNvbnRleHQ7XG4gICAgICAgIGNhc2UgJ2dlbnJlJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uZ2VucmU7XG4gICAgICAgIGNhc2UgJ3NpdGVOYW1lJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uc2l0ZU5hbWU7XG4gICAgICAgIC8vIERlcml2ZWQgb3IgbWFwcGVkIGZpZWxkc1xuICAgICAgICBjYXNlICdkb21haW4nOiByZXR1cm4gZG9tYWluRnJvbVVybCh0YWIudXJsKTtcbiAgICAgICAgY2FzZSAnc3ViZG9tYWluJzogcmV0dXJuIHN1YmRvbWFpbkZyb21VcmwodGFiLnVybCk7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICByZXR1cm4gZ2V0TmVzdGVkUHJvcGVydHkodGFiLCBmaWVsZCk7XG4gICAgfVxufTtcblxuY29uc3Qgc3RyaXBUbGQgPSAoZG9tYWluOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gZG9tYWluLnJlcGxhY2UoL1xcLihjb218b3JnfGdvdnxuZXR8ZWR1fGlvKSQvaSwgXCJcIik7XG59O1xuXG5leHBvcnQgY29uc3Qgc2VtYW50aWNCdWNrZXQgPSAodGl0bGU6IHN0cmluZywgdXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBrZXkgPSBgJHt0aXRsZX0gJHt1cmx9YC50b0xvd2VyQ2FzZSgpO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiZG9jXCIpIHx8IGtleS5pbmNsdWRlcyhcInJlYWRtZVwiKSB8fCBrZXkuaW5jbHVkZXMoXCJndWlkZVwiKSkgcmV0dXJuIFwiRG9jc1wiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwibWFpbFwiKSB8fCBrZXkuaW5jbHVkZXMoXCJpbmJveFwiKSkgcmV0dXJuIFwiQ2hhdFwiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiZGFzaGJvYXJkXCIpIHx8IGtleS5pbmNsdWRlcyhcImNvbnNvbGVcIikpIHJldHVybiBcIkRhc2hcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImlzc3VlXCIpIHx8IGtleS5pbmNsdWRlcyhcInRpY2tldFwiKSkgcmV0dXJuIFwiVGFza3NcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImRyaXZlXCIpIHx8IGtleS5pbmNsdWRlcyhcInN0b3JhZ2VcIikpIHJldHVybiBcIkZpbGVzXCI7XG4gIHJldHVybiBcIk1pc2NcIjtcbn07XG5cbmV4cG9ydCBjb25zdCBuYXZpZ2F0aW9uS2V5ID0gKHRhYjogVGFiTWV0YWRhdGEpOiBzdHJpbmcgPT4ge1xuICBpZiAodGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gYGNoaWxkLW9mLSR7dGFiLm9wZW5lclRhYklkfWA7XG4gIH1cbiAgcmV0dXJuIGB3aW5kb3ctJHt0YWIud2luZG93SWR9YDtcbn07XG5cbmNvbnN0IGdldFJlY2VuY3lMYWJlbCA9IChsYXN0QWNjZXNzZWQ6IG51bWJlcik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gIGNvbnN0IGRpZmYgPSBub3cgLSBsYXN0QWNjZXNzZWQ7XG4gIGlmIChkaWZmIDwgMzYwMDAwMCkgcmV0dXJuIFwiSnVzdCBub3dcIjsgLy8gMWhcbiAgaWYgKGRpZmYgPCA4NjQwMDAwMCkgcmV0dXJuIFwiVG9kYXlcIjsgLy8gMjRoXG4gIGlmIChkaWZmIDwgMTcyODAwMDAwKSByZXR1cm4gXCJZZXN0ZXJkYXlcIjsgLy8gNDhoXG4gIGlmIChkaWZmIDwgNjA0ODAwMDAwKSByZXR1cm4gXCJUaGlzIFdlZWtcIjsgLy8gN2RcbiAgcmV0dXJuIFwiT2xkZXJcIjtcbn07XG5cbmNvbnN0IGNvbG9yRm9yS2V5ID0gKGtleTogc3RyaW5nLCBvZmZzZXQ6IG51bWJlcik6IHN0cmluZyA9PiBDT0xPUlNbKE1hdGguYWJzKGhhc2hDb2RlKGtleSkpICsgb2Zmc2V0KSAlIENPTE9SUy5sZW5ndGhdO1xuXG5jb25zdCBoYXNoQ29kZSA9ICh2YWx1ZTogc3RyaW5nKTogbnVtYmVyID0+IHtcbiAgbGV0IGhhc2ggPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHZhbHVlLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgaGFzaCA9IChoYXNoIDw8IDUpIC0gaGFzaCArIHZhbHVlLmNoYXJDb2RlQXQoaSk7XG4gICAgaGFzaCB8PSAwO1xuICB9XG4gIHJldHVybiBoYXNoO1xufTtcblxuLy8gSGVscGVyIHRvIGdldCBhIGh1bWFuLXJlYWRhYmxlIGxhYmVsIGNvbXBvbmVudCBmcm9tIGEgc3RyYXRlZ3kgYW5kIGEgc2V0IG9mIHRhYnNcbmNvbnN0IGdldExhYmVsQ29tcG9uZW50ID0gKHN0cmF0ZWd5OiBHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nLCB0YWJzOiBUYWJNZXRhZGF0YVtdLCBhbGxUYWJzTWFwOiBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YT4pOiBzdHJpbmcgfCBudWxsID0+IHtcbiAgY29uc3QgZmlyc3RUYWIgPSB0YWJzWzBdO1xuICBpZiAoIWZpcnN0VGFiKSByZXR1cm4gXCJVbmtub3duXCI7XG5cbiAgLy8gQ2hlY2sgY3VzdG9tIHN0cmF0ZWdpZXMgZmlyc3RcbiAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3kpO1xuICBpZiAoY3VzdG9tKSB7XG4gICAgICByZXR1cm4gZ3JvdXBpbmdLZXkoZmlyc3RUYWIsIHN0cmF0ZWd5KTtcbiAgfVxuXG4gIHN3aXRjaCAoc3RyYXRlZ3kpIHtcbiAgICBjYXNlIFwiZG9tYWluXCI6IHtcbiAgICAgIGNvbnN0IHNpdGVOYW1lcyA9IG5ldyBTZXQodGFicy5tYXAodCA9PiB0LmNvbnRleHREYXRhPy5zaXRlTmFtZSkuZmlsdGVyKEJvb2xlYW4pKTtcbiAgICAgIGlmIChzaXRlTmFtZXMuc2l6ZSA9PT0gMSkge1xuICAgICAgICByZXR1cm4gc3RyaXBUbGQoQXJyYXkuZnJvbShzaXRlTmFtZXMpWzBdIGFzIHN0cmluZyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gc3RyaXBUbGQoZG9tYWluRnJvbVVybChmaXJzdFRhYi51cmwpKTtcbiAgICB9XG4gICAgY2FzZSBcImRvbWFpbl9mdWxsXCI6XG4gICAgICByZXR1cm4gZG9tYWluRnJvbVVybChmaXJzdFRhYi51cmwpO1xuICAgIGNhc2UgXCJ0b3BpY1wiOlxuICAgICAgcmV0dXJuIHNlbWFudGljQnVja2V0KGZpcnN0VGFiLnRpdGxlLCBmaXJzdFRhYi51cmwpO1xuICAgIGNhc2UgXCJsaW5lYWdlXCI6XG4gICAgICBpZiAoZmlyc3RUYWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBjb25zdCBwYXJlbnQgPSBhbGxUYWJzTWFwLmdldChmaXJzdFRhYi5vcGVuZXJUYWJJZCk7XG4gICAgICAgIGlmIChwYXJlbnQpIHtcbiAgICAgICAgICBjb25zdCBwYXJlbnRUaXRsZSA9IHBhcmVudC50aXRsZS5sZW5ndGggPiAyMCA/IHBhcmVudC50aXRsZS5zdWJzdHJpbmcoMCwgMjApICsgXCIuLi5cIiA6IHBhcmVudC50aXRsZTtcbiAgICAgICAgICByZXR1cm4gYEZyb206ICR7cGFyZW50VGl0bGV9YDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYEZyb206IFRhYiAke2ZpcnN0VGFiLm9wZW5lclRhYklkfWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYFdpbmRvdyAke2ZpcnN0VGFiLndpbmRvd0lkfWA7XG4gICAgY2FzZSBcImNvbnRleHRcIjpcbiAgICAgIHJldHVybiBmaXJzdFRhYi5jb250ZXh0IHx8IFwiVW5jYXRlZ29yaXplZFwiO1xuICAgIGNhc2UgXCJwaW5uZWRcIjpcbiAgICAgIHJldHVybiBmaXJzdFRhYi5waW5uZWQgPyBcIlBpbm5lZFwiIDogXCJVbnBpbm5lZFwiO1xuICAgIGNhc2UgXCJhZ2VcIjpcbiAgICAgIHJldHVybiBnZXRSZWNlbmN5TGFiZWwoZmlyc3RUYWIubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgIGNhc2UgXCJ1cmxcIjpcbiAgICAgIHJldHVybiBcIlVSTCBHcm91cFwiO1xuICAgIGNhc2UgXCJyZWNlbmN5XCI6XG4gICAgICByZXR1cm4gXCJUaW1lIEdyb3VwXCI7XG4gICAgY2FzZSBcIm5lc3RpbmdcIjpcbiAgICAgIHJldHVybiBmaXJzdFRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkID8gXCJDaGlsZHJlblwiIDogXCJSb290c1wiO1xuICAgIGRlZmF1bHQ6XG4gICAgICBjb25zdCB2YWwgPSBnZXRGaWVsZFZhbHVlKGZpcnN0VGFiLCBzdHJhdGVneSk7XG4gICAgICBpZiAodmFsICE9PSB1bmRlZmluZWQgJiYgdmFsICE9PSBudWxsKSB7XG4gICAgICAgICAgcmV0dXJuIFN0cmluZyh2YWwpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIFwiVW5rbm93blwiO1xuICB9XG59O1xuXG5jb25zdCBnZW5lcmF0ZUxhYmVsID0gKFxuICBzdHJhdGVnaWVzOiAoR3JvdXBpbmdTdHJhdGVneSB8IHN0cmluZylbXSxcbiAgdGFiczogVGFiTWV0YWRhdGFbXSxcbiAgYWxsVGFic01hcDogTWFwPG51bWJlciwgVGFiTWV0YWRhdGE+XG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBsYWJlbHMgPSBzdHJhdGVnaWVzXG4gICAgLm1hcChzID0+IGdldExhYmVsQ29tcG9uZW50KHMsIHRhYnMsIGFsbFRhYnNNYXApKVxuICAgIC5maWx0ZXIobCA9PiBsICYmIGwgIT09IFwiVW5rbm93blwiICYmIGwgIT09IFwiR3JvdXBcIiAmJiBsICE9PSBcIlVSTCBHcm91cFwiICYmIGwgIT09IFwiVGltZSBHcm91cFwiICYmIGwgIT09IFwiTWlzY1wiKTtcblxuICBpZiAobGFiZWxzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIFwiR3JvdXBcIjtcbiAgcmV0dXJuIEFycmF5LmZyb20obmV3IFNldChsYWJlbHMpKS5qb2luKFwiIC0gXCIpO1xufTtcblxuY29uc3QgZ2V0U3RyYXRlZ3lDb2xvclJ1bGUgPSAoc3RyYXRlZ3lJZDogc3RyaW5nKTogR3JvdXBpbmdSdWxlIHwgdW5kZWZpbmVkID0+IHtcbiAgICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneUlkKTtcbiAgICBpZiAoIWN1c3RvbSkgcmV0dXJuIHVuZGVmaW5lZDtcblxuICAgIGNvbnN0IGdyb3VwaW5nUnVsZXNMaXN0ID0gYXNBcnJheTxHcm91cGluZ1J1bGU+KGN1c3RvbS5ncm91cGluZ1J1bGVzKTtcbiAgICAvLyBJdGVyYXRlIG1hbnVhbGx5IHRvIGNoZWNrIGNvbG9yXG4gICAgZm9yIChsZXQgaSA9IGdyb3VwaW5nUnVsZXNMaXN0Lmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgIGNvbnN0IHJ1bGUgPSBncm91cGluZ1J1bGVzTGlzdFtpXTtcbiAgICAgICAgaWYgKHJ1bGUgJiYgcnVsZS5jb2xvciAmJiBydWxlLmNvbG9yICE9PSAncmFuZG9tJykge1xuICAgICAgICAgICAgcmV0dXJuIHJ1bGU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbn07XG5cbmNvbnN0IHJlc29sdmVXaW5kb3dNb2RlID0gKG1vZGVzOiAoc3RyaW5nIHwgdW5kZWZpbmVkKVtdKTogXCJjdXJyZW50XCIgfCBcIm5ld1wiIHwgXCJjb21wb3VuZFwiID0+IHtcbiAgICBpZiAobW9kZXMuaW5jbHVkZXMoXCJuZXdcIikpIHJldHVybiBcIm5ld1wiO1xuICAgIGlmIChtb2Rlcy5pbmNsdWRlcyhcImNvbXBvdW5kXCIpKSByZXR1cm4gXCJjb21wb3VuZFwiO1xuICAgIHJldHVybiBcImN1cnJlbnRcIjtcbn07XG5cbmV4cG9ydCBjb25zdCBncm91cFRhYnMgPSAoXG4gIHRhYnM6IFRhYk1ldGFkYXRhW10sXG4gIHN0cmF0ZWdpZXM6IChTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmcpW11cbik6IFRhYkdyb3VwW10gPT4ge1xuICBjb25zdCBhdmFpbGFibGVTdHJhdGVnaWVzID0gZ2V0U3RyYXRlZ2llcyhjdXN0b21TdHJhdGVnaWVzKTtcbiAgY29uc3QgZWZmZWN0aXZlU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gYXZhaWxhYmxlU3RyYXRlZ2llcy5maW5kKGF2YWlsID0+IGF2YWlsLmlkID09PSBzKT8uaXNHcm91cGluZyk7XG4gIGNvbnN0IGJ1Y2tldHMgPSBuZXcgTWFwPHN0cmluZywgVGFiR3JvdXA+KCk7XG5cbiAgY29uc3QgYWxsVGFic01hcCA9IG5ldyBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YT4oKTtcbiAgdGFicy5mb3JFYWNoKHQgPT4gYWxsVGFic01hcC5zZXQodC5pZCwgdCkpO1xuXG4gIHRhYnMuZm9yRWFjaCgodGFiKSA9PiB7XG4gICAgbGV0IGtleXM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgYXBwbGllZFN0cmF0ZWdpZXM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgY29sbGVjdGVkTW9kZXM6IHN0cmluZ1tdID0gW107XG5cbiAgICB0cnkge1xuICAgICAgICBmb3IgKGNvbnN0IHMgb2YgZWZmZWN0aXZlU3RyYXRlZ2llcykge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gZ2V0R3JvdXBpbmdSZXN1bHQodGFiLCBzKTtcbiAgICAgICAgICAgIGlmIChyZXN1bHQua2V5ICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAga2V5cy5wdXNoKGAke3N9OiR7cmVzdWx0LmtleX1gKTtcbiAgICAgICAgICAgICAgICBhcHBsaWVkU3RyYXRlZ2llcy5wdXNoKHMpO1xuICAgICAgICAgICAgICAgIGNvbGxlY3RlZE1vZGVzLnB1c2gocmVzdWx0Lm1vZGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGdlbmVyYXRpbmcgZ3JvdXBpbmcga2V5XCIsIHsgdGFiSWQ6IHRhYi5pZCwgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgcmV0dXJuOyAvLyBTa2lwIHRoaXMgdGFiIG9uIGVycm9yXG4gICAgfVxuXG4gICAgLy8gSWYgbm8gc3RyYXRlZ2llcyBhcHBsaWVkIChlLmcuIGFsbCBmaWx0ZXJlZCBvdXQpLCBza2lwIGdyb3VwaW5nIGZvciB0aGlzIHRhYlxuICAgIGlmIChrZXlzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgZWZmZWN0aXZlTW9kZSA9IHJlc29sdmVXaW5kb3dNb2RlKGNvbGxlY3RlZE1vZGVzKTtcbiAgICBjb25zdCB2YWx1ZUtleSA9IGtleXMuam9pbihcIjo6XCIpO1xuICAgIGxldCBidWNrZXRLZXkgPSBcIlwiO1xuICAgIGlmIChlZmZlY3RpdmVNb2RlID09PSAnY3VycmVudCcpIHtcbiAgICAgICAgIGJ1Y2tldEtleSA9IGB3aW5kb3ctJHt0YWIud2luZG93SWR9OjpgICsgdmFsdWVLZXk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgIGJ1Y2tldEtleSA9IGBnbG9iYWw6OmAgKyB2YWx1ZUtleTtcbiAgICB9XG5cbiAgICBsZXQgZ3JvdXAgPSBidWNrZXRzLmdldChidWNrZXRLZXkpO1xuICAgIGlmICghZ3JvdXApIHtcbiAgICAgIGxldCBncm91cENvbG9yID0gbnVsbDtcbiAgICAgIGxldCBjb2xvckZpZWxkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICBsZXQgY29sb3JUcmFuc2Zvcm06IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgIGxldCBjb2xvclRyYW5zZm9ybVBhdHRlcm46IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICAgICAgZm9yIChjb25zdCBzSWQgb2YgYXBwbGllZFN0cmF0ZWdpZXMpIHtcbiAgICAgICAgY29uc3QgcnVsZSA9IGdldFN0cmF0ZWd5Q29sb3JSdWxlKHNJZCk7XG4gICAgICAgIGlmIChydWxlKSB7XG4gICAgICAgICAgICBncm91cENvbG9yID0gcnVsZS5jb2xvcjtcbiAgICAgICAgICAgIGNvbG9yRmllbGQgPSBydWxlLmNvbG9yRmllbGQ7XG4gICAgICAgICAgICBjb2xvclRyYW5zZm9ybSA9IHJ1bGUuY29sb3JUcmFuc2Zvcm07XG4gICAgICAgICAgICBjb2xvclRyYW5zZm9ybVBhdHRlcm4gPSBydWxlLmNvbG9yVHJhbnNmb3JtUGF0dGVybjtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChncm91cENvbG9yID09PSAnbWF0Y2gnKSB7XG4gICAgICAgIGdyb3VwQ29sb3IgPSBjb2xvckZvcktleSh2YWx1ZUtleSwgMCk7XG4gICAgICB9IGVsc2UgaWYgKGdyb3VwQ29sb3IgPT09ICdmaWVsZCcgJiYgY29sb3JGaWVsZCkge1xuICAgICAgICBjb25zdCB2YWwgPSBnZXRGaWVsZFZhbHVlKHRhYiwgY29sb3JGaWVsZCk7XG4gICAgICAgIGxldCBrZXkgPSB2YWwgIT09IHVuZGVmaW5lZCAmJiB2YWwgIT09IG51bGwgPyBTdHJpbmcodmFsKSA6IFwiXCI7XG4gICAgICAgIGlmIChjb2xvclRyYW5zZm9ybSkge1xuICAgICAgICAgICAga2V5ID0gYXBwbHlWYWx1ZVRyYW5zZm9ybShrZXksIGNvbG9yVHJhbnNmb3JtLCBjb2xvclRyYW5zZm9ybVBhdHRlcm4pO1xuICAgICAgICB9XG4gICAgICAgIGdyb3VwQ29sb3IgPSBjb2xvckZvcktleShrZXksIDApO1xuICAgICAgfSBlbHNlIGlmICghZ3JvdXBDb2xvciB8fCBncm91cENvbG9yID09PSAnZmllbGQnKSB7XG4gICAgICAgIGdyb3VwQ29sb3IgPSBjb2xvckZvcktleShidWNrZXRLZXksIGJ1Y2tldHMuc2l6ZSk7XG4gICAgICB9XG5cbiAgICAgIGdyb3VwID0ge1xuICAgICAgICBpZDogYnVja2V0S2V5LFxuICAgICAgICB3aW5kb3dJZDogdGFiLndpbmRvd0lkLFxuICAgICAgICBsYWJlbDogXCJcIixcbiAgICAgICAgY29sb3I6IGdyb3VwQ29sb3IsXG4gICAgICAgIHRhYnM6IFtdLFxuICAgICAgICByZWFzb246IGFwcGxpZWRTdHJhdGVnaWVzLmpvaW4oXCIgKyBcIiksXG4gICAgICAgIHdpbmRvd01vZGU6IGVmZmVjdGl2ZU1vZGVcbiAgICAgIH07XG4gICAgICBidWNrZXRzLnNldChidWNrZXRLZXksIGdyb3VwKTtcbiAgICB9XG4gICAgZ3JvdXAudGFicy5wdXNoKHRhYik7XG4gIH0pO1xuXG4gIGNvbnN0IGdyb3VwcyA9IEFycmF5LmZyb20oYnVja2V0cy52YWx1ZXMoKSk7XG4gIGdyb3Vwcy5mb3JFYWNoKGdyb3VwID0+IHtcbiAgICBncm91cC5sYWJlbCA9IGdlbmVyYXRlTGFiZWwoZWZmZWN0aXZlU3RyYXRlZ2llcywgZ3JvdXAudGFicywgYWxsVGFic01hcCk7XG4gIH0pO1xuXG4gIHJldHVybiBncm91cHM7XG59O1xuXG5jb25zdCBjaGVja1ZhbHVlTWF0Y2ggPSAoXG4gICAgb3BlcmF0b3I6IHN0cmluZyxcbiAgICByYXdWYWx1ZTogYW55LFxuICAgIHJ1bGVWYWx1ZTogc3RyaW5nXG4pOiB7IGlzTWF0Y2g6IGJvb2xlYW47IG1hdGNoT2JqOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsIH0gPT4ge1xuICAgIGNvbnN0IHZhbHVlU3RyID0gcmF3VmFsdWUgIT09IHVuZGVmaW5lZCAmJiByYXdWYWx1ZSAhPT0gbnVsbCA/IFN0cmluZyhyYXdWYWx1ZSkgOiBcIlwiO1xuICAgIGNvbnN0IHZhbHVlVG9DaGVjayA9IHZhbHVlU3RyLnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3QgcGF0dGVyblRvQ2hlY2sgPSBydWxlVmFsdWUgPyBydWxlVmFsdWUudG9Mb3dlckNhc2UoKSA6IFwiXCI7XG5cbiAgICBsZXQgaXNNYXRjaCA9IGZhbHNlO1xuICAgIGxldCBtYXRjaE9iajogUmVnRXhwRXhlY0FycmF5IHwgbnVsbCA9IG51bGw7XG5cbiAgICBzd2l0Y2ggKG9wZXJhdG9yKSB7XG4gICAgICAgIGNhc2UgJ2NvbnRhaW5zJzogaXNNYXRjaCA9IHZhbHVlVG9DaGVjay5pbmNsdWRlcyhwYXR0ZXJuVG9DaGVjayk7IGJyZWFrO1xuICAgICAgICBjYXNlICdkb2VzTm90Q29udGFpbic6IGlzTWF0Y2ggPSAhdmFsdWVUb0NoZWNrLmluY2x1ZGVzKHBhdHRlcm5Ub0NoZWNrKTsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2VxdWFscyc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2sgPT09IHBhdHRlcm5Ub0NoZWNrOyBicmVhaztcbiAgICAgICAgY2FzZSAnc3RhcnRzV2l0aCc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suc3RhcnRzV2l0aChwYXR0ZXJuVG9DaGVjayk7IGJyZWFrO1xuICAgICAgICBjYXNlICdlbmRzV2l0aCc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suZW5kc1dpdGgocGF0dGVyblRvQ2hlY2spOyBicmVhaztcbiAgICAgICAgY2FzZSAnZXhpc3RzJzogaXNNYXRjaCA9IHJhd1ZhbHVlICE9PSB1bmRlZmluZWQ7IGJyZWFrO1xuICAgICAgICBjYXNlICdkb2VzTm90RXhpc3QnOiBpc01hdGNoID0gcmF3VmFsdWUgPT09IHVuZGVmaW5lZDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2lzTnVsbCc6IGlzTWF0Y2ggPSByYXdWYWx1ZSA9PT0gbnVsbDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2lzTm90TnVsbCc6IGlzTWF0Y2ggPSByYXdWYWx1ZSAhPT0gbnVsbDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ21hdGNoZXMnOlxuICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKHJ1bGVWYWx1ZSwgJ2knKTtcbiAgICAgICAgICAgICAgICBtYXRjaE9iaiA9IHJlZ2V4LmV4ZWModmFsdWVTdHIpO1xuICAgICAgICAgICAgICAgIGlzTWF0Y2ggPSAhIW1hdGNoT2JqO1xuICAgICAgICAgICAgIH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHJldHVybiB7IGlzTWF0Y2gsIG1hdGNoT2JqIH07XG59O1xuXG5leHBvcnQgY29uc3QgY2hlY2tDb25kaXRpb24gPSAoY29uZGl0aW9uOiBSdWxlQ29uZGl0aW9uLCB0YWI6IFRhYk1ldGFkYXRhKTogYm9vbGVhbiA9PiB7XG4gICAgaWYgKCFjb25kaXRpb24pIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCByYXdWYWx1ZSA9IGdldEZpZWxkVmFsdWUodGFiLCBjb25kaXRpb24uZmllbGQpO1xuICAgIGNvbnN0IHsgaXNNYXRjaCB9ID0gY2hlY2tWYWx1ZU1hdGNoKGNvbmRpdGlvbi5vcGVyYXRvciwgcmF3VmFsdWUsIGNvbmRpdGlvbi52YWx1ZSk7XG4gICAgcmV0dXJuIGlzTWF0Y2g7XG59O1xuXG5leHBvcnQgY29uc3QgYXBwbHlWYWx1ZVRyYW5zZm9ybSA9ICh2YWw6IHN0cmluZywgdHJhbnNmb3JtOiBzdHJpbmcsIHBhdHRlcm4/OiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgIGlmICghdmFsIHx8ICF0cmFuc2Zvcm0gfHwgdHJhbnNmb3JtID09PSAnbm9uZScpIHJldHVybiB2YWw7XG5cbiAgICBzd2l0Y2ggKHRyYW5zZm9ybSkge1xuICAgICAgICBjYXNlICdzdHJpcFRsZCc6XG4gICAgICAgICAgICByZXR1cm4gc3RyaXBUbGQodmFsKTtcbiAgICAgICAgY2FzZSAnbG93ZXJjYXNlJzpcbiAgICAgICAgICAgIHJldHVybiB2YWwudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgY2FzZSAndXBwZXJjYXNlJzpcbiAgICAgICAgICAgIHJldHVybiB2YWwudG9VcHBlckNhc2UoKTtcbiAgICAgICAgY2FzZSAnZmlyc3RDaGFyJzpcbiAgICAgICAgICAgIHJldHVybiB2YWwuY2hhckF0KDApO1xuICAgICAgICBjYXNlICdkb21haW4nOlxuICAgICAgICAgICAgcmV0dXJuIGRvbWFpbkZyb21VcmwodmFsKTtcbiAgICAgICAgY2FzZSAnaG9zdG5hbWUnOlxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgcmV0dXJuIG5ldyBVUkwodmFsKS5ob3N0bmFtZTtcbiAgICAgICAgICAgIH0gY2F0Y2ggeyByZXR1cm4gdmFsOyB9XG4gICAgICAgIGNhc2UgJ3JlZ2V4JzpcbiAgICAgICAgICAgIGlmIChwYXR0ZXJuKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHJlZ2V4ID0gcmVnZXhDYWNoZS5nZXQocGF0dGVybik7XG4gICAgICAgICAgICAgICAgICAgIGlmICghcmVnZXgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlZ2V4ID0gbmV3IFJlZ0V4cChwYXR0ZXJuKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlZ2V4Q2FjaGUuc2V0KHBhdHRlcm4sIHJlZ2V4KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBtYXRjaCA9IHJlZ2V4LmV4ZWModmFsKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgZXh0cmFjdGVkID0gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgbWF0Y2gubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBleHRyYWN0ZWQgKz0gbWF0Y2hbaV0gfHwgXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBleHRyYWN0ZWQ7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICAgICAgbG9nRGVidWcoXCJJbnZhbGlkIHJlZ2V4IGluIHRyYW5zZm9ybVwiLCB7IHBhdHRlcm46IHBhdHRlcm4sIGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICByZXR1cm4gdmFsO1xuICAgIH1cbn07XG5cbmZ1bmN0aW9uIGV2YWx1YXRlTGVnYWN5UnVsZXMobGVnYWN5UnVsZXM6IFN0cmF0ZWd5UnVsZVtdLCB0YWI6IFRhYk1ldGFkYXRhKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgLy8gRGVmZW5zaXZlIGNoZWNrXG4gICAgaWYgKCFsZWdhY3lSdWxlcyB8fCAhQXJyYXkuaXNBcnJheShsZWdhY3lSdWxlcykpIHtcbiAgICAgICAgaWYgKCFsZWdhY3lSdWxlcykgcmV0dXJuIG51bGw7XG4gICAgICAgIC8vIFRyeSBhc0FycmF5IGlmIGl0J3Mgbm90IGFycmF5IGJ1dCB0cnV0aHkgKHVubGlrZWx5IGdpdmVuIHByZXZpb3VzIGxvZ2ljIGJ1dCBzYWZlKVxuICAgIH1cblxuICAgIGNvbnN0IGxlZ2FjeVJ1bGVzTGlzdCA9IGFzQXJyYXk8U3RyYXRlZ3lSdWxlPihsZWdhY3lSdWxlcyk7XG4gICAgaWYgKGxlZ2FjeVJ1bGVzTGlzdC5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGxlZ2FjeVJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IHJhd1ZhbHVlID0gZ2V0RmllbGRWYWx1ZSh0YWIsIHJ1bGUuZmllbGQpO1xuICAgICAgICAgICAgY29uc3QgeyBpc01hdGNoLCBtYXRjaE9iaiB9ID0gY2hlY2tWYWx1ZU1hdGNoKHJ1bGUub3BlcmF0b3IsIHJhd1ZhbHVlLCBydWxlLnZhbHVlKTtcblxuICAgICAgICAgICAgaWYgKGlzTWF0Y2gpIHtcbiAgICAgICAgICAgICAgICBsZXQgcmVzdWx0ID0gcnVsZS5yZXN1bHQ7XG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoT2JqKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgbWF0Y2hPYmoubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShuZXcgUmVnRXhwKGBcXFxcJCR7aX1gLCAnZycpLCBtYXRjaE9ialtpXSB8fCBcIlwiKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgbG9nRGVidWcoXCJFcnJvciBldmFsdWF0aW5nIGxlZ2FjeSBydWxlc1wiLCB7IGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGNvbnN0IGdldEdyb3VwaW5nUmVzdWx0ID0gKHRhYjogVGFiTWV0YWRhdGEsIHN0cmF0ZWd5OiBHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nKTogeyBrZXk6IHN0cmluZyB8IG51bGwsIG1vZGU6IFwiY3VycmVudFwiIHwgXCJuZXdcIiB8IFwiY29tcG91bmRcIiB9ID0+IHtcbiAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3kpO1xuICBpZiAoY3VzdG9tKSB7XG4gICAgICBjb25zdCBmaWx0ZXJHcm91cHNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uW10+KGN1c3RvbS5maWx0ZXJHcm91cHMpO1xuICAgICAgY29uc3QgZmlsdGVyc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGN1c3RvbS5maWx0ZXJzKTtcblxuICAgICAgbGV0IG1hdGNoID0gZmFsc2U7XG5cbiAgICAgIGlmIChmaWx0ZXJHcm91cHNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAvLyBPUiBsb2dpY1xuICAgICAgICAgIGZvciAoY29uc3QgZ3JvdXAgb2YgZmlsdGVyR3JvdXBzTGlzdCkge1xuICAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihncm91cCk7XG4gICAgICAgICAgICAgIGlmIChncm91cFJ1bGVzLmxlbmd0aCA9PT0gMCB8fCBncm91cFJ1bGVzLmV2ZXJ5KHIgPT4gY2hlY2tDb25kaXRpb24ociwgdGFiKSkpIHtcbiAgICAgICAgICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChmaWx0ZXJzTGlzdC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgLy8gTGVnYWN5L1NpbXBsZSBBTkQgbG9naWNcbiAgICAgICAgICBpZiAoZmlsdGVyc0xpc3QuZXZlcnkoZiA9PiBjaGVja0NvbmRpdGlvbihmLCB0YWIpKSkge1xuICAgICAgICAgICAgICBtYXRjaCA9IHRydWU7XG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBObyBmaWx0ZXJzIC0+IE1hdGNoIGFsbFxuICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFtYXRjaCkge1xuICAgICAgICAgIHJldHVybiB7IGtleTogbnVsbCwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZ3JvdXBpbmdSdWxlc0xpc3QgPSBhc0FycmF5PEdyb3VwaW5nUnVsZT4oY3VzdG9tLmdyb3VwaW5nUnVsZXMpO1xuICAgICAgaWYgKGdyb3VwaW5nUnVsZXNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICBjb25zdCBtb2Rlczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwaW5nUnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICBsZXQgdmFsID0gXCJcIjtcbiAgICAgICAgICAgICAgICBpZiAocnVsZS5zb3VyY2UgPT09ICdmaWVsZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJhdyA9IGdldEZpZWxkVmFsdWUodGFiLCBydWxlLnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHJhdyAhPT0gdW5kZWZpbmVkICYmIHJhdyAhPT0gbnVsbCA/IFN0cmluZyhyYXcpIDogXCJcIjtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgdmFsID0gcnVsZS52YWx1ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodmFsICYmIHJ1bGUudHJhbnNmb3JtICYmIHJ1bGUudHJhbnNmb3JtICE9PSAnbm9uZScpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFsID0gYXBwbHlWYWx1ZVRyYW5zZm9ybSh2YWwsIHJ1bGUudHJhbnNmb3JtLCBydWxlLnRyYW5zZm9ybVBhdHRlcm4pO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh2YWwpIHtcbiAgICAgICAgICAgICAgICAgICAgcGFydHMucHVzaCh2YWwpO1xuICAgICAgICAgICAgICAgICAgICBpZiAocnVsZS53aW5kb3dNb2RlKSBtb2Rlcy5wdXNoKHJ1bGUud2luZG93TW9kZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGFwcGx5aW5nIGdyb3VwaW5nIHJ1bGVzXCIsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICByZXR1cm4geyBrZXk6IHBhcnRzLmpvaW4oXCIgLSBcIiksIG1vZGU6IHJlc29sdmVXaW5kb3dNb2RlKG1vZGVzKSB9O1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4geyBrZXk6IGN1c3RvbS5mYWxsYmFjayB8fCBcIk1pc2NcIiwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH0gZWxzZSBpZiAoY3VzdG9tLnJ1bGVzKSB7XG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0gZXZhbHVhdGVMZWdhY3lSdWxlcyhhc0FycmF5PFN0cmF0ZWd5UnVsZT4oY3VzdG9tLnJ1bGVzKSwgdGFiKTtcbiAgICAgICAgICBpZiAocmVzdWx0KSByZXR1cm4geyBrZXk6IHJlc3VsdCwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHsga2V5OiBjdXN0b20uZmFsbGJhY2sgfHwgXCJNaXNjXCIsIG1vZGU6IFwiY3VycmVudFwiIH07XG4gIH1cblxuICAvLyBCdWlsdC1pbiBzdHJhdGVnaWVzXG4gIGxldCBzaW1wbGVLZXk6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBzd2l0Y2ggKHN0cmF0ZWd5KSB7XG4gICAgY2FzZSBcImRvbWFpblwiOlxuICAgIGNhc2UgXCJkb21haW5fZnVsbFwiOlxuICAgICAgc2ltcGxlS2V5ID0gZG9tYWluRnJvbVVybCh0YWIudXJsKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJ0b3BpY1wiOlxuICAgICAgc2ltcGxlS2V5ID0gc2VtYW50aWNCdWNrZXQodGFiLnRpdGxlLCB0YWIudXJsKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJsaW5lYWdlXCI6XG4gICAgICBzaW1wbGVLZXkgPSBuYXZpZ2F0aW9uS2V5KHRhYik7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwiY29udGV4dFwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLmNvbnRleHQgfHwgXCJVbmNhdGVnb3JpemVkXCI7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwicGlubmVkXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIucGlubmVkID8gXCJwaW5uZWRcIiA6IFwidW5waW5uZWRcIjtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJhZ2VcIjpcbiAgICAgIHNpbXBsZUtleSA9IGdldFJlY2VuY3lMYWJlbCh0YWIubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInVybFwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLnVybDtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJ0aXRsZVwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLnRpdGxlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInJlY2VuY3lcIjpcbiAgICAgIHNpbXBsZUtleSA9IFN0cmluZyh0YWIubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcIm5lc3RpbmdcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkID8gXCJjaGlsZFwiIDogXCJyb290XCI7XG4gICAgICBicmVhaztcbiAgICBkZWZhdWx0OlxuICAgICAgICBjb25zdCB2YWwgPSBnZXRGaWVsZFZhbHVlKHRhYiwgc3RyYXRlZ3kpO1xuICAgICAgICBpZiAodmFsICE9PSB1bmRlZmluZWQgJiYgdmFsICE9PSBudWxsKSB7XG4gICAgICAgICAgICBzaW1wbGVLZXkgPSBTdHJpbmcodmFsKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNpbXBsZUtleSA9IFwiVW5rbm93blwiO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICB9XG4gIHJldHVybiB7IGtleTogc2ltcGxlS2V5LCBtb2RlOiBcImN1cnJlbnRcIiB9O1xufTtcblxuZXhwb3J0IGNvbnN0IGdyb3VwaW5nS2V5ID0gKHRhYjogVGFiTWV0YWRhdGEsIHN0cmF0ZWd5OiBHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gICAgcmV0dXJuIGdldEdyb3VwaW5nUmVzdWx0KHRhYiwgc3RyYXRlZ3kpLmtleTtcbn07XG5cbmZ1bmN0aW9uIGlzQ29udGV4dEZpZWxkKGZpZWxkOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICByZXR1cm4gZmllbGQgPT09ICdjb250ZXh0JyB8fCBmaWVsZCA9PT0gJ2dlbnJlJyB8fCBmaWVsZCA9PT0gJ3NpdGVOYW1lJyB8fCBmaWVsZC5zdGFydHNXaXRoKCdjb250ZXh0RGF0YS4nKTtcbn1cblxuZXhwb3J0IGNvbnN0IHJlcXVpcmVzQ29udGV4dEFuYWx5c2lzID0gKHN0cmF0ZWd5SWRzOiAoc3RyaW5nIHwgU29ydGluZ1N0cmF0ZWd5KVtdKTogYm9vbGVhbiA9PiB7XG4gICAgLy8gQ2hlY2sgaWYgXCJjb250ZXh0XCIgc3RyYXRlZ3kgaXMgZXhwbGljaXRseSByZXF1ZXN0ZWRcbiAgICBpZiAoc3RyYXRlZ3lJZHMuaW5jbHVkZXMoXCJjb250ZXh0XCIpKSByZXR1cm4gdHJ1ZTtcblxuICAgIGNvbnN0IHN0cmF0ZWdpZXMgPSBnZXRTdHJhdGVnaWVzKGN1c3RvbVN0cmF0ZWdpZXMpO1xuICAgIC8vIGZpbHRlciBvbmx5IHRob3NlIHRoYXQgbWF0Y2ggdGhlIHJlcXVlc3RlZCBJRHNcbiAgICBjb25zdCBhY3RpdmVEZWZzID0gc3RyYXRlZ2llcy5maWx0ZXIocyA9PiBzdHJhdGVneUlkcy5pbmNsdWRlcyhzLmlkKSk7XG5cbiAgICBmb3IgKGNvbnN0IGRlZiBvZiBhY3RpdmVEZWZzKSB7XG4gICAgICAgIC8vIElmIGl0J3MgYSBidWlsdC1pbiBzdHJhdGVneSB0aGF0IG5lZWRzIGNvbnRleHQgKG9ubHkgJ2NvbnRleHQnIGRvZXMpXG4gICAgICAgIGlmIChkZWYuaWQgPT09ICdjb250ZXh0JykgcmV0dXJuIHRydWU7XG5cbiAgICAgICAgLy8gSWYgaXQgaXMgYSBjdXN0b20gc3RyYXRlZ3kgKG9yIG92ZXJyaWRlcyBidWlsdC1pbiksIGNoZWNrIGl0cyBydWxlc1xuICAgICAgICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQoYyA9PiBjLmlkID09PSBkZWYuaWQpO1xuICAgICAgICBpZiAoY3VzdG9tKSB7XG4gICAgICAgICAgICAgY29uc3QgZ3JvdXBSdWxlc0xpc3QgPSBhc0FycmF5PEdyb3VwaW5nUnVsZT4oY3VzdG9tLmdyb3VwaW5nUnVsZXMpO1xuICAgICAgICAgICAgIGNvbnN0IHNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihjdXN0b20uc29ydGluZ1J1bGVzKTtcbiAgICAgICAgICAgICBjb25zdCBncm91cFNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihjdXN0b20uZ3JvdXBTb3J0aW5nUnVsZXMpO1xuICAgICAgICAgICAgIGNvbnN0IGZpbHRlcnNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihjdXN0b20uZmlsdGVycyk7XG4gICAgICAgICAgICAgY29uc3QgZmlsdGVyR3JvdXBzTGlzdCA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbltdPihjdXN0b20uZmlsdGVyR3JvdXBzKTtcblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBydWxlLnNvdXJjZSA9PT0gJ2ZpZWxkJyAmJiBpc0NvbnRleHRGaWVsZChydWxlLnZhbHVlKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIHJ1bGUuY29sb3IgPT09ICdmaWVsZCcgJiYgcnVsZS5jb2xvckZpZWxkICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuY29sb3JGaWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBzb3J0UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZ3JvdXBTb3J0UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZmlsdGVyc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgZ3JvdXAgb2YgZmlsdGVyR3JvdXBzTGlzdCkge1xuICAgICAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihncm91cCk7XG4gICAgICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFJ1bGVzKSB7XG4gICAgICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBpc0NvbnRleHRGaWVsZChydWxlLmZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufTtcbiIsICJpbXBvcnQgeyBTb3J0aW5nU3RyYXRlZ3ksIFRhYk1ldGFkYXRhLCBDdXN0b21TdHJhdGVneSwgU29ydGluZ1J1bGUgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBkb21haW5Gcm9tVXJsLCBzZW1hbnRpY0J1Y2tldCwgbmF2aWdhdGlvbktleSwgZ3JvdXBpbmdLZXksIGdldEZpZWxkVmFsdWUsIGdldEN1c3RvbVN0cmF0ZWdpZXMgfSBmcm9tIFwiLi9ncm91cGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tIFwiLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5cbmV4cG9ydCBjb25zdCByZWNlbmN5U2NvcmUgPSAodGFiOiBUYWJNZXRhZGF0YSkgPT4gdGFiLmxhc3RBY2Nlc3NlZCA/PyAwO1xuZXhwb3J0IGNvbnN0IGhpZXJhcmNoeVNjb3JlID0gKHRhYjogVGFiTWV0YWRhdGEpID0+ICh0YWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCA/IDEgOiAwKTtcbmV4cG9ydCBjb25zdCBwaW5uZWRTY29yZSA9ICh0YWI6IFRhYk1ldGFkYXRhKSA9PiAodGFiLnBpbm5lZCA/IDAgOiAxKTtcblxuZXhwb3J0IGNvbnN0IHNvcnRUYWJzID0gKHRhYnM6IFRhYk1ldGFkYXRhW10sIHN0cmF0ZWdpZXM6IFNvcnRpbmdTdHJhdGVneVtdKTogVGFiTWV0YWRhdGFbXSA9PiB7XG4gIGNvbnN0IHNjb3Jpbmc6IFNvcnRpbmdTdHJhdGVneVtdID0gc3RyYXRlZ2llcy5sZW5ndGggPyBzdHJhdGVnaWVzIDogW1wicGlubmVkXCIsIFwicmVjZW5jeVwiXTtcbiAgcmV0dXJuIFsuLi50YWJzXS5zb3J0KChhLCBiKSA9PiB7XG4gICAgZm9yIChjb25zdCBzdHJhdGVneSBvZiBzY29yaW5nKSB7XG4gICAgICBjb25zdCBkaWZmID0gY29tcGFyZUJ5KHN0cmF0ZWd5LCBhLCBiKTtcbiAgICAgIGlmIChkaWZmICE9PSAwKSByZXR1cm4gZGlmZjtcbiAgICB9XG4gICAgcmV0dXJuIGEuaWQgLSBiLmlkO1xuICB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBjb21wYXJlQnkgPSAoc3RyYXRlZ3k6IFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZywgYTogVGFiTWV0YWRhdGEsIGI6IFRhYk1ldGFkYXRhKTogbnVtYmVyID0+IHtcbiAgLy8gMS4gQ2hlY2sgQ3VzdG9tIFN0cmF0ZWdpZXMgZm9yIFNvcnRpbmcgUnVsZXNcbiAgY29uc3QgY3VzdG9tU3RyYXRzID0gZ2V0Q3VzdG9tU3RyYXRlZ2llcygpO1xuICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdHMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5KTtcbiAgaWYgKGN1c3RvbSkge1xuICAgICAgY29uc3Qgc29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KGN1c3RvbS5zb3J0aW5nUnVsZXMpO1xuICAgICAgaWYgKHNvcnRSdWxlc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIC8vIEV2YWx1YXRlIGN1c3RvbSBzb3J0aW5nIHJ1bGVzIGluIG9yZGVyXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIHNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgIGlmICghcnVsZSkgY29udGludWU7XG4gICAgICAgICAgICAgICAgICBjb25zdCB2YWxBID0gZ2V0RmllbGRWYWx1ZShhLCBydWxlLmZpZWxkKTtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IHZhbEIgPSBnZXRGaWVsZFZhbHVlKGIsIHJ1bGUuZmllbGQpO1xuXG4gICAgICAgICAgICAgICAgICBsZXQgcmVzdWx0ID0gMDtcbiAgICAgICAgICAgICAgICAgIGlmICh2YWxBIDwgdmFsQikgcmVzdWx0ID0gLTE7XG4gICAgICAgICAgICAgICAgICBlbHNlIGlmICh2YWxBID4gdmFsQikgcmVzdWx0ID0gMTtcblxuICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdCAhPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBydWxlLm9yZGVyID09PSAnZGVzYycgPyAtcmVzdWx0IDogcmVzdWx0O1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGV2YWx1YXRpbmcgY3VzdG9tIHNvcnRpbmcgcnVsZXNcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBJZiBhbGwgcnVsZXMgZXF1YWwsIGNvbnRpbnVlIHRvIG5leHQgc3RyYXRlZ3kgKHJldHVybiAwKVxuICAgICAgICAgIHJldHVybiAwO1xuICAgICAgfVxuICB9XG5cbiAgLy8gMi4gQnVpbHQtaW4gb3IgZmFsbGJhY2tcbiAgc3dpdGNoIChzdHJhdGVneSkge1xuICAgIGNhc2UgXCJyZWNlbmN5XCI6XG4gICAgICByZXR1cm4gKGIubGFzdEFjY2Vzc2VkID8/IDApIC0gKGEubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgIGNhc2UgXCJuZXN0aW5nXCI6IC8vIEZvcm1lcmx5IGhpZXJhcmNoeVxuICAgICAgcmV0dXJuIGhpZXJhcmNoeVNjb3JlKGEpIC0gaGllcmFyY2h5U2NvcmUoYik7XG4gICAgY2FzZSBcInBpbm5lZFwiOlxuICAgICAgcmV0dXJuIHBpbm5lZFNjb3JlKGEpIC0gcGlubmVkU2NvcmUoYik7XG4gICAgY2FzZSBcInRpdGxlXCI6XG4gICAgICByZXR1cm4gYS50aXRsZS5sb2NhbGVDb21wYXJlKGIudGl0bGUpO1xuICAgIGNhc2UgXCJ1cmxcIjpcbiAgICAgIHJldHVybiBhLnVybC5sb2NhbGVDb21wYXJlKGIudXJsKTtcbiAgICBjYXNlIFwiY29udGV4dFwiOlxuICAgICAgcmV0dXJuIChhLmNvbnRleHQgPz8gXCJcIikubG9jYWxlQ29tcGFyZShiLmNvbnRleHQgPz8gXCJcIik7XG4gICAgY2FzZSBcImRvbWFpblwiOlxuICAgIGNhc2UgXCJkb21haW5fZnVsbFwiOlxuICAgICAgcmV0dXJuIGRvbWFpbkZyb21VcmwoYS51cmwpLmxvY2FsZUNvbXBhcmUoZG9tYWluRnJvbVVybChiLnVybCkpO1xuICAgIGNhc2UgXCJ0b3BpY1wiOlxuICAgICAgcmV0dXJuIHNlbWFudGljQnVja2V0KGEudGl0bGUsIGEudXJsKS5sb2NhbGVDb21wYXJlKHNlbWFudGljQnVja2V0KGIudGl0bGUsIGIudXJsKSk7XG4gICAgY2FzZSBcImxpbmVhZ2VcIjpcbiAgICAgIHJldHVybiBuYXZpZ2F0aW9uS2V5KGEpLmxvY2FsZUNvbXBhcmUobmF2aWdhdGlvbktleShiKSk7XG4gICAgY2FzZSBcImFnZVwiOlxuICAgICAgLy8gUmV2ZXJzZSBhbHBoYWJldGljYWwgZm9yIGFnZSBidWNrZXRzIChUb2RheSA8IFllc3RlcmRheSksIHJvdWdoIGFwcHJveFxuICAgICAgcmV0dXJuIChncm91cGluZ0tleShhLCBcImFnZVwiKSB8fCBcIlwiKS5sb2NhbGVDb21wYXJlKGdyb3VwaW5nS2V5KGIsIFwiYWdlXCIpIHx8IFwiXCIpO1xuICAgIGRlZmF1bHQ6XG4gICAgICAvLyBDaGVjayBpZiBpdCdzIGEgZ2VuZXJpYyBmaWVsZCBmaXJzdFxuICAgICAgY29uc3QgdmFsQSA9IGdldEZpZWxkVmFsdWUoYSwgc3RyYXRlZ3kpO1xuICAgICAgY29uc3QgdmFsQiA9IGdldEZpZWxkVmFsdWUoYiwgc3RyYXRlZ3kpO1xuXG4gICAgICBpZiAodmFsQSAhPT0gdW5kZWZpbmVkICYmIHZhbEIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGlmICh2YWxBIDwgdmFsQikgcmV0dXJuIC0xO1xuICAgICAgICAgIGlmICh2YWxBID4gdmFsQikgcmV0dXJuIDE7XG4gICAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9XG5cbiAgICAgIC8vIEZhbGxiYWNrIGZvciBjdXN0b20gc3RyYXRlZ2llcyBncm91cGluZyBrZXkgKGlmIHVzaW5nIGN1c3RvbSBzdHJhdGVneSBhcyBzb3J0aW5nIGJ1dCBubyBzb3J0aW5nIHJ1bGVzIGRlZmluZWQpXG4gICAgICAvLyBvciB1bmhhbmRsZWQgYnVpbHQtaW5zXG4gICAgICByZXR1cm4gKGdyb3VwaW5nS2V5KGEsIHN0cmF0ZWd5KSB8fCBcIlwiKS5sb2NhbGVDb21wYXJlKGdyb3VwaW5nS2V5KGIsIHN0cmF0ZWd5KSB8fCBcIlwiKTtcbiAgfVxufTtcbiIsICIvLyBsb2dpYy50c1xuLy8gUHVyZSBmdW5jdGlvbnMgZm9yIGV4dHJhY3Rpb24gbG9naWNcblxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZVVybCh1cmxTdHI6IHN0cmluZyk6IHN0cmluZyB7XG4gIHRyeSB7XG4gICAgY29uc3QgdXJsID0gbmV3IFVSTCh1cmxTdHIpO1xuICAgIGNvbnN0IHBhcmFtcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXModXJsLnNlYXJjaCk7XG4gICAgY29uc3Qga2V5czogc3RyaW5nW10gPSBbXTtcbiAgICBwYXJhbXMuZm9yRWFjaCgoXywga2V5KSA9PiBrZXlzLnB1c2goa2V5KSk7XG4gICAgY29uc3QgaG9zdG5hbWUgPSB1cmwuaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sICcnKTtcblxuICAgIGNvbnN0IFRSQUNLSU5HID0gWy9edXRtXy8sIC9eZmJjbGlkJC8sIC9eZ2NsaWQkLywgL15fZ2EkLywgL15yZWYkLywgL155Y2xpZCQvLCAvXl9ocy9dO1xuICAgIGNvbnN0IGlzWW91dHViZSA9IGhvc3RuYW1lLmVuZHNXaXRoKCd5b3V0dWJlLmNvbScpIHx8IGhvc3RuYW1lLmVuZHNXaXRoKCd5b3V0dS5iZScpO1xuICAgIGNvbnN0IGlzR29vZ2xlID0gaG9zdG5hbWUuZW5kc1dpdGgoJ2dvb2dsZS5jb20nKTtcblxuICAgIGNvbnN0IGtlZXA6IHN0cmluZ1tdID0gW107XG4gICAgaWYgKGlzWW91dHViZSkga2VlcC5wdXNoKCd2JywgJ2xpc3QnLCAndCcsICdjJywgJ2NoYW5uZWwnLCAncGxheWxpc3QnKTtcbiAgICBpZiAoaXNHb29nbGUpIGtlZXAucHVzaCgncScsICdpZCcsICdzb3VyY2VpZCcpO1xuXG4gICAgZm9yIChjb25zdCBrZXkgb2Yga2V5cykge1xuICAgICAgaWYgKFRSQUNLSU5HLnNvbWUociA9PiByLnRlc3Qoa2V5KSkpIHtcbiAgICAgICAgIHBhcmFtcy5kZWxldGUoa2V5KTtcbiAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKChpc1lvdXR1YmUgfHwgaXNHb29nbGUpICYmICFrZWVwLmluY2x1ZGVzKGtleSkpIHtcbiAgICAgICAgIHBhcmFtcy5kZWxldGUoa2V5KTtcbiAgICAgIH1cbiAgICB9XG4gICAgdXJsLnNlYXJjaCA9IHBhcmFtcy50b1N0cmluZygpO1xuICAgIHJldHVybiB1cmwudG9TdHJpbmcoKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIHJldHVybiB1cmxTdHI7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlWW91VHViZVVybCh1cmxTdHI6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHVybCA9IG5ldyBVUkwodXJsU3RyKTtcbiAgICAgICAgY29uc3QgdiA9IHVybC5zZWFyY2hQYXJhbXMuZ2V0KCd2Jyk7XG4gICAgICAgIGNvbnN0IGlzU2hvcnRzID0gdXJsLnBhdGhuYW1lLmluY2x1ZGVzKCcvc2hvcnRzLycpO1xuICAgICAgICBsZXQgdmlkZW9JZCA9XG4gICAgICAgICAgdiB8fFxuICAgICAgICAgIChpc1Nob3J0cyA/IHVybC5wYXRobmFtZS5zcGxpdCgnL3Nob3J0cy8nKVsxXSA6IG51bGwpIHx8XG4gICAgICAgICAgKHVybC5ob3N0bmFtZSA9PT0gJ3lvdXR1LmJlJyA/IHVybC5wYXRobmFtZS5yZXBsYWNlKCcvJywgJycpIDogbnVsbCk7XG5cbiAgICAgICAgY29uc3QgcGxheWxpc3RJZCA9IHVybC5zZWFyY2hQYXJhbXMuZ2V0KCdsaXN0Jyk7XG4gICAgICAgIGNvbnN0IHBsYXlsaXN0SW5kZXggPSBwYXJzZUludCh1cmwuc2VhcmNoUGFyYW1zLmdldCgnaW5kZXgnKSB8fCAnMCcsIDEwKTtcblxuICAgICAgICByZXR1cm4geyB2aWRlb0lkLCBpc1Nob3J0cywgcGxheWxpc3RJZCwgcGxheWxpc3RJbmRleCB9O1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcmV0dXJuIHsgdmlkZW9JZDogbnVsbCwgaXNTaG9ydHM6IGZhbHNlLCBwbGF5bGlzdElkOiBudWxsLCBwbGF5bGlzdEluZGV4OiBudWxsIH07XG4gICAgfVxufVxuXG5mdW5jdGlvbiBleHRyYWN0QXV0aG9yKGVudGl0eTogYW55KTogc3RyaW5nIHwgbnVsbCB7XG4gICAgaWYgKCFlbnRpdHkgfHwgIWVudGl0eS5hdXRob3IpIHJldHVybiBudWxsO1xuICAgIGlmICh0eXBlb2YgZW50aXR5LmF1dGhvciA9PT0gJ3N0cmluZycpIHJldHVybiBlbnRpdHkuYXV0aG9yO1xuICAgIGlmIChBcnJheS5pc0FycmF5KGVudGl0eS5hdXRob3IpKSByZXR1cm4gZW50aXR5LmF1dGhvclswXT8ubmFtZSB8fCBudWxsO1xuICAgIGlmICh0eXBlb2YgZW50aXR5LmF1dGhvciA9PT0gJ29iamVjdCcpIHJldHVybiBlbnRpdHkuYXV0aG9yLm5hbWUgfHwgbnVsbDtcbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gZXh0cmFjdEtleXdvcmRzKGVudGl0eTogYW55KTogc3RyaW5nW10ge1xuICAgIGlmICghZW50aXR5IHx8ICFlbnRpdHkua2V5d29yZHMpIHJldHVybiBbXTtcbiAgICBpZiAodHlwZW9mIGVudGl0eS5rZXl3b3JkcyA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmV0dXJuIGVudGl0eS5rZXl3b3Jkcy5zcGxpdCgnLCcpLm1hcCgoczogc3RyaW5nKSA9PiBzLnRyaW0oKSk7XG4gICAgfVxuICAgIGlmIChBcnJheS5pc0FycmF5KGVudGl0eS5rZXl3b3JkcykpIHJldHVybiBlbnRpdHkua2V5d29yZHM7XG4gICAgcmV0dXJuIFtdO1xufVxuXG5mdW5jdGlvbiBleHRyYWN0QnJlYWRjcnVtYnMoanNvbkxkOiBhbnlbXSk6IHN0cmluZ1tdIHtcbiAgICBjb25zdCBicmVhZGNydW1iTGQgPSBqc29uTGQuZmluZChpID0+IGkgJiYgaVsnQHR5cGUnXSA9PT0gJ0JyZWFkY3J1bWJMaXN0Jyk7XG4gICAgaWYgKCFicmVhZGNydW1iTGQgfHwgIUFycmF5LmlzQXJyYXkoYnJlYWRjcnVtYkxkLml0ZW1MaXN0RWxlbWVudCkpIHJldHVybiBbXTtcblxuICAgIGNvbnN0IGxpc3QgPSBicmVhZGNydW1iTGQuaXRlbUxpc3RFbGVtZW50LnNvcnQoKGE6IGFueSwgYjogYW55KSA9PiAoYS5wb3NpdGlvbiB8fCAwKSAtIChiLnBvc2l0aW9uIHx8IDApKTtcbiAgICBjb25zdCBicmVhZGNydW1iczogc3RyaW5nW10gPSBbXTtcbiAgICBsaXN0LmZvckVhY2goKGl0ZW06IGFueSkgPT4ge1xuICAgICAgICBpZiAoaXRlbS5uYW1lKSBicmVhZGNydW1icy5wdXNoKGl0ZW0ubmFtZSk7XG4gICAgICAgIGVsc2UgaWYgKGl0ZW0uaXRlbSAmJiBpdGVtLml0ZW0ubmFtZSkgYnJlYWRjcnVtYnMucHVzaChpdGVtLml0ZW0ubmFtZSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIGJyZWFkY3J1bWJzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXh0cmFjdEpzb25MZEZpZWxkcyhqc29uTGQ6IGFueVtdKSB7XG4gICAgLy8gRmluZCBtYWluIGVudGl0eVxuICAgIC8vIEFkZGVkIHNhZmV0eSBjaGVjazogaSAmJiBpWydAdHlwZSddXG4gICAgY29uc3QgbWFpbkVudGl0eSA9IGpzb25MZC5maW5kKGkgPT4gaSAmJiAoaVsnQHR5cGUnXSA9PT0gJ0FydGljbGUnIHx8IGlbJ0B0eXBlJ10gPT09ICdWaWRlb09iamVjdCcgfHwgaVsnQHR5cGUnXSA9PT0gJ05ld3NBcnRpY2xlJykpIHx8IGpzb25MZFswXTtcblxuICAgIGxldCBhdXRob3I6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgIGxldCBwdWJsaXNoZWRBdDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgbGV0IG1vZGlmaWVkQXQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgIGxldCB0YWdzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgaWYgKG1haW5FbnRpdHkpIHtcbiAgICAgICAgYXV0aG9yID0gZXh0cmFjdEF1dGhvcihtYWluRW50aXR5KTtcbiAgICAgICAgcHVibGlzaGVkQXQgPSBtYWluRW50aXR5LmRhdGVQdWJsaXNoZWQgfHwgbnVsbDtcbiAgICAgICAgbW9kaWZpZWRBdCA9IG1haW5FbnRpdHkuZGF0ZU1vZGlmaWVkIHx8IG51bGw7XG4gICAgICAgIHRhZ3MgPSBleHRyYWN0S2V5d29yZHMobWFpbkVudGl0eSk7XG4gICAgfVxuXG4gICAgY29uc3QgYnJlYWRjcnVtYnMgPSBleHRyYWN0QnJlYWRjcnVtYnMoanNvbkxkKTtcblxuICAgIHJldHVybiB7IGF1dGhvciwgcHVibGlzaGVkQXQsIG1vZGlmaWVkQXQsIHRhZ3MsIGJyZWFkY3J1bWJzIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0WW91VHViZUNoYW5uZWxGcm9tSHRtbChodG1sOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcbiAgLy8gMS4gVHJ5IEpTT04tTERcbiAgLy8gTG9vayBmb3IgPHNjcmlwdCB0eXBlPVwiYXBwbGljYXRpb24vbGQranNvblwiPi4uLjwvc2NyaXB0PlxuICAvLyBXZSBuZWVkIHRvIGxvb3AgYmVjYXVzZSB0aGVyZSBtaWdodCBiZSBtdWx0aXBsZSBzY3JpcHRzXG4gIGNvbnN0IHNjcmlwdFJlZ2V4ID0gLzxzY3JpcHRcXHMrdHlwZT1bXCInXWFwcGxpY2F0aW9uXFwvbGRcXCtqc29uW1wiJ11bXj5dKj4oW1xcc1xcU10qPyk8XFwvc2NyaXB0Pi9naTtcbiAgbGV0IG1hdGNoO1xuICB3aGlsZSAoKG1hdGNoID0gc2NyaXB0UmVnZXguZXhlYyhodG1sKSkgIT09IG51bGwpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QganNvbiA9IEpTT04ucGFyc2UobWF0Y2hbMV0pO1xuICAgICAgICAgIGNvbnN0IGFycmF5ID0gQXJyYXkuaXNBcnJheShqc29uKSA/IGpzb24gOiBbanNvbl07XG4gICAgICAgICAgY29uc3QgZmllbGRzID0gZXh0cmFjdEpzb25MZEZpZWxkcyhhcnJheSk7XG4gICAgICAgICAgaWYgKGZpZWxkcy5hdXRob3IpIHJldHVybiBmaWVsZHMuYXV0aG9yO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIC8vIGlnbm9yZSBwYXJzZSBlcnJvcnNcbiAgICAgIH1cbiAgfVxuXG4gIC8vIDIuIFRyeSA8bGluayBpdGVtcHJvcD1cIm5hbWVcIiBjb250ZW50PVwiLi4uXCI+IChZb3VUdWJlIG9mdGVuIHB1dHMgY2hhbm5lbCBuYW1lIGhlcmUgaW4gc29tZSBjb250ZXh0cylcbiAgLy8gT3IgPG1ldGEgaXRlbXByb3A9XCJjaGFubmVsSWRcIiBjb250ZW50PVwiLi4uXCI+IC0+IGJ1dCB0aGF0J3MgSUQuXG4gIC8vIDxsaW5rIGl0ZW1wcm9wPVwibmFtZVwiIGNvbnRlbnQ9XCJDaGFubmVsIE5hbWVcIj5cbiAgLy8gPHNwYW4gaXRlbXByb3A9XCJhdXRob3JcIiBpdGVtc2NvcGUgaXRlbXR5cGU9XCJodHRwOi8vc2NoZW1hLm9yZy9QZXJzb25cIj48bGluayBpdGVtcHJvcD1cIm5hbWVcIiBjb250ZW50PVwiQ2hhbm5lbCBOYW1lXCI+PC9zcGFuPlxuICBjb25zdCBsaW5rTmFtZVJlZ2V4ID0gLzxsaW5rXFxzK2l0ZW1wcm9wPVtcIiddbmFtZVtcIiddXFxzK2NvbnRlbnQ9W1wiJ10oW15cIiddKylbXCInXVxccypcXC8/Pi9pO1xuICBjb25zdCBsaW5rTWF0Y2ggPSBsaW5rTmFtZVJlZ2V4LmV4ZWMoaHRtbCk7XG4gIGlmIChsaW5rTWF0Y2ggJiYgbGlua01hdGNoWzFdKSByZXR1cm4gZGVjb2RlSHRtbEVudGl0aWVzKGxpbmtNYXRjaFsxXSk7XG5cbiAgLy8gMy4gVHJ5IG1ldGEgYXV0aG9yXG4gIGNvbnN0IG1ldGFBdXRob3JSZWdleCA9IC88bWV0YVxccytuYW1lPVtcIiddYXV0aG9yW1wiJ11cXHMrY29udGVudD1bXCInXShbXlwiJ10rKVtcIiddXFxzKlxcLz8+L2k7XG4gIGNvbnN0IG1ldGFNYXRjaCA9IG1ldGFBdXRob3JSZWdleC5leGVjKGh0bWwpO1xuICBpZiAobWV0YU1hdGNoICYmIG1ldGFNYXRjaFsxXSkge1xuICAgICAgLy8gWW91VHViZSBtZXRhIGF1dGhvciBpcyBvZnRlbiBcIkNoYW5uZWwgTmFtZVwiXG4gICAgICByZXR1cm4gZGVjb2RlSHRtbEVudGl0aWVzKG1ldGFNYXRjaFsxXSk7XG4gIH1cblxuICByZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RZb3VUdWJlR2VucmVGcm9tSHRtbChodG1sOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcbiAgLy8gMS4gVHJ5IDxtZXRhIGl0ZW1wcm9wPVwiZ2VucmVcIiBjb250ZW50PVwiLi4uXCI+XG4gIGNvbnN0IG1ldGFHZW5yZVJlZ2V4ID0gLzxtZXRhXFxzK2l0ZW1wcm9wPVtcIiddZ2VucmVbXCInXVxccytjb250ZW50PVtcIiddKFteXCInXSspW1wiJ11cXHMqXFwvPz4vaTtcbiAgY29uc3QgbWV0YU1hdGNoID0gbWV0YUdlbnJlUmVnZXguZXhlYyhodG1sKTtcbiAgaWYgKG1ldGFNYXRjaCAmJiBtZXRhTWF0Y2hbMV0pIHtcbiAgICAgIHJldHVybiBkZWNvZGVIdG1sRW50aXRpZXMobWV0YU1hdGNoWzFdKTtcbiAgfVxuXG4gIC8vIDIuIFRyeSBKU09OIFwiY2F0ZWdvcnlcIiBpbiBzY3JpcHRzXG4gIC8vIFwiY2F0ZWdvcnlcIjpcIkdhbWluZ1wiXG4gIGNvbnN0IGNhdGVnb3J5UmVnZXggPSAvXCJjYXRlZ29yeVwiXFxzKjpcXHMqXCIoW15cIl0rKVwiLztcbiAgY29uc3QgY2F0TWF0Y2ggPSBjYXRlZ29yeVJlZ2V4LmV4ZWMoaHRtbCk7XG4gIGlmIChjYXRNYXRjaCAmJiBjYXRNYXRjaFsxXSkge1xuICAgICAgcmV0dXJuIGRlY29kZUh0bWxFbnRpdGllcyhjYXRNYXRjaFsxXSk7XG4gIH1cblxuICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gZGVjb2RlSHRtbEVudGl0aWVzKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGlmICghdGV4dCkgcmV0dXJuIHRleHQ7XG5cbiAgY29uc3QgZW50aXRpZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgJyZhbXA7JzogJyYnLFxuICAgICcmbHQ7JzogJzwnLFxuICAgICcmZ3Q7JzogJz4nLFxuICAgICcmcXVvdDsnOiAnXCInLFxuICAgICcmIzM5Oyc6IFwiJ1wiLFxuICAgICcmYXBvczsnOiBcIidcIixcbiAgICAnJm5ic3A7JzogJyAnXG4gIH07XG5cbiAgcmV0dXJuIHRleHQucmVwbGFjZSgvJihbYS16MC05XSt8I1swLTldezEsNn18I3hbMC05YS1mQS1GXXsxLDZ9KTsvaWcsIChtYXRjaCkgPT4ge1xuICAgICAgY29uc3QgbG93ZXIgPSBtYXRjaC50b0xvd2VyQ2FzZSgpO1xuICAgICAgaWYgKGVudGl0aWVzW2xvd2VyXSkgcmV0dXJuIGVudGl0aWVzW2xvd2VyXTtcbiAgICAgIGlmIChlbnRpdGllc1ttYXRjaF0pIHJldHVybiBlbnRpdGllc1ttYXRjaF07XG5cbiAgICAgIGlmIChsb3dlci5zdGFydHNXaXRoKCcmI3gnKSkge1xuICAgICAgICAgIHRyeSB7IHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlKHBhcnNlSW50KGxvd2VyLnNsaWNlKDMsIC0xKSwgMTYpKTsgfSBjYXRjaCB7IHJldHVybiBtYXRjaDsgfVxuICAgICAgfVxuICAgICAgaWYgKGxvd2VyLnN0YXJ0c1dpdGgoJyYjJykpIHtcbiAgICAgICAgICB0cnkgeyByZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZShwYXJzZUludChsb3dlci5zbGljZSgyLCAtMSksIDEwKSk7IH0gY2F0Y2ggeyByZXR1cm4gbWF0Y2g7IH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBtYXRjaDtcbiAgfSk7XG59XG4iLCAiXG5leHBvcnQgY29uc3QgR0VORVJBX1JFR0lTVFJZOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAvLyBTZWFyY2hcbiAgJ2dvb2dsZS5jb20nOiAnU2VhcmNoJyxcbiAgJ2JpbmcuY29tJzogJ1NlYXJjaCcsXG4gICdkdWNrZHVja2dvLmNvbSc6ICdTZWFyY2gnLFxuICAneWFob28uY29tJzogJ1NlYXJjaCcsXG4gICdiYWlkdS5jb20nOiAnU2VhcmNoJyxcbiAgJ3lhbmRleC5jb20nOiAnU2VhcmNoJyxcbiAgJ2thZ2kuY29tJzogJ1NlYXJjaCcsXG4gICdlY29zaWEub3JnJzogJ1NlYXJjaCcsXG5cbiAgLy8gU29jaWFsXG4gICdmYWNlYm9vay5jb20nOiAnU29jaWFsJyxcbiAgJ3R3aXR0ZXIuY29tJzogJ1NvY2lhbCcsXG4gICd4LmNvbSc6ICdTb2NpYWwnLFxuICAnaW5zdGFncmFtLmNvbSc6ICdTb2NpYWwnLFxuICAnbGlua2VkaW4uY29tJzogJ1NvY2lhbCcsXG4gICdyZWRkaXQuY29tJzogJ1NvY2lhbCcsXG4gICd0aWt0b2suY29tJzogJ1NvY2lhbCcsXG4gICdwaW50ZXJlc3QuY29tJzogJ1NvY2lhbCcsXG4gICdzbmFwY2hhdC5jb20nOiAnU29jaWFsJyxcbiAgJ3R1bWJsci5jb20nOiAnU29jaWFsJyxcbiAgJ3RocmVhZHMubmV0JzogJ1NvY2lhbCcsXG4gICdibHVlc2t5LmFwcCc6ICdTb2NpYWwnLFxuICAnbWFzdG9kb24uc29jaWFsJzogJ1NvY2lhbCcsXG5cbiAgLy8gVmlkZW9cbiAgJ3lvdXR1YmUuY29tJzogJ1ZpZGVvJyxcbiAgJ3lvdXR1LmJlJzogJ1ZpZGVvJyxcbiAgJ3ZpbWVvLmNvbSc6ICdWaWRlbycsXG4gICd0d2l0Y2gudHYnOiAnVmlkZW8nLFxuICAnbmV0ZmxpeC5jb20nOiAnVmlkZW8nLFxuICAnaHVsdS5jb20nOiAnVmlkZW8nLFxuICAnZGlzbmV5cGx1cy5jb20nOiAnVmlkZW8nLFxuICAnZGFpbHltb3Rpb24uY29tJzogJ1ZpZGVvJyxcbiAgJ3ByaW1ldmlkZW8uY29tJzogJ1ZpZGVvJyxcbiAgJ2hib21heC5jb20nOiAnVmlkZW8nLFxuICAnbWF4LmNvbSc6ICdWaWRlbycsXG4gICdwZWFjb2NrdHYuY29tJzogJ1ZpZGVvJyxcblxuICAvLyBEZXZlbG9wbWVudFxuICAnZ2l0aHViLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdnaXRsYWIuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ3N0YWNrb3ZlcmZsb3cuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ25wbWpzLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdweXBpLm9yZyc6ICdEZXZlbG9wbWVudCcsXG4gICdkZXZlbG9wZXIubW96aWxsYS5vcmcnOiAnRGV2ZWxvcG1lbnQnLFxuICAndzNzY2hvb2xzLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdnZWVrc2ZvcmdlZWtzLm9yZyc6ICdEZXZlbG9wbWVudCcsXG4gICdqaXJhLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdhdGxhc3NpYW4ubmV0JzogJ0RldmVsb3BtZW50JywgLy8gb2Z0ZW4gamlyYVxuICAnYml0YnVja2V0Lm9yZyc6ICdEZXZlbG9wbWVudCcsXG4gICdkZXYudG8nOiAnRGV2ZWxvcG1lbnQnLFxuICAnaGFzaG5vZGUuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ21lZGl1bS5jb20nOiAnRGV2ZWxvcG1lbnQnLCAvLyBHZW5lcmFsIGJ1dCBvZnRlbiBkZXZcbiAgJ3ZlcmNlbC5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnbmV0bGlmeS5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnaGVyb2t1LmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdhd3MuYW1hem9uLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdjb25zb2xlLmF3cy5hbWF6b24uY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2Nsb3VkLmdvb2dsZS5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnYXp1cmUubWljcm9zb2Z0LmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdwb3J0YWwuYXp1cmUuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2RvY2tlci5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAna3ViZXJuZXRlcy5pbyc6ICdEZXZlbG9wbWVudCcsXG5cbiAgLy8gTmV3c1xuICAnY25uLmNvbSc6ICdOZXdzJyxcbiAgJ2JiYy5jb20nOiAnTmV3cycsXG4gICdueXRpbWVzLmNvbSc6ICdOZXdzJyxcbiAgJ3dhc2hpbmd0b25wb3N0LmNvbSc6ICdOZXdzJyxcbiAgJ3RoZWd1YXJkaWFuLmNvbSc6ICdOZXdzJyxcbiAgJ2ZvcmJlcy5jb20nOiAnTmV3cycsXG4gICdibG9vbWJlcmcuY29tJzogJ05ld3MnLFxuICAncmV1dGVycy5jb20nOiAnTmV3cycsXG4gICd3c2ouY29tJzogJ05ld3MnLFxuICAnY25iYy5jb20nOiAnTmV3cycsXG4gICdodWZmcG9zdC5jb20nOiAnTmV3cycsXG4gICduZXdzLmdvb2dsZS5jb20nOiAnTmV3cycsXG4gICdmb3huZXdzLmNvbSc6ICdOZXdzJyxcbiAgJ25iY25ld3MuY29tJzogJ05ld3MnLFxuICAnYWJjbmV3cy5nby5jb20nOiAnTmV3cycsXG4gICd1c2F0b2RheS5jb20nOiAnTmV3cycsXG5cbiAgLy8gU2hvcHBpbmdcbiAgJ2FtYXpvbi5jb20nOiAnU2hvcHBpbmcnLFxuICAnZWJheS5jb20nOiAnU2hvcHBpbmcnLFxuICAnd2FsbWFydC5jb20nOiAnU2hvcHBpbmcnLFxuICAnZXRzeS5jb20nOiAnU2hvcHBpbmcnLFxuICAndGFyZ2V0LmNvbSc6ICdTaG9wcGluZycsXG4gICdiZXN0YnV5LmNvbSc6ICdTaG9wcGluZycsXG4gICdhbGlleHByZXNzLmNvbSc6ICdTaG9wcGluZycsXG4gICdzaG9waWZ5LmNvbSc6ICdTaG9wcGluZycsXG4gICd0ZW11LmNvbSc6ICdTaG9wcGluZycsXG4gICdzaGVpbi5jb20nOiAnU2hvcHBpbmcnLFxuICAnd2F5ZmFpci5jb20nOiAnU2hvcHBpbmcnLFxuICAnY29zdGNvLmNvbSc6ICdTaG9wcGluZycsXG5cbiAgLy8gQ29tbXVuaWNhdGlvblxuICAnbWFpbC5nb29nbGUuY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnb3V0bG9vay5saXZlLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ3NsYWNrLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ2Rpc2NvcmQuY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnem9vbS51cyc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ3RlYW1zLm1pY3Jvc29mdC5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICd3aGF0c2FwcC5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICd0ZWxlZ3JhbS5vcmcnOiAnQ29tbXVuaWNhdGlvbicsXG4gICdtZXNzZW5nZXIuY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnc2t5cGUuY29tJzogJ0NvbW11bmljYXRpb24nLFxuXG4gIC8vIEZpbmFuY2VcbiAgJ3BheXBhbC5jb20nOiAnRmluYW5jZScsXG4gICdjaGFzZS5jb20nOiAnRmluYW5jZScsXG4gICdiYW5rb2ZhbWVyaWNhLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ3dlbGxzZmFyZ28uY29tJzogJ0ZpbmFuY2UnLFxuICAnYW1lcmljYW5leHByZXNzLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ3N0cmlwZS5jb20nOiAnRmluYW5jZScsXG4gICdjb2luYmFzZS5jb20nOiAnRmluYW5jZScsXG4gICdiaW5hbmNlLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2tyYWtlbi5jb20nOiAnRmluYW5jZScsXG4gICdyb2Jpbmhvb2QuY29tJzogJ0ZpbmFuY2UnLFxuICAnZmlkZWxpdHkuY29tJzogJ0ZpbmFuY2UnLFxuICAndmFuZ3VhcmQuY29tJzogJ0ZpbmFuY2UnLFxuICAnc2Nod2FiLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ21pbnQuaW50dWl0LmNvbSc6ICdGaW5hbmNlJyxcblxuICAvLyBFZHVjYXRpb25cbiAgJ3dpa2lwZWRpYS5vcmcnOiAnRWR1Y2F0aW9uJyxcbiAgJ2NvdXJzZXJhLm9yZyc6ICdFZHVjYXRpb24nLFxuICAndWRlbXkuY29tJzogJ0VkdWNhdGlvbicsXG4gICdlZHgub3JnJzogJ0VkdWNhdGlvbicsXG4gICdraGFuYWNhZGVteS5vcmcnOiAnRWR1Y2F0aW9uJyxcbiAgJ3F1aXpsZXQuY29tJzogJ0VkdWNhdGlvbicsXG4gICdkdW9saW5nby5jb20nOiAnRWR1Y2F0aW9uJyxcbiAgJ2NhbnZhcy5pbnN0cnVjdHVyZS5jb20nOiAnRWR1Y2F0aW9uJyxcbiAgJ2JsYWNrYm9hcmQuY29tJzogJ0VkdWNhdGlvbicsXG4gICdtaXQuZWR1JzogJ0VkdWNhdGlvbicsXG4gICdoYXJ2YXJkLmVkdSc6ICdFZHVjYXRpb24nLFxuICAnc3RhbmZvcmQuZWR1JzogJ0VkdWNhdGlvbicsXG4gICdhY2FkZW1pYS5lZHUnOiAnRWR1Y2F0aW9uJyxcbiAgJ3Jlc2VhcmNoZ2F0ZS5uZXQnOiAnRWR1Y2F0aW9uJyxcblxuICAvLyBEZXNpZ25cbiAgJ2ZpZ21hLmNvbSc6ICdEZXNpZ24nLFxuICAnY2FudmEuY29tJzogJ0Rlc2lnbicsXG4gICdiZWhhbmNlLm5ldCc6ICdEZXNpZ24nLFxuICAnZHJpYmJibGUuY29tJzogJ0Rlc2lnbicsXG4gICdhZG9iZS5jb20nOiAnRGVzaWduJyxcbiAgJ3Vuc3BsYXNoLmNvbSc6ICdEZXNpZ24nLFxuICAncGV4ZWxzLmNvbSc6ICdEZXNpZ24nLFxuICAncGl4YWJheS5jb20nOiAnRGVzaWduJyxcbiAgJ3NodXR0ZXJzdG9jay5jb20nOiAnRGVzaWduJyxcblxuICAvLyBQcm9kdWN0aXZpdHlcbiAgJ2RvY3MuZ29vZ2xlLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnc2hlZXRzLmdvb2dsZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ3NsaWRlcy5nb29nbGUuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdkcml2ZS5nb29nbGUuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdub3Rpb24uc28nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ3RyZWxsby5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2FzYW5hLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnbW9uZGF5LmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnYWlydGFibGUuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdldmVybm90ZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2Ryb3Bib3guY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdjbGlja3VwLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnbGluZWFyLmFwcCc6ICdQcm9kdWN0aXZpdHknLFxuICAnbWlyby5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2x1Y2lkY2hhcnQuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG5cbiAgLy8gQUlcbiAgJ29wZW5haS5jb20nOiAnQUknLFxuICAnY2hhdGdwdC5jb20nOiAnQUknLFxuICAnYW50aHJvcGljLmNvbSc6ICdBSScsXG4gICdtaWRqb3VybmV5LmNvbSc6ICdBSScsXG4gICdodWdnaW5nZmFjZS5jbyc6ICdBSScsXG4gICdiYXJkLmdvb2dsZS5jb20nOiAnQUknLFxuICAnZ2VtaW5pLmdvb2dsZS5jb20nOiAnQUknLFxuICAnY2xhdWRlLmFpJzogJ0FJJyxcbiAgJ3BlcnBsZXhpdHkuYWknOiAnQUknLFxuICAncG9lLmNvbSc6ICdBSScsXG5cbiAgLy8gTXVzaWMvQXVkaW9cbiAgJ3Nwb3RpZnkuY29tJzogJ011c2ljJyxcbiAgJ3NvdW5kY2xvdWQuY29tJzogJ011c2ljJyxcbiAgJ211c2ljLmFwcGxlLmNvbSc6ICdNdXNpYycsXG4gICdwYW5kb3JhLmNvbSc6ICdNdXNpYycsXG4gICd0aWRhbC5jb20nOiAnTXVzaWMnLFxuICAnYmFuZGNhbXAuY29tJzogJ011c2ljJyxcbiAgJ2F1ZGlibGUuY29tJzogJ011c2ljJyxcblxuICAvLyBHYW1pbmdcbiAgJ3N0ZWFtcG93ZXJlZC5jb20nOiAnR2FtaW5nJyxcbiAgJ3JvYmxveC5jb20nOiAnR2FtaW5nJyxcbiAgJ2VwaWNnYW1lcy5jb20nOiAnR2FtaW5nJyxcbiAgJ3hib3guY29tJzogJ0dhbWluZycsXG4gICdwbGF5c3RhdGlvbi5jb20nOiAnR2FtaW5nJyxcbiAgJ25pbnRlbmRvLmNvbSc6ICdHYW1pbmcnLFxuICAnaWduLmNvbSc6ICdHYW1pbmcnLFxuICAnZ2FtZXNwb3QuY29tJzogJ0dhbWluZycsXG4gICdrb3Rha3UuY29tJzogJ0dhbWluZycsXG4gICdwb2x5Z29uLmNvbSc6ICdHYW1pbmcnXG59O1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0R2VuZXJhKGhvc3RuYW1lOiBzdHJpbmcsIGN1c3RvbVJlZ2lzdHJ5PzogUmVjb3JkPHN0cmluZywgc3RyaW5nPik6IHN0cmluZyB8IG51bGwge1xuICBpZiAoIWhvc3RuYW1lKSByZXR1cm4gbnVsbDtcblxuICAvLyAwLiBDaGVjayBjdXN0b20gcmVnaXN0cnkgZmlyc3RcbiAgaWYgKGN1c3RvbVJlZ2lzdHJ5KSB7XG4gICAgICBjb25zdCBwYXJ0cyA9IGhvc3RuYW1lLnNwbGl0KCcuJyk7XG4gICAgICAvLyBDaGVjayBmdWxsIGhvc3RuYW1lIGFuZCBwcm9ncmVzc2l2ZWx5IHNob3J0ZXIgc3VmZml4ZXNcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGFydHMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICAgICAgY29uc3QgZG9tYWluID0gcGFydHMuc2xpY2UoaSkuam9pbignLicpO1xuICAgICAgICAgIGlmIChjdXN0b21SZWdpc3RyeVtkb21haW5dKSB7XG4gICAgICAgICAgICAgIHJldHVybiBjdXN0b21SZWdpc3RyeVtkb21haW5dO1xuICAgICAgICAgIH1cbiAgICAgIH1cbiAgfVxuXG4gIC8vIDEuIEV4YWN0IG1hdGNoXG4gIGlmIChHRU5FUkFfUkVHSVNUUllbaG9zdG5hbWVdKSB7XG4gICAgcmV0dXJuIEdFTkVSQV9SRUdJU1RSWVtob3N0bmFtZV07XG4gIH1cblxuICAvLyAyLiBTdWJkb21haW4gY2hlY2sgKHN0cmlwcGluZyBzdWJkb21haW5zKVxuICAvLyBlLmcuIFwiY29uc29sZS5hd3MuYW1hem9uLmNvbVwiIC0+IFwiYXdzLmFtYXpvbi5jb21cIiAtPiBcImFtYXpvbi5jb21cIlxuICBjb25zdCBwYXJ0cyA9IGhvc3RuYW1lLnNwbGl0KCcuJyk7XG5cbiAgLy8gVHJ5IG1hdGNoaW5nIHByb2dyZXNzaXZlbHkgc2hvcnRlciBzdWZmaXhlc1xuICAvLyBlLmcuIGEuYi5jLmNvbSAtPiBiLmMuY29tIC0+IGMuY29tXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcGFydHMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICBjb25zdCBkb21haW4gPSBwYXJ0cy5zbGljZShpKS5qb2luKCcuJyk7XG4gICAgICBpZiAoR0VORVJBX1JFR0lTVFJZW2RvbWFpbl0pIHtcbiAgICAgICAgICByZXR1cm4gR0VORVJBX1JFR0lTVFJZW2RvbWFpbl07XG4gICAgICB9XG4gIH1cblxuICByZXR1cm4gbnVsbDtcbn1cbiIsICJleHBvcnQgY29uc3QgZ2V0U3RvcmVkVmFsdWUgPSBhc3luYyA8VD4oa2V5OiBzdHJpbmcpOiBQcm9taXNlPFQgfCBudWxsPiA9PiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChrZXksIChpdGVtcykgPT4ge1xuICAgICAgcmVzb2x2ZSgoaXRlbXNba2V5XSBhcyBUKSA/PyBudWxsKTtcbiAgICB9KTtcbiAgfSk7XG59O1xuXG5leHBvcnQgY29uc3Qgc2V0U3RvcmVkVmFsdWUgPSBhc3luYyA8VD4oa2V5OiBzdHJpbmcsIHZhbHVlOiBUKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IFtrZXldOiB2YWx1ZSB9LCAoKSA9PiByZXNvbHZlKCkpO1xuICB9KTtcbn07XG4iLCAiaW1wb3J0IHsgQ3VzdG9tU3RyYXRlZ3ksIFByZWZlcmVuY2VzLCBTb3J0aW5nU3RyYXRlZ3kgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBnZXRTdG9yZWRWYWx1ZSwgc2V0U3RvcmVkVmFsdWUgfSBmcm9tIFwiLi9zdG9yYWdlLmpzXCI7XG5pbXBvcnQgeyBzZXRMb2dnZXJQcmVmZXJlbmNlcywgbG9nRGVidWcgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcblxuY29uc3QgUFJFRkVSRU5DRVNfS0VZID0gXCJwcmVmZXJlbmNlc1wiO1xuXG5leHBvcnQgY29uc3QgZGVmYXVsdFByZWZlcmVuY2VzOiBQcmVmZXJlbmNlcyA9IHtcbiAgc29ydGluZzogW1wicGlubmVkXCIsIFwicmVjZW5jeVwiXSxcbiAgZGVidWc6IGZhbHNlLFxuICBsb2dMZXZlbDogXCJpbmZvXCIsXG4gIHRoZW1lOiBcImRhcmtcIixcbiAgY3VzdG9tR2VuZXJhOiB7fVxufTtcblxuY29uc3Qgbm9ybWFsaXplU29ydGluZyA9IChzb3J0aW5nOiB1bmtub3duKTogU29ydGluZ1N0cmF0ZWd5W10gPT4ge1xuICBpZiAoQXJyYXkuaXNBcnJheShzb3J0aW5nKSkge1xuICAgIHJldHVybiBzb3J0aW5nLmZpbHRlcigodmFsdWUpOiB2YWx1ZSBpcyBTb3J0aW5nU3RyYXRlZ3kgPT4gdHlwZW9mIHZhbHVlID09PSBcInN0cmluZ1wiKTtcbiAgfVxuICBpZiAodHlwZW9mIHNvcnRpbmcgPT09IFwic3RyaW5nXCIpIHtcbiAgICByZXR1cm4gW3NvcnRpbmddO1xuICB9XG4gIHJldHVybiBbLi4uZGVmYXVsdFByZWZlcmVuY2VzLnNvcnRpbmddO1xufTtcblxuY29uc3Qgbm9ybWFsaXplU3RyYXRlZ2llcyA9IChzdHJhdGVnaWVzOiB1bmtub3duKTogQ3VzdG9tU3RyYXRlZ3lbXSA9PiB7XG4gICAgY29uc3QgYXJyID0gYXNBcnJheTxhbnk+KHN0cmF0ZWdpZXMpLmZpbHRlcihzID0+IHR5cGVvZiBzID09PSAnb2JqZWN0JyAmJiBzICE9PSBudWxsKTtcbiAgICByZXR1cm4gYXJyLm1hcChzID0+ICh7XG4gICAgICAgIC4uLnMsXG4gICAgICAgIGdyb3VwaW5nUnVsZXM6IGFzQXJyYXkocy5ncm91cGluZ1J1bGVzKSxcbiAgICAgICAgc29ydGluZ1J1bGVzOiBhc0FycmF5KHMuc29ydGluZ1J1bGVzKSxcbiAgICAgICAgZ3JvdXBTb3J0aW5nUnVsZXM6IHMuZ3JvdXBTb3J0aW5nUnVsZXMgPyBhc0FycmF5KHMuZ3JvdXBTb3J0aW5nUnVsZXMpIDogdW5kZWZpbmVkLFxuICAgICAgICBmaWx0ZXJzOiBzLmZpbHRlcnMgPyBhc0FycmF5KHMuZmlsdGVycykgOiB1bmRlZmluZWQsXG4gICAgICAgIGZpbHRlckdyb3Vwczogcy5maWx0ZXJHcm91cHMgPyBhc0FycmF5KHMuZmlsdGVyR3JvdXBzKS5tYXAoKGc6IGFueSkgPT4gYXNBcnJheShnKSkgOiB1bmRlZmluZWQsXG4gICAgICAgIHJ1bGVzOiBzLnJ1bGVzID8gYXNBcnJheShzLnJ1bGVzKSA6IHVuZGVmaW5lZFxuICAgIH0pKTtcbn07XG5cbmNvbnN0IG5vcm1hbGl6ZVByZWZlcmVuY2VzID0gKHByZWZzPzogUGFydGlhbDxQcmVmZXJlbmNlcz4gfCBudWxsKTogUHJlZmVyZW5jZXMgPT4ge1xuICBjb25zdCBtZXJnZWQgPSB7IC4uLmRlZmF1bHRQcmVmZXJlbmNlcywgLi4uKHByZWZzID8/IHt9KSB9O1xuICByZXR1cm4ge1xuICAgIC4uLm1lcmdlZCxcbiAgICBzb3J0aW5nOiBub3JtYWxpemVTb3J0aW5nKG1lcmdlZC5zb3J0aW5nKSxcbiAgICBjdXN0b21TdHJhdGVnaWVzOiBub3JtYWxpemVTdHJhdGVnaWVzKG1lcmdlZC5jdXN0b21TdHJhdGVnaWVzKVxuICB9O1xufTtcblxuZXhwb3J0IGNvbnN0IGxvYWRQcmVmZXJlbmNlcyA9IGFzeW5jICgpOiBQcm9taXNlPFByZWZlcmVuY2VzPiA9PiB7XG4gIGNvbnN0IHN0b3JlZCA9IGF3YWl0IGdldFN0b3JlZFZhbHVlPFByZWZlcmVuY2VzPihQUkVGRVJFTkNFU19LRVkpO1xuICBjb25zdCBtZXJnZWQgPSBub3JtYWxpemVQcmVmZXJlbmNlcyhzdG9yZWQgPz8gdW5kZWZpbmVkKTtcbiAgc2V0TG9nZ2VyUHJlZmVyZW5jZXMobWVyZ2VkKTtcbiAgcmV0dXJuIG1lcmdlZDtcbn07XG5cbmV4cG9ydCBjb25zdCBzYXZlUHJlZmVyZW5jZXMgPSBhc3luYyAocHJlZnM6IFBhcnRpYWw8UHJlZmVyZW5jZXM+KTogUHJvbWlzZTxQcmVmZXJlbmNlcz4gPT4ge1xuICBsb2dEZWJ1ZyhcIlVwZGF0aW5nIHByZWZlcmVuY2VzXCIsIHsga2V5czogT2JqZWN0LmtleXMocHJlZnMpIH0pO1xuICBjb25zdCBjdXJyZW50ID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gIGNvbnN0IG1lcmdlZCA9IG5vcm1hbGl6ZVByZWZlcmVuY2VzKHsgLi4uY3VycmVudCwgLi4ucHJlZnMgfSk7XG4gIGF3YWl0IHNldFN0b3JlZFZhbHVlKFBSRUZFUkVOQ0VTX0tFWSwgbWVyZ2VkKTtcbiAgc2V0TG9nZ2VyUHJlZmVyZW5jZXMobWVyZ2VkKTtcbiAgcmV0dXJuIG1lcmdlZDtcbn07XG4iLCAiaW1wb3J0IHsgUGFnZUNvbnRleHQsIFRhYk1ldGFkYXRhIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgbm9ybWFsaXplVXJsLCBwYXJzZVlvdVR1YmVVcmwsIGV4dHJhY3RZb3VUdWJlQ2hhbm5lbEZyb21IdG1sLCBleHRyYWN0WW91VHViZUdlbnJlRnJvbUh0bWwgfSBmcm9tIFwiLi9sb2dpYy5qc1wiO1xuaW1wb3J0IHsgZ2V0R2VuZXJhIH0gZnJvbSBcIi4vZ2VuZXJhUmVnaXN0cnkuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGxvYWRQcmVmZXJlbmNlcyB9IGZyb20gXCIuLi9wcmVmZXJlbmNlcy5qc1wiO1xuXG5pbnRlcmZhY2UgRXh0cmFjdGlvblJlc3BvbnNlIHtcbiAgZGF0YTogUGFnZUNvbnRleHQgfCBudWxsO1xuICBlcnJvcj86IHN0cmluZztcbiAgc3RhdHVzOlxuICAgIHwgJ09LJ1xuICAgIHwgJ1JFU1RSSUNURUQnXG4gICAgfCAnSU5KRUNUSU9OX0ZBSUxFRCdcbiAgICB8ICdOT19SRVNQT05TRSdcbiAgICB8ICdOT19IT1NUX1BFUk1JU1NJT04nXG4gICAgfCAnRlJBTUVfQUNDRVNTX0RFTklFRCc7XG59XG5cbi8vIFNpbXBsZSBjb25jdXJyZW5jeSBjb250cm9sXG5sZXQgYWN0aXZlRmV0Y2hlcyA9IDA7XG5jb25zdCBNQVhfQ09OQ1VSUkVOVF9GRVRDSEVTID0gNTsgLy8gQ29uc2VydmF0aXZlIGxpbWl0IHRvIGF2b2lkIHJhdGUgbGltaXRpbmdcbmNvbnN0IEZFVENIX1FVRVVFOiAoKCkgPT4gdm9pZClbXSA9IFtdO1xuXG5jb25zdCBmZXRjaFdpdGhUaW1lb3V0ID0gYXN5bmMgKHVybDogc3RyaW5nLCB0aW1lb3V0ID0gMjAwMCk6IFByb21pc2U8UmVzcG9uc2U+ID0+IHtcbiAgICBjb25zdCBjb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuICAgIGNvbnN0IGlkID0gc2V0VGltZW91dCgoKSA9PiBjb250cm9sbGVyLmFib3J0KCksIHRpbWVvdXQpO1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godXJsLCB7IHNpZ25hbDogY29udHJvbGxlci5zaWduYWwgfSk7XG4gICAgICAgIHJldHVybiByZXNwb25zZTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgICBjbGVhclRpbWVvdXQoaWQpO1xuICAgIH1cbn07XG5cbmNvbnN0IGVucXVldWVGZXRjaCA9IGFzeW5jIDxUPihmbjogKCkgPT4gUHJvbWlzZTxUPik6IFByb21pc2U8VD4gPT4ge1xuICAgIGlmIChhY3RpdmVGZXRjaGVzID49IE1BWF9DT05DVVJSRU5UX0ZFVENIRVMpIHtcbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBGRVRDSF9RVUVVRS5wdXNoKHJlc29sdmUpKTtcbiAgICB9XG4gICAgYWN0aXZlRmV0Y2hlcysrO1xuICAgIHRyeSB7XG4gICAgICAgIHJldHVybiBhd2FpdCBmbigpO1xuICAgIH0gZmluYWxseSB7XG4gICAgICAgIGFjdGl2ZUZldGNoZXMtLTtcbiAgICAgICAgaWYgKEZFVENIX1FVRVVFLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGNvbnN0IG5leHQgPSBGRVRDSF9RVUVVRS5zaGlmdCgpO1xuICAgICAgICAgICAgaWYgKG5leHQpIG5leHQoKTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbmV4cG9ydCBjb25zdCBleHRyYWN0UGFnZUNvbnRleHQgPSBhc3luYyAodGFiOiBUYWJNZXRhZGF0YSB8IGNocm9tZS50YWJzLlRhYik6IFByb21pc2U8RXh0cmFjdGlvblJlc3BvbnNlPiA9PiB7XG4gIHRyeSB7XG4gICAgaWYgKCF0YWIgfHwgIXRhYi51cmwpIHtcbiAgICAgICAgcmV0dXJuIHsgZGF0YTogbnVsbCwgZXJyb3I6IFwiVGFiIG5vdCBmb3VuZCBvciBubyBVUkxcIiwgc3RhdHVzOiAnTk9fUkVTUE9OU0UnIH07XG4gICAgfVxuXG4gICAgaWYgKFxuICAgICAgdGFiLnVybC5zdGFydHNXaXRoKCdjaHJvbWU6Ly8nKSB8fFxuICAgICAgdGFiLnVybC5zdGFydHNXaXRoKCdlZGdlOi8vJykgfHxcbiAgICAgIHRhYi51cmwuc3RhcnRzV2l0aCgnYWJvdXQ6JykgfHxcbiAgICAgIHRhYi51cmwuc3RhcnRzV2l0aCgnY2hyb21lLWV4dGVuc2lvbjovLycpIHx8XG4gICAgICB0YWIudXJsLnN0YXJ0c1dpdGgoJ2Nocm9tZS1lcnJvcjovLycpXG4gICAgKSB7XG4gICAgICAgIHJldHVybiB7IGRhdGE6IG51bGwsIGVycm9yOiBcIlJlc3RyaWN0ZWQgVVJMIHNjaGVtZVwiLCBzdGF0dXM6ICdSRVNUUklDVEVEJyB9O1xuICAgIH1cblxuICAgIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gICAgbGV0IGJhc2VsaW5lID0gYnVpbGRCYXNlbGluZUNvbnRleHQodGFiIGFzIGNocm9tZS50YWJzLlRhYiwgcHJlZnMuY3VzdG9tR2VuZXJhKTtcblxuICAgIC8vIEZldGNoIGFuZCBlbnJpY2ggZm9yIFlvdVR1YmUgaWYgYXV0aG9yIGlzIG1pc3NpbmcgYW5kIGl0IGlzIGEgdmlkZW9cbiAgICBjb25zdCB0YXJnZXRVcmwgPSB0YWIudXJsO1xuICAgIGNvbnN0IHVybE9iaiA9IG5ldyBVUkwodGFyZ2V0VXJsKTtcbiAgICBjb25zdCBob3N0bmFtZSA9IHVybE9iai5ob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgJycpO1xuICAgIGlmICgoaG9zdG5hbWUuZW5kc1dpdGgoJ3lvdXR1YmUuY29tJykgfHwgaG9zdG5hbWUuZW5kc1dpdGgoJ3lvdXR1LmJlJykpICYmICghYmFzZWxpbmUuYXV0aG9yT3JDcmVhdG9yIHx8IGJhc2VsaW5lLmdlbnJlID09PSAnVmlkZW8nKSkge1xuICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAvLyBXZSB1c2UgYSBxdWV1ZSB0byBwcmV2ZW50IGZsb29kaW5nIHJlcXVlc3RzXG4gICAgICAgICAgICAgYXdhaXQgZW5xdWV1ZUZldGNoKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaFdpdGhUaW1lb3V0KHRhcmdldFVybCk7XG4gICAgICAgICAgICAgICAgIGlmIChyZXNwb25zZS5vaykge1xuICAgICAgICAgICAgICAgICAgICAgY29uc3QgaHRtbCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNoYW5uZWwgPSBleHRyYWN0WW91VHViZUNoYW5uZWxGcm9tSHRtbChodG1sKTtcbiAgICAgICAgICAgICAgICAgICAgIGlmIChjaGFubmVsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgYmFzZWxpbmUuYXV0aG9yT3JDcmVhdG9yID0gY2hhbm5lbDtcbiAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGdlbnJlID0gZXh0cmFjdFlvdVR1YmVHZW5yZUZyb21IdG1sKGh0bWwpO1xuICAgICAgICAgICAgICAgICAgICAgaWYgKGdlbnJlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgYmFzZWxpbmUuZ2VucmUgPSBnZW5yZTtcbiAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgIH0pO1xuICAgICAgICAgfSBjYXRjaCAoZmV0Y2hFcnIpIHtcbiAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkZhaWxlZCB0byBmZXRjaCBZb3VUdWJlIHBhZ2UgY29udGVudFwiLCB7IGVycm9yOiBTdHJpbmcoZmV0Y2hFcnIpIH0pO1xuICAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBkYXRhOiBiYXNlbGluZSxcbiAgICAgIHN0YXR1czogJ09LJ1xuICAgIH07XG5cbiAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgbG9nRGVidWcoYEV4dHJhY3Rpb24gZmFpbGVkIGZvciB0YWIgJHt0YWIuaWR9YCwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgIHJldHVybiB7XG4gICAgICBkYXRhOiBudWxsLFxuICAgICAgZXJyb3I6IFN0cmluZyhlKSxcbiAgICAgIHN0YXR1czogJ0lOSkVDVElPTl9GQUlMRUQnXG4gICAgfTtcbiAgfVxufTtcblxuY29uc3QgYnVpbGRCYXNlbGluZUNvbnRleHQgPSAodGFiOiBjaHJvbWUudGFicy5UYWIsIGN1c3RvbUdlbmVyYT86IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pOiBQYWdlQ29udGV4dCA9PiB7XG4gIGNvbnN0IHVybCA9IHRhYi51cmwgfHwgXCJcIjtcbiAgbGV0IGhvc3RuYW1lID0gXCJcIjtcbiAgdHJ5IHtcbiAgICBob3N0bmFtZSA9IG5ldyBVUkwodXJsKS5ob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgJycpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgaG9zdG5hbWUgPSBcIlwiO1xuICB9XG5cbiAgLy8gRGV0ZXJtaW5lIE9iamVjdCBUeXBlIGZpcnN0XG4gIGxldCBvYmplY3RUeXBlOiBQYWdlQ29udGV4dFsnb2JqZWN0VHlwZSddID0gJ3Vua25vd24nO1xuICBsZXQgYXV0aG9yT3JDcmVhdG9yOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblxuICBpZiAodXJsLmluY2x1ZGVzKCcvbG9naW4nKSB8fCB1cmwuaW5jbHVkZXMoJy9zaWduaW4nKSkge1xuICAgICAgb2JqZWN0VHlwZSA9ICdsb2dpbic7XG4gIH0gZWxzZSBpZiAoaG9zdG5hbWUuaW5jbHVkZXMoJ3lvdXR1YmUuY29tJykgfHwgaG9zdG5hbWUuaW5jbHVkZXMoJ3lvdXR1LmJlJykpIHtcbiAgICAgIGNvbnN0IHsgdmlkZW9JZCB9ID0gcGFyc2VZb3VUdWJlVXJsKHVybCk7XG4gICAgICBpZiAodmlkZW9JZCkgb2JqZWN0VHlwZSA9ICd2aWRlbyc7XG5cbiAgICAgIC8vIFRyeSB0byBndWVzcyBjaGFubmVsIGZyb20gVVJMIGlmIHBvc3NpYmxlXG4gICAgICBpZiAodXJsLmluY2x1ZGVzKCcvQCcpKSB7XG4gICAgICAgICAgY29uc3QgcGFydHMgPSB1cmwuc3BsaXQoJy9AJyk7XG4gICAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgY29uc3QgaGFuZGxlID0gcGFydHNbMV0uc3BsaXQoJy8nKVswXTtcbiAgICAgICAgICAgICAgYXV0aG9yT3JDcmVhdG9yID0gJ0AnICsgaGFuZGxlO1xuICAgICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodXJsLmluY2x1ZGVzKCcvYy8nKSkge1xuICAgICAgICAgIGNvbnN0IHBhcnRzID0gdXJsLnNwbGl0KCcvYy8nKTtcbiAgICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICBhdXRob3JPckNyZWF0b3IgPSBkZWNvZGVVUklDb21wb25lbnQocGFydHNbMV0uc3BsaXQoJy8nKVswXSk7XG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICh1cmwuaW5jbHVkZXMoJy91c2VyLycpKSB7XG4gICAgICAgICAgY29uc3QgcGFydHMgPSB1cmwuc3BsaXQoJy91c2VyLycpO1xuICAgICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgIGF1dGhvck9yQ3JlYXRvciA9IGRlY29kZVVSSUNvbXBvbmVudChwYXJ0c1sxXS5zcGxpdCgnLycpWzBdKTtcbiAgICAgICAgICB9XG4gICAgICB9XG4gIH0gZWxzZSBpZiAoaG9zdG5hbWUgPT09ICdnaXRodWIuY29tJyAmJiB1cmwuaW5jbHVkZXMoJy9wdWxsLycpKSB7XG4gICAgICBvYmplY3RUeXBlID0gJ3RpY2tldCc7XG4gIH0gZWxzZSBpZiAoaG9zdG5hbWUgPT09ICdnaXRodWIuY29tJyAmJiAhdXJsLmluY2x1ZGVzKCcvcHVsbC8nKSAmJiB1cmwuc3BsaXQoJy8nKS5sZW5ndGggPj0gNSkge1xuICAgICAgLy8gcm91Z2ggY2hlY2sgZm9yIHJlcG9cbiAgICAgIG9iamVjdFR5cGUgPSAncmVwbyc7XG4gIH1cblxuICAvLyBEZXRlcm1pbmUgR2VucmVcbiAgLy8gUHJpb3JpdHkgMTogU2l0ZS1zcGVjaWZpYyBleHRyYWN0aW9uIChkZXJpdmVkIGZyb20gb2JqZWN0VHlwZSlcbiAgbGV0IGdlbnJlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbiAgaWYgKG9iamVjdFR5cGUgPT09ICd2aWRlbycpIGdlbnJlID0gJ1ZpZGVvJztcbiAgZWxzZSBpZiAob2JqZWN0VHlwZSA9PT0gJ3JlcG8nIHx8IG9iamVjdFR5cGUgPT09ICd0aWNrZXQnKSBnZW5yZSA9ICdEZXZlbG9wbWVudCc7XG5cbiAgLy8gUHJpb3JpdHkgMjogRmFsbGJhY2sgdG8gUmVnaXN0cnlcbiAgaWYgKCFnZW5yZSkge1xuICAgICBnZW5yZSA9IGdldEdlbmVyYShob3N0bmFtZSwgY3VzdG9tR2VuZXJhKSB8fCB1bmRlZmluZWQ7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNhbm9uaWNhbFVybDogdXJsIHx8IG51bGwsXG4gICAgbm9ybWFsaXplZFVybDogbm9ybWFsaXplVXJsKHVybCksXG4gICAgc2l0ZU5hbWU6IGhvc3RuYW1lIHx8IG51bGwsXG4gICAgcGxhdGZvcm06IGhvc3RuYW1lIHx8IG51bGwsXG4gICAgb2JqZWN0VHlwZSxcbiAgICBvYmplY3RJZDogdXJsIHx8IG51bGwsXG4gICAgdGl0bGU6IHRhYi50aXRsZSB8fCBudWxsLFxuICAgIGdlbnJlLFxuICAgIGRlc2NyaXB0aW9uOiBudWxsLFxuICAgIGF1dGhvck9yQ3JlYXRvcjogYXV0aG9yT3JDcmVhdG9yLFxuICAgIHB1Ymxpc2hlZEF0OiBudWxsLFxuICAgIG1vZGlmaWVkQXQ6IG51bGwsXG4gICAgbGFuZ3VhZ2U6IG51bGwsXG4gICAgdGFnczogW10sXG4gICAgYnJlYWRjcnVtYnM6IFtdLFxuICAgIGlzQXVkaWJsZTogZmFsc2UsXG4gICAgaXNNdXRlZDogZmFsc2UsXG4gICAgaXNDYXB0dXJpbmc6IGZhbHNlLFxuICAgIHByb2dyZXNzOiBudWxsLFxuICAgIGhhc1Vuc2F2ZWRDaGFuZ2VzTGlrZWx5OiBmYWxzZSxcbiAgICBpc0F1dGhlbnRpY2F0ZWRMaWtlbHk6IGZhbHNlLFxuICAgIHNvdXJjZXM6IHtcbiAgICAgIGNhbm9uaWNhbFVybDogJ3VybCcsXG4gICAgICBub3JtYWxpemVkVXJsOiAndXJsJyxcbiAgICAgIHNpdGVOYW1lOiAndXJsJyxcbiAgICAgIHBsYXRmb3JtOiAndXJsJyxcbiAgICAgIG9iamVjdFR5cGU6ICd1cmwnLFxuICAgICAgdGl0bGU6IHRhYi50aXRsZSA/ICd0YWInIDogJ3VybCcsXG4gICAgICBnZW5yZTogJ3JlZ2lzdHJ5J1xuICAgIH0sXG4gICAgY29uZmlkZW5jZToge31cbiAgfTtcbn07XG4iLCAiaW1wb3J0IHsgVGFiTWV0YWRhdGEsIFBhZ2VDb250ZXh0IH0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcsIGxvZ0Vycm9yIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGV4dHJhY3RQYWdlQ29udGV4dCB9IGZyb20gXCIuL2V4dHJhY3Rpb24vaW5kZXguanNcIjtcblxuZXhwb3J0IGludGVyZmFjZSBDb250ZXh0UmVzdWx0IHtcbiAgY29udGV4dDogc3RyaW5nO1xuICBzb3VyY2U6ICdBSScgfCAnSGV1cmlzdGljJyB8ICdFeHRyYWN0aW9uJztcbiAgZGF0YT86IFBhZ2VDb250ZXh0O1xuICBlcnJvcj86IHN0cmluZztcbiAgc3RhdHVzPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgQ2FjaGVFbnRyeSB7XG4gIHJlc3VsdDogQ29udGV4dFJlc3VsdDtcbiAgdGltZXN0YW1wOiBudW1iZXI7XG59XG5cbmNvbnN0IGNvbnRleHRDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBDYWNoZUVudHJ5PigpO1xuY29uc3QgQ0FDSEVfVFRMX1NVQ0NFU1MgPSAyNCAqIDYwICogNjAgKiAxMDAwOyAvLyAyNCBob3Vyc1xuY29uc3QgQ0FDSEVfVFRMX0VSUk9SID0gNSAqIDYwICogMTAwMDsgLy8gNSBtaW51dGVzXG5cbmV4cG9ydCBjb25zdCBhbmFseXplVGFiQ29udGV4dCA9IGFzeW5jIChcbiAgdGFiczogVGFiTWV0YWRhdGFbXSxcbiAgb25Qcm9ncmVzcz86IChjb21wbGV0ZWQ6IG51bWJlciwgdG90YWw6IG51bWJlcikgPT4gdm9pZFxuKTogUHJvbWlzZTxNYXA8bnVtYmVyLCBDb250ZXh0UmVzdWx0Pj4gPT4ge1xuICBjb25zdCBjb250ZXh0TWFwID0gbmV3IE1hcDxudW1iZXIsIENvbnRleHRSZXN1bHQ+KCk7XG4gIGxldCBjb21wbGV0ZWQgPSAwO1xuICBjb25zdCB0b3RhbCA9IHRhYnMubGVuZ3RoO1xuXG4gIGNvbnN0IHByb21pc2VzID0gdGFicy5tYXAoYXN5bmMgKHRhYikgPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBjYWNoZUtleSA9IGAke3RhYi5pZH06OiR7dGFiLnVybH1gO1xuICAgICAgY29uc3QgY2FjaGVkID0gY29udGV4dENhY2hlLmdldChjYWNoZUtleSk7XG5cbiAgICAgIGlmIChjYWNoZWQpIHtcbiAgICAgICAgY29uc3QgaXNFcnJvciA9IGNhY2hlZC5yZXN1bHQuc3RhdHVzID09PSAnRVJST1InIHx8ICEhY2FjaGVkLnJlc3VsdC5lcnJvcjtcbiAgICAgICAgY29uc3QgdHRsID0gaXNFcnJvciA/IENBQ0hFX1RUTF9FUlJPUiA6IENBQ0hFX1RUTF9TVUNDRVNTO1xuXG4gICAgICAgIGlmIChEYXRlLm5vdygpIC0gY2FjaGVkLnRpbWVzdGFtcCA8IHR0bCkge1xuICAgICAgICAgIGNvbnRleHRNYXAuc2V0KHRhYi5pZCwgY2FjaGVkLnJlc3VsdCk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnRleHRDYWNoZS5kZWxldGUoY2FjaGVLZXkpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZldGNoQ29udGV4dEZvclRhYih0YWIpO1xuXG4gICAgICAvLyBDYWNoZSB3aXRoIGV4cGlyYXRpb24gbG9naWNcbiAgICAgIGNvbnRleHRDYWNoZS5zZXQoY2FjaGVLZXksIHtcbiAgICAgICAgcmVzdWx0LFxuICAgICAgICB0aW1lc3RhbXA6IERhdGUubm93KClcbiAgICAgIH0pO1xuXG4gICAgICBjb250ZXh0TWFwLnNldCh0YWIuaWQsIHJlc3VsdCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ0Vycm9yKGBGYWlsZWQgdG8gYW5hbHl6ZSBjb250ZXh0IGZvciB0YWIgJHt0YWIuaWR9YCwgeyBlcnJvcjogU3RyaW5nKGVycm9yKSB9KTtcbiAgICAgIC8vIEV2ZW4gaWYgZmV0Y2hDb250ZXh0Rm9yVGFiIGZhaWxzIGNvbXBsZXRlbHksIHdlIHRyeSBhIHNhZmUgc3luYyBmYWxsYmFja1xuICAgICAgY29udGV4dE1hcC5zZXQodGFiLmlkLCB7IGNvbnRleHQ6IFwiVW5jYXRlZ29yaXplZFwiLCBzb3VyY2U6ICdIZXVyaXN0aWMnLCBlcnJvcjogU3RyaW5nKGVycm9yKSwgc3RhdHVzOiAnRVJST1InIH0pO1xuICAgIH0gZmluYWxseSB7XG4gICAgICBjb21wbGV0ZWQrKztcbiAgICAgIGlmIChvblByb2dyZXNzKSBvblByb2dyZXNzKGNvbXBsZXRlZCwgdG90YWwpO1xuICAgIH1cbiAgfSk7XG5cbiAgYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICByZXR1cm4gY29udGV4dE1hcDtcbn07XG5cbmNvbnN0IGZldGNoQ29udGV4dEZvclRhYiA9IGFzeW5jICh0YWI6IFRhYk1ldGFkYXRhKTogUHJvbWlzZTxDb250ZXh0UmVzdWx0PiA9PiB7XG4gIC8vIDEuIFJ1biBHZW5lcmljIEV4dHJhY3Rpb24gKEFsd2F5cylcbiAgbGV0IGRhdGE6IFBhZ2VDb250ZXh0IHwgbnVsbCA9IG51bGw7XG4gIGxldCBlcnJvcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICBsZXQgc3RhdHVzOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbiAgdHJ5IHtcbiAgICAgIGNvbnN0IGV4dHJhY3Rpb24gPSBhd2FpdCBleHRyYWN0UGFnZUNvbnRleHQodGFiKTtcbiAgICAgIGRhdGEgPSBleHRyYWN0aW9uLmRhdGE7XG4gICAgICBlcnJvciA9IGV4dHJhY3Rpb24uZXJyb3I7XG4gICAgICBzdGF0dXMgPSBleHRyYWN0aW9uLnN0YXR1cztcbiAgfSBjYXRjaCAoZSkge1xuICAgICAgbG9nRGVidWcoYEV4dHJhY3Rpb24gZmFpbGVkIGZvciB0YWIgJHt0YWIuaWR9YCwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgZXJyb3IgPSBTdHJpbmcoZSk7XG4gICAgICBzdGF0dXMgPSAnRVJST1InO1xuICB9XG5cbiAgbGV0IGNvbnRleHQgPSBcIlVuY2F0ZWdvcml6ZWRcIjtcbiAgbGV0IHNvdXJjZTogQ29udGV4dFJlc3VsdFsnc291cmNlJ10gPSAnSGV1cmlzdGljJztcblxuICAvLyAyLiBUcnkgdG8gRGV0ZXJtaW5lIENhdGVnb3J5IGZyb20gRXh0cmFjdGlvbiBEYXRhXG4gIGlmIChkYXRhKSB7XG4gICAgICBpZiAoZGF0YS5wbGF0Zm9ybSA9PT0gJ1lvdVR1YmUnIHx8IGRhdGEucGxhdGZvcm0gPT09ICdOZXRmbGl4JyB8fCBkYXRhLnBsYXRmb3JtID09PSAnU3BvdGlmeScgfHwgZGF0YS5wbGF0Zm9ybSA9PT0gJ1R3aXRjaCcpIHtcbiAgICAgICAgICBjb250ZXh0ID0gXCJFbnRlcnRhaW5tZW50XCI7XG4gICAgICAgICAgc291cmNlID0gJ0V4dHJhY3Rpb24nO1xuICAgICAgfSBlbHNlIGlmIChkYXRhLnBsYXRmb3JtID09PSAnR2l0SHViJyB8fCBkYXRhLnBsYXRmb3JtID09PSAnU3RhY2sgT3ZlcmZsb3cnIHx8IGRhdGEucGxhdGZvcm0gPT09ICdKaXJhJyB8fCBkYXRhLnBsYXRmb3JtID09PSAnR2l0TGFiJykge1xuICAgICAgICAgIGNvbnRleHQgPSBcIkRldmVsb3BtZW50XCI7XG4gICAgICAgICAgc291cmNlID0gJ0V4dHJhY3Rpb24nO1xuICAgICAgfSBlbHNlIGlmIChkYXRhLnBsYXRmb3JtID09PSAnR29vZ2xlJyAmJiAoZGF0YS5ub3JtYWxpemVkVXJsLmluY2x1ZGVzKCdkb2NzJykgfHwgZGF0YS5ub3JtYWxpemVkVXJsLmluY2x1ZGVzKCdzaGVldHMnKSB8fCBkYXRhLm5vcm1hbGl6ZWRVcmwuaW5jbHVkZXMoJ3NsaWRlcycpKSkge1xuICAgICAgICAgIGNvbnRleHQgPSBcIldvcmtcIjtcbiAgICAgICAgICBzb3VyY2UgPSAnRXh0cmFjdGlvbic7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBJZiB3ZSBoYXZlIHN1Y2Nlc3NmdWwgZXh0cmFjdGlvbiBkYXRhIGJ1dCBubyBzcGVjaWZpYyBydWxlIG1hdGNoZWQsXG4gICAgICAgIC8vIHVzZSB0aGUgT2JqZWN0IFR5cGUgb3IgZ2VuZXJpYyBcIkdlbmVyYWwgV2ViXCIgdG8gaW5kaWNhdGUgZXh0cmFjdGlvbiB3b3JrZWQuXG4gICAgICAgIC8vIFdlIHByZWZlciBzcGVjaWZpYyBjYXRlZ29yaWVzLCBidXQgXCJBcnRpY2xlXCIgb3IgXCJWaWRlb1wiIGFyZSBiZXR0ZXIgdGhhbiBcIlVuY2F0ZWdvcml6ZWRcIi5cbiAgICAgICAgaWYgKGRhdGEub2JqZWN0VHlwZSAmJiBkYXRhLm9iamVjdFR5cGUgIT09ICd1bmtub3duJykge1xuICAgICAgICAgICAgIC8vIE1hcCBvYmplY3QgdHlwZXMgdG8gY2F0ZWdvcmllcyBpZiBwb3NzaWJsZVxuICAgICAgICAgICAgIGlmIChkYXRhLm9iamVjdFR5cGUgPT09ICd2aWRlbycpIGNvbnRleHQgPSAnRW50ZXJ0YWlubWVudCc7XG4gICAgICAgICAgICAgZWxzZSBpZiAoZGF0YS5vYmplY3RUeXBlID09PSAnYXJ0aWNsZScpIGNvbnRleHQgPSAnTmV3cyc7IC8vIExvb3NlIG1hcHBpbmcsIGJ1dCBiZXR0ZXIgdGhhbiBub3RoaW5nXG4gICAgICAgICAgICAgZWxzZSBjb250ZXh0ID0gZGF0YS5vYmplY3RUeXBlLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgZGF0YS5vYmplY3RUeXBlLnNsaWNlKDEpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgIGNvbnRleHQgPSBcIkdlbmVyYWwgV2ViXCI7XG4gICAgICAgIH1cbiAgICAgICAgc291cmNlID0gJ0V4dHJhY3Rpb24nO1xuICAgICAgfVxuICB9XG5cbiAgLy8gMy4gRmFsbGJhY2sgdG8gTG9jYWwgSGV1cmlzdGljIChVUkwgUmVnZXgpXG4gIGlmIChjb250ZXh0ID09PSBcIlVuY2F0ZWdvcml6ZWRcIikge1xuICAgICAgY29uc3QgaCA9IGF3YWl0IGxvY2FsSGV1cmlzdGljKHRhYik7XG4gICAgICBpZiAoaC5jb250ZXh0ICE9PSBcIlVuY2F0ZWdvcml6ZWRcIikge1xuICAgICAgICAgIGNvbnRleHQgPSBoLmNvbnRleHQ7XG4gICAgICAgICAgLy8gc291cmNlIHJlbWFpbnMgJ0hldXJpc3RpYycgKG9yIG1heWJlIHdlIHNob3VsZCBzYXkgJ0hldXJpc3RpYycgaXMgdGhlIHNvdXJjZT8pXG4gICAgICAgICAgLy8gVGhlIGxvY2FsSGV1cmlzdGljIGZ1bmN0aW9uIHJldHVybnMgeyBzb3VyY2U6ICdIZXVyaXN0aWMnIH1cbiAgICAgIH1cbiAgfVxuXG4gIC8vIDQuIEZhbGxiYWNrIHRvIEFJIChMTE0pIC0gUkVNT1ZFRFxuICAvLyBUaGUgSHVnZ2luZ0ZhY2UgQVBJIGVuZHBvaW50IGlzIDQxMCBHb25lIGFuZC9vciByZXF1aXJlcyBhdXRoZW50aWNhdGlvbiB3aGljaCB3ZSBkbyBub3QgaGF2ZS5cbiAgLy8gVGhlIGNvZGUgaGFzIGJlZW4gcmVtb3ZlZCB0byBwcmV2ZW50IGVycm9ycy5cblxuICBpZiAoY29udGV4dCAhPT0gXCJVbmNhdGVnb3JpemVkXCIgJiYgc291cmNlICE9PSBcIkV4dHJhY3Rpb25cIikge1xuICAgIGVycm9yID0gdW5kZWZpbmVkO1xuICAgIHN0YXR1cyA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gIHJldHVybiB7IGNvbnRleHQsIHNvdXJjZSwgZGF0YTogZGF0YSB8fCB1bmRlZmluZWQsIGVycm9yLCBzdGF0dXMgfTtcbn07XG5cbmNvbnN0IGxvY2FsSGV1cmlzdGljID0gYXN5bmMgKHRhYjogVGFiTWV0YWRhdGEpOiBQcm9taXNlPENvbnRleHRSZXN1bHQ+ID0+IHtcbiAgY29uc3QgdXJsID0gdGFiLnVybC50b0xvd2VyQ2FzZSgpO1xuICBsZXQgY29udGV4dCA9IFwiVW5jYXRlZ29yaXplZFwiO1xuXG4gIGlmICh1cmwuaW5jbHVkZXMoXCJnaXRodWJcIikgfHwgdXJsLmluY2x1ZGVzKFwic3RhY2tvdmVyZmxvd1wiKSB8fCB1cmwuaW5jbHVkZXMoXCJsb2NhbGhvc3RcIikgfHwgdXJsLmluY2x1ZGVzKFwiamlyYVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJnaXRsYWJcIikpIGNvbnRleHQgPSBcIkRldmVsb3BtZW50XCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcImdvb2dsZVwiKSAmJiAodXJsLmluY2x1ZGVzKFwiZG9jc1wiKSB8fCB1cmwuaW5jbHVkZXMoXCJzaGVldHNcIikgfHwgdXJsLmluY2x1ZGVzKFwic2xpZGVzXCIpKSkgY29udGV4dCA9IFwiV29ya1wiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJsaW5rZWRpblwiKSB8fCB1cmwuaW5jbHVkZXMoXCJzbGFja1wiKSB8fCB1cmwuaW5jbHVkZXMoXCJ6b29tXCIpIHx8IHVybC5pbmNsdWRlcyhcInRlYW1zXCIpKSBjb250ZXh0ID0gXCJXb3JrXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcIm5ldGZsaXhcIikgfHwgdXJsLmluY2x1ZGVzKFwic3BvdGlmeVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJodWx1XCIpIHx8IHVybC5pbmNsdWRlcyhcImRpc25leVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJ5b3V0dWJlXCIpKSBjb250ZXh0ID0gXCJFbnRlcnRhaW5tZW50XCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcInR3aXR0ZXJcIikgfHwgdXJsLmluY2x1ZGVzKFwiZmFjZWJvb2tcIikgfHwgdXJsLmluY2x1ZGVzKFwiaW5zdGFncmFtXCIpIHx8IHVybC5pbmNsdWRlcyhcInJlZGRpdFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJ0aWt0b2tcIikgfHwgdXJsLmluY2x1ZGVzKFwicGludGVyZXN0XCIpKSBjb250ZXh0ID0gXCJTb2NpYWxcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwiYW1hem9uXCIpIHx8IHVybC5pbmNsdWRlcyhcImViYXlcIikgfHwgdXJsLmluY2x1ZGVzKFwid2FsbWFydFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJ0YXJnZXRcIikgfHwgdXJsLmluY2x1ZGVzKFwic2hvcGlmeVwiKSkgY29udGV4dCA9IFwiU2hvcHBpbmdcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwiY25uXCIpIHx8IHVybC5pbmNsdWRlcyhcImJiY1wiKSB8fCB1cmwuaW5jbHVkZXMoXCJueXRpbWVzXCIpIHx8IHVybC5pbmNsdWRlcyhcIndhc2hpbmd0b25wb3N0XCIpIHx8IHVybC5pbmNsdWRlcyhcImZveG5ld3NcIikpIGNvbnRleHQgPSBcIk5ld3NcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwiY291cnNlcmFcIikgfHwgdXJsLmluY2x1ZGVzKFwidWRlbXlcIikgfHwgdXJsLmluY2x1ZGVzKFwiZWR4XCIpIHx8IHVybC5pbmNsdWRlcyhcImtoYW5hY2FkZW15XCIpIHx8IHVybC5pbmNsdWRlcyhcImNhbnZhc1wiKSkgY29udGV4dCA9IFwiRWR1Y2F0aW9uXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcImV4cGVkaWFcIikgfHwgdXJsLmluY2x1ZGVzKFwiYm9va2luZ1wiKSB8fCB1cmwuaW5jbHVkZXMoXCJhaXJibmJcIikgfHwgdXJsLmluY2x1ZGVzKFwidHJpcGFkdmlzb3JcIikgfHwgdXJsLmluY2x1ZGVzKFwia2F5YWtcIikpIGNvbnRleHQgPSBcIlRyYXZlbFwiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJ3ZWJtZFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJtYXlvY2xpbmljXCIpIHx8IHVybC5pbmNsdWRlcyhcIm5paC5nb3ZcIikgfHwgdXJsLmluY2x1ZGVzKFwiaGVhbHRoXCIpKSBjb250ZXh0ID0gXCJIZWFsdGhcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwiZXNwblwiKSB8fCB1cmwuaW5jbHVkZXMoXCJuYmFcIikgfHwgdXJsLmluY2x1ZGVzKFwibmZsXCIpIHx8IHVybC5pbmNsdWRlcyhcIm1sYlwiKSB8fCB1cmwuaW5jbHVkZXMoXCJmaWZhXCIpKSBjb250ZXh0ID0gXCJTcG9ydHNcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwidGVjaGNydW5jaFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJ3aXJlZFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJ0aGV2ZXJnZVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJhcnN0ZWNobmljYVwiKSkgY29udGV4dCA9IFwiVGVjaG5vbG9neVwiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJzY2llbmNlXCIpIHx8IHVybC5pbmNsdWRlcyhcIm5hdHVyZS5jb21cIikgfHwgdXJsLmluY2x1ZGVzKFwibmFzYS5nb3ZcIikpIGNvbnRleHQgPSBcIlNjaWVuY2VcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwidHdpdGNoXCIpIHx8IHVybC5pbmNsdWRlcyhcInN0ZWFtXCIpIHx8IHVybC5pbmNsdWRlcyhcInJvYmxveFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJpZ25cIikgfHwgdXJsLmluY2x1ZGVzKFwiZ2FtZXNwb3RcIikpIGNvbnRleHQgPSBcIkdhbWluZ1wiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJzb3VuZGNsb3VkXCIpIHx8IHVybC5pbmNsdWRlcyhcImJhbmRjYW1wXCIpIHx8IHVybC5pbmNsdWRlcyhcImxhc3QuZm1cIikpIGNvbnRleHQgPSBcIk11c2ljXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcImRldmlhbnRhcnRcIikgfHwgdXJsLmluY2x1ZGVzKFwiYmVoYW5jZVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJkcmliYmJsZVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJhcnRzdGF0aW9uXCIpKSBjb250ZXh0ID0gXCJBcnRcIjtcblxuICByZXR1cm4geyBjb250ZXh0LCBzb3VyY2U6ICdIZXVyaXN0aWMnIH07XG59O1xuIiwgImltcG9ydCB7IGdyb3VwVGFicywgZ2V0Q3VzdG9tU3RyYXRlZ2llcywgZ2V0RmllbGRWYWx1ZSwgcmVxdWlyZXNDb250ZXh0QW5hbHlzaXMgfSBmcm9tIFwiLi9ncm91cGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IHNvcnRUYWJzLCBjb21wYXJlQnkgfSBmcm9tIFwiLi9zb3J0aW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgYW5hbHl6ZVRhYkNvbnRleHQgfSBmcm9tIFwiLi9jb250ZXh0QW5hbHlzaXMuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnLCBsb2dFcnJvciwgbG9nSW5mbyB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBHcm91cGluZ1NlbGVjdGlvbiwgUHJlZmVyZW5jZXMsIFRhYkdyb3VwLCBUYWJNZXRhZGF0YSwgU29ydGluZ1J1bGUgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBnZXRTdG9yZWRWYWx1ZSwgc2V0U3RvcmVkVmFsdWUgfSBmcm9tIFwiLi9zdG9yYWdlLmpzXCI7XG5pbXBvcnQgeyBtYXBDaHJvbWVUYWIsIGFzQXJyYXkgfSBmcm9tIFwiLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5cbmNvbnN0IGdldFRhYnNGb3JGaWx0ZXIgPSBhc3luYyAoZmlsdGVyPzogR3JvdXBpbmdTZWxlY3Rpb24pOiBQcm9taXNlPGNocm9tZS50YWJzLlRhYltdPiA9PiB7XG4gIGNvbnN0IHdpbmRvd0lkcyA9IGZpbHRlcj8ud2luZG93SWRzO1xuICBjb25zdCB0YWJJZHMgPSBmaWx0ZXI/LnRhYklkcztcbiAgY29uc3QgaGFzV2luZG93SWRzID0gd2luZG93SWRzICYmIHdpbmRvd0lkcy5sZW5ndGggPiAwO1xuICBjb25zdCBoYXNUYWJJZHMgPSB0YWJJZHMgJiYgdGFiSWRzLmxlbmd0aCA+IDA7XG5cbiAgaWYgKCFmaWx0ZXIgfHwgKCFoYXNXaW5kb3dJZHMgJiYgIWhhc1RhYklkcykpIHtcbiAgICByZXR1cm4gY2hyb21lLnRhYnMucXVlcnkoe30pO1xuICB9XG5cbiAgY29uc3QgcHJvbWlzZXM6IFByb21pc2U8YW55PltdID0gW107XG5cbiAgaWYgKGhhc1dpbmRvd0lkcykge1xuICAgIHdpbmRvd0lkcy5mb3JFYWNoKHdpbmRvd0lkID0+IHtcbiAgICAgIHByb21pc2VzLnB1c2goY2hyb21lLnRhYnMucXVlcnkoeyB3aW5kb3dJZCB9KS5jYXRjaCgoKSA9PiBbXSkpO1xuICAgIH0pO1xuICB9XG5cbiAgaWYgKGhhc1RhYklkcykge1xuICAgIHRhYklkcy5mb3JFYWNoKHRhYklkID0+IHtcbiAgICAgIHByb21pc2VzLnB1c2goY2hyb21lLnRhYnMuZ2V0KHRhYklkKS5jYXRjaCgoKSA9PiBudWxsKSk7XG4gICAgfSk7XG4gIH1cblxuICBjb25zdCByZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuXG4gIC8vIEZsYXR0ZW4gYW5kIGZpbHRlciBvdXQgbnVsbHNcbiAgY29uc3QgYWxsVGFiczogY2hyb21lLnRhYnMuVGFiW10gPSBbXTtcbiAgZm9yIChjb25zdCByZXMgb2YgcmVzdWx0cykge1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkocmVzKSkge1xuICAgICAgICAgIGFsbFRhYnMucHVzaCguLi5yZXMpO1xuICAgICAgfSBlbHNlIGlmIChyZXMpIHtcbiAgICAgICAgICBhbGxUYWJzLnB1c2gocmVzKTtcbiAgICAgIH1cbiAgfVxuXG4gIC8vIERlZHVwbGljYXRlIGJ5IElEXG4gIGNvbnN0IHVuaXF1ZVRhYnMgPSBuZXcgTWFwPG51bWJlciwgY2hyb21lLnRhYnMuVGFiPigpO1xuICBmb3IgKGNvbnN0IHRhYiBvZiBhbGxUYWJzKSB7XG4gICAgICBpZiAodGFiLmlkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICB1bmlxdWVUYWJzLnNldCh0YWIuaWQsIHRhYik7XG4gICAgICB9XG4gIH1cblxuICByZXR1cm4gQXJyYXkuZnJvbSh1bmlxdWVUYWJzLnZhbHVlcygpKTtcbn07XG5cbmV4cG9ydCBjb25zdCBmZXRjaEN1cnJlbnRUYWJHcm91cHMgPSBhc3luYyAoXG4gIHByZWZlcmVuY2VzOiBQcmVmZXJlbmNlcyxcbiAgb25Qcm9ncmVzcz86IChjb21wbGV0ZWQ6IG51bWJlciwgdG90YWw6IG51bWJlcikgPT4gdm9pZFxuKTogUHJvbWlzZTxUYWJHcm91cFtdPiA9PiB7XG4gIHRyeSB7XG4gIGNvbnN0IHRhYnMgPSBhd2FpdCBjaHJvbWUudGFicy5xdWVyeSh7fSk7XG4gIGNvbnN0IGdyb3VwcyA9IGF3YWl0IGNocm9tZS50YWJHcm91cHMucXVlcnkoe30pO1xuICBjb25zdCBncm91cE1hcCA9IG5ldyBNYXAoZ3JvdXBzLm1hcChnID0+IFtnLmlkLCBnXSkpO1xuXG4gIC8vIE1hcCB0YWJzIHRvIG1ldGFkYXRhXG4gIGNvbnN0IG1hcHBlZCA9IHRhYnMubWFwKG1hcENocm9tZVRhYikuZmlsdGVyKCh0KTogdCBpcyBUYWJNZXRhZGF0YSA9PiBCb29sZWFuKHQpKTtcblxuICBpZiAocmVxdWlyZXNDb250ZXh0QW5hbHlzaXMocHJlZmVyZW5jZXMuc29ydGluZykpIHtcbiAgICAgIGNvbnN0IGNvbnRleHRNYXAgPSBhd2FpdCBhbmFseXplVGFiQ29udGV4dChtYXBwZWQsIG9uUHJvZ3Jlc3MpO1xuICAgICAgbWFwcGVkLmZvckVhY2godGFiID0+IHtcbiAgICAgICAgY29uc3QgcmVzID0gY29udGV4dE1hcC5nZXQodGFiLmlkKTtcbiAgICAgICAgdGFiLmNvbnRleHQgPSByZXM/LmNvbnRleHQ7XG4gICAgICAgIHRhYi5jb250ZXh0RGF0YSA9IHJlcz8uZGF0YTtcbiAgICAgIH0pO1xuICB9XG5cbiAgY29uc3QgcmVzdWx0R3JvdXBzOiBUYWJHcm91cFtdID0gW107XG4gIGNvbnN0IHRhYnNCeUdyb3VwSWQgPSBuZXcgTWFwPG51bWJlciwgVGFiTWV0YWRhdGFbXT4oKTtcbiAgY29uc3QgdGFic0J5V2luZG93VW5ncm91cGVkID0gbmV3IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhW10+KCk7XG5cbiAgbWFwcGVkLmZvckVhY2godGFiID0+IHtcbiAgICAgIGNvbnN0IGdyb3VwSWQgPSB0YWIuZ3JvdXBJZCA/PyAtMTtcbiAgICAgIGlmIChncm91cElkICE9PSAtMSkge1xuICAgICAgICAgIGlmICghdGFic0J5R3JvdXBJZC5oYXMoZ3JvdXBJZCkpIHRhYnNCeUdyb3VwSWQuc2V0KGdyb3VwSWQsIFtdKTtcbiAgICAgICAgICB0YWJzQnlHcm91cElkLmdldChncm91cElkKSEucHVzaCh0YWIpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgaWYgKCF0YWJzQnlXaW5kb3dVbmdyb3VwZWQuaGFzKHRhYi53aW5kb3dJZCkpIHRhYnNCeVdpbmRvd1VuZ3JvdXBlZC5zZXQodGFiLndpbmRvd0lkLCBbXSk7XG4gICAgICAgICAgIHRhYnNCeVdpbmRvd1VuZ3JvdXBlZC5nZXQodGFiLndpbmRvd0lkKSEucHVzaCh0YWIpO1xuICAgICAgfVxuICB9KTtcblxuICAvLyBDcmVhdGUgVGFiR3JvdXAgb2JqZWN0cyBmb3IgYWN0dWFsIGdyb3Vwc1xuICBmb3IgKGNvbnN0IFtncm91cElkLCBncm91cFRhYnNdIG9mIHRhYnNCeUdyb3VwSWQpIHtcbiAgICAgIGNvbnN0IGJyb3dzZXJHcm91cCA9IGdyb3VwTWFwLmdldChncm91cElkKTtcbiAgICAgIGlmIChicm93c2VyR3JvdXApIHtcbiAgICAgICAgICByZXN1bHRHcm91cHMucHVzaCh7XG4gICAgICAgICAgICAgIGlkOiBgZ3JvdXAtJHtncm91cElkfWAsXG4gICAgICAgICAgICAgIHdpbmRvd0lkOiBicm93c2VyR3JvdXAud2luZG93SWQsXG4gICAgICAgICAgICAgIGxhYmVsOiBicm93c2VyR3JvdXAudGl0bGUgfHwgXCJVbnRpdGxlZCBHcm91cFwiLFxuICAgICAgICAgICAgICBjb2xvcjogYnJvd3Nlckdyb3VwLmNvbG9yLFxuICAgICAgICAgICAgICB0YWJzOiBzb3J0VGFicyhncm91cFRhYnMsIHByZWZlcmVuY2VzLnNvcnRpbmcpLFxuICAgICAgICAgICAgICByZWFzb246IFwiTWFudWFsXCJcbiAgICAgICAgICB9KTtcbiAgICAgIH1cbiAgfVxuXG4gIC8vIEhhbmRsZSB1bmdyb3VwZWQgdGFic1xuICBmb3IgKGNvbnN0IFt3aW5kb3dJZCwgdGFic10gb2YgdGFic0J5V2luZG93VW5ncm91cGVkKSB7XG4gICAgICByZXN1bHRHcm91cHMucHVzaCh7XG4gICAgICAgICAgaWQ6IGB1bmdyb3VwZWQtJHt3aW5kb3dJZH1gLFxuICAgICAgICAgIHdpbmRvd0lkOiB3aW5kb3dJZCxcbiAgICAgICAgICBsYWJlbDogXCJVbmdyb3VwZWRcIixcbiAgICAgICAgICBjb2xvcjogXCJncmV5XCIsXG4gICAgICAgICAgdGFiczogc29ydFRhYnModGFicywgcHJlZmVyZW5jZXMuc29ydGluZyksXG4gICAgICAgICAgcmVhc29uOiBcIlVuZ3JvdXBlZFwiXG4gICAgICB9KTtcbiAgfVxuXG4gIGxvZ0luZm8oXCJGZXRjaGVkIGN1cnJlbnQgdGFiIGdyb3Vwc1wiLCB7IGdyb3VwczogcmVzdWx0R3JvdXBzLmxlbmd0aCwgdGFiczogbWFwcGVkLmxlbmd0aCB9KTtcbiAgcmV0dXJuIHJlc3VsdEdyb3VwcztcbiAgfSBjYXRjaCAoZSkge1xuICAgIGxvZ0Vycm9yKFwiRXJyb3IgaW4gZmV0Y2hDdXJyZW50VGFiR3JvdXBzXCIsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICB0aHJvdyBlO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgY2FsY3VsYXRlVGFiR3JvdXBzID0gYXN5bmMgKFxuICBwcmVmZXJlbmNlczogUHJlZmVyZW5jZXMsXG4gIGZpbHRlcj86IEdyb3VwaW5nU2VsZWN0aW9uLFxuICBvblByb2dyZXNzPzogKGNvbXBsZXRlZDogbnVtYmVyLCB0b3RhbDogbnVtYmVyKSA9PiB2b2lkXG4pOiBQcm9taXNlPFRhYkdyb3VwW10+ID0+IHtcbiAgY29uc3QgY2hyb21lVGFicyA9IGF3YWl0IGdldFRhYnNGb3JGaWx0ZXIoZmlsdGVyKTtcbiAgY29uc3Qgd2luZG93SWRTZXQgPSBuZXcgU2V0KGZpbHRlcj8ud2luZG93SWRzID8/IFtdKTtcbiAgY29uc3QgdGFiSWRTZXQgPSBuZXcgU2V0KGZpbHRlcj8udGFiSWRzID8/IFtdKTtcbiAgY29uc3QgaGFzRmlsdGVycyA9IHdpbmRvd0lkU2V0LnNpemUgPiAwIHx8IHRhYklkU2V0LnNpemUgPiAwO1xuICBjb25zdCBmaWx0ZXJlZFRhYnMgPSBjaHJvbWVUYWJzLmZpbHRlcigodGFiKSA9PiB7XG4gICAgaWYgKCFoYXNGaWx0ZXJzKSByZXR1cm4gdHJ1ZTtcbiAgICByZXR1cm4gKHRhYi53aW5kb3dJZCAmJiB3aW5kb3dJZFNldC5oYXModGFiLndpbmRvd0lkKSkgfHwgKHRhYi5pZCAmJiB0YWJJZFNldC5oYXModGFiLmlkKSk7XG4gIH0pO1xuICBjb25zdCBtYXBwZWQgPSBmaWx0ZXJlZFRhYnNcbiAgICAubWFwKG1hcENocm9tZVRhYilcbiAgICAuZmlsdGVyKCh0YWIpOiB0YWIgaXMgVGFiTWV0YWRhdGEgPT4gQm9vbGVhbih0YWIpKTtcblxuICBpZiAocmVxdWlyZXNDb250ZXh0QW5hbHlzaXMocHJlZmVyZW5jZXMuc29ydGluZykpIHtcbiAgICBjb25zdCBjb250ZXh0TWFwID0gYXdhaXQgYW5hbHl6ZVRhYkNvbnRleHQobWFwcGVkLCBvblByb2dyZXNzKTtcbiAgICBtYXBwZWQuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgY29uc3QgcmVzID0gY29udGV4dE1hcC5nZXQodGFiLmlkKTtcbiAgICAgIHRhYi5jb250ZXh0ID0gcmVzPy5jb250ZXh0O1xuICAgICAgdGFiLmNvbnRleHREYXRhID0gcmVzPy5kYXRhO1xuICAgIH0pO1xuICB9XG5cbiAgY29uc3QgZ3JvdXBlZCA9IGdyb3VwVGFicyhtYXBwZWQsIHByZWZlcmVuY2VzLnNvcnRpbmcpO1xuICBncm91cGVkLmZvckVhY2goKGdyb3VwKSA9PiB7XG4gICAgZ3JvdXAudGFicyA9IHNvcnRUYWJzKGdyb3VwLnRhYnMsIHByZWZlcmVuY2VzLnNvcnRpbmcpO1xuICB9KTtcbiAgbG9nSW5mbyhcIkNhbGN1bGF0ZWQgdGFiIGdyb3Vwc1wiLCB7IGdyb3VwczogZ3JvdXBlZC5sZW5ndGgsIHRhYnM6IG1hcHBlZC5sZW5ndGggfSk7XG4gIHJldHVybiBncm91cGVkO1xufTtcblxuY29uc3QgVkFMSURfQ09MT1JTID0gW1wiZ3JleVwiLCBcImJsdWVcIiwgXCJyZWRcIiwgXCJ5ZWxsb3dcIiwgXCJncmVlblwiLCBcInBpbmtcIiwgXCJwdXJwbGVcIiwgXCJjeWFuXCIsIFwib3JhbmdlXCJdO1xuXG5leHBvcnQgY29uc3QgYXBwbHlUYWJHcm91cHMgPSBhc3luYyAoZ3JvdXBzOiBUYWJHcm91cFtdKSA9PiB7XG4gIGNvbnN0IGNsYWltZWRHcm91cElkcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXG4gIGZvciAoY29uc3QgZ3JvdXAgb2YgZ3JvdXBzKSB7XG4gICAgbGV0IHRhYnNUb1Byb2Nlc3M6IHsgd2luZG93SWQ6IG51bWJlciwgdGFiczogVGFiTWV0YWRhdGFbXSB9W10gPSBbXTtcblxuICAgIGlmIChncm91cC53aW5kb3dNb2RlID09PSAnbmV3Jykge1xuICAgICAgaWYgKGdyb3VwLnRhYnMubGVuZ3RoID4gMCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGZpcnN0ID0gZ3JvdXAudGFic1swXTtcbiAgICAgICAgICBjb25zdCB3aW4gPSBhd2FpdCBjaHJvbWUud2luZG93cy5jcmVhdGUoeyB0YWJJZDogZmlyc3QuaWQgfSk7XG4gICAgICAgICAgY29uc3Qgd2luSWQgPSB3aW4uaWQhO1xuICAgICAgICAgIGNvbnN0IG90aGVycyA9IGdyb3VwLnRhYnMuc2xpY2UoMSkubWFwKHQgPT4gdC5pZCk7XG4gICAgICAgICAgaWYgKG90aGVycy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBhd2FpdCBjaHJvbWUudGFicy5tb3ZlKG90aGVycywgeyB3aW5kb3dJZDogd2luSWQsIGluZGV4OiAtMSB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGFic1RvUHJvY2Vzcy5wdXNoKHsgd2luZG93SWQ6IHdpbklkLCB0YWJzOiBncm91cC50YWJzIH0pO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgbG9nRXJyb3IoXCJFcnJvciBjcmVhdGluZyBuZXcgd2luZG93IGZvciBncm91cFwiLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGdyb3VwLndpbmRvd01vZGUgPT09ICdjb21wb3VuZCcpIHtcbiAgICAgIGlmIChncm91cC50YWJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgLy8gRGV0ZXJtaW5lIHRhcmdldCB3aW5kb3cgKG1ham9yaXR5IHdpbnMpXG4gICAgICAgIGNvbnN0IGNvdW50cyA9IG5ldyBNYXA8bnVtYmVyLCBudW1iZXI+KCk7XG4gICAgICAgIGdyb3VwLnRhYnMuZm9yRWFjaCh0ID0+IGNvdW50cy5zZXQodC53aW5kb3dJZCwgKGNvdW50cy5nZXQodC53aW5kb3dJZCkgfHwgMCkgKyAxKSk7XG4gICAgICAgIGxldCB0YXJnZXRXaW5kb3dJZCA9IGdyb3VwLnRhYnNbMF0ud2luZG93SWQ7XG4gICAgICAgIGxldCBtYXggPSAwO1xuICAgICAgICBmb3IgKGNvbnN0IFt3aWQsIGNvdW50XSBvZiBjb3VudHMpIHtcbiAgICAgICAgICBpZiAoY291bnQgPiBtYXgpIHsgbWF4ID0gY291bnQ7IHRhcmdldFdpbmRvd0lkID0gd2lkOyB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBNb3ZlIHRhYnMgbm90IGluIHRhcmdldFxuICAgICAgICBjb25zdCB0b01vdmUgPSBncm91cC50YWJzLmZpbHRlcih0ID0+IHQud2luZG93SWQgIT09IHRhcmdldFdpbmRvd0lkKS5tYXAodCA9PiB0LmlkKTtcbiAgICAgICAgaWYgKHRvTW92ZS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IGNocm9tZS50YWJzLm1vdmUodG9Nb3ZlLCB7IHdpbmRvd0lkOiB0YXJnZXRXaW5kb3dJZCwgaW5kZXg6IC0xIH0pO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGxvZ0Vycm9yKFwiRXJyb3IgbW92aW5nIHRhYnMgZm9yIGNvbXBvdW5kIGdyb3VwXCIsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGFic1RvUHJvY2Vzcy5wdXNoKHsgd2luZG93SWQ6IHRhcmdldFdpbmRvd0lkLCB0YWJzOiBncm91cC50YWJzIH0pO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBDdXJyZW50IG1vZGU6IHNwbGl0IGJ5IHNvdXJjZSB3aW5kb3dcbiAgICAgIGNvbnN0IG1hcCA9IGdyb3VwLnRhYnMucmVkdWNlPE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhW10+PigoYWNjLCB0YWIpID0+IHtcbiAgICAgICAgY29uc3QgZXhpc3RpbmcgPSBhY2MuZ2V0KHRhYi53aW5kb3dJZCkgPz8gW107XG4gICAgICAgIGV4aXN0aW5nLnB1c2godGFiKTtcbiAgICAgICAgYWNjLnNldCh0YWIud2luZG93SWQsIGV4aXN0aW5nKTtcbiAgICAgICAgcmV0dXJuIGFjYztcbiAgICAgIH0sIG5ldyBNYXAoKSk7XG4gICAgICBmb3IgKGNvbnN0IFt3aWQsIHRdIG9mIG1hcCkge1xuICAgICAgICB0YWJzVG9Qcm9jZXNzLnB1c2goeyB3aW5kb3dJZDogd2lkLCB0YWJzOiB0IH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgeyB3aW5kb3dJZDogdGFyZ2V0V2luSWQsIHRhYnMgfSBvZiB0YWJzVG9Qcm9jZXNzKSB7XG4gICAgICAvLyBGaW5kIGNhbmRpZGF0ZSBncm91cCBJRCB0byByZXVzZVxuICAgICAgbGV0IGNhbmRpZGF0ZUdyb3VwSWQ6IG51bWJlciB8IHVuZGVmaW5lZDtcbiAgICAgIGNvbnN0IGNvdW50cyA9IG5ldyBNYXA8bnVtYmVyLCBudW1iZXI+KCk7XG4gICAgICBmb3IgKGNvbnN0IHQgb2YgdGFicykge1xuICAgICAgICAvLyBPbmx5IGNvbnNpZGVyIGdyb3VwcyB0aGF0IHdlcmUgYWxyZWFkeSBpbiB0aGlzIHdpbmRvd1xuICAgICAgICBpZiAodC5ncm91cElkICYmIHQuZ3JvdXBJZCAhPT0gLTEgJiYgdC53aW5kb3dJZCA9PT0gdGFyZ2V0V2luSWQpIHtcbiAgICAgICAgICBjb3VudHMuc2V0KHQuZ3JvdXBJZCwgKGNvdW50cy5nZXQodC5ncm91cElkKSB8fCAwKSArIDEpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIFByaW9yaXRpemUgdGhlIG1vc3QgZnJlcXVlbnQgZ3JvdXAgSUQgdGhhdCBoYXNuJ3QgYmVlbiBjbGFpbWVkIHlldFxuICAgICAgY29uc3Qgc29ydGVkQ2FuZGlkYXRlcyA9IEFycmF5LmZyb20oY291bnRzLmVudHJpZXMoKSlcbiAgICAgICAgLnNvcnQoKGEsIGIpID0+IGJbMV0gLSBhWzFdKVxuICAgICAgICAubWFwKChbaWRdKSA9PiBpZCk7XG5cbiAgICAgIGZvciAoY29uc3QgaWQgb2Ygc29ydGVkQ2FuZGlkYXRlcykge1xuICAgICAgICBpZiAoIWNsYWltZWRHcm91cElkcy5oYXMoaWQpKSB7XG4gICAgICAgICAgY2FuZGlkYXRlR3JvdXBJZCA9IGlkO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGxldCBmaW5hbEdyb3VwSWQ6IG51bWJlcjtcblxuICAgICAgaWYgKGNhbmRpZGF0ZUdyb3VwSWQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBjbGFpbWVkR3JvdXBJZHMuYWRkKGNhbmRpZGF0ZUdyb3VwSWQpO1xuICAgICAgICBmaW5hbEdyb3VwSWQgPSBjYW5kaWRhdGVHcm91cElkO1xuXG4gICAgICAgIC8vIENsZWFuIHVwIGxlZnRvdmVycyBhbmQgYWRkIG1pc3NpbmcgdGFic1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGV4aXN0aW5nVGFicyA9IGF3YWl0IGNocm9tZS50YWJzLnF1ZXJ5KHsgZ3JvdXBJZDogZmluYWxHcm91cElkIH0pO1xuICAgICAgICAgIGNvbnN0IGV4aXN0aW5nVGFiSWRzID0gbmV3IFNldChleGlzdGluZ1RhYnMubWFwKHQgPT4gdC5pZCkpO1xuICAgICAgICAgIGNvbnN0IHRhcmdldFRhYklkcyA9IG5ldyBTZXQodGFicy5tYXAodCA9PiB0LmlkKSk7XG5cbiAgICAgICAgICAvLyAxLiBVbmdyb3VwIHRhYnMgdGhhdCBzaG91bGRuJ3QgYmUgaGVyZVxuICAgICAgICAgIGNvbnN0IGxlZnRvdmVycyA9IGV4aXN0aW5nVGFicy5maWx0ZXIodCA9PiB0LmlkICE9PSB1bmRlZmluZWQgJiYgIXRhcmdldFRhYklkcy5oYXModC5pZCkpO1xuICAgICAgICAgIGlmIChsZWZ0b3ZlcnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMudW5ncm91cChsZWZ0b3ZlcnMubWFwKHQgPT4gdC5pZCEpKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyAyLiBBZGQgb25seSB0aGUgdGFicyB0aGF0IGFyZW4ndCBhbHJlYWR5IGluIHRoZSBncm91cFxuICAgICAgICAgIGNvbnN0IHRhYnNUb0FkZCA9IHRhYnMuZmlsdGVyKHQgPT4gIWV4aXN0aW5nVGFiSWRzLmhhcyh0LmlkKSk7XG4gICAgICAgICAgaWYgKHRhYnNUb0FkZC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgLy8gRm9yIG5ldy9jb21wb3VuZCwgdGFicyBtaWdodCBoYXZlIGJlZW4gbW92ZWQsIHNvIHdlIG11c3QgcGFzcyB0YWJJZHNcbiAgICAgICAgICAgICBhd2FpdCBjaHJvbWUudGFicy5ncm91cCh7IGdyb3VwSWQ6IGZpbmFsR3JvdXBJZCwgdGFiSWRzOiB0YWJzVG9BZGQubWFwKHQgPT4gdC5pZCkgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgbG9nRXJyb3IoXCJFcnJvciBtYW5hZ2luZyBncm91cCByZXVzZVwiLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIENyZWF0ZSBuZXcgZ3JvdXAgKGRlZmF1bHQgYmVoYXZpb3I6IGV4cGFuZGVkKVxuICAgICAgICAvLyBFbnN1cmUgd2UgY3JlYXRlIGl0IGluIHRoZSB0YXJnZXQgd2luZG93IChpZiBzdHJpY3RseSBuZXcsIHRhYklkcyBpbXBsaWVzIHdpbmRvdyBpZiB0aGV5IGFyZSBpbiBpdClcbiAgICAgICAgLy8gSWYgdGFicyB3ZXJlIGp1c3QgbW92ZWQsIHRoZXkgYXJlIGluIHRhcmdldFdpbklkLlxuICAgICAgICAvLyBjaHJvbWUudGFicy5ncm91cCB3aXRoIHRhYklkcyB3aWxsIGluZmVyIHdpbmRvdyBmcm9tIHRhYnMuXG4gICAgICAgIGZpbmFsR3JvdXBJZCA9IGF3YWl0IGNocm9tZS50YWJzLmdyb3VwKHtcbiAgICAgICAgICB0YWJJZHM6IHRhYnMubWFwKHQgPT4gdC5pZCksXG4gICAgICAgICAgY3JlYXRlUHJvcGVydGllczogeyB3aW5kb3dJZDogdGFyZ2V0V2luSWQgfVxuICAgICAgICB9KTtcbiAgICAgICAgY2xhaW1lZEdyb3VwSWRzLmFkZChmaW5hbEdyb3VwSWQpO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB1cGRhdGVQcm9wczogY2hyb21lLnRhYkdyb3Vwcy5VcGRhdGVQcm9wZXJ0aWVzID0ge1xuICAgICAgICB0aXRsZTogZ3JvdXAubGFiZWxcbiAgICAgIH07XG4gICAgICBpZiAoVkFMSURfQ09MT1JTLmluY2x1ZGVzKGdyb3VwLmNvbG9yKSkge1xuICAgICAgICAgIHVwZGF0ZVByb3BzLmNvbG9yID0gZ3JvdXAuY29sb3IgYXMgY2hyb21lLnRhYkdyb3Vwcy5Db2xvckVudW07XG4gICAgICB9XG4gICAgICBhd2FpdCBjaHJvbWUudGFiR3JvdXBzLnVwZGF0ZShmaW5hbEdyb3VwSWQsIHVwZGF0ZVByb3BzKTtcbiAgICB9XG4gIH1cbiAgbG9nSW5mbyhcIkFwcGxpZWQgdGFiIGdyb3Vwc1wiLCB7IGNvdW50OiBncm91cHMubGVuZ3RoIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IGFwcGx5VGFiU29ydGluZyA9IGFzeW5jIChcbiAgcHJlZmVyZW5jZXM6IFByZWZlcmVuY2VzLFxuICBmaWx0ZXI/OiBHcm91cGluZ1NlbGVjdGlvbixcbiAgb25Qcm9ncmVzcz86IChjb21wbGV0ZWQ6IG51bWJlciwgdG90YWw6IG51bWJlcikgPT4gdm9pZFxuKSA9PiB7XG4gIGNvbnN0IHRhcmdldFdpbmRvd0lkcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuICBsZXQgY2hyb21lVGFiczogY2hyb21lLnRhYnMuVGFiW10gPSBbXTtcblxuICBjb25zdCBleHBsaWNpdFdpbmRvd0lkcyA9IGZpbHRlcj8ud2luZG93SWRzID8/IFtdO1xuICBjb25zdCBleHBsaWNpdFRhYklkcyA9IGZpbHRlcj8udGFiSWRzID8/IFtdO1xuICBjb25zdCBoYXNGaWx0ZXIgPSBleHBsaWNpdFdpbmRvd0lkcy5sZW5ndGggPiAwIHx8IGV4cGxpY2l0VGFiSWRzLmxlbmd0aCA+IDA7XG5cbiAgaWYgKCFoYXNGaWx0ZXIpIHtcbiAgICAgIGNocm9tZVRhYnMgPSBhd2FpdCBjaHJvbWUudGFicy5xdWVyeSh7fSk7XG4gICAgICBjaHJvbWVUYWJzLmZvckVhY2godCA9PiB7IGlmICh0LndpbmRvd0lkKSB0YXJnZXRXaW5kb3dJZHMuYWRkKHQud2luZG93SWQpOyB9KTtcbiAgfSBlbHNlIHtcbiAgICAgIGV4cGxpY2l0V2luZG93SWRzLmZvckVhY2goaWQgPT4gdGFyZ2V0V2luZG93SWRzLmFkZChpZCkpO1xuXG4gICAgICBpZiAoZXhwbGljaXRUYWJJZHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNvbnN0IHNwZWNpZmljVGFicyA9IGF3YWl0IFByb21pc2UuYWxsKGV4cGxpY2l0VGFiSWRzLm1hcChpZCA9PiBjaHJvbWUudGFicy5nZXQoaWQpLmNhdGNoKCgpID0+IG51bGwpKSk7XG4gICAgICAgICAgc3BlY2lmaWNUYWJzLmZvckVhY2godCA9PiB7XG4gICAgICAgICAgICAgIGlmICh0ICYmIHQud2luZG93SWQpIHRhcmdldFdpbmRvd0lkcy5hZGQodC53aW5kb3dJZCk7XG4gICAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHdpbmRvd1Byb21pc2VzID0gQXJyYXkuZnJvbSh0YXJnZXRXaW5kb3dJZHMpLm1hcCh3aW5kb3dJZCA9PlxuICAgICAgICAgIGNocm9tZS50YWJzLnF1ZXJ5KHsgd2luZG93SWQgfSkuY2F0Y2goKCkgPT4gW10pXG4gICAgICApO1xuICAgICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKHdpbmRvd1Byb21pc2VzKTtcbiAgICAgIGNocm9tZVRhYnMgPSByZXN1bHRzLmZsYXQoKTtcbiAgfVxuXG4gIGZvciAoY29uc3Qgd2luZG93SWQgb2YgdGFyZ2V0V2luZG93SWRzKSB7XG4gICAgICBjb25zdCB3aW5kb3dUYWJzID0gY2hyb21lVGFicy5maWx0ZXIodCA9PiB0LndpbmRvd0lkID09PSB3aW5kb3dJZCk7XG4gICAgICBjb25zdCBtYXBwZWQgPSB3aW5kb3dUYWJzLm1hcChtYXBDaHJvbWVUYWIpLmZpbHRlcigodCk6IHQgaXMgVGFiTWV0YWRhdGEgPT4gQm9vbGVhbih0KSk7XG5cbiAgICAgIGlmIChyZXF1aXJlc0NvbnRleHRBbmFseXNpcyhwcmVmZXJlbmNlcy5zb3J0aW5nKSkge1xuICAgICAgICBjb25zdCBjb250ZXh0TWFwID0gYXdhaXQgYW5hbHl6ZVRhYkNvbnRleHQobWFwcGVkLCBvblByb2dyZXNzKTtcbiAgICAgICAgbWFwcGVkLmZvckVhY2godGFiID0+IHtcbiAgICAgICAgICBjb25zdCByZXMgPSBjb250ZXh0TWFwLmdldCh0YWIuaWQpO1xuICAgICAgICAgIHRhYi5jb250ZXh0ID0gcmVzPy5jb250ZXh0O1xuICAgICAgICAgIHRhYi5jb250ZXh0RGF0YSA9IHJlcz8uZGF0YTtcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIC8vIEdyb3VwIHRhYnMgYnkgZ3JvdXBJZCB0byBzb3J0IHdpdGhpbiBncm91cHNcbiAgICAgIGNvbnN0IHRhYnNCeUdyb3VwID0gbmV3IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhW10+KCk7XG4gICAgICBjb25zdCB1bmdyb3VwZWRUYWJzOiBUYWJNZXRhZGF0YVtdID0gW107XG5cbiAgICAgIG1hcHBlZC5mb3JFYWNoKHRhYiA9PiB7XG4gICAgICAgIGNvbnN0IGdyb3VwSWQgPSB0YWIuZ3JvdXBJZCA/PyAtMTtcbiAgICAgICAgaWYgKGdyb3VwSWQgIT09IC0xKSB7XG4gICAgICAgICAgY29uc3QgZ3JvdXAgPSB0YWJzQnlHcm91cC5nZXQoZ3JvdXBJZCkgPz8gW107XG4gICAgICAgICAgZ3JvdXAucHVzaCh0YWIpO1xuICAgICAgICAgIHRhYnNCeUdyb3VwLnNldChncm91cElkLCBncm91cCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdW5ncm91cGVkVGFicy5wdXNoKHRhYik7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICAvLyAxLiBTb3J0IHRhYnMgd2l0aGluIGVhY2ggZ3JvdXBcbiAgICAgIGZvciAoY29uc3QgW2dyb3VwSWQsIHRhYnNdIG9mIHRhYnNCeUdyb3VwKSB7XG4gICAgICAgIGNvbnN0IGdyb3VwVGFiSW5kaWNlcyA9IHdpbmRvd1RhYnNcbiAgICAgICAgICAuZmlsdGVyKHQgPT4gdC5ncm91cElkID09PSBncm91cElkKVxuICAgICAgICAgIC5tYXAodCA9PiB0LmluZGV4KVxuICAgICAgICAgIC5zb3J0KChhLCBiKSA9PiBhIC0gYik7XG5cbiAgICAgICAgY29uc3Qgc3RhcnRJbmRleCA9IGdyb3VwVGFiSW5kaWNlc1swXSA/PyAwO1xuXG4gICAgICAgIGNvbnN0IHNvcnRlZEdyb3VwVGFicyA9IHNvcnRUYWJzKHRhYnMsIHByZWZlcmVuY2VzLnNvcnRpbmcpO1xuICAgICAgICBjb25zdCBzb3J0ZWRJZHMgPSBzb3J0ZWRHcm91cFRhYnMubWFwKHQgPT4gdC5pZCk7XG5cbiAgICAgICAgaWYgKHNvcnRlZElkcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgIGF3YWl0IGNocm9tZS50YWJzLm1vdmUoc29ydGVkSWRzLCB7IGluZGV4OiBzdGFydEluZGV4IH0pO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIDIuIFNvcnQgdW5ncm91cGVkIHRhYnNcbiAgICAgIGlmICh1bmdyb3VwZWRUYWJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29uc3Qgc29ydGVkVW5ncm91cGVkID0gc29ydFRhYnModW5ncm91cGVkVGFicywgcHJlZmVyZW5jZXMuc29ydGluZyk7XG4gICAgICAgIGNvbnN0IHNvcnRlZElkcyA9IHNvcnRlZFVuZ3JvdXBlZC5tYXAodCA9PiB0LmlkKTtcblxuICAgICAgICAvLyBNb3ZlIHRvIGluZGV4IDAgKHRvcCBvZiB3aW5kb3cpXG4gICAgICAgIGF3YWl0IGNocm9tZS50YWJzLm1vdmUoc29ydGVkSWRzLCB7IGluZGV4OiAwIH0pO1xuICAgICAgfVxuXG4gICAgICAvLyAzLiBTb3J0IEdyb3VwcyAoaWYgZW5hYmxlZClcbiAgICAgIGF3YWl0IHNvcnRHcm91cHNJZkVuYWJsZWQod2luZG93SWQsIHByZWZlcmVuY2VzLnNvcnRpbmcsIHRhYnNCeUdyb3VwKTtcbiAgfVxuICBsb2dJbmZvKFwiQXBwbGllZCB0YWIgc29ydGluZ1wiKTtcbn07XG5cbmNvbnN0IGNvbXBhcmVCeVNvcnRpbmdSdWxlcyA9IChzb3J0aW5nUnVsZXNBcmc6IFNvcnRpbmdSdWxlW10sIGE6IFRhYk1ldGFkYXRhLCBiOiBUYWJNZXRhZGF0YSk6IG51bWJlciA9PiB7XG4gIGNvbnN0IHNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihzb3J0aW5nUnVsZXNBcmcpO1xuICBpZiAoc29ydFJ1bGVzTGlzdC5sZW5ndGggPT09IDApIHJldHVybiAwO1xuXG4gIHRyeSB7XG4gICAgZm9yIChjb25zdCBydWxlIG9mIHNvcnRSdWxlc0xpc3QpIHtcbiAgICAgIGlmICghcnVsZSkgY29udGludWU7XG4gICAgICBjb25zdCB2YWxBID0gZ2V0RmllbGRWYWx1ZShhLCBydWxlLmZpZWxkKTtcbiAgICAgIGNvbnN0IHZhbEIgPSBnZXRGaWVsZFZhbHVlKGIsIHJ1bGUuZmllbGQpO1xuXG4gICAgICBsZXQgcmVzdWx0ID0gMDtcbiAgICAgIGlmICh2YWxBIDwgdmFsQikgcmVzdWx0ID0gLTE7XG4gICAgICBlbHNlIGlmICh2YWxBID4gdmFsQikgcmVzdWx0ID0gMTtcblxuICAgICAgaWYgKHJlc3VsdCAhPT0gMCkge1xuICAgICAgICByZXR1cm4gcnVsZS5vcmRlciA9PT0gXCJkZXNjXCIgPyAtcmVzdWx0IDogcmVzdWx0O1xuICAgICAgfVxuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBsb2dFcnJvcihcIkVycm9yIGV2YWx1YXRpbmcgc29ydGluZyBydWxlc1wiLCB7IGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICB9XG5cbiAgcmV0dXJuIDA7XG59O1xuXG5jb25zdCBzb3J0R3JvdXBzSWZFbmFibGVkID0gYXN5bmMgKFxuICAgIHdpbmRvd0lkOiBudW1iZXIsXG4gICAgc29ydGluZ1ByZWZlcmVuY2VzOiBzdHJpbmdbXSxcbiAgICB0YWJzQnlHcm91cDogTWFwPG51bWJlciwgVGFiTWV0YWRhdGFbXT5cbikgPT4ge1xuICAgIC8vIENoZWNrIGlmIGFueSBhY3RpdmUgc3RyYXRlZ3kgaGFzIHNvcnRHcm91cHM6IHRydWVcbiAgICBjb25zdCBjdXN0b21TdHJhdHMgPSBnZXRDdXN0b21TdHJhdGVnaWVzKCk7XG4gICAgbGV0IGdyb3VwU29ydGVyU3RyYXRlZ3k6IFJldHVyblR5cGU8dHlwZW9mIGN1c3RvbVN0cmF0cy5maW5kPiB8IG51bGwgPSBudWxsO1xuXG4gICAgZm9yIChjb25zdCBpZCBvZiBzb3J0aW5nUHJlZmVyZW5jZXMpIHtcbiAgICAgICAgY29uc3Qgc3RyYXRlZ3kgPSBjdXN0b21TdHJhdHMuZmluZChzID0+IHMuaWQgPT09IGlkKTtcbiAgICAgICAgaWYgKHN0cmF0ZWd5ICYmIChzdHJhdGVneS5zb3J0R3JvdXBzIHx8IChzdHJhdGVneS5ncm91cFNvcnRpbmdSdWxlcyAmJiBzdHJhdGVneS5ncm91cFNvcnRpbmdSdWxlcy5sZW5ndGggPiAwKSkpIHtcbiAgICAgICAgICAgIGdyb3VwU29ydGVyU3RyYXRlZ3kgPSBzdHJhdGVneTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKCFncm91cFNvcnRlclN0cmF0ZWd5KSByZXR1cm47XG5cbiAgICAvLyBHZXQgZ3JvdXAgZGV0YWlsc1xuICAgIGNvbnN0IGdyb3VwcyA9IGF3YWl0IGNocm9tZS50YWJHcm91cHMucXVlcnkoeyB3aW5kb3dJZCB9KTtcbiAgICBpZiAoZ3JvdXBzLmxlbmd0aCA8PSAxKSByZXR1cm47XG5cbiAgICAvLyBXZSBzb3J0IGdyb3VwcyBiYXNlZCBvbiB0aGUgc3RyYXRlZ3kuXG4gICAgLy8gU2luY2UgY29tcGFyZUJ5IGV4cGVjdHMgVGFiTWV0YWRhdGEsIHdlIG5lZWQgdG8gY3JlYXRlIGEgcmVwcmVzZW50YXRpdmUgVGFiTWV0YWRhdGEgZm9yIGVhY2ggZ3JvdXAuXG4gICAgLy8gV2UnbGwgdXNlIHRoZSBmaXJzdCB0YWIgb2YgdGhlIGdyb3VwIChzb3J0ZWQpIGFzIHRoZSByZXByZXNlbnRhdGl2ZS5cblxuICAgIGNvbnN0IGdyb3VwUmVwczogeyBncm91cDogY2hyb21lLnRhYkdyb3Vwcy5UYWJHcm91cDsgcmVwOiBUYWJNZXRhZGF0YSB9W10gPSBbXTtcblxuICAgIGZvciAoY29uc3QgZ3JvdXAgb2YgZ3JvdXBzKSB7XG4gICAgICAgIGNvbnN0IHRhYnMgPSB0YWJzQnlHcm91cC5nZXQoZ3JvdXAuaWQpO1xuICAgICAgICBpZiAodGFicyAmJiB0YWJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIC8vIHRhYnMgYXJlIGFscmVhZHkgc29ydGVkIGJ5IHNvcnRUYWJzIGluIHByZXZpb3VzIHN0ZXAgaWYgdGhhdCBzdHJhdGVneSB3YXMgYXBwbGllZFxuICAgICAgICAgICAgLy8gb3Igd2UganVzdCB0YWtlIHRoZSBmaXJzdCBvbmUuXG4gICAgICAgICAgICAvLyBJZGVhbGx5IHdlIHVzZSB0aGUgXCJiZXN0XCIgdGFiLlxuICAgICAgICAgICAgLy8gQnV0IHNpbmNlIHdlIGFscmVhZHkgc29ydGVkIHRhYnMgd2l0aGluIGdyb3VwcywgdGFic1swXSBpcyB0aGUgZmlyc3Qgb25lLlxuICAgICAgICAgICAgZ3JvdXBSZXBzLnB1c2goeyBncm91cCwgcmVwOiB0YWJzWzBdIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gU29ydCB0aGUgZ3JvdXBzXG4gICAgaWYgKGdyb3VwU29ydGVyU3RyYXRlZ3kuZ3JvdXBTb3J0aW5nUnVsZXMgJiYgQXJyYXkuaXNBcnJheShncm91cFNvcnRlclN0cmF0ZWd5Lmdyb3VwU29ydGluZ1J1bGVzKSAmJiBncm91cFNvcnRlclN0cmF0ZWd5Lmdyb3VwU29ydGluZ1J1bGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgZ3JvdXBSZXBzLnNvcnQoKGEsIGIpID0+IGNvbXBhcmVCeVNvcnRpbmdSdWxlcyhncm91cFNvcnRlclN0cmF0ZWd5IS5ncm91cFNvcnRpbmdSdWxlcyEsIGEucmVwLCBiLnJlcCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGdyb3VwUmVwcy5zb3J0KChhLCBiKSA9PiBjb21wYXJlQnkoZ3JvdXBTb3J0ZXJTdHJhdGVneSEuaWQsIGEucmVwLCBiLnJlcCkpO1xuICAgIH1cblxuICAgIC8vIEFwcGx5IHRoZSBvcmRlclxuICAgIC8vIGNocm9tZS50YWJHcm91cHMubW92ZShncm91cElkLCB7IGluZGV4OiAuLi4gfSlcbiAgICAvLyBXZSB3YW50IHRoZW0gdG8gYmUgYWZ0ZXIgdW5ncm91cGVkIHRhYnMgKHdoaWNoIGFyZSBhdCBpbmRleCAwLi5OKS5cbiAgICAvLyBBY3R1YWxseSwgY2hyb21lLnRhYkdyb3Vwcy5tb3ZlIGluZGV4IGlzIHRoZSB0YWIgaW5kZXggd2hlcmUgdGhlIGdyb3VwIHN0YXJ0cy5cbiAgICAvLyBJZiB3ZSB3YW50IHRvIHN0cmljdGx5IG9yZGVyIGdyb3Vwcywgd2Ugc2hvdWxkIGNhbGN1bGF0ZSB0aGUgdGFyZ2V0IGluZGV4LlxuICAgIC8vIEJ1dCBzaW5jZSBncm91cHMgYXJlIGNvbnRpZ3VvdXMgYmxvY2tzIG9mIHRhYnMsIHdlIGp1c3QgbmVlZCB0byBwbGFjZSB0aGVtIGluIG9yZGVyLlxuXG4gICAgLy8gQ2FsY3VsYXRlIHRoZSBzdGFydGluZyBpbmRleCBmb3IgZ3JvdXBzLlxuICAgIC8vIFVuZ3JvdXBlZCB0YWJzIGFyZSBhdCB0aGUgc3RhcnQgKGluZGV4IDApLlxuICAgIC8vIFNvIHRoZSBmaXJzdCBncm91cCBzaG91bGQgc3RhcnQgYWZ0ZXIgdGhlIGxhc3QgdW5ncm91cGVkIHRhYi5cbiAgICAvLyBXYWl0LCBlYXJsaWVyIHdlIG1vdmVkIHVuZ3JvdXBlZCB0YWJzIHRvIGluZGV4IDAuXG4gICAgLy8gQnV0IHdlIG5lZWQgdG8ga25vdyBob3cgbWFueSB1bmdyb3VwZWQgdGFicyB0aGVyZSBhcmUgaW4gdGhpcyB3aW5kb3cuXG5cbiAgICAvLyBMZXQncyBnZXQgY3VycmVudCB0YWJzIGFnYWluIG9yIHRyYWNrIGNvdW50P1xuICAgIC8vIFdlIGNhbiBhc3N1bWUgdW5ncm91cGVkIHRhYnMgYXJlIGF0IHRoZSB0b3AuXG4gICAgLy8gQnV0IGB0YWJzQnlHcm91cGAgb25seSBjb250YWlucyBncm91cGVkIHRhYnMuXG4gICAgLy8gV2UgbmVlZCB0byBrbm93IHdoZXJlIHRvIHN0YXJ0IHBsYWNpbmcgZ3JvdXBzLlxuICAgIC8vIFRoZSBzYWZlc3Qgd2F5IGlzIHRvIG1vdmUgdGhlbSBvbmUgYnkgb25lIHRvIHRoZSBlbmQgKG9yIHNwZWNpZmljIGluZGV4KS5cblxuICAgIC8vIElmIHdlIGp1c3QgbW92ZSB0aGVtIGluIG9yZGVyIHRvIGluZGV4IC0xLCB0aGV5IHdpbGwgYXBwZW5kIHRvIHRoZSBlbmQuXG4gICAgLy8gSWYgd2Ugd2FudCB0aGVtIGFmdGVyIHVuZ3JvdXBlZCB0YWJzLCB3ZSBuZWVkIHRvIGZpbmQgdGhlIGluZGV4LlxuXG4gICAgLy8gTGV0J3MgdXNlIGluZGV4ID0gLTEgdG8gcHVzaCB0byBlbmQsIHNlcXVlbnRpYWxseS5cbiAgICAvLyBCdXQgd2FpdCwgaWYgd2UgcHVzaCB0byBlbmQsIHRoZSBvcmRlciBpcyBwcmVzZXJ2ZWQ/XG4gICAgLy8gTm8sIGlmIHdlIGl0ZXJhdGUgc29ydGVkIGdyb3VwcyBhbmQgbW92ZSBlYWNoIHRvIC0xLCB0aGUgbGFzdCBvbmUgbW92ZWQgd2lsbCBiZSBhdCB0aGUgZW5kLlxuICAgIC8vIFNvIHdlIHNob3VsZCBpdGVyYXRlIGluIG9yZGVyIGFuZCBtb3ZlIHRvIC0xPyBObywgdGhhdCB3b3VsZCByZXZlcnNlIHRoZW0gaWYgd2UgY29uc2lkZXIgXCJlbmRcIi5cbiAgICAvLyBBY3R1YWxseSwgaWYgd2UgbW92ZSBHcm91cCBBIHRvIC0xLCBpdCBnb2VzIHRvIGVuZC4gVGhlbiBHcm91cCBCIHRvIC0xLCBpdCBnb2VzIGFmdGVyIEEuXG4gICAgLy8gU28gaXRlcmF0aW5nIGluIHNvcnRlZCBvcmRlciBhbmQgbW92aW5nIHRvIC0xIHdvcmtzIHRvIGFycmFuZ2UgdGhlbSBhdCB0aGUgZW5kIG9mIHRoZSB3aW5kb3cuXG5cbiAgICAvLyBIb3dldmVyLCBpZiB0aGVyZSBhcmUgcGlubmVkIHRhYnMgb3IgdW5ncm91cGVkIHRhYnMsIHRoZXkgc2hvdWxkIHN0YXkgYXQgdG9wP1xuICAgIC8vIFVuZ3JvdXBlZCB0YWJzIHdlcmUgbW92ZWQgdG8gaW5kZXggMC5cbiAgICAvLyBQaW5uZWQgdGFiczogYGNocm9tZS50YWJzLm1vdmVgIGhhbmRsZXMgcGlubmVkIGNvbnN0cmFpbnQgKHBpbm5lZCB0YWJzIG11c3QgYmUgZmlyc3QpLlxuICAgIC8vIEdyb3VwcyBjYW5ub3QgY29udGFpbiBwaW5uZWQgdGFicy5cbiAgICAvLyBTbyBncm91cHMgd2lsbCBiZSBhZnRlciBwaW5uZWQgdGFicy5cbiAgICAvLyBJZiB3ZSBtb3ZlIHRvIC0xLCB0aGV5IGdvIHRvIHRoZSB2ZXJ5IGVuZC5cblxuICAgIC8vIFdoYXQgaWYgd2Ugd2FudCB0aGVtIHNwZWNpZmljYWxseSBhcnJhbmdlZD9cbiAgICAvLyBJZiB3ZSBtb3ZlIHRoZW0gc2VxdWVudGlhbGx5IHRvIC0xLCB0aGV5IHdpbGwgYmUgb3JkZXJlZCBBLCBCLCBDLi4uIGF0IHRoZSBib3R0b20uXG4gICAgLy8gVGhpcyBzZWVtcyBjb3JyZWN0IGZvciBcInNvcnRpbmcgZ3JvdXBzXCIuXG5cbiAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgZ3JvdXBSZXBzKSB7XG4gICAgICAgIGF3YWl0IGNocm9tZS50YWJHcm91cHMubW92ZShpdGVtLmdyb3VwLmlkLCB7IGluZGV4OiAtMSB9KTtcbiAgICB9XG59O1xuXG5leHBvcnQgY29uc3QgY2xvc2VHcm91cCA9IGFzeW5jIChncm91cDogVGFiR3JvdXApID0+IHtcbiAgY29uc3QgaWRzID0gZ3JvdXAudGFicy5tYXAoKHRhYikgPT4gdGFiLmlkKTtcbiAgYXdhaXQgY2hyb21lLnRhYnMucmVtb3ZlKGlkcyk7XG4gIGxvZ0luZm8oXCJDbG9zZWQgZ3JvdXBcIiwgeyBsYWJlbDogZ3JvdXAubGFiZWwsIGNvdW50OiBpZHMubGVuZ3RoIH0pO1xufTtcblxuY29uc3QgZ2V0VGFic0J5SWRzID0gYXN5bmMgKHRhYklkczogbnVtYmVyW10pOiBQcm9taXNlPGNocm9tZS50YWJzLlRhYltdPiA9PiB7XG4gIGlmICghdGFiSWRzLmxlbmd0aCkgcmV0dXJuIFtdO1xuICBjb25zdCBhbGxUYWJzID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoe30pO1xuICBjb25zdCB0YWJNYXAgPSBuZXcgTWFwKGFsbFRhYnMubWFwKHQgPT4gW3QuaWQsIHRdKSk7XG4gIHJldHVybiB0YWJJZHNcbiAgICAubWFwKGlkID0+IHRhYk1hcC5nZXQoaWQpKVxuICAgIC5maWx0ZXIoKHQpOiB0IGlzIGNocm9tZS50YWJzLlRhYiA9PiB0ICE9PSB1bmRlZmluZWQgJiYgdC5pZCAhPT0gdW5kZWZpbmVkICYmIHQud2luZG93SWQgIT09IHVuZGVmaW5lZCk7XG59O1xuXG5leHBvcnQgY29uc3QgbWVyZ2VUYWJzID0gYXN5bmMgKHRhYklkczogbnVtYmVyW10pID0+IHtcbiAgaWYgKCF0YWJJZHMubGVuZ3RoKSByZXR1cm47XG4gIGNvbnN0IHZhbGlkVGFicyA9IGF3YWl0IGdldFRhYnNCeUlkcyh0YWJJZHMpO1xuXG4gIGlmICh2YWxpZFRhYnMubGVuZ3RoID09PSAwKSByZXR1cm47XG5cbiAgLy8gVGFyZ2V0IFdpbmRvdzogVGhlIG9uZSB3aXRoIHRoZSBtb3N0IHNlbGVjdGVkIHRhYnMsIG9yIHRoZSBmaXJzdCBvbmUuXG4gIC8vIFVzaW5nIHRoZSBmaXJzdCB0YWIncyB3aW5kb3cgYXMgdGhlIHRhcmdldC5cbiAgY29uc3QgdGFyZ2V0V2luZG93SWQgPSB2YWxpZFRhYnNbMF0ud2luZG93SWQ7XG5cbiAgLy8gMS4gTW92ZSB0YWJzIHRvIHRhcmdldCB3aW5kb3dcbiAgY29uc3QgdGFic1RvTW92ZSA9IHZhbGlkVGFicy5maWx0ZXIodCA9PiB0LndpbmRvd0lkICE9PSB0YXJnZXRXaW5kb3dJZCk7XG4gIGlmICh0YWJzVG9Nb3ZlLmxlbmd0aCA+IDApIHtcbiAgICBjb25zdCBtb3ZlSWRzID0gdGFic1RvTW92ZS5tYXAodCA9PiB0LmlkISk7XG4gICAgYXdhaXQgY2hyb21lLnRhYnMubW92ZShtb3ZlSWRzLCB7IHdpbmRvd0lkOiB0YXJnZXRXaW5kb3dJZCwgaW5kZXg6IC0xIH0pO1xuICB9XG5cbiAgLy8gMi4gR3JvdXAgdGhlbVxuICAvLyBDaGVjayBpZiB0aGVyZSBpcyBhbiBleGlzdGluZyBncm91cCBpbiB0aGUgdGFyZ2V0IHdpbmRvdyB0aGF0IHdhcyBwYXJ0IG9mIHRoZSBzZWxlY3Rpb24uXG4gIC8vIFdlIHByaW9yaXRpemUgdGhlIGdyb3VwIG9mIHRoZSBmaXJzdCB0YWIgaWYgaXQgaGFzIG9uZS5cbiAgY29uc3QgZmlyc3RUYWJHcm91cElkID0gdmFsaWRUYWJzWzBdLmdyb3VwSWQ7XG4gIGxldCB0YXJnZXRHcm91cElkOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cbiAgaWYgKGZpcnN0VGFiR3JvdXBJZCAmJiBmaXJzdFRhYkdyb3VwSWQgIT09IC0xKSB7XG4gICAgICAvLyBWZXJpZnkgdGhlIGdyb3VwIGlzIGluIHRoZSB0YXJnZXQgd2luZG93IChpdCBzaG91bGQgYmUsIGFzIHdlIHBpY2tlZCB0YXJnZXRXaW5kb3dJZCBmcm9tIHZhbGlkVGFic1swXSlcbiAgICAgIC8vIEJ1dCBpZiB2YWxpZFRhYnNbMF0gd2FzIG1vdmVkIChpdCB3YXNuJ3QsIGFzIGl0IGRlZmluZWQgdGhlIHRhcmdldCksIGl0J3MgZmluZS5cbiAgICAgIHRhcmdldEdyb3VwSWQgPSBmaXJzdFRhYkdyb3VwSWQ7XG4gIH0gZWxzZSB7XG4gICAgICAvLyBMb29rIGZvciBhbnkgb3RoZXIgZ3JvdXAgaW4gdGhlIHNlbGVjdGlvbiB0aGF0IGlzIGluIHRoZSB0YXJnZXQgd2luZG93XG4gICAgICBjb25zdCBvdGhlckdyb3VwID0gdmFsaWRUYWJzLmZpbmQodCA9PiB0LndpbmRvd0lkID09PSB0YXJnZXRXaW5kb3dJZCAmJiB0Lmdyb3VwSWQgIT09IC0xKTtcbiAgICAgIGlmIChvdGhlckdyb3VwKSB7XG4gICAgICAgICAgdGFyZ2V0R3JvdXBJZCA9IG90aGVyR3JvdXAuZ3JvdXBJZDtcbiAgICAgIH1cbiAgfVxuXG4gIGNvbnN0IGlkcyA9IHZhbGlkVGFicy5tYXAodCA9PiB0LmlkISk7XG4gIGF3YWl0IGNocm9tZS50YWJzLmdyb3VwKHsgdGFiSWRzOiBpZHMsIGdyb3VwSWQ6IHRhcmdldEdyb3VwSWQgfSk7XG4gIGxvZ0luZm8oXCJNZXJnZWQgdGFic1wiLCB7IGNvdW50OiBpZHMubGVuZ3RoLCB0YXJnZXRXaW5kb3dJZCwgdGFyZ2V0R3JvdXBJZCB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBzcGxpdFRhYnMgPSBhc3luYyAodGFiSWRzOiBudW1iZXJbXSkgPT4ge1xuICBpZiAodGFiSWRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuXG4gIC8vIDEuIFZhbGlkYXRlIHRhYnNcbiAgY29uc3QgdmFsaWRUYWJzID0gYXdhaXQgZ2V0VGFic0J5SWRzKHRhYklkcyk7XG5cbiAgaWYgKHZhbGlkVGFicy5sZW5ndGggPT09IDApIHJldHVybjtcblxuICAvLyAyLiBDcmVhdGUgbmV3IHdpbmRvdyB3aXRoIHRoZSBmaXJzdCB0YWJcbiAgY29uc3QgZmlyc3RUYWIgPSB2YWxpZFRhYnNbMF07XG4gIGNvbnN0IG5ld1dpbmRvdyA9IGF3YWl0IGNocm9tZS53aW5kb3dzLmNyZWF0ZSh7IHRhYklkOiBmaXJzdFRhYi5pZCB9KTtcblxuICAvLyAzLiBNb3ZlIHJlbWFpbmluZyB0YWJzIHRvIG5ldyB3aW5kb3dcbiAgaWYgKHZhbGlkVGFicy5sZW5ndGggPiAxKSB7XG4gICAgY29uc3QgcmVtYWluaW5nVGFiSWRzID0gdmFsaWRUYWJzLnNsaWNlKDEpLm1hcCh0ID0+IHQuaWQhKTtcbiAgICBhd2FpdCBjaHJvbWUudGFicy5tb3ZlKHJlbWFpbmluZ1RhYklkcywgeyB3aW5kb3dJZDogbmV3V2luZG93LmlkISwgaW5kZXg6IC0xIH0pO1xuICB9XG5cbiAgbG9nSW5mbyhcIlNwbGl0IHRhYnMgdG8gbmV3IHdpbmRvd1wiLCB7IGNvdW50OiB2YWxpZFRhYnMubGVuZ3RoLCBuZXdXaW5kb3dJZDogbmV3V2luZG93LmlkIH0pO1xufTtcbiIsICJpbXBvcnQgeyBVbmRvU3RhdGUsIFNhdmVkU3RhdGUsIFdpbmRvd1N0YXRlLCBTdG9yZWRUYWJTdGF0ZSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGdldFN0b3JlZFZhbHVlLCBzZXRTdG9yZWRWYWx1ZSB9IGZyb20gXCIuL3N0b3JhZ2UuanNcIjtcbmltcG9ydCB7IGxvZ0luZm8sIGxvZ0Vycm9yIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcblxuY29uc3QgTUFYX1VORE9fU1RBQ0sgPSAxMDtcbmNvbnN0IFVORE9fU1RBQ0tfS0VZID0gXCJ1bmRvU3RhY2tcIjtcbmNvbnN0IFNBVkVEX1NUQVRFU19LRVkgPSBcInNhdmVkU3RhdGVzXCI7XG5cbmV4cG9ydCBjb25zdCBjYXB0dXJlQ3VycmVudFN0YXRlID0gYXN5bmMgKCk6IFByb21pc2U8VW5kb1N0YXRlPiA9PiB7XG4gIGNvbnN0IHdpbmRvd3MgPSBhd2FpdCBjaHJvbWUud2luZG93cy5nZXRBbGwoeyBwb3B1bGF0ZTogdHJ1ZSB9KTtcbiAgY29uc3Qgd2luZG93U3RhdGVzOiBXaW5kb3dTdGF0ZVtdID0gW107XG5cbiAgZm9yIChjb25zdCB3aW4gb2Ygd2luZG93cykge1xuICAgIGlmICghd2luLnRhYnMpIGNvbnRpbnVlO1xuICAgIGNvbnN0IHRhYlN0YXRlczogU3RvcmVkVGFiU3RhdGVbXSA9IHdpbi50YWJzLm1hcCgodGFiKSA9PiB7XG4gICAgICBsZXQgZ3JvdXBUaXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgbGV0IGdyb3VwQ29sb3I6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgIC8vIE5vdGU6IHRhYi5ncm91cElkIGlzIC0xIGlmIG5vdCBncm91cGVkLlxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgaWQ6IHRhYi5pZCxcbiAgICAgICAgdXJsOiB0YWIudXJsIHx8IFwiXCIsXG4gICAgICAgIHBpbm5lZDogQm9vbGVhbih0YWIucGlubmVkKSxcbiAgICAgICAgZ3JvdXBJZDogdGFiLmdyb3VwSWQsXG4gICAgICAgIGdyb3VwVGl0bGUsIC8vIFdpbGwgbmVlZCB0byBmZXRjaCBpZiBncm91cGVkXG4gICAgICAgIGdyb3VwQ29sb3IsXG4gICAgICB9O1xuICAgIH0pO1xuXG4gICAgLy8gUG9wdWxhdGUgZ3JvdXAgaW5mbyBpZiBuZWVkZWRcbiAgICAvLyBXZSBkbyB0aGlzIGluIGEgc2Vjb25kIHBhc3MgdG8gYmF0Y2ggb3IganVzdCBpbmRpdmlkdWFsbHkgaWYgbmVlZGVkLlxuICAgIC8vIEFjdHVhbGx5LCB3ZSBjYW4gZ2V0IGdyb3VwIGluZm8gZnJvbSBjaHJvbWUudGFiR3JvdXBzLlxuICAgIC8vIEhvd2V2ZXIsIHRoZSB0YWIgb2JqZWN0IGRvZXNuJ3QgaGF2ZSB0aGUgZ3JvdXAgdGl0bGUgZGlyZWN0bHkuXG5cbiAgICAvLyBPcHRpbWl6YXRpb246IEdldCBhbGwgZ3JvdXBzIGZpcnN0LlxuXG4gICAgd2luZG93U3RhdGVzLnB1c2goeyB0YWJzOiB0YWJTdGF0ZXMgfSk7XG4gIH1cblxuICAvLyBFbnJpY2ggd2l0aCBncm91cCBpbmZvXG4gIGNvbnN0IGFsbEdyb3VwcyA9IGF3YWl0IGNocm9tZS50YWJHcm91cHMucXVlcnkoe30pO1xuICBjb25zdCBncm91cE1hcCA9IG5ldyBNYXAoYWxsR3JvdXBzLm1hcChnID0+IFtnLmlkLCBnXSkpO1xuXG4gIGZvciAoY29uc3Qgd2luIG9mIHdpbmRvd1N0YXRlcykge1xuICAgIGZvciAoY29uc3QgdGFiIG9mIHdpbi50YWJzKSB7XG4gICAgICBpZiAodGFiLmdyb3VwSWQgJiYgdGFiLmdyb3VwSWQgIT09IGNocm9tZS50YWJHcm91cHMuVEFCX0dST1VQX0lEX05PTkUpIHtcbiAgICAgICAgY29uc3QgZyA9IGdyb3VwTWFwLmdldCh0YWIuZ3JvdXBJZCk7XG4gICAgICAgIGlmIChnKSB7XG4gICAgICAgICAgdGFiLmdyb3VwVGl0bGUgPSBnLnRpdGxlO1xuICAgICAgICAgIHRhYi5ncm91cENvbG9yID0gZy5jb2xvcjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxuICAgIHdpbmRvd3M6IHdpbmRvd1N0YXRlcyxcbiAgfTtcbn07XG5cbmV4cG9ydCBjb25zdCBwdXNoVW5kb1N0YXRlID0gYXN5bmMgKCkgPT4ge1xuICBjb25zdCBzdGF0ZSA9IGF3YWl0IGNhcHR1cmVDdXJyZW50U3RhdGUoKTtcbiAgY29uc3Qgc3RhY2sgPSAoYXdhaXQgZ2V0U3RvcmVkVmFsdWU8VW5kb1N0YXRlW10+KFVORE9fU1RBQ0tfS0VZKSkgfHwgW107XG4gIHN0YWNrLnB1c2goc3RhdGUpO1xuICBpZiAoc3RhY2subGVuZ3RoID4gTUFYX1VORE9fU1RBQ0spIHtcbiAgICBzdGFjay5zaGlmdCgpO1xuICB9XG4gIGF3YWl0IHNldFN0b3JlZFZhbHVlKFVORE9fU1RBQ0tfS0VZLCBzdGFjayk7XG4gIGxvZ0luZm8oXCJQdXNoZWQgdW5kbyBzdGF0ZVwiLCB7IHN0YWNrU2l6ZTogc3RhY2subGVuZ3RoIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IHNhdmVTdGF0ZSA9IGFzeW5jIChuYW1lOiBzdHJpbmcpID0+IHtcbiAgY29uc3QgdW5kb1N0YXRlID0gYXdhaXQgY2FwdHVyZUN1cnJlbnRTdGF0ZSgpO1xuICBjb25zdCBzYXZlZFN0YXRlOiBTYXZlZFN0YXRlID0ge1xuICAgIG5hbWUsXG4gICAgdGltZXN0YW1wOiB1bmRvU3RhdGUudGltZXN0YW1wLFxuICAgIHdpbmRvd3M6IHVuZG9TdGF0ZS53aW5kb3dzLFxuICB9O1xuICBjb25zdCBzYXZlZFN0YXRlcyA9IChhd2FpdCBnZXRTdG9yZWRWYWx1ZTxTYXZlZFN0YXRlW10+KFNBVkVEX1NUQVRFU19LRVkpKSB8fCBbXTtcbiAgc2F2ZWRTdGF0ZXMucHVzaChzYXZlZFN0YXRlKTtcbiAgYXdhaXQgc2V0U3RvcmVkVmFsdWUoU0FWRURfU1RBVEVTX0tFWSwgc2F2ZWRTdGF0ZXMpO1xuICBsb2dJbmZvKFwiU2F2ZWQgc3RhdGVcIiwgeyBuYW1lIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IGdldFNhdmVkU3RhdGVzID0gYXN5bmMgKCk6IFByb21pc2U8U2F2ZWRTdGF0ZVtdPiA9PiB7XG4gIHJldHVybiAoYXdhaXQgZ2V0U3RvcmVkVmFsdWU8U2F2ZWRTdGF0ZVtdPihTQVZFRF9TVEFURVNfS0VZKSkgfHwgW107XG59O1xuXG5leHBvcnQgY29uc3QgZGVsZXRlU2F2ZWRTdGF0ZSA9IGFzeW5jIChuYW1lOiBzdHJpbmcpID0+IHtcbiAgbGV0IHNhdmVkU3RhdGVzID0gKGF3YWl0IGdldFN0b3JlZFZhbHVlPFNhdmVkU3RhdGVbXT4oU0FWRURfU1RBVEVTX0tFWSkpIHx8IFtdO1xuICBzYXZlZFN0YXRlcyA9IHNhdmVkU3RhdGVzLmZpbHRlcihzID0+IHMubmFtZSAhPT0gbmFtZSk7XG4gIGF3YWl0IHNldFN0b3JlZFZhbHVlKFNBVkVEX1NUQVRFU19LRVksIHNhdmVkU3RhdGVzKTtcbiAgbG9nSW5mbyhcIkRlbGV0ZWQgc2F2ZWQgc3RhdGVcIiwgeyBuYW1lIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IHVuZG8gPSBhc3luYyAoKSA9PiB7XG4gIGNvbnN0IHN0YWNrID0gKGF3YWl0IGdldFN0b3JlZFZhbHVlPFVuZG9TdGF0ZVtdPihVTkRPX1NUQUNLX0tFWSkpIHx8IFtdO1xuICBjb25zdCBzdGF0ZSA9IHN0YWNrLnBvcCgpO1xuICBpZiAoIXN0YXRlKSB7XG4gICAgbG9nSW5mbyhcIlVuZG8gc3RhY2sgZW1wdHlcIik7XG4gICAgcmV0dXJuO1xuICB9XG4gIGF3YWl0IHNldFN0b3JlZFZhbHVlKFVORE9fU1RBQ0tfS0VZLCBzdGFjayk7XG4gIGF3YWl0IHJlc3RvcmVTdGF0ZShzdGF0ZSk7XG4gIGxvZ0luZm8oXCJVbmRpZCBsYXN0IGFjdGlvblwiKTtcbn07XG5cbmV4cG9ydCBjb25zdCByZXN0b3JlU3RhdGUgPSBhc3luYyAoc3RhdGU6IFVuZG9TdGF0ZSB8IFNhdmVkU3RhdGUpID0+IHtcbiAgLy8gU3RyYXRlZ3k6XG4gIC8vIDEuIFVuZ3JvdXAgYWxsIHRhYnMgKG9wdGlvbmFsLCBidXQgY2xlYW5lcikuXG4gIC8vIDIuIE1vdmUgdGFicyB0byBjb3JyZWN0IHdpbmRvd3MgYW5kIGluZGljZXMuXG4gIC8vIDMuIFJlLWdyb3VwIHRhYnMuXG5cbiAgLy8gV2UgbmVlZCB0byBtYXRjaCBjdXJyZW50IHRhYnMgdG8gc3RvcmVkIHRhYnMuXG4gIC8vIFByaW9yaXR5OiBJRCBtYXRjaCAtPiBVUkwgbWF0Y2guXG5cbiAgY29uc3QgY3VycmVudFRhYnMgPSBhd2FpdCBjaHJvbWUudGFicy5xdWVyeSh7fSk7XG4gIGNvbnN0IGN1cnJlbnRUYWJNYXAgPSBuZXcgTWFwPG51bWJlciwgY2hyb21lLnRhYnMuVGFiPigpO1xuICBjb25zdCBjdXJyZW50VXJsTWFwID0gbmV3IE1hcDxzdHJpbmcsIGNocm9tZS50YWJzLlRhYltdPigpOyAvLyBVUkwgLT4gbGlzdCBvZiB0YWJzXG5cbiAgY3VycmVudFRhYnMuZm9yRWFjaCh0ID0+IHtcbiAgICBpZiAodC5pZCkgY3VycmVudFRhYk1hcC5zZXQodC5pZCwgdCk7XG4gICAgaWYgKHQudXJsKSB7XG4gICAgICBjb25zdCBsaXN0ID0gY3VycmVudFVybE1hcC5nZXQodC51cmwpIHx8IFtdO1xuICAgICAgbGlzdC5wdXNoKHQpO1xuICAgICAgY3VycmVudFVybE1hcC5zZXQodC51cmwsIGxpc3QpO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gSGVscGVyIHRvIGZpbmQgYSB0YWIgKGFzeW5jIHRvIGFsbG93IGNyZWF0aW9uKVxuICBjb25zdCBmaW5kT3JDcmVhdGVUYWIgPSBhc3luYyAoc3RvcmVkOiBTdG9yZWRUYWJTdGF0ZSk6IFByb21pc2U8Y2hyb21lLnRhYnMuVGFiIHwgdW5kZWZpbmVkPiA9PiB7XG4gICAgLy8gVHJ5IElEXG4gICAgaWYgKHN0b3JlZC5pZCAmJiBjdXJyZW50VGFiTWFwLmhhcyhzdG9yZWQuaWQpKSB7XG4gICAgICBjb25zdCB0ID0gY3VycmVudFRhYk1hcC5nZXQoc3RvcmVkLmlkKTtcbiAgICAgIGN1cnJlbnRUYWJNYXAuZGVsZXRlKHN0b3JlZC5pZCEpOyAvLyBDb25zdW1lXG4gICAgICAvLyBBbHNvIHJlbW92ZSBmcm9tIHVybCBtYXAgdG8gYXZvaWQgZG91YmxlIHVzYWdlXG4gICAgICBpZiAodD8udXJsKSB7XG4gICAgICAgICBjb25zdCBsaXN0ID0gY3VycmVudFVybE1hcC5nZXQodC51cmwpO1xuICAgICAgICAgaWYgKGxpc3QpIHtcbiAgICAgICAgICAgIGNvbnN0IGlkeCA9IGxpc3QuZmluZEluZGV4KHggPT4geC5pZCA9PT0gdC5pZCk7XG4gICAgICAgICAgICBpZiAoaWR4ICE9PSAtMSkgbGlzdC5zcGxpY2UoaWR4LCAxKTtcbiAgICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiB0O1xuICAgIH1cbiAgICAvLyBUcnkgVVJMXG4gICAgY29uc3QgbGlzdCA9IGN1cnJlbnRVcmxNYXAuZ2V0KHN0b3JlZC51cmwpO1xuICAgIGlmIChsaXN0ICYmIGxpc3QubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgdCA9IGxpc3Quc2hpZnQoKTtcbiAgICAgIGlmICh0Py5pZCkgY3VycmVudFRhYk1hcC5kZWxldGUodC5pZCk7IC8vIENvbnN1bWVcbiAgICAgIHJldHVybiB0O1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSBpZiBtaXNzaW5nXG4gICAgaWYgKHN0b3JlZC51cmwpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHQgPSBhd2FpdCBjaHJvbWUudGFicy5jcmVhdGUoeyB1cmw6IHN0b3JlZC51cmwsIGFjdGl2ZTogZmFsc2UgfSk7XG4gICAgICAgICAgICByZXR1cm4gdDtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgbG9nRXJyb3IoXCJGYWlsZWQgdG8gY3JlYXRlIHRhYlwiLCB7IHVybDogc3RvcmVkLnVybCwgZXJyb3I6IGUgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9O1xuXG4gIC8vIFdlIG5lZWQgdG8gcmVjb25zdHJ1Y3Qgd2luZG93cy5cbiAgLy8gSWRlYWxseSwgd2UgbWFwIHN0YXRlIHdpbmRvd3MgdG8gY3VycmVudCB3aW5kb3dzLlxuICAvLyBCdXQgc3RyaWN0bHksIHdlIGNhbiBqdXN0IG1vdmUgdGFicy5cblxuICAvLyBGb3Igc2ltcGxpY2l0eSwgbGV0J3MgYXNzdW1lIHdlIHVzZSBleGlzdGluZyB3aW5kb3dzIGFzIG11Y2ggYXMgcG9zc2libGUuXG4gIC8vIE9yIGNyZWF0ZSBuZXcgb25lcyBpZiB3ZSBydW4gb3V0P1xuICAvLyBMZXQncyBpdGVyYXRlIHN0b3JlZCB3aW5kb3dzLlxuXG4gIGNvbnN0IGN1cnJlbnRXaW5kb3dzID0gYXdhaXQgY2hyb21lLndpbmRvd3MuZ2V0QWxsKCk7XG5cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdGF0ZS53aW5kb3dzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3Qgd2luU3RhdGUgPSBzdGF0ZS53aW5kb3dzW2ldO1xuXG4gICAgLy8gSWRlbnRpZnkgYWxsIHRhYnMgZm9yIHRoaXMgd2luZG93IGZpcnN0LlxuICAgIC8vIFdlIGRvIHRoaXMgQkVGT1JFIGNyZWF0aW5nIGEgd2luZG93IHRvIGF2b2lkIGNyZWF0aW5nIGVtcHR5IHdpbmRvd3MuXG4gICAgY29uc3QgdGFic1RvTW92ZTogeyB0YWJJZDogbnVtYmVyLCBzdG9yZWQ6IFN0b3JlZFRhYlN0YXRlIH1bXSA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBzdG9yZWRUYWIgb2Ygd2luU3RhdGUudGFicykge1xuICAgICAgY29uc3QgZm91bmQgPSBhd2FpdCBmaW5kT3JDcmVhdGVUYWIoc3RvcmVkVGFiKTtcbiAgICAgIGlmIChmb3VuZCAmJiBmb3VuZC5pZCkge1xuICAgICAgICB0YWJzVG9Nb3ZlLnB1c2goeyB0YWJJZDogZm91bmQuaWQsIHN0b3JlZDogc3RvcmVkVGFiIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICh0YWJzVG9Nb3ZlLmxlbmd0aCA9PT0gMCkgY29udGludWU7XG5cbiAgICBsZXQgdGFyZ2V0V2luZG93SWQ6IG51bWJlcjtcblxuICAgIGlmIChpIDwgY3VycmVudFdpbmRvd3MubGVuZ3RoKSB7XG4gICAgICB0YXJnZXRXaW5kb3dJZCA9IGN1cnJlbnRXaW5kb3dzW2ldLmlkITtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gQ3JlYXRlIG5ldyB3aW5kb3dcbiAgICAgIGNvbnN0IHdpbiA9IGF3YWl0IGNocm9tZS53aW5kb3dzLmNyZWF0ZSh7fSk7XG4gICAgICB0YXJnZXRXaW5kb3dJZCA9IHdpbi5pZCE7XG4gICAgICAvLyBOb3RlOiBOZXcgd2luZG93IGNyZWF0aW9uIGFkZHMgYSB0YWIuIFdlIG1pZ2h0IHdhbnQgdG8gcmVtb3ZlIGl0IGxhdGVyIG9yIGlnbm9yZSBpdC5cbiAgICB9XG5cbiAgICBjb25zdCB0YWJJZHMgPSB0YWJzVG9Nb3ZlLm1hcCh0ID0+IHQudGFiSWQpO1xuXG4gICAgLy8gTW92ZSBhbGwgdG8gd2luZG93LlxuICAgIC8vIE5vdGU6IElmIHdlIG1vdmUgdG8gaW5kZXggMCwgdGhleSB3aWxsIGJlIHByZXBlbmRlZC5cbiAgICAvLyBXZSBzaG91bGQgcHJvYmFibHkganVzdCBtb3ZlIHRoZW0gdG8gdGhlIHdpbmRvdyBmaXJzdC5cbiAgICAvLyBJZiB3ZSBtb3ZlIHRoZW0gaW5kaXZpZHVhbGx5IHRvIGNvcnJlY3QgaW5kZXgsIGl0J3Mgc2FmZXIuXG5cbiAgICBmb3IgKGxldCBqID0gMDsgaiA8IHRhYnNUb01vdmUubGVuZ3RoOyBqKyspIHtcbiAgICAgIGNvbnN0IHsgdGFiSWQsIHN0b3JlZCB9ID0gdGFic1RvTW92ZVtqXTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGNocm9tZS50YWJzLm1vdmUodGFiSWQsIHsgd2luZG93SWQ6IHRhcmdldFdpbmRvd0lkLCBpbmRleDogaiB9KTtcbiAgICAgICAgaWYgKHN0b3JlZC5waW5uZWQpIHtcbiAgICAgICAgICAgICBhd2FpdCBjaHJvbWUudGFicy51cGRhdGUodGFiSWQsIHsgcGlubmVkOiB0cnVlIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgIC8vIElmIGN1cnJlbnRseSBwaW5uZWQgYnV0IHNob3VsZG4ndCBiZVxuICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnQgPSBhd2FpdCBjaHJvbWUudGFicy5nZXQodGFiSWQpO1xuICAgICAgICAgICAgIGlmIChjdXJyZW50LnBpbm5lZCkgYXdhaXQgY2hyb21lLnRhYnMudXBkYXRlKHRhYklkLCB7IHBpbm5lZDogZmFsc2UgfSk7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgbG9nRXJyb3IoXCJGYWlsZWQgdG8gbW92ZSB0YWJcIiwgeyB0YWJJZCwgZXJyb3I6IGUgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gSGFuZGxlIEdyb3Vwc1xuICAgIC8vIElkZW50aWZ5IGdyb3VwcyBpbiB0aGlzIHdpbmRvd1xuICAgIGNvbnN0IGdyb3VwcyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXJbXT4oKTsgLy8gdGl0bGUrY29sb3IgLT4gdGFiSWRzXG4gICAgY29uc3QgZ3JvdXBDb2xvcnMgPSBuZXcgTWFwPHN0cmluZywgY2hyb21lLnRhYkdyb3Vwcy5Db2xvckVudW0+KCk7XG5cbiAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgdGFic1RvTW92ZSkge1xuICAgICAgaWYgKGl0ZW0uc3RvcmVkLmdyb3VwVGl0bGUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAvLyBVc2UgdGl0bGUgYXMga2V5IChvciB1bmlxdWUgSUQgaWYgd2UgaGFkIG9uZSwgYnV0IHdlIGRvbid0IHBlcnNpc3QgZ3JvdXAgSURzKVxuICAgICAgICAvLyBHcm91cCBJRCBpbiBzdG9yYWdlIGlzIGVwaGVtZXJhbC4gVGl0bGUgaXMga2V5LlxuICAgICAgICBjb25zdCBrZXkgPSBpdGVtLnN0b3JlZC5ncm91cFRpdGxlO1xuICAgICAgICBjb25zdCBsaXN0ID0gZ3JvdXBzLmdldChrZXkpIHx8IFtdO1xuICAgICAgICBsaXN0LnB1c2goaXRlbS50YWJJZCk7XG4gICAgICAgIGdyb3Vwcy5zZXQoa2V5LCBsaXN0KTtcbiAgICAgICAgaWYgKGl0ZW0uc3RvcmVkLmdyb3VwQ29sb3IpIHtcbiAgICAgICAgICAgICBncm91cENvbG9ycy5zZXQoa2V5LCBpdGVtLnN0b3JlZC5ncm91cENvbG9yIGFzIGNocm9tZS50YWJHcm91cHMuQ29sb3JFbnVtKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgIC8vIFVuZ3JvdXAgaWYgbmVlZGVkXG4gICAgICAgICBhd2FpdCBjaHJvbWUudGFicy51bmdyb3VwKGl0ZW0udGFiSWQpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgW3RpdGxlLCBpZHNdIG9mIGdyb3Vwcy5lbnRyaWVzKCkpIHtcbiAgICAgIGlmIChpZHMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCBncm91cElkID0gYXdhaXQgY2hyb21lLnRhYnMuZ3JvdXAoeyB0YWJJZHM6IGlkcyB9KTtcbiAgICAgICAgYXdhaXQgY2hyb21lLnRhYkdyb3Vwcy51cGRhdGUoZ3JvdXBJZCwge1xuICAgICAgICAgICAgIHRpdGxlOiB0aXRsZSxcbiAgICAgICAgICAgICBjb2xvcjogZ3JvdXBDb2xvcnMuZ2V0KHRpdGxlKSB8fCBcImdyZXlcIlxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG4iLCAiaW1wb3J0IHsgYXBwbHlUYWJHcm91cHMsIGFwcGx5VGFiU29ydGluZywgY2FsY3VsYXRlVGFiR3JvdXBzLCBmZXRjaEN1cnJlbnRUYWJHcm91cHMsIG1lcmdlVGFicywgc3BsaXRUYWJzIH0gZnJvbSBcIi4vdGFiTWFuYWdlci5qc1wiO1xuaW1wb3J0IHsgbG9hZFByZWZlcmVuY2VzLCBzYXZlUHJlZmVyZW5jZXMgfSBmcm9tIFwiLi9wcmVmZXJlbmNlcy5qc1wiO1xuaW1wb3J0IHsgc2V0Q3VzdG9tU3RyYXRlZ2llcyB9IGZyb20gXCIuL2dyb3VwaW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcsIGxvZ0luZm8sIGdldExvZ3MsIGNsZWFyTG9ncywgc2V0TG9nZ2VyUHJlZmVyZW5jZXMsIGluaXRMb2dnZXIsIGFkZExvZ0VudHJ5LCBsb2dnZXJSZWFkeSB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBwdXNoVW5kb1N0YXRlLCBzYXZlU3RhdGUsIHVuZG8sIGdldFNhdmVkU3RhdGVzLCBkZWxldGVTYXZlZFN0YXRlLCByZXN0b3JlU3RhdGUgfSBmcm9tIFwiLi9zdGF0ZU1hbmFnZXIuanNcIjtcbmltcG9ydCB7XG4gIEFwcGx5R3JvdXBpbmdQYXlsb2FkLFxuICBHcm91cGluZ1NlbGVjdGlvbixcbiAgR3JvdXBpbmdTdHJhdGVneSxcbiAgUHJlZmVyZW5jZXMsXG4gIFJ1bnRpbWVNZXNzYWdlLFxuICBSdW50aW1lUmVzcG9uc2UsXG4gIFNvcnRpbmdTdHJhdGVneSxcbiAgVGFiR3JvdXBcbn0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuXG5jaHJvbWUucnVudGltZS5vbkluc3RhbGxlZC5hZGRMaXN0ZW5lcihhc3luYyAoKSA9PiB7XG4gIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gIHNldEN1c3RvbVN0cmF0ZWdpZXMocHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXSk7XG4gIGxvZ0luZm8oXCJFeHRlbnNpb24gaW5zdGFsbGVkXCIsIHtcbiAgICB2ZXJzaW9uOiBjaHJvbWUucnVudGltZS5nZXRNYW5pZmVzdCgpLnZlcnNpb24sXG4gICAgbG9nTGV2ZWw6IHByZWZzLmxvZ0xldmVsLFxuICAgIHN0cmF0ZWdpZXNDb3VudDogcHJlZnMuY3VzdG9tU3RyYXRlZ2llcz8ubGVuZ3RoIHx8IDBcbiAgfSk7XG59KTtcblxuLy8gSW5pdGlhbGl6ZSBsb2dnZXIgb24gc3RhcnR1cFxubG9hZFByZWZlcmVuY2VzKCkudGhlbihhc3luYyAocHJlZnMpID0+IHtcbiAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuICAgIGF3YWl0IGluaXRMb2dnZXIoKTtcbiAgICBsb2dJbmZvKFwiU2VydmljZSBXb3JrZXIgSW5pdGlhbGl6ZWRcIiwge1xuICAgICAgICB2ZXJzaW9uOiBjaHJvbWUucnVudGltZS5nZXRNYW5pZmVzdCgpLnZlcnNpb24sXG4gICAgICAgIGxvZ0xldmVsOiBwcmVmcy5sb2dMZXZlbFxuICAgIH0pO1xufSk7XG5cbmNvbnN0IGhhbmRsZU1lc3NhZ2UgPSBhc3luYyA8VERhdGE+KFxuICBtZXNzYWdlOiBSdW50aW1lTWVzc2FnZSxcbiAgc2VuZGVyOiBjaHJvbWUucnVudGltZS5NZXNzYWdlU2VuZGVyXG4pOiBQcm9taXNlPFJ1bnRpbWVSZXNwb25zZTxURGF0YT4+ID0+IHtcbiAgbG9nRGVidWcoXCJSZWNlaXZlZCBtZXNzYWdlXCIsIHsgdHlwZTogbWVzc2FnZS50eXBlLCBmcm9tOiBzZW5kZXIuaWQgfSk7XG4gIHN3aXRjaCAobWVzc2FnZS50eXBlKSB7XG4gICAgY2FzZSBcImdldFN0YXRlXCI6IHtcbiAgICAgIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuICAgICAgLy8gVXNlIGZldGNoQ3VycmVudFRhYkdyb3VwcyB0byByZXR1cm4gdGhlIGFjdHVhbCBzdGF0ZSBvZiB0aGUgYnJvd3NlciB0YWJzXG4gICAgICBjb25zdCBncm91cHMgPSBhd2FpdCBmZXRjaEN1cnJlbnRUYWJHcm91cHMocHJlZnMpO1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGRhdGE6IHsgZ3JvdXBzLCBwcmVmZXJlbmNlczogcHJlZnMgfSBhcyBURGF0YSB9O1xuICAgIH1cbiAgICBjYXNlIFwiYXBwbHlHcm91cGluZ1wiOiB7XG4gICAgICBsb2dJbmZvKFwiQXBwbHlpbmcgZ3JvdXBpbmcgZnJvbSBtZXNzYWdlXCIsIHsgc29ydGluZzogKG1lc3NhZ2UucGF5bG9hZCBhcyBhbnkpPy5zb3J0aW5nIH0pO1xuICAgICAgYXdhaXQgcHVzaFVuZG9TdGF0ZSgpO1xuICAgICAgY29uc3QgcHJlZnMgPSBhd2FpdCBsb2FkUHJlZmVyZW5jZXMoKTtcbiAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMocHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXSk7XG4gICAgICBjb25zdCBwYXlsb2FkID0gKG1lc3NhZ2UucGF5bG9hZCBhcyBBcHBseUdyb3VwaW5nUGF5bG9hZCB8IHVuZGVmaW5lZCkgPz8ge307XG4gICAgICBjb25zdCBzZWxlY3Rpb24gPSBwYXlsb2FkLnNlbGVjdGlvbiA/PyB7fTtcbiAgICAgIGNvbnN0IHNvcnRpbmcgPSBwYXlsb2FkLnNvcnRpbmc/Lmxlbmd0aCA/IHBheWxvYWQuc29ydGluZyA6IHVuZGVmaW5lZDtcblxuICAgICAgY29uc3QgcHJlZmVyZW5jZXMgPSBzb3J0aW5nID8geyAuLi5wcmVmcywgc29ydGluZyB9IDogcHJlZnM7XG5cbiAgICAgIGNvbnN0IG9uUHJvZ3Jlc3MgPSAoY29tcGxldGVkOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+IHtcbiAgICAgICAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICAgIHR5cGU6IFwiZ3JvdXBpbmdQcm9ncmVzc1wiLFxuICAgICAgICAgICAgICBwYXlsb2FkOiB7IGNvbXBsZXRlZCwgdG90YWwgfVxuICAgICAgICAgIH0pLmNhdGNoKCgpID0+IHt9KTtcbiAgICAgIH07XG5cbiAgICAgIC8vIFVzZSBjYWxjdWxhdGVUYWJHcm91cHMgdG8gZGV0ZXJtaW5lIHRoZSB0YXJnZXQgZ3JvdXBpbmdcbiAgICAgIGNvbnN0IGdyb3VwcyA9IGF3YWl0IGNhbGN1bGF0ZVRhYkdyb3VwcyhwcmVmZXJlbmNlcywgc2VsZWN0aW9uLCBvblByb2dyZXNzKTtcbiAgICAgIGF3YWl0IGFwcGx5VGFiR3JvdXBzKGdyb3Vwcyk7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSwgZGF0YTogeyBncm91cHMgfSBhcyBURGF0YSB9O1xuICAgIH1cbiAgICBjYXNlIFwiYXBwbHlTb3J0aW5nXCI6IHtcbiAgICAgIGxvZ0luZm8oXCJBcHBseWluZyBzb3J0aW5nIGZyb20gbWVzc2FnZVwiKTtcbiAgICAgIGF3YWl0IHB1c2hVbmRvU3RhdGUoKTtcbiAgICAgIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuICAgICAgY29uc3QgcGF5bG9hZCA9IChtZXNzYWdlLnBheWxvYWQgYXMgQXBwbHlHcm91cGluZ1BheWxvYWQgfCB1bmRlZmluZWQpID8/IHt9O1xuICAgICAgY29uc3Qgc2VsZWN0aW9uID0gcGF5bG9hZC5zZWxlY3Rpb24gPz8ge307XG4gICAgICBjb25zdCBzb3J0aW5nID0gcGF5bG9hZC5zb3J0aW5nPy5sZW5ndGggPyBwYXlsb2FkLnNvcnRpbmcgOiB1bmRlZmluZWQ7XG4gICAgICBjb25zdCBwcmVmZXJlbmNlcyA9IHNvcnRpbmcgPyB7IC4uLnByZWZzLCBzb3J0aW5nIH0gOiBwcmVmcztcblxuICAgICAgY29uc3Qgb25Qcm9ncmVzcyA9IChjb21wbGV0ZWQ6IG51bWJlciwgdG90YWw6IG51bWJlcikgPT4ge1xuICAgICAgICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgICAgdHlwZTogXCJncm91cGluZ1Byb2dyZXNzXCIsXG4gICAgICAgICAgICAgIHBheWxvYWQ6IHsgY29tcGxldGVkLCB0b3RhbCB9XG4gICAgICAgICAgfSkuY2F0Y2goKCkgPT4ge30pO1xuICAgICAgfTtcblxuICAgICAgYXdhaXQgYXBwbHlUYWJTb3J0aW5nKHByZWZlcmVuY2VzLCBzZWxlY3Rpb24sIG9uUHJvZ3Jlc3MpO1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICB9XG4gICAgY2FzZSBcIm1lcmdlU2VsZWN0aW9uXCI6IHtcbiAgICAgIGxvZ0luZm8oXCJNZXJnaW5nIHNlbGVjdGlvbiBmcm9tIG1lc3NhZ2VcIik7XG4gICAgICBhd2FpdCBwdXNoVW5kb1N0YXRlKCk7XG4gICAgICBjb25zdCBwYXlsb2FkID0gbWVzc2FnZS5wYXlsb2FkIGFzIHsgdGFiSWRzOiBudW1iZXJbXSB9O1xuICAgICAgaWYgKHBheWxvYWQ/LnRhYklkcz8ubGVuZ3RoKSB7XG4gICAgICAgIGF3YWl0IG1lcmdlVGFicyhwYXlsb2FkLnRhYklkcyk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICB9XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIk5vIHRhYnMgc2VsZWN0ZWRcIiB9O1xuICAgIH1cbiAgICBjYXNlIFwic3BsaXRTZWxlY3Rpb25cIjoge1xuICAgICAgbG9nSW5mbyhcIlNwbGl0dGluZyBzZWxlY3Rpb24gZnJvbSBtZXNzYWdlXCIpO1xuICAgICAgYXdhaXQgcHVzaFVuZG9TdGF0ZSgpO1xuICAgICAgY29uc3QgcGF5bG9hZCA9IG1lc3NhZ2UucGF5bG9hZCBhcyB7IHRhYklkczogbnVtYmVyW10gfTtcbiAgICAgIGlmIChwYXlsb2FkPy50YWJJZHM/Lmxlbmd0aCkge1xuICAgICAgICBhd2FpdCBzcGxpdFRhYnMocGF5bG9hZC50YWJJZHMpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJObyB0YWJzIHNlbGVjdGVkXCIgfTtcbiAgICB9XG4gICAgY2FzZSBcInVuZG9cIjoge1xuICAgICAgbG9nSW5mbyhcIlVuZG9pbmcgbGFzdCBhY3Rpb25cIik7XG4gICAgICBhd2FpdCB1bmRvKCk7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgIH1cbiAgICBjYXNlIFwic2F2ZVN0YXRlXCI6IHtcbiAgICAgIGNvbnN0IG5hbWUgPSAobWVzc2FnZS5wYXlsb2FkIGFzIGFueSk/Lm5hbWU7XG4gICAgICBpZiAodHlwZW9mIG5hbWUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgbG9nSW5mbyhcIlNhdmluZyBzdGF0ZSBmcm9tIG1lc3NhZ2VcIiwgeyBuYW1lIH0pO1xuICAgICAgICBhd2FpdCBzYXZlU3RhdGUobmFtZSk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICB9XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgbmFtZVwiIH07XG4gICAgfVxuICAgIGNhc2UgXCJnZXRTYXZlZFN0YXRlc1wiOiB7XG4gICAgICBjb25zdCBzdGF0ZXMgPSBhd2FpdCBnZXRTYXZlZFN0YXRlcygpO1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGRhdGE6IHN0YXRlcyBhcyBURGF0YSB9O1xuICAgIH1cbiAgICBjYXNlIFwicmVzdG9yZVN0YXRlXCI6IHtcbiAgICAgIGNvbnN0IHN0YXRlID0gKG1lc3NhZ2UucGF5bG9hZCBhcyBhbnkpPy5zdGF0ZTtcbiAgICAgIGlmIChzdGF0ZSkge1xuICAgICAgICBsb2dJbmZvKFwiUmVzdG9yaW5nIHN0YXRlIGZyb20gbWVzc2FnZVwiLCB7IG5hbWU6IHN0YXRlLm5hbWUgfSk7XG4gICAgICAgIGF3YWl0IHJlc3RvcmVTdGF0ZShzdGF0ZSk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICB9XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgc3RhdGVcIiB9O1xuICAgIH1cbiAgICBjYXNlIFwiZGVsZXRlU2F2ZWRTdGF0ZVwiOiB7XG4gICAgICBjb25zdCBuYW1lID0gKG1lc3NhZ2UucGF5bG9hZCBhcyBhbnkpPy5uYW1lO1xuICAgICAgaWYgKHR5cGVvZiBuYW1lID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIGxvZ0luZm8oXCJEZWxldGluZyBzYXZlZCBzdGF0ZSBmcm9tIG1lc3NhZ2VcIiwgeyBuYW1lIH0pO1xuICAgICAgICBhd2FpdCBkZWxldGVTYXZlZFN0YXRlKG5hbWUpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIG5hbWVcIiB9O1xuICAgIH1cbiAgICBjYXNlIFwibG9hZFByZWZlcmVuY2VzXCI6IHtcbiAgICAgIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGRhdGE6IHByZWZzIGFzIFREYXRhIH07XG4gICAgfVxuICAgIGNhc2UgXCJzYXZlUHJlZmVyZW5jZXNcIjoge1xuICAgICAgbG9nSW5mbyhcIlNhdmluZyBwcmVmZXJlbmNlcyBmcm9tIG1lc3NhZ2VcIik7XG4gICAgICBjb25zdCBwcmVmcyA9IGF3YWl0IHNhdmVQcmVmZXJlbmNlcyhtZXNzYWdlLnBheWxvYWQgYXMgYW55KTtcbiAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMocHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXSk7XG4gICAgICBzZXRMb2dnZXJQcmVmZXJlbmNlcyhwcmVmcyk7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSwgZGF0YTogcHJlZnMgYXMgVERhdGEgfTtcbiAgICB9XG4gICAgY2FzZSBcImdldExvZ3NcIjoge1xuICAgICAgICBhd2FpdCBsb2dnZXJSZWFkeTtcbiAgICAgICAgY29uc3QgbG9ncyA9IGdldExvZ3MoKTtcbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGRhdGE6IGxvZ3MgYXMgVERhdGEgfTtcbiAgICB9XG4gICAgY2FzZSBcImNsZWFyTG9nc1wiOiB7XG4gICAgICAgIGNsZWFyTG9ncygpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgIH1cbiAgICBjYXNlIFwibG9nRW50cnlcIjoge1xuICAgICAgICBjb25zdCBlbnRyeSA9IG1lc3NhZ2UucGF5bG9hZCBhcyBhbnk7XG4gICAgICAgIGlmIChlbnRyeSAmJiBlbnRyeS5sZXZlbCAmJiBlbnRyeS5tZXNzYWdlKSB7XG4gICAgICAgICAgICBhZGRMb2dFbnRyeShlbnRyeSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICB9XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiVW5rbm93biBtZXNzYWdlXCIgfTtcbiAgfVxufTtcblxuY2hyb21lLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKFxuICAoXG4gICAgbWVzc2FnZTogUnVudGltZU1lc3NhZ2UsXG4gICAgc2VuZGVyOiBjaHJvbWUucnVudGltZS5NZXNzYWdlU2VuZGVyLFxuICAgIHNlbmRSZXNwb25zZTogKHJlc3BvbnNlOiBSdW50aW1lUmVzcG9uc2UpID0+IHZvaWRcbiAgKSA9PiB7XG4gICAgaGFuZGxlTWVzc2FnZShtZXNzYWdlLCBzZW5kZXIpXG4gICAgLnRoZW4oKHJlc3BvbnNlKSA9PiBzZW5kUmVzcG9uc2UocmVzcG9uc2UpKVxuICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiBmYWxzZSwgZXJyb3I6IFN0cmluZyhlcnJvcikgfSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbik7XG5cbmNocm9tZS50YWJHcm91cHMub25SZW1vdmVkLmFkZExpc3RlbmVyKGFzeW5jIChncm91cCkgPT4ge1xuICBsb2dJbmZvKFwiVGFiIGdyb3VwIHJlbW92ZWRcIiwgeyBncm91cCB9KTtcbn0pO1xuXG5sZXQgYXV0b1J1blRpbWVvdXQ6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgbnVsbCA9IG51bGw7XG5cbmNvbnN0IHRyaWdnZXJBdXRvUnVuID0gKCkgPT4ge1xuICBpZiAoYXV0b1J1blRpbWVvdXQpIGNsZWFyVGltZW91dChhdXRvUnVuVGltZW91dCk7XG4gIGF1dG9SdW5UaW1lb3V0ID0gc2V0VGltZW91dChhc3luYyAoKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuXG4gICAgICBjb25zdCBhdXRvUnVuU3RyYXRzID0gcHJlZnMuY3VzdG9tU3RyYXRlZ2llcz8uZmlsdGVyKHMgPT4gcy5hdXRvUnVuKTtcbiAgICAgIGlmIChhdXRvUnVuU3RyYXRzICYmIGF1dG9SdW5TdHJhdHMubGVuZ3RoID4gMCkge1xuICAgICAgICBsb2dJbmZvKFwiQXV0by1ydW5uaW5nIHN0cmF0ZWdpZXNcIiwge1xuICAgICAgICAgIHN0cmF0ZWdpZXM6IGF1dG9SdW5TdHJhdHMubWFwKHMgPT4gcy5pZCksXG4gICAgICAgICAgY291bnQ6IGF1dG9SdW5TdHJhdHMubGVuZ3RoXG4gICAgICAgIH0pO1xuICAgICAgICBjb25zdCBpZHMgPSBhdXRvUnVuU3RyYXRzLm1hcChzID0+IHMuaWQpO1xuXG4gICAgICAgIC8vIFdlIGFwcGx5IGdyb3VwaW5nIHVzaW5nIHRoZXNlIHN0cmF0ZWdpZXNcbiAgICAgICAgY29uc3QgZ3JvdXBzID0gYXdhaXQgY2FsY3VsYXRlVGFiR3JvdXBzKHsgLi4ucHJlZnMsIHNvcnRpbmc6IGlkcyB9KTtcbiAgICAgICAgYXdhaXQgYXBwbHlUYWJHcm91cHMoZ3JvdXBzKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiQXV0by1ydW4gZmFpbGVkXCIsIGUpO1xuICAgIH1cbiAgfSwgMTAwMCk7XG59O1xuXG5jaHJvbWUudGFicy5vbkNyZWF0ZWQuYWRkTGlzdGVuZXIoKCkgPT4gdHJpZ2dlckF1dG9SdW4oKSk7XG5jaHJvbWUudGFicy5vblVwZGF0ZWQuYWRkTGlzdGVuZXIoKHRhYklkLCBjaGFuZ2VJbmZvKSA9PiB7XG4gIGlmIChjaGFuZ2VJbmZvLnVybCB8fCBjaGFuZ2VJbmZvLnN0YXR1cyA9PT0gJ2NvbXBsZXRlJykge1xuICAgIHRyaWdnZXJBdXRvUnVuKCk7XG4gIH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQWFPLElBQU0sYUFBbUM7QUFBQSxFQUM1QyxFQUFFLElBQUksVUFBVSxPQUFPLFVBQVUsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUM1RixFQUFFLElBQUksZUFBZSxPQUFPLGVBQWUsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUN0RyxFQUFFLElBQUksU0FBUyxPQUFPLFNBQVMsWUFBWSxN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LFVBQVEscUJBQXFCLEVBQUUsTUFBTSxDQUFDO0FBQ3hDLENBQUM7QUFFRCxJQUFJLGlCQUF1RDtBQUUzRCxJQUFNLGlCQUFpQixNQUFNO0FBQzNCLE1BQUksZUFBZ0IsY0FBYSxjQUFjO0FBQy9DLG1CQUFpQixXQUFXLFlBQVk7QUFDdEMsUUFBSTtBQUNGLFlBQU0sUUFBUSxNQUFNLGdCQUFnQjtBQUNwQywwQkFBb0IsTUFBTSxvQkFBb0IsQ0FBQyxDQUFDO0FBRWhELFlBQU0sZ0JBQWdCLE1BQU0sa0JBQWtCLE9BQU8sT0FBSyxFQUFFLE9BQU87QUFDbkUsVUFBSSxpQkFBaUIsY0FBYyxTQUFTLEdBQUc7QUFDN0MsZ0JBQVEsMkJBQTJCO0FBQUEsVUFDakMsWUFBWSxjQUFjLElBQUksT0FBSyxFQUFFLEVBQUU7QUFBQSxVQUN2QyxPQUFPLGNBQWM7QUFBQSxRQUN2QixDQUFDO0FBQ0QsY0FBTSxNQUFNLGNBQWMsSUFBSSxPQUFLLEVBQUUsRUFBRTtBQUd2QyxjQUFNLFNBQVMsTUFBTSxtQkFBbUIsRUFBRSxHQUFHLE9BQU8sU0FBUyxJQUFJLENBQUM7QUFDbEUsY0FBTSxlQUFlLE1BQU07QUFBQSxNQUM3QjtBQUFBLElBQ0YsU0FBUyxHQUFHO0FBQ1YsY0FBUSxNQUFNLG1CQUFtQixDQUFDO0FBQUEsSUFDcEM7QUFBQSxFQUNGLEdBQUcsR0FBSTtBQUNUO0FBRUEsT0FBTyxLQUFLLFVBQVUsWUFBWSxNQUFNLGVBQWUsQ0FBQztBQUN4RCxPQUFPLEtBQUssVUFBVSxZQUFZLENBQUMsT0FBTyxlQUFlO0FBQ3ZELE1BQUksV0FBVyxPQUFPLFdBQVcsV0FBVyxZQUFZO0FBQ3RELG1CQUFlO0FBQUEsRUFDakI7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogWyJjdXN0b21TdHJhdGVnaWVzIiwgInBhcnRzIiwgImdyb3VwVGFicyIsICJ0YWJzIiwgImxpc3QiLCAibG9ncyJdCn0K
