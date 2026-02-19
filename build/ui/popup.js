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
var getStoredPreferences = async () => {
  return new Promise((resolve) => {
    chrome.storage.local.get("preferences", (items) => {
      resolve(items["preferences"] ?? null);
    });
  });
};
var asArray = (value) => {
  if (Array.isArray(value)) return value;
  return [];
};

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

// src/background/groupingStrategies.ts
var customStrategies = [];
var setCustomStrategies = (strategies) => {
  customStrategies = strategies;
};
var getCustomStrategies = () => customStrategies;
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
var resolveWindowMode = (modes) => {
  if (modes.includes("new")) return "new";
  if (modes.includes("compound")) return "compound";
  return "current";
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

// src/ui/localState.ts
var defaultPreferences = {
  sorting: ["pinned", "recency"],
  debug: false,
  theme: "dark",
  customGenera: {}
};
var fetchLocalState = async () => {
  try {
    const [tabs, groups, prefs] = await Promise.all([
      chrome.tabs.query({}),
      chrome.tabGroups.query({}),
      getStoredPreferences()
    ]);
    const preferences2 = prefs || defaultPreferences;
    setCustomStrategies(preferences2.customStrategies || []);
    const groupMap = new Map(groups.map((g) => [g.id, g]));
    const mapped = tabs.map(mapChromeTab).filter((t) => Boolean(t));
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
    for (const [groupId, groupTabs] of tabsByGroupId) {
      const browserGroup = groupMap.get(groupId);
      if (browserGroup) {
        resultGroups.push({
          id: `group-${groupId}`,
          windowId: browserGroup.windowId,
          label: browserGroup.title || "Untitled Group",
          color: browserGroup.color,
          tabs: sortTabs(groupTabs, preferences2.sorting),
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
        tabs: sortTabs(tabs2, preferences2.sorting),
        reason: "Ungrouped"
      });
    }
    console.warn("Fetched local state (fallback)");
    return { ok: true, data: { groups: resultGroups, preferences: preferences2 } };
  } catch (e) {
    console.error("Local state fetch failed:", e);
    return { ok: false, error: String(e) };
  }
};

// src/ui/common.ts
var sendMessage = async (type, payload) => {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Runtime error:", chrome.runtime.lastError);
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response || { ok: false, error: "No response from background" });
      }
    });
  });
};
var ICONS = {
  active: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>`,
  hide: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`,
  show: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
  focus: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>`,
  close: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
  ungroup: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="8" y1="12" x2="16" y2="12"></line></svg>`,
  defaultFile: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`,
  autoRun: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`
};
var GROUP_COLORS = {
  grey: "#64748b",
  blue: "#3b82f6",
  red: "#ef4444",
  yellow: "#eab308",
  green: "#22c55e",
  pink: "#ec4899",
  purple: "#a855f7",
  cyan: "#06b6d4",
  orange: "#f97316"
};
var fetchState = async () => {
  try {
    const response = await sendMessage("getState");
    if (response.ok && response.data) {
      return response;
    }
    console.warn("fetchState failed, using fallback:", response.error);
    return await fetchLocalState();
  } catch (e) {
    console.warn("fetchState threw exception, using fallback:", e);
    return await fetchLocalState();
  }
};
var applyGrouping = async (payload) => {
  const response = await chrome.runtime.sendMessage({ type: "applyGrouping", payload });
  return response;
};
var mapWindows = (groups, windowTitles) => {
  const windows = /* @__PURE__ */ new Map();
  groups.forEach((group) => {
    const isUngrouped = group.reason === "Ungrouped";
    group.tabs.forEach((tab) => {
      const decorated = {
        ...tab,
        groupLabel: isUngrouped ? void 0 : group.label,
        groupColor: isUngrouped ? void 0 : group.color,
        reason: group.reason
      };
      const existing = windows.get(tab.windowId) ?? [];
      existing.push(decorated);
      windows.set(tab.windowId, existing);
    });
  });
  return Array.from(windows.entries()).map(([id, tabs]) => {
    const groupCount = new Set(tabs.map((tab) => tab.groupLabel).filter((l) => !!l)).size;
    const pinnedCount = tabs.filter((tab) => tab.pinned).length;
    return {
      id,
      title: windowTitles.get(id) ?? `Window ${id}`,
      tabs,
      tabCount: tabs.length,
      groupCount,
      pinnedCount
    };
  }).sort((a, b) => a.id - b.id);
};
function getDragAfterElement(container, y, selector) {
  const draggableElements = Array.from(container.querySelectorAll(selector));
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}

