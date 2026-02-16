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
var resolveWindowMode = (modes) => {
  if (modes.includes("new")) return "new";
  if (modes.includes("compound")) return "compound";
  return "current";
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
var strategiesList = document.getElementById("strategiesList");
var toggleStrategies = document.getElementById("toggleStrategies");
var allStrategiesContainer = document.getElementById("all-strategies");
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
function renderStrategyList(container, strategies, defaultEnabled) {
  container.innerHTML = "";
  const enabled = strategies.filter((s) => defaultEnabled.includes(s.id));
  enabled.sort((a, b) => defaultEnabled.indexOf(a.id) - defaultEnabled.indexOf(b.id));
  const disabled = strategies.filter((s) => !defaultEnabled.includes(s.id));
  const ordered = [...enabled, ...disabled];
  ordered.forEach((strategy) => {
    const isChecked = defaultEnabled.includes(strategy.id);
    const row = document.createElement("div");
    row.className = `strategy-row ${isChecked ? "active" : ""}`;
    row.dataset.id = strategy.id;
    row.draggable = true;
    let tagsHtml = "";
    if (strategy.tags) {
      strategy.tags.forEach((tag) => {
        tagsHtml += `<span class="tag tag-${tag}">${tag}</span>`;
      });
    }
    row.innerHTML = `
            <div class="strategy-drag-handle">\u2630</div>
            <input type="checkbox" ${isChecked ? "checked" : ""}>
            <span class="strategy-label">${strategy.label}</span>
            ${tagsHtml}
        `;
    if (strategy.isCustom) {
      const autoRunBtn = document.createElement("button");
      autoRunBtn.className = `action-btn auto-run ${strategy.autoRun ? "active" : ""}`;
      autoRunBtn.innerHTML = ICONS.autoRun;
      autoRunBtn.title = `Auto Run: ${strategy.autoRun ? "ON" : "OFF"}`;
      autoRunBtn.style.marginLeft = "auto";
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
    const checkbox = row.querySelector('input[type="checkbox"]');
    checkbox?.addEventListener("change", async (e) => {
      const checked = e.target.checked;
      row.classList.toggle("active", checked);
      logInfo("Strategy toggled", { id: strategy.id, checked });
      if (preferences) {
        const currentSorting = getSelectedSorting();
        preferences.sorting = currentSorting;
        await sendMessage("savePreferences", { sorting: currentSorting });
      }
    });
    row.addEventListener("click", (e) => {
      if (e.target.closest(".action-btn")) return;
      if (e.target !== checkbox) {
        checkbox.click();
      }
    });
    addDnDListeners(row);
    container.appendChild(row);
  });
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
      preferences.sorting = currentSorting;
      await sendMessage("savePreferences", { sorting: currentSorting });
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
setupContainerDnD(allStrategiesContainer);
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
var updateUI = (stateData, currentWindow, chromeWindows) => {
  preferences = stateData.preferences;
  if (preferences) {
    const s = preferences.sorting || [];
    setLoggerPreferences(preferences);
    const allStrategies = getStrategies(preferences.customStrategies);
    renderStrategyList(allStrategiesContainer, allStrategies, s);
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
        updateUI(localRes.data, cw, aw);
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
var getStrategyIds = (container) => {
  return Array.from(container.children).filter((row) => row.querySelector('input[type="checkbox"]').checked).map((row) => row.dataset.id);
};
var getSelectedSorting = () => {
  return getStrategyIds(allStrategiesContainer);
};
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
toggleStrategies.addEventListener("click", () => {
  const isCollapsed = strategiesList.classList.toggle("collapsed");
  toggleStrategies.classList.toggle("collapsed", isCollapsed);
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
adjustForWindowType();
loadState().catch((e) => console.error("Load state failed", e));
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3NoYXJlZC91dGlscy50cyIsICIuLi8uLi9zcmMvc2hhcmVkL3N0cmF0ZWd5UmVnaXN0cnkudHMiLCAiLi4vLi4vc3JjL3NoYXJlZC9sb2dnZXIudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZ3JvdXBpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3NvcnRpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy91aS9sb2NhbFN0YXRlLnRzIiwgIi4uLy4uL3NyYy91aS9jb21tb24udHMiLCAiLi4vLi4vc3JjL3VpL3BvcHVwLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyBQcmVmZXJlbmNlcywgU29ydGluZ1N0cmF0ZWd5LCBUYWJNZXRhZGF0YSB9IGZyb20gXCIuL3R5cGVzLmpzXCI7XG5cbmV4cG9ydCBjb25zdCBtYXBDaHJvbWVUYWIgPSAodGFiOiBjaHJvbWUudGFicy5UYWIpOiBUYWJNZXRhZGF0YSB8IG51bGwgPT4ge1xuICBpZiAoIXRhYi5pZCB8fCAhdGFiLndpbmRvd0lkKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHtcbiAgICBpZDogdGFiLmlkLFxuICAgIHdpbmRvd0lkOiB0YWIud2luZG93SWQsXG4gICAgdGl0bGU6IHRhYi50aXRsZSB8fCBcIlVudGl0bGVkXCIsXG4gICAgdXJsOiB0YWIudXJsIHx8IFwiYWJvdXQ6YmxhbmtcIixcbiAgICBwaW5uZWQ6IEJvb2xlYW4odGFiLnBpbm5lZCksXG4gICAgbGFzdEFjY2Vzc2VkOiB0YWIubGFzdEFjY2Vzc2VkLFxuICAgIG9wZW5lclRhYklkOiB0YWIub3BlbmVyVGFiSWQgPz8gdW5kZWZpbmVkLFxuICAgIGZhdkljb25Vcmw6IHRhYi5mYXZJY29uVXJsLFxuICAgIGdyb3VwSWQ6IHRhYi5ncm91cElkLFxuICAgIGluZGV4OiB0YWIuaW5kZXgsXG4gICAgYWN0aXZlOiB0YWIuYWN0aXZlLFxuICAgIHN0YXR1czogdGFiLnN0YXR1cyxcbiAgICBzZWxlY3RlZDogdGFiLmhpZ2hsaWdodGVkXG4gIH07XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0U3RvcmVkUHJlZmVyZW5jZXMgPSBhc3luYyAoKTogUHJvbWlzZTxQcmVmZXJlbmNlcyB8IG51bGw+ID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFwicHJlZmVyZW5jZXNcIiwgKGl0ZW1zKSA9PiB7XG4gICAgICByZXNvbHZlKChpdGVtc1tcInByZWZlcmVuY2VzXCJdIGFzIFByZWZlcmVuY2VzKSA/PyBudWxsKTtcbiAgICB9KTtcbiAgfSk7XG59O1xuXG5leHBvcnQgY29uc3QgYXNBcnJheSA9IDxUPih2YWx1ZTogdW5rbm93bik6IFRbXSA9PiB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSByZXR1cm4gdmFsdWUgYXMgVFtdO1xuICAgIHJldHVybiBbXTtcbn07XG4iLCAiaW1wb3J0IHsgQ3VzdG9tU3RyYXRlZ3ksIFNvcnRpbmdTdHJhdGVneSB9IGZyb20gXCIuL3R5cGVzLmpzXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RyYXRlZ3lEZWZpbml0aW9uIHtcbiAgICBpZDogU29ydGluZ1N0cmF0ZWd5IHwgc3RyaW5nO1xuICAgIGxhYmVsOiBzdHJpbmc7XG4gICAgaXNHcm91cGluZzogYm9vbGVhbjtcbiAgICBpc1NvcnRpbmc6IGJvb2xlYW47XG4gICAgdGFncz86IHN0cmluZ1tdO1xuICAgIGF1dG9SdW4/OiBib29sZWFuO1xuICAgIGlzQ3VzdG9tPzogYm9vbGVhbjtcbn1cblxuLy8gUmVzdG9yZWQgc3RyYXRlZ2llcyBtYXRjaGluZyBiYWNrZ3JvdW5kIGNhcGFiaWxpdGllcy5cbmV4cG9ydCBjb25zdCBTVFJBVEVHSUVTOiBTdHJhdGVneURlZmluaXRpb25bXSA9IFtcbiAgICB7IGlkOiBcImRvbWFpblwiLCBsYWJlbDogXCJEb21haW5cIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImRvbWFpbl9mdWxsXCIsIGxhYmVsOiBcIkZ1bGwgRG9tYWluXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJ0b3BpY1wiLCBsYWJlbDogXCJUb3BpY1wiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwiY29udGV4dFwiLCBsYWJlbDogXCJDb250ZXh0XCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJsaW5lYWdlXCIsIGxhYmVsOiBcIkxpbmVhZ2VcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInBpbm5lZFwiLCBsYWJlbDogXCJQaW5uZWRcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInJlY2VuY3lcIiwgbGFiZWw6IFwiUmVjZW5jeVwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwiYWdlXCIsIGxhYmVsOiBcIkFnZVwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwidXJsXCIsIGxhYmVsOiBcIlVSTFwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwibmVzdGluZ1wiLCBsYWJlbDogXCJOZXN0aW5nXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJ0aXRsZVwiLCBsYWJlbDogXCJUaXRsZVwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuXTtcblxuZXhwb3J0IGNvbnN0IGdldFN0cmF0ZWdpZXMgPSAoY3VzdG9tU3RyYXRlZ2llcz86IEN1c3RvbVN0cmF0ZWd5W10pOiBTdHJhdGVneURlZmluaXRpb25bXSA9PiB7XG4gICAgaWYgKCFjdXN0b21TdHJhdGVnaWVzIHx8IGN1c3RvbVN0cmF0ZWdpZXMubGVuZ3RoID09PSAwKSByZXR1cm4gU1RSQVRFR0lFUztcblxuICAgIC8vIEN1c3RvbSBzdHJhdGVnaWVzIGNhbiBvdmVycmlkZSBidWlsdC1pbnMgaWYgSURzIG1hdGNoLCBvciBhZGQgbmV3IG9uZXMuXG4gICAgY29uc3QgY29tYmluZWQgPSBbLi4uU1RSQVRFR0lFU107XG5cbiAgICBjdXN0b21TdHJhdGVnaWVzLmZvckVhY2goY3VzdG9tID0+IHtcbiAgICAgICAgY29uc3QgZXhpc3RpbmdJbmRleCA9IGNvbWJpbmVkLmZpbmRJbmRleChzID0+IHMuaWQgPT09IGN1c3RvbS5pZCk7XG5cbiAgICAgICAgLy8gRGV0ZXJtaW5lIGNhcGFiaWxpdGllcyBiYXNlZCBvbiBydWxlcyBwcmVzZW5jZVxuICAgICAgICBjb25zdCBoYXNHcm91cGluZyA9IChjdXN0b20uZ3JvdXBpbmdSdWxlcyAmJiBjdXN0b20uZ3JvdXBpbmdSdWxlcy5sZW5ndGggPiAwKSB8fCAoY3VzdG9tLnJ1bGVzICYmIGN1c3RvbS5ydWxlcy5sZW5ndGggPiAwKSB8fCBmYWxzZTtcbiAgICAgICAgY29uc3QgaGFzU29ydGluZyA9IChjdXN0b20uc29ydGluZ1J1bGVzICYmIGN1c3RvbS5zb3J0aW5nUnVsZXMubGVuZ3RoID4gMCkgfHwgKGN1c3RvbS5ydWxlcyAmJiBjdXN0b20ucnVsZXMubGVuZ3RoID4gMCkgfHwgZmFsc2U7XG5cbiAgICAgICAgY29uc3QgdGFnczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgaWYgKGhhc0dyb3VwaW5nKSB0YWdzLnB1c2goXCJncm91cFwiKTtcbiAgICAgICAgaWYgKGhhc1NvcnRpbmcpIHRhZ3MucHVzaChcInNvcnRcIik7XG5cbiAgICAgICAgY29uc3QgZGVmaW5pdGlvbjogU3RyYXRlZ3lEZWZpbml0aW9uID0ge1xuICAgICAgICAgICAgaWQ6IGN1c3RvbS5pZCxcbiAgICAgICAgICAgIGxhYmVsOiBjdXN0b20ubGFiZWwsXG4gICAgICAgICAgICBpc0dyb3VwaW5nOiBoYXNHcm91cGluZyxcbiAgICAgICAgICAgIGlzU29ydGluZzogaGFzU29ydGluZyxcbiAgICAgICAgICAgIHRhZ3M6IHRhZ3MsXG4gICAgICAgICAgICBhdXRvUnVuOiBjdXN0b20uYXV0b1J1bixcbiAgICAgICAgICAgIGlzQ3VzdG9tOiB0cnVlXG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKGV4aXN0aW5nSW5kZXggIT09IC0xKSB7XG4gICAgICAgICAgICBjb21iaW5lZFtleGlzdGluZ0luZGV4XSA9IGRlZmluaXRpb247XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb21iaW5lZC5wdXNoKGRlZmluaXRpb24pO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gY29tYmluZWQ7XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0U3RyYXRlZ3kgPSAoaWQ6IFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZyk6IFN0cmF0ZWd5RGVmaW5pdGlvbiB8IHVuZGVmaW5lZCA9PiBTVFJBVEVHSUVTLmZpbmQocyA9PiBzLmlkID09PSBpZCk7XG4iLCAiaW1wb3J0IHsgTG9nRW50cnksIExvZ0xldmVsLCBQcmVmZXJlbmNlcyB9IGZyb20gXCIuL3R5cGVzLmpzXCI7XG5cbmNvbnN0IFBSRUZJWCA9IFwiW1RhYlNvcnRlcl1cIjtcblxuY29uc3QgTEVWRUxfUFJJT1JJVFk6IFJlY29yZDxMb2dMZXZlbCwgbnVtYmVyPiA9IHtcbiAgZGVidWc6IDAsXG4gIGluZm86IDEsXG4gIHdhcm46IDIsXG4gIGVycm9yOiAzLFxuICBjcml0aWNhbDogNFxufTtcblxubGV0IGN1cnJlbnRMZXZlbDogTG9nTGV2ZWwgPSBcImluZm9cIjtcbmxldCBsb2dzOiBMb2dFbnRyeVtdID0gW107XG5jb25zdCBNQVhfTE9HUyA9IDEwMDA7XG5jb25zdCBTVE9SQUdFX0tFWSA9IFwic2Vzc2lvbkxvZ3NcIjtcblxuLy8gU2FmZSBjb250ZXh0IGNoZWNrXG5jb25zdCBpc1NlcnZpY2VXb3JrZXIgPSB0eXBlb2Ygc2VsZiAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVvZiAoc2VsZiBhcyBhbnkpLlNlcnZpY2VXb3JrZXJHbG9iYWxTY29wZSAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYgaW5zdGFuY2VvZiAoc2VsZiBhcyBhbnkpLlNlcnZpY2VXb3JrZXJHbG9iYWxTY29wZTtcbmxldCBpc1NhdmluZyA9IGZhbHNlO1xubGV0IHBlbmRpbmdTYXZlID0gZmFsc2U7XG5sZXQgc2F2ZVRpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsO1xuXG5jb25zdCBkb1NhdmUgPSAoKSA9PiB7XG4gICAgaWYgKCFpc1NlcnZpY2VXb3JrZXIgfHwgIWNocm9tZT8uc3RvcmFnZT8uc2Vzc2lvbiB8fCBpc1NhdmluZykge1xuICAgICAgICBwZW5kaW5nU2F2ZSA9IHRydWU7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpc1NhdmluZyA9IHRydWU7XG4gICAgcGVuZGluZ1NhdmUgPSBmYWxzZTtcblxuICAgIGNocm9tZS5zdG9yYWdlLnNlc3Npb24uc2V0KHsgW1NUT1JBR0VfS0VZXTogbG9ncyB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgaXNTYXZpbmcgPSBmYWxzZTtcbiAgICAgICAgaWYgKHBlbmRpbmdTYXZlKSB7XG4gICAgICAgICAgICBzYXZlTG9nc1RvU3RvcmFnZSgpO1xuICAgICAgICB9XG4gICAgfSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBzYXZlIGxvZ3NcIiwgZXJyKTtcbiAgICAgICAgaXNTYXZpbmcgPSBmYWxzZTtcbiAgICB9KTtcbn07XG5cbmNvbnN0IHNhdmVMb2dzVG9TdG9yYWdlID0gKCkgPT4ge1xuICAgIGlmIChzYXZlVGltZXIpIGNsZWFyVGltZW91dChzYXZlVGltZXIpO1xuICAgIHNhdmVUaW1lciA9IHNldFRpbWVvdXQoZG9TYXZlLCAxMDAwKTtcbn07XG5cbmxldCByZXNvbHZlTG9nZ2VyUmVhZHk6ICgpID0+IHZvaWQ7XG5leHBvcnQgY29uc3QgbG9nZ2VyUmVhZHkgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcbiAgICByZXNvbHZlTG9nZ2VyUmVhZHkgPSByZXNvbHZlO1xufSk7XG5cbmV4cG9ydCBjb25zdCBpbml0TG9nZ2VyID0gYXN5bmMgKCkgPT4ge1xuICAgIGlmIChpc1NlcnZpY2VXb3JrZXIgJiYgY2hyb21lPy5zdG9yYWdlPy5zZXNzaW9uKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjaHJvbWUuc3RvcmFnZS5zZXNzaW9uLmdldChTVE9SQUdFX0tFWSk7XG4gICAgICAgICAgICBpZiAocmVzdWx0W1NUT1JBR0VfS0VZXSAmJiBBcnJheS5pc0FycmF5KHJlc3VsdFtTVE9SQUdFX0tFWV0pKSB7XG4gICAgICAgICAgICAgICAgbG9ncyA9IHJlc3VsdFtTVE9SQUdFX0tFWV07XG4gICAgICAgICAgICAgICAgaWYgKGxvZ3MubGVuZ3RoID4gTUFYX0xPR1MpIGxvZ3MgPSBsb2dzLnNsaWNlKDAsIE1BWF9MT0dTKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byByZXN0b3JlIGxvZ3NcIiwgZSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKHJlc29sdmVMb2dnZXJSZWFkeSkgcmVzb2x2ZUxvZ2dlclJlYWR5KCk7XG59O1xuXG5leHBvcnQgY29uc3Qgc2V0TG9nZ2VyUHJlZmVyZW5jZXMgPSAocHJlZnM6IFByZWZlcmVuY2VzKSA9PiB7XG4gIGlmIChwcmVmcy5sb2dMZXZlbCkge1xuICAgIGN1cnJlbnRMZXZlbCA9IHByZWZzLmxvZ0xldmVsO1xuICB9IGVsc2UgaWYgKHByZWZzLmRlYnVnKSB7XG4gICAgY3VycmVudExldmVsID0gXCJkZWJ1Z1wiO1xuICB9IGVsc2Uge1xuICAgIGN1cnJlbnRMZXZlbCA9IFwiaW5mb1wiO1xuICB9XG59O1xuXG5jb25zdCBzaG91bGRMb2cgPSAobGV2ZWw6IExvZ0xldmVsKTogYm9vbGVhbiA9PiB7XG4gIHJldHVybiBMRVZFTF9QUklPUklUWVtsZXZlbF0gPj0gTEVWRUxfUFJJT1JJVFlbY3VycmVudExldmVsXTtcbn07XG5cbmNvbnN0IGZvcm1hdE1lc3NhZ2UgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgcmV0dXJuIGNvbnRleHQgPyBgJHttZXNzYWdlfSA6OiAke0pTT04uc3RyaW5naWZ5KGNvbnRleHQpfWAgOiBtZXNzYWdlO1xufTtcblxuY29uc3QgYWRkTG9nID0gKGxldmVsOiBMb2dMZXZlbCwgbWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgLy8gQWx3YXlzIGFkZCB0byBidWZmZXIgcmVnYXJkbGVzcyBvZiBjdXJyZW50IGNvbnNvbGUgbGV2ZWwgc2V0dGluZyxcbiAgLy8gb3Igc2hvdWxkIHdlIHJlc3BlY3QgaXQ/IFVzdWFsbHkgZGVidWcgbG9ncyBhcmUgbm9pc3kuXG4gIC8vIExldCdzIHJlc3BlY3Qgc2hvdWxkTG9nIGZvciB0aGUgYnVmZmVyIHRvbyB0byBzYXZlIG1lbW9yeS9ub2lzZSxcbiAgLy8gT1Igd2UgY2FuIHN0b3JlIGV2ZXJ5dGhpbmcgYnV0IGZpbHRlciBvbiB2aWV3LlxuICAvLyBHaXZlbiB3ZSB3YW50IHRvIGRlYnVnIGlzc3Vlcywgc3RvcmluZyBldmVyeXRoaW5nIG1pZ2h0IGJlIGJldHRlcixcbiAgLy8gYnV0IGlmIHdlIHN0b3JlIGV2ZXJ5dGhpbmcgd2UgbWlnaHQgZmlsbCBidWZmZXIgd2l0aCBkZWJ1ZyBub2lzZSBxdWlja2x5LlxuICAvLyBMZXQncyBzdGljayB0byBzdG9yaW5nIHdoYXQgaXMgY29uZmlndXJlZCB0byBiZSBsb2dnZWQuXG4gIC8vIFdhaXQsIGlmIEkgd2FudCB0byBcImRlYnVnXCIgc29tZXRoaW5nLCBJIHVzdWFsbHkgdHVybiBvbiBkZWJ1ZyBsb2dzLlxuICAvLyBJZiBJIGNhbid0IHNlZSBwYXN0IGxvZ3MgYmVjYXVzZSB0aGV5IHdlcmVuJ3Qgc3RvcmVkLCBJIGhhdmUgdG8gcmVwcm8uXG4gIC8vIExldCdzIHN0b3JlIGlmIGl0IHBhc3NlcyBgc2hvdWxkTG9nYC5cblxuICBpZiAoc2hvdWxkTG9nKGxldmVsKSkge1xuICAgICAgY29uc3QgZW50cnk6IExvZ0VudHJ5ID0ge1xuICAgICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcbiAgICAgICAgICBsZXZlbCxcbiAgICAgICAgICBtZXNzYWdlLFxuICAgICAgICAgIGNvbnRleHRcbiAgICAgIH07XG5cbiAgICAgIGlmIChpc1NlcnZpY2VXb3JrZXIpIHtcbiAgICAgICAgICBsb2dzLnVuc2hpZnQoZW50cnkpO1xuICAgICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSB7XG4gICAgICAgICAgICAgIGxvZ3MucG9wKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIEluIG90aGVyIGNvbnRleHRzLCBzZW5kIHRvIFNXXG4gICAgICAgICAgaWYgKGNocm9tZT8ucnVudGltZT8uc2VuZE1lc3NhZ2UpIHtcbiAgICAgICAgICAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdsb2dFbnRyeScsIHBheWxvYWQ6IGVudHJ5IH0pLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgLy8gSWdub3JlIGlmIG1lc3NhZ2UgZmFpbHMgKGUuZy4gY29udGV4dCBpbnZhbGlkYXRlZClcbiAgICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICB9XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBhZGRMb2dFbnRyeSA9IChlbnRyeTogTG9nRW50cnkpID0+IHtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSB7XG4gICAgICAgIGxvZ3MudW5zaGlmdChlbnRyeSk7XG4gICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSB7XG4gICAgICAgICAgICBsb2dzLnBvcCgpO1xuICAgICAgICB9XG4gICAgICAgIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG4gICAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGdldExvZ3MgPSAoKSA9PiBbLi4ubG9nc107XG5leHBvcnQgY29uc3QgY2xlYXJMb2dzID0gKCkgPT4ge1xuICAgIGxvZ3MubGVuZ3RoID0gMDtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSBzYXZlTG9nc1RvU3RvcmFnZSgpO1xufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0RlYnVnID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImRlYnVnXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwiZGVidWdcIikpIHtcbiAgICBjb25zb2xlLmRlYnVnKGAke1BSRUZJWH0gW0RFQlVHXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgY29udGV4dCl9YCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBsb2dJbmZvID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImluZm9cIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJpbmZvXCIpKSB7XG4gICAgY29uc29sZS5pbmZvKGAke1BSRUZJWH0gW0lORk9dICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ1dhcm4gPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwid2FyblwiLCBtZXNzYWdlLCBjb250ZXh0KTtcbiAgaWYgKHNob3VsZExvZyhcIndhcm5cIikpIHtcbiAgICBjb25zb2xlLndhcm4oYCR7UFJFRklYfSBbV0FSTl0gJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nRXJyb3IgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwiZXJyb3JcIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJlcnJvclwiKSkge1xuICAgIGNvbnNvbGUuZXJyb3IoYCR7UFJFRklYfSBbRVJST1JdICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0NyaXRpY2FsID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImNyaXRpY2FsXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwiY3JpdGljYWxcIikpIHtcbiAgICAvLyBDcml0aWNhbCBsb2dzIHVzZSBlcnJvciBjb25zb2xlIGJ1dCB3aXRoIGRpc3RpbmN0IHByZWZpeCBhbmQgbWF5YmUgc3R5bGluZyBpZiBzdXBwb3J0ZWRcbiAgICBjb25zb2xlLmVycm9yKGAke1BSRUZJWH0gW0NSSVRJQ0FMXSBcdUQ4M0RcdURFQTggJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuIiwgImltcG9ydCB7IEdyb3VwaW5nU3RyYXRlZ3ksIFNvcnRpbmdTdHJhdGVneSwgVGFiR3JvdXAsIFRhYk1ldGFkYXRhLCBDdXN0b21TdHJhdGVneSwgU3RyYXRlZ3lSdWxlLCBSdWxlQ29uZGl0aW9uLCBHcm91cGluZ1J1bGUsIFNvcnRpbmdSdWxlIH0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgZ2V0U3RyYXRlZ2llcyB9IGZyb20gXCIuLi9zaGFyZWQvc3RyYXRlZ3lSZWdpc3RyeS5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcblxubGV0IGN1c3RvbVN0cmF0ZWdpZXM6IEN1c3RvbVN0cmF0ZWd5W10gPSBbXTtcblxuZXhwb3J0IGNvbnN0IHNldEN1c3RvbVN0cmF0ZWdpZXMgPSAoc3RyYXRlZ2llczogQ3VzdG9tU3RyYXRlZ3lbXSkgPT4ge1xuICAgIGN1c3RvbVN0cmF0ZWdpZXMgPSBzdHJhdGVnaWVzO1xufTtcblxuZXhwb3J0IGNvbnN0IGdldEN1c3RvbVN0cmF0ZWdpZXMgPSAoKTogQ3VzdG9tU3RyYXRlZ3lbXSA9PiBjdXN0b21TdHJhdGVnaWVzO1xuXG5jb25zdCBDT0xPUlMgPSBbXCJncmV5XCIsIFwiYmx1ZVwiLCBcInJlZFwiLCBcInllbGxvd1wiLCBcImdyZWVuXCIsIFwicGlua1wiLCBcInB1cnBsZVwiLCBcImN5YW5cIiwgXCJvcmFuZ2VcIl07XG5cbmNvbnN0IHJlZ2V4Q2FjaGUgPSBuZXcgTWFwPHN0cmluZywgUmVnRXhwPigpO1xuXG5leHBvcnQgY29uc3QgZG9tYWluRnJvbVVybCA9ICh1cmw6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcGFyc2VkID0gbmV3IFVSTCh1cmwpO1xuICAgIHJldHVybiBwYXJzZWQuaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sIFwiXCIpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGxvZ0RlYnVnKFwiRmFpbGVkIHRvIHBhcnNlIGRvbWFpblwiLCB7IHVybCwgZXJyb3I6IFN0cmluZyhlcnJvcikgfSk7XG4gICAgcmV0dXJuIFwidW5rbm93blwiO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3Qgc3ViZG9tYWluRnJvbVVybCA9ICh1cmw6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcGFyc2VkID0gbmV3IFVSTCh1cmwpO1xuICAgICAgICBsZXQgaG9zdG5hbWUgPSBwYXJzZWQuaG9zdG5hbWU7XG4gICAgICAgIC8vIFJlbW92ZSB3d3cuXG4gICAgICAgIGhvc3RuYW1lID0gaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sIFwiXCIpO1xuXG4gICAgICAgIGNvbnN0IHBhcnRzID0gaG9zdG5hbWUuc3BsaXQoJy4nKTtcbiAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDIpIHtcbiAgICAgICAgICAgICByZXR1cm4gcGFydHMuc2xpY2UoMCwgcGFydHMubGVuZ3RoIC0gMikuam9pbignLicpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBcIlwiO1xuICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gXCJcIjtcbiAgICB9XG59XG5cbmV4cG9ydCBjb25zdCBnZXRGaWVsZFZhbHVlID0gKHRhYjogVGFiTWV0YWRhdGEsIGZpZWxkOiBzdHJpbmcpOiBhbnkgPT4ge1xuICAgIHN3aXRjaChmaWVsZCkge1xuICAgICAgICBjYXNlICdpZCc6IHJldHVybiB0YWIuaWQ7XG4gICAgICAgIGNhc2UgJ2luZGV4JzogcmV0dXJuIHRhYi5pbmRleDtcbiAgICAgICAgY2FzZSAnd2luZG93SWQnOiByZXR1cm4gdGFiLndpbmRvd0lkO1xuICAgICAgICBjYXNlICdncm91cElkJzogcmV0dXJuIHRhYi5ncm91cElkO1xuICAgICAgICBjYXNlICd0aXRsZSc6IHJldHVybiB0YWIudGl0bGU7XG4gICAgICAgIGNhc2UgJ3VybCc6IHJldHVybiB0YWIudXJsO1xuICAgICAgICBjYXNlICdzdGF0dXMnOiByZXR1cm4gdGFiLnN0YXR1cztcbiAgICAgICAgY2FzZSAnYWN0aXZlJzogcmV0dXJuIHRhYi5hY3RpdmU7XG4gICAgICAgIGNhc2UgJ3NlbGVjdGVkJzogcmV0dXJuIHRhYi5zZWxlY3RlZDtcbiAgICAgICAgY2FzZSAncGlubmVkJzogcmV0dXJuIHRhYi5waW5uZWQ7XG4gICAgICAgIGNhc2UgJ29wZW5lclRhYklkJzogcmV0dXJuIHRhYi5vcGVuZXJUYWJJZDtcbiAgICAgICAgY2FzZSAnbGFzdEFjY2Vzc2VkJzogcmV0dXJuIHRhYi5sYXN0QWNjZXNzZWQ7XG4gICAgICAgIGNhc2UgJ2NvbnRleHQnOiByZXR1cm4gdGFiLmNvbnRleHQ7XG4gICAgICAgIGNhc2UgJ2dlbnJlJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uZ2VucmU7XG4gICAgICAgIGNhc2UgJ3NpdGVOYW1lJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uc2l0ZU5hbWU7XG4gICAgICAgIC8vIERlcml2ZWQgb3IgbWFwcGVkIGZpZWxkc1xuICAgICAgICBjYXNlICdkb21haW4nOiByZXR1cm4gZG9tYWluRnJvbVVybCh0YWIudXJsKTtcbiAgICAgICAgY2FzZSAnc3ViZG9tYWluJzogcmV0dXJuIHN1YmRvbWFpbkZyb21VcmwodGFiLnVybCk7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBpZiAoZmllbGQuaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICAgICAgICAgICByZXR1cm4gZmllbGQuc3BsaXQoJy4nKS5yZWR1Y2UoKG9iaiwga2V5KSA9PiAob2JqICYmIHR5cGVvZiBvYmogPT09ICdvYmplY3QnICYmIG9iaiAhPT0gbnVsbCkgPyAob2JqIGFzIGFueSlba2V5XSA6IHVuZGVmaW5lZCwgdGFiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiAodGFiIGFzIGFueSlbZmllbGRdO1xuICAgIH1cbn07XG5cbmNvbnN0IHN0cmlwVGxkID0gKGRvbWFpbjogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIGRvbWFpbi5yZXBsYWNlKC9cXC4oY29tfG9yZ3xnb3Z8bmV0fGVkdXxpbykkL2ksIFwiXCIpO1xufTtcblxuZXhwb3J0IGNvbnN0IHNlbWFudGljQnVja2V0ID0gKHRpdGxlOiBzdHJpbmcsIHVybDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3Qga2V5ID0gYCR7dGl0bGV9ICR7dXJsfWAudG9Mb3dlckNhc2UoKTtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImRvY1wiKSB8fCBrZXkuaW5jbHVkZXMoXCJyZWFkbWVcIikgfHwga2V5LmluY2x1ZGVzKFwiZ3VpZGVcIikpIHJldHVybiBcIkRvY3NcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcIm1haWxcIikgfHwga2V5LmluY2x1ZGVzKFwiaW5ib3hcIikpIHJldHVybiBcIkNoYXRcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImRhc2hib2FyZFwiKSB8fCBrZXkuaW5jbHVkZXMoXCJjb25zb2xlXCIpKSByZXR1cm4gXCJEYXNoXCI7XG4gIGlmIChrZXkuaW5jbHVkZXMoXCJpc3N1ZVwiKSB8fCBrZXkuaW5jbHVkZXMoXCJ0aWNrZXRcIikpIHJldHVybiBcIlRhc2tzXCI7XG4gIGlmIChrZXkuaW5jbHVkZXMoXCJkcml2ZVwiKSB8fCBrZXkuaW5jbHVkZXMoXCJzdG9yYWdlXCIpKSByZXR1cm4gXCJGaWxlc1wiO1xuICByZXR1cm4gXCJNaXNjXCI7XG59O1xuXG5leHBvcnQgY29uc3QgbmF2aWdhdGlvbktleSA9ICh0YWI6IFRhYk1ldGFkYXRhKTogc3RyaW5nID0+IHtcbiAgaWYgKHRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIGBjaGlsZC1vZi0ke3RhYi5vcGVuZXJUYWJJZH1gO1xuICB9XG4gIHJldHVybiBgd2luZG93LSR7dGFiLndpbmRvd0lkfWA7XG59O1xuXG5jb25zdCBnZXRSZWNlbmN5TGFiZWwgPSAobGFzdEFjY2Vzc2VkOiBudW1iZXIpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICBjb25zdCBkaWZmID0gbm93IC0gbGFzdEFjY2Vzc2VkO1xuICBpZiAoZGlmZiA8IDM2MDAwMDApIHJldHVybiBcIkp1c3Qgbm93XCI7IC8vIDFoXG4gIGlmIChkaWZmIDwgODY0MDAwMDApIHJldHVybiBcIlRvZGF5XCI7IC8vIDI0aFxuICBpZiAoZGlmZiA8IDE3MjgwMDAwMCkgcmV0dXJuIFwiWWVzdGVyZGF5XCI7IC8vIDQ4aFxuICBpZiAoZGlmZiA8IDYwNDgwMDAwMCkgcmV0dXJuIFwiVGhpcyBXZWVrXCI7IC8vIDdkXG4gIHJldHVybiBcIk9sZGVyXCI7XG59O1xuXG5jb25zdCBjb2xvckZvcktleSA9IChrZXk6IHN0cmluZywgb2Zmc2V0OiBudW1iZXIpOiBzdHJpbmcgPT4gQ09MT1JTWyhNYXRoLmFicyhoYXNoQ29kZShrZXkpKSArIG9mZnNldCkgJSBDT0xPUlMubGVuZ3RoXTtcblxuY29uc3QgaGFzaENvZGUgPSAodmFsdWU6IHN0cmluZyk6IG51bWJlciA9PiB7XG4gIGxldCBoYXNoID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB2YWx1ZS5sZW5ndGg7IGkgKz0gMSkge1xuICAgIGhhc2ggPSAoaGFzaCA8PCA1KSAtIGhhc2ggKyB2YWx1ZS5jaGFyQ29kZUF0KGkpO1xuICAgIGhhc2ggfD0gMDtcbiAgfVxuICByZXR1cm4gaGFzaDtcbn07XG5cbi8vIEhlbHBlciB0byBnZXQgYSBodW1hbi1yZWFkYWJsZSBsYWJlbCBjb21wb25lbnQgZnJvbSBhIHN0cmF0ZWd5IGFuZCBhIHNldCBvZiB0YWJzXG5jb25zdCBnZXRMYWJlbENvbXBvbmVudCA9IChzdHJhdGVneTogR3JvdXBpbmdTdHJhdGVneSB8IHN0cmluZywgdGFiczogVGFiTWV0YWRhdGFbXSwgYWxsVGFic01hcDogTWFwPG51bWJlciwgVGFiTWV0YWRhdGE+KTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gIGNvbnN0IGZpcnN0VGFiID0gdGFic1swXTtcbiAgaWYgKCFmaXJzdFRhYikgcmV0dXJuIFwiVW5rbm93blwiO1xuXG4gIC8vIENoZWNrIGN1c3RvbSBzdHJhdGVnaWVzIGZpcnN0XG4gIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5KTtcbiAgaWYgKGN1c3RvbSkge1xuICAgICAgcmV0dXJuIGdyb3VwaW5nS2V5KGZpcnN0VGFiLCBzdHJhdGVneSk7XG4gIH1cblxuICBzd2l0Y2ggKHN0cmF0ZWd5KSB7XG4gICAgY2FzZSBcImRvbWFpblwiOiB7XG4gICAgICBjb25zdCBzaXRlTmFtZXMgPSBuZXcgU2V0KHRhYnMubWFwKHQgPT4gdC5jb250ZXh0RGF0YT8uc2l0ZU5hbWUpLmZpbHRlcihCb29sZWFuKSk7XG4gICAgICBpZiAoc2l0ZU5hbWVzLnNpemUgPT09IDEpIHtcbiAgICAgICAgcmV0dXJuIHN0cmlwVGxkKEFycmF5LmZyb20oc2l0ZU5hbWVzKVswXSBhcyBzdHJpbmcpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHN0cmlwVGxkKGRvbWFpbkZyb21VcmwoZmlyc3RUYWIudXJsKSk7XG4gICAgfVxuICAgIGNhc2UgXCJkb21haW5fZnVsbFwiOlxuICAgICAgcmV0dXJuIGRvbWFpbkZyb21VcmwoZmlyc3RUYWIudXJsKTtcbiAgICBjYXNlIFwidG9waWNcIjpcbiAgICAgIHJldHVybiBzZW1hbnRpY0J1Y2tldChmaXJzdFRhYi50aXRsZSwgZmlyc3RUYWIudXJsKTtcbiAgICBjYXNlIFwibGluZWFnZVwiOlxuICAgICAgaWYgKGZpcnN0VGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgY29uc3QgcGFyZW50ID0gYWxsVGFic01hcC5nZXQoZmlyc3RUYWIub3BlbmVyVGFiSWQpO1xuICAgICAgICBpZiAocGFyZW50KSB7XG4gICAgICAgICAgY29uc3QgcGFyZW50VGl0bGUgPSBwYXJlbnQudGl0bGUubGVuZ3RoID4gMjAgPyBwYXJlbnQudGl0bGUuc3Vic3RyaW5nKDAsIDIwKSArIFwiLi4uXCIgOiBwYXJlbnQudGl0bGU7XG4gICAgICAgICAgcmV0dXJuIGBGcm9tOiAke3BhcmVudFRpdGxlfWA7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGBGcm9tOiBUYWIgJHtmaXJzdFRhYi5vcGVuZXJUYWJJZH1gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGBXaW5kb3cgJHtmaXJzdFRhYi53aW5kb3dJZH1gO1xuICAgIGNhc2UgXCJjb250ZXh0XCI6XG4gICAgICByZXR1cm4gZmlyc3RUYWIuY29udGV4dCB8fCBcIlVuY2F0ZWdvcml6ZWRcIjtcbiAgICBjYXNlIFwicGlubmVkXCI6XG4gICAgICByZXR1cm4gZmlyc3RUYWIucGlubmVkID8gXCJQaW5uZWRcIiA6IFwiVW5waW5uZWRcIjtcbiAgICBjYXNlIFwiYWdlXCI6XG4gICAgICByZXR1cm4gZ2V0UmVjZW5jeUxhYmVsKGZpcnN0VGFiLmxhc3RBY2Nlc3NlZCA/PyAwKTtcbiAgICBjYXNlIFwidXJsXCI6XG4gICAgICByZXR1cm4gXCJVUkwgR3JvdXBcIjtcbiAgICBjYXNlIFwicmVjZW5jeVwiOlxuICAgICAgcmV0dXJuIFwiVGltZSBHcm91cFwiO1xuICAgIGNhc2UgXCJuZXN0aW5nXCI6XG4gICAgICByZXR1cm4gZmlyc3RUYWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCA/IFwiQ2hpbGRyZW5cIiA6IFwiUm9vdHNcIjtcbiAgICBkZWZhdWx0OlxuICAgICAgY29uc3QgdmFsID0gZ2V0RmllbGRWYWx1ZShmaXJzdFRhYiwgc3RyYXRlZ3kpO1xuICAgICAgaWYgKHZhbCAhPT0gdW5kZWZpbmVkICYmIHZhbCAhPT0gbnVsbCkge1xuICAgICAgICAgIHJldHVybiBTdHJpbmcodmFsKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBcIlVua25vd25cIjtcbiAgfVxufTtcblxuY29uc3QgZ2VuZXJhdGVMYWJlbCA9IChcbiAgc3RyYXRlZ2llczogKEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcpW10sXG4gIHRhYnM6IFRhYk1ldGFkYXRhW10sXG4gIGFsbFRhYnNNYXA6IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhPlxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgbGFiZWxzID0gc3RyYXRlZ2llc1xuICAgIC5tYXAocyA9PiBnZXRMYWJlbENvbXBvbmVudChzLCB0YWJzLCBhbGxUYWJzTWFwKSlcbiAgICAuZmlsdGVyKGwgPT4gbCAmJiBsICE9PSBcIlVua25vd25cIiAmJiBsICE9PSBcIkdyb3VwXCIgJiYgbCAhPT0gXCJVUkwgR3JvdXBcIiAmJiBsICE9PSBcIlRpbWUgR3JvdXBcIiAmJiBsICE9PSBcIk1pc2NcIik7XG5cbiAgaWYgKGxhYmVscy5sZW5ndGggPT09IDApIHJldHVybiBcIkdyb3VwXCI7XG4gIHJldHVybiBBcnJheS5mcm9tKG5ldyBTZXQobGFiZWxzKSkuam9pbihcIiAtIFwiKTtcbn07XG5cbmNvbnN0IGdldFN0cmF0ZWd5Q29sb3IgPSAoc3RyYXRlZ3lJZDogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkID0+IHtcbiAgICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneUlkKTtcbiAgICBpZiAoIWN1c3RvbSkgcmV0dXJuIHVuZGVmaW5lZDtcblxuICAgIGNvbnN0IGdyb3VwaW5nUnVsZXNMaXN0ID0gYXNBcnJheTxHcm91cGluZ1J1bGU+KGN1c3RvbS5ncm91cGluZ1J1bGVzKTtcbiAgICAvLyBJdGVyYXRlIG1hbnVhbGx5IHRvIGNoZWNrIGNvbG9yXG4gICAgZm9yIChsZXQgaSA9IGdyb3VwaW5nUnVsZXNMaXN0Lmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgIGNvbnN0IHJ1bGUgPSBncm91cGluZ1J1bGVzTGlzdFtpXTtcbiAgICAgICAgaWYgKHJ1bGUgJiYgcnVsZS5jb2xvciAmJiBydWxlLmNvbG9yICE9PSAncmFuZG9tJykge1xuICAgICAgICAgICAgcmV0dXJuIHJ1bGUuY29sb3I7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbn07XG5cbmNvbnN0IHJlc29sdmVXaW5kb3dNb2RlID0gKG1vZGVzOiAoc3RyaW5nIHwgdW5kZWZpbmVkKVtdKTogXCJjdXJyZW50XCIgfCBcIm5ld1wiIHwgXCJjb21wb3VuZFwiID0+IHtcbiAgICBpZiAobW9kZXMuaW5jbHVkZXMoXCJuZXdcIikpIHJldHVybiBcIm5ld1wiO1xuICAgIGlmIChtb2Rlcy5pbmNsdWRlcyhcImNvbXBvdW5kXCIpKSByZXR1cm4gXCJjb21wb3VuZFwiO1xuICAgIHJldHVybiBcImN1cnJlbnRcIjtcbn07XG5cbmV4cG9ydCBjb25zdCBncm91cFRhYnMgPSAoXG4gIHRhYnM6IFRhYk1ldGFkYXRhW10sXG4gIHN0cmF0ZWdpZXM6IChTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmcpW11cbik6IFRhYkdyb3VwW10gPT4ge1xuICBjb25zdCBhdmFpbGFibGVTdHJhdGVnaWVzID0gZ2V0U3RyYXRlZ2llcyhjdXN0b21TdHJhdGVnaWVzKTtcbiAgY29uc3QgZWZmZWN0aXZlU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gYXZhaWxhYmxlU3RyYXRlZ2llcy5maW5kKGF2YWlsID0+IGF2YWlsLmlkID09PSBzKT8uaXNHcm91cGluZyk7XG4gIGNvbnN0IGJ1Y2tldHMgPSBuZXcgTWFwPHN0cmluZywgVGFiR3JvdXA+KCk7XG5cbiAgY29uc3QgYWxsVGFic01hcCA9IG5ldyBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YT4oKTtcbiAgdGFicy5mb3JFYWNoKHQgPT4gYWxsVGFic01hcC5zZXQodC5pZCwgdCkpO1xuXG4gIHRhYnMuZm9yRWFjaCgodGFiKSA9PiB7XG4gICAgbGV0IGtleXM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgYXBwbGllZFN0cmF0ZWdpZXM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgY29sbGVjdGVkTW9kZXM6IHN0cmluZ1tdID0gW107XG5cbiAgICB0cnkge1xuICAgICAgICBmb3IgKGNvbnN0IHMgb2YgZWZmZWN0aXZlU3RyYXRlZ2llcykge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gZ2V0R3JvdXBpbmdSZXN1bHQodGFiLCBzKTtcbiAgICAgICAgICAgIGlmIChyZXN1bHQua2V5ICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAga2V5cy5wdXNoKGAke3N9OiR7cmVzdWx0LmtleX1gKTtcbiAgICAgICAgICAgICAgICBhcHBsaWVkU3RyYXRlZ2llcy5wdXNoKHMpO1xuICAgICAgICAgICAgICAgIGNvbGxlY3RlZE1vZGVzLnB1c2gocmVzdWx0Lm1vZGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGdlbmVyYXRpbmcgZ3JvdXBpbmcga2V5XCIsIHsgdGFiSWQ6IHRhYi5pZCwgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgcmV0dXJuOyAvLyBTa2lwIHRoaXMgdGFiIG9uIGVycm9yXG4gICAgfVxuXG4gICAgLy8gSWYgbm8gc3RyYXRlZ2llcyBhcHBsaWVkIChlLmcuIGFsbCBmaWx0ZXJlZCBvdXQpLCBza2lwIGdyb3VwaW5nIGZvciB0aGlzIHRhYlxuICAgIGlmIChrZXlzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgZWZmZWN0aXZlTW9kZSA9IHJlc29sdmVXaW5kb3dNb2RlKGNvbGxlY3RlZE1vZGVzKTtcbiAgICBjb25zdCB2YWx1ZUtleSA9IGtleXMuam9pbihcIjo6XCIpO1xuICAgIGxldCBidWNrZXRLZXkgPSBcIlwiO1xuICAgIGlmIChlZmZlY3RpdmVNb2RlID09PSAnY3VycmVudCcpIHtcbiAgICAgICAgIGJ1Y2tldEtleSA9IGB3aW5kb3ctJHt0YWIud2luZG93SWR9OjpgICsgdmFsdWVLZXk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgIGJ1Y2tldEtleSA9IGBnbG9iYWw6OmAgKyB2YWx1ZUtleTtcbiAgICB9XG5cbiAgICBsZXQgZ3JvdXAgPSBidWNrZXRzLmdldChidWNrZXRLZXkpO1xuICAgIGlmICghZ3JvdXApIHtcbiAgICAgIGxldCBncm91cENvbG9yID0gbnVsbDtcbiAgICAgIGZvciAoY29uc3Qgc0lkIG9mIGFwcGxpZWRTdHJhdGVnaWVzKSB7XG4gICAgICAgIGNvbnN0IGNvbG9yID0gZ2V0U3RyYXRlZ3lDb2xvcihzSWQpO1xuICAgICAgICBpZiAoY29sb3IpIHsgZ3JvdXBDb2xvciA9IGNvbG9yOyBicmVhazsgfVxuICAgICAgfVxuXG4gICAgICBpZiAoZ3JvdXBDb2xvciA9PT0gJ21hdGNoJykge1xuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkodmFsdWVLZXksIDApO1xuICAgICAgfSBlbHNlIGlmICghZ3JvdXBDb2xvcikge1xuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkoYnVja2V0S2V5LCBidWNrZXRzLnNpemUpO1xuICAgICAgfVxuXG4gICAgICBncm91cCA9IHtcbiAgICAgICAgaWQ6IGJ1Y2tldEtleSxcbiAgICAgICAgd2luZG93SWQ6IHRhYi53aW5kb3dJZCxcbiAgICAgICAgbGFiZWw6IFwiXCIsXG4gICAgICAgIGNvbG9yOiBncm91cENvbG9yLFxuICAgICAgICB0YWJzOiBbXSxcbiAgICAgICAgcmVhc29uOiBhcHBsaWVkU3RyYXRlZ2llcy5qb2luKFwiICsgXCIpLFxuICAgICAgICB3aW5kb3dNb2RlOiBlZmZlY3RpdmVNb2RlXG4gICAgICB9O1xuICAgICAgYnVja2V0cy5zZXQoYnVja2V0S2V5LCBncm91cCk7XG4gICAgfVxuICAgIGdyb3VwLnRhYnMucHVzaCh0YWIpO1xuICB9KTtcblxuICBjb25zdCBncm91cHMgPSBBcnJheS5mcm9tKGJ1Y2tldHMudmFsdWVzKCkpO1xuICBncm91cHMuZm9yRWFjaChncm91cCA9PiB7XG4gICAgZ3JvdXAubGFiZWwgPSBnZW5lcmF0ZUxhYmVsKGVmZmVjdGl2ZVN0cmF0ZWdpZXMsIGdyb3VwLnRhYnMsIGFsbFRhYnNNYXApO1xuICB9KTtcblxuICByZXR1cm4gZ3JvdXBzO1xufTtcblxuZXhwb3J0IGNvbnN0IGNoZWNrQ29uZGl0aW9uID0gKGNvbmRpdGlvbjogUnVsZUNvbmRpdGlvbiwgdGFiOiBUYWJNZXRhZGF0YSk6IGJvb2xlYW4gPT4ge1xuICAgIGlmICghY29uZGl0aW9uKSByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgcmF3VmFsdWUgPSBnZXRGaWVsZFZhbHVlKHRhYiwgY29uZGl0aW9uLmZpZWxkKTtcbiAgICBjb25zdCB2YWx1ZVRvQ2hlY2sgPSByYXdWYWx1ZSAhPT0gdW5kZWZpbmVkICYmIHJhd1ZhbHVlICE9PSBudWxsID8gU3RyaW5nKHJhd1ZhbHVlKS50b0xvd2VyQ2FzZSgpIDogXCJcIjtcbiAgICBjb25zdCBwYXR0ZXJuID0gY29uZGl0aW9uLnZhbHVlID8gY29uZGl0aW9uLnZhbHVlLnRvTG93ZXJDYXNlKCkgOiBcIlwiO1xuXG4gICAgc3dpdGNoIChjb25kaXRpb24ub3BlcmF0b3IpIHtcbiAgICAgICAgY2FzZSAnY29udGFpbnMnOiByZXR1cm4gdmFsdWVUb0NoZWNrLmluY2x1ZGVzKHBhdHRlcm4pO1xuICAgICAgICBjYXNlICdkb2VzTm90Q29udGFpbic6IHJldHVybiAhdmFsdWVUb0NoZWNrLmluY2x1ZGVzKHBhdHRlcm4pO1xuICAgICAgICBjYXNlICdlcXVhbHMnOiByZXR1cm4gdmFsdWVUb0NoZWNrID09PSBwYXR0ZXJuO1xuICAgICAgICBjYXNlICdzdGFydHNXaXRoJzogcmV0dXJuIHZhbHVlVG9DaGVjay5zdGFydHNXaXRoKHBhdHRlcm4pO1xuICAgICAgICBjYXNlICdlbmRzV2l0aCc6IHJldHVybiB2YWx1ZVRvQ2hlY2suZW5kc1dpdGgocGF0dGVybik7XG4gICAgICAgIGNhc2UgJ2V4aXN0cyc6IHJldHVybiByYXdWYWx1ZSAhPT0gdW5kZWZpbmVkO1xuICAgICAgICBjYXNlICdkb2VzTm90RXhpc3QnOiByZXR1cm4gcmF3VmFsdWUgPT09IHVuZGVmaW5lZDtcbiAgICAgICAgY2FzZSAnaXNOdWxsJzogcmV0dXJuIHJhd1ZhbHVlID09PSBudWxsO1xuICAgICAgICBjYXNlICdpc05vdE51bGwnOiByZXR1cm4gcmF3VmFsdWUgIT09IG51bGw7XG4gICAgICAgIGNhc2UgJ21hdGNoZXMnOlxuICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBSZWdFeHAoY29uZGl0aW9uLnZhbHVlLCAnaScpLnRlc3QocmF3VmFsdWUgIT09IHVuZGVmaW5lZCAmJiByYXdWYWx1ZSAhPT0gbnVsbCA/IFN0cmluZyhyYXdWYWx1ZSkgOiBcIlwiKTtcbiAgICAgICAgICAgICB9IGNhdGNoIHsgcmV0dXJuIGZhbHNlOyB9XG4gICAgICAgIGRlZmF1bHQ6IHJldHVybiBmYWxzZTtcbiAgICB9XG59O1xuXG5mdW5jdGlvbiBldmFsdWF0ZUxlZ2FjeVJ1bGVzKGxlZ2FjeVJ1bGVzOiBTdHJhdGVneVJ1bGVbXSwgdGFiOiBUYWJNZXRhZGF0YSk6IHN0cmluZyB8IG51bGwge1xuICAgIC8vIERlZmVuc2l2ZSBjaGVja1xuICAgIGlmICghbGVnYWN5UnVsZXMgfHwgIUFycmF5LmlzQXJyYXkobGVnYWN5UnVsZXMpKSB7XG4gICAgICAgIGlmICghbGVnYWN5UnVsZXMpIHJldHVybiBudWxsO1xuICAgICAgICAvLyBUcnkgYXNBcnJheSBpZiBpdCdzIG5vdCBhcnJheSBidXQgdHJ1dGh5ICh1bmxpa2VseSBnaXZlbiBwcmV2aW91cyBsb2dpYyBidXQgc2FmZSlcbiAgICB9XG5cbiAgICBjb25zdCBsZWdhY3lSdWxlc0xpc3QgPSBhc0FycmF5PFN0cmF0ZWd5UnVsZT4obGVnYWN5UnVsZXMpO1xuICAgIGlmIChsZWdhY3lSdWxlc0xpc3QubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcblxuICAgIHRyeSB7XG4gICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBsZWdhY3lSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgIGlmICghcnVsZSkgY29udGludWU7XG4gICAgICAgICAgICBjb25zdCByYXdWYWx1ZSA9IGdldEZpZWxkVmFsdWUodGFiLCBydWxlLmZpZWxkKTtcbiAgICAgICAgICAgIGxldCB2YWx1ZVRvQ2hlY2sgPSByYXdWYWx1ZSAhPT0gdW5kZWZpbmVkICYmIHJhd1ZhbHVlICE9PSBudWxsID8gU3RyaW5nKHJhd1ZhbHVlKSA6IFwiXCI7XG4gICAgICAgICAgICB2YWx1ZVRvQ2hlY2sgPSB2YWx1ZVRvQ2hlY2sudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgIGNvbnN0IHBhdHRlcm4gPSBydWxlLnZhbHVlID8gcnVsZS52YWx1ZS50b0xvd2VyQ2FzZSgpIDogXCJcIjtcblxuICAgICAgICAgICAgbGV0IGlzTWF0Y2ggPSBmYWxzZTtcbiAgICAgICAgICAgIGxldCBtYXRjaE9iajogUmVnRXhwRXhlY0FycmF5IHwgbnVsbCA9IG51bGw7XG5cbiAgICAgICAgICAgIHN3aXRjaCAocnVsZS5vcGVyYXRvcikge1xuICAgICAgICAgICAgICAgIGNhc2UgJ2NvbnRhaW5zJzogaXNNYXRjaCA9IHZhbHVlVG9DaGVjay5pbmNsdWRlcyhwYXR0ZXJuKTsgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnZG9lc05vdENvbnRhaW4nOiBpc01hdGNoID0gIXZhbHVlVG9DaGVjay5pbmNsdWRlcyhwYXR0ZXJuKTsgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnZXF1YWxzJzogaXNNYXRjaCA9IHZhbHVlVG9DaGVjayA9PT0gcGF0dGVybjsgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnc3RhcnRzV2l0aCc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suc3RhcnRzV2l0aChwYXR0ZXJuKTsgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnZW5kc1dpdGgnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrLmVuZHNXaXRoKHBhdHRlcm4pOyBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdleGlzdHMnOiBpc01hdGNoID0gcmF3VmFsdWUgIT09IHVuZGVmaW5lZDsgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnZG9lc05vdEV4aXN0JzogaXNNYXRjaCA9IHJhd1ZhbHVlID09PSB1bmRlZmluZWQ7IGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2lzTnVsbCc6IGlzTWF0Y2ggPSByYXdWYWx1ZSA9PT0gbnVsbDsgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnaXNOb3ROdWxsJzogaXNNYXRjaCA9IHJhd1ZhbHVlICE9PSBudWxsOyBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdtYXRjaGVzJzpcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChydWxlLnZhbHVlLCAnaScpO1xuICAgICAgICAgICAgICAgICAgICAgICAgbWF0Y2hPYmogPSByZWdleC5leGVjKHJhd1ZhbHVlICE9PSB1bmRlZmluZWQgJiYgcmF3VmFsdWUgIT09IG51bGwgPyBTdHJpbmcocmF3VmFsdWUpIDogXCJcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICBpc01hdGNoID0gISFtYXRjaE9iajtcbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge31cbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChpc01hdGNoKSB7XG4gICAgICAgICAgICAgICAgbGV0IHJlc3VsdCA9IHJ1bGUucmVzdWx0O1xuICAgICAgICAgICAgICAgIGlmIChtYXRjaE9iaikge1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IG1hdGNoT2JqLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UobmV3IFJlZ0V4cChgXFxcXCQke2l9YCwgJ2cnKSwgbWF0Y2hPYmpbaV0gfHwgXCJcIik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGxvZ0RlYnVnKFwiRXJyb3IgZXZhbHVhdGluZyBsZWdhY3kgcnVsZXNcIiwgeyBlcnJvcjogU3RyaW5nKGVycm9yKSB9KTtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbmV4cG9ydCBjb25zdCBnZXRHcm91cGluZ1Jlc3VsdCA9ICh0YWI6IFRhYk1ldGFkYXRhLCBzdHJhdGVneTogR3JvdXBpbmdTdHJhdGVneSB8IHN0cmluZyk6IHsga2V5OiBzdHJpbmcgfCBudWxsLCBtb2RlOiBcImN1cnJlbnRcIiB8IFwibmV3XCIgfCBcImNvbXBvdW5kXCIgfSA9PiB7XG4gIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5KTtcbiAgaWYgKGN1c3RvbSkge1xuICAgICAgY29uc3QgZmlsdGVyR3JvdXBzTGlzdCA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbltdPihjdXN0b20uZmlsdGVyR3JvdXBzKTtcbiAgICAgIGNvbnN0IGZpbHRlcnNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihjdXN0b20uZmlsdGVycyk7XG5cbiAgICAgIGxldCBtYXRjaCA9IGZhbHNlO1xuXG4gICAgICBpZiAoZmlsdGVyR3JvdXBzTGlzdC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgLy8gT1IgbG9naWNcbiAgICAgICAgICBmb3IgKGNvbnN0IGdyb3VwIG9mIGZpbHRlckdyb3Vwc0xpc3QpIHtcbiAgICAgICAgICAgICAgY29uc3QgZ3JvdXBSdWxlcyA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbj4oZ3JvdXApO1xuICAgICAgICAgICAgICBpZiAoZ3JvdXBSdWxlcy5sZW5ndGggPT09IDAgfHwgZ3JvdXBSdWxlcy5ldmVyeShyID0+IGNoZWNrQ29uZGl0aW9uKHIsIHRhYikpKSB7XG4gICAgICAgICAgICAgICAgICBtYXRjaCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoZmlsdGVyc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIC8vIExlZ2FjeS9TaW1wbGUgQU5EIGxvZ2ljXG4gICAgICAgICAgaWYgKGZpbHRlcnNMaXN0LmV2ZXJ5KGYgPT4gY2hlY2tDb25kaXRpb24oZiwgdGFiKSkpIHtcbiAgICAgICAgICAgICAgbWF0Y2ggPSB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gTm8gZmlsdGVycyAtPiBNYXRjaCBhbGxcbiAgICAgICAgICBtYXRjaCA9IHRydWU7XG4gICAgICB9XG5cbiAgICAgIGlmICghbWF0Y2gpIHtcbiAgICAgICAgICByZXR1cm4geyBrZXk6IG51bGwsIG1vZGU6IFwiY3VycmVudFwiIH07XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGdyb3VwaW5nUnVsZXNMaXN0ID0gYXNBcnJheTxHcm91cGluZ1J1bGU+KGN1c3RvbS5ncm91cGluZ1J1bGVzKTtcbiAgICAgIGlmIChncm91cGluZ1J1bGVzTGlzdC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgY29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG4gICAgICAgICAgY29uc3QgbW9kZXM6IHN0cmluZ1tdID0gW107XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cGluZ1J1bGVzTGlzdCkge1xuICAgICAgICAgICAgICAgIGlmICghcnVsZSkgY29udGludWU7XG4gICAgICAgICAgICAgICAgbGV0IHZhbCA9IFwiXCI7XG4gICAgICAgICAgICAgICAgaWYgKHJ1bGUuc291cmNlID09PSAnZmllbGQnKSB7XG4gICAgICAgICAgICAgICAgICAgICBjb25zdCByYXcgPSBnZXRGaWVsZFZhbHVlKHRhYiwgcnVsZS52YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICB2YWwgPSByYXcgIT09IHVuZGVmaW5lZCAmJiByYXcgIT09IG51bGwgPyBTdHJpbmcocmF3KSA6IFwiXCI7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHJ1bGUudmFsdWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHZhbCAmJiBydWxlLnRyYW5zZm9ybSAmJiBydWxlLnRyYW5zZm9ybSAhPT0gJ25vbmUnKSB7XG4gICAgICAgICAgICAgICAgICAgIHN3aXRjaCAocnVsZS50cmFuc2Zvcm0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ3N0cmlwVGxkJzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBzdHJpcFRsZCh2YWwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnbG93ZXJjYXNlJzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSB2YWwudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ3VwcGVyY2FzZSc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gdmFsLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdmaXJzdENoYXInOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHZhbC5jaGFyQXQoMCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdkb21haW4nOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IGRvbWFpbkZyb21VcmwodmFsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ2hvc3RuYW1lJzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gbmV3IFVSTCh2YWwpLmhvc3RuYW1lO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBrZWVwIGFzIGlzICovIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ3JlZ2V4JzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocnVsZS50cmFuc2Zvcm1QYXR0ZXJuKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsZXQgcmVnZXggPSByZWdleENhY2hlLmdldChydWxlLnRyYW5zZm9ybVBhdHRlcm4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFyZWdleCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlZ2V4ID0gbmV3IFJlZ0V4cChydWxlLnRyYW5zZm9ybVBhdHRlcm4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlZ2V4Q2FjaGUuc2V0KHJ1bGUudHJhbnNmb3JtUGF0dGVybiwgcmVnZXgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbWF0Y2ggPSByZWdleC5leGVjKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsZXQgZXh0cmFjdGVkID0gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IG1hdGNoLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4dHJhY3RlZCArPSBtYXRjaFtpXSB8fCBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBleHRyYWN0ZWQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxvZ0RlYnVnKFwiSW52YWxpZCByZWdleCBpbiB0cmFuc2Zvcm1cIiwgeyBwYXR0ZXJuOiBydWxlLnRyYW5zZm9ybVBhdHRlcm4sIGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodmFsKSB7XG4gICAgICAgICAgICAgICAgICAgIHBhcnRzLnB1c2godmFsKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJ1bGUud2luZG93TW9kZSkgbW9kZXMucHVzaChydWxlLndpbmRvd01vZGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgbG9nRGVidWcoXCJFcnJvciBhcHBseWluZyBncm91cGluZyBydWxlc1wiLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHsga2V5OiBwYXJ0cy5qb2luKFwiIC0gXCIpLCBtb2RlOiByZXNvbHZlV2luZG93TW9kZShtb2RlcykgfTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHsga2V5OiBjdXN0b20uZmFsbGJhY2sgfHwgXCJNaXNjXCIsIG1vZGU6IFwiY3VycmVudFwiIH07XG4gICAgICB9IGVsc2UgaWYgKGN1c3RvbS5ydWxlcykge1xuICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGV2YWx1YXRlTGVnYWN5UnVsZXMoYXNBcnJheTxTdHJhdGVneVJ1bGU+KGN1c3RvbS5ydWxlcyksIHRhYik7XG4gICAgICAgICAgaWYgKHJlc3VsdCkgcmV0dXJuIHsga2V5OiByZXN1bHQsIG1vZGU6IFwiY3VycmVudFwiIH07XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7IGtleTogY3VzdG9tLmZhbGxiYWNrIHx8IFwiTWlzY1wiLCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICB9XG5cbiAgLy8gQnVpbHQtaW4gc3RyYXRlZ2llc1xuICBsZXQgc2ltcGxlS2V5OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgc3dpdGNoIChzdHJhdGVneSkge1xuICAgIGNhc2UgXCJkb21haW5cIjpcbiAgICBjYXNlIFwiZG9tYWluX2Z1bGxcIjpcbiAgICAgIHNpbXBsZUtleSA9IGRvbWFpbkZyb21VcmwodGFiLnVybCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwidG9waWNcIjpcbiAgICAgIHNpbXBsZUtleSA9IHNlbWFudGljQnVja2V0KHRhYi50aXRsZSwgdGFiLnVybCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwibGluZWFnZVwiOlxuICAgICAgc2ltcGxlS2V5ID0gbmF2aWdhdGlvbktleSh0YWIpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcImNvbnRleHRcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi5jb250ZXh0IHx8IFwiVW5jYXRlZ29yaXplZFwiO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInBpbm5lZFwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLnBpbm5lZCA/IFwicGlubmVkXCIgOiBcInVucGlubmVkXCI7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwiYWdlXCI6XG4gICAgICBzaW1wbGVLZXkgPSBnZXRSZWNlbmN5TGFiZWwodGFiLmxhc3RBY2Nlc3NlZCA/PyAwKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJ1cmxcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi51cmw7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwidGl0bGVcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi50aXRsZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJyZWNlbmN5XCI6XG4gICAgICBzaW1wbGVLZXkgPSBTdHJpbmcodGFiLmxhc3RBY2Nlc3NlZCA/PyAwKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJuZXN0aW5nXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCA/IFwiY2hpbGRcIiA6IFwicm9vdFwiO1xuICAgICAgYnJlYWs7XG4gICAgZGVmYXVsdDpcbiAgICAgICAgY29uc3QgdmFsID0gZ2V0RmllbGRWYWx1ZSh0YWIsIHN0cmF0ZWd5KTtcbiAgICAgICAgaWYgKHZhbCAhPT0gdW5kZWZpbmVkICYmIHZhbCAhPT0gbnVsbCkge1xuICAgICAgICAgICAgc2ltcGxlS2V5ID0gU3RyaW5nKHZhbCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzaW1wbGVLZXkgPSBcIlVua25vd25cIjtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgfVxuICByZXR1cm4geyBrZXk6IHNpbXBsZUtleSwgbW9kZTogXCJjdXJyZW50XCIgfTtcbn07XG5cbmV4cG9ydCBjb25zdCBncm91cGluZ0tleSA9ICh0YWI6IFRhYk1ldGFkYXRhLCBzdHJhdGVneTogR3JvdXBpbmdTdHJhdGVneSB8IHN0cmluZyk6IHN0cmluZyB8IG51bGwgPT4ge1xuICAgIHJldHVybiBnZXRHcm91cGluZ1Jlc3VsdCh0YWIsIHN0cmF0ZWd5KS5rZXk7XG59O1xuXG5mdW5jdGlvbiBpc0NvbnRleHRGaWVsZChmaWVsZDogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIGZpZWxkID09PSAnY29udGV4dCcgfHwgZmllbGQgPT09ICdnZW5yZScgfHwgZmllbGQgPT09ICdzaXRlTmFtZScgfHwgZmllbGQuc3RhcnRzV2l0aCgnY29udGV4dERhdGEuJyk7XG59XG5cbmV4cG9ydCBjb25zdCByZXF1aXJlc0NvbnRleHRBbmFseXNpcyA9IChzdHJhdGVneUlkczogKHN0cmluZyB8IFNvcnRpbmdTdHJhdGVneSlbXSk6IGJvb2xlYW4gPT4ge1xuICAgIC8vIENoZWNrIGlmIFwiY29udGV4dFwiIHN0cmF0ZWd5IGlzIGV4cGxpY2l0bHkgcmVxdWVzdGVkXG4gICAgaWYgKHN0cmF0ZWd5SWRzLmluY2x1ZGVzKFwiY29udGV4dFwiKSkgcmV0dXJuIHRydWU7XG5cbiAgICBjb25zdCBzdHJhdGVnaWVzID0gZ2V0U3RyYXRlZ2llcyhjdXN0b21TdHJhdGVnaWVzKTtcbiAgICAvLyBmaWx0ZXIgb25seSB0aG9zZSB0aGF0IG1hdGNoIHRoZSByZXF1ZXN0ZWQgSURzXG4gICAgY29uc3QgYWN0aXZlRGVmcyA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gc3RyYXRlZ3lJZHMuaW5jbHVkZXMocy5pZCkpO1xuXG4gICAgZm9yIChjb25zdCBkZWYgb2YgYWN0aXZlRGVmcykge1xuICAgICAgICAvLyBJZiBpdCdzIGEgYnVpbHQtaW4gc3RyYXRlZ3kgdGhhdCBuZWVkcyBjb250ZXh0IChvbmx5ICdjb250ZXh0JyBkb2VzKVxuICAgICAgICBpZiAoZGVmLmlkID09PSAnY29udGV4dCcpIHJldHVybiB0cnVlO1xuXG4gICAgICAgIC8vIElmIGl0IGlzIGEgY3VzdG9tIHN0cmF0ZWd5IChvciBvdmVycmlkZXMgYnVpbHQtaW4pLCBjaGVjayBpdHMgcnVsZXNcbiAgICAgICAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRlZ2llcy5maW5kKGMgPT4gYy5pZCA9PT0gZGVmLmlkKTtcbiAgICAgICAgaWYgKGN1c3RvbSkge1xuICAgICAgICAgICAgIGNvbnN0IGdyb3VwUnVsZXNMaXN0ID0gYXNBcnJheTxHcm91cGluZ1J1bGU+KGN1c3RvbS5ncm91cGluZ1J1bGVzKTtcbiAgICAgICAgICAgICBjb25zdCBzb3J0UnVsZXNMaXN0ID0gYXNBcnJheTxTb3J0aW5nUnVsZT4oY3VzdG9tLnNvcnRpbmdSdWxlcyk7XG4gICAgICAgICAgICAgY29uc3QgZ3JvdXBTb3J0UnVsZXNMaXN0ID0gYXNBcnJheTxTb3J0aW5nUnVsZT4oY3VzdG9tLmdyb3VwU29ydGluZ1J1bGVzKTtcbiAgICAgICAgICAgICBjb25zdCBmaWx0ZXJzTGlzdCA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbj4oY3VzdG9tLmZpbHRlcnMpO1xuICAgICAgICAgICAgIGNvbnN0IGZpbHRlckdyb3Vwc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb25bXT4oY3VzdG9tLmZpbHRlckdyb3Vwcyk7XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZ3JvdXBSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgcnVsZS5zb3VyY2UgPT09ICdmaWVsZCcgJiYgaXNDb250ZXh0RmllbGQocnVsZS52YWx1ZSkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBzb3J0UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZ3JvdXBTb3J0UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZmlsdGVyc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgZ3JvdXAgb2YgZmlsdGVyR3JvdXBzTGlzdCkge1xuICAgICAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihncm91cCk7XG4gICAgICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFJ1bGVzKSB7XG4gICAgICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBpc0NvbnRleHRGaWVsZChydWxlLmZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufTtcbiIsICJpbXBvcnQgeyBTb3J0aW5nU3RyYXRlZ3ksIFRhYk1ldGFkYXRhLCBDdXN0b21TdHJhdGVneSwgU29ydGluZ1J1bGUgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBkb21haW5Gcm9tVXJsLCBzZW1hbnRpY0J1Y2tldCwgbmF2aWdhdGlvbktleSwgZ3JvdXBpbmdLZXksIGdldEZpZWxkVmFsdWUsIGdldEN1c3RvbVN0cmF0ZWdpZXMgfSBmcm9tIFwiLi9ncm91cGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tIFwiLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5cbmV4cG9ydCBjb25zdCByZWNlbmN5U2NvcmUgPSAodGFiOiBUYWJNZXRhZGF0YSkgPT4gdGFiLmxhc3RBY2Nlc3NlZCA/PyAwO1xuZXhwb3J0IGNvbnN0IGhpZXJhcmNoeVNjb3JlID0gKHRhYjogVGFiTWV0YWRhdGEpID0+ICh0YWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCA/IDEgOiAwKTtcbmV4cG9ydCBjb25zdCBwaW5uZWRTY29yZSA9ICh0YWI6IFRhYk1ldGFkYXRhKSA9PiAodGFiLnBpbm5lZCA/IDAgOiAxKTtcblxuZXhwb3J0IGNvbnN0IHNvcnRUYWJzID0gKHRhYnM6IFRhYk1ldGFkYXRhW10sIHN0cmF0ZWdpZXM6IFNvcnRpbmdTdHJhdGVneVtdKTogVGFiTWV0YWRhdGFbXSA9PiB7XG4gIGNvbnN0IHNjb3Jpbmc6IFNvcnRpbmdTdHJhdGVneVtdID0gc3RyYXRlZ2llcy5sZW5ndGggPyBzdHJhdGVnaWVzIDogW1wicGlubmVkXCIsIFwicmVjZW5jeVwiXTtcbiAgcmV0dXJuIFsuLi50YWJzXS5zb3J0KChhLCBiKSA9PiB7XG4gICAgZm9yIChjb25zdCBzdHJhdGVneSBvZiBzY29yaW5nKSB7XG4gICAgICBjb25zdCBkaWZmID0gY29tcGFyZUJ5KHN0cmF0ZWd5LCBhLCBiKTtcbiAgICAgIGlmIChkaWZmICE9PSAwKSByZXR1cm4gZGlmZjtcbiAgICB9XG4gICAgcmV0dXJuIGEuaWQgLSBiLmlkO1xuICB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBjb21wYXJlQnkgPSAoc3RyYXRlZ3k6IFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZywgYTogVGFiTWV0YWRhdGEsIGI6IFRhYk1ldGFkYXRhKTogbnVtYmVyID0+IHtcbiAgLy8gMS4gQ2hlY2sgQ3VzdG9tIFN0cmF0ZWdpZXMgZm9yIFNvcnRpbmcgUnVsZXNcbiAgY29uc3QgY3VzdG9tU3RyYXRzID0gZ2V0Q3VzdG9tU3RyYXRlZ2llcygpO1xuICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdHMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5KTtcbiAgaWYgKGN1c3RvbSkge1xuICAgICAgY29uc3Qgc29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KGN1c3RvbS5zb3J0aW5nUnVsZXMpO1xuICAgICAgaWYgKHNvcnRSdWxlc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIC8vIEV2YWx1YXRlIGN1c3RvbSBzb3J0aW5nIHJ1bGVzIGluIG9yZGVyXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIHNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgIGlmICghcnVsZSkgY29udGludWU7XG4gICAgICAgICAgICAgICAgICBjb25zdCB2YWxBID0gZ2V0RmllbGRWYWx1ZShhLCBydWxlLmZpZWxkKTtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IHZhbEIgPSBnZXRGaWVsZFZhbHVlKGIsIHJ1bGUuZmllbGQpO1xuXG4gICAgICAgICAgICAgICAgICBsZXQgcmVzdWx0ID0gMDtcbiAgICAgICAgICAgICAgICAgIGlmICh2YWxBIDwgdmFsQikgcmVzdWx0ID0gLTE7XG4gICAgICAgICAgICAgICAgICBlbHNlIGlmICh2YWxBID4gdmFsQikgcmVzdWx0ID0gMTtcblxuICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdCAhPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBydWxlLm9yZGVyID09PSAnZGVzYycgPyAtcmVzdWx0IDogcmVzdWx0O1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGV2YWx1YXRpbmcgY3VzdG9tIHNvcnRpbmcgcnVsZXNcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBJZiBhbGwgcnVsZXMgZXF1YWwsIGNvbnRpbnVlIHRvIG5leHQgc3RyYXRlZ3kgKHJldHVybiAwKVxuICAgICAgICAgIHJldHVybiAwO1xuICAgICAgfVxuICB9XG5cbiAgLy8gMi4gQnVpbHQtaW4gb3IgZmFsbGJhY2tcbiAgc3dpdGNoIChzdHJhdGVneSkge1xuICAgIGNhc2UgXCJyZWNlbmN5XCI6XG4gICAgICByZXR1cm4gKGIubGFzdEFjY2Vzc2VkID8/IDApIC0gKGEubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgIGNhc2UgXCJuZXN0aW5nXCI6IC8vIEZvcm1lcmx5IGhpZXJhcmNoeVxuICAgICAgcmV0dXJuIGhpZXJhcmNoeVNjb3JlKGEpIC0gaGllcmFyY2h5U2NvcmUoYik7XG4gICAgY2FzZSBcInBpbm5lZFwiOlxuICAgICAgcmV0dXJuIHBpbm5lZFNjb3JlKGEpIC0gcGlubmVkU2NvcmUoYik7XG4gICAgY2FzZSBcInRpdGxlXCI6XG4gICAgICByZXR1cm4gYS50aXRsZS5sb2NhbGVDb21wYXJlKGIudGl0bGUpO1xuICAgIGNhc2UgXCJ1cmxcIjpcbiAgICAgIHJldHVybiBhLnVybC5sb2NhbGVDb21wYXJlKGIudXJsKTtcbiAgICBjYXNlIFwiY29udGV4dFwiOlxuICAgICAgcmV0dXJuIChhLmNvbnRleHQgPz8gXCJcIikubG9jYWxlQ29tcGFyZShiLmNvbnRleHQgPz8gXCJcIik7XG4gICAgY2FzZSBcImRvbWFpblwiOlxuICAgIGNhc2UgXCJkb21haW5fZnVsbFwiOlxuICAgICAgcmV0dXJuIGRvbWFpbkZyb21VcmwoYS51cmwpLmxvY2FsZUNvbXBhcmUoZG9tYWluRnJvbVVybChiLnVybCkpO1xuICAgIGNhc2UgXCJ0b3BpY1wiOlxuICAgICAgcmV0dXJuIHNlbWFudGljQnVja2V0KGEudGl0bGUsIGEudXJsKS5sb2NhbGVDb21wYXJlKHNlbWFudGljQnVja2V0KGIudGl0bGUsIGIudXJsKSk7XG4gICAgY2FzZSBcImxpbmVhZ2VcIjpcbiAgICAgIHJldHVybiBuYXZpZ2F0aW9uS2V5KGEpLmxvY2FsZUNvbXBhcmUobmF2aWdhdGlvbktleShiKSk7XG4gICAgY2FzZSBcImFnZVwiOlxuICAgICAgLy8gUmV2ZXJzZSBhbHBoYWJldGljYWwgZm9yIGFnZSBidWNrZXRzIChUb2RheSA8IFllc3RlcmRheSksIHJvdWdoIGFwcHJveFxuICAgICAgcmV0dXJuIChncm91cGluZ0tleShhLCBcImFnZVwiKSB8fCBcIlwiKS5sb2NhbGVDb21wYXJlKGdyb3VwaW5nS2V5KGIsIFwiYWdlXCIpIHx8IFwiXCIpO1xuICAgIGRlZmF1bHQ6XG4gICAgICAvLyBDaGVjayBpZiBpdCdzIGEgZ2VuZXJpYyBmaWVsZCBmaXJzdFxuICAgICAgY29uc3QgdmFsQSA9IGdldEZpZWxkVmFsdWUoYSwgc3RyYXRlZ3kpO1xuICAgICAgY29uc3QgdmFsQiA9IGdldEZpZWxkVmFsdWUoYiwgc3RyYXRlZ3kpO1xuXG4gICAgICBpZiAodmFsQSAhPT0gdW5kZWZpbmVkICYmIHZhbEIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGlmICh2YWxBIDwgdmFsQikgcmV0dXJuIC0xO1xuICAgICAgICAgIGlmICh2YWxBID4gdmFsQikgcmV0dXJuIDE7XG4gICAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9XG5cbiAgICAgIC8vIEZhbGxiYWNrIGZvciBjdXN0b20gc3RyYXRlZ2llcyBncm91cGluZyBrZXkgKGlmIHVzaW5nIGN1c3RvbSBzdHJhdGVneSBhcyBzb3J0aW5nIGJ1dCBubyBzb3J0aW5nIHJ1bGVzIGRlZmluZWQpXG4gICAgICAvLyBvciB1bmhhbmRsZWQgYnVpbHQtaW5zXG4gICAgICByZXR1cm4gKGdyb3VwaW5nS2V5KGEsIHN0cmF0ZWd5KSB8fCBcIlwiKS5sb2NhbGVDb21wYXJlKGdyb3VwaW5nS2V5KGIsIHN0cmF0ZWd5KSB8fCBcIlwiKTtcbiAgfVxufTtcbiIsICJpbXBvcnQgeyBUYWJHcm91cCwgVGFiTWV0YWRhdGEsIFByZWZlcmVuY2VzIH0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgbWFwQ2hyb21lVGFiLCBnZXRTdG9yZWRQcmVmZXJlbmNlcyB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcbmltcG9ydCB7IHNldEN1c3RvbVN0cmF0ZWdpZXMgfSBmcm9tIFwiLi4vYmFja2dyb3VuZC9ncm91cGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IHNvcnRUYWJzIH0gZnJvbSBcIi4uL2JhY2tncm91bmQvc29ydGluZ1N0cmF0ZWdpZXMuanNcIjtcblxuY29uc3QgZGVmYXVsdFByZWZlcmVuY2VzOiBQcmVmZXJlbmNlcyA9IHtcbiAgc29ydGluZzogW1wicGlubmVkXCIsIFwicmVjZW5jeVwiXSxcbiAgZGVidWc6IGZhbHNlLFxuICB0aGVtZTogXCJkYXJrXCIsXG4gIGN1c3RvbUdlbmVyYToge31cbn07XG5cbmV4cG9ydCBjb25zdCBmZXRjaExvY2FsU3RhdGUgPSBhc3luYyAoKSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgW3RhYnMsIGdyb3VwcywgcHJlZnNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgY2hyb21lLnRhYnMucXVlcnkoe30pLFxuICAgICAgY2hyb21lLnRhYkdyb3Vwcy5xdWVyeSh7fSksXG4gICAgICBnZXRTdG9yZWRQcmVmZXJlbmNlcygpXG4gICAgXSk7XG5cbiAgICBjb25zdCBwcmVmZXJlbmNlcyA9IHByZWZzIHx8IGRlZmF1bHRQcmVmZXJlbmNlcztcblxuICAgIC8vIEluaXRpYWxpemUgY3VzdG9tIHN0cmF0ZWdpZXMgZm9yIHNvcnRpbmdcbiAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZlcmVuY2VzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuXG4gICAgY29uc3QgZ3JvdXBNYXAgPSBuZXcgTWFwKGdyb3Vwcy5tYXAoZyA9PiBbZy5pZCwgZ10pKTtcbiAgICBjb25zdCBtYXBwZWQgPSB0YWJzLm1hcChtYXBDaHJvbWVUYWIpLmZpbHRlcigodCk6IHQgaXMgVGFiTWV0YWRhdGEgPT4gQm9vbGVhbih0KSk7XG5cbiAgICBjb25zdCByZXN1bHRHcm91cHM6IFRhYkdyb3VwW10gPSBbXTtcbiAgICBjb25zdCB0YWJzQnlHcm91cElkID0gbmV3IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhW10+KCk7XG4gICAgY29uc3QgdGFic0J5V2luZG93VW5ncm91cGVkID0gbmV3IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhW10+KCk7XG5cbiAgICBtYXBwZWQuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgICBjb25zdCBncm91cElkID0gdGFiLmdyb3VwSWQgPz8gLTE7XG4gICAgICAgIGlmIChncm91cElkICE9PSAtMSkge1xuICAgICAgICAgICAgaWYgKCF0YWJzQnlHcm91cElkLmhhcyhncm91cElkKSkgdGFic0J5R3JvdXBJZC5zZXQoZ3JvdXBJZCwgW10pO1xuICAgICAgICAgICAgdGFic0J5R3JvdXBJZC5nZXQoZ3JvdXBJZCkhLnB1c2godGFiKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICBpZiAoIXRhYnNCeVdpbmRvd1VuZ3JvdXBlZC5oYXModGFiLndpbmRvd0lkKSkgdGFic0J5V2luZG93VW5ncm91cGVkLnNldCh0YWIud2luZG93SWQsIFtdKTtcbiAgICAgICAgICAgICB0YWJzQnlXaW5kb3dVbmdyb3VwZWQuZ2V0KHRhYi53aW5kb3dJZCkhLnB1c2godGFiKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIFRhYkdyb3VwIG9iamVjdHMgZm9yIGFjdHVhbCBncm91cHNcbiAgICBmb3IgKGNvbnN0IFtncm91cElkLCBncm91cFRhYnNdIG9mIHRhYnNCeUdyb3VwSWQpIHtcbiAgICAgICAgY29uc3QgYnJvd3Nlckdyb3VwID0gZ3JvdXBNYXAuZ2V0KGdyb3VwSWQpO1xuICAgICAgICBpZiAoYnJvd3Nlckdyb3VwKSB7XG4gICAgICAgICAgICByZXN1bHRHcm91cHMucHVzaCh7XG4gICAgICAgICAgICAgICAgaWQ6IGBncm91cC0ke2dyb3VwSWR9YCxcbiAgICAgICAgICAgICAgICB3aW5kb3dJZDogYnJvd3Nlckdyb3VwLndpbmRvd0lkLFxuICAgICAgICAgICAgICAgIGxhYmVsOiBicm93c2VyR3JvdXAudGl0bGUgfHwgXCJVbnRpdGxlZCBHcm91cFwiLFxuICAgICAgICAgICAgICAgIGNvbG9yOiBicm93c2VyR3JvdXAuY29sb3IsXG4gICAgICAgICAgICAgICAgdGFiczogc29ydFRhYnMoZ3JvdXBUYWJzLCBwcmVmZXJlbmNlcy5zb3J0aW5nKSxcbiAgICAgICAgICAgICAgICByZWFzb246IFwiTWFudWFsXCJcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gSGFuZGxlIHVuZ3JvdXBlZCB0YWJzXG4gICAgZm9yIChjb25zdCBbd2luZG93SWQsIHRhYnNdIG9mIHRhYnNCeVdpbmRvd1VuZ3JvdXBlZCkge1xuICAgICAgICByZXN1bHRHcm91cHMucHVzaCh7XG4gICAgICAgICAgICBpZDogYHVuZ3JvdXBlZC0ke3dpbmRvd0lkfWAsXG4gICAgICAgICAgICB3aW5kb3dJZDogd2luZG93SWQsXG4gICAgICAgICAgICBsYWJlbDogXCJVbmdyb3VwZWRcIixcbiAgICAgICAgICAgIGNvbG9yOiBcImdyZXlcIixcbiAgICAgICAgICAgIHRhYnM6IHNvcnRUYWJzKHRhYnMsIHByZWZlcmVuY2VzLnNvcnRpbmcpLFxuICAgICAgICAgICAgcmVhc29uOiBcIlVuZ3JvdXBlZFwiXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnNvbGUud2FybihcIkZldGNoZWQgbG9jYWwgc3RhdGUgKGZhbGxiYWNrKVwiKTtcbiAgICByZXR1cm4geyBvazogdHJ1ZSwgZGF0YTogeyBncm91cHM6IHJlc3VsdEdyb3VwcywgcHJlZmVyZW5jZXMgfSB9O1xuICB9IGNhdGNoIChlKSB7XG4gICAgY29uc29sZS5lcnJvcihcIkxvY2FsIHN0YXRlIGZldGNoIGZhaWxlZDpcIiwgZSk7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGUpIH07XG4gIH1cbn07XG4iLCAiaW1wb3J0IHtcbiAgQXBwbHlHcm91cGluZ1BheWxvYWQsXG4gIEdyb3VwaW5nU2VsZWN0aW9uLFxuICBQcmVmZXJlbmNlcyxcbiAgUnVudGltZU1lc3NhZ2UsXG4gIFJ1bnRpbWVSZXNwb25zZSxcbiAgU2F2ZWRTdGF0ZSxcbiAgU29ydGluZ1N0cmF0ZWd5LFxuICBUYWJHcm91cCxcbiAgVGFiTWV0YWRhdGFcbn0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgZmV0Y2hMb2NhbFN0YXRlIH0gZnJvbSBcIi4vbG9jYWxTdGF0ZS5qc1wiO1xuXG5leHBvcnQgY29uc3Qgc2VuZE1lc3NhZ2UgPSBhc3luYyA8VERhdGE+KHR5cGU6IFJ1bnRpbWVNZXNzYWdlW1widHlwZVwiXSwgcGF5bG9hZD86IGFueSk6IFByb21pc2U8UnVudGltZVJlc3BvbnNlPFREYXRhPj4gPT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGUsIHBheWxvYWQgfSwgKHJlc3BvbnNlKSA9PiB7XG4gICAgICBpZiAoY2hyb21lLnJ1bnRpbWUubGFzdEVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJSdW50aW1lIGVycm9yOlwiLCBjaHJvbWUucnVudGltZS5sYXN0RXJyb3IpO1xuICAgICAgICByZXNvbHZlKHsgb2s6IGZhbHNlLCBlcnJvcjogY2hyb21lLnJ1bnRpbWUubGFzdEVycm9yLm1lc3NhZ2UgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXNvbHZlKHJlc3BvbnNlIHx8IHsgb2s6IGZhbHNlLCBlcnJvcjogXCJObyByZXNwb25zZSBmcm9tIGJhY2tncm91bmRcIiB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSk7XG59O1xuXG5leHBvcnQgdHlwZSBUYWJXaXRoR3JvdXAgPSBUYWJNZXRhZGF0YSAmIHtcbiAgZ3JvdXBMYWJlbD86IHN0cmluZztcbiAgZ3JvdXBDb2xvcj86IHN0cmluZztcbiAgcmVhc29uPzogc3RyaW5nO1xufTtcblxuZXhwb3J0IGludGVyZmFjZSBXaW5kb3dWaWV3IHtcbiAgaWQ6IG51bWJlcjtcbiAgdGl0bGU6IHN0cmluZztcbiAgdGFiczogVGFiV2l0aEdyb3VwW107XG4gIHRhYkNvdW50OiBudW1iZXI7XG4gIGdyb3VwQ291bnQ6IG51bWJlcjtcbiAgcGlubmVkQ291bnQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IElDT05TID0ge1xuICBhY3RpdmU6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cG9seWdvbiBwb2ludHM9XCIzIDExIDIyIDIgMTMgMjEgMTEgMTMgMyAxMVwiPjwvcG9seWdvbj48L3N2Zz5gLFxuICBoaWRlOiBgPHN2ZyB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBhdGggZD1cIk0xNy45NCAxNy45NEExMC4wNyAxMC4wNyAwIDAgMSAxMiAyMGMtNyAwLTExLTgtMTEtOGExOC40NSAxOC40NSAwIDAgMSA1LjA2LTUuOTRNOS45IDQuMjRBOS4xMiA5LjEyIDAgMCAxIDEyIDRjNyAwIDExIDggMTEgOGExOC41IDE4LjUgMCAwIDEtMi4xNiAzLjE5bS02LjcyLTEuMDdhMyAzIDAgMSAxLTQuMjQtNC4yNFwiPjwvcGF0aD48bGluZSB4MT1cIjFcIiB5MT1cIjFcIiB4Mj1cIjIzXCIgeTI9XCIyM1wiPjwvbGluZT48L3N2Zz5gLFxuICBzaG93OiBgPHN2ZyB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBhdGggZD1cIk0xIDEyczQtOCAxMS04IDExIDggMTEgOC00IDgtMTEgOC0xMS04LTExLTgtMTEtOHpcIj48L3BhdGg+PGNpcmNsZSBjeD1cIjEyXCIgY3k9XCIxMlwiIHI9XCIzXCI+PC9jaXJjbGU+PC9zdmc+YCxcbiAgZm9jdXM6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjEwXCI+PC9jaXJjbGU+PGNpcmNsZSBjeD1cIjEyXCIgY3k9XCIxMlwiIHI9XCI2XCI+PC9jaXJjbGU+PGNpcmNsZSBjeD1cIjEyXCIgY3k9XCIxMlwiIHI9XCIyXCI+PC9jaXJjbGU+PC9zdmc+YCxcbiAgY2xvc2U6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48bGluZSB4MT1cIjE4XCIgeTE9XCI2XCIgeDI9XCI2XCIgeTI9XCIxOFwiPjwvbGluZT48bGluZSB4MT1cIjZcIiB5MT1cIjZcIiB4Mj1cIjE4XCIgeTI9XCIxOFwiPjwvbGluZT48L3N2Zz5gLFxuICB1bmdyb3VwOiBgPHN2ZyB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PGNpcmNsZSBjeD1cIjEyXCIgY3k9XCIxMlwiIHI9XCIxMFwiPjwvY2lyY2xlPjxsaW5lIHgxPVwiOFwiIHkxPVwiMTJcIiB4Mj1cIjE2XCIgeTI9XCIxMlwiPjwvbGluZT48L3N2Zz5gLFxuICBkZWZhdWx0RmlsZTogYDxzdmcgd2lkdGg9XCIyNFwiIGhlaWdodD1cIjI0XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwYXRoIGQ9XCJNMTQgMkg2YTIgMiAwIDAgMC0yIDJ2MTZhMiAyIDAgMCAwIDIgMmgxMmEyIDIgMCAwIDAgMi0yVjh6XCI+PC9wYXRoPjxwb2x5bGluZSBwb2ludHM9XCIxNCAyIDE0IDggMjAgOFwiPjwvcG9seWxpbmU+PGxpbmUgeDE9XCIxNlwiIHkxPVwiMTNcIiB4Mj1cIjhcIiB5Mj1cIjEzXCI+PC9saW5lPjxsaW5lIHgxPVwiMTZcIiB5MT1cIjE3XCIgeDI9XCI4XCIgeTI9XCIxN1wiPjwvbGluZT48cG9seWxpbmUgcG9pbnRzPVwiMTAgOSA5IDkgOCA5XCI+PC9wb2x5bGluZT48L3N2Zz5gLFxuICBhdXRvUnVuOiBgPHN2ZyB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBvbHlnb24gcG9pbnRzPVwiMTMgMiAzIDE0IDEyIDE0IDExIDIyIDIxIDEwIDEyIDEwIDEzIDJcIj48L3BvbHlnb24+PC9zdmc+YFxufTtcblxuZXhwb3J0IGNvbnN0IEdST1VQX0NPTE9SUzogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgZ3JleTogXCIjNjQ3NDhiXCIsXG4gIGJsdWU6IFwiIzNiODJmNlwiLFxuICByZWQ6IFwiI2VmNDQ0NFwiLFxuICB5ZWxsb3c6IFwiI2VhYjMwOFwiLFxuICBncmVlbjogXCIjMjJjNTVlXCIsXG4gIHBpbms6IFwiI2VjNDg5OVwiLFxuICBwdXJwbGU6IFwiI2E4NTVmN1wiLFxuICBjeWFuOiBcIiMwNmI2ZDRcIixcbiAgb3JhbmdlOiBcIiNmOTczMTZcIlxufTtcblxuZXhwb3J0IGNvbnN0IGdldEdyb3VwQ29sb3IgPSAobmFtZTogc3RyaW5nKSA9PiBHUk9VUF9DT0xPUlNbbmFtZV0gfHwgXCIjY2JkNWUxXCI7XG5cbmV4cG9ydCBjb25zdCBmZXRjaFN0YXRlID0gYXN5bmMgKCkgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgc2VuZE1lc3NhZ2U8eyBncm91cHM6IFRhYkdyb3VwW107IHByZWZlcmVuY2VzOiBQcmVmZXJlbmNlcyB9PihcImdldFN0YXRlXCIpO1xuICAgIGlmIChyZXNwb25zZS5vayAmJiByZXNwb25zZS5kYXRhKSB7XG4gICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgfVxuICAgIGNvbnNvbGUud2FybihcImZldGNoU3RhdGUgZmFpbGVkLCB1c2luZyBmYWxsYmFjazpcIiwgcmVzcG9uc2UuZXJyb3IpO1xuICAgIHJldHVybiBhd2FpdCBmZXRjaExvY2FsU3RhdGUoKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGNvbnNvbGUud2FybihcImZldGNoU3RhdGUgdGhyZXcgZXhjZXB0aW9uLCB1c2luZyBmYWxsYmFjazpcIiwgZSk7XG4gICAgcmV0dXJuIGF3YWl0IGZldGNoTG9jYWxTdGF0ZSgpO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgYXBwbHlHcm91cGluZyA9IGFzeW5jIChwYXlsb2FkOiBBcHBseUdyb3VwaW5nUGF5bG9hZCkgPT4ge1xuICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogXCJhcHBseUdyb3VwaW5nXCIsIHBheWxvYWQgfSk7XG4gIHJldHVybiByZXNwb25zZSBhcyBSdW50aW1lUmVzcG9uc2U8dW5rbm93bj47XG59O1xuXG5leHBvcnQgY29uc3QgYXBwbHlTb3J0aW5nID0gYXN5bmMgKHBheWxvYWQ6IEFwcGx5R3JvdXBpbmdQYXlsb2FkKSA9PiB7XG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImFwcGx5U29ydGluZ1wiLCBwYXlsb2FkIH0pO1xuICByZXR1cm4gcmVzcG9uc2UgYXMgUnVudGltZVJlc3BvbnNlPHVua25vd24+O1xufTtcblxuZXhwb3J0IGNvbnN0IG1hcFdpbmRvd3MgPSAoZ3JvdXBzOiBUYWJHcm91cFtdLCB3aW5kb3dUaXRsZXM6IE1hcDxudW1iZXIsIHN0cmluZz4pOiBXaW5kb3dWaWV3W10gPT4ge1xuICBjb25zdCB3aW5kb3dzID0gbmV3IE1hcDxudW1iZXIsIFRhYldpdGhHcm91cFtdPigpO1xuXG4gIGdyb3Vwcy5mb3JFYWNoKChncm91cCkgPT4ge1xuICAgIGNvbnN0IGlzVW5ncm91cGVkID0gZ3JvdXAucmVhc29uID09PSBcIlVuZ3JvdXBlZFwiO1xuICAgIGdyb3VwLnRhYnMuZm9yRWFjaCgodGFiKSA9PiB7XG4gICAgICBjb25zdCBkZWNvcmF0ZWQ6IFRhYldpdGhHcm91cCA9IHtcbiAgICAgICAgLi4udGFiLFxuICAgICAgICBncm91cExhYmVsOiBpc1VuZ3JvdXBlZCA/IHVuZGVmaW5lZCA6IGdyb3VwLmxhYmVsLFxuICAgICAgICBncm91cENvbG9yOiBpc1VuZ3JvdXBlZCA/IHVuZGVmaW5lZCA6IGdyb3VwLmNvbG9yLFxuICAgICAgICByZWFzb246IGdyb3VwLnJlYXNvblxuICAgICAgfTtcbiAgICAgIGNvbnN0IGV4aXN0aW5nID0gd2luZG93cy5nZXQodGFiLndpbmRvd0lkKSA/PyBbXTtcbiAgICAgIGV4aXN0aW5nLnB1c2goZGVjb3JhdGVkKTtcbiAgICAgIHdpbmRvd3Muc2V0KHRhYi53aW5kb3dJZCwgZXhpc3RpbmcpO1xuICAgIH0pO1xuICB9KTtcblxuICByZXR1cm4gQXJyYXkuZnJvbSh3aW5kb3dzLmVudHJpZXMoKSlcbiAgICAubWFwPFdpbmRvd1ZpZXc+KChbaWQsIHRhYnNdKSA9PiB7XG4gICAgICBjb25zdCBncm91cENvdW50ID0gbmV3IFNldCh0YWJzLm1hcCgodGFiKSA9PiB0YWIuZ3JvdXBMYWJlbCkuZmlsdGVyKChsKTogbCBpcyBzdHJpbmcgPT4gISFsKSkuc2l6ZTtcbiAgICAgIGNvbnN0IHBpbm5lZENvdW50ID0gdGFicy5maWx0ZXIoKHRhYikgPT4gdGFiLnBpbm5lZCkubGVuZ3RoO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgaWQsXG4gICAgICAgIHRpdGxlOiB3aW5kb3dUaXRsZXMuZ2V0KGlkKSA/PyBgV2luZG93ICR7aWR9YCxcbiAgICAgICAgdGFicyxcbiAgICAgICAgdGFiQ291bnQ6IHRhYnMubGVuZ3RoLFxuICAgICAgICBncm91cENvdW50LFxuICAgICAgICBwaW5uZWRDb3VudFxuICAgICAgfTtcbiAgICB9KVxuICAgIC5zb3J0KChhLCBiKSA9PiBhLmlkIC0gYi5pZCk7XG59O1xuXG5leHBvcnQgY29uc3QgZm9ybWF0RG9tYWluID0gKHVybDogc3RyaW5nKSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcGFyc2VkID0gbmV3IFVSTCh1cmwpO1xuICAgIHJldHVybiBwYXJzZWQuaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sIFwiXCIpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIHJldHVybiB1cmw7XG4gIH1cbn07XG4iLCAiaW1wb3J0IHtcbiAgR3JvdXBpbmdTZWxlY3Rpb24sXG4gIFByZWZlcmVuY2VzLFxuICBTYXZlZFN0YXRlLFxuICBTb3J0aW5nU3RyYXRlZ3ksXG4gIExvZ0xldmVsLFxuICBUYWJHcm91cFxufSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQge1xuICBhcHBseUdyb3VwaW5nLFxuICBhcHBseVNvcnRpbmcsXG4gIGZldGNoU3RhdGUsXG4gIElDT05TLFxuICBtYXBXaW5kb3dzLFxuICBzZW5kTWVzc2FnZSxcbiAgVGFiV2l0aEdyb3VwLFxuICBXaW5kb3dWaWV3LFxuICBHUk9VUF9DT0xPUlNcbn0gZnJvbSBcIi4vY29tbW9uLmpzXCI7XG5pbXBvcnQgeyBnZXRTdHJhdGVnaWVzLCBTVFJBVEVHSUVTLCBTdHJhdGVneURlZmluaXRpb24gfSBmcm9tIFwiLi4vc2hhcmVkL3N0cmF0ZWd5UmVnaXN0cnkuanNcIjtcbmltcG9ydCB7IHNldExvZ2dlclByZWZlcmVuY2VzLCBsb2dEZWJ1ZywgbG9nSW5mbyB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBmZXRjaExvY2FsU3RhdGUgfSBmcm9tIFwiLi9sb2NhbFN0YXRlLmpzXCI7XG5cbi8vIEVsZW1lbnRzXG5jb25zdCBzZWFyY2hJbnB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwidGFiU2VhcmNoXCIpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG5jb25zdCB3aW5kb3dzQ29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ3aW5kb3dzXCIpIGFzIEhUTUxEaXZFbGVtZW50O1xuXG5jb25zdCBzZWxlY3RBbGxDaGVja2JveCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2VsZWN0QWxsXCIpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG5jb25zdCBidG5BcHBseSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuQXBwbHlcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5jb25zdCBidG5Vbmdyb3VwID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5Vbmdyb3VwXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50O1xuY29uc3QgYnRuTWVyZ2UgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0bk1lcmdlXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50O1xuY29uc3QgYnRuU3BsaXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0blNwbGl0XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50O1xuY29uc3QgYnRuRXhwYW5kQWxsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5FeHBhbmRBbGxcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5jb25zdCBidG5Db2xsYXBzZUFsbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuQ29sbGFwc2VBbGxcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cbmNvbnN0IHN0cmF0ZWdpZXNMaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzdHJhdGVnaWVzTGlzdFwiKSBhcyBIVE1MRGl2RWxlbWVudDtcbmNvbnN0IHRvZ2dsZVN0cmF0ZWdpZXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInRvZ2dsZVN0cmF0ZWdpZXNcIikgYXMgSFRNTERpdkVsZW1lbnQ7XG5jb25zdCBhbGxTdHJhdGVnaWVzQ29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJhbGwtc3RyYXRlZ2llc1wiKSBhcyBIVE1MRGl2RWxlbWVudDtcblxuLy8gU3RhdHNcbmNvbnN0IHN0YXRUYWJzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzdGF0VGFic1wiKSBhcyBIVE1MRWxlbWVudDtcbmNvbnN0IHN0YXRHcm91cHMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInN0YXRHcm91cHNcIikgYXMgSFRNTEVsZW1lbnQ7XG5jb25zdCBzdGF0V2luZG93cyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3RhdFdpbmRvd3NcIikgYXMgSFRNTEVsZW1lbnQ7XG5cbmNvbnN0IHByb2dyZXNzT3ZlcmxheSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicHJvZ3Jlc3NPdmVybGF5XCIpIGFzIEhUTUxEaXZFbGVtZW50O1xuY29uc3QgcHJvZ3Jlc3NUZXh0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJwcm9ncmVzc1RleHRcIikgYXMgSFRNTERpdkVsZW1lbnQ7XG5jb25zdCBwcm9ncmVzc0NvdW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJwcm9ncmVzc0NvdW50XCIpIGFzIEhUTUxEaXZFbGVtZW50O1xuXG5jb25zdCBzaG93TG9hZGluZyA9ICh0ZXh0OiBzdHJpbmcpID0+IHtcbiAgICBpZiAocHJvZ3Jlc3NPdmVybGF5KSB7XG4gICAgICAgIHByb2dyZXNzVGV4dC50ZXh0Q29udGVudCA9IHRleHQ7XG4gICAgICAgIHByb2dyZXNzQ291bnQudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgICAgICBwcm9ncmVzc092ZXJsYXkuY2xhc3NMaXN0LnJlbW92ZShcImhpZGRlblwiKTtcbiAgICB9XG59O1xuXG5jb25zdCBoaWRlTG9hZGluZyA9ICgpID0+IHtcbiAgICBpZiAocHJvZ3Jlc3NPdmVybGF5KSB7XG4gICAgICAgIHByb2dyZXNzT3ZlcmxheS5jbGFzc0xpc3QuYWRkKFwiaGlkZGVuXCIpO1xuICAgIH1cbn07XG5cbmNvbnN0IHVwZGF0ZVByb2dyZXNzID0gKGNvbXBsZXRlZDogbnVtYmVyLCB0b3RhbDogbnVtYmVyKSA9PiB7XG4gICAgaWYgKHByb2dyZXNzT3ZlcmxheSAmJiAhcHJvZ3Jlc3NPdmVybGF5LmNsYXNzTGlzdC5jb250YWlucyhcImhpZGRlblwiKSkge1xuICAgICAgICBwcm9ncmVzc0NvdW50LnRleHRDb250ZW50ID0gYCR7Y29tcGxldGVkfSAvICR7dG90YWx9YDtcbiAgICB9XG59O1xuXG5sZXQgd2luZG93U3RhdGU6IFdpbmRvd1ZpZXdbXSA9IFtdO1xubGV0IGZvY3VzZWRXaW5kb3dJZDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5jb25zdCBzZWxlY3RlZFRhYnMgPSBuZXcgU2V0PG51bWJlcj4oKTtcbmxldCBwcmVmZXJlbmNlczogUHJlZmVyZW5jZXMgfCBudWxsID0gbnVsbDtcblxuLy8gVHJlZSBTdGF0ZVxuY29uc3QgZXhwYW5kZWROb2RlcyA9IG5ldyBTZXQ8c3RyaW5nPigpOyAvLyBEZWZhdWx0IGVtcHR5ID0gYWxsIGNvbGxhcHNlZFxuY29uc3QgVFJFRV9JQ09OUyA9IHtcbiAgY2hldnJvblJpZ2h0OiBgPHN2ZyB3aWR0aD1cIjEwMCVcIiBoZWlnaHQ9XCIxMDAlXCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwb2x5bGluZSBwb2ludHM9XCI5IDE4IDE1IDEyIDkgNlwiPjwvcG9seWxpbmU+PC9zdmc+YCxcbiAgZm9sZGVyOiBgPHN2ZyB3aWR0aD1cIjEwMCVcIiBoZWlnaHQ9XCIxMDAlXCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwYXRoIGQ9XCJNMjIgMTlhMiAyIDAgMCAxLTIgMkg0YTIgMiAwIDAgMS0yLTJWNWEyIDIgMCAwIDEgMi0yaDVsMiAzaDlhMiAyIDAgMCAxIDIgMnpcIj48L3BhdGg+PC9zdmc+YFxufTtcblxuY29uc3QgaGV4VG9SZ2JhID0gKGhleDogc3RyaW5nLCBhbHBoYTogbnVtYmVyKSA9PiB7XG4gICAgLy8gRW5zdXJlIGhleCBmb3JtYXRcbiAgICBpZiAoIWhleC5zdGFydHNXaXRoKCcjJykpIHJldHVybiBoZXg7XG4gICAgY29uc3QgciA9IHBhcnNlSW50KGhleC5zbGljZSgxLCAzKSwgMTYpO1xuICAgIGNvbnN0IGcgPSBwYXJzZUludChoZXguc2xpY2UoMywgNSksIDE2KTtcbiAgICBjb25zdCBiID0gcGFyc2VJbnQoaGV4LnNsaWNlKDUsIDcpLCAxNik7XG4gICAgcmV0dXJuIGByZ2JhKCR7cn0sICR7Z30sICR7Yn0sICR7YWxwaGF9KWA7XG59O1xuXG5jb25zdCB1cGRhdGVTdGF0cyA9ICgpID0+IHtcbiAgY29uc3QgdG90YWxUYWJzID0gd2luZG93U3RhdGUucmVkdWNlKChhY2MsIHdpbikgPT4gYWNjICsgd2luLnRhYkNvdW50LCAwKTtcbiAgY29uc3QgdG90YWxHcm91cHMgPSBuZXcgU2V0KHdpbmRvd1N0YXRlLmZsYXRNYXAodyA9PiB3LnRhYnMuZmlsdGVyKHQgPT4gdC5ncm91cExhYmVsKS5tYXAodCA9PiBgJHt3LmlkfS0ke3QuZ3JvdXBMYWJlbH1gKSkpLnNpemU7XG5cbiAgc3RhdFRhYnMudGV4dENvbnRlbnQgPSBgJHt0b3RhbFRhYnN9IFRhYnNgO1xuICBzdGF0R3JvdXBzLnRleHRDb250ZW50ID0gYCR7dG90YWxHcm91cHN9IEdyb3Vwc2A7XG4gIHN0YXRXaW5kb3dzLnRleHRDb250ZW50ID0gYCR7d2luZG93U3RhdGUubGVuZ3RofSBXaW5kb3dzYDtcblxuICAvLyBVcGRhdGUgc2VsZWN0aW9uIGJ1dHRvbnNcbiAgY29uc3QgaGFzU2VsZWN0aW9uID0gc2VsZWN0ZWRUYWJzLnNpemUgPiAwO1xuICBidG5Vbmdyb3VwLmRpc2FibGVkID0gIWhhc1NlbGVjdGlvbjtcbiAgYnRuTWVyZ2UuZGlzYWJsZWQgPSAhaGFzU2VsZWN0aW9uO1xuICBidG5TcGxpdC5kaXNhYmxlZCA9ICFoYXNTZWxlY3Rpb247XG5cbiAgYnRuVW5ncm91cC5zdHlsZS5vcGFjaXR5ID0gaGFzU2VsZWN0aW9uID8gXCIxXCIgOiBcIjAuNVwiO1xuICBidG5NZXJnZS5zdHlsZS5vcGFjaXR5ID0gaGFzU2VsZWN0aW9uID8gXCIxXCIgOiBcIjAuNVwiO1xuICBidG5TcGxpdC5zdHlsZS5vcGFjaXR5ID0gaGFzU2VsZWN0aW9uID8gXCIxXCIgOiBcIjAuNVwiO1xuXG4gIC8vIFVwZGF0ZSBTZWxlY3QgQWxsIENoZWNrYm94IFN0YXRlXG4gIGlmICh0b3RhbFRhYnMgPT09IDApIHtcbiAgICBzZWxlY3RBbGxDaGVja2JveC5jaGVja2VkID0gZmFsc2U7XG4gICAgc2VsZWN0QWxsQ2hlY2tib3guaW5kZXRlcm1pbmF0ZSA9IGZhbHNlO1xuICB9IGVsc2UgaWYgKHNlbGVjdGVkVGFicy5zaXplID09PSB0b3RhbFRhYnMpIHtcbiAgICBzZWxlY3RBbGxDaGVja2JveC5jaGVja2VkID0gdHJ1ZTtcbiAgICBzZWxlY3RBbGxDaGVja2JveC5pbmRldGVybWluYXRlID0gZmFsc2U7XG4gIH0gZWxzZSBpZiAoc2VsZWN0ZWRUYWJzLnNpemUgPiAwKSB7XG4gICAgc2VsZWN0QWxsQ2hlY2tib3guY2hlY2tlZCA9IGZhbHNlO1xuICAgIHNlbGVjdEFsbENoZWNrYm94LmluZGV0ZXJtaW5hdGUgPSB0cnVlO1xuICB9IGVsc2Uge1xuICAgIHNlbGVjdEFsbENoZWNrYm94LmNoZWNrZWQgPSBmYWxzZTtcbiAgICBzZWxlY3RBbGxDaGVja2JveC5pbmRldGVybWluYXRlID0gZmFsc2U7XG4gIH1cbn07XG5cbmNvbnN0IGNyZWF0ZU5vZGUgPSAoXG4gICAgY29udGVudDogSFRNTEVsZW1lbnQsXG4gICAgY2hpbGRyZW5Db250YWluZXI6IEhUTUxFbGVtZW50IHwgbnVsbCxcbiAgICBsZXZlbDogJ3dpbmRvdycgfCAnZ3JvdXAnIHwgJ3RhYicsXG4gICAgaXNFeHBhbmRlZDogYm9vbGVhbiA9IGZhbHNlLFxuICAgIG9uVG9nZ2xlPzogKCkgPT4gdm9pZFxuKSA9PiB7XG4gICAgY29uc3Qgbm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgbm9kZS5jbGFzc05hbWUgPSBgdHJlZS1ub2RlIG5vZGUtJHtsZXZlbH1gO1xuXG4gICAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICByb3cuY2xhc3NOYW1lID0gYHRyZWUtcm93ICR7bGV2ZWx9LXJvd2A7XG5cbiAgICAvLyBUb2dnbGVcbiAgICBjb25zdCB0b2dnbGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIHRvZ2dsZS5jbGFzc05hbWUgPSBgdHJlZS10b2dnbGUgJHtpc0V4cGFuZGVkID8gJ3JvdGF0ZWQnIDogJyd9YDtcbiAgICBpZiAoY2hpbGRyZW5Db250YWluZXIpIHtcbiAgICAgICAgdG9nZ2xlLmlubmVySFRNTCA9IFRSRUVfSUNPTlMuY2hldnJvblJpZ2h0O1xuICAgICAgICB0b2dnbGUub25jbGljayA9IChlKSA9PiB7XG4gICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgaWYgKG9uVG9nZ2xlKSBvblRvZ2dsZSgpO1xuICAgICAgICB9O1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRvZ2dsZS5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcbiAgICB9XG5cbiAgICByb3cuYXBwZW5kQ2hpbGQodG9nZ2xlKTtcbiAgICByb3cuYXBwZW5kQ2hpbGQoY29udGVudCk7IC8vIENvbnRlbnQgaGFuZGxlcyBjaGVja2JveCArIGljb24gKyB0ZXh0ICsgYWN0aW9uc1xuXG4gICAgbm9kZS5hcHBlbmRDaGlsZChyb3cpO1xuXG4gICAgaWYgKGNoaWxkcmVuQ29udGFpbmVyKSB7XG4gICAgICAgIGNoaWxkcmVuQ29udGFpbmVyLmNsYXNzTmFtZSA9IGB0cmVlLWNoaWxkcmVuICR7aXNFeHBhbmRlZCA/ICdleHBhbmRlZCcgOiAnJ31gO1xuICAgICAgICBub2RlLmFwcGVuZENoaWxkKGNoaWxkcmVuQ29udGFpbmVyKTtcbiAgICB9XG5cbiAgICAvLyBUb2dnbGUgaW50ZXJhY3Rpb24gb24gcm93IGNsaWNrIGZvciBXaW5kb3dzIGFuZCBHcm91cHNcbiAgICBpZiAoY2hpbGRyZW5Db250YWluZXIgJiYgbGV2ZWwgIT09ICd0YWInKSB7XG4gICAgICAgIHJvdy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgICAgICAgICAvLyBBdm9pZCB0b2dnbGluZyBpZiBjbGlja2luZyBhY3Rpb25zIG9yIGNoZWNrYm94XG4gICAgICAgICAgICBpZiAoKGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5jbG9zZXN0KCcuYWN0aW9uLWJ0bicpIHx8IChlLnRhcmdldCBhcyBIVE1MRWxlbWVudCkuY2xvc2VzdCgnLnRyZWUtY2hlY2tib3gnKSkgcmV0dXJuO1xuICAgICAgICAgICAgaWYgKG9uVG9nZ2xlKSBvblRvZ2dsZSgpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4geyBub2RlLCB0b2dnbGUsIGNoaWxkcmVuQ29udGFpbmVyIH07XG59O1xuXG5jb25zdCByZW5kZXJUcmVlID0gKCkgPT4ge1xuICBjb25zdCBxdWVyeSA9IHNlYXJjaElucHV0LnZhbHVlLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICB3aW5kb3dzQ29udGFpbmVyLmlubmVySFRNTCA9IFwiXCI7XG5cbiAgLy8gRmlsdGVyIExvZ2ljXG4gIGNvbnN0IGZpbHRlcmVkID0gd2luZG93U3RhdGVcbiAgICAubWFwKCh3aW5kb3cpID0+IHtcbiAgICAgIGlmICghcXVlcnkpIHJldHVybiB7IHdpbmRvdywgdmlzaWJsZVRhYnM6IHdpbmRvdy50YWJzIH07XG4gICAgICBjb25zdCB2aXNpYmxlVGFicyA9IHdpbmRvdy50YWJzLmZpbHRlcihcbiAgICAgICAgKHRhYikgPT4gdGFiLnRpdGxlLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMocXVlcnkpIHx8IHRhYi51cmwudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxdWVyeSlcbiAgICAgICk7XG4gICAgICByZXR1cm4geyB3aW5kb3csIHZpc2libGVUYWJzIH07XG4gICAgfSlcbiAgICAuZmlsdGVyKCh7IHZpc2libGVUYWJzIH0pID0+IHZpc2libGVUYWJzLmxlbmd0aCA+IDAgfHwgIXF1ZXJ5KTtcblxuICBmaWx0ZXJlZC5mb3JFYWNoKCh7IHdpbmRvdywgdmlzaWJsZVRhYnMgfSkgPT4ge1xuICAgIGNvbnN0IHdpbmRvd0tleSA9IGB3LSR7d2luZG93LmlkfWA7XG4gICAgY29uc3QgaXNFeHBhbmRlZCA9ICEhcXVlcnkgfHwgZXhwYW5kZWROb2Rlcy5oYXMod2luZG93S2V5KTtcblxuICAgIC8vIFdpbmRvdyBDaGVja2JveCBMb2dpY1xuICAgIGNvbnN0IGFsbFRhYklkcyA9IHZpc2libGVUYWJzLm1hcCh0ID0+IHQuaWQpO1xuICAgIGNvbnN0IHNlbGVjdGVkQ291bnQgPSBhbGxUYWJJZHMuZmlsdGVyKGlkID0+IHNlbGVjdGVkVGFicy5oYXMoaWQpKS5sZW5ndGg7XG4gICAgY29uc3QgaXNBbGwgPSBzZWxlY3RlZENvdW50ID09PSBhbGxUYWJJZHMubGVuZ3RoICYmIGFsbFRhYklkcy5sZW5ndGggPiAwO1xuICAgIGNvbnN0IGlzU29tZSA9IHNlbGVjdGVkQ291bnQgPiAwICYmIHNlbGVjdGVkQ291bnQgPCBhbGxUYWJJZHMubGVuZ3RoO1xuXG4gICAgY29uc3Qgd2luQ2hlY2tib3ggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW5wdXRcIik7XG4gICAgd2luQ2hlY2tib3gudHlwZSA9IFwiY2hlY2tib3hcIjtcbiAgICB3aW5DaGVja2JveC5jbGFzc05hbWUgPSBcInRyZWUtY2hlY2tib3hcIjtcbiAgICB3aW5DaGVja2JveC5jaGVja2VkID0gaXNBbGw7XG4gICAgd2luQ2hlY2tib3guaW5kZXRlcm1pbmF0ZSA9IGlzU29tZTtcbiAgICB3aW5DaGVja2JveC5vbmNsaWNrID0gKGUpID0+IHtcbiAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgY29uc3QgdGFyZ2V0U3RhdGUgPSAhaXNBbGw7IC8vIElmIGFsbCB3ZXJlIHNlbGVjdGVkLCBkZXNlbGVjdC4gT3RoZXJ3aXNlIHNlbGVjdCBhbGwuXG4gICAgICAgIGFsbFRhYklkcy5mb3JFYWNoKGlkID0+IHtcbiAgICAgICAgICAgIGlmICh0YXJnZXRTdGF0ZSkgc2VsZWN0ZWRUYWJzLmFkZChpZCk7XG4gICAgICAgICAgICBlbHNlIHNlbGVjdGVkVGFicy5kZWxldGUoaWQpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmVuZGVyVHJlZSgpO1xuICAgIH07XG5cbiAgICAvLyBXaW5kb3cgQ29udGVudFxuICAgIGNvbnN0IHdpbkNvbnRlbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIHdpbkNvbnRlbnQuc3R5bGUuZGlzcGxheSA9IFwiZmxleFwiO1xuICAgIHdpbkNvbnRlbnQuc3R5bGUuYWxpZ25JdGVtcyA9IFwiY2VudGVyXCI7XG4gICAgd2luQ29udGVudC5zdHlsZS5mbGV4ID0gXCIxXCI7XG4gICAgd2luQ29udGVudC5zdHlsZS5vdmVyZmxvdyA9IFwiaGlkZGVuXCI7XG5cbiAgICBjb25zdCBsYWJlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgbGFiZWwuY2xhc3NOYW1lID0gXCJ0cmVlLWxhYmVsXCI7XG4gICAgbGFiZWwudGV4dENvbnRlbnQgPSB3aW5kb3cudGl0bGU7XG5cbiAgICBjb25zdCBjb3VudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgY291bnQuY2xhc3NOYW1lID0gXCJ0cmVlLWNvdW50XCI7XG4gICAgY291bnQudGV4dENvbnRlbnQgPSBgKCR7dmlzaWJsZVRhYnMubGVuZ3RofSBUYWJzKWA7XG5cbiAgICB3aW5Db250ZW50LmFwcGVuZCh3aW5DaGVja2JveCwgbGFiZWwsIGNvdW50KTtcblxuICAgIC8vIENoaWxkcmVuIChHcm91cHMpXG4gICAgY29uc3QgY2hpbGRyZW5Db250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuXG4gICAgLy8gR3JvdXAgdGFic1xuICAgIGNvbnN0IGdyb3VwcyA9IG5ldyBNYXA8c3RyaW5nLCB7IGNvbG9yOiBzdHJpbmc7IHRhYnM6IFRhYldpdGhHcm91cFtdIH0+KCk7XG4gICAgY29uc3QgdW5ncm91cGVkVGFiczogVGFiV2l0aEdyb3VwW10gPSBbXTtcbiAgICB2aXNpYmxlVGFicy5mb3JFYWNoKHRhYiA9PiB7XG4gICAgICAgIGlmICh0YWIuZ3JvdXBMYWJlbCkge1xuICAgICAgICAgICAgY29uc3Qga2V5ID0gdGFiLmdyb3VwTGFiZWw7XG4gICAgICAgICAgICBjb25zdCBlbnRyeSA9IGdyb3Vwcy5nZXQoa2V5KSA/PyB7IGNvbG9yOiB0YWIuZ3JvdXBDb2xvciEsIHRhYnM6IFtdIH07XG4gICAgICAgICAgICBlbnRyeS50YWJzLnB1c2godGFiKTtcbiAgICAgICAgICAgIGdyb3Vwcy5zZXQoa2V5LCBlbnRyeSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB1bmdyb3VwZWRUYWJzLnB1c2godGFiKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgY29uc3QgY3JlYXRlVGFiTm9kZSA9ICh0YWI6IFRhYldpdGhHcm91cCkgPT4ge1xuICAgICAgICBjb25zdCB0YWJDb250ZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgdGFiQ29udGVudC5zdHlsZS5kaXNwbGF5ID0gXCJmbGV4XCI7XG4gICAgICAgIHRhYkNvbnRlbnQuc3R5bGUuYWxpZ25JdGVtcyA9IFwiY2VudGVyXCI7XG4gICAgICAgIHRhYkNvbnRlbnQuc3R5bGUuZmxleCA9IFwiMVwiO1xuICAgICAgICB0YWJDb250ZW50LnN0eWxlLm92ZXJmbG93ID0gXCJoaWRkZW5cIjtcblxuICAgICAgICAvLyBUYWIgQ2hlY2tib3hcbiAgICAgICAgY29uc3QgdGFiQ2hlY2tib3ggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW5wdXRcIik7XG4gICAgICAgIHRhYkNoZWNrYm94LnR5cGUgPSBcImNoZWNrYm94XCI7XG4gICAgICAgIHRhYkNoZWNrYm94LmNsYXNzTmFtZSA9IFwidHJlZS1jaGVja2JveFwiO1xuICAgICAgICB0YWJDaGVja2JveC5jaGVja2VkID0gc2VsZWN0ZWRUYWJzLmhhcyh0YWIuaWQpO1xuICAgICAgICB0YWJDaGVja2JveC5vbmNsaWNrID0gKGUpID0+IHtcbiAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICBpZiAodGFiQ2hlY2tib3guY2hlY2tlZCkgc2VsZWN0ZWRUYWJzLmFkZCh0YWIuaWQpO1xuICAgICAgICAgICAgZWxzZSBzZWxlY3RlZFRhYnMuZGVsZXRlKHRhYi5pZCk7XG4gICAgICAgICAgICByZW5kZXJUcmVlKCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgdGFiSWNvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIHRhYkljb24uY2xhc3NOYW1lID0gXCJ0cmVlLWljb25cIjtcbiAgICAgICAgaWYgKHRhYi5mYXZJY29uVXJsKSB7XG4gICAgICAgICAgICBjb25zdCBpbWcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW1nXCIpO1xuICAgICAgICAgICAgaW1nLnNyYyA9IHRhYi5mYXZJY29uVXJsO1xuICAgICAgICAgICAgaW1nLm9uZXJyb3IgPSAoKSA9PiB7IHRhYkljb24uaW5uZXJIVE1MID0gSUNPTlMuZGVmYXVsdEZpbGU7IH07XG4gICAgICAgICAgICB0YWJJY29uLmFwcGVuZENoaWxkKGltZyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0YWJJY29uLmlubmVySFRNTCA9IElDT05TLmRlZmF1bHRGaWxlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdGFiVGl0bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICB0YWJUaXRsZS5jbGFzc05hbWUgPSBcInRyZWUtbGFiZWxcIjtcbiAgICAgICAgdGFiVGl0bGUudGV4dENvbnRlbnQgPSB0YWIudGl0bGU7XG4gICAgICAgIHRhYlRpdGxlLnRpdGxlID0gdGFiLnRpdGxlO1xuXG4gICAgICAgIGNvbnN0IHRhYkFjdGlvbnMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICB0YWJBY3Rpb25zLmNsYXNzTmFtZSA9IFwicm93LWFjdGlvbnNcIjtcbiAgICAgICAgY29uc3QgY2xvc2VCdG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICAgICAgICBjbG9zZUJ0bi5jbGFzc05hbWUgPSBcImFjdGlvbi1idG4gZGVsZXRlXCI7XG4gICAgICAgIGNsb3NlQnRuLmlubmVySFRNTCA9IElDT05TLmNsb3NlO1xuICAgICAgICBjbG9zZUJ0bi50aXRsZSA9IFwiQ2xvc2UgVGFiXCI7XG4gICAgICAgIGNsb3NlQnRuLm9uY2xpY2sgPSBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgIGF3YWl0IGNocm9tZS50YWJzLnJlbW92ZSh0YWIuaWQpO1xuICAgICAgICAgICAgYXdhaXQgbG9hZFN0YXRlKCk7XG4gICAgICAgIH07XG4gICAgICAgIHRhYkFjdGlvbnMuYXBwZW5kQ2hpbGQoY2xvc2VCdG4pO1xuXG4gICAgICAgIHRhYkNvbnRlbnQuYXBwZW5kKHRhYkNoZWNrYm94LCB0YWJJY29uLCB0YWJUaXRsZSwgdGFiQWN0aW9ucyk7XG5cbiAgICAgICAgY29uc3QgeyBub2RlOiB0YWJOb2RlIH0gPSBjcmVhdGVOb2RlKHRhYkNvbnRlbnQsIG51bGwsICd0YWInKTtcbiAgICAgICAgdGFiTm9kZS5vbmNsaWNrID0gYXN5bmMgKGUpID0+IHtcbiAgICAgICAgICAgIC8vIENsaWNraW5nIHRhYiByb3cgYWN0aXZhdGVzIHRhYiAodW5sZXNzIGNsaWNraW5nIGNoZWNrYm94L2FjdGlvbilcbiAgICAgICAgICAgIGlmICgoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpLmNsb3Nlc3QoJy50cmVlLWNoZWNrYm94JykpIHJldHVybjtcbiAgICAgICAgICAgIGF3YWl0IGNocm9tZS50YWJzLnVwZGF0ZSh0YWIuaWQsIHsgYWN0aXZlOiB0cnVlIH0pO1xuICAgICAgICAgICAgYXdhaXQgY2hyb21lLndpbmRvd3MudXBkYXRlKHRhYi53aW5kb3dJZCwgeyBmb2N1c2VkOiB0cnVlIH0pO1xuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gdGFiTm9kZTtcbiAgICB9O1xuXG4gICAgQXJyYXkuZnJvbShncm91cHMuZW50cmllcygpKS5zb3J0KCkuZm9yRWFjaCgoW2dyb3VwTGFiZWwsIGdyb3VwRGF0YV0pID0+IHtcbiAgICAgICAgY29uc3QgZ3JvdXBLZXkgPSBgJHt3aW5kb3dLZXl9LWctJHtncm91cExhYmVsfWA7XG4gICAgICAgIGNvbnN0IGlzR3JvdXBFeHBhbmRlZCA9ICEhcXVlcnkgfHwgZXhwYW5kZWROb2Rlcy5oYXMoZ3JvdXBLZXkpO1xuXG4gICAgICAgIC8vIEdyb3VwIENoZWNrYm94IExvZ2ljXG4gICAgICAgIGNvbnN0IGdyb3VwVGFiSWRzID0gZ3JvdXBEYXRhLnRhYnMubWFwKHQgPT4gdC5pZCk7XG4gICAgICAgIGNvbnN0IGdycFNlbGVjdGVkQ291bnQgPSBncm91cFRhYklkcy5maWx0ZXIoaWQgPT4gc2VsZWN0ZWRUYWJzLmhhcyhpZCkpLmxlbmd0aDtcbiAgICAgICAgY29uc3QgZ3JwSXNBbGwgPSBncnBTZWxlY3RlZENvdW50ID09PSBncm91cFRhYklkcy5sZW5ndGggJiYgZ3JvdXBUYWJJZHMubGVuZ3RoID4gMDtcbiAgICAgICAgY29uc3QgZ3JwSXNTb21lID0gZ3JwU2VsZWN0ZWRDb3VudCA+IDAgJiYgZ3JwU2VsZWN0ZWRDb3VudCA8IGdyb3VwVGFiSWRzLmxlbmd0aDtcblxuICAgICAgICBjb25zdCBncnBDaGVja2JveCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbnB1dFwiKTtcbiAgICAgICAgZ3JwQ2hlY2tib3gudHlwZSA9IFwiY2hlY2tib3hcIjtcbiAgICAgICAgZ3JwQ2hlY2tib3guY2xhc3NOYW1lID0gXCJ0cmVlLWNoZWNrYm94XCI7XG4gICAgICAgIGdycENoZWNrYm94LmNoZWNrZWQgPSBncnBJc0FsbDtcbiAgICAgICAgZ3JwQ2hlY2tib3guaW5kZXRlcm1pbmF0ZSA9IGdycElzU29tZTtcbiAgICAgICAgZ3JwQ2hlY2tib3gub25jbGljayA9IChlKSA9PiB7XG4gICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0U3RhdGUgPSAhZ3JwSXNBbGw7XG4gICAgICAgICAgICBncm91cFRhYklkcy5mb3JFYWNoKGlkID0+IHtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0U3RhdGUpIHNlbGVjdGVkVGFicy5hZGQoaWQpO1xuICAgICAgICAgICAgICAgIGVsc2Ugc2VsZWN0ZWRUYWJzLmRlbGV0ZShpZCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJlbmRlclRyZWUoKTtcbiAgICAgICAgfTtcblxuICAgICAgICAvLyBHcm91cCBDb250ZW50XG4gICAgICAgIGNvbnN0IGdycENvbnRlbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICBncnBDb250ZW50LnN0eWxlLmRpc3BsYXkgPSBcImZsZXhcIjtcbiAgICAgICAgZ3JwQ29udGVudC5zdHlsZS5hbGlnbkl0ZW1zID0gXCJjZW50ZXJcIjtcbiAgICAgICAgZ3JwQ29udGVudC5zdHlsZS5mbGV4ID0gXCIxXCI7XG4gICAgICAgIGdycENvbnRlbnQuc3R5bGUub3ZlcmZsb3cgPSBcImhpZGRlblwiO1xuXG4gICAgICAgIGNvbnN0IGljb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICBpY29uLmNsYXNzTmFtZSA9IFwidHJlZS1pY29uXCI7XG4gICAgICAgIGljb24uaW5uZXJIVE1MID0gVFJFRV9JQ09OUy5mb2xkZXI7XG5cbiAgICAgICAgY29uc3QgZ3JwTGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICBncnBMYWJlbC5jbGFzc05hbWUgPSBcInRyZWUtbGFiZWxcIjtcbiAgICAgICAgZ3JwTGFiZWwudGV4dENvbnRlbnQgPSBncm91cExhYmVsO1xuXG4gICAgICAgIGNvbnN0IGdycENvdW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgZ3JwQ291bnQuY2xhc3NOYW1lID0gXCJ0cmVlLWNvdW50XCI7XG4gICAgICAgIGdycENvdW50LnRleHRDb250ZW50ID0gYCgke2dyb3VwRGF0YS50YWJzLmxlbmd0aH0pYDtcblxuICAgICAgICAvLyBHcm91cCBBY3Rpb25zXG4gICAgICAgIGNvbnN0IGFjdGlvbnMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICBhY3Rpb25zLmNsYXNzTmFtZSA9IFwicm93LWFjdGlvbnNcIjtcbiAgICAgICAgY29uc3QgdW5ncm91cEJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gICAgICAgIHVuZ3JvdXBCdG4uY2xhc3NOYW1lID0gXCJhY3Rpb24tYnRuXCI7XG4gICAgICAgIHVuZ3JvdXBCdG4uaW5uZXJIVE1MID0gSUNPTlMudW5ncm91cDtcbiAgICAgICAgdW5ncm91cEJ0bi50aXRsZSA9IFwiVW5ncm91cFwiO1xuICAgICAgICB1bmdyb3VwQnRuLm9uY2xpY2sgPSBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgIGlmIChjb25maXJtKGBVbmdyb3VwICR7Z3JvdXBEYXRhLnRhYnMubGVuZ3RofSB0YWJzP2ApKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMudW5ncm91cChncm91cERhdGEudGFicy5tYXAodCA9PiB0LmlkKSk7XG4gICAgICAgICAgICAgICAgYXdhaXQgbG9hZFN0YXRlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIGFjdGlvbnMuYXBwZW5kQ2hpbGQodW5ncm91cEJ0bik7XG5cbiAgICAgICAgZ3JwQ29udGVudC5hcHBlbmQoZ3JwQ2hlY2tib3gsIGljb24sIGdycExhYmVsLCBncnBDb3VudCwgYWN0aW9ucyk7XG5cbiAgICAgICAgLy8gVGFic1xuICAgICAgICBjb25zdCB0YWJzQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgZ3JvdXBEYXRhLnRhYnMuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgICAgICAgdGFic0NvbnRhaW5lci5hcHBlbmRDaGlsZChjcmVhdGVUYWJOb2RlKHRhYikpO1xuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCB7IG5vZGU6IGdyb3VwTm9kZSwgdG9nZ2xlOiBncnBUb2dnbGUsIGNoaWxkcmVuQ29udGFpbmVyOiBncnBDaGlsZHJlbiB9ID0gY3JlYXRlTm9kZShcbiAgICAgICAgICAgIGdycENvbnRlbnQsXG4gICAgICAgICAgICB0YWJzQ29udGFpbmVyLFxuICAgICAgICAgICAgJ2dyb3VwJyxcbiAgICAgICAgICAgIGlzR3JvdXBFeHBhbmRlZCxcbiAgICAgICAgICAgICgpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZXhwYW5kZWROb2Rlcy5oYXMoZ3JvdXBLZXkpKSBleHBhbmRlZE5vZGVzLmRlbGV0ZShncm91cEtleSk7XG4gICAgICAgICAgICAgICAgZWxzZSBleHBhbmRlZE5vZGVzLmFkZChncm91cEtleSk7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBleHBhbmRlZCA9IGV4cGFuZGVkTm9kZXMuaGFzKGdyb3VwS2V5KTtcbiAgICAgICAgICAgICAgICBncnBUb2dnbGUuY2xhc3NMaXN0LnRvZ2dsZSgncm90YXRlZCcsIGV4cGFuZGVkKTtcbiAgICAgICAgICAgICAgICBncnBDaGlsZHJlbiEuY2xhc3NMaXN0LnRvZ2dsZSgnZXhwYW5kZWQnLCBleHBhbmRlZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICk7XG5cbiAgICAgICAgLy8gQXBwbHkgYmFja2dyb3VuZCBjb2xvciB0byBncm91cCBub2RlXG4gICAgICAgIGlmIChncm91cERhdGEuY29sb3IpIHtcbiAgICAgICAgICAgIGNvbnN0IGNvbG9yTmFtZSA9IGdyb3VwRGF0YS5jb2xvcjtcbiAgICAgICAgICAgIGNvbnN0IGhleCA9IEdST1VQX0NPTE9SU1tjb2xvck5hbWVdIHx8IGNvbG9yTmFtZTsgLy8gRmFsbGJhY2sgaWYgaXQncyBhbHJlYWR5IGhleFxuICAgICAgICAgICAgaWYgKGhleC5zdGFydHNXaXRoKCcjJykpIHtcbiAgICAgICAgICAgICAgICBncm91cE5vZGUuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gaGV4VG9SZ2JhKGhleCwgMC4xKTtcbiAgICAgICAgICAgICAgICBncm91cE5vZGUuc3R5bGUuYm9yZGVyID0gYDFweCBzb2xpZCAke2hleFRvUmdiYShoZXgsIDAuMil9YDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGNoaWxkcmVuQ29udGFpbmVyLmFwcGVuZENoaWxkKGdyb3VwTm9kZSk7XG4gICAgfSk7XG5cbiAgICB1bmdyb3VwZWRUYWJzLmZvckVhY2godGFiID0+IHtcbiAgICAgICAgY2hpbGRyZW5Db250YWluZXIuYXBwZW5kQ2hpbGQoY3JlYXRlVGFiTm9kZSh0YWIpKTtcbiAgICB9KTtcblxuICAgIGNvbnN0IHsgbm9kZTogd2luTm9kZSwgdG9nZ2xlOiB3aW5Ub2dnbGUsIGNoaWxkcmVuQ29udGFpbmVyOiB3aW5DaGlsZHJlbiB9ID0gY3JlYXRlTm9kZShcbiAgICAgICAgd2luQ29udGVudCxcbiAgICAgICAgY2hpbGRyZW5Db250YWluZXIsXG4gICAgICAgICd3aW5kb3cnLFxuICAgICAgICBpc0V4cGFuZGVkLFxuICAgICAgICAoKSA9PiB7XG4gICAgICAgICAgICAgaWYgKGV4cGFuZGVkTm9kZXMuaGFzKHdpbmRvd0tleSkpIGV4cGFuZGVkTm9kZXMuZGVsZXRlKHdpbmRvd0tleSk7XG4gICAgICAgICAgICAgZWxzZSBleHBhbmRlZE5vZGVzLmFkZCh3aW5kb3dLZXkpO1xuXG4gICAgICAgICAgICAgY29uc3QgZXhwYW5kZWQgPSBleHBhbmRlZE5vZGVzLmhhcyh3aW5kb3dLZXkpO1xuICAgICAgICAgICAgIHdpblRvZ2dsZS5jbGFzc0xpc3QudG9nZ2xlKCdyb3RhdGVkJywgZXhwYW5kZWQpO1xuICAgICAgICAgICAgIHdpbkNoaWxkcmVuIS5jbGFzc0xpc3QudG9nZ2xlKCdleHBhbmRlZCcsIGV4cGFuZGVkKTtcbiAgICAgICAgfVxuICAgICk7XG5cbiAgICB3aW5kb3dzQ29udGFpbmVyLmFwcGVuZENoaWxkKHdpbk5vZGUpO1xuICB9KTtcblxuICB1cGRhdGVTdGF0cygpO1xufTtcblxuLy8gU3RyYXRlZ3kgUmVuZGVyaW5nXG5mdW5jdGlvbiByZW5kZXJTdHJhdGVneUxpc3QoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgc3RyYXRlZ2llczogU3RyYXRlZ3lEZWZpbml0aW9uW10sIGRlZmF1bHRFbmFibGVkOiBzdHJpbmdbXSkge1xuICAgIGNvbnRhaW5lci5pbm5lckhUTUwgPSAnJztcblxuICAgIC8vIFNvcnQgZW5hYmxlZCBieSB0aGVpciBpbmRleCBpbiBkZWZhdWx0RW5hYmxlZCB0byBtYWludGFpbiBwcmlvcml0eVxuICAgIGNvbnN0IGVuYWJsZWQgPSBzdHJhdGVnaWVzLmZpbHRlcihzID0+IGRlZmF1bHRFbmFibGVkLmluY2x1ZGVzKHMuaWQpKTtcbiAgICBlbmFibGVkLnNvcnQoKGEsIGIpID0+IGRlZmF1bHRFbmFibGVkLmluZGV4T2YoYS5pZCkgLSBkZWZhdWx0RW5hYmxlZC5pbmRleE9mKGIuaWQpKTtcblxuICAgIGNvbnN0IGRpc2FibGVkID0gc3RyYXRlZ2llcy5maWx0ZXIocyA9PiAhZGVmYXVsdEVuYWJsZWQuaW5jbHVkZXMocy5pZCkpO1xuXG4gICAgLy8gSW5pdGlhbCByZW5kZXIgb3JkZXI6IEVuYWJsZWQgKG9yZGVyZWQpIHRoZW4gRGlzYWJsZWRcbiAgICBjb25zdCBvcmRlcmVkID0gWy4uLmVuYWJsZWQsIC4uLmRpc2FibGVkXTtcblxuICAgIG9yZGVyZWQuZm9yRWFjaChzdHJhdGVneSA9PiB7XG4gICAgICAgIGNvbnN0IGlzQ2hlY2tlZCA9IGRlZmF1bHRFbmFibGVkLmluY2x1ZGVzKHN0cmF0ZWd5LmlkKTtcbiAgICAgICAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIHJvdy5jbGFzc05hbWUgPSBgc3RyYXRlZ3ktcm93ICR7aXNDaGVja2VkID8gJ2FjdGl2ZScgOiAnJ31gO1xuICAgICAgICByb3cuZGF0YXNldC5pZCA9IHN0cmF0ZWd5LmlkO1xuICAgICAgICByb3cuZHJhZ2dhYmxlID0gdHJ1ZTtcblxuICAgICAgICBsZXQgdGFnc0h0bWwgPSAnJztcbiAgICAgICAgaWYgKHN0cmF0ZWd5LnRhZ3MpIHtcbiAgICAgICAgICAgIHN0cmF0ZWd5LnRhZ3MuZm9yRWFjaCh0YWcgPT4ge1xuICAgICAgICAgICAgICAgIHRhZ3NIdG1sICs9IGA8c3BhbiBjbGFzcz1cInRhZyB0YWctJHt0YWd9XCI+JHt0YWd9PC9zcGFuPmA7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJvdy5pbm5lckhUTUwgPSBgXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwic3RyYXRlZ3ktZHJhZy1oYW5kbGVcIj5cdTI2MzA8L2Rpdj5cbiAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiAke2lzQ2hlY2tlZCA/ICdjaGVja2VkJyA6ICcnfT5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwic3RyYXRlZ3ktbGFiZWxcIj4ke3N0cmF0ZWd5LmxhYmVsfTwvc3Bhbj5cbiAgICAgICAgICAgICR7dGFnc0h0bWx9XG4gICAgICAgIGA7XG5cbiAgICAgICAgaWYgKHN0cmF0ZWd5LmlzQ3VzdG9tKSB7XG4gICAgICAgICAgICBjb25zdCBhdXRvUnVuQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgICAgICAgICAgIGF1dG9SdW5CdG4uY2xhc3NOYW1lID0gYGFjdGlvbi1idG4gYXV0by1ydW4gJHtzdHJhdGVneS5hdXRvUnVuID8gJ2FjdGl2ZScgOiAnJ31gO1xuICAgICAgICAgICAgYXV0b1J1bkJ0bi5pbm5lckhUTUwgPSBJQ09OUy5hdXRvUnVuO1xuICAgICAgICAgICAgYXV0b1J1bkJ0bi50aXRsZSA9IGBBdXRvIFJ1bjogJHtzdHJhdGVneS5hdXRvUnVuID8gJ09OJyA6ICdPRkYnfWA7XG4gICAgICAgICAgICBhdXRvUnVuQnRuLnN0eWxlLm1hcmdpbkxlZnQgPSBcImF1dG9cIjtcbiAgICAgICAgICAgIGF1dG9SdW5CdG4uc3R5bGUub3BhY2l0eSA9IHN0cmF0ZWd5LmF1dG9SdW4gPyBcIjFcIiA6IFwiMC4zXCI7XG5cbiAgICAgICAgICAgIGF1dG9SdW5CdG4ub25jbGljayA9IGFzeW5jIChlKSA9PiB7XG4gICAgICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICBpZiAoIXByZWZlcmVuY2VzPy5jdXN0b21TdHJhdGVnaWVzKSByZXR1cm47XG5cbiAgICAgICAgICAgICAgICBjb25zdCBjdXN0b21TdHJhdEluZGV4ID0gcHJlZmVyZW5jZXMuY3VzdG9tU3RyYXRlZ2llcy5maW5kSW5kZXgocyA9PiBzLmlkID09PSBzdHJhdGVneS5pZCk7XG4gICAgICAgICAgICAgICAgaWYgKGN1c3RvbVN0cmF0SW5kZXggIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN0cmF0ID0gcHJlZmVyZW5jZXMuY3VzdG9tU3RyYXRlZ2llc1tjdXN0b21TdHJhdEluZGV4XTtcbiAgICAgICAgICAgICAgICAgICAgc3RyYXQuYXV0b1J1biA9ICFzdHJhdC5hdXRvUnVuO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIFVwZGF0ZSBVSSBpbW1lZGlhdGVseVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBpc0FjdGl2ZSA9ICEhc3RyYXQuYXV0b1J1bjtcbiAgICAgICAgICAgICAgICAgICAgYXV0b1J1bkJ0bi5jbGFzc0xpc3QudG9nZ2xlKCdhY3RpdmUnLCBpc0FjdGl2ZSk7XG4gICAgICAgICAgICAgICAgICAgIGF1dG9SdW5CdG4uc3R5bGUub3BhY2l0eSA9IGlzQWN0aXZlID8gXCIxXCIgOiBcIjAuM1wiO1xuICAgICAgICAgICAgICAgICAgICBhdXRvUnVuQnRuLnRpdGxlID0gYEF1dG8gUnVuOiAke2lzQWN0aXZlID8gJ09OJyA6ICdPRkYnfWA7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gU2F2ZVxuICAgICAgICAgICAgICAgICAgICBhd2FpdCBzZW5kTWVzc2FnZShcInNhdmVQcmVmZXJlbmNlc1wiLCB7IGN1c3RvbVN0cmF0ZWdpZXM6IHByZWZlcmVuY2VzLmN1c3RvbVN0cmF0ZWdpZXMgfSk7XG4gICAgICAgICAgICAgICAgICAgIC8vIE5vIG5lZWQgdG8gcmVsb2FkIHN0YXRlIGVudGlyZWx5IGZvciB0aGlzLCBidXQgaWYgd2Ugd2FudGVkIHRvIHJlZmxlY3QgY2hhbmdlcyB0aGF0IGRlcGVuZCBvbiBpdC4uLlxuICAgICAgICAgICAgICAgICAgICAvLyBsb2FkU3RhdGUoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgcm93LmFwcGVuZENoaWxkKGF1dG9SdW5CdG4pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQWRkIGxpc3RlbmVyc1xuICAgICAgICBjb25zdCBjaGVja2JveCA9IHJvdy5xdWVyeVNlbGVjdG9yKCdpbnB1dFt0eXBlPVwiY2hlY2tib3hcIl0nKTtcbiAgICAgICAgY2hlY2tib3g/LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGFzeW5jIChlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjaGVja2VkID0gKGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLmNoZWNrZWQ7XG4gICAgICAgICAgICByb3cuY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aXZlJywgY2hlY2tlZCk7XG4gICAgICAgICAgICBsb2dJbmZvKFwiU3RyYXRlZ3kgdG9nZ2xlZFwiLCB7IGlkOiBzdHJhdGVneS5pZCwgY2hlY2tlZCB9KTtcblxuICAgICAgICAgICAgLy8gSW1tZWRpYXRlIHNhdmUgb24gaW50ZXJhY3Rpb25cbiAgICAgICAgICAgIGlmIChwcmVmZXJlbmNlcykge1xuICAgICAgICAgICAgICAgIC8vIFVwZGF0ZSBsb2NhbCBwcmVmZXJlbmNlIHN0YXRlXG4gICAgICAgICAgICAgICAgY29uc3QgY3VycmVudFNvcnRpbmcgPSBnZXRTZWxlY3RlZFNvcnRpbmcoKTtcbiAgICAgICAgICAgICAgICBwcmVmZXJlbmNlcy5zb3J0aW5nID0gY3VycmVudFNvcnRpbmc7XG4gICAgICAgICAgICAgICAgLy8gV2Ugc2hvdWxkIGFsc28gcGVyc2lzdCB0aGlzIHRvIHN0b3JhZ2UsIHNvIGlmIHVzZXIgcmVsb2FkcyB0aGV5IHNlZSBpdFxuICAgICAgICAgICAgICAgIGF3YWl0IHNlbmRNZXNzYWdlKFwic2F2ZVByZWZlcmVuY2VzXCIsIHsgc29ydGluZzogY3VycmVudFNvcnRpbmcgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEJhc2ljIENsaWNrIHRvIHRvZ2dsZSAoZm9yIGJldHRlciBVWClcbiAgICAgICAgcm93LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICAgICAgICAgIGlmICgoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpLmNsb3Nlc3QoJy5hY3Rpb24tYnRuJykpIHJldHVybjtcbiAgICAgICAgICAgIGlmIChlLnRhcmdldCAhPT0gY2hlY2tib3gpIHtcbiAgICAgICAgICAgICAgICAoY2hlY2tib3ggYXMgSFRNTEVsZW1lbnQpLmNsaWNrKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGFkZERuRExpc3RlbmVycyhyb3cpO1xuXG4gICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChyb3cpO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBhZGREbkRMaXN0ZW5lcnMocm93OiBIVE1MRWxlbWVudCkge1xuICByb3cuYWRkRXZlbnRMaXN0ZW5lcignZHJhZ3N0YXJ0JywgKGUpID0+IHtcbiAgICByb3cuY2xhc3NMaXN0LmFkZCgnZHJhZ2dpbmcnKTtcbiAgICBpZiAoZS5kYXRhVHJhbnNmZXIpIHtcbiAgICAgICAgZS5kYXRhVHJhbnNmZXIuZWZmZWN0QWxsb3dlZCA9ICdtb3ZlJztcbiAgICB9XG4gIH0pO1xuXG4gIHJvdy5hZGRFdmVudExpc3RlbmVyKCdkcmFnZW5kJywgYXN5bmMgKCkgPT4ge1xuICAgIHJvdy5jbGFzc0xpc3QucmVtb3ZlKCdkcmFnZ2luZycpO1xuICAgIC8vIFNhdmUgb3JkZXIgb24gZHJhZyBlbmRcbiAgICBpZiAocHJlZmVyZW5jZXMpIHtcbiAgICAgICAgY29uc3QgY3VycmVudFNvcnRpbmcgPSBnZXRTZWxlY3RlZFNvcnRpbmcoKTtcbiAgICAgICAgcHJlZmVyZW5jZXMuc29ydGluZyA9IGN1cnJlbnRTb3J0aW5nO1xuICAgICAgICBhd2FpdCBzZW5kTWVzc2FnZShcInNhdmVQcmVmZXJlbmNlc1wiLCB7IHNvcnRpbmc6IGN1cnJlbnRTb3J0aW5nIH0pO1xuICAgIH1cbiAgfSk7XG59XG5cbmZ1bmN0aW9uIHNldHVwQ29udGFpbmVyRG5EKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcbiAgICBjb250YWluZXIuYWRkRXZlbnRMaXN0ZW5lcignZHJhZ292ZXInLCAoZSkgPT4ge1xuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIGNvbnN0IGFmdGVyRWxlbWVudCA9IGdldERyYWdBZnRlckVsZW1lbnQoY29udGFpbmVyLCBlLmNsaWVudFkpO1xuXG4gICAgICAgIC8vIFNjb3BlIGRyYWdnYWJsZSB0byBiZSBhIHN0cmF0ZWd5LXJvd1xuICAgICAgICBjb25zdCBkcmFnZ2FibGVSb3cgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuc3RyYXRlZ3ktcm93LmRyYWdnaW5nJyk7XG4gICAgICAgIC8vIEVuc3VyZSB3ZSBvbmx5IGRyYWcgd2l0aGluIHRoZSBzYW1lIGNvbnRhaW5lciAocHJldmVudCBjcm9zcy1saXN0IGRyYWdnaW5nKVxuICAgICAgICBpZiAoZHJhZ2dhYmxlUm93ICYmIGRyYWdnYWJsZVJvdy5wYXJlbnRFbGVtZW50ID09PSBjb250YWluZXIpIHtcbiAgICAgICAgICAgICBpZiAoYWZ0ZXJFbGVtZW50ID09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoZHJhZ2dhYmxlUm93KTtcbiAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnRhaW5lci5pbnNlcnRCZWZvcmUoZHJhZ2dhYmxlUm93LCBhZnRlckVsZW1lbnQpO1xuICAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xufVxuXG4vLyBJbml0aWFsaXplIERuRCBvbiBjb250YWluZXJzIG9uY2VcbnNldHVwQ29udGFpbmVyRG5EKGFsbFN0cmF0ZWdpZXNDb250YWluZXIpO1xuXG5mdW5jdGlvbiBnZXREcmFnQWZ0ZXJFbGVtZW50KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHk6IG51bWJlcikge1xuICBjb25zdCBkcmFnZ2FibGVFbGVtZW50cyA9IEFycmF5LmZyb20oY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5zdHJhdGVneS1yb3c6bm90KC5kcmFnZ2luZyknKSk7XG5cbiAgcmV0dXJuIGRyYWdnYWJsZUVsZW1lbnRzLnJlZHVjZSgoY2xvc2VzdCwgY2hpbGQpID0+IHtcbiAgICBjb25zdCBib3ggPSBjaGlsZC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICBjb25zdCBvZmZzZXQgPSB5IC0gYm94LnRvcCAtIGJveC5oZWlnaHQgLyAyO1xuICAgIGlmIChvZmZzZXQgPCAwICYmIG9mZnNldCA+IGNsb3Nlc3Qub2Zmc2V0KSB7XG4gICAgICByZXR1cm4geyBvZmZzZXQ6IG9mZnNldCwgZWxlbWVudDogY2hpbGQgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGNsb3Nlc3Q7XG4gICAgfVxuICB9LCB7IG9mZnNldDogTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZLCBlbGVtZW50OiBudWxsIGFzIEVsZW1lbnQgfCBudWxsIH0pLmVsZW1lbnQ7XG59XG5cbmNvbnN0IHVwZGF0ZVVJID0gKFxuICBzdGF0ZURhdGE6IHsgZ3JvdXBzOiBUYWJHcm91cFtdOyBwcmVmZXJlbmNlczogUHJlZmVyZW5jZXMgfSxcbiAgY3VycmVudFdpbmRvdzogY2hyb21lLndpbmRvd3MuV2luZG93IHwgdW5kZWZpbmVkLFxuICBjaHJvbWVXaW5kb3dzOiBjaHJvbWUud2luZG93cy5XaW5kb3dbXVxuKSA9PiB7XG4gICAgcHJlZmVyZW5jZXMgPSBzdGF0ZURhdGEucHJlZmVyZW5jZXM7XG5cbiAgICBpZiAocHJlZmVyZW5jZXMpIHtcbiAgICAgIGNvbnN0IHMgPSBwcmVmZXJlbmNlcy5zb3J0aW5nIHx8IFtdO1xuXG4gICAgICAvLyBJbml0aWFsaXplIExvZ2dlclxuICAgICAgc2V0TG9nZ2VyUHJlZmVyZW5jZXMocHJlZmVyZW5jZXMpO1xuXG4gICAgICBjb25zdCBhbGxTdHJhdGVnaWVzID0gZ2V0U3RyYXRlZ2llcyhwcmVmZXJlbmNlcy5jdXN0b21TdHJhdGVnaWVzKTtcblxuICAgICAgLy8gUmVuZGVyIHVuaWZpZWQgc3RyYXRlZ3kgbGlzdFxuICAgICAgcmVuZGVyU3RyYXRlZ3lMaXN0KGFsbFN0cmF0ZWdpZXNDb250YWluZXIsIGFsbFN0cmF0ZWdpZXMsIHMpO1xuXG4gICAgICAvLyBJbml0aWFsIHRoZW1lIGxvYWRcbiAgICAgIGlmIChwcmVmZXJlbmNlcy50aGVtZSkge1xuICAgICAgICBhcHBseVRoZW1lKHByZWZlcmVuY2VzLnRoZW1lLCBmYWxzZSk7XG4gICAgICB9XG5cbiAgICAgIC8vIEluaXQgc2V0dGluZ3MgVUlcbiAgICAgIGlmIChwcmVmZXJlbmNlcy5sb2dMZXZlbCkge1xuICAgICAgICAgIGNvbnN0IHNlbGVjdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2dMZXZlbFNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICAgIGlmIChzZWxlY3QpIHNlbGVjdC52YWx1ZSA9IHByZWZlcmVuY2VzLmxvZ0xldmVsO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChjdXJyZW50V2luZG93KSB7XG4gICAgICBmb2N1c2VkV2luZG93SWQgPSBjdXJyZW50V2luZG93LmlkID8/IG51bGw7XG4gICAgfSBlbHNlIHtcbiAgICAgIGZvY3VzZWRXaW5kb3dJZCA9IG51bGw7XG4gICAgICBjb25zb2xlLndhcm4oXCJGYWlsZWQgdG8gZ2V0IGN1cnJlbnQgd2luZG93XCIpO1xuICAgIH1cblxuICAgIGNvbnN0IHdpbmRvd1RpdGxlcyA9IG5ldyBNYXA8bnVtYmVyLCBzdHJpbmc+KCk7XG5cbiAgICBjaHJvbWVXaW5kb3dzLmZvckVhY2goKHdpbikgPT4ge1xuICAgICAgaWYgKCF3aW4uaWQpIHJldHVybjtcbiAgICAgIGNvbnN0IGFjdGl2ZVRhYlRpdGxlID0gd2luLnRhYnM/LmZpbmQoKHRhYikgPT4gdGFiLmFjdGl2ZSk/LnRpdGxlO1xuICAgICAgY29uc3QgdGl0bGUgPSBhY3RpdmVUYWJUaXRsZSA/PyBgV2luZG93ICR7d2luLmlkfWA7XG4gICAgICB3aW5kb3dUaXRsZXMuc2V0KHdpbi5pZCwgdGl0bGUpO1xuICAgIH0pO1xuXG4gICAgd2luZG93U3RhdGUgPSBtYXBXaW5kb3dzKHN0YXRlRGF0YS5ncm91cHMsIHdpbmRvd1RpdGxlcyk7XG5cbiAgICByZW5kZXJUcmVlKCk7XG59O1xuXG5jb25zdCBsb2FkU3RhdGUgPSBhc3luYyAoKSA9PiB7XG4gIGxvZ0luZm8oXCJMb2FkaW5nIHBvcHVwIHN0YXRlXCIpO1xuXG4gIGxldCBiZ0ZpbmlzaGVkID0gZmFsc2U7XG5cbiAgY29uc3QgZmFzdExvYWQgPSBhc3luYyAoKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgW2xvY2FsUmVzLCBjdywgYXddID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgICAgICAgZmV0Y2hMb2NhbFN0YXRlKCksXG4gICAgICAgICAgICBjaHJvbWUud2luZG93cy5nZXRDdXJyZW50KCkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKSxcbiAgICAgICAgICAgIGNocm9tZS53aW5kb3dzLmdldEFsbCh7IHdpbmRvd1R5cGVzOiBbXCJub3JtYWxcIl0sIHBvcHVsYXRlOiB0cnVlIH0pLmNhdGNoKCgpID0+IFtdKVxuICAgICAgICBdKTtcblxuICAgICAgICAvLyBPbmx5IHVwZGF0ZSBpZiBiYWNrZ3JvdW5kIGhhc24ndCBmaW5pc2hlZCB5ZXRcbiAgICAgICAgaWYgKCFiZ0ZpbmlzaGVkICYmIGxvY2FsUmVzLm9rICYmIGxvY2FsUmVzLmRhdGEpIHtcbiAgICAgICAgICAgICB1cGRhdGVVSShsb2NhbFJlcy5kYXRhLCBjdywgYXcgYXMgY2hyb21lLndpbmRvd3MuV2luZG93W10pO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLndhcm4oXCJGYXN0IGxvYWQgZmFpbGVkXCIsIGUpO1xuICAgIH1cbiAgfTtcblxuICBjb25zdCBiZ0xvYWQgPSBhc3luYyAoKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgW2JnUmVzLCBjdywgYXddID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgICAgICAgZmV0Y2hTdGF0ZSgpLFxuICAgICAgICAgICAgY2hyb21lLndpbmRvd3MuZ2V0Q3VycmVudCgpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCksXG4gICAgICAgICAgICBjaHJvbWUud2luZG93cy5nZXRBbGwoeyB3aW5kb3dUeXBlczogW1wibm9ybWFsXCJdLCBwb3B1bGF0ZTogdHJ1ZSB9KS5jYXRjaCgoKSA9PiBbXSlcbiAgICAgICAgXSk7XG5cbiAgICAgICAgYmdGaW5pc2hlZCA9IHRydWU7IC8vIE1hcmsgYXMgZmluaXNoZWQgc28gZmFzdCBsb2FkIGRvZXNuJ3Qgb3ZlcndyaXRlIGlmIGl0J3Mgc29tZWhvdyBzbG93XG5cbiAgICAgICAgaWYgKGJnUmVzLm9rICYmIGJnUmVzLmRhdGEpIHtcbiAgICAgICAgICAgICB1cGRhdGVVSShiZ1Jlcy5kYXRhLCBjdywgYXcgYXMgY2hyb21lLndpbmRvd3MuV2luZG93W10pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBsb2FkIHN0YXRlOlwiLCBiZ1Jlcy5lcnJvciA/PyBcIlVua25vd24gZXJyb3JcIik7XG4gICAgICAgICAgICBpZiAod2luZG93U3RhdGUubGVuZ3RoID09PSAwKSB7IC8vIE9ubHkgc2hvdyBlcnJvciBpZiB3ZSBoYXZlIE5PVEhJTkcgc2hvd25cbiAgICAgICAgICAgICAgICB3aW5kb3dzQ29udGFpbmVyLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPVwiZXJyb3Itc3RhdGVcIiBzdHlsZT1cInBhZGRpbmc6IDIwcHg7IGNvbG9yOiB2YXIoLS1lcnJvci1jb2xvciwgcmVkKTsgdGV4dC1hbGlnbjogY2VudGVyO1wiPlxuICAgICAgICAgICAgICAgICAgICBGYWlsZWQgdG8gbG9hZCB0YWJzOiAke2JnUmVzLmVycm9yID8/IFwiVW5rbm93biBlcnJvclwifS48YnI+XG4gICAgICAgICAgICAgICAgICAgIFBsZWFzZSByZWxvYWQgdGhlIGV4dGVuc2lvbiBvciBjaGVjayBwZXJtaXNzaW9ucy5cbiAgICAgICAgICAgICAgICA8L2Rpdj5gO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3IgbG9hZGluZyBzdGF0ZTpcIiwgZSk7XG4gICAgfVxuICB9O1xuXG4gIC8vIFN0YXJ0IGJvdGggY29uY3VycmVudGx5XG4gIGF3YWl0IFByb21pc2UuYWxsKFtmYXN0TG9hZCgpLCBiZ0xvYWQoKV0pO1xufTtcblxuY29uc3QgZ2V0U3RyYXRlZ3lJZHMgPSAoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IFNvcnRpbmdTdHJhdGVneVtdID0+IHtcbiAgICByZXR1cm4gQXJyYXkuZnJvbShjb250YWluZXIuY2hpbGRyZW4pXG4gICAgICAgIC5maWx0ZXIocm93ID0+IChyb3cucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cImNoZWNrYm94XCJdJykgYXMgSFRNTElucHV0RWxlbWVudCkuY2hlY2tlZClcbiAgICAgICAgLm1hcChyb3cgPT4gKHJvdyBhcyBIVE1MRWxlbWVudCkuZGF0YXNldC5pZCBhcyBTb3J0aW5nU3RyYXRlZ3kpO1xufTtcblxuY29uc3QgZ2V0U2VsZWN0ZWRTb3J0aW5nID0gKCk6IFNvcnRpbmdTdHJhdGVneVtdID0+IHtcbiAgLy8gVXNlIHRoZSBzaW5nbGUgdW5pZmllZCBjb250YWluZXJcbiAgcmV0dXJuIGdldFN0cmF0ZWd5SWRzKGFsbFN0cmF0ZWdpZXNDb250YWluZXIpO1xufTtcblxuY29uc3QgdHJpZ2dlckdyb3VwID0gYXN5bmMgKHNlbGVjdGlvbj86IEdyb3VwaW5nU2VsZWN0aW9uKSA9PiB7XG4gICAgbG9nSW5mbyhcIlRyaWdnZXJpbmcgZ3JvdXBpbmdcIiwgeyBzZWxlY3Rpb24gfSk7XG4gICAgc2hvd0xvYWRpbmcoXCJBcHBseWluZyBTdHJhdGVneS4uLlwiKTtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBzb3J0aW5nID0gZ2V0U2VsZWN0ZWRTb3J0aW5nKCk7XG4gICAgICAgIGF3YWl0IGFwcGx5R3JvdXBpbmcoeyBzZWxlY3Rpb24sIHNvcnRpbmcgfSk7XG4gICAgICAgIGF3YWl0IGxvYWRTdGF0ZSgpO1xuICAgIH0gZmluYWxseSB7XG4gICAgICAgIGhpZGVMb2FkaW5nKCk7XG4gICAgfVxufTtcblxuY2hyb21lLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKChtZXNzYWdlKSA9PiB7XG4gICAgaWYgKG1lc3NhZ2UudHlwZSA9PT0gJ2dyb3VwaW5nUHJvZ3Jlc3MnKSB7XG4gICAgICAgIGNvbnN0IHsgY29tcGxldGVkLCB0b3RhbCB9ID0gbWVzc2FnZS5wYXlsb2FkO1xuICAgICAgICB1cGRhdGVQcm9ncmVzcyhjb21wbGV0ZWQsIHRvdGFsKTtcbiAgICB9XG59KTtcblxuLy8gTGlzdGVuZXJzXG5zZWxlY3RBbGxDaGVja2JveC5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsIChlKSA9PiB7XG4gICAgY29uc3QgdGFyZ2V0U3RhdGUgPSAoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkuY2hlY2tlZDtcbiAgICBpZiAodGFyZ2V0U3RhdGUpIHtcbiAgICAgICAgLy8gU2VsZWN0IEFsbFxuICAgICAgICB3aW5kb3dTdGF0ZS5mb3JFYWNoKHdpbiA9PiB7XG4gICAgICAgICAgICB3aW4udGFicy5mb3JFYWNoKHRhYiA9PiBzZWxlY3RlZFRhYnMuYWRkKHRhYi5pZCkpO1xuICAgICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgICAvLyBEZXNlbGVjdCBBbGxcbiAgICAgICAgc2VsZWN0ZWRUYWJzLmNsZWFyKCk7XG4gICAgfVxuICAgIHJlbmRlclRyZWUoKTtcbn0pO1xuXG5idG5BcHBseT8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBsb2dJbmZvKFwiQXBwbHkgYnV0dG9uIGNsaWNrZWRcIiwgeyBzZWxlY3RlZENvdW50OiBzZWxlY3RlZFRhYnMuc2l6ZSB9KTtcbiAgICB0cmlnZ2VyR3JvdXAoeyB0YWJJZHM6IEFycmF5LmZyb20oc2VsZWN0ZWRUYWJzKSB9KTtcbn0pO1xuXG5idG5Vbmdyb3VwLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIGlmIChjb25maXJtKGBVbmdyb3VwICR7c2VsZWN0ZWRUYWJzLnNpemV9IHRhYnM/YCkpIHtcbiAgICAgIGxvZ0luZm8oXCJVbmdyb3VwaW5nIHRhYnNcIiwgeyBjb3VudDogc2VsZWN0ZWRUYWJzLnNpemUgfSk7XG4gICAgICBhd2FpdCBjaHJvbWUudGFicy51bmdyb3VwKEFycmF5LmZyb20oc2VsZWN0ZWRUYWJzKSk7XG4gICAgICBhd2FpdCBsb2FkU3RhdGUoKTtcbiAgfVxufSk7XG5idG5NZXJnZS5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICBpZiAoY29uZmlybShgTWVyZ2UgJHtzZWxlY3RlZFRhYnMuc2l6ZX0gdGFicyBpbnRvIG9uZSBncm91cD9gKSkge1xuICAgICAgbG9nSW5mbyhcIk1lcmdpbmcgdGFic1wiLCB7IGNvdW50OiBzZWxlY3RlZFRhYnMuc2l6ZSB9KTtcbiAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHNlbmRNZXNzYWdlKFwibWVyZ2VTZWxlY3Rpb25cIiwgeyB0YWJJZHM6IEFycmF5LmZyb20oc2VsZWN0ZWRUYWJzKSB9KTtcbiAgICAgIGlmICghcmVzLm9rKSBhbGVydChcIk1lcmdlIGZhaWxlZDogXCIgKyByZXMuZXJyb3IpO1xuICAgICAgZWxzZSBhd2FpdCBsb2FkU3RhdGUoKTtcbiAgfVxufSk7XG5idG5TcGxpdC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICBpZiAoY29uZmlybShgU3BsaXQgJHtzZWxlY3RlZFRhYnMuc2l6ZX0gdGFicyBpbnRvIGEgbmV3IHdpbmRvdz9gKSkge1xuICAgICAgbG9nSW5mbyhcIlNwbGl0dGluZyB0YWJzXCIsIHsgY291bnQ6IHNlbGVjdGVkVGFicy5zaXplIH0pO1xuICAgICAgY29uc3QgcmVzID0gYXdhaXQgc2VuZE1lc3NhZ2UoXCJzcGxpdFNlbGVjdGlvblwiLCB7IHRhYklkczogQXJyYXkuZnJvbShzZWxlY3RlZFRhYnMpIH0pO1xuICAgICAgaWYgKCFyZXMub2spIGFsZXJ0KFwiU3BsaXQgZmFpbGVkOiBcIiArIHJlcy5lcnJvcik7XG4gICAgICBlbHNlIGF3YWl0IGxvYWRTdGF0ZSgpO1xuICB9XG59KTtcblxuYnRuRXhwYW5kQWxsPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHdpbmRvd1N0YXRlLmZvckVhY2god2luID0+IHtcbiAgICAgICAgZXhwYW5kZWROb2Rlcy5hZGQoYHctJHt3aW4uaWR9YCk7XG4gICAgICAgIHdpbi50YWJzLmZvckVhY2godGFiID0+IHtcbiAgICAgICAgICAgIGlmICh0YWIuZ3JvdXBMYWJlbCkge1xuICAgICAgICAgICAgICAgICBleHBhbmRlZE5vZGVzLmFkZChgdy0ke3dpbi5pZH0tZy0ke3RhYi5ncm91cExhYmVsfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9KTtcbiAgICByZW5kZXJUcmVlKCk7XG59KTtcblxuYnRuQ29sbGFwc2VBbGw/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgZXhwYW5kZWROb2Rlcy5jbGVhcigpO1xuICAgIHJlbmRlclRyZWUoKTtcbn0pO1xuXG50b2dnbGVTdHJhdGVnaWVzLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgY29uc3QgaXNDb2xsYXBzZWQgPSBzdHJhdGVnaWVzTGlzdC5jbGFzc0xpc3QudG9nZ2xlKFwiY29sbGFwc2VkXCIpO1xuICAgIHRvZ2dsZVN0cmF0ZWdpZXMuY2xhc3NMaXN0LnRvZ2dsZShcImNvbGxhcHNlZFwiLCBpc0NvbGxhcHNlZCk7XG59KTtcblxuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5VbmRvXCIpPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICBsb2dJbmZvKFwiVW5kbyBjbGlja2VkXCIpO1xuICBjb25zdCByZXMgPSBhd2FpdCBzZW5kTWVzc2FnZShcInVuZG9cIik7XG4gIGlmICghcmVzLm9rKSBhbGVydChcIlVuZG8gZmFpbGVkOiBcIiArIHJlcy5lcnJvcik7XG59KTtcblxuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5TYXZlU3RhdGVcIik/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIGNvbnN0IG5hbWUgPSBwcm9tcHQoXCJFbnRlciBhIG5hbWUgZm9yIHRoaXMgc3RhdGU6XCIpO1xuICBpZiAobmFtZSkge1xuICAgIGxvZ0luZm8oXCJTYXZpbmcgc3RhdGVcIiwgeyBuYW1lIH0pO1xuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHNlbmRNZXNzYWdlKFwic2F2ZVN0YXRlXCIsIHsgbmFtZSB9KTtcbiAgICBpZiAoIXJlcy5vaykgYWxlcnQoXCJTYXZlIGZhaWxlZDogXCIgKyByZXMuZXJyb3IpO1xuICB9XG59KTtcblxuY29uc3QgbG9hZFN0YXRlRGlhbG9nID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsb2FkU3RhdGVEaWFsb2dcIikgYXMgSFRNTERpYWxvZ0VsZW1lbnQ7XG5jb25zdCBzYXZlZFN0YXRlTGlzdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2F2ZWRTdGF0ZUxpc3RcIikgYXMgSFRNTEVsZW1lbnQ7XG5cbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuTG9hZFN0YXRlXCIpPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICBsb2dJbmZvKFwiT3BlbmluZyBMb2FkIFN0YXRlIGRpYWxvZ1wiKTtcbiAgY29uc3QgcmVzID0gYXdhaXQgc2VuZE1lc3NhZ2U8U2F2ZWRTdGF0ZVtdPihcImdldFNhdmVkU3RhdGVzXCIpO1xuICBpZiAocmVzLm9rICYmIHJlcy5kYXRhKSB7XG4gICAgc2F2ZWRTdGF0ZUxpc3QuaW5uZXJIVE1MID0gXCJcIjtcbiAgICByZXMuZGF0YS5mb3JFYWNoKChzdGF0ZSkgPT4ge1xuICAgICAgY29uc3QgbGkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwibGlcIik7XG4gICAgICBsaS5zdHlsZS5kaXNwbGF5ID0gXCJmbGV4XCI7XG4gICAgICBsaS5zdHlsZS5qdXN0aWZ5Q29udGVudCA9IFwic3BhY2UtYmV0d2VlblwiO1xuICAgICAgbGkuc3R5bGUucGFkZGluZyA9IFwiOHB4XCI7XG4gICAgICBsaS5zdHlsZS5ib3JkZXJCb3R0b20gPSBcIjFweCBzb2xpZCB2YXIoLS1ib3JkZXItY29sb3IpXCI7XG5cbiAgICAgIGNvbnN0IHNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgICAgIHNwYW4udGV4dENvbnRlbnQgPSBgJHtzdGF0ZS5uYW1lfSAoJHtuZXcgRGF0ZShzdGF0ZS50aW1lc3RhbXApLnRvTG9jYWxlU3RyaW5nKCl9KWA7XG4gICAgICBzcGFuLnN0eWxlLmN1cnNvciA9IFwicG9pbnRlclwiO1xuICAgICAgc3Bhbi5vbmNsaWNrID0gYXN5bmMgKCkgPT4ge1xuICAgICAgICBpZiAoY29uZmlybShgTG9hZCBzdGF0ZSBcIiR7c3RhdGUubmFtZX1cIj9gKSkge1xuICAgICAgICAgIGxvZ0luZm8oXCJSZXN0b3Jpbmcgc3RhdGVcIiwgeyBuYW1lOiBzdGF0ZS5uYW1lIH0pO1xuICAgICAgICAgIGNvbnN0IHIgPSBhd2FpdCBzZW5kTWVzc2FnZShcInJlc3RvcmVTdGF0ZVwiLCB7IHN0YXRlIH0pO1xuICAgICAgICAgIGlmIChyLm9rKSB7XG4gICAgICAgICAgICAgIGxvYWRTdGF0ZURpYWxvZy5jbG9zZSgpO1xuICAgICAgICAgICAgICB3aW5kb3cuY2xvc2UoKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBhbGVydChcIlJlc3RvcmUgZmFpbGVkOiBcIiArIHIuZXJyb3IpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfTtcblxuICAgICAgY29uc3QgZGVsQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgICAgIGRlbEJ0bi50ZXh0Q29udGVudCA9IFwiRGVsZXRlXCI7XG4gICAgICBkZWxCdG4uc3R5bGUubWFyZ2luTGVmdCA9IFwiOHB4XCI7XG4gICAgICBkZWxCdG4uc3R5bGUuYmFja2dyb3VuZCA9IFwidHJhbnNwYXJlbnRcIjtcbiAgICAgIGRlbEJ0bi5zdHlsZS5jb2xvciA9IFwidmFyKC0tdGV4dC1jb2xvcilcIjtcbiAgICAgIGRlbEJ0bi5zdHlsZS5ib3JkZXIgPSBcIjFweCBzb2xpZCB2YXIoLS1ib3JkZXItY29sb3IpXCI7XG4gICAgICBkZWxCdG4uc3R5bGUuYm9yZGVyUmFkaXVzID0gXCI0cHhcIjtcbiAgICAgIGRlbEJ0bi5zdHlsZS5wYWRkaW5nID0gXCIycHggNnB4XCI7XG4gICAgICBkZWxCdG4ub25jbGljayA9IGFzeW5jIChlKSA9PiB7XG4gICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICBpZiAoY29uZmlybShgRGVsZXRlIHN0YXRlIFwiJHtzdGF0ZS5uYW1lfVwiP2ApKSB7XG4gICAgICAgICAgICAgIGF3YWl0IHNlbmRNZXNzYWdlKFwiZGVsZXRlU2F2ZWRTdGF0ZVwiLCB7IG5hbWU6IHN0YXRlLm5hbWUgfSk7XG4gICAgICAgICAgICAgIGxpLnJlbW92ZSgpO1xuICAgICAgICAgIH1cbiAgICAgIH07XG5cbiAgICAgIGxpLmFwcGVuZENoaWxkKHNwYW4pO1xuICAgICAgbGkuYXBwZW5kQ2hpbGQoZGVsQnRuKTtcbiAgICAgIHNhdmVkU3RhdGVMaXN0LmFwcGVuZENoaWxkKGxpKTtcbiAgICB9KTtcbiAgICBsb2FkU3RhdGVEaWFsb2cuc2hvd01vZGFsKCk7XG4gIH0gZWxzZSB7XG4gICAgICBhbGVydChcIkZhaWxlZCB0byBsb2FkIHN0YXRlczogXCIgKyByZXMuZXJyb3IpO1xuICB9XG59KTtcblxuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5DbG9zZUxvYWRTdGF0ZVwiKT8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBsb2FkU3RhdGVEaWFsb2cuY2xvc2UoKTtcbn0pO1xuXG5zZWFyY2hJbnB1dC5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgcmVuZGVyVHJlZSk7XG5cbi8vIEF1dG8tcmVmcmVzaFxuY2hyb21lLnRhYnMub25VcGRhdGVkLmFkZExpc3RlbmVyKCgpID0+IGxvYWRTdGF0ZSgpKTtcbmNocm9tZS50YWJzLm9uUmVtb3ZlZC5hZGRMaXN0ZW5lcigoKSA9PiBsb2FkU3RhdGUoKSk7XG5jaHJvbWUud2luZG93cy5vblJlbW92ZWQuYWRkTGlzdGVuZXIoKCkgPT4gbG9hZFN0YXRlKCkpO1xuXG4vLyAtLS0gVGhlbWUgTG9naWMgLS0tXG5jb25zdCBidG5UaGVtZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuVGhlbWVcIik7XG5jb25zdCBpY29uU3VuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJpY29uU3VuXCIpO1xuY29uc3QgaWNvbk1vb24gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImljb25Nb29uXCIpO1xuXG5jb25zdCBhcHBseVRoZW1lID0gKHRoZW1lOiAnbGlnaHQnIHwgJ2RhcmsnLCBzYXZlID0gZmFsc2UpID0+IHtcbiAgICBpZiAodGhlbWUgPT09ICdsaWdodCcpIHtcbiAgICAgICAgZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QuYWRkKCdsaWdodC1tb2RlJyk7XG4gICAgICAgIGlmIChpY29uU3VuKSBpY29uU3VuLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuICAgICAgICBpZiAoaWNvbk1vb24pIGljb25Nb29uLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QucmVtb3ZlKCdsaWdodC1tb2RlJyk7XG4gICAgICAgIGlmIChpY29uU3VuKSBpY29uU3VuLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgICAgIGlmIChpY29uTW9vbikgaWNvbk1vb24uc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG4gICAgfVxuXG4gICAgLy8gU3luYyB3aXRoIFByZWZlcmVuY2VzXG4gICAgaWYgKHNhdmUpIHtcbiAgICAgICAgLy8gV2UgdXNlIHNhdmVQcmVmZXJlbmNlcyB3aGljaCBjYWxscyB0aGUgYmFja2dyb3VuZCB0byBzdG9yZSBpdFxuICAgICAgICBsb2dJbmZvKFwiQXBwbHlpbmcgdGhlbWVcIiwgeyB0aGVtZSB9KTtcbiAgICAgICAgc2VuZE1lc3NhZ2UoXCJzYXZlUHJlZmVyZW5jZXNcIiwgeyB0aGVtZSB9KTtcbiAgICB9XG59O1xuXG4vLyBJbml0aWFsIGxvYWQgZmFsbGJhY2sgKGJlZm9yZSBsb2FkU3RhdGUgbG9hZHMgcHJlZnMpXG5jb25zdCBzdG9yZWRUaGVtZSA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKCd0aGVtZScpIGFzICdsaWdodCcgfCAnZGFyayc7XG4vLyBJZiB3ZSBoYXZlIGEgbG9jYWwgb3ZlcnJpZGUsIHVzZSBpdCB0ZW1wb3JhcmlseSwgYnV0IGxvYWRTdGF0ZSB3aWxsIGF1dGhvcml0YXRpdmUgY2hlY2sgcHJlZnNcbmlmIChzdG9yZWRUaGVtZSkgYXBwbHlUaGVtZShzdG9yZWRUaGVtZSwgZmFsc2UpO1xuXG5idG5UaGVtZT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgY29uc3QgaXNMaWdodCA9IGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LmNvbnRhaW5zKCdsaWdodC1tb2RlJyk7XG4gICAgY29uc3QgbmV3VGhlbWUgPSBpc0xpZ2h0ID8gJ2RhcmsnIDogJ2xpZ2h0JztcbiAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgndGhlbWUnLCBuZXdUaGVtZSk7IC8vIEtlZXAgbG9jYWwgY29weSBmb3IgZmFzdCBib290XG4gICAgYXBwbHlUaGVtZShuZXdUaGVtZSwgdHJ1ZSk7XG59KTtcblxuLy8gLS0tIFNldHRpbmdzIExvZ2ljIC0tLVxuY29uc3Qgc2V0dGluZ3NEaWFsb2cgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNldHRpbmdzRGlhbG9nXCIpIGFzIEhUTUxEaWFsb2dFbGVtZW50O1xuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5TZXR0aW5nc1wiKT8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXR0aW5nc0RpYWxvZy5zaG93TW9kYWwoKTtcbn0pO1xuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5DbG9zZVNldHRpbmdzXCIpPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldHRpbmdzRGlhbG9nLmNsb3NlKCk7XG59KTtcblxuY29uc3QgbG9nTGV2ZWxTZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImxvZ0xldmVsU2VsZWN0XCIpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xubG9nTGV2ZWxTZWxlY3Q/LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgYXN5bmMgKCkgPT4ge1xuICAgIGNvbnN0IG5ld0xldmVsID0gbG9nTGV2ZWxTZWxlY3QudmFsdWUgYXMgTG9nTGV2ZWw7XG4gICAgaWYgKHByZWZlcmVuY2VzKSB7XG4gICAgICAgIHByZWZlcmVuY2VzLmxvZ0xldmVsID0gbmV3TGV2ZWw7XG4gICAgICAgIC8vIFVwZGF0ZSBsb2NhbCBsb2dnZXIgaW1tZWRpYXRlbHlcbiAgICAgICAgc2V0TG9nZ2VyUHJlZmVyZW5jZXMocHJlZmVyZW5jZXMpO1xuICAgICAgICAvLyBQZXJzaXN0XG4gICAgICAgIGF3YWl0IHNlbmRNZXNzYWdlKFwic2F2ZVByZWZlcmVuY2VzXCIsIHsgbG9nTGV2ZWw6IG5ld0xldmVsIH0pO1xuICAgICAgICBsb2dEZWJ1ZyhcIkxvZyBsZXZlbCB1cGRhdGVkXCIsIHsgbGV2ZWw6IG5ld0xldmVsIH0pO1xuICAgIH1cbn0pO1xuXG4vLyAtLS0gUGluICYgUmVzaXplIExvZ2ljIC0tLVxuY29uc3QgYnRuUGluID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5QaW5cIik7XG5idG5QaW4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIGNvbnN0IHVybCA9IGNocm9tZS5ydW50aW1lLmdldFVSTChcInVpL3BvcHVwLmh0bWxcIik7XG4gIGF3YWl0IGNocm9tZS53aW5kb3dzLmNyZWF0ZSh7XG4gICAgdXJsLFxuICAgIHR5cGU6IFwicG9wdXBcIixcbiAgICB3aWR0aDogZG9jdW1lbnQuYm9keS5vZmZzZXRXaWR0aCxcbiAgICBoZWlnaHQ6IGRvY3VtZW50LmJvZHkub2Zmc2V0SGVpZ2h0XG4gIH0pO1xuICB3aW5kb3cuY2xvc2UoKTtcbn0pO1xuXG5jb25zdCByZXNpemVIYW5kbGUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJlc2l6ZUhhbmRsZVwiKTtcbmlmIChyZXNpemVIYW5kbGUpIHtcbiAgY29uc3Qgc2F2ZVNpemUgPSAodzogbnVtYmVyLCBoOiBudW1iZXIpID0+IHtcbiAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKFwicG9wdXBTaXplXCIsIEpTT04uc3RyaW5naWZ5KHsgd2lkdGg6IHcsIGhlaWdodDogaCB9KSk7XG4gIH07XG5cbiAgcmVzaXplSGFuZGxlLmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWRvd25cIiwgKGUpID0+IHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGNvbnN0IHN0YXJ0WCA9IGUuY2xpZW50WDtcbiAgICAgIGNvbnN0IHN0YXJ0WSA9IGUuY2xpZW50WTtcbiAgICAgIGNvbnN0IHN0YXJ0V2lkdGggPSBkb2N1bWVudC5ib2R5Lm9mZnNldFdpZHRoO1xuICAgICAgY29uc3Qgc3RhcnRIZWlnaHQgPSBkb2N1bWVudC5ib2R5Lm9mZnNldEhlaWdodDtcblxuICAgICAgY29uc3Qgb25Nb3VzZU1vdmUgPSAoZXY6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgICAgICBjb25zdCBuZXdXaWR0aCA9IE1hdGgubWF4KDUwMCwgc3RhcnRXaWR0aCArIChldi5jbGllbnRYIC0gc3RhcnRYKSk7XG4gICAgICAgICAgY29uc3QgbmV3SGVpZ2h0ID0gTWF0aC5tYXgoNTAwLCBzdGFydEhlaWdodCArIChldi5jbGllbnRZIC0gc3RhcnRZKSk7XG4gICAgICAgICAgZG9jdW1lbnQuYm9keS5zdHlsZS53aWR0aCA9IGAke25ld1dpZHRofXB4YDtcbiAgICAgICAgICBkb2N1bWVudC5ib2R5LnN0eWxlLmhlaWdodCA9IGAke25ld0hlaWdodH1weGA7XG4gICAgICB9O1xuXG4gICAgICBjb25zdCBvbk1vdXNlVXAgPSAoZXY6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgICAgICAgY29uc3QgbmV3V2lkdGggPSBNYXRoLm1heCg1MDAsIHN0YXJ0V2lkdGggKyAoZXYuY2xpZW50WCAtIHN0YXJ0WCkpO1xuICAgICAgICAgICBjb25zdCBuZXdIZWlnaHQgPSBNYXRoLm1heCg1MDAsIHN0YXJ0SGVpZ2h0ICsgKGV2LmNsaWVudFkgLSBzdGFydFkpKTtcbiAgICAgICAgICAgc2F2ZVNpemUobmV3V2lkdGgsIG5ld0hlaWdodCk7XG4gICAgICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb3VzZW1vdmVcIiwgb25Nb3VzZU1vdmUpO1xuICAgICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwibW91c2V1cFwiLCBvbk1vdXNlVXApO1xuICAgICAgfTtcblxuICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlbW92ZVwiLCBvbk1vdXNlTW92ZSk7XG4gICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwibW91c2V1cFwiLCBvbk1vdXNlVXApO1xuICB9KTtcbn1cblxuY29uc3QgYWRqdXN0Rm9yV2luZG93VHlwZSA9IGFzeW5jICgpID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCB3aW4gPSBhd2FpdCBjaHJvbWUud2luZG93cy5nZXRDdXJyZW50KCk7XG4gICAgaWYgKHdpbi50eXBlID09PSBcInBvcHVwXCIpIHtcbiAgICAgICBpZiAoYnRuUGluKSBidG5QaW4uc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgICAgIC8vIEVuYWJsZSByZXNpemUgaGFuZGxlIGluIHBpbm5lZCBtb2RlIGlmIGl0IHdhcyBoaWRkZW5cbiAgICAgICBpZiAocmVzaXplSGFuZGxlKSByZXNpemVIYW5kbGUuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICAgICBkb2N1bWVudC5ib2R5LnN0eWxlLndpZHRoID0gXCIxMDAlXCI7XG4gICAgICAgZG9jdW1lbnQuYm9keS5zdHlsZS5oZWlnaHQgPSBcIjEwMCVcIjtcbiAgICB9IGVsc2Uge1xuICAgICAgICAvLyBEaXNhYmxlIHJlc2l6ZSBoYW5kbGUgaW4gZG9ja2VkIG1vZGVcbiAgICAgICAgaWYgKHJlc2l6ZUhhbmRsZSkgcmVzaXplSGFuZGxlLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICAgICAgLy8gQ2xlYXIgYW55IHByZXZpb3VzIHNpemUgb3ZlcnJpZGVzXG4gICAgICAgIGRvY3VtZW50LmJvZHkuc3R5bGUud2lkdGggPSBcIlwiO1xuICAgICAgICBkb2N1bWVudC5ib2R5LnN0eWxlLmhlaWdodCA9IFwiXCI7XG4gICAgfVxuICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3IgY2hlY2tpbmcgd2luZG93IHR5cGU6XCIsIGUpO1xuICB9XG59O1xuXG5hZGp1c3RGb3JXaW5kb3dUeXBlKCk7XG5sb2FkU3RhdGUoKS5jYXRjaChlID0+IGNvbnNvbGUuZXJy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QUFDLE1BQU07QUFDOUMsTUFBRSxlQUFlO0FBQ2pCLFVBQU0sU0FBUyxFQUFFO0FBQ2pCLFVBQU0sU0FBUyxFQUFFO0FBQ2pCLFVBQU0sYUFBYSxTQUFTLEtBQUs7QUFDakMsVUFBTSxjQUFjLFNBQVMsS0FBSztBQUVsQyxVQUFNLGNBQWMsQ0FBQyxPQUFtQjtBQUNwQyxZQUFNLFdBQVcsS0FBSyxJQUFJLEtBQUssY0FBYyxHQUFHLFVBQVUsT0FBTztBQUNqRSxZQUFNLFlBQVksS0FBSyxJQUFJLEtBQUssZUFBZSxHQUFHLFVBQVUsT0FBTztBQUNuRSxlQUFTLEtBQUssTUFBTSxRQUFRLEdBQUcsUUFBUTtBQUN2QyxlQUFTLEtBQUssTUFBTSxTQUFTLEdBQUcsU0FBUztBQUFBLElBQzdDO0FBRUEsVUFBTSxZQUFZLENBQUMsT0FBbUI7QUFDakMsWUFBTSxXQUFXLEtBQUssSUFBSSxLQUFLLGNBQWMsR0FBRyxVQUFVLE9BQU87QUFDakUsWUFBTSxZQUFZLEtBQUssSUFBSSxLQUFLLGVBQWUsR0FBRyxVQUFVLE9BQU87QUFDbkUsZUFBUyxVQUFVLFNBQVM7QUFDNUIsZUFBUyxvQkFBb0IsYUFBYSxXQUFXO0FBQ3JELGVBQVMsb0JBQW9CLFdBQVcsU0FBUztBQUFBLElBQ3REO0FBRUEsYUFBUyxpQkFBaUIsYUFBYSxXQUFXO0FBQ2xELGFBQVMsaUJBQWlCLFdBQVcsU0FBUztBQUFBLEVBQ2xELENBQUM7QUFDSDtBQUVBLElBQU0sc0JBQXNCLFlBQVk7QUFDdEMsTUFBSTtBQUNGLFVBQU0sTUFBTSxNQUFNLE9BQU8sUUFBUSxXQUFXO0FBQzVDLFFBQUksSUFBSSxTQUFTLFNBQVM7QUFDdkIsVUFBSSxPQUFRLFFBQU8sTUFBTSxVQUFVO0FBRW5DLFVBQUksYUFBYyxjQUFhLE1BQU0sVUFBVTtBQUMvQyxlQUFTLEtBQUssTUFBTSxRQUFRO0FBQzVCLGVBQVMsS0FBSyxNQUFNLFNBQVM7QUFBQSxJQUNoQyxPQUFPO0FBRUgsVUFBSSxhQUFjLGNBQWEsTUFBTSxVQUFVO0FBRS9DLGVBQVMsS0FBSyxNQUFNLFFBQVE7QUFDNUIsZUFBUyxLQUFLLE1BQU0sU0FBUztBQUFBLElBQ2pDO0FBQUEsRUFDRixTQUFTLEdBQUc7QUFDUixZQUFRLE1BQU0sK0JBQStCLENBQUM7QUFBQSxFQUNsRDtBQUNGO0FBRUEsb0JBQW9CO0FBQ3BCLFVBQVUsRUFBRSxNQUFNLE9BQUssUUFBUSxNQUFNLHFCQUFxQixDQUFDLENBQUM7IiwKICAibmFtZXMiOiBbImN1c3RvbVN0cmF0ZWdpZXMiLCAibWF0Y2giLCAicHJlZmVyZW5jZXMiLCAidGFicyIsICJ3aW5kb3ciXQp9Cg==
