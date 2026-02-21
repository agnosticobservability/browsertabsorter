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
var SENSITIVE_KEYS = /password|secret|token|credential|cookie|session|authorization|((api|access|secret|private)[-_]?key)/i;
var sanitizeContext = (context) => {
  if (!context) return void 0;
  try {
    const json = JSON.stringify(context);
    const obj = JSON.parse(json);
    const redact = (o) => {
      if (typeof o !== "object" || o === null) return;
      for (const k in o) {
        if (SENSITIVE_KEYS.test(k)) {
          o[k] = "[REDACTED]";
        } else {
          redact(o[k]);
        }
      }
    };
    redact(obj);
    return obj;
  } catch (e) {
    return { error: "Failed to sanitize context" };
  }
};
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
  if (shouldLog("debug")) {
    const safeContext = sanitizeContext(context);
    addLog("debug", message, safeContext);
    console.debug(`${PREFIX} [DEBUG] ${formatMessage(message, safeContext)}`);
  }
};
var logInfo = (message, context) => {
  if (shouldLog("info")) {
    const safeContext = sanitizeContext(context);
    addLog("info", message, safeContext);
    console.info(`${PREFIX} [INFO] ${formatMessage(message, safeContext)}`);
  }
};

// src/shared/urlCache.ts
var hostnameCache = /* @__PURE__ */ new Map();
var MAX_CACHE_SIZE = 1e3;
var getHostname = (url) => {
  if (hostnameCache.has(url)) return hostnameCache.get(url);
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    if (hostnameCache.size >= MAX_CACHE_SIZE) hostnameCache.clear();
    hostnameCache.set(url, hostname);
    return hostname;
  } catch {
    return null;
  }
};

