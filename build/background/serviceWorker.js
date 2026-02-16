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
  if (!tab.id || !tab.windowId) return null;
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
var domainFromUrl = (url) => {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch (error) {
    logDebug("Failed to parse domain", { url, error: String(error) });
    return "unknown";
  }
};
var subdomainFromUrl = (url) => {
  try {
    const parsed = new URL(url);
    let hostname = parsed.hostname;
    hostname = hostname.replace(/^www\./, "");
    const parts = hostname.split(".");
    if (parts.length > 2) {
      return parts.slice(0, parts.length - 2).join(".");
    }
    return "";
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
var getStrategyColor = (strategyId) => {
  const custom = customStrategies.find((s) => s.id === strategyId);
  if (!custom) return void 0;
  const groupingRulesList = asArray(custom.groupingRules);
  for (let i = groupingRulesList.length - 1; i >= 0; i--) {
    const rule = groupingRulesList[i];
    if (rule && rule.color && rule.color !== "random") {
      return rule.color;
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
      for (const sId of appliedStrategies) {
        const color = getStrategyColor(sId);
        if (color) {
          groupColor = color;
          break;
        }
      }
      if (groupColor === "match") {
        groupColor = colorForKey(valueKey, 0);
      } else if (!groupColor) {
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
var checkCondition = (condition, tab) => {
  if (!condition) return false;
  const rawValue = getFieldValue(tab, condition.field);
  const valueToCheck = rawValue !== void 0 && rawValue !== null ? String(rawValue).toLowerCase() : "";
  const pattern = condition.value ? condition.value.toLowerCase() : "";
  switch (condition.operator) {
    case "contains":
      return valueToCheck.includes(pattern);
    case "doesNotContain":
      return !valueToCheck.includes(pattern);
    case "equals":
      return valueToCheck === pattern;
    case "startsWith":
      return valueToCheck.startsWith(pattern);
    case "endsWith":
      return valueToCheck.endsWith(pattern);
    case "exists":
      return rawValue !== void 0;
    case "doesNotExist":
      return rawValue === void 0;
    case "isNull":
      return rawValue === null;
    case "isNotNull":
      return rawValue !== null;
    case "matches":
      try {
        return new RegExp(condition.value, "i").test(rawValue !== void 0 && rawValue !== null ? String(rawValue) : "");
      } catch {
        return false;
      }
    default:
      return false;
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
      let valueToCheck = rawValue !== void 0 && rawValue !== null ? String(rawValue) : "";
      valueToCheck = valueToCheck.toLowerCase();
      const pattern = rule.value ? rule.value.toLowerCase() : "";
      let isMatch = false;
      let matchObj = null;
      switch (rule.operator) {
        case "contains":
          isMatch = valueToCheck.includes(pattern);
          break;
        case "doesNotContain":
          isMatch = !valueToCheck.includes(pattern);
          break;
        case "equals":
          isMatch = valueToCheck === pattern;
          break;
        case "startsWith":
          isMatch = valueToCheck.startsWith(pattern);
          break;
        case "endsWith":
          isMatch = valueToCheck.endsWith(pattern);
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
            const regex = new RegExp(rule.value, "i");
            matchObj = regex.exec(rawValue !== void 0 && rawValue !== null ? String(rawValue) : "");
            isMatch = !!matchObj;
          } catch (e) {
          }
          break;
      }
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
  const chromeTabs = await chrome.tabs.query({});
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
  const chromeTabs = await chrome.tabs.query({});
  const targetWindowIds = /* @__PURE__ */ new Set();
  if (!filter || !filter.windowIds?.length && !filter.tabIds?.length) {
    chromeTabs.forEach((t) => {
      if (t.windowId) targetWindowIds.add(t.windowId);
    });
  } else {
    filter.windowIds?.forEach((id) => targetWindowIds.add(id));
    if (filter.tabIds?.length) {
      const ids = new Set(filter.tabIds);
      chromeTabs.forEach((t) => {
        if (t.id && ids.has(t.id) && t.windowId) targetWindowIds.add(t.windowId);
      });
    }
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
var mergeTabs = async (tabIds) => {
  if (!tabIds.length) return;
  const tabs = await Promise.all(tabIds.map((id) => chrome.tabs.get(id).catch(() => null)));
  const validTabs = tabs.filter((t) => t !== null && t.id !== void 0 && t.windowId !== void 0);
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
  const tabs = await Promise.all(tabIds.map((id) => chrome.tabs.get(id).catch(() => null)));
  const validTabs = tabs.filter((t) => t !== null && t.id !== void 0 && t.windowId !== void 0);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3NoYXJlZC9zdHJhdGVneVJlZ2lzdHJ5LnRzIiwgIi4uLy4uL3NyYy9zaGFyZWQvbG9nZ2VyLnRzIiwgIi4uLy4uL3NyYy9zaGFyZWQvdXRpbHMudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZ3JvdXBpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3NvcnRpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL2V4dHJhY3Rpb24vbG9naWMudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZXh0cmFjdGlvbi9nZW5lcmFSZWdpc3RyeS50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9zdG9yYWdlLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3ByZWZlcmVuY2VzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL2V4dHJhY3Rpb24vaW5kZXgudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvY29udGV4dEFuYWx5c2lzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3RhYk1hbmFnZXIudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvc3RhdGVNYW5hZ2VyLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3NlcnZpY2VXb3JrZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IEN1c3RvbVN0cmF0ZWd5LCBTb3J0aW5nU3RyYXRlZ3kgfSBmcm9tIFwiLi90eXBlcy5qc1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0cmF0ZWd5RGVmaW5pdGlvbiB7XG4gICAgaWQ6IFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZztcbiAgICBsYWJlbDogc3RyaW5nO1xuICAgIGlzR3JvdXBpbmc6IGJvb2xlYW47XG4gICAgaXNTb3J0aW5nOiBib29sZWFuO1xuICAgIHRhZ3M/OiBzdHJpbmdbXTtcbiAgICBhdXRvUnVuPzogYm9vbGVhbjtcbiAgICBpc0N1c3RvbT86IGJvb2xlYW47XG59XG5cbi8vIFJlc3RvcmVkIHN0cmF0ZWdpZXMgbWF0Y2hpbmcgYmFja2dyb3VuZCBjYXBhYmlsaXRpZXMuXG5leHBvcnQgY29uc3QgU1RSQVRFR0lFUzogU3RyYXRlZ3lEZWZpbml0aW9uW10gPSBbXG4gICAgeyBpZDogXCJkb21haW5cIiwgbGFiZWw6IFwiRG9tYWluXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJkb21haW5fZnVsbFwiLCBsYWJlbDogXCJGdWxsIERvbWFpblwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwidG9waWNcIiwgbGFiZWw6IFwiVG9waWNcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImNvbnRleHRcIiwgbGFiZWw6IFwiQ29udGV4dFwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwibGluZWFnZVwiLCBsYWJlbDogXCJMaW5lYWdlXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJwaW5uZWRcIiwgbGFiZWw6IFwiUGlubmVkXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJyZWNlbmN5XCIsIGxhYmVsOiBcIlJlY2VuY3lcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImFnZVwiLCBsYWJlbDogXCJBZ2VcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInVybFwiLCBsYWJlbDogXCJVUkxcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcIm5lc3RpbmdcIiwgbGFiZWw6IFwiTmVzdGluZ1wiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwidGl0bGVcIiwgbGFiZWw6IFwiVGl0bGVcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbl07XG5cbmV4cG9ydCBjb25zdCBnZXRTdHJhdGVnaWVzID0gKGN1c3RvbVN0cmF0ZWdpZXM/OiBDdXN0b21TdHJhdGVneVtdKTogU3RyYXRlZ3lEZWZpbml0aW9uW10gPT4ge1xuICAgIGlmICghY3VzdG9tU3RyYXRlZ2llcyB8fCBjdXN0b21TdHJhdGVnaWVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIFNUUkFURUdJRVM7XG5cbiAgICAvLyBDdXN0b20gc3RyYXRlZ2llcyBjYW4gb3ZlcnJpZGUgYnVpbHQtaW5zIGlmIElEcyBtYXRjaCwgb3IgYWRkIG5ldyBvbmVzLlxuICAgIGNvbnN0IGNvbWJpbmVkID0gWy4uLlNUUkFURUdJRVNdO1xuXG4gICAgY3VzdG9tU3RyYXRlZ2llcy5mb3JFYWNoKGN1c3RvbSA9PiB7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nSW5kZXggPSBjb21iaW5lZC5maW5kSW5kZXgocyA9PiBzLmlkID09PSBjdXN0b20uaWQpO1xuXG4gICAgICAgIC8vIERldGVybWluZSBjYXBhYmlsaXRpZXMgYmFzZWQgb24gcnVsZXMgcHJlc2VuY2VcbiAgICAgICAgY29uc3QgaGFzR3JvdXBpbmcgPSAoY3VzdG9tLmdyb3VwaW5nUnVsZXMgJiYgY3VzdG9tLmdyb3VwaW5nUnVsZXMubGVuZ3RoID4gMCkgfHwgKGN1c3RvbS5ydWxlcyAmJiBjdXN0b20ucnVsZXMubGVuZ3RoID4gMCkgfHwgZmFsc2U7XG4gICAgICAgIGNvbnN0IGhhc1NvcnRpbmcgPSAoY3VzdG9tLnNvcnRpbmdSdWxlcyAmJiBjdXN0b20uc29ydGluZ1J1bGVzLmxlbmd0aCA+IDApIHx8IChjdXN0b20ucnVsZXMgJiYgY3VzdG9tLnJ1bGVzLmxlbmd0aCA+IDApIHx8IGZhbHNlO1xuXG4gICAgICAgIGNvbnN0IHRhZ3M6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGlmIChoYXNHcm91cGluZykgdGFncy5wdXNoKFwiZ3JvdXBcIik7XG4gICAgICAgIGlmIChoYXNTb3J0aW5nKSB0YWdzLnB1c2goXCJzb3J0XCIpO1xuXG4gICAgICAgIGNvbnN0IGRlZmluaXRpb246IFN0cmF0ZWd5RGVmaW5pdGlvbiA9IHtcbiAgICAgICAgICAgIGlkOiBjdXN0b20uaWQsXG4gICAgICAgICAgICBsYWJlbDogY3VzdG9tLmxhYmVsLFxuICAgICAgICAgICAgaXNHcm91cGluZzogaGFzR3JvdXBpbmcsXG4gICAgICAgICAgICBpc1NvcnRpbmc6IGhhc1NvcnRpbmcsXG4gICAgICAgICAgICB0YWdzOiB0YWdzLFxuICAgICAgICAgICAgYXV0b1J1bjogY3VzdG9tLmF1dG9SdW4sXG4gICAgICAgICAgICBpc0N1c3RvbTogdHJ1ZVxuICAgICAgICB9O1xuXG4gICAgICAgIGlmIChleGlzdGluZ0luZGV4ICE9PSAtMSkge1xuICAgICAgICAgICAgY29tYmluZWRbZXhpc3RpbmdJbmRleF0gPSBkZWZpbml0aW9uO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29tYmluZWQucHVzaChkZWZpbml0aW9uKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGNvbWJpbmVkO1xufTtcblxuZXhwb3J0IGNvbnN0IGdldFN0cmF0ZWd5ID0gKGlkOiBTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmcpOiBTdHJhdGVneURlZmluaXRpb24gfCB1bmRlZmluZWQgPT4gU1RSQVRFR0lFUy5maW5kKHMgPT4gcy5pZCA9PT0gaWQpO1xuIiwgImltcG9ydCB7IExvZ0VudHJ5LCBMb2dMZXZlbCwgUHJlZmVyZW5jZXMgfSBmcm9tIFwiLi90eXBlcy5qc1wiO1xuXG5jb25zdCBQUkVGSVggPSBcIltUYWJTb3J0ZXJdXCI7XG5cbmNvbnN0IExFVkVMX1BSSU9SSVRZOiBSZWNvcmQ8TG9nTGV2ZWwsIG51bWJlcj4gPSB7XG4gIGRlYnVnOiAwLFxuICBpbmZvOiAxLFxuICB3YXJuOiAyLFxuICBlcnJvcjogMyxcbiAgY3JpdGljYWw6IDRcbn07XG5cbmxldCBjdXJyZW50TGV2ZWw6IExvZ0xldmVsID0gXCJpbmZvXCI7XG5sZXQgbG9nczogTG9nRW50cnlbXSA9IFtdO1xuY29uc3QgTUFYX0xPR1MgPSAxMDAwO1xuY29uc3QgU1RPUkFHRV9LRVkgPSBcInNlc3Npb25Mb2dzXCI7XG5cbi8vIFNhZmUgY29udGV4dCBjaGVja1xuY29uc3QgaXNTZXJ2aWNlV29ya2VyID0gdHlwZW9mIHNlbGYgIT09ICd1bmRlZmluZWQnICYmXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlb2YgKHNlbGYgYXMgYW55KS5TZXJ2aWNlV29ya2VyR2xvYmFsU2NvcGUgIT09ICd1bmRlZmluZWQnICYmXG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmIGluc3RhbmNlb2YgKHNlbGYgYXMgYW55KS5TZXJ2aWNlV29ya2VyR2xvYmFsU2NvcGU7XG5sZXQgaXNTYXZpbmcgPSBmYWxzZTtcbmxldCBwZW5kaW5nU2F2ZSA9IGZhbHNlO1xubGV0IHNhdmVUaW1lcjogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCBudWxsID0gbnVsbDtcblxuY29uc3QgZG9TYXZlID0gKCkgPT4ge1xuICAgIGlmICghaXNTZXJ2aWNlV29ya2VyIHx8ICFjaHJvbWU/LnN0b3JhZ2U/LnNlc3Npb24gfHwgaXNTYXZpbmcpIHtcbiAgICAgICAgcGVuZGluZ1NhdmUgPSB0cnVlO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaXNTYXZpbmcgPSB0cnVlO1xuICAgIHBlbmRpbmdTYXZlID0gZmFsc2U7XG5cbiAgICBjaHJvbWUuc3RvcmFnZS5zZXNzaW9uLnNldCh7IFtTVE9SQUdFX0tFWV06IGxvZ3MgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIGlzU2F2aW5nID0gZmFsc2U7XG4gICAgICAgIGlmIChwZW5kaW5nU2F2ZSkge1xuICAgICAgICAgICAgc2F2ZUxvZ3NUb1N0b3JhZ2UoKTtcbiAgICAgICAgfVxuICAgIH0pLmNhdGNoKGVyciA9PiB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gc2F2ZSBsb2dzXCIsIGVycik7XG4gICAgICAgIGlzU2F2aW5nID0gZmFsc2U7XG4gICAgfSk7XG59O1xuXG5jb25zdCBzYXZlTG9nc1RvU3RvcmFnZSA9ICgpID0+IHtcbiAgICBpZiAoc2F2ZVRpbWVyKSBjbGVhclRpbWVvdXQoc2F2ZVRpbWVyKTtcbiAgICBzYXZlVGltZXIgPSBzZXRUaW1lb3V0KGRvU2F2ZSwgMTAwMCk7XG59O1xuXG5sZXQgcmVzb2x2ZUxvZ2dlclJlYWR5OiAoKSA9PiB2b2lkO1xuZXhwb3J0IGNvbnN0IGxvZ2dlclJlYWR5ID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG4gICAgcmVzb2x2ZUxvZ2dlclJlYWR5ID0gcmVzb2x2ZTtcbn0pO1xuXG5leHBvcnQgY29uc3QgaW5pdExvZ2dlciA9IGFzeW5jICgpID0+IHtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyICYmIGNocm9tZT8uc3RvcmFnZT8uc2Vzc2lvbikge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY2hyb21lLnN0b3JhZ2Uuc2Vzc2lvbi5nZXQoU1RPUkFHRV9LRVkpO1xuICAgICAgICAgICAgaWYgKHJlc3VsdFtTVE9SQUdFX0tFWV0gJiYgQXJyYXkuaXNBcnJheShyZXN1bHRbU1RPUkFHRV9LRVldKSkge1xuICAgICAgICAgICAgICAgIGxvZ3MgPSByZXN1bHRbU1RPUkFHRV9LRVldO1xuICAgICAgICAgICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSBsb2dzID0gbG9ncy5zbGljZSgwLCBNQVhfTE9HUyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gcmVzdG9yZSBsb2dzXCIsIGUpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGlmIChyZXNvbHZlTG9nZ2VyUmVhZHkpIHJlc29sdmVMb2dnZXJSZWFkeSgpO1xufTtcblxuZXhwb3J0IGNvbnN0IHNldExvZ2dlclByZWZlcmVuY2VzID0gKHByZWZzOiBQcmVmZXJlbmNlcykgPT4ge1xuICBpZiAocHJlZnMubG9nTGV2ZWwpIHtcbiAgICBjdXJyZW50TGV2ZWwgPSBwcmVmcy5sb2dMZXZlbDtcbiAgfSBlbHNlIGlmIChwcmVmcy5kZWJ1Zykge1xuICAgIGN1cnJlbnRMZXZlbCA9IFwiZGVidWdcIjtcbiAgfSBlbHNlIHtcbiAgICBjdXJyZW50TGV2ZWwgPSBcImluZm9cIjtcbiAgfVxufTtcblxuY29uc3Qgc2hvdWxkTG9nID0gKGxldmVsOiBMb2dMZXZlbCk6IGJvb2xlYW4gPT4ge1xuICByZXR1cm4gTEVWRUxfUFJJT1JJVFlbbGV2ZWxdID49IExFVkVMX1BSSU9SSVRZW2N1cnJlbnRMZXZlbF07XG59O1xuXG5jb25zdCBmb3JtYXRNZXNzYWdlID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIHJldHVybiBjb250ZXh0ID8gYCR7bWVzc2FnZX0gOjogJHtKU09OLnN0cmluZ2lmeShjb250ZXh0KX1gIDogbWVzc2FnZTtcbn07XG5cbmNvbnN0IGFkZExvZyA9IChsZXZlbDogTG9nTGV2ZWwsIG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIC8vIEFsd2F5cyBhZGQgdG8gYnVmZmVyIHJlZ2FyZGxlc3Mgb2YgY3VycmVudCBjb25zb2xlIGxldmVsIHNldHRpbmcsXG4gIC8vIG9yIHNob3VsZCB3ZSByZXNwZWN0IGl0PyBVc3VhbGx5IGRlYnVnIGxvZ3MgYXJlIG5vaXN5LlxuICAvLyBMZXQncyByZXNwZWN0IHNob3VsZExvZyBmb3IgdGhlIGJ1ZmZlciB0b28gdG8gc2F2ZSBtZW1vcnkvbm9pc2UsXG4gIC8vIE9SIHdlIGNhbiBzdG9yZSBldmVyeXRoaW5nIGJ1dCBmaWx0ZXIgb24gdmlldy5cbiAgLy8gR2l2ZW4gd2Ugd2FudCB0byBkZWJ1ZyBpc3N1ZXMsIHN0b3JpbmcgZXZlcnl0aGluZyBtaWdodCBiZSBiZXR0ZXIsXG4gIC8vIGJ1dCBpZiB3ZSBzdG9yZSBldmVyeXRoaW5nIHdlIG1pZ2h0IGZpbGwgYnVmZmVyIHdpdGggZGVidWcgbm9pc2UgcXVpY2tseS5cbiAgLy8gTGV0J3Mgc3RpY2sgdG8gc3RvcmluZyB3aGF0IGlzIGNvbmZpZ3VyZWQgdG8gYmUgbG9nZ2VkLlxuICAvLyBXYWl0LCBpZiBJIHdhbnQgdG8gXCJkZWJ1Z1wiIHNvbWV0aGluZywgSSB1c3VhbGx5IHR1cm4gb24gZGVidWcgbG9ncy5cbiAgLy8gSWYgSSBjYW4ndCBzZWUgcGFzdCBsb2dzIGJlY2F1c2UgdGhleSB3ZXJlbid0IHN0b3JlZCwgSSBoYXZlIHRvIHJlcHJvLlxuICAvLyBMZXQncyBzdG9yZSBpZiBpdCBwYXNzZXMgYHNob3VsZExvZ2AuXG5cbiAgaWYgKHNob3VsZExvZyhsZXZlbCkpIHtcbiAgICAgIGNvbnN0IGVudHJ5OiBMb2dFbnRyeSA9IHtcbiAgICAgICAgICB0aW1lc3RhbXA6IERhdGUubm93KCksXG4gICAgICAgICAgbGV2ZWwsXG4gICAgICAgICAgbWVzc2FnZSxcbiAgICAgICAgICBjb250ZXh0XG4gICAgICB9O1xuXG4gICAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSB7XG4gICAgICAgICAgbG9ncy51bnNoaWZ0KGVudHJ5KTtcbiAgICAgICAgICBpZiAobG9ncy5sZW5ndGggPiBNQVhfTE9HUykge1xuICAgICAgICAgICAgICBsb2dzLnBvcCgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBzYXZlTG9nc1RvU3RvcmFnZSgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBJbiBvdGhlciBjb250ZXh0cywgc2VuZCB0byBTV1xuICAgICAgICAgIGlmIChjaHJvbWU/LnJ1bnRpbWU/LnNlbmRNZXNzYWdlKSB7XG4gICAgICAgICAgICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiAnbG9nRW50cnknLCBwYXlsb2FkOiBlbnRyeSB9KS5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgIC8vIElnbm9yZSBpZiBtZXNzYWdlIGZhaWxzIChlLmcuIGNvbnRleHQgaW52YWxpZGF0ZWQpXG4gICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgfVxuICB9XG59O1xuXG5leHBvcnQgY29uc3QgYWRkTG9nRW50cnkgPSAoZW50cnk6IExvZ0VudHJ5KSA9PiB7XG4gICAgaWYgKGlzU2VydmljZVdvcmtlcikge1xuICAgICAgICBsb2dzLnVuc2hpZnQoZW50cnkpO1xuICAgICAgICBpZiAobG9ncy5sZW5ndGggPiBNQVhfTE9HUykge1xuICAgICAgICAgICAgbG9ncy5wb3AoKTtcbiAgICAgICAgfVxuICAgICAgICBzYXZlTG9nc1RvU3RvcmFnZSgpO1xuICAgIH1cbn07XG5cbmV4cG9ydCBjb25zdCBnZXRMb2dzID0gKCkgPT4gWy4uLmxvZ3NdO1xuZXhwb3J0IGNvbnN0IGNsZWFyTG9ncyA9ICgpID0+IHtcbiAgICBsb2dzLmxlbmd0aCA9IDA7XG4gICAgaWYgKGlzU2VydmljZVdvcmtlcikgc2F2ZUxvZ3NUb1N0b3JhZ2UoKTtcbn07XG5cbmV4cG9ydCBjb25zdCBsb2dEZWJ1ZyA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBhZGRMb2coXCJkZWJ1Z1wiLCBtZXNzYWdlLCBjb250ZXh0KTtcbiAgaWYgKHNob3VsZExvZyhcImRlYnVnXCIpKSB7XG4gICAgY29uc29sZS5kZWJ1ZyhgJHtQUkVGSVh9IFtERUJVR10gJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nSW5mbyA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBhZGRMb2coXCJpbmZvXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwiaW5mb1wiKSkge1xuICAgIGNvbnNvbGUuaW5mbyhgJHtQUkVGSVh9IFtJTkZPXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgY29udGV4dCl9YCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBsb2dXYXJuID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcIndhcm5cIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJ3YXJuXCIpKSB7XG4gICAgY29uc29sZS53YXJuKGAke1BSRUZJWH0gW1dBUk5dICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0Vycm9yID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImVycm9yXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwiZXJyb3JcIikpIHtcbiAgICBjb25zb2xlLmVycm9yKGAke1BSRUZJWH0gW0VSUk9SXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgY29udGV4dCl9YCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBsb2dDcml0aWNhbCA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBhZGRMb2coXCJjcml0aWNhbFwiLCBtZXNzYWdlLCBjb250ZXh0KTtcbiAgaWYgKHNob3VsZExvZyhcImNyaXRpY2FsXCIpKSB7XG4gICAgLy8gQ3JpdGljYWwgbG9ncyB1c2UgZXJyb3IgY29uc29sZSBidXQgd2l0aCBkaXN0aW5jdCBwcmVmaXggYW5kIG1heWJlIHN0eWxpbmcgaWYgc3VwcG9ydGVkXG4gICAgY29uc29sZS5lcnJvcihgJHtQUkVGSVh9IFtDUklUSUNBTF0gXHVEODNEXHVERUE4ICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcbiIsICJpbXBvcnQgeyBQcmVmZXJlbmNlcywgU29ydGluZ1N0cmF0ZWd5LCBUYWJNZXRhZGF0YSB9IGZyb20gXCIuL3R5cGVzLmpzXCI7XG5cbmV4cG9ydCBjb25zdCBtYXBDaHJvbWVUYWIgPSAodGFiOiBjaHJvbWUudGFicy5UYWIpOiBUYWJNZXRhZGF0YSB8IG51bGwgPT4ge1xuICBpZiAoIXRhYi5pZCB8fCAhdGFiLndpbmRvd0lkKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHtcbiAgICBpZDogdGFiLmlkLFxuICAgIHdpbmRvd0lkOiB0YWIud2luZG93SWQsXG4gICAgdGl0bGU6IHRhYi50aXRsZSB8fCBcIlVudGl0bGVkXCIsXG4gICAgdXJsOiB0YWIudXJsIHx8IFwiYWJvdXQ6YmxhbmtcIixcbiAgICBwaW5uZWQ6IEJvb2xlYW4odGFiLnBpbm5lZCksXG4gICAgbGFzdEFjY2Vzc2VkOiB0YWIubGFzdEFjY2Vzc2VkLFxuICAgIG9wZW5lclRhYklkOiB0YWIub3BlbmVyVGFiSWQgPz8gdW5kZWZpbmVkLFxuICAgIGZhdkljb25Vcmw6IHRhYi5mYXZJY29uVXJsLFxuICAgIGdyb3VwSWQ6IHRhYi5ncm91cElkLFxuICAgIGluZGV4OiB0YWIuaW5kZXgsXG4gICAgYWN0aXZlOiB0YWIuYWN0aXZlLFxuICAgIHN0YXR1czogdGFiLnN0YXR1cyxcbiAgICBzZWxlY3RlZDogdGFiLmhpZ2hsaWdodGVkXG4gIH07XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0U3RvcmVkUHJlZmVyZW5jZXMgPSBhc3luYyAoKTogUHJvbWlzZTxQcmVmZXJlbmNlcyB8IG51bGw+ID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFwicHJlZmVyZW5jZXNcIiwgKGl0ZW1zKSA9PiB7XG4gICAgICByZXNvbHZlKChpdGVtc1tcInByZWZlcmVuY2VzXCJdIGFzIFByZWZlcmVuY2VzKSA/PyBudWxsKTtcbiAgICB9KTtcbiAgfSk7XG59O1xuXG5leHBvcnQgY29uc3QgYXNBcnJheSA9IDxUPih2YWx1ZTogdW5rbm93bik6IFRbXSA9PiB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSByZXR1cm4gdmFsdWUgYXMgVFtdO1xuICAgIHJldHVybiBbXTtcbn07XG4iLCAiaW1wb3J0IHsgR3JvdXBpbmdTdHJhdGVneSwgU29ydGluZ1N0cmF0ZWd5LCBUYWJHcm91cCwgVGFiTWV0YWRhdGEsIEN1c3RvbVN0cmF0ZWd5LCBTdHJhdGVneVJ1bGUsIFJ1bGVDb25kaXRpb24sIEdyb3VwaW5nUnVsZSwgU29ydGluZ1J1bGUgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBnZXRTdHJhdGVnaWVzIH0gZnJvbSBcIi4uL3NoYXJlZC9zdHJhdGVneVJlZ2lzdHJ5LmpzXCI7XG5pbXBvcnQgeyBsb2dEZWJ1ZyB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBhc0FycmF5IH0gZnJvbSBcIi4uL3NoYXJlZC91dGlscy5qc1wiO1xuXG5sZXQgY3VzdG9tU3RyYXRlZ2llczogQ3VzdG9tU3RyYXRlZ3lbXSA9IFtdO1xuXG5leHBvcnQgY29uc3Qgc2V0Q3VzdG9tU3RyYXRlZ2llcyA9IChzdHJhdGVnaWVzOiBDdXN0b21TdHJhdGVneVtdKSA9PiB7XG4gICAgY3VzdG9tU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXM7XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0Q3VzdG9tU3RyYXRlZ2llcyA9ICgpOiBDdXN0b21TdHJhdGVneVtdID0+IGN1c3RvbVN0cmF0ZWdpZXM7XG5cbmNvbnN0IENPTE9SUyA9IFtcImdyZXlcIiwgXCJibHVlXCIsIFwicmVkXCIsIFwieWVsbG93XCIsIFwiZ3JlZW5cIiwgXCJwaW5rXCIsIFwicHVycGxlXCIsIFwiY3lhblwiLCBcIm9yYW5nZVwiXTtcblxuY29uc3QgcmVnZXhDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBSZWdFeHA+KCk7XG5cbmV4cG9ydCBjb25zdCBkb21haW5Gcm9tVXJsID0gKHVybDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBwYXJzZWQgPSBuZXcgVVJMKHVybCk7XG4gICAgcmV0dXJuIHBhcnNlZC5ob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgXCJcIik7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgbG9nRGVidWcoXCJGYWlsZWQgdG8gcGFyc2UgZG9tYWluXCIsIHsgdXJsLCBlcnJvcjogU3RyaW5nKGVycm9yKSB9KTtcbiAgICByZXR1cm4gXCJ1bmtub3duXCI7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBzdWJkb21haW5Gcm9tVXJsID0gKHVybDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBwYXJzZWQgPSBuZXcgVVJMKHVybCk7XG4gICAgICAgIGxldCBob3N0bmFtZSA9IHBhcnNlZC5ob3N0bmFtZTtcbiAgICAgICAgLy8gUmVtb3ZlIHd3dy5cbiAgICAgICAgaG9zdG5hbWUgPSBob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgXCJcIik7XG5cbiAgICAgICAgY29uc3QgcGFydHMgPSBob3N0bmFtZS5zcGxpdCgnLicpO1xuICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMikge1xuICAgICAgICAgICAgIHJldHVybiBwYXJ0cy5zbGljZSgwLCBwYXJ0cy5sZW5ndGggLSAyKS5qb2luKCcuJyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBcIlwiO1xuICAgIH1cbn1cblxuZXhwb3J0IGNvbnN0IGdldEZpZWxkVmFsdWUgPSAodGFiOiBUYWJNZXRhZGF0YSwgZmllbGQ6IHN0cmluZyk6IGFueSA9PiB7XG4gICAgc3dpdGNoKGZpZWxkKSB7XG4gICAgICAgIGNhc2UgJ2lkJzogcmV0dXJuIHRhYi5pZDtcbiAgICAgICAgY2FzZSAnaW5kZXgnOiByZXR1cm4gdGFiLmluZGV4O1xuICAgICAgICBjYXNlICd3aW5kb3dJZCc6IHJldHVybiB0YWIud2luZG93SWQ7XG4gICAgICAgIGNhc2UgJ2dyb3VwSWQnOiByZXR1cm4gdGFiLmdyb3VwSWQ7XG4gICAgICAgIGNhc2UgJ3RpdGxlJzogcmV0dXJuIHRhYi50aXRsZTtcbiAgICAgICAgY2FzZSAndXJsJzogcmV0dXJuIHRhYi51cmw7XG4gICAgICAgIGNhc2UgJ3N0YXR1cyc6IHJldHVybiB0YWIuc3RhdHVzO1xuICAgICAgICBjYXNlICdhY3RpdmUnOiByZXR1cm4gdGFiLmFjdGl2ZTtcbiAgICAgICAgY2FzZSAnc2VsZWN0ZWQnOiByZXR1cm4gdGFiLnNlbGVjdGVkO1xuICAgICAgICBjYXNlICdwaW5uZWQnOiByZXR1cm4gdGFiLnBpbm5lZDtcbiAgICAgICAgY2FzZSAnb3BlbmVyVGFiSWQnOiByZXR1cm4gdGFiLm9wZW5lclRhYklkO1xuICAgICAgICBjYXNlICdsYXN0QWNjZXNzZWQnOiByZXR1cm4gdGFiLmxhc3RBY2Nlc3NlZDtcbiAgICAgICAgY2FzZSAnY29udGV4dCc6IHJldHVybiB0YWIuY29udGV4dDtcbiAgICAgICAgY2FzZSAnZ2VucmUnOiByZXR1cm4gdGFiLmNvbnRleHREYXRhPy5nZW5yZTtcbiAgICAgICAgY2FzZSAnc2l0ZU5hbWUnOiByZXR1cm4gdGFiLmNvbnRleHREYXRhPy5zaXRlTmFtZTtcbiAgICAgICAgLy8gRGVyaXZlZCBvciBtYXBwZWQgZmllbGRzXG4gICAgICAgIGNhc2UgJ2RvbWFpbic6IHJldHVybiBkb21haW5Gcm9tVXJsKHRhYi51cmwpO1xuICAgICAgICBjYXNlICdzdWJkb21haW4nOiByZXR1cm4gc3ViZG9tYWluRnJvbVVybCh0YWIudXJsKTtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIGlmIChmaWVsZC5pbmNsdWRlcygnLicpKSB7XG4gICAgICAgICAgICAgICAgIHJldHVybiBmaWVsZC5zcGxpdCgnLicpLnJlZHVjZSgob2JqLCBrZXkpID0+IChvYmogJiYgdHlwZW9mIG9iaiA9PT0gJ29iamVjdCcgJiYgb2JqICE9PSBudWxsKSA/IChvYmogYXMgYW55KVtrZXldIDogdW5kZWZpbmVkLCB0YWIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuICh0YWIgYXMgYW55KVtmaWVsZF07XG4gICAgfVxufTtcblxuY29uc3Qgc3RyaXBUbGQgPSAoZG9tYWluOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gZG9tYWluLnJlcGxhY2UoL1xcLihjb218b3JnfGdvdnxuZXR8ZWR1fGlvKSQvaSwgXCJcIik7XG59O1xuXG5leHBvcnQgY29uc3Qgc2VtYW50aWNCdWNrZXQgPSAodGl0bGU6IHN0cmluZywgdXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBrZXkgPSBgJHt0aXRsZX0gJHt1cmx9YC50b0xvd2VyQ2FzZSgpO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiZG9jXCIpIHx8IGtleS5pbmNsdWRlcyhcInJlYWRtZVwiKSB8fCBrZXkuaW5jbHVkZXMoXCJndWlkZVwiKSkgcmV0dXJuIFwiRG9jc1wiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwibWFpbFwiKSB8fCBrZXkuaW5jbHVkZXMoXCJpbmJveFwiKSkgcmV0dXJuIFwiQ2hhdFwiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiZGFzaGJvYXJkXCIpIHx8IGtleS5pbmNsdWRlcyhcImNvbnNvbGVcIikpIHJldHVybiBcIkRhc2hcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImlzc3VlXCIpIHx8IGtleS5pbmNsdWRlcyhcInRpY2tldFwiKSkgcmV0dXJuIFwiVGFza3NcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImRyaXZlXCIpIHx8IGtleS5pbmNsdWRlcyhcInN0b3JhZ2VcIikpIHJldHVybiBcIkZpbGVzXCI7XG4gIHJldHVybiBcIk1pc2NcIjtcbn07XG5cbmV4cG9ydCBjb25zdCBuYXZpZ2F0aW9uS2V5ID0gKHRhYjogVGFiTWV0YWRhdGEpOiBzdHJpbmcgPT4ge1xuICBpZiAodGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gYGNoaWxkLW9mLSR7dGFiLm9wZW5lclRhYklkfWA7XG4gIH1cbiAgcmV0dXJuIGB3aW5kb3ctJHt0YWIud2luZG93SWR9YDtcbn07XG5cbmNvbnN0IGdldFJlY2VuY3lMYWJlbCA9IChsYXN0QWNjZXNzZWQ6IG51bWJlcik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gIGNvbnN0IGRpZmYgPSBub3cgLSBsYXN0QWNjZXNzZWQ7XG4gIGlmIChkaWZmIDwgMzYwMDAwMCkgcmV0dXJuIFwiSnVzdCBub3dcIjsgLy8gMWhcbiAgaWYgKGRpZmYgPCA4NjQwMDAwMCkgcmV0dXJuIFwiVG9kYXlcIjsgLy8gMjRoXG4gIGlmIChkaWZmIDwgMTcyODAwMDAwKSByZXR1cm4gXCJZZXN0ZXJkYXlcIjsgLy8gNDhoXG4gIGlmIChkaWZmIDwgNjA0ODAwMDAwKSByZXR1cm4gXCJUaGlzIFdlZWtcIjsgLy8gN2RcbiAgcmV0dXJuIFwiT2xkZXJcIjtcbn07XG5cbmNvbnN0IGNvbG9yRm9yS2V5ID0gKGtleTogc3RyaW5nLCBvZmZzZXQ6IG51bWJlcik6IHN0cmluZyA9PiBDT0xPUlNbKE1hdGguYWJzKGhhc2hDb2RlKGtleSkpICsgb2Zmc2V0KSAlIENPTE9SUy5sZW5ndGhdO1xuXG5jb25zdCBoYXNoQ29kZSA9ICh2YWx1ZTogc3RyaW5nKTogbnVtYmVyID0+IHtcbiAgbGV0IGhhc2ggPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHZhbHVlLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgaGFzaCA9IChoYXNoIDw8IDUpIC0gaGFzaCArIHZhbHVlLmNoYXJDb2RlQXQoaSk7XG4gICAgaGFzaCB8PSAwO1xuICB9XG4gIHJldHVybiBoYXNoO1xufTtcblxuLy8gSGVscGVyIHRvIGdldCBhIGh1bWFuLXJlYWRhYmxlIGxhYmVsIGNvbXBvbmVudCBmcm9tIGEgc3RyYXRlZ3kgYW5kIGEgc2V0IG9mIHRhYnNcbmNvbnN0IGdldExhYmVsQ29tcG9uZW50ID0gKHN0cmF0ZWd5OiBHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nLCB0YWJzOiBUYWJNZXRhZGF0YVtdLCBhbGxUYWJzTWFwOiBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YT4pOiBzdHJpbmcgfCBudWxsID0+IHtcbiAgY29uc3QgZmlyc3RUYWIgPSB0YWJzWzBdO1xuICBpZiAoIWZpcnN0VGFiKSByZXR1cm4gXCJVbmtub3duXCI7XG5cbiAgLy8gQ2hlY2sgY3VzdG9tIHN0cmF0ZWdpZXMgZmlyc3RcbiAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3kpO1xuICBpZiAoY3VzdG9tKSB7XG4gICAgICByZXR1cm4gZ3JvdXBpbmdLZXkoZmlyc3RUYWIsIHN0cmF0ZWd5KTtcbiAgfVxuXG4gIHN3aXRjaCAoc3RyYXRlZ3kpIHtcbiAgICBjYXNlIFwiZG9tYWluXCI6IHtcbiAgICAgIGNvbnN0IHNpdGVOYW1lcyA9IG5ldyBTZXQodGFicy5tYXAodCA9PiB0LmNvbnRleHREYXRhPy5zaXRlTmFtZSkuZmlsdGVyKEJvb2xlYW4pKTtcbiAgICAgIGlmIChzaXRlTmFtZXMuc2l6ZSA9PT0gMSkge1xuICAgICAgICByZXR1cm4gc3RyaXBUbGQoQXJyYXkuZnJvbShzaXRlTmFtZXMpWzBdIGFzIHN0cmluZyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gc3RyaXBUbGQoZG9tYWluRnJvbVVybChmaXJzdFRhYi51cmwpKTtcbiAgICB9XG4gICAgY2FzZSBcImRvbWFpbl9mdWxsXCI6XG4gICAgICByZXR1cm4gZG9tYWluRnJvbVVybChmaXJzdFRhYi51cmwpO1xuICAgIGNhc2UgXCJ0b3BpY1wiOlxuICAgICAgcmV0dXJuIHNlbWFudGljQnVja2V0KGZpcnN0VGFiLnRpdGxlLCBmaXJzdFRhYi51cmwpO1xuICAgIGNhc2UgXCJsaW5lYWdlXCI6XG4gICAgICBpZiAoZmlyc3RUYWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBjb25zdCBwYXJlbnQgPSBhbGxUYWJzTWFwLmdldChmaXJzdFRhYi5vcGVuZXJUYWJJZCk7XG4gICAgICAgIGlmIChwYXJlbnQpIHtcbiAgICAgICAgICBjb25zdCBwYXJlbnRUaXRsZSA9IHBhcmVudC50aXRsZS5sZW5ndGggPiAyMCA/IHBhcmVudC50aXRsZS5zdWJzdHJpbmcoMCwgMjApICsgXCIuLi5cIiA6IHBhcmVudC50aXRsZTtcbiAgICAgICAgICByZXR1cm4gYEZyb206ICR7cGFyZW50VGl0bGV9YDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYEZyb206IFRhYiAke2ZpcnN0VGFiLm9wZW5lclRhYklkfWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYFdpbmRvdyAke2ZpcnN0VGFiLndpbmRvd0lkfWA7XG4gICAgY2FzZSBcImNvbnRleHRcIjpcbiAgICAgIHJldHVybiBmaXJzdFRhYi5jb250ZXh0IHx8IFwiVW5jYXRlZ29yaXplZFwiO1xuICAgIGNhc2UgXCJwaW5uZWRcIjpcbiAgICAgIHJldHVybiBmaXJzdFRhYi5waW5uZWQgPyBcIlBpbm5lZFwiIDogXCJVbnBpbm5lZFwiO1xuICAgIGNhc2UgXCJhZ2VcIjpcbiAgICAgIHJldHVybiBnZXRSZWNlbmN5TGFiZWwoZmlyc3RUYWIubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgIGNhc2UgXCJ1cmxcIjpcbiAgICAgIHJldHVybiBcIlVSTCBHcm91cFwiO1xuICAgIGNhc2UgXCJyZWNlbmN5XCI6XG4gICAgICByZXR1cm4gXCJUaW1lIEdyb3VwXCI7XG4gICAgY2FzZSBcIm5lc3RpbmdcIjpcbiAgICAgIHJldHVybiBmaXJzdFRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkID8gXCJDaGlsZHJlblwiIDogXCJSb290c1wiO1xuICAgIGRlZmF1bHQ6XG4gICAgICBjb25zdCB2YWwgPSBnZXRGaWVsZFZhbHVlKGZpcnN0VGFiLCBzdHJhdGVneSk7XG4gICAgICBpZiAodmFsICE9PSB1bmRlZmluZWQgJiYgdmFsICE9PSBudWxsKSB7XG4gICAgICAgICAgcmV0dXJuIFN0cmluZyh2YWwpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIFwiVW5rbm93blwiO1xuICB9XG59O1xuXG5jb25zdCBnZW5lcmF0ZUxhYmVsID0gKFxuICBzdHJhdGVnaWVzOiAoR3JvdXBpbmdTdHJhdGVneSB8IHN0cmluZylbXSxcbiAgdGFiczogVGFiTWV0YWRhdGFbXSxcbiAgYWxsVGFic01hcDogTWFwPG51bWJlciwgVGFiTWV0YWRhdGE+XG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBsYWJlbHMgPSBzdHJhdGVnaWVzXG4gICAgLm1hcChzID0+IGdldExhYmVsQ29tcG9uZW50KHMsIHRhYnMsIGFsbFRhYnNNYXApKVxuICAgIC5maWx0ZXIobCA9PiBsICYmIGwgIT09IFwiVW5rbm93blwiICYmIGwgIT09IFwiR3JvdXBcIiAmJiBsICE9PSBcIlVSTCBHcm91cFwiICYmIGwgIT09IFwiVGltZSBHcm91cFwiICYmIGwgIT09IFwiTWlzY1wiKTtcblxuICBpZiAobGFiZWxzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIFwiR3JvdXBcIjtcbiAgcmV0dXJuIEFycmF5LmZyb20obmV3IFNldChsYWJlbHMpKS5qb2luKFwiIC0gXCIpO1xufTtcblxuY29uc3QgZ2V0U3RyYXRlZ3lDb2xvciA9IChzdHJhdGVneUlkOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQgPT4ge1xuICAgIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5SWQpO1xuICAgIGlmICghY3VzdG9tKSByZXR1cm4gdW5kZWZpbmVkO1xuXG4gICAgY29uc3QgZ3JvdXBpbmdSdWxlc0xpc3QgPSBhc0FycmF5PEdyb3VwaW5nUnVsZT4oY3VzdG9tLmdyb3VwaW5nUnVsZXMpO1xuICAgIC8vIEl0ZXJhdGUgbWFudWFsbHkgdG8gY2hlY2sgY29sb3JcbiAgICBmb3IgKGxldCBpID0gZ3JvdXBpbmdSdWxlc0xpc3QubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgY29uc3QgcnVsZSA9IGdyb3VwaW5nUnVsZXNMaXN0W2ldO1xuICAgICAgICBpZiAocnVsZSAmJiBydWxlLmNvbG9yICYmIHJ1bGUuY29sb3IgIT09ICdyYW5kb20nKSB7XG4gICAgICAgICAgICByZXR1cm4gcnVsZS5jb2xvcjtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xufTtcblxuY29uc3QgcmVzb2x2ZVdpbmRvd01vZGUgPSAobW9kZXM6IChzdHJpbmcgfCB1bmRlZmluZWQpW10pOiBcImN1cnJlbnRcIiB8IFwibmV3XCIgfCBcImNvbXBvdW5kXCIgPT4ge1xuICAgIGlmIChtb2Rlcy5pbmNsdWRlcyhcIm5ld1wiKSkgcmV0dXJuIFwibmV3XCI7XG4gICAgaWYgKG1vZGVzLmluY2x1ZGVzKFwiY29tcG91bmRcIikpIHJldHVybiBcImNvbXBvdW5kXCI7XG4gICAgcmV0dXJuIFwiY3VycmVudFwiO1xufTtcblxuZXhwb3J0IGNvbnN0IGdyb3VwVGFicyA9IChcbiAgdGFiczogVGFiTWV0YWRhdGFbXSxcbiAgc3RyYXRlZ2llczogKFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZylbXVxuKTogVGFiR3JvdXBbXSA9PiB7XG4gIGNvbnN0IGF2YWlsYWJsZVN0cmF0ZWdpZXMgPSBnZXRTdHJhdGVnaWVzKGN1c3RvbVN0cmF0ZWdpZXMpO1xuICBjb25zdCBlZmZlY3RpdmVTdHJhdGVnaWVzID0gc3RyYXRlZ2llcy5maWx0ZXIocyA9PiBhdmFpbGFibGVTdHJhdGVnaWVzLmZpbmQoYXZhaWwgPT4gYXZhaWwuaWQgPT09IHMpPy5pc0dyb3VwaW5nKTtcbiAgY29uc3QgYnVja2V0cyA9IG5ldyBNYXA8c3RyaW5nLCBUYWJHcm91cD4oKTtcblxuICBjb25zdCBhbGxUYWJzTWFwID0gbmV3IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhPigpO1xuICB0YWJzLmZvckVhY2godCA9PiBhbGxUYWJzTWFwLnNldCh0LmlkLCB0KSk7XG5cbiAgdGFicy5mb3JFYWNoKCh0YWIpID0+IHtcbiAgICBsZXQga2V5czogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBhcHBsaWVkU3RyYXRlZ2llczogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBjb2xsZWN0ZWRNb2Rlczogc3RyaW5nW10gPSBbXTtcblxuICAgIHRyeSB7XG4gICAgICAgIGZvciAoY29uc3QgcyBvZiBlZmZlY3RpdmVTdHJhdGVnaWVzKSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBnZXRHcm91cGluZ1Jlc3VsdCh0YWIsIHMpO1xuICAgICAgICAgICAgaWYgKHJlc3VsdC5rZXkgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBrZXlzLnB1c2goYCR7c306JHtyZXN1bHQua2V5fWApO1xuICAgICAgICAgICAgICAgIGFwcGxpZWRTdHJhdGVnaWVzLnB1c2gocyk7XG4gICAgICAgICAgICAgICAgY29sbGVjdGVkTW9kZXMucHVzaChyZXN1bHQubW9kZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGxvZ0RlYnVnKFwiRXJyb3IgZ2VuZXJhdGluZyBncm91cGluZyBrZXlcIiwgeyB0YWJJZDogdGFiLmlkLCBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICByZXR1cm47IC8vIFNraXAgdGhpcyB0YWIgb24gZXJyb3JcbiAgICB9XG5cbiAgICAvLyBJZiBubyBzdHJhdGVnaWVzIGFwcGxpZWQgKGUuZy4gYWxsIGZpbHRlcmVkIG91dCksIHNraXAgZ3JvdXBpbmcgZm9yIHRoaXMgdGFiXG4gICAgaWYgKGtleXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBlZmZlY3RpdmVNb2RlID0gcmVzb2x2ZVdpbmRvd01vZGUoY29sbGVjdGVkTW9kZXMpO1xuICAgIGNvbnN0IHZhbHVlS2V5ID0ga2V5cy5qb2luKFwiOjpcIik7XG4gICAgbGV0IGJ1Y2tldEtleSA9IFwiXCI7XG4gICAgaWYgKGVmZmVjdGl2ZU1vZGUgPT09ICdjdXJyZW50Jykge1xuICAgICAgICAgYnVja2V0S2V5ID0gYHdpbmRvdy0ke3RhYi53aW5kb3dJZH06OmAgKyB2YWx1ZUtleTtcbiAgICB9IGVsc2Uge1xuICAgICAgICAgYnVja2V0S2V5ID0gYGdsb2JhbDo6YCArIHZhbHVlS2V5O1xuICAgIH1cblxuICAgIGxldCBncm91cCA9IGJ1Y2tldHMuZ2V0KGJ1Y2tldEtleSk7XG4gICAgaWYgKCFncm91cCkge1xuICAgICAgbGV0IGdyb3VwQ29sb3IgPSBudWxsO1xuICAgICAgZm9yIChjb25zdCBzSWQgb2YgYXBwbGllZFN0cmF0ZWdpZXMpIHtcbiAgICAgICAgY29uc3QgY29sb3IgPSBnZXRTdHJhdGVneUNvbG9yKHNJZCk7XG4gICAgICAgIGlmIChjb2xvcikgeyBncm91cENvbG9yID0gY29sb3I7IGJyZWFrOyB9XG4gICAgICB9XG5cbiAgICAgIGlmIChncm91cENvbG9yID09PSAnbWF0Y2gnKSB7XG4gICAgICAgIGdyb3VwQ29sb3IgPSBjb2xvckZvcktleSh2YWx1ZUtleSwgMCk7XG4gICAgICB9IGVsc2UgaWYgKCFncm91cENvbG9yKSB7XG4gICAgICAgIGdyb3VwQ29sb3IgPSBjb2xvckZvcktleShidWNrZXRLZXksIGJ1Y2tldHMuc2l6ZSk7XG4gICAgICB9XG5cbiAgICAgIGdyb3VwID0ge1xuICAgICAgICBpZDogYnVja2V0S2V5LFxuICAgICAgICB3aW5kb3dJZDogdGFiLndpbmRvd0lkLFxuICAgICAgICBsYWJlbDogXCJcIixcbiAgICAgICAgY29sb3I6IGdyb3VwQ29sb3IsXG4gICAgICAgIHRhYnM6IFtdLFxuICAgICAgICByZWFzb246IGFwcGxpZWRTdHJhdGVnaWVzLmpvaW4oXCIgKyBcIiksXG4gICAgICAgIHdpbmRvd01vZGU6IGVmZmVjdGl2ZU1vZGVcbiAgICAgIH07XG4gICAgICBidWNrZXRzLnNldChidWNrZXRLZXksIGdyb3VwKTtcbiAgICB9XG4gICAgZ3JvdXAudGFicy5wdXNoKHRhYik7XG4gIH0pO1xuXG4gIGNvbnN0IGdyb3VwcyA9IEFycmF5LmZyb20oYnVja2V0cy52YWx1ZXMoKSk7XG4gIGdyb3Vwcy5mb3JFYWNoKGdyb3VwID0+IHtcbiAgICBncm91cC5sYWJlbCA9IGdlbmVyYXRlTGFiZWwoZWZmZWN0aXZlU3RyYXRlZ2llcywgZ3JvdXAudGFicywgYWxsVGFic01hcCk7XG4gIH0pO1xuXG4gIHJldHVybiBncm91cHM7XG59O1xuXG5leHBvcnQgY29uc3QgY2hlY2tDb25kaXRpb24gPSAoY29uZGl0aW9uOiBSdWxlQ29uZGl0aW9uLCB0YWI6IFRhYk1ldGFkYXRhKTogYm9vbGVhbiA9PiB7XG4gICAgaWYgKCFjb25kaXRpb24pIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCByYXdWYWx1ZSA9IGdldEZpZWxkVmFsdWUodGFiLCBjb25kaXRpb24uZmllbGQpO1xuICAgIGNvbnN0IHZhbHVlVG9DaGVjayA9IHJhd1ZhbHVlICE9PSB1bmRlZmluZWQgJiYgcmF3VmFsdWUgIT09IG51bGwgPyBTdHJpbmcocmF3VmFsdWUpLnRvTG93ZXJDYXNlKCkgOiBcIlwiO1xuICAgIGNvbnN0IHBhdHRlcm4gPSBjb25kaXRpb24udmFsdWUgPyBjb25kaXRpb24udmFsdWUudG9Mb3dlckNhc2UoKSA6IFwiXCI7XG5cbiAgICBzd2l0Y2ggKGNvbmRpdGlvbi5vcGVyYXRvcikge1xuICAgICAgICBjYXNlICdjb250YWlucyc6IHJldHVybiB2YWx1ZVRvQ2hlY2suaW5jbHVkZXMocGF0dGVybik7XG4gICAgICAgIGNhc2UgJ2RvZXNOb3RDb250YWluJzogcmV0dXJuICF2YWx1ZVRvQ2hlY2suaW5jbHVkZXMocGF0dGVybik7XG4gICAgICAgIGNhc2UgJ2VxdWFscyc6IHJldHVybiB2YWx1ZVRvQ2hlY2sgPT09IHBhdHRlcm47XG4gICAgICAgIGNhc2UgJ3N0YXJ0c1dpdGgnOiByZXR1cm4gdmFsdWVUb0NoZWNrLnN0YXJ0c1dpdGgocGF0dGVybik7XG4gICAgICAgIGNhc2UgJ2VuZHNXaXRoJzogcmV0dXJuIHZhbHVlVG9DaGVjay5lbmRzV2l0aChwYXR0ZXJuKTtcbiAgICAgICAgY2FzZSAnZXhpc3RzJzogcmV0dXJuIHJhd1ZhbHVlICE9PSB1bmRlZmluZWQ7XG4gICAgICAgIGNhc2UgJ2RvZXNOb3RFeGlzdCc6IHJldHVybiByYXdWYWx1ZSA9PT0gdW5kZWZpbmVkO1xuICAgICAgICBjYXNlICdpc051bGwnOiByZXR1cm4gcmF3VmFsdWUgPT09IG51bGw7XG4gICAgICAgIGNhc2UgJ2lzTm90TnVsbCc6IHJldHVybiByYXdWYWx1ZSAhPT0gbnVsbDtcbiAgICAgICAgY2FzZSAnbWF0Y2hlcyc6XG4gICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IFJlZ0V4cChjb25kaXRpb24udmFsdWUsICdpJykudGVzdChyYXdWYWx1ZSAhPT0gdW5kZWZpbmVkICYmIHJhd1ZhbHVlICE9PSBudWxsID8gU3RyaW5nKHJhd1ZhbHVlKSA6IFwiXCIpO1xuICAgICAgICAgICAgIH0gY2F0Y2ggeyByZXR1cm4gZmFsc2U7IH1cbiAgICAgICAgZGVmYXVsdDogcmV0dXJuIGZhbHNlO1xuICAgIH1cbn07XG5cbmZ1bmN0aW9uIGV2YWx1YXRlTGVnYWN5UnVsZXMobGVnYWN5UnVsZXM6IFN0cmF0ZWd5UnVsZVtdLCB0YWI6IFRhYk1ldGFkYXRhKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgLy8gRGVmZW5zaXZlIGNoZWNrXG4gICAgaWYgKCFsZWdhY3lSdWxlcyB8fCAhQXJyYXkuaXNBcnJheShsZWdhY3lSdWxlcykpIHtcbiAgICAgICAgaWYgKCFsZWdhY3lSdWxlcykgcmV0dXJuIG51bGw7XG4gICAgICAgIC8vIFRyeSBhc0FycmF5IGlmIGl0J3Mgbm90IGFycmF5IGJ1dCB0cnV0aHkgKHVubGlrZWx5IGdpdmVuIHByZXZpb3VzIGxvZ2ljIGJ1dCBzYWZlKVxuICAgIH1cblxuICAgIGNvbnN0IGxlZ2FjeVJ1bGVzTGlzdCA9IGFzQXJyYXk8U3RyYXRlZ3lSdWxlPihsZWdhY3lSdWxlcyk7XG4gICAgaWYgKGxlZ2FjeVJ1bGVzTGlzdC5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGxlZ2FjeVJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IHJhd1ZhbHVlID0gZ2V0RmllbGRWYWx1ZSh0YWIsIHJ1bGUuZmllbGQpO1xuICAgICAgICAgICAgbGV0IHZhbHVlVG9DaGVjayA9IHJhd1ZhbHVlICE9PSB1bmRlZmluZWQgJiYgcmF3VmFsdWUgIT09IG51bGwgPyBTdHJpbmcocmF3VmFsdWUpIDogXCJcIjtcbiAgICAgICAgICAgIHZhbHVlVG9DaGVjayA9IHZhbHVlVG9DaGVjay50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgY29uc3QgcGF0dGVybiA9IHJ1bGUudmFsdWUgPyBydWxlLnZhbHVlLnRvTG93ZXJDYXNlKCkgOiBcIlwiO1xuXG4gICAgICAgICAgICBsZXQgaXNNYXRjaCA9IGZhbHNlO1xuICAgICAgICAgICAgbGV0IG1hdGNoT2JqOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsID0gbnVsbDtcblxuICAgICAgICAgICAgc3dpdGNoIChydWxlLm9wZXJhdG9yKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAnY29udGFpbnMnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrLmluY2x1ZGVzKHBhdHRlcm4pOyBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdkb2VzTm90Q29udGFpbic6IGlzTWF0Y2ggPSAhdmFsdWVUb0NoZWNrLmluY2x1ZGVzKHBhdHRlcm4pOyBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdlcXVhbHMnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrID09PSBwYXR0ZXJuOyBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdzdGFydHNXaXRoJzogaXNNYXRjaCA9IHZhbHVlVG9DaGVjay5zdGFydHNXaXRoKHBhdHRlcm4pOyBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdlbmRzV2l0aCc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suZW5kc1dpdGgocGF0dGVybik7IGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2V4aXN0cyc6IGlzTWF0Y2ggPSByYXdWYWx1ZSAhPT0gdW5kZWZpbmVkOyBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdkb2VzTm90RXhpc3QnOiBpc01hdGNoID0gcmF3VmFsdWUgPT09IHVuZGVmaW5lZDsgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnaXNOdWxsJzogaXNNYXRjaCA9IHJhd1ZhbHVlID09PSBudWxsOyBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdpc05vdE51bGwnOiBpc01hdGNoID0gcmF3VmFsdWUgIT09IG51bGw7IGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ21hdGNoZXMnOlxuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKHJ1bGUudmFsdWUsICdpJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBtYXRjaE9iaiA9IHJlZ2V4LmV4ZWMocmF3VmFsdWUgIT09IHVuZGVmaW5lZCAmJiByYXdWYWx1ZSAhPT0gbnVsbCA/IFN0cmluZyhyYXdWYWx1ZSkgOiBcIlwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzTWF0Y2ggPSAhIW1hdGNoT2JqO1xuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7fVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGlzTWF0Y2gpIHtcbiAgICAgICAgICAgICAgICBsZXQgcmVzdWx0ID0gcnVsZS5yZXN1bHQ7XG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoT2JqKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgbWF0Y2hPYmoubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShuZXcgUmVnRXhwKGBcXFxcJCR7aX1gLCAnZycpLCBtYXRjaE9ialtpXSB8fCBcIlwiKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgbG9nRGVidWcoXCJFcnJvciBldmFsdWF0aW5nIGxlZ2FjeSBydWxlc1wiLCB7IGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGNvbnN0IGdldEdyb3VwaW5nUmVzdWx0ID0gKHRhYjogVGFiTWV0YWRhdGEsIHN0cmF0ZWd5OiBHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nKTogeyBrZXk6IHN0cmluZyB8IG51bGwsIG1vZGU6IFwiY3VycmVudFwiIHwgXCJuZXdcIiB8IFwiY29tcG91bmRcIiB9ID0+IHtcbiAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3kpO1xuICBpZiAoY3VzdG9tKSB7XG4gICAgICBjb25zdCBmaWx0ZXJHcm91cHNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uW10+KGN1c3RvbS5maWx0ZXJHcm91cHMpO1xuICAgICAgY29uc3QgZmlsdGVyc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGN1c3RvbS5maWx0ZXJzKTtcblxuICAgICAgbGV0IG1hdGNoID0gZmFsc2U7XG5cbiAgICAgIGlmIChmaWx0ZXJHcm91cHNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAvLyBPUiBsb2dpY1xuICAgICAgICAgIGZvciAoY29uc3QgZ3JvdXAgb2YgZmlsdGVyR3JvdXBzTGlzdCkge1xuICAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihncm91cCk7XG4gICAgICAgICAgICAgIGlmIChncm91cFJ1bGVzLmxlbmd0aCA9PT0gMCB8fCBncm91cFJ1bGVzLmV2ZXJ5KHIgPT4gY2hlY2tDb25kaXRpb24ociwgdGFiKSkpIHtcbiAgICAgICAgICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChmaWx0ZXJzTGlzdC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgLy8gTGVnYWN5L1NpbXBsZSBBTkQgbG9naWNcbiAgICAgICAgICBpZiAoZmlsdGVyc0xpc3QuZXZlcnkoZiA9PiBjaGVja0NvbmRpdGlvbihmLCB0YWIpKSkge1xuICAgICAgICAgICAgICBtYXRjaCA9IHRydWU7XG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBObyBmaWx0ZXJzIC0+IE1hdGNoIGFsbFxuICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFtYXRjaCkge1xuICAgICAgICAgIHJldHVybiB7IGtleTogbnVsbCwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZ3JvdXBpbmdSdWxlc0xpc3QgPSBhc0FycmF5PEdyb3VwaW5nUnVsZT4oY3VzdG9tLmdyb3VwaW5nUnVsZXMpO1xuICAgICAgaWYgKGdyb3VwaW5nUnVsZXNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICBjb25zdCBtb2Rlczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwaW5nUnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICBsZXQgdmFsID0gXCJcIjtcbiAgICAgICAgICAgICAgICBpZiAocnVsZS5zb3VyY2UgPT09ICdmaWVsZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJhdyA9IGdldEZpZWxkVmFsdWUodGFiLCBydWxlLnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHJhdyAhPT0gdW5kZWZpbmVkICYmIHJhdyAhPT0gbnVsbCA/IFN0cmluZyhyYXcpIDogXCJcIjtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgdmFsID0gcnVsZS52YWx1ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodmFsICYmIHJ1bGUudHJhbnNmb3JtICYmIHJ1bGUudHJhbnNmb3JtICE9PSAnbm9uZScpIHtcbiAgICAgICAgICAgICAgICAgICAgc3dpdGNoIChydWxlLnRyYW5zZm9ybSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnc3RyaXBUbGQnOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHN0cmlwVGxkKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdsb3dlcmNhc2UnOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHZhbC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAndXBwZXJjYXNlJzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSB2YWwudG9VcHBlckNhc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ2ZpcnN0Q2hhcic6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gdmFsLmNoYXJBdCgwKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ2RvbWFpbic6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gZG9tYWluRnJvbVVybCh2YWwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnaG9zdG5hbWUnOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBuZXcgVVJMKHZhbCkuaG9zdG5hbWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCB7IC8qIGtlZXAgYXMgaXMgKi8gfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAncmVnZXgnOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChydWxlLnRyYW5zZm9ybVBhdHRlcm4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxldCByZWdleCA9IHJlZ2V4Q2FjaGUuZ2V0KHJ1bGUudHJhbnNmb3JtUGF0dGVybik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXJlZ2V4KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVnZXggPSBuZXcgUmVnRXhwKHJ1bGUudHJhbnNmb3JtUGF0dGVybik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVnZXhDYWNoZS5zZXQocnVsZS50cmFuc2Zvcm1QYXR0ZXJuLCByZWdleCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtYXRjaCA9IHJlZ2V4LmV4ZWModmFsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxldCBleHRyYWN0ZWQgPSBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgbWF0Y2gubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXh0cmFjdGVkICs9IG1hdGNoW2ldIHx8IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IGV4dHJhY3RlZDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbG9nRGVidWcoXCJJbnZhbGlkIHJlZ2V4IGluIHRyYW5zZm9ybVwiLCB7IHBhdHRlcm46IHJ1bGUudHJhbnNmb3JtUGF0dGVybiwgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh2YWwpIHtcbiAgICAgICAgICAgICAgICAgICAgcGFydHMucHVzaCh2YWwpO1xuICAgICAgICAgICAgICAgICAgICBpZiAocnVsZS53aW5kb3dNb2RlKSBtb2Rlcy5wdXNoKHJ1bGUud2luZG93TW9kZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGFwcGx5aW5nIGdyb3VwaW5nIHJ1bGVzXCIsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICByZXR1cm4geyBrZXk6IHBhcnRzLmpvaW4oXCIgLSBcIiksIG1vZGU6IHJlc29sdmVXaW5kb3dNb2RlKG1vZGVzKSB9O1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4geyBrZXk6IGN1c3RvbS5mYWxsYmFjayB8fCBcIk1pc2NcIiwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH0gZWxzZSBpZiAoY3VzdG9tLnJ1bGVzKSB7XG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0gZXZhbHVhdGVMZWdhY3lSdWxlcyhhc0FycmF5PFN0cmF0ZWd5UnVsZT4oY3VzdG9tLnJ1bGVzKSwgdGFiKTtcbiAgICAgICAgICBpZiAocmVzdWx0KSByZXR1cm4geyBrZXk6IHJlc3VsdCwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHsga2V5OiBjdXN0b20uZmFsbGJhY2sgfHwgXCJNaXNjXCIsIG1vZGU6IFwiY3VycmVudFwiIH07XG4gIH1cblxuICAvLyBCdWlsdC1pbiBzdHJhdGVnaWVzXG4gIGxldCBzaW1wbGVLZXk6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBzd2l0Y2ggKHN0cmF0ZWd5KSB7XG4gICAgY2FzZSBcImRvbWFpblwiOlxuICAgIGNhc2UgXCJkb21haW5fZnVsbFwiOlxuICAgICAgc2ltcGxlS2V5ID0gZG9tYWluRnJvbVVybCh0YWIudXJsKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJ0b3BpY1wiOlxuICAgICAgc2ltcGxlS2V5ID0gc2VtYW50aWNCdWNrZXQodGFiLnRpdGxlLCB0YWIudXJsKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJsaW5lYWdlXCI6XG4gICAgICBzaW1wbGVLZXkgPSBuYXZpZ2F0aW9uS2V5KHRhYik7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwiY29udGV4dFwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLmNvbnRleHQgfHwgXCJVbmNhdGVnb3JpemVkXCI7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwicGlubmVkXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIucGlubmVkID8gXCJwaW5uZWRcIiA6IFwidW5waW5uZWRcIjtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJhZ2VcIjpcbiAgICAgIHNpbXBsZUtleSA9IGdldFJlY2VuY3lMYWJlbCh0YWIubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInVybFwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLnVybDtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJ0aXRsZVwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLnRpdGxlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInJlY2VuY3lcIjpcbiAgICAgIHNpbXBsZUtleSA9IFN0cmluZyh0YWIubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcIm5lc3RpbmdcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkID8gXCJjaGlsZFwiIDogXCJyb290XCI7XG4gICAgICBicmVhaztcbiAgICBkZWZhdWx0OlxuICAgICAgICBjb25zdCB2YWwgPSBnZXRGaWVsZFZhbHVlKHRhYiwgc3RyYXRlZ3kpO1xuICAgICAgICBpZiAodmFsICE9PSB1bmRlZmluZWQgJiYgdmFsICE9PSBudWxsKSB7XG4gICAgICAgICAgICBzaW1wbGVLZXkgPSBTdHJpbmcodmFsKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNpbXBsZUtleSA9IFwiVW5rbm93blwiO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICB9XG4gIHJldHVybiB7IGtleTogc2ltcGxlS2V5LCBtb2RlOiBcImN1cnJlbnRcIiB9O1xufTtcblxuZXhwb3J0IGNvbnN0IGdyb3VwaW5nS2V5ID0gKHRhYjogVGFiTWV0YWRhdGEsIHN0cmF0ZWd5OiBHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gICAgcmV0dXJuIGdldEdyb3VwaW5nUmVzdWx0KHRhYiwgc3RyYXRlZ3kpLmtleTtcbn07XG5cbmZ1bmN0aW9uIGlzQ29udGV4dEZpZWxkKGZpZWxkOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICByZXR1cm4gZmllbGQgPT09ICdjb250ZXh0JyB8fCBmaWVsZCA9PT0gJ2dlbnJlJyB8fCBmaWVsZCA9PT0gJ3NpdGVOYW1lJyB8fCBmaWVsZC5zdGFydHNXaXRoKCdjb250ZXh0RGF0YS4nKTtcbn1cblxuZXhwb3J0IGNvbnN0IHJlcXVpcmVzQ29udGV4dEFuYWx5c2lzID0gKHN0cmF0ZWd5SWRzOiAoc3RyaW5nIHwgU29ydGluZ1N0cmF0ZWd5KVtdKTogYm9vbGVhbiA9PiB7XG4gICAgLy8gQ2hlY2sgaWYgXCJjb250ZXh0XCIgc3RyYXRlZ3kgaXMgZXhwbGljaXRseSByZXF1ZXN0ZWRcbiAgICBpZiAoc3RyYXRlZ3lJZHMuaW5jbHVkZXMoXCJjb250ZXh0XCIpKSByZXR1cm4gdHJ1ZTtcblxuICAgIGNvbnN0IHN0cmF0ZWdpZXMgPSBnZXRTdHJhdGVnaWVzKGN1c3RvbVN0cmF0ZWdpZXMpO1xuICAgIC8vIGZpbHRlciBvbmx5IHRob3NlIHRoYXQgbWF0Y2ggdGhlIHJlcXVlc3RlZCBJRHNcbiAgICBjb25zdCBhY3RpdmVEZWZzID0gc3RyYXRlZ2llcy5maWx0ZXIocyA9PiBzdHJhdGVneUlkcy5pbmNsdWRlcyhzLmlkKSk7XG5cbiAgICBmb3IgKGNvbnN0IGRlZiBvZiBhY3RpdmVEZWZzKSB7XG4gICAgICAgIC8vIElmIGl0J3MgYSBidWlsdC1pbiBzdHJhdGVneSB0aGF0IG5lZWRzIGNvbnRleHQgKG9ubHkgJ2NvbnRleHQnIGRvZXMpXG4gICAgICAgIGlmIChkZWYuaWQgPT09ICdjb250ZXh0JykgcmV0dXJuIHRydWU7XG5cbiAgICAgICAgLy8gSWYgaXQgaXMgYSBjdXN0b20gc3RyYXRlZ3kgKG9yIG92ZXJyaWRlcyBidWlsdC1pbiksIGNoZWNrIGl0cyBydWxlc1xuICAgICAgICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQoYyA9PiBjLmlkID09PSBkZWYuaWQpO1xuICAgICAgICBpZiAoY3VzdG9tKSB7XG4gICAgICAgICAgICAgY29uc3QgZ3JvdXBSdWxlc0xpc3QgPSBhc0FycmF5PEdyb3VwaW5nUnVsZT4oY3VzdG9tLmdyb3VwaW5nUnVsZXMpO1xuICAgICAgICAgICAgIGNvbnN0IHNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihjdXN0b20uc29ydGluZ1J1bGVzKTtcbiAgICAgICAgICAgICBjb25zdCBncm91cFNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihjdXN0b20uZ3JvdXBTb3J0aW5nUnVsZXMpO1xuICAgICAgICAgICAgIGNvbnN0IGZpbHRlcnNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihjdXN0b20uZmlsdGVycyk7XG4gICAgICAgICAgICAgY29uc3QgZmlsdGVyR3JvdXBzTGlzdCA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbltdPihjdXN0b20uZmlsdGVyR3JvdXBzKTtcblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBydWxlLnNvdXJjZSA9PT0gJ2ZpZWxkJyAmJiBpc0NvbnRleHRGaWVsZChydWxlLnZhbHVlKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIHNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBmaWx0ZXJzTGlzdCkge1xuICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBpc0NvbnRleHRGaWVsZChydWxlLmZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBncm91cCBvZiBmaWx0ZXJHcm91cHNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGNvbnN0IGdyb3VwUnVsZXMgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGdyb3VwKTtcbiAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwUnVsZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59O1xuIiwgImltcG9ydCB7IFNvcnRpbmdTdHJhdGVneSwgVGFiTWV0YWRhdGEsIEN1c3RvbVN0cmF0ZWd5LCBTb3J0aW5nUnVsZSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGRvbWFpbkZyb21VcmwsIHNlbWFudGljQnVja2V0LCBuYXZpZ2F0aW9uS2V5LCBncm91cGluZ0tleSwgZ2V0RmllbGRWYWx1ZSwgZ2V0Q3VzdG9tU3RyYXRlZ2llcyB9IGZyb20gXCIuL2dyb3VwaW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcblxuZXhwb3J0IGNvbnN0IHJlY2VuY3lTY29yZSA9ICh0YWI6IFRhYk1ldGFkYXRhKSA9PiB0YWIubGFzdEFjY2Vzc2VkID8/IDA7XG5leHBvcnQgY29uc3QgaGllcmFyY2h5U2NvcmUgPSAodGFiOiBUYWJNZXRhZGF0YSkgPT4gKHRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkID8gMSA6IDApO1xuZXhwb3J0IGNvbnN0IHBpbm5lZFNjb3JlID0gKHRhYjogVGFiTWV0YWRhdGEpID0+ICh0YWIucGlubmVkID8gMCA6IDEpO1xuXG5leHBvcnQgY29uc3Qgc29ydFRhYnMgPSAodGFiczogVGFiTWV0YWRhdGFbXSwgc3RyYXRlZ2llczogU29ydGluZ1N0cmF0ZWd5W10pOiBUYWJNZXRhZGF0YVtdID0+IHtcbiAgY29uc3Qgc2NvcmluZzogU29ydGluZ1N0cmF0ZWd5W10gPSBzdHJhdGVnaWVzLmxlbmd0aCA/IHN0cmF0ZWdpZXMgOiBbXCJwaW5uZWRcIiwgXCJyZWNlbmN5XCJdO1xuICByZXR1cm4gWy4uLnRhYnNdLnNvcnQoKGEsIGIpID0+IHtcbiAgICBmb3IgKGNvbnN0IHN0cmF0ZWd5IG9mIHNjb3JpbmcpIHtcbiAgICAgIGNvbnN0IGRpZmYgPSBjb21wYXJlQnkoc3RyYXRlZ3ksIGEsIGIpO1xuICAgICAgaWYgKGRpZmYgIT09IDApIHJldHVybiBkaWZmO1xuICAgIH1cbiAgICByZXR1cm4gYS5pZCAtIGIuaWQ7XG4gIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IGNvbXBhcmVCeSA9IChzdHJhdGVneTogU29ydGluZ1N0cmF0ZWd5IHwgc3RyaW5nLCBhOiBUYWJNZXRhZGF0YSwgYjogVGFiTWV0YWRhdGEpOiBudW1iZXIgPT4ge1xuICAvLyAxLiBDaGVjayBDdXN0b20gU3RyYXRlZ2llcyBmb3IgU29ydGluZyBSdWxlc1xuICBjb25zdCBjdXN0b21TdHJhdHMgPSBnZXRDdXN0b21TdHJhdGVnaWVzKCk7XG4gIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0cy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3kpO1xuICBpZiAoY3VzdG9tKSB7XG4gICAgICBjb25zdCBzb3J0UnVsZXNMaXN0ID0gYXNBcnJheTxTb3J0aW5nUnVsZT4oY3VzdG9tLnNvcnRpbmdSdWxlcyk7XG4gICAgICBpZiAoc29ydFJ1bGVzTGlzdC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgLy8gRXZhbHVhdGUgY3VzdG9tIHNvcnRpbmcgcnVsZXMgaW4gb3JkZXJcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2Ygc29ydFJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IHZhbEEgPSBnZXRGaWVsZFZhbHVlKGEsIHJ1bGUuZmllbGQpO1xuICAgICAgICAgICAgICAgICAgY29uc3QgdmFsQiA9IGdldEZpZWxkVmFsdWUoYiwgcnVsZS5maWVsZCk7XG5cbiAgICAgICAgICAgICAgICAgIGxldCByZXN1bHQgPSAwO1xuICAgICAgICAgICAgICAgICAgaWYgKHZhbEEgPCB2YWxCKSByZXN1bHQgPSAtMTtcbiAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKHZhbEEgPiB2YWxCKSByZXN1bHQgPSAxO1xuXG4gICAgICAgICAgICAgICAgICBpZiAocmVzdWx0ICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJ1bGUub3JkZXIgPT09ICdkZXNjJyA/IC1yZXN1bHQgOiByZXN1bHQ7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgIGxvZ0RlYnVnKFwiRXJyb3IgZXZhbHVhdGluZyBjdXN0b20gc29ydGluZyBydWxlc1wiLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIElmIGFsbCBydWxlcyBlcXVhbCwgY29udGludWUgdG8gbmV4dCBzdHJhdGVneSAocmV0dXJuIDApXG4gICAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9XG4gIH1cblxuICAvLyAyLiBCdWlsdC1pbiBvciBmYWxsYmFja1xuICBzd2l0Y2ggKHN0cmF0ZWd5KSB7XG4gICAgY2FzZSBcInJlY2VuY3lcIjpcbiAgICAgIHJldHVybiAoYi5sYXN0QWNjZXNzZWQgPz8gMCkgLSAoYS5sYXN0QWNjZXNzZWQgPz8gMCk7XG4gICAgY2FzZSBcIm5lc3RpbmdcIjogLy8gRm9ybWVybHkgaGllcmFyY2h5XG4gICAgICByZXR1cm4gaGllcmFyY2h5U2NvcmUoYSkgLSBoaWVyYXJjaHlTY29yZShiKTtcbiAgICBjYXNlIFwicGlubmVkXCI6XG4gICAgICByZXR1cm4gcGlubmVkU2NvcmUoYSkgLSBwaW5uZWRTY29yZShiKTtcbiAgICBjYXNlIFwidGl0bGVcIjpcbiAgICAgIHJldHVybiBhLnRpdGxlLmxvY2FsZUNvbXBhcmUoYi50aXRsZSk7XG4gICAgY2FzZSBcInVybFwiOlxuICAgICAgcmV0dXJuIGEudXJsLmxvY2FsZUNvbXBhcmUoYi51cmwpO1xuICAgIGNhc2UgXCJjb250ZXh0XCI6XG4gICAgICByZXR1cm4gKGEuY29udGV4dCA/PyBcIlwiKS5sb2NhbGVDb21wYXJlKGIuY29udGV4dCA/PyBcIlwiKTtcbiAgICBjYXNlIFwiZG9tYWluXCI6XG4gICAgY2FzZSBcImRvbWFpbl9mdWxsXCI6XG4gICAgICByZXR1cm4gZG9tYWluRnJvbVVybChhLnVybCkubG9jYWxlQ29tcGFyZShkb21haW5Gcm9tVXJsKGIudXJsKSk7XG4gICAgY2FzZSBcInRvcGljXCI6XG4gICAgICByZXR1cm4gc2VtYW50aWNCdWNrZXQoYS50aXRsZSwgYS51cmwpLmxvY2FsZUNvbXBhcmUoc2VtYW50aWNCdWNrZXQoYi50aXRsZSwgYi51cmwpKTtcbiAgICBjYXNlIFwibGluZWFnZVwiOlxuICAgICAgcmV0dXJuIG5hdmlnYXRpb25LZXkoYSkubG9jYWxlQ29tcGFyZShuYXZpZ2F0aW9uS2V5KGIpKTtcbiAgICBjYXNlIFwiYWdlXCI6XG4gICAgICAvLyBSZXZlcnNlIGFscGhhYmV0aWNhbCBmb3IgYWdlIGJ1Y2tldHMgKFRvZGF5IDwgWWVzdGVyZGF5KSwgcm91Z2ggYXBwcm94XG4gICAgICByZXR1cm4gKGdyb3VwaW5nS2V5KGEsIFwiYWdlXCIpIHx8IFwiXCIpLmxvY2FsZUNvbXBhcmUoZ3JvdXBpbmdLZXkoYiwgXCJhZ2VcIikgfHwgXCJcIik7XG4gICAgZGVmYXVsdDpcbiAgICAgIC8vIENoZWNrIGlmIGl0J3MgYSBnZW5lcmljIGZpZWxkIGZpcnN0XG4gICAgICBjb25zdCB2YWxBID0gZ2V0RmllbGRWYWx1ZShhLCBzdHJhdGVneSk7XG4gICAgICBjb25zdCB2YWxCID0gZ2V0RmllbGRWYWx1ZShiLCBzdHJhdGVneSk7XG5cbiAgICAgIGlmICh2YWxBICE9PSB1bmRlZmluZWQgJiYgdmFsQiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgaWYgKHZhbEEgPCB2YWxCKSByZXR1cm4gLTE7XG4gICAgICAgICAgaWYgKHZhbEEgPiB2YWxCKSByZXR1cm4gMTtcbiAgICAgICAgICByZXR1cm4gMDtcbiAgICAgIH1cblxuICAgICAgLy8gRmFsbGJhY2sgZm9yIGN1c3RvbSBzdHJhdGVnaWVzIGdyb3VwaW5nIGtleSAoaWYgdXNpbmcgY3VzdG9tIHN0cmF0ZWd5IGFzIHNvcnRpbmcgYnV0IG5vIHNvcnRpbmcgcnVsZXMgZGVmaW5lZClcbiAgICAgIC8vIG9yIHVuaGFuZGxlZCBidWlsdC1pbnNcbiAgICAgIHJldHVybiAoZ3JvdXBpbmdLZXkoYSwgc3RyYXRlZ3kpIHx8IFwiXCIpLmxvY2FsZUNvbXBhcmUoZ3JvdXBpbmdLZXkoYiwgc3RyYXRlZ3kpIHx8IFwiXCIpO1xuICB9XG59O1xuIiwgIi8vIGxvZ2ljLnRzXG4vLyBQdXJlIGZ1bmN0aW9ucyBmb3IgZXh0cmFjdGlvbiBsb2dpY1xuXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplVXJsKHVybFN0cjogc3RyaW5nKTogc3RyaW5nIHtcbiAgdHJ5IHtcbiAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHVybFN0cik7XG4gICAgY29uc3QgcGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcyh1cmwuc2VhcmNoKTtcbiAgICBjb25zdCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuICAgIHBhcmFtcy5mb3JFYWNoKChfLCBrZXkpID0+IGtleXMucHVzaChrZXkpKTtcbiAgICBjb25zdCBob3N0bmFtZSA9IHVybC5ob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgJycpO1xuXG4gICAgY29uc3QgVFJBQ0tJTkcgPSBbL151dG1fLywgL15mYmNsaWQkLywgL15nY2xpZCQvLCAvXl9nYSQvLCAvXnJlZiQvLCAvXnljbGlkJC8sIC9eX2hzL107XG4gICAgY29uc3QgaXNZb3V0dWJlID0gaG9zdG5hbWUuZW5kc1dpdGgoJ3lvdXR1YmUuY29tJykgfHwgaG9zdG5hbWUuZW5kc1dpdGgoJ3lvdXR1LmJlJyk7XG4gICAgY29uc3QgaXNHb29nbGUgPSBob3N0bmFtZS5lbmRzV2l0aCgnZ29vZ2xlLmNvbScpO1xuXG4gICAgY29uc3Qga2VlcDogc3RyaW5nW10gPSBbXTtcbiAgICBpZiAoaXNZb3V0dWJlKSBrZWVwLnB1c2goJ3YnLCAnbGlzdCcsICd0JywgJ2MnLCAnY2hhbm5lbCcsICdwbGF5bGlzdCcpO1xuICAgIGlmIChpc0dvb2dsZSkga2VlcC5wdXNoKCdxJywgJ2lkJywgJ3NvdXJjZWlkJyk7XG5cbiAgICBmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG4gICAgICBpZiAoVFJBQ0tJTkcuc29tZShyID0+IHIudGVzdChrZXkpKSkge1xuICAgICAgICAgcGFyYW1zLmRlbGV0ZShrZXkpO1xuICAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAoKGlzWW91dHViZSB8fCBpc0dvb2dsZSkgJiYgIWtlZXAuaW5jbHVkZXMoa2V5KSkge1xuICAgICAgICAgcGFyYW1zLmRlbGV0ZShrZXkpO1xuICAgICAgfVxuICAgIH1cbiAgICB1cmwuc2VhcmNoID0gcGFyYW1zLnRvU3RyaW5nKCk7XG4gICAgcmV0dXJuIHVybC50b1N0cmluZygpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgcmV0dXJuIHVybFN0cjtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VZb3VUdWJlVXJsKHVybFN0cjogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgdXJsID0gbmV3IFVSTCh1cmxTdHIpO1xuICAgICAgICBjb25zdCB2ID0gdXJsLnNlYXJjaFBhcmFtcy5nZXQoJ3YnKTtcbiAgICAgICAgY29uc3QgaXNTaG9ydHMgPSB1cmwucGF0aG5hbWUuaW5jbHVkZXMoJy9zaG9ydHMvJyk7XG4gICAgICAgIGxldCB2aWRlb0lkID1cbiAgICAgICAgICB2IHx8XG4gICAgICAgICAgKGlzU2hvcnRzID8gdXJsLnBhdGhuYW1lLnNwbGl0KCcvc2hvcnRzLycpWzFdIDogbnVsbCkgfHxcbiAgICAgICAgICAodXJsLmhvc3RuYW1lID09PSAneW91dHUuYmUnID8gdXJsLnBhdGhuYW1lLnJlcGxhY2UoJy8nLCAnJykgOiBudWxsKTtcblxuICAgICAgICBjb25zdCBwbGF5bGlzdElkID0gdXJsLnNlYXJjaFBhcmFtcy5nZXQoJ2xpc3QnKTtcbiAgICAgICAgY29uc3QgcGxheWxpc3RJbmRleCA9IHBhcnNlSW50KHVybC5zZWFyY2hQYXJhbXMuZ2V0KCdpbmRleCcpIHx8ICcwJywgMTApO1xuXG4gICAgICAgIHJldHVybiB7IHZpZGVvSWQsIGlzU2hvcnRzLCBwbGF5bGlzdElkLCBwbGF5bGlzdEluZGV4IH07XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICByZXR1cm4geyB2aWRlb0lkOiBudWxsLCBpc1Nob3J0czogZmFsc2UsIHBsYXlsaXN0SWQ6IG51bGwsIHBsYXlsaXN0SW5kZXg6IG51bGwgfTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0SnNvbkxkRmllbGRzKGpzb25MZDogYW55W10pIHtcbiAgICBsZXQgYXV0aG9yOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICBsZXQgcHVibGlzaGVkQXQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgIGxldCBtb2RpZmllZEF0OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICBsZXQgdGFnczogc3RyaW5nW10gPSBbXTtcbiAgICBsZXQgYnJlYWRjcnVtYnM6IHN0cmluZ1tdID0gW107XG5cbiAgICAvLyBGaW5kIG1haW4gZW50aXR5XG4gICAgLy8gQWRkZWQgc2FmZXR5IGNoZWNrOiBpICYmIGlbJ0B0eXBlJ11cbiAgICBjb25zdCBtYWluRW50aXR5ID0ganNvbkxkLmZpbmQoaSA9PiBpICYmIChpWydAdHlwZSddID09PSAnQXJ0aWNsZScgfHwgaVsnQHR5cGUnXSA9PT0gJ1ZpZGVvT2JqZWN0JyB8fCBpWydAdHlwZSddID09PSAnTmV3c0FydGljbGUnKSkgfHwganNvbkxkWzBdO1xuXG4gICAgaWYgKG1haW5FbnRpdHkpIHtcbiAgICAgICBpZiAobWFpbkVudGl0eS5hdXRob3IpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIG1haW5FbnRpdHkuYXV0aG9yID09PSAnc3RyaW5nJykgYXV0aG9yID0gbWFpbkVudGl0eS5hdXRob3I7XG4gICAgICAgICAgZWxzZSBpZiAobWFpbkVudGl0eS5hdXRob3IubmFtZSkgYXV0aG9yID0gbWFpbkVudGl0eS5hdXRob3IubmFtZTtcbiAgICAgICAgICBlbHNlIGlmIChBcnJheS5pc0FycmF5KG1haW5FbnRpdHkuYXV0aG9yKSAmJiBtYWluRW50aXR5LmF1dGhvclswXT8ubmFtZSkgYXV0aG9yID0gbWFpbkVudGl0eS5hdXRob3JbMF0ubmFtZTtcbiAgICAgICB9XG4gICAgICAgaWYgKG1haW5FbnRpdHkuZGF0ZVB1Ymxpc2hlZCkgcHVibGlzaGVkQXQgPSBtYWluRW50aXR5LmRhdGVQdWJsaXNoZWQ7XG4gICAgICAgaWYgKG1haW5FbnRpdHkuZGF0ZU1vZGlmaWVkKSBtb2RpZmllZEF0ID0gbWFpbkVudGl0eS5kYXRlTW9kaWZpZWQ7XG4gICAgICAgaWYgKG1haW5FbnRpdHkua2V5d29yZHMpIHtcbiAgICAgICAgIGlmICh0eXBlb2YgbWFpbkVudGl0eS5rZXl3b3JkcyA9PT0gJ3N0cmluZycpIHRhZ3MgPSBtYWluRW50aXR5LmtleXdvcmRzLnNwbGl0KCcsJykubWFwKChzOiBzdHJpbmcpID0+IHMudHJpbSgpKTtcbiAgICAgICAgIGVsc2UgaWYgKEFycmF5LmlzQXJyYXkobWFpbkVudGl0eS5rZXl3b3JkcykpIHRhZ3MgPSBtYWluRW50aXR5LmtleXdvcmRzO1xuICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBBZGRlZCBzYWZldHkgY2hlY2s6IGkgJiYgaVsnQHR5cGUnXVxuICAgIGNvbnN0IGJyZWFkY3J1bWJMZCA9IGpzb25MZC5maW5kKGkgPT4gaSAmJiBpWydAdHlwZSddID09PSAnQnJlYWRjcnVtYkxpc3QnKTtcbiAgICBpZiAoYnJlYWRjcnVtYkxkICYmIEFycmF5LmlzQXJyYXkoYnJlYWRjcnVtYkxkLml0ZW1MaXN0RWxlbWVudCkpIHtcbiAgICAgICBjb25zdCBsaXN0ID0gYnJlYWRjcnVtYkxkLml0ZW1MaXN0RWxlbWVudC5zb3J0KChhOiBhbnksIGI6IGFueSkgPT4gYS5wb3NpdGlvbiAtIGIucG9zaXRpb24pO1xuICAgICAgIGxpc3QuZm9yRWFjaCgoaXRlbTogYW55KSA9PiB7XG4gICAgICAgICBpZiAoaXRlbS5uYW1lKSBicmVhZGNydW1icy5wdXNoKGl0ZW0ubmFtZSk7XG4gICAgICAgICBlbHNlIGlmIChpdGVtLml0ZW0gJiYgaXRlbS5pdGVtLm5hbWUpIGJyZWFkY3J1bWJzLnB1c2goaXRlbS5pdGVtLm5hbWUpO1xuICAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiB7IGF1dGhvciwgcHVibGlzaGVkQXQsIG1vZGlmaWVkQXQsIHRhZ3MsIGJyZWFkY3J1bWJzIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0WW91VHViZUNoYW5uZWxGcm9tSHRtbChodG1sOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcbiAgLy8gMS4gVHJ5IEpTT04tTERcbiAgLy8gTG9vayBmb3IgPHNjcmlwdCB0eXBlPVwiYXBwbGljYXRpb24vbGQranNvblwiPi4uLjwvc2NyaXB0PlxuICAvLyBXZSBuZWVkIHRvIGxvb3AgYmVjYXVzZSB0aGVyZSBtaWdodCBiZSBtdWx0aXBsZSBzY3JpcHRzXG4gIGNvbnN0IHNjcmlwdFJlZ2V4ID0gLzxzY3JpcHRcXHMrdHlwZT1bXCInXWFwcGxpY2F0aW9uXFwvbGRcXCtqc29uW1wiJ11bXj5dKj4oW1xcc1xcU10qPyk8XFwvc2NyaXB0Pi9naTtcbiAgbGV0IG1hdGNoO1xuICB3aGlsZSAoKG1hdGNoID0gc2NyaXB0UmVnZXguZXhlYyhodG1sKSkgIT09IG51bGwpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QganNvbiA9IEpTT04ucGFyc2UobWF0Y2hbMV0pO1xuICAgICAgICAgIGNvbnN0IGFycmF5ID0gQXJyYXkuaXNBcnJheShqc29uKSA/IGpzb24gOiBbanNvbl07XG4gICAgICAgICAgY29uc3QgZmllbGRzID0gZXh0cmFjdEpzb25MZEZpZWxkcyhhcnJheSk7XG4gICAgICAgICAgaWYgKGZpZWxkcy5hdXRob3IpIHJldHVybiBmaWVsZHMuYXV0aG9yO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIC8vIGlnbm9yZSBwYXJzZSBlcnJvcnNcbiAgICAgIH1cbiAgfVxuXG4gIC8vIDIuIFRyeSA8bGluayBpdGVtcHJvcD1cIm5hbWVcIiBjb250ZW50PVwiLi4uXCI+IChZb3VUdWJlIG9mdGVuIHB1dHMgY2hhbm5lbCBuYW1lIGhlcmUgaW4gc29tZSBjb250ZXh0cylcbiAgLy8gT3IgPG1ldGEgaXRlbXByb3A9XCJjaGFubmVsSWRcIiBjb250ZW50PVwiLi4uXCI+IC0+IGJ1dCB0aGF0J3MgSUQuXG4gIC8vIDxsaW5rIGl0ZW1wcm9wPVwibmFtZVwiIGNvbnRlbnQ9XCJDaGFubmVsIE5hbWVcIj5cbiAgLy8gPHNwYW4gaXRlbXByb3A9XCJhdXRob3JcIiBpdGVtc2NvcGUgaXRlbXR5cGU9XCJodHRwOi8vc2NoZW1hLm9yZy9QZXJzb25cIj48bGluayBpdGVtcHJvcD1cIm5hbWVcIiBjb250ZW50PVwiQ2hhbm5lbCBOYW1lXCI+PC9zcGFuPlxuICBjb25zdCBsaW5rTmFtZVJlZ2V4ID0gLzxsaW5rXFxzK2l0ZW1wcm9wPVtcIiddbmFtZVtcIiddXFxzK2NvbnRlbnQ9W1wiJ10oW15cIiddKylbXCInXVxccypcXC8/Pi9pO1xuICBjb25zdCBsaW5rTWF0Y2ggPSBsaW5rTmFtZVJlZ2V4LmV4ZWMoaHRtbCk7XG4gIGlmIChsaW5rTWF0Y2ggJiYgbGlua01hdGNoWzFdKSByZXR1cm4gZGVjb2RlSHRtbEVudGl0aWVzKGxpbmtNYXRjaFsxXSk7XG5cbiAgLy8gMy4gVHJ5IG1ldGEgYXV0aG9yXG4gIGNvbnN0IG1ldGFBdXRob3JSZWdleCA9IC88bWV0YVxccytuYW1lPVtcIiddYXV0aG9yW1wiJ11cXHMrY29udGVudD1bXCInXShbXlwiJ10rKVtcIiddXFxzKlxcLz8+L2k7XG4gIGNvbnN0IG1ldGFNYXRjaCA9IG1ldGFBdXRob3JSZWdleC5leGVjKGh0bWwpO1xuICBpZiAobWV0YU1hdGNoICYmIG1ldGFNYXRjaFsxXSkge1xuICAgICAgLy8gWW91VHViZSBtZXRhIGF1dGhvciBpcyBvZnRlbiBcIkNoYW5uZWwgTmFtZVwiXG4gICAgICByZXR1cm4gZGVjb2RlSHRtbEVudGl0aWVzKG1ldGFNYXRjaFsxXSk7XG4gIH1cblxuICByZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RZb3VUdWJlR2VucmVGcm9tSHRtbChodG1sOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcbiAgLy8gMS4gVHJ5IDxtZXRhIGl0ZW1wcm9wPVwiZ2VucmVcIiBjb250ZW50PVwiLi4uXCI+XG4gIGNvbnN0IG1ldGFHZW5yZVJlZ2V4ID0gLzxtZXRhXFxzK2l0ZW1wcm9wPVtcIiddZ2VucmVbXCInXVxccytjb250ZW50PVtcIiddKFteXCInXSspW1wiJ11cXHMqXFwvPz4vaTtcbiAgY29uc3QgbWV0YU1hdGNoID0gbWV0YUdlbnJlUmVnZXguZXhlYyhodG1sKTtcbiAgaWYgKG1ldGFNYXRjaCAmJiBtZXRhTWF0Y2hbMV0pIHtcbiAgICAgIHJldHVybiBkZWNvZGVIdG1sRW50aXRpZXMobWV0YU1hdGNoWzFdKTtcbiAgfVxuXG4gIC8vIDIuIFRyeSBKU09OIFwiY2F0ZWdvcnlcIiBpbiBzY3JpcHRzXG4gIC8vIFwiY2F0ZWdvcnlcIjpcIkdhbWluZ1wiXG4gIGNvbnN0IGNhdGVnb3J5UmVnZXggPSAvXCJjYXRlZ29yeVwiXFxzKjpcXHMqXCIoW15cIl0rKVwiLztcbiAgY29uc3QgY2F0TWF0Y2ggPSBjYXRlZ29yeVJlZ2V4LmV4ZWMoaHRtbCk7XG4gIGlmIChjYXRNYXRjaCAmJiBjYXRNYXRjaFsxXSkge1xuICAgICAgcmV0dXJuIGRlY29kZUh0bWxFbnRpdGllcyhjYXRNYXRjaFsxXSk7XG4gIH1cblxuICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gZGVjb2RlSHRtbEVudGl0aWVzKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGlmICghdGV4dCkgcmV0dXJuIHRleHQ7XG5cbiAgY29uc3QgZW50aXRpZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgJyZhbXA7JzogJyYnLFxuICAgICcmbHQ7JzogJzwnLFxuICAgICcmZ3Q7JzogJz4nLFxuICAgICcmcXVvdDsnOiAnXCInLFxuICAgICcmIzM5Oyc6IFwiJ1wiLFxuICAgICcmYXBvczsnOiBcIidcIixcbiAgICAnJm5ic3A7JzogJyAnXG4gIH07XG5cbiAgcmV0dXJuIHRleHQucmVwbGFjZSgvJihbYS16MC05XSt8I1swLTldezEsNn18I3hbMC05YS1mQS1GXXsxLDZ9KTsvaWcsIChtYXRjaCkgPT4ge1xuICAgICAgY29uc3QgbG93ZXIgPSBtYXRjaC50b0xvd2VyQ2FzZSgpO1xuICAgICAgaWYgKGVudGl0aWVzW2xvd2VyXSkgcmV0dXJuIGVudGl0aWVzW2xvd2VyXTtcbiAgICAgIGlmIChlbnRpdGllc1ttYXRjaF0pIHJldHVybiBlbnRpdGllc1ttYXRjaF07XG5cbiAgICAgIGlmIChsb3dlci5zdGFydHNXaXRoKCcmI3gnKSkge1xuICAgICAgICAgIHRyeSB7IHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlKHBhcnNlSW50KGxvd2VyLnNsaWNlKDMsIC0xKSwgMTYpKTsgfSBjYXRjaCB7IHJldHVybiBtYXRjaDsgfVxuICAgICAgfVxuICAgICAgaWYgKGxvd2VyLnN0YXJ0c1dpdGgoJyYjJykpIHtcbiAgICAgICAgICB0cnkgeyByZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZShwYXJzZUludChsb3dlci5zbGljZSgyLCAtMSksIDEwKSk7IH0gY2F0Y2ggeyByZXR1cm4gbWF0Y2g7IH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBtYXRjaDtcbiAgfSk7XG59XG4iLCAiXG5leHBvcnQgY29uc3QgR0VORVJBX1JFR0lTVFJZOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAvLyBTZWFyY2hcbiAgJ2dvb2dsZS5jb20nOiAnU2VhcmNoJyxcbiAgJ2JpbmcuY29tJzogJ1NlYXJjaCcsXG4gICdkdWNrZHVja2dvLmNvbSc6ICdTZWFyY2gnLFxuICAneWFob28uY29tJzogJ1NlYXJjaCcsXG4gICdiYWlkdS5jb20nOiAnU2VhcmNoJyxcbiAgJ3lhbmRleC5jb20nOiAnU2VhcmNoJyxcbiAgJ2thZ2kuY29tJzogJ1NlYXJjaCcsXG4gICdlY29zaWEub3JnJzogJ1NlYXJjaCcsXG5cbiAgLy8gU29jaWFsXG4gICdmYWNlYm9vay5jb20nOiAnU29jaWFsJyxcbiAgJ3R3aXR0ZXIuY29tJzogJ1NvY2lhbCcsXG4gICd4LmNvbSc6ICdTb2NpYWwnLFxuICAnaW5zdGFncmFtLmNvbSc6ICdTb2NpYWwnLFxuICAnbGlua2VkaW4uY29tJzogJ1NvY2lhbCcsXG4gICdyZWRkaXQuY29tJzogJ1NvY2lhbCcsXG4gICd0aWt0b2suY29tJzogJ1NvY2lhbCcsXG4gICdwaW50ZXJlc3QuY29tJzogJ1NvY2lhbCcsXG4gICdzbmFwY2hhdC5jb20nOiAnU29jaWFsJyxcbiAgJ3R1bWJsci5jb20nOiAnU29jaWFsJyxcbiAgJ3RocmVhZHMubmV0JzogJ1NvY2lhbCcsXG4gICdibHVlc2t5LmFwcCc6ICdTb2NpYWwnLFxuICAnbWFzdG9kb24uc29jaWFsJzogJ1NvY2lhbCcsXG5cbiAgLy8gVmlkZW9cbiAgJ3lvdXR1YmUuY29tJzogJ1ZpZGVvJyxcbiAgJ3lvdXR1LmJlJzogJ1ZpZGVvJyxcbiAgJ3ZpbWVvLmNvbSc6ICdWaWRlbycsXG4gICd0d2l0Y2gudHYnOiAnVmlkZW8nLFxuICAnbmV0ZmxpeC5jb20nOiAnVmlkZW8nLFxuICAnaHVsdS5jb20nOiAnVmlkZW8nLFxuICAnZGlzbmV5cGx1cy5jb20nOiAnVmlkZW8nLFxuICAnZGFpbHltb3Rpb24uY29tJzogJ1ZpZGVvJyxcbiAgJ3ByaW1ldmlkZW8uY29tJzogJ1ZpZGVvJyxcbiAgJ2hib21heC5jb20nOiAnVmlkZW8nLFxuICAnbWF4LmNvbSc6ICdWaWRlbycsXG4gICdwZWFjb2NrdHYuY29tJzogJ1ZpZGVvJyxcblxuICAvLyBEZXZlbG9wbWVudFxuICAnZ2l0aHViLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdnaXRsYWIuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ3N0YWNrb3ZlcmZsb3cuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ25wbWpzLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdweXBpLm9yZyc6ICdEZXZlbG9wbWVudCcsXG4gICdkZXZlbG9wZXIubW96aWxsYS5vcmcnOiAnRGV2ZWxvcG1lbnQnLFxuICAndzNzY2hvb2xzLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdnZWVrc2ZvcmdlZWtzLm9yZyc6ICdEZXZlbG9wbWVudCcsXG4gICdqaXJhLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdhdGxhc3NpYW4ubmV0JzogJ0RldmVsb3BtZW50JywgLy8gb2Z0ZW4gamlyYVxuICAnYml0YnVja2V0Lm9yZyc6ICdEZXZlbG9wbWVudCcsXG4gICdkZXYudG8nOiAnRGV2ZWxvcG1lbnQnLFxuICAnaGFzaG5vZGUuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ21lZGl1bS5jb20nOiAnRGV2ZWxvcG1lbnQnLCAvLyBHZW5lcmFsIGJ1dCBvZnRlbiBkZXZcbiAgJ3ZlcmNlbC5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnbmV0bGlmeS5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnaGVyb2t1LmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdhd3MuYW1hem9uLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdjb25zb2xlLmF3cy5hbWF6b24uY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2Nsb3VkLmdvb2dsZS5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnYXp1cmUubWljcm9zb2Z0LmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdwb3J0YWwuYXp1cmUuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2RvY2tlci5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAna3ViZXJuZXRlcy5pbyc6ICdEZXZlbG9wbWVudCcsXG5cbiAgLy8gTmV3c1xuICAnY25uLmNvbSc6ICdOZXdzJyxcbiAgJ2JiYy5jb20nOiAnTmV3cycsXG4gICdueXRpbWVzLmNvbSc6ICdOZXdzJyxcbiAgJ3dhc2hpbmd0b25wb3N0LmNvbSc6ICdOZXdzJyxcbiAgJ3RoZWd1YXJkaWFuLmNvbSc6ICdOZXdzJyxcbiAgJ2ZvcmJlcy5jb20nOiAnTmV3cycsXG4gICdibG9vbWJlcmcuY29tJzogJ05ld3MnLFxuICAncmV1dGVycy5jb20nOiAnTmV3cycsXG4gICd3c2ouY29tJzogJ05ld3MnLFxuICAnY25iYy5jb20nOiAnTmV3cycsXG4gICdodWZmcG9zdC5jb20nOiAnTmV3cycsXG4gICduZXdzLmdvb2dsZS5jb20nOiAnTmV3cycsXG4gICdmb3huZXdzLmNvbSc6ICdOZXdzJyxcbiAgJ25iY25ld3MuY29tJzogJ05ld3MnLFxuICAnYWJjbmV3cy5nby5jb20nOiAnTmV3cycsXG4gICd1c2F0b2RheS5jb20nOiAnTmV3cycsXG5cbiAgLy8gU2hvcHBpbmdcbiAgJ2FtYXpvbi5jb20nOiAnU2hvcHBpbmcnLFxuICAnZWJheS5jb20nOiAnU2hvcHBpbmcnLFxuICAnd2FsbWFydC5jb20nOiAnU2hvcHBpbmcnLFxuICAnZXRzeS5jb20nOiAnU2hvcHBpbmcnLFxuICAndGFyZ2V0LmNvbSc6ICdTaG9wcGluZycsXG4gICdiZXN0YnV5LmNvbSc6ICdTaG9wcGluZycsXG4gICdhbGlleHByZXNzLmNvbSc6ICdTaG9wcGluZycsXG4gICdzaG9waWZ5LmNvbSc6ICdTaG9wcGluZycsXG4gICd0ZW11LmNvbSc6ICdTaG9wcGluZycsXG4gICdzaGVpbi5jb20nOiAnU2hvcHBpbmcnLFxuICAnd2F5ZmFpci5jb20nOiAnU2hvcHBpbmcnLFxuICAnY29zdGNvLmNvbSc6ICdTaG9wcGluZycsXG5cbiAgLy8gQ29tbXVuaWNhdGlvblxuICAnbWFpbC5nb29nbGUuY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnb3V0bG9vay5saXZlLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ3NsYWNrLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ2Rpc2NvcmQuY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnem9vbS51cyc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ3RlYW1zLm1pY3Jvc29mdC5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICd3aGF0c2FwcC5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICd0ZWxlZ3JhbS5vcmcnOiAnQ29tbXVuaWNhdGlvbicsXG4gICdtZXNzZW5nZXIuY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnc2t5cGUuY29tJzogJ0NvbW11bmljYXRpb24nLFxuXG4gIC8vIEZpbmFuY2VcbiAgJ3BheXBhbC5jb20nOiAnRmluYW5jZScsXG4gICdjaGFzZS5jb20nOiAnRmluYW5jZScsXG4gICdiYW5rb2ZhbWVyaWNhLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ3dlbGxzZmFyZ28uY29tJzogJ0ZpbmFuY2UnLFxuICAnYW1lcmljYW5leHByZXNzLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ3N0cmlwZS5jb20nOiAnRmluYW5jZScsXG4gICdjb2luYmFzZS5jb20nOiAnRmluYW5jZScsXG4gICdiaW5hbmNlLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2tyYWtlbi5jb20nOiAnRmluYW5jZScsXG4gICdyb2Jpbmhvb2QuY29tJzogJ0ZpbmFuY2UnLFxuICAnZmlkZWxpdHkuY29tJzogJ0ZpbmFuY2UnLFxuICAndmFuZ3VhcmQuY29tJzogJ0ZpbmFuY2UnLFxuICAnc2Nod2FiLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ21pbnQuaW50dWl0LmNvbSc6ICdGaW5hbmNlJyxcblxuICAvLyBFZHVjYXRpb25cbiAgJ3dpa2lwZWRpYS5vcmcnOiAnRWR1Y2F0aW9uJyxcbiAgJ2NvdXJzZXJhLm9yZyc6ICdFZHVjYXRpb24nLFxuICAndWRlbXkuY29tJzogJ0VkdWNhdGlvbicsXG4gICdlZHgub3JnJzogJ0VkdWNhdGlvbicsXG4gICdraGFuYWNhZGVteS5vcmcnOiAnRWR1Y2F0aW9uJyxcbiAgJ3F1aXpsZXQuY29tJzogJ0VkdWNhdGlvbicsXG4gICdkdW9saW5nby5jb20nOiAnRWR1Y2F0aW9uJyxcbiAgJ2NhbnZhcy5pbnN0cnVjdHVyZS5jb20nOiAnRWR1Y2F0aW9uJyxcbiAgJ2JsYWNrYm9hcmQuY29tJzogJ0VkdWNhdGlvbicsXG4gICdtaXQuZWR1JzogJ0VkdWNhdGlvbicsXG4gICdoYXJ2YXJkLmVkdSc6ICdFZHVjYXRpb24nLFxuICAnc3RhbmZvcmQuZWR1JzogJ0VkdWNhdGlvbicsXG4gICdhY2FkZW1pYS5lZHUnOiAnRWR1Y2F0aW9uJyxcbiAgJ3Jlc2VhcmNoZ2F0ZS5uZXQnOiAnRWR1Y2F0aW9uJyxcblxuICAvLyBEZXNpZ25cbiAgJ2ZpZ21hLmNvbSc6ICdEZXNpZ24nLFxuICAnY2FudmEuY29tJzogJ0Rlc2lnbicsXG4gICdiZWhhbmNlLm5ldCc6ICdEZXNpZ24nLFxuICAnZHJpYmJibGUuY29tJzogJ0Rlc2lnbicsXG4gICdhZG9iZS5jb20nOiAnRGVzaWduJyxcbiAgJ3Vuc3BsYXNoLmNvbSc6ICdEZXNpZ24nLFxuICAncGV4ZWxzLmNvbSc6ICdEZXNpZ24nLFxuICAncGl4YWJheS5jb20nOiAnRGVzaWduJyxcbiAgJ3NodXR0ZXJzdG9jay5jb20nOiAnRGVzaWduJyxcblxuICAvLyBQcm9kdWN0aXZpdHlcbiAgJ2RvY3MuZ29vZ2xlLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnc2hlZXRzLmdvb2dsZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ3NsaWRlcy5nb29nbGUuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdkcml2ZS5nb29nbGUuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdub3Rpb24uc28nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ3RyZWxsby5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2FzYW5hLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnbW9uZGF5LmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnYWlydGFibGUuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdldmVybm90ZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2Ryb3Bib3guY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdjbGlja3VwLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnbGluZWFyLmFwcCc6ICdQcm9kdWN0aXZpdHknLFxuICAnbWlyby5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2x1Y2lkY2hhcnQuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG5cbiAgLy8gQUlcbiAgJ29wZW5haS5jb20nOiAnQUknLFxuICAnY2hhdGdwdC5jb20nOiAnQUknLFxuICAnYW50aHJvcGljLmNvbSc6ICdBSScsXG4gICdtaWRqb3VybmV5LmNvbSc6ICdBSScsXG4gICdodWdnaW5nZmFjZS5jbyc6ICdBSScsXG4gICdiYXJkLmdvb2dsZS5jb20nOiAnQUknLFxuICAnZ2VtaW5pLmdvb2dsZS5jb20nOiAnQUknLFxuICAnY2xhdWRlLmFpJzogJ0FJJyxcbiAgJ3BlcnBsZXhpdHkuYWknOiAnQUknLFxuICAncG9lLmNvbSc6ICdBSScsXG5cbiAgLy8gTXVzaWMvQXVkaW9cbiAgJ3Nwb3RpZnkuY29tJzogJ011c2ljJyxcbiAgJ3NvdW5kY2xvdWQuY29tJzogJ011c2ljJyxcbiAgJ211c2ljLmFwcGxlLmNvbSc6ICdNdXNpYycsXG4gICdwYW5kb3JhLmNvbSc6ICdNdXNpYycsXG4gICd0aWRhbC5jb20nOiAnTXVzaWMnLFxuICAnYmFuZGNhbXAuY29tJzogJ011c2ljJyxcbiAgJ2F1ZGlibGUuY29tJzogJ011c2ljJyxcblxuICAvLyBHYW1pbmdcbiAgJ3N0ZWFtcG93ZXJlZC5jb20nOiAnR2FtaW5nJyxcbiAgJ3JvYmxveC5jb20nOiAnR2FtaW5nJyxcbiAgJ2VwaWNnYW1lcy5jb20nOiAnR2FtaW5nJyxcbiAgJ3hib3guY29tJzogJ0dhbWluZycsXG4gICdwbGF5c3RhdGlvbi5jb20nOiAnR2FtaW5nJyxcbiAgJ25pbnRlbmRvLmNvbSc6ICdHYW1pbmcnLFxuICAnaWduLmNvbSc6ICdHYW1pbmcnLFxuICAnZ2FtZXNwb3QuY29tJzogJ0dhbWluZycsXG4gICdrb3Rha3UuY29tJzogJ0dhbWluZycsXG4gICdwb2x5Z29uLmNvbSc6ICdHYW1pbmcnXG59O1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0R2VuZXJhKGhvc3RuYW1lOiBzdHJpbmcsIGN1c3RvbVJlZ2lzdHJ5PzogUmVjb3JkPHN0cmluZywgc3RyaW5nPik6IHN0cmluZyB8IG51bGwge1xuICBpZiAoIWhvc3RuYW1lKSByZXR1cm4gbnVsbDtcblxuICAvLyAwLiBDaGVjayBjdXN0b20gcmVnaXN0cnkgZmlyc3RcbiAgaWYgKGN1c3RvbVJlZ2lzdHJ5KSB7XG4gICAgICBjb25zdCBwYXJ0cyA9IGhvc3RuYW1lLnNwbGl0KCcuJyk7XG4gICAgICAvLyBDaGVjayBmdWxsIGhvc3RuYW1lIGFuZCBwcm9ncmVzc2l2ZWx5IHNob3J0ZXIgc3VmZml4ZXNcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGFydHMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICAgICAgY29uc3QgZG9tYWluID0gcGFydHMuc2xpY2UoaSkuam9pbignLicpO1xuICAgICAgICAgIGlmIChjdXN0b21SZWdpc3RyeVtkb21haW5dKSB7XG4gICAgICAgICAgICAgIHJldHVybiBjdXN0b21SZWdpc3RyeVtkb21haW5dO1xuICAgICAgICAgIH1cbiAgICAgIH1cbiAgfVxuXG4gIC8vIDEuIEV4YWN0IG1hdGNoXG4gIGlmIChHRU5FUkFfUkVHSVNUUllbaG9zdG5hbWVdKSB7XG4gICAgcmV0dXJuIEdFTkVSQV9SRUdJU1RSWVtob3N0bmFtZV07XG4gIH1cblxuICAvLyAyLiBTdWJkb21haW4gY2hlY2sgKHN0cmlwcGluZyBzdWJkb21haW5zKVxuICAvLyBlLmcuIFwiY29uc29sZS5hd3MuYW1hem9uLmNvbVwiIC0+IFwiYXdzLmFtYXpvbi5jb21cIiAtPiBcImFtYXpvbi5jb21cIlxuICBjb25zdCBwYXJ0cyA9IGhvc3RuYW1lLnNwbGl0KCcuJyk7XG5cbiAgLy8gVHJ5IG1hdGNoaW5nIHByb2dyZXNzaXZlbHkgc2hvcnRlciBzdWZmaXhlc1xuICAvLyBlLmcuIGEuYi5jLmNvbSAtPiBiLmMuY29tIC0+IGMuY29tXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcGFydHMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICBjb25zdCBkb21haW4gPSBwYXJ0cy5zbGljZShpKS5qb2luKCcuJyk7XG4gICAgICBpZiAoR0VORVJBX1JFR0lTVFJZW2RvbWFpbl0pIHtcbiAgICAgICAgICByZXR1cm4gR0VORVJBX1JFR0lTVFJZW2RvbWFpbl07XG4gICAgICB9XG4gIH1cblxuICByZXR1cm4gbnVsbDtcbn1cbiIsICJleHBvcnQgY29uc3QgZ2V0U3RvcmVkVmFsdWUgPSBhc3luYyA8VD4oa2V5OiBzdHJpbmcpOiBQcm9taXNlPFQgfCBudWxsPiA9PiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChrZXksIChpdGVtcykgPT4ge1xuICAgICAgcmVzb2x2ZSgoaXRlbXNba2V5XSBhcyBUKSA/PyBudWxsKTtcbiAgICB9KTtcbiAgfSk7XG59O1xuXG5leHBvcnQgY29uc3Qgc2V0U3RvcmVkVmFsdWUgPSBhc3luYyA8VD4oa2V5OiBzdHJpbmcsIHZhbHVlOiBUKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IFtrZXldOiB2YWx1ZSB9LCAoKSA9PiByZXNvbHZlKCkpO1xuICB9KTtcbn07XG4iLCAiaW1wb3J0IHsgQ3VzdG9tU3RyYXRlZ3ksIFByZWZlcmVuY2VzLCBTb3J0aW5nU3RyYXRlZ3kgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBnZXRTdG9yZWRWYWx1ZSwgc2V0U3RvcmVkVmFsdWUgfSBmcm9tIFwiLi9zdG9yYWdlLmpzXCI7XG5pbXBvcnQgeyBzZXRMb2dnZXJQcmVmZXJlbmNlcywgbG9nRGVidWcgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcblxuY29uc3QgUFJFRkVSRU5DRVNfS0VZID0gXCJwcmVmZXJlbmNlc1wiO1xuXG5leHBvcnQgY29uc3QgZGVmYXVsdFByZWZlcmVuY2VzOiBQcmVmZXJlbmNlcyA9IHtcbiAgc29ydGluZzogW1wicGlubmVkXCIsIFwicmVjZW5jeVwiXSxcbiAgZGVidWc6IGZhbHNlLFxuICBsb2dMZXZlbDogXCJpbmZvXCIsXG4gIHRoZW1lOiBcImRhcmtcIixcbiAgY3VzdG9tR2VuZXJhOiB7fVxufTtcblxuY29uc3Qgbm9ybWFsaXplU29ydGluZyA9IChzb3J0aW5nOiB1bmtub3duKTogU29ydGluZ1N0cmF0ZWd5W10gPT4ge1xuICBpZiAoQXJyYXkuaXNBcnJheShzb3J0aW5nKSkge1xuICAgIHJldHVybiBzb3J0aW5nLmZpbHRlcigodmFsdWUpOiB2YWx1ZSBpcyBTb3J0aW5nU3RyYXRlZ3kgPT4gdHlwZW9mIHZhbHVlID09PSBcInN0cmluZ1wiKTtcbiAgfVxuICBpZiAodHlwZW9mIHNvcnRpbmcgPT09IFwic3RyaW5nXCIpIHtcbiAgICByZXR1cm4gW3NvcnRpbmddO1xuICB9XG4gIHJldHVybiBbLi4uZGVmYXVsdFByZWZlcmVuY2VzLnNvcnRpbmddO1xufTtcblxuY29uc3Qgbm9ybWFsaXplU3RyYXRlZ2llcyA9IChzdHJhdGVnaWVzOiB1bmtub3duKTogQ3VzdG9tU3RyYXRlZ3lbXSA9PiB7XG4gICAgY29uc3QgYXJyID0gYXNBcnJheTxhbnk+KHN0cmF0ZWdpZXMpLmZpbHRlcihzID0+IHR5cGVvZiBzID09PSAnb2JqZWN0JyAmJiBzICE9PSBudWxsKTtcbiAgICByZXR1cm4gYXJyLm1hcChzID0+ICh7XG4gICAgICAgIC4uLnMsXG4gICAgICAgIGdyb3VwaW5nUnVsZXM6IGFzQXJyYXkocy5ncm91cGluZ1J1bGVzKSxcbiAgICAgICAgc29ydGluZ1J1bGVzOiBhc0FycmF5KHMuc29ydGluZ1J1bGVzKSxcbiAgICAgICAgZ3JvdXBTb3J0aW5nUnVsZXM6IHMuZ3JvdXBTb3J0aW5nUnVsZXMgPyBhc0FycmF5KHMuZ3JvdXBTb3J0aW5nUnVsZXMpIDogdW5kZWZpbmVkLFxuICAgICAgICBmaWx0ZXJzOiBzLmZpbHRlcnMgPyBhc0FycmF5KHMuZmlsdGVycykgOiB1bmRlZmluZWQsXG4gICAgICAgIGZpbHRlckdyb3Vwczogcy5maWx0ZXJHcm91cHMgPyBhc0FycmF5KHMuZmlsdGVyR3JvdXBzKS5tYXAoKGc6IGFueSkgPT4gYXNBcnJheShnKSkgOiB1bmRlZmluZWQsXG4gICAgICAgIHJ1bGVzOiBzLnJ1bGVzID8gYXNBcnJheShzLnJ1bGVzKSA6IHVuZGVmaW5lZFxuICAgIH0pKTtcbn07XG5cbmNvbnN0IG5vcm1hbGl6ZVByZWZlcmVuY2VzID0gKHByZWZzPzogUGFydGlhbDxQcmVmZXJlbmNlcz4gfCBudWxsKTogUHJlZmVyZW5jZXMgPT4ge1xuICBjb25zdCBtZXJnZWQgPSB7IC4uLmRlZmF1bHRQcmVmZXJlbmNlcywgLi4uKHByZWZzID8/IHt9KSB9O1xuICByZXR1cm4ge1xuICAgIC4uLm1lcmdlZCxcbiAgICBzb3J0aW5nOiBub3JtYWxpemVTb3J0aW5nKG1lcmdlZC5zb3J0aW5nKSxcbiAgICBjdXN0b21TdHJhdGVnaWVzOiBub3JtYWxpemVTdHJhdGVnaWVzKG1lcmdlZC5jdXN0b21TdHJhdGVnaWVzKVxuICB9O1xufTtcblxuZXhwb3J0IGNvbnN0IGxvYWRQcmVmZXJlbmNlcyA9IGFzeW5jICgpOiBQcm9taXNlPFByZWZlcmVuY2VzPiA9PiB7XG4gIGNvbnN0IHN0b3JlZCA9IGF3YWl0IGdldFN0b3JlZFZhbHVlPFByZWZlcmVuY2VzPihQUkVGRVJFTkNFU19LRVkpO1xuICBjb25zdCBtZXJnZWQgPSBub3JtYWxpemVQcmVmZXJlbmNlcyhzdG9yZWQgPz8gdW5kZWZpbmVkKTtcbiAgc2V0TG9nZ2VyUHJlZmVyZW5jZXMobWVyZ2VkKTtcbiAgcmV0dXJuIG1lcmdlZDtcbn07XG5cbmV4cG9ydCBjb25zdCBzYXZlUHJlZmVyZW5jZXMgPSBhc3luYyAocHJlZnM6IFBhcnRpYWw8UHJlZmVyZW5jZXM+KTogUHJvbWlzZTxQcmVmZXJlbmNlcz4gPT4ge1xuICBsb2dEZWJ1ZyhcIlVwZGF0aW5nIHByZWZlcmVuY2VzXCIsIHsga2V5czogT2JqZWN0LmtleXMocHJlZnMpIH0pO1xuICBjb25zdCBjdXJyZW50ID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gIGNvbnN0IG1lcmdlZCA9IG5vcm1hbGl6ZVByZWZlcmVuY2VzKHsgLi4uY3VycmVudCwgLi4ucHJlZnMgfSk7XG4gIGF3YWl0IHNldFN0b3JlZFZhbHVlKFBSRUZFUkVOQ0VTX0tFWSwgbWVyZ2VkKTtcbiAgc2V0TG9nZ2VyUHJlZmVyZW5jZXMobWVyZ2VkKTtcbiAgcmV0dXJuIG1lcmdlZDtcbn07XG4iLCAiaW1wb3J0IHsgUGFnZUNvbnRleHQsIFRhYk1ldGFkYXRhIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgbm9ybWFsaXplVXJsLCBwYXJzZVlvdVR1YmVVcmwsIGV4dHJhY3RZb3VUdWJlQ2hhbm5lbEZyb21IdG1sLCBleHRyYWN0WW91VHViZUdlbnJlRnJvbUh0bWwgfSBmcm9tIFwiLi9sb2dpYy5qc1wiO1xuaW1wb3J0IHsgZ2V0R2VuZXJhIH0gZnJvbSBcIi4vZ2VuZXJhUmVnaXN0cnkuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGxvYWRQcmVmZXJlbmNlcyB9IGZyb20gXCIuLi9wcmVmZXJlbmNlcy5qc1wiO1xuXG5pbnRlcmZhY2UgRXh0cmFjdGlvblJlc3BvbnNlIHtcbiAgZGF0YTogUGFnZUNvbnRleHQgfCBudWxsO1xuICBlcnJvcj86IHN0cmluZztcbiAgc3RhdHVzOlxuICAgIHwgJ09LJ1xuICAgIHwgJ1JFU1RSSUNURUQnXG4gICAgfCAnSU5KRUNUSU9OX0ZBSUxFRCdcbiAgICB8ICdOT19SRVNQT05TRSdcbiAgICB8ICdOT19IT1NUX1BFUk1JU1NJT04nXG4gICAgfCAnRlJBTUVfQUNDRVNTX0RFTklFRCc7XG59XG5cbi8vIFNpbXBsZSBjb25jdXJyZW5jeSBjb250cm9sXG5sZXQgYWN0aXZlRmV0Y2hlcyA9IDA7XG5jb25zdCBNQVhfQ09OQ1VSUkVOVF9GRVRDSEVTID0gNTsgLy8gQ29uc2VydmF0aXZlIGxpbWl0IHRvIGF2b2lkIHJhdGUgbGltaXRpbmdcbmNvbnN0IEZFVENIX1FVRVVFOiAoKCkgPT4gdm9pZClbXSA9IFtdO1xuXG5jb25zdCBmZXRjaFdpdGhUaW1lb3V0ID0gYXN5bmMgKHVybDogc3RyaW5nLCB0aW1lb3V0ID0gMjAwMCk6IFByb21pc2U8UmVzcG9uc2U+ID0+IHtcbiAgICBjb25zdCBjb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuICAgIGNvbnN0IGlkID0gc2V0VGltZW91dCgoKSA9PiBjb250cm9sbGVyLmFib3J0KCksIHRpbWVvdXQpO1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godXJsLCB7IHNpZ25hbDogY29udHJvbGxlci5zaWduYWwgfSk7XG4gICAgICAgIHJldHVybiByZXNwb25zZTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgICBjbGVhclRpbWVvdXQoaWQpO1xuICAgIH1cbn07XG5cbmNvbnN0IGVucXVldWVGZXRjaCA9IGFzeW5jIDxUPihmbjogKCkgPT4gUHJvbWlzZTxUPik6IFByb21pc2U8VD4gPT4ge1xuICAgIGlmIChhY3RpdmVGZXRjaGVzID49IE1BWF9DT05DVVJSRU5UX0ZFVENIRVMpIHtcbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBGRVRDSF9RVUVVRS5wdXNoKHJlc29sdmUpKTtcbiAgICB9XG4gICAgYWN0aXZlRmV0Y2hlcysrO1xuICAgIHRyeSB7XG4gICAgICAgIHJldHVybiBhd2FpdCBmbigpO1xuICAgIH0gZmluYWxseSB7XG4gICAgICAgIGFjdGl2ZUZldGNoZXMtLTtcbiAgICAgICAgaWYgKEZFVENIX1FVRVVFLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGNvbnN0IG5leHQgPSBGRVRDSF9RVUVVRS5zaGlmdCgpO1xuICAgICAgICAgICAgaWYgKG5leHQpIG5leHQoKTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbmV4cG9ydCBjb25zdCBleHRyYWN0UGFnZUNvbnRleHQgPSBhc3luYyAodGFiOiBUYWJNZXRhZGF0YSB8IGNocm9tZS50YWJzLlRhYik6IFByb21pc2U8RXh0cmFjdGlvblJlc3BvbnNlPiA9PiB7XG4gIHRyeSB7XG4gICAgaWYgKCF0YWIgfHwgIXRhYi51cmwpIHtcbiAgICAgICAgcmV0dXJuIHsgZGF0YTogbnVsbCwgZXJyb3I6IFwiVGFiIG5vdCBmb3VuZCBvciBubyBVUkxcIiwgc3RhdHVzOiAnTk9fUkVTUE9OU0UnIH07XG4gICAgfVxuXG4gICAgaWYgKFxuICAgICAgdGFiLnVybC5zdGFydHNXaXRoKCdjaHJvbWU6Ly8nKSB8fFxuICAgICAgdGFiLnVybC5zdGFydHNXaXRoKCdlZGdlOi8vJykgfHxcbiAgICAgIHRhYi51cmwuc3RhcnRzV2l0aCgnYWJvdXQ6JykgfHxcbiAgICAgIHRhYi51cmwuc3RhcnRzV2l0aCgnY2hyb21lLWV4dGVuc2lvbjovLycpIHx8XG4gICAgICB0YWIudXJsLnN0YXJ0c1dpdGgoJ2Nocm9tZS1lcnJvcjovLycpXG4gICAgKSB7XG4gICAgICAgIHJldHVybiB7IGRhdGE6IG51bGwsIGVycm9yOiBcIlJlc3RyaWN0ZWQgVVJMIHNjaGVtZVwiLCBzdGF0dXM6ICdSRVNUUklDVEVEJyB9O1xuICAgIH1cblxuICAgIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gICAgbGV0IGJhc2VsaW5lID0gYnVpbGRCYXNlbGluZUNvbnRleHQodGFiIGFzIGNocm9tZS50YWJzLlRhYiwgcHJlZnMuY3VzdG9tR2VuZXJhKTtcblxuICAgIC8vIEZldGNoIGFuZCBlbnJpY2ggZm9yIFlvdVR1YmUgaWYgYXV0aG9yIGlzIG1pc3NpbmcgYW5kIGl0IGlzIGEgdmlkZW9cbiAgICBjb25zdCB0YXJnZXRVcmwgPSB0YWIudXJsO1xuICAgIGNvbnN0IHVybE9iaiA9IG5ldyBVUkwodGFyZ2V0VXJsKTtcbiAgICBjb25zdCBob3N0bmFtZSA9IHVybE9iai5ob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgJycpO1xuICAgIGlmICgoaG9zdG5hbWUuZW5kc1dpdGgoJ3lvdXR1YmUuY29tJykgfHwgaG9zdG5hbWUuZW5kc1dpdGgoJ3lvdXR1LmJlJykpICYmICghYmFzZWxpbmUuYXV0aG9yT3JDcmVhdG9yIHx8IGJhc2VsaW5lLmdlbnJlID09PSAnVmlkZW8nKSkge1xuICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAvLyBXZSB1c2UgYSBxdWV1ZSB0byBwcmV2ZW50IGZsb29kaW5nIHJlcXVlc3RzXG4gICAgICAgICAgICAgYXdhaXQgZW5xdWV1ZUZldGNoKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaFdpdGhUaW1lb3V0KHRhcmdldFVybCk7XG4gICAgICAgICAgICAgICAgIGlmIChyZXNwb25zZS5vaykge1xuICAgICAgICAgICAgICAgICAgICAgY29uc3QgaHRtbCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNoYW5uZWwgPSBleHRyYWN0WW91VHViZUNoYW5uZWxGcm9tSHRtbChodG1sKTtcbiAgICAgICAgICAgICAgICAgICAgIGlmIChjaGFubmVsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgYmFzZWxpbmUuYXV0aG9yT3JDcmVhdG9yID0gY2hhbm5lbDtcbiAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGdlbnJlID0gZXh0cmFjdFlvdVR1YmVHZW5yZUZyb21IdG1sKGh0bWwpO1xuICAgICAgICAgICAgICAgICAgICAgaWYgKGdlbnJlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgYmFzZWxpbmUuZ2VucmUgPSBnZW5yZTtcbiAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgIH0pO1xuICAgICAgICAgfSBjYXRjaCAoZmV0Y2hFcnIpIHtcbiAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkZhaWxlZCB0byBmZXRjaCBZb3VUdWJlIHBhZ2UgY29udGVudFwiLCB7IGVycm9yOiBTdHJpbmcoZmV0Y2hFcnIpIH0pO1xuICAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBkYXRhOiBiYXNlbGluZSxcbiAgICAgIHN0YXR1czogJ09LJ1xuICAgIH07XG5cbiAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgbG9nRGVidWcoYEV4dHJhY3Rpb24gZmFpbGVkIGZvciB0YWIgJHt0YWIuaWR9YCwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgIHJldHVybiB7XG4gICAgICBkYXRhOiBudWxsLFxuICAgICAgZXJyb3I6IFN0cmluZyhlKSxcbiAgICAgIHN0YXR1czogJ0lOSkVDVElPTl9GQUlMRUQnXG4gICAgfTtcbiAgfVxufTtcblxuY29uc3QgYnVpbGRCYXNlbGluZUNvbnRleHQgPSAodGFiOiBjaHJvbWUudGFicy5UYWIsIGN1c3RvbUdlbmVyYT86IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pOiBQYWdlQ29udGV4dCA9PiB7XG4gIGNvbnN0IHVybCA9IHRhYi51cmwgfHwgXCJcIjtcbiAgbGV0IGhvc3RuYW1lID0gXCJcIjtcbiAgdHJ5IHtcbiAgICBob3N0bmFtZSA9IG5ldyBVUkwodXJsKS5ob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgJycpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgaG9zdG5hbWUgPSBcIlwiO1xuICB9XG5cbiAgLy8gRGV0ZXJtaW5lIE9iamVjdCBUeXBlIGZpcnN0XG4gIGxldCBvYmplY3RUeXBlOiBQYWdlQ29udGV4dFsnb2JqZWN0VHlwZSddID0gJ3Vua25vd24nO1xuICBsZXQgYXV0aG9yT3JDcmVhdG9yOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblxuICBpZiAodXJsLmluY2x1ZGVzKCcvbG9naW4nKSB8fCB1cmwuaW5jbHVkZXMoJy9zaWduaW4nKSkge1xuICAgICAgb2JqZWN0VHlwZSA9ICdsb2dpbic7XG4gIH0gZWxzZSBpZiAoaG9zdG5hbWUuaW5jbHVkZXMoJ3lvdXR1YmUuY29tJykgfHwgaG9zdG5hbWUuaW5jbHVkZXMoJ3lvdXR1LmJlJykpIHtcbiAgICAgIGNvbnN0IHsgdmlkZW9JZCB9ID0gcGFyc2VZb3VUdWJlVXJsKHVybCk7XG4gICAgICBpZiAodmlkZW9JZCkgb2JqZWN0VHlwZSA9ICd2aWRlbyc7XG5cbiAgICAgIC8vIFRyeSB0byBndWVzcyBjaGFubmVsIGZyb20gVVJMIGlmIHBvc3NpYmxlXG4gICAgICBpZiAodXJsLmluY2x1ZGVzKCcvQCcpKSB7XG4gICAgICAgICAgY29uc3QgcGFydHMgPSB1cmwuc3BsaXQoJy9AJyk7XG4gICAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgY29uc3QgaGFuZGxlID0gcGFydHNbMV0uc3BsaXQoJy8nKVswXTtcbiAgICAgICAgICAgICAgYXV0aG9yT3JDcmVhdG9yID0gJ0AnICsgaGFuZGxlO1xuICAgICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodXJsLmluY2x1ZGVzKCcvYy8nKSkge1xuICAgICAgICAgIGNvbnN0IHBhcnRzID0gdXJsLnNwbGl0KCcvYy8nKTtcbiAgICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICBhdXRob3JPckNyZWF0b3IgPSBkZWNvZGVVUklDb21wb25lbnQocGFydHNbMV0uc3BsaXQoJy8nKVswXSk7XG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICh1cmwuaW5jbHVkZXMoJy91c2VyLycpKSB7XG4gICAgICAgICAgY29uc3QgcGFydHMgPSB1cmwuc3BsaXQoJy91c2VyLycpO1xuICAgICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgIGF1dGhvck9yQ3JlYXRvciA9IGRlY29kZVVSSUNvbXBvbmVudChwYXJ0c1sxXS5zcGxpdCgnLycpWzBdKTtcbiAgICAgICAgICB9XG4gICAgICB9XG4gIH0gZWxzZSBpZiAoaG9zdG5hbWUgPT09ICdnaXRodWIuY29tJyAmJiB1cmwuaW5jbHVkZXMoJy9wdWxsLycpKSB7XG4gICAgICBvYmplY3RUeXBlID0gJ3RpY2tldCc7XG4gIH0gZWxzZSBpZiAoaG9zdG5hbWUgPT09ICdnaXRodWIuY29tJyAmJiAhdXJsLmluY2x1ZGVzKCcvcHVsbC8nKSAmJiB1cmwuc3BsaXQoJy8nKS5sZW5ndGggPj0gNSkge1xuICAgICAgLy8gcm91Z2ggY2hlY2sgZm9yIHJlcG9cbiAgICAgIG9iamVjdFR5cGUgPSAncmVwbyc7XG4gIH1cblxuICAvLyBEZXRlcm1pbmUgR2VucmVcbiAgLy8gUHJpb3JpdHkgMTogU2l0ZS1zcGVjaWZpYyBleHRyYWN0aW9uIChkZXJpdmVkIGZyb20gb2JqZWN0VHlwZSlcbiAgbGV0IGdlbnJlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbiAgaWYgKG9iamVjdFR5cGUgPT09ICd2aWRlbycpIGdlbnJlID0gJ1ZpZGVvJztcbiAgZWxzZSBpZiAob2JqZWN0VHlwZSA9PT0gJ3JlcG8nIHx8IG9iamVjdFR5cGUgPT09ICd0aWNrZXQnKSBnZW5yZSA9ICdEZXZlbG9wbWVudCc7XG5cbiAgLy8gUHJpb3JpdHkgMjogRmFsbGJhY2sgdG8gUmVnaXN0cnlcbiAgaWYgKCFnZW5yZSkge1xuICAgICBnZW5yZSA9IGdldEdlbmVyYShob3N0bmFtZSwgY3VzdG9tR2VuZXJhKSB8fCB1bmRlZmluZWQ7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNhbm9uaWNhbFVybDogdXJsIHx8IG51bGwsXG4gICAgbm9ybWFsaXplZFVybDogbm9ybWFsaXplVXJsKHVybCksXG4gICAgc2l0ZU5hbWU6IGhvc3RuYW1lIHx8IG51bGwsXG4gICAgcGxhdGZvcm06IGhvc3RuYW1lIHx8IG51bGwsXG4gICAgb2JqZWN0VHlwZSxcbiAgICBvYmplY3RJZDogdXJsIHx8IG51bGwsXG4gICAgdGl0bGU6IHRhYi50aXRsZSB8fCBudWxsLFxuICAgIGdlbnJlLFxuICAgIGRlc2NyaXB0aW9uOiBudWxsLFxuICAgIGF1dGhvck9yQ3JlYXRvcjogYXV0aG9yT3JDcmVhdG9yLFxuICAgIHB1Ymxpc2hlZEF0OiBudWxsLFxuICAgIG1vZGlmaWVkQXQ6IG51bGwsXG4gICAgbGFuZ3VhZ2U6IG51bGwsXG4gICAgdGFnczogW10sXG4gICAgYnJlYWRjcnVtYnM6IFtdLFxuICAgIGlzQXVkaWJsZTogZmFsc2UsXG4gICAgaXNNdXRlZDogZmFsc2UsXG4gICAgaXNDYXB0dXJpbmc6IGZhbHNlLFxuICAgIHByb2dyZXNzOiBudWxsLFxuICAgIGhhc1Vuc2F2ZWRDaGFuZ2VzTGlrZWx5OiBmYWxzZSxcbiAgICBpc0F1dGhlbnRpY2F0ZWRMaWtlbHk6IGZhbHNlLFxuICAgIHNvdXJjZXM6IHtcbiAgICAgIGNhbm9uaWNhbFVybDogJ3VybCcsXG4gICAgICBub3JtYWxpemVkVXJsOiAndXJsJyxcbiAgICAgIHNpdGVOYW1lOiAndXJsJyxcbiAgICAgIHBsYXRmb3JtOiAndXJsJyxcbiAgICAgIG9iamVjdFR5cGU6ICd1cmwnLFxuICAgICAgdGl0bGU6IHRhYi50aXRsZSA/ICd0YWInIDogJ3VybCcsXG4gICAgICBnZW5yZTogJ3JlZ2lzdHJ5J1xuICAgIH0sXG4gICAgY29uZmlkZW5jZToge31cbiAgfTtcbn07XG4iLCAiaW1wb3J0IHsgVGFiTWV0YWRhdGEsIFBhZ2VDb250ZXh0IH0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcsIGxvZ0Vycm9yIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGV4dHJhY3RQYWdlQ29udGV4dCB9IGZyb20gXCIuL2V4dHJhY3Rpb24vaW5kZXguanNcIjtcblxuZXhwb3J0IGludGVyZmFjZSBDb250ZXh0UmVzdWx0IHtcbiAgY29udGV4dDogc3RyaW5nO1xuICBzb3VyY2U6ICdBSScgfCAnSGV1cmlzdGljJyB8ICdFeHRyYWN0aW9uJztcbiAgZGF0YT86IFBhZ2VDb250ZXh0O1xuICBlcnJvcj86IHN0cmluZztcbiAgc3RhdHVzPzogc3RyaW5nO1xufVxuXG5jb25zdCBjb250ZXh0Q2FjaGUgPSBuZXcgTWFwPHN0cmluZywgQ29udGV4dFJlc3VsdD4oKTtcblxuZXhwb3J0IGNvbnN0IGFuYWx5emVUYWJDb250ZXh0ID0gYXN5bmMgKFxuICB0YWJzOiBUYWJNZXRhZGF0YVtdLFxuICBvblByb2dyZXNzPzogKGNvbXBsZXRlZDogbnVtYmVyLCB0b3RhbDogbnVtYmVyKSA9PiB2b2lkXG4pOiBQcm9taXNlPE1hcDxudW1iZXIsIENvbnRleHRSZXN1bHQ+PiA9PiB7XG4gIGNvbnN0IGNvbnRleHRNYXAgPSBuZXcgTWFwPG51bWJlciwgQ29udGV4dFJlc3VsdD4oKTtcbiAgbGV0IGNvbXBsZXRlZCA9IDA7XG4gIGNvbnN0IHRvdGFsID0gdGFicy5sZW5ndGg7XG5cbiAgY29uc3QgcHJvbWlzZXMgPSB0YWJzLm1hcChhc3luYyAodGFiKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGNhY2hlS2V5ID0gYCR7dGFiLmlkfTo6JHt0YWIudXJsfWA7XG4gICAgICBpZiAoY29udGV4dENhY2hlLmhhcyhjYWNoZUtleSkpIHtcbiAgICAgICAgY29udGV4dE1hcC5zZXQodGFiLmlkLCBjb250ZXh0Q2FjaGUuZ2V0KGNhY2hlS2V5KSEpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZldGNoQ29udGV4dEZvclRhYih0YWIpO1xuXG4gICAgICAvLyBPbmx5IGNhY2hlIHZhbGlkIHJlc3VsdHMgdG8gYWxsb3cgcmV0cnlpbmcgb24gdHJhbnNpZW50IGVycm9ycz9cbiAgICAgIC8vIEFjdHVhbGx5LCBpZiB3ZSBjYWNoZSBlcnJvciwgd2Ugc3RvcCByZXRyeWluZy5cbiAgICAgIC8vIExldCdzIGNhY2hlIGV2ZXJ5dGhpbmcgZm9yIG5vdyB0byBwcmV2ZW50IHNwYW1taW5nIGlmIGl0IGtlZXBzIGZhaWxpbmcuXG4gICAgICBjb250ZXh0Q2FjaGUuc2V0KGNhY2hlS2V5LCByZXN1bHQpO1xuXG4gICAgICBjb250ZXh0TWFwLnNldCh0YWIuaWQsIHJlc3VsdCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ0Vycm9yKGBGYWlsZWQgdG8gYW5hbHl6ZSBjb250ZXh0IGZvciB0YWIgJHt0YWIuaWR9YCwgeyBlcnJvcjogU3RyaW5nKGVycm9yKSB9KTtcbiAgICAgIC8vIEV2ZW4gaWYgZmV0Y2hDb250ZXh0Rm9yVGFiIGZhaWxzIGNvbXBsZXRlbHksIHdlIHRyeSBhIHNhZmUgc3luYyBmYWxsYmFja1xuICAgICAgY29udGV4dE1hcC5zZXQodGFiLmlkLCB7IGNvbnRleHQ6IFwiVW5jYXRlZ29yaXplZFwiLCBzb3VyY2U6ICdIZXVyaXN0aWMnLCBlcnJvcjogU3RyaW5nKGVycm9yKSwgc3RhdHVzOiAnRVJST1InIH0pO1xuICAgIH0gZmluYWxseSB7XG4gICAgICBjb21wbGV0ZWQrKztcbiAgICAgIGlmIChvblByb2dyZXNzKSBvblByb2dyZXNzKGNvbXBsZXRlZCwgdG90YWwpO1xuICAgIH1cbiAgfSk7XG5cbiAgYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICByZXR1cm4gY29udGV4dE1hcDtcbn07XG5cbmNvbnN0IGZldGNoQ29udGV4dEZvclRhYiA9IGFzeW5jICh0YWI6IFRhYk1ldGFkYXRhKTogUHJvbWlzZTxDb250ZXh0UmVzdWx0PiA9PiB7XG4gIC8vIDEuIFJ1biBHZW5lcmljIEV4dHJhY3Rpb24gKEFsd2F5cylcbiAgbGV0IGRhdGE6IFBhZ2VDb250ZXh0IHwgbnVsbCA9IG51bGw7XG4gIGxldCBlcnJvcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICBsZXQgc3RhdHVzOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbiAgdHJ5IHtcbiAgICAgIGNvbnN0IGV4dHJhY3Rpb24gPSBhd2FpdCBleHRyYWN0UGFnZUNvbnRleHQodGFiKTtcbiAgICAgIGRhdGEgPSBleHRyYWN0aW9uLmRhdGE7XG4gICAgICBlcnJvciA9IGV4dHJhY3Rpb24uZXJyb3I7XG4gICAgICBzdGF0dXMgPSBleHRyYWN0aW9uLnN0YXR1cztcbiAgfSBjYXRjaCAoZSkge1xuICAgICAgbG9nRGVidWcoYEV4dHJhY3Rpb24gZmFpbGVkIGZvciB0YWIgJHt0YWIuaWR9YCwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgZXJyb3IgPSBTdHJpbmcoZSk7XG4gICAgICBzdGF0dXMgPSAnRVJST1InO1xuICB9XG5cbiAgbGV0IGNvbnRleHQgPSBcIlVuY2F0ZWdvcml6ZWRcIjtcbiAgbGV0IHNvdXJjZTogQ29udGV4dFJlc3VsdFsnc291cmNlJ10gPSAnSGV1cmlzdGljJztcblxuICAvLyAyLiBUcnkgdG8gRGV0ZXJtaW5lIENhdGVnb3J5IGZyb20gRXh0cmFjdGlvbiBEYXRhXG4gIGlmIChkYXRhKSB7XG4gICAgICBpZiAoZGF0YS5wbGF0Zm9ybSA9PT0gJ1lvdVR1YmUnIHx8IGRhdGEucGxhdGZvcm0gPT09ICdOZXRmbGl4JyB8fCBkYXRhLnBsYXRmb3JtID09PSAnU3BvdGlmeScgfHwgZGF0YS5wbGF0Zm9ybSA9PT0gJ1R3aXRjaCcpIHtcbiAgICAgICAgICBjb250ZXh0ID0gXCJFbnRlcnRhaW5tZW50XCI7XG4gICAgICAgICAgc291cmNlID0gJ0V4dHJhY3Rpb24nO1xuICAgICAgfSBlbHNlIGlmIChkYXRhLnBsYXRmb3JtID09PSAnR2l0SHViJyB8fCBkYXRhLnBsYXRmb3JtID09PSAnU3RhY2sgT3ZlcmZsb3cnIHx8IGRhdGEucGxhdGZvcm0gPT09ICdKaXJhJyB8fCBkYXRhLnBsYXRmb3JtID09PSAnR2l0TGFiJykge1xuICAgICAgICAgIGNvbnRleHQgPSBcIkRldmVsb3BtZW50XCI7XG4gICAgICAgICAgc291cmNlID0gJ0V4dHJhY3Rpb24nO1xuICAgICAgfSBlbHNlIGlmIChkYXRhLnBsYXRmb3JtID09PSAnR29vZ2xlJyAmJiAoZGF0YS5ub3JtYWxpemVkVXJsLmluY2x1ZGVzKCdkb2NzJykgfHwgZGF0YS5ub3JtYWxpemVkVXJsLmluY2x1ZGVzKCdzaGVldHMnKSB8fCBkYXRhLm5vcm1hbGl6ZWRVcmwuaW5jbHVkZXMoJ3NsaWRlcycpKSkge1xuICAgICAgICAgIGNvbnRleHQgPSBcIldvcmtcIjtcbiAgICAgICAgICBzb3VyY2UgPSAnRXh0cmFjdGlvbic7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBJZiB3ZSBoYXZlIHN1Y2Nlc3NmdWwgZXh0cmFjdGlvbiBkYXRhIGJ1dCBubyBzcGVjaWZpYyBydWxlIG1hdGNoZWQsXG4gICAgICAgIC8vIHVzZSB0aGUgT2JqZWN0IFR5cGUgb3IgZ2VuZXJpYyBcIkdlbmVyYWwgV2ViXCIgdG8gaW5kaWNhdGUgZXh0cmFjdGlvbiB3b3JrZWQuXG4gICAgICAgIC8vIFdlIHByZWZlciBzcGVjaWZpYyBjYXRlZ29yaWVzLCBidXQgXCJBcnRpY2xlXCIgb3IgXCJWaWRlb1wiIGFyZSBiZXR0ZXIgdGhhbiBcIlVuY2F0ZWdvcml6ZWRcIi5cbiAgICAgICAgaWYgKGRhdGEub2JqZWN0VHlwZSAmJiBkYXRhLm9iamVjdFR5cGUgIT09ICd1bmtub3duJykge1xuICAgICAgICAgICAgIC8vIE1hcCBvYmplY3QgdHlwZXMgdG8gY2F0ZWdvcmllcyBpZiBwb3NzaWJsZVxuICAgICAgICAgICAgIGlmIChkYXRhLm9iamVjdFR5cGUgPT09ICd2aWRlbycpIGNvbnRleHQgPSAnRW50ZXJ0YWlubWVudCc7XG4gICAgICAgICAgICAgZWxzZSBpZiAoZGF0YS5vYmplY3RUeXBlID09PSAnYXJ0aWNsZScpIGNvbnRleHQgPSAnTmV3cyc7IC8vIExvb3NlIG1hcHBpbmcsIGJ1dCBiZXR0ZXIgdGhhbiBub3RoaW5nXG4gICAgICAgICAgICAgZWxzZSBjb250ZXh0ID0gZGF0YS5vYmplY3RUeXBlLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgZGF0YS5vYmplY3RUeXBlLnNsaWNlKDEpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgIGNvbnRleHQgPSBcIkdlbmVyYWwgV2ViXCI7XG4gICAgICAgIH1cbiAgICAgICAgc291cmNlID0gJ0V4dHJhY3Rpb24nO1xuICAgICAgfVxuICB9XG5cbiAgLy8gMy4gRmFsbGJhY2sgdG8gTG9jYWwgSGV1cmlzdGljIChVUkwgUmVnZXgpXG4gIGlmIChjb250ZXh0ID09PSBcIlVuY2F0ZWdvcml6ZWRcIikge1xuICAgICAgY29uc3QgaCA9IGF3YWl0IGxvY2FsSGV1cmlzdGljKHRhYik7XG4gICAgICBpZiAoaC5jb250ZXh0ICE9PSBcIlVuY2F0ZWdvcml6ZWRcIikge1xuICAgICAgICAgIGNvbnRleHQgPSBoLmNvbnRleHQ7XG4gICAgICAgICAgLy8gc291cmNlIHJlbWFpbnMgJ0hldXJpc3RpYycgKG9yIG1heWJlIHdlIHNob3VsZCBzYXkgJ0hldXJpc3RpYycgaXMgdGhlIHNvdXJjZT8pXG4gICAgICAgICAgLy8gVGhlIGxvY2FsSGV1cmlzdGljIGZ1bmN0aW9uIHJldHVybnMgeyBzb3VyY2U6ICdIZXVyaXN0aWMnIH1cbiAgICAgIH1cbiAgfVxuXG4gIC8vIDQuIEZhbGxiYWNrIHRvIEFJIChMTE0pIC0gUkVNT1ZFRFxuICAvLyBUaGUgSHVnZ2luZ0ZhY2UgQVBJIGVuZHBvaW50IGlzIDQxMCBHb25lIGFuZC9vciByZXF1aXJlcyBhdXRoZW50aWNhdGlvbiB3aGljaCB3ZSBkbyBub3QgaGF2ZS5cbiAgLy8gVGhlIGNvZGUgaGFzIGJlZW4gcmVtb3ZlZCB0byBwcmV2ZW50IGVycm9ycy5cblxuICBpZiAoY29udGV4dCAhPT0gXCJVbmNhdGVnb3JpemVkXCIgJiYgc291cmNlICE9PSBcIkV4dHJhY3Rpb25cIikge1xuICAgIGVycm9yID0gdW5kZWZpbmVkO1xuICAgIHN0YXR1cyA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gIHJldHVybiB7IGNvbnRleHQsIHNvdXJjZSwgZGF0YTogZGF0YSB8fCB1bmRlZmluZWQsIGVycm9yLCBzdGF0dXMgfTtcbn07XG5cbmNvbnN0IGxvY2FsSGV1cmlzdGljID0gYXN5bmMgKHRhYjogVGFiTWV0YWRhdGEpOiBQcm9taXNlPENvbnRleHRSZXN1bHQ+ID0+IHtcbiAgY29uc3QgdXJsID0gdGFiLnVybC50b0xvd2VyQ2FzZSgpO1xuICBsZXQgY29udGV4dCA9IFwiVW5jYXRlZ29yaXplZFwiO1xuXG4gIGlmICh1cmwuaW5jbHVkZXMoXCJnaXRodWJcIikgfHwgdXJsLmluY2x1ZGVzKFwic3RhY2tvdmVyZmxvd1wiKSB8fCB1cmwuaW5jbHVkZXMoXCJsb2NhbGhvc3RcIikgfHwgdXJsLmluY2x1ZGVzKFwiamlyYVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJnaXRsYWJcIikpIGNvbnRleHQgPSBcIkRldmVsb3BtZW50XCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcImdvb2dsZVwiKSAmJiAodXJsLmluY2x1ZGVzKFwiZG9jc1wiKSB8fCB1cmwuaW5jbHVkZXMoXCJzaGVldHNcIikgfHwgdXJsLmluY2x1ZGVzKFwic2xpZGVzXCIpKSkgY29udGV4dCA9IFwiV29ya1wiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJsaW5rZWRpblwiKSB8fCB1cmwuaW5jbHVkZXMoXCJzbGFja1wiKSB8fCB1cmwuaW5jbHVkZXMoXCJ6b29tXCIpIHx8IHVybC5pbmNsdWRlcyhcInRlYW1zXCIpKSBjb250ZXh0ID0gXCJXb3JrXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcIm5ldGZsaXhcIikgfHwgdXJsLmluY2x1ZGVzKFwic3BvdGlmeVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJodWx1XCIpIHx8IHVybC5pbmNsdWRlcyhcImRpc25leVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJ5b3V0dWJlXCIpKSBjb250ZXh0ID0gXCJFbnRlcnRhaW5tZW50XCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcInR3aXR0ZXJcIikgfHwgdXJsLmluY2x1ZGVzKFwiZmFjZWJvb2tcIikgfHwgdXJsLmluY2x1ZGVzKFwiaW5zdGFncmFtXCIpIHx8IHVybC5pbmNsdWRlcyhcInJlZGRpdFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJ0aWt0b2tcIikgfHwgdXJsLmluY2x1ZGVzKFwicGludGVyZXN0XCIpKSBjb250ZXh0ID0gXCJTb2NpYWxcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwiYW1hem9uXCIpIHx8IHVybC5pbmNsdWRlcyhcImViYXlcIikgfHwgdXJsLmluY2x1ZGVzKFwid2FsbWFydFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJ0YXJnZXRcIikgfHwgdXJsLmluY2x1ZGVzKFwic2hvcGlmeVwiKSkgY29udGV4dCA9IFwiU2hvcHBpbmdcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwiY25uXCIpIHx8IHVybC5pbmNsdWRlcyhcImJiY1wiKSB8fCB1cmwuaW5jbHVkZXMoXCJueXRpbWVzXCIpIHx8IHVybC5pbmNsdWRlcyhcIndhc2hpbmd0b25wb3N0XCIpIHx8IHVybC5pbmNsdWRlcyhcImZveG5ld3NcIikpIGNvbnRleHQgPSBcIk5ld3NcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwiY291cnNlcmFcIikgfHwgdXJsLmluY2x1ZGVzKFwidWRlbXlcIikgfHwgdXJsLmluY2x1ZGVzKFwiZWR4XCIpIHx8IHVybC5pbmNsdWRlcyhcImtoYW5hY2FkZW15XCIpIHx8IHVybC5pbmNsdWRlcyhcImNhbnZhc1wiKSkgY29udGV4dCA9IFwiRWR1Y2F0aW9uXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcImV4cGVkaWFcIikgfHwgdXJsLmluY2x1ZGVzKFwiYm9va2luZ1wiKSB8fCB1cmwuaW5jbHVkZXMoXCJhaXJibmJcIikgfHwgdXJsLmluY2x1ZGVzKFwidHJpcGFkdmlzb3JcIikgfHwgdXJsLmluY2x1ZGVzKFwia2F5YWtcIikpIGNvbnRleHQgPSBcIlRyYXZlbFwiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJ3ZWJtZFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJtYXlvY2xpbmljXCIpIHx8IHVybC5pbmNsdWRlcyhcIm5paC5nb3ZcIikgfHwgdXJsLmluY2x1ZGVzKFwiaGVhbHRoXCIpKSBjb250ZXh0ID0gXCJIZWFsdGhcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwiZXNwblwiKSB8fCB1cmwuaW5jbHVkZXMoXCJuYmFcIikgfHwgdXJsLmluY2x1ZGVzKFwibmZsXCIpIHx8IHVybC5pbmNsdWRlcyhcIm1sYlwiKSB8fCB1cmwuaW5jbHVkZXMoXCJmaWZhXCIpKSBjb250ZXh0ID0gXCJTcG9ydHNcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwidGVjaGNydW5jaFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJ3aXJlZFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJ0aGV2ZXJnZVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJhcnN0ZWNobmljYVwiKSkgY29udGV4dCA9IFwiVGVjaG5vbG9neVwiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJzY2llbmNlXCIpIHx8IHVybC5pbmNsdWRlcyhcIm5hdHVyZS5jb21cIikgfHwgdXJsLmluY2x1ZGVzKFwibmFzYS5nb3ZcIikpIGNvbnRleHQgPSBcIlNjaWVuY2VcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwidHdpdGNoXCIpIHx8IHVybC5pbmNsdWRlcyhcInN0ZWFtXCIpIHx8IHVybC5pbmNsdWRlcyhcInJvYmxveFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJpZ25cIikgfHwgdXJsLmluY2x1ZGVzKFwiZ2FtZXNwb3RcIikpIGNvbnRleHQgPSBcIkdhbWluZ1wiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJzb3VuZGNsb3VkXCIpIHx8IHVybC5pbmNsdWRlcyhcImJhbmRjYW1wXCIpIHx8IHVybC5pbmNsdWRlcyhcImxhc3QuZm1cIikpIGNvbnRleHQgPSBcIk11c2ljXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcImRldmlhbnRhcnRcIikgfHwgdXJsLmluY2x1ZGVzKFwiYmVoYW5jZVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJkcmliYmJsZVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJhcnRzdGF0aW9uXCIpKSBjb250ZXh0ID0gXCJBcnRcIjtcblxuICByZXR1cm4geyBjb250ZXh0LCBzb3VyY2U6ICdIZXVyaXN0aWMnIH07XG59O1xuIiwgImltcG9ydCB7IGdyb3VwVGFicywgZ2V0Q3VzdG9tU3RyYXRlZ2llcywgZ2V0RmllbGRWYWx1ZSwgcmVxdWlyZXNDb250ZXh0QW5hbHlzaXMgfSBmcm9tIFwiLi9ncm91cGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IHNvcnRUYWJzLCBjb21wYXJlQnkgfSBmcm9tIFwiLi9zb3J0aW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgYW5hbHl6ZVRhYkNvbnRleHQgfSBmcm9tIFwiLi9jb250ZXh0QW5hbHlzaXMuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnLCBsb2dFcnJvciwgbG9nSW5mbyB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBHcm91cGluZ1NlbGVjdGlvbiwgUHJlZmVyZW5jZXMsIFRhYkdyb3VwLCBUYWJNZXRhZGF0YSwgU29ydGluZ1J1bGUgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBnZXRTdG9yZWRWYWx1ZSwgc2V0U3RvcmVkVmFsdWUgfSBmcm9tIFwiLi9zdG9yYWdlLmpzXCI7XG5pbXBvcnQgeyBtYXBDaHJvbWVUYWIsIGFzQXJyYXkgfSBmcm9tIFwiLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5cbmV4cG9ydCBjb25zdCBmZXRjaEN1cnJlbnRUYWJHcm91cHMgPSBhc3luYyAoXG4gIHByZWZlcmVuY2VzOiBQcmVmZXJlbmNlcyxcbiAgb25Qcm9ncmVzcz86IChjb21wbGV0ZWQ6IG51bWJlciwgdG90YWw6IG51bWJlcikgPT4gdm9pZFxuKTogUHJvbWlzZTxUYWJHcm91cFtdPiA9PiB7XG4gIHRyeSB7XG4gIGNvbnN0IHRhYnMgPSBhd2FpdCBjaHJvbWUudGFicy5xdWVyeSh7fSk7XG4gIGNvbnN0IGdyb3VwcyA9IGF3YWl0IGNocm9tZS50YWJHcm91cHMucXVlcnkoe30pO1xuICBjb25zdCBncm91cE1hcCA9IG5ldyBNYXAoZ3JvdXBzLm1hcChnID0+IFtnLmlkLCBnXSkpO1xuXG4gIC8vIE1hcCB0YWJzIHRvIG1ldGFkYXRhXG4gIGNvbnN0IG1hcHBlZCA9IHRhYnMubWFwKG1hcENocm9tZVRhYikuZmlsdGVyKCh0KTogdCBpcyBUYWJNZXRhZGF0YSA9PiBCb29sZWFuKHQpKTtcblxuICBpZiAocmVxdWlyZXNDb250ZXh0QW5hbHlzaXMocHJlZmVyZW5jZXMuc29ydGluZykpIHtcbiAgICAgIGNvbnN0IGNvbnRleHRNYXAgPSBhd2FpdCBhbmFseXplVGFiQ29udGV4dChtYXBwZWQsIG9uUHJvZ3Jlc3MpO1xuICAgICAgbWFwcGVkLmZvckVhY2godGFiID0+IHtcbiAgICAgICAgY29uc3QgcmVzID0gY29udGV4dE1hcC5nZXQodGFiLmlkKTtcbiAgICAgICAgdGFiLmNvbnRleHQgPSByZXM/LmNvbnRleHQ7XG4gICAgICAgIHRhYi5jb250ZXh0RGF0YSA9IHJlcz8uZGF0YTtcbiAgICAgIH0pO1xuICB9XG5cbiAgY29uc3QgcmVzdWx0R3JvdXBzOiBUYWJHcm91cFtdID0gW107XG4gIGNvbnN0IHRhYnNCeUdyb3VwSWQgPSBuZXcgTWFwPG51bWJlciwgVGFiTWV0YWRhdGFbXT4oKTtcbiAgY29uc3QgdGFic0J5V2luZG93VW5ncm91cGVkID0gbmV3IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhW10+KCk7XG5cbiAgbWFwcGVkLmZvckVhY2godGFiID0+IHtcbiAgICAgIGNvbnN0IGdyb3VwSWQgPSB0YWIuZ3JvdXBJZCA/PyAtMTtcbiAgICAgIGlmIChncm91cElkICE9PSAtMSkge1xuICAgICAgICAgIGlmICghdGFic0J5R3JvdXBJZC5oYXMoZ3JvdXBJZCkpIHRhYnNCeUdyb3VwSWQuc2V0KGdyb3VwSWQsIFtdKTtcbiAgICAgICAgICB0YWJzQnlHcm91cElkLmdldChncm91cElkKSEucHVzaCh0YWIpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgaWYgKCF0YWJzQnlXaW5kb3dVbmdyb3VwZWQuaGFzKHRhYi53aW5kb3dJZCkpIHRhYnNCeVdpbmRvd1VuZ3JvdXBlZC5zZXQodGFiLndpbmRvd0lkLCBbXSk7XG4gICAgICAgICAgIHRhYnNCeVdpbmRvd1VuZ3JvdXBlZC5nZXQodGFiLndpbmRvd0lkKSEucHVzaCh0YWIpO1xuICAgICAgfVxuICB9KTtcblxuICAvLyBDcmVhdGUgVGFiR3JvdXAgb2JqZWN0cyBmb3IgYWN0dWFsIGdyb3Vwc1xuICBmb3IgKGNvbnN0IFtncm91cElkLCBncm91cFRhYnNdIG9mIHRhYnNCeUdyb3VwSWQpIHtcbiAgICAgIGNvbnN0IGJyb3dzZXJHcm91cCA9IGdyb3VwTWFwLmdldChncm91cElkKTtcbiAgICAgIGlmIChicm93c2VyR3JvdXApIHtcbiAgICAgICAgICByZXN1bHRHcm91cHMucHVzaCh7XG4gICAgICAgICAgICAgIGlkOiBgZ3JvdXAtJHtncm91cElkfWAsXG4gICAgICAgICAgICAgIHdpbmRvd0lkOiBicm93c2VyR3JvdXAud2luZG93SWQsXG4gICAgICAgICAgICAgIGxhYmVsOiBicm93c2VyR3JvdXAudGl0bGUgfHwgXCJVbnRpdGxlZCBHcm91cFwiLFxuICAgICAgICAgICAgICBjb2xvcjogYnJvd3Nlckdyb3VwLmNvbG9yLFxuICAgICAgICAgICAgICB0YWJzOiBzb3J0VGFicyhncm91cFRhYnMsIHByZWZlcmVuY2VzLnNvcnRpbmcpLFxuICAgICAgICAgICAgICByZWFzb246IFwiTWFudWFsXCJcbiAgICAgICAgICB9KTtcbiAgICAgIH1cbiAgfVxuXG4gIC8vIEhhbmRsZSB1bmdyb3VwZWQgdGFic1xuICBmb3IgKGNvbnN0IFt3aW5kb3dJZCwgdGFic10gb2YgdGFic0J5V2luZG93VW5ncm91cGVkKSB7XG4gICAgICByZXN1bHRHcm91cHMucHVzaCh7XG4gICAgICAgICAgaWQ6IGB1bmdyb3VwZWQtJHt3aW5kb3dJZH1gLFxuICAgICAgICAgIHdpbmRvd0lkOiB3aW5kb3dJZCxcbiAgICAgICAgICBsYWJlbDogXCJVbmdyb3VwZWRcIixcbiAgICAgICAgICBjb2xvcjogXCJncmV5XCIsXG4gICAgICAgICAgdGFiczogc29ydFRhYnModGFicywgcHJlZmVyZW5jZXMuc29ydGluZyksXG4gICAgICAgICAgcmVhc29uOiBcIlVuZ3JvdXBlZFwiXG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFNvcnQgZ3JvdXBzIG1pZ2h0IGJlIG5pY2UsIGJ1dCBUYWJHcm91cFtdIGRvZXNuJ3Qgc3RyaWN0bHkgZGljdGF0ZSBvcmRlciBpbiBVSSAoVUkgc29ydHMgYnkgbGFiZWwgY3VycmVudGx5PyBPciBrZWVwcyBvcmRlcj8pXG4gIC8vIHBvcHVwLnRzIHNvcnRzIGdyb3VwcyBieSBsYWJlbCBpbiByZW5kZXJUcmVlOiBBcnJheS5mcm9tKGdyb3Vwcy5lbnRyaWVzKCkpLnNvcnQoKS4uLlxuICAvLyBTbyBvcmRlciBoZXJlIGRvZXNuJ3QgbWF0dGVyIG11Y2guXG5cbiAgbG9nSW5mbyhcIkZldGNoZWQgY3VycmVudCB0YWIgZ3JvdXBzXCIsIHsgZ3JvdXBzOiByZXN1bHRHcm91cHMubGVuZ3RoLCB0YWJzOiBtYXBwZWQubGVuZ3RoIH0pO1xuICByZXR1cm4gcmVzdWx0R3JvdXBzO1xuICB9IGNhdGNoIChlKSB7XG4gICAgbG9nRXJyb3IoXCJFcnJvciBpbiBmZXRjaEN1cnJlbnRUYWJHcm91cHNcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgIHRocm93IGU7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBjYWxjdWxhdGVUYWJHcm91cHMgPSBhc3luYyAoXG4gIHByZWZlcmVuY2VzOiBQcmVmZXJlbmNlcyxcbiAgZmlsdGVyPzogR3JvdXBpbmdTZWxlY3Rpb24sXG4gIG9uUHJvZ3Jlc3M/OiAoY29tcGxldGVkOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+IHZvaWRcbik6IFByb21pc2U8VGFiR3JvdXBbXT4gPT4ge1xuICBjb25zdCBjaHJvbWVUYWJzID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoe30pO1xuICBjb25zdCB3aW5kb3dJZFNldCA9IG5ldyBTZXQoZmlsdGVyPy53aW5kb3dJZHMgPz8gW10pO1xuICBjb25zdCB0YWJJZFNldCA9IG5ldyBTZXQoZmlsdGVyPy50YWJJZHMgPz8gW10pO1xuICBjb25zdCBoYXNGaWx0ZXJzID0gd2luZG93SWRTZXQuc2l6ZSA+IDAgfHwgdGFiSWRTZXQuc2l6ZSA+IDA7XG4gIGNvbnN0IGZpbHRlcmVkVGFicyA9IGNocm9tZVRhYnMuZmlsdGVyKCh0YWIpID0+IHtcbiAgICBpZiAoIWhhc0ZpbHRlcnMpIHJldHVybiB0cnVlO1xuICAgIHJldHVybiAodGFiLndpbmRvd0lkICYmIHdpbmRvd0lkU2V0Lmhhcyh0YWIud2luZG93SWQpKSB8fCAodGFiLmlkICYmIHRhYklkU2V0Lmhhcyh0YWIuaWQpKTtcbiAgfSk7XG4gIGNvbnN0IG1hcHBlZCA9IGZpbHRlcmVkVGFic1xuICAgIC5tYXAobWFwQ2hyb21lVGFiKVxuICAgIC5maWx0ZXIoKHRhYik6IHRhYiBpcyBUYWJNZXRhZGF0YSA9PiBCb29sZWFuKHRhYikpO1xuXG4gIGlmIChyZXF1aXJlc0NvbnRleHRBbmFseXNpcyhwcmVmZXJlbmNlcy5zb3J0aW5nKSkge1xuICAgIGNvbnN0IGNvbnRleHRNYXAgPSBhd2FpdCBhbmFseXplVGFiQ29udGV4dChtYXBwZWQsIG9uUHJvZ3Jlc3MpO1xuICAgIG1hcHBlZC5mb3JFYWNoKHRhYiA9PiB7XG4gICAgICBjb25zdCByZXMgPSBjb250ZXh0TWFwLmdldCh0YWIuaWQpO1xuICAgICAgdGFiLmNvbnRleHQgPSByZXM/LmNvbnRleHQ7XG4gICAgICB0YWIuY29udGV4dERhdGEgPSByZXM/LmRhdGE7XG4gICAgfSk7XG4gIH1cblxuICBjb25zdCBncm91cGVkID0gZ3JvdXBUYWJzKG1hcHBlZCwgcHJlZmVyZW5jZXMuc29ydGluZyk7XG4gIGdyb3VwZWQuZm9yRWFjaCgoZ3JvdXApID0+IHtcbiAgICBncm91cC50YWJzID0gc29ydFRhYnMoZ3JvdXAudGFicywgcHJlZmVyZW5jZXMuc29ydGluZyk7XG4gIH0pO1xuICBsb2dJbmZvKFwiQ2FsY3VsYXRlZCB0YWIgZ3JvdXBzXCIsIHsgZ3JvdXBzOiBncm91cGVkLmxlbmd0aCwgdGFiczogbWFwcGVkLmxlbmd0aCB9KTtcbiAgcmV0dXJuIGdyb3VwZWQ7XG59O1xuXG5jb25zdCBWQUxJRF9DT0xPUlMgPSBbXCJncmV5XCIsIFwiYmx1ZVwiLCBcInJlZFwiLCBcInllbGxvd1wiLCBcImdyZWVuXCIsIFwicGlua1wiLCBcInB1cnBsZVwiLCBcImN5YW5cIiwgXCJvcmFuZ2VcIl07XG5cbmV4cG9ydCBjb25zdCBhcHBseVRhYkdyb3VwcyA9IGFzeW5jIChncm91cHM6IFRhYkdyb3VwW10pID0+IHtcbiAgY29uc3QgY2xhaW1lZEdyb3VwSWRzID0gbmV3IFNldDxudW1iZXI+KCk7XG5cbiAgZm9yIChjb25zdCBncm91cCBvZiBncm91cHMpIHtcbiAgICBsZXQgdGFic1RvUHJvY2VzczogeyB3aW5kb3dJZDogbnVtYmVyLCB0YWJzOiBUYWJNZXRhZGF0YVtdIH1bXSA9IFtdO1xuXG4gICAgaWYgKGdyb3VwLndpbmRvd01vZGUgPT09ICduZXcnKSB7XG4gICAgICBpZiAoZ3JvdXAudGFicy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgZmlyc3QgPSBncm91cC50YWJzWzBdO1xuICAgICAgICAgIGNvbnN0IHdpbiA9IGF3YWl0IGNocm9tZS53aW5kb3dzLmNyZWF0ZSh7IHRhYklkOiBmaXJzdC5pZCB9KTtcbiAgICAgICAgICBjb25zdCB3aW5JZCA9IHdpbi5pZCE7XG4gICAgICAgICAgY29uc3Qgb3RoZXJzID0gZ3JvdXAudGFicy5zbGljZSgxKS5tYXAodCA9PiB0LmlkKTtcbiAgICAgICAgICBpZiAob3RoZXJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGF3YWl0IGNocm9tZS50YWJzLm1vdmUob3RoZXJzLCB7IHdpbmRvd0lkOiB3aW5JZCwgaW5kZXg6IC0xIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0YWJzVG9Qcm9jZXNzLnB1c2goeyB3aW5kb3dJZDogd2luSWQsIHRhYnM6IGdyb3VwLnRhYnMgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBsb2dFcnJvcihcIkVycm9yIGNyZWF0aW5nIG5ldyB3aW5kb3cgZm9yIGdyb3VwXCIsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZ3JvdXAud2luZG93TW9kZSA9PT0gJ2NvbXBvdW5kJykge1xuICAgICAgaWYgKGdyb3VwLnRhYnMubGVuZ3RoID4gMCkge1xuICAgICAgICAvLyBEZXRlcm1pbmUgdGFyZ2V0IHdpbmRvdyAobWFqb3JpdHkgd2lucylcbiAgICAgICAgY29uc3QgY291bnRzID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcj4oKTtcbiAgICAgICAgZ3JvdXAudGFicy5mb3JFYWNoKHQgPT4gY291bnRzLnNldCh0LndpbmRvd0lkLCAoY291bnRzLmdldCh0LndpbmRvd0lkKSB8fCAwKSArIDEpKTtcbiAgICAgICAgbGV0IHRhcmdldFdpbmRvd0lkID0gZ3JvdXAudGFic1swXS53aW5kb3dJZDtcbiAgICAgICAgbGV0IG1heCA9IDA7XG4gICAgICAgIGZvciAoY29uc3QgW3dpZCwgY291bnRdIG9mIGNvdW50cykge1xuICAgICAgICAgIGlmIChjb3VudCA+IG1heCkgeyBtYXggPSBjb3VudDsgdGFyZ2V0V2luZG93SWQgPSB3aWQ7IH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE1vdmUgdGFicyBub3QgaW4gdGFyZ2V0XG4gICAgICAgIGNvbnN0IHRvTW92ZSA9IGdyb3VwLnRhYnMuZmlsdGVyKHQgPT4gdC53aW5kb3dJZCAhPT0gdGFyZ2V0V2luZG93SWQpLm1hcCh0ID0+IHQuaWQpO1xuICAgICAgICBpZiAodG9Nb3ZlLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMubW92ZSh0b01vdmUsIHsgd2luZG93SWQ6IHRhcmdldFdpbmRvd0lkLCBpbmRleDogLTEgfSk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgbG9nRXJyb3IoXCJFcnJvciBtb3ZpbmcgdGFicyBmb3IgY29tcG91bmQgZ3JvdXBcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0YWJzVG9Qcm9jZXNzLnB1c2goeyB3aW5kb3dJZDogdGFyZ2V0V2luZG93SWQsIHRhYnM6IGdyb3VwLnRhYnMgfSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIEN1cnJlbnQgbW9kZTogc3BsaXQgYnkgc291cmNlIHdpbmRvd1xuICAgICAgY29uc3QgbWFwID0gZ3JvdXAudGFicy5yZWR1Y2U8TWFwPG51bWJlciwgVGFiTWV0YWRhdGFbXT4+KChhY2MsIHRhYikgPT4ge1xuICAgICAgICBjb25zdCBleGlzdGluZyA9IGFjYy5nZXQodGFiLndpbmRvd0lkKSA/PyBbXTtcbiAgICAgICAgZXhpc3RpbmcucHVzaCh0YWIpO1xuICAgICAgICBhY2Muc2V0KHRhYi53aW5kb3dJZCwgZXhpc3RpbmcpO1xuICAgICAgICByZXR1cm4gYWNjO1xuICAgICAgfSwgbmV3IE1hcCgpKTtcbiAgICAgIGZvciAoY29uc3QgW3dpZCwgdF0gb2YgbWFwKSB7XG4gICAgICAgIHRhYnNUb1Byb2Nlc3MucHVzaCh7IHdpbmRvd0lkOiB3aWQsIHRhYnM6IHQgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCB7IHdpbmRvd0lkOiB0YXJnZXRXaW5JZCwgdGFicyB9IG9mIHRhYnNUb1Byb2Nlc3MpIHtcbiAgICAgIC8vIEZpbmQgY2FuZGlkYXRlIGdyb3VwIElEIHRvIHJldXNlXG4gICAgICBsZXQgY2FuZGlkYXRlR3JvdXBJZDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuICAgICAgY29uc3QgY291bnRzID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcj4oKTtcbiAgICAgIGZvciAoY29uc3QgdCBvZiB0YWJzKSB7XG4gICAgICAgIC8vIE9ubHkgY29uc2lkZXIgZ3JvdXBzIHRoYXQgd2VyZSBhbHJlYWR5IGluIHRoaXMgd2luZG93XG4gICAgICAgIGlmICh0Lmdyb3VwSWQgJiYgdC5ncm91cElkICE9PSAtMSAmJiB0LndpbmRvd0lkID09PSB0YXJnZXRXaW5JZCkge1xuICAgICAgICAgIGNvdW50cy5zZXQodC5ncm91cElkLCAoY291bnRzLmdldCh0Lmdyb3VwSWQpIHx8IDApICsgMSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gUHJpb3JpdGl6ZSB0aGUgbW9zdCBmcmVxdWVudCBncm91cCBJRCB0aGF0IGhhc24ndCBiZWVuIGNsYWltZWQgeWV0XG4gICAgICBjb25zdCBzb3J0ZWRDYW5kaWRhdGVzID0gQXJyYXkuZnJvbShjb3VudHMuZW50cmllcygpKVxuICAgICAgICAuc29ydCgoYSwgYikgPT4gYlsxXSAtIGFbMV0pXG4gICAgICAgIC5tYXAoKFtpZF0pID0+IGlkKTtcblxuICAgICAgZm9yIChjb25zdCBpZCBvZiBzb3J0ZWRDYW5kaWRhdGVzKSB7XG4gICAgICAgIGlmICghY2xhaW1lZEdyb3VwSWRzLmhhcyhpZCkpIHtcbiAgICAgICAgICBjYW5kaWRhdGVHcm91cElkID0gaWQ7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgbGV0IGZpbmFsR3JvdXBJZDogbnVtYmVyO1xuXG4gICAgICBpZiAoY2FuZGlkYXRlR3JvdXBJZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGNsYWltZWRHcm91cElkcy5hZGQoY2FuZGlkYXRlR3JvdXBJZCk7XG4gICAgICAgIGZpbmFsR3JvdXBJZCA9IGNhbmRpZGF0ZUdyb3VwSWQ7XG5cbiAgICAgICAgLy8gQ2xlYW4gdXAgbGVmdG92ZXJzIGFuZCBhZGQgbWlzc2luZyB0YWJzXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgZXhpc3RpbmdUYWJzID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoeyBncm91cElkOiBmaW5hbEdyb3VwSWQgfSk7XG4gICAgICAgICAgY29uc3QgZXhpc3RpbmdUYWJJZHMgPSBuZXcgU2V0KGV4aXN0aW5nVGFicy5tYXAodCA9PiB0LmlkKSk7XG4gICAgICAgICAgY29uc3QgdGFyZ2V0VGFiSWRzID0gbmV3IFNldCh0YWJzLm1hcCh0ID0+IHQuaWQpKTtcblxuICAgICAgICAgIC8vIDEuIFVuZ3JvdXAgdGFicyB0aGF0IHNob3VsZG4ndCBiZSBoZXJlXG4gICAgICAgICAgY29uc3QgbGVmdG92ZXJzID0gZXhpc3RpbmdUYWJzLmZpbHRlcih0ID0+IHQuaWQgIT09IHVuZGVmaW5lZCAmJiAhdGFyZ2V0VGFiSWRzLmhhcyh0LmlkKSk7XG4gICAgICAgICAgaWYgKGxlZnRvdmVycy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBhd2FpdCBjaHJvbWUudGFicy51bmdyb3VwKGxlZnRvdmVycy5tYXAodCA9PiB0LmlkISkpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIDIuIEFkZCBvbmx5IHRoZSB0YWJzIHRoYXQgYXJlbid0IGFscmVhZHkgaW4gdGhlIGdyb3VwXG4gICAgICAgICAgY29uc3QgdGFic1RvQWRkID0gdGFicy5maWx0ZXIodCA9PiAhZXhpc3RpbmdUYWJJZHMuaGFzKHQuaWQpKTtcbiAgICAgICAgICBpZiAodGFic1RvQWRkLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAvLyBGb3IgbmV3L2NvbXBvdW5kLCB0YWJzIG1pZ2h0IGhhdmUgYmVlbiBtb3ZlZCwgc28gd2UgbXVzdCBwYXNzIHRhYklkc1xuICAgICAgICAgICAgIGF3YWl0IGNocm9tZS50YWJzLmdyb3VwKHsgZ3JvdXBJZDogZmluYWxHcm91cElkLCB0YWJJZHM6IHRhYnNUb0FkZC5tYXAodCA9PiB0LmlkKSB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBsb2dFcnJvcihcIkVycm9yIG1hbmFnaW5nIGdyb3VwIHJldXNlXCIsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gQ3JlYXRlIG5ldyBncm91cCAoZGVmYXVsdCBiZWhhdmlvcjogZXhwYW5kZWQpXG4gICAgICAgIC8vIEVuc3VyZSB3ZSBjcmVhdGUgaXQgaW4gdGhlIHRhcmdldCB3aW5kb3cgKGlmIHN0cmljdGx5IG5ldywgdGFiSWRzIGltcGxpZXMgd2luZG93IGlmIHRoZXkgYXJlIGluIGl0KVxuICAgICAgICAvLyBJZiB0YWJzIHdlcmUganVzdCBtb3ZlZCwgdGhleSBhcmUgaW4gdGFyZ2V0V2luSWQuXG4gICAgICAgIC8vIGNocm9tZS50YWJzLmdyb3VwIHdpdGggdGFiSWRzIHdpbGwgaW5mZXIgd2luZG93IGZyb20gdGFicy5cbiAgICAgICAgZmluYWxHcm91cElkID0gYXdhaXQgY2hyb21lLnRhYnMuZ3JvdXAoe1xuICAgICAgICAgIHRhYklkczogdGFicy5tYXAodCA9PiB0LmlkKSxcbiAgICAgICAgICBjcmVhdGVQcm9wZXJ0aWVzOiB7IHdpbmRvd0lkOiB0YXJnZXRXaW5JZCB9XG4gICAgICAgIH0pO1xuICAgICAgICBjbGFpbWVkR3JvdXBJZHMuYWRkKGZpbmFsR3JvdXBJZCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHVwZGF0ZVByb3BzOiBjaHJvbWUudGFiR3JvdXBzLlVwZGF0ZVByb3BlcnRpZXMgPSB7XG4gICAgICAgIHRpdGxlOiBncm91cC5sYWJlbFxuICAgICAgfTtcbiAgICAgIGlmIChWQUxJRF9DT0xPUlMuaW5jbHVkZXMoZ3JvdXAuY29sb3IpKSB7XG4gICAgICAgICAgdXBkYXRlUHJvcHMuY29sb3IgPSBncm91cC5jb2xvciBhcyBjaHJvbWUudGFiR3JvdXBzLkNvbG9yRW51bTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IGNocm9tZS50YWJHcm91cHMudXBkYXRlKGZpbmFsR3JvdXBJZCwgdXBkYXRlUHJvcHMpO1xuICAgIH1cbiAgfVxuICBsb2dJbmZvKFwiQXBwbGllZCB0YWIgZ3JvdXBzXCIsIHsgY291bnQ6IGdyb3Vwcy5sZW5ndGggfSk7XG59O1xuXG5leHBvcnQgY29uc3QgYXBwbHlUYWJTb3J0aW5nID0gYXN5bmMgKFxuICBwcmVmZXJlbmNlczogUHJlZmVyZW5jZXMsXG4gIGZpbHRlcj86IEdyb3VwaW5nU2VsZWN0aW9uLFxuICBvblByb2dyZXNzPzogKGNvbXBsZXRlZDogbnVtYmVyLCB0b3RhbDogbnVtYmVyKSA9PiB2b2lkXG4pID0+IHtcbiAgY29uc3QgY2hyb21lVGFicyA9IGF3YWl0IGNocm9tZS50YWJzLnF1ZXJ5KHt9KTtcblxuICBjb25zdCB0YXJnZXRXaW5kb3dJZHMgPSBuZXcgU2V0PG51bWJlcj4oKTtcblxuICBpZiAoIWZpbHRlciB8fCAoIWZpbHRlci53aW5kb3dJZHM/Lmxlbmd0aCAmJiAhZmlsdGVyLnRhYklkcz8ubGVuZ3RoKSkge1xuICAgICAgY2hyb21lVGFicy5mb3JFYWNoKHQgPT4geyBpZiAodC53aW5kb3dJZCkgdGFyZ2V0V2luZG93SWRzLmFkZCh0LndpbmRvd0lkKTsgfSk7XG4gIH0gZWxzZSB7XG4gICAgICBmaWx0ZXIud2luZG93SWRzPy5mb3JFYWNoKGlkID0+IHRhcmdldFdpbmRvd0lkcy5hZGQoaWQpKTtcbiAgICAgIGlmIChmaWx0ZXIudGFiSWRzPy5sZW5ndGgpIHtcbiAgICAgICAgICBjb25zdCBpZHMgPSBuZXcgU2V0KGZpbHRlci50YWJJZHMpO1xuICAgICAgICAgIGNocm9tZVRhYnMuZm9yRWFjaCh0ID0+IHtcbiAgICAgICAgICAgICAgaWYgKHQuaWQgJiYgaWRzLmhhcyh0LmlkKSAmJiB0LndpbmRvd0lkKSB0YXJnZXRXaW5kb3dJZHMuYWRkKHQud2luZG93SWQpO1xuICAgICAgICAgIH0pO1xuICAgICAgfVxuICB9XG5cbiAgZm9yIChjb25zdCB3aW5kb3dJZCBvZiB0YXJnZXRXaW5kb3dJZHMpIHtcbiAgICAgIGNvbnN0IHdpbmRvd1RhYnMgPSBjaHJvbWVUYWJzLmZpbHRlcih0ID0+IHQud2luZG93SWQgPT09IHdpbmRvd0lkKTtcbiAgICAgIGNvbnN0IG1hcHBlZCA9IHdpbmRvd1RhYnMubWFwKG1hcENocm9tZVRhYikuZmlsdGVyKCh0KTogdCBpcyBUYWJNZXRhZGF0YSA9PiBCb29sZWFuKHQpKTtcblxuICAgICAgaWYgKHJlcXVpcmVzQ29udGV4dEFuYWx5c2lzKHByZWZlcmVuY2VzLnNvcnRpbmcpKSB7XG4gICAgICAgIGNvbnN0IGNvbnRleHRNYXAgPSBhd2FpdCBhbmFseXplVGFiQ29udGV4dChtYXBwZWQsIG9uUHJvZ3Jlc3MpO1xuICAgICAgICBtYXBwZWQuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgICAgIGNvbnN0IHJlcyA9IGNvbnRleHRNYXAuZ2V0KHRhYi5pZCk7XG4gICAgICAgICAgdGFiLmNvbnRleHQgPSByZXM/LmNvbnRleHQ7XG4gICAgICAgICAgdGFiLmNvbnRleHREYXRhID0gcmVzPy5kYXRhO1xuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgLy8gR3JvdXAgdGFicyBieSBncm91cElkIHRvIHNvcnQgd2l0aGluIGdyb3Vwc1xuICAgICAgY29uc3QgdGFic0J5R3JvdXAgPSBuZXcgTWFwPG51bWJlciwgVGFiTWV0YWRhdGFbXT4oKTtcbiAgICAgIGNvbnN0IHVuZ3JvdXBlZFRhYnM6IFRhYk1ldGFkYXRhW10gPSBbXTtcblxuICAgICAgbWFwcGVkLmZvckVhY2godGFiID0+IHtcbiAgICAgICAgY29uc3QgZ3JvdXBJZCA9IHRhYi5ncm91cElkID8/IC0xO1xuICAgICAgICBpZiAoZ3JvdXBJZCAhPT0gLTEpIHtcbiAgICAgICAgICBjb25zdCBncm91cCA9IHRhYnNCeUdyb3VwLmdldChncm91cElkKSA/PyBbXTtcbiAgICAgICAgICBncm91cC5wdXNoKHRhYik7XG4gICAgICAgICAgdGFic0J5R3JvdXAuc2V0KGdyb3VwSWQsIGdyb3VwKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB1bmdyb3VwZWRUYWJzLnB1c2godGFiKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vIDEuIFNvcnQgdGFicyB3aXRoaW4gZWFjaCBncm91cFxuICAgICAgZm9yIChjb25zdCBbZ3JvdXBJZCwgdGFic10gb2YgdGFic0J5R3JvdXApIHtcbiAgICAgICAgY29uc3QgZ3JvdXBUYWJJbmRpY2VzID0gd2luZG93VGFic1xuICAgICAgICAgIC5maWx0ZXIodCA9PiB0Lmdyb3VwSWQgPT09IGdyb3VwSWQpXG4gICAgICAgICAgLm1hcCh0ID0+IHQuaW5kZXgpXG4gICAgICAgICAgLnNvcnQoKGEsIGIpID0+IGEgLSBiKTtcblxuICAgICAgICBjb25zdCBzdGFydEluZGV4ID0gZ3JvdXBUYWJJbmRpY2VzWzBdID8/IDA7XG5cbiAgICAgICAgY29uc3Qgc29ydGVkR3JvdXBUYWJzID0gc29ydFRhYnModGFicywgcHJlZmVyZW5jZXMuc29ydGluZyk7XG4gICAgICAgIGNvbnN0IHNvcnRlZElkcyA9IHNvcnRlZEdyb3VwVGFicy5tYXAodCA9PiB0LmlkKTtcblxuICAgICAgICBpZiAoc29ydGVkSWRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMubW92ZShzb3J0ZWRJZHMsIHsgaW5kZXg6IHN0YXJ0SW5kZXggfSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gMi4gU29ydCB1bmdyb3VwZWQgdGFic1xuICAgICAgaWYgKHVuZ3JvdXBlZFRhYnMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCBzb3J0ZWRVbmdyb3VwZWQgPSBzb3J0VGFicyh1bmdyb3VwZWRUYWJzLCBwcmVmZXJlbmNlcy5zb3J0aW5nKTtcbiAgICAgICAgY29uc3Qgc29ydGVkSWRzID0gc29ydGVkVW5ncm91cGVkLm1hcCh0ID0+IHQuaWQpO1xuXG4gICAgICAgIC8vIE1vdmUgdG8gaW5kZXggMCAodG9wIG9mIHdpbmRvdylcbiAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMubW92ZShzb3J0ZWRJZHMsIHsgaW5kZXg6IDAgfSk7XG4gICAgICB9XG5cbiAgICAgIC8vIDMuIFNvcnQgR3JvdXBzIChpZiBlbmFibGVkKVxuICAgICAgYXdhaXQgc29ydEdyb3Vwc0lmRW5hYmxlZCh3aW5kb3dJZCwgcHJlZmVyZW5jZXMuc29ydGluZywgdGFic0J5R3JvdXApO1xuICB9XG4gIGxvZ0luZm8oXCJBcHBsaWVkIHRhYiBzb3J0aW5nXCIpO1xufTtcblxuY29uc3QgY29tcGFyZUJ5U29ydGluZ1J1bGVzID0gKHNvcnRpbmdSdWxlc0FyZzogU29ydGluZ1J1bGVbXSwgYTogVGFiTWV0YWRhdGEsIGI6IFRhYk1ldGFkYXRhKTogbnVtYmVyID0+IHtcbiAgY29uc3Qgc29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KHNvcnRpbmdSdWxlc0FyZyk7XG4gIGlmIChzb3J0UnVsZXNMaXN0Lmxlbmd0aCA9PT0gMCkgcmV0dXJuIDA7XG5cbiAgdHJ5IHtcbiAgICBmb3IgKGNvbnN0IHJ1bGUgb2Ygc29ydFJ1bGVzTGlzdCkge1xuICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHZhbEEgPSBnZXRGaWVsZFZhbHVlKGEsIHJ1bGUuZmllbGQpO1xuICAgICAgY29uc3QgdmFsQiA9IGdldEZpZWxkVmFsdWUoYiwgcnVsZS5maWVsZCk7XG5cbiAgICAgIGxldCByZXN1bHQgPSAwO1xuICAgICAgaWYgKHZhbEEgPCB2YWxCKSByZXN1bHQgPSAtMTtcbiAgICAgIGVsc2UgaWYgKHZhbEEgPiB2YWxCKSByZXN1bHQgPSAxO1xuXG4gICAgICBpZiAocmVzdWx0ICE9PSAwKSB7XG4gICAgICAgIHJldHVybiBydWxlLm9yZGVyID09PSBcImRlc2NcIiA/IC1yZXN1bHQgOiByZXN1bHQ7XG4gICAgICB9XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGxvZ0Vycm9yKFwiRXJyb3IgZXZhbHVhdGluZyBzb3J0aW5nIHJ1bGVzXCIsIHsgZXJyb3I6IFN0cmluZyhlcnJvcikgfSk7XG4gIH1cblxuICByZXR1cm4gMDtcbn07XG5cbmNvbnN0IHNvcnRHcm91cHNJZkVuYWJsZWQgPSBhc3luYyAoXG4gICAgd2luZG93SWQ6IG51bWJlcixcbiAgICBzb3J0aW5nUHJlZmVyZW5jZXM6IHN0cmluZ1tdLFxuICAgIHRhYnNCeUdyb3VwOiBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YVtdPlxuKSA9PiB7XG4gICAgLy8gQ2hlY2sgaWYgYW55IGFjdGl2ZSBzdHJhdGVneSBoYXMgc29ydEdyb3VwczogdHJ1ZVxuICAgIGNvbnN0IGN1c3RvbVN0cmF0cyA9IGdldEN1c3RvbVN0cmF0ZWdpZXMoKTtcbiAgICBsZXQgZ3JvdXBTb3J0ZXJTdHJhdGVneTogUmV0dXJuVHlwZTx0eXBlb2YgY3VzdG9tU3RyYXRzLmZpbmQ+IHwgbnVsbCA9IG51bGw7XG5cbiAgICBmb3IgKGNvbnN0IGlkIG9mIHNvcnRpbmdQcmVmZXJlbmNlcykge1xuICAgICAgICBjb25zdCBzdHJhdGVneSA9IGN1c3RvbVN0cmF0cy5maW5kKHMgPT4gcy5pZCA9PT0gaWQpO1xuICAgICAgICBpZiAoc3RyYXRlZ3kgJiYgKHN0cmF0ZWd5LnNvcnRHcm91cHMgfHwgKHN0cmF0ZWd5Lmdyb3VwU29ydGluZ1J1bGVzICYmIHN0cmF0ZWd5Lmdyb3VwU29ydGluZ1J1bGVzLmxlbmd0aCA+IDApKSkge1xuICAgICAgICAgICAgZ3JvdXBTb3J0ZXJTdHJhdGVneSA9IHN0cmF0ZWd5O1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoIWdyb3VwU29ydGVyU3RyYXRlZ3kpIHJldHVybjtcblxuICAgIC8vIEdldCBncm91cCBkZXRhaWxzXG4gICAgY29uc3QgZ3JvdXBzID0gYXdhaXQgY2hyb21lLnRhYkdyb3Vwcy5xdWVyeSh7IHdpbmRvd0lkIH0pO1xuICAgIGlmIChncm91cHMubGVuZ3RoIDw9IDEpIHJldHVybjtcblxuICAgIC8vIFdlIHNvcnQgZ3JvdXBzIGJhc2VkIG9uIHRoZSBzdHJhdGVneS5cbiAgICAvLyBTaW5jZSBjb21wYXJlQnkgZXhwZWN0cyBUYWJNZXRhZGF0YSwgd2UgbmVlZCB0byBjcmVhdGUgYSByZXByZXNlbnRhdGl2ZSBUYWJNZXRhZGF0YSBmb3IgZWFjaCBncm91cC5cbiAgICAvLyBXZSdsbCB1c2UgdGhlIGZpcnN0IHRhYiBvZiB0aGUgZ3JvdXAgKHNvcnRlZCkgYXMgdGhlIHJlcHJlc2VudGF0aXZlLlxuXG4gICAgY29uc3QgZ3JvdXBSZXBzOiB7IGdyb3VwOiBjaHJvbWUudGFiR3JvdXBzLlRhYkdyb3VwOyByZXA6IFRhYk1ldGFkYXRhIH1bXSA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBncm91cCBvZiBncm91cHMpIHtcbiAgICAgICAgY29uc3QgdGFicyA9IHRhYnNCeUdyb3VwLmdldChncm91cC5pZCk7XG4gICAgICAgIGlmICh0YWJzICYmIHRhYnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgLy8gdGFicyBhcmUgYWxyZWFkeSBzb3J0ZWQgYnkgc29ydFRhYnMgaW4gcHJldmlvdXMgc3RlcCBpZiB0aGF0IHN0cmF0ZWd5IHdhcyBhcHBsaWVkXG4gICAgICAgICAgICAvLyBvciB3ZSBqdXN0IHRha2UgdGhlIGZpcnN0IG9uZS5cbiAgICAgICAgICAgIC8vIElkZWFsbHkgd2UgdXNlIHRoZSBcImJlc3RcIiB0YWIuXG4gICAgICAgICAgICAvLyBCdXQgc2luY2Ugd2UgYWxyZWFkeSBzb3J0ZWQgdGFicyB3aXRoaW4gZ3JvdXBzLCB0YWJzWzBdIGlzIHRoZSBmaXJzdCBvbmUuXG4gICAgICAgICAgICBncm91cFJlcHMucHVzaCh7IGdyb3VwLCByZXA6IHRhYnNbMF0gfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBTb3J0IHRoZSBncm91cHNcbiAgICBpZiAoZ3JvdXBTb3J0ZXJTdHJhdGVneS5ncm91cFNvcnRpbmdSdWxlcyAmJiBBcnJheS5pc0FycmF5KGdyb3VwU29ydGVyU3RyYXRlZ3kuZ3JvdXBTb3J0aW5nUnVsZXMpICYmIGdyb3VwU29ydGVyU3RyYXRlZ3kuZ3JvdXBTb3J0aW5nUnVsZXMubGVuZ3RoID4gMCkge1xuICAgICAgICBncm91cFJlcHMuc29ydCgoYSwgYikgPT4gY29tcGFyZUJ5U29ydGluZ1J1bGVzKGdyb3VwU29ydGVyU3RyYXRlZ3khLmdyb3VwU29ydGluZ1J1bGVzISwgYS5yZXAsIGIucmVwKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgZ3JvdXBSZXBzLnNvcnQoKGEsIGIpID0+IGNvbXBhcmVCeShncm91cFNvcnRlclN0cmF0ZWd5IS5pZCwgYS5yZXAsIGIucmVwKSk7XG4gICAgfVxuXG4gICAgLy8gQXBwbHkgdGhlIG9yZGVyXG4gICAgLy8gY2hyb21lLnRhYkdyb3Vwcy5tb3ZlKGdyb3VwSWQsIHsgaW5kZXg6IC4uLiB9KVxuICAgIC8vIFdlIHdhbnQgdGhlbSB0byBiZSBhZnRlciB1bmdyb3VwZWQgdGFicyAod2hpY2ggYXJlIGF0IGluZGV4IDAuLk4pLlxuICAgIC8vIEFjdHVhbGx5LCBjaHJvbWUudGFiR3JvdXBzLm1vdmUgaW5kZXggaXMgdGhlIHRhYiBpbmRleCB3aGVyZSB0aGUgZ3JvdXAgc3RhcnRzLlxuICAgIC8vIElmIHdlIHdhbnQgdG8gc3RyaWN0bHkgb3JkZXIgZ3JvdXBzLCB3ZSBzaG91bGQgY2FsY3VsYXRlIHRoZSB0YXJnZXQgaW5kZXguXG4gICAgLy8gQnV0IHNpbmNlIGdyb3VwcyBhcmUgY29udGlndW91cyBibG9ja3Mgb2YgdGFicywgd2UganVzdCBuZWVkIHRvIHBsYWNlIHRoZW0gaW4gb3JkZXIuXG5cbiAgICAvLyBDYWxjdWxhdGUgdGhlIHN0YXJ0aW5nIGluZGV4IGZvciBncm91cHMuXG4gICAgLy8gVW5ncm91cGVkIHRhYnMgYXJlIGF0IHRoZSBzdGFydCAoaW5kZXggMCkuXG4gICAgLy8gU28gdGhlIGZpcnN0IGdyb3VwIHNob3VsZCBzdGFydCBhZnRlciB0aGUgbGFzdCB1bmdyb3VwZWQgdGFiLlxuICAgIC8vIFdhaXQsIGVhcmxpZXIgd2UgbW92ZWQgdW5ncm91cGVkIHRhYnMgdG8gaW5kZXggMC5cbiAgICAvLyBCdXQgd2UgbmVlZCB0byBrbm93IGhvdyBtYW55IHVuZ3JvdXBlZCB0YWJzIHRoZXJlIGFyZSBpbiB0aGlzIHdpbmRvdy5cblxuICAgIC8vIExldCdzIGdldCBjdXJyZW50IHRhYnMgYWdhaW4gb3IgdHJhY2sgY291bnQ/XG4gICAgLy8gV2UgY2FuIGFzc3VtZSB1bmdyb3VwZWQgdGFicyBhcmUgYXQgdGhlIHRvcC5cbiAgICAvLyBCdXQgYHRhYnNCeUdyb3VwYCBvbmx5IGNvbnRhaW5zIGdyb3VwZWQgdGFicy5cbiAgICAvLyBXZSBuZWVkIHRvIGtub3cgd2hlcmUgdG8gc3RhcnQgcGxhY2luZyBncm91cHMuXG4gICAgLy8gVGhlIHNhZmVzdCB3YXkgaXMgdG8gbW92ZSB0aGVtIG9uZSBieSBvbmUgdG8gdGhlIGVuZCAob3Igc3BlY2lmaWMgaW5kZXgpLlxuXG4gICAgLy8gSWYgd2UganVzdCBtb3ZlIHRoZW0gaW4gb3JkZXIgdG8gaW5kZXggLTEsIHRoZXkgd2lsbCBhcHBlbmQgdG8gdGhlIGVuZC5cbiAgICAvLyBJZiB3ZSB3YW50IHRoZW0gYWZ0ZXIgdW5ncm91cGVkIHRhYnMsIHdlIG5lZWQgdG8gZmluZCB0aGUgaW5kZXguXG5cbiAgICAvLyBMZXQncyB1c2UgaW5kZXggPSAtMSB0byBwdXNoIHRvIGVuZCwgc2VxdWVudGlhbGx5LlxuICAgIC8vIEJ1dCB3YWl0LCBpZiB3ZSBwdXNoIHRvIGVuZCwgdGhlIG9yZGVyIGlzIHByZXNlcnZlZD9cbiAgICAvLyBObywgaWYgd2UgaXRlcmF0ZSBzb3J0ZWQgZ3JvdXBzIGFuZCBtb3ZlIGVhY2ggdG8gLTEsIHRoZSBsYXN0IG9uZSBtb3ZlZCB3aWxsIGJlIGF0IHRoZSBlbmQuXG4gICAgLy8gU28gd2Ugc2hvdWxkIGl0ZXJhdGUgaW4gb3JkZXIgYW5kIG1vdmUgdG8gLTE/IE5vLCB0aGF0IHdvdWxkIHJldmVyc2UgdGhlbSBpZiB3ZSBjb25zaWRlciBcImVuZFwiLlxuICAgIC8vIEFjdHVhbGx5LCBpZiB3ZSBtb3ZlIEdyb3VwIEEgdG8gLTEsIGl0IGdvZXMgdG8gZW5kLiBUaGVuIEdyb3VwIEIgdG8gLTEsIGl0IGdvZXMgYWZ0ZXIgQS5cbiAgICAvLyBTbyBpdGVyYXRpbmcgaW4gc29ydGVkIG9yZGVyIGFuZCBtb3ZpbmcgdG8gLTEgd29ya3MgdG8gYXJyYW5nZSB0aGVtIGF0IHRoZSBlbmQgb2YgdGhlIHdpbmRvdy5cblxuICAgIC8vIEhvd2V2ZXIsIGlmIHRoZXJlIGFyZSBwaW5uZWQgdGFicyBvciB1bmdyb3VwZWQgdGFicywgdGhleSBzaG91bGQgc3RheSBhdCB0b3A/XG4gICAgLy8gVW5ncm91cGVkIHRhYnMgd2VyZSBtb3ZlZCB0byBpbmRleCAwLlxuICAgIC8vIFBpbm5lZCB0YWJzOiBgY2hyb21lLnRhYnMubW92ZWAgaGFuZGxlcyBwaW5uZWQgY29uc3RyYWludCAocGlubmVkIHRhYnMgbXVzdCBiZSBmaXJzdCkuXG4gICAgLy8gR3JvdXBzIGNhbm5vdCBjb250YWluIHBpbm5lZCB0YWJzLlxuICAgIC8vIFNvIGdyb3VwcyB3aWxsIGJlIGFmdGVyIHBpbm5lZCB0YWJzLlxuICAgIC8vIElmIHdlIG1vdmUgdG8gLTEsIHRoZXkgZ28gdG8gdGhlIHZlcnkgZW5kLlxuXG4gICAgLy8gV2hhdCBpZiB3ZSB3YW50IHRoZW0gc3BlY2lmaWNhbGx5IGFycmFuZ2VkP1xuICAgIC8vIElmIHdlIG1vdmUgdGhlbSBzZXF1ZW50aWFsbHkgdG8gLTEsIHRoZXkgd2lsbCBiZSBvcmRlcmVkIEEsIEIsIEMuLi4gYXQgdGhlIGJvdHRvbS5cbiAgICAvLyBUaGlzIHNlZW1zIGNvcnJlY3QgZm9yIFwic29ydGluZyBncm91cHNcIi5cblxuICAgIGZvciAoY29uc3QgaXRlbSBvZiBncm91cFJlcHMpIHtcbiAgICAgICAgYXdhaXQgY2hyb21lLnRhYkdyb3Vwcy5tb3ZlKGl0ZW0uZ3JvdXAuaWQsIHsgaW5kZXg6IC0xIH0pO1xuICAgIH1cbn07XG5cbmV4cG9ydCBjb25zdCBjbG9zZUdyb3VwID0gYXN5bmMgKGdyb3VwOiBUYWJHcm91cCkgPT4ge1xuICBjb25zdCBpZHMgPSBncm91cC50YWJzLm1hcCgodGFiKSA9PiB0YWIuaWQpO1xuICBhd2FpdCBjaHJvbWUudGFicy5yZW1vdmUoaWRzKTtcbiAgbG9nSW5mbyhcIkNsb3NlZCBncm91cFwiLCB7IGxhYmVsOiBncm91cC5sYWJlbCwgY291bnQ6IGlkcy5sZW5ndGggfSk7XG59O1xuXG5leHBvcnQgY29uc3QgbWVyZ2VUYWJzID0gYXN5bmMgKHRhYklkczogbnVtYmVyW10pID0+IHtcbiAgaWYgKCF0YWJJZHMubGVuZ3RoKSByZXR1cm47XG4gIGNvbnN0IHRhYnMgPSBhd2FpdCBQcm9taXNlLmFsbCh0YWJJZHMubWFwKGlkID0+IGNocm9tZS50YWJzLmdldChpZCkuY2F0Y2goKCkgPT4gbnVsbCkpKTtcbiAgY29uc3QgdmFsaWRUYWJzID0gdGFicy5maWx0ZXIoKHQpOiB0IGlzIGNocm9tZS50YWJzLlRhYiA9PiB0ICE9PSBudWxsICYmIHQuaWQgIT09IHVuZGVmaW5lZCAmJiB0LndpbmRvd0lkICE9PSB1bmRlZmluZWQpO1xuXG4gIGlmICh2YWxpZFRhYnMubGVuZ3RoID09PSAwKSByZXR1cm47XG5cbiAgLy8gVGFyZ2V0IFdpbmRvdzogVGhlIG9uZSB3aXRoIHRoZSBtb3N0IHNlbGVjdGVkIHRhYnMsIG9yIHRoZSBmaXJzdCBvbmUuXG4gIC8vIFVzaW5nIHRoZSBmaXJzdCB0YWIncyB3aW5kb3cgYXMgdGhlIHRhcmdldC5cbiAgY29uc3QgdGFyZ2V0V2luZG93SWQgPSB2YWxpZFRhYnNbMF0ud2luZG93SWQ7XG5cbiAgLy8gMS4gTW92ZSB0YWJzIHRvIHRhcmdldCB3aW5kb3dcbiAgY29uc3QgdGFic1RvTW92ZSA9IHZhbGlkVGFicy5maWx0ZXIodCA9PiB0LndpbmRvd0lkICE9PSB0YXJnZXRXaW5kb3dJZCk7XG4gIGlmICh0YWJzVG9Nb3ZlLmxlbmd0aCA+IDApIHtcbiAgICBjb25zdCBtb3ZlSWRzID0gdGFic1RvTW92ZS5tYXAodCA9PiB0LmlkISk7XG4gICAgYXdhaXQgY2hyb21lLnRhYnMubW92ZShtb3ZlSWRzLCB7IHdpbmRvd0lkOiB0YXJnZXRXaW5kb3dJZCwgaW5kZXg6IC0xIH0pO1xuICB9XG5cbiAgLy8gMi4gR3JvdXAgdGhlbVxuICAvLyBDaGVjayBpZiB0aGVyZSBpcyBhbiBleGlzdGluZyBncm91cCBpbiB0aGUgdGFyZ2V0IHdpbmRvdyB0aGF0IHdhcyBwYXJ0IG9mIHRoZSBzZWxlY3Rpb24uXG4gIC8vIFdlIHByaW9yaXRpemUgdGhlIGdyb3VwIG9mIHRoZSBmaXJzdCB0YWIgaWYgaXQgaGFzIG9uZS5cbiAgY29uc3QgZmlyc3RUYWJHcm91cElkID0gdmFsaWRUYWJzWzBdLmdyb3VwSWQ7XG4gIGxldCB0YXJnZXRHcm91cElkOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cbiAgaWYgKGZpcnN0VGFiR3JvdXBJZCAmJiBmaXJzdFRhYkdyb3VwSWQgIT09IC0xKSB7XG4gICAgICAvLyBWZXJpZnkgdGhlIGdyb3VwIGlzIGluIHRoZSB0YXJnZXQgd2luZG93IChpdCBzaG91bGQgYmUsIGFzIHdlIHBpY2tlZCB0YXJnZXRXaW5kb3dJZCBmcm9tIHZhbGlkVGFic1swXSlcbiAgICAgIC8vIEJ1dCBpZiB2YWxpZFRhYnNbMF0gd2FzIG1vdmVkIChpdCB3YXNuJ3QsIGFzIGl0IGRlZmluZWQgdGhlIHRhcmdldCksIGl0J3MgZmluZS5cbiAgICAgIHRhcmdldEdyb3VwSWQgPSBmaXJzdFRhYkdyb3VwSWQ7XG4gIH0gZWxzZSB7XG4gICAgICAvLyBMb29rIGZvciBhbnkgb3RoZXIgZ3JvdXAgaW4gdGhlIHNlbGVjdGlvbiB0aGF0IGlzIGluIHRoZSB0YXJnZXQgd2luZG93XG4gICAgICBjb25zdCBvdGhlckdyb3VwID0gdmFsaWRUYWJzLmZpbmQodCA9PiB0LndpbmRvd0lkID09PSB0YXJnZXRXaW5kb3dJZCAmJiB0Lmdyb3VwSWQgIT09IC0xKTtcbiAgICAgIGlmIChvdGhlckdyb3VwKSB7XG4gICAgICAgICAgdGFyZ2V0R3JvdXBJZCA9IG90aGVyR3JvdXAuZ3JvdXBJZDtcbiAgICAgIH1cbiAgfVxuXG4gIGNvbnN0IGlkcyA9IHZhbGlkVGFicy5tYXAodCA9PiB0LmlkISk7XG4gIGF3YWl0IGNocm9tZS50YWJzLmdyb3VwKHsgdGFiSWRzOiBpZHMsIGdyb3VwSWQ6IHRhcmdldEdyb3VwSWQgfSk7XG4gIGxvZ0luZm8oXCJNZXJnZWQgdGFic1wiLCB7IGNvdW50OiBpZHMubGVuZ3RoLCB0YXJnZXRXaW5kb3dJZCwgdGFyZ2V0R3JvdXBJZCB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBzcGxpdFRhYnMgPSBhc3luYyAodGFiSWRzOiBudW1iZXJbXSkgPT4ge1xuICBpZiAodGFiSWRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuXG4gIC8vIDEuIFZhbGlkYXRlIHRhYnNcbiAgY29uc3QgdGFicyA9IGF3YWl0IFByb21pc2UuYWxsKHRhYklkcy5tYXAoaWQgPT4gY2hyb21lLnRhYnMuZ2V0KGlkKS5jYXRjaCgoKSA9PiBudWxsKSkpO1xuICBjb25zdCB2YWxpZFRhYnMgPSB0YWJzLmZpbHRlcigodCk6IHQgaXMgY2hyb21lLnRhYnMuVGFiID0+IHQgIT09IG51bGwgJiYgdC5pZCAhPT0gdW5kZWZpbmVkICYmIHQud2luZG93SWQgIT09IHVuZGVmaW5lZCk7XG5cbiAgaWYgKHZhbGlkVGFicy5sZW5ndGggPT09IDApIHJldHVybjtcblxuICAvLyAyLiBDcmVhdGUgbmV3IHdpbmRvdyB3aXRoIHRoZSBmaXJzdCB0YWJcbiAgY29uc3QgZmlyc3RUYWIgPSB2YWxpZFRhYnNbMF07XG4gIGNvbnN0IG5ld1dpbmRvdyA9IGF3YWl0IGNocm9tZS53aW5kb3dzLmNyZWF0ZSh7IHRhYklkOiBmaXJzdFRhYi5pZCB9KTtcblxuICAvLyAzLiBNb3ZlIHJlbWFpbmluZyB0YWJzIHRvIG5ldyB3aW5kb3dcbiAgaWYgKHZhbGlkVGFicy5sZW5ndGggPiAxKSB7XG4gICAgY29uc3QgcmVtYWluaW5nVGFiSWRzID0gdmFsaWRUYWJzLnNsaWNlKDEpLm1hcCh0ID0+IHQuaWQhKTtcbiAgICBhd2FpdCBjaHJvbWUudGFicy5tb3ZlKHJlbWFpbmluZ1RhYklkcywgeyB3aW5kb3dJZDogbmV3V2luZG93LmlkISwgaW5kZXg6IC0xIH0pO1xuICB9XG5cbiAgbG9nSW5mbyhcIlNwbGl0IHRhYnMgdG8gbmV3IHdpbmRvd1wiLCB7IGNvdW50OiB2YWxpZFRhYnMubGVuZ3RoLCBuZXdXaW5kb3dJZDogbmV3V2luZG93LmlkIH0pO1xufTtcbiIsICJpbXBvcnQgeyBVbmRvU3RhdGUsIFNhdmVkU3RhdGUsIFdpbmRvd1N0YXRlLCBTdG9yZWRUYWJTdGF0ZSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGdldFN0b3JlZFZhbHVlLCBzZXRTdG9yZWRWYWx1ZSB9IGZyb20gXCIuL3N0b3JhZ2UuanNcIjtcbmltcG9ydCB7IGxvZ0luZm8sIGxvZ0Vycm9yIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcblxuY29uc3QgTUFYX1VORE9fU1RBQ0sgPSAxMDtcbmNvbnN0IFVORE9fU1RBQ0tfS0VZID0gXCJ1bmRvU3RhY2tcIjtcbmNvbnN0IFNBVkVEX1NUQVRFU19LRVkgPSBcInNhdmVkU3RhdGVzXCI7XG5cbmV4cG9ydCBjb25zdCBjYXB0dXJlQ3VycmVudFN0YXRlID0gYXN5bmMgKCk6IFByb21pc2U8VW5kb1N0YXRlPiA9PiB7XG4gIGNvbnN0IHdpbmRvd3MgPSBhd2FpdCBjaHJvbWUud2luZG93cy5nZXRBbGwoeyBwb3B1bGF0ZTogdHJ1ZSB9KTtcbiAgY29uc3Qgd2luZG93U3RhdGVzOiBXaW5kb3dTdGF0ZVtdID0gW107XG5cbiAgZm9yIChjb25zdCB3aW4gb2Ygd2luZG93cykge1xuICAgIGlmICghd2luLnRhYnMpIGNvbnRpbnVlO1xuICAgIGNvbnN0IHRhYlN0YXRlczogU3RvcmVkVGFiU3RhdGVbXSA9IHdpbi50YWJzLm1hcCgodGFiKSA9PiB7XG4gICAgICBsZXQgZ3JvdXBUaXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgbGV0IGdyb3VwQ29sb3I6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgIC8vIE5vdGU6IHRhYi5ncm91cElkIGlzIC0xIGlmIG5vdCBncm91cGVkLlxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgaWQ6IHRhYi5pZCxcbiAgICAgICAgdXJsOiB0YWIudXJsIHx8IFwiXCIsXG4gICAgICAgIHBpbm5lZDogQm9vbGVhbih0YWIucGlubmVkKSxcbiAgICAgICAgZ3JvdXBJZDogdGFiLmdyb3VwSWQsXG4gICAgICAgIGdyb3VwVGl0bGUsIC8vIFdpbGwgbmVlZCB0byBmZXRjaCBpZiBncm91cGVkXG4gICAgICAgIGdyb3VwQ29sb3IsXG4gICAgICB9O1xuICAgIH0pO1xuXG4gICAgLy8gUG9wdWxhdGUgZ3JvdXAgaW5mbyBpZiBuZWVkZWRcbiAgICAvLyBXZSBkbyB0aGlzIGluIGEgc2Vjb25kIHBhc3MgdG8gYmF0Y2ggb3IganVzdCBpbmRpdmlkdWFsbHkgaWYgbmVlZGVkLlxuICAgIC8vIEFjdHVhbGx5LCB3ZSBjYW4gZ2V0IGdyb3VwIGluZm8gZnJvbSBjaHJvbWUudGFiR3JvdXBzLlxuICAgIC8vIEhvd2V2ZXIsIHRoZSB0YWIgb2JqZWN0IGRvZXNuJ3QgaGF2ZSB0aGUgZ3JvdXAgdGl0bGUgZGlyZWN0bHkuXG5cbiAgICAvLyBPcHRpbWl6YXRpb246IEdldCBhbGwgZ3JvdXBzIGZpcnN0LlxuXG4gICAgd2luZG93U3RhdGVzLnB1c2goeyB0YWJzOiB0YWJTdGF0ZXMgfSk7XG4gIH1cblxuICAvLyBFbnJpY2ggd2l0aCBncm91cCBpbmZvXG4gIGNvbnN0IGFsbEdyb3VwcyA9IGF3YWl0IGNocm9tZS50YWJHcm91cHMucXVlcnkoe30pO1xuICBjb25zdCBncm91cE1hcCA9IG5ldyBNYXAoYWxsR3JvdXBzLm1hcChnID0+IFtnLmlkLCBnXSkpO1xuXG4gIGZvciAoY29uc3Qgd2luIG9mIHdpbmRvd1N0YXRlcykge1xuICAgIGZvciAoY29uc3QgdGFiIG9mIHdpbi50YWJzKSB7XG4gICAgICBpZiAodGFiLmdyb3VwSWQgJiYgdGFiLmdyb3VwSWQgIT09IGNocm9tZS50YWJHcm91cHMuVEFCX0dST1VQX0lEX05PTkUpIHtcbiAgICAgICAgY29uc3QgZyA9IGdyb3VwTWFwLmdldCh0YWIuZ3JvdXBJZCk7XG4gICAgICAgIGlmIChnKSB7XG4gICAgICAgICAgdGFiLmdyb3VwVGl0bGUgPSBnLnRpdGxlO1xuICAgICAgICAgIHRhYi5ncm91cENvbG9yID0gZy5jb2xvcjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxuICAgIHdpbmRvd3M6IHdpbmRvd1N0YXRlcyxcbiAgfTtcbn07XG5cbmV4cG9ydCBjb25zdCBwdXNoVW5kb1N0YXRlID0gYXN5bmMgKCkgPT4ge1xuICBjb25zdCBzdGF0ZSA9IGF3YWl0IGNhcHR1cmVDdXJyZW50U3RhdGUoKTtcbiAgY29uc3Qgc3RhY2sgPSAoYXdhaXQgZ2V0U3RvcmVkVmFsdWU8VW5kb1N0YXRlW10+KFVORE9fU1RBQ0tfS0VZKSkgfHwgW107XG4gIHN0YWNrLnB1c2goc3RhdGUpO1xuICBpZiAoc3RhY2subGVuZ3RoID4gTUFYX1VORE9fU1RBQ0spIHtcbiAgICBzdGFjay5zaGlmdCgpO1xuICB9XG4gIGF3YWl0IHNldFN0b3JlZFZhbHVlKFVORE9fU1RBQ0tfS0VZLCBzdGFjayk7XG4gIGxvZ0luZm8oXCJQdXNoZWQgdW5kbyBzdGF0ZVwiLCB7IHN0YWNrU2l6ZTogc3RhY2subGVuZ3RoIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IHNhdmVTdGF0ZSA9IGFzeW5jIChuYW1lOiBzdHJpbmcpID0+IHtcbiAgY29uc3QgdW5kb1N0YXRlID0gYXdhaXQgY2FwdHVyZUN1cnJlbnRTdGF0ZSgpO1xuICBjb25zdCBzYXZlZFN0YXRlOiBTYXZlZFN0YXRlID0ge1xuICAgIG5hbWUsXG4gICAgdGltZXN0YW1wOiB1bmRvU3RhdGUudGltZXN0YW1wLFxuICAgIHdpbmRvd3M6IHVuZG9TdGF0ZS53aW5kb3dzLFxuICB9O1xuICBjb25zdCBzYXZlZFN0YXRlcyA9IChhd2FpdCBnZXRTdG9yZWRWYWx1ZTxTYXZlZFN0YXRlW10+KFNBVkVEX1NUQVRFU19LRVkpKSB8fCBbXTtcbiAgc2F2ZWRTdGF0ZXMucHVzaChzYXZlZFN0YXRlKTtcbiAgYXdhaXQgc2V0U3RvcmVkVmFsdWUoU0FWRURfU1RBVEVTX0tFWSwgc2F2ZWRTdGF0ZXMpO1xuICBsb2dJbmZvKFwiU2F2ZWQgc3RhdGVcIiwgeyBuYW1lIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IGdldFNhdmVkU3RhdGVzID0gYXN5bmMgKCk6IFByb21pc2U8U2F2ZWRTdGF0ZVtdPiA9PiB7XG4gIHJldHVybiAoYXdhaXQgZ2V0U3RvcmVkVmFsdWU8U2F2ZWRTdGF0ZVtdPihTQVZFRF9TVEFURVNfS0VZKSkgfHwgW107XG59O1xuXG5leHBvcnQgY29uc3QgZGVsZXRlU2F2ZWRTdGF0ZSA9IGFzeW5jIChuYW1lOiBzdHJpbmcpID0+IHtcbiAgbGV0IHNhdmVkU3RhdGVzID0gKGF3YWl0IGdldFN0b3JlZFZhbHVlPFNhdmVkU3RhdGVbXT4oU0FWRURfU1RBVEVTX0tFWSkpIHx8IFtdO1xuICBzYXZlZFN0YXRlcyA9IHNhdmVkU3RhdGVzLmZpbHRlcihzID0+IHMubmFtZSAhPT0gbmFtZSk7XG4gIGF3YWl0IHNldFN0b3JlZFZhbHVlKFNBVkVEX1NUQVRFU19LRVksIHNhdmVkU3RhdGVzKTtcbiAgbG9nSW5mbyhcIkRlbGV0ZWQgc2F2ZWQgc3RhdGVcIiwgeyBuYW1lIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IHVuZG8gPSBhc3luYyAoKSA9PiB7XG4gIGNvbnN0IHN0YWNrID0gKGF3YWl0IGdldFN0b3JlZFZhbHVlPFVuZG9TdGF0ZVtdPihVTkRPX1NUQUNLX0tFWSkpIHx8IFtdO1xuICBjb25zdCBzdGF0ZSA9IHN0YWNrLnBvcCgpO1xuICBpZiAoIXN0YXRlKSB7XG4gICAgbG9nSW5mbyhcIlVuZG8gc3RhY2sgZW1wdHlcIik7XG4gICAgcmV0dXJuO1xuICB9XG4gIGF3YWl0IHNldFN0b3JlZFZhbHVlKFVORE9fU1RBQ0tfS0VZLCBzdGFjayk7XG4gIGF3YWl0IHJlc3RvcmVTdGF0ZShzdGF0ZSk7XG4gIGxvZ0luZm8oXCJVbmRpZCBsYXN0IGFjdGlvblwiKTtcbn07XG5cbmV4cG9ydCBjb25zdCByZXN0b3JlU3RhdGUgPSBhc3luYyAoc3RhdGU6IFVuZG9TdGF0ZSB8IFNhdmVkU3RhdGUpID0+IHtcbiAgLy8gU3RyYXRlZ3k6XG4gIC8vIDEuIFVuZ3JvdXAgYWxsIHRhYnMgKG9wdGlvbmFsLCBidXQgY2xlYW5lcikuXG4gIC8vIDIuIE1vdmUgdGFicyB0byBjb3JyZWN0IHdpbmRvd3MgYW5kIGluZGljZXMuXG4gIC8vIDMuIFJlLWdyb3VwIHRhYnMuXG5cbiAgLy8gV2UgbmVlZCB0byBtYXRjaCBjdXJyZW50IHRhYnMgdG8gc3RvcmVkIHRhYnMuXG4gIC8vIFByaW9yaXR5OiBJRCBtYXRjaCAtPiBVUkwgbWF0Y2guXG5cbiAgY29uc3QgY3VycmVudFRhYnMgPSBhd2FpdCBjaHJvbWUudGFicy5xdWVyeSh7fSk7XG4gIGNvbnN0IGN1cnJlbnRUYWJNYXAgPSBuZXcgTWFwPG51bWJlciwgY2hyb21lLnRhYnMuVGFiPigpO1xuICBjb25zdCBjdXJyZW50VXJsTWFwID0gbmV3IE1hcDxzdHJpbmcsIGNocm9tZS50YWJzLlRhYltdPigpOyAvLyBVUkwgLT4gbGlzdCBvZiB0YWJzXG5cbiAgY3VycmVudFRhYnMuZm9yRWFjaCh0ID0+IHtcbiAgICBpZiAodC5pZCkgY3VycmVudFRhYk1hcC5zZXQodC5pZCwgdCk7XG4gICAgaWYgKHQudXJsKSB7XG4gICAgICBjb25zdCBsaXN0ID0gY3VycmVudFVybE1hcC5nZXQodC51cmwpIHx8IFtdO1xuICAgICAgbGlzdC5wdXNoKHQpO1xuICAgICAgY3VycmVudFVybE1hcC5zZXQodC51cmwsIGxpc3QpO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gSGVscGVyIHRvIGZpbmQgYSB0YWIgKGFzeW5jIHRvIGFsbG93IGNyZWF0aW9uKVxuICBjb25zdCBmaW5kT3JDcmVhdGVUYWIgPSBhc3luYyAoc3RvcmVkOiBTdG9yZWRUYWJTdGF0ZSk6IFByb21pc2U8Y2hyb21lLnRhYnMuVGFiIHwgdW5kZWZpbmVkPiA9PiB7XG4gICAgLy8gVHJ5IElEXG4gICAgaWYgKHN0b3JlZC5pZCAmJiBjdXJyZW50VGFiTWFwLmhhcyhzdG9yZWQuaWQpKSB7XG4gICAgICBjb25zdCB0ID0gY3VycmVudFRhYk1hcC5nZXQoc3RvcmVkLmlkKTtcbiAgICAgIGN1cnJlbnRUYWJNYXAuZGVsZXRlKHN0b3JlZC5pZCEpOyAvLyBDb25zdW1lXG4gICAgICAvLyBBbHNvIHJlbW92ZSBmcm9tIHVybCBtYXAgdG8gYXZvaWQgZG91YmxlIHVzYWdlXG4gICAgICBpZiAodD8udXJsKSB7XG4gICAgICAgICBjb25zdCBsaXN0ID0gY3VycmVudFVybE1hcC5nZXQodC51cmwpO1xuICAgICAgICAgaWYgKGxpc3QpIHtcbiAgICAgICAgICAgIGNvbnN0IGlkeCA9IGxpc3QuZmluZEluZGV4KHggPT4geC5pZCA9PT0gdC5pZCk7XG4gICAgICAgICAgICBpZiAoaWR4ICE9PSAtMSkgbGlzdC5zcGxpY2UoaWR4LCAxKTtcbiAgICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiB0O1xuICAgIH1cbiAgICAvLyBUcnkgVVJMXG4gICAgY29uc3QgbGlzdCA9IGN1cnJlbnRVcmxNYXAuZ2V0KHN0b3JlZC51cmwpO1xuICAgIGlmIChsaXN0ICYmIGxpc3QubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgdCA9IGxpc3Quc2hpZnQoKTtcbiAgICAgIGlmICh0Py5pZCkgY3VycmVudFRhYk1hcC5kZWxldGUodC5pZCk7IC8vIENvbnN1bWVcbiAgICAgIHJldHVybiB0O1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSBpZiBtaXNzaW5nXG4gICAgaWYgKHN0b3JlZC51cmwpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHQgPSBhd2FpdCBjaHJvbWUudGFicy5jcmVhdGUoeyB1cmw6IHN0b3JlZC51cmwsIGFjdGl2ZTogZmFsc2UgfSk7XG4gICAgICAgICAgICByZXR1cm4gdDtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgbG9nRXJyb3IoXCJGYWlsZWQgdG8gY3JlYXRlIHRhYlwiLCB7IHVybDogc3RvcmVkLnVybCwgZXJyb3I6IGUgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9O1xuXG4gIC8vIFdlIG5lZWQgdG8gcmVjb25zdHJ1Y3Qgd2luZG93cy5cbiAgLy8gSWRlYWxseSwgd2UgbWFwIHN0YXRlIHdpbmRvd3MgdG8gY3VycmVudCB3aW5kb3dzLlxuICAvLyBCdXQgc3RyaWN0bHksIHdlIGNhbiBqdXN0IG1vdmUgdGFicy5cblxuICAvLyBGb3Igc2ltcGxpY2l0eSwgbGV0J3MgYXNzdW1lIHdlIHVzZSBleGlzdGluZyB3aW5kb3dzIGFzIG11Y2ggYXMgcG9zc2libGUuXG4gIC8vIE9yIGNyZWF0ZSBuZXcgb25lcyBpZiB3ZSBydW4gb3V0P1xuICAvLyBMZXQncyBpdGVyYXRlIHN0b3JlZCB3aW5kb3dzLlxuXG4gIGNvbnN0IGN1cnJlbnRXaW5kb3dzID0gYXdhaXQgY2hyb21lLndpbmRvd3MuZ2V0QWxsKCk7XG5cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdGF0ZS53aW5kb3dzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3Qgd2luU3RhdGUgPSBzdGF0ZS53aW5kb3dzW2ldO1xuXG4gICAgLy8gSWRlbnRpZnkgYWxsIHRhYnMgZm9yIHRoaXMgd2luZG93IGZpcnN0LlxuICAgIC8vIFdlIGRvIHRoaXMgQkVGT1JFIGNyZWF0aW5nIGEgd2luZG93IHRvIGF2b2lkIGNyZWF0aW5nIGVtcHR5IHdpbmRvd3MuXG4gICAgY29uc3QgdGFic1RvTW92ZTogeyB0YWJJZDogbnVtYmVyLCBzdG9yZWQ6IFN0b3JlZFRhYlN0YXRlIH1bXSA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBzdG9yZWRUYWIgb2Ygd2luU3RhdGUudGFicykge1xuICAgICAgY29uc3QgZm91bmQgPSBhd2FpdCBmaW5kT3JDcmVhdGVUYWIoc3RvcmVkVGFiKTtcbiAgICAgIGlmIChmb3VuZCAmJiBmb3VuZC5pZCkge1xuICAgICAgICB0YWJzVG9Nb3ZlLnB1c2goeyB0YWJJZDogZm91bmQuaWQsIHN0b3JlZDogc3RvcmVkVGFiIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICh0YWJzVG9Nb3ZlLmxlbmd0aCA9PT0gMCkgY29udGludWU7XG5cbiAgICBsZXQgdGFyZ2V0V2luZG93SWQ6IG51bWJlcjtcblxuICAgIGlmIChpIDwgY3VycmVudFdpbmRvd3MubGVuZ3RoKSB7XG4gICAgICB0YXJnZXRXaW5kb3dJZCA9IGN1cnJlbnRXaW5kb3dzW2ldLmlkITtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gQ3JlYXRlIG5ldyB3aW5kb3dcbiAgICAgIGNvbnN0IHdpbiA9IGF3YWl0IGNocm9tZS53aW5kb3dzLmNyZWF0ZSh7fSk7XG4gICAgICB0YXJnZXRXaW5kb3dJZCA9IHdpbi5pZCE7XG4gICAgICAvLyBOb3RlOiBOZXcgd2luZG93IGNyZWF0aW9uIGFkZHMgYSB0YWIuIFdlIG1pZ2h0IHdhbnQgdG8gcmVtb3ZlIGl0IGxhdGVyIG9yIGlnbm9yZSBpdC5cbiAgICB9XG5cbiAgICBjb25zdCB0YWJJZHMgPSB0YWJzVG9Nb3ZlLm1hcCh0ID0+IHQudGFiSWQpO1xuXG4gICAgLy8gTW92ZSBhbGwgdG8gd2luZG93LlxuICAgIC8vIE5vdGU6IElmIHdlIG1vdmUgdG8gaW5kZXggMCwgdGhleSB3aWxsIGJlIHByZXBlbmRlZC5cbiAgICAvLyBXZSBzaG91bGQgcHJvYmFibHkganVzdCBtb3ZlIHRoZW0gdG8gdGhlIHdpbmRvdyBmaXJzdC5cbiAgICAvLyBJZiB3ZSBtb3ZlIHRoZW0gaW5kaXZpZHVhbGx5IHRvIGNvcnJlY3QgaW5kZXgsIGl0J3Mgc2FmZXIuXG5cbiAgICBmb3IgKGxldCBqID0gMDsgaiA8IHRhYnNUb01vdmUubGVuZ3RoOyBqKyspIHtcbiAgICAgIGNvbnN0IHsgdGFiSWQsIHN0b3JlZCB9ID0gdGFic1RvTW92ZVtqXTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGNocm9tZS50YWJzLm1vdmUodGFiSWQsIHsgd2luZG93SWQ6IHRhcmdldFdpbmRvd0lkLCBpbmRleDogaiB9KTtcbiAgICAgICAgaWYgKHN0b3JlZC5waW5uZWQpIHtcbiAgICAgICAgICAgICBhd2FpdCBjaHJvbWUudGFicy51cGRhdGUodGFiSWQsIHsgcGlubmVkOiB0cnVlIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgIC8vIElmIGN1cnJlbnRseSBwaW5uZWQgYnV0IHNob3VsZG4ndCBiZVxuICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnQgPSBhd2FpdCBjaHJvbWUudGFicy5nZXQodGFiSWQpO1xuICAgICAgICAgICAgIGlmIChjdXJyZW50LnBpbm5lZCkgYXdhaXQgY2hyb21lLnRhYnMudXBkYXRlKHRhYklkLCB7IHBpbm5lZDogZmFsc2UgfSk7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgbG9nRXJyb3IoXCJGYWlsZWQgdG8gbW92ZSB0YWJcIiwgeyB0YWJJZCwgZXJyb3I6IGUgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gSGFuZGxlIEdyb3Vwc1xuICAgIC8vIElkZW50aWZ5IGdyb3VwcyBpbiB0aGlzIHdpbmRvd1xuICAgIGNvbnN0IGdyb3VwcyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXJbXT4oKTsgLy8gdGl0bGUrY29sb3IgLT4gdGFiSWRzXG4gICAgY29uc3QgZ3JvdXBDb2xvcnMgPSBuZXcgTWFwPHN0cmluZywgY2hyb21lLnRhYkdyb3Vwcy5Db2xvckVudW0+KCk7XG5cbiAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgdGFic1RvTW92ZSkge1xuICAgICAgaWYgKGl0ZW0uc3RvcmVkLmdyb3VwVGl0bGUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAvLyBVc2UgdGl0bGUgYXMga2V5IChvciB1bmlxdWUgSUQgaWYgd2UgaGFkIG9uZSwgYnV0IHdlIGRvbid0IHBlcnNpc3QgZ3JvdXAgSURzKVxuICAgICAgICAvLyBHcm91cCBJRCBpbiBzdG9yYWdlIGlzIGVwaGVtZXJhbC4gVGl0bGUgaXMga2V5LlxuICAgICAgICBjb25zdCBrZXkgPSBpdGVtLnN0b3JlZC5ncm91cFRpdGxlO1xuICAgICAgICBjb25zdCBsaXN0ID0gZ3JvdXBzLmdldChrZXkpIHx8IFtdO1xuICAgICAgICBsaXN0LnB1c2goaXRlbS50YWJJZCk7XG4gICAgICAgIGdyb3Vwcy5zZXQoa2V5LCBsaXN0KTtcbiAgICAgICAgaWYgKGl0ZW0uc3RvcmVkLmdyb3VwQ29sb3IpIHtcbiAgICAgICAgICAgICBncm91cENvbG9ycy5zZXQoa2V5LCBpdGVtLnN0b3JlZC5ncm91cENvbG9yIGFzIGNocm9tZS50YWJHcm91cHMuQ29sb3JFbnVtKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgIC8vIFVuZ3JvdXAgaWYgbmVlZGVkXG4gICAgICAgICBhd2FpdCBjaHJvbWUudGFicy51bmdyb3VwKGl0ZW0udGFiSWQpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgW3RpdGxlLCBpZHNdIG9mIGdyb3Vwcy5lbnRyaWVzKCkpIHtcbiAgICAgIGlmIChpZHMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCBncm91cElkID0gYXdhaXQgY2hyb21lLnRhYnMuZ3JvdXAoeyB0YWJJZHM6IGlkcyB9KTtcbiAgICAgICAgYXdhaXQgY2hyb21lLnRhYkdyb3Vwcy51cGRhdGUoZ3JvdXBJZCwge1xuICAgICAgICAgICAgIHRpdGxlOiB0aXRsZSxcbiAgICAgICAgICAgICBjb2xvcjogZ3JvdXBDb2xvcnMuZ2V0KHRpdGxlKSB8fCBcImdyZXlcIlxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG4iLCAiaW1wb3J0IHsgYXBwbHlUYWJHcm91cHMsIGFwcGx5VGFiU29ydGluZywgY2FsY3VsYXRlVGFiR3JvdXBzLCBmZXRjaEN1cnJlbnRUYWJHcm91cHMsIG1lcmdlVGFicywgc3BsaXRUYWJzIH0gZnJvbSBcIi4vdGFiTWFuYWdlci5qc1wiO1xuaW1wb3J0IHsgbG9hZFByZWZlcmVuY2VzLCBzYXZlUHJlZmVyZW5jZXMgfSBmcm9tIFwiLi9wcmVmZXJlbmNlcy5qc1wiO1xuaW1wb3J0IHsgc2V0Q3VzdG9tU3RyYXRlZ2llcyB9IGZyb20gXCIuL2dyb3VwaW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcsIGxvZ0luZm8sIGdldExvZ3MsIGNsZWFyTG9ncywgc2V0TG9nZ2VyUHJlZmVyZW5jZXMsIGluaXRMb2dnZXIsIGFkZExvZ0VudHJ5LCBsb2dnZXJSZWFkeSB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBwdXNoVW5kb1N0YXRlLCBzYXZlU3RhdGUsIHVuZG8sIGdldFNhdmVkU3RhdGVzLCBkZWxldGVTYXZlZFN0YXRlLCByZXN0b3JlU3RhdGUgfSBmcm9tIFwiLi9zdGF0ZU1hbmFnZXIuanNcIjtcbmltcG9ydCB7XG4gIEFwcGx5R3JvdXBpbmdQYXlsb2FkLFxuICBHcm91cGluZ1NlbGVjdGlvbixcbiAgR3JvdXBpbmdTdHJhdGVneSxcbiAgUHJlZmVyZW5jZXMsXG4gIFJ1bnRpbWVNZXNzYWdlLFxuICBSdW50aW1lUmVzcG9uc2UsXG4gIFNvcnRpbmdTdHJhdGVneSxcbiAgVGFiR3JvdXBcbn0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuXG5jaHJvbWUucnVudGltZS5vbkluc3RhbGxlZC5hZGRMaXN0ZW5lcihhc3luYyAoKSA9PiB7XG4gIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gIHNldEN1c3RvbVN0cmF0ZWdpZXMocHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXSk7XG4gIGxvZ0luZm8oXCJFeHRlbnNpb24gaW5zdGFsbGVkXCIsIHtcbiAgICB2ZXJzaW9uOiBjaHJvbWUucnVudGltZS5nZXRNYW5pZmVzdCgpLnZlcnNpb24sXG4gICAgbG9nTGV2ZWw6IHByZWZzLmxvZ0xldmVsLFxuICAgIHN0cmF0ZWdpZXNDb3VudDogcHJlZnMuY3VzdG9tU3RyYXRlZ2llcz8ubGVuZ3RoIHx8IDBcbiAgfSk7XG59KTtcblxuLy8gSW5pdGlhbGl6ZSBsb2dnZXIgb24gc3RhcnR1cFxubG9hZFByZWZlcmVuY2VzKCkudGhlbihhc3luYyAocHJlZnMpID0+IHtcbiAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuICAgIGF3YWl0IGluaXRMb2dnZXIoKTtcbiAgICBsb2dJbmZvKFwiU2VydmljZSBXb3JrZXIgSW5pdGlhbGl6ZWRcIiwge1xuICAgICAgICB2ZXJzaW9uOiBjaHJvbWUucnVudGltZS5nZXRNYW5pZmVzdCgpLnZlcnNpb24sXG4gICAgICAgIGxvZ0xldmVsOiBwcmVmcy5sb2dMZXZlbFxuICAgIH0pO1xufSk7XG5cbmNvbnN0IGhhbmRsZU1lc3NhZ2UgPSBhc3luYyA8VERhdGE+KFxuICBtZXNzYWdlOiBSdW50aW1lTWVzc2FnZSxcbiAgc2VuZGVyOiBjaHJvbWUucnVudGltZS5NZXNzYWdlU2VuZGVyXG4pOiBQcm9taXNlPFJ1bnRpbWVSZXNwb25zZTxURGF0YT4+ID0+IHtcbiAgbG9nRGVidWcoXCJSZWNlaXZlZCBtZXNzYWdlXCIsIHsgdHlwZTogbWVzc2FnZS50eXBlLCBmcm9tOiBzZW5kZXIuaWQgfSk7XG4gIHN3aXRjaCAobWVzc2FnZS50eXBlKSB7XG4gICAgY2FzZSBcImdldFN0YXRlXCI6IHtcbiAgICAgIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuICAgICAgLy8gVXNlIGZldGNoQ3VycmVudFRhYkdyb3VwcyB0byByZXR1cm4gdGhlIGFjdHVhbCBzdGF0ZSBvZiB0aGUgYnJvd3NlciB0YWJzXG4gICAgICBjb25zdCBncm91cHMgPSBhd2FpdCBmZXRjaEN1cnJlbnRUYWJHcm91cHMocHJlZnMpO1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGRhdGE6IHsgZ3JvdXBzLCBwcmVmZXJlbmNlczogcHJlZnMgfSBhcyBURGF0YSB9O1xuICAgIH1cbiAgICBjYXNlIFwiYXBwbHlHcm91cGluZ1wiOiB7XG4gICAgICBsb2dJbmZvKFwiQXBwbHlpbmcgZ3JvdXBpbmcgZnJvbSBtZXNzYWdlXCIsIHsgc29ydGluZzogKG1lc3NhZ2UucGF5bG9hZCBhcyBhbnkpPy5zb3J0aW5nIH0pO1xuICAgICAgYXdhaXQgcHVzaFVuZG9TdGF0ZSgpO1xuICAgICAgY29uc3QgcHJlZnMgPSBhd2FpdCBsb2FkUHJlZmVyZW5jZXMoKTtcbiAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMocHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXSk7XG4gICAgICBjb25zdCBwYXlsb2FkID0gKG1lc3NhZ2UucGF5bG9hZCBhcyBBcHBseUdyb3VwaW5nUGF5bG9hZCB8IHVuZGVmaW5lZCkgPz8ge307XG4gICAgICBjb25zdCBzZWxlY3Rpb24gPSBwYXlsb2FkLnNlbGVjdGlvbiA/PyB7fTtcbiAgICAgIGNvbnN0IHNvcnRpbmcgPSBwYXlsb2FkLnNvcnRpbmc/Lmxlbmd0aCA/IHBheWxvYWQuc29ydGluZyA6IHVuZGVmaW5lZDtcblxuICAgICAgY29uc3QgcHJlZmVyZW5jZXMgPSBzb3J0aW5nID8geyAuLi5wcmVmcywgc29ydGluZyB9IDogcHJlZnM7XG5cbiAgICAgIGNvbnN0IG9uUHJvZ3Jlc3MgPSAoY29tcGxldGVkOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+IHtcbiAgICAgICAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICAgIHR5cGU6IFwiZ3JvdXBpbmdQcm9ncmVzc1wiLFxuICAgICAgICAgICAgICBwYXlsb2FkOiB7IGNvbXBsZXRlZCwgdG90YWwgfVxuICAgICAgICAgIH0pLmNhdGNoKCgpID0+IHt9KTtcbiAgICAgIH07XG5cbiAgICAgIC8vIFVzZSBjYWxjdWxhdGVUYWJHcm91cHMgdG8gZGV0ZXJtaW5lIHRoZSB0YXJnZXQgZ3JvdXBpbmdcbiAgICAgIGNvbnN0IGdyb3VwcyA9IGF3YWl0IGNhbGN1bGF0ZVRhYkdyb3VwcyhwcmVmZXJlbmNlcywgc2VsZWN0aW9uLCBvblByb2dyZXNzKTtcbiAgICAgIGF3YWl0IGFwcGx5VGFiR3JvdXBzKGdyb3Vwcyk7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSwgZGF0YTogeyBncm91cHMgfSBhcyBURGF0YSB9O1xuICAgIH1cbiAgICBjYXNlIFwiYXBwbHlTb3J0aW5nXCI6IHtcbiAgICAgIGxvZ0luZm8oXCJBcHBseWluZyBzb3J0aW5nIGZyb20gbWVzc2FnZVwiKTtcbiAgICAgIGF3YWl0IHB1c2hVbmRvU3RhdGUoKTtcbiAgICAgIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuICAgICAgY29uc3QgcGF5bG9hZCA9IChtZXNzYWdlLnBheWxvYWQgYXMgQXBwbHlHcm91cGluZ1BheWxvYWQgfCB1bmRlZmluZWQpID8/IHt9O1xuICAgICAgY29uc3Qgc2VsZWN0aW9uID0gcGF5bG9hZC5zZWxlY3Rpb24gPz8ge307XG4gICAgICBjb25zdCBzb3J0aW5nID0gcGF5bG9hZC5zb3J0aW5nPy5sZW5ndGggPyBwYXlsb2FkLnNvcnRpbmcgOiB1bmRlZmluZWQ7XG4gICAgICBjb25zdCBwcmVmZXJlbmNlcyA9IHNvcnRpbmcgPyB7IC4uLnByZWZzLCBzb3J0aW5nIH0gOiBwcmVmcztcblxuICAgICAgY29uc3Qgb25Qcm9ncmVzcyA9IChjb21wbGV0ZWQ6IG51bWJlciwgdG90YWw6IG51bWJlcikgPT4ge1xuICAgICAgICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgICAgdHlwZTogXCJncm91cGluZ1Byb2dyZXNzXCIsXG4gICAgICAgICAgICAgIHBheWxvYWQ6IHsgY29tcGxldGVkLCB0b3RhbCB9XG4gICAgICAgICAgfSkuY2F0Y2goKCkgPT4ge30pO1xuICAgICAgfTtcblxuICAgICAgYXdhaXQgYXBwbHlUYWJTb3J0aW5nKHByZWZlcmVuY2VzLCBzZWxlY3Rpb24sIG9uUHJvZ3Jlc3MpO1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICB9XG4gICAgY2FzZSBcIm1lcmdlU2VsZWN0aW9uXCI6IHtcbiAgICAgIGxvZ0luZm8oXCJNZXJnaW5nIHNlbGVjdGlvbiBmcm9tIG1lc3NhZ2VcIik7XG4gICAgICBhd2FpdCBwdXNoVW5kb1N0YXRlKCk7XG4gICAgICBjb25zdCBwYXlsb2FkID0gbWVzc2FnZS5wYXlsb2FkIGFzIHsgdGFiSWRzOiBudW1iZXJbXSB9O1xuICAgICAgaWYgKHBheWxvYWQ/LnRhYklkcz8ubGVuZ3RoKSB7XG4gICAgICAgIGF3YWl0IG1lcmdlVGFicyhwYXlsb2FkLnRhYklkcyk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICB9XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIk5vIHRhYnMgc2VsZWN0ZWRcIiB9O1xuICAgIH1cbiAgICBjYXNlIFwic3BsaXRTZWxlY3Rpb25cIjoge1xuICAgICAgbG9nSW5mbyhcIlNwbGl0dGluZyBzZWxlY3Rpb24gZnJvbSBtZXNzYWdlXCIpO1xuICAgICAgYXdhaXQgcHVzaFVuZG9TdGF0ZSgpO1xuICAgICAgY29uc3QgcGF5bG9hZCA9IG1lc3NhZ2UucGF5bG9hZCBhcyB7IHRhYklkczogbnVtYmVyW10gfTtcbiAgICAgIGlmIChwYXlsb2FkPy50YWJJZHM/Lmxlbmd0aCkge1xuICAgICAgICBhd2FpdCBzcGxpdFRhYnMocGF5bG9hZC50YWJJZHMpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJObyB0YWJzIHNlbGVjdGVkXCIgfTtcbiAgICB9XG4gICAgY2FzZSBcInVuZG9cIjoge1xuICAgICAgbG9nSW5mbyhcIlVuZG9pbmcgbGFzdCBhY3Rpb25cIik7XG4gICAgICBhd2FpdCB1bmRvKCk7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgIH1cbiAgICBjYXNlIFwic2F2ZVN0YXRlXCI6IHtcbiAgICAgIGNvbnN0IG5hbWUgPSAobWVzc2FnZS5wYXlsb2FkIGFzIGFueSk/Lm5hbWU7XG4gICAgICBpZiAodHlwZW9mIG5hbWUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgbG9nSW5mbyhcIlNhdmluZyBzdGF0ZSBmcm9tIG1lc3NhZ2VcIiwgeyBuYW1lIH0pO1xuICAgICAgICBhd2FpdCBzYXZlU3RhdGUobmFtZSk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICB9XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgbmFtZVwiIH07XG4gICAgfVxuICAgIGNhc2UgXCJnZXRTYXZlZFN0YXRlc1wiOiB7XG4gICAgICBjb25zdCBzdGF0ZXMgPSBhd2FpdCBnZXRTYXZlZFN0YXRlcygpO1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGRhdGE6IHN0YXRlcyBhcyBURGF0YSB9O1xuICAgIH1cbiAgICBjYXNlIFwicmVzdG9yZVN0YXRlXCI6IHtcbiAgICAgIGNvbnN0IHN0YXRlID0gKG1lc3NhZ2UucGF5bG9hZCBhcyBhbnkpPy5zdGF0ZTtcbiAgICAgIGlmIChzdGF0ZSkge1xuICAgICAgICBsb2dJbmZvKFwiUmVzdG9yaW5nIHN0YXRlIGZyb20gbWVzc2FnZVwiLCB7IG5hbWU6IHN0YXRlLm5hbWUgfSk7XG4gICAgICAgIGF3YWl0IHJlc3RvcmVTdGF0ZShzdGF0ZSk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICB9XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgc3RhdGVcIiB9O1xuICAgIH1cbiAgICBjYXNlIFwiZGVsZXRlU2F2ZWRTdGF0ZVwiOiB7XG4gICAgICBjb25zdCBuYW1lID0gKG1lc3NhZ2UucGF5bG9hZCBhcyBhbnkpPy5uYW1lO1xuICAgICAgaWYgKHR5cGVvZiBuYW1lID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIGxvZ0luZm8oXCJEZWxldGluZyBzYXZlZCBzdGF0ZSBmcm9tIG1lc3NhZ2VcIiwgeyBuYW1lIH0pO1xuICAgICAgICBhd2FpdCBkZWxldGVTYXZlZFN0YXRlKG5hbWUpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJJbnZhbGlkIG5hbWVcIiB9O1xuICAgIH1cbiAgICBjYXNlIFwibG9hZFByZWZlcmVuY2VzXCI6IHtcbiAgICAgIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGRhdGE6IHByZWZzIGFzIFREYXRhIH07XG4gICAgfVxuICAgIGNhc2UgXCJzYXZlUHJlZmVyZW5jZXNcIjoge1xuICAgICAgbG9nSW5mbyhcIlNhdmluZyBwcmVmZXJlbmNlcyBmcm9tIG1lc3NhZ2VcIik7XG4gICAgICBjb25zdCBwcmVmcyA9IGF3YWl0IHNhdmVQcmVmZXJlbmNlcyhtZXNzYWdlLnBheWxvYWQgYXMgYW55KTtcbiAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMocHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXSk7XG4gICAgICBzZXRMb2dnZXJQcmVmZXJlbmNlcyhwcmVmcyk7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSwgZGF0YTogcHJlZnMgYXMgVERhdGEgfTtcbiAgICB9XG4gICAgY2FzZSBcImdldExvZ3NcIjoge1xuICAgICAgICBhd2FpdCBsb2dnZXJSZWFkeTtcbiAgICAgICAgY29uc3QgbG9ncyA9IGdldExvZ3MoKTtcbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUsIGRhdGE6IGxvZ3MgYXMgVERhdGEgfTtcbiAgICB9XG4gICAgY2FzZSBcImNsZWFyTG9nc1wiOiB7XG4gICAgICAgIGNsZWFyTG9ncygpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgIH1cbiAgICBjYXNlIFwibG9nRW50cnlcIjoge1xuICAgICAgICBjb25zdCBlbnRyeSA9IG1lc3NhZ2UucGF5bG9hZCBhcyBhbnk7XG4gICAgICAgIGlmIChlbnRyeSAmJiBlbnRyeS5sZXZlbCAmJiBlbnRyeS5tZXNzYWdlKSB7XG4gICAgICAgICAgICBhZGRMb2dFbnRyeShlbnRyeSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICB9XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiVW5rbm93biBtZXNzYWdlXCIgfTtcbiAgfVxufTtcblxuY2hyb21lLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKFxuICAoXG4gICAgbWVzc2FnZTogUnVudGltZU1lc3NhZ2UsXG4gICAgc2VuZGVyOiBjaHJvbWUucnVudGltZS5NZXNzYWdlU2VuZGVyLFxuICAgIHNlbmRSZXNwb25zZTogKHJlc3BvbnNlOiBSdW50aW1lUmVzcG9uc2UpID0+IHZvaWRcbiAgKSA9PiB7XG4gICAgaGFuZGxlTWVzc2FnZShtZXNzYWdlLCBzZW5kZXIpXG4gICAgLnRoZW4oKHJlc3BvbnNlKSA9PiBzZW5kUmVzcG9uc2UocmVzcG9uc2UpKVxuICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiBmYWxzZSwgZXJyb3I6IFN0cmluZyhlcnJvcikgfSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbik7XG5cbmNocm9tZS50YWJHcm91cHMub25SZW1vdmVkLmFkZExpc3RlbmVyKGFzeW5jIChncm91cCkgPT4ge1xuICBsb2dJbmZvKFwiVGFiIGdyb3VwIHJlbW92ZWRcIiwgeyBncm91cCB9KTtcbn0pO1xuXG5sZXQgYXV0b1J1blRpbWVvdXQ6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgbnVsbCA9IG51bGw7XG5cbmNvbnN0IHRyaWdnZXJBdXRvUnVuID0gKCkgPT4ge1xuICBpZiAoYXV0b1J1blRpbWVvdXQpIGNsZWFyVGltZW91dChhdXRvUnVuVGltZW91dCk7XG4gIGF1dG9SdW5UaW1lb3V0ID0gc2V0VGltZW91dChhc3luYyAoKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuXG4gICAgICBjb25zdCBhdXRvUnVuU3RyYXRzID0gcHJlZnMuY3VzdG9tU3RyYXRlZ2llcz8uZmlsdGVyKHMgPT4gcy5hdXRvUnVuKTtcbiAgICAgIGlmIChhdXRvUnVuU3RyYXRzICYmIGF1dG9SdW5TdHJhdHMubGVuZ3RoID4gMCkge1xuICAgICAgICBsb2dJbmZvKFwiQXV0by1ydW5uaW5nIHN0cmF0ZWdpZXNcIiwge1xuICAgICAgICAgIHN0cmF0ZWdpZXM6IGF1dG9SdW5TdHJhdHMubWFwKHMgPT4gcy5pZCksXG4gICAgICAgICAgY291bnQ6IGF1dG9SdW5TdHJhdHMubGVuZ3RoXG4gICAgICAgIH0pO1xuICAgICAgICBjb25zdCBpZHMgPSBhdXRvUnVuU3RyYXRzLm1hcChzID0+IHMuaWQpO1xuXG4gICAgICAgIC8vIFdlIGFwcGx5IGdyb3VwaW5nIHVzaW5nIHRoZXNlIHN0cmF0ZWdpZXNcbiAgICAgICAgY29uc3QgZ3JvdXBzID0gYXdhaXQgY2FsY3VsYXRlVGFiR3JvdXBzKHsgLi4ucHJlZnMsIHNvcnRpbmc6IGlkcyB9KTtcbiAgICAgICAgYXdhaXQgYXBwbHlUYWJHcm91cHMoZ3JvdXBzKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiQXV0by1ydW4gZmFpbGVkXCIsIGUpO1xuICAgIH1cbiAgfSwgMTAwMCk7XG59O1xuXG5jaHJvbWUudGFicy5vbkNyZWF0ZWQuYWRkTGlzdGVuZXIoKCkgPT4gdHJpZ2dlckF1dG9SdW4oKSk7XG5jaHJvbWUudGFicy5vblVwZGF0ZWQuYWRkTGlzdGVuZXIoKHRhYklkLCBjaGFuZ2VJbmZvKSA9PiB7XG4gIGlmIChjaGFuZ2VJbmZvLnVybCB8fCBjaGFuZ2VJbmZvLnN0YXR1cyA9PT0gJ2NvbXBsZXRlJykge1xuICAgIHRyaWdnZXJBdXRvUnVuKCk7XG4gIH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQWFPLElBQU0sYUFBbUM7QUFBQSxFQUM1QyxFQUFFLElBQUksVUFBVSxPQUFPLFVBQVUsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FB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b0IsQ0FBQyxDQUFDO0FBRWhELFlBQU0sZ0JBQWdCLE1BQU0sa0JBQWtCLE9BQU8sT0FBSyxFQUFFLE9BQU87QUFDbkUsVUFBSSxpQkFBaUIsY0FBYyxTQUFTLEdBQUc7QUFDN0MsZ0JBQVEsMkJBQTJCO0FBQUEsVUFDakMsWUFBWSxjQUFjLElBQUksT0FBSyxFQUFFLEVBQUU7QUFBQSxVQUN2QyxPQUFPLGNBQWM7QUFBQSxRQUN2QixDQUFDO0FBQ0QsY0FBTSxNQUFNLGNBQWMsSUFBSSxPQUFLLEVBQUUsRUFBRTtBQUd2QyxjQUFNLFNBQVMsTUFBTSxtQkFBbUIsRUFBRSxHQUFHLE9BQU8sU0FBUyxJQUFJLENBQUM7QUFDbEUsY0FBTSxlQUFlLE1BQU07QUFBQSxNQUM3QjtBQUFBLElBQ0YsU0FBUyxHQUFHO0FBQ1YsY0FBUSxNQUFNLG1CQUFtQixDQUFDO0FBQUEsSUFDcEM7QUFBQSxFQUNGLEdBQUcsR0FBSTtBQUNUO0FBRUEsT0FBTyxLQUFLLFVBQVUsWUFBWSxNQUFNLGVBQWUsQ0FBQztBQUN4RCxPQUFPLEtBQUssVUFBVSxZQUFZLENBQUMsT0FBTyxlQUFlO0FBQ3ZELE1BQUksV0FBVyxPQUFPLFdBQVcsV0FBVyxZQUFZO0FBQ3RELG1CQUFlO0FBQUEsRUFDakI7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogWyJjdXN0b21TdHJhdGVnaWVzIiwgIm1hdGNoIiwgInBhcnRzIiwgImdyb3VwVGFicyIsICJ0YWJzIiwgImxpc3QiLCAibG9ncyJdCn0K
