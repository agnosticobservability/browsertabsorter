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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3NoYXJlZC91dGlscy50cyIsICIuLi8uLi9zcmMvc2hhcmVkL3N0cmF0ZWd5UmVnaXN0cnkudHMiLCAiLi4vLi4vc3JjL3NoYXJlZC9sb2dnZXIudHMiLCAiLi4vLi4vc3JjL3NoYXJlZC91cmxDYWNoZS50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9ncm91cGluZ1N0cmF0ZWdpZXMudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvc29ydGluZ1N0cmF0ZWdpZXMudHMiLCAiLi4vLi4vc3JjL3VpL2xvY2FsU3RhdGUudHMiLCAiLi4vLi4vc3JjL3VpL2NvbW1vbi50cyIsICIuLi8uLi9zcmMvdWkvcG9wdXAudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IFByZWZlcmVuY2VzLCBTb3J0aW5nU3RyYXRlZ3ksIFRhYk1ldGFkYXRhIH0gZnJvbSBcIi4vdHlwZXMuanNcIjtcblxuZXhwb3J0IGNvbnN0IG1hcENocm9tZVRhYiA9ICh0YWI6IGNocm9tZS50YWJzLlRhYik6IFRhYk1ldGFkYXRhIHwgbnVsbCA9PiB7XG4gIGlmICghdGFiLmlkIHx8IHRhYi5pZCA9PT0gY2hyb21lLnRhYnMuVEFCX0lEX05PTkUgfHwgIXRhYi53aW5kb3dJZCkgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7XG4gICAgaWQ6IHRhYi5pZCxcbiAgICB3aW5kb3dJZDogdGFiLndpbmRvd0lkLFxuICAgIHRpdGxlOiB0YWIudGl0bGUgfHwgXCJVbnRpdGxlZFwiLFxuICAgIHVybDogdGFiLnBlbmRpbmdVcmwgfHwgdGFiLnVybCB8fCBcImFib3V0OmJsYW5rXCIsXG4gICAgcGlubmVkOiBCb29sZWFuKHRhYi5waW5uZWQpLFxuICAgIGxhc3RBY2Nlc3NlZDogdGFiLmxhc3RBY2Nlc3NlZCxcbiAgICBvcGVuZXJUYWJJZDogdGFiLm9wZW5lclRhYklkID8/IHVuZGVmaW5lZCxcbiAgICBmYXZJY29uVXJsOiB0YWIuZmF2SWNvblVybCxcbiAgICBncm91cElkOiB0YWIuZ3JvdXBJZCxcbiAgICBpbmRleDogdGFiLmluZGV4LFxuICAgIGFjdGl2ZTogdGFiLmFjdGl2ZSxcbiAgICBzdGF0dXM6IHRhYi5zdGF0dXMsXG4gICAgc2VsZWN0ZWQ6IHRhYi5oaWdobGlnaHRlZFxuICB9O1xufTtcblxuZXhwb3J0IGNvbnN0IGdldFN0b3JlZFByZWZlcmVuY2VzID0gYXN5bmMgKCk6IFByb21pc2U8UHJlZmVyZW5jZXMgfCBudWxsPiA9PiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChcInByZWZlcmVuY2VzXCIsIChpdGVtcykgPT4ge1xuICAgICAgcmVzb2x2ZSgoaXRlbXNbXCJwcmVmZXJlbmNlc1wiXSBhcyBQcmVmZXJlbmNlcykgPz8gbnVsbCk7XG4gICAgfSk7XG4gIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IGFzQXJyYXkgPSA8VD4odmFsdWU6IHVua25vd24pOiBUW10gPT4ge1xuICAgIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkgcmV0dXJuIHZhbHVlIGFzIFRbXTtcbiAgICByZXR1cm4gW107XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gZXNjYXBlSHRtbCh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBpZiAoIXRleHQpIHJldHVybiAnJztcbiAgcmV0dXJuIHRleHRcbiAgICAucmVwbGFjZSgvJi9nLCAnJmFtcDsnKVxuICAgIC5yZXBsYWNlKC88L2csICcmbHQ7JylcbiAgICAucmVwbGFjZSgvPi9nLCAnJmd0OycpXG4gICAgLnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKVxuICAgIC5yZXBsYWNlKC8nL2csICcmIzAzOTsnKTtcbn1cbiIsICJpbXBvcnQgeyBDdXN0b21TdHJhdGVneSwgU29ydGluZ1N0cmF0ZWd5IH0gZnJvbSBcIi4vdHlwZXMuanNcIjtcblxuZXhwb3J0IGludGVyZmFjZSBTdHJhdGVneURlZmluaXRpb24ge1xuICAgIGlkOiBTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmc7XG4gICAgbGFiZWw6IHN0cmluZztcbiAgICBpc0dyb3VwaW5nOiBib29sZWFuO1xuICAgIGlzU29ydGluZzogYm9vbGVhbjtcbiAgICB0YWdzPzogc3RyaW5nW107XG4gICAgYXV0b1J1bj86IGJvb2xlYW47XG4gICAgaXNDdXN0b20/OiBib29sZWFuO1xufVxuXG4vLyBSZXN0b3JlZCBzdHJhdGVnaWVzIG1hdGNoaW5nIGJhY2tncm91bmQgY2FwYWJpbGl0aWVzLlxuZXhwb3J0IGNvbnN0IFNUUkFURUdJRVM6IFN0cmF0ZWd5RGVmaW5pdGlvbltdID0gW1xuICAgIHsgaWQ6IFwiZG9tYWluXCIsIGxhYmVsOiBcIkRvbWFpblwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwiZG9tYWluX2Z1bGxcIiwgbGFiZWw6IFwiRnVsbCBEb21haW5cIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInRvcGljXCIsIGxhYmVsOiBcIlRvcGljXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJjb250ZXh0XCIsIGxhYmVsOiBcIkNvbnRleHRcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImxpbmVhZ2VcIiwgbGFiZWw6IFwiTGluZWFnZVwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwicGlubmVkXCIsIGxhYmVsOiBcIlBpbm5lZFwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwicmVjZW5jeVwiLCBsYWJlbDogXCJSZWNlbmN5XCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJhZ2VcIiwgbGFiZWw6IFwiQWdlXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJ1cmxcIiwgbGFiZWw6IFwiVVJMXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJuZXN0aW5nXCIsIGxhYmVsOiBcIk5lc3RpbmdcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInRpdGxlXCIsIGxhYmVsOiBcIlRpdGxlXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG5dO1xuXG5leHBvcnQgY29uc3QgZ2V0U3RyYXRlZ2llcyA9IChjdXN0b21TdHJhdGVnaWVzPzogQ3VzdG9tU3RyYXRlZ3lbXSk6IFN0cmF0ZWd5RGVmaW5pdGlvbltdID0+IHtcbiAgICBpZiAoIWN1c3RvbVN0cmF0ZWdpZXMgfHwgY3VzdG9tU3RyYXRlZ2llcy5sZW5ndGggPT09IDApIHJldHVybiBTVFJBVEVHSUVTO1xuXG4gICAgLy8gQ3VzdG9tIHN0cmF0ZWdpZXMgY2FuIG92ZXJyaWRlIGJ1aWx0LWlucyBpZiBJRHMgbWF0Y2gsIG9yIGFkZCBuZXcgb25lcy5cbiAgICBjb25zdCBjb21iaW5lZCA9IFsuLi5TVFJBVEVHSUVTXTtcblxuICAgIGN1c3RvbVN0cmF0ZWdpZXMuZm9yRWFjaChjdXN0b20gPT4ge1xuICAgICAgICBjb25zdCBleGlzdGluZ0luZGV4ID0gY29tYmluZWQuZmluZEluZGV4KHMgPT4gcy5pZCA9PT0gY3VzdG9tLmlkKTtcblxuICAgICAgICAvLyBEZXRlcm1pbmUgY2FwYWJpbGl0aWVzIGJhc2VkIG9uIHJ1bGVzIHByZXNlbmNlXG4gICAgICAgIGNvbnN0IGhhc0dyb3VwaW5nID0gKGN1c3RvbS5ncm91cGluZ1J1bGVzICYmIGN1c3RvbS5ncm91cGluZ1J1bGVzLmxlbmd0aCA+IDApIHx8IChjdXN0b20ucnVsZXMgJiYgY3VzdG9tLnJ1bGVzLmxlbmd0aCA+IDApIHx8IGZhbHNlO1xuICAgICAgICBjb25zdCBoYXNTb3J0aW5nID0gKGN1c3RvbS5zb3J0aW5nUnVsZXMgJiYgY3VzdG9tLnNvcnRpbmdSdWxlcy5sZW5ndGggPiAwKSB8fCAoY3VzdG9tLnJ1bGVzICYmIGN1c3RvbS5ydWxlcy5sZW5ndGggPiAwKSB8fCBmYWxzZTtcblxuICAgICAgICBjb25zdCB0YWdzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBpZiAoaGFzR3JvdXBpbmcpIHRhZ3MucHVzaChcImdyb3VwXCIpO1xuICAgICAgICBpZiAoaGFzU29ydGluZykgdGFncy5wdXNoKFwic29ydFwiKTtcblxuICAgICAgICBjb25zdCBkZWZpbml0aW9uOiBTdHJhdGVneURlZmluaXRpb24gPSB7XG4gICAgICAgICAgICBpZDogY3VzdG9tLmlkLFxuICAgICAgICAgICAgbGFiZWw6IGN1c3RvbS5sYWJlbCxcbiAgICAgICAgICAgIGlzR3JvdXBpbmc6IGhhc0dyb3VwaW5nLFxuICAgICAgICAgICAgaXNTb3J0aW5nOiBoYXNTb3J0aW5nLFxuICAgICAgICAgICAgdGFnczogdGFncyxcbiAgICAgICAgICAgIGF1dG9SdW46IGN1c3RvbS5hdXRvUnVuLFxuICAgICAgICAgICAgaXNDdXN0b206IHRydWVcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAoZXhpc3RpbmdJbmRleCAhPT0gLTEpIHtcbiAgICAgICAgICAgIGNvbWJpbmVkW2V4aXN0aW5nSW5kZXhdID0gZGVmaW5pdGlvbjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbWJpbmVkLnB1c2goZGVmaW5pdGlvbik7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBjb21iaW5lZDtcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRTdHJhdGVneSA9IChpZDogU29ydGluZ1N0cmF0ZWd5IHwgc3RyaW5nKTogU3RyYXRlZ3lEZWZpbml0aW9uIHwgdW5kZWZpbmVkID0+IFNUUkFURUdJRVMuZmluZChzID0+IHMuaWQgPT09IGlkKTtcbiIsICJpbXBvcnQgeyBMb2dFbnRyeSwgTG9nTGV2ZWwsIFByZWZlcmVuY2VzIH0gZnJvbSBcIi4vdHlwZXMuanNcIjtcblxuY29uc3QgUFJFRklYID0gXCJbVGFiU29ydGVyXVwiO1xuXG5jb25zdCBMRVZFTF9QUklPUklUWTogUmVjb3JkPExvZ0xldmVsLCBudW1iZXI+ID0ge1xuICBkZWJ1ZzogMCxcbiAgaW5mbzogMSxcbiAgd2FybjogMixcbiAgZXJyb3I6IDMsXG4gIGNyaXRpY2FsOiA0XG59O1xuXG5sZXQgY3VycmVudExldmVsOiBMb2dMZXZlbCA9IFwiaW5mb1wiO1xubGV0IGxvZ3M6IExvZ0VudHJ5W10gPSBbXTtcbmNvbnN0IE1BWF9MT0dTID0gMTAwMDtcbmNvbnN0IFNUT1JBR0VfS0VZID0gXCJzZXNzaW9uTG9nc1wiO1xuXG5jb25zdCBTRU5TSVRJVkVfS0VZUyA9IC9wYXNzd29yZHxzZWNyZXR8dG9rZW58Y3JlZGVudGlhbHxjb29raWV8c2Vzc2lvbnxhdXRob3JpemF0aW9ufCgoYXBpfGFjY2Vzc3xzZWNyZXR8cHJpdmF0ZSlbLV9dP2tleSkvaTtcblxuY29uc3Qgc2FuaXRpemVDb250ZXh0ID0gKGNvbnRleHQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQgPT4ge1xuICAgIGlmICghY29udGV4dCkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB0cnkge1xuICAgICAgICAvLyBEZWVwIGNsb25lIHRvIGVuc3VyZSB3ZSBkb24ndCBtb2RpZnkgdGhlIG9yaWdpbmFsIG9iamVjdCBhbmQgcmVtb3ZlIG5vbi1zZXJpYWxpemFibGUgZGF0YVxuICAgICAgICBjb25zdCBqc29uID0gSlNPTi5zdHJpbmdpZnkoY29udGV4dCk7XG4gICAgICAgIGNvbnN0IG9iaiA9IEpTT04ucGFyc2UoanNvbik7XG5cbiAgICAgICAgY29uc3QgcmVkYWN0ID0gKG86IGFueSkgPT4ge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBvICE9PSAnb2JqZWN0JyB8fCBvID09PSBudWxsKSByZXR1cm47XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGsgaW4gbykge1xuICAgICAgICAgICAgICAgIGlmIChTRU5TSVRJVkVfS0VZUy50ZXN0KGspKSB7XG4gICAgICAgICAgICAgICAgICAgIG9ba10gPSAnW1JFREFDVEVEXSc7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVkYWN0KG9ba10pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgcmVkYWN0KG9iaik7XG4gICAgICAgIHJldHVybiBvYmo7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICByZXR1cm4geyBlcnJvcjogXCJGYWlsZWQgdG8gc2FuaXRpemUgY29udGV4dFwiIH07XG4gICAgfVxufTtcblxuLy8gU2FmZSBjb250ZXh0IGNoZWNrXG5jb25zdCBpc1NlcnZpY2VXb3JrZXIgPSB0eXBlb2Ygc2VsZiAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVvZiAoc2VsZiBhcyBhbnkpLlNlcnZpY2VXb3JrZXJHbG9iYWxTY29wZSAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYgaW5zdGFuY2VvZiAoc2VsZiBhcyBhbnkpLlNlcnZpY2VXb3JrZXJHbG9iYWxTY29wZTtcbmxldCBpc1NhdmluZyA9IGZhbHNlO1xubGV0IHBlbmRpbmdTYXZlID0gZmFsc2U7XG5sZXQgc2F2ZVRpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsO1xuXG5jb25zdCBkb1NhdmUgPSAoKSA9PiB7XG4gICAgaWYgKCFpc1NlcnZpY2VXb3JrZXIgfHwgIWNocm9tZT8uc3RvcmFnZT8uc2Vzc2lvbiB8fCBpc1NhdmluZykge1xuICAgICAgICBwZW5kaW5nU2F2ZSA9IHRydWU7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpc1NhdmluZyA9IHRydWU7XG4gICAgcGVuZGluZ1NhdmUgPSBmYWxzZTtcblxuICAgIGNocm9tZS5zdG9yYWdlLnNlc3Npb24uc2V0KHsgW1NUT1JBR0VfS0VZXTogbG9ncyB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgaXNTYXZpbmcgPSBmYWxzZTtcbiAgICAgICAgaWYgKHBlbmRpbmdTYXZlKSB7XG4gICAgICAgICAgICBzYXZlTG9nc1RvU3RvcmFnZSgpO1xuICAgICAgICB9XG4gICAgfSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBzYXZlIGxvZ3NcIiwgZXJyKTtcbiAgICAgICAgaXNTYXZpbmcgPSBmYWxzZTtcbiAgICB9KTtcbn07XG5cbmNvbnN0IHNhdmVMb2dzVG9TdG9yYWdlID0gKCkgPT4ge1xuICAgIGlmIChzYXZlVGltZXIpIGNsZWFyVGltZW91dChzYXZlVGltZXIpO1xuICAgIHNhdmVUaW1lciA9IHNldFRpbWVvdXQoZG9TYXZlLCAxMDAwKTtcbn07XG5cbmxldCByZXNvbHZlTG9nZ2VyUmVhZHk6ICgpID0+IHZvaWQ7XG5leHBvcnQgY29uc3QgbG9nZ2VyUmVhZHkgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcbiAgICByZXNvbHZlTG9nZ2VyUmVhZHkgPSByZXNvbHZlO1xufSk7XG5cbmV4cG9ydCBjb25zdCBpbml0TG9nZ2VyID0gYXN5bmMgKCkgPT4ge1xuICAgIGlmIChpc1NlcnZpY2VXb3JrZXIgJiYgY2hyb21lPy5zdG9yYWdlPy5zZXNzaW9uKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjaHJvbWUuc3RvcmFnZS5zZXNzaW9uLmdldChTVE9SQUdFX0tFWSk7XG4gICAgICAgICAgICBpZiAocmVzdWx0W1NUT1JBR0VfS0VZXSAmJiBBcnJheS5pc0FycmF5KHJlc3VsdFtTVE9SQUdFX0tFWV0pKSB7XG4gICAgICAgICAgICAgICAgbG9ncyA9IHJlc3VsdFtTVE9SQUdFX0tFWV07XG4gICAgICAgICAgICAgICAgaWYgKGxvZ3MubGVuZ3RoID4gTUFYX0xPR1MpIGxvZ3MgPSBsb2dzLnNsaWNlKDAsIE1BWF9MT0dTKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byByZXN0b3JlIGxvZ3NcIiwgZSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKHJlc29sdmVMb2dnZXJSZWFkeSkgcmVzb2x2ZUxvZ2dlclJlYWR5KCk7XG59O1xuXG5leHBvcnQgY29uc3Qgc2V0TG9nZ2VyUHJlZmVyZW5jZXMgPSAocHJlZnM6IFByZWZlcmVuY2VzKSA9PiB7XG4gIGlmIChwcmVmcy5sb2dMZXZlbCkge1xuICAgIGN1cnJlbnRMZXZlbCA9IHByZWZzLmxvZ0xldmVsO1xuICB9IGVsc2UgaWYgKHByZWZzLmRlYnVnKSB7XG4gICAgY3VycmVudExldmVsID0gXCJkZWJ1Z1wiO1xuICB9IGVsc2Uge1xuICAgIGN1cnJlbnRMZXZlbCA9IFwiaW5mb1wiO1xuICB9XG59O1xuXG5jb25zdCBzaG91bGRMb2cgPSAobGV2ZWw6IExvZ0xldmVsKTogYm9vbGVhbiA9PiB7XG4gIHJldHVybiBMRVZFTF9QUklPUklUWVtsZXZlbF0gPj0gTEVWRUxfUFJJT1JJVFlbY3VycmVudExldmVsXTtcbn07XG5cbmNvbnN0IGZvcm1hdE1lc3NhZ2UgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgcmV0dXJuIGNvbnRleHQgPyBgJHttZXNzYWdlfSA6OiAke0pTT04uc3RyaW5naWZ5KGNvbnRleHQpfWAgOiBtZXNzYWdlO1xufTtcblxuY29uc3QgYWRkTG9nID0gKGxldmVsOiBMb2dMZXZlbCwgbWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgaWYgKHNob3VsZExvZyhsZXZlbCkpIHtcbiAgICAgIGNvbnN0IGVudHJ5OiBMb2dFbnRyeSA9IHtcbiAgICAgICAgICB0aW1lc3RhbXA6IERhdGUubm93KCksXG4gICAgICAgICAgbGV2ZWwsXG4gICAgICAgICAgbWVzc2FnZSxcbiAgICAgICAgICBjb250ZXh0XG4gICAgICB9O1xuXG4gICAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSB7XG4gICAgICAgICAgbG9ncy51bnNoaWZ0KGVudHJ5KTtcbiAgICAgICAgICBpZiAobG9ncy5sZW5ndGggPiBNQVhfTE9HUykge1xuICAgICAgICAgICAgICBsb2dzLnBvcCgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBzYXZlTG9nc1RvU3RvcmFnZSgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBJbiBvdGhlciBjb250ZXh0cywgc2VuZCB0byBTV1xuICAgICAgICAgIGlmIChjaHJvbWU/LnJ1bnRpbWU/LnNlbmRNZXNzYWdlKSB7XG4gICAgICAgICAgICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiAnbG9nRW50cnknLCBwYXlsb2FkOiBlbnRyeSB9KS5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgIC8vIElnbm9yZSBpZiBtZXNzYWdlIGZhaWxzIChlLmcuIGNvbnRleHQgaW52YWxpZGF0ZWQpXG4gICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgfVxuICB9XG59O1xuXG5leHBvcnQgY29uc3QgYWRkTG9nRW50cnkgPSAoZW50cnk6IExvZ0VudHJ5KSA9PiB7XG4gICAgaWYgKGlzU2VydmljZVdvcmtlcikge1xuICAgICAgICAvLyBFbnN1cmUgY29udGV4dCBpcyBzYW5pdGl6ZWQgYmVmb3JlIHN0b3JpbmdcbiAgICAgICAgY29uc3Qgc2FmZUNvbnRleHQgPSBzYW5pdGl6ZUNvbnRleHQoZW50cnkuY29udGV4dCk7XG4gICAgICAgIGNvbnN0IHNhZmVFbnRyeSA9IHsgLi4uZW50cnksIGNvbnRleHQ6IHNhZmVDb250ZXh0IH07XG5cbiAgICAgICAgbG9ncy51bnNoaWZ0KHNhZmVFbnRyeSk7XG4gICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSB7XG4gICAgICAgICAgICBsb2dzLnBvcCgpO1xuICAgICAgICB9XG4gICAgICAgIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG4gICAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGdldExvZ3MgPSAoKSA9PiBbLi4ubG9nc107XG5leHBvcnQgY29uc3QgY2xlYXJMb2dzID0gKCkgPT4ge1xuICAgIGxvZ3MubGVuZ3RoID0gMDtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSBzYXZlTG9nc1RvU3RvcmFnZSgpO1xufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0RlYnVnID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGlmIChzaG91bGRMb2coXCJkZWJ1Z1wiKSkge1xuICAgICAgY29uc3Qgc2FmZUNvbnRleHQgPSBzYW5pdGl6ZUNvbnRleHQoY29udGV4dCk7XG4gICAgICBhZGRMb2coXCJkZWJ1Z1wiLCBtZXNzYWdlLCBzYWZlQ29udGV4dCk7XG4gICAgICBjb25zb2xlLmRlYnVnKGAke1BSRUZJWH0gW0RFQlVHXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgc2FmZUNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nSW5mbyA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBpZiAoc2hvdWxkTG9nKFwiaW5mb1wiKSkge1xuICAgICAgY29uc3Qgc2FmZUNvbnRleHQgPSBzYW5pdGl6ZUNvbnRleHQoY29udGV4dCk7XG4gICAgICBhZGRMb2coXCJpbmZvXCIsIG1lc3NhZ2UsIHNhZmVDb250ZXh0KTtcbiAgICAgIGNvbnNvbGUuaW5mbyhgJHtQUkVGSVh9IFtJTkZPXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgc2FmZUNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nV2FybiA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBpZiAoc2hvdWxkTG9nKFwid2FyblwiKSkge1xuICAgICAgY29uc3Qgc2FmZUNvbnRleHQgPSBzYW5pdGl6ZUNvbnRleHQoY29udGV4dCk7XG4gICAgICBhZGRMb2coXCJ3YXJuXCIsIG1lc3NhZ2UsIHNhZmVDb250ZXh0KTtcbiAgICAgIGNvbnNvbGUud2FybihgJHtQUkVGSVh9IFtXQVJOXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgc2FmZUNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nRXJyb3IgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgaWYgKHNob3VsZExvZyhcImVycm9yXCIpKSB7XG4gICAgICBjb25zdCBzYWZlQ29udGV4dCA9IHNhbml0aXplQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGFkZExvZyhcImVycm9yXCIsIG1lc3NhZ2UsIHNhZmVDb250ZXh0KTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYCR7UFJFRklYfSBbRVJST1JdICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBzYWZlQ29udGV4dCl9YCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBsb2dDcml0aWNhbCA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBpZiAoc2hvdWxkTG9nKFwiY3JpdGljYWxcIikpIHtcbiAgICAgIGNvbnN0IHNhZmVDb250ZXh0ID0gc2FuaXRpemVDb250ZXh0KGNvbnRleHQpO1xuICAgICAgYWRkTG9nKFwiY3JpdGljYWxcIiwgbWVzc2FnZSwgc2FmZUNvbnRleHQpO1xuICAgICAgLy8gQ3JpdGljYWwgbG9ncyB1c2UgZXJyb3IgY29uc29sZSBidXQgd2l0aCBkaXN0aW5jdCBwcmVmaXggYW5kIG1heWJlIHN0eWxpbmcgaWYgc3VwcG9ydGVkXG4gICAgICBjb25zb2xlLmVycm9yKGAke1BSRUZJWH0gW0NSSVRJQ0FMXSBcdUQ4M0RcdURFQTggJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIHNhZmVDb250ZXh0KX1gKTtcbiAgfVxufTtcbiIsICJjb25zdCBob3N0bmFtZUNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcbmNvbnN0IE1BWF9DQUNIRV9TSVpFID0gMTAwMDtcblxuZXhwb3J0IGNvbnN0IGdldEhvc3RuYW1lID0gKHVybDogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gIGlmIChob3N0bmFtZUNhY2hlLmhhcyh1cmwpKSByZXR1cm4gaG9zdG5hbWVDYWNoZS5nZXQodXJsKSE7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBwYXJzZWQgPSBuZXcgVVJMKHVybCk7XG4gICAgY29uc3QgaG9zdG5hbWUgPSBwYXJzZWQuaG9zdG5hbWU7XG5cbiAgICBpZiAoaG9zdG5hbWVDYWNoZS5zaXplID49IE1BWF9DQUNIRV9TSVpFKSBob3N0bmFtZUNhY2hlLmNsZWFyKCk7XG4gICAgaG9zdG5hbWVDYWNoZS5zZXQodXJsLCBob3N0bmFtZSk7XG4gICAgcmV0dXJuIGhvc3RuYW1lO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufTtcbiIsICJpbXBvcnQgeyBHcm91cGluZ1N0cmF0ZWd5LCBTb3J0aW5nU3RyYXRlZ3ksIFRhYkdyb3VwLCBUYWJNZXRhZGF0YSwgQ3VzdG9tU3RyYXRlZ3ksIFN0cmF0ZWd5UnVsZSwgUnVsZUNvbmRpdGlvbiwgR3JvdXBpbmdSdWxlLCBTb3J0aW5nUnVsZSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGdldFN0cmF0ZWdpZXMgfSBmcm9tIFwiLi4vc2hhcmVkL3N0cmF0ZWd5UmVnaXN0cnkuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tIFwiLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5pbXBvcnQgeyBnZXRIb3N0bmFtZSB9IGZyb20gXCIuLi9zaGFyZWQvdXJsQ2FjaGUuanNcIjtcblxubGV0IGN1c3RvbVN0cmF0ZWdpZXM6IEN1c3RvbVN0cmF0ZWd5W10gPSBbXTtcblxuZXhwb3J0IGNvbnN0IHNldEN1c3RvbVN0cmF0ZWdpZXMgPSAoc3RyYXRlZ2llczogQ3VzdG9tU3RyYXRlZ3lbXSkgPT4ge1xuICAgIGN1c3RvbVN0cmF0ZWdpZXMgPSBzdHJhdGVnaWVzO1xufTtcblxuZXhwb3J0IGNvbnN0IGdldEN1c3RvbVN0cmF0ZWdpZXMgPSAoKTogQ3VzdG9tU3RyYXRlZ3lbXSA9PiBjdXN0b21TdHJhdGVnaWVzO1xuXG5jb25zdCBDT0xPUlMgPSBbXCJncmV5XCIsIFwiYmx1ZVwiLCBcInJlZFwiLCBcInllbGxvd1wiLCBcImdyZWVuXCIsIFwicGlua1wiLCBcInB1cnBsZVwiLCBcImN5YW5cIiwgXCJvcmFuZ2VcIl07XG5cbmNvbnN0IHJlZ2V4Q2FjaGUgPSBuZXcgTWFwPHN0cmluZywgUmVnRXhwPigpO1xuXG5leHBvcnQgY29uc3QgZG9tYWluRnJvbVVybCA9ICh1cmw6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGhvc3RuYW1lID0gZ2V0SG9zdG5hbWUodXJsKTtcbiAgaWYgKCFob3N0bmFtZSkgcmV0dXJuIFwidW5rbm93blwiO1xuICByZXR1cm4gaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sIFwiXCIpO1xufTtcblxuZXhwb3J0IGNvbnN0IHN1YmRvbWFpbkZyb21VcmwgPSAodXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBob3N0bmFtZSA9IGdldEhvc3RuYW1lKHVybCk7XG4gIGlmICghaG9zdG5hbWUpIHJldHVybiBcIlwiO1xuXG4gIGNvbnN0IGhvc3QgPSBob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgXCJcIik7XG4gIGNvbnN0IHBhcnRzID0gaG9zdC5zcGxpdCgnLicpO1xuICBpZiAocGFydHMubGVuZ3RoID4gMikge1xuICAgICAgcmV0dXJuIHBhcnRzLnNsaWNlKDAsIHBhcnRzLmxlbmd0aCAtIDIpLmpvaW4oJy4nKTtcbiAgfVxuICByZXR1cm4gXCJcIjtcbn1cblxuY29uc3QgZ2V0TmVzdGVkUHJvcGVydHkgPSAob2JqOiB1bmtub3duLCBwYXRoOiBzdHJpbmcpOiB1bmtub3duID0+IHtcbiAgICBpZiAoIW9iaiB8fCB0eXBlb2Ygb2JqICE9PSAnb2JqZWN0JykgcmV0dXJuIHVuZGVmaW5lZDtcblxuICAgIGlmICghcGF0aC5pbmNsdWRlcygnLicpKSB7XG4gICAgICAgIHJldHVybiAob2JqIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtwYXRoXTtcbiAgICB9XG5cbiAgICBjb25zdCBwYXJ0cyA9IHBhdGguc3BsaXQoJy4nKTtcbiAgICBsZXQgY3VycmVudDogdW5rbm93biA9IG9iajtcblxuICAgIGZvciAoY29uc3Qga2V5IG9mIHBhcnRzKSB7XG4gICAgICAgIGlmICghY3VycmVudCB8fCB0eXBlb2YgY3VycmVudCAhPT0gJ29iamVjdCcpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIGN1cnJlbnQgPSAoY3VycmVudCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilba2V5XTtcbiAgICB9XG5cbiAgICByZXR1cm4gY3VycmVudDtcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRGaWVsZFZhbHVlID0gKHRhYjogVGFiTWV0YWRhdGEsIGZpZWxkOiBzdHJpbmcpOiBhbnkgPT4ge1xuICAgIHN3aXRjaChmaWVsZCkge1xuICAgICAgICBjYXNlICdpZCc6IHJldHVybiB0YWIuaWQ7XG4gICAgICAgIGNhc2UgJ2luZGV4JzogcmV0dXJuIHRhYi5pbmRleDtcbiAgICAgICAgY2FzZSAnd2luZG93SWQnOiByZXR1cm4gdGFiLndpbmRvd0lkO1xuICAgICAgICBjYXNlICdncm91cElkJzogcmV0dXJuIHRhYi5ncm91cElkO1xuICAgICAgICBjYXNlICd0aXRsZSc6IHJldHVybiB0YWIudGl0bGU7XG4gICAgICAgIGNhc2UgJ3VybCc6IHJldHVybiB0YWIudXJsO1xuICAgICAgICBjYXNlICdzdGF0dXMnOiByZXR1cm4gdGFiLnN0YXR1cztcbiAgICAgICAgY2FzZSAnYWN0aXZlJzogcmV0dXJuIHRhYi5hY3RpdmU7XG4gICAgICAgIGNhc2UgJ3NlbGVjdGVkJzogcmV0dXJuIHRhYi5zZWxlY3RlZDtcbiAgICAgICAgY2FzZSAncGlubmVkJzogcmV0dXJuIHRhYi5waW5uZWQ7XG4gICAgICAgIGNhc2UgJ29wZW5lclRhYklkJzogcmV0dXJuIHRhYi5vcGVuZXJUYWJJZDtcbiAgICAgICAgY2FzZSAnbGFzdEFjY2Vzc2VkJzogcmV0dXJuIHRhYi5sYXN0QWNjZXNzZWQ7XG4gICAgICAgIGNhc2UgJ2NvbnRleHQnOiByZXR1cm4gdGFiLmNvbnRleHQ7XG4gICAgICAgIGNhc2UgJ2dlbnJlJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uZ2VucmU7XG4gICAgICAgIGNhc2UgJ3NpdGVOYW1lJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uc2l0ZU5hbWU7XG4gICAgICAgIC8vIERlcml2ZWQgb3IgbWFwcGVkIGZpZWxkc1xuICAgICAgICBjYXNlICdkb21haW4nOiByZXR1cm4gZG9tYWluRnJvbVVybCh0YWIudXJsKTtcbiAgICAgICAgY2FzZSAnc3ViZG9tYWluJzogcmV0dXJuIHN1YmRvbWFpbkZyb21VcmwodGFiLnVybCk7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICByZXR1cm4gZ2V0TmVzdGVkUHJvcGVydHkodGFiLCBmaWVsZCk7XG4gICAgfVxufTtcblxuY29uc3Qgc3RyaXBUbGQgPSAoZG9tYWluOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gZG9tYWluLnJlcGxhY2UoL1xcLihjb218b3JnfGdvdnxuZXR8ZWR1fGlvKSQvaSwgXCJcIik7XG59O1xuXG5leHBvcnQgY29uc3Qgc2VtYW50aWNCdWNrZXQgPSAodGl0bGU6IHN0cmluZywgdXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBrZXkgPSBgJHt0aXRsZX0gJHt1cmx9YC50b0xvd2VyQ2FzZSgpO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiZG9jXCIpIHx8IGtleS5pbmNsdWRlcyhcInJlYWRtZVwiKSB8fCBrZXkuaW5jbHVkZXMoXCJndWlkZVwiKSkgcmV0dXJuIFwiRG9jc1wiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwibWFpbFwiKSB8fCBrZXkuaW5jbHVkZXMoXCJpbmJveFwiKSkgcmV0dXJuIFwiQ2hhdFwiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiZGFzaGJvYXJkXCIpIHx8IGtleS5pbmNsdWRlcyhcImNvbnNvbGVcIikpIHJldHVybiBcIkRhc2hcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImlzc3VlXCIpIHx8IGtleS5pbmNsdWRlcyhcInRpY2tldFwiKSkgcmV0dXJuIFwiVGFza3NcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImRyaXZlXCIpIHx8IGtleS5pbmNsdWRlcyhcInN0b3JhZ2VcIikpIHJldHVybiBcIkZpbGVzXCI7XG4gIHJldHVybiBcIk1pc2NcIjtcbn07XG5cbmV4cG9ydCBjb25zdCBuYXZpZ2F0aW9uS2V5ID0gKHRhYjogVGFiTWV0YWRhdGEpOiBzdHJpbmcgPT4ge1xuICBpZiAodGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gYGNoaWxkLW9mLSR7dGFiLm9wZW5lclRhYklkfWA7XG4gIH1cbiAgcmV0dXJuIGB3aW5kb3ctJHt0YWIud2luZG93SWR9YDtcbn07XG5cbmNvbnN0IGdldFJlY2VuY3lMYWJlbCA9IChsYXN0QWNjZXNzZWQ6IG51bWJlcik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gIGNvbnN0IGRpZmYgPSBub3cgLSBsYXN0QWNjZXNzZWQ7XG4gIGlmIChkaWZmIDwgMzYwMDAwMCkgcmV0dXJuIFwiSnVzdCBub3dcIjsgLy8gMWhcbiAgaWYgKGRpZmYgPCA4NjQwMDAwMCkgcmV0dXJuIFwiVG9kYXlcIjsgLy8gMjRoXG4gIGlmIChkaWZmIDwgMTcyODAwMDAwKSByZXR1cm4gXCJZZXN0ZXJkYXlcIjsgLy8gNDhoXG4gIGlmIChkaWZmIDwgNjA0ODAwMDAwKSByZXR1cm4gXCJUaGlzIFdlZWtcIjsgLy8gN2RcbiAgcmV0dXJuIFwiT2xkZXJcIjtcbn07XG5cbmNvbnN0IGNvbG9yRm9yS2V5ID0gKGtleTogc3RyaW5nLCBvZmZzZXQ6IG51bWJlcik6IHN0cmluZyA9PiBDT0xPUlNbTWF0aC5hYnMoaGFzaENvZGUoa2V5KSArIG9mZnNldCkgJSBDT0xPUlMubGVuZ3RoXTtcblxuY29uc3QgaGFzaENvZGUgPSAodmFsdWU6IHN0cmluZyk6IG51bWJlciA9PiB7XG4gIGxldCBoYXNoID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB2YWx1ZS5sZW5ndGg7IGkgKz0gMSkge1xuICAgIGhhc2ggPSAoaGFzaCA8PCA1KSAtIGhhc2ggKyB2YWx1ZS5jaGFyQ29kZUF0KGkpO1xuICAgIGhhc2ggfD0gMDtcbiAgfVxuICByZXR1cm4gaGFzaDtcbn07XG5cbnR5cGUgTGFiZWxHZW5lcmF0b3IgPSAoZmlyc3RUYWI6IFRhYk1ldGFkYXRhLCB0YWJzOiBUYWJNZXRhZGF0YVtdLCBhbGxUYWJzTWFwOiBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YT4pID0+IHN0cmluZyB8IG51bGw7XG5cbmNvbnN0IGJ1aWx0SW5MYWJlbFN0cmF0ZWdpZXM6IFJlY29yZDxzdHJpbmcsIExhYmVsR2VuZXJhdG9yPiA9IHtcbiAgZG9tYWluOiAoZmlyc3RUYWIsIHRhYnMpID0+IHtcbiAgICBjb25zdCBzaXRlTmFtZXMgPSBuZXcgU2V0KHRhYnMubWFwKHQgPT4gdC5jb250ZXh0RGF0YT8uc2l0ZU5hbWUpLmZpbHRlcihCb29sZWFuKSk7XG4gICAgaWYgKHNpdGVOYW1lcy5zaXplID09PSAxKSB7XG4gICAgICByZXR1cm4gc3RyaXBUbGQoQXJyYXkuZnJvbShzaXRlTmFtZXMpWzBdIGFzIHN0cmluZyk7XG4gICAgfVxuICAgIHJldHVybiBzdHJpcFRsZChkb21haW5Gcm9tVXJsKGZpcnN0VGFiLnVybCkpO1xuICB9LFxuICBkb21haW5fZnVsbDogKGZpcnN0VGFiKSA9PiBkb21haW5Gcm9tVXJsKGZpcnN0VGFiLnVybCksXG4gIHRvcGljOiAoZmlyc3RUYWIpID0+IHNlbWFudGljQnVja2V0KGZpcnN0VGFiLnRpdGxlLCBmaXJzdFRhYi51cmwpLFxuICBsaW5lYWdlOiAoZmlyc3RUYWIsIF90YWJzLCBhbGxUYWJzTWFwKSA9PiB7XG4gICAgaWYgKGZpcnN0VGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGNvbnN0IHBhcmVudCA9IGFsbFRhYnNNYXAuZ2V0KGZpcnN0VGFiLm9wZW5lclRhYklkKTtcbiAgICAgIGlmIChwYXJlbnQpIHtcbiAgICAgICAgY29uc3QgcGFyZW50VGl0bGUgPSBwYXJlbnQudGl0bGUubGVuZ3RoID4gMjAgPyBwYXJlbnQudGl0bGUuc3Vic3RyaW5nKDAsIDIwKSArIFwiLi4uXCIgOiBwYXJlbnQudGl0bGU7XG4gICAgICAgIHJldHVybiBgRnJvbTogJHtwYXJlbnRUaXRsZX1gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGBGcm9tOiBUYWIgJHtmaXJzdFRhYi5vcGVuZXJUYWJJZH1gO1xuICAgIH1cbiAgICByZXR1cm4gYFdpbmRvdyAke2ZpcnN0VGFiLndpbmRvd0lkfWA7XG4gIH0sXG4gIGNvbnRleHQ6IChmaXJzdFRhYikgPT4gZmlyc3RUYWIuY29udGV4dCB8fCBcIlVuY2F0ZWdvcml6ZWRcIixcbiAgcGlubmVkOiAoZmlyc3RUYWIpID0+IGZpcnN0VGFiLnBpbm5lZCA/IFwiUGlubmVkXCIgOiBcIlVucGlubmVkXCIsXG4gIGFnZTogKGZpcnN0VGFiKSA9PiBnZXRSZWNlbmN5TGFiZWwoZmlyc3RUYWIubGFzdEFjY2Vzc2VkID8/IDApLFxuICB1cmw6ICgpID0+IFwiVVJMIEdyb3VwXCIsXG4gIHJlY2VuY3k6ICgpID0+IFwiVGltZSBHcm91cFwiLFxuICBuZXN0aW5nOiAoZmlyc3RUYWIpID0+IGZpcnN0VGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQgPyBcIkNoaWxkcmVuXCIgOiBcIlJvb3RzXCIsXG59O1xuXG4vLyBIZWxwZXIgdG8gZ2V0IGEgaHVtYW4tcmVhZGFibGUgbGFiZWwgY29tcG9uZW50IGZyb20gYSBzdHJhdGVneSBhbmQgYSBzZXQgb2YgdGFic1xuY29uc3QgZ2V0TGFiZWxDb21wb25lbnQgPSAoc3RyYXRlZ3k6IEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcsIHRhYnM6IFRhYk1ldGFkYXRhW10sIGFsbFRhYnNNYXA6IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhPik6IHN0cmluZyB8IG51bGwgPT4ge1xuICBjb25zdCBmaXJzdFRhYiA9IHRhYnNbMF07XG4gIGlmICghZmlyc3RUYWIpIHJldHVybiBcIlVua25vd25cIjtcblxuICAvLyBDaGVjayBjdXN0b20gc3RyYXRlZ2llcyBmaXJzdFxuICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneSk7XG4gIGlmIChjdXN0b20pIHtcbiAgICAgIHJldHVybiBncm91cGluZ0tleShmaXJzdFRhYiwgc3RyYXRlZ3kpO1xuICB9XG5cbiAgY29uc3QgZ2VuZXJhdG9yID0gYnVpbHRJbkxhYmVsU3RyYXRlZ2llc1tzdHJhdGVneV07XG4gIGlmIChnZW5lcmF0b3IpIHtcbiAgICByZXR1cm4gZ2VuZXJhdG9yKGZpcnN0VGFiLCB0YWJzLCBhbGxUYWJzTWFwKTtcbiAgfVxuXG4gIC8vIERlZmF1bHQgZmFsbGJhY2sgZm9yIGdlbmVyaWMgZmllbGRzXG4gIGNvbnN0IHZhbCA9IGdldEZpZWxkVmFsdWUoZmlyc3RUYWIsIHN0cmF0ZWd5KTtcbiAgaWYgKHZhbCAhPT0gdW5kZWZpbmVkICYmIHZhbCAhPT0gbnVsbCkge1xuICAgICAgcmV0dXJuIFN0cmluZyh2YWwpO1xuICB9XG4gIHJldHVybiBcIlVua25vd25cIjtcbn07XG5cbmNvbnN0IGdlbmVyYXRlTGFiZWwgPSAoXG4gIHN0cmF0ZWdpZXM6IChHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nKVtdLFxuICB0YWJzOiBUYWJNZXRhZGF0YVtdLFxuICBhbGxUYWJzTWFwOiBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YT5cbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGxhYmVscyA9IHN0cmF0ZWdpZXNcbiAgICAubWFwKHMgPT4gZ2V0TGFiZWxDb21wb25lbnQocywgdGFicywgYWxsVGFic01hcCkpXG4gICAgLmZpbHRlcihsID0+IGwgJiYgbCAhPT0gXCJVbmtub3duXCIgJiYgbCAhPT0gXCJHcm91cFwiICYmIGwgIT09IFwiVVJMIEdyb3VwXCIgJiYgbCAhPT0gXCJUaW1lIEdyb3VwXCIgJiYgbCAhPT0gXCJNaXNjXCIpO1xuXG4gIGlmIChsYWJlbHMubGVuZ3RoID09PSAwKSByZXR1cm4gXCJHcm91cFwiO1xuICByZXR1cm4gQXJyYXkuZnJvbShuZXcgU2V0KGxhYmVscykpLmpvaW4oXCIgLSBcIik7XG59O1xuXG5jb25zdCBnZXRTdHJhdGVneUNvbG9yUnVsZSA9IChzdHJhdGVneUlkOiBzdHJpbmcpOiBHcm91cGluZ1J1bGUgfCB1bmRlZmluZWQgPT4ge1xuICAgIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5SWQpO1xuICAgIGlmICghY3VzdG9tKSByZXR1cm4gdW5kZWZpbmVkO1xuXG4gICAgY29uc3QgZ3JvdXBpbmdSdWxlc0xpc3QgPSBhc0FycmF5PEdyb3VwaW5nUnVsZT4oY3VzdG9tLmdyb3VwaW5nUnVsZXMpO1xuICAgIC8vIEl0ZXJhdGUgbWFudWFsbHkgdG8gY2hlY2sgY29sb3JcbiAgICBmb3IgKGxldCBpID0gZ3JvdXBpbmdSdWxlc0xpc3QubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgY29uc3QgcnVsZSA9IGdyb3VwaW5nUnVsZXNMaXN0W2ldO1xuICAgICAgICBpZiAocnVsZSAmJiBydWxlLmNvbG9yICYmIHJ1bGUuY29sb3IgIT09ICdyYW5kb20nKSB7XG4gICAgICAgICAgICByZXR1cm4gcnVsZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xufTtcblxuY29uc3QgcmVzb2x2ZVdpbmRvd01vZGUgPSAobW9kZXM6IChzdHJpbmcgfCB1bmRlZmluZWQpW10pOiBcImN1cnJlbnRcIiB8IFwibmV3XCIgfCBcImNvbXBvdW5kXCIgPT4ge1xuICAgIGlmIChtb2Rlcy5pbmNsdWRlcyhcIm5ld1wiKSkgcmV0dXJuIFwibmV3XCI7XG4gICAgaWYgKG1vZGVzLmluY2x1ZGVzKFwiY29tcG91bmRcIikpIHJldHVybiBcImNvbXBvdW5kXCI7XG4gICAgcmV0dXJuIFwiY3VycmVudFwiO1xufTtcblxuZXhwb3J0IGNvbnN0IGdyb3VwVGFicyA9IChcbiAgdGFiczogVGFiTWV0YWRhdGFbXSxcbiAgc3RyYXRlZ2llczogKFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZylbXVxuKTogVGFiR3JvdXBbXSA9PiB7XG4gIGNvbnN0IGF2YWlsYWJsZVN0cmF0ZWdpZXMgPSBnZXRTdHJhdGVnaWVzKGN1c3RvbVN0cmF0ZWdpZXMpO1xuICBjb25zdCBlZmZlY3RpdmVTdHJhdGVnaWVzID0gc3RyYXRlZ2llcy5maWx0ZXIocyA9PiBhdmFpbGFibGVTdHJhdGVnaWVzLmZpbmQoYXZhaWwgPT4gYXZhaWwuaWQgPT09IHMpPy5pc0dyb3VwaW5nKTtcbiAgY29uc3QgYnVja2V0cyA9IG5ldyBNYXA8c3RyaW5nLCBUYWJHcm91cD4oKTtcblxuICBjb25zdCBhbGxUYWJzTWFwID0gbmV3IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhPigpO1xuICB0YWJzLmZvckVhY2godCA9PiBhbGxUYWJzTWFwLnNldCh0LmlkLCB0KSk7XG5cbiAgdGFicy5mb3JFYWNoKCh0YWIpID0+IHtcbiAgICBsZXQga2V5czogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBhcHBsaWVkU3RyYXRlZ2llczogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBjb2xsZWN0ZWRNb2Rlczogc3RyaW5nW10gPSBbXTtcblxuICAgIHRyeSB7XG4gICAgICAgIGZvciAoY29uc3QgcyBvZiBlZmZlY3RpdmVTdHJhdGVnaWVzKSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBnZXRHcm91cGluZ1Jlc3VsdCh0YWIsIHMpO1xuICAgICAgICAgICAgaWYgKHJlc3VsdC5rZXkgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBrZXlzLnB1c2goYCR7c306JHtyZXN1bHQua2V5fWApO1xuICAgICAgICAgICAgICAgIGFwcGxpZWRTdHJhdGVnaWVzLnB1c2gocyk7XG4gICAgICAgICAgICAgICAgY29sbGVjdGVkTW9kZXMucHVzaChyZXN1bHQubW9kZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGxvZ0RlYnVnKFwiRXJyb3IgZ2VuZXJhdGluZyBncm91cGluZyBrZXlcIiwgeyB0YWJJZDogdGFiLmlkLCBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICByZXR1cm47IC8vIFNraXAgdGhpcyB0YWIgb24gZXJyb3JcbiAgICB9XG5cbiAgICAvLyBJZiBubyBzdHJhdGVnaWVzIGFwcGxpZWQgKGUuZy4gYWxsIGZpbHRlcmVkIG91dCksIHNraXAgZ3JvdXBpbmcgZm9yIHRoaXMgdGFiXG4gICAgaWYgKGtleXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBlZmZlY3RpdmVNb2RlID0gcmVzb2x2ZVdpbmRvd01vZGUoY29sbGVjdGVkTW9kZXMpO1xuICAgIGNvbnN0IHZhbHVlS2V5ID0ga2V5cy5qb2luKFwiOjpcIik7XG4gICAgbGV0IGJ1Y2tldEtleSA9IFwiXCI7XG4gICAgaWYgKGVmZmVjdGl2ZU1vZGUgPT09ICdjdXJyZW50Jykge1xuICAgICAgICAgYnVja2V0S2V5ID0gYHdpbmRvdy0ke3RhYi53aW5kb3dJZH06OmAgKyB2YWx1ZUtleTtcbiAgICB9IGVsc2Uge1xuICAgICAgICAgYnVja2V0S2V5ID0gYGdsb2JhbDo6YCArIHZhbHVlS2V5O1xuICAgIH1cblxuICAgIGxldCBncm91cCA9IGJ1Y2tldHMuZ2V0KGJ1Y2tldEtleSk7XG4gICAgaWYgKCFncm91cCkge1xuICAgICAgbGV0IGdyb3VwQ29sb3IgPSBudWxsO1xuICAgICAgbGV0IGNvbG9yRmllbGQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgIGxldCBjb2xvclRyYW5zZm9ybTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgbGV0IGNvbG9yVHJhbnNmb3JtUGF0dGVybjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG4gICAgICBmb3IgKGNvbnN0IHNJZCBvZiBhcHBsaWVkU3RyYXRlZ2llcykge1xuICAgICAgICBjb25zdCBydWxlID0gZ2V0U3RyYXRlZ3lDb2xvclJ1bGUoc0lkKTtcbiAgICAgICAgaWYgKHJ1bGUpIHtcbiAgICAgICAgICAgIGdyb3VwQ29sb3IgPSBydWxlLmNvbG9yO1xuICAgICAgICAgICAgY29sb3JGaWVsZCA9IHJ1bGUuY29sb3JGaWVsZDtcbiAgICAgICAgICAgIGNvbG9yVHJhbnNmb3JtID0gcnVsZS5jb2xvclRyYW5zZm9ybTtcbiAgICAgICAgICAgIGNvbG9yVHJhbnNmb3JtUGF0dGVybiA9IHJ1bGUuY29sb3JUcmFuc2Zvcm1QYXR0ZXJuO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKGdyb3VwQ29sb3IgPT09ICdtYXRjaCcpIHtcbiAgICAgICAgZ3JvdXBDb2xvciA9IGNvbG9yRm9yS2V5KHZhbHVlS2V5LCAwKTtcbiAgICAgIH0gZWxzZSBpZiAoZ3JvdXBDb2xvciA9PT0gJ2ZpZWxkJyAmJiBjb2xvckZpZWxkKSB7XG4gICAgICAgIGNvbnN0IHZhbCA9IGdldEZpZWxkVmFsdWUodGFiLCBjb2xvckZpZWxkKTtcbiAgICAgICAgbGV0IGtleSA9IHZhbCAhPT0gdW5kZWZpbmVkICYmIHZhbCAhPT0gbnVsbCA/IFN0cmluZyh2YWwpIDogXCJcIjtcbiAgICAgICAgaWYgKGNvbG9yVHJhbnNmb3JtKSB7XG4gICAgICAgICAgICBrZXkgPSBhcHBseVZhbHVlVHJhbnNmb3JtKGtleSwgY29sb3JUcmFuc2Zvcm0sIGNvbG9yVHJhbnNmb3JtUGF0dGVybik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoa2V5KSB7XG4gICAgICAgICAgICAgZ3JvdXBDb2xvciA9IGNvbG9yRm9yS2V5KGtleSwgMCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgLy8gRmFsbGJhY2sgdG8gcmFuZG9tL2dyb3VwLWJhc2VkIGNvbG9yIGlmIGtleSBpcyBlbXB0eVxuICAgICAgICAgICAgIGdyb3VwQ29sb3IgPSBjb2xvckZvcktleSh2YWx1ZUtleSwgMCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoIWdyb3VwQ29sb3IgfHwgZ3JvdXBDb2xvciA9PT0gJ2ZpZWxkJykge1xuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkodmFsdWVLZXksIDApO1xuICAgICAgfVxuXG4gICAgICBncm91cCA9IHtcbiAgICAgICAgaWQ6IGJ1Y2tldEtleSxcbiAgICAgICAgd2luZG93SWQ6IHRhYi53aW5kb3dJZCxcbiAgICAgICAgbGFiZWw6IFwiXCIsXG4gICAgICAgIGNvbG9yOiBncm91cENvbG9yLFxuICAgICAgICB0YWJzOiBbXSxcbiAgICAgICAgcmVhc29uOiBhcHBsaWVkU3RyYXRlZ2llcy5qb2luKFwiICsgXCIpLFxuICAgICAgICB3aW5kb3dNb2RlOiBlZmZlY3RpdmVNb2RlXG4gICAgICB9O1xuICAgICAgYnVja2V0cy5zZXQoYnVja2V0S2V5LCBncm91cCk7XG4gICAgfVxuICAgIGdyb3VwLnRhYnMucHVzaCh0YWIpO1xuICB9KTtcblxuICBjb25zdCBncm91cHMgPSBBcnJheS5mcm9tKGJ1Y2tldHMudmFsdWVzKCkpO1xuICBncm91cHMuZm9yRWFjaChncm91cCA9PiB7XG4gICAgZ3JvdXAubGFiZWwgPSBnZW5lcmF0ZUxhYmVsKGVmZmVjdGl2ZVN0cmF0ZWdpZXMsIGdyb3VwLnRhYnMsIGFsbFRhYnNNYXApO1xuICB9KTtcblxuICByZXR1cm4gZ3JvdXBzO1xufTtcblxuY29uc3QgY2hlY2tWYWx1ZU1hdGNoID0gKFxuICAgIG9wZXJhdG9yOiBzdHJpbmcsXG4gICAgcmF3VmFsdWU6IGFueSxcbiAgICBydWxlVmFsdWU6IHN0cmluZ1xuKTogeyBpc01hdGNoOiBib29sZWFuOyBtYXRjaE9iajogUmVnRXhwRXhlY0FycmF5IHwgbnVsbCB9ID0+IHtcbiAgICBjb25zdCB2YWx1ZVN0ciA9IHJhd1ZhbHVlICE9PSB1bmRlZmluZWQgJiYgcmF3VmFsdWUgIT09IG51bGwgPyBTdHJpbmcocmF3VmFsdWUpIDogXCJcIjtcbiAgICBjb25zdCB2YWx1ZVRvQ2hlY2sgPSB2YWx1ZVN0ci50b0xvd2VyQ2FzZSgpO1xuICAgIGNvbnN0IHBhdHRlcm5Ub0NoZWNrID0gcnVsZVZhbHVlID8gcnVsZVZhbHVlLnRvTG93ZXJDYXNlKCkgOiBcIlwiO1xuXG4gICAgbGV0IGlzTWF0Y2ggPSBmYWxzZTtcbiAgICBsZXQgbWF0Y2hPYmo6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGwgPSBudWxsO1xuXG4gICAgc3dpdGNoIChvcGVyYXRvcikge1xuICAgICAgICBjYXNlICdjb250YWlucyc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suaW5jbHVkZXMocGF0dGVyblRvQ2hlY2spOyBicmVhaztcbiAgICAgICAgY2FzZSAnZG9lc05vdENvbnRhaW4nOiBpc01hdGNoID0gIXZhbHVlVG9DaGVjay5pbmNsdWRlcyhwYXR0ZXJuVG9DaGVjayk7IGJyZWFrO1xuICAgICAgICBjYXNlICdlcXVhbHMnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrID09PSBwYXR0ZXJuVG9DaGVjazsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3N0YXJ0c1dpdGgnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrLnN0YXJ0c1dpdGgocGF0dGVyblRvQ2hlY2spOyBicmVhaztcbiAgICAgICAgY2FzZSAnZW5kc1dpdGgnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrLmVuZHNXaXRoKHBhdHRlcm5Ub0NoZWNrKTsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2V4aXN0cyc6IGlzTWF0Y2ggPSByYXdWYWx1ZSAhPT0gdW5kZWZpbmVkOyBicmVhaztcbiAgICAgICAgY2FzZSAnZG9lc05vdEV4aXN0JzogaXNNYXRjaCA9IHJhd1ZhbHVlID09PSB1bmRlZmluZWQ7IGJyZWFrO1xuICAgICAgICBjYXNlICdpc051bGwnOiBpc01hdGNoID0gcmF3VmFsdWUgPT09IG51bGw7IGJyZWFrO1xuICAgICAgICBjYXNlICdpc05vdE51bGwnOiBpc01hdGNoID0gcmF3VmFsdWUgIT09IG51bGw7IGJyZWFrO1xuICAgICAgICBjYXNlICdtYXRjaGVzJzpcbiAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChydWxlVmFsdWUsICdpJyk7XG4gICAgICAgICAgICAgICAgbWF0Y2hPYmogPSByZWdleC5leGVjKHZhbHVlU3RyKTtcbiAgICAgICAgICAgICAgICBpc01hdGNoID0gISFtYXRjaE9iajtcbiAgICAgICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICByZXR1cm4geyBpc01hdGNoLCBtYXRjaE9iaiB9O1xufTtcblxuZXhwb3J0IGNvbnN0IGNoZWNrQ29uZGl0aW9uID0gKGNvbmRpdGlvbjogUnVsZUNvbmRpdGlvbiwgdGFiOiBUYWJNZXRhZGF0YSk6IGJvb2xlYW4gPT4ge1xuICAgIGlmICghY29uZGl0aW9uKSByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgcmF3VmFsdWUgPSBnZXRGaWVsZFZhbHVlKHRhYiwgY29uZGl0aW9uLmZpZWxkKTtcbiAgICBjb25zdCB7IGlzTWF0Y2ggfSA9IGNoZWNrVmFsdWVNYXRjaChjb25kaXRpb24ub3BlcmF0b3IsIHJhd1ZhbHVlLCBjb25kaXRpb24udmFsdWUpO1xuICAgIHJldHVybiBpc01hdGNoO1xufTtcblxuZXhwb3J0IGNvbnN0IGFwcGx5VmFsdWVUcmFuc2Zvcm0gPSAodmFsOiBzdHJpbmcsIHRyYW5zZm9ybTogc3RyaW5nLCBwYXR0ZXJuPzogc3RyaW5nLCByZXBsYWNlbWVudD86IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgaWYgKCF2YWwgfHwgIXRyYW5zZm9ybSB8fCB0cmFuc2Zvcm0gPT09ICdub25lJykgcmV0dXJuIHZhbDtcblxuICAgIHN3aXRjaCAodHJhbnNmb3JtKSB7XG4gICAgICAgIGNhc2UgJ3N0cmlwVGxkJzpcbiAgICAgICAgICAgIHJldHVybiBzdHJpcFRsZCh2YWwpO1xuICAgICAgICBjYXNlICdsb3dlcmNhc2UnOlxuICAgICAgICAgICAgcmV0dXJuIHZhbC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICBjYXNlICd1cHBlcmNhc2UnOlxuICAgICAgICAgICAgcmV0dXJuIHZhbC50b1VwcGVyQ2FzZSgpO1xuICAgICAgICBjYXNlICdmaXJzdENoYXInOlxuICAgICAgICAgICAgcmV0dXJuIHZhbC5jaGFyQXQoMCk7XG4gICAgICAgIGNhc2UgJ2RvbWFpbic6XG4gICAgICAgICAgICByZXR1cm4gZG9tYWluRnJvbVVybCh2YWwpO1xuICAgICAgICBjYXNlICdob3N0bmFtZSc6XG4gICAgICAgICAgICBjb25zdCBoID0gZ2V0SG9zdG5hbWUodmFsKTtcbiAgICAgICAgICAgIHJldHVybiBoICE9PSBudWxsID8gaCA6IHZhbDtcbiAgICAgICAgY2FzZSAncmVnZXgnOlxuICAgICAgICAgICAgaWYgKHBhdHRlcm4pIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBsZXQgcmVnZXggPSByZWdleENhY2hlLmdldChwYXR0ZXJuKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFyZWdleCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVnZXggPSBuZXcgUmVnRXhwKHBhdHRlcm4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVnZXhDYWNoZS5zZXQocGF0dGVybiwgcmVnZXgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1hdGNoID0gcmVnZXguZXhlYyh2YWwpO1xuICAgICAgICAgICAgICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBleHRyYWN0ZWQgPSBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBtYXRjaC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4dHJhY3RlZCArPSBtYXRjaFtpXSB8fCBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGV4dHJhY3RlZDtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkludmFsaWQgcmVnZXggaW4gdHJhbnNmb3JtXCIsIHsgcGF0dGVybjogcGF0dGVybiwgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgY2FzZSAncmVnZXhSZXBsYWNlJzpcbiAgICAgICAgICAgICBpZiAocGF0dGVybikge1xuICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgLy8gVXNpbmcgJ2cnIGdsb2JhbCBmbGFnIGJ5IGRlZmF1bHQgZm9yIHJlcGxhY2VtZW50XG4gICAgICAgICAgICAgICAgICAgICByZXR1cm4gdmFsLnJlcGxhY2UobmV3IFJlZ0V4cChwYXR0ZXJuLCAnZycpLCByZXBsYWNlbWVudCB8fCBcIlwiKTtcbiAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICAgbG9nRGVidWcoXCJJbnZhbGlkIHJlZ2V4IGluIHRyYW5zZm9ybVwiLCB7IHBhdHRlcm46IHBhdHRlcm4sIGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgICAgICAgICAgICAgICByZXR1cm4gdmFsO1xuICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgfVxuICAgICAgICAgICAgIHJldHVybiB2YWw7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICByZXR1cm4gdmFsO1xuICAgIH1cbn07XG5cbi8qKlxuICogRXZhbHVhdGVzIGxlZ2FjeSBydWxlcyAoc2ltcGxlIEFORC9PUiBjb25kaXRpb25zIHdpdGhvdXQgZ3JvdXBpbmcvZmlsdGVyIHNlcGFyYXRpb24pLlxuICogQGRlcHJlY2F0ZWQgVGhpcyBsb2dpYyBpcyBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eSB3aXRoIG9sZCBjdXN0b20gc3RyYXRlZ2llcy5cbiAqL1xuZnVuY3Rpb24gZXZhbHVhdGVMZWdhY3lSdWxlcyhsZWdhY3lSdWxlczogU3RyYXRlZ3lSdWxlW10sIHRhYjogVGFiTWV0YWRhdGEpOiBzdHJpbmcgfCBudWxsIHtcbiAgICBjb25zdCBsZWdhY3lSdWxlc0xpc3QgPSBhc0FycmF5PFN0cmF0ZWd5UnVsZT4obGVnYWN5UnVsZXMpO1xuICAgIGlmIChsZWdhY3lSdWxlc0xpc3QubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcblxuICAgIHRyeSB7XG4gICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBsZWdhY3lSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgIGlmICghcnVsZSkgY29udGludWU7XG4gICAgICAgICAgICBjb25zdCByYXdWYWx1ZSA9IGdldEZpZWxkVmFsdWUodGFiLCBydWxlLmZpZWxkKTtcbiAgICAgICAgICAgIGNvbnN0IHsgaXNNYXRjaCwgbWF0Y2hPYmogfSA9IGNoZWNrVmFsdWVNYXRjaChydWxlLm9wZXJhdG9yLCByYXdWYWx1ZSwgcnVsZS52YWx1ZSk7XG5cbiAgICAgICAgICAgIGlmIChpc01hdGNoKSB7XG4gICAgICAgICAgICAgICAgbGV0IHJlc3VsdCA9IHJ1bGUucmVzdWx0O1xuICAgICAgICAgICAgICAgIGlmIChtYXRjaE9iaiAmJiBtYXRjaE9iai5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgbWF0Y2hPYmoubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShuZXcgUmVnRXhwKGBcXFxcJCR7aX1gLCAnZycpLCBtYXRjaE9ialtpXSB8fCBcIlwiKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgbG9nRGVidWcoXCJFcnJvciBldmFsdWF0aW5nIGxlZ2FjeSBydWxlc1wiLCB7IGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGNvbnN0IGdldEdyb3VwaW5nUmVzdWx0ID0gKHRhYjogVGFiTWV0YWRhdGEsIHN0cmF0ZWd5OiBHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nKTogeyBrZXk6IHN0cmluZyB8IG51bGwsIG1vZGU6IFwiY3VycmVudFwiIHwgXCJuZXdcIiB8IFwiY29tcG91bmRcIiB9ID0+IHtcbiAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3kpO1xuICBpZiAoY3VzdG9tKSB7XG4gICAgICBjb25zdCBmaWx0ZXJHcm91cHNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uW10+KGN1c3RvbS5maWx0ZXJHcm91cHMpO1xuICAgICAgY29uc3QgZmlsdGVyc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGN1c3RvbS5maWx0ZXJzKTtcblxuICAgICAgbGV0IG1hdGNoID0gZmFsc2U7XG5cbiAgICAgIGlmIChmaWx0ZXJHcm91cHNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAvLyBPUiBsb2dpY1xuICAgICAgICAgIGZvciAoY29uc3QgZ3JvdXAgb2YgZmlsdGVyR3JvdXBzTGlzdCkge1xuICAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihncm91cCk7XG4gICAgICAgICAgICAgIGlmIChncm91cFJ1bGVzLmxlbmd0aCA9PT0gMCB8fCBncm91cFJ1bGVzLmV2ZXJ5KHIgPT4gY2hlY2tDb25kaXRpb24ociwgdGFiKSkpIHtcbiAgICAgICAgICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChmaWx0ZXJzTGlzdC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgLy8gTGVnYWN5L1NpbXBsZSBBTkQgbG9naWNcbiAgICAgICAgICBpZiAoZmlsdGVyc0xpc3QuZXZlcnkoZiA9PiBjaGVja0NvbmRpdGlvbihmLCB0YWIpKSkge1xuICAgICAgICAgICAgICBtYXRjaCA9IHRydWU7XG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBObyBmaWx0ZXJzIC0+IE1hdGNoIGFsbFxuICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFtYXRjaCkge1xuICAgICAgICAgIHJldHVybiB7IGtleTogbnVsbCwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZ3JvdXBpbmdSdWxlc0xpc3QgPSBhc0FycmF5PEdyb3VwaW5nUnVsZT4oY3VzdG9tLmdyb3VwaW5nUnVsZXMpO1xuICAgICAgaWYgKGdyb3VwaW5nUnVsZXNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICBjb25zdCBtb2Rlczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwaW5nUnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICBsZXQgdmFsID0gXCJcIjtcbiAgICAgICAgICAgICAgICBpZiAocnVsZS5zb3VyY2UgPT09ICdmaWVsZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJhdyA9IGdldEZpZWxkVmFsdWUodGFiLCBydWxlLnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHJhdyAhPT0gdW5kZWZpbmVkICYmIHJhdyAhPT0gbnVsbCA/IFN0cmluZyhyYXcpIDogXCJcIjtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgdmFsID0gcnVsZS52YWx1ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodmFsICYmIHJ1bGUudHJhbnNmb3JtICYmIHJ1bGUudHJhbnNmb3JtICE9PSAnbm9uZScpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFsID0gYXBwbHlWYWx1ZVRyYW5zZm9ybSh2YWwsIHJ1bGUudHJhbnNmb3JtLCBydWxlLnRyYW5zZm9ybVBhdHRlcm4sIHJ1bGUudHJhbnNmb3JtUmVwbGFjZW1lbnQpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh2YWwpIHtcbiAgICAgICAgICAgICAgICAgICAgcGFydHMucHVzaCh2YWwpO1xuICAgICAgICAgICAgICAgICAgICBpZiAocnVsZS53aW5kb3dNb2RlKSBtb2Rlcy5wdXNoKHJ1bGUud2luZG93TW9kZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGFwcGx5aW5nIGdyb3VwaW5nIHJ1bGVzXCIsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICByZXR1cm4geyBrZXk6IHBhcnRzLmpvaW4oXCIgLSBcIiksIG1vZGU6IHJlc29sdmVXaW5kb3dNb2RlKG1vZGVzKSB9O1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4geyBrZXk6IGN1c3RvbS5mYWxsYmFjayB8fCBcIk1pc2NcIiwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH0gZWxzZSBpZiAoY3VzdG9tLnJ1bGVzKSB7XG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0gZXZhbHVhdGVMZWdhY3lSdWxlcyhhc0FycmF5PFN0cmF0ZWd5UnVsZT4oY3VzdG9tLnJ1bGVzKSwgdGFiKTtcbiAgICAgICAgICBpZiAocmVzdWx0KSByZXR1cm4geyBrZXk6IHJlc3VsdCwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHsga2V5OiBjdXN0b20uZmFsbGJhY2sgfHwgXCJNaXNjXCIsIG1vZGU6IFwiY3VycmVudFwiIH07XG4gIH1cblxuICAvLyBCdWlsdC1pbiBzdHJhdGVnaWVzXG4gIGxldCBzaW1wbGVLZXk6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBzd2l0Y2ggKHN0cmF0ZWd5KSB7XG4gICAgY2FzZSBcImRvbWFpblwiOlxuICAgIGNhc2UgXCJkb21haW5fZnVsbFwiOlxuICAgICAgc2ltcGxlS2V5ID0gZG9tYWluRnJvbVVybCh0YWIudXJsKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJ0b3BpY1wiOlxuICAgICAgc2ltcGxlS2V5ID0gc2VtYW50aWNCdWNrZXQodGFiLnRpdGxlLCB0YWIudXJsKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJsaW5lYWdlXCI6XG4gICAgICBzaW1wbGVLZXkgPSBuYXZpZ2F0aW9uS2V5KHRhYik7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwiY29udGV4dFwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLmNvbnRleHQgfHwgXCJVbmNhdGVnb3JpemVkXCI7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwicGlubmVkXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIucGlubmVkID8gXCJwaW5uZWRcIiA6IFwidW5waW5uZWRcIjtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJhZ2VcIjpcbiAgICAgIHNpbXBsZUtleSA9IGdldFJlY2VuY3lMYWJlbCh0YWIubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInVybFwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLnVybDtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJ0aXRsZVwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLnRpdGxlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInJlY2VuY3lcIjpcbiAgICAgIHNpbXBsZUtleSA9IFN0cmluZyh0YWIubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcIm5lc3RpbmdcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkID8gXCJjaGlsZFwiIDogXCJyb290XCI7XG4gICAgICBicmVhaztcbiAgICBkZWZhdWx0OlxuICAgICAgICBjb25zdCB2YWwgPSBnZXRGaWVsZFZhbHVlKHRhYiwgc3RyYXRlZ3kpO1xuICAgICAgICBpZiAodmFsICE9PSB1bmRlZmluZWQgJiYgdmFsICE9PSBudWxsKSB7XG4gICAgICAgICAgICBzaW1wbGVLZXkgPSBTdHJpbmcodmFsKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNpbXBsZUtleSA9IFwiVW5rbm93blwiO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICB9XG4gIHJldHVybiB7IGtleTogc2ltcGxlS2V5LCBtb2RlOiBcImN1cnJlbnRcIiB9O1xufTtcblxuZXhwb3J0IGNvbnN0IGdyb3VwaW5nS2V5ID0gKHRhYjogVGFiTWV0YWRhdGEsIHN0cmF0ZWd5OiBHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gICAgcmV0dXJuIGdldEdyb3VwaW5nUmVzdWx0KHRhYiwgc3RyYXRlZ3kpLmtleTtcbn07XG5cbmZ1bmN0aW9uIGlzQ29udGV4dEZpZWxkKGZpZWxkOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICByZXR1cm4gZmllbGQgPT09ICdjb250ZXh0JyB8fCBmaWVsZCA9PT0gJ2dlbnJlJyB8fCBmaWVsZCA9PT0gJ3NpdGVOYW1lJyB8fCBmaWVsZC5zdGFydHNXaXRoKCdjb250ZXh0RGF0YS4nKTtcbn1cblxuZXhwb3J0IGNvbnN0IHJlcXVpcmVzQ29udGV4dEFuYWx5c2lzID0gKHN0cmF0ZWd5SWRzOiAoc3RyaW5nIHwgU29ydGluZ1N0cmF0ZWd5KVtdKTogYm9vbGVhbiA9PiB7XG4gICAgLy8gQ2hlY2sgaWYgXCJjb250ZXh0XCIgc3RyYXRlZ3kgaXMgZXhwbGljaXRseSByZXF1ZXN0ZWRcbiAgICBpZiAoc3RyYXRlZ3lJZHMuaW5jbHVkZXMoXCJjb250ZXh0XCIpKSByZXR1cm4gdHJ1ZTtcblxuICAgIGNvbnN0IHN0cmF0ZWdpZXMgPSBnZXRTdHJhdGVnaWVzKGN1c3RvbVN0cmF0ZWdpZXMpO1xuICAgIC8vIGZpbHRlciBvbmx5IHRob3NlIHRoYXQgbWF0Y2ggdGhlIHJlcXVlc3RlZCBJRHNcbiAgICBjb25zdCBhY3RpdmVEZWZzID0gc3RyYXRlZ2llcy5maWx0ZXIocyA9PiBzdHJhdGVneUlkcy5pbmNsdWRlcyhzLmlkKSk7XG5cbiAgICBmb3IgKGNvbnN0IGRlZiBvZiBhY3RpdmVEZWZzKSB7XG4gICAgICAgIC8vIElmIGl0J3MgYSBidWlsdC1pbiBzdHJhdGVneSB0aGF0IG5lZWRzIGNvbnRleHQgKG9ubHkgJ2NvbnRleHQnIGRvZXMpXG4gICAgICAgIGlmIChkZWYuaWQgPT09ICdjb250ZXh0JykgcmV0dXJuIHRydWU7XG5cbiAgICAgICAgLy8gSWYgaXQgaXMgYSBjdXN0b20gc3RyYXRlZ3kgKG9yIG92ZXJyaWRlcyBidWlsdC1pbiksIGNoZWNrIGl0cyBydWxlc1xuICAgICAgICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQoYyA9PiBjLmlkID09PSBkZWYuaWQpO1xuICAgICAgICBpZiAoY3VzdG9tKSB7XG4gICAgICAgICAgICAgY29uc3QgZ3JvdXBSdWxlc0xpc3QgPSBhc0FycmF5PEdyb3VwaW5nUnVsZT4oY3VzdG9tLmdyb3VwaW5nUnVsZXMpO1xuICAgICAgICAgICAgIGNvbnN0IHNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihjdXN0b20uc29ydGluZ1J1bGVzKTtcbiAgICAgICAgICAgICBjb25zdCBncm91cFNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihjdXN0b20uZ3JvdXBTb3J0aW5nUnVsZXMpO1xuICAgICAgICAgICAgIGNvbnN0IGZpbHRlcnNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihjdXN0b20uZmlsdGVycyk7XG4gICAgICAgICAgICAgY29uc3QgZmlsdGVyR3JvdXBzTGlzdCA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbltdPihjdXN0b20uZmlsdGVyR3JvdXBzKTtcblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBydWxlLnNvdXJjZSA9PT0gJ2ZpZWxkJyAmJiBpc0NvbnRleHRGaWVsZChydWxlLnZhbHVlKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIHJ1bGUuY29sb3IgPT09ICdmaWVsZCcgJiYgcnVsZS5jb2xvckZpZWxkICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuY29sb3JGaWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBzb3J0UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZ3JvdXBTb3J0UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZmlsdGVyc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgZ3JvdXAgb2YgZmlsdGVyR3JvdXBzTGlzdCkge1xuICAgICAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihncm91cCk7XG4gICAgICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFJ1bGVzKSB7XG4gICAgICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBpc0NvbnRleHRGaWVsZChydWxlLmZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufTtcbiIsICJpbXBvcnQgeyBTb3J0aW5nU3RyYXRlZ3ksIFRhYk1ldGFkYXRhLCBDdXN0b21TdHJhdGVneSwgU29ydGluZ1J1bGUgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBkb21haW5Gcm9tVXJsLCBzZW1hbnRpY0J1Y2tldCwgbmF2aWdhdGlvbktleSwgZ3JvdXBpbmdLZXksIGdldEZpZWxkVmFsdWUsIGdldEN1c3RvbVN0cmF0ZWdpZXMgfSBmcm9tIFwiLi9ncm91cGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tIFwiLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5cbi8vIEhlbHBlciBzY29yZXNcbmV4cG9ydCBjb25zdCByZWNlbmN5U2NvcmUgPSAodGFiOiBUYWJNZXRhZGF0YSkgPT4gdGFiLmxhc3RBY2Nlc3NlZCA/PyAwO1xuZXhwb3J0IGNvbnN0IGhpZXJhcmNoeVNjb3JlID0gKHRhYjogVGFiTWV0YWRhdGEpID0+ICh0YWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCA/IDEgOiAwKTtcbmV4cG9ydCBjb25zdCBwaW5uZWRTY29yZSA9ICh0YWI6IFRhYk1ldGFkYXRhKSA9PiAodGFiLnBpbm5lZCA/IDAgOiAxKTtcblxuZXhwb3J0IGNvbnN0IGNvbXBhcmVWYWx1ZXMgPSAoYTogYW55LCBiOiBhbnksIG9yZGVyOiAnYXNjJyB8ICdkZXNjJyA9ICdhc2MnKTogbnVtYmVyID0+IHtcbiAgICAvLyBUcmVhdCB1bmRlZmluZWQvbnVsbCBhcyBcImdyZWF0ZXJcIiB0aGFuIGV2ZXJ5dGhpbmcgZWxzZSAocHVzaGVkIHRvIGVuZCBpbiBhc2MpXG4gICAgY29uc3QgaXNBTnVsbCA9IGEgPT09IHVuZGVmaW5lZCB8fCBhID09PSBudWxsO1xuICAgIGNvbnN0IGlzQk51bGwgPSBiID09PSB1bmRlZmluZWQgfHwgYiA9PT0gbnVsbDtcblxuICAgIGlmIChpc0FOdWxsICYmIGlzQk51bGwpIHJldHVybiAwO1xuICAgIGlmIChpc0FOdWxsKSByZXR1cm4gMTsgLy8gYSA+IGIgKGEgaXMgbnVsbClcbiAgICBpZiAoaXNCTnVsbCkgcmV0dXJuIC0xOyAvLyBiID4gYSAoYiBpcyBudWxsKSAtPiBhIDwgYlxuXG4gICAgbGV0IHJlc3VsdCA9IDA7XG4gICAgaWYgKGEgPCBiKSByZXN1bHQgPSAtMTtcbiAgICBlbHNlIGlmIChhID4gYikgcmVzdWx0ID0gMTtcblxuICAgIHJldHVybiBvcmRlciA9PT0gJ2Rlc2MnID8gLXJlc3VsdCA6IHJlc3VsdDtcbn07XG5cbmV4cG9ydCBjb25zdCBjb21wYXJlQnlTb3J0aW5nUnVsZXMgPSAocnVsZXM6IFNvcnRpbmdSdWxlW10sIGE6IFRhYk1ldGFkYXRhLCBiOiBUYWJNZXRhZGF0YSk6IG51bWJlciA9PiB7XG4gICAgY29uc3Qgc29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KHJ1bGVzKTtcbiAgICBpZiAoc29ydFJ1bGVzTGlzdC5sZW5ndGggPT09IDApIHJldHVybiAwO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIHNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgIGlmICghcnVsZSkgY29udGludWU7XG4gICAgICAgICAgICBjb25zdCB2YWxBID0gZ2V0RmllbGRWYWx1ZShhLCBydWxlLmZpZWxkKTtcbiAgICAgICAgICAgIGNvbnN0IHZhbEIgPSBnZXRGaWVsZFZhbHVlKGIsIHJ1bGUuZmllbGQpO1xuXG4gICAgICAgICAgICBjb25zdCBkaWZmID0gY29tcGFyZVZhbHVlcyh2YWxBLCB2YWxCLCBydWxlLm9yZGVyIHx8ICdhc2MnKTtcbiAgICAgICAgICAgIGlmIChkaWZmICE9PSAwKSByZXR1cm4gZGlmZjtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgbG9nRGVidWcoXCJFcnJvciBldmFsdWF0aW5nIHNvcnRpbmcgcnVsZXNcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgIH1cbiAgICByZXR1cm4gMDtcbn07XG5cbnR5cGUgQ29tcGFyYXRvciA9IChhOiBUYWJNZXRhZGF0YSwgYjogVGFiTWV0YWRhdGEpID0+IG51bWJlcjtcblxuLy8gLS0tIEJ1aWx0LWluIENvbXBhcmF0b3JzIC0tLVxuXG5jb25zdCBjb21wYXJlUmVjZW5jeTogQ29tcGFyYXRvciA9IChhLCBiKSA9PiAoYi5sYXN0QWNjZXNzZWQgPz8gMCkgLSAoYS5sYXN0QWNjZXNzZWQgPz8gMCk7XG5jb25zdCBjb21wYXJlTmVzdGluZzogQ29tcGFyYXRvciA9IChhLCBiKSA9PiBoaWVyYXJjaHlTY29yZShhKSAtIGhpZXJhcmNoeVNjb3JlKGIpO1xuY29uc3QgY29tcGFyZVBpbm5lZDogQ29tcGFyYXRvciA9IChhLCBiKSA9PiBwaW5uZWRTY29yZShhKSAtIHBpbm5lZFNjb3JlKGIpO1xuY29uc3QgY29tcGFyZVRpdGxlOiBDb21wYXJhdG9yID0gKGEsIGIpID0+IGEudGl0bGUubG9jYWxlQ29tcGFyZShiLnRpdGxlKTtcbmNvbnN0IGNvbXBhcmVVcmw6IENvbXBhcmF0b3IgPSAoYSwgYikgPT4gYS51cmwubG9jYWxlQ29tcGFyZShiLnVybCk7XG5jb25zdCBjb21wYXJlQ29udGV4dDogQ29tcGFyYXRvciA9IChhLCBiKSA9PiAoYS5jb250ZXh0ID8/IFwiXCIpLmxvY2FsZUNvbXBhcmUoYi5jb250ZXh0ID8/IFwiXCIpO1xuY29uc3QgY29tcGFyZURvbWFpbjogQ29tcGFyYXRvciA9IChhLCBiKSA9PiBkb21haW5Gcm9tVXJsKGEudXJsKS5sb2NhbGVDb21wYXJlKGRvbWFpbkZyb21VcmwoYi51cmwpKTtcbmNvbnN0IGNvbXBhcmVUb3BpYzogQ29tcGFyYXRvciA9IChhLCBiKSA9PiBzZW1hbnRpY0J1Y2tldChhLnRpdGxlLCBhLnVybCkubG9jYWxlQ29tcGFyZShzZW1hbnRpY0J1Y2tldChiLnRpdGxlLCBiLnVybCkpO1xuY29uc3QgY29tcGFyZUxpbmVhZ2U6IENvbXBhcmF0b3IgPSAoYSwgYikgPT4gbmF2aWdhdGlvbktleShhKS5sb2NhbGVDb21wYXJlKG5hdmlnYXRpb25LZXkoYikpO1xuY29uc3QgY29tcGFyZUFnZTogQ29tcGFyYXRvciA9IChhLCBiKSA9PiAoZ3JvdXBpbmdLZXkoYSwgXCJhZ2VcIikgfHwgXCJcIikubG9jYWxlQ29tcGFyZShncm91cGluZ0tleShiLCBcImFnZVwiKSB8fCBcIlwiKTtcblxuY29uc3Qgc3RyYXRlZ3lSZWdpc3RyeTogUmVjb3JkPHN0cmluZywgQ29tcGFyYXRvcj4gPSB7XG4gIHJlY2VuY3k6IGNvbXBhcmVSZWNlbmN5LFxuICBuZXN0aW5nOiBjb21wYXJlTmVzdGluZyxcbiAgcGlubmVkOiBjb21wYXJlUGlubmVkLFxuICB0aXRsZTogY29tcGFyZVRpdGxlLFxuICB1cmw6IGNvbXBhcmVVcmwsXG4gIGNvbnRleHQ6IGNvbXBhcmVDb250ZXh0LFxuICBkb21haW46IGNvbXBhcmVEb21haW4sXG4gIGRvbWFpbl9mdWxsOiBjb21wYXJlRG9tYWluLFxuICB0b3BpYzogY29tcGFyZVRvcGljLFxuICBsaW5lYWdlOiBjb21wYXJlTGluZWFnZSxcbiAgYWdlOiBjb21wYXJlQWdlLFxufTtcblxuLy8gLS0tIEN1c3RvbSBTdHJhdGVneSBFdmFsdWF0aW9uIC0tLVxuXG5jb25zdCBldmFsdWF0ZUN1c3RvbVN0cmF0ZWd5ID0gKHN0cmF0ZWd5OiBzdHJpbmcsIGE6IFRhYk1ldGFkYXRhLCBiOiBUYWJNZXRhZGF0YSk6IG51bWJlciB8IG51bGwgPT4ge1xuICBjb25zdCBjdXN0b21TdHJhdHMgPSBnZXRDdXN0b21TdHJhdGVnaWVzKCk7XG4gIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0cy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3kpO1xuXG4gIGlmICghY3VzdG9tKSByZXR1cm4gbnVsbDtcblxuICBjb25zdCBzb3J0UnVsZXNMaXN0ID0gYXNBcnJheTxTb3J0aW5nUnVsZT4oY3VzdG9tLnNvcnRpbmdSdWxlcyk7XG4gIGlmIChzb3J0UnVsZXNMaXN0Lmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG5cbiAgcmV0dXJuIGNvbXBhcmVCeVNvcnRpbmdSdWxlcyhzb3J0UnVsZXNMaXN0LCBhLCBiKTtcbn07XG5cbi8vIC0tLSBHZW5lcmljIEZhbGxiYWNrIC0tLVxuXG5jb25zdCBldmFsdWF0ZUdlbmVyaWNTdHJhdGVneSA9IChzdHJhdGVneTogc3RyaW5nLCBhOiBUYWJNZXRhZGF0YSwgYjogVGFiTWV0YWRhdGEpOiBudW1iZXIgPT4ge1xuICAgIC8vIENoZWNrIGlmIGl0J3MgYSBnZW5lcmljIGZpZWxkIGZpcnN0XG4gICAgY29uc3QgdmFsQSA9IGdldEZpZWxkVmFsdWUoYSwgc3RyYXRlZ3kpO1xuICAgIGNvbnN0IHZhbEIgPSBnZXRGaWVsZFZhbHVlKGIsIHN0cmF0ZWd5KTtcblxuICAgIGlmICh2YWxBICE9PSB1bmRlZmluZWQgJiYgdmFsQiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGlmICh2YWxBIDwgdmFsQikgcmV0dXJuIC0xO1xuICAgICAgICBpZiAodmFsQSA+IHZhbEIpIHJldHVybiAxO1xuICAgICAgICByZXR1cm4gMDtcbiAgICB9XG5cbiAgICAvLyBGYWxsYmFjayBmb3IgY3VzdG9tIHN0cmF0ZWdpZXMgZ3JvdXBpbmcga2V5IChpZiB1c2luZyBjdXN0b20gc3RyYXRlZ3kgYXMgc29ydGluZyBidXQgbm8gc29ydGluZyBydWxlcyBkZWZpbmVkKVxuICAgIC8vIG9yIHVuaGFuZGxlZCBidWlsdC1pbnNcbiAgICByZXR1cm4gKGdyb3VwaW5nS2V5KGEsIHN0cmF0ZWd5KSB8fCBcIlwiKS5sb2NhbGVDb21wYXJlKGdyb3VwaW5nS2V5KGIsIHN0cmF0ZWd5KSB8fCBcIlwiKTtcbn07XG5cbi8vIC0tLSBNYWluIEV4cG9ydCAtLS1cblxuZXhwb3J0IGNvbnN0IGNvbXBhcmVCeSA9IChzdHJhdGVneTogU29ydGluZ1N0cmF0ZWd5IHwgc3RyaW5nLCBhOiBUYWJNZXRhZGF0YSwgYjogVGFiTWV0YWRhdGEpOiBudW1iZXIgPT4ge1xuICAvLyAxLiBDdXN0b20gU3RyYXRlZ3kgKHRha2VzIHByZWNlZGVuY2UgaWYgcnVsZXMgZXhpc3QpXG4gIGNvbnN0IGN1c3RvbURpZmYgPSBldmFsdWF0ZUN1c3RvbVN0cmF0ZWd5KHN0cmF0ZWd5LCBhLCBiKTtcbiAgaWYgKGN1c3RvbURpZmYgIT09IG51bGwpIHtcbiAgICAgIHJldHVybiBjdXN0b21EaWZmO1xuICB9XG5cbiAgLy8gMi4gQnVpbHQtaW4gcmVnaXN0cnlcbiAgY29uc3QgYnVpbHRJbiA9IHN0cmF0ZWd5UmVnaXN0cnlbc3RyYXRlZ3ldO1xuICBpZiAoYnVpbHRJbikge1xuICAgIHJldHVybiBidWlsdEluKGEsIGIpO1xuICB9XG5cbiAgLy8gMy4gR2VuZXJpYy9GYWxsYmFja1xuICByZXR1cm4gZXZhbHVhdGVHZW5lcmljU3RyYXRlZ3koc3RyYXRlZ3ksIGEsIGIpO1xufTtcblxuZXhwb3J0IGNvbnN0IHNvcnRUYWJzID0gKHRhYnM6IFRhYk1ldGFkYXRhW10sIHN0cmF0ZWdpZXM6IFNvcnRpbmdTdHJhdGVneVtdKTogVGFiTWV0YWRhdGFbXSA9PiB7XG4gIGNvbnN0IHNjb3Jpbmc6IFNvcnRpbmdTdHJhdGVneVtdID0gc3RyYXRlZ2llcy5sZW5ndGggPyBzdHJhdGVnaWVzIDogW1wicGlubmVkXCIsIFwicmVjZW5jeVwiXTtcbiAgcmV0dXJuIFsuLi50YWJzXS5zb3J0KChhLCBiKSA9PiB7XG4gICAgZm9yIChjb25zdCBzdHJhdGVneSBvZiBzY29yaW5nKSB7XG4gICAgICBjb25zdCBkaWZmID0gY29tcGFyZUJ5KHN0cmF0ZWd5LCBhLCBiKTtcbiAgICAgIGlmIChkaWZmICE9PSAwKSByZXR1cm4gZGlmZjtcbiAgICB9XG4gICAgcmV0dXJuIGEuaWQgLSBiLmlkO1xuICB9KTtcbn07XG4iLCAiaW1wb3J0IHsgVGFiR3JvdXAsIFRhYk1ldGFkYXRhLCBQcmVmZXJlbmNlcyB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IG1hcENocm9tZVRhYiwgZ2V0U3RvcmVkUHJlZmVyZW5jZXMgfSBmcm9tIFwiLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5pbXBvcnQgeyBzZXRDdXN0b21TdHJhdGVnaWVzIH0gZnJvbSBcIi4uL2JhY2tncm91bmQvZ3JvdXBpbmdTdHJhdGVnaWVzLmpzXCI7XG5pbXBvcnQgeyBzb3J0VGFicyB9IGZyb20gXCIuLi9iYWNrZ3JvdW5kL3NvcnRpbmdTdHJhdGVnaWVzLmpzXCI7XG5cbmNvbnN0IGRlZmF1bHRQcmVmZXJlbmNlczogUHJlZmVyZW5jZXMgPSB7XG4gIHNvcnRpbmc6IFtcInBpbm5lZFwiLCBcInJlY2VuY3lcIl0sXG4gIGRlYnVnOiBmYWxzZSxcbiAgdGhlbWU6IFwiZGFya1wiLFxuICBjdXN0b21HZW5lcmE6IHt9XG59O1xuXG5leHBvcnQgY29uc3QgZmV0Y2hMb2NhbFN0YXRlID0gYXN5bmMgKCkgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IFt0YWJzLCBncm91cHMsIHByZWZzXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgIGNocm9tZS50YWJzLnF1ZXJ5KHt9KSxcbiAgICAgIGNocm9tZS50YWJHcm91cHMucXVlcnkoe30pLFxuICAgICAgZ2V0U3RvcmVkUHJlZmVyZW5jZXMoKVxuICAgIF0pO1xuXG4gICAgY29uc3QgcHJlZmVyZW5jZXMgPSBwcmVmcyB8fCBkZWZhdWx0UHJlZmVyZW5jZXM7XG5cbiAgICAvLyBJbml0aWFsaXplIGN1c3RvbSBzdHJhdGVnaWVzIGZvciBzb3J0aW5nXG4gICAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhwcmVmZXJlbmNlcy5jdXN0b21TdHJhdGVnaWVzIHx8IFtdKTtcblxuICAgIGNvbnN0IGdyb3VwTWFwID0gbmV3IE1hcChncm91cHMubWFwKGcgPT4gW2cuaWQsIGddKSk7XG4gICAgY29uc3QgbWFwcGVkID0gdGFicy5tYXAobWFwQ2hyb21lVGFiKS5maWx0ZXIoKHQpOiB0IGlzIFRhYk1ldGFkYXRhID0+IEJvb2xlYW4odCkpO1xuXG4gICAgY29uc3QgcmVzdWx0R3JvdXBzOiBUYWJHcm91cFtdID0gW107XG4gICAgY29uc3QgdGFic0J5R3JvdXBJZCA9IG5ldyBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YVtdPigpO1xuICAgIGNvbnN0IHRhYnNCeVdpbmRvd1VuZ3JvdXBlZCA9IG5ldyBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YVtdPigpO1xuXG4gICAgbWFwcGVkLmZvckVhY2godGFiID0+IHtcbiAgICAgICAgY29uc3QgZ3JvdXBJZCA9IHRhYi5ncm91cElkID8/IC0xO1xuICAgICAgICBpZiAoZ3JvdXBJZCAhPT0gLTEpIHtcbiAgICAgICAgICAgIGlmICghdGFic0J5R3JvdXBJZC5oYXMoZ3JvdXBJZCkpIHRhYnNCeUdyb3VwSWQuc2V0KGdyb3VwSWQsIFtdKTtcbiAgICAgICAgICAgIHRhYnNCeUdyb3VwSWQuZ2V0KGdyb3VwSWQpIS5wdXNoKHRhYik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgaWYgKCF0YWJzQnlXaW5kb3dVbmdyb3VwZWQuaGFzKHRhYi53aW5kb3dJZCkpIHRhYnNCeVdpbmRvd1VuZ3JvdXBlZC5zZXQodGFiLndpbmRvd0lkLCBbXSk7XG4gICAgICAgICAgICAgdGFic0J5V2luZG93VW5ncm91cGVkLmdldCh0YWIud2luZG93SWQpIS5wdXNoKHRhYik7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBUYWJHcm91cCBvYmplY3RzIGZvciBhY3R1YWwgZ3JvdXBzXG4gICAgZm9yIChjb25zdCBbZ3JvdXBJZCwgZ3JvdXBUYWJzXSBvZiB0YWJzQnlHcm91cElkKSB7XG4gICAgICAgIGNvbnN0IGJyb3dzZXJHcm91cCA9IGdyb3VwTWFwLmdldChncm91cElkKTtcbiAgICAgICAgaWYgKGJyb3dzZXJHcm91cCkge1xuICAgICAgICAgICAgcmVzdWx0R3JvdXBzLnB1c2goe1xuICAgICAgICAgICAgICAgIGlkOiBgZ3JvdXAtJHtncm91cElkfWAsXG4gICAgICAgICAgICAgICAgd2luZG93SWQ6IGJyb3dzZXJHcm91cC53aW5kb3dJZCxcbiAgICAgICAgICAgICAgICBsYWJlbDogYnJvd3Nlckdyb3VwLnRpdGxlIHx8IFwiVW50aXRsZWQgR3JvdXBcIixcbiAgICAgICAgICAgICAgICBjb2xvcjogYnJvd3Nlckdyb3VwLmNvbG9yLFxuICAgICAgICAgICAgICAgIHRhYnM6IHNvcnRUYWJzKGdyb3VwVGFicywgcHJlZmVyZW5jZXMuc29ydGluZyksXG4gICAgICAgICAgICAgICAgcmVhc29uOiBcIk1hbnVhbFwiXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIEhhbmRsZSB1bmdyb3VwZWQgdGFic1xuICAgIGZvciAoY29uc3QgW3dpbmRvd0lkLCB0YWJzXSBvZiB0YWJzQnlXaW5kb3dVbmdyb3VwZWQpIHtcbiAgICAgICAgcmVzdWx0R3JvdXBzLnB1c2goe1xuICAgICAgICAgICAgaWQ6IGB1bmdyb3VwZWQtJHt3aW5kb3dJZH1gLFxuICAgICAgICAgICAgd2luZG93SWQ6IHdpbmRvd0lkLFxuICAgICAgICAgICAgbGFiZWw6IFwiVW5ncm91cGVkXCIsXG4gICAgICAgICAgICBjb2xvcjogXCJncmV5XCIsXG4gICAgICAgICAgICB0YWJzOiBzb3J0VGFicyh0YWJzLCBwcmVmZXJlbmNlcy5zb3J0aW5nKSxcbiAgICAgICAgICAgIHJlYXNvbjogXCJVbmdyb3VwZWRcIlxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zb2xlLndhcm4oXCJGZXRjaGVkIGxvY2FsIHN0YXRlIChmYWxsYmFjaylcIik7XG4gICAgcmV0dXJuIHsgb2s6IHRydWUsIGRhdGE6IHsgZ3JvdXBzOiByZXN1bHRHcm91cHMsIHByZWZlcmVuY2VzIH0gfTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGNvbnNvbGUuZXJyb3IoXCJMb2NhbCBzdGF0ZSBmZXRjaCBmYWlsZWQ6XCIsIGUpO1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFN0cmluZyhlKSB9O1xuICB9XG59O1xuIiwgImltcG9ydCB7XG4gIEFwcGx5R3JvdXBpbmdQYXlsb2FkLFxuICBHcm91cGluZ1NlbGVjdGlvbixcbiAgUHJlZmVyZW5jZXMsXG4gIFJ1bnRpbWVNZXNzYWdlLFxuICBSdW50aW1lUmVzcG9uc2UsXG4gIFNhdmVkU3RhdGUsXG4gIFNvcnRpbmdTdHJhdGVneSxcbiAgVGFiR3JvdXAsXG4gIFRhYk1ldGFkYXRhXG59IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGZldGNoTG9jYWxTdGF0ZSB9IGZyb20gXCIuL2xvY2FsU3RhdGUuanNcIjtcbmltcG9ydCB7IGdldEhvc3RuYW1lIH0gZnJvbSBcIi4uL3NoYXJlZC91cmxDYWNoZS5qc1wiO1xuXG5leHBvcnQgY29uc3Qgc2VuZE1lc3NhZ2UgPSBhc3luYyA8VERhdGE+KHR5cGU6IFJ1bnRpbWVNZXNzYWdlW1widHlwZVwiXSwgcGF5bG9hZD86IGFueSk6IFByb21pc2U8UnVudGltZVJlc3BvbnNlPFREYXRhPj4gPT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGUsIHBheWxvYWQgfSwgKHJlc3BvbnNlKSA9PiB7XG4gICAgICBpZiAoY2hyb21lLnJ1bnRpbWUubGFzdEVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJSdW50aW1lIGVycm9yOlwiLCBjaHJvbWUucnVudGltZS5sYXN0RXJyb3IpO1xuICAgICAgICByZXNvbHZlKHsgb2s6IGZhbHNlLCBlcnJvcjogY2hyb21lLnJ1bnRpbWUubGFzdEVycm9yLm1lc3NhZ2UgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXNvbHZlKHJlc3BvbnNlIHx8IHsgb2s6IGZhbHNlLCBlcnJvcjogXCJObyByZXNwb25zZSBmcm9tIGJhY2tncm91bmRcIiB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSk7XG59O1xuXG5leHBvcnQgdHlwZSBUYWJXaXRoR3JvdXAgPSBUYWJNZXRhZGF0YSAmIHtcbiAgZ3JvdXBMYWJlbD86IHN0cmluZztcbiAgZ3JvdXBDb2xvcj86IHN0cmluZztcbiAgcmVhc29uPzogc3RyaW5nO1xufTtcblxuZXhwb3J0IGludGVyZmFjZSBXaW5kb3dWaWV3IHtcbiAgaWQ6IG51bWJlcjtcbiAgdGl0bGU6IHN0cmluZztcbiAgdGFiczogVGFiV2l0aEdyb3VwW107XG4gIHRhYkNvdW50OiBudW1iZXI7XG4gIGdyb3VwQ291bnQ6IG51bWJlcjtcbiAgcGlubmVkQ291bnQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IElDT05TID0ge1xuICBhY3RpdmU6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cG9seWdvbiBwb2ludHM9XCIzIDExIDIyIDIgMTMgMjEgMTEgMTMgMyAxMVwiPjwvcG9seWdvbj48L3N2Zz5gLFxuICBoaWRlOiBgPHN2ZyB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBhdGggZD1cIk0xNy45NCAxNy45NEExMC4wNyAxMC4wNyAwIDAgMSAxMiAyMGMtNyAwLTExLTgtMTEtOGExOC40NSAxOC40NSAwIDAgMSA1LjA2LTUuOTRNOS45IDQuMjRBOS4xMiA5LjEyIDAgMCAxIDEyIDRjNyAwIDExIDggMTEgOGExOC41IDE4LjUgMCAwIDEtMi4xNiAzLjE5bS02LjcyLTEuMDdhMyAzIDAgMSAxLTQuMjQtNC4yNFwiPjwvcGF0aD48bGluZSB4MT1cIjFcIiB5MT1cIjFcIiB4Mj1cIjIzXCIgeTI9XCIyM1wiPjwvbGluZT48L3N2Zz5gLFxuICBzaG93OiBgPHN2ZyB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBhdGggZD1cIk0xIDEyczQtOCAxMS04IDExIDggMTEgOC00IDgtMTEgOC0xMS04LTExLTgtMTEtOHpcIj48L3BhdGg+PGNpcmNsZSBjeD1cIjEyXCIgY3k9XCIxMlwiIHI9XCIzXCI+PC9jaXJjbGU+PC9zdmc+YCxcbiAgZm9jdXM6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjEwXCI+PC9jaXJjbGU+PGNpcmNsZSBjeD1cIjEyXCIgY3k9XCIxMlwiIHI9XCI2XCI+PC9jaXJjbGU+PGNpcmNsZSBjeD1cIjEyXCIgY3k9XCIxMlwiIHI9XCIyXCI+PC9jaXJjbGU+PC9zdmc+YCxcbiAgY2xvc2U6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48bGluZSB4MT1cIjE4XCIgeTE9XCI2XCIgeDI9XCI2XCIgeTI9XCIxOFwiPjwvbGluZT48bGluZSB4MT1cIjZcIiB5MT1cIjZcIiB4Mj1cIjE4XCIgeTI9XCIxOFwiPjwvbGluZT48L3N2Zz5gLFxuICB1bmdyb3VwOiBgPHN2ZyB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PGNpcmNsZSBjeD1cIjEyXCIgY3k9XCIxMlwiIHI9XCIxMFwiPjwvY2lyY2xlPjxsaW5lIHgxPVwiOFwiIHkxPVwiMTJcIiB4Mj1cIjE2XCIgeTI9XCIxMlwiPjwvbGluZT48L3N2Zz5gLFxuICBkZWZhdWx0RmlsZTogYDxzdmcgd2lkdGg9XCIyNFwiIGhlaWdodD1cIjI0XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwYXRoIGQ9XCJNMTQgMkg2YTIgMiAwIDAgMC0yIDJ2MTZhMiAyIDAgMCAwIDIgMmgxMmEyIDIgMCAwIDAgMi0yVjh6XCI+PC9wYXRoPjxwb2x5bGluZSBwb2ludHM9XCIxNCAyIDE0IDggMjAgOFwiPjwvcG9seWxpbmU+PGxpbmUgeDE9XCIxNlwiIHkxPVwiMTNcIiB4Mj1cIjhcIiB5Mj1cIjEzXCI+PC9saW5lPjxsaW5lIHgxPVwiMTZcIiB5MT1cIjE3XCIgeDI9XCI4XCIgeTI9XCIxN1wiPjwvbGluZT48cG9seWxpbmUgcG9pbnRzPVwiMTAgOSA5IDkgOCA5XCI+PC9wb2x5bGluZT48L3N2Zz5gLFxuICBhdXRvUnVuOiBgPHN2ZyB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBvbHlnb24gcG9pbnRzPVwiMTMgMiAzIDE0IDEyIDE0IDExIDIyIDIxIDEwIDEyIDEwIDEzIDJcIj48L3BvbHlnb24+PC9zdmc+YFxufTtcblxuZXhwb3J0IGNvbnN0IEdST1VQX0NPTE9SUzogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgZ3JleTogXCIjNjQ3NDhiXCIsXG4gIGJsdWU6IFwiIzNiODJmNlwiLFxuICByZWQ6IFwiI2VmNDQ0NFwiLFxuICB5ZWxsb3c6IFwiI2VhYjMwOFwiLFxuICBncmVlbjogXCIjMjJjNTVlXCIsXG4gIHBpbms6IFwiI2VjNDg5OVwiLFxuICBwdXJwbGU6IFwiI2E4NTVmN1wiLFxuICBjeWFuOiBcIiMwNmI2ZDRcIixcbiAgb3JhbmdlOiBcIiNmOTczMTZcIlxufTtcblxuZXhwb3J0IGNvbnN0IGdldEdyb3VwQ29sb3IgPSAobmFtZTogc3RyaW5nKSA9PiBHUk9VUF9DT0xPUlNbbmFtZV0gfHwgXCIjY2JkNWUxXCI7XG5cbmV4cG9ydCBjb25zdCBmZXRjaFN0YXRlID0gYXN5bmMgKCkgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgc2VuZE1lc3NhZ2U8eyBncm91cHM6IFRhYkdyb3VwW107IHByZWZlcmVuY2VzOiBQcmVmZXJlbmNlcyB9PihcImdldFN0YXRlXCIpO1xuICAgIGlmIChyZXNwb25zZS5vayAmJiByZXNwb25zZS5kYXRhKSB7XG4gICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgfVxuICAgIGNvbnNvbGUud2FybihcImZldGNoU3RhdGUgZmFpbGVkLCB1c2luZyBmYWxsYmFjazpcIiwgcmVzcG9uc2UuZXJyb3IpO1xuICAgIHJldHVybiBhd2FpdCBmZXRjaExvY2FsU3RhdGUoKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGNvbnNvbGUud2FybihcImZldGNoU3RhdGUgdGhyZXcgZXhjZXB0aW9uLCB1c2luZyBmYWxsYmFjazpcIiwgZSk7XG4gICAgcmV0dXJuIGF3YWl0IGZldGNoTG9jYWxTdGF0ZSgpO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgYXBwbHlHcm91cGluZyA9IGFzeW5jIChwYXlsb2FkOiBBcHBseUdyb3VwaW5nUGF5bG9hZCkgPT4ge1xuICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogXCJhcHBseUdyb3VwaW5nXCIsIHBheWxvYWQgfSk7XG4gIHJldHVybiByZXNwb25zZSBhcyBSdW50aW1lUmVzcG9uc2U8dW5rbm93bj47XG59O1xuXG5leHBvcnQgY29uc3QgYXBwbHlTb3J0aW5nID0gYXN5bmMgKHBheWxvYWQ6IEFwcGx5R3JvdXBpbmdQYXlsb2FkKSA9PiB7XG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImFwcGx5U29ydGluZ1wiLCBwYXlsb2FkIH0pO1xuICByZXR1cm4gcmVzcG9uc2UgYXMgUnVudGltZVJlc3BvbnNlPHVua25vd24+O1xufTtcblxuZXhwb3J0IGNvbnN0IG1hcFdpbmRvd3MgPSAoZ3JvdXBzOiBUYWJHcm91cFtdLCB3aW5kb3dUaXRsZXM6IE1hcDxudW1iZXIsIHN0cmluZz4pOiBXaW5kb3dWaWV3W10gPT4ge1xuICBjb25zdCB3aW5kb3dzID0gbmV3IE1hcDxudW1iZXIsIFRhYldpdGhHcm91cFtdPigpO1xuXG4gIGdyb3Vwcy5mb3JFYWNoKChncm91cCkgPT4ge1xuICAgIGNvbnN0IGlzVW5ncm91cGVkID0gZ3JvdXAucmVhc29uID09PSBcIlVuZ3JvdXBlZFwiO1xuICAgIGdyb3VwLnRhYnMuZm9yRWFjaCgodGFiKSA9PiB7XG4gICAgICBjb25zdCBkZWNvcmF0ZWQ6IFRhYldpdGhHcm91cCA9IHtcbiAgICAgICAgLi4udGFiLFxuICAgICAgICBncm91cExhYmVsOiBpc1VuZ3JvdXBlZCA/IHVuZGVmaW5lZCA6IGdyb3VwLmxhYmVsLFxuICAgICAgICBncm91cENvbG9yOiBpc1VuZ3JvdXBlZCA/IHVuZGVmaW5lZCA6IGdyb3VwLmNvbG9yLFxuICAgICAgICByZWFzb246IGdyb3VwLnJlYXNvblxuICAgICAgfTtcbiAgICAgIGNvbnN0IGV4aXN0aW5nID0gd2luZG93cy5nZXQodGFiLndpbmRvd0lkKSA/PyBbXTtcbiAgICAgIGV4aXN0aW5nLnB1c2goZGVjb3JhdGVkKTtcbiAgICAgIHdpbmRvd3Muc2V0KHRhYi53aW5kb3dJZCwgZXhpc3RpbmcpO1xuICAgIH0pO1xuICB9KTtcblxuICByZXR1cm4gQXJyYXkuZnJvbSh3aW5kb3dzLmVudHJpZXMoKSlcbiAgICAubWFwPFdpbmRvd1ZpZXc+KChbaWQsIHRhYnNdKSA9PiB7XG4gICAgICBjb25zdCBncm91cENvdW50ID0gbmV3IFNldCh0YWJzLm1hcCgodGFiKSA9PiB0YWIuZ3JvdXBMYWJlbCkuZmlsdGVyKChsKTogbCBpcyBzdHJpbmcgPT4gISFsKSkuc2l6ZTtcbiAgICAgIGNvbnN0IHBpbm5lZENvdW50ID0gdGFicy5maWx0ZXIoKHRhYikgPT4gdGFiLnBpbm5lZCkubGVuZ3RoO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgaWQsXG4gICAgICAgIHRpdGxlOiB3aW5kb3dUaXRsZXMuZ2V0KGlkKSA/PyBgV2luZG93ICR7aWR9YCxcbiAgICAgICAgdGFicyxcbiAgICAgICAgdGFiQ291bnQ6IHRhYnMubGVuZ3RoLFxuICAgICAgICBncm91cENvdW50LFxuICAgICAgICBwaW5uZWRDb3VudFxuICAgICAgfTtcbiAgICB9KVxuICAgIC5zb3J0KChhLCBiKSA9PiBhLmlkIC0gYi5pZCk7XG59O1xuXG5leHBvcnQgY29uc3QgZm9ybWF0RG9tYWluID0gKHVybDogc3RyaW5nKSA9PiB7XG4gIGNvbnN0IGhvc3RuYW1lID0gZ2V0SG9zdG5hbWUodXJsKTtcbiAgaWYgKGhvc3RuYW1lKSB7XG4gICAgcmV0dXJuIGhvc3RuYW1lLnJlcGxhY2UoL153d3dcXC4vLCBcIlwiKTtcbiAgfVxuICByZXR1cm4gdXJsO1xufTtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldERyYWdBZnRlckVsZW1lbnQoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgeTogbnVtYmVyLCBzZWxlY3Rvcjogc3RyaW5nKSB7XG4gIGNvbnN0IGRyYWdnYWJsZUVsZW1lbnRzID0gQXJyYXkuZnJvbShjb250YWluZXIucXVlcnlTZWxlY3RvckFsbChzZWxlY3RvcikpO1xuXG4gIHJldHVybiBkcmFnZ2FibGVFbGVtZW50cy5yZWR1Y2UoKGNsb3Nlc3QsIGNoaWxkKSA9PiB7XG4gICAgY29uc3QgYm94ID0gY2hpbGQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgY29uc3Qgb2Zmc2V0ID0geSAtIGJveC50b3AgLSBib3guaGVpZ2h0IC8gMjtcbiAgICBpZiAob2Zmc2V0IDwgMCAmJiBvZmZzZXQgPiBjbG9zZXN0Lm9mZnNldCkge1xuICAgICAgcmV0dXJuIHsgb2Zmc2V0OiBvZmZzZXQsIGVsZW1lbnQ6IGNoaWxkIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBjbG9zZXN0O1xuICAgIH1cbiAgfSwgeyBvZmZzZXQ6IE51bWJlci5ORUdBVElWRV9JTkZJTklUWSwgZWxlbWVudDogbnVsbCBhcyBFbGVtZW50IHwgbnVsbCB9KS5lbGVtZW50O1xufVxuIiwgImltcG9ydCB7XG4gIEdyb3VwaW5nU2VsZWN0aW9uLFxuICBQcmVmZXJlbmNlcyxcbiAgU2F2ZWRTdGF0ZSxcbiAgU29ydGluZ1N0cmF0ZWd5LFxuICBMb2dMZXZlbCxcbiAgVGFiR3JvdXBcbn0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHtcbiAgYXBwbHlHcm91cGluZyxcbiAgYXBwbHlTb3J0aW5nLFxuICBmZXRjaFN0YXRlLFxuICBJQ09OUyxcbiAgbWFwV2luZG93cyxcbiAgc2VuZE1lc3NhZ2UsXG4gIFRhYldpdGhHcm91cCxcbiAgV2luZG93VmlldyxcbiAgR1JPVVBfQ09MT1JTLFxuICBnZXREcmFnQWZ0ZXJFbGVtZW50XG59IGZyb20gXCIuL2NvbW1vbi5qc1wiO1xuaW1wb3J0IHsgZ2V0U3RyYXRlZ2llcywgU1RSQVRFR0lFUywgU3RyYXRlZ3lEZWZpbml0aW9uIH0gZnJvbSBcIi4uL3NoYXJlZC9zdHJhdGVneVJlZ2lzdHJ5LmpzXCI7XG5pbXBvcnQgeyBzZXRMb2dnZXJQcmVmZXJlbmNlcywgbG9nRGVidWcsIGxvZ0luZm8gfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgZmV0Y2hMb2NhbFN0YXRlIH0gZnJvbSBcIi4vbG9jYWxTdGF0ZS5qc1wiO1xuXG4vLyBFbGVtZW50c1xuY29uc3Qgc2VhcmNoSW5wdXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInRhYlNlYXJjaFwiKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuY29uc3Qgd2luZG93c0NvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwid2luZG93c1wiKSBhcyBIVE1MRGl2RWxlbWVudDtcblxuY29uc3Qgc2VsZWN0QWxsQ2hlY2tib3ggPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNlbGVjdEFsbFwiKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuY29uc3QgYnRuQXBwbHkgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0bkFwcGx5XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50O1xuY29uc3QgYnRuVW5ncm91cCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuVW5ncm91cFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcbmNvbnN0IGJ0bk1lcmdlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5NZXJnZVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcbmNvbnN0IGJ0blNwbGl0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5TcGxpdFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcbmNvbnN0IGJ0bkV4cGFuZEFsbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuRXhwYW5kQWxsXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50O1xuY29uc3QgYnRuQ29sbGFwc2VBbGwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0bkNvbGxhcHNlQWxsXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50O1xuXG5jb25zdCBhY3RpdmVTdHJhdGVnaWVzTGlzdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYWN0aXZlU3RyYXRlZ2llc0xpc3RcIikgYXMgSFRNTERpdkVsZW1lbnQ7XG5jb25zdCBhZGRTdHJhdGVneVNlbGVjdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYWRkU3RyYXRlZ3lTZWxlY3RcIikgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG5cbi8vIFN0YXRzXG5jb25zdCBzdGF0VGFicyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3RhdFRhYnNcIikgYXMgSFRNTEVsZW1lbnQ7XG5jb25zdCBzdGF0R3JvdXBzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzdGF0R3JvdXBzXCIpIGFzIEhUTUxFbGVtZW50O1xuY29uc3Qgc3RhdFdpbmRvd3MgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInN0YXRXaW5kb3dzXCIpIGFzIEhUTUxFbGVtZW50O1xuXG5jb25zdCBwcm9ncmVzc092ZXJsYXkgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInByb2dyZXNzT3ZlcmxheVwiKSBhcyBIVE1MRGl2RWxlbWVudDtcbmNvbnN0IHByb2dyZXNzVGV4dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicHJvZ3Jlc3NUZXh0XCIpIGFzIEhUTUxEaXZFbGVtZW50O1xuY29uc3QgcHJvZ3Jlc3NDb3VudCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicHJvZ3Jlc3NDb3VudFwiKSBhcyBIVE1MRGl2RWxlbWVudDtcblxuY29uc3Qgc2hvd0xvYWRpbmcgPSAodGV4dDogc3RyaW5nKSA9PiB7XG4gICAgaWYgKHByb2dyZXNzT3ZlcmxheSkge1xuICAgICAgICBwcm9ncmVzc1RleHQudGV4dENvbnRlbnQgPSB0ZXh0O1xuICAgICAgICBwcm9ncmVzc0NvdW50LnRleHRDb250ZW50ID0gXCJcIjtcbiAgICAgICAgcHJvZ3Jlc3NPdmVybGF5LmNsYXNzTGlzdC5yZW1vdmUoXCJoaWRkZW5cIik7XG4gICAgfVxufTtcblxuY29uc3QgaGlkZUxvYWRpbmcgPSAoKSA9PiB7XG4gICAgaWYgKHByb2dyZXNzT3ZlcmxheSkge1xuICAgICAgICBwcm9ncmVzc092ZXJsYXkuY2xhc3NMaXN0LmFkZChcImhpZGRlblwiKTtcbiAgICB9XG59O1xuXG5jb25zdCB1cGRhdGVQcm9ncmVzcyA9IChjb21wbGV0ZWQ6IG51bWJlciwgdG90YWw6IG51bWJlcikgPT4ge1xuICAgIGlmIChwcm9ncmVzc092ZXJsYXkgJiYgIXByb2dyZXNzT3ZlcmxheS5jbGFzc0xpc3QuY29udGFpbnMoXCJoaWRkZW5cIikpIHtcbiAgICAgICAgcHJvZ3Jlc3NDb3VudC50ZXh0Q29udGVudCA9IGAke2NvbXBsZXRlZH0gLyAke3RvdGFsfWA7XG4gICAgfVxufTtcblxubGV0IHdpbmRvd1N0YXRlOiBXaW5kb3dWaWV3W10gPSBbXTtcbmxldCBmb2N1c2VkV2luZG93SWQ6IG51bWJlciB8IG51bGwgPSBudWxsO1xuY29uc3Qgc2VsZWN0ZWRUYWJzID0gbmV3IFNldDxudW1iZXI+KCk7XG5sZXQgaW5pdGlhbFNlbGVjdGlvbkRvbmUgPSBmYWxzZTtcbmxldCBwcmVmZXJlbmNlczogUHJlZmVyZW5jZXMgfCBudWxsID0gbnVsbDtcbmxldCBsb2NhbFByZWZlcmVuY2VzTW9kaWZpZWRUaW1lID0gMDtcblxuLy8gVHJlZSBTdGF0ZVxuY29uc3QgZXhwYW5kZWROb2RlcyA9IG5ldyBTZXQ8c3RyaW5nPigpOyAvLyBEZWZhdWx0IGVtcHR5ID0gYWxsIGNvbGxhcHNlZFxuY29uc3QgVFJFRV9JQ09OUyA9IHtcbiAgY2hldnJvblJpZ2h0OiBgPHN2ZyB3aWR0aD1cIjEwMCVcIiBoZWlnaHQ9XCIxMDAlXCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwb2x5bGluZSBwb2ludHM9XCI5IDE4IDE1IDEyIDkgNlwiPjwvcG9seWxpbmU+PC9zdmc+YCxcbiAgZm9sZGVyOiBgPHN2ZyB3aWR0aD1cIjEwMCVcIiBoZWlnaHQ9XCIxMDAlXCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwYXRoIGQ9XCJNMjIgMTlhMiAyIDAgMCAxLTIgMkg0YTIgMiAwIDAgMS0yLTJWNWEyIDIgMCAwIDEgMi0yaDVsMiAzaDlhMiAyIDAgMCAxIDIgMnpcIj48L3BhdGg+PC9zdmc+YFxufTtcblxuY29uc3QgaGV4VG9SZ2JhID0gKGhleDogc3RyaW5nLCBhbHBoYTogbnVtYmVyKSA9PiB7XG4gICAgLy8gRW5zdXJlIGhleCBmb3JtYXRcbiAgICBpZiAoIWhleC5zdGFydHNXaXRoKCcjJykpIHJldHVybiBoZXg7XG4gICAgY29uc3QgciA9IHBhcnNlSW50KGhleC5zbGljZSgxLCAzKSwgMTYpO1xuICAgIGNvbnN0IGcgPSBwYXJzZUludChoZXguc2xpY2UoMywgNSksIDE2KTtcbiAgICBjb25zdCBiID0gcGFyc2VJbnQoaGV4LnNsaWNlKDUsIDcpLCAxNik7XG4gICAgcmV0dXJuIGByZ2JhKCR7cn0sICR7Z30sICR7Yn0sICR7YWxwaGF9KWA7XG59O1xuXG5jb25zdCB1cGRhdGVTdGF0cyA9ICgpID0+IHtcbiAgY29uc3QgdG90YWxUYWJzID0gd2luZG93U3RhdGUucmVkdWNlKChhY2MsIHdpbikgPT4gYWNjICsgd2luLnRhYkNvdW50LCAwKTtcbiAgY29uc3QgdG90YWxHcm91cHMgPSBuZXcgU2V0KHdpbmRvd1N0YXRlLmZsYXRNYXAodyA9PiB3LnRhYnMuZmlsdGVyKHQgPT4gdC5ncm91cExhYmVsKS5tYXAodCA9PiBgJHt3LmlkfS0ke3QuZ3JvdXBMYWJlbH1gKSkpLnNpemU7XG5cbiAgc3RhdFRhYnMudGV4dENvbnRlbnQgPSBgJHt0b3RhbFRhYnN9IFRhYnNgO1xuICBzdGF0R3JvdXBzLnRleHRDb250ZW50ID0gYCR7dG90YWxHcm91cHN9IEdyb3Vwc2A7XG4gIHN0YXRXaW5kb3dzLnRleHRDb250ZW50ID0gYCR7d2luZG93U3RhdGUubGVuZ3RofSBXaW5kb3dzYDtcblxuICAvLyBVcGRhdGUgc2VsZWN0aW9uIGJ1dHRvbnNcbiAgY29uc3QgaGFzU2VsZWN0aW9uID0gc2VsZWN0ZWRUYWJzLnNpemUgPiAwO1xuICBidG5Vbmdyb3VwLmRpc2FibGVkID0gIWhhc1NlbGVjdGlvbjtcbiAgYnRuTWVyZ2UuZGlzYWJsZWQgPSAhaGFzU2VsZWN0aW9uO1xuICBidG5TcGxpdC5kaXNhYmxlZCA9ICFoYXNTZWxlY3Rpb247XG5cbiAgYnRuVW5ncm91cC5zdHlsZS5vcGFjaXR5ID0gaGFzU2VsZWN0aW9uID8gXCIxXCIgOiBcIjAuNVwiO1xuICBidG5NZXJnZS5zdHlsZS5vcGFjaXR5ID0gaGFzU2VsZWN0aW9uID8gXCIxXCIgOiBcIjAuNVwiO1xuICBidG5TcGxpdC5zdHlsZS5vcGFjaXR5ID0gaGFzU2VsZWN0aW9uID8gXCIxXCIgOiBcIjAuNVwiO1xuXG4gIC8vIFVwZGF0ZSBTZWxlY3QgQWxsIENoZWNrYm94IFN0YXRlXG4gIGlmICh0b3RhbFRhYnMgPT09IDApIHtcbiAgICBzZWxlY3RBbGxDaGVja2JveC5jaGVja2VkID0gZmFsc2U7XG4gICAgc2VsZWN0QWxsQ2hlY2tib3guaW5kZXRlcm1pbmF0ZSA9IGZhbHNlO1xuICB9IGVsc2UgaWYgKHNlbGVjdGVkVGFicy5zaXplID09PSB0b3RhbFRhYnMpIHtcbiAgICBzZWxlY3RBbGxDaGVja2JveC5jaGVja2VkID0gdHJ1ZTtcbiAgICBzZWxlY3RBbGxDaGVja2JveC5pbmRldGVybWluYXRlID0gZmFsc2U7XG4gIH0gZWxzZSBpZiAoc2VsZWN0ZWRUYWJzLnNpemUgPiAwKSB7XG4gICAgc2VsZWN0QWxsQ2hlY2tib3guY2hlY2tlZCA9IGZhbHNlO1xuICAgIHNlbGVjdEFsbENoZWNrYm94LmluZGV0ZXJtaW5hdGUgPSB0cnVlO1xuICB9IGVsc2Uge1xuICAgIHNlbGVjdEFsbENoZWNrYm94LmNoZWNrZWQgPSBmYWxzZTtcbiAgICBzZWxlY3RBbGxDaGVja2JveC5pbmRldGVybWluYXRlID0gZmFsc2U7XG4gIH1cbn07XG5cbmNvbnN0IGNyZWF0ZU5vZGUgPSAoXG4gICAgY29udGVudDogSFRNTEVsZW1lbnQsXG4gICAgY2hpbGRyZW5Db250YWluZXI6IEhUTUxFbGVtZW50IHwgbnVsbCxcbiAgICBsZXZlbDogJ3dpbmRvdycgfCAnZ3JvdXAnIHwgJ3RhYicsXG4gICAgaXNFeHBhbmRlZDogYm9vbGVhbiA9IGZhbHNlLFxuICAgIG9uVG9nZ2xlPzogKCkgPT4gdm9pZFxuKSA9PiB7XG4gICAgY29uc3Qgbm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgbm9kZS5jbGFzc05hbWUgPSBgdHJlZS1ub2RlIG5vZGUtJHtsZXZlbH1gO1xuXG4gICAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICByb3cuY2xhc3NOYW1lID0gYHRyZWUtcm93ICR7bGV2ZWx9LXJvd2A7XG5cbiAgICAvLyBUb2dnbGVcbiAgICBjb25zdCB0b2dnbGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIHRvZ2dsZS5jbGFzc05hbWUgPSBgdHJlZS10b2dnbGUgJHtpc0V4cGFuZGVkID8gJ3JvdGF0ZWQnIDogJyd9YDtcbiAgICBpZiAoY2hpbGRyZW5Db250YWluZXIpIHtcbiAgICAgICAgdG9nZ2xlLmlubmVySFRNTCA9IFRSRUVfSUNPTlMuY2hldnJvblJpZ2h0O1xuICAgICAgICB0b2dnbGUub25jbGljayA9IChlKSA9PiB7XG4gICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgaWYgKG9uVG9nZ2xlKSBvblRvZ2dsZSgpO1xuICAgICAgICB9O1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRvZ2dsZS5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcbiAgICB9XG5cbiAgICByb3cuYXBwZW5kQ2hpbGQodG9nZ2xlKTtcbiAgICByb3cuYXBwZW5kQ2hpbGQoY29udGVudCk7IC8vIENvbnRlbnQgaGFuZGxlcyBjaGVja2JveCArIGljb24gKyB0ZXh0ICsgYWN0aW9uc1xuXG4gICAgbm9kZS5hcHBlbmRDaGlsZChyb3cpO1xuXG4gICAgaWYgKGNoaWxkcmVuQ29udGFpbmVyKSB7XG4gICAgICAgIGNoaWxkcmVuQ29udGFpbmVyLmNsYXNzTmFtZSA9IGB0cmVlLWNoaWxkcmVuICR7aXNFeHBhbmRlZCA/ICdleHBhbmRlZCcgOiAnJ31gO1xuICAgICAgICBub2RlLmFwcGVuZENoaWxkKGNoaWxkcmVuQ29udGFpbmVyKTtcbiAgICB9XG5cbiAgICAvLyBUb2dnbGUgaW50ZXJhY3Rpb24gb24gcm93IGNsaWNrIGZvciBXaW5kb3dzIGFuZCBHcm91cHNcbiAgICBpZiAoY2hpbGRyZW5Db250YWluZXIgJiYgbGV2ZWwgIT09ICd0YWInKSB7XG4gICAgICAgIHJvdy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgICAgICAgICAvLyBBdm9pZCB0b2dnbGluZyBpZiBjbGlja2luZyBhY3Rpb25zIG9yIGNoZWNrYm94XG4gICAgICAgICAgICBpZiAoKGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5jbG9zZXN0KCcuYWN0aW9uLWJ0bicpIHx8IChlLnRhcmdldCBhcyBIVE1MRWxlbWVudCkuY2xvc2VzdCgnLnRyZWUtY2hlY2tib3gnKSkgcmV0dXJuO1xuICAgICAgICAgICAgaWYgKG9uVG9nZ2xlKSBvblRvZ2dsZSgpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4geyBub2RlLCB0b2dnbGUsIGNoaWxkcmVuQ29udGFpbmVyIH07XG59O1xuXG5jb25zdCByZW5kZXJUYWJOb2RlID0gKHRhYjogVGFiV2l0aEdyb3VwKSA9PiB7XG4gICAgY29uc3QgdGFiQ29udGVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgdGFiQ29udGVudC5zdHlsZS5kaXNwbGF5ID0gXCJmbGV4XCI7XG4gICAgdGFiQ29udGVudC5zdHlsZS5hbGlnbkl0ZW1zID0gXCJjZW50ZXJcIjtcbiAgICB0YWJDb250ZW50LnN0eWxlLmZsZXggPSBcIjFcIjtcbiAgICB0YWJDb250ZW50LnN0eWxlLm92ZXJmbG93ID0gXCJoaWRkZW5cIjtcblxuICAgIC8vIFRhYiBDaGVja2JveFxuICAgIGNvbnN0IHRhYkNoZWNrYm94ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImlucHV0XCIpO1xuICAgIHRhYkNoZWNrYm94LnR5cGUgPSBcImNoZWNrYm94XCI7XG4gICAgdGFiQ2hlY2tib3guY2xhc3NOYW1lID0gXCJ0cmVlLWNoZWNrYm94XCI7XG4gICAgdGFiQ2hlY2tib3guY2hlY2tlZCA9IHNlbGVjdGVkVGFicy5oYXModGFiLmlkKTtcbiAgICB0YWJDaGVja2JveC5vbmNsaWNrID0gKGUpID0+IHtcbiAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgaWYgKHRhYkNoZWNrYm94LmNoZWNrZWQpIHNlbGVjdGVkVGFicy5hZGQodGFiLmlkKTtcbiAgICAgICAgZWxzZSBzZWxlY3RlZFRhYnMuZGVsZXRlKHRhYi5pZCk7XG4gICAgICAgIHJlbmRlclRyZWUoKTtcbiAgICB9O1xuXG4gICAgY29uc3QgdGFiSWNvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgdGFiSWNvbi5jbGFzc05hbWUgPSBcInRyZWUtaWNvblwiO1xuICAgIGlmICh0YWIuZmF2SWNvblVybCkge1xuICAgICAgICBjb25zdCBpbWcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW1nXCIpO1xuICAgICAgICBpbWcuc3JjID0gdGFiLmZhdkljb25Vcmw7XG4gICAgICAgIGltZy5vbmVycm9yID0gKCkgPT4geyB0YWJJY29uLmlubmVySFRNTCA9IElDT05TLmRlZmF1bHRGaWxlOyB9O1xuICAgICAgICB0YWJJY29uLmFwcGVuZENoaWxkKGltZyk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGFiSWNvbi5pbm5lckhUTUwgPSBJQ09OUy5kZWZhdWx0RmlsZTtcbiAgICB9XG5cbiAgICBjb25zdCB0YWJUaXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgdGFiVGl0bGUuY2xhc3NOYW1lID0gXCJ0cmVlLWxhYmVsXCI7XG4gICAgdGFiVGl0bGUudGV4dENvbnRlbnQgPSB0YWIudGl0bGU7XG4gICAgdGFiVGl0bGUudGl0bGUgPSB0YWIudGl0bGU7XG5cbiAgICBjb25zdCB0YWJBY3Rpb25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICB0YWJBY3Rpb25zLmNsYXNzTmFtZSA9IFwicm93LWFjdGlvbnNcIjtcbiAgICBjb25zdCBjbG9zZUJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gICAgY2xvc2VCdG4uY2xhc3NOYW1lID0gXCJhY3Rpb24tYnRuIGRlbGV0ZVwiO1xuICAgIGNsb3NlQnRuLmlubmVySFRNTCA9IElDT05TLmNsb3NlO1xuICAgIGNsb3NlQnRuLnRpdGxlID0gXCJDbG9zZSBUYWJcIjtcbiAgICBjbG9zZUJ0bi5vbmNsaWNrID0gYXN5bmMgKGUpID0+IHtcbiAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMucmVtb3ZlKHRhYi5pZCk7XG4gICAgICAgIGF3YWl0IGxvYWRTdGF0ZSgpO1xuICAgIH07XG4gICAgdGFiQWN0aW9ucy5hcHBlbmRDaGlsZChjbG9zZUJ0bik7XG5cbiAgICB0YWJDb250ZW50LmFwcGVuZCh0YWJDaGVja2JveCwgdGFiSWNvbiwgdGFiVGl0bGUsIHRhYkFjdGlvbnMpO1xuXG4gICAgY29uc3QgeyBub2RlOiB0YWJOb2RlIH0gPSBjcmVhdGVOb2RlKHRhYkNvbnRlbnQsIG51bGwsICd0YWInKTtcbiAgICB0YWJOb2RlLm9uY2xpY2sgPSBhc3luYyAoZSkgPT4ge1xuICAgICAgICAvLyBDbGlja2luZyB0YWIgcm93IGFjdGl2YXRlcyB0YWIgKHVubGVzcyBjbGlja2luZyBjaGVja2JveC9hY3Rpb24pXG4gICAgICAgIGlmICgoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpLmNsb3Nlc3QoJy50cmVlLWNoZWNrYm94JykpIHJldHVybjtcbiAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMudXBkYXRlKHRhYi5pZCwgeyBhY3RpdmU6IHRydWUgfSk7XG4gICAgICAgIGF3YWl0IGNocm9tZS53aW5kb3dzLnVwZGF0ZSh0YWIud2luZG93SWQsIHsgZm9jdXNlZDogdHJ1ZSB9KTtcbiAgICB9O1xuICAgIHJldHVybiB0YWJOb2RlO1xufTtcblxuY29uc3QgcmVuZGVyR3JvdXBOb2RlID0gKFxuICAgIGdyb3VwTGFiZWw6IHN0cmluZyxcbiAgICBncm91cERhdGE6IHsgY29sb3I6IHN0cmluZzsgdGFiczogVGFiV2l0aEdyb3VwW10gfSxcbiAgICB3aW5kb3dLZXk6IHN0cmluZyxcbiAgICBxdWVyeTogc3RyaW5nXG4pID0+IHtcbiAgICBjb25zdCBncm91cEtleSA9IGAke3dpbmRvd0tleX0tZy0ke2dyb3VwTGFiZWx9YDtcbiAgICBjb25zdCBpc0dyb3VwRXhwYW5kZWQgPSAhIXF1ZXJ5IHx8IGV4cGFuZGVkTm9kZXMuaGFzKGdyb3VwS2V5KTtcblxuICAgIC8vIEdyb3VwIENoZWNrYm94IExvZ2ljXG4gICAgY29uc3QgZ3JvdXBUYWJJZHMgPSBncm91cERhdGEudGFicy5tYXAodCA9PiB0LmlkKTtcbiAgICBjb25zdCBncnBTZWxlY3RlZENvdW50ID0gZ3JvdXBUYWJJZHMuZmlsdGVyKGlkID0+IHNlbGVjdGVkVGFicy5oYXMoaWQpKS5sZW5ndGg7XG4gICAgY29uc3QgZ3JwSXNBbGwgPSBncnBTZWxlY3RlZENvdW50ID09PSBncm91cFRhYklkcy5sZW5ndGggJiYgZ3JvdXBUYWJJZHMubGVuZ3RoID4gMDtcbiAgICBjb25zdCBncnBJc1NvbWUgPSBncnBTZWxlY3RlZENvdW50ID4gMCAmJiBncnBTZWxlY3RlZENvdW50IDwgZ3JvdXBUYWJJZHMubGVuZ3RoO1xuXG4gICAgY29uc3QgZ3JwQ2hlY2tib3ggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW5wdXRcIik7XG4gICAgZ3JwQ2hlY2tib3gudHlwZSA9IFwiY2hlY2tib3hcIjtcbiAgICBncnBDaGVja2JveC5jbGFzc05hbWUgPSBcInRyZWUtY2hlY2tib3hcIjtcbiAgICBncnBDaGVja2JveC5jaGVja2VkID0gZ3JwSXNBbGw7XG4gICAgZ3JwQ2hlY2tib3guaW5kZXRlcm1pbmF0ZSA9IGdycElzU29tZTtcbiAgICBncnBDaGVja2JveC5vbmNsaWNrID0gKGUpID0+IHtcbiAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgY29uc3QgdGFyZ2V0U3RhdGUgPSAhZ3JwSXNBbGw7XG4gICAgICAgIGdyb3VwVGFiSWRzLmZvckVhY2goaWQgPT4ge1xuICAgICAgICAgICAgaWYgKHRhcmdldFN0YXRlKSBzZWxlY3RlZFRhYnMuYWRkKGlkKTtcbiAgICAgICAgICAgIGVsc2Ugc2VsZWN0ZWRUYWJzLmRlbGV0ZShpZCk7XG4gICAgICAgIH0pO1xuICAgICAgICByZW5kZXJUcmVlKCk7XG4gICAgfTtcblxuICAgIC8vIEdyb3VwIENvbnRlbnRcbiAgICBjb25zdCBncnBDb250ZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBncnBDb250ZW50LnN0eWxlLmRpc3BsYXkgPSBcImZsZXhcIjtcbiAgICBncnBDb250ZW50LnN0eWxlLmFsaWduSXRlbXMgPSBcImNlbnRlclwiO1xuICAgIGdycENvbnRlbnQuc3R5bGUuZmxleCA9IFwiMVwiO1xuICAgIGdycENvbnRlbnQuc3R5bGUub3ZlcmZsb3cgPSBcImhpZGRlblwiO1xuXG4gICAgY29uc3QgaWNvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgaWNvbi5jbGFzc05hbWUgPSBcInRyZWUtaWNvblwiO1xuICAgIGljb24uaW5uZXJIVE1MID0gVFJFRV9JQ09OUy5mb2xkZXI7XG5cbiAgICBjb25zdCBncnBMYWJlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgZ3JwTGFiZWwuY2xhc3NOYW1lID0gXCJ0cmVlLWxhYmVsXCI7XG4gICAgZ3JwTGFiZWwudGV4dENvbnRlbnQgPSBncm91cExhYmVsO1xuXG4gICAgY29uc3QgZ3JwQ291bnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGdycENvdW50LmNsYXNzTmFtZSA9IFwidHJlZS1jb3VudFwiO1xuICAgIGdycENvdW50LnRleHRDb250ZW50ID0gYCgke2dyb3VwRGF0YS50YWJzLmxlbmd0aH0pYDtcblxuICAgIC8vIEdyb3VwIEFjdGlvbnNcbiAgICBjb25zdCBhY3Rpb25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBhY3Rpb25zLmNsYXNzTmFtZSA9IFwicm93LWFjdGlvbnNcIjtcbiAgICBjb25zdCB1bmdyb3VwQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgICB1bmdyb3VwQnRuLmNsYXNzTmFtZSA9IFwiYWN0aW9uLWJ0blwiO1xuICAgIHVuZ3JvdXBCdG4uaW5uZXJIVE1MID0gSUNPTlMudW5ncm91cDtcbiAgICB1bmdyb3VwQnRuLnRpdGxlID0gXCJVbmdyb3VwXCI7XG4gICAgdW5ncm91cEJ0bi5vbmNsaWNrID0gYXN5bmMgKGUpID0+IHtcbiAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgaWYgKGNvbmZpcm0oYFVuZ3JvdXAgJHtncm91cERhdGEudGFicy5sZW5ndGh9IHRhYnM/YCkpIHtcbiAgICAgICAgICAgIGF3YWl0IGNocm9tZS50YWJzLnVuZ3JvdXAoZ3JvdXBEYXRhLnRhYnMubWFwKHQgPT4gdC5pZCkpO1xuICAgICAgICAgICAgYXdhaXQgbG9hZFN0YXRlKCk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIGFjdGlvbnMuYXBwZW5kQ2hpbGQodW5ncm91cEJ0bik7XG5cbiAgICBncnBDb250ZW50LmFwcGVuZChncnBDaGVja2JveCwgaWNvbiwgZ3JwTGFiZWwsIGdycENvdW50LCBhY3Rpb25zKTtcblxuICAgIC8vIFRhYnNcbiAgICBjb25zdCB0YWJzQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBncm91cERhdGEudGFicy5mb3JFYWNoKHRhYiA9PiB7XG4gICAgICAgIHRhYnNDb250YWluZXIuYXBwZW5kQ2hpbGQocmVuZGVyVGFiTm9kZSh0YWIpKTtcbiAgICB9KTtcblxuICAgIGNvbnN0IHsgbm9kZTogZ3JvdXBOb2RlLCB0b2dnbGU6IGdycFRvZ2dsZSwgY2hpbGRyZW5Db250YWluZXI6IGdycENoaWxkcmVuIH0gPSBjcmVhdGVOb2RlKFxuICAgICAgICBncnBDb250ZW50LFxuICAgICAgICB0YWJzQ29udGFpbmVyLFxuICAgICAgICAnZ3JvdXAnLFxuICAgICAgICBpc0dyb3VwRXhwYW5kZWQsXG4gICAgICAgICgpID0+IHtcbiAgICAgICAgICAgIGlmIChleHBhbmRlZE5vZGVzLmhhcyhncm91cEtleSkpIGV4cGFuZGVkTm9kZXMuZGVsZXRlKGdyb3VwS2V5KTtcbiAgICAgICAgICAgIGVsc2UgZXhwYW5kZWROb2Rlcy5hZGQoZ3JvdXBLZXkpO1xuXG4gICAgICAgICAgICBjb25zdCBleHBhbmRlZCA9IGV4cGFuZGVkTm9kZXMuaGFzKGdyb3VwS2V5KTtcbiAgICAgICAgICAgIGdycFRvZ2dsZS5jbGFzc0xpc3QudG9nZ2xlKCdyb3RhdGVkJywgZXhwYW5kZWQpO1xuICAgICAgICAgICAgZ3JwQ2hpbGRyZW4hLmNsYXNzTGlzdC50b2dnbGUoJ2V4cGFuZGVkJywgZXhwYW5kZWQpO1xuICAgICAgICB9XG4gICAgKTtcblxuICAgIC8vIEFwcGx5IGJhY2tncm91bmQgY29sb3IgdG8gZ3JvdXAgbm9kZVxuICAgIGlmIChncm91cERhdGEuY29sb3IpIHtcbiAgICAgICAgY29uc3QgY29sb3JOYW1lID0gZ3JvdXBEYXRhLmNvbG9yO1xuICAgICAgICBjb25zdCBoZXggPSBHUk9VUF9DT0xPUlNbY29sb3JOYW1lXSB8fCBjb2xvck5hbWU7IC8vIEZhbGxiYWNrIGlmIGl0J3MgYWxyZWFkeSBoZXhcbiAgICAgICAgaWYgKGhleC5zdGFydHNXaXRoKCcjJykpIHtcbiAgICAgICAgICAgIGdyb3VwTm9kZS5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBoZXhUb1JnYmEoaGV4LCAwLjEpO1xuICAgICAgICAgICAgZ3JvdXBOb2RlLnN0eWxlLmJvcmRlciA9IGAxcHggc29saWQgJHtoZXhUb1JnYmEoaGV4LCAwLjIpfWA7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZ3JvdXBOb2RlO1xufTtcblxuY29uc3QgcmVuZGVyV2luZG93Tm9kZSA9ICh3aW5kb3c6IFdpbmRvd1ZpZXcsIHZpc2libGVUYWJzOiBUYWJXaXRoR3JvdXBbXSwgcXVlcnk6IHN0cmluZykgPT4ge1xuICAgIGNvbnN0IHdpbmRvd0tleSA9IGB3LSR7d2luZG93LmlkfWA7XG4gICAgY29uc3QgaXNFeHBhbmRlZCA9ICEhcXVlcnkgfHwgZXhwYW5kZWROb2Rlcy5oYXMod2luZG93S2V5KTtcblxuICAgIC8vIFdpbmRvdyBDaGVja2JveCBMb2dpY1xuICAgIGNvbnN0IGFsbFRhYklkcyA9IHZpc2libGVUYWJzLm1hcCh0ID0+IHQuaWQpO1xuICAgIGNvbnN0IHNlbGVjdGVkQ291bnQgPSBhbGxUYWJJZHMuZmlsdGVyKGlkID0+IHNlbGVjdGVkVGFicy5oYXMoaWQpKS5sZW5ndGg7XG4gICAgY29uc3QgaXNBbGwgPSBzZWxlY3RlZENvdW50ID09PSBhbGxUYWJJZHMubGVuZ3RoICYmIGFsbFRhYklkcy5sZW5ndGggPiAwO1xuICAgIGNvbnN0IGlzU29tZSA9IHNlbGVjdGVkQ291bnQgPiAwICYmIHNlbGVjdGVkQ291bnQgPCBhbGxUYWJJZHMubGVuZ3RoO1xuXG4gICAgY29uc3Qgd2luQ2hlY2tib3ggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW5wdXRcIik7XG4gICAgd2luQ2hlY2tib3gudHlwZSA9IFwiY2hlY2tib3hcIjtcbiAgICB3aW5DaGVja2JveC5jbGFzc05hbWUgPSBcInRyZWUtY2hlY2tib3hcIjtcbiAgICB3aW5DaGVja2JveC5jaGVja2VkID0gaXNBbGw7XG4gICAgd2luQ2hlY2tib3guaW5kZXRlcm1pbmF0ZSA9IGlzU29tZTtcbiAgICB3aW5DaGVja2JveC5vbmNsaWNrID0gKGUpID0+IHtcbiAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgY29uc3QgdGFyZ2V0U3RhdGUgPSAhaXNBbGw7IC8vIElmIGFsbCB3ZXJlIHNlbGVjdGVkLCBkZXNlbGVjdC4gT3RoZXJ3aXNlIHNlbGVjdCBhbGwuXG4gICAgICAgIGFsbFRhYklkcy5mb3JFYWNoKGlkID0+IHtcbiAgICAgICAgICAgIGlmICh0YXJnZXRTdGF0ZSkgc2VsZWN0ZWRUYWJzLmFkZChpZCk7XG4gICAgICAgICAgICBlbHNlIHNlbGVjdGVkVGFicy5kZWxldGUoaWQpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmVuZGVyVHJlZSgpO1xuICAgIH07XG5cbiAgICAvLyBXaW5kb3cgQ29udGVudFxuICAgIGNvbnN0IHdpbkNvbnRlbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIHdpbkNvbnRlbnQuc3R5bGUuZGlzcGxheSA9IFwiZmxleFwiO1xuICAgIHdpbkNvbnRlbnQuc3R5bGUuYWxpZ25JdGVtcyA9IFwiY2VudGVyXCI7XG4gICAgd2luQ29udGVudC5zdHlsZS5mbGV4ID0gXCIxXCI7XG4gICAgd2luQ29udGVudC5zdHlsZS5vdmVyZmxvdyA9IFwiaGlkZGVuXCI7XG5cbiAgICBjb25zdCBsYWJlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgbGFiZWwuY2xhc3NOYW1lID0gXCJ0cmVlLWxhYmVsXCI7XG4gICAgbGFiZWwudGV4dENvbnRlbnQgPSB3aW5kb3cudGl0bGU7XG5cbiAgICBjb25zdCBjb3VudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgY291bnQuY2xhc3NOYW1lID0gXCJ0cmVlLWNvdW50XCI7XG4gICAgY291bnQudGV4dENvbnRlbnQgPSBgKCR7dmlzaWJsZVRhYnMubGVuZ3RofSBUYWJzKWA7XG5cbiAgICB3aW5Db250ZW50LmFwcGVuZCh3aW5DaGVja2JveCwgbGFiZWwsIGNvdW50KTtcblxuICAgIC8vIENoaWxkcmVuIChHcm91cHMpXG4gICAgY29uc3QgY2hpbGRyZW5Db250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuXG4gICAgLy8gR3JvdXAgdGFic1xuICAgIGNvbnN0IGdyb3VwcyA9IG5ldyBNYXA8c3RyaW5nLCB7IGNvbG9yOiBzdHJpbmc7IHRhYnM6IFRhYldpdGhHcm91cFtdIH0+KCk7XG4gICAgY29uc3QgdW5ncm91cGVkVGFiczogVGFiV2l0aEdyb3VwW10gPSBbXTtcbiAgICB2aXNpYmxlVGFicy5mb3JFYWNoKHRhYiA9PiB7XG4gICAgICAgIGlmICh0YWIuZ3JvdXBMYWJlbCkge1xuICAgICAgICAgICAgY29uc3Qga2V5ID0gdGFiLmdyb3VwTGFiZWw7XG4gICAgICAgICAgICBjb25zdCBlbnRyeSA9IGdyb3Vwcy5nZXQoa2V5KSA/PyB7IGNvbG9yOiB0YWIuZ3JvdXBDb2xvciEsIHRhYnM6IFtdIH07XG4gICAgICAgICAgICBlbnRyeS50YWJzLnB1c2godGFiKTtcbiAgICAgICAgICAgIGdyb3Vwcy5zZXQoa2V5LCBlbnRyeSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB1bmdyb3VwZWRUYWJzLnB1c2godGFiKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgQXJyYXkuZnJvbShncm91cHMuZW50cmllcygpKS5mb3JFYWNoKChbZ3JvdXBMYWJlbCwgZ3JvdXBEYXRhXSkgPT4ge1xuICAgICAgICBjaGlsZHJlbkNvbnRhaW5lci5hcHBlbmRDaGlsZChyZW5kZXJHcm91cE5vZGUoZ3JvdXBMYWJlbCwgZ3JvdXBEYXRhLCB3aW5kb3dLZXksIHF1ZXJ5KSk7XG4gICAgfSk7XG5cbiAgICB1bmdyb3VwZWRUYWJzLmZvckVhY2godGFiID0+IHtcbiAgICAgICAgY2hpbGRyZW5Db250YWluZXIuYXBwZW5kQ2hpbGQocmVuZGVyVGFiTm9kZSh0YWIpKTtcbiAgICB9KTtcblxuICAgIGNvbnN0IHsgbm9kZTogd2luTm9kZSwgdG9nZ2xlOiB3aW5Ub2dnbGUsIGNoaWxkcmVuQ29udGFpbmVyOiB3aW5DaGlsZHJlbiB9ID0gY3JlYXRlTm9kZShcbiAgICAgICAgd2luQ29udGVudCxcbiAgICAgICAgY2hpbGRyZW5Db250YWluZXIsXG4gICAgICAgICd3aW5kb3cnLFxuICAgICAgICBpc0V4cGFuZGVkLFxuICAgICAgICAoKSA9PiB7XG4gICAgICAgICAgICAgaWYgKGV4cGFuZGVkTm9kZXMuaGFzKHdpbmRvd0tleSkpIGV4cGFuZGVkTm9kZXMuZGVsZXRlKHdpbmRvd0tleSk7XG4gICAgICAgICAgICAgZWxzZSBleHBhbmRlZE5vZGVzLmFkZCh3aW5kb3dLZXkpO1xuXG4gICAgICAgICAgICAgY29uc3QgZXhwYW5kZWQgPSBleHBhbmRlZE5vZGVzLmhhcyh3aW5kb3dLZXkpO1xuICAgICAgICAgICAgIHdpblRvZ2dsZS5jbGFzc0xpc3QudG9nZ2xlKCdyb3RhdGVkJywgZXhwYW5kZWQpO1xuICAgICAgICAgICAgIHdpbkNoaWxkcmVuIS5jbGFzc0xpc3QudG9nZ2xlKCdleHBhbmRlZCcsIGV4cGFuZGVkKTtcbiAgICAgICAgfVxuICAgICk7XG5cbiAgICByZXR1cm4gd2luTm9kZTtcbn07XG5cbmNvbnN0IHJlbmRlclRyZWUgPSAoKSA9PiB7XG4gIGNvbnN0IHF1ZXJ5ID0gc2VhcmNoSW5wdXQudmFsdWUudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gIHdpbmRvd3NDb250YWluZXIuaW5uZXJIVE1MID0gXCJcIjtcblxuICAvLyBGaWx0ZXIgTG9naWNcbiAgY29uc3QgZmlsdGVyZWQgPSB3aW5kb3dTdGF0ZVxuICAgIC5tYXAoKHdpbmRvdykgPT4ge1xuICAgICAgaWYgKCFxdWVyeSkgcmV0dXJuIHsgd2luZG93LCB2aXNpYmxlVGFiczogd2luZG93LnRhYnMgfTtcbiAgICAgIGNvbnN0IHZpc2libGVUYWJzID0gd2luZG93LnRhYnMuZmlsdGVyKFxuICAgICAgICAodGFiKSA9PiB0YWIudGl0bGUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxdWVyeSkgfHwgdGFiLnVybC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHF1ZXJ5KVxuICAgICAgKTtcbiAgICAgIHJldHVybiB7IHdpbmRvdywgdmlzaWJsZVRhYnMgfTtcbiAgICB9KVxuICAgIC5maWx0ZXIoKHsgdmlzaWJsZVRhYnMgfSkgPT4gdmlzaWJsZVRhYnMubGVuZ3RoID4gMCB8fCAhcXVlcnkpO1xuXG4gIGZpbHRlcmVkLmZvckVhY2goKHsgd2luZG93LCB2aXNpYmxlVGFicyB9KSA9PiB7XG4gICAgd2luZG93c0NvbnRhaW5lci5hcHBlbmRDaGlsZChyZW5kZXJXaW5kb3dOb2RlKHdpbmRvdywgdmlzaWJsZVRhYnMsIHF1ZXJ5KSk7XG4gIH0pO1xuXG4gIHVwZGF0ZVN0YXRzKCk7XG59O1xuXG4vLyBTdHJhdGVneSBSZW5kZXJpbmdcbmZ1bmN0aW9uIHVwZGF0ZVN0cmF0ZWd5Vmlld3Moc3RyYXRlZ2llczogU3RyYXRlZ3lEZWZpbml0aW9uW10sIGVuYWJsZWRJZHM6IHN0cmluZ1tdKSB7XG4gICAgLy8gMS4gUmVuZGVyIEFjdGl2ZSBTdHJhdGVnaWVzXG4gICAgYWN0aXZlU3RyYXRlZ2llc0xpc3QuaW5uZXJIVE1MID0gJyc7XG5cbiAgICAvLyBNYWludGFpbiBvcmRlciBmcm9tIGVuYWJsZWRJZHNcbiAgICBjb25zdCBlbmFibGVkU3RyYXRlZ2llcyA9IGVuYWJsZWRJZHNcbiAgICAgICAgLm1hcChpZCA9PiBzdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBpZCkpXG4gICAgICAgIC5maWx0ZXIoKHMpOiBzIGlzIFN0cmF0ZWd5RGVmaW5pdGlvbiA9PiAhIXMpO1xuXG4gICAgZW5hYmxlZFN0cmF0ZWdpZXMuZm9yRWFjaChzdHJhdGVneSA9PiB7XG4gICAgICAgIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICByb3cuY2xhc3NOYW1lID0gJ3N0cmF0ZWd5LXJvdyc7XG4gICAgICAgIHJvdy5kYXRhc2V0LmlkID0gc3RyYXRlZ3kuaWQ7XG4gICAgICAgIHJvdy5kcmFnZ2FibGUgPSB0cnVlO1xuXG4gICAgICAgIC8vIERyYWcgSGFuZGxlXG4gICAgICAgIGNvbnN0IGhhbmRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICBoYW5kbGUuY2xhc3NOYW1lID0gJ3N0cmF0ZWd5LWRyYWctaGFuZGxlJztcbiAgICAgICAgaGFuZGxlLmlubmVySFRNTCA9ICdcdTIyRUVcdTIyRUUnO1xuXG4gICAgICAgIC8vIExhYmVsXG4gICAgICAgIGNvbnN0IGxhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuICAgICAgICBsYWJlbC5jbGFzc05hbWUgPSAnc3RyYXRlZ3ktbGFiZWwnO1xuICAgICAgICBsYWJlbC50ZXh0Q29udGVudCA9IHN0cmF0ZWd5LmxhYmVsO1xuXG4gICAgICAgIC8vIFRhZ3NcbiAgICAgICAgbGV0IHRhZ3NIdG1sID0gJyc7XG4gICAgICAgIGlmIChzdHJhdGVneS50YWdzKSB7XG4gICAgICAgICAgICAgc3RyYXRlZ3kudGFncy5mb3JFYWNoKHRhZyA9PiB7XG4gICAgICAgICAgICAgICAgdGFnc0h0bWwgKz0gYDxzcGFuIGNsYXNzPVwidGFnIHRhZy0ke3RhZ31cIj4ke3RhZ308L3NwYW4+YDtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgY29udGVudFdyYXBwZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgY29udGVudFdyYXBwZXIuc3R5bGUuZmxleCA9IFwiMVwiO1xuICAgICAgICBjb250ZW50V3JhcHBlci5zdHlsZS5kaXNwbGF5ID0gXCJmbGV4XCI7XG4gICAgICAgIGNvbnRlbnRXcmFwcGVyLnN0eWxlLmFsaWduSXRlbXMgPSBcImNlbnRlclwiO1xuICAgICAgICBjb250ZW50V3JhcHBlci5hcHBlbmRDaGlsZChsYWJlbCk7XG4gICAgICAgIGlmICh0YWdzSHRtbCkge1xuICAgICAgICAgICAgIGNvbnN0IHRhZ3NDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG4gICAgICAgICAgICAgdGFnc0NvbnRhaW5lci5pbm5lckhUTUwgPSB0YWdzSHRtbDtcbiAgICAgICAgICAgICBjb250ZW50V3JhcHBlci5hcHBlbmRDaGlsZCh0YWdzQ29udGFpbmVyKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJlbW92ZSBCdXR0b25cbiAgICAgICAgY29uc3QgcmVtb3ZlQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gICAgICAgIHJlbW92ZUJ0bi5jbGFzc05hbWUgPSAnc3RyYXRlZ3ktcmVtb3ZlLWJ0bic7XG4gICAgICAgIHJlbW92ZUJ0bi5pbm5lckhUTUwgPSBJQ09OUy5jbG9zZTsgLy8gVXNlIEljb24gZm9yIGNvbnNpc3RlbmN5XG4gICAgICAgIHJlbW92ZUJ0bi50aXRsZSA9IFwiUmVtb3ZlIHN0cmF0ZWd5XCI7XG4gICAgICAgIHJlbW92ZUJ0bi5vbmNsaWNrID0gYXN5bmMgKGUpID0+IHtcbiAgICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgIGF3YWl0IHRvZ2dsZVN0cmF0ZWd5KHN0cmF0ZWd5LmlkLCBmYWxzZSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgcm93LmFwcGVuZENoaWxkKGhhbmRsZSk7XG4gICAgICAgIHJvdy5hcHBlbmRDaGlsZChjb250ZW50V3JhcHBlcik7XG5cbiAgICAgICAgaWYgKHN0cmF0ZWd5LmlzQ3VzdG9tKSB7XG4gICAgICAgICAgICAgY29uc3QgYXV0b1J1bkJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gICAgICAgICAgICAgYXV0b1J1bkJ0bi5jbGFzc05hbWUgPSBgYWN0aW9uLWJ0biBhdXRvLXJ1biAke3N0cmF0ZWd5LmF1dG9SdW4gPyAnYWN0aXZlJyA6ICcnfWA7XG4gICAgICAgICAgICAgYXV0b1J1bkJ0bi5pbm5lckhUTUwgPSBJQ09OUy5hdXRvUnVuO1xuICAgICAgICAgICAgIGF1dG9SdW5CdG4udGl0bGUgPSBgQXV0byBSdW46ICR7c3RyYXRlZ3kuYXV0b1J1biA/ICdPTicgOiAnT0ZGJ31gO1xuICAgICAgICAgICAgIGF1dG9SdW5CdG4uc3R5bGUub3BhY2l0eSA9IHN0cmF0ZWd5LmF1dG9SdW4gPyBcIjFcIiA6IFwiMC4zXCI7XG4gICAgICAgICAgICAgYXV0b1J1bkJ0bi5vbmNsaWNrID0gYXN5bmMgKGUpID0+IHtcbiAgICAgICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICAgaWYgKCFwcmVmZXJlbmNlcz8uY3VzdG9tU3RyYXRlZ2llcykgcmV0dXJuO1xuICAgICAgICAgICAgICAgICBjb25zdCBjdXN0b21TdHJhdEluZGV4ID0gcHJlZmVyZW5jZXMuY3VzdG9tU3RyYXRlZ2llcy5maW5kSW5kZXgocyA9PiBzLmlkID09PSBzdHJhdGVneS5pZCk7XG4gICAgICAgICAgICAgICAgIGlmIChjdXN0b21TdHJhdEluZGV4ICE9PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBzdHJhdCA9IHByZWZlcmVuY2VzLmN1c3RvbVN0cmF0ZWdpZXNbY3VzdG9tU3RyYXRJbmRleF07XG4gICAgICAgICAgICAgICAgICAgIHN0cmF0LmF1dG9SdW4gPSAhc3RyYXQuYXV0b1J1bjtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNBY3RpdmUgPSAhIXN0cmF0LmF1dG9SdW47XG4gICAgICAgICAgICAgICAgICAgIGF1dG9SdW5CdG4uY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aXZlJywgaXNBY3RpdmUpO1xuICAgICAgICAgICAgICAgICAgICBhdXRvUnVuQnRuLnN0eWxlLm9wYWNpdHkgPSBpc0FjdGl2ZSA/IFwiMVwiIDogXCIwLjNcIjtcbiAgICAgICAgICAgICAgICAgICAgYXV0b1J1bkJ0bi50aXRsZSA9IGBBdXRvIFJ1bjogJHtpc0FjdGl2ZSA/ICdPTicgOiAnT0ZGJ31gO1xuICAgICAgICAgICAgICAgICAgICBsb2NhbFByZWZlcmVuY2VzTW9kaWZpZWRUaW1lID0gRGF0ZS5ub3coKTtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgc2VuZE1lc3NhZ2UoXCJzYXZlUHJlZmVyZW5jZXNcIiwgeyBjdXN0b21TdHJhdGVnaWVzOiBwcmVmZXJlbmNlcy5jdXN0b21TdHJhdGVnaWVzIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgIHJvdy5hcHBlbmRDaGlsZChhdXRvUnVuQnRuKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJvdy5hcHBlbmRDaGlsZChyZW1vdmVCdG4pO1xuXG4gICAgICAgIGFkZERuRExpc3RlbmVycyhyb3cpO1xuICAgICAgICBhY3RpdmVTdHJhdGVnaWVzTGlzdC5hcHBlbmRDaGlsZChyb3cpO1xuICAgIH0pO1xuXG4gICAgLy8gMi4gUmVuZGVyIEFkZCBTdHJhdGVneSBPcHRpb25zXG4gICAgYWRkU3RyYXRlZ3lTZWxlY3QuaW5uZXJIVE1MID0gJzxvcHRpb24gdmFsdWU9XCJcIiBkaXNhYmxlZCBzZWxlY3RlZD5TZWxlY3QgU3RyYXRlZ3kuLi48L29wdGlvbj4nO1xuXG4gICAgY29uc3QgZGlzYWJsZWRTdHJhdGVnaWVzID0gc3RyYXRlZ2llcy5maWx0ZXIocyA9PiAhZW5hYmxlZElkcy5pbmNsdWRlcyhzLmlkKSk7XG4gICAgZGlzYWJsZWRTdHJhdGVnaWVzLnNvcnQoKGEsIGIpID0+IGEubGFiZWwubG9jYWxlQ29tcGFyZShiLmxhYmVsKSk7XG5cbiAgICAvLyBTZXBhcmF0ZSBzdHJhdGVnaWVzIHdpdGggQXV0by1SdW4gYWN0aXZlIGJ1dCBub3QgaW4gc29ydGluZyBsaXN0XG4gICAgY29uc3QgYmFja2dyb3VuZFN0cmF0ZWdpZXM6IFN0cmF0ZWd5RGVmaW5pdGlvbltdID0gW107XG4gICAgY29uc3QgYXZhaWxhYmxlU3RyYXRlZ2llczogU3RyYXRlZ3lEZWZpbml0aW9uW10gPSBbXTtcblxuICAgIGRpc2FibGVkU3RyYXRlZ2llcy5mb3JFYWNoKHMgPT4ge1xuICAgICAgICBpZiAocy5pc0N1c3RvbSAmJiBzLmF1dG9SdW4pIHtcbiAgICAgICAgICAgIGJhY2tncm91bmRTdHJhdGVnaWVzLnB1c2gocyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBhdmFpbGFibGVTdHJhdGVnaWVzLnB1c2gocyk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIFBvcHVsYXRlIFNlbGVjdFxuICAgIC8vIFdlIGluY2x1ZGUgYmFja2dyb3VuZCBzdHJhdGVnaWVzIGluIHRoZSBkcm9wZG93biB0b28gc28gdGhleSBjYW4gYmUgbW92ZWQgdG8gXCJBY3RpdmVcIiBzb3J0aW5nIGVhc2lseVxuICAgIC8vIGJ1dCB3ZSBtaWdodCBtYXJrIHRoZW1cbiAgICBbLi4uYmFja2dyb3VuZFN0cmF0ZWdpZXMsIC4uLmF2YWlsYWJsZVN0cmF0ZWdpZXNdLnNvcnQoKGEsIGIpID0+IGEubGFiZWwubG9jYWxlQ29tcGFyZShiLmxhYmVsKSkuZm9yRWFjaChzdHJhdGVneSA9PiB7XG4gICAgICAgIGNvbnN0IG9wdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ29wdGlvbicpO1xuICAgICAgICBvcHRpb24udmFsdWUgPSBzdHJhdGVneS5pZDtcbiAgICAgICAgb3B0aW9uLnRleHRDb250ZW50ID0gc3RyYXRlZ3kubGFiZWw7XG4gICAgICAgIGFkZFN0cmF0ZWd5U2VsZWN0LmFwcGVuZENoaWxkKG9wdGlvbik7XG4gICAgfSk7XG5cbiAgICAvLyBGb3JjZSBzZWxlY3Rpb24gb2YgcGxhY2Vob2xkZXJcbiAgICBhZGRTdHJhdGVneVNlbGVjdC52YWx1ZSA9IFwiXCI7XG5cbiAgICAvLyAzLiBSZW5kZXIgQmFja2dyb3VuZCBTdHJhdGVnaWVzIFNlY3Rpb24gKGlmIGFueSlcbiAgICBsZXQgYmdTZWN0aW9uID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJiYWNrZ3JvdW5kU3RyYXRlZ2llc1NlY3Rpb25cIik7XG4gICAgaWYgKGJhY2tncm91bmRTdHJhdGVnaWVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgaWYgKCFiZ1NlY3Rpb24pIHtcbiAgICAgICAgICAgIGJnU2VjdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgICAgICBiZ1NlY3Rpb24uaWQgPSBcImJhY2tncm91bmRTdHJhdGVnaWVzU2VjdGlvblwiO1xuICAgICAgICAgICAgYmdTZWN0aW9uLmNsYXNzTmFtZSA9IFwiYWN0aXZlLXN0cmF0ZWdpZXMtc2VjdGlvblwiO1xuICAgICAgICAgICAgLy8gU3R5bGUgaXQgdG8gbG9vayBsaWtlIGFjdGl2ZSBzZWN0aW9uIGJ1dCBkaXN0aW5jdFxuICAgICAgICAgICAgYmdTZWN0aW9uLnN0eWxlLm1hcmdpblRvcCA9IFwiOHB4XCI7XG4gICAgICAgICAgICBiZ1NlY3Rpb24uc3R5bGUuYm9yZGVyVG9wID0gXCIxcHggZGFzaGVkIHZhcigtLWJvcmRlci1jb2xvcilcIjtcbiAgICAgICAgICAgIGJnU2VjdGlvbi5zdHlsZS5wYWRkaW5nVG9wID0gXCI4cHhcIjtcblxuICAgICAgICAgICAgY29uc3QgaGVhZGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgICAgIGhlYWRlci5jbGFzc05hbWUgPSBcInNlY3Rpb24taGVhZGVyXCI7XG4gICAgICAgICAgICBoZWFkZXIudGV4dENvbnRlbnQgPSBcIkJhY2tncm91bmQgQXV0by1SdW5cIjtcbiAgICAgICAgICAgIGhlYWRlci50aXRsZSA9IFwiVGhlc2Ugc3RyYXRlZ2llcyBydW4gYXV0b21hdGljYWxseSBidXQgYXJlIG5vdCB1c2VkIGZvciBzb3J0aW5nL2dyb3VwaW5nIG9yZGVyLlwiO1xuICAgICAgICAgICAgYmdTZWN0aW9uLmFwcGVuZENoaWxkKGhlYWRlcik7XG5cbiAgICAgICAgICAgIGNvbnN0IGxpc3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgbGlzdC5jbGFzc05hbWUgPSBcInN0cmF0ZWd5LWxpc3RcIjtcbiAgICAgICAgICAgIGJnU2VjdGlvbi5hcHBlbmRDaGlsZChsaXN0KTtcblxuICAgICAgICAgICAgLy8gSW5zZXJ0IGFmdGVyIGFjdGl2ZSBsaXN0XG4gICAgICAgICAgICBhY3RpdmVTdHJhdGVnaWVzTGlzdC5wYXJlbnRFbGVtZW50Py5hZnRlcihiZ1NlY3Rpb24pO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbGlzdCA9IGJnU2VjdGlvbi5xdWVyeVNlbGVjdG9yKFwiLnN0cmF0ZWd5LWxpc3RcIikgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICAgIGxpc3QuaW5uZXJIVE1MID0gXCJcIjtcblxuICAgICAgICBiYWNrZ3JvdW5kU3RyYXRlZ2llcy5mb3JFYWNoKHN0cmF0ZWd5ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgcm93LmNsYXNzTmFtZSA9ICdzdHJhdGVneS1yb3cnO1xuICAgICAgICAgICAgcm93LmRhdGFzZXQuaWQgPSBzdHJhdGVneS5pZDtcblxuICAgICAgICAgICAgY29uc3QgbGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG4gICAgICAgICAgICBsYWJlbC5jbGFzc05hbWUgPSAnc3RyYXRlZ3ktbGFiZWwnO1xuICAgICAgICAgICAgbGFiZWwudGV4dENvbnRlbnQgPSBzdHJhdGVneS5sYWJlbDtcbiAgICAgICAgICAgIGxhYmVsLnN0eWxlLm9wYWNpdHkgPSBcIjAuN1wiO1xuXG4gICAgICAgICAgICBjb25zdCBhdXRvUnVuQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgICAgICAgICAgIGF1dG9SdW5CdG4uY2xhc3NOYW1lID0gYGFjdGlvbi1idG4gYXV0by1ydW4gYWN0aXZlYDtcbiAgICAgICAgICAgIGF1dG9SdW5CdG4uaW5uZXJIVE1MID0gSUNPTlMuYXV0b1J1bjtcbiAgICAgICAgICAgIGF1dG9SdW5CdG4udGl0bGUgPSBgQXV0byBSdW46IE9OIChDbGljayB0byBkaXNhYmxlKWA7XG4gICAgICAgICAgICBhdXRvUnVuQnRuLnN0eWxlLm1hcmdpbkxlZnQgPSBcImF1dG9cIjtcbiAgICAgICAgICAgIGF1dG9SdW5CdG4ub25jbGljayA9IGFzeW5jIChlKSA9PiB7XG4gICAgICAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICAgICAgIGlmICghcHJlZmVyZW5jZXM/LmN1c3RvbVN0cmF0ZWdpZXMpIHJldHVybjtcbiAgICAgICAgICAgICAgICAgY29uc3QgY3VzdG9tU3RyYXRJbmRleCA9IHByZWZlcmVuY2VzLmN1c3RvbVN0cmF0ZWdpZXMuZmluZEluZGV4KHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3kuaWQpO1xuICAgICAgICAgICAgICAgICBpZiAoY3VzdG9tU3RyYXRJbmRleCAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3RyYXQgPSBwcmVmZXJlbmNlcy5jdXN0b21TdHJhdGVnaWVzW2N1c3RvbVN0cmF0SW5kZXhdO1xuICAgICAgICAgICAgICAgICAgICBzdHJhdC5hdXRvUnVuID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIGxvY2FsUHJlZmVyZW5jZXNNb2RpZmllZFRpbWUgPSBEYXRlLm5vdygpO1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBzZW5kTWVzc2FnZShcInNhdmVQcmVmZXJlbmNlc1wiLCB7IGN1c3RvbVN0cmF0ZWdpZXM6IHByZWZlcmVuY2VzLmN1c3RvbVN0cmF0ZWdpZXMgfSk7XG4gICAgICAgICAgICAgICAgICAgIC8vIFVJIHVwZGF0ZSB0cmlnZ2VycyB2aWEgc2VuZE1lc3NhZ2UgcmVzcG9uc2Ugb3IgcmUtcmVuZGVyXG4gICAgICAgICAgICAgICAgICAgIC8vIEJ1dCB3ZSBzaG91bGQgcmUtcmVuZGVyIGltbWVkaWF0ZWx5IGZvciByZXNwb25zaXZlbmVzc1xuICAgICAgICAgICAgICAgICAgICB1cGRhdGVTdHJhdGVneVZpZXdzKHN0cmF0ZWdpZXMsIGVuYWJsZWRJZHMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHJvdy5hcHBlbmRDaGlsZChsYWJlbCk7XG4gICAgICAgICAgICByb3cuYXBwZW5kQ2hpbGQoYXV0b1J1bkJ0bik7XG4gICAgICAgICAgICBsaXN0LmFwcGVuZENoaWxkKHJvdyk7XG4gICAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChiZ1NlY3Rpb24pIGJnU2VjdGlvbi5yZW1vdmUoKTtcbiAgICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHRvZ2dsZVN0cmF0ZWd5KGlkOiBzdHJpbmcsIGVuYWJsZTogYm9vbGVhbikge1xuICAgIGlmICghcHJlZmVyZW5jZXMpIHJldHVybjtcblxuICAgIGNvbnN0IGFsbFN0cmF0ZWdpZXMgPSBnZXRTdHJhdGVnaWVzKHByZWZlcmVuY2VzLmN1c3RvbVN0cmF0ZWdpZXMpO1xuICAgIGNvbnN0IHZhbGlkSWRzID0gbmV3IFNldChhbGxTdHJhdGVnaWVzLm1hcChzID0+IHMuaWQpKTtcblxuICAgIC8vIENsZWFuIGN1cnJlbnQgbGlzdCBieSByZW1vdmluZyBzdGFsZSBJRHNcbiAgICBsZXQgY3VycmVudCA9IChwcmVmZXJlbmNlcy5zb3J0aW5nIHx8IFtdKS5maWx0ZXIoc0lkID0+IHZhbGlkSWRzLmhhcyhzSWQpKTtcblxuICAgIGlmIChlbmFibGUpIHtcbiAgICAgICAgaWYgKCFjdXJyZW50LmluY2x1ZGVzKGlkKSkge1xuICAgICAgICAgICAgY3VycmVudC5wdXNoKGlkKTtcbiAgICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAgIGN1cnJlbnQgPSBjdXJyZW50LmZpbHRlcihzSWQgPT4gc0lkICE9PSBpZCk7XG4gICAgfVxuXG4gICAgcHJlZmVyZW5jZXMuc29ydGluZyA9IGN1cnJlbnQ7XG4gICAgbG9jYWxQcmVmZXJlbmNlc01vZGlmaWVkVGltZSA9IERhdGUubm93KCk7XG4gICAgYXdhaXQgc2VuZE1lc3NhZ2UoXCJzYXZlUHJlZmVyZW5jZXNcIiwgeyBzb3J0aW5nOiBjdXJyZW50IH0pO1xuXG4gICAgLy8gUmUtcmVuZGVyXG4gICAgdXBkYXRlU3RyYXRlZ3lWaWV3cyhhbGxTdHJhdGVnaWVzLCBjdXJyZW50KTtcbn1cblxuZnVuY3Rpb24gYWRkRG5ETGlzdGVuZXJzKHJvdzogSFRNTEVsZW1lbnQpIHtcbiAgcm93LmFkZEV2ZW50TGlzdGVuZXIoJ2RyYWdzdGFydCcsIChlKSA9PiB7XG4gICAgcm93LmNsYXNzTGlzdC5hZGQoJ2RyYWdnaW5nJyk7XG4gICAgaWYgKGUuZGF0YVRyYW5zZmVyKSB7XG4gICAgICAgIGUuZGF0YVRyYW5zZmVyLmVmZmVjdEFsbG93ZWQgPSAnbW92ZSc7XG4gICAgfVxuICB9KTtcblxuICByb3cuYWRkRXZlbnRMaXN0ZW5lcignZHJhZ2VuZCcsIGFzeW5jICgpID0+IHtcbiAgICByb3cuY2xhc3NMaXN0LnJlbW92ZSgnZHJhZ2dpbmcnKTtcbiAgICAvLyBTYXZlIG9yZGVyXG4gICAgaWYgKHByZWZlcmVuY2VzKSB7XG4gICAgICAgIGNvbnN0IGN1cnJlbnRTb3J0aW5nID0gZ2V0U2VsZWN0ZWRTb3J0aW5nKCk7XG4gICAgICAgIC8vIENoZWNrIGlmIG9yZGVyIGNoYW5nZWRcbiAgICAgICAgY29uc3Qgb2xkU29ydGluZyA9IHByZWZlcmVuY2VzLnNvcnRpbmcgfHwgW107XG4gICAgICAgIGlmIChKU09OLnN0cmluZ2lmeShjdXJyZW50U29ydGluZykgIT09IEpTT04uc3RyaW5naWZ5KG9sZFNvcnRpbmcpKSB7XG4gICAgICAgICAgICBwcmVmZXJlbmNlcy5zb3J0aW5nID0gY3VycmVudFNvcnRpbmc7XG4gICAgICAgICAgICBsb2NhbFByZWZlcmVuY2VzTW9kaWZpZWRUaW1lID0gRGF0ZS5ub3coKTtcbiAgICAgICAgICAgIGF3YWl0IHNlbmRNZXNzYWdlKFwic2F2ZVByZWZlcmVuY2VzXCIsIHsgc29ydGluZzogY3VycmVudFNvcnRpbmcgfSk7XG4gICAgICAgIH1cbiAgICB9XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBzZXR1cENvbnRhaW5lckRuRChjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG4gICAgY29udGFpbmVyLmFkZEV2ZW50TGlzdGVuZXIoJ2RyYWdvdmVyJywgKGUpID0+IHtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBjb25zdCBhZnRlckVsZW1lbnQgPSBnZXREcmFnQWZ0ZXJFbGVtZW50KGNvbnRhaW5lciwgZS5jbGllbnRZLCAnLnN0cmF0ZWd5LXJvdzpub3QoLmRyYWdnaW5nKScpO1xuICAgICAgICBjb25zdCBkcmFnZ2FibGVSb3cgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuc3RyYXRlZ3ktcm93LmRyYWdnaW5nJyk7XG4gICAgICAgIGlmIChkcmFnZ2FibGVSb3cgJiYgZHJhZ2dhYmxlUm93LnBhcmVudEVsZW1lbnQgPT09IGNvbnRhaW5lcikge1xuICAgICAgICAgICAgIGlmIChhZnRlckVsZW1lbnQgPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChkcmFnZ2FibGVSb3cpO1xuICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29udGFpbmVyLmluc2VydEJlZm9yZShkcmFnZ2FibGVSb3csIGFmdGVyRWxlbWVudCk7XG4gICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSk7XG59XG5cbnNldHVwQ29udGFpbmVyRG5EKGFjdGl2ZVN0cmF0ZWdpZXNMaXN0KTtcblxuY29uc3QgdXBkYXRlVUkgPSAoXG4gIHN0YXRlRGF0YTogeyBncm91cHM6IFRhYkdyb3VwW107IHByZWZlcmVuY2VzOiBQcmVmZXJlbmNlcyB9LFxuICBjdXJyZW50V2luZG93OiBjaHJvbWUud2luZG93cy5XaW5kb3cgfCB1bmRlZmluZWQsXG4gIGNocm9tZVdpbmRvd3M6IGNocm9tZS53aW5kb3dzLldpbmRvd1tdLFxuICBpc1ByZWxpbWluYXJ5ID0gZmFsc2VcbikgPT4ge1xuICAgIC8vIElmIHdlIG1vZGlmaWVkIHByZWZlcmVuY2VzIGxvY2FsbHkgd2l0aGluIHRoZSBsYXN0IDIgc2Vjb25kcywgaWdub3JlIHRoZSBpbmNvbWluZyBwcmVmZXJlbmNlcyBmb3Igc29ydGluZ1xuICAgIGNvbnN0IHRpbWVTaW5jZUxvY2FsVXBkYXRlID0gRGF0ZS5ub3coKSAtIGxvY2FsUHJlZmVyZW5jZXNNb2RpZmllZFRpbWU7XG4gICAgY29uc3Qgc2hvdWxkVXBkYXRlUHJlZmVyZW5jZXMgPSB0aW1lU2luY2VMb2NhbFVwZGF0ZSA+IDIwMDA7XG5cbiAgICBpZiAoc2hvdWxkVXBkYXRlUHJlZmVyZW5jZXMpIHtcbiAgICAgICAgcHJlZmVyZW5jZXMgPSBzdGF0ZURhdGEucHJlZmVyZW5jZXM7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgLy8gS2VlcCBsb2NhbCBzb3J0aW5nL3N0cmF0ZWdpZXMsIHVwZGF0ZSBvdGhlcnNcbiAgICAgICAgaWYgKHByZWZlcmVuY2VzICYmIHN0YXRlRGF0YS5wcmVmZXJlbmNlcykge1xuICAgICAgICAgICAgIHByZWZlcmVuY2VzID0ge1xuICAgICAgICAgICAgICAgICAuLi5zdGF0ZURhdGEucHJlZmVyZW5jZXMsXG4gICAgICAgICAgICAgICAgIHNvcnRpbmc6IHByZWZlcmVuY2VzLnNvcnRpbmcsXG4gICAgICAgICAgICAgICAgIGN1c3RvbVN0cmF0ZWdpZXM6IHByZWZlcmVuY2VzLmN1c3RvbVN0cmF0ZWdpZXNcbiAgICAgICAgICAgICB9O1xuICAgICAgICB9IGVsc2UgaWYgKCFwcmVmZXJlbmNlcykge1xuICAgICAgICAgICAgcHJlZmVyZW5jZXMgPSBzdGF0ZURhdGEucHJlZmVyZW5jZXM7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAocHJlZmVyZW5jZXMpIHtcbiAgICAgIGNvbnN0IHMgPSBwcmVmZXJlbmNlcy5zb3J0aW5nIHx8IFtdO1xuXG4gICAgICAvLyBJbml0aWFsaXplIExvZ2dlclxuICAgICAgc2V0TG9nZ2VyUHJlZmVyZW5jZXMocHJlZmVyZW5jZXMpO1xuXG4gICAgICBjb25zdCBhbGxTdHJhdGVnaWVzID0gZ2V0U3RyYXRlZ2llcyhwcmVmZXJlbmNlcy5jdXN0b21TdHJhdGVnaWVzKTtcblxuICAgICAgLy8gUmVuZGVyIHVuaWZpZWQgc3RyYXRlZ3kgbGlzdFxuICAgICAgdXBkYXRlU3RyYXRlZ3lWaWV3cyhhbGxTdHJhdGVnaWVzLCBzKTtcblxuICAgICAgLy8gSW5pdGlhbCB0aGVtZSBsb2FkXG4gICAgICBpZiAocHJlZmVyZW5jZXMudGhlbWUpIHtcbiAgICAgICAgYXBwbHlUaGVtZShwcmVmZXJlbmNlcy50aGVtZSwgZmFsc2UpO1xuICAgICAgfVxuXG4gICAgICAvLyBJbml0IHNldHRpbmdzIFVJXG4gICAgICBpZiAocHJlZmVyZW5jZXMubG9nTGV2ZWwpIHtcbiAgICAgICAgICBjb25zdCBzZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbG9nTGV2ZWxTZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgICBpZiAoc2VsZWN0KSBzZWxlY3QudmFsdWUgPSBwcmVmZXJlbmNlcy5sb2dMZXZlbDtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoY3VycmVudFdpbmRvdykge1xuICAgICAgZm9jdXNlZFdpbmRvd0lkID0gY3VycmVudFdpbmRvdy5pZCA/PyBudWxsO1xuICAgIH0gZWxzZSB7XG4gICAgICBmb2N1c2VkV2luZG93SWQgPSBudWxsO1xuICAgICAgY29uc29sZS53YXJuKFwiRmFpbGVkIHRvIGdldCBjdXJyZW50IHdpbmRvd1wiKTtcbiAgICB9XG5cbiAgICBjb25zdCB3aW5kb3dUaXRsZXMgPSBuZXcgTWFwPG51bWJlciwgc3RyaW5nPigpO1xuXG4gICAgY2hyb21lV2luZG93cy5mb3JFYWNoKCh3aW4pID0+IHtcbiAgICAgIGlmICghd2luLmlkKSByZXR1cm47XG4gICAgICBjb25zdCBhY3RpdmVUYWJUaXRsZSA9IHdpbi50YWJzPy5maW5kKCh0YWIpID0+IHRhYi5hY3RpdmUpPy50aXRsZTtcbiAgICAgIGNvbnN0IHRpdGxlID0gYWN0aXZlVGFiVGl0bGUgPz8gYFdpbmRvdyAke3dpbi5pZH1gO1xuICAgICAgd2luZG93VGl0bGVzLnNldCh3aW4uaWQsIHRpdGxlKTtcbiAgICB9KTtcblxuICAgIHdpbmRvd1N0YXRlID0gbWFwV2luZG93cyhzdGF0ZURhdGEuZ3JvdXBzLCB3aW5kb3dUaXRsZXMpO1xuXG4gICAgaWYgKGZvY3VzZWRXaW5kb3dJZCAhPT0gbnVsbCkge1xuICAgICAgICB3aW5kb3dTdGF0ZS5zb3J0KChhLCBiKSA9PiB7XG4gICAgICAgICAgICBpZiAoYS5pZCA9PT0gZm9jdXNlZFdpbmRvd0lkKSByZXR1cm4gLTE7XG4gICAgICAgICAgICBpZiAoYi5pZCA9PT0gZm9jdXNlZFdpbmRvd0lkKSByZXR1cm4gMTtcbiAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBpZiAoIWluaXRpYWxTZWxlY3Rpb25Eb25lICYmIGZvY3VzZWRXaW5kb3dJZCAhPT0gbnVsbCkge1xuICAgICAgICBjb25zdCBhY3RpdmVXaW5kb3cgPSB3aW5kb3dTdGF0ZS5maW5kKHcgPT4gdy5pZCA9PT0gZm9jdXNlZFdpbmRvd0lkKTtcbiAgICAgICAgaWYgKGFjdGl2ZVdpbmRvdykge1xuICAgICAgICAgICAgIGV4cGFuZGVkTm9kZXMuYWRkKGB3LSR7YWN0aXZlV2luZG93LmlkfWApO1xuICAgICAgICAgICAgIGFjdGl2ZVdpbmRvdy50YWJzLmZvckVhY2godCA9PiBzZWxlY3RlZFRhYnMuYWRkKHQuaWQpKTtcblxuICAgICAgICAgICAgIC8vIElmIHdlIHN1Y2Nlc3NmdWxseSBmb3VuZCBhbmQgc2VsZWN0ZWQgdGhlIHdpbmRvdywgbWFyayBhcyBkb25lXG4gICAgICAgICAgICAgaW5pdGlhbFNlbGVjdGlvbkRvbmUgPSB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKCFpc1ByZWxpbWluYXJ5KSB7XG4gICAgICAgIGluaXRpYWxTZWxlY3Rpb25Eb25lID0gdHJ1ZTtcbiAgICB9XG5cbiAgICByZW5kZXJUcmVlKCk7XG59O1xuXG5jb25zdCBsb2FkU3RhdGUgPSBhc3luYyAoKSA9PiB7XG4gIGxvZ0luZm8oXCJMb2FkaW5nIHBvcHVwIHN0YXRlXCIpO1xuXG4gIGxldCBiZ0ZpbmlzaGVkID0gZmFsc2U7XG5cbiAgY29uc3QgZmFzdExvYWQgPSBhc3luYyAoKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgW2xvY2FsUmVzLCBjdywgYXddID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgICAgICAgZmV0Y2hMb2NhbFN0YXRlKCksXG4gICAgICAgICAgICBjaHJvbWUud2luZG93cy5nZXRDdXJyZW50KCkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKSxcbiAgICAgICAgICAgIGNocm9tZS53aW5kb3dzLmdldEFsbCh7IHdpbmRvd1R5cGVzOiBbXCJub3JtYWxcIl0sIHBvcHVsYXRlOiB0cnVlIH0pLmNhdGNoKCgpID0+IFtdKVxuICAgICAgICBdKTtcblxuICAgICAgICAvLyBPbmx5IHVwZGF0ZSBpZiBiYWNrZ3JvdW5kIGhhc24ndCBmaW5pc2hlZCB5ZXRcbiAgICAgICAgaWYgKCFiZ0ZpbmlzaGVkICYmIGxvY2FsUmVzLm9rICYmIGxvY2FsUmVzLmRhdGEpIHtcbiAgICAgICAgICAgICB1cGRhdGVVSShsb2NhbFJlcy5kYXRhLCBjdywgYXcgYXMgY2hyb21lLndpbmRvd3MuV2luZG93W10sIHRydWUpO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLndhcm4oXCJGYXN0IGxvYWQgZmFpbGVkXCIsIGUpO1xuICAgIH1cbiAgfTtcblxuICBjb25zdCBiZ0xvYWQgPSBhc3luYyAoKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgW2JnUmVzLCBjdywgYXddID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgICAgICAgZmV0Y2hTdGF0ZSgpLFxuICAgICAgICAgICAgY2hyb21lLndpbmRvd3MuZ2V0Q3VycmVudCgpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCksXG4gICAgICAgICAgICBjaHJvbWUud2luZG93cy5nZXRBbGwoeyB3aW5kb3dUeXBlczogW1wibm9ybWFsXCJdLCBwb3B1bGF0ZTogdHJ1ZSB9KS5jYXRjaCgoKSA9PiBbXSlcbiAgICAgICAgXSk7XG5cbiAgICAgICAgYmdGaW5pc2hlZCA9IHRydWU7IC8vIE1hcmsgYXMgZmluaXNoZWQgc28gZmFzdCBsb2FkIGRvZXNuJ3Qgb3ZlcndyaXRlIGlmIGl0J3Mgc29tZWhvdyBzbG93XG5cbiAgICAgICAgaWYgKGJnUmVzLm9rICYmIGJnUmVzLmRhdGEpIHtcbiAgICAgICAgICAgICB1cGRhdGVVSShiZ1Jlcy5kYXRhLCBjdywgYXcgYXMgY2hyb21lLndpbmRvd3MuV2luZG93W10pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBsb2FkIHN0YXRlOlwiLCBiZ1Jlcy5lcnJvciA/PyBcIlVua25vd24gZXJyb3JcIik7XG4gICAgICAgICAgICBpZiAod2luZG93U3RhdGUubGVuZ3RoID09PSAwKSB7IC8vIE9ubHkgc2hvdyBlcnJvciBpZiB3ZSBoYXZlIE5PVEhJTkcgc2hvd25cbiAgICAgICAgICAgICAgICB3aW5kb3dzQ29udGFpbmVyLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPVwiZXJyb3Itc3RhdGVcIiBzdHlsZT1cInBhZGRpbmc6IDIwcHg7IGNvbG9yOiB2YXIoLS1lcnJvci1jb2xvciwgcmVkKTsgdGV4dC1hbGlnbjogY2VudGVyO1wiPlxuICAgICAgICAgICAgICAgICAgICBGYWlsZWQgdG8gbG9hZCB0YWJzOiAke2JnUmVzLmVycm9yID8/IFwiVW5rbm93biBlcnJvclwifS48YnI+XG4gICAgICAgICAgICAgICAgICAgIFBsZWFzZSByZWxvYWQgdGhlIGV4dGVuc2lvbiBvciBjaGVjayBwZXJtaXNzaW9ucy5cbiAgICAgICAgICAgICAgICA8L2Rpdj5gO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3IgbG9hZGluZyBzdGF0ZTpcIiwgZSk7XG4gICAgfVxuICB9O1xuXG4gIC8vIFN0YXJ0IGJvdGggY29uY3VycmVudGx5XG4gIGF3YWl0IFByb21pc2UuYWxsKFtmYXN0TG9hZCgpLCBiZ0xvYWQoKV0pO1xufTtcblxuY29uc3QgZ2V0U2VsZWN0ZWRTb3J0aW5nID0gKCk6IFNvcnRpbmdTdHJhdGVneVtdID0+IHtcbiAgICAvLyBSZWFkIGZyb20gRE9NIHRvIGdldCBjdXJyZW50IG9yZGVyIG9mIGFjdGl2ZSBzdHJhdGVnaWVzXG4gICAgcmV0dXJuIEFycmF5LmZyb20oYWN0aXZlU3RyYXRlZ2llc0xpc3QuY2hpbGRyZW4pXG4gICAgICAgIC5tYXAocm93ID0+IChyb3cgYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXQuaWQgYXMgU29ydGluZ1N0cmF0ZWd5KTtcbn07XG5cbi8vIEFkZCBsaXN0ZW5lciBmb3Igc2VsZWN0XG5hZGRTdHJhdGVneVNlbGVjdC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBhc3luYyAoZSkgPT4ge1xuICAgIGNvbnN0IHNlbGVjdCA9IGUudGFyZ2V0IGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgIGNvbnN0IGlkID0gc2VsZWN0LnZhbHVlO1xuICAgIGlmIChpZCkge1xuICAgICAgICBhd2FpdCB0b2dnbGVTdHJhdGVneShpZCwgdHJ1ZSk7XG4gICAgICAgIHNlbGVjdC52YWx1ZSA9IFwiXCI7IC8vIFJlc2V0IHRvIHBsYWNlaG9sZGVyXG4gICAgfVxufSk7XG5cbmNvbnN0IHRyaWdnZXJHcm91cCA9IGFzeW5jIChzZWxlY3Rpb24/OiBHcm91cGluZ1NlbGVjdGlvbikgPT4ge1xuICAgIGxvZ0luZm8oXCJUcmlnZ2VyaW5nIGdyb3VwaW5nXCIsIHsgc2VsZWN0aW9uIH0pO1xuICAgIHNob3dMb2FkaW5nKFwiQXBwbHlpbmcgU3RyYXRlZ3kuLi5cIik7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgc29ydGluZyA9IGdldFNlbGVjdGVkU29ydGluZygpO1xuICAgICAgICBhd2FpdCBhcHBseUdyb3VwaW5nKHsgc2VsZWN0aW9uLCBzb3J0aW5nIH0pO1xuICAgICAgICBhd2FpdCBsb2FkU3RhdGUoKTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgICBoaWRlTG9hZGluZygpO1xuICAgIH1cbn07XG5cbmNocm9tZS5ydW50aW1lLm9uTWVzc2FnZS5hZGRMaXN0ZW5lcigobWVzc2FnZSkgPT4ge1xuICAgIGlmIChtZXNzYWdlLnR5cGUgPT09ICdncm91cGluZ1Byb2dyZXNzJykge1xuICAgICAgICBjb25zdCB7IGNvbXBsZXRlZCwgdG90YWwgfSA9IG1lc3NhZ2UucGF5bG9hZDtcbiAgICAgICAgdXBkYXRlUHJvZ3Jlc3MoY29tcGxldGVkLCB0b3RhbCk7XG4gICAgfVxufSk7XG5cbi8vIExpc3RlbmVyc1xuc2VsZWN0QWxsQ2hlY2tib3guYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCAoZSkgPT4ge1xuICAgIGNvbnN0IHRhcmdldFN0YXRlID0gKGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLmNoZWNrZWQ7XG4gICAgaWYgKHRhcmdldFN0YXRlKSB7XG4gICAgICAgIC8vIFNlbGVjdCBBbGxcbiAgICAgICAgd2luZG93U3RhdGUuZm9yRWFjaCh3aW4gPT4ge1xuICAgICAgICAgICAgd2luLnRhYnMuZm9yRWFjaCh0YWIgPT4gc2VsZWN0ZWRUYWJzLmFkZCh0YWIuaWQpKTtcbiAgICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgLy8gRGVzZWxlY3QgQWxsXG4gICAgICAgIHNlbGVjdGVkVGFicy5jbGVhcigpO1xuICAgIH1cbiAgICByZW5kZXJUcmVlKCk7XG59KTtcblxuYnRuQXBwbHk/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgbG9nSW5mbyhcIkFwcGx5IGJ1dHRvbiBjbGlja2VkXCIsIHsgc2VsZWN0ZWRDb3VudDogc2VsZWN0ZWRUYWJzLnNpemUgfSk7XG4gICAgdHJpZ2dlckdyb3VwKHsgdGFiSWRzOiBBcnJheS5mcm9tKHNlbGVjdGVkVGFicykgfSk7XG59KTtcblxuYnRuVW5ncm91cC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICBpZiAoY29uZmlybShgVW5ncm91cCAke3NlbGVjdGVkVGFicy5zaXplfSB0YWJzP2ApKSB7XG4gICAgICBsb2dJbmZvKFwiVW5ncm91cGluZyB0YWJzXCIsIHsgY291bnQ6IHNlbGVjdGVkVGFicy5zaXplIH0pO1xuICAgICAgYXdhaXQgY2hyb21lLnRhYnMudW5ncm91cChBcnJheS5mcm9tKHNlbGVjdGVkVGFicykpO1xuICAgICAgYXdhaXQgbG9hZFN0YXRlKCk7XG4gIH1cbn0pO1xuYnRuTWVyZ2UuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgaWYgKGNvbmZpcm0oYE1lcmdlICR7c2VsZWN0ZWRUYWJzLnNpemV9IHRhYnMgaW50byBvbmUgZ3JvdXA/YCkpIHtcbiAgICAgIGxvZ0luZm8oXCJNZXJnaW5nIHRhYnNcIiwgeyBjb3VudDogc2VsZWN0ZWRUYWJzLnNpemUgfSk7XG4gICAgICBjb25zdCByZXMgPSBhd2FpdCBzZW5kTWVzc2FnZShcIm1lcmdlU2VsZWN0aW9uXCIsIHsgdGFiSWRzOiBBcnJheS5mcm9tKHNlbGVjdGVkVGFicykgfSk7XG4gICAgICBpZiAoIXJlcy5vaykgYWxlcnQoXCJNZXJnZSBmYWlsZWQ6IFwiICsgcmVzLmVycm9yKTtcbiAgICAgIGVsc2UgYXdhaXQgbG9hZFN0YXRlKCk7XG4gIH1cbn0pO1xuYnRuU3BsaXQuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgaWYgKGNvbmZpcm0oYFNwbGl0ICR7c2VsZWN0ZWRUYWJzLnNpemV9IHRhYnMgaW50byBhIG5ldyB3aW5kb3c/YCkpIHtcbiAgICAgIGxvZ0luZm8oXCJTcGxpdHRpbmcgdGFic1wiLCB7IGNvdW50OiBzZWxlY3RlZFRhYnMuc2l6ZSB9KTtcbiAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHNlbmRNZXNzYWdlKFwic3BsaXRTZWxlY3Rpb25cIiwgeyB0YWJJZHM6IEFycmF5LmZyb20oc2VsZWN0ZWRUYWJzKSB9KTtcbiAgICAgIGlmICghcmVzLm9rKSBhbGVydChcIlNwbGl0IGZhaWxlZDogXCIgKyByZXMuZXJyb3IpO1xuICAgICAgZWxzZSBhd2FpdCBsb2FkU3RhdGUoKTtcbiAgfVxufSk7XG5cbmJ0bkV4cGFuZEFsbD8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICB3aW5kb3dTdGF0ZS5mb3JFYWNoKHdpbiA9PiB7XG4gICAgICAgIGV4cGFuZGVkTm9kZXMuYWRkKGB3LSR7d2luLmlkfWApO1xuICAgICAgICB3aW4udGFicy5mb3JFYWNoKHRhYiA9PiB7XG4gICAgICAgICAgICBpZiAodGFiLmdyb3VwTGFiZWwpIHtcbiAgICAgICAgICAgICAgICAgZXhwYW5kZWROb2Rlcy5hZGQoYHctJHt3aW4uaWR9LWctJHt0YWIuZ3JvdXBMYWJlbH1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfSk7XG4gICAgcmVuZGVyVHJlZSgpO1xufSk7XG5cbmJ0bkNvbGxhcHNlQWxsPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIGV4cGFuZGVkTm9kZXMuY2xlYXIoKTtcbiAgICByZW5kZXJUcmVlKCk7XG59KTtcblxuXG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0blVuZG9cIik/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIGxvZ0luZm8oXCJVbmRvIGNsaWNrZWRcIik7XG4gIGNvbnN0IHJlcyA9IGF3YWl0IHNlbmRNZXNzYWdlKFwidW5kb1wiKTtcbiAgaWYgKCFyZXMub2spIGFsZXJ0KFwiVW5kbyBmYWlsZWQ6IFwiICsgcmVzLmVycm9yKTtcbn0pO1xuXG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0blNhdmVTdGF0ZVwiKT8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgY29uc3QgbmFtZSA9IHByb21wdChcIkVudGVyIGEgbmFtZSBmb3IgdGhpcyBzdGF0ZTpcIik7XG4gIGlmIChuYW1lKSB7XG4gICAgbG9nSW5mbyhcIlNhdmluZyBzdGF0ZVwiLCB7IG5hbWUgfSk7XG4gICAgY29uc3QgcmVzID0gYXdhaXQgc2VuZE1lc3NhZ2UoXCJzYXZlU3RhdGVcIiwgeyBuYW1lIH0pO1xuICAgIGlmICghcmVzLm9rKSBhbGVydChcIlNhdmUgZmFpbGVkOiBcIiArIHJlcy5lcnJvcik7XG4gIH1cbn0pO1xuXG5jb25zdCBsb2FkU3RhdGVEaWFsb2cgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImxvYWRTdGF0ZURpYWxvZ1wiKSBhcyBIVE1MRGlhbG9nRWxlbWVudDtcbmNvbnN0IHNhdmVkU3RhdGVMaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzYXZlZFN0YXRlTGlzdFwiKSBhcyBIVE1MRWxlbWVudDtcblxuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5Mb2FkU3RhdGVcIik/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIGxvZ0luZm8oXCJPcGVuaW5nIExvYWQgU3RhdGUgZGlhbG9nXCIpO1xuICBjb25zdCByZXMgPSBhd2FpdCBzZW5kTWVzc2FnZTxTYXZlZFN0YXRlW10+KFwiZ2V0U2F2ZWRTdGF0ZXNcIik7XG4gIGlmIChyZXMub2sgJiYgcmVzLmRhdGEpIHtcbiAgICBzYXZlZFN0YXRlTGlzdC5pbm5lckhUTUwgPSBcIlwiO1xuICAgIHJlcy5kYXRhLmZvckVhY2goKHN0YXRlKSA9PiB7XG4gICAgICBjb25zdCBsaSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJsaVwiKTtcbiAgICAgIGxpLnN0eWxlLmRpc3BsYXkgPSBcImZsZXhcIjtcbiAgICAgIGxpLnN0eWxlLmp1c3RpZnlDb250ZW50ID0gXCJzcGFjZS1iZXR3ZWVuXCI7XG4gICAgICBsaS5zdHlsZS5wYWRkaW5nID0gXCI4cHhcIjtcbiAgICAgIGxpLnN0eWxlLmJvcmRlckJvdHRvbSA9IFwiMXB4IHNvbGlkIHZhcigtLWJvcmRlci1jb2xvcilcIjtcblxuICAgICAgY29uc3Qgc3BhbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICAgICAgc3Bhbi50ZXh0Q29udGVudCA9IGAke3N0YXRlLm5hbWV9ICgke25ldyBEYXRlKHN0YXRlLnRpbWVzdGFtcCkudG9Mb2NhbGVTdHJpbmcoKX0pYDtcbiAgICAgIHNwYW4uc3R5bGUuY3Vyc29yID0gXCJwb2ludGVyXCI7XG4gICAgICBzcGFuLm9uY2xpY2sgPSBhc3luYyAoKSA9PiB7XG4gICAgICAgIGlmIChjb25maXJtKGBMb2FkIHN0YXRlIFwiJHtzdGF0ZS5uYW1lfVwiP2ApKSB7XG4gICAgICAgICAgbG9nSW5mbyhcIlJlc3RvcmluZyBzdGF0ZVwiLCB7IG5hbWU6IHN0YXRlLm5hbWUgfSk7XG4gICAgICAgICAgY29uc3QgciA9IGF3YWl0IHNlbmRNZXNzYWdlKFwicmVzdG9yZVN0YXRlXCIsIHsgc3RhdGUgfSk7XG4gICAgICAgICAgaWYgKHIub2spIHtcbiAgICAgICAgICAgICAgbG9hZFN0YXRlRGlhbG9nLmNsb3NlKCk7XG4gICAgICAgICAgICAgIHdpbmRvdy5jbG9zZSgpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGFsZXJ0KFwiUmVzdG9yZSBmYWlsZWQ6IFwiICsgci5lcnJvcik7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9O1xuXG4gICAgICBjb25zdCBkZWxCdG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICAgICAgZGVsQnRuLnRleHRDb250ZW50ID0gXCJEZWxldGVcIjtcbiAgICAgIGRlbEJ0bi5zdHlsZS5tYXJnaW5MZWZ0ID0gXCI4cHhcIjtcbiAgICAgIGRlbEJ0bi5zdHlsZS5iYWNrZ3JvdW5kID0gXCJ0cmFuc3BhcmVudFwiO1xuICAgICAgZGVsQnRuLnN0eWxlLmNvbG9yID0gXCJ2YXIoLS10ZXh0LWNvbG9yKVwiO1xuICAgICAgZGVsQnRuLnN0eWxlLmJvcmRlciA9IFwiMXB4IHNvbGlkIHZhcigtLWJvcmRlci1jb2xvcilcIjtcbiAgICAgIGRlbEJ0bi5zdHlsZS5ib3JkZXJSYWRpdXMgPSBcIjRweFwiO1xuICAgICAgZGVsQnRuLnN0eWxlLnBhZGRpbmcgPSBcIjJweCA2cHhcIjtcbiAgICAgIGRlbEJ0bi5vbmNsaWNrID0gYXN5bmMgKGUpID0+IHtcbiAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgIGlmIChjb25maXJtKGBEZWxldGUgc3RhdGUgXCIke3N0YXRlLm5hbWV9XCI/YCkpIHtcbiAgICAgICAgICAgICAgYXdhaXQgc2VuZE1lc3NhZ2UoXCJkZWxldGVTYXZlZFN0YXRlXCIsIHsgbmFtZTogc3RhdGUubmFtZSB9KTtcbiAgICAgICAgICAgICAgbGkucmVtb3ZlKCk7XG4gICAgICAgICAgfVxuICAgICAgfTtcblxuICAgICAgbGkuYXBwZW5kQ2hpbGQoc3Bhbik7XG4gICAgICBsaS5hcHBlbmRDaGlsZChkZWxCdG4pO1xuICAgICAgc2F2ZWRTdGF0ZUxpc3QuYXBwZW5kQ2hpbGQobGkpO1xuICAgIH0pO1xuICAgIGxvYWRTdGF0ZURpYWxvZy5zaG93TW9kYWwoKTtcbiAgfSBlbHNlIHtcbiAgICAgIGFsZXJ0KFwiRmFpbGVkIHRvIGxvYWQgc3RhdGVzOiBcIiArIHJlcy5lcnJvcik7XG4gIH1cbn0pO1xuXG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0bkNsb3NlTG9hZFN0YXRlXCIpPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIGxvYWRTdGF0ZURpYWxvZy5jbG9zZSgpO1xufSk7XG5cbnNlYXJjaElucHV0LmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCByZW5kZXJUcmVlKTtcblxuLy8gQXV0by1yZWZyZXNoXG5jaHJvbWUudGFicy5vblVwZGF0ZWQuYWRkTGlzdGVuZXIoKCkgPT4gbG9hZFN0YXRlKCkpO1xuY2hyb21lLnRhYnMub25SZW1vdmVkLmFkZExpc3RlbmVyKCgpID0+IGxvYWRTdGF0ZSgpKTtcbmNocm9tZS53aW5kb3dzLm9uUmVtb3ZlZC5hZGRMaXN0ZW5lcigoKSA9PiBsb2FkU3RhdGUoKSk7XG5cbi8vIC0tLSBUaGVtZSBMb2dpYyAtLS1cbmNvbnN0IGJ0blRoZW1lID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5UaGVtZVwiKTtcbmNvbnN0IGljb25TdW4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImljb25TdW5cIik7XG5jb25zdCBpY29uTW9vbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaWNvbk1vb25cIik7XG5cbmNvbnN0IGFwcGx5VGhlbWUgPSAodGhlbWU6ICdsaWdodCcgfCAnZGFyaycsIHNhdmUgPSBmYWxzZSkgPT4ge1xuICAgIGlmICh0aGVtZSA9PT0gJ2xpZ2h0Jykge1xuICAgICAgICBkb2N1bWVudC5ib2R5LmNsYXNzTGlzdC5hZGQoJ2xpZ2h0LW1vZGUnKTtcbiAgICAgICAgaWYgKGljb25TdW4pIGljb25TdW4uc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG4gICAgICAgIGlmIChpY29uTW9vbikgaWNvbk1vb24uc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICB9IGVsc2Uge1xuICAgICAgICBkb2N1bWVudC5ib2R5LmNsYXNzTGlzdC5yZW1vdmUoJ2xpZ2h0LW1vZGUnKTtcbiAgICAgICAgaWYgKGljb25TdW4pIGljb25TdW4uc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgaWYgKGljb25Nb29uKSBpY29uTW9vbi5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcbiAgICB9XG5cbiAgICAvLyBTeW5jIHdpdGggUHJlZmVyZW5jZXNcbiAgICBpZiAoc2F2ZSkge1xuICAgICAgICAvLyBXZSB1c2Ugc2F2ZVByZWZlcmVuY2VzIHdoaWNoIGNhbGxzIHRoZSBiYWNrZ3JvdW5kIHRvIHN0b3JlIGl0XG4gICAgICAgIGxvZ0luZm8oXCJBcHBseWluZyB0aGVtZVwiLCB7IHRoZW1lIH0pO1xuICAgICAgICBsb2NhbFByZWZlcmVuY2VzTW9kaWZpZWRUaW1lID0gRGF0ZS5ub3coKTtcbiAgICAgICAgc2VuZE1lc3NhZ2UoXCJzYXZlUHJlZmVyZW5jZXNcIiwgeyB0aGVtZSB9KTtcbiAgICB9XG59O1xuXG4vLyBJbml0aWFsIGxvYWQgZmFsbGJhY2sgKGJlZm9yZSBsb2FkU3RhdGUgbG9hZHMgcHJlZnMpXG5jb25zdCBzdG9yZWRUaGVtZSA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKCd0aGVtZScpIGFzICdsaWdodCcgfCAnZGFyayc7XG4vLyBJZiB3ZSBoYXZlIGEgbG9jYWwgb3ZlcnJpZGUsIHVzZSBpdCB0ZW1wb3JhcmlseSwgYnV0IGxvYWRTdGF0ZSB3aWxsIGF1dGhvcml0YXRpdmUgY2hlY2sgcHJlZnNcbmlmIChzdG9yZWRUaGVtZSkgYXBwbHlUaGVtZShzdG9yZWRUaGVtZSwgZmFsc2UpO1xuXG5idG5UaGVtZT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgY29uc3QgaXNMaWdodCA9IGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LmNvbnRhaW5zKCdsaWdodC1tb2RlJyk7XG4gICAgY29uc3QgbmV3VGhlbWUgPSBpc0xpZ2h0ID8gJ2RhcmsnIDogJ2xpZ2h0JztcbiAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgndGhlbWUnLCBuZXdUaGVtZSk7IC8vIEtlZXAgbG9jYWwgY29weSBmb3IgZmFzdCBib290XG4gICAgYXBwbHlUaGVtZShuZXdUaGVtZSwgdHJ1ZSk7XG59KTtcblxuLy8gLS0tIFNldHRpbmdzIExvZ2ljIC0tLVxuY29uc3Qgc2V0dGluZ3NEaWFsb2cgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNldHRpbmdzRGlhbG9nXCIpIGFzIEhUTUxEaWFsb2dFbGVtZW50O1xuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5TZXR0aW5nc1wiKT8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXR0aW5nc0RpYWxvZy5zaG93TW9kYWwoKTtcbn0pO1xuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5DbG9zZVNldHRpbmdzXCIpPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldHRpbmdzRGlhbG9nLmNsb3NlKCk7XG59KTtcblxuY29uc3QgbG9nTGV2ZWxTZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImxvZ0xldmVsU2VsZWN0XCIpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xubG9nTGV2ZWxTZWxlY3Q/LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgYXN5bmMgKCkgPT4ge1xuICAgIGNvbnN0IG5ld0xldmVsID0gbG9nTGV2ZWxTZWxlY3QudmFsdWUgYXMgTG9nTGV2ZWw7XG4gICAgaWYgKHByZWZlcmVuY2VzKSB7XG4gICAgICAgIHByZWZlcmVuY2VzLmxvZ0xldmVsID0gbmV3TGV2ZWw7XG4gICAgICAgIC8vIFVwZGF0ZSBsb2NhbCBsb2dnZXIgaW1tZWRpYXRlbHlcbiAgICAgICAgc2V0TG9nZ2VyUHJlZmVyZW5jZXMocHJlZmVyZW5jZXMpO1xuICAgICAgICAvLyBQZXJzaXN0XG4gICAgICAgIGxvY2FsUHJlZmVyZW5jZXNNb2RpZmllZFRpbWUgPSBEYXRlLm5vdygpO1xuICAgICAgICBhd2FpdCBzZW5kTWVzc2FnZShcInNhdmVQcmVmZXJlbmNlc1wiLCB7IGxvZ0xldmVsOiBuZXdMZXZlbCB9KTtcbiAgICAgICAgbG9nRGVidWcoXCJMb2cgbGV2ZWwgdXBkYXRlZFwiLCB7IGxldmVsOiBuZXdMZXZlbCB9KTtcbiAgICB9XG59KTtcblxuLy8gLS0tIFBpbiAmIFJlc2l6ZSBMb2dpYyAtLS1cbmNvbnN0IGJ0blBpbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuUGluXCIpO1xuYnRuUGluPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICBjb25zdCB1cmwgPSBjaHJvbWUucnVudGltZS5nZXRVUkwoXCJ1aS9wb3B1cC5odG1sXCIpO1xuICBhd2FpdCBjaHJvbWUud2luZG93cy5jcmVhdGUoe1xuICAgIHVybCxcbiAgICB0eXBlOiBcInBvcHVwXCIsXG4gICAgd2lkdGg6IGRvY3VtZW50LmJvZHkub2Zmc2V0V2lkdGgsXG4gICAgaGVpZ2h0OiBkb2N1bWVudC5ib2R5Lm9mZnNldEhlaWdodFxuICB9KTtcbiAgd2luZG93LmNsb3NlKCk7XG59KTtcblxuY29uc3QgcmVzaXplSGFuZGxlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyZXNpemVIYW5kbGVcIik7XG5pZiAocmVzaXplSGFuZGxlKSB7XG4gIGNvbnN0IHNhdmVTaXplID0gKHc6IG51bWJlciwgaDogbnVtYmVyKSA9PiB7XG4gICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShcInBvcHVwU2l6ZVwiLCBKU09OLnN0cmluZ2lmeSh7IHdpZHRoOiB3LCBoZWlnaHQ6IGggfSkpO1xuICB9O1xuXG4gIHJlc2l6ZUhhbmRsZS5hZGRFdmVudExpc3RlbmVyKFwibW91c2Vkb3duXCIsIChlKSA9PiB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBjb25zdCBzdGFydFggPSBlLmNsaWVudFg7XG4gICAgICBjb25zdCBzdGFydFkgPSBlLmNsaWVudFk7XG4gICAgICBjb25zdCBzdGFydFdpZHRoID0gZG9jdW1lbnQuYm9keS5vZmZzZXRXaWR0aDtcbiAgICAgIGNvbnN0IHN0YXJ0SGVpZ2h0ID0gZG9jdW1lbnQuYm9keS5vZmZzZXRIZWlnaHQ7XG5cbiAgICAgIGNvbnN0IG9uTW91c2VNb3ZlID0gKGV2OiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICAgICAgY29uc3QgbmV3V2lkdGggPSBNYXRoLm1heCg1MDAsIHN0YXJ0V2lkdGggKyAoZXYuY2xpZW50WCAtIHN0YXJ0WCkpO1xuICAgICAgICAgIGNvbnN0IG5ld0hlaWdodCA9IE1hdGgubWF4KDUwMCwgc3RhcnRIZWlnaHQgKyAoZXYuY2xpZW50WSAtIHN0YXJ0WSkpO1xuICAgICAgICAgIGRvY3VtZW50LmJvZHkuc3R5bGUud2lkdGggPSBgJHtuZXdXaWR0aH1weGA7XG4gICAgICAgICAgZG9jdW1lbnQuYm9keS5zdHlsZS5oZWlnaHQgPSBgJHtuZXdIZWlnaHR9cHhgO1xuICAgICAgfTtcblxuICAgICAgY29uc3Qgb25Nb3VzZVVwID0gKGV2OiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICAgICAgIGNvbnN0IG5ld1dpZHRoID0gTWF0aC5tYXgoNTAwLCBzdGFydFdpZHRoICsgKGV2LmNsaWVudFggLSBzdGFydFgpKTtcbiAgICAgICAgICAgY29uc3QgbmV3SGVpZ2h0ID0gTWF0aC5tYXgoNTAwLCBzdGFydEhlaWdodCArIChldi5jbGllbnRZIC0gc3RhcnRZKSk7XG4gICAgICAgICAgIHNhdmVTaXplKG5ld1dpZHRoLCBuZXdIZWlnaHQpO1xuICAgICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwibW91c2Vtb3ZlXCIsIG9uTW91c2VNb3ZlKTtcbiAgICAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1vdXNldXBcIiwgb25Nb3VzZVVwKTtcbiAgICAgIH07XG5cbiAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZW1vdmVcIiwgb25Nb3VzZU1vdmUpO1xuICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNldXBcIiwgb25Nb3VzZVVwKTtcbiAgfSk7XG59XG5cbmNvbnN0IGFkanVzdEZvcldpbmRvd1R5cGUgPSBhc3luYyAoKSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3Qgd2luID0gYXdhaXQgY2hyb21lLndpbmRvd3MuZ2V0Q3VycmVudCgpO1xuICAgIGlmICh3aW4udHlwZSA9PT0gXCJwb3B1cFwiKSB7XG4gICAgICAgaWYgKGJ0blBpbikgYnRuUGluLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICAgICAvLyBFbmFibGUgcmVzaXplIGhhbmRsZSBpbiBwaW5uZWQgbW9kZSBpZiBpdCB3YXMgaGlkZGVuXG4gICAgICAgaWYgKHJlc2l6ZUhhbmRsZSkgcmVzaXplSGFuZGxlLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gICAgICAgZG9jdW1lbnQuYm9keS5zdHlsZS53aWR0aCA9IFwiMTAwJVwiO1xuICAgICAgIGRvY3VtZW50LmJvZHkuc3R5bGUuaGVpZ2h0ID0gXCIxMDAlXCI7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgLy8gRGlzYWJsZSByZXNpemUgaGFuZGxlIGluIGRvY2tlZCBtb2RlXG4gICAgICAgIGlmIChyZXNpemVIYW5kbGUpIHJlc2l6ZUhhbmRsZS5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgICAgIC8vIENsZWFyIGFueSBwcmV2aW91cyBzaXplIG92ZXJyaWRlc1xuICAgICAgICBkb2N1bWVudC5ib2R5LnN0eWxlLndpZHRoID0gXCJcIjtcbiAgICAgICAgZG9jdW1lbnQuYm9keS5zdHlsZS5oZWlnaHQgPSBcIlwiO1xuICAgIH1cbiAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yIGNoZWNraW5nIHdpbmRvdyB0eXBlOlwiLCBlKTtcbiAgfVxufTtcblxuYWRqdXN0Rm9yV2luZG93VHlwZSgpO1xubG9hZFN0YXRlKCkuY2F0Y2goZSA9PiBjb25zb2xlLmVycm9yKFwiTG9hZCBzdGF0ZSBmYWlsZWRcIiwgZSkpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUVPLElBQU0sZUFBZSxDQUFDLFFBQTZDO0FBQ3hFLE1BQUksQ0FBQyxJQUFJLE1BQU0sSUFBSSxPQUFPLE9BQU8sS0FBSyxlQUFlLENBQUMsSUFBSSxTQUFVLFFBQU87QUFDM0UsU0FBTztBQUFBLElBQ0wsSUFBSSxJQUFJO0FBQUEsSUFDUixVQUFVLElBQUk7QUFBQSxJQUNkLE9BQU8sSUFBSSxTQUFTO0FBQUEsSUFDcEIsS0FBSyxJQUFJLGNBQWMsSUFBSSxPQUFPO0FBQUEsSUFDbEMsUUFBUSxRQUFRLElBQUksTUFBTTtBQUFBLElBQzFCLGNBQWMsSUFBSTtBQUFBLElBQ2xCLGFBQWEsSUFBSSxlQUFl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O0FBQ2pFLFlBQU0sWUFBWSxLQUFLLElBQUksS0FBSyxlQUFlLEdBQUcsVUFBVSxPQUFPO0FBQ25FLGVBQVMsVUFBVSxTQUFTO0FBQzVCLGVBQVMsb0JBQW9CLGFBQWEsV0FBVztBQUNyRCxlQUFTLG9CQUFvQixXQUFXLFNBQVM7QUFBQSxJQUN0RDtBQUVBLGFBQVMsaUJBQWlCLGFBQWEsV0FBVztBQUNsRCxhQUFTLGlCQUFpQixXQUFXLFNBQVM7QUFBQSxFQUNsRCxDQUFDO0FBQ0g7QUFFQSxJQUFNLHNCQUFzQixZQUFZO0FBQ3RDLE1BQUk7QUFDRixVQUFNLE1BQU0sTUFBTSxPQUFPLFFBQVEsV0FBVztBQUM1QyxRQUFJLElBQUksU0FBUyxTQUFTO0FBQ3ZCLFVBQUksT0FBUSxRQUFPLE1BQU0sVUFBVTtBQUVuQyxVQUFJLGFBQWMsY0FBYSxNQUFNLFVBQVU7QUFDL0MsZUFBUyxLQUFLLE1BQU0sUUFBUTtBQUM1QixlQUFTLEtBQUssTUFBTSxTQUFTO0FBQUEsSUFDaEMsT0FBTztBQUVILFVBQUksYUFBYyxjQUFhLE1BQU0sVUFBVTtBQUUvQyxlQUFTLEtBQUssTUFBTSxRQUFRO0FBQzVCLGVBQVMsS0FBSyxNQUFNLFNBQVM7QUFBQSxJQUNqQztBQUFBLEVBQ0YsU0FBUyxHQUFHO0FBQ1IsWUFBUSxNQUFNLCtCQUErQixDQUFDO0FBQUEsRUFDbEQ7QUFDRjtBQUVBLG9CQUFvQjtBQUNwQixVQUFVLEVBQUUsTUFBTSxPQUFLLFFBQVEsTUFBTSxxQkFBcUIsQ0FBQyxDQUFDOyIsCiAgIm5hbWVzIjogWyJjdXN0b21TdHJhdGVnaWVzIiwgInByZWZlcmVuY2VzIiwgInRhYnMiLCAid2luZG93IiwgImxpc3QiXQp9Cg==
