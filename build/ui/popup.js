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
var RECEIVING_END_ERROR = "Could not establish connection. Receiving end does not exist.";
var sendMessageOnce = async (type, payload) => {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { ok: false, error: "No response from background" });
    });
  });
};
var sendMessage = async (type, payload) => {
  const firstAttempt = await sendMessageOnce(type, payload);
  if (firstAttempt.ok || firstAttempt.error !== RECEIVING_END_ERROR) {
    if (!firstAttempt.ok && firstAttempt.error) {
      console.error("Runtime error:", firstAttempt.error);
    }
    return firstAttempt;
  }
  await new Promise((resolve) => setTimeout(resolve, 150));
  const retryAttempt = await sendMessageOnce(type, payload);
  if (!retryAttempt.ok && retryAttempt.error) {
    console.error("Runtime error:", retryAttempt.error);
  }
  return retryAttempt;
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
  return sendMessage("applyGrouping", payload);
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
    const result = await applyGrouping({ selection, sorting });
    if (!result?.ok) {
      alert(`Apply failed: ${result?.error ?? "Unknown error"}`);
      return;
    }
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3NoYXJlZC91dGlscy50cyIsICIuLi8uLi9zcmMvc2hhcmVkL3N0cmF0ZWd5UmVnaXN0cnkudHMiLCAiLi4vLi4vc3JjL3NoYXJlZC9sb2dnZXIudHMiLCAiLi4vLi4vc3JjL3NoYXJlZC91cmxDYWNoZS50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9ncm91cGluZ1N0cmF0ZWdpZXMudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvc29ydGluZ1N0cmF0ZWdpZXMudHMiLCAiLi4vLi4vc3JjL3VpL2xvY2FsU3RhdGUudHMiLCAiLi4vLi4vc3JjL3VpL2NvbW1vbi50cyIsICIuLi8uLi9zcmMvdWkvcG9wdXAudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IFByZWZlcmVuY2VzLCBTb3J0aW5nU3RyYXRlZ3ksIFRhYk1ldGFkYXRhIH0gZnJvbSBcIi4vdHlwZXMuanNcIjtcblxuZXhwb3J0IGNvbnN0IG1hcENocm9tZVRhYiA9ICh0YWI6IGNocm9tZS50YWJzLlRhYik6IFRhYk1ldGFkYXRhIHwgbnVsbCA9PiB7XG4gIGlmICghdGFiLmlkIHx8IHRhYi5pZCA9PT0gY2hyb21lLnRhYnMuVEFCX0lEX05PTkUgfHwgIXRhYi53aW5kb3dJZCkgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7XG4gICAgaWQ6IHRhYi5pZCxcbiAgICB3aW5kb3dJZDogdGFiLndpbmRvd0lkLFxuICAgIHRpdGxlOiB0YWIudGl0bGUgfHwgXCJVbnRpdGxlZFwiLFxuICAgIHVybDogdGFiLnBlbmRpbmdVcmwgfHwgdGFiLnVybCB8fCBcImFib3V0OmJsYW5rXCIsXG4gICAgcGlubmVkOiBCb29sZWFuKHRhYi5waW5uZWQpLFxuICAgIGxhc3RBY2Nlc3NlZDogdGFiLmxhc3RBY2Nlc3NlZCxcbiAgICBvcGVuZXJUYWJJZDogdGFiLm9wZW5lclRhYklkID8/IHVuZGVmaW5lZCxcbiAgICBmYXZJY29uVXJsOiB0YWIuZmF2SWNvblVybCxcbiAgICBncm91cElkOiB0YWIuZ3JvdXBJZCxcbiAgICBpbmRleDogdGFiLmluZGV4LFxuICAgIGFjdGl2ZTogdGFiLmFjdGl2ZSxcbiAgICBzdGF0dXM6IHRhYi5zdGF0dXMsXG4gICAgc2VsZWN0ZWQ6IHRhYi5oaWdobGlnaHRlZFxuICB9O1xufTtcblxuZXhwb3J0IGNvbnN0IGdldFN0b3JlZFByZWZlcmVuY2VzID0gYXN5bmMgKCk6IFByb21pc2U8UHJlZmVyZW5jZXMgfCBudWxsPiA9PiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChcInByZWZlcmVuY2VzXCIsIChpdGVtcykgPT4ge1xuICAgICAgcmVzb2x2ZSgoaXRlbXNbXCJwcmVmZXJlbmNlc1wiXSBhcyBQcmVmZXJlbmNlcykgPz8gbnVsbCk7XG4gICAgfSk7XG4gIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IGFzQXJyYXkgPSA8VD4odmFsdWU6IHVua25vd24pOiBUW10gPT4ge1xuICAgIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkgcmV0dXJuIHZhbHVlIGFzIFRbXTtcbiAgICByZXR1cm4gW107XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gZXNjYXBlSHRtbCh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBpZiAoIXRleHQpIHJldHVybiAnJztcbiAgcmV0dXJuIHRleHRcbiAgICAucmVwbGFjZSgvJi9nLCAnJmFtcDsnKVxuICAgIC5yZXBsYWNlKC88L2csICcmbHQ7JylcbiAgICAucmVwbGFjZSgvPi9nLCAnJmd0OycpXG4gICAgLnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKVxuICAgIC5yZXBsYWNlKC8nL2csICcmIzAzOTsnKTtcbn1cbiIsICJpbXBvcnQgeyBDdXN0b21TdHJhdGVneSwgU29ydGluZ1N0cmF0ZWd5IH0gZnJvbSBcIi4vdHlwZXMuanNcIjtcblxuZXhwb3J0IGludGVyZmFjZSBTdHJhdGVneURlZmluaXRpb24ge1xuICAgIGlkOiBTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmc7XG4gICAgbGFiZWw6IHN0cmluZztcbiAgICBpc0dyb3VwaW5nOiBib29sZWFuO1xuICAgIGlzU29ydGluZzogYm9vbGVhbjtcbiAgICB0YWdzPzogc3RyaW5nW107XG4gICAgYXV0b1J1bj86IGJvb2xlYW47XG4gICAgaXNDdXN0b20/OiBib29sZWFuO1xufVxuXG4vLyBSZXN0b3JlZCBzdHJhdGVnaWVzIG1hdGNoaW5nIGJhY2tncm91bmQgY2FwYWJpbGl0aWVzLlxuZXhwb3J0IGNvbnN0IFNUUkFURUdJRVM6IFN0cmF0ZWd5RGVmaW5pdGlvbltdID0gW1xuICAgIHsgaWQ6IFwiZG9tYWluXCIsIGxhYmVsOiBcIkRvbWFpblwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwiZG9tYWluX2Z1bGxcIiwgbGFiZWw6IFwiRnVsbCBEb21haW5cIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInRvcGljXCIsIGxhYmVsOiBcIlRvcGljXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJjb250ZXh0XCIsIGxhYmVsOiBcIkNvbnRleHRcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImxpbmVhZ2VcIiwgbGFiZWw6IFwiTGluZWFnZVwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwicGlubmVkXCIsIGxhYmVsOiBcIlBpbm5lZFwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwicmVjZW5jeVwiLCBsYWJlbDogXCJSZWNlbmN5XCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJhZ2VcIiwgbGFiZWw6IFwiQWdlXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJ1cmxcIiwgbGFiZWw6IFwiVVJMXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJuZXN0aW5nXCIsIGxhYmVsOiBcIk5lc3RpbmdcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInRpdGxlXCIsIGxhYmVsOiBcIlRpdGxlXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG5dO1xuXG5leHBvcnQgY29uc3QgZ2V0U3RyYXRlZ2llcyA9IChjdXN0b21TdHJhdGVnaWVzPzogQ3VzdG9tU3RyYXRlZ3lbXSk6IFN0cmF0ZWd5RGVmaW5pdGlvbltdID0+IHtcbiAgICBpZiAoIWN1c3RvbVN0cmF0ZWdpZXMgfHwgY3VzdG9tU3RyYXRlZ2llcy5sZW5ndGggPT09IDApIHJldHVybiBTVFJBVEVHSUVTO1xuXG4gICAgLy8gQ3VzdG9tIHN0cmF0ZWdpZXMgY2FuIG92ZXJyaWRlIGJ1aWx0LWlucyBpZiBJRHMgbWF0Y2gsIG9yIGFkZCBuZXcgb25lcy5cbiAgICBjb25zdCBjb21iaW5lZCA9IFsuLi5TVFJBVEVHSUVTXTtcblxuICAgIGN1c3RvbVN0cmF0ZWdpZXMuZm9yRWFjaChjdXN0b20gPT4ge1xuICAgICAgICBjb25zdCBleGlzdGluZ0luZGV4ID0gY29tYmluZWQuZmluZEluZGV4KHMgPT4gcy5pZCA9PT0gY3VzdG9tLmlkKTtcblxuICAgICAgICAvLyBEZXRlcm1pbmUgY2FwYWJpbGl0aWVzIGJhc2VkIG9uIHJ1bGVzIHByZXNlbmNlXG4gICAgICAgIGNvbnN0IGhhc0dyb3VwaW5nID0gKGN1c3RvbS5ncm91cGluZ1J1bGVzICYmIGN1c3RvbS5ncm91cGluZ1J1bGVzLmxlbmd0aCA+IDApIHx8IChjdXN0b20ucnVsZXMgJiYgY3VzdG9tLnJ1bGVzLmxlbmd0aCA+IDApIHx8IGZhbHNlO1xuICAgICAgICBjb25zdCBoYXNTb3J0aW5nID0gKGN1c3RvbS5zb3J0aW5nUnVsZXMgJiYgY3VzdG9tLnNvcnRpbmdSdWxlcy5sZW5ndGggPiAwKSB8fCAoY3VzdG9tLnJ1bGVzICYmIGN1c3RvbS5ydWxlcy5sZW5ndGggPiAwKSB8fCBmYWxzZTtcblxuICAgICAgICBjb25zdCB0YWdzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBpZiAoaGFzR3JvdXBpbmcpIHRhZ3MucHVzaChcImdyb3VwXCIpO1xuICAgICAgICBpZiAoaGFzU29ydGluZykgdGFncy5wdXNoKFwic29ydFwiKTtcblxuICAgICAgICBjb25zdCBkZWZpbml0aW9uOiBTdHJhdGVneURlZmluaXRpb24gPSB7XG4gICAgICAgICAgICBpZDogY3VzdG9tLmlkLFxuICAgICAgICAgICAgbGFiZWw6IGN1c3RvbS5sYWJlbCxcbiAgICAgICAgICAgIGlzR3JvdXBpbmc6IGhhc0dyb3VwaW5nLFxuICAgICAgICAgICAgaXNTb3J0aW5nOiBoYXNTb3J0aW5nLFxuICAgICAgICAgICAgdGFnczogdGFncyxcbiAgICAgICAgICAgIGF1dG9SdW46IGN1c3RvbS5hdXRvUnVuLFxuICAgICAgICAgICAgaXNDdXN0b206IHRydWVcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAoZXhpc3RpbmdJbmRleCAhPT0gLTEpIHtcbiAgICAgICAgICAgIGNvbWJpbmVkW2V4aXN0aW5nSW5kZXhdID0gZGVmaW5pdGlvbjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbWJpbmVkLnB1c2goZGVmaW5pdGlvbik7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBjb21iaW5lZDtcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRTdHJhdGVneSA9IChpZDogU29ydGluZ1N0cmF0ZWd5IHwgc3RyaW5nKTogU3RyYXRlZ3lEZWZpbml0aW9uIHwgdW5kZWZpbmVkID0+IFNUUkFURUdJRVMuZmluZChzID0+IHMuaWQgPT09IGlkKTtcbiIsICJpbXBvcnQgeyBMb2dFbnRyeSwgTG9nTGV2ZWwsIFByZWZlcmVuY2VzIH0gZnJvbSBcIi4vdHlwZXMuanNcIjtcblxuY29uc3QgUFJFRklYID0gXCJbVGFiU29ydGVyXVwiO1xuXG5jb25zdCBMRVZFTF9QUklPUklUWTogUmVjb3JkPExvZ0xldmVsLCBudW1iZXI+ID0ge1xuICBkZWJ1ZzogMCxcbiAgaW5mbzogMSxcbiAgd2FybjogMixcbiAgZXJyb3I6IDMsXG4gIGNyaXRpY2FsOiA0XG59O1xuXG5sZXQgY3VycmVudExldmVsOiBMb2dMZXZlbCA9IFwiaW5mb1wiO1xubGV0IGxvZ3M6IExvZ0VudHJ5W10gPSBbXTtcbmNvbnN0IE1BWF9MT0dTID0gMTAwMDtcbmNvbnN0IFNUT1JBR0VfS0VZID0gXCJzZXNzaW9uTG9nc1wiO1xuXG5jb25zdCBTRU5TSVRJVkVfS0VZUyA9IC9wYXNzd29yZHxzZWNyZXR8dG9rZW58Y3JlZGVudGlhbHxjb29raWV8c2Vzc2lvbnxhdXRob3JpemF0aW9ufCgoYXBpfGFjY2Vzc3xzZWNyZXR8cHJpdmF0ZSlbLV9dP2tleSkvaTtcblxuY29uc3Qgc2FuaXRpemVDb250ZXh0ID0gKGNvbnRleHQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQgPT4ge1xuICAgIGlmICghY29udGV4dCkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB0cnkge1xuICAgICAgICAvLyBEZWVwIGNsb25lIHRvIGVuc3VyZSB3ZSBkb24ndCBtb2RpZnkgdGhlIG9yaWdpbmFsIG9iamVjdCBhbmQgcmVtb3ZlIG5vbi1zZXJpYWxpemFibGUgZGF0YVxuICAgICAgICBjb25zdCBqc29uID0gSlNPTi5zdHJpbmdpZnkoY29udGV4dCk7XG4gICAgICAgIGNvbnN0IG9iaiA9IEpTT04ucGFyc2UoanNvbik7XG5cbiAgICAgICAgY29uc3QgcmVkYWN0ID0gKG86IGFueSkgPT4ge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBvICE9PSAnb2JqZWN0JyB8fCBvID09PSBudWxsKSByZXR1cm47XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGsgaW4gbykge1xuICAgICAgICAgICAgICAgIGlmIChTRU5TSVRJVkVfS0VZUy50ZXN0KGspKSB7XG4gICAgICAgICAgICAgICAgICAgIG9ba10gPSAnW1JFREFDVEVEXSc7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVkYWN0KG9ba10pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgcmVkYWN0KG9iaik7XG4gICAgICAgIHJldHVybiBvYmo7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICByZXR1cm4geyBlcnJvcjogXCJGYWlsZWQgdG8gc2FuaXRpemUgY29udGV4dFwiIH07XG4gICAgfVxufTtcblxuLy8gU2FmZSBjb250ZXh0IGNoZWNrXG5jb25zdCBpc1NlcnZpY2VXb3JrZXIgPSB0eXBlb2Ygc2VsZiAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVvZiAoc2VsZiBhcyBhbnkpLlNlcnZpY2VXb3JrZXJHbG9iYWxTY29wZSAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYgaW5zdGFuY2VvZiAoc2VsZiBhcyBhbnkpLlNlcnZpY2VXb3JrZXJHbG9iYWxTY29wZTtcbmxldCBpc1NhdmluZyA9IGZhbHNlO1xubGV0IHBlbmRpbmdTYXZlID0gZmFsc2U7XG5sZXQgc2F2ZVRpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsO1xuXG5jb25zdCBkb1NhdmUgPSAoKSA9PiB7XG4gICAgaWYgKCFpc1NlcnZpY2VXb3JrZXIgfHwgIWNocm9tZT8uc3RvcmFnZT8uc2Vzc2lvbiB8fCBpc1NhdmluZykge1xuICAgICAgICBwZW5kaW5nU2F2ZSA9IHRydWU7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpc1NhdmluZyA9IHRydWU7XG4gICAgcGVuZGluZ1NhdmUgPSBmYWxzZTtcblxuICAgIGNocm9tZS5zdG9yYWdlLnNlc3Npb24uc2V0KHsgW1NUT1JBR0VfS0VZXTogbG9ncyB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgaXNTYXZpbmcgPSBmYWxzZTtcbiAgICAgICAgaWYgKHBlbmRpbmdTYXZlKSB7XG4gICAgICAgICAgICBzYXZlTG9nc1RvU3RvcmFnZSgpO1xuICAgICAgICB9XG4gICAgfSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBzYXZlIGxvZ3NcIiwgZXJyKTtcbiAgICAgICAgaXNTYXZpbmcgPSBmYWxzZTtcbiAgICB9KTtcbn07XG5cbmNvbnN0IHNhdmVMb2dzVG9TdG9yYWdlID0gKCkgPT4ge1xuICAgIGlmIChzYXZlVGltZXIpIGNsZWFyVGltZW91dChzYXZlVGltZXIpO1xuICAgIHNhdmVUaW1lciA9IHNldFRpbWVvdXQoZG9TYXZlLCAxMDAwKTtcbn07XG5cbmxldCByZXNvbHZlTG9nZ2VyUmVhZHk6ICgpID0+IHZvaWQ7XG5leHBvcnQgY29uc3QgbG9nZ2VyUmVhZHkgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcbiAgICByZXNvbHZlTG9nZ2VyUmVhZHkgPSByZXNvbHZlO1xufSk7XG5cbmV4cG9ydCBjb25zdCBpbml0TG9nZ2VyID0gYXN5bmMgKCkgPT4ge1xuICAgIGlmIChpc1NlcnZpY2VXb3JrZXIgJiYgY2hyb21lPy5zdG9yYWdlPy5zZXNzaW9uKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjaHJvbWUuc3RvcmFnZS5zZXNzaW9uLmdldChTVE9SQUdFX0tFWSk7XG4gICAgICAgICAgICBpZiAocmVzdWx0W1NUT1JBR0VfS0VZXSAmJiBBcnJheS5pc0FycmF5KHJlc3VsdFtTVE9SQUdFX0tFWV0pKSB7XG4gICAgICAgICAgICAgICAgbG9ncyA9IHJlc3VsdFtTVE9SQUdFX0tFWV07XG4gICAgICAgICAgICAgICAgaWYgKGxvZ3MubGVuZ3RoID4gTUFYX0xPR1MpIGxvZ3MgPSBsb2dzLnNsaWNlKDAsIE1BWF9MT0dTKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byByZXN0b3JlIGxvZ3NcIiwgZSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKHJlc29sdmVMb2dnZXJSZWFkeSkgcmVzb2x2ZUxvZ2dlclJlYWR5KCk7XG59O1xuXG5leHBvcnQgY29uc3Qgc2V0TG9nZ2VyUHJlZmVyZW5jZXMgPSAocHJlZnM6IFByZWZlcmVuY2VzKSA9PiB7XG4gIGlmIChwcmVmcy5sb2dMZXZlbCkge1xuICAgIGN1cnJlbnRMZXZlbCA9IHByZWZzLmxvZ0xldmVsO1xuICB9IGVsc2UgaWYgKHByZWZzLmRlYnVnKSB7XG4gICAgY3VycmVudExldmVsID0gXCJkZWJ1Z1wiO1xuICB9IGVsc2Uge1xuICAgIGN1cnJlbnRMZXZlbCA9IFwiaW5mb1wiO1xuICB9XG59O1xuXG5jb25zdCBzaG91bGRMb2cgPSAobGV2ZWw6IExvZ0xldmVsKTogYm9vbGVhbiA9PiB7XG4gIHJldHVybiBMRVZFTF9QUklPUklUWVtsZXZlbF0gPj0gTEVWRUxfUFJJT1JJVFlbY3VycmVudExldmVsXTtcbn07XG5cbmNvbnN0IGZvcm1hdE1lc3NhZ2UgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgcmV0dXJuIGNvbnRleHQgPyBgJHttZXNzYWdlfSA6OiAke0pTT04uc3RyaW5naWZ5KGNvbnRleHQpfWAgOiBtZXNzYWdlO1xufTtcblxuY29uc3QgYWRkTG9nID0gKGxldmVsOiBMb2dMZXZlbCwgbWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgaWYgKHNob3VsZExvZyhsZXZlbCkpIHtcbiAgICAgIGNvbnN0IGVudHJ5OiBMb2dFbnRyeSA9IHtcbiAgICAgICAgICB0aW1lc3RhbXA6IERhdGUubm93KCksXG4gICAgICAgICAgbGV2ZWwsXG4gICAgICAgICAgbWVzc2FnZSxcbiAgICAgICAgICBjb250ZXh0XG4gICAgICB9O1xuXG4gICAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSB7XG4gICAgICAgICAgbG9ncy51bnNoaWZ0KGVudHJ5KTtcbiAgICAgICAgICBpZiAobG9ncy5sZW5ndGggPiBNQVhfTE9HUykge1xuICAgICAgICAgICAgICBsb2dzLnBvcCgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBzYXZlTG9nc1RvU3RvcmFnZSgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBJbiBvdGhlciBjb250ZXh0cywgc2VuZCB0byBTV1xuICAgICAgICAgIGlmIChjaHJvbWU/LnJ1bnRpbWU/LnNlbmRNZXNzYWdlKSB7XG4gICAgICAgICAgICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiAnbG9nRW50cnknLCBwYXlsb2FkOiBlbnRyeSB9KS5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgIC8vIElnbm9yZSBpZiBtZXNzYWdlIGZhaWxzIChlLmcuIGNvbnRleHQgaW52YWxpZGF0ZWQpXG4gICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgfVxuICB9XG59O1xuXG5leHBvcnQgY29uc3QgYWRkTG9nRW50cnkgPSAoZW50cnk6IExvZ0VudHJ5KSA9PiB7XG4gICAgaWYgKGlzU2VydmljZVdvcmtlcikge1xuICAgICAgICAvLyBFbnN1cmUgY29udGV4dCBpcyBzYW5pdGl6ZWQgYmVmb3JlIHN0b3JpbmdcbiAgICAgICAgY29uc3Qgc2FmZUNvbnRleHQgPSBzYW5pdGl6ZUNvbnRleHQoZW50cnkuY29udGV4dCk7XG4gICAgICAgIGNvbnN0IHNhZmVFbnRyeSA9IHsgLi4uZW50cnksIGNvbnRleHQ6IHNhZmVDb250ZXh0IH07XG5cbiAgICAgICAgbG9ncy51bnNoaWZ0KHNhZmVFbnRyeSk7XG4gICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSB7XG4gICAgICAgICAgICBsb2dzLnBvcCgpO1xuICAgICAgICB9XG4gICAgICAgIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG4gICAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGdldExvZ3MgPSAoKSA9PiBbLi4ubG9nc107XG5leHBvcnQgY29uc3QgY2xlYXJMb2dzID0gKCkgPT4ge1xuICAgIGxvZ3MubGVuZ3RoID0gMDtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSBzYXZlTG9nc1RvU3RvcmFnZSgpO1xufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0RlYnVnID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGlmIChzaG91bGRMb2coXCJkZWJ1Z1wiKSkge1xuICAgICAgY29uc3Qgc2FmZUNvbnRleHQgPSBzYW5pdGl6ZUNvbnRleHQoY29udGV4dCk7XG4gICAgICBhZGRMb2coXCJkZWJ1Z1wiLCBtZXNzYWdlLCBzYWZlQ29udGV4dCk7XG4gICAgICBjb25zb2xlLmRlYnVnKGAke1BSRUZJWH0gW0RFQlVHXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgc2FmZUNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nSW5mbyA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBpZiAoc2hvdWxkTG9nKFwiaW5mb1wiKSkge1xuICAgICAgY29uc3Qgc2FmZUNvbnRleHQgPSBzYW5pdGl6ZUNvbnRleHQoY29udGV4dCk7XG4gICAgICBhZGRMb2coXCJpbmZvXCIsIG1lc3NhZ2UsIHNhZmVDb250ZXh0KTtcbiAgICAgIGNvbnNvbGUuaW5mbyhgJHtQUkVGSVh9IFtJTkZPXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgc2FmZUNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nV2FybiA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBpZiAoc2hvdWxkTG9nKFwid2FyblwiKSkge1xuICAgICAgY29uc3Qgc2FmZUNvbnRleHQgPSBzYW5pdGl6ZUNvbnRleHQoY29udGV4dCk7XG4gICAgICBhZGRMb2coXCJ3YXJuXCIsIG1lc3NhZ2UsIHNhZmVDb250ZXh0KTtcbiAgICAgIGNvbnNvbGUud2FybihgJHtQUkVGSVh9IFtXQVJOXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgc2FmZUNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nRXJyb3IgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgaWYgKHNob3VsZExvZyhcImVycm9yXCIpKSB7XG4gICAgICBjb25zdCBzYWZlQ29udGV4dCA9IHNhbml0aXplQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGFkZExvZyhcImVycm9yXCIsIG1lc3NhZ2UsIHNhZmVDb250ZXh0KTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYCR7UFJFRklYfSBbRVJST1JdICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBzYWZlQ29udGV4dCl9YCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBsb2dDcml0aWNhbCA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBpZiAoc2hvdWxkTG9nKFwiY3JpdGljYWxcIikpIHtcbiAgICAgIGNvbnN0IHNhZmVDb250ZXh0ID0gc2FuaXRpemVDb250ZXh0KGNvbnRleHQpO1xuICAgICAgYWRkTG9nKFwiY3JpdGljYWxcIiwgbWVzc2FnZSwgc2FmZUNvbnRleHQpO1xuICAgICAgLy8gQ3JpdGljYWwgbG9ncyB1c2UgZXJyb3IgY29uc29sZSBidXQgd2l0aCBkaXN0aW5jdCBwcmVmaXggYW5kIG1heWJlIHN0eWxpbmcgaWYgc3VwcG9ydGVkXG4gICAgICBjb25zb2xlLmVycm9yKGAke1BSRUZJWH0gW0NSSVRJQ0FMXSBcdUQ4M0RcdURFQTggJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIHNhZmVDb250ZXh0KX1gKTtcbiAgfVxufTtcbiIsICJjb25zdCBob3N0bmFtZUNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcbmNvbnN0IE1BWF9DQUNIRV9TSVpFID0gMTAwMDtcblxuZXhwb3J0IGNvbnN0IGdldEhvc3RuYW1lID0gKHVybDogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gIGlmIChob3N0bmFtZUNhY2hlLmhhcyh1cmwpKSByZXR1cm4gaG9zdG5hbWVDYWNoZS5nZXQodXJsKSE7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBwYXJzZWQgPSBuZXcgVVJMKHVybCk7XG4gICAgY29uc3QgaG9zdG5hbWUgPSBwYXJzZWQuaG9zdG5hbWU7XG5cbiAgICBpZiAoaG9zdG5hbWVDYWNoZS5zaXplID49IE1BWF9DQUNIRV9TSVpFKSBob3N0bmFtZUNhY2hlLmNsZWFyKCk7XG4gICAgaG9zdG5hbWVDYWNoZS5zZXQodXJsLCBob3N0bmFtZSk7XG4gICAgcmV0dXJuIGhvc3RuYW1lO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufTtcbiIsICJpbXBvcnQgeyBHcm91cGluZ1N0cmF0ZWd5LCBTb3J0aW5nU3RyYXRlZ3ksIFRhYkdyb3VwLCBUYWJNZXRhZGF0YSwgQ3VzdG9tU3RyYXRlZ3ksIFN0cmF0ZWd5UnVsZSwgUnVsZUNvbmRpdGlvbiwgR3JvdXBpbmdSdWxlLCBTb3J0aW5nUnVsZSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGdldFN0cmF0ZWdpZXMgfSBmcm9tIFwiLi4vc2hhcmVkL3N0cmF0ZWd5UmVnaXN0cnkuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tIFwiLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5pbXBvcnQgeyBnZXRIb3N0bmFtZSB9IGZyb20gXCIuLi9zaGFyZWQvdXJsQ2FjaGUuanNcIjtcblxubGV0IGN1c3RvbVN0cmF0ZWdpZXM6IEN1c3RvbVN0cmF0ZWd5W10gPSBbXTtcblxuZXhwb3J0IGNvbnN0IHNldEN1c3RvbVN0cmF0ZWdpZXMgPSAoc3RyYXRlZ2llczogQ3VzdG9tU3RyYXRlZ3lbXSkgPT4ge1xuICAgIGN1c3RvbVN0cmF0ZWdpZXMgPSBzdHJhdGVnaWVzO1xufTtcblxuZXhwb3J0IGNvbnN0IGdldEN1c3RvbVN0cmF0ZWdpZXMgPSAoKTogQ3VzdG9tU3RyYXRlZ3lbXSA9PiBjdXN0b21TdHJhdGVnaWVzO1xuXG5jb25zdCBDT0xPUlMgPSBbXCJncmV5XCIsIFwiYmx1ZVwiLCBcInJlZFwiLCBcInllbGxvd1wiLCBcImdyZWVuXCIsIFwicGlua1wiLCBcInB1cnBsZVwiLCBcImN5YW5cIiwgXCJvcmFuZ2VcIl07XG5cbmNvbnN0IHJlZ2V4Q2FjaGUgPSBuZXcgTWFwPHN0cmluZywgUmVnRXhwPigpO1xuXG5leHBvcnQgY29uc3QgZG9tYWluRnJvbVVybCA9ICh1cmw6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGhvc3RuYW1lID0gZ2V0SG9zdG5hbWUodXJsKTtcbiAgaWYgKCFob3N0bmFtZSkgcmV0dXJuIFwidW5rbm93blwiO1xuICByZXR1cm4gaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sIFwiXCIpO1xufTtcblxuZXhwb3J0IGNvbnN0IHN1YmRvbWFpbkZyb21VcmwgPSAodXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBob3N0bmFtZSA9IGdldEhvc3RuYW1lKHVybCk7XG4gIGlmICghaG9zdG5hbWUpIHJldHVybiBcIlwiO1xuXG4gIGNvbnN0IGhvc3QgPSBob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgXCJcIik7XG4gIGNvbnN0IHBhcnRzID0gaG9zdC5zcGxpdCgnLicpO1xuICBpZiAocGFydHMubGVuZ3RoID4gMikge1xuICAgICAgcmV0dXJuIHBhcnRzLnNsaWNlKDAsIHBhcnRzLmxlbmd0aCAtIDIpLmpvaW4oJy4nKTtcbiAgfVxuICByZXR1cm4gXCJcIjtcbn1cblxuY29uc3QgZ2V0TmVzdGVkUHJvcGVydHkgPSAob2JqOiB1bmtub3duLCBwYXRoOiBzdHJpbmcpOiB1bmtub3duID0+IHtcbiAgICBpZiAoIW9iaiB8fCB0eXBlb2Ygb2JqICE9PSAnb2JqZWN0JykgcmV0dXJuIHVuZGVmaW5lZDtcblxuICAgIGlmICghcGF0aC5pbmNsdWRlcygnLicpKSB7XG4gICAgICAgIHJldHVybiAob2JqIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtwYXRoXTtcbiAgICB9XG5cbiAgICBjb25zdCBwYXJ0cyA9IHBhdGguc3BsaXQoJy4nKTtcbiAgICBsZXQgY3VycmVudDogdW5rbm93biA9IG9iajtcblxuICAgIGZvciAoY29uc3Qga2V5IG9mIHBhcnRzKSB7XG4gICAgICAgIGlmICghY3VycmVudCB8fCB0eXBlb2YgY3VycmVudCAhPT0gJ29iamVjdCcpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIGN1cnJlbnQgPSAoY3VycmVudCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilba2V5XTtcbiAgICB9XG5cbiAgICByZXR1cm4gY3VycmVudDtcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRGaWVsZFZhbHVlID0gKHRhYjogVGFiTWV0YWRhdGEsIGZpZWxkOiBzdHJpbmcpOiBhbnkgPT4ge1xuICAgIHN3aXRjaChmaWVsZCkge1xuICAgICAgICBjYXNlICdpZCc6IHJldHVybiB0YWIuaWQ7XG4gICAgICAgIGNhc2UgJ2luZGV4JzogcmV0dXJuIHRhYi5pbmRleDtcbiAgICAgICAgY2FzZSAnd2luZG93SWQnOiByZXR1cm4gdGFiLndpbmRvd0lkO1xuICAgICAgICBjYXNlICdncm91cElkJzogcmV0dXJuIHRhYi5ncm91cElkO1xuICAgICAgICBjYXNlICd0aXRsZSc6IHJldHVybiB0YWIudGl0bGU7XG4gICAgICAgIGNhc2UgJ3VybCc6IHJldHVybiB0YWIudXJsO1xuICAgICAgICBjYXNlICdzdGF0dXMnOiByZXR1cm4gdGFiLnN0YXR1cztcbiAgICAgICAgY2FzZSAnYWN0aXZlJzogcmV0dXJuIHRhYi5hY3RpdmU7XG4gICAgICAgIGNhc2UgJ3NlbGVjdGVkJzogcmV0dXJuIHRhYi5zZWxlY3RlZDtcbiAgICAgICAgY2FzZSAncGlubmVkJzogcmV0dXJuIHRhYi5waW5uZWQ7XG4gICAgICAgIGNhc2UgJ29wZW5lclRhYklkJzogcmV0dXJuIHRhYi5vcGVuZXJUYWJJZDtcbiAgICAgICAgY2FzZSAnbGFzdEFjY2Vzc2VkJzogcmV0dXJuIHRhYi5sYXN0QWNjZXNzZWQ7XG4gICAgICAgIGNhc2UgJ2NvbnRleHQnOiByZXR1cm4gdGFiLmNvbnRleHQ7XG4gICAgICAgIGNhc2UgJ2dlbnJlJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uZ2VucmU7XG4gICAgICAgIGNhc2UgJ3NpdGVOYW1lJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uc2l0ZU5hbWU7XG4gICAgICAgIC8vIERlcml2ZWQgb3IgbWFwcGVkIGZpZWxkc1xuICAgICAgICBjYXNlICdkb21haW4nOiByZXR1cm4gZG9tYWluRnJvbVVybCh0YWIudXJsKTtcbiAgICAgICAgY2FzZSAnc3ViZG9tYWluJzogcmV0dXJuIHN1YmRvbWFpbkZyb21VcmwodGFiLnVybCk7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICByZXR1cm4gZ2V0TmVzdGVkUHJvcGVydHkodGFiLCBmaWVsZCk7XG4gICAgfVxufTtcblxuY29uc3Qgc3RyaXBUbGQgPSAoZG9tYWluOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gZG9tYWluLnJlcGxhY2UoL1xcLihjb218b3JnfGdvdnxuZXR8ZWR1fGlvKSQvaSwgXCJcIik7XG59O1xuXG5leHBvcnQgY29uc3Qgc2VtYW50aWNCdWNrZXQgPSAodGl0bGU6IHN0cmluZywgdXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBrZXkgPSBgJHt0aXRsZX0gJHt1cmx9YC50b0xvd2VyQ2FzZSgpO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiZG9jXCIpIHx8IGtleS5pbmNsdWRlcyhcInJlYWRtZVwiKSB8fCBrZXkuaW5jbHVkZXMoXCJndWlkZVwiKSkgcmV0dXJuIFwiRG9jc1wiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwibWFpbFwiKSB8fCBrZXkuaW5jbHVkZXMoXCJpbmJveFwiKSkgcmV0dXJuIFwiQ2hhdFwiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiZGFzaGJvYXJkXCIpIHx8IGtleS5pbmNsdWRlcyhcImNvbnNvbGVcIikpIHJldHVybiBcIkRhc2hcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImlzc3VlXCIpIHx8IGtleS5pbmNsdWRlcyhcInRpY2tldFwiKSkgcmV0dXJuIFwiVGFza3NcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImRyaXZlXCIpIHx8IGtleS5pbmNsdWRlcyhcInN0b3JhZ2VcIikpIHJldHVybiBcIkZpbGVzXCI7XG4gIHJldHVybiBcIk1pc2NcIjtcbn07XG5cbmV4cG9ydCBjb25zdCBuYXZpZ2F0aW9uS2V5ID0gKHRhYjogVGFiTWV0YWRhdGEpOiBzdHJpbmcgPT4ge1xuICBpZiAodGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gYGNoaWxkLW9mLSR7dGFiLm9wZW5lclRhYklkfWA7XG4gIH1cbiAgcmV0dXJuIGB3aW5kb3ctJHt0YWIud2luZG93SWR9YDtcbn07XG5cbmNvbnN0IGdldFJlY2VuY3lMYWJlbCA9IChsYXN0QWNjZXNzZWQ6IG51bWJlcik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gIGNvbnN0IGRpZmYgPSBub3cgLSBsYXN0QWNjZXNzZWQ7XG4gIGlmIChkaWZmIDwgMzYwMDAwMCkgcmV0dXJuIFwiSnVzdCBub3dcIjsgLy8gMWhcbiAgaWYgKGRpZmYgPCA4NjQwMDAwMCkgcmV0dXJuIFwiVG9kYXlcIjsgLy8gMjRoXG4gIGlmIChkaWZmIDwgMTcyODAwMDAwKSByZXR1cm4gXCJZZXN0ZXJkYXlcIjsgLy8gNDhoXG4gIGlmIChkaWZmIDwgNjA0ODAwMDAwKSByZXR1cm4gXCJUaGlzIFdlZWtcIjsgLy8gN2RcbiAgcmV0dXJuIFwiT2xkZXJcIjtcbn07XG5cbmNvbnN0IGNvbG9yRm9yS2V5ID0gKGtleTogc3RyaW5nLCBvZmZzZXQ6IG51bWJlcik6IHN0cmluZyA9PiBDT0xPUlNbTWF0aC5hYnMoaGFzaENvZGUoa2V5KSArIG9mZnNldCkgJSBDT0xPUlMubGVuZ3RoXTtcblxuY29uc3QgaGFzaENvZGUgPSAodmFsdWU6IHN0cmluZyk6IG51bWJlciA9PiB7XG4gIGxldCBoYXNoID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB2YWx1ZS5sZW5ndGg7IGkgKz0gMSkge1xuICAgIGhhc2ggPSAoaGFzaCA8PCA1KSAtIGhhc2ggKyB2YWx1ZS5jaGFyQ29kZUF0KGkpO1xuICAgIGhhc2ggfD0gMDtcbiAgfVxuICByZXR1cm4gaGFzaDtcbn07XG5cbnR5cGUgTGFiZWxHZW5lcmF0b3IgPSAoZmlyc3RUYWI6IFRhYk1ldGFkYXRhLCB0YWJzOiBUYWJNZXRhZGF0YVtdLCBhbGxUYWJzTWFwOiBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YT4pID0+IHN0cmluZyB8IG51bGw7XG5cbmNvbnN0IGJ1aWx0SW5MYWJlbFN0cmF0ZWdpZXM6IFJlY29yZDxzdHJpbmcsIExhYmVsR2VuZXJhdG9yPiA9IHtcbiAgZG9tYWluOiAoZmlyc3RUYWIsIHRhYnMpID0+IHtcbiAgICBjb25zdCBzaXRlTmFtZXMgPSBuZXcgU2V0KHRhYnMubWFwKHQgPT4gdC5jb250ZXh0RGF0YT8uc2l0ZU5hbWUpLmZpbHRlcihCb29sZWFuKSk7XG4gICAgaWYgKHNpdGVOYW1lcy5zaXplID09PSAxKSB7XG4gICAgICByZXR1cm4gc3RyaXBUbGQoQXJyYXkuZnJvbShzaXRlTmFtZXMpWzBdIGFzIHN0cmluZyk7XG4gICAgfVxuICAgIHJldHVybiBzdHJpcFRsZChkb21haW5Gcm9tVXJsKGZpcnN0VGFiLnVybCkpO1xuICB9LFxuICBkb21haW5fZnVsbDogKGZpcnN0VGFiKSA9PiBkb21haW5Gcm9tVXJsKGZpcnN0VGFiLnVybCksXG4gIHRvcGljOiAoZmlyc3RUYWIpID0+IHNlbWFudGljQnVja2V0KGZpcnN0VGFiLnRpdGxlLCBmaXJzdFRhYi51cmwpLFxuICBsaW5lYWdlOiAoZmlyc3RUYWIsIF90YWJzLCBhbGxUYWJzTWFwKSA9PiB7XG4gICAgaWYgKGZpcnN0VGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGNvbnN0IHBhcmVudCA9IGFsbFRhYnNNYXAuZ2V0KGZpcnN0VGFiLm9wZW5lclRhYklkKTtcbiAgICAgIGlmIChwYXJlbnQpIHtcbiAgICAgICAgY29uc3QgcGFyZW50VGl0bGUgPSBwYXJlbnQudGl0bGUubGVuZ3RoID4gMjAgPyBwYXJlbnQudGl0bGUuc3Vic3RyaW5nKDAsIDIwKSArIFwiLi4uXCIgOiBwYXJlbnQudGl0bGU7XG4gICAgICAgIHJldHVybiBgRnJvbTogJHtwYXJlbnRUaXRsZX1gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGBGcm9tOiBUYWIgJHtmaXJzdFRhYi5vcGVuZXJUYWJJZH1gO1xuICAgIH1cbiAgICByZXR1cm4gYFdpbmRvdyAke2ZpcnN0VGFiLndpbmRvd0lkfWA7XG4gIH0sXG4gIGNvbnRleHQ6IChmaXJzdFRhYikgPT4gZmlyc3RUYWIuY29udGV4dCB8fCBcIlVuY2F0ZWdvcml6ZWRcIixcbiAgcGlubmVkOiAoZmlyc3RUYWIpID0+IGZpcnN0VGFiLnBpbm5lZCA/IFwiUGlubmVkXCIgOiBcIlVucGlubmVkXCIsXG4gIGFnZTogKGZpcnN0VGFiKSA9PiBnZXRSZWNlbmN5TGFiZWwoZmlyc3RUYWIubGFzdEFjY2Vzc2VkID8/IDApLFxuICB1cmw6ICgpID0+IFwiVVJMIEdyb3VwXCIsXG4gIHJlY2VuY3k6ICgpID0+IFwiVGltZSBHcm91cFwiLFxuICBuZXN0aW5nOiAoZmlyc3RUYWIpID0+IGZpcnN0VGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQgPyBcIkNoaWxkcmVuXCIgOiBcIlJvb3RzXCIsXG59O1xuXG4vLyBIZWxwZXIgdG8gZ2V0IGEgaHVtYW4tcmVhZGFibGUgbGFiZWwgY29tcG9uZW50IGZyb20gYSBzdHJhdGVneSBhbmQgYSBzZXQgb2YgdGFic1xuY29uc3QgZ2V0TGFiZWxDb21wb25lbnQgPSAoc3RyYXRlZ3k6IEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcsIHRhYnM6IFRhYk1ldGFkYXRhW10sIGFsbFRhYnNNYXA6IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhPik6IHN0cmluZyB8IG51bGwgPT4ge1xuICBjb25zdCBmaXJzdFRhYiA9IHRhYnNbMF07XG4gIGlmICghZmlyc3RUYWIpIHJldHVybiBcIlVua25vd25cIjtcblxuICAvLyBDaGVjayBjdXN0b20gc3RyYXRlZ2llcyBmaXJzdFxuICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneSk7XG4gIGlmIChjdXN0b20pIHtcbiAgICAgIHJldHVybiBncm91cGluZ0tleShmaXJzdFRhYiwgc3RyYXRlZ3kpO1xuICB9XG5cbiAgY29uc3QgZ2VuZXJhdG9yID0gYnVpbHRJbkxhYmVsU3RyYXRlZ2llc1tzdHJhdGVneV07XG4gIGlmIChnZW5lcmF0b3IpIHtcbiAgICByZXR1cm4gZ2VuZXJhdG9yKGZpcnN0VGFiLCB0YWJzLCBhbGxUYWJzTWFwKTtcbiAgfVxuXG4gIC8vIERlZmF1bHQgZmFsbGJhY2sgZm9yIGdlbmVyaWMgZmllbGRzXG4gIGNvbnN0IHZhbCA9IGdldEZpZWxkVmFsdWUoZmlyc3RUYWIsIHN0cmF0ZWd5KTtcbiAgaWYgKHZhbCAhPT0gdW5kZWZpbmVkICYmIHZhbCAhPT0gbnVsbCkge1xuICAgICAgcmV0dXJuIFN0cmluZyh2YWwpO1xuICB9XG4gIHJldHVybiBcIlVua25vd25cIjtcbn07XG5cbmNvbnN0IGdlbmVyYXRlTGFiZWwgPSAoXG4gIHN0cmF0ZWdpZXM6IChHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nKVtdLFxuICB0YWJzOiBUYWJNZXRhZGF0YVtdLFxuICBhbGxUYWJzTWFwOiBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YT5cbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGxhYmVscyA9IHN0cmF0ZWdpZXNcbiAgICAubWFwKHMgPT4gZ2V0TGFiZWxDb21wb25lbnQocywgdGFicywgYWxsVGFic01hcCkpXG4gICAgLmZpbHRlcihsID0+IGwgJiYgbCAhPT0gXCJVbmtub3duXCIgJiYgbCAhPT0gXCJHcm91cFwiICYmIGwgIT09IFwiVVJMIEdyb3VwXCIgJiYgbCAhPT0gXCJUaW1lIEdyb3VwXCIgJiYgbCAhPT0gXCJNaXNjXCIpO1xuXG4gIGlmIChsYWJlbHMubGVuZ3RoID09PSAwKSByZXR1cm4gXCJHcm91cFwiO1xuICByZXR1cm4gQXJyYXkuZnJvbShuZXcgU2V0KGxhYmVscykpLmpvaW4oXCIgLSBcIik7XG59O1xuXG5jb25zdCBnZXRTdHJhdGVneUNvbG9yUnVsZSA9IChzdHJhdGVneUlkOiBzdHJpbmcpOiBHcm91cGluZ1J1bGUgfCB1bmRlZmluZWQgPT4ge1xuICAgIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5SWQpO1xuICAgIGlmICghY3VzdG9tKSByZXR1cm4gdW5kZWZpbmVkO1xuXG4gICAgY29uc3QgZ3JvdXBpbmdSdWxlc0xpc3QgPSBhc0FycmF5PEdyb3VwaW5nUnVsZT4oY3VzdG9tLmdyb3VwaW5nUnVsZXMpO1xuICAgIC8vIEl0ZXJhdGUgbWFudWFsbHkgdG8gY2hlY2sgY29sb3JcbiAgICBmb3IgKGxldCBpID0gZ3JvdXBpbmdSdWxlc0xpc3QubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgY29uc3QgcnVsZSA9IGdyb3VwaW5nUnVsZXNMaXN0W2ldO1xuICAgICAgICBpZiAocnVsZSAmJiBydWxlLmNvbG9yICYmIHJ1bGUuY29sb3IgIT09ICdyYW5kb20nKSB7XG4gICAgICAgICAgICByZXR1cm4gcnVsZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xufTtcblxuY29uc3QgZ2V0Q29sb3JWYWx1ZUZyb21UYWJzID0gKFxuICB0YWJzOiBUYWJNZXRhZGF0YVtdLFxuICBjb2xvckZpZWxkOiBzdHJpbmcsXG4gIGNvbG9yVHJhbnNmb3JtPzogc3RyaW5nLFxuICBjb2xvclRyYW5zZm9ybVBhdHRlcm4/OiBzdHJpbmdcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGtleXMgPSB0YWJzXG4gICAgLm1hcCgodGFiKSA9PiB7XG4gICAgICBjb25zdCByYXcgPSBnZXRGaWVsZFZhbHVlKHRhYiwgY29sb3JGaWVsZCk7XG4gICAgICBsZXQga2V5ID0gcmF3ICE9PSB1bmRlZmluZWQgJiYgcmF3ICE9PSBudWxsID8gU3RyaW5nKHJhdykgOiBcIlwiO1xuICAgICAgaWYgKGtleSAmJiBjb2xvclRyYW5zZm9ybSkge1xuICAgICAgICBrZXkgPSBhcHBseVZhbHVlVHJhbnNmb3JtKGtleSwgY29sb3JUcmFuc2Zvcm0sIGNvbG9yVHJhbnNmb3JtUGF0dGVybik7XG4gICAgICB9XG4gICAgICByZXR1cm4ga2V5LnRyaW0oKTtcbiAgICB9KVxuICAgIC5maWx0ZXIoQm9vbGVhbik7XG5cbiAgaWYgKGtleXMubGVuZ3RoID09PSAwKSByZXR1cm4gXCJcIjtcblxuICAvLyBNYWtlIGNvbG9yaW5nIHN0YWJsZSBhbmQgaW5kZXBlbmRlbnQgZnJvbSB0YWIgcXVlcnkvb3JkZXIgY2h1cm4uXG4gIHJldHVybiBBcnJheS5mcm9tKG5ldyBTZXQoa2V5cykpLnNvcnQoKS5qb2luKFwifFwiKTtcbn07XG5cbmNvbnN0IHJlc29sdmVXaW5kb3dNb2RlID0gKG1vZGVzOiAoc3RyaW5nIHwgdW5kZWZpbmVkKVtdKTogXCJjdXJyZW50XCIgfCBcIm5ld1wiIHwgXCJjb21wb3VuZFwiID0+IHtcbiAgICBpZiAobW9kZXMuaW5jbHVkZXMoXCJuZXdcIikpIHJldHVybiBcIm5ld1wiO1xuICAgIGlmIChtb2Rlcy5pbmNsdWRlcyhcImNvbXBvdW5kXCIpKSByZXR1cm4gXCJjb21wb3VuZFwiO1xuICAgIHJldHVybiBcImN1cnJlbnRcIjtcbn07XG5cbmV4cG9ydCBjb25zdCBncm91cFRhYnMgPSAoXG4gIHRhYnM6IFRhYk1ldGFkYXRhW10sXG4gIHN0cmF0ZWdpZXM6IChTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmcpW11cbik6IFRhYkdyb3VwW10gPT4ge1xuICBjb25zdCBhdmFpbGFibGVTdHJhdGVnaWVzID0gZ2V0U3RyYXRlZ2llcyhjdXN0b21TdHJhdGVnaWVzKTtcbiAgY29uc3QgZWZmZWN0aXZlU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gYXZhaWxhYmxlU3RyYXRlZ2llcy5maW5kKGF2YWlsID0+IGF2YWlsLmlkID09PSBzKT8uaXNHcm91cGluZyk7XG4gIGNvbnN0IGJ1Y2tldHMgPSBuZXcgTWFwPHN0cmluZywgVGFiR3JvdXA+KCk7XG4gIGNvbnN0IGJ1Y2tldE1ldGEgPSBuZXcgTWFwPHN0cmluZywgeyB2YWx1ZUtleTogc3RyaW5nOyBhcHBsaWVkU3RyYXRlZ2llczogc3RyaW5nW10gfT4oKTtcblxuICBjb25zdCBhbGxUYWJzTWFwID0gbmV3IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhPigpO1xuICB0YWJzLmZvckVhY2godCA9PiBhbGxUYWJzTWFwLnNldCh0LmlkLCB0KSk7XG5cbiAgdGFicy5mb3JFYWNoKCh0YWIpID0+IHtcbiAgICBsZXQga2V5czogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBhcHBsaWVkU3RyYXRlZ2llczogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBjb2xsZWN0ZWRNb2Rlczogc3RyaW5nW10gPSBbXTtcblxuICAgIHRyeSB7XG4gICAgICAgIGZvciAoY29uc3QgcyBvZiBlZmZlY3RpdmVTdHJhdGVnaWVzKSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBnZXRHcm91cGluZ1Jlc3VsdCh0YWIsIHMpO1xuICAgICAgICAgICAgaWYgKHJlc3VsdC5rZXkgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBrZXlzLnB1c2goYCR7c306JHtyZXN1bHQua2V5fWApO1xuICAgICAgICAgICAgICAgIGFwcGxpZWRTdHJhdGVnaWVzLnB1c2gocyk7XG4gICAgICAgICAgICAgICAgY29sbGVjdGVkTW9kZXMucHVzaChyZXN1bHQubW9kZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGxvZ0RlYnVnKFwiRXJyb3IgZ2VuZXJhdGluZyBncm91cGluZyBrZXlcIiwgeyB0YWJJZDogdGFiLmlkLCBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICByZXR1cm47IC8vIFNraXAgdGhpcyB0YWIgb24gZXJyb3JcbiAgICB9XG5cbiAgICAvLyBJZiBubyBzdHJhdGVnaWVzIGFwcGxpZWQgKGUuZy4gYWxsIGZpbHRlcmVkIG91dCksIHNraXAgZ3JvdXBpbmcgZm9yIHRoaXMgdGFiXG4gICAgaWYgKGtleXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBlZmZlY3RpdmVNb2RlID0gcmVzb2x2ZVdpbmRvd01vZGUoY29sbGVjdGVkTW9kZXMpO1xuICAgIGNvbnN0IHZhbHVlS2V5ID0ga2V5cy5qb2luKFwiOjpcIik7XG4gICAgbGV0IGJ1Y2tldEtleSA9IFwiXCI7XG4gICAgaWYgKGVmZmVjdGl2ZU1vZGUgPT09ICdjdXJyZW50Jykge1xuICAgICAgICAgYnVja2V0S2V5ID0gYHdpbmRvdy0ke3RhYi53aW5kb3dJZH06OmAgKyB2YWx1ZUtleTtcbiAgICB9IGVsc2Uge1xuICAgICAgICAgYnVja2V0S2V5ID0gYGdsb2JhbDo6YCArIHZhbHVlS2V5O1xuICAgIH1cblxuICAgIGxldCBncm91cCA9IGJ1Y2tldHMuZ2V0KGJ1Y2tldEtleSk7XG4gICAgaWYgKCFncm91cCkge1xuICAgICAgbGV0IGdyb3VwQ29sb3IgPSBudWxsO1xuICAgICAgbGV0IGNvbG9yRmllbGQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgIGxldCBjb2xvclRyYW5zZm9ybTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgbGV0IGNvbG9yVHJhbnNmb3JtUGF0dGVybjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG4gICAgICBmb3IgKGNvbnN0IHNJZCBvZiBhcHBsaWVkU3RyYXRlZ2llcykge1xuICAgICAgICBjb25zdCBydWxlID0gZ2V0U3RyYXRlZ3lDb2xvclJ1bGUoc0lkKTtcbiAgICAgICAgaWYgKHJ1bGUpIHtcbiAgICAgICAgICAgIGdyb3VwQ29sb3IgPSBydWxlLmNvbG9yO1xuICAgICAgICAgICAgY29sb3JGaWVsZCA9IHJ1bGUuY29sb3JGaWVsZDtcbiAgICAgICAgICAgIGNvbG9yVHJhbnNmb3JtID0gcnVsZS5jb2xvclRyYW5zZm9ybTtcbiAgICAgICAgICAgIGNvbG9yVHJhbnNmb3JtUGF0dGVybiA9IHJ1bGUuY29sb3JUcmFuc2Zvcm1QYXR0ZXJuO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKGdyb3VwQ29sb3IgPT09ICdtYXRjaCcpIHtcbiAgICAgICAgZ3JvdXBDb2xvciA9IGNvbG9yRm9yS2V5KHZhbHVlS2V5LCAwKTtcbiAgICAgIH0gZWxzZSBpZiAoZ3JvdXBDb2xvciA9PT0gJ2ZpZWxkJyAmJiBjb2xvckZpZWxkKSB7XG4gICAgICAgIGNvbnN0IHZhbCA9IGdldEZpZWxkVmFsdWUodGFiLCBjb2xvckZpZWxkKTtcbiAgICAgICAgbGV0IGtleSA9IHZhbCAhPT0gdW5kZWZpbmVkICYmIHZhbCAhPT0gbnVsbCA/IFN0cmluZyh2YWwpIDogXCJcIjtcbiAgICAgICAgaWYgKGNvbG9yVHJhbnNmb3JtKSB7XG4gICAgICAgICAgICBrZXkgPSBhcHBseVZhbHVlVHJhbnNmb3JtKGtleSwgY29sb3JUcmFuc2Zvcm0sIGNvbG9yVHJhbnNmb3JtUGF0dGVybik7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBVc2Uga2V5IGV2ZW4gaWYgZW1wdHkgKHJlcHJlc2VudGluZyBtaXNzaW5nIGZpZWxkKSB0byBlbnN1cmUgY29uc2lzdGVudCBjb2xvcmluZ1xuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkoa2V5LCAwKTtcbiAgICAgIH0gZWxzZSBpZiAoIWdyb3VwQ29sb3IgfHwgZ3JvdXBDb2xvciA9PT0gJ2ZpZWxkJykge1xuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkodmFsdWVLZXksIDApO1xuICAgICAgfVxuXG4gICAgICBncm91cCA9IHtcbiAgICAgICAgaWQ6IGJ1Y2tldEtleSxcbiAgICAgICAgd2luZG93SWQ6IHRhYi53aW5kb3dJZCxcbiAgICAgICAgbGFiZWw6IFwiXCIsXG4gICAgICAgIGNvbG9yOiBncm91cENvbG9yLFxuICAgICAgICB0YWJzOiBbXSxcbiAgICAgICAgcmVhc29uOiBhcHBsaWVkU3RyYXRlZ2llcy5qb2luKFwiICsgXCIpLFxuICAgICAgICB3aW5kb3dNb2RlOiBlZmZlY3RpdmVNb2RlXG4gICAgICB9O1xuICAgICAgYnVja2V0cy5zZXQoYnVja2V0S2V5LCBncm91cCk7XG4gICAgICBidWNrZXRNZXRhLnNldChidWNrZXRLZXksIHsgdmFsdWVLZXksIGFwcGxpZWRTdHJhdGVnaWVzOiBbLi4uYXBwbGllZFN0cmF0ZWdpZXNdIH0pO1xuICAgIH1cbiAgICBncm91cC50YWJzLnB1c2godGFiKTtcbiAgfSk7XG5cbiAgY29uc3QgZ3JvdXBzID0gQXJyYXkuZnJvbShidWNrZXRzLnZhbHVlcygpKTtcbiAgZ3JvdXBzLmZvckVhY2goZ3JvdXAgPT4ge1xuICAgIGdyb3VwLmxhYmVsID0gZ2VuZXJhdGVMYWJlbChlZmZlY3RpdmVTdHJhdGVnaWVzLCBncm91cC50YWJzLCBhbGxUYWJzTWFwKTtcblxuICAgIGNvbnN0IG1ldGEgPSBidWNrZXRNZXRhLmdldChncm91cC5pZCk7XG4gICAgaWYgKCFtZXRhKSByZXR1cm47XG5cbiAgICBmb3IgKGNvbnN0IHNJZCBvZiBtZXRhLmFwcGxpZWRTdHJhdGVnaWVzKSB7XG4gICAgICBjb25zdCBydWxlID0gZ2V0U3RyYXRlZ3lDb2xvclJ1bGUoc0lkKTtcbiAgICAgIGlmICghcnVsZSkgY29udGludWU7XG5cbiAgICAgIGlmIChydWxlLmNvbG9yID09PSAnbWF0Y2gnKSB7XG4gICAgICAgIGdyb3VwLmNvbG9yID0gY29sb3JGb3JLZXkobWV0YS52YWx1ZUtleSwgMCk7XG4gICAgICB9IGVsc2UgaWYgKHJ1bGUuY29sb3IgPT09ICdmaWVsZCcgJiYgcnVsZS5jb2xvckZpZWxkKSB7XG4gICAgICAgIGNvbnN0IGNvbG9yVmFsdWUgPSBnZXRDb2xvclZhbHVlRnJvbVRhYnMoZ3JvdXAudGFicywgcnVsZS5jb2xvckZpZWxkLCBydWxlLmNvbG9yVHJhbnNmb3JtLCBydWxlLmNvbG9yVHJhbnNmb3JtUGF0dGVybik7XG4gICAgICAgIC8vIFVzZSBjb2xvclZhbHVlIGRpcmVjdGx5IGV2ZW4gaWYgZW1wdHlcbiAgICAgICAgZ3JvdXAuY29sb3IgPSBjb2xvckZvcktleShjb2xvclZhbHVlLCAwKTtcbiAgICAgIH0gZWxzZSBpZiAocnVsZS5jb2xvcikge1xuICAgICAgICBncm91cC5jb2xvciA9IHJ1bGUuY29sb3I7XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICB9XG4gIH0pO1xuXG4gIHJldHVybiBncm91cHM7XG59O1xuXG5jb25zdCBjaGVja1ZhbHVlTWF0Y2ggPSAoXG4gICAgb3BlcmF0b3I6IHN0cmluZyxcbiAgICByYXdWYWx1ZTogYW55LFxuICAgIHJ1bGVWYWx1ZTogc3RyaW5nXG4pOiB7IGlzTWF0Y2g6IGJvb2xlYW47IG1hdGNoT2JqOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsIH0gPT4ge1xuICAgIGNvbnN0IHZhbHVlU3RyID0gcmF3VmFsdWUgIT09IHVuZGVmaW5lZCAmJiByYXdWYWx1ZSAhPT0gbnVsbCA/IFN0cmluZyhyYXdWYWx1ZSkgOiBcIlwiO1xuICAgIGNvbnN0IHZhbHVlVG9DaGVjayA9IHZhbHVlU3RyLnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3QgcGF0dGVyblRvQ2hlY2sgPSBydWxlVmFsdWUgPyBydWxlVmFsdWUudG9Mb3dlckNhc2UoKSA6IFwiXCI7XG5cbiAgICBsZXQgaXNNYXRjaCA9IGZhbHNlO1xuICAgIGxldCBtYXRjaE9iajogUmVnRXhwRXhlY0FycmF5IHwgbnVsbCA9IG51bGw7XG5cbiAgICBzd2l0Y2ggKG9wZXJhdG9yKSB7XG4gICAgICAgIGNhc2UgJ2NvbnRhaW5zJzogaXNNYXRjaCA9IHZhbHVlVG9DaGVjay5pbmNsdWRlcyhwYXR0ZXJuVG9DaGVjayk7IGJyZWFrO1xuICAgICAgICBjYXNlICdkb2VzTm90Q29udGFpbic6IGlzTWF0Y2ggPSAhdmFsdWVUb0NoZWNrLmluY2x1ZGVzKHBhdHRlcm5Ub0NoZWNrKTsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2VxdWFscyc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2sgPT09IHBhdHRlcm5Ub0NoZWNrOyBicmVhaztcbiAgICAgICAgY2FzZSAnc3RhcnRzV2l0aCc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suc3RhcnRzV2l0aChwYXR0ZXJuVG9DaGVjayk7IGJyZWFrO1xuICAgICAgICBjYXNlICdlbmRzV2l0aCc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suZW5kc1dpdGgocGF0dGVyblRvQ2hlY2spOyBicmVhaztcbiAgICAgICAgY2FzZSAnZXhpc3RzJzogaXNNYXRjaCA9IHJhd1ZhbHVlICE9PSB1bmRlZmluZWQ7IGJyZWFrO1xuICAgICAgICBjYXNlICdkb2VzTm90RXhpc3QnOiBpc01hdGNoID0gcmF3VmFsdWUgPT09IHVuZGVmaW5lZDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2lzTnVsbCc6IGlzTWF0Y2ggPSByYXdWYWx1ZSA9PT0gbnVsbDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2lzTm90TnVsbCc6IGlzTWF0Y2ggPSByYXdWYWx1ZSAhPT0gbnVsbDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ21hdGNoZXMnOlxuICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKHJ1bGVWYWx1ZSwgJ2knKTtcbiAgICAgICAgICAgICAgICBtYXRjaE9iaiA9IHJlZ2V4LmV4ZWModmFsdWVTdHIpO1xuICAgICAgICAgICAgICAgIGlzTWF0Y2ggPSAhIW1hdGNoT2JqO1xuICAgICAgICAgICAgIH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHJldHVybiB7IGlzTWF0Y2gsIG1hdGNoT2JqIH07XG59O1xuXG5leHBvcnQgY29uc3QgY2hlY2tDb25kaXRpb24gPSAoY29uZGl0aW9uOiBSdWxlQ29uZGl0aW9uLCB0YWI6IFRhYk1ldGFkYXRhKTogYm9vbGVhbiA9PiB7XG4gICAgaWYgKCFjb25kaXRpb24pIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCByYXdWYWx1ZSA9IGdldEZpZWxkVmFsdWUodGFiLCBjb25kaXRpb24uZmllbGQpO1xuICAgIGNvbnN0IHsgaXNNYXRjaCB9ID0gY2hlY2tWYWx1ZU1hdGNoKGNvbmRpdGlvbi5vcGVyYXRvciwgcmF3VmFsdWUsIGNvbmRpdGlvbi52YWx1ZSk7XG4gICAgcmV0dXJuIGlzTWF0Y2g7XG59O1xuXG5leHBvcnQgY29uc3QgYXBwbHlWYWx1ZVRyYW5zZm9ybSA9ICh2YWw6IHN0cmluZywgdHJhbnNmb3JtOiBzdHJpbmcsIHBhdHRlcm4/OiBzdHJpbmcsIHJlcGxhY2VtZW50Pzogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICBpZiAoIXZhbCB8fCAhdHJhbnNmb3JtIHx8IHRyYW5zZm9ybSA9PT0gJ25vbmUnKSByZXR1cm4gdmFsO1xuXG4gICAgc3dpdGNoICh0cmFuc2Zvcm0pIHtcbiAgICAgICAgY2FzZSAnc3RyaXBUbGQnOlxuICAgICAgICAgICAgcmV0dXJuIHN0cmlwVGxkKHZhbCk7XG4gICAgICAgIGNhc2UgJ2xvd2VyY2FzZSc6XG4gICAgICAgICAgICByZXR1cm4gdmFsLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGNhc2UgJ3VwcGVyY2FzZSc6XG4gICAgICAgICAgICByZXR1cm4gdmFsLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgIGNhc2UgJ2ZpcnN0Q2hhcic6XG4gICAgICAgICAgICByZXR1cm4gdmFsLmNoYXJBdCgwKTtcbiAgICAgICAgY2FzZSAnZG9tYWluJzpcbiAgICAgICAgICAgIHJldHVybiBkb21haW5Gcm9tVXJsKHZhbCk7XG4gICAgICAgIGNhc2UgJ2hvc3RuYW1lJzpcbiAgICAgICAgICAgIGNvbnN0IGggPSBnZXRIb3N0bmFtZSh2YWwpO1xuICAgICAgICAgICAgcmV0dXJuIGggIT09IG51bGwgPyBoIDogdmFsO1xuICAgICAgICBjYXNlICdyZWdleCc6XG4gICAgICAgICAgICBpZiAocGF0dGVybikge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCByZWdleCA9IHJlZ2V4Q2FjaGUuZ2V0KHBhdHRlcm4pO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXJlZ2V4KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWdleCA9IG5ldyBSZWdFeHAocGF0dGVybik7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWdleENhY2hlLnNldChwYXR0ZXJuLCByZWdleCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbWF0Y2ggPSByZWdleC5leGVjKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGV4dHJhY3RlZCA9IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IG1hdGNoLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXh0cmFjdGVkICs9IG1hdGNoW2ldIHx8IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZXh0cmFjdGVkO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgIGxvZ0RlYnVnKFwiSW52YWxpZCByZWdleCBpbiB0cmFuc2Zvcm1cIiwgeyBwYXR0ZXJuOiBwYXR0ZXJuLCBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICAgICAgfVxuICAgICAgICBjYXNlICdyZWdleFJlcGxhY2UnOlxuICAgICAgICAgICAgIGlmIChwYXR0ZXJuKSB7XG4gICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAvLyBVc2luZyAnZycgZ2xvYmFsIGZsYWcgYnkgZGVmYXVsdCBmb3IgcmVwbGFjZW1lbnRcbiAgICAgICAgICAgICAgICAgICAgIHJldHVybiB2YWwucmVwbGFjZShuZXcgUmVnRXhwKHBhdHRlcm4sICdnJyksIHJlcGxhY2VtZW50IHx8IFwiXCIpO1xuICAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkludmFsaWQgcmVnZXggaW4gdHJhbnNmb3JtXCIsIHsgcGF0dGVybjogcGF0dGVybiwgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICAgICAgICAgICAgIHJldHVybiB2YWw7XG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgcmV0dXJuIHZhbDtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHJldHVybiB2YWw7XG4gICAgfVxufTtcblxuLyoqXG4gKiBFdmFsdWF0ZXMgbGVnYWN5IHJ1bGVzIChzaW1wbGUgQU5EL09SIGNvbmRpdGlvbnMgd2l0aG91dCBncm91cGluZy9maWx0ZXIgc2VwYXJhdGlvbikuXG4gKiBAZGVwcmVjYXRlZCBUaGlzIGxvZ2ljIGlzIGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5IHdpdGggb2xkIGN1c3RvbSBzdHJhdGVnaWVzLlxuICovXG5mdW5jdGlvbiBldmFsdWF0ZUxlZ2FjeVJ1bGVzKGxlZ2FjeVJ1bGVzOiBTdHJhdGVneVJ1bGVbXSwgdGFiOiBUYWJNZXRhZGF0YSk6IHN0cmluZyB8IG51bGwge1xuICAgIGNvbnN0IGxlZ2FjeVJ1bGVzTGlzdCA9IGFzQXJyYXk8U3RyYXRlZ3lSdWxlPihsZWdhY3lSdWxlcyk7XG4gICAgaWYgKGxlZ2FjeVJ1bGVzTGlzdC5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGxlZ2FjeVJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IHJhd1ZhbHVlID0gZ2V0RmllbGRWYWx1ZSh0YWIsIHJ1bGUuZmllbGQpO1xuICAgICAgICAgICAgY29uc3QgeyBpc01hdGNoLCBtYXRjaE9iaiB9ID0gY2hlY2tWYWx1ZU1hdGNoKHJ1bGUub3BlcmF0b3IsIHJhd1ZhbHVlLCBydWxlLnZhbHVlKTtcblxuICAgICAgICAgICAgaWYgKGlzTWF0Y2gpIHtcbiAgICAgICAgICAgICAgICBsZXQgcmVzdWx0ID0gcnVsZS5yZXN1bHQ7XG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoT2JqICYmIG1hdGNoT2JqLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBtYXRjaE9iai5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKG5ldyBSZWdFeHAoYFxcXFwkJHtpfWAsICdnJyksIG1hdGNoT2JqW2ldIHx8IFwiXCIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGV2YWx1YXRpbmcgbGVnYWN5IHJ1bGVzXCIsIHsgZXJyb3I6IFN0cmluZyhlcnJvcikgfSk7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgY29uc3QgZ2V0R3JvdXBpbmdSZXN1bHQgPSAodGFiOiBUYWJNZXRhZGF0YSwgc3RyYXRlZ3k6IEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcpOiB7IGtleTogc3RyaW5nIHwgbnVsbCwgbW9kZTogXCJjdXJyZW50XCIgfCBcIm5ld1wiIHwgXCJjb21wb3VuZFwiIH0gPT4ge1xuICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneSk7XG4gIGlmIChjdXN0b20pIHtcbiAgICAgIGNvbnN0IGZpbHRlckdyb3Vwc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb25bXT4oY3VzdG9tLmZpbHRlckdyb3Vwcyk7XG4gICAgICBjb25zdCBmaWx0ZXJzTGlzdCA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbj4oY3VzdG9tLmZpbHRlcnMpO1xuXG4gICAgICBsZXQgbWF0Y2ggPSBmYWxzZTtcblxuICAgICAgaWYgKGZpbHRlckdyb3Vwc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIC8vIE9SIGxvZ2ljXG4gICAgICAgICAgZm9yIChjb25zdCBncm91cCBvZiBmaWx0ZXJHcm91cHNMaXN0KSB7XG4gICAgICAgICAgICAgIGNvbnN0IGdyb3VwUnVsZXMgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGdyb3VwKTtcbiAgICAgICAgICAgICAgaWYgKGdyb3VwUnVsZXMubGVuZ3RoID09PSAwIHx8IGdyb3VwUnVsZXMuZXZlcnkociA9PiBjaGVja0NvbmRpdGlvbihyLCB0YWIpKSkge1xuICAgICAgICAgICAgICAgICAgbWF0Y2ggPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGZpbHRlcnNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAvLyBMZWdhY3kvU2ltcGxlIEFORCBsb2dpY1xuICAgICAgICAgIGlmIChmaWx0ZXJzTGlzdC5ldmVyeShmID0+IGNoZWNrQ29uZGl0aW9uKGYsIHRhYikpKSB7XG4gICAgICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIE5vIGZpbHRlcnMgLT4gTWF0Y2ggYWxsXG4gICAgICAgICAgbWF0Y2ggPSB0cnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoIW1hdGNoKSB7XG4gICAgICAgICAgcmV0dXJuIHsga2V5OiBudWxsLCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICAgICAgfVxuXG4gICAgICBjb25zdCBncm91cGluZ1J1bGVzTGlzdCA9IGFzQXJyYXk8R3JvdXBpbmdSdWxlPihjdXN0b20uZ3JvdXBpbmdSdWxlcyk7XG4gICAgICBpZiAoZ3JvdXBpbmdSdWxlc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgIGNvbnN0IG1vZGVzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZ3JvdXBpbmdSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXJ1bGUpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIGxldCB2YWwgPSBcIlwiO1xuICAgICAgICAgICAgICAgIGlmIChydWxlLnNvdXJjZSA9PT0gJ2ZpZWxkJykge1xuICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmF3ID0gZ2V0RmllbGRWYWx1ZSh0YWIsIHJ1bGUudmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgdmFsID0gcmF3ICE9PSB1bmRlZmluZWQgJiYgcmF3ICE9PSBudWxsID8gU3RyaW5nKHJhdykgOiBcIlwiO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICB2YWwgPSBydWxlLnZhbHVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh2YWwgJiYgcnVsZS50cmFuc2Zvcm0gJiYgcnVsZS50cmFuc2Zvcm0gIT09ICdub25lJykge1xuICAgICAgICAgICAgICAgICAgICB2YWwgPSBhcHBseVZhbHVlVHJhbnNmb3JtKHZhbCwgcnVsZS50cmFuc2Zvcm0sIHJ1bGUudHJhbnNmb3JtUGF0dGVybiwgcnVsZS50cmFuc2Zvcm1SZXBsYWNlbWVudCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHZhbCkge1xuICAgICAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChydWxlLndpbmRvd01vZGUpIG1vZGVzLnB1c2gocnVsZS53aW5kb3dNb2RlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgIGxvZ0RlYnVnKFwiRXJyb3IgYXBwbHlpbmcgZ3JvdXBpbmcgcnVsZXNcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIHJldHVybiB7IGtleTogcGFydHMuam9pbihcIiAtIFwiKSwgbW9kZTogcmVzb2x2ZVdpbmRvd01vZGUobW9kZXMpIH07XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7IGtleTogY3VzdG9tLmZhbGxiYWNrIHx8IFwiTWlzY1wiLCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICAgICAgfSBlbHNlIGlmIChjdXN0b20ucnVsZXMpIHtcbiAgICAgICAgICBjb25zdCByZXN1bHQgPSBldmFsdWF0ZUxlZ2FjeVJ1bGVzKGFzQXJyYXk8U3RyYXRlZ3lSdWxlPihjdXN0b20ucnVsZXMpLCB0YWIpO1xuICAgICAgICAgIGlmIChyZXN1bHQpIHJldHVybiB7IGtleTogcmVzdWx0LCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICAgICAgfVxuXG4gICAgICByZXR1cm4geyBrZXk6IGN1c3RvbS5mYWxsYmFjayB8fCBcIk1pc2NcIiwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgfVxuXG4gIC8vIEJ1aWx0LWluIHN0cmF0ZWdpZXNcbiAgbGV0IHNpbXBsZUtleTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIHN3aXRjaCAoc3RyYXRlZ3kpIHtcbiAgICBjYXNlIFwiZG9tYWluXCI6XG4gICAgY2FzZSBcImRvbWFpbl9mdWxsXCI6XG4gICAgICBzaW1wbGVLZXkgPSBkb21haW5Gcm9tVXJsKHRhYi51cmwpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInRvcGljXCI6XG4gICAgICBzaW1wbGVLZXkgPSBzZW1hbnRpY0J1Y2tldCh0YWIudGl0bGUsIHRhYi51cmwpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcImxpbmVhZ2VcIjpcbiAgICAgIHNpbXBsZUtleSA9IG5hdmlnYXRpb25LZXkodGFiKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJjb250ZXh0XCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIuY29udGV4dCB8fCBcIlVuY2F0ZWdvcml6ZWRcIjtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJwaW5uZWRcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi5waW5uZWQgPyBcInBpbm5lZFwiIDogXCJ1bnBpbm5lZFwiO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcImFnZVwiOlxuICAgICAgc2ltcGxlS2V5ID0gZ2V0UmVjZW5jeUxhYmVsKHRhYi5sYXN0QWNjZXNzZWQgPz8gMCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwidXJsXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIudXJsO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInRpdGxlXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIudGl0bGU7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwicmVjZW5jeVwiOlxuICAgICAgc2ltcGxlS2V5ID0gU3RyaW5nKHRhYi5sYXN0QWNjZXNzZWQgPz8gMCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwibmVzdGluZ1wiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQgPyBcImNoaWxkXCIgOiBcInJvb3RcIjtcbiAgICAgIGJyZWFrO1xuICAgIGRlZmF1bHQ6XG4gICAgICAgIGNvbnN0IHZhbCA9IGdldEZpZWxkVmFsdWUodGFiLCBzdHJhdGVneSk7XG4gICAgICAgIGlmICh2YWwgIT09IHVuZGVmaW5lZCAmJiB2YWwgIT09IG51bGwpIHtcbiAgICAgICAgICAgIHNpbXBsZUtleSA9IFN0cmluZyh2YWwpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2ltcGxlS2V5ID0gXCJVbmtub3duXCI7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gIH1cbiAgcmV0dXJuIHsga2V5OiBzaW1wbGVLZXksIG1vZGU6IFwiY3VycmVudFwiIH07XG59O1xuXG5leHBvcnQgY29uc3QgZ3JvdXBpbmdLZXkgPSAodGFiOiBUYWJNZXRhZGF0YSwgc3RyYXRlZ3k6IEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcpOiBzdHJpbmcgfCBudWxsID0+IHtcbiAgICByZXR1cm4gZ2V0R3JvdXBpbmdSZXN1bHQodGFiLCBzdHJhdGVneSkua2V5O1xufTtcblxuZnVuY3Rpb24gaXNDb250ZXh0RmllbGQoZmllbGQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBmaWVsZCA9PT0gJ2NvbnRleHQnIHx8IGZpZWxkID09PSAnZ2VucmUnIHx8IGZpZWxkID09PSAnc2l0ZU5hbWUnIHx8IGZpZWxkLnN0YXJ0c1dpdGgoJ2NvbnRleHREYXRhLicpO1xufVxuXG5leHBvcnQgY29uc3QgcmVxdWlyZXNDb250ZXh0QW5hbHlzaXMgPSAoc3RyYXRlZ3lJZHM6IChzdHJpbmcgfCBTb3J0aW5nU3RyYXRlZ3kpW10pOiBib29sZWFuID0+IHtcbiAgICAvLyBDaGVjayBpZiBcImNvbnRleHRcIiBzdHJhdGVneSBpcyBleHBsaWNpdGx5IHJlcXVlc3RlZFxuICAgIGlmIChzdHJhdGVneUlkcy5pbmNsdWRlcyhcImNvbnRleHRcIikpIHJldHVybiB0cnVlO1xuXG4gICAgY29uc3Qgc3RyYXRlZ2llcyA9IGdldFN0cmF0ZWdpZXMoY3VzdG9tU3RyYXRlZ2llcyk7XG4gICAgLy8gZmlsdGVyIG9ubHkgdGhvc2UgdGhhdCBtYXRjaCB0aGUgcmVxdWVzdGVkIElEc1xuICAgIGNvbnN0IGFjdGl2ZURlZnMgPSBzdHJhdGVnaWVzLmZpbHRlcihzID0+IHN0cmF0ZWd5SWRzLmluY2x1ZGVzKHMuaWQpKTtcblxuICAgIGZvciAoY29uc3QgZGVmIG9mIGFjdGl2ZURlZnMpIHtcbiAgICAgICAgLy8gSWYgaXQncyBhIGJ1aWx0LWluIHN0cmF0ZWd5IHRoYXQgbmVlZHMgY29udGV4dCAob25seSAnY29udGV4dCcgZG9lcylcbiAgICAgICAgaWYgKGRlZi5pZCA9PT0gJ2NvbnRleHQnKSByZXR1cm4gdHJ1ZTtcblxuICAgICAgICAvLyBJZiBpdCBpcyBhIGN1c3RvbSBzdHJhdGVneSAob3Igb3ZlcnJpZGVzIGJ1aWx0LWluKSwgY2hlY2sgaXRzIHJ1bGVzXG4gICAgICAgIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChjID0+IGMuaWQgPT09IGRlZi5pZCk7XG4gICAgICAgIGlmIChjdXN0b20pIHtcbiAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzTGlzdCA9IGFzQXJyYXk8R3JvdXBpbmdSdWxlPihjdXN0b20uZ3JvdXBpbmdSdWxlcyk7XG4gICAgICAgICAgICAgY29uc3Qgc29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KGN1c3RvbS5zb3J0aW5nUnVsZXMpO1xuICAgICAgICAgICAgIGNvbnN0IGdyb3VwU29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KGN1c3RvbS5ncm91cFNvcnRpbmdSdWxlcyk7XG4gICAgICAgICAgICAgY29uc3QgZmlsdGVyc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGN1c3RvbS5maWx0ZXJzKTtcbiAgICAgICAgICAgICBjb25zdCBmaWx0ZXJHcm91cHNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uW10+KGN1c3RvbS5maWx0ZXJHcm91cHMpO1xuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwUnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIHJ1bGUuc291cmNlID09PSAnZmllbGQnICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUudmFsdWUpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgcnVsZS5jb2xvciA9PT0gJ2ZpZWxkJyAmJiBydWxlLmNvbG9yRmllbGQgJiYgaXNDb250ZXh0RmllbGQocnVsZS5jb2xvckZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIHNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBmaWx0ZXJzTGlzdCkge1xuICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBpc0NvbnRleHRGaWVsZChydWxlLmZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBncm91cCBvZiBmaWx0ZXJHcm91cHNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGNvbnN0IGdyb3VwUnVsZXMgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGdyb3VwKTtcbiAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwUnVsZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59O1xuIiwgImltcG9ydCB7IFNvcnRpbmdTdHJhdGVneSwgVGFiTWV0YWRhdGEsIEN1c3RvbVN0cmF0ZWd5LCBTb3J0aW5nUnVsZSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGRvbWFpbkZyb21VcmwsIHNlbWFudGljQnVja2V0LCBuYXZpZ2F0aW9uS2V5LCBncm91cGluZ0tleSwgZ2V0RmllbGRWYWx1ZSwgZ2V0Q3VzdG9tU3RyYXRlZ2llcyB9IGZyb20gXCIuL2dyb3VwaW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcblxuLy8gSGVscGVyIHNjb3Jlc1xuZXhwb3J0IGNvbnN0IHJlY2VuY3lTY29yZSA9ICh0YWI6IFRhYk1ldGFkYXRhKSA9PiB0YWIubGFzdEFjY2Vzc2VkID8/IDA7XG5leHBvcnQgY29uc3QgaGllcmFyY2h5U2NvcmUgPSAodGFiOiBUYWJNZXRhZGF0YSkgPT4gKHRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkID8gMSA6IDApO1xuZXhwb3J0IGNvbnN0IHBpbm5lZFNjb3JlID0gKHRhYjogVGFiTWV0YWRhdGEpID0+ICh0YWIucGlubmVkID8gMCA6IDEpO1xuXG5leHBvcnQgY29uc3QgY29tcGFyZVZhbHVlcyA9IChhOiBhbnksIGI6IGFueSwgb3JkZXI6ICdhc2MnIHwgJ2Rlc2MnID0gJ2FzYycpOiBudW1iZXIgPT4ge1xuICAgIC8vIFRyZWF0IHVuZGVmaW5lZC9udWxsIGFzIFwiZ3JlYXRlclwiIHRoYW4gZXZlcnl0aGluZyBlbHNlIChwdXNoZWQgdG8gZW5kIGluIGFzYylcbiAgICBjb25zdCBpc0FOdWxsID0gYSA9PT0gdW5kZWZpbmVkIHx8IGEgPT09IG51bGw7XG4gICAgY29uc3QgaXNCTnVsbCA9IGIgPT09IHVuZGVmaW5lZCB8fCBiID09PSBudWxsO1xuXG4gICAgaWYgKGlzQU51bGwgJiYgaXNCTnVsbCkgcmV0dXJuIDA7XG4gICAgaWYgKGlzQU51bGwpIHJldHVybiAxOyAvLyBhID4gYiAoYSBpcyBudWxsKVxuICAgIGlmIChpc0JOdWxsKSByZXR1cm4gLTE7IC8vIGIgPiBhIChiIGlzIG51bGwpIC0+IGEgPCBiXG5cbiAgICBsZXQgcmVzdWx0ID0gMDtcbiAgICBpZiAoYSA8IGIpIHJlc3VsdCA9IC0xO1xuICAgIGVsc2UgaWYgKGEgPiBiKSByZXN1bHQgPSAxO1xuXG4gICAgcmV0dXJuIG9yZGVyID09PSAnZGVzYycgPyAtcmVzdWx0IDogcmVzdWx0O1xufTtcblxuZXhwb3J0IGNvbnN0IGNvbXBhcmVCeVNvcnRpbmdSdWxlcyA9IChydWxlczogU29ydGluZ1J1bGVbXSwgYTogVGFiTWV0YWRhdGEsIGI6IFRhYk1ldGFkYXRhKTogbnVtYmVyID0+IHtcbiAgICBjb25zdCBzb3J0UnVsZXNMaXN0ID0gYXNBcnJheTxTb3J0aW5nUnVsZT4ocnVsZXMpO1xuICAgIGlmIChzb3J0UnVsZXNMaXN0Lmxlbmd0aCA9PT0gMCkgcmV0dXJuIDA7XG5cbiAgICB0cnkge1xuICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2Ygc29ydFJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IHZhbEEgPSBnZXRGaWVsZFZhbHVlKGEsIHJ1bGUuZmllbGQpO1xuICAgICAgICAgICAgY29uc3QgdmFsQiA9IGdldEZpZWxkVmFsdWUoYiwgcnVsZS5maWVsZCk7XG5cbiAgICAgICAgICAgIGNvbnN0IGRpZmYgPSBjb21wYXJlVmFsdWVzKHZhbEEsIHZhbEIsIHJ1bGUub3JkZXIgfHwgJ2FzYycpO1xuICAgICAgICAgICAgaWYgKGRpZmYgIT09IDApIHJldHVybiBkaWZmO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGV2YWx1YXRpbmcgc29ydGluZyBydWxlc1wiLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgfVxuICAgIHJldHVybiAwO1xufTtcblxudHlwZSBDb21wYXJhdG9yID0gKGE6IFRhYk1ldGFkYXRhLCBiOiBUYWJNZXRhZGF0YSkgPT4gbnVtYmVyO1xuXG4vLyAtLS0gQnVpbHQtaW4gQ29tcGFyYXRvcnMgLS0tXG5cbmNvbnN0IGNvbXBhcmVSZWNlbmN5OiBDb21wYXJhdG9yID0gKGEsIGIpID0+IChiLmxhc3RBY2Nlc3NlZCA/PyAwKSAtIChhLmxhc3RBY2Nlc3NlZCA/PyAwKTtcbmNvbnN0IGNvbXBhcmVOZXN0aW5nOiBDb21wYXJhdG9yID0gKGEsIGIpID0+IGhpZXJhcmNoeVNjb3JlKGEpIC0gaGllcmFyY2h5U2NvcmUoYik7XG5jb25zdCBjb21wYXJlUGlubmVkOiBDb21wYXJhdG9yID0gKGEsIGIpID0+IHBpbm5lZFNjb3JlKGEpIC0gcGlubmVkU2NvcmUoYik7XG5jb25zdCBjb21wYXJlVGl0bGU6IENvbXBhcmF0b3IgPSAoYSwgYikgPT4gYS50aXRsZS5sb2NhbGVDb21wYXJlKGIudGl0bGUpO1xuY29uc3QgY29tcGFyZVVybDogQ29tcGFyYXRvciA9IChhLCBiKSA9PiBhLnVybC5sb2NhbGVDb21wYXJlKGIudXJsKTtcbmNvbnN0IGNvbXBhcmVDb250ZXh0OiBDb21wYXJhdG9yID0gKGEsIGIpID0+IChhLmNvbnRleHQgPz8gXCJcIikubG9jYWxlQ29tcGFyZShiLmNvbnRleHQgPz8gXCJcIik7XG5jb25zdCBjb21wYXJlRG9tYWluOiBDb21wYXJhdG9yID0gKGEsIGIpID0+IGRvbWFpbkZyb21VcmwoYS51cmwpLmxvY2FsZUNvbXBhcmUoZG9tYWluRnJvbVVybChiLnVybCkpO1xuY29uc3QgY29tcGFyZVRvcGljOiBDb21wYXJhdG9yID0gKGEsIGIpID0+IHNlbWFudGljQnVja2V0KGEudGl0bGUsIGEudXJsKS5sb2NhbGVDb21wYXJlKHNlbWFudGljQnVja2V0KGIudGl0bGUsIGIudXJsKSk7XG5jb25zdCBjb21wYXJlTGluZWFnZTogQ29tcGFyYXRvciA9IChhLCBiKSA9PiBuYXZpZ2F0aW9uS2V5KGEpLmxvY2FsZUNvbXBhcmUobmF2aWdhdGlvbktleShiKSk7XG5jb25zdCBjb21wYXJlQWdlOiBDb21wYXJhdG9yID0gKGEsIGIpID0+IChncm91cGluZ0tleShhLCBcImFnZVwiKSB8fCBcIlwiKS5sb2NhbGVDb21wYXJlKGdyb3VwaW5nS2V5KGIsIFwiYWdlXCIpIHx8IFwiXCIpO1xuXG5jb25zdCBzdHJhdGVneVJlZ2lzdHJ5OiBSZWNvcmQ8c3RyaW5nLCBDb21wYXJhdG9yPiA9IHtcbiAgcmVjZW5jeTogY29tcGFyZVJlY2VuY3ksXG4gIG5lc3Rpbmc6IGNvbXBhcmVOZXN0aW5nLFxuICBwaW5uZWQ6IGNvbXBhcmVQaW5uZWQsXG4gIHRpdGxlOiBjb21wYXJlVGl0bGUsXG4gIHVybDogY29tcGFyZVVybCxcbiAgY29udGV4dDogY29tcGFyZUNvbnRleHQsXG4gIGRvbWFpbjogY29tcGFyZURvbWFpbixcbiAgZG9tYWluX2Z1bGw6IGNvbXBhcmVEb21haW4sXG4gIHRvcGljOiBjb21wYXJlVG9waWMsXG4gIGxpbmVhZ2U6IGNvbXBhcmVMaW5lYWdlLFxuICBhZ2U6IGNvbXBhcmVBZ2UsXG59O1xuXG4vLyAtLS0gQ3VzdG9tIFN0cmF0ZWd5IEV2YWx1YXRpb24gLS0tXG5cbmNvbnN0IGV2YWx1YXRlQ3VzdG9tU3RyYXRlZ3kgPSAoc3RyYXRlZ3k6IHN0cmluZywgYTogVGFiTWV0YWRhdGEsIGI6IFRhYk1ldGFkYXRhKTogbnVtYmVyIHwgbnVsbCA9PiB7XG4gIGNvbnN0IGN1c3RvbVN0cmF0cyA9IGdldEN1c3RvbVN0cmF0ZWdpZXMoKTtcbiAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneSk7XG5cbiAgaWYgKCFjdXN0b20pIHJldHVybiBudWxsO1xuXG4gIGNvbnN0IHNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihjdXN0b20uc29ydGluZ1J1bGVzKTtcbiAgaWYgKHNvcnRSdWxlc0xpc3QubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcblxuICByZXR1cm4gY29tcGFyZUJ5U29ydGluZ1J1bGVzKHNvcnRSdWxlc0xpc3QsIGEsIGIpO1xufTtcblxuLy8gLS0tIEdlbmVyaWMgRmFsbGJhY2sgLS0tXG5cbmNvbnN0IGV2YWx1YXRlR2VuZXJpY1N0cmF0ZWd5ID0gKHN0cmF0ZWd5OiBzdHJpbmcsIGE6IFRhYk1ldGFkYXRhLCBiOiBUYWJNZXRhZGF0YSk6IG51bWJlciA9PiB7XG4gICAgLy8gQ2hlY2sgaWYgaXQncyBhIGdlbmVyaWMgZmllbGQgZmlyc3RcbiAgICBjb25zdCB2YWxBID0gZ2V0RmllbGRWYWx1ZShhLCBzdHJhdGVneSk7XG4gICAgY29uc3QgdmFsQiA9IGdldEZpZWxkVmFsdWUoYiwgc3RyYXRlZ3kpO1xuXG4gICAgaWYgKHZhbEEgIT09IHVuZGVmaW5lZCAmJiB2YWxCICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgaWYgKHZhbEEgPCB2YWxCKSByZXR1cm4gLTE7XG4gICAgICAgIGlmICh2YWxBID4gdmFsQikgcmV0dXJuIDE7XG4gICAgICAgIHJldHVybiAwO1xuICAgIH1cblxuICAgIC8vIEZhbGxiYWNrIGZvciBjdXN0b20gc3RyYXRlZ2llcyBncm91cGluZyBrZXkgKGlmIHVzaW5nIGN1c3RvbSBzdHJhdGVneSBhcyBzb3J0aW5nIGJ1dCBubyBzb3J0aW5nIHJ1bGVzIGRlZmluZWQpXG4gICAgLy8gb3IgdW5oYW5kbGVkIGJ1aWx0LWluc1xuICAgIHJldHVybiAoZ3JvdXBpbmdLZXkoYSwgc3RyYXRlZ3kpIHx8IFwiXCIpLmxvY2FsZUNvbXBhcmUoZ3JvdXBpbmdLZXkoYiwgc3RyYXRlZ3kpIHx8IFwiXCIpO1xufTtcblxuLy8gLS0tIE1haW4gRXhwb3J0IC0tLVxuXG5leHBvcnQgY29uc3QgY29tcGFyZUJ5ID0gKHN0cmF0ZWd5OiBTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmcsIGE6IFRhYk1ldGFkYXRhLCBiOiBUYWJNZXRhZGF0YSk6IG51bWJlciA9PiB7XG4gIC8vIDEuIEN1c3RvbSBTdHJhdGVneSAodGFrZXMgcHJlY2VkZW5jZSBpZiBydWxlcyBleGlzdClcbiAgY29uc3QgY3VzdG9tRGlmZiA9IGV2YWx1YXRlQ3VzdG9tU3RyYXRlZ3koc3RyYXRlZ3ksIGEsIGIpO1xuICBpZiAoY3VzdG9tRGlmZiAhPT0gbnVsbCkge1xuICAgICAgcmV0dXJuIGN1c3RvbURpZmY7XG4gIH1cblxuICAvLyAyLiBCdWlsdC1pbiByZWdpc3RyeVxuICBjb25zdCBidWlsdEluID0gc3RyYXRlZ3lSZWdpc3RyeVtzdHJhdGVneV07XG4gIGlmIChidWlsdEluKSB7XG4gICAgcmV0dXJuIGJ1aWx0SW4oYSwgYik7XG4gIH1cblxuICAvLyAzLiBHZW5lcmljL0ZhbGxiYWNrXG4gIHJldHVybiBldmFsdWF0ZUdlbmVyaWNTdHJhdGVneShzdHJhdGVneSwgYSwgYik7XG59O1xuXG5leHBvcnQgY29uc3Qgc29ydFRhYnMgPSAodGFiczogVGFiTWV0YWRhdGFbXSwgc3RyYXRlZ2llczogU29ydGluZ1N0cmF0ZWd5W10pOiBUYWJNZXRhZGF0YVtdID0+IHtcbiAgY29uc3Qgc2NvcmluZzogU29ydGluZ1N0cmF0ZWd5W10gPSBzdHJhdGVnaWVzLmxlbmd0aCA/IHN0cmF0ZWdpZXMgOiBbXCJwaW5uZWRcIiwgXCJyZWNlbmN5XCJdO1xuICByZXR1cm4gWy4uLnRhYnNdLnNvcnQoKGEsIGIpID0+IHtcbiAgICBmb3IgKGNvbnN0IHN0cmF0ZWd5IG9mIHNjb3JpbmcpIHtcbiAgICAgIGNvbnN0IGRpZmYgPSBjb21wYXJlQnkoc3RyYXRlZ3ksIGEsIGIpO1xuICAgICAgaWYgKGRpZmYgIT09IDApIHJldHVybiBkaWZmO1xuICAgIH1cbiAgICByZXR1cm4gYS5pZCAtIGIuaWQ7XG4gIH0pO1xufTtcbiIsICJpbXBvcnQgeyBUYWJHcm91cCwgVGFiTWV0YWRhdGEsIFByZWZlcmVuY2VzIH0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgbWFwQ2hyb21lVGFiLCBnZXRTdG9yZWRQcmVmZXJlbmNlcyB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcbmltcG9ydCB7IHNldEN1c3RvbVN0cmF0ZWdpZXMgfSBmcm9tIFwiLi4vYmFja2dyb3VuZC9ncm91cGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IHNvcnRUYWJzIH0gZnJvbSBcIi4uL2JhY2tncm91bmQvc29ydGluZ1N0cmF0ZWdpZXMuanNcIjtcblxuY29uc3QgZGVmYXVsdFByZWZlcmVuY2VzOiBQcmVmZXJlbmNlcyA9IHtcbiAgc29ydGluZzogW1wicGlubmVkXCIsIFwicmVjZW5jeVwiXSxcbiAgZGVidWc6IGZhbHNlLFxuICB0aGVtZTogXCJkYXJrXCIsXG4gIGN1c3RvbUdlbmVyYToge31cbn07XG5cbmV4cG9ydCBjb25zdCBmZXRjaExvY2FsU3RhdGUgPSBhc3luYyAoKSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgW3RhYnMsIGdyb3VwcywgcHJlZnNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgY2hyb21lLnRhYnMucXVlcnkoe30pLFxuICAgICAgY2hyb21lLnRhYkdyb3Vwcy5xdWVyeSh7fSksXG4gICAgICBnZXRTdG9yZWRQcmVmZXJlbmNlcygpXG4gICAgXSk7XG5cbiAgICBjb25zdCBwcmVmZXJlbmNlcyA9IHByZWZzIHx8IGRlZmF1bHRQcmVmZXJlbmNlcztcblxuICAgIC8vIEluaXRpYWxpemUgY3VzdG9tIHN0cmF0ZWdpZXMgZm9yIHNvcnRpbmdcbiAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZlcmVuY2VzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuXG4gICAgY29uc3QgZ3JvdXBNYXAgPSBuZXcgTWFwKGdyb3Vwcy5tYXAoZyA9PiBbZy5pZCwgZ10pKTtcbiAgICBjb25zdCBtYXBwZWQgPSB0YWJzLm1hcChtYXBDaHJvbWVUYWIpLmZpbHRlcigodCk6IHQgaXMgVGFiTWV0YWRhdGEgPT4gQm9vbGVhbih0KSk7XG5cbiAgICBjb25zdCByZXN1bHRHcm91cHM6IFRhYkdyb3VwW10gPSBbXTtcbiAgICBjb25zdCB0YWJzQnlHcm91cElkID0gbmV3IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhW10+KCk7XG4gICAgY29uc3QgdGFic0J5V2luZG93VW5ncm91cGVkID0gbmV3IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhW10+KCk7XG5cbiAgICBtYXBwZWQuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgICBjb25zdCBncm91cElkID0gdGFiLmdyb3VwSWQgPz8gLTE7XG4gICAgICAgIGlmIChncm91cElkICE9PSAtMSkge1xuICAgICAgICAgICAgaWYgKCF0YWJzQnlHcm91cElkLmhhcyhncm91cElkKSkgdGFic0J5R3JvdXBJZC5zZXQoZ3JvdXBJZCwgW10pO1xuICAgICAgICAgICAgdGFic0J5R3JvdXBJZC5nZXQoZ3JvdXBJZCkhLnB1c2godGFiKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICBpZiAoIXRhYnNCeVdpbmRvd1VuZ3JvdXBlZC5oYXModGFiLndpbmRvd0lkKSkgdGFic0J5V2luZG93VW5ncm91cGVkLnNldCh0YWIud2luZG93SWQsIFtdKTtcbiAgICAgICAgICAgICB0YWJzQnlXaW5kb3dVbmdyb3VwZWQuZ2V0KHRhYi53aW5kb3dJZCkhLnB1c2godGFiKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIFRhYkdyb3VwIG9iamVjdHMgZm9yIGFjdHVhbCBncm91cHNcbiAgICBmb3IgKGNvbnN0IFtncm91cElkLCBncm91cFRhYnNdIG9mIHRhYnNCeUdyb3VwSWQpIHtcbiAgICAgICAgY29uc3QgYnJvd3Nlckdyb3VwID0gZ3JvdXBNYXAuZ2V0KGdyb3VwSWQpO1xuICAgICAgICBpZiAoYnJvd3Nlckdyb3VwKSB7XG4gICAgICAgICAgICByZXN1bHRHcm91cHMucHVzaCh7XG4gICAgICAgICAgICAgICAgaWQ6IGBncm91cC0ke2dyb3VwSWR9YCxcbiAgICAgICAgICAgICAgICB3aW5kb3dJZDogYnJvd3Nlckdyb3VwLndpbmRvd0lkLFxuICAgICAgICAgICAgICAgIGxhYmVsOiBicm93c2VyR3JvdXAudGl0bGUgfHwgXCJVbnRpdGxlZCBHcm91cFwiLFxuICAgICAgICAgICAgICAgIGNvbG9yOiBicm93c2VyR3JvdXAuY29sb3IsXG4gICAgICAgICAgICAgICAgdGFiczogc29ydFRhYnMoZ3JvdXBUYWJzLCBwcmVmZXJlbmNlcy5zb3J0aW5nKSxcbiAgICAgICAgICAgICAgICByZWFzb246IFwiTWFudWFsXCJcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gSGFuZGxlIHVuZ3JvdXBlZCB0YWJzXG4gICAgZm9yIChjb25zdCBbd2luZG93SWQsIHRhYnNdIG9mIHRhYnNCeVdpbmRvd1VuZ3JvdXBlZCkge1xuICAgICAgICByZXN1bHRHcm91cHMucHVzaCh7XG4gICAgICAgICAgICBpZDogYHVuZ3JvdXBlZC0ke3dpbmRvd0lkfWAsXG4gICAgICAgICAgICB3aW5kb3dJZDogd2luZG93SWQsXG4gICAgICAgICAgICBsYWJlbDogXCJVbmdyb3VwZWRcIixcbiAgICAgICAgICAgIGNvbG9yOiBcImdyZXlcIixcbiAgICAgICAgICAgIHRhYnM6IHNvcnRUYWJzKHRhYnMsIHByZWZlcmVuY2VzLnNvcnRpbmcpLFxuICAgICAgICAgICAgcmVhc29uOiBcIlVuZ3JvdXBlZFwiXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnNvbGUud2FybihcIkZldGNoZWQgbG9jYWwgc3RhdGUgKGZhbGxiYWNrKVwiKTtcbiAgICByZXR1cm4geyBvazogdHJ1ZSwgZGF0YTogeyBncm91cHM6IHJlc3VsdEdyb3VwcywgcHJlZmVyZW5jZXMgfSB9O1xuICB9IGNhdGNoIChlKSB7XG4gICAgY29uc29sZS5lcnJvcihcIkxvY2FsIHN0YXRlIGZldGNoIGZhaWxlZDpcIiwgZSk7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGUpIH07XG4gIH1cbn07XG4iLCAiaW1wb3J0IHtcbiAgQXBwbHlHcm91cGluZ1BheWxvYWQsXG4gIEdyb3VwaW5nU2VsZWN0aW9uLFxuICBQcmVmZXJlbmNlcyxcbiAgUnVudGltZU1lc3NhZ2UsXG4gIFJ1bnRpbWVSZXNwb25zZSxcbiAgU2F2ZWRTdGF0ZSxcbiAgU29ydGluZ1N0cmF0ZWd5LFxuICBUYWJHcm91cCxcbiAgVGFiTWV0YWRhdGFcbn0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgZmV0Y2hMb2NhbFN0YXRlIH0gZnJvbSBcIi4vbG9jYWxTdGF0ZS5qc1wiO1xuaW1wb3J0IHsgZ2V0SG9zdG5hbWUgfSBmcm9tIFwiLi4vc2hhcmVkL3VybENhY2hlLmpzXCI7XG5cbmNvbnN0IFJFQ0VJVklOR19FTkRfRVJST1IgPSBcIkNvdWxkIG5vdCBlc3RhYmxpc2ggY29ubmVjdGlvbi4gUmVjZWl2aW5nIGVuZCBkb2VzIG5vdCBleGlzdC5cIjtcblxuY29uc3Qgc2VuZE1lc3NhZ2VPbmNlID0gYXN5bmMgPFREYXRhPih0eXBlOiBSdW50aW1lTWVzc2FnZVtcInR5cGVcIl0sIHBheWxvYWQ/OiBhbnkpOiBQcm9taXNlPFJ1bnRpbWVSZXNwb25zZTxURGF0YT4+ID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlLCBwYXlsb2FkIH0sIChyZXNwb25zZSkgPT4ge1xuICAgICAgaWYgKGNocm9tZS5ydW50aW1lLmxhc3RFcnJvcikge1xuICAgICAgICByZXNvbHZlKHsgb2s6IGZhbHNlLCBlcnJvcjogY2hyb21lLnJ1bnRpbWUubGFzdEVycm9yLm1lc3NhZ2UgfSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHJlc29sdmUocmVzcG9uc2UgfHwgeyBvazogZmFsc2UsIGVycm9yOiBcIk5vIHJlc3BvbnNlIGZyb20gYmFja2dyb3VuZFwiIH0pO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBzZW5kTWVzc2FnZSA9IGFzeW5jIDxURGF0YT4odHlwZTogUnVudGltZU1lc3NhZ2VbXCJ0eXBlXCJdLCBwYXlsb2FkPzogYW55KTogUHJvbWlzZTxSdW50aW1lUmVzcG9uc2U8VERhdGE+PiA9PiB7XG4gIGNvbnN0IGZpcnN0QXR0ZW1wdCA9IGF3YWl0IHNlbmRNZXNzYWdlT25jZTxURGF0YT4odHlwZSwgcGF5bG9hZCk7XG4gIGlmIChmaXJzdEF0dGVtcHQub2sgfHwgZmlyc3RBdHRlbXB0LmVycm9yICE9PSBSRUNFSVZJTkdfRU5EX0VSUk9SKSB7XG4gICAgaWYgKCFmaXJzdEF0dGVtcHQub2sgJiYgZmlyc3RBdHRlbXB0LmVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiUnVudGltZSBlcnJvcjpcIiwgZmlyc3RBdHRlbXB0LmVycm9yKTtcbiAgICB9XG4gICAgcmV0dXJuIGZpcnN0QXR0ZW1wdDtcbiAgfVxuXG4gIC8vIEluIE1WMyB0aGUgc2VydmljZSB3b3JrZXIgY2FuIGJlIGNvbGQtc3RhcnRlZC4gQSBzaG9ydCByZXRyeSBhdm9pZHMgdHJhbnNpZW50XG4gIC8vIFwiUmVjZWl2aW5nIGVuZCBkb2VzIG5vdCBleGlzdFwiIGZhaWx1cmVzIHdoZW4gcG9wdXAgYWN0aW9ucyByYWNlIHdvcmtlciBzdGFydHVwLlxuICBhd2FpdCBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxNTApKTtcbiAgY29uc3QgcmV0cnlBdHRlbXB0ID0gYXdhaXQgc2VuZE1lc3NhZ2VPbmNlPFREYXRhPih0eXBlLCBwYXlsb2FkKTtcbiAgaWYgKCFyZXRyeUF0dGVtcHQub2sgJiYgcmV0cnlBdHRlbXB0LmVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihcIlJ1bnRpbWUgZXJyb3I6XCIsIHJldHJ5QXR0ZW1wdC5lcnJvcik7XG4gIH1cbiAgcmV0dXJuIHJldHJ5QXR0ZW1wdDtcbn07XG5cbmV4cG9ydCB0eXBlIFRhYldpdGhHcm91cCA9IFRhYk1ldGFkYXRhICYge1xuICBncm91cExhYmVsPzogc3RyaW5nO1xuICBncm91cENvbG9yPzogc3RyaW5nO1xuICByZWFzb24/OiBzdHJpbmc7XG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFdpbmRvd1ZpZXcge1xuICBpZDogbnVtYmVyO1xuICB0aXRsZTogc3RyaW5nO1xuICB0YWJzOiBUYWJXaXRoR3JvdXBbXTtcbiAgdGFiQ291bnQ6IG51bWJlcjtcbiAgZ3JvdXBDb3VudDogbnVtYmVyO1xuICBwaW5uZWRDb3VudDogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgSUNPTlMgPSB7XG4gIGFjdGl2ZTogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwb2x5Z29uIHBvaW50cz1cIjMgMTEgMjIgMiAxMyAyMSAxMSAxMyAzIDExXCI+PC9wb2x5Z29uPjwvc3ZnPmAsXG4gIGhpZGU6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cGF0aCBkPVwiTTE3Ljk0IDE3Ljk0QTEwLjA3IDEwLjA3IDAgMCAxIDEyIDIwYy03IDAtMTEtOC0xMS04YTE4LjQ1IDE4LjQ1IDAgMCAxIDUuMDYtNS45NE05LjkgNC4yNEE5LjEyIDkuMTIgMCAwIDEgMTIgNGM3IDAgMTEgOCAxMSA4YTE4LjUgMTguNSAwIDAgMS0yLjE2IDMuMTltLTYuNzItMS4wN2EzIDMgMCAxIDEtNC4yNC00LjI0XCI+PC9wYXRoPjxsaW5lIHgxPVwiMVwiIHkxPVwiMVwiIHgyPVwiMjNcIiB5Mj1cIjIzXCI+PC9saW5lPjwvc3ZnPmAsXG4gIHNob3c6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cGF0aCBkPVwiTTEgMTJzNC04IDExLTggMTEgOCAxMSA4LTQgOC0xMSA4LTExLTgtMTEtOC0xMS04elwiPjwvcGF0aD48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjNcIj48L2NpcmNsZT48L3N2Zz5gLFxuICBmb2N1czogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxjaXJjbGUgY3g9XCIxMlwiIGN5PVwiMTJcIiByPVwiMTBcIj48L2NpcmNsZT48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjZcIj48L2NpcmNsZT48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjJcIj48L2NpcmNsZT48L3N2Zz5gLFxuICBjbG9zZTogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxsaW5lIHgxPVwiMThcIiB5MT1cIjZcIiB4Mj1cIjZcIiB5Mj1cIjE4XCI+PC9saW5lPjxsaW5lIHgxPVwiNlwiIHkxPVwiNlwiIHgyPVwiMThcIiB5Mj1cIjE4XCI+PC9saW5lPjwvc3ZnPmAsXG4gIHVuZ3JvdXA6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjEwXCI+PC9jaXJjbGU+PGxpbmUgeDE9XCI4XCIgeTE9XCIxMlwiIHgyPVwiMTZcIiB5Mj1cIjEyXCI+PC9saW5lPjwvc3ZnPmAsXG4gIGRlZmF1bHRGaWxlOiBgPHN2ZyB3aWR0aD1cIjI0XCIgaGVpZ2h0PVwiMjRcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBhdGggZD1cIk0xNCAySDZhMiAyIDAgMCAwLTIgMnYxNmEyIDIgMCAwIDAgMiAyaDEyYTIgMiAwIDAgMCAyLTJWOHpcIj48L3BhdGg+PHBvbHlsaW5lIHBvaW50cz1cIjE0IDIgMTQgOCAyMCA4XCI+PC9wb2x5bGluZT48bGluZSB4MT1cIjE2XCIgeTE9XCIxM1wiIHgyPVwiOFwiIHkyPVwiMTNcIj48L2xpbmU+PGxpbmUgeDE9XCIxNlwiIHkxPVwiMTdcIiB4Mj1cIjhcIiB5Mj1cIjE3XCI+PC9saW5lPjxwb2x5bGluZSBwb2ludHM9XCIxMCA5IDkgOSA4IDlcIj48L3BvbHlsaW5lPjwvc3ZnPmAsXG4gIGF1dG9SdW46IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cG9seWdvbiBwb2ludHM9XCIxMyAyIDMgMTQgMTIgMTQgMTEgMjIgMjEgMTAgMTIgMTAgMTMgMlwiPjwvcG9seWdvbj48L3N2Zz5gXG59O1xuXG5leHBvcnQgY29uc3QgR1JPVVBfQ09MT1JTOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICBncmV5OiBcIiM2NDc0OGJcIixcbiAgYmx1ZTogXCIjM2I4MmY2XCIsXG4gIHJlZDogXCIjZWY0NDQ0XCIsXG4gIHllbGxvdzogXCIjZWFiMzA4XCIsXG4gIGdyZWVuOiBcIiMyMmM1NWVcIixcbiAgcGluazogXCIjZWM0ODk5XCIsXG4gIHB1cnBsZTogXCIjYTg1NWY3XCIsXG4gIGN5YW46IFwiIzA2YjZkNFwiLFxuICBvcmFuZ2U6IFwiI2Y5NzMxNlwiXG59O1xuXG5leHBvcnQgY29uc3QgZ2V0R3JvdXBDb2xvciA9IChuYW1lOiBzdHJpbmcpID0+IEdST1VQX0NPTE9SU1tuYW1lXSB8fCBcIiNjYmQ1ZTFcIjtcblxuZXhwb3J0IGNvbnN0IGZldGNoU3RhdGUgPSBhc3luYyAoKSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBzZW5kTWVzc2FnZTx7IGdyb3VwczogVGFiR3JvdXBbXTsgcHJlZmVyZW5jZXM6IFByZWZlcmVuY2VzIH0+KFwiZ2V0U3RhdGVcIik7XG4gICAgaWYgKHJlc3BvbnNlLm9rICYmIHJlc3BvbnNlLmRhdGEpIHtcbiAgICAgIHJldHVybiByZXNwb25zZTtcbiAgICB9XG4gICAgY29uc29sZS53YXJuKFwiZmV0Y2hTdGF0ZSBmYWlsZWQsIHVzaW5nIGZhbGxiYWNrOlwiLCByZXNwb25zZS5lcnJvcik7XG4gICAgcmV0dXJuIGF3YWl0IGZldGNoTG9jYWxTdGF0ZSgpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgY29uc29sZS53YXJuKFwiZmV0Y2hTdGF0ZSB0aHJldyBleGNlcHRpb24sIHVzaW5nIGZhbGxiYWNrOlwiLCBlKTtcbiAgICByZXR1cm4gYXdhaXQgZmV0Y2hMb2NhbFN0YXRlKCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBhcHBseUdyb3VwaW5nID0gYXN5bmMgKHBheWxvYWQ6IEFwcGx5R3JvdXBpbmdQYXlsb2FkKSA9PiB7XG4gIHJldHVybiBzZW5kTWVzc2FnZShcImFwcGx5R3JvdXBpbmdcIiwgcGF5bG9hZCk7XG59O1xuXG5leHBvcnQgY29uc3QgYXBwbHlTb3J0aW5nID0gYXN5bmMgKHBheWxvYWQ6IEFwcGx5R3JvdXBpbmdQYXlsb2FkKSA9PiB7XG4gIHJldHVybiBzZW5kTWVzc2FnZShcImFwcGx5U29ydGluZ1wiLCBwYXlsb2FkKTtcbn07XG5cbmV4cG9ydCBjb25zdCBtYXBXaW5kb3dzID0gKGdyb3VwczogVGFiR3JvdXBbXSwgd2luZG93VGl0bGVzOiBNYXA8bnVtYmVyLCBzdHJpbmc+KTogV2luZG93Vmlld1tdID0+IHtcbiAgY29uc3Qgd2luZG93cyA9IG5ldyBNYXA8bnVtYmVyLCBUYWJXaXRoR3JvdXBbXT4oKTtcblxuICBncm91cHMuZm9yRWFjaCgoZ3JvdXApID0+IHtcbiAgICBjb25zdCBpc1VuZ3JvdXBlZCA9IGdyb3VwLnJlYXNvbiA9PT0gXCJVbmdyb3VwZWRcIjtcbiAgICBncm91cC50YWJzLmZvckVhY2goKHRhYikgPT4ge1xuICAgICAgY29uc3QgZGVjb3JhdGVkOiBUYWJXaXRoR3JvdXAgPSB7XG4gICAgICAgIC4uLnRhYixcbiAgICAgICAgZ3JvdXBMYWJlbDogaXNVbmdyb3VwZWQgPyB1bmRlZmluZWQgOiBncm91cC5sYWJlbCxcbiAgICAgICAgZ3JvdXBDb2xvcjogaXNVbmdyb3VwZWQgPyB1bmRlZmluZWQgOiBncm91cC5jb2xvcixcbiAgICAgICAgcmVhc29uOiBncm91cC5yZWFzb25cbiAgICAgIH07XG4gICAgICBjb25zdCBleGlzdGluZyA9IHdpbmRvd3MuZ2V0KHRhYi53aW5kb3dJZCkgPz8gW107XG4gICAgICBleGlzdGluZy5wdXNoKGRlY29yYXRlZCk7XG4gICAgICB3aW5kb3dzLnNldCh0YWIud2luZG93SWQsIGV4aXN0aW5nKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgcmV0dXJuIEFycmF5LmZyb20od2luZG93cy5lbnRyaWVzKCkpXG4gICAgLm1hcDxXaW5kb3dWaWV3PigoW2lkLCB0YWJzXSkgPT4ge1xuICAgICAgY29uc3QgZ3JvdXBDb3VudCA9IG5ldyBTZXQodGFicy5tYXAoKHRhYikgPT4gdGFiLmdyb3VwTGFiZWwpLmZpbHRlcigobCk6IGwgaXMgc3RyaW5nID0+ICEhbCkpLnNpemU7XG4gICAgICBjb25zdCBwaW5uZWRDb3VudCA9IHRhYnMuZmlsdGVyKCh0YWIpID0+IHRhYi5waW5uZWQpLmxlbmd0aDtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGlkLFxuICAgICAgICB0aXRsZTogd2luZG93VGl0bGVzLmdldChpZCkgPz8gYFdpbmRvdyAke2lkfWAsXG4gICAgICAgIHRhYnMsXG4gICAgICAgIHRhYkNvdW50OiB0YWJzLmxlbmd0aCxcbiAgICAgICAgZ3JvdXBDb3VudCxcbiAgICAgICAgcGlubmVkQ291bnRcbiAgICAgIH07XG4gICAgfSlcbiAgICAuc29ydCgoYSwgYikgPT4gYS5pZCAtIGIuaWQpO1xufTtcblxuZXhwb3J0IGNvbnN0IGZvcm1hdERvbWFpbiA9ICh1cmw6IHN0cmluZykgPT4ge1xuICBjb25zdCBob3N0bmFtZSA9IGdldEhvc3RuYW1lKHVybCk7XG4gIGlmIChob3N0bmFtZSkge1xuICAgIHJldHVybiBob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgXCJcIik7XG4gIH1cbiAgcmV0dXJuIHVybDtcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXREcmFnQWZ0ZXJFbGVtZW50KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHk6IG51bWJlciwgc2VsZWN0b3I6IHN0cmluZykge1xuICBjb25zdCBkcmFnZ2FibGVFbGVtZW50cyA9IEFycmF5LmZyb20oY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpKTtcblxuICByZXR1cm4gZHJhZ2dhYmxlRWxlbWVudHMucmVkdWNlKChjbG9zZXN0LCBjaGlsZCkgPT4ge1xuICAgIGNvbnN0IGJveCA9IGNoaWxkLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIGNvbnN0IG9mZnNldCA9IHkgLSBib3gudG9wIC0gYm94LmhlaWdodCAvIDI7XG4gICAgaWYgKG9mZnNldCA8IDAgJiYgb2Zmc2V0ID4gY2xvc2VzdC5vZmZzZXQpIHtcbiAgICAgIHJldHVybiB7IG9mZnNldDogb2Zmc2V0LCBlbGVtZW50OiBjaGlsZCB9O1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gY2xvc2VzdDtcbiAgICB9XG4gIH0sIHsgb2Zmc2V0OiBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFksIGVsZW1lbnQ6IG51bGwgYXMgRWxlbWVudCB8IG51bGwgfSkuZWxlbWVudDtcbn1cbiIsICJpbXBvcnQge1xuICBHcm91cGluZ1NlbGVjdGlvbixcbiAgUHJlZmVyZW5jZXMsXG4gIFNhdmVkU3RhdGUsXG4gIFNvcnRpbmdTdHJhdGVneSxcbiAgTG9nTGV2ZWwsXG4gIFRhYkdyb3VwXG59IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7XG4gIGFwcGx5R3JvdXBpbmcsXG4gIGFwcGx5U29ydGluZyxcbiAgZmV0Y2hTdGF0ZSxcbiAgSUNPTlMsXG4gIG1hcFdpbmRvd3MsXG4gIHNlbmRNZXNzYWdlLFxuICBUYWJXaXRoR3JvdXAsXG4gIFdpbmRvd1ZpZXcsXG4gIEdST1VQX0NPTE9SUyxcbiAgZ2V0RHJhZ0FmdGVyRWxlbWVudFxufSBmcm9tIFwiLi9jb21tb24uanNcIjtcbmltcG9ydCB7IGdldFN0cmF0ZWdpZXMsIFNUUkFURUdJRVMsIFN0cmF0ZWd5RGVmaW5pdGlvbiB9IGZyb20gXCIuLi9zaGFyZWQvc3RyYXRlZ3lSZWdpc3RyeS5qc1wiO1xuaW1wb3J0IHsgc2V0TG9nZ2VyUHJlZmVyZW5jZXMsIGxvZ0RlYnVnLCBsb2dJbmZvIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGZldGNoTG9jYWxTdGF0ZSB9IGZyb20gXCIuL2xvY2FsU3RhdGUuanNcIjtcblxuLy8gRWxlbWVudHNcbmNvbnN0IHNlYXJjaElucHV0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ0YWJTZWFyY2hcIikgYXMgSFRNTElucHV0RWxlbWVudDtcbmNvbnN0IHdpbmRvd3NDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIndpbmRvd3NcIikgYXMgSFRNTERpdkVsZW1lbnQ7XG5cbmNvbnN0IHNlbGVjdEFsbENoZWNrYm94ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzZWxlY3RBbGxcIikgYXMgSFRNTElucHV0RWxlbWVudDtcbmNvbnN0IGJ0bkFwcGx5ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5BcHBseVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcbmNvbnN0IGJ0blVuZ3JvdXAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0blVuZ3JvdXBcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5jb25zdCBidG5NZXJnZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuTWVyZ2VcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5jb25zdCBidG5TcGxpdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuU3BsaXRcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5jb25zdCBidG5FeHBhbmRBbGwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0bkV4cGFuZEFsbFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcbmNvbnN0IGJ0bkNvbGxhcHNlQWxsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5Db2xsYXBzZUFsbFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcblxuY29uc3QgYWN0aXZlU3RyYXRlZ2llc0xpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImFjdGl2ZVN0cmF0ZWdpZXNMaXN0XCIpIGFzIEhUTUxEaXZFbGVtZW50O1xuY29uc3QgYWRkU3RyYXRlZ3lTZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImFkZFN0cmF0ZWd5U2VsZWN0XCIpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuXG4vLyBTdGF0c1xuY29uc3Qgc3RhdFRhYnMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInN0YXRUYWJzXCIpIGFzIEhUTUxFbGVtZW50O1xuY29uc3Qgc3RhdEdyb3VwcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3RhdEdyb3Vwc1wiKSBhcyBIVE1MRWxlbWVudDtcbmNvbnN0IHN0YXRXaW5kb3dzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzdGF0V2luZG93c1wiKSBhcyBIVE1MRWxlbWVudDtcblxuY29uc3QgcHJvZ3Jlc3NPdmVybGF5ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJwcm9ncmVzc092ZXJsYXlcIikgYXMgSFRNTERpdkVsZW1lbnQ7XG5jb25zdCBwcm9ncmVzc1RleHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInByb2dyZXNzVGV4dFwiKSBhcyBIVE1MRGl2RWxlbWVudDtcbmNvbnN0IHByb2dyZXNzQ291bnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInByb2dyZXNzQ291bnRcIikgYXMgSFRNTERpdkVsZW1lbnQ7XG5cbmNvbnN0IHNob3dMb2FkaW5nID0gKHRleHQ6IHN0cmluZykgPT4ge1xuICAgIGlmIChwcm9ncmVzc092ZXJsYXkpIHtcbiAgICAgICAgcHJvZ3Jlc3NUZXh0LnRleHRDb250ZW50ID0gdGV4dDtcbiAgICAgICAgcHJvZ3Jlc3NDb3VudC50ZXh0Q29udGVudCA9IFwiXCI7XG4gICAgICAgIHByb2dyZXNzT3ZlcmxheS5jbGFzc0xpc3QucmVtb3ZlKFwiaGlkZGVuXCIpO1xuICAgIH1cbn07XG5cbmNvbnN0IGhpZGVMb2FkaW5nID0gKCkgPT4ge1xuICAgIGlmIChwcm9ncmVzc092ZXJsYXkpIHtcbiAgICAgICAgcHJvZ3Jlc3NPdmVybGF5LmNsYXNzTGlzdC5hZGQoXCJoaWRkZW5cIik7XG4gICAgfVxufTtcblxuY29uc3QgdXBkYXRlUHJvZ3Jlc3MgPSAoY29tcGxldGVkOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+IHtcbiAgICBpZiAocHJvZ3Jlc3NPdmVybGF5ICYmICFwcm9ncmVzc092ZXJsYXkuY2xhc3NMaXN0LmNvbnRhaW5zKFwiaGlkZGVuXCIpKSB7XG4gICAgICAgIHByb2dyZXNzQ291bnQudGV4dENvbnRlbnQgPSBgJHtjb21wbGV0ZWR9IC8gJHt0b3RhbH1gO1xuICAgIH1cbn07XG5cbmxldCB3aW5kb3dTdGF0ZTogV2luZG93Vmlld1tdID0gW107XG5sZXQgZm9jdXNlZFdpbmRvd0lkOiBudW1iZXIgfCBudWxsID0gbnVsbDtcbmNvbnN0IHNlbGVjdGVkVGFicyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xubGV0IGluaXRpYWxTZWxlY3Rpb25Eb25lID0gZmFsc2U7XG5sZXQgcHJlZmVyZW5jZXM6IFByZWZlcmVuY2VzIHwgbnVsbCA9IG51bGw7XG5sZXQgbG9jYWxQcmVmZXJlbmNlc01vZGlmaWVkVGltZSA9IDA7XG5cbi8vIFRyZWUgU3RhdGVcbmNvbnN0IGV4cGFuZGVkTm9kZXMgPSBuZXcgU2V0PHN0cmluZz4oKTsgLy8gRGVmYXVsdCBlbXB0eSA9IGFsbCBjb2xsYXBzZWRcbmNvbnN0IFRSRUVfSUNPTlMgPSB7XG4gIGNoZXZyb25SaWdodDogYDxzdmcgd2lkdGg9XCIxMDAlXCIgaGVpZ2h0PVwiMTAwJVwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cG9seWxpbmUgcG9pbnRzPVwiOSAxOCAxNSAxMiA5IDZcIj48L3BvbHlsaW5lPjwvc3ZnPmAsXG4gIGZvbGRlcjogYDxzdmcgd2lkdGg9XCIxMDAlXCIgaGVpZ2h0PVwiMTAwJVwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cGF0aCBkPVwiTTIyIDE5YTIgMiAwIDAgMS0yIDJINGEyIDIgMCAwIDEtMi0yVjVhMiAyIDAgMCAxIDItMmg1bDIgM2g5YTIgMiAwIDAgMSAyIDJ6XCI+PC9wYXRoPjwvc3ZnPmBcbn07XG5cbmNvbnN0IGhleFRvUmdiYSA9IChoZXg6IHN0cmluZywgYWxwaGE6IG51bWJlcikgPT4ge1xuICAgIC8vIEVuc3VyZSBoZXggZm9ybWF0XG4gICAgaWYgKCFoZXguc3RhcnRzV2l0aCgnIycpKSByZXR1cm4gaGV4O1xuICAgIGNvbnN0IHIgPSBwYXJzZUludChoZXguc2xpY2UoMSwgMyksIDE2KTtcbiAgICBjb25zdCBnID0gcGFyc2VJbnQoaGV4LnNsaWNlKDMsIDUpLCAxNik7XG4gICAgY29uc3QgYiA9IHBhcnNlSW50KGhleC5zbGljZSg1LCA3KSwgMTYpO1xuICAgIHJldHVybiBgcmdiYSgke3J9LCAke2d9LCAke2J9LCAke2FscGhhfSlgO1xufTtcblxuY29uc3QgdXBkYXRlU3RhdHMgPSAoKSA9PiB7XG4gIGNvbnN0IHRvdGFsVGFicyA9IHdpbmRvd1N0YXRlLnJlZHVjZSgoYWNjLCB3aW4pID0+IGFjYyArIHdpbi50YWJDb3VudCwgMCk7XG4gIGNvbnN0IHRvdGFsR3JvdXBzID0gbmV3IFNldCh3aW5kb3dTdGF0ZS5mbGF0TWFwKHcgPT4gdy50YWJzLmZpbHRlcih0ID0+IHQuZ3JvdXBMYWJlbCkubWFwKHQgPT4gYCR7dy5pZH0tJHt0Lmdyb3VwTGFiZWx9YCkpKS5zaXplO1xuXG4gIHN0YXRUYWJzLnRleHRDb250ZW50ID0gYCR7dG90YWxUYWJzfSBUYWJzYDtcbiAgc3RhdEdyb3Vwcy50ZXh0Q29udGVudCA9IGAke3RvdGFsR3JvdXBzfSBHcm91cHNgO1xuICBzdGF0V2luZG93cy50ZXh0Q29udGVudCA9IGAke3dpbmRvd1N0YXRlLmxlbmd0aH0gV2luZG93c2A7XG5cbiAgLy8gVXBkYXRlIHNlbGVjdGlvbiBidXR0b25zXG4gIGNvbnN0IGhhc1NlbGVjdGlvbiA9IHNlbGVjdGVkVGFicy5zaXplID4gMDtcbiAgYnRuVW5ncm91cC5kaXNhYmxlZCA9ICFoYXNTZWxlY3Rpb247XG4gIGJ0bk1lcmdlLmRpc2FibGVkID0gIWhhc1NlbGVjdGlvbjtcbiAgYnRuU3BsaXQuZGlzYWJsZWQgPSAhaGFzU2VsZWN0aW9uO1xuXG4gIGJ0blVuZ3JvdXAuc3R5bGUub3BhY2l0eSA9IGhhc1NlbGVjdGlvbiA/IFwiMVwiIDogXCIwLjVcIjtcbiAgYnRuTWVyZ2Uuc3R5bGUub3BhY2l0eSA9IGhhc1NlbGVjdGlvbiA/IFwiMVwiIDogXCIwLjVcIjtcbiAgYnRuU3BsaXQuc3R5bGUub3BhY2l0eSA9IGhhc1NlbGVjdGlvbiA/IFwiMVwiIDogXCIwLjVcIjtcblxuICAvLyBVcGRhdGUgU2VsZWN0IEFsbCBDaGVja2JveCBTdGF0ZVxuICBpZiAodG90YWxUYWJzID09PSAwKSB7XG4gICAgc2VsZWN0QWxsQ2hlY2tib3guY2hlY2tlZCA9IGZhbHNlO1xuICAgIHNlbGVjdEFsbENoZWNrYm94LmluZGV0ZXJtaW5hdGUgPSBmYWxzZTtcbiAgfSBlbHNlIGlmIChzZWxlY3RlZFRhYnMuc2l6ZSA9PT0gdG90YWxUYWJzKSB7XG4gICAgc2VsZWN0QWxsQ2hlY2tib3guY2hlY2tlZCA9IHRydWU7XG4gICAgc2VsZWN0QWxsQ2hlY2tib3guaW5kZXRlcm1pbmF0ZSA9IGZhbHNlO1xuICB9IGVsc2UgaWYgKHNlbGVjdGVkVGFicy5zaXplID4gMCkge1xuICAgIHNlbGVjdEFsbENoZWNrYm94LmNoZWNrZWQgPSBmYWxzZTtcbiAgICBzZWxlY3RBbGxDaGVja2JveC5pbmRldGVybWluYXRlID0gdHJ1ZTtcbiAgfSBlbHNlIHtcbiAgICBzZWxlY3RBbGxDaGVja2JveC5jaGVja2VkID0gZmFsc2U7XG4gICAgc2VsZWN0QWxsQ2hlY2tib3guaW5kZXRlcm1pbmF0ZSA9IGZhbHNlO1xuICB9XG59O1xuXG5jb25zdCBjcmVhdGVOb2RlID0gKFxuICAgIGNvbnRlbnQ6IEhUTUxFbGVtZW50LFxuICAgIGNoaWxkcmVuQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IG51bGwsXG4gICAgbGV2ZWw6ICd3aW5kb3cnIHwgJ2dyb3VwJyB8ICd0YWInLFxuICAgIGlzRXhwYW5kZWQ6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICBvblRvZ2dsZT86ICgpID0+IHZvaWRcbikgPT4ge1xuICAgIGNvbnN0IG5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIG5vZGUuY2xhc3NOYW1lID0gYHRyZWUtbm9kZSBub2RlLSR7bGV2ZWx9YDtcblxuICAgIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgcm93LmNsYXNzTmFtZSA9IGB0cmVlLXJvdyAke2xldmVsfS1yb3dgO1xuXG4gICAgLy8gVG9nZ2xlXG4gICAgY29uc3QgdG9nZ2xlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICB0b2dnbGUuY2xhc3NOYW1lID0gYHRyZWUtdG9nZ2xlICR7aXNFeHBhbmRlZCA/ICdyb3RhdGVkJyA6ICcnfWA7XG4gICAgaWYgKGNoaWxkcmVuQ29udGFpbmVyKSB7XG4gICAgICAgIHRvZ2dsZS5pbm5lckhUTUwgPSBUUkVFX0lDT05TLmNoZXZyb25SaWdodDtcbiAgICAgICAgdG9nZ2xlLm9uY2xpY2sgPSAoZSkgPT4ge1xuICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgIGlmIChvblRvZ2dsZSkgb25Ub2dnbGUoKTtcbiAgICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB0b2dnbGUuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG4gICAgfVxuXG4gICAgcm93LmFwcGVuZENoaWxkKHRvZ2dsZSk7XG4gICAgcm93LmFwcGVuZENoaWxkKGNvbnRlbnQpOyAvLyBDb250ZW50IGhhbmRsZXMgY2hlY2tib3ggKyBpY29uICsgdGV4dCArIGFjdGlvbnNcblxuICAgIG5vZGUuYXBwZW5kQ2hpbGQocm93KTtcblxuICAgIGlmIChjaGlsZHJlbkNvbnRhaW5lcikge1xuICAgICAgICBjaGlsZHJlbkNvbnRhaW5lci5jbGFzc05hbWUgPSBgdHJlZS1jaGlsZHJlbiAke2lzRXhwYW5kZWQgPyAnZXhwYW5kZWQnIDogJyd9YDtcbiAgICAgICAgbm9kZS5hcHBlbmRDaGlsZChjaGlsZHJlbkNvbnRhaW5lcik7XG4gICAgfVxuXG4gICAgLy8gVG9nZ2xlIGludGVyYWN0aW9uIG9uIHJvdyBjbGljayBmb3IgV2luZG93cyBhbmQgR3JvdXBzXG4gICAgaWYgKGNoaWxkcmVuQ29udGFpbmVyICYmIGxldmVsICE9PSAndGFiJykge1xuICAgICAgICByb3cuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgICAgICAgICAgLy8gQXZvaWQgdG9nZ2xpbmcgaWYgY2xpY2tpbmcgYWN0aW9ucyBvciBjaGVja2JveFxuICAgICAgICAgICAgaWYgKChlLnRhcmdldCBhcyBIVE1MRWxlbWVudCkuY2xvc2VzdCgnLmFjdGlvbi1idG4nKSB8fCAoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpLmNsb3Nlc3QoJy50cmVlLWNoZWNrYm94JykpIHJldHVybjtcbiAgICAgICAgICAgIGlmIChvblRvZ2dsZSkgb25Ub2dnbGUoKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgbm9kZSwgdG9nZ2xlLCBjaGlsZHJlbkNvbnRhaW5lciB9O1xufTtcblxuY29uc3QgcmVuZGVyVGFiTm9kZSA9ICh0YWI6IFRhYldpdGhHcm91cCkgPT4ge1xuICAgIGNvbnN0IHRhYkNvbnRlbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIHRhYkNvbnRlbnQuc3R5bGUuZGlzcGxheSA9IFwiZmxleFwiO1xuICAgIHRhYkNvbnRlbnQuc3R5bGUuYWxpZ25JdGVtcyA9IFwiY2VudGVyXCI7XG4gICAgdGFiQ29udGVudC5zdHlsZS5mbGV4ID0gXCIxXCI7XG4gICAgdGFiQ29udGVudC5zdHlsZS5vdmVyZmxvdyA9IFwiaGlkZGVuXCI7XG5cbiAgICAvLyBUYWIgQ2hlY2tib3hcbiAgICBjb25zdCB0YWJDaGVja2JveCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbnB1dFwiKTtcbiAgICB0YWJDaGVja2JveC50eXBlID0gXCJjaGVja2JveFwiO1xuICAgIHRhYkNoZWNrYm94LmNsYXNzTmFtZSA9IFwidHJlZS1jaGVja2JveFwiO1xuICAgIHRhYkNoZWNrYm94LmNoZWNrZWQgPSBzZWxlY3RlZFRhYnMuaGFzKHRhYi5pZCk7XG4gICAgdGFiQ2hlY2tib3gub25jbGljayA9IChlKSA9PiB7XG4gICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgIGlmICh0YWJDaGVja2JveC5jaGVja2VkKSBzZWxlY3RlZFRhYnMuYWRkKHRhYi5pZCk7XG4gICAgICAgIGVsc2Ugc2VsZWN0ZWRUYWJzLmRlbGV0ZSh0YWIuaWQpO1xuICAgICAgICByZW5kZXJUcmVlKCk7XG4gICAgfTtcblxuICAgIGNvbnN0IHRhYkljb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIHRhYkljb24uY2xhc3NOYW1lID0gXCJ0cmVlLWljb25cIjtcbiAgICBpZiAodGFiLmZhdkljb25VcmwpIHtcbiAgICAgICAgY29uc3QgaW1nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImltZ1wiKTtcbiAgICAgICAgaW1nLnNyYyA9IHRhYi5mYXZJY29uVXJsO1xuICAgICAgICBpbWcub25lcnJvciA9ICgpID0+IHsgdGFiSWNvbi5pbm5lckhUTUwgPSBJQ09OUy5kZWZhdWx0RmlsZTsgfTtcbiAgICAgICAgdGFiSWNvbi5hcHBlbmRDaGlsZChpbWcpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRhYkljb24uaW5uZXJIVE1MID0gSUNPTlMuZGVmYXVsdEZpbGU7XG4gICAgfVxuXG4gICAgY29uc3QgdGFiVGl0bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIHRhYlRpdGxlLmNsYXNzTmFtZSA9IFwidHJlZS1sYWJlbFwiO1xuICAgIHRhYlRpdGxlLnRleHRDb250ZW50ID0gdGFiLnRpdGxlO1xuICAgIHRhYlRpdGxlLnRpdGxlID0gdGFiLnRpdGxlO1xuXG4gICAgY29uc3QgdGFiQWN0aW9ucyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgdGFiQWN0aW9ucy5jbGFzc05hbWUgPSBcInJvdy1hY3Rpb25zXCI7XG4gICAgY29uc3QgY2xvc2VCdG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICAgIGNsb3NlQnRuLmNsYXNzTmFtZSA9IFwiYWN0aW9uLWJ0biBkZWxldGVcIjtcbiAgICBjbG9zZUJ0bi5pbm5lckhUTUwgPSBJQ09OUy5jbG9zZTtcbiAgICBjbG9zZUJ0bi50aXRsZSA9IFwiQ2xvc2UgVGFiXCI7XG4gICAgY2xvc2VCdG4ub25jbGljayA9IGFzeW5jIChlKSA9PiB7XG4gICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgIGF3YWl0IGNocm9tZS50YWJzLnJlbW92ZSh0YWIuaWQpO1xuICAgICAgICBhd2FpdCBsb2FkU3RhdGUoKTtcbiAgICB9O1xuICAgIHRhYkFjdGlvbnMuYXBwZW5kQ2hpbGQoY2xvc2VCdG4pO1xuXG4gICAgdGFiQ29udGVudC5hcHBlbmQodGFiQ2hlY2tib3gsIHRhYkljb24sIHRhYlRpdGxlLCB0YWJBY3Rpb25zKTtcblxuICAgIGNvbnN0IHsgbm9kZTogdGFiTm9kZSB9ID0gY3JlYXRlTm9kZSh0YWJDb250ZW50LCBudWxsLCAndGFiJyk7XG4gICAgdGFiTm9kZS5vbmNsaWNrID0gYXN5bmMgKGUpID0+IHtcbiAgICAgICAgLy8gQ2xpY2tpbmcgdGFiIHJvdyBhY3RpdmF0ZXMgdGFiICh1bmxlc3MgY2xpY2tpbmcgY2hlY2tib3gvYWN0aW9uKVxuICAgICAgICBpZiAoKGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5jbG9zZXN0KCcudHJlZS1jaGVja2JveCcpKSByZXR1cm47XG4gICAgICAgIGF3YWl0IGNocm9tZS50YWJzLnVwZGF0ZSh0YWIuaWQsIHsgYWN0aXZlOiB0cnVlIH0pO1xuICAgICAgICBhd2FpdCBjaHJvbWUud2luZG93cy51cGRhdGUodGFiLndpbmRvd0lkLCB7IGZvY3VzZWQ6IHRydWUgfSk7XG4gICAgfTtcbiAgICByZXR1cm4gdGFiTm9kZTtcbn07XG5cbmNvbnN0IHJlbmRlckdyb3VwTm9kZSA9IChcbiAgICBncm91cExhYmVsOiBzdHJpbmcsXG4gICAgZ3JvdXBEYXRhOiB7IGNvbG9yOiBzdHJpbmc7IHRhYnM6IFRhYldpdGhHcm91cFtdIH0sXG4gICAgd2luZG93S2V5OiBzdHJpbmcsXG4gICAgcXVlcnk6IHN0cmluZ1xuKSA9PiB7XG4gICAgY29uc3QgZ3JvdXBLZXkgPSBgJHt3aW5kb3dLZXl9LWctJHtncm91cExhYmVsfWA7XG4gICAgY29uc3QgaXNHcm91cEV4cGFuZGVkID0gISFxdWVyeSB8fCBleHBhbmRlZE5vZGVzLmhhcyhncm91cEtleSk7XG5cbiAgICAvLyBHcm91cCBDaGVja2JveCBMb2dpY1xuICAgIGNvbnN0IGdyb3VwVGFiSWRzID0gZ3JvdXBEYXRhLnRhYnMubWFwKHQgPT4gdC5pZCk7XG4gICAgY29uc3QgZ3JwU2VsZWN0ZWRDb3VudCA9IGdyb3VwVGFiSWRzLmZpbHRlcihpZCA9PiBzZWxlY3RlZFRhYnMuaGFzKGlkKSkubGVuZ3RoO1xuICAgIGNvbnN0IGdycElzQWxsID0gZ3JwU2VsZWN0ZWRDb3VudCA9PT0gZ3JvdXBUYWJJZHMubGVuZ3RoICYmIGdyb3VwVGFiSWRzLmxlbmd0aCA+IDA7XG4gICAgY29uc3QgZ3JwSXNTb21lID0gZ3JwU2VsZWN0ZWRDb3VudCA+IDAgJiYgZ3JwU2VsZWN0ZWRDb3VudCA8IGdyb3VwVGFiSWRzLmxlbmd0aDtcblxuICAgIGNvbnN0IGdycENoZWNrYm94ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImlucHV0XCIpO1xuICAgIGdycENoZWNrYm94LnR5cGUgPSBcImNoZWNrYm94XCI7XG4gICAgZ3JwQ2hlY2tib3guY2xhc3NOYW1lID0gXCJ0cmVlLWNoZWNrYm94XCI7XG4gICAgZ3JwQ2hlY2tib3guY2hlY2tlZCA9IGdycElzQWxsO1xuICAgIGdycENoZWNrYm94LmluZGV0ZXJtaW5hdGUgPSBncnBJc1NvbWU7XG4gICAgZ3JwQ2hlY2tib3gub25jbGljayA9IChlKSA9PiB7XG4gICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgIGNvbnN0IHRhcmdldFN0YXRlID0gIWdycElzQWxsO1xuICAgICAgICBncm91cFRhYklkcy5mb3JFYWNoKGlkID0+IHtcbiAgICAgICAgICAgIGlmICh0YXJnZXRTdGF0ZSkgc2VsZWN0ZWRUYWJzLmFkZChpZCk7XG4gICAgICAgICAgICBlbHNlIHNlbGVjdGVkVGFicy5kZWxldGUoaWQpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmVuZGVyVHJlZSgpO1xuICAgIH07XG5cbiAgICAvLyBHcm91cCBDb250ZW50XG4gICAgY29uc3QgZ3JwQ29udGVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgZ3JwQ29udGVudC5zdHlsZS5kaXNwbGF5ID0gXCJmbGV4XCI7XG4gICAgZ3JwQ29udGVudC5zdHlsZS5hbGlnbkl0ZW1zID0gXCJjZW50ZXJcIjtcbiAgICBncnBDb250ZW50LnN0eWxlLmZsZXggPSBcIjFcIjtcbiAgICBncnBDb250ZW50LnN0eWxlLm92ZXJmbG93ID0gXCJoaWRkZW5cIjtcblxuICAgIGNvbnN0IGljb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGljb24uY2xhc3NOYW1lID0gXCJ0cmVlLWljb25cIjtcbiAgICBpY29uLmlubmVySFRNTCA9IFRSRUVfSUNPTlMuZm9sZGVyO1xuXG4gICAgY29uc3QgZ3JwTGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGdycExhYmVsLmNsYXNzTmFtZSA9IFwidHJlZS1sYWJlbFwiO1xuICAgIGdycExhYmVsLnRleHRDb250ZW50ID0gZ3JvdXBMYWJlbDtcblxuICAgIGNvbnN0IGdycENvdW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBncnBDb3VudC5jbGFzc05hbWUgPSBcInRyZWUtY291bnRcIjtcbiAgICBncnBDb3VudC50ZXh0Q29udGVudCA9IGAoJHtncm91cERhdGEudGFicy5sZW5ndGh9KWA7XG5cbiAgICAvLyBHcm91cCBBY3Rpb25zXG4gICAgY29uc3QgYWN0aW9ucyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgYWN0aW9ucy5jbGFzc05hbWUgPSBcInJvdy1hY3Rpb25zXCI7XG4gICAgY29uc3QgdW5ncm91cEJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gICAgdW5ncm91cEJ0bi5jbGFzc05hbWUgPSBcImFjdGlvbi1idG5cIjtcbiAgICB1bmdyb3VwQnRuLmlubmVySFRNTCA9IElDT05TLnVuZ3JvdXA7XG4gICAgdW5ncm91cEJ0bi50aXRsZSA9IFwiVW5ncm91cFwiO1xuICAgIHVuZ3JvdXBCdG4ub25jbGljayA9IGFzeW5jIChlKSA9PiB7XG4gICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgIGlmIChjb25maXJtKGBVbmdyb3VwICR7Z3JvdXBEYXRhLnRhYnMubGVuZ3RofSB0YWJzP2ApKSB7XG4gICAgICAgICAgICBhd2FpdCBjaHJvbWUudGFicy51bmdyb3VwKGdyb3VwRGF0YS50YWJzLm1hcCh0ID0+IHQuaWQpKTtcbiAgICAgICAgICAgIGF3YWl0IGxvYWRTdGF0ZSgpO1xuICAgICAgICB9XG4gICAgfTtcbiAgICBhY3Rpb25zLmFwcGVuZENoaWxkKHVuZ3JvdXBCdG4pO1xuXG4gICAgZ3JwQ29udGVudC5hcHBlbmQoZ3JwQ2hlY2tib3gsIGljb24sIGdycExhYmVsLCBncnBDb3VudCwgYWN0aW9ucyk7XG5cbiAgICAvLyBUYWJzXG4gICAgY29uc3QgdGFic0NvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgZ3JvdXBEYXRhLnRhYnMuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgICB0YWJzQ29udGFpbmVyLmFwcGVuZENoaWxkKHJlbmRlclRhYk5vZGUodGFiKSk7XG4gICAgfSk7XG5cbiAgICBjb25zdCB7IG5vZGU6IGdyb3VwTm9kZSwgdG9nZ2xlOiBncnBUb2dnbGUsIGNoaWxkcmVuQ29udGFpbmVyOiBncnBDaGlsZHJlbiB9ID0gY3JlYXRlTm9kZShcbiAgICAgICAgZ3JwQ29udGVudCxcbiAgICAgICAgdGFic0NvbnRhaW5lcixcbiAgICAgICAgJ2dyb3VwJyxcbiAgICAgICAgaXNHcm91cEV4cGFuZGVkLFxuICAgICAgICAoKSA9PiB7XG4gICAgICAgICAgICBpZiAoZXhwYW5kZWROb2Rlcy5oYXMoZ3JvdXBLZXkpKSBleHBhbmRlZE5vZGVzLmRlbGV0ZShncm91cEtleSk7XG4gICAgICAgICAgICBlbHNlIGV4cGFuZGVkTm9kZXMuYWRkKGdyb3VwS2V5KTtcblxuICAgICAgICAgICAgY29uc3QgZXhwYW5kZWQgPSBleHBhbmRlZE5vZGVzLmhhcyhncm91cEtleSk7XG4gICAgICAgICAgICBncnBUb2dnbGUuY2xhc3NMaXN0LnRvZ2dsZSgncm90YXRlZCcsIGV4cGFuZGVkKTtcbiAgICAgICAgICAgIGdycENoaWxkcmVuIS5jbGFzc0xpc3QudG9nZ2xlKCdleHBhbmRlZCcsIGV4cGFuZGVkKTtcbiAgICAgICAgfVxuICAgICk7XG5cbiAgICAvLyBBcHBseSBiYWNrZ3JvdW5kIGNvbG9yIHRvIGdyb3VwIG5vZGVcbiAgICBpZiAoZ3JvdXBEYXRhLmNvbG9yKSB7XG4gICAgICAgIGNvbnN0IGNvbG9yTmFtZSA9IGdyb3VwRGF0YS5jb2xvcjtcbiAgICAgICAgY29uc3QgaGV4ID0gR1JPVVBfQ09MT1JTW2NvbG9yTmFtZV0gfHwgY29sb3JOYW1lOyAvLyBGYWxsYmFjayBpZiBpdCdzIGFscmVhZHkgaGV4XG4gICAgICAgIGlmIChoZXguc3RhcnRzV2l0aCgnIycpKSB7XG4gICAgICAgICAgICBncm91cE5vZGUuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gaGV4VG9SZ2JhKGhleCwgMC4xKTtcbiAgICAgICAgICAgIGdyb3VwTm9kZS5zdHlsZS5ib3JkZXIgPSBgMXB4IHNvbGlkICR7aGV4VG9SZ2JhKGhleCwgMC4yKX1gO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGdyb3VwTm9kZTtcbn07XG5cbmNvbnN0IHJlbmRlcldpbmRvd05vZGUgPSAod2luZG93OiBXaW5kb3dWaWV3LCB2aXNpYmxlVGFiczogVGFiV2l0aEdyb3VwW10sIHF1ZXJ5OiBzdHJpbmcpID0+IHtcbiAgICBjb25zdCB3aW5kb3dLZXkgPSBgdy0ke3dpbmRvdy5pZH1gO1xuICAgIGNvbnN0IGlzRXhwYW5kZWQgPSAhIXF1ZXJ5IHx8IGV4cGFuZGVkTm9kZXMuaGFzKHdpbmRvd0tleSk7XG5cbiAgICAvLyBXaW5kb3cgQ2hlY2tib3ggTG9naWNcbiAgICBjb25zdCBhbGxUYWJJZHMgPSB2aXNpYmxlVGFicy5tYXAodCA9PiB0LmlkKTtcbiAgICBjb25zdCBzZWxlY3RlZENvdW50ID0gYWxsVGFiSWRzLmZpbHRlcihpZCA9PiBzZWxlY3RlZFRhYnMuaGFzKGlkKSkubGVuZ3RoO1xuICAgIGNvbnN0IGlzQWxsID0gc2VsZWN0ZWRDb3VudCA9PT0gYWxsVGFiSWRzLmxlbmd0aCAmJiBhbGxUYWJJZHMubGVuZ3RoID4gMDtcbiAgICBjb25zdCBpc1NvbWUgPSBzZWxlY3RlZENvdW50ID4gMCAmJiBzZWxlY3RlZENvdW50IDwgYWxsVGFiSWRzLmxlbmd0aDtcblxuICAgIGNvbnN0IHdpbkNoZWNrYm94ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImlucHV0XCIpO1xuICAgIHdpbkNoZWNrYm94LnR5cGUgPSBcImNoZWNrYm94XCI7XG4gICAgd2luQ2hlY2tib3guY2xhc3NOYW1lID0gXCJ0cmVlLWNoZWNrYm94XCI7XG4gICAgd2luQ2hlY2tib3guY2hlY2tlZCA9IGlzQWxsO1xuICAgIHdpbkNoZWNrYm94LmluZGV0ZXJtaW5hdGUgPSBpc1NvbWU7XG4gICAgd2luQ2hlY2tib3gub25jbGljayA9IChlKSA9PiB7XG4gICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgIGNvbnN0IHRhcmdldFN0YXRlID0gIWlzQWxsOyAvLyBJZiBhbGwgd2VyZSBzZWxlY3RlZCwgZGVzZWxlY3QuIE90aGVyd2lzZSBzZWxlY3QgYWxsLlxuICAgICAgICBhbGxUYWJJZHMuZm9yRWFjaChpZCA9PiB7XG4gICAgICAgICAgICBpZiAodGFyZ2V0U3RhdGUpIHNlbGVjdGVkVGFicy5hZGQoaWQpO1xuICAgICAgICAgICAgZWxzZSBzZWxlY3RlZFRhYnMuZGVsZXRlKGlkKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJlbmRlclRyZWUoKTtcbiAgICB9O1xuXG4gICAgLy8gV2luZG93IENvbnRlbnRcbiAgICBjb25zdCB3aW5Db250ZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICB3aW5Db250ZW50LnN0eWxlLmRpc3BsYXkgPSBcImZsZXhcIjtcbiAgICB3aW5Db250ZW50LnN0eWxlLmFsaWduSXRlbXMgPSBcImNlbnRlclwiO1xuICAgIHdpbkNvbnRlbnQuc3R5bGUuZmxleCA9IFwiMVwiO1xuICAgIHdpbkNvbnRlbnQuc3R5bGUub3ZlcmZsb3cgPSBcImhpZGRlblwiO1xuXG4gICAgY29uc3QgbGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGxhYmVsLmNsYXNzTmFtZSA9IFwidHJlZS1sYWJlbFwiO1xuICAgIGxhYmVsLnRleHRDb250ZW50ID0gd2luZG93LnRpdGxlO1xuXG4gICAgY29uc3QgY291bnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGNvdW50LmNsYXNzTmFtZSA9IFwidHJlZS1jb3VudFwiO1xuICAgIGNvdW50LnRleHRDb250ZW50ID0gYCgke3Zpc2libGVUYWJzLmxlbmd0aH0gVGFicylgO1xuXG4gICAgd2luQ29udGVudC5hcHBlbmQod2luQ2hlY2tib3gsIGxhYmVsLCBjb3VudCk7XG5cbiAgICAvLyBDaGlsZHJlbiAoR3JvdXBzKVxuICAgIGNvbnN0IGNoaWxkcmVuQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcblxuICAgIC8vIEdyb3VwIHRhYnNcbiAgICBjb25zdCBncm91cHMgPSBuZXcgTWFwPHN0cmluZywgeyBjb2xvcjogc3RyaW5nOyB0YWJzOiBUYWJXaXRoR3JvdXBbXSB9PigpO1xuICAgIGNvbnN0IHVuZ3JvdXBlZFRhYnM6IFRhYldpdGhHcm91cFtdID0gW107XG4gICAgdmlzaWJsZVRhYnMuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgICBpZiAodGFiLmdyb3VwTGFiZWwpIHtcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IHRhYi5ncm91cExhYmVsO1xuICAgICAgICAgICAgY29uc3QgZW50cnkgPSBncm91cHMuZ2V0KGtleSkgPz8geyBjb2xvcjogdGFiLmdyb3VwQ29sb3IhLCB0YWJzOiBbXSB9O1xuICAgICAgICAgICAgZW50cnkudGFicy5wdXNoKHRhYik7XG4gICAgICAgICAgICBncm91cHMuc2V0KGtleSwgZW50cnkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdW5ncm91cGVkVGFicy5wdXNoKHRhYik7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIEFycmF5LmZyb20oZ3JvdXBzLmVudHJpZXMoKSkuZm9yRWFjaCgoW2dyb3VwTGFiZWwsIGdyb3VwRGF0YV0pID0+IHtcbiAgICAgICAgY2hpbGRyZW5Db250YWluZXIuYXBwZW5kQ2hpbGQocmVuZGVyR3JvdXBOb2RlKGdyb3VwTGFiZWwsIGdyb3VwRGF0YSwgd2luZG93S2V5LCBxdWVyeSkpO1xuICAgIH0pO1xuXG4gICAgdW5ncm91cGVkVGFicy5mb3JFYWNoKHRhYiA9PiB7XG4gICAgICAgIGNoaWxkcmVuQ29udGFpbmVyLmFwcGVuZENoaWxkKHJlbmRlclRhYk5vZGUodGFiKSk7XG4gICAgfSk7XG5cbiAgICBjb25zdCB7IG5vZGU6IHdpbk5vZGUsIHRvZ2dsZTogd2luVG9nZ2xlLCBjaGlsZHJlbkNvbnRhaW5lcjogd2luQ2hpbGRyZW4gfSA9IGNyZWF0ZU5vZGUoXG4gICAgICAgIHdpbkNvbnRlbnQsXG4gICAgICAgIGNoaWxkcmVuQ29udGFpbmVyLFxuICAgICAgICAnd2luZG93JyxcbiAgICAgICAgaXNFeHBhbmRlZCxcbiAgICAgICAgKCkgPT4ge1xuICAgICAgICAgICAgIGlmIChleHBhbmRlZE5vZGVzLmhhcyh3aW5kb3dLZXkpKSBleHBhbmRlZE5vZGVzLmRlbGV0ZSh3aW5kb3dLZXkpO1xuICAgICAgICAgICAgIGVsc2UgZXhwYW5kZWROb2Rlcy5hZGQod2luZG93S2V5KTtcblxuICAgICAgICAgICAgIGNvbnN0IGV4cGFuZGVkID0gZXhwYW5kZWROb2Rlcy5oYXMod2luZG93S2V5KTtcbiAgICAgICAgICAgICB3aW5Ub2dnbGUuY2xhc3NMaXN0LnRvZ2dsZSgncm90YXRlZCcsIGV4cGFuZGVkKTtcbiAgICAgICAgICAgICB3aW5DaGlsZHJlbiEuY2xhc3NMaXN0LnRvZ2dsZSgnZXhwYW5kZWQnLCBleHBhbmRlZCk7XG4gICAgICAgIH1cbiAgICApO1xuXG4gICAgcmV0dXJuIHdpbk5vZGU7XG59O1xuXG5jb25zdCByZW5kZXJUcmVlID0gKCkgPT4ge1xuICBjb25zdCBxdWVyeSA9IHNlYXJjaElucHV0LnZhbHVlLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICB3aW5kb3dzQ29udGFpbmVyLmlubmVySFRNTCA9IFwiXCI7XG5cbiAgLy8gRmlsdGVyIExvZ2ljXG4gIGNvbnN0IGZpbHRlcmVkID0gd2luZG93U3RhdGVcbiAgICAubWFwKCh3aW5kb3cpID0+IHtcbiAgICAgIGlmICghcXVlcnkpIHJldHVybiB7IHdpbmRvdywgdmlzaWJsZVRhYnM6IHdpbmRvdy50YWJzIH07XG4gICAgICBjb25zdCB2aXNpYmxlVGFicyA9IHdpbmRvdy50YWJzLmZpbHRlcihcbiAgICAgICAgKHRhYikgPT4gdGFiLnRpdGxlLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMocXVlcnkpIHx8IHRhYi51cmwudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxdWVyeSlcbiAgICAgICk7XG4gICAgICByZXR1cm4geyB3aW5kb3csIHZpc2libGVUYWJzIH07XG4gICAgfSlcbiAgICAuZmlsdGVyKCh7IHZpc2libGVUYWJzIH0pID0+IHZpc2libGVUYWJzLmxlbmd0aCA+IDAgfHwgIXF1ZXJ5KTtcblxuICBmaWx0ZXJlZC5mb3JFYWNoKCh7IHdpbmRvdywgdmlzaWJsZVRhYnMgfSkgPT4ge1xuICAgIHdpbmRvd3NDb250YWluZXIuYXBwZW5kQ2hpbGQocmVuZGVyV2luZG93Tm9kZSh3aW5kb3csIHZpc2libGVUYWJzLCBxdWVyeSkpO1xuICB9KTtcblxuICB1cGRhdGVTdGF0cygpO1xufTtcblxuLy8gU3RyYXRlZ3kgUmVuZGVyaW5nXG5mdW5jdGlvbiB1cGRhdGVTdHJhdGVneVZpZXdzKHN0cmF0ZWdpZXM6IFN0cmF0ZWd5RGVmaW5pdGlvbltdLCBlbmFibGVkSWRzOiBzdHJpbmdbXSkge1xuICAgIC8vIDEuIFJlbmRlciBBY3RpdmUgU3RyYXRlZ2llc1xuICAgIGFjdGl2ZVN0cmF0ZWdpZXNMaXN0LmlubmVySFRNTCA9ICcnO1xuXG4gICAgLy8gTWFpbnRhaW4gb3JkZXIgZnJvbSBlbmFibGVkSWRzXG4gICAgY29uc3QgZW5hYmxlZFN0cmF0ZWdpZXMgPSBlbmFibGVkSWRzXG4gICAgICAgIC5tYXAoaWQgPT4gc3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gaWQpKVxuICAgICAgICAuZmlsdGVyKChzKTogcyBpcyBTdHJhdGVneURlZmluaXRpb24gPT4gISFzKTtcblxuICAgIGVuYWJsZWRTdHJhdGVnaWVzLmZvckVhY2goc3RyYXRlZ3kgPT4ge1xuICAgICAgICBjb25zdCByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgcm93LmNsYXNzTmFtZSA9ICdzdHJhdGVneS1yb3cnO1xuICAgICAgICByb3cuZGF0YXNldC5pZCA9IHN0cmF0ZWd5LmlkO1xuICAgICAgICByb3cuZHJhZ2dhYmxlID0gdHJ1ZTtcblxuICAgICAgICAvLyBEcmFnIEhhbmRsZVxuICAgICAgICBjb25zdCBoYW5kbGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgaGFuZGxlLmNsYXNzTmFtZSA9ICdzdHJhdGVneS1kcmFnLWhhbmRsZSc7XG4gICAgICAgIGhhbmRsZS5pbm5lckhUTUwgPSAnXHUyMkVFXHUyMkVFJztcblxuICAgICAgICAvLyBMYWJlbFxuICAgICAgICBjb25zdCBsYWJlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcbiAgICAgICAgbGFiZWwuY2xhc3NOYW1lID0gJ3N0cmF0ZWd5LWxhYmVsJztcbiAgICAgICAgbGFiZWwudGV4dENvbnRlbnQgPSBzdHJhdGVneS5sYWJlbDtcblxuICAgICAgICAvLyBUYWdzXG4gICAgICAgIGxldCB0YWdzSHRtbCA9ICcnO1xuICAgICAgICBpZiAoc3RyYXRlZ3kudGFncykge1xuICAgICAgICAgICAgIHN0cmF0ZWd5LnRhZ3MuZm9yRWFjaCh0YWcgPT4ge1xuICAgICAgICAgICAgICAgIHRhZ3NIdG1sICs9IGA8c3BhbiBjbGFzcz1cInRhZyB0YWctJHt0YWd9XCI+JHt0YWd9PC9zcGFuPmA7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNvbnRlbnRXcmFwcGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIGNvbnRlbnRXcmFwcGVyLnN0eWxlLmZsZXggPSBcIjFcIjtcbiAgICAgICAgY29udGVudFdyYXBwZXIuc3R5bGUuZGlzcGxheSA9IFwiZmxleFwiO1xuICAgICAgICBjb250ZW50V3JhcHBlci5zdHlsZS5hbGlnbkl0ZW1zID0gXCJjZW50ZXJcIjtcbiAgICAgICAgY29udGVudFdyYXBwZXIuYXBwZW5kQ2hpbGQobGFiZWwpO1xuICAgICAgICBpZiAodGFnc0h0bWwpIHtcbiAgICAgICAgICAgICBjb25zdCB0YWdzQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuICAgICAgICAgICAgIHRhZ3NDb250YWluZXIuaW5uZXJIVE1MID0gdGFnc0h0bWw7XG4gICAgICAgICAgICAgY29udGVudFdyYXBwZXIuYXBwZW5kQ2hpbGQodGFnc0NvbnRhaW5lcik7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBSZW1vdmUgQnV0dG9uXG4gICAgICAgIGNvbnN0IHJlbW92ZUJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuICAgICAgICByZW1vdmVCdG4uY2xhc3NOYW1lID0gJ3N0cmF0ZWd5LXJlbW92ZS1idG4nO1xuICAgICAgICByZW1vdmVCdG4uaW5uZXJIVE1MID0gSUNPTlMuY2xvc2U7IC8vIFVzZSBJY29uIGZvciBjb25zaXN0ZW5jeVxuICAgICAgICByZW1vdmVCdG4udGl0bGUgPSBcIlJlbW92ZSBzdHJhdGVneVwiO1xuICAgICAgICByZW1vdmVCdG4ub25jbGljayA9IGFzeW5jIChlKSA9PiB7XG4gICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICBhd2FpdCB0b2dnbGVTdHJhdGVneShzdHJhdGVneS5pZCwgZmFsc2UpO1xuICAgICAgICB9O1xuXG4gICAgICAgIHJvdy5hcHBlbmRDaGlsZChoYW5kbGUpO1xuICAgICAgICByb3cuYXBwZW5kQ2hpbGQoY29udGVudFdyYXBwZXIpO1xuXG4gICAgICAgIGlmIChzdHJhdGVneS5pc0N1c3RvbSkge1xuICAgICAgICAgICAgIGNvbnN0IGF1dG9SdW5CdG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICAgICAgICAgICAgIGF1dG9SdW5CdG4uY2xhc3NOYW1lID0gYGFjdGlvbi1idG4gYXV0by1ydW4gJHtzdHJhdGVneS5hdXRvUnVuID8gJ2FjdGl2ZScgOiAnJ31gO1xuICAgICAgICAgICAgIGF1dG9SdW5CdG4uaW5uZXJIVE1MID0gSUNPTlMuYXV0b1J1bjtcbiAgICAgICAgICAgICBhdXRvUnVuQnRuLnRpdGxlID0gYEF1dG8gUnVuOiAke3N0cmF0ZWd5LmF1dG9SdW4gPyAnT04nIDogJ09GRid9YDtcbiAgICAgICAgICAgICBhdXRvUnVuQnRuLnN0eWxlLm9wYWNpdHkgPSBzdHJhdGVneS5hdXRvUnVuID8gXCIxXCIgOiBcIjAuM1wiO1xuICAgICAgICAgICAgIGF1dG9SdW5CdG4ub25jbGljayA9IGFzeW5jIChlKSA9PiB7XG4gICAgICAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICAgICAgIGlmICghcHJlZmVyZW5jZXM/LmN1c3RvbVN0cmF0ZWdpZXMpIHJldHVybjtcbiAgICAgICAgICAgICAgICAgY29uc3QgY3VzdG9tU3RyYXRJbmRleCA9IHByZWZlcmVuY2VzLmN1c3RvbVN0cmF0ZWdpZXMuZmluZEluZGV4KHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3kuaWQpO1xuICAgICAgICAgICAgICAgICBpZiAoY3VzdG9tU3RyYXRJbmRleCAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3RyYXQgPSBwcmVmZXJlbmNlcy5jdXN0b21TdHJhdGVnaWVzW2N1c3RvbVN0cmF0SW5kZXhdO1xuICAgICAgICAgICAgICAgICAgICBzdHJhdC5hdXRvUnVuID0gIXN0cmF0LmF1dG9SdW47XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzQWN0aXZlID0gISFzdHJhdC5hdXRvUnVuO1xuICAgICAgICAgICAgICAgICAgICBhdXRvUnVuQnRuLmNsYXNzTGlzdC50b2dnbGUoJ2FjdGl2ZScsIGlzQWN0aXZlKTtcbiAgICAgICAgICAgICAgICAgICAgYXV0b1J1bkJ0bi5zdHlsZS5vcGFjaXR5ID0gaXNBY3RpdmUgPyBcIjFcIiA6IFwiMC4zXCI7XG4gICAgICAgICAgICAgICAgICAgIGF1dG9SdW5CdG4udGl0bGUgPSBgQXV0byBSdW46ICR7aXNBY3RpdmUgPyAnT04nIDogJ09GRid9YDtcbiAgICAgICAgICAgICAgICAgICAgbG9jYWxQcmVmZXJlbmNlc01vZGlmaWVkVGltZSA9IERhdGUubm93KCk7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHNlbmRNZXNzYWdlKFwic2F2ZVByZWZlcmVuY2VzXCIsIHsgY3VzdG9tU3RyYXRlZ2llczogcHJlZmVyZW5jZXMuY3VzdG9tU3RyYXRlZ2llcyB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICByb3cuYXBwZW5kQ2hpbGQoYXV0b1J1bkJ0bik7XG4gICAgICAgIH1cblxuICAgICAgICByb3cuYXBwZW5kQ2hpbGQocmVtb3ZlQnRuKTtcblxuICAgICAgICBhZGREbkRMaXN0ZW5lcnMocm93KTtcbiAgICAgICAgYWN0aXZlU3RyYXRlZ2llc0xpc3QuYXBwZW5kQ2hpbGQocm93KTtcbiAgICB9KTtcblxuICAgIC8vIDIuIFJlbmRlciBBZGQgU3RyYXRlZ3kgT3B0aW9uc1xuICAgIGFkZFN0cmF0ZWd5U2VsZWN0LmlubmVySFRNTCA9ICc8b3B0aW9uIHZhbHVlPVwiXCIgZGlzYWJsZWQgc2VsZWN0ZWQ+U2VsZWN0IFN0cmF0ZWd5Li4uPC9vcHRpb24+JztcblxuICAgIGNvbnN0IGRpc2FibGVkU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gIWVuYWJsZWRJZHMuaW5jbHVkZXMocy5pZCkpO1xuICAgIGRpc2FibGVkU3RyYXRlZ2llcy5zb3J0KChhLCBiKSA9PiBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCkpO1xuXG4gICAgLy8gU2VwYXJhdGUgc3RyYXRlZ2llcyB3aXRoIEF1dG8tUnVuIGFjdGl2ZSBidXQgbm90IGluIHNvcnRpbmcgbGlzdFxuICAgIGNvbnN0IGJhY2tncm91bmRTdHJhdGVnaWVzOiBTdHJhdGVneURlZmluaXRpb25bXSA9IFtdO1xuICAgIGNvbnN0IGF2YWlsYWJsZVN0cmF0ZWdpZXM6IFN0cmF0ZWd5RGVmaW5pdGlvbltdID0gW107XG5cbiAgICBkaXNhYmxlZFN0cmF0ZWdpZXMuZm9yRWFjaChzID0+IHtcbiAgICAgICAgaWYgKHMuaXNDdXN0b20gJiYgcy5hdXRvUnVuKSB7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kU3RyYXRlZ2llcy5wdXNoKHMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYXZhaWxhYmxlU3RyYXRlZ2llcy5wdXNoKHMpO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBQb3B1bGF0ZSBTZWxlY3RcbiAgICAvLyBXZSBpbmNsdWRlIGJhY2tncm91bmQgc3RyYXRlZ2llcyBpbiB0aGUgZHJvcGRvd24gdG9vIHNvIHRoZXkgY2FuIGJlIG1vdmVkIHRvIFwiQWN0aXZlXCIgc29ydGluZyBlYXNpbHlcbiAgICAvLyBidXQgd2UgbWlnaHQgbWFyayB0aGVtXG4gICAgWy4uLmJhY2tncm91bmRTdHJhdGVnaWVzLCAuLi5hdmFpbGFibGVTdHJhdGVnaWVzXS5zb3J0KChhLCBiKSA9PiBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCkpLmZvckVhY2goc3RyYXRlZ3kgPT4ge1xuICAgICAgICBjb25zdCBvcHRpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdvcHRpb24nKTtcbiAgICAgICAgb3B0aW9uLnZhbHVlID0gc3RyYXRlZ3kuaWQ7XG4gICAgICAgIG9wdGlvbi50ZXh0Q29udGVudCA9IHN0cmF0ZWd5LmxhYmVsO1xuICAgICAgICBhZGRTdHJhdGVneVNlbGVjdC5hcHBlbmRDaGlsZChvcHRpb24pO1xuICAgIH0pO1xuXG4gICAgLy8gRm9yY2Ugc2VsZWN0aW9uIG9mIHBsYWNlaG9sZGVyXG4gICAgYWRkU3RyYXRlZ3lTZWxlY3QudmFsdWUgPSBcIlwiO1xuXG4gICAgLy8gMy4gUmVuZGVyIEJhY2tncm91bmQgU3RyYXRlZ2llcyBTZWN0aW9uIChpZiBhbnkpXG4gICAgbGV0IGJnU2VjdGlvbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYmFja2dyb3VuZFN0cmF0ZWdpZXNTZWN0aW9uXCIpO1xuICAgIGlmIChiYWNrZ3JvdW5kU3RyYXRlZ2llcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGlmICghYmdTZWN0aW9uKSB7XG4gICAgICAgICAgICBiZ1NlY3Rpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgYmdTZWN0aW9uLmlkID0gXCJiYWNrZ3JvdW5kU3RyYXRlZ2llc1NlY3Rpb25cIjtcbiAgICAgICAgICAgIGJnU2VjdGlvbi5jbGFzc05hbWUgPSBcImFjdGl2ZS1zdHJhdGVnaWVzLXNlY3Rpb25cIjtcbiAgICAgICAgICAgIC8vIFN0eWxlIGl0IHRvIGxvb2sgbGlrZSBhY3RpdmUgc2VjdGlvbiBidXQgZGlzdGluY3RcbiAgICAgICAgICAgIGJnU2VjdGlvbi5zdHlsZS5tYXJnaW5Ub3AgPSBcIjhweFwiO1xuICAgICAgICAgICAgYmdTZWN0aW9uLnN0eWxlLmJvcmRlclRvcCA9IFwiMXB4IGRhc2hlZCB2YXIoLS1ib3JkZXItY29sb3IpXCI7XG4gICAgICAgICAgICBiZ1NlY3Rpb24uc3R5bGUucGFkZGluZ1RvcCA9IFwiOHB4XCI7XG5cbiAgICAgICAgICAgIGNvbnN0IGhlYWRlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgICAgICBoZWFkZXIuY2xhc3NOYW1lID0gXCJzZWN0aW9uLWhlYWRlclwiO1xuICAgICAgICAgICAgaGVhZGVyLnRleHRDb250ZW50ID0gXCJCYWNrZ3JvdW5kIEF1dG8tUnVuXCI7XG4gICAgICAgICAgICBoZWFkZXIudGl0bGUgPSBcIlRoZXNlIHN0cmF0ZWdpZXMgcnVuIGF1dG9tYXRpY2FsbHkgYnV0IGFyZSBub3QgdXNlZCBmb3Igc29ydGluZy9ncm91cGluZyBvcmRlci5cIjtcbiAgICAgICAgICAgIGJnU2VjdGlvbi5hcHBlbmRDaGlsZChoZWFkZXIpO1xuXG4gICAgICAgICAgICBjb25zdCBsaXN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgICAgIGxpc3QuY2xhc3NOYW1lID0gXCJzdHJhdGVneS1saXN0XCI7XG4gICAgICAgICAgICBiZ1NlY3Rpb24uYXBwZW5kQ2hpbGQobGlzdCk7XG5cbiAgICAgICAgICAgIC8vIEluc2VydCBhZnRlciBhY3RpdmUgbGlzdFxuICAgICAgICAgICAgYWN0aXZlU3RyYXRlZ2llc0xpc3QucGFyZW50RWxlbWVudD8uYWZ0ZXIoYmdTZWN0aW9uKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGxpc3QgPSBiZ1NlY3Rpb24ucXVlcnlTZWxlY3RvcihcIi5zdHJhdGVneS1saXN0XCIpIGFzIEhUTUxFbGVtZW50O1xuICAgICAgICBsaXN0LmlubmVySFRNTCA9IFwiXCI7XG5cbiAgICAgICAgYmFja2dyb3VuZFN0cmF0ZWdpZXMuZm9yRWFjaChzdHJhdGVneSA9PiB7XG4gICAgICAgICAgICBjb25zdCByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgIHJvdy5jbGFzc05hbWUgPSAnc3RyYXRlZ3ktcm93JztcbiAgICAgICAgICAgIHJvdy5kYXRhc2V0LmlkID0gc3RyYXRlZ3kuaWQ7XG5cbiAgICAgICAgICAgIGNvbnN0IGxhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuICAgICAgICAgICAgbGFiZWwuY2xhc3NOYW1lID0gJ3N0cmF0ZWd5LWxhYmVsJztcbiAgICAgICAgICAgIGxhYmVsLnRleHRDb250ZW50ID0gc3RyYXRlZ3kubGFiZWw7XG4gICAgICAgICAgICBsYWJlbC5zdHlsZS5vcGFjaXR5ID0gXCIwLjdcIjtcblxuICAgICAgICAgICAgY29uc3QgYXV0b1J1bkJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gICAgICAgICAgICBhdXRvUnVuQnRuLmNsYXNzTmFtZSA9IGBhY3Rpb24tYnRuIGF1dG8tcnVuIGFjdGl2ZWA7XG4gICAgICAgICAgICBhdXRvUnVuQnRuLmlubmVySFRNTCA9IElDT05TLmF1dG9SdW47XG4gICAgICAgICAgICBhdXRvUnVuQnRuLnRpdGxlID0gYEF1dG8gUnVuOiBPTiAoQ2xpY2sgdG8gZGlzYWJsZSlgO1xuICAgICAgICAgICAgYXV0b1J1bkJ0bi5zdHlsZS5tYXJnaW5MZWZ0ID0gXCJhdXRvXCI7XG4gICAgICAgICAgICBhdXRvUnVuQnRuLm9uY2xpY2sgPSBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgICBpZiAoIXByZWZlcmVuY2VzPy5jdXN0b21TdHJhdGVnaWVzKSByZXR1cm47XG4gICAgICAgICAgICAgICAgIGNvbnN0IGN1c3RvbVN0cmF0SW5kZXggPSBwcmVmZXJlbmNlcy5jdXN0b21TdHJhdGVnaWVzLmZpbmRJbmRleChzID0+IHMuaWQgPT09IHN0cmF0ZWd5LmlkKTtcbiAgICAgICAgICAgICAgICAgaWYgKGN1c3RvbVN0cmF0SW5kZXggIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN0cmF0ID0gcHJlZmVyZW5jZXMuY3VzdG9tU3RyYXRlZ2llc1tjdXN0b21TdHJhdEluZGV4XTtcbiAgICAgICAgICAgICAgICAgICAgc3RyYXQuYXV0b1J1biA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBsb2NhbFByZWZlcmVuY2VzTW9kaWZpZWRUaW1lID0gRGF0ZS5ub3coKTtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgc2VuZE1lc3NhZ2UoXCJzYXZlUHJlZmVyZW5jZXNcIiwgeyBjdXN0b21TdHJhdGVnaWVzOiBwcmVmZXJlbmNlcy5jdXN0b21TdHJhdGVnaWVzIH0pO1xuICAgICAgICAgICAgICAgICAgICAvLyBVSSB1cGRhdGUgdHJpZ2dlcnMgdmlhIHNlbmRNZXNzYWdlIHJlc3BvbnNlIG9yIHJlLXJlbmRlclxuICAgICAgICAgICAgICAgICAgICAvLyBCdXQgd2Ugc2hvdWxkIHJlLXJlbmRlciBpbW1lZGlhdGVseSBmb3IgcmVzcG9uc2l2ZW5lc3NcbiAgICAgICAgICAgICAgICAgICAgdXBkYXRlU3RyYXRlZ3lWaWV3cyhzdHJhdGVnaWVzLCBlbmFibGVkSWRzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICByb3cuYXBwZW5kQ2hpbGQobGFiZWwpO1xuICAgICAgICAgICAgcm93LmFwcGVuZENoaWxkKGF1dG9SdW5CdG4pO1xuICAgICAgICAgICAgbGlzdC5hcHBlbmRDaGlsZChyb3cpO1xuICAgICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoYmdTZWN0aW9uKSBiZ1NlY3Rpb24ucmVtb3ZlKCk7XG4gICAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiB0b2dnbGVTdHJhdGVneShpZDogc3RyaW5nLCBlbmFibGU6IGJvb2xlYW4pIHtcbiAgICBpZiAoIXByZWZlcmVuY2VzKSByZXR1cm47XG5cbiAgICBjb25zdCBhbGxTdHJhdGVnaWVzID0gZ2V0U3RyYXRlZ2llcyhwcmVmZXJlbmNlcy5jdXN0b21TdHJhdGVnaWVzKTtcbiAgICBjb25zdCB2YWxpZElkcyA9IG5ldyBTZXQoYWxsU3RyYXRlZ2llcy5tYXAocyA9PiBzLmlkKSk7XG5cbiAgICAvLyBDbGVhbiBjdXJyZW50IGxpc3QgYnkgcmVtb3Zpbmcgc3RhbGUgSURzXG4gICAgbGV0IGN1cnJlbnQgPSAocHJlZmVyZW5jZXMuc29ydGluZyB8fCBbXSkuZmlsdGVyKHNJZCA9PiB2YWxpZElkcy5oYXMoc0lkKSk7XG5cbiAgICBpZiAoZW5hYmxlKSB7XG4gICAgICAgIGlmICghY3VycmVudC5pbmNsdWRlcyhpZCkpIHtcbiAgICAgICAgICAgIGN1cnJlbnQucHVzaChpZCk7XG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICBjdXJyZW50ID0gY3VycmVudC5maWx0ZXIoc0lkID0+IHNJZCAhPT0gaWQpO1xuICAgIH1cblxuICAgIHByZWZlcmVuY2VzLnNvcnRpbmcgPSBjdXJyZW50O1xuICAgIGxvY2FsUHJlZmVyZW5jZXNNb2RpZmllZFRpbWUgPSBEYXRlLm5vdygpO1xuICAgIGF3YWl0IHNlbmRNZXNzYWdlKFwic2F2ZVByZWZlcmVuY2VzXCIsIHsgc29ydGluZzogY3VycmVudCB9KTtcblxuICAgIC8vIFJlLXJlbmRlclxuICAgIHVwZGF0ZVN0cmF0ZWd5Vmlld3MoYWxsU3RyYXRlZ2llcywgY3VycmVudCk7XG59XG5cbmZ1bmN0aW9uIGFkZERuRExpc3RlbmVycyhyb3c6IEhUTUxFbGVtZW50KSB7XG4gIHJvdy5hZGRFdmVudExpc3RlbmVyKCdkcmFnc3RhcnQnLCAoZSkgPT4ge1xuICAgIHJvdy5jbGFzc0xpc3QuYWRkKCdkcmFnZ2luZycpO1xuICAgIGlmIChlLmRhdGFUcmFuc2Zlcikge1xuICAgICAgICBlLmRhdGFUcmFuc2Zlci5lZmZlY3RBbGxvd2VkID0gJ21vdmUnO1xuICAgIH1cbiAgfSk7XG5cbiAgcm93LmFkZEV2ZW50TGlzdGVuZXIoJ2RyYWdlbmQnLCBhc3luYyAoKSA9PiB7XG4gICAgcm93LmNsYXNzTGlzdC5yZW1vdmUoJ2RyYWdnaW5nJyk7XG4gICAgLy8gU2F2ZSBvcmRlclxuICAgIGlmIChwcmVmZXJlbmNlcykge1xuICAgICAgICBjb25zdCBjdXJyZW50U29ydGluZyA9IGdldFNlbGVjdGVkU29ydGluZygpO1xuICAgICAgICAvLyBDaGVjayBpZiBvcmRlciBjaGFuZ2VkXG4gICAgICAgIGNvbnN0IG9sZFNvcnRpbmcgPSBwcmVmZXJlbmNlcy5zb3J0aW5nIHx8IFtdO1xuICAgICAgICBpZiAoSlNPTi5zdHJpbmdpZnkoY3VycmVudFNvcnRpbmcpICE9PSBKU09OLnN0cmluZ2lmeShvbGRTb3J0aW5nKSkge1xuICAgICAgICAgICAgcHJlZmVyZW5jZXMuc29ydGluZyA9IGN1cnJlbnRTb3J0aW5nO1xuICAgICAgICAgICAgbG9jYWxQcmVmZXJlbmNlc01vZGlmaWVkVGltZSA9IERhdGUubm93KCk7XG4gICAgICAgICAgICBhd2FpdCBzZW5kTWVzc2FnZShcInNhdmVQcmVmZXJlbmNlc1wiLCB7IHNvcnRpbmc6IGN1cnJlbnRTb3J0aW5nIH0pO1xuICAgICAgICB9XG4gICAgfVxuICB9KTtcbn1cblxuZnVuY3Rpb24gc2V0dXBDb250YWluZXJEbkQoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnRhaW5lci5hZGRFdmVudExpc3RlbmVyKCdkcmFnb3ZlcicsIChlKSA9PiB7XG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgY29uc3QgYWZ0ZXJFbGVtZW50ID0gZ2V0RHJhZ0FmdGVyRWxlbWVudChjb250YWluZXIsIGUuY2xpZW50WSwgJy5zdHJhdGVneS1yb3c6bm90KC5kcmFnZ2luZyknKTtcbiAgICAgICAgY29uc3QgZHJhZ2dhYmxlUm93ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnN0cmF0ZWd5LXJvdy5kcmFnZ2luZycpO1xuICAgICAgICBpZiAoZHJhZ2dhYmxlUm93ICYmIGRyYWdnYWJsZVJvdy5wYXJlbnRFbGVtZW50ID09PSBjb250YWluZXIpIHtcbiAgICAgICAgICAgICBpZiAoYWZ0ZXJFbGVtZW50ID09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoZHJhZ2dhYmxlUm93KTtcbiAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnRhaW5lci5pbnNlcnRCZWZvcmUoZHJhZ2dhYmxlUm93LCBhZnRlckVsZW1lbnQpO1xuICAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xufVxuXG5zZXR1cENvbnRhaW5lckRuRChhY3RpdmVTdHJhdGVnaWVzTGlzdCk7XG5cbmNvbnN0IHVwZGF0ZVVJID0gKFxuICBzdGF0ZURhdGE6IHsgZ3JvdXBzOiBUYWJHcm91cFtdOyBwcmVmZXJlbmNlczogUHJlZmVyZW5jZXMgfSxcbiAgY3VycmVudFdpbmRvdzogY2hyb21lLndpbmRvd3MuV2luZG93IHwgdW5kZWZpbmVkLFxuICBjaHJvbWVXaW5kb3dzOiBjaHJvbWUud2luZG93cy5XaW5kb3dbXSxcbiAgaXNQcmVsaW1pbmFyeSA9IGZhbHNlXG4pID0+IHtcbiAgICAvLyBJZiB3ZSBtb2RpZmllZCBwcmVmZXJlbmNlcyBsb2NhbGx5IHdpdGhpbiB0aGUgbGFzdCAyIHNlY29uZHMsIGlnbm9yZSB0aGUgaW5jb21pbmcgcHJlZmVyZW5jZXMgZm9yIHNvcnRpbmdcbiAgICBjb25zdCB0aW1lU2luY2VMb2NhbFVwZGF0ZSA9IERhdGUubm93KCkgLSBsb2NhbFByZWZlcmVuY2VzTW9kaWZpZWRUaW1lO1xuICAgIGNvbnN0IHNob3VsZFVwZGF0ZVByZWZlcmVuY2VzID0gdGltZVNpbmNlTG9jYWxVcGRhdGUgPiAyMDAwO1xuXG4gICAgaWYgKHNob3VsZFVwZGF0ZVByZWZlcmVuY2VzKSB7XG4gICAgICAgIHByZWZlcmVuY2VzID0gc3RhdGVEYXRhLnByZWZlcmVuY2VzO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIEtlZXAgbG9jYWwgc29ydGluZy9zdHJhdGVnaWVzLCB1cGRhdGUgb3RoZXJzXG4gICAgICAgIGlmIChwcmVmZXJlbmNlcyAmJiBzdGF0ZURhdGEucHJlZmVyZW5jZXMpIHtcbiAgICAgICAgICAgICBwcmVmZXJlbmNlcyA9IHtcbiAgICAgICAgICAgICAgICAgLi4uc3RhdGVEYXRhLnByZWZlcmVuY2VzLFxuICAgICAgICAgICAgICAgICBzb3J0aW5nOiBwcmVmZXJlbmNlcy5zb3J0aW5nLFxuICAgICAgICAgICAgICAgICBjdXN0b21TdHJhdGVnaWVzOiBwcmVmZXJlbmNlcy5jdXN0b21TdHJhdGVnaWVzXG4gICAgICAgICAgICAgfTtcbiAgICAgICAgfSBlbHNlIGlmICghcHJlZmVyZW5jZXMpIHtcbiAgICAgICAgICAgIHByZWZlcmVuY2VzID0gc3RhdGVEYXRhLnByZWZlcmVuY2VzO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHByZWZlcmVuY2VzKSB7XG4gICAgICBjb25zdCBzID0gcHJlZmVyZW5jZXMuc29ydGluZyB8fCBbXTtcblxuICAgICAgLy8gSW5pdGlhbGl6ZSBMb2dnZXJcbiAgICAgIHNldExvZ2dlclByZWZlcmVuY2VzKHByZWZlcmVuY2VzKTtcblxuICAgICAgY29uc3QgYWxsU3RyYXRlZ2llcyA9IGdldFN0cmF0ZWdpZXMocHJlZmVyZW5jZXMuY3VzdG9tU3RyYXRlZ2llcyk7XG5cbiAgICAgIC8vIFJlbmRlciB1bmlmaWVkIHN0cmF0ZWd5IGxpc3RcbiAgICAgIHVwZGF0ZVN0cmF0ZWd5Vmlld3MoYWxsU3RyYXRlZ2llcywgcyk7XG5cbiAgICAgIC8vIEluaXRpYWwgdGhlbWUgbG9hZFxuICAgICAgaWYgKHByZWZlcmVuY2VzLnRoZW1lKSB7XG4gICAgICAgIGFwcGx5VGhlbWUocHJlZmVyZW5jZXMudGhlbWUsIGZhbHNlKTtcbiAgICAgIH1cblxuICAgICAgLy8gSW5pdCBzZXR0aW5ncyBVSVxuICAgICAgaWYgKHByZWZlcmVuY2VzLmxvZ0xldmVsKSB7XG4gICAgICAgICAgY29uc3Qgc2VsZWN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvZ0xldmVsU2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgICAgaWYgKHNlbGVjdCkgc2VsZWN0LnZhbHVlID0gcHJlZmVyZW5jZXMubG9nTGV2ZWw7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGN1cnJlbnRXaW5kb3cpIHtcbiAgICAgIGZvY3VzZWRXaW5kb3dJZCA9IGN1cnJlbnRXaW5kb3cuaWQgPz8gbnVsbDtcbiAgICB9IGVsc2Uge1xuICAgICAgZm9jdXNlZFdpbmRvd0lkID0gbnVsbDtcbiAgICAgIGNvbnNvbGUud2FybihcIkZhaWxlZCB0byBnZXQgY3VycmVudCB3aW5kb3dcIik7XG4gICAgfVxuXG4gICAgY29uc3Qgd2luZG93VGl0bGVzID0gbmV3IE1hcDxudW1iZXIsIHN0cmluZz4oKTtcblxuICAgIGNocm9tZVdpbmRvd3MuZm9yRWFjaCgod2luKSA9PiB7XG4gICAgICBpZiAoIXdpbi5pZCkgcmV0dXJuO1xuICAgICAgY29uc3QgYWN0aXZlVGFiVGl0bGUgPSB3aW4udGFicz8uZmluZCgodGFiKSA9PiB0YWIuYWN0aXZlKT8udGl0bGU7XG4gICAgICBjb25zdCB0aXRsZSA9IGFjdGl2ZVRhYlRpdGxlID8/IGBXaW5kb3cgJHt3aW4uaWR9YDtcbiAgICAgIHdpbmRvd1RpdGxlcy5zZXQod2luLmlkLCB0aXRsZSk7XG4gICAgfSk7XG5cbiAgICB3aW5kb3dTdGF0ZSA9IG1hcFdpbmRvd3Moc3RhdGVEYXRhLmdyb3Vwcywgd2luZG93VGl0bGVzKTtcblxuICAgIGlmIChmb2N1c2VkV2luZG93SWQgIT09IG51bGwpIHtcbiAgICAgICAgd2luZG93U3RhdGUuc29ydCgoYSwgYikgPT4ge1xuICAgICAgICAgICAgaWYgKGEuaWQgPT09IGZvY3VzZWRXaW5kb3dJZCkgcmV0dXJuIC0xO1xuICAgICAgICAgICAgaWYgKGIuaWQgPT09IGZvY3VzZWRXaW5kb3dJZCkgcmV0dXJuIDE7XG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKCFpbml0aWFsU2VsZWN0aW9uRG9uZSAmJiBmb2N1c2VkV2luZG93SWQgIT09IG51bGwpIHtcbiAgICAgICAgY29uc3QgYWN0aXZlV2luZG93ID0gd2luZG93U3RhdGUuZmluZCh3ID0+IHcuaWQgPT09IGZvY3VzZWRXaW5kb3dJZCk7XG4gICAgICAgIGlmIChhY3RpdmVXaW5kb3cpIHtcbiAgICAgICAgICAgICBleHBhbmRlZE5vZGVzLmFkZChgdy0ke2FjdGl2ZVdpbmRvdy5pZH1gKTtcbiAgICAgICAgICAgICBhY3RpdmVXaW5kb3cudGFicy5mb3JFYWNoKHQgPT4gc2VsZWN0ZWRUYWJzLmFkZCh0LmlkKSk7XG5cbiAgICAgICAgICAgICAvLyBJZiB3ZSBzdWNjZXNzZnVsbHkgZm91bmQgYW5kIHNlbGVjdGVkIHRoZSB3aW5kb3csIG1hcmsgYXMgZG9uZVxuICAgICAgICAgICAgIGluaXRpYWxTZWxlY3Rpb25Eb25lID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmICghaXNQcmVsaW1pbmFyeSkge1xuICAgICAgICBpbml0aWFsU2VsZWN0aW9uRG9uZSA9IHRydWU7XG4gICAgfVxuXG4gICAgcmVuZGVyVHJlZSgpO1xufTtcblxuY29uc3QgbG9hZFN0YXRlID0gYXN5bmMgKCkgPT4ge1xuICBsb2dJbmZvKFwiTG9hZGluZyBwb3B1cCBzdGF0ZVwiKTtcblxuICBsZXQgYmdGaW5pc2hlZCA9IGZhbHNlO1xuXG4gIGNvbnN0IGZhc3RMb2FkID0gYXN5bmMgKCkgPT4ge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IFtsb2NhbFJlcywgY3csIGF3XSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgICAgICAgIGZldGNoTG9jYWxTdGF0ZSgpLFxuICAgICAgICAgICAgY2hyb21lLndpbmRvd3MuZ2V0Q3VycmVudCgpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCksXG4gICAgICAgICAgICBjaHJvbWUud2luZG93cy5nZXRBbGwoeyB3aW5kb3dUeXBlczogW1wibm9ybWFsXCJdLCBwb3B1bGF0ZTogdHJ1ZSB9KS5jYXRjaCgoKSA9PiBbXSlcbiAgICAgICAgXSk7XG5cbiAgICAgICAgLy8gT25seSB1cGRhdGUgaWYgYmFja2dyb3VuZCBoYXNuJ3QgZmluaXNoZWQgeWV0XG4gICAgICAgIGlmICghYmdGaW5pc2hlZCAmJiBsb2NhbFJlcy5vayAmJiBsb2NhbFJlcy5kYXRhKSB7XG4gICAgICAgICAgICAgdXBkYXRlVUkobG9jYWxSZXMuZGF0YSwgY3csIGF3IGFzIGNocm9tZS53aW5kb3dzLldpbmRvd1tdLCB0cnVlKTtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS53YXJuKFwiRmFzdCBsb2FkIGZhaWxlZFwiLCBlKTtcbiAgICB9XG4gIH07XG5cbiAgY29uc3QgYmdMb2FkID0gYXN5bmMgKCkgPT4ge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IFtiZ1JlcywgY3csIGF3XSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgICAgICAgIGZldGNoU3RhdGUoKSxcbiAgICAgICAgICAgIGNocm9tZS53aW5kb3dzLmdldEN1cnJlbnQoKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpLFxuICAgICAgICAgICAgY2hyb21lLndpbmRvd3MuZ2V0QWxsKHsgd2luZG93VHlwZXM6IFtcIm5vcm1hbFwiXSwgcG9wdWxhdGU6IHRydWUgfSkuY2F0Y2goKCkgPT4gW10pXG4gICAgICAgIF0pO1xuXG4gICAgICAgIGJnRmluaXNoZWQgPSB0cnVlOyAvLyBNYXJrIGFzIGZpbmlzaGVkIHNvIGZhc3QgbG9hZCBkb2Vzbid0IG92ZXJ3cml0ZSBpZiBpdCdzIHNvbWVob3cgc2xvd1xuXG4gICAgICAgIGlmIChiZ1Jlcy5vayAmJiBiZ1Jlcy5kYXRhKSB7XG4gICAgICAgICAgICAgdXBkYXRlVUkoYmdSZXMuZGF0YSwgY3csIGF3IGFzIGNocm9tZS53aW5kb3dzLldpbmRvd1tdKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gbG9hZCBzdGF0ZTpcIiwgYmdSZXMuZXJyb3IgPz8gXCJVbmtub3duIGVycm9yXCIpO1xuICAgICAgICAgICAgaWYgKHdpbmRvd1N0YXRlLmxlbmd0aCA9PT0gMCkgeyAvLyBPbmx5IHNob3cgZXJyb3IgaWYgd2UgaGF2ZSBOT1RISU5HIHNob3duXG4gICAgICAgICAgICAgICAgd2luZG93c0NvbnRhaW5lci5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz1cImVycm9yLXN0YXRlXCIgc3R5bGU9XCJwYWRkaW5nOiAyMHB4OyBjb2xvcjogdmFyKC0tZXJyb3ItY29sb3IsIHJlZCk7IHRleHQtYWxpZ246IGNlbnRlcjtcIj5cbiAgICAgICAgICAgICAgICAgICAgRmFpbGVkIHRvIGxvYWQgdGFiczogJHtiZ1Jlcy5lcnJvciA/PyBcIlVua25vd24gZXJyb3JcIn0uPGJyPlxuICAgICAgICAgICAgICAgICAgICBQbGVhc2UgcmVsb2FkIHRoZSBleHRlbnNpb24gb3IgY2hlY2sgcGVybWlzc2lvbnMuXG4gICAgICAgICAgICAgICAgPC9kaXY+YDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yIGxvYWRpbmcgc3RhdGU6XCIsIGUpO1xuICAgIH1cbiAgfTtcblxuICAvLyBTdGFydCBib3RoIGNvbmN1cnJlbnRseVxuICBhd2FpdCBQcm9taXNlLmFsbChbZmFzdExvYWQoKSwgYmdMb2FkKCldKTtcbn07XG5cbmNvbnN0IGdldFNlbGVjdGVkU29ydGluZyA9ICgpOiBTb3J0aW5nU3RyYXRlZ3lbXSA9PiB7XG4gICAgLy8gUmVhZCBmcm9tIERPTSB0byBnZXQgY3VycmVudCBvcmRlciBvZiBhY3RpdmUgc3RyYXRlZ2llc1xuICAgIHJldHVybiBBcnJheS5mcm9tKGFjdGl2ZVN0cmF0ZWdpZXNMaXN0LmNoaWxkcmVuKVxuICAgICAgICAubWFwKHJvdyA9PiAocm93IGFzIEhUTUxFbGVtZW50KS5kYXRhc2V0LmlkIGFzIFNvcnRpbmdTdHJhdGVneSk7XG59O1xuXG4vLyBBZGQgbGlzdGVuZXIgZm9yIHNlbGVjdFxuYWRkU3RyYXRlZ3lTZWxlY3QuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgYXN5bmMgKGUpID0+IHtcbiAgICBjb25zdCBzZWxlY3QgPSBlLnRhcmdldCBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICBjb25zdCBpZCA9IHNlbGVjdC52YWx1ZTtcbiAgICBpZiAoaWQpIHtcbiAgICAgICAgYXdhaXQgdG9nZ2xlU3RyYXRlZ3koaWQsIHRydWUpO1xuICAgICAgICBzZWxlY3QudmFsdWUgPSBcIlwiOyAvLyBSZXNldCB0byBwbGFjZWhvbGRlclxuICAgIH1cbn0pO1xuXG5jb25zdCB0cmlnZ2VyR3JvdXAgPSBhc3luYyAoc2VsZWN0aW9uPzogR3JvdXBpbmdTZWxlY3Rpb24pID0+IHtcbiAgICBsb2dJbmZvKFwiVHJpZ2dlcmluZyBncm91cGluZ1wiLCB7IHNlbGVjdGlvbiB9KTtcbiAgICBzaG93TG9hZGluZyhcIkFwcGx5aW5nIFN0cmF0ZWd5Li4uXCIpO1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHNvcnRpbmcgPSBnZXRTZWxlY3RlZFNvcnRpbmcoKTtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgYXBwbHlHcm91cGluZyh7IHNlbGVjdGlvbiwgc29ydGluZyB9KTtcbiAgICAgICAgaWYgKCFyZXN1bHQ/Lm9rKSB7XG4gICAgICAgICAgICBhbGVydChgQXBwbHkgZmFpbGVkOiAke3Jlc3VsdD8uZXJyb3IgPz8gXCJVbmtub3duIGVycm9yXCJ9YCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgbG9hZFN0YXRlKCk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgICAgaGlkZUxvYWRpbmcoKTtcbiAgICB9XG59O1xuXG5jaHJvbWUucnVudGltZS5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoKG1lc3NhZ2UpID0+IHtcbiAgICBpZiAobWVzc2FnZS50eXBlID09PSAnZ3JvdXBpbmdQcm9ncmVzcycpIHtcbiAgICAgICAgY29uc3QgeyBjb21wbGV0ZWQsIHRvdGFsIH0gPSBtZXNzYWdlLnBheWxvYWQ7XG4gICAgICAgIHVwZGF0ZVByb2dyZXNzKGNvbXBsZXRlZCwgdG90YWwpO1xuICAgIH1cbn0pO1xuXG4vLyBMaXN0ZW5lcnNcbnNlbGVjdEFsbENoZWNrYm94LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKGUpID0+IHtcbiAgICBjb25zdCB0YXJnZXRTdGF0ZSA9IChlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS5jaGVja2VkO1xuICAgIGlmICh0YXJnZXRTdGF0ZSkge1xuICAgICAgICAvLyBTZWxlY3QgQWxsXG4gICAgICAgIHdpbmRvd1N0YXRlLmZvckVhY2god2luID0+IHtcbiAgICAgICAgICAgIHdpbi50YWJzLmZvckVhY2godGFiID0+IHNlbGVjdGVkVGFicy5hZGQodGFiLmlkKSk7XG4gICAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIERlc2VsZWN0IEFsbFxuICAgICAgICBzZWxlY3RlZFRhYnMuY2xlYXIoKTtcbiAgICB9XG4gICAgcmVuZGVyVHJlZSgpO1xufSk7XG5cbmJ0bkFwcGx5Py5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIGxvZ0luZm8oXCJBcHBseSBidXR0b24gY2xpY2tlZFwiLCB7IHNlbGVjdGVkQ291bnQ6IHNlbGVjdGVkVGFicy5zaXplIH0pO1xuICAgIHRyaWdnZXJHcm91cCh7IHRhYklkczogQXJyYXkuZnJvbShzZWxlY3RlZFRhYnMpIH0pO1xufSk7XG5cbmJ0blVuZ3JvdXAuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgaWYgKGNvbmZpcm0oYFVuZ3JvdXAgJHtzZWxlY3RlZFRhYnMuc2l6ZX0gdGFicz9gKSkge1xuICAgICAgbG9nSW5mbyhcIlVuZ3JvdXBpbmcgdGFic1wiLCB7IGNvdW50OiBzZWxlY3RlZFRhYnMuc2l6ZSB9KTtcbiAgICAgIGF3YWl0IGNocm9tZS50YWJzLnVuZ3JvdXAoQXJyYXkuZnJvbShzZWxlY3RlZFRhYnMpKTtcbiAgICAgIGF3YWl0IGxvYWRTdGF0ZSgpO1xuICB9XG59KTtcbmJ0bk1lcmdlLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIGlmIChjb25maXJtKGBNZXJnZSAke3NlbGVjdGVkVGFicy5zaXplfSB0YWJzIGludG8gb25lIGdyb3VwP2ApKSB7XG4gICAgICBsb2dJbmZvKFwiTWVyZ2luZyB0YWJzXCIsIHsgY291bnQ6IHNlbGVjdGVkVGFicy5zaXplIH0pO1xuICAgICAgY29uc3QgcmVzID0gYXdhaXQgc2VuZE1lc3NhZ2UoXCJtZXJnZVNlbGVjdGlvblwiLCB7IHRhYklkczogQXJyYXkuZnJvbShzZWxlY3RlZFRhYnMpIH0pO1xuICAgICAgaWYgKCFyZXMub2spIGFsZXJ0KFwiTWVyZ2UgZmFpbGVkOiBcIiArIHJlcy5lcnJvcik7XG4gICAgICBlbHNlIGF3YWl0IGxvYWRTdGF0ZSgpO1xuICB9XG59KTtcbmJ0blNwbGl0LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIGlmIChjb25maXJtKGBTcGxpdCAke3NlbGVjdGVkVGFicy5zaXplfSB0YWJzIGludG8gYSBuZXcgd2luZG93P2ApKSB7XG4gICAgICBsb2dJbmZvKFwiU3BsaXR0aW5nIHRhYnNcIiwgeyBjb3VudDogc2VsZWN0ZWRUYWJzLnNpemUgfSk7XG4gICAgICBjb25zdCByZXMgPSBhd2FpdCBzZW5kTWVzc2FnZShcInNwbGl0U2VsZWN0aW9uXCIsIHsgdGFiSWRzOiBBcnJheS5mcm9tKHNlbGVjdGVkVGFicykgfSk7XG4gICAgICBpZiAoIXJlcy5vaykgYWxlcnQoXCJTcGxpdCBmYWlsZWQ6IFwiICsgcmVzLmVycm9yKTtcbiAgICAgIGVsc2UgYXdhaXQgbG9hZFN0YXRlKCk7XG4gIH1cbn0pO1xuXG5idG5FeHBhbmRBbGw/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgd2luZG93U3RhdGUuZm9yRWFjaCh3aW4gPT4ge1xuICAgICAgICBleHBhbmRlZE5vZGVzLmFkZChgdy0ke3dpbi5pZH1gKTtcbiAgICAgICAgd2luLnRhYnMuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgICAgICAgaWYgKHRhYi5ncm91cExhYmVsKSB7XG4gICAgICAgICAgICAgICAgIGV4cGFuZGVkTm9kZXMuYWRkKGB3LSR7d2luLmlkfS1nLSR7dGFiLmdyb3VwTGFiZWx9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICAgIHJlbmRlclRyZWUoKTtcbn0pO1xuXG5idG5Db2xsYXBzZUFsbD8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBleHBhbmRlZE5vZGVzLmNsZWFyKCk7XG4gICAgcmVuZGVyVHJlZSgpO1xufSk7XG5cblxuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5VbmRvXCIpPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICBsb2dJbmZvKFwiVW5kbyBjbGlja2VkXCIpO1xuICBjb25zdCByZXMgPSBhd2FpdCBzZW5kTWVzc2FnZShcInVuZG9cIik7XG4gIGlmICghcmVzLm9rKSBhbGVydChcIlVuZG8gZmFpbGVkOiBcIiArIHJlcy5lcnJvcik7XG59KTtcblxuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5TYXZlU3RhdGVcIik/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIGNvbnN0IG5hbWUgPSBwcm9tcHQoXCJFbnRlciBhIG5hbWUgZm9yIHRoaXMgc3RhdGU6XCIpO1xuICBpZiAobmFtZSkge1xuICAgIGxvZ0luZm8oXCJTYXZpbmcgc3RhdGVcIiwgeyBuYW1lIH0pO1xuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHNlbmRNZXNzYWdlKFwic2F2ZVN0YXRlXCIsIHsgbmFtZSB9KTtcbiAgICBpZiAoIXJlcy5vaykgYWxlcnQoXCJTYXZlIGZhaWxlZDogXCIgKyByZXMuZXJyb3IpO1xuICB9XG59KTtcblxuY29uc3QgbG9hZFN0YXRlRGlhbG9nID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsb2FkU3RhdGVEaWFsb2dcIikgYXMgSFRNTERpYWxvZ0VsZW1lbnQ7XG5jb25zdCBzYXZlZFN0YXRlTGlzdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2F2ZWRTdGF0ZUxpc3RcIikgYXMgSFRNTEVsZW1lbnQ7XG5cbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuTG9hZFN0YXRlXCIpPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICBsb2dJbmZvKFwiT3BlbmluZyBMb2FkIFN0YXRlIGRpYWxvZ1wiKTtcbiAgY29uc3QgcmVzID0gYXdhaXQgc2VuZE1lc3NhZ2U8U2F2ZWRTdGF0ZVtdPihcImdldFNhdmVkU3RhdGVzXCIpO1xuICBpZiAocmVzLm9rICYmIHJlcy5kYXRhKSB7XG4gICAgc2F2ZWRTdGF0ZUxpc3QuaW5uZXJIVE1MID0gXCJcIjtcbiAgICByZXMuZGF0YS5mb3JFYWNoKChzdGF0ZSkgPT4ge1xuICAgICAgY29uc3QgbGkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwibGlcIik7XG4gICAgICBsaS5zdHlsZS5kaXNwbGF5ID0gXCJmbGV4XCI7XG4gICAgICBsaS5zdHlsZS5qdXN0aWZ5Q29udGVudCA9IFwic3BhY2UtYmV0d2VlblwiO1xuICAgICAgbGkuc3R5bGUucGFkZGluZyA9IFwiOHB4XCI7XG4gICAgICBsaS5zdHlsZS5ib3JkZXJCb3R0b20gPSBcIjFweCBzb2xpZCB2YXIoLS1ib3JkZXItY29sb3IpXCI7XG5cbiAgICAgIGNvbnN0IHNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgICAgIHNwYW4udGV4dENvbnRlbnQgPSBgJHtzdGF0ZS5uYW1lfSAoJHtuZXcgRGF0ZShzdGF0ZS50aW1lc3RhbXApLnRvTG9jYWxlU3RyaW5nKCl9KWA7XG4gICAgICBzcGFuLnN0eWxlLmN1cnNvciA9IFwicG9pbnRlclwiO1xuICAgICAgc3Bhbi5vbmNsaWNrID0gYXN5bmMgKCkgPT4ge1xuICAgICAgICBpZiAoY29uZmlybShgTG9hZCBzdGF0ZSBcIiR7c3RhdGUubmFtZX1cIj9gKSkge1xuICAgICAgICAgIGxvZ0luZm8oXCJSZXN0b3Jpbmcgc3RhdGVcIiwgeyBuYW1lOiBzdGF0ZS5uYW1lIH0pO1xuICAgICAgICAgIGNvbnN0IHIgPSBhd2FpdCBzZW5kTWVzc2FnZShcInJlc3RvcmVTdGF0ZVwiLCB7IHN0YXRlIH0pO1xuICAgICAgICAgIGlmIChyLm9rKSB7XG4gICAgICAgICAgICAgIGxvYWRTdGF0ZURpYWxvZy5jbG9zZSgpO1xuICAgICAgICAgICAgICB3aW5kb3cuY2xvc2UoKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBhbGVydChcIlJlc3RvcmUgZmFpbGVkOiBcIiArIHIuZXJyb3IpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfTtcblxuICAgICAgY29uc3QgZGVsQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgICAgIGRlbEJ0bi50ZXh0Q29udGVudCA9IFwiRGVsZXRlXCI7XG4gICAgICBkZWxCdG4uc3R5bGUubWFyZ2luTGVmdCA9IFwiOHB4XCI7XG4gICAgICBkZWxCdG4uc3R5bGUuYmFja2dyb3VuZCA9IFwidHJhbnNwYXJlbnRcIjtcbiAgICAgIGRlbEJ0bi5zdHlsZS5jb2xvciA9IFwidmFyKC0tdGV4dC1jb2xvcilcIjtcbiAgICAgIGRlbEJ0bi5zdHlsZS5ib3JkZXIgPSBcIjFweCBzb2xpZCB2YXIoLS1ib3JkZXItY29sb3IpXCI7XG4gICAgICBkZWxCdG4uc3R5bGUuYm9yZGVyUmFkaXVzID0gXCI0cHhcIjtcbiAgICAgIGRlbEJ0bi5zdHlsZS5wYWRkaW5nID0gXCIycHggNnB4XCI7XG4gICAgICBkZWxCdG4ub25jbGljayA9IGFzeW5jIChlKSA9PiB7XG4gICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICBpZiAoY29uZmlybShgRGVsZXRlIHN0YXRlIFwiJHtzdGF0ZS5uYW1lfVwiP2ApKSB7XG4gICAgICAgICAgICAgIGF3YWl0IHNlbmRNZXNzYWdlKFwiZGVsZXRlU2F2ZWRTdGF0ZVwiLCB7IG5hbWU6IHN0YXRlLm5hbWUgfSk7XG4gICAgICAgICAgICAgIGxpLnJlbW92ZSgpO1xuICAgICAgICAgIH1cbiAgICAgIH07XG5cbiAgICAgIGxpLmFwcGVuZENoaWxkKHNwYW4pO1xuICAgICAgbGkuYXBwZW5kQ2hpbGQoZGVsQnRuKTtcbiAgICAgIHNhdmVkU3RhdGVMaXN0LmFwcGVuZENoaWxkKGxpKTtcbiAgICB9KTtcbiAgICBsb2FkU3RhdGVEaWFsb2cuc2hvd01vZGFsKCk7XG4gIH0gZWxzZSB7XG4gICAgICBhbGVydChcIkZhaWxlZCB0byBsb2FkIHN0YXRlczogXCIgKyByZXMuZXJyb3IpO1xuICB9XG59KTtcblxuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5DbG9zZUxvYWRTdGF0ZVwiKT8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBsb2FkU3RhdGVEaWFsb2cuY2xvc2UoKTtcbn0pO1xuXG5zZWFyY2hJbnB1dC5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgcmVuZGVyVHJlZSk7XG5cbi8vIEF1dG8tcmVmcmVzaFxuY2hyb21lLnRhYnMub25VcGRhdGVkLmFkZExpc3RlbmVyKCgpID0+IGxvYWRTdGF0ZSgpKTtcbmNocm9tZS50YWJzLm9uUmVtb3ZlZC5hZGRMaXN0ZW5lcigoKSA9PiBsb2FkU3RhdGUoKSk7XG5jaHJvbWUud2luZG93cy5vblJlbW92ZWQuYWRkTGlzdGVuZXIoKCkgPT4gbG9hZFN0YXRlKCkpO1xuXG4vLyAtLS0gVGhlbWUgTG9naWMgLS0tXG5jb25zdCBidG5UaGVtZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuVGhlbWVcIik7XG5jb25zdCBpY29uU3VuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJpY29uU3VuXCIpO1xuY29uc3QgaWNvbk1vb24gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImljb25Nb29uXCIpO1xuXG5jb25zdCBhcHBseVRoZW1lID0gKHRoZW1lOiAnbGlnaHQnIHwgJ2RhcmsnLCBzYXZlID0gZmFsc2UpID0+IHtcbiAgICBpZiAodGhlbWUgPT09ICdsaWdodCcpIHtcbiAgICAgICAgZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QuYWRkKCdsaWdodC1tb2RlJyk7XG4gICAgICAgIGlmIChpY29uU3VuKSBpY29uU3VuLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuICAgICAgICBpZiAoaWNvbk1vb24pIGljb25Nb29uLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QucmVtb3ZlKCdsaWdodC1tb2RlJyk7XG4gICAgICAgIGlmIChpY29uU3VuKSBpY29uU3VuLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgICAgIGlmIChpY29uTW9vbikgaWNvbk1vb24uc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG4gICAgfVxuXG4gICAgLy8gU3luYyB3aXRoIFByZWZlcmVuY2VzXG4gICAgaWYgKHNhdmUpIHtcbiAgICAgICAgLy8gV2UgdXNlIHNhdmVQcmVmZXJlbmNlcyB3aGljaCBjYWxscyB0aGUgYmFja2dyb3VuZCB0byBzdG9yZSBpdFxuICAgICAgICBsb2dJbmZvKFwiQXBwbHlpbmcgdGhlbWVcIiwgeyB0aGVtZSB9KTtcbiAgICAgICAgbG9jYWxQcmVmZXJlbmNlc01vZGlmaWVkVGltZSA9IERhdGUubm93KCk7XG4gICAgICAgIHNlbmRNZXNzYWdlKFwic2F2ZVByZWZlcmVuY2VzXCIsIHsgdGhlbWUgfSk7XG4gICAgfVxufTtcblxuLy8gSW5pdGlhbCBsb2FkIGZhbGxiYWNrIChiZWZvcmUgbG9hZFN0YXRlIGxvYWRzIHByZWZzKVxuY29uc3Qgc3RvcmVkVGhlbWUgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgndGhlbWUnKSBhcyAnbGlnaHQnIHwgJ2RhcmsnO1xuLy8gSWYgd2UgaGF2ZSBhIGxvY2FsIG92ZXJyaWRlLCB1c2UgaXQgdGVtcG9yYXJpbHksIGJ1dCBsb2FkU3RhdGUgd2lsbCBhdXRob3JpdGF0aXZlIGNoZWNrIHByZWZzXG5pZiAoc3RvcmVkVGhlbWUpIGFwcGx5VGhlbWUoc3RvcmVkVGhlbWUsIGZhbHNlKTtcblxuYnRuVGhlbWU/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgIGNvbnN0IGlzTGlnaHQgPSBkb2N1bWVudC5ib2R5LmNsYXNzTGlzdC5jb250YWlucygnbGlnaHQtbW9kZScpO1xuICAgIGNvbnN0IG5ld1RoZW1lID0gaXNMaWdodCA/ICdkYXJrJyA6ICdsaWdodCc7XG4gICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ3RoZW1lJywgbmV3VGhlbWUpOyAvLyBLZWVwIGxvY2FsIGNvcHkgZm9yIGZhc3QgYm9vdFxuICAgIGFwcGx5VGhlbWUobmV3VGhlbWUsIHRydWUpO1xufSk7XG5cbi8vIC0tLSBTZXR0aW5ncyBMb2dpYyAtLS1cbmNvbnN0IHNldHRpbmdzRGlhbG9nID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzZXR0aW5nc0RpYWxvZ1wiKSBhcyBIVE1MRGlhbG9nRWxlbWVudDtcbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuU2V0dGluZ3NcIik/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0dGluZ3NEaWFsb2cuc2hvd01vZGFsKCk7XG59KTtcbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuQ2xvc2VTZXR0aW5nc1wiKT8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXR0aW5nc0RpYWxvZy5jbG9zZSgpO1xufSk7XG5cbmNvbnN0IGxvZ0xldmVsU2VsZWN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsb2dMZXZlbFNlbGVjdFwiKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbmxvZ0xldmVsU2VsZWN0Py5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsIGFzeW5jICgpID0+IHtcbiAgICBjb25zdCBuZXdMZXZlbCA9IGxvZ0xldmVsU2VsZWN0LnZhbHVlIGFzIExvZ0xldmVsO1xuICAgIGlmIChwcmVmZXJlbmNlcykge1xuICAgICAgICBwcmVmZXJlbmNlcy5sb2dMZXZlbCA9IG5ld0xldmVsO1xuICAgICAgICAvLyBVcGRhdGUgbG9jYWwgbG9nZ2VyIGltbWVkaWF0ZWx5XG4gICAgICAgIHNldExvZ2dlclByZWZlcmVuY2VzKHByZWZlcmVuY2VzKTtcbiAgICAgICAgLy8gUGVyc2lzdFxuICAgICAgICBsb2NhbFByZWZlcmVuY2VzTW9kaWZpZWRUaW1lID0gRGF0ZS5ub3coKTtcbiAgICAgICAgYXdhaXQgc2VuZE1lc3NhZ2UoXCJzYXZlUHJlZmVyZW5jZXNcIiwgeyBsb2dMZXZlbDogbmV3TGV2ZWwgfSk7XG4gICAgICAgIGxvZ0RlYnVnKFwiTG9nIGxldmVsIHVwZGF0ZWRcIiwgeyBsZXZlbDogbmV3TGV2ZWwgfSk7XG4gICAgfVxufSk7XG5cbi8vIC0tLSBQaW4gJiBSZXNpemUgTG9naWMgLS0tXG5jb25zdCBidG5QaW4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0blBpblwiKTtcbmJ0blBpbj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgY29uc3QgdXJsID0gY2hyb21lLnJ1bnRpbWUuZ2V0VVJMKFwidWkvcG9wdXAuaHRtbFwiKTtcbiAgYXdhaXQgY2hyb21lLndpbmRvd3MuY3JlYXRlKHtcbiAgICB1cmwsXG4gICAgdHlwZTogXCJwb3B1cFwiLFxuICAgIHdpZHRoOiBkb2N1bWVudC5ib2R5Lm9mZnNldFdpZHRoLFxuICAgIGhlaWdodDogZG9jdW1lbnQuYm9keS5vZmZzZXRIZWlnaHRcbiAgfSk7XG4gIHdpbmRvdy5jbG9zZSgpO1xufSk7XG5cbmNvbnN0IHJlc2l6ZUhhbmRsZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicmVzaXplSGFuZGxlXCIpO1xuaWYgKHJlc2l6ZUhhbmRsZSkge1xuICBjb25zdCBzYXZlU2l6ZSA9ICh3OiBudW1iZXIsIGg6IG51bWJlcikgPT4ge1xuICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oXCJwb3B1cFNpemVcIiwgSlNPTi5zdHJpbmdpZnkoeyB3aWR0aDogdywgaGVpZ2h0OiBoIH0pKTtcbiAgfTtcblxuICByZXNpemVIYW5kbGUuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlZG93blwiLCAoZSkgPT4ge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgY29uc3Qgc3RhcnRYID0gZS5jbGllbnRYO1xuICAgICAgY29uc3Qgc3RhcnRZID0gZS5jbGllbnRZO1xuICAgICAgY29uc3Qgc3RhcnRXaWR0aCA9IGRvY3VtZW50LmJvZHkub2Zmc2V0V2lkdGg7XG4gICAgICBjb25zdCBzdGFydEhlaWdodCA9IGRvY3VtZW50LmJvZHkub2Zmc2V0SGVpZ2h0O1xuXG4gICAgICBjb25zdCBvbk1vdXNlTW92ZSA9IChldjogTW91c2VFdmVudCkgPT4ge1xuICAgICAgICAgIGNvbnN0IG5ld1dpZHRoID0gTWF0aC5tYXgoNTAwLCBzdGFydFdpZHRoICsgKGV2LmNsaWVudFggLSBzdGFydFgpKTtcbiAgICAgICAgICBjb25zdCBuZXdIZWlnaHQgPSBNYXRoLm1heCg1MDAsIHN0YXJ0SGVpZ2h0ICsgKGV2LmNsaWVudFkgLSBzdGFydFkpKTtcbiAgICAgICAgICBkb2N1bWVudC5ib2R5LnN0eWxlLndpZHRoID0gYCR7bmV3V2lkdGh9cHhgO1xuICAgICAgICAgIGRvY3VtZW50LmJvZHkuc3R5bGUuaGVpZ2h0ID0gYCR7bmV3SGVpZ2h0fXB4YDtcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IG9uTW91c2VVcCA9IChldjogTW91c2VFdmVudCkgPT4ge1xuICAgICAgICAgICBjb25zdCBuZXdXaWR0aCA9IE1hdGgubWF4KDUwMCwgc3RhcnRXaWR0aCArIChldi5jbGllbnRYIC0gc3RhcnRYKSk7XG4gICAgICAgICAgIGNvbnN0IG5ld0hlaWdodCA9IE1hdGgubWF4KDUwMCwgc3RhcnRIZWlnaHQgKyAoZXYuY2xpZW50WSAtIHN0YXJ0WSkpO1xuICAgICAgICAgICBzYXZlU2l6ZShuZXdXaWR0aCwgbmV3SGVpZ2h0KTtcbiAgICAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1vdXNlbW92ZVwiLCBvbk1vdXNlTW92ZSk7XG4gICAgICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb3VzZXVwXCIsIG9uTW91c2VVcCk7XG4gICAgICB9O1xuXG4gICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwibW91c2Vtb3ZlXCIsIG9uTW91c2VNb3ZlKTtcbiAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZXVwXCIsIG9uTW91c2VVcCk7XG4gIH0pO1xufVxuXG5jb25zdCBhZGp1c3RGb3JXaW5kb3dUeXBlID0gYXN5bmMgKCkgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHdpbiA9IGF3YWl0IGNocm9tZS53aW5kb3dzLmdldEN1cnJlbnQoKTtcbiAgICBpZiAod2luLnR5cGUgPT09IFwicG9wdXBcIikge1xuICAgICAgIGlmIChidG5QaW4pIGJ0blBpbi5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgICAgLy8gRW5hYmxlIHJlc2l6ZSBoYW5kbGUgaW4gcGlubmVkIG1vZGUgaWYgaXQgd2FzIGhpZGRlblxuICAgICAgIGlmIChyZXNpemVIYW5kbGUpIHJlc2l6ZUhhbmRsZS5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgICAgIGRvY3VtZW50LmJvZHkuc3R5bGUud2lkdGggPSBcIjEwMCVcIjtcbiAgICAgICBkb2N1bWVudC5ib2R5LnN0eWxlLmhlaWdodCA9IFwiMTAwJVwiO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIERpc2FibGUgcmVzaXplIGhhbmRsZSBpbiBkb2NrZWQgbW9kZVxuICAgICAgICBpZiAocmVzaXplSGFuZGxlKSByZXNpemVIYW5kbGUuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgICAgICAvLyBDbGVhciBhbnkgcHJldmlvdXMgc2l6ZSBvdmVycmlkZXNcbiAgICAgICAgZG9jdW1lbnQuYm9keS5zdHlsZS53aWR0aCA9IFwiXCI7XG4gICAgICAgIGRvY3VtZW50LmJvZHkuc3R5bGUuaGVpZ2h0ID0gXCJcIjtcbiAgICB9XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvciBjaGVja2luZyB3aW5kb3cgdHlwZTpcIiwgZSk7XG4gIH1cbn07XG5cbmFkanVzdEZvcldpbmRvd1R5cGUoKTtcbmxvYWRTdGF0ZSgpLmNhdGNoKGUgPT4gY29uc29sZS5lcnJvcihcIkxvYWQgc3RhdGUgZmFpbGVkXCIsIGUpKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFFTyxJQUFNLGVBQWUsQ0FBQyxRQUE2QztBQUN4RSxNQUFJLENBQUMsSUFBSSxNQUFNLElBQUksT0FBTyxPQUFPLEtBQUssZUFBZSxDQUFDLElBQUksU0FBVSxRQUFPO0FBQzNFLFNBQU87QUFBQSxJQUNMLElBQUksSUFBSTtBQUFBLElBQ1IsVUFBVSxJQUFJO0FBQUEsSUFDZCxPQUFPLElBQUksU0FBUztBQUFBLElBQ3BCLEtBQUssSUFBSSxjQUFjLElBQUksT0FBTztBQUFBLElBQ2xDLFFBQVEsUUFBUSxJQUFJLE1BQU07QUFBQSxJQUMxQixjQUFjLElBQUk7QUFBQSxJQUNsQixhQUFhLElBQUksZUFBZTtBQUFBLElBQ2hDLFlBQVksSUFBSTtBQUFBLElBQ2hCLFNBQVMsSUFBSTtBQUFBLElBQ2IsT0FBTyxJQUFJO0FBQUEsSUFDWCxRQUFRLElBQUk7QUFBQSxJQUNaLFFBQVEsSUFBSTtBQUFBLElBQ1osVUFBVSxJQUFJO0FBQUEsRUFDaEI7QUFDRjtBQUVPLElBQU0sdUJBQXVCLFlBQXlDO0FBQzNFLFNBQU8sSUFBSSxRQUFRLENBQUMsWUFBWTtBQUM5QixXQUFPLFFBQVEsTUFBTSxJQUFJLGVBQWUsQ0FBQyxVQUFVO0FBQ2pELGNBQVMsTUFBTSxhQUFhLEtBQXFCLElBQUk7QUFBQSxJQUN2RCxDQUFDO0FBQUEsRUFDSCxDQUFDO0FBQ0g7QUFFTyxJQUFNLFVBQVUsQ0FBSSxVQUF3QjtBQUMvQyxNQUFJLE1BQU0sUUFBUSxLQUFLLEVBQUcsUUFBTztBQUNqQyxTQUFPLENBQUM7QUFDWjs7O0FDbkJPLElBQU0sYUFBbUM7QUFBQSxFQUM1QyxFQUFFLElBQUksVUFBVSxPQUFPLFVBQVUsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUM1RixFQUFFLElBQUksZUFBZSxPQUFPLGVBQWUsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUN0RyxFQUFFLElBQUksU0FBUyxPQUFPLFNBQVMsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUMxRixFQUFFLElBQUksV0FBVyxPQUFPLFdBQVcsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUM5RixFQUFFLElBQUksV0FBVyxPQUFPLFdBQVcsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUM5RixFQUFFLElBQUksVUFBVSxPQUFPLFVBQVUsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUM1RixFQUFFLElBQUksV0FBVyxPQUFPLFdBQVcsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUM5RixFQUFFLElBQUksT0FBTyxPQUFPLE9BQU8sWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUN0RixFQUFFLElBQUksT0FBTyxPQUFPLE9BQU8sWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUN0RixFQUFFLElBQUksV0FBVyxPQUFPLFdBQVcsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUM5RixFQUFFLElBQUksU0FBUyxPQUFPLFNBQVMsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENB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QUksS0FBSyxjQUFjLEdBQUcsVUFBVSxPQUFPO0FBQ2pFLFlBQU0sWUFBWSxLQUFLLElBQUksS0FBSyxlQUFlLEdBQUcsVUFBVSxPQUFPO0FBQ25FLGVBQVMsVUFBVSxTQUFTO0FBQzVCLGVBQVMsb0JBQW9CLGFBQWEsV0FBVztBQUNyRCxlQUFTLG9CQUFvQixXQUFXLFNBQVM7QUFBQSxJQUN0RDtBQUVBLGFBQVMsaUJBQWlCLGFBQWEsV0FBVztBQUNsRCxhQUFTLGlCQUFpQixXQUFXLFNBQVM7QUFBQSxFQUNsRCxDQUFDO0FBQ0g7QUFFQSxJQUFNLHNCQUFzQixZQUFZO0FBQ3RDLE1BQUk7QUFDRixVQUFNLE1BQU0sTUFBTSxPQUFPLFFBQVEsV0FBVztBQUM1QyxRQUFJLElBQUksU0FBUyxTQUFTO0FBQ3ZCLFVBQUksT0FBUSxRQUFPLE1BQU0sVUFBVTtBQUVuQyxVQUFJLGFBQWMsY0FBYSxNQUFNLFVBQVU7QUFDL0MsZUFBUyxLQUFLLE1BQU0sUUFBUTtBQUM1QixlQUFTLEtBQUssTUFBTSxTQUFTO0FBQUEsSUFDaEMsT0FBTztBQUVILFVBQUksYUFBYyxjQUFhLE1BQU0sVUFBVTtBQUUvQyxlQUFTLEtBQUssTUFBTSxRQUFRO0FBQzVCLGVBQVMsS0FBSyxNQUFNLFNBQVM7QUFBQSxJQUNqQztBQUFBLEVBQ0YsU0FBUyxHQUFHO0FBQ1IsWUFBUSxNQUFNLCtCQUErQixDQUFDO0FBQUEsRUFDbEQ7QUFDRjtBQUVBLG9CQUFvQjtBQUNwQixVQUFVLEVBQUUsTUFBTSxPQUFLLFFBQVEsTUFBTSxxQkFBcUIsQ0FBQyxDQUFDOyIsCiAgIm5hbWVzIjogWyJjdXN0b21TdHJhdGVnaWVzIiwgInByZWZlcmVuY2VzIiwgInRhYnMiLCAid2luZG93IiwgImxpc3QiXQp9Cg==
