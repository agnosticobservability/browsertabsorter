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
      for (const sId of appliedStrategies) {
        const rule = getStrategyColorRule(sId);
        if (rule) {
          groupColor = rule.color;
          colorField = rule.colorField;
          break;
        }
      }
      if (groupColor === "match") {
        groupColor = colorForKey(valueKey, 0);
      } else if (groupColor === "field" && colorField) {
        const val = getFieldValue(tab, colorField);
        const key = val !== void 0 && val !== null ? String(val) : "";
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
            switch (rule.transform) {
              case "stripTld":
                val = stripTld(val);
                break;
              case "lowercase":
                val = val.toLowerCase();
                break;
              case "uppercase":
                val = val.toUpperCase();
                break;
              case "firstChar":
                val = val.charAt(0);
                break;
              case "domain":
                val = domainFromUrl(val);
                break;
              case "hostname":
                try {
                  val = new URL(val).hostname;
                } catch {
                }
                break;
              case "regex":
                if (rule.transformPattern) {
                  try {
                    let regex = regexCache.get(rule.transformPattern);
                    if (!regex) {
                      regex = new RegExp(rule.transformPattern);
                      regexCache.set(rule.transformPattern, regex);
                    }
                    if (rule.replacement !== void 0) {
                      val = val.replace(regex, rule.replacement);
                    } else {
                      const match2 = regex.exec(val);
                      if (match2) {
                        if (match2.length > 1) {
                          let extracted = "";
                          for (let i = 1; i < match2.length; i++) {
                            extracted += match2[i] || "";
                          }
                          val = extracted;
                        } else {
                          val = match2[0];
                        }
                      } else {
                        val = "";
                      }
                    }
                  } catch (e) {
                    logDebug("Invalid regex in transform", { pattern: rule.transformPattern, error: String(e) });
                    val = "";
                  }
                } else {
                  val = "";
                }
                break;
            }
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3NoYXJlZC9zdHJhdGVneVJlZ2lzdHJ5LnRzIiwgIi4uLy4uL3NyYy9zaGFyZWQvbG9nZ2VyLnRzIiwgIi4uLy4uL3NyYy9zaGFyZWQvdXRpbHMudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZ3JvdXBpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3NvcnRpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL2V4dHJhY3Rpb24vbG9naWMudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZXh0cmFjdGlvbi9nZW5lcmFSZWdpc3RyeS50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9zdG9yYWdlLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3ByZWZlcmVuY2VzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL2V4dHJhY3Rpb24vaW5kZXgudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvY29udGV4dEFuYWx5c2lzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3RhYk1hbmFnZXIudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvc3RhdGVNYW5hZ2VyLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3NlcnZpY2VXb3JrZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IEN1c3RvbVN0cmF0ZWd5LCBTb3J0aW5nU3RyYXRlZ3kgfSBmcm9tIFwiLi90eXBlcy5qc1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0cmF0ZWd5RGVmaW5pdGlvbiB7XG4gICAgaWQ6IFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZztcbiAgICBsYWJlbDogc3RyaW5nO1xuICAgIGlzR3JvdXBpbmc6IGJvb2xlYW47XG4gICAgaXNTb3J0aW5nOiBib29sZWFuO1xuICAgIHRhZ3M/OiBzdHJpbmdbXTtcbiAgICBhdXRvUnVuPzogYm9vbGVhbjtcbiAgICBpc0N1c3RvbT86IGJvb2xlYW47XG59XG5cbi8vIFJlc3RvcmVkIHN0cmF0ZWdpZXMgbWF0Y2hpbmcgYmFja2dyb3VuZCBjYXBhYmlsaXRpZXMuXG5leHBvcnQgY29uc3QgU1RSQVRFR0lFUzogU3RyYXRlZ3lEZWZpbml0aW9uW10gPSBbXG4gICAgeyBpZDogXCJkb21haW5cIiwgbGFiZWw6IFwiRG9tYWluXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJkb21haW5fZnVsbFwiLCBsYWJlbDogXCJGdWxsIERvbWFpblwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwidG9waWNcIiwgbGFiZWw6IFwiVG9waWNcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImNvbnRleHRcIiwgbGFiZWw6IFwiQ29udGV4dFwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwibGluZWFnZVwiLCBsYWJlbDogXCJMaW5lYWdlXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJwaW5uZWRcIiwgbGFiZWw6IFwiUGlubmVkXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJyZWNlbmN5XCIsIGxhYmVsOiBcIlJlY2VuY3lcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImFnZVwiLCBsYWJlbDogXCJBZ2VcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInVybFwiLCBsYWJlbDogXCJVUkxcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcIm5lc3RpbmdcIiwgbGFiZWw6IFwiTmVzdGluZ1wiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwidGl0bGVcIiwgbGFiZWw6IFwiVGl0bGVcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbl07XG5cbmV4cG9ydCBjb25zdCBnZXRTdHJhdGVnaWVzID0gKGN1c3RvbVN0cmF0ZWdpZXM/OiBDdXN0b21TdHJhdGVneVtdKTogU3RyYXRlZ3lEZWZpbml0aW9uW10gPT4ge1xuICAgIGlmICghY3VzdG9tU3RyYXRlZ2llcyB8fCBjdXN0b21TdHJhdGVnaWVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIFNUUkFURUdJRVM7XG5cbiAgICAvLyBDdXN0b20gc3RyYXRlZ2llcyBjYW4gb3ZlcnJpZGUgYnVpbHQtaW5zIGlmIElEcyBtYXRjaCwgb3IgYWRkIG5ldyBvbmVzLlxuICAgIGNvbnN0IGNvbWJpbmVkID0gWy4uLlNUUkFURUdJRVNdO1xuXG4gICAgY3VzdG9tU3RyYXRlZ2llcy5mb3JFYWNoKGN1c3RvbSA9PiB7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nSW5kZXggPSBjb21iaW5lZC5maW5kSW5kZXgocyA9PiBzLmlkID09PSBjdXN0b20uaWQpO1xuXG4gICAgICAgIC8vIERldGVybWluZSBjYXBhYmlsaXRpZXMgYmFzZWQgb24gcnVsZXMgcHJlc2VuY2VcbiAgICAgICAgY29uc3QgaGFzR3JvdXBpbmcgPSAoY3VzdG9tLmdyb3VwaW5nUnVsZXMgJiYgY3VzdG9tLmdyb3VwaW5nUnVsZXMubGVuZ3RoID4gMCkgfHwgKGN1c3RvbS5ydWxlcyAmJiBjdXN0b20ucnVsZXMubGVuZ3RoID4gMCkgfHwgZmFsc2U7XG4gICAgICAgIGNvbnN0IGhhc1NvcnRpbmcgPSAoY3VzdG9tLnNvcnRpbmdSdWxlcyAmJiBjdXN0b20uc29ydGluZ1J1bGVzLmxlbmd0aCA+IDApIHx8IChjdXN0b20ucnVsZXMgJiYgY3VzdG9tLnJ1bGVzLmxlbmd0aCA+IDApIHx8IGZhbHNlO1xuXG4gICAgICAgIGNvbnN0IHRhZ3M6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGlmIChoYXNHcm91cGluZykgdGFncy5wdXNoKFwiZ3JvdXBcIik7XG4gICAgICAgIGlmIChoYXNTb3J0aW5nKSB0YWdzLnB1c2goXCJzb3J0XCIpO1xuXG4gICAgICAgIGNvbnN0IGRlZmluaXRpb246IFN0cmF0ZWd5RGVmaW5pdGlvbiA9IHtcbiAgICAgICAgICAgIGlkOiBjdXN0b20uaWQsXG4gICAgICAgICAgICBsYWJlbDogY3VzdG9tLmxhYmVsLFxuICAgICAgICAgICAgaXNHcm91cGluZzogaGFzR3JvdXBpbmcsXG4gICAgICAgICAgICBpc1NvcnRpbmc6IGhhc1NvcnRpbmcsXG4gICAgICAgICAgICB0YWdzOiB0YWdzLFxuICAgICAgICAgICAgYXV0b1J1bjogY3VzdG9tLmF1dG9SdW4sXG4gICAgICAgICAgICBpc0N1c3RvbTogdHJ1ZVxuICAgICAgICB9O1xuXG4gICAgICAgIGlmIChleGlzdGluZ0luZGV4ICE9PSAtMSkge1xuICAgICAgICAgICAgY29tYmluZWRbZXhpc3RpbmdJbmRleF0gPSBkZWZpbml0aW9uO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29tYmluZWQucHVzaChkZWZpbml0aW9uKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGNvbWJpbmVkO1xufTtcblxuZXhwb3J0IGNvbnN0IGdldFN0cmF0ZWd5ID0gKGlkOiBTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmcpOiBTdHJhdGVneURlZmluaXRpb24gfCB1bmRlZmluZWQgPT4gU1RSQVRFR0lFUy5maW5kKHMgPT4gcy5pZCA9PT0gaWQpO1xuIiwgImltcG9ydCB7IExvZ0VudHJ5LCBMb2dMZXZlbCwgUHJlZmVyZW5jZXMgfSBmcm9tIFwiLi90eXBlcy5qc1wiO1xuXG5jb25zdCBQUkVGSVggPSBcIltUYWJTb3J0ZXJdXCI7XG5cbmNvbnN0IExFVkVMX1BSSU9SSVRZOiBSZWNvcmQ8TG9nTGV2ZWwsIG51bWJlcj4gPSB7XG4gIGRlYnVnOiAwLFxuICBpbmZvOiAxLFxuICB3YXJuOiAyLFxuICBlcnJvcjogMyxcbiAgY3JpdGljYWw6IDRcbn07XG5cbmxldCBjdXJyZW50TGV2ZWw6IExvZ0xldmVsID0gXCJpbmZvXCI7XG5sZXQgbG9nczogTG9nRW50cnlbXSA9IFtdO1xuY29uc3QgTUFYX0xPR1MgPSAxMDAwO1xuY29uc3QgU1RPUkFHRV9LRVkgPSBcInNlc3Npb25Mb2dzXCI7XG5cbi8vIFNhZmUgY29udGV4dCBjaGVja1xuY29uc3QgaXNTZXJ2aWNlV29ya2VyID0gdHlwZW9mIHNlbGYgIT09ICd1bmRlZmluZWQnICYmXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlb2YgKHNlbGYgYXMgYW55KS5TZXJ2aWNlV29ya2VyR2xvYmFsU2NvcGUgIT09ICd1bmRlZmluZWQnICYmXG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmIGluc3RhbmNlb2YgKHNlbGYgYXMgYW55KS5TZXJ2aWNlV29ya2VyR2xvYmFsU2NvcGU7XG5sZXQgaXNTYXZpbmcgPSBmYWxzZTtcbmxldCBwZW5kaW5nU2F2ZSA9IGZhbHNlO1xubGV0IHNhdmVUaW1lcjogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCBudWxsID0gbnVsbDtcblxuY29uc3QgZG9TYXZlID0gKCkgPT4ge1xuICAgIGlmICghaXNTZXJ2aWNlV29ya2VyIHx8ICFjaHJvbWU/LnN0b3JhZ2U/LnNlc3Npb24gfHwgaXNTYXZpbmcpIHtcbiAgICAgICAgcGVuZGluZ1NhdmUgPSB0cnVlO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaXNTYXZpbmcgPSB0cnVlO1xuICAgIHBlbmRpbmdTYXZlID0gZmFsc2U7XG5cbiAgICBjaHJvbWUuc3RvcmFnZS5zZXNzaW9uLnNldCh7IFtTVE9SQUdFX0tFWV06IGxvZ3MgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIGlzU2F2aW5nID0gZmFsc2U7XG4gICAgICAgIGlmIChwZW5kaW5nU2F2ZSkge1xuICAgICAgICAgICAgc2F2ZUxvZ3NUb1N0b3JhZ2UoKTtcbiAgICAgICAgfVxuICAgIH0pLmNhdGNoKGVyciA9PiB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gc2F2ZSBsb2dzXCIsIGVycik7XG4gICAgICAgIGlzU2F2aW5nID0gZmFsc2U7XG4gICAgfSk7XG59O1xuXG5jb25zdCBzYXZlTG9nc1RvU3RvcmFnZSA9ICgpID0+IHtcbiAgICBpZiAoc2F2ZVRpbWVyKSBjbGVhclRpbWVvdXQoc2F2ZVRpbWVyKTtcbiAgICBzYXZlVGltZXIgPSBzZXRUaW1lb3V0KGRvU2F2ZSwgMTAwMCk7XG59O1xuXG5sZXQgcmVzb2x2ZUxvZ2dlclJlYWR5OiAoKSA9PiB2b2lkO1xuZXhwb3J0IGNvbnN0IGxvZ2dlclJlYWR5ID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG4gICAgcmVzb2x2ZUxvZ2dlclJlYWR5ID0gcmVzb2x2ZTtcbn0pO1xuXG5leHBvcnQgY29uc3QgaW5pdExvZ2dlciA9IGFzeW5jICgpID0+IHtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyICYmIGNocm9tZT8uc3RvcmFnZT8uc2Vzc2lvbikge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY2hyb21lLnN0b3JhZ2Uuc2Vzc2lvbi5nZXQoU1RPUkFHRV9LRVkpO1xuICAgICAgICAgICAgaWYgKHJlc3VsdFtTVE9SQUdFX0tFWV0gJiYgQXJyYXkuaXNBcnJheShyZXN1bHRbU1RPUkFHRV9LRVldKSkge1xuICAgICAgICAgICAgICAgIGxvZ3MgPSByZXN1bHRbU1RPUkFHRV9LRVldO1xuICAgICAgICAgICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSBsb2dzID0gbG9ncy5zbGljZSgwLCBNQVhfTE9HUyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gcmVzdG9yZSBsb2dzXCIsIGUpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGlmIChyZXNvbHZlTG9nZ2VyUmVhZHkpIHJlc29sdmVMb2dnZXJSZWFkeSgpO1xufTtcblxuZXhwb3J0IGNvbnN0IHNldExvZ2dlclByZWZlcmVuY2VzID0gKHByZWZzOiBQcmVmZXJlbmNlcykgPT4ge1xuICBpZiAocHJlZnMubG9nTGV2ZWwpIHtcbiAgICBjdXJyZW50TGV2ZWwgPSBwcmVmcy5sb2dMZXZlbDtcbiAgfSBlbHNlIGlmIChwcmVmcy5kZWJ1Zykge1xuICAgIGN1cnJlbnRMZXZlbCA9IFwiZGVidWdcIjtcbiAgfSBlbHNlIHtcbiAgICBjdXJyZW50TGV2ZWwgPSBcImluZm9cIjtcbiAgfVxufTtcblxuY29uc3Qgc2hvdWxkTG9nID0gKGxldmVsOiBMb2dMZXZlbCk6IGJvb2xlYW4gPT4ge1xuICByZXR1cm4gTEVWRUxfUFJJT1JJVFlbbGV2ZWxdID49IExFVkVMX1BSSU9SSVRZW2N1cnJlbnRMZXZlbF07XG59O1xuXG5jb25zdCBmb3JtYXRNZXNzYWdlID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIHJldHVybiBjb250ZXh0ID8gYCR7bWVzc2FnZX0gOjogJHtKU09OLnN0cmluZ2lmeShjb250ZXh0KX1gIDogbWVzc2FnZTtcbn07XG5cbmNvbnN0IGFkZExvZyA9IChsZXZlbDogTG9nTGV2ZWwsIG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGlmIChzaG91bGRMb2cobGV2ZWwpKSB7XG4gICAgICBjb25zdCBlbnRyeTogTG9nRW50cnkgPSB7XG4gICAgICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxuICAgICAgICAgIGxldmVsLFxuICAgICAgICAgIG1lc3NhZ2UsXG4gICAgICAgICAgY29udGV4dFxuICAgICAgfTtcblxuICAgICAgaWYgKGlzU2VydmljZVdvcmtlcikge1xuICAgICAgICAgIGxvZ3MudW5zaGlmdChlbnRyeSk7XG4gICAgICAgICAgaWYgKGxvZ3MubGVuZ3RoID4gTUFYX0xPR1MpIHtcbiAgICAgICAgICAgICAgbG9ncy5wb3AoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgc2F2ZUxvZ3NUb1N0b3JhZ2UoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gSW4gb3RoZXIgY29udGV4dHMsIHNlbmQgdG8gU1dcbiAgICAgICAgICBpZiAoY2hyb21lPy5ydW50aW1lPy5zZW5kTWVzc2FnZSkge1xuICAgICAgICAgICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2xvZ0VudHJ5JywgcGF5bG9hZDogZW50cnkgfSkuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgICAgICAgICAvLyBJZ25vcmUgaWYgbWVzc2FnZSBmYWlscyAoZS5nLiBjb250ZXh0IGludmFsaWRhdGVkKVxuICAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgIH1cbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGFkZExvZ0VudHJ5ID0gKGVudHJ5OiBMb2dFbnRyeSkgPT4ge1xuICAgIGlmIChpc1NlcnZpY2VXb3JrZXIpIHtcbiAgICAgICAgbG9ncy51bnNoaWZ0KGVudHJ5KTtcbiAgICAgICAgaWYgKGxvZ3MubGVuZ3RoID4gTUFYX0xPR1MpIHtcbiAgICAgICAgICAgIGxvZ3MucG9wKCk7XG4gICAgICAgIH1cbiAgICAgICAgc2F2ZUxvZ3NUb1N0b3JhZ2UoKTtcbiAgICB9XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0TG9ncyA9ICgpID0+IFsuLi5sb2dzXTtcbmV4cG9ydCBjb25zdCBjbGVhckxvZ3MgPSAoKSA9PiB7XG4gICAgbG9ncy5sZW5ndGggPSAwO1xuICAgIGlmIChpc1NlcnZpY2VXb3JrZXIpIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG59O1xuXG5leHBvcnQgY29uc3QgbG9nRGVidWcgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwiZGVidWdcIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJkZWJ1Z1wiKSkge1xuICAgIGNvbnNvbGUuZGVidWcoYCR7UFJFRklYfSBbREVCVUddICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0luZm8gPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwiaW5mb1wiLCBtZXNzYWdlLCBjb250ZXh0KTtcbiAgaWYgKHNob3VsZExvZyhcImluZm9cIikpIHtcbiAgICBjb25zb2xlLmluZm8oYCR7UFJFRklYfSBbSU5GT10gJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nV2FybiA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBhZGRMb2coXCJ3YXJuXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwid2FyblwiKSkge1xuICAgIGNvbnNvbGUud2FybihgJHtQUkVGSVh9IFtXQVJOXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgY29udGV4dCl9YCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBsb2dFcnJvciA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBhZGRMb2coXCJlcnJvclwiLCBtZXNzYWdlLCBjb250ZXh0KTtcbiAgaWYgKHNob3VsZExvZyhcImVycm9yXCIpKSB7XG4gICAgY29uc29sZS5lcnJvcihgJHtQUkVGSVh9IFtFUlJPUl0gJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nQ3JpdGljYWwgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwiY3JpdGljYWxcIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJjcml0aWNhbFwiKSkge1xuICAgIC8vIENyaXRpY2FsIGxvZ3MgdXNlIGVycm9yIGNvbnNvbGUgYnV0IHdpdGggZGlzdGluY3QgcHJlZml4IGFuZCBtYXliZSBzdHlsaW5nIGlmIHN1cHBvcnRlZFxuICAgIGNvbnNvbGUuZXJyb3IoYCR7UFJFRklYfSBbQ1JJVElDQUxdIFx1RDgzRFx1REVBOCAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgY29udGV4dCl9YCk7XG4gIH1cbn07XG4iLCAiaW1wb3J0IHsgUHJlZmVyZW5jZXMsIFNvcnRpbmdTdHJhdGVneSwgVGFiTWV0YWRhdGEgfSBmcm9tIFwiLi90eXBlcy5qc1wiO1xuXG5leHBvcnQgY29uc3QgbWFwQ2hyb21lVGFiID0gKHRhYjogY2hyb21lLnRhYnMuVGFiKTogVGFiTWV0YWRhdGEgfCBudWxsID0+IHtcbiAgaWYgKCF0YWIuaWQgfHwgdGFiLmlkID09PSBjaHJvbWUudGFicy5UQUJfSURfTk9ORSB8fCAhdGFiLndpbmRvd0lkKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHtcbiAgICBpZDogdGFiLmlkLFxuICAgIHdpbmRvd0lkOiB0YWIud2luZG93SWQsXG4gICAgdGl0bGU6IHRhYi50aXRsZSB8fCBcIlVudGl0bGVkXCIsXG4gICAgdXJsOiB0YWIudXJsIHx8IFwiYWJvdXQ6YmxhbmtcIixcbiAgICBwaW5uZWQ6IEJvb2xlYW4odGFiLnBpbm5lZCksXG4gICAgbGFzdEFjY2Vzc2VkOiB0YWIubGFzdEFjY2Vzc2VkLFxuICAgIG9wZW5lclRhYklkOiB0YWIub3BlbmVyVGFiSWQgPz8gdW5kZWZpbmVkLFxuICAgIGZhdkljb25Vcmw6IHRhYi5mYXZJY29uVXJsLFxuICAgIGdyb3VwSWQ6IHRhYi5ncm91cElkLFxuICAgIGluZGV4OiB0YWIuaW5kZXgsXG4gICAgYWN0aXZlOiB0YWIuYWN0aXZlLFxuICAgIHN0YXR1czogdGFiLnN0YXR1cyxcbiAgICBzZWxlY3RlZDogdGFiLmhpZ2hsaWdodGVkXG4gIH07XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0U3RvcmVkUHJlZmVyZW5jZXMgPSBhc3luYyAoKTogUHJvbWlzZTxQcmVmZXJlbmNlcyB8IG51bGw+ID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFwicHJlZmVyZW5jZXNcIiwgKGl0ZW1zKSA9PiB7XG4gICAgICByZXNvbHZlKChpdGVtc1tcInByZWZlcmVuY2VzXCJdIGFzIFByZWZlcmVuY2VzKSA/PyBudWxsKTtcbiAgICB9KTtcbiAgfSk7XG59O1xuXG5leHBvcnQgY29uc3QgYXNBcnJheSA9IDxUPih2YWx1ZTogdW5rbm93bik6IFRbXSA9PiB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSByZXR1cm4gdmFsdWUgYXMgVFtdO1xuICAgIHJldHVybiBbXTtcbn07XG4iLCAiaW1wb3J0IHsgR3JvdXBpbmdTdHJhdGVneSwgU29ydGluZ1N0cmF0ZWd5LCBUYWJHcm91cCwgVGFiTWV0YWRhdGEsIEN1c3RvbVN0cmF0ZWd5LCBTdHJhdGVneVJ1bGUsIFJ1bGVDb25kaXRpb24sIEdyb3VwaW5nUnVsZSwgU29ydGluZ1J1bGUgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBnZXRTdHJhdGVnaWVzIH0gZnJvbSBcIi4uL3NoYXJlZC9zdHJhdGVneVJlZ2lzdHJ5LmpzXCI7XG5pbXBvcnQgeyBsb2dEZWJ1ZyB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBhc0FycmF5IH0gZnJvbSBcIi4uL3NoYXJlZC91dGlscy5qc1wiO1xuXG5sZXQgY3VzdG9tU3RyYXRlZ2llczogQ3VzdG9tU3RyYXRlZ3lbXSA9IFtdO1xuXG5leHBvcnQgY29uc3Qgc2V0Q3VzdG9tU3RyYXRlZ2llcyA9IChzdHJhdGVnaWVzOiBDdXN0b21TdHJhdGVneVtdKSA9PiB7XG4gICAgY3VzdG9tU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXM7XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0Q3VzdG9tU3RyYXRlZ2llcyA9ICgpOiBDdXN0b21TdHJhdGVneVtdID0+IGN1c3RvbVN0cmF0ZWdpZXM7XG5cbmNvbnN0IENPTE9SUyA9IFtcImdyZXlcIiwgXCJibHVlXCIsIFwicmVkXCIsIFwieWVsbG93XCIsIFwiZ3JlZW5cIiwgXCJwaW5rXCIsIFwicHVycGxlXCIsIFwiY3lhblwiLCBcIm9yYW5nZVwiXTtcblxuY29uc3QgcmVnZXhDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBSZWdFeHA+KCk7XG5jb25zdCBkb21haW5DYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5jb25zdCBzdWJkb21haW5DYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5jb25zdCBNQVhfQ0FDSEVfU0laRSA9IDEwMDA7XG5cbmV4cG9ydCBjb25zdCBkb21haW5Gcm9tVXJsID0gKHVybDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgaWYgKGRvbWFpbkNhY2hlLmhhcyh1cmwpKSByZXR1cm4gZG9tYWluQ2FjaGUuZ2V0KHVybCkhO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgcGFyc2VkID0gbmV3IFVSTCh1cmwpO1xuICAgIGNvbnN0IGRvbWFpbiA9IHBhcnNlZC5ob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgXCJcIik7XG5cbiAgICBpZiAoZG9tYWluQ2FjaGUuc2l6ZSA+PSBNQVhfQ0FDSEVfU0laRSkgZG9tYWluQ2FjaGUuY2xlYXIoKTtcbiAgICBkb21haW5DYWNoZS5zZXQodXJsLCBkb21haW4pO1xuXG4gICAgcmV0dXJuIGRvbWFpbjtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBsb2dEZWJ1ZyhcIkZhaWxlZCB0byBwYXJzZSBkb21haW5cIiwgeyB1cmwsIGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICAgIHJldHVybiBcInVua25vd25cIjtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IHN1YmRvbWFpbkZyb21VcmwgPSAodXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgIGlmIChzdWJkb21haW5DYWNoZS5oYXModXJsKSkgcmV0dXJuIHN1YmRvbWFpbkNhY2hlLmdldCh1cmwpITtcblxuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHBhcnNlZCA9IG5ldyBVUkwodXJsKTtcbiAgICAgICAgbGV0IGhvc3RuYW1lID0gcGFyc2VkLmhvc3RuYW1lO1xuICAgICAgICAvLyBSZW1vdmUgd3d3LlxuICAgICAgICBob3N0bmFtZSA9IGhvc3RuYW1lLnJlcGxhY2UoL153d3dcXC4vLCBcIlwiKTtcblxuICAgICAgICBsZXQgcmVzdWx0ID0gXCJcIjtcbiAgICAgICAgY29uc3QgcGFydHMgPSBob3N0bmFtZS5zcGxpdCgnLicpO1xuICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMikge1xuICAgICAgICAgICAgIHJlc3VsdCA9IHBhcnRzLnNsaWNlKDAsIHBhcnRzLmxlbmd0aCAtIDIpLmpvaW4oJy4nKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdWJkb21haW5DYWNoZS5zaXplID49IE1BWF9DQUNIRV9TSVpFKSBzdWJkb21haW5DYWNoZS5jbGVhcigpO1xuICAgICAgICBzdWJkb21haW5DYWNoZS5zZXQodXJsLCByZXN1bHQpO1xuXG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBcIlwiO1xuICAgIH1cbn1cblxuY29uc3QgZ2V0TmVzdGVkUHJvcGVydHkgPSAob2JqOiB1bmtub3duLCBwYXRoOiBzdHJpbmcpOiB1bmtub3duID0+IHtcbiAgICBpZiAoIW9iaiB8fCB0eXBlb2Ygb2JqICE9PSAnb2JqZWN0JykgcmV0dXJuIHVuZGVmaW5lZDtcblxuICAgIGlmICghcGF0aC5pbmNsdWRlcygnLicpKSB7XG4gICAgICAgIHJldHVybiAob2JqIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtwYXRoXTtcbiAgICB9XG5cbiAgICBjb25zdCBwYXJ0cyA9IHBhdGguc3BsaXQoJy4nKTtcbiAgICBsZXQgY3VycmVudDogdW5rbm93biA9IG9iajtcblxuICAgIGZvciAoY29uc3Qga2V5IG9mIHBhcnRzKSB7XG4gICAgICAgIGlmICghY3VycmVudCB8fCB0eXBlb2YgY3VycmVudCAhPT0gJ29iamVjdCcpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIGN1cnJlbnQgPSAoY3VycmVudCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilba2V5XTtcbiAgICB9XG5cbiAgICByZXR1cm4gY3VycmVudDtcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRGaWVsZFZhbHVlID0gKHRhYjogVGFiTWV0YWRhdGEsIGZpZWxkOiBzdHJpbmcpOiBhbnkgPT4ge1xuICAgIHN3aXRjaChmaWVsZCkge1xuICAgICAgICBjYXNlICdpZCc6IHJldHVybiB0YWIuaWQ7XG4gICAgICAgIGNhc2UgJ2luZGV4JzogcmV0dXJuIHRhYi5pbmRleDtcbiAgICAgICAgY2FzZSAnd2luZG93SWQnOiByZXR1cm4gdGFiLndpbmRvd0lkO1xuICAgICAgICBjYXNlICdncm91cElkJzogcmV0dXJuIHRhYi5ncm91cElkO1xuICAgICAgICBjYXNlICd0aXRsZSc6IHJldHVybiB0YWIudGl0bGU7XG4gICAgICAgIGNhc2UgJ3VybCc6IHJldHVybiB0YWIudXJsO1xuICAgICAgICBjYXNlICdzdGF0dXMnOiByZXR1cm4gdGFiLnN0YXR1cztcbiAgICAgICAgY2FzZSAnYWN0aXZlJzogcmV0dXJuIHRhYi5hY3RpdmU7XG4gICAgICAgIGNhc2UgJ3NlbGVjdGVkJzogcmV0dXJuIHRhYi5zZWxlY3RlZDtcbiAgICAgICAgY2FzZSAncGlubmVkJzogcmV0dXJuIHRhYi5waW5uZWQ7XG4gICAgICAgIGNhc2UgJ29wZW5lclRhYklkJzogcmV0dXJuIHRhYi5vcGVuZXJUYWJJZDtcbiAgICAgICAgY2FzZSAnbGFzdEFjY2Vzc2VkJzogcmV0dXJuIHRhYi5sYXN0QWNjZXNzZWQ7XG4gICAgICAgIGNhc2UgJ2NvbnRleHQnOiByZXR1cm4gdGFiLmNvbnRleHQ7XG4gICAgICAgIGNhc2UgJ2dlbnJlJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uZ2VucmU7XG4gICAgICAgIGNhc2UgJ3NpdGVOYW1lJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uc2l0ZU5hbWU7XG4gICAgICAgIC8vIERlcml2ZWQgb3IgbWFwcGVkIGZpZWxkc1xuICAgICAgICBjYXNlICdkb21haW4nOiByZXR1cm4gZG9tYWluRnJvbVVybCh0YWIudXJsKTtcbiAgICAgICAgY2FzZSAnc3ViZG9tYWluJzogcmV0dXJuIHN1YmRvbWFpbkZyb21VcmwodGFiLnVybCk7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICByZXR1cm4gZ2V0TmVzdGVkUHJvcGVydHkodGFiLCBmaWVsZCk7XG4gICAgfVxufTtcblxuY29uc3Qgc3RyaXBUbGQgPSAoZG9tYWluOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gZG9tYWluLnJlcGxhY2UoL1xcLihjb218b3JnfGdvdnxuZXR8ZWR1fGlvKSQvaSwgXCJcIik7XG59O1xuXG5leHBvcnQgY29uc3Qgc2VtYW50aWNCdWNrZXQgPSAodGl0bGU6IHN0cmluZywgdXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBrZXkgPSBgJHt0aXRsZX0gJHt1cmx9YC50b0xvd2VyQ2FzZSgpO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiZG9jXCIpIHx8IGtleS5pbmNsdWRlcyhcInJlYWRtZVwiKSB8fCBrZXkuaW5jbHVkZXMoXCJndWlkZVwiKSkgcmV0dXJuIFwiRG9jc1wiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwibWFpbFwiKSB8fCBrZXkuaW5jbHVkZXMoXCJpbmJveFwiKSkgcmV0dXJuIFwiQ2hhdFwiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiZGFzaGJvYXJkXCIpIHx8IGtleS5pbmNsdWRlcyhcImNvbnNvbGVcIikpIHJldHVybiBcIkRhc2hcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImlzc3VlXCIpIHx8IGtleS5pbmNsdWRlcyhcInRpY2tldFwiKSkgcmV0dXJuIFwiVGFza3NcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImRyaXZlXCIpIHx8IGtleS5pbmNsdWRlcyhcInN0b3JhZ2VcIikpIHJldHVybiBcIkZpbGVzXCI7XG4gIHJldHVybiBcIk1pc2NcIjtcbn07XG5cbmV4cG9ydCBjb25zdCBuYXZpZ2F0aW9uS2V5ID0gKHRhYjogVGFiTWV0YWRhdGEpOiBzdHJpbmcgPT4ge1xuICBpZiAodGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gYGNoaWxkLW9mLSR7dGFiLm9wZW5lclRhYklkfWA7XG4gIH1cbiAgcmV0dXJuIGB3aW5kb3ctJHt0YWIud2luZG93SWR9YDtcbn07XG5cbmNvbnN0IGdldFJlY2VuY3lMYWJlbCA9IChsYXN0QWNjZXNzZWQ6IG51bWJlcik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gIGNvbnN0IGRpZmYgPSBub3cgLSBsYXN0QWNjZXNzZWQ7XG4gIGlmIChkaWZmIDwgMzYwMDAwMCkgcmV0dXJuIFwiSnVzdCBub3dcIjsgLy8gMWhcbiAgaWYgKGRpZmYgPCA4NjQwMDAwMCkgcmV0dXJuIFwiVG9kYXlcIjsgLy8gMjRoXG4gIGlmIChkaWZmIDwgMTcyODAwMDAwKSByZXR1cm4gXCJZZXN0ZXJkYXlcIjsgLy8gNDhoXG4gIGlmIChkaWZmIDwgNjA0ODAwMDAwKSByZXR1cm4gXCJUaGlzIFdlZWtcIjsgLy8gN2RcbiAgcmV0dXJuIFwiT2xkZXJcIjtcbn07XG5cbmNvbnN0IGNvbG9yRm9yS2V5ID0gKGtleTogc3RyaW5nLCBvZmZzZXQ6IG51bWJlcik6IHN0cmluZyA9PiBDT0xPUlNbKE1hdGguYWJzKGhhc2hDb2RlKGtleSkpICsgb2Zmc2V0KSAlIENPTE9SUy5sZW5ndGhdO1xuXG5jb25zdCBoYXNoQ29kZSA9ICh2YWx1ZTogc3RyaW5nKTogbnVtYmVyID0+IHtcbiAgbGV0IGhhc2ggPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHZhbHVlLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgaGFzaCA9IChoYXNoIDw8IDUpIC0gaGFzaCArIHZhbHVlLmNoYXJDb2RlQXQoaSk7XG4gICAgaGFzaCB8PSAwO1xuICB9XG4gIHJldHVybiBoYXNoO1xufTtcblxuLy8gSGVscGVyIHRvIGdldCBhIGh1bWFuLXJlYWRhYmxlIGxhYmVsIGNvbXBvbmVudCBmcm9tIGEgc3RyYXRlZ3kgYW5kIGEgc2V0IG9mIHRhYnNcbmNvbnN0IGdldExhYmVsQ29tcG9uZW50ID0gKHN0cmF0ZWd5OiBHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nLCB0YWJzOiBUYWJNZXRhZGF0YVtdLCBhbGxUYWJzTWFwOiBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YT4pOiBzdHJpbmcgfCBudWxsID0+IHtcbiAgY29uc3QgZmlyc3RUYWIgPSB0YWJzWzBdO1xuICBpZiAoIWZpcnN0VGFiKSByZXR1cm4gXCJVbmtub3duXCI7XG5cbiAgLy8gQ2hlY2sgY3VzdG9tIHN0cmF0ZWdpZXMgZmlyc3RcbiAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3kpO1xuICBpZiAoY3VzdG9tKSB7XG4gICAgICByZXR1cm4gZ3JvdXBpbmdLZXkoZmlyc3RUYWIsIHN0cmF0ZWd5KTtcbiAgfVxuXG4gIHN3aXRjaCAoc3RyYXRlZ3kpIHtcbiAgICBjYXNlIFwiZG9tYWluXCI6IHtcbiAgICAgIGNvbnN0IHNpdGVOYW1lcyA9IG5ldyBTZXQodGFicy5tYXAodCA9PiB0LmNvbnRleHREYXRhPy5zaXRlTmFtZSkuZmlsdGVyKEJvb2xlYW4pKTtcbiAgICAgIGlmIChzaXRlTmFtZXMuc2l6ZSA9PT0gMSkge1xuICAgICAgICByZXR1cm4gc3RyaXBUbGQoQXJyYXkuZnJvbShzaXRlTmFtZXMpWzBdIGFzIHN0cmluZyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gc3RyaXBUbGQoZG9tYWluRnJvbVVybChmaXJzdFRhYi51cmwpKTtcbiAgICB9XG4gICAgY2FzZSBcImRvbWFpbl9mdWxsXCI6XG4gICAgICByZXR1cm4gZG9tYWluRnJvbVVybChmaXJzdFRhYi51cmwpO1xuICAgIGNhc2UgXCJ0b3BpY1wiOlxuICAgICAgcmV0dXJuIHNlbWFudGljQnVja2V0KGZpcnN0VGFiLnRpdGxlLCBmaXJzdFRhYi51cmwpO1xuICAgIGNhc2UgXCJsaW5lYWdlXCI6XG4gICAgICBpZiAoZmlyc3RUYWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBjb25zdCBwYXJlbnQgPSBhbGxUYWJzTWFwLmdldChmaXJzdFRhYi5vcGVuZXJUYWJJZCk7XG4gICAgICAgIGlmIChwYXJlbnQpIHtcbiAgICAgICAgICBjb25zdCBwYXJlbnRUaXRsZSA9IHBhcmVudC50aXRsZS5sZW5ndGggPiAyMCA/IHBhcmVudC50aXRsZS5zdWJzdHJpbmcoMCwgMjApICsgXCIuLi5cIiA6IHBhcmVudC50aXRsZTtcbiAgICAgICAgICByZXR1cm4gYEZyb206ICR7cGFyZW50VGl0bGV9YDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYEZyb206IFRhYiAke2ZpcnN0VGFiLm9wZW5lclRhYklkfWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYFdpbmRvdyAke2ZpcnN0VGFiLndpbmRvd0lkfWA7XG4gICAgY2FzZSBcImNvbnRleHRcIjpcbiAgICAgIHJldHVybiBmaXJzdFRhYi5jb250ZXh0IHx8IFwiVW5jYXRlZ29yaXplZFwiO1xuICAgIGNhc2UgXCJwaW5uZWRcIjpcbiAgICAgIHJldHVybiBmaXJzdFRhYi5waW5uZWQgPyBcIlBpbm5lZFwiIDogXCJVbnBpbm5lZFwiO1xuICAgIGNhc2UgXCJhZ2VcIjpcbiAgICAgIHJldHVybiBnZXRSZWNlbmN5TGFiZWwoZmlyc3RUYWIubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgIGNhc2UgXCJ1cmxcIjpcbiAgICAgIHJldHVybiBcIlVSTCBHcm91cFwiO1xuICAgIGNhc2UgXCJyZWNlbmN5XCI6XG4gICAgICByZXR1cm4gXCJUaW1lIEdyb3VwXCI7XG4gICAgY2FzZSBcIm5lc3RpbmdcIjpcbiAgICAgIHJldHVybiBmaXJzdFRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkID8gXCJDaGlsZHJlblwiIDogXCJSb290c1wiO1xuICAgIGRlZmF1bHQ6XG4gICAgICBjb25zdCB2YWwgPSBnZXRGaWVsZFZhbHVlKGZpcnN0VGFiLCBzdHJhdGVneSk7XG4gICAgICBpZiAodmFsICE9PSB1bmRlZmluZWQgJiYgdmFsICE9PSBudWxsKSB7XG4gICAgICAgICAgcmV0dXJuIFN0cmluZyh2YWwpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIFwiVW5rbm93blwiO1xuICB9XG59O1xuXG5jb25zdCBnZW5lcmF0ZUxhYmVsID0gKFxuICBzdHJhdGVnaWVzOiAoR3JvdXBpbmdTdHJhdGVneSB8IHN0cmluZylbXSxcbiAgdGFiczogVGFiTWV0YWRhdGFbXSxcbiAgYWxsVGFic01hcDogTWFwPG51bWJlciwgVGFiTWV0YWRhdGE+XG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBsYWJlbHMgPSBzdHJhdGVnaWVzXG4gICAgLm1hcChzID0+IGdldExhYmVsQ29tcG9uZW50KHMsIHRhYnMsIGFsbFRhYnNNYXApKVxuICAgIC5maWx0ZXIobCA9PiBsICYmIGwgIT09IFwiVW5rbm93blwiICYmIGwgIT09IFwiR3JvdXBcIiAmJiBsICE9PSBcIlVSTCBHcm91cFwiICYmIGwgIT09IFwiVGltZSBHcm91cFwiICYmIGwgIT09IFwiTWlzY1wiKTtcblxuICBpZiAobGFiZWxzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIFwiR3JvdXBcIjtcbiAgcmV0dXJuIEFycmF5LmZyb20obmV3IFNldChsYWJlbHMpKS5qb2luKFwiIC0gXCIpO1xufTtcblxuY29uc3QgZ2V0U3RyYXRlZ3lDb2xvclJ1bGUgPSAoc3RyYXRlZ3lJZDogc3RyaW5nKTogR3JvdXBpbmdSdWxlIHwgdW5kZWZpbmVkID0+IHtcbiAgICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneUlkKTtcbiAgICBpZiAoIWN1c3RvbSkgcmV0dXJuIHVuZGVmaW5lZDtcblxuICAgIGNvbnN0IGdyb3VwaW5nUnVsZXNMaXN0ID0gYXNBcnJheTxHcm91cGluZ1J1bGU+KGN1c3RvbS5ncm91cGluZ1J1bGVzKTtcbiAgICAvLyBJdGVyYXRlIG1hbnVhbGx5IHRvIGNoZWNrIGNvbG9yXG4gICAgZm9yIChsZXQgaSA9IGdyb3VwaW5nUnVsZXNMaXN0Lmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgIGNvbnN0IHJ1bGUgPSBncm91cGluZ1J1bGVzTGlzdFtpXTtcbiAgICAgICAgaWYgKHJ1bGUgJiYgcnVsZS5jb2xvciAmJiBydWxlLmNvbG9yICE9PSAncmFuZG9tJykge1xuICAgICAgICAgICAgcmV0dXJuIHJ1bGU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbn07XG5cbmNvbnN0IHJlc29sdmVXaW5kb3dNb2RlID0gKG1vZGVzOiAoc3RyaW5nIHwgdW5kZWZpbmVkKVtdKTogXCJjdXJyZW50XCIgfCBcIm5ld1wiIHwgXCJjb21wb3VuZFwiID0+IHtcbiAgICBpZiAobW9kZXMuaW5jbHVkZXMoXCJuZXdcIikpIHJldHVybiBcIm5ld1wiO1xuICAgIGlmIChtb2Rlcy5pbmNsdWRlcyhcImNvbXBvdW5kXCIpKSByZXR1cm4gXCJjb21wb3VuZFwiO1xuICAgIHJldHVybiBcImN1cnJlbnRcIjtcbn07XG5cbmV4cG9ydCBjb25zdCBncm91cFRhYnMgPSAoXG4gIHRhYnM6IFRhYk1ldGFkYXRhW10sXG4gIHN0cmF0ZWdpZXM6IChTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmcpW11cbik6IFRhYkdyb3VwW10gPT4ge1xuICBjb25zdCBhdmFpbGFibGVTdHJhdGVnaWVzID0gZ2V0U3RyYXRlZ2llcyhjdXN0b21TdHJhdGVnaWVzKTtcbiAgY29uc3QgZWZmZWN0aXZlU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gYXZhaWxhYmxlU3RyYXRlZ2llcy5maW5kKGF2YWlsID0+IGF2YWlsLmlkID09PSBzKT8uaXNHcm91cGluZyk7XG4gIGNvbnN0IGJ1Y2tldHMgPSBuZXcgTWFwPHN0cmluZywgVGFiR3JvdXA+KCk7XG5cbiAgY29uc3QgYWxsVGFic01hcCA9IG5ldyBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YT4oKTtcbiAgdGFicy5mb3JFYWNoKHQgPT4gYWxsVGFic01hcC5zZXQodC5pZCwgdCkpO1xuXG4gIHRhYnMuZm9yRWFjaCgodGFiKSA9PiB7XG4gICAgbGV0IGtleXM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgYXBwbGllZFN0cmF0ZWdpZXM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgY29sbGVjdGVkTW9kZXM6IHN0cmluZ1tdID0gW107XG5cbiAgICB0cnkge1xuICAgICAgICBmb3IgKGNvbnN0IHMgb2YgZWZmZWN0aXZlU3RyYXRlZ2llcykge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gZ2V0R3JvdXBpbmdSZXN1bHQodGFiLCBzKTtcbiAgICAgICAgICAgIGlmIChyZXN1bHQua2V5ICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAga2V5cy5wdXNoKGAke3N9OiR7cmVzdWx0LmtleX1gKTtcbiAgICAgICAgICAgICAgICBhcHBsaWVkU3RyYXRlZ2llcy5wdXNoKHMpO1xuICAgICAgICAgICAgICAgIGNvbGxlY3RlZE1vZGVzLnB1c2gocmVzdWx0Lm1vZGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGdlbmVyYXRpbmcgZ3JvdXBpbmcga2V5XCIsIHsgdGFiSWQ6IHRhYi5pZCwgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgcmV0dXJuOyAvLyBTa2lwIHRoaXMgdGFiIG9uIGVycm9yXG4gICAgfVxuXG4gICAgLy8gSWYgbm8gc3RyYXRlZ2llcyBhcHBsaWVkIChlLmcuIGFsbCBmaWx0ZXJlZCBvdXQpLCBza2lwIGdyb3VwaW5nIGZvciB0aGlzIHRhYlxuICAgIGlmIChrZXlzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgZWZmZWN0aXZlTW9kZSA9IHJlc29sdmVXaW5kb3dNb2RlKGNvbGxlY3RlZE1vZGVzKTtcbiAgICBjb25zdCB2YWx1ZUtleSA9IGtleXMuam9pbihcIjo6XCIpO1xuICAgIGxldCBidWNrZXRLZXkgPSBcIlwiO1xuICAgIGlmIChlZmZlY3RpdmVNb2RlID09PSAnY3VycmVudCcpIHtcbiAgICAgICAgIGJ1Y2tldEtleSA9IGB3aW5kb3ctJHt0YWIud2luZG93SWR9OjpgICsgdmFsdWVLZXk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgIGJ1Y2tldEtleSA9IGBnbG9iYWw6OmAgKyB2YWx1ZUtleTtcbiAgICB9XG5cbiAgICBsZXQgZ3JvdXAgPSBidWNrZXRzLmdldChidWNrZXRLZXkpO1xuICAgIGlmICghZ3JvdXApIHtcbiAgICAgIGxldCBncm91cENvbG9yID0gbnVsbDtcbiAgICAgIGxldCBjb2xvckZpZWxkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbiAgICAgIGZvciAoY29uc3Qgc0lkIG9mIGFwcGxpZWRTdHJhdGVnaWVzKSB7XG4gICAgICAgIGNvbnN0IHJ1bGUgPSBnZXRTdHJhdGVneUNvbG9yUnVsZShzSWQpO1xuICAgICAgICBpZiAocnVsZSkge1xuICAgICAgICAgICAgZ3JvdXBDb2xvciA9IHJ1bGUuY29sb3I7XG4gICAgICAgICAgICBjb2xvckZpZWxkID0gcnVsZS5jb2xvckZpZWxkO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKGdyb3VwQ29sb3IgPT09ICdtYXRjaCcpIHtcbiAgICAgICAgZ3JvdXBDb2xvciA9IGNvbG9yRm9yS2V5KHZhbHVlS2V5LCAwKTtcbiAgICAgIH0gZWxzZSBpZiAoZ3JvdXBDb2xvciA9PT0gJ2ZpZWxkJyAmJiBjb2xvckZpZWxkKSB7XG4gICAgICAgIGNvbnN0IHZhbCA9IGdldEZpZWxkVmFsdWUodGFiLCBjb2xvckZpZWxkKTtcbiAgICAgICAgY29uc3Qga2V5ID0gdmFsICE9PSB1bmRlZmluZWQgJiYgdmFsICE9PSBudWxsID8gU3RyaW5nKHZhbCkgOiBcIlwiO1xuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkoa2V5LCAwKTtcbiAgICAgIH0gZWxzZSBpZiAoIWdyb3VwQ29sb3IgfHwgZ3JvdXBDb2xvciA9PT0gJ2ZpZWxkJykge1xuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkoYnVja2V0S2V5LCBidWNrZXRzLnNpemUpO1xuICAgICAgfVxuXG4gICAgICBncm91cCA9IHtcbiAgICAgICAgaWQ6IGJ1Y2tldEtleSxcbiAgICAgICAgd2luZG93SWQ6IHRhYi53aW5kb3dJZCxcbiAgICAgICAgbGFiZWw6IFwiXCIsXG4gICAgICAgIGNvbG9yOiBncm91cENvbG9yLFxuICAgICAgICB0YWJzOiBbXSxcbiAgICAgICAgcmVhc29uOiBhcHBsaWVkU3RyYXRlZ2llcy5qb2luKFwiICsgXCIpLFxuICAgICAgICB3aW5kb3dNb2RlOiBlZmZlY3RpdmVNb2RlXG4gICAgICB9O1xuICAgICAgYnVja2V0cy5zZXQoYnVja2V0S2V5LCBncm91cCk7XG4gICAgfVxuICAgIGdyb3VwLnRhYnMucHVzaCh0YWIpO1xuICB9KTtcblxuICBjb25zdCBncm91cHMgPSBBcnJheS5mcm9tKGJ1Y2tldHMudmFsdWVzKCkpO1xuICBncm91cHMuZm9yRWFjaChncm91cCA9PiB7XG4gICAgZ3JvdXAubGFiZWwgPSBnZW5lcmF0ZUxhYmVsKGVmZmVjdGl2ZVN0cmF0ZWdpZXMsIGdyb3VwLnRhYnMsIGFsbFRhYnNNYXApO1xuICB9KTtcblxuICByZXR1cm4gZ3JvdXBzO1xufTtcblxuY29uc3QgY2hlY2tWYWx1ZU1hdGNoID0gKFxuICAgIG9wZXJhdG9yOiBzdHJpbmcsXG4gICAgcmF3VmFsdWU6IGFueSxcbiAgICBydWxlVmFsdWU6IHN0cmluZ1xuKTogeyBpc01hdGNoOiBib29sZWFuOyBtYXRjaE9iajogUmVnRXhwRXhlY0FycmF5IHwgbnVsbCB9ID0+IHtcbiAgICBjb25zdCB2YWx1ZVN0ciA9IHJhd1ZhbHVlICE9PSB1bmRlZmluZWQgJiYgcmF3VmFsdWUgIT09IG51bGwgPyBTdHJpbmcocmF3VmFsdWUpIDogXCJcIjtcbiAgICBjb25zdCB2YWx1ZVRvQ2hlY2sgPSB2YWx1ZVN0ci50b0xvd2VyQ2FzZSgpO1xuICAgIGNvbnN0IHBhdHRlcm5Ub0NoZWNrID0gcnVsZVZhbHVlID8gcnVsZVZhbHVlLnRvTG93ZXJDYXNlKCkgOiBcIlwiO1xuXG4gICAgbGV0IGlzTWF0Y2ggPSBmYWxzZTtcbiAgICBsZXQgbWF0Y2hPYmo6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGwgPSBudWxsO1xuXG4gICAgc3dpdGNoIChvcGVyYXRvcikge1xuICAgICAgICBjYXNlICdjb250YWlucyc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suaW5jbHVkZXMocGF0dGVyblRvQ2hlY2spOyBicmVhaztcbiAgICAgICAgY2FzZSAnZG9lc05vdENvbnRhaW4nOiBpc01hdGNoID0gIXZhbHVlVG9DaGVjay5pbmNsdWRlcyhwYXR0ZXJuVG9DaGVjayk7IGJyZWFrO1xuICAgICAgICBjYXNlICdlcXVhbHMnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrID09PSBwYXR0ZXJuVG9DaGVjazsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3N0YXJ0c1dpdGgnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrLnN0YXJ0c1dpdGgocGF0dGVyblRvQ2hlY2spOyBicmVhaztcbiAgICAgICAgY2FzZSAnZW5kc1dpdGgnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrLmVuZHNXaXRoKHBhdHRlcm5Ub0NoZWNrKTsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2V4aXN0cyc6IGlzTWF0Y2ggPSByYXdWYWx1ZSAhPT0gdW5kZWZpbmVkOyBicmVhaztcbiAgICAgICAgY2FzZSAnZG9lc05vdEV4aXN0JzogaXNNYXRjaCA9IHJhd1ZhbHVlID09PSB1bmRlZmluZWQ7IGJyZWFrO1xuICAgICAgICBjYXNlICdpc051bGwnOiBpc01hdGNoID0gcmF3VmFsdWUgPT09IG51bGw7IGJyZWFrO1xuICAgICAgICBjYXNlICdpc05vdE51bGwnOiBpc01hdGNoID0gcmF3VmFsdWUgIT09IG51bGw7IGJyZWFrO1xuICAgICAgICBjYXNlICdtYXRjaGVzJzpcbiAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChydWxlVmFsdWUsICdpJyk7XG4gICAgICAgICAgICAgICAgbWF0Y2hPYmogPSByZWdleC5leGVjKHZhbHVlU3RyKTtcbiAgICAgICAgICAgICAgICBpc01hdGNoID0gISFtYXRjaE9iajtcbiAgICAgICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICByZXR1cm4geyBpc01hdGNoLCBtYXRjaE9iaiB9O1xufTtcblxuZXhwb3J0IGNvbnN0IGNoZWNrQ29uZGl0aW9uID0gKGNvbmRpdGlvbjogUnVsZUNvbmRpdGlvbiwgdGFiOiBUYWJNZXRhZGF0YSk6IGJvb2xlYW4gPT4ge1xuICAgIGlmICghY29uZGl0aW9uKSByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgcmF3VmFsdWUgPSBnZXRGaWVsZFZhbHVlKHRhYiwgY29uZGl0aW9uLmZpZWxkKTtcbiAgICBjb25zdCB7IGlzTWF0Y2ggfSA9IGNoZWNrVmFsdWVNYXRjaChjb25kaXRpb24ub3BlcmF0b3IsIHJhd1ZhbHVlLCBjb25kaXRpb24udmFsdWUpO1xuICAgIHJldHVybiBpc01hdGNoO1xufTtcblxuZnVuY3Rpb24gZXZhbHVhdGVMZWdhY3lSdWxlcyhsZWdhY3lSdWxlczogU3RyYXRlZ3lSdWxlW10sIHRhYjogVGFiTWV0YWRhdGEpOiBzdHJpbmcgfCBudWxsIHtcbiAgICAvLyBEZWZlbnNpdmUgY2hlY2tcbiAgICBpZiAoIWxlZ2FjeVJ1bGVzIHx8ICFBcnJheS5pc0FycmF5KGxlZ2FjeVJ1bGVzKSkge1xuICAgICAgICBpZiAoIWxlZ2FjeVJ1bGVzKSByZXR1cm4gbnVsbDtcbiAgICAgICAgLy8gVHJ5IGFzQXJyYXkgaWYgaXQncyBub3QgYXJyYXkgYnV0IHRydXRoeSAodW5saWtlbHkgZ2l2ZW4gcHJldmlvdXMgbG9naWMgYnV0IHNhZmUpXG4gICAgfVxuXG4gICAgY29uc3QgbGVnYWN5UnVsZXNMaXN0ID0gYXNBcnJheTxTdHJhdGVneVJ1bGU+KGxlZ2FjeVJ1bGVzKTtcbiAgICBpZiAobGVnYWN5UnVsZXNMaXN0Lmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG5cbiAgICB0cnkge1xuICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgbGVnYWN5UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICBpZiAoIXJ1bGUpIGNvbnRpbnVlO1xuICAgICAgICAgICAgY29uc3QgcmF3VmFsdWUgPSBnZXRGaWVsZFZhbHVlKHRhYiwgcnVsZS5maWVsZCk7XG4gICAgICAgICAgICBjb25zdCB7IGlzTWF0Y2gsIG1hdGNoT2JqIH0gPSBjaGVja1ZhbHVlTWF0Y2gocnVsZS5vcGVyYXRvciwgcmF3VmFsdWUsIHJ1bGUudmFsdWUpO1xuXG4gICAgICAgICAgICBpZiAoaXNNYXRjaCkge1xuICAgICAgICAgICAgICAgIGxldCByZXN1bHQgPSBydWxlLnJlc3VsdDtcbiAgICAgICAgICAgICAgICBpZiAobWF0Y2hPYmopIHtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBtYXRjaE9iai5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKG5ldyBSZWdFeHAoYFxcXFwkJHtpfWAsICdnJyksIG1hdGNoT2JqW2ldIHx8IFwiXCIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGV2YWx1YXRpbmcgbGVnYWN5IHJ1bGVzXCIsIHsgZXJyb3I6IFN0cmluZyhlcnJvcikgfSk7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgY29uc3QgZ2V0R3JvdXBpbmdSZXN1bHQgPSAodGFiOiBUYWJNZXRhZGF0YSwgc3RyYXRlZ3k6IEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcpOiB7IGtleTogc3RyaW5nIHwgbnVsbCwgbW9kZTogXCJjdXJyZW50XCIgfCBcIm5ld1wiIHwgXCJjb21wb3VuZFwiIH0gPT4ge1xuICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneSk7XG4gIGlmIChjdXN0b20pIHtcbiAgICAgIGNvbnN0IGZpbHRlckdyb3Vwc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb25bXT4oY3VzdG9tLmZpbHRlckdyb3Vwcyk7XG4gICAgICBjb25zdCBmaWx0ZXJzTGlzdCA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbj4oY3VzdG9tLmZpbHRlcnMpO1xuXG4gICAgICBsZXQgbWF0Y2ggPSBmYWxzZTtcblxuICAgICAgaWYgKGZpbHRlckdyb3Vwc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIC8vIE9SIGxvZ2ljXG4gICAgICAgICAgZm9yIChjb25zdCBncm91cCBvZiBmaWx0ZXJHcm91cHNMaXN0KSB7XG4gICAgICAgICAgICAgIGNvbnN0IGdyb3VwUnVsZXMgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGdyb3VwKTtcbiAgICAgICAgICAgICAgaWYgKGdyb3VwUnVsZXMubGVuZ3RoID09PSAwIHx8IGdyb3VwUnVsZXMuZXZlcnkociA9PiBjaGVja0NvbmRpdGlvbihyLCB0YWIpKSkge1xuICAgICAgICAgICAgICAgICAgbWF0Y2ggPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGZpbHRlcnNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAvLyBMZWdhY3kvU2ltcGxlIEFORCBsb2dpY1xuICAgICAgICAgIGlmIChmaWx0ZXJzTGlzdC5ldmVyeShmID0+IGNoZWNrQ29uZGl0aW9uKGYsIHRhYikpKSB7XG4gICAgICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIE5vIGZpbHRlcnMgLT4gTWF0Y2ggYWxsXG4gICAgICAgICAgbWF0Y2ggPSB0cnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoIW1hdGNoKSB7XG4gICAgICAgICAgcmV0dXJuIHsga2V5OiBudWxsLCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICAgICAgfVxuXG4gICAgICBjb25zdCBncm91cGluZ1J1bGVzTGlzdCA9IGFzQXJyYXk8R3JvdXBpbmdSdWxlPihjdXN0b20uZ3JvdXBpbmdSdWxlcyk7XG4gICAgICBpZiAoZ3JvdXBpbmdSdWxlc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgIGNvbnN0IG1vZGVzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZ3JvdXBpbmdSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXJ1bGUpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIGxldCB2YWwgPSBcIlwiO1xuICAgICAgICAgICAgICAgIGlmIChydWxlLnNvdXJjZSA9PT0gJ2ZpZWxkJykge1xuICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmF3ID0gZ2V0RmllbGRWYWx1ZSh0YWIsIHJ1bGUudmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgdmFsID0gcmF3ICE9PSB1bmRlZmluZWQgJiYgcmF3ICE9PSBudWxsID8gU3RyaW5nKHJhdykgOiBcIlwiO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICB2YWwgPSBydWxlLnZhbHVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh2YWwgJiYgcnVsZS50cmFuc2Zvcm0gJiYgcnVsZS50cmFuc2Zvcm0gIT09ICdub25lJykge1xuICAgICAgICAgICAgICAgICAgICBzd2l0Y2ggKHJ1bGUudHJhbnNmb3JtKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdzdHJpcFRsZCc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gc3RyaXBUbGQodmFsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ2xvd2VyY2FzZSc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gdmFsLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICd1cHBlcmNhc2UnOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHZhbC50b1VwcGVyQ2FzZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnZmlyc3RDaGFyJzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSB2YWwuY2hhckF0KDApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnZG9tYWluJzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBkb21haW5Gcm9tVXJsKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdob3N0bmFtZSc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IG5ldyBVUkwodmFsKS5ob3N0bmFtZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHsgLyoga2VlcCBhcyBpcyAqLyB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdyZWdleCc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJ1bGUudHJhbnNmb3JtUGF0dGVybikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHJlZ2V4ID0gcmVnZXhDYWNoZS5nZXQocnVsZS50cmFuc2Zvcm1QYXR0ZXJuKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghcmVnZXgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZWdleCA9IG5ldyBSZWdFeHAocnVsZS50cmFuc2Zvcm1QYXR0ZXJuKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZWdleENhY2hlLnNldChydWxlLnRyYW5zZm9ybVBhdHRlcm4sIHJlZ2V4KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJ1bGUucmVwbGFjZW1lbnQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHZhbC5yZXBsYWNlKHJlZ2V4LCBydWxlLnJlcGxhY2VtZW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbWF0Y2ggPSByZWdleC5leGVjKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChtYXRjaC5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsZXQgZXh0cmFjdGVkID0gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgbWF0Y2gubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleHRyYWN0ZWQgKz0gbWF0Y2hbaV0gfHwgXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IGV4dHJhY3RlZDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IG1hdGNoWzBdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxvZ0RlYnVnKFwiSW52YWxpZCByZWdleCBpbiB0cmFuc2Zvcm1cIiwgeyBwYXR0ZXJuOiBydWxlLnRyYW5zZm9ybVBhdHRlcm4sIGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodmFsKSB7XG4gICAgICAgICAgICAgICAgICAgIHBhcnRzLnB1c2godmFsKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJ1bGUud2luZG93TW9kZSkgbW9kZXMucHVzaChydWxlLndpbmRvd01vZGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgbG9nRGVidWcoXCJFcnJvciBhcHBseWluZyBncm91cGluZyBydWxlc1wiLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHsga2V5OiBwYXJ0cy5qb2luKFwiIC0gXCIpLCBtb2RlOiByZXNvbHZlV2luZG93TW9kZShtb2RlcykgfTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHsga2V5OiBjdXN0b20uZmFsbGJhY2sgfHwgXCJNaXNjXCIsIG1vZGU6IFwiY3VycmVudFwiIH07XG4gICAgICB9IGVsc2UgaWYgKGN1c3RvbS5ydWxlcykge1xuICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGV2YWx1YXRlTGVnYWN5UnVsZXMoYXNBcnJheTxTdHJhdGVneVJ1bGU+KGN1c3RvbS5ydWxlcyksIHRhYik7XG4gICAgICAgICAgaWYgKHJlc3VsdCkgcmV0dXJuIHsga2V5OiByZXN1bHQsIG1vZGU6IFwiY3VycmVudFwiIH07XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7IGtleTogY3VzdG9tLmZhbGxiYWNrIHx8IFwiTWlzY1wiLCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICB9XG5cbiAgLy8gQnVpbHQtaW4gc3RyYXRlZ2llc1xuICBsZXQgc2ltcGxlS2V5OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgc3dpdGNoIChzdHJhdGVneSkge1xuICAgIGNhc2UgXCJkb21haW5cIjpcbiAgICBjYXNlIFwiZG9tYWluX2Z1bGxcIjpcbiAgICAgIHNpbXBsZUtleSA9IGRvbWFpbkZyb21VcmwodGFiLnVybCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwidG9waWNcIjpcbiAgICAgIHNpbXBsZUtleSA9IHNlbWFudGljQnVja2V0KHRhYi50aXRsZSwgdGFiLnVybCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwibGluZWFnZVwiOlxuICAgICAgc2ltcGxlS2V5ID0gbmF2aWdhdGlvbktleSh0YWIpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcImNvbnRleHRcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi5jb250ZXh0IHx8IFwiVW5jYXRlZ29yaXplZFwiO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInBpbm5lZFwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLnBpbm5lZCA/IFwicGlubmVkXCIgOiBcInVucGlubmVkXCI7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwiYWdlXCI6XG4gICAgICBzaW1wbGVLZXkgPSBnZXRSZWNlbmN5TGFiZWwodGFiLmxhc3RBY2Nlc3NlZCA/PyAwKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJ1cmxcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi51cmw7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwidGl0bGVcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi50aXRsZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJyZWNlbmN5XCI6XG4gICAgICBzaW1wbGVLZXkgPSBTdHJpbmcodGFiLmxhc3RBY2Nlc3NlZCA/PyAwKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJuZXN0aW5nXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCA/IFwiY2hpbGRcIiA6IFwicm9vdFwiO1xuICAgICAgYnJlYWs7XG4gICAgZGVmYXVsdDpcbiAgICAgICAgY29uc3QgdmFsID0gZ2V0RmllbGRWYWx1ZSh0YWIsIHN0cmF0ZWd5KTtcbiAgICAgICAgaWYgKHZhbCAhPT0gdW5kZWZpbmVkICYmIHZhbCAhPT0gbnVsbCkge1xuICAgICAgICAgICAgc2ltcGxlS2V5ID0gU3RyaW5nKHZhbCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzaW1wbGVLZXkgPSBcIlVua25vd25cIjtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgfVxuICByZXR1cm4geyBrZXk6IHNpbXBsZUtleSwgbW9kZTogXCJjdXJyZW50XCIgfTtcbn07XG5cbmV4cG9ydCBjb25zdCBncm91cGluZ0tleSA9ICh0YWI6IFRhYk1ldGFkYXRhLCBzdHJhdGVneTogR3JvdXBpbmdTdHJhdGVneSB8IHN0cmluZyk6IHN0cmluZyB8IG51bGwgPT4ge1xuICAgIHJldHVybiBnZXRHcm91cGluZ1Jlc3VsdCh0YWIsIHN0cmF0ZWd5KS5rZXk7XG59O1xuXG5mdW5jdGlvbiBpc0NvbnRleHRGaWVsZChmaWVsZDogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIGZpZWxkID09PSAnY29udGV4dCcgfHwgZmllbGQgPT09ICdnZW5yZScgfHwgZmllbGQgPT09ICdzaXRlTmFtZScgfHwgZmllbGQuc3RhcnRzV2l0aCgnY29udGV4dERhdGEuJyk7XG59XG5cbmV4cG9ydCBjb25zdCByZXF1aXJlc0NvbnRleHRBbmFseXNpcyA9IChzdHJhdGVneUlkczogKHN0cmluZyB8IFNvcnRpbmdTdHJhdGVneSlbXSk6IGJvb2xlYW4gPT4ge1xuICAgIC8vIENoZWNrIGlmIFwiY29udGV4dFwiIHN0cmF0ZWd5IGlzIGV4cGxpY2l0bHkgcmVxdWVzdGVkXG4gICAgaWYgKHN0cmF0ZWd5SWRzLmluY2x1ZGVzKFwiY29udGV4dFwiKSkgcmV0dXJuIHRydWU7XG5cbiAgICBjb25zdCBzdHJhdGVnaWVzID0gZ2V0U3RyYXRlZ2llcyhjdXN0b21TdHJhdGVnaWVzKTtcbiAgICAvLyBmaWx0ZXIgb25seSB0aG9zZSB0aGF0IG1hdGNoIHRoZSByZXF1ZXN0ZWQgSURzXG4gICAgY29uc3QgYWN0aXZlRGVmcyA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gc3RyYXRlZ3lJZHMuaW5jbHVkZXMocy5pZCkpO1xuXG4gICAgZm9yIChjb25zdCBkZWYgb2YgYWN0aXZlRGVmcykge1xuICAgICAgICAvLyBJZiBpdCdzIGEgYnVpbHQtaW4gc3RyYXRlZ3kgdGhhdCBuZWVkcyBjb250ZXh0IChvbmx5ICdjb250ZXh0JyBkb2VzKVxuICAgICAgICBpZiAoZGVmLmlkID09PSAnY29udGV4dCcpIHJldHVybiB0cnVlO1xuXG4gICAgICAgIC8vIElmIGl0IGlzIGEgY3VzdG9tIHN0cmF0ZWd5IChvciBvdmVycmlkZXMgYnVpbHQtaW4pLCBjaGVjayBpdHMgcnVsZXNcbiAgICAgICAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRlZ2llcy5maW5kKGMgPT4gYy5pZCA9PT0gZGVmLmlkKTtcbiAgICAgICAgaWYgKGN1c3RvbSkge1xuICAgICAgICAgICAgIGNvbnN0IGdyb3VwUnVsZXNMaXN0ID0gYXNBcnJheTxHcm91cGluZ1J1bGU+KGN1c3RvbS5ncm91cGluZ1J1bGVzKTtcbiAgICAgICAgICAgICBjb25zdCBzb3J0UnVsZXNMaXN0ID0gYXNBcnJheTxTb3J0aW5nUnVsZT4oY3VzdG9tLnNvcnRpbmdSdWxlcyk7XG4gICAgICAgICAgICAgY29uc3QgZ3JvdXBTb3J0UnVsZXNMaXN0ID0gYXNBcnJheTxTb3J0aW5nUnVsZT4oY3VzdG9tLmdyb3VwU29ydGluZ1J1bGVzKTtcbiAgICAgICAgICAgICBjb25zdCBmaWx0ZXJzTGlzdCA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbj4oY3VzdG9tLmZpbHRlcnMpO1xuICAgICAgICAgICAgIGNvbnN0IGZpbHRlckdyb3Vwc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb25bXT4oY3VzdG9tLmZpbHRlckdyb3Vwcyk7XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZ3JvdXBSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgcnVsZS5zb3VyY2UgPT09ICdmaWVsZCcgJiYgaXNDb250ZXh0RmllbGQocnVsZS52YWx1ZSkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBydWxlLmNvbG9yID09PSAnZmllbGQnICYmIHJ1bGUuY29sb3JGaWVsZCAmJiBpc0NvbnRleHRGaWVsZChydWxlLmNvbG9yRmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2Ygc29ydFJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBpc0NvbnRleHRGaWVsZChydWxlLmZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwU29ydFJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBpc0NvbnRleHRGaWVsZChydWxlLmZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGZpbHRlcnNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IGdyb3VwIG9mIGZpbHRlckdyb3Vwc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgY29uc3QgZ3JvdXBSdWxlcyA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbj4oZ3JvdXApO1xuICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZ3JvdXBSdWxlcykge1xuICAgICAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbn07XG4iLCAiaW1wb3J0IHsgU29ydGluZ1N0cmF0ZWd5LCBUYWJNZXRhZGF0YSwgQ3VzdG9tU3RyYXRlZ3ksIFNvcnRpbmdSdWxlIH0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgZG9tYWluRnJvbVVybCwgc2VtYW50aWNCdWNrZXQsIG5hdmlnYXRpb25LZXksIGdyb3VwaW5nS2V5LCBnZXRGaWVsZFZhbHVlLCBnZXRDdXN0b21TdHJhdGVnaWVzIH0gZnJvbSBcIi4vZ3JvdXBpbmdTdHJhdGVnaWVzLmpzXCI7XG5pbXBvcnQgeyBsb2dEZWJ1ZyB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBhc0FycmF5IH0gZnJvbSBcIi4uL3NoYXJlZC91dGlscy5qc1wiO1xuXG5leHBvcnQgY29uc3QgcmVjZW5jeVNjb3JlID0gKHRhYjogVGFiTWV0YWRhdGEpID0+IHRhYi5sYXN0QWNjZXNzZWQgPz8gMDtcbmV4cG9ydCBjb25zdCBoaWVyYXJjaHlTY29yZSA9ICh0YWI6IFRhYk1ldGFkYXRhKSA9PiAodGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQgPyAxIDogMCk7XG5leHBvcnQgY29uc3QgcGlubmVkU2NvcmUgPSAodGFiOiBUYWJNZXRhZGF0YSkgPT4gKHRhYi5waW5uZWQgPyAwIDogMSk7XG5cbmV4cG9ydCBjb25zdCBzb3J0VGFicyA9ICh0YWJzOiBUYWJNZXRhZGF0YVtdLCBzdHJhdGVnaWVzOiBTb3J0aW5nU3RyYXRlZ3lbXSk6IFRhYk1ldGFkYXRhW10gPT4ge1xuICBjb25zdCBzY29yaW5nOiBTb3J0aW5nU3RyYXRlZ3lbXSA9IHN0cmF0ZWdpZXMubGVuZ3RoID8gc3RyYXRlZ2llcyA6IFtcInBpbm5lZFwiLCBcInJlY2VuY3lcIl07XG4gIHJldHVybiBbLi4udGFic10uc29ydCgoYSwgYikgPT4ge1xuICAgIGZvciAoY29uc3Qgc3RyYXRlZ3kgb2Ygc2NvcmluZykge1xuICAgICAgY29uc3QgZGlmZiA9IGNvbXBhcmVCeShzdHJhdGVneSwgYSwgYik7XG4gICAgICBpZiAoZGlmZiAhPT0gMCkgcmV0dXJuIGRpZmY7XG4gICAgfVxuICAgIHJldHVybiBhLmlkIC0gYi5pZDtcbiAgfSk7XG59O1xuXG5leHBvcnQgY29uc3QgY29tcGFyZUJ5ID0gKHN0cmF0ZWd5OiBTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmcsIGE6IFRhYk1ldGFkYXRhLCBiOiBUYWJNZXRhZGF0YSk6IG51bWJlciA9PiB7XG4gIC8vIDEuIENoZWNrIEN1c3RvbSBTdHJhdGVnaWVzIGZvciBTb3J0aW5nIFJ1bGVzXG4gIGNvbnN0IGN1c3RvbVN0cmF0cyA9IGdldEN1c3RvbVN0cmF0ZWdpZXMoKTtcbiAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneSk7XG4gIGlmIChjdXN0b20pIHtcbiAgICAgIGNvbnN0IHNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihjdXN0b20uc29ydGluZ1J1bGVzKTtcbiAgICAgIGlmIChzb3J0UnVsZXNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAvLyBFdmFsdWF0ZSBjdXN0b20gc29ydGluZyBydWxlcyBpbiBvcmRlclxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBzb3J0UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgICBpZiAoIXJ1bGUpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgY29uc3QgdmFsQSA9IGdldEZpZWxkVmFsdWUoYSwgcnVsZS5maWVsZCk7XG4gICAgICAgICAgICAgICAgICBjb25zdCB2YWxCID0gZ2V0RmllbGRWYWx1ZShiLCBydWxlLmZpZWxkKTtcblxuICAgICAgICAgICAgICAgICAgbGV0IHJlc3VsdCA9IDA7XG4gICAgICAgICAgICAgICAgICBpZiAodmFsQSA8IHZhbEIpIHJlc3VsdCA9IC0xO1xuICAgICAgICAgICAgICAgICAgZWxzZSBpZiAodmFsQSA+IHZhbEIpIHJlc3VsdCA9IDE7XG5cbiAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQgIT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcnVsZS5vcmRlciA9PT0gJ2Rlc2MnID8gLXJlc3VsdCA6IHJlc3VsdDtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgbG9nRGVidWcoXCJFcnJvciBldmFsdWF0aW5nIGN1c3RvbSBzb3J0aW5nIHJ1bGVzXCIsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gSWYgYWxsIHJ1bGVzIGVxdWFsLCBjb250aW51ZSB0byBuZXh0IHN0cmF0ZWd5IChyZXR1cm4gMClcbiAgICAgICAgICByZXR1cm4gMDtcbiAgICAgIH1cbiAgfVxuXG4gIC8vIDIuIEJ1aWx0LWluIG9yIGZhbGxiYWNrXG4gIHN3aXRjaCAoc3RyYXRlZ3kpIHtcbiAgICBjYXNlIFwicmVjZW5jeVwiOlxuICAgICAgcmV0dXJuIChiLmxhc3RBY2Nlc3NlZCA/PyAwKSAtIChhLmxhc3RBY2Nlc3NlZCA/PyAwKTtcbiAgICBjYXNlIFwibmVzdGluZ1wiOiAvLyBGb3JtZXJseSBoaWVyYXJjaHlcbiAgICAgIHJldHVybiBoaWVyYXJjaHlTY29yZShhKSAtIGhpZXJhcmNoeVNjb3JlKGIpO1xuICAgIGNhc2UgXCJwaW5uZWRcIjpcbiAgICAgIHJldHVybiBwaW5uZWRTY29yZShhKSAtIHBpbm5lZFNjb3JlKGIpO1xuICAgIGNhc2UgXCJ0aXRsZVwiOlxuICAgICAgcmV0dXJuIGEudGl0bGUubG9jYWxlQ29tcGFyZShiLnRpdGxlKTtcbiAgICBjYXNlIFwidXJsXCI6XG4gICAgICByZXR1cm4gYS51cmwubG9jYWxlQ29tcGFyZShiLnVybCk7XG4gICAgY2FzZSBcImNvbnRleHRcIjpcbiAgICAgIHJldHVybiAoYS5jb250ZXh0ID8/IFwiXCIpLmxvY2FsZUNvbXBhcmUoYi5jb250ZXh0ID8/IFwiXCIpO1xuICAgIGNhc2UgXCJkb21haW5cIjpcbiAgICBjYXNlIFwiZG9tYWluX2Z1bGxcIjpcbiAgICAgIHJldHVybiBkb21haW5Gcm9tVXJsKGEudXJsKS5sb2NhbGVDb21wYXJlKGRvbWFpbkZyb21VcmwoYi51cmwpKTtcbiAgICBjYXNlIFwidG9waWNcIjpcbiAgICAgIHJldHVybiBzZW1hbnRpY0J1Y2tldChhLnRpdGxlLCBhLnVybCkubG9jYWxlQ29tcGFyZShzZW1hbnRpY0J1Y2tldChiLnRpdGxlLCBiLnVybCkpO1xuICAgIGNhc2UgXCJsaW5lYWdlXCI6XG4gICAgICByZXR1cm4gbmF2aWdhdGlvbktleShhKS5sb2NhbGVDb21wYXJlKG5hdmlnYXRpb25LZXkoYikpO1xuICAgIGNhc2UgXCJhZ2VcIjpcbiAgICAgIC8vIFJldmVyc2UgYWxwaGFiZXRpY2FsIGZvciBhZ2UgYnVja2V0cyAoVG9kYXkgPCBZZXN0ZXJkYXkpLCByb3VnaCBhcHByb3hcbiAgICAgIHJldHVybiAoZ3JvdXBpbmdLZXkoYSwgXCJhZ2VcIikgfHwgXCJcIikubG9jYWxlQ29tcGFyZShncm91cGluZ0tleShiLCBcImFnZVwiKSB8fCBcIlwiKTtcbiAgICBkZWZhdWx0OlxuICAgICAgLy8gQ2hlY2sgaWYgaXQncyBhIGdlbmVyaWMgZmllbGQgZmlyc3RcbiAgICAgIGNvbnN0IHZhbEEgPSBnZXRGaWVsZFZhbHVlKGEsIHN0cmF0ZWd5KTtcbiAgICAgIGNvbnN0IHZhbEIgPSBnZXRGaWVsZFZhbHVlKGIsIHN0cmF0ZWd5KTtcblxuICAgICAgaWYgKHZhbEEgIT09IHVuZGVmaW5lZCAmJiB2YWxCICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBpZiAodmFsQSA8IHZhbEIpIHJldHVybiAtMTtcbiAgICAgICAgICBpZiAodmFsQSA+IHZhbEIpIHJldHVybiAxO1xuICAgICAgICAgIHJldHVybiAwO1xuICAgICAgfVxuXG4gICAgICAvLyBGYWxsYmFjayBmb3IgY3VzdG9tIHN0cmF0ZWdpZXMgZ3JvdXBpbmcga2V5IChpZiB1c2luZyBjdXN0b20gc3RyYXRlZ3kgYXMgc29ydGluZyBidXQgbm8gc29ydGluZyBydWxlcyBkZWZpbmVkKVxuICAgICAgLy8gb3IgdW5oYW5kbGVkIGJ1aWx0LWluc1xuICAgICAgcmV0dXJuIChncm91cGluZ0tleShhLCBzdHJhdGVneSkgfHwgXCJcIikubG9jYWxlQ29tcGFyZShncm91cGluZ0tleShiLCBzdHJhdGVneSkgfHwgXCJcIik7XG4gIH1cbn07XG4iLCAiLy8gbG9naWMudHNcbi8vIFB1cmUgZnVuY3Rpb25zIGZvciBleHRyYWN0aW9uIGxvZ2ljXG5cbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVVcmwodXJsU3RyOiBzdHJpbmcpOiBzdHJpbmcge1xuICB0cnkge1xuICAgIGNvbnN0IHVybCA9IG5ldyBVUkwodXJsU3RyKTtcbiAgICBjb25zdCBwYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHVybC5zZWFyY2gpO1xuICAgIGNvbnN0IGtleXM6IHN0cmluZ1tdID0gW107XG4gICAgcGFyYW1zLmZvckVhY2goKF8sIGtleSkgPT4ga2V5cy5wdXNoKGtleSkpO1xuICAgIGNvbnN0IGhvc3RuYW1lID0gdXJsLmhvc3RuYW1lLnJlcGxhY2UoL153d3dcXC4vLCAnJyk7XG5cbiAgICBjb25zdCBUUkFDS0lORyA9IFsvXnV0bV8vLCAvXmZiY2xpZCQvLCAvXmdjbGlkJC8sIC9eX2dhJC8sIC9ecmVmJC8sIC9eeWNsaWQkLywgL15faHMvXTtcbiAgICBjb25zdCBpc1lvdXR1YmUgPSBob3N0bmFtZS5lbmRzV2l0aCgneW91dHViZS5jb20nKSB8fCBob3N0bmFtZS5lbmRzV2l0aCgneW91dHUuYmUnKTtcbiAgICBjb25zdCBpc0dvb2dsZSA9IGhvc3RuYW1lLmVuZHNXaXRoKCdnb29nbGUuY29tJyk7XG5cbiAgICBjb25zdCBrZWVwOiBzdHJpbmdbXSA9IFtdO1xuICAgIGlmIChpc1lvdXR1YmUpIGtlZXAucHVzaCgndicsICdsaXN0JywgJ3QnLCAnYycsICdjaGFubmVsJywgJ3BsYXlsaXN0Jyk7XG4gICAgaWYgKGlzR29vZ2xlKSBrZWVwLnB1c2goJ3EnLCAnaWQnLCAnc291cmNlaWQnKTtcblxuICAgIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICAgIGlmIChUUkFDS0lORy5zb21lKHIgPT4gci50ZXN0KGtleSkpKSB7XG4gICAgICAgICBwYXJhbXMuZGVsZXRlKGtleSk7XG4gICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICgoaXNZb3V0dWJlIHx8IGlzR29vZ2xlKSAmJiAha2VlcC5pbmNsdWRlcyhrZXkpKSB7XG4gICAgICAgICBwYXJhbXMuZGVsZXRlKGtleSk7XG4gICAgICB9XG4gICAgfVxuICAgIHVybC5zZWFyY2ggPSBwYXJhbXMudG9TdHJpbmcoKTtcbiAgICByZXR1cm4gdXJsLnRvU3RyaW5nKCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICByZXR1cm4gdXJsU3RyO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVlvdVR1YmVVcmwodXJsU3RyOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHVybFN0cik7XG4gICAgICAgIGNvbnN0IHYgPSB1cmwuc2VhcmNoUGFyYW1zLmdldCgndicpO1xuICAgICAgICBjb25zdCBpc1Nob3J0cyA9IHVybC5wYXRobmFtZS5pbmNsdWRlcygnL3Nob3J0cy8nKTtcbiAgICAgICAgbGV0IHZpZGVvSWQgPVxuICAgICAgICAgIHYgfHxcbiAgICAgICAgICAoaXNTaG9ydHMgPyB1cmwucGF0aG5hbWUuc3BsaXQoJy9zaG9ydHMvJylbMV0gOiBudWxsKSB8fFxuICAgICAgICAgICh1cmwuaG9zdG5hbWUgPT09ICd5b3V0dS5iZScgPyB1cmwucGF0aG5hbWUucmVwbGFjZSgnLycsICcnKSA6IG51bGwpO1xuXG4gICAgICAgIGNvbnN0IHBsYXlsaXN0SWQgPSB1cmwuc2VhcmNoUGFyYW1zLmdldCgnbGlzdCcpO1xuICAgICAgICBjb25zdCBwbGF5bGlzdEluZGV4ID0gcGFyc2VJbnQodXJsLnNlYXJjaFBhcmFtcy5nZXQoJ2luZGV4JykgfHwgJzAnLCAxMCk7XG5cbiAgICAgICAgcmV0dXJuIHsgdmlkZW9JZCwgaXNTaG9ydHMsIHBsYXlsaXN0SWQsIHBsYXlsaXN0SW5kZXggfTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHJldHVybiB7IHZpZGVvSWQ6IG51bGwsIGlzU2hvcnRzOiBmYWxzZSwgcGxheWxpc3RJZDogbnVsbCwgcGxheWxpc3RJbmRleDogbnVsbCB9O1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZXh0cmFjdEF1dGhvcihlbnRpdHk6IGFueSk6IHN0cmluZyB8IG51bGwge1xuICAgIGlmICghZW50aXR5IHx8ICFlbnRpdHkuYXV0aG9yKSByZXR1cm4gbnVsbDtcbiAgICBpZiAodHlwZW9mIGVudGl0eS5hdXRob3IgPT09ICdzdHJpbmcnKSByZXR1cm4gZW50aXR5LmF1dGhvcjtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShlbnRpdHkuYXV0aG9yKSkgcmV0dXJuIGVudGl0eS5hdXRob3JbMF0/Lm5hbWUgfHwgbnVsbDtcbiAgICBpZiAodHlwZW9mIGVudGl0eS5hdXRob3IgPT09ICdvYmplY3QnKSByZXR1cm4gZW50aXR5LmF1dGhvci5uYW1lIHx8IG51bGw7XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIGV4dHJhY3RLZXl3b3JkcyhlbnRpdHk6IGFueSk6IHN0cmluZ1tdIHtcbiAgICBpZiAoIWVudGl0eSB8fCAhZW50aXR5LmtleXdvcmRzKSByZXR1cm4gW107XG4gICAgaWYgKHR5cGVvZiBlbnRpdHkua2V5d29yZHMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJldHVybiBlbnRpdHkua2V5d29yZHMuc3BsaXQoJywnKS5tYXAoKHM6IHN0cmluZykgPT4gcy50cmltKCkpO1xuICAgIH1cbiAgICBpZiAoQXJyYXkuaXNBcnJheShlbnRpdHkua2V5d29yZHMpKSByZXR1cm4gZW50aXR5LmtleXdvcmRzO1xuICAgIHJldHVybiBbXTtcbn1cblxuZnVuY3Rpb24gZXh0cmFjdEJyZWFkY3J1bWJzKGpzb25MZDogYW55W10pOiBzdHJpbmdbXSB7XG4gICAgY29uc3QgYnJlYWRjcnVtYkxkID0ganNvbkxkLmZpbmQoaSA9PiBpICYmIGlbJ0B0eXBlJ10gPT09ICdCcmVhZGNydW1iTGlzdCcpO1xuICAgIGlmICghYnJlYWRjcnVtYkxkIHx8ICFBcnJheS5pc0FycmF5KGJyZWFkY3J1bWJMZC5pdGVtTGlzdEVsZW1lbnQpKSByZXR1cm4gW107XG5cbiAgICBjb25zdCBsaXN0ID0gYnJlYWRjcnVtYkxkLml0ZW1MaXN0RWxlbWVudC5zb3J0KChhOiBhbnksIGI6IGFueSkgPT4gKGEucG9zaXRpb24gfHwgMCkgLSAoYi5wb3NpdGlvbiB8fCAwKSk7XG4gICAgY29uc3QgYnJlYWRjcnVtYnM6IHN0cmluZ1tdID0gW107XG4gICAgbGlzdC5mb3JFYWNoKChpdGVtOiBhbnkpID0+IHtcbiAgICAgICAgaWYgKGl0ZW0ubmFtZSkgYnJlYWRjcnVtYnMucHVzaChpdGVtLm5hbWUpO1xuICAgICAgICBlbHNlIGlmIChpdGVtLml0ZW0gJiYgaXRlbS5pdGVtLm5hbWUpIGJyZWFkY3J1bWJzLnB1c2goaXRlbS5pdGVtLm5hbWUpO1xuICAgIH0pO1xuICAgIHJldHVybiBicmVhZGNydW1icztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RKc29uTGRGaWVsZHMoanNvbkxkOiBhbnlbXSkge1xuICAgIC8vIEZpbmQgbWFpbiBlbnRpdHlcbiAgICAvLyBBZGRlZCBzYWZldHkgY2hlY2s6IGkgJiYgaVsnQHR5cGUnXVxuICAgIGNvbnN0IG1haW5FbnRpdHkgPSBqc29uTGQuZmluZChpID0+IGkgJiYgKGlbJ0B0eXBlJ10gPT09ICdBcnRpY2xlJyB8fCBpWydAdHlwZSddID09PSAnVmlkZW9PYmplY3QnIHx8IGlbJ0B0eXBlJ10gPT09ICdOZXdzQXJ0aWNsZScpKSB8fCBqc29uTGRbMF07XG5cbiAgICBsZXQgYXV0aG9yOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICBsZXQgcHVibGlzaGVkQXQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgIGxldCBtb2RpZmllZEF0OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICBsZXQgdGFnczogc3RyaW5nW10gPSBbXTtcblxuICAgIGlmIChtYWluRW50aXR5KSB7XG4gICAgICAgIGF1dGhvciA9IGV4dHJhY3RBdXRob3IobWFpbkVudGl0eSk7XG4gICAgICAgIHB1Ymxpc2hlZEF0ID0gbWFpbkVudGl0eS5kYXRlUHVibGlzaGVkIHx8IG51bGw7XG4gICAgICAgIG1vZGlmaWVkQXQgPSBtYWluRW50aXR5LmRhdGVNb2RpZmllZCB8fCBudWxsO1xuICAgICAgICB0YWdzID0gZXh0cmFjdEtleXdvcmRzKG1haW5FbnRpdHkpO1xuICAgIH1cblxuICAgIGNvbnN0IGJyZWFkY3J1bWJzID0gZXh0cmFjdEJyZWFkY3J1bWJzKGpzb25MZCk7XG5cbiAgICByZXR1cm4geyBhdXRob3IsIHB1Ymxpc2hlZEF0LCBtb2RpZmllZEF0LCB0YWdzLCBicmVhZGNydW1icyB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXh0cmFjdFlvdVR1YmVDaGFubmVsRnJvbUh0bWwoaHRtbDogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG4gIC8vIDEuIFRyeSBKU09OLUxEXG4gIC8vIExvb2sgZm9yIDxzY3JpcHQgdHlwZT1cImFwcGxpY2F0aW9uL2xkK2pzb25cIj4uLi48L3NjcmlwdD5cbiAgLy8gV2UgbmVlZCB0byBsb29wIGJlY2F1c2UgdGhlcmUgbWlnaHQgYmUgbXVsdGlwbGUgc2NyaXB0c1xuICBjb25zdCBzY3JpcHRSZWdleCA9IC88c2NyaXB0XFxzK3R5cGU9W1wiJ11hcHBsaWNhdGlvblxcL2xkXFwranNvbltcIiddW14+XSo+KFtcXHNcXFNdKj8pPFxcL3NjcmlwdD4vZ2k7XG4gIGxldCBtYXRjaDtcbiAgd2hpbGUgKChtYXRjaCA9IHNjcmlwdFJlZ2V4LmV4ZWMoaHRtbCkpICE9PSBudWxsKSB7XG4gICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGpzb24gPSBKU09OLnBhcnNlKG1hdGNoWzFdKTtcbiAgICAgICAgICBjb25zdCBhcnJheSA9IEFycmF5LmlzQXJyYXkoanNvbikgPyBqc29uIDogW2pzb25dO1xuICAgICAgICAgIGNvbnN0IGZpZWxkcyA9IGV4dHJhY3RKc29uTGRGaWVsZHMoYXJyYXkpO1xuICAgICAgICAgIGlmIChmaWVsZHMuYXV0aG9yKSByZXR1cm4gZmllbGRzLmF1dGhvcjtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAvLyBpZ25vcmUgcGFyc2UgZXJyb3JzXG4gICAgICB9XG4gIH1cblxuICAvLyAyLiBUcnkgPGxpbmsgaXRlbXByb3A9XCJuYW1lXCIgY29udGVudD1cIi4uLlwiPiAoWW91VHViZSBvZnRlbiBwdXRzIGNoYW5uZWwgbmFtZSBoZXJlIGluIHNvbWUgY29udGV4dHMpXG4gIC8vIE9yIDxtZXRhIGl0ZW1wcm9wPVwiY2hhbm5lbElkXCIgY29udGVudD1cIi4uLlwiPiAtPiBidXQgdGhhdCdzIElELlxuICAvLyA8bGluayBpdGVtcHJvcD1cIm5hbWVcIiBjb250ZW50PVwiQ2hhbm5lbCBOYW1lXCI+XG4gIC8vIDxzcGFuIGl0ZW1wcm9wPVwiYXV0aG9yXCIgaXRlbXNjb3BlIGl0ZW10eXBlPVwiaHR0cDovL3NjaGVtYS5vcmcvUGVyc29uXCI+PGxpbmsgaXRlbXByb3A9XCJuYW1lXCIgY29udGVudD1cIkNoYW5uZWwgTmFtZVwiPjwvc3Bhbj5cbiAgY29uc3QgbGlua05hbWVSZWdleCA9IC88bGlua1xccytpdGVtcHJvcD1bXCInXW5hbWVbXCInXVxccytjb250ZW50PVtcIiddKFteXCInXSspW1wiJ11cXHMqXFwvPz4vaTtcbiAgY29uc3QgbGlua01hdGNoID0gbGlua05hbWVSZWdleC5leGVjKGh0bWwpO1xuICBpZiAobGlua01hdGNoICYmIGxpbmtNYXRjaFsxXSkgcmV0dXJuIGRlY29kZUh0bWxFbnRpdGllcyhsaW5rTWF0Y2hbMV0pO1xuXG4gIC8vIDMuIFRyeSBtZXRhIGF1dGhvclxuICBjb25zdCBtZXRhQXV0aG9yUmVnZXggPSAvPG1ldGFcXHMrbmFtZT1bXCInXWF1dGhvcltcIiddXFxzK2NvbnRlbnQ9W1wiJ10oW15cIiddKylbXCInXVxccypcXC8/Pi9pO1xuICBjb25zdCBtZXRhTWF0Y2ggPSBtZXRhQXV0aG9yUmVnZXguZXhlYyhodG1sKTtcbiAgaWYgKG1ldGFNYXRjaCAmJiBtZXRhTWF0Y2hbMV0pIHtcbiAgICAgIC8vIFlvdVR1YmUgbWV0YSBhdXRob3IgaXMgb2Z0ZW4gXCJDaGFubmVsIE5hbWVcIlxuICAgICAgcmV0dXJuIGRlY29kZUh0bWxFbnRpdGllcyhtZXRhTWF0Y2hbMV0pO1xuICB9XG5cbiAgcmV0dXJuIG51bGw7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0WW91VHViZUdlbnJlRnJvbUh0bWwoaHRtbDogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG4gIC8vIDEuIFRyeSA8bWV0YSBpdGVtcHJvcD1cImdlbnJlXCIgY29udGVudD1cIi4uLlwiPlxuICBjb25zdCBtZXRhR2VucmVSZWdleCA9IC88bWV0YVxccytpdGVtcHJvcD1bXCInXWdlbnJlW1wiJ11cXHMrY29udGVudD1bXCInXShbXlwiJ10rKVtcIiddXFxzKlxcLz8+L2k7XG4gIGNvbnN0IG1ldGFNYXRjaCA9IG1ldGFHZW5yZVJlZ2V4LmV4ZWMoaHRtbCk7XG4gIGlmIChtZXRhTWF0Y2ggJiYgbWV0YU1hdGNoWzFdKSB7XG4gICAgICByZXR1cm4gZGVjb2RlSHRtbEVudGl0aWVzKG1ldGFNYXRjaFsxXSk7XG4gIH1cblxuICAvLyAyLiBUcnkgSlNPTiBcImNhdGVnb3J5XCIgaW4gc2NyaXB0c1xuICAvLyBcImNhdGVnb3J5XCI6XCJHYW1pbmdcIlxuICBjb25zdCBjYXRlZ29yeVJlZ2V4ID0gL1wiY2F0ZWdvcnlcIlxccyo6XFxzKlwiKFteXCJdKylcIi87XG4gIGNvbnN0IGNhdE1hdGNoID0gY2F0ZWdvcnlSZWdleC5leGVjKGh0bWwpO1xuICBpZiAoY2F0TWF0Y2ggJiYgY2F0TWF0Y2hbMV0pIHtcbiAgICAgIHJldHVybiBkZWNvZGVIdG1sRW50aXRpZXMoY2F0TWF0Y2hbMV0pO1xuICB9XG5cbiAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIGRlY29kZUh0bWxFbnRpdGllcyh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBpZiAoIXRleHQpIHJldHVybiB0ZXh0O1xuXG4gIGNvbnN0IGVudGl0aWVzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgICcmYW1wOyc6ICcmJyxcbiAgICAnJmx0Oyc6ICc8JyxcbiAgICAnJmd0Oyc6ICc+JyxcbiAgICAnJnF1b3Q7JzogJ1wiJyxcbiAgICAnJiMzOTsnOiBcIidcIixcbiAgICAnJmFwb3M7JzogXCInXCIsXG4gICAgJyZuYnNwOyc6ICcgJ1xuICB9O1xuXG4gIHJldHVybiB0ZXh0LnJlcGxhY2UoLyYoW2EtejAtOV0rfCNbMC05XXsxLDZ9fCN4WzAtOWEtZkEtRl17MSw2fSk7L2lnLCAobWF0Y2gpID0+IHtcbiAgICAgIGNvbnN0IGxvd2VyID0gbWF0Y2gudG9Mb3dlckNhc2UoKTtcbiAgICAgIGlmIChlbnRpdGllc1tsb3dlcl0pIHJldHVybiBlbnRpdGllc1tsb3dlcl07XG4gICAgICBpZiAoZW50aXRpZXNbbWF0Y2hdKSByZXR1cm4gZW50aXRpZXNbbWF0Y2hdO1xuXG4gICAgICBpZiAobG93ZXIuc3RhcnRzV2l0aCgnJiN4JykpIHtcbiAgICAgICAgICB0cnkgeyByZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZShwYXJzZUludChsb3dlci5zbGljZSgzLCAtMSksIDE2KSk7IH0gY2F0Y2ggeyByZXR1cm4gbWF0Y2g7IH1cbiAgICAgIH1cbiAgICAgIGlmIChsb3dlci5zdGFydHNXaXRoKCcmIycpKSB7XG4gICAgICAgICAgdHJ5IHsgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUocGFyc2VJbnQobG93ZXIuc2xpY2UoMiwgLTEpLCAxMCkpOyB9IGNhdGNoIHsgcmV0dXJuIG1hdGNoOyB9XG4gICAgICB9XG4gICAgICByZXR1cm4gbWF0Y2g7XG4gIH0pO1xufVxuIiwgIlxuZXhwb3J0IGNvbnN0IEdFTkVSQV9SRUdJU1RSWTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgLy8gU2VhcmNoXG4gICdnb29nbGUuY29tJzogJ1NlYXJjaCcsXG4gICdiaW5nLmNvbSc6ICdTZWFyY2gnLFxuICAnZHVja2R1Y2tnby5jb20nOiAnU2VhcmNoJyxcbiAgJ3lhaG9vLmNvbSc6ICdTZWFyY2gnLFxuICAnYmFpZHUuY29tJzogJ1NlYXJjaCcsXG4gICd5YW5kZXguY29tJzogJ1NlYXJjaCcsXG4gICdrYWdpLmNvbSc6ICdTZWFyY2gnLFxuICAnZWNvc2lhLm9yZyc6ICdTZWFyY2gnLFxuXG4gIC8vIFNvY2lhbFxuICAnZmFjZWJvb2suY29tJzogJ1NvY2lhbCcsXG4gICd0d2l0dGVyLmNvbSc6ICdTb2NpYWwnLFxuICAneC5jb20nOiAnU29jaWFsJyxcbiAgJ2luc3RhZ3JhbS5jb20nOiAnU29jaWFsJyxcbiAgJ2xpbmtlZGluLmNvbSc6ICdTb2NpYWwnLFxuICAncmVkZGl0LmNvbSc6ICdTb2NpYWwnLFxuICAndGlrdG9rLmNvbSc6ICdTb2NpYWwnLFxuICAncGludGVyZXN0LmNvbSc6ICdTb2NpYWwnLFxuICAnc25hcGNoYXQuY29tJzogJ1NvY2lhbCcsXG4gICd0dW1ibHIuY29tJzogJ1NvY2lhbCcsXG4gICd0aHJlYWRzLm5ldCc6ICdTb2NpYWwnLFxuICAnYmx1ZXNreS5hcHAnOiAnU29jaWFsJyxcbiAgJ21hc3RvZG9uLnNvY2lhbCc6ICdTb2NpYWwnLFxuXG4gIC8vIFZpZGVvXG4gICd5b3V0dWJlLmNvbSc6ICdWaWRlbycsXG4gICd5b3V0dS5iZSc6ICdWaWRlbycsXG4gICd2aW1lby5jb20nOiAnVmlkZW8nLFxuICAndHdpdGNoLnR2JzogJ1ZpZGVvJyxcbiAgJ25ldGZsaXguY29tJzogJ1ZpZGVvJyxcbiAgJ2h1bHUuY29tJzogJ1ZpZGVvJyxcbiAgJ2Rpc25leXBsdXMuY29tJzogJ1ZpZGVvJyxcbiAgJ2RhaWx5bW90aW9uLmNvbSc6ICdWaWRlbycsXG4gICdwcmltZXZpZGVvLmNvbSc6ICdWaWRlbycsXG4gICdoYm9tYXguY29tJzogJ1ZpZGVvJyxcbiAgJ21heC5jb20nOiAnVmlkZW8nLFxuICAncGVhY29ja3R2LmNvbSc6ICdWaWRlbycsXG5cbiAgLy8gRGV2ZWxvcG1lbnRcbiAgJ2dpdGh1Yi5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnZ2l0bGFiLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdzdGFja292ZXJmbG93LmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICducG1qcy5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAncHlwaS5vcmcnOiAnRGV2ZWxvcG1lbnQnLFxuICAnZGV2ZWxvcGVyLm1vemlsbGEub3JnJzogJ0RldmVsb3BtZW50JyxcbiAgJ3czc2Nob29scy5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnZ2Vla3Nmb3JnZWVrcy5vcmcnOiAnRGV2ZWxvcG1lbnQnLFxuICAnamlyYS5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnYXRsYXNzaWFuLm5ldCc6ICdEZXZlbG9wbWVudCcsIC8vIG9mdGVuIGppcmFcbiAgJ2JpdGJ1Y2tldC5vcmcnOiAnRGV2ZWxvcG1lbnQnLFxuICAnZGV2LnRvJzogJ0RldmVsb3BtZW50JyxcbiAgJ2hhc2hub2RlLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdtZWRpdW0uY29tJzogJ0RldmVsb3BtZW50JywgLy8gR2VuZXJhbCBidXQgb2Z0ZW4gZGV2XG4gICd2ZXJjZWwuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ25ldGxpZnkuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2hlcm9rdS5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnYXdzLmFtYXpvbi5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnY29uc29sZS5hd3MuYW1hem9uLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdjbG91ZC5nb29nbGUuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2F6dXJlLm1pY3Jvc29mdC5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAncG9ydGFsLmF6dXJlLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdkb2NrZXIuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2t1YmVybmV0ZXMuaW8nOiAnRGV2ZWxvcG1lbnQnLFxuXG4gIC8vIE5ld3NcbiAgJ2Nubi5jb20nOiAnTmV3cycsXG4gICdiYmMuY29tJzogJ05ld3MnLFxuICAnbnl0aW1lcy5jb20nOiAnTmV3cycsXG4gICd3YXNoaW5ndG9ucG9zdC5jb20nOiAnTmV3cycsXG4gICd0aGVndWFyZGlhbi5jb20nOiAnTmV3cycsXG4gICdmb3JiZXMuY29tJzogJ05ld3MnLFxuICAnYmxvb21iZXJnLmNvbSc6ICdOZXdzJyxcbiAgJ3JldXRlcnMuY29tJzogJ05ld3MnLFxuICAnd3NqLmNvbSc6ICdOZXdzJyxcbiAgJ2NuYmMuY29tJzogJ05ld3MnLFxuICAnaHVmZnBvc3QuY29tJzogJ05ld3MnLFxuICAnbmV3cy5nb29nbGUuY29tJzogJ05ld3MnLFxuICAnZm94bmV3cy5jb20nOiAnTmV3cycsXG4gICduYmNuZXdzLmNvbSc6ICdOZXdzJyxcbiAgJ2FiY25ld3MuZ28uY29tJzogJ05ld3MnLFxuICAndXNhdG9kYXkuY29tJzogJ05ld3MnLFxuXG4gIC8vIFNob3BwaW5nXG4gICdhbWF6b24uY29tJzogJ1Nob3BwaW5nJyxcbiAgJ2ViYXkuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ3dhbG1hcnQuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ2V0c3kuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ3RhcmdldC5jb20nOiAnU2hvcHBpbmcnLFxuICAnYmVzdGJ1eS5jb20nOiAnU2hvcHBpbmcnLFxuICAnYWxpZXhwcmVzcy5jb20nOiAnU2hvcHBpbmcnLFxuICAnc2hvcGlmeS5jb20nOiAnU2hvcHBpbmcnLFxuICAndGVtdS5jb20nOiAnU2hvcHBpbmcnLFxuICAnc2hlaW4uY29tJzogJ1Nob3BwaW5nJyxcbiAgJ3dheWZhaXIuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ2Nvc3Rjby5jb20nOiAnU2hvcHBpbmcnLFxuXG4gIC8vIENvbW11bmljYXRpb25cbiAgJ21haWwuZ29vZ2xlLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ291dGxvb2subGl2ZS5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICdzbGFjay5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICdkaXNjb3JkLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ3pvb20udXMnOiAnQ29tbXVuaWNhdGlvbicsXG4gICd0ZWFtcy5taWNyb3NvZnQuY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnd2hhdHNhcHAuY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAndGVsZWdyYW0ub3JnJzogJ0NvbW11bmljYXRpb24nLFxuICAnbWVzc2VuZ2VyLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ3NreXBlLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcblxuICAvLyBGaW5hbmNlXG4gICdwYXlwYWwuY29tJzogJ0ZpbmFuY2UnLFxuICAnY2hhc2UuY29tJzogJ0ZpbmFuY2UnLFxuICAnYmFua29mYW1lcmljYS5jb20nOiAnRmluYW5jZScsXG4gICd3ZWxsc2ZhcmdvLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2FtZXJpY2FuZXhwcmVzcy5jb20nOiAnRmluYW5jZScsXG4gICdzdHJpcGUuY29tJzogJ0ZpbmFuY2UnLFxuICAnY29pbmJhc2UuY29tJzogJ0ZpbmFuY2UnLFxuICAnYmluYW5jZS5jb20nOiAnRmluYW5jZScsXG4gICdrcmFrZW4uY29tJzogJ0ZpbmFuY2UnLFxuICAncm9iaW5ob29kLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2ZpZGVsaXR5LmNvbSc6ICdGaW5hbmNlJyxcbiAgJ3Zhbmd1YXJkLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ3NjaHdhYi5jb20nOiAnRmluYW5jZScsXG4gICdtaW50LmludHVpdC5jb20nOiAnRmluYW5jZScsXG5cbiAgLy8gRWR1Y2F0aW9uXG4gICd3aWtpcGVkaWEub3JnJzogJ0VkdWNhdGlvbicsXG4gICdjb3Vyc2VyYS5vcmcnOiAnRWR1Y2F0aW9uJyxcbiAgJ3VkZW15LmNvbSc6ICdFZHVjYXRpb24nLFxuICAnZWR4Lm9yZyc6ICdFZHVjYXRpb24nLFxuICAna2hhbmFjYWRlbXkub3JnJzogJ0VkdWNhdGlvbicsXG4gICdxdWl6bGV0LmNvbSc6ICdFZHVjYXRpb24nLFxuICAnZHVvbGluZ28uY29tJzogJ0VkdWNhdGlvbicsXG4gICdjYW52YXMuaW5zdHJ1Y3R1cmUuY29tJzogJ0VkdWNhdGlvbicsXG4gICdibGFja2JvYXJkLmNvbSc6ICdFZHVjYXRpb24nLFxuICAnbWl0LmVkdSc6ICdFZHVjYXRpb24nLFxuICAnaGFydmFyZC5lZHUnOiAnRWR1Y2F0aW9uJyxcbiAgJ3N0YW5mb3JkLmVkdSc6ICdFZHVjYXRpb24nLFxuICAnYWNhZGVtaWEuZWR1JzogJ0VkdWNhdGlvbicsXG4gICdyZXNlYXJjaGdhdGUubmV0JzogJ0VkdWNhdGlvbicsXG5cbiAgLy8gRGVzaWduXG4gICdmaWdtYS5jb20nOiAnRGVzaWduJyxcbiAgJ2NhbnZhLmNvbSc6ICdEZXNpZ24nLFxuICAnYmVoYW5jZS5uZXQnOiAnRGVzaWduJyxcbiAgJ2RyaWJiYmxlLmNvbSc6ICdEZXNpZ24nLFxuICAnYWRvYmUuY29tJzogJ0Rlc2lnbicsXG4gICd1bnNwbGFzaC5jb20nOiAnRGVzaWduJyxcbiAgJ3BleGVscy5jb20nOiAnRGVzaWduJyxcbiAgJ3BpeGFiYXkuY29tJzogJ0Rlc2lnbicsXG4gICdzaHV0dGVyc3RvY2suY29tJzogJ0Rlc2lnbicsXG5cbiAgLy8gUHJvZHVjdGl2aXR5XG4gICdkb2NzLmdvb2dsZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ3NoZWV0cy5nb29nbGUuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdzbGlkZXMuZ29vZ2xlLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnZHJpdmUuZ29vZ2xlLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnbm90aW9uLnNvJzogJ1Byb2R1Y3Rpdml0eScsXG4gICd0cmVsbG8uY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdhc2FuYS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ21vbmRheS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2FpcnRhYmxlLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnZXZlcm5vdGUuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdkcm9wYm94LmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnY2xpY2t1cC5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2xpbmVhci5hcHAnOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ21pcm8uY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdsdWNpZGNoYXJ0LmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuXG4gIC8vIEFJXG4gICdvcGVuYWkuY29tJzogJ0FJJyxcbiAgJ2NoYXRncHQuY29tJzogJ0FJJyxcbiAgJ2FudGhyb3BpYy5jb20nOiAnQUknLFxuICAnbWlkam91cm5leS5jb20nOiAnQUknLFxuICAnaHVnZ2luZ2ZhY2UuY28nOiAnQUknLFxuICAnYmFyZC5nb29nbGUuY29tJzogJ0FJJyxcbiAgJ2dlbWluaS5nb29nbGUuY29tJzogJ0FJJyxcbiAgJ2NsYXVkZS5haSc6ICdBSScsXG4gICdwZXJwbGV4aXR5LmFpJzogJ0FJJyxcbiAgJ3BvZS5jb20nOiAnQUknLFxuXG4gIC8vIE11c2ljL0F1ZGlvXG4gICdzcG90aWZ5LmNvbSc6ICdNdXNpYycsXG4gICdzb3VuZGNsb3VkLmNvbSc6ICdNdXNpYycsXG4gICdtdXNpYy5hcHBsZS5jb20nOiAnTXVzaWMnLFxuICAncGFuZG9yYS5jb20nOiAnTXVzaWMnLFxuICAndGlkYWwuY29tJzogJ011c2ljJyxcbiAgJ2JhbmRjYW1wLmNvbSc6ICdNdXNpYycsXG4gICdhdWRpYmxlLmNvbSc6ICdNdXNpYycsXG5cbiAgLy8gR2FtaW5nXG4gICdzdGVhbXBvd2VyZWQuY29tJzogJ0dhbWluZycsXG4gICdyb2Jsb3guY29tJzogJ0dhbWluZycsXG4gICdlcGljZ2FtZXMuY29tJzogJ0dhbWluZycsXG4gICd4Ym94LmNvbSc6ICdHYW1pbmcnLFxuICAncGxheXN0YXRpb24uY29tJzogJ0dhbWluZycsXG4gICduaW50ZW5kby5jb20nOiAnR2FtaW5nJyxcbiAgJ2lnbi5jb20nOiAnR2FtaW5nJyxcbiAgJ2dhbWVzcG90LmNvbSc6ICdHYW1pbmcnLFxuICAna290YWt1LmNvbSc6ICdHYW1pbmcnLFxuICAncG9seWdvbi5jb20nOiAnR2FtaW5nJ1xufTtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldEdlbmVyYShob3N0bmFtZTogc3RyaW5nLCBjdXN0b21SZWdpc3RyeT86IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pOiBzdHJpbmcgfCBudWxsIHtcbiAgaWYgKCFob3N0bmFtZSkgcmV0dXJuIG51bGw7XG5cbiAgLy8gMC4gQ2hlY2sgY3VzdG9tIHJlZ2lzdHJ5IGZpcnN0XG4gIGlmIChjdXN0b21SZWdpc3RyeSkge1xuICAgICAgY29uc3QgcGFydHMgPSBob3N0bmFtZS5zcGxpdCgnLicpO1xuICAgICAgLy8gQ2hlY2sgZnVsbCBob3N0bmFtZSBhbmQgcHJvZ3Jlc3NpdmVseSBzaG9ydGVyIHN1ZmZpeGVzXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHBhcnRzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgICAgIGNvbnN0IGRvbWFpbiA9IHBhcnRzLnNsaWNlKGkpLmpvaW4oJy4nKTtcbiAgICAgICAgICBpZiAoY3VzdG9tUmVnaXN0cnlbZG9tYWluXSkge1xuICAgICAgICAgICAgICByZXR1cm4gY3VzdG9tUmVnaXN0cnlbZG9tYWluXTtcbiAgICAgICAgICB9XG4gICAgICB9XG4gIH1cblxuICAvLyAxLiBFeGFjdCBtYXRjaFxuICBpZiAoR0VORVJBX1JFR0lTVFJZW2hvc3RuYW1lXSkge1xuICAgIHJldHVybiBHRU5FUkFfUkVHSVNUUllbaG9zdG5hbWVdO1xuICB9XG5cbiAgLy8gMi4gU3ViZG9tYWluIGNoZWNrIChzdHJpcHBpbmcgc3ViZG9tYWlucylcbiAgLy8gZS5nLiBcImNvbnNvbGUuYXdzLmFtYXpvbi5jb21cIiAtPiBcImF3cy5hbWF6b24uY29tXCIgLT4gXCJhbWF6b24uY29tXCJcbiAgY29uc3QgcGFydHMgPSBob3N0bmFtZS5zcGxpdCgnLicpO1xuXG4gIC8vIFRyeSBtYXRjaGluZyBwcm9ncmVzc2l2ZWx5IHNob3J0ZXIgc3VmZml4ZXNcbiAgLy8gZS5nLiBhLmIuYy5jb20gLT4gYi5jLmNvbSAtPiBjLmNvbVxuICBmb3IgKGxldCBpID0gMDsgaSA8IHBhcnRzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgY29uc3QgZG9tYWluID0gcGFydHMuc2xpY2UoaSkuam9pbignLicpO1xuICAgICAgaWYgKEdFTkVSQV9SRUdJU1RSWVtkb21haW5dKSB7XG4gICAgICAgICAgcmV0dXJuIEdFTkVSQV9SRUdJU1RSWVtkb21haW5dO1xuICAgICAgfVxuICB9XG5cbiAgcmV0dXJuIG51bGw7XG59XG4iLCAiZXhwb3J0IGNvbnN0IGdldFN0b3JlZFZhbHVlID0gYXN5bmMgPFQ+KGtleTogc3RyaW5nKTogUHJvbWlzZTxUIHwgbnVsbD4gPT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoa2V5LCAoaXRlbXMpID0+IHtcbiAgICAgIHJlc29sdmUoKGl0ZW1zW2tleV0gYXMgVCkgPz8gbnVsbCk7XG4gICAgfSk7XG4gIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IHNldFN0b3JlZFZhbHVlID0gYXN5bmMgPFQ+KGtleTogc3RyaW5nLCB2YWx1ZTogVCk6IFByb21pc2U8dm9pZD4gPT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBba2V5XTogdmFsdWUgfSwgKCkgPT4gcmVzb2x2ZSgpKTtcbiAgfSk7XG59O1xuIiwgImltcG9ydCB7IEN1c3RvbVN0cmF0ZWd5LCBQcmVmZXJlbmNlcywgU29ydGluZ1N0cmF0ZWd5IH0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgZ2V0U3RvcmVkVmFsdWUsIHNldFN0b3JlZFZhbHVlIH0gZnJvbSBcIi4vc3RvcmFnZS5qc1wiO1xuaW1wb3J0IHsgc2V0TG9nZ2VyUHJlZmVyZW5jZXMsIGxvZ0RlYnVnIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tIFwiLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5cbmNvbnN0IFBSRUZFUkVOQ0VTX0tFWSA9IFwicHJlZmVyZW5jZXNcIjtcblxuZXhwb3J0IGNvbnN0IGRlZmF1bHRQcmVmZXJlbmNlczogUHJlZmVyZW5jZXMgPSB7XG4gIHNvcnRpbmc6IFtcInBpbm5lZFwiLCBcInJlY2VuY3lcIl0sXG4gIGRlYnVnOiBmYWxzZSxcbiAgbG9nTGV2ZWw6IFwiaW5mb1wiLFxuICB0aGVtZTogXCJkYXJrXCIsXG4gIGN1c3RvbUdlbmVyYToge31cbn07XG5cbmNvbnN0IG5vcm1hbGl6ZVNvcnRpbmcgPSAoc29ydGluZzogdW5rbm93bik6IFNvcnRpbmdTdHJhdGVneVtdID0+IHtcbiAgaWYgKEFycmF5LmlzQXJyYXkoc29ydGluZykpIHtcbiAgICByZXR1cm4gc29ydGluZy5maWx0ZXIoKHZhbHVlKTogdmFsdWUgaXMgU29ydGluZ1N0cmF0ZWd5ID0+IHR5cGVvZiB2YWx1ZSA9PT0gXCJzdHJpbmdcIik7XG4gIH1cbiAgaWYgKHR5cGVvZiBzb3J0aW5nID09PSBcInN0cmluZ1wiKSB7XG4gICAgcmV0dXJuIFtzb3J0aW5nXTtcbiAgfVxuICByZXR1cm4gWy4uLmRlZmF1bHRQcmVmZXJlbmNlcy5zb3J0aW5nXTtcbn07XG5cbmNvbnN0IG5vcm1hbGl6ZVN0cmF0ZWdpZXMgPSAoc3RyYXRlZ2llczogdW5rbm93bik6IEN1c3RvbVN0cmF0ZWd5W10gPT4ge1xuICAgIGNvbnN0IGFyciA9IGFzQXJyYXk8YW55PihzdHJhdGVnaWVzKS5maWx0ZXIocyA9PiB0eXBlb2YgcyA9PT0gJ29iamVjdCcgJiYgcyAhPT0gbnVsbCk7XG4gICAgcmV0dXJuIGFyci5tYXAocyA9PiAoe1xuICAgICAgICAuLi5zLFxuICAgICAgICBncm91cGluZ1J1bGVzOiBhc0FycmF5KHMuZ3JvdXBpbmdSdWxlcyksXG4gICAgICAgIHNvcnRpbmdSdWxlczogYXNBcnJheShzLnNvcnRpbmdSdWxlcyksXG4gICAgICAgIGdyb3VwU29ydGluZ1J1bGVzOiBzLmdyb3VwU29ydGluZ1J1bGVzID8gYXNBcnJheShzLmdyb3VwU29ydGluZ1J1bGVzKSA6IHVuZGVmaW5lZCxcbiAgICAgICAgZmlsdGVyczogcy5maWx0ZXJzID8gYXNBcnJheShzLmZpbHRlcnMpIDogdW5kZWZpbmVkLFxuICAgICAgICBmaWx0ZXJHcm91cHM6IHMuZmlsdGVyR3JvdXBzID8gYXNBcnJheShzLmZpbHRlckdyb3VwcykubWFwKChnOiBhbnkpID0+IGFzQXJyYXkoZykpIDogdW5kZWZpbmVkLFxuICAgICAgICBydWxlczogcy5ydWxlcyA/IGFzQXJyYXkocy5ydWxlcykgOiB1bmRlZmluZWRcbiAgICB9KSk7XG59O1xuXG5jb25zdCBub3JtYWxpemVQcmVmZXJlbmNlcyA9IChwcmVmcz86IFBhcnRpYWw8UHJlZmVyZW5jZXM+IHwgbnVsbCk6IFByZWZlcmVuY2VzID0+IHtcbiAgY29uc3QgbWVyZ2VkID0geyAuLi5kZWZhdWx0UHJlZmVyZW5jZXMsIC4uLihwcmVmcyA/PyB7fSkgfTtcbiAgcmV0dXJuIHtcbiAgICAuLi5tZXJnZWQsXG4gICAgc29ydGluZzogbm9ybWFsaXplU29ydGluZyhtZXJnZWQuc29ydGluZyksXG4gICAgY3VzdG9tU3RyYXRlZ2llczogbm9ybWFsaXplU3RyYXRlZ2llcyhtZXJnZWQuY3VzdG9tU3RyYXRlZ2llcylcbiAgfTtcbn07XG5cbmV4cG9ydCBjb25zdCBsb2FkUHJlZmVyZW5jZXMgPSBhc3luYyAoKTogUHJvbWlzZTxQcmVmZXJlbmNlcz4gPT4ge1xuICBjb25zdCBzdG9yZWQgPSBhd2FpdCBnZXRTdG9yZWRWYWx1ZTxQcmVmZXJlbmNlcz4oUFJFRkVSRU5DRVNfS0VZKTtcbiAgY29uc3QgbWVyZ2VkID0gbm9ybWFsaXplUHJlZmVyZW5jZXMoc3RvcmVkID8/IHVuZGVmaW5lZCk7XG4gIHNldExvZ2dlclByZWZlcmVuY2VzKG1lcmdlZCk7XG4gIHJldHVybiBtZXJnZWQ7XG59O1xuXG5leHBvcnQgY29uc3Qgc2F2ZVByZWZlcmVuY2VzID0gYXN5bmMgKHByZWZzOiBQYXJ0aWFsPFByZWZlcmVuY2VzPik6IFByb21pc2U8UHJlZmVyZW5jZXM+ID0+IHtcbiAgbG9nRGVidWcoXCJVcGRhdGluZyBwcmVmZXJlbmNlc1wiLCB7IGtleXM6IE9iamVjdC5rZXlzKHByZWZzKSB9KTtcbiAgY29uc3QgY3VycmVudCA9IGF3YWl0IGxvYWRQcmVmZXJlbmNlcygpO1xuICBjb25zdCBtZXJnZWQgPSBub3JtYWxpemVQcmVmZXJlbmNlcyh7IC4uLmN1cnJlbnQsIC4uLnByZWZzIH0pO1xuICBhd2FpdCBzZXRTdG9yZWRWYWx1ZShQUkVGRVJFTkNFU19LRVksIG1lcmdlZCk7XG4gIHNldExvZ2dlclByZWZlcmVuY2VzKG1lcmdlZCk7XG4gIHJldHVybiBtZXJnZWQ7XG59O1xuIiwgImltcG9ydCB7IFBhZ2VDb250ZXh0LCBUYWJNZXRhZGF0YSB9IGZyb20gXCIuLi8uLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IG5vcm1hbGl6ZVVybCwgcGFyc2VZb3VUdWJlVXJsLCBleHRyYWN0WW91VHViZUNoYW5uZWxGcm9tSHRtbCwgZXh0cmFjdFlvdVR1YmVHZW5yZUZyb21IdG1sIH0gZnJvbSBcIi4vbG9naWMuanNcIjtcbmltcG9ydCB7IGdldEdlbmVyYSB9IGZyb20gXCIuL2dlbmVyYVJlZ2lzdHJ5LmpzXCI7XG5pbXBvcnQgeyBsb2dEZWJ1ZyB9IGZyb20gXCIuLi8uLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBsb2FkUHJlZmVyZW5jZXMgfSBmcm9tIFwiLi4vcHJlZmVyZW5jZXMuanNcIjtcblxuaW50ZXJmYWNlIEV4dHJhY3Rpb25SZXNwb25zZSB7XG4gIGRhdGE6IFBhZ2VDb250ZXh0IHwgbnVsbDtcbiAgZXJyb3I/OiBzdHJpbmc7XG4gIHN0YXR1czpcbiAgICB8ICdPSydcbiAgICB8ICdSRVNUUklDVEVEJ1xuICAgIHwgJ0lOSkVDVElPTl9GQUlMRUQnXG4gICAgfCAnTk9fUkVTUE9OU0UnXG4gICAgfCAnTk9fSE9TVF9QRVJNSVNTSU9OJ1xuICAgIHwgJ0ZSQU1FX0FDQ0VTU19ERU5JRUQnO1xufVxuXG4vLyBTaW1wbGUgY29uY3VycmVuY3kgY29udHJvbFxubGV0IGFjdGl2ZUZldGNoZXMgPSAwO1xuY29uc3QgTUFYX0NPTkNVUlJFTlRfRkVUQ0hFUyA9IDU7IC8vIENvbnNlcnZhdGl2ZSBsaW1pdCB0byBhdm9pZCByYXRlIGxpbWl0aW5nXG5jb25zdCBGRVRDSF9RVUVVRTogKCgpID0+IHZvaWQpW10gPSBbXTtcblxuY29uc3QgZmV0Y2hXaXRoVGltZW91dCA9IGFzeW5jICh1cmw6IHN0cmluZywgdGltZW91dCA9IDIwMDApOiBQcm9taXNlPFJlc3BvbnNlPiA9PiB7XG4gICAgY29uc3QgY29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgICBjb25zdCBpZCA9IHNldFRpbWVvdXQoKCkgPT4gY29udHJvbGxlci5hYm9ydCgpLCB0aW1lb3V0KTtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHVybCwgeyBzaWduYWw6IGNvbnRyb2xsZXIuc2lnbmFsIH0pO1xuICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KGlkKTtcbiAgICB9XG59O1xuXG5jb25zdCBlbnF1ZXVlRmV0Y2ggPSBhc3luYyA8VD4oZm46ICgpID0+IFByb21pc2U8VD4pOiBQcm9taXNlPFQ+ID0+IHtcbiAgICBpZiAoYWN0aXZlRmV0Y2hlcyA+PSBNQVhfQ09OQ1VSUkVOVF9GRVRDSEVTKSB7XG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gRkVUQ0hfUVVFVUUucHVzaChyZXNvbHZlKSk7XG4gICAgfVxuICAgIGFjdGl2ZUZldGNoZXMrKztcbiAgICB0cnkge1xuICAgICAgICByZXR1cm4gYXdhaXQgZm4oKTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgICBhY3RpdmVGZXRjaGVzLS07XG4gICAgICAgIGlmIChGRVRDSF9RVUVVRS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb25zdCBuZXh0ID0gRkVUQ0hfUVVFVUUuc2hpZnQoKTtcbiAgICAgICAgICAgIGlmIChuZXh0KSBuZXh0KCk7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5leHBvcnQgY29uc3QgZXh0cmFjdFBhZ2VDb250ZXh0ID0gYXN5bmMgKHRhYjogVGFiTWV0YWRhdGEgfCBjaHJvbWUudGFicy5UYWIpOiBQcm9taXNlPEV4dHJhY3Rpb25SZXNwb25zZT4gPT4ge1xuICB0cnkge1xuICAgIGlmICghdGFiIHx8ICF0YWIudXJsKSB7XG4gICAgICAgIHJldHVybiB7IGRhdGE6IG51bGwsIGVycm9yOiBcIlRhYiBub3QgZm91bmQgb3Igbm8gVVJMXCIsIHN0YXR1czogJ05PX1JFU1BPTlNFJyB9O1xuICAgIH1cblxuICAgIGlmIChcbiAgICAgIHRhYi51cmwuc3RhcnRzV2l0aCgnY2hyb21lOi8vJykgfHxcbiAgICAgIHRhYi51cmwuc3RhcnRzV2l0aCgnZWRnZTovLycpIHx8XG4gICAgICB0YWIudXJsLnN0YXJ0c1dpdGgoJ2Fib3V0OicpIHx8XG4gICAgICB0YWIudXJsLnN0YXJ0c1dpdGgoJ2Nocm9tZS1leHRlbnNpb246Ly8nKSB8fFxuICAgICAgdGFiLnVybC5zdGFydHNXaXRoKCdjaHJvbWUtZXJyb3I6Ly8nKVxuICAgICkge1xuICAgICAgICByZXR1cm4geyBkYXRhOiBudWxsLCBlcnJvcjogXCJSZXN0cmljdGVkIFVSTCBzY2hlbWVcIiwgc3RhdHVzOiAnUkVTVFJJQ1RFRCcgfTtcbiAgICB9XG5cbiAgICBjb25zdCBwcmVmcyA9IGF3YWl0IGxvYWRQcmVmZXJlbmNlcygpO1xuICAgIGxldCBiYXNlbGluZSA9IGJ1aWxkQmFzZWxpbmVDb250ZXh0KHRhYiBhcyBjaHJvbWUudGFicy5UYWIsIHByZWZzLmN1c3RvbUdlbmVyYSk7XG5cbiAgICAvLyBGZXRjaCBhbmQgZW5yaWNoIGZvciBZb3VUdWJlIGlmIGF1dGhvciBpcyBtaXNzaW5nIGFuZCBpdCBpcyBhIHZpZGVvXG4gICAgY29uc3QgdGFyZ2V0VXJsID0gdGFiLnVybDtcbiAgICBjb25zdCB1cmxPYmogPSBuZXcgVVJMKHRhcmdldFVybCk7XG4gICAgY29uc3QgaG9zdG5hbWUgPSB1cmxPYmouaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sICcnKTtcbiAgICBpZiAoKGhvc3RuYW1lLmVuZHNXaXRoKCd5b3V0dWJlLmNvbScpIHx8IGhvc3RuYW1lLmVuZHNXaXRoKCd5b3V0dS5iZScpKSAmJiAoIWJhc2VsaW5lLmF1dGhvck9yQ3JlYXRvciB8fCBiYXNlbGluZS5nZW5yZSA9PT0gJ1ZpZGVvJykpIHtcbiAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgLy8gV2UgdXNlIGEgcXVldWUgdG8gcHJldmVudCBmbG9vZGluZyByZXF1ZXN0c1xuICAgICAgICAgICAgIGF3YWl0IGVucXVldWVGZXRjaChhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2hXaXRoVGltZW91dCh0YXJnZXRVcmwpO1xuICAgICAgICAgICAgICAgICBpZiAocmVzcG9uc2Uub2spIHtcbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGh0bWwgPSBhd2FpdCByZXNwb25zZS50ZXh0KCk7XG4gICAgICAgICAgICAgICAgICAgICBjb25zdCBjaGFubmVsID0gZXh0cmFjdFlvdVR1YmVDaGFubmVsRnJvbUh0bWwoaHRtbCk7XG4gICAgICAgICAgICAgICAgICAgICBpZiAoY2hhbm5lbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgIGJhc2VsaW5lLmF1dGhvck9yQ3JlYXRvciA9IGNoYW5uZWw7XG4gICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICBjb25zdCBnZW5yZSA9IGV4dHJhY3RZb3VUdWJlR2VucmVGcm9tSHRtbChodG1sKTtcbiAgICAgICAgICAgICAgICAgICAgIGlmIChnZW5yZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgIGJhc2VsaW5lLmdlbnJlID0gZ2VucmU7XG4gICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9KTtcbiAgICAgICAgIH0gY2F0Y2ggKGZldGNoRXJyKSB7XG4gICAgICAgICAgICAgbG9nRGVidWcoXCJGYWlsZWQgdG8gZmV0Y2ggWW91VHViZSBwYWdlIGNvbnRlbnRcIiwgeyBlcnJvcjogU3RyaW5nKGZldGNoRXJyKSB9KTtcbiAgICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgZGF0YTogYmFzZWxpbmUsXG4gICAgICBzdGF0dXM6ICdPSydcbiAgICB9O1xuXG4gIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgIGxvZ0RlYnVnKGBFeHRyYWN0aW9uIGZhaWxlZCBmb3IgdGFiICR7dGFiLmlkfWAsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICByZXR1cm4ge1xuICAgICAgZGF0YTogbnVsbCxcbiAgICAgIGVycm9yOiBTdHJpbmcoZSksXG4gICAgICBzdGF0dXM6ICdJTkpFQ1RJT05fRkFJTEVEJ1xuICAgIH07XG4gIH1cbn07XG5cbmNvbnN0IGJ1aWxkQmFzZWxpbmVDb250ZXh0ID0gKHRhYjogY2hyb21lLnRhYnMuVGFiLCBjdXN0b21HZW5lcmE/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogUGFnZUNvbnRleHQgPT4ge1xuICBjb25zdCB1cmwgPSB0YWIudXJsIHx8IFwiXCI7XG4gIGxldCBob3N0bmFtZSA9IFwiXCI7XG4gIHRyeSB7XG4gICAgaG9zdG5hbWUgPSBuZXcgVVJMKHVybCkuaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sICcnKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGhvc3RuYW1lID0gXCJcIjtcbiAgfVxuXG4gIC8vIERldGVybWluZSBPYmplY3QgVHlwZSBmaXJzdFxuICBsZXQgb2JqZWN0VHlwZTogUGFnZUNvbnRleHRbJ29iamVjdFR5cGUnXSA9ICd1bmtub3duJztcbiAgbGV0IGF1dGhvck9yQ3JlYXRvcjogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cbiAgaWYgKHVybC5pbmNsdWRlcygnL2xvZ2luJykgfHwgdXJsLmluY2x1ZGVzKCcvc2lnbmluJykpIHtcbiAgICAgIG9iamVjdFR5cGUgPSAnbG9naW4nO1xuICB9IGVsc2UgaWYgKGhvc3RuYW1lLmluY2x1ZGVzKCd5b3V0dWJlLmNvbScpIHx8IGhvc3RuYW1lLmluY2x1ZGVzKCd5b3V0dS5iZScpKSB7XG4gICAgICBjb25zdCB7IHZpZGVvSWQgfSA9IHBhcnNlWW91VHViZVVybCh1cmwpO1xuICAgICAgaWYgKHZpZGVvSWQpIG9iamVjdFR5cGUgPSAndmlkZW8nO1xuXG4gICAgICAvLyBUcnkgdG8gZ3Vlc3MgY2hhbm5lbCBmcm9tIFVSTCBpZiBwb3NzaWJsZVxuICAgICAgaWYgKHVybC5pbmNsdWRlcygnL0AnKSkge1xuICAgICAgICAgIGNvbnN0IHBhcnRzID0gdXJsLnNwbGl0KCcvQCcpO1xuICAgICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGhhbmRsZSA9IHBhcnRzWzFdLnNwbGl0KCcvJylbMF07XG4gICAgICAgICAgICAgIGF1dGhvck9yQ3JlYXRvciA9ICdAJyArIGhhbmRsZTtcbiAgICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHVybC5pbmNsdWRlcygnL2MvJykpIHtcbiAgICAgICAgICBjb25zdCBwYXJ0cyA9IHVybC5zcGxpdCgnL2MvJyk7XG4gICAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgYXV0aG9yT3JDcmVhdG9yID0gZGVjb2RlVVJJQ29tcG9uZW50KHBhcnRzWzFdLnNwbGl0KCcvJylbMF0pO1xuICAgICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodXJsLmluY2x1ZGVzKCcvdXNlci8nKSkge1xuICAgICAgICAgIGNvbnN0IHBhcnRzID0gdXJsLnNwbGl0KCcvdXNlci8nKTtcbiAgICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICBhdXRob3JPckNyZWF0b3IgPSBkZWNvZGVVUklDb21wb25lbnQocGFydHNbMV0uc3BsaXQoJy8nKVswXSk7XG4gICAgICAgICAgfVxuICAgICAgfVxuICB9IGVsc2UgaWYgKGhvc3RuYW1lID09PSAnZ2l0aHViLmNvbScgJiYgdXJsLmluY2x1ZGVzKCcvcHVsbC8nKSkge1xuICAgICAgb2JqZWN0VHlwZSA9ICd0aWNrZXQnO1xuICB9IGVsc2UgaWYgKGhvc3RuYW1lID09PSAnZ2l0aHViLmNvbScgJiYgIXVybC5pbmNsdWRlcygnL3B1bGwvJykgJiYgdXJsLnNwbGl0KCcvJykubGVuZ3RoID49IDUpIHtcbiAgICAgIC8vIHJvdWdoIGNoZWNrIGZvciByZXBvXG4gICAgICBvYmplY3RUeXBlID0gJ3JlcG8nO1xuICB9XG5cbiAgLy8gRGV0ZXJtaW5lIEdlbnJlXG4gIC8vIFByaW9yaXR5IDE6IFNpdGUtc3BlY2lmaWMgZXh0cmFjdGlvbiAoZGVyaXZlZCBmcm9tIG9iamVjdFR5cGUpXG4gIGxldCBnZW5yZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG4gIGlmIChvYmplY3RUeXBlID09PSAndmlkZW8nKSBnZW5yZSA9ICdWaWRlbyc7XG4gIGVsc2UgaWYgKG9iamVjdFR5cGUgPT09ICdyZXBvJyB8fCBvYmplY3RUeXBlID09PSAndGlja2V0JykgZ2VucmUgPSAnRGV2ZWxvcG1lbnQnO1xuXG4gIC8vIFByaW9yaXR5IDI6IEZhbGxiYWNrIHRvIFJlZ2lzdHJ5XG4gIGlmICghZ2VucmUpIHtcbiAgICAgZ2VucmUgPSBnZXRHZW5lcmEoaG9zdG5hbWUsIGN1c3RvbUdlbmVyYSkgfHwgdW5kZWZpbmVkO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjYW5vbmljYWxVcmw6IHVybCB8fCBudWxsLFxuICAgIG5vcm1hbGl6ZWRVcmw6IG5vcm1hbGl6ZVVybCh1cmwpLFxuICAgIHNpdGVOYW1lOiBob3N0bmFtZSB8fCBudWxsLFxuICAgIHBsYXRmb3JtOiBob3N0bmFtZSB8fCBudWxsLFxuICAgIG9iamVjdFR5cGUsXG4gICAgb2JqZWN0SWQ6IHVybCB8fCBudWxsLFxuICAgIHRpdGxlOiB0YWIudGl0bGUgfHwgbnVsbCxcbiAgICBnZW5yZSxcbiAgICBkZXNjcmlwdGlvbjogbnVsbCxcbiAgICBhdXRob3JPckNyZWF0b3I6IGF1dGhvck9yQ3JlYXRvcixcbiAgICBwdWJsaXNoZWRBdDogbnVsbCxcbiAgICBtb2RpZmllZEF0OiBudWxsLFxuICAgIGxhbmd1YWdlOiBudWxsLFxuICAgIHRhZ3M6IFtdLFxuICAgIGJyZWFkY3J1bWJzOiBbXSxcbiAgICBpc0F1ZGlibGU6IGZhbHNlLFxuICAgIGlzTXV0ZWQ6IGZhbHNlLFxuICAgIGlzQ2FwdHVyaW5nOiBmYWxzZSxcbiAgICBwcm9ncmVzczogbnVsbCxcbiAgICBoYXNVbnNhdmVkQ2hhbmdlc0xpa2VseTogZmFsc2UsXG4gICAgaXNBdXRoZW50aWNhdGVkTGlrZWx5OiBmYWxzZSxcbiAgICBzb3VyY2VzOiB7XG4gICAgICBjYW5vbmljYWxVcmw6ICd1cmwnLFxuICAgICAgbm9ybWFsaXplZFVybDogJ3VybCcsXG4gICAgICBzaXRlTmFtZTogJ3VybCcsXG4gICAgICBwbGF0Zm9ybTogJ3VybCcsXG4gICAgICBvYmplY3RUeXBlOiAndXJsJyxcbiAgICAgIHRpdGxlOiB0YWIudGl0bGUgPyAndGFiJyA6ICd1cmwnLFxuICAgICAgZ2VucmU6ICdyZWdpc3RyeSdcbiAgICB9LFxuICAgIGNvbmZpZGVuY2U6IHt9XG4gIH07XG59O1xuIiwgImltcG9ydCB7IFRhYk1ldGFkYXRhLCBQYWdlQ29udGV4dCB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnLCBsb2dFcnJvciB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBleHRyYWN0UGFnZUNvbnRleHQgfSBmcm9tIFwiLi9leHRyYWN0aW9uL2luZGV4LmpzXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29udGV4dFJlc3VsdCB7XG4gIGNvbnRleHQ6IHN0cmluZztcbiAgc291cmNlOiAnQUknIHwgJ0hldXJpc3RpYycgfCAnRXh0cmFjdGlvbic7XG4gIGRhdGE/OiBQYWdlQ29udGV4dDtcbiAgZXJyb3I/OiBzdHJpbmc7XG4gIHN0YXR1cz86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIENhY2hlRW50cnkge1xuICByZXN1bHQ6IENvbnRleHRSZXN1bHQ7XG4gIHRpbWVzdGFtcDogbnVtYmVyO1xufVxuXG5jb25zdCBjb250ZXh0Q2FjaGUgPSBuZXcgTWFwPHN0cmluZywgQ2FjaGVFbnRyeT4oKTtcbmNvbnN0IENBQ0hFX1RUTF9TVUNDRVNTID0gMjQgKiA2MCAqIDYwICogMTAwMDsgLy8gMjQgaG91cnNcbmNvbnN0IENBQ0hFX1RUTF9FUlJPUiA9IDUgKiA2MCAqIDEwMDA7IC8vIDUgbWludXRlc1xuXG5leHBvcnQgY29uc3QgYW5hbHl6ZVRhYkNvbnRleHQgPSBhc3luYyAoXG4gIHRhYnM6IFRhYk1ldGFkYXRhW10sXG4gIG9uUHJvZ3Jlc3M/OiAoY29tcGxldGVkOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+IHZvaWRcbik6IFByb21pc2U8TWFwPG51bWJlciwgQ29udGV4dFJlc3VsdD4+ID0+IHtcbiAgY29uc3QgY29udGV4dE1hcCA9IG5ldyBNYXA8bnVtYmVyLCBDb250ZXh0UmVzdWx0PigpO1xuICBsZXQgY29tcGxldGVkID0gMDtcbiAgY29uc3QgdG90YWwgPSB0YWJzLmxlbmd0aDtcblxuICBjb25zdCBwcm9taXNlcyA9IHRhYnMubWFwKGFzeW5jICh0YWIpID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgY2FjaGVLZXkgPSBgJHt0YWIuaWR9Ojoke3RhYi51cmx9YDtcbiAgICAgIGNvbnN0IGNhY2hlZCA9IGNvbnRleHRDYWNoZS5nZXQoY2FjaGVLZXkpO1xuXG4gICAgICBpZiAoY2FjaGVkKSB7XG4gICAgICAgIGNvbnN0IGlzRXJyb3IgPSBjYWNoZWQucmVzdWx0LnN0YXR1cyA9PT0gJ0VSUk9SJyB8fCAhIWNhY2hlZC5yZXN1bHQuZXJyb3I7XG4gICAgICAgIGNvbnN0IHR0bCA9IGlzRXJyb3IgPyBDQUNIRV9UVExfRVJST1IgOiBDQUNIRV9UVExfU1VDQ0VTUztcblxuICAgICAgICBpZiAoRGF0ZS5ub3coKSAtIGNhY2hlZC50aW1lc3RhbXAgPCB0dGwpIHtcbiAgICAgICAgICBjb250ZXh0TWFwLnNldCh0YWIuaWQsIGNhY2hlZC5yZXN1bHQpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb250ZXh0Q2FjaGUuZGVsZXRlKGNhY2hlS2V5KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBmZXRjaENvbnRleHRGb3JUYWIodGFiKTtcblxuICAgICAgLy8gQ2FjaGUgd2l0aCBleHBpcmF0aW9uIGxvZ2ljXG4gICAgICBjb250ZXh0Q2FjaGUuc2V0KGNhY2hlS2V5LCB7XG4gICAgICAgIHJlc3VsdCxcbiAgICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpXG4gICAgICB9KTtcblxuICAgICAgY29udGV4dE1hcC5zZXQodGFiLmlkLCByZXN1bHQpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dFcnJvcihgRmFpbGVkIHRvIGFuYWx5emUgY29udGV4dCBmb3IgdGFiICR7dGFiLmlkfWAsIHsgZXJyb3I6IFN0cmluZyhlcnJvcikgfSk7XG4gICAgICAvLyBFdmVuIGlmIGZldGNoQ29udGV4dEZvclRhYiBmYWlscyBjb21wbGV0ZWx5LCB3ZSB0cnkgYSBzYWZlIHN5bmMgZmFsbGJhY2tcbiAgICAgIGNvbnRleHRNYXAuc2V0KHRhYi5pZCwgeyBjb250ZXh0OiBcIlVuY2F0ZWdvcml6ZWRcIiwgc291cmNlOiAnSGV1cmlzdGljJywgZXJyb3I6IFN0cmluZyhlcnJvciksIHN0YXR1czogJ0VSUk9SJyB9KTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgY29tcGxldGVkKys7XG4gICAgICBpZiAob25Qcm9ncmVzcykgb25Qcm9ncmVzcyhjb21wbGV0ZWQsIHRvdGFsKTtcbiAgICB9XG4gIH0pO1xuXG4gIGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgcmV0dXJuIGNvbnRleHRNYXA7XG59O1xuXG5jb25zdCBmZXRjaENvbnRleHRGb3JUYWIgPSBhc3luYyAodGFiOiBUYWJNZXRhZGF0YSk6IFByb21pc2U8Q29udGV4dFJlc3VsdD4gPT4ge1xuICAvLyAxLiBSdW4gR2VuZXJpYyBFeHRyYWN0aW9uIChBbHdheXMpXG4gIGxldCBkYXRhOiBQYWdlQ29udGV4dCB8IG51bGwgPSBudWxsO1xuICBsZXQgZXJyb3I6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgbGV0IHN0YXR1czogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG4gIHRyeSB7XG4gICAgICBjb25zdCBleHRyYWN0aW9uID0gYXdhaXQgZXh0cmFjdFBhZ2VDb250ZXh0KHRhYik7XG4gICAgICBkYXRhID0gZXh0cmFjdGlvbi5kYXRhO1xuICAgICAgZXJyb3IgPSBleHRyYWN0aW9uLmVycm9yO1xuICAgICAgc3RhdHVzID0gZXh0cmFjdGlvbi5zdGF0dXM7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZ0RlYnVnKGBFeHRyYWN0aW9uIGZhaWxlZCBmb3IgdGFiICR7dGFiLmlkfWAsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgIGVycm9yID0gU3RyaW5nKGUpO1xuICAgICAgc3RhdHVzID0gJ0VSUk9SJztcbiAgfVxuXG4gIGxldCBjb250ZXh0ID0gXCJVbmNhdGVnb3JpemVkXCI7XG4gIGxldCBzb3VyY2U6IENvbnRleHRSZXN1bHRbJ3NvdXJjZSddID0gJ0hldXJpc3RpYyc7XG5cbiAgLy8gMi4gVHJ5IHRvIERldGVybWluZSBDYXRlZ29yeSBmcm9tIEV4dHJhY3Rpb24gRGF0YVxuICBpZiAoZGF0YSkge1xuICAgICAgaWYgKGRhdGEucGxhdGZvcm0gPT09ICdZb3VUdWJlJyB8fCBkYXRhLnBsYXRmb3JtID09PSAnTmV0ZmxpeCcgfHwgZGF0YS5wbGF0Zm9ybSA9PT0gJ1Nwb3RpZnknIHx8IGRhdGEucGxhdGZvcm0gPT09ICdUd2l0Y2gnKSB7XG4gICAgICAgICAgY29udGV4dCA9IFwiRW50ZXJ0YWlubWVudFwiO1xuICAgICAgICAgIHNvdXJjZSA9ICdFeHRyYWN0aW9uJztcbiAgICAgIH0gZWxzZSBpZiAoZGF0YS5wbGF0Zm9ybSA9PT0gJ0dpdEh1YicgfHwgZGF0YS5wbGF0Zm9ybSA9PT0gJ1N0YWNrIE92ZXJmbG93JyB8fCBkYXRhLnBsYXRmb3JtID09PSAnSmlyYScgfHwgZGF0YS5wbGF0Zm9ybSA9PT0gJ0dpdExhYicpIHtcbiAgICAgICAgICBjb250ZXh0ID0gXCJEZXZlbG9wbWVudFwiO1xuICAgICAgICAgIHNvdXJjZSA9ICdFeHRyYWN0aW9uJztcbiAgICAgIH0gZWxzZSBpZiAoZGF0YS5wbGF0Zm9ybSA9PT0gJ0dvb2dsZScgJiYgKGRhdGEubm9ybWFsaXplZFVybC5pbmNsdWRlcygnZG9jcycpIHx8IGRhdGEubm9ybWFsaXplZFVybC5pbmNsdWRlcygnc2hlZXRzJykgfHwgZGF0YS5ub3JtYWxpemVkVXJsLmluY2x1ZGVzKCdzbGlkZXMnKSkpIHtcbiAgICAgICAgICBjb250ZXh0ID0gXCJXb3JrXCI7XG4gICAgICAgICAgc291cmNlID0gJ0V4dHJhY3Rpb24nO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gSWYgd2UgaGF2ZSBzdWNjZXNzZnVsIGV4dHJhY3Rpb24gZGF0YSBidXQgbm8gc3BlY2lmaWMgcnVsZSBtYXRjaGVkLFxuICAgICAgICAvLyB1c2UgdGhlIE9iamVjdCBUeXBlIG9yIGdlbmVyaWMgXCJHZW5lcmFsIFdlYlwiIHRvIGluZGljYXRlIGV4dHJhY3Rpb24gd29ya2VkLlxuICAgICAgICAvLyBXZSBwcmVmZXIgc3BlY2lmaWMgY2F0ZWdvcmllcywgYnV0IFwiQXJ0aWNsZVwiIG9yIFwiVmlkZW9cIiBhcmUgYmV0dGVyIHRoYW4gXCJVbmNhdGVnb3JpemVkXCIuXG4gICAgICAgIGlmIChkYXRhLm9iamVjdFR5cGUgJiYgZGF0YS5vYmplY3RUeXBlICE9PSAndW5rbm93bicpIHtcbiAgICAgICAgICAgICAvLyBNYXAgb2JqZWN0IHR5cGVzIHRvIGNhdGVnb3JpZXMgaWYgcG9zc2libGVcbiAgICAgICAgICAgICBpZiAoZGF0YS5vYmplY3RUeXBlID09PSAndmlkZW8nKSBjb250ZXh0ID0gJ0VudGVydGFpbm1lbnQnO1xuICAgICAgICAgICAgIGVsc2UgaWYgKGRhdGEub2JqZWN0VHlwZSA9PT0gJ2FydGljbGUnKSBjb250ZXh0ID0gJ05ld3MnOyAvLyBMb29zZSBtYXBwaW5nLCBidXQgYmV0dGVyIHRoYW4gbm90aGluZ1xuICAgICAgICAgICAgIGVsc2UgY29udGV4dCA9IGRhdGEub2JqZWN0VHlwZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGRhdGEub2JqZWN0VHlwZS5zbGljZSgxKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICBjb250ZXh0ID0gXCJHZW5lcmFsIFdlYlwiO1xuICAgICAgICB9XG4gICAgICAgIHNvdXJjZSA9ICdFeHRyYWN0aW9uJztcbiAgICAgIH1cbiAgfVxuXG4gIC8vIDMuIEZhbGxiYWNrIHRvIExvY2FsIEhldXJpc3RpYyAoVVJMIFJlZ2V4KVxuICBpZiAoY29udGV4dCA9PT0gXCJVbmNhdGVnb3JpemVkXCIpIHtcbiAgICAgIGNvbnN0IGggPSBhd2FpdCBsb2NhbEhldXJpc3RpYyh0YWIpO1xuICAgICAgaWYgKGguY29udGV4dCAhPT0gXCJVbmNhdGVnb3JpemVkXCIpIHtcbiAgICAgICAgICBjb250ZXh0ID0gaC5jb250ZXh0O1xuICAgICAgICAgIC8vIHNvdXJjZSByZW1haW5zICdIZXVyaXN0aWMnIChvciBtYXliZSB3ZSBzaG91bGQgc2F5ICdIZXVyaXN0aWMnIGlzIHRoZSBzb3VyY2U/KVxuICAgICAgICAgIC8vIFRoZSBsb2NhbEhldXJpc3RpYyBmdW5jdGlvbiByZXR1cm5zIHsgc291cmNlOiAnSGV1cmlzdGljJyB9XG4gICAgICB9XG4gIH1cblxuICAvLyA0LiBGYWxsYmFjayB0byBBSSAoTExNKSAtIFJFTU9WRURcbiAgLy8gVGhlIEh1Z2dpbmdGYWNlIEFQSSBlbmRwb2ludCBpcyA0MTAgR29uZSBhbmQvb3IgcmVxdWlyZXMgYXV0aGVudGljYXRpb24gd2hpY2ggd2UgZG8gbm90IGhhdmUuXG4gIC8vIFRoZSBjb2RlIGhhcyBiZWVuIHJlbW92ZWQgdG8gcHJldmVudCBlcnJvcnMuXG5cbiAgaWYgKGNvbnRleHQgIT09IFwiVW5jYXRlZ29yaXplZFwiICYmIHNvdXJjZSAhPT0gXCJFeHRyYWN0aW9uXCIpIHtcbiAgICBlcnJvciA9IHVuZGVmaW5lZDtcbiAgICBzdGF0dXMgPSB1bmRlZmluZWQ7XG4gIH1cblxuICByZXR1cm4geyBjb250ZXh0LCBzb3VyY2UsIGRhdGE6IGRhdGEgfHwgdW5kZWZpbmVkLCBlcnJvciwgc3RhdHVzIH07XG59O1xuXG5jb25zdCBsb2NhbEhldXJpc3RpYyA9IGFzeW5jICh0YWI6IFRhYk1ldGFkYXRhKTogUHJvbWlzZTxDb250ZXh0UmVzdWx0PiA9PiB7XG4gIGNvbnN0IHVybCA9IHRhYi51cmwudG9Mb3dlckNhc2UoKTtcbiAgbGV0IGNvbnRleHQgPSBcIlVuY2F0ZWdvcml6ZWRcIjtcblxuICBpZiAodXJsLmluY2x1ZGVzKFwiZ2l0aHViXCIpIHx8IHVybC5pbmNsdWRlcyhcInN0YWNrb3ZlcmZsb3dcIikgfHwgdXJsLmluY2x1ZGVzKFwibG9jYWxob3N0XCIpIHx8IHVybC5pbmNsdWRlcyhcImppcmFcIikgfHwgdXJsLmluY2x1ZGVzKFwiZ2l0bGFiXCIpKSBjb250ZXh0ID0gXCJEZXZlbG9wbWVudFwiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJnb29nbGVcIikgJiYgKHVybC5pbmNsdWRlcyhcImRvY3NcIikgfHwgdXJsLmluY2x1ZGVzKFwic2hlZXRzXCIpIHx8IHVybC5pbmNsdWRlcyhcInNsaWRlc1wiKSkpIGNvbnRleHQgPSBcIldvcmtcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwibGlua2VkaW5cIikgfHwgdXJsLmluY2x1ZGVzKFwic2xhY2tcIikgfHwgdXJsLmluY2x1ZGVzKFwiem9vbVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJ0ZWFtc1wiKSkgY29udGV4dCA9IFwiV29ya1wiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJuZXRmbGl4XCIpIHx8IHVybC5pbmNsdWRlcyhcInNwb3RpZnlcIikgfHwgdXJsLmluY2x1ZGVzKFwiaHVsdVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJkaXNuZXlcIikgfHwgdXJsLmluY2x1ZGVzKFwieW91dHViZVwiKSkgY29udGV4dCA9IFwiRW50ZXJ0YWlubWVudFwiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJ0d2l0dGVyXCIpIHx8IHVybC5pbmNsdWRlcyhcImZhY2Vib29rXCIpIHx8IHVybC5pbmNsdWRlcyhcImluc3RhZ3JhbVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJyZWRkaXRcIikgfHwgdXJsLmluY2x1ZGVzKFwidGlrdG9rXCIpIHx8IHVybC5pbmNsdWRlcyhcInBpbnRlcmVzdFwiKSkgY29udGV4dCA9IFwiU29jaWFsXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcImFtYXpvblwiKSB8fCB1cmwuaW5jbHVkZXMoXCJlYmF5XCIpIHx8IHVybC5pbmNsdWRlcyhcIndhbG1hcnRcIikgfHwgdXJsLmluY2x1ZGVzKFwidGFyZ2V0XCIpIHx8IHVybC5pbmNsdWRlcyhcInNob3BpZnlcIikpIGNvbnRleHQgPSBcIlNob3BwaW5nXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcImNublwiKSB8fCB1cmwuaW5jbHVkZXMoXCJiYmNcIikgfHwgdXJsLmluY2x1ZGVzKFwibnl0aW1lc1wiKSB8fCB1cmwuaW5jbHVkZXMoXCJ3YXNoaW5ndG9ucG9zdFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJmb3huZXdzXCIpKSBjb250ZXh0ID0gXCJOZXdzXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcImNvdXJzZXJhXCIpIHx8IHVybC5pbmNsdWRlcyhcInVkZW15XCIpIHx8IHVybC5pbmNsdWRlcyhcImVkeFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJraGFuYWNhZGVteVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJjYW52YXNcIikpIGNvbnRleHQgPSBcIkVkdWNhdGlvblwiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJleHBlZGlhXCIpIHx8IHVybC5pbmNsdWRlcyhcImJvb2tpbmdcIikgfHwgdXJsLmluY2x1ZGVzKFwiYWlyYm5iXCIpIHx8IHVybC5pbmNsdWRlcyhcInRyaXBhZHZpc29yXCIpIHx8IHVybC5pbmNsdWRlcyhcImtheWFrXCIpKSBjb250ZXh0ID0gXCJUcmF2ZWxcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwid2VibWRcIikgfHwgdXJsLmluY2x1ZGVzKFwibWF5b2NsaW5pY1wiKSB8fCB1cmwuaW5jbHVkZXMoXCJuaWguZ292XCIpIHx8IHVybC5pbmNsdWRlcyhcImhlYWx0aFwiKSkgY29udGV4dCA9IFwiSGVhbHRoXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcImVzcG5cIikgfHwgdXJsLmluY2x1ZGVzKFwibmJhXCIpIHx8IHVybC5pbmNsdWRlcyhcIm5mbFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJtbGJcIikgfHwgdXJsLmluY2x1ZGVzKFwiZmlmYVwiKSkgY29udGV4dCA9IFwiU3BvcnRzXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcInRlY2hjcnVuY2hcIikgfHwgdXJsLmluY2x1ZGVzKFwid2lyZWRcIikgfHwgdXJsLmluY2x1ZGVzKFwidGhldmVyZ2VcIikgfHwgdXJsLmluY2x1ZGVzKFwiYXJzdGVjaG5pY2FcIikpIGNvbnRleHQgPSBcIlRlY2hub2xvZ3lcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwic2NpZW5jZVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJuYXR1cmUuY29tXCIpIHx8IHVybC5pbmNsdWRlcyhcIm5hc2EuZ292XCIpKSBjb250ZXh0ID0gXCJTY2llbmNlXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcInR3aXRjaFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJzdGVhbVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJyb2Jsb3hcIikgfHwgdXJsLmluY2x1ZGVzKFwiaWduXCIpIHx8IHVybC5pbmNsdWRlcyhcImdhbWVzcG90XCIpKSBjb250ZXh0ID0gXCJHYW1pbmdcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwic291bmRjbG91ZFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJiYW5kY2FtcFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJsYXN0LmZtXCIpKSBjb250ZXh0ID0gXCJNdXNpY1wiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJkZXZpYW50YXJ0XCIpIHx8IHVybC5pbmNsdWRlcyhcImJlaGFuY2VcIikgfHwgdXJsLmluY2x1ZGVzKFwiZHJpYmJibGVcIikgfHwgdXJsLmluY2x1ZGVzKFwiYXJ0c3RhdGlvblwiKSkgY29udGV4dCA9IFwiQXJ0XCI7XG5cbiAgcmV0dXJuIHsgY29udGV4dCwgc291cmNlOiAnSGV1cmlzdGljJyB9O1xufTtcbiIsICJpbXBvcnQgeyBncm91cFRhYnMsIGdldEN1c3RvbVN0cmF0ZWdpZXMsIGdldEZpZWxkVmFsdWUsIHJlcXVpcmVzQ29udGV4dEFuYWx5c2lzIH0gZnJvbSBcIi4vZ3JvdXBpbmdTdHJhdGVnaWVzLmpzXCI7XG5pbXBvcnQgeyBzb3J0VGFicywgY29tcGFyZUJ5IH0gZnJvbSBcIi4vc29ydGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IGFuYWx5emVUYWJDb250ZXh0IH0gZnJvbSBcIi4vY29udGV4dEFuYWx5c2lzLmpzXCI7XG5pbXBvcnQgeyBsb2dEZWJ1ZywgbG9nRXJyb3IsIGxvZ0luZm8gfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgR3JvdXBpbmdTZWxlY3Rpb24sIFByZWZlcmVuY2VzLCBUYWJHcm91cCwgVGFiTWV0YWRhdGEsIFNvcnRpbmdSdWxlIH0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgZ2V0U3RvcmVkVmFsdWUsIHNldFN0b3JlZFZhbHVlIH0gZnJvbSBcIi4vc3RvcmFnZS5qc1wiO1xuaW1wb3J0IHsgbWFwQ2hyb21lVGFiLCBhc0FycmF5IH0gZnJvbSBcIi4uL3NoYXJlZC91dGlscy5qc1wiO1xuXG5jb25zdCBnZXRUYWJzRm9yRmlsdGVyID0gYXN5bmMgKGZpbHRlcj86IEdyb3VwaW5nU2VsZWN0aW9uKTogUHJvbWlzZTxjaHJvbWUudGFicy5UYWJbXT4gPT4ge1xuICBjb25zdCB3aW5kb3dJZHMgPSBmaWx0ZXI/LndpbmRvd0lkcztcbiAgY29uc3QgdGFiSWRzID0gZmlsdGVyPy50YWJJZHM7XG4gIGNvbnN0IGhhc1dpbmRvd0lkcyA9IHdpbmRvd0lkcyAmJiB3aW5kb3dJZHMubGVuZ3RoID4gMDtcbiAgY29uc3QgaGFzVGFiSWRzID0gdGFiSWRzICYmIHRhYklkcy5sZW5ndGggPiAwO1xuXG4gIGlmICghZmlsdGVyIHx8ICghaGFzV2luZG93SWRzICYmICFoYXNUYWJJZHMpKSB7XG4gICAgcmV0dXJuIGNocm9tZS50YWJzLnF1ZXJ5KHt9KTtcbiAgfVxuXG4gIGNvbnN0IHByb21pc2VzOiBQcm9taXNlPGFueT5bXSA9IFtdO1xuXG4gIGlmIChoYXNXaW5kb3dJZHMpIHtcbiAgICB3aW5kb3dJZHMuZm9yRWFjaCh3aW5kb3dJZCA9PiB7XG4gICAgICBwcm9taXNlcy5wdXNoKGNocm9tZS50YWJzLnF1ZXJ5KHsgd2luZG93SWQgfSkuY2F0Y2goKCkgPT4gW10pKTtcbiAgICB9KTtcbiAgfVxuXG4gIGlmIChoYXNUYWJJZHMpIHtcbiAgICB0YWJJZHMuZm9yRWFjaCh0YWJJZCA9PiB7XG4gICAgICBwcm9taXNlcy5wdXNoKGNocm9tZS50YWJzLmdldCh0YWJJZCkuY2F0Y2goKCkgPT4gbnVsbCkpO1xuICAgIH0pO1xuICB9XG5cbiAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcblxuICAvLyBGbGF0dGVuIGFuZCBmaWx0ZXIgb3V0IG51bGxzXG4gIGNvbnN0IGFsbFRhYnM6IGNocm9tZS50YWJzLlRhYltdID0gW107XG4gIGZvciAoY29uc3QgcmVzIG9mIHJlc3VsdHMpIHtcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KHJlcykpIHtcbiAgICAgICAgICBhbGxUYWJzLnB1c2goLi4ucmVzKTtcbiAgICAgIH0gZWxzZSBpZiAocmVzKSB7XG4gICAgICAgICAgYWxsVGFicy5wdXNoKHJlcyk7XG4gICAgICB9XG4gIH1cblxuICAvLyBEZWR1cGxpY2F0ZSBieSBJRFxuICBjb25zdCB1bmlxdWVUYWJzID0gbmV3IE1hcDxudW1iZXIsIGNocm9tZS50YWJzLlRhYj4oKTtcbiAgZm9yIChjb25zdCB0YWIgb2YgYWxsVGFicykge1xuICAgICAgaWYgKHRhYi5pZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgdW5pcXVlVGFicy5zZXQodGFiLmlkLCB0YWIpO1xuICAgICAgfVxuICB9XG5cbiAgcmV0dXJuIEFycmF5LmZyb20odW5pcXVlVGFicy52YWx1ZXMoKSk7XG59O1xuXG5leHBvcnQgY29uc3QgZmV0Y2hDdXJyZW50VGFiR3JvdXBzID0gYXN5bmMgKFxuICBwcmVmZXJlbmNlczogUHJlZmVyZW5jZXMsXG4gIG9uUHJvZ3Jlc3M/OiAoY29tcGxldGVkOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+IHZvaWRcbik6IFByb21pc2U8VGFiR3JvdXBbXT4gPT4ge1xuICB0cnkge1xuICBjb25zdCB0YWJzID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoe30pO1xuICBjb25zdCBncm91cHMgPSBhd2FpdCBjaHJvbWUudGFiR3JvdXBzLnF1ZXJ5KHt9KTtcbiAgY29uc3QgZ3JvdXBNYXAgPSBuZXcgTWFwKGdyb3Vwcy5tYXAoZyA9PiBbZy5pZCwgZ10pKTtcblxuICAvLyBNYXAgdGFicyB0byBtZXRhZGF0YVxuICBjb25zdCBtYXBwZWQgPSB0YWJzLm1hcChtYXBDaHJvbWVUYWIpLmZpbHRlcigodCk6IHQgaXMgVGFiTWV0YWRhdGEgPT4gQm9vbGVhbih0KSk7XG5cbiAgaWYgKHJlcXVpcmVzQ29udGV4dEFuYWx5c2lzKHByZWZlcmVuY2VzLnNvcnRpbmcpKSB7XG4gICAgICBjb25zdCBjb250ZXh0TWFwID0gYXdhaXQgYW5hbHl6ZVRhYkNvbnRleHQobWFwcGVkLCBvblByb2dyZXNzKTtcbiAgICAgIG1hcHBlZC5mb3JFYWNoKHRhYiA9PiB7XG4gICAgICAgIGNvbnN0IHJlcyA9IGNvbnRleHRNYXAuZ2V0KHRhYi5pZCk7XG4gICAgICAgIHRhYi5jb250ZXh0ID0gcmVzPy5jb250ZXh0O1xuICAgICAgICB0YWIuY29udGV4dERhdGEgPSByZXM/LmRhdGE7XG4gICAgICB9KTtcbiAgfVxuXG4gIGNvbnN0IHJlc3VsdEdyb3VwczogVGFiR3JvdXBbXSA9IFtdO1xuICBjb25zdCB0YWJzQnlHcm91cElkID0gbmV3IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhW10+KCk7XG4gIGNvbnN0IHRhYnNCeVdpbmRvd1VuZ3JvdXBlZCA9IG5ldyBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YVtdPigpO1xuXG4gIG1hcHBlZC5mb3JFYWNoKHRhYiA9PiB7XG4gICAgICBjb25zdCBncm91cElkID0gdGFiLmdyb3VwSWQgPz8gLTE7XG4gICAgICBpZiAoZ3JvdXBJZCAhPT0gLTEpIHtcbiAgICAgICAgICBpZiAoIXRhYnNCeUdyb3VwSWQuaGFzKGdyb3VwSWQpKSB0YWJzQnlHcm91cElkLnNldChncm91cElkLCBbXSk7XG4gICAgICAgICAgdGFic0J5R3JvdXBJZC5nZXQoZ3JvdXBJZCkhLnB1c2godGFiKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgIGlmICghdGFic0J5V2luZG93VW5ncm91cGVkLmhhcyh0YWIud2luZG93SWQpKSB0YWJzQnlXaW5kb3dVbmdyb3VwZWQuc2V0KHRhYi53aW5kb3dJZCwgW10pO1xuICAgICAgICAgICB0YWJzQnlXaW5kb3dVbmdyb3VwZWQuZ2V0KHRhYi53aW5kb3dJZCkhLnB1c2godGFiKTtcbiAgICAgIH1cbiAgfSk7XG5cbiAgLy8gQ3JlYXRlIFRhYkdyb3VwIG9iamVjdHMgZm9yIGFjdHVhbCBncm91cHNcbiAgZm9yIChjb25zdCBbZ3JvdXBJZCwgZ3JvdXBUYWJzXSBvZiB0YWJzQnlHcm91cElkKSB7XG4gICAgICBjb25zdCBicm93c2VyR3JvdXAgPSBncm91cE1hcC5nZXQoZ3JvdXBJZCk7XG4gICAgICBpZiAoYnJvd3Nlckdyb3VwKSB7XG4gICAgICAgICAgcmVzdWx0R3JvdXBzLnB1c2goe1xuICAgICAgICAgICAgICBpZDogYGdyb3VwLSR7Z3JvdXBJZH1gLFxuICAgICAgICAgICAgICB3aW5kb3dJZDogYnJvd3Nlckdyb3VwLndpbmRvd0lkLFxuICAgICAgICAgICAgICBsYWJlbDogYnJvd3Nlckdyb3VwLnRpdGxlIHx8IFwiVW50aXRsZWQgR3JvdXBcIixcbiAgICAgICAgICAgICAgY29sb3I6IGJyb3dzZXJHcm91cC5jb2xvcixcbiAgICAgICAgICAgICAgdGFiczogc29ydFRhYnMoZ3JvdXBUYWJzLCBwcmVmZXJlbmNlcy5zb3J0aW5nKSxcbiAgICAgICAgICAgICAgcmVhc29uOiBcIk1hbnVhbFwiXG4gICAgICAgICAgfSk7XG4gICAgICB9XG4gIH1cblxuICAvLyBIYW5kbGUgdW5ncm91cGVkIHRhYnNcbiAgZm9yIChjb25zdCBbd2luZG93SWQsIHRhYnNdIG9mIHRhYnNCeVdpbmRvd1VuZ3JvdXBlZCkge1xuICAgICAgcmVzdWx0R3JvdXBzLnB1c2goe1xuICAgICAgICAgIGlkOiBgdW5ncm91cGVkLSR7d2luZG93SWR9YCxcbiAgICAgICAgICB3aW5kb3dJZDogd2luZG93SWQsXG4gICAgICAgICAgbGFiZWw6IFwiVW5ncm91cGVkXCIsXG4gICAgICAgICAgY29sb3I6IFwiZ3JleVwiLFxuICAgICAgICAgIHRhYnM6IHNvcnRUYWJzKHRhYnMsIHByZWZlcmVuY2VzLnNvcnRpbmcpLFxuICAgICAgICAgIHJlYXNvbjogXCJVbmdyb3VwZWRcIlxuICAgICAgfSk7XG4gIH1cblxuICBsb2dJbmZvKFwiRmV0Y2hlZCBjdXJyZW50IHRhYiBncm91cHNcIiwgeyBncm91cHM6IHJlc3VsdEdyb3Vwcy5sZW5ndGgsIHRhYnM6IG1hcHBlZC5sZW5ndGggfSk7XG4gIHJldHVybiByZXN1bHRHcm91cHM7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBsb2dFcnJvcihcIkVycm9yIGluIGZldGNoQ3VycmVudFRhYkdyb3Vwc1wiLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgdGhyb3cgZTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGNhbGN1bGF0ZVRhYkdyb3VwcyA9IGFzeW5jIChcbiAgcHJlZmVyZW5jZXM6IFByZWZlcmVuY2VzLFxuICBmaWx0ZXI/OiBHcm91cGluZ1NlbGVjdGlvbixcbiAgb25Qcm9ncmVzcz86IChjb21wbGV0ZWQ6IG51bWJlciwgdG90YWw6IG51bWJlcikgPT4gdm9pZFxuKTogUHJvbWlzZTxUYWJHcm91cFtdPiA9PiB7XG4gIGNvbnN0IGNocm9tZVRhYnMgPSBhd2FpdCBnZXRUYWJzRm9yRmlsdGVyKGZpbHRlcik7XG4gIGNvbnN0IHdpbmRvd0lkU2V0ID0gbmV3IFNldChmaWx0ZXI/LndpbmRvd0lkcyA/PyBbXSk7XG4gIGNvbnN0IHRhYklkU2V0ID0gbmV3IFNldChmaWx0ZXI/LnRhYklkcyA/PyBbXSk7XG4gIGNvbnN0IGhhc0ZpbHRlcnMgPSB3aW5kb3dJZFNldC5zaXplID4gMCB8fCB0YWJJZFNldC5zaXplID4gMDtcbiAgY29uc3QgZmlsdGVyZWRUYWJzID0gY2hyb21lVGFicy5maWx0ZXIoKHRhYikgPT4ge1xuICAgIGlmICghaGFzRmlsdGVycykgcmV0dXJuIHRydWU7XG4gICAgcmV0dXJuICh0YWIud2luZG93SWQgJiYgd2luZG93SWRTZXQuaGFzKHRhYi53aW5kb3dJZCkpIHx8ICh0YWIuaWQgJiYgdGFiSWRTZXQuaGFzKHRhYi5pZCkpO1xuICB9KTtcbiAgY29uc3QgbWFwcGVkID0gZmlsdGVyZWRUYWJzXG4gICAgLm1hcChtYXBDaHJvbWVUYWIpXG4gICAgLmZpbHRlcigodGFiKTogdGFiIGlzIFRhYk1ldGFkYXRhID0+IEJvb2xlYW4odGFiKSk7XG5cbiAgaWYgKHJlcXVpcmVzQ29udGV4dEFuYWx5c2lzKHByZWZlcmVuY2VzLnNvcnRpbmcpKSB7XG4gICAgY29uc3QgY29udGV4dE1hcCA9IGF3YWl0IGFuYWx5emVUYWJDb250ZXh0KG1hcHBlZCwgb25Qcm9ncmVzcyk7XG4gICAgbWFwcGVkLmZvckVhY2godGFiID0+IHtcbiAgICAgIGNvbnN0IHJlcyA9IGNvbnRleHRNYXAuZ2V0KHRhYi5pZCk7XG4gICAgICB0YWIuY29udGV4dCA9IHJlcz8uY29udGV4dDtcbiAgICAgIHRhYi5jb250ZXh0RGF0YSA9IHJlcz8uZGF0YTtcbiAgICB9KTtcbiAgfVxuXG4gIGNvbnN0IGdyb3VwZWQgPSBncm91cFRhYnMobWFwcGVkLCBwcmVmZXJlbmNlcy5zb3J0aW5nKTtcbiAgZ3JvdXBlZC5mb3JFYWNoKChncm91cCkgPT4ge1xuICAgIGdyb3VwLnRhYnMgPSBzb3J0VGFicyhncm91cC50YWJzLCBwcmVmZXJlbmNlcy5zb3J0aW5nKTtcbiAgfSk7XG4gIGxvZ0luZm8oXCJDYWxjdWxhdGVkIHRhYiBncm91cHNcIiwgeyBncm91cHM6IGdyb3VwZWQubGVuZ3RoLCB0YWJzOiBtYXBwZWQubGVuZ3RoIH0pO1xuICByZXR1cm4gZ3JvdXBlZDtcbn07XG5cbmNvbnN0IFZBTElEX0NPTE9SUyA9IFtcImdyZXlcIiwgXCJibHVlXCIsIFwicmVkXCIsIFwieWVsbG93XCIsIFwiZ3JlZW5cIiwgXCJwaW5rXCIsIFwicHVycGxlXCIsIFwiY3lhblwiLCBcIm9yYW5nZVwiXTtcblxuZXhwb3J0IGNvbnN0IGFwcGx5VGFiR3JvdXBzID0gYXN5bmMgKGdyb3VwczogVGFiR3JvdXBbXSkgPT4ge1xuICBjb25zdCBjbGFpbWVkR3JvdXBJZHMgPSBuZXcgU2V0PG51bWJlcj4oKTtcblxuICBmb3IgKGNvbnN0IGdyb3VwIG9mIGdyb3Vwcykge1xuICAgIGxldCB0YWJzVG9Qcm9jZXNzOiB7IHdpbmRvd0lkOiBudW1iZXIsIHRhYnM6IFRhYk1ldGFkYXRhW10gfVtdID0gW107XG5cbiAgICBpZiAoZ3JvdXAud2luZG93TW9kZSA9PT0gJ25ldycpIHtcbiAgICAgIGlmIChncm91cC50YWJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBmaXJzdCA9IGdyb3VwLnRhYnNbMF07XG4gICAgICAgICAgY29uc3Qgd2luID0gYXdhaXQgY2hyb21lLndpbmRvd3MuY3JlYXRlKHsgdGFiSWQ6IGZpcnN0LmlkIH0pO1xuICAgICAgICAgIGNvbnN0IHdpbklkID0gd2luLmlkITtcbiAgICAgICAgICBjb25zdCBvdGhlcnMgPSBncm91cC50YWJzLnNsaWNlKDEpLm1hcCh0ID0+IHQuaWQpO1xuICAgICAgICAgIGlmIChvdGhlcnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMubW92ZShvdGhlcnMsIHsgd2luZG93SWQ6IHdpbklkLCBpbmRleDogLTEgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRhYnNUb1Byb2Nlc3MucHVzaCh7IHdpbmRvd0lkOiB3aW5JZCwgdGFiczogZ3JvdXAudGFicyB9KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIGxvZ0Vycm9yKFwiRXJyb3IgY3JlYXRpbmcgbmV3IHdpbmRvdyBmb3IgZ3JvdXBcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChncm91cC53aW5kb3dNb2RlID09PSAnY29tcG91bmQnKSB7XG4gICAgICBpZiAoZ3JvdXAudGFicy5sZW5ndGggPiAwKSB7XG4gICAgICAgIC8vIERldGVybWluZSB0YXJnZXQgd2luZG93IChtYWpvcml0eSB3aW5zKVxuICAgICAgICBjb25zdCBjb3VudHMgPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyPigpO1xuICAgICAgICBncm91cC50YWJzLmZvckVhY2godCA9PiBjb3VudHMuc2V0KHQud2luZG93SWQsIChjb3VudHMuZ2V0KHQud2luZG93SWQpIHx8IDApICsgMSkpO1xuICAgICAgICBsZXQgdGFyZ2V0V2luZG93SWQgPSBncm91cC50YWJzWzBdLndpbmRvd0lkO1xuICAgICAgICBsZXQgbWF4ID0gMDtcbiAgICAgICAgZm9yIChjb25zdCBbd2lkLCBjb3VudF0gb2YgY291bnRzKSB7XG4gICAgICAgICAgaWYgKGNvdW50ID4gbWF4KSB7IG1heCA9IGNvdW50OyB0YXJnZXRXaW5kb3dJZCA9IHdpZDsgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gTW92ZSB0YWJzIG5vdCBpbiB0YXJnZXRcbiAgICAgICAgY29uc3QgdG9Nb3ZlID0gZ3JvdXAudGFicy5maWx0ZXIodCA9PiB0LndpbmRvd0lkICE9PSB0YXJnZXRXaW5kb3dJZCkubWFwKHQgPT4gdC5pZCk7XG4gICAgICAgIGlmICh0b01vdmUubGVuZ3RoID4gMCkge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCBjaHJvbWUudGFicy5tb3ZlKHRvTW92ZSwgeyB3aW5kb3dJZDogdGFyZ2V0V2luZG93SWQsIGluZGV4OiAtMSB9KTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBsb2dFcnJvcihcIkVycm9yIG1vdmluZyB0YWJzIGZvciBjb21wb3VuZCBncm91cFwiLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRhYnNUb1Byb2Nlc3MucHVzaCh7IHdpbmRvd0lkOiB0YXJnZXRXaW5kb3dJZCwgdGFiczogZ3JvdXAudGFicyB9KTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy8gQ3VycmVudCBtb2RlOiBzcGxpdCBieSBzb3VyY2Ugd2luZG93XG4gICAgICBjb25zdCBtYXAgPSBncm91cC50YWJzLnJlZHVjZTxNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YVtdPj4oKGFjYywgdGFiKSA9PiB7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nID0gYWNjLmdldCh0YWIud2luZG93SWQpID8/IFtdO1xuICAgICAgICBleGlzdGluZy5wdXNoKHRhYik7XG4gICAgICAgIGFjYy5zZXQodGFiLndpbmRvd0lkLCBleGlzdGluZyk7XG4gICAgICAgIHJldHVybiBhY2M7XG4gICAgICB9LCBuZXcgTWFwKCkpO1xuICAgICAgZm9yIChjb25zdCBbd2lkLCB0XSBvZiBtYXApIHtcbiAgICAgICAgdGFic1RvUHJvY2Vzcy5wdXNoKHsgd2luZG93SWQ6IHdpZCwgdGFiczogdCB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IHsgd2luZG93SWQ6IHRhcmdldFdpbklkLCB0YWJzIH0gb2YgdGFic1RvUHJvY2Vzcykge1xuICAgICAgLy8gRmluZCBjYW5kaWRhdGUgZ3JvdXAgSUQgdG8gcmV1c2VcbiAgICAgIGxldCBjYW5kaWRhdGVHcm91cElkOiBudW1iZXIgfCB1bmRlZmluZWQ7XG4gICAgICBjb25zdCBjb3VudHMgPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyPigpO1xuICAgICAgZm9yIChjb25zdCB0IG9mIHRhYnMpIHtcbiAgICAgICAgLy8gT25seSBjb25zaWRlciBncm91cHMgdGhhdCB3ZXJlIGFscmVhZHkgaW4gdGhpcyB3aW5kb3dcbiAgICAgICAgaWYgKHQuZ3JvdXBJZCAmJiB0Lmdyb3VwSWQgIT09IC0xICYmIHQud2luZG93SWQgPT09IHRhcmdldFdpbklkKSB7XG4gICAgICAgICAgY291bnRzLnNldCh0Lmdyb3VwSWQsIChjb3VudHMuZ2V0KHQuZ3JvdXBJZCkgfHwgMCkgKyAxKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBQcmlvcml0aXplIHRoZSBtb3N0IGZyZXF1ZW50IGdyb3VwIElEIHRoYXQgaGFzbid0IGJlZW4gY2xhaW1lZCB5ZXRcbiAgICAgIGNvbnN0IHNvcnRlZENhbmRpZGF0ZXMgPSBBcnJheS5mcm9tKGNvdW50cy5lbnRyaWVzKCkpXG4gICAgICAgIC5zb3J0KChhLCBiKSA9PiBiWzFdIC0gYVsxXSlcbiAgICAgICAgLm1hcCgoW2lkXSkgPT4gaWQpO1xuXG4gICAgICBmb3IgKGNvbnN0IGlkIG9mIHNvcnRlZENhbmRpZGF0ZXMpIHtcbiAgICAgICAgaWYgKCFjbGFpbWVkR3JvdXBJZHMuaGFzKGlkKSkge1xuICAgICAgICAgIGNhbmRpZGF0ZUdyb3VwSWQgPSBpZDtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBsZXQgZmluYWxHcm91cElkOiBudW1iZXI7XG5cbiAgICAgIGlmIChjYW5kaWRhdGVHcm91cElkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgY2xhaW1lZEdyb3VwSWRzLmFkZChjYW5kaWRhdGVHcm91cElkKTtcbiAgICAgICAgZmluYWxHcm91cElkID0gY2FuZGlkYXRlR3JvdXBJZDtcblxuICAgICAgICAvLyBDbGVhbiB1cCBsZWZ0b3ZlcnMgYW5kIGFkZCBtaXNzaW5nIHRhYnNcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBleGlzdGluZ1RhYnMgPSBhd2FpdCBjaHJvbWUudGFicy5xdWVyeSh7IGdyb3VwSWQ6IGZpbmFsR3JvdXBJZCB9KTtcbiAgICAgICAgICBjb25zdCBleGlzdGluZ1RhYklkcyA9IG5ldyBTZXQoZXhpc3RpbmdUYWJzLm1hcCh0ID0+IHQuaWQpKTtcbiAgICAgICAgICBjb25zdCB0YXJnZXRUYWJJZHMgPSBuZXcgU2V0KHRhYnMubWFwKHQgPT4gdC5pZCkpO1xuXG4gICAgICAgICAgLy8gMS4gVW5ncm91cCB0YWJzIHRoYXQgc2hvdWxkbid0IGJlIGhlcmVcbiAgICAgICAgICBjb25zdCBsZWZ0b3ZlcnMgPSBleGlzdGluZ1RhYnMuZmlsdGVyKHQgPT4gdC5pZCAhPT0gdW5kZWZpbmVkICYmICF0YXJnZXRUYWJJZHMuaGFzKHQuaWQpKTtcbiAgICAgICAgICBpZiAobGVmdG92ZXJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGF3YWl0IGNocm9tZS50YWJzLnVuZ3JvdXAobGVmdG92ZXJzLm1hcCh0ID0+IHQuaWQhKSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gMi4gQWRkIG9ubHkgdGhlIHRhYnMgdGhhdCBhcmVuJ3QgYWxyZWFkeSBpbiB0aGUgZ3JvdXBcbiAgICAgICAgICBjb25zdCB0YWJzVG9BZGQgPSB0YWJzLmZpbHRlcih0ID0+ICFleGlzdGluZ1RhYklkcy5oYXModC5pZCkpO1xuICAgICAgICAgIGlmICh0YWJzVG9BZGQubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgIC8vIEZvciBuZXcvY29tcG91bmQsIHRhYnMgbWlnaHQgaGF2ZSBiZWVuIG1vdmVkLCBzbyB3ZSBtdXN0IHBhc3MgdGFiSWRzXG4gICAgICAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMuZ3JvdXAoeyBncm91cElkOiBmaW5hbEdyb3VwSWQsIHRhYklkczogdGFic1RvQWRkLm1hcCh0ID0+IHQuaWQpIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIGxvZ0Vycm9yKFwiRXJyb3IgbWFuYWdpbmcgZ3JvdXAgcmV1c2VcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBDcmVhdGUgbmV3IGdyb3VwIChkZWZhdWx0IGJlaGF2aW9yOiBleHBhbmRlZClcbiAgICAgICAgLy8gRW5zdXJlIHdlIGNyZWF0ZSBpdCBpbiB0aGUgdGFyZ2V0IHdpbmRvdyAoaWYgc3RyaWN0bHkgbmV3LCB0YWJJZHMgaW1wbGllcyB3aW5kb3cgaWYgdGhleSBhcmUgaW4gaXQpXG4gICAgICAgIC8vIElmIHRhYnMgd2VyZSBqdXN0IG1vdmVkLCB0aGV5IGFyZSBpbiB0YXJnZXRXaW5JZC5cbiAgICAgICAgLy8gY2hyb21lLnRhYnMuZ3JvdXAgd2l0aCB0YWJJZHMgd2lsbCBpbmZlciB3aW5kb3cgZnJvbSB0YWJzLlxuICAgICAgICBmaW5hbEdyb3VwSWQgPSBhd2FpdCBjaHJvbWUudGFicy5ncm91cCh7XG4gICAgICAgICAgdGFiSWRzOiB0YWJzLm1hcCh0ID0+IHQuaWQpLFxuICAgICAgICAgIGNyZWF0ZVByb3BlcnRpZXM6IHsgd2luZG93SWQ6IHRhcmdldFdpbklkIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGNsYWltZWRHcm91cElkcy5hZGQoZmluYWxHcm91cElkKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgdXBkYXRlUHJvcHM6IGNocm9tZS50YWJHcm91cHMuVXBkYXRlUHJvcGVydGllcyA9IHtcbiAgICAgICAgdGl0bGU6IGdyb3VwLmxhYmVsXG4gICAgICB9O1xuICAgICAgaWYgKFZBTElEX0NPTE9SUy5pbmNsdWRlcyhncm91cC5jb2xvcikpIHtcbiAgICAgICAgICB1cGRhdGVQcm9wcy5jb2xvciA9IGdyb3VwLmNvbG9yIGFzIGNocm9tZS50YWJHcm91cHMuQ29sb3JFbnVtO1xuICAgICAgfVxuICAgICAgYXdhaXQgY2hyb21lLnRhYkdyb3Vwcy51cGRhdGUoZmluYWxHcm91cElkLCB1cGRhdGVQcm9wcyk7XG4gICAgfVxuICB9XG4gIGxvZ0luZm8oXCJBcHBsaWVkIHRhYiBncm91cHNcIiwgeyBjb3VudDogZ3JvdXBzLmxlbmd0aCB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBhcHBseVRhYlNvcnRpbmcgPSBhc3luYyAoXG4gIHByZWZlcmVuY2VzOiBQcmVmZXJlbmNlcyxcbiAgZmlsdGVyPzogR3JvdXBpbmdTZWxlY3Rpb24sXG4gIG9uUHJvZ3Jlc3M/OiAoY29tcGxldGVkOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+IHZvaWRcbikgPT4ge1xuICBjb25zdCB0YXJnZXRXaW5kb3dJZHMgPSBuZXcgU2V0PG51bWJlcj4oKTtcbiAgbGV0IGNocm9tZVRhYnM6IGNocm9tZS50YWJzLlRhYltdID0gW107XG5cbiAgY29uc3QgZXhwbGljaXRXaW5kb3dJZHMgPSBmaWx0ZXI/LndpbmRvd0lkcyA/PyBbXTtcbiAgY29uc3QgZXhwbGljaXRUYWJJZHMgPSBmaWx0ZXI/LnRhYklkcyA/PyBbXTtcbiAgY29uc3QgaGFzRmlsdGVyID0gZXhwbGljaXRXaW5kb3dJZHMubGVuZ3RoID4gMCB8fCBleHBsaWNpdFRhYklkcy5sZW5ndGggPiAwO1xuXG4gIGlmICghaGFzRmlsdGVyKSB7XG4gICAgICBjaHJvbWVUYWJzID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoe30pO1xuICAgICAgY2hyb21lVGFicy5mb3JFYWNoKHQgPT4geyBpZiAodC53aW5kb3dJZCkgdGFyZ2V0V2luZG93SWRzLmFkZCh0LndpbmRvd0lkKTsgfSk7XG4gIH0gZWxzZSB7XG4gICAgICBleHBsaWNpdFdpbmRvd0lkcy5mb3JFYWNoKGlkID0+IHRhcmdldFdpbmRvd0lkcy5hZGQoaWQpKTtcblxuICAgICAgaWYgKGV4cGxpY2l0VGFiSWRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBjb25zdCBzcGVjaWZpY1RhYnMgPSBhd2FpdCBQcm9taXNlLmFsbChleHBsaWNpdFRhYklkcy5tYXAoaWQgPT4gY2hyb21lLnRhYnMuZ2V0KGlkKS5jYXRjaCgoKSA9PiBudWxsKSkpO1xuICAgICAgICAgIHNwZWNpZmljVGFicy5mb3JFYWNoKHQgPT4ge1xuICAgICAgICAgICAgICBpZiAodCAmJiB0LndpbmRvd0lkKSB0YXJnZXRXaW5kb3dJZHMuYWRkKHQud2luZG93SWQpO1xuICAgICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB3aW5kb3dQcm9taXNlcyA9IEFycmF5LmZyb20odGFyZ2V0V2luZG93SWRzKS5tYXAod2luZG93SWQgPT5cbiAgICAgICAgICBjaHJvbWUudGFicy5xdWVyeSh7IHdpbmRvd0lkIH0pLmNhdGNoKCgpID0+IFtdKVxuICAgICAgKTtcbiAgICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbCh3aW5kb3dQcm9taXNlcyk7XG4gICAgICBjaHJvbWVUYWJzID0gcmVzdWx0cy5mbGF0KCk7XG4gIH1cblxuICBmb3IgKGNvbnN0IHdpbmRvd0lkIG9mIHRhcmdldFdpbmRvd0lkcykge1xuICAgICAgY29uc3Qgd2luZG93VGFicyA9IGNocm9tZVRhYnMuZmlsdGVyKHQgPT4gdC53aW5kb3dJZCA9PT0gd2luZG93SWQpO1xuICAgICAgY29uc3QgbWFwcGVkID0gd2luZG93VGFicy5tYXAobWFwQ2hyb21lVGFiKS5maWx0ZXIoKHQpOiB0IGlzIFRhYk1ldGFkYXRhID0+IEJvb2xlYW4odCkpO1xuXG4gICAgICBpZiAocmVxdWlyZXNDb250ZXh0QW5hbHlzaXMocHJlZmVyZW5jZXMuc29ydGluZykpIHtcbiAgICAgICAgY29uc3QgY29udGV4dE1hcCA9IGF3YWl0IGFuYWx5emVUYWJDb250ZXh0KG1hcHBlZCwgb25Qcm9ncmVzcyk7XG4gICAgICAgIG1hcHBlZC5mb3JFYWNoKHRhYiA9PiB7XG4gICAgICAgICAgY29uc3QgcmVzID0gY29udGV4dE1hcC5nZXQodGFiLmlkKTtcbiAgICAgICAgICB0YWIuY29udGV4dCA9IHJlcz8uY29udGV4dDtcbiAgICAgICAgICB0YWIuY29udGV4dERhdGEgPSByZXM/LmRhdGE7XG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICAvLyBHcm91cCB0YWJzIGJ5IGdyb3VwSWQgdG8gc29ydCB3aXRoaW4gZ3JvdXBzXG4gICAgICBjb25zdCB0YWJzQnlHcm91cCA9IG5ldyBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YVtdPigpO1xuICAgICAgY29uc3QgdW5ncm91cGVkVGFiczogVGFiTWV0YWRhdGFbXSA9IFtdO1xuXG4gICAgICBtYXBwZWQuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgICBjb25zdCBncm91cElkID0gdGFiLmdyb3VwSWQgPz8gLTE7XG4gICAgICAgIGlmIChncm91cElkICE9PSAtMSkge1xuICAgICAgICAgIGNvbnN0IGdyb3VwID0gdGFic0J5R3JvdXAuZ2V0KGdyb3VwSWQpID8/IFtdO1xuICAgICAgICAgIGdyb3VwLnB1c2godGFiKTtcbiAgICAgICAgICB0YWJzQnlHcm91cC5zZXQoZ3JvdXBJZCwgZ3JvdXApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHVuZ3JvdXBlZFRhYnMucHVzaCh0YWIpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgLy8gMS4gU29ydCB0YWJzIHdpdGhpbiBlYWNoIGdyb3VwXG4gICAgICBmb3IgKGNvbnN0IFtncm91cElkLCB0YWJzXSBvZiB0YWJzQnlHcm91cCkge1xuICAgICAgICBjb25zdCBncm91cFRhYkluZGljZXMgPSB3aW5kb3dUYWJzXG4gICAgICAgICAgLmZpbHRlcih0ID0+IHQuZ3JvdXBJZCA9PT0gZ3JvdXBJZClcbiAgICAgICAgICAubWFwKHQgPT4gdC5pbmRleClcbiAgICAgICAgICAuc29ydCgoYSwgYikgPT4gYSAtIGIpO1xuXG4gICAgICAgIGNvbnN0IHN0YXJ0SW5kZXggPSBncm91cFRhYkluZGljZXNbMF0gPz8gMDtcblxuICAgICAgICBjb25zdCBzb3J0ZWRHcm91cFRhYnMgPSBzb3J0VGFicyh0YWJzLCBwcmVmZXJlbmNlcy5zb3J0aW5nKTtcbiAgICAgICAgY29uc3Qgc29ydGVkSWRzID0gc29ydGVkR3JvdXBUYWJzLm1hcCh0ID0+IHQuaWQpO1xuXG4gICAgICAgIGlmIChzb3J0ZWRJZHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICBhd2FpdCBjaHJvbWUudGFicy5tb3ZlKHNvcnRlZElkcywgeyBpbmRleDogc3RhcnRJbmRleCB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyAyLiBTb3J0IHVuZ3JvdXBlZCB0YWJzXG4gICAgICBpZiAodW5ncm91cGVkVGFicy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvbnN0IHNvcnRlZFVuZ3JvdXBlZCA9IHNvcnRUYWJzKHVuZ3JvdXBlZFRhYnMsIHByZWZlcmVuY2VzLnNvcnRpbmcpO1xuICAgICAgICBjb25zdCBzb3J0ZWRJZHMgPSBzb3J0ZWRVbmdyb3VwZWQubWFwKHQgPT4gdC5pZCk7XG5cbiAgICAgICAgLy8gTW92ZSB0byBpbmRleCAwICh0b3Agb2Ygd2luZG93KVxuICAgICAgICBhd2FpdCBjaHJvbWUudGFicy5tb3ZlKHNvcnRlZElkcywgeyBpbmRleDogMCB9KTtcbiAgICAgIH1cblxuICAgICAgLy8gMy4gU29ydCBHcm91cHMgKGlmIGVuYWJsZWQpXG4gICAgICBhd2FpdCBzb3J0R3JvdXBzSWZFbmFibGVkKHdpbmRvd0lkLCBwcmVmZXJlbmNlcy5zb3J0aW5nLCB0YWJzQnlHcm91cCk7XG4gIH1cbiAgbG9nSW5mbyhcIkFwcGxpZWQgdGFiIHNvcnRpbmdcIik7XG59O1xuXG5jb25zdCBjb21wYXJlQnlTb3J0aW5nUnVsZXMgPSAoc29ydGluZ1J1bGVzQXJnOiBTb3J0aW5nUnVsZVtdLCBhOiBUYWJNZXRhZGF0YSwgYjogVGFiTWV0YWRhdGEpOiBudW1iZXIgPT4ge1xuICBjb25zdCBzb3J0UnVsZXNMaXN0ID0gYXNBcnJheTxTb3J0aW5nUnVsZT4oc29ydGluZ1J1bGVzQXJnKTtcbiAgaWYgKHNvcnRSdWxlc0xpc3QubGVuZ3RoID09PSAwKSByZXR1cm4gMDtcblxuICB0cnkge1xuICAgIGZvciAoY29uc3QgcnVsZSBvZiBzb3J0UnVsZXNMaXN0KSB7XG4gICAgICBpZiAoIXJ1bGUpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgdmFsQSA9IGdldEZpZWxkVmFsdWUoYSwgcnVsZS5maWVsZCk7XG4gICAgICBjb25zdCB2YWxCID0gZ2V0RmllbGRWYWx1ZShiLCBydWxlLmZpZWxkKTtcblxuICAgICAgbGV0IHJlc3VsdCA9IDA7XG4gICAgICBpZiAodmFsQSA8IHZhbEIpIHJlc3VsdCA9IC0xO1xuICAgICAgZWxzZSBpZiAodmFsQSA+IHZhbEIpIHJlc3VsdCA9IDE7XG5cbiAgICAgIGlmIChyZXN1bHQgIT09IDApIHtcbiAgICAgICAgcmV0dXJuIHJ1bGUub3JkZXIgPT09IFwiZGVzY1wiID8gLXJlc3VsdCA6IHJlc3VsdDtcbiAgICAgIH1cbiAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgbG9nRXJyb3IoXCJFcnJvciBldmFsdWF0aW5nIHNvcnRpbmcgcnVsZXNcIiwgeyBlcnJvcjogU3RyaW5nKGVycm9yKSB9KTtcbiAgfVxuXG4gIHJldHVybiAwO1xufTtcblxuY29uc3Qgc29ydEdyb3Vwc0lmRW5hYmxlZCA9IGFzeW5jIChcbiAgICB3aW5kb3dJZDogbnVtYmVyLFxuICAgIHNvcnRpbmdQcmVmZXJlbmNlczogc3RyaW5nW10sXG4gICAgdGFic0J5R3JvdXA6IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhW10+XG4pID0+IHtcbiAgICAvLyBDaGVjayBpZiBhbnkgYWN0aXZlIHN0cmF0ZWd5IGhhcyBzb3J0R3JvdXBzOiB0cnVlXG4gICAgY29uc3QgY3VzdG9tU3RyYXRzID0gZ2V0Q3VzdG9tU3RyYXRlZ2llcygpO1xuICAgIGxldCBncm91cFNvcnRlclN0cmF0ZWd5OiBSZXR1cm5UeXBlPHR5cGVvZiBjdXN0b21TdHJhdHMuZmluZD4gfCBudWxsID0gbnVsbDtcblxuICAgIGZvciAoY29uc3QgaWQgb2Ygc29ydGluZ1ByZWZlcmVuY2VzKSB7XG4gICAgICAgIGNvbnN0IHN0cmF0ZWd5ID0gY3VzdG9tU3RyYXRzLmZpbmQocyA9PiBzLmlkID09PSBpZCk7XG4gICAgICAgIGlmIChzdHJhdGVneSAmJiAoc3RyYXRlZ3kuc29ydEdyb3VwcyB8fCAoc3RyYXRlZ3kuZ3JvdXBTb3J0aW5nUnVsZXMgJiYgc3RyYXRlZ3kuZ3JvdXBTb3J0aW5nUnVsZXMubGVuZ3RoID4gMCkpKSB7XG4gICAgICAgICAgICBncm91cFNvcnRlclN0cmF0ZWd5ID0gc3RyYXRlZ3k7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmICghZ3JvdXBTb3J0ZXJTdHJhdGVneSkgcmV0dXJuO1xuXG4gICAgLy8gR2V0IGdyb3VwIGRldGFpbHNcbiAgICBjb25zdCBncm91cHMgPSBhd2FpdCBjaHJvbWUudGFiR3JvdXBzLnF1ZXJ5KHsgd2luZG93SWQgfSk7XG4gICAgaWYgKGdyb3Vwcy5sZW5ndGggPD0gMSkgcmV0dXJuO1xuXG4gICAgLy8gV2Ugc29ydCBncm91cHMgYmFzZWQgb24gdGhlIHN0cmF0ZWd5LlxuICAgIC8vIFNpbmNlIGNvbXBhcmVCeSBleHBlY3RzIFRhYk1ldGFkYXRhLCB3ZSBuZWVkIHRvIGNyZWF0ZSBhIHJlcHJlc2VudGF0aXZlIFRhYk1ldGFkYXRhIGZvciBlYWNoIGdyb3VwLlxuICAgIC8vIFdlJ2xsIHVzZSB0aGUgZmlyc3QgdGFiIG9mIHRoZSBncm91cCAoc29ydGVkKSBhcyB0aGUgcmVwcmVzZW50YXRpdmUuXG5cbiAgICBjb25zdCBncm91cFJlcHM6IHsgZ3JvdXA6IGNocm9tZS50YWJHcm91cHMuVGFiR3JvdXA7IHJlcDogVGFiTWV0YWRhdGEgfVtdID0gW107XG5cbiAgICBmb3IgKGNvbnN0IGdyb3VwIG9mIGdyb3Vwcykge1xuICAgICAgICBjb25zdCB0YWJzID0gdGFic0J5R3JvdXAuZ2V0KGdyb3VwLmlkKTtcbiAgICAgICAgaWYgKHRhYnMgJiYgdGFicy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAvLyB0YWJzIGFyZSBhbHJlYWR5IHNvcnRlZCBieSBzb3J0VGFicyBpbiBwcmV2aW91cyBzdGVwIGlmIHRoYXQgc3RyYXRlZ3kgd2FzIGFwcGxpZWRcbiAgICAgICAgICAgIC8vIG9yIHdlIGp1c3QgdGFrZSB0aGUgZmlyc3Qgb25lLlxuICAgICAgICAgICAgLy8gSWRlYWxseSB3ZSB1c2UgdGhlIFwiYmVzdFwiIHRhYi5cbiAgICAgICAgICAgIC8vIEJ1dCBzaW5jZSB3ZSBhbHJlYWR5IHNvcnRlZCB0YWJzIHdpdGhpbiBncm91cHMsIHRhYnNbMF0gaXMgdGhlIGZpcnN0IG9uZS5cbiAgICAgICAgICAgIGdyb3VwUmVwcy5wdXNoKHsgZ3JvdXAsIHJlcDogdGFic1swXSB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIFNvcnQgdGhlIGdyb3Vwc1xuICAgIGlmIChncm91cFNvcnRlclN0cmF0ZWd5Lmdyb3VwU29ydGluZ1J1bGVzICYmIEFycmF5LmlzQXJyYXkoZ3JvdXBTb3J0ZXJTdHJhdGVneS5ncm91cFNvcnRpbmdSdWxlcykgJiYgZ3JvdXBTb3J0ZXJTdHJhdGVneS5ncm91cFNvcnRpbmdSdWxlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGdyb3VwUmVwcy5zb3J0KChhLCBiKSA9PiBjb21wYXJlQnlTb3J0aW5nUnVsZXMoZ3JvdXBTb3J0ZXJTdHJhdGVneSEuZ3JvdXBTb3J0aW5nUnVsZXMhLCBhLnJlcCwgYi5yZXApKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBncm91cFJlcHMuc29ydCgoYSwgYikgPT4gY29tcGFyZUJ5KGdyb3VwU29ydGVyU3RyYXRlZ3khLmlkLCBhLnJlcCwgYi5yZXApKTtcbiAgICB9XG5cbiAgICAvLyBBcHBseSB0aGUgb3JkZXJcbiAgICAvLyBjaHJvbWUudGFiR3JvdXBzLm1vdmUoZ3JvdXBJZCwgeyBpbmRleDogLi4uIH0pXG4gICAgLy8gV2Ugd2FudCB0aGVtIHRvIGJlIGFmdGVyIHVuZ3JvdXBlZCB0YWJzICh3aGljaCBhcmUgYXQgaW5kZXggMC4uTikuXG4gICAgLy8gQWN0dWFsbHksIGNocm9tZS50YWJHcm91cHMubW92ZSBpbmRleCBpcyB0aGUgdGFiIGluZGV4IHdoZXJlIHRoZSBncm91cCBzdGFydHMuXG4gICAgLy8gSWYgd2Ugd2FudCB0byBzdHJpY3RseSBvcmRlciBncm91cHMsIHdlIHNob3VsZCBjYWxjdWxhdGUgdGhlIHRhcmdldCBpbmRleC5cbiAgICAvLyBCdXQgc2luY2UgZ3JvdXBzIGFyZSBjb250aWd1b3VzIGJsb2NrcyBvZiB0YWJzLCB3ZSBqdXN0IG5lZWQgdG8gcGxhY2UgdGhlbSBpbiBvcmRlci5cblxuICAgIC8vIENhbGN1bGF0ZSB0aGUgc3RhcnRpbmcgaW5kZXggZm9yIGdyb3Vwcy5cbiAgICAvLyBVbmdyb3VwZWQgdGFicyBhcmUgYXQgdGhlIHN0YXJ0IChpbmRleCAwKS5cbiAgICAvLyBTbyB0aGUgZmlyc3QgZ3JvdXAgc2hvdWxkIHN0YXJ0IGFmdGVyIHRoZSBsYXN0IHVuZ3JvdXBlZCB0YWIuXG4gICAgLy8gV2FpdCwgZWFybGllciB3ZSBtb3ZlZCB1bmdyb3VwZWQgdGFicyB0byBpbmRleCAwLlxuICAgIC8vIEJ1dCB3ZSBuZWVkIHRvIGtub3cgaG93IG1hbnkgdW5ncm91cGVkIHRhYnMgdGhlcmUgYXJlIGluIHRoaXMgd2luZG93LlxuXG4gICAgLy8gTGV0J3MgZ2V0IGN1cnJlbnQgdGFicyBhZ2FpbiBvciB0cmFjayBjb3VudD9cbiAgICAvLyBXZSBjYW4gYXNzdW1lIHVuZ3JvdXBlZCB0YWJzIGFyZSBhdCB0aGUgdG9wLlxuICAgIC8vIEJ1dCBgdGFic0J5R3JvdXBgIG9ubHkgY29udGFpbnMgZ3JvdXBlZCB0YWJzLlxuICAgIC8vIFdlIG5lZWQgdG8ga25vdyB3aGVyZSB0byBzdGFydCBwbGFjaW5nIGdyb3Vwcy5cbiAgICAvLyBUaGUgc2FmZXN0IHdheSBpcyB0byBtb3ZlIHRoZW0gb25lIGJ5IG9uZSB0byB0aGUgZW5kIChvciBzcGVjaWZpYyBpbmRleCkuXG5cbiAgICAvLyBJZiB3ZSBqdXN0IG1vdmUgdGhlbSBpbiBvcmRlciB0byBpbmRleCAtMSwgdGhleSB3aWxsIGFwcGVuZCB0byB0aGUgZW5kLlxuICAgIC8vIElmIHdlIHdhbnQgdGhlbSBhZnRlciB1bmdyb3VwZWQgdGFicywgd2UgbmVlZCB0byBmaW5kIHRoZSBpbmRleC5cblxuICAgIC8vIExldCdzIHVzZSBpbmRleCA9IC0xIHRvIHB1c2ggdG8gZW5kLCBzZXF1ZW50aWFsbHkuXG4gICAgLy8gQnV0IHdhaXQsIGlmIHdlIHB1c2ggdG8gZW5kLCB0aGUgb3JkZXIgaXMgcHJlc2VydmVkP1xuICAgIC8vIE5vLCBpZiB3ZSBpdGVyYXRlIHNvcnRlZCBncm91cHMgYW5kIG1vdmUgZWFjaCB0byAtMSwgdGhlIGxhc3Qgb25lIG1vdmVkIHdpbGwgYmUgYXQgdGhlIGVuZC5cbiAgICAvLyBTbyB3ZSBzaG91bGQgaXRlcmF0ZSBpbiBvcmRlciBhbmQgbW92ZSB0byAtMT8gTm8sIHRoYXQgd291bGQgcmV2ZXJzZSB0aGVtIGlmIHdlIGNvbnNpZGVyIFwiZW5kXCIuXG4gICAgLy8gQWN0dWFsbHksIGlmIHdlIG1vdmUgR3JvdXAgQSB0byAtMSwgaXQgZ29lcyB0byBlbmQuIFRoZW4gR3JvdXAgQiB0byAtMSwgaXQgZ29lcyBhZnRlciBBLlxuICAgIC8vIFNvIGl0ZXJhdGluZyBpbiBzb3J0ZWQgb3JkZXIgYW5kIG1vdmluZyB0byAtMSB3b3JrcyB0byBhcnJhbmdlIHRoZW0gYXQgdGhlIGVuZCBvZiB0aGUgd2luZG93LlxuXG4gICAgLy8gSG93ZXZlciwgaWYgdGhlcmUgYXJlIHBpbm5lZCB0YWJzIG9yIHVuZ3JvdXBlZCB0YWJzLCB0aGV5IHNob3VsZCBzdGF5IGF0IHRvcD9cbiAgICAvLyBVbmdyb3VwZWQgdGFicyB3ZXJlIG1vdmVkIHRvIGluZGV4IDAuXG4gICAgLy8gUGlubmVkIHRhYnM6IGBjaHJvbWUudGFicy5tb3ZlYCBoYW5kbGVzIHBpbm5lZCBjb25zdHJhaW50IChwaW5uZWQgdGFicyBtdXN0IGJlIGZpcnN0KS5cbiAgICAvLyBHcm91cHMgY2Fubm90IGNvbnRhaW4gcGlubmVkIHRhYnMuXG4gICAgLy8gU28gZ3JvdXBzIHdpbGwgYmUgYWZ0ZXIgcGlubmVkIHRhYnMuXG4gICAgLy8gSWYgd2UgbW92ZSB0byAtMSwgdGhleSBnbyB0byB0aGUgdmVyeSBlbmQuXG5cbiAgICAvLyBXaGF0IGlmIHdlIHdhbnQgdGhlbSBzcGVjaWZpY2FsbHkgYXJyYW5nZWQ/XG4gICAgLy8gSWYgd2UgbW92ZSB0aGVtIHNlcXVlbnRpYWxseSB0byAtMSwgdGhleSB3aWxsIGJlIG9yZGVyZWQgQSwgQiwgQy4uLiBhdCB0aGUgYm90dG9tLlxuICAgIC8vIFRoaXMgc2VlbXMgY29ycmVjdCBmb3IgXCJzb3J0aW5nIGdyb3Vwc1wiLlxuXG4gICAgZm9yIChjb25zdCBpdGVtIG9mIGdyb3VwUmVwcykge1xuICAgICAgICBhd2FpdCBjaHJvbWUudGFiR3JvdXBzLm1vdmUoaXRlbS5ncm91cC5pZCwgeyBpbmRleDogLTEgfSk7XG4gICAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGNsb3NlR3JvdXAgPSBhc3luYyAoZ3JvdXA6IFRhYkdyb3VwKSA9PiB7XG4gIGNvbnN0IGlkcyA9IGdyb3VwLnRhYnMubWFwKCh0YWIpID0+IHRhYi5pZCk7XG4gIGF3YWl0IGNocm9tZS50YWJzLnJlbW92ZShpZHMpO1xuICBsb2dJbmZvKFwiQ2xvc2VkIGdyb3VwXCIsIHsgbGFiZWw6IGdyb3VwLmxhYmVsLCBjb3VudDogaWRzLmxlbmd0aCB9KTtcbn07XG5cbmNvbnN0IGdldFRhYnNCeUlkcyA9IGFzeW5jICh0YWJJZHM6IG51bWJlcltdKTogUHJvbWlzZTxjaHJvbWUudGFicy5UYWJbXT4gPT4ge1xuICBpZiAoIXRhYklkcy5sZW5ndGgpIHJldHVybiBbXTtcbiAgY29uc3QgYWxsVGFicyA9IGF3YWl0IGNocm9tZS50YWJzLnF1ZXJ5KHt9KTtcbiAgY29uc3QgdGFiTWFwID0gbmV3IE1hcChhbGxUYWJzLm1hcCh0ID0+IFt0LmlkLCB0XSkpO1xuICByZXR1cm4gdGFiSWRzXG4gICAgLm1hcChpZCA9PiB0YWJNYXAuZ2V0KGlkKSlcbiAgICAuZmlsdGVyKCh0KTogdCBpcyBjaHJvbWUudGFicy5UYWIgPT4gdCAhPT0gdW5kZWZpbmVkICYmIHQuaWQgIT09IHVuZGVmaW5lZCAmJiB0LndpbmRvd0lkICE9PSB1bmRlZmluZWQpO1xufTtcblxuZXhwb3J0IGNvbnN0IG1lcmdlVGFicyA9IGFzeW5jICh0YWJJZHM6IG51bWJlcltdKSA9PiB7XG4gIGlmICghdGFiSWRzLmxlbmd0aCkgcmV0dXJuO1xuICBjb25zdCB2YWxpZFRhYnMgPSBhd2FpdCBnZXRUYWJzQnlJZHModGFiSWRzKTtcblxuICBpZiAodmFsaWRUYWJzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuXG4gIC8vIFRhcmdldCBXaW5kb3c6IFRoZSBvbmUgd2l0aCB0aGUgbW9zdCBzZWxlY3RlZCB0YWJzLCBvciB0aGUgZmlyc3Qgb25lLlxuICAvLyBVc2luZyB0aGUgZmlyc3QgdGFiJ3Mgd2luZG93IGFzIHRoZSB0YXJnZXQuXG4gIGNvbnN0IHRhcmdldFdpbmRvd0lkID0gdmFsaWRUYWJzWzBdLndpbmRvd0lkO1xuXG4gIC8vIDEuIE1vdmUgdGFicyB0byB0YXJnZXQgd2luZG93XG4gIGNvbnN0IHRhYnNUb01vdmUgPSB2YWxpZFRhYnMuZmlsdGVyKHQgPT4gdC53aW5kb3dJZCAhPT0gdGFyZ2V0V2luZG93SWQpO1xuICBpZiAodGFic1RvTW92ZS5sZW5ndGggPiAwKSB7XG4gICAgY29uc3QgbW92ZUlkcyA9IHRhYnNUb01vdmUubWFwKHQgPT4gdC5pZCEpO1xuICAgIGF3YWl0IGNocm9tZS50YWJzLm1vdmUobW92ZUlkcywgeyB3aW5kb3dJZDogdGFyZ2V0V2luZG93SWQsIGluZGV4OiAtMSB9KTtcbiAgfVxuXG4gIC8vIDIuIEdyb3VwIHRoZW1cbiAgLy8gQ2hlY2sgaWYgdGhlcmUgaXMgYW4gZXhpc3RpbmcgZ3JvdXAgaW4gdGhlIHRhcmdldCB3aW5kb3cgdGhhdCB3YXMgcGFydCBvZiB0aGUgc2VsZWN0aW9uLlxuICAvLyBXZSBwcmlvcml0aXplIHRoZSBncm91cCBvZiB0aGUgZmlyc3QgdGFiIGlmIGl0IGhhcyBvbmUuXG4gIGNvbnN0IGZpcnN0VGFiR3JvdXBJZCA9IHZhbGlkVGFic1swXS5ncm91cElkO1xuICBsZXQgdGFyZ2V0R3JvdXBJZDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG4gIGlmIChmaXJzdFRhYkdyb3VwSWQgJiYgZmlyc3RUYWJHcm91cElkICE9PSAtMSkge1xuICAgICAgLy8gVmVyaWZ5IHRoZSBncm91cCBpcyBpbiB0aGUgdGFyZ2V0IHdpbmRvdyAoaXQgc2hvdWxkIGJlLCBhcyB3ZSBwaWNrZWQgdGFyZ2V0V2luZG93SWQgZnJvbSB2YWxpZFRhYnNbMF0pXG4gICAgICAvLyBCdXQgaWYgdmFsaWRUYWJzWzBdIHdhcyBtb3ZlZCAoaXQgd2Fzbid0LCBhcyBpdCBkZWZpbmVkIHRoZSB0YXJnZXQpLCBpdCdzIGZpbmUuXG4gICAgICB0YXJnZXRHcm91cElkID0gZmlyc3RUYWJHcm91cElkO1xuICB9IGVsc2Uge1xuICAgICAgLy8gTG9vayBmb3IgYW55IG90aGVyIGdyb3VwIGluIHRoZSBzZWxlY3Rpb24gdGhhdCBpcyBpbiB0aGUgdGFyZ2V0IHdpbmRvd1xuICAgICAgY29uc3Qgb3RoZXJHcm91cCA9IHZhbGlkVGFicy5maW5kKHQgPT4gdC53aW5kb3dJZCA9PT0gdGFyZ2V0V2luZG93SWQgJiYgdC5ncm91cElkICE9PSAtMSk7XG4gICAgICBpZiAob3RoZXJHcm91cCkge1xuICAgICAgICAgIHRhcmdldEdyb3VwSWQgPSBvdGhlckdyb3VwLmdyb3VwSWQ7XG4gICAgICB9XG4gIH1cblxuICBjb25zdCBpZHMgPSB2YWxpZFRhYnMubWFwKHQgPT4gdC5pZCEpO1xuICBhd2FpdCBjaHJvbWUudGFicy5ncm91cCh7IHRhYklkczogaWRzLCBncm91cElkOiB0YXJnZXRHcm91cElkIH0pO1xuICBsb2dJbmZvKFwiTWVyZ2VkIHRhYnNcIiwgeyBjb3VudDogaWRzLmxlbmd0aCwgdGFyZ2V0V2luZG93SWQsIHRhcmdldEdyb3VwSWQgfSk7XG59O1xuXG5leHBvcnQgY29uc3Qgc3BsaXRUYWJzID0gYXN5bmMgKHRhYklkczogbnVtYmVyW10pID0+IHtcbiAgaWYgKHRhYklkcy5sZW5ndGggPT09IDApIHJldHVybjtcblxuICAvLyAxLiBWYWxpZGF0ZSB0YWJzXG4gIGNvbnN0IHZhbGlkVGFicyA9IGF3YWl0IGdldFRhYnNCeUlkcyh0YWJJZHMpO1xuXG4gIGlmICh2YWxpZFRhYnMubGVuZ3RoID09PSAwKSByZXR1cm47XG5cbiAgLy8gMi4gQ3JlYXRlIG5ldyB3aW5kb3cgd2l0aCB0aGUgZmlyc3QgdGFiXG4gIGNvbnN0IGZpcnN0VGFiID0gdmFsaWRUYWJzWzBdO1xuICBjb25zdCBuZXdXaW5kb3cgPSBhd2FpdCBjaHJvbWUud2luZG93cy5jcmVhdGUoeyB0YWJJZDogZmlyc3RUYWIuaWQgfSk7XG5cbiAgLy8gMy4gTW92ZSByZW1haW5pbmcgdGFicyB0byBuZXcgd2luZG93XG4gIGlmICh2YWxpZFRhYnMubGVuZ3RoID4gMSkge1xuICAgIGNvbnN0IHJlbWFpbmluZ1RhYklkcyA9IHZhbGlkVGFicy5zbGljZSgxKS5tYXAodCA9PiB0LmlkISk7XG4gICAgYXdhaXQgY2hyb21lLnRhYnMubW92ZShyZW1haW5pbmdUYWJJZHMsIHsgd2luZG93SWQ6IG5ld1dpbmRvdy5pZCEsIGluZGV4OiAtMSB9KTtcbiAgfVxuXG4gIGxvZ0luZm8oXCJTcGxpdCB0YWJzIHRvIG5ldyB3aW5kb3dcIiwgeyBjb3VudDogdmFsaWRUYWJzLmxlbmd0aCwgbmV3V2luZG93SWQ6IG5ld1dpbmRvdy5pZCB9KTtcbn07XG4iLCAiaW1wb3J0IHsgVW5kb1N0YXRlLCBTYXZlZFN0YXRlLCBXaW5kb3dTdGF0ZSwgU3RvcmVkVGFiU3RhdGUgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBnZXRTdG9yZWRWYWx1ZSwgc2V0U3RvcmVkVmFsdWUgfSBmcm9tIFwiLi9zdG9yYWdlLmpzXCI7XG5pbXBvcnQgeyBsb2dJbmZvLCBsb2dFcnJvciB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5cbmNvbnN0IE1BWF9VTkRPX1NUQUNLID0gMTA7XG5jb25zdCBVTkRPX1NUQUNLX0tFWSA9IFwidW5kb1N0YWNrXCI7XG5jb25zdCBTQVZFRF9TVEFURVNfS0VZID0gXCJzYXZlZFN0YXRlc1wiO1xuXG5leHBvcnQgY29uc3QgY2FwdHVyZUN1cnJlbnRTdGF0ZSA9IGFzeW5jICgpOiBQcm9taXNlPFVuZG9TdGF0ZT4gPT4ge1xuICBjb25zdCB3aW5kb3dzID0gYXdhaXQgY2hyb21lLndpbmRvd3MuZ2V0QWxsKHsgcG9wdWxhdGU6IHRydWUgfSk7XG4gIGNvbnN0IHdpbmRvd1N0YXRlczogV2luZG93U3RhdGVbXSA9IFtdO1xuXG4gIGZvciAoY29uc3Qgd2luIG9mIHdpbmRvd3MpIHtcbiAgICBpZiAoIXdpbi50YWJzKSBjb250aW51ZTtcbiAgICBjb25zdCB0YWJTdGF0ZXM6IFN0b3JlZFRhYlN0YXRlW10gPSB3aW4udGFicy5tYXAoKHRhYikgPT4ge1xuICAgICAgbGV0IGdyb3VwVGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgIGxldCBncm91cENvbG9yOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICAvLyBOb3RlOiB0YWIuZ3JvdXBJZCBpcyAtMSBpZiBub3QgZ3JvdXBlZC5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIGlkOiB0YWIuaWQsXG4gICAgICAgIHVybDogdGFiLnVybCB8fCBcIlwiLFxuICAgICAgICBwaW5uZWQ6IEJvb2xlYW4odGFiLnBpbm5lZCksXG4gICAgICAgIGdyb3VwSWQ6IHRhYi5ncm91cElkLFxuICAgICAgICBncm91cFRpdGxlLCAvLyBXaWxsIG5lZWQgdG8gZmV0Y2ggaWYgZ3JvdXBlZFxuICAgICAgICBncm91cENvbG9yLFxuICAgICAgfTtcbiAgICB9KTtcblxuICAgIC8vIFBvcHVsYXRlIGdyb3VwIGluZm8gaWYgbmVlZGVkXG4gICAgLy8gV2UgZG8gdGhpcyBpbiBhIHNlY29uZCBwYXNzIHRvIGJhdGNoIG9yIGp1c3QgaW5kaXZpZHVhbGx5IGlmIG5lZWRlZC5cbiAgICAvLyBBY3R1YWxseSwgd2UgY2FuIGdldCBncm91cCBpbmZvIGZyb20gY2hyb21lLnRhYkdyb3Vwcy5cbiAgICAvLyBIb3dldmVyLCB0aGUgdGFiIG9iamVjdCBkb2Vzbid0IGhhdmUgdGhlIGdyb3VwIHRpdGxlIGRpcmVjdGx5LlxuXG4gICAgLy8gT3B0aW1pemF0aW9uOiBHZXQgYWxsIGdyb3VwcyBmaXJzdC5cblxuICAgIHdpbmRvd1N0YXRlcy5wdXNoKHsgdGFiczogdGFiU3RhdGVzIH0pO1xuICB9XG5cbiAgLy8gRW5yaWNoIHdpdGggZ3JvdXAgaW5mb1xuICBjb25zdCBhbGxHcm91cHMgPSBhd2FpdCBjaHJvbWUudGFiR3JvdXBzLnF1ZXJ5KHt9KTtcbiAgY29uc3QgZ3JvdXBNYXAgPSBuZXcgTWFwKGFsbEdyb3Vwcy5tYXAoZyA9PiBbZy5pZCwgZ10pKTtcblxuICBmb3IgKGNvbnN0IHdpbiBvZiB3aW5kb3dTdGF0ZXMpIHtcbiAgICBmb3IgKGNvbnN0IHRhYiBvZiB3aW4udGFicykge1xuICAgICAgaWYgKHRhYi5ncm91cElkICYmIHRhYi5ncm91cElkICE9PSBjaHJvbWUudGFiR3JvdXBzLlRBQl9HUk9VUF9JRF9OT05FKSB7XG4gICAgICAgIGNvbnN0IGcgPSBncm91cE1hcC5nZXQodGFiLmdyb3VwSWQpO1xuICAgICAgICBpZiAoZykge1xuICAgICAgICAgIHRhYi5ncm91cFRpdGxlID0gZy50aXRsZTtcbiAgICAgICAgICB0YWIuZ3JvdXBDb2xvciA9IGcuY29sb3I7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcbiAgICB3aW5kb3dzOiB3aW5kb3dTdGF0ZXMsXG4gIH07XG59O1xuXG5leHBvcnQgY29uc3QgcHVzaFVuZG9TdGF0ZSA9IGFzeW5jICgpID0+IHtcbiAgY29uc3Qgc3RhdGUgPSBhd2FpdCBjYXB0dXJlQ3VycmVudFN0YXRlKCk7XG4gIGNvbnN0IHN0YWNrID0gKGF3YWl0IGdldFN0b3JlZFZhbHVlPFVuZG9TdGF0ZVtdPihVTkRPX1NUQUNLX0tFWSkpIHx8IFtdO1xuICBzdGFjay5wdXNoKHN0YXRlKTtcbiAgaWYgKHN0YWNrLmxlbmd0aCA+IE1BWF9VTkRPX1NUQUNLKSB7XG4gICAgc3RhY2suc2hpZnQoKTtcbiAgfVxuICBhd2FpdCBzZXRTdG9yZWRWYWx1ZShVTkRPX1NUQUNLX0tFWSwgc3RhY2spO1xuICBsb2dJbmZvKFwiUHVzaGVkIHVuZG8gc3RhdGVcIiwgeyBzdGFja1NpemU6IHN0YWNrLmxlbmd0aCB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBzYXZlU3RhdGUgPSBhc3luYyAobmFtZTogc3RyaW5nKSA9PiB7XG4gIGNvbnN0IHVuZG9TdGF0ZSA9IGF3YWl0IGNhcHR1cmVDdXJyZW50U3RhdGUoKTtcbiAgY29uc3Qgc2F2ZWRTdGF0ZTogU2F2ZWRTdGF0ZSA9IHtcbiAgICBuYW1lLFxuICAgIHRpbWVzdGFtcDogdW5kb1N0YXRlLnRpbWVzdGFtcCxcbiAgICB3aW5kb3dzOiB1bmRvU3RhdGUud2luZG93cyxcbiAgfTtcbiAgY29uc3Qgc2F2ZWRTdGF0ZXMgPSAoYXdhaXQgZ2V0U3RvcmVkVmFsdWU8U2F2ZWRTdGF0ZVtdPihTQVZFRF9TVEFURVNfS0VZKSkgfHwgW107XG4gIHNhdmVkU3RhdGVzLnB1c2goc2F2ZWRTdGF0ZSk7XG4gIGF3YWl0IHNldFN0b3JlZFZhbHVlKFNBVkVEX1NUQVRFU19LRVksIHNhdmVkU3RhdGVzKTtcbiAgbG9nSW5mbyhcIlNhdmVkIHN0YXRlXCIsIHsgbmFtZSB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRTYXZlZFN0YXRlcyA9IGFzeW5jICgpOiBQcm9taXNlPFNhdmVkU3RhdGVbXT4gPT4ge1xuICByZXR1cm4gKGF3YWl0IGdldFN0b3JlZFZhbHVlPFNhdmVkU3RhdGVbXT4oU0FWRURfU1RBVEVTX0tFWSkpIHx8IFtdO1xufTtcblxuZXhwb3J0IGNvbnN0IGRlbGV0ZVNhdmVkU3RhdGUgPSBhc3luYyAobmFtZTogc3RyaW5nKSA9PiB7XG4gIGxldCBzYXZlZFN0YXRlcyA9IChhd2FpdCBnZXRTdG9yZWRWYWx1ZTxTYXZlZFN0YXRlW10+KFNBVkVEX1NUQVRFU19LRVkpKSB8fCBbXTtcbiAgc2F2ZWRTdGF0ZXMgPSBzYXZlZFN0YXRlcy5maWx0ZXIocyA9PiBzLm5hbWUgIT09IG5hbWUpO1xuICBhd2FpdCBzZXRTdG9yZWRWYWx1ZShTQVZFRF9TVEFURVNfS0VZLCBzYXZlZFN0YXRlcyk7XG4gIGxvZ0luZm8oXCJEZWxldGVkIHNhdmVkIHN0YXRlXCIsIHsgbmFtZSB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCB1bmRvID0gYXN5bmMgKCkgPT4ge1xuICBjb25zdCBzdGFjayA9IChhd2FpdCBnZXRTdG9yZWRWYWx1ZTxVbmRvU3RhdGVbXT4oVU5ET19TVEFDS19LRVkpKSB8fCBbXTtcbiAgY29uc3Qgc3RhdGUgPSBzdGFjay5wb3AoKTtcbiAgaWYgKCFzdGF0ZSkge1xuICAgIGxvZ0luZm8oXCJVbmRvIHN0YWNrIGVtcHR5XCIpO1xuICAgIHJldHVybjtcbiAgfVxuICBhd2FpdCBzZXRTdG9yZWRWYWx1ZShVTkRPX1NUQUNLX0tFWSwgc3RhY2spO1xuICBhd2FpdCByZXN0b3JlU3RhdGUoc3RhdGUpO1xuICBsb2dJbmZvKFwiVW5kaWQgbGFzdCBhY3Rpb25cIik7XG59O1xuXG5leHBvcnQgY29uc3QgcmVzdG9yZVN0YXRlID0gYXN5bmMgKHN0YXRlOiBVbmRvU3RhdGUgfCBTYXZlZFN0YXRlKSA9PiB7XG4gIC8vIFN0cmF0ZWd5OlxuICAvLyAxLiBVbmdyb3VwIGFsbCB0YWJzIChvcHRpb25hbCwgYnV0IGNsZWFuZXIpLlxuICAvLyAyLiBNb3ZlIHRhYnMgdG8gY29ycmVjdCB3aW5kb3dzIGFuZCBpbmRpY2VzLlxuICAvLyAzLiBSZS1ncm91cCB0YWJzLlxuXG4gIC8vIFdlIG5lZWQgdG8gbWF0Y2ggY3VycmVudCB0YWJzIHRvIHN0b3JlZCB0YWJzLlxuICAvLyBQcmlvcml0eTogSUQgbWF0Y2ggLT4gVVJMIG1hdGNoLlxuXG4gIGNvbnN0IGN1cnJlbnRUYWJzID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoe30pO1xuICBjb25zdCBjdXJyZW50VGFiTWFwID0gbmV3IE1hcDxudW1iZXIsIGNocm9tZS50YWJzLlRhYj4oKTtcbiAgY29uc3QgY3VycmVudFVybE1hcCA9IG5ldyBNYXA8c3RyaW5nLCBjaHJvbWUudGFicy5UYWJbXT4oKTsgLy8gVVJMIC0+IGxpc3Qgb2YgdGFic1xuXG4gIGN1cnJlbnRUYWJzLmZvckVhY2godCA9PiB7XG4gICAgaWYgKHQuaWQpIGN1cnJlbnRUYWJNYXAuc2V0KHQuaWQsIHQpO1xuICAgIGlmICh0LnVybCkge1xuICAgICAgY29uc3QgbGlzdCA9IGN1cnJlbnRVcmxNYXAuZ2V0KHQudXJsKSB8fCBbXTtcbiAgICAgIGxpc3QucHVzaCh0KTtcbiAgICAgIGN1cnJlbnRVcmxNYXAuc2V0KHQudXJsLCBsaXN0KTtcbiAgICB9XG4gIH0pO1xuXG4gIC8vIEhlbHBlciB0byBmaW5kIGEgdGFiIChhc3luYyB0byBhbGxvdyBjcmVhdGlvbilcbiAgY29uc3QgZmluZE9yQ3JlYXRlVGFiID0gYXN5bmMgKHN0b3JlZDogU3RvcmVkVGFiU3RhdGUpOiBQcm9taXNlPGNocm9tZS50YWJzLlRhYiB8IHVuZGVmaW5lZD4gPT4ge1xuICAgIC8vIFRyeSBJRFxuICAgIGlmIChzdG9yZWQuaWQgJiYgY3VycmVudFRhYk1hcC5oYXMoc3RvcmVkLmlkKSkge1xuICAgICAgY29uc3QgdCA9IGN1cnJlbnRUYWJNYXAuZ2V0KHN0b3JlZC5pZCk7XG4gICAgICBjdXJyZW50VGFiTWFwLmRlbGV0ZShzdG9yZWQuaWQhKTsgLy8gQ29uc3VtZVxuICAgICAgLy8gQWxzbyByZW1vdmUgZnJvbSB1cmwgbWFwIHRvIGF2b2lkIGRvdWJsZSB1c2FnZVxuICAgICAgaWYgKHQ/LnVybCkge1xuICAgICAgICAgY29uc3QgbGlzdCA9IGN1cnJlbnRVcmxNYXAuZ2V0KHQudXJsKTtcbiAgICAgICAgIGlmIChsaXN0KSB7XG4gICAgICAgICAgICBjb25zdCBpZHggPSBsaXN0LmZpbmRJbmRleCh4ID0+IHguaWQgPT09IHQuaWQpO1xuICAgICAgICAgICAgaWYgKGlkeCAhPT0gLTEpIGxpc3Quc3BsaWNlKGlkeCwgMSk7XG4gICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gdDtcbiAgICB9XG4gICAgLy8gVHJ5IFVSTFxuICAgIGNvbnN0IGxpc3QgPSBjdXJyZW50VXJsTWFwLmdldChzdG9yZWQudXJsKTtcbiAgICBpZiAobGlzdCAmJiBsaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnN0IHQgPSBsaXN0LnNoaWZ0KCk7XG4gICAgICBpZiAodD8uaWQpIGN1cnJlbnRUYWJNYXAuZGVsZXRlKHQuaWQpOyAvLyBDb25zdW1lXG4gICAgICByZXR1cm4gdDtcbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgaWYgbWlzc2luZ1xuICAgIGlmIChzdG9yZWQudXJsKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB0ID0gYXdhaXQgY2hyb21lLnRhYnMuY3JlYXRlKHsgdXJsOiBzdG9yZWQudXJsLCBhY3RpdmU6IGZhbHNlIH0pO1xuICAgICAgICAgICAgcmV0dXJuIHQ7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGxvZ0Vycm9yKFwiRmFpbGVkIHRvIGNyZWF0ZSB0YWJcIiwgeyB1cmw6IHN0b3JlZC51cmwsIGVycm9yOiBlIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfTtcblxuICAvLyBXZSBuZWVkIHRvIHJlY29uc3RydWN0IHdpbmRvd3MuXG4gIC8vIElkZWFsbHksIHdlIG1hcCBzdGF0ZSB3aW5kb3dzIHRvIGN1cnJlbnQgd2luZG93cy5cbiAgLy8gQnV0IHN0cmljdGx5LCB3ZSBjYW4ganVzdCBtb3ZlIHRhYnMuXG5cbiAgLy8gRm9yIHNpbXBsaWNpdHksIGxldCdzIGFzc3VtZSB3ZSB1c2UgZXhpc3Rpbmcgd2luZG93cyBhcyBtdWNoIGFzIHBvc3NpYmxlLlxuICAvLyBPciBjcmVhdGUgbmV3IG9uZXMgaWYgd2UgcnVuIG91dD9cbiAgLy8gTGV0J3MgaXRlcmF0ZSBzdG9yZWQgd2luZG93cy5cblxuICBjb25zdCBjdXJyZW50V2luZG93cyA9IGF3YWl0IGNocm9tZS53aW5kb3dzLmdldEFsbCgpO1xuXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgc3RhdGUud2luZG93cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHdpblN0YXRlID0gc3RhdGUud2luZG93c1tpXTtcblxuICAgIC8vIElkZW50aWZ5IGFsbCB0YWJzIGZvciB0aGlzIHdpbmRvdyBmaXJzdC5cbiAgICAvLyBXZSBkbyB0aGlzIEJFRk9SRSBjcmVhdGluZyBhIHdpbmRvdyB0byBhdm9pZCBjcmVhdGluZyBlbXB0eSB3aW5kb3dzLlxuICAgIGNvbnN0IHRhYnNUb01vdmU6IHsgdGFiSWQ6IG51bWJlciwgc3RvcmVkOiBTdG9yZWRUYWJTdGF0ZSB9W10gPSBbXTtcblxuICAgIGZvciAoY29uc3Qgc3RvcmVkVGFiIG9mIHdpblN0YXRlLnRhYnMpIHtcbiAgICAgIGNvbnN0IGZvdW5kID0gYXdhaXQgZmluZE9yQ3JlYXRlVGFiKHN0b3JlZFRhYik7XG4gICAgICBpZiAoZm91bmQgJiYgZm91bmQuaWQpIHtcbiAgICAgICAgdGFic1RvTW92ZS5wdXNoKHsgdGFiSWQ6IGZvdW5kLmlkLCBzdG9yZWQ6IHN0b3JlZFRhYiB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAodGFic1RvTW92ZS5sZW5ndGggPT09IDApIGNvbnRpbnVlO1xuXG4gICAgbGV0IHRhcmdldFdpbmRvd0lkOiBudW1iZXI7XG5cbiAgICBpZiAoaSA8IGN1cnJlbnRXaW5kb3dzLmxlbmd0aCkge1xuICAgICAgdGFyZ2V0V2luZG93SWQgPSBjdXJyZW50V2luZG93c1tpXS5pZCE7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIENyZWF0ZSBuZXcgd2luZG93XG4gICAgICBjb25zdCB3aW4gPSBhd2FpdCBjaHJvbWUud2luZG93cy5jcmVhdGUoe30pO1xuICAgICAgdGFyZ2V0V2luZG93SWQgPSB3aW4uaWQhO1xuICAgICAgLy8gTm90ZTogTmV3IHdpbmRvdyBjcmVhdGlvbiBhZGRzIGEgdGFiLiBXZSBtaWdodCB3YW50IHRvIHJlbW92ZSBpdCBsYXRlciBvciBpZ25vcmUgaXQuXG4gICAgfVxuXG4gICAgY29uc3QgdGFiSWRzID0gdGFic1RvTW92ZS5tYXAodCA9PiB0LnRhYklkKTtcblxuICAgIC8vIE1vdmUgYWxsIHRvIHdpbmRvdy5cbiAgICAvLyBOb3RlOiBJZiB3ZSBtb3ZlIHRvIGluZGV4IDAsIHRoZXkgd2lsbCBiZSBwcmVwZW5kZWQuXG4gICAgLy8gV2Ugc2hvdWxkIHByb2JhYmx5IGp1c3QgbW92ZSB0aGVtIHRvIHRoZSB3aW5kb3cgZmlyc3QuXG4gICAgLy8gSWYgd2UgbW92ZSB0aGVtIGluZGl2aWR1YWxseSB0byBjb3JyZWN0IGluZGV4LCBpdCdzIHNhZmVyLlxuXG4gICAgZm9yIChsZXQgaiA9IDA7IGogPCB0YWJzVG9Nb3ZlLmxlbmd0aDsgaisrKSB7XG4gICAgICBjb25zdCB7IHRhYklkLCBzdG9yZWQgfSA9IHRhYnNUb01vdmVbal07XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBjaHJvbWUudGFicy5tb3ZlKHRhYklkLCB7IHdpbmRvd0lkOiB0YXJnZXRXaW5kb3dJZCwgaW5kZXg6IGogfSk7XG4gICAgICAgIGlmIChzdG9yZWQucGlubmVkKSB7XG4gICAgICAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMudXBkYXRlKHRhYklkLCB7IHBpbm5lZDogdHJ1ZSB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAvLyBJZiBjdXJyZW50bHkgcGlubmVkIGJ1dCBzaG91bGRuJ3QgYmVcbiAgICAgICAgICAgICBjb25zdCBjdXJyZW50ID0gYXdhaXQgY2hyb21lLnRhYnMuZ2V0KHRhYklkKTtcbiAgICAgICAgICAgICBpZiAoY3VycmVudC5waW5uZWQpIGF3YWl0IGNocm9tZS50YWJzLnVwZGF0ZSh0YWJJZCwgeyBwaW5uZWQ6IGZhbHNlIH0pO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGxvZ0Vycm9yKFwiRmFpbGVkIHRvIG1vdmUgdGFiXCIsIHsgdGFiSWQsIGVycm9yOiBlIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEhhbmRsZSBHcm91cHNcbiAgICAvLyBJZGVudGlmeSBncm91cHMgaW4gdGhpcyB3aW5kb3dcbiAgICBjb25zdCBncm91cHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyW10+KCk7IC8vIHRpdGxlK2NvbG9yIC0+IHRhYklkc1xuICAgIGNvbnN0IGdyb3VwQ29sb3JzID0gbmV3IE1hcDxzdHJpbmcsIGNocm9tZS50YWJHcm91cHMuQ29sb3JFbnVtPigpO1xuXG4gICAgZm9yIChjb25zdCBpdGVtIG9mIHRhYnNUb01vdmUpIHtcbiAgICAgIGlmIChpdGVtLnN0b3JlZC5ncm91cFRpdGxlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgLy8gVXNlIHRpdGxlIGFzIGtleSAob3IgdW5pcXVlIElEIGlmIHdlIGhhZCBvbmUsIGJ1dCB3ZSBkb24ndCBwZXJzaXN0IGdyb3VwIElEcylcbiAgICAgICAgLy8gR3JvdXAgSUQgaW4gc3RvcmFnZSBpcyBlcGhlbWVyYWwuIFRpdGxlIGlzIGtleS5cbiAgICAgICAgY29uc3Qga2V5ID0gaXRlbS5zdG9yZWQuZ3JvdXBUaXRsZTtcbiAgICAgICAgY29uc3QgbGlzdCA9IGdyb3Vwcy5nZXQoa2V5KSB8fCBbXTtcbiAgICAgICAgbGlzdC5wdXNoKGl0ZW0udGFiSWQpO1xuICAgICAgICBncm91cHMuc2V0KGtleSwgbGlzdCk7XG4gICAgICAgIGlmIChpdGVtLnN0b3JlZC5ncm91cENvbG9yKSB7XG4gICAgICAgICAgICAgZ3JvdXBDb2xvcnMuc2V0KGtleSwgaXRlbS5zdG9yZWQuZ3JvdXBDb2xvciBhcyBjaHJvbWUudGFiR3JvdXBzLkNvbG9yRW51bSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgICAvLyBVbmdyb3VwIGlmIG5lZWRlZFxuICAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMudW5ncm91cChpdGVtLnRhYklkKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IFt0aXRsZSwgaWRzXSBvZiBncm91cHMuZW50cmllcygpKSB7XG4gICAgICBpZiAoaWRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29uc3QgZ3JvdXBJZCA9IGF3YWl0IGNocm9tZS50YWJzLmdyb3VwKHsgdGFiSWRzOiBpZHMgfSk7XG4gICAgICAgIGF3YWl0IGNocm9tZS50YWJHcm91cHMudXBkYXRlKGdyb3VwSWQsIHtcbiAgICAgICAgICAgICB0aXRsZTogdGl0bGUsXG4gICAgICAgICAgICAgY29sb3I6IGdyb3VwQ29sb3JzLmdldCh0aXRsZSkgfHwgXCJncmV5XCJcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuIiwgImltcG9ydCB7IGFwcGx5VGFiR3JvdXBzLCBhcHBseVRhYlNvcnRpbmcsIGNhbGN1bGF0ZVRhYkdyb3VwcywgZmV0Y2hDdXJyZW50VGFiR3JvdXBzLCBtZXJnZVRhYnMsIHNwbGl0VGFicyB9IGZyb20gXCIuL3RhYk1hbmFnZXIuanNcIjtcbmltcG9ydCB7IGxvYWRQcmVmZXJlbmNlcywgc2F2ZVByZWZlcmVuY2VzIH0gZnJvbSBcIi4vcHJlZmVyZW5jZXMuanNcIjtcbmltcG9ydCB7IHNldEN1c3RvbVN0cmF0ZWdpZXMgfSBmcm9tIFwiLi9ncm91cGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnLCBsb2dJbmZvLCBnZXRMb2dzLCBjbGVhckxvZ3MsIHNldExvZ2dlclByZWZlcmVuY2VzLCBpbml0TG9nZ2VyLCBhZGRMb2dFbnRyeSwgbG9nZ2VyUmVhZHkgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgcHVzaFVuZG9TdGF0ZSwgc2F2ZVN0YXRlLCB1bmRvLCBnZXRTYXZlZFN0YXRlcywgZGVsZXRlU2F2ZWRTdGF0ZSwgcmVzdG9yZVN0YXRlIH0gZnJvbSBcIi4vc3RhdGVNYW5hZ2VyLmpzXCI7XG5pbXBvcnQge1xuICBBcHBseUdyb3VwaW5nUGF5bG9hZCxcbiAgR3JvdXBpbmdTZWxlY3Rpb24sXG4gIEdyb3VwaW5nU3RyYXRlZ3ksXG4gIFByZWZlcmVuY2VzLFxuICBSdW50aW1lTWVzc2FnZSxcbiAgUnVudGltZVJlc3BvbnNlLFxuICBTb3J0aW5nU3RyYXRlZ3ksXG4gIFRhYkdyb3VwXG59IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcblxuY2hyb21lLnJ1bnRpbWUub25JbnN0YWxsZWQuYWRkTGlzdGVuZXIoYXN5bmMgKCkgPT4ge1xuICBjb25zdCBwcmVmcyA9IGF3YWl0IGxvYWRQcmVmZXJlbmNlcygpO1xuICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuICBsb2dJbmZvKFwiRXh0ZW5zaW9uIGluc3RhbGxlZFwiLCB7XG4gICAgdmVyc2lvbjogY2hyb21lLnJ1bnRpbWUuZ2V0TWFuaWZlc3QoKS52ZXJzaW9uLFxuICAgIGxvZ0xldmVsOiBwcmVmcy5sb2dMZXZlbCxcbiAgICBzdHJhdGVnaWVzQ291bnQ6IHByZWZzLmN1c3RvbVN0cmF0ZWdpZXM/Lmxlbmd0aCB8fCAwXG4gIH0pO1xufSk7XG5cbi8vIEluaXRpYWxpemUgbG9nZ2VyIG9uIHN0YXJ0dXBcbmxvYWRQcmVmZXJlbmNlcygpLnRoZW4oYXN5bmMgKHByZWZzKSA9PiB7XG4gICAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhwcmVmcy5jdXN0b21TdHJhdGVnaWVzIHx8IFtdKTtcbiAgICBhd2FpdCBpbml0TG9nZ2VyKCk7XG4gICAgbG9nSW5mbyhcIlNlcnZpY2UgV29ya2VyIEluaXRpYWxpemVkXCIsIHtcbiAgICAgICAgdmVyc2lvbjogY2hyb21lLnJ1bnRpbWUuZ2V0TWFuaWZlc3QoKS52ZXJzaW9uLFxuICAgICAgICBsb2dMZXZlbDogcHJlZnMubG9nTGV2ZWxcbiAgICB9KTtcbn0pO1xuXG5jb25zdCBoYW5kbGVNZXNzYWdlID0gYXN5bmMgPFREYXRhPihcbiAgbWVzc2FnZTogUnVudGltZU1lc3NhZ2UsXG4gIHNlbmRlcjogY2hyb21lLnJ1bnRpbWUuTWVzc2FnZVNlbmRlclxuKTogUHJvbWlzZTxSdW50aW1lUmVzcG9uc2U8VERhdGE+PiA9PiB7XG4gIGxvZ0RlYnVnKFwiUmVjZWl2ZWQgbWVzc2FnZVwiLCB7IHR5cGU6IG1lc3NhZ2UudHlwZSwgZnJvbTogc2VuZGVyLmlkIH0pO1xuICBzd2l0Y2ggKG1lc3NhZ2UudHlwZSkge1xuICAgIGNhc2UgXCJnZXRTdGF0ZVwiOiB7XG4gICAgICBjb25zdCBwcmVmcyA9IGF3YWl0IGxvYWRQcmVmZXJlbmNlcygpO1xuICAgICAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhwcmVmcy5jdXN0b21TdHJhdGVnaWVzIHx8IFtdKTtcbiAgICAgIC8vIFVzZSBmZXRjaEN1cnJlbnRUYWJHcm91cHMgdG8gcmV0dXJuIHRoZSBhY3R1YWwgc3RhdGUgb2YgdGhlIGJyb3dzZXIgdGFic1xuICAgICAgY29uc3QgZ3JvdXBzID0gYXdhaXQgZmV0Y2hDdXJyZW50VGFiR3JvdXBzKHByZWZzKTtcbiAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBkYXRhOiB7IGdyb3VwcywgcHJlZmVyZW5jZXM6IHByZWZzIH0gYXMgVERhdGEgfTtcbiAgICB9XG4gICAgY2FzZSBcImFwcGx5R3JvdXBpbmdcIjoge1xuICAgICAgbG9nSW5mbyhcIkFwcGx5aW5nIGdyb3VwaW5nIGZyb20gbWVzc2FnZVwiLCB7IHNvcnRpbmc6IChtZXNzYWdlLnBheWxvYWQgYXMgYW55KT8uc29ydGluZyB9KTtcbiAgICAgIGF3YWl0IHB1c2hVbmRvU3RhdGUoKTtcbiAgICAgIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuICAgICAgY29uc3QgcGF5bG9hZCA9IChtZXNzYWdlLnBheWxvYWQgYXMgQXBwbHlHcm91cGluZ1BheWxvYWQgfCB1bmRlZmluZWQpID8/IHt9O1xuICAgICAgY29uc3Qgc2VsZWN0aW9uID0gcGF5bG9hZC5zZWxlY3Rpb24gPz8ge307XG4gICAgICBjb25zdCBzb3J0aW5nID0gcGF5bG9hZC5zb3J0aW5nPy5sZW5ndGggPyBwYXlsb2FkLnNvcnRpbmcgOiB1bmRlZmluZWQ7XG5cbiAgICAgIGNvbnN0IHByZWZlcmVuY2VzID0gc29ydGluZyA/IHsgLi4ucHJlZnMsIHNvcnRpbmcgfSA6IHByZWZzO1xuXG4gICAgICBjb25zdCBvblByb2dyZXNzID0gKGNvbXBsZXRlZDogbnVtYmVyLCB0b3RhbDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICB0eXBlOiBcImdyb3VwaW5nUHJvZ3Jlc3NcIixcbiAgICAgICAgICAgICAgcGF5bG9hZDogeyBjb21wbGV0ZWQsIHRvdGFsIH1cbiAgICAgICAgICB9KS5jYXRjaCgoKSA9PiB7fSk7XG4gICAgICB9O1xuXG4gICAgICAvLyBVc2UgY2FsY3VsYXRlVGFiR3JvdXBzIHRvIGRldGVybWluZSB0aGUgdGFyZ2V0IGdyb3VwaW5nXG4gICAgICBjb25zdCBncm91cHMgPSBhd2FpdCBjYWxjdWxhdGVUYWJHcm91cHMocHJlZmVyZW5jZXMsIHNlbGVjdGlvbiwgb25Qcm9ncmVzcyk7XG4gICAgICBhd2FpdCBhcHBseVRhYkdyb3Vwcyhncm91cHMpO1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGRhdGE6IHsgZ3JvdXBzIH0gYXMgVERhdGEgfTtcbiAgICB9XG4gICAgY2FzZSBcImFwcGx5U29ydGluZ1wiOiB7XG4gICAgICBsb2dJbmZvKFwiQXBwbHlpbmcgc29ydGluZyBmcm9tIG1lc3NhZ2VcIik7XG4gICAgICBhd2FpdCBwdXNoVW5kb1N0YXRlKCk7XG4gICAgICBjb25zdCBwcmVmcyA9IGF3YWl0IGxvYWRQcmVmZXJlbmNlcygpO1xuICAgICAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhwcmVmcy5jdXN0b21TdHJhdGVnaWVzIHx8IFtdKTtcbiAgICAgIGNvbnN0IHBheWxvYWQgPSAobWVzc2FnZS5wYXlsb2FkIGFzIEFwcGx5R3JvdXBpbmdQYXlsb2FkIHwgdW5kZWZpbmVkKSA/PyB7fTtcbiAgICAgIGNvbnN0IHNlbGVjdGlvbiA9IHBheWxvYWQuc2VsZWN0aW9uID8/IHt9O1xuICAgICAgY29uc3Qgc29ydGluZyA9IHBheWxvYWQuc29ydGluZz8ubGVuZ3RoID8gcGF5bG9hZC5zb3J0aW5nIDogdW5kZWZpbmVkO1xuICAgICAgY29uc3QgcHJlZmVyZW5jZXMgPSBzb3J0aW5nID8geyAuLi5wcmVmcywgc29ydGluZyB9IDogcHJlZnM7XG5cbiAgICAgIGNvbnN0IG9uUHJvZ3Jlc3MgPSAoY29tcGxldGVkOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+IHtcbiAgICAgICAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICAgIHR5cGU6IFwiZ3JvdXBpbmdQcm9ncmVzc1wiLFxuICAgICAgICAgICAgICBwYXlsb2FkOiB7IGNvbXBsZXRlZCwgdG90YWwgfVxuICAgICAgICAgIH0pLmNhdGNoKCgpID0+IHt9KTtcbiAgICAgIH07XG5cbiAgICAgIGF3YWl0IGFwcGx5VGFiU29ydGluZyhwcmVmZXJlbmNlcywgc2VsZWN0aW9uLCBvblByb2dyZXNzKTtcbiAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgfVxuICAgIGNhc2UgXCJtZXJnZVNlbGVjdGlvblwiOiB7XG4gICAgICBsb2dJbmZvKFwiTWVyZ2luZyBzZWxlY3Rpb24gZnJvbSBtZXNzYWdlXCIpO1xuICAgICAgYXdhaXQgcHVzaFVuZG9TdGF0ZSgpO1xuICAgICAgY29uc3QgcGF5bG9hZCA9IG1lc3NhZ2UucGF5bG9hZCBhcyB7IHRhYklkczogbnVtYmVyW10gfTtcbiAgICAgIGlmIChwYXlsb2FkPy50YWJJZHM/Lmxlbmd0aCkge1xuICAgICAgICBhd2FpdCBtZXJnZVRhYnMocGF5bG9hZC50YWJJZHMpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJObyB0YWJzIHNlbGVjdGVkXCIgfTtcbiAgICB9XG4gICAgY2FzZSBcInNwbGl0U2VsZWN0aW9uXCI6IHtcbiAgICAgIGxvZ0luZm8oXCJTcGxpdHRpbmcgc2VsZWN0aW9uIGZyb20gbWVzc2FnZVwiKTtcbiAgICAgIGF3YWl0IHB1c2hVbmRvU3RhdGUoKTtcbiAgICAgIGNvbnN0IHBheWxvYWQgPSBtZXNzYWdlLnBheWxvYWQgYXMgeyB0YWJJZHM6IG51bWJlcltdIH07XG4gICAgICBpZiAocGF5bG9hZD8udGFiSWRzPy5sZW5ndGgpIHtcbiAgICAgICAgYXdhaXQgc3BsaXRUYWJzKHBheWxvYWQudGFiSWRzKTtcbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiTm8gdGFicyBzZWxlY3RlZFwiIH07XG4gICAgfVxuICAgIGNhc2UgXCJ1bmRvXCI6IHtcbiAgICAgIGxvZ0luZm8oXCJVbmRvaW5nIGxhc3QgYWN0aW9uXCIpO1xuICAgICAgYXdhaXQgdW5kbygpO1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICB9XG4gICAgY2FzZSBcInNhdmVTdGF0ZVwiOiB7XG4gICAgICBjb25zdCBuYW1lID0gKG1lc3NhZ2UucGF5bG9hZCBhcyBhbnkpPy5uYW1lO1xuICAgICAgaWYgKHR5cGVvZiBuYW1lID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIGxvZ0luZm8oXCJTYXZpbmcgc3RhdGUgZnJvbSBtZXNzYWdlXCIsIHsgbmFtZSB9KTtcbiAgICAgICAgYXdhaXQgc2F2ZVN0YXRlKG5hbWUpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIG5hbWVcIiB9O1xuICAgIH1cbiAgICBjYXNlIFwiZ2V0U2F2ZWRTdGF0ZXNcIjoge1xuICAgICAgY29uc3Qgc3RhdGVzID0gYXdhaXQgZ2V0U2F2ZWRTdGF0ZXMoKTtcbiAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBkYXRhOiBzdGF0ZXMgYXMgVERhdGEgfTtcbiAgICB9XG4gICAgY2FzZSBcInJlc3RvcmVTdGF0ZVwiOiB7XG4gICAgICBjb25zdCBzdGF0ZSA9IChtZXNzYWdlLnBheWxvYWQgYXMgYW55KT8uc3RhdGU7XG4gICAgICBpZiAoc3RhdGUpIHtcbiAgICAgICAgbG9nSW5mbyhcIlJlc3RvcmluZyBzdGF0ZSBmcm9tIG1lc3NhZ2VcIiwgeyBuYW1lOiBzdGF0ZS5uYW1lIH0pO1xuICAgICAgICBhd2FpdCByZXN0b3JlU3RhdGUoc3RhdGUpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIHN0YXRlXCIgfTtcbiAgICB9XG4gICAgY2FzZSBcImRlbGV0ZVNhdmVkU3RhdGVcIjoge1xuICAgICAgY29uc3QgbmFtZSA9IChtZXNzYWdlLnBheWxvYWQgYXMgYW55KT8ubmFtZTtcbiAgICAgIGlmICh0eXBlb2YgbmFtZSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICBsb2dJbmZvKFwiRGVsZXRpbmcgc2F2ZWQgc3RhdGUgZnJvbSBtZXNzYWdlXCIsIHsgbmFtZSB9KTtcbiAgICAgICAgYXdhaXQgZGVsZXRlU2F2ZWRTdGF0ZShuYW1lKTtcbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBuYW1lXCIgfTtcbiAgICB9XG4gICAgY2FzZSBcImxvYWRQcmVmZXJlbmNlc1wiOiB7XG4gICAgICBjb25zdCBwcmVmcyA9IGF3YWl0IGxvYWRQcmVmZXJlbmNlcygpO1xuICAgICAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhwcmVmcy5jdXN0b21TdHJhdGVnaWVzIHx8IFtdKTtcbiAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBkYXRhOiBwcmVmcyBhcyBURGF0YSB9O1xuICAgIH1cbiAgICBjYXNlIFwic2F2ZVByZWZlcmVuY2VzXCI6IHtcbiAgICAgIGxvZ0luZm8oXCJTYXZpbmcgcHJlZmVyZW5jZXMgZnJvbSBtZXNzYWdlXCIpO1xuICAgICAgY29uc3QgcHJlZnMgPSBhd2FpdCBzYXZlUHJlZmVyZW5jZXMobWVzc2FnZS5wYXlsb2FkIGFzIGFueSk7XG4gICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuICAgICAgc2V0TG9nZ2VyUHJlZmVyZW5jZXMocHJlZnMpO1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGRhdGE6IHByZWZzIGFzIFREYXRhIH07XG4gICAgfVxuICAgIGNhc2UgXCJnZXRMb2dzXCI6IHtcbiAgICAgICAgYXdhaXQgbG9nZ2VyUmVhZHk7XG4gICAgICAgIGNvbnN0IGxvZ3MgPSBnZXRMb2dzKCk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBkYXRhOiBsb2dzIGFzIFREYXRhIH07XG4gICAgfVxuICAgIGNhc2UgXCJjbGVhckxvZ3NcIjoge1xuICAgICAgICBjbGVhckxvZ3MoKTtcbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICB9XG4gICAgY2FzZSBcImxvZ0VudHJ5XCI6IHtcbiAgICAgICAgY29uc3QgZW50cnkgPSBtZXNzYWdlLnBheWxvYWQgYXMgYW55O1xuICAgICAgICBpZiAoZW50cnkgJiYgZW50cnkubGV2ZWwgJiYgZW50cnkubWVzc2FnZSkge1xuICAgICAgICAgICAgYWRkTG9nRW50cnkoZW50cnkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgfVxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIlVua25vd24gbWVzc2FnZVwiIH07XG4gIH1cbn07XG5cbmNocm9tZS5ydW50aW1lLm9uTWVzc2FnZS5hZGRMaXN0ZW5lcihcbiAgKFxuICAgIG1lc3NhZ2U6IFJ1bnRpbWVNZXNzYWdlLFxuICAgIHNlbmRlcjogY2hyb21lLnJ1bnRpbWUuTWVzc2FnZVNlbmRlcixcbiAgICBzZW5kUmVzcG9uc2U6IChyZXNwb25zZTogUnVudGltZVJlc3BvbnNlKSA9PiB2b2lkXG4gICkgPT4ge1xuICAgIGhhbmRsZU1lc3NhZ2UobWVzc2FnZSwgc2VuZGVyKVxuICAgIC50aGVuKChyZXNwb25zZSkgPT4gc2VuZFJlc3BvbnNlKHJlc3BvbnNlKSlcbiAgICAuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgICBzZW5kUmVzcG9uc2UoeyBvazogZmFsc2UsIGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICAgIH0pO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG4pO1xuXG5jaHJvbWUudGFiR3JvdXBzLm9uUmVtb3ZlZC5hZGRMaXN0ZW5lcihhc3luYyAoZ3JvdXApID0+IHtcbiAgbG9nSW5mbyhcIlRhYiBncm91cCByZW1vdmVkXCIsIHsgZ3JvdXAgfSk7XG59KTtcblxubGV0IGF1dG9SdW5UaW1lb3V0OiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsO1xuXG5jb25zdCB0cmlnZ2VyQXV0b1J1biA9ICgpID0+IHtcbiAgaWYgKGF1dG9SdW5UaW1lb3V0KSBjbGVhclRpbWVvdXQoYXV0b1J1blRpbWVvdXQpO1xuICBhdXRvUnVuVGltZW91dCA9IHNldFRpbWVvdXQoYXN5bmMgKCkgPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBwcmVmcyA9IGF3YWl0IGxvYWRQcmVmZXJlbmNlcygpO1xuICAgICAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhwcmVmcy5jdXN0b21TdHJhdGVnaWVzIHx8IFtdKTtcblxuICAgICAgY29uc3QgYXV0b1J1blN0cmF0cyA9IHByZWZzLmN1c3RvbVN0cmF0ZWdpZXM/LmZpbHRlcihzID0+IHMuYXV0b1J1bik7XG4gICAgICBpZiAoYXV0b1J1blN0cmF0cyAmJiBhdXRvUnVuU3RyYXRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgbG9nSW5mbyhcIkF1dG8tcnVubmluZyBzdHJhdGVnaWVzXCIsIHtcbiAgICAgICAgICBzdHJhdGVnaWVzOiBhdXRvUnVuU3RyYXRzLm1hcChzID0+IHMuaWQpLFxuICAgICAgICAgIGNvdW50OiBhdXRvUnVuU3RyYXRzLmxlbmd0aFxuICAgICAgICB9KTtcbiAgICAgICAgY29uc3QgaWRzID0gYXV0b1J1blN0cmF0cy5tYXAocyA9PiBzLmlkKTtcblxuICAgICAgICAvLyBXZSBhcHBseSBncm91cGluZyB1c2luZyB0aGVzZSBzdHJhdGVnaWVzXG4gICAgICAgIGNvbnN0IGdyb3VwcyA9IGF3YWl0IGNhbGN1bGF0ZVRhYkdyb3Vwcyh7IC4uLnByZWZzLCBzb3J0aW5nOiBpZHMgfSk7XG4gICAgICAgIGF3YWl0IGFwcGx5VGFiR3JvdXBzKGdyb3Vwcyk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc29sZS5lcnJvcihcIkF1dG8tcnVuIGZhaWxlZFwiLCBlKTtcbiAgICB9XG4gIH0sIDEwMDApO1xufTtcblxuY2hyb21lLnRhYnMub25DcmVhdGVkLmFkZExpc3RlbmVyKCgpID0+IHRyaWdnZXJBdXRvUnVuKCkpO1xuY2hyb21lLnRhYnMub25VcGRhdGVkLmFkZExpc3RlbmVyKCh0YWJJZCwgY2hhbmdlSW5mbykgPT4ge1xuICBpZiAoY2hhbmdlSW5mby51cmwgfHwgY2hhbmdlSW5mby5zdGF0dXMgPT09ICdjb21wbGV0ZScpIHtcbiAgICB0cmlnZ2VyQXV0b1J1bigpO1xuICB9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFhTyxJQUFNLGFBQW1DO0FBQUEsRUFDNUMsRUFBRSxJQUFJLFVBQVUsT0FBTyxVQUFVLFlBQVksTUFBTSxXQUFXLE1BQU0sTUFBTSxDQUFDLFNBQVMsTUFBTSxFQUFFO0FBQUEsRUFDNUYsRUFBRSxJQUFJLGVBQWUsT0FBTyxlQUFlLFlBQVksTUFBTSxXQUFXLE1BQU0sTUFBTSxDQUFDLFNBQVMsTUFBTSxFQUFFO0FBQUEsRUFDdEcsRUFBRSxJQUFJLFNBQVMsT0FBTyxTQUFTLFlBQVksTUFBTSxXQUFXLE1BQU0sTUFBTSxDQUFDLFNBQVMs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QztBQUVELElBQUksaUJBQXVEO0FBRTNELElBQU0saUJBQWlCLE1BQU07QUFDM0IsTUFBSSxlQUFnQixjQUFhLGNBQWM7QUFDL0MsbUJBQWlCLFdBQVcsWUFBWTtBQUN0QyxRQUFJO0FBQ0YsWUFBTSxRQUFRLE1BQU0sZ0JBQWdCO0FBQ3BDLDBCQUFvQixNQUFNLG9CQUFvQixDQUFDLENBQUM7QUFFaEQsWUFBTSxnQkFBZ0IsTUFBTSxrQkFBa0IsT0FBTyxPQUFLLEVBQUUsT0FBTztBQUNuRSxVQUFJLGlCQUFpQixjQUFjLFNBQVMsR0FBRztBQUM3QyxnQkFBUSwyQkFBMkI7QUFBQSxVQUNqQyxZQUFZLGNBQWMsSUFBSSxPQUFLLEVBQUUsRUFBRTtBQUFBLFVBQ3ZDLE9BQU8sY0FBYztBQUFBLFFBQ3ZCLENBQUM7QUFDRCxjQUFNLE1BQU0sY0FBYyxJQUFJLE9BQUssRUFBRSxFQUFFO0FBR3ZDLGNBQU0sU0FBUyxNQUFNLG1CQUFtQixFQUFFLEdBQUcsT0FBTyxTQUFTLElBQUksQ0FBQztBQUNsRSxjQUFNLGVBQWUsTUFBTTtBQUFBLE1BQzdCO0FBQUEsSUFDRixTQUFTLEdBQUc7QUFDVixjQUFRLE1BQU0sbUJBQW1CLENBQUM7QUFBQSxJQUNwQztBQUFBLEVBQ0YsR0FBRyxHQUFJO0FBQ1Q7QUFFQSxPQUFPLEtBQUssVUFBVSxZQUFZLE1BQU0sZUFBZSxDQUFDO0FBQ3hELE9BQU8sS0FBSyxVQUFVLFlBQVksQ0FBQyxPQUFPLGVBQWU7QUFDdkQsTUFBSSxXQUFXLE9BQU8sV0FBVyxXQUFXLFlBQVk7QUFDdEQsbUJBQWU7QUFBQSxFQUNqQjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbImN1c3RvbVN0cmF0ZWdpZXMiLCAibWF0Y2giLCAicGFydHMiLCAiZ3JvdXBUYWJzIiwgInRhYnMiLCAibGlzdCIsICJsb2dzIl0KfQo=
