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
var aiEnabledCheckbox = document.getElementById("aiEnabledCheckbox");
var aiProviderSelect = document.getElementById("aiProviderSelect");
var aiApiKeyInput = document.getElementById("aiApiKeyInput");
var aiModelInput = document.getElementById("aiModelInput");
var aiEndpointInput = document.getElementById("aiEndpointInput");
var aiEndpointContainer = document.getElementById("aiEndpointContainer");
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
    Array.from(groups.entries()).sort().forEach(([groupLabel, groupData]) => {
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
        await sendMessage("savePreferences", { sorting: currentSorting });
      }
    }
  });
}
function setupContainerDnD(container) {
  container.addEventListener("dragover", (e) => {
    e.preventDefault();
    const afterElement = getDragAfterElement(container, e.clientY);
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
function getDragAfterElement(container, y) {
  const draggableElements = Array.from(container.querySelectorAll(".strategy-row:not(.dragging)"));
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
var updateAISettingsUI = () => {
  if (!preferences?.ai) return;
  if (aiEnabledCheckbox) aiEnabledCheckbox.checked = preferences.ai.enabled;
  if (aiProviderSelect) aiProviderSelect.value = preferences.ai.provider;
  if (aiApiKeyInput) aiApiKeyInput.value = preferences.ai.apiKey || "";
  if (aiModelInput) aiModelInput.value = preferences.ai.model || "";
  if (aiEndpointInput) aiEndpointInput.value = preferences.ai.endpoint || "";
  const aiSettingsContainer = document.getElementById("aiSettingsContainer");
  if (aiSettingsContainer) {
    aiSettingsContainer.style.display = preferences.ai.enabled ? "block" : "none";
  }
  if (aiEndpointContainer) {
    aiEndpointContainer.style.display = preferences.ai.provider === "custom" ? "block" : "none";
  }
};
var updateUI = (stateData, currentWindow, chromeWindows, isPreliminary = false) => {
  preferences = stateData.preferences;
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
    updateAISettingsUI();
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
      if (!isPreliminary) {
        initialSelectionDone = true;
      }
    }
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
aiEnabledCheckbox?.addEventListener("change", async () => {
  if (preferences?.ai) {
    preferences.ai.enabled = aiEnabledCheckbox.checked;
    updateAISettingsUI();
    await sendMessage("savePreferences", { ai: preferences.ai });
  }
});
aiProviderSelect?.addEventListener("change", async () => {
  if (preferences?.ai) {
    preferences.ai.provider = aiProviderSelect.value;
    updateAISettingsUI();
    await sendMessage("savePreferences", { ai: preferences.ai });
  }
});
aiApiKeyInput?.addEventListener("change", async () => {
  if (preferences?.ai) {
    preferences.ai.apiKey = aiApiKeyInput.value;
    await sendMessage("savePreferences", { ai: preferences.ai });
  }
});
aiModelInput?.addEventListener("change", async () => {
  if (preferences?.ai) {
    preferences.ai.model = aiModelInput.value;
    await sendMessage("savePreferences", { ai: preferences.ai });
  }
});
aiEndpointInput?.addEventListener("change", async () => {
  if (preferences?.ai) {
    preferences.ai.endpoint = aiEndpointInput.value;
    await sendMessage("savePreferences", { ai: preferences.ai });
  }
});
adjustForWindowType();
loadState().catch((e) => console.error("Load state failed", e));
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3NoYXJlZC91dGlscy50cyIsICIuLi8uLi9zcmMvc2hhcmVkL3N0cmF0ZWd5UmVnaXN0cnkudHMiLCAiLi4vLi4vc3JjL3NoYXJlZC9sb2dnZXIudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZ3JvdXBpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3NvcnRpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy91aS9sb2NhbFN0YXRlLnRzIiwgIi4uLy4uL3NyYy91aS9jb21tb24udHMiLCAiLi4vLi4vc3JjL3VpL3BvcHVwLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyBQcmVmZXJlbmNlcywgU29ydGluZ1N0cmF0ZWd5LCBUYWJNZXRhZGF0YSB9IGZyb20gXCIuL3R5cGVzLmpzXCI7XG5cbmV4cG9ydCBjb25zdCBtYXBDaHJvbWVUYWIgPSAodGFiOiBjaHJvbWUudGFicy5UYWIpOiBUYWJNZXRhZGF0YSB8IG51bGwgPT4ge1xuICBpZiAoIXRhYi5pZCB8fCB0YWIuaWQgPT09IGNocm9tZS50YWJzLlRBQl9JRF9OT05FIHx8ICF0YWIud2luZG93SWQpIHJldHVybiBudWxsO1xuICByZXR1cm4ge1xuICAgIGlkOiB0YWIuaWQsXG4gICAgd2luZG93SWQ6IHRhYi53aW5kb3dJZCxcbiAgICB0aXRsZTogdGFiLnRpdGxlIHx8IFwiVW50aXRsZWRcIixcbiAgICB1cmw6IHRhYi51cmwgfHwgXCJhYm91dDpibGFua1wiLFxuICAgIHBpbm5lZDogQm9vbGVhbih0YWIucGlubmVkKSxcbiAgICBsYXN0QWNjZXNzZWQ6IHRhYi5sYXN0QWNjZXNzZWQsXG4gICAgb3BlbmVyVGFiSWQ6IHRhYi5vcGVuZXJUYWJJZCA/PyB1bmRlZmluZWQsXG4gICAgZmF2SWNvblVybDogdGFiLmZhdkljb25VcmwsXG4gICAgZ3JvdXBJZDogdGFiLmdyb3VwSWQsXG4gICAgaW5kZXg6IHRhYi5pbmRleCxcbiAgICBhY3RpdmU6IHRhYi5hY3RpdmUsXG4gICAgc3RhdHVzOiB0YWIuc3RhdHVzLFxuICAgIHNlbGVjdGVkOiB0YWIuaGlnaGxpZ2h0ZWRcbiAgfTtcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRTdG9yZWRQcmVmZXJlbmNlcyA9IGFzeW5jICgpOiBQcm9taXNlPFByZWZlcmVuY2VzIHwgbnVsbD4gPT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoXCJwcmVmZXJlbmNlc1wiLCAoaXRlbXMpID0+IHtcbiAgICAgIHJlc29sdmUoKGl0ZW1zW1wicHJlZmVyZW5jZXNcIl0gYXMgUHJlZmVyZW5jZXMpID8/IG51bGwpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBhc0FycmF5ID0gPFQ+KHZhbHVlOiB1bmtub3duKTogVFtdID0+IHtcbiAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHJldHVybiB2YWx1ZSBhcyBUW107XG4gICAgcmV0dXJuIFtdO1xufTtcbiIsICJpbXBvcnQgeyBDdXN0b21TdHJhdGVneSwgU29ydGluZ1N0cmF0ZWd5IH0gZnJvbSBcIi4vdHlwZXMuanNcIjtcblxuZXhwb3J0IGludGVyZmFjZSBTdHJhdGVneURlZmluaXRpb24ge1xuICAgIGlkOiBTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmc7XG4gICAgbGFiZWw6IHN0cmluZztcbiAgICBpc0dyb3VwaW5nOiBib29sZWFuO1xuICAgIGlzU29ydGluZzogYm9vbGVhbjtcbiAgICB0YWdzPzogc3RyaW5nW107XG4gICAgYXV0b1J1bj86IGJvb2xlYW47XG4gICAgaXNDdXN0b20/OiBib29sZWFuO1xufVxuXG4vLyBSZXN0b3JlZCBzdHJhdGVnaWVzIG1hdGNoaW5nIGJhY2tncm91bmQgY2FwYWJpbGl0aWVzLlxuZXhwb3J0IGNvbnN0IFNUUkFURUdJRVM6IFN0cmF0ZWd5RGVmaW5pdGlvbltdID0gW1xuICAgIHsgaWQ6IFwiZG9tYWluXCIsIGxhYmVsOiBcIkRvbWFpblwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwiZG9tYWluX2Z1bGxcIiwgbGFiZWw6IFwiRnVsbCBEb21haW5cIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInRvcGljXCIsIGxhYmVsOiBcIlRvcGljXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJjb250ZXh0XCIsIGxhYmVsOiBcIkNvbnRleHRcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImxpbmVhZ2VcIiwgbGFiZWw6IFwiTGluZWFnZVwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwicGlubmVkXCIsIGxhYmVsOiBcIlBpbm5lZFwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwicmVjZW5jeVwiLCBsYWJlbDogXCJSZWNlbmN5XCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJhZ2VcIiwgbGFiZWw6IFwiQWdlXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJ1cmxcIiwgbGFiZWw6IFwiVVJMXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJuZXN0aW5nXCIsIGxhYmVsOiBcIk5lc3RpbmdcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInRpdGxlXCIsIGxhYmVsOiBcIlRpdGxlXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG5dO1xuXG5leHBvcnQgY29uc3QgZ2V0U3RyYXRlZ2llcyA9IChjdXN0b21TdHJhdGVnaWVzPzogQ3VzdG9tU3RyYXRlZ3lbXSk6IFN0cmF0ZWd5RGVmaW5pdGlvbltdID0+IHtcbiAgICBpZiAoIWN1c3RvbVN0cmF0ZWdpZXMgfHwgY3VzdG9tU3RyYXRlZ2llcy5sZW5ndGggPT09IDApIHJldHVybiBTVFJBVEVHSUVTO1xuXG4gICAgLy8gQ3VzdG9tIHN0cmF0ZWdpZXMgY2FuIG92ZXJyaWRlIGJ1aWx0LWlucyBpZiBJRHMgbWF0Y2gsIG9yIGFkZCBuZXcgb25lcy5cbiAgICBjb25zdCBjb21iaW5lZCA9IFsuLi5TVFJBVEVHSUVTXTtcblxuICAgIGN1c3RvbVN0cmF0ZWdpZXMuZm9yRWFjaChjdXN0b20gPT4ge1xuICAgICAgICBjb25zdCBleGlzdGluZ0luZGV4ID0gY29tYmluZWQuZmluZEluZGV4KHMgPT4gcy5pZCA9PT0gY3VzdG9tLmlkKTtcblxuICAgICAgICAvLyBEZXRlcm1pbmUgY2FwYWJpbGl0aWVzIGJhc2VkIG9uIHJ1bGVzIHByZXNlbmNlXG4gICAgICAgIGNvbnN0IGhhc0dyb3VwaW5nID0gKGN1c3RvbS5ncm91cGluZ1J1bGVzICYmIGN1c3RvbS5ncm91cGluZ1J1bGVzLmxlbmd0aCA+IDApIHx8IChjdXN0b20ucnVsZXMgJiYgY3VzdG9tLnJ1bGVzLmxlbmd0aCA+IDApIHx8IGZhbHNlO1xuICAgICAgICBjb25zdCBoYXNTb3J0aW5nID0gKGN1c3RvbS5zb3J0aW5nUnVsZXMgJiYgY3VzdG9tLnNvcnRpbmdSdWxlcy5sZW5ndGggPiAwKSB8fCAoY3VzdG9tLnJ1bGVzICYmIGN1c3RvbS5ydWxlcy5sZW5ndGggPiAwKSB8fCBmYWxzZTtcblxuICAgICAgICBjb25zdCB0YWdzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBpZiAoaGFzR3JvdXBpbmcpIHRhZ3MucHVzaChcImdyb3VwXCIpO1xuICAgICAgICBpZiAoaGFzU29ydGluZykgdGFncy5wdXNoKFwic29ydFwiKTtcblxuICAgICAgICBjb25zdCBkZWZpbml0aW9uOiBTdHJhdGVneURlZmluaXRpb24gPSB7XG4gICAgICAgICAgICBpZDogY3VzdG9tLmlkLFxuICAgICAgICAgICAgbGFiZWw6IGN1c3RvbS5sYWJlbCxcbiAgICAgICAgICAgIGlzR3JvdXBpbmc6IGhhc0dyb3VwaW5nLFxuICAgICAgICAgICAgaXNTb3J0aW5nOiBoYXNTb3J0aW5nLFxuICAgICAgICAgICAgdGFnczogdGFncyxcbiAgICAgICAgICAgIGF1dG9SdW46IGN1c3RvbS5hdXRvUnVuLFxuICAgICAgICAgICAgaXNDdXN0b206IHRydWVcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAoZXhpc3RpbmdJbmRleCAhPT0gLTEpIHtcbiAgICAgICAgICAgIGNvbWJpbmVkW2V4aXN0aW5nSW5kZXhdID0gZGVmaW5pdGlvbjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbWJpbmVkLnB1c2goZGVmaW5pdGlvbik7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBjb21iaW5lZDtcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRTdHJhdGVneSA9IChpZDogU29ydGluZ1N0cmF0ZWd5IHwgc3RyaW5nKTogU3RyYXRlZ3lEZWZpbml0aW9uIHwgdW5kZWZpbmVkID0+IFNUUkFURUdJRVMuZmluZChzID0+IHMuaWQgPT09IGlkKTtcbiIsICJpbXBvcnQgeyBMb2dFbnRyeSwgTG9nTGV2ZWwsIFByZWZlcmVuY2VzIH0gZnJvbSBcIi4vdHlwZXMuanNcIjtcblxuY29uc3QgUFJFRklYID0gXCJbVGFiU29ydGVyXVwiO1xuXG5jb25zdCBMRVZFTF9QUklPUklUWTogUmVjb3JkPExvZ0xldmVsLCBudW1iZXI+ID0ge1xuICBkZWJ1ZzogMCxcbiAgaW5mbzogMSxcbiAgd2FybjogMixcbiAgZXJyb3I6IDMsXG4gIGNyaXRpY2FsOiA0XG59O1xuXG5sZXQgY3VycmVudExldmVsOiBMb2dMZXZlbCA9IFwiaW5mb1wiO1xubGV0IGxvZ3M6IExvZ0VudHJ5W10gPSBbXTtcbmNvbnN0IE1BWF9MT0dTID0gMTAwMDtcbmNvbnN0IFNUT1JBR0VfS0VZID0gXCJzZXNzaW9uTG9nc1wiO1xuXG4vLyBTYWZlIGNvbnRleHQgY2hlY2tcbmNvbnN0IGlzU2VydmljZVdvcmtlciA9IHR5cGVvZiBzZWxmICE9PSAndW5kZWZpbmVkJyAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZW9mIChzZWxmIGFzIGFueSkuU2VydmljZVdvcmtlckdsb2JhbFNjb3BlICE9PSAndW5kZWZpbmVkJyAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZiBpbnN0YW5jZW9mIChzZWxmIGFzIGFueSkuU2VydmljZVdvcmtlckdsb2JhbFNjb3BlO1xubGV0IGlzU2F2aW5nID0gZmFsc2U7XG5sZXQgcGVuZGluZ1NhdmUgPSBmYWxzZTtcbmxldCBzYXZlVGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgbnVsbCA9IG51bGw7XG5cbmNvbnN0IGRvU2F2ZSA9ICgpID0+IHtcbiAgICBpZiAoIWlzU2VydmljZVdvcmtlciB8fCAhY2hyb21lPy5zdG9yYWdlPy5zZXNzaW9uIHx8IGlzU2F2aW5nKSB7XG4gICAgICAgIHBlbmRpbmdTYXZlID0gdHJ1ZTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlzU2F2aW5nID0gdHJ1ZTtcbiAgICBwZW5kaW5nU2F2ZSA9IGZhbHNlO1xuXG4gICAgY2hyb21lLnN0b3JhZ2Uuc2Vzc2lvbi5zZXQoeyBbU1RPUkFHRV9LRVldOiBsb2dzIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICBpc1NhdmluZyA9IGZhbHNlO1xuICAgICAgICBpZiAocGVuZGluZ1NhdmUpIHtcbiAgICAgICAgICAgIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG4gICAgICAgIH1cbiAgICB9KS5jYXRjaChlcnIgPT4ge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIHNhdmUgbG9nc1wiLCBlcnIpO1xuICAgICAgICBpc1NhdmluZyA9IGZhbHNlO1xuICAgIH0pO1xufTtcblxuY29uc3Qgc2F2ZUxvZ3NUb1N0b3JhZ2UgPSAoKSA9PiB7XG4gICAgaWYgKHNhdmVUaW1lcikgY2xlYXJUaW1lb3V0KHNhdmVUaW1lcik7XG4gICAgc2F2ZVRpbWVyID0gc2V0VGltZW91dChkb1NhdmUsIDEwMDApO1xufTtcblxubGV0IHJlc29sdmVMb2dnZXJSZWFkeTogKCkgPT4gdm9pZDtcbmV4cG9ydCBjb25zdCBsb2dnZXJSZWFkeSA9IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuICAgIHJlc29sdmVMb2dnZXJSZWFkeSA9IHJlc29sdmU7XG59KTtcblxuZXhwb3J0IGNvbnN0IGluaXRMb2dnZXIgPSBhc3luYyAoKSA9PiB7XG4gICAgaWYgKGlzU2VydmljZVdvcmtlciAmJiBjaHJvbWU/LnN0b3JhZ2U/LnNlc3Npb24pIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNocm9tZS5zdG9yYWdlLnNlc3Npb24uZ2V0KFNUT1JBR0VfS0VZKTtcbiAgICAgICAgICAgIGlmIChyZXN1bHRbU1RPUkFHRV9LRVldICYmIEFycmF5LmlzQXJyYXkocmVzdWx0W1NUT1JBR0VfS0VZXSkpIHtcbiAgICAgICAgICAgICAgICBsb2dzID0gcmVzdWx0W1NUT1JBR0VfS0VZXTtcbiAgICAgICAgICAgICAgICBpZiAobG9ncy5sZW5ndGggPiBNQVhfTE9HUykgbG9ncyA9IGxvZ3Muc2xpY2UoMCwgTUFYX0xPR1MpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIHJlc3RvcmUgbG9nc1wiLCBlKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAocmVzb2x2ZUxvZ2dlclJlYWR5KSByZXNvbHZlTG9nZ2VyUmVhZHkoKTtcbn07XG5cbmV4cG9ydCBjb25zdCBzZXRMb2dnZXJQcmVmZXJlbmNlcyA9IChwcmVmczogUHJlZmVyZW5jZXMpID0+IHtcbiAgaWYgKHByZWZzLmxvZ0xldmVsKSB7XG4gICAgY3VycmVudExldmVsID0gcHJlZnMubG9nTGV2ZWw7XG4gIH0gZWxzZSBpZiAocHJlZnMuZGVidWcpIHtcbiAgICBjdXJyZW50TGV2ZWwgPSBcImRlYnVnXCI7XG4gIH0gZWxzZSB7XG4gICAgY3VycmVudExldmVsID0gXCJpbmZvXCI7XG4gIH1cbn07XG5cbmNvbnN0IHNob3VsZExvZyA9IChsZXZlbDogTG9nTGV2ZWwpOiBib29sZWFuID0+IHtcbiAgcmV0dXJuIExFVkVMX1BSSU9SSVRZW2xldmVsXSA+PSBMRVZFTF9QUklPUklUWVtjdXJyZW50TGV2ZWxdO1xufTtcblxuY29uc3QgZm9ybWF0TWVzc2FnZSA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICByZXR1cm4gY29udGV4dCA/IGAke21lc3NhZ2V9IDo6ICR7SlNPTi5zdHJpbmdpZnkoY29udGV4dCl9YCA6IG1lc3NhZ2U7XG59O1xuXG5jb25zdCBhZGRMb2cgPSAobGV2ZWw6IExvZ0xldmVsLCBtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICAvLyBBbHdheXMgYWRkIHRvIGJ1ZmZlciByZWdhcmRsZXNzIG9mIGN1cnJlbnQgY29uc29sZSBsZXZlbCBzZXR0aW5nLFxuICAvLyBvciBzaG91bGQgd2UgcmVzcGVjdCBpdD8gVXN1YWxseSBkZWJ1ZyBsb2dzIGFyZSBub2lzeS5cbiAgLy8gTGV0J3MgcmVzcGVjdCBzaG91bGRMb2cgZm9yIHRoZSBidWZmZXIgdG9vIHRvIHNhdmUgbWVtb3J5L25vaXNlLFxuICAvLyBPUiB3ZSBjYW4gc3RvcmUgZXZlcnl0aGluZyBidXQgZmlsdGVyIG9uIHZpZXcuXG4gIC8vIEdpdmVuIHdlIHdhbnQgdG8gZGVidWcgaXNzdWVzLCBzdG9yaW5nIGV2ZXJ5dGhpbmcgbWlnaHQgYmUgYmV0dGVyLFxuICAvLyBidXQgaWYgd2Ugc3RvcmUgZXZlcnl0aGluZyB3ZSBtaWdodCBmaWxsIGJ1ZmZlciB3aXRoIGRlYnVnIG5vaXNlIHF1aWNrbHkuXG4gIC8vIExldCdzIHN0aWNrIHRvIHN0b3Jpbmcgd2hhdCBpcyBjb25maWd1cmVkIHRvIGJlIGxvZ2dlZC5cbiAgLy8gV2FpdCwgaWYgSSB3YW50IHRvIFwiZGVidWdcIiBzb21ldGhpbmcsIEkgdXN1YWxseSB0dXJuIG9uIGRlYnVnIGxvZ3MuXG4gIC8vIElmIEkgY2FuJ3Qgc2VlIHBhc3QgbG9ncyBiZWNhdXNlIHRoZXkgd2VyZW4ndCBzdG9yZWQsIEkgaGF2ZSB0byByZXByby5cbiAgLy8gTGV0J3Mgc3RvcmUgaWYgaXQgcGFzc2VzIGBzaG91bGRMb2dgLlxuXG4gIGlmIChzaG91bGRMb2cobGV2ZWwpKSB7XG4gICAgICBjb25zdCBlbnRyeTogTG9nRW50cnkgPSB7XG4gICAgICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxuICAgICAgICAgIGxldmVsLFxuICAgICAgICAgIG1lc3NhZ2UsXG4gICAgICAgICAgY29udGV4dFxuICAgICAgfTtcblxuICAgICAgaWYgKGlzU2VydmljZVdvcmtlcikge1xuICAgICAgICAgIGxvZ3MudW5zaGlmdChlbnRyeSk7XG4gICAgICAgICAgaWYgKGxvZ3MubGVuZ3RoID4gTUFYX0xPR1MpIHtcbiAgICAgICAgICAgICAgbG9ncy5wb3AoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgc2F2ZUxvZ3NUb1N0b3JhZ2UoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gSW4gb3RoZXIgY29udGV4dHMsIHNlbmQgdG8gU1dcbiAgICAgICAgICBpZiAoY2hyb21lPy5ydW50aW1lPy5zZW5kTWVzc2FnZSkge1xuICAgICAgICAgICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2xvZ0VudHJ5JywgcGF5bG9hZDogZW50cnkgfSkuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgICAgICAgICAvLyBJZ25vcmUgaWYgbWVzc2FnZSBmYWlscyAoZS5nLiBjb250ZXh0IGludmFsaWRhdGVkKVxuICAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgIH1cbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGFkZExvZ0VudHJ5ID0gKGVudHJ5OiBMb2dFbnRyeSkgPT4ge1xuICAgIGlmIChpc1NlcnZpY2VXb3JrZXIpIHtcbiAgICAgICAgbG9ncy51bnNoaWZ0KGVudHJ5KTtcbiAgICAgICAgaWYgKGxvZ3MubGVuZ3RoID4gTUFYX0xPR1MpIHtcbiAgICAgICAgICAgIGxvZ3MucG9wKCk7XG4gICAgICAgIH1cbiAgICAgICAgc2F2ZUxvZ3NUb1N0b3JhZ2UoKTtcbiAgICB9XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0TG9ncyA9ICgpID0+IFsuLi5sb2dzXTtcbmV4cG9ydCBjb25zdCBjbGVhckxvZ3MgPSAoKSA9PiB7XG4gICAgbG9ncy5sZW5ndGggPSAwO1xuICAgIGlmIChpc1NlcnZpY2VXb3JrZXIpIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG59O1xuXG5leHBvcnQgY29uc3QgbG9nRGVidWcgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwiZGVidWdcIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJkZWJ1Z1wiKSkge1xuICAgIGNvbnNvbGUuZGVidWcoYCR7UFJFRklYfSBbREVCVUddICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0luZm8gPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwiaW5mb1wiLCBtZXNzYWdlLCBjb250ZXh0KTtcbiAgaWYgKHNob3VsZExvZyhcImluZm9cIikpIHtcbiAgICBjb25zb2xlLmluZm8oYCR7UFJFRklYfSBbSU5GT10gJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nV2FybiA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBhZGRMb2coXCJ3YXJuXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwid2FyblwiKSkge1xuICAgIGNvbnNvbGUud2FybihgJHtQUkVGSVh9IFtXQVJOXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgY29udGV4dCl9YCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBsb2dFcnJvciA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBhZGRMb2coXCJlcnJvclwiLCBtZXNzYWdlLCBjb250ZXh0KTtcbiAgaWYgKHNob3VsZExvZyhcImVycm9yXCIpKSB7XG4gICAgY29uc29sZS5lcnJvcihgJHtQUkVGSVh9IFtFUlJPUl0gJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nQ3JpdGljYWwgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwiY3JpdGljYWxcIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJjcml0aWNhbFwiKSkge1xuICAgIC8vIENyaXRpY2FsIGxvZ3MgdXNlIGVycm9yIGNvbnNvbGUgYnV0IHdpdGggZGlzdGluY3QgcHJlZml4IGFuZCBtYXliZSBzdHlsaW5nIGlmIHN1cHBvcnRlZFxuICAgIGNvbnNvbGUuZXJyb3IoYCR7UFJFRklYfSBbQ1JJVElDQUxdIFx1RDgzRFx1REVBOCAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgY29udGV4dCl9YCk7XG4gIH1cbn07XG4iLCAiaW1wb3J0IHsgR3JvdXBpbmdTdHJhdGVneSwgU29ydGluZ1N0cmF0ZWd5LCBUYWJHcm91cCwgVGFiTWV0YWRhdGEsIEN1c3RvbVN0cmF0ZWd5LCBTdHJhdGVneVJ1bGUsIFJ1bGVDb25kaXRpb24sIEdyb3VwaW5nUnVsZSwgU29ydGluZ1J1bGUgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBnZXRTdHJhdGVnaWVzIH0gZnJvbSBcIi4uL3NoYXJlZC9zdHJhdGVneVJlZ2lzdHJ5LmpzXCI7XG5pbXBvcnQgeyBsb2dEZWJ1ZyB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBhc0FycmF5IH0gZnJvbSBcIi4uL3NoYXJlZC91dGlscy5qc1wiO1xuXG5sZXQgY3VzdG9tU3RyYXRlZ2llczogQ3VzdG9tU3RyYXRlZ3lbXSA9IFtdO1xuXG5leHBvcnQgY29uc3Qgc2V0Q3VzdG9tU3RyYXRlZ2llcyA9IChzdHJhdGVnaWVzOiBDdXN0b21TdHJhdGVneVtdKSA9PiB7XG4gICAgY3VzdG9tU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXM7XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0Q3VzdG9tU3RyYXRlZ2llcyA9ICgpOiBDdXN0b21TdHJhdGVneVtdID0+IGN1c3RvbVN0cmF0ZWdpZXM7XG5cbmNvbnN0IENPTE9SUyA9IFtcImdyZXlcIiwgXCJibHVlXCIsIFwicmVkXCIsIFwieWVsbG93XCIsIFwiZ3JlZW5cIiwgXCJwaW5rXCIsIFwicHVycGxlXCIsIFwiY3lhblwiLCBcIm9yYW5nZVwiXTtcblxuY29uc3QgcmVnZXhDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBSZWdFeHA+KCk7XG5jb25zdCBkb21haW5DYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5jb25zdCBzdWJkb21haW5DYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5jb25zdCBNQVhfQ0FDSEVfU0laRSA9IDEwMDA7XG5cbmV4cG9ydCBjb25zdCBkb21haW5Gcm9tVXJsID0gKHVybDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgaWYgKGRvbWFpbkNhY2hlLmhhcyh1cmwpKSByZXR1cm4gZG9tYWluQ2FjaGUuZ2V0KHVybCkhO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgcGFyc2VkID0gbmV3IFVSTCh1cmwpO1xuICAgIGNvbnN0IGRvbWFpbiA9IHBhcnNlZC5ob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgXCJcIik7XG5cbiAgICBpZiAoZG9tYWluQ2FjaGUuc2l6ZSA+PSBNQVhfQ0FDSEVfU0laRSkgZG9tYWluQ2FjaGUuY2xlYXIoKTtcbiAgICBkb21haW5DYWNoZS5zZXQodXJsLCBkb21haW4pO1xuXG4gICAgcmV0dXJuIGRvbWFpbjtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBsb2dEZWJ1ZyhcIkZhaWxlZCB0byBwYXJzZSBkb21haW5cIiwgeyB1cmwsIGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICAgIHJldHVybiBcInVua25vd25cIjtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IHN1YmRvbWFpbkZyb21VcmwgPSAodXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgIGlmIChzdWJkb21haW5DYWNoZS5oYXModXJsKSkgcmV0dXJuIHN1YmRvbWFpbkNhY2hlLmdldCh1cmwpITtcblxuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHBhcnNlZCA9IG5ldyBVUkwodXJsKTtcbiAgICAgICAgbGV0IGhvc3RuYW1lID0gcGFyc2VkLmhvc3RuYW1lO1xuICAgICAgICAvLyBSZW1vdmUgd3d3LlxuICAgICAgICBob3N0bmFtZSA9IGhvc3RuYW1lLnJlcGxhY2UoL153d3dcXC4vLCBcIlwiKTtcblxuICAgICAgICBsZXQgcmVzdWx0ID0gXCJcIjtcbiAgICAgICAgY29uc3QgcGFydHMgPSBob3N0bmFtZS5zcGxpdCgnLicpO1xuICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMikge1xuICAgICAgICAgICAgIHJlc3VsdCA9IHBhcnRzLnNsaWNlKDAsIHBhcnRzLmxlbmd0aCAtIDIpLmpvaW4oJy4nKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdWJkb21haW5DYWNoZS5zaXplID49IE1BWF9DQUNIRV9TSVpFKSBzdWJkb21haW5DYWNoZS5jbGVhcigpO1xuICAgICAgICBzdWJkb21haW5DYWNoZS5zZXQodXJsLCByZXN1bHQpO1xuXG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBcIlwiO1xuICAgIH1cbn1cblxuZXhwb3J0IGNvbnN0IGdldEZpZWxkVmFsdWUgPSAodGFiOiBUYWJNZXRhZGF0YSwgZmllbGQ6IHN0cmluZyk6IGFueSA9PiB7XG4gICAgc3dpdGNoKGZpZWxkKSB7XG4gICAgICAgIGNhc2UgJ2lkJzogcmV0dXJuIHRhYi5pZDtcbiAgICAgICAgY2FzZSAnaW5kZXgnOiByZXR1cm4gdGFiLmluZGV4O1xuICAgICAgICBjYXNlICd3aW5kb3dJZCc6IHJldHVybiB0YWIud2luZG93SWQ7XG4gICAgICAgIGNhc2UgJ2dyb3VwSWQnOiByZXR1cm4gdGFiLmdyb3VwSWQ7XG4gICAgICAgIGNhc2UgJ3RpdGxlJzogcmV0dXJuIHRhYi50aXRsZTtcbiAgICAgICAgY2FzZSAndXJsJzogcmV0dXJuIHRhYi51cmw7XG4gICAgICAgIGNhc2UgJ3N0YXR1cyc6IHJldHVybiB0YWIuc3RhdHVzO1xuICAgICAgICBjYXNlICdhY3RpdmUnOiByZXR1cm4gdGFiLmFjdGl2ZTtcbiAgICAgICAgY2FzZSAnc2VsZWN0ZWQnOiByZXR1cm4gdGFiLnNlbGVjdGVkO1xuICAgICAgICBjYXNlICdwaW5uZWQnOiByZXR1cm4gdGFiLnBpbm5lZDtcbiAgICAgICAgY2FzZSAnb3BlbmVyVGFiSWQnOiByZXR1cm4gdGFiLm9wZW5lclRhYklkO1xuICAgICAgICBjYXNlICdsYXN0QWNjZXNzZWQnOiByZXR1cm4gdGFiLmxhc3RBY2Nlc3NlZDtcbiAgICAgICAgY2FzZSAnY29udGV4dCc6IHJldHVybiB0YWIuY29udGV4dDtcbiAgICAgICAgY2FzZSAnZ2VucmUnOiByZXR1cm4gdGFiLmNvbnRleHREYXRhPy5nZW5yZTtcbiAgICAgICAgY2FzZSAnc2l0ZU5hbWUnOiByZXR1cm4gdGFiLmNvbnRleHREYXRhPy5zaXRlTmFtZTtcbiAgICAgICAgLy8gRGVyaXZlZCBvciBtYXBwZWQgZmllbGRzXG4gICAgICAgIGNhc2UgJ2RvbWFpbic6IHJldHVybiBkb21haW5Gcm9tVXJsKHRhYi51cmwpO1xuICAgICAgICBjYXNlICdzdWJkb21haW4nOiByZXR1cm4gc3ViZG9tYWluRnJvbVVybCh0YWIudXJsKTtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIGlmIChmaWVsZC5pbmNsdWRlcygnLicpKSB7XG4gICAgICAgICAgICAgICAgIHJldHVybiBmaWVsZC5zcGxpdCgnLicpLnJlZHVjZSgob2JqLCBrZXkpID0+IChvYmogJiYgdHlwZW9mIG9iaiA9PT0gJ29iamVjdCcgJiYgb2JqICE9PSBudWxsKSA/IChvYmogYXMgYW55KVtrZXldIDogdW5kZWZpbmVkLCB0YWIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuICh0YWIgYXMgYW55KVtmaWVsZF07XG4gICAgfVxufTtcblxuY29uc3Qgc3RyaXBUbGQgPSAoZG9tYWluOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gZG9tYWluLnJlcGxhY2UoL1xcLihjb218b3JnfGdvdnxuZXR8ZWR1fGlvKSQvaSwgXCJcIik7XG59O1xuXG5leHBvcnQgY29uc3Qgc2VtYW50aWNCdWNrZXQgPSAodGl0bGU6IHN0cmluZywgdXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBrZXkgPSBgJHt0aXRsZX0gJHt1cmx9YC50b0xvd2VyQ2FzZSgpO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiZG9jXCIpIHx8IGtleS5pbmNsdWRlcyhcInJlYWRtZVwiKSB8fCBrZXkuaW5jbHVkZXMoXCJndWlkZVwiKSkgcmV0dXJuIFwiRG9jc1wiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwibWFpbFwiKSB8fCBrZXkuaW5jbHVkZXMoXCJpbmJveFwiKSkgcmV0dXJuIFwiQ2hhdFwiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiZGFzaGJvYXJkXCIpIHx8IGtleS5pbmNsdWRlcyhcImNvbnNvbGVcIikpIHJldHVybiBcIkRhc2hcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImlzc3VlXCIpIHx8IGtleS5pbmNsdWRlcyhcInRpY2tldFwiKSkgcmV0dXJuIFwiVGFza3NcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImRyaXZlXCIpIHx8IGtleS5pbmNsdWRlcyhcInN0b3JhZ2VcIikpIHJldHVybiBcIkZpbGVzXCI7XG4gIHJldHVybiBcIk1pc2NcIjtcbn07XG5cbmV4cG9ydCBjb25zdCBuYXZpZ2F0aW9uS2V5ID0gKHRhYjogVGFiTWV0YWRhdGEpOiBzdHJpbmcgPT4ge1xuICBpZiAodGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gYGNoaWxkLW9mLSR7dGFiLm9wZW5lclRhYklkfWA7XG4gIH1cbiAgcmV0dXJuIGB3aW5kb3ctJHt0YWIud2luZG93SWR9YDtcbn07XG5cbmNvbnN0IGdldFJlY2VuY3lMYWJlbCA9IChsYXN0QWNjZXNzZWQ6IG51bWJlcik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gIGNvbnN0IGRpZmYgPSBub3cgLSBsYXN0QWNjZXNzZWQ7XG4gIGlmIChkaWZmIDwgMzYwMDAwMCkgcmV0dXJuIFwiSnVzdCBub3dcIjsgLy8gMWhcbiAgaWYgKGRpZmYgPCA4NjQwMDAwMCkgcmV0dXJuIFwiVG9kYXlcIjsgLy8gMjRoXG4gIGlmIChkaWZmIDwgMTcyODAwMDAwKSByZXR1cm4gXCJZZXN0ZXJkYXlcIjsgLy8gNDhoXG4gIGlmIChkaWZmIDwgNjA0ODAwMDAwKSByZXR1cm4gXCJUaGlzIFdlZWtcIjsgLy8gN2RcbiAgcmV0dXJuIFwiT2xkZXJcIjtcbn07XG5cbmNvbnN0IGNvbG9yRm9yS2V5ID0gKGtleTogc3RyaW5nLCBvZmZzZXQ6IG51bWJlcik6IHN0cmluZyA9PiBDT0xPUlNbKE1hdGguYWJzKGhhc2hDb2RlKGtleSkpICsgb2Zmc2V0KSAlIENPTE9SUy5sZW5ndGhdO1xuXG5jb25zdCBoYXNoQ29kZSA9ICh2YWx1ZTogc3RyaW5nKTogbnVtYmVyID0+IHtcbiAgbGV0IGhhc2ggPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHZhbHVlLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgaGFzaCA9IChoYXNoIDw8IDUpIC0gaGFzaCArIHZhbHVlLmNoYXJDb2RlQXQoaSk7XG4gICAgaGFzaCB8PSAwO1xuICB9XG4gIHJldHVybiBoYXNoO1xufTtcblxuLy8gSGVscGVyIHRvIGdldCBhIGh1bWFuLXJlYWRhYmxlIGxhYmVsIGNvbXBvbmVudCBmcm9tIGEgc3RyYXRlZ3kgYW5kIGEgc2V0IG9mIHRhYnNcbmNvbnN0IGdldExhYmVsQ29tcG9uZW50ID0gKHN0cmF0ZWd5OiBHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nLCB0YWJzOiBUYWJNZXRhZGF0YVtdLCBhbGxUYWJzTWFwOiBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YT4pOiBzdHJpbmcgfCBudWxsID0+IHtcbiAgY29uc3QgZmlyc3RUYWIgPSB0YWJzWzBdO1xuICBpZiAoIWZpcnN0VGFiKSByZXR1cm4gXCJVbmtub3duXCI7XG5cbiAgLy8gQ2hlY2sgY3VzdG9tIHN0cmF0ZWdpZXMgZmlyc3RcbiAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3kpO1xuICBpZiAoY3VzdG9tKSB7XG4gICAgICByZXR1cm4gZ3JvdXBpbmdLZXkoZmlyc3RUYWIsIHN0cmF0ZWd5KTtcbiAgfVxuXG4gIHN3aXRjaCAoc3RyYXRlZ3kpIHtcbiAgICBjYXNlIFwiZG9tYWluXCI6IHtcbiAgICAgIGNvbnN0IHNpdGVOYW1lcyA9IG5ldyBTZXQodGFicy5tYXAodCA9PiB0LmNvbnRleHREYXRhPy5zaXRlTmFtZSkuZmlsdGVyKEJvb2xlYW4pKTtcbiAgICAgIGlmIChzaXRlTmFtZXMuc2l6ZSA9PT0gMSkge1xuICAgICAgICByZXR1cm4gc3RyaXBUbGQoQXJyYXkuZnJvbShzaXRlTmFtZXMpWzBdIGFzIHN0cmluZyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gc3RyaXBUbGQoZG9tYWluRnJvbVVybChmaXJzdFRhYi51cmwpKTtcbiAgICB9XG4gICAgY2FzZSBcImRvbWFpbl9mdWxsXCI6XG4gICAgICByZXR1cm4gZG9tYWluRnJvbVVybChmaXJzdFRhYi51cmwpO1xuICAgIGNhc2UgXCJ0b3BpY1wiOlxuICAgICAgcmV0dXJuIHNlbWFudGljQnVja2V0KGZpcnN0VGFiLnRpdGxlLCBmaXJzdFRhYi51cmwpO1xuICAgIGNhc2UgXCJsaW5lYWdlXCI6XG4gICAgICBpZiAoZmlyc3RUYWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBjb25zdCBwYXJlbnQgPSBhbGxUYWJzTWFwLmdldChmaXJzdFRhYi5vcGVuZXJUYWJJZCk7XG4gICAgICAgIGlmIChwYXJlbnQpIHtcbiAgICAgICAgICBjb25zdCBwYXJlbnRUaXRsZSA9IHBhcmVudC50aXRsZS5sZW5ndGggPiAyMCA/IHBhcmVudC50aXRsZS5zdWJzdHJpbmcoMCwgMjApICsgXCIuLi5cIiA6IHBhcmVudC50aXRsZTtcbiAgICAgICAgICByZXR1cm4gYEZyb206ICR7cGFyZW50VGl0bGV9YDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYEZyb206IFRhYiAke2ZpcnN0VGFiLm9wZW5lclRhYklkfWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYFdpbmRvdyAke2ZpcnN0VGFiLndpbmRvd0lkfWA7XG4gICAgY2FzZSBcImNvbnRleHRcIjpcbiAgICAgIHJldHVybiBmaXJzdFRhYi5jb250ZXh0IHx8IFwiVW5jYXRlZ29yaXplZFwiO1xuICAgIGNhc2UgXCJwaW5uZWRcIjpcbiAgICAgIHJldHVybiBmaXJzdFRhYi5waW5uZWQgPyBcIlBpbm5lZFwiIDogXCJVbnBpbm5lZFwiO1xuICAgIGNhc2UgXCJhZ2VcIjpcbiAgICAgIHJldHVybiBnZXRSZWNlbmN5TGFiZWwoZmlyc3RUYWIubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgIGNhc2UgXCJ1cmxcIjpcbiAgICAgIHJldHVybiBcIlVSTCBHcm91cFwiO1xuICAgIGNhc2UgXCJyZWNlbmN5XCI6XG4gICAgICByZXR1cm4gXCJUaW1lIEdyb3VwXCI7XG4gICAgY2FzZSBcIm5lc3RpbmdcIjpcbiAgICAgIHJldHVybiBmaXJzdFRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkID8gXCJDaGlsZHJlblwiIDogXCJSb290c1wiO1xuICAgIGRlZmF1bHQ6XG4gICAgICBjb25zdCB2YWwgPSBnZXRGaWVsZFZhbHVlKGZpcnN0VGFiLCBzdHJhdGVneSk7XG4gICAgICBpZiAodmFsICE9PSB1bmRlZmluZWQgJiYgdmFsICE9PSBudWxsKSB7XG4gICAgICAgICAgcmV0dXJuIFN0cmluZyh2YWwpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIFwiVW5rbm93blwiO1xuICB9XG59O1xuXG5jb25zdCBnZW5lcmF0ZUxhYmVsID0gKFxuICBzdHJhdGVnaWVzOiAoR3JvdXBpbmdTdHJhdGVneSB8IHN0cmluZylbXSxcbiAgdGFiczogVGFiTWV0YWRhdGFbXSxcbiAgYWxsVGFic01hcDogTWFwPG51bWJlciwgVGFiTWV0YWRhdGE+XG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBsYWJlbHMgPSBzdHJhdGVnaWVzXG4gICAgLm1hcChzID0+IGdldExhYmVsQ29tcG9uZW50KHMsIHRhYnMsIGFsbFRhYnNNYXApKVxuICAgIC5maWx0ZXIobCA9PiBsICYmIGwgIT09IFwiVW5rbm93blwiICYmIGwgIT09IFwiR3JvdXBcIiAmJiBsICE9PSBcIlVSTCBHcm91cFwiICYmIGwgIT09IFwiVGltZSBHcm91cFwiICYmIGwgIT09IFwiTWlzY1wiKTtcblxuICBpZiAobGFiZWxzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIFwiR3JvdXBcIjtcbiAgcmV0dXJuIEFycmF5LmZyb20obmV3IFNldChsYWJlbHMpKS5qb2luKFwiIC0gXCIpO1xufTtcblxuY29uc3QgZ2V0U3RyYXRlZ3lDb2xvclJ1bGUgPSAoc3RyYXRlZ3lJZDogc3RyaW5nKTogR3JvdXBpbmdSdWxlIHwgdW5kZWZpbmVkID0+IHtcbiAgICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneUlkKTtcbiAgICBpZiAoIWN1c3RvbSkgcmV0dXJuIHVuZGVmaW5lZDtcblxuICAgIGNvbnN0IGdyb3VwaW5nUnVsZXNMaXN0ID0gYXNBcnJheTxHcm91cGluZ1J1bGU+KGN1c3RvbS5ncm91cGluZ1J1bGVzKTtcbiAgICAvLyBJdGVyYXRlIG1hbnVhbGx5IHRvIGNoZWNrIGNvbG9yXG4gICAgZm9yIChsZXQgaSA9IGdyb3VwaW5nUnVsZXNMaXN0Lmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgIGNvbnN0IHJ1bGUgPSBncm91cGluZ1J1bGVzTGlzdFtpXTtcbiAgICAgICAgaWYgKHJ1bGUgJiYgcnVsZS5jb2xvciAmJiBydWxlLmNvbG9yICE9PSAncmFuZG9tJykge1xuICAgICAgICAgICAgcmV0dXJuIHJ1bGU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbn07XG5cbmNvbnN0IHJlc29sdmVXaW5kb3dNb2RlID0gKG1vZGVzOiAoc3RyaW5nIHwgdW5kZWZpbmVkKVtdKTogXCJjdXJyZW50XCIgfCBcIm5ld1wiIHwgXCJjb21wb3VuZFwiID0+IHtcbiAgICBpZiAobW9kZXMuaW5jbHVkZXMoXCJuZXdcIikpIHJldHVybiBcIm5ld1wiO1xuICAgIGlmIChtb2Rlcy5pbmNsdWRlcyhcImNvbXBvdW5kXCIpKSByZXR1cm4gXCJjb21wb3VuZFwiO1xuICAgIHJldHVybiBcImN1cnJlbnRcIjtcbn07XG5cbmV4cG9ydCBjb25zdCBncm91cFRhYnMgPSAoXG4gIHRhYnM6IFRhYk1ldGFkYXRhW10sXG4gIHN0cmF0ZWdpZXM6IChTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmcpW11cbik6IFRhYkdyb3VwW10gPT4ge1xuICBjb25zdCBhdmFpbGFibGVTdHJhdGVnaWVzID0gZ2V0U3RyYXRlZ2llcyhjdXN0b21TdHJhdGVnaWVzKTtcbiAgY29uc3QgZWZmZWN0aXZlU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gYXZhaWxhYmxlU3RyYXRlZ2llcy5maW5kKGF2YWlsID0+IGF2YWlsLmlkID09PSBzKT8uaXNHcm91cGluZyk7XG4gIGNvbnN0IGJ1Y2tldHMgPSBuZXcgTWFwPHN0cmluZywgVGFiR3JvdXA+KCk7XG5cbiAgY29uc3QgYWxsVGFic01hcCA9IG5ldyBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YT4oKTtcbiAgdGFicy5mb3JFYWNoKHQgPT4gYWxsVGFic01hcC5zZXQodC5pZCwgdCkpO1xuXG4gIHRhYnMuZm9yRWFjaCgodGFiKSA9PiB7XG4gICAgbGV0IGtleXM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgYXBwbGllZFN0cmF0ZWdpZXM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgY29sbGVjdGVkTW9kZXM6IHN0cmluZ1tdID0gW107XG5cbiAgICB0cnkge1xuICAgICAgICBmb3IgKGNvbnN0IHMgb2YgZWZmZWN0aXZlU3RyYXRlZ2llcykge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gZ2V0R3JvdXBpbmdSZXN1bHQodGFiLCBzKTtcbiAgICAgICAgICAgIGlmIChyZXN1bHQua2V5ICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAga2V5cy5wdXNoKGAke3N9OiR7cmVzdWx0LmtleX1gKTtcbiAgICAgICAgICAgICAgICBhcHBsaWVkU3RyYXRlZ2llcy5wdXNoKHMpO1xuICAgICAgICAgICAgICAgIGNvbGxlY3RlZE1vZGVzLnB1c2gocmVzdWx0Lm1vZGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGdlbmVyYXRpbmcgZ3JvdXBpbmcga2V5XCIsIHsgdGFiSWQ6IHRhYi5pZCwgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgcmV0dXJuOyAvLyBTa2lwIHRoaXMgdGFiIG9uIGVycm9yXG4gICAgfVxuXG4gICAgLy8gSWYgbm8gc3RyYXRlZ2llcyBhcHBsaWVkIChlLmcuIGFsbCBmaWx0ZXJlZCBvdXQpLCBza2lwIGdyb3VwaW5nIGZvciB0aGlzIHRhYlxuICAgIGlmIChrZXlzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgZWZmZWN0aXZlTW9kZSA9IHJlc29sdmVXaW5kb3dNb2RlKGNvbGxlY3RlZE1vZGVzKTtcbiAgICBjb25zdCB2YWx1ZUtleSA9IGtleXMuam9pbihcIjo6XCIpO1xuICAgIGxldCBidWNrZXRLZXkgPSBcIlwiO1xuICAgIGlmIChlZmZlY3RpdmVNb2RlID09PSAnY3VycmVudCcpIHtcbiAgICAgICAgIGJ1Y2tldEtleSA9IGB3aW5kb3ctJHt0YWIud2luZG93SWR9OjpgICsgdmFsdWVLZXk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgIGJ1Y2tldEtleSA9IGBnbG9iYWw6OmAgKyB2YWx1ZUtleTtcbiAgICB9XG5cbiAgICBsZXQgZ3JvdXAgPSBidWNrZXRzLmdldChidWNrZXRLZXkpO1xuICAgIGlmICghZ3JvdXApIHtcbiAgICAgIGxldCBncm91cENvbG9yID0gbnVsbDtcbiAgICAgIGxldCBjb2xvckZpZWxkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbiAgICAgIGZvciAoY29uc3Qgc0lkIG9mIGFwcGxpZWRTdHJhdGVnaWVzKSB7XG4gICAgICAgIGNvbnN0IHJ1bGUgPSBnZXRTdHJhdGVneUNvbG9yUnVsZShzSWQpO1xuICAgICAgICBpZiAocnVsZSkge1xuICAgICAgICAgICAgZ3JvdXBDb2xvciA9IHJ1bGUuY29sb3I7XG4gICAgICAgICAgICBjb2xvckZpZWxkID0gcnVsZS5jb2xvckZpZWxkO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKGdyb3VwQ29sb3IgPT09ICdtYXRjaCcpIHtcbiAgICAgICAgZ3JvdXBDb2xvciA9IGNvbG9yRm9yS2V5KHZhbHVlS2V5LCAwKTtcbiAgICAgIH0gZWxzZSBpZiAoZ3JvdXBDb2xvciA9PT0gJ2ZpZWxkJyAmJiBjb2xvckZpZWxkKSB7XG4gICAgICAgIGNvbnN0IHZhbCA9IGdldEZpZWxkVmFsdWUodGFiLCBjb2xvckZpZWxkKTtcbiAgICAgICAgY29uc3Qga2V5ID0gdmFsICE9PSB1bmRlZmluZWQgJiYgdmFsICE9PSBudWxsID8gU3RyaW5nKHZhbCkgOiBcIlwiO1xuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkoa2V5LCAwKTtcbiAgICAgIH0gZWxzZSBpZiAoIWdyb3VwQ29sb3IgfHwgZ3JvdXBDb2xvciA9PT0gJ2ZpZWxkJykge1xuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkoYnVja2V0S2V5LCBidWNrZXRzLnNpemUpO1xuICAgICAgfVxuXG4gICAgICBncm91cCA9IHtcbiAgICAgICAgaWQ6IGJ1Y2tldEtleSxcbiAgICAgICAgd2luZG93SWQ6IHRhYi53aW5kb3dJZCxcbiAgICAgICAgbGFiZWw6IFwiXCIsXG4gICAgICAgIGNvbG9yOiBncm91cENvbG9yLFxuICAgICAgICB0YWJzOiBbXSxcbiAgICAgICAgcmVhc29uOiBhcHBsaWVkU3RyYXRlZ2llcy5qb2luKFwiICsgXCIpLFxuICAgICAgICB3aW5kb3dNb2RlOiBlZmZlY3RpdmVNb2RlXG4gICAgICB9O1xuICAgICAgYnVja2V0cy5zZXQoYnVja2V0S2V5LCBncm91cCk7XG4gICAgfVxuICAgIGdyb3VwLnRhYnMucHVzaCh0YWIpO1xuICB9KTtcblxuICBjb25zdCBncm91cHMgPSBBcnJheS5mcm9tKGJ1Y2tldHMudmFsdWVzKCkpO1xuICBncm91cHMuZm9yRWFjaChncm91cCA9PiB7XG4gICAgZ3JvdXAubGFiZWwgPSBnZW5lcmF0ZUxhYmVsKGVmZmVjdGl2ZVN0cmF0ZWdpZXMsIGdyb3VwLnRhYnMsIGFsbFRhYnNNYXApO1xuICB9KTtcblxuICByZXR1cm4gZ3JvdXBzO1xufTtcblxuY29uc3QgY2hlY2tWYWx1ZU1hdGNoID0gKFxuICAgIG9wZXJhdG9yOiBzdHJpbmcsXG4gICAgcmF3VmFsdWU6IGFueSxcbiAgICBydWxlVmFsdWU6IHN0cmluZ1xuKTogeyBpc01hdGNoOiBib29sZWFuOyBtYXRjaE9iajogUmVnRXhwRXhlY0FycmF5IHwgbnVsbCB9ID0+IHtcbiAgICBjb25zdCB2YWx1ZVN0ciA9IHJhd1ZhbHVlICE9PSB1bmRlZmluZWQgJiYgcmF3VmFsdWUgIT09IG51bGwgPyBTdHJpbmcocmF3VmFsdWUpIDogXCJcIjtcbiAgICBjb25zdCB2YWx1ZVRvQ2hlY2sgPSB2YWx1ZVN0ci50b0xvd2VyQ2FzZSgpO1xuICAgIGNvbnN0IHBhdHRlcm5Ub0NoZWNrID0gcnVsZVZhbHVlID8gcnVsZVZhbHVlLnRvTG93ZXJDYXNlKCkgOiBcIlwiO1xuXG4gICAgbGV0IGlzTWF0Y2ggPSBmYWxzZTtcbiAgICBsZXQgbWF0Y2hPYmo6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGwgPSBudWxsO1xuXG4gICAgc3dpdGNoIChvcGVyYXRvcikge1xuICAgICAgICBjYXNlICdjb250YWlucyc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suaW5jbHVkZXMocGF0dGVyblRvQ2hlY2spOyBicmVhaztcbiAgICAgICAgY2FzZSAnZG9lc05vdENvbnRhaW4nOiBpc01hdGNoID0gIXZhbHVlVG9DaGVjay5pbmNsdWRlcyhwYXR0ZXJuVG9DaGVjayk7IGJyZWFrO1xuICAgICAgICBjYXNlICdlcXVhbHMnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrID09PSBwYXR0ZXJuVG9DaGVjazsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3N0YXJ0c1dpdGgnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrLnN0YXJ0c1dpdGgocGF0dGVyblRvQ2hlY2spOyBicmVhaztcbiAgICAgICAgY2FzZSAnZW5kc1dpdGgnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrLmVuZHNXaXRoKHBhdHRlcm5Ub0NoZWNrKTsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2V4aXN0cyc6IGlzTWF0Y2ggPSByYXdWYWx1ZSAhPT0gdW5kZWZpbmVkOyBicmVhaztcbiAgICAgICAgY2FzZSAnZG9lc05vdEV4aXN0JzogaXNNYXRjaCA9IHJhd1ZhbHVlID09PSB1bmRlZmluZWQ7IGJyZWFrO1xuICAgICAgICBjYXNlICdpc051bGwnOiBpc01hdGNoID0gcmF3VmFsdWUgPT09IG51bGw7IGJyZWFrO1xuICAgICAgICBjYXNlICdpc05vdE51bGwnOiBpc01hdGNoID0gcmF3VmFsdWUgIT09IG51bGw7IGJyZWFrO1xuICAgICAgICBjYXNlICdtYXRjaGVzJzpcbiAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChydWxlVmFsdWUsICdpJyk7XG4gICAgICAgICAgICAgICAgbWF0Y2hPYmogPSByZWdleC5leGVjKHZhbHVlU3RyKTtcbiAgICAgICAgICAgICAgICBpc01hdGNoID0gISFtYXRjaE9iajtcbiAgICAgICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICByZXR1cm4geyBpc01hdGNoLCBtYXRjaE9iaiB9O1xufTtcblxuZXhwb3J0IGNvbnN0IGNoZWNrQ29uZGl0aW9uID0gKGNvbmRpdGlvbjogUnVsZUNvbmRpdGlvbiwgdGFiOiBUYWJNZXRhZGF0YSk6IGJvb2xlYW4gPT4ge1xuICAgIGlmICghY29uZGl0aW9uKSByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgcmF3VmFsdWUgPSBnZXRGaWVsZFZhbHVlKHRhYiwgY29uZGl0aW9uLmZpZWxkKTtcbiAgICBjb25zdCB7IGlzTWF0Y2ggfSA9IGNoZWNrVmFsdWVNYXRjaChjb25kaXRpb24ub3BlcmF0b3IsIHJhd1ZhbHVlLCBjb25kaXRpb24udmFsdWUpO1xuICAgIHJldHVybiBpc01hdGNoO1xufTtcblxuZnVuY3Rpb24gZXZhbHVhdGVMZWdhY3lSdWxlcyhsZWdhY3lSdWxlczogU3RyYXRlZ3lSdWxlW10sIHRhYjogVGFiTWV0YWRhdGEpOiBzdHJpbmcgfCBudWxsIHtcbiAgICAvLyBEZWZlbnNpdmUgY2hlY2tcbiAgICBpZiAoIWxlZ2FjeVJ1bGVzIHx8ICFBcnJheS5pc0FycmF5KGxlZ2FjeVJ1bGVzKSkge1xuICAgICAgICBpZiAoIWxlZ2FjeVJ1bGVzKSByZXR1cm4gbnVsbDtcbiAgICAgICAgLy8gVHJ5IGFzQXJyYXkgaWYgaXQncyBub3QgYXJyYXkgYnV0IHRydXRoeSAodW5saWtlbHkgZ2l2ZW4gcHJldmlvdXMgbG9naWMgYnV0IHNhZmUpXG4gICAgfVxuXG4gICAgY29uc3QgbGVnYWN5UnVsZXNMaXN0ID0gYXNBcnJheTxTdHJhdGVneVJ1bGU+KGxlZ2FjeVJ1bGVzKTtcbiAgICBpZiAobGVnYWN5UnVsZXNMaXN0Lmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG5cbiAgICB0cnkge1xuICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgbGVnYWN5UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICBpZiAoIXJ1bGUpIGNvbnRpbnVlO1xuICAgICAgICAgICAgY29uc3QgcmF3VmFsdWUgPSBnZXRGaWVsZFZhbHVlKHRhYiwgcnVsZS5maWVsZCk7XG4gICAgICAgICAgICBjb25zdCB7IGlzTWF0Y2gsIG1hdGNoT2JqIH0gPSBjaGVja1ZhbHVlTWF0Y2gocnVsZS5vcGVyYXRvciwgcmF3VmFsdWUsIHJ1bGUudmFsdWUpO1xuXG4gICAgICAgICAgICBpZiAoaXNNYXRjaCkge1xuICAgICAgICAgICAgICAgIGxldCByZXN1bHQgPSBydWxlLnJlc3VsdDtcbiAgICAgICAgICAgICAgICBpZiAobWF0Y2hPYmopIHtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBtYXRjaE9iai5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKG5ldyBSZWdFeHAoYFxcXFwkJHtpfWAsICdnJyksIG1hdGNoT2JqW2ldIHx8IFwiXCIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGV2YWx1YXRpbmcgbGVnYWN5IHJ1bGVzXCIsIHsgZXJyb3I6IFN0cmluZyhlcnJvcikgfSk7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgY29uc3QgZ2V0R3JvdXBpbmdSZXN1bHQgPSAodGFiOiBUYWJNZXRhZGF0YSwgc3RyYXRlZ3k6IEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcpOiB7IGtleTogc3RyaW5nIHwgbnVsbCwgbW9kZTogXCJjdXJyZW50XCIgfCBcIm5ld1wiIHwgXCJjb21wb3VuZFwiIH0gPT4ge1xuICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneSk7XG4gIGlmIChjdXN0b20pIHtcbiAgICAgIGNvbnN0IGZpbHRlckdyb3Vwc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb25bXT4oY3VzdG9tLmZpbHRlckdyb3Vwcyk7XG4gICAgICBjb25zdCBmaWx0ZXJzTGlzdCA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbj4oY3VzdG9tLmZpbHRlcnMpO1xuXG4gICAgICBsZXQgbWF0Y2ggPSBmYWxzZTtcblxuICAgICAgaWYgKGZpbHRlckdyb3Vwc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIC8vIE9SIGxvZ2ljXG4gICAgICAgICAgZm9yIChjb25zdCBncm91cCBvZiBmaWx0ZXJHcm91cHNMaXN0KSB7XG4gICAgICAgICAgICAgIGNvbnN0IGdyb3VwUnVsZXMgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGdyb3VwKTtcbiAgICAgICAgICAgICAgaWYgKGdyb3VwUnVsZXMubGVuZ3RoID09PSAwIHx8IGdyb3VwUnVsZXMuZXZlcnkociA9PiBjaGVja0NvbmRpdGlvbihyLCB0YWIpKSkge1xuICAgICAgICAgICAgICAgICAgbWF0Y2ggPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGZpbHRlcnNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAvLyBMZWdhY3kvU2ltcGxlIEFORCBsb2dpY1xuICAgICAgICAgIGlmIChmaWx0ZXJzTGlzdC5ldmVyeShmID0+IGNoZWNrQ29uZGl0aW9uKGYsIHRhYikpKSB7XG4gICAgICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIE5vIGZpbHRlcnMgLT4gTWF0Y2ggYWxsXG4gICAgICAgICAgbWF0Y2ggPSB0cnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoIW1hdGNoKSB7XG4gICAgICAgICAgcmV0dXJuIHsga2V5OiBudWxsLCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICAgICAgfVxuXG4gICAgICBjb25zdCBncm91cGluZ1J1bGVzTGlzdCA9IGFzQXJyYXk8R3JvdXBpbmdSdWxlPihjdXN0b20uZ3JvdXBpbmdSdWxlcyk7XG4gICAgICBpZiAoZ3JvdXBpbmdSdWxlc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgIGNvbnN0IG1vZGVzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZ3JvdXBpbmdSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXJ1bGUpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIGxldCB2YWwgPSBcIlwiO1xuICAgICAgICAgICAgICAgIGlmIChydWxlLnNvdXJjZSA9PT0gJ2ZpZWxkJykge1xuICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmF3ID0gZ2V0RmllbGRWYWx1ZSh0YWIsIHJ1bGUudmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgdmFsID0gcmF3ICE9PSB1bmRlZmluZWQgJiYgcmF3ICE9PSBudWxsID8gU3RyaW5nKHJhdykgOiBcIlwiO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICB2YWwgPSBydWxlLnZhbHVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh2YWwgJiYgcnVsZS50cmFuc2Zvcm0gJiYgcnVsZS50cmFuc2Zvcm0gIT09ICdub25lJykge1xuICAgICAgICAgICAgICAgICAgICBzd2l0Y2ggKHJ1bGUudHJhbnNmb3JtKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdzdHJpcFRsZCc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gc3RyaXBUbGQodmFsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ2xvd2VyY2FzZSc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gdmFsLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICd1cHBlcmNhc2UnOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHZhbC50b1VwcGVyQ2FzZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnZmlyc3RDaGFyJzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSB2YWwuY2hhckF0KDApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnZG9tYWluJzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBkb21haW5Gcm9tVXJsKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdob3N0bmFtZSc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IG5ldyBVUkwodmFsKS5ob3N0bmFtZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHsgLyoga2VlcCBhcyBpcyAqLyB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdyZWdleCc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJ1bGUudHJhbnNmb3JtUGF0dGVybikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHJlZ2V4ID0gcmVnZXhDYWNoZS5nZXQocnVsZS50cmFuc2Zvcm1QYXR0ZXJuKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghcmVnZXgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZWdleCA9IG5ldyBSZWdFeHAocnVsZS50cmFuc2Zvcm1QYXR0ZXJuKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZWdleENhY2hlLnNldChydWxlLnRyYW5zZm9ybVBhdHRlcm4sIHJlZ2V4KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1hdGNoID0gcmVnZXguZXhlYyh2YWwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGV4dHJhY3RlZCA9IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBtYXRjaC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleHRyYWN0ZWQgKz0gbWF0Y2hbaV0gfHwgXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gZXh0cmFjdGVkO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkludmFsaWQgcmVnZXggaW4gdHJhbnNmb3JtXCIsIHsgcGF0dGVybjogcnVsZS50cmFuc2Zvcm1QYXR0ZXJuLCBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHZhbCkge1xuICAgICAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChydWxlLndpbmRvd01vZGUpIG1vZGVzLnB1c2gocnVsZS53aW5kb3dNb2RlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgIGxvZ0RlYnVnKFwiRXJyb3IgYXBwbHlpbmcgZ3JvdXBpbmcgcnVsZXNcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIHJldHVybiB7IGtleTogcGFydHMuam9pbihcIiAtIFwiKSwgbW9kZTogcmVzb2x2ZVdpbmRvd01vZGUobW9kZXMpIH07XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7IGtleTogY3VzdG9tLmZhbGxiYWNrIHx8IFwiTWlzY1wiLCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICAgICAgfSBlbHNlIGlmIChjdXN0b20ucnVsZXMpIHtcbiAgICAgICAgICBjb25zdCByZXN1bHQgPSBldmFsdWF0ZUxlZ2FjeVJ1bGVzKGFzQXJyYXk8U3RyYXRlZ3lSdWxlPihjdXN0b20ucnVsZXMpLCB0YWIpO1xuICAgICAgICAgIGlmIChyZXN1bHQpIHJldHVybiB7IGtleTogcmVzdWx0LCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICAgICAgfVxuXG4gICAgICByZXR1cm4geyBrZXk6IGN1c3RvbS5mYWxsYmFjayB8fCBcIk1pc2NcIiwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgfVxuXG4gIC8vIEJ1aWx0LWluIHN0cmF0ZWdpZXNcbiAgbGV0IHNpbXBsZUtleTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIHN3aXRjaCAoc3RyYXRlZ3kpIHtcbiAgICBjYXNlIFwiZG9tYWluXCI6XG4gICAgY2FzZSBcImRvbWFpbl9mdWxsXCI6XG4gICAgICBzaW1wbGVLZXkgPSBkb21haW5Gcm9tVXJsKHRhYi51cmwpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInRvcGljXCI6XG4gICAgICBzaW1wbGVLZXkgPSBzZW1hbnRpY0J1Y2tldCh0YWIudGl0bGUsIHRhYi51cmwpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcImxpbmVhZ2VcIjpcbiAgICAgIHNpbXBsZUtleSA9IG5hdmlnYXRpb25LZXkodGFiKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJjb250ZXh0XCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIuY29udGV4dCB8fCBcIlVuY2F0ZWdvcml6ZWRcIjtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJwaW5uZWRcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi5waW5uZWQgPyBcInBpbm5lZFwiIDogXCJ1bnBpbm5lZFwiO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcImFnZVwiOlxuICAgICAgc2ltcGxlS2V5ID0gZ2V0UmVjZW5jeUxhYmVsKHRhYi5sYXN0QWNjZXNzZWQgPz8gMCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwidXJsXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIudXJsO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInRpdGxlXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIudGl0bGU7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwicmVjZW5jeVwiOlxuICAgICAgc2ltcGxlS2V5ID0gU3RyaW5nKHRhYi5sYXN0QWNjZXNzZWQgPz8gMCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwibmVzdGluZ1wiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQgPyBcImNoaWxkXCIgOiBcInJvb3RcIjtcbiAgICAgIGJyZWFrO1xuICAgIGRlZmF1bHQ6XG4gICAgICAgIGNvbnN0IHZhbCA9IGdldEZpZWxkVmFsdWUodGFiLCBzdHJhdGVneSk7XG4gICAgICAgIGlmICh2YWwgIT09IHVuZGVmaW5lZCAmJiB2YWwgIT09IG51bGwpIHtcbiAgICAgICAgICAgIHNpbXBsZUtleSA9IFN0cmluZyh2YWwpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2ltcGxlS2V5ID0gXCJVbmtub3duXCI7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gIH1cbiAgcmV0dXJuIHsga2V5OiBzaW1wbGVLZXksIG1vZGU6IFwiY3VycmVudFwiIH07XG59O1xuXG5leHBvcnQgY29uc3QgZ3JvdXBpbmdLZXkgPSAodGFiOiBUYWJNZXRhZGF0YSwgc3RyYXRlZ3k6IEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcpOiBzdHJpbmcgfCBudWxsID0+IHtcbiAgICByZXR1cm4gZ2V0R3JvdXBpbmdSZXN1bHQodGFiLCBzdHJhdGVneSkua2V5O1xufTtcblxuZnVuY3Rpb24gaXNDb250ZXh0RmllbGQoZmllbGQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBmaWVsZCA9PT0gJ2NvbnRleHQnIHx8IGZpZWxkID09PSAnZ2VucmUnIHx8IGZpZWxkID09PSAnc2l0ZU5hbWUnIHx8IGZpZWxkLnN0YXJ0c1dpdGgoJ2NvbnRleHREYXRhLicpO1xufVxuXG5leHBvcnQgY29uc3QgcmVxdWlyZXNDb250ZXh0QW5hbHlzaXMgPSAoc3RyYXRlZ3lJZHM6IChzdHJpbmcgfCBTb3J0aW5nU3RyYXRlZ3kpW10pOiBib29sZWFuID0+IHtcbiAgICAvLyBDaGVjayBpZiBcImNvbnRleHRcIiBzdHJhdGVneSBpcyBleHBsaWNpdGx5IHJlcXVlc3RlZFxuICAgIGlmIChzdHJhdGVneUlkcy5pbmNsdWRlcyhcImNvbnRleHRcIikpIHJldHVybiB0cnVlO1xuXG4gICAgY29uc3Qgc3RyYXRlZ2llcyA9IGdldFN0cmF0ZWdpZXMoY3VzdG9tU3RyYXRlZ2llcyk7XG4gICAgLy8gZmlsdGVyIG9ubHkgdGhvc2UgdGhhdCBtYXRjaCB0aGUgcmVxdWVzdGVkIElEc1xuICAgIGNvbnN0IGFjdGl2ZURlZnMgPSBzdHJhdGVnaWVzLmZpbHRlcihzID0+IHN0cmF0ZWd5SWRzLmluY2x1ZGVzKHMuaWQpKTtcblxuICAgIGZvciAoY29uc3QgZGVmIG9mIGFjdGl2ZURlZnMpIHtcbiAgICAgICAgLy8gSWYgaXQncyBhIGJ1aWx0LWluIHN0cmF0ZWd5IHRoYXQgbmVlZHMgY29udGV4dCAob25seSAnY29udGV4dCcgZG9lcylcbiAgICAgICAgaWYgKGRlZi5pZCA9PT0gJ2NvbnRleHQnKSByZXR1cm4gdHJ1ZTtcblxuICAgICAgICAvLyBJZiBpdCBpcyBhIGN1c3RvbSBzdHJhdGVneSAob3Igb3ZlcnJpZGVzIGJ1aWx0LWluKSwgY2hlY2sgaXRzIHJ1bGVzXG4gICAgICAgIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChjID0+IGMuaWQgPT09IGRlZi5pZCk7XG4gICAgICAgIGlmIChjdXN0b20pIHtcbiAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzTGlzdCA9IGFzQXJyYXk8R3JvdXBpbmdSdWxlPihjdXN0b20uZ3JvdXBpbmdSdWxlcyk7XG4gICAgICAgICAgICAgY29uc3Qgc29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KGN1c3RvbS5zb3J0aW5nUnVsZXMpO1xuICAgICAgICAgICAgIGNvbnN0IGdyb3VwU29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KGN1c3RvbS5ncm91cFNvcnRpbmdSdWxlcyk7XG4gICAgICAgICAgICAgY29uc3QgZmlsdGVyc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGN1c3RvbS5maWx0ZXJzKTtcbiAgICAgICAgICAgICBjb25zdCBmaWx0ZXJHcm91cHNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uW10+KGN1c3RvbS5maWx0ZXJHcm91cHMpO1xuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwUnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIHJ1bGUuc291cmNlID09PSAnZmllbGQnICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUudmFsdWUpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgcnVsZS5jb2xvciA9PT0gJ2ZpZWxkJyAmJiBydWxlLmNvbG9yRmllbGQgJiYgaXNDb250ZXh0RmllbGQocnVsZS5jb2xvckZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIHNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBmaWx0ZXJzTGlzdCkge1xuICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBpc0NvbnRleHRGaWVsZChydWxlLmZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBncm91cCBvZiBmaWx0ZXJHcm91cHNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGNvbnN0IGdyb3VwUnVsZXMgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGdyb3VwKTtcbiAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwUnVsZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59O1xuIiwgImltcG9ydCB7IFNvcnRpbmdTdHJhdGVneSwgVGFiTWV0YWRhdGEsIEN1c3RvbVN0cmF0ZWd5LCBTb3J0aW5nUnVsZSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGRvbWFpbkZyb21VcmwsIHNlbWFudGljQnVja2V0LCBuYXZpZ2F0aW9uS2V5LCBncm91cGluZ0tleSwgZ2V0RmllbGRWYWx1ZSwgZ2V0Q3VzdG9tU3RyYXRlZ2llcyB9IGZyb20gXCIuL2dyb3VwaW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcblxuZXhwb3J0IGNvbnN0IHJlY2VuY3lTY29yZSA9ICh0YWI6IFRhYk1ldGFkYXRhKSA9PiB0YWIubGFzdEFjY2Vzc2VkID8/IDA7XG5leHBvcnQgY29uc3QgaGllcmFyY2h5U2NvcmUgPSAodGFiOiBUYWJNZXRhZGF0YSkgPT4gKHRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkID8gMSA6IDApO1xuZXhwb3J0IGNvbnN0IHBpbm5lZFNjb3JlID0gKHRhYjogVGFiTWV0YWRhdGEpID0+ICh0YWIucGlubmVkID8gMCA6IDEpO1xuXG5leHBvcnQgY29uc3Qgc29ydFRhYnMgPSAodGFiczogVGFiTWV0YWRhdGFbXSwgc3RyYXRlZ2llczogU29ydGluZ1N0cmF0ZWd5W10pOiBUYWJNZXRhZGF0YVtdID0+IHtcbiAgY29uc3Qgc2NvcmluZzogU29ydGluZ1N0cmF0ZWd5W10gPSBzdHJhdGVnaWVzLmxlbmd0aCA/IHN0cmF0ZWdpZXMgOiBbXCJwaW5uZWRcIiwgXCJyZWNlbmN5XCJdO1xuICByZXR1cm4gWy4uLnRhYnNdLnNvcnQoKGEsIGIpID0+IHtcbiAgICBmb3IgKGNvbnN0IHN0cmF0ZWd5IG9mIHNjb3JpbmcpIHtcbiAgICAgIGNvbnN0IGRpZmYgPSBjb21wYXJlQnkoc3RyYXRlZ3ksIGEsIGIpO1xuICAgICAgaWYgKGRpZmYgIT09IDApIHJldHVybiBkaWZmO1xuICAgIH1cbiAgICByZXR1cm4gYS5pZCAtIGIuaWQ7XG4gIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IGNvbXBhcmVCeSA9IChzdHJhdGVneTogU29ydGluZ1N0cmF0ZWd5IHwgc3RyaW5nLCBhOiBUYWJNZXRhZGF0YSwgYjogVGFiTWV0YWRhdGEpOiBudW1iZXIgPT4ge1xuICAvLyAxLiBDaGVjayBDdXN0b20gU3RyYXRlZ2llcyBmb3IgU29ydGluZyBSdWxlc1xuICBjb25zdCBjdXN0b21TdHJhdHMgPSBnZXRDdXN0b21TdHJhdGVnaWVzKCk7XG4gIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0cy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3kpO1xuICBpZiAoY3VzdG9tKSB7XG4gICAgICBjb25zdCBzb3J0UnVsZXNMaXN0ID0gYXNBcnJheTxTb3J0aW5nUnVsZT4oY3VzdG9tLnNvcnRpbmdSdWxlcyk7XG4gICAgICBpZiAoc29ydFJ1bGVzTGlzdC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgLy8gRXZhbHVhdGUgY3VzdG9tIHNvcnRpbmcgcnVsZXMgaW4gb3JkZXJcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2Ygc29ydFJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IHZhbEEgPSBnZXRGaWVsZFZhbHVlKGEsIHJ1bGUuZmllbGQpO1xuICAgICAgICAgICAgICAgICAgY29uc3QgdmFsQiA9IGdldEZpZWxkVmFsdWUoYiwgcnVsZS5maWVsZCk7XG5cbiAgICAgICAgICAgICAgICAgIGxldCByZXN1bHQgPSAwO1xuICAgICAgICAgICAgICAgICAgaWYgKHZhbEEgPCB2YWxCKSByZXN1bHQgPSAtMTtcbiAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKHZhbEEgPiB2YWxCKSByZXN1bHQgPSAxO1xuXG4gICAgICAgICAgICAgICAgICBpZiAocmVzdWx0ICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJ1bGUub3JkZXIgPT09ICdkZXNjJyA/IC1yZXN1bHQgOiByZXN1bHQ7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgIGxvZ0RlYnVnKFwiRXJyb3IgZXZhbHVhdGluZyBjdXN0b20gc29ydGluZyBydWxlc1wiLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIElmIGFsbCBydWxlcyBlcXVhbCwgY29udGludWUgdG8gbmV4dCBzdHJhdGVneSAocmV0dXJuIDApXG4gICAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9XG4gIH1cblxuICAvLyAyLiBCdWlsdC1pbiBvciBmYWxsYmFja1xuICBzd2l0Y2ggKHN0cmF0ZWd5KSB7XG4gICAgY2FzZSBcInJlY2VuY3lcIjpcbiAgICAgIHJldHVybiAoYi5sYXN0QWNjZXNzZWQgPz8gMCkgLSAoYS5sYXN0QWNjZXNzZWQgPz8gMCk7XG4gICAgY2FzZSBcIm5lc3RpbmdcIjogLy8gRm9ybWVybHkgaGllcmFyY2h5XG4gICAgICByZXR1cm4gaGllcmFyY2h5U2NvcmUoYSkgLSBoaWVyYXJjaHlTY29yZShiKTtcbiAgICBjYXNlIFwicGlubmVkXCI6XG4gICAgICByZXR1cm4gcGlubmVkU2NvcmUoYSkgLSBwaW5uZWRTY29yZShiKTtcbiAgICBjYXNlIFwidGl0bGVcIjpcbiAgICAgIHJldHVybiBhLnRpdGxlLmxvY2FsZUNvbXBhcmUoYi50aXRsZSk7XG4gICAgY2FzZSBcInVybFwiOlxuICAgICAgcmV0dXJuIGEudXJsLmxvY2FsZUNvbXBhcmUoYi51cmwpO1xuICAgIGNhc2UgXCJjb250ZXh0XCI6XG4gICAgICByZXR1cm4gKGEuY29udGV4dCA/PyBcIlwiKS5sb2NhbGVDb21wYXJlKGIuY29udGV4dCA/PyBcIlwiKTtcbiAgICBjYXNlIFwiZG9tYWluXCI6XG4gICAgY2FzZSBcImRvbWFpbl9mdWxsXCI6XG4gICAgICByZXR1cm4gZG9tYWluRnJvbVVybChhLnVybCkubG9jYWxlQ29tcGFyZShkb21haW5Gcm9tVXJsKGIudXJsKSk7XG4gICAgY2FzZSBcInRvcGljXCI6XG4gICAgICByZXR1cm4gc2VtYW50aWNCdWNrZXQoYS50aXRsZSwgYS51cmwpLmxvY2FsZUNvbXBhcmUoc2VtYW50aWNCdWNrZXQoYi50aXRsZSwgYi51cmwpKTtcbiAgICBjYXNlIFwibGluZWFnZVwiOlxuICAgICAgcmV0dXJuIG5hdmlnYXRpb25LZXkoYSkubG9jYWxlQ29tcGFyZShuYXZpZ2F0aW9uS2V5KGIpKTtcbiAgICBjYXNlIFwiYWdlXCI6XG4gICAgICAvLyBSZXZlcnNlIGFscGhhYmV0aWNhbCBmb3IgYWdlIGJ1Y2tldHMgKFRvZGF5IDwgWWVzdGVyZGF5KSwgcm91Z2ggYXBwcm94XG4gICAgICByZXR1cm4gKGdyb3VwaW5nS2V5KGEsIFwiYWdlXCIpIHx8IFwiXCIpLmxvY2FsZUNvbXBhcmUoZ3JvdXBpbmdLZXkoYiwgXCJhZ2VcIikgfHwgXCJcIik7XG4gICAgZGVmYXVsdDpcbiAgICAgIC8vIENoZWNrIGlmIGl0J3MgYSBnZW5lcmljIGZpZWxkIGZpcnN0XG4gICAgICBjb25zdCB2YWxBID0gZ2V0RmllbGRWYWx1ZShhLCBzdHJhdGVneSk7XG4gICAgICBjb25zdCB2YWxCID0gZ2V0RmllbGRWYWx1ZShiLCBzdHJhdGVneSk7XG5cbiAgICAgIGlmICh2YWxBICE9PSB1bmRlZmluZWQgJiYgdmFsQiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgaWYgKHZhbEEgPCB2YWxCKSByZXR1cm4gLTE7XG4gICAgICAgICAgaWYgKHZhbEEgPiB2YWxCKSByZXR1cm4gMTtcbiAgICAgICAgICByZXR1cm4gMDtcbiAgICAgIH1cblxuICAgICAgLy8gRmFsbGJhY2sgZm9yIGN1c3RvbSBzdHJhdGVnaWVzIGdyb3VwaW5nIGtleSAoaWYgdXNpbmcgY3VzdG9tIHN0cmF0ZWd5IGFzIHNvcnRpbmcgYnV0IG5vIHNvcnRpbmcgcnVsZXMgZGVmaW5lZClcbiAgICAgIC8vIG9yIHVuaGFuZGxlZCBidWlsdC1pbnNcbiAgICAgIHJldHVybiAoZ3JvdXBpbmdLZXkoYSwgc3RyYXRlZ3kpIHx8IFwiXCIpLmxvY2FsZUNvbXBhcmUoZ3JvdXBpbmdLZXkoYiwgc3RyYXRlZ3kpIHx8IFwiXCIpO1xuICB9XG59O1xuIiwgImltcG9ydCB7IFRhYkdyb3VwLCBUYWJNZXRhZGF0YSwgUHJlZmVyZW5jZXMgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBtYXBDaHJvbWVUYWIsIGdldFN0b3JlZFByZWZlcmVuY2VzIH0gZnJvbSBcIi4uL3NoYXJlZC91dGlscy5qc1wiO1xuaW1wb3J0IHsgc2V0Q3VzdG9tU3RyYXRlZ2llcyB9IGZyb20gXCIuLi9iYWNrZ3JvdW5kL2dyb3VwaW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgc29ydFRhYnMgfSBmcm9tIFwiLi4vYmFja2dyb3VuZC9zb3J0aW5nU3RyYXRlZ2llcy5qc1wiO1xuXG5jb25zdCBkZWZhdWx0UHJlZmVyZW5jZXM6IFByZWZlcmVuY2VzID0ge1xuICBzb3J0aW5nOiBbXCJwaW5uZWRcIiwgXCJyZWNlbmN5XCJdLFxuICBkZWJ1ZzogZmFsc2UsXG4gIHRoZW1lOiBcImRhcmtcIixcbiAgY3VzdG9tR2VuZXJhOiB7fVxufTtcblxuZXhwb3J0IGNvbnN0IGZldGNoTG9jYWxTdGF0ZSA9IGFzeW5jICgpID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBbdGFicywgZ3JvdXBzLCBwcmVmc10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICBjaHJvbWUudGFicy5xdWVyeSh7fSksXG4gICAgICBjaHJvbWUudGFiR3JvdXBzLnF1ZXJ5KHt9KSxcbiAgICAgIGdldFN0b3JlZFByZWZlcmVuY2VzKClcbiAgICBdKTtcblxuICAgIGNvbnN0IHByZWZlcmVuY2VzID0gcHJlZnMgfHwgZGVmYXVsdFByZWZlcmVuY2VzO1xuXG4gICAgLy8gSW5pdGlhbGl6ZSBjdXN0b20gc3RyYXRlZ2llcyBmb3Igc29ydGluZ1xuICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMocHJlZmVyZW5jZXMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXSk7XG5cbiAgICBjb25zdCBncm91cE1hcCA9IG5ldyBNYXAoZ3JvdXBzLm1hcChnID0+IFtnLmlkLCBnXSkpO1xuICAgIGNvbnN0IG1hcHBlZCA9IHRhYnMubWFwKG1hcENocm9tZVRhYikuZmlsdGVyKCh0KTogdCBpcyBUYWJNZXRhZGF0YSA9PiBCb29sZWFuKHQpKTtcblxuICAgIGNvbnN0IHJlc3VsdEdyb3VwczogVGFiR3JvdXBbXSA9IFtdO1xuICAgIGNvbnN0IHRhYnNCeUdyb3VwSWQgPSBuZXcgTWFwPG51bWJlciwgVGFiTWV0YWRhdGFbXT4oKTtcbiAgICBjb25zdCB0YWJzQnlXaW5kb3dVbmdyb3VwZWQgPSBuZXcgTWFwPG51bWJlciwgVGFiTWV0YWRhdGFbXT4oKTtcblxuICAgIG1hcHBlZC5mb3JFYWNoKHRhYiA9PiB7XG4gICAgICAgIGNvbnN0IGdyb3VwSWQgPSB0YWIuZ3JvdXBJZCA/PyAtMTtcbiAgICAgICAgaWYgKGdyb3VwSWQgIT09IC0xKSB7XG4gICAgICAgICAgICBpZiAoIXRhYnNCeUdyb3VwSWQuaGFzKGdyb3VwSWQpKSB0YWJzQnlHcm91cElkLnNldChncm91cElkLCBbXSk7XG4gICAgICAgICAgICB0YWJzQnlHcm91cElkLmdldChncm91cElkKSEucHVzaCh0YWIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgIGlmICghdGFic0J5V2luZG93VW5ncm91cGVkLmhhcyh0YWIud2luZG93SWQpKSB0YWJzQnlXaW5kb3dVbmdyb3VwZWQuc2V0KHRhYi53aW5kb3dJZCwgW10pO1xuICAgICAgICAgICAgIHRhYnNCeVdpbmRvd1VuZ3JvdXBlZC5nZXQodGFiLndpbmRvd0lkKSEucHVzaCh0YWIpO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgVGFiR3JvdXAgb2JqZWN0cyBmb3IgYWN0dWFsIGdyb3Vwc1xuICAgIGZvciAoY29uc3QgW2dyb3VwSWQsIGdyb3VwVGFic10gb2YgdGFic0J5R3JvdXBJZCkge1xuICAgICAgICBjb25zdCBicm93c2VyR3JvdXAgPSBncm91cE1hcC5nZXQoZ3JvdXBJZCk7XG4gICAgICAgIGlmIChicm93c2VyR3JvdXApIHtcbiAgICAgICAgICAgIHJlc3VsdEdyb3Vwcy5wdXNoKHtcbiAgICAgICAgICAgICAgICBpZDogYGdyb3VwLSR7Z3JvdXBJZH1gLFxuICAgICAgICAgICAgICAgIHdpbmRvd0lkOiBicm93c2VyR3JvdXAud2luZG93SWQsXG4gICAgICAgICAgICAgICAgbGFiZWw6IGJyb3dzZXJHcm91cC50aXRsZSB8fCBcIlVudGl0bGVkIEdyb3VwXCIsXG4gICAgICAgICAgICAgICAgY29sb3I6IGJyb3dzZXJHcm91cC5jb2xvcixcbiAgICAgICAgICAgICAgICB0YWJzOiBzb3J0VGFicyhncm91cFRhYnMsIHByZWZlcmVuY2VzLnNvcnRpbmcpLFxuICAgICAgICAgICAgICAgIHJlYXNvbjogXCJNYW51YWxcIlxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBIYW5kbGUgdW5ncm91cGVkIHRhYnNcbiAgICBmb3IgKGNvbnN0IFt3aW5kb3dJZCwgdGFic10gb2YgdGFic0J5V2luZG93VW5ncm91cGVkKSB7XG4gICAgICAgIHJlc3VsdEdyb3Vwcy5wdXNoKHtcbiAgICAgICAgICAgIGlkOiBgdW5ncm91cGVkLSR7d2luZG93SWR9YCxcbiAgICAgICAgICAgIHdpbmRvd0lkOiB3aW5kb3dJZCxcbiAgICAgICAgICAgIGxhYmVsOiBcIlVuZ3JvdXBlZFwiLFxuICAgICAgICAgICAgY29sb3I6IFwiZ3JleVwiLFxuICAgICAgICAgICAgdGFiczogc29ydFRhYnModGFicywgcHJlZmVyZW5jZXMuc29ydGluZyksXG4gICAgICAgICAgICByZWFzb246IFwiVW5ncm91cGVkXCJcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc29sZS53YXJuKFwiRmV0Y2hlZCBsb2NhbCBzdGF0ZSAoZmFsbGJhY2spXCIpO1xuICAgIHJldHVybiB7IG9rOiB0cnVlLCBkYXRhOiB7IGdyb3VwczogcmVzdWx0R3JvdXBzLCBwcmVmZXJlbmNlcyB9IH07XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBjb25zb2xlLmVycm9yKFwiTG9jYWwgc3RhdGUgZmV0Y2ggZmFpbGVkOlwiLCBlKTtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBTdHJpbmcoZSkgfTtcbiAgfVxufTtcbiIsICJpbXBvcnQge1xuICBBcHBseUdyb3VwaW5nUGF5bG9hZCxcbiAgR3JvdXBpbmdTZWxlY3Rpb24sXG4gIFByZWZlcmVuY2VzLFxuICBSdW50aW1lTWVzc2FnZSxcbiAgUnVudGltZVJlc3BvbnNlLFxuICBTYXZlZFN0YXRlLFxuICBTb3J0aW5nU3RyYXRlZ3ksXG4gIFRhYkdyb3VwLFxuICBUYWJNZXRhZGF0YVxufSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBmZXRjaExvY2FsU3RhdGUgfSBmcm9tIFwiLi9sb2NhbFN0YXRlLmpzXCI7XG5cbmV4cG9ydCBjb25zdCBzZW5kTWVzc2FnZSA9IGFzeW5jIDxURGF0YT4odHlwZTogUnVudGltZU1lc3NhZ2VbXCJ0eXBlXCJdLCBwYXlsb2FkPzogYW55KTogUHJvbWlzZTxSdW50aW1lUmVzcG9uc2U8VERhdGE+PiA9PiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZSwgcGF5bG9hZCB9LCAocmVzcG9uc2UpID0+IHtcbiAgICAgIGlmIChjaHJvbWUucnVudGltZS5sYXN0RXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIlJ1bnRpbWUgZXJyb3I6XCIsIGNocm9tZS5ydW50aW1lLmxhc3RFcnJvcik7XG4gICAgICAgIHJlc29sdmUoeyBvazogZmFsc2UsIGVycm9yOiBjaHJvbWUucnVudGltZS5sYXN0RXJyb3IubWVzc2FnZSB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc29sdmUocmVzcG9uc2UgfHwgeyBvazogZmFsc2UsIGVycm9yOiBcIk5vIHJlc3BvbnNlIGZyb20gYmFja2dyb3VuZFwiIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICB9KTtcbn07XG5cbmV4cG9ydCB0eXBlIFRhYldpdGhHcm91cCA9IFRhYk1ldGFkYXRhICYge1xuICBncm91cExhYmVsPzogc3RyaW5nO1xuICBncm91cENvbG9yPzogc3RyaW5nO1xuICByZWFzb24/OiBzdHJpbmc7XG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFdpbmRvd1ZpZXcge1xuICBpZDogbnVtYmVyO1xuICB0aXRsZTogc3RyaW5nO1xuICB0YWJzOiBUYWJXaXRoR3JvdXBbXTtcbiAgdGFiQ291bnQ6IG51bWJlcjtcbiAgZ3JvdXBDb3VudDogbnVtYmVyO1xuICBwaW5uZWRDb3VudDogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgSUNPTlMgPSB7XG4gIGFjdGl2ZTogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwb2x5Z29uIHBvaW50cz1cIjMgMTEgMjIgMiAxMyAyMSAxMSAxMyAzIDExXCI+PC9wb2x5Z29uPjwvc3ZnPmAsXG4gIGhpZGU6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cGF0aCBkPVwiTTE3Ljk0IDE3Ljk0QTEwLjA3IDEwLjA3IDAgMCAxIDEyIDIwYy03IDAtMTEtOC0xMS04YTE4LjQ1IDE4LjQ1IDAgMCAxIDUuMDYtNS45NE05LjkgNC4yNEE5LjEyIDkuMTIgMCAwIDEgMTIgNGM3IDAgMTEgOCAxMSA4YTE4LjUgMTguNSAwIDAgMS0yLjE2IDMuMTltLTYuNzItMS4wN2EzIDMgMCAxIDEtNC4yNC00LjI0XCI+PC9wYXRoPjxsaW5lIHgxPVwiMVwiIHkxPVwiMVwiIHgyPVwiMjNcIiB5Mj1cIjIzXCI+PC9saW5lPjwvc3ZnPmAsXG4gIHNob3c6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cGF0aCBkPVwiTTEgMTJzNC04IDExLTggMTEgOCAxMSA4LTQgOC0xMSA4LTExLTgtMTEtOC0xMS04elwiPjwvcGF0aD48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjNcIj48L2NpcmNsZT48L3N2Zz5gLFxuICBmb2N1czogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxjaXJjbGUgY3g9XCIxMlwiIGN5PVwiMTJcIiByPVwiMTBcIj48L2NpcmNsZT48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjZcIj48L2NpcmNsZT48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjJcIj48L2NpcmNsZT48L3N2Zz5gLFxuICBjbG9zZTogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxsaW5lIHgxPVwiMThcIiB5MT1cIjZcIiB4Mj1cIjZcIiB5Mj1cIjE4XCI+PC9saW5lPjxsaW5lIHgxPVwiNlwiIHkxPVwiNlwiIHgyPVwiMThcIiB5Mj1cIjE4XCI+PC9saW5lPjwvc3ZnPmAsXG4gIHVuZ3JvdXA6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjEwXCI+PC9jaXJjbGU+PGxpbmUgeDE9XCI4XCIgeTE9XCIxMlwiIHgyPVwiMTZcIiB5Mj1cIjEyXCI+PC9saW5lPjwvc3ZnPmAsXG4gIGRlZmF1bHRGaWxlOiBgPHN2ZyB3aWR0aD1cIjI0XCIgaGVpZ2h0PVwiMjRcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBhdGggZD1cIk0xNCAySDZhMiAyIDAgMCAwLTIgMnYxNmEyIDIgMCAwIDAgMiAyaDEyYTIgMiAwIDAgMCAyLTJWOHpcIj48L3BhdGg+PHBvbHlsaW5lIHBvaW50cz1cIjE0IDIgMTQgOCAyMCA4XCI+PC9wb2x5bGluZT48bGluZSB4MT1cIjE2XCIgeTE9XCIxM1wiIHgyPVwiOFwiIHkyPVwiMTNcIj48L2xpbmU+PGxpbmUgeDE9XCIxNlwiIHkxPVwiMTdcIiB4Mj1cIjhcIiB5Mj1cIjE3XCI+PC9saW5lPjxwb2x5bGluZSBwb2ludHM9XCIxMCA5IDkgOSA4IDlcIj48L3BvbHlsaW5lPjwvc3ZnPmAsXG4gIGF1dG9SdW46IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cG9seWdvbiBwb2ludHM9XCIxMyAyIDMgMTQgMTIgMTQgMTEgMjIgMjEgMTAgMTIgMTAgMTMgMlwiPjwvcG9seWdvbj48L3N2Zz5gXG59O1xuXG5leHBvcnQgY29uc3QgR1JPVVBfQ09MT1JTOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICBncmV5OiBcIiM2NDc0OGJcIixcbiAgYmx1ZTogXCIjM2I4MmY2XCIsXG4gIHJlZDogXCIjZWY0NDQ0XCIsXG4gIHllbGxvdzogXCIjZWFiMzA4XCIsXG4gIGdyZWVuOiBcIiMyMmM1NWVcIixcbiAgcGluazogXCIjZWM0ODk5XCIsXG4gIHB1cnBsZTogXCIjYTg1NWY3XCIsXG4gIGN5YW46IFwiIzA2YjZkNFwiLFxuICBvcmFuZ2U6IFwiI2Y5NzMxNlwiXG59O1xuXG5leHBvcnQgY29uc3QgZ2V0R3JvdXBDb2xvciA9IChuYW1lOiBzdHJpbmcpID0+IEdST1VQX0NPTE9SU1tuYW1lXSB8fCBcIiNjYmQ1ZTFcIjtcblxuZXhwb3J0IGNvbnN0IGZldGNoU3RhdGUgPSBhc3luYyAoKSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBzZW5kTWVzc2FnZTx7IGdyb3VwczogVGFiR3JvdXBbXTsgcHJlZmVyZW5jZXM6IFByZWZlcmVuY2VzIH0+KFwiZ2V0U3RhdGVcIik7XG4gICAgaWYgKHJlc3BvbnNlLm9rICYmIHJlc3BvbnNlLmRhdGEpIHtcbiAgICAgIHJldHVybiByZXNwb25zZTtcbiAgICB9XG4gICAgY29uc29sZS53YXJuKFwiZmV0Y2hTdGF0ZSBmYWlsZWQsIHVzaW5nIGZhbGxiYWNrOlwiLCByZXNwb25zZS5lcnJvcik7XG4gICAgcmV0dXJuIGF3YWl0IGZldGNoTG9jYWxTdGF0ZSgpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgY29uc29sZS53YXJuKFwiZmV0Y2hTdGF0ZSB0aHJldyBleGNlcHRpb24sIHVzaW5nIGZhbGxiYWNrOlwiLCBlKTtcbiAgICByZXR1cm4gYXdhaXQgZmV0Y2hMb2NhbFN0YXRlKCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBhcHBseUdyb3VwaW5nID0gYXN5bmMgKHBheWxvYWQ6IEFwcGx5R3JvdXBpbmdQYXlsb2FkKSA9PiB7XG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImFwcGx5R3JvdXBpbmdcIiwgcGF5bG9hZCB9KTtcbiAgcmV0dXJuIHJlc3BvbnNlIGFzIFJ1bnRpbWVSZXNwb25zZTx1bmtub3duPjtcbn07XG5cbmV4cG9ydCBjb25zdCBhcHBseVNvcnRpbmcgPSBhc3luYyAocGF5bG9hZDogQXBwbHlHcm91cGluZ1BheWxvYWQpID0+IHtcbiAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6IFwiYXBwbHlTb3J0aW5nXCIsIHBheWxvYWQgfSk7XG4gIHJldHVybiByZXNwb25zZSBhcyBSdW50aW1lUmVzcG9uc2U8dW5rbm93bj47XG59O1xuXG5leHBvcnQgY29uc3QgbWFwV2luZG93cyA9IChncm91cHM6IFRhYkdyb3VwW10sIHdpbmRvd1RpdGxlczogTWFwPG51bWJlciwgc3RyaW5nPik6IFdpbmRvd1ZpZXdbXSA9PiB7XG4gIGNvbnN0IHdpbmRvd3MgPSBuZXcgTWFwPG51bWJlciwgVGFiV2l0aEdyb3VwW10+KCk7XG5cbiAgZ3JvdXBzLmZvckVhY2goKGdyb3VwKSA9PiB7XG4gICAgY29uc3QgaXNVbmdyb3VwZWQgPSBncm91cC5yZWFzb24gPT09IFwiVW5ncm91cGVkXCI7XG4gICAgZ3JvdXAudGFicy5mb3JFYWNoKCh0YWIpID0+IHtcbiAgICAgIGNvbnN0IGRlY29yYXRlZDogVGFiV2l0aEdyb3VwID0ge1xuICAgICAgICAuLi50YWIsXG4gICAgICAgIGdyb3VwTGFiZWw6IGlzVW5ncm91cGVkID8gdW5kZWZpbmVkIDogZ3JvdXAubGFiZWwsXG4gICAgICAgIGdyb3VwQ29sb3I6IGlzVW5ncm91cGVkID8gdW5kZWZpbmVkIDogZ3JvdXAuY29sb3IsXG4gICAgICAgIHJlYXNvbjogZ3JvdXAucmVhc29uXG4gICAgICB9O1xuICAgICAgY29uc3QgZXhpc3RpbmcgPSB3aW5kb3dzLmdldCh0YWIud2luZG93SWQpID8/IFtdO1xuICAgICAgZXhpc3RpbmcucHVzaChkZWNvcmF0ZWQpO1xuICAgICAgd2luZG93cy5zZXQodGFiLndpbmRvd0lkLCBleGlzdGluZyk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIHJldHVybiBBcnJheS5mcm9tKHdpbmRvd3MuZW50cmllcygpKVxuICAgIC5tYXA8V2luZG93Vmlldz4oKFtpZCwgdGFic10pID0+IHtcbiAgICAgIGNvbnN0IGdyb3VwQ291bnQgPSBuZXcgU2V0KHRhYnMubWFwKCh0YWIpID0+IHRhYi5ncm91cExhYmVsKS5maWx0ZXIoKGwpOiBsIGlzIHN0cmluZyA9PiAhIWwpKS5zaXplO1xuICAgICAgY29uc3QgcGlubmVkQ291bnQgPSB0YWJzLmZpbHRlcigodGFiKSA9PiB0YWIucGlubmVkKS5sZW5ndGg7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBpZCxcbiAgICAgICAgdGl0bGU6IHdpbmRvd1RpdGxlcy5nZXQoaWQpID8/IGBXaW5kb3cgJHtpZH1gLFxuICAgICAgICB0YWJzLFxuICAgICAgICB0YWJDb3VudDogdGFicy5sZW5ndGgsXG4gICAgICAgIGdyb3VwQ291bnQsXG4gICAgICAgIHBpbm5lZENvdW50XG4gICAgICB9O1xuICAgIH0pXG4gICAgLnNvcnQoKGEsIGIpID0+IGEuaWQgLSBiLmlkKTtcbn07XG5cbmV4cG9ydCBjb25zdCBmb3JtYXREb21haW4gPSAodXJsOiBzdHJpbmcpID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBwYXJzZWQgPSBuZXcgVVJMKHVybCk7XG4gICAgcmV0dXJuIHBhcnNlZC5ob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgXCJcIik7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgcmV0dXJuIHVybDtcbiAgfVxufTtcbiIsICJpbXBvcnQge1xuICBHcm91cGluZ1NlbGVjdGlvbixcbiAgUHJlZmVyZW5jZXMsXG4gIFNhdmVkU3RhdGUsXG4gIFNvcnRpbmdTdHJhdGVneSxcbiAgTG9nTGV2ZWwsXG4gIFRhYkdyb3VwXG59IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7XG4gIGFwcGx5R3JvdXBpbmcsXG4gIGFwcGx5U29ydGluZyxcbiAgZmV0Y2hTdGF0ZSxcbiAgSUNPTlMsXG4gIG1hcFdpbmRvd3MsXG4gIHNlbmRNZXNzYWdlLFxuICBUYWJXaXRoR3JvdXAsXG4gIFdpbmRvd1ZpZXcsXG4gIEdST1VQX0NPTE9SU1xufSBmcm9tIFwiLi9jb21tb24uanNcIjtcbmltcG9ydCB7IGdldFN0cmF0ZWdpZXMsIFNUUkFURUdJRVMsIFN0cmF0ZWd5RGVmaW5pdGlvbiB9IGZyb20gXCIuLi9zaGFyZWQvc3RyYXRlZ3lSZWdpc3RyeS5qc1wiO1xuaW1wb3J0IHsgc2V0TG9nZ2VyUHJlZmVyZW5jZXMsIGxvZ0RlYnVnLCBsb2dJbmZvIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGZldGNoTG9jYWxTdGF0ZSB9IGZyb20gXCIuL2xvY2FsU3RhdGUuanNcIjtcblxuLy8gRWxlbWVudHNcbmNvbnN0IHNlYXJjaElucHV0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ0YWJTZWFyY2hcIikgYXMgSFRNTElucHV0RWxlbWVudDtcbmNvbnN0IHdpbmRvd3NDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIndpbmRvd3NcIikgYXMgSFRNTERpdkVsZW1lbnQ7XG5cbmNvbnN0IHNlbGVjdEFsbENoZWNrYm94ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzZWxlY3RBbGxcIikgYXMgSFRNTElucHV0RWxlbWVudDtcbmNvbnN0IGJ0bkFwcGx5ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5BcHBseVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcbmNvbnN0IGJ0blVuZ3JvdXAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0blVuZ3JvdXBcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5jb25zdCBidG5NZXJnZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuTWVyZ2VcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5jb25zdCBidG5TcGxpdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuU3BsaXRcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5jb25zdCBidG5FeHBhbmRBbGwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0bkV4cGFuZEFsbFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcbmNvbnN0IGJ0bkNvbGxhcHNlQWxsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5Db2xsYXBzZUFsbFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcblxuY29uc3QgYWN0aXZlU3RyYXRlZ2llc0xpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImFjdGl2ZVN0cmF0ZWdpZXNMaXN0XCIpIGFzIEhUTUxEaXZFbGVtZW50O1xuY29uc3QgYWRkU3RyYXRlZ3lTZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImFkZFN0cmF0ZWd5U2VsZWN0XCIpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuXG4vLyBTdGF0c1xuY29uc3Qgc3RhdFRhYnMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInN0YXRUYWJzXCIpIGFzIEhUTUxFbGVtZW50O1xuY29uc3Qgc3RhdEdyb3VwcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3RhdEdyb3Vwc1wiKSBhcyBIVE1MRWxlbWVudDtcbmNvbnN0IHN0YXRXaW5kb3dzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzdGF0V2luZG93c1wiKSBhcyBIVE1MRWxlbWVudDtcblxuY29uc3QgcHJvZ3Jlc3NPdmVybGF5ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJwcm9ncmVzc092ZXJsYXlcIikgYXMgSFRNTERpdkVsZW1lbnQ7XG5jb25zdCBwcm9ncmVzc1RleHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInByb2dyZXNzVGV4dFwiKSBhcyBIVE1MRGl2RWxlbWVudDtcbmNvbnN0IHByb2dyZXNzQ291bnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInByb2dyZXNzQ291bnRcIikgYXMgSFRNTERpdkVsZW1lbnQ7XG5cbi8vIEFJIFNldHRpbmdzIEVsZW1lbnRzXG5jb25zdCBhaUVuYWJsZWRDaGVja2JveCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYWlFbmFibGVkQ2hlY2tib3hcIikgYXMgSFRNTElucHV0RWxlbWVudDtcbmNvbnN0IGFpUHJvdmlkZXJTZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImFpUHJvdmlkZXJTZWxlY3RcIikgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG5jb25zdCBhaUFwaUtleUlucHV0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJhaUFwaUtleUlucHV0XCIpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG5jb25zdCBhaU1vZGVsSW5wdXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImFpTW9kZWxJbnB1dFwiKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuY29uc3QgYWlFbmRwb2ludElucHV0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJhaUVuZHBvaW50SW5wdXRcIikgYXMgSFRNTElucHV0RWxlbWVudDtcbmNvbnN0IGFpRW5kcG9pbnRDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImFpRW5kcG9pbnRDb250YWluZXJcIikgYXMgSFRNTERpdkVsZW1lbnQ7XG5cbmNvbnN0IHNob3dMb2FkaW5nID0gKHRleHQ6IHN0cmluZykgPT4ge1xuICAgIGlmIChwcm9ncmVzc092ZXJsYXkpIHtcbiAgICAgICAgcHJvZ3Jlc3NUZXh0LnRleHRDb250ZW50ID0gdGV4dDtcbiAgICAgICAgcHJvZ3Jlc3NDb3VudC50ZXh0Q29udGVudCA9IFwiXCI7XG4gICAgICAgIHByb2dyZXNzT3ZlcmxheS5jbGFzc0xpc3QucmVtb3ZlKFwiaGlkZGVuXCIpO1xuICAgIH1cbn07XG5cbmNvbnN0IGhpZGVMb2FkaW5nID0gKCkgPT4ge1xuICAgIGlmIChwcm9ncmVzc092ZXJsYXkpIHtcbiAgICAgICAgcHJvZ3Jlc3NPdmVybGF5LmNsYXNzTGlzdC5hZGQoXCJoaWRkZW5cIik7XG4gICAgfVxufTtcblxuY29uc3QgdXBkYXRlUHJvZ3Jlc3MgPSAoY29tcGxldGVkOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+IHtcbiAgICBpZiAocHJvZ3Jlc3NPdmVybGF5ICYmICFwcm9ncmVzc092ZXJsYXkuY2xhc3NMaXN0LmNvbnRhaW5zKFwiaGlkZGVuXCIpKSB7XG4gICAgICAgIHByb2dyZXNzQ291bnQudGV4dENvbnRlbnQgPSBgJHtjb21wbGV0ZWR9IC8gJHt0b3RhbH1gO1xuICAgIH1cbn07XG5cbmxldCB3aW5kb3dTdGF0ZTogV2luZG93Vmlld1tdID0gW107XG5sZXQgZm9jdXNlZFdpbmRvd0lkOiBudW1iZXIgfCBudWxsID0gbnVsbDtcbmNvbnN0IHNlbGVjdGVkVGFicyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xubGV0IGluaXRpYWxTZWxlY3Rpb25Eb25lID0gZmFsc2U7XG5sZXQgcHJlZmVyZW5jZXM6IFByZWZlcmVuY2VzIHwgbnVsbCA9IG51bGw7XG5cbi8vIFRyZWUgU3RhdGVcbmNvbnN0IGV4cGFuZGVkTm9kZXMgPSBuZXcgU2V0PHN0cmluZz4oKTsgLy8gRGVmYXVsdCBlbXB0eSA9IGFsbCBjb2xsYXBzZWRcbmNvbnN0IFRSRUVfSUNPTlMgPSB7XG4gIGNoZXZyb25SaWdodDogYDxzdmcgd2lkdGg9XCIxMDAlXCIgaGVpZ2h0PVwiMTAwJVwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cG9seWxpbmUgcG9pbnRzPVwiOSAxOCAxNSAxMiA5IDZcIj48L3BvbHlsaW5lPjwvc3ZnPmAsXG4gIGZvbGRlcjogYDxzdmcgd2lkdGg9XCIxMDAlXCIgaGVpZ2h0PVwiMTAwJVwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cGF0aCBkPVwiTTIyIDE5YTIgMiAwIDAgMS0yIDJINGEyIDIgMCAwIDEtMi0yVjVhMiAyIDAgMCAxIDItMmg1bDIgM2g5YTIgMiAwIDAgMSAyIDJ6XCI+PC9wYXRoPjwvc3ZnPmBcbn07XG5cbmNvbnN0IGhleFRvUmdiYSA9IChoZXg6IHN0cmluZywgYWxwaGE6IG51bWJlcikgPT4ge1xuICAgIC8vIEVuc3VyZSBoZXggZm9ybWF0XG4gICAgaWYgKCFoZXguc3RhcnRzV2l0aCgnIycpKSByZXR1cm4gaGV4O1xuICAgIGNvbnN0IHIgPSBwYXJzZUludChoZXguc2xpY2UoMSwgMyksIDE2KTtcbiAgICBjb25zdCBnID0gcGFyc2VJbnQoaGV4LnNsaWNlKDMsIDUpLCAxNik7XG4gICAgY29uc3QgYiA9IHBhcnNlSW50KGhleC5zbGljZSg1LCA3KSwgMTYpO1xuICAgIHJldHVybiBgcmdiYSgke3J9LCAke2d9LCAke2J9LCAke2FscGhhfSlgO1xufTtcblxuY29uc3QgdXBkYXRlU3RhdHMgPSAoKSA9PiB7XG4gIGNvbnN0IHRvdGFsVGFicyA9IHdpbmRvd1N0YXRlLnJlZHVjZSgoYWNjLCB3aW4pID0+IGFjYyArIHdpbi50YWJDb3VudCwgMCk7XG4gIGNvbnN0IHRvdGFsR3JvdXBzID0gbmV3IFNldCh3aW5kb3dTdGF0ZS5mbGF0TWFwKHcgPT4gdy50YWJzLmZpbHRlcih0ID0+IHQuZ3JvdXBMYWJlbCkubWFwKHQgPT4gYCR7dy5pZH0tJHt0Lmdyb3VwTGFiZWx9YCkpKS5zaXplO1xuXG4gIHN0YXRUYWJzLnRleHRDb250ZW50ID0gYCR7dG90YWxUYWJzfSBUYWJzYDtcbiAgc3RhdEdyb3Vwcy50ZXh0Q29udGVudCA9IGAke3RvdGFsR3JvdXBzfSBHcm91cHNgO1xuICBzdGF0V2luZG93cy50ZXh0Q29udGVudCA9IGAke3dpbmRvd1N0YXRlLmxlbmd0aH0gV2luZG93c2A7XG5cbiAgLy8gVXBkYXRlIHNlbGVjdGlvbiBidXR0b25zXG4gIGNvbnN0IGhhc1NlbGVjdGlvbiA9IHNlbGVjdGVkVGFicy5zaXplID4gMDtcbiAgYnRuVW5ncm91cC5kaXNhYmxlZCA9ICFoYXNTZWxlY3Rpb247XG4gIGJ0bk1lcmdlLmRpc2FibGVkID0gIWhhc1NlbGVjdGlvbjtcbiAgYnRuU3BsaXQuZGlzYWJsZWQgPSAhaGFzU2VsZWN0aW9uO1xuXG4gIGJ0blVuZ3JvdXAuc3R5bGUub3BhY2l0eSA9IGhhc1NlbGVjdGlvbiA/IFwiMVwiIDogXCIwLjVcIjtcbiAgYnRuTWVyZ2Uuc3R5bGUub3BhY2l0eSA9IGhhc1NlbGVjdGlvbiA/IFwiMVwiIDogXCIwLjVcIjtcbiAgYnRuU3BsaXQuc3R5bGUub3BhY2l0eSA9IGhhc1NlbGVjdGlvbiA/IFwiMVwiIDogXCIwLjVcIjtcblxuICAvLyBVcGRhdGUgU2VsZWN0IEFsbCBDaGVja2JveCBTdGF0ZVxuICBpZiAodG90YWxUYWJzID09PSAwKSB7XG4gICAgc2VsZWN0QWxsQ2hlY2tib3guY2hlY2tlZCA9IGZhbHNlO1xuICAgIHNlbGVjdEFsbENoZWNrYm94LmluZGV0ZXJtaW5hdGUgPSBmYWxzZTtcbiAgfSBlbHNlIGlmIChzZWxlY3RlZFRhYnMuc2l6ZSA9PT0gdG90YWxUYWJzKSB7XG4gICAgc2VsZWN0QWxsQ2hlY2tib3guY2hlY2tlZCA9IHRydWU7XG4gICAgc2VsZWN0QWxsQ2hlY2tib3guaW5kZXRlcm1pbmF0ZSA9IGZhbHNlO1xuICB9IGVsc2UgaWYgKHNlbGVjdGVkVGFicy5zaXplID4gMCkge1xuICAgIHNlbGVjdEFsbENoZWNrYm94LmNoZWNrZWQgPSBmYWxzZTtcbiAgICBzZWxlY3RBbGxDaGVja2JveC5pbmRldGVybWluYXRlID0gdHJ1ZTtcbiAgfSBlbHNlIHtcbiAgICBzZWxlY3RBbGxDaGVja2JveC5jaGVja2VkID0gZmFsc2U7XG4gICAgc2VsZWN0QWxsQ2hlY2tib3guaW5kZXRlcm1pbmF0ZSA9IGZhbHNlO1xuICB9XG59O1xuXG5jb25zdCBjcmVhdGVOb2RlID0gKFxuICAgIGNvbnRlbnQ6IEhUTUxFbGVtZW50LFxuICAgIGNoaWxkcmVuQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IG51bGwsXG4gICAgbGV2ZWw6ICd3aW5kb3cnIHwgJ2dyb3VwJyB8ICd0YWInLFxuICAgIGlzRXhwYW5kZWQ6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICBvblRvZ2dsZT86ICgpID0+IHZvaWRcbikgPT4ge1xuICAgIGNvbnN0IG5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIG5vZGUuY2xhc3NOYW1lID0gYHRyZWUtbm9kZSBub2RlLSR7bGV2ZWx9YDtcblxuICAgIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgcm93LmNsYXNzTmFtZSA9IGB0cmVlLXJvdyAke2xldmVsfS1yb3dgO1xuXG4gICAgLy8gVG9nZ2xlXG4gICAgY29uc3QgdG9nZ2xlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICB0b2dnbGUuY2xhc3NOYW1lID0gYHRyZWUtdG9nZ2xlICR7aXNFeHBhbmRlZCA/ICdyb3RhdGVkJyA6ICcnfWA7XG4gICAgaWYgKGNoaWxkcmVuQ29udGFpbmVyKSB7XG4gICAgICAgIHRvZ2dsZS5pbm5lckhUTUwgPSBUUkVFX0lDT05TLmNoZXZyb25SaWdodDtcbiAgICAgICAgdG9nZ2xlLm9uY2xpY2sgPSAoZSkgPT4ge1xuICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgIGlmIChvblRvZ2dsZSkgb25Ub2dnbGUoKTtcbiAgICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB0b2dnbGUuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG4gICAgfVxuXG4gICAgcm93LmFwcGVuZENoaWxkKHRvZ2dsZSk7XG4gICAgcm93LmFwcGVuZENoaWxkKGNvbnRlbnQpOyAvLyBDb250ZW50IGhhbmRsZXMgY2hlY2tib3ggKyBpY29uICsgdGV4dCArIGFjdGlvbnNcblxuICAgIG5vZGUuYXBwZW5kQ2hpbGQocm93KTtcblxuICAgIGlmIChjaGlsZHJlbkNvbnRhaW5lcikge1xuICAgICAgICBjaGlsZHJlbkNvbnRhaW5lci5jbGFzc05hbWUgPSBgdHJlZS1jaGlsZHJlbiAke2lzRXhwYW5kZWQgPyAnZXhwYW5kZWQnIDogJyd9YDtcbiAgICAgICAgbm9kZS5hcHBlbmRDaGlsZChjaGlsZHJlbkNvbnRhaW5lcik7XG4gICAgfVxuXG4gICAgLy8gVG9nZ2xlIGludGVyYWN0aW9uIG9uIHJvdyBjbGljayBmb3IgV2luZG93cyBhbmQgR3JvdXBzXG4gICAgaWYgKGNoaWxkcmVuQ29udGFpbmVyICYmIGxldmVsICE9PSAndGFiJykge1xuICAgICAgICByb3cuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgICAgICAgICAgLy8gQXZvaWQgdG9nZ2xpbmcgaWYgY2xpY2tpbmcgYWN0aW9ucyBvciBjaGVja2JveFxuICAgICAgICAgICAgaWYgKChlLnRhcmdldCBhcyBIVE1MRWxlbWVudCkuY2xvc2VzdCgnLmFjdGlvbi1idG4nKSB8fCAoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpLmNsb3Nlc3QoJy50cmVlLWNoZWNrYm94JykpIHJldHVybjtcbiAgICAgICAgICAgIGlmIChvblRvZ2dsZSkgb25Ub2dnbGUoKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgbm9kZSwgdG9nZ2xlLCBjaGlsZHJlbkNvbnRhaW5lciB9O1xufTtcblxuY29uc3QgcmVuZGVyVHJlZSA9ICgpID0+IHtcbiAgY29uc3QgcXVlcnkgPSBzZWFyY2hJbnB1dC52YWx1ZS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgd2luZG93c0NvbnRhaW5lci5pbm5lckhUTUwgPSBcIlwiO1xuXG4gIC8vIEZpbHRlciBMb2dpY1xuICBjb25zdCBmaWx0ZXJlZCA9IHdpbmRvd1N0YXRlXG4gICAgLm1hcCgod2luZG93KSA9PiB7XG4gICAgICBpZiAoIXF1ZXJ5KSByZXR1cm4geyB3aW5kb3csIHZpc2libGVUYWJzOiB3aW5kb3cudGFicyB9O1xuICAgICAgY29uc3QgdmlzaWJsZVRhYnMgPSB3aW5kb3cudGFicy5maWx0ZXIoXG4gICAgICAgICh0YWIpID0+IHRhYi50aXRsZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHF1ZXJ5KSB8fCB0YWIudXJsLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMocXVlcnkpXG4gICAgICApO1xuICAgICAgcmV0dXJuIHsgd2luZG93LCB2aXNpYmxlVGFicyB9O1xuICAgIH0pXG4gICAgLmZpbHRlcigoeyB2aXNpYmxlVGFicyB9KSA9PiB2aXNpYmxlVGFicy5sZW5ndGggPiAwIHx8ICFxdWVyeSk7XG5cbiAgZmlsdGVyZWQuZm9yRWFjaCgoeyB3aW5kb3csIHZpc2libGVUYWJzIH0pID0+IHtcbiAgICBjb25zdCB3aW5kb3dLZXkgPSBgdy0ke3dpbmRvdy5pZH1gO1xuICAgIGNvbnN0IGlzRXhwYW5kZWQgPSAhIXF1ZXJ5IHx8IGV4cGFuZGVkTm9kZXMuaGFzKHdpbmRvd0tleSk7XG5cbiAgICAvLyBXaW5kb3cgQ2hlY2tib3ggTG9naWNcbiAgICBjb25zdCBhbGxUYWJJZHMgPSB2aXNpYmxlVGFicy5tYXAodCA9PiB0LmlkKTtcbiAgICBjb25zdCBzZWxlY3RlZENvdW50ID0gYWxsVGFiSWRzLmZpbHRlcihpZCA9PiBzZWxlY3RlZFRhYnMuaGFzKGlkKSkubGVuZ3RoO1xuICAgIGNvbnN0IGlzQWxsID0gc2VsZWN0ZWRDb3VudCA9PT0gYWxsVGFiSWRzLmxlbmd0aCAmJiBhbGxUYWJJZHMubGVuZ3RoID4gMDtcbiAgICBjb25zdCBpc1NvbWUgPSBzZWxlY3RlZENvdW50ID4gMCAmJiBzZWxlY3RlZENvdW50IDwgYWxsVGFiSWRzLmxlbmd0aDtcblxuICAgIGNvbnN0IHdpbkNoZWNrYm94ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImlucHV0XCIpO1xuICAgIHdpbkNoZWNrYm94LnR5cGUgPSBcImNoZWNrYm94XCI7XG4gICAgd2luQ2hlY2tib3guY2xhc3NOYW1lID0gXCJ0cmVlLWNoZWNrYm94XCI7XG4gICAgd2luQ2hlY2tib3guY2hlY2tlZCA9IGlzQWxsO1xuICAgIHdpbkNoZWNrYm94LmluZGV0ZXJtaW5hdGUgPSBpc1NvbWU7XG4gICAgd2luQ2hlY2tib3gub25jbGljayA9IChlKSA9PiB7XG4gICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgIGNvbnN0IHRhcmdldFN0YXRlID0gIWlzQWxsOyAvLyBJZiBhbGwgd2VyZSBzZWxlY3RlZCwgZGVzZWxlY3QuIE90aGVyd2lzZSBzZWxlY3QgYWxsLlxuICAgICAgICBhbGxUYWJJZHMuZm9yRWFjaChpZCA9PiB7XG4gICAgICAgICAgICBpZiAodGFyZ2V0U3RhdGUpIHNlbGVjdGVkVGFicy5hZGQoaWQpO1xuICAgICAgICAgICAgZWxzZSBzZWxlY3RlZFRhYnMuZGVsZXRlKGlkKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJlbmRlclRyZWUoKTtcbiAgICB9O1xuXG4gICAgLy8gV2luZG93IENvbnRlbnRcbiAgICBjb25zdCB3aW5Db250ZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICB3aW5Db250ZW50LnN0eWxlLmRpc3BsYXkgPSBcImZsZXhcIjtcbiAgICB3aW5Db250ZW50LnN0eWxlLmFsaWduSXRlbXMgPSBcImNlbnRlclwiO1xuICAgIHdpbkNvbnRlbnQuc3R5bGUuZmxleCA9IFwiMVwiO1xuICAgIHdpbkNvbnRlbnQuc3R5bGUub3ZlcmZsb3cgPSBcImhpZGRlblwiO1xuXG4gICAgY29uc3QgbGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGxhYmVsLmNsYXNzTmFtZSA9IFwidHJlZS1sYWJlbFwiO1xuICAgIGxhYmVsLnRleHRDb250ZW50ID0gd2luZG93LnRpdGxlO1xuXG4gICAgY29uc3QgY291bnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGNvdW50LmNsYXNzTmFtZSA9IFwidHJlZS1jb3VudFwiO1xuICAgIGNvdW50LnRleHRDb250ZW50ID0gYCgke3Zpc2libGVUYWJzLmxlbmd0aH0gVGFicylgO1xuXG4gICAgd2luQ29udGVudC5hcHBlbmQod2luQ2hlY2tib3gsIGxhYmVsLCBjb3VudCk7XG5cbiAgICAvLyBDaGlsZHJlbiAoR3JvdXBzKVxuICAgIGNvbnN0IGNoaWxkcmVuQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcblxuICAgIC8vIEdyb3VwIHRhYnNcbiAgICBjb25zdCBncm91cHMgPSBuZXcgTWFwPHN0cmluZywgeyBjb2xvcjogc3RyaW5nOyB0YWJzOiBUYWJXaXRoR3JvdXBbXSB9PigpO1xuICAgIGNvbnN0IHVuZ3JvdXBlZFRhYnM6IFRhYldpdGhHcm91cFtdID0gW107XG4gICAgdmlzaWJsZVRhYnMuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgICBpZiAodGFiLmdyb3VwTGFiZWwpIHtcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IHRhYi5ncm91cExhYmVsO1xuICAgICAgICAgICAgY29uc3QgZW50cnkgPSBncm91cHMuZ2V0KGtleSkgPz8geyBjb2xvcjogdGFiLmdyb3VwQ29sb3IhLCB0YWJzOiBbXSB9O1xuICAgICAgICAgICAgZW50cnkudGFicy5wdXNoKHRhYik7XG4gICAgICAgICAgICBncm91cHMuc2V0KGtleSwgZW50cnkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdW5ncm91cGVkVGFicy5wdXNoKHRhYik7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IGNyZWF0ZVRhYk5vZGUgPSAodGFiOiBUYWJXaXRoR3JvdXApID0+IHtcbiAgICAgICAgY29uc3QgdGFiQ29udGVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIHRhYkNvbnRlbnQuc3R5bGUuZGlzcGxheSA9IFwiZmxleFwiO1xuICAgICAgICB0YWJDb250ZW50LnN0eWxlLmFsaWduSXRlbXMgPSBcImNlbnRlclwiO1xuICAgICAgICB0YWJDb250ZW50LnN0eWxlLmZsZXggPSBcIjFcIjtcbiAgICAgICAgdGFiQ29udGVudC5zdHlsZS5vdmVyZmxvdyA9IFwiaGlkZGVuXCI7XG5cbiAgICAgICAgLy8gVGFiIENoZWNrYm94XG4gICAgICAgIGNvbnN0IHRhYkNoZWNrYm94ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImlucHV0XCIpO1xuICAgICAgICB0YWJDaGVja2JveC50eXBlID0gXCJjaGVja2JveFwiO1xuICAgICAgICB0YWJDaGVja2JveC5jbGFzc05hbWUgPSBcInRyZWUtY2hlY2tib3hcIjtcbiAgICAgICAgdGFiQ2hlY2tib3guY2hlY2tlZCA9IHNlbGVjdGVkVGFicy5oYXModGFiLmlkKTtcbiAgICAgICAgdGFiQ2hlY2tib3gub25jbGljayA9IChlKSA9PiB7XG4gICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgaWYgKHRhYkNoZWNrYm94LmNoZWNrZWQpIHNlbGVjdGVkVGFicy5hZGQodGFiLmlkKTtcbiAgICAgICAgICAgIGVsc2Ugc2VsZWN0ZWRUYWJzLmRlbGV0ZSh0YWIuaWQpO1xuICAgICAgICAgICAgcmVuZGVyVHJlZSgpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IHRhYkljb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICB0YWJJY29uLmNsYXNzTmFtZSA9IFwidHJlZS1pY29uXCI7XG4gICAgICAgIGlmICh0YWIuZmF2SWNvblVybCkge1xuICAgICAgICAgICAgY29uc3QgaW1nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImltZ1wiKTtcbiAgICAgICAgICAgIGltZy5zcmMgPSB0YWIuZmF2SWNvblVybDtcbiAgICAgICAgICAgIGltZy5vbmVycm9yID0gKCkgPT4geyB0YWJJY29uLmlubmVySFRNTCA9IElDT05TLmRlZmF1bHRGaWxlOyB9O1xuICAgICAgICAgICAgdGFiSWNvbi5hcHBlbmRDaGlsZChpbWcpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGFiSWNvbi5pbm5lckhUTUwgPSBJQ09OUy5kZWZhdWx0RmlsZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHRhYlRpdGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgdGFiVGl0bGUuY2xhc3NOYW1lID0gXCJ0cmVlLWxhYmVsXCI7XG4gICAgICAgIHRhYlRpdGxlLnRleHRDb250ZW50ID0gdGFiLnRpdGxlO1xuICAgICAgICB0YWJUaXRsZS50aXRsZSA9IHRhYi50aXRsZTtcblxuICAgICAgICBjb25zdCB0YWJBY3Rpb25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgdGFiQWN0aW9ucy5jbGFzc05hbWUgPSBcInJvdy1hY3Rpb25zXCI7XG4gICAgICAgIGNvbnN0IGNsb3NlQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgICAgICAgY2xvc2VCdG4uY2xhc3NOYW1lID0gXCJhY3Rpb24tYnRuIGRlbGV0ZVwiO1xuICAgICAgICBjbG9zZUJ0bi5pbm5lckhUTUwgPSBJQ09OUy5jbG9zZTtcbiAgICAgICAgY2xvc2VCdG4udGl0bGUgPSBcIkNsb3NlIFRhYlwiO1xuICAgICAgICBjbG9zZUJ0bi5vbmNsaWNrID0gYXN5bmMgKGUpID0+IHtcbiAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICBhd2FpdCBjaHJvbWUudGFicy5yZW1vdmUodGFiLmlkKTtcbiAgICAgICAgICAgIGF3YWl0IGxvYWRTdGF0ZSgpO1xuICAgICAgICB9O1xuICAgICAgICB0YWJBY3Rpb25zLmFwcGVuZENoaWxkKGNsb3NlQnRuKTtcblxuICAgICAgICB0YWJDb250ZW50LmFwcGVuZCh0YWJDaGVja2JveCwgdGFiSWNvbiwgdGFiVGl0bGUsIHRhYkFjdGlvbnMpO1xuXG4gICAgICAgIGNvbnN0IHsgbm9kZTogdGFiTm9kZSB9ID0gY3JlYXRlTm9kZSh0YWJDb250ZW50LCBudWxsLCAndGFiJyk7XG4gICAgICAgIHRhYk5vZGUub25jbGljayA9IGFzeW5jIChlKSA9PiB7XG4gICAgICAgICAgICAvLyBDbGlja2luZyB0YWIgcm93IGFjdGl2YXRlcyB0YWIgKHVubGVzcyBjbGlja2luZyBjaGVja2JveC9hY3Rpb24pXG4gICAgICAgICAgICBpZiAoKGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5jbG9zZXN0KCcudHJlZS1jaGVja2JveCcpKSByZXR1cm47XG4gICAgICAgICAgICBhd2FpdCBjaHJvbWUudGFicy51cGRhdGUodGFiLmlkLCB7IGFjdGl2ZTogdHJ1ZSB9KTtcbiAgICAgICAgICAgIGF3YWl0IGNocm9tZS53aW5kb3dzLnVwZGF0ZSh0YWIud2luZG93SWQsIHsgZm9jdXNlZDogdHJ1ZSB9KTtcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHRhYk5vZGU7XG4gICAgfTtcblxuICAgIEFycmF5LmZyb20oZ3JvdXBzLmVudHJpZXMoKSkuc29ydCgpLmZvckVhY2goKFtncm91cExhYmVsLCBncm91cERhdGFdKSA9PiB7XG4gICAgICAgIGNvbnN0IGdyb3VwS2V5ID0gYCR7d2luZG93S2V5fS1nLSR7Z3JvdXBMYWJlbH1gO1xuICAgICAgICBjb25zdCBpc0dyb3VwRXhwYW5kZWQgPSAhIXF1ZXJ5IHx8IGV4cGFuZGVkTm9kZXMuaGFzKGdyb3VwS2V5KTtcblxuICAgICAgICAvLyBHcm91cCBDaGVja2JveCBMb2dpY1xuICAgICAgICBjb25zdCBncm91cFRhYklkcyA9IGdyb3VwRGF0YS50YWJzLm1hcCh0ID0+IHQuaWQpO1xuICAgICAgICBjb25zdCBncnBTZWxlY3RlZENvdW50ID0gZ3JvdXBUYWJJZHMuZmlsdGVyKGlkID0+IHNlbGVjdGVkVGFicy5oYXMoaWQpKS5sZW5ndGg7XG4gICAgICAgIGNvbnN0IGdycElzQWxsID0gZ3JwU2VsZWN0ZWRDb3VudCA9PT0gZ3JvdXBUYWJJZHMubGVuZ3RoICYmIGdyb3VwVGFiSWRzLmxlbmd0aCA+IDA7XG4gICAgICAgIGNvbnN0IGdycElzU29tZSA9IGdycFNlbGVjdGVkQ291bnQgPiAwICYmIGdycFNlbGVjdGVkQ291bnQgPCBncm91cFRhYklkcy5sZW5ndGg7XG5cbiAgICAgICAgY29uc3QgZ3JwQ2hlY2tib3ggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW5wdXRcIik7XG4gICAgICAgIGdycENoZWNrYm94LnR5cGUgPSBcImNoZWNrYm94XCI7XG4gICAgICAgIGdycENoZWNrYm94LmNsYXNzTmFtZSA9IFwidHJlZS1jaGVja2JveFwiO1xuICAgICAgICBncnBDaGVja2JveC5jaGVja2VkID0gZ3JwSXNBbGw7XG4gICAgICAgIGdycENoZWNrYm94LmluZGV0ZXJtaW5hdGUgPSBncnBJc1NvbWU7XG4gICAgICAgIGdycENoZWNrYm94Lm9uY2xpY2sgPSAoZSkgPT4ge1xuICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldFN0YXRlID0gIWdycElzQWxsO1xuICAgICAgICAgICAgZ3JvdXBUYWJJZHMuZm9yRWFjaChpZCA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldFN0YXRlKSBzZWxlY3RlZFRhYnMuYWRkKGlkKTtcbiAgICAgICAgICAgICAgICBlbHNlIHNlbGVjdGVkVGFicy5kZWxldGUoaWQpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZW5kZXJUcmVlKCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgLy8gR3JvdXAgQ29udGVudFxuICAgICAgICBjb25zdCBncnBDb250ZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgZ3JwQ29udGVudC5zdHlsZS5kaXNwbGF5ID0gXCJmbGV4XCI7XG4gICAgICAgIGdycENvbnRlbnQuc3R5bGUuYWxpZ25JdGVtcyA9IFwiY2VudGVyXCI7XG4gICAgICAgIGdycENvbnRlbnQuc3R5bGUuZmxleCA9IFwiMVwiO1xuICAgICAgICBncnBDb250ZW50LnN0eWxlLm92ZXJmbG93ID0gXCJoaWRkZW5cIjtcblxuICAgICAgICBjb25zdCBpY29uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgaWNvbi5jbGFzc05hbWUgPSBcInRyZWUtaWNvblwiO1xuICAgICAgICBpY29uLmlubmVySFRNTCA9IFRSRUVfSUNPTlMuZm9sZGVyO1xuXG4gICAgICAgIGNvbnN0IGdycExhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgZ3JwTGFiZWwuY2xhc3NOYW1lID0gXCJ0cmVlLWxhYmVsXCI7XG4gICAgICAgIGdycExhYmVsLnRleHRDb250ZW50ID0gZ3JvdXBMYWJlbDtcblxuICAgICAgICBjb25zdCBncnBDb3VudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIGdycENvdW50LmNsYXNzTmFtZSA9IFwidHJlZS1jb3VudFwiO1xuICAgICAgICBncnBDb3VudC50ZXh0Q29udGVudCA9IGAoJHtncm91cERhdGEudGFicy5sZW5ndGh9KWA7XG5cbiAgICAgICAgLy8gR3JvdXAgQWN0aW9uc1xuICAgICAgICBjb25zdCBhY3Rpb25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgYWN0aW9ucy5jbGFzc05hbWUgPSBcInJvdy1hY3Rpb25zXCI7XG4gICAgICAgIGNvbnN0IHVuZ3JvdXBCdG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICAgICAgICB1bmdyb3VwQnRuLmNsYXNzTmFtZSA9IFwiYWN0aW9uLWJ0blwiO1xuICAgICAgICB1bmdyb3VwQnRuLmlubmVySFRNTCA9IElDT05TLnVuZ3JvdXA7XG4gICAgICAgIHVuZ3JvdXBCdG4udGl0bGUgPSBcIlVuZ3JvdXBcIjtcbiAgICAgICAgdW5ncm91cEJ0bi5vbmNsaWNrID0gYXN5bmMgKGUpID0+IHtcbiAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICBpZiAoY29uZmlybShgVW5ncm91cCAke2dyb3VwRGF0YS50YWJzLmxlbmd0aH0gdGFicz9gKSkge1xuICAgICAgICAgICAgICAgIGF3YWl0IGNocm9tZS50YWJzLnVuZ3JvdXAoZ3JvdXBEYXRhLnRhYnMubWFwKHQgPT4gdC5pZCkpO1xuICAgICAgICAgICAgICAgIGF3YWl0IGxvYWRTdGF0ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICBhY3Rpb25zLmFwcGVuZENoaWxkKHVuZ3JvdXBCdG4pO1xuXG4gICAgICAgIGdycENvbnRlbnQuYXBwZW5kKGdycENoZWNrYm94LCBpY29uLCBncnBMYWJlbCwgZ3JwQ291bnQsIGFjdGlvbnMpO1xuXG4gICAgICAgIC8vIFRhYnNcbiAgICAgICAgY29uc3QgdGFic0NvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIGdyb3VwRGF0YS50YWJzLmZvckVhY2godGFiID0+IHtcbiAgICAgICAgICAgIHRhYnNDb250YWluZXIuYXBwZW5kQ2hpbGQoY3JlYXRlVGFiTm9kZSh0YWIpKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgeyBub2RlOiBncm91cE5vZGUsIHRvZ2dsZTogZ3JwVG9nZ2xlLCBjaGlsZHJlbkNvbnRhaW5lcjogZ3JwQ2hpbGRyZW4gfSA9IGNyZWF0ZU5vZGUoXG4gICAgICAgICAgICBncnBDb250ZW50LFxuICAgICAgICAgICAgdGFic0NvbnRhaW5lcixcbiAgICAgICAgICAgICdncm91cCcsXG4gICAgICAgICAgICBpc0dyb3VwRXhwYW5kZWQsXG4gICAgICAgICAgICAoKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGV4cGFuZGVkTm9kZXMuaGFzKGdyb3VwS2V5KSkgZXhwYW5kZWROb2Rlcy5kZWxldGUoZ3JvdXBLZXkpO1xuICAgICAgICAgICAgICAgIGVsc2UgZXhwYW5kZWROb2Rlcy5hZGQoZ3JvdXBLZXkpO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgZXhwYW5kZWQgPSBleHBhbmRlZE5vZGVzLmhhcyhncm91cEtleSk7XG4gICAgICAgICAgICAgICAgZ3JwVG9nZ2xlLmNsYXNzTGlzdC50b2dnbGUoJ3JvdGF0ZWQnLCBleHBhbmRlZCk7XG4gICAgICAgICAgICAgICAgZ3JwQ2hpbGRyZW4hLmNsYXNzTGlzdC50b2dnbGUoJ2V4cGFuZGVkJywgZXhwYW5kZWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICApO1xuXG4gICAgICAgIC8vIEFwcGx5IGJhY2tncm91bmQgY29sb3IgdG8gZ3JvdXAgbm9kZVxuICAgICAgICBpZiAoZ3JvdXBEYXRhLmNvbG9yKSB7XG4gICAgICAgICAgICBjb25zdCBjb2xvck5hbWUgPSBncm91cERhdGEuY29sb3I7XG4gICAgICAgICAgICBjb25zdCBoZXggPSBHUk9VUF9DT0xPUlNbY29sb3JOYW1lXSB8fCBjb2xvck5hbWU7IC8vIEZhbGxiYWNrIGlmIGl0J3MgYWxyZWFkeSBoZXhcbiAgICAgICAgICAgIGlmIChoZXguc3RhcnRzV2l0aCgnIycpKSB7XG4gICAgICAgICAgICAgICAgZ3JvdXBOb2RlLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IGhleFRvUmdiYShoZXgsIDAuMSk7XG4gICAgICAgICAgICAgICAgZ3JvdXBOb2RlLnN0eWxlLmJvcmRlciA9IGAxcHggc29saWQgJHtoZXhUb1JnYmEoaGV4LCAwLjIpfWA7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBjaGlsZHJlbkNvbnRhaW5lci5hcHBlbmRDaGlsZChncm91cE5vZGUpO1xuICAgIH0pO1xuXG4gICAgdW5ncm91cGVkVGFicy5mb3JFYWNoKHRhYiA9PiB7XG4gICAgICAgIGNoaWxkcmVuQ29udGFpbmVyLmFwcGVuZENoaWxkKGNyZWF0ZVRhYk5vZGUodGFiKSk7XG4gICAgfSk7XG5cbiAgICBjb25zdCB7IG5vZGU6IHdpbk5vZGUsIHRvZ2dsZTogd2luVG9nZ2xlLCBjaGlsZHJlbkNvbnRhaW5lcjogd2luQ2hpbGRyZW4gfSA9IGNyZWF0ZU5vZGUoXG4gICAgICAgIHdpbkNvbnRlbnQsXG4gICAgICAgIGNoaWxkcmVuQ29udGFpbmVyLFxuICAgICAgICAnd2luZG93JyxcbiAgICAgICAgaXNFeHBhbmRlZCxcbiAgICAgICAgKCkgPT4ge1xuICAgICAgICAgICAgIGlmIChleHBhbmRlZE5vZGVzLmhhcyh3aW5kb3dLZXkpKSBleHBhbmRlZE5vZGVzLmRlbGV0ZSh3aW5kb3dLZXkpO1xuICAgICAgICAgICAgIGVsc2UgZXhwYW5kZWROb2Rlcy5hZGQod2luZG93S2V5KTtcblxuICAgICAgICAgICAgIGNvbnN0IGV4cGFuZGVkID0gZXhwYW5kZWROb2Rlcy5oYXMod2luZG93S2V5KTtcbiAgICAgICAgICAgICB3aW5Ub2dnbGUuY2xhc3NMaXN0LnRvZ2dsZSgncm90YXRlZCcsIGV4cGFuZGVkKTtcbiAgICAgICAgICAgICB3aW5DaGlsZHJlbiEuY2xhc3NMaXN0LnRvZ2dsZSgnZXhwYW5kZWQnLCBleHBhbmRlZCk7XG4gICAgICAgIH1cbiAgICApO1xuXG4gICAgd2luZG93c0NvbnRhaW5lci5hcHBlbmRDaGlsZCh3aW5Ob2RlKTtcbiAgfSk7XG5cbiAgdXBkYXRlU3RhdHMoKTtcbn07XG5cbi8vIFN0cmF0ZWd5IFJlbmRlcmluZ1xuZnVuY3Rpb24gdXBkYXRlU3RyYXRlZ3lWaWV3cyhzdHJhdGVnaWVzOiBTdHJhdGVneURlZmluaXRpb25bXSwgZW5hYmxlZElkczogc3RyaW5nW10pIHtcbiAgICAvLyAxLiBSZW5kZXIgQWN0aXZlIFN0cmF0ZWdpZXNcbiAgICBhY3RpdmVTdHJhdGVnaWVzTGlzdC5pbm5lckhUTUwgPSAnJztcblxuICAgIC8vIE1haW50YWluIG9yZGVyIGZyb20gZW5hYmxlZElkc1xuICAgIGNvbnN0IGVuYWJsZWRTdHJhdGVnaWVzID0gZW5hYmxlZElkc1xuICAgICAgICAubWFwKGlkID0+IHN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IGlkKSlcbiAgICAgICAgLmZpbHRlcigocyk6IHMgaXMgU3RyYXRlZ3lEZWZpbml0aW9uID0+ICEhcyk7XG5cbiAgICBlbmFibGVkU3RyYXRlZ2llcy5mb3JFYWNoKHN0cmF0ZWd5ID0+IHtcbiAgICAgICAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIHJvdy5jbGFzc05hbWUgPSAnc3RyYXRlZ3ktcm93JztcbiAgICAgICAgcm93LmRhdGFzZXQuaWQgPSBzdHJhdGVneS5pZDtcbiAgICAgICAgcm93LmRyYWdnYWJsZSA9IHRydWU7XG5cbiAgICAgICAgLy8gRHJhZyBIYW5kbGVcbiAgICAgICAgY29uc3QgaGFuZGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIGhhbmRsZS5jbGFzc05hbWUgPSAnc3RyYXRlZ3ktZHJhZy1oYW5kbGUnO1xuICAgICAgICBoYW5kbGUuaW5uZXJIVE1MID0gJ1x1MjJFRVx1MjJFRSc7XG5cbiAgICAgICAgLy8gTGFiZWxcbiAgICAgICAgY29uc3QgbGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG4gICAgICAgIGxhYmVsLmNsYXNzTmFtZSA9ICdzdHJhdGVneS1sYWJlbCc7XG4gICAgICAgIGxhYmVsLnRleHRDb250ZW50ID0gc3RyYXRlZ3kubGFiZWw7XG5cbiAgICAgICAgLy8gVGFnc1xuICAgICAgICBsZXQgdGFnc0h0bWwgPSAnJztcbiAgICAgICAgaWYgKHN0cmF0ZWd5LnRhZ3MpIHtcbiAgICAgICAgICAgICBzdHJhdGVneS50YWdzLmZvckVhY2godGFnID0+IHtcbiAgICAgICAgICAgICAgICB0YWdzSHRtbCArPSBgPHNwYW4gY2xhc3M9XCJ0YWcgdGFnLSR7dGFnfVwiPiR7dGFnfTwvc3Bhbj5gO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBjb250ZW50V3JhcHBlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICBjb250ZW50V3JhcHBlci5zdHlsZS5mbGV4ID0gXCIxXCI7XG4gICAgICAgIGNvbnRlbnRXcmFwcGVyLnN0eWxlLmRpc3BsYXkgPSBcImZsZXhcIjtcbiAgICAgICAgY29udGVudFdyYXBwZXIuc3R5bGUuYWxpZ25JdGVtcyA9IFwiY2VudGVyXCI7XG4gICAgICAgIGNvbnRlbnRXcmFwcGVyLmFwcGVuZENoaWxkKGxhYmVsKTtcbiAgICAgICAgaWYgKHRhZ3NIdG1sKSB7XG4gICAgICAgICAgICAgY29uc3QgdGFnc0NvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcbiAgICAgICAgICAgICB0YWdzQ29udGFpbmVyLmlubmVySFRNTCA9IHRhZ3NIdG1sO1xuICAgICAgICAgICAgIGNvbnRlbnRXcmFwcGVyLmFwcGVuZENoaWxkKHRhZ3NDb250YWluZXIpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmVtb3ZlIEJ1dHRvblxuICAgICAgICBjb25zdCByZW1vdmVCdG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgICAgICAgcmVtb3ZlQnRuLmNsYXNzTmFtZSA9ICdzdHJhdGVneS1yZW1vdmUtYnRuJztcbiAgICAgICAgcmVtb3ZlQnRuLmlubmVySFRNTCA9IElDT05TLmNsb3NlOyAvLyBVc2UgSWNvbiBmb3IgY29uc2lzdGVuY3lcbiAgICAgICAgcmVtb3ZlQnRuLnRpdGxlID0gXCJSZW1vdmUgc3RyYXRlZ3lcIjtcbiAgICAgICAgcmVtb3ZlQnRuLm9uY2xpY2sgPSBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICAgYXdhaXQgdG9nZ2xlU3RyYXRlZ3koc3RyYXRlZ3kuaWQsIGZhbHNlKTtcbiAgICAgICAgfTtcblxuICAgICAgICByb3cuYXBwZW5kQ2hpbGQoaGFuZGxlKTtcbiAgICAgICAgcm93LmFwcGVuZENoaWxkKGNvbnRlbnRXcmFwcGVyKTtcblxuICAgICAgICBpZiAoc3RyYXRlZ3kuaXNDdXN0b20pIHtcbiAgICAgICAgICAgICBjb25zdCBhdXRvUnVuQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgICAgICAgICAgICBhdXRvUnVuQnRuLmNsYXNzTmFtZSA9IGBhY3Rpb24tYnRuIGF1dG8tcnVuICR7c3RyYXRlZ3kuYXV0b1J1biA/ICdhY3RpdmUnIDogJyd9YDtcbiAgICAgICAgICAgICBhdXRvUnVuQnRuLmlubmVySFRNTCA9IElDT05TLmF1dG9SdW47XG4gICAgICAgICAgICAgYXV0b1J1bkJ0bi50aXRsZSA9IGBBdXRvIFJ1bjogJHtzdHJhdGVneS5hdXRvUnVuID8gJ09OJyA6ICdPRkYnfWA7XG4gICAgICAgICAgICAgYXV0b1J1bkJ0bi5zdHlsZS5vcGFjaXR5ID0gc3RyYXRlZ3kuYXV0b1J1biA/IFwiMVwiIDogXCIwLjNcIjtcbiAgICAgICAgICAgICBhdXRvUnVuQnRuLm9uY2xpY2sgPSBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgICBpZiAoIXByZWZlcmVuY2VzPy5jdXN0b21TdHJhdGVnaWVzKSByZXR1cm47XG4gICAgICAgICAgICAgICAgIGNvbnN0IGN1c3RvbVN0cmF0SW5kZXggPSBwcmVmZXJlbmNlcy5jdXN0b21TdHJhdGVnaWVzLmZpbmRJbmRleChzID0+IHMuaWQgPT09IHN0cmF0ZWd5LmlkKTtcbiAgICAgICAgICAgICAgICAgaWYgKGN1c3RvbVN0cmF0SW5kZXggIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN0cmF0ID0gcHJlZmVyZW5jZXMuY3VzdG9tU3RyYXRlZ2llc1tjdXN0b21TdHJhdEluZGV4XTtcbiAgICAgICAgICAgICAgICAgICAgc3RyYXQuYXV0b1J1biA9ICFzdHJhdC5hdXRvUnVuO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBpc0FjdGl2ZSA9ICEhc3RyYXQuYXV0b1J1bjtcbiAgICAgICAgICAgICAgICAgICAgYXV0b1J1bkJ0bi5jbGFzc0xpc3QudG9nZ2xlKCdhY3RpdmUnLCBpc0FjdGl2ZSk7XG4gICAgICAgICAgICAgICAgICAgIGF1dG9SdW5CdG4uc3R5bGUub3BhY2l0eSA9IGlzQWN0aXZlID8gXCIxXCIgOiBcIjAuM1wiO1xuICAgICAgICAgICAgICAgICAgICBhdXRvUnVuQnRuLnRpdGxlID0gYEF1dG8gUnVuOiAke2lzQWN0aXZlID8gJ09OJyA6ICdPRkYnfWA7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHNlbmRNZXNzYWdlKFwic2F2ZVByZWZlcmVuY2VzXCIsIHsgY3VzdG9tU3RyYXRlZ2llczogcHJlZmVyZW5jZXMuY3VzdG9tU3RyYXRlZ2llcyB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICByb3cuYXBwZW5kQ2hpbGQoYXV0b1J1bkJ0bik7XG4gICAgICAgIH1cblxuICAgICAgICByb3cuYXBwZW5kQ2hpbGQocmVtb3ZlQnRuKTtcblxuICAgICAgICBhZGREbkRMaXN0ZW5lcnMocm93KTtcbiAgICAgICAgYWN0aXZlU3RyYXRlZ2llc0xpc3QuYXBwZW5kQ2hpbGQocm93KTtcbiAgICB9KTtcblxuICAgIC8vIDIuIFJlbmRlciBBZGQgU3RyYXRlZ3kgT3B0aW9uc1xuICAgIGFkZFN0cmF0ZWd5U2VsZWN0LmlubmVySFRNTCA9ICc8b3B0aW9uIHZhbHVlPVwiXCIgZGlzYWJsZWQgc2VsZWN0ZWQ+U2VsZWN0IFN0cmF0ZWd5Li4uPC9vcHRpb24+JztcblxuICAgIGNvbnN0IGRpc2FibGVkU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gIWVuYWJsZWRJZHMuaW5jbHVkZXMocy5pZCkpO1xuICAgIGRpc2FibGVkU3RyYXRlZ2llcy5zb3J0KChhLCBiKSA9PiBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCkpO1xuXG4gICAgLy8gU2VwYXJhdGUgc3RyYXRlZ2llcyB3aXRoIEF1dG8tUnVuIGFjdGl2ZSBidXQgbm90IGluIHNvcnRpbmcgbGlzdFxuICAgIGNvbnN0IGJhY2tncm91bmRTdHJhdGVnaWVzOiBTdHJhdGVneURlZmluaXRpb25bXSA9IFtdO1xuICAgIGNvbnN0IGF2YWlsYWJsZVN0cmF0ZWdpZXM6IFN0cmF0ZWd5RGVmaW5pdGlvbltdID0gW107XG5cbiAgICBkaXNhYmxlZFN0cmF0ZWdpZXMuZm9yRWFjaChzID0+IHtcbiAgICAgICAgaWYgKHMuaXNDdXN0b20gJiYgcy5hdXRvUnVuKSB7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kU3RyYXRlZ2llcy5wdXNoKHMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYXZhaWxhYmxlU3RyYXRlZ2llcy5wdXNoKHMpO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBQb3B1bGF0ZSBTZWxlY3RcbiAgICAvLyBXZSBpbmNsdWRlIGJhY2tncm91bmQgc3RyYXRlZ2llcyBpbiB0aGUgZHJvcGRvd24gdG9vIHNvIHRoZXkgY2FuIGJlIG1vdmVkIHRvIFwiQWN0aXZlXCIgc29ydGluZyBlYXNpbHlcbiAgICAvLyBidXQgd2UgbWlnaHQgbWFyayB0aGVtXG4gICAgWy4uLmJhY2tncm91bmRTdHJhdGVnaWVzLCAuLi5hdmFpbGFibGVTdHJhdGVnaWVzXS5zb3J0KChhLCBiKSA9PiBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCkpLmZvckVhY2goc3RyYXRlZ3kgPT4ge1xuICAgICAgICBjb25zdCBvcHRpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdvcHRpb24nKTtcbiAgICAgICAgb3B0aW9uLnZhbHVlID0gc3RyYXRlZ3kuaWQ7XG4gICAgICAgIG9wdGlvbi50ZXh0Q29udGVudCA9IHN0cmF0ZWd5LmxhYmVsO1xuICAgICAgICBhZGRTdHJhdGVneVNlbGVjdC5hcHBlbmRDaGlsZChvcHRpb24pO1xuICAgIH0pO1xuXG4gICAgLy8gRm9yY2Ugc2VsZWN0aW9uIG9mIHBsYWNlaG9sZGVyXG4gICAgYWRkU3RyYXRlZ3lTZWxlY3QudmFsdWUgPSBcIlwiO1xuXG4gICAgLy8gMy4gUmVuZGVyIEJhY2tncm91bmQgU3RyYXRlZ2llcyBTZWN0aW9uIChpZiBhbnkpXG4gICAgbGV0IGJnU2VjdGlvbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYmFja2dyb3VuZFN0cmF0ZWdpZXNTZWN0aW9uXCIpO1xuICAgIGlmIChiYWNrZ3JvdW5kU3RyYXRlZ2llcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGlmICghYmdTZWN0aW9uKSB7XG4gICAgICAgICAgICBiZ1NlY3Rpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgYmdTZWN0aW9uLmlkID0gXCJiYWNrZ3JvdW5kU3RyYXRlZ2llc1NlY3Rpb25cIjtcbiAgICAgICAgICAgIGJnU2VjdGlvbi5jbGFzc05hbWUgPSBcImFjdGl2ZS1zdHJhdGVnaWVzLXNlY3Rpb25cIjtcbiAgICAgICAgICAgIC8vIFN0eWxlIGl0IHRvIGxvb2sgbGlrZSBhY3RpdmUgc2VjdGlvbiBidXQgZGlzdGluY3RcbiAgICAgICAgICAgIGJnU2VjdGlvbi5zdHlsZS5tYXJnaW5Ub3AgPSBcIjhweFwiO1xuICAgICAgICAgICAgYmdTZWN0aW9uLnN0eWxlLmJvcmRlclRvcCA9IFwiMXB4IGRhc2hlZCB2YXIoLS1ib3JkZXItY29sb3IpXCI7XG4gICAgICAgICAgICBiZ1NlY3Rpb24uc3R5bGUucGFkZGluZ1RvcCA9IFwiOHB4XCI7XG5cbiAgICAgICAgICAgIGNvbnN0IGhlYWRlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgICAgICBoZWFkZXIuY2xhc3NOYW1lID0gXCJzZWN0aW9uLWhlYWRlclwiO1xuICAgICAgICAgICAgaGVhZGVyLnRleHRDb250ZW50ID0gXCJCYWNrZ3JvdW5kIEF1dG8tUnVuXCI7XG4gICAgICAgICAgICBoZWFkZXIudGl0bGUgPSBcIlRoZXNlIHN0cmF0ZWdpZXMgcnVuIGF1dG9tYXRpY2FsbHkgYnV0IGFyZSBub3QgdXNlZCBmb3Igc29ydGluZy9ncm91cGluZyBvcmRlci5cIjtcbiAgICAgICAgICAgIGJnU2VjdGlvbi5hcHBlbmRDaGlsZChoZWFkZXIpO1xuXG4gICAgICAgICAgICBjb25zdCBsaXN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgICAgIGxpc3QuY2xhc3NOYW1lID0gXCJzdHJhdGVneS1saXN0XCI7XG4gICAgICAgICAgICBiZ1NlY3Rpb24uYXBwZW5kQ2hpbGQobGlzdCk7XG5cbiAgICAgICAgICAgIC8vIEluc2VydCBhZnRlciBhY3RpdmUgbGlzdFxuICAgICAgICAgICAgYWN0aXZlU3RyYXRlZ2llc0xpc3QucGFyZW50RWxlbWVudD8uYWZ0ZXIoYmdTZWN0aW9uKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGxpc3QgPSBiZ1NlY3Rpb24ucXVlcnlTZWxlY3RvcihcIi5zdHJhdGVneS1saXN0XCIpIGFzIEhUTUxFbGVtZW50O1xuICAgICAgICBsaXN0LmlubmVySFRNTCA9IFwiXCI7XG5cbiAgICAgICAgYmFja2dyb3VuZFN0cmF0ZWdpZXMuZm9yRWFjaChzdHJhdGVneSA9PiB7XG4gICAgICAgICAgICBjb25zdCByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgIHJvdy5jbGFzc05hbWUgPSAnc3RyYXRlZ3ktcm93JztcbiAgICAgICAgICAgIHJvdy5kYXRhc2V0LmlkID0gc3RyYXRlZ3kuaWQ7XG5cbiAgICAgICAgICAgIGNvbnN0IGxhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuICAgICAgICAgICAgbGFiZWwuY2xhc3NOYW1lID0gJ3N0cmF0ZWd5LWxhYmVsJztcbiAgICAgICAgICAgIGxhYmVsLnRleHRDb250ZW50ID0gc3RyYXRlZ3kubGFiZWw7XG4gICAgICAgICAgICBsYWJlbC5zdHlsZS5vcGFjaXR5ID0gXCIwLjdcIjtcblxuICAgICAgICAgICAgY29uc3QgYXV0b1J1bkJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gICAgICAgICAgICBhdXRvUnVuQnRuLmNsYXNzTmFtZSA9IGBhY3Rpb24tYnRuIGF1dG8tcnVuIGFjdGl2ZWA7XG4gICAgICAgICAgICBhdXRvUnVuQnRuLmlubmVySFRNTCA9IElDT05TLmF1dG9SdW47XG4gICAgICAgICAgICBhdXRvUnVuQnRuLnRpdGxlID0gYEF1dG8gUnVuOiBPTiAoQ2xpY2sgdG8gZGlzYWJsZSlgO1xuICAgICAgICAgICAgYXV0b1J1bkJ0bi5zdHlsZS5tYXJnaW5MZWZ0ID0gXCJhdXRvXCI7XG4gICAgICAgICAgICBhdXRvUnVuQnRuLm9uY2xpY2sgPSBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgICBpZiAoIXByZWZlcmVuY2VzPy5jdXN0b21TdHJhdGVnaWVzKSByZXR1cm47XG4gICAgICAgICAgICAgICAgIGNvbnN0IGN1c3RvbVN0cmF0SW5kZXggPSBwcmVmZXJlbmNlcy5jdXN0b21TdHJhdGVnaWVzLmZpbmRJbmRleChzID0+IHMuaWQgPT09IHN0cmF0ZWd5LmlkKTtcbiAgICAgICAgICAgICAgICAgaWYgKGN1c3RvbVN0cmF0SW5kZXggIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN0cmF0ID0gcHJlZmVyZW5jZXMuY3VzdG9tU3RyYXRlZ2llc1tjdXN0b21TdHJhdEluZGV4XTtcbiAgICAgICAgICAgICAgICAgICAgc3RyYXQuYXV0b1J1biA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBzZW5kTWVzc2FnZShcInNhdmVQcmVmZXJlbmNlc1wiLCB7IGN1c3RvbVN0cmF0ZWdpZXM6IHByZWZlcmVuY2VzLmN1c3RvbVN0cmF0ZWdpZXMgfSk7XG4gICAgICAgICAgICAgICAgICAgIC8vIFVJIHVwZGF0ZSB0cmlnZ2VycyB2aWEgc2VuZE1lc3NhZ2UgcmVzcG9uc2Ugb3IgcmUtcmVuZGVyXG4gICAgICAgICAgICAgICAgICAgIC8vIEJ1dCB3ZSBzaG91bGQgcmUtcmVuZGVyIGltbWVkaWF0ZWx5IGZvciByZXNwb25zaXZlbmVzc1xuICAgICAgICAgICAgICAgICAgICB1cGRhdGVTdHJhdGVneVZpZXdzKHN0cmF0ZWdpZXMsIGVuYWJsZWRJZHMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHJvdy5hcHBlbmRDaGlsZChsYWJlbCk7XG4gICAgICAgICAgICByb3cuYXBwZW5kQ2hpbGQoYXV0b1J1bkJ0bik7XG4gICAgICAgICAgICBsaXN0LmFwcGVuZENoaWxkKHJvdyk7XG4gICAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChiZ1NlY3Rpb24pIGJnU2VjdGlvbi5yZW1vdmUoKTtcbiAgICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHRvZ2dsZVN0cmF0ZWd5KGlkOiBzdHJpbmcsIGVuYWJsZTogYm9vbGVhbikge1xuICAgIGlmICghcHJlZmVyZW5jZXMpIHJldHVybjtcblxuICAgIGNvbnN0IGFsbFN0cmF0ZWdpZXMgPSBnZXRTdHJhdGVnaWVzKHByZWZlcmVuY2VzLmN1c3RvbVN0cmF0ZWdpZXMpO1xuICAgIGNvbnN0IHZhbGlkSWRzID0gbmV3IFNldChhbGxTdHJhdGVnaWVzLm1hcChzID0+IHMuaWQpKTtcblxuICAgIC8vIENsZWFuIGN1cnJlbnQgbGlzdCBieSByZW1vdmluZyBzdGFsZSBJRHNcbiAgICBsZXQgY3VycmVudCA9IChwcmVmZXJlbmNlcy5zb3J0aW5nIHx8IFtdKS5maWx0ZXIoc0lkID0+IHZhbGlkSWRzLmhhcyhzSWQpKTtcblxuICAgIGlmIChlbmFibGUpIHtcbiAgICAgICAgaWYgKCFjdXJyZW50LmluY2x1ZGVzKGlkKSkge1xuICAgICAgICAgICAgY3VycmVudC5wdXNoKGlkKTtcbiAgICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAgIGN1cnJlbnQgPSBjdXJyZW50LmZpbHRlcihzSWQgPT4gc0lkICE9PSBpZCk7XG4gICAgfVxuXG4gICAgcHJlZmVyZW5jZXMuc29ydGluZyA9IGN1cnJlbnQ7XG4gICAgYXdhaXQgc2VuZE1lc3NhZ2UoXCJzYXZlUHJlZmVyZW5jZXNcIiwgeyBzb3J0aW5nOiBjdXJyZW50IH0pO1xuXG4gICAgLy8gUmUtcmVuZGVyXG4gICAgdXBkYXRlU3RyYXRlZ3lWaWV3cyhhbGxTdHJhdGVnaWVzLCBjdXJyZW50KTtcbn1cblxuZnVuY3Rpb24gYWRkRG5ETGlzdGVuZXJzKHJvdzogSFRNTEVsZW1lbnQpIHtcbiAgcm93LmFkZEV2ZW50TGlzdGVuZXIoJ2RyYWdzdGFydCcsIChlKSA9PiB7XG4gICAgcm93LmNsYXNzTGlzdC5hZGQoJ2RyYWdnaW5nJyk7XG4gICAgaWYgKGUuZGF0YVRyYW5zZmVyKSB7XG4gICAgICAgIGUuZGF0YVRyYW5zZmVyLmVmZmVjdEFsbG93ZWQgPSAnbW92ZSc7XG4gICAgfVxuICB9KTtcblxuICByb3cuYWRkRXZlbnRMaXN0ZW5lcignZHJhZ2VuZCcsIGFzeW5jICgpID0+IHtcbiAgICByb3cuY2xhc3NMaXN0LnJlbW92ZSgnZHJhZ2dpbmcnKTtcbiAgICAvLyBTYXZlIG9yZGVyXG4gICAgaWYgKHByZWZlcmVuY2VzKSB7XG4gICAgICAgIGNvbnN0IGN1cnJlbnRTb3J0aW5nID0gZ2V0U2VsZWN0ZWRTb3J0aW5nKCk7XG4gICAgICAgIC8vIENoZWNrIGlmIG9yZGVyIGNoYW5nZWRcbiAgICAgICAgY29uc3Qgb2xkU29ydGluZyA9IHByZWZlcmVuY2VzLnNvcnRpbmcgfHwgW107XG4gICAgICAgIGlmIChKU09OLnN0cmluZ2lmeShjdXJyZW50U29ydGluZykgIT09IEpTT04uc3RyaW5naWZ5KG9sZFNvcnRpbmcpKSB7XG4gICAgICAgICAgICBwcmVmZXJlbmNlcy5zb3J0aW5nID0gY3VycmVudFNvcnRpbmc7XG4gICAgICAgICAgICBhd2FpdCBzZW5kTWVzc2FnZShcInNhdmVQcmVmZXJlbmNlc1wiLCB7IHNvcnRpbmc6IGN1cnJlbnRTb3J0aW5nIH0pO1xuICAgICAgICB9XG4gICAgfVxuICB9KTtcbn1cblxuZnVuY3Rpb24gc2V0dXBDb250YWluZXJEbkQoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnRhaW5lci5hZGRFdmVudExpc3RlbmVyKCdkcmFnb3ZlcicsIChlKSA9PiB7XG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgY29uc3QgYWZ0ZXJFbGVtZW50ID0gZ2V0RHJhZ0FmdGVyRWxlbWVudChjb250YWluZXIsIGUuY2xpZW50WSk7XG4gICAgICAgIGNvbnN0IGRyYWdnYWJsZVJvdyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5zdHJhdGVneS1yb3cuZHJhZ2dpbmcnKTtcbiAgICAgICAgaWYgKGRyYWdnYWJsZVJvdyAmJiBkcmFnZ2FibGVSb3cucGFyZW50RWxlbWVudCA9PT0gY29udGFpbmVyKSB7XG4gICAgICAgICAgICAgaWYgKGFmdGVyRWxlbWVudCA9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKGRyYWdnYWJsZVJvdyk7XG4gICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb250YWluZXIuaW5zZXJ0QmVmb3JlKGRyYWdnYWJsZVJvdywgYWZ0ZXJFbGVtZW50KTtcbiAgICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuc2V0dXBDb250YWluZXJEbkQoYWN0aXZlU3RyYXRlZ2llc0xpc3QpO1xuXG5mdW5jdGlvbiBnZXREcmFnQWZ0ZXJFbGVtZW50KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHk6IG51bWJlcikge1xuICBjb25zdCBkcmFnZ2FibGVFbGVtZW50cyA9IEFycmF5LmZyb20oY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5zdHJhdGVneS1yb3c6bm90KC5kcmFnZ2luZyknKSk7XG5cbiAgcmV0dXJuIGRyYWdnYWJsZUVsZW1lbnRzLnJlZHVjZSgoY2xvc2VzdCwgY2hpbGQpID0+IHtcbiAgICBjb25zdCBib3ggPSBjaGlsZC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICBjb25zdCBvZmZzZXQgPSB5IC0gYm94LnRvcCAtIGJveC5oZWlnaHQgLyAyO1xuICAgIGlmIChvZmZzZXQgPCAwICYmIG9mZnNldCA+IGNsb3Nlc3Qub2Zmc2V0KSB7XG4gICAgICByZXR1cm4geyBvZmZzZXQ6IG9mZnNldCwgZWxlbWVudDogY2hpbGQgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGNsb3Nlc3Q7XG4gICAgfVxuICB9LCB7IG9mZnNldDogTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZLCBlbGVtZW50OiBudWxsIGFzIEVsZW1lbnQgfCBudWxsIH0pLmVsZW1lbnQ7XG59XG5cbmNvbnN0IHVwZGF0ZUFJU2V0dGluZ3NVSSA9ICgpID0+IHtcbiAgICBpZiAoIXByZWZlcmVuY2VzPy5haSkgcmV0dXJuO1xuXG4gICAgaWYgKGFpRW5hYmxlZENoZWNrYm94KSBhaUVuYWJsZWRDaGVja2JveC5jaGVja2VkID0gcHJlZmVyZW5jZXMuYWkuZW5hYmxlZDtcbiAgICBpZiAoYWlQcm92aWRlclNlbGVjdCkgYWlQcm92aWRlclNlbGVjdC52YWx1ZSA9IHByZWZlcmVuY2VzLmFpLnByb3ZpZGVyO1xuICAgIGlmIChhaUFwaUtleUlucHV0KSBhaUFwaUtleUlucHV0LnZhbHVlID0gcHJlZmVyZW5jZXMuYWkuYXBpS2V5IHx8IFwiXCI7XG4gICAgaWYgKGFpTW9kZWxJbnB1dCkgYWlNb2RlbElucHV0LnZhbHVlID0gcHJlZmVyZW5jZXMuYWkubW9kZWwgfHwgXCJcIjtcbiAgICBpZiAoYWlFbmRwb2ludElucHV0KSBhaUVuZHBvaW50SW5wdXQudmFsdWUgPSBwcmVmZXJlbmNlcy5haS5lbmRwb2ludCB8fCBcIlwiO1xuXG4gICAgY29uc3QgYWlTZXR0aW5nc0NvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYWlTZXR0aW5nc0NvbnRhaW5lclwiKTtcbiAgICBpZiAoYWlTZXR0aW5nc0NvbnRhaW5lcikge1xuICAgICAgICBhaVNldHRpbmdzQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSBwcmVmZXJlbmNlcy5haS5lbmFibGVkID8gJ2Jsb2NrJyA6ICdub25lJztcbiAgICB9XG4gICAgXG4gICAgaWYgKGFpRW5kcG9pbnRDb250YWluZXIpIHtcbiAgICAgICAgYWlFbmRwb2ludENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gcHJlZmVyZW5jZXMuYWkucHJvdmlkZXIgPT09ICdjdXN0b20nID8gJ2Jsb2NrJyA6ICdub25lJztcbiAgICB9XG59O1xuXG5jb25zdCB1cGRhdGVVSSA9IChcbiAgc3RhdGVEYXRhOiB7IGdyb3VwczogVGFiR3JvdXBbXTsgcHJlZmVyZW5jZXM6IFByZWZlcmVuY2VzIH0sXG4gIGN1cnJlbnRXaW5kb3c6IGNocm9tZS53aW5kb3dzLldpbmRvdyB8IHVuZGVmaW5lZCxcbiAgY2hyb21lV2luZG93czogY2hyb21lLndpbmRvd3MuV2luZG93W10sXG4gIGlzUHJlbGltaW5hcnkgPSBmYWxzZVxuKSA9PiB7XG4gICAgcHJlZmVyZW5jZXMgPSBzdGF0ZURhdGEucHJlZmVyZW5jZXM7XG5cbiAgICBpZiAocHJlZmVyZW5jZXMpIHtcbiAgICAgIGNvbnN0IHMgPSBwcmVmZXJlbmNlcy5zb3J0aW5nIHx8IFtdO1xuXG4gICAgICAvLyBJbml0aWFsaXplIExvZ2dlclxuICAgICAgc2V0TG9nZ2VyUHJlZmVyZW5jZXMocHJlZmVyZW5jZXMpO1xuXG4gICAgICBjb25zdCBhbGxTdHJhdGVnaWVzID0gZ2V0U3RyYXRlZ2llcyhwcmVmZXJlbmNlcy5jdXN0b21TdHJhdGVnaWVzKTtcblxuICAgICAgLy8gUmVuZGVyIHVuaWZpZWQgc3RyYXRlZ3kgbGlzdFxuICAgICAgdXBkYXRlU3RyYXRlZ3lWaWV3cyhhbGxTdHJhdGVnaWVzLCBzKTtcblxuICAgICAgLy8gSW5pdGlhbCB0aGVtZSBsb2FkXG4gICAgICBpZiAocHJlZmVyZW5jZXMudGhlbWUpIHtcbiAgICAgICAgYXBwbHlUaGVtZShwcmVmZXJlbmNlcy50aGVtZSwgZmFsc2UpO1xuICAgICAgfVxuXG4gICAgICAvLyBJbml0IHNldHRpbmdzIFVJXG4gICAgICBpZiAocHJlZmVyZW5jZXMubG9nTGV2ZWwpIHtcbiAgICAgICAgICBjb25zdCBzZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbG9nTGV2ZWxTZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgICBpZiAoc2VsZWN0KSBzZWxlY3QudmFsdWUgPSBwcmVmZXJlbmNlcy5sb2dMZXZlbDtcbiAgICAgIH1cblxuICAgICAgdXBkYXRlQUlTZXR0aW5nc1VJKCk7XG4gICAgfVxuXG4gICAgaWYgKGN1cnJlbnRXaW5kb3cpIHtcbiAgICAgIGZvY3VzZWRXaW5kb3dJZCA9IGN1cnJlbnRXaW5kb3cuaWQgPz8gbnVsbDtcbiAgICB9IGVsc2Uge1xuICAgICAgZm9jdXNlZFdpbmRvd0lkID0gbnVsbDtcbiAgICAgIGNvbnNvbGUud2FybihcIkZhaWxlZCB0byBnZXQgY3VycmVudCB3aW5kb3dcIik7XG4gICAgfVxuXG4gICAgY29uc3Qgd2luZG93VGl0bGVzID0gbmV3IE1hcDxudW1iZXIsIHN0cmluZz4oKTtcblxuICAgIGNocm9tZVdpbmRvd3MuZm9yRWFjaCgod2luKSA9PiB7XG4gICAgICBpZiAoIXdpbi5pZCkgcmV0dXJuO1xuICAgICAgY29uc3QgYWN0aXZlVGFiVGl0bGUgPSB3aW4udGFicz8uZmluZCgodGFiKSA9PiB0YWIuYWN0aXZlKT8udGl0bGU7XG4gICAgICBjb25zdCB0aXRsZSA9IGFjdGl2ZVRhYlRpdGxlID8/IGBXaW5kb3cgJHt3aW4uaWR9YDtcbiAgICAgIHdpbmRvd1RpdGxlcy5zZXQod2luLmlkLCB0aXRsZSk7XG4gICAgfSk7XG5cbiAgICB3aW5kb3dTdGF0ZSA9IG1hcFdpbmRvd3Moc3RhdGVEYXRhLmdyb3Vwcywgd2luZG93VGl0bGVzKTtcblxuICAgIGlmIChmb2N1c2VkV2luZG93SWQgIT09IG51bGwpIHtcbiAgICAgICAgd2luZG93U3RhdGUuc29ydCgoYSwgYikgPT4ge1xuICAgICAgICAgICAgaWYgKGEuaWQgPT09IGZvY3VzZWRXaW5kb3dJZCkgcmV0dXJuIC0xO1xuICAgICAgICAgICAgaWYgKGIuaWQgPT09IGZvY3VzZWRXaW5kb3dJZCkgcmV0dXJuIDE7XG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKCFpbml0aWFsU2VsZWN0aW9uRG9uZSAmJiBmb2N1c2VkV2luZG93SWQgIT09IG51bGwpIHtcbiAgICAgICAgY29uc3QgYWN0aXZlV2luZG93ID0gd2luZG93U3RhdGUuZmluZCh3ID0+IHcuaWQgPT09IGZvY3VzZWRXaW5kb3dJZCk7XG4gICAgICAgIGlmIChhY3RpdmVXaW5kb3cpIHtcbiAgICAgICAgICAgICBleHBhbmRlZE5vZGVzLmFkZChgdy0ke2FjdGl2ZVdpbmRvdy5pZH1gKTtcbiAgICAgICAgICAgICBhY3RpdmVXaW5kb3cudGFicy5mb3JFYWNoKHQgPT4gc2VsZWN0ZWRUYWJzLmFkZCh0LmlkKSk7XG5cbiAgICAgICAgICAgICBpZiAoIWlzUHJlbGltaW5hcnkpIHtcbiAgICAgICAgICAgICAgICAgaW5pdGlhbFNlbGVjdGlvbkRvbmUgPSB0cnVlO1xuICAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJlbmRlclRyZWUoKTtcbn07XG5cbmNvbnN0IGxvYWRTdGF0ZSA9IGFzeW5jICgpID0+IHtcbiAgbG9nSW5mbyhcIkxvYWRpbmcgcG9wdXAgc3RhdGVcIik7XG5cbiAgbGV0IGJnRmluaXNoZWQgPSBmYWxzZTtcblxuICBjb25zdCBmYXN0TG9hZCA9IGFzeW5jICgpID0+IHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBbbG9jYWxSZXMsIGN3LCBhd10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICAgICAgICBmZXRjaExvY2FsU3RhdGUoKSxcbiAgICAgICAgICAgIGNocm9tZS53aW5kb3dzLmdldEN1cnJlbnQoKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpLFxuICAgICAgICAgICAgY2hyb21lLndpbmRvd3MuZ2V0QWxsKHsgd2luZG93VHlwZXM6IFtcIm5vcm1hbFwiXSwgcG9wdWxhdGU6IHRydWUgfSkuY2F0Y2goKCkgPT4gW10pXG4gICAgICAgIF0pO1xuXG4gICAgICAgIC8vIE9ubHkgdXBkYXRlIGlmIGJhY2tncm91bmQgaGFzbid0IGZpbmlzaGVkIHlldFxuICAgICAgICBpZiAoIWJnRmluaXNoZWQgJiYgbG9jYWxSZXMub2sgJiYgbG9jYWxSZXMuZGF0YSkge1xuICAgICAgICAgICAgIHVwZGF0ZVVJKGxvY2FsUmVzLmRhdGEsIGN3LCBhdyBhcyBjaHJvbWUud2luZG93cy5XaW5kb3dbXSwgdHJ1ZSk7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihcIkZhc3QgbG9hZCBmYWlsZWRcIiwgZSk7XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IGJnTG9hZCA9IGFzeW5jICgpID0+IHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBbYmdSZXMsIGN3LCBhd10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICAgICAgICBmZXRjaFN0YXRlKCksXG4gICAgICAgICAgICBjaHJvbWUud2luZG93cy5nZXRDdXJyZW50KCkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKSxcbiAgICAgICAgICAgIGNocm9tZS53aW5kb3dzLmdldEFsbCh7IHdpbmRvd1R5cGVzOiBbXCJub3JtYWxcIl0sIHBvcHVsYXRlOiB0cnVlIH0pLmNhdGNoKCgpID0+IFtdKVxuICAgICAgICBdKTtcblxuICAgICAgICBiZ0ZpbmlzaGVkID0gdHJ1ZTsgLy8gTWFyayBhcyBmaW5pc2hlZCBzbyBmYXN0IGxvYWQgZG9lc24ndCBvdmVyd3JpdGUgaWYgaXQncyBzb21laG93IHNsb3dcblxuICAgICAgICBpZiAoYmdSZXMub2sgJiYgYmdSZXMuZGF0YSkge1xuICAgICAgICAgICAgIHVwZGF0ZVVJKGJnUmVzLmRhdGEsIGN3LCBhdyBhcyBjaHJvbWUud2luZG93cy5XaW5kb3dbXSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGxvYWQgc3RhdGU6XCIsIGJnUmVzLmVycm9yID8/IFwiVW5rbm93biBlcnJvclwiKTtcbiAgICAgICAgICAgIGlmICh3aW5kb3dTdGF0ZS5sZW5ndGggPT09IDApIHsgLy8gT25seSBzaG93IGVycm9yIGlmIHdlIGhhdmUgTk9USElORyBzaG93blxuICAgICAgICAgICAgICAgIHdpbmRvd3NDb250YWluZXIuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9XCJlcnJvci1zdGF0ZVwiIHN0eWxlPVwicGFkZGluZzogMjBweDsgY29sb3I6IHZhcigtLWVycm9yLWNvbG9yLCByZWQpOyB0ZXh0LWFsaWduOiBjZW50ZXI7XCI+XG4gICAgICAgICAgICAgICAgICAgIEZhaWxlZCB0byBsb2FkIHRhYnM6ICR7YmdSZXMuZXJyb3IgPz8gXCJVbmtub3duIGVycm9yXCJ9Ljxicj5cbiAgICAgICAgICAgICAgICAgICAgUGxlYXNlIHJlbG9hZCB0aGUgZXh0ZW5zaW9uIG9yIGNoZWNrIHBlcm1pc3Npb25zLlxuICAgICAgICAgICAgICAgIDwvZGl2PmA7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvciBsb2FkaW5nIHN0YXRlOlwiLCBlKTtcbiAgICB9XG4gIH07XG5cbiAgLy8gU3RhcnQgYm90aCBjb25jdXJyZW50bHlcbiAgYXdhaXQgUHJvbWlzZS5hbGwoW2Zhc3RMb2FkKCksIGJnTG9hZCgpXSk7XG59O1xuXG5jb25zdCBnZXRTZWxlY3RlZFNvcnRpbmcgPSAoKTogU29ydGluZ1N0cmF0ZWd5W10gPT4ge1xuICAgIC8vIFJlYWQgZnJvbSBET00gdG8gZ2V0IGN1cnJlbnQgb3JkZXIgb2YgYWN0aXZlIHN0cmF0ZWdpZXNcbiAgICByZXR1cm4gQXJyYXkuZnJvbShhY3RpdmVTdHJhdGVnaWVzTGlzdC5jaGlsZHJlbilcbiAgICAgICAgLm1hcChyb3cgPT4gKHJvdyBhcyBIVE1MRWxlbWVudCkuZGF0YXNldC5pZCBhcyBTb3J0aW5nU3RyYXRlZ3kpO1xufTtcblxuLy8gQWRkIGxpc3RlbmVyIGZvciBzZWxlY3RcbmFkZFN0cmF0ZWd5U2VsZWN0LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGFzeW5jIChlKSA9PiB7XG4gICAgY29uc3Qgc2VsZWN0ID0gZS50YXJnZXQgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgY29uc3QgaWQgPSBzZWxlY3QudmFsdWU7XG4gICAgaWYgKGlkKSB7XG4gICAgICAgIGF3YWl0IHRvZ2dsZVN0cmF0ZWd5KGlkLCB0cnVlKTtcbiAgICAgICAgc2VsZWN0LnZhbHVlID0gXCJcIjsgLy8gUmVzZXQgdG8gcGxhY2Vob2xkZXJcbiAgICB9XG59KTtcblxuY29uc3QgdHJpZ2dlckdyb3VwID0gYXN5bmMgKHNlbGVjdGlvbj86IEdyb3VwaW5nU2VsZWN0aW9uKSA9PiB7XG4gICAgbG9nSW5mbyhcIlRyaWdnZXJpbmcgZ3JvdXBpbmdcIiwgeyBzZWxlY3Rpb24gfSk7XG4gICAgc2hvd0xvYWRpbmcoXCJBcHBseWluZyBTdHJhdGVneS4uLlwiKTtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBzb3J0aW5nID0gZ2V0U2VsZWN0ZWRTb3J0aW5nKCk7XG4gICAgICAgIGF3YWl0IGFwcGx5R3JvdXBpbmcoeyBzZWxlY3Rpb24sIHNvcnRpbmcgfSk7XG4gICAgICAgIGF3YWl0IGxvYWRTdGF0ZSgpO1xuICAgIH0gZmluYWxseSB7XG4gICAgICAgIGhpZGVMb2FkaW5nKCk7XG4gICAgfVxufTtcblxuY2hyb21lLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKChtZXNzYWdlKSA9PiB7XG4gICAgaWYgKG1lc3NhZ2UudHlwZSA9PT0gJ2dyb3VwaW5nUHJvZ3Jlc3MnKSB7XG4gICAgICAgIGNvbnN0IHsgY29tcGxldGVkLCB0b3RhbCB9ID0gbWVzc2FnZS5wYXlsb2FkO1xuICAgICAgICB1cGRhdGVQcm9ncmVzcyhjb21wbGV0ZWQsIHRvdGFsKTtcbiAgICB9XG59KTtcblxuLy8gTGlzdGVuZXJzXG5zZWxlY3RBbGxDaGVja2JveC5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsIChlKSA9PiB7XG4gICAgY29uc3QgdGFyZ2V0U3RhdGUgPSAoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkuY2hlY2tlZDtcbiAgICBpZiAodGFyZ2V0U3RhdGUpIHtcbiAgICAgICAgLy8gU2VsZWN0IEFsbFxuICAgICAgICB3aW5kb3dTdGF0ZS5mb3JFYWNoKHdpbiA9PiB7XG4gICAgICAgICAgICB3aW4udGFicy5mb3JFYWNoKHRhYiA9PiBzZWxlY3RlZFRhYnMuYWRkKHRhYi5pZCkpO1xuICAgICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgICAvLyBEZXNlbGVjdCBBbGxcbiAgICAgICAgc2VsZWN0ZWRUYWJzLmNsZWFyKCk7XG4gICAgfVxuICAgIHJlbmRlclRyZWUoKTtcbn0pO1xuXG5idG5BcHBseT8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBsb2dJbmZvKFwiQXBwbHkgYnV0dG9uIGNsaWNrZWRcIiwgeyBzZWxlY3RlZENvdW50OiBzZWxlY3RlZFRhYnMuc2l6ZSB9KTtcbiAgICB0cmlnZ2VyR3JvdXAoeyB0YWJJZHM6IEFycmF5LmZyb20oc2VsZWN0ZWRUYWJzKSB9KTtcbn0pO1xuXG5idG5Vbmdyb3VwLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIGlmIChjb25maXJtKGBVbmdyb3VwICR7c2VsZWN0ZWRUYWJzLnNpemV9IHRhYnM/YCkpIHtcbiAgICAgIGxvZ0luZm8oXCJVbmdyb3VwaW5nIHRhYnNcIiwgeyBjb3VudDogc2VsZWN0ZWRUYWJzLnNpemUgfSk7XG4gICAgICBhd2FpdCBjaHJvbWUudGFicy51bmdyb3VwKEFycmF5LmZyb20oc2VsZWN0ZWRUYWJzKSk7XG4gICAgICBhd2FpdCBsb2FkU3RhdGUoKTtcbiAgfVxufSk7XG5idG5NZXJnZS5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICBpZiAoY29uZmlybShgTWVyZ2UgJHtzZWxlY3RlZFRhYnMuc2l6ZX0gdGFicyBpbnRvIG9uZSBncm91cD9gKSkge1xuICAgICAgbG9nSW5mbyhcIk1lcmdpbmcgdGFic1wiLCB7IGNvdW50OiBzZWxlY3RlZFRhYnMuc2l6ZSB9KTtcbiAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHNlbmRNZXNzYWdlKFwibWVyZ2VTZWxlY3Rpb25cIiwgeyB0YWJJZHM6IEFycmF5LmZyb20oc2VsZWN0ZWRUYWJzKSB9KTtcbiAgICAgIGlmICghcmVzLm9rKSBhbGVydChcIk1lcmdlIGZhaWxlZDogXCIgKyByZXMuZXJyb3IpO1xuICAgICAgZWxzZSBhd2FpdCBsb2FkU3RhdGUoKTtcbiAgfVxufSk7XG5idG5TcGxpdC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICBpZiAoY29uZmlybShgU3BsaXQgJHtzZWxlY3RlZFRhYnMuc2l6ZX0gdGFicyBpbnRvIGEgbmV3IHdpbmRvdz9gKSkge1xuICAgICAgbG9nSW5mbyhcIlNwbGl0dGluZyB0YWJzXCIsIHsgY291bnQ6IHNlbGVjdGVkVGFicy5zaXplIH0pO1xuICAgICAgY29uc3QgcmVzID0gYXdhaXQgc2VuZE1lc3NhZ2UoXCJzcGxpdFNlbGVjdGlvblwiLCB7IHRhYklkczogQXJyYXkuZnJvbShzZWxlY3RlZFRhYnMpIH0pO1xuICAgICAgaWYgKCFyZXMub2spIGFsZXJ0KFwiU3BsaXQgZmFpbGVkOiBcIiArIHJlcy5lcnJvcik7XG4gICAgICBlbHNlIGF3YWl0IGxvYWRTdGF0ZSgpO1xuICB9XG59KTtcblxuYnRuRXhwYW5kQWxsPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHdpbmRvd1N0YXRlLmZvckVhY2god2luID0+IHtcbiAgICAgICAgZXhwYW5kZWROb2Rlcy5hZGQoYHctJHt3aW4uaWR9YCk7XG4gICAgICAgIHdpbi50YWJzLmZvckVhY2godGFiID0+IHtcbiAgICAgICAgICAgIGlmICh0YWIuZ3JvdXBMYWJlbCkge1xuICAgICAgICAgICAgICAgICBleHBhbmRlZE5vZGVzLmFkZChgdy0ke3dpbi5pZH0tZy0ke3RhYi5ncm91cExhYmVsfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9KTtcbiAgICByZW5kZXJUcmVlKCk7XG59KTtcblxuYnRuQ29sbGFwc2VBbGw/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgZXhwYW5kZWROb2Rlcy5jbGVhcigpO1xuICAgIHJlbmRlclRyZWUoKTtcbn0pO1xuXG5cbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuVW5kb1wiKT8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgbG9nSW5mbyhcIlVuZG8gY2xpY2tlZFwiKTtcbiAgY29uc3QgcmVzID0gYXdhaXQgc2VuZE1lc3NhZ2UoXCJ1bmRvXCIpO1xuICBpZiAoIXJlcy5vaykgYWxlcnQoXCJVbmRvIGZhaWxlZDogXCIgKyByZXMuZXJyb3IpO1xufSk7XG5cbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuU2F2ZVN0YXRlXCIpPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICBjb25zdCBuYW1lID0gcHJvbXB0KFwiRW50ZXIgYSBuYW1lIGZvciB0aGlzIHN0YXRlOlwiKTtcbiAgaWYgKG5hbWUpIHtcbiAgICBsb2dJbmZvKFwiU2F2aW5nIHN0YXRlXCIsIHsgbmFtZSB9KTtcbiAgICBjb25zdCByZXMgPSBhd2FpdCBzZW5kTWVzc2FnZShcInNhdmVTdGF0ZVwiLCB7IG5hbWUgfSk7XG4gICAgaWYgKCFyZXMub2spIGFsZXJ0KFwiU2F2ZSBmYWlsZWQ6IFwiICsgcmVzLmVycm9yKTtcbiAgfVxufSk7XG5cbmNvbnN0IGxvYWRTdGF0ZURpYWxvZyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibG9hZFN0YXRlRGlhbG9nXCIpIGFzIEhUTUxEaWFsb2dFbGVtZW50O1xuY29uc3Qgc2F2ZWRTdGF0ZUxpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNhdmVkU3RhdGVMaXN0XCIpIGFzIEhUTUxFbGVtZW50O1xuXG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0bkxvYWRTdGF0ZVwiKT8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgbG9nSW5mbyhcIk9wZW5pbmcgTG9hZCBTdGF0ZSBkaWFsb2dcIik7XG4gIGNvbnN0IHJlcyA9IGF3YWl0IHNlbmRNZXNzYWdlPFNhdmVkU3RhdGVbXT4oXCJnZXRTYXZlZFN0YXRlc1wiKTtcbiAgaWYgKHJlcy5vayAmJiByZXMuZGF0YSkge1xuICAgIHNhdmVkU3RhdGVMaXN0LmlubmVySFRNTCA9IFwiXCI7XG4gICAgcmVzLmRhdGEuZm9yRWFjaCgoc3RhdGUpID0+IHtcbiAgICAgIGNvbnN0IGxpID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImxpXCIpO1xuICAgICAgbGkuc3R5bGUuZGlzcGxheSA9IFwiZmxleFwiO1xuICAgICAgbGkuc3R5bGUuanVzdGlmeUNvbnRlbnQgPSBcInNwYWNlLWJldHdlZW5cIjtcbiAgICAgIGxpLnN0eWxlLnBhZGRpbmcgPSBcIjhweFwiO1xuICAgICAgbGkuc3R5bGUuYm9yZGVyQm90dG9tID0gXCIxcHggc29saWQgdmFyKC0tYm9yZGVyLWNvbG9yKVwiO1xuXG4gICAgICBjb25zdCBzcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gICAgICBzcGFuLnRleHRDb250ZW50ID0gYCR7c3RhdGUubmFtZX0gKCR7bmV3IERhdGUoc3RhdGUudGltZXN0YW1wKS50b0xvY2FsZVN0cmluZygpfSlgO1xuICAgICAgc3Bhbi5zdHlsZS5jdXJzb3IgPSBcInBvaW50ZXJcIjtcbiAgICAgIHNwYW4ub25jbGljayA9IGFzeW5jICgpID0+IHtcbiAgICAgICAgaWYgKGNvbmZpcm0oYExvYWQgc3RhdGUgXCIke3N0YXRlLm5hbWV9XCI/YCkpIHtcbiAgICAgICAgICBsb2dJbmZvKFwiUmVzdG9yaW5nIHN0YXRlXCIsIHsgbmFtZTogc3RhdGUubmFtZSB9KTtcbiAgICAgICAgICBjb25zdCByID0gYXdhaXQgc2VuZE1lc3NhZ2UoXCJyZXN0b3JlU3RhdGVcIiwgeyBzdGF0ZSB9KTtcbiAgICAgICAgICBpZiAoci5vaykge1xuICAgICAgICAgICAgICBsb2FkU3RhdGVEaWFsb2cuY2xvc2UoKTtcbiAgICAgICAgICAgICAgd2luZG93LmNsb3NlKCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgYWxlcnQoXCJSZXN0b3JlIGZhaWxlZDogXCIgKyByLmVycm9yKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IGRlbEJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gICAgICBkZWxCdG4udGV4dENvbnRlbnQgPSBcIkRlbGV0ZVwiO1xuICAgICAgZGVsQnRuLnN0eWxlLm1hcmdpbkxlZnQgPSBcIjhweFwiO1xuICAgICAgZGVsQnRuLnN0eWxlLmJhY2tncm91bmQgPSBcInRyYW5zcGFyZW50XCI7XG4gICAgICBkZWxCdG4uc3R5bGUuY29sb3IgPSBcInZhcigtLXRleHQtY29sb3IpXCI7XG4gICAgICBkZWxCdG4uc3R5bGUuYm9yZGVyID0gXCIxcHggc29saWQgdmFyKC0tYm9yZGVyLWNvbG9yKVwiO1xuICAgICAgZGVsQnRuLnN0eWxlLmJvcmRlclJhZGl1cyA9IFwiNHB4XCI7XG4gICAgICBkZWxCdG4uc3R5bGUucGFkZGluZyA9IFwiMnB4IDZweFwiO1xuICAgICAgZGVsQnRuLm9uY2xpY2sgPSBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgaWYgKGNvbmZpcm0oYERlbGV0ZSBzdGF0ZSBcIiR7c3RhdGUubmFtZX1cIj9gKSkge1xuICAgICAgICAgICAgICBhd2FpdCBzZW5kTWVzc2FnZShcImRlbGV0ZVNhdmVkU3RhdGVcIiwgeyBuYW1lOiBzdGF0ZS5uYW1lIH0pO1xuICAgICAgICAgICAgICBsaS5yZW1vdmUoKTtcbiAgICAgICAgICB9XG4gICAgICB9O1xuXG4gICAgICBsaS5hcHBlbmRDaGlsZChzcGFuKTtcbiAgICAgIGxpLmFwcGVuZENoaWxkKGRlbEJ0bik7XG4gICAgICBzYXZlZFN0YXRlTGlzdC5hcHBlbmRDaGlsZChsaSk7XG4gICAgfSk7XG4gICAgbG9hZFN0YXRlRGlhbG9nLnNob3dNb2RhbCgpO1xuICB9IGVsc2Uge1xuICAgICAgYWxlcnQoXCJGYWlsZWQgdG8gbG9hZCBzdGF0ZXM6IFwiICsgcmVzLmVycm9yKTtcbiAgfVxufSk7XG5cbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuQ2xvc2VMb2FkU3RhdGVcIik/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgbG9hZFN0YXRlRGlhbG9nLmNsb3NlKCk7XG59KTtcblxuc2VhcmNoSW5wdXQuYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsIHJlbmRlclRyZWUpO1xuXG4vLyBBdXRvLXJlZnJlc2hcbmNocm9tZS50YWJzLm9uVXBkYXRlZC5hZGRMaXN0ZW5lcigoKSA9PiBsb2FkU3RhdGUoKSk7XG5jaHJvbWUudGFicy5vblJlbW92ZWQuYWRkTGlzdGVuZXIoKCkgPT4gbG9hZFN0YXRlKCkpO1xuY2hyb21lLndpbmRvd3Mub25SZW1vdmVkLmFkZExpc3RlbmVyKCgpID0+IGxvYWRTdGF0ZSgpKTtcblxuLy8gLS0tIFRoZW1lIExvZ2ljIC0tLVxuY29uc3QgYnRuVGhlbWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0blRoZW1lXCIpO1xuY29uc3QgaWNvblN1biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaWNvblN1blwiKTtcbmNvbnN0IGljb25Nb29uID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJpY29uTW9vblwiKTtcblxuY29uc3QgYXBwbHlUaGVtZSA9ICh0aGVtZTogJ2xpZ2h0JyB8ICdkYXJrJywgc2F2ZSA9IGZhbHNlKSA9PiB7XG4gICAgaWYgKHRoZW1lID09PSAnbGlnaHQnKSB7XG4gICAgICAgIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LmFkZCgnbGlnaHQtbW9kZScpO1xuICAgICAgICBpZiAoaWNvblN1bikgaWNvblN1bi5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcbiAgICAgICAgaWYgKGljb25Nb29uKSBpY29uTW9vbi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LnJlbW92ZSgnbGlnaHQtbW9kZScpO1xuICAgICAgICBpZiAoaWNvblN1bikgaWNvblN1bi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICBpZiAoaWNvbk1vb24pIGljb25Nb29uLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuICAgIH1cblxuICAgIC8vIFN5bmMgd2l0aCBQcmVmZXJlbmNlc1xuICAgIGlmIChzYXZlKSB7XG4gICAgICAgIC8vIFdlIHVzZSBzYXZlUHJlZmVyZW5jZXMgd2hpY2ggY2FsbHMgdGhlIGJhY2tncm91bmQgdG8gc3RvcmUgaXRcbiAgICAgICAgbG9nSW5mbyhcIkFwcGx5aW5nIHRoZW1lXCIsIHsgdGhlbWUgfSk7XG4gICAgICAgIHNlbmRNZXNzYWdlKFwic2F2ZVByZWZlcmVuY2VzXCIsIHsgdGhlbWUgfSk7XG4gICAgfVxufTtcblxuLy8gSW5pdGlhbCBsb2FkIGZhbGxiYWNrIChiZWZvcmUgbG9hZFN0YXRlIGxvYWRzIHByZWZzKVxuY29uc3Qgc3RvcmVkVGhlbWUgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgndGhlbWUnKSBhcyAnbGlnaHQnIHwgJ2RhcmsnO1xuLy8gSWYgd2UgaGF2ZSBhIGxvY2FsIG92ZXJyaWRlLCB1c2UgaXQgdGVtcG9yYXJpbHksIGJ1dCBsb2FkU3RhdGUgd2lsbCBhdXRob3JpdGF0aXZlIGNoZWNrIHByZWZzXG5pZiAoc3RvcmVkVGhlbWUpIGFwcGx5VGhlbWUoc3RvcmVkVGhlbWUsIGZhbHNlKTtcblxuYnRuVGhlbWU/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgIGNvbnN0IGlzTGlnaHQgPSBkb2N1bWVudC5ib2R5LmNsYXNzTGlzdC5jb250YWlucygnbGlnaHQtbW9kZScpO1xuICAgIGNvbnN0IG5ld1RoZW1lID0gaXNMaWdodCA/ICdkYXJrJyA6ICdsaWdodCc7XG4gICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ3RoZW1lJywgbmV3VGhlbWUpOyAvLyBLZWVwIGxvY2FsIGNvcHkgZm9yIGZhc3QgYm9vdFxuICAgIGFwcGx5VGhlbWUobmV3VGhlbWUsIHRydWUpO1xufSk7XG5cbi8vIC0tLSBTZXR0aW5ncyBMb2dpYyAtLS1cbmNvbnN0IHNldHRpbmdzRGlhbG9nID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzZXR0aW5nc0RpYWxvZ1wiKSBhcyBIVE1MRGlhbG9nRWxlbWVudDtcbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuU2V0dGluZ3NcIik/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0dGluZ3NEaWFsb2cuc2hvd01vZGFsKCk7XG59KTtcbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuQ2xvc2VTZXR0aW5nc1wiKT8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXR0aW5nc0RpYWxvZy5jbG9zZSgpO1xufSk7XG5cbmNvbnN0IGxvZ0xldmVsU2VsZWN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsb2dMZXZlbFNlbGVjdFwiKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbmxvZ0xldmVsU2VsZWN0Py5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsIGFzeW5jICgpID0+IHtcbiAgICBjb25zdCBuZXdMZXZlbCA9IGxvZ0xldmVsU2VsZWN0LnZhbHVlIGFzIExvZ0xldmVsO1xuICAgIGlmIChwcmVmZXJlbmNlcykge1xuICAgICAgICBwcmVmZXJlbmNlcy5sb2dMZXZlbCA9IG5ld0xldmVsO1xuICAgICAgICAvLyBVcGRhdGUgbG9jYWwgbG9nZ2VyIGltbWVkaWF0ZWx5XG4gICAgICAgIHNldExvZ2dlclByZWZlcmVuY2VzKHByZWZlcmVuY2VzKTtcbiAgICAgICAgLy8gUGVyc2lzdFxuICAgICAgICBhd2FpdCBzZW5kTWVzc2FnZShcInNhdmVQcmVmZXJlbmNlc1wiLCB7IGxvZ0xldmVsOiBuZXdMZXZlbCB9KTtcbiAgICAgICAgbG9nRGVidWcoXCJMb2cgbGV2ZWwgdXBkYXRlZFwiLCB7IGxldmVsOiBuZXdMZXZlbCB9KTtcbiAgICB9XG59KTtcblxuLy8gLS0tIFBpbiAmIFJlc2l6ZSBMb2dpYyAtLS1cbmNvbnN0IGJ0blBpbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuUGluXCIpO1xuYnRuUGluPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICBjb25zdCB1cmwgPSBjaHJvbWUucnVudGltZS5nZXRVUkwoXCJ1aS9wb3B1cC5odG1sXCIpO1xuICBhd2FpdCBjaHJvbWUud2luZG93cy5jcmVhdGUoe1xuICAgIHVybCxcbiAgICB0eXBlOiBcInBvcHVwXCIsXG4gICAgd2lkdGg6IGRvY3VtZW50LmJvZHkub2Zmc2V0V2lkdGgsXG4gICAgaGVpZ2h0OiBkb2N1bWVudC5ib2R5Lm9mZnNldEhlaWdodFxuICB9KTtcbiAgd2luZG93LmNsb3NlKCk7XG59KTtcblxuY29uc3QgcmVzaXplSGFuZGxlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyZXNpemVIYW5kbGVcIik7XG5pZiAocmVzaXplSGFuZGxlKSB7XG4gIGNvbnN0IHNhdmVTaXplID0gKHc6IG51bWJlciwgaDogbnVtYmVyKSA9PiB7XG4gICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShcInBvcHVwU2l6ZVwiLCBKU09OLnN0cmluZ2lmeSh7IHdpZHRoOiB3LCBoZWlnaHQ6IGggfSkpO1xuICB9O1xuXG4gIHJlc2l6ZUhhbmRsZS5hZGRFdmVudExpc3RlbmVyKFwibW91c2Vkb3duXCIsIChlKSA9PiB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBjb25zdCBzdGFydFggPSBlLmNsaWVudFg7XG4gICAgICBjb25zdCBzdGFydFkgPSBlLmNsaWVudFk7XG4gICAgICBjb25zdCBzdGFydFdpZHRoID0gZG9jdW1lbnQuYm9keS5vZmZzZXRXaWR0aDtcbiAgICAgIGNvbnN0IHN0YXJ0SGVpZ2h0ID0gZG9jdW1lbnQuYm9keS5vZmZzZXRIZWlnaHQ7XG5cbiAgICAgIGNvbnN0IG9uTW91c2VNb3ZlID0gKGV2OiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICAgICAgY29uc3QgbmV3V2lkdGggPSBNYXRoLm1heCg1MDAsIHN0YXJ0V2lkdGggKyAoZXYuY2xpZW50WCAtIHN0YXJ0WCkpO1xuICAgICAgICAgIGNvbnN0IG5ld0hlaWdodCA9IE1hdGgubWF4KDUwMCwgc3RhcnRIZWlnaHQgKyAoZXYuY2xpZW50WSAtIHN0YXJ0WSkpO1xuICAgICAgICAgIGRvY3VtZW50LmJvZHkuc3R5bGUud2lkdGggPSBgJHtuZXdXaWR0aH1weGA7XG4gICAgICAgICAgZG9jdW1lbnQuYm9keS5zdHlsZS5oZWlnaHQgPSBgJHtuZXdIZWlnaHR9cHhgO1xuICAgICAgfTtcblxuICAgICAgY29uc3Qgb25Nb3VzZVVwID0gKGV2OiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICAgICAgIGNvbnN0IG5ld1dpZHRoID0gTWF0aC5tYXgoNTAwLCBzdGFydFdpZHRoICsgKGV2LmNsaWVudFggLSBzdGFydFgpKTtcbiAgICAgICAgICAgY29uc3QgbmV3SGVpZ2h0ID0gTWF0aC5tYXgoNTAwLCBzdGFydEhlaWdodCArIChldi5jbGllbnRZIC0gc3RhcnRZKSk7XG4gICAgICAgICAgIHNhdmVTaXplKG5ld1dpZHRoLCBuZXdIZWlnaHQpO1xuICAgICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwibW91c2Vtb3ZlXCIsIG9uTW91c2VNb3ZlKTtcbiAgICAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1vdXNldXBcIiwgb25Nb3VzZVVwKTtcbiAgICAgIH07XG5cbiAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZW1vdmVcIiwgb25Nb3VzZU1vdmUpO1xuICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNldXBcIiwgb25Nb3VzZVVwKTtcbiAgfSk7XG59XG5cbmNvbnN0IGFkanVzdEZvcldpbmRvd1R5cGUgPSBhc3luYyAoKSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3Qgd2luID0gYXdhaXQgY2hyb21lLndpbmRvd3MuZ2V0Q3VycmVudCgpO1xuICAgIGlmICh3aW4udHlwZSA9PT0gXCJwb3B1cFwiKSB7XG4gICAgICAgaWYgKGJ0blBpbikgYnRuUGluLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICAgICAvLyBFbmFibGUgcmVzaXplIGhhbmRsZSBpbiBwaW5uZWQgbW9kZSBpZiBpdCB3YXMgaGlkZGVuXG4gICAgICAgaWYgKHJlc2l6ZUhhbmRsZSkgcmVzaXplSGFuZGxlLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gICAgICAgZG9jdW1lbnQuYm9keS5zdHlsZS53aWR0aCA9IFwiMTAwJVwiO1xuICAgICAgIGRvY3VtZW50LmJvZHkuc3R5bGUuaGVpZ2h0ID0gXCIxMDAlXCI7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgLy8gRGlzYWJsZSByZXNpemUgaGFuZGxlIGluIGRvY2tlZCBtb2RlXG4gICAgICAgIGlmIChyZXNpemVIYW5kbGUpIHJlc2l6ZUhhbmRsZS5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgICAgIC8vIENsZWFyIGFueSBwcmV2aW91cyBzaXplIG92ZXJyaWRlc1xuICAgICAgICBkb2N1bWVudC5ib2R5LnN0eWxlLndpZHRoID0gXCJcIjtcbiAgICAgICAgZG9jdW1lbnQuYm9keS5zdHlsZS5oZWlnaHQgPSBcIlwiO1xuICAgIH1cbiAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yIGNoZWNraW5nIHdpbmRvdyB0eXBlOlwiLCBlKTtcbiAgfVxufTtcblxuLy8gLS0tIEFJIFNldHRpbmdzIExpc3RlbmVycyAtLS1cbmFpRW5hYmxlZENoZWNrYm94Py5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBhc3luYyAoKSA9PiB7XG4gICBpZiAocHJlZmVyZW5jZXM/LmFpKSB7XG4gICAgICAgcHJlZmVyZW5jZXMuYWkuZW5hYmxlZCA9IGFpRW5hYmxlZENoZWNrYm94LmNoZWNrZWQ7XG4gICAgICAgdXBkYXRlQUlTZXR0aW5nc1VJKCk7IC8vIFVwZGF0ZSB2aXNpYmlsaXR5XG4gICAgICAgYXdhaXQgc2VuZE1lc3NhZ2UoXCJzYXZlUHJlZmVyZW5jZXNcIiwgeyBhaTogcHJlZmVyZW5jZXMuYWkgfSk7XG4gICB9XG59KTtcblxuYWlQcm92aWRlclNlbGVjdD8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgYXN5bmMgKCkgPT4ge1xuICAgaWYgKHByZWZlcmVuY2VzPy5haSkge1xuICAgICAgIHByZWZlcmVuY2VzLmFpLnByb3ZpZGVyID0gYWlQcm92aWRlclNlbGVjdC52YWx1ZSBhcyBhbnk7XG4gICAgICAgdXBkYXRlQUlTZXR0aW5nc1VJKCk7IC8vIFVwZGF0ZSB2aXNpYmlsaXR5XG4gICAgICAgYXdhaXQgc2VuZE1lc3NhZ2UoXCJzYXZlUHJlZmVyZW5jZXNcIiwgeyBhaTogcHJlZmVyZW5jZXMuYWkgfSk7XG4gICB9XG59KTtcblxuYWlBcGlLZXlJbnB1dD8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgYXN5bmMgKCkgPT4ge1xuICAgaWYgKHByZWZlcmVuY2VzPy5haSkge1xuICAgICAgIHByZWZlcmVuY2VzLmFpLmFwaUtleSA9IGFpQXBpS2V5SW5wdXQudmFsdWU7XG4gICAgICAgYXdhaXQgc2VuZE1lc3NhZ2UoXCJzYXZlUHJlZmVyZW5jZXNcIiwgeyBhaTogcHJlZmVyZW5jZXMuYWkgfSk7XG4gICB9XG59KTtcblxuYWlNb2RlbElucHV0Py5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBhc3luYyAoKSA9PiB7XG4gICBpZiAocHJlZmVyZW5jZXM/LmFpKSB7XG4gICAgICAgcHJlZmVyZW5jZXMuYWkubW9kZWwgPSBhaU1vZGVsSW5wdXQudmFsdWU7XG4gICAgICAgYXdhaXQgc2VuZE1lc3NhZ2UoXCJzYXZlUHJlZmVyZW5jZXNcIiwgeyBhaTogcHJlZmVyZW5jZXMuYWkgfSk7XG4gICB9XG59KTtcblxuYWlFbmRwb2ludElucHV0Py5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBhc3luYyAoKSA9PiB7XG4gICBpZiAocHJlZmVyZW5jZXM/LmFpKSB7XG4gICAgICAgcHJlZmVyZW5jZXMuYWkuZW5kcG9pbnQgPSBhaUVuZHBvaW50SW5wdXQudmFsdWU7XG4gICAgICAgYXdhaXQgc2VuZE1lc3NhZ2UoXCJzYXZlUHJlZmVyZW5jZXNcIiwgeyBhaTogcHJlZmVyZW5jZXMuYWkgfSk7XG4gICB9XG59KTtcblxuYWRqdXN0Rm9yV2luZG93VHlwZSgpO1xubG9hZFN0YXRlKCkuY2F0Y2goZSA9PiBjb25zb2xlLmVycm9yKFwiTG9hZCBzdGF0ZSBmYWlsZWRcIiwgZSkpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUVPLElBQU0sZUFBZSxDQUFDLFFBQTZDO0FBQ3hFLE1BQUksQ0FBQyxJQUFJLE1BQU0sSUFBSSxPQUFPLE9BQU8sS0FBSyxlQUFlLENBQUMsSUFBSSxTQUFVLFFBQU87QUFDM0UsU0FBTztBQUFBLElB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YyxjQUFhLE1BQU0sVUFBVTtBQUMvQyxlQUFTLEtBQUssTUFBTSxRQUFRO0FBQzVCLGVBQVMsS0FBSyxNQUFNLFNBQVM7QUFBQSxJQUNoQyxPQUFPO0FBRUgsVUFBSSxhQUFjLGNBQWEsTUFBTSxVQUFVO0FBRS9DLGVBQVMsS0FBSyxNQUFNLFFBQVE7QUFDNUIsZUFBUyxLQUFLLE1BQU0sU0FBUztBQUFBLElBQ2pDO0FBQUEsRUFDRixTQUFTLEdBQUc7QUFDUixZQUFRLE1BQU0sK0JBQStCLENBQUM7QUFBQSxFQUNsRDtBQUNGO0FBR0EsbUJBQW1CLGlCQUFpQixVQUFVLFlBQVk7QUFDdkQsTUFBSSxhQUFhLElBQUk7QUFDakIsZ0JBQVksR0FBRyxVQUFVLGtCQUFrQjtBQUMzQyx1QkFBbUI7QUFDbkIsVUFBTSxZQUFZLG1CQUFtQixFQUFFLElBQUksWUFBWSxHQUFHLENBQUM7QUFBQSxFQUMvRDtBQUNILENBQUM7QUFFRCxrQkFBa0IsaUJBQWlCLFVBQVUsWUFBWTtBQUN0RCxNQUFJLGFBQWEsSUFBSTtBQUNqQixnQkFBWSxHQUFHLFdBQVcsaUJBQWlCO0FBQzNDLHVCQUFtQjtBQUNuQixVQUFNLFlBQVksbUJBQW1CLEVBQUUsSUFBSSxZQUFZLEdBQUcsQ0FBQztBQUFBLEVBQy9EO0FBQ0gsQ0FBQztBQUVELGVBQWUsaUJBQWlCLFVBQVUsWUFBWTtBQUNuRCxNQUFJLGFBQWEsSUFBSTtBQUNqQixnQkFBWSxHQUFHLFNBQVMsY0FBYztBQUN0QyxVQUFNLFlBQVksbUJBQW1CLEVBQUUsSUFBSSxZQUFZLEdBQUcsQ0FBQztBQUFBLEVBQy9EO0FBQ0gsQ0FBQztBQUVELGNBQWMsaUJBQWlCLFVBQVUsWUFBWTtBQUNsRCxNQUFJLGFBQWEsSUFBSTtBQUNqQixnQkFBWSxHQUFHLFFBQVEsYUFBYTtBQUNwQyxVQUFNLFlBQVksbUJBQW1CLEVBQUUsSUFBSSxZQUFZLEdBQUcsQ0FBQztBQUFBLEVBQy9EO0FBQ0gsQ0FBQztBQUVELGlCQUFpQixpQkFBaUIsVUFBVSxZQUFZO0FBQ3JELE1BQUksYUFBYSxJQUFJO0FBQ2pCLGdCQUFZLEdBQUcsV0FBVyxnQkFBZ0I7QUFDMUMsVUFBTSxZQUFZLG1CQUFtQixFQUFFLElBQUksWUFBWSxHQUFHLENBQUM7QUFBQSxFQUMvRDtBQUNILENBQUM7QUFFRCxvQkFBb0I7QUFDcEIsVUFBVSxFQUFFLE1BQU0sT0FBSyxRQUFRLE1BQU0scUJBQXFCLENBQUMsQ0FBQzsiLAogICJuYW1lcyI6IFsiY3VzdG9tU3RyYXRlZ2llcyIsICJtYXRjaCIsICJwcmVmZXJlbmNlcyIsICJ0YWJzIiwgIndpbmRvdyIsICJsaXN0Il0KfQo=