// src/ui/popup.ts
var searchInput = document.getElementById("tabSearch");
var windowsContainer = document.getElementById("windows");
var selectAllCheckbox = document.getElementById("selectAll");
var btnApply = document.getElementById("btnApply");
var btnUngroup = document.getElementById("btnUngroup");
var btnMerge = document.getElementById("btnMerge");
var btnSplit = document.getElementById("btnSplit");
var btnExpandAll = document.getElementById("btnExpandAll");
var btnCollapseAll = document.getElementById("btnCollapseAll");
var activeStrategiesList = document.getElementById("activeStrategiesList");
var addStrategySelect = document.getElementById("addStrategySelect");
var statTabs = document.getElementById("statTabs");
var statGroups = document.getElementById("statGroups");
var statWindows = document.getElementById("statWindows");
var progressOverlay = document.getElementById("progressOverlay");
var progressText = document.getElementById("progressText");
var progressCount = document.getElementById("progressCount");
var showLoading = (text) => {
  if (progressOverlay) {
    progressText.textContent = text;
    progressCount.textContent = "";
    progressOverlay.classList.remove("hidden");
  }
};
var hideLoading = () => {
  if (progressOverlay) {
    progressOverlay.classList.add("hidden");
  }
};
var updateProgress = (completed, total) => {
  if (progressOverlay && !progressOverlay.classList.contains("hidden")) {
    progressCount.textContent = `${completed} / ${total}`;
  }
};
var windowState = [];
var focusedWindowId = null;
var selectedTabs = /* @__PURE__ */ new Set();
var initialSelectionDone = false;
var preferences = null;
var localPreferencesModifiedTime = 0;
var expandedNodes = /* @__PURE__ */ new Set();
var TREE_ICONS = {
  chevronRight: `<svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`,
  folder: `<svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`
};
var hexToRgba = (hex, alpha) => {
  if (!hex.startsWith("#")) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
var updateStats = () => {
  const totalTabs = windowState.reduce((acc, win) => acc + win.tabCount, 0);
  const totalGroups = new Set(windowState.flatMap((w) => w.tabs.filter((t) => t.groupLabel).map((t) => `${w.id}-${t.groupLabel}`))).size;
  statTabs.textContent = `${totalTabs} Tabs`;
  statGroups.textContent = `${totalGroups} Groups`;
  statWindows.textContent = `${windowState.length} Windows`;
  const hasSelection = selectedTabs.size > 0;
  btnUngroup.disabled = !hasSelection;
  btnMerge.disabled = !hasSelection;
  btnSplit.disabled = !hasSelection;
  btnUngroup.style.opacity = hasSelection ? "1" : "0.5";
  btnMerge.style.opacity = hasSelection ? "1" : "0.5";
  btnSplit.style.opacity = hasSelection ? "1" : "0.5";
  if (totalTabs === 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
  } else if (selectedTabs.size === totalTabs) {
    selectAllCheckbox.checked = true;
    selectAllCheckbox.indeterminate = false;
  } else if (selectedTabs.size > 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = true;
  } else {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
  }
};
var createNode = (content, childrenContainer, level, isExpanded = false, onToggle) => {
  const node = document.createElement("div");
  node.className = `tree-node node-${level}`;
  const row = document.createElement("div");
  row.className = `tree-row ${level}-row`;
  const toggle = document.createElement("div");
  toggle.className = `tree-toggle ${isExpanded ? "rotated" : ""}`;
  if (childrenContainer) {
    toggle.innerHTML = TREE_ICONS.chevronRight;
    toggle.onclick = (e) => {
      e.stopPropagation();
      if (onToggle) onToggle();
    };
  } else {
    toggle.classList.add("hidden");
  }
  row.appendChild(toggle);
  row.appendChild(content);
  node.appendChild(row);
  if (childrenContainer) {
    childrenContainer.className = `tree-children ${isExpanded ? "expanded" : ""}`;
    node.appendChild(childrenContainer);
  }
  if (childrenContainer && level !== "tab") {
    row.addEventListener("click", (e) => {
      if (e.target.closest(".action-btn") || e.target.closest(".tree-checkbox")) return;
      if (onToggle) onToggle();
    });
  }
  return { node, toggle, childrenContainer };
};
var renderTree = () => {
  const query = searchInput.value.trim().toLowerCase();
  windowsContainer.innerHTML = "";
  const filtered = windowState.map((window2) => {
    if (!query) return { window: window2, visibleTabs: window2.tabs };
    const visibleTabs = window2.tabs.filter(
      (tab) => tab.title.toLowerCase().includes(query) || tab.url.toLowerCase().includes(query)
    );
    return { window: window2, visibleTabs };
  }).filter(({ visibleTabs }) => visibleTabs.length > 0 || !query);
  filtered.forEach(({ window: window2, visibleTabs }) => {
    const windowKey = `w-${window2.id}`;
    const isExpanded = !!query || expandedNodes.has(windowKey);
    const allTabIds = visibleTabs.map((t) => t.id);
    const selectedCount = allTabIds.filter((id) => selectedTabs.has(id)).length;
    const isAll = selectedCount === allTabIds.length && allTabIds.length > 0;
    const isSome = selectedCount > 0 && selectedCount < allTabIds.length;
    const winCheckbox = document.createElement("input");
    winCheckbox.type = "checkbox";
    winCheckbox.className = "tree-checkbox";
    winCheckbox.checked = isAll;
    winCheckbox.indeterminate = isSome;
    winCheckbox.onclick = (e) => {
      e.stopPropagation();
      const targetState = !isAll;
      allTabIds.forEach((id) => {
        if (targetState) selectedTabs.add(id);
        else selectedTabs.delete(id);
      });
      renderTree();
    };
    const winContent = document.createElement("div");
    winContent.style.display = "flex";
    winContent.style.alignItems = "center";
    winContent.style.flex = "1";
    winContent.style.overflow = "hidden";
    const label = document.createElement("div");
    label.className = "tree-label";
    label.textContent = window2.title;
    const count = document.createElement("div");
    count.className = "tree-count";
    count.textContent = `(${visibleTabs.length} Tabs)`;
    winContent.append(winCheckbox, label, count);
    const childrenContainer = document.createElement("div");
    const groups = /* @__PURE__ */ new Map();
    const ungroupedTabs = [];
    visibleTabs.forEach((tab) => {
      if (tab.groupLabel) {
        const key = tab.groupLabel;
        const entry = groups.get(key) ?? { color: tab.groupColor, tabs: [] };
        entry.tabs.push(tab);
        groups.set(key, entry);
      } else {
        ungroupedTabs.push(tab);
      }
    });
    const createTabNode = (tab) => {
      const tabContent = document.createElement("div");
      tabContent.style.display = "flex";
      tabContent.style.alignItems = "center";
      tabContent.style.flex = "1";
      tabContent.style.overflow = "hidden";
      const tabCheckbox = document.createElement("input");
      tabCheckbox.type = "checkbox";
      tabCheckbox.className = "tree-checkbox";
      tabCheckbox.checked = selectedTabs.has(tab.id);
      tabCheckbox.onclick = (e) => {
        e.stopPropagation();
        if (tabCheckbox.checked) selectedTabs.add(tab.id);
        else selectedTabs.delete(tab.id);
        renderTree();
      };
      const tabIcon = document.createElement("div");
      tabIcon.className = "tree-icon";
      if (tab.favIconUrl) {
        const img = document.createElement("img");
        img.src = tab.favIconUrl;
        img.onerror = () => {
          tabIcon.innerHTML = ICONS.defaultFile;
        };
        tabIcon.appendChild(img);
      } else {
        tabIcon.innerHTML = ICONS.defaultFile;
      }
      const tabTitle = document.createElement("div");
      tabTitle.className = "tree-label";
      tabTitle.textContent = tab.title;
      tabTitle.title = tab.title;
      const tabActions = document.createElement("div");
      tabActions.className = "row-actions";
      const closeBtn = document.createElement("button");
      closeBtn.className = "action-btn delete";
      closeBtn.innerHTML = ICONS.close;
      closeBtn.title = "Close Tab";
      closeBtn.onclick = async (e) => {
        e.stopPropagation();
        await chrome.tabs.remove(tab.id);
        await loadState();
      };
      tabActions.appendChild(closeBtn);
      tabContent.append(tabCheckbox, tabIcon, tabTitle, tabActions);
      const { node: tabNode } = createNode(tabContent, null, "tab");
      tabNode.onclick = async (e) => {
        if (e.target.closest(".tree-checkbox")) return;
        await chrome.tabs.update(tab.id, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
      };
      return tabNode;
    };
    Array.from(groups.entries()).forEach(([groupLabel, groupData]) => {
      const groupKey = `${windowKey}-g-${groupLabel}`;
      const isGroupExpanded = !!query || expandedNodes.has(groupKey);
      const groupTabIds = groupData.tabs.map((t) => t.id);
      const grpSelectedCount = groupTabIds.filter((id) => selectedTabs.has(id)).length;
      const grpIsAll = grpSelectedCount === groupTabIds.length && groupTabIds.length > 0;
      const grpIsSome = grpSelectedCount > 0 && grpSelectedCount < groupTabIds.length;
      const grpCheckbox = document.createElement("input");
      grpCheckbox.type = "checkbox";
      grpCheckbox.className = "tree-checkbox";
      grpCheckbox.checked = grpIsAll;
      grpCheckbox.indeterminate = grpIsSome;
      grpCheckbox.onclick = (e) => {
        e.stopPropagation();
        const targetState = !grpIsAll;
        groupTabIds.forEach((id) => {
          if (targetState) selectedTabs.add(id);
          else selectedTabs.delete(id);
        });
        renderTree();
      };
      const grpContent = document.createElement("div");
      grpContent.style.display = "flex";
      grpContent.style.alignItems = "center";
      grpContent.style.flex = "1";
      grpContent.style.overflow = "hidden";
      const icon = document.createElement("div");
      icon.className = "tree-icon";
      icon.innerHTML = TREE_ICONS.folder;
      const grpLabel = document.createElement("div");
      grpLabel.className = "tree-label";
      grpLabel.textContent = groupLabel;
      const grpCount = document.createElement("div");
      grpCount.className = "tree-count";
      grpCount.textContent = `(${groupData.tabs.length})`;
      const actions = document.createElement("div");
      actions.className = "row-actions";
      const ungroupBtn = document.createElement("button");
      ungroupBtn.className = "action-btn";
      ungroupBtn.innerHTML = ICONS.ungroup;
      ungroupBtn.title = "Ungroup";
      ungroupBtn.onclick = async (e) => {
        e.stopPropagation();
        if (confirm(`Ungroup ${groupData.tabs.length} tabs?`)) {
          await chrome.tabs.ungroup(groupData.tabs.map((t) => t.id));
          await loadState();
        }
      };
      actions.appendChild(ungroupBtn);
      grpContent.append(grpCheckbox, icon, grpLabel, grpCount, actions);
      const tabsContainer = document.createElement("div");
      groupData.tabs.forEach((tab) => {
        tabsContainer.appendChild(createTabNode(tab));
      });
      const { node: groupNode, toggle: grpToggle, childrenContainer: grpChildren } = createNode(
        grpContent,
        tabsContainer,
        "group",
        isGroupExpanded,
        () => {
          if (expandedNodes.has(groupKey)) expandedNodes.delete(groupKey);
          else expandedNodes.add(groupKey);
          const expanded = expandedNodes.has(groupKey);
          grpToggle.classList.toggle("rotated", expanded);
          grpChildren.classList.toggle("expanded", expanded);
        }
      );
      if (groupData.color) {
        const colorName = groupData.color;
        const hex = GROUP_COLORS[colorName] || colorName;
        if (hex.startsWith("#")) {
          groupNode.style.backgroundColor = hexToRgba(hex, 0.1);
          groupNode.style.border = `1px solid ${hexToRgba(hex, 0.2)}`;
        }
      }
      childrenContainer.appendChild(groupNode);
    });
    ungroupedTabs.forEach((tab) => {
      childrenContainer.appendChild(createTabNode(tab));
    });
    const { node: winNode, toggle: winToggle, childrenContainer: winChildren } = createNode(
      winContent,
      childrenContainer,
      "window",
      isExpanded,
      () => {
        if (expandedNodes.has(windowKey)) expandedNodes.delete(windowKey);
        else expandedNodes.add(windowKey);
        const expanded = expandedNodes.has(windowKey);
        winToggle.classList.toggle("rotated", expanded);
        winChildren.classList.toggle("expanded", expanded);
      }
    );
    windowsContainer.appendChild(winNode);
  });
  updateStats();
};
function updateStrategyViews(strategies, enabledIds) {
  activeStrategiesList.innerHTML = "";
  const enabledStrategies = enabledIds.map((id) => strategies.find((s) => s.id === id)).filter((s) => !!s);
  enabledStrategies.forEach((strategy) => {
    const row = document.createElement("div");
    row.className = "strategy-row";
    row.dataset.id = strategy.id;
    row.draggable = true;
    const handle = document.createElement("div");
    handle.className = "strategy-drag-handle";
    handle.innerHTML = "\u22EE\u22EE";
    const label = document.createElement("span");
    label.className = "strategy-label";
    label.textContent = strategy.label;
    let tagsHtml = "";
    if (strategy.tags) {
      strategy.tags.forEach((tag) => {
        tagsHtml += `<span class="tag tag-${tag}">${tag}</span>`;
      });
    }
    const contentWrapper = document.createElement("div");
    contentWrapper.style.flex = "1";
    contentWrapper.style.display = "flex";
    contentWrapper.style.alignItems = "center";
    contentWrapper.appendChild(label);
    if (tagsHtml) {
      const tagsContainer = document.createElement("span");
      tagsContainer.innerHTML = tagsHtml;
      contentWrapper.appendChild(tagsContainer);
    }
    const removeBtn = document.createElement("button");
    removeBtn.className = "strategy-remove-btn";
    removeBtn.innerHTML = ICONS.close;
    removeBtn.title = "Remove strategy";
    removeBtn.onclick = async (e) => {
      e.stopPropagation();
      await toggleStrategy(strategy.id, false);
    };
    row.appendChild(handle);
    row.appendChild(contentWrapper);
    if (strategy.isCustom) {
      const autoRunBtn = document.createElement("button");
      autoRunBtn.className = `action-btn auto-run ${strategy.autoRun ? "active" : ""}`;
      autoRunBtn.innerHTML = ICONS.autoRun;
      autoRunBtn.title = `Auto Run: ${strategy.autoRun ? "ON" : "OFF"}`;
      autoRunBtn.style.opacity = strategy.autoRun ? "1" : "0.3";
      autoRunBtn.onclick = async (e) => {
        e.stopPropagation();
        if (!preferences?.customStrategies) return;
        const customStratIndex = preferences.customStrategies.findIndex((s) => s.id === strategy.id);
        if (customStratIndex !== -1) {
          const strat = preferences.customStrategies[customStratIndex];
          strat.autoRun = !strat.autoRun;
          const isActive = !!strat.autoRun;
          autoRunBtn.classList.toggle("active", isActive);
          autoRunBtn.style.opacity = isActive ? "1" : "0.3";
          autoRunBtn.title = `Auto Run: ${isActive ? "ON" : "OFF"}`;
          localPreferencesModifiedTime = Date.now();
          await sendMessage("savePreferences", { customStrategies: preferences.customStrategies });
        }
      };
      row.appendChild(autoRunBtn);
    }
    row.appendChild(removeBtn);
    addDnDListeners(row);
    activeStrategiesList.appendChild(row);
  });
  addStrategySelect.innerHTML = '<option value="" disabled selected>Select Strategy...</option>';
  const disabledStrategies = strategies.filter((s) => !enabledIds.includes(s.id));
  disabledStrategies.sort((a, b) => a.label.localeCompare(b.label));
  const backgroundStrategies = [];
  const availableStrategies = [];
  disabledStrategies.forEach((s) => {
    if (s.isCustom && s.autoRun) {
      backgroundStrategies.push(s);
    } else {
      availableStrategies.push(s);
    }
  });
  [...backgroundStrategies, ...availableStrategies].sort((a, b) => a.label.localeCompare(b.label)).forEach((strategy) => {
    const option = document.createElement("option");
    option.value = strategy.id;
    option.textContent = strategy.label;
    addStrategySelect.appendChild(option);
  });
  addStrategySelect.value = "";
  let bgSection = document.getElementById("backgroundStrategiesSection");
  if (backgroundStrategies.length > 0) {
    if (!bgSection) {
      bgSection = document.createElement("div");
      bgSection.id = "backgroundStrategiesSection";
      bgSection.className = "active-strategies-section";
      bgSection.style.marginTop = "8px";
      bgSection.style.borderTop = "1px dashed var(--border-color)";
      bgSection.style.paddingTop = "8px";
      const header = document.createElement("div");
      header.className = "section-header";
      header.textContent = "Background Auto-Run";
      header.title = "These strategies run automatically but are not used for sorting/grouping order.";
      bgSection.appendChild(header);
      const list2 = document.createElement("div");
      list2.className = "strategy-list";
      bgSection.appendChild(list2);
      activeStrategiesList.parentElement?.after(bgSection);
    }
    const list = bgSection.querySelector(".strategy-list");
    list.innerHTML = "";
    backgroundStrategies.forEach((strategy) => {
      const row = document.createElement("div");
      row.className = "strategy-row";
      row.dataset.id = strategy.id;
      const label = document.createElement("span");
      label.className = "strategy-label";
      label.textContent = strategy.label;
      label.style.opacity = "0.7";
      const autoRunBtn = document.createElement("button");
      autoRunBtn.className = `action-btn auto-run active`;
      autoRunBtn.innerHTML = ICONS.autoRun;
      autoRunBtn.title = `Auto Run: ON (Click to disable)`;
      autoRunBtn.style.marginLeft = "auto";
      autoRunBtn.onclick = async (e) => {
        e.stopPropagation();
        if (!preferences?.customStrategies) return;
        const customStratIndex = preferences.customStrategies.findIndex((s) => s.id === strategy.id);
        if (customStratIndex !== -1) {
          const strat = preferences.customStrategies[customStratIndex];
          strat.autoRun = false;
          localPreferencesModifiedTime = Date.now();
          await sendMessage("savePreferences", { customStrategies: preferences.customStrategies });
          updateStrategyViews(strategies, enabledIds);
        }
      };
      row.appendChild(label);
      row.appendChild(autoRunBtn);
      list.appendChild(row);
    });
  } else {
    if (bgSection) bgSection.remove();
  }
}
async function toggleStrategy(id, enable) {
  if (!preferences) return;
  const allStrategies = getStrategies(preferences.customStrategies);
  const validIds = new Set(allStrategies.map((s) => s.id));
  let current = (preferences.sorting || []).filter((sId) => validIds.has(sId));
  if (enable) {
    if (!current.includes(id)) {
      current.push(id);
    }
  } else {
    current = current.filter((sId) => sId !== id);
  }
  preferences.sorting = current;
  localPreferencesModifiedTime = Date.now();
  await sendMessage("savePreferences", { sorting: current });
  updateStrategyViews(allStrategies, current);
}
function addDnDListeners(row) {
  row.addEventListener("dragstart", (e) => {
    row.classList.add("dragging");
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
    }
  });
  row.addEventListener("dragend", async () => {
    row.classList.remove("dragging");
    if (preferences) {
      const currentSorting = getSelectedSorting();
      const oldSorting = preferences.sorting || [];
      if (JSON.stringify(currentSorting) !== JSON.stringify(oldSorting)) {
        preferences.sorting = currentSorting;
        localPreferencesModifiedTime = Date.now();
        await sendMessage("savePreferences", { sorting: currentSorting });
      }
    }
  });
}
function setupContainerDnD(container) {
  container.addEventListener("dragover", (e) => {
    e.preventDefault();
    const afterElement = getDragAfterElement(container, e.clientY, ".strategy-row:not(.dragging)");
    const draggableRow = document.querySelector(".strategy-row.dragging");
    if (draggableRow && draggableRow.parentElement === container) {
      if (afterElement == null) {
        container.appendChild(draggableRow);
      } else {
        container.insertBefore(draggableRow, afterElement);
      }
    }
  });
}
setupContainerDnD(activeStrategiesList);
var updateUI = (stateData, currentWindow, chromeWindows, isPreliminary = false) => {
  const timeSinceLocalUpdate = Date.now() - localPreferencesModifiedTime;
  const shouldUpdatePreferences = timeSinceLocalUpdate > 2e3;
  if (shouldUpdatePreferences) {
    preferences = stateData.preferences;
  } else {
    if (preferences && stateData.preferences) {
      preferences = {
        ...stateData.preferences,
        sorting: preferences.sorting,
        customStrategies: preferences.customStrategies
      };
    } else if (!preferences) {
      preferences = stateData.preferences;
    }
  }
  if (preferences) {
    const s = preferences.sorting || [];
    setLoggerPreferences(preferences);
    const allStrategies = getStrategies(preferences.customStrategies);
    updateStrategyViews(allStrategies, s);
    if (preferences.theme) {
      applyTheme(preferences.theme, false);
    }
    if (preferences.logLevel) {
      const select = document.getElementById("logLevelSelect");
      if (select) select.value = preferences.logLevel;
    }
  }
  if (currentWindow) {
    focusedWindowId = currentWindow.id ?? null;
  } else {
    focusedWindowId = null;
    console.warn("Failed to get current window");
  }
  const windowTitles = /* @__PURE__ */ new Map();
  chromeWindows.forEach((win) => {
    if (!win.id) return;
    const activeTabTitle = win.tabs?.find((tab) => tab.active)?.title;
    const title = activeTabTitle ?? `Window ${win.id}`;
    windowTitles.set(win.id, title);
  });
  windowState = mapWindows(stateData.groups, windowTitles);
  if (focusedWindowId !== null) {
    windowState.sort((a, b) => {
      if (a.id === focusedWindowId) return -1;
      if (b.id === focusedWindowId) return 1;
      return 0;
    });
  }
  if (!initialSelectionDone && focusedWindowId !== null) {
    const activeWindow = windowState.find((w) => w.id === focusedWindowId);
    if (activeWindow) {
      expandedNodes.add(`w-${activeWindow.id}`);
      activeWindow.tabs.forEach((t) => selectedTabs.add(t.id));
      initialSelectionDone = true;
    }
  }
  if (!isPreliminary) {
    initialSelectionDone = true;
  }
  renderTree();
};
var loadState = async () => {
  logInfo("Loading popup state");
  let bgFinished = false;
  const fastLoad = async () => {
    try {
      const [localRes, cw, aw] = await Promise.all([
        fetchLocalState(),
        chrome.windows.getCurrent().catch(() => void 0),
        chrome.windows.getAll({ windowTypes: ["normal"], populate: true }).catch(() => [])
      ]);
      if (!bgFinished && localRes.ok && localRes.data) {
        updateUI(localRes.data, cw, aw, true);
      }
    } catch (e) {
      console.warn("Fast load failed", e);
    }
  };
  const bgLoad = async () => {
    try {
      const [bgRes, cw, aw] = await Promise.all([
        fetchState(),
        chrome.windows.getCurrent().catch(() => void 0),
        chrome.windows.getAll({ windowTypes: ["normal"], populate: true }).catch(() => [])
      ]);
      bgFinished = true;
      if (bgRes.ok && bgRes.data) {
        updateUI(bgRes.data, cw, aw);
      } else {
        console.error("Failed to load state:", bgRes.error ?? "Unknown error");
        if (windowState.length === 0) {
          windowsContainer.innerHTML = `<div class="error-state" style="padding: 20px; color: var(--error-color, red); text-align: center;">
                    Failed to load tabs: ${bgRes.error ?? "Unknown error"}.<br>
                    Please reload the extension or check permissions.
                </div>`;
        }
      }
    } catch (e) {
      console.error("Error loading state:", e);
    }
  };
  await Promise.all([fastLoad(), bgLoad()]);
};
var getSelectedSorting = () => {
  return Array.from(activeStrategiesList.children).map((row) => row.dataset.id);
};
addStrategySelect.addEventListener("change", async (e) => {
  const select = e.target;
  const id = select.value;
  if (id) {
    await toggleStrategy(id, true);
    select.value = "";
  }
});
var triggerGroup = async (selection) => {
  logInfo("Triggering grouping", { selection });
  showLoading("Applying Strategy...");
  try {
    const sorting = getSelectedSorting();
    await applyGrouping({ selection, sorting });
    await loadState();
  } finally {
    hideLoading();
  }
};
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "groupingProgress") {
    const { completed, total } = message.payload;
    updateProgress(completed, total);
  }
});
selectAllCheckbox.addEventListener("change", (e) => {
  const targetState = e.target.checked;
  if (targetState) {
    windowState.forEach((win) => {
      win.tabs.forEach((tab) => selectedTabs.add(tab.id));
    });
  } else {
    selectedTabs.clear();
  }
  renderTree();
});
btnApply?.addEventListener("click", () => {
  logInfo("Apply button clicked", { selectedCount: selectedTabs.size });
  triggerGroup({ tabIds: Array.from(selectedTabs) });
});
btnUngroup.addEventListener("click", async () => {
  if (confirm(`Ungroup ${selectedTabs.size} tabs?`)) {
    logInfo("Ungrouping tabs", { count: selectedTabs.size });
    await chrome.tabs.ungroup(Array.from(selectedTabs));
    await loadState();
  }
});
btnMerge.addEventListener("click", async () => {
  if (confirm(`Merge ${selectedTabs.size} tabs into one group?`)) {
    logInfo("Merging tabs", { count: selectedTabs.size });
    const res = await sendMessage("mergeSelection", { tabIds: Array.from(selectedTabs) });
    if (!res.ok) alert("Merge failed: " + res.error);
    else await loadState();
  }
});
btnSplit.addEventListener("click", async () => {
  if (confirm(`Split ${selectedTabs.size} tabs into a new window?`)) {
    logInfo("Splitting tabs", { count: selectedTabs.size });
    const res = await sendMessage("splitSelection", { tabIds: Array.from(selectedTabs) });
    if (!res.ok) alert("Split failed: " + res.error);
    else await loadState();
  }
});
btnExpandAll?.addEventListener("click", () => {
  windowState.forEach((win) => {
    expandedNodes.add(`w-${win.id}`);
    win.tabs.forEach((tab) => {
      if (tab.groupLabel) {
        expandedNodes.add(`w-${win.id}-g-${tab.groupLabel}`);
      }
    });
  });
  renderTree();
});
btnCollapseAll?.addEventListener("click", () => {
  expandedNodes.clear();
  renderTree();
});
document.getElementById("btnUndo")?.addEventListener("click", async () => {
  logInfo("Undo clicked");
  const res = await sendMessage("undo");
  if (!res.ok) alert("Undo failed: " + res.error);
});
document.getElementById("btnSaveState")?.addEventListener("click", async () => {
  const name = prompt("Enter a name for this state:");
  if (name) {
    logInfo("Saving state", { name });
    const res = await sendMessage("saveState", { name });
    if (!res.ok) alert("Save failed: " + res.error);
  }
});
var loadStateDialog = document.getElementById("loadStateDialog");
var savedStateList = document.getElementById("savedStateList");
document.getElementById("btnLoadState")?.addEventListener("click", async () => {
  logInfo("Opening Load State dialog");
  const res = await sendMessage("getSavedStates");
  if (res.ok && res.data) {
    savedStateList.innerHTML = "";
    res.data.forEach((state) => {
      const li = document.createElement("li");
      li.style.display = "flex";
      li.style.justifyContent = "space-between";
      li.style.padding = "8px";
      li.style.borderBottom = "1px solid var(--border-color)";
      const span = document.createElement("span");
      span.textContent = `${state.name} (${new Date(state.timestamp).toLocaleString()})`;
      span.style.cursor = "pointer";
      span.onclick = async () => {
        if (confirm(`Load state "${state.name}"?`)) {
          logInfo("Restoring state", { name: state.name });
          const r = await sendMessage("restoreState", { state });
          if (r.ok) {
            loadStateDialog.close();
            window.close();
          } else {
            alert("Restore failed: " + r.error);
          }
        }
      };
      const delBtn = document.createElement("button");
      delBtn.textContent = "Delete";
      delBtn.style.marginLeft = "8px";
      delBtn.style.background = "transparent";
      delBtn.style.color = "var(--text-color)";
      delBtn.style.border = "1px solid var(--border-color)";
      delBtn.style.borderRadius = "4px";
      delBtn.style.padding = "2px 6px";
      delBtn.onclick = async (e) => {
        e.stopPropagation();
        if (confirm(`Delete state "${state.name}"?`)) {
          await sendMessage("deleteSavedState", { name: state.name });
          li.remove();
        }
      };
      li.appendChild(span);
      li.appendChild(delBtn);
      savedStateList.appendChild(li);
    });
    loadStateDialog.showModal();
  } else {
    alert("Failed to load states: " + res.error);
  }
});
document.getElementById("btnCloseLoadState")?.addEventListener("click", () => {
  loadStateDialog.close();
});
searchInput.addEventListener("input", renderTree);
chrome.tabs.onUpdated.addListener(() => loadState());
chrome.tabs.onRemoved.addListener(() => loadState());
chrome.windows.onRemoved.addListener(() => loadState());
var btnTheme = document.getElementById("btnTheme");
var iconSun = document.getElementById("iconSun");
var iconMoon = document.getElementById("iconMoon");
var applyTheme = (theme, save = false) => {
  if (theme === "light") {
    document.body.classList.add("light-mode");
    if (iconSun) iconSun.style.display = "block";
    if (iconMoon) iconMoon.style.display = "none";
  } else {
    document.body.classList.remove("light-mode");
    if (iconSun) iconSun.style.display = "none";
    if (iconMoon) iconMoon.style.display = "block";
  }
  if (save) {
    logInfo("Applying theme", { theme });
    localPreferencesModifiedTime = Date.now();
    sendMessage("savePreferences", { theme });
  }
};
var storedTheme = localStorage.getItem("theme");
if (storedTheme) applyTheme(storedTheme, false);
btnTheme?.addEventListener("click", () => {
  const isLight = document.body.classList.contains("light-mode");
  const newTheme = isLight ? "dark" : "light";
  localStorage.setItem("theme", newTheme);
  applyTheme(newTheme, true);
});
var settingsDialog = document.getElementById("settingsDialog");
document.getElementById("btnSettings")?.addEventListener("click", () => {
  settingsDialog.showModal();
});
document.getElementById("btnCloseSettings")?.addEventListener("click", () => {
  settingsDialog.close();
});
var logLevelSelect = document.getElementById("logLevelSelect");
logLevelSelect?.addEventListener("change", async () => {
  const newLevel = logLevelSelect.value;
  if (preferences) {
    preferences.logLevel = newLevel;
    setLoggerPreferences(preferences);
    localPreferencesModifiedTime = Date.now();
    await sendMessage("savePreferences", { logLevel: newLevel });
    logDebug("Log level updated", { level: newLevel });
  }
});
var btnPin = document.getElementById("btnPin");
btnPin?.addEventListener("click", async () => {
  const url = chrome.runtime.getURL("ui/popup.html");
  await chrome.windows.create({
    url,
    type: "popup",
    width: document.body.offsetWidth,
    height: document.body.offsetHeight
  });
  window.close();
});
var resizeHandle = document.getElementById("resizeHandle");
if (resizeHandle) {
  const saveSize = (w, h) => {
    localStorage.setItem("popupSize", JSON.stringify({ width: w, height: h }));
  };
  resizeHandle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = document.body.offsetWidth;
    const startHeight = document.body.offsetHeight;
    const onMouseMove = (ev) => {
      const newWidth = Math.max(500, startWidth + (ev.clientX - startX));
      const newHeight = Math.max(500, startHeight + (ev.clientY - startY));
      document.body.style.width = `${newWidth}px`;
      document.body.style.height = `${newHeight}px`;
    };
    const onMouseUp = (ev) => {
      const newWidth = Math.max(500, startWidth + (ev.clientX - startX));
      const newHeight = Math.max(500, startHeight + (ev.clientY - startY));
      saveSize(newWidth, newHeight);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });
}
var adjustForWindowType = async () => {
  try {
    const win = await chrome.windows.getCurrent();
    if (win.type === "popup") {
      if (btnPin) btnPin.style.display = "none";
      if (resizeHandle) resizeHandle.style.display = "block";
      document.body.style.width = "100%";
      document.body.style.height = "100%";
    } else {
      if (resizeHandle) resizeHandle.style.display = "none";
      document.body.style.width = "";
      document.body.style.height = "";
    }
  } catch (e) {
    console.error("Error checking window type:", e);
  }
};
adjustForWindowType();
loadState().catch((e) => console.error("Load state failed", e));
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3NoYXJlZC91dGlscy50cyIsICIuLi8uLi9zcmMvc2hhcmVkL3N0cmF0ZWd5UmVnaXN0cnkudHMiLCAiLi4vLi4vc3JjL3NoYXJlZC9sb2dnZXIudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZ3JvdXBpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3NvcnRpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy91aS9sb2NhbFN0YXRlLnRzIiwgIi4uLy4uL3NyYy91aS9jb21tb24udHMiLCAiLi4vLi4vc3JjL3VpL3BvcHVwLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyBQcmVmZXJlbmNlcywgU29ydGluZ1N0cmF0ZWd5LCBUYWJNZXRhZGF0YSB9IGZyb20gXCIuL3R5cGVzLmpzXCI7XG5cbmV4cG9ydCBjb25zdCBtYXBDaHJvbWVUYWIgPSAodGFiOiBjaHJvbWUudGFicy5UYWIpOiBUYWJNZXRhZGF0YSB8IG51bGwgPT4ge1xuICBpZiAoIXRhYi5pZCB8fCB0YWIuaWQgPT09IGNocm9tZS50YWJzLlRBQl9JRF9OT05FIHx8ICF0YWIud2luZG93SWQpIHJldHVybiBudWxsO1xuICByZXR1cm4ge1xuICAgIGlkOiB0YWIuaWQsXG4gICAgd2luZG93SWQ6IHRhYi53aW5kb3dJZCxcbiAgICB0aXRsZTogdGFiLnRpdGxlIHx8IFwiVW50aXRsZWRcIixcbiAgICB1cmw6IHRhYi5wZW5kaW5nVXJsIHx8IHRhYi51cmwgfHwgXCJhYm91dDpibGFua1wiLFxuICAgIHBpbm5lZDogQm9vbGVhbih0YWIucGlubmVkKSxcbiAgICBsYXN0QWNjZXNzZWQ6IHRhYi5sYXN0QWNjZXNzZWQsXG4gICAgb3BlbmVyVGFiSWQ6IHRhYi5vcGVuZXJUYWJJZCA/PyB1bmRlZmluZWQsXG4gICAgZmF2SWNvblVybDogdGFiLmZhdkljb25VcmwsXG4gICAgZ3JvdXBJZDogdGFiLmdyb3VwSWQsXG4gICAgaW5kZXg6IHRhYi5pbmRleCxcbiAgICBhY3RpdmU6IHRhYi5hY3RpdmUsXG4gICAgc3RhdHVzOiB0YWIuc3RhdHVzLFxuICAgIHNlbGVjdGVkOiB0YWIuaGlnaGxpZ2h0ZWRcbiAgfTtcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRTdG9yZWRQcmVmZXJlbmNlcyA9IGFzeW5jICgpOiBQcm9taXNlPFByZWZlcmVuY2VzIHwgbnVsbD4gPT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoXCJwcmVmZXJlbmNlc1wiLCAoaXRlbXMpID0+IHtcbiAgICAgIHJlc29sdmUoKGl0ZW1zW1wicHJlZmVyZW5jZXNcIl0gYXMgUHJlZmVyZW5jZXMpID8/IG51bGwpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBhc0FycmF5ID0gPFQ+KHZhbHVlOiB1bmtub3duKTogVFtdID0+IHtcbiAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHJldHVybiB2YWx1ZSBhcyBUW107XG4gICAgcmV0dXJuIFtdO1xufTtcbiIsICJpbXBvcnQgeyBDdXN0b21TdHJhdGVneSwgU29ydGluZ1N0cmF0ZWd5IH0gZnJvbSBcIi4vdHlwZXMuanNcIjtcblxuZXhwb3J0IGludGVyZmFjZSBTdHJhdGVneURlZmluaXRpb24ge1xuICAgIGlkOiBTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmc7XG4gICAgbGFiZWw6IHN0cmluZztcbiAgICBpc0dyb3VwaW5nOiBib29sZWFuO1xuICAgIGlzU29ydGluZzogYm9vbGVhbjtcbiAgICB0YWdzPzogc3RyaW5nW107XG4gICAgYXV0b1J1bj86IGJvb2xlYW47XG4gICAgaXNDdXN0b20/OiBib29sZWFuO1xufVxuXG4vLyBSZXN0b3JlZCBzdHJhdGVnaWVzIG1hdGNoaW5nIGJhY2tncm91bmQgY2FwYWJpbGl0aWVzLlxuZXhwb3J0IGNvbnN0IFNUUkFURUdJRVM6IFN0cmF0ZWd5RGVmaW5pdGlvbltdID0gW1xuICAgIHsgaWQ6IFwiZG9tYWluXCIsIGxhYmVsOiBcIkRvbWFpblwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwiZG9tYWluX2Z1bGxcIiwgbGFiZWw6IFwiRnVsbCBEb21haW5cIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInRvcGljXCIsIGxhYmVsOiBcIlRvcGljXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJjb250ZXh0XCIsIGxhYmVsOiBcIkNvbnRleHRcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImxpbmVhZ2VcIiwgbGFiZWw6IFwiTGluZWFnZVwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwicGlubmVkXCIsIGxhYmVsOiBcIlBpbm5lZFwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwicmVjZW5jeVwiLCBsYWJlbDogXCJSZWNlbmN5XCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJhZ2VcIiwgbGFiZWw6IFwiQWdlXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJ1cmxcIiwgbGFiZWw6IFwiVVJMXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJuZXN0aW5nXCIsIGxhYmVsOiBcIk5lc3RpbmdcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInRpdGxlXCIsIGxhYmVsOiBcIlRpdGxlXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG5dO1xuXG5leHBvcnQgY29uc3QgZ2V0U3RyYXRlZ2llcyA9IChjdXN0b21TdHJhdGVnaWVzPzogQ3VzdG9tU3RyYXRlZ3lbXSk6IFN0cmF0ZWd5RGVmaW5pdGlvbltdID0+IHtcbiAgICBpZiAoIWN1c3RvbVN0cmF0ZWdpZXMgfHwgY3VzdG9tU3RyYXRlZ2llcy5sZW5ndGggPT09IDApIHJldHVybiBTVFJBVEVHSUVTO1xuXG4gICAgLy8gQ3VzdG9tIHN0cmF0ZWdpZXMgY2FuIG92ZXJyaWRlIGJ1aWx0LWlucyBpZiBJRHMgbWF0Y2gsIG9yIGFkZCBuZXcgb25lcy5cbiAgICBjb25zdCBjb21iaW5lZCA9IFsuLi5TVFJBVEVHSUVTXTtcblxuICAgIGN1c3RvbVN0cmF0ZWdpZXMuZm9yRWFjaChjdXN0b20gPT4ge1xuICAgICAgICBjb25zdCBleGlzdGluZ0luZGV4ID0gY29tYmluZWQuZmluZEluZGV4KHMgPT4gcy5pZCA9PT0gY3VzdG9tLmlkKTtcblxuICAgICAgICAvLyBEZXRlcm1pbmUgY2FwYWJpbGl0aWVzIGJhc2VkIG9uIHJ1bGVzIHByZXNlbmNlXG4gICAgICAgIGNvbnN0IGhhc0dyb3VwaW5nID0gKGN1c3RvbS5ncm91cGluZ1J1bGVzICYmIGN1c3RvbS5ncm91cGluZ1J1bGVzLmxlbmd0aCA+IDApIHx8IChjdXN0b20ucnVsZXMgJiYgY3VzdG9tLnJ1bGVzLmxlbmd0aCA+IDApIHx8IGZhbHNlO1xuICAgICAgICBjb25zdCBoYXNTb3J0aW5nID0gKGN1c3RvbS5zb3J0aW5nUnVsZXMgJiYgY3VzdG9tLnNvcnRpbmdSdWxlcy5sZW5ndGggPiAwKSB8fCAoY3VzdG9tLnJ1bGVzICYmIGN1c3RvbS5ydWxlcy5sZW5ndGggPiAwKSB8fCBmYWxzZTtcblxuICAgICAgICBjb25zdCB0YWdzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBpZiAoaGFzR3JvdXBpbmcpIHRhZ3MucHVzaChcImdyb3VwXCIpO1xuICAgICAgICBpZiAoaGFzU29ydGluZykgdGFncy5wdXNoKFwic29ydFwiKTtcblxuICAgICAgICBjb25zdCBkZWZpbml0aW9uOiBTdHJhdGVneURlZmluaXRpb24gPSB7XG4gICAgICAgICAgICBpZDogY3VzdG9tLmlkLFxuICAgICAgICAgICAgbGFiZWw6IGN1c3RvbS5sYWJlbCxcbiAgICAgICAgICAgIGlzR3JvdXBpbmc6IGhhc0dyb3VwaW5nLFxuICAgICAgICAgICAgaXNTb3J0aW5nOiBoYXNTb3J0aW5nLFxuICAgICAgICAgICAgdGFnczogdGFncyxcbiAgICAgICAgICAgIGF1dG9SdW46IGN1c3RvbS5hdXRvUnVuLFxuICAgICAgICAgICAgaXNDdXN0b206IHRydWVcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAoZXhpc3RpbmdJbmRleCAhPT0gLTEpIHtcbiAgICAgICAgICAgIGNvbWJpbmVkW2V4aXN0aW5nSW5kZXhdID0gZGVmaW5pdGlvbjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbWJpbmVkLnB1c2goZGVmaW5pdGlvbik7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBjb21iaW5lZDtcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRTdHJhdGVneSA9IChpZDogU29ydGluZ1N0cmF0ZWd5IHwgc3RyaW5nKTogU3RyYXRlZ3lEZWZpbml0aW9uIHwgdW5kZWZpbmVkID0+IFNUUkFURUdJRVMuZmluZChzID0+IHMuaWQgPT09IGlkKTtcbiIsICJpbXBvcnQgeyBMb2dFbnRyeSwgTG9nTGV2ZWwsIFByZWZlcmVuY2VzIH0gZnJvbSBcIi4vdHlwZXMuanNcIjtcblxuY29uc3QgUFJFRklYID0gXCJbVGFiU29ydGVyXVwiO1xuXG5jb25zdCBMRVZFTF9QUklPUklUWTogUmVjb3JkPExvZ0xldmVsLCBudW1iZXI+ID0ge1xuICBkZWJ1ZzogMCxcbiAgaW5mbzogMSxcbiAgd2FybjogMixcbiAgZXJyb3I6IDMsXG4gIGNyaXRpY2FsOiA0XG59O1xuXG5sZXQgY3VycmVudExldmVsOiBMb2dMZXZlbCA9IFwiaW5mb1wiO1xubGV0IGxvZ3M6IExvZ0VudHJ5W10gPSBbXTtcbmNvbnN0IE1BWF9MT0dTID0gMTAwMDtcbmNvbnN0IFNUT1JBR0VfS0VZID0gXCJzZXNzaW9uTG9nc1wiO1xuXG4vLyBTYWZlIGNvbnRleHQgY2hlY2tcbmNvbnN0IGlzU2VydmljZVdvcmtlciA9IHR5cGVvZiBzZWxmICE9PSAndW5kZWZpbmVkJyAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZW9mIChzZWxmIGFzIGFueSkuU2VydmljZVdvcmtlckdsb2JhbFNjb3BlICE9PSAndW5kZWZpbmVkJyAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZiBpbnN0YW5jZW9mIChzZWxmIGFzIGFueSkuU2VydmljZVdvcmtlckdsb2JhbFNjb3BlO1xubGV0IGlzU2F2aW5nID0gZmFsc2U7XG5sZXQgcGVuZGluZ1NhdmUgPSBmYWxzZTtcbmxldCBzYXZlVGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgbnVsbCA9IG51bGw7XG5cbmNvbnN0IGRvU2F2ZSA9ICgpID0+IHtcbiAgICBpZiAoIWlzU2VydmljZVdvcmtlciB8fCAhY2hyb21lPy5zdG9yYWdlPy5zZXNzaW9uIHx8IGlzU2F2aW5nKSB7XG4gICAgICAgIHBlbmRpbmdTYXZlID0gdHJ1ZTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlzU2F2aW5nID0gdHJ1ZTtcbiAgICBwZW5kaW5nU2F2ZSA9IGZhbHNlO1xuXG4gICAgY2hyb21lLnN0b3JhZ2Uuc2Vzc2lvbi5zZXQoeyBbU1RPUkFHRV9LRVldOiBsb2dzIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICBpc1NhdmluZyA9IGZhbHNlO1xuICAgICAgICBpZiAocGVuZGluZ1NhdmUpIHtcbiAgICAgICAgICAgIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG4gICAgICAgIH1cbiAgICB9KS5jYXRjaChlcnIgPT4ge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIHNhdmUgbG9nc1wiLCBlcnIpO1xuICAgICAgICBpc1NhdmluZyA9IGZhbHNlO1xuICAgIH0pO1xufTtcblxuY29uc3Qgc2F2ZUxvZ3NUb1N0b3JhZ2UgPSAoKSA9PiB7XG4gICAgaWYgKHNhdmVUaW1lcikgY2xlYXJUaW1lb3V0KHNhdmVUaW1lcik7XG4gICAgc2F2ZVRpbWVyID0gc2V0VGltZW91dChkb1NhdmUsIDEwMDApO1xufTtcblxubGV0IHJlc29sdmVMb2dnZXJSZWFkeTogKCkgPT4gdm9pZDtcbmV4cG9ydCBjb25zdCBsb2dnZXJSZWFkeSA9IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuICAgIHJlc29sdmVMb2dnZXJSZWFkeSA9IHJlc29sdmU7XG59KTtcblxuZXhwb3J0IGNvbnN0IGluaXRMb2dnZXIgPSBhc3luYyAoKSA9PiB7XG4gICAgaWYgKGlzU2VydmljZVdvcmtlciAmJiBjaHJvbWU/LnN0b3JhZ2U/LnNlc3Npb24pIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNocm9tZS5zdG9yYWdlLnNlc3Npb24uZ2V0KFNUT1JBR0VfS0VZKTtcbiAgICAgICAgICAgIGlmIChyZXN1bHRbU1RPUkFHRV9LRVldICYmIEFycmF5LmlzQXJyYXkocmVzdWx0W1NUT1JBR0VfS0VZXSkpIHtcbiAgICAgICAgICAgICAgICBsb2dzID0gcmVzdWx0W1NUT1JBR0VfS0VZXTtcbiAgICAgICAgICAgICAgICBpZiAobG9ncy5sZW5ndGggPiBNQVhfTE9HUykgbG9ncyA9IGxvZ3Muc2xpY2UoMCwgTUFYX0xPR1MpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIHJlc3RvcmUgbG9nc1wiLCBlKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAocmVzb2x2ZUxvZ2dlclJlYWR5KSByZXNvbHZlTG9nZ2VyUmVhZHkoKTtcbn07XG5cbmV4cG9ydCBjb25zdCBzZXRMb2dnZXJQcmVmZXJlbmNlcyA9IChwcmVmczogUHJlZmVyZW5jZXMpID0+IHtcbiAgaWYgKHByZWZzLmxvZ0xldmVsKSB7XG4gICAgY3VycmVudExldmVsID0gcHJlZnMubG9nTGV2ZWw7XG4gIH0gZWxzZSBpZiAocHJlZnMuZGVidWcpIHtcbiAgICBjdXJyZW50TGV2ZWwgPSBcImRlYnVnXCI7XG4gIH0gZWxzZSB7XG4gICAgY3VycmVudExldmVsID0gXCJpbmZvXCI7XG4gIH1cbn07XG5cbmNvbnN0IHNob3VsZExvZyA9IChsZXZlbDogTG9nTGV2ZWwpOiBib29sZWFuID0+IHtcbiAgcmV0dXJuIExFVkVMX1BSSU9SSVRZW2xldmVsXSA+PSBMRVZFTF9QUklPUklUWVtjdXJyZW50TGV2ZWxdO1xufTtcblxuY29uc3QgZm9ybWF0TWVzc2FnZSA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICByZXR1cm4gY29udGV4dCA/IGAke21lc3NhZ2V9IDo6ICR7SlNPTi5zdHJpbmdpZnkoY29udGV4dCl9YCA6IG1lc3NhZ2U7XG59O1xuXG5jb25zdCBhZGRMb2cgPSAobGV2ZWw6IExvZ0xldmVsLCBtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBpZiAoc2hvdWxkTG9nKGxldmVsKSkge1xuICAgICAgY29uc3QgZW50cnk6IExvZ0VudHJ5ID0ge1xuICAgICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcbiAgICAgICAgICBsZXZlbCxcbiAgICAgICAgICBtZXNzYWdlLFxuICAgICAgICAgIGNvbnRleHRcbiAgICAgIH07XG5cbiAgICAgIGlmIChpc1NlcnZpY2VXb3JrZXIpIHtcbiAgICAgICAgICBsb2dzLnVuc2hpZnQoZW50cnkpO1xuICAgICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSB7XG4gICAgICAgICAgICAgIGxvZ3MucG9wKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIEluIG90aGVyIGNvbnRleHRzLCBzZW5kIHRvIFNXXG4gICAgICAgICAgaWYgKGNocm9tZT8ucnVudGltZT8uc2VuZE1lc3NhZ2UpIHtcbiAgICAgICAgICAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdsb2dFbnRyeScsIHBheWxvYWQ6IGVudHJ5IH0pLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgLy8gSWdub3JlIGlmIG1lc3NhZ2UgZmFpbHMgKGUuZy4gY29udGV4dCBpbnZhbGlkYXRlZClcbiAgICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICB9XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBhZGRMb2dFbnRyeSA9IChlbnRyeTogTG9nRW50cnkpID0+IHtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSB7XG4gICAgICAgIGxvZ3MudW5zaGlmdChlbnRyeSk7XG4gICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSB7XG4gICAgICAgICAgICBsb2dzLnBvcCgpO1xuICAgICAgICB9XG4gICAgICAgIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG4gICAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGdldExvZ3MgPSAoKSA9PiBbLi4ubG9nc107XG5leHBvcnQgY29uc3QgY2xlYXJMb2dzID0gKCkgPT4ge1xuICAgIGxvZ3MubGVuZ3RoID0gMDtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSBzYXZlTG9nc1RvU3RvcmFnZSgpO1xufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0RlYnVnID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImRlYnVnXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwiZGVidWdcIikpIHtcbiAgICBjb25zb2xlLmRlYnVnKGAke1BSRUZJWH0gW0RFQlVHXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgY29udGV4dCl9YCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBsb2dJbmZvID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImluZm9cIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJpbmZvXCIpKSB7XG4gICAgY29uc29sZS5pbmZvKGAke1BSRUZJWH0gW0lORk9dICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ1dhcm4gPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwid2FyblwiLCBtZXNzYWdlLCBjb250ZXh0KTtcbiAgaWYgKHNob3VsZExvZyhcIndhcm5cIikpIHtcbiAgICBjb25zb2xlLndhcm4oYCR7UFJFRklYfSBbV0FSTl0gJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nRXJyb3IgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwiZXJyb3JcIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJlcnJvclwiKSkge1xuICAgIGNvbnNvbGUuZXJyb3IoYCR7UFJFRklYfSBbRVJST1JdICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0NyaXRpY2FsID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImNyaXRpY2FsXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwiY3JpdGljYWxcIikpIHtcbiAgICAvLyBDcml0aWNhbCBsb2dzIHVzZSBlcnJvciBjb25zb2xlIGJ1dCB3aXRoIGRpc3RpbmN0IHByZWZpeCBhbmQgbWF5YmUgc3R5bGluZyBpZiBzdXBwb3J0ZWRcbiAgICBjb25zb2xlLmVycm9yKGAke1BSRUZJWH0gW0NSSVRJQ0FMXSBcdUQ4M0RcdURFQTggJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuIiwgImltcG9ydCB7IEdyb3VwaW5nU3RyYXRlZ3ksIFNvcnRpbmdTdHJhdGVneSwgVGFiR3JvdXAsIFRhYk1ldGFkYXRhLCBDdXN0b21TdHJhdGVneSwgU3RyYXRlZ3lSdWxlLCBSdWxlQ29uZGl0aW9uLCBHcm91cGluZ1J1bGUsIFNvcnRpbmdSdWxlIH0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgZ2V0U3RyYXRlZ2llcyB9IGZyb20gXCIuLi9zaGFyZWQvc3RyYXRlZ3lSZWdpc3RyeS5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcblxubGV0IGN1c3RvbVN0cmF0ZWdpZXM6IEN1c3RvbVN0cmF0ZWd5W10gPSBbXTtcblxuZXhwb3J0IGNvbnN0IHNldEN1c3RvbVN0cmF0ZWdpZXMgPSAoc3RyYXRlZ2llczogQ3VzdG9tU3RyYXRlZ3lbXSkgPT4ge1xuICAgIGN1c3RvbVN0cmF0ZWdpZXMgPSBzdHJhdGVnaWVzO1xufTtcblxuZXhwb3J0IGNvbnN0IGdldEN1c3RvbVN0cmF0ZWdpZXMgPSAoKTogQ3VzdG9tU3RyYXRlZ3lbXSA9PiBjdXN0b21TdHJhdGVnaWVzO1xuXG5jb25zdCBDT0xPUlMgPSBbXCJncmV5XCIsIFwiYmx1ZVwiLCBcInJlZFwiLCBcInllbGxvd1wiLCBcImdyZWVuXCIsIFwicGlua1wiLCBcInB1cnBsZVwiLCBcImN5YW5cIiwgXCJvcmFuZ2VcIl07XG5cbmNvbnN0IHJlZ2V4Q2FjaGUgPSBuZXcgTWFwPHN0cmluZywgUmVnRXhwPigpO1xuY29uc3QgZG9tYWluQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuY29uc3Qgc3ViZG9tYWluQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuY29uc3QgTUFYX0NBQ0hFX1NJWkUgPSAxMDAwO1xuXG5leHBvcnQgY29uc3QgZG9tYWluRnJvbVVybCA9ICh1cmw6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGlmIChkb21haW5DYWNoZS5oYXModXJsKSkgcmV0dXJuIGRvbWFpbkNhY2hlLmdldCh1cmwpITtcblxuICB0cnkge1xuICAgIGNvbnN0IHBhcnNlZCA9IG5ldyBVUkwodXJsKTtcbiAgICBjb25zdCBkb21haW4gPSBwYXJzZWQuaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sIFwiXCIpO1xuXG4gICAgaWYgKGRvbWFpbkNhY2hlLnNpemUgPj0gTUFYX0NBQ0hFX1NJWkUpIGRvbWFpbkNhY2hlLmNsZWFyKCk7XG4gICAgZG9tYWluQ2FjaGUuc2V0KHVybCwgZG9tYWluKTtcblxuICAgIHJldHVybiBkb21haW47XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgbG9nRGVidWcoXCJGYWlsZWQgdG8gcGFyc2UgZG9tYWluXCIsIHsgdXJsLCBlcnJvcjogU3RyaW5nKGVycm9yKSB9KTtcbiAgICByZXR1cm4gXCJ1bmtub3duXCI7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBzdWJkb21haW5Gcm9tVXJsID0gKHVybDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICBpZiAoc3ViZG9tYWluQ2FjaGUuaGFzKHVybCkpIHJldHVybiBzdWJkb21haW5DYWNoZS5nZXQodXJsKSE7XG5cbiAgICB0cnkge1xuICAgICAgICBjb25zdCBwYXJzZWQgPSBuZXcgVVJMKHVybCk7XG4gICAgICAgIGxldCBob3N0bmFtZSA9IHBhcnNlZC5ob3N0bmFtZTtcbiAgICAgICAgLy8gUmVtb3ZlIHd3dy5cbiAgICAgICAgaG9zdG5hbWUgPSBob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgXCJcIik7XG5cbiAgICAgICAgbGV0IHJlc3VsdCA9IFwiXCI7XG4gICAgICAgIGNvbnN0IHBhcnRzID0gaG9zdG5hbWUuc3BsaXQoJy4nKTtcbiAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDIpIHtcbiAgICAgICAgICAgICByZXN1bHQgPSBwYXJ0cy5zbGljZSgwLCBwYXJ0cy5sZW5ndGggLSAyKS5qb2luKCcuJyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3ViZG9tYWluQ2FjaGUuc2l6ZSA+PSBNQVhfQ0FDSEVfU0laRSkgc3ViZG9tYWluQ2FjaGUuY2xlYXIoKTtcbiAgICAgICAgc3ViZG9tYWluQ2FjaGUuc2V0KHVybCwgcmVzdWx0KTtcblxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gXCJcIjtcbiAgICB9XG59XG5cbmNvbnN0IGdldE5lc3RlZFByb3BlcnR5ID0gKG9iajogdW5rbm93biwgcGF0aDogc3RyaW5nKTogdW5rbm93biA9PiB7XG4gICAgaWYgKCFvYmogfHwgdHlwZW9mIG9iaiAhPT0gJ29iamVjdCcpIHJldHVybiB1bmRlZmluZWQ7XG5cbiAgICBpZiAoIXBhdGguaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICByZXR1cm4gKG9iaiBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbcGF0aF07XG4gICAgfVxuXG4gICAgY29uc3QgcGFydHMgPSBwYXRoLnNwbGl0KCcuJyk7XG4gICAgbGV0IGN1cnJlbnQ6IHVua25vd24gPSBvYmo7XG5cbiAgICBmb3IgKGNvbnN0IGtleSBvZiBwYXJ0cykge1xuICAgICAgICBpZiAoIWN1cnJlbnQgfHwgdHlwZW9mIGN1cnJlbnQgIT09ICdvYmplY3QnKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICBjdXJyZW50ID0gKGN1cnJlbnQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW2tleV07XG4gICAgfVxuXG4gICAgcmV0dXJuIGN1cnJlbnQ7XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0RmllbGRWYWx1ZSA9ICh0YWI6IFRhYk1ldGFkYXRhLCBmaWVsZDogc3RyaW5nKTogYW55ID0+IHtcbiAgICBzd2l0Y2goZmllbGQpIHtcbiAgICAgICAgY2FzZSAnaWQnOiByZXR1cm4gdGFiLmlkO1xuICAgICAgICBjYXNlICdpbmRleCc6IHJldHVybiB0YWIuaW5kZXg7XG4gICAgICAgIGNhc2UgJ3dpbmRvd0lkJzogcmV0dXJuIHRhYi53aW5kb3dJZDtcbiAgICAgICAgY2FzZSAnZ3JvdXBJZCc6IHJldHVybiB0YWIuZ3JvdXBJZDtcbiAgICAgICAgY2FzZSAndGl0bGUnOiByZXR1cm4gdGFiLnRpdGxlO1xuICAgICAgICBjYXNlICd1cmwnOiByZXR1cm4gdGFiLnVybDtcbiAgICAgICAgY2FzZSAnc3RhdHVzJzogcmV0dXJuIHRhYi5zdGF0dXM7XG4gICAgICAgIGNhc2UgJ2FjdGl2ZSc6IHJldHVybiB0YWIuYWN0aXZlO1xuICAgICAgICBjYXNlICdzZWxlY3RlZCc6IHJldHVybiB0YWIuc2VsZWN0ZWQ7XG4gICAgICAgIGNhc2UgJ3Bpbm5lZCc6IHJldHVybiB0YWIucGlubmVkO1xuICAgICAgICBjYXNlICdvcGVuZXJUYWJJZCc6IHJldHVybiB0YWIub3BlbmVyVGFiSWQ7XG4gICAgICAgIGNhc2UgJ2xhc3RBY2Nlc3NlZCc6IHJldHVybiB0YWIubGFzdEFjY2Vzc2VkO1xuICAgICAgICBjYXNlICdjb250ZXh0JzogcmV0dXJuIHRhYi5jb250ZXh0O1xuICAgICAgICBjYXNlICdnZW5yZSc6IHJldHVybiB0YWIuY29udGV4dERhdGE/LmdlbnJlO1xuICAgICAgICBjYXNlICdzaXRlTmFtZSc6IHJldHVybiB0YWIuY29udGV4dERhdGE/LnNpdGVOYW1lO1xuICAgICAgICAvLyBEZXJpdmVkIG9yIG1hcHBlZCBmaWVsZHNcbiAgICAgICAgY2FzZSAnZG9tYWluJzogcmV0dXJuIGRvbWFpbkZyb21VcmwodGFiLnVybCk7XG4gICAgICAgIGNhc2UgJ3N1YmRvbWFpbic6IHJldHVybiBzdWJkb21haW5Gcm9tVXJsKHRhYi51cmwpO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgcmV0dXJuIGdldE5lc3RlZFByb3BlcnR5KHRhYiwgZmllbGQpO1xuICAgIH1cbn07XG5cbmNvbnN0IHN0cmlwVGxkID0gKGRvbWFpbjogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIGRvbWFpbi5yZXBsYWNlKC9cXC4oY29tfG9yZ3xnb3Z8bmV0fGVkdXxpbykkL2ksIFwiXCIpO1xufTtcblxuZXhwb3J0IGNvbnN0IHNlbWFudGljQnVja2V0ID0gKHRpdGxlOiBzdHJpbmcsIHVybDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3Qga2V5ID0gYCR7dGl0bGV9ICR7dXJsfWAudG9Mb3dlckNhc2UoKTtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImRvY1wiKSB8fCBrZXkuaW5jbHVkZXMoXCJyZWFkbWVcIikgfHwga2V5LmluY2x1ZGVzKFwiZ3VpZGVcIikpIHJldHVybiBcIkRvY3NcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcIm1haWxcIikgfHwga2V5LmluY2x1ZGVzKFwiaW5ib3hcIikpIHJldHVybiBcIkNoYXRcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImRhc2hib2FyZFwiKSB8fCBrZXkuaW5jbHVkZXMoXCJjb25zb2xlXCIpKSByZXR1cm4gXCJEYXNoXCI7XG4gIGlmIChrZXkuaW5jbHVkZXMoXCJpc3N1ZVwiKSB8fCBrZXkuaW5jbHVkZXMoXCJ0aWNrZXRcIikpIHJldHVybiBcIlRhc2tzXCI7XG4gIGlmIChrZXkuaW5jbHVkZXMoXCJkcml2ZVwiKSB8fCBrZXkuaW5jbHVkZXMoXCJzdG9yYWdlXCIpKSByZXR1cm4gXCJGaWxlc1wiO1xuICByZXR1cm4gXCJNaXNjXCI7XG59O1xuXG5leHBvcnQgY29uc3QgbmF2aWdhdGlvbktleSA9ICh0YWI6IFRhYk1ldGFkYXRhKTogc3RyaW5nID0+IHtcbiAgaWYgKHRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIGBjaGlsZC1vZi0ke3RhYi5vcGVuZXJUYWJJZH1gO1xuICB9XG4gIHJldHVybiBgd2luZG93LSR7dGFiLndpbmRvd0lkfWA7XG59O1xuXG5jb25zdCBnZXRSZWNlbmN5TGFiZWwgPSAobGFzdEFjY2Vzc2VkOiBudW1iZXIpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICBjb25zdCBkaWZmID0gbm93IC0gbGFzdEFjY2Vzc2VkO1xuICBpZiAoZGlmZiA8IDM2MDAwMDApIHJldHVybiBcIkp1c3Qgbm93XCI7IC8vIDFoXG4gIGlmIChkaWZmIDwgODY0MDAwMDApIHJldHVybiBcIlRvZGF5XCI7IC8vIDI0aFxuICBpZiAoZGlmZiA8IDE3MjgwMDAwMCkgcmV0dXJuIFwiWWVzdGVyZGF5XCI7IC8vIDQ4aFxuICBpZiAoZGlmZiA8IDYwNDgwMDAwMCkgcmV0dXJuIFwiVGhpcyBXZWVrXCI7IC8vIDdkXG4gIHJldHVybiBcIk9sZGVyXCI7XG59O1xuXG5jb25zdCBjb2xvckZvcktleSA9IChrZXk6IHN0cmluZywgb2Zmc2V0OiBudW1iZXIpOiBzdHJpbmcgPT4gQ09MT1JTWyhNYXRoLmFicyhoYXNoQ29kZShrZXkpKSArIG9mZnNldCkgJSBDT0xPUlMubGVuZ3RoXTtcblxuY29uc3QgaGFzaENvZGUgPSAodmFsdWU6IHN0cmluZyk6IG51bWJlciA9PiB7XG4gIGxldCBoYXNoID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB2YWx1ZS5sZW5ndGg7IGkgKz0gMSkge1xuICAgIGhhc2ggPSAoaGFzaCA8PCA1KSAtIGhhc2ggKyB2YWx1ZS5jaGFyQ29kZUF0KGkpO1xuICAgIGhhc2ggfD0gMDtcbiAgfVxuICByZXR1cm4gaGFzaDtcbn07XG5cbi8vIEhlbHBlciB0byBnZXQgYSBodW1hbi1yZWFkYWJsZSBsYWJlbCBjb21wb25lbnQgZnJvbSBhIHN0cmF0ZWd5IGFuZCBhIHNldCBvZiB0YWJzXG5jb25zdCBnZXRMYWJlbENvbXBvbmVudCA9IChzdHJhdGVneTogR3JvdXBpbmdTdHJhdGVneSB8IHN0cmluZywgdGFiczogVGFiTWV0YWRhdGFbXSwgYWxsVGFic01hcDogTWFwPG51bWJlciwgVGFiTWV0YWRhdGE+KTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gIGNvbnN0IGZpcnN0VGFiID0gdGFic1swXTtcbiAgaWYgKCFmaXJzdFRhYikgcmV0dXJuIFwiVW5rbm93blwiO1xuXG4gIC8vIENoZWNrIGN1c3RvbSBzdHJhdGVnaWVzIGZpcnN0XG4gIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5KTtcbiAgaWYgKGN1c3RvbSkge1xuICAgICAgcmV0dXJuIGdyb3VwaW5nS2V5KGZpcnN0VGFiLCBzdHJhdGVneSk7XG4gIH1cblxuICBzd2l0Y2ggKHN0cmF0ZWd5KSB7XG4gICAgY2FzZSBcImRvbWFpblwiOiB7XG4gICAgICBjb25zdCBzaXRlTmFtZXMgPSBuZXcgU2V0KHRhYnMubWFwKHQgPT4gdC5jb250ZXh0RGF0YT8uc2l0ZU5hbWUpLmZpbHRlcihCb29sZWFuKSk7XG4gICAgICBpZiAoc2l0ZU5hbWVzLnNpemUgPT09IDEpIHtcbiAgICAgICAgcmV0dXJuIHN0cmlwVGxkKEFycmF5LmZyb20oc2l0ZU5hbWVzKVswXSBhcyBzdHJpbmcpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHN0cmlwVGxkKGRvbWFpbkZyb21VcmwoZmlyc3RUYWIudXJsKSk7XG4gICAgfVxuICAgIGNhc2UgXCJkb21haW5fZnVsbFwiOlxuICAgICAgcmV0dXJuIGRvbWFpbkZyb21VcmwoZmlyc3RUYWIudXJsKTtcbiAgICBjYXNlIFwidG9waWNcIjpcbiAgICAgIHJldHVybiBzZW1hbnRpY0J1Y2tldChmaXJzdFRhYi50aXRsZSwgZmlyc3RUYWIudXJsKTtcbiAgICBjYXNlIFwibGluZWFnZVwiOlxuICAgICAgaWYgKGZpcnN0VGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgY29uc3QgcGFyZW50ID0gYWxsVGFic01hcC5nZXQoZmlyc3RUYWIub3BlbmVyVGFiSWQpO1xuICAgICAgICBpZiAocGFyZW50KSB7XG4gICAgICAgICAgY29uc3QgcGFyZW50VGl0bGUgPSBwYXJlbnQudGl0bGUubGVuZ3RoID4gMjAgPyBwYXJlbnQudGl0bGUuc3Vic3RyaW5nKDAsIDIwKSArIFwiLi4uXCIgOiBwYXJlbnQudGl0bGU7XG4gICAgICAgICAgcmV0dXJuIGBGcm9tOiAke3BhcmVudFRpdGxlfWA7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGBGcm9tOiBUYWIgJHtmaXJzdFRhYi5vcGVuZXJUYWJJZH1gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGBXaW5kb3cgJHtmaXJzdFRhYi53aW5kb3dJZH1gO1xuICAgIGNhc2UgXCJjb250ZXh0XCI6XG4gICAgICByZXR1cm4gZmlyc3RUYWIuY29udGV4dCB8fCBcIlVuY2F0ZWdvcml6ZWRcIjtcbiAgICBjYXNlIFwicGlubmVkXCI6XG4gICAgICByZXR1cm4gZmlyc3RUYWIucGlubmVkID8gXCJQaW5uZWRcIiA6IFwiVW5waW5uZWRcIjtcbiAgICBjYXNlIFwiYWdlXCI6XG4gICAgICByZXR1cm4gZ2V0UmVjZW5jeUxhYmVsKGZpcnN0VGFiLmxhc3RBY2Nlc3NlZCA/PyAwKTtcbiAgICBjYXNlIFwidXJsXCI6XG4gICAgICByZXR1cm4gXCJVUkwgR3JvdXBcIjtcbiAgICBjYXNlIFwicmVjZW5jeVwiOlxuICAgICAgcmV0dXJuIFwiVGltZSBHcm91cFwiO1xuICAgIGNhc2UgXCJuZXN0aW5nXCI6XG4gICAgICByZXR1cm4gZmlyc3RUYWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCA/IFwiQ2hpbGRyZW5cIiA6IFwiUm9vdHNcIjtcbiAgICBkZWZhdWx0OlxuICAgICAgY29uc3QgdmFsID0gZ2V0RmllbGRWYWx1ZShmaXJzdFRhYiwgc3RyYXRlZ3kpO1xuICAgICAgaWYgKHZhbCAhPT0gdW5kZWZpbmVkICYmIHZhbCAhPT0gbnVsbCkge1xuICAgICAgICAgIHJldHVybiBTdHJpbmcodmFsKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBcIlVua25vd25cIjtcbiAgfVxufTtcblxuY29uc3QgZ2VuZXJhdGVMYWJlbCA9IChcbiAgc3RyYXRlZ2llczogKEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcpW10sXG4gIHRhYnM6IFRhYk1ldGFkYXRhW10sXG4gIGFsbFRhYnNNYXA6IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhPlxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgbGFiZWxzID0gc3RyYXRlZ2llc1xuICAgIC5tYXAocyA9PiBnZXRMYWJlbENvbXBvbmVudChzLCB0YWJzLCBhbGxUYWJzTWFwKSlcbiAgICAuZmlsdGVyKGwgPT4gbCAmJiBsICE9PSBcIlVua25vd25cIiAmJiBsICE9PSBcIkdyb3VwXCIgJiYgbCAhPT0gXCJVUkwgR3JvdXBcIiAmJiBsICE9PSBcIlRpbWUgR3JvdXBcIiAmJiBsICE9PSBcIk1pc2NcIik7XG5cbiAgaWYgKGxhYmVscy5sZW5ndGggPT09IDApIHJldHVybiBcIkdyb3VwXCI7XG4gIHJldHVybiBBcnJheS5mcm9tKG5ldyBTZXQobGFiZWxzKSkuam9pbihcIiAtIFwiKTtcbn07XG5cbmNvbnN0IGdldFN0cmF0ZWd5Q29sb3JSdWxlID0gKHN0cmF0ZWd5SWQ6IHN0cmluZyk6IEdyb3VwaW5nUnVsZSB8IHVuZGVmaW5lZCA9PiB7XG4gICAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3lJZCk7XG4gICAgaWYgKCFjdXN0b20pIHJldHVybiB1bmRlZmluZWQ7XG5cbiAgICBjb25zdCBncm91cGluZ1J1bGVzTGlzdCA9IGFzQXJyYXk8R3JvdXBpbmdSdWxlPihjdXN0b20uZ3JvdXBpbmdSdWxlcyk7XG4gICAgLy8gSXRlcmF0ZSBtYW51YWxseSB0byBjaGVjayBjb2xvclxuICAgIGZvciAobGV0IGkgPSBncm91cGluZ1J1bGVzTGlzdC5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICBjb25zdCBydWxlID0gZ3JvdXBpbmdSdWxlc0xpc3RbaV07XG4gICAgICAgIGlmIChydWxlICYmIHJ1bGUuY29sb3IgJiYgcnVsZS5jb2xvciAhPT0gJ3JhbmRvbScpIHtcbiAgICAgICAgICAgIHJldHVybiBydWxlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB1bmRlZmluZWQ7XG59O1xuXG5jb25zdCByZXNvbHZlV2luZG93TW9kZSA9IChtb2RlczogKHN0cmluZyB8IHVuZGVmaW5lZClbXSk6IFwiY3VycmVudFwiIHwgXCJuZXdcIiB8IFwiY29tcG91bmRcIiA9PiB7XG4gICAgaWYgKG1vZGVzLmluY2x1ZGVzKFwibmV3XCIpKSByZXR1cm4gXCJuZXdcIjtcbiAgICBpZiAobW9kZXMuaW5jbHVkZXMoXCJjb21wb3VuZFwiKSkgcmV0dXJuIFwiY29tcG91bmRcIjtcbiAgICByZXR1cm4gXCJjdXJyZW50XCI7XG59O1xuXG5leHBvcnQgY29uc3QgZ3JvdXBUYWJzID0gKFxuICB0YWJzOiBUYWJNZXRhZGF0YVtdLFxuICBzdHJhdGVnaWVzOiAoU29ydGluZ1N0cmF0ZWd5IHwgc3RyaW5nKVtdXG4pOiBUYWJHcm91cFtdID0+IHtcbiAgY29uc3QgYXZhaWxhYmxlU3RyYXRlZ2llcyA9IGdldFN0cmF0ZWdpZXMoY3VzdG9tU3RyYXRlZ2llcyk7XG4gIGNvbnN0IGVmZmVjdGl2ZVN0cmF0ZWdpZXMgPSBzdHJhdGVnaWVzLmZpbHRlcihzID0+IGF2YWlsYWJsZVN0cmF0ZWdpZXMuZmluZChhdmFpbCA9PiBhdmFpbC5pZCA9PT0gcyk/LmlzR3JvdXBpbmcpO1xuICBjb25zdCBidWNrZXRzID0gbmV3IE1hcDxzdHJpbmcsIFRhYkdyb3VwPigpO1xuXG4gIGNvbnN0IGFsbFRhYnNNYXAgPSBuZXcgTWFwPG51bWJlciwgVGFiTWV0YWRhdGE+KCk7XG4gIHRhYnMuZm9yRWFjaCh0ID0+IGFsbFRhYnNNYXAuc2V0KHQuaWQsIHQpKTtcblxuICB0YWJzLmZvckVhY2goKHRhYikgPT4ge1xuICAgIGxldCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IGFwcGxpZWRTdHJhdGVnaWVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IGNvbGxlY3RlZE1vZGVzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgZm9yIChjb25zdCBzIG9mIGVmZmVjdGl2ZVN0cmF0ZWdpZXMpIHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGdldEdyb3VwaW5nUmVzdWx0KHRhYiwgcyk7XG4gICAgICAgICAgICBpZiAocmVzdWx0LmtleSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGtleXMucHVzaChgJHtzfToke3Jlc3VsdC5rZXl9YCk7XG4gICAgICAgICAgICAgICAgYXBwbGllZFN0cmF0ZWdpZXMucHVzaChzKTtcbiAgICAgICAgICAgICAgICBjb2xsZWN0ZWRNb2Rlcy5wdXNoKHJlc3VsdC5tb2RlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgbG9nRGVidWcoXCJFcnJvciBnZW5lcmF0aW5nIGdyb3VwaW5nIGtleVwiLCB7IHRhYklkOiB0YWIuaWQsIGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgIHJldHVybjsgLy8gU2tpcCB0aGlzIHRhYiBvbiBlcnJvclxuICAgIH1cblxuICAgIC8vIElmIG5vIHN0cmF0ZWdpZXMgYXBwbGllZCAoZS5nLiBhbGwgZmlsdGVyZWQgb3V0KSwgc2tpcCBncm91cGluZyBmb3IgdGhpcyB0YWJcbiAgICBpZiAoa2V5cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGVmZmVjdGl2ZU1vZGUgPSByZXNvbHZlV2luZG93TW9kZShjb2xsZWN0ZWRNb2Rlcyk7XG4gICAgY29uc3QgdmFsdWVLZXkgPSBrZXlzLmpvaW4oXCI6OlwiKTtcbiAgICBsZXQgYnVja2V0S2V5ID0gXCJcIjtcbiAgICBpZiAoZWZmZWN0aXZlTW9kZSA9PT0gJ2N1cnJlbnQnKSB7XG4gICAgICAgICBidWNrZXRLZXkgPSBgd2luZG93LSR7dGFiLndpbmRvd0lkfTo6YCArIHZhbHVlS2V5O1xuICAgIH0gZWxzZSB7XG4gICAgICAgICBidWNrZXRLZXkgPSBgZ2xvYmFsOjpgICsgdmFsdWVLZXk7XG4gICAgfVxuXG4gICAgbGV0IGdyb3VwID0gYnVja2V0cy5nZXQoYnVja2V0S2V5KTtcbiAgICBpZiAoIWdyb3VwKSB7XG4gICAgICBsZXQgZ3JvdXBDb2xvciA9IG51bGw7XG4gICAgICBsZXQgY29sb3JGaWVsZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgbGV0IGNvbG9yVHJhbnNmb3JtOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICBsZXQgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbiAgICAgIGZvciAoY29uc3Qgc0lkIG9mIGFwcGxpZWRTdHJhdGVnaWVzKSB7XG4gICAgICAgIGNvbnN0IHJ1bGUgPSBnZXRTdHJhdGVneUNvbG9yUnVsZShzSWQpO1xuICAgICAgICBpZiAocnVsZSkge1xuICAgICAgICAgICAgZ3JvdXBDb2xvciA9IHJ1bGUuY29sb3I7XG4gICAgICAgICAgICBjb2xvckZpZWxkID0gcnVsZS5jb2xvckZpZWxkO1xuICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm0gPSBydWxlLmNvbG9yVHJhbnNmb3JtO1xuICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuID0gcnVsZS5jb2xvclRyYW5zZm9ybVBhdHRlcm47XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoZ3JvdXBDb2xvciA9PT0gJ21hdGNoJykge1xuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkodmFsdWVLZXksIDApO1xuICAgICAgfSBlbHNlIGlmIChncm91cENvbG9yID09PSAnZmllbGQnICYmIGNvbG9yRmllbGQpIHtcbiAgICAgICAgY29uc3QgdmFsID0gZ2V0RmllbGRWYWx1ZSh0YWIsIGNvbG9yRmllbGQpO1xuICAgICAgICBsZXQga2V5ID0gdmFsICE9PSB1bmRlZmluZWQgJiYgdmFsICE9PSBudWxsID8gU3RyaW5nKHZhbCkgOiBcIlwiO1xuICAgICAgICBpZiAoY29sb3JUcmFuc2Zvcm0pIHtcbiAgICAgICAgICAgIGtleSA9IGFwcGx5VmFsdWVUcmFuc2Zvcm0oa2V5LCBjb2xvclRyYW5zZm9ybSwgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuKTtcbiAgICAgICAgfVxuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkoa2V5LCAwKTtcbiAgICAgIH0gZWxzZSBpZiAoIWdyb3VwQ29sb3IgfHwgZ3JvdXBDb2xvciA9PT0gJ2ZpZWxkJykge1xuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkoYnVja2V0S2V5LCBidWNrZXRzLnNpemUpO1xuICAgICAgfVxuXG4gICAgICBncm91cCA9IHtcbiAgICAgICAgaWQ6IGJ1Y2tldEtleSxcbiAgICAgICAgd2luZG93SWQ6IHRhYi53aW5kb3dJZCxcbiAgICAgICAgbGFiZWw6IFwiXCIsXG4gICAgICAgIGNvbG9yOiBncm91cENvbG9yLFxuICAgICAgICB0YWJzOiBbXSxcbiAgICAgICAgcmVhc29uOiBhcHBsaWVkU3RyYXRlZ2llcy5qb2luKFwiICsgXCIpLFxuICAgICAgICB3aW5kb3dNb2RlOiBlZmZlY3RpdmVNb2RlXG4gICAgICB9O1xuICAgICAgYnVja2V0cy5zZXQoYnVja2V0S2V5LCBncm91cCk7XG4gICAgfVxuICAgIGdyb3VwLnRhYnMucHVzaCh0YWIpO1xuICB9KTtcblxuICBjb25zdCBncm91cHMgPSBBcnJheS5mcm9tKGJ1Y2tldHMudmFsdWVzKCkpO1xuICBncm91cHMuZm9yRWFjaChncm91cCA9PiB7XG4gICAgZ3JvdXAubGFiZWwgPSBnZW5lcmF0ZUxhYmVsKGVmZmVjdGl2ZVN0cmF0ZWdpZXMsIGdyb3VwLnRhYnMsIGFsbFRhYnNNYXApO1xuICB9KTtcblxuICByZXR1cm4gZ3JvdXBzO1xufTtcblxuY29uc3QgY2hlY2tWYWx1ZU1hdGNoID0gKFxuICAgIG9wZXJhdG9yOiBzdHJpbmcsXG4gICAgcmF3VmFsdWU6IGFueSxcbiAgICBydWxlVmFsdWU6IHN0cmluZ1xuKTogeyBpc01hdGNoOiBib29sZWFuOyBtYXRjaE9iajogUmVnRXhwRXhlY0FycmF5IHwgbnVsbCB9ID0+IHtcbiAgICBjb25zdCB2YWx1ZVN0ciA9IHJhd1ZhbHVlICE9PSB1bmRlZmluZWQgJiYgcmF3VmFsdWUgIT09IG51bGwgPyBTdHJpbmcocmF3VmFsdWUpIDogXCJcIjtcbiAgICBjb25zdCB2YWx1ZVRvQ2hlY2sgPSB2YWx1ZVN0ci50b0xvd2VyQ2FzZSgpO1xuICAgIGNvbnN0IHBhdHRlcm5Ub0NoZWNrID0gcnVsZVZhbHVlID8gcnVsZVZhbHVlLnRvTG93ZXJDYXNlKCkgOiBcIlwiO1xuXG4gICAgbGV0IGlzTWF0Y2ggPSBmYWxzZTtcbiAgICBsZXQgbWF0Y2hPYmo6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGwgPSBudWxsO1xuXG4gICAgc3dpdGNoIChvcGVyYXRvcikge1xuICAgICAgICBjYXNlICdjb250YWlucyc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suaW5jbHVkZXMocGF0dGVyblRvQ2hlY2spOyBicmVhaztcbiAgICAgICAgY2FzZSAnZG9lc05vdENvbnRhaW4nOiBpc01hdGNoID0gIXZhbHVlVG9DaGVjay5pbmNsdWRlcyhwYXR0ZXJuVG9DaGVjayk7IGJyZWFrO1xuICAgICAgICBjYXNlICdlcXVhbHMnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrID09PSBwYXR0ZXJuVG9DaGVjazsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3N0YXJ0c1dpdGgnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrLnN0YXJ0c1dpdGgocGF0dGVyblRvQ2hlY2spOyBicmVhaztcbiAgICAgICAgY2FzZSAnZW5kc1dpdGgnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrLmVuZHNXaXRoKHBhdHRlcm5Ub0NoZWNrKTsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2V4aXN0cyc6IGlzTWF0Y2ggPSByYXdWYWx1ZSAhPT0gdW5kZWZpbmVkOyBicmVhaztcbiAgICAgICAgY2FzZSAnZG9lc05vdEV4aXN0JzogaXNNYXRjaCA9IHJhd1ZhbHVlID09PSB1bmRlZmluZWQ7IGJyZWFrO1xuICAgICAgICBjYXNlICdpc051bGwnOiBpc01hdGNoID0gcmF3VmFsdWUgPT09IG51bGw7IGJyZWFrO1xuICAgICAgICBjYXNlICdpc05vdE51bGwnOiBpc01hdGNoID0gcmF3VmFsdWUgIT09IG51bGw7IGJyZWFrO1xuICAgICAgICBjYXNlICdtYXRjaGVzJzpcbiAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChydWxlVmFsdWUsICdpJyk7XG4gICAgICAgICAgICAgICAgbWF0Y2hPYmogPSByZWdleC5leGVjKHZhbHVlU3RyKTtcbiAgICAgICAgICAgICAgICBpc01hdGNoID0gISFtYXRjaE9iajtcbiAgICAgICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICByZXR1cm4geyBpc01hdGNoLCBtYXRjaE9iaiB9O1xufTtcblxuZXhwb3J0IGNvbnN0IGNoZWNrQ29uZGl0aW9uID0gKGNvbmRpdGlvbjogUnVsZUNvbmRpdGlvbiwgdGFiOiBUYWJNZXRhZGF0YSk6IGJvb2xlYW4gPT4ge1xuICAgIGlmICghY29uZGl0aW9uKSByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgcmF3VmFsdWUgPSBnZXRGaWVsZFZhbHVlKHRhYiwgY29uZGl0aW9uLmZpZWxkKTtcbiAgICBjb25zdCB7IGlzTWF0Y2ggfSA9IGNoZWNrVmFsdWVNYXRjaChjb25kaXRpb24ub3BlcmF0b3IsIHJhd1ZhbHVlLCBjb25kaXRpb24udmFsdWUpO1xuICAgIHJldHVybiBpc01hdGNoO1xufTtcblxuZXhwb3J0IGNvbnN0IGFwcGx5VmFsdWVUcmFuc2Zvcm0gPSAodmFsOiBzdHJpbmcsIHRyYW5zZm9ybTogc3RyaW5nLCBwYXR0ZXJuPzogc3RyaW5nLCByZXBsYWNlbWVudD86IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgaWYgKCF2YWwgfHwgIXRyYW5zZm9ybSB8fCB0cmFuc2Zvcm0gPT09ICdub25lJykgcmV0dXJuIHZhbDtcblxuICAgIHN3aXRjaCAodHJhbnNmb3JtKSB7XG4gICAgICAgIGNhc2UgJ3N0cmlwVGxkJzpcbiAgICAgICAgICAgIHJldHVybiBzdHJpcFRsZCh2YWwpO1xuICAgICAgICBjYXNlICdsb3dlcmNhc2UnOlxuICAgICAgICAgICAgcmV0dXJuIHZhbC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICBjYXNlICd1cHBlcmNhc2UnOlxuICAgICAgICAgICAgcmV0dXJuIHZhbC50b1VwcGVyQ2FzZSgpO1xuICAgICAgICBjYXNlICdmaXJzdENoYXInOlxuICAgICAgICAgICAgcmV0dXJuIHZhbC5jaGFyQXQoMCk7XG4gICAgICAgIGNhc2UgJ2RvbWFpbic6XG4gICAgICAgICAgICByZXR1cm4gZG9tYWluRnJvbVVybCh2YWwpO1xuICAgICAgICBjYXNlICdob3N0bmFtZSc6XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICByZXR1cm4gbmV3IFVSTCh2YWwpLmhvc3RuYW1lO1xuICAgICAgICAgICAgfSBjYXRjaCB7IHJldHVybiB2YWw7IH1cbiAgICAgICAgY2FzZSAncmVnZXgnOlxuICAgICAgICAgICAgaWYgKHBhdHRlcm4pIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBsZXQgcmVnZXggPSByZWdleENhY2hlLmdldChwYXR0ZXJuKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFyZWdleCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVnZXggPSBuZXcgUmVnRXhwKHBhdHRlcm4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVnZXhDYWNoZS5zZXQocGF0dGVybiwgcmVnZXgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1hdGNoID0gcmVnZXguZXhlYyh2YWwpO1xuICAgICAgICAgICAgICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBleHRyYWN0ZWQgPSBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBtYXRjaC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4dHJhY3RlZCArPSBtYXRjaFtpXSB8fCBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGV4dHJhY3RlZDtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkludmFsaWQgcmVnZXggaW4gdHJhbnNmb3JtXCIsIHsgcGF0dGVybjogcGF0dGVybiwgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgY2FzZSAncmVnZXhSZXBsYWNlJzpcbiAgICAgICAgICAgICBpZiAocGF0dGVybikge1xuICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgLy8gVXNpbmcgJ2cnIGdsb2JhbCBmbGFnIGJ5IGRlZmF1bHQgZm9yIHJlcGxhY2VtZW50XG4gICAgICAgICAgICAgICAgICAgICByZXR1cm4gdmFsLnJlcGxhY2UobmV3IFJlZ0V4cChwYXR0ZXJuLCAnZycpLCByZXBsYWNlbWVudCB8fCBcIlwiKTtcbiAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICAgbG9nRGVidWcoXCJJbnZhbGlkIHJlZ2V4IGluIHRyYW5zZm9ybVwiLCB7IHBhdHRlcm46IHBhdHRlcm4sIGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgICAgICAgICAgICAgICByZXR1cm4gdmFsO1xuICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgfVxuICAgICAgICAgICAgIHJldHVybiB2YWw7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICByZXR1cm4gdmFsO1xuICAgIH1cbn07XG5cbmZ1bmN0aW9uIGV2YWx1YXRlTGVnYWN5UnVsZXMobGVnYWN5UnVsZXM6IFN0cmF0ZWd5UnVsZVtdLCB0YWI6IFRhYk1ldGFkYXRhKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgLy8gRGVmZW5zaXZlIGNoZWNrXG4gICAgaWYgKCFsZWdhY3lSdWxlcyB8fCAhQXJyYXkuaXNBcnJheShsZWdhY3lSdWxlcykpIHtcbiAgICAgICAgaWYgKCFsZWdhY3lSdWxlcykgcmV0dXJuIG51bGw7XG4gICAgICAgIC8vIFRyeSBhc0FycmF5IGlmIGl0J3Mgbm90IGFycmF5IGJ1dCB0cnV0aHkgKHVubGlrZWx5IGdpdmVuIHByZXZpb3VzIGxvZ2ljIGJ1dCBzYWZlKVxuICAgIH1cblxuICAgIGNvbnN0IGxlZ2FjeVJ1bGVzTGlzdCA9IGFzQXJyYXk8U3RyYXRlZ3lSdWxlPihsZWdhY3lSdWxlcyk7XG4gICAgaWYgKGxlZ2FjeVJ1bGVzTGlzdC5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGxlZ2FjeVJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IHJhd1ZhbHVlID0gZ2V0RmllbGRWYWx1ZSh0YWIsIHJ1bGUuZmllbGQpO1xuICAgICAgICAgICAgY29uc3QgeyBpc01hdGNoLCBtYXRjaE9iaiB9ID0gY2hlY2tWYWx1ZU1hdGNoKHJ1bGUub3BlcmF0b3IsIHJhd1ZhbHVlLCBydWxlLnZhbHVlKTtcblxuICAgICAgICAgICAgaWYgKGlzTWF0Y2gpIHtcbiAgICAgICAgICAgICAgICBsZXQgcmVzdWx0ID0gcnVsZS5yZXN1bHQ7XG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoT2JqKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgbWF0Y2hPYmoubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShuZXcgUmVnRXhwKGBcXFxcJCR7aX1gLCAnZycpLCBtYXRjaE9ialtpXSB8fCBcIlwiKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgbG9nRGVidWcoXCJFcnJvciBldmFsdWF0aW5nIGxlZ2FjeSBydWxlc1wiLCB7IGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGNvbnN0IGdldEdyb3VwaW5nUmVzdWx0ID0gKHRhYjogVGFiTWV0YWRhdGEsIHN0cmF0ZWd5OiBHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nKTogeyBrZXk6IHN0cmluZyB8IG51bGwsIG1vZGU6IFwiY3VycmVudFwiIHwgXCJuZXdcIiB8IFwiY29tcG91bmRcIiB9ID0+IHtcbiAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3kpO1xuICBpZiAoY3VzdG9tKSB7XG4gICAgICBjb25zdCBmaWx0ZXJHcm91cHNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uW10+KGN1c3RvbS5maWx0ZXJHcm91cHMpO1xuICAgICAgY29uc3QgZmlsdGVyc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGN1c3RvbS5maWx0ZXJzKTtcblxuICAgICAgbGV0IG1hdGNoID0gZmFsc2U7XG5cbiAgICAgIGlmIChmaWx0ZXJHcm91cHNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAvLyBPUiBsb2dpY1xuICAgICAgICAgIGZvciAoY29uc3QgZ3JvdXAgb2YgZmlsdGVyR3JvdXBzTGlzdCkge1xuICAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihncm91cCk7XG4gICAgICAgICAgICAgIGlmIChncm91cFJ1bGVzLmxlbmd0aCA9PT0gMCB8fCBncm91cFJ1bGVzLmV2ZXJ5KHIgPT4gY2hlY2tDb25kaXRpb24ociwgdGFiKSkpIHtcbiAgICAgICAgICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChmaWx0ZXJzTGlzdC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgLy8gTGVnYWN5L1NpbXBsZSBBTkQgbG9naWNcbiAgICAgICAgICBpZiAoZmlsdGVyc0xpc3QuZXZlcnkoZiA9PiBjaGVja0NvbmRpdGlvbihmLCB0YWIpKSkge1xuICAgICAgICAgICAgICBtYXRjaCA9IHRydWU7XG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBObyBmaWx0ZXJzIC0+IE1hdGNoIGFsbFxuICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFtYXRjaCkge1xuICAgICAgICAgIHJldHVybiB7IGtleTogbnVsbCwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZ3JvdXBpbmdSdWxlc0xpc3QgPSBhc0FycmF5PEdyb3VwaW5nUnVsZT4oY3VzdG9tLmdyb3VwaW5nUnVsZXMpO1xuICAgICAgaWYgKGdyb3VwaW5nUnVsZXNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICBjb25zdCBtb2Rlczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwaW5nUnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICBsZXQgdmFsID0gXCJcIjtcbiAgICAgICAgICAgICAgICBpZiAocnVsZS5zb3VyY2UgPT09ICdmaWVsZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJhdyA9IGdldEZpZWxkVmFsdWUodGFiLCBydWxlLnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHJhdyAhPT0gdW5kZWZpbmVkICYmIHJhdyAhPT0gbnVsbCA/IFN0cmluZyhyYXcpIDogXCJcIjtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgdmFsID0gcnVsZS52YWx1ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodmFsICYmIHJ1bGUudHJhbnNmb3JtICYmIHJ1bGUudHJhbnNmb3JtICE9PSAnbm9uZScpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFsID0gYXBwbHlWYWx1ZVRyYW5zZm9ybSh2YWwsIHJ1bGUudHJhbnNmb3JtLCBydWxlLnRyYW5zZm9ybVBhdHRlcm4sIHJ1bGUudHJhbnNmb3JtUmVwbGFjZW1lbnQpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh2YWwpIHtcbiAgICAgICAgICAgICAgICAgICAgcGFydHMucHVzaCh2YWwpO1xuICAgICAgICAgICAgICAgICAgICBpZiAocnVsZS53aW5kb3dNb2RlKSBtb2Rlcy5wdXNoKHJ1bGUud2luZG93TW9kZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGFwcGx5aW5nIGdyb3VwaW5nIHJ1bGVzXCIsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICByZXR1cm4geyBrZXk6IHBhcnRzLmpvaW4oXCIgLSBcIiksIG1vZGU6IHJlc29sdmVXaW5kb3dNb2RlKG1vZGVzKSB9O1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4geyBrZXk6IGN1c3RvbS5mYWxsYmFjayB8fCBcIk1pc2NcIiwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH0gZWxzZSBpZiAoY3VzdG9tLnJ1bGVzKSB7XG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0gZXZhbHVhdGVMZWdhY3lSdWxlcyhhc0FycmF5PFN0cmF0ZWd5UnVsZT4oY3VzdG9tLnJ1bGVzKSwgdGFiKTtcbiAgICAgICAgICBpZiAocmVzdWx0KSByZXR1cm4geyBrZXk6IHJlc3VsdCwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHsga2V5OiBjdXN0b20uZmFsbGJhY2sgfHwgXCJNaXNjXCIsIG1vZGU6IFwiY3VycmVudFwiIH07XG4gIH1cblxuICAvLyBCdWlsdC1pbiBzdHJhdGVnaWVzXG4gIGxldCBzaW1wbGVLZXk6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBzd2l0Y2ggKHN0cmF0ZWd5KSB7XG4gICAgY2FzZSBcImRvbWFpblwiOlxuICAgIGNhc2UgXCJkb21haW5fZnVsbFwiOlxuICAgICAgc2ltcGxlS2V5ID0gZG9tYWluRnJvbVVybCh0YWIudXJsKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJ0b3BpY1wiOlxuICAgICAgc2ltcGxlS2V5ID0gc2VtYW50aWNCdWNrZXQodGFiLnRpdGxlLCB0YWIudXJsKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJsaW5lYWdlXCI6XG4gICAgICBzaW1wbGVLZXkgPSBuYXZpZ2F0aW9uS2V5KHRhYik7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwiY29udGV4dFwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLmNvbnRleHQgfHwgXCJVbmNhdGVnb3JpemVkXCI7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwicGlubmVkXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIucGlubmVkID8gXCJwaW5uZWRcIiA6IFwidW5waW5uZWRcIjtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJhZ2VcIjpcbiAgICAgIHNpbXBsZUtleSA9IGdldFJlY2VuY3lMYWJlbCh0YWIubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInVybFwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLnVybDtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJ0aXRsZVwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLnRpdGxlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInJlY2VuY3lcIjpcbiAgICAgIHNpbXBsZUtleSA9IFN0cmluZyh0YWIubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcIm5lc3RpbmdcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkID8gXCJjaGlsZFwiIDogXCJyb290XCI7XG4gICAgICBicmVhaztcbiAgICBkZWZhdWx0OlxuICAgICAgICBjb25zdCB2YWwgPSBnZXRGaWVsZFZhbHVlKHRhYiwgc3RyYXRlZ3kpO1xuICAgICAgICBpZiAodmFsICE9PSB1bmRlZmluZWQgJiYgdmFsICE9PSBudWxsKSB7XG4gICAgICAgICAgICBzaW1wbGVLZXkgPSBTdHJpbmcodmFsKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNpbXBsZUtleSA9IFwiVW5rbm93blwiO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICB9XG4gIHJldHVybiB7IGtleTogc2ltcGxlS2V5LCBtb2RlOiBcImN1cnJlbnRcIiB9O1xufTtcblxuZXhwb3J0IGNvbnN0IGdyb3VwaW5nS2V5ID0gKHRhYjogVGFiTWV0YWRhdGEsIHN0cmF0ZWd5OiBHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gICAgcmV0dXJuIGdldEdyb3VwaW5nUmVzdWx0KHRhYiwgc3RyYXRlZ3kpLmtleTtcbn07XG5cbmZ1bmN0aW9uIGlzQ29udGV4dEZpZWxkKGZpZWxkOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICByZXR1cm4gZmllbGQgPT09ICdjb250ZXh0JyB8fCBmaWVsZCA9PT0gJ2dlbnJlJyB8fCBmaWVsZCA9PT0gJ3NpdGVOYW1lJyB8fCBmaWVsZC5zdGFydHNXaXRoKCdjb250ZXh0RGF0YS4nKTtcbn1cblxuZXhwb3J0IGNvbnN0IHJlcXVpcmVzQ29udGV4dEFuYWx5c2lzID0gKHN0cmF0ZWd5SWRzOiAoc3RyaW5nIHwgU29ydGluZ1N0cmF0ZWd5KVtdKTogYm9vbGVhbiA9PiB7XG4gICAgLy8gQ2hlY2sgaWYgXCJjb250ZXh0XCIgc3RyYXRlZ3kgaXMgZXhwbGljaXRseSByZXF1ZXN0ZWRcbiAgICBpZiAoc3RyYXRlZ3lJZHMuaW5jbHVkZXMoXCJjb250ZXh0XCIpKSByZXR1cm4gdHJ1ZTtcblxuICAgIGNvbnN0IHN0cmF0ZWdpZXMgPSBnZXRTdHJhdGVnaWVzKGN1c3RvbVN0cmF0ZWdpZXMpO1xuICAgIC8vIGZpbHRlciBvbmx5IHRob3NlIHRoYXQgbWF0Y2ggdGhlIHJlcXVlc3RlZCBJRHNcbiAgICBjb25zdCBhY3RpdmVEZWZzID0gc3RyYXRlZ2llcy5maWx0ZXIocyA9PiBzdHJhdGVneUlkcy5pbmNsdWRlcyhzLmlkKSk7XG5cbiAgICBmb3IgKGNvbnN0IGRlZiBvZiBhY3RpdmVEZWZzKSB7XG4gICAgICAgIC8vIElmIGl0J3MgYSBidWlsdC1pbiBzdHJhdGVneSB0aGF0IG5lZWRzIGNvbnRleHQgKG9ubHkgJ2NvbnRleHQnIGRvZXMpXG4gICAgICAgIGlmIChkZWYuaWQgPT09ICdjb250ZXh0JykgcmV0dXJuIHRydWU7XG5cbiAgICAgICAgLy8gSWYgaXQgaXMgYSBjdXN0b20gc3RyYXRlZ3kgKG9yIG92ZXJyaWRlcyBidWlsdC1pbiksIGNoZWNrIGl0cyBydWxlc1xuICAgICAgICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQoYyA9PiBjLmlkID09PSBkZWYuaWQpO1xuICAgICAgICBpZiAoY3VzdG9tKSB7XG4gICAgICAgICAgICAgY29uc3QgZ3JvdXBSdWxlc0xpc3QgPSBhc0FycmF5PEdyb3VwaW5nUnVsZT4oY3VzdG9tLmdyb3VwaW5nUnVsZXMpO1xuICAgICAgICAgICAgIGNvbnN0IHNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihjdXN0b20uc29ydGluZ1J1bGVzKTtcbiAgICAgICAgICAgICBjb25zdCBncm91cFNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihjdXN0b20uZ3JvdXBTb3J0aW5nUnVsZXMpO1xuICAgICAgICAgICAgIGNvbnN0IGZpbHRlcnNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihjdXN0b20uZmlsdGVycyk7XG4gICAgICAgICAgICAgY29uc3QgZmlsdGVyR3JvdXBzTGlzdCA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbltdPihjdXN0b20uZmlsdGVyR3JvdXBzKTtcblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBydWxlLnNvdXJjZSA9PT0gJ2ZpZWxkJyAmJiBpc0NvbnRleHRGaWVsZChydWxlLnZhbHVlKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIHJ1bGUuY29sb3IgPT09ICdmaWVsZCcgJiYgcnVsZS5jb2xvckZpZWxkICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuY29sb3JGaWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBzb3J0UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZ3JvdXBTb3J0UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZmlsdGVyc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgZ3JvdXAgb2YgZmlsdGVyR3JvdXBzTGlzdCkge1xuICAgICAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihncm91cCk7XG4gICAgICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFJ1bGVzKSB7XG4gICAgICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBpc0NvbnRleHRGaWVsZChydWxlLmZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufTtcbiIsICJpbXBvcnQgeyBTb3J0aW5nU3RyYXRlZ3ksIFRhYk1ldGFkYXRhLCBDdXN0b21TdHJhdGVneSwgU29ydGluZ1J1bGUgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBkb21haW5Gcm9tVXJsLCBzZW1hbnRpY0J1Y2tldCwgbmF2aWdhdGlvbktleSwgZ3JvdXBpbmdLZXksIGdldEZpZWxkVmFsdWUsIGdldEN1c3RvbVN0cmF0ZWdpZXMgfSBmcm9tIFwiLi9ncm91cGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tIFwiLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5cbmV4cG9ydCBjb25zdCByZWNlbmN5U2NvcmUgPSAodGFiOiBUYWJNZXRhZGF0YSkgPT4gdGFiLmxhc3RBY2Nlc3NlZCA/PyAwO1xuZXhwb3J0IGNvbnN0IGhpZXJhcmNoeVNjb3JlID0gKHRhYjogVGFiTWV0YWRhdGEpID0+ICh0YWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCA/IDEgOiAwKTtcbmV4cG9ydCBjb25zdCBwaW5uZWRTY29yZSA9ICh0YWI6IFRhYk1ldGFkYXRhKSA9PiAodGFiLnBpbm5lZCA/IDAgOiAxKTtcblxuZXhwb3J0IGNvbnN0IHNvcnRUYWJzID0gKHRhYnM6IFRhYk1ldGFkYXRhW10sIHN0cmF0ZWdpZXM6IFNvcnRpbmdTdHJhdGVneVtdKTogVGFiTWV0YWRhdGFbXSA9PiB7XG4gIGNvbnN0IHNjb3Jpbmc6IFNvcnRpbmdTdHJhdGVneVtdID0gc3RyYXRlZ2llcy5sZW5ndGggPyBzdHJhdGVnaWVzIDogW1wicGlubmVkXCIsIFwicmVjZW5jeVwiXTtcbiAgcmV0dXJuIFsuLi50YWJzXS5zb3J0KChhLCBiKSA9PiB7XG4gICAgZm9yIChjb25zdCBzdHJhdGVneSBvZiBzY29yaW5nKSB7XG4gICAgICBjb25zdCBkaWZmID0gY29tcGFyZUJ5KHN0cmF0ZWd5LCBhLCBiKTtcbiAgICAgIGlmIChkaWZmICE9PSAwKSByZXR1cm4gZGlmZjtcbiAgICB9XG4gICAgcmV0dXJuIGEuaWQgLSBiLmlkO1xuICB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBjb21wYXJlQnkgPSAoc3RyYXRlZ3k6IFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZywgYTogVGFiTWV0YWRhdGEsIGI6IFRhYk1ldGFkYXRhKTogbnVtYmVyID0+IHtcbiAgLy8gMS4gQ2hlY2sgQ3VzdG9tIFN0cmF0ZWdpZXMgZm9yIFNvcnRpbmcgUnVsZXNcbiAgY29uc3QgY3VzdG9tU3RyYXRzID0gZ2V0Q3VzdG9tU3RyYXRlZ2llcygpO1xuICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdHMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5KTtcbiAgaWYgKGN1c3RvbSkge1xuICAgICAgY29uc3Qgc29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KGN1c3RvbS5zb3J0aW5nUnVsZXMpO1xuICAgICAgaWYgKHNvcnRSdWxlc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIC8vIEV2YWx1YXRlIGN1c3RvbSBzb3J0aW5nIHJ1bGVzIGluIG9yZGVyXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIHNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgIGlmICghcnVsZSkgY29udGludWU7XG4gICAgICAgICAgICAgICAgICBjb25zdCB2YWxBID0gZ2V0RmllbGRWYWx1ZShhLCBydWxlLmZpZWxkKTtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IHZhbEIgPSBnZXRGaWVsZFZhbHVlKGIsIHJ1bGUuZmllbGQpO1xuXG4gICAgICAgICAgICAgICAgICBsZXQgcmVzdWx0ID0gMDtcbiAgICAgICAgICAgICAgICAgIGlmICh2YWxBIDwgdmFsQikgcmVzdWx0ID0gLTE7XG4gICAgICAgICAgICAgICAgICBlbHNlIGlmICh2YWxBID4gdmFsQikgcmVzdWx0ID0gMTtcblxuICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdCAhPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBydWxlLm9yZGVyID09PSAnZGVzYycgPyAtcmVzdWx0IDogcmVzdWx0O1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGV2YWx1YXRpbmcgY3VzdG9tIHNvcnRpbmcgcnVsZXNcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBJZiBhbGwgcnVsZXMgZXF1YWwsIGNvbnRpbnVlIHRvIG5leHQgc3RyYXRlZ3kgKHJldHVybiAwKVxuICAgICAgICAgIHJldHVybiAwO1xuICAgICAgfVxuICB9XG5cbiAgLy8gMi4gQnVpbHQtaW4gb3IgZmFsbGJhY2tcbiAgc3dpdGNoIChzdHJhdGVneSkge1xuICAgIGNhc2UgXCJyZWNlbmN5XCI6XG4gICAgICByZXR1cm4gKGIubGFzdEFjY2Vzc2VkID8/IDApIC0gKGEubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgIGNhc2UgXCJuZXN0aW5nXCI6IC8vIEZvcm1lcmx5IGhpZXJhcmNoeVxuICAgICAgcmV0dXJuIGhpZXJhcmNoeVNjb3JlKGEpIC0gaGllcmFyY2h5U2NvcmUoYik7XG4gICAgY2FzZSBcInBpbm5lZFwiOlxuICAgICAgcmV0dXJuIHBpbm5lZFNjb3JlKGEpIC0gcGlubmVkU2NvcmUoYik7XG4gICAgY2FzZSBcInRpdGxlXCI6XG4gICAgICByZXR1cm4gYS50aXRsZS5sb2NhbGVDb21wYXJlKGIudGl0bGUpO1xuICAgIGNhc2UgXCJ1cmxcIjpcbiAgICAgIHJldHVybiBhLnVybC5sb2NhbGVDb21wYXJlKGIudXJsKTtcbiAgICBjYXNlIFwiY29udGV4dFwiOlxuICAgICAgcmV0dXJuIChhLmNvbnRleHQgPz8gXCJcIikubG9jYWxlQ29tcGFyZShiLmNvbnRleHQgPz8gXCJcIik7XG4gICAgY2FzZSBcImRvbWFpblwiOlxuICAgIGNhc2UgXCJkb21haW5fZnVsbFwiOlxuICAgICAgcmV0dXJuIGRvbWFpbkZyb21VcmwoYS51cmwpLmxvY2FsZUNvbXBhcmUoZG9tYWluRnJvbVVybChiLnVybCkpO1xuICAgIGNhc2UgXCJ0b3BpY1wiOlxuICAgICAgcmV0dXJuIHNlbWFudGljQnVja2V0KGEudGl0bGUsIGEudXJsKS5sb2NhbGVDb21wYXJlKHNlbWFudGljQnVja2V0KGIudGl0bGUsIGIudXJsKSk7XG4gICAgY2FzZSBcImxpbmVhZ2VcIjpcbiAgICAgIHJldHVybiBuYXZpZ2F0aW9uS2V5KGEpLmxvY2FsZUNvbXBhcmUobmF2aWdhdGlvbktleShiKSk7XG4gICAgY2FzZSBcImFnZVwiOlxuICAgICAgLy8gUmV2ZXJzZSBhbHBoYWJldGljYWwgZm9yIGFnZSBidWNrZXRzIChUb2RheSA8IFllc3RlcmRheSksIHJvdWdoIGFwcHJveFxuICAgICAgcmV0dXJuIChncm91cGluZ0tleShhLCBcImFnZVwiKSB8fCBcIlwiKS5sb2NhbGVDb21wYXJlKGdyb3VwaW5nS2V5KGIsIFwiYWdlXCIpIHx8IFwiXCIpO1xuICAgIGRlZmF1bHQ6XG4gICAgICAvLyBDaGVjayBpZiBpdCdzIGEgZ2VuZXJpYyBmaWVsZCBmaXJzdFxuICAgICAgY29uc3QgdmFsQSA9IGdldEZpZWxkVmFsdWUoYSwgc3RyYXRlZ3kpO1xuICAgICAgY29uc3QgdmFsQiA9IGdldEZpZWxkVmFsdWUoYiwgc3RyYXRlZ3kpO1xuXG4gICAgICBpZiAodmFsQSAhPT0gdW5kZWZpbmVkICYmIHZhbEIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGlmICh2YWxBIDwgdmFsQikgcmV0dXJuIC0xO1xuICAgICAgICAgIGlmICh2YWxBID4gdmFsQikgcmV0dXJuIDE7XG4gICAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9XG5cbiAgICAgIC8vIEZhbGxiYWNrIGZvciBjdXN0b20gc3RyYXRlZ2llcyBncm91cGluZyBrZXkgKGlmIHVzaW5nIGN1c3RvbSBzdHJhdGVneSBhcyBzb3J0aW5nIGJ1dCBubyBzb3J0aW5nIHJ1bGVzIGRlZmluZWQpXG4gICAgICAvLyBvciB1bmhhbmRsZWQgYnVpbHQtaW5zXG4gICAgICByZXR1cm4gKGdyb3VwaW5nS2V5KGEsIHN0cmF0ZWd5KSB8fCBcIlwiKS5sb2NhbGVDb21wYXJlKGdyb3VwaW5nS2V5KGIsIHN0cmF0ZWd5KSB8fCBcIlwiKTtcbiAgfVxufTtcbiIsICJpbXBvcnQgeyBUYWJHcm91cCwgVGFiTWV0YWRhdGEsIFByZWZlcmVuY2VzIH0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgbWFwQ2hyb21lVGFiLCBnZXRTdG9yZWRQcmVmZXJlbmNlcyB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcbmltcG9ydCB7IHNldEN1c3RvbVN0cmF0ZWdpZXMgfSBmcm9tIFwiLi4vYmFja2dyb3VuZC9ncm91cGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IHNvcnRUYWJzIH0gZnJvbSBcIi4uL2JhY2tncm91bmQvc29ydGluZ1N0cmF0ZWdpZXMuanNcIjtcblxuY29uc3QgZGVmYXVsdFByZWZlcmVuY2VzOiBQcmVmZXJlbmNlcyA9IHtcbiAgc29ydGluZzogW1wicGlubmVkXCIsIFwicmVjZW5jeVwiXSxcbiAgZGVidWc6IGZhbHNlLFxuICB0aGVtZTogXCJkYXJrXCIsXG4gIGN1c3RvbUdlbmVyYToge31cbn07XG5cbmV4cG9ydCBjb25zdCBmZXRjaExvY2FsU3RhdGUgPSBhc3luYyAoKSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgW3RhYnMsIGdyb3VwcywgcHJlZnNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgY2hyb21lLnRhYnMucXVlcnkoe30pLFxuICAgICAgY2hyb21lLnRhYkdyb3Vwcy5xdWVyeSh7fSksXG4gICAgICBnZXRTdG9yZWRQcmVmZXJlbmNlcygpXG4gICAgXSk7XG5cbiAgICBjb25zdCBwcmVmZXJlbmNlcyA9IHByZWZzIHx8IGRlZmF1bHRQcmVmZXJlbmNlcztcblxuICAgIC8vIEluaXRpYWxpemUgY3VzdG9tIHN0cmF0ZWdpZXMgZm9yIHNvcnRpbmdcbiAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZlcmVuY2VzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuXG4gICAgY29uc3QgZ3JvdXBNYXAgPSBuZXcgTWFwKGdyb3Vwcy5tYXAoZyA9PiBbZy5pZCwgZ10pKTtcbiAgICBjb25zdCBtYXBwZWQgPSB0YWJzLm1hcChtYXBDaHJvbWVUYWIpLmZpbHRlcigodCk6IHQgaXMgVGFiTWV0YWRhdGEgPT4gQm9vbGVhbih0KSk7XG5cbiAgICBjb25zdCByZXN1bHRHcm91cHM6IFRhYkdyb3VwW10gPSBbXTtcbiAgICBjb25zdCB0YWJzQnlHcm91cElkID0gbmV3IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhW10+KCk7XG4gICAgY29uc3QgdGFic0J5V2luZG93VW5ncm91cGVkID0gbmV3IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhW10+KCk7XG5cbiAgICBtYXBwZWQuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgICBjb25zdCBncm91cElkID0gdGFiLmdyb3VwSWQgPz8gLTE7XG4gICAgICAgIGlmIChncm91cElkICE9PSAtMSkge1xuICAgICAgICAgICAgaWYgKCF0YWJzQnlHcm91cElkLmhhcyhncm91cElkKSkgdGFic0J5R3JvdXBJZC5zZXQoZ3JvdXBJZCwgW10pO1xuICAgICAgICAgICAgdGFic0J5R3JvdXBJZC5nZXQoZ3JvdXBJZCkhLnB1c2godGFiKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICBpZiAoIXRhYnNCeVdpbmRvd1VuZ3JvdXBlZC5oYXModGFiLndpbmRvd0lkKSkgdGFic0J5V2luZG93VW5ncm91cGVkLnNldCh0YWIud2luZG93SWQsIFtdKTtcbiAgICAgICAgICAgICB0YWJzQnlXaW5kb3dVbmdyb3VwZWQuZ2V0KHRhYi53aW5kb3dJZCkhLnB1c2godGFiKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIFRhYkdyb3VwIG9iamVjdHMgZm9yIGFjdHVhbCBncm91cHNcbiAgICBmb3IgKGNvbnN0IFtncm91cElkLCBncm91cFRhYnNdIG9mIHRhYnNCeUdyb3VwSWQpIHtcbiAgICAgICAgY29uc3QgYnJvd3Nlckdyb3VwID0gZ3JvdXBNYXAuZ2V0KGdyb3VwSWQpO1xuICAgICAgICBpZiAoYnJvd3Nlckdyb3VwKSB7XG4gICAgICAgICAgICByZXN1bHRHcm91cHMucHVzaCh7XG4gICAgICAgICAgICAgICAgaWQ6IGBncm91cC0ke2dyb3VwSWR9YCxcbiAgICAgICAgICAgICAgICB3aW5kb3dJZDogYnJvd3Nlckdyb3VwLndpbmRvd0lkLFxuICAgICAgICAgICAgICAgIGxhYmVsOiBicm93c2VyR3JvdXAudGl0bGUgfHwgXCJVbnRpdGxlZCBHcm91cFwiLFxuICAgICAgICAgICAgICAgIGNvbG9yOiBicm93c2VyR3JvdXAuY29sb3IsXG4gICAgICAgICAgICAgICAgdGFiczogc29ydFRhYnMoZ3JvdXBUYWJzLCBwcmVmZXJlbmNlcy5zb3J0aW5nKSxcbiAgICAgICAgICAgICAgICByZWFzb246IFwiTWFudWFsXCJcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gSGFuZGxlIHVuZ3JvdXBlZCB0YWJzXG4gICAgZm9yIChjb25zdCBbd2luZG93SWQsIHRhYnNdIG9mIHRhYnNCeVdpbmRvd1VuZ3JvdXBlZCkge1xuICAgICAgICByZXN1bHRHcm91cHMucHVzaCh7XG4gICAgICAgICAgICBpZDogYHVuZ3JvdXBlZC0ke3dpbmRvd0lkfWAsXG4gICAgICAgICAgICB3aW5kb3dJZDogd2luZG93SWQsXG4gICAgICAgICAgICBsYWJlbDogXCJVbmdyb3VwZWRcIixcbiAgICAgICAgICAgIGNvbG9yOiBcImdyZXlcIixcbiAgICAgICAgICAgIHRhYnM6IHNvcnRUYWJzKHRhYnMsIHByZWZlcmVuY2VzLnNvcnRpbmcpLFxuICAgICAgICAgICAgcmVhc29uOiBcIlVuZ3JvdXBlZFwiXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnNvbGUud2FybihcIkZldGNoZWQgbG9jYWwgc3RhdGUgKGZhbGxiYWNrKVwiKTtcbiAgICByZXR1cm4geyBvazogdHJ1ZSwgZGF0YTogeyBncm91cHM6IHJlc3VsdEdyb3VwcywgcHJlZmVyZW5jZXMgfSB9O1xuICB9IGNhdGNoIChlKSB7XG4gICAgY29uc29sZS5lcnJvcihcIkxvY2FsIHN0YXRlIGZldGNoIGZhaWxlZDpcIiwgZSk7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGUpIH07XG4gIH1cbn07XG4iLCAiaW1wb3J0IHtcbiAgQXBwbHlHcm91cGluZ1BheWxvYWQsXG4gIEdyb3VwaW5nU2VsZWN0aW9uLFxuICBQcmVmZXJlbmNlcyxcbiAgUnVudGltZU1lc3NhZ2UsXG4gIFJ1bnRpbWVSZXNwb25zZSxcbiAgU2F2ZWRTdGF0ZSxcbiAgU29ydGluZ1N0cmF0ZWd5LFxuICBUYWJHcm91cCxcbiAgVGFiTWV0YWRhdGFcbn0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgZmV0Y2hMb2NhbFN0YXRlIH0gZnJvbSBcIi4vbG9jYWxTdGF0ZS5qc1wiO1xuXG5leHBvcnQgY29uc3Qgc2VuZE1lc3NhZ2UgPSBhc3luYyA8VERhdGE+KHR5cGU6IFJ1bnRpbWVNZXNzYWdlW1widHlwZVwiXSwgcGF5bG9hZD86IGFueSk6IFByb21pc2U8UnVudGltZVJlc3BvbnNlPFREYXRhPj4gPT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGUsIHBheWxvYWQgfSwgKHJlc3BvbnNlKSA9PiB7XG4gICAgICBpZiAoY2hyb21lLnJ1bnRpbWUubGFzdEVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJSdW50aW1lIGVycm9yOlwiLCBjaHJvbWUucnVudGltZS5sYXN0RXJyb3IpO1xuICAgICAgICByZXNvbHZlKHsgb2s6IGZhbHNlLCBlcnJvcjogY2hyb21lLnJ1bnRpbWUubGFzdEVycm9yLm1lc3NhZ2UgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXNvbHZlKHJlc3BvbnNlIHx8IHsgb2s6IGZhbHNlLCBlcnJvcjogXCJObyByZXNwb25zZSBmcm9tIGJhY2tncm91bmRcIiB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSk7XG59O1xuXG5leHBvcnQgdHlwZSBUYWJXaXRoR3JvdXAgPSBUYWJNZXRhZGF0YSAmIHtcbiAgZ3JvdXBMYWJlbD86IHN0cmluZztcbiAgZ3JvdXBDb2xvcj86IHN0cmluZztcbiAgcmVhc29uPzogc3RyaW5nO1xufTtcblxuZXhwb3J0IGludGVyZmFjZSBXaW5kb3dWaWV3IHtcbiAgaWQ6IG51bWJlcjtcbiAgdGl0bGU6IHN0cmluZztcbiAgdGFiczogVGFiV2l0aEdyb3VwW107XG4gIHRhYkNvdW50OiBudW1iZXI7XG4gIGdyb3VwQ291bnQ6IG51bWJlcjtcbiAgcGlubmVkQ291bnQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IElDT05TID0ge1xuICBhY3RpdmU6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cG9seWdvbiBwb2ludHM9XCIzIDExIDIyIDIgMTMgMjEgMTEgMTMgMyAxMVwiPjwvcG9seWdvbj48L3N2Zz5gLFxuICBoaWRlOiBgPHN2ZyB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBhdGggZD1cIk0xNy45NCAxNy45NEExMC4wNyAxMC4wNyAwIDAgMSAxMiAyMGMtNyAwLTExLTgtMTEtOGExOC40NSAxOC40NSAwIDAgMSA1LjA2LTUuOTRNOS45IDQuMjRBOS4xMiA5LjEyIDAgMCAxIDEyIDRjNyAwIDExIDggMTEgOGExOC41IDE4LjUgMCAwIDEtMi4xNiAzLjE5bS02LjcyLTEuMDdhMyAzIDAgMSAxLTQuMjQtNC4yNFwiPjwvcGF0aD48bGluZSB4MT1cIjFcIiB5MT1cIjFcIiB4Mj1cIjIzXCIgeTI9XCIyM1wiPjwvbGluZT48L3N2Zz5gLFxuICBzaG93OiBgPHN2ZyB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBhdGggZD1cIk0xIDEyczQtOCAxMS04IDExIDggMTEgOC00IDgtMTEgOC0xMS04LTExLTgtMTEtOHpcIj48L3BhdGg+PGNpcmNsZSBjeD1cIjEyXCIgY3k9XCIxMlwiIHI9XCIzXCI+PC9jaXJjbGU+PC9zdmc+YCxcbiAgZm9jdXM6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjEwXCI+PC9jaXJjbGU+PGNpcmNsZSBjeD1cIjEyXCIgY3k9XCIxMlwiIHI9XCI2XCI+PC9jaXJjbGU+PGNpcmNsZSBjeD1cIjEyXCIgY3k9XCIxMlwiIHI9XCIyXCI+PC9jaXJjbGU+PC9zdmc+YCxcbiAgY2xvc2U6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48bGluZSB4MT1cIjE4XCIgeTE9XCI2XCIgeDI9XCI2XCIgeTI9XCIxOFwiPjwvbGluZT48bGluZSB4MT1cIjZcIiB5MT1cIjZcIiB4Mj1cIjE4XCIgeTI9XCIxOFwiPjwvbGluZT48L3N2Zz5gLFxuICB1bmdyb3VwOiBgPHN2ZyB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PGNpcmNsZSBjeD1cIjEyXCIgY3k9XCIxMlwiIHI9XCIxMFwiPjwvY2lyY2xlPjxsaW5lIHgxPVwiOFwiIHkxPVwiMTJcIiB4Mj1cIjE2XCIgeTI9XCIxMlwiPjwvbGluZT48L3N2Zz5gLFxuICBkZWZhdWx0RmlsZTogYDxzdmcgd2lkdGg9XCIyNFwiIGhlaWdodD1cIjI0XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwYXRoIGQ9XCJNMTQgMkg2YTIgMiAwIDAgMC0yIDJ2MTZhMiAyIDAgMCAwIDIgMmgxMmEyIDIgMCAwIDAgMi0yVjh6XCI+PC9wYXRoPjxwb2x5bGluZSBwb2ludHM9XCIxNCAyIDE0IDggMjAgOFwiPjwvcG9seWxpbmU+PGxpbmUgeDE9XCIxNlwiIHkxPVwiMTNcIiB4Mj1cIjhcIiB5Mj1cIjEzXCI+PC9saW5lPjxsaW5lIHgxPVwiMTZcIiB5MT1cIjE3XCIgeDI9XCI4XCIgeTI9XCIxN1wiPjwvbGluZT48cG9seWxpbmUgcG9pbnRzPVwiMTAgOSA5IDkgOCA5XCI+PC9wb2x5bGluZT48L3N2Zz5gLFxuICBhdXRvUnVuOiBgPHN2ZyB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBvbHlnb24gcG9pbnRzPVwiMTMgMiAzIDE0IDEyIDE0IDExIDIyIDIxIDEwIDEyIDEwIDEzIDJcIj48L3BvbHlnb24+PC9zdmc+YFxufTtcblxuZXhwb3J0IGNvbnN0IEdST1VQX0NPTE9SUzogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgZ3JleTogXCIjNjQ3NDhiXCIsXG4gIGJsdWU6IFwiIzNiODJmNlwiLFxuICByZWQ6IFwiI2VmNDQ0NFwiLFxuICB5ZWxsb3c6IFwiI2VhYjMwOFwiLFxuICBncmVlbjogXCIjMjJjNTVlXCIsXG4gIHBpbms6IFwiI2VjNDg5OVwiLFxuICBwdXJwbGU6IFwiI2E4NTVmN1wiLFxuICBjeWFuOiBcIiMwNmI2ZDRcIixcbiAgb3JhbmdlOiBcIiNmOTczMTZcIlxufTtcblxuZXhwb3J0IGNvbnN0IGdldEdyb3VwQ29sb3IgPSAobmFtZTogc3RyaW5nKSA9PiBHUk9VUF9DT0xPUlNbbmFtZV0gfHwgXCIjY2JkNWUxXCI7XG5cbmV4cG9ydCBjb25zdCBmZXRjaFN0YXRlID0gYXN5bmMgKCkgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgc2VuZE1lc3NhZ2U8eyBncm91cHM6IFRhYkdyb3VwW107IHByZWZlcmVuY2VzOiBQcmVmZXJlbmNlcyB9PihcImdldFN0YXRlXCIpO1xuICAgIGlmIChyZXNwb25zZS5vayAmJiByZXNwb25zZS5kYXRhKSB7XG4gICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgfVxuICAgIGNvbnNvbGUud2FybihcImZldGNoU3RhdGUgZmFpbGVkLCB1c2luZyBmYWxsYmFjazpcIiwgcmVzcG9uc2UuZXJyb3IpO1xuICAgIHJldHVybiBhd2FpdCBmZXRjaExvY2FsU3RhdGUoKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGNvbnNvbGUud2FybihcImZldGNoU3RhdGUgdGhyZXcgZXhjZXB0aW9uLCB1c2luZyBmYWxsYmFjazpcIiwgZSk7XG4gICAgcmV0dXJuIGF3YWl0IGZldGNoTG9jYWxTdGF0ZSgpO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgYXBwbHlHcm91cGluZyA9IGFzeW5jIChwYXlsb2FkOiBBcHBseUdyb3VwaW5nUGF5bG9hZCkgPT4ge1xuICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogXCJhcHBseUdyb3VwaW5nXCIsIHBheWxvYWQgfSk7XG4gIHJldHVybiByZXNwb25zZSBhcyBSdW50aW1lUmVzcG9uc2U8dW5rbm93bj47XG59O1xuXG5leHBvcnQgY29uc3QgYXBwbHlTb3J0aW5nID0gYXN5bmMgKHBheWxvYWQ6IEFwcGx5R3JvdXBpbmdQYXlsb2FkKSA9PiB7XG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImFwcGx5U29ydGluZ1wiLCBwYXlsb2FkIH0pO1xuICByZXR1cm4gcmVzcG9uc2UgYXMgUnVudGltZVJlc3BvbnNlPHVua25vd24+O1xufTtcblxuZXhwb3J0IGNvbnN0IG1hcFdpbmRvd3MgPSAoZ3JvdXBzOiBUYWJHcm91cFtdLCB3aW5kb3dUaXRsZXM6IE1hcDxudW1iZXIsIHN0cmluZz4pOiBXaW5kb3dWaWV3W10gPT4ge1xuICBjb25zdCB3aW5kb3dzID0gbmV3IE1hcDxudW1iZXIsIFRhYldpdGhHcm91cFtdPigpO1xuXG4gIGdyb3Vwcy5mb3JFYWNoKChncm91cCkgPT4ge1xuICAgIGNvbnN0IGlzVW5ncm91cGVkID0gZ3JvdXAucmVhc29uID09PSBcIlVuZ3JvdXBlZFwiO1xuICAgIGdyb3VwLnRhYnMuZm9yRWFjaCgodGFiKSA9PiB7XG4gICAgICBjb25zdCBkZWNvcmF0ZWQ6IFRhYldpdGhHcm91cCA9IHtcbiAgICAgICAgLi4udGFiLFxuICAgICAgICBncm91cExhYmVsOiBpc1VuZ3JvdXBlZCA/IHVuZGVmaW5lZCA6IGdyb3VwLmxhYmVsLFxuICAgICAgICBncm91cENvbG9yOiBpc1VuZ3JvdXBlZCA/IHVuZGVmaW5lZCA6IGdyb3VwLmNvbG9yLFxuICAgICAgICByZWFzb246IGdyb3VwLnJlYXNvblxuICAgICAgfTtcbiAgICAgIGNvbnN0IGV4aXN0aW5nID0gd2luZG93cy5nZXQodGFiLndpbmRvd0lkKSA/PyBbXTtcbiAgICAgIGV4aXN0aW5nLnB1c2goZGVjb3JhdGVkKTtcbiAgICAgIHdpbmRvd3Muc2V0KHRhYi53aW5kb3dJZCwgZXhpc3RpbmcpO1xuICAgIH0pO1xuICB9KTtcblxuICByZXR1cm4gQXJyYXkuZnJvbSh3aW5kb3dzLmVudHJpZXMoKSlcbiAgICAubWFwPFdpbmRvd1ZpZXc+KChbaWQsIHRhYnNdKSA9PiB7XG4gICAgICBjb25zdCBncm91cENvdW50ID0gbmV3IFNldCh0YWJzLm1hcCgodGFiKSA9PiB0YWIuZ3JvdXBMYWJlbCkuZmlsdGVyKChsKTogbCBpcyBzdHJpbmcgPT4gISFsKSkuc2l6ZTtcbiAgICAgIGNvbnN0IHBpbm5lZENvdW50ID0gdGFicy5maWx0ZXIoKHRhYikgPT4gdGFiLnBpbm5lZCkubGVuZ3RoO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgaWQsXG4gICAgICAgIHRpdGxlOiB3aW5kb3dUaXRsZXMuZ2V0KGlkKSA/PyBgV2luZG93ICR7aWR9YCxcbiAgICAgICAgdGFicyxcbiAgICAgICAgdGFiQ291bnQ6IHRhYnMubGVuZ3RoLFxuICAgICAgICBncm91cENvdW50LFxuICAgICAgICBwaW5uZWRDb3VudFxuICAgICAgfTtcbiAgICB9KVxuICAgIC5zb3J0KChhLCBiKSA9PiBhLmlkIC0gYi5pZCk7XG59O1xuXG5leHBvcnQgY29uc3QgZm9ybWF0RG9tYWluID0gKHVybDogc3RyaW5nKSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcGFyc2VkID0gbmV3IFVSTCh1cmwpO1xuICAgIHJldHVybiBwYXJzZWQuaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sIFwiXCIpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIHJldHVybiB1cmw7XG4gIH1cbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXREcmFnQWZ0ZXJFbGVtZW50KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHk6IG51bWJlciwgc2VsZWN0b3I6IHN0cmluZykge1xuICBjb25zdCBkcmFnZ2FibGVFbGVtZW50cyA9IEFycmF5LmZyb20oY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpKTtcblxuICByZXR1cm4gZHJhZ2dhYmxlRWxlbWVudHMucmVkdWNlKChjbG9zZXN0LCBjaGlsZCkgPT4ge1xuICAgIGNvbnN0IGJveCA9IGNoaWxkLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIGNvbnN0IG9mZnNldCA9IHkgLSBib3gudG9wIC0gYm94LmhlaWdodCAvIDI7XG4gICAgaWYgKG9mZnNldCA8IDAgJiYgb2Zmc2V0ID4gY2xvc2VzdC5vZmZzZXQpIHtcbiAgICAgIHJldHVybiB7IG9mZnNldDogb2Zmc2V0LCBlbGVtZW50OiBjaGlsZCB9O1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gY2xvc2VzdDtcbiAgICB9XG4gIH0sIHsgb2Zmc2V0OiBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFksIGVsZW1lbnQ6IG51bGwgYXMgRWxlbWVudCB8IG51bGwgfSkuZWxlbWVudDtcbn1cbiIsICJpbXBvcnQge1xuICBHcm91cGluZ1NlbGVjdGlvbixcbiAgUHJlZmVyZW5jZXMsXG4gIFNhdmVkU3RhdGUsXG4gIFNvcnRpbmdTdHJhdGVneSxcbiAgTG9nTGV2ZWwsXG4gIFRhYkdyb3VwXG59IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7XG4gIGFwcGx5R3JvdXBpbmcsXG4gIGFwcGx5U29ydGluZyxcbiAgZmV0Y2hTdGF0ZSxcbiAgSUNPTlMsXG4gIG1hcFdpbmRvd3MsXG4gIHNlbmRNZXNzYWdlLFxuICBUYWJXaXRoR3JvdXAsXG4gIFdpbmRvd1ZpZXcsXG4gIEdST1VQX0NPTE9SUyxcbiAgZ2V0RHJhZ0FmdGVyRWxlbWVudFxufSBmcm9tIFwiLi9jb21tb24uanNcIjtcbmltcG9ydCB7IGdldFN0cmF0ZWdpZXMsIFNUUkFURUdJRVMsIFN0cmF0ZWd5RGVmaW5pdGlvbiB9IGZyb20gXCIuLi9zaGFyZWQvc3RyYXRlZ3lSZWdpc3RyeS5qc1wiO1xuaW1wb3J0IHsgc2V0TG9nZ2VyUHJlZmVyZW5jZXMsIGxvZ0RlYnVnLCBsb2dJbmZvIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGZldGNoTG9jYWxTdGF0ZSB9IGZyb20gXCIuL2xvY2FsU3RhdGUuanNcIjtcblxuLy8gRWxlbWVudHNcbmNvbnN0IHNlYXJjaElucHV0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ0YWJTZWFyY2hcIikgYXMgSFRNTElucHV0RWxlbWVudDtcbmNvbnN0IHdpbmRvd3NDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIndpbmRvd3NcIikgYXMgSFRNTERpdkVsZW1lbnQ7XG5cbmNvbnN0IHNlbGVjdEFsbENoZWNrYm94ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzZWxlY3RBbGxcIikgYXMgSFRNTElucHV0RWxlbWVudDtcbmNvbnN0IGJ0bkFwcGx5ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5BcHBseVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcbmNvbnN0IGJ0blVuZ3JvdXAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0blVuZ3JvdXBcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5jb25zdCBidG5NZXJnZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuTWVyZ2VcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5jb25zdCBidG5TcGxpdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuU3BsaXRcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5jb25zdCBidG5FeHBhbmRBbGwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0bkV4cGFuZEFsbFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcbmNvbnN0IGJ0bkNvbGxhcHNlQWxsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5Db2xsYXBzZUFsbFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcblxuY29uc3QgYWN0aXZlU3RyYXRlZ2llc0xpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImFjdGl2ZVN0cmF0ZWdpZXNMaXN0XCIpIGFzIEhUTUxEaXZFbGVtZW50O1xuY29uc3QgYWRkU3RyYXRlZ3lTZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImFkZFN0cmF0ZWd5U2VsZWN0XCIpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuXG4vLyBTdGF0c1xuY29uc3Qgc3RhdFRhYnMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInN0YXRUYWJzXCIpIGFzIEhUTUxFbGVtZW50O1xuY29uc3Qgc3RhdEdyb3VwcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3RhdEdyb3Vwc1wiKSBhcyBIVE1MRWxlbWVudDtcbmNvbnN0IHN0YXRXaW5kb3dzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzdGF0V2luZG93c1wiKSBhcyBIVE1MRWxlbWVudDtcblxuY29uc3QgcHJvZ3Jlc3NPdmVybGF5ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJwcm9ncmVzc092ZXJsYXlcIikgYXMgSFRNTERpdkVsZW1lbnQ7XG5jb25zdCBwcm9ncmVzc1RleHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInByb2dyZXNzVGV4dFwiKSBhcyBIVE1MRGl2RWxlbWVudDtcbmNvbnN0IHByb2dyZXNzQ291bnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInByb2dyZXNzQ291bnRcIikgYXMgSFRNTERpdkVsZW1lbnQ7XG5cbmNvbnN0IHNob3dMb2FkaW5nID0gKHRleHQ6IHN0cmluZykgPT4ge1xuICAgIGlmIChwcm9ncmVzc092ZXJsYXkpIHtcbiAgICAgICAgcHJvZ3Jlc3NUZXh0LnRleHRDb250ZW50ID0gdGV4dDtcbiAgICAgICAgcHJvZ3Jlc3NDb3VudC50ZXh0Q29udGVudCA9IFwiXCI7XG4gICAgICAgIHByb2dyZXNzT3ZlcmxheS5jbGFzc0xpc3QucmVtb3ZlKFwiaGlkZGVuXCIpO1xuICAgIH1cbn07XG5cbmNvbnN0IGhpZGVMb2FkaW5nID0gKCkgPT4ge1xuICAgIGlmIChwcm9ncmVzc092ZXJsYXkpIHtcbiAgICAgICAgcHJvZ3Jlc3NPdmVybGF5LmNsYXNzTGlzdC5hZGQoXCJoaWRkZW5cIik7XG4gICAgfVxufTtcblxuY29uc3QgdXBkYXRlUHJvZ3Jlc3MgPSAoY29tcGxldGVkOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+IHtcbiAgICBpZiAocHJvZ3Jlc3NPdmVybGF5ICYmICFwcm9ncmVzc092ZXJsYXkuY2xhc3NMaXN0LmNvbnRhaW5zKFwiaGlkZGVuXCIpKSB7XG4gICAgICAgIHByb2dyZXNzQ291bnQudGV4dENvbnRlbnQgPSBgJHtjb21wbGV0ZWR9IC8gJHt0b3RhbH1gO1xuICAgIH1cbn07XG5cbmxldCB3aW5kb3dTdGF0ZTogV2luZG93Vmlld1tdID0gW107XG5sZXQgZm9jdXNlZFdpbmRvd0lkOiBudW1iZXIgfCBudWxsID0gbnVsbDtcbmNvbnN0IHNlbGVjdGVkVGFicyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xubGV0IGluaXRpYWxTZWxlY3Rpb25Eb25lID0gZmFsc2U7XG5sZXQgcHJlZmVyZW5jZXM6IFByZWZlcmVuY2VzIHwgbnVsbCA9IG51bGw7XG5sZXQgbG9jYWxQcmVmZXJlbmNlc01vZGlmaWVkVGltZSA9IDA7XG5cbi8vIFRyZWUgU3RhdGVcbmNvbnN0IGV4cGFuZGVkTm9kZXMgPSBuZXcgU2V0PHN0cmluZz4oKTsgLy8gRGVmYXVsdCBlbXB0eSA9IGFsbCBjb2xsYXBzZWRcbmNvbnN0IFRSRUVfSUNPTlMgPSB7XG4gIGNoZXZyb25SaWdodDogYDxzdmcgd2lkdGg9XCIxMDAlXCIgaGVpZ2h0PVwiMTAwJVwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cG9seWxpbmUgcG9pbnRzPVwiOSAxOCAxNSAxMiA5IDZcIj48L3BvbHlsaW5lPjwvc3ZnPmAsXG4gIGZvbGRlcjogYDxzdmcgd2lkdGg9XCIxMDAlXCIgaGVpZ2h0PVwiMTAwJVwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cGF0aCBkPVwiTTIyIDE5YTIgMiAwIDAgMS0yIDJINGEyIDIgMCAwIDEtMi0yVjVhMiAyIDAgMCAxIDItMmg1bDIgM2g5YTIgMiAwIDAgMSAyIDJ6XCI+PC9wYXRoPjwvc3ZnPmBcbn07XG5cbmNvbnN0IGhleFRvUmdiYSA9IChoZXg6IHN0cmluZywgYWxwaGE6IG51bWJlcikgPT4ge1xuICAgIC8vIEVuc3VyZSBoZXggZm9ybWF0XG4gICAgaWYgKCFoZXguc3RhcnRzV2l0aCgnIycpKSByZXR1cm4gaGV4O1xuICAgIGNvbnN0IHIgPSBwYXJzZUludChoZXguc2xpY2UoMSwgMyksIDE2KTtcbiAgICBjb25zdCBnID0gcGFyc2VJbnQoaGV4LnNsaWNlKDMsIDUpLCAxNik7XG4gICAgY29uc3QgYiA9IHBhcnNlSW50KGhleC5zbGljZSg1LCA3KSwgMTYpO1xuICAgIHJldHVybiBgcmdiYSgke3J9LCAke2d9LCAke2J9LCAke2FscGhhfSlgO1xufTtcblxuY29uc3QgdXBkYXRlU3RhdHMgPSAoKSA9PiB7XG4gIGNvbnN0IHRvdGFsVGFicyA9IHdpbmRvd1N0YXRlLnJlZHVjZSgoYWNjLCB3aW4pID0+IGFjYyArIHdpbi50YWJDb3VudCwgMCk7XG4gIGNvbnN0IHRvdGFsR3JvdXBzID0gbmV3IFNldCh3aW5kb3dTdGF0ZS5mbGF0TWFwKHcgPT4gdy50YWJzLmZpbHRlcih0ID0+IHQuZ3JvdXBMYWJlbCkubWFwKHQgPT4gYCR7dy5pZH0tJHt0Lmdyb3VwTGFiZWx9YCkpKS5zaXplO1xuXG4gIHN0YXRUYWJzLnRleHRDb250ZW50ID0gYCR7dG90YWxUYWJzfSBUYWJzYDtcbiAgc3RhdEdyb3Vwcy50ZXh0Q29udGVudCA9IGAke3RvdGFsR3JvdXBzfSBHcm91cHNgO1xuICBzdGF0V2luZG93cy50ZXh0Q29udGVudCA9IGAke3dpbmRvd1N0YXRlLmxlbmd0aH0gV2luZG93c2A7XG5cbiAgLy8gVXBkYXRlIHNlbGVjdGlvbiBidXR0b25zXG4gIGNvbnN0IGhhc1NlbGVjdGlvbiA9IHNlbGVjdGVkVGFicy5zaXplID4gMDtcbiAgYnRuVW5ncm91cC5kaXNhYmxlZCA9ICFoYXNTZWxlY3Rpb247XG4gIGJ0bk1lcmdlLmRpc2FibGVkID0gIWhhc1NlbGVjdGlvbjtcbiAgYnRuU3BsaXQuZGlzYWJsZWQgPSAhaGFzU2VsZWN0aW9uO1xuXG4gIGJ0blVuZ3JvdXAuc3R5bGUub3BhY2l0eSA9IGhhc1NlbGVjdGlvbiA/IFwiMVwiIDogXCIwLjVcIjtcbiAgYnRuTWVyZ2Uuc3R5bGUub3BhY2l0eSA9IGhhc1NlbGVjdGlvbiA/IFwiMVwiIDogXCIwLjVcIjtcbiAgYnRuU3BsaXQuc3R5bGUub3BhY2l0eSA9IGhhc1NlbGVjdGlvbiA/IFwiMVwiIDogXCIwLjVcIjtcblxuICAvLyBVcGRhdGUgU2VsZWN0IEFsbCBDaGVja2JveCBTdGF0ZVxuICBpZiAodG90YWxUYWJzID09PSAwKSB7XG4gICAgc2VsZWN0QWxsQ2hlY2tib3guY2hlY2tlZCA9IGZhbHNlO1xuICAgIHNlbGVjdEFsbENoZWNrYm94LmluZGV0ZXJtaW5hdGUgPSBmYWxzZTtcbiAgfSBlbHNlIGlmIChzZWxlY3RlZFRhYnMuc2l6ZSA9PT0gdG90YWxUYWJzKSB7XG4gICAgc2VsZWN0QWxsQ2hlY2tib3guY2hlY2tlZCA9IHRydWU7XG4gICAgc2VsZWN0QWxsQ2hlY2tib3guaW5kZXRlcm1pbmF0ZSA9IGZhbHNlO1xuICB9IGVsc2UgaWYgKHNlbGVjdGVkVGFicy5zaXplID4gMCkge1xuICAgIHNlbGVjdEFsbENoZWNrYm94LmNoZWNrZWQgPSBmYWxzZTtcbiAgICBzZWxlY3RBbGxDaGVja2JveC5pbmRldGVybWluYXRlID0gdHJ1ZTtcbiAgfSBlbHNlIHtcbiAgICBzZWxlY3RBbGxDaGVja2JveC5jaGVja2VkID0gZmFsc2U7XG4gICAgc2VsZWN0QWxsQ2hlY2tib3guaW5kZXRlcm1pbmF0ZSA9IGZhbHNlO1xuICB9XG59O1xuXG5jb25zdCBjcmVhdGVOb2RlID0gKFxuICAgIGNvbnRlbnQ6IEhUTUxFbGVtZW50LFxuICAgIGNoaWxkcmVuQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IG51bGwsXG4gICAgbGV2ZWw6ICd3aW5kb3cnIHwgJ2dyb3VwJyB8ICd0YWInLFxuICAgIGlzRXhwYW5kZWQ6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICBvblRvZ2dsZT86ICgpID0+IHZvaWRcbikgPT4ge1xuICAgIGNvbnN0IG5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIG5vZGUuY2xhc3NOYW1lID0gYHRyZWUtbm9kZSBub2RlLSR7bGV2ZWx9YDtcblxuICAgIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgcm93LmNsYXNzTmFtZSA9IGB0cmVlLXJvdyAke2xldmVsfS1yb3dgO1xuXG4gICAgLy8gVG9nZ2xlXG4gICAgY29uc3QgdG9nZ2xlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICB0b2dnbGUuY2xhc3NOYW1lID0gYHRyZWUtdG9nZ2xlICR7aXNFeHBhbmRlZCA/ICdyb3RhdGVkJyA6ICcnfWA7XG4gICAgaWYgKGNoaWxkcmVuQ29udGFpbmVyKSB7XG4gICAgICAgIHRvZ2dsZS5pbm5lckhUTUwgPSBUUkVFX0lDT05TLmNoZXZyb25SaWdodDtcbiAgICAgICAgdG9nZ2xlLm9uY2xpY2sgPSAoZSkgPT4ge1xuICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgIGlmIChvblRvZ2dsZSkgb25Ub2dnbGUoKTtcbiAgICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB0b2dnbGUuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG4gICAgfVxuXG4gICAgcm93LmFwcGVuZENoaWxkKHRvZ2dsZSk7XG4gICAgcm93LmFwcGVuZENoaWxkKGNvbnRlbnQpOyAvLyBDb250ZW50IGhhbmRsZXMgY2hlY2tib3ggKyBpY29uICsgdGV4dCArIGFjdGlvbnNcblxuICAgIG5vZGUuYXBwZW5kQ2hpbGQocm93KTtcblxuICAgIGlmIChjaGlsZHJlbkNvbnRhaW5lcikge1xuICAgICAgICBjaGlsZHJlbkNvbnRhaW5lci5jbGFzc05hbWUgPSBgdHJlZS1jaGlsZHJlbiAke2lzRXhwYW5kZWQgPyAnZXhwYW5kZWQnIDogJyd9YDtcbiAgICAgICAgbm9kZS5hcHBlbmRDaGlsZChjaGlsZHJlbkNvbnRhaW5lcik7XG4gICAgfVxuXG4gICAgLy8gVG9nZ2xlIGludGVyYWN0aW9uIG9uIHJvdyBjbGljayBmb3IgV2luZG93cyBhbmQgR3JvdXBzXG4gICAgaWYgKGNoaWxkcmVuQ29udGFpbmVyICYmIGxldmVsICE9PSAndGFiJykge1xuICAgICAgICByb3cuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgICAgICAgICAgLy8gQXZvaWQgdG9nZ2xpbmcgaWYgY2xpY2tpbmcgYWN0aW9ucyBvciBjaGVja2JveFxuICAgICAgICAgICAgaWYgKChlLnRhcmdldCBhcyBIVE1MRWxlbWVudCkuY2xvc2VzdCgnLmFjdGlvbi1idG4nKSB8fCAoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpLmNsb3Nlc3QoJy50cmVlLWNoZWNrYm94JykpIHJldHVybjtcbiAgICAgICAgICAgIGlmIChvblRvZ2dsZSkgb25Ub2dnbGUoKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgbm9kZSwgdG9nZ2xlLCBjaGlsZHJlbkNvbnRhaW5lciB9O1xufTtcblxuY29uc3QgcmVuZGVyVHJlZSA9ICgpID0+IHtcbiAgY29uc3QgcXVlcnkgPSBzZWFyY2hJbnB1dC52YWx1ZS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgd2luZG93c0NvbnRhaW5lci5pbm5lckhUTUwgPSBcIlwiO1xuXG4gIC8vIEZpbHRlciBMb2dpY1xuICBjb25zdCBmaWx0ZXJlZCA9IHdpbmRvd1N0YXRlXG4gICAgLm1hcCgod2luZG93KSA9PiB7XG4gICAgICBpZiAoIXF1ZXJ5KSByZXR1cm4geyB3aW5kb3csIHZpc2libGVUYWJzOiB3aW5kb3cudGFicyB9O1xuICAgICAgY29uc3QgdmlzaWJsZVRhYnMgPSB3aW5kb3cudGFicy5maWx0ZXIoXG4gICAgICAgICh0YWIpID0+IHRhYi50aXRsZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHF1ZXJ5KSB8fCB0YWIudXJsLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMocXVlcnkpXG4gICAgICApO1xuICAgICAgcmV0dXJuIHsgd2luZG93LCB2aXNpYmxlVGFicyB9O1xuICAgIH0pXG4gICAgLmZpbHRlcigoeyB2aXNpYmxlVGFicyB9KSA9PiB2aXNpYmxlVGFicy5sZW5ndGggPiAwIHx8ICFxdWVyeSk7XG5cbiAgZmlsdGVyZWQuZm9yRWFjaCgoeyB3aW5kb3csIHZpc2libGVUYWJzIH0pID0+IHtcbiAgICBjb25zdCB3aW5kb3dLZXkgPSBgdy0ke3dpbmRvdy5pZH1gO1xuICAgIGNvbnN0IGlzRXhwYW5kZWQgPSAhIXF1ZXJ5IHx8IGV4cGFuZGVkTm9kZXMuaGFzKHdpbmRvd0tleSk7XG5cbiAgICAvLyBXaW5kb3cgQ2hlY2tib3ggTG9naWNcbiAgICBjb25zdCBhbGxUYWJJZHMgPSB2aXNpYmxlVGFicy5tYXAodCA9PiB0LmlkKTtcbiAgICBjb25zdCBzZWxlY3RlZENvdW50ID0gYWxsVGFiSWRzLmZpbHRlcihpZCA9PiBzZWxlY3RlZFRhYnMuaGFzKGlkKSkubGVuZ3RoO1xuICAgIGNvbnN0IGlzQWxsID0gc2VsZWN0ZWRDb3VudCA9PT0gYWxsVGFiSWRzLmxlbmd0aCAmJiBhbGxUYWJJZHMubGVuZ3RoID4gMDtcbiAgICBjb25zdCBpc1NvbWUgPSBzZWxlY3RlZENvdW50ID4gMCAmJiBzZWxlY3RlZENvdW50IDwgYWxsVGFiSWRzLmxlbmd0aDtcblxuICAgIGNvbnN0IHdpbkNoZWNrYm94ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImlucHV0XCIpO1xuICAgIHdpbkNoZWNrYm94LnR5cGUgPSBcImNoZWNrYm94XCI7XG4gICAgd2luQ2hlY2tib3guY2xhc3NOYW1lID0gXCJ0cmVlLWNoZWNrYm94XCI7XG4gICAgd2luQ2hlY2tib3guY2hlY2tlZCA9IGlzQWxsO1xuICAgIHdpbkNoZWNrYm94LmluZGV0ZXJtaW5hdGUgPSBpc1NvbWU7XG4gICAgd2luQ2hlY2tib3gub25jbGljayA9IChlKSA9PiB7XG4gICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgIGNvbnN0IHRhcmdldFN0YXRlID0gIWlzQWxsOyAvLyBJZiBhbGwgd2VyZSBzZWxlY3RlZCwgZGVzZWxlY3QuIE90aGVyd2lzZSBzZWxlY3QgYWxsLlxuICAgICAgICBhbGxUYWJJZHMuZm9yRWFjaChpZCA9PiB7XG4gICAgICAgICAgICBpZiAodGFyZ2V0U3RhdGUpIHNlbGVjdGVkVGFicy5hZGQoaWQpO1xuICAgICAgICAgICAgZWxzZSBzZWxlY3RlZFRhYnMuZGVsZXRlKGlkKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJlbmRlclRyZWUoKTtcbiAgICB9O1xuXG4gICAgLy8gV2luZG93IENvbnRlbnRcbiAgICBjb25zdCB3aW5Db250ZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICB3aW5Db250ZW50LnN0eWxlLmRpc3BsYXkgPSBcImZsZXhcIjtcbiAgICB3aW5Db250ZW50LnN0eWxlLmFsaWduSXRlbXMgPSBcImNlbnRlclwiO1xuICAgIHdpbkNvbnRlbnQuc3R5bGUuZmxleCA9IFwiMVwiO1xuICAgIHdpbkNvbnRlbnQuc3R5bGUub3ZlcmZsb3cgPSBcImhpZGRlblwiO1xuXG4gICAgY29uc3QgbGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGxhYmVsLmNsYXNzTmFtZSA9IFwidHJlZS1sYWJlbFwiO1xuICAgIGxhYmVsLnRleHRDb250ZW50ID0gd2luZG93LnRpdGxlO1xuXG4gICAgY29uc3QgY291bnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGNvdW50LmNsYXNzTmFtZSA9IFwidHJlZS1jb3VudFwiO1xuICAgIGNvdW50LnRleHRDb250ZW50ID0gYCgke3Zpc2libGVUYWJzLmxlbmd0aH0gVGFicylgO1xuXG4gICAgd2luQ29udGVudC5hcHBlbmQod2luQ2hlY2tib3gsIGxhYmVsLCBjb3VudCk7XG5cbiAgICAvLyBDaGlsZHJlbiAoR3JvdXBzKVxuICAgIGNvbnN0IGNoaWxkcmVuQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcblxuICAgIC8vIEdyb3VwIHRhYnNcbiAgICBjb25zdCBncm91cHMgPSBuZXcgTWFwPHN0cmluZywgeyBjb2xvcjogc3RyaW5nOyB0YWJzOiBUYWJXaXRoR3JvdXBbXSB9PigpO1xuICAgIGNvbnN0IHVuZ3JvdXBlZFRhYnM6IFRhYldpdGhHcm91cFtdID0gW107XG4gICAgdmlzaWJsZVRhYnMuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgICBpZiAodGFiLmdyb3VwTGFiZWwpIHtcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IHRhYi5ncm91cExhYmVsO1xuICAgICAgICAgICAgY29uc3QgZW50cnkgPSBncm91cHMuZ2V0KGtleSkgPz8geyBjb2xvcjogdGFiLmdyb3VwQ29sb3IhLCB0YWJzOiBbXSB9O1xuICAgICAgICAgICAgZW50cnkudGFicy5wdXNoKHRhYik7XG4gICAgICAgICAgICBncm91cHMuc2V0KGtleSwgZW50cnkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdW5ncm91cGVkVGFicy5wdXNoKHRhYik7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IGNyZWF0ZVRhYk5vZGUgPSAodGFiOiBUYWJXaXRoR3JvdXApID0+IHtcbiAgICAgICAgY29uc3QgdGFiQ29udGVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIHRhYkNvbnRlbnQuc3R5bGUuZGlzcGxheSA9IFwiZmxleFwiO1xuICAgICAgICB0YWJDb250ZW50LnN0eWxlLmFsaWduSXRlbXMgPSBcImNlbnRlclwiO1xuICAgICAgICB0YWJDb250ZW50LnN0eWxlLmZsZXggPSBcIjFcIjtcbiAgICAgICAgdGFiQ29udGVudC5zdHlsZS5vdmVyZmxvdyA9IFwiaGlkZGVuXCI7XG5cbiAgICAgICAgLy8gVGFiIENoZWNrYm94XG4gICAgICAgIGNvbnN0IHRhYkNoZWNrYm94ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImlucHV0XCIpO1xuICAgICAgICB0YWJDaGVja2JveC50eXBlID0gXCJjaGVja2JveFwiO1xuICAgICAgICB0YWJDaGVja2JveC5jbGFzc05hbWUgPSBcInRyZWUtY2hlY2tib3hcIjtcbiAgICAgICAgdGFiQ2hlY2tib3guY2hlY2tlZCA9IHNlbGVjdGVkVGFicy5oYXModGFiLmlkKTtcbiAgICAgICAgdGFiQ2hlY2tib3gub25jbGljayA9IChlKSA9PiB7XG4gICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgaWYgKHRhYkNoZWNrYm94LmNoZWNrZWQpIHNlbGVjdGVkVGFicy5hZGQodGFiLmlkKTtcbiAgICAgICAgICAgIGVsc2Ugc2VsZWN0ZWRUYWJzLmRlbGV0ZSh0YWIuaWQpO1xuICAgICAgICAgICAgcmVuZGVyVHJlZSgpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IHRhYkljb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICB0YWJJY29uLmNsYXNzTmFtZSA9IFwidHJlZS1pY29uXCI7XG4gICAgICAgIGlmICh0YWIuZmF2SWNvblVybCkge1xuICAgICAgICAgICAgY29uc3QgaW1nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImltZ1wiKTtcbiAgICAgICAgICAgIGltZy5zcmMgPSB0YWIuZmF2SWNvblVybDtcbiAgICAgICAgICAgIGltZy5vbmVycm9yID0gKCkgPT4geyB0YWJJY29uLmlubmVySFRNTCA9IElDT05TLmRlZmF1bHRGaWxlOyB9O1xuICAgICAgICAgICAgdGFiSWNvbi5hcHBlbmRDaGlsZChpbWcpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGFiSWNvbi5pbm5lckhUTUwgPSBJQ09OUy5kZWZhdWx0RmlsZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHRhYlRpdGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgdGFiVGl0bGUuY2xhc3NOYW1lID0gXCJ0cmVlLWxhYmVsXCI7XG4gICAgICAgIHRhYlRpdGxlLnRleHRDb250ZW50ID0gdGFiLnRpdGxlO1xuICAgICAgICB0YWJUaXRsZS50aXRsZSA9IHRhYi50aXRsZTtcblxuICAgICAgICBjb25zdCB0YWJBY3Rpb25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgdGFiQWN0aW9ucy5jbGFzc05hbWUgPSBcInJvdy1hY3Rpb25zXCI7XG4gICAgICAgIGNvbnN0IGNsb3NlQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgICAgICAgY2xvc2VCdG4uY2xhc3NOYW1lID0gXCJhY3Rpb24tYnRuIGRlbGV0ZVwiO1xuICAgICAgICBjbG9zZUJ0bi5pbm5lckhUTUwgPSBJQ09OUy5jbG9zZTtcbiAgICAgICAgY2xvc2VCdG4udGl0bGUgPSBcIkNsb3NlIFRhYlwiO1xuICAgICAgICBjbG9zZUJ0bi5vbmNsaWNrID0gYXN5bmMgKGUpID0+IHtcbiAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICBhd2FpdCBjaHJvbWUudGFicy5yZW1vdmUodGFiLmlkKTtcbiAgICAgICAgICAgIGF3YWl0IGxvYWRTdGF0ZSgpO1xuICAgICAgICB9O1xuICAgICAgICB0YWJBY3Rpb25zLmFwcGVuZENoaWxkKGNsb3NlQnRuKTtcblxuICAgICAgICB0YWJDb250ZW50LmFwcGVuZCh0YWJDaGVja2JveCwgdGFiSWNvbiwgdGFiVGl0bGUsIHRhYkFjdGlvbnMpO1xuXG4gICAgICAgIGNvbnN0IHsgbm9kZTogdGFiTm9kZSB9ID0gY3JlYXRlTm9kZSh0YWJDb250ZW50LCBudWxsLCAndGFiJyk7XG4gICAgICAgIHRhYk5vZGUub25jbGljayA9IGFzeW5jIChlKSA9PiB7XG4gICAgICAgICAgICAvLyBDbGlja2luZyB0YWIgcm93IGFjdGl2YXRlcyB0YWIgKHVubGVzcyBjbGlja2luZyBjaGVja2JveC9hY3Rpb24pXG4gICAgICAgICAgICBpZiAoKGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5jbG9zZXN0KCcudHJlZS1jaGVja2JveCcpKSByZXR1cm47XG4gICAgICAgICAgICBhd2FpdCBjaHJvbWUudGFicy51cGRhdGUodGFiLmlkLCB7IGFjdGl2ZTogdHJ1ZSB9KTtcbiAgICAgICAgICAgIGF3YWl0IGNocm9tZS53aW5kb3dzLnVwZGF0ZSh0YWIud2luZG93SWQsIHsgZm9jdXNlZDogdHJ1ZSB9KTtcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHRhYk5vZGU7XG4gICAgfTtcblxuICAgIEFycmF5LmZyb20oZ3JvdXBzLmVudHJpZXMoKSkuZm9yRWFjaCgoW2dyb3VwTGFiZWwsIGdyb3VwRGF0YV0pID0+IHtcbiAgICAgICAgY29uc3QgZ3JvdXBLZXkgPSBgJHt3aW5kb3dLZXl9LWctJHtncm91cExhYmVsfWA7XG4gICAgICAgIGNvbnN0IGlzR3JvdXBFeHBhbmRlZCA9ICEhcXVlcnkgfHwgZXhwYW5kZWROb2Rlcy5oYXMoZ3JvdXBLZXkpO1xuXG4gICAgICAgIC8vIEdyb3VwIENoZWNrYm94IExvZ2ljXG4gICAgICAgIGNvbnN0IGdyb3VwVGFiSWRzID0gZ3JvdXBEYXRhLnRhYnMubWFwKHQgPT4gdC5pZCk7XG4gICAgICAgIGNvbnN0IGdycFNlbGVjdGVkQ291bnQgPSBncm91cFRhYklkcy5maWx0ZXIoaWQgPT4gc2VsZWN0ZWRUYWJzLmhhcyhpZCkpLmxlbmd0aDtcbiAgICAgICAgY29uc3QgZ3JwSXNBbGwgPSBncnBTZWxlY3RlZENvdW50ID09PSBncm91cFRhYklkcy5sZW5ndGggJiYgZ3JvdXBUYWJJZHMubGVuZ3RoID4gMDtcbiAgICAgICAgY29uc3QgZ3JwSXNTb21lID0gZ3JwU2VsZWN0ZWRDb3VudCA+IDAgJiYgZ3JwU2VsZWN0ZWRDb3VudCA8IGdyb3VwVGFiSWRzLmxlbmd0aDtcblxuICAgICAgICBjb25zdCBncnBDaGVja2JveCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbnB1dFwiKTtcbiAgICAgICAgZ3JwQ2hlY2tib3gudHlwZSA9IFwiY2hlY2tib3hcIjtcbiAgICAgICAgZ3JwQ2hlY2tib3guY2xhc3NOYW1lID0gXCJ0cmVlLWNoZWNrYm94XCI7XG4gICAgICAgIGdycENoZWNrYm94LmNoZWNrZWQgPSBncnBJc0FsbDtcbiAgICAgICAgZ3JwQ2hlY2tib3guaW5kZXRlcm1pbmF0ZSA9IGdycElzU29tZTtcbiAgICAgICAgZ3JwQ2hlY2tib3gub25jbGljayA9IChlKSA9PiB7XG4gICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0U3RhdGUgPSAhZ3JwSXNBbGw7XG4gICAgICAgICAgICBncm91cFRhYklkcy5mb3JFYWNoKGlkID0+IHtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0U3RhdGUpIHNlbGVjdGVkVGFicy5hZGQoaWQpO1xuICAgICAgICAgICAgICAgIGVsc2Ugc2VsZWN0ZWRUYWJzLmRlbGV0ZShpZCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJlbmRlclRyZWUoKTtcbiAgICAgICAgfTtcblxuICAgICAgICAvLyBHcm91cCBDb250ZW50XG4gICAgICAgIGNvbnN0IGdycENvbnRlbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICBncnBDb250ZW50LnN0eWxlLmRpc3BsYXkgPSBcImZsZXhcIjtcbiAgICAgICAgZ3JwQ29udGVudC5zdHlsZS5hbGlnbkl0ZW1zID0gXCJjZW50ZXJcIjtcbiAgICAgICAgZ3JwQ29udGVudC5zdHlsZS5mbGV4ID0gXCIxXCI7XG4gICAgICAgIGdycENvbnRlbnQuc3R5bGUub3ZlcmZsb3cgPSBcImhpZGRlblwiO1xuXG4gICAgICAgIGNvbnN0IGljb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICBpY29uLmNsYXNzTmFtZSA9IFwidHJlZS1pY29uXCI7XG4gICAgICAgIGljb24uaW5uZXJIVE1MID0gVFJFRV9JQ09OUy5mb2xkZXI7XG5cbiAgICAgICAgY29uc3QgZ3JwTGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICBncnBMYWJlbC5jbGFzc05hbWUgPSBcInRyZWUtbGFiZWxcIjtcbiAgICAgICAgZ3JwTGFiZWwudGV4dENvbnRlbnQgPSBncm91cExhYmVsO1xuXG4gICAgICAgIGNvbnN0IGdycENvdW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgZ3JwQ291bnQuY2xhc3NOYW1lID0gXCJ0cmVlLWNvdW50XCI7XG4gICAgICAgIGdycENvdW50LnRleHRDb250ZW50ID0gYCgke2dyb3VwRGF0YS50YWJzLmxlbmd0aH0pYDtcblxuICAgICAgICAvLyBHcm91cCBBY3Rpb25zXG4gICAgICAgIGNvbnN0IGFjdGlvbnMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICBhY3Rpb25zLmNsYXNzTmFtZSA9IFwicm93LWFjdGlvbnNcIjtcbiAgICAgICAgY29uc3QgdW5ncm91cEJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gICAgICAgIHVuZ3JvdXBCdG4uY2xhc3NOYW1lID0gXCJhY3Rpb24tYnRuXCI7XG4gICAgICAgIHVuZ3JvdXBCdG4uaW5uZXJIVE1MID0gSUNPTlMudW5ncm91cDtcbiAgICAgICAgdW5ncm91cEJ0bi50aXRsZSA9IFwiVW5ncm91cFwiO1xuICAgICAgICB1bmdyb3VwQnRuLm9uY2xpY2sgPSBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgIGlmIChjb25maXJtKGBVbmdyb3VwICR7Z3JvdXBEYXRhLnRhYnMubGVuZ3RofSB0YWJzP2ApKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMudW5ncm91cChncm91cERhdGEudGFicy5tYXAodCA9PiB0LmlkKSk7XG4gICAgICAgICAgICAgICAgYXdhaXQgbG9hZFN0YXRlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIGFjdGlvbnMuYXBwZW5kQ2hpbGQodW5ncm91cEJ0bik7XG5cbiAgICAgICAgZ3JwQ29udGVudC5hcHBlbmQoZ3JwQ2hlY2tib3gsIGljb24sIGdycExhYmVsLCBncnBDb3VudCwgYWN0aW9ucyk7XG5cbiAgICAgICAgLy8gVGFic1xuICAgICAgICBjb25zdCB0YWJzQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgZ3JvdXBEYXRhLnRhYnMuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgICAgICAgdGFic0NvbnRhaW5lci5hcHBlbmRDaGlsZChjcmVhdGVUYWJOb2RlKHRhYikpO1xuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCB7IG5vZGU6IGdyb3VwTm9kZSwgdG9nZ2xlOiBncnBUb2dnbGUsIGNoaWxkcmVuQ29udGFpbmVyOiBncnBDaGlsZHJlbiB9ID0gY3JlYXRlTm9kZShcbiAgICAgICAgICAgIGdycENvbnRlbnQsXG4gICAgICAgICAgICB0YWJzQ29udGFpbmVyLFxuICAgICAgICAgICAgJ2dyb3VwJyxcbiAgICAgICAgICAgIGlzR3JvdXBFeHBhbmRlZCxcbiAgICAgICAgICAgICgpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZXhwYW5kZWROb2Rlcy5oYXMoZ3JvdXBLZXkpKSBleHBhbmRlZE5vZGVzLmRlbGV0ZShncm91cEtleSk7XG4gICAgICAgICAgICAgICAgZWxzZSBleHBhbmRlZE5vZGVzLmFkZChncm91cEtleSk7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBleHBhbmRlZCA9IGV4cGFuZGVkTm9kZXMuaGFzKGdyb3VwS2V5KTtcbiAgICAgICAgICAgICAgICBncnBUb2dnbGUuY2xhc3NMaXN0LnRvZ2dsZSgncm90YXRlZCcsIGV4cGFuZGVkKTtcbiAgICAgICAgICAgICAgICBncnBDaGlsZHJlbiEuY2xhc3NMaXN0LnRvZ2dsZSgnZXhwYW5kZWQnLCBleHBhbmRlZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICk7XG5cbiAgICAgICAgLy8gQXBwbHkgYmFja2dyb3VuZCBjb2xvciB0byBncm91cCBub2RlXG4gICAgICAgIGlmIChncm91cERhdGEuY29sb3IpIHtcbiAgICAgICAgICAgIGNvbnN0IGNvbG9yTmFtZSA9IGdyb3VwRGF0YS5jb2xvcjtcbiAgICAgICAgICAgIGNvbnN0IGhleCA9IEdST1VQX0NPTE9SU1tjb2xvck5hbWVdIHx8IGNvbG9yTmFtZTsgLy8gRmFsbGJhY2sgaWYgaXQncyBhbHJlYWR5IGhleFxuICAgICAgICAgICAgaWYgKGhleC5zdGFydHNXaXRoKCcjJykpIHtcbiAgICAgICAgICAgICAgICBncm91cE5vZGUuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gaGV4VG9SZ2JhKGhleCwgMC4xKTtcbiAgICAgICAgICAgICAgICBncm91cE5vZGUuc3R5bGUuYm9yZGVyID0gYDFweCBzb2xpZCAke2hleFRvUmdiYShoZXgsIDAuMil9YDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGNoaWxkcmVuQ29udGFpbmVyLmFwcGVuZENoaWxkKGdyb3VwTm9kZSk7XG4gICAgfSk7XG5cbiAgICB1bmdyb3VwZWRUYWJzLmZvckVhY2godGFiID0+IHtcbiAgICAgICAgY2hpbGRyZW5Db250YWluZXIuYXBwZW5kQ2hpbGQoY3JlYXRlVGFiTm9kZSh0YWIpKTtcbiAgICB9KTtcblxuICAgIGNvbnN0IHsgbm9kZTogd2luTm9kZSwgdG9nZ2xlOiB3aW5Ub2dnbGUsIGNoaWxkcmVuQ29udGFpbmVyOiB3aW5DaGlsZHJlbiB9ID0gY3JlYXRlTm9kZShcbiAgICAgICAgd2luQ29udGVudCxcbiAgICAgICAgY2hpbGRyZW5Db250YWluZXIsXG4gICAgICAgICd3aW5kb3cnLFxuICAgICAgICBpc0V4cGFuZGVkLFxuICAgICAgICAoKSA9PiB7XG4gICAgICAgICAgICAgaWYgKGV4cGFuZGVkTm9kZXMuaGFzKHdpbmRvd0tleSkpIGV4cGFuZGVkTm9kZXMuZGVsZXRlKHdpbmRvd0tleSk7XG4gICAgICAgICAgICAgZWxzZSBleHBhbmRlZE5vZGVzLmFkZCh3aW5kb3dLZXkpO1xuXG4gICAgICAgICAgICAgY29uc3QgZXhwYW5kZWQgPSBleHBhbmRlZE5vZGVzLmhhcyh3aW5kb3dLZXkpO1xuICAgICAgICAgICAgIHdpblRvZ2dsZS5jbGFzc0xpc3QudG9nZ2xlKCdyb3RhdGVkJywgZXhwYW5kZWQpO1xuICAgICAgICAgICAgIHdpbkNoaWxkcmVuIS5jbGFzc0xpc3QudG9nZ2xlKCdleHBhbmRlZCcsIGV4cGFuZGVkKTtcbiAgICAgICAgfVxuICAgICk7XG5cbiAgICB3aW5kb3dzQ29udGFpbmVyLmFwcGVuZENoaWxkKHdpbk5vZGUpO1xuICB9KTtcblxuICB1cGRhdGVTdGF0cygpO1xufTtcblxuLy8gU3RyYXRlZ3kgUmVuZGVyaW5nXG5mdW5jdGlvbiB1cGRhdGVTdHJhdGVneVZpZXdzKHN0cmF0ZWdpZXM6IFN0cmF0ZWd5RGVmaW5pdGlvbltdLCBlbmFibGVkSWRzOiBzdHJpbmdbXSkge1xuICAgIC8vIDEuIFJlbmRlciBBY3RpdmUgU3RyYXRlZ2llc1xuICAgIGFjdGl2ZVN0cmF0ZWdpZXNMaXN0LmlubmVySFRNTCA9ICcnO1xuXG4gICAgLy8gTWFpbnRhaW4gb3JkZXIgZnJvbSBlbmFibGVkSWRzXG4gICAgY29uc3QgZW5hYmxlZFN0cmF0ZWdpZXMgPSBlbmFibGVkSWRzXG4gICAgICAgIC5tYXAoaWQgPT4gc3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gaWQpKVxuICAgICAgICAuZmlsdGVyKChzKTogcyBpcyBTdHJhdGVneURlZmluaXRpb24gPT4gISFzKTtcblxuICAgIGVuYWJsZWRTdHJhdGVnaWVzLmZvckVhY2goc3RyYXRlZ3kgPT4ge1xuICAgICAgICBjb25zdCByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgcm93LmNsYXNzTmFtZSA9ICdzdHJhdGVneS1yb3cnO1xuICAgICAgICByb3cuZGF0YXNldC5pZCA9IHN0cmF0ZWd5LmlkO1xuICAgICAgICByb3cuZHJhZ2dhYmxlID0gdHJ1ZTtcblxuICAgICAgICAvLyBEcmFnIEhhbmRsZVxuICAgICAgICBjb25zdCBoYW5kbGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgaGFuZGxlLmNsYXNzTmFtZSA9ICdzdHJhdGVneS1kcmFnLWhhbmRsZSc7XG4gICAgICAgIGhhbmRsZS5pbm5lckhUTUwgPSAnXHUyMkVFXHUyMkVFJztcblxuICAgICAgICAvLyBMYWJlbFxuICAgICAgICBjb25zdCBsYWJlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcbiAgICAgICAgbGFiZWwuY2xhc3NOYW1lID0gJ3N0cmF0ZWd5LWxhYmVsJztcbiAgICAgICAgbGFiZWwudGV4dENvbnRlbnQgPSBzdHJhdGVneS5sYWJlbDtcblxuICAgICAgICAvLyBUYWdzXG4gICAgICAgIGxldCB0YWdzSHRtbCA9ICcnO1xuICAgICAgICBpZiAoc3RyYXRlZ3kudGFncykge1xuICAgICAgICAgICAgIHN0cmF0ZWd5LnRhZ3MuZm9yRWFjaCh0YWcgPT4ge1xuICAgICAgICAgICAgICAgIHRhZ3NIdG1sICs9IGA8c3BhbiBjbGFzcz1cInRhZyB0YWctJHt0YWd9XCI+JHt0YWd9PC9zcGFuPmA7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNvbnRlbnRXcmFwcGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIGNvbnRlbnRXcmFwcGVyLnN0eWxlLmZsZXggPSBcIjFcIjtcbiAgICAgICAgY29udGVudFdyYXBwZXIuc3R5bGUuZGlzcGxheSA9IFwiZmxleFwiO1xuICAgICAgICBjb250ZW50V3JhcHBlci5zdHlsZS5hbGlnbkl0ZW1zID0gXCJjZW50ZXJcIjtcbiAgICAgICAgY29udGVudFdyYXBwZXIuYXBwZW5kQ2hpbGQobGFiZWwpO1xuICAgICAgICBpZiAodGFnc0h0bWwpIHtcbiAgICAgICAgICAgICBjb25zdCB0YWdzQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuICAgICAgICAgICAgIHRhZ3NDb250YWluZXIuaW5uZXJIVE1MID0gdGFnc0h0bWw7XG4gICAgICAgICAgICAgY29udGVudFdyYXBwZXIuYXBwZW5kQ2hpbGQodGFnc0NvbnRhaW5lcik7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBSZW1vdmUgQnV0dG9uXG4gICAgICAgIGNvbnN0IHJlbW92ZUJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuICAgICAgICByZW1vdmVCdG4uY2xhc3NOYW1lID0gJ3N0cmF0ZWd5LXJlbW92ZS1idG4nO1xuICAgICAgICByZW1vdmVCdG4uaW5uZXJIVE1MID0gSUNPTlMuY2xvc2U7IC8vIFVzZSBJY29uIGZvciBjb25zaXN0ZW5jeVxuICAgICAgICByZW1vdmVCdG4udGl0bGUgPSBcIlJlbW92ZSBzdHJhdGVneVwiO1xuICAgICAgICByZW1vdmVCdG4ub25jbGljayA9IGFzeW5jIChlKSA9PiB7XG4gICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICBhd2FpdCB0b2dnbGVTdHJhdGVneShzdHJhdGVneS5pZCwgZmFsc2UpO1xuICAgICAgICB9O1xuXG4gICAgICAgIHJvdy5hcHBlbmRDaGlsZChoYW5kbGUpO1xuICAgICAgICByb3cuYXBwZW5kQ2hpbGQoY29udGVudFdyYXBwZXIpO1xuXG4gICAgICAgIGlmIChzdHJhdGVneS5pc0N1c3RvbSkge1xuICAgICAgICAgICAgIGNvbnN0IGF1dG9SdW5CdG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICAgICAgICAgICAgIGF1dG9SdW5CdG4uY2xhc3NOYW1lID0gYGFjdGlvbi1idG4gYXV0by1ydW4gJHtzdHJhdGVneS5hdXRvUnVuID8gJ2FjdGl2ZScgOiAnJ31gO1xuICAgICAgICAgICAgIGF1dG9SdW5CdG4uaW5uZXJIVE1MID0gSUNPTlMuYXV0b1J1bjtcbiAgICAgICAgICAgICBhdXRvUnVuQnRuLnRpdGxlID0gYEF1dG8gUnVuOiAke3N0cmF0ZWd5LmF1dG9SdW4gPyAnT04nIDogJ09GRid9YDtcbiAgICAgICAgICAgICBhdXRvUnVuQnRuLnN0eWxlLm9wYWNpdHkgPSBzdHJhdGVneS5hdXRvUnVuID8gXCIxXCIgOiBcIjAuM1wiO1xuICAgICAgICAgICAgIGF1dG9SdW5CdG4ub25jbGljayA9IGFzeW5jIChlKSA9PiB7XG4gICAgICAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICAgICAgIGlmICghcHJlZmVyZW5jZXM/LmN1c3RvbVN0cmF0ZWdpZXMpIHJldHVybjtcbiAgICAgICAgICAgICAgICAgY29uc3QgY3VzdG9tU3RyYXRJbmRleCA9IHByZWZlcmVuY2VzLmN1c3RvbVN0cmF0ZWdpZXMuZmluZEluZGV4KHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3kuaWQpO1xuICAgICAgICAgICAgICAgICBpZiAoY3VzdG9tU3RyYXRJbmRleCAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3RyYXQgPSBwcmVmZXJlbmNlcy5jdXN0b21TdHJhdGVnaWVzW2N1c3RvbVN0cmF0SW5kZXhdO1xuICAgICAgICAgICAgICAgICAgICBzdHJhdC5hdXRvUnVuID0gIXN0cmF0LmF1dG9SdW47XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzQWN0aXZlID0gISFzdHJhdC5hdXRvUnVuO1xuICAgICAgICAgICAgICAgICAgICBhdXRvUnVuQnRuLmNsYXNzTGlzdC50b2dnbGUoJ2FjdGl2ZScsIGlzQWN0aXZlKTtcbiAgICAgICAgICAgICAgICAgICAgYXV0b1J1bkJ0bi5zdHlsZS5vcGFjaXR5ID0gaXNBY3RpdmUgPyBcIjFcIiA6IFwiMC4zXCI7XG4gICAgICAgICAgICAgICAgICAgIGF1dG9SdW5CdG4udGl0bGUgPSBgQXV0byBSdW46ICR7aXNBY3RpdmUgPyAnT04nIDogJ09GRid9YDtcbiAgICAgICAgICAgICAgICAgICAgbG9jYWxQcmVmZXJlbmNlc01vZGlmaWVkVGltZSA9IERhdGUubm93KCk7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHNlbmRNZXNzYWdlKFwic2F2ZVByZWZlcmVuY2VzXCIsIHsgY3VzdG9tU3RyYXRlZ2llczogcHJlZmVyZW5jZXMuY3VzdG9tU3RyYXRlZ2llcyB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICByb3cuYXBwZW5kQ2hpbGQoYXV0b1J1bkJ0bik7XG4gICAgICAgIH1cblxuICAgICAgICByb3cuYXBwZW5kQ2hpbGQocmVtb3ZlQnRuKTtcblxuICAgICAgICBhZGREbkRMaXN0ZW5lcnMocm93KTtcbiAgICAgICAgYWN0aXZlU3RyYXRlZ2llc0xpc3QuYXBwZW5kQ2hpbGQocm93KTtcbiAgICB9KTtcblxuICAgIC8vIDIuIFJlbmRlciBBZGQgU3RyYXRlZ3kgT3B0aW9uc1xuICAgIGFkZFN0cmF0ZWd5U2VsZWN0LmlubmVySFRNTCA9ICc8b3B0aW9uIHZhbHVlPVwiXCIgZGlzYWJsZWQgc2VsZWN0ZWQ+U2VsZWN0IFN0cmF0ZWd5Li4uPC9vcHRpb24+JztcblxuICAgIGNvbnN0IGRpc2FibGVkU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gIWVuYWJsZWRJZHMuaW5jbHVkZXMocy5pZCkpO1xuICAgIGRpc2FibGVkU3RyYXRlZ2llcy5zb3J0KChhLCBiKSA9PiBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCkpO1xuXG4gICAgLy8gU2VwYXJhdGUgc3RyYXRlZ2llcyB3aXRoIEF1dG8tUnVuIGFjdGl2ZSBidXQgbm90IGluIHNvcnRpbmcgbGlzdFxuICAgIGNvbnN0IGJhY2tncm91bmRTdHJhdGVnaWVzOiBTdHJhdGVneURlZmluaXRpb25bXSA9IFtdO1xuICAgIGNvbnN0IGF2YWlsYWJsZVN0cmF0ZWdpZXM6IFN0cmF0ZWd5RGVmaW5pdGlvbltdID0gW107XG5cbiAgICBkaXNhYmxlZFN0cmF0ZWdpZXMuZm9yRWFjaChzID0+IHtcbiAgICAgICAgaWYgKHMuaXNDdXN0b20gJiYgcy5hdXRvUnVuKSB7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kU3RyYXRlZ2llcy5wdXNoKHMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYXZhaWxhYmxlU3RyYXRlZ2llcy5wdXNoKHMpO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBQb3B1bGF0ZSBTZWxlY3RcbiAgICAvLyBXZSBpbmNsdWRlIGJhY2tncm91bmQgc3RyYXRlZ2llcyBpbiB0aGUgZHJvcGRvd24gdG9vIHNvIHRoZXkgY2FuIGJlIG1vdmVkIHRvIFwiQWN0aXZlXCIgc29ydGluZyBlYXNpbHlcbiAgICAvLyBidXQgd2UgbWlnaHQgbWFyayB0aGVtXG4gICAgWy4uLmJhY2tncm91bmRTdHJhdGVnaWVzLCAuLi5hdmFpbGFibGVTdHJhdGVnaWVzXS5zb3J0KChhLCBiKSA9PiBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCkpLmZvckVhY2goc3RyYXRlZ3kgPT4ge1xuICAgICAgICBjb25zdCBvcHRpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdvcHRpb24nKTtcbiAgICAgICAgb3B0aW9uLnZhbHVlID0gc3RyYXRlZ3kuaWQ7XG4gICAgICAgIG9wdGlvbi50ZXh0Q29udGVudCA9IHN0cmF0ZWd5LmxhYmVsO1xuICAgICAgICBhZGRTdHJhdGVneVNlbGVjdC5hcHBlbmRDaGlsZChvcHRpb24pO1xuICAgIH0pO1xuXG4gICAgLy8gRm9yY2Ugc2VsZWN0aW9uIG9mIHBsYWNlaG9sZGVyXG4gICAgYWRkU3RyYXRlZ3lTZWxlY3QudmFsdWUgPSBcIlwiO1xuXG4gICAgLy8gMy4gUmVuZGVyIEJhY2tncm91bmQgU3RyYXRlZ2llcyBTZWN0aW9uIChpZiBhbnkpXG4gICAgbGV0IGJnU2VjdGlvbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYmFja2dyb3VuZFN0cmF0ZWdpZXNTZWN0aW9uXCIpO1xuICAgIGlmIChiYWNrZ3JvdW5kU3RyYXRlZ2llcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGlmICghYmdTZWN0aW9uKSB7XG4gICAgICAgICAgICBiZ1NlY3Rpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgYmdTZWN0aW9uLmlkID0gXCJiYWNrZ3JvdW5kU3RyYXRlZ2llc1NlY3Rpb25cIjtcbiAgICAgICAgICAgIGJnU2VjdGlvbi5jbGFzc05hbWUgPSBcImFjdGl2ZS1zdHJhdGVnaWVzLXNlY3Rpb25cIjtcbiAgICAgICAgICAgIC8vIFN0eWxlIGl0IHRvIGxvb2sgbGlrZSBhY3RpdmUgc2VjdGlvbiBidXQgZGlzdGluY3RcbiAgICAgICAgICAgIGJnU2VjdGlvbi5zdHlsZS5tYXJnaW5Ub3AgPSBcIjhweFwiO1xuICAgICAgICAgICAgYmdTZWN0aW9uLnN0eWxlLmJvcmRlclRvcCA9IFwiMXB4IGRhc2hlZCB2YXIoLS1ib3JkZXItY29sb3IpXCI7XG4gICAgICAgICAgICBiZ1NlY3Rpb24uc3R5bGUucGFkZGluZ1RvcCA9IFwiOHB4XCI7XG5cbiAgICAgICAgICAgIGNvbnN0IGhlYWRlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgICAgICBoZWFkZXIuY2xhc3NOYW1lID0gXCJzZWN0aW9uLWhlYWRlclwiO1xuICAgICAgICAgICAgaGVhZGVyLnRleHRDb250ZW50ID0gXCJCYWNrZ3JvdW5kIEF1dG8tUnVuXCI7XG4gICAgICAgICAgICBoZWFkZXIudGl0bGUgPSBcIlRoZXNlIHN0cmF0ZWdpZXMgcnVuIGF1dG9tYXRpY2FsbHkgYnV0IGFyZSBub3QgdXNlZCBmb3Igc29ydGluZy9ncm91cGluZyBvcmRlci5cIjtcbiAgICAgICAgICAgIGJnU2VjdGlvbi5hcHBlbmRDaGlsZChoZWFkZXIpO1xuXG4gICAgICAgICAgICBjb25zdCBsaXN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgICAgIGxpc3QuY2xhc3NOYW1lID0gXCJzdHJhdGVneS1saXN0XCI7XG4gICAgICAgICAgICBiZ1NlY3Rpb24uYXBwZW5kQ2hpbGQobGlzdCk7XG5cbiAgICAgICAgICAgIC8vIEluc2VydCBhZnRlciBhY3RpdmUgbGlzdFxuICAgICAgICAgICAgYWN0aXZlU3RyYXRlZ2llc0xpc3QucGFyZW50RWxlbWVudD8uYWZ0ZXIoYmdTZWN0aW9uKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGxpc3QgPSBiZ1NlY3Rpb24ucXVlcnlTZWxlY3RvcihcIi5zdHJhdGVneS1saXN0XCIpIGFzIEhUTUxFbGVtZW50O1xuICAgICAgICBsaXN0LmlubmVySFRNTCA9IFwiXCI7XG5cbiAgICAgICAgYmFja2dyb3VuZFN0cmF0ZWdpZXMuZm9yRWFjaChzdHJhdGVneSA9PiB7XG4gICAgICAgICAgICBjb25zdCByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgIHJvdy5jbGFzc05hbWUgPSAnc3RyYXRlZ3ktcm93JztcbiAgICAgICAgICAgIHJvdy5kYXRhc2V0LmlkID0gc3RyYXRlZ3kuaWQ7XG5cbiAgICAgICAgICAgIGNvbnN0IGxhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuICAgICAgICAgICAgbGFiZWwuY2xhc3NOYW1lID0gJ3N0cmF0ZWd5LWxhYmVsJztcbiAgICAgICAgICAgIGxhYmVsLnRleHRDb250ZW50ID0gc3RyYXRlZ3kubGFiZWw7XG4gICAgICAgICAgICBsYWJlbC5zdHlsZS5vcGFjaXR5ID0gXCIwLjdcIjtcblxuICAgICAgICAgICAgY29uc3QgYXV0b1J1bkJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gICAgICAgICAgICBhdXRvUnVuQnRuLmNsYXNzTmFtZSA9IGBhY3Rpb24tYnRuIGF1dG8tcnVuIGFjdGl2ZWA7XG4gICAgICAgICAgICBhdXRvUnVuQnRuLmlubmVySFRNTCA9IElDT05TLmF1dG9SdW47XG4gICAgICAgICAgICBhdXRvUnVuQnRuLnRpdGxlID0gYEF1dG8gUnVuOiBPTiAoQ2xpY2sgdG8gZGlzYWJsZSlgO1xuICAgICAgICAgICAgYXV0b1J1bkJ0bi5zdHlsZS5tYXJnaW5MZWZ0ID0gXCJhdXRvXCI7XG4gICAgICAgICAgICBhdXRvUnVuQnRuLm9uY2xpY2sgPSBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgICBpZiAoIXByZWZlcmVuY2VzPy5jdXN0b21TdHJhdGVnaWVzKSByZXR1cm47XG4gICAgICAgICAgICAgICAgIGNvbnN0IGN1c3RvbVN0cmF0SW5kZXggPSBwcmVmZXJlbmNlcy5jdXN0b21TdHJhdGVnaWVzLmZpbmRJbmRleChzID0+IHMuaWQgPT09IHN0cmF0ZWd5LmlkKTtcbiAgICAgICAgICAgICAgICAgaWYgKGN1c3RvbVN0cmF0SW5kZXggIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN0cmF0ID0gcHJlZmVyZW5jZXMuY3VzdG9tU3RyYXRlZ2llc1tjdXN0b21TdHJhdEluZGV4XTtcbiAgICAgICAgICAgICAgICAgICAgc3RyYXQuYXV0b1J1biA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBsb2NhbFByZWZlcmVuY2VzTW9kaWZpZWRUaW1lID0gRGF0ZS5ub3coKTtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgc2VuZE1lc3NhZ2UoXCJzYXZlUHJlZmVyZW5jZXNcIiwgeyBjdXN0b21TdHJhdGVnaWVzOiBwcmVmZXJlbmNlcy5jdXN0b21TdHJhdGVnaWVzIH0pO1xuICAgICAgICAgICAgICAgICAgICAvLyBVSSB1cGRhdGUgdHJpZ2dlcnMgdmlhIHNlbmRNZXNzYWdlIHJlc3BvbnNlIG9yIHJlLXJlbmRlclxuICAgICAgICAgICAgICAgICAgICAvLyBCdXQgd2Ugc2hvdWxkIHJlLXJlbmRlciBpbW1lZGlhdGVseSBmb3IgcmVzcG9uc2l2ZW5lc3NcbiAgICAgICAgICAgICAgICAgICAgdXBkYXRlU3RyYXRlZ3lWaWV3cyhzdHJhdGVnaWVzLCBlbmFibGVkSWRzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICByb3cuYXBwZW5kQ2hpbGQobGFiZWwpO1xuICAgICAgICAgICAgcm93LmFwcGVuZENoaWxkKGF1dG9SdW5CdG4pO1xuICAgICAgICAgICAgbGlzdC5hcHBlbmRDaGlsZChyb3cpO1xuICAgICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoYmdTZWN0aW9uKSBiZ1NlY3Rpb24ucmVtb3ZlKCk7XG4gICAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiB0b2dnbGVTdHJhdGVneShpZDogc3RyaW5nLCBlbmFibGU6IGJvb2xlYW4pIHtcbiAgICBpZiAoIXByZWZlcmVuY2VzKSByZXR1cm47XG5cbiAgICBjb25zdCBhbGxTdHJhdGVnaWVzID0gZ2V0U3RyYXRlZ2llcyhwcmVmZXJlbmNlcy5jdXN0b21TdHJhdGVnaWVzKTtcbiAgICBjb25zdCB2YWxpZElkcyA9IG5ldyBTZXQoYWxsU3RyYXRlZ2llcy5tYXAocyA9PiBzLmlkKSk7XG5cbiAgICAvLyBDbGVhbiBjdXJyZW50IGxpc3QgYnkgcmVtb3Zpbmcgc3RhbGUgSURzXG4gICAgbGV0IGN1cnJlbnQgPSAocHJlZmVyZW5jZXMuc29ydGluZyB8fCBbXSkuZmlsdGVyKHNJZCA9PiB2YWxpZElkcy5oYXMoc0lkKSk7XG5cbiAgICBpZiAoZW5hYmxlKSB7XG4gICAgICAgIGlmICghY3VycmVudC5pbmNsdWRlcyhpZCkpIHtcbiAgICAgICAgICAgIGN1cnJlbnQucHVzaChpZCk7XG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICBjdXJyZW50ID0gY3VycmVudC5maWx0ZXIoc0lkID0+IHNJZCAhPT0gaWQpO1xuICAgIH1cblxuICAgIHByZWZlcmVuY2VzLnNvcnRpbmcgPSBjdXJyZW50O1xuICAgIGxvY2FsUHJlZmVyZW5jZXNNb2RpZmllZFRpbWUgPSBEYXRlLm5vdygpO1xuICAgIGF3YWl0IHNlbmRNZXNzYWdlKFwic2F2ZVByZWZlcmVuY2VzXCIsIHsgc29ydGluZzogY3VycmVudCB9KTtcblxuICAgIC8vIFJlLXJlbmRlclxuICAgIHVwZGF0ZVN0cmF0ZWd5Vmlld3MoYWxsU3RyYXRlZ2llcywgY3VycmVudCk7XG59XG5cbmZ1bmN0aW9uIGFkZERuRExpc3RlbmVycyhyb3c6IEhUTUxFbGVtZW50KSB7XG4gIHJvdy5hZGRFdmVudExpc3RlbmVyKCdkcmFnc3RhcnQnLCAoZSkgPT4ge1xuICAgIHJvdy5jbGFzc0xpc3QuYWRkKCdkcmFnZ2luZycpO1xuICAgIGlmIChlLmRhdGFUcmFuc2Zlcikge1xuICAgICAgICBlLmRhdGFUcmFuc2Zlci5lZmZlY3RBbGxvd2VkID0gJ21vdmUnO1xuICAgIH1cbiAgfSk7XG5cbiAgcm93LmFkZEV2ZW50TGlzdGVuZXIoJ2RyYWdlbmQnLCBhc3luYyAoKSA9PiB7XG4gICAgcm93LmNsYXNzTGlzdC5yZW1vdmUoJ2RyYWdnaW5nJyk7XG4gICAgLy8gU2F2ZSBvcmRlclxuICAgIGlmIChwcmVmZXJlbmNlcykge1xuICAgICAgICBjb25zdCBjdXJyZW50U29ydGluZyA9IGdldFNlbGVjdGVkU29ydGluZygpO1xuICAgICAgICAvLyBDaGVjayBpZiBvcmRlciBjaGFuZ2VkXG4gICAgICAgIGNvbnN0IG9sZFNvcnRpbmcgPSBwcmVmZXJlbmNlcy5zb3J0aW5nIHx8IFtdO1xuICAgICAgICBpZiAoSlNPTi5zdHJpbmdpZnkoY3VycmVudFNvcnRpbmcpICE9PSBKU09OLnN0cmluZ2lmeShvbGRTb3J0aW5nKSkge1xuICAgICAgICAgICAgcHJlZmVyZW5jZXMuc29ydGluZyA9IGN1cnJlbnRTb3J0aW5nO1xuICAgICAgICAgICAgbG9jYWxQcmVmZXJlbmNlc01vZGlmaWVkVGltZSA9IERhdGUubm93KCk7XG4gICAgICAgICAgICBhd2FpdCBzZW5kTWVzc2FnZShcInNhdmVQcmVmZXJlbmNlc1wiLCB7IHNvcnRpbmc6IGN1cnJlbnRTb3J0aW5nIH0pO1xuICAgICAgICB9XG4gICAgfVxuICB9KTtcbn1cblxuZnVuY3Rpb24gc2V0dXBDb250YWluZXJEbkQoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnRhaW5lci5hZGRFdmVudExpc3RlbmVyKCdkcmFnb3ZlcicsIChlKSA9PiB7XG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgY29uc3QgYWZ0ZXJFbGVtZW50ID0gZ2V0RHJhZ0FmdGVyRWxlbWVudChjb250YWluZXIsIGUuY2xpZW50WSwgJy5zdHJhdGVneS1yb3c6bm90KC5kcmFnZ2luZyknKTtcbiAgICAgICAgY29uc3QgZHJhZ2dhYmxlUm93ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnN0cmF0ZWd5LXJvdy5kcmFnZ2luZycpO1xuICAgICAgICBpZiAoZHJhZ2dhYmxlUm93ICYmIGRyYWdnYWJsZVJvdy5wYXJlbnRFbGVtZW50ID09PSBjb250YWluZXIpIHtcbiAgICAgICAgICAgICBpZiAoYWZ0ZXJFbGVtZW50ID09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoZHJhZ2dhYmxlUm93KTtcbiAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnRhaW5lci5pbnNlcnRCZWZvcmUoZHJhZ2dhYmxlUm93LCBhZnRlckVsZW1lbnQpO1xuICAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xufVxuXG5zZXR1cENvbnRhaW5lckRuRChhY3RpdmVTdHJhdGVnaWVzTGlzdCk7XG5cbmNvbnN0IHVwZGF0ZVVJID0gKFxuICBzdGF0ZURhdGE6IHsgZ3JvdXBzOiBUYWJHcm91cFtdOyBwcmVmZXJlbmNlczogUHJlZmVyZW5jZXMgfSxcbiAgY3VycmVudFdpbmRvdzogY2hyb21lLndpbmRvd3MuV2luZG93IHwgdW5kZWZpbmVkLFxuICBjaHJvbWVXaW5kb3dzOiBjaHJvbWUud2luZG93cy5XaW5kb3dbXSxcbiAgaXNQcmVsaW1pbmFyeSA9IGZhbHNlXG4pID0+IHtcbiAgICAvLyBJZiB3ZSBtb2RpZmllZCBwcmVmZXJlbmNlcyBsb2NhbGx5IHdpdGhpbiB0aGUgbGFzdCAyIHNlY29uZHMsIGlnbm9yZSB0aGUgaW5jb21pbmcgcHJlZmVyZW5jZXMgZm9yIHNvcnRpbmdcbiAgICBjb25zdCB0aW1lU2luY2VMb2NhbFVwZGF0ZSA9IERhdGUubm93KCkgLSBsb2NhbFByZWZlcmVuY2VzTW9kaWZpZWRUaW1lO1xuICAgIGNvbnN0IHNob3VsZFVwZGF0ZVByZWZlcmVuY2VzID0gdGltZVNpbmNlTG9jYWxVcGRhdGUgPiAyMDAwO1xuXG4gICAgaWYgKHNob3VsZFVwZGF0ZVByZWZlcmVuY2VzKSB7XG4gICAgICAgIHByZWZlcmVuY2VzID0gc3RhdGVEYXRhLnByZWZlcmVuY2VzO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIEtlZXAgbG9jYWwgc29ydGluZy9zdHJhdGVnaWVzLCB1cGRhdGUgb3RoZXJzXG4gICAgICAgIGlmIChwcmVmZXJlbmNlcyAmJiBzdGF0ZURhdGEucHJlZmVyZW5jZXMpIHtcbiAgICAgICAgICAgICBwcmVmZXJlbmNlcyA9IHtcbiAgICAgICAgICAgICAgICAgLi4uc3RhdGVEYXRhLnByZWZlcmVuY2VzLFxuICAgICAgICAgICAgICAgICBzb3J0aW5nOiBwcmVmZXJlbmNlcy5zb3J0aW5nLFxuICAgICAgICAgICAgICAgICBjdXN0b21TdHJhdGVnaWVzOiBwcmVmZXJlbmNlcy5jdXN0b21TdHJhdGVnaWVzXG4gICAgICAgICAgICAgfTtcbiAgICAgICAgfSBlbHNlIGlmICghcHJlZmVyZW5jZXMpIHtcbiAgICAgICAgICAgIHByZWZlcmVuY2VzID0gc3RhdGVEYXRhLnByZWZlcmVuY2VzO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHByZWZlcmVuY2VzKSB7XG4gICAgICBjb25zdCBzID0gcHJlZmVyZW5jZXMuc29ydGluZyB8fCBbXTtcblxuICAgICAgLy8gSW5pdGlhbGl6ZSBMb2dnZXJcbiAgICAgIHNldExvZ2dlclByZWZlcmVuY2VzKHByZWZlcmVuY2VzKTtcblxuICAgICAgY29uc3QgYWxsU3RyYXRlZ2llcyA9IGdldFN0cmF0ZWdpZXMocHJlZmVyZW5jZXMuY3VzdG9tU3RyYXRlZ2llcyk7XG5cbiAgICAgIC8vIFJlbmRlciB1bmlmaWVkIHN0cmF0ZWd5IGxpc3RcbiAgICAgIHVwZGF0ZVN0cmF0ZWd5Vmlld3MoYWxsU3RyYXRlZ2llcywgcyk7XG5cbiAgICAgIC8vIEluaXRpYWwgdGhlbWUgbG9hZFxuICAgICAgaWYgKHByZWZlcmVuY2VzLnRoZW1lKSB7XG4gICAgICAgIGFwcGx5VGhlbWUocHJlZmVyZW5jZXMudGhlbWUsIGZhbHNlKTtcbiAgICAgIH1cblxuICAgICAgLy8gSW5pdCBzZXR0aW5ncyBVSVxuICAgICAgaWYgKHByZWZlcmVuY2VzLmxvZ0xldmVsKSB7XG4gICAgICAgICAgY29uc3Qgc2VsZWN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvZ0xldmVsU2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgICAgaWYgKHNlbGVjdCkgc2VsZWN0LnZhbHVlID0gcHJlZmVyZW5jZXMubG9nTGV2ZWw7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGN1cnJlbnRXaW5kb3cpIHtcbiAgICAgIGZvY3VzZWRXaW5kb3dJZCA9IGN1cnJlbnRXaW5kb3cuaWQgPz8gbnVsbDtcbiAgICB9IGVsc2Uge1xuICAgICAgZm9jdXNlZFdpbmRvd0lkID0gbnVsbDtcbiAgICAgIGNvbnNvbGUud2FybihcIkZhaWxlZCB0byBnZXQgY3VycmVudCB3aW5kb3dcIik7XG4gICAgfVxuXG4gICAgY29uc3Qgd2luZG93VGl0bGVzID0gbmV3IE1hcDxudW1iZXIsIHN0cmluZz4oKTtcblxuICAgIGNocm9tZVdpbmRvd3MuZm9yRWFjaCgod2luKSA9PiB7XG4gICAgICBpZiAoIXdpbi5pZCkgcmV0dXJuO1xuICAgICAgY29uc3QgYWN0aXZlVGFiVGl0bGUgPSB3aW4udGFicz8uZmluZCgodGFiKSA9PiB0YWIuYWN0aXZlKT8udGl0bGU7XG4gICAgICBjb25zdCB0aXRsZSA9IGFjdGl2ZVRhYlRpdGxlID8/IGBXaW5kb3cgJHt3aW4uaWR9YDtcbiAgICAgIHdpbmRvd1RpdGxlcy5zZXQod2luLmlkLCB0aXRsZSk7XG4gICAgfSk7XG5cbiAgICB3aW5kb3dTdGF0ZSA9IG1hcFdpbmRvd3Moc3RhdGVEYXRhLmdyb3Vwcywgd2luZG93VGl0bGVzKTtcblxuICAgIGlmIChmb2N1c2VkV2luZG93SWQgIT09IG51bGwpIHtcbiAgICAgICAgd2luZG93U3RhdGUuc29ydCgoYSwgYikgPT4ge1xuICAgICAgICAgICAgaWYgKGEuaWQgPT09IGZvY3VzZWRXaW5kb3dJZCkgcmV0dXJuIC0xO1xuICAgICAgICAgICAgaWYgKGIuaWQgPT09IGZvY3VzZWRXaW5kb3dJZCkgcmV0dXJuIDE7XG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKCFpbml0aWFsU2VsZWN0aW9uRG9uZSAmJiBmb2N1c2VkV2luZG93SWQgIT09IG51bGwpIHtcbiAgICAgICAgY29uc3QgYWN0aXZlV2luZG93ID0gd2luZG93U3RhdGUuZmluZCh3ID0+IHcuaWQgPT09IGZvY3VzZWRXaW5kb3dJZCk7XG4gICAgICAgIGlmIChhY3RpdmVXaW5kb3cpIHtcbiAgICAgICAgICAgICBleHBhbmRlZE5vZGVzLmFkZChgdy0ke2FjdGl2ZVdpbmRvdy5pZH1gKTtcbiAgICAgICAgICAgICBhY3RpdmVXaW5kb3cudGFicy5mb3JFYWNoKHQgPT4gc2VsZWN0ZWRUYWJzLmFkZCh0LmlkKSk7XG5cbiAgICAgICAgICAgICAvLyBJZiB3ZSBzdWNjZXNzZnVsbHkgZm91bmQgYW5kIHNlbGVjdGVkIHRoZSB3aW5kb3csIG1hcmsgYXMgZG9uZVxuICAgICAgICAgICAgIGluaXRpYWxTZWxlY3Rpb25Eb25lID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmICghaXNQcmVsaW1pbmFyeSkge1xuICAgICAgICBpbml0aWFsU2VsZWN0aW9uRG9uZSA9IHRydWU7XG4gICAgfVxuXG4gICAgcmVuZGVyVHJlZSgpO1xufTtcblxuY29uc3QgbG9hZFN0YXRlID0gYXN5bmMgKCkgPT4ge1xuICBsb2dJbmZvKFwiTG9hZGluZyBwb3B1cCBzdGF0ZVwiKTtcblxuICBsZXQgYmdGaW5pc2hlZCA9IGZhbHNlO1xuXG4gIGNvbnN0IGZhc3RMb2FkID0gYXN5bmMgKCkgPT4ge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IFtsb2NhbFJlcywgY3csIGF3XSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgICAgICAgIGZldGNoTG9jYWxTdGF0ZSgpLFxuICAgICAgICAgICAgY2hyb21lLndpbmRvd3MuZ2V0Q3VycmVudCgpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCksXG4gICAgICAgICAgICBjaHJvbWUud2luZG93cy5nZXRBbGwoeyB3aW5kb3dUeXBlczogW1wibm9ybWFsXCJdLCBwb3B1bGF0ZTogdHJ1ZSB9KS5jYXRjaCgoKSA9PiBbXSlcbiAgICAgICAgXSk7XG5cbiAgICAgICAgLy8gT25seSB1cGRhdGUgaWYgYmFja2dyb3VuZCBoYXNuJ3QgZmluaXNoZWQgeWV0XG4gICAgICAgIGlmICghYmdGaW5pc2hlZCAmJiBsb2NhbFJlcy5vayAmJiBsb2NhbFJlcy5kYXRhKSB7XG4gICAgICAgICAgICAgdXBkYXRlVUkobG9jYWxSZXMuZGF0YSwgY3csIGF3IGFzIGNocm9tZS53aW5kb3dzLldpbmRvd1tdLCB0cnVlKTtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS53YXJuKFwiRmFzdCBsb2FkIGZhaWxlZFwiLCBlKTtcbiAgICB9XG4gIH07XG5cbiAgY29uc3QgYmdMb2FkID0gYXN5bmMgKCkgPT4ge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IFtiZ1JlcywgY3csIGF3XSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgICAgICAgIGZldGNoU3RhdGUoKSxcbiAgICAgICAgICAgIGNocm9tZS53aW5kb3dzLmdldEN1cnJlbnQoKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpLFxuICAgICAgICAgICAgY2hyb21lLndpbmRvd3MuZ2V0QWxsKHsgd2luZG93VHlwZXM6IFtcIm5vcm1hbFwiXSwgcG9wdWxhdGU6IHRydWUgfSkuY2F0Y2goKCkgPT4gW10pXG4gICAgICAgIF0pO1xuXG4gICAgICAgIGJnRmluaXNoZWQgPSB0cnVlOyAvLyBNYXJrIGFzIGZpbmlzaGVkIHNvIGZhc3QgbG9hZCBkb2Vzbid0IG92ZXJ3cml0ZSBpZiBpdCdzIHNvbWVob3cgc2xvd1xuXG4gICAgICAgIGlmIChiZ1Jlcy5vayAmJiBiZ1Jlcy5kYXRhKSB7XG4gICAgICAgICAgICAgdXBkYXRlVUkoYmdSZXMuZGF0YSwgY3csIGF3IGFzIGNocm9tZS53aW5kb3dzLldpbmRvd1tdKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gbG9hZCBzdGF0ZTpcIiwgYmdSZXMuZXJyb3IgPz8gXCJVbmtub3duIGVycm9yXCIpO1xuICAgICAgICAgICAgaWYgKHdpbmRvd1N0YXRlLmxlbmd0aCA9PT0gMCkgeyAvLyBPbmx5IHNob3cgZXJyb3IgaWYgd2UgaGF2ZSBOT1RISU5HIHNob3duXG4gICAgICAgICAgICAgICAgd2luZG93c0NvbnRhaW5lci5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz1cImVycm9yLXN0YXRlXCIgc3R5bGU9XCJwYWRkaW5nOiAyMHB4OyBjb2xvcjogdmFyKC0tZXJyb3ItY29sb3IsIHJlZCk7IHRleHQtYWxpZ246IGNlbnRlcjtcIj5cbiAgICAgICAgICAgICAgICAgICAgRmFpbGVkIHRvIGxvYWQgdGFiczogJHtiZ1Jlcy5lcnJvciA/PyBcIlVua25vd24gZXJyb3JcIn0uPGJyPlxuICAgICAgICAgICAgICAgICAgICBQbGVhc2UgcmVsb2FkIHRoZSBleHRlbnNpb24gb3IgY2hlY2sgcGVybWlzc2lvbnMuXG4gICAgICAgICAgICAgICAgPC9kaXY+YDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yIGxvYWRpbmcgc3RhdGU6XCIsIGUpO1xuICAgIH1cbiAgfTtcblxuICAvLyBTdGFydCBib3RoIGNvbmN1cnJlbnRseVxuICBhd2FpdCBQcm9taXNlLmFsbChbZmFzdExvYWQoKSwgYmdMb2FkKCldKTtcbn07XG5cbmNvbnN0IGdldFNlbGVjdGVkU29ydGluZyA9ICgpOiBTb3J0aW5nU3RyYXRlZ3lbXSA9PiB7XG4gICAgLy8gUmVhZCBmcm9tIERPTSB0byBnZXQgY3VycmVudCBvcmRlciBvZiBhY3RpdmUgc3RyYXRlZ2llc1xuICAgIHJldHVybiBBcnJheS5mcm9tKGFjdGl2ZVN0cmF0ZWdpZXNMaXN0LmNoaWxkcmVuKVxuICAgICAgICAubWFwKHJvdyA9PiAocm93IGFzIEhUTUxFbGVtZW50KS5kYXRhc2V0LmlkIGFzIFNvcnRpbmdTdHJhdGVneSk7XG59O1xuXG4vLyBBZGQgbGlzdGVuZXIgZm9yIHNlbGVjdFxuYWRkU3RyYXRlZ3lTZWxlY3QuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgYXN5bmMgKGUpID0+IHtcbiAgICBjb25zdCBzZWxlY3QgPSBlLnRhcmdldCBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICBjb25zdCBpZCA9IHNlbGVjdC52YWx1ZTtcbiAgICBpZiAoaWQpIHtcbiAgICAgICAgYXdhaXQgdG9nZ2xlU3RyYXRlZ3koaWQsIHRydWUpO1xuICAgICAgICBzZWxlY3QudmFsdWUgPSBcIlwiOyAvLyBSZXNldCB0byBwbGFjZWhvbGRlclxuICAgIH1cbn0pO1xuXG5jb25zdCB0cmlnZ2VyR3JvdXAgPSBhc3luYyAoc2VsZWN0aW9uPzogR3JvdXBpbmdTZWxlY3Rpb24pID0+IHtcbiAgICBsb2dJbmZvKFwiVHJpZ2dlcmluZyBncm91cGluZ1wiLCB7IHNlbGVjdGlvbiB9KTtcbiAgICBzaG93TG9hZGluZyhcIkFwcGx5aW5nIFN0cmF0ZWd5Li4uXCIpO1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHNvcnRpbmcgPSBnZXRTZWxlY3RlZFNvcnRpbmcoKTtcbiAgICAgICAgYXdhaXQgYXBwbHlHcm91cGluZyh7IHNlbGVjdGlvbiwgc29ydGluZyB9KTtcbiAgICAgICAgYXdhaXQgbG9hZFN0YXRlKCk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgICAgaGlkZUxvYWRpbmcoKTtcbiAgICB9XG59O1xuXG5jaHJvbWUucnVudGltZS5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoKG1lc3NhZ2UpID0+IHtcbiAgICBpZiAobWVzc2FnZS50eXBlID09PSAnZ3JvdXBpbmdQcm9ncmVzcycpIHtcbiAgICAgICAgY29uc3QgeyBjb21wbGV0ZWQsIHRvdGFsIH0gPSBtZXNzYWdlLnBheWxvYWQ7XG4gICAgICAgIHVwZGF0ZVByb2dyZXNzKGNvbXBsZXRlZCwgdG90YWwpO1xuICAgIH1cbn0pO1xuXG4vLyBMaXN0ZW5lcnNcbnNlbGVjdEFsbENoZWNrYm94LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKGUpID0+IHtcbiAgICBjb25zdCB0YXJnZXRTdGF0ZSA9IChlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS5jaGVja2VkO1xuICAgIGlmICh0YXJnZXRTdGF0ZSkge1xuICAgICAgICAvLyBTZWxlY3QgQWxsXG4gICAgICAgIHdpbmRvd1N0YXRlLmZvckVhY2god2luID0+IHtcbiAgICAgICAgICAgIHdpbi50YWJzLmZvckVhY2godGFiID0+IHNlbGVjdGVkVGFicy5hZGQodGFiLmlkKSk7XG4gICAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIERlc2VsZWN0IEFsbFxuICAgICAgICBzZWxlY3RlZFRhYnMuY2xlYXIoKTtcbiAgICB9XG4gICAgcmVuZGVyVHJlZSgpO1xufSk7XG5cbmJ0bkFwcGx5Py5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIGxvZ0luZm8oXCJBcHBseSBidXR0b24gY2xpY2tlZFwiLCB7IHNlbGVjdGVkQ291bnQ6IHNlbGVjdGVkVGFicy5zaXplIH0pO1xuICAgIHRyaWdnZXJHcm91cCh7IHRhYklkczogQXJyYXkuZnJvbShzZWxlY3RlZFRhYnMpIH0pO1xufSk7XG5cbmJ0blVuZ3JvdXAuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgaWYgKGNvbmZpcm0oYFVuZ3JvdXAgJHtzZWxlY3RlZFRhYnMuc2l6ZX0gdGFicz9gKSkge1xuICAgICAgbG9nSW5mbyhcIlVuZ3JvdXBpbmcgdGFic1wiLCB7IGNvdW50OiBzZWxlY3RlZFRhYnMuc2l6ZSB9KTtcbiAgICAgIGF3YWl0IGNocm9tZS50YWJzLnVuZ3JvdXAoQXJyYXkuZnJvbShzZWxlY3RlZFRhYnMpKTtcbiAgICAgIGF3YWl0IGxvYWRTdGF0ZSgpO1xuICB9XG59KTtcbmJ0bk1lcmdlLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIGlmIChjb25maXJtKGBNZXJnZSAke3NlbGVjdGVkVGFicy5zaXplfSB0YWJzIGludG8gb25lIGdyb3VwP2ApKSB7XG4gICAgICBsb2dJbmZvKFwiTWVyZ2luZyB0YWJzXCIsIHsgY291bnQ6IHNlbGVjdGVkVGFicy5zaXplIH0pO1xuICAgICAgY29uc3QgcmVzID0gYXdhaXQgc2VuZE1lc3NhZ2UoXCJtZXJnZVNlbGVjdGlvblwiLCB7IHRhYklkczogQXJyYXkuZnJvbShzZWxlY3RlZFRhYnMpIH0pO1xuICAgICAgaWYgKCFyZXMub2spIGFsZXJ0KFwiTWVyZ2UgZmFpbGVkOiBcIiArIHJlcy5lcnJvcik7XG4gICAgICBlbHNlIGF3YWl0IGxvYWRTdGF0ZSgpO1xuICB9XG59KTtcbmJ0blNwbGl0LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIGlmIChjb25maXJtKGBTcGxpdCAke3NlbGVjdGVkVGFicy5zaXplfSB0YWJzIGludG8gYSBuZXcgd2luZG93P2ApKSB7XG4gICAgICBsb2dJbmZvKFwiU3BsaXR0aW5nIHRhYnNcIiwgeyBjb3VudDogc2VsZWN0ZWRUYWJzLnNpemUgfSk7XG4gICAgICBjb25zdCByZXMgPSBhd2FpdCBzZW5kTWVzc2FnZShcInNwbGl0U2VsZWN0aW9uXCIsIHsgdGFiSWRzOiBBcnJheS5mcm9tKHNlbGVjdGVkVGFicykgfSk7XG4gICAgICBpZiAoIXJlcy5vaykgYWxlcnQoXCJTcGxpdCBmYWlsZWQ6IFwiICsgcmVzLmVycm9yKTtcbiAgICAgIGVsc2UgYXdhaXQgbG9hZFN0YXRlKCk7XG4gIH1cbn0pO1xuXG5idG5FeHBhbmRBbGw/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgd2luZG93U3RhdGUuZm9yRWFjaCh3aW4gPT4ge1xuICAgICAgICBleHBhbmRlZE5vZGVzLmFkZChgdy0ke3dpbi5pZH1gKTtcbiAgICAgICAgd2luLnRhYnMuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgICAgICAgaWYgKHRhYi5ncm91cExhYmVsKSB7XG4gICAgICAgICAgICAgICAgIGV4cGFuZGVkTm9kZXMuYWRkKGB3LSR7d2luLmlkfS1nLSR7dGFiLmdyb3VwTGFiZWx9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICAgIHJlbmRlclRyZWUoKTtcbn0pO1xuXG5idG5Db2xsYXBzZUFsbD8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBleHBhbmRlZE5vZGVzLmNsZWFyKCk7XG4gICAgcmVuZGVyVHJlZSgpO1xufSk7XG5cblxuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5VbmRvXCIpPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICBsb2dJbmZvKFwiVW5kbyBjbGlja2VkXCIpO1xuICBjb25zdCByZXMgPSBhd2FpdCBzZW5kTWVzc2FnZShcInVuZG9cIik7XG4gIGlmICghcmVzLm9rKSBhbGVydChcIlVuZG8gZmFpbGVkOiBcIiArIHJlcy5lcnJvcik7XG59KTtcblxuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5TYXZlU3RhdGVcIik/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIGNvbnN0IG5hbWUgPSBwcm9tcHQoXCJFbnRlciBhIG5hbWUgZm9yIHRoaXMgc3RhdGU6XCIpO1xuICBpZiAobmFtZSkge1xuICAgIGxvZ0luZm8oXCJTYXZpbmcgc3RhdGVcIiwgeyBuYW1lIH0pO1xuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHNlbmRNZXNzYWdlKFwic2F2ZVN0YXRlXCIsIHsgbmFtZSB9KTtcbiAgICBpZiAoIXJlcy5vaykgYWxlcnQoXCJTYXZlIGZhaWxlZDogXCIgKyByZXMuZXJyb3IpO1xuICB9XG59KTtcblxuY29uc3QgbG9hZFN0YXRlRGlhbG9nID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsb2FkU3RhdGVEaWFsb2dcIikgYXMgSFRNTERpYWxvZ0VsZW1lbnQ7XG5jb25zdCBzYXZlZFN0YXRlTGlzdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2F2ZWRTdGF0ZUxpc3RcIikgYXMgSFRNTEVsZW1lbnQ7XG5cbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuTG9hZFN0YXRlXCIpPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICBsb2dJbmZvKFwiT3BlbmluZyBMb2FkIFN0YXRlIGRpYWxvZ1wiKTtcbiAgY29uc3QgcmVzID0gYXdhaXQgc2VuZE1lc3NhZ2U8U2F2ZWRTdGF0ZVtdPihcImdldFNhdmVkU3RhdGVzXCIpO1xuICBpZiAocmVzLm9rICYmIHJlcy5kYXRhKSB7XG4gICAgc2F2ZWRTdGF0ZUxpc3QuaW5uZXJIVE1MID0gXCJcIjtcbiAgICByZXMuZGF0YS5mb3JFYWNoKChzdGF0ZSkgPT4ge1xuICAgICAgY29uc3QgbGkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwibGlcIik7XG4gICAgICBsaS5zdHlsZS5kaXNwbGF5ID0gXCJmbGV4XCI7XG4gICAgICBsaS5zdHlsZS5qdXN0aWZ5Q29udGVudCA9IFwic3BhY2UtYmV0d2VlblwiO1xuICAgICAgbGkuc3R5bGUucGFkZGluZyA9IFwiOHB4XCI7XG4gICAgICBsaS5zdHlsZS5ib3JkZXJCb3R0b20gPSBcIjFweCBzb2xpZCB2YXIoLS1ib3JkZXItY29sb3IpXCI7XG5cbiAgICAgIGNvbnN0IHNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgICAgIHNwYW4udGV4dENvbnRlbnQgPSBgJHtzdGF0ZS5uYW1lfSAoJHtuZXcgRGF0ZShzdGF0ZS50aW1lc3RhbXApLnRvTG9jYWxlU3RyaW5nKCl9KWA7XG4gICAgICBzcGFuLnN0eWxlLmN1cnNvciA9IFwicG9pbnRlclwiO1xuICAgICAgc3Bhbi5vbmNsaWNrID0gYXN5bmMgKCkgPT4ge1xuICAgICAgICBpZiAoY29uZmlybShgTG9hZCBzdGF0ZSBcIiR7c3RhdGUubmFtZX1cIj9gKSkge1xuICAgICAgICAgIGxvZ0luZm8oXCJSZXN0b3Jpbmcgc3RhdGVcIiwgeyBuYW1lOiBzdGF0ZS5uYW1lIH0pO1xuICAgICAgICAgIGNvbnN0IHIgPSBhd2FpdCBzZW5kTWVzc2FnZShcInJlc3RvcmVTdGF0ZVwiLCB7IHN0YXRlIH0pO1xuICAgICAgICAgIGlmIChyLm9rKSB7XG4gICAgICAgICAgICAgIGxvYWRTdGF0ZURpYWxvZy5jbG9zZSgpO1xuICAgICAgICAgICAgICB3aW5kb3cuY2xvc2UoKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBhbGVydChcIlJlc3RvcmUgZmFpbGVkOiBcIiArIHIuZXJyb3IpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfTtcblxuICAgICAgY29uc3QgZGVsQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgICAgIGRlbEJ0bi50ZXh0Q29udGVudCA9IFwiRGVsZXRlXCI7XG4gICAgICBkZWxCdG4uc3R5bGUubWFyZ2luTGVmdCA9IFwiOHB4XCI7XG4gICAgICBkZWxCdG4uc3R5bGUuYmFja2dyb3VuZCA9IFwidHJhbnNwYXJlbnRcIjtcbiAgICAgIGRlbEJ0bi5zdHlsZS5jb2xvciA9IFwidmFyKC0tdGV4dC1jb2xvcilcIjtcbiAgICAgIGRlbEJ0bi5zdHlsZS5ib3JkZXIgPSBcIjFweCBzb2xpZCB2YXIoLS1ib3JkZXItY29sb3IpXCI7XG4gICAgICBkZWxCdG4uc3R5bGUuYm9yZGVyUmFkaXVzID0gXCI0cHhcIjtcbiAgICAgIGRlbEJ0bi5zdHlsZS5wYWRkaW5nID0gXCIycHggNnB4XCI7XG4gICAgICBkZWxCdG4ub25jbGljayA9IGFzeW5jIChlKSA9PiB7XG4gICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICBpZiAoY29uZmlybShgRGVsZXRlIHN0YXRlIFwiJHtzdGF0ZS5uYW1lfVwiP2ApKSB7XG4gICAgICAgICAgICAgIGF3YWl0IHNlbmRNZXNzYWdlKFwiZGVsZXRlU2F2ZWRTdGF0ZVwiLCB7IG5hbWU6IHN0YXRlLm5hbWUgfSk7XG4gICAgICAgICAgICAgIGxpLnJlbW92ZSgpO1xuICAgICAgICAgIH1cbiAgICAgIH07XG5cbiAgICAgIGxpLmFwcGVuZENoaWxkKHNwYW4pO1xuICAgICAgbGkuYXBwZW5kQ2hpbGQoZGVsQnRuKTtcbiAgICAgIHNhdmVkU3RhdGVMaXN0LmFwcGVuZENoaWxkKGxpKTtcbiAgICB9KTtcbiAgICBsb2FkU3RhdGVEaWFsb2cuc2hvd01vZGFsKCk7XG4gIH0gZWxzZSB7XG4gICAgICBhbGVydChcIkZhaWxlZCB0byBsb2FkIHN0YXRlczogXCIgKyByZXMuZXJyb3IpO1xuICB9XG59KTtcblxuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5DbG9zZUxvYWRTdGF0ZVwiKT8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBsb2FkU3RhdGVEaWFsb2cuY2xvc2UoKTtcbn0pO1xuXG5zZWFyY2hJbnB1dC5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgcmVuZGVyVHJlZSk7XG5cbi8vIEF1dG8tcmVmcmVzaFxuY2hyb21lLnRhYnMub25VcGRhdGVkLmFkZExpc3RlbmVyKCgpID0+IGxvYWRTdGF0ZSgpKTtcbmNocm9tZS50YWJzLm9uUmVtb3ZlZC5hZGRMaXN0ZW5lcigoKSA9PiBsb2FkU3RhdGUoKSk7XG5jaHJvbWUud2luZG93cy5vblJlbW92ZWQuYWRkTGlzdGVuZXIoKCkgPT4gbG9hZFN0YXRlKCkpO1xuXG4vLyAtLS0gVGhlbWUgTG9naWMgLS0tXG5jb25zdCBidG5UaGVtZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuVGhlbWVcIik7XG5jb25zdCBpY29uU3VuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJpY29uU3VuXCIpO1xuY29uc3QgaWNvbk1vb24gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImljb25Nb29uXCIpO1xuXG5jb25zdCBhcHBseVRoZW1lID0gKHRoZW1lOiAnbGlnaHQnIHwgJ2RhcmsnLCBzYXZlID0gZmFsc2UpID0+IHtcbiAgICBpZiAodGhlbWUgPT09ICdsaWdodCcpIHtcbiAgICAgICAgZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QuYWRkKCdsaWdodC1tb2RlJyk7XG4gICAgICAgIGlmIChpY29uU3VuKSBpY29uU3VuLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuICAgICAgICBpZiAoaWNvbk1vb24pIGljb25Nb29uLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QucmVtb3ZlKCdsaWdodC1tb2RlJyk7XG4gICAgICAgIGlmIChpY29uU3VuKSBpY29uU3VuLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgICAgIGlmIChpY29uTW9vbikgaWNvbk1vb24uc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG4gICAgfVxuXG4gICAgLy8gU3luYyB3aXRoIFByZWZlcmVuY2VzXG4gICAgaWYgKHNhdmUpIHtcbiAgICAgICAgLy8gV2UgdXNlIHNhdmVQcmVmZXJlbmNlcyB3aGljaCBjYWxscyB0aGUgYmFja2dyb3VuZCB0byBzdG9yZSBpdFxuICAgICAgICBsb2dJbmZvKFwiQXBwbHlpbmcgdGhlbWVcIiwgeyB0aGVtZSB9KTtcbiAgICAgICAgbG9jYWxQcmVmZXJlbmNlc01vZGlmaWVkVGltZSA9IERhdGUubm93KCk7XG4gICAgICAgIHNlbmRNZXNzYWdlKFwic2F2ZVByZWZlcmVuY2VzXCIsIHsgdGhlbWUgfSk7XG4gICAgfVxufTtcblxuLy8gSW5pdGlhbCBsb2FkIGZhbGxiYWNrIChiZWZvcmUgbG9hZFN0YXRlIGxvYWRzIHByZWZzKVxuY29uc3Qgc3RvcmVkVGhlbWUgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgndGhlbWUnKSBhcyAnbGlnaHQnIHwgJ2RhcmsnO1xuLy8gSWYgd2UgaGF2ZSBhIGxvY2FsIG92ZXJyaWRlLCB1c2UgaXQgdGVtcG9yYXJpbHksIGJ1dCBsb2FkU3RhdGUgd2lsbCBhdXRob3JpdGF0aXZlIGNoZWNrIHByZWZzXG5pZiAoc3RvcmVkVGhlbWUpIGFwcGx5VGhlbWUoc3RvcmVkVGhlbWUsIGZhbHNlKTtcblxuYnRuVGhlbWU/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgIGNvbnN0IGlzTGlnaHQgPSBkb2N1bWVudC5ib2R5LmNsYXNzTGlzdC5jb250YWlucygnbGlnaHQtbW9kZScpO1xuICAgIGNvbnN0IG5ld1RoZW1lID0gaXNMaWdodCA/ICdkYXJrJyA6ICdsaWdodCc7XG4gICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ3RoZW1lJywgbmV3VGhlbWUpOyAvLyBLZWVwIGxvY2FsIGNvcHkgZm9yIGZhc3QgYm9vdFxuICAgIGFwcGx5VGhlbWUobmV3VGhlbWUsIHRydWUpO1xufSk7XG5cbi8vIC0tLSBTZXR0aW5ncyBMb2dpYyAtLS1cbmNvbnN0IHNldHRpbmdzRGlhbG9nID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzZXR0aW5nc0RpYWxvZ1wiKSBhcyBIVE1MRGlhbG9nRWxlbWVudDtcbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuU2V0dGluZ3NcIik/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0dGluZ3NEaWFsb2cuc2hvd01vZGFsKCk7XG59KTtcbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuQ2xvc2VTZXR0aW5nc1wiKT8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXR0aW5nc0RpYWxvZy5jbG9zZSgpO1xufSk7XG5cbmNvbnN0IGxvZ0xldmVsU2VsZWN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsb2dMZXZlbFNlbGVjdFwiKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbmxvZ0xldmVsU2VsZWN0Py5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsIGFzeW5jICgpID0+IHtcbiAgICBjb25zdCBuZXdMZXZlbCA9IGxvZ0xldmVsU2VsZWN0LnZhbHVlIGFzIExvZ0xldmVsO1xuICAgIGlmIChwcmVmZXJlbmNlcykge1xuICAgICAgICBwcmVmZXJlbmNlcy5sb2dMZXZlbCA9IG5ld0xldmVsO1xuICAgICAgICAvLyBVcGRhdGUgbG9jYWwgbG9nZ2VyIGltbWVkaWF0ZWx5XG4gICAgICAgIHNldExvZ2dlclByZWZlcmVuY2VzKHByZWZlcmVuY2VzKTtcbiAgICAgICAgLy8gUGVyc2lzdFxuICAgICAgICBsb2NhbFByZWZlcmVuY2VzTW9kaWZpZWRUaW1lID0gRGF0ZS5ub3coKTtcbiAgICAgICAgYXdhaXQgc2VuZE1lc3NhZ2UoXCJzYXZlUHJlZmVyZW5jZXNcIiwgeyBsb2dMZXZlbDogbmV3TGV2ZWwgfSk7XG4gICAgICAgIGxvZ0RlYnVnKFwiTG9nIGxldmVsIHVwZGF0ZWRcIiwgeyBsZXZlbDogbmV3TGV2ZWwgfSk7XG4gICAgfVxufSk7XG5cbi8vIC0tLSBQaW4gJiBSZXNpemUgTG9naWMgLS0tXG5jb25zdCBidG5QaW4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0blBpblwiKTtcbmJ0blBpbj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgY29uc3QgdXJsID0gY2hyb21lLnJ1bnRpbWUuZ2V0VVJMKFwidWkvcG9wdXAuaHRtbFwiKTtcbiAgYXdhaXQgY2hyb21lLndpbmRvd3MuY3JlYXRlKHtcbiAgICB1cmwsXG4gICAgdHlwZTogXCJwb3B1cFwiLFxuICAgIHdpZHRoOiBkb2N1bWVudC5ib2R5Lm9mZnNldFdpZHRoLFxuICAgIGhlaWdodDogZG9jdW1lbnQuYm9keS5vZmZzZXRIZWlnaHRcbiAgfSk7XG4gIHdpbmRvdy5jbG9zZSgpO1xufSk7XG5cbmNvbnN0IHJlc2l6ZUhhbmRsZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicmVzaXplSGFuZGxlXCIpO1xuaWYgKHJlc2l6ZUhhbmRsZSkge1xuICBjb25zdCBzYXZlU2l6ZSA9ICh3OiBudW1iZXIsIGg6IG51bWJlcikgPT4ge1xuICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oXCJwb3B1cFNpemVcIiwgSlNPTi5zdHJpbmdpZnkoeyB3aWR0aDogdywgaGVpZ2h0OiBoIH0pKTtcbiAgfTtcblxuICByZXNpemVIYW5kbGUuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlZG93blwiLCAoZSkgPT4ge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgY29uc3Qgc3RhcnRYID0gZS5jbGllbnRYO1xuICAgICAgY29uc3Qgc3RhcnRZID0gZS5jbGllbnRZO1xuICAgICAgY29uc3Qgc3RhcnRXaWR0aCA9IGRvY3VtZW50LmJvZHkub2Zmc2V0V2lkdGg7XG4gICAgICBjb25zdCBzdGFydEhlaWdodCA9IGRvY3VtZW50LmJvZHkub2Zmc2V0SGVpZ2h0O1xuXG4gICAgICBjb25zdCBvbk1vdXNlTW92ZSA9IChldjogTW91c2VFdmVudCkgPT4ge1xuICAgICAgICAgIGNvbnN0IG5ld1dpZHRoID0gTWF0aC5tYXgoNTAwLCBzdGFydFdpZHRoICsgKGV2LmNsaWVudFggLSBzdGFydFgpKTtcbiAgICAgICAgICBjb25zdCBuZXdIZWlnaHQgPSBNYXRoLm1heCg1MDAsIHN0YXJ0SGVpZ2h0ICsgKGV2LmNsaWVudFkgLSBzdGFydFkpKTtcbiAgICAgICAgICBkb2N1bWVudC5ib2R5LnN0eWxlLndpZHRoID0gYCR7bmV3V2lkdGh9cHhgO1xuICAgICAgICAgIGRvY3VtZW50LmJvZHkuc3R5bGUuaGVpZ2h0ID0gYCR7bmV3SGVpZ2h0fXB4YDtcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IG9uTW91c2VVcCA9IChldjogTW91c2VFdmVudCkgPT4ge1xuICAgICAgICAgICBjb25zdCBuZXdXaWR0aCA9IE1hdGgubWF4KDUwMCwgc3RhcnRXaWR0aCArIChldi5jbGllbnRYIC0gc3RhcnRYKSk7XG4gICAgICAgICAgIGNvbnN0IG5ld0hlaWdodCA9IE1hdGgubWF4KDUwMCwgc3RhcnRIZWlnaHQgKyAoZXYuY2xpZW50WSAtIHN0YXJ0WSkpO1xuICAgICAgICAgICBzYXZlU2l6ZShuZXdXaWR0aCwgbmV3SGVpZ2h0KTtcbiAgICAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1vdXNlbW92ZVwiLCBvbk1vdXNlTW92ZSk7XG4gICAgICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb3VzZXVwXCIsIG9uTW91c2VVcCk7XG4gICAgICB9O1xuXG4gICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwibW91c2Vtb3ZlXCIsIG9uTW91c2VNb3ZlKTtcbiAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZXVwXCIsIG9uTW91c2VVcCk7XG4gIH0pO1xufVxuXG5jb25zdCBhZGp1c3RGb3JXaW5kb3dUeXBlID0gYXN5bmMgKCkgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHdpbiA9IGF3YWl0IGNocm9tZS53aW5kb3dzLmdldEN1cnJlbnQoKTtcbiAgICBpZiAod2luLnR5cGUgPT09IFwicG9wdXBcIikge1xuICAgICAgIGlmIChidG5QaW4pIGJ0blBpbi5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgICAgLy8gRW5hYmxlIHJlc2l6ZSBoYW5kbGUgaW4gcGlubmVkIG1vZGUgaWYgaXQgd2FzIGhpZGRlblxuICAgICAgIGlmIChyZXNpemVIYW5kbGUpIHJlc2l6ZUhhbmRsZS5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgICAgIGRvY3VtZW50LmJvZHkuc3R5bGUud2lkdGggPSBcIjEwMCVcIjtcbiAgICAgICBkb2N1bWVudC5ib2R5LnN0eWxlLmhlaWdodCA9IFwiMTAwJVwiO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIERpc2FibGUgcmVzaXplIGhhbmRsZSBpbiBkb2NrZWQgbW9kZVxuICAgICAgICBpZiAocmVzaXplSGFuZGxlKSByZXNpemVIYW5kbGUuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgICAgICAvLyBDbGVhciBhbnkgcHJldmlvdXMgc2l6ZSBvdmVycmlkZXNcbiAgICAgICAgZG9jdW1lbnQuYm9keS5zdHlsZS53aWR0aCA9IFwiXCI7XG4gICAgICAgIGRvY3VtZW50LmJvZHkuc3R5bGUuaGVpZ2h0ID0gXCJcIjtcbiAgICB9XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvciBjaGVja2luZyB3aW5kb3cgdHlwZTpcIiwgZSk7XG4gIH1cbn07XG5cbmFkanVzdEZvcldpbmRvd1R5cGUoKTtcbmxvYWRTdGF0ZSgpLmNhdGNoKGUgPT4gY29uc29sZS5lcnJvcihcIkxvYWQgc3RhdGUgZmFpbGVkXCIsIGUpKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFFTyxJQUFNLGVBQWUsQ0FBQyxRQUE2QztBQUN4RSxNQUFJLENBQUMsSUFBSSxNQUFNLElBQUksT0FBTyxPQUFPLEtBQUssZUFBZSxDQUFDLElBQUksU0FBVSxRQUFPO0FBQzNFLFNBQU87QUFBQSxJQUNMLElBQUksSUFBSTtBQUFBLElBQ1IsVUFBVSxJQUFJO0FBQUEsSUFDZCxPQUFPLElBQUksU0FBUztBQUFBLElBQ3BCLEtBQUssSUFBSSxjQUFjLElBQUksT0FBTztBQUFBLElBQ2xDLFFBQVEsUUFBUSxJQUFJLE1BQU07QUFBQSxJQUMxQixjQUFjLElBQUk7QUFBQSxJQUNsQixhQUFhLElBQUksZUFBZTtBQUFBLElBQ2hDLFlBQVksSUFBSTtBQUFBLElBQ2hCLFNBQVMsSUFBSTtBQUFBLElBQ2IsT0FBTyxJQUFJO0FBQUEsSUFDWCxRQUFRLElBQUk7QUFBQSxJQUNaLFFBQVEsSUFBSTtBQUFBLElBQ1osVUFBVSxJQUFJO0FBQUEsRUFDaEI7QUFDRjtBQUVPLElBQU0sdUJBQXVCLFlBQXlDO0FBQzNFLFNBQU8sSUFBSSxRQUFRLENBQUMsWUFBWTtBQUM5QixXQUFPLFFBQVEsTUFBTSxJQUFJLGVBQWUsQ0FBQyxVQUFVO0FBQ2pELGNBQVMsTUFBTSxhQUFhLEtBQXFCLElBQUk7QUFBQSxJQUN2RCxDQUFDO0FBQUEsRUFDSCxDQUFDO0FBQ0g7QUFFTyxJQUFNLFVBQVUsQ0FBSSxVQUF3QjtBQUMvQyxNQUFJLE1BQU0sUUFBUSxLQUFLLEVBQUcsUUFBTztBQUNqQyxTQUFPLENBQUM7QUFDWjs7O0FDbkJPLElBQU0sYUFBbUM7QUFBQSxFQUM1QyxFQUFFLElBQUksVUFBVSxPQUFPLFVBQVUsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUM1RixFQUFFLElBQUksZUFBZSxPQUFPLGVBQWUsWUFBWSxNQUFNLFdB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QUVBLFVBQU0sWUFBWSxDQUFDLE9BQW1CO0FBQ2pDLFlBQU0sV0FBVyxLQUFLLElBQUksS0FBSyxjQUFjLEdBQUcsVUFBVSxPQUFPO0FBQ2pFLFlBQU0sWUFBWSxLQUFLLElBQUksS0FBSyxlQUFlLEdBQUcsVUFBVSxPQUFPO0FBQ25FLGVBQVMsVUFBVSxTQUFTO0FBQzVCLGVBQVMsb0JBQW9CLGFBQWEsV0FBVztBQUNyRCxlQUFTLG9CQUFvQixXQUFXLFNBQVM7QUFBQSxJQUN0RDtBQUVBLGFBQVMsaUJBQWlCLGFBQWEsV0FBVztBQUNsRCxhQUFTLGlCQUFpQixXQUFXLFNBQVM7QUFBQSxFQUNsRCxDQUFDO0FBQ0g7QUFFQSxJQUFNLHNCQUFzQixZQUFZO0FBQ3RDLE1BQUk7QUFDRixVQUFNLE1BQU0sTUFBTSxPQUFPLFFBQVEsV0FBVztBQUM1QyxRQUFJLElBQUksU0FBUyxTQUFTO0FBQ3ZCLFVBQUksT0FBUSxRQUFPLE1BQU0sVUFBVTtBQUVuQyxVQUFJLGFBQWMsY0FBYSxNQUFNLFVBQVU7QUFDL0MsZUFBUyxLQUFLLE1BQU0sUUFBUTtBQUM1QixlQUFTLEtBQUssTUFBTSxTQUFTO0FBQUEsSUFDaEMsT0FBTztBQUVILFVBQUksYUFBYyxjQUFhLE1BQU0sVUFBVTtBQUUvQyxlQUFTLEtBQUssTUFBTSxRQUFRO0FBQzVCLGVBQVMsS0FBSyxNQUFNLFNBQVM7QUFBQSxJQUNqQztBQUFBLEVBQ0YsU0FBUyxHQUFHO0FBQ1IsWUFBUSxNQUFNLCtCQUErQixDQUFDO0FBQUEsRUFDbEQ7QUFDRjtBQUVBLG9CQUFvQjtBQUNwQixVQUFVLEVBQUUsTUFBTSxPQUFLLFFBQVEsTUFBTSxxQkFBcUIsQ0FBQyxDQUFDOyIsCiAgIm5hbWVzIjogWyJjdXN0b21TdHJhdGVnaWVzIiwgInByZWZlcmVuY2VzIiwgInRhYnMiLCAid2luZG93IiwgImxpc3QiXQp9Cg==