// src/background/groupingStrategies.ts
var customStrategies = [];
var setCustomStrategies = (strategies) => {
  customStrategies = strategies;
};
var getCustomStrategies = () => customStrategies;
var regexCache = /* @__PURE__ */ new Map();
var domainFromUrl = (url) => {
  const hostname = getHostname(url);
  if (!hostname) return "unknown";
  return hostname.replace(/^www\./, "");
};
var subdomainFromUrl = (url) => {
  const hostname = getHostname(url);
  if (!hostname) return "";
  const host = hostname.replace(/^www\./, "");
  const parts = host.split(".");
  if (parts.length > 2) {
    return parts.slice(0, parts.length - 2).join(".");
  }
  return "";
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
      const h = getHostname(val);
      return h !== null ? h : val;
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
  const legacyRulesList = asArray(legacyRules);
  if (legacyRulesList.length === 0) return null;
  try {
    for (const rule of legacyRulesList) {
      if (!rule) continue;
      const rawValue = getFieldValue(tab, rule.field);
      const { isMatch, matchObj } = checkValueMatch(rule.operator, rawValue, rule.value);
      if (isMatch) {
        let result = rule.result;
        if (matchObj && matchObj.length > 1) {
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
var compareValues = (a, b, order = "asc") => {
  const isANull = a === void 0 || a === null;
  const isBNull = b === void 0 || b === null;
  if (isANull && isBNull) return 0;
  if (isANull) return 1;
  if (isBNull) return -1;
  let result = 0;
  if (a < b) result = -1;
  else if (a > b) result = 1;
  return order === "desc" ? -result : result;
};
var compareBySortingRules = (rules, a, b) => {
  const sortRulesList = asArray(rules);
  if (sortRulesList.length === 0) return 0;
  try {
    for (const rule of sortRulesList) {
      if (!rule) continue;
      const valA = getFieldValue(a, rule.field);
      const valB = getFieldValue(b, rule.field);
      const diff = compareValues(valA, valB, rule.order || "asc");
      if (diff !== 0) return diff;
    }
  } catch (e) {
    logDebug("Error evaluating sorting rules", { error: String(e) });
  }
  return 0;
};
var compareRecency = (a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0);
var compareNesting = (a, b) => hierarchyScore(a) - hierarchyScore(b);
var comparePinned = (a, b) => pinnedScore(a) - pinnedScore(b);
var compareTitle = (a, b) => a.title.localeCompare(b.title);
var compareUrl = (a, b) => a.url.localeCompare(b.url);
var compareContext = (a, b) => (a.context ?? "").localeCompare(b.context ?? "");
var compareDomain = (a, b) => domainFromUrl(a.url).localeCompare(domainFromUrl(b.url));
var compareTopic = (a, b) => semanticBucket(a.title, a.url).localeCompare(semanticBucket(b.title, b.url));
var compareLineage = (a, b) => navigationKey(a).localeCompare(navigationKey(b));
var compareAge = (a, b) => (groupingKey(a, "age") || "").localeCompare(groupingKey(b, "age") || "");
var strategyRegistry = {
  recency: compareRecency,
  nesting: compareNesting,
  pinned: comparePinned,
  title: compareTitle,
  url: compareUrl,
  context: compareContext,
  domain: compareDomain,
  domain_full: compareDomain,
  topic: compareTopic,
  lineage: compareLineage,
  age: compareAge
};
var evaluateCustomStrategy = (strategy, a, b) => {
  const customStrats = getCustomStrategies();
  const custom = customStrats.find((s) => s.id === strategy);
  if (!custom) return null;
  const sortRulesList = asArray(custom.sortingRules);
  if (sortRulesList.length === 0) return null;
  return compareBySortingRules(sortRulesList, a, b);
};
var evaluateGenericStrategy = (strategy, a, b) => {
  const valA = getFieldValue(a, strategy);
  const valB = getFieldValue(b, strategy);
  if (valA !== void 0 && valB !== void 0) {
    if (valA < valB) return -1;
    if (valA > valB) return 1;
    return 0;
  }
  return (groupingKey(a, strategy) || "").localeCompare(groupingKey(b, strategy) || "");
};
var compareBy = (strategy, a, b) => {
  const customDiff = evaluateCustomStrategy(strategy, a, b);
  if (customDiff !== null) {
    return customDiff;
  }
  const builtIn = strategyRegistry[strategy];
  if (builtIn) {
    return builtIn(a, b);
  }
  return evaluateGenericStrategy(strategy, a, b);
};
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
var renderTabNode = (tab) => {
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
var renderGroupNode = (groupLabel, groupData, windowKey, query) => {
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
    tabsContainer.appendChild(renderTabNode(tab));
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
  return groupNode;
};
var renderWindowNode = (window2, visibleTabs, query) => {
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
  Array.from(groups.entries()).forEach(([groupLabel, groupData]) => {
    childrenContainer.appendChild(renderGroupNode(groupLabel, groupData, windowKey, query));
  });
  ungroupedTabs.forEach((tab) => {
    childrenContainer.appendChild(renderTabNode(tab));
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
  return winNode;
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
    windowsContainer.appendChild(renderWindowNode(window2, visibleTabs, query));
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3NoYXJlZC91dGlscy50cyIsICIuLi8uLi9zcmMvc2hhcmVkL3N0cmF0ZWd5UmVnaXN0cnkudHMiLCAiLi4vLi4vc3JjL3NoYXJlZC9sb2dnZXIudHMiLCAiLi4vLi4vc3JjL3NoYXJlZC91cmxDYWNoZS50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9ncm91cGluZ1N0cmF0ZWdpZXMudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvc29ydGluZ1N0cmF0ZWdpZXMudHMiLCAiLi4vLi4vc3JjL3VpL2xvY2FsU3RhdGUudHMiLCAiLi4vLi4vc3JjL3VpL2NvbW1vbi50cyIsICIuLi8uLi9zcmMvdWkvcG9wdXAudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IFByZWZlcmVuY2VzLCBTb3J0aW5nU3RyYXRlZ3ksIFRhYk1ldGFkYXRhIH0gZnJvbSBcIi4vdHlwZXMuanNcIjtcblxuZXhwb3J0IGNvbnN0IG1hcENocm9tZVRhYiA9ICh0YWI6IGNocm9tZS50YWJzLlRhYik6IFRhYk1ldGFkYXRhIHwgbnVsbCA9PiB7XG4gIGlmICghdGFiLmlkIHx8IHRhYi5pZCA9PT0gY2hyb21lLnRhYnMuVEFCX0lEX05PTkUgfHwgIXRhYi53aW5kb3dJZCkgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7XG4gICAgaWQ6IHRhYi5pZCxcbiAgICB3aW5kb3dJZDogdGFiLndpbmRvd0lkLFxuICAgIHRpdGxlOiB0YWIudGl0bGUgfHwgXCJVbnRpdGxlZFwiLFxuICAgIHVybDogdGFiLnBlbmRpbmdVcmwgfHwgdGFiLnVybCB8fCBcImFib3V0OmJsYW5rXCIsXG4gICAgcGlubmVkOiBCb29sZWFuKHRhYi5waW5uZWQpLFxuICAgIGxhc3RBY2Nlc3NlZDogdGFiLmxhc3RBY2Nlc3NlZCxcbiAgICBvcGVuZXJUYWJJZDogdGFiLm9wZW5lclRhYklkID8/IHVuZGVmaW5lZCxcbiAgICBmYXZJY29uVXJsOiB0YWIuZmF2SWNvblVybCxcbiAgICBncm91cElkOiB0YWIuZ3JvdXBJZCxcbiAgICBpbmRleDogdGFiLmluZGV4LFxuICAgIGFjdGl2ZTogdGFiLmFjdGl2ZSxcbiAgICBzdGF0dXM6IHRhYi5zdGF0dXMsXG4gICAgc2VsZWN0ZWQ6IHRhYi5oaWdobGlnaHRlZFxuICB9O1xufTtcblxuZXhwb3J0IGNvbnN0IGdldFN0b3JlZFByZWZlcmVuY2VzID0gYXN5bmMgKCk6IFByb21pc2U8UHJlZmVyZW5jZXMgfCBudWxsPiA9PiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChcInByZWZlcmVuY2VzXCIsIChpdGVtcykgPT4ge1xuICAgICAgcmVzb2x2ZSgoaXRlbXNbXCJwcmVmZXJlbmNlc1wiXSBhcyBQcmVmZXJlbmNlcykgPz8gbnVsbCk7XG4gICAgfSk7XG4gIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IGFzQXJyYXkgPSA8VD4odmFsdWU6IHVua25vd24pOiBUW10gPT4ge1xuICAgIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkgcmV0dXJuIHZhbHVlIGFzIFRbXTtcbiAgICByZXR1cm4gW107XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gZXNjYXBlSHRtbCh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBpZiAoIXRleHQpIHJldHVybiAnJztcbiAgcmV0dXJuIHRleHRcbiAgICAucmVwbGFjZSgvJi9nLCAnJmFtcDsnKVxuICAgIC5yZXBsYWNlKC88L2csICcmbHQ7JylcbiAgICAucmVwbGFjZSgvPi9nLCAnJmd0OycpXG4gICAgLnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKVxuICAgIC5yZXBsYWNlKC8nL2csICcmIzAzOTsnKTtcbn1cbiIsICJpbXBvcnQgeyBDdXN0b21TdHJhdGVneSwgU29ydGluZ1N0cmF0ZWd5IH0gZnJvbSBcIi4vdHlwZXMuanNcIjtcblxuZXhwb3J0IGludGVyZmFjZSBTdHJhdGVneURlZmluaXRpb24ge1xuICAgIGlkOiBTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmc7XG4gICAgbGFiZWw6IHN0cmluZztcbiAgICBpc0dyb3VwaW5nOiBib29sZWFuO1xuICAgIGlzU29ydGluZzogYm9vbGVhbjtcbiAgICB0YWdzPzogc3RyaW5nW107XG4gICAgYXV0b1J1bj86IGJvb2xlYW47XG4gICAgaXNDdXN0b20/OiBib29sZWFuO1xufVxuXG4vLyBSZXN0b3JlZCBzdHJhdGVnaWVzIG1hdGNoaW5nIGJhY2tncm91bmQgY2FwYWJpbGl0aWVzLlxuZXhwb3J0IGNvbnN0IFNUUkFURUdJRVM6IFN0cmF0ZWd5RGVmaW5pdGlvbltdID0gW1xuICAgIHsgaWQ6IFwiZG9tYWluXCIsIGxhYmVsOiBcIkRvbWFpblwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwiZG9tYWluX2Z1bGxcIiwgbGFiZWw6IFwiRnVsbCBEb21haW5cIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInRvcGljXCIsIGxhYmVsOiBcIlRvcGljXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJjb250ZXh0XCIsIGxhYmVsOiBcIkNvbnRleHRcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImxpbmVhZ2VcIiwgbGFiZWw6IFwiTGluZWFnZVwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwicGlubmVkXCIsIGxhYmVsOiBcIlBpbm5lZFwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwicmVjZW5jeVwiLCBsYWJlbDogXCJSZWNlbmN5XCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJhZ2VcIiwgbGFiZWw6IFwiQWdlXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJ1cmxcIiwgbGFiZWw6IFwiVVJMXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJuZXN0aW5nXCIsIGxhYmVsOiBcIk5lc3RpbmdcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInRpdGxlXCIsIGxhYmVsOiBcIlRpdGxlXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG5dO1xuXG5leHBvcnQgY29uc3QgZ2V0U3RyYXRlZ2llcyA9IChjdXN0b21TdHJhdGVnaWVzPzogQ3VzdG9tU3RyYXRlZ3lbXSk6IFN0cmF0ZWd5RGVmaW5pdGlvbltdID0+IHtcbiAgICBpZiAoIWN1c3RvbVN0cmF0ZWdpZXMgfHwgY3VzdG9tU3RyYXRlZ2llcy5sZW5ndGggPT09IDApIHJldHVybiBTVFJBVEVHSUVTO1xuXG4gICAgLy8gQ3VzdG9tIHN0cmF0ZWdpZXMgY2FuIG92ZXJyaWRlIGJ1aWx0LWlucyBpZiBJRHMgbWF0Y2gsIG9yIGFkZCBuZXcgb25lcy5cbiAgICBjb25zdCBjb21iaW5lZCA9IFsuLi5TVFJBVEVHSUVTXTtcblxuICAgIGN1c3RvbVN0cmF0ZWdpZXMuZm9yRWFjaChjdXN0b20gPT4ge1xuICAgICAgICBjb25zdCBleGlzdGluZ0luZGV4ID0gY29tYmluZWQuZmluZEluZGV4KHMgPT4gcy5pZCA9PT0gY3VzdG9tLmlkKTtcblxuICAgICAgICAvLyBEZXRlcm1pbmUgY2FwYWJpbGl0aWVzIGJhc2VkIG9uIHJ1bGVzIHByZXNlbmNlXG4gICAgICAgIGNvbnN0IGhhc0dyb3VwaW5nID0gKGN1c3RvbS5ncm91cGluZ1J1bGVzICYmIGN1c3RvbS5ncm91cGluZ1J1bGVzLmxlbmd0aCA+IDApIHx8IChjdXN0b20ucnVsZXMgJiYgY3VzdG9tLnJ1bGVzLmxlbmd0aCA+IDApIHx8IGZhbHNlO1xuICAgICAgICBjb25zdCBoYXNTb3J0aW5nID0gKGN1c3RvbS5zb3J0aW5nUnVsZXMgJiYgY3VzdG9tLnNvcnRpbmdSdWxlcy5sZW5ndGggPiAwKSB8fCAoY3VzdG9tLnJ1bGVzICYmIGN1c3RvbS5ydWxlcy5sZW5ndGggPiAwKSB8fCBmYWxzZTtcblxuICAgICAgICBjb25zdCB0YWdzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBpZiAoaGFzR3JvdXBpbmcpIHRhZ3MucHVzaChcImdyb3VwXCIpO1xuICAgICAgICBpZiAoaGFzU29ydGluZykgdGFncy5wdXNoKFwic29ydFwiKTtcblxuICAgICAgICBjb25zdCBkZWZpbml0aW9uOiBTdHJhdGVneURlZmluaXRpb24gPSB7XG4gICAgICAgICAgICBpZDogY3VzdG9tLmlkLFxuICAgICAgICAgICAgbGFiZWw6IGN1c3RvbS5sYWJlbCxcbiAgICAgICAgICAgIGlzR3JvdXBpbmc6IGhhc0dyb3VwaW5nLFxuICAgICAgICAgICAgaXNTb3J0aW5nOiBoYXNTb3J0aW5nLFxuICAgICAgICAgICAgdGFnczogdGFncyxcbiAgICAgICAgICAgIGF1dG9SdW46IGN1c3RvbS5hdXRvUnVuLFxuICAgICAgICAgICAgaXNDdXN0b206IHRydWVcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAoZXhpc3RpbmdJbmRleCAhPT0gLTEpIHtcbiAgICAgICAgICAgIGNvbWJpbmVkW2V4aXN0aW5nSW5kZXhdID0gZGVmaW5pdGlvbjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbWJpbmVkLnB1c2goZGVmaW5pdGlvbik7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBjb21iaW5lZDtcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRTdHJhdGVneSA9IChpZDogU29ydGluZ1N0cmF0ZWd5IHwgc3RyaW5nKTogU3RyYXRlZ3lEZWZpbml0aW9uIHwgdW5kZWZpbmVkID0+IFNUUkFURUdJRVMuZmluZChzID0+IHMuaWQgPT09IGlkKTtcbiIsICJpbXBvcnQgeyBMb2dFbnRyeSwgTG9nTGV2ZWwsIFByZWZlcmVuY2VzIH0gZnJvbSBcIi4vdHlwZXMuanNcIjtcblxuY29uc3QgUFJFRklYID0gXCJbVGFiU29ydGVyXVwiO1xuXG5jb25zdCBMRVZFTF9QUklPUklUWTogUmVjb3JkPExvZ0xldmVsLCBudW1iZXI+ID0ge1xuICBkZWJ1ZzogMCxcbiAgaW5mbzogMSxcbiAgd2FybjogMixcbiAgZXJyb3I6IDMsXG4gIGNyaXRpY2FsOiA0XG59O1xuXG5sZXQgY3VycmVudExldmVsOiBMb2dMZXZlbCA9IFwiaW5mb1wiO1xubGV0IGxvZ3M6IExvZ0VudHJ5W10gPSBbXTtcbmNvbnN0IE1BWF9MT0dTID0gMTAwMDtcbmNvbnN0IFNUT1JBR0VfS0VZID0gXCJzZXNzaW9uTG9nc1wiO1xuXG5jb25zdCBTRU5TSVRJVkVfS0VZUyA9IC9wYXNzd29yZHxzZWNyZXR8dG9rZW58Y3JlZGVudGlhbHxjb29raWV8c2Vzc2lvbnxhdXRob3JpemF0aW9ufCgoYXBpfGFjY2Vzc3xzZWNyZXR8cHJpdmF0ZSlbLV9dP2tleSkvaTtcblxuY29uc3Qgc2FuaXRpemVDb250ZXh0ID0gKGNvbnRleHQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQgPT4ge1xuICAgIGlmICghY29udGV4dCkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB0cnkge1xuICAgICAgICAvLyBEZWVwIGNsb25lIHRvIGVuc3VyZSB3ZSBkb24ndCBtb2RpZnkgdGhlIG9yaWdpbmFsIG9iamVjdCBhbmQgcmVtb3ZlIG5vbi1zZXJpYWxpemFibGUgZGF0YVxuICAgICAgICBjb25zdCBqc29uID0gSlNPTi5zdHJpbmdpZnkoY29udGV4dCk7XG4gICAgICAgIGNvbnN0IG9iaiA9IEpTT04ucGFyc2UoanNvbik7XG5cbiAgICAgICAgY29uc3QgcmVkYWN0ID0gKG86IGFueSkgPT4ge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBvICE9PSAnb2JqZWN0JyB8fCBvID09PSBudWxsKSByZXR1cm47XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGsgaW4gbykge1xuICAgICAgICAgICAgICAgIGlmIChTRU5TSVRJVkVfS0VZUy50ZXN0KGspKSB7XG4gICAgICAgICAgICAgICAgICAgIG9ba10gPSAnW1JFREFDVEVEXSc7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVkYWN0KG9ba10pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgcmVkYWN0KG9iaik7XG4gICAgICAgIHJldHVybiBvYmo7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICByZXR1cm4geyBlcnJvcjogXCJGYWlsZWQgdG8gc2FuaXRpemUgY29udGV4dFwiIH07XG4gICAgfVxufTtcblxuLy8gU2FmZSBjb250ZXh0IGNoZWNrXG5jb25zdCBpc1NlcnZpY2VXb3JrZXIgPSB0eXBlb2Ygc2VsZiAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVvZiAoc2VsZiBhcyBhbnkpLlNlcnZpY2VXb3JrZXJHbG9iYWxTY29wZSAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYgaW5zdGFuY2VvZiAoc2VsZiBhcyBhbnkpLlNlcnZpY2VXb3JrZXJHbG9iYWxTY29wZTtcbmxldCBpc1NhdmluZyA9IGZhbHNlO1xubGV0IHBlbmRpbmdTYXZlID0gZmFsc2U7XG5sZXQgc2F2ZVRpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsO1xuXG5jb25zdCBkb1NhdmUgPSAoKSA9PiB7XG4gICAgaWYgKCFpc1NlcnZpY2VXb3JrZXIgfHwgIWNocm9tZT8uc3RvcmFnZT8uc2Vzc2lvbiB8fCBpc1NhdmluZykge1xuICAgICAgICBwZW5kaW5nU2F2ZSA9IHRydWU7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpc1NhdmluZyA9IHRydWU7XG4gICAgcGVuZGluZ1NhdmUgPSBmYWxzZTtcblxuICAgIGNocm9tZS5zdG9yYWdlLnNlc3Npb24uc2V0KHsgW1NUT1JBR0VfS0VZXTogbG9ncyB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgaXNTYXZpbmcgPSBmYWxzZTtcbiAgICAgICAgaWYgKHBlbmRpbmdTYXZlKSB7XG4gICAgICAgICAgICBzYXZlTG9nc1RvU3RvcmFnZSgpO1xuICAgICAgICB9XG4gICAgfSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBzYXZlIGxvZ3NcIiwgZXJyKTtcbiAgICAgICAgaXNTYXZpbmcgPSBmYWxzZTtcbiAgICB9KTtcbn07XG5cbmNvbnN0IHNhdmVMb2dzVG9TdG9yYWdlID0gKCkgPT4ge1xuICAgIGlmIChzYXZlVGltZXIpIGNsZWFyVGltZW91dChzYXZlVGltZXIpO1xuICAgIHNhdmVUaW1lciA9IHNldFRpbWVvdXQoZG9TYXZlLCAxMDAwKTtcbn07XG5cbmxldCByZXNvbHZlTG9nZ2VyUmVhZHk6ICgpID0+IHZvaWQ7XG5leHBvcnQgY29uc3QgbG9nZ2VyUmVhZHkgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcbiAgICByZXNvbHZlTG9nZ2VyUmVhZHkgPSByZXNvbHZlO1xufSk7XG5cbmV4cG9ydCBjb25zdCBpbml0TG9nZ2VyID0gYXN5bmMgKCkgPT4ge1xuICAgIGlmIChpc1NlcnZpY2VXb3JrZXIgJiYgY2hyb21lPy5zdG9yYWdlPy5zZXNzaW9uKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjaHJvbWUuc3RvcmFnZS5zZXNzaW9uLmdldChTVE9SQUdFX0tFWSk7XG4gICAgICAgICAgICBpZiAocmVzdWx0W1NUT1JBR0VfS0VZXSAmJiBBcnJheS5pc0FycmF5KHJlc3VsdFtTVE9SQUdFX0tFWV0pKSB7XG4gICAgICAgICAgICAgICAgbG9ncyA9IHJlc3VsdFtTVE9SQUdFX0tFWV07XG4gICAgICAgICAgICAgICAgaWYgKGxvZ3MubGVuZ3RoID4gTUFYX0xPR1MpIGxvZ3MgPSBsb2dzLnNsaWNlKDAsIE1BWF9MT0dTKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byByZXN0b3JlIGxvZ3NcIiwgZSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKHJlc29sdmVMb2dnZXJSZWFkeSkgcmVzb2x2ZUxvZ2dlclJlYWR5KCk7XG59O1xuXG5leHBvcnQgY29uc3Qgc2V0TG9nZ2VyUHJlZmVyZW5jZXMgPSAocHJlZnM6IFByZWZlcmVuY2VzKSA9PiB7XG4gIGlmIChwcmVmcy5sb2dMZXZlbCkge1xuICAgIGN1cnJlbnRMZXZlbCA9IHByZWZzLmxvZ0xldmVsO1xuICB9IGVsc2UgaWYgKHByZWZzLmRlYnVnKSB7XG4gICAgY3VycmVudExldmVsID0gXCJkZWJ1Z1wiO1xuICB9IGVsc2Uge1xuICAgIGN1cnJlbnRMZXZlbCA9IFwiaW5mb1wiO1xuICB9XG59O1xuXG5jb25zdCBzaG91bGRMb2cgPSAobGV2ZWw6IExvZ0xldmVsKTogYm9vbGVhbiA9PiB7XG4gIHJldHVybiBMRVZFTF9QUklPUklUWVtsZXZlbF0gPj0gTEVWRUxfUFJJT1JJVFlbY3VycmVudExldmVsXTtcbn07XG5cbmNvbnN0IGZvcm1hdE1lc3NhZ2UgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgcmV0dXJuIGNvbnRleHQgPyBgJHttZXNzYWdlfSA6OiAke0pTT04uc3RyaW5naWZ5KGNvbnRleHQpfWAgOiBtZXNzYWdlO1xufTtcblxuY29uc3QgYWRkTG9nID0gKGxldmVsOiBMb2dMZXZlbCwgbWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgaWYgKHNob3VsZExvZyhsZXZlbCkpIHtcbiAgICAgIGNvbnN0IGVudHJ5OiBMb2dFbnRyeSA9IHtcbiAgICAgICAgICB0aW1lc3RhbXA6IERhdGUubm93KCksXG4gICAgICAgICAgbGV2ZWwsXG4gICAgICAgICAgbWVzc2FnZSxcbiAgICAgICAgICBjb250ZXh0XG4gICAgICB9O1xuXG4gICAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSB7XG4gICAgICAgICAgbG9ncy51bnNoaWZ0KGVudHJ5KTtcbiAgICAgICAgICBpZiAobG9ncy5sZW5ndGggPiBNQVhfTE9HUykge1xuICAgICAgICAgICAgICBsb2dzLnBvcCgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBzYXZlTG9nc1RvU3RvcmFnZSgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBJbiBvdGhlciBjb250ZXh0cywgc2VuZCB0byBTV1xuICAgICAgICAgIGlmIChjaHJvbWU/LnJ1bnRpbWU/LnNlbmRNZXNzYWdlKSB7XG4gICAgICAgICAgICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiAnbG9nRW50cnknLCBwYXlsb2FkOiBlbnRyeSB9KS5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgIC8vIElnbm9yZSBpZiBtZXNzYWdlIGZhaWxzIChlLmcuIGNvbnRleHQgaW52YWxpZGF0ZWQpXG4gICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgfVxuICB9XG59O1xuXG5leHBvcnQgY29uc3QgYWRkTG9nRW50cnkgPSAoZW50cnk6IExvZ0VudHJ5KSA9PiB7XG4gICAgaWYgKGlzU2VydmljZVdvcmtlcikge1xuICAgICAgICAvLyBFbnN1cmUgY29udGV4dCBpcyBzYW5pdGl6ZWQgYmVmb3JlIHN0b3JpbmdcbiAgICAgICAgY29uc3Qgc2FmZUNvbnRleHQgPSBzYW5pdGl6ZUNvbnRleHQoZW50cnkuY29udGV4dCk7XG4gICAgICAgIGNvbnN0IHNhZmVFbnRyeSA9IHsgLi4uZW50cnksIGNvbnRleHQ6IHNhZmVDb250ZXh0IH07XG5cbiAgICAgICAgbG9ncy51bnNoaWZ0KHNhZmVFbnRyeSk7XG4gICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSB7XG4gICAgICAgICAgICBsb2dzLnBvcCgpO1xuICAgICAgICB9XG4gICAgICAgIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG4gICAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGdldExvZ3MgPSAoKSA9PiBbLi4ubG9nc107XG5leHBvcnQgY29uc3QgY2xlYXJMb2dzID0gKCkgPT4ge1xuICAgIGxvZ3MubGVuZ3RoID0gMDtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSBzYXZlTG9nc1RvU3RvcmFnZSgpO1xufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0RlYnVnID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGlmIChzaG91bGRMb2coXCJkZWJ1Z1wiKSkge1xuICAgICAgY29uc3Qgc2FmZUNvbnRleHQgPSBzYW5pdGl6ZUNvbnRleHQoY29udGV4dCk7XG4gICAgICBhZGRMb2coXCJkZWJ1Z1wiLCBtZXNzYWdlLCBzYWZlQ29udGV4dCk7XG4gICAgICBjb25zb2xlLmRlYnVnKGAke1BSRUZJWH0gW0RFQlVHXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgc2FmZUNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nSW5mbyA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBpZiAoc2hvdWxkTG9nKFwiaW5mb1wiKSkge1xuICAgICAgY29uc3Qgc2FmZUNvbnRleHQgPSBzYW5pdGl6ZUNvbnRleHQoY29udGV4dCk7XG4gICAgICBhZGRMb2coXCJpbmZvXCIsIG1lc3NhZ2UsIHNhZmVDb250ZXh0KTtcbiAgICAgIGNvbnNvbGUuaW5mbyhgJHtQUkVGSVh9IFtJTkZPXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgc2FmZUNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nV2FybiA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBpZiAoc2hvdWxkTG9nKFwid2FyblwiKSkge1xuICAgICAgY29uc3Qgc2FmZUNvbnRleHQgPSBzYW5pdGl6ZUNvbnRleHQoY29udGV4dCk7XG4gICAgICBhZGRMb2coXCJ3YXJuXCIsIG1lc3NhZ2UsIHNhZmVDb250ZXh0KTtcbiAgICAgIGNvbnNvbGUud2FybihgJHtQUkVGSVh9IFtXQVJOXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgc2FmZUNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nRXJyb3IgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgaWYgKHNob3VsZExvZyhcImVycm9yXCIpKSB7XG4gICAgICBjb25zdCBzYWZlQ29udGV4dCA9IHNhbml0aXplQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGFkZExvZyhcImVycm9yXCIsIG1lc3NhZ2UsIHNhZmVDb250ZXh0KTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYCR7UFJFRklYfSBbRVJST1JdICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBzYWZlQ29udGV4dCl9YCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBsb2dDcml0aWNhbCA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBpZiAoc2hvdWxkTG9nKFwiY3JpdGljYWxcIikpIHtcbiAgICAgIGNvbnN0IHNhZmVDb250ZXh0ID0gc2FuaXRpemVDb250ZXh0KGNvbnRleHQpO1xuICAgICAgYWRkTG9nKFwiY3JpdGljYWxcIiwgbWVzc2FnZSwgc2FmZUNvbnRleHQpO1xuICAgICAgLy8gQ3JpdGljYWwgbG9ncyB1c2UgZXJyb3IgY29uc29sZSBidXQgd2l0aCBkaXN0aW5jdCBwcmVmaXggYW5kIG1heWJlIHN0eWxpbmcgaWYgc3VwcG9ydGVkXG4gICAgICBjb25zb2xlLmVycm9yKGAke1BSRUZJWH0gW0NSSVRJQ0FMXSBcdUQ4M0RcdURFQTggJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIHNhZmVDb250ZXh0KX1gKTtcbiAgfVxufTtcbiIsICJjb25zdCBob3N0bmFtZUNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcbmNvbnN0IE1BWF9DQUNIRV9TSVpFID0gMTAwMDtcblxuZXhwb3J0IGNvbnN0IGdldEhvc3RuYW1lID0gKHVybDogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gIGlmIChob3N0bmFtZUNhY2hlLmhhcyh1cmwpKSByZXR1cm4gaG9zdG5hbWVDYWNoZS5nZXQodXJsKSE7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBwYXJzZWQgPSBuZXcgVVJMKHVybCk7XG4gICAgY29uc3QgaG9zdG5hbWUgPSBwYXJzZWQuaG9zdG5hbWU7XG5cbiAgICBpZiAoaG9zdG5hbWVDYWNoZS5zaXplID49IE1BWF9DQUNIRV9TSVpFKSBob3N0bmFtZUNhY2hlLmNsZWFyKCk7XG4gICAgaG9zdG5hbWVDYWNoZS5zZXQodXJsLCBob3N0bmFtZSk7XG4gICAgcmV0dXJuIGhvc3RuYW1lO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufTtcbiIsICJpbXBvcnQgeyBHcm91cGluZ1N0cmF0ZWd5LCBTb3J0aW5nU3RyYXRlZ3ksIFRhYkdyb3VwLCBUYWJNZXRhZGF0YSwgQ3VzdG9tU3RyYXRlZ3ksIFN0cmF0ZWd5UnVsZSwgUnVsZUNvbmRpdGlvbiwgR3JvdXBpbmdSdWxlLCBTb3J0aW5nUnVsZSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGdldFN0cmF0ZWdpZXMgfSBmcm9tIFwiLi4vc2hhcmVkL3N0cmF0ZWd5UmVnaXN0cnkuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tIFwiLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5pbXBvcnQgeyBnZXRIb3N0bmFtZSB9IGZyb20gXCIuLi9zaGFyZWQvdXJsQ2FjaGUuanNcIjtcblxubGV0IGN1c3RvbVN0cmF0ZWdpZXM6IEN1c3RvbVN0cmF0ZWd5W10gPSBbXTtcblxuZXhwb3J0IGNvbnN0IHNldEN1c3RvbVN0cmF0ZWdpZXMgPSAoc3RyYXRlZ2llczogQ3VzdG9tU3RyYXRlZ3lbXSkgPT4ge1xuICAgIGN1c3RvbVN0cmF0ZWdpZXMgPSBzdHJhdGVnaWVzO1xufTtcblxuZXhwb3J0IGNvbnN0IGdldEN1c3RvbVN0cmF0ZWdpZXMgPSAoKTogQ3VzdG9tU3RyYXRlZ3lbXSA9PiBjdXN0b21TdHJhdGVnaWVzO1xuXG5jb25zdCBDT0xPUlMgPSBbXCJncmV5XCIsIFwiYmx1ZVwiLCBcInJlZFwiLCBcInllbGxvd1wiLCBcImdyZWVuXCIsIFwicGlua1wiLCBcInB1cnBsZVwiLCBcImN5YW5cIiwgXCJvcmFuZ2VcIl07XG5cbmNvbnN0IHJlZ2V4Q2FjaGUgPSBuZXcgTWFwPHN0cmluZywgUmVnRXhwPigpO1xuXG5leHBvcnQgY29uc3QgZG9tYWluRnJvbVVybCA9ICh1cmw6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGhvc3RuYW1lID0gZ2V0SG9zdG5hbWUodXJsKTtcbiAgaWYgKCFob3N0bmFtZSkgcmV0dXJuIFwidW5rbm93blwiO1xuICByZXR1cm4gaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sIFwiXCIpO1xufTtcblxuZXhwb3J0IGNvbnN0IHN1YmRvbWFpbkZyb21VcmwgPSAodXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBob3N0bmFtZSA9IGdldEhvc3RuYW1lKHVybCk7XG4gIGlmICghaG9zdG5hbWUpIHJldHVybiBcIlwiO1xuXG4gIGNvbnN0IGhvc3QgPSBob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgXCJcIik7XG4gIGNvbnN0IHBhcnRzID0gaG9zdC5zcGxpdCgnLicpO1xuICBpZiAocGFydHMubGVuZ3RoID4gMikge1xuICAgICAgcmV0dXJuIHBhcnRzLnNsaWNlKDAsIHBhcnRzLmxlbmd0aCAtIDIpLmpvaW4oJy4nKTtcbiAgfVxuICByZXR1cm4gXCJcIjtcbn1cblxuY29uc3QgZ2V0TmVzdGVkUHJvcGVydHkgPSAob2JqOiB1bmtub3duLCBwYXRoOiBzdHJpbmcpOiB1bmtub3duID0+IHtcbiAgICBpZiAoIW9iaiB8fCB0eXBlb2Ygb2JqICE9PSAnb2JqZWN0JykgcmV0dXJuIHVuZGVmaW5lZDtcblxuICAgIGlmICghcGF0aC5pbmNsdWRlcygnLicpKSB7XG4gICAgICAgIHJldHVybiAob2JqIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtwYXRoXTtcbiAgICB9XG5cbiAgICBjb25zdCBwYXJ0cyA9IHBhdGguc3BsaXQoJy4nKTtcbiAgICBsZXQgY3VycmVudDogdW5rbm93biA9IG9iajtcblxuICAgIGZvciAoY29uc3Qga2V5IG9mIHBhcnRzKSB7XG4gICAgICAgIGlmICghY3VycmVudCB8fCB0eXBlb2YgY3VycmVudCAhPT0gJ29iamVjdCcpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIGN1cnJlbnQgPSAoY3VycmVudCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilba2V5XTtcbiAgICB9XG5cbiAgICByZXR1cm4gY3VycmVudDtcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRGaWVsZFZhbHVlID0gKHRhYjogVGFiTWV0YWRhdGEsIGZpZWxkOiBzdHJpbmcpOiBhbnkgPT4ge1xuICAgIHN3aXRjaChmaWVsZCkge1xuICAgICAgICBjYXNlICdpZCc6IHJldHVybiB0YWIuaWQ7XG4gICAgICAgIGNhc2UgJ2luZGV4JzogcmV0dXJuIHRhYi5pbmRleDtcbiAgICAgICAgY2FzZSAnd2luZG93SWQnOiByZXR1cm4gdGFiLndpbmRvd0lkO1xuICAgICAgICBjYXNlICdncm91cElkJzogcmV0dXJuIHRhYi5ncm91cElkO1xuICAgICAgICBjYXNlICd0aXRsZSc6IHJldHVybiB0YWIudGl0bGU7XG4gICAgICAgIGNhc2UgJ3VybCc6IHJldHVybiB0YWIudXJsO1xuICAgICAgICBjYXNlICdzdGF0dXMnOiByZXR1cm4gdGFiLnN0YXR1cztcbiAgICAgICAgY2FzZSAnYWN0aXZlJzogcmV0dXJuIHRhYi5hY3RpdmU7XG4gICAgICAgIGNhc2UgJ3NlbGVjdGVkJzogcmV0dXJuIHRhYi5zZWxlY3RlZDtcbiAgICAgICAgY2FzZSAncGlubmVkJzogcmV0dXJuIHRhYi5waW5uZWQ7XG4gICAgICAgIGNhc2UgJ29wZW5lclRhYklkJzogcmV0dXJuIHRhYi5vcGVuZXJUYWJJZDtcbiAgICAgICAgY2FzZSAnbGFzdEFjY2Vzc2VkJzogcmV0dXJuIHRhYi5sYXN0QWNjZXNzZWQ7XG4gICAgICAgIGNhc2UgJ2NvbnRleHQnOiByZXR1cm4gdGFiLmNvbnRleHQ7XG4gICAgICAgIGNhc2UgJ2dlbnJlJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uZ2VucmU7XG4gICAgICAgIGNhc2UgJ3NpdGVOYW1lJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uc2l0ZU5hbWU7XG4gICAgICAgIC8vIERlcml2ZWQgb3IgbWFwcGVkIGZpZWxkc1xuICAgICAgICBjYXNlICdkb21haW4nOiByZXR1cm4gZG9tYWluRnJvbVVybCh0YWIudXJsKTtcbiAgICAgICAgY2FzZSAnc3ViZG9tYWluJzogcmV0dXJuIHN1YmRvbWFpbkZyb21VcmwodGFiLnVybCk7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICByZXR1cm4gZ2V0TmVzdGVkUHJvcGVydHkodGFiLCBmaWVsZCk7XG4gICAgfVxufTtcblxuY29uc3Qgc3RyaXBUbGQgPSAoZG9tYWluOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gZG9tYWluLnJlcGxhY2UoL1xcLihjb218b3JnfGdvdnxuZXR8ZWR1fGlvKSQvaSwgXCJcIik7XG59O1xuXG5leHBvcnQgY29uc3Qgc2VtYW50aWNCdWNrZXQgPSAodGl0bGU6IHN0cmluZywgdXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBrZXkgPSBgJHt0aXRsZX0gJHt1cmx9YC50b0xvd2VyQ2FzZSgpO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiZG9jXCIpIHx8IGtleS5pbmNsdWRlcyhcInJlYWRtZVwiKSB8fCBrZXkuaW5jbHVkZXMoXCJndWlkZVwiKSkgcmV0dXJuIFwiRG9jc1wiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwibWFpbFwiKSB8fCBrZXkuaW5jbHVkZXMoXCJpbmJveFwiKSkgcmV0dXJuIFwiQ2hhdFwiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiZGFzaGJvYXJkXCIpIHx8IGtleS5pbmNsdWRlcyhcImNvbnNvbGVcIikpIHJldHVybiBcIkRhc2hcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImlzc3VlXCIpIHx8IGtleS5pbmNsdWRlcyhcInRpY2tldFwiKSkgcmV0dXJuIFwiVGFza3NcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImRyaXZlXCIpIHx8IGtleS5pbmNsdWRlcyhcInN0b3JhZ2VcIikpIHJldHVybiBcIkZpbGVzXCI7XG4gIHJldHVybiBcIk1pc2NcIjtcbn07XG5cbmV4cG9ydCBjb25zdCBuYXZpZ2F0aW9uS2V5ID0gKHRhYjogVGFiTWV0YWRhdGEpOiBzdHJpbmcgPT4ge1xuICBpZiAodGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gYGNoaWxkLW9mLSR7dGFiLm9wZW5lclRhYklkfWA7XG4gIH1cbiAgcmV0dXJuIGB3aW5kb3ctJHt0YWIud2luZG93SWR9YDtcbn07XG5cbmNvbnN0IGdldFJlY2VuY3lMYWJlbCA9IChsYXN0QWNjZXNzZWQ6IG51bWJlcik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gIGNvbnN0IGRpZmYgPSBub3cgLSBsYXN0QWNjZXNzZWQ7XG4gIGlmIChkaWZmIDwgMzYwMDAwMCkgcmV0dXJuIFwiSnVzdCBub3dcIjsgLy8gMWhcbiAgaWYgKGRpZmYgPCA4NjQwMDAwMCkgcmV0dXJuIFwiVG9kYXlcIjsgLy8gMjRoXG4gIGlmIChkaWZmIDwgMTcyODAwMDAwKSByZXR1cm4gXCJZZXN0ZXJkYXlcIjsgLy8gNDhoXG4gIGlmIChkaWZmIDwgNjA0ODAwMDAwKSByZXR1cm4gXCJUaGlzIFdlZWtcIjsgLy8gN2RcbiAgcmV0dXJuIFwiT2xkZXJcIjtcbn07XG5cbmNvbnN0IGNvbG9yRm9yS2V5ID0gKGtleTogc3RyaW5nLCBvZmZzZXQ6IG51bWJlcik6IHN0cmluZyA9PiBDT0xPUlNbTWF0aC5hYnMoaGFzaENvZGUoa2V5KSArIG9mZnNldCkgJSBDT0xPUlMubGVuZ3RoXTtcblxuY29uc3QgaGFzaENvZGUgPSAodmFsdWU6IHN0cmluZyk6IG51bWJlciA9PiB7XG4gIGxldCBoYXNoID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB2YWx1ZS5sZW5ndGg7IGkgKz0gMSkge1xuICAgIGhhc2ggPSAoaGFzaCA8PCA1KSAtIGhhc2ggKyB2YWx1ZS5jaGFyQ29kZUF0KGkpO1xuICAgIGhhc2ggfD0gMDtcbiAgfVxuICByZXR1cm4gaGFzaDtcbn07XG5cbnR5cGUgTGFiZWxHZW5lcmF0b3IgPSAoZmlyc3RUYWI6IFRhYk1ldGFkYXRhLCB0YWJzOiBUYWJNZXRhZGF0YVtdLCBhbGxUYWJzTWFwOiBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YT4pID0+IHN0cmluZyB8IG51bGw7XG5cbmNvbnN0IGJ1aWx0SW5MYWJlbFN0cmF0ZWdpZXM6IFJlY29yZDxzdHJpbmcsIExhYmVsR2VuZXJhdG9yPiA9IHtcbiAgZG9tYWluOiAoZmlyc3RUYWIsIHRhYnMpID0+IHtcbiAgICBjb25zdCBzaXRlTmFtZXMgPSBuZXcgU2V0KHRhYnMubWFwKHQgPT4gdC5jb250ZXh0RGF0YT8uc2l0ZU5hbWUpLmZpbHRlcihCb29sZWFuKSk7XG4gICAgaWYgKHNpdGVOYW1lcy5zaXplID09PSAxKSB7XG4gICAgICByZXR1cm4gc3RyaXBUbGQoQXJyYXkuZnJvbShzaXRlTmFtZXMpWzBdIGFzIHN0cmluZyk7XG4gICAgfVxuICAgIHJldHVybiBzdHJpcFRsZChkb21haW5Gcm9tVXJsKGZpcnN0VGFiLnVybCkpO1xuICB9LFxuICBkb21haW5fZnVsbDogKGZpcnN0VGFiKSA9PiBkb21haW5Gcm9tVXJsKGZpcnN0VGFiLnVybCksXG4gIHRvcGljOiAoZmlyc3RUYWIpID0+IHNlbWFudGljQnVja2V0KGZpcnN0VGFiLnRpdGxlLCBmaXJzdFRhYi51cmwpLFxuICBsaW5lYWdlOiAoZmlyc3RUYWIsIF90YWJzLCBhbGxUYWJzTWFwKSA9PiB7XG4gICAgaWYgKGZpcnN0VGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGNvbnN0IHBhcmVudCA9IGFsbFRhYnNNYXAuZ2V0KGZpcnN0VGFiLm9wZW5lclRhYklkKTtcbiAgICAgIGlmIChwYXJlbnQpIHtcbiAgICAgICAgY29uc3QgcGFyZW50VGl0bGUgPSBwYXJlbnQudGl0bGUubGVuZ3RoID4gMjAgPyBwYXJlbnQudGl0bGUuc3Vic3RyaW5nKDAsIDIwKSArIFwiLi4uXCIgOiBwYXJlbnQudGl0bGU7XG4gICAgICAgIHJldHVybiBgRnJvbTogJHtwYXJlbnRUaXRsZX1gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGBGcm9tOiBUYWIgJHtmaXJzdFRhYi5vcGVuZXJUYWJJZH1gO1xuICAgIH1cbiAgICByZXR1cm4gYFdpbmRvdyAke2ZpcnN0VGFiLndpbmRvd0lkfWA7XG4gIH0sXG4gIGNvbnRleHQ6IChmaXJzdFRhYikgPT4gZmlyc3RUYWIuY29udGV4dCB8fCBcIlVuY2F0ZWdvcml6ZWRcIixcbiAgcGlubmVkOiAoZmlyc3RUYWIpID0+IGZpcnN0VGFiLnBpbm5lZCA/IFwiUGlubmVkXCIgOiBcIlVucGlubmVkXCIsXG4gIGFnZTogKGZpcnN0VGFiKSA9PiBnZXRSZWNlbmN5TGFiZWwoZmlyc3RUYWIubGFzdEFjY2Vzc2VkID8/IDApLFxuICB1cmw6ICgpID0+IFwiVVJMIEdyb3VwXCIsXG4gIHJlY2VuY3k6ICgpID0+IFwiVGltZSBHcm91cFwiLFxuICBuZXN0aW5nOiAoZmlyc3RUYWIpID0+IGZpcnN0VGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQgPyBcIkNoaWxkcmVuXCIgOiBcIlJvb3RzXCIsXG59O1xuXG4vLyBIZWxwZXIgdG8gZ2V0IGEgaHVtYW4tcmVhZGFibGUgbGFiZWwgY29tcG9uZW50IGZyb20gYSBzdHJhdGVneSBhbmQgYSBzZXQgb2YgdGFic1xuY29uc3QgZ2V0TGFiZWxDb21wb25lbnQgPSAoc3RyYXRlZ3k6IEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcsIHRhYnM6IFRhYk1ldGFkYXRhW10sIGFsbFRhYnNNYXA6IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhPik6IHN0cmluZyB8IG51bGwgPT4ge1xuICBjb25zdCBmaXJzdFRhYiA9IHRhYnNbMF07XG4gIGlmICghZmlyc3RUYWIpIHJldHVybiBcIlVua25vd25cIjtcblxuICAvLyBDaGVjayBjdXN0b20gc3RyYXRlZ2llcyBmaXJzdFxuICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneSk7XG4gIGlmIChjdXN0b20pIHtcbiAgICAgIHJldHVybiBncm91cGluZ0tleShmaXJzdFRhYiwgc3RyYXRlZ3kpO1xuICB9XG5cbiAgY29uc3QgZ2VuZXJhdG9yID0gYnVpbHRJbkxhYmVsU3RyYXRlZ2llc1tzdHJhdGVneV07XG4gIGlmIChnZW5lcmF0b3IpIHtcbiAgICByZXR1cm4gZ2VuZXJhdG9yKGZpcnN0VGFiLCB0YWJzLCBhbGxUYWJzTWFwKTtcbiAgfVxuXG4gIC8vIERlZmF1bHQgZmFsbGJhY2sgZm9yIGdlbmVyaWMgZmllbGRzXG4gIGNvbnN0IHZhbCA9IGdldEZpZWxkVmFsdWUoZmlyc3RUYWIsIHN0cmF0ZWd5KTtcbiAgaWYgKHZhbCAhPT0gdW5kZWZpbmVkICYmIHZhbCAhPT0gbnVsbCkge1xuICAgICAgcmV0dXJuIFN0cmluZyh2YWwpO1xuICB9XG4gIHJldHVybiBcIlVua25vd25cIjtcbn07XG5cbmNvbnN0IGdlbmVyYXRlTGFiZWwgPSAoXG4gIHN0cmF0ZWdpZXM6IChHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nKVtdLFxuICB0YWJzOiBUYWJNZXRhZGF0YVtdLFxuICBhbGxUYWJzTWFwOiBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YT5cbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGxhYmVscyA9IHN0cmF0ZWdpZXNcbiAgICAubWFwKHMgPT4gZ2V0TGFiZWxDb21wb25lbnQocywgdGFicywgYWxsVGFic01hcCkpXG4gICAgLmZpbHRlcihsID0+IGwgJiYgbCAhPT0gXCJVbmtub3duXCIgJiYgbCAhPT0gXCJHcm91cFwiICYmIGwgIT09IFwiVVJMIEdyb3VwXCIgJiYgbCAhPT0gXCJUaW1lIEdyb3VwXCIgJiYgbCAhPT0gXCJNaXNjXCIpO1xuXG4gIGlmIChsYWJlbHMubGVuZ3RoID09PSAwKSByZXR1cm4gXCJHcm91cFwiO1xuICByZXR1cm4gQXJyYXkuZnJvbShuZXcgU2V0KGxhYmVscykpLmpvaW4oXCIgLSBcIik7XG59O1xuXG5jb25zdCBnZXRTdHJhdGVneUNvbG9yUnVsZSA9IChzdHJhdGVneUlkOiBzdHJpbmcpOiBHcm91cGluZ1J1bGUgfCB1bmRlZmluZWQgPT4ge1xuICAgIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5SWQpO1xuICAgIGlmICghY3VzdG9tKSByZXR1cm4gdW5kZWZpbmVkO1xuXG4gICAgY29uc3QgZ3JvdXBpbmdSdWxlc0xpc3QgPSBhc0FycmF5PEdyb3VwaW5nUnVsZT4oY3VzdG9tLmdyb3VwaW5nUnVsZXMpO1xuICAgIC8vIEl0ZXJhdGUgbWFudWFsbHkgdG8gY2hlY2sgY29sb3JcbiAgICBmb3IgKGxldCBpID0gZ3JvdXBpbmdSdWxlc0xpc3QubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgY29uc3QgcnVsZSA9IGdyb3VwaW5nUnVsZXNMaXN0W2ldO1xuICAgICAgICBpZiAocnVsZSAmJiBydWxlLmNvbG9yICYmIHJ1bGUuY29sb3IgIT09ICdyYW5kb20nKSB7XG4gICAgICAgICAgICByZXR1cm4gcnVsZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xufTtcblxuY29uc3QgZ2V0Q29sb3JWYWx1ZUZyb21UYWJzID0gKFxuICB0YWJzOiBUYWJNZXRhZGF0YVtdLFxuICBjb2xvckZpZWxkOiBzdHJpbmcsXG4gIGNvbG9yVHJhbnNmb3JtPzogc3RyaW5nLFxuICBjb2xvclRyYW5zZm9ybVBhdHRlcm4/OiBzdHJpbmdcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGtleXMgPSB0YWJzXG4gICAgLm1hcCgodGFiKSA9PiB7XG4gICAgICBjb25zdCByYXcgPSBnZXRGaWVsZFZhbHVlKHRhYiwgY29sb3JGaWVsZCk7XG4gICAgICBsZXQga2V5ID0gcmF3ICE9PSB1bmRlZmluZWQgJiYgcmF3ICE9PSBudWxsID8gU3RyaW5nKHJhdykgOiBcIlwiO1xuICAgICAgaWYgKGtleSAmJiBjb2xvclRyYW5zZm9ybSkge1xuICAgICAgICBrZXkgPSBhcHBseVZhbHVlVHJhbnNmb3JtKGtleSwgY29sb3JUcmFuc2Zvcm0sIGNvbG9yVHJhbnNmb3JtUGF0dGVybik7XG4gICAgICB9XG4gICAgICByZXR1cm4ga2V5LnRyaW0oKTtcbiAgICB9KVxuICAgIC5maWx0ZXIoQm9vbGVhbik7XG5cbiAgaWYgKGtleXMubGVuZ3RoID09PSAwKSByZXR1cm4gXCJcIjtcblxuICAvLyBNYWtlIGNvbG9yaW5nIHN0YWJsZSBhbmQgaW5kZXBlbmRlbnQgZnJvbSB0YWIgcXVlcnkvb3JkZXIgY2h1cm4uXG4gIHJldHVybiBBcnJheS5mcm9tKG5ldyBTZXQoa2V5cykpLnNvcnQoKS5qb2luKFwifFwiKTtcbn07XG5cbmNvbnN0IHJlc29sdmVXaW5kb3dNb2RlID0gKG1vZGVzOiAoc3RyaW5nIHwgdW5kZWZpbmVkKVtdKTogXCJjdXJyZW50XCIgfCBcIm5ld1wiIHwgXCJjb21wb3VuZFwiID0+IHtcbiAgICBpZiAobW9kZXMuaW5jbHVkZXMoXCJuZXdcIikpIHJldHVybiBcIm5ld1wiO1xuICAgIGlmIChtb2Rlcy5pbmNsdWRlcyhcImNvbXBvdW5kXCIpKSByZXR1cm4gXCJjb21wb3VuZFwiO1xuICAgIHJldHVybiBcImN1cnJlbnRcIjtcbn07XG5cbmV4cG9ydCBjb25zdCBncm91cFRhYnMgPSAoXG4gIHRhYnM6IFRhYk1ldGFkYXRhW10sXG4gIHN0cmF0ZWdpZXM6IChTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmcpW11cbik6IFRhYkdyb3VwW10gPT4ge1xuICBjb25zdCBhdmFpbGFibGVTdHJhdGVnaWVzID0gZ2V0U3RyYXRlZ2llcyhjdXN0b21TdHJhdGVnaWVzKTtcbiAgY29uc3QgZWZmZWN0aXZlU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gYXZhaWxhYmxlU3RyYXRlZ2llcy5maW5kKGF2YWlsID0+IGF2YWlsLmlkID09PSBzKT8uaXNHcm91cGluZyk7XG4gIGNvbnN0IGJ1Y2tldHMgPSBuZXcgTWFwPHN0cmluZywgVGFiR3JvdXA+KCk7XG4gIGNvbnN0IGJ1Y2tldE1ldGEgPSBuZXcgTWFwPHN0cmluZywgeyB2YWx1ZUtleTogc3RyaW5nOyBhcHBsaWVkU3RyYXRlZ2llczogc3RyaW5nW10gfT4oKTtcblxuICBjb25zdCBhbGxUYWJzTWFwID0gbmV3IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhPigpO1xuICB0YWJzLmZvckVhY2godCA9PiBhbGxUYWJzTWFwLnNldCh0LmlkLCB0KSk7XG5cbiAgdGFicy5mb3JFYWNoKCh0YWIpID0+IHtcbiAgICBsZXQga2V5czogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBhcHBsaWVkU3RyYXRlZ2llczogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBjb2xsZWN0ZWRNb2Rlczogc3RyaW5nW10gPSBbXTtcblxuICAgIHRyeSB7XG4gICAgICAgIGZvciAoY29uc3QgcyBvZiBlZmZlY3RpdmVTdHJhdGVnaWVzKSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBnZXRHcm91cGluZ1Jlc3VsdCh0YWIsIHMpO1xuICAgICAgICAgICAgaWYgKHJlc3VsdC5rZXkgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBrZXlzLnB1c2goYCR7c306JHtyZXN1bHQua2V5fWApO1xuICAgICAgICAgICAgICAgIGFwcGxpZWRTdHJhdGVnaWVzLnB1c2gocyk7XG4gICAgICAgICAgICAgICAgY29sbGVjdGVkTW9kZXMucHVzaChyZXN1bHQubW9kZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGxvZ0RlYnVnKFwiRXJyb3IgZ2VuZXJhdGluZyBncm91cGluZyBrZXlcIiwgeyB0YWJJZDogdGFiLmlkLCBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICByZXR1cm47IC8vIFNraXAgdGhpcyB0YWIgb24gZXJyb3JcbiAgICB9XG5cbiAgICAvLyBJZiBubyBzdHJhdGVnaWVzIGFwcGxpZWQgKGUuZy4gYWxsIGZpbHRlcmVkIG91dCksIHNraXAgZ3JvdXBpbmcgZm9yIHRoaXMgdGFiXG4gICAgaWYgKGtleXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBlZmZlY3RpdmVNb2RlID0gcmVzb2x2ZVdpbmRvd01vZGUoY29sbGVjdGVkTW9kZXMpO1xuICAgIGNvbnN0IHZhbHVlS2V5ID0ga2V5cy5qb2luKFwiOjpcIik7XG4gICAgbGV0IGJ1Y2tldEtleSA9IFwiXCI7XG4gICAgaWYgKGVmZmVjdGl2ZU1vZGUgPT09ICdjdXJyZW50Jykge1xuICAgICAgICAgYnVja2V0S2V5ID0gYHdpbmRvdy0ke3RhYi53aW5kb3dJZH06OmAgKyB2YWx1ZUtleTtcbiAgICB9IGVsc2Uge1xuICAgICAgICAgYnVja2V0S2V5ID0gYGdsb2JhbDo6YCArIHZhbHVlS2V5O1xuICAgIH1cblxuICAgIGxldCBncm91cCA9IGJ1Y2tldHMuZ2V0KGJ1Y2tldEtleSk7XG4gICAgaWYgKCFncm91cCkge1xuICAgICAgbGV0IGdyb3VwQ29sb3IgPSBudWxsO1xuICAgICAgbGV0IGNvbG9yRmllbGQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgIGxldCBjb2xvclRyYW5zZm9ybTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgbGV0IGNvbG9yVHJhbnNmb3JtUGF0dGVybjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG4gICAgICBmb3IgKGNvbnN0IHNJZCBvZiBhcHBsaWVkU3RyYXRlZ2llcykge1xuICAgICAgICBjb25zdCBydWxlID0gZ2V0U3RyYXRlZ3lDb2xvclJ1bGUoc0lkKTtcbiAgICAgICAgaWYgKHJ1bGUpIHtcbiAgICAgICAgICAgIGdyb3VwQ29sb3IgPSBydWxlLmNvbG9yO1xuICAgICAgICAgICAgY29sb3JGaWVsZCA9IHJ1bGUuY29sb3JGaWVsZDtcbiAgICAgICAgICAgIGNvbG9yVHJhbnNmb3JtID0gcnVsZS5jb2xvclRyYW5zZm9ybTtcbiAgICAgICAgICAgIGNvbG9yVHJhbnNmb3JtUGF0dGVybiA9IHJ1bGUuY29sb3JUcmFuc2Zvcm1QYXR0ZXJuO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKGdyb3VwQ29sb3IgPT09ICdtYXRjaCcpIHtcbiAgICAgICAgZ3JvdXBDb2xvciA9IGNvbG9yRm9yS2V5KHZhbHVlS2V5LCAwKTtcbiAgICAgIH0gZWxzZSBpZiAoZ3JvdXBDb2xvciA9PT0gJ2ZpZWxkJyAmJiBjb2xvckZpZWxkKSB7XG4gICAgICAgIGNvbnN0IHZhbCA9IGdldEZpZWxkVmFsdWUodGFiLCBjb2xvckZpZWxkKTtcbiAgICAgICAgbGV0IGtleSA9IHZhbCAhPT0gdW5kZWZpbmVkICYmIHZhbCAhPT0gbnVsbCA/IFN0cmluZyh2YWwpIDogXCJcIjtcbiAgICAgICAgaWYgKGNvbG9yVHJhbnNmb3JtKSB7XG4gICAgICAgICAgICBrZXkgPSBhcHBseVZhbHVlVHJhbnNmb3JtKGtleSwgY29sb3JUcmFuc2Zvcm0sIGNvbG9yVHJhbnNmb3JtUGF0dGVybik7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBVc2Uga2V5IGV2ZW4gaWYgZW1wdHkgKHJlcHJlc2VudGluZyBtaXNzaW5nIGZpZWxkKSB0byBlbnN1cmUgY29uc2lzdGVudCBjb2xvcmluZ1xuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkoa2V5LCAwKTtcbiAgICAgIH0gZWxzZSBpZiAoIWdyb3VwQ29sb3IgfHwgZ3JvdXBDb2xvciA9PT0gJ2ZpZWxkJykge1xuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkodmFsdWVLZXksIDApO1xuICAgICAgfVxuXG4gICAgICBncm91cCA9IHtcbiAgICAgICAgaWQ6IGJ1Y2tldEtleSxcbiAgICAgICAgd2luZG93SWQ6IHRhYi53aW5kb3dJZCxcbiAgICAgICAgbGFiZWw6IFwiXCIsXG4gICAgICAgIGNvbG9yOiBncm91cENvbG9yLFxuICAgICAgICB0YWJzOiBbXSxcbiAgICAgICAgcmVhc29uOiBhcHBsaWVkU3RyYXRlZ2llcy5qb2luKFwiICsgXCIpLFxuICAgICAgICB3aW5kb3dNb2RlOiBlZmZlY3RpdmVNb2RlXG4gICAgICB9O1xuICAgICAgYnVja2V0cy5zZXQoYnVja2V0S2V5LCBncm91cCk7XG4gICAgICBidWNrZXRNZXRhLnNldChidWNrZXRLZXksIHsgdmFsdWVLZXksIGFwcGxpZWRTdHJhdGVnaWVzOiBbLi4uYXBwbGllZFN0cmF0ZWdpZXNdIH0pO1xuICAgIH1cbiAgICBncm91cC50YWJzLnB1c2godGFiKTtcbiAgfSk7XG5cbiAgY29uc3QgZ3JvdXBzID0gQXJyYXkuZnJvbShidWNrZXRzLnZhbHVlcygpKTtcbiAgZ3JvdXBzLmZvckVhY2goZ3JvdXAgPT4ge1xuICAgIGdyb3VwLmxhYmVsID0gZ2VuZXJhdGVMYWJlbChlZmZlY3RpdmVTdHJhdGVnaWVzLCBncm91cC50YWJzLCBhbGxUYWJzTWFwKTtcblxuICAgIGNvbnN0IG1ldGEgPSBidWNrZXRNZXRhLmdldChncm91cC5pZCk7XG4gICAgaWYgKCFtZXRhKSByZXR1cm47XG5cbiAgICBmb3IgKGNvbnN0IHNJZCBvZiBtZXRhLmFwcGxpZWRTdHJhdGVnaWVzKSB7XG4gICAgICBjb25zdCBydWxlID0gZ2V0U3RyYXRlZ3lDb2xvclJ1bGUoc0lkKTtcbiAgICAgIGlmICghcnVsZSkgY29udGludWU7XG5cbiAgICAgIGlmIChydWxlLmNvbG9yID09PSAnbWF0Y2gnKSB7XG4gICAgICAgIGdyb3VwLmNvbG9yID0gY29sb3JGb3JLZXkobWV0YS52YWx1ZUtleSwgMCk7XG4gICAgICB9IGVsc2UgaWYgKHJ1bGUuY29sb3IgPT09ICdmaWVsZCcgJiYgcnVsZS5jb2xvckZpZWxkKSB7XG4gICAgICAgIGNvbnN0IGNvbG9yVmFsdWUgPSBnZXRDb2xvclZhbHVlRnJvbVRhYnMoZ3JvdXAudGFicywgcnVsZS5jb2xvckZpZWxkLCBydWxlLmNvbG9yVHJhbnNmb3JtLCBydWxlLmNvbG9yVHJhbnNmb3JtUGF0dGVybik7XG4gICAgICAgIC8vIFVzZSBjb2xvclZhbHVlIGRpcmVjdGx5IGV2ZW4gaWYgZW1wdHlcbiAgICAgICAgZ3JvdXAuY29sb3IgPSBjb2xvckZvcktleShjb2xvclZhbHVlLCAwKTtcbiAgICAgIH0gZWxzZSBpZiAocnVsZS5jb2xvcikge1xuICAgICAgICBncm91cC5jb2xvciA9IHJ1bGUuY29sb3I7XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICB9XG4gIH0pO1xuXG4gIHJldHVybiBncm91cHM7XG59O1xuXG5jb25zdCBjaGVja1ZhbHVlTWF0Y2ggPSAoXG4gICAgb3BlcmF0b3I6IHN0cmluZyxcbiAgICByYXdWYWx1ZTogYW55LFxuICAgIHJ1bGVWYWx1ZTogc3RyaW5nXG4pOiB7IGlzTWF0Y2g6IGJvb2xlYW47IG1hdGNoT2JqOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsIH0gPT4ge1xuICAgIGNvbnN0IHZhbHVlU3RyID0gcmF3VmFsdWUgIT09IHVuZGVmaW5lZCAmJiByYXdWYWx1ZSAhPT0gbnVsbCA/IFN0cmluZyhyYXdWYWx1ZSkgOiBcIlwiO1xuICAgIGNvbnN0IHZhbHVlVG9DaGVjayA9IHZhbHVlU3RyLnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3QgcGF0dGVyblRvQ2hlY2sgPSBydWxlVmFsdWUgPyBydWxlVmFsdWUudG9Mb3dlckNhc2UoKSA6IFwiXCI7XG5cbiAgICBsZXQgaXNNYXRjaCA9IGZhbHNlO1xuICAgIGxldCBtYXRjaE9iajogUmVnRXhwRXhlY0FycmF5IHwgbnVsbCA9IG51bGw7XG5cbiAgICBzd2l0Y2ggKG9wZXJhdG9yKSB7XG4gICAgICAgIGNhc2UgJ2NvbnRhaW5zJzogaXNNYXRjaCA9IHZhbHVlVG9DaGVjay5pbmNsdWRlcyhwYXR0ZXJuVG9DaGVjayk7IGJyZWFrO1xuICAgICAgICBjYXNlICdkb2VzTm90Q29udGFpbic6IGlzTWF0Y2ggPSAhdmFsdWVUb0NoZWNrLmluY2x1ZGVzKHBhdHRlcm5Ub0NoZWNrKTsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2VxdWFscyc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2sgPT09IHBhdHRlcm5Ub0NoZWNrOyBicmVhaztcbiAgICAgICAgY2FzZSAnc3RhcnRzV2l0aCc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suc3RhcnRzV2l0aChwYXR0ZXJuVG9DaGVjayk7IGJyZWFrO1xuICAgICAgICBjYXNlICdlbmRzV2l0aCc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suZW5kc1dpdGgocGF0dGVyblRvQ2hlY2spOyBicmVhaztcbiAgICAgICAgY2FzZSAnZXhpc3RzJzogaXNNYXRjaCA9IHJhd1ZhbHVlICE9PSB1bmRlZmluZWQ7IGJyZWFrO1xuICAgICAgICBjYXNlICdkb2VzTm90RXhpc3QnOiBpc01hdGNoID0gcmF3VmFsdWUgPT09IHVuZGVmaW5lZDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2lzTnVsbCc6IGlzTWF0Y2ggPSByYXdWYWx1ZSA9PT0gbnVsbDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2lzTm90TnVsbCc6IGlzTWF0Y2ggPSByYXdWYWx1ZSAhPT0gbnVsbDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ21hdGNoZXMnOlxuICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKHJ1bGVWYWx1ZSwgJ2knKTtcbiAgICAgICAgICAgICAgICBtYXRjaE9iaiA9IHJlZ2V4LmV4ZWModmFsdWVTdHIpO1xuICAgICAgICAgICAgICAgIGlzTWF0Y2ggPSAhIW1hdGNoT2JqO1xuICAgICAgICAgICAgIH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHJldHVybiB7IGlzTWF0Y2gsIG1hdGNoT2JqIH07XG59O1xuXG5leHBvcnQgY29uc3QgY2hlY2tDb25kaXRpb24gPSAoY29uZGl0aW9uOiBSdWxlQ29uZGl0aW9uLCB0YWI6IFRhYk1ldGFkYXRhKTogYm9vbGVhbiA9PiB7XG4gICAgaWYgKCFjb25kaXRpb24pIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCByYXdWYWx1ZSA9IGdldEZpZWxkVmFsdWUodGFiLCBjb25kaXRpb24uZmllbGQpO1xuICAgIGNvbnN0IHsgaXNNYXRjaCB9ID0gY2hlY2tWYWx1ZU1hdGNoKGNvbmRpdGlvbi5vcGVyYXRvciwgcmF3VmFsdWUsIGNvbmRpdGlvbi52YWx1ZSk7XG4gICAgcmV0dXJuIGlzTWF0Y2g7XG59O1xuXG5leHBvcnQgY29uc3QgYXBwbHlWYWx1ZVRyYW5zZm9ybSA9ICh2YWw6IHN0cmluZywgdHJhbnNmb3JtOiBzdHJpbmcsIHBhdHRlcm4/OiBzdHJpbmcsIHJlcGxhY2VtZW50Pzogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICBpZiAoIXZhbCB8fCAhdHJhbnNmb3JtIHx8IHRyYW5zZm9ybSA9PT0gJ25vbmUnKSByZXR1cm4gdmFsO1xuXG4gICAgc3dpdGNoICh0cmFuc2Zvcm0pIHtcbiAgICAgICAgY2FzZSAnc3RyaXBUbGQnOlxuICAgICAgICAgICAgcmV0dXJuIHN0cmlwVGxkKHZhbCk7XG4gICAgICAgIGNhc2UgJ2xvd2VyY2FzZSc6XG4gICAgICAgICAgICByZXR1cm4gdmFsLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGNhc2UgJ3VwcGVyY2FzZSc6XG4gICAgICAgICAgICByZXR1cm4gdmFsLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgIGNhc2UgJ2ZpcnN0Q2hhcic6XG4gICAgICAgICAgICByZXR1cm4gdmFsLmNoYXJBdCgwKTtcbiAgICAgICAgY2FzZSAnZG9tYWluJzpcbiAgICAgICAgICAgIHJldHVybiBkb21haW5Gcm9tVXJsKHZhbCk7XG4gICAgICAgIGNhc2UgJ2hvc3RuYW1lJzpcbiAgICAgICAgICAgIGNvbnN0IGggPSBnZXRIb3N0bmFtZSh2YWwpO1xuICAgICAgICAgICAgcmV0dXJuIGggIT09IG51bGwgPyBoIDogdmFsO1xuICAgICAgICBjYXNlICdyZWdleCc6XG4gICAgICAgICAgICBpZiAocGF0dGVybikge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCByZWdleCA9IHJlZ2V4Q2FjaGUuZ2V0KHBhdHRlcm4pO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXJlZ2V4KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWdleCA9IG5ldyBSZWdFeHAocGF0dGVybik7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWdleENhY2hlLnNldChwYXR0ZXJuLCByZWdleCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbWF0Y2ggPSByZWdleC5leGVjKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGV4dHJhY3RlZCA9IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IG1hdGNoLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXh0cmFjdGVkICs9IG1hdGNoW2ldIHx8IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZXh0cmFjdGVkO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgIGxvZ0RlYnVnKFwiSW52YWxpZCByZWdleCBpbiB0cmFuc2Zvcm1cIiwgeyBwYXR0ZXJuOiBwYXR0ZXJuLCBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICAgICAgfVxuICAgICAgICBjYXNlICdyZWdleFJlcGxhY2UnOlxuICAgICAgICAgICAgIGlmIChwYXR0ZXJuKSB7XG4gICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAvLyBVc2luZyAnZycgZ2xvYmFsIGZsYWcgYnkgZGVmYXVsdCBmb3IgcmVwbGFjZW1lbnRcbiAgICAgICAgICAgICAgICAgICAgIHJldHVybiB2YWwucmVwbGFjZShuZXcgUmVnRXhwKHBhdHRlcm4sICdnJyksIHJlcGxhY2VtZW50IHx8IFwiXCIpO1xuICAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkludmFsaWQgcmVnZXggaW4gdHJhbnNmb3JtXCIsIHsgcGF0dGVybjogcGF0dGVybiwgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICAgICAgICAgICAgIHJldHVybiB2YWw7XG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgcmV0dXJuIHZhbDtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHJldHVybiB2YWw7XG4gICAgfVxufTtcblxuLyoqXG4gKiBFdmFsdWF0ZXMgbGVnYWN5IHJ1bGVzIChzaW1wbGUgQU5EL09SIGNvbmRpdGlvbnMgd2l0aG91dCBncm91cGluZy9maWx0ZXIgc2VwYXJhdGlvbikuXG4gKiBAZGVwcmVjYXRlZCBUaGlzIGxvZ2ljIGlzIGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5IHdpdGggb2xkIGN1c3RvbSBzdHJhdGVnaWVzLlxuICovXG5mdW5jdGlvbiBldmFsdWF0ZUxlZ2FjeVJ1bGVzKGxlZ2FjeVJ1bGVzOiBTdHJhdGVneVJ1bGVbXSwgdGFiOiBUYWJNZXRhZGF0YSk6IHN0cmluZyB8IG51bGwge1xuICAgIGNvbnN0IGxlZ2FjeVJ1bGVzTGlzdCA9IGFzQXJyYXk8U3RyYXRlZ3lSdWxlPihsZWdhY3lSdWxlcyk7XG4gICAgaWYgKGxlZ2FjeVJ1bGVzTGlzdC5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGxlZ2FjeVJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IHJhd1ZhbHVlID0gZ2V0RmllbGRWYWx1ZSh0YWIsIHJ1bGUuZmllbGQpO1xuICAgICAgICAgICAgY29uc3QgeyBpc01hdGNoLCBtYXRjaE9iaiB9ID0gY2hlY2tWYWx1ZU1hdGNoKHJ1bGUub3BlcmF0b3IsIHJhd1ZhbHVlLCBydWxlLnZhbHVlKTtcblxuICAgICAgICAgICAgaWYgKGlzTWF0Y2gpIHtcbiAgICAgICAgICAgICAgICBsZXQgcmVzdWx0ID0gcnVsZS5yZXN1bHQ7XG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoT2JqICYmIG1hdGNoT2JqLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBtYXRjaE9iai5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKG5ldyBSZWdFeHAoYFxcXFwkJHtpfWAsICdnJyksIG1hdGNoT2JqW2ldIHx8IFwiXCIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGV2YWx1YXRpbmcgbGVnYWN5IHJ1bGVzXCIsIHsgZXJyb3I6IFN0cmluZyhlcnJvcikgfSk7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgY29uc3QgZ2V0R3JvdXBpbmdSZXN1bHQgPSAodGFiOiBUYWJNZXRhZGF0YSwgc3RyYXRlZ3k6IEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcpOiB7IGtleTogc3RyaW5nIHwgbnVsbCwgbW9kZTogXCJjdXJyZW50XCIgfCBcIm5ld1wiIHwgXCJjb21wb3VuZFwiIH0gPT4ge1xuICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneSk7XG4gIGlmIChjdXN0b20pIHtcbiAgICAgIGNvbnN0IGZpbHRlckdyb3Vwc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb25bXT4oY3VzdG9tLmZpbHRlckdyb3Vwcyk7XG4gICAgICBjb25zdCBmaWx0ZXJzTGlzdCA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbj4oY3VzdG9tLmZpbHRlcnMpO1xuXG4gICAgICBsZXQgbWF0Y2ggPSBmYWxzZTtcblxuICAgICAgaWYgKGZpbHRlckdyb3Vwc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIC8vIE9SIGxvZ2ljXG4gICAgICAgICAgZm9yIChjb25zdCBncm91cCBvZiBmaWx0ZXJHcm91cHNMaXN0KSB7XG4gICAgICAgICAgICAgIGNvbnN0IGdyb3VwUnVsZXMgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGdyb3VwKTtcbiAgICAgICAgICAgICAgaWYgKGdyb3VwUnVsZXMubGVuZ3RoID09PSAwIHx8IGdyb3VwUnVsZXMuZXZlcnkociA9PiBjaGVja0NvbmRpdGlvbihyLCB0YWIpKSkge1xuICAgICAgICAgICAgICAgICAgbWF0Y2ggPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGZpbHRlcnNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAvLyBMZWdhY3kvU2ltcGxlIEFORCBsb2dpY1xuICAgICAgICAgIGlmIChmaWx0ZXJzTGlzdC5ldmVyeShmID0+IGNoZWNrQ29uZGl0aW9uKGYsIHRhYikpKSB7XG4gICAgICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIE5vIGZpbHRlcnMgLT4gTWF0Y2ggYWxsXG4gICAgICAgICAgbWF0Y2ggPSB0cnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoIW1hdGNoKSB7XG4gICAgICAgICAgcmV0dXJuIHsga2V5OiBudWxsLCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICAgICAgfVxuXG4gICAgICBjb25zdCBncm91cGluZ1J1bGVzTGlzdCA9IGFzQXJyYXk8R3JvdXBpbmdSdWxlPihjdXN0b20uZ3JvdXBpbmdSdWxlcyk7XG4gICAgICBpZiAoZ3JvdXBpbmdSdWxlc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgIGNvbnN0IG1vZGVzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZ3JvdXBpbmdSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXJ1bGUpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIGxldCB2YWwgPSBcIlwiO1xuICAgICAgICAgICAgICAgIGlmIChydWxlLnNvdXJjZSA9PT0gJ2ZpZWxkJykge1xuICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmF3ID0gZ2V0RmllbGRWYWx1ZSh0YWIsIHJ1bGUudmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgdmFsID0gcmF3ICE9PSB1bmRlZmluZWQgJiYgcmF3ICE9PSBudWxsID8gU3RyaW5nKHJhdykgOiBcIlwiO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICB2YWwgPSBydWxlLnZhbHVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh2YWwgJiYgcnVsZS50cmFuc2Zvcm0gJiYgcnVsZS50cmFuc2Zvcm0gIT09ICdub25lJykge1xuICAgICAgICAgICAgICAgICAgICB2YWwgPSBhcHBseVZhbHVlVHJhbnNmb3JtKHZhbCwgcnVsZS50cmFuc2Zvcm0sIHJ1bGUudHJhbnNmb3JtUGF0dGVybiwgcnVsZS50cmFuc2Zvcm1SZXBsYWNlbWVudCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHZhbCkge1xuICAgICAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChydWxlLndpbmRvd01vZGUpIG1vZGVzLnB1c2gocnVsZS53aW5kb3dNb2RlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgIGxvZ0RlYnVnKFwiRXJyb3IgYXBwbHlpbmcgZ3JvdXBpbmcgcnVsZXNcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIHJldHVybiB7IGtleTogcGFydHMuam9pbihcIiAtIFwiKSwgbW9kZTogcmVzb2x2ZVdpbmRvd01vZGUobW9kZXMpIH07XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7IGtleTogY3VzdG9tLmZhbGxiYWNrIHx8IFwiTWlzY1wiLCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICAgICAgfSBlbHNlIGlmIChjdXN0b20ucnVsZXMpIHtcbiAgICAgICAgICBjb25zdCByZXN1bHQgPSBldmFsdWF0ZUxlZ2FjeVJ1bGVzKGFzQXJyYXk8U3RyYXRlZ3lSdWxlPihjdXN0b20ucnVsZXMpLCB0YWIpO1xuICAgICAgICAgIGlmIChyZXN1bHQpIHJldHVybiB7IGtleTogcmVzdWx0LCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICAgICAgfVxuXG4gICAgICByZXR1cm4geyBrZXk6IGN1c3RvbS5mYWxsYmFjayB8fCBcIk1pc2NcIiwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgfVxuXG4gIC8vIEJ1aWx0LWluIHN0cmF0ZWdpZXNcbiAgbGV0IHNpbXBsZUtleTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIHN3aXRjaCAoc3RyYXRlZ3kpIHtcbiAgICBjYXNlIFwiZG9tYWluXCI6XG4gICAgY2FzZSBcImRvbWFpbl9mdWxsXCI6XG4gICAgICBzaW1wbGVLZXkgPSBkb21haW5Gcm9tVXJsKHRhYi51cmwpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInRvcGljXCI6XG4gICAgICBzaW1wbGVLZXkgPSBzZW1hbnRpY0J1Y2tldCh0YWIudGl0bGUsIHRhYi51cmwpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcImxpbmVhZ2VcIjpcbiAgICAgIHNpbXBsZUtleSA9IG5hdmlnYXRpb25LZXkodGFiKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJjb250ZXh0XCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIuY29udGV4dCB8fCBcIlVuY2F0ZWdvcml6ZWRcIjtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJwaW5uZWRcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi5waW5uZWQgPyBcInBpbm5lZFwiIDogXCJ1bnBpbm5lZFwiO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcImFnZVwiOlxuICAgICAgc2ltcGxlS2V5ID0gZ2V0UmVjZW5jeUxhYmVsKHRhYi5sYXN0QWNjZXNzZWQgPz8gMCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwidXJsXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIudXJsO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInRpdGxlXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIudGl0bGU7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwicmVjZW5jeVwiOlxuICAgICAgc2ltcGxlS2V5ID0gU3RyaW5nKHRhYi5sYXN0QWNjZXNzZWQgPz8gMCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwibmVzdGluZ1wiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQgPyBcImNoaWxkXCIgOiBcInJvb3RcIjtcbiAgICAgIGJyZWFrO1xuICAgIGRlZmF1bHQ6XG4gICAgICAgIGNvbnN0IHZhbCA9IGdldEZpZWxkVmFsdWUodGFiLCBzdHJhdGVneSk7XG4gICAgICAgIGlmICh2YWwgIT09IHVuZGVmaW5lZCAmJiB2YWwgIT09IG51bGwpIHtcbiAgICAgICAgICAgIHNpbXBsZUtleSA9IFN0cmluZyh2YWwpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2ltcGxlS2V5ID0gXCJVbmtub3duXCI7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gIH1cbiAgcmV0dXJuIHsga2V5OiBzaW1wbGVLZXksIG1vZGU6IFwiY3VycmVudFwiIH07XG59O1xuXG5leHBvcnQgY29uc3QgZ3JvdXBpbmdLZXkgPSAodGFiOiBUYWJNZXRhZGF0YSwgc3RyYXRlZ3k6IEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcpOiBzdHJpbmcgfCBudWxsID0+IHtcbiAgICByZXR1cm4gZ2V0R3JvdXBpbmdSZXN1bHQodGFiLCBzdHJhdGVneSkua2V5O1xufTtcblxuZnVuY3Rpb24gaXNDb250ZXh0RmllbGQoZmllbGQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBmaWVsZCA9PT0gJ2NvbnRleHQnIHx8IGZpZWxkID09PSAnZ2VucmUnIHx8IGZpZWxkID09PSAnc2l0ZU5hbWUnIHx8IGZpZWxkLnN0YXJ0c1dpdGgoJ2NvbnRleHREYXRhLicpO1xufVxuXG5leHBvcnQgY29uc3QgcmVxdWlyZXNDb250ZXh0QW5hbHlzaXMgPSAoc3RyYXRlZ3lJZHM6IChzdHJpbmcgfCBTb3J0aW5nU3RyYXRlZ3kpW10pOiBib29sZWFuID0+IHtcbiAgICAvLyBDaGVjayBpZiBcImNvbnRleHRcIiBzdHJhdGVneSBpcyBleHBsaWNpdGx5IHJlcXVlc3RlZFxuICAgIGlmIChzdHJhdGVneUlkcy5pbmNsdWRlcyhcImNvbnRleHRcIikpIHJldHVybiB0cnVlO1xuXG4gICAgY29uc3Qgc3RyYXRlZ2llcyA9IGdldFN0cmF0ZWdpZXMoY3VzdG9tU3RyYXRlZ2llcyk7XG4gICAgLy8gZmlsdGVyIG9ubHkgdGhvc2UgdGhhdCBtYXRjaCB0aGUgcmVxdWVzdGVkIElEc1xuICAgIGNvbnN0IGFjdGl2ZURlZnMgPSBzdHJhdGVnaWVzLmZpbHRlcihzID0+IHN0cmF0ZWd5SWRzLmluY2x1ZGVzKHMuaWQpKTtcblxuICAgIGZvciAoY29uc3QgZGVmIG9mIGFjdGl2ZURlZnMpIHtcbiAgICAgICAgLy8gSWYgaXQncyBhIGJ1aWx0LWluIHN0cmF0ZWd5IHRoYXQgbmVlZHMgY29udGV4dCAob25seSAnY29udGV4dCcgZG9lcylcbiAgICAgICAgaWYgKGRlZi5pZCA9PT0gJ2NvbnRleHQnKSByZXR1cm4gdHJ1ZTtcblxuICAgICAgICAvLyBJZiBpdCBpcyBhIGN1c3RvbSBzdHJhdGVneSAob3Igb3ZlcnJpZGVzIGJ1aWx0LWluKSwgY2hlY2sgaXRzIHJ1bGVzXG4gICAgICAgIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChjID0+IGMuaWQgPT09IGRlZi5pZCk7XG4gICAgICAgIGlmIChjdXN0b20pIHtcbiAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzTGlzdCA9IGFzQXJyYXk8R3JvdXBpbmdSdWxlPihjdXN0b20uZ3JvdXBpbmdSdWxlcyk7XG4gICAgICAgICAgICAgY29uc3Qgc29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KGN1c3RvbS5zb3J0aW5nUnVsZXMpO1xuICAgICAgICAgICAgIGNvbnN0IGdyb3VwU29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KGN1c3RvbS5ncm91cFNvcnRpbmdSdWxlcyk7XG4gICAgICAgICAgICAgY29uc3QgZmlsdGVyc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGN1c3RvbS5maWx0ZXJzKTtcbiAgICAgICAgICAgICBjb25zdCBmaWx0ZXJHcm91cHNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uW10+KGN1c3RvbS5maWx0ZXJHcm91cHMpO1xuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwUnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIHJ1bGUuc291cmNlID09PSAnZmllbGQnICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUudmFsdWUpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgcnVsZS5jb2xvciA9PT0gJ2ZpZWxkJyAmJiBydWxlLmNvbG9yRmllbGQgJiYgaXNDb250ZXh0RmllbGQocnVsZS5jb2xvckZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIHNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBmaWx0ZXJzTGlzdCkge1xuICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBpc0NvbnRleHRGaWVsZChydWxlLmZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBncm91cCBvZiBmaWx0ZXJHcm91cHNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGNvbnN0IGdyb3VwUnVsZXMgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGdyb3VwKTtcbiAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwUnVsZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59O1xuIiwgImltcG9ydCB7IFNvcnRpbmdTdHJhdGVneSwgVGFiTWV0YWRhdGEsIEN1c3RvbVN0cmF0ZWd5LCBTb3J0aW5nUnVsZSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGRvbWFpbkZyb21VcmwsIHNlbWFudGljQnVja2V0LCBuYXZpZ2F0aW9uS2V5LCBncm91cGluZ0tleSwgZ2V0RmllbGRWYWx1ZSwgZ2V0Q3VzdG9tU3RyYXRlZ2llcyB9IGZyb20gXCIuL2dyb3VwaW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcblxuLy8gSGVscGVyIHNjb3Jlc1xuZXhwb3J0IGNvbnN0IHJlY2VuY3lTY29yZSA9ICh0YWI6IFRhYk1ldGFkYXRhKSA9PiB0YWIubGFzdEFjY2Vzc2VkID8/IDA7XG5leHBvcnQgY29uc3QgaGllcmFyY2h5U2NvcmUgPSAodGFiOiBUYWJNZXRhZGF0YSkgPT4gKHRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkID8gMSA6IDApO1xuZXhwb3J0IGNvbnN0IHBpbm5lZFNjb3JlID0gKHRhYjogVGFiTWV0YWRhdGEpID0+ICh0YWIucGlubmVkID8gMCA6IDEpO1xuXG5leHBvcnQgY29uc3QgY29tcGFyZVZhbHVlcyA9IChhOiBhbnksIGI6IGFueSwgb3JkZXI6ICdhc2MnIHwgJ2Rlc2MnID0gJ2FzYycpOiBudW1iZXIgPT4ge1xuICAgIC8vIFRyZWF0IHVuZGVmaW5lZC9udWxsIGFzIFwiZ3JlYXRlclwiIHRoYW4gZXZlcnl0aGluZyBlbHNlIChwdXNoZWQgdG8gZW5kIGluIGFzYylcbiAgICBjb25zdCBpc0FOdWxsID0gYSA9PT0gdW5kZWZpbmVkIHx8IGEgPT09IG51bGw7XG4gICAgY29uc3QgaXNCTnVsbCA9IGIgPT09IHVuZGVmaW5lZCB8fCBiID09PSBudWxsO1xuXG4gICAgaWYgKGlzQU51bGwgJiYgaXNCTnVsbCkgcmV0dXJuIDA7XG4gICAgaWYgKGlzQU51bGwpIHJldHVybiAxOyAvLyBhID4gYiAoYSBpcyBudWxsKVxuICAgIGlmIChpc0JOdWxsKSByZXR1cm4gLTE7IC8vIGIgPiBhIChiIGlzIG51bGwpIC0+IGEgPCBiXG5cbiAgICBsZXQgcmVzdWx0ID0gMDtcbiAgICBpZiAoYSA8IGIpIHJlc3VsdCA9IC0xO1xuICAgIGVsc2UgaWYgKGEgPiBiKSByZXN1bHQgPSAxO1xuXG4gICAgcmV0dXJuIG9yZGVyID09PSAnZGVzYycgPyAtcmVzdWx0IDogcmVzdWx0O1xufTtcblxuZXhwb3J0IGNvbnN0IGNvbXBhcmVCeVNvcnRpbmdSdWxlcyA9IChydWxlczogU29ydGluZ1J1bGVbXSwgYTogVGFiTWV0YWRhdGEsIGI6IFRhYk1ldGFkYXRhKTogbnVtYmVyID0+IHtcbiAgICBjb25zdCBzb3J0UnVsZXNMaXN0ID0gYXNBcnJheTxTb3J0aW5nUnVsZT4ocnVsZXMpO1xuICAgIGlmIChzb3J0UnVsZXNMaXN0Lmxlbmd0aCA9PT0gMCkgcmV0dXJuIDA7XG5cbiAgICB0cnkge1xuICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2Ygc29ydFJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IHZhbEEgPSBnZXRGaWVsZFZhbHVlKGEsIHJ1bGUuZmllbGQpO1xuICAgICAgICAgICAgY29uc3QgdmFsQiA9IGdldEZpZWxkVmFsdWUoYiwgcnVsZS5maWVsZCk7XG5cbiAgICAgICAgICAgIGNvbnN0IGRpZmYgPSBjb21wYXJlVmFsdWVzKHZhbEEsIHZhbEIsIHJ1bGUub3JkZXIgfHwgJ2FzYycpO1xuICAgICAgICAgICAgaWYgKGRpZmYgIT09IDApIHJldHVybiBkaWZmO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGV2YWx1YXRpbmcgc29ydGluZyBydWxlc1wiLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgfVxuICAgIHJldHVybiAwO1xufTtcblxudHlwZSBDb21wYXJhdG9yID0gKGE6IFRhYk1ldGFkYXRhLCBiOiBUYWJNZXRhZGF0YSkgPT4gbnVtYmVyO1xuXG4vLyAtLS0gQnVpbHQtaW4gQ29tcGFyYXRvcnMgLS0tXG5cbmNvbnN0IGNvbXBhcmVSZWNlbmN5OiBDb21wYXJhdG9yID0gKGEsIGIpID0+IChiLmxhc3RBY2Nlc3NlZCA/PyAwKSAtIChhLmxhc3RBY2Nlc3NlZCA/PyAwKTtcbmNvbnN0IGNvbXBhcmVOZXN0aW5nOiBDb21wYXJhdG9yID0gKGEsIGIpID0+IGhpZXJhcmNoeVNjb3JlKGEpIC0gaGllcmFyY2h5U2NvcmUoYik7XG5jb25zdCBjb21wYXJlUGlubmVkOiBDb21wYXJhdG9yID0gKGEsIGIpID0+IHBpbm5lZFNjb3JlKGEpIC0gcGlubmVkU2NvcmUoYik7XG5jb25zdCBjb21wYXJlVGl0bGU6IENvbXBhcmF0b3IgPSAoYSwgYikgPT4gYS50aXRsZS5sb2NhbGVDb21wYXJlKGIudGl0bGUpO1xuY29uc3QgY29tcGFyZVVybDogQ29tcGFyYXRvciA9IChhLCBiKSA9PiBhLnVybC5sb2NhbGVDb21wYXJlKGIudXJsKTtcbmNvbnN0IGNvbXBhcmVDb250ZXh0OiBDb21wYXJhdG9yID0gKGEsIGIpID0+IChhLmNvbnRleHQgPz8gXCJcIikubG9jYWxlQ29tcGFyZShiLmNvbnRleHQgPz8gXCJcIik7XG5jb25zdCBjb21wYXJlRG9tYWluOiBDb21wYXJhdG9yID0gKGEsIGIpID0+IGRvbWFpbkZyb21VcmwoYS51cmwpLmxvY2FsZUNvbXBhcmUoZG9tYWluRnJvbVVybChiLnVybCkpO1xuY29uc3QgY29tcGFyZVRvcGljOiBDb21wYXJhdG9yID0gKGEsIGIpID0+IHNlbWFudGljQnVja2V0KGEudGl0bGUsIGEudXJsKS5sb2NhbGVDb21wYXJlKHNlbWFudGljQnVja2V0KGIudGl0bGUsIGIudXJsKSk7XG5jb25zdCBjb21wYXJlTGluZWFnZTogQ29tcGFyYXRvciA9IChhLCBiKSA9PiBuYXZpZ2F0aW9uS2V5KGEpLmxvY2FsZUNvbXBhcmUobmF2aWdhdGlvbktleShiKSk7XG5jb25zdCBjb21wYXJlQWdlOiBDb21wYXJhdG9yID0gKGEsIGIpID0+IChncm91cGluZ0tleShhLCBcImFnZVwiKSB8fCBcIlwiKS5sb2NhbGVDb21wYXJlKGdyb3VwaW5nS2V5KGIsIFwiYWdlXCIpIHx8IFwiXCIpO1xuXG5jb25zdCBzdHJhdGVneVJlZ2lzdHJ5OiBSZWNvcmQ8c3RyaW5nLCBDb21wYXJhdG9yPiA9IHtcbiAgcmVjZW5jeTogY29tcGFyZVJlY2VuY3ksXG4gIG5lc3Rpbmc6IGNvbXBhcmVOZXN0aW5nLFxuICBwaW5uZWQ6IGNvbXBhcmVQaW5uZWQsXG4gIHRpdGxlOiBjb21wYXJlVGl0bGUsXG4gIHVybDogY29tcGFyZVVybCxcbiAgY29udGV4dDogY29tcGFyZUNvbnRleHQsXG4gIGRvbWFpbjogY29tcGFyZURvbWFpbixcbiAgZG9tYWluX2Z1bGw6IGNvbXBhcmVEb21haW4sXG4gIHRvcGljOiBjb21wYXJlVG9waWMsXG4gIGxpbmVhZ2U6IGNvbXBhcmVMaW5lYWdlLFxuICBhZ2U6IGNvbXBhcmVBZ2UsXG59O1xuXG4vLyAtLS0gQ3VzdG9tIFN0cmF0ZWd5IEV2YWx1YXRpb24gLS0tXG5cbmNvbnN0IGV2YWx1YXRlQ3VzdG9tU3RyYXRlZ3kgPSAoc3RyYXRlZ3k6IHN0cmluZywgYTogVGFiTWV0YWRhdGEsIGI6IFRhYk1ldGFkYXRhKTogbnVtYmVyIHwgbnVsbCA9PiB7XG4gIGNvbnN0IGN1c3RvbVN0cmF0cyA9IGdldEN1c3RvbVN0cmF0ZWdpZXMoKTtcbiAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneSk7XG5cbiAgaWYgKCFjdXN0b20pIHJldHVybiBudWxsO1xuXG4gIGNvbnN0IHNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihjdXN0b20uc29ydGluZ1J1bGVzKTtcbiAgaWYgKHNvcnRSdWxlc0xpc3QubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcblxuICByZXR1cm4gY29tcGFyZUJ5U29ydGluZ1J1bGVzKHNvcnRSdWxlc0xpc3QsIGEsIGIpO1xufTtcblxuLy8gLS0tIEdlbmVyaWMgRmFsbGJhY2sgLS0tXG5cbmNvbnN0IGV2YWx1YXRlR2VuZXJpY1N0cmF0ZWd5ID0gKHN0cmF0ZWd5OiBzdHJpbmcsIGE6IFRhYk1ldGFkYXRhLCBiOiBUYWJNZXRhZGF0YSk6IG51bWJlciA9PiB7XG4gICAgLy8gQ2hlY2sgaWYgaXQncyBhIGdlbmVyaWMgZmllbGQgZmlyc3RcbiAgICBjb25zdCB2YWxBID0gZ2V0RmllbGRWYWx1ZShhLCBzdHJhdGVneSk7XG4gICAgY29uc3QgdmFsQiA9IGdldEZpZWxkVmFsdWUoYiwgc3RyYXRlZ3kpO1xuXG4gICAgaWYgKHZhbEEgIT09IHVuZGVmaW5lZCAmJiB2YWxCICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgaWYgKHZhbEEgPCB2YWxCKSByZXR1cm4gLTE7XG4gICAgICAgIGlmICh2YWxBID4gdmFsQikgcmV0dXJuIDE7XG4gICAgICAgIHJldHVybiAwO1xuICAgIH1cblxuICAgIC8vIEZhbGxiYWNrIGZvciBjdXN0b20gc3RyYXRlZ2llcyBncm91cGluZyBrZXkgKGlmIHVzaW5nIGN1c3RvbSBzdHJhdGVneSBhcyBzb3J0aW5nIGJ1dCBubyBzb3J0aW5nIHJ1bGVzIGRlZmluZWQpXG4gICAgLy8gb3IgdW5oYW5kbGVkIGJ1aWx0LWluc1xuICAgIHJldHVybiAoZ3JvdXBpbmdLZXkoYSwgc3RyYXRlZ3kpIHx8IFwiXCIpLmxvY2FsZUNvbXBhcmUoZ3JvdXBpbmdLZXkoYiwgc3RyYXRlZ3kpIHx8IFwiXCIpO1xufTtcblxuLy8gLS0tIE1haW4gRXhwb3J0IC0tLVxuXG5leHBvcnQgY29uc3QgY29tcGFyZUJ5ID0gKHN0cmF0ZWd5OiBTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmcsIGE6IFRhYk1ldGFkYXRhLCBiOiBUYWJNZXRhZGF0YSk6IG51bWJlciA9PiB7XG4gIC8vIDEuIEN1c3RvbSBTdHJhdGVneSAodGFrZXMgcHJlY2VkZW5jZSBpZiBydWxlcyBleGlzdClcbiAgY29uc3QgY3VzdG9tRGlmZiA9IGV2YWx1YXRlQ3VzdG9tU3RyYXRlZ3koc3RyYXRlZ3ksIGEsIGIpO1xuICBpZiAoY3VzdG9tRGlmZiAhPT0gbnVsbCkge1xuICAgICAgcmV0dXJuIGN1c3RvbURpZmY7XG4gIH1cblxuICAvLyAyLiBCdWlsdC1pbiByZWdpc3RyeVxuICBjb25zdCBidWlsdEluID0gc3RyYXRlZ3lSZWdpc3RyeVtzdHJhdGVneV07XG4gIGlmIChidWlsdEluKSB7XG4gICAgcmV0dXJuIGJ1aWx0SW4oYSwgYik7XG4gIH1cblxuICAvLyAzLiBHZW5lcmljL0ZhbGxiYWNrXG4gIHJldHVybiBldmFsdWF0ZUdlbmVyaWNTdHJhdGVneShzdHJhdGVneSwgYSwgYik7XG59O1xuXG5leHBvcnQgY29uc3Qgc29ydFRhYnMgPSAodGFiczogVGFiTWV0YWRhdGFbXSwgc3RyYXRlZ2llczogU29ydGluZ1N0cmF0ZWd5W10pOiBUYWJNZXRhZGF0YVtdID0+IHtcbiAgY29uc3Qgc2NvcmluZzogU29ydGluZ1N0cmF0ZWd5W10gPSBzdHJhdGVnaWVzLmxlbmd0aCA/IHN0cmF0ZWdpZXMgOiBbXCJwaW5uZWRcIiwgXCJyZWNlbmN5XCJdO1xuICByZXR1cm4gWy4uLnRhYnNdLnNvcnQoKGEsIGIpID0+IHtcbiAgICBmb3IgKGNvbnN0IHN0cmF0ZWd5IG9mIHNjb3JpbmcpIHtcbiAgICAgIGNvbnN0IGRpZmYgPSBjb21wYXJlQnkoc3RyYXRlZ3ksIGEsIGIpO1xuICAgICAgaWYgKGRpZmYgIT09IDApIHJldHVybiBkaWZmO1xuICAgIH1cbiAgICByZXR1cm4gYS5pZCAtIGIuaWQ7XG4gIH0pO1xufTtcbiIsICJpbXBvcnQgeyBUYWJHcm91cCwgVGFiTWV0YWRhdGEsIFByZWZlcmVuY2VzIH0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgbWFwQ2hyb21lVGFiLCBnZXRTdG9yZWRQcmVmZXJlbmNlcyB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcbmltcG9ydCB7IHNldEN1c3RvbVN0cmF0ZWdpZXMgfSBmcm9tIFwiLi4vYmFja2dyb3VuZC9ncm91cGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IHNvcnRUYWJzIH0gZnJvbSBcIi4uL2JhY2tncm91bmQvc29ydGluZ1N0cmF0ZWdpZXMuanNcIjtcblxuY29uc3QgZGVmYXVsdFByZWZlcmVuY2VzOiBQcmVmZXJlbmNlcyA9IHtcbiAgc29ydGluZzogW1wicGlubmVkXCIsIFwicmVjZW5jeVwiXSxcbiAgZGVidWc6IGZhbHNlLFxuICB0aGVtZTogXCJkYXJrXCIsXG4gIGN1c3RvbUdlbmVyYToge31cbn07XG5cbmV4cG9ydCBjb25zdCBmZXRjaExvY2FsU3RhdGUgPSBhc3luYyAoKSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgW3RhYnMsIGdyb3VwcywgcHJlZnNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgY2hyb21lLnRhYnMucXVlcnkoe30pLFxuICAgICAgY2hyb21lLnRhYkdyb3Vwcy5xdWVyeSh7fSksXG4gICAgICBnZXRTdG9yZWRQcmVmZXJlbmNlcygpXG4gICAgXSk7XG5cbiAgICBjb25zdCBwcmVmZXJlbmNlcyA9IHByZWZzIHx8IGRlZmF1bHRQcmVmZXJlbmNlcztcblxuICAgIC8vIEluaXRpYWxpemUgY3VzdG9tIHN0cmF0ZWdpZXMgZm9yIHNvcnRpbmdcbiAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZlcmVuY2VzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuXG4gICAgY29uc3QgZ3JvdXBNYXAgPSBuZXcgTWFwKGdyb3Vwcy5tYXAoZyA9PiBbZy5pZCwgZ10pKTtcbiAgICBjb25zdCBtYXBwZWQgPSB0YWJzLm1hcChtYXBDaHJvbWVUYWIpLmZpbHRlcigodCk6IHQgaXMgVGFiTWV0YWRhdGEgPT4gQm9vbGVhbih0KSk7XG5cbiAgICBjb25zdCByZXN1bHRHcm91cHM6IFRhYkdyb3VwW10gPSBbXTtcbiAgICBjb25zdCB0YWJzQnlHcm91cElkID0gbmV3IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhW10+KCk7XG4gICAgY29uc3QgdGFic0J5V2luZG93VW5ncm91cGVkID0gbmV3IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhW10+KCk7XG5cbiAgICBtYXBwZWQuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgICBjb25zdCBncm91cElkID0gdGFiLmdyb3VwSWQgPz8gLTE7XG4gICAgICAgIGlmIChncm91cElkICE9PSAtMSkge1xuICAgICAgICAgICAgaWYgKCF0YWJzQnlHcm91cElkLmhhcyhncm91cElkKSkgdGFic0J5R3JvdXBJZC5zZXQoZ3JvdXBJZCwgW10pO1xuICAgICAgICAgICAgdGFic0J5R3JvdXBJZC5nZXQoZ3JvdXBJZCkhLnB1c2godGFiKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICBpZiAoIXRhYnNCeVdpbmRvd1VuZ3JvdXBlZC5oYXModGFiLndpbmRvd0lkKSkgdGFic0J5V2luZG93VW5ncm91cGVkLnNldCh0YWIud2luZG93SWQsIFtdKTtcbiAgICAgICAgICAgICB0YWJzQnlXaW5kb3dVbmdyb3VwZWQuZ2V0KHRhYi53aW5kb3dJZCkhLnB1c2godGFiKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIFRhYkdyb3VwIG9iamVjdHMgZm9yIGFjdHVhbCBncm91cHNcbiAgICBmb3IgKGNvbnN0IFtncm91cElkLCBncm91cFRhYnNdIG9mIHRhYnNCeUdyb3VwSWQpIHtcbiAgICAgICAgY29uc3QgYnJvd3Nlckdyb3VwID0gZ3JvdXBNYXAuZ2V0KGdyb3VwSWQpO1xuICAgICAgICBpZiAoYnJvd3Nlckdyb3VwKSB7XG4gICAgICAgICAgICByZXN1bHRHcm91cHMucHVzaCh7XG4gICAgICAgICAgICAgICAgaWQ6IGBncm91cC0ke2dyb3VwSWR9YCxcbiAgICAgICAgICAgICAgICB3aW5kb3dJZDogYnJvd3Nlckdyb3VwLndpbmRvd0lkLFxuICAgICAgICAgICAgICAgIGxhYmVsOiBicm93c2VyR3JvdXAudGl0bGUgfHwgXCJVbnRpdGxlZCBHcm91cFwiLFxuICAgICAgICAgICAgICAgIGNvbG9yOiBicm93c2VyR3JvdXAuY29sb3IsXG4gICAgICAgICAgICAgICAgdGFiczogc29ydFRhYnMoZ3JvdXBUYWJzLCBwcmVmZXJlbmNlcy5zb3J0aW5nKSxcbiAgICAgICAgICAgICAgICByZWFzb246IFwiTWFudWFsXCJcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gSGFuZGxlIHVuZ3JvdXBlZCB0YWJzXG4gICAgZm9yIChjb25zdCBbd2luZG93SWQsIHRhYnNdIG9mIHRhYnNCeVdpbmRvd1VuZ3JvdXBlZCkge1xuICAgICAgICByZXN1bHRHcm91cHMucHVzaCh7XG4gICAgICAgICAgICBpZDogYHVuZ3JvdXBlZC0ke3dpbmRvd0lkfWAsXG4gICAgICAgICAgICB3aW5kb3dJZDogd2luZG93SWQsXG4gICAgICAgICAgICBsYWJlbDogXCJVbmdyb3VwZWRcIixcbiAgICAgICAgICAgIGNvbG9yOiBcImdyZXlcIixcbiAgICAgICAgICAgIHRhYnM6IHNvcnRUYWJzKHRhYnMsIHByZWZlcmVuY2VzLnNvcnRpbmcpLFxuICAgICAgICAgICAgcmVhc29uOiBcIlVuZ3JvdXBlZFwiXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnNvbGUud2FybihcIkZldGNoZWQgbG9jYWwgc3RhdGUgKGZhbGxiYWNrKVwiKTtcbiAgICByZXR1cm4geyBvazogdHJ1ZSwgZGF0YTogeyBncm91cHM6IHJlc3VsdEdyb3VwcywgcHJlZmVyZW5jZXMgfSB9O1xuICB9IGNhdGNoIChlKSB7XG4gICAgY29uc29sZS5lcnJvcihcIkxvY2FsIHN0YXRlIGZldGNoIGZhaWxlZDpcIiwgZSk7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGUpIH07XG4gIH1cbn07XG4iLCAiaW1wb3J0IHtcbiAgQXBwbHlHcm91cGluZ1BheWxvYWQsXG4gIEdyb3VwaW5nU2VsZWN0aW9uLFxuICBQcmVmZXJlbmNlcyxcbiAgUnVudGltZU1lc3NhZ2UsXG4gIFJ1bnRpbWVSZXNwb25zZSxcbiAgU2F2ZWRTdGF0ZSxcbiAgU29ydGluZ1N0cmF0ZWd5LFxuICBUYWJHcm91cCxcbiAgVGFiTWV0YWRhdGFcbn0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgZmV0Y2hMb2NhbFN0YXRlIH0gZnJvbSBcIi4vbG9jYWxTdGF0ZS5qc1wiO1xuaW1wb3J0IHsgZ2V0SG9zdG5hbWUgfSBmcm9tIFwiLi4vc2hhcmVkL3VybENhY2hlLmpzXCI7XG5cbmV4cG9ydCBjb25zdCBzZW5kTWVzc2FnZSA9IGFzeW5jIDxURGF0YT4odHlwZTogUnVudGltZU1lc3NhZ2VbXCJ0eXBlXCJdLCBwYXlsb2FkPzogYW55KTogUHJvbWlzZTxSdW50aW1lUmVzcG9uc2U8VERhdGE+PiA9PiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZSwgcGF5bG9hZCB9LCAocmVzcG9uc2UpID0+IHtcbiAgICAgIGlmIChjaHJvbWUucnVudGltZS5sYXN0RXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIlJ1bnRpbWUgZXJyb3I6XCIsIGNocm9tZS5ydW50aW1lLmxhc3RFcnJvcik7XG4gICAgICAgIHJlc29sdmUoeyBvazogZmFsc2UsIGVycm9yOiBjaHJvbWUucnVudGltZS5sYXN0RXJyb3IubWVzc2FnZSB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc29sdmUocmVzcG9uc2UgfHwgeyBvazogZmFsc2UsIGVycm9yOiBcIk5vIHJlc3BvbnNlIGZyb20gYmFja2dyb3VuZFwiIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICB9KTtcbn07XG5cbmV4cG9ydCB0eXBlIFRhYldpdGhHcm91cCA9IFRhYk1ldGFkYXRhICYge1xuICBncm91cExhYmVsPzogc3RyaW5nO1xuICBncm91cENvbG9yPzogc3RyaW5nO1xuICByZWFzb24/OiBzdHJpbmc7XG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFdpbmRvd1ZpZXcge1xuICBpZDogbnVtYmVyO1xuICB0aXRsZTogc3RyaW5nO1xuICB0YWJzOiBUYWJXaXRoR3JvdXBbXTtcbiAgdGFiQ291bnQ6IG51bWJlcjtcbiAgZ3JvdXBDb3VudDogbnVtYmVyO1xuICBwaW5uZWRDb3VudDogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgSUNPTlMgPSB7XG4gIGFjdGl2ZTogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwb2x5Z29uIHBvaW50cz1cIjMgMTEgMjIgMiAxMyAyMSAxMSAxMyAzIDExXCI+PC9wb2x5Z29uPjwvc3ZnPmAsXG4gIGhpZGU6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cGF0aCBkPVwiTTE3Ljk0IDE3Ljk0QTEwLjA3IDEwLjA3IDAgMCAxIDEyIDIwYy03IDAtMTEtOC0xMS04YTE4LjQ1IDE4LjQ1IDAgMCAxIDUuMDYtNS45NE05LjkgNC4yNEE5LjEyIDkuMTIgMCAwIDEgMTIgNGM3IDAgMTEgOCAxMSA4YTE4LjUgMTguNSAwIDAgMS0yLjE2IDMuMTltLTYuNzItMS4wN2EzIDMgMCAxIDEtNC4yNC00LjI0XCI+PC9wYXRoPjxsaW5lIHgxPVwiMVwiIHkxPVwiMVwiIHgyPVwiMjNcIiB5Mj1cIjIzXCI+PC9saW5lPjwvc3ZnPmAsXG4gIHNob3c6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cGF0aCBkPVwiTTEgMTJzNC04IDExLTggMTEgOCAxMSA4LTQgOC0xMSA4LTExLTgtMTEtOC0xMS04elwiPjwvcGF0aD48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjNcIj48L2NpcmNsZT48L3N2Zz5gLFxuICBmb2N1czogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxjaXJjbGUgY3g9XCIxMlwiIGN5PVwiMTJcIiByPVwiMTBcIj48L2NpcmNsZT48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjZcIj48L2NpcmNsZT48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjJcIj48L2NpcmNsZT48L3N2Zz5gLFxuICBjbG9zZTogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxsaW5lIHgxPVwiMThcIiB5MT1cIjZcIiB4Mj1cIjZcIiB5Mj1cIjE4XCI+PC9saW5lPjxsaW5lIHgxPVwiNlwiIHkxPVwiNlwiIHgyPVwiMThcIiB5Mj1cIjE4XCI+PC9saW5lPjwvc3ZnPmAsXG4gIHVuZ3JvdXA6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjEwXCI+PC9jaXJjbGU+PGxpbmUgeDE9XCI4XCIgeTE9XCIxMlwiIHgyPVwiMTZcIiB5Mj1cIjEyXCI+PC9saW5lPjwvc3ZnPmAsXG4gIGRlZmF1bHRGaWxlOiBgPHN2ZyB3aWR0aD1cIjI0XCIgaGVpZ2h0PVwiMjRcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBhdGggZD1cIk0xNCAySDZhMiAyIDAgMCAwLTIgMnYxNmEyIDIgMCAwIDAgMiAyaDEyYTIgMiAwIDAgMCAyLTJWOHpcIj48L3BhdGg+PHBvbHlsaW5lIHBvaW50cz1cIjE0IDIgMTQgOCAyMCA4XCI+PC9wb2x5bGluZT48bGluZSB4MT1cIjE2XCIgeTE9XCIxM1wiIHgyPVwiOFwiIHkyPVwiMTNcIj48L2xpbmU+PGxpbmUgeDE9XCIxNlwiIHkxPVwiMTdcIiB4Mj1cIjhcIiB5Mj1cIjE3XCI+PC9saW5lPjxwb2x5bGluZSBwb2ludHM9XCIxMCA5IDkgOSA4IDlcIj48L3BvbHlsaW5lPjwvc3ZnPmAsXG4gIGF1dG9SdW46IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cG9seWdvbiBwb2ludHM9XCIxMyAyIDMgMTQgMTIgMTQgMTEgMjIgMjEgMTAgMTIgMTAgMTMgMlwiPjwvcG9seWdvbj48L3N2Zz5gXG59O1xuXG5leHBvcnQgY29uc3QgR1JPVVBfQ09MT1JTOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICBncmV5OiBcIiM2NDc0OGJcIixcbiAgYmx1ZTogXCIjM2I4MmY2XCIsXG4gIHJlZDogXCIjZWY0NDQ0XCIsXG4gIHllbGxvdzogXCIjZWFiMzA4XCIsXG4gIGdyZWVuOiBcIiMyMmM1NWVcIixcbiAgcGluazogXCIjZWM0ODk5XCIsXG4gIHB1cnBsZTogXCIjYTg1NWY3XCIsXG4gIGN5YW46IFwiIzA2YjZkNFwiLFxuICBvcmFuZ2U6IFwiI2Y5NzMxNlwiXG59O1xuXG5leHBvcnQgY29uc3QgZ2V0R3JvdXBDb2xvciA9IChuYW1lOiBzdHJpbmcpID0+IEdST1VQX0NPTE9SU1tuYW1lXSB8fCBcIiNjYmQ1ZTFcIjtcblxuZXhwb3J0IGNvbnN0IGZldGNoU3RhdGUgPSBhc3luYyAoKSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBzZW5kTWVzc2FnZTx7IGdyb3VwczogVGFiR3JvdXBbXTsgcHJlZmVyZW5jZXM6IFByZWZlcmVuY2VzIH0+KFwiZ2V0U3RhdGVcIik7XG4gICAgaWYgKHJlc3BvbnNlLm9rICYmIHJlc3BvbnNlLmRhdGEpIHtcbiAgICAgIHJldHVybiByZXNwb25zZTtcbiAgICB9XG4gICAgY29uc29sZS53YXJuKFwiZmV0Y2hTdGF0ZSBmYWlsZWQsIHVzaW5nIGZhbGxiYWNrOlwiLCByZXNwb25zZS5lcnJvcik7XG4gICAgcmV0dXJuIGF3YWl0IGZldGNoTG9jYWxTdGF0ZSgpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgY29uc29sZS53YXJuKFwiZmV0Y2hTdGF0ZSB0aHJldyBleGNlcHRpb24sIHVzaW5nIGZhbGxiYWNrOlwiLCBlKTtcbiAgICByZXR1cm4gYXdhaXQgZmV0Y2hMb2NhbFN0YXRlKCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBhcHBseUdyb3VwaW5nID0gYXN5bmMgKHBheWxvYWQ6IEFwcGx5R3JvdXBpbmdQYXlsb2FkKSA9PiB7XG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImFwcGx5R3JvdXBpbmdcIiwgcGF5bG9hZCB9KTtcbiAgcmV0dXJuIHJlc3BvbnNlIGFzIFJ1bnRpbWVSZXNwb25zZTx1bmtub3duPjtcbn07XG5cbmV4cG9ydCBjb25zdCBhcHBseVNvcnRpbmcgPSBhc3luYyAocGF5bG9hZDogQXBwbHlHcm91cGluZ1BheWxvYWQpID0+IHtcbiAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6IFwiYXBwbHlTb3J0aW5nXCIsIHBheWxvYWQgfSk7XG4gIHJldHVybiByZXNwb25zZSBhcyBSdW50aW1lUmVzcG9uc2U8dW5rbm93bj47XG59O1xuXG5leHBvcnQgY29uc3QgbWFwV2luZG93cyA9IChncm91cHM6IFRhYkdyb3VwW10sIHdpbmRvd1RpdGxlczogTWFwPG51bWJlciwgc3RyaW5nPik6IFdpbmRvd1ZpZXdbXSA9PiB7XG4gIGNvbnN0IHdpbmRvd3MgPSBuZXcgTWFwPG51bWJlciwgVGFiV2l0aEdyb3VwW10+KCk7XG5cbiAgZ3JvdXBzLmZvckVhY2goKGdyb3VwKSA9PiB7XG4gICAgY29uc3QgaXNVbmdyb3VwZWQgPSBncm91cC5yZWFzb24gPT09IFwiVW5ncm91cGVkXCI7XG4gICAgZ3JvdXAudGFicy5mb3JFYWNoKCh0YWIpID0+IHtcbiAgICAgIGNvbnN0IGRlY29yYXRlZDogVGFiV2l0aEdyb3VwID0ge1xuICAgICAgICAuLi50YWIsXG4gICAgICAgIGdyb3VwTGFiZWw6IGlzVW5ncm91cGVkID8gdW5kZWZpbmVkIDogZ3JvdXAubGFiZWwsXG4gICAgICAgIGdyb3VwQ29sb3I6IGlzVW5ncm91cGVkID8gdW5kZWZpbmVkIDogZ3JvdXAuY29sb3IsXG4gICAgICAgIHJlYXNvbjogZ3JvdXAucmVhc29uXG4gICAgICB9O1xuICAgICAgY29uc3QgZXhpc3RpbmcgPSB3aW5kb3dzLmdldCh0YWIud2luZG93SWQpID8/IFtdO1xuICAgICAgZXhpc3RpbmcucHVzaChkZWNvcmF0ZWQpO1xuICAgICAgd2luZG93cy5zZXQodGFiLndpbmRvd0lkLCBleGlzdGluZyk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIHJldHVybiBBcnJheS5mcm9tKHdpbmRvd3MuZW50cmllcygpKVxuICAgIC5tYXA8V2luZG93Vmlldz4oKFtpZCwgdGFic10pID0+IHtcbiAgICAgIGNvbnN0IGdyb3VwQ291bnQgPSBuZXcgU2V0KHRhYnMubWFwKCh0YWIpID0+IHRhYi5ncm91cExhYmVsKS5maWx0ZXIoKGwpOiBsIGlzIHN0cmluZyA9PiAhIWwpKS5zaXplO1xuICAgICAgY29uc3QgcGlubmVkQ291bnQgPSB0YWJzLmZpbHRlcigodGFiKSA9PiB0YWIucGlubmVkKS5sZW5ndGg7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBpZCxcbiAgICAgICAgdGl0bGU6IHdpbmRvd1RpdGxlcy5nZXQoaWQpID8/IGBXaW5kb3cgJHtpZH1gLFxuICAgICAgICB0YWJzLFxuICAgICAgICB0YWJDb3VudDogdGFicy5sZW5ndGgsXG4gICAgICAgIGdyb3VwQ291bnQsXG4gICAgICAgIHBpbm5lZENvdW50XG4gICAgICB9O1xuICAgIH0pXG4gICAgLnNvcnQoKGEsIGIpID0+IGEuaWQgLSBiLmlkKTtcbn07XG5cbmV4cG9ydCBjb25zdCBmb3JtYXREb21haW4gPSAodXJsOiBzdHJpbmcpID0+IHtcbiAgY29uc3QgaG9zdG5hbWUgPSBnZXRIb3N0bmFtZSh1cmwpO1xuICBpZiAoaG9zdG5hbWUpIHtcbiAgICByZXR1cm4gaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sIFwiXCIpO1xuICB9XG4gIHJldHVybiB1cmw7XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RHJhZ0FmdGVyRWxlbWVudChjb250YWluZXI6IEhUTUxFbGVtZW50LCB5OiBudW1iZXIsIHNlbGVjdG9yOiBzdHJpbmcpIHtcbiAgY29uc3QgZHJhZ2dhYmxlRWxlbWVudHMgPSBBcnJheS5mcm9tKGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKSk7XG5cbiAgcmV0dXJuIGRyYWdnYWJsZUVsZW1lbnRzLnJlZHVjZSgoY2xvc2VzdCwgY2hpbGQpID0+IHtcbiAgICBjb25zdCBib3ggPSBjaGlsZC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICBjb25zdCBvZmZzZXQgPSB5IC0gYm94LnRvcCAtIGJveC5oZWlnaHQgLyAyO1xuICAgIGlmIChvZmZzZXQgPCAwICYmIG9mZnNldCA+IGNsb3Nlc3Qub2Zmc2V0KSB7XG4gICAgICByZXR1cm4geyBvZmZzZXQ6IG9mZnNldCwgZWxlbWVudDogY2hpbGQgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGNsb3Nlc3Q7XG4gICAgfVxuICB9LCB7IG9mZnNldDogTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZLCBlbGVtZW50OiBudWxsIGFzIEVsZW1lbnQgfCBudWxsIH0pLmVsZW1lbnQ7XG59XG4iLCAiaW1wb3J0IHtcbiAgR3JvdXBpbmdTZWxlY3Rpb24sXG4gIFByZWZlcmVuY2VzLFxuICBTYXZlZFN0YXRlLFxuICBTb3J0aW5nU3RyYXRlZ3ksXG4gIExvZ0xldmVsLFxuICBUYWJHcm91cFxufSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQge1xuICBhcHBseUdyb3VwaW5nLFxuICBhcHBseVNvcnRpbmcsXG4gIGZldGNoU3RhdGUsXG4gIElDT05TLFxuICBtYXBXaW5kb3dzLFxuICBzZW5kTWVzc2FnZSxcbiAgVGFiV2l0aEdyb3VwLFxuICBXaW5kb3dWaWV3LFxuICBHUk9VUF9DT0xPUlMsXG4gIGdldERyYWdBZnRlckVsZW1lbnRcbn0gZnJvbSBcIi4vY29tbW9uLmpzXCI7XG5pbXBvcnQgeyBnZXRTdHJhdGVnaWVzLCBTVFJBVEVHSUVTLCBTdHJhdGVneURlZmluaXRpb24gfSBmcm9tIFwiLi4vc2hhcmVkL3N0cmF0ZWd5UmVnaXN0cnkuanNcIjtcbmltcG9ydCB7IHNldExvZ2dlclByZWZlcmVuY2VzLCBsb2dEZWJ1ZywgbG9nSW5mbyB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBmZXRjaExvY2FsU3RhdGUgfSBmcm9tIFwiLi9sb2NhbFN0YXRlLmpzXCI7XG5cbi8vIEVsZW1lbnRzXG5jb25zdCBzZWFyY2hJbnB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwidGFiU2VhcmNoXCIpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG5jb25zdCB3aW5kb3dzQ29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ3aW5kb3dzXCIpIGFzIEhUTUxEaXZFbGVtZW50O1xuXG5jb25zdCBzZWxlY3RBbGxDaGVja2JveCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2VsZWN0QWxsXCIpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG5jb25zdCBidG5BcHBseSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuQXBwbHlcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5jb25zdCBidG5Vbmdyb3VwID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5Vbmdyb3VwXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50O1xuY29uc3QgYnRuTWVyZ2UgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0bk1lcmdlXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50O1xuY29uc3QgYnRuU3BsaXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0blNwbGl0XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50O1xuY29uc3QgYnRuRXhwYW5kQWxsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5FeHBhbmRBbGxcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5jb25zdCBidG5Db2xsYXBzZUFsbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuQ29sbGFwc2VBbGxcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cbmNvbnN0IGFjdGl2ZVN0cmF0ZWdpZXNMaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJhY3RpdmVTdHJhdGVnaWVzTGlzdFwiKSBhcyBIVE1MRGl2RWxlbWVudDtcbmNvbnN0IGFkZFN0cmF0ZWd5U2VsZWN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJhZGRTdHJhdGVneVNlbGVjdFwiKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcblxuLy8gU3RhdHNcbmNvbnN0IHN0YXRUYWJzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzdGF0VGFic1wiKSBhcyBIVE1MRWxlbWVudDtcbmNvbnN0IHN0YXRHcm91cHMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInN0YXRHcm91cHNcIikgYXMgSFRNTEVsZW1lbnQ7XG5jb25zdCBzdGF0V2luZG93cyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3RhdFdpbmRvd3NcIikgYXMgSFRNTEVsZW1lbnQ7XG5cbmNvbnN0IHByb2dyZXNzT3ZlcmxheSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicHJvZ3Jlc3NPdmVybGF5XCIpIGFzIEhUTUxEaXZFbGVtZW50O1xuY29uc3QgcHJvZ3Jlc3NUZXh0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJwcm9ncmVzc1RleHRcIikgYXMgSFRNTERpdkVsZW1lbnQ7XG5jb25zdCBwcm9ncmVzc0NvdW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJwcm9ncmVzc0NvdW50XCIpIGFzIEhUTUxEaXZFbGVtZW50O1xuXG5jb25zdCBzaG93TG9hZGluZyA9ICh0ZXh0OiBzdHJpbmcpID0+IHtcbiAgICBpZiAocHJvZ3Jlc3NPdmVybGF5KSB7XG4gICAgICAgIHByb2dyZXNzVGV4dC50ZXh0Q29udGVudCA9IHRleHQ7XG4gICAgICAgIHByb2dyZXNzQ291bnQudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgICAgICBwcm9ncmVzc092ZXJsYXkuY2xhc3NMaXN0LnJlbW92ZShcImhpZGRlblwiKTtcbiAgICB9XG59O1xuXG5jb25zdCBoaWRlTG9hZGluZyA9ICgpID0+IHtcbiAgICBpZiAocHJvZ3Jlc3NPdmVybGF5KSB7XG4gICAgICAgIHByb2dyZXNzT3ZlcmxheS5jbGFzc0xpc3QuYWRkKFwiaGlkZGVuXCIpO1xuICAgIH1cbn07XG5cbmNvbnN0IHVwZGF0ZVByb2dyZXNzID0gKGNvbXBsZXRlZDogbnVtYmVyLCB0b3RhbDogbnVtYmVyKSA9PiB7XG4gICAgaWYgKHByb2dyZXNzT3ZlcmxheSAmJiAhcHJvZ3Jlc3NPdmVybGF5LmNsYXNzTGlzdC5jb250YWlucyhcImhpZGRlblwiKSkge1xuICAgICAgICBwcm9ncmVzc0NvdW50LnRleHRDb250ZW50ID0gYCR7Y29tcGxldGVkfSAvICR7dG90YWx9YDtcbiAgICB9XG59O1xuXG5sZXQgd2luZG93U3RhdGU6IFdpbmRvd1ZpZXdbXSA9IFtdO1xubGV0IGZvY3VzZWRXaW5kb3dJZDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5jb25zdCBzZWxlY3RlZFRhYnMgPSBuZXcgU2V0PG51bWJlcj4oKTtcbmxldCBpbml0aWFsU2VsZWN0aW9uRG9uZSA9IGZhbHNlO1xubGV0IHByZWZlcmVuY2VzOiBQcmVmZXJlbmNlcyB8IG51bGwgPSBudWxsO1xubGV0IGxvY2FsUHJlZmVyZW5jZXNNb2RpZmllZFRpbWUgPSAwO1xuXG4vLyBUcmVlIFN0YXRlXG5jb25zdCBleHBhbmRlZE5vZGVzID0gbmV3IFNldDxzdHJpbmc+KCk7IC8vIERlZmF1bHQgZW1wdHkgPSBhbGwgY29sbGFwc2VkXG5jb25zdCBUUkVFX0lDT05TID0ge1xuICBjaGV2cm9uUmlnaHQ6IGA8c3ZnIHdpZHRoPVwiMTAwJVwiIGhlaWdodD1cIjEwMCVcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBvbHlsaW5lIHBvaW50cz1cIjkgMTggMTUgMTIgOSA2XCI+PC9wb2x5bGluZT48L3N2Zz5gLFxuICBmb2xkZXI6IGA8c3ZnIHdpZHRoPVwiMTAwJVwiIGhlaWdodD1cIjEwMCVcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBhdGggZD1cIk0yMiAxOWEyIDIgMCAwIDEtMiAySDRhMiAyIDAgMCAxLTItMlY1YTIgMiAwIDAgMSAyLTJoNWwyIDNoOWEyIDIgMCAwIDEgMiAyelwiPjwvcGF0aD48L3N2Zz5gXG59O1xuXG5jb25zdCBoZXhUb1JnYmEgPSAoaGV4OiBzdHJpbmcsIGFscGhhOiBudW1iZXIpID0+IHtcbiAgICAvLyBFbnN1cmUgaGV4IGZvcm1hdFxuICAgIGlmICghaGV4LnN0YXJ0c1dpdGgoJyMnKSkgcmV0dXJuIGhleDtcbiAgICBjb25zdCByID0gcGFyc2VJbnQoaGV4LnNsaWNlKDEsIDMpLCAxNik7XG4gICAgY29uc3QgZyA9IHBhcnNlSW50KGhleC5zbGljZSgzLCA1KSwgMTYpO1xuICAgIGNvbnN0IGIgPSBwYXJzZUludChoZXguc2xpY2UoNSwgNyksIDE2KTtcbiAgICByZXR1cm4gYHJnYmEoJHtyfSwgJHtnfSwgJHtifSwgJHthbHBoYX0pYDtcbn07XG5cbmNvbnN0IHVwZGF0ZVN0YXRzID0gKCkgPT4ge1xuICBjb25zdCB0b3RhbFRhYnMgPSB3aW5kb3dTdGF0ZS5yZWR1Y2UoKGFjYywgd2luKSA9PiBhY2MgKyB3aW4udGFiQ291bnQsIDApO1xuICBjb25zdCB0b3RhbEdyb3VwcyA9IG5ldyBTZXQod2luZG93U3RhdGUuZmxhdE1hcCh3ID0+IHcudGFicy5maWx0ZXIodCA9PiB0Lmdyb3VwTGFiZWwpLm1hcCh0ID0+IGAke3cuaWR9LSR7dC5ncm91cExhYmVsfWApKSkuc2l6ZTtcblxuICBzdGF0VGFicy50ZXh0Q29udGVudCA9IGAke3RvdGFsVGFic30gVGFic2A7XG4gIHN0YXRHcm91cHMudGV4dENvbnRlbnQgPSBgJHt0b3RhbEdyb3Vwc30gR3JvdXBzYDtcbiAgc3RhdFdpbmRvd3MudGV4dENvbnRlbnQgPSBgJHt3aW5kb3dTdGF0ZS5sZW5ndGh9IFdpbmRvd3NgO1xuXG4gIC8vIFVwZGF0ZSBzZWxlY3Rpb24gYnV0dG9uc1xuICBjb25zdCBoYXNTZWxlY3Rpb24gPSBzZWxlY3RlZFRhYnMuc2l6ZSA+IDA7XG4gIGJ0blVuZ3JvdXAuZGlzYWJsZWQgPSAhaGFzU2VsZWN0aW9uO1xuICBidG5NZXJnZS5kaXNhYmxlZCA9ICFoYXNTZWxlY3Rpb247XG4gIGJ0blNwbGl0LmRpc2FibGVkID0gIWhhc1NlbGVjdGlvbjtcblxuICBidG5Vbmdyb3VwLnN0eWxlLm9wYWNpdHkgPSBoYXNTZWxlY3Rpb24gPyBcIjFcIiA6IFwiMC41XCI7XG4gIGJ0bk1lcmdlLnN0eWxlLm9wYWNpdHkgPSBoYXNTZWxlY3Rpb24gPyBcIjFcIiA6IFwiMC41XCI7XG4gIGJ0blNwbGl0LnN0eWxlLm9wYWNpdHkgPSBoYXNTZWxlY3Rpb24gPyBcIjFcIiA6IFwiMC41XCI7XG5cbiAgLy8gVXBkYXRlIFNlbGVjdCBBbGwgQ2hlY2tib3ggU3RhdGVcbiAgaWYgKHRvdGFsVGFicyA9PT0gMCkge1xuICAgIHNlbGVjdEFsbENoZWNrYm94LmNoZWNrZWQgPSBmYWxzZTtcbiAgICBzZWxlY3RBbGxDaGVja2JveC5pbmRldGVybWluYXRlID0gZmFsc2U7XG4gIH0gZWxzZSBpZiAoc2VsZWN0ZWRUYWJzLnNpemUgPT09IHRvdGFsVGFicykge1xuICAgIHNlbGVjdEFsbENoZWNrYm94LmNoZWNrZWQgPSB0cnVlO1xuICAgIHNlbGVjdEFsbENoZWNrYm94LmluZGV0ZXJtaW5hdGUgPSBmYWxzZTtcbiAgfSBlbHNlIGlmIChzZWxlY3RlZFRhYnMuc2l6ZSA+IDApIHtcbiAgICBzZWxlY3RBbGxDaGVja2JveC5jaGVja2VkID0gZmFsc2U7XG4gICAgc2VsZWN0QWxsQ2hlY2tib3guaW5kZXRlcm1pbmF0ZSA9IHRydWU7XG4gIH0gZWxzZSB7XG4gICAgc2VsZWN0QWxsQ2hlY2tib3guY2hlY2tlZCA9IGZhbHNlO1xuICAgIHNlbGVjdEFsbENoZWNrYm94LmluZGV0ZXJtaW5hdGUgPSBmYWxzZTtcbiAgfVxufTtcblxuY29uc3QgY3JlYXRlTm9kZSA9IChcbiAgICBjb250ZW50OiBIVE1MRWxlbWVudCxcbiAgICBjaGlsZHJlbkNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCBudWxsLFxuICAgIGxldmVsOiAnd2luZG93JyB8ICdncm91cCcgfCAndGFiJyxcbiAgICBpc0V4cGFuZGVkOiBib29sZWFuID0gZmFsc2UsXG4gICAgb25Ub2dnbGU/OiAoKSA9PiB2b2lkXG4pID0+IHtcbiAgICBjb25zdCBub2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBub2RlLmNsYXNzTmFtZSA9IGB0cmVlLW5vZGUgbm9kZS0ke2xldmVsfWA7XG5cbiAgICBjb25zdCByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIHJvdy5jbGFzc05hbWUgPSBgdHJlZS1yb3cgJHtsZXZlbH0tcm93YDtcblxuICAgIC8vIFRvZ2dsZVxuICAgIGNvbnN0IHRvZ2dsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgdG9nZ2xlLmNsYXNzTmFtZSA9IGB0cmVlLXRvZ2dsZSAke2lzRXhwYW5kZWQgPyAncm90YXRlZCcgOiAnJ31gO1xuICAgIGlmIChjaGlsZHJlbkNvbnRhaW5lcikge1xuICAgICAgICB0b2dnbGUuaW5uZXJIVE1MID0gVFJFRV9JQ09OUy5jaGV2cm9uUmlnaHQ7XG4gICAgICAgIHRvZ2dsZS5vbmNsaWNrID0gKGUpID0+IHtcbiAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICBpZiAob25Ub2dnbGUpIG9uVG9nZ2xlKCk7XG4gICAgICAgIH07XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdG9nZ2xlLmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xuICAgIH1cblxuICAgIHJvdy5hcHBlbmRDaGlsZCh0b2dnbGUpO1xuICAgIHJvdy5hcHBlbmRDaGlsZChjb250ZW50KTsgLy8gQ29udGVudCBoYW5kbGVzIGNoZWNrYm94ICsgaWNvbiArIHRleHQgKyBhY3Rpb25zXG5cbiAgICBub2RlLmFwcGVuZENoaWxkKHJvdyk7XG5cbiAgICBpZiAoY2hpbGRyZW5Db250YWluZXIpIHtcbiAgICAgICAgY2hpbGRyZW5Db250YWluZXIuY2xhc3NOYW1lID0gYHRyZWUtY2hpbGRyZW4gJHtpc0V4cGFuZGVkID8gJ2V4cGFuZGVkJyA6ICcnfWA7XG4gICAgICAgIG5vZGUuYXBwZW5kQ2hpbGQoY2hpbGRyZW5Db250YWluZXIpO1xuICAgIH1cblxuICAgIC8vIFRvZ2dsZSBpbnRlcmFjdGlvbiBvbiByb3cgY2xpY2sgZm9yIFdpbmRvd3MgYW5kIEdyb3Vwc1xuICAgIGlmIChjaGlsZHJlbkNvbnRhaW5lciAmJiBsZXZlbCAhPT0gJ3RhYicpIHtcbiAgICAgICAgcm93LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICAgICAgICAgIC8vIEF2b2lkIHRvZ2dsaW5nIGlmIGNsaWNraW5nIGFjdGlvbnMgb3IgY2hlY2tib3hcbiAgICAgICAgICAgIGlmICgoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpLmNsb3Nlc3QoJy5hY3Rpb24tYnRuJykgfHwgKGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5jbG9zZXN0KCcudHJlZS1jaGVja2JveCcpKSByZXR1cm47XG4gICAgICAgICAgICBpZiAob25Ub2dnbGUpIG9uVG9nZ2xlKCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiB7IG5vZGUsIHRvZ2dsZSwgY2hpbGRyZW5Db250YWluZXIgfTtcbn07XG5cbmNvbnN0IHJlbmRlclRhYk5vZGUgPSAodGFiOiBUYWJXaXRoR3JvdXApID0+IHtcbiAgICBjb25zdCB0YWJDb250ZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICB0YWJDb250ZW50LnN0eWxlLmRpc3BsYXkgPSBcImZsZXhcIjtcbiAgICB0YWJDb250ZW50LnN0eWxlLmFsaWduSXRlbXMgPSBcImNlbnRlclwiO1xuICAgIHRhYkNvbnRlbnQuc3R5bGUuZmxleCA9IFwiMVwiO1xuICAgIHRhYkNvbnRlbnQuc3R5bGUub3ZlcmZsb3cgPSBcImhpZGRlblwiO1xuXG4gICAgLy8gVGFiIENoZWNrYm94XG4gICAgY29uc3QgdGFiQ2hlY2tib3ggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW5wdXRcIik7XG4gICAgdGFiQ2hlY2tib3gudHlwZSA9IFwiY2hlY2tib3hcIjtcbiAgICB0YWJDaGVja2JveC5jbGFzc05hbWUgPSBcInRyZWUtY2hlY2tib3hcIjtcbiAgICB0YWJDaGVja2JveC5jaGVja2VkID0gc2VsZWN0ZWRUYWJzLmhhcyh0YWIuaWQpO1xuICAgIHRhYkNoZWNrYm94Lm9uY2xpY2sgPSAoZSkgPT4ge1xuICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICBpZiAodGFiQ2hlY2tib3guY2hlY2tlZCkgc2VsZWN0ZWRUYWJzLmFkZCh0YWIuaWQpO1xuICAgICAgICBlbHNlIHNlbGVjdGVkVGFicy5kZWxldGUodGFiLmlkKTtcbiAgICAgICAgcmVuZGVyVHJlZSgpO1xuICAgIH07XG5cbiAgICBjb25zdCB0YWJJY29uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICB0YWJJY29uLmNsYXNzTmFtZSA9IFwidHJlZS1pY29uXCI7XG4gICAgaWYgKHRhYi5mYXZJY29uVXJsKSB7XG4gICAgICAgIGNvbnN0IGltZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbWdcIik7XG4gICAgICAgIGltZy5zcmMgPSB0YWIuZmF2SWNvblVybDtcbiAgICAgICAgaW1nLm9uZXJyb3IgPSAoKSA9PiB7IHRhYkljb24uaW5uZXJIVE1MID0gSUNPTlMuZGVmYXVsdEZpbGU7IH07XG4gICAgICAgIHRhYkljb24uYXBwZW5kQ2hpbGQoaW1nKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB0YWJJY29uLmlubmVySFRNTCA9IElDT05TLmRlZmF1bHRGaWxlO1xuICAgIH1cblxuICAgIGNvbnN0IHRhYlRpdGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICB0YWJUaXRsZS5jbGFzc05hbWUgPSBcInRyZWUtbGFiZWxcIjtcbiAgICB0YWJUaXRsZS50ZXh0Q29udGVudCA9IHRhYi50aXRsZTtcbiAgICB0YWJUaXRsZS50aXRsZSA9IHRhYi50aXRsZTtcblxuICAgIGNvbnN0IHRhYkFjdGlvbnMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIHRhYkFjdGlvbnMuY2xhc3NOYW1lID0gXCJyb3ctYWN0aW9uc1wiO1xuICAgIGNvbnN0IGNsb3NlQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgICBjbG9zZUJ0bi5jbGFzc05hbWUgPSBcImFjdGlvbi1idG4gZGVsZXRlXCI7XG4gICAgY2xvc2VCdG4uaW5uZXJIVE1MID0gSUNPTlMuY2xvc2U7XG4gICAgY2xvc2VCdG4udGl0bGUgPSBcIkNsb3NlIFRhYlwiO1xuICAgIGNsb3NlQnRuLm9uY2xpY2sgPSBhc3luYyAoZSkgPT4ge1xuICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICBhd2FpdCBjaHJvbWUudGFicy5yZW1vdmUodGFiLmlkKTtcbiAgICAgICAgYXdhaXQgbG9hZFN0YXRlKCk7XG4gICAgfTtcbiAgICB0YWJBY3Rpb25zLmFwcGVuZENoaWxkKGNsb3NlQnRuKTtcblxuICAgIHRhYkNvbnRlbnQuYXBwZW5kKHRhYkNoZWNrYm94LCB0YWJJY29uLCB0YWJUaXRsZSwgdGFiQWN0aW9ucyk7XG5cbiAgICBjb25zdCB7IG5vZGU6IHRhYk5vZGUgfSA9IGNyZWF0ZU5vZGUodGFiQ29udGVudCwgbnVsbCwgJ3RhYicpO1xuICAgIHRhYk5vZGUub25jbGljayA9IGFzeW5jIChlKSA9PiB7XG4gICAgICAgIC8vIENsaWNraW5nIHRhYiByb3cgYWN0aXZhdGVzIHRhYiAodW5sZXNzIGNsaWNraW5nIGNoZWNrYm94L2FjdGlvbilcbiAgICAgICAgaWYgKChlLnRhcmdldCBhcyBIVE1MRWxlbWVudCkuY2xvc2VzdCgnLnRyZWUtY2hlY2tib3gnKSkgcmV0dXJuO1xuICAgICAgICBhd2FpdCBjaHJvbWUudGFicy51cGRhdGUodGFiLmlkLCB7IGFjdGl2ZTogdHJ1ZSB9KTtcbiAgICAgICAgYXdhaXQgY2hyb21lLndpbmRvd3MudXBkYXRlKHRhYi53aW5kb3dJZCwgeyBmb2N1c2VkOiB0cnVlIH0pO1xuICAgIH07XG4gICAgcmV0dXJuIHRhYk5vZGU7XG59O1xuXG5jb25zdCByZW5kZXJHcm91cE5vZGUgPSAoXG4gICAgZ3JvdXBMYWJlbDogc3RyaW5nLFxuICAgIGdyb3VwRGF0YTogeyBjb2xvcjogc3RyaW5nOyB0YWJzOiBUYWJXaXRoR3JvdXBbXSB9LFxuICAgIHdpbmRvd0tleTogc3RyaW5nLFxuICAgIHF1ZXJ5OiBzdHJpbmdcbikgPT4ge1xuICAgIGNvbnN0IGdyb3VwS2V5ID0gYCR7d2luZG93S2V5fS1nLSR7Z3JvdXBMYWJlbH1gO1xuICAgIGNvbnN0IGlzR3JvdXBFeHBhbmRlZCA9ICEhcXVlcnkgfHwgZXhwYW5kZWROb2Rlcy5oYXMoZ3JvdXBLZXkpO1xuXG4gICAgLy8gR3JvdXAgQ2hlY2tib3ggTG9naWNcbiAgICBjb25zdCBncm91cFRhYklkcyA9IGdyb3VwRGF0YS50YWJzLm1hcCh0ID0+IHQuaWQpO1xuICAgIGNvbnN0IGdycFNlbGVjdGVkQ291bnQgPSBncm91cFRhYklkcy5maWx0ZXIoaWQgPT4gc2VsZWN0ZWRUYWJzLmhhcyhpZCkpLmxlbmd0aDtcbiAgICBjb25zdCBncnBJc0FsbCA9IGdycFNlbGVjdGVkQ291bnQgPT09IGdyb3VwVGFiSWRzLmxlbmd0aCAmJiBncm91cFRhYklkcy5sZW5ndGggPiAwO1xuICAgIGNvbnN0IGdycElzU29tZSA9IGdycFNlbGVjdGVkQ291bnQgPiAwICYmIGdycFNlbGVjdGVkQ291bnQgPCBncm91cFRhYklkcy5sZW5ndGg7XG5cbiAgICBjb25zdCBncnBDaGVja2JveCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbnB1dFwiKTtcbiAgICBncnBDaGVja2JveC50eXBlID0gXCJjaGVja2JveFwiO1xuICAgIGdycENoZWNrYm94LmNsYXNzTmFtZSA9IFwidHJlZS1jaGVja2JveFwiO1xuICAgIGdycENoZWNrYm94LmNoZWNrZWQgPSBncnBJc0FsbDtcbiAgICBncnBDaGVja2JveC5pbmRldGVybWluYXRlID0gZ3JwSXNTb21lO1xuICAgIGdycENoZWNrYm94Lm9uY2xpY2sgPSAoZSkgPT4ge1xuICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICBjb25zdCB0YXJnZXRTdGF0ZSA9ICFncnBJc0FsbDtcbiAgICAgICAgZ3JvdXBUYWJJZHMuZm9yRWFjaChpZCA9PiB7XG4gICAgICAgICAgICBpZiAodGFyZ2V0U3RhdGUpIHNlbGVjdGVkVGFicy5hZGQoaWQpO1xuICAgICAgICAgICAgZWxzZSBzZWxlY3RlZFRhYnMuZGVsZXRlKGlkKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJlbmRlclRyZWUoKTtcbiAgICB9O1xuXG4gICAgLy8gR3JvdXAgQ29udGVudFxuICAgIGNvbnN0IGdycENvbnRlbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGdycENvbnRlbnQuc3R5bGUuZGlzcGxheSA9IFwiZmxleFwiO1xuICAgIGdycENvbnRlbnQuc3R5bGUuYWxpZ25JdGVtcyA9IFwiY2VudGVyXCI7XG4gICAgZ3JwQ29udGVudC5zdHlsZS5mbGV4ID0gXCIxXCI7XG4gICAgZ3JwQ29udGVudC5zdHlsZS5vdmVyZmxvdyA9IFwiaGlkZGVuXCI7XG5cbiAgICBjb25zdCBpY29uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBpY29uLmNsYXNzTmFtZSA9IFwidHJlZS1pY29uXCI7XG4gICAgaWNvbi5pbm5lckhUTUwgPSBUUkVFX0lDT05TLmZvbGRlcjtcblxuICAgIGNvbnN0IGdycExhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBncnBMYWJlbC5jbGFzc05hbWUgPSBcInRyZWUtbGFiZWxcIjtcbiAgICBncnBMYWJlbC50ZXh0Q29udGVudCA9IGdyb3VwTGFiZWw7XG5cbiAgICBjb25zdCBncnBDb3VudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgZ3JwQ291bnQuY2xhc3NOYW1lID0gXCJ0cmVlLWNvdW50XCI7XG4gICAgZ3JwQ291bnQudGV4dENvbnRlbnQgPSBgKCR7Z3JvdXBEYXRhLnRhYnMubGVuZ3RofSlgO1xuXG4gICAgLy8gR3JvdXAgQWN0aW9uc1xuICAgIGNvbnN0IGFjdGlvbnMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGFjdGlvbnMuY2xhc3NOYW1lID0gXCJyb3ctYWN0aW9uc1wiO1xuICAgIGNvbnN0IHVuZ3JvdXBCdG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICAgIHVuZ3JvdXBCdG4uY2xhc3NOYW1lID0gXCJhY3Rpb24tYnRuXCI7XG4gICAgdW5ncm91cEJ0bi5pbm5lckhUTUwgPSBJQ09OUy51bmdyb3VwO1xuICAgIHVuZ3JvdXBCdG4udGl0bGUgPSBcIlVuZ3JvdXBcIjtcbiAgICB1bmdyb3VwQnRuLm9uY2xpY2sgPSBhc3luYyAoZSkgPT4ge1xuICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICBpZiAoY29uZmlybShgVW5ncm91cCAke2dyb3VwRGF0YS50YWJzLmxlbmd0aH0gdGFicz9gKSkge1xuICAgICAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMudW5ncm91cChncm91cERhdGEudGFicy5tYXAodCA9PiB0LmlkKSk7XG4gICAgICAgICAgICBhd2FpdCBsb2FkU3RhdGUoKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgYWN0aW9ucy5hcHBlbmRDaGlsZCh1bmdyb3VwQnRuKTtcblxuICAgIGdycENvbnRlbnQuYXBwZW5kKGdycENoZWNrYm94LCBpY29uLCBncnBMYWJlbCwgZ3JwQ291bnQsIGFjdGlvbnMpO1xuXG4gICAgLy8gVGFic1xuICAgIGNvbnN0IHRhYnNDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGdyb3VwRGF0YS50YWJzLmZvckVhY2godGFiID0+IHtcbiAgICAgICAgdGFic0NvbnRhaW5lci5hcHBlbmRDaGlsZChyZW5kZXJUYWJOb2RlKHRhYikpO1xuICAgIH0pO1xuXG4gICAgY29uc3QgeyBub2RlOiBncm91cE5vZGUsIHRvZ2dsZTogZ3JwVG9nZ2xlLCBjaGlsZHJlbkNvbnRhaW5lcjogZ3JwQ2hpbGRyZW4gfSA9IGNyZWF0ZU5vZGUoXG4gICAgICAgIGdycENvbnRlbnQsXG4gICAgICAgIHRhYnNDb250YWluZXIsXG4gICAgICAgICdncm91cCcsXG4gICAgICAgIGlzR3JvdXBFeHBhbmRlZCxcbiAgICAgICAgKCkgPT4ge1xuICAgICAgICAgICAgaWYgKGV4cGFuZGVkTm9kZXMuaGFzKGdyb3VwS2V5KSkgZXhwYW5kZWROb2Rlcy5kZWxldGUoZ3JvdXBLZXkpO1xuICAgICAgICAgICAgZWxzZSBleHBhbmRlZE5vZGVzLmFkZChncm91cEtleSk7XG5cbiAgICAgICAgICAgIGNvbnN0IGV4cGFuZGVkID0gZXhwYW5kZWROb2Rlcy5oYXMoZ3JvdXBLZXkpO1xuICAgICAgICAgICAgZ3JwVG9nZ2xlLmNsYXNzTGlzdC50b2dnbGUoJ3JvdGF0ZWQnLCBleHBhbmRlZCk7XG4gICAgICAgICAgICBncnBDaGlsZHJlbiEuY2xhc3NMaXN0LnRvZ2dsZSgnZXhwYW5kZWQnLCBleHBhbmRlZCk7XG4gICAgICAgIH1cbiAgICApO1xuXG4gICAgLy8gQXBwbHkgYmFja2dyb3VuZCBjb2xvciB0byBncm91cCBub2RlXG4gICAgaWYgKGdyb3VwRGF0YS5jb2xvcikge1xuICAgICAgICBjb25zdCBjb2xvck5hbWUgPSBncm91cERhdGEuY29sb3I7XG4gICAgICAgIGNvbnN0IGhleCA9IEdST1VQX0NPTE9SU1tjb2xvck5hbWVdIHx8IGNvbG9yTmFtZTsgLy8gRmFsbGJhY2sgaWYgaXQncyBhbHJlYWR5IGhleFxuICAgICAgICBpZiAoaGV4LnN0YXJ0c1dpdGgoJyMnKSkge1xuICAgICAgICAgICAgZ3JvdXBOb2RlLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IGhleFRvUmdiYShoZXgsIDAuMSk7XG4gICAgICAgICAgICBncm91cE5vZGUuc3R5bGUuYm9yZGVyID0gYDFweCBzb2xpZCAke2hleFRvUmdiYShoZXgsIDAuMil9YDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBncm91cE5vZGU7XG59O1xuXG5jb25zdCByZW5kZXJXaW5kb3dOb2RlID0gKHdpbmRvdzogV2luZG93VmlldywgdmlzaWJsZVRhYnM6IFRhYldpdGhHcm91cFtdLCBxdWVyeTogc3RyaW5nKSA9PiB7XG4gICAgY29uc3Qgd2luZG93S2V5ID0gYHctJHt3aW5kb3cuaWR9YDtcbiAgICBjb25zdCBpc0V4cGFuZGVkID0gISFxdWVyeSB8fCBleHBhbmRlZE5vZGVzLmhhcyh3aW5kb3dLZXkpO1xuXG4gICAgLy8gV2luZG93IENoZWNrYm94IExvZ2ljXG4gICAgY29uc3QgYWxsVGFiSWRzID0gdmlzaWJsZVRhYnMubWFwKHQgPT4gdC5pZCk7XG4gICAgY29uc3Qgc2VsZWN0ZWRDb3VudCA9IGFsbFRhYklkcy5maWx0ZXIoaWQgPT4gc2VsZWN0ZWRUYWJzLmhhcyhpZCkpLmxlbmd0aDtcbiAgICBjb25zdCBpc0FsbCA9IHNlbGVjdGVkQ291bnQgPT09IGFsbFRhYklkcy5sZW5ndGggJiYgYWxsVGFiSWRzLmxlbmd0aCA+IDA7XG4gICAgY29uc3QgaXNTb21lID0gc2VsZWN0ZWRDb3VudCA+IDAgJiYgc2VsZWN0ZWRDb3VudCA8IGFsbFRhYklkcy5sZW5ndGg7XG5cbiAgICBjb25zdCB3aW5DaGVja2JveCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbnB1dFwiKTtcbiAgICB3aW5DaGVja2JveC50eXBlID0gXCJjaGVja2JveFwiO1xuICAgIHdpbkNoZWNrYm94LmNsYXNzTmFtZSA9IFwidHJlZS1jaGVja2JveFwiO1xuICAgIHdpbkNoZWNrYm94LmNoZWNrZWQgPSBpc0FsbDtcbiAgICB3aW5DaGVja2JveC5pbmRldGVybWluYXRlID0gaXNTb21lO1xuICAgIHdpbkNoZWNrYm94Lm9uY2xpY2sgPSAoZSkgPT4ge1xuICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICBjb25zdCB0YXJnZXRTdGF0ZSA9ICFpc0FsbDsgLy8gSWYgYWxsIHdlcmUgc2VsZWN0ZWQsIGRlc2VsZWN0LiBPdGhlcndpc2Ugc2VsZWN0IGFsbC5cbiAgICAgICAgYWxsVGFiSWRzLmZvckVhY2goaWQgPT4ge1xuICAgICAgICAgICAgaWYgKHRhcmdldFN0YXRlKSBzZWxlY3RlZFRhYnMuYWRkKGlkKTtcbiAgICAgICAgICAgIGVsc2Ugc2VsZWN0ZWRUYWJzLmRlbGV0ZShpZCk7XG4gICAgICAgIH0pO1xuICAgICAgICByZW5kZXJUcmVlKCk7XG4gICAgfTtcblxuICAgIC8vIFdpbmRvdyBDb250ZW50XG4gICAgY29uc3Qgd2luQ29udGVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgd2luQ29udGVudC5zdHlsZS5kaXNwbGF5ID0gXCJmbGV4XCI7XG4gICAgd2luQ29udGVudC5zdHlsZS5hbGlnbkl0ZW1zID0gXCJjZW50ZXJcIjtcbiAgICB3aW5Db250ZW50LnN0eWxlLmZsZXggPSBcIjFcIjtcbiAgICB3aW5Db250ZW50LnN0eWxlLm92ZXJmbG93ID0gXCJoaWRkZW5cIjtcblxuICAgIGNvbnN0IGxhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBsYWJlbC5jbGFzc05hbWUgPSBcInRyZWUtbGFiZWxcIjtcbiAgICBsYWJlbC50ZXh0Q29udGVudCA9IHdpbmRvdy50aXRsZTtcblxuICAgIGNvbnN0IGNvdW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBjb3VudC5jbGFzc05hbWUgPSBcInRyZWUtY291bnRcIjtcbiAgICBjb3VudC50ZXh0Q29udGVudCA9IGAoJHt2aXNpYmxlVGFicy5sZW5ndGh9IFRhYnMpYDtcblxuICAgIHdpbkNvbnRlbnQuYXBwZW5kKHdpbkNoZWNrYm94LCBsYWJlbCwgY291bnQpO1xuXG4gICAgLy8gQ2hpbGRyZW4gKEdyb3VwcylcbiAgICBjb25zdCBjaGlsZHJlbkNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG5cbiAgICAvLyBHcm91cCB0YWJzXG4gICAgY29uc3QgZ3JvdXBzID0gbmV3IE1hcDxzdHJpbmcsIHsgY29sb3I6IHN0cmluZzsgdGFiczogVGFiV2l0aEdyb3VwW10gfT4oKTtcbiAgICBjb25zdCB1bmdyb3VwZWRUYWJzOiBUYWJXaXRoR3JvdXBbXSA9IFtdO1xuICAgIHZpc2libGVUYWJzLmZvckVhY2godGFiID0+IHtcbiAgICAgICAgaWYgKHRhYi5ncm91cExhYmVsKSB7XG4gICAgICAgICAgICBjb25zdCBrZXkgPSB0YWIuZ3JvdXBMYWJlbDtcbiAgICAgICAgICAgIGNvbnN0IGVudHJ5ID0gZ3JvdXBzLmdldChrZXkpID8/IHsgY29sb3I6IHRhYi5ncm91cENvbG9yISwgdGFiczogW10gfTtcbiAgICAgICAgICAgIGVudHJ5LnRhYnMucHVzaCh0YWIpO1xuICAgICAgICAgICAgZ3JvdXBzLnNldChrZXksIGVudHJ5KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHVuZ3JvdXBlZFRhYnMucHVzaCh0YWIpO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBBcnJheS5mcm9tKGdyb3Vwcy5lbnRyaWVzKCkpLmZvckVhY2goKFtncm91cExhYmVsLCBncm91cERhdGFdKSA9PiB7XG4gICAgICAgIGNoaWxkcmVuQ29udGFpbmVyLmFwcGVuZENoaWxkKHJlbmRlckdyb3VwTm9kZShncm91cExhYmVsLCBncm91cERhdGEsIHdpbmRvd0tleSwgcXVlcnkpKTtcbiAgICB9KTtcblxuICAgIHVuZ3JvdXBlZFRhYnMuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgICBjaGlsZHJlbkNvbnRhaW5lci5hcHBlbmRDaGlsZChyZW5kZXJUYWJOb2RlKHRhYikpO1xuICAgIH0pO1xuXG4gICAgY29uc3QgeyBub2RlOiB3aW5Ob2RlLCB0b2dnbGU6IHdpblRvZ2dsZSwgY2hpbGRyZW5Db250YWluZXI6IHdpbkNoaWxkcmVuIH0gPSBjcmVhdGVOb2RlKFxuICAgICAgICB3aW5Db250ZW50LFxuICAgICAgICBjaGlsZHJlbkNvbnRhaW5lcixcbiAgICAgICAgJ3dpbmRvdycsXG4gICAgICAgIGlzRXhwYW5kZWQsXG4gICAgICAgICgpID0+IHtcbiAgICAgICAgICAgICBpZiAoZXhwYW5kZWROb2Rlcy5oYXMod2luZG93S2V5KSkgZXhwYW5kZWROb2Rlcy5kZWxldGUod2luZG93S2V5KTtcbiAgICAgICAgICAgICBlbHNlIGV4cGFuZGVkTm9kZXMuYWRkKHdpbmRvd0tleSk7XG5cbiAgICAgICAgICAgICBjb25zdCBleHBhbmRlZCA9IGV4cGFuZGVkTm9kZXMuaGFzKHdpbmRvd0tleSk7XG4gICAgICAgICAgICAgd2luVG9nZ2xlLmNsYXNzTGlzdC50b2dnbGUoJ3JvdGF0ZWQnLCBleHBhbmRlZCk7XG4gICAgICAgICAgICAgd2luQ2hpbGRyZW4hLmNsYXNzTGlzdC50b2dnbGUoJ2V4cGFuZGVkJywgZXhwYW5kZWQpO1xuICAgICAgICB9XG4gICAgKTtcblxuICAgIHJldHVybiB3aW5Ob2RlO1xufTtcblxuY29uc3QgcmVuZGVyVHJlZSA9ICgpID0+IHtcbiAgY29uc3QgcXVlcnkgPSBzZWFyY2hJbnB1dC52YWx1ZS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgd2luZG93c0NvbnRhaW5lci5pbm5lckhUTUwgPSBcIlwiO1xuXG4gIC8vIEZpbHRlciBMb2dpY1xuICBjb25zdCBmaWx0ZXJlZCA9IHdpbmRvd1N0YXRlXG4gICAgLm1hcCgod2luZG93KSA9PiB7XG4gICAgICBpZiAoIXF1ZXJ5KSByZXR1cm4geyB3aW5kb3csIHZpc2libGVUYWJzOiB3aW5kb3cudGFicyB9O1xuICAgICAgY29uc3QgdmlzaWJsZVRhYnMgPSB3aW5kb3cudGFicy5maWx0ZXIoXG4gICAgICAgICh0YWIpID0+IHRhYi50aXRsZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHF1ZXJ5KSB8fCB0YWIudXJsLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMocXVlcnkpXG4gICAgICApO1xuICAgICAgcmV0dXJuIHsgd2luZG93LCB2aXNpYmxlVGFicyB9O1xuICAgIH0pXG4gICAgLmZpbHRlcigoeyB2aXNpYmxlVGFicyB9KSA9PiB2aXNpYmxlVGFicy5sZW5ndGggPiAwIHx8ICFxdWVyeSk7XG5cbiAgZmlsdGVyZWQuZm9yRWFjaCgoeyB3aW5kb3csIHZpc2libGVUYWJzIH0pID0+IHtcbiAgICB3aW5kb3dzQ29udGFpbmVyLmFwcGVuZENoaWxkKHJlbmRlcldpbmRvd05vZGUod2luZG93LCB2aXNpYmxlVGFicywgcXVlcnkpKTtcbiAgfSk7XG5cbiAgdXBkYXRlU3RhdHMoKTtcbn07XG5cbi8vIFN0cmF0ZWd5IFJlbmRlcmluZ1xuZnVuY3Rpb24gdXBkYXRlU3RyYXRlZ3lWaWV3cyhzdHJhdGVnaWVzOiBTdHJhdGVneURlZmluaXRpb25bXSwgZW5hYmxlZElkczogc3RyaW5nW10pIHtcbiAgICAvLyAxLiBSZW5kZXIgQWN0aXZlIFN0cmF0ZWdpZXNcbiAgICBhY3RpdmVTdHJhdGVnaWVzTGlzdC5pbm5lckhUTUwgPSAnJztcblxuICAgIC8vIE1haW50YWluIG9yZGVyIGZyb20gZW5hYmxlZElkc1xuICAgIGNvbnN0IGVuYWJsZWRTdHJhdGVnaWVzID0gZW5hYmxlZElkc1xuICAgICAgICAubWFwKGlkID0+IHN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IGlkKSlcbiAgICAgICAgLmZpbHRlcigocyk6IHMgaXMgU3RyYXRlZ3lEZWZpbml0aW9uID0+ICEhcyk7XG5cbiAgICBlbmFibGVkU3RyYXRlZ2llcy5mb3JFYWNoKHN0cmF0ZWd5ID0+IHtcbiAgICAgICAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIHJvdy5jbGFzc05hbWUgPSAnc3RyYXRlZ3ktcm93JztcbiAgICAgICAgcm93LmRhdGFzZXQuaWQgPSBzdHJhdGVneS5pZDtcbiAgICAgICAgcm93LmRyYWdnYWJsZSA9IHRydWU7XG5cbiAgICAgICAgLy8gRHJhZyBIYW5kbGVcbiAgICAgICAgY29uc3QgaGFuZGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIGhhbmRsZS5jbGFzc05hbWUgPSAnc3RyYXRlZ3ktZHJhZy1oYW5kbGUnO1xuICAgICAgICBoYW5kbGUuaW5uZXJIVE1MID0gJ1x1MjJFRVx1MjJFRSc7XG5cbiAgICAgICAgLy8gTGFiZWxcbiAgICAgICAgY29uc3QgbGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG4gICAgICAgIGxhYmVsLmNsYXNzTmFtZSA9ICdzdHJhdGVneS1sYWJlbCc7XG4gICAgICAgIGxhYmVsLnRleHRDb250ZW50ID0gc3RyYXRlZ3kubGFiZWw7XG5cbiAgICAgICAgLy8gVGFnc1xuICAgICAgICBsZXQgdGFnc0h0bWwgPSAnJztcbiAgICAgICAgaWYgKHN0cmF0ZWd5LnRhZ3MpIHtcbiAgICAgICAgICAgICBzdHJhdGVneS50YWdzLmZvckVhY2godGFnID0+IHtcbiAgICAgICAgICAgICAgICB0YWdzSHRtbCArPSBgPHNwYW4gY2xhc3M9XCJ0YWcgdGFnLSR7dGFnfVwiPiR7dGFnfTwvc3Bhbj5gO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBjb250ZW50V3JhcHBlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICBjb250ZW50V3JhcHBlci5zdHlsZS5mbGV4ID0gXCIxXCI7XG4gICAgICAgIGNvbnRlbnRXcmFwcGVyLnN0eWxlLmRpc3BsYXkgPSBcImZsZXhcIjtcbiAgICAgICAgY29udGVudFdyYXBwZXIuc3R5bGUuYWxpZ25JdGVtcyA9IFwiY2VudGVyXCI7XG4gICAgICAgIGNvbnRlbnRXcmFwcGVyLmFwcGVuZENoaWxkKGxhYmVsKTtcbiAgICAgICAgaWYgKHRhZ3NIdG1sKSB7XG4gICAgICAgICAgICAgY29uc3QgdGFnc0NvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcbiAgICAgICAgICAgICB0YWdzQ29udGFpbmVyLmlubmVySFRNTCA9IHRhZ3NIdG1sO1xuICAgICAgICAgICAgIGNvbnRlbnRXcmFwcGVyLmFwcGVuZENoaWxkKHRhZ3NDb250YWluZXIpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmVtb3ZlIEJ1dHRvblxuICAgICAgICBjb25zdCByZW1vdmVCdG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgICAgICAgcmVtb3ZlQnRuLmNsYXNzTmFtZSA9ICdzdHJhdGVneS1yZW1vdmUtYnRuJztcbiAgICAgICAgcmVtb3ZlQnRuLmlubmVySFRNTCA9IElDT05TLmNsb3NlOyAvLyBVc2UgSWNvbiBmb3IgY29uc2lzdGVuY3lcbiAgICAgICAgcmVtb3ZlQnRuLnRpdGxlID0gXCJSZW1vdmUgc3RyYXRlZ3lcIjtcbiAgICAgICAgcmVtb3ZlQnRuLm9uY2xpY2sgPSBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICAgYXdhaXQgdG9nZ2xlU3RyYXRlZ3koc3RyYXRlZ3kuaWQsIGZhbHNlKTtcbiAgICAgICAgfTtcblxuICAgICAgICByb3cuYXBwZW5kQ2hpbGQoaGFuZGxlKTtcbiAgICAgICAgcm93LmFwcGVuZENoaWxkKGNvbnRlbnRXcmFwcGVyKTtcblxuICAgICAgICBpZiAoc3RyYXRlZ3kuaXNDdXN0b20pIHtcbiAgICAgICAgICAgICBjb25zdCBhdXRvUnVuQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgICAgICAgICAgICBhdXRvUnVuQnRuLmNsYXNzTmFtZSA9IGBhY3Rpb24tYnRuIGF1dG8tcnVuICR7c3RyYXRlZ3kuYXV0b1J1biA/ICdhY3RpdmUnIDogJyd9YDtcbiAgICAgICAgICAgICBhdXRvUnVuQnRuLmlubmVySFRNTCA9IElDT05TLmF1dG9SdW47XG4gICAgICAgICAgICAgYXV0b1J1bkJ0bi50aXRsZSA9IGBBdXRvIFJ1bjogJHtzdHJhdGVneS5hdXRvUnVuID8gJ09OJyA6ICdPRkYnfWA7XG4gICAgICAgICAgICAgYXV0b1J1bkJ0bi5zdHlsZS5vcGFjaXR5ID0gc3RyYXRlZ3kuYXV0b1J1biA/IFwiMVwiIDogXCIwLjNcIjtcbiAgICAgICAgICAgICBhdXRvUnVuQnRuLm9uY2xpY2sgPSBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgICBpZiAoIXByZWZlcmVuY2VzPy5jdXN0b21TdHJhdGVnaWVzKSByZXR1cm47XG4gICAgICAgICAgICAgICAgIGNvbnN0IGN1c3RvbVN0cmF0SW5kZXggPSBwcmVmZXJlbmNlcy5jdXN0b21TdHJhdGVnaWVzLmZpbmRJbmRleChzID0+IHMuaWQgPT09IHN0cmF0ZWd5LmlkKTtcbiAgICAgICAgICAgICAgICAgaWYgKGN1c3RvbVN0cmF0SW5kZXggIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN0cmF0ID0gcHJlZmVyZW5jZXMuY3VzdG9tU3RyYXRlZ2llc1tjdXN0b21TdHJhdEluZGV4XTtcbiAgICAgICAgICAgICAgICAgICAgc3RyYXQuYXV0b1J1biA9ICFzdHJhdC5hdXRvUnVuO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBpc0FjdGl2ZSA9ICEhc3RyYXQuYXV0b1J1bjtcbiAgICAgICAgICAgICAgICAgICAgYXV0b1J1bkJ0bi5jbGFzc0xpc3QudG9nZ2xlKCdhY3RpdmUnLCBpc0FjdGl2ZSk7XG4gICAgICAgICAgICAgICAgICAgIGF1dG9SdW5CdG4uc3R5bGUub3BhY2l0eSA9IGlzQWN0aXZlID8gXCIxXCIgOiBcIjAuM1wiO1xuICAgICAgICAgICAgICAgICAgICBhdXRvUnVuQnRuLnRpdGxlID0gYEF1dG8gUnVuOiAke2lzQWN0aXZlID8gJ09OJyA6ICdPRkYnfWA7XG4gICAgICAgICAgICAgICAgICAgIGxvY2FsUHJlZmVyZW5jZXNNb2RpZmllZFRpbWUgPSBEYXRlLm5vdygpO1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBzZW5kTWVzc2FnZShcInNhdmVQcmVmZXJlbmNlc1wiLCB7IGN1c3RvbVN0cmF0ZWdpZXM6IHByZWZlcmVuY2VzLmN1c3RvbVN0cmF0ZWdpZXMgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgcm93LmFwcGVuZENoaWxkKGF1dG9SdW5CdG4pO1xuICAgICAgICB9XG5cbiAgICAgICAgcm93LmFwcGVuZENoaWxkKHJlbW92ZUJ0bik7XG5cbiAgICAgICAgYWRkRG5ETGlzdGVuZXJzKHJvdyk7XG4gICAgICAgIGFjdGl2ZVN0cmF0ZWdpZXNMaXN0LmFwcGVuZENoaWxkKHJvdyk7XG4gICAgfSk7XG5cbiAgICAvLyAyLiBSZW5kZXIgQWRkIFN0cmF0ZWd5IE9wdGlvbnNcbiAgICBhZGRTdHJhdGVneVNlbGVjdC5pbm5lckhUTUwgPSAnPG9wdGlvbiB2YWx1ZT1cIlwiIGRpc2FibGVkIHNlbGVjdGVkPlNlbGVjdCBTdHJhdGVneS4uLjwvb3B0aW9uPic7XG5cbiAgICBjb25zdCBkaXNhYmxlZFN0cmF0ZWdpZXMgPSBzdHJhdGVnaWVzLmZpbHRlcihzID0+ICFlbmFibGVkSWRzLmluY2x1ZGVzKHMuaWQpKTtcbiAgICBkaXNhYmxlZFN0cmF0ZWdpZXMuc29ydCgoYSwgYikgPT4gYS5sYWJlbC5sb2NhbGVDb21wYXJlKGIubGFiZWwpKTtcblxuICAgIC8vIFNlcGFyYXRlIHN0cmF0ZWdpZXMgd2l0aCBBdXRvLVJ1biBhY3RpdmUgYnV0IG5vdCBpbiBzb3J0aW5nIGxpc3RcbiAgICBjb25zdCBiYWNrZ3JvdW5kU3RyYXRlZ2llczogU3RyYXRlZ3lEZWZpbml0aW9uW10gPSBbXTtcbiAgICBjb25zdCBhdmFpbGFibGVTdHJhdGVnaWVzOiBTdHJhdGVneURlZmluaXRpb25bXSA9IFtdO1xuXG4gICAgZGlzYWJsZWRTdHJhdGVnaWVzLmZvckVhY2gocyA9PiB7XG4gICAgICAgIGlmIChzLmlzQ3VzdG9tICYmIHMuYXV0b1J1bikge1xuICAgICAgICAgICAgYmFja2dyb3VuZFN0cmF0ZWdpZXMucHVzaChzKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGF2YWlsYWJsZVN0cmF0ZWdpZXMucHVzaChzKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gUG9wdWxhdGUgU2VsZWN0XG4gICAgLy8gV2UgaW5jbHVkZSBiYWNrZ3JvdW5kIHN0cmF0ZWdpZXMgaW4gdGhlIGRyb3Bkb3duIHRvbyBzbyB0aGV5IGNhbiBiZSBtb3ZlZCB0byBcIkFjdGl2ZVwiIHNvcnRpbmcgZWFzaWx5XG4gICAgLy8gYnV0IHdlIG1pZ2h0IG1hcmsgdGhlbVxuICAgIFsuLi5iYWNrZ3JvdW5kU3RyYXRlZ2llcywgLi4uYXZhaWxhYmxlU3RyYXRlZ2llc10uc29ydCgoYSwgYikgPT4gYS5sYWJlbC5sb2NhbGVDb21wYXJlKGIubGFiZWwpKS5mb3JFYWNoKHN0cmF0ZWd5ID0+IHtcbiAgICAgICAgY29uc3Qgb3B0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnb3B0aW9uJyk7XG4gICAgICAgIG9wdGlvbi52YWx1ZSA9IHN0cmF0ZWd5LmlkO1xuICAgICAgICBvcHRpb24udGV4dENvbnRlbnQgPSBzdHJhdGVneS5sYWJlbDtcbiAgICAgICAgYWRkU3RyYXRlZ3lTZWxlY3QuYXBwZW5kQ2hpbGQob3B0aW9uKTtcbiAgICB9KTtcblxuICAgIC8vIEZvcmNlIHNlbGVjdGlvbiBvZiBwbGFjZWhvbGRlclxuICAgIGFkZFN0cmF0ZWd5U2VsZWN0LnZhbHVlID0gXCJcIjtcblxuICAgIC8vIDMuIFJlbmRlciBCYWNrZ3JvdW5kIFN0cmF0ZWdpZXMgU2VjdGlvbiAoaWYgYW55KVxuICAgIGxldCBiZ1NlY3Rpb24gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJhY2tncm91bmRTdHJhdGVnaWVzU2VjdGlvblwiKTtcbiAgICBpZiAoYmFja2dyb3VuZFN0cmF0ZWdpZXMubGVuZ3RoID4gMCkge1xuICAgICAgICBpZiAoIWJnU2VjdGlvbikge1xuICAgICAgICAgICAgYmdTZWN0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgICAgIGJnU2VjdGlvbi5pZCA9IFwiYmFja2dyb3VuZFN0cmF0ZWdpZXNTZWN0aW9uXCI7XG4gICAgICAgICAgICBiZ1NlY3Rpb24uY2xhc3NOYW1lID0gXCJhY3RpdmUtc3RyYXRlZ2llcy1zZWN0aW9uXCI7XG4gICAgICAgICAgICAvLyBTdHlsZSBpdCB0byBsb29rIGxpa2UgYWN0aXZlIHNlY3Rpb24gYnV0IGRpc3RpbmN0XG4gICAgICAgICAgICBiZ1NlY3Rpb24uc3R5bGUubWFyZ2luVG9wID0gXCI4cHhcIjtcbiAgICAgICAgICAgIGJnU2VjdGlvbi5zdHlsZS5ib3JkZXJUb3AgPSBcIjFweCBkYXNoZWQgdmFyKC0tYm9yZGVyLWNvbG9yKVwiO1xuICAgICAgICAgICAgYmdTZWN0aW9uLnN0eWxlLnBhZGRpbmdUb3AgPSBcIjhweFwiO1xuXG4gICAgICAgICAgICBjb25zdCBoZWFkZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgaGVhZGVyLmNsYXNzTmFtZSA9IFwic2VjdGlvbi1oZWFkZXJcIjtcbiAgICAgICAgICAgIGhlYWRlci50ZXh0Q29udGVudCA9IFwiQmFja2dyb3VuZCBBdXRvLVJ1blwiO1xuICAgICAgICAgICAgaGVhZGVyLnRpdGxlID0gXCJUaGVzZSBzdHJhdGVnaWVzIHJ1biBhdXRvbWF0aWNhbGx5IGJ1dCBhcmUgbm90IHVzZWQgZm9yIHNvcnRpbmcvZ3JvdXBpbmcgb3JkZXIuXCI7XG4gICAgICAgICAgICBiZ1NlY3Rpb24uYXBwZW5kQ2hpbGQoaGVhZGVyKTtcblxuICAgICAgICAgICAgY29uc3QgbGlzdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgICAgICBsaXN0LmNsYXNzTmFtZSA9IFwic3RyYXRlZ3ktbGlzdFwiO1xuICAgICAgICAgICAgYmdTZWN0aW9uLmFwcGVuZENoaWxkKGxpc3QpO1xuXG4gICAgICAgICAgICAvLyBJbnNlcnQgYWZ0ZXIgYWN0aXZlIGxpc3RcbiAgICAgICAgICAgIGFjdGl2ZVN0cmF0ZWdpZXNMaXN0LnBhcmVudEVsZW1lbnQ/LmFmdGVyKGJnU2VjdGlvbik7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBsaXN0ID0gYmdTZWN0aW9uLnF1ZXJ5U2VsZWN0b3IoXCIuc3RyYXRlZ3ktbGlzdFwiKSBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgbGlzdC5pbm5lckhUTUwgPSBcIlwiO1xuXG4gICAgICAgIGJhY2tncm91bmRTdHJhdGVnaWVzLmZvckVhY2goc3RyYXRlZ3kgPT4ge1xuICAgICAgICAgICAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICByb3cuY2xhc3NOYW1lID0gJ3N0cmF0ZWd5LXJvdyc7XG4gICAgICAgICAgICByb3cuZGF0YXNldC5pZCA9IHN0cmF0ZWd5LmlkO1xuXG4gICAgICAgICAgICBjb25zdCBsYWJlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcbiAgICAgICAgICAgIGxhYmVsLmNsYXNzTmFtZSA9ICdzdHJhdGVneS1sYWJlbCc7XG4gICAgICAgICAgICBsYWJlbC50ZXh0Q29udGVudCA9IHN0cmF0ZWd5LmxhYmVsO1xuICAgICAgICAgICAgbGFiZWwuc3R5bGUub3BhY2l0eSA9IFwiMC43XCI7XG5cbiAgICAgICAgICAgIGNvbnN0IGF1dG9SdW5CdG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICAgICAgICAgICAgYXV0b1J1bkJ0bi5jbGFzc05hbWUgPSBgYWN0aW9uLWJ0biBhdXRvLXJ1biBhY3RpdmVgO1xuICAgICAgICAgICAgYXV0b1J1bkJ0bi5pbm5lckhUTUwgPSBJQ09OUy5hdXRvUnVuO1xuICAgICAgICAgICAgYXV0b1J1bkJ0bi50aXRsZSA9IGBBdXRvIFJ1bjogT04gKENsaWNrIHRvIGRpc2FibGUpYDtcbiAgICAgICAgICAgIGF1dG9SdW5CdG4uc3R5bGUubWFyZ2luTGVmdCA9IFwiYXV0b1wiO1xuICAgICAgICAgICAgYXV0b1J1bkJ0bi5vbmNsaWNrID0gYXN5bmMgKGUpID0+IHtcbiAgICAgICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICAgaWYgKCFwcmVmZXJlbmNlcz8uY3VzdG9tU3RyYXRlZ2llcykgcmV0dXJuO1xuICAgICAgICAgICAgICAgICBjb25zdCBjdXN0b21TdHJhdEluZGV4ID0gcHJlZmVyZW5jZXMuY3VzdG9tU3RyYXRlZ2llcy5maW5kSW5kZXgocyA9PiBzLmlkID09PSBzdHJhdGVneS5pZCk7XG4gICAgICAgICAgICAgICAgIGlmIChjdXN0b21TdHJhdEluZGV4ICE9PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBzdHJhdCA9IHByZWZlcmVuY2VzLmN1c3RvbVN0cmF0ZWdpZXNbY3VzdG9tU3RyYXRJbmRleF07XG4gICAgICAgICAgICAgICAgICAgIHN0cmF0LmF1dG9SdW4gPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgbG9jYWxQcmVmZXJlbmNlc01vZGlmaWVkVGltZSA9IERhdGUubm93KCk7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHNlbmRNZXNzYWdlKFwic2F2ZVByZWZlcmVuY2VzXCIsIHsgY3VzdG9tU3RyYXRlZ2llczogcHJlZmVyZW5jZXMuY3VzdG9tU3RyYXRlZ2llcyB9KTtcbiAgICAgICAgICAgICAgICAgICAgLy8gVUkgdXBkYXRlIHRyaWdnZXJzIHZpYSBzZW5kTWVzc2FnZSByZXNwb25zZSBvciByZS1yZW5kZXJcbiAgICAgICAgICAgICAgICAgICAgLy8gQnV0IHdlIHNob3VsZCByZS1yZW5kZXIgaW1tZWRpYXRlbHkgZm9yIHJlc3BvbnNpdmVuZXNzXG4gICAgICAgICAgICAgICAgICAgIHVwZGF0ZVN0cmF0ZWd5Vmlld3Moc3RyYXRlZ2llcywgZW5hYmxlZElkcyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgcm93LmFwcGVuZENoaWxkKGxhYmVsKTtcbiAgICAgICAgICAgIHJvdy5hcHBlbmRDaGlsZChhdXRvUnVuQnRuKTtcbiAgICAgICAgICAgIGxpc3QuYXBwZW5kQ2hpbGQocm93KTtcbiAgICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGJnU2VjdGlvbikgYmdTZWN0aW9uLnJlbW92ZSgpO1xuICAgIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gdG9nZ2xlU3RyYXRlZ3koaWQ6IHN0cmluZywgZW5hYmxlOiBib29sZWFuKSB7XG4gICAgaWYgKCFwcmVmZXJlbmNlcykgcmV0dXJuO1xuXG4gICAgY29uc3QgYWxsU3RyYXRlZ2llcyA9IGdldFN0cmF0ZWdpZXMocHJlZmVyZW5jZXMuY3VzdG9tU3RyYXRlZ2llcyk7XG4gICAgY29uc3QgdmFsaWRJZHMgPSBuZXcgU2V0KGFsbFN0cmF0ZWdpZXMubWFwKHMgPT4gcy5pZCkpO1xuXG4gICAgLy8gQ2xlYW4gY3VycmVudCBsaXN0IGJ5IHJlbW92aW5nIHN0YWxlIElEc1xuICAgIGxldCBjdXJyZW50ID0gKHByZWZlcmVuY2VzLnNvcnRpbmcgfHwgW10pLmZpbHRlcihzSWQgPT4gdmFsaWRJZHMuaGFzKHNJZCkpO1xuXG4gICAgaWYgKGVuYWJsZSkge1xuICAgICAgICBpZiAoIWN1cnJlbnQuaW5jbHVkZXMoaWQpKSB7XG4gICAgICAgICAgICBjdXJyZW50LnB1c2goaWQpO1xuICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgY3VycmVudCA9IGN1cnJlbnQuZmlsdGVyKHNJZCA9PiBzSWQgIT09IGlkKTtcbiAgICB9XG5cbiAgICBwcmVmZXJlbmNlcy5zb3J0aW5nID0gY3VycmVudDtcbiAgICBsb2NhbFByZWZlcmVuY2VzTW9kaWZpZWRUaW1lID0gRGF0ZS5ub3coKTtcbiAgICBhd2FpdCBzZW5kTWVzc2FnZShcInNhdmVQcmVmZXJlbmNlc1wiLCB7IHNvcnRpbmc6IGN1cnJlbnQgfSk7XG5cbiAgICAvLyBSZS1yZW5kZXJcbiAgICB1cGRhdGVTdHJhdGVneVZpZXdzKGFsbFN0cmF0ZWdpZXMsIGN1cnJlbnQpO1xufVxuXG5mdW5jdGlvbiBhZGREbkRMaXN0ZW5lcnMocm93OiBIVE1MRWxlbWVudCkge1xuICByb3cuYWRkRXZlbnRMaXN0ZW5lcignZHJhZ3N0YXJ0JywgKGUpID0+IHtcbiAgICByb3cuY2xhc3NMaXN0LmFkZCgnZHJhZ2dpbmcnKTtcbiAgICBpZiAoZS5kYXRhVHJhbnNmZXIpIHtcbiAgICAgICAgZS5kYXRhVHJhbnNmZXIuZWZmZWN0QWxsb3dlZCA9ICdtb3ZlJztcbiAgICB9XG4gIH0pO1xuXG4gIHJvdy5hZGRFdmVudExpc3RlbmVyKCdkcmFnZW5kJywgYXN5bmMgKCkgPT4ge1xuICAgIHJvdy5jbGFzc0xpc3QucmVtb3ZlKCdkcmFnZ2luZycpO1xuICAgIC8vIFNhdmUgb3JkZXJcbiAgICBpZiAocHJlZmVyZW5jZXMpIHtcbiAgICAgICAgY29uc3QgY3VycmVudFNvcnRpbmcgPSBnZXRTZWxlY3RlZFNvcnRpbmcoKTtcbiAgICAgICAgLy8gQ2hlY2sgaWYgb3JkZXIgY2hhbmdlZFxuICAgICAgICBjb25zdCBvbGRTb3J0aW5nID0gcHJlZmVyZW5jZXMuc29ydGluZyB8fCBbXTtcbiAgICAgICAgaWYgKEpTT04uc3RyaW5naWZ5KGN1cnJlbnRTb3J0aW5nKSAhPT0gSlNPTi5zdHJpbmdpZnkob2xkU29ydGluZykpIHtcbiAgICAgICAgICAgIHByZWZlcmVuY2VzLnNvcnRpbmcgPSBjdXJyZW50U29ydGluZztcbiAgICAgICAgICAgIGxvY2FsUHJlZmVyZW5jZXNNb2RpZmllZFRpbWUgPSBEYXRlLm5vdygpO1xuICAgICAgICAgICAgYXdhaXQgc2VuZE1lc3NhZ2UoXCJzYXZlUHJlZmVyZW5jZXNcIiwgeyBzb3J0aW5nOiBjdXJyZW50U29ydGluZyB9KTtcbiAgICAgICAgfVxuICAgIH1cbiAgfSk7XG59XG5cbmZ1bmN0aW9uIHNldHVwQ29udGFpbmVyRG5EKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcbiAgICBjb250YWluZXIuYWRkRXZlbnRMaXN0ZW5lcignZHJhZ292ZXInLCAoZSkgPT4ge1xuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIGNvbnN0IGFmdGVyRWxlbWVudCA9IGdldERyYWdBZnRlckVsZW1lbnQoY29udGFpbmVyLCBlLmNsaWVudFksICcuc3RyYXRlZ3ktcm93Om5vdCguZHJhZ2dpbmcpJyk7XG4gICAgICAgIGNvbnN0IGRyYWdnYWJsZVJvdyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5zdHJhdGVneS1yb3cuZHJhZ2dpbmcnKTtcbiAgICAgICAgaWYgKGRyYWdnYWJsZVJvdyAmJiBkcmFnZ2FibGVSb3cucGFyZW50RWxlbWVudCA9PT0gY29udGFpbmVyKSB7XG4gICAgICAgICAgICAgaWYgKGFmdGVyRWxlbWVudCA9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKGRyYWdnYWJsZVJvdyk7XG4gICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb250YWluZXIuaW5zZXJ0QmVmb3JlKGRyYWdnYWJsZVJvdywgYWZ0ZXJFbGVtZW50KTtcbiAgICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuc2V0dXBDb250YWluZXJEbkQoYWN0aXZlU3RyYXRlZ2llc0xpc3QpO1xuXG5jb25zdCB1cGRhdGVVSSA9IChcbiAgc3RhdGVEYXRhOiB7IGdyb3VwczogVGFiR3JvdXBbXTsgcHJlZmVyZW5jZXM6IFByZWZlcmVuY2VzIH0sXG4gIGN1cnJlbnRXaW5kb3c6IGNocm9tZS53aW5kb3dzLldpbmRvdyB8IHVuZGVmaW5lZCxcbiAgY2hyb21lV2luZG93czogY2hyb21lLndpbmRvd3MuV2luZG93W10sXG4gIGlzUHJlbGltaW5hcnkgPSBmYWxzZVxuKSA9PiB7XG4gICAgLy8gSWYgd2UgbW9kaWZpZWQgcHJlZmVyZW5jZXMgbG9jYWxseSB3aXRoaW4gdGhlIGxhc3QgMiBzZWNvbmRzLCBpZ25vcmUgdGhlIGluY29taW5nIHByZWZlcmVuY2VzIGZvciBzb3J0aW5nXG4gICAgY29uc3QgdGltZVNpbmNlTG9jYWxVcGRhdGUgPSBEYXRlLm5vdygpIC0gbG9jYWxQcmVmZXJlbmNlc01vZGlmaWVkVGltZTtcbiAgICBjb25zdCBzaG91bGRVcGRhdGVQcmVmZXJlbmNlcyA9IHRpbWVTaW5jZUxvY2FsVXBkYXRlID4gMjAwMDtcblxuICAgIGlmIChzaG91bGRVcGRhdGVQcmVmZXJlbmNlcykge1xuICAgICAgICBwcmVmZXJlbmNlcyA9IHN0YXRlRGF0YS5wcmVmZXJlbmNlcztcbiAgICB9IGVsc2Uge1xuICAgICAgICAvLyBLZWVwIGxvY2FsIHNvcnRpbmcvc3RyYXRlZ2llcywgdXBkYXRlIG90aGVyc1xuICAgICAgICBpZiAocHJlZmVyZW5jZXMgJiYgc3RhdGVEYXRhLnByZWZlcmVuY2VzKSB7XG4gICAgICAgICAgICAgcHJlZmVyZW5jZXMgPSB7XG4gICAgICAgICAgICAgICAgIC4uLnN0YXRlRGF0YS5wcmVmZXJlbmNlcyxcbiAgICAgICAgICAgICAgICAgc29ydGluZzogcHJlZmVyZW5jZXMuc29ydGluZyxcbiAgICAgICAgICAgICAgICAgY3VzdG9tU3RyYXRlZ2llczogcHJlZmVyZW5jZXMuY3VzdG9tU3RyYXRlZ2llc1xuICAgICAgICAgICAgIH07XG4gICAgICAgIH0gZWxzZSBpZiAoIXByZWZlcmVuY2VzKSB7XG4gICAgICAgICAgICBwcmVmZXJlbmNlcyA9IHN0YXRlRGF0YS5wcmVmZXJlbmNlcztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChwcmVmZXJlbmNlcykge1xuICAgICAgY29uc3QgcyA9IHByZWZlcmVuY2VzLnNvcnRpbmcgfHwgW107XG5cbiAgICAgIC8vIEluaXRpYWxpemUgTG9nZ2VyXG4gICAgICBzZXRMb2dnZXJQcmVmZXJlbmNlcyhwcmVmZXJlbmNlcyk7XG5cbiAgICAgIGNvbnN0IGFsbFN0cmF0ZWdpZXMgPSBnZXRTdHJhdGVnaWVzKHByZWZlcmVuY2VzLmN1c3RvbVN0cmF0ZWdpZXMpO1xuXG4gICAgICAvLyBSZW5kZXIgdW5pZmllZCBzdHJhdGVneSBsaXN0XG4gICAgICB1cGRhdGVTdHJhdGVneVZpZXdzKGFsbFN0cmF0ZWdpZXMsIHMpO1xuXG4gICAgICAvLyBJbml0aWFsIHRoZW1lIGxvYWRcbiAgICAgIGlmIChwcmVmZXJlbmNlcy50aGVtZSkge1xuICAgICAgICBhcHBseVRoZW1lKHByZWZlcmVuY2VzLnRoZW1lLCBmYWxzZSk7XG4gICAgICB9XG5cbiAgICAgIC8vIEluaXQgc2V0dGluZ3MgVUlcbiAgICAgIGlmIChwcmVmZXJlbmNlcy5sb2dMZXZlbCkge1xuICAgICAgICAgIGNvbnN0IHNlbGVjdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2dMZXZlbFNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICAgIGlmIChzZWxlY3QpIHNlbGVjdC52YWx1ZSA9IHByZWZlcmVuY2VzLmxvZ0xldmVsO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChjdXJyZW50V2luZG93KSB7XG4gICAgICBmb2N1c2VkV2luZG93SWQgPSBjdXJyZW50V2luZG93LmlkID8/IG51bGw7XG4gICAgfSBlbHNlIHtcbiAgICAgIGZvY3VzZWRXaW5kb3dJZCA9IG51bGw7XG4gICAgICBjb25zb2xlLndhcm4oXCJGYWlsZWQgdG8gZ2V0IGN1cnJlbnQgd2luZG93XCIpO1xuICAgIH1cblxuICAgIGNvbnN0IHdpbmRvd1RpdGxlcyA9IG5ldyBNYXA8bnVtYmVyLCBzdHJpbmc+KCk7XG5cbiAgICBjaHJvbWVXaW5kb3dzLmZvckVhY2goKHdpbikgPT4ge1xuICAgICAgaWYgKCF3aW4uaWQpIHJldHVybjtcbiAgICAgIGNvbnN0IGFjdGl2ZVRhYlRpdGxlID0gd2luLnRhYnM/LmZpbmQoKHRhYikgPT4gdGFiLmFjdGl2ZSk/LnRpdGxlO1xuICAgICAgY29uc3QgdGl0bGUgPSBhY3RpdmVUYWJUaXRsZSA/PyBgV2luZG93ICR7d2luLmlkfWA7XG4gICAgICB3aW5kb3dUaXRsZXMuc2V0KHdpbi5pZCwgdGl0bGUpO1xuICAgIH0pO1xuXG4gICAgd2luZG93U3RhdGUgPSBtYXBXaW5kb3dzKHN0YXRlRGF0YS5ncm91cHMsIHdpbmRvd1RpdGxlcyk7XG5cbiAgICBpZiAoZm9jdXNlZFdpbmRvd0lkICE9PSBudWxsKSB7XG4gICAgICAgIHdpbmRvd1N0YXRlLnNvcnQoKGEsIGIpID0+IHtcbiAgICAgICAgICAgIGlmIChhLmlkID09PSBmb2N1c2VkV2luZG93SWQpIHJldHVybiAtMTtcbiAgICAgICAgICAgIGlmIChiLmlkID09PSBmb2N1c2VkV2luZG93SWQpIHJldHVybiAxO1xuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmICghaW5pdGlhbFNlbGVjdGlvbkRvbmUgJiYgZm9jdXNlZFdpbmRvd0lkICE9PSBudWxsKSB7XG4gICAgICAgIGNvbnN0IGFjdGl2ZVdpbmRvdyA9IHdpbmRvd1N0YXRlLmZpbmQodyA9PiB3LmlkID09PSBmb2N1c2VkV2luZG93SWQpO1xuICAgICAgICBpZiAoYWN0aXZlV2luZG93KSB7XG4gICAgICAgICAgICAgZXhwYW5kZWROb2Rlcy5hZGQoYHctJHthY3RpdmVXaW5kb3cuaWR9YCk7XG4gICAgICAgICAgICAgYWN0aXZlV2luZG93LnRhYnMuZm9yRWFjaCh0ID0+IHNlbGVjdGVkVGFicy5hZGQodC5pZCkpO1xuXG4gICAgICAgICAgICAgLy8gSWYgd2Ugc3VjY2Vzc2Z1bGx5IGZvdW5kIGFuZCBzZWxlY3RlZCB0aGUgd2luZG93LCBtYXJrIGFzIGRvbmVcbiAgICAgICAgICAgICBpbml0aWFsU2VsZWN0aW9uRG9uZSA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoIWlzUHJlbGltaW5hcnkpIHtcbiAgICAgICAgaW5pdGlhbFNlbGVjdGlvbkRvbmUgPSB0cnVlO1xuICAgIH1cblxuICAgIHJlbmRlclRyZWUoKTtcbn07XG5cbmNvbnN0IGxvYWRTdGF0ZSA9IGFzeW5jICgpID0+IHtcbiAgbG9nSW5mbyhcIkxvYWRpbmcgcG9wdXAgc3RhdGVcIik7XG5cbiAgbGV0IGJnRmluaXNoZWQgPSBmYWxzZTtcblxuICBjb25zdCBmYXN0TG9hZCA9IGFzeW5jICgpID0+IHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBbbG9jYWxSZXMsIGN3LCBhd10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICAgICAgICBmZXRjaExvY2FsU3RhdGUoKSxcbiAgICAgICAgICAgIGNocm9tZS53aW5kb3dzLmdldEN1cnJlbnQoKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpLFxuICAgICAgICAgICAgY2hyb21lLndpbmRvd3MuZ2V0QWxsKHsgd2luZG93VHlwZXM6IFtcIm5vcm1hbFwiXSwgcG9wdWxhdGU6IHRydWUgfSkuY2F0Y2goKCkgPT4gW10pXG4gICAgICAgIF0pO1xuXG4gICAgICAgIC8vIE9ubHkgdXBkYXRlIGlmIGJhY2tncm91bmQgaGFzbid0IGZpbmlzaGVkIHlldFxuICAgICAgICBpZiAoIWJnRmluaXNoZWQgJiYgbG9jYWxSZXMub2sgJiYgbG9jYWxSZXMuZGF0YSkge1xuICAgICAgICAgICAgIHVwZGF0ZVVJKGxvY2FsUmVzLmRhdGEsIGN3LCBhdyBhcyBjaHJvbWUud2luZG93cy5XaW5kb3dbXSwgdHJ1ZSk7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihcIkZhc3QgbG9hZCBmYWlsZWRcIiwgZSk7XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IGJnTG9hZCA9IGFzeW5jICgpID0+IHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBbYmdSZXMsIGN3LCBhd10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICAgICAgICBmZXRjaFN0YXRlKCksXG4gICAgICAgICAgICBjaHJvbWUud2luZG93cy5nZXRDdXJyZW50KCkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKSxcbiAgICAgICAgICAgIGNocm9tZS53aW5kb3dzLmdldEFsbCh7IHdpbmRvd1R5cGVzOiBbXCJub3JtYWxcIl0sIHBvcHVsYXRlOiB0cnVlIH0pLmNhdGNoKCgpID0+IFtdKVxuICAgICAgICBdKTtcblxuICAgICAgICBiZ0ZpbmlzaGVkID0gdHJ1ZTsgLy8gTWFyayBhcyBmaW5pc2hlZCBzbyBmYXN0IGxvYWQgZG9lc24ndCBvdmVyd3JpdGUgaWYgaXQncyBzb21laG93IHNsb3dcblxuICAgICAgICBpZiAoYmdSZXMub2sgJiYgYmdSZXMuZGF0YSkge1xuICAgICAgICAgICAgIHVwZGF0ZVVJKGJnUmVzLmRhdGEsIGN3LCBhdyBhcyBjaHJvbWUud2luZG93cy5XaW5kb3dbXSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGxvYWQgc3RhdGU6XCIsIGJnUmVzLmVycm9yID8/IFwiVW5rbm93biBlcnJvclwiKTtcbiAgICAgICAgICAgIGlmICh3aW5kb3dTdGF0ZS5sZW5ndGggPT09IDApIHsgLy8gT25seSBzaG93IGVycm9yIGlmIHdlIGhhdmUgTk9USElORyBzaG93blxuICAgICAgICAgICAgICAgIHdpbmRvd3NDb250YWluZXIuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9XCJlcnJvci1zdGF0ZVwiIHN0eWxlPVwicGFkZGluZzogMjBweDsgY29sb3I6IHZhcigtLWVycm9yLWNvbG9yLCByZWQpOyB0ZXh0LWFsaWduOiBjZW50ZXI7XCI+XG4gICAgICAgICAgICAgICAgICAgIEZhaWxlZCB0byBsb2FkIHRhYnM6ICR7YmdSZXMuZXJyb3IgPz8gXCJVbmtub3duIGVycm9yXCJ9Ljxicj5cbiAgICAgICAgICAgICAgICAgICAgUGxlYXNlIHJlbG9hZCB0aGUgZXh0ZW5zaW9uIG9yIGNoZWNrIHBlcm1pc3Npb25zLlxuICAgICAgICAgICAgICAgIDwvZGl2PmA7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvciBsb2FkaW5nIHN0YXRlOlwiLCBlKTtcbiAgICB9XG4gIH07XG5cbiAgLy8gU3RhcnQgYm90aCBjb25jdXJyZW50bHlcbiAgYXdhaXQgUHJvbWlzZS5hbGwoW2Zhc3RMb2FkKCksIGJnTG9hZCgpXSk7XG59O1xuXG5jb25zdCBnZXRTZWxlY3RlZFNvcnRpbmcgPSAoKTogU29ydGluZ1N0cmF0ZWd5W10gPT4ge1xuICAgIC8vIFJlYWQgZnJvbSBET00gdG8gZ2V0IGN1cnJlbnQgb3JkZXIgb2YgYWN0aXZlIHN0cmF0ZWdpZXNcbiAgICByZXR1cm4gQXJyYXkuZnJvbShhY3RpdmVTdHJhdGVnaWVzTGlzdC5jaGlsZHJlbilcbiAgICAgICAgLm1hcChyb3cgPT4gKHJvdyBhcyBIVE1MRWxlbWVudCkuZGF0YXNldC5pZCBhcyBTb3J0aW5nU3RyYXRlZ3kpO1xufTtcblxuLy8gQWRkIGxpc3RlbmVyIGZvciBzZWxlY3RcbmFkZFN0cmF0ZWd5U2VsZWN0LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGFzeW5jIChlKSA9PiB7XG4gICAgY29uc3Qgc2VsZWN0ID0gZS50YXJnZXQgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgY29uc3QgaWQgPSBzZWxlY3QudmFsdWU7XG4gICAgaWYgKGlkKSB7XG4gICAgICAgIGF3YWl0IHRvZ2dsZVN0cmF0ZWd5KGlkLCB0cnVlKTtcbiAgICAgICAgc2VsZWN0LnZhbHVlID0gXCJcIjsgLy8gUmVzZXQgdG8gcGxhY2Vob2xkZXJcbiAgICB9XG59KTtcblxuY29uc3QgdHJpZ2dlckdyb3VwID0gYXN5bmMgKHNlbGVjdGlvbj86IEdyb3VwaW5nU2VsZWN0aW9uKSA9PiB7XG4gICAgbG9nSW5mbyhcIlRyaWdnZXJpbmcgZ3JvdXBpbmdcIiwgeyBzZWxlY3Rpb24gfSk7XG4gICAgc2hvd0xvYWRpbmcoXCJBcHBseWluZyBTdHJhdGVneS4uLlwiKTtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBzb3J0aW5nID0gZ2V0U2VsZWN0ZWRTb3J0aW5nKCk7XG4gICAgICAgIGF3YWl0IGFwcGx5R3JvdXBpbmcoeyBzZWxlY3Rpb24sIHNvcnRpbmcgfSk7XG4gICAgICAgIGF3YWl0IGxvYWRTdGF0ZSgpO1xuICAgIH0gZmluYWxseSB7XG4gICAgICAgIGhpZGVMb2FkaW5nKCk7XG4gICAgfVxufTtcblxuY2hyb21lLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKChtZXNzYWdlKSA9PiB7XG4gICAgaWYgKG1lc3NhZ2UudHlwZSA9PT0gJ2dyb3VwaW5nUHJvZ3Jlc3MnKSB7XG4gICAgICAgIGNvbnN0IHsgY29tcGxldGVkLCB0b3RhbCB9ID0gbWVzc2FnZS5wYXlsb2FkO1xuICAgICAgICB1cGRhdGVQcm9ncmVzcyhjb21wbGV0ZWQsIHRvdGFsKTtcbiAgICB9XG59KTtcblxuLy8gTGlzdGVuZXJzXG5zZWxlY3RBbGxDaGVja2JveC5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsIChlKSA9PiB7XG4gICAgY29uc3QgdGFyZ2V0U3RhdGUgPSAoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkuY2hlY2tlZDtcbiAgICBpZiAodGFyZ2V0U3RhdGUpIHtcbiAgICAgICAgLy8gU2VsZWN0IEFsbFxuICAgICAgICB3aW5kb3dTdGF0ZS5mb3JFYWNoKHdpbiA9PiB7XG4gICAgICAgICAgICB3aW4udGFicy5mb3JFYWNoKHRhYiA9PiBzZWxlY3RlZFRhYnMuYWRkKHRhYi5pZCkpO1xuICAgICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgICAvLyBEZXNlbGVjdCBBbGxcbiAgICAgICAgc2VsZWN0ZWRUYWJzLmNsZWFyKCk7XG4gICAgfVxuICAgIHJlbmRlclRyZWUoKTtcbn0pO1xuXG5idG5BcHBseT8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBsb2dJbmZvKFwiQXBwbHkgYnV0dG9uIGNsaWNrZWRcIiwgeyBzZWxlY3RlZENvdW50OiBzZWxlY3RlZFRhYnMuc2l6ZSB9KTtcbiAgICB0cmlnZ2VyR3JvdXAoeyB0YWJJZHM6IEFycmF5LmZyb20oc2VsZWN0ZWRUYWJzKSB9KTtcbn0pO1xuXG5idG5Vbmdyb3VwLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIGlmIChjb25maXJtKGBVbmdyb3VwICR7c2VsZWN0ZWRUYWJzLnNpemV9IHRhYnM/YCkpIHtcbiAgICAgIGxvZ0luZm8oXCJVbmdyb3VwaW5nIHRhYnNcIiwgeyBjb3VudDogc2VsZWN0ZWRUYWJzLnNpemUgfSk7XG4gICAgICBhd2FpdCBjaHJvbWUudGFicy51bmdyb3VwKEFycmF5LmZyb20oc2VsZWN0ZWRUYWJzKSk7XG4gICAgICBhd2FpdCBsb2FkU3RhdGUoKTtcbiAgfVxufSk7XG5idG5NZXJnZS5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICBpZiAoY29uZmlybShgTWVyZ2UgJHtzZWxlY3RlZFRhYnMuc2l6ZX0gdGFicyBpbnRvIG9uZSBncm91cD9gKSkge1xuICAgICAgbG9nSW5mbyhcIk1lcmdpbmcgdGFic1wiLCB7IGNvdW50OiBzZWxlY3RlZFRhYnMuc2l6ZSB9KTtcbiAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHNlbmRNZXNzYWdlKFwibWVyZ2VTZWxlY3Rpb25cIiwgeyB0YWJJZHM6IEFycmF5LmZyb20oc2VsZWN0ZWRUYWJzKSB9KTtcbiAgICAgIGlmICghcmVzLm9rKSBhbGVydChcIk1lcmdlIGZhaWxlZDogXCIgKyByZXMuZXJyb3IpO1xuICAgICAgZWxzZSBhd2FpdCBsb2FkU3RhdGUoKTtcbiAgfVxufSk7XG5idG5TcGxpdC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICBpZiAoY29uZmlybShgU3BsaXQgJHtzZWxlY3RlZFRhYnMuc2l6ZX0gdGFicyBpbnRvIGEgbmV3IHdpbmRvdz9gKSkge1xuICAgICAgbG9nSW5mbyhcIlNwbGl0dGluZyB0YWJzXCIsIHsgY291bnQ6IHNlbGVjdGVkVGFicy5zaXplIH0pO1xuICAgICAgY29uc3QgcmVzID0gYXdhaXQgc2VuZE1lc3NhZ2UoXCJzcGxpdFNlbGVjdGlvblwiLCB7IHRhYklkczogQXJyYXkuZnJvbShzZWxlY3RlZFRhYnMpIH0pO1xuICAgICAgaWYgKCFyZXMub2spIGFsZXJ0KFwiU3BsaXQgZmFpbGVkOiBcIiArIHJlcy5lcnJvcik7XG4gICAgICBlbHNlIGF3YWl0IGxvYWRTdGF0ZSgpO1xuICB9XG59KTtcblxuYnRuRXhwYW5kQWxsPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHdpbmRvd1N0YXRlLmZvckVhY2god2luID0+IHtcbiAgICAgICAgZXhwYW5kZWROb2Rlcy5hZGQoYHctJHt3aW4uaWR9YCk7XG4gICAgICAgIHdpbi50YWJzLmZvckVhY2godGFiID0+IHtcbiAgICAgICAgICAgIGlmICh0YWIuZ3JvdXBMYWJlbCkge1xuICAgICAgICAgICAgICAgICBleHBhbmRlZE5vZGVzLmFkZChgdy0ke3dpbi5pZH0tZy0ke3RhYi5ncm91cExhYmVsfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9KTtcbiAgICByZW5kZXJUcmVlKCk7XG59KTtcblxuYnRuQ29sbGFwc2VBbGw/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgZXhwYW5kZWROb2Rlcy5jbGVhcigpO1xuICAgIHJlbmRlclRyZWUoKTtcbn0pO1xuXG5cbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuVW5kb1wiKT8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgbG9nSW5mbyhcIlVuZG8gY2xpY2tlZFwiKTtcbiAgY29uc3QgcmVzID0gYXdhaXQgc2VuZE1lc3NhZ2UoXCJ1bmRvXCIpO1xuICBpZiAoIXJlcy5vaykgYWxlcnQoXCJVbmRvIGZhaWxlZDogXCIgKyByZXMuZXJyb3IpO1xufSk7XG5cbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuU2F2ZVN0YXRlXCIpPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICBjb25zdCBuYW1lID0gcHJvbXB0KFwiRW50ZXIgYSBuYW1lIGZvciB0aGlzIHN0YXRlOlwiKTtcbiAgaWYgKG5hbWUpIHtcbiAgICBsb2dJbmZvKFwiU2F2aW5nIHN0YXRlXCIsIHsgbmFtZSB9KTtcbiAgICBjb25zdCByZXMgPSBhd2FpdCBzZW5kTWVzc2FnZShcInNhdmVTdGF0ZVwiLCB7IG5hbWUgfSk7XG4gICAgaWYgKCFyZXMub2spIGFsZXJ0KFwiU2F2ZSBmYWlsZWQ6IFwiICsgcmVzLmVycm9yKTtcbiAgfVxufSk7XG5cbmNvbnN0IGxvYWRTdGF0ZURpYWxvZyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibG9hZFN0YXRlRGlhbG9nXCIpIGFzIEhUTUxEaWFsb2dFbGVtZW50O1xuY29uc3Qgc2F2ZWRTdGF0ZUxpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNhdmVkU3RhdGVMaXN0XCIpIGFzIEhUTUxFbGVtZW50O1xuXG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0bkxvYWRTdGF0ZVwiKT8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgbG9nSW5mbyhcIk9wZW5pbmcgTG9hZCBTdGF0ZSBkaWFsb2dcIik7XG4gIGNvbnN0IHJlcyA9IGF3YWl0IHNlbmRNZXNzYWdlPFNhdmVkU3RhdGVbXT4oXCJnZXRTYXZlZFN0YXRlc1wiKTtcbiAgaWYgKHJlcy5vayAmJiByZXMuZGF0YSkge1xuICAgIHNhdmVkU3RhdGVMaXN0LmlubmVySFRNTCA9IFwiXCI7XG4gICAgcmVzLmRhdGEuZm9yRWFjaCgoc3RhdGUpID0+IHtcbiAgICAgIGNvbnN0IGxpID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImxpXCIpO1xuICAgICAgbGkuc3R5bGUuZGlzcGxheSA9IFwiZmxleFwiO1xuICAgICAgbGkuc3R5bGUuanVzdGlmeUNvbnRlbnQgPSBcInNwYWNlLWJldHdlZW5cIjtcbiAgICAgIGxpLnN0eWxlLnBhZGRpbmcgPSBcIjhweFwiO1xuICAgICAgbGkuc3R5bGUuYm9yZGVyQm90dG9tID0gXCIxcHggc29saWQgdmFyKC0tYm9yZGVyLWNvbG9yKVwiO1xuXG4gICAgICBjb25zdCBzcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gICAgICBzcGFuLnRleHRDb250ZW50ID0gYCR7c3RhdGUubmFtZX0gKCR7bmV3IERhdGUoc3RhdGUudGltZXN0YW1wKS50b0xvY2FsZVN0cmluZygpfSlgO1xuICAgICAgc3Bhbi5zdHlsZS5jdXJzb3IgPSBcInBvaW50ZXJcIjtcbiAgICAgIHNwYW4ub25jbGljayA9IGFzeW5jICgpID0+IHtcbiAgICAgICAgaWYgKGNvbmZpcm0oYExvYWQgc3RhdGUgXCIke3N0YXRlLm5hbWV9XCI/YCkpIHtcbiAgICAgICAgICBsb2dJbmZvKFwiUmVzdG9yaW5nIHN0YXRlXCIsIHsgbmFtZTogc3RhdGUubmFtZSB9KTtcbiAgICAgICAgICBjb25zdCByID0gYXdhaXQgc2VuZE1lc3NhZ2UoXCJyZXN0b3JlU3RhdGVcIiwgeyBzdGF0ZSB9KTtcbiAgICAgICAgICBpZiAoci5vaykge1xuICAgICAgICAgICAgICBsb2FkU3RhdGVEaWFsb2cuY2xvc2UoKTtcbiAgICAgICAgICAgICAgd2luZG93LmNsb3NlKCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgYWxlcnQoXCJSZXN0b3JlIGZhaWxlZDogXCIgKyByLmVycm9yKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IGRlbEJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gICAgICBkZWxCdG4udGV4dENvbnRlbnQgPSBcIkRlbGV0ZVwiO1xuICAgICAgZGVsQnRuLnN0eWxlLm1hcmdpbkxlZnQgPSBcIjhweFwiO1xuICAgICAgZGVsQnRuLnN0eWxlLmJhY2tncm91bmQgPSBcInRyYW5zcGFyZW50XCI7XG4gICAgICBkZWxCdG4uc3R5bGUuY29sb3IgPSBcInZhcigtLXRleHQtY29sb3IpXCI7XG4gICAgICBkZWxCdG4uc3R5bGUuYm9yZGVyID0gXCIxcHggc29saWQgdmFyKC0tYm9yZGVyLWNvbG9yKVwiO1xuICAgICAgZGVsQnRuLnN0eWxlLmJvcmRlclJhZGl1cyA9IFwiNHB4XCI7XG4gICAgICBkZWxCdG4uc3R5bGUucGFkZGluZyA9IFwiMnB4IDZweFwiO1xuICAgICAgZGVsQnRuLm9uY2xpY2sgPSBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgaWYgKGNvbmZpcm0oYERlbGV0ZSBzdGF0ZSBcIiR7c3RhdGUubmFtZX1cIj9gKSkge1xuICAgICAgICAgICAgICBhd2FpdCBzZW5kTWVzc2FnZShcImRlbGV0ZVNhdmVkU3RhdGVcIiwgeyBuYW1lOiBzdGF0ZS5uYW1lIH0pO1xuICAgICAgICAgICAgICBsaS5yZW1vdmUoKTtcbiAgICAgICAgICB9XG4gICAgICB9O1xuXG4gICAgICBsaS5hcHBlbmRDaGlsZChzcGFuKTtcbiAgICAgIGxpLmFwcGVuZENoaWxkKGRlbEJ0bik7XG4gICAgICBzYXZlZFN0YXRlTGlzdC5hcHBlbmRDaGlsZChsaSk7XG4gICAgfSk7XG4gICAgbG9hZFN0YXRlRGlhbG9nLnNob3dNb2RhbCgpO1xuICB9IGVsc2Uge1xuICAgICAgYWxlcnQoXCJGYWlsZWQgdG8gbG9hZCBzdGF0ZXM6IFwiICsgcmVzLmVycm9yKTtcbiAgfVxufSk7XG5cbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuQ2xvc2VMb2FkU3RhdGVcIik/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgbG9hZFN0YXRlRGlhbG9nLmNsb3NlKCk7XG59KTtcblxuc2VhcmNoSW5wdXQuYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsIHJlbmRlclRyZWUpO1xuXG4vLyBBdXRvLXJlZnJlc2hcbmNocm9tZS50YWJzLm9uVXBkYXRlZC5hZGRMaXN0ZW5lcigoKSA9PiBsb2FkU3RhdGUoKSk7XG5jaHJvbWUudGFicy5vblJlbW92ZWQuYWRkTGlzdGVuZXIoKCkgPT4gbG9hZFN0YXRlKCkpO1xuY2hyb21lLndpbmRvd3Mub25SZW1vdmVkLmFkZExpc3RlbmVyKCgpID0+IGxvYWRTdGF0ZSgpKTtcblxuLy8gLS0tIFRoZW1lIExvZ2ljIC0tLVxuY29uc3QgYnRuVGhlbWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0blRoZW1lXCIpO1xuY29uc3QgaWNvblN1biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaWNvblN1blwiKTtcbmNvbnN0IGljb25Nb29uID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJpY29uTW9vblwiKTtcblxuY29uc3QgYXBwbHlUaGVtZSA9ICh0aGVtZTogJ2xpZ2h0JyB8ICdkYXJrJywgc2F2ZSA9IGZhbHNlKSA9PiB7XG4gICAgaWYgKHRoZW1lID09PSAnbGlnaHQnKSB7XG4gICAgICAgIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LmFkZCgnbGlnaHQtbW9kZScpO1xuICAgICAgICBpZiAoaWNvblN1bikgaWNvblN1bi5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcbiAgICAgICAgaWYgKGljb25Nb29uKSBpY29uTW9vbi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LnJlbW92ZSgnbGlnaHQtbW9kZScpO1xuICAgICAgICBpZiAoaWNvblN1bikgaWNvblN1bi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICBpZiAoaWNvbk1vb24pIGljb25Nb29uLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuICAgIH1cblxuICAgIC8vIFN5bmMgd2l0aCBQcmVmZXJlbmNlc1xuICAgIGlmIChzYXZlKSB7XG4gICAgICAgIC8vIFdlIHVzZSBzYXZlUHJlZmVyZW5jZXMgd2hpY2ggY2FsbHMgdGhlIGJhY2tncm91bmQgdG8gc3RvcmUgaXRcbiAgICAgICAgbG9nSW5mbyhcIkFwcGx5aW5nIHRoZW1lXCIsIHsgdGhlbWUgfSk7XG4gICAgICAgIGxvY2FsUHJlZmVyZW5jZXNNb2RpZmllZFRpbWUgPSBEYXRlLm5vdygpO1xuICAgICAgICBzZW5kTWVzc2FnZShcInNhdmVQcmVmZXJlbmNlc1wiLCB7IHRoZW1lIH0pO1xuICAgIH1cbn07XG5cbi8vIEluaXRpYWwgbG9hZCBmYWxsYmFjayAoYmVmb3JlIGxvYWRTdGF0ZSBsb2FkcyBwcmVmcylcbmNvbnN0IHN0b3JlZFRoZW1lID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ3RoZW1lJykgYXMgJ2xpZ2h0JyB8ICdkYXJrJztcbi8vIElmIHdlIGhhdmUgYSBsb2NhbCBvdmVycmlkZSwgdXNlIGl0IHRlbXBvcmFyaWx5LCBidXQgbG9hZFN0YXRlIHdpbGwgYXV0aG9yaXRhdGl2ZSBjaGVjayBwcmVmc1xuaWYgKHN0b3JlZFRoZW1lKSBhcHBseVRoZW1lKHN0b3JlZFRoZW1lLCBmYWxzZSk7XG5cbmJ0blRoZW1lPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICBjb25zdCBpc0xpZ2h0ID0gZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QuY29udGFpbnMoJ2xpZ2h0LW1vZGUnKTtcbiAgICBjb25zdCBuZXdUaGVtZSA9IGlzTGlnaHQgPyAnZGFyaycgOiAnbGlnaHQnO1xuICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCd0aGVtZScsIG5ld1RoZW1lKTsgLy8gS2VlcCBsb2NhbCBjb3B5IGZvciBmYXN0IGJvb3RcbiAgICBhcHBseVRoZW1lKG5ld1RoZW1lLCB0cnVlKTtcbn0pO1xuXG4vLyAtLS0gU2V0dGluZ3MgTG9naWMgLS0tXG5jb25zdCBzZXR0aW5nc0RpYWxvZyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2V0dGluZ3NEaWFsb2dcIikgYXMgSFRNTERpYWxvZ0VsZW1lbnQ7XG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0blNldHRpbmdzXCIpPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldHRpbmdzRGlhbG9nLnNob3dNb2RhbCgpO1xufSk7XG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0bkNsb3NlU2V0dGluZ3NcIik/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0dGluZ3NEaWFsb2cuY2xvc2UoKTtcbn0pO1xuXG5jb25zdCBsb2dMZXZlbFNlbGVjdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibG9nTGV2ZWxTZWxlY3RcIikgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG5sb2dMZXZlbFNlbGVjdD8uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCBhc3luYyAoKSA9PiB7XG4gICAgY29uc3QgbmV3TGV2ZWwgPSBsb2dMZXZlbFNlbGVjdC52YWx1ZSBhcyBMb2dMZXZlbDtcbiAgICBpZiAocHJlZmVyZW5jZXMpIHtcbiAgICAgICAgcHJlZmVyZW5jZXMubG9nTGV2ZWwgPSBuZXdMZXZlbDtcbiAgICAgICAgLy8gVXBkYXRlIGxvY2FsIGxvZ2dlciBpbW1lZGlhdGVseVxuICAgICAgICBzZXRMb2dnZXJQcmVmZXJlbmNlcyhwcmVmZXJlbmNlcyk7XG4gICAgICAgIC8vIFBlcnNpc3RcbiAgICAgICAgbG9jYWxQcmVmZXJlbmNlc01vZGlmaWVkVGltZSA9IERhdGUubm93KCk7XG4gICAgICAgIGF3YWl0IHNlbmRNZXNzYWdlKFwic2F2ZVByZWZlcmVuY2VzXCIsIHsgbG9nTGV2ZWw6IG5ld0xldmVsIH0pO1xuICAgICAgICBsb2dEZWJ1ZyhcIkxvZyBsZXZlbCB1cGRhdGVkXCIsIHsgbGV2ZWw6IG5ld0xldmVsIH0pO1xuICAgIH1cbn0pO1xuXG4vLyAtLS0gUGluICYgUmVzaXplIExvZ2ljIC0tLVxuY29uc3QgYnRuUGluID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5QaW5cIik7XG5idG5QaW4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIGNvbnN0IHVybCA9IGNocm9tZS5ydW50aW1lLmdldFVSTChcInVpL3BvcHVwLmh0bWxcIik7XG4gIGF3YWl0IGNocm9tZS53aW5kb3dzLmNyZWF0ZSh7XG4gICAgdXJsLFxuICAgIHR5cGU6IFwicG9wdXBcIixcbiAgICB3aWR0aDogZG9jdW1lbnQuYm9keS5vZmZzZXRXaWR0aCxcbiAgICBoZWlnaHQ6IGRvY3VtZW50LmJvZHkub2Zmc2V0SGVpZ2h0XG4gIH0pO1xuICB3aW5kb3cuY2xvc2UoKTtcbn0pO1xuXG5jb25zdCByZXNpemVIYW5kbGUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJlc2l6ZUhhbmRsZVwiKTtcbmlmIChyZXNpemVIYW5kbGUpIHtcbiAgY29uc3Qgc2F2ZVNpemUgPSAodzogbnVtYmVyLCBoOiBudW1iZXIpID0+IHtcbiAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKFwicG9wdXBTaXplXCIsIEpTT04uc3RyaW5naWZ5KHsgd2lkdGg6IHcsIGhlaWdodDogaCB9KSk7XG4gIH07XG5cbiAgcmVzaXplSGFuZGxlLmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWRvd25cIiwgKGUpID0+IHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGNvbnN0IHN0YXJ0WCA9IGUuY2xpZW50WDtcbiAgICAgIGNvbnN0IHN0YXJ0WSA9IGUuY2xpZW50WTtcbiAgICAgIGNvbnN0IHN0YXJ0V2lkdGggPSBkb2N1bWVudC5ib2R5Lm9mZnNldFdpZHRoO1xuICAgICAgY29uc3Qgc3RhcnRIZWlnaHQgPSBkb2N1bWVudC5ib2R5Lm9mZnNldEhlaWdodDtcblxuICAgICAgY29uc3Qgb25Nb3VzZU1vdmUgPSAoZXY6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgICAgICBjb25zdCBuZXdXaWR0aCA9IE1hdGgubWF4KDUwMCwgc3RhcnRXaWR0aCArIChldi5jbGllbnRYIC0gc3RhcnRYKSk7XG4gICAgICAgICAgY29uc3QgbmV3SGVpZ2h0ID0gTWF0aC5tYXgoNTAwLCBzdGFydEhlaWdodCArIChldi5jbGllbnRZIC0gc3RhcnRZKSk7XG4gICAgICAgICAgZG9jdW1lbnQuYm9keS5zdHlsZS53aWR0aCA9IGAke25ld1dpZHRofXB4YDtcbiAgICAgICAgICBkb2N1bWVudC5ib2R5LnN0eWxlLmhlaWdodCA9IGAke25ld0hlaWdodH1weGA7XG4gICAgICB9O1xuXG4gICAgICBjb25zdCBvbk1vdXNlVXAgPSAoZXY6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgICAgICAgY29uc3QgbmV3V2lkdGggPSBNYXRoLm1heCg1MDAsIHN0YXJ0V2lkdGggKyAoZXYuY2xpZW50WCAtIHN0YXJ0WCkpO1xuICAgICAgICAgICBjb25zdCBuZXdIZWlnaHQgPSBNYXRoLm1heCg1MDAsIHN0YXJ0SGVpZ2h0ICsgKGV2LmNsaWVudFkgLSBzdGFydFkpKTtcbiAgICAgICAgICAgc2F2ZVNpemUobmV3V2lkdGgsIG5ld0hlaWdodCk7XG4gICAgICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb3VzZW1vdmVcIiwgb25Nb3VzZU1vdmUpO1xuICAgICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwibW91c2V1cFwiLCBvbk1vdXNlVXApO1xuICAgICAgfTtcblxuICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlbW92ZVwiLCBvbk1vdXNlTW92ZSk7XG4gICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwibW91c2V1cFwiLCBvbk1vdXNlVXApO1xuICB9KTtcbn1cblxuY29uc3QgYWRqdXN0Rm9yV2luZG93VHlwZSA9IGFzeW5jICgpID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCB3aW4gPSBhd2FpdCBjaHJvbWUud2luZG93cy5nZXRDdXJyZW50KCk7XG4gICAgaWYgKHdpbi50eXBlID09PSBcInBvcHVwXCIpIHtcbiAgICAgICBpZiAoYnRuUGluKSBidG5QaW4uc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgICAgIC8vIEVuYWJsZSByZXNpemUgaGFuZGxlIGluIHBpbm5lZCBtb2RlIGlmIGl0IHdhcyBoaWRkZW5cbiAgICAgICBpZiAocmVzaXplSGFuZGxlKSByZXNpemVIYW5kbGUuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICAgICBkb2N1bWVudC5ib2R5LnN0eWxlLndpZHRoID0gXCIxMDAlXCI7XG4gICAgICAgZG9jdW1lbnQuYm9keS5zdHlsZS5oZWlnaHQgPSBcIjEwMCVcIjtcbiAgICB9IGVsc2Uge1xuICAgICAgICAvLyBEaXNhYmxlIHJlc2l6ZSBoYW5kbGUgaW4gZG9ja2VkIG1vZGVcbiAgICAgICAgaWYgKHJlc2l6ZUhhbmRsZSkgcmVzaXplSGFuZGxlLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICAgICAgLy8gQ2xlYXIgYW55IHByZXZpb3VzIHNpemUgb3ZlcnJpZGVzXG4gICAgICAgIGRvY3VtZW50LmJvZHkuc3R5bGUud2lkdGggPSBcIlwiO1xuICAgICAgICBkb2N1bWVudC5ib2R5LnN0eWxlLmhlaWdodCA9IFwiXCI7XG4gICAgfVxuICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3IgY2hlY2tpbmcgd2luZG93IHR5cGU6XCIsIGUpO1xuICB9XG59O1xuXG5hZGp1c3RGb3JXaW5kb3dUeXBlKCk7XG5sb2FkU3RhdGUoKS5jYXRjaChlID0+IGNvbnNvbGUuZXJyb3IoXCJMb2FkIHN0YXRlIGZhaWxlZFwiLCBlKSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBRU8sSUFBTSxlQUFlLENBQUMsUUFBNkM7QUFDeEUsTUFBSSxDQUFDLElBQUksTUFBTSxJQUFJLE9BQU8sT0FBTyxLQUFLLGVBQWUsQ0FBQyxJQUFJLFNBQVUsUUFBTztBQUMzRSxTQUFPO0FBQUEsSUFDTCxJQUFJLElBQUk7QUFBQSxJQUNSLFVBQVUsSUFBSTtBQUFBLElBQ2QsT0FBTyxJQUFJLFNBQVM7QUFBQSxJQUNwQixLQUFLLElBQUksY0FBYyxJQUFJLE9BQU87QUFBQSxJQUNsQyxRQUFRLFFBQVEsSUFBSSxNQUFNO0FBQUEsSUFDMUIsY0FBYyxJQUFJO0FBQUEsSUFDbEIsYUFBYSxJQUFJLGVBQWU7QUFBQSxJQUNoQyxZQUFZLElBQUk7QUFBQSxJQUNoQixTQUFTLElBQUk7QUFBQSxJQUNiLE9BQU8sSUFBSTtBQUFBLElBQ1gsUUFBUSxJQUFJO0FBQUEsSUFDWixRQUFRLElBQUk7QUFBQSxJQUNaLFVBQVUsSUFBSTtBQUFBLEVBQ2hCO0FBQ0Y7QUFFTyxJQUFNLHVCQUF1QixZQUF5QztBQUMzRSxTQUFPLElBQUksUUFBUSxDQUFDLFlBQVk7QUFDOUIsV0FBTyxRQUFRLE1BQU0sSUFBSSxlQUFlLENBQUMsVUFBVTtBQUNqRCxjQUFTLE1BQU0sYUFBYSxLQUFxQixJQUFJO0FBQUEsSUFDdkQsQ0FBQztBQUFBLEVBQ0gsQ0FBQztBQUNIO0FBRU8sSUFBTSxVQUFVLENBQUksVUFBd0I7QUFDL0MsTUFBSSxN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Y0FBYztBQUMzRCxJQUFJLGNBQWM7QUFDaEIsUUFBTSxXQUFXLENBQUMsR0FBVyxNQUFjO0FBQ3ZDLGlCQUFhLFFBQVEsYUFBYSxLQUFLLFVBQVUsRUFBRSxPQUFPLEdBQUcsUUFBUSxFQUFFLENBQUMsQ0FBQztBQUFBLEVBQzdFO0FBRUEsZUFBYSxpQkFBaUIsYUFBYSxDQUFDLE1BQU07QUFDOUMsTUFBRSxlQUFlO0FBQ2pCLFVBQU0sU0FBUyxFQUFFO0FBQ2pCLFVBQU0sU0FBUyxFQUFFO0FBQ2pCLFVBQU0sYUFBYSxTQUFTLEtBQUs7QUFDakMsVUFBTSxjQUFjLFNBQVMsS0FBSztBQUVsQyxVQUFNLGNBQWMsQ0FBQyxPQUFtQjtBQUNwQyxZQUFNLFdBQVcsS0FBSyxJQUFJLEtBQUssY0FBYyxHQUFHLFVBQVUsT0FBTztBQUNqRSxZQUFNLFlBQVksS0FBSyxJQUFJLEtBQUssZUFBZSxHQUFHLFVBQVUsT0FBTztBQUNuRSxlQUFTLEtBQUssTUFBTSxRQUFRLEdBQUcsUUFBUTtBQUN2QyxlQUFTLEtBQUssTUFBTSxTQUFTLEdBQUcsU0FBUztBQUFBLElBQzdDO0FBRUEsVUFBTSxZQUFZLENBQUMsT0FBbUI7QUFDakMsWUFBTSxXQUFXLEtBQUssSUFBSSxLQUFLLGNBQWMsR0FBRyxVQUFVLE9BQU87QUFDakUsWUFBTSxZQUFZLEtBQUssSUFBSSxLQUFLLGVBQWUsR0FBRyxVQUFVLE9BQU87QUFDbkUsZUFBUyxVQUFVLFNBQVM7QUFDNUIsZUFBUyxvQkFBb0IsYUFBYSxXQUFXO0FBQ3JELGVBQVMsb0JBQW9CLFdBQVcsU0FBUztBQUFBLElBQ3REO0FBRUEsYUFBUyxpQkFBaUIsYUFBYSxXQUFXO0FBQ2xELGFBQVMsaUJBQWlCLFdBQVcsU0FBUztBQUFBLEVBQ2xELENBQUM7QUFDSDtBQUVBLElBQU0sc0JBQXNCLFlBQVk7QUFDdEMsTUFBSTtBQUNGLFVBQU0sTUFBTSxNQUFNLE9BQU8sUUFBUSxXQUFXO0FBQzVDLFFBQUksSUFBSSxTQUFTLFNBQVM7QUFDdkIsVUFBSSxPQUFRLFFBQU8sTUFBTSxVQUFVO0FBRW5DLFVBQUksYUFBYyxjQUFhLE1BQU0sVUFBVTtBQUMvQyxlQUFTLEtBQUssTUFBTSxRQUFRO0FBQzVCLGVBQVMsS0FBSyxNQUFNLFNBQVM7QUFBQSxJQUNoQyxPQUFPO0FBRUgsVUFBSSxhQUFjLGNBQWEsTUFBTSxVQUFVO0FBRS9DLGVBQVMsS0FBSyxNQUFNLFFBQVE7QUFDNUIsZUFBUyxLQUFLLE1BQU0sU0FBUztBQUFBLElBQ2pDO0FBQUEsRUFDRixTQUFTLEdBQUc7QUFDUixZQUFRLE1BQU0sK0JBQStCLENBQUM7QUFBQSxFQUNsRDtBQUNGO0FBRUEsb0JBQW9CO0FBQ3BCLFVBQVUsRUFBRSxNQUFNLE9BQUssUUFBUSxNQUFNLHFCQUFxQixDQUFDLENBQUM7IiwKICAibmFtZXMiOiBbImN1c3RvbVN0cmF0ZWdpZXMiLCAicHJlZmVyZW5jZXMiLCAidGFicyIsICJ3aW5kb3ciLCAibGlzdCJdCn0K
