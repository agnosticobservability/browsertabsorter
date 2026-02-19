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
var analyzeTabContext = async (tabs, onProgress) => {
  const contextMap = /* @__PURE__ */ new Map();
  let completed = 0;
  const total = tabs.length;
  const promises = tabs.map(async (tab) => {
    try {
      const cacheKey = `${tab.id}::${tab.url}`;
      if (contextCache.has(cacheKey)) {
        contextMap.set(tab.id, contextCache.get(cacheKey));
        return;
      }
      const result = await fetchContextForTab(tab);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3NoYXJlZC9zdHJhdGVneVJlZ2lzdHJ5LnRzIiwgIi4uLy4uL3NyYy9zaGFyZWQvbG9nZ2VyLnRzIiwgIi4uLy4uL3NyYy9zaGFyZWQvdXRpbHMudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZ3JvdXBpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3NvcnRpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL2V4dHJhY3Rpb24vbG9naWMudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZXh0cmFjdGlvbi9nZW5lcmFSZWdpc3RyeS50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9zdG9yYWdlLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3ByZWZlcmVuY2VzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL2V4dHJhY3Rpb24vaW5kZXgudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvY29udGV4dEFuYWx5c2lzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3RhYk1hbmFnZXIudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvc3RhdGVNYW5hZ2VyLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3NlcnZpY2VXb3JrZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IEN1c3RvbVN0cmF0ZWd5LCBTb3J0aW5nU3RyYXRlZ3kgfSBmcm9tIFwiLi90eXBlcy5qc1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0cmF0ZWd5RGVmaW5pdGlvbiB7XG4gICAgaWQ6IFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZztcbiAgICBsYWJlbDogc3RyaW5nO1xuICAgIGlzR3JvdXBpbmc6IGJvb2xlYW47XG4gICAgaXNTb3J0aW5nOiBib29sZWFuO1xuICAgIHRhZ3M/OiBzdHJpbmdbXTtcbiAgICBhdXRvUnVuPzogYm9vbGVhbjtcbiAgICBpc0N1c3RvbT86IGJvb2xlYW47XG59XG5cbi8vIFJlc3RvcmVkIHN0cmF0ZWdpZXMgbWF0Y2hpbmcgYmFja2dyb3VuZCBjYXBhYmlsaXRpZXMuXG5leHBvcnQgY29uc3QgU1RSQVRFR0lFUzogU3RyYXRlZ3lEZWZpbml0aW9uW10gPSBbXG4gICAgeyBpZDogXCJkb21haW5cIiwgbGFiZWw6IFwiRG9tYWluXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJkb21haW5fZnVsbFwiLCBsYWJlbDogXCJGdWxsIERvbWFpblwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwidG9waWNcIiwgbGFiZWw6IFwiVG9waWNcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImNvbnRleHRcIiwgbGFiZWw6IFwiQ29udGV4dFwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwibGluZWFnZVwiLCBsYWJlbDogXCJMaW5lYWdlXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJwaW5uZWRcIiwgbGFiZWw6IFwiUGlubmVkXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJyZWNlbmN5XCIsIGxhYmVsOiBcIlJlY2VuY3lcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImFnZVwiLCBsYWJlbDogXCJBZ2VcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInVybFwiLCBsYWJlbDogXCJVUkxcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcIm5lc3RpbmdcIiwgbGFiZWw6IFwiTmVzdGluZ1wiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwidGl0bGVcIiwgbGFiZWw6IFwiVGl0bGVcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbl07XG5cbmV4cG9ydCBjb25zdCBnZXRTdHJhdGVnaWVzID0gKGN1c3RvbVN0cmF0ZWdpZXM/OiBDdXN0b21TdHJhdGVneVtdKTogU3RyYXRlZ3lEZWZpbml0aW9uW10gPT4ge1xuICAgIGlmICghY3VzdG9tU3RyYXRlZ2llcyB8fCBjdXN0b21TdHJhdGVnaWVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIFNUUkFURUdJRVM7XG5cbiAgICAvLyBDdXN0b20gc3RyYXRlZ2llcyBjYW4gb3ZlcnJpZGUgYnVpbHQtaW5zIGlmIElEcyBtYXRjaCwgb3IgYWRkIG5ldyBvbmVzLlxuICAgIGNvbnN0IGNvbWJpbmVkID0gWy4uLlNUUkFURUdJRVNdO1xuXG4gICAgY3VzdG9tU3RyYXRlZ2llcy5mb3JFYWNoKGN1c3RvbSA9PiB7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nSW5kZXggPSBjb21iaW5lZC5maW5kSW5kZXgocyA9PiBzLmlkID09PSBjdXN0b20uaWQpO1xuXG4gICAgICAgIC8vIERldGVybWluZSBjYXBhYmlsaXRpZXMgYmFzZWQgb24gcnVsZXMgcHJlc2VuY2VcbiAgICAgICAgY29uc3QgaGFzR3JvdXBpbmcgPSAoY3VzdG9tLmdyb3VwaW5nUnVsZXMgJiYgY3VzdG9tLmdyb3VwaW5nUnVsZXMubGVuZ3RoID4gMCkgfHwgKGN1c3RvbS5ydWxlcyAmJiBjdXN0b20ucnVsZXMubGVuZ3RoID4gMCkgfHwgZmFsc2U7XG4gICAgICAgIGNvbnN0IGhhc1NvcnRpbmcgPSAoY3VzdG9tLnNvcnRpbmdSdWxlcyAmJiBjdXN0b20uc29ydGluZ1J1bGVzLmxlbmd0aCA+IDApIHx8IChjdXN0b20ucnVsZXMgJiYgY3VzdG9tLnJ1bGVzLmxlbmd0aCA+IDApIHx8IGZhbHNlO1xuXG4gICAgICAgIGNvbnN0IHRhZ3M6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGlmIChoYXNHcm91cGluZykgdGFncy5wdXNoKFwiZ3JvdXBcIik7XG4gICAgICAgIGlmIChoYXNTb3J0aW5nKSB0YWdzLnB1c2goXCJzb3J0XCIpO1xuXG4gICAgICAgIGNvbnN0IGRlZmluaXRpb246IFN0cmF0ZWd5RGVmaW5pdGlvbiA9IHtcbiAgICAgICAgICAgIGlkOiBjdXN0b20uaWQsXG4gICAgICAgICAgICBsYWJlbDogY3VzdG9tLmxhYmVsLFxuICAgICAgICAgICAgaXNHcm91cGluZzogaGFzR3JvdXBpbmcsXG4gICAgICAgICAgICBpc1NvcnRpbmc6IGhhc1NvcnRpbmcsXG4gICAgICAgICAgICB0YWdzOiB0YWdzLFxuICAgICAgICAgICAgYXV0b1J1bjogY3VzdG9tLmF1dG9SdW4sXG4gICAgICAgICAgICBpc0N1c3RvbTogdHJ1ZVxuICAgICAgICB9O1xuXG4gICAgICAgIGlmIChleGlzdGluZ0luZGV4ICE9PSAtMSkge1xuICAgICAgICAgICAgY29tYmluZWRbZXhpc3RpbmdJbmRleF0gPSBkZWZpbml0aW9uO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29tYmluZWQucHVzaChkZWZpbml0aW9uKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGNvbWJpbmVkO1xufTtcblxuZXhwb3J0IGNvbnN0IGdldFN0cmF0ZWd5ID0gKGlkOiBTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmcpOiBTdHJhdGVneURlZmluaXRpb24gfCB1bmRlZmluZWQgPT4gU1RSQVRFR0lFUy5maW5kKHMgPT4gcy5pZCA9PT0gaWQpO1xuIiwgImltcG9ydCB7IExvZ0VudHJ5LCBMb2dMZXZlbCwgUHJlZmVyZW5jZXMgfSBmcm9tIFwiLi90eXBlcy5qc1wiO1xuXG5jb25zdCBQUkVGSVggPSBcIltUYWJTb3J0ZXJdXCI7XG5cbmNvbnN0IExFVkVMX1BSSU9SSVRZOiBSZWNvcmQ8TG9nTGV2ZWwsIG51bWJlcj4gPSB7XG4gIGRlYnVnOiAwLFxuICBpbmZvOiAxLFxuICB3YXJuOiAyLFxuICBlcnJvcjogMyxcbiAgY3JpdGljYWw6IDRcbn07XG5cbmxldCBjdXJyZW50TGV2ZWw6IExvZ0xldmVsID0gXCJpbmZvXCI7XG5sZXQgbG9nczogTG9nRW50cnlbXSA9IFtdO1xuY29uc3QgTUFYX0xPR1MgPSAxMDAwO1xuY29uc3QgU1RPUkFHRV9LRVkgPSBcInNlc3Npb25Mb2dzXCI7XG5cbi8vIFNhZmUgY29udGV4dCBjaGVja1xuY29uc3QgaXNTZXJ2aWNlV29ya2VyID0gdHlwZW9mIHNlbGYgIT09ICd1bmRlZmluZWQnICYmXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlb2YgKHNlbGYgYXMgYW55KS5TZXJ2aWNlV29ya2VyR2xvYmFsU2NvcGUgIT09ICd1bmRlZmluZWQnICYmXG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmIGluc3RhbmNlb2YgKHNlbGYgYXMgYW55KS5TZXJ2aWNlV29ya2VyR2xvYmFsU2NvcGU7XG5sZXQgaXNTYXZpbmcgPSBmYWxzZTtcbmxldCBwZW5kaW5nU2F2ZSA9IGZhbHNlO1xubGV0IHNhdmVUaW1lcjogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCBudWxsID0gbnVsbDtcblxuY29uc3QgZG9TYXZlID0gKCkgPT4ge1xuICAgIGlmICghaXNTZXJ2aWNlV29ya2VyIHx8ICFjaHJvbWU/LnN0b3JhZ2U/LnNlc3Npb24gfHwgaXNTYXZpbmcpIHtcbiAgICAgICAgcGVuZGluZ1NhdmUgPSB0cnVlO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaXNTYXZpbmcgPSB0cnVlO1xuICAgIHBlbmRpbmdTYXZlID0gZmFsc2U7XG5cbiAgICBjaHJvbWUuc3RvcmFnZS5zZXNzaW9uLnNldCh7IFtTVE9SQUdFX0tFWV06IGxvZ3MgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIGlzU2F2aW5nID0gZmFsc2U7XG4gICAgICAgIGlmIChwZW5kaW5nU2F2ZSkge1xuICAgICAgICAgICAgc2F2ZUxvZ3NUb1N0b3JhZ2UoKTtcbiAgICAgICAgfVxuICAgIH0pLmNhdGNoKGVyciA9PiB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gc2F2ZSBsb2dzXCIsIGVycik7XG4gICAgICAgIGlzU2F2aW5nID0gZmFsc2U7XG4gICAgfSk7XG59O1xuXG5jb25zdCBzYXZlTG9nc1RvU3RvcmFnZSA9ICgpID0+IHtcbiAgICBpZiAoc2F2ZVRpbWVyKSBjbGVhclRpbWVvdXQoc2F2ZVRpbWVyKTtcbiAgICBzYXZlVGltZXIgPSBzZXRUaW1lb3V0KGRvU2F2ZSwgMTAwMCk7XG59O1xuXG5sZXQgcmVzb2x2ZUxvZ2dlclJlYWR5OiAoKSA9PiB2b2lkO1xuZXhwb3J0IGNvbnN0IGxvZ2dlclJlYWR5ID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG4gICAgcmVzb2x2ZUxvZ2dlclJlYWR5ID0gcmVzb2x2ZTtcbn0pO1xuXG5leHBvcnQgY29uc3QgaW5pdExvZ2dlciA9IGFzeW5jICgpID0+IHtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyICYmIGNocm9tZT8uc3RvcmFnZT8uc2Vzc2lvbikge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY2hyb21lLnN0b3JhZ2Uuc2Vzc2lvbi5nZXQoU1RPUkFHRV9LRVkpO1xuICAgICAgICAgICAgaWYgKHJlc3VsdFtTVE9SQUdFX0tFWV0gJiYgQXJyYXkuaXNBcnJheShyZXN1bHRbU1RPUkFHRV9LRVldKSkge1xuICAgICAgICAgICAgICAgIGxvZ3MgPSByZXN1bHRbU1RPUkFHRV9LRVldO1xuICAgICAgICAgICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSBsb2dzID0gbG9ncy5zbGljZSgwLCBNQVhfTE9HUyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gcmVzdG9yZSBsb2dzXCIsIGUpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGlmIChyZXNvbHZlTG9nZ2VyUmVhZHkpIHJlc29sdmVMb2dnZXJSZWFkeSgpO1xufTtcblxuZXhwb3J0IGNvbnN0IHNldExvZ2dlclByZWZlcmVuY2VzID0gKHByZWZzOiBQcmVmZXJlbmNlcykgPT4ge1xuICBpZiAocHJlZnMubG9nTGV2ZWwpIHtcbiAgICBjdXJyZW50TGV2ZWwgPSBwcmVmcy5sb2dMZXZlbDtcbiAgfSBlbHNlIGlmIChwcmVmcy5kZWJ1Zykge1xuICAgIGN1cnJlbnRMZXZlbCA9IFwiZGVidWdcIjtcbiAgfSBlbHNlIHtcbiAgICBjdXJyZW50TGV2ZWwgPSBcImluZm9cIjtcbiAgfVxufTtcblxuY29uc3Qgc2hvdWxkTG9nID0gKGxldmVsOiBMb2dMZXZlbCk6IGJvb2xlYW4gPT4ge1xuICByZXR1cm4gTEVWRUxfUFJJT1JJVFlbbGV2ZWxdID49IExFVkVMX1BSSU9SSVRZW2N1cnJlbnRMZXZlbF07XG59O1xuXG5jb25zdCBmb3JtYXRNZXNzYWdlID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIHJldHVybiBjb250ZXh0ID8gYCR7bWVzc2FnZX0gOjogJHtKU09OLnN0cmluZ2lmeShjb250ZXh0KX1gIDogbWVzc2FnZTtcbn07XG5cbmNvbnN0IGFkZExvZyA9IChsZXZlbDogTG9nTGV2ZWwsIG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIC8vIEFsd2F5cyBhZGQgdG8gYnVmZmVyIHJlZ2FyZGxlc3Mgb2YgY3VycmVudCBjb25zb2xlIGxldmVsIHNldHRpbmcsXG4gIC8vIG9yIHNob3VsZCB3ZSByZXNwZWN0IGl0PyBVc3VhbGx5IGRlYnVnIGxvZ3MgYXJlIG5vaXN5LlxuICAvLyBMZXQncyByZXNwZWN0IHNob3VsZExvZyBmb3IgdGhlIGJ1ZmZlciB0b28gdG8gc2F2ZSBtZW1vcnkvbm9pc2UsXG4gIC8vIE9SIHdlIGNhbiBzdG9yZSBldmVyeXRoaW5nIGJ1dCBmaWx0ZXIgb24gdmlldy5cbiAgLy8gR2l2ZW4gd2Ugd2FudCB0byBkZWJ1ZyBpc3N1ZXMsIHN0b3JpbmcgZXZlcnl0aGluZyBtaWdodCBiZSBiZXR0ZXIsXG4gIC8vIGJ1dCBpZiB3ZSBzdG9yZSBldmVyeXRoaW5nIHdlIG1pZ2h0IGZpbGwgYnVmZmVyIHdpdGggZGVidWcgbm9pc2UgcXVpY2tseS5cbiAgLy8gTGV0J3Mgc3RpY2sgdG8gc3RvcmluZyB3aGF0IGlzIGNvbmZpZ3VyZWQgdG8gYmUgbG9nZ2VkLlxuICAvLyBXYWl0LCBpZiBJIHdhbnQgdG8gXCJkZWJ1Z1wiIHNvbWV0aGluZywgSSB1c3VhbGx5IHR1cm4gb24gZGVidWcgbG9ncy5cbiAgLy8gSWYgSSBjYW4ndCBzZWUgcGFzdCBsb2dzIGJlY2F1c2UgdGhleSB3ZXJlbid0IHN0b3JlZCwgSSBoYXZlIHRvIHJlcHJvLlxuICAvLyBMZXQncyBzdG9yZSBpZiBpdCBwYXNzZXMgYHNob3VsZExvZ2AuXG5cbiAgaWYgKHNob3VsZExvZyhsZXZlbCkpIHtcbiAgICAgIGNvbnN0IGVudHJ5OiBMb2dFbnRyeSA9IHtcbiAgICAgICAgICB0aW1lc3RhbXA6IERhdGUubm93KCksXG4gICAgICAgICAgbGV2ZWwsXG4gICAgICAgICAgbWVzc2FnZSxcbiAgICAgICAgICBjb250ZXh0XG4gICAgICB9O1xuXG4gICAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSB7XG4gICAgICAgICAgbG9ncy51bnNoaWZ0KGVudHJ5KTtcbiAgICAgICAgICBpZiAobG9ncy5sZW5ndGggPiBNQVhfTE9HUykge1xuICAgICAgICAgICAgICBsb2dzLnBvcCgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBzYXZlTG9nc1RvU3RvcmFnZSgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBJbiBvdGhlciBjb250ZXh0cywgc2VuZCB0byBTV1xuICAgICAgICAgIGlmIChjaHJvbWU/LnJ1bnRpbWU/LnNlbmRNZXNzYWdlKSB7XG4gICAgICAgICAgICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiAnbG9nRW50cnknLCBwYXlsb2FkOiBlbnRyeSB9KS5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgIC8vIElnbm9yZSBpZiBtZXNzYWdlIGZhaWxzIChlLmcuIGNvbnRleHQgaW52YWxpZGF0ZWQpXG4gICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgfVxuICB9XG59O1xuXG5leHBvcnQgY29uc3QgYWRkTG9nRW50cnkgPSAoZW50cnk6IExvZ0VudHJ5KSA9PiB7XG4gICAgaWYgKGlzU2VydmljZVdvcmtlcikge1xuICAgICAgICBsb2dzLnVuc2hpZnQoZW50cnkpO1xuICAgICAgICBpZiAobG9ncy5sZW5ndGggPiBNQVhfTE9HUykge1xuICAgICAgICAgICAgbG9ncy5wb3AoKTtcbiAgICAgICAgfVxuICAgICAgICBzYXZlTG9nc1RvU3RvcmFnZSgpO1xuICAgIH1cbn07XG5cbmV4cG9ydCBjb25zdCBnZXRMb2dzID0gKCkgPT4gWy4uLmxvZ3NdO1xuZXhwb3J0IGNvbnN0IGNsZWFyTG9ncyA9ICgpID0+IHtcbiAgICBsb2dzLmxlbmd0aCA9IDA7XG4gICAgaWYgKGlzU2VydmljZVdvcmtlcikgc2F2ZUxvZ3NUb1N0b3JhZ2UoKTtcbn07XG5cbmV4cG9ydCBjb25zdCBsb2dEZWJ1ZyA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBhZGRMb2coXCJkZWJ1Z1wiLCBtZXNzYWdlLCBjb250ZXh0KTtcbiAgaWYgKHNob3VsZExvZyhcImRlYnVnXCIpKSB7XG4gICAgY29uc29sZS5kZWJ1ZyhgJHtQUkVGSVh9IFtERUJVR10gJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nSW5mbyA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBhZGRMb2coXCJpbmZvXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwiaW5mb1wiKSkge1xuICAgIGNvbnNvbGUuaW5mbyhgJHtQUkVGSVh9IFtJTkZPXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgY29udGV4dCl9YCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBsb2dXYXJuID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcIndhcm5cIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJ3YXJuXCIpKSB7XG4gICAgY29uc29sZS53YXJuKGAke1BSRUZJWH0gW1dBUk5dICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0Vycm9yID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImVycm9yXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwiZXJyb3JcIikpIHtcbiAgICBjb25zb2xlLmVycm9yKGAke1BSRUZJWH0gW0VSUk9SXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgY29udGV4dCl9YCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBsb2dDcml0aWNhbCA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBhZGRMb2coXCJjcml0aWNhbFwiLCBtZXNzYWdlLCBjb250ZXh0KTtcbiAgaWYgKHNob3VsZExvZyhcImNyaXRpY2FsXCIpKSB7XG4gICAgLy8gQ3JpdGljYWwgbG9ncyB1c2UgZXJyb3IgY29uc29sZSBidXQgd2l0aCBkaXN0aW5jdCBwcmVmaXggYW5kIG1heWJlIHN0eWxpbmcgaWYgc3VwcG9ydGVkXG4gICAgY29uc29sZS5lcnJvcihgJHtQUkVGSVh9IFtDUklUSUNBTF0gXHVEODNEXHVERUE4ICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcbiIsICJpbXBvcnQgeyBQcmVmZXJlbmNlcywgU29ydGluZ1N0cmF0ZWd5LCBUYWJNZXRhZGF0YSB9IGZyb20gXCIuL3R5cGVzLmpzXCI7XG5cbmV4cG9ydCBjb25zdCBtYXBDaHJvbWVUYWIgPSAodGFiOiBjaHJvbWUudGFicy5UYWIpOiBUYWJNZXRhZGF0YSB8IG51bGwgPT4ge1xuICBpZiAoIXRhYi5pZCB8fCB0YWIuaWQgPT09IGNocm9tZS50YWJzLlRBQl9JRF9OT05FIHx8ICF0YWIud2luZG93SWQpIHJldHVybiBudWxsO1xuICByZXR1cm4ge1xuICAgIGlkOiB0YWIuaWQsXG4gICAgd2luZG93SWQ6IHRhYi53aW5kb3dJZCxcbiAgICB0aXRsZTogdGFiLnRpdGxlIHx8IFwiVW50aXRsZWRcIixcbiAgICB1cmw6IHRhYi51cmwgfHwgXCJhYm91dDpibGFua1wiLFxuICAgIHBpbm5lZDogQm9vbGVhbih0YWIucGlubmVkKSxcbiAgICBsYXN0QWNjZXNzZWQ6IHRhYi5sYXN0QWNjZXNzZWQsXG4gICAgb3BlbmVyVGFiSWQ6IHRhYi5vcGVuZXJUYWJJZCA/PyB1bmRlZmluZWQsXG4gICAgZmF2SWNvblVybDogdGFiLmZhdkljb25VcmwsXG4gICAgZ3JvdXBJZDogdGFiLmdyb3VwSWQsXG4gICAgaW5kZXg6IHRhYi5pbmRleCxcbiAgICBhY3RpdmU6IHRhYi5hY3RpdmUsXG4gICAgc3RhdHVzOiB0YWIuc3RhdHVzLFxuICAgIHNlbGVjdGVkOiB0YWIuaGlnaGxpZ2h0ZWRcbiAgfTtcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRTdG9yZWRQcmVmZXJlbmNlcyA9IGFzeW5jICgpOiBQcm9taXNlPFByZWZlcmVuY2VzIHwgbnVsbD4gPT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoXCJwcmVmZXJlbmNlc1wiLCAoaXRlbXMpID0+IHtcbiAgICAgIHJlc29sdmUoKGl0ZW1zW1wicHJlZmVyZW5jZXNcIl0gYXMgUHJlZmVyZW5jZXMpID8/IG51bGwpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBhc0FycmF5ID0gPFQ+KHZhbHVlOiB1bmtub3duKTogVFtdID0+IHtcbiAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHJldHVybiB2YWx1ZSBhcyBUW107XG4gICAgcmV0dXJuIFtdO1xufTtcbiIsICJpbXBvcnQgeyBHcm91cGluZ1N0cmF0ZWd5LCBTb3J0aW5nU3RyYXRlZ3ksIFRhYkdyb3VwLCBUYWJNZXRhZGF0YSwgQ3VzdG9tU3RyYXRlZ3ksIFN0cmF0ZWd5UnVsZSwgUnVsZUNvbmRpdGlvbiwgR3JvdXBpbmdSdWxlLCBTb3J0aW5nUnVsZSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGdldFN0cmF0ZWdpZXMgfSBmcm9tIFwiLi4vc2hhcmVkL3N0cmF0ZWd5UmVnaXN0cnkuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tIFwiLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5cbmxldCBjdXN0b21TdHJhdGVnaWVzOiBDdXN0b21TdHJhdGVneVtdID0gW107XG5cbmV4cG9ydCBjb25zdCBzZXRDdXN0b21TdHJhdGVnaWVzID0gKHN0cmF0ZWdpZXM6IEN1c3RvbVN0cmF0ZWd5W10pID0+IHtcbiAgICBjdXN0b21TdHJhdGVnaWVzID0gc3RyYXRlZ2llcztcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRDdXN0b21TdHJhdGVnaWVzID0gKCk6IEN1c3RvbVN0cmF0ZWd5W10gPT4gY3VzdG9tU3RyYXRlZ2llcztcblxuY29uc3QgQ09MT1JTID0gW1wiZ3JleVwiLCBcImJsdWVcIiwgXCJyZWRcIiwgXCJ5ZWxsb3dcIiwgXCJncmVlblwiLCBcInBpbmtcIiwgXCJwdXJwbGVcIiwgXCJjeWFuXCIsIFwib3JhbmdlXCJdO1xuXG5jb25zdCByZWdleENhY2hlID0gbmV3IE1hcDxzdHJpbmcsIFJlZ0V4cD4oKTtcbmNvbnN0IGRvbWFpbkNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcbmNvbnN0IHN1YmRvbWFpbkNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcbmNvbnN0IE1BWF9DQUNIRV9TSVpFID0gMTAwMDtcblxuZXhwb3J0IGNvbnN0IGRvbWFpbkZyb21VcmwgPSAodXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBpZiAoZG9tYWluQ2FjaGUuaGFzKHVybCkpIHJldHVybiBkb21haW5DYWNoZS5nZXQodXJsKSE7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBwYXJzZWQgPSBuZXcgVVJMKHVybCk7XG4gICAgY29uc3QgZG9tYWluID0gcGFyc2VkLmhvc3RuYW1lLnJlcGxhY2UoL153d3dcXC4vLCBcIlwiKTtcblxuICAgIGlmIChkb21haW5DYWNoZS5zaXplID49IE1BWF9DQUNIRV9TSVpFKSBkb21haW5DYWNoZS5jbGVhcigpO1xuICAgIGRvbWFpbkNhY2hlLnNldCh1cmwsIGRvbWFpbik7XG5cbiAgICByZXR1cm4gZG9tYWluO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGxvZ0RlYnVnKFwiRmFpbGVkIHRvIHBhcnNlIGRvbWFpblwiLCB7IHVybCwgZXJyb3I6IFN0cmluZyhlcnJvcikgfSk7XG4gICAgcmV0dXJuIFwidW5rbm93blwiO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3Qgc3ViZG9tYWluRnJvbVVybCA9ICh1cmw6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgaWYgKHN1YmRvbWFpbkNhY2hlLmhhcyh1cmwpKSByZXR1cm4gc3ViZG9tYWluQ2FjaGUuZ2V0KHVybCkhO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcGFyc2VkID0gbmV3IFVSTCh1cmwpO1xuICAgICAgICBsZXQgaG9zdG5hbWUgPSBwYXJzZWQuaG9zdG5hbWU7XG4gICAgICAgIC8vIFJlbW92ZSB3d3cuXG4gICAgICAgIGhvc3RuYW1lID0gaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sIFwiXCIpO1xuXG4gICAgICAgIGxldCByZXN1bHQgPSBcIlwiO1xuICAgICAgICBjb25zdCBwYXJ0cyA9IGhvc3RuYW1lLnNwbGl0KCcuJyk7XG4gICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAyKSB7XG4gICAgICAgICAgICAgcmVzdWx0ID0gcGFydHMuc2xpY2UoMCwgcGFydHMubGVuZ3RoIC0gMikuam9pbignLicpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN1YmRvbWFpbkNhY2hlLnNpemUgPj0gTUFYX0NBQ0hFX1NJWkUpIHN1YmRvbWFpbkNhY2hlLmNsZWFyKCk7XG4gICAgICAgIHN1YmRvbWFpbkNhY2hlLnNldCh1cmwsIHJlc3VsdCk7XG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9IGNhdGNoIHtcbiAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgfVxufVxuXG5leHBvcnQgY29uc3QgZ2V0RmllbGRWYWx1ZSA9ICh0YWI6IFRhYk1ldGFkYXRhLCBmaWVsZDogc3RyaW5nKTogYW55ID0+IHtcbiAgICBzd2l0Y2goZmllbGQpIHtcbiAgICAgICAgY2FzZSAnaWQnOiByZXR1cm4gdGFiLmlkO1xuICAgICAgICBjYXNlICdpbmRleCc6IHJldHVybiB0YWIuaW5kZXg7XG4gICAgICAgIGNhc2UgJ3dpbmRvd0lkJzogcmV0dXJuIHRhYi53aW5kb3dJZDtcbiAgICAgICAgY2FzZSAnZ3JvdXBJZCc6IHJldHVybiB0YWIuZ3JvdXBJZDtcbiAgICAgICAgY2FzZSAndGl0bGUnOiByZXR1cm4gdGFiLnRpdGxlO1xuICAgICAgICBjYXNlICd1cmwnOiByZXR1cm4gdGFiLnVybDtcbiAgICAgICAgY2FzZSAnc3RhdHVzJzogcmV0dXJuIHRhYi5zdGF0dXM7XG4gICAgICAgIGNhc2UgJ2FjdGl2ZSc6IHJldHVybiB0YWIuYWN0aXZlO1xuICAgICAgICBjYXNlICdzZWxlY3RlZCc6IHJldHVybiB0YWIuc2VsZWN0ZWQ7XG4gICAgICAgIGNhc2UgJ3Bpbm5lZCc6IHJldHVybiB0YWIucGlubmVkO1xuICAgICAgICBjYXNlICdvcGVuZXJUYWJJZCc6IHJldHVybiB0YWIub3BlbmVyVGFiSWQ7XG4gICAgICAgIGNhc2UgJ2xhc3RBY2Nlc3NlZCc6IHJldHVybiB0YWIubGFzdEFjY2Vzc2VkO1xuICAgICAgICBjYXNlICdjb250ZXh0JzogcmV0dXJuIHRhYi5jb250ZXh0O1xuICAgICAgICBjYXNlICdnZW5yZSc6IHJldHVybiB0YWIuY29udGV4dERhdGE/LmdlbnJlO1xuICAgICAgICBjYXNlICdzaXRlTmFtZSc6IHJldHVybiB0YWIuY29udGV4dERhdGE/LnNpdGVOYW1lO1xuICAgICAgICAvLyBEZXJpdmVkIG9yIG1hcHBlZCBmaWVsZHNcbiAgICAgICAgY2FzZSAnZG9tYWluJzogcmV0dXJuIGRvbWFpbkZyb21VcmwodGFiLnVybCk7XG4gICAgICAgIGNhc2UgJ3N1YmRvbWFpbic6IHJldHVybiBzdWJkb21haW5Gcm9tVXJsKHRhYi51cmwpO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgaWYgKGZpZWxkLmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgICAgICAgICAgcmV0dXJuIGZpZWxkLnNwbGl0KCcuJykucmVkdWNlKChvYmosIGtleSkgPT4gKG9iaiAmJiB0eXBlb2Ygb2JqID09PSAnb2JqZWN0JyAmJiBvYmogIT09IG51bGwpID8gKG9iaiBhcyBhbnkpW2tleV0gOiB1bmRlZmluZWQsIHRhYik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gKHRhYiBhcyBhbnkpW2ZpZWxkXTtcbiAgICB9XG59O1xuXG5jb25zdCBzdHJpcFRsZCA9IChkb21haW46IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIHJldHVybiBkb21haW4ucmVwbGFjZSgvXFwuKGNvbXxvcmd8Z292fG5ldHxlZHV8aW8pJC9pLCBcIlwiKTtcbn07XG5cbmV4cG9ydCBjb25zdCBzZW1hbnRpY0J1Y2tldCA9ICh0aXRsZTogc3RyaW5nLCB1cmw6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGtleSA9IGAke3RpdGxlfSAke3VybH1gLnRvTG93ZXJDYXNlKCk7XG4gIGlmIChrZXkuaW5jbHVkZXMoXCJkb2NcIikgfHwga2V5LmluY2x1ZGVzKFwicmVhZG1lXCIpIHx8IGtleS5pbmNsdWRlcyhcImd1aWRlXCIpKSByZXR1cm4gXCJEb2NzXCI7XG4gIGlmIChrZXkuaW5jbHVkZXMoXCJtYWlsXCIpIHx8IGtleS5pbmNsdWRlcyhcImluYm94XCIpKSByZXR1cm4gXCJDaGF0XCI7XG4gIGlmIChrZXkuaW5jbHVkZXMoXCJkYXNoYm9hcmRcIikgfHwga2V5LmluY2x1ZGVzKFwiY29uc29sZVwiKSkgcmV0dXJuIFwiRGFzaFwiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiaXNzdWVcIikgfHwga2V5LmluY2x1ZGVzKFwidGlja2V0XCIpKSByZXR1cm4gXCJUYXNrc1wiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiZHJpdmVcIikgfHwga2V5LmluY2x1ZGVzKFwic3RvcmFnZVwiKSkgcmV0dXJuIFwiRmlsZXNcIjtcbiAgcmV0dXJuIFwiTWlzY1wiO1xufTtcblxuZXhwb3J0IGNvbnN0IG5hdmlnYXRpb25LZXkgPSAodGFiOiBUYWJNZXRhZGF0YSk6IHN0cmluZyA9PiB7XG4gIGlmICh0YWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiBgY2hpbGQtb2YtJHt0YWIub3BlbmVyVGFiSWR9YDtcbiAgfVxuICByZXR1cm4gYHdpbmRvdy0ke3RhYi53aW5kb3dJZH1gO1xufTtcblxuY29uc3QgZ2V0UmVjZW5jeUxhYmVsID0gKGxhc3RBY2Nlc3NlZDogbnVtYmVyKTogc3RyaW5nID0+IHtcbiAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcbiAgY29uc3QgZGlmZiA9IG5vdyAtIGxhc3RBY2Nlc3NlZDtcbiAgaWYgKGRpZmYgPCAzNjAwMDAwKSByZXR1cm4gXCJKdXN0IG5vd1wiOyAvLyAxaFxuICBpZiAoZGlmZiA8IDg2NDAwMDAwKSByZXR1cm4gXCJUb2RheVwiOyAvLyAyNGhcbiAgaWYgKGRpZmYgPCAxNzI4MDAwMDApIHJldHVybiBcIlllc3RlcmRheVwiOyAvLyA0OGhcbiAgaWYgKGRpZmYgPCA2MDQ4MDAwMDApIHJldHVybiBcIlRoaXMgV2Vla1wiOyAvLyA3ZFxuICByZXR1cm4gXCJPbGRlclwiO1xufTtcblxuY29uc3QgY29sb3JGb3JLZXkgPSAoa2V5OiBzdHJpbmcsIG9mZnNldDogbnVtYmVyKTogc3RyaW5nID0+IENPTE9SU1soTWF0aC5hYnMoaGFzaENvZGUoa2V5KSkgKyBvZmZzZXQpICUgQ09MT1JTLmxlbmd0aF07XG5cbmNvbnN0IGhhc2hDb2RlID0gKHZhbHVlOiBzdHJpbmcpOiBudW1iZXIgPT4ge1xuICBsZXQgaGFzaCA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgdmFsdWUubGVuZ3RoOyBpICs9IDEpIHtcbiAgICBoYXNoID0gKGhhc2ggPDwgNSkgLSBoYXNoICsgdmFsdWUuY2hhckNvZGVBdChpKTtcbiAgICBoYXNoIHw9IDA7XG4gIH1cbiAgcmV0dXJuIGhhc2g7XG59O1xuXG4vLyBIZWxwZXIgdG8gZ2V0IGEgaHVtYW4tcmVhZGFibGUgbGFiZWwgY29tcG9uZW50IGZyb20gYSBzdHJhdGVneSBhbmQgYSBzZXQgb2YgdGFic1xuY29uc3QgZ2V0TGFiZWxDb21wb25lbnQgPSAoc3RyYXRlZ3k6IEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcsIHRhYnM6IFRhYk1ldGFkYXRhW10sIGFsbFRhYnNNYXA6IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhPik6IHN0cmluZyB8IG51bGwgPT4ge1xuICBjb25zdCBmaXJzdFRhYiA9IHRhYnNbMF07XG4gIGlmICghZmlyc3RUYWIpIHJldHVybiBcIlVua25vd25cIjtcblxuICAvLyBDaGVjayBjdXN0b20gc3RyYXRlZ2llcyBmaXJzdFxuICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneSk7XG4gIGlmIChjdXN0b20pIHtcbiAgICAgIHJldHVybiBncm91cGluZ0tleShmaXJzdFRhYiwgc3RyYXRlZ3kpO1xuICB9XG5cbiAgc3dpdGNoIChzdHJhdGVneSkge1xuICAgIGNhc2UgXCJkb21haW5cIjoge1xuICAgICAgY29uc3Qgc2l0ZU5hbWVzID0gbmV3IFNldCh0YWJzLm1hcCh0ID0+IHQuY29udGV4dERhdGE/LnNpdGVOYW1lKS5maWx0ZXIoQm9vbGVhbikpO1xuICAgICAgaWYgKHNpdGVOYW1lcy5zaXplID09PSAxKSB7XG4gICAgICAgIHJldHVybiBzdHJpcFRsZChBcnJheS5mcm9tKHNpdGVOYW1lcylbMF0gYXMgc3RyaW5nKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzdHJpcFRsZChkb21haW5Gcm9tVXJsKGZpcnN0VGFiLnVybCkpO1xuICAgIH1cbiAgICBjYXNlIFwiZG9tYWluX2Z1bGxcIjpcbiAgICAgIHJldHVybiBkb21haW5Gcm9tVXJsKGZpcnN0VGFiLnVybCk7XG4gICAgY2FzZSBcInRvcGljXCI6XG4gICAgICByZXR1cm4gc2VtYW50aWNCdWNrZXQoZmlyc3RUYWIudGl0bGUsIGZpcnN0VGFiLnVybCk7XG4gICAgY2FzZSBcImxpbmVhZ2VcIjpcbiAgICAgIGlmIChmaXJzdFRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGNvbnN0IHBhcmVudCA9IGFsbFRhYnNNYXAuZ2V0KGZpcnN0VGFiLm9wZW5lclRhYklkKTtcbiAgICAgICAgaWYgKHBhcmVudCkge1xuICAgICAgICAgIGNvbnN0IHBhcmVudFRpdGxlID0gcGFyZW50LnRpdGxlLmxlbmd0aCA+IDIwID8gcGFyZW50LnRpdGxlLnN1YnN0cmluZygwLCAyMCkgKyBcIi4uLlwiIDogcGFyZW50LnRpdGxlO1xuICAgICAgICAgIHJldHVybiBgRnJvbTogJHtwYXJlbnRUaXRsZX1gO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBgRnJvbTogVGFiICR7Zmlyc3RUYWIub3BlbmVyVGFiSWR9YDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgV2luZG93ICR7Zmlyc3RUYWIud2luZG93SWR9YDtcbiAgICBjYXNlIFwiY29udGV4dFwiOlxuICAgICAgcmV0dXJuIGZpcnN0VGFiLmNvbnRleHQgfHwgXCJVbmNhdGVnb3JpemVkXCI7XG4gICAgY2FzZSBcInBpbm5lZFwiOlxuICAgICAgcmV0dXJuIGZpcnN0VGFiLnBpbm5lZCA/IFwiUGlubmVkXCIgOiBcIlVucGlubmVkXCI7XG4gICAgY2FzZSBcImFnZVwiOlxuICAgICAgcmV0dXJuIGdldFJlY2VuY3lMYWJlbChmaXJzdFRhYi5sYXN0QWNjZXNzZWQgPz8gMCk7XG4gICAgY2FzZSBcInVybFwiOlxuICAgICAgcmV0dXJuIFwiVVJMIEdyb3VwXCI7XG4gICAgY2FzZSBcInJlY2VuY3lcIjpcbiAgICAgIHJldHVybiBcIlRpbWUgR3JvdXBcIjtcbiAgICBjYXNlIFwibmVzdGluZ1wiOlxuICAgICAgcmV0dXJuIGZpcnN0VGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQgPyBcIkNoaWxkcmVuXCIgOiBcIlJvb3RzXCI7XG4gICAgZGVmYXVsdDpcbiAgICAgIGNvbnN0IHZhbCA9IGdldEZpZWxkVmFsdWUoZmlyc3RUYWIsIHN0cmF0ZWd5KTtcbiAgICAgIGlmICh2YWwgIT09IHVuZGVmaW5lZCAmJiB2YWwgIT09IG51bGwpIHtcbiAgICAgICAgICByZXR1cm4gU3RyaW5nKHZhbCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gXCJVbmtub3duXCI7XG4gIH1cbn07XG5cbmNvbnN0IGdlbmVyYXRlTGFiZWwgPSAoXG4gIHN0cmF0ZWdpZXM6IChHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nKVtdLFxuICB0YWJzOiBUYWJNZXRhZGF0YVtdLFxuICBhbGxUYWJzTWFwOiBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YT5cbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGxhYmVscyA9IHN0cmF0ZWdpZXNcbiAgICAubWFwKHMgPT4gZ2V0TGFiZWxDb21wb25lbnQocywgdGFicywgYWxsVGFic01hcCkpXG4gICAgLmZpbHRlcihsID0+IGwgJiYgbCAhPT0gXCJVbmtub3duXCIgJiYgbCAhPT0gXCJHcm91cFwiICYmIGwgIT09IFwiVVJMIEdyb3VwXCIgJiYgbCAhPT0gXCJUaW1lIEdyb3VwXCIgJiYgbCAhPT0gXCJNaXNjXCIpO1xuXG4gIGlmIChsYWJlbHMubGVuZ3RoID09PSAwKSByZXR1cm4gXCJHcm91cFwiO1xuICByZXR1cm4gQXJyYXkuZnJvbShuZXcgU2V0KGxhYmVscykpLmpvaW4oXCIgLSBcIik7XG59O1xuXG5jb25zdCBnZXRTdHJhdGVneUNvbG9yUnVsZSA9IChzdHJhdGVneUlkOiBzdHJpbmcpOiBHcm91cGluZ1J1bGUgfCB1bmRlZmluZWQgPT4ge1xuICAgIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5SWQpO1xuICAgIGlmICghY3VzdG9tKSByZXR1cm4gdW5kZWZpbmVkO1xuXG4gICAgY29uc3QgZ3JvdXBpbmdSdWxlc0xpc3QgPSBhc0FycmF5PEdyb3VwaW5nUnVsZT4oY3VzdG9tLmdyb3VwaW5nUnVsZXMpO1xuICAgIC8vIEl0ZXJhdGUgbWFudWFsbHkgdG8gY2hlY2sgY29sb3JcbiAgICBmb3IgKGxldCBpID0gZ3JvdXBpbmdSdWxlc0xpc3QubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgY29uc3QgcnVsZSA9IGdyb3VwaW5nUnVsZXNMaXN0W2ldO1xuICAgICAgICBpZiAocnVsZSAmJiBydWxlLmNvbG9yICYmIHJ1bGUuY29sb3IgIT09ICdyYW5kb20nKSB7XG4gICAgICAgICAgICByZXR1cm4gcnVsZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xufTtcblxuY29uc3QgcmVzb2x2ZVdpbmRvd01vZGUgPSAobW9kZXM6IChzdHJpbmcgfCB1bmRlZmluZWQpW10pOiBcImN1cnJlbnRcIiB8IFwibmV3XCIgfCBcImNvbXBvdW5kXCIgPT4ge1xuICAgIGlmIChtb2Rlcy5pbmNsdWRlcyhcIm5ld1wiKSkgcmV0dXJuIFwibmV3XCI7XG4gICAgaWYgKG1vZGVzLmluY2x1ZGVzKFwiY29tcG91bmRcIikpIHJldHVybiBcImNvbXBvdW5kXCI7XG4gICAgcmV0dXJuIFwiY3VycmVudFwiO1xufTtcblxuZXhwb3J0IGNvbnN0IGdyb3VwVGFicyA9IChcbiAgdGFiczogVGFiTWV0YWRhdGFbXSxcbiAgc3RyYXRlZ2llczogKFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZylbXVxuKTogVGFiR3JvdXBbXSA9PiB7XG4gIGNvbnN0IGF2YWlsYWJsZVN0cmF0ZWdpZXMgPSBnZXRTdHJhdGVnaWVzKGN1c3RvbVN0cmF0ZWdpZXMpO1xuICBjb25zdCBlZmZlY3RpdmVTdHJhdGVnaWVzID0gc3RyYXRlZ2llcy5maWx0ZXIocyA9PiBhdmFpbGFibGVTdHJhdGVnaWVzLmZpbmQoYXZhaWwgPT4gYXZhaWwuaWQgPT09IHMpPy5pc0dyb3VwaW5nKTtcbiAgY29uc3QgYnVja2V0cyA9IG5ldyBNYXA8c3RyaW5nLCBUYWJHcm91cD4oKTtcblxuICBjb25zdCBhbGxUYWJzTWFwID0gbmV3IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhPigpO1xuICB0YWJzLmZvckVhY2godCA9PiBhbGxUYWJzTWFwLnNldCh0LmlkLCB0KSk7XG5cbiAgdGFicy5mb3JFYWNoKCh0YWIpID0+IHtcbiAgICBsZXQga2V5czogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBhcHBsaWVkU3RyYXRlZ2llczogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBjb2xsZWN0ZWRNb2Rlczogc3RyaW5nW10gPSBbXTtcblxuICAgIHRyeSB7XG4gICAgICAgIGZvciAoY29uc3QgcyBvZiBlZmZlY3RpdmVTdHJhdGVnaWVzKSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBnZXRHcm91cGluZ1Jlc3VsdCh0YWIsIHMpO1xuICAgICAgICAgICAgaWYgKHJlc3VsdC5rZXkgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBrZXlzLnB1c2goYCR7c306JHtyZXN1bHQua2V5fWApO1xuICAgICAgICAgICAgICAgIGFwcGxpZWRTdHJhdGVnaWVzLnB1c2gocyk7XG4gICAgICAgICAgICAgICAgY29sbGVjdGVkTW9kZXMucHVzaChyZXN1bHQubW9kZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGxvZ0RlYnVnKFwiRXJyb3IgZ2VuZXJhdGluZyBncm91cGluZyBrZXlcIiwgeyB0YWJJZDogdGFiLmlkLCBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICByZXR1cm47IC8vIFNraXAgdGhpcyB0YWIgb24gZXJyb3JcbiAgICB9XG5cbiAgICAvLyBJZiBubyBzdHJhdGVnaWVzIGFwcGxpZWQgKGUuZy4gYWxsIGZpbHRlcmVkIG91dCksIHNraXAgZ3JvdXBpbmcgZm9yIHRoaXMgdGFiXG4gICAgaWYgKGtleXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBlZmZlY3RpdmVNb2RlID0gcmVzb2x2ZVdpbmRvd01vZGUoY29sbGVjdGVkTW9kZXMpO1xuICAgIGNvbnN0IHZhbHVlS2V5ID0ga2V5cy5qb2luKFwiOjpcIik7XG4gICAgbGV0IGJ1Y2tldEtleSA9IFwiXCI7XG4gICAgaWYgKGVmZmVjdGl2ZU1vZGUgPT09ICdjdXJyZW50Jykge1xuICAgICAgICAgYnVja2V0S2V5ID0gYHdpbmRvdy0ke3RhYi53aW5kb3dJZH06OmAgKyB2YWx1ZUtleTtcbiAgICB9IGVsc2Uge1xuICAgICAgICAgYnVja2V0S2V5ID0gYGdsb2JhbDo6YCArIHZhbHVlS2V5O1xuICAgIH1cblxuICAgIGxldCBncm91cCA9IGJ1Y2tldHMuZ2V0KGJ1Y2tldEtleSk7XG4gICAgaWYgKCFncm91cCkge1xuICAgICAgbGV0IGdyb3VwQ29sb3IgPSBudWxsO1xuICAgICAgbGV0IGNvbG9yRmllbGQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICAgICAgZm9yIChjb25zdCBzSWQgb2YgYXBwbGllZFN0cmF0ZWdpZXMpIHtcbiAgICAgICAgY29uc3QgcnVsZSA9IGdldFN0cmF0ZWd5Q29sb3JSdWxlKHNJZCk7XG4gICAgICAgIGlmIChydWxlKSB7XG4gICAgICAgICAgICBncm91cENvbG9yID0gcnVsZS5jb2xvcjtcbiAgICAgICAgICAgIGNvbG9yRmllbGQgPSBydWxlLmNvbG9yRmllbGQ7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoZ3JvdXBDb2xvciA9PT0gJ21hdGNoJykge1xuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkodmFsdWVLZXksIDApO1xuICAgICAgfSBlbHNlIGlmIChncm91cENvbG9yID09PSAnZmllbGQnICYmIGNvbG9yRmllbGQpIHtcbiAgICAgICAgY29uc3QgdmFsID0gZ2V0RmllbGRWYWx1ZSh0YWIsIGNvbG9yRmllbGQpO1xuICAgICAgICBjb25zdCBrZXkgPSB2YWwgIT09IHVuZGVmaW5lZCAmJiB2YWwgIT09IG51bGwgPyBTdHJpbmcodmFsKSA6IFwiXCI7XG4gICAgICAgIGdyb3VwQ29sb3IgPSBjb2xvckZvcktleShrZXksIDApO1xuICAgICAgfSBlbHNlIGlmICghZ3JvdXBDb2xvciB8fCBncm91cENvbG9yID09PSAnZmllbGQnKSB7XG4gICAgICAgIGdyb3VwQ29sb3IgPSBjb2xvckZvcktleShidWNrZXRLZXksIGJ1Y2tldHMuc2l6ZSk7XG4gICAgICB9XG5cbiAgICAgIGdyb3VwID0ge1xuICAgICAgICBpZDogYnVja2V0S2V5LFxuICAgICAgICB3aW5kb3dJZDogdGFiLndpbmRvd0lkLFxuICAgICAgICBsYWJlbDogXCJcIixcbiAgICAgICAgY29sb3I6IGdyb3VwQ29sb3IsXG4gICAgICAgIHRhYnM6IFtdLFxuICAgICAgICByZWFzb246IGFwcGxpZWRTdHJhdGVnaWVzLmpvaW4oXCIgKyBcIiksXG4gICAgICAgIHdpbmRvd01vZGU6IGVmZmVjdGl2ZU1vZGVcbiAgICAgIH07XG4gICAgICBidWNrZXRzLnNldChidWNrZXRLZXksIGdyb3VwKTtcbiAgICB9XG4gICAgZ3JvdXAudGFicy5wdXNoKHRhYik7XG4gIH0pO1xuXG4gIGNvbnN0IGdyb3VwcyA9IEFycmF5LmZyb20oYnVja2V0cy52YWx1ZXMoKSk7XG4gIGdyb3Vwcy5mb3JFYWNoKGdyb3VwID0+IHtcbiAgICBncm91cC5sYWJlbCA9IGdlbmVyYXRlTGFiZWwoZWZmZWN0aXZlU3RyYXRlZ2llcywgZ3JvdXAudGFicywgYWxsVGFic01hcCk7XG4gIH0pO1xuXG4gIHJldHVybiBncm91cHM7XG59O1xuXG5jb25zdCBjaGVja1ZhbHVlTWF0Y2ggPSAoXG4gICAgb3BlcmF0b3I6IHN0cmluZyxcbiAgICByYXdWYWx1ZTogYW55LFxuICAgIHJ1bGVWYWx1ZTogc3RyaW5nXG4pOiB7IGlzTWF0Y2g6IGJvb2xlYW47IG1hdGNoT2JqOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsIH0gPT4ge1xuICAgIGNvbnN0IHZhbHVlU3RyID0gcmF3VmFsdWUgIT09IHVuZGVmaW5lZCAmJiByYXdWYWx1ZSAhPT0gbnVsbCA/IFN0cmluZyhyYXdWYWx1ZSkgOiBcIlwiO1xuICAgIGNvbnN0IHZhbHVlVG9DaGVjayA9IHZhbHVlU3RyLnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3QgcGF0dGVyblRvQ2hlY2sgPSBydWxlVmFsdWUgPyBydWxlVmFsdWUudG9Mb3dlckNhc2UoKSA6IFwiXCI7XG5cbiAgICBsZXQgaXNNYXRjaCA9IGZhbHNlO1xuICAgIGxldCBtYXRjaE9iajogUmVnRXhwRXhlY0FycmF5IHwgbnVsbCA9IG51bGw7XG5cbiAgICBzd2l0Y2ggKG9wZXJhdG9yKSB7XG4gICAgICAgIGNhc2UgJ2NvbnRhaW5zJzogaXNNYXRjaCA9IHZhbHVlVG9DaGVjay5pbmNsdWRlcyhwYXR0ZXJuVG9DaGVjayk7IGJyZWFrO1xuICAgICAgICBjYXNlICdkb2VzTm90Q29udGFpbic6IGlzTWF0Y2ggPSAhdmFsdWVUb0NoZWNrLmluY2x1ZGVzKHBhdHRlcm5Ub0NoZWNrKTsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2VxdWFscyc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2sgPT09IHBhdHRlcm5Ub0NoZWNrOyBicmVhaztcbiAgICAgICAgY2FzZSAnc3RhcnRzV2l0aCc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suc3RhcnRzV2l0aChwYXR0ZXJuVG9DaGVjayk7IGJyZWFrO1xuICAgICAgICBjYXNlICdlbmRzV2l0aCc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suZW5kc1dpdGgocGF0dGVyblRvQ2hlY2spOyBicmVhaztcbiAgICAgICAgY2FzZSAnZXhpc3RzJzogaXNNYXRjaCA9IHJhd1ZhbHVlICE9PSB1bmRlZmluZWQ7IGJyZWFrO1xuICAgICAgICBjYXNlICdkb2VzTm90RXhpc3QnOiBpc01hdGNoID0gcmF3VmFsdWUgPT09IHVuZGVmaW5lZDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2lzTnVsbCc6IGlzTWF0Y2ggPSByYXdWYWx1ZSA9PT0gbnVsbDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2lzTm90TnVsbCc6IGlzTWF0Y2ggPSByYXdWYWx1ZSAhPT0gbnVsbDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ21hdGNoZXMnOlxuICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKHJ1bGVWYWx1ZSwgJ2knKTtcbiAgICAgICAgICAgICAgICBtYXRjaE9iaiA9IHJlZ2V4LmV4ZWModmFsdWVTdHIpO1xuICAgICAgICAgICAgICAgIGlzTWF0Y2ggPSAhIW1hdGNoT2JqO1xuICAgICAgICAgICAgIH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHJldHVybiB7IGlzTWF0Y2gsIG1hdGNoT2JqIH07XG59O1xuXG5leHBvcnQgY29uc3QgY2hlY2tDb25kaXRpb24gPSAoY29uZGl0aW9uOiBSdWxlQ29uZGl0aW9uLCB0YWI6IFRhYk1ldGFkYXRhKTogYm9vbGVhbiA9PiB7XG4gICAgaWYgKCFjb25kaXRpb24pIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCByYXdWYWx1ZSA9IGdldEZpZWxkVmFsdWUodGFiLCBjb25kaXRpb24uZmllbGQpO1xuICAgIGNvbnN0IHsgaXNNYXRjaCB9ID0gY2hlY2tWYWx1ZU1hdGNoKGNvbmRpdGlvbi5vcGVyYXRvciwgcmF3VmFsdWUsIGNvbmRpdGlvbi52YWx1ZSk7XG4gICAgcmV0dXJuIGlzTWF0Y2g7XG59O1xuXG5mdW5jdGlvbiBldmFsdWF0ZUxlZ2FjeVJ1bGVzKGxlZ2FjeVJ1bGVzOiBTdHJhdGVneVJ1bGVbXSwgdGFiOiBUYWJNZXRhZGF0YSk6IHN0cmluZyB8IG51bGwge1xuICAgIC8vIERlZmVuc2l2ZSBjaGVja1xuICAgIGlmICghbGVnYWN5UnVsZXMgfHwgIUFycmF5LmlzQXJyYXkobGVnYWN5UnVsZXMpKSB7XG4gICAgICAgIGlmICghbGVnYWN5UnVsZXMpIHJldHVybiBudWxsO1xuICAgICAgICAvLyBUcnkgYXNBcnJheSBpZiBpdCdzIG5vdCBhcnJheSBidXQgdHJ1dGh5ICh1bmxpa2VseSBnaXZlbiBwcmV2aW91cyBsb2dpYyBidXQgc2FmZSlcbiAgICB9XG5cbiAgICBjb25zdCBsZWdhY3lSdWxlc0xpc3QgPSBhc0FycmF5PFN0cmF0ZWd5UnVsZT4obGVnYWN5UnVsZXMpO1xuICAgIGlmIChsZWdhY3lSdWxlc0xpc3QubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcblxuICAgIHRyeSB7XG4gICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBsZWdhY3lSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgIGlmICghcnVsZSkgY29udGludWU7XG4gICAgICAgICAgICBjb25zdCByYXdWYWx1ZSA9IGdldEZpZWxkVmFsdWUodGFiLCBydWxlLmZpZWxkKTtcbiAgICAgICAgICAgIGNvbnN0IHsgaXNNYXRjaCwgbWF0Y2hPYmogfSA9IGNoZWNrVmFsdWVNYXRjaChydWxlLm9wZXJhdG9yLCByYXdWYWx1ZSwgcnVsZS52YWx1ZSk7XG5cbiAgICAgICAgICAgIGlmIChpc01hdGNoKSB7XG4gICAgICAgICAgICAgICAgbGV0IHJlc3VsdCA9IHJ1bGUucmVzdWx0O1xuICAgICAgICAgICAgICAgIGlmIChtYXRjaE9iaikge1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IG1hdGNoT2JqLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UobmV3IFJlZ0V4cChgXFxcXCQke2l9YCwgJ2cnKSwgbWF0Y2hPYmpbaV0gfHwgXCJcIik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGxvZ0RlYnVnKFwiRXJyb3IgZXZhbHVhdGluZyBsZWdhY3kgcnVsZXNcIiwgeyBlcnJvcjogU3RyaW5nKGVycm9yKSB9KTtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbmV4cG9ydCBjb25zdCBnZXRHcm91cGluZ1Jlc3VsdCA9ICh0YWI6IFRhYk1ldGFkYXRhLCBzdHJhdGVneTogR3JvdXBpbmdTdHJhdGVneSB8IHN0cmluZyk6IHsga2V5OiBzdHJpbmcgfCBudWxsLCBtb2RlOiBcImN1cnJlbnRcIiB8IFwibmV3XCIgfCBcImNvbXBvdW5kXCIgfSA9PiB7XG4gIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5KTtcbiAgaWYgKGN1c3RvbSkge1xuICAgICAgY29uc3QgZmlsdGVyR3JvdXBzTGlzdCA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbltdPihjdXN0b20uZmlsdGVyR3JvdXBzKTtcbiAgICAgIGNvbnN0IGZpbHRlcnNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihjdXN0b20uZmlsdGVycyk7XG5cbiAgICAgIGxldCBtYXRjaCA9IGZhbHNlO1xuXG4gICAgICBpZiAoZmlsdGVyR3JvdXBzTGlzdC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgLy8gT1IgbG9naWNcbiAgICAgICAgICBmb3IgKGNvbnN0IGdyb3VwIG9mIGZpbHRlckdyb3Vwc0xpc3QpIHtcbiAgICAgICAgICAgICAgY29uc3QgZ3JvdXBSdWxlcyA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbj4oZ3JvdXApO1xuICAgICAgICAgICAgICBpZiAoZ3JvdXBSdWxlcy5sZW5ndGggPT09IDAgfHwgZ3JvdXBSdWxlcy5ldmVyeShyID0+IGNoZWNrQ29uZGl0aW9uKHIsIHRhYikpKSB7XG4gICAgICAgICAgICAgICAgICBtYXRjaCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoZmlsdGVyc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIC8vIExlZ2FjeS9TaW1wbGUgQU5EIGxvZ2ljXG4gICAgICAgICAgaWYgKGZpbHRlcnNMaXN0LmV2ZXJ5KGYgPT4gY2hlY2tDb25kaXRpb24oZiwgdGFiKSkpIHtcbiAgICAgICAgICAgICAgbWF0Y2ggPSB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gTm8gZmlsdGVycyAtPiBNYXRjaCBhbGxcbiAgICAgICAgICBtYXRjaCA9IHRydWU7XG4gICAgICB9XG5cbiAgICAgIGlmICghbWF0Y2gpIHtcbiAgICAgICAgICByZXR1cm4geyBrZXk6IG51bGwsIG1vZGU6IFwiY3VycmVudFwiIH07XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGdyb3VwaW5nUnVsZXNMaXN0ID0gYXNBcnJheTxHcm91cGluZ1J1bGU+KGN1c3RvbS5ncm91cGluZ1J1bGVzKTtcbiAgICAgIGlmIChncm91cGluZ1J1bGVzTGlzdC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgY29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG4gICAgICAgICAgY29uc3QgbW9kZXM6IHN0cmluZ1tdID0gW107XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cGluZ1J1bGVzTGlzdCkge1xuICAgICAgICAgICAgICAgIGlmICghcnVsZSkgY29udGludWU7XG4gICAgICAgICAgICAgICAgbGV0IHZhbCA9IFwiXCI7XG4gICAgICAgICAgICAgICAgaWYgKHJ1bGUuc291cmNlID09PSAnZmllbGQnKSB7XG4gICAgICAgICAgICAgICAgICAgICBjb25zdCByYXcgPSBnZXRGaWVsZFZhbHVlKHRhYiwgcnVsZS52YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICB2YWwgPSByYXcgIT09IHVuZGVmaW5lZCAmJiByYXcgIT09IG51bGwgPyBTdHJpbmcocmF3KSA6IFwiXCI7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHJ1bGUudmFsdWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHZhbCAmJiBydWxlLnRyYW5zZm9ybSAmJiBydWxlLnRyYW5zZm9ybSAhPT0gJ25vbmUnKSB7XG4gICAgICAgICAgICAgICAgICAgIHN3aXRjaCAocnVsZS50cmFuc2Zvcm0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ3N0cmlwVGxkJzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBzdHJpcFRsZCh2YWwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnbG93ZXJjYXNlJzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSB2YWwudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ3VwcGVyY2FzZSc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gdmFsLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdmaXJzdENoYXInOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHZhbC5jaGFyQXQoMCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdkb21haW4nOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IGRvbWFpbkZyb21VcmwodmFsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ2hvc3RuYW1lJzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gbmV3IFVSTCh2YWwpLmhvc3RuYW1lO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBrZWVwIGFzIGlzICovIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ3JlZ2V4JzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocnVsZS50cmFuc2Zvcm1QYXR0ZXJuKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsZXQgcmVnZXggPSByZWdleENhY2hlLmdldChydWxlLnRyYW5zZm9ybVBhdHRlcm4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFyZWdleCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlZ2V4ID0gbmV3IFJlZ0V4cChydWxlLnRyYW5zZm9ybVBhdHRlcm4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlZ2V4Q2FjaGUuc2V0KHJ1bGUudHJhbnNmb3JtUGF0dGVybiwgcmVnZXgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbWF0Y2ggPSByZWdleC5leGVjKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsZXQgZXh0cmFjdGVkID0gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IG1hdGNoLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4dHJhY3RlZCArPSBtYXRjaFtpXSB8fCBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBleHRyYWN0ZWQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxvZ0RlYnVnKFwiSW52YWxpZCByZWdleCBpbiB0cmFuc2Zvcm1cIiwgeyBwYXR0ZXJuOiBydWxlLnRyYW5zZm9ybVBhdHRlcm4sIGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodmFsKSB7XG4gICAgICAgICAgICAgICAgICAgIHBhcnRzLnB1c2godmFsKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJ1bGUud2luZG93TW9kZSkgbW9kZXMucHVzaChydWxlLndpbmRvd01vZGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgbG9nRGVidWcoXCJFcnJvciBhcHBseWluZyBncm91cGluZyBydWxlc1wiLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHsga2V5OiBwYXJ0cy5qb2luKFwiIC0gXCIpLCBtb2RlOiByZXNvbHZlV2luZG93TW9kZShtb2RlcykgfTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHsga2V5OiBjdXN0b20uZmFsbGJhY2sgfHwgXCJNaXNjXCIsIG1vZGU6IFwiY3VycmVudFwiIH07XG4gICAgICB9IGVsc2UgaWYgKGN1c3RvbS5ydWxlcykge1xuICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGV2YWx1YXRlTGVnYWN5UnVsZXMoYXNBcnJheTxTdHJhdGVneVJ1bGU+KGN1c3RvbS5ydWxlcyksIHRhYik7XG4gICAgICAgICAgaWYgKHJlc3VsdCkgcmV0dXJuIHsga2V5OiByZXN1bHQsIG1vZGU6IFwiY3VycmVudFwiIH07XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7IGtleTogY3VzdG9tLmZhbGxiYWNrIHx8IFwiTWlzY1wiLCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICB9XG5cbiAgLy8gQnVpbHQtaW4gc3RyYXRlZ2llc1xuICBsZXQgc2ltcGxlS2V5OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgc3dpdGNoIChzdHJhdGVneSkge1xuICAgIGNhc2UgXCJkb21haW5cIjpcbiAgICBjYXNlIFwiZG9tYWluX2Z1bGxcIjpcbiAgICAgIHNpbXBsZUtleSA9IGRvbWFpbkZyb21VcmwodGFiLnVybCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwidG9waWNcIjpcbiAgICAgIHNpbXBsZUtleSA9IHNlbWFudGljQnVja2V0KHRhYi50aXRsZSwgdGFiLnVybCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwibGluZWFnZVwiOlxuICAgICAgc2ltcGxlS2V5ID0gbmF2aWdhdGlvbktleSh0YWIpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcImNvbnRleHRcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi5jb250ZXh0IHx8IFwiVW5jYXRlZ29yaXplZFwiO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInBpbm5lZFwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLnBpbm5lZCA/IFwicGlubmVkXCIgOiBcInVucGlubmVkXCI7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwiYWdlXCI6XG4gICAgICBzaW1wbGVLZXkgPSBnZXRSZWNlbmN5TGFiZWwodGFiLmxhc3RBY2Nlc3NlZCA/PyAwKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJ1cmxcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi51cmw7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwidGl0bGVcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi50aXRsZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJyZWNlbmN5XCI6XG4gICAgICBzaW1wbGVLZXkgPSBTdHJpbmcodGFiLmxhc3RBY2Nlc3NlZCA/PyAwKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJuZXN0aW5nXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCA/IFwiY2hpbGRcIiA6IFwicm9vdFwiO1xuICAgICAgYnJlYWs7XG4gICAgZGVmYXVsdDpcbiAgICAgICAgY29uc3QgdmFsID0gZ2V0RmllbGRWYWx1ZSh0YWIsIHN0cmF0ZWd5KTtcbiAgICAgICAgaWYgKHZhbCAhPT0gdW5kZWZpbmVkICYmIHZhbCAhPT0gbnVsbCkge1xuICAgICAgICAgICAgc2ltcGxlS2V5ID0gU3RyaW5nKHZhbCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzaW1wbGVLZXkgPSBcIlVua25vd25cIjtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgfVxuICByZXR1cm4geyBrZXk6IHNpbXBsZUtleSwgbW9kZTogXCJjdXJyZW50XCIgfTtcbn07XG5cbmV4cG9ydCBjb25zdCBncm91cGluZ0tleSA9ICh0YWI6IFRhYk1ldGFkYXRhLCBzdHJhdGVneTogR3JvdXBpbmdTdHJhdGVneSB8IHN0cmluZyk6IHN0cmluZyB8IG51bGwgPT4ge1xuICAgIHJldHVybiBnZXRHcm91cGluZ1Jlc3VsdCh0YWIsIHN0cmF0ZWd5KS5rZXk7XG59O1xuXG5mdW5jdGlvbiBpc0NvbnRleHRGaWVsZChmaWVsZDogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIGZpZWxkID09PSAnY29udGV4dCcgfHwgZmllbGQgPT09ICdnZW5yZScgfHwgZmllbGQgPT09ICdzaXRlTmFtZScgfHwgZmllbGQuc3RhcnRzV2l0aCgnY29udGV4dERhdGEuJyk7XG59XG5cbmV4cG9ydCBjb25zdCByZXF1aXJlc0NvbnRleHRBbmFseXNpcyA9IChzdHJhdGVneUlkczogKHN0cmluZyB8IFNvcnRpbmdTdHJhdGVneSlbXSk6IGJvb2xlYW4gPT4ge1xuICAgIC8vIENoZWNrIGlmIFwiY29udGV4dFwiIHN0cmF0ZWd5IGlzIGV4cGxpY2l0bHkgcmVxdWVzdGVkXG4gICAgaWYgKHN0cmF0ZWd5SWRzLmluY2x1ZGVzKFwiY29udGV4dFwiKSkgcmV0dXJuIHRydWU7XG5cbiAgICBjb25zdCBzdHJhdGVnaWVzID0gZ2V0U3RyYXRlZ2llcyhjdXN0b21TdHJhdGVnaWVzKTtcbiAgICAvLyBmaWx0ZXIgb25seSB0aG9zZSB0aGF0IG1hdGNoIHRoZSByZXF1ZXN0ZWQgSURzXG4gICAgY29uc3QgYWN0aXZlRGVmcyA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gc3RyYXRlZ3lJZHMuaW5jbHVkZXMocy5pZCkpO1xuXG4gICAgZm9yIChjb25zdCBkZWYgb2YgYWN0aXZlRGVmcykge1xuICAgICAgICAvLyBJZiBpdCdzIGEgYnVpbHQtaW4gc3RyYXRlZ3kgdGhhdCBuZWVkcyBjb250ZXh0IChvbmx5ICdjb250ZXh0JyBkb2VzKVxuICAgICAgICBpZiAoZGVmLmlkID09PSAnY29udGV4dCcpIHJldHVybiB0cnVlO1xuXG4gICAgICAgIC8vIElmIGl0IGlzIGEgY3VzdG9tIHN0cmF0ZWd5IChvciBvdmVycmlkZXMgYnVpbHQtaW4pLCBjaGVjayBpdHMgcnVsZXNcbiAgICAgICAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRlZ2llcy5maW5kKGMgPT4gYy5pZCA9PT0gZGVmLmlkKTtcbiAgICAgICAgaWYgKGN1c3RvbSkge1xuICAgICAgICAgICAgIGNvbnN0IGdyb3VwUnVsZXNMaXN0ID0gYXNBcnJheTxHcm91cGluZ1J1bGU+KGN1c3RvbS5ncm91cGluZ1J1bGVzKTtcbiAgICAgICAgICAgICBjb25zdCBzb3J0UnVsZXNMaXN0ID0gYXNBcnJheTxTb3J0aW5nUnVsZT4oY3VzdG9tLnNvcnRpbmdSdWxlcyk7XG4gICAgICAgICAgICAgY29uc3QgZ3JvdXBTb3J0UnVsZXNMaXN0ID0gYXNBcnJheTxTb3J0aW5nUnVsZT4oY3VzdG9tLmdyb3VwU29ydGluZ1J1bGVzKTtcbiAgICAgICAgICAgICBjb25zdCBmaWx0ZXJzTGlzdCA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbj4oY3VzdG9tLmZpbHRlcnMpO1xuICAgICAgICAgICAgIGNvbnN0IGZpbHRlckdyb3Vwc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb25bXT4oY3VzdG9tLmZpbHRlckdyb3Vwcyk7XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZ3JvdXBSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgcnVsZS5zb3VyY2UgPT09ICdmaWVsZCcgJiYgaXNDb250ZXh0RmllbGQocnVsZS52YWx1ZSkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBydWxlLmNvbG9yID09PSAnZmllbGQnICYmIHJ1bGUuY29sb3JGaWVsZCAmJiBpc0NvbnRleHRGaWVsZChydWxlLmNvbG9yRmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2Ygc29ydFJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBpc0NvbnRleHRGaWVsZChydWxlLmZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwU29ydFJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBpc0NvbnRleHRGaWVsZChydWxlLmZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGZpbHRlcnNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IGdyb3VwIG9mIGZpbHRlckdyb3Vwc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgY29uc3QgZ3JvdXBSdWxlcyA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbj4oZ3JvdXApO1xuICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZ3JvdXBSdWxlcykge1xuICAgICAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbn07XG4iLCAiaW1wb3J0IHsgU29ydGluZ1N0cmF0ZWd5LCBUYWJNZXRhZGF0YSwgQ3VzdG9tU3RyYXRlZ3ksIFNvcnRpbmdSdWxlIH0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgZG9tYWluRnJvbVVybCwgc2VtYW50aWNCdWNrZXQsIG5hdmlnYXRpb25LZXksIGdyb3VwaW5nS2V5LCBnZXRGaWVsZFZhbHVlLCBnZXRDdXN0b21TdHJhdGVnaWVzIH0gZnJvbSBcIi4vZ3JvdXBpbmdTdHJhdGVnaWVzLmpzXCI7XG5pbXBvcnQgeyBsb2dEZWJ1ZyB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBhc0FycmF5IH0gZnJvbSBcIi4uL3NoYXJlZC91dGlscy5qc1wiO1xuXG5leHBvcnQgY29uc3QgcmVjZW5jeVNjb3JlID0gKHRhYjogVGFiTWV0YWRhdGEpID0+IHRhYi5sYXN0QWNjZXNzZWQgPz8gMDtcbmV4cG9ydCBjb25zdCBoaWVyYXJjaHlTY29yZSA9ICh0YWI6IFRhYk1ldGFkYXRhKSA9PiAodGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQgPyAxIDogMCk7XG5leHBvcnQgY29uc3QgcGlubmVkU2NvcmUgPSAodGFiOiBUYWJNZXRhZGF0YSkgPT4gKHRhYi5waW5uZWQgPyAwIDogMSk7XG5cbmV4cG9ydCBjb25zdCBzb3J0VGFicyA9ICh0YWJzOiBUYWJNZXRhZGF0YVtdLCBzdHJhdGVnaWVzOiBTb3J0aW5nU3RyYXRlZ3lbXSk6IFRhYk1ldGFkYXRhW10gPT4ge1xuICBjb25zdCBzY29yaW5nOiBTb3J0aW5nU3RyYXRlZ3lbXSA9IHN0cmF0ZWdpZXMubGVuZ3RoID8gc3RyYXRlZ2llcyA6IFtcInBpbm5lZFwiLCBcInJlY2VuY3lcIl07XG4gIHJldHVybiBbLi4udGFic10uc29ydCgoYSwgYikgPT4ge1xuICAgIGZvciAoY29uc3Qgc3RyYXRlZ3kgb2Ygc2NvcmluZykge1xuICAgICAgY29uc3QgZGlmZiA9IGNvbXBhcmVCeShzdHJhdGVneSwgYSwgYik7XG4gICAgICBpZiAoZGlmZiAhPT0gMCkgcmV0dXJuIGRpZmY7XG4gICAgfVxuICAgIHJldHVybiBhLmlkIC0gYi5pZDtcbiAgfSk7XG59O1xuXG5leHBvcnQgY29uc3QgY29tcGFyZUJ5ID0gKHN0cmF0ZWd5OiBTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmcsIGE6IFRhYk1ldGFkYXRhLCBiOiBUYWJNZXRhZGF0YSk6IG51bWJlciA9PiB7XG4gIC8vIDEuIENoZWNrIEN1c3RvbSBTdHJhdGVnaWVzIGZvciBTb3J0aW5nIFJ1bGVzXG4gIGNvbnN0IGN1c3RvbVN0cmF0cyA9IGdldEN1c3RvbVN0cmF0ZWdpZXMoKTtcbiAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneSk7XG4gIGlmIChjdXN0b20pIHtcbiAgICAgIGNvbnN0IHNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihjdXN0b20uc29ydGluZ1J1bGVzKTtcbiAgICAgIGlmIChzb3J0UnVsZXNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAvLyBFdmFsdWF0ZSBjdXN0b20gc29ydGluZyBydWxlcyBpbiBvcmRlclxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBzb3J0UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgICBpZiAoIXJ1bGUpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgY29uc3QgdmFsQSA9IGdldEZpZWxkVmFsdWUoYSwgcnVsZS5maWVsZCk7XG4gICAgICAgICAgICAgICAgICBjb25zdCB2YWxCID0gZ2V0RmllbGRWYWx1ZShiLCBydWxlLmZpZWxkKTtcblxuICAgICAgICAgICAgICAgICAgbGV0IHJlc3VsdCA9IDA7XG4gICAgICAgICAgICAgICAgICBpZiAodmFsQSA8IHZhbEIpIHJlc3VsdCA9IC0xO1xuICAgICAgICAgICAgICAgICAgZWxzZSBpZiAodmFsQSA+IHZhbEIpIHJlc3VsdCA9IDE7XG5cbiAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQgIT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcnVsZS5vcmRlciA9PT0gJ2Rlc2MnID8gLXJlc3VsdCA6IHJlc3VsdDtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgbG9nRGVidWcoXCJFcnJvciBldmFsdWF0aW5nIGN1c3RvbSBzb3J0aW5nIHJ1bGVzXCIsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gSWYgYWxsIHJ1bGVzIGVxdWFsLCBjb250aW51ZSB0byBuZXh0IHN0cmF0ZWd5IChyZXR1cm4gMClcbiAgICAgICAgICByZXR1cm4gMDtcbiAgICAgIH1cbiAgfVxuXG4gIC8vIDIuIEJ1aWx0LWluIG9yIGZhbGxiYWNrXG4gIHN3aXRjaCAoc3RyYXRlZ3kpIHtcbiAgICBjYXNlIFwicmVjZW5jeVwiOlxuICAgICAgcmV0dXJuIChiLmxhc3RBY2Nlc3NlZCA/PyAwKSAtIChhLmxhc3RBY2Nlc3NlZCA/PyAwKTtcbiAgICBjYXNlIFwibmVzdGluZ1wiOiAvLyBGb3JtZXJseSBoaWVyYXJjaHlcbiAgICAgIHJldHVybiBoaWVyYXJjaHlTY29yZShhKSAtIGhpZXJhcmNoeVNjb3JlKGIpO1xuICAgIGNhc2UgXCJwaW5uZWRcIjpcbiAgICAgIHJldHVybiBwaW5uZWRTY29yZShhKSAtIHBpbm5lZFNjb3JlKGIpO1xuICAgIGNhc2UgXCJ0aXRsZVwiOlxuICAgICAgcmV0dXJuIGEudGl0bGUubG9jYWxlQ29tcGFyZShiLnRpdGxlKTtcbiAgICBjYXNlIFwidXJsXCI6XG4gICAgICByZXR1cm4gYS51cmwubG9jYWxlQ29tcGFyZShiLnVybCk7XG4gICAgY2FzZSBcImNvbnRleHRcIjpcbiAgICAgIHJldHVybiAoYS5jb250ZXh0ID8/IFwiXCIpLmxvY2FsZUNvbXBhcmUoYi5jb250ZXh0ID8/IFwiXCIpO1xuICAgIGNhc2UgXCJkb21haW5cIjpcbiAgICBjYXNlIFwiZG9tYWluX2Z1bGxcIjpcbiAgICAgIHJldHVybiBkb21haW5Gcm9tVXJsKGEudXJsKS5sb2NhbGVDb21wYXJlKGRvbWFpbkZyb21VcmwoYi51cmwpKTtcbiAgICBjYXNlIFwidG9waWNcIjpcbiAgICAgIHJldHVybiBzZW1hbnRpY0J1Y2tldChhLnRpdGxlLCBhLnVybCkubG9jYWxlQ29tcGFyZShzZW1hbnRpY0J1Y2tldChiLnRpdGxlLCBiLnVybCkpO1xuICAgIGNhc2UgXCJsaW5lYWdlXCI6XG4gICAgICByZXR1cm4gbmF2aWdhdGlvbktleShhKS5sb2NhbGVDb21wYXJlKG5hdmlnYXRpb25LZXkoYikpO1xuICAgIGNhc2UgXCJhZ2VcIjpcbiAgICAgIC8vIFJldmVyc2UgYWxwaGFiZXRpY2FsIGZvciBhZ2UgYnVja2V0cyAoVG9kYXkgPCBZZXN0ZXJkYXkpLCByb3VnaCBhcHByb3hcbiAgICAgIHJldHVybiAoZ3JvdXBpbmdLZXkoYSwgXCJhZ2VcIikgfHwgXCJcIikubG9jYWxlQ29tcGFyZShncm91cGluZ0tleShiLCBcImFnZVwiKSB8fCBcIlwiKTtcbiAgICBkZWZhdWx0OlxuICAgICAgLy8gQ2hlY2sgaWYgaXQncyBhIGdlbmVyaWMgZmllbGQgZmlyc3RcbiAgICAgIGNvbnN0IHZhbEEgPSBnZXRGaWVsZFZhbHVlKGEsIHN0cmF0ZWd5KTtcbiAgICAgIGNvbnN0IHZhbEIgPSBnZXRGaWVsZFZhbHVlKGIsIHN0cmF0ZWd5KTtcblxuICAgICAgaWYgKHZhbEEgIT09IHVuZGVmaW5lZCAmJiB2YWxCICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBpZiAodmFsQSA8IHZhbEIpIHJldHVybiAtMTtcbiAgICAgICAgICBpZiAodmFsQSA+IHZhbEIpIHJldHVybiAxO1xuICAgICAgICAgIHJldHVybiAwO1xuICAgICAgfVxuXG4gICAgICAvLyBGYWxsYmFjayBmb3IgY3VzdG9tIHN0cmF0ZWdpZXMgZ3JvdXBpbmcga2V5IChpZiB1c2luZyBjdXN0b20gc3RyYXRlZ3kgYXMgc29ydGluZyBidXQgbm8gc29ydGluZyBydWxlcyBkZWZpbmVkKVxuICAgICAgLy8gb3IgdW5oYW5kbGVkIGJ1aWx0LWluc1xuICAgICAgcmV0dXJuIChncm91cGluZ0tleShhLCBzdHJhdGVneSkgfHwgXCJcIikubG9jYWxlQ29tcGFyZShncm91cGluZ0tleShiLCBzdHJhdGVneSkgfHwgXCJcIik7XG4gIH1cbn07XG4iLCAiLy8gbG9naWMudHNcbi8vIFB1cmUgZnVuY3Rpb25zIGZvciBleHRyYWN0aW9uIGxvZ2ljXG5cbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVVcmwodXJsU3RyOiBzdHJpbmcpOiBzdHJpbmcge1xuICB0cnkge1xuICAgIGNvbnN0IHVybCA9IG5ldyBVUkwodXJsU3RyKTtcbiAgICBjb25zdCBwYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHVybC5zZWFyY2gpO1xuICAgIGNvbnN0IGtleXM6IHN0cmluZ1tdID0gW107XG4gICAgcGFyYW1zLmZvckVhY2goKF8sIGtleSkgPT4ga2V5cy5wdXNoKGtleSkpO1xuICAgIGNvbnN0IGhvc3RuYW1lID0gdXJsLmhvc3RuYW1lLnJlcGxhY2UoL153d3dcXC4vLCAnJyk7XG5cbiAgICBjb25zdCBUUkFDS0lORyA9IFsvXnV0bV8vLCAvXmZiY2xpZCQvLCAvXmdjbGlkJC8sIC9eX2dhJC8sIC9ecmVmJC8sIC9eeWNsaWQkLywgL15faHMvXTtcbiAgICBjb25zdCBpc1lvdXR1YmUgPSBob3N0bmFtZS5lbmRzV2l0aCgneW91dHViZS5jb20nKSB8fCBob3N0bmFtZS5lbmRzV2l0aCgneW91dHUuYmUnKTtcbiAgICBjb25zdCBpc0dvb2dsZSA9IGhvc3RuYW1lLmVuZHNXaXRoKCdnb29nbGUuY29tJyk7XG5cbiAgICBjb25zdCBrZWVwOiBzdHJpbmdbXSA9IFtdO1xuICAgIGlmIChpc1lvdXR1YmUpIGtlZXAucHVzaCgndicsICdsaXN0JywgJ3QnLCAnYycsICdjaGFubmVsJywgJ3BsYXlsaXN0Jyk7XG4gICAgaWYgKGlzR29vZ2xlKSBrZWVwLnB1c2goJ3EnLCAnaWQnLCAnc291cmNlaWQnKTtcblxuICAgIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICAgIGlmIChUUkFDS0lORy5zb21lKHIgPT4gci50ZXN0KGtleSkpKSB7XG4gICAgICAgICBwYXJhbXMuZGVsZXRlKGtleSk7XG4gICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICgoaXNZb3V0dWJlIHx8IGlzR29vZ2xlKSAmJiAha2VlcC5pbmNsdWRlcyhrZXkpKSB7XG4gICAgICAgICBwYXJhbXMuZGVsZXRlKGtleSk7XG4gICAgICB9XG4gICAgfVxuICAgIHVybC5zZWFyY2ggPSBwYXJhbXMudG9TdHJpbmcoKTtcbiAgICByZXR1cm4gdXJsLnRvU3RyaW5nKCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICByZXR1cm4gdXJsU3RyO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVlvdVR1YmVVcmwodXJsU3RyOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHVybFN0cik7XG4gICAgICAgIGNvbnN0IHYgPSB1cmwuc2VhcmNoUGFyYW1zLmdldCgndicpO1xuICAgICAgICBjb25zdCBpc1Nob3J0cyA9IHVybC5wYXRobmFtZS5pbmNsdWRlcygnL3Nob3J0cy8nKTtcbiAgICAgICAgbGV0IHZpZGVvSWQgPVxuICAgICAgICAgIHYgfHxcbiAgICAgICAgICAoaXNTaG9ydHMgPyB1cmwucGF0aG5hbWUuc3BsaXQoJy9zaG9ydHMvJylbMV0gOiBudWxsKSB8fFxuICAgICAgICAgICh1cmwuaG9zdG5hbWUgPT09ICd5b3V0dS5iZScgPyB1cmwucGF0aG5hbWUucmVwbGFjZSgnLycsICcnKSA6IG51bGwpO1xuXG4gICAgICAgIGNvbnN0IHBsYXlsaXN0SWQgPSB1cmwuc2VhcmNoUGFyYW1zLmdldCgnbGlzdCcpO1xuICAgICAgICBjb25zdCBwbGF5bGlzdEluZGV4ID0gcGFyc2VJbnQodXJsLnNlYXJjaFBhcmFtcy5nZXQoJ2luZGV4JykgfHwgJzAnLCAxMCk7XG5cbiAgICAgICAgcmV0dXJuIHsgdmlkZW9JZCwgaXNTaG9ydHMsIHBsYXlsaXN0SWQsIHBsYXlsaXN0SW5kZXggfTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHJldHVybiB7IHZpZGVvSWQ6IG51bGwsIGlzU2hvcnRzOiBmYWxzZSwgcGxheWxpc3RJZDogbnVsbCwgcGxheWxpc3RJbmRleDogbnVsbCB9O1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RKc29uTGRGaWVsZHMoanNvbkxkOiBhbnlbXSkge1xuICAgIGxldCBhdXRob3I6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgIGxldCBwdWJsaXNoZWRBdDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgbGV0IG1vZGlmaWVkQXQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgIGxldCB0YWdzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGxldCBicmVhZGNydW1iczogc3RyaW5nW10gPSBbXTtcblxuICAgIC8vIEZpbmQgbWFpbiBlbnRpdHlcbiAgICAvLyBBZGRlZCBzYWZldHkgY2hlY2s6IGkgJiYgaVsnQHR5cGUnXVxuICAgIGNvbnN0IG1haW5FbnRpdHkgPSBqc29uTGQuZmluZChpID0+IGkgJiYgKGlbJ0B0eXBlJ10gPT09ICdBcnRpY2xlJyB8fCBpWydAdHlwZSddID09PSAnVmlkZW9PYmplY3QnIHx8IGlbJ0B0eXBlJ10gPT09ICdOZXdzQXJ0aWNsZScpKSB8fCBqc29uTGRbMF07XG5cbiAgICBpZiAobWFpbkVudGl0eSkge1xuICAgICAgIGlmIChtYWluRW50aXR5LmF1dGhvcikge1xuICAgICAgICAgIGlmICh0eXBlb2YgbWFpbkVudGl0eS5hdXRob3IgPT09ICdzdHJpbmcnKSBhdXRob3IgPSBtYWluRW50aXR5LmF1dGhvcjtcbiAgICAgICAgICBlbHNlIGlmIChtYWluRW50aXR5LmF1dGhvci5uYW1lKSBhdXRob3IgPSBtYWluRW50aXR5LmF1dGhvci5uYW1lO1xuICAgICAgICAgIGVsc2UgaWYgKEFycmF5LmlzQXJyYXkobWFpbkVudGl0eS5hdXRob3IpICYmIG1haW5FbnRpdHkuYXV0aG9yWzBdPy5uYW1lKSBhdXRob3IgPSBtYWluRW50aXR5LmF1dGhvclswXS5uYW1lO1xuICAgICAgIH1cbiAgICAgICBpZiAobWFpbkVudGl0eS5kYXRlUHVibGlzaGVkKSBwdWJsaXNoZWRBdCA9IG1haW5FbnRpdHkuZGF0ZVB1Ymxpc2hlZDtcbiAgICAgICBpZiAobWFpbkVudGl0eS5kYXRlTW9kaWZpZWQpIG1vZGlmaWVkQXQgPSBtYWluRW50aXR5LmRhdGVNb2RpZmllZDtcbiAgICAgICBpZiAobWFpbkVudGl0eS5rZXl3b3Jkcykge1xuICAgICAgICAgaWYgKHR5cGVvZiBtYWluRW50aXR5LmtleXdvcmRzID09PSAnc3RyaW5nJykgdGFncyA9IG1haW5FbnRpdHkua2V5d29yZHMuc3BsaXQoJywnKS5tYXAoKHM6IHN0cmluZykgPT4gcy50cmltKCkpO1xuICAgICAgICAgZWxzZSBpZiAoQXJyYXkuaXNBcnJheShtYWluRW50aXR5LmtleXdvcmRzKSkgdGFncyA9IG1haW5FbnRpdHkua2V5d29yZHM7XG4gICAgICAgfVxuICAgIH1cblxuICAgIC8vIEFkZGVkIHNhZmV0eSBjaGVjazogaSAmJiBpWydAdHlwZSddXG4gICAgY29uc3QgYnJlYWRjcnVtYkxkID0ganNvbkxkLmZpbmQoaSA9PiBpICYmIGlbJ0B0eXBlJ10gPT09ICdCcmVhZGNydW1iTGlzdCcpO1xuICAgIGlmIChicmVhZGNydW1iTGQgJiYgQXJyYXkuaXNBcnJheShicmVhZGNydW1iTGQuaXRlbUxpc3RFbGVtZW50KSkge1xuICAgICAgIGNvbnN0IGxpc3QgPSBicmVhZGNydW1iTGQuaXRlbUxpc3RFbGVtZW50LnNvcnQoKGE6IGFueSwgYjogYW55KSA9PiBhLnBvc2l0aW9uIC0gYi5wb3NpdGlvbik7XG4gICAgICAgbGlzdC5mb3JFYWNoKChpdGVtOiBhbnkpID0+IHtcbiAgICAgICAgIGlmIChpdGVtLm5hbWUpIGJyZWFkY3J1bWJzLnB1c2goaXRlbS5uYW1lKTtcbiAgICAgICAgIGVsc2UgaWYgKGl0ZW0uaXRlbSAmJiBpdGVtLml0ZW0ubmFtZSkgYnJlYWRjcnVtYnMucHVzaChpdGVtLml0ZW0ubmFtZSk7XG4gICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgYXV0aG9yLCBwdWJsaXNoZWRBdCwgbW9kaWZpZWRBdCwgdGFncywgYnJlYWRjcnVtYnMgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RZb3VUdWJlQ2hhbm5lbEZyb21IdG1sKGh0bWw6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuICAvLyAxLiBUcnkgSlNPTi1MRFxuICAvLyBMb29rIGZvciA8c2NyaXB0IHR5cGU9XCJhcHBsaWNhdGlvbi9sZCtqc29uXCI+Li4uPC9zY3JpcHQ+XG4gIC8vIFdlIG5lZWQgdG8gbG9vcCBiZWNhdXNlIHRoZXJlIG1pZ2h0IGJlIG11bHRpcGxlIHNjcmlwdHNcbiAgY29uc3Qgc2NyaXB0UmVnZXggPSAvPHNjcmlwdFxccyt0eXBlPVtcIiddYXBwbGljYXRpb25cXC9sZFxcK2pzb25bXCInXVtePl0qPihbXFxzXFxTXSo/KTxcXC9zY3JpcHQ+L2dpO1xuICBsZXQgbWF0Y2g7XG4gIHdoaWxlICgobWF0Y2ggPSBzY3JpcHRSZWdleC5leGVjKGh0bWwpKSAhPT0gbnVsbCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBqc29uID0gSlNPTi5wYXJzZShtYXRjaFsxXSk7XG4gICAgICAgICAgY29uc3QgYXJyYXkgPSBBcnJheS5pc0FycmF5KGpzb24pID8ganNvbiA6IFtqc29uXTtcbiAgICAgICAgICBjb25zdCBmaWVsZHMgPSBleHRyYWN0SnNvbkxkRmllbGRzKGFycmF5KTtcbiAgICAgICAgICBpZiAoZmllbGRzLmF1dGhvcikgcmV0dXJuIGZpZWxkcy5hdXRob3I7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgLy8gaWdub3JlIHBhcnNlIGVycm9yc1xuICAgICAgfVxuICB9XG5cbiAgLy8gMi4gVHJ5IDxsaW5rIGl0ZW1wcm9wPVwibmFtZVwiIGNvbnRlbnQ9XCIuLi5cIj4gKFlvdVR1YmUgb2Z0ZW4gcHV0cyBjaGFubmVsIG5hbWUgaGVyZSBpbiBzb21lIGNvbnRleHRzKVxuICAvLyBPciA8bWV0YSBpdGVtcHJvcD1cImNoYW5uZWxJZFwiIGNvbnRlbnQ9XCIuLi5cIj4gLT4gYnV0IHRoYXQncyBJRC5cbiAgLy8gPGxpbmsgaXRlbXByb3A9XCJuYW1lXCIgY29udGVudD1cIkNoYW5uZWwgTmFtZVwiPlxuICAvLyA8c3BhbiBpdGVtcHJvcD1cImF1dGhvclwiIGl0ZW1zY29wZSBpdGVtdHlwZT1cImh0dHA6Ly9zY2hlbWEub3JnL1BlcnNvblwiPjxsaW5rIGl0ZW1wcm9wPVwibmFtZVwiIGNvbnRlbnQ9XCJDaGFubmVsIE5hbWVcIj48L3NwYW4+XG4gIGNvbnN0IGxpbmtOYW1lUmVnZXggPSAvPGxpbmtcXHMraXRlbXByb3A9W1wiJ11uYW1lW1wiJ11cXHMrY29udGVudD1bXCInXShbXlwiJ10rKVtcIiddXFxzKlxcLz8+L2k7XG4gIGNvbnN0IGxpbmtNYXRjaCA9IGxpbmtOYW1lUmVnZXguZXhlYyhodG1sKTtcbiAgaWYgKGxpbmtNYXRjaCAmJiBsaW5rTWF0Y2hbMV0pIHJldHVybiBkZWNvZGVIdG1sRW50aXRpZXMobGlua01hdGNoWzFdKTtcblxuICAvLyAzLiBUcnkgbWV0YSBhdXRob3JcbiAgY29uc3QgbWV0YUF1dGhvclJlZ2V4ID0gLzxtZXRhXFxzK25hbWU9W1wiJ11hdXRob3JbXCInXVxccytjb250ZW50PVtcIiddKFteXCInXSspW1wiJ11cXHMqXFwvPz4vaTtcbiAgY29uc3QgbWV0YU1hdGNoID0gbWV0YUF1dGhvclJlZ2V4LmV4ZWMoaHRtbCk7XG4gIGlmIChtZXRhTWF0Y2ggJiYgbWV0YU1hdGNoWzFdKSB7XG4gICAgICAvLyBZb3VUdWJlIG1ldGEgYXV0aG9yIGlzIG9mdGVuIFwiQ2hhbm5lbCBOYW1lXCJcbiAgICAgIHJldHVybiBkZWNvZGVIdG1sRW50aXRpZXMobWV0YU1hdGNoWzFdKTtcbiAgfVxuXG4gIHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXh0cmFjdFlvdVR1YmVHZW5yZUZyb21IdG1sKGh0bWw6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuICAvLyAxLiBUcnkgPG1ldGEgaXRlbXByb3A9XCJnZW5yZVwiIGNvbnRlbnQ9XCIuLi5cIj5cbiAgY29uc3QgbWV0YUdlbnJlUmVnZXggPSAvPG1ldGFcXHMraXRlbXByb3A9W1wiJ11nZW5yZVtcIiddXFxzK2NvbnRlbnQ9W1wiJ10oW15cIiddKylbXCInXVxccypcXC8/Pi9pO1xuICBjb25zdCBtZXRhTWF0Y2ggPSBtZXRhR2VucmVSZWdleC5leGVjKGh0bWwpO1xuICBpZiAobWV0YU1hdGNoICYmIG1ldGFNYXRjaFsxXSkge1xuICAgICAgcmV0dXJuIGRlY29kZUh0bWxFbnRpdGllcyhtZXRhTWF0Y2hbMV0pO1xuICB9XG5cbiAgLy8gMi4gVHJ5IEpTT04gXCJjYXRlZ29yeVwiIGluIHNjcmlwdHNcbiAgLy8gXCJjYXRlZ29yeVwiOlwiR2FtaW5nXCJcbiAgY29uc3QgY2F0ZWdvcnlSZWdleCA9IC9cImNhdGVnb3J5XCJcXHMqOlxccypcIihbXlwiXSspXCIvO1xuICBjb25zdCBjYXRNYXRjaCA9IGNhdGVnb3J5UmVnZXguZXhlYyhodG1sKTtcbiAgaWYgKGNhdE1hdGNoICYmIGNhdE1hdGNoWzFdKSB7XG4gICAgICByZXR1cm4gZGVjb2RlSHRtbEVudGl0aWVzKGNhdE1hdGNoWzFdKTtcbiAgfVxuXG4gIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBkZWNvZGVIdG1sRW50aXRpZXModGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgaWYgKCF0ZXh0KSByZXR1cm4gdGV4dDtcblxuICBjb25zdCBlbnRpdGllczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICAnJmFtcDsnOiAnJicsXG4gICAgJyZsdDsnOiAnPCcsXG4gICAgJyZndDsnOiAnPicsXG4gICAgJyZxdW90Oyc6ICdcIicsXG4gICAgJyYjMzk7JzogXCInXCIsXG4gICAgJyZhcG9zOyc6IFwiJ1wiLFxuICAgICcmbmJzcDsnOiAnICdcbiAgfTtcblxuICByZXR1cm4gdGV4dC5yZXBsYWNlKC8mKFthLXowLTldK3wjWzAtOV17MSw2fXwjeFswLTlhLWZBLUZdezEsNn0pOy9pZywgKG1hdGNoKSA9PiB7XG4gICAgICBjb25zdCBsb3dlciA9IG1hdGNoLnRvTG93ZXJDYXNlKCk7XG4gICAgICBpZiAoZW50aXRpZXNbbG93ZXJdKSByZXR1cm4gZW50aXRpZXNbbG93ZXJdO1xuICAgICAgaWYgKGVudGl0aWVzW21hdGNoXSkgcmV0dXJuIGVudGl0aWVzW21hdGNoXTtcblxuICAgICAgaWYgKGxvd2VyLnN0YXJ0c1dpdGgoJyYjeCcpKSB7XG4gICAgICAgICAgdHJ5IHsgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUocGFyc2VJbnQobG93ZXIuc2xpY2UoMywgLTEpLCAxNikpOyB9IGNhdGNoIHsgcmV0dXJuIG1hdGNoOyB9XG4gICAgICB9XG4gICAgICBpZiAobG93ZXIuc3RhcnRzV2l0aCgnJiMnKSkge1xuICAgICAgICAgIHRyeSB7IHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlKHBhcnNlSW50KGxvd2VyLnNsaWNlKDIsIC0xKSwgMTApKTsgfSBjYXRjaCB7IHJldHVybiBtYXRjaDsgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIG1hdGNoO1xuICB9KTtcbn1cbiIsICJcbmV4cG9ydCBjb25zdCBHRU5FUkFfUkVHSVNUUlk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gIC8vIFNlYXJjaFxuICAnZ29vZ2xlLmNvbSc6ICdTZWFyY2gnLFxuICAnYmluZy5jb20nOiAnU2VhcmNoJyxcbiAgJ2R1Y2tkdWNrZ28uY29tJzogJ1NlYXJjaCcsXG4gICd5YWhvby5jb20nOiAnU2VhcmNoJyxcbiAgJ2JhaWR1LmNvbSc6ICdTZWFyY2gnLFxuICAneWFuZGV4LmNvbSc6ICdTZWFyY2gnLFxuICAna2FnaS5jb20nOiAnU2VhcmNoJyxcbiAgJ2Vjb3NpYS5vcmcnOiAnU2VhcmNoJyxcblxuICAvLyBTb2NpYWxcbiAgJ2ZhY2Vib29rLmNvbSc6ICdTb2NpYWwnLFxuICAndHdpdHRlci5jb20nOiAnU29jaWFsJyxcbiAgJ3guY29tJzogJ1NvY2lhbCcsXG4gICdpbnN0YWdyYW0uY29tJzogJ1NvY2lhbCcsXG4gICdsaW5rZWRpbi5jb20nOiAnU29jaWFsJyxcbiAgJ3JlZGRpdC5jb20nOiAnU29jaWFsJyxcbiAgJ3Rpa3Rvay5jb20nOiAnU29jaWFsJyxcbiAgJ3BpbnRlcmVzdC5jb20nOiAnU29jaWFsJyxcbiAgJ3NuYXBjaGF0LmNvbSc6ICdTb2NpYWwnLFxuICAndHVtYmxyLmNvbSc6ICdTb2NpYWwnLFxuICAndGhyZWFkcy5uZXQnOiAnU29jaWFsJyxcbiAgJ2JsdWVza3kuYXBwJzogJ1NvY2lhbCcsXG4gICdtYXN0b2Rvbi5zb2NpYWwnOiAnU29jaWFsJyxcblxuICAvLyBWaWRlb1xuICAneW91dHViZS5jb20nOiAnVmlkZW8nLFxuICAneW91dHUuYmUnOiAnVmlkZW8nLFxuICAndmltZW8uY29tJzogJ1ZpZGVvJyxcbiAgJ3R3aXRjaC50dic6ICdWaWRlbycsXG4gICduZXRmbGl4LmNvbSc6ICdWaWRlbycsXG4gICdodWx1LmNvbSc6ICdWaWRlbycsXG4gICdkaXNuZXlwbHVzLmNvbSc6ICdWaWRlbycsXG4gICdkYWlseW1vdGlvbi5jb20nOiAnVmlkZW8nLFxuICAncHJpbWV2aWRlby5jb20nOiAnVmlkZW8nLFxuICAnaGJvbWF4LmNvbSc6ICdWaWRlbycsXG4gICdtYXguY29tJzogJ1ZpZGVvJyxcbiAgJ3BlYWNvY2t0di5jb20nOiAnVmlkZW8nLFxuXG4gIC8vIERldmVsb3BtZW50XG4gICdnaXRodWIuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2dpdGxhYi5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnc3RhY2tvdmVyZmxvdy5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnbnBtanMuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ3B5cGkub3JnJzogJ0RldmVsb3BtZW50JyxcbiAgJ2RldmVsb3Blci5tb3ppbGxhLm9yZyc6ICdEZXZlbG9wbWVudCcsXG4gICd3M3NjaG9vbHMuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2dlZWtzZm9yZ2Vla3Mub3JnJzogJ0RldmVsb3BtZW50JyxcbiAgJ2ppcmEuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2F0bGFzc2lhbi5uZXQnOiAnRGV2ZWxvcG1lbnQnLCAvLyBvZnRlbiBqaXJhXG4gICdiaXRidWNrZXQub3JnJzogJ0RldmVsb3BtZW50JyxcbiAgJ2Rldi50byc6ICdEZXZlbG9wbWVudCcsXG4gICdoYXNobm9kZS5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnbWVkaXVtLmNvbSc6ICdEZXZlbG9wbWVudCcsIC8vIEdlbmVyYWwgYnV0IG9mdGVuIGRldlxuICAndmVyY2VsLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICduZXRsaWZ5LmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdoZXJva3UuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2F3cy5hbWF6b24uY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2NvbnNvbGUuYXdzLmFtYXpvbi5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnY2xvdWQuZ29vZ2xlLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdhenVyZS5taWNyb3NvZnQuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ3BvcnRhbC5henVyZS5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnZG9ja2VyLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdrdWJlcm5ldGVzLmlvJzogJ0RldmVsb3BtZW50JyxcblxuICAvLyBOZXdzXG4gICdjbm4uY29tJzogJ05ld3MnLFxuICAnYmJjLmNvbSc6ICdOZXdzJyxcbiAgJ255dGltZXMuY29tJzogJ05ld3MnLFxuICAnd2FzaGluZ3RvbnBvc3QuY29tJzogJ05ld3MnLFxuICAndGhlZ3VhcmRpYW4uY29tJzogJ05ld3MnLFxuICAnZm9yYmVzLmNvbSc6ICdOZXdzJyxcbiAgJ2Jsb29tYmVyZy5jb20nOiAnTmV3cycsXG4gICdyZXV0ZXJzLmNvbSc6ICdOZXdzJyxcbiAgJ3dzai5jb20nOiAnTmV3cycsXG4gICdjbmJjLmNvbSc6ICdOZXdzJyxcbiAgJ2h1ZmZwb3N0LmNvbSc6ICdOZXdzJyxcbiAgJ25ld3MuZ29vZ2xlLmNvbSc6ICdOZXdzJyxcbiAgJ2ZveG5ld3MuY29tJzogJ05ld3MnLFxuICAnbmJjbmV3cy5jb20nOiAnTmV3cycsXG4gICdhYmNuZXdzLmdvLmNvbSc6ICdOZXdzJyxcbiAgJ3VzYXRvZGF5LmNvbSc6ICdOZXdzJyxcblxuICAvLyBTaG9wcGluZ1xuICAnYW1hem9uLmNvbSc6ICdTaG9wcGluZycsXG4gICdlYmF5LmNvbSc6ICdTaG9wcGluZycsXG4gICd3YWxtYXJ0LmNvbSc6ICdTaG9wcGluZycsXG4gICdldHN5LmNvbSc6ICdTaG9wcGluZycsXG4gICd0YXJnZXQuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ2Jlc3RidXkuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ2FsaWV4cHJlc3MuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ3Nob3BpZnkuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ3RlbXUuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ3NoZWluLmNvbSc6ICdTaG9wcGluZycsXG4gICd3YXlmYWlyLmNvbSc6ICdTaG9wcGluZycsXG4gICdjb3N0Y28uY29tJzogJ1Nob3BwaW5nJyxcblxuICAvLyBDb21tdW5pY2F0aW9uXG4gICdtYWlsLmdvb2dsZS5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICdvdXRsb29rLmxpdmUuY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnc2xhY2suY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnZGlzY29yZC5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICd6b29tLnVzJzogJ0NvbW11bmljYXRpb24nLFxuICAndGVhbXMubWljcm9zb2Z0LmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ3doYXRzYXBwLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ3RlbGVncmFtLm9yZyc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ21lc3Nlbmdlci5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICdza3lwZS5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG5cbiAgLy8gRmluYW5jZVxuICAncGF5cGFsLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2NoYXNlLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2JhbmtvZmFtZXJpY2EuY29tJzogJ0ZpbmFuY2UnLFxuICAnd2VsbHNmYXJnby5jb20nOiAnRmluYW5jZScsXG4gICdhbWVyaWNhbmV4cHJlc3MuY29tJzogJ0ZpbmFuY2UnLFxuICAnc3RyaXBlLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2NvaW5iYXNlLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2JpbmFuY2UuY29tJzogJ0ZpbmFuY2UnLFxuICAna3Jha2VuLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ3JvYmluaG9vZC5jb20nOiAnRmluYW5jZScsXG4gICdmaWRlbGl0eS5jb20nOiAnRmluYW5jZScsXG4gICd2YW5ndWFyZC5jb20nOiAnRmluYW5jZScsXG4gICdzY2h3YWIuY29tJzogJ0ZpbmFuY2UnLFxuICAnbWludC5pbnR1aXQuY29tJzogJ0ZpbmFuY2UnLFxuXG4gIC8vIEVkdWNhdGlvblxuICAnd2lraXBlZGlhLm9yZyc6ICdFZHVjYXRpb24nLFxuICAnY291cnNlcmEub3JnJzogJ0VkdWNhdGlvbicsXG4gICd1ZGVteS5jb20nOiAnRWR1Y2F0aW9uJyxcbiAgJ2VkeC5vcmcnOiAnRWR1Y2F0aW9uJyxcbiAgJ2toYW5hY2FkZW15Lm9yZyc6ICdFZHVjYXRpb24nLFxuICAncXVpemxldC5jb20nOiAnRWR1Y2F0aW9uJyxcbiAgJ2R1b2xpbmdvLmNvbSc6ICdFZHVjYXRpb24nLFxuICAnY2FudmFzLmluc3RydWN0dXJlLmNvbSc6ICdFZHVjYXRpb24nLFxuICAnYmxhY2tib2FyZC5jb20nOiAnRWR1Y2F0aW9uJyxcbiAgJ21pdC5lZHUnOiAnRWR1Y2F0aW9uJyxcbiAgJ2hhcnZhcmQuZWR1JzogJ0VkdWNhdGlvbicsXG4gICdzdGFuZm9yZC5lZHUnOiAnRWR1Y2F0aW9uJyxcbiAgJ2FjYWRlbWlhLmVkdSc6ICdFZHVjYXRpb24nLFxuICAncmVzZWFyY2hnYXRlLm5ldCc6ICdFZHVjYXRpb24nLFxuXG4gIC8vIERlc2lnblxuICAnZmlnbWEuY29tJzogJ0Rlc2lnbicsXG4gICdjYW52YS5jb20nOiAnRGVzaWduJyxcbiAgJ2JlaGFuY2UubmV0JzogJ0Rlc2lnbicsXG4gICdkcmliYmJsZS5jb20nOiAnRGVzaWduJyxcbiAgJ2Fkb2JlLmNvbSc6ICdEZXNpZ24nLFxuICAndW5zcGxhc2guY29tJzogJ0Rlc2lnbicsXG4gICdwZXhlbHMuY29tJzogJ0Rlc2lnbicsXG4gICdwaXhhYmF5LmNvbSc6ICdEZXNpZ24nLFxuICAnc2h1dHRlcnN0b2NrLmNvbSc6ICdEZXNpZ24nLFxuXG4gIC8vIFByb2R1Y3Rpdml0eVxuICAnZG9jcy5nb29nbGUuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdzaGVldHMuZ29vZ2xlLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnc2xpZGVzLmdvb2dsZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2RyaXZlLmdvb2dsZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ25vdGlvbi5zbyc6ICdQcm9kdWN0aXZpdHknLFxuICAndHJlbGxvLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnYXNhbmEuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdtb25kYXkuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdhaXJ0YWJsZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2V2ZXJub3RlLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnZHJvcGJveC5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2NsaWNrdXAuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdsaW5lYXIuYXBwJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdtaXJvLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnbHVjaWRjaGFydC5jb20nOiAnUHJvZHVjdGl2aXR5JyxcblxuICAvLyBBSVxuICAnb3BlbmFpLmNvbSc6ICdBSScsXG4gICdjaGF0Z3B0LmNvbSc6ICdBSScsXG4gICdhbnRocm9waWMuY29tJzogJ0FJJyxcbiAgJ21pZGpvdXJuZXkuY29tJzogJ0FJJyxcbiAgJ2h1Z2dpbmdmYWNlLmNvJzogJ0FJJyxcbiAgJ2JhcmQuZ29vZ2xlLmNvbSc6ICdBSScsXG4gICdnZW1pbmkuZ29vZ2xlLmNvbSc6ICdBSScsXG4gICdjbGF1ZGUuYWknOiAnQUknLFxuICAncGVycGxleGl0eS5haSc6ICdBSScsXG4gICdwb2UuY29tJzogJ0FJJyxcblxuICAvLyBNdXNpYy9BdWRpb1xuICAnc3BvdGlmeS5jb20nOiAnTXVzaWMnLFxuICAnc291bmRjbG91ZC5jb20nOiAnTXVzaWMnLFxuICAnbXVzaWMuYXBwbGUuY29tJzogJ011c2ljJyxcbiAgJ3BhbmRvcmEuY29tJzogJ011c2ljJyxcbiAgJ3RpZGFsLmNvbSc6ICdNdXNpYycsXG4gICdiYW5kY2FtcC5jb20nOiAnTXVzaWMnLFxuICAnYXVkaWJsZS5jb20nOiAnTXVzaWMnLFxuXG4gIC8vIEdhbWluZ1xuICAnc3RlYW1wb3dlcmVkLmNvbSc6ICdHYW1pbmcnLFxuICAncm9ibG94LmNvbSc6ICdHYW1pbmcnLFxuICAnZXBpY2dhbWVzLmNvbSc6ICdHYW1pbmcnLFxuICAneGJveC5jb20nOiAnR2FtaW5nJyxcbiAgJ3BsYXlzdGF0aW9uLmNvbSc6ICdHYW1pbmcnLFxuICAnbmludGVuZG8uY29tJzogJ0dhbWluZycsXG4gICdpZ24uY29tJzogJ0dhbWluZycsXG4gICdnYW1lc3BvdC5jb20nOiAnR2FtaW5nJyxcbiAgJ2tvdGFrdS5jb20nOiAnR2FtaW5nJyxcbiAgJ3BvbHlnb24uY29tJzogJ0dhbWluZydcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRHZW5lcmEoaG9zdG5hbWU6IHN0cmluZywgY3VzdG9tUmVnaXN0cnk/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogc3RyaW5nIHwgbnVsbCB7XG4gIGlmICghaG9zdG5hbWUpIHJldHVybiBudWxsO1xuXG4gIC8vIDAuIENoZWNrIGN1c3RvbSByZWdpc3RyeSBmaXJzdFxuICBpZiAoY3VzdG9tUmVnaXN0cnkpIHtcbiAgICAgIGNvbnN0IHBhcnRzID0gaG9zdG5hbWUuc3BsaXQoJy4nKTtcbiAgICAgIC8vIENoZWNrIGZ1bGwgaG9zdG5hbWUgYW5kIHByb2dyZXNzaXZlbHkgc2hvcnRlciBzdWZmaXhlc1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwYXJ0cy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgICAgICBjb25zdCBkb21haW4gPSBwYXJ0cy5zbGljZShpKS5qb2luKCcuJyk7XG4gICAgICAgICAgaWYgKGN1c3RvbVJlZ2lzdHJ5W2RvbWFpbl0pIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGN1c3RvbVJlZ2lzdHJ5W2RvbWFpbl07XG4gICAgICAgICAgfVxuICAgICAgfVxuICB9XG5cbiAgLy8gMS4gRXhhY3QgbWF0Y2hcbiAgaWYgKEdFTkVSQV9SRUdJU1RSWVtob3N0bmFtZV0pIHtcbiAgICByZXR1cm4gR0VORVJBX1JFR0lTVFJZW2hvc3RuYW1lXTtcbiAgfVxuXG4gIC8vIDIuIFN1YmRvbWFpbiBjaGVjayAoc3RyaXBwaW5nIHN1YmRvbWFpbnMpXG4gIC8vIGUuZy4gXCJjb25zb2xlLmF3cy5hbWF6b24uY29tXCIgLT4gXCJhd3MuYW1hem9uLmNvbVwiIC0+IFwiYW1hem9uLmNvbVwiXG4gIGNvbnN0IHBhcnRzID0gaG9zdG5hbWUuc3BsaXQoJy4nKTtcblxuICAvLyBUcnkgbWF0Y2hpbmcgcHJvZ3Jlc3NpdmVseSBzaG9ydGVyIHN1ZmZpeGVzXG4gIC8vIGUuZy4gYS5iLmMuY29tIC0+IGIuYy5jb20gLT4gYy5jb21cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBwYXJ0cy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgIGNvbnN0IGRvbWFpbiA9IHBhcnRzLnNsaWNlKGkpLmpvaW4oJy4nKTtcbiAgICAgIGlmIChHRU5FUkFfUkVHSVNUUllbZG9tYWluXSkge1xuICAgICAgICAgIHJldHVybiBHRU5FUkFfUkVHSVNUUllbZG9tYWluXTtcbiAgICAgIH1cbiAgfVxuXG4gIHJldHVybiBudWxsO1xufVxuIiwgImV4cG9ydCBjb25zdCBnZXRTdG9yZWRWYWx1ZSA9IGFzeW5jIDxUPihrZXk6IHN0cmluZyk6IFByb21pc2U8VCB8IG51bGw+ID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KGtleSwgKGl0ZW1zKSA9PiB7XG4gICAgICByZXNvbHZlKChpdGVtc1trZXldIGFzIFQpID8/IG51bGwpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBzZXRTdG9yZWRWYWx1ZSA9IGFzeW5jIDxUPihrZXk6IHN0cmluZywgdmFsdWU6IFQpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgW2tleV06IHZhbHVlIH0sICgpID0+IHJlc29sdmUoKSk7XG4gIH0pO1xufTtcbiIsICJpbXBvcnQgeyBDdXN0b21TdHJhdGVneSwgUHJlZmVyZW5jZXMsIFNvcnRpbmdTdHJhdGVneSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGdldFN0b3JlZFZhbHVlLCBzZXRTdG9yZWRWYWx1ZSB9IGZyb20gXCIuL3N0b3JhZ2UuanNcIjtcbmltcG9ydCB7IHNldExvZ2dlclByZWZlcmVuY2VzLCBsb2dEZWJ1ZyB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBhc0FycmF5IH0gZnJvbSBcIi4uL3NoYXJlZC91dGlscy5qc1wiO1xuXG5jb25zdCBQUkVGRVJFTkNFU19LRVkgPSBcInByZWZlcmVuY2VzXCI7XG5cbmV4cG9ydCBjb25zdCBkZWZhdWx0UHJlZmVyZW5jZXM6IFByZWZlcmVuY2VzID0ge1xuICBzb3J0aW5nOiBbXCJwaW5uZWRcIiwgXCJyZWNlbmN5XCJdLFxuICBkZWJ1ZzogZmFsc2UsXG4gIGxvZ0xldmVsOiBcImluZm9cIixcbiAgdGhlbWU6IFwiZGFya1wiLFxuICBjdXN0b21HZW5lcmE6IHt9XG59O1xuXG5jb25zdCBub3JtYWxpemVTb3J0aW5nID0gKHNvcnRpbmc6IHVua25vd24pOiBTb3J0aW5nU3RyYXRlZ3lbXSA9PiB7XG4gIGlmIChBcnJheS5pc0FycmF5KHNvcnRpbmcpKSB7XG4gICAgcmV0dXJuIHNvcnRpbmcuZmlsdGVyKCh2YWx1ZSk6IHZhbHVlIGlzIFNvcnRpbmdTdHJhdGVneSA9PiB0eXBlb2YgdmFsdWUgPT09IFwic3RyaW5nXCIpO1xuICB9XG4gIGlmICh0eXBlb2Ygc29ydGluZyA9PT0gXCJzdHJpbmdcIikge1xuICAgIHJldHVybiBbc29ydGluZ107XG4gIH1cbiAgcmV0dXJuIFsuLi5kZWZhdWx0UHJlZmVyZW5jZXMuc29ydGluZ107XG59O1xuXG5jb25zdCBub3JtYWxpemVTdHJhdGVnaWVzID0gKHN0cmF0ZWdpZXM6IHVua25vd24pOiBDdXN0b21TdHJhdGVneVtdID0+IHtcbiAgICBjb25zdCBhcnIgPSBhc0FycmF5PGFueT4oc3RyYXRlZ2llcykuZmlsdGVyKHMgPT4gdHlwZW9mIHMgPT09ICdvYmplY3QnICYmIHMgIT09IG51bGwpO1xuICAgIHJldHVybiBhcnIubWFwKHMgPT4gKHtcbiAgICAgICAgLi4ucyxcbiAgICAgICAgZ3JvdXBpbmdSdWxlczogYXNBcnJheShzLmdyb3VwaW5nUnVsZXMpLFxuICAgICAgICBzb3J0aW5nUnVsZXM6IGFzQXJyYXkocy5zb3J0aW5nUnVsZXMpLFxuICAgICAgICBncm91cFNvcnRpbmdSdWxlczogcy5ncm91cFNvcnRpbmdSdWxlcyA/IGFzQXJyYXkocy5ncm91cFNvcnRpbmdSdWxlcykgOiB1bmRlZmluZWQsXG4gICAgICAgIGZpbHRlcnM6IHMuZmlsdGVycyA/IGFzQXJyYXkocy5maWx0ZXJzKSA6IHVuZGVmaW5lZCxcbiAgICAgICAgZmlsdGVyR3JvdXBzOiBzLmZpbHRlckdyb3VwcyA/IGFzQXJyYXkocy5maWx0ZXJHcm91cHMpLm1hcCgoZzogYW55KSA9PiBhc0FycmF5KGcpKSA6IHVuZGVmaW5lZCxcbiAgICAgICAgcnVsZXM6IHMucnVsZXMgPyBhc0FycmF5KHMucnVsZXMpIDogdW5kZWZpbmVkXG4gICAgfSkpO1xufTtcblxuY29uc3Qgbm9ybWFsaXplUHJlZmVyZW5jZXMgPSAocHJlZnM/OiBQYXJ0aWFsPFByZWZlcmVuY2VzPiB8IG51bGwpOiBQcmVmZXJlbmNlcyA9PiB7XG4gIGNvbnN0IG1lcmdlZCA9IHsgLi4uZGVmYXVsdFByZWZlcmVuY2VzLCAuLi4ocHJlZnMgPz8ge30pIH07XG4gIHJldHVybiB7XG4gICAgLi4ubWVyZ2VkLFxuICAgIHNvcnRpbmc6IG5vcm1hbGl6ZVNvcnRpbmcobWVyZ2VkLnNvcnRpbmcpLFxuICAgIGN1c3RvbVN0cmF0ZWdpZXM6IG5vcm1hbGl6ZVN0cmF0ZWdpZXMobWVyZ2VkLmN1c3RvbVN0cmF0ZWdpZXMpXG4gIH07XG59O1xuXG5leHBvcnQgY29uc3QgbG9hZFByZWZlcmVuY2VzID0gYXN5bmMgKCk6IFByb21pc2U8UHJlZmVyZW5jZXM+ID0+IHtcbiAgY29uc3Qgc3RvcmVkID0gYXdhaXQgZ2V0U3RvcmVkVmFsdWU8UHJlZmVyZW5jZXM+KFBSRUZFUkVOQ0VTX0tFWSk7XG4gIGNvbnN0IG1lcmdlZCA9IG5vcm1hbGl6ZVByZWZlcmVuY2VzKHN0b3JlZCA/PyB1bmRlZmluZWQpO1xuICBzZXRMb2dnZXJQcmVmZXJlbmNlcyhtZXJnZWQpO1xuICByZXR1cm4gbWVyZ2VkO1xufTtcblxuZXhwb3J0IGNvbnN0IHNhdmVQcmVmZXJlbmNlcyA9IGFzeW5jIChwcmVmczogUGFydGlhbDxQcmVmZXJlbmNlcz4pOiBQcm9taXNlPFByZWZlcmVuY2VzPiA9PiB7XG4gIGxvZ0RlYnVnKFwiVXBkYXRpbmcgcHJlZmVyZW5jZXNcIiwgeyBrZXlzOiBPYmplY3Qua2V5cyhwcmVmcykgfSk7XG4gIGNvbnN0IGN1cnJlbnQgPSBhd2FpdCBsb2FkUHJlZmVyZW5jZXMoKTtcbiAgY29uc3QgbWVyZ2VkID0gbm9ybWFsaXplUHJlZmVyZW5jZXMoeyAuLi5jdXJyZW50LCAuLi5wcmVmcyB9KTtcbiAgYXdhaXQgc2V0U3RvcmVkVmFsdWUoUFJFRkVSRU5DRVNfS0VZLCBtZXJnZWQpO1xuICBzZXRMb2dnZXJQcmVmZXJlbmNlcyhtZXJnZWQpO1xuICByZXR1cm4gbWVyZ2VkO1xufTtcbiIsICJpbXBvcnQgeyBQYWdlQ29udGV4dCwgVGFiTWV0YWRhdGEgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBub3JtYWxpemVVcmwsIHBhcnNlWW91VHViZVVybCwgZXh0cmFjdFlvdVR1YmVDaGFubmVsRnJvbUh0bWwsIGV4dHJhY3RZb3VUdWJlR2VucmVGcm9tSHRtbCB9IGZyb20gXCIuL2xvZ2ljLmpzXCI7XG5pbXBvcnQgeyBnZXRHZW5lcmEgfSBmcm9tIFwiLi9nZW5lcmFSZWdpc3RyeS5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgbG9hZFByZWZlcmVuY2VzIH0gZnJvbSBcIi4uL3ByZWZlcmVuY2VzLmpzXCI7XG5cbmludGVyZmFjZSBFeHRyYWN0aW9uUmVzcG9uc2Uge1xuICBkYXRhOiBQYWdlQ29udGV4dCB8IG51bGw7XG4gIGVycm9yPzogc3RyaW5nO1xuICBzdGF0dXM6XG4gICAgfCAnT0snXG4gICAgfCAnUkVTVFJJQ1RFRCdcbiAgICB8ICdJTkpFQ1RJT05fRkFJTEVEJ1xuICAgIHwgJ05PX1JFU1BPTlNFJ1xuICAgIHwgJ05PX0hPU1RfUEVSTUlTU0lPTidcbiAgICB8ICdGUkFNRV9BQ0NFU1NfREVOSUVEJztcbn1cblxuLy8gU2ltcGxlIGNvbmN1cnJlbmN5IGNvbnRyb2xcbmxldCBhY3RpdmVGZXRjaGVzID0gMDtcbmNvbnN0IE1BWF9DT05DVVJSRU5UX0ZFVENIRVMgPSA1OyAvLyBDb25zZXJ2YXRpdmUgbGltaXQgdG8gYXZvaWQgcmF0ZSBsaW1pdGluZ1xuY29uc3QgRkVUQ0hfUVVFVUU6ICgoKSA9PiB2b2lkKVtdID0gW107XG5cbmNvbnN0IGZldGNoV2l0aFRpbWVvdXQgPSBhc3luYyAodXJsOiBzdHJpbmcsIHRpbWVvdXQgPSAyMDAwKTogUHJvbWlzZTxSZXNwb25zZT4gPT4ge1xuICAgIGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG4gICAgY29uc3QgaWQgPSBzZXRUaW1lb3V0KCgpID0+IGNvbnRyb2xsZXIuYWJvcnQoKSwgdGltZW91dCk7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCh1cmwsIHsgc2lnbmFsOiBjb250cm9sbGVyLnNpZ25hbCB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgIH0gZmluYWxseSB7XG4gICAgICAgIGNsZWFyVGltZW91dChpZCk7XG4gICAgfVxufTtcblxuY29uc3QgZW5xdWV1ZUZldGNoID0gYXN5bmMgPFQ+KGZuOiAoKSA9PiBQcm9taXNlPFQ+KTogUHJvbWlzZTxUPiA9PiB7XG4gICAgaWYgKGFjdGl2ZUZldGNoZXMgPj0gTUFYX0NPTkNVUlJFTlRfRkVUQ0hFUykge1xuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IEZFVENIX1FVRVVFLnB1c2gocmVzb2x2ZSkpO1xuICAgIH1cbiAgICBhY3RpdmVGZXRjaGVzKys7XG4gICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIGF3YWl0IGZuKCk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgICAgYWN0aXZlRmV0Y2hlcy0tO1xuICAgICAgICBpZiAoRkVUQ0hfUVVFVUUubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY29uc3QgbmV4dCA9IEZFVENIX1FVRVVFLnNoaWZ0KCk7XG4gICAgICAgICAgICBpZiAobmV4dCkgbmV4dCgpO1xuICAgICAgICB9XG4gICAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGV4dHJhY3RQYWdlQ29udGV4dCA9IGFzeW5jICh0YWI6IFRhYk1ldGFkYXRhIHwgY2hyb21lLnRhYnMuVGFiKTogUHJvbWlzZTxFeHRyYWN0aW9uUmVzcG9uc2U+ID0+IHtcbiAgdHJ5IHtcbiAgICBpZiAoIXRhYiB8fCAhdGFiLnVybCkge1xuICAgICAgICByZXR1cm4geyBkYXRhOiBudWxsLCBlcnJvcjogXCJUYWIgbm90IGZvdW5kIG9yIG5vIFVSTFwiLCBzdGF0dXM6ICdOT19SRVNQT05TRScgfTtcbiAgICB9XG5cbiAgICBpZiAoXG4gICAgICB0YWIudXJsLnN0YXJ0c1dpdGgoJ2Nocm9tZTovLycpIHx8XG4gICAgICB0YWIudXJsLnN0YXJ0c1dpdGgoJ2VkZ2U6Ly8nKSB8fFxuICAgICAgdGFiLnVybC5zdGFydHNXaXRoKCdhYm91dDonKSB8fFxuICAgICAgdGFiLnVybC5zdGFydHNXaXRoKCdjaHJvbWUtZXh0ZW5zaW9uOi8vJykgfHxcbiAgICAgIHRhYi51cmwuc3RhcnRzV2l0aCgnY2hyb21lLWVycm9yOi8vJylcbiAgICApIHtcbiAgICAgICAgcmV0dXJuIHsgZGF0YTogbnVsbCwgZXJyb3I6IFwiUmVzdHJpY3RlZCBVUkwgc2NoZW1lXCIsIHN0YXR1czogJ1JFU1RSSUNURUQnIH07XG4gICAgfVxuXG4gICAgY29uc3QgcHJlZnMgPSBhd2FpdCBsb2FkUHJlZmVyZW5jZXMoKTtcbiAgICBsZXQgYmFzZWxpbmUgPSBidWlsZEJhc2VsaW5lQ29udGV4dCh0YWIgYXMgY2hyb21lLnRhYnMuVGFiLCBwcmVmcy5jdXN0b21HZW5lcmEpO1xuXG4gICAgLy8gRmV0Y2ggYW5kIGVucmljaCBmb3IgWW91VHViZSBpZiBhdXRob3IgaXMgbWlzc2luZyBhbmQgaXQgaXMgYSB2aWRlb1xuICAgIGNvbnN0IHRhcmdldFVybCA9IHRhYi51cmw7XG4gICAgY29uc3QgdXJsT2JqID0gbmV3IFVSTCh0YXJnZXRVcmwpO1xuICAgIGNvbnN0IGhvc3RuYW1lID0gdXJsT2JqLmhvc3RuYW1lLnJlcGxhY2UoL153d3dcXC4vLCAnJyk7XG4gICAgaWYgKChob3N0bmFtZS5lbmRzV2l0aCgneW91dHViZS5jb20nKSB8fCBob3N0bmFtZS5lbmRzV2l0aCgneW91dHUuYmUnKSkgJiYgKCFiYXNlbGluZS5hdXRob3JPckNyZWF0b3IgfHwgYmFzZWxpbmUuZ2VucmUgPT09ICdWaWRlbycpKSB7XG4gICAgICAgICB0cnkge1xuICAgICAgICAgICAgIC8vIFdlIHVzZSBhIHF1ZXVlIHRvIHByZXZlbnQgZmxvb2RpbmcgcmVxdWVzdHNcbiAgICAgICAgICAgICBhd2FpdCBlbnF1ZXVlRmV0Y2goYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoV2l0aFRpbWVvdXQodGFyZ2V0VXJsKTtcbiAgICAgICAgICAgICAgICAgaWYgKHJlc3BvbnNlLm9rKSB7XG4gICAgICAgICAgICAgICAgICAgICBjb25zdCBodG1sID0gYXdhaXQgcmVzcG9uc2UudGV4dCgpO1xuICAgICAgICAgICAgICAgICAgICAgY29uc3QgY2hhbm5lbCA9IGV4dHJhY3RZb3VUdWJlQ2hhbm5lbEZyb21IdG1sKGh0bWwpO1xuICAgICAgICAgICAgICAgICAgICAgaWYgKGNoYW5uZWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICBiYXNlbGluZS5hdXRob3JPckNyZWF0b3IgPSBjaGFubmVsO1xuICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgY29uc3QgZ2VucmUgPSBleHRyYWN0WW91VHViZUdlbnJlRnJvbUh0bWwoaHRtbCk7XG4gICAgICAgICAgICAgICAgICAgICBpZiAoZ2VucmUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICBiYXNlbGluZS5nZW5yZSA9IGdlbnJlO1xuICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgfSk7XG4gICAgICAgICB9IGNhdGNoIChmZXRjaEVycikge1xuICAgICAgICAgICAgIGxvZ0RlYnVnKFwiRmFpbGVkIHRvIGZldGNoIFlvdVR1YmUgcGFnZSBjb250ZW50XCIsIHsgZXJyb3I6IFN0cmluZyhmZXRjaEVycikgfSk7XG4gICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGRhdGE6IGJhc2VsaW5lLFxuICAgICAgc3RhdHVzOiAnT0snXG4gICAgfTtcblxuICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICBsb2dEZWJ1ZyhgRXh0cmFjdGlvbiBmYWlsZWQgZm9yIHRhYiAke3RhYi5pZH1gLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIGRhdGE6IG51bGwsXG4gICAgICBlcnJvcjogU3RyaW5nKGUpLFxuICAgICAgc3RhdHVzOiAnSU5KRUNUSU9OX0ZBSUxFRCdcbiAgICB9O1xuICB9XG59O1xuXG5jb25zdCBidWlsZEJhc2VsaW5lQ29udGV4dCA9ICh0YWI6IGNocm9tZS50YWJzLlRhYiwgY3VzdG9tR2VuZXJhPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPik6IFBhZ2VDb250ZXh0ID0+IHtcbiAgY29uc3QgdXJsID0gdGFiLnVybCB8fCBcIlwiO1xuICBsZXQgaG9zdG5hbWUgPSBcIlwiO1xuICB0cnkge1xuICAgIGhvc3RuYW1lID0gbmV3IFVSTCh1cmwpLmhvc3RuYW1lLnJlcGxhY2UoL153d3dcXC4vLCAnJyk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBob3N0bmFtZSA9IFwiXCI7XG4gIH1cblxuICAvLyBEZXRlcm1pbmUgT2JqZWN0IFR5cGUgZmlyc3RcbiAgbGV0IG9iamVjdFR5cGU6IFBhZ2VDb250ZXh0WydvYmplY3RUeXBlJ10gPSAndW5rbm93bic7XG4gIGxldCBhdXRob3JPckNyZWF0b3I6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXG4gIGlmICh1cmwuaW5jbHVkZXMoJy9sb2dpbicpIHx8IHVybC5pbmNsdWRlcygnL3NpZ25pbicpKSB7XG4gICAgICBvYmplY3RUeXBlID0gJ2xvZ2luJztcbiAgfSBlbHNlIGlmIChob3N0bmFtZS5pbmNsdWRlcygneW91dHViZS5jb20nKSB8fCBob3N0bmFtZS5pbmNsdWRlcygneW91dHUuYmUnKSkge1xuICAgICAgY29uc3QgeyB2aWRlb0lkIH0gPSBwYXJzZVlvdVR1YmVVcmwodXJsKTtcbiAgICAgIGlmICh2aWRlb0lkKSBvYmplY3RUeXBlID0gJ3ZpZGVvJztcblxuICAgICAgLy8gVHJ5IHRvIGd1ZXNzIGNoYW5uZWwgZnJvbSBVUkwgaWYgcG9zc2libGVcbiAgICAgIGlmICh1cmwuaW5jbHVkZXMoJy9AJykpIHtcbiAgICAgICAgICBjb25zdCBwYXJ0cyA9IHVybC5zcGxpdCgnL0AnKTtcbiAgICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICBjb25zdCBoYW5kbGUgPSBwYXJ0c1sxXS5zcGxpdCgnLycpWzBdO1xuICAgICAgICAgICAgICBhdXRob3JPckNyZWF0b3IgPSAnQCcgKyBoYW5kbGU7XG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICh1cmwuaW5jbHVkZXMoJy9jLycpKSB7XG4gICAgICAgICAgY29uc3QgcGFydHMgPSB1cmwuc3BsaXQoJy9jLycpO1xuICAgICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgIGF1dGhvck9yQ3JlYXRvciA9IGRlY29kZVVSSUNvbXBvbmVudChwYXJ0c1sxXS5zcGxpdCgnLycpWzBdKTtcbiAgICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHVybC5pbmNsdWRlcygnL3VzZXIvJykpIHtcbiAgICAgICAgICBjb25zdCBwYXJ0cyA9IHVybC5zcGxpdCgnL3VzZXIvJyk7XG4gICAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgYXV0aG9yT3JDcmVhdG9yID0gZGVjb2RlVVJJQ29tcG9uZW50KHBhcnRzWzFdLnNwbGl0KCcvJylbMF0pO1xuICAgICAgICAgIH1cbiAgICAgIH1cbiAgfSBlbHNlIGlmIChob3N0bmFtZSA9PT0gJ2dpdGh1Yi5jb20nICYmIHVybC5pbmNsdWRlcygnL3B1bGwvJykpIHtcbiAgICAgIG9iamVjdFR5cGUgPSAndGlja2V0JztcbiAgfSBlbHNlIGlmIChob3N0bmFtZSA9PT0gJ2dpdGh1Yi5jb20nICYmICF1cmwuaW5jbHVkZXMoJy9wdWxsLycpICYmIHVybC5zcGxpdCgnLycpLmxlbmd0aCA+PSA1KSB7XG4gICAgICAvLyByb3VnaCBjaGVjayBmb3IgcmVwb1xuICAgICAgb2JqZWN0VHlwZSA9ICdyZXBvJztcbiAgfVxuXG4gIC8vIERldGVybWluZSBHZW5yZVxuICAvLyBQcmlvcml0eSAxOiBTaXRlLXNwZWNpZmljIGV4dHJhY3Rpb24gKGRlcml2ZWQgZnJvbSBvYmplY3RUeXBlKVxuICBsZXQgZ2VucmU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICBpZiAob2JqZWN0VHlwZSA9PT0gJ3ZpZGVvJykgZ2VucmUgPSAnVmlkZW8nO1xuICBlbHNlIGlmIChvYmplY3RUeXBlID09PSAncmVwbycgfHwgb2JqZWN0VHlwZSA9PT0gJ3RpY2tldCcpIGdlbnJlID0gJ0RldmVsb3BtZW50JztcblxuICAvLyBQcmlvcml0eSAyOiBGYWxsYmFjayB0byBSZWdpc3RyeVxuICBpZiAoIWdlbnJlKSB7XG4gICAgIGdlbnJlID0gZ2V0R2VuZXJhKGhvc3RuYW1lLCBjdXN0b21HZW5lcmEpIHx8IHVuZGVmaW5lZDtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY2Fub25pY2FsVXJsOiB1cmwgfHwgbnVsbCxcbiAgICBub3JtYWxpemVkVXJsOiBub3JtYWxpemVVcmwodXJsKSxcbiAgICBzaXRlTmFtZTogaG9zdG5hbWUgfHwgbnVsbCxcbiAgICBwbGF0Zm9ybTogaG9zdG5hbWUgfHwgbnVsbCxcbiAgICBvYmplY3RUeXBlLFxuICAgIG9iamVjdElkOiB1cmwgfHwgbnVsbCxcbiAgICB0aXRsZTogdGFiLnRpdGxlIHx8IG51bGwsXG4gICAgZ2VucmUsXG4gICAgZGVzY3JpcHRpb246IG51bGwsXG4gICAgYXV0aG9yT3JDcmVhdG9yOiBhdXRob3JPckNyZWF0b3IsXG4gICAgcHVibGlzaGVkQXQ6IG51bGwsXG4gICAgbW9kaWZpZWRBdDogbnVsbCxcbiAgICBsYW5ndWFnZTogbnVsbCxcbiAgICB0YWdzOiBbXSxcbiAgICBicmVhZGNydW1iczogW10sXG4gICAgaXNBdWRpYmxlOiBmYWxzZSxcbiAgICBpc011dGVkOiBmYWxzZSxcbiAgICBpc0NhcHR1cmluZzogZmFsc2UsXG4gICAgcHJvZ3Jlc3M6IG51bGwsXG4gICAgaGFzVW5zYXZlZENoYW5nZXNMaWtlbHk6IGZhbHNlLFxuICAgIGlzQXV0aGVudGljYXRlZExpa2VseTogZmFsc2UsXG4gICAgc291cmNlczoge1xuICAgICAgY2Fub25pY2FsVXJsOiAndXJsJyxcbiAgICAgIG5vcm1hbGl6ZWRVcmw6ICd1cmwnLFxuICAgICAgc2l0ZU5hbWU6ICd1cmwnLFxuICAgICAgcGxhdGZvcm06ICd1cmwnLFxuICAgICAgb2JqZWN0VHlwZTogJ3VybCcsXG4gICAgICB0aXRsZTogdGFiLnRpdGxlID8gJ3RhYicgOiAndXJsJyxcbiAgICAgIGdlbnJlOiAncmVnaXN0cnknXG4gICAgfSxcbiAgICBjb25maWRlbmNlOiB7fVxuICB9O1xufTtcbiIsICJpbXBvcnQgeyBUYWJNZXRhZGF0YSwgUGFnZUNvbnRleHQgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBsb2dEZWJ1ZywgbG9nRXJyb3IgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgZXh0cmFjdFBhZ2VDb250ZXh0IH0gZnJvbSBcIi4vZXh0cmFjdGlvbi9pbmRleC5qc1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIENvbnRleHRSZXN1bHQge1xuICBjb250ZXh0OiBzdHJpbmc7XG4gIHNvdXJjZTogJ0FJJyB8ICdIZXVyaXN0aWMnIHwgJ0V4dHJhY3Rpb24nO1xuICBkYXRhPzogUGFnZUNvbnRleHQ7XG4gIGVycm9yPzogc3RyaW5nO1xuICBzdGF0dXM/OiBzdHJpbmc7XG59XG5cbmNvbnN0IGNvbnRleHRDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBDb250ZXh0UmVzdWx0PigpO1xuXG5leHBvcnQgY29uc3QgYW5hbHl6ZVRhYkNvbnRleHQgPSBhc3luYyAoXG4gIHRhYnM6IFRhYk1ldGFkYXRhW10sXG4gIG9uUHJvZ3Jlc3M/OiAoY29tcGxldGVkOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+IHZvaWRcbik6IFByb21pc2U8TWFwPG51bWJlciwgQ29udGV4dFJlc3VsdD4+ID0+IHtcbiAgY29uc3QgY29udGV4dE1hcCA9IG5ldyBNYXA8bnVtYmVyLCBDb250ZXh0UmVzdWx0PigpO1xuICBsZXQgY29tcGxldGVkID0gMDtcbiAgY29uc3QgdG90YWwgPSB0YWJzLmxlbmd0aDtcblxuICBjb25zdCBwcm9taXNlcyA9IHRhYnMubWFwKGFzeW5jICh0YWIpID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgY2FjaGVLZXkgPSBgJHt0YWIuaWR9Ojoke3RhYi51cmx9YDtcbiAgICAgIGlmIChjb250ZXh0Q2FjaGUuaGFzKGNhY2hlS2V5KSkge1xuICAgICAgICBjb250ZXh0TWFwLnNldCh0YWIuaWQsIGNvbnRleHRDYWNoZS5nZXQoY2FjaGVLZXkpISk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZmV0Y2hDb250ZXh0Rm9yVGFiKHRhYik7XG5cbiAgICAgIC8vIE9ubHkgY2FjaGUgdmFsaWQgcmVzdWx0cyB0byBhbGxvdyByZXRyeWluZyBvbiB0cmFuc2llbnQgZXJyb3JzP1xuICAgICAgLy8gQWN0dWFsbHksIGlmIHdlIGNhY2hlIGVycm9yLCB3ZSBzdG9wIHJldHJ5aW5nLlxuICAgICAgLy8gTGV0J3MgY2FjaGUgZXZlcnl0aGluZyBmb3Igbm93IHRvIHByZXZlbnQgc3BhbW1pbmcgaWYgaXQga2VlcHMgZmFpbGluZy5cbiAgICAgIGNvbnRleHRDYWNoZS5zZXQoY2FjaGVLZXksIHJlc3VsdCk7XG5cbiAgICAgIGNvbnRleHRNYXAuc2V0KHRhYi5pZCwgcmVzdWx0KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nRXJyb3IoYEZhaWxlZCB0byBhbmFseXplIGNvbnRleHQgZm9yIHRhYiAke3RhYi5pZH1gLCB7IGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICAgICAgLy8gRXZlbiBpZiBmZXRjaENvbnRleHRGb3JUYWIgZmFpbHMgY29tcGxldGVseSwgd2UgdHJ5IGEgc2FmZSBzeW5jIGZhbGxiYWNrXG4gICAgICBjb250ZXh0TWFwLnNldCh0YWIuaWQsIHsgY29udGV4dDogXCJVbmNhdGVnb3JpemVkXCIsIHNvdXJjZTogJ0hldXJpc3RpYycsIGVycm9yOiBTdHJpbmcoZXJyb3IpLCBzdGF0dXM6ICdFUlJPUicgfSk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGNvbXBsZXRlZCsrO1xuICAgICAgaWYgKG9uUHJvZ3Jlc3MpIG9uUHJvZ3Jlc3MoY29tcGxldGVkLCB0b3RhbCk7XG4gICAgfVxuICB9KTtcblxuICBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gIHJldHVybiBjb250ZXh0TWFwO1xufTtcblxuY29uc3QgZmV0Y2hDb250ZXh0Rm9yVGFiID0gYXN5bmMgKHRhYjogVGFiTWV0YWRhdGEpOiBQcm9taXNlPENvbnRleHRSZXN1bHQ+ID0+IHtcbiAgLy8gMS4gUnVuIEdlbmVyaWMgRXh0cmFjdGlvbiAoQWx3YXlzKVxuICBsZXQgZGF0YTogUGFnZUNvbnRleHQgfCBudWxsID0gbnVsbDtcbiAgbGV0IGVycm9yOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gIGxldCBzdGF0dXM6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICB0cnkge1xuICAgICAgY29uc3QgZXh0cmFjdGlvbiA9IGF3YWl0IGV4dHJhY3RQYWdlQ29udGV4dCh0YWIpO1xuICAgICAgZGF0YSA9IGV4dHJhY3Rpb24uZGF0YTtcbiAgICAgIGVycm9yID0gZXh0cmFjdGlvbi5lcnJvcjtcbiAgICAgIHN0YXR1cyA9IGV4dHJhY3Rpb24uc3RhdHVzO1xuICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2dEZWJ1ZyhgRXh0cmFjdGlvbiBmYWlsZWQgZm9yIHRhYiAke3RhYi5pZH1gLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICBlcnJvciA9IFN0cmluZyhlKTtcbiAgICAgIHN0YXR1cyA9ICdFUlJPUic7XG4gIH1cblxuICBsZXQgY29udGV4dCA9IFwiVW5jYXRlZ29yaXplZFwiO1xuICBsZXQgc291cmNlOiBDb250ZXh0UmVzdWx0Wydzb3VyY2UnXSA9ICdIZXVyaXN0aWMnO1xuXG4gIC8vIDIuIFRyeSB0byBEZXRlcm1pbmUgQ2F0ZWdvcnkgZnJvbSBFeHRyYWN0aW9uIERhdGFcbiAgaWYgKGRhdGEpIHtcbiAgICAgIGlmIChkYXRhLnBsYXRmb3JtID09PSAnWW91VHViZScgfHwgZGF0YS5wbGF0Zm9ybSA9PT0gJ05ldGZsaXgnIHx8IGRhdGEucGxhdGZvcm0gPT09ICdTcG90aWZ5JyB8fCBkYXRhLnBsYXRmb3JtID09PSAnVHdpdGNoJykge1xuICAgICAgICAgIGNvbnRleHQgPSBcIkVudGVydGFpbm1lbnRcIjtcbiAgICAgICAgICBzb3VyY2UgPSAnRXh0cmFjdGlvbic7XG4gICAgICB9IGVsc2UgaWYgKGRhdGEucGxhdGZvcm0gPT09ICdHaXRIdWInIHx8IGRhdGEucGxhdGZvcm0gPT09ICdTdGFjayBPdmVyZmxvdycgfHwgZGF0YS5wbGF0Zm9ybSA9PT0gJ0ppcmEnIHx8IGRhdGEucGxhdGZvcm0gPT09ICdHaXRMYWInKSB7XG4gICAgICAgICAgY29udGV4dCA9IFwiRGV2ZWxvcG1lbnRcIjtcbiAgICAgICAgICBzb3VyY2UgPSAnRXh0cmFjdGlvbic7XG4gICAgICB9IGVsc2UgaWYgKGRhdGEucGxhdGZvcm0gPT09ICdHb29nbGUnICYmIChkYXRhLm5vcm1hbGl6ZWRVcmwuaW5jbHVkZXMoJ2RvY3MnKSB8fCBkYXRhLm5vcm1hbGl6ZWRVcmwuaW5jbHVkZXMoJ3NoZWV0cycpIHx8IGRhdGEubm9ybWFsaXplZFVybC5pbmNsdWRlcygnc2xpZGVzJykpKSB7XG4gICAgICAgICAgY29udGV4dCA9IFwiV29ya1wiO1xuICAgICAgICAgIHNvdXJjZSA9ICdFeHRyYWN0aW9uJztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIElmIHdlIGhhdmUgc3VjY2Vzc2Z1bCBleHRyYWN0aW9uIGRhdGEgYnV0IG5vIHNwZWNpZmljIHJ1bGUgbWF0Y2hlZCxcbiAgICAgICAgLy8gdXNlIHRoZSBPYmplY3QgVHlwZSBvciBnZW5lcmljIFwiR2VuZXJhbCBXZWJcIiB0byBpbmRpY2F0ZSBleHRyYWN0aW9uIHdvcmtlZC5cbiAgICAgICAgLy8gV2UgcHJlZmVyIHNwZWNpZmljIGNhdGVnb3JpZXMsIGJ1dCBcIkFydGljbGVcIiBvciBcIlZpZGVvXCIgYXJlIGJldHRlciB0aGFuIFwiVW5jYXRlZ29yaXplZFwiLlxuICAgICAgICBpZiAoZGF0YS5vYmplY3RUeXBlICYmIGRhdGEub2JqZWN0VHlwZSAhPT0gJ3Vua25vd24nKSB7XG4gICAgICAgICAgICAgLy8gTWFwIG9iamVjdCB0eXBlcyB0byBjYXRlZ29yaWVzIGlmIHBvc3NpYmxlXG4gICAgICAgICAgICAgaWYgKGRhdGEub2JqZWN0VHlwZSA9PT0gJ3ZpZGVvJykgY29udGV4dCA9ICdFbnRlcnRhaW5tZW50JztcbiAgICAgICAgICAgICBlbHNlIGlmIChkYXRhLm9iamVjdFR5cGUgPT09ICdhcnRpY2xlJykgY29udGV4dCA9ICdOZXdzJzsgLy8gTG9vc2UgbWFwcGluZywgYnV0IGJldHRlciB0aGFuIG5vdGhpbmdcbiAgICAgICAgICAgICBlbHNlIGNvbnRleHQgPSBkYXRhLm9iamVjdFR5cGUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBkYXRhLm9iamVjdFR5cGUuc2xpY2UoMSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgY29udGV4dCA9IFwiR2VuZXJhbCBXZWJcIjtcbiAgICAgICAgfVxuICAgICAgICBzb3VyY2UgPSAnRXh0cmFjdGlvbic7XG4gICAgICB9XG4gIH1cblxuICAvLyAzLiBGYWxsYmFjayB0byBMb2NhbCBIZXVyaXN0aWMgKFVSTCBSZWdleClcbiAgaWYgKGNvbnRleHQgPT09IFwiVW5jYXRlZ29yaXplZFwiKSB7XG4gICAgICBjb25zdCBoID0gYXdhaXQgbG9jYWxIZXVyaXN0aWModGFiKTtcbiAgICAgIGlmIChoLmNvbnRleHQgIT09IFwiVW5jYXRlZ29yaXplZFwiKSB7XG4gICAgICAgICAgY29udGV4dCA9IGguY29udGV4dDtcbiAgICAgICAgICAvLyBzb3VyY2UgcmVtYWlucyAnSGV1cmlzdGljJyAob3IgbWF5YmUgd2Ugc2hvdWxkIHNheSAnSGV1cmlzdGljJyBpcyB0aGUgc291cmNlPylcbiAgICAgICAgICAvLyBUaGUgbG9jYWxIZXVyaXN0aWMgZnVuY3Rpb24gcmV0dXJucyB7IHNvdXJjZTogJ0hldXJpc3RpYycgfVxuICAgICAgfVxuICB9XG5cbiAgLy8gNC4gRmFsbGJhY2sgdG8gQUkgKExMTSkgLSBSRU1PVkVEXG4gIC8vIFRoZSBIdWdnaW5nRmFjZSBBUEkgZW5kcG9pbnQgaXMgNDEwIEdvbmUgYW5kL29yIHJlcXVpcmVzIGF1dGhlbnRpY2F0aW9uIHdoaWNoIHdlIGRvIG5vdCBoYXZlLlxuICAvLyBUaGUgY29kZSBoYXMgYmVlbiByZW1vdmVkIHRvIHByZXZlbnQgZXJyb3JzLlxuXG4gIGlmIChjb250ZXh0ICE9PSBcIlVuY2F0ZWdvcml6ZWRcIiAmJiBzb3VyY2UgIT09IFwiRXh0cmFjdGlvblwiKSB7XG4gICAgZXJyb3IgPSB1bmRlZmluZWQ7XG4gICAgc3RhdHVzID0gdW5kZWZpbmVkO1xuICB9XG5cbiAgcmV0dXJuIHsgY29udGV4dCwgc291cmNlLCBkYXRhOiBkYXRhIHx8IHVuZGVmaW5lZCwgZXJyb3IsIHN0YXR1cyB9O1xufTtcblxuY29uc3QgbG9jYWxIZXVyaXN0aWMgPSBhc3luYyAodGFiOiBUYWJNZXRhZGF0YSk6IFByb21pc2U8Q29udGV4dFJlc3VsdD4gPT4ge1xuICBjb25zdCB1cmwgPSB0YWIudXJsLnRvTG93ZXJDYXNlKCk7XG4gIGxldCBjb250ZXh0ID0gXCJVbmNhdGVnb3JpemVkXCI7XG5cbiAgaWYgKHVybC5pbmNsdWRlcyhcImdpdGh1YlwiKSB8fCB1cmwuaW5jbHVkZXMoXCJzdGFja292ZXJmbG93XCIpIHx8IHVybC5pbmNsdWRlcyhcImxvY2FsaG9zdFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJqaXJhXCIpIHx8IHVybC5pbmNsdWRlcyhcImdpdGxhYlwiKSkgY29udGV4dCA9IFwiRGV2ZWxvcG1lbnRcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwiZ29vZ2xlXCIpICYmICh1cmwuaW5jbHVkZXMoXCJkb2NzXCIpIHx8IHVybC5pbmNsdWRlcyhcInNoZWV0c1wiKSB8fCB1cmwuaW5jbHVkZXMoXCJzbGlkZXNcIikpKSBjb250ZXh0ID0gXCJXb3JrXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcImxpbmtlZGluXCIpIHx8IHVybC5pbmNsdWRlcyhcInNsYWNrXCIpIHx8IHVybC5pbmNsdWRlcyhcInpvb21cIikgfHwgdXJsLmluY2x1ZGVzKFwidGVhbXNcIikpIGNvbnRleHQgPSBcIldvcmtcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwibmV0ZmxpeFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJzcG90aWZ5XCIpIHx8IHVybC5pbmNsdWRlcyhcImh1bHVcIikgfHwgdXJsLmluY2x1ZGVzKFwiZGlzbmV5XCIpIHx8IHVybC5pbmNsdWRlcyhcInlvdXR1YmVcIikpIGNvbnRleHQgPSBcIkVudGVydGFpbm1lbnRcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwidHdpdHRlclwiKSB8fCB1cmwuaW5jbHVkZXMoXCJmYWNlYm9va1wiKSB8fCB1cmwuaW5jbHVkZXMoXCJpbnN0YWdyYW1cIikgfHwgdXJsLmluY2x1ZGVzKFwicmVkZGl0XCIpIHx8IHVybC5pbmNsdWRlcyhcInRpa3Rva1wiKSB8fCB1cmwuaW5jbHVkZXMoXCJwaW50ZXJlc3RcIikpIGNvbnRleHQgPSBcIlNvY2lhbFwiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJhbWF6b25cIikgfHwgdXJsLmluY2x1ZGVzKFwiZWJheVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJ3YWxtYXJ0XCIpIHx8IHVybC5pbmNsdWRlcyhcInRhcmdldFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJzaG9waWZ5XCIpKSBjb250ZXh0ID0gXCJTaG9wcGluZ1wiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJjbm5cIikgfHwgdXJsLmluY2x1ZGVzKFwiYmJjXCIpIHx8IHVybC5pbmNsdWRlcyhcIm55dGltZXNcIikgfHwgdXJsLmluY2x1ZGVzKFwid2FzaGluZ3RvbnBvc3RcIikgfHwgdXJsLmluY2x1ZGVzKFwiZm94bmV3c1wiKSkgY29udGV4dCA9IFwiTmV3c1wiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJjb3Vyc2VyYVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJ1ZGVteVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJlZHhcIikgfHwgdXJsLmluY2x1ZGVzKFwia2hhbmFjYWRlbXlcIikgfHwgdXJsLmluY2x1ZGVzKFwiY2FudmFzXCIpKSBjb250ZXh0ID0gXCJFZHVjYXRpb25cIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwiZXhwZWRpYVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJib29raW5nXCIpIHx8IHVybC5pbmNsdWRlcyhcImFpcmJuYlwiKSB8fCB1cmwuaW5jbHVkZXMoXCJ0cmlwYWR2aXNvclwiKSB8fCB1cmwuaW5jbHVkZXMoXCJrYXlha1wiKSkgY29udGV4dCA9IFwiVHJhdmVsXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcIndlYm1kXCIpIHx8IHVybC5pbmNsdWRlcyhcIm1heW9jbGluaWNcIikgfHwgdXJsLmluY2x1ZGVzKFwibmloLmdvdlwiKSB8fCB1cmwuaW5jbHVkZXMoXCJoZWFsdGhcIikpIGNvbnRleHQgPSBcIkhlYWx0aFwiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJlc3BuXCIpIHx8IHVybC5pbmNsdWRlcyhcIm5iYVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJuZmxcIikgfHwgdXJsLmluY2x1ZGVzKFwibWxiXCIpIHx8IHVybC5pbmNsdWRlcyhcImZpZmFcIikpIGNvbnRleHQgPSBcIlNwb3J0c1wiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJ0ZWNoY3J1bmNoXCIpIHx8IHVybC5pbmNsdWRlcyhcIndpcmVkXCIpIHx8IHVybC5pbmNsdWRlcyhcInRoZXZlcmdlXCIpIHx8IHVybC5pbmNsdWRlcyhcImFyc3RlY2huaWNhXCIpKSBjb250ZXh0ID0gXCJUZWNobm9sb2d5XCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcInNjaWVuY2VcIikgfHwgdXJsLmluY2x1ZGVzKFwibmF0dXJlLmNvbVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJuYXNhLmdvdlwiKSkgY29udGV4dCA9IFwiU2NpZW5jZVwiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJ0d2l0Y2hcIikgfHwgdXJsLmluY2x1ZGVzKFwic3RlYW1cIikgfHwgdXJsLmluY2x1ZGVzKFwicm9ibG94XCIpIHx8IHVybC5pbmNsdWRlcyhcImlnblwiKSB8fCB1cmwuaW5jbHVkZXMoXCJnYW1lc3BvdFwiKSkgY29udGV4dCA9IFwiR2FtaW5nXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcInNvdW5kY2xvdWRcIikgfHwgdXJsLmluY2x1ZGVzKFwiYmFuZGNhbXBcIikgfHwgdXJsLmluY2x1ZGVzKFwibGFzdC5mbVwiKSkgY29udGV4dCA9IFwiTXVzaWNcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwiZGV2aWFudGFydFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJiZWhhbmNlXCIpIHx8IHVybC5pbmNsdWRlcyhcImRyaWJiYmxlXCIpIHx8IHVybC5pbmNsdWRlcyhcImFydHN0YXRpb25cIikpIGNvbnRleHQgPSBcIkFydFwiO1xuXG4gIHJldHVybiB7IGNvbnRleHQsIHNvdXJjZTogJ0hldXJpc3RpYycgfTtcbn07XG4iLCAiaW1wb3J0IHsgZ3JvdXBUYWJzLCBnZXRDdXN0b21TdHJhdGVnaWVzLCBnZXRGaWVsZFZhbHVlLCByZXF1aXJlc0NvbnRleHRBbmFseXNpcyB9IGZyb20gXCIuL2dyb3VwaW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgc29ydFRhYnMsIGNvbXBhcmVCeSB9IGZyb20gXCIuL3NvcnRpbmdTdHJhdGVnaWVzLmpzXCI7XG5pbXBvcnQgeyBhbmFseXplVGFiQ29udGV4dCB9IGZyb20gXCIuL2NvbnRleHRBbmFseXNpcy5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcsIGxvZ0Vycm9yLCBsb2dJbmZvIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IEdyb3VwaW5nU2VsZWN0aW9uLCBQcmVmZXJlbmNlcywgVGFiR3JvdXAsIFRhYk1ldGFkYXRhLCBTb3J0aW5nUnVsZSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGdldFN0b3JlZFZhbHVlLCBzZXRTdG9yZWRWYWx1ZSB9IGZyb20gXCIuL3N0b3JhZ2UuanNcIjtcbmltcG9ydCB7IG1hcENocm9tZVRhYiwgYXNBcnJheSB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcblxuY29uc3QgZ2V0VGFic0ZvckZpbHRlciA9IGFzeW5jIChmaWx0ZXI/OiBHcm91cGluZ1NlbGVjdGlvbik6IFByb21pc2U8Y2hyb21lLnRhYnMuVGFiW10+ID0+IHtcbiAgY29uc3Qgd2luZG93SWRzID0gZmlsdGVyPy53aW5kb3dJZHM7XG4gIGNvbnN0IHRhYklkcyA9IGZpbHRlcj8udGFiSWRzO1xuICBjb25zdCBoYXNXaW5kb3dJZHMgPSB3aW5kb3dJZHMgJiYgd2luZG93SWRzLmxlbmd0aCA+IDA7XG4gIGNvbnN0IGhhc1RhYklkcyA9IHRhYklkcyAmJiB0YWJJZHMubGVuZ3RoID4gMDtcblxuICBpZiAoIWZpbHRlciB8fCAoIWhhc1dpbmRvd0lkcyAmJiAhaGFzVGFiSWRzKSkge1xuICAgIHJldHVybiBjaHJvbWUudGFicy5xdWVyeSh7fSk7XG4gIH1cblxuICBjb25zdCBwcm9taXNlczogUHJvbWlzZTxhbnk+W10gPSBbXTtcblxuICBpZiAoaGFzV2luZG93SWRzKSB7XG4gICAgd2luZG93SWRzLmZvckVhY2god2luZG93SWQgPT4ge1xuICAgICAgcHJvbWlzZXMucHVzaChjaHJvbWUudGFicy5xdWVyeSh7IHdpbmRvd0lkIH0pLmNhdGNoKCgpID0+IFtdKSk7XG4gICAgfSk7XG4gIH1cblxuICBpZiAoaGFzVGFiSWRzKSB7XG4gICAgdGFiSWRzLmZvckVhY2godGFiSWQgPT4ge1xuICAgICAgcHJvbWlzZXMucHVzaChjaHJvbWUudGFicy5nZXQodGFiSWQpLmNhdGNoKCgpID0+IG51bGwpKTtcbiAgICB9KTtcbiAgfVxuXG4gIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG5cbiAgLy8gRmxhdHRlbiBhbmQgZmlsdGVyIG91dCBudWxsc1xuICBjb25zdCBhbGxUYWJzOiBjaHJvbWUudGFicy5UYWJbXSA9IFtdO1xuICBmb3IgKGNvbnN0IHJlcyBvZiByZXN1bHRzKSB7XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShyZXMpKSB7XG4gICAgICAgICAgYWxsVGFicy5wdXNoKC4uLnJlcyk7XG4gICAgICB9IGVsc2UgaWYgKHJlcykge1xuICAgICAgICAgIGFsbFRhYnMucHVzaChyZXMpO1xuICAgICAgfVxuICB9XG5cbiAgLy8gRGVkdXBsaWNhdGUgYnkgSURcbiAgY29uc3QgdW5pcXVlVGFicyA9IG5ldyBNYXA8bnVtYmVyLCBjaHJvbWUudGFicy5UYWI+KCk7XG4gIGZvciAoY29uc3QgdGFiIG9mIGFsbFRhYnMpIHtcbiAgICAgIGlmICh0YWIuaWQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHVuaXF1ZVRhYnMuc2V0KHRhYi5pZCwgdGFiKTtcbiAgICAgIH1cbiAgfVxuXG4gIHJldHVybiBBcnJheS5mcm9tKHVuaXF1ZVRhYnMudmFsdWVzKCkpO1xufTtcblxuZXhwb3J0IGNvbnN0IGZldGNoQ3VycmVudFRhYkdyb3VwcyA9IGFzeW5jIChcbiAgcHJlZmVyZW5jZXM6IFByZWZlcmVuY2VzLFxuICBvblByb2dyZXNzPzogKGNvbXBsZXRlZDogbnVtYmVyLCB0b3RhbDogbnVtYmVyKSA9PiB2b2lkXG4pOiBQcm9taXNlPFRhYkdyb3VwW10+ID0+IHtcbiAgdHJ5IHtcbiAgY29uc3QgdGFicyA9IGF3YWl0IGNocm9tZS50YWJzLnF1ZXJ5KHt9KTtcbiAgY29uc3QgZ3JvdXBzID0gYXdhaXQgY2hyb21lLnRhYkdyb3Vwcy5xdWVyeSh7fSk7XG4gIGNvbnN0IGdyb3VwTWFwID0gbmV3IE1hcChncm91cHMubWFwKGcgPT4gW2cuaWQsIGddKSk7XG5cbiAgLy8gTWFwIHRhYnMgdG8gbWV0YWRhdGFcbiAgY29uc3QgbWFwcGVkID0gdGFicy5tYXAobWFwQ2hyb21lVGFiKS5maWx0ZXIoKHQpOiB0IGlzIFRhYk1ldGFkYXRhID0+IEJvb2xlYW4odCkpO1xuXG4gIGlmIChyZXF1aXJlc0NvbnRleHRBbmFseXNpcyhwcmVmZXJlbmNlcy5zb3J0aW5nKSkge1xuICAgICAgY29uc3QgY29udGV4dE1hcCA9IGF3YWl0IGFuYWx5emVUYWJDb250ZXh0KG1hcHBlZCwgb25Qcm9ncmVzcyk7XG4gICAgICBtYXBwZWQuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgICBjb25zdCByZXMgPSBjb250ZXh0TWFwLmdldCh0YWIuaWQpO1xuICAgICAgICB0YWIuY29udGV4dCA9IHJlcz8uY29udGV4dDtcbiAgICAgICAgdGFiLmNvbnRleHREYXRhID0gcmVzPy5kYXRhO1xuICAgICAgfSk7XG4gIH1cblxuICBjb25zdCByZXN1bHRHcm91cHM6IFRhYkdyb3VwW10gPSBbXTtcbiAgY29uc3QgdGFic0J5R3JvdXBJZCA9IG5ldyBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YVtdPigpO1xuICBjb25zdCB0YWJzQnlXaW5kb3dVbmdyb3VwZWQgPSBuZXcgTWFwPG51bWJlciwgVGFiTWV0YWRhdGFbXT4oKTtcblxuICBtYXBwZWQuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgY29uc3QgZ3JvdXBJZCA9IHRhYi5ncm91cElkID8/IC0xO1xuICAgICAgaWYgKGdyb3VwSWQgIT09IC0xKSB7XG4gICAgICAgICAgaWYgKCF0YWJzQnlHcm91cElkLmhhcyhncm91cElkKSkgdGFic0J5R3JvdXBJZC5zZXQoZ3JvdXBJZCwgW10pO1xuICAgICAgICAgIHRhYnNCeUdyb3VwSWQuZ2V0KGdyb3VwSWQpIS5wdXNoKHRhYik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgICBpZiAoIXRhYnNCeVdpbmRvd1VuZ3JvdXBlZC5oYXModGFiLndpbmRvd0lkKSkgdGFic0J5V2luZG93VW5ncm91cGVkLnNldCh0YWIud2luZG93SWQsIFtdKTtcbiAgICAgICAgICAgdGFic0J5V2luZG93VW5ncm91cGVkLmdldCh0YWIud2luZG93SWQpIS5wdXNoKHRhYik7XG4gICAgICB9XG4gIH0pO1xuXG4gIC8vIENyZWF0ZSBUYWJHcm91cCBvYmplY3RzIGZvciBhY3R1YWwgZ3JvdXBzXG4gIGZvciAoY29uc3QgW2dyb3VwSWQsIGdyb3VwVGFic10gb2YgdGFic0J5R3JvdXBJZCkge1xuICAgICAgY29uc3QgYnJvd3Nlckdyb3VwID0gZ3JvdXBNYXAuZ2V0KGdyb3VwSWQpO1xuICAgICAgaWYgKGJyb3dzZXJHcm91cCkge1xuICAgICAgICAgIHJlc3VsdEdyb3Vwcy5wdXNoKHtcbiAgICAgICAgICAgICAgaWQ6IGBncm91cC0ke2dyb3VwSWR9YCxcbiAgICAgICAgICAgICAgd2luZG93SWQ6IGJyb3dzZXJHcm91cC53aW5kb3dJZCxcbiAgICAgICAgICAgICAgbGFiZWw6IGJyb3dzZXJHcm91cC50aXRsZSB8fCBcIlVudGl0bGVkIEdyb3VwXCIsXG4gICAgICAgICAgICAgIGNvbG9yOiBicm93c2VyR3JvdXAuY29sb3IsXG4gICAgICAgICAgICAgIHRhYnM6IHNvcnRUYWJzKGdyb3VwVGFicywgcHJlZmVyZW5jZXMuc29ydGluZyksXG4gICAgICAgICAgICAgIHJlYXNvbjogXCJNYW51YWxcIlxuICAgICAgICAgIH0pO1xuICAgICAgfVxuICB9XG5cbiAgLy8gSGFuZGxlIHVuZ3JvdXBlZCB0YWJzXG4gIGZvciAoY29uc3QgW3dpbmRvd0lkLCB0YWJzXSBvZiB0YWJzQnlXaW5kb3dVbmdyb3VwZWQpIHtcbiAgICAgIHJlc3VsdEdyb3Vwcy5wdXNoKHtcbiAgICAgICAgICBpZDogYHVuZ3JvdXBlZC0ke3dpbmRvd0lkfWAsXG4gICAgICAgICAgd2luZG93SWQ6IHdpbmRvd0lkLFxuICAgICAgICAgIGxhYmVsOiBcIlVuZ3JvdXBlZFwiLFxuICAgICAgICAgIGNvbG9yOiBcImdyZXlcIixcbiAgICAgICAgICB0YWJzOiBzb3J0VGFicyh0YWJzLCBwcmVmZXJlbmNlcy5zb3J0aW5nKSxcbiAgICAgICAgICByZWFzb246IFwiVW5ncm91cGVkXCJcbiAgICAgIH0pO1xuICB9XG5cbiAgbG9nSW5mbyhcIkZldGNoZWQgY3VycmVudCB0YWIgZ3JvdXBzXCIsIHsgZ3JvdXBzOiByZXN1bHRHcm91cHMubGVuZ3RoLCB0YWJzOiBtYXBwZWQubGVuZ3RoIH0pO1xuICByZXR1cm4gcmVzdWx0R3JvdXBzO1xuICB9IGNhdGNoIChlKSB7XG4gICAgbG9nRXJyb3IoXCJFcnJvciBpbiBmZXRjaEN1cnJlbnRUYWJHcm91cHNcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgIHRocm93IGU7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBjYWxjdWxhdGVUYWJHcm91cHMgPSBhc3luYyAoXG4gIHByZWZlcmVuY2VzOiBQcmVmZXJlbmNlcyxcbiAgZmlsdGVyPzogR3JvdXBpbmdTZWxlY3Rpb24sXG4gIG9uUHJvZ3Jlc3M/OiAoY29tcGxldGVkOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+IHZvaWRcbik6IFByb21pc2U8VGFiR3JvdXBbXT4gPT4ge1xuICBjb25zdCBjaHJvbWVUYWJzID0gYXdhaXQgZ2V0VGFic0ZvckZpbHRlcihmaWx0ZXIpO1xuICBjb25zdCB3aW5kb3dJZFNldCA9IG5ldyBTZXQoZmlsdGVyPy53aW5kb3dJZHMgPz8gW10pO1xuICBjb25zdCB0YWJJZFNldCA9IG5ldyBTZXQoZmlsdGVyPy50YWJJZHMgPz8gW10pO1xuICBjb25zdCBoYXNGaWx0ZXJzID0gd2luZG93SWRTZXQuc2l6ZSA+IDAgfHwgdGFiSWRTZXQuc2l6ZSA+IDA7XG4gIGNvbnN0IGZpbHRlcmVkVGFicyA9IGNocm9tZVRhYnMuZmlsdGVyKCh0YWIpID0+IHtcbiAgICBpZiAoIWhhc0ZpbHRlcnMpIHJldHVybiB0cnVlO1xuICAgIHJldHVybiAodGFiLndpbmRvd0lkICYmIHdpbmRvd0lkU2V0Lmhhcyh0YWIud2luZG93SWQpKSB8fCAodGFiLmlkICYmIHRhYklkU2V0Lmhhcyh0YWIuaWQpKTtcbiAgfSk7XG4gIGNvbnN0IG1hcHBlZCA9IGZpbHRlcmVkVGFic1xuICAgIC5tYXAobWFwQ2hyb21lVGFiKVxuICAgIC5maWx0ZXIoKHRhYik6IHRhYiBpcyBUYWJNZXRhZGF0YSA9PiBCb29sZWFuKHRhYikpO1xuXG4gIGlmIChyZXF1aXJlc0NvbnRleHRBbmFseXNpcyhwcmVmZXJlbmNlcy5zb3J0aW5nKSkge1xuICAgIGNvbnN0IGNvbnRleHRNYXAgPSBhd2FpdCBhbmFseXplVGFiQ29udGV4dChtYXBwZWQsIG9uUHJvZ3Jlc3MpO1xuICAgIG1hcHBlZC5mb3JFYWNoKHRhYiA9PiB7XG4gICAgICBjb25zdCByZXMgPSBjb250ZXh0TWFwLmdldCh0YWIuaWQpO1xuICAgICAgdGFiLmNvbnRleHQgPSByZXM/LmNvbnRleHQ7XG4gICAgICB0YWIuY29udGV4dERhdGEgPSByZXM/LmRhdGE7XG4gICAgfSk7XG4gIH1cblxuICBjb25zdCBncm91cGVkID0gZ3JvdXBUYWJzKG1hcHBlZCwgcHJlZmVyZW5jZXMuc29ydGluZyk7XG4gIGdyb3VwZWQuZm9yRWFjaCgoZ3JvdXApID0+IHtcbiAgICBncm91cC50YWJzID0gc29ydFRhYnMoZ3JvdXAudGFicywgcHJlZmVyZW5jZXMuc29ydGluZyk7XG4gIH0pO1xuICBsb2dJbmZvKFwiQ2FsY3VsYXRlZCB0YWIgZ3JvdXBzXCIsIHsgZ3JvdXBzOiBncm91cGVkLmxlbmd0aCwgdGFiczogbWFwcGVkLmxlbmd0aCB9KTtcbiAgcmV0dXJuIGdyb3VwZWQ7XG59O1xuXG5jb25zdCBWQUxJRF9DT0xPUlMgPSBbXCJncmV5XCIsIFwiYmx1ZVwiLCBcInJlZFwiLCBcInllbGxvd1wiLCBcImdyZWVuXCIsIFwicGlua1wiLCBcInB1cnBsZVwiLCBcImN5YW5cIiwgXCJvcmFuZ2VcIl07XG5cbmV4cG9ydCBjb25zdCBhcHBseVRhYkdyb3VwcyA9IGFzeW5jIChncm91cHM6IFRhYkdyb3VwW10pID0+IHtcbiAgY29uc3QgY2xhaW1lZEdyb3VwSWRzID0gbmV3IFNldDxudW1iZXI+KCk7XG5cbiAgZm9yIChjb25zdCBncm91cCBvZiBncm91cHMpIHtcbiAgICBsZXQgdGFic1RvUHJvY2VzczogeyB3aW5kb3dJZDogbnVtYmVyLCB0YWJzOiBUYWJNZXRhZGF0YVtdIH1bXSA9IFtdO1xuXG4gICAgaWYgKGdyb3VwLndpbmRvd01vZGUgPT09ICduZXcnKSB7XG4gICAgICBpZiAoZ3JvdXAudGFicy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgZmlyc3QgPSBncm91cC50YWJzWzBdO1xuICAgICAgICAgIGNvbnN0IHdpbiA9IGF3YWl0IGNocm9tZS53aW5kb3dzLmNyZWF0ZSh7IHRhYklkOiBmaXJzdC5pZCB9KTtcbiAgICAgICAgICBjb25zdCB3aW5JZCA9IHdpbi5pZCE7XG4gICAgICAgICAgY29uc3Qgb3RoZXJzID0gZ3JvdXAudGFicy5zbGljZSgxKS5tYXAodCA9PiB0LmlkKTtcbiAgICAgICAgICBpZiAob3RoZXJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGF3YWl0IGNocm9tZS50YWJzLm1vdmUob3RoZXJzLCB7IHdpbmRvd0lkOiB3aW5JZCwgaW5kZXg6IC0xIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0YWJzVG9Qcm9jZXNzLnB1c2goeyB3aW5kb3dJZDogd2luSWQsIHRhYnM6IGdyb3VwLnRhYnMgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBsb2dFcnJvcihcIkVycm9yIGNyZWF0aW5nIG5ldyB3aW5kb3cgZm9yIGdyb3VwXCIsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZ3JvdXAud2luZG93TW9kZSA9PT0gJ2NvbXBvdW5kJykge1xuICAgICAgaWYgKGdyb3VwLnRhYnMubGVuZ3RoID4gMCkge1xuICAgICAgICAvLyBEZXRlcm1pbmUgdGFyZ2V0IHdpbmRvdyAobWFqb3JpdHkgd2lucylcbiAgICAgICAgY29uc3QgY291bnRzID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcj4oKTtcbiAgICAgICAgZ3JvdXAudGFicy5mb3JFYWNoKHQgPT4gY291bnRzLnNldCh0LndpbmRvd0lkLCAoY291bnRzLmdldCh0LndpbmRvd0lkKSB8fCAwKSArIDEpKTtcbiAgICAgICAgbGV0IHRhcmdldFdpbmRvd0lkID0gZ3JvdXAudGFic1swXS53aW5kb3dJZDtcbiAgICAgICAgbGV0IG1heCA9IDA7XG4gICAgICAgIGZvciAoY29uc3QgW3dpZCwgY291bnRdIG9mIGNvdW50cykge1xuICAgICAgICAgIGlmIChjb3VudCA+IG1heCkgeyBtYXggPSBjb3VudDsgdGFyZ2V0V2luZG93SWQgPSB3aWQ7IH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE1vdmUgdGFicyBub3QgaW4gdGFyZ2V0XG4gICAgICAgIGNvbnN0IHRvTW92ZSA9IGdyb3VwLnRhYnMuZmlsdGVyKHQgPT4gdC53aW5kb3dJZCAhPT0gdGFyZ2V0V2luZG93SWQpLm1hcCh0ID0+IHQuaWQpO1xuICAgICAgICBpZiAodG9Nb3ZlLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMubW92ZSh0b01vdmUsIHsgd2luZG93SWQ6IHRhcmdldFdpbmRvd0lkLCBpbmRleDogLTEgfSk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgbG9nRXJyb3IoXCJFcnJvciBtb3ZpbmcgdGFicyBmb3IgY29tcG91bmQgZ3JvdXBcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0YWJzVG9Qcm9jZXNzLnB1c2goeyB3aW5kb3dJZDogdGFyZ2V0V2luZG93SWQsIHRhYnM6IGdyb3VwLnRhYnMgfSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIEN1cnJlbnQgbW9kZTogc3BsaXQgYnkgc291cmNlIHdpbmRvd1xuICAgICAgY29uc3QgbWFwID0gZ3JvdXAudGFicy5yZWR1Y2U8TWFwPG51bWJlciwgVGFiTWV0YWRhdGFbXT4+KChhY2MsIHRhYikgPT4ge1xuICAgICAgICBjb25zdCBleGlzdGluZyA9IGFjYy5nZXQodGFiLndpbmRvd0lkKSA/PyBbXTtcbiAgICAgICAgZXhpc3RpbmcucHVzaCh0YWIpO1xuICAgICAgICBhY2Muc2V0KHRhYi53aW5kb3dJZCwgZXhpc3RpbmcpO1xuICAgICAgICByZXR1cm4gYWNjO1xuICAgICAgfSwgbmV3IE1hcCgpKTtcbiAgICAgIGZvciAoY29uc3QgW3dpZCwgdF0gb2YgbWFwKSB7XG4gICAgICAgIHRhYnNUb1Byb2Nlc3MucHVzaCh7IHdpbmRvd0lkOiB3aWQsIHRhYnM6IHQgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCB7IHdpbmRvd0lkOiB0YXJnZXRXaW5JZCwgdGFicyB9IG9mIHRhYnNUb1Byb2Nlc3MpIHtcbiAgICAgIC8vIEZpbmQgY2FuZGlkYXRlIGdyb3VwIElEIHRvIHJldXNlXG4gICAgICBsZXQgY2FuZGlkYXRlR3JvdXBJZDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuICAgICAgY29uc3QgY291bnRzID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcj4oKTtcbiAgICAgIGZvciAoY29uc3QgdCBvZiB0YWJzKSB7XG4gICAgICAgIC8vIE9ubHkgY29uc2lkZXIgZ3JvdXBzIHRoYXQgd2VyZSBhbHJlYWR5IGluIHRoaXMgd2luZG93XG4gICAgICAgIGlmICh0Lmdyb3VwSWQgJiYgdC5ncm91cElkICE9PSAtMSAmJiB0LndpbmRvd0lkID09PSB0YXJnZXRXaW5JZCkge1xuICAgICAgICAgIGNvdW50cy5zZXQodC5ncm91cElkLCAoY291bnRzLmdldCh0Lmdyb3VwSWQpIHx8IDApICsgMSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gUHJpb3JpdGl6ZSB0aGUgbW9zdCBmcmVxdWVudCBncm91cCBJRCB0aGF0IGhhc24ndCBiZWVuIGNsYWltZWQgeWV0XG4gICAgICBjb25zdCBzb3J0ZWRDYW5kaWRhdGVzID0gQXJyYXkuZnJvbShjb3VudHMuZW50cmllcygpKVxuICAgICAgICAuc29ydCgoYSwgYikgPT4gYlsxXSAtIGFbMV0pXG4gICAgICAgIC5tYXAoKFtpZF0pID0+IGlkKTtcblxuICAgICAgZm9yIChjb25zdCBpZCBvZiBzb3J0ZWRDYW5kaWRhdGVzKSB7XG4gICAgICAgIGlmICghY2xhaW1lZEdyb3VwSWRzLmhhcyhpZCkpIHtcbiAgICAgICAgICBjYW5kaWRhdGVHcm91cElkID0gaWQ7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgbGV0IGZpbmFsR3JvdXBJZDogbnVtYmVyO1xuXG4gICAgICBpZiAoY2FuZGlkYXRlR3JvdXBJZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGNsYWltZWRHcm91cElkcy5hZGQoY2FuZGlkYXRlR3JvdXBJZCk7XG4gICAgICAgIGZpbmFsR3JvdXBJZCA9IGNhbmRpZGF0ZUdyb3VwSWQ7XG5cbiAgICAgICAgLy8gQ2xlYW4gdXAgbGVmdG92ZXJzIGFuZCBhZGQgbWlzc2luZyB0YWJzXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgZXhpc3RpbmdUYWJzID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoeyBncm91cElkOiBmaW5hbEdyb3VwSWQgfSk7XG4gICAgICAgICAgY29uc3QgZXhpc3RpbmdUYWJJZHMgPSBuZXcgU2V0KGV4aXN0aW5nVGFicy5tYXAodCA9PiB0LmlkKSk7XG4gICAgICAgICAgY29uc3QgdGFyZ2V0VGFiSWRzID0gbmV3IFNldCh0YWJzLm1hcCh0ID0+IHQuaWQpKTtcblxuICAgICAgICAgIC8vIDEuIFVuZ3JvdXAgdGFicyB0aGF0IHNob3VsZG4ndCBiZSBoZXJlXG4gICAgICAgICAgY29uc3QgbGVmdG92ZXJzID0gZXhpc3RpbmdUYWJzLmZpbHRlcih0ID0+IHQuaWQgIT09IHVuZGVmaW5lZCAmJiAhdGFyZ2V0VGFiSWRzLmhhcyh0LmlkKSk7XG4gICAgICAgICAgaWYgKGxlZnRvdmVycy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBhd2FpdCBjaHJvbWUudGFicy51bmdyb3VwKGxlZnRvdmVycy5tYXAodCA9PiB0LmlkISkpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIDIuIEFkZCBvbmx5IHRoZSB0YWJzIHRoYXQgYXJlbid0IGFscmVhZHkgaW4gdGhlIGdyb3VwXG4gICAgICAgICAgY29uc3QgdGFic1RvQWRkID0gdGFicy5maWx0ZXIodCA9PiAhZXhpc3RpbmdUYWJJZHMuaGFzKHQuaWQpKTtcbiAgICAgICAgICBpZiAodGFic1RvQWRkLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAvLyBGb3IgbmV3L2NvbXBvdW5kLCB0YWJzIG1pZ2h0IGhhdmUgYmVlbiBtb3ZlZCwgc28gd2UgbXVzdCBwYXNzIHRhYklkc1xuICAgICAgICAgICAgIGF3YWl0IGNocm9tZS50YWJzLmdyb3VwKHsgZ3JvdXBJZDogZmluYWxHcm91cElkLCB0YWJJZHM6IHRhYnNUb0FkZC5tYXAodCA9PiB0LmlkKSB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBsb2dFcnJvcihcIkVycm9yIG1hbmFnaW5nIGdyb3VwIHJldXNlXCIsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gQ3JlYXRlIG5ldyBncm91cCAoZGVmYXVsdCBiZWhhdmlvcjogZXhwYW5kZWQpXG4gICAgICAgIC8vIEVuc3VyZSB3ZSBjcmVhdGUgaXQgaW4gdGhlIHRhcmdldCB3aW5kb3cgKGlmIHN0cmljdGx5IG5ldywgdGFiSWRzIGltcGxpZXMgd2luZG93IGlmIHRoZXkgYXJlIGluIGl0KVxuICAgICAgICAvLyBJZiB0YWJzIHdlcmUganVzdCBtb3ZlZCwgdGhleSBhcmUgaW4gdGFyZ2V0V2luSWQuXG4gICAgICAgIC8vIGNocm9tZS50YWJzLmdyb3VwIHdpdGggdGFiSWRzIHdpbGwgaW5mZXIgd2luZG93IGZyb20gdGFicy5cbiAgICAgICAgZmluYWxHcm91cElkID0gYXdhaXQgY2hyb21lLnRhYnMuZ3JvdXAoe1xuICAgICAgICAgIHRhYklkczogdGFicy5tYXAodCA9PiB0LmlkKSxcbiAgICAgICAgICBjcmVhdGVQcm9wZXJ0aWVzOiB7IHdpbmRvd0lkOiB0YXJnZXRXaW5JZCB9XG4gICAgICAgIH0pO1xuICAgICAgICBjbGFpbWVkR3JvdXBJZHMuYWRkKGZpbmFsR3JvdXBJZCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHVwZGF0ZVByb3BzOiBjaHJvbWUudGFiR3JvdXBzLlVwZGF0ZVByb3BlcnRpZXMgPSB7XG4gICAgICAgIHRpdGxlOiBncm91cC5sYWJlbFxuICAgICAgfTtcbiAgICAgIGlmIChWQUxJRF9DT0xPUlMuaW5jbHVkZXMoZ3JvdXAuY29sb3IpKSB7XG4gICAgICAgICAgdXBkYXRlUHJvcHMuY29sb3IgPSBncm91cC5jb2xvciBhcyBjaHJvbWUudGFiR3JvdXBzLkNvbG9yRW51bTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IGNocm9tZS50YWJHcm91cHMudXBkYXRlKGZpbmFsR3JvdXBJZCwgdXBkYXRlUHJvcHMpO1xuICAgIH1cbiAgfVxuICBsb2dJbmZvKFwiQXBwbGllZCB0YWIgZ3JvdXBzXCIsIHsgY291bnQ6IGdyb3Vwcy5sZW5ndGggfSk7XG59O1xuXG5leHBvcnQgY29uc3QgYXBwbHlUYWJTb3J0aW5nID0gYXN5bmMgKFxuICBwcmVmZXJlbmNlczogUHJlZmVyZW5jZXMsXG4gIGZpbHRlcj86IEdyb3VwaW5nU2VsZWN0aW9uLFxuICBvblByb2dyZXNzPzogKGNvbXBsZXRlZDogbnVtYmVyLCB0b3RhbDogbnVtYmVyKSA9PiB2b2lkXG4pID0+IHtcbiAgY29uc3QgdGFyZ2V0V2luZG93SWRzID0gbmV3IFNldDxudW1iZXI+KCk7XG4gIGxldCBjaHJvbWVUYWJzOiBjaHJvbWUudGFicy5UYWJbXSA9IFtdO1xuXG4gIGNvbnN0IGV4cGxpY2l0V2luZG93SWRzID0gZmlsdGVyPy53aW5kb3dJZHMgPz8gW107XG4gIGNvbnN0IGV4cGxpY2l0VGFiSWRzID0gZmlsdGVyPy50YWJJZHMgPz8gW107XG4gIGNvbnN0IGhhc0ZpbHRlciA9IGV4cGxpY2l0V2luZG93SWRzLmxlbmd0aCA+IDAgfHwgZXhwbGljaXRUYWJJZHMubGVuZ3RoID4gMDtcblxuICBpZiAoIWhhc0ZpbHRlcikge1xuICAgICAgY2hyb21lVGFicyA9IGF3YWl0IGNocm9tZS50YWJzLnF1ZXJ5KHt9KTtcbiAgICAgIGNocm9tZVRhYnMuZm9yRWFjaCh0ID0+IHsgaWYgKHQud2luZG93SWQpIHRhcmdldFdpbmRvd0lkcy5hZGQodC53aW5kb3dJZCk7IH0pO1xuICB9IGVsc2Uge1xuICAgICAgZXhwbGljaXRXaW5kb3dJZHMuZm9yRWFjaChpZCA9PiB0YXJnZXRXaW5kb3dJZHMuYWRkKGlkKSk7XG5cbiAgICAgIGlmIChleHBsaWNpdFRhYklkcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgY29uc3Qgc3BlY2lmaWNUYWJzID0gYXdhaXQgUHJvbWlzZS5hbGwoZXhwbGljaXRUYWJJZHMubWFwKGlkID0+IGNocm9tZS50YWJzLmdldChpZCkuY2F0Y2goKCkgPT4gbnVsbCkpKTtcbiAgICAgICAgICBzcGVjaWZpY1RhYnMuZm9yRWFjaCh0ID0+IHtcbiAgICAgICAgICAgICAgaWYgKHQgJiYgdC53aW5kb3dJZCkgdGFyZ2V0V2luZG93SWRzLmFkZCh0LndpbmRvd0lkKTtcbiAgICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgd2luZG93UHJvbWlzZXMgPSBBcnJheS5mcm9tKHRhcmdldFdpbmRvd0lkcykubWFwKHdpbmRvd0lkID0+XG4gICAgICAgICAgY2hyb21lLnRhYnMucXVlcnkoeyB3aW5kb3dJZCB9KS5jYXRjaCgoKSA9PiBbXSlcbiAgICAgICk7XG4gICAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGwod2luZG93UHJvbWlzZXMpO1xuICAgICAgY2hyb21lVGFicyA9IHJlc3VsdHMuZmxhdCgpO1xuICB9XG5cbiAgZm9yIChjb25zdCB3aW5kb3dJZCBvZiB0YXJnZXRXaW5kb3dJZHMpIHtcbiAgICAgIGNvbnN0IHdpbmRvd1RhYnMgPSBjaHJvbWVUYWJzLmZpbHRlcih0ID0+IHQud2luZG93SWQgPT09IHdpbmRvd0lkKTtcbiAgICAgIGNvbnN0IG1hcHBlZCA9IHdpbmRvd1RhYnMubWFwKG1hcENocm9tZVRhYikuZmlsdGVyKCh0KTogdCBpcyBUYWJNZXRhZGF0YSA9PiBCb29sZWFuKHQpKTtcblxuICAgICAgaWYgKHJlcXVpcmVzQ29udGV4dEFuYWx5c2lzKHByZWZlcmVuY2VzLnNvcnRpbmcpKSB7XG4gICAgICAgIGNvbnN0IGNvbnRleHRNYXAgPSBhd2FpdCBhbmFseXplVGFiQ29udGV4dChtYXBwZWQsIG9uUHJvZ3Jlc3MpO1xuICAgICAgICBtYXBwZWQuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgICAgIGNvbnN0IHJlcyA9IGNvbnRleHRNYXAuZ2V0KHRhYi5pZCk7XG4gICAgICAgICAgdGFiLmNvbnRleHQgPSByZXM/LmNvbnRleHQ7XG4gICAgICAgICAgdGFiLmNvbnRleHREYXRhID0gcmVzPy5kYXRhO1xuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgLy8gR3JvdXAgdGFicyBieSBncm91cElkIHRvIHNvcnQgd2l0aGluIGdyb3Vwc1xuICAgICAgY29uc3QgdGFic0J5R3JvdXAgPSBuZXcgTWFwPG51bWJlciwgVGFiTWV0YWRhdGFbXT4oKTtcbiAgICAgIGNvbnN0IHVuZ3JvdXBlZFRhYnM6IFRhYk1ldGFkYXRhW10gPSBbXTtcblxuICAgICAgbWFwcGVkLmZvckVhY2godGFiID0+IHtcbiAgICAgICAgY29uc3QgZ3JvdXBJZCA9IHRhYi5ncm91cElkID8/IC0xO1xuICAgICAgICBpZiAoZ3JvdXBJZCAhPT0gLTEpIHtcbiAgICAgICAgICBjb25zdCBncm91cCA9IHRhYnNCeUdyb3VwLmdldChncm91cElkKSA/PyBbXTtcbiAgICAgICAgICBncm91cC5wdXNoKHRhYik7XG4gICAgICAgICAgdGFic0J5R3JvdXAuc2V0KGdyb3VwSWQsIGdyb3VwKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB1bmdyb3VwZWRUYWJzLnB1c2godGFiKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vIDEuIFNvcnQgdGFicyB3aXRoaW4gZWFjaCBncm91cFxuICAgICAgZm9yIChjb25zdCBbZ3JvdXBJZCwgdGFic10gb2YgdGFic0J5R3JvdXApIHtcbiAgICAgICAgY29uc3QgZ3JvdXBUYWJJbmRpY2VzID0gd2luZG93VGFic1xuICAgICAgICAgIC5maWx0ZXIodCA9PiB0Lmdyb3VwSWQgPT09IGdyb3VwSWQpXG4gICAgICAgICAgLm1hcCh0ID0+IHQuaW5kZXgpXG4gICAgICAgICAgLnNvcnQoKGEsIGIpID0+IGEgLSBiKTtcblxuICAgICAgICBjb25zdCBzdGFydEluZGV4ID0gZ3JvdXBUYWJJbmRpY2VzWzBdID8/IDA7XG5cbiAgICAgICAgY29uc3Qgc29ydGVkR3JvdXBUYWJzID0gc29ydFRhYnModGFicywgcHJlZmVyZW5jZXMuc29ydGluZyk7XG4gICAgICAgIGNvbnN0IHNvcnRlZElkcyA9IHNvcnRlZEdyb3VwVGFicy5tYXAodCA9PiB0LmlkKTtcblxuICAgICAgICBpZiAoc29ydGVkSWRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMubW92ZShzb3J0ZWRJZHMsIHsgaW5kZXg6IHN0YXJ0SW5kZXggfSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gMi4gU29ydCB1bmdyb3VwZWQgdGFic1xuICAgICAgaWYgKHVuZ3JvdXBlZFRhYnMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCBzb3J0ZWRVbmdyb3VwZWQgPSBzb3J0VGFicyh1bmdyb3VwZWRUYWJzLCBwcmVmZXJlbmNlcy5zb3J0aW5nKTtcbiAgICAgICAgY29uc3Qgc29ydGVkSWRzID0gc29ydGVkVW5ncm91cGVkLm1hcCh0ID0+IHQuaWQpO1xuXG4gICAgICAgIC8vIE1vdmUgdG8gaW5kZXggMCAodG9wIG9mIHdpbmRvdylcbiAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMubW92ZShzb3J0ZWRJZHMsIHsgaW5kZXg6IDAgfSk7XG4gICAgICB9XG5cbiAgICAgIC8vIDMuIFNvcnQgR3JvdXBzIChpZiBlbmFibGVkKVxuICAgICAgYXdhaXQgc29ydEdyb3Vwc0lmRW5hYmxlZCh3aW5kb3dJZCwgcHJlZmVyZW5jZXMuc29ydGluZywgdGFic0J5R3JvdXApO1xuICB9XG4gIGxvZ0luZm8oXCJBcHBsaWVkIHRhYiBzb3J0aW5nXCIpO1xufTtcblxuY29uc3QgY29tcGFyZUJ5U29ydGluZ1J1bGVzID0gKHNvcnRpbmdSdWxlc0FyZzogU29ydGluZ1J1bGVbXSwgYTogVGFiTWV0YWRhdGEsIGI6IFRhYk1ldGFkYXRhKTogbnVtYmVyID0+IHtcbiAgY29uc3Qgc29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KHNvcnRpbmdSdWxlc0FyZyk7XG4gIGlmIChzb3J0UnVsZXNMaXN0Lmxlbmd0aCA9PT0gMCkgcmV0dXJuIDA7XG5cbiAgdHJ5IHtcbiAgICBmb3IgKGNvbnN0IHJ1bGUgb2Ygc29ydFJ1bGVzTGlzdCkge1xuICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHZhbEEgPSBnZXRGaWVsZFZhbHVlKGEsIHJ1bGUuZmllbGQpO1xuICAgICAgY29uc3QgdmFsQiA9IGdldEZpZWxkVmFsdWUoYiwgcnVsZS5maWVsZCk7XG5cbiAgICAgIGxldCByZXN1bHQgPSAwO1xuICAgICAgaWYgKHZhbEEgPCB2YWxCKSByZXN1bHQgPSAtMTtcbiAgICAgIGVsc2UgaWYgKHZhbEEgPiB2YWxCKSByZXN1bHQgPSAxO1xuXG4gICAgICBpZiAocmVzdWx0ICE9PSAwKSB7XG4gICAgICAgIHJldHVybiBydWxlLm9yZGVyID09PSBcImRlc2NcIiA/IC1yZXN1bHQgOiByZXN1bHQ7XG4gICAgICB9XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGxvZ0Vycm9yKFwiRXJyb3IgZXZhbHVhdGluZyBzb3J0aW5nIHJ1bGVzXCIsIHsgZXJyb3I6IFN0cmluZyhlcnJvcikgfSk7XG4gIH1cblxuICByZXR1cm4gMDtcbn07XG5cbmNvbnN0IHNvcnRHcm91cHNJZkVuYWJsZWQgPSBhc3luYyAoXG4gICAgd2luZG93SWQ6IG51bWJlcixcbiAgICBzb3J0aW5nUHJlZmVyZW5jZXM6IHN0cmluZ1tdLFxuICAgIHRhYnNCeUdyb3VwOiBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YVtdPlxuKSA9PiB7XG4gICAgLy8gQ2hlY2sgaWYgYW55IGFjdGl2ZSBzdHJhdGVneSBoYXMgc29ydEdyb3VwczogdHJ1ZVxuICAgIGNvbnN0IGN1c3RvbVN0cmF0cyA9IGdldEN1c3RvbVN0cmF0ZWdpZXMoKTtcbiAgICBsZXQgZ3JvdXBTb3J0ZXJTdHJhdGVneTogUmV0dXJuVHlwZTx0eXBlb2YgY3VzdG9tU3RyYXRzLmZpbmQ+IHwgbnVsbCA9IG51bGw7XG5cbiAgICBmb3IgKGNvbnN0IGlkIG9mIHNvcnRpbmdQcmVmZXJlbmNlcykge1xuICAgICAgICBjb25zdCBzdHJhdGVneSA9IGN1c3RvbVN0cmF0cy5maW5kKHMgPT4gcy5pZCA9PT0gaWQpO1xuICAgICAgICBpZiAoc3RyYXRlZ3kgJiYgKHN0cmF0ZWd5LnNvcnRHcm91cHMgfHwgKHN0cmF0ZWd5Lmdyb3VwU29ydGluZ1J1bGVzICYmIHN0cmF0ZWd5Lmdyb3VwU29ydGluZ1J1bGVzLmxlbmd0aCA+IDApKSkge1xuICAgICAgICAgICAgZ3JvdXBTb3J0ZXJTdHJhdGVneSA9IHN0cmF0ZWd5O1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoIWdyb3VwU29ydGVyU3RyYXRlZ3kpIHJldHVybjtcblxuICAgIC8vIEdldCBncm91cCBkZXRhaWxzXG4gICAgY29uc3QgZ3JvdXBzID0gYXdhaXQgY2hyb21lLnRhYkdyb3Vwcy5xdWVyeSh7IHdpbmRvd0lkIH0pO1xuICAgIGlmIChncm91cHMubGVuZ3RoIDw9IDEpIHJldHVybjtcblxuICAgIC8vIFdlIHNvcnQgZ3JvdXBzIGJhc2VkIG9uIHRoZSBzdHJhdGVneS5cbiAgICAvLyBTaW5jZSBjb21wYXJlQnkgZXhwZWN0cyBUYWJNZXRhZGF0YSwgd2UgbmVlZCB0byBjcmVhdGUgYSByZXByZXNlbnRhdGl2ZSBUYWJNZXRhZGF0YSBmb3IgZWFjaCBncm91cC5cbiAgICAvLyBXZSdsbCB1c2UgdGhlIGZpcnN0IHRhYiBvZiB0aGUgZ3JvdXAgKHNvcnRlZCkgYXMgdGhlIHJlcHJlc2VudGF0aXZlLlxuXG4gICAgY29uc3QgZ3JvdXBSZXBzOiB7IGdyb3VwOiBjaHJvbWUudGFiR3JvdXBzLlRhYkdyb3VwOyByZXA6IFRhYk1ldGFkYXRhIH1bXSA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBncm91cCBvZiBncm91cHMpIHtcbiAgICAgICAgY29uc3QgdGFicyA9IHRhYnNCeUdyb3VwLmdldChncm91cC5pZCk7XG4gICAgICAgIGlmICh0YWJzICYmIHRhYnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgLy8gdGFicyBhcmUgYWxyZWFkeSBzb3J0ZWQgYnkgc29ydFRhYnMgaW4gcHJldmlvdXMgc3RlcCBpZiB0aGF0IHN0cmF0ZWd5IHdhcyBhcHBsaWVkXG4gICAgICAgICAgICAvLyBvciB3ZSBqdXN0IHRha2UgdGhlIGZpcnN0IG9uZS5cbiAgICAgICAgICAgIC8vIElkZWFsbHkgd2UgdXNlIHRoZSBcImJlc3RcIiB0YWIuXG4gICAgICAgICAgICAvLyBCdXQgc2luY2Ugd2UgYWxyZWFkeSBzb3J0ZWQgdGFicyB3aXRoaW4gZ3JvdXBzLCB0YWJzWzBdIGlzIHRoZSBmaXJzdCBvbmUuXG4gICAgICAgICAgICBncm91cFJlcHMucHVzaCh7IGdyb3VwLCByZXA6IHRhYnNbMF0gfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBTb3J0IHRoZSBncm91cHNcbiAgICBpZiAoZ3JvdXBTb3J0ZXJTdHJhdGVneS5ncm91cFNvcnRpbmdSdWxlcyAmJiBBcnJheS5pc0FycmF5KGdyb3VwU29ydGVyU3RyYXRlZ3kuZ3JvdXBTb3J0aW5nUnVsZXMpICYmIGdyb3VwU29ydGVyU3RyYXRlZ3kuZ3JvdXBTb3J0aW5nUnVsZXMubGVuZ3RoID4gMCkge1xuICAgICAgICBncm91cFJlcHMuc29ydCgoYSwgYikgPT4gY29tcGFyZUJ5U29ydGluZ1J1bGVzKGdyb3VwU29ydGVyU3RyYXRlZ3khLmdyb3VwU29ydGluZ1J1bGVzISwgYS5yZXAsIGIucmVwKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgZ3JvdXBSZXBzLnNvcnQoKGEsIGIpID0+IGNvbXBhcmVCeShncm91cFNvcnRlclN0cmF0ZWd5IS5pZCwgYS5yZXAsIGIucmVwKSk7XG4gICAgfVxuXG4gICAgLy8gQXBwbHkgdGhlIG9yZGVyXG4gICAgLy8gY2hyb21lLnRhYkdyb3Vwcy5tb3ZlKGdyb3VwSWQsIHsgaW5kZXg6IC4uLiB9KVxuICAgIC8vIFdlIHdhbnQgdGhlbSB0byBiZSBhZnRlciB1bmdyb3VwZWQgdGFicyAod2hpY2ggYXJlIGF0IGluZGV4IDAuLk4pLlxuICAgIC8vIEFjdHVhbGx5LCBjaHJvbWUudGFiR3JvdXBzLm1vdmUgaW5kZXggaXMgdGhlIHRhYiBpbmRleCB3aGVyZSB0aGUgZ3JvdXAgc3RhcnRzLlxuICAgIC8vIElmIHdlIHdhbnQgdG8gc3RyaWN0bHkgb3JkZXIgZ3JvdXBzLCB3ZSBzaG91bGQgY2FsY3VsYXRlIHRoZSB0YXJnZXQgaW5kZXguXG4gICAgLy8gQnV0IHNpbmNlIGdyb3VwcyBhcmUgY29udGlndW91cyBibG9ja3Mgb2YgdGFicywgd2UganVzdCBuZWVkIHRvIHBsYWNlIHRoZW0gaW4gb3JkZXIuXG5cbiAgICAvLyBDYWxjdWxhdGUgdGhlIHN0YXJ0aW5nIGluZGV4IGZvciBncm91cHMuXG4gICAgLy8gVW5ncm91cGVkIHRhYnMgYXJlIGF0IHRoZSBzdGFydCAoaW5kZXggMCkuXG4gICAgLy8gU28gdGhlIGZpcnN0IGdyb3VwIHNob3VsZCBzdGFydCBhZnRlciB0aGUgbGFzdCB1bmdyb3VwZWQgdGFiLlxuICAgIC8vIFdhaXQsIGVhcmxpZXIgd2UgbW92ZWQgdW5ncm91cGVkIHRhYnMgdG8gaW5kZXggMC5cbiAgICAvLyBCdXQgd2UgbmVlZCB0byBrbm93IGhvdyBtYW55IHVuZ3JvdXBlZCB0YWJzIHRoZXJlIGFyZSBpbiB0aGlzIHdpbmRvdy5cblxuICAgIC8vIExldCdzIGdldCBjdXJyZW50IHRhYnMgYWdhaW4gb3IgdHJhY2sgY291bnQ/XG4gICAgLy8gV2UgY2FuIGFzc3VtZSB1bmdyb3VwZWQgdGFicyBhcmUgYXQgdGhlIHRvcC5cbiAgICAvLyBCdXQgYHRhYnNCeUdyb3VwYCBvbmx5IGNvbnRhaW5zIGdyb3VwZWQgdGFicy5cbiAgICAvLyBXZSBuZWVkIHRvIGtub3cgd2hlcmUgdG8gc3RhcnQgcGxhY2luZyBncm91cHMuXG4gICAgLy8gVGhlIHNhZmVzdCB3YXkgaXMgdG8gbW92ZSB0aGVtIG9uZSBieSBvbmUgdG8gdGhlIGVuZCAob3Igc3BlY2lmaWMgaW5kZXgpLlxuXG4gICAgLy8gSWYgd2UganVzdCBtb3ZlIHRoZW0gaW4gb3JkZXIgdG8gaW5kZXggLTEsIHRoZXkgd2lsbCBhcHBlbmQgdG8gdGhlIGVuZC5cbiAgICAvLyBJZiB3ZSB3YW50IHRoZW0gYWZ0ZXIgdW5ncm91cGVkIHRhYnMsIHdlIG5lZWQgdG8gZmluZCB0aGUgaW5kZXguXG5cbiAgICAvLyBMZXQncyB1c2UgaW5kZXggPSAtMSB0byBwdXNoIHRvIGVuZCwgc2VxdWVudGlhbGx5LlxuICAgIC8vIEJ1dCB3YWl0LCBpZiB3ZSBwdXNoIHRvIGVuZCwgdGhlIG9yZGVyIGlzIHByZXNlcnZlZD9cbiAgICAvLyBObywgaWYgd2UgaXRlcmF0ZSBzb3J0ZWQgZ3JvdXBzIGFuZCBtb3ZlIGVhY2ggdG8gLTEsIHRoZSBsYXN0IG9uZSBtb3ZlZCB3aWxsIGJlIGF0IHRoZSBlbmQuXG4gICAgLy8gU28gd2Ugc2hvdWxkIGl0ZXJhdGUgaW4gb3JkZXIgYW5kIG1vdmUgdG8gLTE/IE5vLCB0aGF0IHdvdWxkIHJldmVyc2UgdGhlbSBpZiB3ZSBjb25zaWRlciBcImVuZFwiLlxuICAgIC8vIEFjdHVhbGx5LCBpZiB3ZSBtb3ZlIEdyb3VwIEEgdG8gLTEsIGl0IGdvZXMgdG8gZW5kLiBUaGVuIEdyb3VwIEIgdG8gLTEsIGl0IGdvZXMgYWZ0ZXIgQS5cbiAgICAvLyBTbyBpdGVyYXRpbmcgaW4gc29ydGVkIG9yZGVyIGFuZCBtb3ZpbmcgdG8gLTEgd29ya3MgdG8gYXJyYW5nZSB0aGVtIGF0IHRoZSBlbmQgb2YgdGhlIHdpbmRvdy5cblxuICAgIC8vIEhvd2V2ZXIsIGlmIHRoZXJlIGFyZSBwaW5uZWQgdGFicyBvciB1bmdyb3VwZWQgdGFicywgdGhleSBzaG91bGQgc3RheSBhdCB0b3A/XG4gICAgLy8gVW5ncm91cGVkIHRhYnMgd2VyZSBtb3ZlZCB0byBpbmRleCAwLlxuICAgIC8vIFBpbm5lZCB0YWJzOiBgY2hyb21lLnRhYnMubW92ZWAgaGFuZGxlcyBwaW5uZWQgY29uc3RyYWludCAocGlubmVkIHRhYnMgbXVzdCBiZSBmaXJzdCkuXG4gICAgLy8gR3JvdXBzIGNhbm5vdCBjb250YWluIHBpbm5lZCB0YWJzLlxuICAgIC8vIFNvIGdyb3VwcyB3aWxsIGJlIGFmdGVyIHBpbm5lZCB0YWJzLlxuICAgIC8vIElmIHdlIG1vdmUgdG8gLTEsIHRoZXkgZ28gdG8gdGhlIHZlcnkgZW5kLlxuXG4gICAgLy8gV2hhdCBpZiB3ZSB3YW50IHRoZW0gc3BlY2lmaWNhbGx5IGFycmFuZ2VkP1xuICAgIC8vIElmIHdlIG1vdmUgdGhlbSBzZXF1ZW50aWFsbHkgdG8gLTEsIHRoZXkgd2lsbCBiZSBvcmRlcmVkIEEsIEIsIEMuLi4gYXQgdGhlIGJvdHRvbS5cbiAgICAvLyBUaGlzIHNlZW1zIGNvcnJlY3QgZm9yIFwic29ydGluZyBncm91cHNcIi5cblxuICAgIGZvciAoY29uc3QgaXRlbSBvZiBncm91cFJlcHMpIHtcbiAgICAgICAgYXdhaXQgY2hyb21lLnRhYkdyb3Vwcy5tb3ZlKGl0ZW0uZ3JvdXAuaWQsIHsgaW5kZXg6IC0xIH0pO1xuICAgIH1cbn07XG5cbmV4cG9ydCBjb25zdCBjbG9zZUdyb3VwID0gYXN5bmMgKGdyb3VwOiBUYWJHcm91cCkgPT4ge1xuICBjb25zdCBpZHMgPSBncm91cC50YWJzLm1hcCgodGFiKSA9PiB0YWIuaWQpO1xuICBhd2FpdCBjaHJvbWUudGFicy5yZW1vdmUoaWRzKTtcbiAgbG9nSW5mbyhcIkNsb3NlZCBncm91cFwiLCB7IGxhYmVsOiBncm91cC5sYWJlbCwgY291bnQ6IGlkcy5sZW5ndGggfSk7XG59O1xuXG5jb25zdCBnZXRUYWJzQnlJZHMgPSBhc3luYyAodGFiSWRzOiBudW1iZXJbXSk6IFByb21pc2U8Y2hyb21lLnRhYnMuVGFiW10+ID0+IHtcbiAgaWYgKCF0YWJJZHMubGVuZ3RoKSByZXR1cm4gW107XG4gIGNvbnN0IGFsbFRhYnMgPSBhd2FpdCBjaHJvbWUudGFicy5xdWVyeSh7fSk7XG4gIGNvbnN0IHRhYk1hcCA9IG5ldyBNYXAoYWxsVGFicy5tYXAodCA9PiBbdC5pZCwgdF0pKTtcbiAgcmV0dXJuIHRhYklkc1xuICAgIC5tYXAoaWQgPT4gdGFiTWFwLmdldChpZCkpXG4gICAgLmZpbHRlcigodCk6IHQgaXMgY2hyb21lLnRhYnMuVGFiID0+IHQgIT09IHVuZGVmaW5lZCAmJiB0LmlkICE9PSB1bmRlZmluZWQgJiYgdC53aW5kb3dJZCAhPT0gdW5kZWZpbmVkKTtcbn07XG5cbmV4cG9ydCBjb25zdCBtZXJnZVRhYnMgPSBhc3luYyAodGFiSWRzOiBudW1iZXJbXSkgPT4ge1xuICBpZiAoIXRhYklkcy5sZW5ndGgpIHJldHVybjtcbiAgY29uc3QgdmFsaWRUYWJzID0gYXdhaXQgZ2V0VGFic0J5SWRzKHRhYklkcyk7XG5cbiAgaWYgKHZhbGlkVGFicy5sZW5ndGggPT09IDApIHJldHVybjtcblxuICAvLyBUYXJnZXQgV2luZG93OiBUaGUgb25lIHdpdGggdGhlIG1vc3Qgc2VsZWN0ZWQgdGFicywgb3IgdGhlIGZpcnN0IG9uZS5cbiAgLy8gVXNpbmcgdGhlIGZpcnN0IHRhYidzIHdpbmRvdyBhcyB0aGUgdGFyZ2V0LlxuICBjb25zdCB0YXJnZXRXaW5kb3dJZCA9IHZhbGlkVGFic1swXS53aW5kb3dJZDtcblxuICAvLyAxLiBNb3ZlIHRhYnMgdG8gdGFyZ2V0IHdpbmRvd1xuICBjb25zdCB0YWJzVG9Nb3ZlID0gdmFsaWRUYWJzLmZpbHRlcih0ID0+IHQud2luZG93SWQgIT09IHRhcmdldFdpbmRvd0lkKTtcbiAgaWYgKHRhYnNUb01vdmUubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IG1vdmVJZHMgPSB0YWJzVG9Nb3ZlLm1hcCh0ID0+IHQuaWQhKTtcbiAgICBhd2FpdCBjaHJvbWUudGFicy5tb3ZlKG1vdmVJZHMsIHsgd2luZG93SWQ6IHRhcmdldFdpbmRvd0lkLCBpbmRleDogLTEgfSk7XG4gIH1cblxuICAvLyAyLiBHcm91cCB0aGVtXG4gIC8vIENoZWNrIGlmIHRoZXJlIGlzIGFuIGV4aXN0aW5nIGdyb3VwIGluIHRoZSB0YXJnZXQgd2luZG93IHRoYXQgd2FzIHBhcnQgb2YgdGhlIHNlbGVjdGlvbi5cbiAgLy8gV2UgcHJpb3JpdGl6ZSB0aGUgZ3JvdXAgb2YgdGhlIGZpcnN0IHRhYiBpZiBpdCBoYXMgb25lLlxuICBjb25zdCBmaXJzdFRhYkdyb3VwSWQgPSB2YWxpZFRhYnNbMF0uZ3JvdXBJZDtcbiAgbGV0IHRhcmdldEdyb3VwSWQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuICBpZiAoZmlyc3RUYWJHcm91cElkICYmIGZpcnN0VGFiR3JvdXBJZCAhPT0gLTEpIHtcbiAgICAgIC8vIFZlcmlmeSB0aGUgZ3JvdXAgaXMgaW4gdGhlIHRhcmdldCB3aW5kb3cgKGl0IHNob3VsZCBiZSwgYXMgd2UgcGlja2VkIHRhcmdldFdpbmRvd0lkIGZyb20gdmFsaWRUYWJzWzBdKVxuICAgICAgLy8gQnV0IGlmIHZhbGlkVGFic1swXSB3YXMgbW92ZWQgKGl0IHdhc24ndCwgYXMgaXQgZGVmaW5lZCB0aGUgdGFyZ2V0KSwgaXQncyBmaW5lLlxuICAgICAgdGFyZ2V0R3JvdXBJZCA9IGZpcnN0VGFiR3JvdXBJZDtcbiAgfSBlbHNlIHtcbiAgICAgIC8vIExvb2sgZm9yIGFueSBvdGhlciBncm91cCBpbiB0aGUgc2VsZWN0aW9uIHRoYXQgaXMgaW4gdGhlIHRhcmdldCB3aW5kb3dcbiAgICAgIGNvbnN0IG90aGVyR3JvdXAgPSB2YWxpZFRhYnMuZmluZCh0ID0+IHQud2luZG93SWQgPT09IHRhcmdldFdpbmRvd0lkICYmIHQuZ3JvdXBJZCAhPT0gLTEpO1xuICAgICAgaWYgKG90aGVyR3JvdXApIHtcbiAgICAgICAgICB0YXJnZXRHcm91cElkID0gb3RoZXJHcm91cC5ncm91cElkO1xuICAgICAgfVxuICB9XG5cbiAgY29uc3QgaWRzID0gdmFsaWRUYWJzLm1hcCh0ID0+IHQuaWQhKTtcbiAgYXdhaXQgY2hyb21lLnRhYnMuZ3JvdXAoeyB0YWJJZHM6IGlkcywgZ3JvdXBJZDogdGFyZ2V0R3JvdXBJZCB9KTtcbiAgbG9nSW5mbyhcIk1lcmdlZCB0YWJzXCIsIHsgY291bnQ6IGlkcy5sZW5ndGgsIHRhcmdldFdpbmRvd0lkLCB0YXJnZXRHcm91cElkIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IHNwbGl0VGFicyA9IGFzeW5jICh0YWJJZHM6IG51bWJlcltdKSA9PiB7XG4gIGlmICh0YWJJZHMubGVuZ3RoID09PSAwKSByZXR1cm47XG5cbiAgLy8gMS4gVmFsaWRhdGUgdGFic1xuICBjb25zdCB2YWxpZFRhYnMgPSBhd2FpdCBnZXRUYWJzQnlJZHModGFiSWRzKTtcblxuICBpZiAodmFsaWRUYWJzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuXG4gIC8vIDIuIENyZWF0ZSBuZXcgd2luZG93IHdpdGggdGhlIGZpcnN0IHRhYlxuICBjb25zdCBmaXJzdFRhYiA9IHZhbGlkVGFic1swXTtcbiAgY29uc3QgbmV3V2luZG93ID0gYXdhaXQgY2hyb21lLndpbmRvd3MuY3JlYXRlKHsgdGFiSWQ6IGZpcnN0VGFiLmlkIH0pO1xuXG4gIC8vIDMuIE1vdmUgcmVtYWluaW5nIHRhYnMgdG8gbmV3IHdpbmRvd1xuICBpZiAodmFsaWRUYWJzLmxlbmd0aCA+IDEpIHtcbiAgICBjb25zdCByZW1haW5pbmdUYWJJZHMgPSB2YWxpZFRhYnMuc2xpY2UoMSkubWFwKHQgPT4gdC5pZCEpO1xuICAgIGF3YWl0IGNocm9tZS50YWJzLm1vdmUocmVtYWluaW5nVGFiSWRzLCB7IHdpbmRvd0lkOiBuZXdXaW5kb3cuaWQhLCBpbmRleDogLTEgfSk7XG4gIH1cblxuICBsb2dJbmZvKFwiU3BsaXQgdGFicyB0byBuZXcgd2luZG93XCIsIHsgY291bnQ6IHZhbGlkVGFicy5sZW5ndGgsIG5ld1dpbmRvd0lkOiBuZXdXaW5kb3cuaWQgfSk7XG59O1xuIiwgImltcG9ydCB7IFVuZG9TdGF0ZSwgU2F2ZWRTdGF0ZSwgV2luZG93U3RhdGUsIFN0b3JlZFRhYlN0YXRlIH0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgZ2V0U3RvcmVkVmFsdWUsIHNldFN0b3JlZFZhbHVlIH0gZnJvbSBcIi4vc3RvcmFnZS5qc1wiO1xuaW1wb3J0IHsgbG9nSW5mbywgbG9nRXJyb3IgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuXG5jb25zdCBNQVhfVU5ET19TVEFDSyA9IDEwO1xuY29uc3QgVU5ET19TVEFDS19LRVkgPSBcInVuZG9TdGFja1wiO1xuY29uc3QgU0FWRURfU1RBVEVTX0tFWSA9IFwic2F2ZWRTdGF0ZXNcIjtcblxuZXhwb3J0IGNvbnN0IGNhcHR1cmVDdXJyZW50U3RhdGUgPSBhc3luYyAoKTogUHJvbWlzZTxVbmRvU3RhdGU+ID0+IHtcbiAgY29uc3Qgd2luZG93cyA9IGF3YWl0IGNocm9tZS53aW5kb3dzLmdldEFsbCh7IHBvcHVsYXRlOiB0cnVlIH0pO1xuICBjb25zdCB3aW5kb3dTdGF0ZXM6IFdpbmRvd1N0YXRlW10gPSBbXTtcblxuICBmb3IgKGNvbnN0IHdpbiBvZiB3aW5kb3dzKSB7XG4gICAgaWYgKCF3aW4udGFicykgY29udGludWU7XG4gICAgY29uc3QgdGFiU3RhdGVzOiBTdG9yZWRUYWJTdGF0ZVtdID0gd2luLnRhYnMubWFwKCh0YWIpID0+IHtcbiAgICAgIGxldCBncm91cFRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICBsZXQgZ3JvdXBDb2xvcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgLy8gTm90ZTogdGFiLmdyb3VwSWQgaXMgLTEgaWYgbm90IGdyb3VwZWQuXG4gICAgICByZXR1cm4ge1xuICAgICAgICBpZDogdGFiLmlkLFxuICAgICAgICB1cmw6IHRhYi51cmwgfHwgXCJcIixcbiAgICAgICAgcGlubmVkOiBCb29sZWFuKHRhYi5waW5uZWQpLFxuICAgICAgICBncm91cElkOiB0YWIuZ3JvdXBJZCxcbiAgICAgICAgZ3JvdXBUaXRsZSwgLy8gV2lsbCBuZWVkIHRvIGZldGNoIGlmIGdyb3VwZWRcbiAgICAgICAgZ3JvdXBDb2xvcixcbiAgICAgIH07XG4gICAgfSk7XG5cbiAgICAvLyBQb3B1bGF0ZSBncm91cCBpbmZvIGlmIG5lZWRlZFxuICAgIC8vIFdlIGRvIHRoaXMgaW4gYSBzZWNvbmQgcGFzcyB0byBiYXRjaCBvciBqdXN0IGluZGl2aWR1YWxseSBpZiBuZWVkZWQuXG4gICAgLy8gQWN0dWFsbHksIHdlIGNhbiBnZXQgZ3JvdXAgaW5mbyBmcm9tIGNocm9tZS50YWJHcm91cHMuXG4gICAgLy8gSG93ZXZlciwgdGhlIHRhYiBvYmplY3QgZG9lc24ndCBoYXZlIHRoZSBncm91cCB0aXRsZSBkaXJlY3RseS5cblxuICAgIC8vIE9wdGltaXphdGlvbjogR2V0IGFsbCBncm91cHMgZmlyc3QuXG5cbiAgICB3aW5kb3dTdGF0ZXMucHVzaCh7IHRhYnM6IHRhYlN0YXRlcyB9KTtcbiAgfVxuXG4gIC8vIEVucmljaCB3aXRoIGdyb3VwIGluZm9cbiAgY29uc3QgYWxsR3JvdXBzID0gYXdhaXQgY2hyb21lLnRhYkdyb3Vwcy5xdWVyeSh7fSk7XG4gIGNvbnN0IGdyb3VwTWFwID0gbmV3IE1hcChhbGxHcm91cHMubWFwKGcgPT4gW2cuaWQsIGddKSk7XG5cbiAgZm9yIChjb25zdCB3aW4gb2Ygd2luZG93U3RhdGVzKSB7XG4gICAgZm9yIChjb25zdCB0YWIgb2Ygd2luLnRhYnMpIHtcbiAgICAgIGlmICh0YWIuZ3JvdXBJZCAmJiB0YWIuZ3JvdXBJZCAhPT0gY2hyb21lLnRhYkdyb3Vwcy5UQUJfR1JPVVBfSURfTk9ORSkge1xuICAgICAgICBjb25zdCBnID0gZ3JvdXBNYXAuZ2V0KHRhYi5ncm91cElkKTtcbiAgICAgICAgaWYgKGcpIHtcbiAgICAgICAgICB0YWIuZ3JvdXBUaXRsZSA9IGcudGl0bGU7XG4gICAgICAgICAgdGFiLmdyb3VwQ29sb3IgPSBnLmNvbG9yO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICB0aW1lc3RhbXA6IERhdGUubm93KCksXG4gICAgd2luZG93czogd2luZG93U3RhdGVzLFxuICB9O1xufTtcblxuZXhwb3J0IGNvbnN0IHB1c2hVbmRvU3RhdGUgPSBhc3luYyAoKSA9PiB7XG4gIGNvbnN0IHN0YXRlID0gYXdhaXQgY2FwdHVyZUN1cnJlbnRTdGF0ZSgpO1xuICBjb25zdCBzdGFjayA9IChhd2FpdCBnZXRTdG9yZWRWYWx1ZTxVbmRvU3RhdGVbXT4oVU5ET19TVEFDS19LRVkpKSB8fCBbXTtcbiAgc3RhY2sucHVzaChzdGF0ZSk7XG4gIGlmIChzdGFjay5sZW5ndGggPiBNQVhfVU5ET19TVEFDSykge1xuICAgIHN0YWNrLnNoaWZ0KCk7XG4gIH1cbiAgYXdhaXQgc2V0U3RvcmVkVmFsdWUoVU5ET19TVEFDS19LRVksIHN0YWNrKTtcbiAgbG9nSW5mbyhcIlB1c2hlZCB1bmRvIHN0YXRlXCIsIHsgc3RhY2tTaXplOiBzdGFjay5sZW5ndGggfSk7XG59O1xuXG5leHBvcnQgY29uc3Qgc2F2ZVN0YXRlID0gYXN5bmMgKG5hbWU6IHN0cmluZykgPT4ge1xuICBjb25zdCB1bmRvU3RhdGUgPSBhd2FpdCBjYXB0dXJlQ3VycmVudFN0YXRlKCk7XG4gIGNvbnN0IHNhdmVkU3RhdGU6IFNhdmVkU3RhdGUgPSB7XG4gICAgbmFtZSxcbiAgICB0aW1lc3RhbXA6IHVuZG9TdGF0ZS50aW1lc3RhbXAsXG4gICAgd2luZG93czogdW5kb1N0YXRlLndpbmRvd3MsXG4gIH07XG4gIGNvbnN0IHNhdmVkU3RhdGVzID0gKGF3YWl0IGdldFN0b3JlZFZhbHVlPFNhdmVkU3RhdGVbXT4oU0FWRURfU1RBVEVTX0tFWSkpIHx8IFtdO1xuICBzYXZlZFN0YXRlcy5wdXNoKHNhdmVkU3RhdGUpO1xuICBhd2FpdCBzZXRTdG9yZWRWYWx1ZShTQVZFRF9TVEFURVNfS0VZLCBzYXZlZFN0YXRlcyk7XG4gIGxvZ0luZm8oXCJTYXZlZCBzdGF0ZVwiLCB7IG5hbWUgfSk7XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0U2F2ZWRTdGF0ZXMgPSBhc3luYyAoKTogUHJvbWlzZTxTYXZlZFN0YXRlW10+ID0+IHtcbiAgcmV0dXJuIChhd2FpdCBnZXRTdG9yZWRWYWx1ZTxTYXZlZFN0YXRlW10+KFNBVkVEX1NUQVRFU19LRVkpKSB8fCBbXTtcbn07XG5cbmV4cG9ydCBjb25zdCBkZWxldGVTYXZlZFN0YXRlID0gYXN5bmMgKG5hbWU6IHN0cmluZykgPT4ge1xuICBsZXQgc2F2ZWRTdGF0ZXMgPSAoYXdhaXQgZ2V0U3RvcmVkVmFsdWU8U2F2ZWRTdGF0ZVtdPihTQVZFRF9TVEFURVNfS0VZKSkgfHwgW107XG4gIHNhdmVkU3RhdGVzID0gc2F2ZWRTdGF0ZXMuZmlsdGVyKHMgPT4gcy5uYW1lICE9PSBuYW1lKTtcbiAgYXdhaXQgc2V0U3RvcmVkVmFsdWUoU0FWRURfU1RBVEVTX0tFWSwgc2F2ZWRTdGF0ZXMpO1xuICBsb2dJbmZvKFwiRGVsZXRlZCBzYXZlZCBzdGF0ZVwiLCB7IG5hbWUgfSk7XG59O1xuXG5leHBvcnQgY29uc3QgdW5kbyA9IGFzeW5jICgpID0+IHtcbiAgY29uc3Qgc3RhY2sgPSAoYXdhaXQgZ2V0U3RvcmVkVmFsdWU8VW5kb1N0YXRlW10+KFVORE9fU1RBQ0tfS0VZKSkgfHwgW107XG4gIGNvbnN0IHN0YXRlID0gc3RhY2sucG9wKCk7XG4gIGlmICghc3RhdGUpIHtcbiAgICBsb2dJbmZvKFwiVW5kbyBzdGFjayBlbXB0eVwiKTtcbiAgICByZXR1cm47XG4gIH1cbiAgYXdhaXQgc2V0U3RvcmVkVmFsdWUoVU5ET19TVEFDS19LRVksIHN0YWNrKTtcbiAgYXdhaXQgcmVzdG9yZVN0YXRlKHN0YXRlKTtcbiAgbG9nSW5mbyhcIlVuZGlkIGxhc3QgYWN0aW9uXCIpO1xufTtcblxuZXhwb3J0IGNvbnN0IHJlc3RvcmVTdGF0ZSA9IGFzeW5jIChzdGF0ZTogVW5kb1N0YXRlIHwgU2F2ZWRTdGF0ZSkgPT4ge1xuICAvLyBTdHJhdGVneTpcbiAgLy8gMS4gVW5ncm91cCBhbGwgdGFicyAob3B0aW9uYWwsIGJ1dCBjbGVhbmVyKS5cbiAgLy8gMi4gTW92ZSB0YWJzIHRvIGNvcnJlY3Qgd2luZG93cyBhbmQgaW5kaWNlcy5cbiAgLy8gMy4gUmUtZ3JvdXAgdGFicy5cblxuICAvLyBXZSBuZWVkIHRvIG1hdGNoIGN1cnJlbnQgdGFicyB0byBzdG9yZWQgdGFicy5cbiAgLy8gUHJpb3JpdHk6IElEIG1hdGNoIC0+IFVSTCBtYXRjaC5cblxuICBjb25zdCBjdXJyZW50VGFicyA9IGF3YWl0IGNocm9tZS50YWJzLnF1ZXJ5KHt9KTtcbiAgY29uc3QgY3VycmVudFRhYk1hcCA9IG5ldyBNYXA8bnVtYmVyLCBjaHJvbWUudGFicy5UYWI+KCk7XG4gIGNvbnN0IGN1cnJlbnRVcmxNYXAgPSBuZXcgTWFwPHN0cmluZywgY2hyb21lLnRhYnMuVGFiW10+KCk7IC8vIFVSTCAtPiBsaXN0IG9mIHRhYnNcblxuICBjdXJyZW50VGFicy5mb3JFYWNoKHQgPT4ge1xuICAgIGlmICh0LmlkKSBjdXJyZW50VGFiTWFwLnNldCh0LmlkLCB0KTtcbiAgICBpZiAodC51cmwpIHtcbiAgICAgIGNvbnN0IGxpc3QgPSBjdXJyZW50VXJsTWFwLmdldCh0LnVybCkgfHwgW107XG4gICAgICBsaXN0LnB1c2godCk7XG4gICAgICBjdXJyZW50VXJsTWFwLnNldCh0LnVybCwgbGlzdCk7XG4gICAgfVxuICB9KTtcblxuICAvLyBIZWxwZXIgdG8gZmluZCBhIHRhYiAoYXN5bmMgdG8gYWxsb3cgY3JlYXRpb24pXG4gIGNvbnN0IGZpbmRPckNyZWF0ZVRhYiA9IGFzeW5jIChzdG9yZWQ6IFN0b3JlZFRhYlN0YXRlKTogUHJvbWlzZTxjaHJvbWUudGFicy5UYWIgfCB1bmRlZmluZWQ+ID0+IHtcbiAgICAvLyBUcnkgSURcbiAgICBpZiAoc3RvcmVkLmlkICYmIGN1cnJlbnRUYWJNYXAuaGFzKHN0b3JlZC5pZCkpIHtcbiAgICAgIGNvbnN0IHQgPSBjdXJyZW50VGFiTWFwLmdldChzdG9yZWQuaWQpO1xuICAgICAgY3VycmVudFRhYk1hcC5kZWxldGUoc3RvcmVkLmlkISk7IC8vIENvbnN1bWVcbiAgICAgIC8vIEFsc28gcmVtb3ZlIGZyb20gdXJsIG1hcCB0byBhdm9pZCBkb3VibGUgdXNhZ2VcbiAgICAgIGlmICh0Py51cmwpIHtcbiAgICAgICAgIGNvbnN0IGxpc3QgPSBjdXJyZW50VXJsTWFwLmdldCh0LnVybCk7XG4gICAgICAgICBpZiAobGlzdCkge1xuICAgICAgICAgICAgY29uc3QgaWR4ID0gbGlzdC5maW5kSW5kZXgoeCA9PiB4LmlkID09PSB0LmlkKTtcbiAgICAgICAgICAgIGlmIChpZHggIT09IC0xKSBsaXN0LnNwbGljZShpZHgsIDEpO1xuICAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHQ7XG4gICAgfVxuICAgIC8vIFRyeSBVUkxcbiAgICBjb25zdCBsaXN0ID0gY3VycmVudFVybE1hcC5nZXQoc3RvcmVkLnVybCk7XG4gICAgaWYgKGxpc3QgJiYgbGlzdC5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCB0ID0gbGlzdC5zaGlmdCgpO1xuICAgICAgaWYgKHQ/LmlkKSBjdXJyZW50VGFiTWFwLmRlbGV0ZSh0LmlkKTsgLy8gQ29uc3VtZVxuICAgICAgcmV0dXJuIHQ7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIGlmIG1pc3NpbmdcbiAgICBpZiAoc3RvcmVkLnVybCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgdCA9IGF3YWl0IGNocm9tZS50YWJzLmNyZWF0ZSh7IHVybDogc3RvcmVkLnVybCwgYWN0aXZlOiBmYWxzZSB9KTtcbiAgICAgICAgICAgIHJldHVybiB0O1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBsb2dFcnJvcihcIkZhaWxlZCB0byBjcmVhdGUgdGFiXCIsIHsgdXJsOiBzdG9yZWQudXJsLCBlcnJvcjogZSB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH07XG5cbiAgLy8gV2UgbmVlZCB0byByZWNvbnN0cnVjdCB3aW5kb3dzLlxuICAvLyBJZGVhbGx5LCB3ZSBtYXAgc3RhdGUgd2luZG93cyB0byBjdXJyZW50IHdpbmRvd3MuXG4gIC8vIEJ1dCBzdHJpY3RseSwgd2UgY2FuIGp1c3QgbW92ZSB0YWJzLlxuXG4gIC8vIEZvciBzaW1wbGljaXR5LCBsZXQncyBhc3N1bWUgd2UgdXNlIGV4aXN0aW5nIHdpbmRvd3MgYXMgbXVjaCBhcyBwb3NzaWJsZS5cbiAgLy8gT3IgY3JlYXRlIG5ldyBvbmVzIGlmIHdlIHJ1biBvdXQ/XG4gIC8vIExldCdzIGl0ZXJhdGUgc3RvcmVkIHdpbmRvd3MuXG5cbiAgY29uc3QgY3VycmVudFdpbmRvd3MgPSBhd2FpdCBjaHJvbWUud2luZG93cy5nZXRBbGwoKTtcblxuICBmb3IgKGxldCBpID0gMDsgaSA8IHN0YXRlLndpbmRvd3MubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCB3aW5TdGF0ZSA9IHN0YXRlLndpbmRvd3NbaV07XG5cbiAgICAvLyBJZGVudGlmeSBhbGwgdGFicyBmb3IgdGhpcyB3aW5kb3cgZmlyc3QuXG4gICAgLy8gV2UgZG8gdGhpcyBCRUZPUkUgY3JlYXRpbmcgYSB3aW5kb3cgdG8gYXZvaWQgY3JlYXRpbmcgZW1wdHkgd2luZG93cy5cbiAgICBjb25zdCB0YWJzVG9Nb3ZlOiB7IHRhYklkOiBudW1iZXIsIHN0b3JlZDogU3RvcmVkVGFiU3RhdGUgfVtdID0gW107XG5cbiAgICBmb3IgKGNvbnN0IHN0b3JlZFRhYiBvZiB3aW5TdGF0ZS50YWJzKSB7XG4gICAgICBjb25zdCBmb3VuZCA9IGF3YWl0IGZpbmRPckNyZWF0ZVRhYihzdG9yZWRUYWIpO1xuICAgICAgaWYgKGZvdW5kICYmIGZvdW5kLmlkKSB7XG4gICAgICAgIHRhYnNUb01vdmUucHVzaCh7IHRhYklkOiBmb3VuZC5pZCwgc3RvcmVkOiBzdG9yZWRUYWIgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHRhYnNUb01vdmUubGVuZ3RoID09PSAwKSBjb250aW51ZTtcblxuICAgIGxldCB0YXJnZXRXaW5kb3dJZDogbnVtYmVyO1xuXG4gICAgaWYgKGkgPCBjdXJyZW50V2luZG93cy5sZW5ndGgpIHtcbiAgICAgIHRhcmdldFdpbmRvd0lkID0gY3VycmVudFdpbmRvd3NbaV0uaWQhO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBDcmVhdGUgbmV3IHdpbmRvd1xuICAgICAgY29uc3Qgd2luID0gYXdhaXQgY2hyb21lLndpbmRvd3MuY3JlYXRlKHt9KTtcbiAgICAgIHRhcmdldFdpbmRvd0lkID0gd2luLmlkITtcbiAgICAgIC8vIE5vdGU6IE5ldyB3aW5kb3cgY3JlYXRpb24gYWRkcyBhIHRhYi4gV2UgbWlnaHQgd2FudCB0byByZW1vdmUgaXQgbGF0ZXIgb3IgaWdub3JlIGl0LlxuICAgIH1cblxuICAgIGNvbnN0IHRhYklkcyA9IHRhYnNUb01vdmUubWFwKHQgPT4gdC50YWJJZCk7XG5cbiAgICAvLyBNb3ZlIGFsbCB0byB3aW5kb3cuXG4gICAgLy8gTm90ZTogSWYgd2UgbW92ZSB0byBpbmRleCAwLCB0aGV5IHdpbGwgYmUgcHJlcGVuZGVkLlxuICAgIC8vIFdlIHNob3VsZCBwcm9iYWJseSBqdXN0IG1vdmUgdGhlbSB0byB0aGUgd2luZG93IGZpcnN0LlxuICAgIC8vIElmIHdlIG1vdmUgdGhlbSBpbmRpdmlkdWFsbHkgdG8gY29ycmVjdCBpbmRleCwgaXQncyBzYWZlci5cblxuICAgIGZvciAobGV0IGogPSAwOyBqIDwgdGFic1RvTW92ZS5sZW5ndGg7IGorKykge1xuICAgICAgY29uc3QgeyB0YWJJZCwgc3RvcmVkIH0gPSB0YWJzVG9Nb3ZlW2pdO1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMubW92ZSh0YWJJZCwgeyB3aW5kb3dJZDogdGFyZ2V0V2luZG93SWQsIGluZGV4OiBqIH0pO1xuICAgICAgICBpZiAoc3RvcmVkLnBpbm5lZCkge1xuICAgICAgICAgICAgIGF3YWl0IGNocm9tZS50YWJzLnVwZGF0ZSh0YWJJZCwgeyBwaW5uZWQ6IHRydWUgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgLy8gSWYgY3VycmVudGx5IHBpbm5lZCBidXQgc2hvdWxkbid0IGJlXG4gICAgICAgICAgICAgY29uc3QgY3VycmVudCA9IGF3YWl0IGNocm9tZS50YWJzLmdldCh0YWJJZCk7XG4gICAgICAgICAgICAgaWYgKGN1cnJlbnQucGlubmVkKSBhd2FpdCBjaHJvbWUudGFicy51cGRhdGUodGFiSWQsIHsgcGlubmVkOiBmYWxzZSB9KTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2dFcnJvcihcIkZhaWxlZCB0byBtb3ZlIHRhYlwiLCB7IHRhYklkLCBlcnJvcjogZSB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBIYW5kbGUgR3JvdXBzXG4gICAgLy8gSWRlbnRpZnkgZ3JvdXBzIGluIHRoaXMgd2luZG93XG4gICAgY29uc3QgZ3JvdXBzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcltdPigpOyAvLyB0aXRsZStjb2xvciAtPiB0YWJJZHNcbiAgICBjb25zdCBncm91cENvbG9ycyA9IG5ldyBNYXA8c3RyaW5nLCBjaHJvbWUudGFiR3JvdXBzLkNvbG9yRW51bT4oKTtcblxuICAgIGZvciAoY29uc3QgaXRlbSBvZiB0YWJzVG9Nb3ZlKSB7XG4gICAgICBpZiAoaXRlbS5zdG9yZWQuZ3JvdXBUaXRsZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIC8vIFVzZSB0aXRsZSBhcyBrZXkgKG9yIHVuaXF1ZSBJRCBpZiB3ZSBoYWQgb25lLCBidXQgd2UgZG9uJ3QgcGVyc2lzdCBncm91cCBJRHMpXG4gICAgICAgIC8vIEdyb3VwIElEIGluIHN0b3JhZ2UgaXMgZXBoZW1lcmFsLiBUaXRsZSBpcyBrZXkuXG4gICAgICAgIGNvbnN0IGtleSA9IGl0ZW0uc3RvcmVkLmdyb3VwVGl0bGU7XG4gICAgICAgIGNvbnN0IGxpc3QgPSBncm91cHMuZ2V0KGtleSkgfHwgW107XG4gICAgICAgIGxpc3QucHVzaChpdGVtLnRhYklkKTtcbiAgICAgICAgZ3JvdXBzLnNldChrZXksIGxpc3QpO1xuICAgICAgICBpZiAoaXRlbS5zdG9yZWQuZ3JvdXBDb2xvcikge1xuICAgICAgICAgICAgIGdyb3VwQ29sb3JzLnNldChrZXksIGl0ZW0uc3RvcmVkLmdyb3VwQ29sb3IgYXMgY2hyb21lLnRhYkdyb3Vwcy5Db2xvckVudW0pO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgLy8gVW5ncm91cCBpZiBuZWVkZWRcbiAgICAgICAgIGF3YWl0IGNocm9tZS50YWJzLnVuZ3JvdXAoaXRlbS50YWJJZCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBbdGl0bGUsIGlkc10gb2YgZ3JvdXBzLmVudHJpZXMoKSkge1xuICAgICAgaWYgKGlkcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvbnN0IGdyb3VwSWQgPSBhd2FpdCBjaHJvbWUudGFicy5ncm91cCh7IHRhYklkczogaWRzIH0pO1xuICAgICAgICBhd2FpdCBjaHJvbWUudGFiR3JvdXBzLnVwZGF0ZShncm91cElkLCB7XG4gICAgICAgICAgICAgdGl0bGU6IHRpdGxlLFxuICAgICAgICAgICAgIGNvbG9yOiBncm91cENvbG9ycy5nZXQodGl0bGUpIHx8IFwiZ3JleVwiXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcbiIsICJpbXBvcnQgeyBhcHBseVRhYkdyb3VwcywgYXBwbHlUYWJTb3J0aW5nLCBjYWxjdWxhdGVUYWJHcm91cHMsIGZldGNoQ3VycmVudFRhYkdyb3VwcywgbWVyZ2VUYWJzLCBzcGxpdFRhYnMgfSBmcm9tIFwiLi90YWJNYW5hZ2VyLmpzXCI7XG5pbXBvcnQgeyBsb2FkUHJlZmVyZW5jZXMsIHNhdmVQcmVmZXJlbmNlcyB9IGZyb20gXCIuL3ByZWZlcmVuY2VzLmpzXCI7XG5pbXBvcnQgeyBzZXRDdXN0b21TdHJhdGVnaWVzIH0gZnJvbSBcIi4vZ3JvdXBpbmdTdHJhdGVnaWVzLmpzXCI7XG5pbXBvcnQgeyBsb2dEZWJ1ZywgbG9nSW5mbywgZ2V0TG9ncywgY2xlYXJMb2dzLCBzZXRMb2dnZXJQcmVmZXJlbmNlcywgaW5pdExvZ2dlciwgYWRkTG9nRW50cnksIGxvZ2dlclJlYWR5IH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IHB1c2hVbmRvU3RhdGUsIHNhdmVTdGF0ZSwgdW5kbywgZ2V0U2F2ZWRTdGF0ZXMsIGRlbGV0ZVNhdmVkU3RhdGUsIHJlc3RvcmVTdGF0ZSB9IGZyb20gXCIuL3N0YXRlTWFuYWdlci5qc1wiO1xuaW1wb3J0IHtcbiAgQXBwbHlHcm91cGluZ1BheWxvYWQsXG4gIEdyb3VwaW5nU2VsZWN0aW9uLFxuICBHcm91cGluZ1N0cmF0ZWd5LFxuICBQcmVmZXJlbmNlcyxcbiAgUnVudGltZU1lc3NhZ2UsXG4gIFJ1bnRpbWVSZXNwb25zZSxcbiAgU29ydGluZ1N0cmF0ZWd5LFxuICBUYWJHcm91cFxufSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5cbmNocm9tZS5ydW50aW1lLm9uSW5zdGFsbGVkLmFkZExpc3RlbmVyKGFzeW5jICgpID0+IHtcbiAgY29uc3QgcHJlZnMgPSBhd2FpdCBsb2FkUHJlZmVyZW5jZXMoKTtcbiAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhwcmVmcy5jdXN0b21TdHJhdGVnaWVzIHx8IFtdKTtcbiAgbG9nSW5mbyhcIkV4dGVuc2lvbiBpbnN0YWxsZWRcIiwge1xuICAgIHZlcnNpb246IGNocm9tZS5ydW50aW1lLmdldE1hbmlmZXN0KCkudmVyc2lvbixcbiAgICBsb2dMZXZlbDogcHJlZnMubG9nTGV2ZWwsXG4gICAgc3RyYXRlZ2llc0NvdW50OiBwcmVmcy5jdXN0b21TdHJhdGVnaWVzPy5sZW5ndGggfHwgMFxuICB9KTtcbn0pO1xuXG4vLyBJbml0aWFsaXplIGxvZ2dlciBvbiBzdGFydHVwXG5sb2FkUHJlZmVyZW5jZXMoKS50aGVuKGFzeW5jIChwcmVmcykgPT4ge1xuICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMocHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXSk7XG4gICAgYXdhaXQgaW5pdExvZ2dlcigpO1xuICAgIGxvZ0luZm8oXCJTZXJ2aWNlIFdvcmtlciBJbml0aWFsaXplZFwiLCB7XG4gICAgICAgIHZlcnNpb246IGNocm9tZS5ydW50aW1lLmdldE1hbmlmZXN0KCkudmVyc2lvbixcbiAgICAgICAgbG9nTGV2ZWw6IHByZWZzLmxvZ0xldmVsXG4gICAgfSk7XG59KTtcblxuY29uc3QgaGFuZGxlTWVzc2FnZSA9IGFzeW5jIDxURGF0YT4oXG4gIG1lc3NhZ2U6IFJ1bnRpbWVNZXNzYWdlLFxuICBzZW5kZXI6IGNocm9tZS5ydW50aW1lLk1lc3NhZ2VTZW5kZXJcbik6IFByb21pc2U8UnVudGltZVJlc3BvbnNlPFREYXRhPj4gPT4ge1xuICBsb2dEZWJ1ZyhcIlJlY2VpdmVkIG1lc3NhZ2VcIiwgeyB0eXBlOiBtZXNzYWdlLnR5cGUsIGZyb206IHNlbmRlci5pZCB9KTtcbiAgc3dpdGNoIChtZXNzYWdlLnR5cGUpIHtcbiAgICBjYXNlIFwiZ2V0U3RhdGVcIjoge1xuICAgICAgY29uc3QgcHJlZnMgPSBhd2FpdCBsb2FkUHJlZmVyZW5jZXMoKTtcbiAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMocHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXSk7XG4gICAgICAvLyBVc2UgZmV0Y2hDdXJyZW50VGFiR3JvdXBzIHRvIHJldHVybiB0aGUgYWN0dWFsIHN0YXRlIG9mIHRoZSBicm93c2VyIHRhYnNcbiAgICAgIGNvbnN0IGdyb3VwcyA9IGF3YWl0IGZldGNoQ3VycmVudFRhYkdyb3VwcyhwcmVmcyk7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSwgZGF0YTogeyBncm91cHMsIHByZWZlcmVuY2VzOiBwcmVmcyB9IGFzIFREYXRhIH07XG4gICAgfVxuICAgIGNhc2UgXCJhcHBseUdyb3VwaW5nXCI6IHtcbiAgICAgIGxvZ0luZm8oXCJBcHBseWluZyBncm91cGluZyBmcm9tIG1lc3NhZ2VcIiwgeyBzb3J0aW5nOiAobWVzc2FnZS5wYXlsb2FkIGFzIGFueSk/LnNvcnRpbmcgfSk7XG4gICAgICBhd2FpdCBwdXNoVW5kb1N0YXRlKCk7XG4gICAgICBjb25zdCBwcmVmcyA9IGF3YWl0IGxvYWRQcmVmZXJlbmNlcygpO1xuICAgICAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhwcmVmcy5jdXN0b21TdHJhdGVnaWVzIHx8IFtdKTtcbiAgICAgIGNvbnN0IHBheWxvYWQgPSAobWVzc2FnZS5wYXlsb2FkIGFzIEFwcGx5R3JvdXBpbmdQYXlsb2FkIHwgdW5kZWZpbmVkKSA/PyB7fTtcbiAgICAgIGNvbnN0IHNlbGVjdGlvbiA9IHBheWxvYWQuc2VsZWN0aW9uID8/IHt9O1xuICAgICAgY29uc3Qgc29ydGluZyA9IHBheWxvYWQuc29ydGluZz8ubGVuZ3RoID8gcGF5bG9hZC5zb3J0aW5nIDogdW5kZWZpbmVkO1xuXG4gICAgICBjb25zdCBwcmVmZXJlbmNlcyA9IHNvcnRpbmcgPyB7IC4uLnByZWZzLCBzb3J0aW5nIH0gOiBwcmVmcztcblxuICAgICAgY29uc3Qgb25Qcm9ncmVzcyA9IChjb21wbGV0ZWQ6IG51bWJlciwgdG90YWw6IG51bWJlcikgPT4ge1xuICAgICAgICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgICAgdHlwZTogXCJncm91cGluZ1Byb2dyZXNzXCIsXG4gICAgICAgICAgICAgIHBheWxvYWQ6IHsgY29tcGxldGVkLCB0b3RhbCB9XG4gICAgICAgICAgfSkuY2F0Y2goKCkgPT4ge30pO1xuICAgICAgfTtcblxuICAgICAgLy8gVXNlIGNhbGN1bGF0ZVRhYkdyb3VwcyB0byBkZXRlcm1pbmUgdGhlIHRhcmdldCBncm91cGluZ1xuICAgICAgY29uc3QgZ3JvdXBzID0gYXdhaXQgY2FsY3VsYXRlVGFiR3JvdXBzKHByZWZlcmVuY2VzLCBzZWxlY3Rpb24sIG9uUHJvZ3Jlc3MpO1xuICAgICAgYXdhaXQgYXBwbHlUYWJHcm91cHMoZ3JvdXBzKTtcbiAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBkYXRhOiB7IGdyb3VwcyB9IGFzIFREYXRhIH07XG4gICAgfVxuICAgIGNhc2UgXCJhcHBseVNvcnRpbmdcIjoge1xuICAgICAgbG9nSW5mbyhcIkFwcGx5aW5nIHNvcnRpbmcgZnJvbSBtZXNzYWdlXCIpO1xuICAgICAgYXdhaXQgcHVzaFVuZG9TdGF0ZSgpO1xuICAgICAgY29uc3QgcHJlZnMgPSBhd2FpdCBsb2FkUHJlZmVyZW5jZXMoKTtcbiAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMocHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXSk7XG4gICAgICBjb25zdCBwYXlsb2FkID0gKG1lc3NhZ2UucGF5bG9hZCBhcyBBcHBseUdyb3VwaW5nUGF5bG9hZCB8IHVuZGVmaW5lZCkgPz8ge307XG4gICAgICBjb25zdCBzZWxlY3Rpb24gPSBwYXlsb2FkLnNlbGVjdGlvbiA/PyB7fTtcbiAgICAgIGNvbnN0IHNvcnRpbmcgPSBwYXlsb2FkLnNvcnRpbmc/Lmxlbmd0aCA/IHBheWxvYWQuc29ydGluZyA6IHVuZGVmaW5lZDtcbiAgICAgIGNvbnN0IHByZWZlcmVuY2VzID0gc29ydGluZyA/IHsgLi4ucHJlZnMsIHNvcnRpbmcgfSA6IHByZWZzO1xuXG4gICAgICBjb25zdCBvblByb2dyZXNzID0gKGNvbXBsZXRlZDogbnVtYmVyLCB0b3RhbDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICB0eXBlOiBcImdyb3VwaW5nUHJvZ3Jlc3NcIixcbiAgICAgICAgICAgICAgcGF5bG9hZDogeyBjb21wbGV0ZWQsIHRvdGFsIH1cbiAgICAgICAgICB9KS5jYXRjaCgoKSA9PiB7fSk7XG4gICAgICB9O1xuXG4gICAgICBhd2FpdCBhcHBseVRhYlNvcnRpbmcocHJlZmVyZW5jZXMsIHNlbGVjdGlvbiwgb25Qcm9ncmVzcyk7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgIH1cbiAgICBjYXNlIFwibWVyZ2VTZWxlY3Rpb25cIjoge1xuICAgICAgbG9nSW5mbyhcIk1lcmdpbmcgc2VsZWN0aW9uIGZyb20gbWVzc2FnZVwiKTtcbiAgICAgIGF3YWl0IHB1c2hVbmRvU3RhdGUoKTtcbiAgICAgIGNvbnN0IHBheWxvYWQgPSBtZXNzYWdlLnBheWxvYWQgYXMgeyB0YWJJZHM6IG51bWJlcltdIH07XG4gICAgICBpZiAocGF5bG9hZD8udGFiSWRzPy5sZW5ndGgpIHtcbiAgICAgICAgYXdhaXQgbWVyZ2VUYWJzKHBheWxvYWQudGFiSWRzKTtcbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiTm8gdGFicyBzZWxlY3RlZFwiIH07XG4gICAgfVxuICAgIGNhc2UgXCJzcGxpdFNlbGVjdGlvblwiOiB7XG4gICAgICBsb2dJbmZvKFwiU3BsaXR0aW5nIHNlbGVjdGlvbiBmcm9tIG1lc3NhZ2VcIik7XG4gICAgICBhd2FpdCBwdXNoVW5kb1N0YXRlKCk7XG4gICAgICBjb25zdCBwYXlsb2FkID0gbWVzc2FnZS5wYXlsb2FkIGFzIHsgdGFiSWRzOiBudW1iZXJbXSB9O1xuICAgICAgaWYgKHBheWxvYWQ/LnRhYklkcz8ubGVuZ3RoKSB7XG4gICAgICAgIGF3YWl0IHNwbGl0VGFicyhwYXlsb2FkLnRhYklkcyk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICB9XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIk5vIHRhYnMgc2VsZWN0ZWRcIiB9O1xuICAgIH1cbiAgICBjYXNlIFwidW5kb1wiOiB7XG4gICAgICBsb2dJbmZvKFwiVW5kb2luZyBsYXN0IGFjdGlvblwiKTtcbiAgICAgIGF3YWl0IHVuZG8oKTtcbiAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgfVxuICAgIGNhc2UgXCJzYXZlU3RhdGVcIjoge1xuICAgICAgY29uc3QgbmFtZSA9IChtZXNzYWdlLnBheWxvYWQgYXMgYW55KT8ubmFtZTtcbiAgICAgIGlmICh0eXBlb2YgbmFtZSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICBsb2dJbmZvKFwiU2F2aW5nIHN0YXRlIGZyb20gbWVzc2FnZVwiLCB7IG5hbWUgfSk7XG4gICAgICAgIGF3YWl0IHNhdmVTdGF0ZShuYW1lKTtcbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBuYW1lXCIgfTtcbiAgICB9XG4gICAgY2FzZSBcImdldFNhdmVkU3RhdGVzXCI6IHtcbiAgICAgIGNvbnN0IHN0YXRlcyA9IGF3YWl0IGdldFNhdmVkU3RhdGVzKCk7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSwgZGF0YTogc3RhdGVzIGFzIFREYXRhIH07XG4gICAgfVxuICAgIGNhc2UgXCJyZXN0b3JlU3RhdGVcIjoge1xuICAgICAgY29uc3Qgc3RhdGUgPSAobWVzc2FnZS5wYXlsb2FkIGFzIGFueSk/LnN0YXRlO1xuICAgICAgaWYgKHN0YXRlKSB7XG4gICAgICAgIGxvZ0luZm8oXCJSZXN0b3Jpbmcgc3RhdGUgZnJvbSBtZXNzYWdlXCIsIHsgbmFtZTogc3RhdGUubmFtZSB9KTtcbiAgICAgICAgYXdhaXQgcmVzdG9yZVN0YXRlKHN0YXRlKTtcbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBzdGF0ZVwiIH07XG4gICAgfVxuICAgIGNhc2UgXCJkZWxldGVTYXZlZFN0YXRlXCI6IHtcbiAgICAgIGNvbnN0IG5hbWUgPSAobWVzc2FnZS5wYXlsb2FkIGFzIGFueSk/Lm5hbWU7XG4gICAgICBpZiAodHlwZW9mIG5hbWUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgbG9nSW5mbyhcIkRlbGV0aW5nIHNhdmVkIHN0YXRlIGZyb20gbWVzc2FnZVwiLCB7IG5hbWUgfSk7XG4gICAgICAgIGF3YWl0IGRlbGV0ZVNhdmVkU3RhdGUobmFtZSk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICB9XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgbmFtZVwiIH07XG4gICAgfVxuICAgIGNhc2UgXCJsb2FkUHJlZmVyZW5jZXNcIjoge1xuICAgICAgY29uc3QgcHJlZnMgPSBhd2FpdCBsb2FkUHJlZmVyZW5jZXMoKTtcbiAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMocHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXSk7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSwgZGF0YTogcHJlZnMgYXMgVERhdGEgfTtcbiAgICB9XG4gICAgY2FzZSBcInNhdmVQcmVmZXJlbmNlc1wiOiB7XG4gICAgICBsb2dJbmZvKFwiU2F2aW5nIHByZWZlcmVuY2VzIGZyb20gbWVzc2FnZVwiKTtcbiAgICAgIGNvbnN0IHByZWZzID0gYXdhaXQgc2F2ZVByZWZlcmVuY2VzKG1lc3NhZ2UucGF5bG9hZCBhcyBhbnkpO1xuICAgICAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhwcmVmcy5jdXN0b21TdHJhdGVnaWVzIHx8IFtdKTtcbiAgICAgIHNldExvZ2dlclByZWZlcmVuY2VzKHByZWZzKTtcbiAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBkYXRhOiBwcmVmcyBhcyBURGF0YSB9O1xuICAgIH1cbiAgICBjYXNlIFwiZ2V0TG9nc1wiOiB7XG4gICAgICAgIGF3YWl0IGxvZ2dlclJlYWR5O1xuICAgICAgICBjb25zdCBsb2dzID0gZ2V0TG9ncygpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgZGF0YTogbG9ncyBhcyBURGF0YSB9O1xuICAgIH1cbiAgICBjYXNlIFwiY2xlYXJMb2dzXCI6IHtcbiAgICAgICAgY2xlYXJMb2dzKCk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgfVxuICAgIGNhc2UgXCJsb2dFbnRyeVwiOiB7XG4gICAgICAgIGNvbnN0IGVudHJ5ID0gbWVzc2FnZS5wYXlsb2FkIGFzIGFueTtcbiAgICAgICAgaWYgKGVudHJ5ICYmIGVudHJ5LmxldmVsICYmIGVudHJ5Lm1lc3NhZ2UpIHtcbiAgICAgICAgICAgIGFkZExvZ0VudHJ5KGVudHJ5KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgIH1cbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJVbmtub3duIG1lc3NhZ2VcIiB9O1xuICB9XG59O1xuXG5jaHJvbWUucnVudGltZS5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoXG4gIChcbiAgICBtZXNzYWdlOiBSdW50aW1lTWVzc2FnZSxcbiAgICBzZW5kZXI6IGNocm9tZS5ydW50aW1lLk1lc3NhZ2VTZW5kZXIsXG4gICAgc2VuZFJlc3BvbnNlOiAocmVzcG9uc2U6IFJ1bnRpbWVSZXNwb25zZSkgPT4gdm9pZFxuICApID0+IHtcbiAgICBoYW5kbGVNZXNzYWdlKG1lc3NhZ2UsIHNlbmRlcilcbiAgICAudGhlbigocmVzcG9uc2UpID0+IHNlbmRSZXNwb25zZShyZXNwb25zZSkpXG4gICAgLmNhdGNoKChlcnJvcikgPT4ge1xuICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGVycm9yKSB9KTtcbiAgICB9KTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuKTtcblxuY2hyb21lLnRhYkdyb3Vwcy5vblJlbW92ZWQuYWRkTGlzdGVuZXIoYXN5bmMgKGdyb3VwKSA9PiB7XG4gIGxvZ0luZm8oXCJUYWIgZ3JvdXAgcmVtb3ZlZFwiLCB7IGdyb3VwIH0pO1xufSk7XG5cbmxldCBhdXRvUnVuVGltZW91dDogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCBudWxsID0gbnVsbDtcblxuY29uc3QgdHJpZ2dlckF1dG9SdW4gPSAoKSA9PiB7XG4gIGlmIChhdXRvUnVuVGltZW91dCkgY2xlYXJUaW1lb3V0KGF1dG9SdW5UaW1lb3V0KTtcbiAgYXV0b1J1blRpbWVvdXQgPSBzZXRUaW1lb3V0KGFzeW5jICgpID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcHJlZnMgPSBhd2FpdCBsb2FkUHJlZmVyZW5jZXMoKTtcbiAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMocHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXSk7XG5cbiAgICAgIGNvbnN0IGF1dG9SdW5TdHJhdHMgPSBwcmVmcy5jdXN0b21TdHJhdGVnaWVzPy5maWx0ZXIocyA9PiBzLmF1dG9SdW4pO1xuICAgICAgaWYgKGF1dG9SdW5TdHJhdHMgJiYgYXV0b1J1blN0cmF0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGxvZ0luZm8oXCJBdXRvLXJ1bm5pbmcgc3RyYXRlZ2llc1wiLCB7XG4gICAgICAgICAgc3RyYXRlZ2llczogYXV0b1J1blN0cmF0cy5tYXAocyA9PiBzLmlkKSxcbiAgICAgICAgICBjb3VudDogYXV0b1J1blN0cmF0cy5sZW5ndGhcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IGlkcyA9IGF1dG9SdW5TdHJhdHMubWFwKHMgPT4gcy5pZCk7XG5cbiAgICAgICAgLy8gV2UgYXBwbHkgZ3JvdXBpbmcgdXNpbmcgdGhlc2Ugc3RyYXRlZ2llc1xuICAgICAgICBjb25zdCBncm91cHMgPSBhd2FpdCBjYWxjdWxhdGVUYWJHcm91cHMoeyAuLi5wcmVmcywgc29ydGluZzogaWRzIH0pO1xuICAgICAgICBhd2FpdCBhcHBseVRhYkdyb3Vwcyhncm91cHMpO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJBdXRvLXJ1biBmYWlsZWRcIiwgZSk7XG4gICAgfVxuICB9LCAxMDAwKTtcbn07XG5cbmNocm9tZS50YWJzLm9uQ3JlYXRlZC5hZGRMaXN0ZW5lcigoKSA9PiB0cmlnZ2VyQXV0b1J1bigpKTtcbmNocm9tZS50YWJzLm9uVXBkYXRlZC5hZGRMaXN0ZW5lcigodGFiSWQsIGNoYW5nZUluZm8pID0+IHtcbiAgaWYgKGNoYW5nZUluZm8udXJsIHx8IGNoYW5nZUluZm8uc3RhdHVzID09PSAnY29tcGxldGUnKSB7XG4gICAgdHJpZ2dlckF1dG9SdW4oKTtcbiAgfVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBYU8sSUFBTSxhQUFtQztBQUFBLEVBQzVDLEVBQUUsSUFBSSxVQUFVLE9BQU8sVUFBVSxZQUFZLE1BQU0sV0FBVyxNQUFNLE1BQU0sQ0FBQyxTQUFTLE1BQU0sRUFBRTtBQUFBLEVBQzVGLEVBQUUsSUFBSSxlQUFlLE9BQU8sZUFBZSxZ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
