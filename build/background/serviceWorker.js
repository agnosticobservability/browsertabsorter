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
      if (field.includes(".")) {
        return field.split(".").reduce((obj, key) => obj && typeof obj === "object" && obj !== null ? obj[key] : void 0, tab);
      }
      return tab[field];
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
                    const match2 = regex.exec(val);
                    if (match2) {
                      let extracted = "";
                      for (let i = 1; i < match2.length; i++) {
                        extracted += match2[i] || "";
                      }
                      val = extracted;
                    } else {
                      val = "";
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
function extractJsonLdFields(jsonLd) {
  let author = null;
  let publishedAt = null;
  let modifiedAt = null;
  let tags = [];
  let breadcrumbs = [];
  const mainEntity = jsonLd.find((i) => i && (i["@type"] === "Article" || i["@type"] === "VideoObject" || i["@type"] === "NewsArticle")) || jsonLd[0];
  if (mainEntity) {
    if (mainEntity.author) {
      if (typeof mainEntity.author === "string") author = mainEntity.author;
      else if (mainEntity.author.name) author = mainEntity.author.name;
      else if (Array.isArray(mainEntity.author) && mainEntity.author[0]?.name) author = mainEntity.author[0].name;
    }
    if (mainEntity.datePublished) publishedAt = mainEntity.datePublished;
    if (mainEntity.dateModified) modifiedAt = mainEntity.dateModified;
    if (mainEntity.keywords) {
      if (typeof mainEntity.keywords === "string") tags = mainEntity.keywords.split(",").map((s) => s.trim());
      else if (Array.isArray(mainEntity.keywords)) tags = mainEntity.keywords;
    }
  }
  const breadcrumbLd = jsonLd.find((i) => i && i["@type"] === "BreadcrumbList");
  if (breadcrumbLd && Array.isArray(breadcrumbLd.itemListElement)) {
    const list = breadcrumbLd.itemListElement.sort((a, b) => a.position - b.position);
    list.forEach((item) => {
      if (item.name) breadcrumbs.push(item.name);
      else if (item.item && item.item.name) breadcrumbs.push(item.item.name);
    });
  }
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
  customGenera: {},
  ai: {
    enabled: false,
    provider: "openai",
    model: "gpt-4o-mini"
  }
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
    customStrategies: normalizeStrategies(merged.customStrategies),
    ai: { ...defaultPreferences.ai, ...merged.ai || {} }
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
var analyzeTabContext = async (tabs, onProgress) => {
  const contextMap = /* @__PURE__ */ new Map();
  let completed = 0;
  const total = tabs.length;
  let preferences;
  try {
    preferences = await loadPreferences();
  } catch (e) {
    logError("Failed to load preferences during context analysis", { error: String(e) });
  }
  const promises = tabs.map(async (tab) => {
    try {
      const cacheKey = `${tab.id}::${tab.url}`;
      if (contextCache.has(cacheKey)) {
        contextMap.set(tab.id, contextCache.get(cacheKey));
        return;
      }
      const result = await fetchContextForTab(tab, preferences);
      contextCache.set(cacheKey, result);
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
var fetchContextForTab = async (tab, prefs) => {
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
  if (context === "Uncategorized" && prefs?.ai?.enabled) {
    const aiResult = await fetchContextFromAI(tab, prefs.ai, data);
    if (aiResult.context && aiResult.context !== "Uncategorized") {
      context = aiResult.context;
      source = "AI";
      error = void 0;
      status = void 0;
    } else if (aiResult.error) {
      logDebug("AI Analysis failed", { error: aiResult.error });
    }
  }
  if (context !== "Uncategorized" && source !== "Extraction") {
    error = void 0;
    status = void 0;
  }
  return { context, source, data: data || void 0, error, status };
};
var fetchContextFromAI = async (tab, aiPrefs, contextData) => {
  if (!aiPrefs.enabled) return { context: "Uncategorized", source: "AI", status: "DISABLED" };
  if (aiPrefs.provider === "openai" && !aiPrefs.apiKey) {
    return { context: "Uncategorized", source: "AI", error: "Missing API Key", status: "ERROR" };
  }
  const endpoint = aiPrefs.provider === "custom" ? aiPrefs.endpoint : "https://api.openai.com/v1/chat/completions";
  if (!endpoint) {
    return { context: "Uncategorized", source: "AI", error: "Missing Endpoint", status: "ERROR" };
  }
  const model = aiPrefs.model || "gpt-4o-mini";
  const systemPrompt = `You are a web page classifier. Analyze the following page information and categorize it into exactly ONE of these categories: Development, Work, Entertainment, News, Shopping, Social, Education, Travel, Health, Sports, Technology, Science, Gaming, Music, Art, Finance, Government, Reference. If uncertain, choose the best fit or 'General'. Reply ONLY with the category name.`;
  const description = contextData?.description || tab.contextData?.description || "";
  const userPrompt = `Title: ${tab.title}
URL: ${tab.url}
Description: ${description}`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": aiPrefs.apiKey ? `Bearer ${aiPrefs.apiKey}` : void 0
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 10
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      return { context: "Uncategorized", source: "AI", error: `API Error ${response.status}: ${errText}`, status: "ERROR" };
    }
    const json = await response.json();
    const content = json.choices?.[0]?.message?.content?.trim();
    if (content) {
      const category = content.replace(/[^a-zA-Z]/g, "");
      return { context: category, source: "AI" };
    } else {
      return { context: "Uncategorized", source: "AI", error: "Empty response", status: "ERROR" };
    }
  } catch (e) {
    return { context: "Uncategorized", source: "AI", error: String(e), status: "ERROR" };
  }
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3NoYXJlZC9zdHJhdGVneVJlZ2lzdHJ5LnRzIiwgIi4uLy4uL3NyYy9zaGFyZWQvbG9nZ2VyLnRzIiwgIi4uLy4uL3NyYy9zaGFyZWQvdXRpbHMudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZ3JvdXBpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3NvcnRpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL2V4dHJhY3Rpb24vbG9naWMudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZXh0cmFjdGlvbi9nZW5lcmFSZWdpc3RyeS50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9zdG9yYWdlLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3ByZWZlcmVuY2VzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL2V4dHJhY3Rpb24vaW5kZXgudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvY29udGV4dEFuYWx5c2lzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3RhYk1hbmFnZXIudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvc3RhdGVNYW5hZ2VyLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3NlcnZpY2VXb3JrZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IEN1c3RvbVN0cmF0ZWd5LCBTb3J0aW5nU3RyYXRlZ3kgfSBmcm9tIFwiLi90eXBlcy5qc1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0cmF0ZWd5RGVmaW5pdGlvbiB7XG4gICAgaWQ6IFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZztcbiAgICBsYWJlbDogc3RyaW5nO1xuICAgIGlzR3JvdXBpbmc6IGJvb2xlYW47XG4gICAgaXNTb3J0aW5nOiBib29sZWFuO1xuICAgIHRhZ3M/OiBzdHJpbmdbXTtcbiAgICBhdXRvUnVuPzogYm9vbGVhbjtcbiAgICBpc0N1c3RvbT86IGJvb2xlYW47XG59XG5cbi8vIFJlc3RvcmVkIHN0cmF0ZWdpZXMgbWF0Y2hpbmcgYmFja2dyb3VuZCBjYXBhYmlsaXRpZXMuXG5leHBvcnQgY29uc3QgU1RSQVRFR0lFUzogU3RyYXRlZ3lEZWZpbml0aW9uW10gPSBbXG4gICAgeyBpZDogXCJkb21haW5cIiwgbGFiZWw6IFwiRG9tYWluXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJkb21haW5fZnVsbFwiLCBsYWJlbDogXCJGdWxsIERvbWFpblwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwidG9waWNcIiwgbGFiZWw6IFwiVG9waWNcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImNvbnRleHRcIiwgbGFiZWw6IFwiQ29udGV4dFwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwibGluZWFnZVwiLCBsYWJlbDogXCJMaW5lYWdlXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJwaW5uZWRcIiwgbGFiZWw6IFwiUGlubmVkXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJyZWNlbmN5XCIsIGxhYmVsOiBcIlJlY2VuY3lcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImFnZVwiLCBsYWJlbDogXCJBZ2VcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInVybFwiLCBsYWJlbDogXCJVUkxcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcIm5lc3RpbmdcIiwgbGFiZWw6IFwiTmVzdGluZ1wiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwidGl0bGVcIiwgbGFiZWw6IFwiVGl0bGVcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbl07XG5cbmV4cG9ydCBjb25zdCBnZXRTdHJhdGVnaWVzID0gKGN1c3RvbVN0cmF0ZWdpZXM/OiBDdXN0b21TdHJhdGVneVtdKTogU3RyYXRlZ3lEZWZpbml0aW9uW10gPT4ge1xuICAgIGlmICghY3VzdG9tU3RyYXRlZ2llcyB8fCBjdXN0b21TdHJhdGVnaWVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIFNUUkFURUdJRVM7XG5cbiAgICAvLyBDdXN0b20gc3RyYXRlZ2llcyBjYW4gb3ZlcnJpZGUgYnVpbHQtaW5zIGlmIElEcyBtYXRjaCwgb3IgYWRkIG5ldyBvbmVzLlxuICAgIGNvbnN0IGNvbWJpbmVkID0gWy4uLlNUUkFURUdJRVNdO1xuXG4gICAgY3VzdG9tU3RyYXRlZ2llcy5mb3JFYWNoKGN1c3RvbSA9PiB7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nSW5kZXggPSBjb21iaW5lZC5maW5kSW5kZXgocyA9PiBzLmlkID09PSBjdXN0b20uaWQpO1xuXG4gICAgICAgIC8vIERldGVybWluZSBjYXBhYmlsaXRpZXMgYmFzZWQgb24gcnVsZXMgcHJlc2VuY2VcbiAgICAgICAgY29uc3QgaGFzR3JvdXBpbmcgPSAoY3VzdG9tLmdyb3VwaW5nUnVsZXMgJiYgY3VzdG9tLmdyb3VwaW5nUnVsZXMubGVuZ3RoID4gMCkgfHwgKGN1c3RvbS5ydWxlcyAmJiBjdXN0b20ucnVsZXMubGVuZ3RoID4gMCkgfHwgZmFsc2U7XG4gICAgICAgIGNvbnN0IGhhc1NvcnRpbmcgPSAoY3VzdG9tLnNvcnRpbmdSdWxlcyAmJiBjdXN0b20uc29ydGluZ1J1bGVzLmxlbmd0aCA+IDApIHx8IChjdXN0b20ucnVsZXMgJiYgY3VzdG9tLnJ1bGVzLmxlbmd0aCA+IDApIHx8IGZhbHNlO1xuXG4gICAgICAgIGNvbnN0IHRhZ3M6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGlmIChoYXNHcm91cGluZykgdGFncy5wdXNoKFwiZ3JvdXBcIik7XG4gICAgICAgIGlmIChoYXNTb3J0aW5nKSB0YWdzLnB1c2goXCJzb3J0XCIpO1xuXG4gICAgICAgIGNvbnN0IGRlZmluaXRpb246IFN0cmF0ZWd5RGVmaW5pdGlvbiA9IHtcbiAgICAgICAgICAgIGlkOiBjdXN0b20uaWQsXG4gICAgICAgICAgICBsYWJlbDogY3VzdG9tLmxhYmVsLFxuICAgICAgICAgICAgaXNHcm91cGluZzogaGFzR3JvdXBpbmcsXG4gICAgICAgICAgICBpc1NvcnRpbmc6IGhhc1NvcnRpbmcsXG4gICAgICAgICAgICB0YWdzOiB0YWdzLFxuICAgICAgICAgICAgYXV0b1J1bjogY3VzdG9tLmF1dG9SdW4sXG4gICAgICAgICAgICBpc0N1c3RvbTogdHJ1ZVxuICAgICAgICB9O1xuXG4gICAgICAgIGlmIChleGlzdGluZ0luZGV4ICE9PSAtMSkge1xuICAgICAgICAgICAgY29tYmluZWRbZXhpc3RpbmdJbmRleF0gPSBkZWZpbml0aW9uO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29tYmluZWQucHVzaChkZWZpbml0aW9uKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGNvbWJpbmVkO1xufTtcblxuZXhwb3J0IGNvbnN0IGdldFN0cmF0ZWd5ID0gKGlkOiBTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmcpOiBTdHJhdGVneURlZmluaXRpb24gfCB1bmRlZmluZWQgPT4gU1RSQVRFR0lFUy5maW5kKHMgPT4gcy5pZCA9PT0gaWQpO1xuIiwgImltcG9ydCB7IExvZ0VudHJ5LCBMb2dMZXZlbCwgUHJlZmVyZW5jZXMgfSBmcm9tIFwiLi90eXBlcy5qc1wiO1xuXG5jb25zdCBQUkVGSVggPSBcIltUYWJTb3J0ZXJdXCI7XG5cbmNvbnN0IExFVkVMX1BSSU9SSVRZOiBSZWNvcmQ8TG9nTGV2ZWwsIG51bWJlcj4gPSB7XG4gIGRlYnVnOiAwLFxuICBpbmZvOiAxLFxuICB3YXJuOiAyLFxuICBlcnJvcjogMyxcbiAgY3JpdGljYWw6IDRcbn07XG5cbmxldCBjdXJyZW50TGV2ZWw6IExvZ0xldmVsID0gXCJpbmZvXCI7XG5sZXQgbG9nczogTG9nRW50cnlbXSA9IFtdO1xuY29uc3QgTUFYX0xPR1MgPSAxMDAwO1xuY29uc3QgU1RPUkFHRV9LRVkgPSBcInNlc3Npb25Mb2dzXCI7XG5cbi8vIFNhZmUgY29udGV4dCBjaGVja1xuY29uc3QgaXNTZXJ2aWNlV29ya2VyID0gdHlwZW9mIHNlbGYgIT09ICd1bmRlZmluZWQnICYmXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlb2YgKHNlbGYgYXMgYW55KS5TZXJ2aWNlV29ya2VyR2xvYmFsU2NvcGUgIT09ICd1bmRlZmluZWQnICYmXG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmIGluc3RhbmNlb2YgKHNlbGYgYXMgYW55KS5TZXJ2aWNlV29ya2VyR2xvYmFsU2NvcGU7XG5sZXQgaXNTYXZpbmcgPSBmYWxzZTtcbmxldCBwZW5kaW5nU2F2ZSA9IGZhbHNlO1xubGV0IHNhdmVUaW1lcjogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCBudWxsID0gbnVsbDtcblxuY29uc3QgZG9TYXZlID0gKCkgPT4ge1xuICAgIGlmICghaXNTZXJ2aWNlV29ya2VyIHx8ICFjaHJvbWU/LnN0b3JhZ2U/LnNlc3Npb24gfHwgaXNTYXZpbmcpIHtcbiAgICAgICAgcGVuZGluZ1NhdmUgPSB0cnVlO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaXNTYXZpbmcgPSB0cnVlO1xuICAgIHBlbmRpbmdTYXZlID0gZmFsc2U7XG5cbiAgICBjaHJvbWUuc3RvcmFnZS5zZXNzaW9uLnNldCh7IFtTVE9SQUdFX0tFWV06IGxvZ3MgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIGlzU2F2aW5nID0gZmFsc2U7XG4gICAgICAgIGlmIChwZW5kaW5nU2F2ZSkge1xuICAgICAgICAgICAgc2F2ZUxvZ3NUb1N0b3JhZ2UoKTtcbiAgICAgICAgfVxuICAgIH0pLmNhdGNoKGVyciA9PiB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gc2F2ZSBsb2dzXCIsIGVycik7XG4gICAgICAgIGlzU2F2aW5nID0gZmFsc2U7XG4gICAgfSk7XG59O1xuXG5jb25zdCBzYXZlTG9nc1RvU3RvcmFnZSA9ICgpID0+IHtcbiAgICBpZiAoc2F2ZVRpbWVyKSBjbGVhclRpbWVvdXQoc2F2ZVRpbWVyKTtcbiAgICBzYXZlVGltZXIgPSBzZXRUaW1lb3V0KGRvU2F2ZSwgMTAwMCk7XG59O1xuXG5sZXQgcmVzb2x2ZUxvZ2dlclJlYWR5OiAoKSA9PiB2b2lkO1xuZXhwb3J0IGNvbnN0IGxvZ2dlclJlYWR5ID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG4gICAgcmVzb2x2ZUxvZ2dlclJlYWR5ID0gcmVzb2x2ZTtcbn0pO1xuXG5leHBvcnQgY29uc3QgaW5pdExvZ2dlciA9IGFzeW5jICgpID0+IHtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyICYmIGNocm9tZT8uc3RvcmFnZT8uc2Vzc2lvbikge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY2hyb21lLnN0b3JhZ2Uuc2Vzc2lvbi5nZXQoU1RPUkFHRV9LRVkpO1xuICAgICAgICAgICAgaWYgKHJlc3VsdFtTVE9SQUdFX0tFWV0gJiYgQXJyYXkuaXNBcnJheShyZXN1bHRbU1RPUkFHRV9LRVldKSkge1xuICAgICAgICAgICAgICAgIGxvZ3MgPSByZXN1bHRbU1RPUkFHRV9LRVldO1xuICAgICAgICAgICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSBsb2dzID0gbG9ncy5zbGljZSgwLCBNQVhfTE9HUyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gcmVzdG9yZSBsb2dzXCIsIGUpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGlmIChyZXNvbHZlTG9nZ2VyUmVhZHkpIHJlc29sdmVMb2dnZXJSZWFkeSgpO1xufTtcblxuZXhwb3J0IGNvbnN0IHNldExvZ2dlclByZWZlcmVuY2VzID0gKHByZWZzOiBQcmVmZXJlbmNlcykgPT4ge1xuICBpZiAocHJlZnMubG9nTGV2ZWwpIHtcbiAgICBjdXJyZW50TGV2ZWwgPSBwcmVmcy5sb2dMZXZlbDtcbiAgfSBlbHNlIGlmIChwcmVmcy5kZWJ1Zykge1xuICAgIGN1cnJlbnRMZXZlbCA9IFwiZGVidWdcIjtcbiAgfSBlbHNlIHtcbiAgICBjdXJyZW50TGV2ZWwgPSBcImluZm9cIjtcbiAgfVxufTtcblxuY29uc3Qgc2hvdWxkTG9nID0gKGxldmVsOiBMb2dMZXZlbCk6IGJvb2xlYW4gPT4ge1xuICByZXR1cm4gTEVWRUxfUFJJT1JJVFlbbGV2ZWxdID49IExFVkVMX1BSSU9SSVRZW2N1cnJlbnRMZXZlbF07XG59O1xuXG5jb25zdCBmb3JtYXRNZXNzYWdlID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIHJldHVybiBjb250ZXh0ID8gYCR7bWVzc2FnZX0gOjogJHtKU09OLnN0cmluZ2lmeShjb250ZXh0KX1gIDogbWVzc2FnZTtcbn07XG5cbmNvbnN0IGFkZExvZyA9IChsZXZlbDogTG9nTGV2ZWwsIG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIC8vIEFsd2F5cyBhZGQgdG8gYnVmZmVyIHJlZ2FyZGxlc3Mgb2YgY3VycmVudCBjb25zb2xlIGxldmVsIHNldHRpbmcsXG4gIC8vIG9yIHNob3VsZCB3ZSByZXNwZWN0IGl0PyBVc3VhbGx5IGRlYnVnIGxvZ3MgYXJlIG5vaXN5LlxuICAvLyBMZXQncyByZXNwZWN0IHNob3VsZExvZyBmb3IgdGhlIGJ1ZmZlciB0b28gdG8gc2F2ZSBtZW1vcnkvbm9pc2UsXG4gIC8vIE9SIHdlIGNhbiBzdG9yZSBldmVyeXRoaW5nIGJ1dCBmaWx0ZXIgb24gdmlldy5cbiAgLy8gR2l2ZW4gd2Ugd2FudCB0byBkZWJ1ZyBpc3N1ZXMsIHN0b3JpbmcgZXZlcnl0aGluZyBtaWdodCBiZSBiZXR0ZXIsXG4gIC8vIGJ1dCBpZiB3ZSBzdG9yZSBldmVyeXRoaW5nIHdlIG1pZ2h0IGZpbGwgYnVmZmVyIHdpdGggZGVidWcgbm9pc2UgcXVpY2tseS5cbiAgLy8gTGV0J3Mgc3RpY2sgdG8gc3RvcmluZyB3aGF0IGlzIGNvbmZpZ3VyZWQgdG8gYmUgbG9nZ2VkLlxuICAvLyBXYWl0LCBpZiBJIHdhbnQgdG8gXCJkZWJ1Z1wiIHNvbWV0aGluZywgSSB1c3VhbGx5IHR1cm4gb24gZGVidWcgbG9ncy5cbiAgLy8gSWYgSSBjYW4ndCBzZWUgcGFzdCBsb2dzIGJlY2F1c2UgdGhleSB3ZXJlbid0IHN0b3JlZCwgSSBoYXZlIHRvIHJlcHJvLlxuICAvLyBMZXQncyBzdG9yZSBpZiBpdCBwYXNzZXMgYHNob3VsZExvZ2AuXG5cbiAgaWYgKHNob3VsZExvZyhsZXZlbCkpIHtcbiAgICAgIGNvbnN0IGVudHJ5OiBMb2dFbnRyeSA9IHtcbiAgICAgICAgICB0aW1lc3RhbXA6IERhdGUubm93KCksXG4gICAgICAgICAgbGV2ZWwsXG4gICAgICAgICAgbWVzc2FnZSxcbiAgICAgICAgICBjb250ZXh0XG4gICAgICB9O1xuXG4gICAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSB7XG4gICAgICAgICAgbG9ncy51bnNoaWZ0KGVudHJ5KTtcbiAgICAgICAgICBpZiAobG9ncy5sZW5ndGggPiBNQVhfTE9HUykge1xuICAgICAgICAgICAgICBsb2dzLnBvcCgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBzYXZlTG9nc1RvU3RvcmFnZSgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBJbiBvdGhlciBjb250ZXh0cywgc2VuZCB0byBTV1xuICAgICAgICAgIGlmIChjaHJvbWU/LnJ1bnRpbWU/LnNlbmRNZXNzYWdlKSB7XG4gICAgICAgICAgICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiAnbG9nRW50cnknLCBwYXlsb2FkOiBlbnRyeSB9KS5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgIC8vIElnbm9yZSBpZiBtZXNzYWdlIGZhaWxzIChlLmcuIGNvbnRleHQgaW52YWxpZGF0ZWQpXG4gICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgfVxuICB9XG59O1xuXG5leHBvcnQgY29uc3QgYWRkTG9nRW50cnkgPSAoZW50cnk6IExvZ0VudHJ5KSA9PiB7XG4gICAgaWYgKGlzU2VydmljZVdvcmtlcikge1xuICAgICAgICBsb2dzLnVuc2hpZnQoZW50cnkpO1xuICAgICAgICBpZiAobG9ncy5sZW5ndGggPiBNQVhfTE9HUykge1xuICAgICAgICAgICAgbG9ncy5wb3AoKTtcbiAgICAgICAgfVxuICAgICAgICBzYXZlTG9nc1RvU3RvcmFnZSgpO1xuICAgIH1cbn07XG5cbmV4cG9ydCBjb25zdCBnZXRMb2dzID0gKCkgPT4gWy4uLmxvZ3NdO1xuZXhwb3J0IGNvbnN0IGNsZWFyTG9ncyA9ICgpID0+IHtcbiAgICBsb2dzLmxlbmd0aCA9IDA7XG4gICAgaWYgKGlzU2VydmljZVdvcmtlcikgc2F2ZUxvZ3NUb1N0b3JhZ2UoKTtcbn07XG5cbmV4cG9ydCBjb25zdCBsb2dEZWJ1ZyA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBhZGRMb2coXCJkZWJ1Z1wiLCBtZXNzYWdlLCBjb250ZXh0KTtcbiAgaWYgKHNob3VsZExvZyhcImRlYnVnXCIpKSB7XG4gICAgY29uc29sZS5kZWJ1ZyhgJHtQUkVGSVh9IFtERUJVR10gJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nSW5mbyA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBhZGRMb2coXCJpbmZvXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwiaW5mb1wiKSkge1xuICAgIGNvbnNvbGUuaW5mbyhgJHtQUkVGSVh9IFtJTkZPXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgY29udGV4dCl9YCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBsb2dXYXJuID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcIndhcm5cIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJ3YXJuXCIpKSB7XG4gICAgY29uc29sZS53YXJuKGAke1BSRUZJWH0gW1dBUk5dICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0Vycm9yID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImVycm9yXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwiZXJyb3JcIikpIHtcbiAgICBjb25zb2xlLmVycm9yKGAke1BSRUZJWH0gW0VSUk9SXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgY29udGV4dCl9YCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBsb2dDcml0aWNhbCA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBhZGRMb2coXCJjcml0aWNhbFwiLCBtZXNzYWdlLCBjb250ZXh0KTtcbiAgaWYgKHNob3VsZExvZyhcImNyaXRpY2FsXCIpKSB7XG4gICAgLy8gQ3JpdGljYWwgbG9ncyB1c2UgZXJyb3IgY29uc29sZSBidXQgd2l0aCBkaXN0aW5jdCBwcmVmaXggYW5kIG1heWJlIHN0eWxpbmcgaWYgc3VwcG9ydGVkXG4gICAgY29uc29sZS5lcnJvcihgJHtQUkVGSVh9IFtDUklUSUNBTF0gXHVEODNEXHVERUE4ICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcbiIsICJpbXBvcnQgeyBQcmVmZXJlbmNlcywgU29ydGluZ1N0cmF0ZWd5LCBUYWJNZXRhZGF0YSB9IGZyb20gXCIuL3R5cGVzLmpzXCI7XG5cbmV4cG9ydCBjb25zdCBtYXBDaHJvbWVUYWIgPSAodGFiOiBjaHJvbWUudGFicy5UYWIpOiBUYWJNZXRhZGF0YSB8IG51bGwgPT4ge1xuICBpZiAoIXRhYi5pZCB8fCB0YWIuaWQgPT09IGNocm9tZS50YWJzLlRBQl9JRF9OT05FIHx8ICF0YWIud2luZG93SWQpIHJldHVybiBudWxsO1xuICByZXR1cm4ge1xuICAgIGlkOiB0YWIuaWQsXG4gICAgd2luZG93SWQ6IHRhYi53aW5kb3dJZCxcbiAgICB0aXRsZTogdGFiLnRpdGxlIHx8IFwiVW50aXRsZWRcIixcbiAgICB1cmw6IHRhYi51cmwgfHwgXCJhYm91dDpibGFua1wiLFxuICAgIHBpbm5lZDogQm9vbGVhbih0YWIucGlubmVkKSxcbiAgICBsYXN0QWNjZXNzZWQ6IHRhYi5sYXN0QWNjZXNzZWQsXG4gICAgb3BlbmVyVGFiSWQ6IHRhYi5vcGVuZXJUYWJJZCA/PyB1bmRlZmluZWQsXG4gICAgZmF2SWNvblVybDogdGFiLmZhdkljb25VcmwsXG4gICAgZ3JvdXBJZDogdGFiLmdyb3VwSWQsXG4gICAgaW5kZXg6IHRhYi5pbmRleCxcbiAgICBhY3RpdmU6IHRhYi5hY3RpdmUsXG4gICAgc3RhdHVzOiB0YWIuc3RhdHVzLFxuICAgIHNlbGVjdGVkOiB0YWIuaGlnaGxpZ2h0ZWRcbiAgfTtcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRTdG9yZWRQcmVmZXJlbmNlcyA9IGFzeW5jICgpOiBQcm9taXNlPFByZWZlcmVuY2VzIHwgbnVsbD4gPT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoXCJwcmVmZXJlbmNlc1wiLCAoaXRlbXMpID0+IHtcbiAgICAgIHJlc29sdmUoKGl0ZW1zW1wicHJlZmVyZW5jZXNcIl0gYXMgUHJlZmVyZW5jZXMpID8/IG51bGwpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBhc0FycmF5ID0gPFQ+KHZhbHVlOiB1bmtub3duKTogVFtdID0+IHtcbiAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHJldHVybiB2YWx1ZSBhcyBUW107XG4gICAgcmV0dXJuIFtdO1xufTtcbiIsICJpbXBvcnQgeyBHcm91cGluZ1N0cmF0ZWd5LCBTb3J0aW5nU3RyYXRlZ3ksIFRhYkdyb3VwLCBUYWJNZXRhZGF0YSwgQ3VzdG9tU3RyYXRlZ3ksIFN0cmF0ZWd5UnVsZSwgUnVsZUNvbmRpdGlvbiwgR3JvdXBpbmdSdWxlLCBTb3J0aW5nUnVsZSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGdldFN0cmF0ZWdpZXMgfSBmcm9tIFwiLi4vc2hhcmVkL3N0cmF0ZWd5UmVnaXN0cnkuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tIFwiLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5cbmxldCBjdXN0b21TdHJhdGVnaWVzOiBDdXN0b21TdHJhdGVneVtdID0gW107XG5cbmV4cG9ydCBjb25zdCBzZXRDdXN0b21TdHJhdGVnaWVzID0gKHN0cmF0ZWdpZXM6IEN1c3RvbVN0cmF0ZWd5W10pID0+IHtcbiAgICBjdXN0b21TdHJhdGVnaWVzID0gc3RyYXRlZ2llcztcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRDdXN0b21TdHJhdGVnaWVzID0gKCk6IEN1c3RvbVN0cmF0ZWd5W10gPT4gY3VzdG9tU3RyYXRlZ2llcztcblxuY29uc3QgQ09MT1JTID0gW1wiZ3JleVwiLCBcImJsdWVcIiwgXCJyZWRcIiwgXCJ5ZWxsb3dcIiwgXCJncmVlblwiLCBcInBpbmtcIiwgXCJwdXJwbGVcIiwgXCJjeWFuXCIsIFwib3JhbmdlXCJdO1xuXG5jb25zdCByZWdleENhY2hlID0gbmV3IE1hcDxzdHJpbmcsIFJlZ0V4cD4oKTtcbmNvbnN0IGRvbWFpbkNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcbmNvbnN0IHN1YmRvbWFpbkNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcbmNvbnN0IE1BWF9DQUNIRV9TSVpFID0gMTAwMDtcblxuZXhwb3J0IGNvbnN0IGRvbWFpbkZyb21VcmwgPSAodXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBpZiAoZG9tYWluQ2FjaGUuaGFzKHVybCkpIHJldHVybiBkb21haW5DYWNoZS5nZXQodXJsKSE7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBwYXJzZWQgPSBuZXcgVVJMKHVybCk7XG4gICAgY29uc3QgZG9tYWluID0gcGFyc2VkLmhvc3RuYW1lLnJlcGxhY2UoL153d3dcXC4vLCBcIlwiKTtcblxuICAgIGlmIChkb21haW5DYWNoZS5zaXplID49IE1BWF9DQUNIRV9TSVpFKSBkb21haW5DYWNoZS5jbGVhcigpO1xuICAgIGRvbWFpbkNhY2hlLnNldCh1cmwsIGRvbWFpbik7XG5cbiAgICByZXR1cm4gZG9tYWluO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGxvZ0RlYnVnKFwiRmFpbGVkIHRvIHBhcnNlIGRvbWFpblwiLCB7IHVybCwgZXJyb3I6IFN0cmluZyhlcnJvcikgfSk7XG4gICAgcmV0dXJuIFwidW5rbm93blwiO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3Qgc3ViZG9tYWluRnJvbVVybCA9ICh1cmw6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgaWYgKHN1YmRvbWFpbkNhY2hlLmhhcyh1cmwpKSByZXR1cm4gc3ViZG9tYWluQ2FjaGUuZ2V0KHVybCkhO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcGFyc2VkID0gbmV3IFVSTCh1cmwpO1xuICAgICAgICBsZXQgaG9zdG5hbWUgPSBwYXJzZWQuaG9zdG5hbWU7XG4gICAgICAgIC8vIFJlbW92ZSB3d3cuXG4gICAgICAgIGhvc3RuYW1lID0gaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sIFwiXCIpO1xuXG4gICAgICAgIGxldCByZXN1bHQgPSBcIlwiO1xuICAgICAgICBjb25zdCBwYXJ0cyA9IGhvc3RuYW1lLnNwbGl0KCcuJyk7XG4gICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAyKSB7XG4gICAgICAgICAgICAgcmVzdWx0ID0gcGFydHMuc2xpY2UoMCwgcGFydHMubGVuZ3RoIC0gMikuam9pbignLicpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN1YmRvbWFpbkNhY2hlLnNpemUgPj0gTUFYX0NBQ0hFX1NJWkUpIHN1YmRvbWFpbkNhY2hlLmNsZWFyKCk7XG4gICAgICAgIHN1YmRvbWFpbkNhY2hlLnNldCh1cmwsIHJlc3VsdCk7XG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9IGNhdGNoIHtcbiAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgfVxufVxuXG5leHBvcnQgY29uc3QgZ2V0RmllbGRWYWx1ZSA9ICh0YWI6IFRhYk1ldGFkYXRhLCBmaWVsZDogc3RyaW5nKTogYW55ID0+IHtcbiAgICBzd2l0Y2goZmllbGQpIHtcbiAgICAgICAgY2FzZSAnaWQnOiByZXR1cm4gdGFiLmlkO1xuICAgICAgICBjYXNlICdpbmRleCc6IHJldHVybiB0YWIuaW5kZXg7XG4gICAgICAgIGNhc2UgJ3dpbmRvd0lkJzogcmV0dXJuIHRhYi53aW5kb3dJZDtcbiAgICAgICAgY2FzZSAnZ3JvdXBJZCc6IHJldHVybiB0YWIuZ3JvdXBJZDtcbiAgICAgICAgY2FzZSAndGl0bGUnOiByZXR1cm4gdGFiLnRpdGxlO1xuICAgICAgICBjYXNlICd1cmwnOiByZXR1cm4gdGFiLnVybDtcbiAgICAgICAgY2FzZSAnc3RhdHVzJzogcmV0dXJuIHRhYi5zdGF0dXM7XG4gICAgICAgIGNhc2UgJ2FjdGl2ZSc6IHJldHVybiB0YWIuYWN0aXZlO1xuICAgICAgICBjYXNlICdzZWxlY3RlZCc6IHJldHVybiB0YWIuc2VsZWN0ZWQ7XG4gICAgICAgIGNhc2UgJ3Bpbm5lZCc6IHJldHVybiB0YWIucGlubmVkO1xuICAgICAgICBjYXNlICdvcGVuZXJUYWJJZCc6IHJldHVybiB0YWIub3BlbmVyVGFiSWQ7XG4gICAgICAgIGNhc2UgJ2xhc3RBY2Nlc3NlZCc6IHJldHVybiB0YWIubGFzdEFjY2Vzc2VkO1xuICAgICAgICBjYXNlICdjb250ZXh0JzogcmV0dXJuIHRhYi5jb250ZXh0O1xuICAgICAgICBjYXNlICdnZW5yZSc6IHJldHVybiB0YWIuY29udGV4dERhdGE/LmdlbnJlO1xuICAgICAgICBjYXNlICdzaXRlTmFtZSc6IHJldHVybiB0YWIuY29udGV4dERhdGE/LnNpdGVOYW1lO1xuICAgICAgICAvLyBEZXJpdmVkIG9yIG1hcHBlZCBmaWVsZHNcbiAgICAgICAgY2FzZSAnZG9tYWluJzogcmV0dXJuIGRvbWFpbkZyb21VcmwodGFiLnVybCk7XG4gICAgICAgIGNhc2UgJ3N1YmRvbWFpbic6IHJldHVybiBzdWJkb21haW5Gcm9tVXJsKHRhYi51cmwpO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgaWYgKGZpZWxkLmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgICAgICAgICAgcmV0dXJuIGZpZWxkLnNwbGl0KCcuJykucmVkdWNlKChvYmosIGtleSkgPT4gKG9iaiAmJiB0eXBlb2Ygb2JqID09PSAnb2JqZWN0JyAmJiBvYmogIT09IG51bGwpID8gKG9iaiBhcyBhbnkpW2tleV0gOiB1bmRlZmluZWQsIHRhYik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gKHRhYiBhcyBhbnkpW2ZpZWxkXTtcbiAgICB9XG59O1xuXG5jb25zdCBzdHJpcFRsZCA9IChkb21haW46IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIHJldHVybiBkb21haW4ucmVwbGFjZSgvXFwuKGNvbXxvcmd8Z292fG5ldHxlZHV8aW8pJC9pLCBcIlwiKTtcbn07XG5cbmV4cG9ydCBjb25zdCBzZW1hbnRpY0J1Y2tldCA9ICh0aXRsZTogc3RyaW5nLCB1cmw6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGtleSA9IGAke3RpdGxlfSAke3VybH1gLnRvTG93ZXJDYXNlKCk7XG4gIGlmIChrZXkuaW5jbHVkZXMoXCJkb2NcIikgfHwga2V5LmluY2x1ZGVzKFwicmVhZG1lXCIpIHx8IGtleS5pbmNsdWRlcyhcImd1aWRlXCIpKSByZXR1cm4gXCJEb2NzXCI7XG4gIGlmIChrZXkuaW5jbHVkZXMoXCJtYWlsXCIpIHx8IGtleS5pbmNsdWRlcyhcImluYm94XCIpKSByZXR1cm4gXCJDaGF0XCI7XG4gIGlmIChrZXkuaW5jbHVkZXMoXCJkYXNoYm9hcmRcIikgfHwga2V5LmluY2x1ZGVzKFwiY29uc29sZVwiKSkgcmV0dXJuIFwiRGFzaFwiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiaXNzdWVcIikgfHwga2V5LmluY2x1ZGVzKFwidGlja2V0XCIpKSByZXR1cm4gXCJUYXNrc1wiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiZHJpdmVcIikgfHwga2V5LmluY2x1ZGVzKFwic3RvcmFnZVwiKSkgcmV0dXJuIFwiRmlsZXNcIjtcbiAgcmV0dXJuIFwiTWlzY1wiO1xufTtcblxuZXhwb3J0IGNvbnN0IG5hdmlnYXRpb25LZXkgPSAodGFiOiBUYWJNZXRhZGF0YSk6IHN0cmluZyA9PiB7XG4gIGlmICh0YWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiBgY2hpbGQtb2YtJHt0YWIub3BlbmVyVGFiSWR9YDtcbiAgfVxuICByZXR1cm4gYHdpbmRvdy0ke3RhYi53aW5kb3dJZH1gO1xufTtcblxuY29uc3QgZ2V0UmVjZW5jeUxhYmVsID0gKGxhc3RBY2Nlc3NlZDogbnVtYmVyKTogc3RyaW5nID0+IHtcbiAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcbiAgY29uc3QgZGlmZiA9IG5vdyAtIGxhc3RBY2Nlc3NlZDtcbiAgaWYgKGRpZmYgPCAzNjAwMDAwKSByZXR1cm4gXCJKdXN0IG5vd1wiOyAvLyAxaFxuICBpZiAoZGlmZiA8IDg2NDAwMDAwKSByZXR1cm4gXCJUb2RheVwiOyAvLyAyNGhcbiAgaWYgKGRpZmYgPCAxNzI4MDAwMDApIHJldHVybiBcIlllc3RlcmRheVwiOyAvLyA0OGhcbiAgaWYgKGRpZmYgPCA2MDQ4MDAwMDApIHJldHVybiBcIlRoaXMgV2Vla1wiOyAvLyA3ZFxuICByZXR1cm4gXCJPbGRlclwiO1xufTtcblxuY29uc3QgY29sb3JGb3JLZXkgPSAoa2V5OiBzdHJpbmcsIG9mZnNldDogbnVtYmVyKTogc3RyaW5nID0+IENPTE9SU1soTWF0aC5hYnMoaGFzaENvZGUoa2V5KSkgKyBvZmZzZXQpICUgQ09MT1JTLmxlbmd0aF07XG5cbmNvbnN0IGhhc2hDb2RlID0gKHZhbHVlOiBzdHJpbmcpOiBudW1iZXIgPT4ge1xuICBsZXQgaGFzaCA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgdmFsdWUubGVuZ3RoOyBpICs9IDEpIHtcbiAgICBoYXNoID0gKGhhc2ggPDwgNSkgLSBoYXNoICsgdmFsdWUuY2hhckNvZGVBdChpKTtcbiAgICBoYXNoIHw9IDA7XG4gIH1cbiAgcmV0dXJuIGhhc2g7XG59O1xuXG4vLyBIZWxwZXIgdG8gZ2V0IGEgaHVtYW4tcmVhZGFibGUgbGFiZWwgY29tcG9uZW50IGZyb20gYSBzdHJhdGVneSBhbmQgYSBzZXQgb2YgdGFic1xuY29uc3QgZ2V0TGFiZWxDb21wb25lbnQgPSAoc3RyYXRlZ3k6IEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcsIHRhYnM6IFRhYk1ldGFkYXRhW10sIGFsbFRhYnNNYXA6IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhPik6IHN0cmluZyB8IG51bGwgPT4ge1xuICBjb25zdCBmaXJzdFRhYiA9IHRhYnNbMF07XG4gIGlmICghZmlyc3RUYWIpIHJldHVybiBcIlVua25vd25cIjtcblxuICAvLyBDaGVjayBjdXN0b20gc3RyYXRlZ2llcyBmaXJzdFxuICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneSk7XG4gIGlmIChjdXN0b20pIHtcbiAgICAgIHJldHVybiBncm91cGluZ0tleShmaXJzdFRhYiwgc3RyYXRlZ3kpO1xuICB9XG5cbiAgc3dpdGNoIChzdHJhdGVneSkge1xuICAgIGNhc2UgXCJkb21haW5cIjoge1xuICAgICAgY29uc3Qgc2l0ZU5hbWVzID0gbmV3IFNldCh0YWJzLm1hcCh0ID0+IHQuY29udGV4dERhdGE/LnNpdGVOYW1lKS5maWx0ZXIoQm9vbGVhbikpO1xuICAgICAgaWYgKHNpdGVOYW1lcy5zaXplID09PSAxKSB7XG4gICAgICAgIHJldHVybiBzdHJpcFRsZChBcnJheS5mcm9tKHNpdGVOYW1lcylbMF0gYXMgc3RyaW5nKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzdHJpcFRsZChkb21haW5Gcm9tVXJsKGZpcnN0VGFiLnVybCkpO1xuICAgIH1cbiAgICBjYXNlIFwiZG9tYWluX2Z1bGxcIjpcbiAgICAgIHJldHVybiBkb21haW5Gcm9tVXJsKGZpcnN0VGFiLnVybCk7XG4gICAgY2FzZSBcInRvcGljXCI6XG4gICAgICByZXR1cm4gc2VtYW50aWNCdWNrZXQoZmlyc3RUYWIudGl0bGUsIGZpcnN0VGFiLnVybCk7XG4gICAgY2FzZSBcImxpbmVhZ2VcIjpcbiAgICAgIGlmIChmaXJzdFRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGNvbnN0IHBhcmVudCA9IGFsbFRhYnNNYXAuZ2V0KGZpcnN0VGFiLm9wZW5lclRhYklkKTtcbiAgICAgICAgaWYgKHBhcmVudCkge1xuICAgICAgICAgIGNvbnN0IHBhcmVudFRpdGxlID0gcGFyZW50LnRpdGxlLmxlbmd0aCA+IDIwID8gcGFyZW50LnRpdGxlLnN1YnN0cmluZygwLCAyMCkgKyBcIi4uLlwiIDogcGFyZW50LnRpdGxlO1xuICAgICAgICAgIHJldHVybiBgRnJvbTogJHtwYXJlbnRUaXRsZX1gO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBgRnJvbTogVGFiICR7Zmlyc3RUYWIub3BlbmVyVGFiSWR9YDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgV2luZG93ICR7Zmlyc3RUYWIud2luZG93SWR9YDtcbiAgICBjYXNlIFwiY29udGV4dFwiOlxuICAgICAgcmV0dXJuIGZpcnN0VGFiLmNvbnRleHQgfHwgXCJVbmNhdGVnb3JpemVkXCI7XG4gICAgY2FzZSBcInBpbm5lZFwiOlxuICAgICAgcmV0dXJuIGZpcnN0VGFiLnBpbm5lZCA/IFwiUGlubmVkXCIgOiBcIlVucGlubmVkXCI7XG4gICAgY2FzZSBcImFnZVwiOlxuICAgICAgcmV0dXJuIGdldFJlY2VuY3lMYWJlbChmaXJzdFRhYi5sYXN0QWNjZXNzZWQgPz8gMCk7XG4gICAgY2FzZSBcInVybFwiOlxuICAgICAgcmV0dXJuIFwiVVJMIEdyb3VwXCI7XG4gICAgY2FzZSBcInJlY2VuY3lcIjpcbiAgICAgIHJldHVybiBcIlRpbWUgR3JvdXBcIjtcbiAgICBjYXNlIFwibmVzdGluZ1wiOlxuICAgICAgcmV0dXJuIGZpcnN0VGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQgPyBcIkNoaWxkcmVuXCIgOiBcIlJvb3RzXCI7XG4gICAgZGVmYXVsdDpcbiAgICAgIGNvbnN0IHZhbCA9IGdldEZpZWxkVmFsdWUoZmlyc3RUYWIsIHN0cmF0ZWd5KTtcbiAgICAgIGlmICh2YWwgIT09IHVuZGVmaW5lZCAmJiB2YWwgIT09IG51bGwpIHtcbiAgICAgICAgICByZXR1cm4gU3RyaW5nKHZhbCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gXCJVbmtub3duXCI7XG4gIH1cbn07XG5cbmNvbnN0IGdlbmVyYXRlTGFiZWwgPSAoXG4gIHN0cmF0ZWdpZXM6IChHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nKVtdLFxuICB0YWJzOiBUYWJNZXRhZGF0YVtdLFxuICBhbGxUYWJzTWFwOiBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YT5cbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGxhYmVscyA9IHN0cmF0ZWdpZXNcbiAgICAubWFwKHMgPT4gZ2V0TGFiZWxDb21wb25lbnQocywgdGFicywgYWxsVGFic01hcCkpXG4gICAgLmZpbHRlcihsID0+IGwgJiYgbCAhPT0gXCJVbmtub3duXCIgJiYgbCAhPT0gXCJHcm91cFwiICYmIGwgIT09IFwiVVJMIEdyb3VwXCIgJiYgbCAhPT0gXCJUaW1lIEdyb3VwXCIgJiYgbCAhPT0gXCJNaXNjXCIpO1xuXG4gIGlmIChsYWJlbHMubGVuZ3RoID09PSAwKSByZXR1cm4gXCJHcm91cFwiO1xuICByZXR1cm4gQXJyYXkuZnJvbShuZXcgU2V0KGxhYmVscykpLmpvaW4oXCIgLSBcIik7XG59O1xuXG5jb25zdCBnZXRTdHJhdGVneUNvbG9yUnVsZSA9IChzdHJhdGVneUlkOiBzdHJpbmcpOiBHcm91cGluZ1J1bGUgfCB1bmRlZmluZWQgPT4ge1xuICAgIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5SWQpO1xuICAgIGlmICghY3VzdG9tKSByZXR1cm4gdW5kZWZpbmVkO1xuXG4gICAgY29uc3QgZ3JvdXBpbmdSdWxlc0xpc3QgPSBhc0FycmF5PEdyb3VwaW5nUnVsZT4oY3VzdG9tLmdyb3VwaW5nUnVsZXMpO1xuICAgIC8vIEl0ZXJhdGUgbWFudWFsbHkgdG8gY2hlY2sgY29sb3JcbiAgICBmb3IgKGxldCBpID0gZ3JvdXBpbmdSdWxlc0xpc3QubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgY29uc3QgcnVsZSA9IGdyb3VwaW5nUnVsZXNMaXN0W2ldO1xuICAgICAgICBpZiAocnVsZSAmJiBydWxlLmNvbG9yICYmIHJ1bGUuY29sb3IgIT09ICdyYW5kb20nKSB7XG4gICAgICAgICAgICByZXR1cm4gcnVsZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xufTtcblxuY29uc3QgcmVzb2x2ZVdpbmRvd01vZGUgPSAobW9kZXM6IChzdHJpbmcgfCB1bmRlZmluZWQpW10pOiBcImN1cnJlbnRcIiB8IFwibmV3XCIgfCBcImNvbXBvdW5kXCIgPT4ge1xuICAgIGlmIChtb2Rlcy5pbmNsdWRlcyhcIm5ld1wiKSkgcmV0dXJuIFwibmV3XCI7XG4gICAgaWYgKG1vZGVzLmluY2x1ZGVzKFwiY29tcG91bmRcIikpIHJldHVybiBcImNvbXBvdW5kXCI7XG4gICAgcmV0dXJuIFwiY3VycmVudFwiO1xufTtcblxuZXhwb3J0IGNvbnN0IGdyb3VwVGFicyA9IChcbiAgdGFiczogVGFiTWV0YWRhdGFbXSxcbiAgc3RyYXRlZ2llczogKFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZylbXVxuKTogVGFiR3JvdXBbXSA9PiB7XG4gIGNvbnN0IGF2YWlsYWJsZVN0cmF0ZWdpZXMgPSBnZXRTdHJhdGVnaWVzKGN1c3RvbVN0cmF0ZWdpZXMpO1xuICBjb25zdCBlZmZlY3RpdmVTdHJhdGVnaWVzID0gc3RyYXRlZ2llcy5maWx0ZXIocyA9PiBhdmFpbGFibGVTdHJhdGVnaWVzLmZpbmQoYXZhaWwgPT4gYXZhaWwuaWQgPT09IHMpPy5pc0dyb3VwaW5nKTtcbiAgY29uc3QgYnVja2V0cyA9IG5ldyBNYXA8c3RyaW5nLCBUYWJHcm91cD4oKTtcblxuICBjb25zdCBhbGxUYWJzTWFwID0gbmV3IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhPigpO1xuICB0YWJzLmZvckVhY2godCA9PiBhbGxUYWJzTWFwLnNldCh0LmlkLCB0KSk7XG5cbiAgdGFicy5mb3JFYWNoKCh0YWIpID0+IHtcbiAgICBsZXQga2V5czogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBhcHBsaWVkU3RyYXRlZ2llczogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBjb2xsZWN0ZWRNb2Rlczogc3RyaW5nW10gPSBbXTtcblxuICAgIHRyeSB7XG4gICAgICAgIGZvciAoY29uc3QgcyBvZiBlZmZlY3RpdmVTdHJhdGVnaWVzKSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBnZXRHcm91cGluZ1Jlc3VsdCh0YWIsIHMpO1xuICAgICAgICAgICAgaWYgKHJlc3VsdC5rZXkgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBrZXlzLnB1c2goYCR7c306JHtyZXN1bHQua2V5fWApO1xuICAgICAgICAgICAgICAgIGFwcGxpZWRTdHJhdGVnaWVzLnB1c2gocyk7XG4gICAgICAgICAgICAgICAgY29sbGVjdGVkTW9kZXMucHVzaChyZXN1bHQubW9kZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGxvZ0RlYnVnKFwiRXJyb3IgZ2VuZXJhdGluZyBncm91cGluZyBrZXlcIiwgeyB0YWJJZDogdGFiLmlkLCBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICByZXR1cm47IC8vIFNraXAgdGhpcyB0YWIgb24gZXJyb3JcbiAgICB9XG5cbiAgICAvLyBJZiBubyBzdHJhdGVnaWVzIGFwcGxpZWQgKGUuZy4gYWxsIGZpbHRlcmVkIG91dCksIHNraXAgZ3JvdXBpbmcgZm9yIHRoaXMgdGFiXG4gICAgaWYgKGtleXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBlZmZlY3RpdmVNb2RlID0gcmVzb2x2ZVdpbmRvd01vZGUoY29sbGVjdGVkTW9kZXMpO1xuICAgIGNvbnN0IHZhbHVlS2V5ID0ga2V5cy5qb2luKFwiOjpcIik7XG4gICAgbGV0IGJ1Y2tldEtleSA9IFwiXCI7XG4gICAgaWYgKGVmZmVjdGl2ZU1vZGUgPT09ICdjdXJyZW50Jykge1xuICAgICAgICAgYnVja2V0S2V5ID0gYHdpbmRvdy0ke3RhYi53aW5kb3dJZH06OmAgKyB2YWx1ZUtleTtcbiAgICB9IGVsc2Uge1xuICAgICAgICAgYnVja2V0S2V5ID0gYGdsb2JhbDo6YCArIHZhbHVlS2V5O1xuICAgIH1cblxuICAgIGxldCBncm91cCA9IGJ1Y2tldHMuZ2V0KGJ1Y2tldEtleSk7XG4gICAgaWYgKCFncm91cCkge1xuICAgICAgbGV0IGdyb3VwQ29sb3IgPSBudWxsO1xuICAgICAgbGV0IGNvbG9yRmllbGQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICAgICAgZm9yIChjb25zdCBzSWQgb2YgYXBwbGllZFN0cmF0ZWdpZXMpIHtcbiAgICAgICAgY29uc3QgcnVsZSA9IGdldFN0cmF0ZWd5Q29sb3JSdWxlKHNJZCk7XG4gICAgICAgIGlmIChydWxlKSB7XG4gICAgICAgICAgICBncm91cENvbG9yID0gcnVsZS5jb2xvcjtcbiAgICAgICAgICAgIGNvbG9yRmllbGQgPSBydWxlLmNvbG9yRmllbGQ7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoZ3JvdXBDb2xvciA9PT0gJ21hdGNoJykge1xuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkodmFsdWVLZXksIDApO1xuICAgICAgfSBlbHNlIGlmIChncm91cENvbG9yID09PSAnZmllbGQnICYmIGNvbG9yRmllbGQpIHtcbiAgICAgICAgY29uc3QgdmFsID0gZ2V0RmllbGRWYWx1ZSh0YWIsIGNvbG9yRmllbGQpO1xuICAgICAgICBjb25zdCBrZXkgPSB2YWwgIT09IHVuZGVmaW5lZCAmJiB2YWwgIT09IG51bGwgPyBTdHJpbmcodmFsKSA6IFwiXCI7XG4gICAgICAgIGdyb3VwQ29sb3IgPSBjb2xvckZvcktleShrZXksIDApO1xuICAgICAgfSBlbHNlIGlmICghZ3JvdXBDb2xvciB8fCBncm91cENvbG9yID09PSAnZmllbGQnKSB7XG4gICAgICAgIGdyb3VwQ29sb3IgPSBjb2xvckZvcktleShidWNrZXRLZXksIGJ1Y2tldHMuc2l6ZSk7XG4gICAgICB9XG5cbiAgICAgIGdyb3VwID0ge1xuICAgICAgICBpZDogYnVja2V0S2V5LFxuICAgICAgICB3aW5kb3dJZDogdGFiLndpbmRvd0lkLFxuICAgICAgICBsYWJlbDogXCJcIixcbiAgICAgICAgY29sb3I6IGdyb3VwQ29sb3IsXG4gICAgICAgIHRhYnM6IFtdLFxuICAgICAgICByZWFzb246IGFwcGxpZWRTdHJhdGVnaWVzLmpvaW4oXCIgKyBcIiksXG4gICAgICAgIHdpbmRvd01vZGU6IGVmZmVjdGl2ZU1vZGVcbiAgICAgIH07XG4gICAgICBidWNrZXRzLnNldChidWNrZXRLZXksIGdyb3VwKTtcbiAgICB9XG4gICAgZ3JvdXAudGFicy5wdXNoKHRhYik7XG4gIH0pO1xuXG4gIGNvbnN0IGdyb3VwcyA9IEFycmF5LmZyb20oYnVja2V0cy52YWx1ZXMoKSk7XG4gIGdyb3Vwcy5mb3JFYWNoKGdyb3VwID0+IHtcbiAgICBncm91cC5sYWJlbCA9IGdlbmVyYXRlTGFiZWwoZWZmZWN0aXZlU3RyYXRlZ2llcywgZ3JvdXAudGFicywgYWxsVGFic01hcCk7XG4gIH0pO1xuXG4gIHJldHVybiBncm91cHM7XG59O1xuXG5jb25zdCBjaGVja1ZhbHVlTWF0Y2ggPSAoXG4gICAgb3BlcmF0b3I6IHN0cmluZyxcbiAgICByYXdWYWx1ZTogYW55LFxuICAgIHJ1bGVWYWx1ZTogc3RyaW5nXG4pOiB7IGlzTWF0Y2g6IGJvb2xlYW47IG1hdGNoT2JqOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsIH0gPT4ge1xuICAgIGNvbnN0IHZhbHVlU3RyID0gcmF3VmFsdWUgIT09IHVuZGVmaW5lZCAmJiByYXdWYWx1ZSAhPT0gbnVsbCA/IFN0cmluZyhyYXdWYWx1ZSkgOiBcIlwiO1xuICAgIGNvbnN0IHZhbHVlVG9DaGVjayA9IHZhbHVlU3RyLnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3QgcGF0dGVyblRvQ2hlY2sgPSBydWxlVmFsdWUgPyBydWxlVmFsdWUudG9Mb3dlckNhc2UoKSA6IFwiXCI7XG5cbiAgICBsZXQgaXNNYXRjaCA9IGZhbHNlO1xuICAgIGxldCBtYXRjaE9iajogUmVnRXhwRXhlY0FycmF5IHwgbnVsbCA9IG51bGw7XG5cbiAgICBzd2l0Y2ggKG9wZXJhdG9yKSB7XG4gICAgICAgIGNhc2UgJ2NvbnRhaW5zJzogaXNNYXRjaCA9IHZhbHVlVG9DaGVjay5pbmNsdWRlcyhwYXR0ZXJuVG9DaGVjayk7IGJyZWFrO1xuICAgICAgICBjYXNlICdkb2VzTm90Q29udGFpbic6IGlzTWF0Y2ggPSAhdmFsdWVUb0NoZWNrLmluY2x1ZGVzKHBhdHRlcm5Ub0NoZWNrKTsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2VxdWFscyc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2sgPT09IHBhdHRlcm5Ub0NoZWNrOyBicmVhaztcbiAgICAgICAgY2FzZSAnc3RhcnRzV2l0aCc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suc3RhcnRzV2l0aChwYXR0ZXJuVG9DaGVjayk7IGJyZWFrO1xuICAgICAgICBjYXNlICdlbmRzV2l0aCc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suZW5kc1dpdGgocGF0dGVyblRvQ2hlY2spOyBicmVhaztcbiAgICAgICAgY2FzZSAnZXhpc3RzJzogaXNNYXRjaCA9IHJhd1ZhbHVlICE9PSB1bmRlZmluZWQ7IGJyZWFrO1xuICAgICAgICBjYXNlICdkb2VzTm90RXhpc3QnOiBpc01hdGNoID0gcmF3VmFsdWUgPT09IHVuZGVmaW5lZDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2lzTnVsbCc6IGlzTWF0Y2ggPSByYXdWYWx1ZSA9PT0gbnVsbDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2lzTm90TnVsbCc6IGlzTWF0Y2ggPSByYXdWYWx1ZSAhPT0gbnVsbDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ21hdGNoZXMnOlxuICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKHJ1bGVWYWx1ZSwgJ2knKTtcbiAgICAgICAgICAgICAgICBtYXRjaE9iaiA9IHJlZ2V4LmV4ZWModmFsdWVTdHIpO1xuICAgICAgICAgICAgICAgIGlzTWF0Y2ggPSAhIW1hdGNoT2JqO1xuICAgICAgICAgICAgIH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHJldHVybiB7IGlzTWF0Y2gsIG1hdGNoT2JqIH07XG59O1xuXG5leHBvcnQgY29uc3QgY2hlY2tDb25kaXRpb24gPSAoY29uZGl0aW9uOiBSdWxlQ29uZGl0aW9uLCB0YWI6IFRhYk1ldGFkYXRhKTogYm9vbGVhbiA9PiB7XG4gICAgaWYgKCFjb25kaXRpb24pIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCByYXdWYWx1ZSA9IGdldEZpZWxkVmFsdWUodGFiLCBjb25kaXRpb24uZmllbGQpO1xuICAgIGNvbnN0IHsgaXNNYXRjaCB9ID0gY2hlY2tWYWx1ZU1hdGNoKGNvbmRpdGlvbi5vcGVyYXRvciwgcmF3VmFsdWUsIGNvbmRpdGlvbi52YWx1ZSk7XG4gICAgcmV0dXJuIGlzTWF0Y2g7XG59O1xuXG5mdW5jdGlvbiBldmFsdWF0ZUxlZ2FjeVJ1bGVzKGxlZ2FjeVJ1bGVzOiBTdHJhdGVneVJ1bGVbXSwgdGFiOiBUYWJNZXRhZGF0YSk6IHN0cmluZyB8IG51bGwge1xuICAgIC8vIERlZmVuc2l2ZSBjaGVja1xuICAgIGlmICghbGVnYWN5UnVsZXMgfHwgIUFycmF5LmlzQXJyYXkobGVnYWN5UnVsZXMpKSB7XG4gICAgICAgIGlmICghbGVnYWN5UnVsZXMpIHJldHVybiBudWxsO1xuICAgICAgICAvLyBUcnkgYXNBcnJheSBpZiBpdCdzIG5vdCBhcnJheSBidXQgdHJ1dGh5ICh1bmxpa2VseSBnaXZlbiBwcmV2aW91cyBsb2dpYyBidXQgc2FmZSlcbiAgICB9XG5cbiAgICBjb25zdCBsZWdhY3lSdWxlc0xpc3QgPSBhc0FycmF5PFN0cmF0ZWd5UnVsZT4obGVnYWN5UnVsZXMpO1xuICAgIGlmIChsZWdhY3lSdWxlc0xpc3QubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcblxuICAgIHRyeSB7XG4gICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBsZWdhY3lSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgIGlmICghcnVsZSkgY29udGludWU7XG4gICAgICAgICAgICBjb25zdCByYXdWYWx1ZSA9IGdldEZpZWxkVmFsdWUodGFiLCBydWxlLmZpZWxkKTtcbiAgICAgICAgICAgIGNvbnN0IHsgaXNNYXRjaCwgbWF0Y2hPYmogfSA9IGNoZWNrVmFsdWVNYXRjaChydWxlLm9wZXJhdG9yLCByYXdWYWx1ZSwgcnVsZS52YWx1ZSk7XG5cbiAgICAgICAgICAgIGlmIChpc01hdGNoKSB7XG4gICAgICAgICAgICAgICAgbGV0IHJlc3VsdCA9IHJ1bGUucmVzdWx0O1xuICAgICAgICAgICAgICAgIGlmIChtYXRjaE9iaikge1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IG1hdGNoT2JqLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UobmV3IFJlZ0V4cChgXFxcXCQke2l9YCwgJ2cnKSwgbWF0Y2hPYmpbaV0gfHwgXCJcIik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGxvZ0RlYnVnKFwiRXJyb3IgZXZhbHVhdGluZyBsZWdhY3kgcnVsZXNcIiwgeyBlcnJvcjogU3RyaW5nKGVycm9yKSB9KTtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbmV4cG9ydCBjb25zdCBnZXRHcm91cGluZ1Jlc3VsdCA9ICh0YWI6IFRhYk1ldGFkYXRhLCBzdHJhdGVneTogR3JvdXBpbmdTdHJhdGVneSB8IHN0cmluZyk6IHsga2V5OiBzdHJpbmcgfCBudWxsLCBtb2RlOiBcImN1cnJlbnRcIiB8IFwibmV3XCIgfCBcImNvbXBvdW5kXCIgfSA9PiB7XG4gIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5KTtcbiAgaWYgKGN1c3RvbSkge1xuICAgICAgY29uc3QgZmlsdGVyR3JvdXBzTGlzdCA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbltdPihjdXN0b20uZmlsdGVyR3JvdXBzKTtcbiAgICAgIGNvbnN0IGZpbHRlcnNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihjdXN0b20uZmlsdGVycyk7XG5cbiAgICAgIGxldCBtYXRjaCA9IGZhbHNlO1xuXG4gICAgICBpZiAoZmlsdGVyR3JvdXBzTGlzdC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgLy8gT1IgbG9naWNcbiAgICAgICAgICBmb3IgKGNvbnN0IGdyb3VwIG9mIGZpbHRlckdyb3Vwc0xpc3QpIHtcbiAgICAgICAgICAgICAgY29uc3QgZ3JvdXBSdWxlcyA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbj4oZ3JvdXApO1xuICAgICAgICAgICAgICBpZiAoZ3JvdXBSdWxlcy5sZW5ndGggPT09IDAgfHwgZ3JvdXBSdWxlcy5ldmVyeShyID0+IGNoZWNrQ29uZGl0aW9uKHIsIHRhYikpKSB7XG4gICAgICAgICAgICAgICAgICBtYXRjaCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoZmlsdGVyc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIC8vIExlZ2FjeS9TaW1wbGUgQU5EIGxvZ2ljXG4gICAgICAgICAgaWYgKGZpbHRlcnNMaXN0LmV2ZXJ5KGYgPT4gY2hlY2tDb25kaXRpb24oZiwgdGFiKSkpIHtcbiAgICAgICAgICAgICAgbWF0Y2ggPSB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gTm8gZmlsdGVycyAtPiBNYXRjaCBhbGxcbiAgICAgICAgICBtYXRjaCA9IHRydWU7XG4gICAgICB9XG5cbiAgICAgIGlmICghbWF0Y2gpIHtcbiAgICAgICAgICByZXR1cm4geyBrZXk6IG51bGwsIG1vZGU6IFwiY3VycmVudFwiIH07XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGdyb3VwaW5nUnVsZXNMaXN0ID0gYXNBcnJheTxHcm91cGluZ1J1bGU+KGN1c3RvbS5ncm91cGluZ1J1bGVzKTtcbiAgICAgIGlmIChncm91cGluZ1J1bGVzTGlzdC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgY29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG4gICAgICAgICAgY29uc3QgbW9kZXM6IHN0cmluZ1tdID0gW107XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cGluZ1J1bGVzTGlzdCkge1xuICAgICAgICAgICAgICAgIGlmICghcnVsZSkgY29udGludWU7XG4gICAgICAgICAgICAgICAgbGV0IHZhbCA9IFwiXCI7XG4gICAgICAgICAgICAgICAgaWYgKHJ1bGUuc291cmNlID09PSAnZmllbGQnKSB7XG4gICAgICAgICAgICAgICAgICAgICBjb25zdCByYXcgPSBnZXRGaWVsZFZhbHVlKHRhYiwgcnVsZS52YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICB2YWwgPSByYXcgIT09IHVuZGVmaW5lZCAmJiByYXcgIT09IG51bGwgPyBTdHJpbmcocmF3KSA6IFwiXCI7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHJ1bGUudmFsdWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHZhbCAmJiBydWxlLnRyYW5zZm9ybSAmJiBydWxlLnRyYW5zZm9ybSAhPT0gJ25vbmUnKSB7XG4gICAgICAgICAgICAgICAgICAgIHN3aXRjaCAocnVsZS50cmFuc2Zvcm0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ3N0cmlwVGxkJzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBzdHJpcFRsZCh2YWwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnbG93ZXJjYXNlJzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSB2YWwudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ3VwcGVyY2FzZSc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gdmFsLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdmaXJzdENoYXInOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHZhbC5jaGFyQXQoMCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdkb21haW4nOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IGRvbWFpbkZyb21VcmwodmFsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ2hvc3RuYW1lJzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gbmV3IFVSTCh2YWwpLmhvc3RuYW1lO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBrZWVwIGFzIGlzICovIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ3JlZ2V4JzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocnVsZS50cmFuc2Zvcm1QYXR0ZXJuKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsZXQgcmVnZXggPSByZWdleENhY2hlLmdldChydWxlLnRyYW5zZm9ybVBhdHRlcm4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFyZWdleCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlZ2V4ID0gbmV3IFJlZ0V4cChydWxlLnRyYW5zZm9ybVBhdHRlcm4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlZ2V4Q2FjaGUuc2V0KHJ1bGUudHJhbnNmb3JtUGF0dGVybiwgcmVnZXgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbWF0Y2ggPSByZWdleC5leGVjKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsZXQgZXh0cmFjdGVkID0gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IG1hdGNoLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4dHJhY3RlZCArPSBtYXRjaFtpXSB8fCBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBleHRyYWN0ZWQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxvZ0RlYnVnKFwiSW52YWxpZCByZWdleCBpbiB0cmFuc2Zvcm1cIiwgeyBwYXR0ZXJuOiBydWxlLnRyYW5zZm9ybVBhdHRlcm4sIGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodmFsKSB7XG4gICAgICAgICAgICAgICAgICAgIHBhcnRzLnB1c2godmFsKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJ1bGUud2luZG93TW9kZSkgbW9kZXMucHVzaChydWxlLndpbmRvd01vZGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgbG9nRGVidWcoXCJFcnJvciBhcHBseWluZyBncm91cGluZyBydWxlc1wiLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHsga2V5OiBwYXJ0cy5qb2luKFwiIC0gXCIpLCBtb2RlOiByZXNvbHZlV2luZG93TW9kZShtb2RlcykgfTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHsga2V5OiBjdXN0b20uZmFsbGJhY2sgfHwgXCJNaXNjXCIsIG1vZGU6IFwiY3VycmVudFwiIH07XG4gICAgICB9IGVsc2UgaWYgKGN1c3RvbS5ydWxlcykge1xuICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGV2YWx1YXRlTGVnYWN5UnVsZXMoYXNBcnJheTxTdHJhdGVneVJ1bGU+KGN1c3RvbS5ydWxlcyksIHRhYik7XG4gICAgICAgICAgaWYgKHJlc3VsdCkgcmV0dXJuIHsga2V5OiByZXN1bHQsIG1vZGU6IFwiY3VycmVudFwiIH07XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7IGtleTogY3VzdG9tLmZhbGxiYWNrIHx8IFwiTWlzY1wiLCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICB9XG5cbiAgLy8gQnVpbHQtaW4gc3RyYXRlZ2llc1xuICBsZXQgc2ltcGxlS2V5OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgc3dpdGNoIChzdHJhdGVneSkge1xuICAgIGNhc2UgXCJkb21haW5cIjpcbiAgICBjYXNlIFwiZG9tYWluX2Z1bGxcIjpcbiAgICAgIHNpbXBsZUtleSA9IGRvbWFpbkZyb21VcmwodGFiLnVybCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwidG9waWNcIjpcbiAgICAgIHNpbXBsZUtleSA9IHNlbWFudGljQnVja2V0KHRhYi50aXRsZSwgdGFiLnVybCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwibGluZWFnZVwiOlxuICAgICAgc2ltcGxlS2V5ID0gbmF2aWdhdGlvbktleSh0YWIpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcImNvbnRleHRcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi5jb250ZXh0IHx8IFwiVW5jYXRlZ29yaXplZFwiO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInBpbm5lZFwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLnBpbm5lZCA/IFwicGlubmVkXCIgOiBcInVucGlubmVkXCI7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwiYWdlXCI6XG4gICAgICBzaW1wbGVLZXkgPSBnZXRSZWNlbmN5TGFiZWwodGFiLmxhc3RBY2Nlc3NlZCA/PyAwKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJ1cmxcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi51cmw7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwidGl0bGVcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi50aXRsZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJyZWNlbmN5XCI6XG4gICAgICBzaW1wbGVLZXkgPSBTdHJpbmcodGFiLmxhc3RBY2Nlc3NlZCA/PyAwKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJuZXN0aW5nXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCA/IFwiY2hpbGRcIiA6IFwicm9vdFwiO1xuICAgICAgYnJlYWs7XG4gICAgZGVmYXVsdDpcbiAgICAgICAgY29uc3QgdmFsID0gZ2V0RmllbGRWYWx1ZSh0YWIsIHN0cmF0ZWd5KTtcbiAgICAgICAgaWYgKHZhbCAhPT0gdW5kZWZpbmVkICYmIHZhbCAhPT0gbnVsbCkge1xuICAgICAgICAgICAgc2ltcGxlS2V5ID0gU3RyaW5nKHZhbCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzaW1wbGVLZXkgPSBcIlVua25vd25cIjtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgfVxuICByZXR1cm4geyBrZXk6IHNpbXBsZUtleSwgbW9kZTogXCJjdXJyZW50XCIgfTtcbn07XG5cbmV4cG9ydCBjb25zdCBncm91cGluZ0tleSA9ICh0YWI6IFRhYk1ldGFkYXRhLCBzdHJhdGVneTogR3JvdXBpbmdTdHJhdGVneSB8IHN0cmluZyk6IHN0cmluZyB8IG51bGwgPT4ge1xuICAgIHJldHVybiBnZXRHcm91cGluZ1Jlc3VsdCh0YWIsIHN0cmF0ZWd5KS5rZXk7XG59O1xuXG5mdW5jdGlvbiBpc0NvbnRleHRGaWVsZChmaWVsZDogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIGZpZWxkID09PSAnY29udGV4dCcgfHwgZmllbGQgPT09ICdnZW5yZScgfHwgZmllbGQgPT09ICdzaXRlTmFtZScgfHwgZmllbGQuc3RhcnRzV2l0aCgnY29udGV4dERhdGEuJyk7XG59XG5cbmV4cG9ydCBjb25zdCByZXF1aXJlc0NvbnRleHRBbmFseXNpcyA9IChzdHJhdGVneUlkczogKHN0cmluZyB8IFNvcnRpbmdTdHJhdGVneSlbXSk6IGJvb2xlYW4gPT4ge1xuICAgIC8vIENoZWNrIGlmIFwiY29udGV4dFwiIHN0cmF0ZWd5IGlzIGV4cGxpY2l0bHkgcmVxdWVzdGVkXG4gICAgaWYgKHN0cmF0ZWd5SWRzLmluY2x1ZGVzKFwiY29udGV4dFwiKSkgcmV0dXJuIHRydWU7XG5cbiAgICBjb25zdCBzdHJhdGVnaWVzID0gZ2V0U3RyYXRlZ2llcyhjdXN0b21TdHJhdGVnaWVzKTtcbiAgICAvLyBmaWx0ZXIgb25seSB0aG9zZSB0aGF0IG1hdGNoIHRoZSByZXF1ZXN0ZWQgSURzXG4gICAgY29uc3QgYWN0aXZlRGVmcyA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gc3RyYXRlZ3lJZHMuaW5jbHVkZXMocy5pZCkpO1xuXG4gICAgZm9yIChjb25zdCBkZWYgb2YgYWN0aXZlRGVmcykge1xuICAgICAgICAvLyBJZiBpdCdzIGEgYnVpbHQtaW4gc3RyYXRlZ3kgdGhhdCBuZWVkcyBjb250ZXh0IChvbmx5ICdjb250ZXh0JyBkb2VzKVxuICAgICAgICBpZiAoZGVmLmlkID09PSAnY29udGV4dCcpIHJldHVybiB0cnVlO1xuXG4gICAgICAgIC8vIElmIGl0IGlzIGEgY3VzdG9tIHN0cmF0ZWd5IChvciBvdmVycmlkZXMgYnVpbHQtaW4pLCBjaGVjayBpdHMgcnVsZXNcbiAgICAgICAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRlZ2llcy5maW5kKGMgPT4gYy5pZCA9PT0gZGVmLmlkKTtcbiAgICAgICAgaWYgKGN1c3RvbSkge1xuICAgICAgICAgICAgIGNvbnN0IGdyb3VwUnVsZXNMaXN0ID0gYXNBcnJheTxHcm91cGluZ1J1bGU+KGN1c3RvbS5ncm91cGluZ1J1bGVzKTtcbiAgICAgICAgICAgICBjb25zdCBzb3J0UnVsZXNMaXN0ID0gYXNBcnJheTxTb3J0aW5nUnVsZT4oY3VzdG9tLnNvcnRpbmdSdWxlcyk7XG4gICAgICAgICAgICAgY29uc3QgZ3JvdXBTb3J0UnVsZXNMaXN0ID0gYXNBcnJheTxTb3J0aW5nUnVsZT4oY3VzdG9tLmdyb3VwU29ydGluZ1J1bGVzKTtcbiAgICAgICAgICAgICBjb25zdCBmaWx0ZXJzTGlzdCA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbj4oY3VzdG9tLmZpbHRlcnMpO1xuICAgICAgICAgICAgIGNvbnN0IGZpbHRlckdyb3Vwc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb25bXT4oY3VzdG9tLmZpbHRlckdyb3Vwcyk7XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZ3JvdXBSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgcnVsZS5zb3VyY2UgPT09ICdmaWVsZCcgJiYgaXNDb250ZXh0RmllbGQocnVsZS52YWx1ZSkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBydWxlLmNvbG9yID09PSAnZmllbGQnICYmIHJ1bGUuY29sb3JGaWVsZCAmJiBpc0NvbnRleHRGaWVsZChydWxlLmNvbG9yRmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2Ygc29ydFJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBpc0NvbnRleHRGaWVsZChydWxlLmZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwU29ydFJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBpc0NvbnRleHRGaWVsZChydWxlLmZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGZpbHRlcnNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IGdyb3VwIG9mIGZpbHRlckdyb3Vwc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgY29uc3QgZ3JvdXBSdWxlcyA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbj4oZ3JvdXApO1xuICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZ3JvdXBSdWxlcykge1xuICAgICAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbn07XG4iLCAiaW1wb3J0IHsgU29ydGluZ1N0cmF0ZWd5LCBUYWJNZXRhZGF0YSwgQ3VzdG9tU3RyYXRlZ3ksIFNvcnRpbmdSdWxlIH0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgZG9tYWluRnJvbVVybCwgc2VtYW50aWNCdWNrZXQsIG5hdmlnYXRpb25LZXksIGdyb3VwaW5nS2V5LCBnZXRGaWVsZFZhbHVlLCBnZXRDdXN0b21TdHJhdGVnaWVzIH0gZnJvbSBcIi4vZ3JvdXBpbmdTdHJhdGVnaWVzLmpzXCI7XG5pbXBvcnQgeyBsb2dEZWJ1ZyB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBhc0FycmF5IH0gZnJvbSBcIi4uL3NoYXJlZC91dGlscy5qc1wiO1xuXG5leHBvcnQgY29uc3QgcmVjZW5jeVNjb3JlID0gKHRhYjogVGFiTWV0YWRhdGEpID0+IHRhYi5sYXN0QWNjZXNzZWQgPz8gMDtcbmV4cG9ydCBjb25zdCBoaWVyYXJjaHlTY29yZSA9ICh0YWI6IFRhYk1ldGFkYXRhKSA9PiAodGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQgPyAxIDogMCk7XG5leHBvcnQgY29uc3QgcGlubmVkU2NvcmUgPSAodGFiOiBUYWJNZXRhZGF0YSkgPT4gKHRhYi5waW5uZWQgPyAwIDogMSk7XG5cbmV4cG9ydCBjb25zdCBzb3J0VGFicyA9ICh0YWJzOiBUYWJNZXRhZGF0YVtdLCBzdHJhdGVnaWVzOiBTb3J0aW5nU3RyYXRlZ3lbXSk6IFRhYk1ldGFkYXRhW10gPT4ge1xuICBjb25zdCBzY29yaW5nOiBTb3J0aW5nU3RyYXRlZ3lbXSA9IHN0cmF0ZWdpZXMubGVuZ3RoID8gc3RyYXRlZ2llcyA6IFtcInBpbm5lZFwiLCBcInJlY2VuY3lcIl07XG4gIHJldHVybiBbLi4udGFic10uc29ydCgoYSwgYikgPT4ge1xuICAgIGZvciAoY29uc3Qgc3RyYXRlZ3kgb2Ygc2NvcmluZykge1xuICAgICAgY29uc3QgZGlmZiA9IGNvbXBhcmVCeShzdHJhdGVneSwgYSwgYik7XG4gICAgICBpZiAoZGlmZiAhPT0gMCkgcmV0dXJuIGRpZmY7XG4gICAgfVxuICAgIHJldHVybiBhLmlkIC0gYi5pZDtcbiAgfSk7XG59O1xuXG5leHBvcnQgY29uc3QgY29tcGFyZUJ5ID0gKHN0cmF0ZWd5OiBTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmcsIGE6IFRhYk1ldGFkYXRhLCBiOiBUYWJNZXRhZGF0YSk6IG51bWJlciA9PiB7XG4gIC8vIDEuIENoZWNrIEN1c3RvbSBTdHJhdGVnaWVzIGZvciBTb3J0aW5nIFJ1bGVzXG4gIGNvbnN0IGN1c3RvbVN0cmF0cyA9IGdldEN1c3RvbVN0cmF0ZWdpZXMoKTtcbiAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneSk7XG4gIGlmIChjdXN0b20pIHtcbiAgICAgIGNvbnN0IHNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihjdXN0b20uc29ydGluZ1J1bGVzKTtcbiAgICAgIGlmIChzb3J0UnVsZXNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAvLyBFdmFsdWF0ZSBjdXN0b20gc29ydGluZyBydWxlcyBpbiBvcmRlclxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBzb3J0UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgICBpZiAoIXJ1bGUpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgY29uc3QgdmFsQSA9IGdldEZpZWxkVmFsdWUoYSwgcnVsZS5maWVsZCk7XG4gICAgICAgICAgICAgICAgICBjb25zdCB2YWxCID0gZ2V0RmllbGRWYWx1ZShiLCBydWxlLmZpZWxkKTtcblxuICAgICAgICAgICAgICAgICAgbGV0IHJlc3VsdCA9IDA7XG4gICAgICAgICAgICAgICAgICBpZiAodmFsQSA8IHZhbEIpIHJlc3VsdCA9IC0xO1xuICAgICAgICAgICAgICAgICAgZWxzZSBpZiAodmFsQSA+IHZhbEIpIHJlc3VsdCA9IDE7XG5cbiAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQgIT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcnVsZS5vcmRlciA9PT0gJ2Rlc2MnID8gLXJlc3VsdCA6IHJlc3VsdDtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgbG9nRGVidWcoXCJFcnJvciBldmFsdWF0aW5nIGN1c3RvbSBzb3J0aW5nIHJ1bGVzXCIsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gSWYgYWxsIHJ1bGVzIGVxdWFsLCBjb250aW51ZSB0byBuZXh0IHN0cmF0ZWd5IChyZXR1cm4gMClcbiAgICAgICAgICByZXR1cm4gMDtcbiAgICAgIH1cbiAgfVxuXG4gIC8vIDIuIEJ1aWx0LWluIG9yIGZhbGxiYWNrXG4gIHN3aXRjaCAoc3RyYXRlZ3kpIHtcbiAgICBjYXNlIFwicmVjZW5jeVwiOlxuICAgICAgcmV0dXJuIChiLmxhc3RBY2Nlc3NlZCA/PyAwKSAtIChhLmxhc3RBY2Nlc3NlZCA/PyAwKTtcbiAgICBjYXNlIFwibmVzdGluZ1wiOiAvLyBGb3JtZXJseSBoaWVyYXJjaHlcbiAgICAgIHJldHVybiBoaWVyYXJjaHlTY29yZShhKSAtIGhpZXJhcmNoeVNjb3JlKGIpO1xuICAgIGNhc2UgXCJwaW5uZWRcIjpcbiAgICAgIHJldHVybiBwaW5uZWRTY29yZShhKSAtIHBpbm5lZFNjb3JlKGIpO1xuICAgIGNhc2UgXCJ0aXRsZVwiOlxuICAgICAgcmV0dXJuIGEudGl0bGUubG9jYWxlQ29tcGFyZShiLnRpdGxlKTtcbiAgICBjYXNlIFwidXJsXCI6XG4gICAgICByZXR1cm4gYS51cmwubG9jYWxlQ29tcGFyZShiLnVybCk7XG4gICAgY2FzZSBcImNvbnRleHRcIjpcbiAgICAgIHJldHVybiAoYS5jb250ZXh0ID8/IFwiXCIpLmxvY2FsZUNvbXBhcmUoYi5jb250ZXh0ID8/IFwiXCIpO1xuICAgIGNhc2UgXCJkb21haW5cIjpcbiAgICBjYXNlIFwiZG9tYWluX2Z1bGxcIjpcbiAgICAgIHJldHVybiBkb21haW5Gcm9tVXJsKGEudXJsKS5sb2NhbGVDb21wYXJlKGRvbWFpbkZyb21VcmwoYi51cmwpKTtcbiAgICBjYXNlIFwidG9waWNcIjpcbiAgICAgIHJldHVybiBzZW1hbnRpY0J1Y2tldChhLnRpdGxlLCBhLnVybCkubG9jYWxlQ29tcGFyZShzZW1hbnRpY0J1Y2tldChiLnRpdGxlLCBiLnVybCkpO1xuICAgIGNhc2UgXCJsaW5lYWdlXCI6XG4gICAgICByZXR1cm4gbmF2aWdhdGlvbktleShhKS5sb2NhbGVDb21wYXJlKG5hdmlnYXRpb25LZXkoYikpO1xuICAgIGNhc2UgXCJhZ2VcIjpcbiAgICAgIC8vIFJldmVyc2UgYWxwaGFiZXRpY2FsIGZvciBhZ2UgYnVja2V0cyAoVG9kYXkgPCBZZXN0ZXJkYXkpLCByb3VnaCBhcHByb3hcbiAgICAgIHJldHVybiAoZ3JvdXBpbmdLZXkoYSwgXCJhZ2VcIikgfHwgXCJcIikubG9jYWxlQ29tcGFyZShncm91cGluZ0tleShiLCBcImFnZVwiKSB8fCBcIlwiKTtcbiAgICBkZWZhdWx0OlxuICAgICAgLy8gQ2hlY2sgaWYgaXQncyBhIGdlbmVyaWMgZmllbGQgZmlyc3RcbiAgICAgIGNvbnN0IHZhbEEgPSBnZXRGaWVsZFZhbHVlKGEsIHN0cmF0ZWd5KTtcbiAgICAgIGNvbnN0IHZhbEIgPSBnZXRGaWVsZFZhbHVlKGIsIHN0cmF0ZWd5KTtcblxuICAgICAgaWYgKHZhbEEgIT09IHVuZGVmaW5lZCAmJiB2YWxCICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBpZiAodmFsQSA8IHZhbEIpIHJldHVybiAtMTtcbiAgICAgICAgICBpZiAodmFsQSA+IHZhbEIpIHJldHVybiAxO1xuICAgICAgICAgIHJldHVybiAwO1xuICAgICAgfVxuXG4gICAgICAvLyBGYWxsYmFjayBmb3IgY3VzdG9tIHN0cmF0ZWdpZXMgZ3JvdXBpbmcga2V5IChpZiB1c2luZyBjdXN0b20gc3RyYXRlZ3kgYXMgc29ydGluZyBidXQgbm8gc29ydGluZyBydWxlcyBkZWZpbmVkKVxuICAgICAgLy8gb3IgdW5oYW5kbGVkIGJ1aWx0LWluc1xuICAgICAgcmV0dXJuIChncm91cGluZ0tleShhLCBzdHJhdGVneSkgfHwgXCJcIikubG9jYWxlQ29tcGFyZShncm91cGluZ0tleShiLCBzdHJhdGVneSkgfHwgXCJcIik7XG4gIH1cbn07XG4iLCAiLy8gbG9naWMudHNcbi8vIFB1cmUgZnVuY3Rpb25zIGZvciBleHRyYWN0aW9uIGxvZ2ljXG5cbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVVcmwodXJsU3RyOiBzdHJpbmcpOiBzdHJpbmcge1xuICB0cnkge1xuICAgIGNvbnN0IHVybCA9IG5ldyBVUkwodXJsU3RyKTtcbiAgICBjb25zdCBwYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHVybC5zZWFyY2gpO1xuICAgIGNvbnN0IGtleXM6IHN0cmluZ1tdID0gW107XG4gICAgcGFyYW1zLmZvckVhY2goKF8sIGtleSkgPT4ga2V5cy5wdXNoKGtleSkpO1xuICAgIGNvbnN0IGhvc3RuYW1lID0gdXJsLmhvc3RuYW1lLnJlcGxhY2UoL153d3dcXC4vLCAnJyk7XG5cbiAgICBjb25zdCBUUkFDS0lORyA9IFsvXnV0bV8vLCAvXmZiY2xpZCQvLCAvXmdjbGlkJC8sIC9eX2dhJC8sIC9ecmVmJC8sIC9eeWNsaWQkLywgL15faHMvXTtcbiAgICBjb25zdCBpc1lvdXR1YmUgPSBob3N0bmFtZS5lbmRzV2l0aCgneW91dHViZS5jb20nKSB8fCBob3N0bmFtZS5lbmRzV2l0aCgneW91dHUuYmUnKTtcbiAgICBjb25zdCBpc0dvb2dsZSA9IGhvc3RuYW1lLmVuZHNXaXRoKCdnb29nbGUuY29tJyk7XG5cbiAgICBjb25zdCBrZWVwOiBzdHJpbmdbXSA9IFtdO1xuICAgIGlmIChpc1lvdXR1YmUpIGtlZXAucHVzaCgndicsICdsaXN0JywgJ3QnLCAnYycsICdjaGFubmVsJywgJ3BsYXlsaXN0Jyk7XG4gICAgaWYgKGlzR29vZ2xlKSBrZWVwLnB1c2goJ3EnLCAnaWQnLCAnc291cmNlaWQnKTtcblxuICAgIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICAgIGlmIChUUkFDS0lORy5zb21lKHIgPT4gci50ZXN0KGtleSkpKSB7XG4gICAgICAgICBwYXJhbXMuZGVsZXRlKGtleSk7XG4gICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICgoaXNZb3V0dWJlIHx8IGlzR29vZ2xlKSAmJiAha2VlcC5pbmNsdWRlcyhrZXkpKSB7XG4gICAgICAgICBwYXJhbXMuZGVsZXRlKGtleSk7XG4gICAgICB9XG4gICAgfVxuICAgIHVybC5zZWFyY2ggPSBwYXJhbXMudG9TdHJpbmcoKTtcbiAgICByZXR1cm4gdXJsLnRvU3RyaW5nKCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICByZXR1cm4gdXJsU3RyO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVlvdVR1YmVVcmwodXJsU3RyOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHVybFN0cik7XG4gICAgICAgIGNvbnN0IHYgPSB1cmwuc2VhcmNoUGFyYW1zLmdldCgndicpO1xuICAgICAgICBjb25zdCBpc1Nob3J0cyA9IHVybC5wYXRobmFtZS5pbmNsdWRlcygnL3Nob3J0cy8nKTtcbiAgICAgICAgbGV0IHZpZGVvSWQgPVxuICAgICAgICAgIHYgfHxcbiAgICAgICAgICAoaXNTaG9ydHMgPyB1cmwucGF0aG5hbWUuc3BsaXQoJy9zaG9ydHMvJylbMV0gOiBudWxsKSB8fFxuICAgICAgICAgICh1cmwuaG9zdG5hbWUgPT09ICd5b3V0dS5iZScgPyB1cmwucGF0aG5hbWUucmVwbGFjZSgnLycsICcnKSA6IG51bGwpO1xuXG4gICAgICAgIGNvbnN0IHBsYXlsaXN0SWQgPSB1cmwuc2VhcmNoUGFyYW1zLmdldCgnbGlzdCcpO1xuICAgICAgICBjb25zdCBwbGF5bGlzdEluZGV4ID0gcGFyc2VJbnQodXJsLnNlYXJjaFBhcmFtcy5nZXQoJ2luZGV4JykgfHwgJzAnLCAxMCk7XG5cbiAgICAgICAgcmV0dXJuIHsgdmlkZW9JZCwgaXNTaG9ydHMsIHBsYXlsaXN0SWQsIHBsYXlsaXN0SW5kZXggfTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHJldHVybiB7IHZpZGVvSWQ6IG51bGwsIGlzU2hvcnRzOiBmYWxzZSwgcGxheWxpc3RJZDogbnVsbCwgcGxheWxpc3RJbmRleDogbnVsbCB9O1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RKc29uTGRGaWVsZHMoanNvbkxkOiBhbnlbXSkge1xuICAgIGxldCBhdXRob3I6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgIGxldCBwdWJsaXNoZWRBdDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgbGV0IG1vZGlmaWVkQXQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgIGxldCB0YWdzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGxldCBicmVhZGNydW1iczogc3RyaW5nW10gPSBbXTtcblxuICAgIC8vIEZpbmQgbWFpbiBlbnRpdHlcbiAgICAvLyBBZGRlZCBzYWZldHkgY2hlY2s6IGkgJiYgaVsnQHR5cGUnXVxuICAgIGNvbnN0IG1haW5FbnRpdHkgPSBqc29uTGQuZmluZChpID0+IGkgJiYgKGlbJ0B0eXBlJ10gPT09ICdBcnRpY2xlJyB8fCBpWydAdHlwZSddID09PSAnVmlkZW9PYmplY3QnIHx8IGlbJ0B0eXBlJ10gPT09ICdOZXdzQXJ0aWNsZScpKSB8fCBqc29uTGRbMF07XG5cbiAgICBpZiAobWFpbkVudGl0eSkge1xuICAgICAgIGlmIChtYWluRW50aXR5LmF1dGhvcikge1xuICAgICAgICAgIGlmICh0eXBlb2YgbWFpbkVudGl0eS5hdXRob3IgPT09ICdzdHJpbmcnKSBhdXRob3IgPSBtYWluRW50aXR5LmF1dGhvcjtcbiAgICAgICAgICBlbHNlIGlmIChtYWluRW50aXR5LmF1dGhvci5uYW1lKSBhdXRob3IgPSBtYWluRW50aXR5LmF1dGhvci5uYW1lO1xuICAgICAgICAgIGVsc2UgaWYgKEFycmF5LmlzQXJyYXkobWFpbkVudGl0eS5hdXRob3IpICYmIG1haW5FbnRpdHkuYXV0aG9yWzBdPy5uYW1lKSBhdXRob3IgPSBtYWluRW50aXR5LmF1dGhvclswXS5uYW1lO1xuICAgICAgIH1cbiAgICAgICBpZiAobWFpbkVudGl0eS5kYXRlUHVibGlzaGVkKSBwdWJsaXNoZWRBdCA9IG1haW5FbnRpdHkuZGF0ZVB1Ymxpc2hlZDtcbiAgICAgICBpZiAobWFpbkVudGl0eS5kYXRlTW9kaWZpZWQpIG1vZGlmaWVkQXQgPSBtYWluRW50aXR5LmRhdGVNb2RpZmllZDtcbiAgICAgICBpZiAobWFpbkVudGl0eS5rZXl3b3Jkcykge1xuICAgICAgICAgaWYgKHR5cGVvZiBtYWluRW50aXR5LmtleXdvcmRzID09PSAnc3RyaW5nJykgdGFncyA9IG1haW5FbnRpdHkua2V5d29yZHMuc3BsaXQoJywnKS5tYXAoKHM6IHN0cmluZykgPT4gcy50cmltKCkpO1xuICAgICAgICAgZWxzZSBpZiAoQXJyYXkuaXNBcnJheShtYWluRW50aXR5LmtleXdvcmRzKSkgdGFncyA9IG1haW5FbnRpdHkua2V5d29yZHM7XG4gICAgICAgfVxuICAgIH1cblxuICAgIC8vIEFkZGVkIHNhZmV0eSBjaGVjazogaSAmJiBpWydAdHlwZSddXG4gICAgY29uc3QgYnJlYWRjcnVtYkxkID0ganNvbkxkLmZpbmQoaSA9PiBpICYmIGlbJ0B0eXBlJ10gPT09ICdCcmVhZGNydW1iTGlzdCcpO1xuICAgIGlmIChicmVhZGNydW1iTGQgJiYgQXJyYXkuaXNBcnJheShicmVhZGNydW1iTGQuaXRlbUxpc3RFbGVtZW50KSkge1xuICAgICAgIGNvbnN0IGxpc3QgPSBicmVhZGNydW1iTGQuaXRlbUxpc3RFbGVtZW50LnNvcnQoKGE6IGFueSwgYjogYW55KSA9PiBhLnBvc2l0aW9uIC0gYi5wb3NpdGlvbik7XG4gICAgICAgbGlzdC5mb3JFYWNoKChpdGVtOiBhbnkpID0+IHtcbiAgICAgICAgIGlmIChpdGVtLm5hbWUpIGJyZWFkY3J1bWJzLnB1c2goaXRlbS5uYW1lKTtcbiAgICAgICAgIGVsc2UgaWYgKGl0ZW0uaXRlbSAmJiBpdGVtLml0ZW0ubmFtZSkgYnJlYWRjcnVtYnMucHVzaChpdGVtLml0ZW0ubmFtZSk7XG4gICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgYXV0aG9yLCBwdWJsaXNoZWRBdCwgbW9kaWZpZWRBdCwgdGFncywgYnJlYWRjcnVtYnMgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RZb3VUdWJlQ2hhbm5lbEZyb21IdG1sKGh0bWw6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuICAvLyAxLiBUcnkgSlNPTi1MRFxuICAvLyBMb29rIGZvciA8c2NyaXB0IHR5cGU9XCJhcHBsaWNhdGlvbi9sZCtqc29uXCI+Li4uPC9zY3JpcHQ+XG4gIC8vIFdlIG5lZWQgdG8gbG9vcCBiZWNhdXNlIHRoZXJlIG1pZ2h0IGJlIG11bHRpcGxlIHNjcmlwdHNcbiAgY29uc3Qgc2NyaXB0UmVnZXggPSAvPHNjcmlwdFxccyt0eXBlPVtcIiddYXBwbGljYXRpb25cXC9sZFxcK2pzb25bXCInXVtePl0qPihbXFxzXFxTXSo/KTxcXC9zY3JpcHQ+L2dpO1xuICBsZXQgbWF0Y2g7XG4gIHdoaWxlICgobWF0Y2ggPSBzY3JpcHRSZWdleC5leGVjKGh0bWwpKSAhPT0gbnVsbCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBqc29uID0gSlNPTi5wYXJzZShtYXRjaFsxXSk7XG4gICAgICAgICAgY29uc3QgYXJyYXkgPSBBcnJheS5pc0FycmF5KGpzb24pID8ganNvbiA6IFtqc29uXTtcbiAgICAgICAgICBjb25zdCBmaWVsZHMgPSBleHRyYWN0SnNvbkxkRmllbGRzKGFycmF5KTtcbiAgICAgICAgICBpZiAoZmllbGRzLmF1dGhvcikgcmV0dXJuIGZpZWxkcy5hdXRob3I7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgLy8gaWdub3JlIHBhcnNlIGVycm9yc1xuICAgICAgfVxuICB9XG5cbiAgLy8gMi4gVHJ5IDxsaW5rIGl0ZW1wcm9wPVwibmFtZVwiIGNvbnRlbnQ9XCIuLi5cIj4gKFlvdVR1YmUgb2Z0ZW4gcHV0cyBjaGFubmVsIG5hbWUgaGVyZSBpbiBzb21lIGNvbnRleHRzKVxuICAvLyBPciA8bWV0YSBpdGVtcHJvcD1cImNoYW5uZWxJZFwiIGNvbnRlbnQ9XCIuLi5cIj4gLT4gYnV0IHRoYXQncyBJRC5cbiAgLy8gPGxpbmsgaXRlbXByb3A9XCJuYW1lXCIgY29udGVudD1cIkNoYW5uZWwgTmFtZVwiPlxuICAvLyA8c3BhbiBpdGVtcHJvcD1cImF1dGhvclwiIGl0ZW1zY29wZSBpdGVtdHlwZT1cImh0dHA6Ly9zY2hlbWEub3JnL1BlcnNvblwiPjxsaW5rIGl0ZW1wcm9wPVwibmFtZVwiIGNvbnRlbnQ9XCJDaGFubmVsIE5hbWVcIj48L3NwYW4+XG4gIGNvbnN0IGxpbmtOYW1lUmVnZXggPSAvPGxpbmtcXHMraXRlbXByb3A9W1wiJ11uYW1lW1wiJ11cXHMrY29udGVudD1bXCInXShbXlwiJ10rKVtcIiddXFxzKlxcLz8+L2k7XG4gIGNvbnN0IGxpbmtNYXRjaCA9IGxpbmtOYW1lUmVnZXguZXhlYyhodG1sKTtcbiAgaWYgKGxpbmtNYXRjaCAmJiBsaW5rTWF0Y2hbMV0pIHJldHVybiBkZWNvZGVIdG1sRW50aXRpZXMobGlua01hdGNoWzFdKTtcblxuICAvLyAzLiBUcnkgbWV0YSBhdXRob3JcbiAgY29uc3QgbWV0YUF1dGhvclJlZ2V4ID0gLzxtZXRhXFxzK25hbWU9W1wiJ11hdXRob3JbXCInXVxccytjb250ZW50PVtcIiddKFteXCInXSspW1wiJ11cXHMqXFwvPz4vaTtcbiAgY29uc3QgbWV0YU1hdGNoID0gbWV0YUF1dGhvclJlZ2V4LmV4ZWMoaHRtbCk7XG4gIGlmIChtZXRhTWF0Y2ggJiYgbWV0YU1hdGNoWzFdKSB7XG4gICAgICAvLyBZb3VUdWJlIG1ldGEgYXV0aG9yIGlzIG9mdGVuIFwiQ2hhbm5lbCBOYW1lXCJcbiAgICAgIHJldHVybiBkZWNvZGVIdG1sRW50aXRpZXMobWV0YU1hdGNoWzFdKTtcbiAgfVxuXG4gIHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXh0cmFjdFlvdVR1YmVHZW5yZUZyb21IdG1sKGh0bWw6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuICAvLyAxLiBUcnkgPG1ldGEgaXRlbXByb3A9XCJnZW5yZVwiIGNvbnRlbnQ9XCIuLi5cIj5cbiAgY29uc3QgbWV0YUdlbnJlUmVnZXggPSAvPG1ldGFcXHMraXRlbXByb3A9W1wiJ11nZW5yZVtcIiddXFxzK2NvbnRlbnQ9W1wiJ10oW15cIiddKylbXCInXVxccypcXC8/Pi9pO1xuICBjb25zdCBtZXRhTWF0Y2ggPSBtZXRhR2VucmVSZWdleC5leGVjKGh0bWwpO1xuICBpZiAobWV0YU1hdGNoICYmIG1ldGFNYXRjaFsxXSkge1xuICAgICAgcmV0dXJuIGRlY29kZUh0bWxFbnRpdGllcyhtZXRhTWF0Y2hbMV0pO1xuICB9XG5cbiAgLy8gMi4gVHJ5IEpTT04gXCJjYXRlZ29yeVwiIGluIHNjcmlwdHNcbiAgLy8gXCJjYXRlZ29yeVwiOlwiR2FtaW5nXCJcbiAgY29uc3QgY2F0ZWdvcnlSZWdleCA9IC9cImNhdGVnb3J5XCJcXHMqOlxccypcIihbXlwiXSspXCIvO1xuICBjb25zdCBjYXRNYXRjaCA9IGNhdGVnb3J5UmVnZXguZXhlYyhodG1sKTtcbiAgaWYgKGNhdE1hdGNoICYmIGNhdE1hdGNoWzFdKSB7XG4gICAgICByZXR1cm4gZGVjb2RlSHRtbEVudGl0aWVzKGNhdE1hdGNoWzFdKTtcbiAgfVxuXG4gIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBkZWNvZGVIdG1sRW50aXRpZXModGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgaWYgKCF0ZXh0KSByZXR1cm4gdGV4dDtcblxuICBjb25zdCBlbnRpdGllczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICAnJmFtcDsnOiAnJicsXG4gICAgJyZsdDsnOiAnPCcsXG4gICAgJyZndDsnOiAnPicsXG4gICAgJyZxdW90Oyc6ICdcIicsXG4gICAgJyYjMzk7JzogXCInXCIsXG4gICAgJyZhcG9zOyc6IFwiJ1wiLFxuICAgICcmbmJzcDsnOiAnICdcbiAgfTtcblxuICByZXR1cm4gdGV4dC5yZXBsYWNlKC8mKFthLXowLTldK3wjWzAtOV17MSw2fXwjeFswLTlhLWZBLUZdezEsNn0pOy9pZywgKG1hdGNoKSA9PiB7XG4gICAgICBjb25zdCBsb3dlciA9IG1hdGNoLnRvTG93ZXJDYXNlKCk7XG4gICAgICBpZiAoZW50aXRpZXNbbG93ZXJdKSByZXR1cm4gZW50aXRpZXNbbG93ZXJdO1xuICAgICAgaWYgKGVudGl0aWVzW21hdGNoXSkgcmV0dXJuIGVudGl0aWVzW21hdGNoXTtcblxuICAgICAgaWYgKGxvd2VyLnN0YXJ0c1dpdGgoJyYjeCcpKSB7XG4gICAgICAgICAgdHJ5IHsgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUocGFyc2VJbnQobG93ZXIuc2xpY2UoMywgLTEpLCAxNikpOyB9IGNhdGNoIHsgcmV0dXJuIG1hdGNoOyB9XG4gICAgICB9XG4gICAgICBpZiAobG93ZXIuc3RhcnRzV2l0aCgnJiMnKSkge1xuICAgICAgICAgIHRyeSB7IHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlKHBhcnNlSW50KGxvd2VyLnNsaWNlKDIsIC0xKSwgMTApKTsgfSBjYXRjaCB7IHJldHVybiBtYXRjaDsgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIG1hdGNoO1xuICB9KTtcbn1cbiIsICJcbmV4cG9ydCBjb25zdCBHRU5FUkFfUkVHSVNUUlk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gIC8vIFNlYXJjaFxuICAnZ29vZ2xlLmNvbSc6ICdTZWFyY2gnLFxuICAnYmluZy5jb20nOiAnU2VhcmNoJyxcbiAgJ2R1Y2tkdWNrZ28uY29tJzogJ1NlYXJjaCcsXG4gICd5YWhvby5jb20nOiAnU2VhcmNoJyxcbiAgJ2JhaWR1LmNvbSc6ICdTZWFyY2gnLFxuICAneWFuZGV4LmNvbSc6ICdTZWFyY2gnLFxuICAna2FnaS5jb20nOiAnU2VhcmNoJyxcbiAgJ2Vjb3NpYS5vcmcnOiAnU2VhcmNoJyxcblxuICAvLyBTb2NpYWxcbiAgJ2ZhY2Vib29rLmNvbSc6ICdTb2NpYWwnLFxuICAndHdpdHRlci5jb20nOiAnU29jaWFsJyxcbiAgJ3guY29tJzogJ1NvY2lhbCcsXG4gICdpbnN0YWdyYW0uY29tJzogJ1NvY2lhbCcsXG4gICdsaW5rZWRpbi5jb20nOiAnU29jaWFsJyxcbiAgJ3JlZGRpdC5jb20nOiAnU29jaWFsJyxcbiAgJ3Rpa3Rvay5jb20nOiAnU29jaWFsJyxcbiAgJ3BpbnRlcmVzdC5jb20nOiAnU29jaWFsJyxcbiAgJ3NuYXBjaGF0LmNvbSc6ICdTb2NpYWwnLFxuICAndHVtYmxyLmNvbSc6ICdTb2NpYWwnLFxuICAndGhyZWFkcy5uZXQnOiAnU29jaWFsJyxcbiAgJ2JsdWVza3kuYXBwJzogJ1NvY2lhbCcsXG4gICdtYXN0b2Rvbi5zb2NpYWwnOiAnU29jaWFsJyxcblxuICAvLyBWaWRlb1xuICAneW91dHViZS5jb20nOiAnVmlkZW8nLFxuICAneW91dHUuYmUnOiAnVmlkZW8nLFxuICAndmltZW8uY29tJzogJ1ZpZGVvJyxcbiAgJ3R3aXRjaC50dic6ICdWaWRlbycsXG4gICduZXRmbGl4LmNvbSc6ICdWaWRlbycsXG4gICdodWx1LmNvbSc6ICdWaWRlbycsXG4gICdkaXNuZXlwbHVzLmNvbSc6ICdWaWRlbycsXG4gICdkYWlseW1vdGlvbi5jb20nOiAnVmlkZW8nLFxuICAncHJpbWV2aWRlby5jb20nOiAnVmlkZW8nLFxuICAnaGJvbWF4LmNvbSc6ICdWaWRlbycsXG4gICdtYXguY29tJzogJ1ZpZGVvJyxcbiAgJ3BlYWNvY2t0di5jb20nOiAnVmlkZW8nLFxuXG4gIC8vIERldmVsb3BtZW50XG4gICdnaXRodWIuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2dpdGxhYi5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnc3RhY2tvdmVyZmxvdy5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnbnBtanMuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ3B5cGkub3JnJzogJ0RldmVsb3BtZW50JyxcbiAgJ2RldmVsb3Blci5tb3ppbGxhLm9yZyc6ICdEZXZlbG9wbWVudCcsXG4gICd3M3NjaG9vbHMuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2dlZWtzZm9yZ2Vla3Mub3JnJzogJ0RldmVsb3BtZW50JyxcbiAgJ2ppcmEuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2F0bGFzc2lhbi5uZXQnOiAnRGV2ZWxvcG1lbnQnLCAvLyBvZnRlbiBqaXJhXG4gICdiaXRidWNrZXQub3JnJzogJ0RldmVsb3BtZW50JyxcbiAgJ2Rldi50byc6ICdEZXZlbG9wbWVudCcsXG4gICdoYXNobm9kZS5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnbWVkaXVtLmNvbSc6ICdEZXZlbG9wbWVudCcsIC8vIEdlbmVyYWwgYnV0IG9mdGVuIGRldlxuICAndmVyY2VsLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICduZXRsaWZ5LmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdoZXJva3UuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2F3cy5hbWF6b24uY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2NvbnNvbGUuYXdzLmFtYXpvbi5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnY2xvdWQuZ29vZ2xlLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdhenVyZS5taWNyb3NvZnQuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ3BvcnRhbC5henVyZS5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnZG9ja2VyLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdrdWJlcm5ldGVzLmlvJzogJ0RldmVsb3BtZW50JyxcblxuICAvLyBOZXdzXG4gICdjbm4uY29tJzogJ05ld3MnLFxuICAnYmJjLmNvbSc6ICdOZXdzJyxcbiAgJ255dGltZXMuY29tJzogJ05ld3MnLFxuICAnd2FzaGluZ3RvbnBvc3QuY29tJzogJ05ld3MnLFxuICAndGhlZ3VhcmRpYW4uY29tJzogJ05ld3MnLFxuICAnZm9yYmVzLmNvbSc6ICdOZXdzJyxcbiAgJ2Jsb29tYmVyZy5jb20nOiAnTmV3cycsXG4gICdyZXV0ZXJzLmNvbSc6ICdOZXdzJyxcbiAgJ3dzai5jb20nOiAnTmV3cycsXG4gICdjbmJjLmNvbSc6ICdOZXdzJyxcbiAgJ2h1ZmZwb3N0LmNvbSc6ICdOZXdzJyxcbiAgJ25ld3MuZ29vZ2xlLmNvbSc6ICdOZXdzJyxcbiAgJ2ZveG5ld3MuY29tJzogJ05ld3MnLFxuICAnbmJjbmV3cy5jb20nOiAnTmV3cycsXG4gICdhYmNuZXdzLmdvLmNvbSc6ICdOZXdzJyxcbiAgJ3VzYXRvZGF5LmNvbSc6ICdOZXdzJyxcblxuICAvLyBTaG9wcGluZ1xuICAnYW1hem9uLmNvbSc6ICdTaG9wcGluZycsXG4gICdlYmF5LmNvbSc6ICdTaG9wcGluZycsXG4gICd3YWxtYXJ0LmNvbSc6ICdTaG9wcGluZycsXG4gICdldHN5LmNvbSc6ICdTaG9wcGluZycsXG4gICd0YXJnZXQuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ2Jlc3RidXkuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ2FsaWV4cHJlc3MuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ3Nob3BpZnkuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ3RlbXUuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ3NoZWluLmNvbSc6ICdTaG9wcGluZycsXG4gICd3YXlmYWlyLmNvbSc6ICdTaG9wcGluZycsXG4gICdjb3N0Y28uY29tJzogJ1Nob3BwaW5nJyxcblxuICAvLyBDb21tdW5pY2F0aW9uXG4gICdtYWlsLmdvb2dsZS5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICdvdXRsb29rLmxpdmUuY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnc2xhY2suY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnZGlzY29yZC5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICd6b29tLnVzJzogJ0NvbW11bmljYXRpb24nLFxuICAndGVhbXMubWljcm9zb2Z0LmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ3doYXRzYXBwLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ3RlbGVncmFtLm9yZyc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ21lc3Nlbmdlci5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICdza3lwZS5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG5cbiAgLy8gRmluYW5jZVxuICAncGF5cGFsLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2NoYXNlLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2JhbmtvZmFtZXJpY2EuY29tJzogJ0ZpbmFuY2UnLFxuICAnd2VsbHNmYXJnby5jb20nOiAnRmluYW5jZScsXG4gICdhbWVyaWNhbmV4cHJlc3MuY29tJzogJ0ZpbmFuY2UnLFxuICAnc3RyaXBlLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2NvaW5iYXNlLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2JpbmFuY2UuY29tJzogJ0ZpbmFuY2UnLFxuICAna3Jha2VuLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ3JvYmluaG9vZC5jb20nOiAnRmluYW5jZScsXG4gICdmaWRlbGl0eS5jb20nOiAnRmluYW5jZScsXG4gICd2YW5ndWFyZC5jb20nOiAnRmluYW5jZScsXG4gICdzY2h3YWIuY29tJzogJ0ZpbmFuY2UnLFxuICAnbWludC5pbnR1aXQuY29tJzogJ0ZpbmFuY2UnLFxuXG4gIC8vIEVkdWNhdGlvblxuICAnd2lraXBlZGlhLm9yZyc6ICdFZHVjYXRpb24nLFxuICAnY291cnNlcmEub3JnJzogJ0VkdWNhdGlvbicsXG4gICd1ZGVteS5jb20nOiAnRWR1Y2F0aW9uJyxcbiAgJ2VkeC5vcmcnOiAnRWR1Y2F0aW9uJyxcbiAgJ2toYW5hY2FkZW15Lm9yZyc6ICdFZHVjYXRpb24nLFxuICAncXVpemxldC5jb20nOiAnRWR1Y2F0aW9uJyxcbiAgJ2R1b2xpbmdvLmNvbSc6ICdFZHVjYXRpb24nLFxuICAnY2FudmFzLmluc3RydWN0dXJlLmNvbSc6ICdFZHVjYXRpb24nLFxuICAnYmxhY2tib2FyZC5jb20nOiAnRWR1Y2F0aW9uJyxcbiAgJ21pdC5lZHUnOiAnRWR1Y2F0aW9uJyxcbiAgJ2hhcnZhcmQuZWR1JzogJ0VkdWNhdGlvbicsXG4gICdzdGFuZm9yZC5lZHUnOiAnRWR1Y2F0aW9uJyxcbiAgJ2FjYWRlbWlhLmVkdSc6ICdFZHVjYXRpb24nLFxuICAncmVzZWFyY2hnYXRlLm5ldCc6ICdFZHVjYXRpb24nLFxuXG4gIC8vIERlc2lnblxuICAnZmlnbWEuY29tJzogJ0Rlc2lnbicsXG4gICdjYW52YS5jb20nOiAnRGVzaWduJyxcbiAgJ2JlaGFuY2UubmV0JzogJ0Rlc2lnbicsXG4gICdkcmliYmJsZS5jb20nOiAnRGVzaWduJyxcbiAgJ2Fkb2JlLmNvbSc6ICdEZXNpZ24nLFxuICAndW5zcGxhc2guY29tJzogJ0Rlc2lnbicsXG4gICdwZXhlbHMuY29tJzogJ0Rlc2lnbicsXG4gICdwaXhhYmF5LmNvbSc6ICdEZXNpZ24nLFxuICAnc2h1dHRlcnN0b2NrLmNvbSc6ICdEZXNpZ24nLFxuXG4gIC8vIFByb2R1Y3Rpdml0eVxuICAnZG9jcy5nb29nbGUuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdzaGVldHMuZ29vZ2xlLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnc2xpZGVzLmdvb2dsZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2RyaXZlLmdvb2dsZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ25vdGlvbi5zbyc6ICdQcm9kdWN0aXZpdHknLFxuICAndHJlbGxvLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnYXNhbmEuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdtb25kYXkuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdhaXJ0YWJsZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2V2ZXJub3RlLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnZHJvcGJveC5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2NsaWNrdXAuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdsaW5lYXIuYXBwJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdtaXJvLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnbHVjaWRjaGFydC5jb20nOiAnUHJvZHVjdGl2aXR5JyxcblxuICAvLyBBSVxuICAnb3BlbmFpLmNvbSc6ICdBSScsXG4gICdjaGF0Z3B0LmNvbSc6ICdBSScsXG4gICdhbnRocm9waWMuY29tJzogJ0FJJyxcbiAgJ21pZGpvdXJuZXkuY29tJzogJ0FJJyxcbiAgJ2h1Z2dpbmdmYWNlLmNvJzogJ0FJJyxcbiAgJ2JhcmQuZ29vZ2xlLmNvbSc6ICdBSScsXG4gICdnZW1pbmkuZ29vZ2xlLmNvbSc6ICdBSScsXG4gICdjbGF1ZGUuYWknOiAnQUknLFxuICAncGVycGxleGl0eS5haSc6ICdBSScsXG4gICdwb2UuY29tJzogJ0FJJyxcblxuICAvLyBNdXNpYy9BdWRpb1xuICAnc3BvdGlmeS5jb20nOiAnTXVzaWMnLFxuICAnc291bmRjbG91ZC5jb20nOiAnTXVzaWMnLFxuICAnbXVzaWMuYXBwbGUuY29tJzogJ011c2ljJyxcbiAgJ3BhbmRvcmEuY29tJzogJ011c2ljJyxcbiAgJ3RpZGFsLmNvbSc6ICdNdXNpYycsXG4gICdiYW5kY2FtcC5jb20nOiAnTXVzaWMnLFxuICAnYXVkaWJsZS5jb20nOiAnTXVzaWMnLFxuXG4gIC8vIEdhbWluZ1xuICAnc3RlYW1wb3dlcmVkLmNvbSc6ICdHYW1pbmcnLFxuICAncm9ibG94LmNvbSc6ICdHYW1pbmcnLFxuICAnZXBpY2dhbWVzLmNvbSc6ICdHYW1pbmcnLFxuICAneGJveC5jb20nOiAnR2FtaW5nJyxcbiAgJ3BsYXlzdGF0aW9uLmNvbSc6ICdHYW1pbmcnLFxuICAnbmludGVuZG8uY29tJzogJ0dhbWluZycsXG4gICdpZ24uY29tJzogJ0dhbWluZycsXG4gICdnYW1lc3BvdC5jb20nOiAnR2FtaW5nJyxcbiAgJ2tvdGFrdS5jb20nOiAnR2FtaW5nJyxcbiAgJ3BvbHlnb24uY29tJzogJ0dhbWluZydcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRHZW5lcmEoaG9zdG5hbWU6IHN0cmluZywgY3VzdG9tUmVnaXN0cnk/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogc3RyaW5nIHwgbnVsbCB7XG4gIGlmICghaG9zdG5hbWUpIHJldHVybiBudWxsO1xuXG4gIC8vIDAuIENoZWNrIGN1c3RvbSByZWdpc3RyeSBmaXJzdFxuICBpZiAoY3VzdG9tUmVnaXN0cnkpIHtcbiAgICAgIGNvbnN0IHBhcnRzID0gaG9zdG5hbWUuc3BsaXQoJy4nKTtcbiAgICAgIC8vIENoZWNrIGZ1bGwgaG9zdG5hbWUgYW5kIHByb2dyZXNzaXZlbHkgc2hvcnRlciBzdWZmaXhlc1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwYXJ0cy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgICAgICBjb25zdCBkb21haW4gPSBwYXJ0cy5zbGljZShpKS5qb2luKCcuJyk7XG4gICAgICAgICAgaWYgKGN1c3RvbVJlZ2lzdHJ5W2RvbWFpbl0pIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGN1c3RvbVJlZ2lzdHJ5W2RvbWFpbl07XG4gICAgICAgICAgfVxuICAgICAgfVxuICB9XG5cbiAgLy8gMS4gRXhhY3QgbWF0Y2hcbiAgaWYgKEdFTkVSQV9SRUdJU1RSWVtob3N0bmFtZV0pIHtcbiAgICByZXR1cm4gR0VORVJBX1JFR0lTVFJZW2hvc3RuYW1lXTtcbiAgfVxuXG4gIC8vIDIuIFN1YmRvbWFpbiBjaGVjayAoc3RyaXBwaW5nIHN1YmRvbWFpbnMpXG4gIC8vIGUuZy4gXCJjb25zb2xlLmF3cy5hbWF6b24uY29tXCIgLT4gXCJhd3MuYW1hem9uLmNvbVwiIC0+IFwiYW1hem9uLmNvbVwiXG4gIGNvbnN0IHBhcnRzID0gaG9zdG5hbWUuc3BsaXQoJy4nKTtcblxuICAvLyBUcnkgbWF0Y2hpbmcgcHJvZ3Jlc3NpdmVseSBzaG9ydGVyIHN1ZmZpeGVzXG4gIC8vIGUuZy4gYS5iLmMuY29tIC0+IGIuYy5jb20gLT4gYy5jb21cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBwYXJ0cy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgIGNvbnN0IGRvbWFpbiA9IHBhcnRzLnNsaWNlKGkpLmpvaW4oJy4nKTtcbiAgICAgIGlmIChHRU5FUkFfUkVHSVNUUllbZG9tYWluXSkge1xuICAgICAgICAgIHJldHVybiBHRU5FUkFfUkVHSVNUUllbZG9tYWluXTtcbiAgICAgIH1cbiAgfVxuXG4gIHJldHVybiBudWxsO1xufVxuIiwgImV4cG9ydCBjb25zdCBnZXRTdG9yZWRWYWx1ZSA9IGFzeW5jIDxUPihrZXk6IHN0cmluZyk6IFByb21pc2U8VCB8IG51bGw+ID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KGtleSwgKGl0ZW1zKSA9PiB7XG4gICAgICByZXNvbHZlKChpdGVtc1trZXldIGFzIFQpID8/IG51bGwpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBzZXRTdG9yZWRWYWx1ZSA9IGFzeW5jIDxUPihrZXk6IHN0cmluZywgdmFsdWU6IFQpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgW2tleV06IHZhbHVlIH0sICgpID0+IHJlc29sdmUoKSk7XG4gIH0pO1xufTtcbiIsICJpbXBvcnQgeyBDdXN0b21TdHJhdGVneSwgUHJlZmVyZW5jZXMsIFNvcnRpbmdTdHJhdGVneSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGdldFN0b3JlZFZhbHVlLCBzZXRTdG9yZWRWYWx1ZSB9IGZyb20gXCIuL3N0b3JhZ2UuanNcIjtcbmltcG9ydCB7IHNldExvZ2dlclByZWZlcmVuY2VzLCBsb2dEZWJ1ZyB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBhc0FycmF5IH0gZnJvbSBcIi4uL3NoYXJlZC91dGlscy5qc1wiO1xuXG5jb25zdCBQUkVGRVJFTkNFU19LRVkgPSBcInByZWZlcmVuY2VzXCI7XG5cbmV4cG9ydCBjb25zdCBkZWZhdWx0UHJlZmVyZW5jZXM6IFByZWZlcmVuY2VzID0ge1xuICBzb3J0aW5nOiBbXCJwaW5uZWRcIiwgXCJyZWNlbmN5XCJdLFxuICBkZWJ1ZzogZmFsc2UsXG4gIGxvZ0xldmVsOiBcImluZm9cIixcbiAgdGhlbWU6IFwiZGFya1wiLFxuICBjdXN0b21HZW5lcmE6IHt9LFxuICBhaToge1xuICAgIGVuYWJsZWQ6IGZhbHNlLFxuICAgIHByb3ZpZGVyOiAnb3BlbmFpJyxcbiAgICBtb2RlbDogJ2dwdC00by1taW5pJ1xuICB9XG59O1xuXG5jb25zdCBub3JtYWxpemVTb3J0aW5nID0gKHNvcnRpbmc6IHVua25vd24pOiBTb3J0aW5nU3RyYXRlZ3lbXSA9PiB7XG4gIGlmIChBcnJheS5pc0FycmF5KHNvcnRpbmcpKSB7XG4gICAgcmV0dXJuIHNvcnRpbmcuZmlsdGVyKCh2YWx1ZSk6IHZhbHVlIGlzIFNvcnRpbmdTdHJhdGVneSA9PiB0eXBlb2YgdmFsdWUgPT09IFwic3RyaW5nXCIpO1xuICB9XG4gIGlmICh0eXBlb2Ygc29ydGluZyA9PT0gXCJzdHJpbmdcIikge1xuICAgIHJldHVybiBbc29ydGluZ107XG4gIH1cbiAgcmV0dXJuIFsuLi5kZWZhdWx0UHJlZmVyZW5jZXMuc29ydGluZ107XG59O1xuXG5jb25zdCBub3JtYWxpemVTdHJhdGVnaWVzID0gKHN0cmF0ZWdpZXM6IHVua25vd24pOiBDdXN0b21TdHJhdGVneVtdID0+IHtcbiAgICBjb25zdCBhcnIgPSBhc0FycmF5PGFueT4oc3RyYXRlZ2llcykuZmlsdGVyKHMgPT4gdHlwZW9mIHMgPT09ICdvYmplY3QnICYmIHMgIT09IG51bGwpO1xuICAgIHJldHVybiBhcnIubWFwKHMgPT4gKHtcbiAgICAgICAgLi4ucyxcbiAgICAgICAgZ3JvdXBpbmdSdWxlczogYXNBcnJheShzLmdyb3VwaW5nUnVsZXMpLFxuICAgICAgICBzb3J0aW5nUnVsZXM6IGFzQXJyYXkocy5zb3J0aW5nUnVsZXMpLFxuICAgICAgICBncm91cFNvcnRpbmdSdWxlczogcy5ncm91cFNvcnRpbmdSdWxlcyA/IGFzQXJyYXkocy5ncm91cFNvcnRpbmdSdWxlcykgOiB1bmRlZmluZWQsXG4gICAgICAgIGZpbHRlcnM6IHMuZmlsdGVycyA/IGFzQXJyYXkocy5maWx0ZXJzKSA6IHVuZGVmaW5lZCxcbiAgICAgICAgZmlsdGVyR3JvdXBzOiBzLmZpbHRlckdyb3VwcyA/IGFzQXJyYXkocy5maWx0ZXJHcm91cHMpLm1hcCgoZzogYW55KSA9PiBhc0FycmF5KGcpKSA6IHVuZGVmaW5lZCxcbiAgICAgICAgcnVsZXM6IHMucnVsZXMgPyBhc0FycmF5KHMucnVsZXMpIDogdW5kZWZpbmVkXG4gICAgfSkpO1xufTtcblxuY29uc3Qgbm9ybWFsaXplUHJlZmVyZW5jZXMgPSAocHJlZnM/OiBQYXJ0aWFsPFByZWZlcmVuY2VzPiB8IG51bGwpOiBQcmVmZXJlbmNlcyA9PiB7XG4gIGNvbnN0IG1lcmdlZCA9IHsgLi4uZGVmYXVsdFByZWZlcmVuY2VzLCAuLi4ocHJlZnMgPz8ge30pIH07XG4gIHJldHVybiB7XG4gICAgLi4ubWVyZ2VkLFxuICAgIHNvcnRpbmc6IG5vcm1hbGl6ZVNvcnRpbmcobWVyZ2VkLnNvcnRpbmcpLFxuICAgIGN1c3RvbVN0cmF0ZWdpZXM6IG5vcm1hbGl6ZVN0cmF0ZWdpZXMobWVyZ2VkLmN1c3RvbVN0cmF0ZWdpZXMpLFxuICAgIGFpOiB7IC4uLmRlZmF1bHRQcmVmZXJlbmNlcy5haSEsIC4uLihtZXJnZWQuYWkgfHwge30pIH1cbiAgfTtcbn07XG5cbmV4cG9ydCBjb25zdCBsb2FkUHJlZmVyZW5jZXMgPSBhc3luYyAoKTogUHJvbWlzZTxQcmVmZXJlbmNlcz4gPT4ge1xuICBjb25zdCBzdG9yZWQgPSBhd2FpdCBnZXRTdG9yZWRWYWx1ZTxQcmVmZXJlbmNlcz4oUFJFRkVSRU5DRVNfS0VZKTtcbiAgY29uc3QgbWVyZ2VkID0gbm9ybWFsaXplUHJlZmVyZW5jZXMoc3RvcmVkID8/IHVuZGVmaW5lZCk7XG4gIHNldExvZ2dlclByZWZlcmVuY2VzKG1lcmdlZCk7XG4gIHJldHVybiBtZXJnZWQ7XG59O1xuXG5leHBvcnQgY29uc3Qgc2F2ZVByZWZlcmVuY2VzID0gYXN5bmMgKHByZWZzOiBQYXJ0aWFsPFByZWZlcmVuY2VzPik6IFByb21pc2U8UHJlZmVyZW5jZXM+ID0+IHtcbiAgbG9nRGVidWcoXCJVcGRhdGluZyBwcmVmZXJlbmNlc1wiLCB7IGtleXM6IE9iamVjdC5rZXlzKHByZWZzKSB9KTtcbiAgY29uc3QgY3VycmVudCA9IGF3YWl0IGxvYWRQcmVmZXJlbmNlcygpO1xuICBjb25zdCBtZXJnZWQgPSBub3JtYWxpemVQcmVmZXJlbmNlcyh7IC4uLmN1cnJlbnQsIC4uLnByZWZzIH0pO1xuICBhd2FpdCBzZXRTdG9yZWRWYWx1ZShQUkVGRVJFTkNFU19LRVksIG1lcmdlZCk7XG4gIHNldExvZ2dlclByZWZlcmVuY2VzKG1lcmdlZCk7XG4gIHJldHVybiBtZXJnZWQ7XG59O1xuIiwgImltcG9ydCB7IFBhZ2VDb250ZXh0LCBUYWJNZXRhZGF0YSB9IGZyb20gXCIuLi8uLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IG5vcm1hbGl6ZVVybCwgcGFyc2VZb3VUdWJlVXJsLCBleHRyYWN0WW91VHViZUNoYW5uZWxGcm9tSHRtbCwgZXh0cmFjdFlvdVR1YmVHZW5yZUZyb21IdG1sIH0gZnJvbSBcIi4vbG9naWMuanNcIjtcbmltcG9ydCB7IGdldEdlbmVyYSB9IGZyb20gXCIuL2dlbmVyYVJlZ2lzdHJ5LmpzXCI7XG5pbXBvcnQgeyBsb2dEZWJ1ZyB9IGZyb20gXCIuLi8uLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBsb2FkUHJlZmVyZW5jZXMgfSBmcm9tIFwiLi4vcHJlZmVyZW5jZXMuanNcIjtcblxuaW50ZXJmYWNlIEV4dHJhY3Rpb25SZXNwb25zZSB7XG4gIGRhdGE6IFBhZ2VDb250ZXh0IHwgbnVsbDtcbiAgZXJyb3I/OiBzdHJpbmc7XG4gIHN0YXR1czpcbiAgICB8ICdPSydcbiAgICB8ICdSRVNUUklDVEVEJ1xuICAgIHwgJ0lOSkVDVElPTl9GQUlMRUQnXG4gICAgfCAnTk9fUkVTUE9OU0UnXG4gICAgfCAnTk9fSE9TVF9QRVJNSVNTSU9OJ1xuICAgIHwgJ0ZSQU1FX0FDQ0VTU19ERU5JRUQnO1xufVxuXG4vLyBTaW1wbGUgY29uY3VycmVuY3kgY29udHJvbFxubGV0IGFjdGl2ZUZldGNoZXMgPSAwO1xuY29uc3QgTUFYX0NPTkNVUlJFTlRfRkVUQ0hFUyA9IDU7IC8vIENvbnNlcnZhdGl2ZSBsaW1pdCB0byBhdm9pZCByYXRlIGxpbWl0aW5nXG5jb25zdCBGRVRDSF9RVUVVRTogKCgpID0+IHZvaWQpW10gPSBbXTtcblxuY29uc3QgZmV0Y2hXaXRoVGltZW91dCA9IGFzeW5jICh1cmw6IHN0cmluZywgdGltZW91dCA9IDIwMDApOiBQcm9taXNlPFJlc3BvbnNlPiA9PiB7XG4gICAgY29uc3QgY29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgICBjb25zdCBpZCA9IHNldFRpbWVvdXQoKCkgPT4gY29udHJvbGxlci5hYm9ydCgpLCB0aW1lb3V0KTtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHVybCwgeyBzaWduYWw6IGNvbnRyb2xsZXIuc2lnbmFsIH0pO1xuICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KGlkKTtcbiAgICB9XG59O1xuXG5jb25zdCBlbnF1ZXVlRmV0Y2ggPSBhc3luYyA8VD4oZm46ICgpID0+IFByb21pc2U8VD4pOiBQcm9taXNlPFQ+ID0+IHtcbiAgICBpZiAoYWN0aXZlRmV0Y2hlcyA+PSBNQVhfQ09OQ1VSUkVOVF9GRVRDSEVTKSB7XG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gRkVUQ0hfUVVFVUUucHVzaChyZXNvbHZlKSk7XG4gICAgfVxuICAgIGFjdGl2ZUZldGNoZXMrKztcbiAgICB0cnkge1xuICAgICAgICByZXR1cm4gYXdhaXQgZm4oKTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgICBhY3RpdmVGZXRjaGVzLS07XG4gICAgICAgIGlmIChGRVRDSF9RVUVVRS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb25zdCBuZXh0ID0gRkVUQ0hfUVVFVUUuc2hpZnQoKTtcbiAgICAgICAgICAgIGlmIChuZXh0KSBuZXh0KCk7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5leHBvcnQgY29uc3QgZXh0cmFjdFBhZ2VDb250ZXh0ID0gYXN5bmMgKHRhYjogVGFiTWV0YWRhdGEgfCBjaHJvbWUudGFicy5UYWIpOiBQcm9taXNlPEV4dHJhY3Rpb25SZXNwb25zZT4gPT4ge1xuICB0cnkge1xuICAgIGlmICghdGFiIHx8ICF0YWIudXJsKSB7XG4gICAgICAgIHJldHVybiB7IGRhdGE6IG51bGwsIGVycm9yOiBcIlRhYiBub3QgZm91bmQgb3Igbm8gVVJMXCIsIHN0YXR1czogJ05PX1JFU1BPTlNFJyB9O1xuICAgIH1cblxuICAgIGlmIChcbiAgICAgIHRhYi51cmwuc3RhcnRzV2l0aCgnY2hyb21lOi8vJykgfHxcbiAgICAgIHRhYi51cmwuc3RhcnRzV2l0aCgnZWRnZTovLycpIHx8XG4gICAgICB0YWIudXJsLnN0YXJ0c1dpdGgoJ2Fib3V0OicpIHx8XG4gICAgICB0YWIudXJsLnN0YXJ0c1dpdGgoJ2Nocm9tZS1leHRlbnNpb246Ly8nKSB8fFxuICAgICAgdGFiLnVybC5zdGFydHNXaXRoKCdjaHJvbWUtZXJyb3I6Ly8nKVxuICAgICkge1xuICAgICAgICByZXR1cm4geyBkYXRhOiBudWxsLCBlcnJvcjogXCJSZXN0cmljdGVkIFVSTCBzY2hlbWVcIiwgc3RhdHVzOiAnUkVTVFJJQ1RFRCcgfTtcbiAgICB9XG5cbiAgICBjb25zdCBwcmVmcyA9IGF3YWl0IGxvYWRQcmVmZXJlbmNlcygpO1xuICAgIGxldCBiYXNlbGluZSA9IGJ1aWxkQmFzZWxpbmVDb250ZXh0KHRhYiBhcyBjaHJvbWUudGFicy5UYWIsIHByZWZzLmN1c3RvbUdlbmVyYSk7XG5cbiAgICAvLyBGZXRjaCBhbmQgZW5yaWNoIGZvciBZb3VUdWJlIGlmIGF1dGhvciBpcyBtaXNzaW5nIGFuZCBpdCBpcyBhIHZpZGVvXG4gICAgY29uc3QgdGFyZ2V0VXJsID0gdGFiLnVybDtcbiAgICBjb25zdCB1cmxPYmogPSBuZXcgVVJMKHRhcmdldFVybCk7XG4gICAgY29uc3QgaG9zdG5hbWUgPSB1cmxPYmouaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sICcnKTtcbiAgICBpZiAoKGhvc3RuYW1lLmVuZHNXaXRoKCd5b3V0dWJlLmNvbScpIHx8IGhvc3RuYW1lLmVuZHNXaXRoKCd5b3V0dS5iZScpKSAmJiAoIWJhc2VsaW5lLmF1dGhvck9yQ3JlYXRvciB8fCBiYXNlbGluZS5nZW5yZSA9PT0gJ1ZpZGVvJykpIHtcbiAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgLy8gV2UgdXNlIGEgcXVldWUgdG8gcHJldmVudCBmbG9vZGluZyByZXF1ZXN0c1xuICAgICAgICAgICAgIGF3YWl0IGVucXVldWVGZXRjaChhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2hXaXRoVGltZW91dCh0YXJnZXRVcmwpO1xuICAgICAgICAgICAgICAgICBpZiAocmVzcG9uc2Uub2spIHtcbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGh0bWwgPSBhd2FpdCByZXNwb25zZS50ZXh0KCk7XG4gICAgICAgICAgICAgICAgICAgICBjb25zdCBjaGFubmVsID0gZXh0cmFjdFlvdVR1YmVDaGFubmVsRnJvbUh0bWwoaHRtbCk7XG4gICAgICAgICAgICAgICAgICAgICBpZiAoY2hhbm5lbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgIGJhc2VsaW5lLmF1dGhvck9yQ3JlYXRvciA9IGNoYW5uZWw7XG4gICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICBjb25zdCBnZW5yZSA9IGV4dHJhY3RZb3VUdWJlR2VucmVGcm9tSHRtbChodG1sKTtcbiAgICAgICAgICAgICAgICAgICAgIGlmIChnZW5yZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgIGJhc2VsaW5lLmdlbnJlID0gZ2VucmU7XG4gICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9KTtcbiAgICAgICAgIH0gY2F0Y2ggKGZldGNoRXJyKSB7XG4gICAgICAgICAgICAgbG9nRGVidWcoXCJGYWlsZWQgdG8gZmV0Y2ggWW91VHViZSBwYWdlIGNvbnRlbnRcIiwgeyBlcnJvcjogU3RyaW5nKGZldGNoRXJyKSB9KTtcbiAgICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgZGF0YTogYmFzZWxpbmUsXG4gICAgICBzdGF0dXM6ICdPSydcbiAgICB9O1xuXG4gIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgIGxvZ0RlYnVnKGBFeHRyYWN0aW9uIGZhaWxlZCBmb3IgdGFiICR7dGFiLmlkfWAsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICByZXR1cm4ge1xuICAgICAgZGF0YTogbnVsbCxcbiAgICAgIGVycm9yOiBTdHJpbmcoZSksXG4gICAgICBzdGF0dXM6ICdJTkpFQ1RJT05fRkFJTEVEJ1xuICAgIH07XG4gIH1cbn07XG5cbmNvbnN0IGJ1aWxkQmFzZWxpbmVDb250ZXh0ID0gKHRhYjogY2hyb21lLnRhYnMuVGFiLCBjdXN0b21HZW5lcmE/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogUGFnZUNvbnRleHQgPT4ge1xuICBjb25zdCB1cmwgPSB0YWIudXJsIHx8IFwiXCI7XG4gIGxldCBob3N0bmFtZSA9IFwiXCI7XG4gIHRyeSB7XG4gICAgaG9zdG5hbWUgPSBuZXcgVVJMKHVybCkuaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sICcnKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGhvc3RuYW1lID0gXCJcIjtcbiAgfVxuXG4gIC8vIERldGVybWluZSBPYmplY3QgVHlwZSBmaXJzdFxuICBsZXQgb2JqZWN0VHlwZTogUGFnZUNvbnRleHRbJ29iamVjdFR5cGUnXSA9ICd1bmtub3duJztcbiAgbGV0IGF1dGhvck9yQ3JlYXRvcjogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cbiAgaWYgKHVybC5pbmNsdWRlcygnL2xvZ2luJykgfHwgdXJsLmluY2x1ZGVzKCcvc2lnbmluJykpIHtcbiAgICAgIG9iamVjdFR5cGUgPSAnbG9naW4nO1xuICB9IGVsc2UgaWYgKGhvc3RuYW1lLmluY2x1ZGVzKCd5b3V0dWJlLmNvbScpIHx8IGhvc3RuYW1lLmluY2x1ZGVzKCd5b3V0dS5iZScpKSB7XG4gICAgICBjb25zdCB7IHZpZGVvSWQgfSA9IHBhcnNlWW91VHViZVVybCh1cmwpO1xuICAgICAgaWYgKHZpZGVvSWQpIG9iamVjdFR5cGUgPSAndmlkZW8nO1xuXG4gICAgICAvLyBUcnkgdG8gZ3Vlc3MgY2hhbm5lbCBmcm9tIFVSTCBpZiBwb3NzaWJsZVxuICAgICAgaWYgKHVybC5pbmNsdWRlcygnL0AnKSkge1xuICAgICAgICAgIGNvbnN0IHBhcnRzID0gdXJsLnNwbGl0KCcvQCcpO1xuICAgICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGhhbmRsZSA9IHBhcnRzWzFdLnNwbGl0KCcvJylbMF07XG4gICAgICAgICAgICAgIGF1dGhvck9yQ3JlYXRvciA9ICdAJyArIGhhbmRsZTtcbiAgICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHVybC5pbmNsdWRlcygnL2MvJykpIHtcbiAgICAgICAgICBjb25zdCBwYXJ0cyA9IHVybC5zcGxpdCgnL2MvJyk7XG4gICAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgYXV0aG9yT3JDcmVhdG9yID0gZGVjb2RlVVJJQ29tcG9uZW50KHBhcnRzWzFdLnNwbGl0KCcvJylbMF0pO1xuICAgICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodXJsLmluY2x1ZGVzKCcvdXNlci8nKSkge1xuICAgICAgICAgIGNvbnN0IHBhcnRzID0gdXJsLnNwbGl0KCcvdXNlci8nKTtcbiAgICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICBhdXRob3JPckNyZWF0b3IgPSBkZWNvZGVVUklDb21wb25lbnQocGFydHNbMV0uc3BsaXQoJy8nKVswXSk7XG4gICAgICAgICAgfVxuICAgICAgfVxuICB9IGVsc2UgaWYgKGhvc3RuYW1lID09PSAnZ2l0aHViLmNvbScgJiYgdXJsLmluY2x1ZGVzKCcvcHVsbC8nKSkge1xuICAgICAgb2JqZWN0VHlwZSA9ICd0aWNrZXQnO1xuICB9IGVsc2UgaWYgKGhvc3RuYW1lID09PSAnZ2l0aHViLmNvbScgJiYgIXVybC5pbmNsdWRlcygnL3B1bGwvJykgJiYgdXJsLnNwbGl0KCcvJykubGVuZ3RoID49IDUpIHtcbiAgICAgIC8vIHJvdWdoIGNoZWNrIGZvciByZXBvXG4gICAgICBvYmplY3RUeXBlID0gJ3JlcG8nO1xuICB9XG5cbiAgLy8gRGV0ZXJtaW5lIEdlbnJlXG4gIC8vIFByaW9yaXR5IDE6IFNpdGUtc3BlY2lmaWMgZXh0cmFjdGlvbiAoZGVyaXZlZCBmcm9tIG9iamVjdFR5cGUpXG4gIGxldCBnZW5yZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG4gIGlmIChvYmplY3RUeXBlID09PSAndmlkZW8nKSBnZW5yZSA9ICdWaWRlbyc7XG4gIGVsc2UgaWYgKG9iamVjdFR5cGUgPT09ICdyZXBvJyB8fCBvYmplY3RUeXBlID09PSAndGlja2V0JykgZ2VucmUgPSAnRGV2ZWxvcG1lbnQnO1xuXG4gIC8vIFByaW9yaXR5IDI6IEZhbGxiYWNrIHRvIFJlZ2lzdHJ5XG4gIGlmICghZ2VucmUpIHtcbiAgICAgZ2VucmUgPSBnZXRHZW5lcmEoaG9zdG5hbWUsIGN1c3RvbUdlbmVyYSkgfHwgdW5kZWZpbmVkO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjYW5vbmljYWxVcmw6IHVybCB8fCBudWxsLFxuICAgIG5vcm1hbGl6ZWRVcmw6IG5vcm1hbGl6ZVVybCh1cmwpLFxuICAgIHNpdGVOYW1lOiBob3N0bmFtZSB8fCBudWxsLFxuICAgIHBsYXRmb3JtOiBob3N0bmFtZSB8fCBudWxsLFxuICAgIG9iamVjdFR5cGUsXG4gICAgb2JqZWN0SWQ6IHVybCB8fCBudWxsLFxuICAgIHRpdGxlOiB0YWIudGl0bGUgfHwgbnVsbCxcbiAgICBnZW5yZSxcbiAgICBkZXNjcmlwdGlvbjogbnVsbCxcbiAgICBhdXRob3JPckNyZWF0b3I6IGF1dGhvck9yQ3JlYXRvcixcbiAgICBwdWJsaXNoZWRBdDogbnVsbCxcbiAgICBtb2RpZmllZEF0OiBudWxsLFxuICAgIGxhbmd1YWdlOiBudWxsLFxuICAgIHRhZ3M6IFtdLFxuICAgIGJyZWFkY3J1bWJzOiBbXSxcbiAgICBpc0F1ZGlibGU6IGZhbHNlLFxuICAgIGlzTXV0ZWQ6IGZhbHNlLFxuICAgIGlzQ2FwdHVyaW5nOiBmYWxzZSxcbiAgICBwcm9ncmVzczogbnVsbCxcbiAgICBoYXNVbnNhdmVkQ2hhbmdlc0xpa2VseTogZmFsc2UsXG4gICAgaXNBdXRoZW50aWNhdGVkTGlrZWx5OiBmYWxzZSxcbiAgICBzb3VyY2VzOiB7XG4gICAgICBjYW5vbmljYWxVcmw6ICd1cmwnLFxuICAgICAgbm9ybWFsaXplZFVybDogJ3VybCcsXG4gICAgICBzaXRlTmFtZTogJ3VybCcsXG4gICAgICBwbGF0Zm9ybTogJ3VybCcsXG4gICAgICBvYmplY3RUeXBlOiAndXJsJyxcbiAgICAgIHRpdGxlOiB0YWIudGl0bGUgPyAndGFiJyA6ICd1cmwnLFxuICAgICAgZ2VucmU6ICdyZWdpc3RyeSdcbiAgICB9LFxuICAgIGNvbmZpZGVuY2U6IHt9XG4gIH07XG59O1xuIiwgImltcG9ydCB7IFRhYk1ldGFkYXRhLCBQYWdlQ29udGV4dCwgUHJlZmVyZW5jZXMsIEFJUHJlZmVyZW5jZXMgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBsb2dEZWJ1ZywgbG9nRXJyb3IgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgZXh0cmFjdFBhZ2VDb250ZXh0IH0gZnJvbSBcIi4vZXh0cmFjdGlvbi9pbmRleC5qc1wiO1xuaW1wb3J0IHsgbG9hZFByZWZlcmVuY2VzIH0gZnJvbSBcIi4vcHJlZmVyZW5jZXMuanNcIjtcblxuZXhwb3J0IGludGVyZmFjZSBDb250ZXh0UmVzdWx0IHtcbiAgY29udGV4dDogc3RyaW5nO1xuICBzb3VyY2U6ICdBSScgfCAnSGV1cmlzdGljJyB8ICdFeHRyYWN0aW9uJztcbiAgZGF0YT86IFBhZ2VDb250ZXh0O1xuICBlcnJvcj86IHN0cmluZztcbiAgc3RhdHVzPzogc3RyaW5nO1xufVxuXG5jb25zdCBjb250ZXh0Q2FjaGUgPSBuZXcgTWFwPHN0cmluZywgQ29udGV4dFJlc3VsdD4oKTtcblxuZXhwb3J0IGNvbnN0IGFuYWx5emVUYWJDb250ZXh0ID0gYXN5bmMgKFxuICB0YWJzOiBUYWJNZXRhZGF0YVtdLFxuICBvblByb2dyZXNzPzogKGNvbXBsZXRlZDogbnVtYmVyLCB0b3RhbDogbnVtYmVyKSA9PiB2b2lkXG4pOiBQcm9taXNlPE1hcDxudW1iZXIsIENvbnRleHRSZXN1bHQ+PiA9PiB7XG4gIGNvbnN0IGNvbnRleHRNYXAgPSBuZXcgTWFwPG51bWJlciwgQ29udGV4dFJlc3VsdD4oKTtcbiAgbGV0IGNvbXBsZXRlZCA9IDA7XG4gIGNvbnN0IHRvdGFsID0gdGFicy5sZW5ndGg7XG5cbiAgLy8gTG9hZCBwcmVmZXJlbmNlcyBvbmNlXG4gIGxldCBwcmVmZXJlbmNlczogUHJlZmVyZW5jZXMgfCB1bmRlZmluZWQ7XG4gIHRyeSB7XG4gICAgICBwcmVmZXJlbmNlcyA9IGF3YWl0IGxvYWRQcmVmZXJlbmNlcygpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2dFcnJvcihcIkZhaWxlZCB0byBsb2FkIHByZWZlcmVuY2VzIGR1cmluZyBjb250ZXh0IGFuYWx5c2lzXCIsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgfVxuXG4gIGNvbnN0IHByb21pc2VzID0gdGFicy5tYXAoYXN5bmMgKHRhYikgPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBjYWNoZUtleSA9IGAke3RhYi5pZH06OiR7dGFiLnVybH1gO1xuICAgICAgaWYgKGNvbnRleHRDYWNoZS5oYXMoY2FjaGVLZXkpKSB7XG4gICAgICAgIGNvbnRleHRNYXAuc2V0KHRhYi5pZCwgY29udGV4dENhY2hlLmdldChjYWNoZUtleSkhKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBmZXRjaENvbnRleHRGb3JUYWIodGFiLCBwcmVmZXJlbmNlcyk7XG5cbiAgICAgIC8vIE9ubHkgY2FjaGUgdmFsaWQgcmVzdWx0cyB0byBhbGxvdyByZXRyeWluZyBvbiB0cmFuc2llbnQgZXJyb3JzP1xuICAgICAgLy8gQWN0dWFsbHksIGlmIHdlIGNhY2hlIGVycm9yLCB3ZSBzdG9wIHJldHJ5aW5nLlxuICAgICAgLy8gTGV0J3MgY2FjaGUgZXZlcnl0aGluZyBmb3Igbm93IHRvIHByZXZlbnQgc3BhbW1pbmcgaWYgaXQga2VlcHMgZmFpbGluZy5cbiAgICAgIGNvbnRleHRDYWNoZS5zZXQoY2FjaGVLZXksIHJlc3VsdCk7XG5cbiAgICAgIGNvbnRleHRNYXAuc2V0KHRhYi5pZCwgcmVzdWx0KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nRXJyb3IoYEZhaWxlZCB0byBhbmFseXplIGNvbnRleHQgZm9yIHRhYiAke3RhYi5pZH1gLCB7IGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICAgICAgLy8gRXZlbiBpZiBmZXRjaENvbnRleHRGb3JUYWIgZmFpbHMgY29tcGxldGVseSwgd2UgdHJ5IGEgc2FmZSBzeW5jIGZhbGxiYWNrXG4gICAgICBjb250ZXh0TWFwLnNldCh0YWIuaWQsIHsgY29udGV4dDogXCJVbmNhdGVnb3JpemVkXCIsIHNvdXJjZTogJ0hldXJpc3RpYycsIGVycm9yOiBTdHJpbmcoZXJyb3IpLCBzdGF0dXM6ICdFUlJPUicgfSk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGNvbXBsZXRlZCsrO1xuICAgICAgaWYgKG9uUHJvZ3Jlc3MpIG9uUHJvZ3Jlc3MoY29tcGxldGVkLCB0b3RhbCk7XG4gICAgfVxuICB9KTtcblxuICBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gIHJldHVybiBjb250ZXh0TWFwO1xufTtcblxuY29uc3QgZmV0Y2hDb250ZXh0Rm9yVGFiID0gYXN5bmMgKHRhYjogVGFiTWV0YWRhdGEsIHByZWZzPzogUHJlZmVyZW5jZXMpOiBQcm9taXNlPENvbnRleHRSZXN1bHQ+ID0+IHtcbiAgLy8gMS4gUnVuIEdlbmVyaWMgRXh0cmFjdGlvbiAoQWx3YXlzKVxuICBsZXQgZGF0YTogUGFnZUNvbnRleHQgfCBudWxsID0gbnVsbDtcbiAgbGV0IGVycm9yOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gIGxldCBzdGF0dXM6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICB0cnkge1xuICAgICAgY29uc3QgZXh0cmFjdGlvbiA9IGF3YWl0IGV4dHJhY3RQYWdlQ29udGV4dCh0YWIpO1xuICAgICAgZGF0YSA9IGV4dHJhY3Rpb24uZGF0YTtcbiAgICAgIGVycm9yID0gZXh0cmFjdGlvbi5lcnJvcjtcbiAgICAgIHN0YXR1cyA9IGV4dHJhY3Rpb24uc3RhdHVzO1xuICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2dEZWJ1ZyhgRXh0cmFjdGlvbiBmYWlsZWQgZm9yIHRhYiAke3RhYi5pZH1gLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICBlcnJvciA9IFN0cmluZyhlKTtcbiAgICAgIHN0YXR1cyA9ICdFUlJPUic7XG4gIH1cblxuICBsZXQgY29udGV4dCA9IFwiVW5jYXRlZ29yaXplZFwiO1xuICBsZXQgc291cmNlOiBDb250ZXh0UmVzdWx0Wydzb3VyY2UnXSA9ICdIZXVyaXN0aWMnO1xuXG4gIC8vIDIuIFRyeSB0byBEZXRlcm1pbmUgQ2F0ZWdvcnkgZnJvbSBFeHRyYWN0aW9uIERhdGFcbiAgaWYgKGRhdGEpIHtcbiAgICAgIGlmIChkYXRhLnBsYXRmb3JtID09PSAnWW91VHViZScgfHwgZGF0YS5wbGF0Zm9ybSA9PT0gJ05ldGZsaXgnIHx8IGRhdGEucGxhdGZvcm0gPT09ICdTcG90aWZ5JyB8fCBkYXRhLnBsYXRmb3JtID09PSAnVHdpdGNoJykge1xuICAgICAgICAgIGNvbnRleHQgPSBcIkVudGVydGFpbm1lbnRcIjtcbiAgICAgICAgICBzb3VyY2UgPSAnRXh0cmFjdGlvbic7XG4gICAgICB9IGVsc2UgaWYgKGRhdGEucGxhdGZvcm0gPT09ICdHaXRIdWInIHx8IGRhdGEucGxhdGZvcm0gPT09ICdTdGFjayBPdmVyZmxvdycgfHwgZGF0YS5wbGF0Zm9ybSA9PT0gJ0ppcmEnIHx8IGRhdGEucGxhdGZvcm0gPT09ICdHaXRMYWInKSB7XG4gICAgICAgICAgY29udGV4dCA9IFwiRGV2ZWxvcG1lbnRcIjtcbiAgICAgICAgICBzb3VyY2UgPSAnRXh0cmFjdGlvbic7XG4gICAgICB9IGVsc2UgaWYgKGRhdGEucGxhdGZvcm0gPT09ICdHb29nbGUnICYmIChkYXRhLm5vcm1hbGl6ZWRVcmwuaW5jbHVkZXMoJ2RvY3MnKSB8fCBkYXRhLm5vcm1hbGl6ZWRVcmwuaW5jbHVkZXMoJ3NoZWV0cycpIHx8IGRhdGEubm9ybWFsaXplZFVybC5pbmNsdWRlcygnc2xpZGVzJykpKSB7XG4gICAgICAgICAgY29udGV4dCA9IFwiV29ya1wiO1xuICAgICAgICAgIHNvdXJjZSA9ICdFeHRyYWN0aW9uJztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIElmIHdlIGhhdmUgc3VjY2Vzc2Z1bCBleHRyYWN0aW9uIGRhdGEgYnV0IG5vIHNwZWNpZmljIHJ1bGUgbWF0Y2hlZCxcbiAgICAgICAgLy8gdXNlIHRoZSBPYmplY3QgVHlwZSBvciBnZW5lcmljIFwiR2VuZXJhbCBXZWJcIiB0byBpbmRpY2F0ZSBleHRyYWN0aW9uIHdvcmtlZC5cbiAgICAgICAgLy8gV2UgcHJlZmVyIHNwZWNpZmljIGNhdGVnb3JpZXMsIGJ1dCBcIkFydGljbGVcIiBvciBcIlZpZGVvXCIgYXJlIGJldHRlciB0aGFuIFwiVW5jYXRlZ29yaXplZFwiLlxuICAgICAgICBpZiAoZGF0YS5vYmplY3RUeXBlICYmIGRhdGEub2JqZWN0VHlwZSAhPT0gJ3Vua25vd24nKSB7XG4gICAgICAgICAgICAgLy8gTWFwIG9iamVjdCB0eXBlcyB0byBjYXRlZ29yaWVzIGlmIHBvc3NpYmxlXG4gICAgICAgICAgICAgaWYgKGRhdGEub2JqZWN0VHlwZSA9PT0gJ3ZpZGVvJykgY29udGV4dCA9ICdFbnRlcnRhaW5tZW50JztcbiAgICAgICAgICAgICBlbHNlIGlmIChkYXRhLm9iamVjdFR5cGUgPT09ICdhcnRpY2xlJykgY29udGV4dCA9ICdOZXdzJzsgLy8gTG9vc2UgbWFwcGluZywgYnV0IGJldHRlciB0aGFuIG5vdGhpbmdcbiAgICAgICAgICAgICBlbHNlIGNvbnRleHQgPSBkYXRhLm9iamVjdFR5cGUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBkYXRhLm9iamVjdFR5cGUuc2xpY2UoMSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgY29udGV4dCA9IFwiR2VuZXJhbCBXZWJcIjtcbiAgICAgICAgfVxuICAgICAgICBzb3VyY2UgPSAnRXh0cmFjdGlvbic7XG4gICAgICB9XG4gIH1cblxuICAvLyAzLiBGYWxsYmFjayB0byBMb2NhbCBIZXVyaXN0aWMgKFVSTCBSZWdleClcbiAgaWYgKGNvbnRleHQgPT09IFwiVW5jYXRlZ29yaXplZFwiKSB7XG4gICAgICBjb25zdCBoID0gYXdhaXQgbG9jYWxIZXVyaXN0aWModGFiKTtcbiAgICAgIGlmIChoLmNvbnRleHQgIT09IFwiVW5jYXRlZ29yaXplZFwiKSB7XG4gICAgICAgICAgY29udGV4dCA9IGguY29udGV4dDtcbiAgICAgICAgICAvLyBzb3VyY2UgcmVtYWlucyAnSGV1cmlzdGljJyAob3IgbWF5YmUgd2Ugc2hvdWxkIHNheSAnSGV1cmlzdGljJyBpcyB0aGUgc291cmNlPylcbiAgICAgICAgICAvLyBUaGUgbG9jYWxIZXVyaXN0aWMgZnVuY3Rpb24gcmV0dXJucyB7IHNvdXJjZTogJ0hldXJpc3RpYycgfVxuICAgICAgfVxuICB9XG5cbiAgLy8gNC4gRmFsbGJhY2sgdG8gQUkgKExMTSlcbiAgaWYgKGNvbnRleHQgPT09IFwiVW5jYXRlZ29yaXplZFwiICYmIHByZWZzPy5haT8uZW5hYmxlZCkge1xuICAgICAgY29uc3QgYWlSZXN1bHQgPSBhd2FpdCBmZXRjaENvbnRleHRGcm9tQUkodGFiLCBwcmVmcy5haSwgZGF0YSk7XG4gICAgICBpZiAoYWlSZXN1bHQuY29udGV4dCAmJiBhaVJlc3VsdC5jb250ZXh0ICE9PSBcIlVuY2F0ZWdvcml6ZWRcIikge1xuICAgICAgICAgIGNvbnRleHQgPSBhaVJlc3VsdC5jb250ZXh0O1xuICAgICAgICAgIHNvdXJjZSA9ICdBSSc7XG4gICAgICAgICAgLy8gQ2xlYW4gdXAgZXJyb3IgaWYgc3VjY2Vzc1xuICAgICAgICAgIGVycm9yID0gdW5kZWZpbmVkO1xuICAgICAgICAgIHN0YXR1cyA9IHVuZGVmaW5lZDtcbiAgICAgIH0gZWxzZSBpZiAoYWlSZXN1bHQuZXJyb3IpIHtcbiAgICAgICAgICAvLyBLZWVwIHRoZSBlcnJvciBmb3IgZGVidWdnaW5nIGlmIEFJIGZhaWxlZCBidXQgZG9uJ3QgY2hhbmdlIGNvbnRleHRcbiAgICAgICAgICBsb2dEZWJ1ZyhcIkFJIEFuYWx5c2lzIGZhaWxlZFwiLCB7IGVycm9yOiBhaVJlc3VsdC5lcnJvciB9KTtcbiAgICAgIH1cbiAgfVxuXG4gIGlmIChjb250ZXh0ICE9PSBcIlVuY2F0ZWdvcml6ZWRcIiAmJiBzb3VyY2UgIT09IFwiRXh0cmFjdGlvblwiKSB7XG4gICAgZXJyb3IgPSB1bmRlZmluZWQ7XG4gICAgc3RhdHVzID0gdW5kZWZpbmVkO1xuICB9XG5cbiAgcmV0dXJuIHsgY29udGV4dCwgc291cmNlLCBkYXRhOiBkYXRhIHx8IHVuZGVmaW5lZCwgZXJyb3IsIHN0YXR1cyB9O1xufTtcblxuZXhwb3J0IGNvbnN0IGZldGNoQ29udGV4dEZyb21BSSA9IGFzeW5jICh0YWI6IFRhYk1ldGFkYXRhLCBhaVByZWZzOiBBSVByZWZlcmVuY2VzLCBjb250ZXh0RGF0YT86IFBhZ2VDb250ZXh0IHwgbnVsbCk6IFByb21pc2U8Q29udGV4dFJlc3VsdD4gPT4ge1xuICAgIGlmICghYWlQcmVmcy5lbmFibGVkKSByZXR1cm4geyBjb250ZXh0OiBcIlVuY2F0ZWdvcml6ZWRcIiwgc291cmNlOiAnQUknLCBzdGF0dXM6ICdESVNBQkxFRCcgfTtcbiAgICBcbiAgICAvLyBDaGVjayBrZXkgb25seSBmb3IgT3BlbkFJLCBDdXN0b20gbWlnaHQgbm90IG5lZWQgaXRcbiAgICBpZiAoYWlQcmVmcy5wcm92aWRlciA9PT0gJ29wZW5haScgJiYgIWFpUHJlZnMuYXBpS2V5KSB7XG4gICAgICAgIHJldHVybiB7IGNvbnRleHQ6IFwiVW5jYXRlZ29yaXplZFwiLCBzb3VyY2U6ICdBSScsIGVycm9yOiBcIk1pc3NpbmcgQVBJIEtleVwiLCBzdGF0dXM6ICdFUlJPUicgfTtcbiAgICB9XG5cbiAgICBjb25zdCBlbmRwb2ludCA9IGFpUHJlZnMucHJvdmlkZXIgPT09ICdjdXN0b20nIFxuICAgICAgICA/IGFpUHJlZnMuZW5kcG9pbnQgXG4gICAgICAgIDogJ2h0dHBzOi8vYXBpLm9wZW5haS5jb20vdjEvY2hhdC9jb21wbGV0aW9ucyc7XG5cbiAgICBpZiAoIWVuZHBvaW50KSB7XG4gICAgICAgICByZXR1cm4geyBjb250ZXh0OiBcIlVuY2F0ZWdvcml6ZWRcIiwgc291cmNlOiAnQUknLCBlcnJvcjogXCJNaXNzaW5nIEVuZHBvaW50XCIsIHN0YXR1czogJ0VSUk9SJyB9O1xuICAgIH1cblxuICAgIGNvbnN0IG1vZGVsID0gYWlQcmVmcy5tb2RlbCB8fCAnZ3B0LTRvLW1pbmknO1xuXG4gICAgY29uc3Qgc3lzdGVtUHJvbXB0ID0gYFlvdSBhcmUgYSB3ZWIgcGFnZSBjbGFzc2lmaWVyLiBBbmFseXplIHRoZSBmb2xsb3dpbmcgcGFnZSBpbmZvcm1hdGlvbiBhbmQgY2F0ZWdvcml6ZSBpdCBpbnRvIGV4YWN0bHkgT05FIG9mIHRoZXNlIGNhdGVnb3JpZXM6IERldmVsb3BtZW50LCBXb3JrLCBFbnRlcnRhaW5tZW50LCBOZXdzLCBTaG9wcGluZywgU29jaWFsLCBFZHVjYXRpb24sIFRyYXZlbCwgSGVhbHRoLCBTcG9ydHMsIFRlY2hub2xvZ3ksIFNjaWVuY2UsIEdhbWluZywgTXVzaWMsIEFydCwgRmluYW5jZSwgR292ZXJubWVudCwgUmVmZXJlbmNlLiBJZiB1bmNlcnRhaW4sIGNob29zZSB0aGUgYmVzdCBmaXQgb3IgJ0dlbmVyYWwnLiBSZXBseSBPTkxZIHdpdGggdGhlIGNhdGVnb3J5IG5hbWUuYDtcbiAgICBcbiAgICBjb25zdCBkZXNjcmlwdGlvbiA9IGNvbnRleHREYXRhPy5kZXNjcmlwdGlvbiB8fCB0YWIuY29udGV4dERhdGE/LmRlc2NyaXB0aW9uIHx8ICcnO1xuICAgIGNvbnN0IHVzZXJQcm9tcHQgPSBgVGl0bGU6ICR7dGFiLnRpdGxlfVxcblVSTDogJHt0YWIudXJsfVxcbkRlc2NyaXB0aW9uOiAke2Rlc2NyaXB0aW9ufWA7XG5cbiAgICB0cnkge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGVuZHBvaW50LCB7XG4gICAgICAgICAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICAgICAgICdBdXRob3JpemF0aW9uJzogYWlQcmVmcy5hcGlLZXkgPyBgQmVhcmVyICR7YWlQcmVmcy5hcGlLZXl9YCA6IHVuZGVmaW5lZFxuICAgICAgICAgICAgfSBhcyBhbnksXG4gICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICAgICAgbW9kZWw6IG1vZGVsLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2VzOiBbXG4gICAgICAgICAgICAgICAgICAgIHsgcm9sZTogXCJzeXN0ZW1cIiwgY29udGVudDogc3lzdGVtUHJvbXB0IH0sXG4gICAgICAgICAgICAgICAgICAgIHsgcm9sZTogXCJ1c2VyXCIsIGNvbnRlbnQ6IHVzZXJQcm9tcHQgfVxuICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgdGVtcGVyYXR1cmU6IDAuMyxcbiAgICAgICAgICAgICAgICBtYXhfdG9rZW5zOiAxMFxuICAgICAgICAgICAgfSlcbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgICAgICAgY29uc3QgZXJyVGV4dCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcbiAgICAgICAgICAgICByZXR1cm4geyBjb250ZXh0OiBcIlVuY2F0ZWdvcml6ZWRcIiwgc291cmNlOiAnQUknLCBlcnJvcjogYEFQSSBFcnJvciAke3Jlc3BvbnNlLnN0YXR1c306ICR7ZXJyVGV4dH1gLCBzdGF0dXM6ICdFUlJPUicgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGpzb24gPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSBqc29uLmNob2ljZXM/LlswXT8ubWVzc2FnZT8uY29udGVudD8udHJpbSgpO1xuXG4gICAgICAgIGlmIChjb250ZW50KSB7XG4gICAgICAgICAgICAvLyBCYXNpYyBzYW5pdGl6YXRpb246IHJlbW92ZSBwdW5jdHVhdGlvbiwga2VlcCBsZXR0ZXJzXG4gICAgICAgICAgICBjb25zdCBjYXRlZ29yeSA9IGNvbnRlbnQucmVwbGFjZSgvW15hLXpBLVpdL2csICcnKTsgXG4gICAgICAgICAgICByZXR1cm4geyBjb250ZXh0OiBjYXRlZ29yeSwgc291cmNlOiAnQUknIH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgcmV0dXJuIHsgY29udGV4dDogXCJVbmNhdGVnb3JpemVkXCIsIHNvdXJjZTogJ0FJJywgZXJyb3I6IFwiRW1wdHkgcmVzcG9uc2VcIiwgc3RhdHVzOiAnRVJST1InIH07XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICByZXR1cm4geyBjb250ZXh0OiBcIlVuY2F0ZWdvcml6ZWRcIiwgc291cmNlOiAnQUknLCBlcnJvcjogU3RyaW5nKGUpLCBzdGF0dXM6ICdFUlJPUicgfTtcbiAgICB9XG59O1xuXG5jb25zdCBsb2NhbEhldXJpc3RpYyA9IGFzeW5jICh0YWI6IFRhYk1ldGFkYXRhKTogUHJvbWlzZTxDb250ZXh0UmVzdWx0PiA9PiB7XG4gIGNvbnN0IHVybCA9IHRhYi51cmwudG9Mb3dlckNhc2UoKTtcbiAgbGV0IGNvbnRleHQgPSBcIlVuY2F0ZWdvcml6ZWRcIjtcblxuICBpZiAodXJsLmluY2x1ZGVzKFwiZ2l0aHViXCIpIHx8IHVybC5pbmNsdWRlcyhcInN0YWNrb3ZlcmZsb3dcIikgfHwgdXJsLmluY2x1ZGVzKFwibG9jYWxob3N0XCIpIHx8IHVybC5pbmNsdWRlcyhcImppcmFcIikgfHwgdXJsLmluY2x1ZGVzKFwiZ2l0bGFiXCIpKSBjb250ZXh0ID0gXCJEZXZlbG9wbWVudFwiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJnb29nbGVcIikgJiYgKHVybC5pbmNsdWRlcyhcImRvY3NcIikgfHwgdXJsLmluY2x1ZGVzKFwic2hlZXRzXCIpIHx8IHVybC5pbmNsdWRlcyhcInNsaWRlc1wiKSkpIGNvbnRleHQgPSBcIldvcmtcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwibGlua2VkaW5cIikgfHwgdXJsLmluY2x1ZGVzKFwic2xhY2tcIikgfHwgdXJsLmluY2x1ZGVzKFwiem9vbVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJ0ZWFtc1wiKSkgY29udGV4dCA9IFwiV29ya1wiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJuZXRmbGl4XCIpIHx8IHVybC5pbmNsdWRlcyhcInNwb3RpZnlcIikgfHwgdXJsLmluY2x1ZGVzKFwiaHVsdVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJkaXNuZXlcIikgfHwgdXJsLmluY2x1ZGVzKFwieW91dHViZVwiKSkgY29udGV4dCA9IFwiRW50ZXJ0YWlubWVudFwiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJ0d2l0dGVyXCIpIHx8IHVybC5pbmNsdWRlcyhcImZhY2Vib29rXCIpIHx8IHVybC5pbmNsdWRlcyhcImluc3RhZ3JhbVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJyZWRkaXRcIikgfHwgdXJsLmluY2x1ZGVzKFwidGlrdG9rXCIpIHx8IHVybC5pbmNsdWRlcyhcInBpbnRlcmVzdFwiKSkgY29udGV4dCA9IFwiU29jaWFsXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcImFtYXpvblwiKSB8fCB1cmwuaW5jbHVkZXMoXCJlYmF5XCIpIHx8IHVybC5pbmNsdWRlcyhcIndhbG1hcnRcIikgfHwgdXJsLmluY2x1ZGVzKFwidGFyZ2V0XCIpIHx8IHVybC5pbmNsdWRlcyhcInNob3BpZnlcIikpIGNvbnRleHQgPSBcIlNob3BwaW5nXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcImNublwiKSB8fCB1cmwuaW5jbHVkZXMoXCJiYmNcIikgfHwgdXJsLmluY2x1ZGVzKFwibnl0aW1lc1wiKSB8fCB1cmwuaW5jbHVkZXMoXCJ3YXNoaW5ndG9ucG9zdFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJmb3huZXdzXCIpKSBjb250ZXh0ID0gXCJOZXdzXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcImNvdXJzZXJhXCIpIHx8IHVybC5pbmNsdWRlcyhcInVkZW15XCIpIHx8IHVybC5pbmNsdWRlcyhcImVkeFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJraGFuYWNhZGVteVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJjYW52YXNcIikpIGNvbnRleHQgPSBcIkVkdWNhdGlvblwiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJleHBlZGlhXCIpIHx8IHVybC5pbmNsdWRlcyhcImJvb2tpbmdcIikgfHwgdXJsLmluY2x1ZGVzKFwiYWlyYm5iXCIpIHx8IHVybC5pbmNsdWRlcyhcInRyaXBhZHZpc29yXCIpIHx8IHVybC5pbmNsdWRlcyhcImtheWFrXCIpKSBjb250ZXh0ID0gXCJUcmF2ZWxcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwid2VibWRcIikgfHwgdXJsLmluY2x1ZGVzKFwibWF5b2NsaW5pY1wiKSB8fCB1cmwuaW5jbHVkZXMoXCJuaWguZ292XCIpIHx8IHVybC5pbmNsdWRlcyhcImhlYWx0aFwiKSkgY29udGV4dCA9IFwiSGVhbHRoXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcImVzcG5cIikgfHwgdXJsLmluY2x1ZGVzKFwibmJhXCIpIHx8IHVybC5pbmNsdWRlcyhcIm5mbFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJtbGJcIikgfHwgdXJsLmluY2x1ZGVzKFwiZmlmYVwiKSkgY29udGV4dCA9IFwiU3BvcnRzXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcInRlY2hjcnVuY2hcIikgfHwgdXJsLmluY2x1ZGVzKFwid2lyZWRcIikgfHwgdXJsLmluY2x1ZGVzKFwidGhldmVyZ2VcIikgfHwgdXJsLmluY2x1ZGVzKFwiYXJzdGVjaG5pY2FcIikpIGNvbnRleHQgPSBcIlRlY2hub2xvZ3lcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwic2NpZW5jZVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJuYXR1cmUuY29tXCIpIHx8IHVybC5pbmNsdWRlcyhcIm5hc2EuZ292XCIpKSBjb250ZXh0ID0gXCJTY2llbmNlXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcInR3aXRjaFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJzdGVhbVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJyb2Jsb3hcIikgfHwgdXJsLmluY2x1ZGVzKFwiaWduXCIpIHx8IHVybC5pbmNsdWRlcyhcImdhbWVzcG90XCIpKSBjb250ZXh0ID0gXCJHYW1pbmdcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwic291bmRjbG91ZFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJiYW5kY2FtcFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJsYXN0LmZtXCIpKSBjb250ZXh0ID0gXCJNdXNpY1wiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJkZXZpYW50YXJ0XCIpIHx8IHVybC5pbmNsdWRlcyhcImJlaGFuY2VcIikgfHwgdXJsLmluY2x1ZGVzKFwiZHJpYmJibGVcIikgfHwgdXJsLmluY2x1ZGVzKFwiYXJ0c3RhdGlvblwiKSkgY29udGV4dCA9IFwiQXJ0XCI7XG5cbiAgcmV0dXJuIHsgY29udGV4dCwgc291cmNlOiAnSGV1cmlzdGljJyB9O1xufTtcbiIsICJpbXBvcnQgeyBncm91cFRhYnMsIGdldEN1c3RvbVN0cmF0ZWdpZXMsIGdldEZpZWxkVmFsdWUsIHJlcXVpcmVzQ29udGV4dEFuYWx5c2lzIH0gZnJvbSBcIi4vZ3JvdXBpbmdTdHJhdGVnaWVzLmpzXCI7XG5pbXBvcnQgeyBzb3J0VGFicywgY29tcGFyZUJ5IH0gZnJvbSBcIi4vc29ydGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IGFuYWx5emVUYWJDb250ZXh0IH0gZnJvbSBcIi4vY29udGV4dEFuYWx5c2lzLmpzXCI7XG5pbXBvcnQgeyBsb2dEZWJ1ZywgbG9nRXJyb3IsIGxvZ0luZm8gfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgR3JvdXBpbmdTZWxlY3Rpb24sIFByZWZlcmVuY2VzLCBUYWJHcm91cCwgVGFiTWV0YWRhdGEsIFNvcnRpbmdSdWxlIH0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgZ2V0U3RvcmVkVmFsdWUsIHNldFN0b3JlZFZhbHVlIH0gZnJvbSBcIi4vc3RvcmFnZS5qc1wiO1xuaW1wb3J0IHsgbWFwQ2hyb21lVGFiLCBhc0FycmF5IH0gZnJvbSBcIi4uL3NoYXJlZC91dGlscy5qc1wiO1xuXG5jb25zdCBnZXRUYWJzRm9yRmlsdGVyID0gYXN5bmMgKGZpbHRlcj86IEdyb3VwaW5nU2VsZWN0aW9uKTogUHJvbWlzZTxjaHJvbWUudGFicy5UYWJbXT4gPT4ge1xuICBjb25zdCB3aW5kb3dJZHMgPSBmaWx0ZXI/LndpbmRvd0lkcztcbiAgY29uc3QgdGFiSWRzID0gZmlsdGVyPy50YWJJZHM7XG4gIGNvbnN0IGhhc1dpbmRvd0lkcyA9IHdpbmRvd0lkcyAmJiB3aW5kb3dJZHMubGVuZ3RoID4gMDtcbiAgY29uc3QgaGFzVGFiSWRzID0gdGFiSWRzICYmIHRhYklkcy5sZW5ndGggPiAwO1xuXG4gIGlmICghZmlsdGVyIHx8ICghaGFzV2luZG93SWRzICYmICFoYXNUYWJJZHMpKSB7XG4gICAgcmV0dXJuIGNocm9tZS50YWJzLnF1ZXJ5KHt9KTtcbiAgfVxuXG4gIGNvbnN0IHByb21pc2VzOiBQcm9taXNlPGFueT5bXSA9IFtdO1xuXG4gIGlmIChoYXNXaW5kb3dJZHMpIHtcbiAgICB3aW5kb3dJZHMuZm9yRWFjaCh3aW5kb3dJZCA9PiB7XG4gICAgICBwcm9taXNlcy5wdXNoKGNocm9tZS50YWJzLnF1ZXJ5KHsgd2luZG93SWQgfSkuY2F0Y2goKCkgPT4gW10pKTtcbiAgICB9KTtcbiAgfVxuXG4gIGlmIChoYXNUYWJJZHMpIHtcbiAgICB0YWJJZHMuZm9yRWFjaCh0YWJJZCA9PiB7XG4gICAgICBwcm9taXNlcy5wdXNoKGNocm9tZS50YWJzLmdldCh0YWJJZCkuY2F0Y2goKCkgPT4gbnVsbCkpO1xuICAgIH0pO1xuICB9XG5cbiAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcblxuICAvLyBGbGF0dGVuIGFuZCBmaWx0ZXIgb3V0IG51bGxzXG4gIGNvbnN0IGFsbFRhYnM6IGNocm9tZS50YWJzLlRhYltdID0gW107XG4gIGZvciAoY29uc3QgcmVzIG9mIHJlc3VsdHMpIHtcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KHJlcykpIHtcbiAgICAgICAgICBhbGxUYWJzLnB1c2goLi4ucmVzKTtcbiAgICAgIH0gZWxzZSBpZiAocmVzKSB7XG4gICAgICAgICAgYWxsVGFicy5wdXNoKHJlcyk7XG4gICAgICB9XG4gIH1cblxuICAvLyBEZWR1cGxpY2F0ZSBieSBJRFxuICBjb25zdCB1bmlxdWVUYWJzID0gbmV3IE1hcDxudW1iZXIsIGNocm9tZS50YWJzLlRhYj4oKTtcbiAgZm9yIChjb25zdCB0YWIgb2YgYWxsVGFicykge1xuICAgICAgaWYgKHRhYi5pZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgdW5pcXVlVGFicy5zZXQodGFiLmlkLCB0YWIpO1xuICAgICAgfVxuICB9XG5cbiAgcmV0dXJuIEFycmF5LmZyb20odW5pcXVlVGFicy52YWx1ZXMoKSk7XG59O1xuXG5leHBvcnQgY29uc3QgZmV0Y2hDdXJyZW50VGFiR3JvdXBzID0gYXN5bmMgKFxuICBwcmVmZXJlbmNlczogUHJlZmVyZW5jZXMsXG4gIG9uUHJvZ3Jlc3M/OiAoY29tcGxldGVkOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+IHZvaWRcbik6IFByb21pc2U8VGFiR3JvdXBbXT4gPT4ge1xuICB0cnkge1xuICBjb25zdCB0YWJzID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoe30pO1xuICBjb25zdCBncm91cHMgPSBhd2FpdCBjaHJvbWUudGFiR3JvdXBzLnF1ZXJ5KHt9KTtcbiAgY29uc3QgZ3JvdXBNYXAgPSBuZXcgTWFwKGdyb3Vwcy5tYXAoZyA9PiBbZy5pZCwgZ10pKTtcblxuICAvLyBNYXAgdGFicyB0byBtZXRhZGF0YVxuICBjb25zdCBtYXBwZWQgPSB0YWJzLm1hcChtYXBDaHJvbWVUYWIpLmZpbHRlcigodCk6IHQgaXMgVGFiTWV0YWRhdGEgPT4gQm9vbGVhbih0KSk7XG5cbiAgaWYgKHJlcXVpcmVzQ29udGV4dEFuYWx5c2lzKHByZWZlcmVuY2VzLnNvcnRpbmcpKSB7XG4gICAgICBjb25zdCBjb250ZXh0TWFwID0gYXdhaXQgYW5hbHl6ZVRhYkNvbnRleHQobWFwcGVkLCBvblByb2dyZXNzKTtcbiAgICAgIG1hcHBlZC5mb3JFYWNoKHRhYiA9PiB7XG4gICAgICAgIGNvbnN0IHJlcyA9IGNvbnRleHRNYXAuZ2V0KHRhYi5pZCk7XG4gICAgICAgIHRhYi5jb250ZXh0ID0gcmVzPy5jb250ZXh0O1xuICAgICAgICB0YWIuY29udGV4dERhdGEgPSByZXM/LmRhdGE7XG4gICAgICB9KTtcbiAgfVxuXG4gIGNvbnN0IHJlc3VsdEdyb3VwczogVGFiR3JvdXBbXSA9IFtdO1xuICBjb25zdCB0YWJzQnlHcm91cElkID0gbmV3IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhW10+KCk7XG4gIGNvbnN0IHRhYnNCeVdpbmRvd1VuZ3JvdXBlZCA9IG5ldyBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YVtdPigpO1xuXG4gIG1hcHBlZC5mb3JFYWNoKHRhYiA9PiB7XG4gICAgICBjb25zdCBncm91cElkID0gdGFiLmdyb3VwSWQgPz8gLTE7XG4gICAgICBpZiAoZ3JvdXBJZCAhPT0gLTEpIHtcbiAgICAgICAgICBpZiAoIXRhYnNCeUdyb3VwSWQuaGFzKGdyb3VwSWQpKSB0YWJzQnlHcm91cElkLnNldChncm91cElkLCBbXSk7XG4gICAgICAgICAgdGFic0J5R3JvdXBJZC5nZXQoZ3JvdXBJZCkhLnB1c2godGFiKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgIGlmICghdGFic0J5V2luZG93VW5ncm91cGVkLmhhcyh0YWIud2luZG93SWQpKSB0YWJzQnlXaW5kb3dVbmdyb3VwZWQuc2V0KHRhYi53aW5kb3dJZCwgW10pO1xuICAgICAgICAgICB0YWJzQnlXaW5kb3dVbmdyb3VwZWQuZ2V0KHRhYi53aW5kb3dJZCkhLnB1c2godGFiKTtcbiAgICAgIH1cbiAgfSk7XG5cbiAgLy8gQ3JlYXRlIFRhYkdyb3VwIG9iamVjdHMgZm9yIGFjdHVhbCBncm91cHNcbiAgZm9yIChjb25zdCBbZ3JvdXBJZCwgZ3JvdXBUYWJzXSBvZiB0YWJzQnlHcm91cElkKSB7XG4gICAgICBjb25zdCBicm93c2VyR3JvdXAgPSBncm91cE1hcC5nZXQoZ3JvdXBJZCk7XG4gICAgICBpZiAoYnJvd3Nlckdyb3VwKSB7XG4gICAgICAgICAgcmVzdWx0R3JvdXBzLnB1c2goe1xuICAgICAgICAgICAgICBpZDogYGdyb3VwLSR7Z3JvdXBJZH1gLFxuICAgICAgICAgICAgICB3aW5kb3dJZDogYnJvd3Nlckdyb3VwLndpbmRvd0lkLFxuICAgICAgICAgICAgICBsYWJlbDogYnJvd3Nlckdyb3VwLnRpdGxlIHx8IFwiVW50aXRsZWQgR3JvdXBcIixcbiAgICAgICAgICAgICAgY29sb3I6IGJyb3dzZXJHcm91cC5jb2xvcixcbiAgICAgICAgICAgICAgdGFiczogc29ydFRhYnMoZ3JvdXBUYWJzLCBwcmVmZXJlbmNlcy5zb3J0aW5nKSxcbiAgICAgICAgICAgICAgcmVhc29uOiBcIk1hbnVhbFwiXG4gICAgICAgICAgfSk7XG4gICAgICB9XG4gIH1cblxuICAvLyBIYW5kbGUgdW5ncm91cGVkIHRhYnNcbiAgZm9yIChjb25zdCBbd2luZG93SWQsIHRhYnNdIG9mIHRhYnNCeVdpbmRvd1VuZ3JvdXBlZCkge1xuICAgICAgcmVzdWx0R3JvdXBzLnB1c2goe1xuICAgICAgICAgIGlkOiBgdW5ncm91cGVkLSR7d2luZG93SWR9YCxcbiAgICAgICAgICB3aW5kb3dJZDogd2luZG93SWQsXG4gICAgICAgICAgbGFiZWw6IFwiVW5ncm91cGVkXCIsXG4gICAgICAgICAgY29sb3I6IFwiZ3JleVwiLFxuICAgICAgICAgIHRhYnM6IHNvcnRUYWJzKHRhYnMsIHByZWZlcmVuY2VzLnNvcnRpbmcpLFxuICAgICAgICAgIHJlYXNvbjogXCJVbmdyb3VwZWRcIlxuICAgICAgfSk7XG4gIH1cblxuICAvLyBTb3J0IGdyb3VwcyBtaWdodCBiZSBuaWNlLCBidXQgVGFiR3JvdXBbXSBkb2Vzbid0IHN0cmljdGx5IGRpY3RhdGUgb3JkZXIgaW4gVUkgKFVJIHNvcnRzIGJ5IGxhYmVsIGN1cnJlbnRseT8gT3Iga2VlcHMgb3JkZXI/KVxuICAvLyBwb3B1cC50cyBzb3J0cyBncm91cHMgYnkgbGFiZWwgaW4gcmVuZGVyVHJlZTogQXJyYXkuZnJvbShncm91cHMuZW50cmllcygpKS5zb3J0KCkuLi5cbiAgLy8gU28gb3JkZXIgaGVyZSBkb2Vzbid0IG1hdHRlciBtdWNoLlxuXG4gIGxvZ0luZm8oXCJGZXRjaGVkIGN1cnJlbnQgdGFiIGdyb3Vwc1wiLCB7IGdyb3VwczogcmVzdWx0R3JvdXBzLmxlbmd0aCwgdGFiczogbWFwcGVkLmxlbmd0aCB9KTtcbiAgcmV0dXJuIHJlc3VsdEdyb3VwcztcbiAgfSBjYXRjaCAoZSkge1xuICAgIGxvZ0Vycm9yKFwiRXJyb3IgaW4gZmV0Y2hDdXJyZW50VGFiR3JvdXBzXCIsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICB0aHJvdyBlO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgY2FsY3VsYXRlVGFiR3JvdXBzID0gYXN5bmMgKFxuICBwcmVmZXJlbmNlczogUHJlZmVyZW5jZXMsXG4gIGZpbHRlcj86IEdyb3VwaW5nU2VsZWN0aW9uLFxuICBvblByb2dyZXNzPzogKGNvbXBsZXRlZDogbnVtYmVyLCB0b3RhbDogbnVtYmVyKSA9PiB2b2lkXG4pOiBQcm9taXNlPFRhYkdyb3VwW10+ID0+IHtcbiAgY29uc3QgY2hyb21lVGFicyA9IGF3YWl0IGdldFRhYnNGb3JGaWx0ZXIoZmlsdGVyKTtcbiAgY29uc3Qgd2luZG93SWRTZXQgPSBuZXcgU2V0KGZpbHRlcj8ud2luZG93SWRzID8/IFtdKTtcbiAgY29uc3QgdGFiSWRTZXQgPSBuZXcgU2V0KGZpbHRlcj8udGFiSWRzID8/IFtdKTtcbiAgY29uc3QgaGFzRmlsdGVycyA9IHdpbmRvd0lkU2V0LnNpemUgPiAwIHx8IHRhYklkU2V0LnNpemUgPiAwO1xuICBjb25zdCBmaWx0ZXJlZFRhYnMgPSBjaHJvbWVUYWJzLmZpbHRlcigodGFiKSA9PiB7XG4gICAgaWYgKCFoYXNGaWx0ZXJzKSByZXR1cm4gdHJ1ZTtcbiAgICByZXR1cm4gKHRhYi53aW5kb3dJZCAmJiB3aW5kb3dJZFNldC5oYXModGFiLndpbmRvd0lkKSkgfHwgKHRhYi5pZCAmJiB0YWJJZFNldC5oYXModGFiLmlkKSk7XG4gIH0pO1xuICBjb25zdCBtYXBwZWQgPSBmaWx0ZXJlZFRhYnNcbiAgICAubWFwKG1hcENocm9tZVRhYilcbiAgICAuZmlsdGVyKCh0YWIpOiB0YWIgaXMgVGFiTWV0YWRhdGEgPT4gQm9vbGVhbih0YWIpKTtcblxuICBpZiAocmVxdWlyZXNDb250ZXh0QW5hbHlzaXMocHJlZmVyZW5jZXMuc29ydGluZykpIHtcbiAgICBjb25zdCBjb250ZXh0TWFwID0gYXdhaXQgYW5hbHl6ZVRhYkNvbnRleHQobWFwcGVkLCBvblByb2dyZXNzKTtcbiAgICBtYXBwZWQuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgY29uc3QgcmVzID0gY29udGV4dE1hcC5nZXQodGFiLmlkKTtcbiAgICAgIHRhYi5jb250ZXh0ID0gcmVzPy5jb250ZXh0O1xuICAgICAgdGFiLmNvbnRleHREYXRhID0gcmVzPy5kYXRhO1xuICAgIH0pO1xuICB9XG5cbiAgY29uc3QgZ3JvdXBlZCA9IGdyb3VwVGFicyhtYXBwZWQsIHByZWZlcmVuY2VzLnNvcnRpbmcpO1xuICBncm91cGVkLmZvckVhY2goKGdyb3VwKSA9PiB7XG4gICAgZ3JvdXAudGFicyA9IHNvcnRUYWJzKGdyb3VwLnRhYnMsIHByZWZlcmVuY2VzLnNvcnRpbmcpO1xuICB9KTtcbiAgbG9nSW5mbyhcIkNhbGN1bGF0ZWQgdGFiIGdyb3Vwc1wiLCB7IGdyb3VwczogZ3JvdXBlZC5sZW5ndGgsIHRhYnM6IG1hcHBlZC5sZW5ndGggfSk7XG4gIHJldHVybiBncm91cGVkO1xufTtcblxuY29uc3QgVkFMSURfQ09MT1JTID0gW1wiZ3JleVwiLCBcImJsdWVcIiwgXCJyZWRcIiwgXCJ5ZWxsb3dcIiwgXCJncmVlblwiLCBcInBpbmtcIiwgXCJwdXJwbGVcIiwgXCJjeWFuXCIsIFwib3JhbmdlXCJdO1xuXG5leHBvcnQgY29uc3QgYXBwbHlUYWJHcm91cHMgPSBhc3luYyAoZ3JvdXBzOiBUYWJHcm91cFtdKSA9PiB7XG4gIGNvbnN0IGNsYWltZWRHcm91cElkcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXG4gIGZvciAoY29uc3QgZ3JvdXAgb2YgZ3JvdXBzKSB7XG4gICAgbGV0IHRhYnNUb1Byb2Nlc3M6IHsgd2luZG93SWQ6IG51bWJlciwgdGFiczogVGFiTWV0YWRhdGFbXSB9W10gPSBbXTtcblxuICAgIGlmIChncm91cC53aW5kb3dNb2RlID09PSAnbmV3Jykge1xuICAgICAgaWYgKGdyb3VwLnRhYnMubGVuZ3RoID4gMCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGZpcnN0ID0gZ3JvdXAudGFic1swXTtcbiAgICAgICAgICBjb25zdCB3aW4gPSBhd2FpdCBjaHJvbWUud2luZG93cy5jcmVhdGUoeyB0YWJJZDogZmlyc3QuaWQgfSk7XG4gICAgICAgICAgY29uc3Qgd2luSWQgPSB3aW4uaWQhO1xuICAgICAgICAgIGNvbnN0IG90aGVycyA9IGdyb3VwLnRhYnMuc2xpY2UoMSkubWFwKHQgPT4gdC5pZCk7XG4gICAgICAgICAgaWYgKG90aGVycy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBhd2FpdCBjaHJvbWUudGFicy5tb3ZlKG90aGVycywgeyB3aW5kb3dJZDogd2luSWQsIGluZGV4OiAtMSB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGFic1RvUHJvY2Vzcy5wdXNoKHsgd2luZG93SWQ6IHdpbklkLCB0YWJzOiBncm91cC50YWJzIH0pO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgbG9nRXJyb3IoXCJFcnJvciBjcmVhdGluZyBuZXcgd2luZG93IGZvciBncm91cFwiLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGdyb3VwLndpbmRvd01vZGUgPT09ICdjb21wb3VuZCcpIHtcbiAgICAgIGlmIChncm91cC50YWJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgLy8gRGV0ZXJtaW5lIHRhcmdldCB3aW5kb3cgKG1ham9yaXR5IHdpbnMpXG4gICAgICAgIGNvbnN0IGNvdW50cyA9IG5ldyBNYXA8bnVtYmVyLCBudW1iZXI+KCk7XG4gICAgICAgIGdyb3VwLnRhYnMuZm9yRWFjaCh0ID0+IGNvdW50cy5zZXQodC53aW5kb3dJZCwgKGNvdW50cy5nZXQodC53aW5kb3dJZCkgfHwgMCkgKyAxKSk7XG4gICAgICAgIGxldCB0YXJnZXRXaW5kb3dJZCA9IGdyb3VwLnRhYnNbMF0ud2luZG93SWQ7XG4gICAgICAgIGxldCBtYXggPSAwO1xuICAgICAgICBmb3IgKGNvbnN0IFt3aWQsIGNvdW50XSBvZiBjb3VudHMpIHtcbiAgICAgICAgICBpZiAoY291bnQgPiBtYXgpIHsgbWF4ID0gY291bnQ7IHRhcmdldFdpbmRvd0lkID0gd2lkOyB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBNb3ZlIHRhYnMgbm90IGluIHRhcmdldFxuICAgICAgICBjb25zdCB0b01vdmUgPSBncm91cC50YWJzLmZpbHRlcih0ID0+IHQud2luZG93SWQgIT09IHRhcmdldFdpbmRvd0lkKS5tYXAodCA9PiB0LmlkKTtcbiAgICAgICAgaWYgKHRvTW92ZS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IGNocm9tZS50YWJzLm1vdmUodG9Nb3ZlLCB7IHdpbmRvd0lkOiB0YXJnZXRXaW5kb3dJZCwgaW5kZXg6IC0xIH0pO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGxvZ0Vycm9yKFwiRXJyb3IgbW92aW5nIHRhYnMgZm9yIGNvbXBvdW5kIGdyb3VwXCIsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGFic1RvUHJvY2Vzcy5wdXNoKHsgd2luZG93SWQ6IHRhcmdldFdpbmRvd0lkLCB0YWJzOiBncm91cC50YWJzIH0pO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBDdXJyZW50IG1vZGU6IHNwbGl0IGJ5IHNvdXJjZSB3aW5kb3dcbiAgICAgIGNvbnN0IG1hcCA9IGdyb3VwLnRhYnMucmVkdWNlPE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhW10+PigoYWNjLCB0YWIpID0+IHtcbiAgICAgICAgY29uc3QgZXhpc3RpbmcgPSBhY2MuZ2V0KHRhYi53aW5kb3dJZCkgPz8gW107XG4gICAgICAgIGV4aXN0aW5nLnB1c2godGFiKTtcbiAgICAgICAgYWNjLnNldCh0YWIud2luZG93SWQsIGV4aXN0aW5nKTtcbiAgICAgICAgcmV0dXJuIGFjYztcbiAgICAgIH0sIG5ldyBNYXAoKSk7XG4gICAgICBmb3IgKGNvbnN0IFt3aWQsIHRdIG9mIG1hcCkge1xuICAgICAgICB0YWJzVG9Qcm9jZXNzLnB1c2goeyB3aW5kb3dJZDogd2lkLCB0YWJzOiB0IH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgeyB3aW5kb3dJZDogdGFyZ2V0V2luSWQsIHRhYnMgfSBvZiB0YWJzVG9Qcm9jZXNzKSB7XG4gICAgICAvLyBGaW5kIGNhbmRpZGF0ZSBncm91cCBJRCB0byByZXVzZVxuICAgICAgbGV0IGNhbmRpZGF0ZUdyb3VwSWQ6IG51bWJlciB8IHVuZGVmaW5lZDtcbiAgICAgIGNvbnN0IGNvdW50cyA9IG5ldyBNYXA8bnVtYmVyLCBudW1iZXI+KCk7XG4gICAgICBmb3IgKGNvbnN0IHQgb2YgdGFicykge1xuICAgICAgICAvLyBPbmx5IGNvbnNpZGVyIGdyb3VwcyB0aGF0IHdlcmUgYWxyZWFkeSBpbiB0aGlzIHdpbmRvd1xuICAgICAgICBpZiAodC5ncm91cElkICYmIHQuZ3JvdXBJZCAhPT0gLTEgJiYgdC53aW5kb3dJZCA9PT0gdGFyZ2V0V2luSWQpIHtcbiAgICAgICAgICBjb3VudHMuc2V0KHQuZ3JvdXBJZCwgKGNvdW50cy5nZXQodC5ncm91cElkKSB8fCAwKSArIDEpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIFByaW9yaXRpemUgdGhlIG1vc3QgZnJlcXVlbnQgZ3JvdXAgSUQgdGhhdCBoYXNuJ3QgYmVlbiBjbGFpbWVkIHlldFxuICAgICAgY29uc3Qgc29ydGVkQ2FuZGlkYXRlcyA9IEFycmF5LmZyb20oY291bnRzLmVudHJpZXMoKSlcbiAgICAgICAgLnNvcnQoKGEsIGIpID0+IGJbMV0gLSBhWzFdKVxuICAgICAgICAubWFwKChbaWRdKSA9PiBpZCk7XG5cbiAgICAgIGZvciAoY29uc3QgaWQgb2Ygc29ydGVkQ2FuZGlkYXRlcykge1xuICAgICAgICBpZiAoIWNsYWltZWRHcm91cElkcy5oYXMoaWQpKSB7XG4gICAgICAgICAgY2FuZGlkYXRlR3JvdXBJZCA9IGlkO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGxldCBmaW5hbEdyb3VwSWQ6IG51bWJlcjtcblxuICAgICAgaWYgKGNhbmRpZGF0ZUdyb3VwSWQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBjbGFpbWVkR3JvdXBJZHMuYWRkKGNhbmRpZGF0ZUdyb3VwSWQpO1xuICAgICAgICBmaW5hbEdyb3VwSWQgPSBjYW5kaWRhdGVHcm91cElkO1xuXG4gICAgICAgIC8vIENsZWFuIHVwIGxlZnRvdmVycyBhbmQgYWRkIG1pc3NpbmcgdGFic1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGV4aXN0aW5nVGFicyA9IGF3YWl0IGNocm9tZS50YWJzLnF1ZXJ5KHsgZ3JvdXBJZDogZmluYWxHcm91cElkIH0pO1xuICAgICAgICAgIGNvbnN0IGV4aXN0aW5nVGFiSWRzID0gbmV3IFNldChleGlzdGluZ1RhYnMubWFwKHQgPT4gdC5pZCkpO1xuICAgICAgICAgIGNvbnN0IHRhcmdldFRhYklkcyA9IG5ldyBTZXQodGFicy5tYXAodCA9PiB0LmlkKSk7XG5cbiAgICAgICAgICAvLyAxLiBVbmdyb3VwIHRhYnMgdGhhdCBzaG91bGRuJ3QgYmUgaGVyZVxuICAgICAgICAgIGNvbnN0IGxlZnRvdmVycyA9IGV4aXN0aW5nVGFicy5maWx0ZXIodCA9PiB0LmlkICE9PSB1bmRlZmluZWQgJiYgIXRhcmdldFRhYklkcy5oYXModC5pZCkpO1xuICAgICAgICAgIGlmIChsZWZ0b3ZlcnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMudW5ncm91cChsZWZ0b3ZlcnMubWFwKHQgPT4gdC5pZCEpKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyAyLiBBZGQgb25seSB0aGUgdGFicyB0aGF0IGFyZW4ndCBhbHJlYWR5IGluIHRoZSBncm91cFxuICAgICAgICAgIGNvbnN0IHRhYnNUb0FkZCA9IHRhYnMuZmlsdGVyKHQgPT4gIWV4aXN0aW5nVGFiSWRzLmhhcyh0LmlkKSk7XG4gICAgICAgICAgaWYgKHRhYnNUb0FkZC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgLy8gRm9yIG5ldy9jb21wb3VuZCwgdGFicyBtaWdodCBoYXZlIGJlZW4gbW92ZWQsIHNvIHdlIG11c3QgcGFzcyB0YWJJZHNcbiAgICAgICAgICAgICBhd2FpdCBjaHJvbWUudGFicy5ncm91cCh7IGdyb3VwSWQ6IGZpbmFsR3JvdXBJZCwgdGFiSWRzOiB0YWJzVG9BZGQubWFwKHQgPT4gdC5pZCkgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgbG9nRXJyb3IoXCJFcnJvciBtYW5hZ2luZyBncm91cCByZXVzZVwiLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIENyZWF0ZSBuZXcgZ3JvdXAgKGRlZmF1bHQgYmVoYXZpb3I6IGV4cGFuZGVkKVxuICAgICAgICAvLyBFbnN1cmUgd2UgY3JlYXRlIGl0IGluIHRoZSB0YXJnZXQgd2luZG93IChpZiBzdHJpY3RseSBuZXcsIHRhYklkcyBpbXBsaWVzIHdpbmRvdyBpZiB0aGV5IGFyZSBpbiBpdClcbiAgICAgICAgLy8gSWYgdGFicyB3ZXJlIGp1c3QgbW92ZWQsIHRoZXkgYXJlIGluIHRhcmdldFdpbklkLlxuICAgICAgICAvLyBjaHJvbWUudGFicy5ncm91cCB3aXRoIHRhYklkcyB3aWxsIGluZmVyIHdpbmRvdyBmcm9tIHRhYnMuXG4gICAgICAgIGZpbmFsR3JvdXBJZCA9IGF3YWl0IGNocm9tZS50YWJzLmdyb3VwKHtcbiAgICAgICAgICB0YWJJZHM6IHRhYnMubWFwKHQgPT4gdC5pZCksXG4gICAgICAgICAgY3JlYXRlUHJvcGVydGllczogeyB3aW5kb3dJZDogdGFyZ2V0V2luSWQgfVxuICAgICAgICB9KTtcbiAgICAgICAgY2xhaW1lZEdyb3VwSWRzLmFkZChmaW5hbEdyb3VwSWQpO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB1cGRhdGVQcm9wczogY2hyb21lLnRhYkdyb3Vwcy5VcGRhdGVQcm9wZXJ0aWVzID0ge1xuICAgICAgICB0aXRsZTogZ3JvdXAubGFiZWxcbiAgICAgIH07XG4gICAgICBpZiAoVkFMSURfQ09MT1JTLmluY2x1ZGVzKGdyb3VwLmNvbG9yKSkge1xuICAgICAgICAgIHVwZGF0ZVByb3BzLmNvbG9yID0gZ3JvdXAuY29sb3IgYXMgY2hyb21lLnRhYkdyb3Vwcy5Db2xvckVudW07XG4gICAgICB9XG4gICAgICBhd2FpdCBjaHJvbWUudGFiR3JvdXBzLnVwZGF0ZShmaW5hbEdyb3VwSWQsIHVwZGF0ZVByb3BzKTtcbiAgICB9XG4gIH1cbiAgbG9nSW5mbyhcIkFwcGxpZWQgdGFiIGdyb3Vwc1wiLCB7IGNvdW50OiBncm91cHMubGVuZ3RoIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IGFwcGx5VGFiU29ydGluZyA9IGFzeW5jIChcbiAgcHJlZmVyZW5jZXM6IFByZWZlcmVuY2VzLFxuICBmaWx0ZXI/OiBHcm91cGluZ1NlbGVjdGlvbixcbiAgb25Qcm9ncmVzcz86IChjb21wbGV0ZWQ6IG51bWJlciwgdG90YWw6IG51bWJlcikgPT4gdm9pZFxuKSA9PiB7XG4gIGNvbnN0IHRhcmdldFdpbmRvd0lkcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuICBsZXQgY2hyb21lVGFiczogY2hyb21lLnRhYnMuVGFiW10gPSBbXTtcblxuICBjb25zdCBleHBsaWNpdFdpbmRvd0lkcyA9IGZpbHRlcj8ud2luZG93SWRzID8/IFtdO1xuICBjb25zdCBleHBsaWNpdFRhYklkcyA9IGZpbHRlcj8udGFiSWRzID8/IFtdO1xuICBjb25zdCBoYXNGaWx0ZXIgPSBleHBsaWNpdFdpbmRvd0lkcy5sZW5ndGggPiAwIHx8IGV4cGxpY2l0VGFiSWRzLmxlbmd0aCA+IDA7XG5cbiAgaWYgKCFoYXNGaWx0ZXIpIHtcbiAgICAgIGNocm9tZVRhYnMgPSBhd2FpdCBjaHJvbWUudGFicy5xdWVyeSh7fSk7XG4gICAgICBjaHJvbWVUYWJzLmZvckVhY2godCA9PiB7IGlmICh0LndpbmRvd0lkKSB0YXJnZXRXaW5kb3dJZHMuYWRkKHQud2luZG93SWQpOyB9KTtcbiAgfSBlbHNlIHtcbiAgICAgIGV4cGxpY2l0V2luZG93SWRzLmZvckVhY2goaWQgPT4gdGFyZ2V0V2luZG93SWRzLmFkZChpZCkpO1xuXG4gICAgICBpZiAoZXhwbGljaXRUYWJJZHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNvbnN0IHNwZWNpZmljVGFicyA9IGF3YWl0IFByb21pc2UuYWxsKGV4cGxpY2l0VGFiSWRzLm1hcChpZCA9PiBjaHJvbWUudGFicy5nZXQoaWQpLmNhdGNoKCgpID0+IG51bGwpKSk7XG4gICAgICAgICAgc3BlY2lmaWNUYWJzLmZvckVhY2godCA9PiB7XG4gICAgICAgICAgICAgIGlmICh0ICYmIHQud2luZG93SWQpIHRhcmdldFdpbmRvd0lkcy5hZGQodC53aW5kb3dJZCk7XG4gICAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHdpbmRvd1Byb21pc2VzID0gQXJyYXkuZnJvbSh0YXJnZXRXaW5kb3dJZHMpLm1hcCh3aW5kb3dJZCA9PlxuICAgICAgICAgIGNocm9tZS50YWJzLnF1ZXJ5KHsgd2luZG93SWQgfSkuY2F0Y2goKCkgPT4gW10pXG4gICAgICApO1xuICAgICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKHdpbmRvd1Byb21pc2VzKTtcbiAgICAgIGNocm9tZVRhYnMgPSByZXN1bHRzLmZsYXQoKTtcbiAgfVxuXG4gIGZvciAoY29uc3Qgd2luZG93SWQgb2YgdGFyZ2V0V2luZG93SWRzKSB7XG4gICAgICBjb25zdCB3aW5kb3dUYWJzID0gY2hyb21lVGFicy5maWx0ZXIodCA9PiB0LndpbmRvd0lkID09PSB3aW5kb3dJZCk7XG4gICAgICBjb25zdCBtYXBwZWQgPSB3aW5kb3dUYWJzLm1hcChtYXBDaHJvbWVUYWIpLmZpbHRlcigodCk6IHQgaXMgVGFiTWV0YWRhdGEgPT4gQm9vbGVhbih0KSk7XG5cbiAgICAgIGlmIChyZXF1aXJlc0NvbnRleHRBbmFseXNpcyhwcmVmZXJlbmNlcy5zb3J0aW5nKSkge1xuICAgICAgICBjb25zdCBjb250ZXh0TWFwID0gYXdhaXQgYW5hbHl6ZVRhYkNvbnRleHQobWFwcGVkLCBvblByb2dyZXNzKTtcbiAgICAgICAgbWFwcGVkLmZvckVhY2godGFiID0+IHtcbiAgICAgICAgICBjb25zdCByZXMgPSBjb250ZXh0TWFwLmdldCh0YWIuaWQpO1xuICAgICAgICAgIHRhYi5jb250ZXh0ID0gcmVzPy5jb250ZXh0O1xuICAgICAgICAgIHRhYi5jb250ZXh0RGF0YSA9IHJlcz8uZGF0YTtcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIC8vIEdyb3VwIHRhYnMgYnkgZ3JvdXBJZCB0byBzb3J0IHdpdGhpbiBncm91cHNcbiAgICAgIGNvbnN0IHRhYnNCeUdyb3VwID0gbmV3IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhW10+KCk7XG4gICAgICBjb25zdCB1bmdyb3VwZWRUYWJzOiBUYWJNZXRhZGF0YVtdID0gW107XG5cbiAgICAgIG1hcHBlZC5mb3JFYWNoKHRhYiA9PiB7XG4gICAgICAgIGNvbnN0IGdyb3VwSWQgPSB0YWIuZ3JvdXBJZCA/PyAtMTtcbiAgICAgICAgaWYgKGdyb3VwSWQgIT09IC0xKSB7XG4gICAgICAgICAgY29uc3QgZ3JvdXAgPSB0YWJzQnlHcm91cC5nZXQoZ3JvdXBJZCkgPz8gW107XG4gICAgICAgICAgZ3JvdXAucHVzaCh0YWIpO1xuICAgICAgICAgIHRhYnNCeUdyb3VwLnNldChncm91cElkLCBncm91cCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdW5ncm91cGVkVGFicy5wdXNoKHRhYik7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICAvLyAxLiBTb3J0IHRhYnMgd2l0aGluIGVhY2ggZ3JvdXBcbiAgICAgIGZvciAoY29uc3QgW2dyb3VwSWQsIHRhYnNdIG9mIHRhYnNCeUdyb3VwKSB7XG4gICAgICAgIGNvbnN0IGdyb3VwVGFiSW5kaWNlcyA9IHdpbmRvd1RhYnNcbiAgICAgICAgICAuZmlsdGVyKHQgPT4gdC5ncm91cElkID09PSBncm91cElkKVxuICAgICAgICAgIC5tYXAodCA9PiB0LmluZGV4KVxuICAgICAgICAgIC5zb3J0KChhLCBiKSA9PiBhIC0gYik7XG5cbiAgICAgICAgY29uc3Qgc3RhcnRJbmRleCA9IGdyb3VwVGFiSW5kaWNlc1swXSA/PyAwO1xuXG4gICAgICAgIGNvbnN0IHNvcnRlZEdyb3VwVGFicyA9IHNvcnRUYWJzKHRhYnMsIHByZWZlcmVuY2VzLnNvcnRpbmcpO1xuICAgICAgICBjb25zdCBzb3J0ZWRJZHMgPSBzb3J0ZWRHcm91cFRhYnMubWFwKHQgPT4gdC5pZCk7XG5cbiAgICAgICAgaWYgKHNvcnRlZElkcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgIGF3YWl0IGNocm9tZS50YWJzLm1vdmUoc29ydGVkSWRzLCB7IGluZGV4OiBzdGFydEluZGV4IH0pO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIDIuIFNvcnQgdW5ncm91cGVkIHRhYnNcbiAgICAgIGlmICh1bmdyb3VwZWRUYWJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29uc3Qgc29ydGVkVW5ncm91cGVkID0gc29ydFRhYnModW5ncm91cGVkVGFicywgcHJlZmVyZW5jZXMuc29ydGluZyk7XG4gICAgICAgIGNvbnN0IHNvcnRlZElkcyA9IHNvcnRlZFVuZ3JvdXBlZC5tYXAodCA9PiB0LmlkKTtcblxuICAgICAgICAvLyBNb3ZlIHRvIGluZGV4IDAgKHRvcCBvZiB3aW5kb3cpXG4gICAgICAgIGF3YWl0IGNocm9tZS50YWJzLm1vdmUoc29ydGVkSWRzLCB7IGluZGV4OiAwIH0pO1xuICAgICAgfVxuXG4gICAgICAvLyAzLiBTb3J0IEdyb3VwcyAoaWYgZW5hYmxlZClcbiAgICAgIGF3YWl0IHNvcnRHcm91cHNJZkVuYWJsZWQod2luZG93SWQsIHByZWZlcmVuY2VzLnNvcnRpbmcsIHRhYnNCeUdyb3VwKTtcbiAgfVxuICBsb2dJbmZvKFwiQXBwbGllZCB0YWIgc29ydGluZ1wiKTtcbn07XG5cbmNvbnN0IGNvbXBhcmVCeVNvcnRpbmdSdWxlcyA9IChzb3J0aW5nUnVsZXNBcmc6IFNvcnRpbmdSdWxlW10sIGE6IFRhYk1ldGFkYXRhLCBiOiBUYWJNZXRhZGF0YSk6IG51bWJlciA9PiB7XG4gIGNvbnN0IHNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihzb3J0aW5nUnVsZXNBcmcpO1xuICBpZiAoc29ydFJ1bGVzTGlzdC5sZW5ndGggPT09IDApIHJldHVybiAwO1xuXG4gIHRyeSB7XG4gICAgZm9yIChjb25zdCBydWxlIG9mIHNvcnRSdWxlc0xpc3QpIHtcbiAgICAgIGlmICghcnVsZSkgY29udGludWU7XG4gICAgICBjb25zdCB2YWxBID0gZ2V0RmllbGRWYWx1ZShhLCBydWxlLmZpZWxkKTtcbiAgICAgIGNvbnN0IHZhbEIgPSBnZXRGaWVsZFZhbHVlKGIsIHJ1bGUuZmllbGQpO1xuXG4gICAgICBsZXQgcmVzdWx0ID0gMDtcbiAgICAgIGlmICh2YWxBIDwgdmFsQikgcmVzdWx0ID0gLTE7XG4gICAgICBlbHNlIGlmICh2YWxBID4gdmFsQikgcmVzdWx0ID0gMTtcblxuICAgICAgaWYgKHJlc3VsdCAhPT0gMCkge1xuICAgICAgICByZXR1cm4gcnVsZS5vcmRlciA9PT0gXCJkZXNjXCIgPyAtcmVzdWx0IDogcmVzdWx0O1xuICAgICAgfVxuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBsb2dFcnJvcihcIkVycm9yIGV2YWx1YXRpbmcgc29ydGluZyBydWxlc1wiLCB7IGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICB9XG5cbiAgcmV0dXJuIDA7XG59O1xuXG5jb25zdCBzb3J0R3JvdXBzSWZFbmFibGVkID0gYXN5bmMgKFxuICAgIHdpbmRvd0lkOiBudW1iZXIsXG4gICAgc29ydGluZ1ByZWZlcmVuY2VzOiBzdHJpbmdbXSxcbiAgICB0YWJzQnlHcm91cDogTWFwPG51bWJlciwgVGFiTWV0YWRhdGFbXT5cbikgPT4ge1xuICAgIC8vIENoZWNrIGlmIGFueSBhY3RpdmUgc3RyYXRlZ3kgaGFzIHNvcnRHcm91cHM6IHRydWVcbiAgICBjb25zdCBjdXN0b21TdHJhdHMgPSBnZXRDdXN0b21TdHJhdGVnaWVzKCk7XG4gICAgbGV0IGdyb3VwU29ydGVyU3RyYXRlZ3k6IFJldHVyblR5cGU8dHlwZW9mIGN1c3RvbVN0cmF0cy5maW5kPiB8IG51bGwgPSBudWxsO1xuXG4gICAgZm9yIChjb25zdCBpZCBvZiBzb3J0aW5nUHJlZmVyZW5jZXMpIHtcbiAgICAgICAgY29uc3Qgc3RyYXRlZ3kgPSBjdXN0b21TdHJhdHMuZmluZChzID0+IHMuaWQgPT09IGlkKTtcbiAgICAgICAgaWYgKHN0cmF0ZWd5ICYmIChzdHJhdGVneS5zb3J0R3JvdXBzIHx8IChzdHJhdGVneS5ncm91cFNvcnRpbmdSdWxlcyAmJiBzdHJhdGVneS5ncm91cFNvcnRpbmdSdWxlcy5sZW5ndGggPiAwKSkpIHtcbiAgICAgICAgICAgIGdyb3VwU29ydGVyU3RyYXRlZ3kgPSBzdHJhdGVneTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKCFncm91cFNvcnRlclN0cmF0ZWd5KSByZXR1cm47XG5cbiAgICAvLyBHZXQgZ3JvdXAgZGV0YWlsc1xuICAgIGNvbnN0IGdyb3VwcyA9IGF3YWl0IGNocm9tZS50YWJHcm91cHMucXVlcnkoeyB3aW5kb3dJZCB9KTtcbiAgICBpZiAoZ3JvdXBzLmxlbmd0aCA8PSAxKSByZXR1cm47XG5cbiAgICAvLyBXZSBzb3J0IGdyb3VwcyBiYXNlZCBvbiB0aGUgc3RyYXRlZ3kuXG4gICAgLy8gU2luY2UgY29tcGFyZUJ5IGV4cGVjdHMgVGFiTWV0YWRhdGEsIHdlIG5lZWQgdG8gY3JlYXRlIGEgcmVwcmVzZW50YXRpdmUgVGFiTWV0YWRhdGEgZm9yIGVhY2ggZ3JvdXAuXG4gICAgLy8gV2UnbGwgdXNlIHRoZSBmaXJzdCB0YWIgb2YgdGhlIGdyb3VwIChzb3J0ZWQpIGFzIHRoZSByZXByZXNlbnRhdGl2ZS5cblxuICAgIGNvbnN0IGdyb3VwUmVwczogeyBncm91cDogY2hyb21lLnRhYkdyb3Vwcy5UYWJHcm91cDsgcmVwOiBUYWJNZXRhZGF0YSB9W10gPSBbXTtcblxuICAgIGZvciAoY29uc3QgZ3JvdXAgb2YgZ3JvdXBzKSB7XG4gICAgICAgIGNvbnN0IHRhYnMgPSB0YWJzQnlHcm91cC5nZXQoZ3JvdXAuaWQpO1xuICAgICAgICBpZiAodGFicyAmJiB0YWJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIC8vIHRhYnMgYXJlIGFscmVhZHkgc29ydGVkIGJ5IHNvcnRUYWJzIGluIHByZXZpb3VzIHN0ZXAgaWYgdGhhdCBzdHJhdGVneSB3YXMgYXBwbGllZFxuICAgICAgICAgICAgLy8gb3Igd2UganVzdCB0YWtlIHRoZSBmaXJzdCBvbmUuXG4gICAgICAgICAgICAvLyBJZGVhbGx5IHdlIHVzZSB0aGUgXCJiZXN0XCIgdGFiLlxuICAgICAgICAgICAgLy8gQnV0IHNpbmNlIHdlIGFscmVhZHkgc29ydGVkIHRhYnMgd2l0aGluIGdyb3VwcywgdGFic1swXSBpcyB0aGUgZmlyc3Qgb25lLlxuICAgICAgICAgICAgZ3JvdXBSZXBzLnB1c2goeyBncm91cCwgcmVwOiB0YWJzWzBdIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gU29ydCB0aGUgZ3JvdXBzXG4gICAgaWYgKGdyb3VwU29ydGVyU3RyYXRlZ3kuZ3JvdXBTb3J0aW5nUnVsZXMgJiYgQXJyYXkuaXNBcnJheShncm91cFNvcnRlclN0cmF0ZWd5Lmdyb3VwU29ydGluZ1J1bGVzKSAmJiBncm91cFNvcnRlclN0cmF0ZWd5Lmdyb3VwU29ydGluZ1J1bGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgZ3JvdXBSZXBzLnNvcnQoKGEsIGIpID0+IGNvbXBhcmVCeVNvcnRpbmdSdWxlcyhncm91cFNvcnRlclN0cmF0ZWd5IS5ncm91cFNvcnRpbmdSdWxlcyEsIGEucmVwLCBiLnJlcCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGdyb3VwUmVwcy5zb3J0KChhLCBiKSA9PiBjb21wYXJlQnkoZ3JvdXBTb3J0ZXJTdHJhdGVneSEuaWQsIGEucmVwLCBiLnJlcCkpO1xuICAgIH1cblxuICAgIC8vIEFwcGx5IHRoZSBvcmRlclxuICAgIC8vIGNocm9tZS50YWJHcm91cHMubW92ZShncm91cElkLCB7IGluZGV4OiAuLi4gfSlcbiAgICAvLyBXZSB3YW50IHRoZW0gdG8gYmUgYWZ0ZXIgdW5ncm91cGVkIHRhYnMgKHdoaWNoIGFyZSBhdCBpbmRleCAwLi5OKS5cbiAgICAvLyBBY3R1YWxseSwgY2hyb21lLnRhYkdyb3Vwcy5tb3ZlIGluZGV4IGlzIHRoZSB0YWIgaW5kZXggd2hlcmUgdGhlIGdyb3VwIHN0YXJ0cy5cbiAgICAvLyBJZiB3ZSB3YW50IHRvIHN0cmljdGx5IG9yZGVyIGdyb3Vwcywgd2Ugc2hvdWxkIGNhbGN1bGF0ZSB0aGUgdGFyZ2V0IGluZGV4LlxuICAgIC8vIEJ1dCBzaW5jZSBncm91cHMgYXJlIGNvbnRpZ3VvdXMgYmxvY2tzIG9mIHRhYnMsIHdlIGp1c3QgbmVlZCB0byBwbGFjZSB0aGVtIGluIG9yZGVyLlxuXG4gICAgLy8gQ2FsY3VsYXRlIHRoZSBzdGFydGluZyBpbmRleCBmb3IgZ3JvdXBzLlxuICAgIC8vIFVuZ3JvdXBlZCB0YWJzIGFyZSBhdCB0aGUgc3RhcnQgKGluZGV4IDApLlxuICAgIC8vIFNvIHRoZSBmaXJzdCBncm91cCBzaG91bGQgc3RhcnQgYWZ0ZXIgdGhlIGxhc3QgdW5ncm91cGVkIHRhYi5cbiAgICAvLyBXYWl0LCBlYXJsaWVyIHdlIG1vdmVkIHVuZ3JvdXBlZCB0YWJzIHRvIGluZGV4IDAuXG4gICAgLy8gQnV0IHdlIG5lZWQgdG8ga25vdyBob3cgbWFueSB1bmdyb3VwZWQgdGFicyB0aGVyZSBhcmUgaW4gdGhpcyB3aW5kb3cuXG5cbiAgICAvLyBMZXQncyBnZXQgY3VycmVudCB0YWJzIGFnYWluIG9yIHRyYWNrIGNvdW50P1xuICAgIC8vIFdlIGNhbiBhc3N1bWUgdW5ncm91cGVkIHRhYnMgYXJlIGF0IHRoZSB0b3AuXG4gICAgLy8gQnV0IGB0YWJzQnlHcm91cGAgb25seSBjb250YWlucyBncm91cGVkIHRhYnMuXG4gICAgLy8gV2UgbmVlZCB0byBrbm93IHdoZXJlIHRvIHN0YXJ0IHBsYWNpbmcgZ3JvdXBzLlxuICAgIC8vIFRoZSBzYWZlc3Qgd2F5IGlzIHRvIG1vdmUgdGhlbSBvbmUgYnkgb25lIHRvIHRoZSBlbmQgKG9yIHNwZWNpZmljIGluZGV4KS5cblxuICAgIC8vIElmIHdlIGp1c3QgbW92ZSB0aGVtIGluIG9yZGVyIHRvIGluZGV4IC0xLCB0aGV5IHdpbGwgYXBwZW5kIHRvIHRoZSBlbmQuXG4gICAgLy8gSWYgd2Ugd2FudCB0aGVtIGFmdGVyIHVuZ3JvdXBlZCB0YWJzLCB3ZSBuZWVkIHRvIGZpbmQgdGhlIGluZGV4LlxuXG4gICAgLy8gTGV0J3MgdXNlIGluZGV4ID0gLTEgdG8gcHVzaCB0byBlbmQsIHNlcXVlbnRpYWxseS5cbiAgICAvLyBCdXQgd2FpdCwgaWYgd2UgcHVzaCB0byBlbmQsIHRoZSBvcmRlciBpcyBwcmVzZXJ2ZWQ/XG4gICAgLy8gTm8sIGlmIHdlIGl0ZXJhdGUgc29ydGVkIGdyb3VwcyBhbmQgbW92ZSBlYWNoIHRvIC0xLCB0aGUgbGFzdCBvbmUgbW92ZWQgd2lsbCBiZSBhdCB0aGUgZW5kLlxuICAgIC8vIFNvIHdlIHNob3VsZCBpdGVyYXRlIGluIG9yZGVyIGFuZCBtb3ZlIHRvIC0xPyBObywgdGhhdCB3b3VsZCByZXZlcnNlIHRoZW0gaWYgd2UgY29uc2lkZXIgXCJlbmRcIi5cbiAgICAvLyBBY3R1YWxseSwgaWYgd2UgbW92ZSBHcm91cCBBIHRvIC0xLCBpdCBnb2VzIHRvIGVuZC4gVGhlbiBHcm91cCBCIHRvIC0xLCBpdCBnb2VzIGFmdGVyIEEuXG4gICAgLy8gU28gaXRlcmF0aW5nIGluIHNvcnRlZCBvcmRlciBhbmQgbW92aW5nIHRvIC0xIHdvcmtzIHRvIGFycmFuZ2UgdGhlbSBhdCB0aGUgZW5kIG9mIHRoZSB3aW5kb3cuXG5cbiAgICAvLyBIb3dldmVyLCBpZiB0aGVyZSBhcmUgcGlubmVkIHRhYnMgb3IgdW5ncm91cGVkIHRhYnMsIHRoZXkgc2hvdWxkIHN0YXkgYXQgdG9wP1xuICAgIC8vIFVuZ3JvdXBlZCB0YWJzIHdlcmUgbW92ZWQgdG8gaW5kZXggMC5cbiAgICAvLyBQaW5uZWQgdGFiczogYGNocm9tZS50YWJzLm1vdmVgIGhhbmRsZXMgcGlubmVkIGNvbnN0cmFpbnQgKHBpbm5lZCB0YWJzIG11c3QgYmUgZmlyc3QpLlxuICAgIC8vIEdyb3VwcyBjYW5ub3QgY29udGFpbiBwaW5uZWQgdGFicy5cbiAgICAvLyBTbyBncm91cHMgd2lsbCBiZSBhZnRlciBwaW5uZWQgdGFicy5cbiAgICAvLyBJZiB3ZSBtb3ZlIHRvIC0xLCB0aGV5IGdvIHRvIHRoZSB2ZXJ5IGVuZC5cblxuICAgIC8vIFdoYXQgaWYgd2Ugd2FudCB0aGVtIHNwZWNpZmljYWxseSBhcnJhbmdlZD9cbiAgICAvLyBJZiB3ZSBtb3ZlIHRoZW0gc2VxdWVudGlhbGx5IHRvIC0xLCB0aGV5IHdpbGwgYmUgb3JkZXJlZCBBLCBCLCBDLi4uIGF0IHRoZSBib3R0b20uXG4gICAgLy8gVGhpcyBzZWVtcyBjb3JyZWN0IGZvciBcInNvcnRpbmcgZ3JvdXBzXCIuXG5cbiAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgZ3JvdXBSZXBzKSB7XG4gICAgICAgIGF3YWl0IGNocm9tZS50YWJHcm91cHMubW92ZShpdGVtLmdyb3VwLmlkLCB7IGluZGV4OiAtMSB9KTtcbiAgICB9XG59O1xuXG5leHBvcnQgY29uc3QgY2xvc2VHcm91cCA9IGFzeW5jIChncm91cDogVGFiR3JvdXApID0+IHtcbiAgY29uc3QgaWRzID0gZ3JvdXAudGFicy5tYXAoKHRhYikgPT4gdGFiLmlkKTtcbiAgYXdhaXQgY2hyb21lLnRhYnMucmVtb3ZlKGlkcyk7XG4gIGxvZ0luZm8oXCJDbG9zZWQgZ3JvdXBcIiwgeyBsYWJlbDogZ3JvdXAubGFiZWwsIGNvdW50OiBpZHMubGVuZ3RoIH0pO1xufTtcblxuY29uc3QgZ2V0VGFic0J5SWRzID0gYXN5bmMgKHRhYklkczogbnVtYmVyW10pOiBQcm9taXNlPGNocm9tZS50YWJzLlRhYltdPiA9PiB7XG4gIGlmICghdGFiSWRzLmxlbmd0aCkgcmV0dXJuIFtdO1xuICBjb25zdCBhbGxUYWJzID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoe30pO1xuICBjb25zdCB0YWJNYXAgPSBuZXcgTWFwKGFsbFRhYnMubWFwKHQgPT4gW3QuaWQsIHRdKSk7XG4gIHJldHVybiB0YWJJZHNcbiAgICAubWFwKGlkID0+IHRhYk1hcC5nZXQoaWQpKVxuICAgIC5maWx0ZXIoKHQpOiB0IGlzIGNocm9tZS50YWJzLlRhYiA9PiB0ICE9PSB1bmRlZmluZWQgJiYgdC5pZCAhPT0gdW5kZWZpbmVkICYmIHQud2luZG93SWQgIT09IHVuZGVmaW5lZCk7XG59O1xuXG5leHBvcnQgY29uc3QgbWVyZ2VUYWJzID0gYXN5bmMgKHRhYklkczogbnVtYmVyW10pID0+IHtcbiAgaWYgKCF0YWJJZHMubGVuZ3RoKSByZXR1cm47XG4gIGNvbnN0IHZhbGlkVGFicyA9IGF3YWl0IGdldFRhYnNCeUlkcyh0YWJJZHMpO1xuXG4gIGlmICh2YWxpZFRhYnMubGVuZ3RoID09PSAwKSByZXR1cm47XG5cbiAgLy8gVGFyZ2V0IFdpbmRvdzogVGhlIG9uZSB3aXRoIHRoZSBtb3N0IHNlbGVjdGVkIHRhYnMsIG9yIHRoZSBmaXJzdCBvbmUuXG4gIC8vIFVzaW5nIHRoZSBmaXJzdCB0YWIncyB3aW5kb3cgYXMgdGhlIHRhcmdldC5cbiAgY29uc3QgdGFyZ2V0V2luZG93SWQgPSB2YWxpZFRhYnNbMF0ud2luZG93SWQ7XG5cbiAgLy8gMS4gTW92ZSB0YWJzIHRvIHRhcmdldCB3aW5kb3dcbiAgY29uc3QgdGFic1RvTW92ZSA9IHZhbGlkVGFicy5maWx0ZXIodCA9PiB0LndpbmRvd0lkICE9PSB0YXJnZXRXaW5kb3dJZCk7XG4gIGlmICh0YWJzVG9Nb3ZlLmxlbmd0aCA+IDApIHtcbiAgICBjb25zdCBtb3ZlSWRzID0gdGFic1RvTW92ZS5tYXAodCA9PiB0LmlkISk7XG4gICAgYXdhaXQgY2hyb21lLnRhYnMubW92ZShtb3ZlSWRzLCB7IHdpbmRvd0lkOiB0YXJnZXRXaW5kb3dJZCwgaW5kZXg6IC0xIH0pO1xuICB9XG5cbiAgLy8gMi4gR3JvdXAgdGhlbVxuICAvLyBDaGVjayBpZiB0aGVyZSBpcyBhbiBleGlzdGluZyBncm91cCBpbiB0aGUgdGFyZ2V0IHdpbmRvdyB0aGF0IHdhcyBwYXJ0IG9mIHRoZSBzZWxlY3Rpb24uXG4gIC8vIFdlIHByaW9yaXRpemUgdGhlIGdyb3VwIG9mIHRoZSBmaXJzdCB0YWIgaWYgaXQgaGFzIG9uZS5cbiAgY29uc3QgZmlyc3RUYWJHcm91cElkID0gdmFsaWRUYWJzWzBdLmdyb3VwSWQ7XG4gIGxldCB0YXJnZXRHcm91cElkOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cbiAgaWYgKGZpcnN0VGFiR3JvdXBJZCAmJiBmaXJzdFRhYkdyb3VwSWQgIT09IC0xKSB7XG4gICAgICAvLyBWZXJpZnkgdGhlIGdyb3VwIGlzIGluIHRoZSB0YXJnZXQgd2luZG93IChpdCBzaG91bGQgYmUsIGFzIHdlIHBpY2tlZCB0YXJnZXRXaW5kb3dJZCBmcm9tIHZhbGlkVGFic1swXSlcbiAgICAgIC8vIEJ1dCBpZiB2YWxpZFRhYnNbMF0gd2FzIG1vdmVkIChpdCB3YXNuJ3QsIGFzIGl0IGRlZmluZWQgdGhlIHRhcmdldCksIGl0J3MgZmluZS5cbiAgICAgIHRhcmdldEdyb3VwSWQgPSBmaXJzdFRhYkdyb3VwSWQ7XG4gIH0gZWxzZSB7XG4gICAgICAvLyBMb29rIGZvciBhbnkgb3RoZXIgZ3JvdXAgaW4gdGhlIHNlbGVjdGlvbiB0aGF0IGlzIGluIHRoZSB0YXJnZXQgd2luZG93XG4gICAgICBjb25zdCBvdGhlckdyb3VwID0gdmFsaWRUYWJzLmZpbmQodCA9PiB0LndpbmRvd0lkID09PSB0YXJnZXRXaW5kb3dJZCAmJiB0Lmdyb3VwSWQgIT09IC0xKTtcbiAgICAgIGlmIChvdGhlckdyb3VwKSB7XG4gICAgICAgICAgdGFyZ2V0R3JvdXBJZCA9IG90aGVyR3JvdXAuZ3JvdXBJZDtcbiAgICAgIH1cbiAgfVxuXG4gIGNvbnN0IGlkcyA9IHZhbGlkVGFicy5tYXAodCA9PiB0LmlkISk7XG4gIGF3YWl0IGNocm9tZS50YWJzLmdyb3VwKHsgdGFiSWRzOiBpZHMsIGdyb3VwSWQ6IHRhcmdldEdyb3VwSWQgfSk7XG4gIGxvZ0luZm8oXCJNZXJnZWQgdGFic1wiLCB7IGNvdW50OiBpZHMubGVuZ3RoLCB0YXJnZXRXaW5kb3dJZCwgdGFyZ2V0R3JvdXBJZCB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBzcGxpdFRhYnMgPSBhc3luYyAodGFiSWRzOiBudW1iZXJbXSkgPT4ge1xuICBpZiAodGFiSWRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuXG4gIC8vIDEuIFZhbGlkYXRlIHRhYnNcbiAgY29uc3QgdmFsaWRUYWJzID0gYXdhaXQgZ2V0VGFic0J5SWRzKHRhYklkcyk7XG5cbiAgaWYgKHZhbGlkVGFicy5sZW5ndGggPT09IDApIHJldHVybjtcblxuICAvLyAyLiBDcmVhdGUgbmV3IHdpbmRvdyB3aXRoIHRoZSBmaXJzdCB0YWJcbiAgY29uc3QgZmlyc3RUYWIgPSB2YWxpZFRhYnNbMF07XG4gIGNvbnN0IG5ld1dpbmRvdyA9IGF3YWl0IGNocm9tZS53aW5kb3dzLmNyZWF0ZSh7IHRhYklkOiBmaXJzdFRhYi5pZCB9KTtcblxuICAvLyAzLiBNb3ZlIHJlbWFpbmluZyB0YWJzIHRvIG5ldyB3aW5kb3dcbiAgaWYgKHZhbGlkVGFicy5sZW5ndGggPiAxKSB7XG4gICAgY29uc3QgcmVtYWluaW5nVGFiSWRzID0gdmFsaWRUYWJzLnNsaWNlKDEpLm1hcCh0ID0+IHQuaWQhKTtcbiAgICBhd2FpdCBjaHJvbWUudGFicy5tb3ZlKHJlbWFpbmluZ1RhYklkcywgeyB3aW5kb3dJZDogbmV3V2luZG93LmlkISwgaW5kZXg6IC0xIH0pO1xuICB9XG5cbiAgbG9nSW5mbyhcIlNwbGl0IHRhYnMgdG8gbmV3IHdpbmRvd1wiLCB7IGNvdW50OiB2YWxpZFRhYnMubGVuZ3RoLCBuZXdXaW5kb3dJZDogbmV3V2luZG93LmlkIH0pO1xufTtcbiIsICJpbXBvcnQgeyBVbmRvU3RhdGUsIFNhdmVkU3RhdGUsIFdpbmRvd1N0YXRlLCBTdG9yZWRUYWJTdGF0ZSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGdldFN0b3JlZFZhbHVlLCBzZXRTdG9yZWRWYWx1ZSB9IGZyb20gXCIuL3N0b3JhZ2UuanNcIjtcbmltcG9ydCB7IGxvZ0luZm8sIGxvZ0Vycm9yIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcblxuY29uc3QgTUFYX1VORE9fU1RBQ0sgPSAxMDtcbmNvbnN0IFVORE9fU1RBQ0tfS0VZID0gXCJ1bmRvU3RhY2tcIjtcbmNvbnN0IFNBVkVEX1NUQVRFU19LRVkgPSBcInNhdmVkU3RhdGVzXCI7XG5cbmV4cG9ydCBjb25zdCBjYXB0dXJlQ3VycmVudFN0YXRlID0gYXN5bmMgKCk6IFByb21pc2U8VW5kb1N0YXRlPiA9PiB7XG4gIGNvbnN0IHdpbmRvd3MgPSBhd2FpdCBjaHJvbWUud2luZG93cy5nZXRBbGwoeyBwb3B1bGF0ZTogdHJ1ZSB9KTtcbiAgY29uc3Qgd2luZG93U3RhdGVzOiBXaW5kb3dTdGF0ZVtdID0gW107XG5cbiAgZm9yIChjb25zdCB3aW4gb2Ygd2luZG93cykge1xuICAgIGlmICghd2luLnRhYnMpIGNvbnRpbnVlO1xuICAgIGNvbnN0IHRhYlN0YXRlczogU3RvcmVkVGFiU3RhdGVbXSA9IHdpbi50YWJzLm1hcCgodGFiKSA9PiB7XG4gICAgICBsZXQgZ3JvdXBUaXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgbGV0IGdyb3VwQ29sb3I6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgIC8vIE5vdGU6IHRhYi5ncm91cElkIGlzIC0xIGlmIG5vdCBncm91cGVkLlxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgaWQ6IHRhYi5pZCxcbiAgICAgICAgdXJsOiB0YWIudXJsIHx8IFwiXCIsXG4gICAgICAgIHBpbm5lZDogQm9vbGVhbih0YWIucGlubmVkKSxcbiAgICAgICAgZ3JvdXBJZDogdGFiLmdyb3VwSWQsXG4gICAgICAgIGdyb3VwVGl0bGUsIC8vIFdpbGwgbmVlZCB0byBmZXRjaCBpZiBncm91cGVkXG4gICAgICAgIGdyb3VwQ29sb3IsXG4gICAgICB9O1xuICAgIH0pO1xuXG4gICAgLy8gUG9wdWxhdGUgZ3JvdXAgaW5mbyBpZiBuZWVkZWRcbiAgICAvLyBXZSBkbyB0aGlzIGluIGEgc2Vjb25kIHBhc3MgdG8gYmF0Y2ggb3IganVzdCBpbmRpdmlkdWFsbHkgaWYgbmVlZGVkLlxuICAgIC8vIEFjdHVhbGx5LCB3ZSBjYW4gZ2V0IGdyb3VwIGluZm8gZnJvbSBjaHJvbWUudGFiR3JvdXBzLlxuICAgIC8vIEhvd2V2ZXIsIHRoZSB0YWIgb2JqZWN0IGRvZXNuJ3QgaGF2ZSB0aGUgZ3JvdXAgdGl0bGUgZGlyZWN0bHkuXG5cbiAgICAvLyBPcHRpbWl6YXRpb246IEdldCBhbGwgZ3JvdXBzIGZpcnN0LlxuXG4gICAgd2luZG93U3RhdGVzLnB1c2goeyB0YWJzOiB0YWJTdGF0ZXMgfSk7XG4gIH1cblxuICAvLyBFbnJpY2ggd2l0aCBncm91cCBpbmZvXG4gIGNvbnN0IGFsbEdyb3VwcyA9IGF3YWl0IGNocm9tZS50YWJHcm91cHMucXVlcnkoe30pO1xuICBjb25zdCBncm91cE1hcCA9IG5ldyBNYXAoYWxsR3JvdXBzLm1hcChnID0+IFtnLmlkLCBnXSkpO1xuXG4gIGZvciAoY29uc3Qgd2luIG9mIHdpbmRvd1N0YXRlcykge1xuICAgIGZvciAoY29uc3QgdGFiIG9mIHdpbi50YWJzKSB7XG4gICAgICBpZiAodGFiLmdyb3VwSWQgJiYgdGFiLmdyb3VwSWQgIT09IGNocm9tZS50YWJHcm91cHMuVEFCX0dST1VQX0lEX05PTkUpIHtcbiAgICAgICAgY29uc3QgZyA9IGdyb3VwTWFwLmdldCh0YWIuZ3JvdXBJZCk7XG4gICAgICAgIGlmIChnKSB7XG4gICAgICAgICAgdGFiLmdyb3VwVGl0bGUgPSBnLnRpdGxlO1xuICAgICAgICAgIHRhYi5ncm91cENvbG9yID0gZy5jb2xvcjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxuICAgIHdpbmRvd3M6IHdpbmRvd1N0YXRlcyxcbiAgfTtcbn07XG5cbmV4cG9ydCBjb25zdCBwdXNoVW5kb1N0YXRlID0gYXN5bmMgKCkgPT4ge1xuICBjb25zdCBzdGF0ZSA9IGF3YWl0IGNhcHR1cmVDdXJyZW50U3RhdGUoKTtcbiAgY29uc3Qgc3RhY2sgPSAoYXdhaXQgZ2V0U3RvcmVkVmFsdWU8VW5kb1N0YXRlW10+KFVORE9fU1RBQ0tfS0VZKSkgfHwgW107XG4gIHN0YWNrLnB1c2goc3RhdGUpO1xuICBpZiAoc3RhY2subGVuZ3RoID4gTUFYX1VORE9fU1RBQ0spIHtcbiAgICBzdGFjay5zaGlmdCgpO1xuICB9XG4gIGF3YWl0IHNldFN0b3JlZFZhbHVlKFVORE9fU1RBQ0tfS0VZLCBzdGFjayk7XG4gIGxvZ0luZm8oXCJQdXNoZWQgdW5kbyBzdGF0ZVwiLCB7IHN0YWNrU2l6ZTogc3RhY2subGVuZ3RoIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IHNhdmVTdGF0ZSA9IGFzeW5jIChuYW1lOiBzdHJpbmcpID0+IHtcbiAgY29uc3QgdW5kb1N0YXRlID0gYXdhaXQgY2FwdHVyZUN1cnJlbnRTdGF0ZSgpO1xuICBjb25zdCBzYXZlZFN0YXRlOiBTYXZlZFN0YXRlID0ge1xuICAgIG5hbWUsXG4gICAgdGltZXN0YW1wOiB1bmRvU3RhdGUudGltZXN0YW1wLFxuICAgIHdpbmRvd3M6IHVuZG9TdGF0ZS53aW5kb3dzLFxuICB9O1xuICBjb25zdCBzYXZlZFN0YXRlcyA9IChhd2FpdCBnZXRTdG9yZWRWYWx1ZTxTYXZlZFN0YXRlW10+KFNBVkVEX1NUQVRFU19LRVkpKSB8fCBbXTtcbiAgc2F2ZWRTdGF0ZXMucHVzaChzYXZlZFN0YXRlKTtcbiAgYXdhaXQgc2V0U3RvcmVkVmFsdWUoU0FWRURfU1RBVEVTX0tFWSwgc2F2ZWRTdGF0ZXMpO1xuICBsb2dJbmZvKFwiU2F2ZWQgc3RhdGVcIiwgeyBuYW1lIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IGdldFNhdmVkU3RhdGVzID0gYXN5bmMgKCk6IFByb21pc2U8U2F2ZWRTdGF0ZVtdPiA9PiB7XG4gIHJldHVybiAoYXdhaXQgZ2V0U3RvcmVkVmFsdWU8U2F2ZWRTdGF0ZVtdPihTQVZFRF9TVEFURVNfS0VZKSkgfHwgW107XG59O1xuXG5leHBvcnQgY29uc3QgZGVsZXRlU2F2ZWRTdGF0ZSA9IGFzeW5jIChuYW1lOiBzdHJpbmcpID0+IHtcbiAgbGV0IHNhdmVkU3RhdGVzID0gKGF3YWl0IGdldFN0b3JlZFZhbHVlPFNhdmVkU3RhdGVbXT4oU0FWRURfU1RBVEVTX0tFWSkpIHx8IFtdO1xuICBzYXZlZFN0YXRlcyA9IHNhdmVkU3RhdGVzLmZpbHRlcihzID0+IHMubmFtZSAhPT0gbmFtZSk7XG4gIGF3YWl0IHNldFN0b3JlZFZhbHVlKFNBVkVEX1NUQVRFU19LRVksIHNhdmVkU3RhdGVzKTtcbiAgbG9nSW5mbyhcIkRlbGV0ZWQgc2F2ZWQgc3RhdGVcIiwgeyBuYW1lIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IHVuZG8gPSBhc3luYyAoKSA9PiB7XG4gIGNvbnN0IHN0YWNrID0gKGF3YWl0IGdldFN0b3JlZFZhbHVlPFVuZG9TdGF0ZVtdPihVTkRPX1NUQUNLX0tFWSkpIHx8IFtdO1xuICBjb25zdCBzdGF0ZSA9IHN0YWNrLnBvcCgpO1xuICBpZiAoIXN0YXRlKSB7XG4gICAgbG9nSW5mbyhcIlVuZG8gc3RhY2sgZW1wdHlcIik7XG4gICAgcmV0dXJuO1xuICB9XG4gIGF3YWl0IHNldFN0b3JlZFZhbHVlKFVORE9fU1RBQ0tfS0VZLCBzdGFjayk7XG4gIGF3YWl0IHJlc3RvcmVTdGF0ZShzdGF0ZSk7XG4gIGxvZ0luZm8oXCJVbmRpZCBsYXN0IGFjdGlvblwiKTtcbn07XG5cbmV4cG9ydCBjb25zdCByZXN0b3JlU3RhdGUgPSBhc3luYyAoc3RhdGU6IFVuZG9TdGF0ZSB8IFNhdmVkU3RhdGUpID0+IHtcbiAgLy8gU3RyYXRlZ3k6XG4gIC8vIDEuIFVuZ3JvdXAgYWxsIHRhYnMgKG9wdGlvbmFsLCBidXQgY2xlYW5lcikuXG4gIC8vIDIuIE1vdmUgdGFicyB0byBjb3JyZWN0IHdpbmRvd3MgYW5kIGluZGljZXMuXG4gIC8vIDMuIFJlLWdyb3VwIHRhYnMuXG5cbiAgLy8gV2UgbmVlZCB0byBtYXRjaCBjdXJyZW50IHRhYnMgdG8gc3RvcmVkIHRhYnMuXG4gIC8vIFByaW9yaXR5OiBJRCBtYXRjaCAtPiBVUkwgbWF0Y2guXG5cbiAgY29uc3QgY3VycmVudFRhYnMgPSBhd2FpdCBjaHJvbWUudGFicy5xdWVyeSh7fSk7XG4gIGNvbnN0IGN1cnJlbnRUYWJNYXAgPSBuZXcgTWFwPG51bWJlciwgY2hyb21lLnRhYnMuVGFiPigpO1xuICBjb25zdCBjdXJyZW50VXJsTWFwID0gbmV3IE1hcDxzdHJpbmcsIGNocm9tZS50YWJzLlRhYltdPigpOyAvLyBVUkwgLT4gbGlzdCBvZiB0YWJzXG5cbiAgY3VycmVudFRhYnMuZm9yRWFjaCh0ID0+IHtcbiAgICBpZiAodC5pZCkgY3VycmVudFRhYk1hcC5zZXQodC5pZCwgdCk7XG4gICAgaWYgKHQudXJsKSB7XG4gICAgICBjb25zdCBsaXN0ID0gY3VycmVudFVybE1hcC5nZXQodC51cmwpIHx8IFtdO1xuICAgICAgbGlzdC5wdXNoKHQpO1xuICAgICAgY3VycmVudFVybE1hcC5zZXQodC51cmwsIGxpc3QpO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gSGVscGVyIHRvIGZpbmQgYSB0YWIgKGFzeW5jIHRvIGFsbG93IGNyZWF0aW9uKVxuICBjb25zdCBmaW5kT3JDcmVhdGVUYWIgPSBhc3luYyAoc3RvcmVkOiBTdG9yZWRUYWJTdGF0ZSk6IFByb21pc2U8Y2hyb21lLnRhYnMuVGFiIHwgdW5kZWZpbmVkPiA9PiB7XG4gICAgLy8gVHJ5IElEXG4gICAgaWYgKHN0b3JlZC5pZCAmJiBjdXJyZW50VGFiTWFwLmhhcyhzdG9yZWQuaWQpKSB7XG4gICAgICBjb25zdCB0ID0gY3VycmVudFRhYk1hcC5nZXQoc3RvcmVkLmlkKTtcbiAgICAgIGN1cnJlbnRUYWJNYXAuZGVsZXRlKHN0b3JlZC5pZCEpOyAvLyBDb25zdW1lXG4gICAgICAvLyBBbHNvIHJlbW92ZSBmcm9tIHVybCBtYXAgdG8gYXZvaWQgZG91YmxlIHVzYWdlXG4gICAgICBpZiAodD8udXJsKSB7XG4gICAgICAgICBjb25zdCBsaXN0ID0gY3VycmVudFVybE1hcC5nZXQodC51cmwpO1xuICAgICAgICAgaWYgKGxpc3QpIHtcbiAgICAgICAgICAgIGNvbnN0IGlkeCA9IGxpc3QuZmluZEluZGV4KHggPT4geC5pZCA9PT0gdC5pZCk7XG4gICAgICAgICAgICBpZiAoaWR4ICE9PSAtMSkgbGlzdC5zcGxpY2UoaWR4LCAxKTtcbiAgICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiB0O1xuICAgIH1cbiAgICAvLyBUcnkgVVJMXG4gICAgY29uc3QgbGlzdCA9IGN1cnJlbnRVcmxNYXAuZ2V0KHN0b3JlZC51cmwpO1xuICAgIGlmIChsaXN0ICYmIGxpc3QubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgdCA9IGxpc3Quc2hpZnQoKTtcbiAgICAgIGlmICh0Py5pZCkgY3VycmVudFRhYk1hcC5kZWxldGUodC5pZCk7IC8vIENvbnN1bWVcbiAgICAgIHJldHVybiB0O1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSBpZiBtaXNzaW5nXG4gICAgaWYgKHN0b3JlZC51cmwpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHQgPSBhd2FpdCBjaHJvbWUudGFicy5jcmVhdGUoeyB1cmw6IHN0b3JlZC51cmwsIGFjdGl2ZTogZmFsc2UgfSk7XG4gICAgICAgICAgICByZXR1cm4gdDtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgbG9nRXJyb3IoXCJGYWlsZWQgdG8gY3JlYXRlIHRhYlwiLCB7IHVybDogc3RvcmVkLnVybCwgZXJyb3I6IGUgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9O1xuXG4gIC8vIFdlIG5lZWQgdG8gcmVjb25zdHJ1Y3Qgd2luZG93cy5cbiAgLy8gSWRlYWxseSwgd2UgbWFwIHN0YXRlIHdpbmRvd3MgdG8gY3VycmVudCB3aW5kb3dzLlxuICAvLyBCdXQgc3RyaWN0bHksIHdlIGNhbiBqdXN0IG1vdmUgdGFicy5cblxuICAvLyBGb3Igc2ltcGxpY2l0eSwgbGV0J3MgYXNzdW1lIHdlIHVzZSBleGlzdGluZyB3aW5kb3dzIGFzIG11Y2ggYXMgcG9zc2libGUuXG4gIC8vIE9yIGNyZWF0ZSBuZXcgb25lcyBpZiB3ZSBydW4gb3V0P1xuICAvLyBMZXQncyBpdGVyYXRlIHN0b3JlZCB3aW5kb3dzLlxuXG4gIGNvbnN0IGN1cnJlbnRXaW5kb3dzID0gYXdhaXQgY2hyb21lLndpbmRvd3MuZ2V0QWxsKCk7XG5cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdGF0ZS53aW5kb3dzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3Qgd2luU3RhdGUgPSBzdGF0ZS53aW5kb3dzW2ldO1xuXG4gICAgLy8gSWRlbnRpZnkgYWxsIHRhYnMgZm9yIHRoaXMgd2luZG93IGZpcnN0LlxuICAgIC8vIFdlIGRvIHRoaXMgQkVGT1JFIGNyZWF0aW5nIGEgd2luZG93IHRvIGF2b2lkIGNyZWF0aW5nIGVtcHR5IHdpbmRvd3MuXG4gICAgY29uc3QgdGFic1RvTW92ZTogeyB0YWJJZDogbnVtYmVyLCBzdG9yZWQ6IFN0b3JlZFRhYlN0YXRlIH1bXSA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBzdG9yZWRUYWIgb2Ygd2luU3RhdGUudGFicykge1xuICAgICAgY29uc3QgZm91bmQgPSBhd2FpdCBmaW5kT3JDcmVhdGVUYWIoc3RvcmVkVGFiKTtcbiAgICAgIGlmIChmb3VuZCAmJiBmb3VuZC5pZCkge1xuICAgICAgICB0YWJzVG9Nb3ZlLnB1c2goeyB0YWJJZDogZm91bmQuaWQsIHN0b3JlZDogc3RvcmVkVGFiIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICh0YWJzVG9Nb3ZlLmxlbmd0aCA9PT0gMCkgY29udGludWU7XG5cbiAgICBsZXQgdGFyZ2V0V2luZG93SWQ6IG51bWJlcjtcblxuICAgIGlmIChpIDwgY3VycmVudFdpbmRvd3MubGVuZ3RoKSB7XG4gICAgICB0YXJnZXRXaW5kb3dJZCA9IGN1cnJlbnRXaW5kb3dzW2ldLmlkITtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gQ3JlYXRlIG5ldyB3aW5kb3dcbiAgICAgIGNvbnN0IHdpbiA9IGF3YWl0IGNocm9tZS53aW5kb3dzLmNyZWF0ZSh7fSk7XG4gICAgICB0YXJnZXRXaW5kb3dJZCA9IHdpbi5pZCE7XG4gICAgICAvLyBOb3RlOiBOZXcgd2luZG93IGNyZWF0aW9uIGFkZHMgYSB0YWIuIFdlIG1pZ2h0IHdhbnQgdG8gcmVtb3ZlIGl0IGxhdGVyIG9yIGlnbm9yZSBpdC5cbiAgICB9XG5cbiAgICBjb25zdCB0YWJJZHMgPSB0YWJzVG9Nb3ZlLm1hcCh0ID0+IHQudGFiSWQpO1xuXG4gICAgLy8gTW92ZSBhbGwgdG8gd2luZG93LlxuICAgIC8vIE5vdGU6IElmIHdlIG1vdmUgdG8gaW5kZXggMCwgdGhleSB3aWxsIGJlIHByZXBlbmRlZC5cbiAgICAvLyBXZSBzaG91bGQgcHJvYmFibHkganVzdCBtb3ZlIHRoZW0gdG8gdGhlIHdpbmRvdyBmaXJzdC5cbiAgICAvLyBJZiB3ZSBtb3ZlIHRoZW0gaW5kaXZpZHVhbGx5IHRvIGNvcnJlY3QgaW5kZXgsIGl0J3Mgc2FmZXIuXG5cbiAgICBmb3IgKGxldCBqID0gMDsgaiA8IHRhYnNUb01vdmUubGVuZ3RoOyBqKyspIHtcbiAgICAgIGNvbnN0IHsgdGFiSWQsIHN0b3JlZCB9ID0gdGFic1RvTW92ZVtqXTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGNocm9tZS50YWJzLm1vdmUodGFiSWQsIHsgd2luZG93SWQ6IHRhcmdldFdpbmRvd0lkLCBpbmRleDogaiB9KTtcbiAgICAgICAgaWYgKHN0b3JlZC5waW5uZWQpIHtcbiAgICAgICAgICAgICBhd2FpdCBjaHJvbWUudGFicy51cGRhdGUodGFiSWQsIHsgcGlubmVkOiB0cnVlIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgIC8vIElmIGN1cnJlbnRseSBwaW5uZWQgYnV0IHNob3VsZG4ndCBiZVxuICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnQgPSBhd2FpdCBjaHJvbWUudGFicy5nZXQodGFiSWQpO1xuICAgICAgICAgICAgIGlmIChjdXJyZW50LnBpbm5lZCkgYXdhaXQgY2hyb21lLnRhYnMudXBkYXRlKHRhYklkLCB7IHBpbm5lZDogZmFsc2UgfSk7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgbG9nRXJyb3IoXCJGYWlsZWQgdG8gbW92ZSB0YWJcIiwgeyB0YWJJZCwgZXJyb3I6IGUgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gSGFuZGxlIEdyb3Vwc1xuICAgIC8vIElkZW50aWZ5IGdyb3VwcyBpbiB0aGlzIHdpbmRvd1xuICAgIGNvbnN0IGdyb3VwcyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXJbXT4oKTsgLy8gdGl0bGUrY29sb3IgLT4gdGFiSWRzXG4gICAgY29uc3QgZ3JvdXBDb2xvcnMgPSBuZXcgTWFwPHN0cmluZywgY2hyb21lLnRhYkdyb3Vwcy5Db2xvckVudW0+KCk7XG5cbiAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgdGFic1RvTW92ZSkge1xuICAgICAgaWYgKGl0ZW0uc3RvcmVkLmdyb3VwVGl0bGUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAvLyBVc2UgdGl0bGUgYXMga2V5IChvciB1bmlxdWUgSUQgaWYgd2UgaGFkIG9uZSwgYnV0IHdlIGRvbid0IHBlcnNpc3QgZ3JvdXAgSURzKVxuICAgICAgICAvLyBHcm91cCBJRCBpbiBzdG9yYWdlIGlzIGVwaGVtZXJhbC4gVGl0bGUgaXMga2V5LlxuICAgICAgICBjb25zdCBrZXkgPSBpdGVtLnN0b3JlZC5ncm91cFRpdGxlO1xuICAgICAgICBjb25zdCBsaXN0ID0gZ3JvdXBzLmdldChrZXkpIHx8IFtdO1xuICAgICAgICBsaXN0LnB1c2goaXRlbS50YWJJZCk7XG4gICAgICAgIGdyb3Vwcy5zZXQoa2V5LCBsaXN0KTtcbiAgICAgICAgaWYgKGl0ZW0uc3RvcmVkLmdyb3VwQ29sb3IpIHtcbiAgICAgICAgICAgICBncm91cENvbG9ycy5zZXQoa2V5LCBpdGVtLnN0b3JlZC5ncm91cENvbG9yIGFzIGNocm9tZS50YWJHcm91cHMuQ29sb3JFbnVtKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgIC8vIFVuZ3JvdXAgaWYgbmVlZGVkXG4gICAgICAgICBhd2FpdCBjaHJvbWUudGFicy51bmdyb3VwKGl0ZW0udGFiSWQpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgW3RpdGxlLCBpZHNdIG9mIGdyb3Vwcy5lbnRyaWVzKCkpIHtcbiAgICAgIGlmIChpZHMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCBncm91cElkID0gYXdhaXQgY2hyb21lLnRhYnMuZ3JvdXAoeyB0YWJJZHM6IGlkcyB9KTtcbiAgICAgICAgYXdhaXQgY2hyb21lLnRhYkdyb3Vwcy51cGRhdGUoZ3JvdXBJZCwge1xuICAgICAgICAgICAgIHRpdGxlOiB0aXRsZSxcbiAgICAgICAgICAgICBjb2xvcjogZ3JvdXBDb2xvcnMuZ2V0KHRpdGxlKSB8fCBcImdyZXlcIlxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG4iLCAiaW1wb3J0IHsgYXBwbHlUYWJHcm91cHMsIGFwcGx5VGFiU29ydGluZywgY2FsY3VsYXRlVGFiR3JvdXBzLCBmZXRjaEN1cnJlbnRUYWJHcm91cHMsIG1lcmdlVGFicywgc3BsaXRUYWJzIH0gZnJvbSBcIi4vdGFiTWFuYWdlci5qc1wiO1xuaW1wb3J0IHsgbG9hZFByZWZlcmVuY2VzLCBzYXZlUHJlZmVyZW5jZXMgfSBmcm9tIFwiLi9wcmVmZXJlbmNlcy5qc1wiO1xuaW1wb3J0IHsgc2V0Q3VzdG9tU3RyYXRlZ2llcyB9IGZyb20gXCIuL2dyb3VwaW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcsIGxvZ0luZm8sIGdldExvZ3MsIGNsZWFyTG9ncywgc2V0TG9nZ2VyUHJlZmVyZW5jZXMsIGluaXRMb2dnZXIsIGFkZExvZ0VudHJ5LCBsb2dnZXJSZWFkeSB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBwdXNoVW5kb1N0YXRlLCBzYXZlU3RhdGUsIHVuZG8sIGdldFNhdmVkU3RhdGVzLCBkZWxldGVTYXZlZFN0YXRlLCByZXN0b3JlU3RhdGUgfSBmcm9tIFwiLi9zdGF0ZU1hbmFnZXIuanNcIjtcbmltcG9ydCB7XG4gIEFwcGx5R3JvdXBpbmdQYXlsb2FkLFxuICBHcm91cGluZ1NlbGVjdGlvbixcbiAgR3JvdXBpbmdTdHJhdGVneSxcbiAgUHJlZmVyZW5jZXMsXG4gIFJ1bnRpbWVNZXNzYWdlLFxuICBSdW50aW1lUmVzcG9uc2UsXG4gIFNvcnRpbmdTdHJhdGVneSxcbiAgVGFiR3JvdXBcbn0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuXG5jaHJvbWUucnVudGltZS5vbkluc3RhbGxlZC5hZGRMaXN0ZW5lcihhc3luYyAoKSA9PiB7XG4gIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gIHNldEN1c3RvbVN0cmF0ZWdpZXMocHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXSk7XG4gIGxvZ0luZm8oXCJFeHRlbnNpb24gaW5zdGFsbGVkXCIsIHtcbiAgICB2ZXJzaW9uOiBjaHJvbWUucnVudGltZS5nZXRNYW5pZmVzdCgpLnZlcnNpb24sXG4gICAgbG9nTGV2ZWw6IHByZWZzLmxvZ0xldmVsLFxuICAgIHN0cmF0ZWdpZXNDb3VudDogcHJlZnMuY3VzdG9tU3RyYXRlZ2llcz8ubGVuZ3RoIHx8IDBcbiAgfSk7XG59KTtcblxuLy8gSW5pdGlhbGl6ZSBsb2dnZXIgb24gc3RhcnR1cFxubG9hZFByZWZlcmVuY2VzKCkudGhlbihhc3luYyAocHJlZnMpID0+IHtcbiAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuICAgIGF3YWl0IGluaXRMb2dnZXIoKTtcbiAgICBsb2dJbmZvKFwiU2VydmljZSBXb3JrZXIgSW5pdGlhbGl6ZWRcIiwge1xuICAgICAgICB2ZXJzaW9uOiBjaHJvbWUucnVudGltZS5nZXRNYW5pZmVzdCgpLnZlcnNpb24sXG4gICAgICAgIGxvZ0xldmVsOiBwcmVmcy5sb2dMZXZlbFxuICAgIH0pO1xufSk7XG5cbmNvbnN0IGhhbmRsZU1lc3NhZ2UgPSBhc3luYyA8VERhdGE+KFxuICBtZXNzYWdlOiBSdW50aW1lTWVzc2FnZSxcbiAgc2VuZGVyOiBjaHJvbWUucnVudGltZS5NZXNzYWdlU2VuZGVyXG4pOiBQcm9taXNlPFJ1bnRpbWVSZXNwb25zZTxURGF0YT4+ID0+IHtcbiAgbG9nRGVidWcoXCJSZWNlaXZlZCBtZXNzYWdlXCIsIHsgdHlwZTogbWVzc2FnZS50eXBlLCBmcm9tOiBzZW5kZXIuaWQgfSk7XG4gIHN3aXRjaCAobWVzc2FnZS50eXBlKSB7XG4gICAgY2FzZSBcImdldFN0YXRlXCI6IHtcbiAgICAgIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuICAgICAgLy8gVXNlIGZldGNoQ3VycmVudFRhYkdyb3VwcyB0byByZXR1cm4gdGhlIGFjdHVhbCBzdGF0ZSBvZiB0aGUgYnJvd3NlciB0YWJzXG4gICAgICBjb25zdCBncm91cHMgPSBhd2FpdCBmZXRjaEN1cnJlbnRUYWJHcm91cHMocHJlZnMpO1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGRhdGE6IHsgZ3JvdXBzLCBwcmVmZXJlbmNlczogcHJlZnMgfSBhcyBURGF0YSB9O1xuICAgIH1cbiAgICBjYXNlIFwiYXBwbHlHcm91cGluZ1wiOiB7XG4gICAgICBsb2dJbmZvKFwiQXBwbHlpbmcgZ3JvdXBpbmcgZnJvbSBtZXNzYWdlXCIsIHsgc29ydGluZzogKG1lc3NhZ2UucGF5bG9hZCBhcyBhbnkpPy5zb3J0aW5nIH0pO1xuICAgICAgYXdhaXQgcHVzaFVuZG9TdGF0ZSgpO1xuICAgICAgY29uc3QgcHJlZnMgPSBhd2FpdCBsb2FkUHJlZmVyZW5jZXMoKTtcbiAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMocHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXSk7XG4gICAgICBjb25zdCBwYXlsb2FkID0gKG1lc3NhZ2UucGF5bG9hZCBhcyBBcHBseUdyb3VwaW5nUGF5bG9hZCB8IHVuZGVmaW5lZCkgPz8ge307XG4gICAgICBjb25zdCBzZWxlY3Rpb24gPSBwYXlsb2FkLnNlbGVjdGlvbiA/PyB7fTtcbiAgICAgIGNvbnN0IHNvcnRpbmcgPSBwYXlsb2FkLnNvcnRpbmc/Lmxlbmd0aCA/IHBheWxvYWQuc29ydGluZyA6IHVuZGVmaW5lZDtcblxuICAgICAgY29uc3QgcHJlZmVyZW5jZXMgPSBzb3J0aW5nID8geyAuLi5wcmVmcywgc29ydGluZyB9IDogcHJlZnM7XG5cbiAgICAgIGNvbnN0IG9uUHJvZ3Jlc3MgPSAoY29tcGxldGVkOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+IHtcbiAgICAgICAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICAgIHR5cGU6IFwiZ3JvdXBpbmdQcm9ncmVzc1wiLFxuICAgICAgICAgICAgICBwYXlsb2FkOiB7IGNvbXBsZXRlZCwgdG90YWwgfVxuICAgICAgICAgIH0pLmNhdGNoKCgpID0+IHt9KTtcbiAgICAgIH07XG5cbiAgICAgIC8vIFVzZSBjYWxjdWxhdGVUYWJHcm91cHMgdG8gZGV0ZXJtaW5lIHRoZSB0YXJnZXQgZ3JvdXBpbmdcbiAgICAgIGNvbnN0IGdyb3VwcyA9IGF3YWl0IGNhbGN1bGF0ZVRhYkdyb3VwcyhwcmVmZXJlbmNlcywgc2VsZWN0aW9uLCBvblByb2dyZXNzKTtcbiAgICAgIGF3YWl0IGFwcGx5VGFiR3JvdXBzKGdyb3Vwcyk7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSwgZGF0YTogeyBncm91cHMgfSBhcyBURGF0YSB9O1xuICAgIH1cbiAgICBjYXNlIFwiYXBwbHlTb3J0aW5nXCI6IHtcbiAgICAgIGxvZ0luZm8oXCJBcHBseWluZyBzb3J0aW5nIGZyb20gbWVzc2FnZVwiKTtcbiAgICAgIGF3YWl0IHB1c2hVbmRvU3RhdGUoKTtcbiAgICAgIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuICAgICAgY29uc3QgcGF5bG9hZCA9IChtZXNzYWdlLnBheWxvYWQgYXMgQXBwbHlHcm91cGluZ1BheWxvYWQgfCB1bmRlZmluZWQpID8/IHt9O1xuICAgICAgY29uc3Qgc2VsZWN0aW9uID0gcGF5bG9hZC5zZWxlY3Rpb24gPz8ge307XG4gICAgICBjb25zdCBzb3J0aW5nID0gcGF5bG9hZC5zb3J0aW5nPy5sZW5ndGggPyBwYXlsb2FkLnNvcnRpbmcgOiB1bmRlZmluZWQ7XG4gICAgICBjb25zdCBwcmVmZXJlbmNlcyA9IHNvcnRpbmcgPyB7IC4uLnByZWZzLCBzb3J0aW5nIH0gOiBwcmVmcztcblxuICAgICAgY29uc3Qgb25Qcm9ncmVzcyA9IChjb21wbGV0ZWQ6IG51bWJlciwgdG90YWw6IG51bWJlcikgPT4ge1xuICAgICAgICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgICAgdHlwZTogXCJncm91cGluZ1Byb2dyZXNzXCIsXG4gICAgICAgICAgICAgIHBheWxvYWQ6IHsgY29tcGxldGVkLCB0b3RhbCB9XG4gICAgICAgICAgfSkuY2F0Y2goKCkgPT4ge30pO1xuICAgICAgfTtcblxuICAgICAgYXdhaXQgYXBwbHlUYWJTb3J0aW5nKHByZWZlcmVuY2VzLCBzZWxlY3Rpb24sIG9uUHJvZ3Jlc3MpO1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICB9XG4gICAgY2FzZSBcIm1lcmdlU2VsZWN0aW9uXCI6IHtcbiAgICAgIGxvZ0luZm8oXCJNZXJnaW5nIHNlbGVjdGlvbiBmcm9tIG1lc3NhZ2VcIik7XG4gICAgICBhd2FpdCBwdXNoVW5kb1N0YXRlKCk7XG4gICAgICBjb25zdCBwYXlsb2FkID0gbWVzc2FnZS5wYXlsb2FkIGFzIHsgdGFiSWRzOiBudW1iZXJbXSB9O1xuICAgICAgaWYgKHBheWxvYWQ/LnRhYklkcz8ubGVuZ3RoKSB7XG4gICAgICAgIGF3YWl0IG1lcmdlVGFicyhwYXlsb2FkLnRhYklkcyk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICB9XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIk5vIHRhYnMgc2VsZWN0ZWRcIiB9O1xuICAgIH1cbiAgICBjYXNlIFwic3BsaXRTZWxlY3Rpb25cIjoge1xuICAgICAgbG9nSW5mbyhcIlNwbGl0dGluZyBzZWxlY3Rpb24gZnJvbSBtZXNzYWdlXCIpO1xuICAgICAgYXdhaXQgcHVzaFVuZG9TdGF0ZSgpO1xuICAgICAgY29uc3QgcGF5bG9hZCA9IG1lc3NhZ2UucGF5bG9hZCBhcyB7IHRhYklkczogbnVtYmVyW10gfTtcbiAgICAgIGlmIChwYXlsb2FkPy50YWJJZHM/Lmxlbmd0aCkge1xuICAgICAgICBhd2FpdCBzcGxpdFRhYnMocGF5bG9hZC50YWJJZHMpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJObyB0YWJzIHNlbGVjdGVkXCIgfTtcbiAgICB9XG4gICAgY2FzZSBcInVuZG9cIjoge1xuICAgICAgbG9nSW5mbyhcIlVuZG9pbmcgbGFzdCBhY3Rpb25cIik7XG4gICAgICBhd2FpdCB1bmRvKCk7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgIH1cbiAgICBjYXNlIFwic2F2ZVN0YXRlXCI6IHtcbiAgICAgIGNvbnN0IG5hbWUgPSAobWVzc2FnZS5wYXlsb2FkIGFzIGFueSk/Lm5hbWU7XG4gICAgICBpZiAodHlwZW9mIG5hbWUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgbG9nSW5mbyhcIlNhdmluZyBzdGF0ZSBmcm9tIG1lc3NhZ2VcIiwgeyBuYW1lIH0pO1xuICAgICAgICBhd2FpdCBzYXZlU3RhdGUobmFtZSk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICB9XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgbmFtZVwiIH07XG4gICAgfVxuICAgIGNhc2UgXCJnZXRTYXZlZFN0YXRlc1wiOiB7XG4gICAgICBjb25zdCBzdGF0ZXMgPSBhd2FpdCBnZXRTYXZlZFN0YXRlcygpO1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGRhdGE6IHN0YXRlcyBhcyBURGF0YSB9O1xuICAgIH1cbiAgICBjYXNlIFwicmVzdG9yZVN0YXRlXCI6IHtcbiAgICAgIGNvbnN0IHN0YXRlID0gKG1lc3NhZ2UucGF5bG9hZCBhcyBhbnkpPy5zdGF0ZTtcbiAgICAgIGlmIChzdGF0ZSkge1xuICAgICAgICBsb2dJbmZvKFwiUmVzdG9yaW5nIHN0YXRlIGZyb20gbWVzc2FnZVwiLCB7IG5hbWU6IHN0YXRlLm5hbWUgfSk7XG4gICAgICAgIGF3YWl0IHJlc3RvcmVTdGF0ZShzdGF0ZSk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICB9XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgc3RhdGVcIiB9O1xuICAgIH1cbiAgICBjYXNlIFwiZGVsZXRlU2F2ZWRTdGF0ZVwiOiB7XG4gICAgICBjb25zdCBuYW1lID0gKG1lc3NhZ2UucGF5bG9hZCBhcyBhbnkpPy5uYW1lO1xuICAgICAgaWYgKHR5cGVvZiBuYW1lID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIGxvZ0luZm8oXCJEZWxldGluZyBzYXZlZCBzdGF0ZSBmcm9tIG1lc3NhZ2VcIiwgeyBuYW1lIH0pO1xuICAgICAgICBhd2FpdCBkZWxldGVTYXZlZFN0YXRlKG5hbWUpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIG5hbWVcIiB9O1xuICAgIH1cbiAgICBjYXNlIFwibG9hZFByZWZlcmVuY2VzXCI6IHtcbiAgICAgIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGRhdGE6IHByZWZzIGFzIFREYXRhIH07XG4gICAgfVxuICAgIGNhc2UgXCJzYXZlUHJlZmVyZW5jZXNcIjoge1xuICAgICAgbG9nSW5mbyhcIlNhdmluZyBwcmVmZXJlbmNlcyBmcm9tIG1lc3NhZ2VcIik7XG4gICAgICBjb25zdCBwcmVmcyA9IGF3YWl0IHNhdmVQcmVmZXJlbmNlcyhtZXNzYWdlLnBheWxvYWQgYXMgYW55KTtcbiAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMocHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXSk7XG4gICAgICBzZXRMb2dnZXJQcmVmZXJlbmNlcyhwcmVmcyk7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSwgZGF0YTogcHJlZnMgYXMgVERhdGEgfTtcbiAgICB9XG4gICAgY2FzZSBcImdldExvZ3NcIjoge1xuICAgICAgICBhd2FpdCBsb2dnZXJSZWFkeTtcbiAgICAgICAgY29uc3QgbG9ncyA9IGdldExvZ3MoKTtcbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGRhdGE6IGxvZ3MgYXMgVERhdGEgfTtcbiAgICB9XG4gICAgY2FzZSBcImNsZWFyTG9nc1wiOiB7XG4gICAgICAgIGNsZWFyTG9ncygpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgIH1cbiAgICBjYXNlIFwibG9nRW50cnlcIjoge1xuICAgICAgICBjb25zdCBlbnRyeSA9IG1lc3NhZ2UucGF5bG9hZCBhcyBhbnk7XG4gICAgICAgIGlmIChlbnRyeSAmJiBlbnRyeS5sZXZlbCAmJiBlbnRyeS5tZXNzYWdlKSB7XG4gICAgICAgICAgICBhZGRMb2dFbnRyeShlbnRyeSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICB9XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiVW5rbm93biBtZXNzYWdlXCIgfTtcbiAgfVxufTtcblxuY2hyb21lLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKFxuICAoXG4gICAgbWVzc2FnZTogUnVudGltZU1lc3NhZ2UsXG4gICAgc2VuZGVyOiBjaHJvbWUucnVudGltZS5NZXNzYWdlU2VuZGVyLFxuICAgIHNlbmRSZXNwb25zZTogKHJlc3BvbnNlOiBSdW50aW1lUmVzcG9uc2UpID0+IHZvaWRcbiAgKSA9PiB7XG4gICAgaGFuZGxlTWVzc2FnZShtZXNzYWdlLCBzZW5kZXIpXG4gICAgLnRoZW4oKHJlc3BvbnNlKSA9PiBzZW5kUmVzcG9uc2UocmVzcG9uc2UpKVxuICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiBmYWxzZSwgZXJyb3I6IFN0cmluZyhlcnJvcikgfSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbik7XG5cbmNocm9tZS50YWJHcm91cHMub25SZW1vdmVkLmFkZExpc3RlbmVyKGFzeW5jIChncm91cCkgPT4ge1xuICBsb2dJbmZvKFwiVGFiIGdyb3VwIHJlbW92ZWRcIiwgeyBncm91cCB9KTtcbn0pO1xuXG5sZXQgYXV0b1J1blRpbWVvdXQ6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgbnVsbCA9IG51bGw7XG5cbmNvbnN0IHRyaWdnZXJBdXRvUnVuID0gKCkgPT4ge1xuICBpZiAoYXV0b1J1blRpbWVvdXQpIGNsZWFyVGltZW91dChhdXRvUnVuVGltZW91dCk7XG4gIGF1dG9SdW5UaW1lb3V0ID0gc2V0VGltZW91dChhc3luYyAoKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuXG4gICAgICBjb25zdCBhdXRvUnVuU3RyYXRzID0gcHJlZnMuY3VzdG9tU3RyYXRlZ2llcz8uZmlsdGVyKHMgPT4gcy5hdXRvUnVuKTtcbiAgICAgIGlmIChhdXRvUnVuU3RyYXRzICYmIGF1dG9SdW5TdHJhdHMubGVuZ3RoID4gMCkge1xuICAgICAgICBsb2dJbmZvKFwiQXV0by1ydW5uaW5nIHN0cmF0ZWdpZXNcIiwge1xuICAgICAgICAgIHN0cmF0ZWdpZXM6IGF1dG9SdW5TdHJhdHMubWFwKHMgPT4gcy5pZCksXG4gICAgICAgICAgY291bnQ6IGF1dG9SdW5TdHJhdHMubGVuZ3RoXG4gICAgICAgIH0pO1xuICAgICAgICBjb25zdCBpZHMgPSBhdXRvUnVuU3RyYXRzLm1hcChzID0+IHMuaWQpO1xuXG4gICAgICAgIC8vIFdlIGFwcGx5IGdyb3VwaW5nIHVzaW5nIHRoZXNlIHN0cmF0ZWdpZXNcbiAgICAgICAgY29uc3QgZ3JvdXBzID0gYXdhaXQgY2FsY3VsYXRlVGFiR3JvdXBzKHsgLi4ucHJlZnMsIHNvcnRpbmc6IGlkcyB9KTtcbiAgICAgICAgYXdhaXQgYXBwbHlUYWJHcm91cHMoZ3JvdXBzKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiQXV0by1ydW4gZmFpbGVkXCIsIGUpO1xuICAgIH1cbiAgfSwgMTAwMCk7XG59O1xuXG5jaHJvbWUudGFicy5vbkNyZWF0ZWQuYWRkTGlzdGVuZXIoKCkgPT4gdHJpZ2dlckF1dG9SdW4oKSk7XG5jaHJvbWUudGFicy5vblVwZGF0ZWQuYWRkTGlzdGVuZXIoKHRhYklkLCBjaGFuZ2VJbmZvKSA9PiB7XG4gIGlmIChjaGFuZ2VJbmZvLnVybCB8fCBjaGFuZ2VJbmZvLnN0YXR1cyA9PT0gJ2NvbXBsZXRlJykge1xuICAgIHRyaWdnZXJBdXRvUnVuKCk7XG4gIH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQWFPLElBQU0sYUFBbUM7QUFBQSxFQUM1QyxFQUFFLElBQUksVUFBVSxPQUFPLFVBQVUsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUM1RixFQUFFLElBQUksZUFBZSxPQUFPLGVBQWUsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUN0RyxFQUFFLElBQUksU0FBUyxPQUFPLFNBQVMsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUMxRixFQUFFLElBQUksV0FBVyxPQUFPLFdBQVcsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUM5RixFQUFFLElBQUksV0FBVyxPQUFPLFdBQVcsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUM5RixFQUFFLElBQUksVUFBVSxPQUFPLFVBQVUsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUM1RixFQUFFLElBQUksV0FBVyxPQUFPLFdBQVcsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMs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TSxNQUFNLElBQUksSUFBSSxZQUFZO0FBQ2hDLE1BQUksVUFBVTtBQUVkLE1BQUksSUFBSSxTQUFTLFFBQVEsS0FBSyxJQUFJLFNBQVMsZUFBZSxLQUFLLElBQUksU0FBUyxXQUFXLEtBQUssSUFBSSxTQUFTLE1BQU0sS0FBSyxJQUFJLFNBQVMsUUFBUSxFQUFHLFdBQVU7QUFBQSxXQUM3SSxJQUFJLFNBQVMsUUFBUSxNQUFNLElBQUksU0FBUyxNQUFNLEtBQUssSUFBSSxTQUFTLFFBQVEsS0FBSyxJQUFJLFNBQVMsUUFBUSxHQUFJLFdBQVU7QUFBQSxXQUNoSCxJQUFJLFNBQVMsVUFBVSxLQUFLLElBQUksU0FBUyxPQUFPLEtBQUssSUFBSSxTQUFTLE1BQU0sS0FBSyxJQUFJLFNBQVMsT0FBTyxFQUFHLFdBQVU7QUFBQSxXQUM5RyxJQUFJLFNBQVMsU0FBUyxLQUFLLElBQUksU0FBUyxTQUFTLEtBQUssSUFBSSxTQUFTLE1BQU0sS0FBSyxJQUFJLFNBQVMsUUFBUSxLQUFLLElBQUksU0FBUyxTQUFTLEVBQUcsV0FBVTtBQUFBLFdBQzNJLElBQUksU0FBUyxTQUFTLEtBQUssSUFBSSxTQUFTLFVBQVUsS0FBSyxJQUFJLFNBQVMsV0FBVyxLQUFLLElBQUksU0FBUyxRQUFRLEtBQUssSUFBSSxTQUFTLFFBQVEsS0FBSyxJQUFJLFNBQVMsV0FBVyxFQUFHLFdBQVU7QUFBQSxXQUM3SyxJQUFJLFNBQVMsUUFBUSxLQUFLLElBQUksU0FBUyxNQUFNLEtBQUssSUFBSSxTQUFTLFNBQVMsS0FBSyxJQUFJLFNBQVMsUUFBUSxLQUFLLElBQUksU0FBUyxTQUFTLEVBQUcsV0FBVTtBQUFBLFdBQzFJLElBQUksU0FBUyxLQUFLLEtBQUssSUFBSSxTQUFTLEtBQUssS0FBSyxJQUFJLFNBQVMsU0FBUyxLQUFLLElBQUksU0FBUyxnQkFBZ0IsS0FBSyxJQUFJLFNBQVMsU0FBUyxFQUFHLFdBQVU7QUFBQSxXQUM5SSxJQUFJLFNBQVMsVUFBVSxLQUFLLElBQUksU0FBUyxPQUFPLEtBQUssSUFBSSxTQUFTLEtBQUssS0FB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QkFBa0IsT0FBTyxPQUFLLEVBQUUsT0FBTztBQUNuRSxVQUFJLGlCQUFpQixjQUFjLFNBQVMsR0FBRztBQUM3QyxnQkFBUSwyQkFBMkI7QUFBQSxVQUNqQyxZQUFZLGNBQWMsSUFBSSxPQUFLLEVBQUUsRUFBRTtBQUFBLFVBQ3ZDLE9BQU8sY0FBYztBQUFBLFFBQ3ZCLENBQUM7QUFDRCxjQUFNLE1BQU0sY0FBYyxJQUFJLE9BQUssRUFBRSxFQUFFO0FBR3ZDLGNBQU0sU0FBUyxNQUFNLG1CQUFtQixFQUFFLEdBQUcsT0FBTyxTQUFTLElBQUksQ0FBQztBQUNsRSxjQUFNLGVBQWUsTUFBTTtBQUFBLE1BQzdCO0FBQUEsSUFDRixTQUFTLEdBQUc7QUFDVixjQUFRLE1BQU0sbUJBQW1CLENBQUM7QUFBQSxJQUNwQztBQUFBLEVBQ0YsR0FBRyxHQUFJO0FBQ1Q7QUFFQSxPQUFPLEtBQUssVUFBVSxZQUFZLE1BQU0sZUFBZSxDQUFDO0FBQ3hELE9BQU8sS0FBSyxVQUFVLFlBQVksQ0FBQyxPQUFPLGVBQWU7QUFDdkQsTUFBSSxXQUFXLE9BQU8sV0FBVyxXQUFXLFlBQVk7QUFDdEQsbUJBQWU7QUFBQSxFQUNqQjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbImN1c3RvbVN0cmF0ZWdpZXMiLCAibWF0Y2giLCAicGFydHMiLCAiZ3JvdXBUYWJzIiwgInRhYnMiLCAibGlzdCIsICJsb2dzIl0KfQo=
