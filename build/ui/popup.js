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
  addStrategySelect.innerHTML = '<option value="" disabled selected>Topic</option>';
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
adjustForWindowType();
loadState().catch((e) => console.error("Load state failed", e));
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3NoYXJlZC91dGlscy50cyIsICIuLi8uLi9zcmMvc2hhcmVkL3N0cmF0ZWd5UmVnaXN0cnkudHMiLCAiLi4vLi4vc3JjL3NoYXJlZC9sb2dnZXIudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZ3JvdXBpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3NvcnRpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy91aS9sb2NhbFN0YXRlLnRzIiwgIi4uLy4uL3NyYy91aS9jb21tb24udHMiLCAiLi4vLi4vc3JjL3VpL3BvcHVwLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyBQcmVmZXJlbmNlcywgU29ydGluZ1N0cmF0ZWd5LCBUYWJNZXRhZGF0YSB9IGZyb20gXCIuL3R5cGVzLmpzXCI7XG5cbmV4cG9ydCBjb25zdCBtYXBDaHJvbWVUYWIgPSAodGFiOiBjaHJvbWUudGFicy5UYWIpOiBUYWJNZXRhZGF0YSB8IG51bGwgPT4ge1xuICBpZiAoIXRhYi5pZCB8fCAhdGFiLndpbmRvd0lkKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHtcbiAgICBpZDogdGFiLmlkLFxuICAgIHdpbmRvd0lkOiB0YWIud2luZG93SWQsXG4gICAgdGl0bGU6IHRhYi50aXRsZSB8fCBcIlVudGl0bGVkXCIsXG4gICAgdXJsOiB0YWIudXJsIHx8IFwiYWJvdXQ6YmxhbmtcIixcbiAgICBwaW5uZWQ6IEJvb2xlYW4odGFiLnBpbm5lZCksXG4gICAgbGFzdEFjY2Vzc2VkOiB0YWIubGFzdEFjY2Vzc2VkLFxuICAgIG9wZW5lclRhYklkOiB0YWIub3BlbmVyVGFiSWQgPz8gdW5kZWZpbmVkLFxuICAgIGZhdkljb25Vcmw6IHRhYi5mYXZJY29uVXJsLFxuICAgIGdyb3VwSWQ6IHRhYi5ncm91cElkLFxuICAgIGluZGV4OiB0YWIuaW5kZXgsXG4gICAgYWN0aXZlOiB0YWIuYWN0aXZlLFxuICAgIHN0YXR1czogdGFiLnN0YXR1cyxcbiAgICBzZWxlY3RlZDogdGFiLmhpZ2hsaWdodGVkXG4gIH07XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0U3RvcmVkUHJlZmVyZW5jZXMgPSBhc3luYyAoKTogUHJvbWlzZTxQcmVmZXJlbmNlcyB8IG51bGw+ID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFwicHJlZmVyZW5jZXNcIiwgKGl0ZW1zKSA9PiB7XG4gICAgICByZXNvbHZlKChpdGVtc1tcInByZWZlcmVuY2VzXCJdIGFzIFByZWZlcmVuY2VzKSA/PyBudWxsKTtcbiAgICB9KTtcbiAgfSk7XG59O1xuXG5leHBvcnQgY29uc3QgYXNBcnJheSA9IDxUPih2YWx1ZTogdW5rbm93bik6IFRbXSA9PiB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSByZXR1cm4gdmFsdWUgYXMgVFtdO1xuICAgIHJldHVybiBbXTtcbn07XG4iLCAiaW1wb3J0IHsgQ3VzdG9tU3RyYXRlZ3ksIFNvcnRpbmdTdHJhdGVneSB9IGZyb20gXCIuL3R5cGVzLmpzXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RyYXRlZ3lEZWZpbml0aW9uIHtcbiAgICBpZDogU29ydGluZ1N0cmF0ZWd5IHwgc3RyaW5nO1xuICAgIGxhYmVsOiBzdHJpbmc7XG4gICAgaXNHcm91cGluZzogYm9vbGVhbjtcbiAgICBpc1NvcnRpbmc6IGJvb2xlYW47XG4gICAgdGFncz86IHN0cmluZ1tdO1xuICAgIGF1dG9SdW4/OiBib29sZWFuO1xuICAgIGlzQ3VzdG9tPzogYm9vbGVhbjtcbn1cblxuLy8gUmVzdG9yZWQgc3RyYXRlZ2llcyBtYXRjaGluZyBiYWNrZ3JvdW5kIGNhcGFiaWxpdGllcy5cbmV4cG9ydCBjb25zdCBTVFJBVEVHSUVTOiBTdHJhdGVneURlZmluaXRpb25bXSA9IFtcbiAgICB7IGlkOiBcImRvbWFpblwiLCBsYWJlbDogXCJEb21haW5cIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImRvbWFpbl9mdWxsXCIsIGxhYmVsOiBcIkZ1bGwgRG9tYWluXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJ0b3BpY1wiLCBsYWJlbDogXCJUb3BpY1wiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwiY29udGV4dFwiLCBsYWJlbDogXCJDb250ZXh0XCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJsaW5lYWdlXCIsIGxhYmVsOiBcIkxpbmVhZ2VcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInBpbm5lZFwiLCBsYWJlbDogXCJQaW5uZWRcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInJlY2VuY3lcIiwgbGFiZWw6IFwiUmVjZW5jeVwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwiYWdlXCIsIGxhYmVsOiBcIkFnZVwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwidXJsXCIsIGxhYmVsOiBcIlVSTFwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwibmVzdGluZ1wiLCBsYWJlbDogXCJOZXN0aW5nXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJ0aXRsZVwiLCBsYWJlbDogXCJUaXRsZVwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuXTtcblxuZXhwb3J0IGNvbnN0IGdldFN0cmF0ZWdpZXMgPSAoY3VzdG9tU3RyYXRlZ2llcz86IEN1c3RvbVN0cmF0ZWd5W10pOiBTdHJhdGVneURlZmluaXRpb25bXSA9PiB7XG4gICAgaWYgKCFjdXN0b21TdHJhdGVnaWVzIHx8IGN1c3RvbVN0cmF0ZWdpZXMubGVuZ3RoID09PSAwKSByZXR1cm4gU1RSQVRFR0lFUztcblxuICAgIC8vIEN1c3RvbSBzdHJhdGVnaWVzIGNhbiBvdmVycmlkZSBidWlsdC1pbnMgaWYgSURzIG1hdGNoLCBvciBhZGQgbmV3IG9uZXMuXG4gICAgY29uc3QgY29tYmluZWQgPSBbLi4uU1RSQVRFR0lFU107XG5cbiAgICBjdXN0b21TdHJhdGVnaWVzLmZvckVhY2goY3VzdG9tID0+IHtcbiAgICAgICAgY29uc3QgZXhpc3RpbmdJbmRleCA9IGNvbWJpbmVkLmZpbmRJbmRleChzID0+IHMuaWQgPT09IGN1c3RvbS5pZCk7XG5cbiAgICAgICAgLy8gRGV0ZXJtaW5lIGNhcGFiaWxpdGllcyBiYXNlZCBvbiBydWxlcyBwcmVzZW5jZVxuICAgICAgICBjb25zdCBoYXNHcm91cGluZyA9IChjdXN0b20uZ3JvdXBpbmdSdWxlcyAmJiBjdXN0b20uZ3JvdXBpbmdSdWxlcy5sZW5ndGggPiAwKSB8fCAoY3VzdG9tLnJ1bGVzICYmIGN1c3RvbS5ydWxlcy5sZW5ndGggPiAwKSB8fCBmYWxzZTtcbiAgICAgICAgY29uc3QgaGFzU29ydGluZyA9IChjdXN0b20uc29ydGluZ1J1bGVzICYmIGN1c3RvbS5zb3J0aW5nUnVsZXMubGVuZ3RoID4gMCkgfHwgKGN1c3RvbS5ydWxlcyAmJiBjdXN0b20ucnVsZXMubGVuZ3RoID4gMCkgfHwgZmFsc2U7XG5cbiAgICAgICAgY29uc3QgdGFnczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgaWYgKGhhc0dyb3VwaW5nKSB0YWdzLnB1c2goXCJncm91cFwiKTtcbiAgICAgICAgaWYgKGhhc1NvcnRpbmcpIHRhZ3MucHVzaChcInNvcnRcIik7XG5cbiAgICAgICAgY29uc3QgZGVmaW5pdGlvbjogU3RyYXRlZ3lEZWZpbml0aW9uID0ge1xuICAgICAgICAgICAgaWQ6IGN1c3RvbS5pZCxcbiAgICAgICAgICAgIGxhYmVsOiBjdXN0b20ubGFiZWwsXG4gICAgICAgICAgICBpc0dyb3VwaW5nOiBoYXNHcm91cGluZyxcbiAgICAgICAgICAgIGlzU29ydGluZzogaGFzU29ydGluZyxcbiAgICAgICAgICAgIHRhZ3M6IHRhZ3MsXG4gICAgICAgICAgICBhdXRvUnVuOiBjdXN0b20uYXV0b1J1bixcbiAgICAgICAgICAgIGlzQ3VzdG9tOiB0cnVlXG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKGV4aXN0aW5nSW5kZXggIT09IC0xKSB7XG4gICAgICAgICAgICBjb21iaW5lZFtleGlzdGluZ0luZGV4XSA9IGRlZmluaXRpb247XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb21iaW5lZC5wdXNoKGRlZmluaXRpb24pO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gY29tYmluZWQ7XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0U3RyYXRlZ3kgPSAoaWQ6IFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZyk6IFN0cmF0ZWd5RGVmaW5pdGlvbiB8IHVuZGVmaW5lZCA9PiBTVFJBVEVHSUVTLmZpbmQocyA9PiBzLmlkID09PSBpZCk7XG4iLCAiaW1wb3J0IHsgTG9nRW50cnksIExvZ0xldmVsLCBQcmVmZXJlbmNlcyB9IGZyb20gXCIuL3R5cGVzLmpzXCI7XG5cbmNvbnN0IFBSRUZJWCA9IFwiW1RhYlNvcnRlcl1cIjtcblxuY29uc3QgTEVWRUxfUFJJT1JJVFk6IFJlY29yZDxMb2dMZXZlbCwgbnVtYmVyPiA9IHtcbiAgZGVidWc6IDAsXG4gIGluZm86IDEsXG4gIHdhcm46IDIsXG4gIGVycm9yOiAzLFxuICBjcml0aWNhbDogNFxufTtcblxubGV0IGN1cnJlbnRMZXZlbDogTG9nTGV2ZWwgPSBcImluZm9cIjtcbmxldCBsb2dzOiBMb2dFbnRyeVtdID0gW107XG5jb25zdCBNQVhfTE9HUyA9IDEwMDA7XG5jb25zdCBTVE9SQUdFX0tFWSA9IFwic2Vzc2lvbkxvZ3NcIjtcblxuLy8gU2FmZSBjb250ZXh0IGNoZWNrXG5jb25zdCBpc1NlcnZpY2VXb3JrZXIgPSB0eXBlb2Ygc2VsZiAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVvZiAoc2VsZiBhcyBhbnkpLlNlcnZpY2VXb3JrZXJHbG9iYWxTY29wZSAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYgaW5zdGFuY2VvZiAoc2VsZiBhcyBhbnkpLlNlcnZpY2VXb3JrZXJHbG9iYWxTY29wZTtcbmxldCBpc1NhdmluZyA9IGZhbHNlO1xubGV0IHBlbmRpbmdTYXZlID0gZmFsc2U7XG5sZXQgc2F2ZVRpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsO1xuXG5jb25zdCBkb1NhdmUgPSAoKSA9PiB7XG4gICAgaWYgKCFpc1NlcnZpY2VXb3JrZXIgfHwgIWNocm9tZT8uc3RvcmFnZT8uc2Vzc2lvbiB8fCBpc1NhdmluZykge1xuICAgICAgICBwZW5kaW5nU2F2ZSA9IHRydWU7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpc1NhdmluZyA9IHRydWU7XG4gICAgcGVuZGluZ1NhdmUgPSBmYWxzZTtcblxuICAgIGNocm9tZS5zdG9yYWdlLnNlc3Npb24uc2V0KHsgW1NUT1JBR0VfS0VZXTogbG9ncyB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgaXNTYXZpbmcgPSBmYWxzZTtcbiAgICAgICAgaWYgKHBlbmRpbmdTYXZlKSB7XG4gICAgICAgICAgICBzYXZlTG9nc1RvU3RvcmFnZSgpO1xuICAgICAgICB9XG4gICAgfSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBzYXZlIGxvZ3NcIiwgZXJyKTtcbiAgICAgICAgaXNTYXZpbmcgPSBmYWxzZTtcbiAgICB9KTtcbn07XG5cbmNvbnN0IHNhdmVMb2dzVG9TdG9yYWdlID0gKCkgPT4ge1xuICAgIGlmIChzYXZlVGltZXIpIGNsZWFyVGltZW91dChzYXZlVGltZXIpO1xuICAgIHNhdmVUaW1lciA9IHNldFRpbWVvdXQoZG9TYXZlLCAxMDAwKTtcbn07XG5cbmxldCByZXNvbHZlTG9nZ2VyUmVhZHk6ICgpID0+IHZvaWQ7XG5leHBvcnQgY29uc3QgbG9nZ2VyUmVhZHkgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcbiAgICByZXNvbHZlTG9nZ2VyUmVhZHkgPSByZXNvbHZlO1xufSk7XG5cbmV4cG9ydCBjb25zdCBpbml0TG9nZ2VyID0gYXN5bmMgKCkgPT4ge1xuICAgIGlmIChpc1NlcnZpY2VXb3JrZXIgJiYgY2hyb21lPy5zdG9yYWdlPy5zZXNzaW9uKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjaHJvbWUuc3RvcmFnZS5zZXNzaW9uLmdldChTVE9SQUdFX0tFWSk7XG4gICAgICAgICAgICBpZiAocmVzdWx0W1NUT1JBR0VfS0VZXSAmJiBBcnJheS5pc0FycmF5KHJlc3VsdFtTVE9SQUdFX0tFWV0pKSB7XG4gICAgICAgICAgICAgICAgbG9ncyA9IHJlc3VsdFtTVE9SQUdFX0tFWV07XG4gICAgICAgICAgICAgICAgaWYgKGxvZ3MubGVuZ3RoID4gTUFYX0xPR1MpIGxvZ3MgPSBsb2dzLnNsaWNlKDAsIE1BWF9MT0dTKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byByZXN0b3JlIGxvZ3NcIiwgZSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKHJlc29sdmVMb2dnZXJSZWFkeSkgcmVzb2x2ZUxvZ2dlclJlYWR5KCk7XG59O1xuXG5leHBvcnQgY29uc3Qgc2V0TG9nZ2VyUHJlZmVyZW5jZXMgPSAocHJlZnM6IFByZWZlcmVuY2VzKSA9PiB7XG4gIGlmIChwcmVmcy5sb2dMZXZlbCkge1xuICAgIGN1cnJlbnRMZXZlbCA9IHByZWZzLmxvZ0xldmVsO1xuICB9IGVsc2UgaWYgKHByZWZzLmRlYnVnKSB7XG4gICAgY3VycmVudExldmVsID0gXCJkZWJ1Z1wiO1xuICB9IGVsc2Uge1xuICAgIGN1cnJlbnRMZXZlbCA9IFwiaW5mb1wiO1xuICB9XG59O1xuXG5jb25zdCBzaG91bGRMb2cgPSAobGV2ZWw6IExvZ0xldmVsKTogYm9vbGVhbiA9PiB7XG4gIHJldHVybiBMRVZFTF9QUklPUklUWVtsZXZlbF0gPj0gTEVWRUxfUFJJT1JJVFlbY3VycmVudExldmVsXTtcbn07XG5cbmNvbnN0IGZvcm1hdE1lc3NhZ2UgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgcmV0dXJuIGNvbnRleHQgPyBgJHttZXNzYWdlfSA6OiAke0pTT04uc3RyaW5naWZ5KGNvbnRleHQpfWAgOiBtZXNzYWdlO1xufTtcblxuY29uc3QgYWRkTG9nID0gKGxldmVsOiBMb2dMZXZlbCwgbWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgLy8gQWx3YXlzIGFkZCB0byBidWZmZXIgcmVnYXJkbGVzcyBvZiBjdXJyZW50IGNvbnNvbGUgbGV2ZWwgc2V0dGluZyxcbiAgLy8gb3Igc2hvdWxkIHdlIHJlc3BlY3QgaXQ/IFVzdWFsbHkgZGVidWcgbG9ncyBhcmUgbm9pc3kuXG4gIC8vIExldCdzIHJlc3BlY3Qgc2hvdWxkTG9nIGZvciB0aGUgYnVmZmVyIHRvbyB0byBzYXZlIG1lbW9yeS9ub2lzZSxcbiAgLy8gT1Igd2UgY2FuIHN0b3JlIGV2ZXJ5dGhpbmcgYnV0IGZpbHRlciBvbiB2aWV3LlxuICAvLyBHaXZlbiB3ZSB3YW50IHRvIGRlYnVnIGlzc3Vlcywgc3RvcmluZyBldmVyeXRoaW5nIG1pZ2h0IGJlIGJldHRlcixcbiAgLy8gYnV0IGlmIHdlIHN0b3JlIGV2ZXJ5dGhpbmcgd2UgbWlnaHQgZmlsbCBidWZmZXIgd2l0aCBkZWJ1ZyBub2lzZSBxdWlja2x5LlxuICAvLyBMZXQncyBzdGljayB0byBzdG9yaW5nIHdoYXQgaXMgY29uZmlndXJlZCB0byBiZSBsb2dnZWQuXG4gIC8vIFdhaXQsIGlmIEkgd2FudCB0byBcImRlYnVnXCIgc29tZXRoaW5nLCBJIHVzdWFsbHkgdHVybiBvbiBkZWJ1ZyBsb2dzLlxuICAvLyBJZiBJIGNhbid0IHNlZSBwYXN0IGxvZ3MgYmVjYXVzZSB0aGV5IHdlcmVuJ3Qgc3RvcmVkLCBJIGhhdmUgdG8gcmVwcm8uXG4gIC8vIExldCdzIHN0b3JlIGlmIGl0IHBhc3NlcyBgc2hvdWxkTG9nYC5cblxuICBpZiAoc2hvdWxkTG9nKGxldmVsKSkge1xuICAgICAgY29uc3QgZW50cnk6IExvZ0VudHJ5ID0ge1xuICAgICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcbiAgICAgICAgICBsZXZlbCxcbiAgICAgICAgICBtZXNzYWdlLFxuICAgICAgICAgIGNvbnRleHRcbiAgICAgIH07XG5cbiAgICAgIGlmIChpc1NlcnZpY2VXb3JrZXIpIHtcbiAgICAgICAgICBsb2dzLnVuc2hpZnQoZW50cnkpO1xuICAgICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSB7XG4gICAgICAgICAgICAgIGxvZ3MucG9wKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIEluIG90aGVyIGNvbnRleHRzLCBzZW5kIHRvIFNXXG4gICAgICAgICAgaWYgKGNocm9tZT8ucnVudGltZT8uc2VuZE1lc3NhZ2UpIHtcbiAgICAgICAgICAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdsb2dFbnRyeScsIHBheWxvYWQ6IGVudHJ5IH0pLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgLy8gSWdub3JlIGlmIG1lc3NhZ2UgZmFpbHMgKGUuZy4gY29udGV4dCBpbnZhbGlkYXRlZClcbiAgICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICB9XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBhZGRMb2dFbnRyeSA9IChlbnRyeTogTG9nRW50cnkpID0+IHtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSB7XG4gICAgICAgIGxvZ3MudW5zaGlmdChlbnRyeSk7XG4gICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSB7XG4gICAgICAgICAgICBsb2dzLnBvcCgpO1xuICAgICAgICB9XG4gICAgICAgIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG4gICAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGdldExvZ3MgPSAoKSA9PiBbLi4ubG9nc107XG5leHBvcnQgY29uc3QgY2xlYXJMb2dzID0gKCkgPT4ge1xuICAgIGxvZ3MubGVuZ3RoID0gMDtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSBzYXZlTG9nc1RvU3RvcmFnZSgpO1xufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0RlYnVnID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImRlYnVnXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwiZGVidWdcIikpIHtcbiAgICBjb25zb2xlLmRlYnVnKGAke1BSRUZJWH0gW0RFQlVHXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgY29udGV4dCl9YCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBsb2dJbmZvID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImluZm9cIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJpbmZvXCIpKSB7XG4gICAgY29uc29sZS5pbmZvKGAke1BSRUZJWH0gW0lORk9dICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ1dhcm4gPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwid2FyblwiLCBtZXNzYWdlLCBjb250ZXh0KTtcbiAgaWYgKHNob3VsZExvZyhcIndhcm5cIikpIHtcbiAgICBjb25zb2xlLndhcm4oYCR7UFJFRklYfSBbV0FSTl0gJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nRXJyb3IgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwiZXJyb3JcIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJlcnJvclwiKSkge1xuICAgIGNvbnNvbGUuZXJyb3IoYCR7UFJFRklYfSBbRVJST1JdICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0NyaXRpY2FsID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImNyaXRpY2FsXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwiY3JpdGljYWxcIikpIHtcbiAgICAvLyBDcml0aWNhbCBsb2dzIHVzZSBlcnJvciBjb25zb2xlIGJ1dCB3aXRoIGRpc3RpbmN0IHByZWZpeCBhbmQgbWF5YmUgc3R5bGluZyBpZiBzdXBwb3J0ZWRcbiAgICBjb25zb2xlLmVycm9yKGAke1BSRUZJWH0gW0NSSVRJQ0FMXSBcdUQ4M0RcdURFQTggJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuIiwgImltcG9ydCB7IEdyb3VwaW5nU3RyYXRlZ3ksIFNvcnRpbmdTdHJhdGVneSwgVGFiR3JvdXAsIFRhYk1ldGFkYXRhLCBDdXN0b21TdHJhdGVneSwgU3RyYXRlZ3lSdWxlLCBSdWxlQ29uZGl0aW9uLCBHcm91cGluZ1J1bGUsIFNvcnRpbmdSdWxlIH0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgZ2V0U3RyYXRlZ2llcyB9IGZyb20gXCIuLi9zaGFyZWQvc3RyYXRlZ3lSZWdpc3RyeS5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcblxubGV0IGN1c3RvbVN0cmF0ZWdpZXM6IEN1c3RvbVN0cmF0ZWd5W10gPSBbXTtcblxuZXhwb3J0IGNvbnN0IHNldEN1c3RvbVN0cmF0ZWdpZXMgPSAoc3RyYXRlZ2llczogQ3VzdG9tU3RyYXRlZ3lbXSkgPT4ge1xuICAgIGN1c3RvbVN0cmF0ZWdpZXMgPSBzdHJhdGVnaWVzO1xufTtcblxuZXhwb3J0IGNvbnN0IGdldEN1c3RvbVN0cmF0ZWdpZXMgPSAoKTogQ3VzdG9tU3RyYXRlZ3lbXSA9PiBjdXN0b21TdHJhdGVnaWVzO1xuXG5jb25zdCBDT0xPUlMgPSBbXCJncmV5XCIsIFwiYmx1ZVwiLCBcInJlZFwiLCBcInllbGxvd1wiLCBcImdyZWVuXCIsIFwicGlua1wiLCBcInB1cnBsZVwiLCBcImN5YW5cIiwgXCJvcmFuZ2VcIl07XG5cbmNvbnN0IHJlZ2V4Q2FjaGUgPSBuZXcgTWFwPHN0cmluZywgUmVnRXhwPigpO1xuXG5leHBvcnQgY29uc3QgZG9tYWluRnJvbVVybCA9ICh1cmw6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcGFyc2VkID0gbmV3IFVSTCh1cmwpO1xuICAgIHJldHVybiBwYXJzZWQuaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sIFwiXCIpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGxvZ0RlYnVnKFwiRmFpbGVkIHRvIHBhcnNlIGRvbWFpblwiLCB7IHVybCwgZXJyb3I6IFN0cmluZyhlcnJvcikgfSk7XG4gICAgcmV0dXJuIFwidW5rbm93blwiO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3Qgc3ViZG9tYWluRnJvbVVybCA9ICh1cmw6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcGFyc2VkID0gbmV3IFVSTCh1cmwpO1xuICAgICAgICBsZXQgaG9zdG5hbWUgPSBwYXJzZWQuaG9zdG5hbWU7XG4gICAgICAgIC8vIFJlbW92ZSB3d3cuXG4gICAgICAgIGhvc3RuYW1lID0gaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sIFwiXCIpO1xuXG4gICAgICAgIGNvbnN0IHBhcnRzID0gaG9zdG5hbWUuc3BsaXQoJy4nKTtcbiAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDIpIHtcbiAgICAgICAgICAgICByZXR1cm4gcGFydHMuc2xpY2UoMCwgcGFydHMubGVuZ3RoIC0gMikuam9pbignLicpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBcIlwiO1xuICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gXCJcIjtcbiAgICB9XG59XG5cbmV4cG9ydCBjb25zdCBnZXRGaWVsZFZhbHVlID0gKHRhYjogVGFiTWV0YWRhdGEsIGZpZWxkOiBzdHJpbmcpOiBhbnkgPT4ge1xuICAgIHN3aXRjaChmaWVsZCkge1xuICAgICAgICBjYXNlICdpZCc6IHJldHVybiB0YWIuaWQ7XG4gICAgICAgIGNhc2UgJ2luZGV4JzogcmV0dXJuIHRhYi5pbmRleDtcbiAgICAgICAgY2FzZSAnd2luZG93SWQnOiByZXR1cm4gdGFiLndpbmRvd0lkO1xuICAgICAgICBjYXNlICdncm91cElkJzogcmV0dXJuIHRhYi5ncm91cElkO1xuICAgICAgICBjYXNlICd0aXRsZSc6IHJldHVybiB0YWIudGl0bGU7XG4gICAgICAgIGNhc2UgJ3VybCc6IHJldHVybiB0YWIudXJsO1xuICAgICAgICBjYXNlICdzdGF0dXMnOiByZXR1cm4gdGFiLnN0YXR1cztcbiAgICAgICAgY2FzZSAnYWN0aXZlJzogcmV0dXJuIHRhYi5hY3RpdmU7XG4gICAgICAgIGNhc2UgJ3NlbGVjdGVkJzogcmV0dXJuIHRhYi5zZWxlY3RlZDtcbiAgICAgICAgY2FzZSAncGlubmVkJzogcmV0dXJuIHRhYi5waW5uZWQ7XG4gICAgICAgIGNhc2UgJ29wZW5lclRhYklkJzogcmV0dXJuIHRhYi5vcGVuZXJUYWJJZDtcbiAgICAgICAgY2FzZSAnbGFzdEFjY2Vzc2VkJzogcmV0dXJuIHRhYi5sYXN0QWNjZXNzZWQ7XG4gICAgICAgIGNhc2UgJ2NvbnRleHQnOiByZXR1cm4gdGFiLmNvbnRleHQ7XG4gICAgICAgIGNhc2UgJ2dlbnJlJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uZ2VucmU7XG4gICAgICAgIGNhc2UgJ3NpdGVOYW1lJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uc2l0ZU5hbWU7XG4gICAgICAgIC8vIERlcml2ZWQgb3IgbWFwcGVkIGZpZWxkc1xuICAgICAgICBjYXNlICdkb21haW4nOiByZXR1cm4gZG9tYWluRnJvbVVybCh0YWIudXJsKTtcbiAgICAgICAgY2FzZSAnc3ViZG9tYWluJzogcmV0dXJuIHN1YmRvbWFpbkZyb21VcmwodGFiLnVybCk7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBpZiAoZmllbGQuaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICAgICAgICAgICByZXR1cm4gZmllbGQuc3BsaXQoJy4nKS5yZWR1Y2UoKG9iaiwga2V5KSA9PiAob2JqICYmIHR5cGVvZiBvYmogPT09ICdvYmplY3QnICYmIG9iaiAhPT0gbnVsbCkgPyAob2JqIGFzIGFueSlba2V5XSA6IHVuZGVmaW5lZCwgdGFiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiAodGFiIGFzIGFueSlbZmllbGRdO1xuICAgIH1cbn07XG5cbmNvbnN0IHN0cmlwVGxkID0gKGRvbWFpbjogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIGRvbWFpbi5yZXBsYWNlKC9cXC4oY29tfG9yZ3xnb3Z8bmV0fGVkdXxpbykkL2ksIFwiXCIpO1xufTtcblxuZXhwb3J0IGNvbnN0IHNlbWFudGljQnVja2V0ID0gKHRpdGxlOiBzdHJpbmcsIHVybDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3Qga2V5ID0gYCR7dGl0bGV9ICR7dXJsfWAudG9Mb3dlckNhc2UoKTtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImRvY1wiKSB8fCBrZXkuaW5jbHVkZXMoXCJyZWFkbWVcIikgfHwga2V5LmluY2x1ZGVzKFwiZ3VpZGVcIikpIHJldHVybiBcIkRvY3NcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcIm1haWxcIikgfHwga2V5LmluY2x1ZGVzKFwiaW5ib3hcIikpIHJldHVybiBcIkNoYXRcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImRhc2hib2FyZFwiKSB8fCBrZXkuaW5jbHVkZXMoXCJjb25zb2xlXCIpKSByZXR1cm4gXCJEYXNoXCI7XG4gIGlmIChrZXkuaW5jbHVkZXMoXCJpc3N1ZVwiKSB8fCBrZXkuaW5jbHVkZXMoXCJ0aWNrZXRcIikpIHJldHVybiBcIlRhc2tzXCI7XG4gIGlmIChrZXkuaW5jbHVkZXMoXCJkcml2ZVwiKSB8fCBrZXkuaW5jbHVkZXMoXCJzdG9yYWdlXCIpKSByZXR1cm4gXCJGaWxlc1wiO1xuICByZXR1cm4gXCJNaXNjXCI7XG59O1xuXG5leHBvcnQgY29uc3QgbmF2aWdhdGlvbktleSA9ICh0YWI6IFRhYk1ldGFkYXRhKTogc3RyaW5nID0+IHtcbiAgaWYgKHRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIGBjaGlsZC1vZi0ke3RhYi5vcGVuZXJUYWJJZH1gO1xuICB9XG4gIHJldHVybiBgd2luZG93LSR7dGFiLndpbmRvd0lkfWA7XG59O1xuXG5jb25zdCBnZXRSZWNlbmN5TGFiZWwgPSAobGFzdEFjY2Vzc2VkOiBudW1iZXIpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICBjb25zdCBkaWZmID0gbm93IC0gbGFzdEFjY2Vzc2VkO1xuICBpZiAoZGlmZiA8IDM2MDAwMDApIHJldHVybiBcIkp1c3Qgbm93XCI7IC8vIDFoXG4gIGlmIChkaWZmIDwgODY0MDAwMDApIHJldHVybiBcIlRvZGF5XCI7IC8vIDI0aFxuICBpZiAoZGlmZiA8IDE3MjgwMDAwMCkgcmV0dXJuIFwiWWVzdGVyZGF5XCI7IC8vIDQ4aFxuICBpZiAoZGlmZiA8IDYwNDgwMDAwMCkgcmV0dXJuIFwiVGhpcyBXZWVrXCI7IC8vIDdkXG4gIHJldHVybiBcIk9sZGVyXCI7XG59O1xuXG5jb25zdCBjb2xvckZvcktleSA9IChrZXk6IHN0cmluZywgb2Zmc2V0OiBudW1iZXIpOiBzdHJpbmcgPT4gQ09MT1JTWyhNYXRoLmFicyhoYXNoQ29kZShrZXkpKSArIG9mZnNldCkgJSBDT0xPUlMubGVuZ3RoXTtcblxuY29uc3QgaGFzaENvZGUgPSAodmFsdWU6IHN0cmluZyk6IG51bWJlciA9PiB7XG4gIGxldCBoYXNoID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB2YWx1ZS5sZW5ndGg7IGkgKz0gMSkge1xuICAgIGhhc2ggPSAoaGFzaCA8PCA1KSAtIGhhc2ggKyB2YWx1ZS5jaGFyQ29kZUF0KGkpO1xuICAgIGhhc2ggfD0gMDtcbiAgfVxuICByZXR1cm4gaGFzaDtcbn07XG5cbi8vIEhlbHBlciB0byBnZXQgYSBodW1hbi1yZWFkYWJsZSBsYWJlbCBjb21wb25lbnQgZnJvbSBhIHN0cmF0ZWd5IGFuZCBhIHNldCBvZiB0YWJzXG5jb25zdCBnZXRMYWJlbENvbXBvbmVudCA9IChzdHJhdGVneTogR3JvdXBpbmdTdHJhdGVneSB8IHN0cmluZywgdGFiczogVGFiTWV0YWRhdGFbXSwgYWxsVGFic01hcDogTWFwPG51bWJlciwgVGFiTWV0YWRhdGE+KTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gIGNvbnN0IGZpcnN0VGFiID0gdGFic1swXTtcbiAgaWYgKCFmaXJzdFRhYikgcmV0dXJuIFwiVW5rbm93blwiO1xuXG4gIC8vIENoZWNrIGN1c3RvbSBzdHJhdGVnaWVzIGZpcnN0XG4gIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5KTtcbiAgaWYgKGN1c3RvbSkge1xuICAgICAgcmV0dXJuIGdyb3VwaW5nS2V5KGZpcnN0VGFiLCBzdHJhdGVneSk7XG4gIH1cblxuICBzd2l0Y2ggKHN0cmF0ZWd5KSB7XG4gICAgY2FzZSBcImRvbWFpblwiOiB7XG4gICAgICBjb25zdCBzaXRlTmFtZXMgPSBuZXcgU2V0KHRhYnMubWFwKHQgPT4gdC5jb250ZXh0RGF0YT8uc2l0ZU5hbWUpLmZpbHRlcihCb29sZWFuKSk7XG4gICAgICBpZiAoc2l0ZU5hbWVzLnNpemUgPT09IDEpIHtcbiAgICAgICAgcmV0dXJuIHN0cmlwVGxkKEFycmF5LmZyb20oc2l0ZU5hbWVzKVswXSBhcyBzdHJpbmcpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHN0cmlwVGxkKGRvbWFpbkZyb21VcmwoZmlyc3RUYWIudXJsKSk7XG4gICAgfVxuICAgIGNhc2UgXCJkb21haW5fZnVsbFwiOlxuICAgICAgcmV0dXJuIGRvbWFpbkZyb21VcmwoZmlyc3RUYWIudXJsKTtcbiAgICBjYXNlIFwidG9waWNcIjpcbiAgICAgIHJldHVybiBzZW1hbnRpY0J1Y2tldChmaXJzdFRhYi50aXRsZSwgZmlyc3RUYWIudXJsKTtcbiAgICBjYXNlIFwibGluZWFnZVwiOlxuICAgICAgaWYgKGZpcnN0VGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgY29uc3QgcGFyZW50ID0gYWxsVGFic01hcC5nZXQoZmlyc3RUYWIub3BlbmVyVGFiSWQpO1xuICAgICAgICBpZiAocGFyZW50KSB7XG4gICAgICAgICAgY29uc3QgcGFyZW50VGl0bGUgPSBwYXJlbnQudGl0bGUubGVuZ3RoID4gMjAgPyBwYXJlbnQudGl0bGUuc3Vic3RyaW5nKDAsIDIwKSArIFwiLi4uXCIgOiBwYXJlbnQudGl0bGU7XG4gICAgICAgICAgcmV0dXJuIGBGcm9tOiAke3BhcmVudFRpdGxlfWA7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGBGcm9tOiBUYWIgJHtmaXJzdFRhYi5vcGVuZXJUYWJJZH1gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGBXaW5kb3cgJHtmaXJzdFRhYi53aW5kb3dJZH1gO1xuICAgIGNhc2UgXCJjb250ZXh0XCI6XG4gICAgICByZXR1cm4gZmlyc3RUYWIuY29udGV4dCB8fCBcIlVuY2F0ZWdvcml6ZWRcIjtcbiAgICBjYXNlIFwicGlubmVkXCI6XG4gICAgICByZXR1cm4gZmlyc3RUYWIucGlubmVkID8gXCJQaW5uZWRcIiA6IFwiVW5waW5uZWRcIjtcbiAgICBjYXNlIFwiYWdlXCI6XG4gICAgICByZXR1cm4gZ2V0UmVjZW5jeUxhYmVsKGZpcnN0VGFiLmxhc3RBY2Nlc3NlZCA/PyAwKTtcbiAgICBjYXNlIFwidXJsXCI6XG4gICAgICByZXR1cm4gXCJVUkwgR3JvdXBcIjtcbiAgICBjYXNlIFwicmVjZW5jeVwiOlxuICAgICAgcmV0dXJuIFwiVGltZSBHcm91cFwiO1xuICAgIGNhc2UgXCJuZXN0aW5nXCI6XG4gICAgICByZXR1cm4gZmlyc3RUYWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCA/IFwiQ2hpbGRyZW5cIiA6IFwiUm9vdHNcIjtcbiAgICBkZWZhdWx0OlxuICAgICAgY29uc3QgdmFsID0gZ2V0RmllbGRWYWx1ZShmaXJzdFRhYiwgc3RyYXRlZ3kpO1xuICAgICAgaWYgKHZhbCAhPT0gdW5kZWZpbmVkICYmIHZhbCAhPT0gbnVsbCkge1xuICAgICAgICAgIHJldHVybiBTdHJpbmcodmFsKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBcIlVua25vd25cIjtcbiAgfVxufTtcblxuY29uc3QgZ2VuZXJhdGVMYWJlbCA9IChcbiAgc3RyYXRlZ2llczogKEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcpW10sXG4gIHRhYnM6IFRhYk1ldGFkYXRhW10sXG4gIGFsbFRhYnNNYXA6IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhPlxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgbGFiZWxzID0gc3RyYXRlZ2llc1xuICAgIC5tYXAocyA9PiBnZXRMYWJlbENvbXBvbmVudChzLCB0YWJzLCBhbGxUYWJzTWFwKSlcbiAgICAuZmlsdGVyKGwgPT4gbCAmJiBsICE9PSBcIlVua25vd25cIiAmJiBsICE9PSBcIkdyb3VwXCIgJiYgbCAhPT0gXCJVUkwgR3JvdXBcIiAmJiBsICE9PSBcIlRpbWUgR3JvdXBcIiAmJiBsICE9PSBcIk1pc2NcIik7XG5cbiAgaWYgKGxhYmVscy5sZW5ndGggPT09IDApIHJldHVybiBcIkdyb3VwXCI7XG4gIHJldHVybiBBcnJheS5mcm9tKG5ldyBTZXQobGFiZWxzKSkuam9pbihcIiAtIFwiKTtcbn07XG5cbmNvbnN0IGdldFN0cmF0ZWd5Q29sb3IgPSAoc3RyYXRlZ3lJZDogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkID0+IHtcbiAgICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneUlkKTtcbiAgICBpZiAoIWN1c3RvbSkgcmV0dXJuIHVuZGVmaW5lZDtcblxuICAgIGNvbnN0IGdyb3VwaW5nUnVsZXNMaXN0ID0gYXNBcnJheTxHcm91cGluZ1J1bGU+KGN1c3RvbS5ncm91cGluZ1J1bGVzKTtcbiAgICAvLyBJdGVyYXRlIG1hbnVhbGx5IHRvIGNoZWNrIGNvbG9yXG4gICAgZm9yIChsZXQgaSA9IGdyb3VwaW5nUnVsZXNMaXN0Lmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgIGNvbnN0IHJ1bGUgPSBncm91cGluZ1J1bGVzTGlzdFtpXTtcbiAgICAgICAgaWYgKHJ1bGUgJiYgcnVsZS5jb2xvciAmJiBydWxlLmNvbG9yICE9PSAncmFuZG9tJykge1xuICAgICAgICAgICAgcmV0dXJuIHJ1bGUuY29sb3I7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbn07XG5cbmNvbnN0IHJlc29sdmVXaW5kb3dNb2RlID0gKG1vZGVzOiAoc3RyaW5nIHwgdW5kZWZpbmVkKVtdKTogXCJjdXJyZW50XCIgfCBcIm5ld1wiIHwgXCJjb21wb3VuZFwiID0+IHtcbiAgICBpZiAobW9kZXMuaW5jbHVkZXMoXCJuZXdcIikpIHJldHVybiBcIm5ld1wiO1xuICAgIGlmIChtb2Rlcy5pbmNsdWRlcyhcImNvbXBvdW5kXCIpKSByZXR1cm4gXCJjb21wb3VuZFwiO1xuICAgIHJldHVybiBcImN1cnJlbnRcIjtcbn07XG5cbmV4cG9ydCBjb25zdCBncm91cFRhYnMgPSAoXG4gIHRhYnM6IFRhYk1ldGFkYXRhW10sXG4gIHN0cmF0ZWdpZXM6IChTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmcpW11cbik6IFRhYkdyb3VwW10gPT4ge1xuICBjb25zdCBhdmFpbGFibGVTdHJhdGVnaWVzID0gZ2V0U3RyYXRlZ2llcyhjdXN0b21TdHJhdGVnaWVzKTtcbiAgY29uc3QgZWZmZWN0aXZlU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gYXZhaWxhYmxlU3RyYXRlZ2llcy5maW5kKGF2YWlsID0+IGF2YWlsLmlkID09PSBzKT8uaXNHcm91cGluZyk7XG4gIGNvbnN0IGJ1Y2tldHMgPSBuZXcgTWFwPHN0cmluZywgVGFiR3JvdXA+KCk7XG5cbiAgY29uc3QgYWxsVGFic01hcCA9IG5ldyBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YT4oKTtcbiAgdGFicy5mb3JFYWNoKHQgPT4gYWxsVGFic01hcC5zZXQodC5pZCwgdCkpO1xuXG4gIHRhYnMuZm9yRWFjaCgodGFiKSA9PiB7XG4gICAgbGV0IGtleXM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgYXBwbGllZFN0cmF0ZWdpZXM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgY29sbGVjdGVkTW9kZXM6IHN0cmluZ1tdID0gW107XG5cbiAgICB0cnkge1xuICAgICAgICBmb3IgKGNvbnN0IHMgb2YgZWZmZWN0aXZlU3RyYXRlZ2llcykge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gZ2V0R3JvdXBpbmdSZXN1bHQodGFiLCBzKTtcbiAgICAgICAgICAgIGlmIChyZXN1bHQua2V5ICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAga2V5cy5wdXNoKGAke3N9OiR7cmVzdWx0LmtleX1gKTtcbiAgICAgICAgICAgICAgICBhcHBsaWVkU3RyYXRlZ2llcy5wdXNoKHMpO1xuICAgICAgICAgICAgICAgIGNvbGxlY3RlZE1vZGVzLnB1c2gocmVzdWx0Lm1vZGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGdlbmVyYXRpbmcgZ3JvdXBpbmcga2V5XCIsIHsgdGFiSWQ6IHRhYi5pZCwgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgcmV0dXJuOyAvLyBTa2lwIHRoaXMgdGFiIG9uIGVycm9yXG4gICAgfVxuXG4gICAgLy8gSWYgbm8gc3RyYXRlZ2llcyBhcHBsaWVkIChlLmcuIGFsbCBmaWx0ZXJlZCBvdXQpLCBza2lwIGdyb3VwaW5nIGZvciB0aGlzIHRhYlxuICAgIGlmIChrZXlzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgZWZmZWN0aXZlTW9kZSA9IHJlc29sdmVXaW5kb3dNb2RlKGNvbGxlY3RlZE1vZGVzKTtcbiAgICBjb25zdCB2YWx1ZUtleSA9IGtleXMuam9pbihcIjo6XCIpO1xuICAgIGxldCBidWNrZXRLZXkgPSBcIlwiO1xuICAgIGlmIChlZmZlY3RpdmVNb2RlID09PSAnY3VycmVudCcpIHtcbiAgICAgICAgIGJ1Y2tldEtleSA9IGB3aW5kb3ctJHt0YWIud2luZG93SWR9OjpgICsgdmFsdWVLZXk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgIGJ1Y2tldEtleSA9IGBnbG9iYWw6OmAgKyB2YWx1ZUtleTtcbiAgICB9XG5cbiAgICBsZXQgZ3JvdXAgPSBidWNrZXRzLmdldChidWNrZXRLZXkpO1xuICAgIGlmICghZ3JvdXApIHtcbiAgICAgIGxldCBncm91cENvbG9yID0gbnVsbDtcbiAgICAgIGZvciAoY29uc3Qgc0lkIG9mIGFwcGxpZWRTdHJhdGVnaWVzKSB7XG4gICAgICAgIGNvbnN0IGNvbG9yID0gZ2V0U3RyYXRlZ3lDb2xvcihzSWQpO1xuICAgICAgICBpZiAoY29sb3IpIHsgZ3JvdXBDb2xvciA9IGNvbG9yOyBicmVhazsgfVxuICAgICAgfVxuXG4gICAgICBpZiAoZ3JvdXBDb2xvciA9PT0gJ21hdGNoJykge1xuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkodmFsdWVLZXksIDApO1xuICAgICAgfSBlbHNlIGlmICghZ3JvdXBDb2xvcikge1xuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkoYnVja2V0S2V5LCBidWNrZXRzLnNpemUpO1xuICAgICAgfVxuXG4gICAgICBncm91cCA9IHtcbiAgICAgICAgaWQ6IGJ1Y2tldEtleSxcbiAgICAgICAgd2luZG93SWQ6IHRhYi53aW5kb3dJZCxcbiAgICAgICAgbGFiZWw6IFwiXCIsXG4gICAgICAgIGNvbG9yOiBncm91cENvbG9yLFxuICAgICAgICB0YWJzOiBbXSxcbiAgICAgICAgcmVhc29uOiBhcHBsaWVkU3RyYXRlZ2llcy5qb2luKFwiICsgXCIpLFxuICAgICAgICB3aW5kb3dNb2RlOiBlZmZlY3RpdmVNb2RlXG4gICAgICB9O1xuICAgICAgYnVja2V0cy5zZXQoYnVja2V0S2V5LCBncm91cCk7XG4gICAgfVxuICAgIGdyb3VwLnRhYnMucHVzaCh0YWIpO1xuICB9KTtcblxuICBjb25zdCBncm91cHMgPSBBcnJheS5mcm9tKGJ1Y2tldHMudmFsdWVzKCkpO1xuICBncm91cHMuZm9yRWFjaChncm91cCA9PiB7XG4gICAgZ3JvdXAubGFiZWwgPSBnZW5lcmF0ZUxhYmVsKGVmZmVjdGl2ZVN0cmF0ZWdpZXMsIGdyb3VwLnRhYnMsIGFsbFRhYnNNYXApO1xuICB9KTtcblxuICByZXR1cm4gZ3JvdXBzO1xufTtcblxuZXhwb3J0IGNvbnN0IGNoZWNrQ29uZGl0aW9uID0gKGNvbmRpdGlvbjogUnVsZUNvbmRpdGlvbiwgdGFiOiBUYWJNZXRhZGF0YSk6IGJvb2xlYW4gPT4ge1xuICAgIGlmICghY29uZGl0aW9uKSByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgcmF3VmFsdWUgPSBnZXRGaWVsZFZhbHVlKHRhYiwgY29uZGl0aW9uLmZpZWxkKTtcbiAgICBjb25zdCB2YWx1ZVRvQ2hlY2sgPSByYXdWYWx1ZSAhPT0gdW5kZWZpbmVkICYmIHJhd1ZhbHVlICE9PSBudWxsID8gU3RyaW5nKHJhd1ZhbHVlKS50b0xvd2VyQ2FzZSgpIDogXCJcIjtcbiAgICBjb25zdCBwYXR0ZXJuID0gY29uZGl0aW9uLnZhbHVlID8gY29uZGl0aW9uLnZhbHVlLnRvTG93ZXJDYXNlKCkgOiBcIlwiO1xuXG4gICAgc3dpdGNoIChjb25kaXRpb24ub3BlcmF0b3IpIHtcbiAgICAgICAgY2FzZSAnY29udGFpbnMnOiByZXR1cm4gdmFsdWVUb0NoZWNrLmluY2x1ZGVzKHBhdHRlcm4pO1xuICAgICAgICBjYXNlICdkb2VzTm90Q29udGFpbic6IHJldHVybiAhdmFsdWVUb0NoZWNrLmluY2x1ZGVzKHBhdHRlcm4pO1xuICAgICAgICBjYXNlICdlcXVhbHMnOiByZXR1cm4gdmFsdWVUb0NoZWNrID09PSBwYXR0ZXJuO1xuICAgICAgICBjYXNlICdzdGFydHNXaXRoJzogcmV0dXJuIHZhbHVlVG9DaGVjay5zdGFydHNXaXRoKHBhdHRlcm4pO1xuICAgICAgICBjYXNlICdlbmRzV2l0aCc6IHJldHVybiB2YWx1ZVRvQ2hlY2suZW5kc1dpdGgocGF0dGVybik7XG4gICAgICAgIGNhc2UgJ2V4aXN0cyc6IHJldHVybiByYXdWYWx1ZSAhPT0gdW5kZWZpbmVkO1xuICAgICAgICBjYXNlICdkb2VzTm90RXhpc3QnOiByZXR1cm4gcmF3VmFsdWUgPT09IHVuZGVmaW5lZDtcbiAgICAgICAgY2FzZSAnaXNOdWxsJzogcmV0dXJuIHJhd1ZhbHVlID09PSBudWxsO1xuICAgICAgICBjYXNlICdpc05vdE51bGwnOiByZXR1cm4gcmF3VmFsdWUgIT09IG51bGw7XG4gICAgICAgIGNhc2UgJ21hdGNoZXMnOlxuICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBSZWdFeHAoY29uZGl0aW9uLnZhbHVlLCAnaScpLnRlc3QocmF3VmFsdWUgIT09IHVuZGVmaW5lZCAmJiByYXdWYWx1ZSAhPT0gbnVsbCA/IFN0cmluZyhyYXdWYWx1ZSkgOiBcIlwiKTtcbiAgICAgICAgICAgICB9IGNhdGNoIHsgcmV0dXJuIGZhbHNlOyB9XG4gICAgICAgIGRlZmF1bHQ6IHJldHVybiBmYWxzZTtcbiAgICB9XG59O1xuXG5mdW5jdGlvbiBldmFsdWF0ZUxlZ2FjeVJ1bGVzKGxlZ2FjeVJ1bGVzOiBTdHJhdGVneVJ1bGVbXSwgdGFiOiBUYWJNZXRhZGF0YSk6IHN0cmluZyB8IG51bGwge1xuICAgIC8vIERlZmVuc2l2ZSBjaGVja1xuICAgIGlmICghbGVnYWN5UnVsZXMgfHwgIUFycmF5LmlzQXJyYXkobGVnYWN5UnVsZXMpKSB7XG4gICAgICAgIGlmICghbGVnYWN5UnVsZXMpIHJldHVybiBudWxsO1xuICAgICAgICAvLyBUcnkgYXNBcnJheSBpZiBpdCdzIG5vdCBhcnJheSBidXQgdHJ1dGh5ICh1bmxpa2VseSBnaXZlbiBwcmV2aW91cyBsb2dpYyBidXQgc2FmZSlcbiAgICB9XG5cbiAgICBjb25zdCBsZWdhY3lSdWxlc0xpc3QgPSBhc0FycmF5PFN0cmF0ZWd5UnVsZT4obGVnYWN5UnVsZXMpO1xuICAgIGlmIChsZWdhY3lSdWxlc0xpc3QubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcblxuICAgIHRyeSB7XG4gICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBsZWdhY3lSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgIGlmICghcnVsZSkgY29udGludWU7XG4gICAgICAgICAgICBjb25zdCByYXdWYWx1ZSA9IGdldEZpZWxkVmFsdWUodGFiLCBydWxlLmZpZWxkKTtcbiAgICAgICAgICAgIGxldCB2YWx1ZVRvQ2hlY2sgPSByYXdWYWx1ZSAhPT0gdW5kZWZpbmVkICYmIHJhd1ZhbHVlICE9PSBudWxsID8gU3RyaW5nKHJhd1ZhbHVlKSA6IFwiXCI7XG4gICAgICAgICAgICB2YWx1ZVRvQ2hlY2sgPSB2YWx1ZVRvQ2hlY2sudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgIGNvbnN0IHBhdHRlcm4gPSBydWxlLnZhbHVlID8gcnVsZS52YWx1ZS50b0xvd2VyQ2FzZSgpIDogXCJcIjtcblxuICAgICAgICAgICAgbGV0IGlzTWF0Y2ggPSBmYWxzZTtcbiAgICAgICAgICAgIGxldCBtYXRjaE9iajogUmVnRXhwRXhlY0FycmF5IHwgbnVsbCA9IG51bGw7XG5cbiAgICAgICAgICAgIHN3aXRjaCAocnVsZS5vcGVyYXRvcikge1xuICAgICAgICAgICAgICAgIGNhc2UgJ2NvbnRhaW5zJzogaXNNYXRjaCA9IHZhbHVlVG9DaGVjay5pbmNsdWRlcyhwYXR0ZXJuKTsgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnZG9lc05vdENvbnRhaW4nOiBpc01hdGNoID0gIXZhbHVlVG9DaGVjay5pbmNsdWRlcyhwYXR0ZXJuKTsgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnZXF1YWxzJzogaXNNYXRjaCA9IHZhbHVlVG9DaGVjayA9PT0gcGF0dGVybjsgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnc3RhcnRzV2l0aCc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suc3RhcnRzV2l0aChwYXR0ZXJuKTsgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnZW5kc1dpdGgnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrLmVuZHNXaXRoKHBhdHRlcm4pOyBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdleGlzdHMnOiBpc01hdGNoID0gcmF3VmFsdWUgIT09IHVuZGVmaW5lZDsgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnZG9lc05vdEV4aXN0JzogaXNNYXRjaCA9IHJhd1ZhbHVlID09PSB1bmRlZmluZWQ7IGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2lzTnVsbCc6IGlzTWF0Y2ggPSByYXdWYWx1ZSA9PT0gbnVsbDsgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnaXNOb3ROdWxsJzogaXNNYXRjaCA9IHJhd1ZhbHVlICE9PSBudWxsOyBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdtYXRjaGVzJzpcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChydWxlLnZhbHVlLCAnaScpO1xuICAgICAgICAgICAgICAgICAgICAgICAgbWF0Y2hPYmogPSByZWdleC5leGVjKHJhd1ZhbHVlICE9PSB1bmRlZmluZWQgJiYgcmF3VmFsdWUgIT09IG51bGwgPyBTdHJpbmcocmF3VmFsdWUpIDogXCJcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICBpc01hdGNoID0gISFtYXRjaE9iajtcbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge31cbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChpc01hdGNoKSB7XG4gICAgICAgICAgICAgICAgbGV0IHJlc3VsdCA9IHJ1bGUucmVzdWx0O1xuICAgICAgICAgICAgICAgIGlmIChtYXRjaE9iaikge1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IG1hdGNoT2JqLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UobmV3IFJlZ0V4cChgXFxcXCQke2l9YCwgJ2cnKSwgbWF0Y2hPYmpbaV0gfHwgXCJcIik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGxvZ0RlYnVnKFwiRXJyb3IgZXZhbHVhdGluZyBsZWdhY3kgcnVsZXNcIiwgeyBlcnJvcjogU3RyaW5nKGVycm9yKSB9KTtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbmV4cG9ydCBjb25zdCBnZXRHcm91cGluZ1Jlc3VsdCA9ICh0YWI6IFRhYk1ldGFkYXRhLCBzdHJhdGVneTogR3JvdXBpbmdTdHJhdGVneSB8IHN0cmluZyk6IHsga2V5OiBzdHJpbmcgfCBudWxsLCBtb2RlOiBcImN1cnJlbnRcIiB8IFwibmV3XCIgfCBcImNvbXBvdW5kXCIgfSA9PiB7XG4gIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5KTtcbiAgaWYgKGN1c3RvbSkge1xuICAgICAgY29uc3QgZmlsdGVyR3JvdXBzTGlzdCA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbltdPihjdXN0b20uZmlsdGVyR3JvdXBzKTtcbiAgICAgIGNvbnN0IGZpbHRlcnNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihjdXN0b20uZmlsdGVycyk7XG5cbiAgICAgIGxldCBtYXRjaCA9IGZhbHNlO1xuXG4gICAgICBpZiAoZmlsdGVyR3JvdXBzTGlzdC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgLy8gT1IgbG9naWNcbiAgICAgICAgICBmb3IgKGNvbnN0IGdyb3VwIG9mIGZpbHRlckdyb3Vwc0xpc3QpIHtcbiAgICAgICAgICAgICAgY29uc3QgZ3JvdXBSdWxlcyA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbj4oZ3JvdXApO1xuICAgICAgICAgICAgICBpZiAoZ3JvdXBSdWxlcy5sZW5ndGggPT09IDAgfHwgZ3JvdXBSdWxlcy5ldmVyeShyID0+IGNoZWNrQ29uZGl0aW9uKHIsIHRhYikpKSB7XG4gICAgICAgICAgICAgICAgICBtYXRjaCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoZmlsdGVyc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIC8vIExlZ2FjeS9TaW1wbGUgQU5EIGxvZ2ljXG4gICAgICAgICAgaWYgKGZpbHRlcnNMaXN0LmV2ZXJ5KGYgPT4gY2hlY2tDb25kaXRpb24oZiwgdGFiKSkpIHtcbiAgICAgICAgICAgICAgbWF0Y2ggPSB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gTm8gZmlsdGVycyAtPiBNYXRjaCBhbGxcbiAgICAgICAgICBtYXRjaCA9IHRydWU7XG4gICAgICB9XG5cbiAgICAgIGlmICghbWF0Y2gpIHtcbiAgICAgICAgICByZXR1cm4geyBrZXk6IG51bGwsIG1vZGU6IFwiY3VycmVudFwiIH07XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGdyb3VwaW5nUnVsZXNMaXN0ID0gYXNBcnJheTxHcm91cGluZ1J1bGU+KGN1c3RvbS5ncm91cGluZ1J1bGVzKTtcbiAgICAgIGlmIChncm91cGluZ1J1bGVzTGlzdC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgY29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG4gICAgICAgICAgY29uc3QgbW9kZXM6IHN0cmluZ1tdID0gW107XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cGluZ1J1bGVzTGlzdCkge1xuICAgICAgICAgICAgICAgIGlmICghcnVsZSkgY29udGludWU7XG4gICAgICAgICAgICAgICAgbGV0IHZhbCA9IFwiXCI7XG4gICAgICAgICAgICAgICAgaWYgKHJ1bGUuc291cmNlID09PSAnZmllbGQnKSB7XG4gICAgICAgICAgICAgICAgICAgICBjb25zdCByYXcgPSBnZXRGaWVsZFZhbHVlKHRhYiwgcnVsZS52YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICB2YWwgPSByYXcgIT09IHVuZGVmaW5lZCAmJiByYXcgIT09IG51bGwgPyBTdHJpbmcocmF3KSA6IFwiXCI7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHJ1bGUudmFsdWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHZhbCAmJiBydWxlLnRyYW5zZm9ybSAmJiBydWxlLnRyYW5zZm9ybSAhPT0gJ25vbmUnKSB7XG4gICAgICAgICAgICAgICAgICAgIHN3aXRjaCAocnVsZS50cmFuc2Zvcm0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ3N0cmlwVGxkJzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBzdHJpcFRsZCh2YWwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnbG93ZXJjYXNlJzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSB2YWwudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ3VwcGVyY2FzZSc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gdmFsLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdmaXJzdENoYXInOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHZhbC5jaGFyQXQoMCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdkb21haW4nOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IGRvbWFpbkZyb21VcmwodmFsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ2hvc3RuYW1lJzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gbmV3IFVSTCh2YWwpLmhvc3RuYW1lO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBrZWVwIGFzIGlzICovIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ3JlZ2V4JzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocnVsZS50cmFuc2Zvcm1QYXR0ZXJuKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsZXQgcmVnZXggPSByZWdleENhY2hlLmdldChydWxlLnRyYW5zZm9ybVBhdHRlcm4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFyZWdleCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlZ2V4ID0gbmV3IFJlZ0V4cChydWxlLnRyYW5zZm9ybVBhdHRlcm4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlZ2V4Q2FjaGUuc2V0KHJ1bGUudHJhbnNmb3JtUGF0dGVybiwgcmVnZXgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbWF0Y2ggPSByZWdleC5leGVjKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsZXQgZXh0cmFjdGVkID0gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IG1hdGNoLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4dHJhY3RlZCArPSBtYXRjaFtpXSB8fCBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBleHRyYWN0ZWQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxvZ0RlYnVnKFwiSW52YWxpZCByZWdleCBpbiB0cmFuc2Zvcm1cIiwgeyBwYXR0ZXJuOiBydWxlLnRyYW5zZm9ybVBhdHRlcm4sIGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodmFsKSB7XG4gICAgICAgICAgICAgICAgICAgIHBhcnRzLnB1c2godmFsKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJ1bGUud2luZG93TW9kZSkgbW9kZXMucHVzaChydWxlLndpbmRvd01vZGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgbG9nRGVidWcoXCJFcnJvciBhcHBseWluZyBncm91cGluZyBydWxlc1wiLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHsga2V5OiBwYXJ0cy5qb2luKFwiIC0gXCIpLCBtb2RlOiByZXNvbHZlV2luZG93TW9kZShtb2RlcykgfTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHsga2V5OiBjdXN0b20uZmFsbGJhY2sgfHwgXCJNaXNjXCIsIG1vZGU6IFwiY3VycmVudFwiIH07XG4gICAgICB9IGVsc2UgaWYgKGN1c3RvbS5ydWxlcykge1xuICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGV2YWx1YXRlTGVnYWN5UnVsZXMoYXNBcnJheTxTdHJhdGVneVJ1bGU+KGN1c3RvbS5ydWxlcyksIHRhYik7XG4gICAgICAgICAgaWYgKHJlc3VsdCkgcmV0dXJuIHsga2V5OiByZXN1bHQsIG1vZGU6IFwiY3VycmVudFwiIH07XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7IGtleTogY3VzdG9tLmZhbGxiYWNrIHx8IFwiTWlzY1wiLCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICB9XG5cbiAgLy8gQnVpbHQtaW4gc3RyYXRlZ2llc1xuICBsZXQgc2ltcGxlS2V5OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgc3dpdGNoIChzdHJhdGVneSkge1xuICAgIGNhc2UgXCJkb21haW5cIjpcbiAgICBjYXNlIFwiZG9tYWluX2Z1bGxcIjpcbiAgICAgIHNpbXBsZUtleSA9IGRvbWFpbkZyb21VcmwodGFiLnVybCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwidG9waWNcIjpcbiAgICAgIHNpbXBsZUtleSA9IHNlbWFudGljQnVja2V0KHRhYi50aXRsZSwgdGFiLnVybCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwibGluZWFnZVwiOlxuICAgICAgc2ltcGxlS2V5ID0gbmF2aWdhdGlvbktleSh0YWIpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcImNvbnRleHRcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi5jb250ZXh0IHx8IFwiVW5jYXRlZ29yaXplZFwiO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInBpbm5lZFwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLnBpbm5lZCA/IFwicGlubmVkXCIgOiBcInVucGlubmVkXCI7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwiYWdlXCI6XG4gICAgICBzaW1wbGVLZXkgPSBnZXRSZWNlbmN5TGFiZWwodGFiLmxhc3RBY2Nlc3NlZCA/PyAwKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJ1cmxcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi51cmw7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwidGl0bGVcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi50aXRsZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJyZWNlbmN5XCI6XG4gICAgICBzaW1wbGVLZXkgPSBTdHJpbmcodGFiLmxhc3RBY2Nlc3NlZCA/PyAwKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJuZXN0aW5nXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCA/IFwiY2hpbGRcIiA6IFwicm9vdFwiO1xuICAgICAgYnJlYWs7XG4gICAgZGVmYXVsdDpcbiAgICAgICAgY29uc3QgdmFsID0gZ2V0RmllbGRWYWx1ZSh0YWIsIHN0cmF0ZWd5KTtcbiAgICAgICAgaWYgKHZhbCAhPT0gdW5kZWZpbmVkICYmIHZhbCAhPT0gbnVsbCkge1xuICAgICAgICAgICAgc2ltcGxlS2V5ID0gU3RyaW5nKHZhbCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzaW1wbGVLZXkgPSBcIlVua25vd25cIjtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgfVxuICByZXR1cm4geyBrZXk6IHNpbXBsZUtleSwgbW9kZTogXCJjdXJyZW50XCIgfTtcbn07XG5cbmV4cG9ydCBjb25zdCBncm91cGluZ0tleSA9ICh0YWI6IFRhYk1ldGFkYXRhLCBzdHJhdGVneTogR3JvdXBpbmdTdHJhdGVneSB8IHN0cmluZyk6IHN0cmluZyB8IG51bGwgPT4ge1xuICAgIHJldHVybiBnZXRHcm91cGluZ1Jlc3VsdCh0YWIsIHN0cmF0ZWd5KS5rZXk7XG59O1xuXG5mdW5jdGlvbiBpc0NvbnRleHRGaWVsZChmaWVsZDogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIGZpZWxkID09PSAnY29udGV4dCcgfHwgZmllbGQgPT09ICdnZW5yZScgfHwgZmllbGQgPT09ICdzaXRlTmFtZScgfHwgZmllbGQuc3RhcnRzV2l0aCgnY29udGV4dERhdGEuJyk7XG59XG5cbmV4cG9ydCBjb25zdCByZXF1aXJlc0NvbnRleHRBbmFseXNpcyA9IChzdHJhdGVneUlkczogKHN0cmluZyB8IFNvcnRpbmdTdHJhdGVneSlbXSk6IGJvb2xlYW4gPT4ge1xuICAgIC8vIENoZWNrIGlmIFwiY29udGV4dFwiIHN0cmF0ZWd5IGlzIGV4cGxpY2l0bHkgcmVxdWVzdGVkXG4gICAgaWYgKHN0cmF0ZWd5SWRzLmluY2x1ZGVzKFwiY29udGV4dFwiKSkgcmV0dXJuIHRydWU7XG5cbiAgICBjb25zdCBzdHJhdGVnaWVzID0gZ2V0U3RyYXRlZ2llcyhjdXN0b21TdHJhdGVnaWVzKTtcbiAgICAvLyBmaWx0ZXIgb25seSB0aG9zZSB0aGF0IG1hdGNoIHRoZSByZXF1ZXN0ZWQgSURzXG4gICAgY29uc3QgYWN0aXZlRGVmcyA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gc3RyYXRlZ3lJZHMuaW5jbHVkZXMocy5pZCkpO1xuXG4gICAgZm9yIChjb25zdCBkZWYgb2YgYWN0aXZlRGVmcykge1xuICAgICAgICAvLyBJZiBpdCdzIGEgYnVpbHQtaW4gc3RyYXRlZ3kgdGhhdCBuZWVkcyBjb250ZXh0IChvbmx5ICdjb250ZXh0JyBkb2VzKVxuICAgICAgICBpZiAoZGVmLmlkID09PSAnY29udGV4dCcpIHJldHVybiB0cnVlO1xuXG4gICAgICAgIC8vIElmIGl0IGlzIGEgY3VzdG9tIHN0cmF0ZWd5IChvciBvdmVycmlkZXMgYnVpbHQtaW4pLCBjaGVjayBpdHMgcnVsZXNcbiAgICAgICAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRlZ2llcy5maW5kKGMgPT4gYy5pZCA9PT0gZGVmLmlkKTtcbiAgICAgICAgaWYgKGN1c3RvbSkge1xuICAgICAgICAgICAgIGNvbnN0IGdyb3VwUnVsZXNMaXN0ID0gYXNBcnJheTxHcm91cGluZ1J1bGU+KGN1c3RvbS5ncm91cGluZ1J1bGVzKTtcbiAgICAgICAgICAgICBjb25zdCBzb3J0UnVsZXNMaXN0ID0gYXNBcnJheTxTb3J0aW5nUnVsZT4oY3VzdG9tLnNvcnRpbmdSdWxlcyk7XG4gICAgICAgICAgICAgY29uc3QgZ3JvdXBTb3J0UnVsZXNMaXN0ID0gYXNBcnJheTxTb3J0aW5nUnVsZT4oY3VzdG9tLmdyb3VwU29ydGluZ1J1bGVzKTtcbiAgICAgICAgICAgICBjb25zdCBmaWx0ZXJzTGlzdCA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbj4oY3VzdG9tLmZpbHRlcnMpO1xuICAgICAgICAgICAgIGNvbnN0IGZpbHRlckdyb3Vwc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb25bXT4oY3VzdG9tLmZpbHRlckdyb3Vwcyk7XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZ3JvdXBSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgcnVsZS5zb3VyY2UgPT09ICdmaWVsZCcgJiYgaXNDb250ZXh0RmllbGQocnVsZS52YWx1ZSkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBzb3J0UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZ3JvdXBTb3J0UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZmlsdGVyc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgZ3JvdXAgb2YgZmlsdGVyR3JvdXBzTGlzdCkge1xuICAgICAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihncm91cCk7XG4gICAgICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFJ1bGVzKSB7XG4gICAgICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBpc0NvbnRleHRGaWVsZChydWxlLmZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufTtcbiIsICJpbXBvcnQgeyBTb3J0aW5nU3RyYXRlZ3ksIFRhYk1ldGFkYXRhLCBDdXN0b21TdHJhdGVneSwgU29ydGluZ1J1bGUgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBkb21haW5Gcm9tVXJsLCBzZW1hbnRpY0J1Y2tldCwgbmF2aWdhdGlvbktleSwgZ3JvdXBpbmdLZXksIGdldEZpZWxkVmFsdWUsIGdldEN1c3RvbVN0cmF0ZWdpZXMgfSBmcm9tIFwiLi9ncm91cGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tIFwiLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5cbmV4cG9ydCBjb25zdCByZWNlbmN5U2NvcmUgPSAodGFiOiBUYWJNZXRhZGF0YSkgPT4gdGFiLmxhc3RBY2Nlc3NlZCA/PyAwO1xuZXhwb3J0IGNvbnN0IGhpZXJhcmNoeVNjb3JlID0gKHRhYjogVGFiTWV0YWRhdGEpID0+ICh0YWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCA/IDEgOiAwKTtcbmV4cG9ydCBjb25zdCBwaW5uZWRTY29yZSA9ICh0YWI6IFRhYk1ldGFkYXRhKSA9PiAodGFiLnBpbm5lZCA/IDAgOiAxKTtcblxuZXhwb3J0IGNvbnN0IHNvcnRUYWJzID0gKHRhYnM6IFRhYk1ldGFkYXRhW10sIHN0cmF0ZWdpZXM6IFNvcnRpbmdTdHJhdGVneVtdKTogVGFiTWV0YWRhdGFbXSA9PiB7XG4gIGNvbnN0IHNjb3Jpbmc6IFNvcnRpbmdTdHJhdGVneVtdID0gc3RyYXRlZ2llcy5sZW5ndGggPyBzdHJhdGVnaWVzIDogW1wicGlubmVkXCIsIFwicmVjZW5jeVwiXTtcbiAgcmV0dXJuIFsuLi50YWJzXS5zb3J0KChhLCBiKSA9PiB7XG4gICAgZm9yIChjb25zdCBzdHJhdGVneSBvZiBzY29yaW5nKSB7XG4gICAgICBjb25zdCBkaWZmID0gY29tcGFyZUJ5KHN0cmF0ZWd5LCBhLCBiKTtcbiAgICAgIGlmIChkaWZmICE9PSAwKSByZXR1cm4gZGlmZjtcbiAgICB9XG4gICAgcmV0dXJuIGEuaWQgLSBiLmlkO1xuICB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBjb21wYXJlQnkgPSAoc3RyYXRlZ3k6IFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZywgYTogVGFiTWV0YWRhdGEsIGI6IFRhYk1ldGFkYXRhKTogbnVtYmVyID0+IHtcbiAgLy8gMS4gQ2hlY2sgQ3VzdG9tIFN0cmF0ZWdpZXMgZm9yIFNvcnRpbmcgUnVsZXNcbiAgY29uc3QgY3VzdG9tU3RyYXRzID0gZ2V0Q3VzdG9tU3RyYXRlZ2llcygpO1xuICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdHMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5KTtcbiAgaWYgKGN1c3RvbSkge1xuICAgICAgY29uc3Qgc29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KGN1c3RvbS5zb3J0aW5nUnVsZXMpO1xuICAgICAgaWYgKHNvcnRSdWxlc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIC8vIEV2YWx1YXRlIGN1c3RvbSBzb3J0aW5nIHJ1bGVzIGluIG9yZGVyXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIHNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgIGlmICghcnVsZSkgY29udGludWU7XG4gICAgICAgICAgICAgICAgICBjb25zdCB2YWxBID0gZ2V0RmllbGRWYWx1ZShhLCBydWxlLmZpZWxkKTtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IHZhbEIgPSBnZXRGaWVsZFZhbHVlKGIsIHJ1bGUuZmllbGQpO1xuXG4gICAgICAgICAgICAgICAgICBsZXQgcmVzdWx0ID0gMDtcbiAgICAgICAgICAgICAgICAgIGlmICh2YWxBIDwgdmFsQikgcmVzdWx0ID0gLTE7XG4gICAgICAgICAgICAgICAgICBlbHNlIGlmICh2YWxBID4gdmFsQikgcmVzdWx0ID0gMTtcblxuICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdCAhPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBydWxlLm9yZGVyID09PSAnZGVzYycgPyAtcmVzdWx0IDogcmVzdWx0O1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGV2YWx1YXRpbmcgY3VzdG9tIHNvcnRpbmcgcnVsZXNcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBJZiBhbGwgcnVsZXMgZXF1YWwsIGNvbnRpbnVlIHRvIG5leHQgc3RyYXRlZ3kgKHJldHVybiAwKVxuICAgICAgICAgIHJldHVybiAwO1xuICAgICAgfVxuICB9XG5cbiAgLy8gMi4gQnVpbHQtaW4gb3IgZmFsbGJhY2tcbiAgc3dpdGNoIChzdHJhdGVneSkge1xuICAgIGNhc2UgXCJyZWNlbmN5XCI6XG4gICAgICByZXR1cm4gKGIubGFzdEFjY2Vzc2VkID8/IDApIC0gKGEubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgIGNhc2UgXCJuZXN0aW5nXCI6IC8vIEZvcm1lcmx5IGhpZXJhcmNoeVxuICAgICAgcmV0dXJuIGhpZXJhcmNoeVNjb3JlKGEpIC0gaGllcmFyY2h5U2NvcmUoYik7XG4gICAgY2FzZSBcInBpbm5lZFwiOlxuICAgICAgcmV0dXJuIHBpbm5lZFNjb3JlKGEpIC0gcGlubmVkU2NvcmUoYik7XG4gICAgY2FzZSBcInRpdGxlXCI6XG4gICAgICByZXR1cm4gYS50aXRsZS5sb2NhbGVDb21wYXJlKGIudGl0bGUpO1xuICAgIGNhc2UgXCJ1cmxcIjpcbiAgICAgIHJldHVybiBhLnVybC5sb2NhbGVDb21wYXJlKGIudXJsKTtcbiAgICBjYXNlIFwiY29udGV4dFwiOlxuICAgICAgcmV0dXJuIChhLmNvbnRleHQgPz8gXCJcIikubG9jYWxlQ29tcGFyZShiLmNvbnRleHQgPz8gXCJcIik7XG4gICAgY2FzZSBcImRvbWFpblwiOlxuICAgIGNhc2UgXCJkb21haW5fZnVsbFwiOlxuICAgICAgcmV0dXJuIGRvbWFpbkZyb21VcmwoYS51cmwpLmxvY2FsZUNvbXBhcmUoZG9tYWluRnJvbVVybChiLnVybCkpO1xuICAgIGNhc2UgXCJ0b3BpY1wiOlxuICAgICAgcmV0dXJuIHNlbWFudGljQnVja2V0KGEudGl0bGUsIGEudXJsKS5sb2NhbGVDb21wYXJlKHNlbWFudGljQnVja2V0KGIudGl0bGUsIGIudXJsKSk7XG4gICAgY2FzZSBcImxpbmVhZ2VcIjpcbiAgICAgIHJldHVybiBuYXZpZ2F0aW9uS2V5KGEpLmxvY2FsZUNvbXBhcmUobmF2aWdhdGlvbktleShiKSk7XG4gICAgY2FzZSBcImFnZVwiOlxuICAgICAgLy8gUmV2ZXJzZSBhbHBoYWJldGljYWwgZm9yIGFnZSBidWNrZXRzIChUb2RheSA8IFllc3RlcmRheSksIHJvdWdoIGFwcHJveFxuICAgICAgcmV0dXJuIChncm91cGluZ0tleShhLCBcImFnZVwiKSB8fCBcIlwiKS5sb2NhbGVDb21wYXJlKGdyb3VwaW5nS2V5KGIsIFwiYWdlXCIpIHx8IFwiXCIpO1xuICAgIGRlZmF1bHQ6XG4gICAgICAvLyBDaGVjayBpZiBpdCdzIGEgZ2VuZXJpYyBmaWVsZCBmaXJzdFxuICAgICAgY29uc3QgdmFsQSA9IGdldEZpZWxkVmFsdWUoYSwgc3RyYXRlZ3kpO1xuICAgICAgY29uc3QgdmFsQiA9IGdldEZpZWxkVmFsdWUoYiwgc3RyYXRlZ3kpO1xuXG4gICAgICBpZiAodmFsQSAhPT0gdW5kZWZpbmVkICYmIHZhbEIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGlmICh2YWxBIDwgdmFsQikgcmV0dXJuIC0xO1xuICAgICAgICAgIGlmICh2YWxBID4gdmFsQikgcmV0dXJuIDE7XG4gICAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9XG5cbiAgICAgIC8vIEZhbGxiYWNrIGZvciBjdXN0b20gc3RyYXRlZ2llcyBncm91cGluZyBrZXkgKGlmIHVzaW5nIGN1c3RvbSBzdHJhdGVneSBhcyBzb3J0aW5nIGJ1dCBubyBzb3J0aW5nIHJ1bGVzIGRlZmluZWQpXG4gICAgICAvLyBvciB1bmhhbmRsZWQgYnVpbHQtaW5zXG4gICAgICByZXR1cm4gKGdyb3VwaW5nS2V5KGEsIHN0cmF0ZWd5KSB8fCBcIlwiKS5sb2NhbGVDb21wYXJlKGdyb3VwaW5nS2V5KGIsIHN0cmF0ZWd5KSB8fCBcIlwiKTtcbiAgfVxufTtcbiIsICJpbXBvcnQgeyBUYWJHcm91cCwgVGFiTWV0YWRhdGEsIFByZWZlcmVuY2VzIH0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgbWFwQ2hyb21lVGFiLCBnZXRTdG9yZWRQcmVmZXJlbmNlcyB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcbmltcG9ydCB7IHNldEN1c3RvbVN0cmF0ZWdpZXMgfSBmcm9tIFwiLi4vYmFja2dyb3VuZC9ncm91cGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IHNvcnRUYWJzIH0gZnJvbSBcIi4uL2JhY2tncm91bmQvc29ydGluZ1N0cmF0ZWdpZXMuanNcIjtcblxuY29uc3QgZGVmYXVsdFByZWZlcmVuY2VzOiBQcmVmZXJlbmNlcyA9IHtcbiAgc29ydGluZzogW1wicGlubmVkXCIsIFwicmVjZW5jeVwiXSxcbiAgZGVidWc6IGZhbHNlLFxuICB0aGVtZTogXCJkYXJrXCIsXG4gIGN1c3RvbUdlbmVyYToge31cbn07XG5cbmV4cG9ydCBjb25zdCBmZXRjaExvY2FsU3RhdGUgPSBhc3luYyAoKSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgW3RhYnMsIGdyb3VwcywgcHJlZnNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgY2hyb21lLnRhYnMucXVlcnkoe30pLFxuICAgICAgY2hyb21lLnRhYkdyb3Vwcy5xdWVyeSh7fSksXG4gICAgICBnZXRTdG9yZWRQcmVmZXJlbmNlcygpXG4gICAgXSk7XG5cbiAgICBjb25zdCBwcmVmZXJlbmNlcyA9IHByZWZzIHx8IGRlZmF1bHRQcmVmZXJlbmNlcztcblxuICAgIC8vIEluaXRpYWxpemUgY3VzdG9tIHN0cmF0ZWdpZXMgZm9yIHNvcnRpbmdcbiAgICBzZXRDdXN0b21TdHJhdGVnaWVzKHByZWZlcmVuY2VzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pO1xuXG4gICAgY29uc3QgZ3JvdXBNYXAgPSBuZXcgTWFwKGdyb3Vwcy5tYXAoZyA9PiBbZy5pZCwgZ10pKTtcbiAgICBjb25zdCBtYXBwZWQgPSB0YWJzLm1hcChtYXBDaHJvbWVUYWIpLmZpbHRlcigodCk6IHQgaXMgVGFiTWV0YWRhdGEgPT4gQm9vbGVhbih0KSk7XG5cbiAgICBjb25zdCByZXN1bHRHcm91cHM6IFRhYkdyb3VwW10gPSBbXTtcbiAgICBjb25zdCB0YWJzQnlHcm91cElkID0gbmV3IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhW10+KCk7XG4gICAgY29uc3QgdGFic0J5V2luZG93VW5ncm91cGVkID0gbmV3IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhW10+KCk7XG5cbiAgICBtYXBwZWQuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgICBjb25zdCBncm91cElkID0gdGFiLmdyb3VwSWQgPz8gLTE7XG4gICAgICAgIGlmIChncm91cElkICE9PSAtMSkge1xuICAgICAgICAgICAgaWYgKCF0YWJzQnlHcm91cElkLmhhcyhncm91cElkKSkgdGFic0J5R3JvdXBJZC5zZXQoZ3JvdXBJZCwgW10pO1xuICAgICAgICAgICAgdGFic0J5R3JvdXBJZC5nZXQoZ3JvdXBJZCkhLnB1c2godGFiKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICBpZiAoIXRhYnNCeVdpbmRvd1VuZ3JvdXBlZC5oYXModGFiLndpbmRvd0lkKSkgdGFic0J5V2luZG93VW5ncm91cGVkLnNldCh0YWIud2luZG93SWQsIFtdKTtcbiAgICAgICAgICAgICB0YWJzQnlXaW5kb3dVbmdyb3VwZWQuZ2V0KHRhYi53aW5kb3dJZCkhLnB1c2godGFiKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIFRhYkdyb3VwIG9iamVjdHMgZm9yIGFjdHVhbCBncm91cHNcbiAgICBmb3IgKGNvbnN0IFtncm91cElkLCBncm91cFRhYnNdIG9mIHRhYnNCeUdyb3VwSWQpIHtcbiAgICAgICAgY29uc3QgYnJvd3Nlckdyb3VwID0gZ3JvdXBNYXAuZ2V0KGdyb3VwSWQpO1xuICAgICAgICBpZiAoYnJvd3Nlckdyb3VwKSB7XG4gICAgICAgICAgICByZXN1bHRHcm91cHMucHVzaCh7XG4gICAgICAgICAgICAgICAgaWQ6IGBncm91cC0ke2dyb3VwSWR9YCxcbiAgICAgICAgICAgICAgICB3aW5kb3dJZDogYnJvd3Nlckdyb3VwLndpbmRvd0lkLFxuICAgICAgICAgICAgICAgIGxhYmVsOiBicm93c2VyR3JvdXAudGl0bGUgfHwgXCJVbnRpdGxlZCBHcm91cFwiLFxuICAgICAgICAgICAgICAgIGNvbG9yOiBicm93c2VyR3JvdXAuY29sb3IsXG4gICAgICAgICAgICAgICAgdGFiczogc29ydFRhYnMoZ3JvdXBUYWJzLCBwcmVmZXJlbmNlcy5zb3J0aW5nKSxcbiAgICAgICAgICAgICAgICByZWFzb246IFwiTWFudWFsXCJcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gSGFuZGxlIHVuZ3JvdXBlZCB0YWJzXG4gICAgZm9yIChjb25zdCBbd2luZG93SWQsIHRhYnNdIG9mIHRhYnNCeVdpbmRvd1VuZ3JvdXBlZCkge1xuICAgICAgICByZXN1bHRHcm91cHMucHVzaCh7XG4gICAgICAgICAgICBpZDogYHVuZ3JvdXBlZC0ke3dpbmRvd0lkfWAsXG4gICAgICAgICAgICB3aW5kb3dJZDogd2luZG93SWQsXG4gICAgICAgICAgICBsYWJlbDogXCJVbmdyb3VwZWRcIixcbiAgICAgICAgICAgIGNvbG9yOiBcImdyZXlcIixcbiAgICAgICAgICAgIHRhYnM6IHNvcnRUYWJzKHRhYnMsIHByZWZlcmVuY2VzLnNvcnRpbmcpLFxuICAgICAgICAgICAgcmVhc29uOiBcIlVuZ3JvdXBlZFwiXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnNvbGUud2FybihcIkZldGNoZWQgbG9jYWwgc3RhdGUgKGZhbGxiYWNrKVwiKTtcbiAgICByZXR1cm4geyBvazogdHJ1ZSwgZGF0YTogeyBncm91cHM6IHJlc3VsdEdyb3VwcywgcHJlZmVyZW5jZXMgfSB9O1xuICB9IGNhdGNoIChlKSB7XG4gICAgY29uc29sZS5lcnJvcihcIkxvY2FsIHN0YXRlIGZldGNoIGZhaWxlZDpcIiwgZSk7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGUpIH07XG4gIH1cbn07XG4iLCAiaW1wb3J0IHtcbiAgQXBwbHlHcm91cGluZ1BheWxvYWQsXG4gIEdyb3VwaW5nU2VsZWN0aW9uLFxuICBQcmVmZXJlbmNlcyxcbiAgUnVudGltZU1lc3NhZ2UsXG4gIFJ1bnRpbWVSZXNwb25zZSxcbiAgU2F2ZWRTdGF0ZSxcbiAgU29ydGluZ1N0cmF0ZWd5LFxuICBUYWJHcm91cCxcbiAgVGFiTWV0YWRhdGFcbn0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgZmV0Y2hMb2NhbFN0YXRlIH0gZnJvbSBcIi4vbG9jYWxTdGF0ZS5qc1wiO1xuXG5leHBvcnQgY29uc3Qgc2VuZE1lc3NhZ2UgPSBhc3luYyA8VERhdGE+KHR5cGU6IFJ1bnRpbWVNZXNzYWdlW1widHlwZVwiXSwgcGF5bG9hZD86IGFueSk6IFByb21pc2U8UnVudGltZVJlc3BvbnNlPFREYXRhPj4gPT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGUsIHBheWxvYWQgfSwgKHJlc3BvbnNlKSA9PiB7XG4gICAgICBpZiAoY2hyb21lLnJ1bnRpbWUubGFzdEVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJSdW50aW1lIGVycm9yOlwiLCBjaHJvbWUucnVudGltZS5sYXN0RXJyb3IpO1xuICAgICAgICByZXNvbHZlKHsgb2s6IGZhbHNlLCBlcnJvcjogY2hyb21lLnJ1bnRpbWUubGFzdEVycm9yLm1lc3NhZ2UgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXNvbHZlKHJlc3BvbnNlIHx8IHsgb2s6IGZhbHNlLCBlcnJvcjogXCJObyByZXNwb25zZSBmcm9tIGJhY2tncm91bmRcIiB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSk7XG59O1xuXG5leHBvcnQgdHlwZSBUYWJXaXRoR3JvdXAgPSBUYWJNZXRhZGF0YSAmIHtcbiAgZ3JvdXBMYWJlbD86IHN0cmluZztcbiAgZ3JvdXBDb2xvcj86IHN0cmluZztcbiAgcmVhc29uPzogc3RyaW5nO1xufTtcblxuZXhwb3J0IGludGVyZmFjZSBXaW5kb3dWaWV3IHtcbiAgaWQ6IG51bWJlcjtcbiAgdGl0bGU6IHN0cmluZztcbiAgdGFiczogVGFiV2l0aEdyb3VwW107XG4gIHRhYkNvdW50OiBudW1iZXI7XG4gIGdyb3VwQ291bnQ6IG51bWJlcjtcbiAgcGlubmVkQ291bnQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IElDT05TID0ge1xuICBhY3RpdmU6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cG9seWdvbiBwb2ludHM9XCIzIDExIDIyIDIgMTMgMjEgMTEgMTMgMyAxMVwiPjwvcG9seWdvbj48L3N2Zz5gLFxuICBoaWRlOiBgPHN2ZyB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBhdGggZD1cIk0xNy45NCAxNy45NEExMC4wNyAxMC4wNyAwIDAgMSAxMiAyMGMtNyAwLTExLTgtMTEtOGExOC40NSAxOC40NSAwIDAgMSA1LjA2LTUuOTRNOS45IDQuMjRBOS4xMiA5LjEyIDAgMCAxIDEyIDRjNyAwIDExIDggMTEgOGExOC41IDE4LjUgMCAwIDEtMi4xNiAzLjE5bS02LjcyLTEuMDdhMyAzIDAgMSAxLTQuMjQtNC4yNFwiPjwvcGF0aD48bGluZSB4MT1cIjFcIiB5MT1cIjFcIiB4Mj1cIjIzXCIgeTI9XCIyM1wiPjwvbGluZT48L3N2Zz5gLFxuICBzaG93OiBgPHN2ZyB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBhdGggZD1cIk0xIDEyczQtOCAxMS04IDExIDggMTEgOC00IDgtMTEgOC0xMS04LTExLTgtMTEtOHpcIj48L3BhdGg+PGNpcmNsZSBjeD1cIjEyXCIgY3k9XCIxMlwiIHI9XCIzXCI+PC9jaXJjbGU+PC9zdmc+YCxcbiAgZm9jdXM6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjEwXCI+PC9jaXJjbGU+PGNpcmNsZSBjeD1cIjEyXCIgY3k9XCIxMlwiIHI9XCI2XCI+PC9jaXJjbGU+PGNpcmNsZSBjeD1cIjEyXCIgY3k9XCIxMlwiIHI9XCIyXCI+PC9jaXJjbGU+PC9zdmc+YCxcbiAgY2xvc2U6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48bGluZSB4MT1cIjE4XCIgeTE9XCI2XCIgeDI9XCI2XCIgeTI9XCIxOFwiPjwvbGluZT48bGluZSB4MT1cIjZcIiB5MT1cIjZcIiB4Mj1cIjE4XCIgeTI9XCIxOFwiPjwvbGluZT48L3N2Zz5gLFxuICB1bmdyb3VwOiBgPHN2ZyB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PGNpcmNsZSBjeD1cIjEyXCIgY3k9XCIxMlwiIHI9XCIxMFwiPjwvY2lyY2xlPjxsaW5lIHgxPVwiOFwiIHkxPVwiMTJcIiB4Mj1cIjE2XCIgeTI9XCIxMlwiPjwvbGluZT48L3N2Zz5gLFxuICBkZWZhdWx0RmlsZTogYDxzdmcgd2lkdGg9XCIyNFwiIGhlaWdodD1cIjI0XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwYXRoIGQ9XCJNMTQgMkg2YTIgMiAwIDAgMC0yIDJ2MTZhMiAyIDAgMCAwIDIgMmgxMmEyIDIgMCAwIDAgMi0yVjh6XCI+PC9wYXRoPjxwb2x5bGluZSBwb2ludHM9XCIxNCAyIDE0IDggMjAgOFwiPjwvcG9seWxpbmU+PGxpbmUgeDE9XCIxNlwiIHkxPVwiMTNcIiB4Mj1cIjhcIiB5Mj1cIjEzXCI+PC9saW5lPjxsaW5lIHgxPVwiMTZcIiB5MT1cIjE3XCIgeDI9XCI4XCIgeTI9XCIxN1wiPjwvbGluZT48cG9seWxpbmUgcG9pbnRzPVwiMTAgOSA5IDkgOCA5XCI+PC9wb2x5bGluZT48L3N2Zz5gLFxuICBhdXRvUnVuOiBgPHN2ZyB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBvbHlnb24gcG9pbnRzPVwiMTMgMiAzIDE0IDEyIDE0IDExIDIyIDIxIDEwIDEyIDEwIDEzIDJcIj48L3BvbHlnb24+PC9zdmc+YFxufTtcblxuZXhwb3J0IGNvbnN0IEdST1VQX0NPTE9SUzogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgZ3JleTogXCIjNjQ3NDhiXCIsXG4gIGJsdWU6IFwiIzNiODJmNlwiLFxuICByZWQ6IFwiI2VmNDQ0NFwiLFxuICB5ZWxsb3c6IFwiI2VhYjMwOFwiLFxuICBncmVlbjogXCIjMjJjNTVlXCIsXG4gIHBpbms6IFwiI2VjNDg5OVwiLFxuICBwdXJwbGU6IFwiI2E4NTVmN1wiLFxuICBjeWFuOiBcIiMwNmI2ZDRcIixcbiAgb3JhbmdlOiBcIiNmOTczMTZcIlxufTtcblxuZXhwb3J0IGNvbnN0IGdldEdyb3VwQ29sb3IgPSAobmFtZTogc3RyaW5nKSA9PiBHUk9VUF9DT0xPUlNbbmFtZV0gfHwgXCIjY2JkNWUxXCI7XG5cbmV4cG9ydCBjb25zdCBmZXRjaFN0YXRlID0gYXN5bmMgKCkgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgc2VuZE1lc3NhZ2U8eyBncm91cHM6IFRhYkdyb3VwW107IHByZWZlcmVuY2VzOiBQcmVmZXJlbmNlcyB9PihcImdldFN0YXRlXCIpO1xuICAgIGlmIChyZXNwb25zZS5vayAmJiByZXNwb25zZS5kYXRhKSB7XG4gICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgfVxuICAgIGNvbnNvbGUud2FybihcImZldGNoU3RhdGUgZmFpbGVkLCB1c2luZyBmYWxsYmFjazpcIiwgcmVzcG9uc2UuZXJyb3IpO1xuICAgIHJldHVybiBhd2FpdCBmZXRjaExvY2FsU3RhdGUoKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGNvbnNvbGUud2FybihcImZldGNoU3RhdGUgdGhyZXcgZXhjZXB0aW9uLCB1c2luZyBmYWxsYmFjazpcIiwgZSk7XG4gICAgcmV0dXJuIGF3YWl0IGZldGNoTG9jYWxTdGF0ZSgpO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgYXBwbHlHcm91cGluZyA9IGFzeW5jIChwYXlsb2FkOiBBcHBseUdyb3VwaW5nUGF5bG9hZCkgPT4ge1xuICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogXCJhcHBseUdyb3VwaW5nXCIsIHBheWxvYWQgfSk7XG4gIHJldHVybiByZXNwb25zZSBhcyBSdW50aW1lUmVzcG9uc2U8dW5rbm93bj47XG59O1xuXG5leHBvcnQgY29uc3QgYXBwbHlTb3J0aW5nID0gYXN5bmMgKHBheWxvYWQ6IEFwcGx5R3JvdXBpbmdQYXlsb2FkKSA9PiB7XG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImFwcGx5U29ydGluZ1wiLCBwYXlsb2FkIH0pO1xuICByZXR1cm4gcmVzcG9uc2UgYXMgUnVudGltZVJlc3BvbnNlPHVua25vd24+O1xufTtcblxuZXhwb3J0IGNvbnN0IG1hcFdpbmRvd3MgPSAoZ3JvdXBzOiBUYWJHcm91cFtdLCB3aW5kb3dUaXRsZXM6IE1hcDxudW1iZXIsIHN0cmluZz4pOiBXaW5kb3dWaWV3W10gPT4ge1xuICBjb25zdCB3aW5kb3dzID0gbmV3IE1hcDxudW1iZXIsIFRhYldpdGhHcm91cFtdPigpO1xuXG4gIGdyb3Vwcy5mb3JFYWNoKChncm91cCkgPT4ge1xuICAgIGNvbnN0IGlzVW5ncm91cGVkID0gZ3JvdXAucmVhc29uID09PSBcIlVuZ3JvdXBlZFwiO1xuICAgIGdyb3VwLnRhYnMuZm9yRWFjaCgodGFiKSA9PiB7XG4gICAgICBjb25zdCBkZWNvcmF0ZWQ6IFRhYldpdGhHcm91cCA9IHtcbiAgICAgICAgLi4udGFiLFxuICAgICAgICBncm91cExhYmVsOiBpc1VuZ3JvdXBlZCA/IHVuZGVmaW5lZCA6IGdyb3VwLmxhYmVsLFxuICAgICAgICBncm91cENvbG9yOiBpc1VuZ3JvdXBlZCA/IHVuZGVmaW5lZCA6IGdyb3VwLmNvbG9yLFxuICAgICAgICByZWFzb246IGdyb3VwLnJlYXNvblxuICAgICAgfTtcbiAgICAgIGNvbnN0IGV4aXN0aW5nID0gd2luZG93cy5nZXQodGFiLndpbmRvd0lkKSA/PyBbXTtcbiAgICAgIGV4aXN0aW5nLnB1c2goZGVjb3JhdGVkKTtcbiAgICAgIHdpbmRvd3Muc2V0KHRhYi53aW5kb3dJZCwgZXhpc3RpbmcpO1xuICAgIH0pO1xuICB9KTtcblxuICByZXR1cm4gQXJyYXkuZnJvbSh3aW5kb3dzLmVudHJpZXMoKSlcbiAgICAubWFwPFdpbmRvd1ZpZXc+KChbaWQsIHRhYnNdKSA9PiB7XG4gICAgICBjb25zdCBncm91cENvdW50ID0gbmV3IFNldCh0YWJzLm1hcCgodGFiKSA9PiB0YWIuZ3JvdXBMYWJlbCkuZmlsdGVyKChsKTogbCBpcyBzdHJpbmcgPT4gISFsKSkuc2l6ZTtcbiAgICAgIGNvbnN0IHBpbm5lZENvdW50ID0gdGFicy5maWx0ZXIoKHRhYikgPT4gdGFiLnBpbm5lZCkubGVuZ3RoO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgaWQsXG4gICAgICAgIHRpdGxlOiB3aW5kb3dUaXRsZXMuZ2V0KGlkKSA/PyBgV2luZG93ICR7aWR9YCxcbiAgICAgICAgdGFicyxcbiAgICAgICAgdGFiQ291bnQ6IHRhYnMubGVuZ3RoLFxuICAgICAgICBncm91cENvdW50LFxuICAgICAgICBwaW5uZWRDb3VudFxuICAgICAgfTtcbiAgICB9KVxuICAgIC5zb3J0KChhLCBiKSA9PiBhLmlkIC0gYi5pZCk7XG59O1xuXG5leHBvcnQgY29uc3QgZm9ybWF0RG9tYWluID0gKHVybDogc3RyaW5nKSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcGFyc2VkID0gbmV3IFVSTCh1cmwpO1xuICAgIHJldHVybiBwYXJzZWQuaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sIFwiXCIpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIHJldHVybiB1cmw7XG4gIH1cbn07XG4iLCAiaW1wb3J0IHtcbiAgR3JvdXBpbmdTZWxlY3Rpb24sXG4gIFByZWZlcmVuY2VzLFxuICBTYXZlZFN0YXRlLFxuICBTb3J0aW5nU3RyYXRlZ3ksXG4gIExvZ0xldmVsLFxuICBUYWJHcm91cFxufSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQge1xuICBhcHBseUdyb3VwaW5nLFxuICBhcHBseVNvcnRpbmcsXG4gIGZldGNoU3RhdGUsXG4gIElDT05TLFxuICBtYXBXaW5kb3dzLFxuICBzZW5kTWVzc2FnZSxcbiAgVGFiV2l0aEdyb3VwLFxuICBXaW5kb3dWaWV3LFxuICBHUk9VUF9DT0xPUlNcbn0gZnJvbSBcIi4vY29tbW9uLmpzXCI7XG5pbXBvcnQgeyBnZXRTdHJhdGVnaWVzLCBTVFJBVEVHSUVTLCBTdHJhdGVneURlZmluaXRpb24gfSBmcm9tIFwiLi4vc2hhcmVkL3N0cmF0ZWd5UmVnaXN0cnkuanNcIjtcbmltcG9ydCB7IHNldExvZ2dlclByZWZlcmVuY2VzLCBsb2dEZWJ1ZywgbG9nSW5mbyB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBmZXRjaExvY2FsU3RhdGUgfSBmcm9tIFwiLi9sb2NhbFN0YXRlLmpzXCI7XG5cbi8vIEVsZW1lbnRzXG5jb25zdCBzZWFyY2hJbnB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwidGFiU2VhcmNoXCIpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG5jb25zdCB3aW5kb3dzQ29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ3aW5kb3dzXCIpIGFzIEhUTUxEaXZFbGVtZW50O1xuXG5jb25zdCBzZWxlY3RBbGxDaGVja2JveCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2VsZWN0QWxsXCIpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG5jb25zdCBidG5BcHBseSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuQXBwbHlcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5jb25zdCBidG5Vbmdyb3VwID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5Vbmdyb3VwXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50O1xuY29uc3QgYnRuTWVyZ2UgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0bk1lcmdlXCIpIGFzIEhUTUxCdXR0b25FbGVtZW50O1xuY29uc3QgYnRuU3BsaXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0blNwbGl0XCIpIGFzIEhUTUxCdXR0b25FbGVtZW50O1xuY29uc3QgYnRuRXhwYW5kQWxsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5FeHBhbmRBbGxcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5jb25zdCBidG5Db2xsYXBzZUFsbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuQ29sbGFwc2VBbGxcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cbmNvbnN0IGFjdGl2ZVN0cmF0ZWdpZXNMaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJhY3RpdmVTdHJhdGVnaWVzTGlzdFwiKSBhcyBIVE1MRGl2RWxlbWVudDtcbmNvbnN0IGFkZFN0cmF0ZWd5U2VsZWN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJhZGRTdHJhdGVneVNlbGVjdFwiKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcblxuLy8gU3RhdHNcbmNvbnN0IHN0YXRUYWJzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzdGF0VGFic1wiKSBhcyBIVE1MRWxlbWVudDtcbmNvbnN0IHN0YXRHcm91cHMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInN0YXRHcm91cHNcIikgYXMgSFRNTEVsZW1lbnQ7XG5jb25zdCBzdGF0V2luZG93cyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3RhdFdpbmRvd3NcIikgYXMgSFRNTEVsZW1lbnQ7XG5cbmNvbnN0IHByb2dyZXNzT3ZlcmxheSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicHJvZ3Jlc3NPdmVybGF5XCIpIGFzIEhUTUxEaXZFbGVtZW50O1xuY29uc3QgcHJvZ3Jlc3NUZXh0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJwcm9ncmVzc1RleHRcIikgYXMgSFRNTERpdkVsZW1lbnQ7XG5jb25zdCBwcm9ncmVzc0NvdW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJwcm9ncmVzc0NvdW50XCIpIGFzIEhUTUxEaXZFbGVtZW50O1xuXG5jb25zdCBzaG93TG9hZGluZyA9ICh0ZXh0OiBzdHJpbmcpID0+IHtcbiAgICBpZiAocHJvZ3Jlc3NPdmVybGF5KSB7XG4gICAgICAgIHByb2dyZXNzVGV4dC50ZXh0Q29udGVudCA9IHRleHQ7XG4gICAgICAgIHByb2dyZXNzQ291bnQudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgICAgICBwcm9ncmVzc092ZXJsYXkuY2xhc3NMaXN0LnJlbW92ZShcImhpZGRlblwiKTtcbiAgICB9XG59O1xuXG5jb25zdCBoaWRlTG9hZGluZyA9ICgpID0+IHtcbiAgICBpZiAocHJvZ3Jlc3NPdmVybGF5KSB7XG4gICAgICAgIHByb2dyZXNzT3ZlcmxheS5jbGFzc0xpc3QuYWRkKFwiaGlkZGVuXCIpO1xuICAgIH1cbn07XG5cbmNvbnN0IHVwZGF0ZVByb2dyZXNzID0gKGNvbXBsZXRlZDogbnVtYmVyLCB0b3RhbDogbnVtYmVyKSA9PiB7XG4gICAgaWYgKHByb2dyZXNzT3ZlcmxheSAmJiAhcHJvZ3Jlc3NPdmVybGF5LmNsYXNzTGlzdC5jb250YWlucyhcImhpZGRlblwiKSkge1xuICAgICAgICBwcm9ncmVzc0NvdW50LnRleHRDb250ZW50ID0gYCR7Y29tcGxldGVkfSAvICR7dG90YWx9YDtcbiAgICB9XG59O1xuXG5sZXQgd2luZG93U3RhdGU6IFdpbmRvd1ZpZXdbXSA9IFtdO1xubGV0IGZvY3VzZWRXaW5kb3dJZDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5jb25zdCBzZWxlY3RlZFRhYnMgPSBuZXcgU2V0PG51bWJlcj4oKTtcbmxldCBpbml0aWFsU2VsZWN0aW9uRG9uZSA9IGZhbHNlO1xubGV0IHByZWZlcmVuY2VzOiBQcmVmZXJlbmNlcyB8IG51bGwgPSBudWxsO1xuXG4vLyBUcmVlIFN0YXRlXG5jb25zdCBleHBhbmRlZE5vZGVzID0gbmV3IFNldDxzdHJpbmc+KCk7IC8vIERlZmF1bHQgZW1wdHkgPSBhbGwgY29sbGFwc2VkXG5jb25zdCBUUkVFX0lDT05TID0ge1xuICBjaGV2cm9uUmlnaHQ6IGA8c3ZnIHdpZHRoPVwiMTAwJVwiIGhlaWdodD1cIjEwMCVcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBvbHlsaW5lIHBvaW50cz1cIjkgMTggMTUgMTIgOSA2XCI+PC9wb2x5bGluZT48L3N2Zz5gLFxuICBmb2xkZXI6IGA8c3ZnIHdpZHRoPVwiMTAwJVwiIGhlaWdodD1cIjEwMCVcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBhdGggZD1cIk0yMiAxOWEyIDIgMCAwIDEtMiAySDRhMiAyIDAgMCAxLTItMlY1YTIgMiAwIDAgMSAyLTJoNWwyIDNoOWEyIDIgMCAwIDEgMiAyelwiPjwvcGF0aD48L3N2Zz5gXG59O1xuXG5jb25zdCBoZXhUb1JnYmEgPSAoaGV4OiBzdHJpbmcsIGFscGhhOiBudW1iZXIpID0+IHtcbiAgICAvLyBFbnN1cmUgaGV4IGZvcm1hdFxuICAgIGlmICghaGV4LnN0YXJ0c1dpdGgoJyMnKSkgcmV0dXJuIGhleDtcbiAgICBjb25zdCByID0gcGFyc2VJbnQoaGV4LnNsaWNlKDEsIDMpLCAxNik7XG4gICAgY29uc3QgZyA9IHBhcnNlSW50KGhleC5zbGljZSgzLCA1KSwgMTYpO1xuICAgIGNvbnN0IGIgPSBwYXJzZUludChoZXguc2xpY2UoNSwgNyksIDE2KTtcbiAgICByZXR1cm4gYHJnYmEoJHtyfSwgJHtnfSwgJHtifSwgJHthbHBoYX0pYDtcbn07XG5cbmNvbnN0IHVwZGF0ZVN0YXRzID0gKCkgPT4ge1xuICBjb25zdCB0b3RhbFRhYnMgPSB3aW5kb3dTdGF0ZS5yZWR1Y2UoKGFjYywgd2luKSA9PiBhY2MgKyB3aW4udGFiQ291bnQsIDApO1xuICBjb25zdCB0b3RhbEdyb3VwcyA9IG5ldyBTZXQod2luZG93U3RhdGUuZmxhdE1hcCh3ID0+IHcudGFicy5maWx0ZXIodCA9PiB0Lmdyb3VwTGFiZWwpLm1hcCh0ID0+IGAke3cuaWR9LSR7dC5ncm91cExhYmVsfWApKSkuc2l6ZTtcblxuICBzdGF0VGFicy50ZXh0Q29udGVudCA9IGAke3RvdGFsVGFic30gVGFic2A7XG4gIHN0YXRHcm91cHMudGV4dENvbnRlbnQgPSBgJHt0b3RhbEdyb3Vwc30gR3JvdXBzYDtcbiAgc3RhdFdpbmRvd3MudGV4dENvbnRlbnQgPSBgJHt3aW5kb3dTdGF0ZS5sZW5ndGh9IFdpbmRvd3NgO1xuXG4gIC8vIFVwZGF0ZSBzZWxlY3Rpb24gYnV0dG9uc1xuICBjb25zdCBoYXNTZWxlY3Rpb24gPSBzZWxlY3RlZFRhYnMuc2l6ZSA+IDA7XG4gIGJ0blVuZ3JvdXAuZGlzYWJsZWQgPSAhaGFzU2VsZWN0aW9uO1xuICBidG5NZXJnZS5kaXNhYmxlZCA9ICFoYXNTZWxlY3Rpb247XG4gIGJ0blNwbGl0LmRpc2FibGVkID0gIWhhc1NlbGVjdGlvbjtcblxuICBidG5Vbmdyb3VwLnN0eWxlLm9wYWNpdHkgPSBoYXNTZWxlY3Rpb24gPyBcIjFcIiA6IFwiMC41XCI7XG4gIGJ0bk1lcmdlLnN0eWxlLm9wYWNpdHkgPSBoYXNTZWxlY3Rpb24gPyBcIjFcIiA6IFwiMC41XCI7XG4gIGJ0blNwbGl0LnN0eWxlLm9wYWNpdHkgPSBoYXNTZWxlY3Rpb24gPyBcIjFcIiA6IFwiMC41XCI7XG5cbiAgLy8gVXBkYXRlIFNlbGVjdCBBbGwgQ2hlY2tib3ggU3RhdGVcbiAgaWYgKHRvdGFsVGFicyA9PT0gMCkge1xuICAgIHNlbGVjdEFsbENoZWNrYm94LmNoZWNrZWQgPSBmYWxzZTtcbiAgICBzZWxlY3RBbGxDaGVja2JveC5pbmRldGVybWluYXRlID0gZmFsc2U7XG4gIH0gZWxzZSBpZiAoc2VsZWN0ZWRUYWJzLnNpemUgPT09IHRvdGFsVGFicykge1xuICAgIHNlbGVjdEFsbENoZWNrYm94LmNoZWNrZWQgPSB0cnVlO1xuICAgIHNlbGVjdEFsbENoZWNrYm94LmluZGV0ZXJtaW5hdGUgPSBmYWxzZTtcbiAgfSBlbHNlIGlmIChzZWxlY3RlZFRhYnMuc2l6ZSA+IDApIHtcbiAgICBzZWxlY3RBbGxDaGVja2JveC5jaGVja2VkID0gZmFsc2U7XG4gICAgc2VsZWN0QWxsQ2hlY2tib3guaW5kZXRlcm1pbmF0ZSA9IHRydWU7XG4gIH0gZWxzZSB7XG4gICAgc2VsZWN0QWxsQ2hlY2tib3guY2hlY2tlZCA9IGZhbHNlO1xuICAgIHNlbGVjdEFsbENoZWNrYm94LmluZGV0ZXJtaW5hdGUgPSBmYWxzZTtcbiAgfVxufTtcblxuY29uc3QgY3JlYXRlTm9kZSA9IChcbiAgICBjb250ZW50OiBIVE1MRWxlbWVudCxcbiAgICBjaGlsZHJlbkNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCBudWxsLFxuICAgIGxldmVsOiAnd2luZG93JyB8ICdncm91cCcgfCAndGFiJyxcbiAgICBpc0V4cGFuZGVkOiBib29sZWFuID0gZmFsc2UsXG4gICAgb25Ub2dnbGU/OiAoKSA9PiB2b2lkXG4pID0+IHtcbiAgICBjb25zdCBub2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBub2RlLmNsYXNzTmFtZSA9IGB0cmVlLW5vZGUgbm9kZS0ke2xldmVsfWA7XG5cbiAgICBjb25zdCByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIHJvdy5jbGFzc05hbWUgPSBgdHJlZS1yb3cgJHtsZXZlbH0tcm93YDtcblxuICAgIC8vIFRvZ2dsZVxuICAgIGNvbnN0IHRvZ2dsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgdG9nZ2xlLmNsYXNzTmFtZSA9IGB0cmVlLXRvZ2dsZSAke2lzRXhwYW5kZWQgPyAncm90YXRlZCcgOiAnJ31gO1xuICAgIGlmIChjaGlsZHJlbkNvbnRhaW5lcikge1xuICAgICAgICB0b2dnbGUuaW5uZXJIVE1MID0gVFJFRV9JQ09OUy5jaGV2cm9uUmlnaHQ7XG4gICAgICAgIHRvZ2dsZS5vbmNsaWNrID0gKGUpID0+IHtcbiAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICBpZiAob25Ub2dnbGUpIG9uVG9nZ2xlKCk7XG4gICAgICAgIH07XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdG9nZ2xlLmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xuICAgIH1cblxuICAgIHJvdy5hcHBlbmRDaGlsZCh0b2dnbGUpO1xuICAgIHJvdy5hcHBlbmRDaGlsZChjb250ZW50KTsgLy8gQ29udGVudCBoYW5kbGVzIGNoZWNrYm94ICsgaWNvbiArIHRleHQgKyBhY3Rpb25zXG5cbiAgICBub2RlLmFwcGVuZENoaWxkKHJvdyk7XG5cbiAgICBpZiAoY2hpbGRyZW5Db250YWluZXIpIHtcbiAgICAgICAgY2hpbGRyZW5Db250YWluZXIuY2xhc3NOYW1lID0gYHRyZWUtY2hpbGRyZW4gJHtpc0V4cGFuZGVkID8gJ2V4cGFuZGVkJyA6ICcnfWA7XG4gICAgICAgIG5vZGUuYXBwZW5kQ2hpbGQoY2hpbGRyZW5Db250YWluZXIpO1xuICAgIH1cblxuICAgIC8vIFRvZ2dsZSBpbnRlcmFjdGlvbiBvbiByb3cgY2xpY2sgZm9yIFdpbmRvd3MgYW5kIEdyb3Vwc1xuICAgIGlmIChjaGlsZHJlbkNvbnRhaW5lciAmJiBsZXZlbCAhPT0gJ3RhYicpIHtcbiAgICAgICAgcm93LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICAgICAgICAgIC8vIEF2b2lkIHRvZ2dsaW5nIGlmIGNsaWNraW5nIGFjdGlvbnMgb3IgY2hlY2tib3hcbiAgICAgICAgICAgIGlmICgoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpLmNsb3Nlc3QoJy5hY3Rpb24tYnRuJykgfHwgKGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5jbG9zZXN0KCcudHJlZS1jaGVja2JveCcpKSByZXR1cm47XG4gICAgICAgICAgICBpZiAob25Ub2dnbGUpIG9uVG9nZ2xlKCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiB7IG5vZGUsIHRvZ2dsZSwgY2hpbGRyZW5Db250YWluZXIgfTtcbn07XG5cbmNvbnN0IHJlbmRlclRyZWUgPSAoKSA9PiB7XG4gIGNvbnN0IHF1ZXJ5ID0gc2VhcmNoSW5wdXQudmFsdWUudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gIHdpbmRvd3NDb250YWluZXIuaW5uZXJIVE1MID0gXCJcIjtcblxuICAvLyBGaWx0ZXIgTG9naWNcbiAgY29uc3QgZmlsdGVyZWQgPSB3aW5kb3dTdGF0ZVxuICAgIC5tYXAoKHdpbmRvdykgPT4ge1xuICAgICAgaWYgKCFxdWVyeSkgcmV0dXJuIHsgd2luZG93LCB2aXNpYmxlVGFiczogd2luZG93LnRhYnMgfTtcbiAgICAgIGNvbnN0IHZpc2libGVUYWJzID0gd2luZG93LnRhYnMuZmlsdGVyKFxuICAgICAgICAodGFiKSA9PiB0YWIudGl0bGUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxdWVyeSkgfHwgdGFiLnVybC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHF1ZXJ5KVxuICAgICAgKTtcbiAgICAgIHJldHVybiB7IHdpbmRvdywgdmlzaWJsZVRhYnMgfTtcbiAgICB9KVxuICAgIC5maWx0ZXIoKHsgdmlzaWJsZVRhYnMgfSkgPT4gdmlzaWJsZVRhYnMubGVuZ3RoID4gMCB8fCAhcXVlcnkpO1xuXG4gIGZpbHRlcmVkLmZvckVhY2goKHsgd2luZG93LCB2aXNpYmxlVGFicyB9KSA9PiB7XG4gICAgY29uc3Qgd2luZG93S2V5ID0gYHctJHt3aW5kb3cuaWR9YDtcbiAgICBjb25zdCBpc0V4cGFuZGVkID0gISFxdWVyeSB8fCBleHBhbmRlZE5vZGVzLmhhcyh3aW5kb3dLZXkpO1xuXG4gICAgLy8gV2luZG93IENoZWNrYm94IExvZ2ljXG4gICAgY29uc3QgYWxsVGFiSWRzID0gdmlzaWJsZVRhYnMubWFwKHQgPT4gdC5pZCk7XG4gICAgY29uc3Qgc2VsZWN0ZWRDb3VudCA9IGFsbFRhYklkcy5maWx0ZXIoaWQgPT4gc2VsZWN0ZWRUYWJzLmhhcyhpZCkpLmxlbmd0aDtcbiAgICBjb25zdCBpc0FsbCA9IHNlbGVjdGVkQ291bnQgPT09IGFsbFRhYklkcy5sZW5ndGggJiYgYWxsVGFiSWRzLmxlbmd0aCA+IDA7XG4gICAgY29uc3QgaXNTb21lID0gc2VsZWN0ZWRDb3VudCA+IDAgJiYgc2VsZWN0ZWRDb3VudCA8IGFsbFRhYklkcy5sZW5ndGg7XG5cbiAgICBjb25zdCB3aW5DaGVja2JveCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbnB1dFwiKTtcbiAgICB3aW5DaGVja2JveC50eXBlID0gXCJjaGVja2JveFwiO1xuICAgIHdpbkNoZWNrYm94LmNsYXNzTmFtZSA9IFwidHJlZS1jaGVja2JveFwiO1xuICAgIHdpbkNoZWNrYm94LmNoZWNrZWQgPSBpc0FsbDtcbiAgICB3aW5DaGVja2JveC5pbmRldGVybWluYXRlID0gaXNTb21lO1xuICAgIHdpbkNoZWNrYm94Lm9uY2xpY2sgPSAoZSkgPT4ge1xuICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICBjb25zdCB0YXJnZXRTdGF0ZSA9ICFpc0FsbDsgLy8gSWYgYWxsIHdlcmUgc2VsZWN0ZWQsIGRlc2VsZWN0LiBPdGhlcndpc2Ugc2VsZWN0IGFsbC5cbiAgICAgICAgYWxsVGFiSWRzLmZvckVhY2goaWQgPT4ge1xuICAgICAgICAgICAgaWYgKHRhcmdldFN0YXRlKSBzZWxlY3RlZFRhYnMuYWRkKGlkKTtcbiAgICAgICAgICAgIGVsc2Ugc2VsZWN0ZWRUYWJzLmRlbGV0ZShpZCk7XG4gICAgICAgIH0pO1xuICAgICAgICByZW5kZXJUcmVlKCk7XG4gICAgfTtcblxuICAgIC8vIFdpbmRvdyBDb250ZW50XG4gICAgY29uc3Qgd2luQ29udGVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgd2luQ29udGVudC5zdHlsZS5kaXNwbGF5ID0gXCJmbGV4XCI7XG4gICAgd2luQ29udGVudC5zdHlsZS5hbGlnbkl0ZW1zID0gXCJjZW50ZXJcIjtcbiAgICB3aW5Db250ZW50LnN0eWxlLmZsZXggPSBcIjFcIjtcbiAgICB3aW5Db250ZW50LnN0eWxlLm92ZXJmbG93ID0gXCJoaWRkZW5cIjtcblxuICAgIGNvbnN0IGxhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBsYWJlbC5jbGFzc05hbWUgPSBcInRyZWUtbGFiZWxcIjtcbiAgICBsYWJlbC50ZXh0Q29udGVudCA9IHdpbmRvdy50aXRsZTtcblxuICAgIGNvbnN0IGNvdW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBjb3VudC5jbGFzc05hbWUgPSBcInRyZWUtY291bnRcIjtcbiAgICBjb3VudC50ZXh0Q29udGVudCA9IGAoJHt2aXNpYmxlVGFicy5sZW5ndGh9IFRhYnMpYDtcblxuICAgIHdpbkNvbnRlbnQuYXBwZW5kKHdpbkNoZWNrYm94LCBsYWJlbCwgY291bnQpO1xuXG4gICAgLy8gQ2hpbGRyZW4gKEdyb3VwcylcbiAgICBjb25zdCBjaGlsZHJlbkNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG5cbiAgICAvLyBHcm91cCB0YWJzXG4gICAgY29uc3QgZ3JvdXBzID0gbmV3IE1hcDxzdHJpbmcsIHsgY29sb3I6IHN0cmluZzsgdGFiczogVGFiV2l0aEdyb3VwW10gfT4oKTtcbiAgICBjb25zdCB1bmdyb3VwZWRUYWJzOiBUYWJXaXRoR3JvdXBbXSA9IFtdO1xuICAgIHZpc2libGVUYWJzLmZvckVhY2godGFiID0+IHtcbiAgICAgICAgaWYgKHRhYi5ncm91cExhYmVsKSB7XG4gICAgICAgICAgICBjb25zdCBrZXkgPSB0YWIuZ3JvdXBMYWJlbDtcbiAgICAgICAgICAgIGNvbnN0IGVudHJ5ID0gZ3JvdXBzLmdldChrZXkpID8/IHsgY29sb3I6IHRhYi5ncm91cENvbG9yISwgdGFiczogW10gfTtcbiAgICAgICAgICAgIGVudHJ5LnRhYnMucHVzaCh0YWIpO1xuICAgICAgICAgICAgZ3JvdXBzLnNldChrZXksIGVudHJ5KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHVuZ3JvdXBlZFRhYnMucHVzaCh0YWIpO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBjb25zdCBjcmVhdGVUYWJOb2RlID0gKHRhYjogVGFiV2l0aEdyb3VwKSA9PiB7XG4gICAgICAgIGNvbnN0IHRhYkNvbnRlbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICB0YWJDb250ZW50LnN0eWxlLmRpc3BsYXkgPSBcImZsZXhcIjtcbiAgICAgICAgdGFiQ29udGVudC5zdHlsZS5hbGlnbkl0ZW1zID0gXCJjZW50ZXJcIjtcbiAgICAgICAgdGFiQ29udGVudC5zdHlsZS5mbGV4ID0gXCIxXCI7XG4gICAgICAgIHRhYkNvbnRlbnQuc3R5bGUub3ZlcmZsb3cgPSBcImhpZGRlblwiO1xuXG4gICAgICAgIC8vIFRhYiBDaGVja2JveFxuICAgICAgICBjb25zdCB0YWJDaGVja2JveCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbnB1dFwiKTtcbiAgICAgICAgdGFiQ2hlY2tib3gudHlwZSA9IFwiY2hlY2tib3hcIjtcbiAgICAgICAgdGFiQ2hlY2tib3guY2xhc3NOYW1lID0gXCJ0cmVlLWNoZWNrYm94XCI7XG4gICAgICAgIHRhYkNoZWNrYm94LmNoZWNrZWQgPSBzZWxlY3RlZFRhYnMuaGFzKHRhYi5pZCk7XG4gICAgICAgIHRhYkNoZWNrYm94Lm9uY2xpY2sgPSAoZSkgPT4ge1xuICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgIGlmICh0YWJDaGVja2JveC5jaGVja2VkKSBzZWxlY3RlZFRhYnMuYWRkKHRhYi5pZCk7XG4gICAgICAgICAgICBlbHNlIHNlbGVjdGVkVGFicy5kZWxldGUodGFiLmlkKTtcbiAgICAgICAgICAgIHJlbmRlclRyZWUoKTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCB0YWJJY29uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgdGFiSWNvbi5jbGFzc05hbWUgPSBcInRyZWUtaWNvblwiO1xuICAgICAgICBpZiAodGFiLmZhdkljb25VcmwpIHtcbiAgICAgICAgICAgIGNvbnN0IGltZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbWdcIik7XG4gICAgICAgICAgICBpbWcuc3JjID0gdGFiLmZhdkljb25Vcmw7XG4gICAgICAgICAgICBpbWcub25lcnJvciA9ICgpID0+IHsgdGFiSWNvbi5pbm5lckhUTUwgPSBJQ09OUy5kZWZhdWx0RmlsZTsgfTtcbiAgICAgICAgICAgIHRhYkljb24uYXBwZW5kQ2hpbGQoaW1nKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRhYkljb24uaW5uZXJIVE1MID0gSUNPTlMuZGVmYXVsdEZpbGU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB0YWJUaXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIHRhYlRpdGxlLmNsYXNzTmFtZSA9IFwidHJlZS1sYWJlbFwiO1xuICAgICAgICB0YWJUaXRsZS50ZXh0Q29udGVudCA9IHRhYi50aXRsZTtcbiAgICAgICAgdGFiVGl0bGUudGl0bGUgPSB0YWIudGl0bGU7XG5cbiAgICAgICAgY29uc3QgdGFiQWN0aW9ucyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIHRhYkFjdGlvbnMuY2xhc3NOYW1lID0gXCJyb3ctYWN0aW9uc1wiO1xuICAgICAgICBjb25zdCBjbG9zZUJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gICAgICAgIGNsb3NlQnRuLmNsYXNzTmFtZSA9IFwiYWN0aW9uLWJ0biBkZWxldGVcIjtcbiAgICAgICAgY2xvc2VCdG4uaW5uZXJIVE1MID0gSUNPTlMuY2xvc2U7XG4gICAgICAgIGNsb3NlQnRuLnRpdGxlID0gXCJDbG9zZSBUYWJcIjtcbiAgICAgICAgY2xvc2VCdG4ub25jbGljayA9IGFzeW5jIChlKSA9PiB7XG4gICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMucmVtb3ZlKHRhYi5pZCk7XG4gICAgICAgICAgICBhd2FpdCBsb2FkU3RhdGUoKTtcbiAgICAgICAgfTtcbiAgICAgICAgdGFiQWN0aW9ucy5hcHBlbmRDaGlsZChjbG9zZUJ0bik7XG5cbiAgICAgICAgdGFiQ29udGVudC5hcHBlbmQodGFiQ2hlY2tib3gsIHRhYkljb24sIHRhYlRpdGxlLCB0YWJBY3Rpb25zKTtcblxuICAgICAgICBjb25zdCB7IG5vZGU6IHRhYk5vZGUgfSA9IGNyZWF0ZU5vZGUodGFiQ29udGVudCwgbnVsbCwgJ3RhYicpO1xuICAgICAgICB0YWJOb2RlLm9uY2xpY2sgPSBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgICAgLy8gQ2xpY2tpbmcgdGFiIHJvdyBhY3RpdmF0ZXMgdGFiICh1bmxlc3MgY2xpY2tpbmcgY2hlY2tib3gvYWN0aW9uKVxuICAgICAgICAgICAgaWYgKChlLnRhcmdldCBhcyBIVE1MRWxlbWVudCkuY2xvc2VzdCgnLnRyZWUtY2hlY2tib3gnKSkgcmV0dXJuO1xuICAgICAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMudXBkYXRlKHRhYi5pZCwgeyBhY3RpdmU6IHRydWUgfSk7XG4gICAgICAgICAgICBhd2FpdCBjaHJvbWUud2luZG93cy51cGRhdGUodGFiLndpbmRvd0lkLCB7IGZvY3VzZWQ6IHRydWUgfSk7XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiB0YWJOb2RlO1xuICAgIH07XG5cbiAgICBBcnJheS5mcm9tKGdyb3Vwcy5lbnRyaWVzKCkpLnNvcnQoKS5mb3JFYWNoKChbZ3JvdXBMYWJlbCwgZ3JvdXBEYXRhXSkgPT4ge1xuICAgICAgICBjb25zdCBncm91cEtleSA9IGAke3dpbmRvd0tleX0tZy0ke2dyb3VwTGFiZWx9YDtcbiAgICAgICAgY29uc3QgaXNHcm91cEV4cGFuZGVkID0gISFxdWVyeSB8fCBleHBhbmRlZE5vZGVzLmhhcyhncm91cEtleSk7XG5cbiAgICAgICAgLy8gR3JvdXAgQ2hlY2tib3ggTG9naWNcbiAgICAgICAgY29uc3QgZ3JvdXBUYWJJZHMgPSBncm91cERhdGEudGFicy5tYXAodCA9PiB0LmlkKTtcbiAgICAgICAgY29uc3QgZ3JwU2VsZWN0ZWRDb3VudCA9IGdyb3VwVGFiSWRzLmZpbHRlcihpZCA9PiBzZWxlY3RlZFRhYnMuaGFzKGlkKSkubGVuZ3RoO1xuICAgICAgICBjb25zdCBncnBJc0FsbCA9IGdycFNlbGVjdGVkQ291bnQgPT09IGdyb3VwVGFiSWRzLmxlbmd0aCAmJiBncm91cFRhYklkcy5sZW5ndGggPiAwO1xuICAgICAgICBjb25zdCBncnBJc1NvbWUgPSBncnBTZWxlY3RlZENvdW50ID4gMCAmJiBncnBTZWxlY3RlZENvdW50IDwgZ3JvdXBUYWJJZHMubGVuZ3RoO1xuXG4gICAgICAgIGNvbnN0IGdycENoZWNrYm94ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImlucHV0XCIpO1xuICAgICAgICBncnBDaGVja2JveC50eXBlID0gXCJjaGVja2JveFwiO1xuICAgICAgICBncnBDaGVja2JveC5jbGFzc05hbWUgPSBcInRyZWUtY2hlY2tib3hcIjtcbiAgICAgICAgZ3JwQ2hlY2tib3guY2hlY2tlZCA9IGdycElzQWxsO1xuICAgICAgICBncnBDaGVja2JveC5pbmRldGVybWluYXRlID0gZ3JwSXNTb21lO1xuICAgICAgICBncnBDaGVja2JveC5vbmNsaWNrID0gKGUpID0+IHtcbiAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICBjb25zdCB0YXJnZXRTdGF0ZSA9ICFncnBJc0FsbDtcbiAgICAgICAgICAgIGdyb3VwVGFiSWRzLmZvckVhY2goaWQgPT4ge1xuICAgICAgICAgICAgICAgIGlmICh0YXJnZXRTdGF0ZSkgc2VsZWN0ZWRUYWJzLmFkZChpZCk7XG4gICAgICAgICAgICAgICAgZWxzZSBzZWxlY3RlZFRhYnMuZGVsZXRlKGlkKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmVuZGVyVHJlZSgpO1xuICAgICAgICB9O1xuXG4gICAgICAgIC8vIEdyb3VwIENvbnRlbnRcbiAgICAgICAgY29uc3QgZ3JwQ29udGVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIGdycENvbnRlbnQuc3R5bGUuZGlzcGxheSA9IFwiZmxleFwiO1xuICAgICAgICBncnBDb250ZW50LnN0eWxlLmFsaWduSXRlbXMgPSBcImNlbnRlclwiO1xuICAgICAgICBncnBDb250ZW50LnN0eWxlLmZsZXggPSBcIjFcIjtcbiAgICAgICAgZ3JwQ29udGVudC5zdHlsZS5vdmVyZmxvdyA9IFwiaGlkZGVuXCI7XG5cbiAgICAgICAgY29uc3QgaWNvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIGljb24uY2xhc3NOYW1lID0gXCJ0cmVlLWljb25cIjtcbiAgICAgICAgaWNvbi5pbm5lckhUTUwgPSBUUkVFX0lDT05TLmZvbGRlcjtcblxuICAgICAgICBjb25zdCBncnBMYWJlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIGdycExhYmVsLmNsYXNzTmFtZSA9IFwidHJlZS1sYWJlbFwiO1xuICAgICAgICBncnBMYWJlbC50ZXh0Q29udGVudCA9IGdyb3VwTGFiZWw7XG5cbiAgICAgICAgY29uc3QgZ3JwQ291bnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICBncnBDb3VudC5jbGFzc05hbWUgPSBcInRyZWUtY291bnRcIjtcbiAgICAgICAgZ3JwQ291bnQudGV4dENvbnRlbnQgPSBgKCR7Z3JvdXBEYXRhLnRhYnMubGVuZ3RofSlgO1xuXG4gICAgICAgIC8vIEdyb3VwIEFjdGlvbnNcbiAgICAgICAgY29uc3QgYWN0aW9ucyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIGFjdGlvbnMuY2xhc3NOYW1lID0gXCJyb3ctYWN0aW9uc1wiO1xuICAgICAgICBjb25zdCB1bmdyb3VwQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgICAgICAgdW5ncm91cEJ0bi5jbGFzc05hbWUgPSBcImFjdGlvbi1idG5cIjtcbiAgICAgICAgdW5ncm91cEJ0bi5pbm5lckhUTUwgPSBJQ09OUy51bmdyb3VwO1xuICAgICAgICB1bmdyb3VwQnRuLnRpdGxlID0gXCJVbmdyb3VwXCI7XG4gICAgICAgIHVuZ3JvdXBCdG4ub25jbGljayA9IGFzeW5jIChlKSA9PiB7XG4gICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgaWYgKGNvbmZpcm0oYFVuZ3JvdXAgJHtncm91cERhdGEudGFicy5sZW5ndGh9IHRhYnM/YCkpIHtcbiAgICAgICAgICAgICAgICBhd2FpdCBjaHJvbWUudGFicy51bmdyb3VwKGdyb3VwRGF0YS50YWJzLm1hcCh0ID0+IHQuaWQpKTtcbiAgICAgICAgICAgICAgICBhd2FpdCBsb2FkU3RhdGUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgYWN0aW9ucy5hcHBlbmRDaGlsZCh1bmdyb3VwQnRuKTtcblxuICAgICAgICBncnBDb250ZW50LmFwcGVuZChncnBDaGVja2JveCwgaWNvbiwgZ3JwTGFiZWwsIGdycENvdW50LCBhY3Rpb25zKTtcblxuICAgICAgICAvLyBUYWJzXG4gICAgICAgIGNvbnN0IHRhYnNDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICBncm91cERhdGEudGFicy5mb3JFYWNoKHRhYiA9PiB7XG4gICAgICAgICAgICB0YWJzQ29udGFpbmVyLmFwcGVuZENoaWxkKGNyZWF0ZVRhYk5vZGUodGFiKSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHsgbm9kZTogZ3JvdXBOb2RlLCB0b2dnbGU6IGdycFRvZ2dsZSwgY2hpbGRyZW5Db250YWluZXI6IGdycENoaWxkcmVuIH0gPSBjcmVhdGVOb2RlKFxuICAgICAgICAgICAgZ3JwQ29udGVudCxcbiAgICAgICAgICAgIHRhYnNDb250YWluZXIsXG4gICAgICAgICAgICAnZ3JvdXAnLFxuICAgICAgICAgICAgaXNHcm91cEV4cGFuZGVkLFxuICAgICAgICAgICAgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChleHBhbmRlZE5vZGVzLmhhcyhncm91cEtleSkpIGV4cGFuZGVkTm9kZXMuZGVsZXRlKGdyb3VwS2V5KTtcbiAgICAgICAgICAgICAgICBlbHNlIGV4cGFuZGVkTm9kZXMuYWRkKGdyb3VwS2V5KTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IGV4cGFuZGVkID0gZXhwYW5kZWROb2Rlcy5oYXMoZ3JvdXBLZXkpO1xuICAgICAgICAgICAgICAgIGdycFRvZ2dsZS5jbGFzc0xpc3QudG9nZ2xlKCdyb3RhdGVkJywgZXhwYW5kZWQpO1xuICAgICAgICAgICAgICAgIGdycENoaWxkcmVuIS5jbGFzc0xpc3QudG9nZ2xlKCdleHBhbmRlZCcsIGV4cGFuZGVkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgKTtcblxuICAgICAgICAvLyBBcHBseSBiYWNrZ3JvdW5kIGNvbG9yIHRvIGdyb3VwIG5vZGVcbiAgICAgICAgaWYgKGdyb3VwRGF0YS5jb2xvcikge1xuICAgICAgICAgICAgY29uc3QgY29sb3JOYW1lID0gZ3JvdXBEYXRhLmNvbG9yO1xuICAgICAgICAgICAgY29uc3QgaGV4ID0gR1JPVVBfQ09MT1JTW2NvbG9yTmFtZV0gfHwgY29sb3JOYW1lOyAvLyBGYWxsYmFjayBpZiBpdCdzIGFscmVhZHkgaGV4XG4gICAgICAgICAgICBpZiAoaGV4LnN0YXJ0c1dpdGgoJyMnKSkge1xuICAgICAgICAgICAgICAgIGdyb3VwTm9kZS5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBoZXhUb1JnYmEoaGV4LCAwLjEpO1xuICAgICAgICAgICAgICAgIGdyb3VwTm9kZS5zdHlsZS5ib3JkZXIgPSBgMXB4IHNvbGlkICR7aGV4VG9SZ2JhKGhleCwgMC4yKX1gO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY2hpbGRyZW5Db250YWluZXIuYXBwZW5kQ2hpbGQoZ3JvdXBOb2RlKTtcbiAgICB9KTtcblxuICAgIHVuZ3JvdXBlZFRhYnMuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgICBjaGlsZHJlbkNvbnRhaW5lci5hcHBlbmRDaGlsZChjcmVhdGVUYWJOb2RlKHRhYikpO1xuICAgIH0pO1xuXG4gICAgY29uc3QgeyBub2RlOiB3aW5Ob2RlLCB0b2dnbGU6IHdpblRvZ2dsZSwgY2hpbGRyZW5Db250YWluZXI6IHdpbkNoaWxkcmVuIH0gPSBjcmVhdGVOb2RlKFxuICAgICAgICB3aW5Db250ZW50LFxuICAgICAgICBjaGlsZHJlbkNvbnRhaW5lcixcbiAgICAgICAgJ3dpbmRvdycsXG4gICAgICAgIGlzRXhwYW5kZWQsXG4gICAgICAgICgpID0+IHtcbiAgICAgICAgICAgICBpZiAoZXhwYW5kZWROb2Rlcy5oYXMod2luZG93S2V5KSkgZXhwYW5kZWROb2Rlcy5kZWxldGUod2luZG93S2V5KTtcbiAgICAgICAgICAgICBlbHNlIGV4cGFuZGVkTm9kZXMuYWRkKHdpbmRvd0tleSk7XG5cbiAgICAgICAgICAgICBjb25zdCBleHBhbmRlZCA9IGV4cGFuZGVkTm9kZXMuaGFzKHdpbmRvd0tleSk7XG4gICAgICAgICAgICAgd2luVG9nZ2xlLmNsYXNzTGlzdC50b2dnbGUoJ3JvdGF0ZWQnLCBleHBhbmRlZCk7XG4gICAgICAgICAgICAgd2luQ2hpbGRyZW4hLmNsYXNzTGlzdC50b2dnbGUoJ2V4cGFuZGVkJywgZXhwYW5kZWQpO1xuICAgICAgICB9XG4gICAgKTtcblxuICAgIHdpbmRvd3NDb250YWluZXIuYXBwZW5kQ2hpbGQod2luTm9kZSk7XG4gIH0pO1xuXG4gIHVwZGF0ZVN0YXRzKCk7XG59O1xuXG4vLyBTdHJhdGVneSBSZW5kZXJpbmdcbmZ1bmN0aW9uIHVwZGF0ZVN0cmF0ZWd5Vmlld3Moc3RyYXRlZ2llczogU3RyYXRlZ3lEZWZpbml0aW9uW10sIGVuYWJsZWRJZHM6IHN0cmluZ1tdKSB7XG4gICAgLy8gMS4gUmVuZGVyIEFjdGl2ZSBTdHJhdGVnaWVzXG4gICAgYWN0aXZlU3RyYXRlZ2llc0xpc3QuaW5uZXJIVE1MID0gJyc7XG5cbiAgICAvLyBNYWludGFpbiBvcmRlciBmcm9tIGVuYWJsZWRJZHNcbiAgICBjb25zdCBlbmFibGVkU3RyYXRlZ2llcyA9IGVuYWJsZWRJZHNcbiAgICAgICAgLm1hcChpZCA9PiBzdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBpZCkpXG4gICAgICAgIC5maWx0ZXIoKHMpOiBzIGlzIFN0cmF0ZWd5RGVmaW5pdGlvbiA9PiAhIXMpO1xuXG4gICAgZW5hYmxlZFN0cmF0ZWdpZXMuZm9yRWFjaChzdHJhdGVneSA9PiB7XG4gICAgICAgIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICByb3cuY2xhc3NOYW1lID0gJ3N0cmF0ZWd5LXJvdyc7XG4gICAgICAgIHJvdy5kYXRhc2V0LmlkID0gc3RyYXRlZ3kuaWQ7XG4gICAgICAgIHJvdy5kcmFnZ2FibGUgPSB0cnVlO1xuXG4gICAgICAgIC8vIERyYWcgSGFuZGxlXG4gICAgICAgIGNvbnN0IGhhbmRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICBoYW5kbGUuY2xhc3NOYW1lID0gJ3N0cmF0ZWd5LWRyYWctaGFuZGxlJztcbiAgICAgICAgaGFuZGxlLmlubmVySFRNTCA9ICdcdTIyRUVcdTIyRUUnO1xuXG4gICAgICAgIC8vIExhYmVsXG4gICAgICAgIGNvbnN0IGxhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuICAgICAgICBsYWJlbC5jbGFzc05hbWUgPSAnc3RyYXRlZ3ktbGFiZWwnO1xuICAgICAgICBsYWJlbC50ZXh0Q29udGVudCA9IHN0cmF0ZWd5LmxhYmVsO1xuXG4gICAgICAgIC8vIFRhZ3NcbiAgICAgICAgbGV0IHRhZ3NIdG1sID0gJyc7XG4gICAgICAgIGlmIChzdHJhdGVneS50YWdzKSB7XG4gICAgICAgICAgICAgc3RyYXRlZ3kudGFncy5mb3JFYWNoKHRhZyA9PiB7XG4gICAgICAgICAgICAgICAgdGFnc0h0bWwgKz0gYDxzcGFuIGNsYXNzPVwidGFnIHRhZy0ke3RhZ31cIj4ke3RhZ308L3NwYW4+YDtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgY29udGVudFdyYXBwZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgY29udGVudFdyYXBwZXIuc3R5bGUuZmxleCA9IFwiMVwiO1xuICAgICAgICBjb250ZW50V3JhcHBlci5zdHlsZS5kaXNwbGF5ID0gXCJmbGV4XCI7XG4gICAgICAgIGNvbnRlbnRXcmFwcGVyLnN0eWxlLmFsaWduSXRlbXMgPSBcImNlbnRlclwiO1xuICAgICAgICBjb250ZW50V3JhcHBlci5hcHBlbmRDaGlsZChsYWJlbCk7XG4gICAgICAgIGlmICh0YWdzSHRtbCkge1xuICAgICAgICAgICAgIGNvbnN0IHRhZ3NDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG4gICAgICAgICAgICAgdGFnc0NvbnRhaW5lci5pbm5lckhUTUwgPSB0YWdzSHRtbDtcbiAgICAgICAgICAgICBjb250ZW50V3JhcHBlci5hcHBlbmRDaGlsZCh0YWdzQ29udGFpbmVyKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJlbW92ZSBCdXR0b25cbiAgICAgICAgY29uc3QgcmVtb3ZlQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gICAgICAgIHJlbW92ZUJ0bi5jbGFzc05hbWUgPSAnc3RyYXRlZ3ktcmVtb3ZlLWJ0bic7XG4gICAgICAgIHJlbW92ZUJ0bi5pbm5lckhUTUwgPSBJQ09OUy5jbG9zZTsgLy8gVXNlIEljb24gZm9yIGNvbnNpc3RlbmN5XG4gICAgICAgIHJlbW92ZUJ0bi50aXRsZSA9IFwiUmVtb3ZlIHN0cmF0ZWd5XCI7XG4gICAgICAgIHJlbW92ZUJ0bi5vbmNsaWNrID0gYXN5bmMgKGUpID0+IHtcbiAgICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgIGF3YWl0IHRvZ2dsZVN0cmF0ZWd5KHN0cmF0ZWd5LmlkLCBmYWxzZSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgcm93LmFwcGVuZENoaWxkKGhhbmRsZSk7XG4gICAgICAgIHJvdy5hcHBlbmRDaGlsZChjb250ZW50V3JhcHBlcik7XG5cbiAgICAgICAgaWYgKHN0cmF0ZWd5LmlzQ3VzdG9tKSB7XG4gICAgICAgICAgICAgY29uc3QgYXV0b1J1bkJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gICAgICAgICAgICAgYXV0b1J1bkJ0bi5jbGFzc05hbWUgPSBgYWN0aW9uLWJ0biBhdXRvLXJ1biAke3N0cmF0ZWd5LmF1dG9SdW4gPyAnYWN0aXZlJyA6ICcnfWA7XG4gICAgICAgICAgICAgYXV0b1J1bkJ0bi5pbm5lckhUTUwgPSBJQ09OUy5hdXRvUnVuO1xuICAgICAgICAgICAgIGF1dG9SdW5CdG4udGl0bGUgPSBgQXV0byBSdW46ICR7c3RyYXRlZ3kuYXV0b1J1biA/ICdPTicgOiAnT0ZGJ31gO1xuICAgICAgICAgICAgIGF1dG9SdW5CdG4uc3R5bGUub3BhY2l0eSA9IHN0cmF0ZWd5LmF1dG9SdW4gPyBcIjFcIiA6IFwiMC4zXCI7XG4gICAgICAgICAgICAgYXV0b1J1bkJ0bi5vbmNsaWNrID0gYXN5bmMgKGUpID0+IHtcbiAgICAgICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICAgaWYgKCFwcmVmZXJlbmNlcz8uY3VzdG9tU3RyYXRlZ2llcykgcmV0dXJuO1xuICAgICAgICAgICAgICAgICBjb25zdCBjdXN0b21TdHJhdEluZGV4ID0gcHJlZmVyZW5jZXMuY3VzdG9tU3RyYXRlZ2llcy5maW5kSW5kZXgocyA9PiBzLmlkID09PSBzdHJhdGVneS5pZCk7XG4gICAgICAgICAgICAgICAgIGlmIChjdXN0b21TdHJhdEluZGV4ICE9PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBzdHJhdCA9IHByZWZlcmVuY2VzLmN1c3RvbVN0cmF0ZWdpZXNbY3VzdG9tU3RyYXRJbmRleF07XG4gICAgICAgICAgICAgICAgICAgIHN0cmF0LmF1dG9SdW4gPSAhc3RyYXQuYXV0b1J1bjtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNBY3RpdmUgPSAhIXN0cmF0LmF1dG9SdW47XG4gICAgICAgICAgICAgICAgICAgIGF1dG9SdW5CdG4uY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aXZlJywgaXNBY3RpdmUpO1xuICAgICAgICAgICAgICAgICAgICBhdXRvUnVuQnRuLnN0eWxlLm9wYWNpdHkgPSBpc0FjdGl2ZSA/IFwiMVwiIDogXCIwLjNcIjtcbiAgICAgICAgICAgICAgICAgICAgYXV0b1J1bkJ0bi50aXRsZSA9IGBBdXRvIFJ1bjogJHtpc0FjdGl2ZSA/ICdPTicgOiAnT0ZGJ31gO1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBzZW5kTWVzc2FnZShcInNhdmVQcmVmZXJlbmNlc1wiLCB7IGN1c3RvbVN0cmF0ZWdpZXM6IHByZWZlcmVuY2VzLmN1c3RvbVN0cmF0ZWdpZXMgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgcm93LmFwcGVuZENoaWxkKGF1dG9SdW5CdG4pO1xuICAgICAgICB9XG5cbiAgICAgICAgcm93LmFwcGVuZENoaWxkKHJlbW92ZUJ0bik7XG5cbiAgICAgICAgYWRkRG5ETGlzdGVuZXJzKHJvdyk7XG4gICAgICAgIGFjdGl2ZVN0cmF0ZWdpZXNMaXN0LmFwcGVuZENoaWxkKHJvdyk7XG4gICAgfSk7XG5cbiAgICAvLyAyLiBSZW5kZXIgQWRkIFN0cmF0ZWd5IE9wdGlvbnNcbiAgICBhZGRTdHJhdGVneVNlbGVjdC5pbm5lckhUTUwgPSAnPG9wdGlvbiB2YWx1ZT1cIlwiIGRpc2FibGVkIHNlbGVjdGVkPlRvcGljPC9vcHRpb24+JztcblxuICAgIGNvbnN0IGRpc2FibGVkU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gIWVuYWJsZWRJZHMuaW5jbHVkZXMocy5pZCkpO1xuICAgIGRpc2FibGVkU3RyYXRlZ2llcy5zb3J0KChhLCBiKSA9PiBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCkpO1xuXG4gICAgLy8gU2VwYXJhdGUgc3RyYXRlZ2llcyB3aXRoIEF1dG8tUnVuIGFjdGl2ZSBidXQgbm90IGluIHNvcnRpbmcgbGlzdFxuICAgIGNvbnN0IGJhY2tncm91bmRTdHJhdGVnaWVzOiBTdHJhdGVneURlZmluaXRpb25bXSA9IFtdO1xuICAgIGNvbnN0IGF2YWlsYWJsZVN0cmF0ZWdpZXM6IFN0cmF0ZWd5RGVmaW5pdGlvbltdID0gW107XG5cbiAgICBkaXNhYmxlZFN0cmF0ZWdpZXMuZm9yRWFjaChzID0+IHtcbiAgICAgICAgaWYgKHMuaXNDdXN0b20gJiYgcy5hdXRvUnVuKSB7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kU3RyYXRlZ2llcy5wdXNoKHMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYXZhaWxhYmxlU3RyYXRlZ2llcy5wdXNoKHMpO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBQb3B1bGF0ZSBTZWxlY3RcbiAgICAvLyBXZSBpbmNsdWRlIGJhY2tncm91bmQgc3RyYXRlZ2llcyBpbiB0aGUgZHJvcGRvd24gdG9vIHNvIHRoZXkgY2FuIGJlIG1vdmVkIHRvIFwiQWN0aXZlXCIgc29ydGluZyBlYXNpbHlcbiAgICAvLyBidXQgd2UgbWlnaHQgbWFyayB0aGVtXG4gICAgWy4uLmJhY2tncm91bmRTdHJhdGVnaWVzLCAuLi5hdmFpbGFibGVTdHJhdGVnaWVzXS5zb3J0KChhLCBiKSA9PiBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCkpLmZvckVhY2goc3RyYXRlZ3kgPT4ge1xuICAgICAgICBjb25zdCBvcHRpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdvcHRpb24nKTtcbiAgICAgICAgb3B0aW9uLnZhbHVlID0gc3RyYXRlZ3kuaWQ7XG4gICAgICAgIG9wdGlvbi50ZXh0Q29udGVudCA9IHN0cmF0ZWd5LmxhYmVsO1xuICAgICAgICBhZGRTdHJhdGVneVNlbGVjdC5hcHBlbmRDaGlsZChvcHRpb24pO1xuICAgIH0pO1xuXG4gICAgLy8gMy4gUmVuZGVyIEJhY2tncm91bmQgU3RyYXRlZ2llcyBTZWN0aW9uIChpZiBhbnkpXG4gICAgbGV0IGJnU2VjdGlvbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYmFja2dyb3VuZFN0cmF0ZWdpZXNTZWN0aW9uXCIpO1xuICAgIGlmIChiYWNrZ3JvdW5kU3RyYXRlZ2llcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGlmICghYmdTZWN0aW9uKSB7XG4gICAgICAgICAgICBiZ1NlY3Rpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgYmdTZWN0aW9uLmlkID0gXCJiYWNrZ3JvdW5kU3RyYXRlZ2llc1NlY3Rpb25cIjtcbiAgICAgICAgICAgIGJnU2VjdGlvbi5jbGFzc05hbWUgPSBcImFjdGl2ZS1zdHJhdGVnaWVzLXNlY3Rpb25cIjtcbiAgICAgICAgICAgIC8vIFN0eWxlIGl0IHRvIGxvb2sgbGlrZSBhY3RpdmUgc2VjdGlvbiBidXQgZGlzdGluY3RcbiAgICAgICAgICAgIGJnU2VjdGlvbi5zdHlsZS5tYXJnaW5Ub3AgPSBcIjhweFwiO1xuICAgICAgICAgICAgYmdTZWN0aW9uLnN0eWxlLmJvcmRlclRvcCA9IFwiMXB4IGRhc2hlZCB2YXIoLS1ib3JkZXItY29sb3IpXCI7XG4gICAgICAgICAgICBiZ1NlY3Rpb24uc3R5bGUucGFkZGluZ1RvcCA9IFwiOHB4XCI7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnN0IGhlYWRlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgICAgICBoZWFkZXIuY2xhc3NOYW1lID0gXCJzZWN0aW9uLWhlYWRlclwiO1xuICAgICAgICAgICAgaGVhZGVyLnRleHRDb250ZW50ID0gXCJCYWNrZ3JvdW5kIEF1dG8tUnVuXCI7XG4gICAgICAgICAgICBoZWFkZXIudGl0bGUgPSBcIlRoZXNlIHN0cmF0ZWdpZXMgcnVuIGF1dG9tYXRpY2FsbHkgYnV0IGFyZSBub3QgdXNlZCBmb3Igc29ydGluZy9ncm91cGluZyBvcmRlci5cIjtcbiAgICAgICAgICAgIGJnU2VjdGlvbi5hcHBlbmRDaGlsZChoZWFkZXIpO1xuXG4gICAgICAgICAgICBjb25zdCBsaXN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgICAgIGxpc3QuY2xhc3NOYW1lID0gXCJzdHJhdGVneS1saXN0XCI7XG4gICAgICAgICAgICBiZ1NlY3Rpb24uYXBwZW5kQ2hpbGQobGlzdCk7XG5cbiAgICAgICAgICAgIC8vIEluc2VydCBhZnRlciBhY3RpdmUgbGlzdFxuICAgICAgICAgICAgYWN0aXZlU3RyYXRlZ2llc0xpc3QucGFyZW50RWxlbWVudD8uYWZ0ZXIoYmdTZWN0aW9uKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGxpc3QgPSBiZ1NlY3Rpb24ucXVlcnlTZWxlY3RvcihcIi5zdHJhdGVneS1saXN0XCIpIGFzIEhUTUxFbGVtZW50O1xuICAgICAgICBsaXN0LmlubmVySFRNTCA9IFwiXCI7XG5cbiAgICAgICAgYmFja2dyb3VuZFN0cmF0ZWdpZXMuZm9yRWFjaChzdHJhdGVneSA9PiB7XG4gICAgICAgICAgICBjb25zdCByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgIHJvdy5jbGFzc05hbWUgPSAnc3RyYXRlZ3ktcm93JztcbiAgICAgICAgICAgIHJvdy5kYXRhc2V0LmlkID0gc3RyYXRlZ3kuaWQ7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnN0IGxhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuICAgICAgICAgICAgbGFiZWwuY2xhc3NOYW1lID0gJ3N0cmF0ZWd5LWxhYmVsJztcbiAgICAgICAgICAgIGxhYmVsLnRleHRDb250ZW50ID0gc3RyYXRlZ3kubGFiZWw7XG4gICAgICAgICAgICBsYWJlbC5zdHlsZS5vcGFjaXR5ID0gXCIwLjdcIjtcblxuICAgICAgICAgICAgY29uc3QgYXV0b1J1bkJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gICAgICAgICAgICBhdXRvUnVuQnRuLmNsYXNzTmFtZSA9IGBhY3Rpb24tYnRuIGF1dG8tcnVuIGFjdGl2ZWA7XG4gICAgICAgICAgICBhdXRvUnVuQnRuLmlubmVySFRNTCA9IElDT05TLmF1dG9SdW47XG4gICAgICAgICAgICBhdXRvUnVuQnRuLnRpdGxlID0gYEF1dG8gUnVuOiBPTiAoQ2xpY2sgdG8gZGlzYWJsZSlgO1xuICAgICAgICAgICAgYXV0b1J1bkJ0bi5zdHlsZS5tYXJnaW5MZWZ0ID0gXCJhdXRvXCI7XG4gICAgICAgICAgICBhdXRvUnVuQnRuLm9uY2xpY2sgPSBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgICBpZiAoIXByZWZlcmVuY2VzPy5jdXN0b21TdHJhdGVnaWVzKSByZXR1cm47XG4gICAgICAgICAgICAgICAgIGNvbnN0IGN1c3RvbVN0cmF0SW5kZXggPSBwcmVmZXJlbmNlcy5jdXN0b21TdHJhdGVnaWVzLmZpbmRJbmRleChzID0+IHMuaWQgPT09IHN0cmF0ZWd5LmlkKTtcbiAgICAgICAgICAgICAgICAgaWYgKGN1c3RvbVN0cmF0SW5kZXggIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN0cmF0ID0gcHJlZmVyZW5jZXMuY3VzdG9tU3RyYXRlZ2llc1tjdXN0b21TdHJhdEluZGV4XTtcbiAgICAgICAgICAgICAgICAgICAgc3RyYXQuYXV0b1J1biA9IGZhbHNlOyBcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgc2VuZE1lc3NhZ2UoXCJzYXZlUHJlZmVyZW5jZXNcIiwgeyBjdXN0b21TdHJhdGVnaWVzOiBwcmVmZXJlbmNlcy5jdXN0b21TdHJhdGVnaWVzIH0pO1xuICAgICAgICAgICAgICAgICAgICAvLyBVSSB1cGRhdGUgdHJpZ2dlcnMgdmlhIHNlbmRNZXNzYWdlIHJlc3BvbnNlIG9yIHJlLXJlbmRlclxuICAgICAgICAgICAgICAgICAgICAvLyBCdXQgd2Ugc2hvdWxkIHJlLXJlbmRlciBpbW1lZGlhdGVseSBmb3IgcmVzcG9uc2l2ZW5lc3NcbiAgICAgICAgICAgICAgICAgICAgdXBkYXRlU3RyYXRlZ3lWaWV3cyhzdHJhdGVnaWVzLCBlbmFibGVkSWRzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICByb3cuYXBwZW5kQ2hpbGQobGFiZWwpO1xuICAgICAgICAgICAgcm93LmFwcGVuZENoaWxkKGF1dG9SdW5CdG4pO1xuICAgICAgICAgICAgbGlzdC5hcHBlbmRDaGlsZChyb3cpO1xuICAgICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoYmdTZWN0aW9uKSBiZ1NlY3Rpb24ucmVtb3ZlKCk7XG4gICAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiB0b2dnbGVTdHJhdGVneShpZDogc3RyaW5nLCBlbmFibGU6IGJvb2xlYW4pIHtcbiAgICBpZiAoIXByZWZlcmVuY2VzKSByZXR1cm47XG4gICAgXG4gICAgY29uc3QgYWxsU3RyYXRlZ2llcyA9IGdldFN0cmF0ZWdpZXMocHJlZmVyZW5jZXMuY3VzdG9tU3RyYXRlZ2llcyk7XG4gICAgY29uc3QgdmFsaWRJZHMgPSBuZXcgU2V0KGFsbFN0cmF0ZWdpZXMubWFwKHMgPT4gcy5pZCkpO1xuXG4gICAgLy8gQ2xlYW4gY3VycmVudCBsaXN0IGJ5IHJlbW92aW5nIHN0YWxlIElEc1xuICAgIGxldCBjdXJyZW50ID0gKHByZWZlcmVuY2VzLnNvcnRpbmcgfHwgW10pLmZpbHRlcihzSWQgPT4gdmFsaWRJZHMuaGFzKHNJZCkpO1xuXG4gICAgaWYgKGVuYWJsZSkge1xuICAgICAgICBpZiAoIWN1cnJlbnQuaW5jbHVkZXMoaWQpKSB7XG4gICAgICAgICAgICBjdXJyZW50LnB1c2goaWQpO1xuICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgY3VycmVudCA9IGN1cnJlbnQuZmlsdGVyKHNJZCA9PiBzSWQgIT09IGlkKTtcbiAgICB9XG5cbiAgICBwcmVmZXJlbmNlcy5zb3J0aW5nID0gY3VycmVudDtcbiAgICBhd2FpdCBzZW5kTWVzc2FnZShcInNhdmVQcmVmZXJlbmNlc1wiLCB7IHNvcnRpbmc6IGN1cnJlbnQgfSk7XG5cbiAgICAvLyBSZS1yZW5kZXJcbiAgICB1cGRhdGVTdHJhdGVneVZpZXdzKGFsbFN0cmF0ZWdpZXMsIGN1cnJlbnQpO1xufVxuXG5mdW5jdGlvbiBhZGREbkRMaXN0ZW5lcnMocm93OiBIVE1MRWxlbWVudCkge1xuICByb3cuYWRkRXZlbnRMaXN0ZW5lcignZHJhZ3N0YXJ0JywgKGUpID0+IHtcbiAgICByb3cuY2xhc3NMaXN0LmFkZCgnZHJhZ2dpbmcnKTtcbiAgICBpZiAoZS5kYXRhVHJhbnNmZXIpIHtcbiAgICAgICAgZS5kYXRhVHJhbnNmZXIuZWZmZWN0QWxsb3dlZCA9ICdtb3ZlJztcbiAgICB9XG4gIH0pO1xuXG4gIHJvdy5hZGRFdmVudExpc3RlbmVyKCdkcmFnZW5kJywgYXN5bmMgKCkgPT4ge1xuICAgIHJvdy5jbGFzc0xpc3QucmVtb3ZlKCdkcmFnZ2luZycpO1xuICAgIC8vIFNhdmUgb3JkZXJcbiAgICBpZiAocHJlZmVyZW5jZXMpIHtcbiAgICAgICAgY29uc3QgY3VycmVudFNvcnRpbmcgPSBnZXRTZWxlY3RlZFNvcnRpbmcoKTtcbiAgICAgICAgLy8gQ2hlY2sgaWYgb3JkZXIgY2hhbmdlZFxuICAgICAgICBjb25zdCBvbGRTb3J0aW5nID0gcHJlZmVyZW5jZXMuc29ydGluZyB8fCBbXTtcbiAgICAgICAgaWYgKEpTT04uc3RyaW5naWZ5KGN1cnJlbnRTb3J0aW5nKSAhPT0gSlNPTi5zdHJpbmdpZnkob2xkU29ydGluZykpIHtcbiAgICAgICAgICAgIHByZWZlcmVuY2VzLnNvcnRpbmcgPSBjdXJyZW50U29ydGluZztcbiAgICAgICAgICAgIGF3YWl0IHNlbmRNZXNzYWdlKFwic2F2ZVByZWZlcmVuY2VzXCIsIHsgc29ydGluZzogY3VycmVudFNvcnRpbmcgfSk7XG4gICAgICAgIH1cbiAgICB9XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBzZXR1cENvbnRhaW5lckRuRChjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG4gICAgY29udGFpbmVyLmFkZEV2ZW50TGlzdGVuZXIoJ2RyYWdvdmVyJywgKGUpID0+IHtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBjb25zdCBhZnRlckVsZW1lbnQgPSBnZXREcmFnQWZ0ZXJFbGVtZW50KGNvbnRhaW5lciwgZS5jbGllbnRZKTtcbiAgICAgICAgY29uc3QgZHJhZ2dhYmxlUm93ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnN0cmF0ZWd5LXJvdy5kcmFnZ2luZycpO1xuICAgICAgICBpZiAoZHJhZ2dhYmxlUm93ICYmIGRyYWdnYWJsZVJvdy5wYXJlbnRFbGVtZW50ID09PSBjb250YWluZXIpIHtcbiAgICAgICAgICAgICBpZiAoYWZ0ZXJFbGVtZW50ID09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoZHJhZ2dhYmxlUm93KTtcbiAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnRhaW5lci5pbnNlcnRCZWZvcmUoZHJhZ2dhYmxlUm93LCBhZnRlckVsZW1lbnQpO1xuICAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xufVxuXG5zZXR1cENvbnRhaW5lckRuRChhY3RpdmVTdHJhdGVnaWVzTGlzdCk7XG5cbmZ1bmN0aW9uIGdldERyYWdBZnRlckVsZW1lbnQoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgeTogbnVtYmVyKSB7XG4gIGNvbnN0IGRyYWdnYWJsZUVsZW1lbnRzID0gQXJyYXkuZnJvbShjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLnN0cmF0ZWd5LXJvdzpub3QoLmRyYWdnaW5nKScpKTtcblxuICByZXR1cm4gZHJhZ2dhYmxlRWxlbWVudHMucmVkdWNlKChjbG9zZXN0LCBjaGlsZCkgPT4ge1xuICAgIGNvbnN0IGJveCA9IGNoaWxkLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIGNvbnN0IG9mZnNldCA9IHkgLSBib3gudG9wIC0gYm94LmhlaWdodCAvIDI7XG4gICAgaWYgKG9mZnNldCA8IDAgJiYgb2Zmc2V0ID4gY2xvc2VzdC5vZmZzZXQpIHtcbiAgICAgIHJldHVybiB7IG9mZnNldDogb2Zmc2V0LCBlbGVtZW50OiBjaGlsZCB9O1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gY2xvc2VzdDtcbiAgICB9XG4gIH0sIHsgb2Zmc2V0OiBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFksIGVsZW1lbnQ6IG51bGwgYXMgRWxlbWVudCB8IG51bGwgfSkuZWxlbWVudDtcbn1cblxuY29uc3QgdXBkYXRlVUkgPSAoXG4gIHN0YXRlRGF0YTogeyBncm91cHM6IFRhYkdyb3VwW107IHByZWZlcmVuY2VzOiBQcmVmZXJlbmNlcyB9LFxuICBjdXJyZW50V2luZG93OiBjaHJvbWUud2luZG93cy5XaW5kb3cgfCB1bmRlZmluZWQsXG4gIGNocm9tZVdpbmRvd3M6IGNocm9tZS53aW5kb3dzLldpbmRvd1tdLFxuICBpc1ByZWxpbWluYXJ5ID0gZmFsc2VcbikgPT4ge1xuICAgIHByZWZlcmVuY2VzID0gc3RhdGVEYXRhLnByZWZlcmVuY2VzO1xuXG4gICAgaWYgKHByZWZlcmVuY2VzKSB7XG4gICAgICBjb25zdCBzID0gcHJlZmVyZW5jZXMuc29ydGluZyB8fCBbXTtcblxuICAgICAgLy8gSW5pdGlhbGl6ZSBMb2dnZXJcbiAgICAgIHNldExvZ2dlclByZWZlcmVuY2VzKHByZWZlcmVuY2VzKTtcblxuICAgICAgY29uc3QgYWxsU3RyYXRlZ2llcyA9IGdldFN0cmF0ZWdpZXMocHJlZmVyZW5jZXMuY3VzdG9tU3RyYXRlZ2llcyk7XG5cbiAgICAgIC8vIFJlbmRlciB1bmlmaWVkIHN0cmF0ZWd5IGxpc3RcbiAgICAgIHVwZGF0ZVN0cmF0ZWd5Vmlld3MoYWxsU3RyYXRlZ2llcywgcyk7XG5cbiAgICAgIC8vIEluaXRpYWwgdGhlbWUgbG9hZFxuICAgICAgaWYgKHByZWZlcmVuY2VzLnRoZW1lKSB7XG4gICAgICAgIGFwcGx5VGhlbWUocHJlZmVyZW5jZXMudGhlbWUsIGZhbHNlKTtcbiAgICAgIH1cblxuICAgICAgLy8gSW5pdCBzZXR0aW5ncyBVSVxuICAgICAgaWYgKHByZWZlcmVuY2VzLmxvZ0xldmVsKSB7XG4gICAgICAgICAgY29uc3Qgc2VsZWN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvZ0xldmVsU2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgICAgaWYgKHNlbGVjdCkgc2VsZWN0LnZhbHVlID0gcHJlZmVyZW5jZXMubG9nTGV2ZWw7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGN1cnJlbnRXaW5kb3cpIHtcbiAgICAgIGZvY3VzZWRXaW5kb3dJZCA9IGN1cnJlbnRXaW5kb3cuaWQgPz8gbnVsbDtcbiAgICB9IGVsc2Uge1xuICAgICAgZm9jdXNlZFdpbmRvd0lkID0gbnVsbDtcbiAgICAgIGNvbnNvbGUud2FybihcIkZhaWxlZCB0byBnZXQgY3VycmVudCB3aW5kb3dcIik7XG4gICAgfVxuXG4gICAgY29uc3Qgd2luZG93VGl0bGVzID0gbmV3IE1hcDxudW1iZXIsIHN0cmluZz4oKTtcblxuICAgIGNocm9tZVdpbmRvd3MuZm9yRWFjaCgod2luKSA9PiB7XG4gICAgICBpZiAoIXdpbi5pZCkgcmV0dXJuO1xuICAgICAgY29uc3QgYWN0aXZlVGFiVGl0bGUgPSB3aW4udGFicz8uZmluZCgodGFiKSA9PiB0YWIuYWN0aXZlKT8udGl0bGU7XG4gICAgICBjb25zdCB0aXRsZSA9IGFjdGl2ZVRhYlRpdGxlID8/IGBXaW5kb3cgJHt3aW4uaWR9YDtcbiAgICAgIHdpbmRvd1RpdGxlcy5zZXQod2luLmlkLCB0aXRsZSk7XG4gICAgfSk7XG5cbiAgICB3aW5kb3dTdGF0ZSA9IG1hcFdpbmRvd3Moc3RhdGVEYXRhLmdyb3Vwcywgd2luZG93VGl0bGVzKTtcblxuICAgIGlmIChmb2N1c2VkV2luZG93SWQgIT09IG51bGwpIHtcbiAgICAgICAgd2luZG93U3RhdGUuc29ydCgoYSwgYikgPT4ge1xuICAgICAgICAgICAgaWYgKGEuaWQgPT09IGZvY3VzZWRXaW5kb3dJZCkgcmV0dXJuIC0xO1xuICAgICAgICAgICAgaWYgKGIuaWQgPT09IGZvY3VzZWRXaW5kb3dJZCkgcmV0dXJuIDE7XG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKCFpbml0aWFsU2VsZWN0aW9uRG9uZSAmJiBmb2N1c2VkV2luZG93SWQgIT09IG51bGwpIHtcbiAgICAgICAgY29uc3QgYWN0aXZlV2luZG93ID0gd2luZG93U3RhdGUuZmluZCh3ID0+IHcuaWQgPT09IGZvY3VzZWRXaW5kb3dJZCk7XG4gICAgICAgIGlmIChhY3RpdmVXaW5kb3cpIHtcbiAgICAgICAgICAgICBleHBhbmRlZE5vZGVzLmFkZChgdy0ke2FjdGl2ZVdpbmRvdy5pZH1gKTtcbiAgICAgICAgICAgICBhY3RpdmVXaW5kb3cudGFicy5mb3JFYWNoKHQgPT4gc2VsZWN0ZWRUYWJzLmFkZCh0LmlkKSk7XG5cbiAgICAgICAgICAgICBpZiAoIWlzUHJlbGltaW5hcnkpIHtcbiAgICAgICAgICAgICAgICAgaW5pdGlhbFNlbGVjdGlvbkRvbmUgPSB0cnVlO1xuICAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJlbmRlclRyZWUoKTtcbn07XG5cbmNvbnN0IGxvYWRTdGF0ZSA9IGFzeW5jICgpID0+IHtcbiAgbG9nSW5mbyhcIkxvYWRpbmcgcG9wdXAgc3RhdGVcIik7XG5cbiAgbGV0IGJnRmluaXNoZWQgPSBmYWxzZTtcblxuICBjb25zdCBmYXN0TG9hZCA9IGFzeW5jICgpID0+IHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBbbG9jYWxSZXMsIGN3LCBhd10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICAgICAgICBmZXRjaExvY2FsU3RhdGUoKSxcbiAgICAgICAgICAgIGNocm9tZS53aW5kb3dzLmdldEN1cnJlbnQoKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpLFxuICAgICAgICAgICAgY2hyb21lLndpbmRvd3MuZ2V0QWxsKHsgd2luZG93VHlwZXM6IFtcIm5vcm1hbFwiXSwgcG9wdWxhdGU6IHRydWUgfSkuY2F0Y2goKCkgPT4gW10pXG4gICAgICAgIF0pO1xuXG4gICAgICAgIC8vIE9ubHkgdXBkYXRlIGlmIGJhY2tncm91bmQgaGFzbid0IGZpbmlzaGVkIHlldFxuICAgICAgICBpZiAoIWJnRmluaXNoZWQgJiYgbG9jYWxSZXMub2sgJiYgbG9jYWxSZXMuZGF0YSkge1xuICAgICAgICAgICAgIHVwZGF0ZVVJKGxvY2FsUmVzLmRhdGEsIGN3LCBhdyBhcyBjaHJvbWUud2luZG93cy5XaW5kb3dbXSwgdHJ1ZSk7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihcIkZhc3QgbG9hZCBmYWlsZWRcIiwgZSk7XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IGJnTG9hZCA9IGFzeW5jICgpID0+IHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBbYmdSZXMsIGN3LCBhd10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICAgICAgICBmZXRjaFN0YXRlKCksXG4gICAgICAgICAgICBjaHJvbWUud2luZG93cy5nZXRDdXJyZW50KCkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKSxcbiAgICAgICAgICAgIGNocm9tZS53aW5kb3dzLmdldEFsbCh7IHdpbmRvd1R5cGVzOiBbXCJub3JtYWxcIl0sIHBvcHVsYXRlOiB0cnVlIH0pLmNhdGNoKCgpID0+IFtdKVxuICAgICAgICBdKTtcblxuICAgICAgICBiZ0ZpbmlzaGVkID0gdHJ1ZTsgLy8gTWFyayBhcyBmaW5pc2hlZCBzbyBmYXN0IGxvYWQgZG9lc24ndCBvdmVyd3JpdGUgaWYgaXQncyBzb21laG93IHNsb3dcblxuICAgICAgICBpZiAoYmdSZXMub2sgJiYgYmdSZXMuZGF0YSkge1xuICAgICAgICAgICAgIHVwZGF0ZVVJKGJnUmVzLmRhdGEsIGN3LCBhdyBhcyBjaHJvbWUud2luZG93cy5XaW5kb3dbXSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGxvYWQgc3RhdGU6XCIsIGJnUmVzLmVycm9yID8/IFwiVW5rbm93biBlcnJvclwiKTtcbiAgICAgICAgICAgIGlmICh3aW5kb3dTdGF0ZS5sZW5ndGggPT09IDApIHsgLy8gT25seSBzaG93IGVycm9yIGlmIHdlIGhhdmUgTk9USElORyBzaG93blxuICAgICAgICAgICAgICAgIHdpbmRvd3NDb250YWluZXIuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9XCJlcnJvci1zdGF0ZVwiIHN0eWxlPVwicGFkZGluZzogMjBweDsgY29sb3I6IHZhcigtLWVycm9yLWNvbG9yLCByZWQpOyB0ZXh0LWFsaWduOiBjZW50ZXI7XCI+XG4gICAgICAgICAgICAgICAgICAgIEZhaWxlZCB0byBsb2FkIHRhYnM6ICR7YmdSZXMuZXJyb3IgPz8gXCJVbmtub3duIGVycm9yXCJ9Ljxicj5cbiAgICAgICAgICAgICAgICAgICAgUGxlYXNlIHJlbG9hZCB0aGUgZXh0ZW5zaW9uIG9yIGNoZWNrIHBlcm1pc3Npb25zLlxuICAgICAgICAgICAgICAgIDwvZGl2PmA7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvciBsb2FkaW5nIHN0YXRlOlwiLCBlKTtcbiAgICB9XG4gIH07XG5cbiAgLy8gU3RhcnQgYm90aCBjb25jdXJyZW50bHlcbiAgYXdhaXQgUHJvbWlzZS5hbGwoW2Zhc3RMb2FkKCksIGJnTG9hZCgpXSk7XG59O1xuXG5jb25zdCBnZXRTZWxlY3RlZFNvcnRpbmcgPSAoKTogU29ydGluZ1N0cmF0ZWd5W10gPT4ge1xuICAgIC8vIFJlYWQgZnJvbSBET00gdG8gZ2V0IGN1cnJlbnQgb3JkZXIgb2YgYWN0aXZlIHN0cmF0ZWdpZXNcbiAgICByZXR1cm4gQXJyYXkuZnJvbShhY3RpdmVTdHJhdGVnaWVzTGlzdC5jaGlsZHJlbilcbiAgICAgICAgLm1hcChyb3cgPT4gKHJvdyBhcyBIVE1MRWxlbWVudCkuZGF0YXNldC5pZCBhcyBTb3J0aW5nU3RyYXRlZ3kpO1xufTtcblxuLy8gQWRkIGxpc3RlbmVyIGZvciBzZWxlY3RcbmFkZFN0cmF0ZWd5U2VsZWN0LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGFzeW5jIChlKSA9PiB7XG4gICAgY29uc3Qgc2VsZWN0ID0gZS50YXJnZXQgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgY29uc3QgaWQgPSBzZWxlY3QudmFsdWU7XG4gICAgaWYgKGlkKSB7XG4gICAgICAgIGF3YWl0IHRvZ2dsZVN0cmF0ZWd5KGlkLCB0cnVlKTtcbiAgICAgICAgc2VsZWN0LnZhbHVlID0gXCJcIjsgLy8gUmVzZXQgdG8gcGxhY2Vob2xkZXJcbiAgICB9XG59KTtcblxuY29uc3QgdHJpZ2dlckdyb3VwID0gYXN5bmMgKHNlbGVjdGlvbj86IEdyb3VwaW5nU2VsZWN0aW9uKSA9PiB7XG4gICAgbG9nSW5mbyhcIlRyaWdnZXJpbmcgZ3JvdXBpbmdcIiwgeyBzZWxlY3Rpb24gfSk7XG4gICAgc2hvd0xvYWRpbmcoXCJBcHBseWluZyBTdHJhdGVneS4uLlwiKTtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBzb3J0aW5nID0gZ2V0U2VsZWN0ZWRTb3J0aW5nKCk7XG4gICAgICAgIGF3YWl0IGFwcGx5R3JvdXBpbmcoeyBzZWxlY3Rpb24sIHNvcnRpbmcgfSk7XG4gICAgICAgIGF3YWl0IGxvYWRTdGF0ZSgpO1xuICAgIH0gZmluYWxseSB7XG4gICAgICAgIGhpZGVMb2FkaW5nKCk7XG4gICAgfVxufTtcblxuY2hyb21lLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKChtZXNzYWdlKSA9PiB7XG4gICAgaWYgKG1lc3NhZ2UudHlwZSA9PT0gJ2dyb3VwaW5nUHJvZ3Jlc3MnKSB7XG4gICAgICAgIGNvbnN0IHsgY29tcGxldGVkLCB0b3RhbCB9ID0gbWVzc2FnZS5wYXlsb2FkO1xuICAgICAgICB1cGRhdGVQcm9ncmVzcyhjb21wbGV0ZWQsIHRvdGFsKTtcbiAgICB9XG59KTtcblxuLy8gTGlzdGVuZXJzXG5zZWxlY3RBbGxDaGVja2JveC5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsIChlKSA9PiB7XG4gICAgY29uc3QgdGFyZ2V0U3RhdGUgPSAoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkuY2hlY2tlZDtcbiAgICBpZiAodGFyZ2V0U3RhdGUpIHtcbiAgICAgICAgLy8gU2VsZWN0IEFsbFxuICAgICAgICB3aW5kb3dTdGF0ZS5mb3JFYWNoKHdpbiA9PiB7XG4gICAgICAgICAgICB3aW4udGFicy5mb3JFYWNoKHRhYiA9PiBzZWxlY3RlZFRhYnMuYWRkKHRhYi5pZCkpO1xuICAgICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgICAvLyBEZXNlbGVjdCBBbGxcbiAgICAgICAgc2VsZWN0ZWRUYWJzLmNsZWFyKCk7XG4gICAgfVxuICAgIHJlbmRlclRyZWUoKTtcbn0pO1xuXG5idG5BcHBseT8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBsb2dJbmZvKFwiQXBwbHkgYnV0dG9uIGNsaWNrZWRcIiwgeyBzZWxlY3RlZENvdW50OiBzZWxlY3RlZFRhYnMuc2l6ZSB9KTtcbiAgICB0cmlnZ2VyR3JvdXAoeyB0YWJJZHM6IEFycmF5LmZyb20oc2VsZWN0ZWRUYWJzKSB9KTtcbn0pO1xuXG5idG5Vbmdyb3VwLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIGlmIChjb25maXJtKGBVbmdyb3VwICR7c2VsZWN0ZWRUYWJzLnNpemV9IHRhYnM/YCkpIHtcbiAgICAgIGxvZ0luZm8oXCJVbmdyb3VwaW5nIHRhYnNcIiwgeyBjb3VudDogc2VsZWN0ZWRUYWJzLnNpemUgfSk7XG4gICAgICBhd2FpdCBjaHJvbWUudGFicy51bmdyb3VwKEFycmF5LmZyb20oc2VsZWN0ZWRUYWJzKSk7XG4gICAgICBhd2FpdCBsb2FkU3RhdGUoKTtcbiAgfVxufSk7XG5idG5NZXJnZS5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICBpZiAoY29uZmlybShgTWVyZ2UgJHtzZWxlY3RlZFRhYnMuc2l6ZX0gdGFicyBpbnRvIG9uZSBncm91cD9gKSkge1xuICAgICAgbG9nSW5mbyhcIk1lcmdpbmcgdGFic1wiLCB7IGNvdW50OiBzZWxlY3RlZFRhYnMuc2l6ZSB9KTtcbiAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHNlbmRNZXNzYWdlKFwibWVyZ2VTZWxlY3Rpb25cIiwgeyB0YWJJZHM6IEFycmF5LmZyb20oc2VsZWN0ZWRUYWJzKSB9KTtcbiAgICAgIGlmICghcmVzLm9rKSBhbGVydChcIk1lcmdlIGZhaWxlZDogXCIgKyByZXMuZXJyb3IpO1xuICAgICAgZWxzZSBhd2FpdCBsb2FkU3RhdGUoKTtcbiAgfVxufSk7XG5idG5TcGxpdC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICBpZiAoY29uZmlybShgU3BsaXQgJHtzZWxlY3RlZFRhYnMuc2l6ZX0gdGFicyBpbnRvIGEgbmV3IHdpbmRvdz9gKSkge1xuICAgICAgbG9nSW5mbyhcIlNwbGl0dGluZyB0YWJzXCIsIHsgY291bnQ6IHNlbGVjdGVkVGFicy5zaXplIH0pO1xuICAgICAgY29uc3QgcmVzID0gYXdhaXQgc2VuZE1lc3NhZ2UoXCJzcGxpdFNlbGVjdGlvblwiLCB7IHRhYklkczogQXJyYXkuZnJvbShzZWxlY3RlZFRhYnMpIH0pO1xuICAgICAgaWYgKCFyZXMub2spIGFsZXJ0KFwiU3BsaXQgZmFpbGVkOiBcIiArIHJlcy5lcnJvcik7XG4gICAgICBlbHNlIGF3YWl0IGxvYWRTdGF0ZSgpO1xuICB9XG59KTtcblxuYnRuRXhwYW5kQWxsPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHdpbmRvd1N0YXRlLmZvckVhY2god2luID0+IHtcbiAgICAgICAgZXhwYW5kZWROb2Rlcy5hZGQoYHctJHt3aW4uaWR9YCk7XG4gICAgICAgIHdpbi50YWJzLmZvckVhY2godGFiID0+IHtcbiAgICAgICAgICAgIGlmICh0YWIuZ3JvdXBMYWJlbCkge1xuICAgICAgICAgICAgICAgICBleHBhbmRlZE5vZGVzLmFkZChgdy0ke3dpbi5pZH0tZy0ke3RhYi5ncm91cExhYmVsfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9KTtcbiAgICByZW5kZXJUcmVlKCk7XG59KTtcblxuYnRuQ29sbGFwc2VBbGw/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgZXhwYW5kZWROb2Rlcy5jbGVhcigpO1xuICAgIHJlbmRlclRyZWUoKTtcbn0pO1xuXG5cbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuVW5kb1wiKT8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgbG9nSW5mbyhcIlVuZG8gY2xpY2tlZFwiKTtcbiAgY29uc3QgcmVzID0gYXdhaXQgc2VuZE1lc3NhZ2UoXCJ1bmRvXCIpO1xuICBpZiAoIXJlcy5vaykgYWxlcnQoXCJVbmRvIGZhaWxlZDogXCIgKyByZXMuZXJyb3IpO1xufSk7XG5cbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuU2F2ZVN0YXRlXCIpPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICBjb25zdCBuYW1lID0gcHJvbXB0KFwiRW50ZXIgYSBuYW1lIGZvciB0aGlzIHN0YXRlOlwiKTtcbiAgaWYgKG5hbWUpIHtcbiAgICBsb2dJbmZvKFwiU2F2aW5nIHN0YXRlXCIsIHsgbmFtZSB9KTtcbiAgICBjb25zdCByZXMgPSBhd2FpdCBzZW5kTWVzc2FnZShcInNhdmVTdGF0ZVwiLCB7IG5hbWUgfSk7XG4gICAgaWYgKCFyZXMub2spIGFsZXJ0KFwiU2F2ZSBmYWlsZWQ6IFwiICsgcmVzLmVycm9yKTtcbiAgfVxufSk7XG5cbmNvbnN0IGxvYWRTdGF0ZURpYWxvZyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibG9hZFN0YXRlRGlhbG9nXCIpIGFzIEhUTUxEaWFsb2dFbGVtZW50O1xuY29uc3Qgc2F2ZWRTdGF0ZUxpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNhdmVkU3RhdGVMaXN0XCIpIGFzIEhUTUxFbGVtZW50O1xuXG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0bkxvYWRTdGF0ZVwiKT8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgbG9nSW5mbyhcIk9wZW5pbmcgTG9hZCBTdGF0ZSBkaWFsb2dcIik7XG4gIGNvbnN0IHJlcyA9IGF3YWl0IHNlbmRNZXNzYWdlPFNhdmVkU3RhdGVbXT4oXCJnZXRTYXZlZFN0YXRlc1wiKTtcbiAgaWYgKHJlcy5vayAmJiByZXMuZGF0YSkge1xuICAgIHNhdmVkU3RhdGVMaXN0LmlubmVySFRNTCA9IFwiXCI7XG4gICAgcmVzLmRhdGEuZm9yRWFjaCgoc3RhdGUpID0+IHtcbiAgICAgIGNvbnN0IGxpID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImxpXCIpO1xuICAgICAgbGkuc3R5bGUuZGlzcGxheSA9IFwiZmxleFwiO1xuICAgICAgbGkuc3R5bGUuanVzdGlmeUNvbnRlbnQgPSBcInNwYWNlLWJldHdlZW5cIjtcbiAgICAgIGxpLnN0eWxlLnBhZGRpbmcgPSBcIjhweFwiO1xuICAgICAgbGkuc3R5bGUuYm9yZGVyQm90dG9tID0gXCIxcHggc29saWQgdmFyKC0tYm9yZGVyLWNvbG9yKVwiO1xuXG4gICAgICBjb25zdCBzcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gICAgICBzcGFuLnRleHRDb250ZW50ID0gYCR7c3RhdGUubmFtZX0gKCR7bmV3IERhdGUoc3RhdGUudGltZXN0YW1wKS50b0xvY2FsZVN0cmluZygpfSlgO1xuICAgICAgc3Bhbi5zdHlsZS5jdXJzb3IgPSBcInBvaW50ZXJcIjtcbiAgICAgIHNwYW4ub25jbGljayA9IGFzeW5jICgpID0+IHtcbiAgICAgICAgaWYgKGNvbmZpcm0oYExvYWQgc3RhdGUgXCIke3N0YXRlLm5hbWV9XCI/YCkpIHtcbiAgICAgICAgICBsb2dJbmZvKFwiUmVzdG9yaW5nIHN0YXRlXCIsIHsgbmFtZTogc3RhdGUubmFtZSB9KTtcbiAgICAgICAgICBjb25zdCByID0gYXdhaXQgc2VuZE1lc3NhZ2UoXCJyZXN0b3JlU3RhdGVcIiwgeyBzdGF0ZSB9KTtcbiAgICAgICAgICBpZiAoci5vaykge1xuICAgICAgICAgICAgICBsb2FkU3RhdGVEaWFsb2cuY2xvc2UoKTtcbiAgICAgICAgICAgICAgd2luZG93LmNsb3NlKCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgYWxlcnQoXCJSZXN0b3JlIGZhaWxlZDogXCIgKyByLmVycm9yKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IGRlbEJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gICAgICBkZWxCdG4udGV4dENvbnRlbnQgPSBcIkRlbGV0ZVwiO1xuICAgICAgZGVsQnRuLnN0eWxlLm1hcmdpbkxlZnQgPSBcIjhweFwiO1xuICAgICAgZGVsQnRuLnN0eWxlLmJhY2tncm91bmQgPSBcInRyYW5zcGFyZW50XCI7XG4gICAgICBkZWxCdG4uc3R5bGUuY29sb3IgPSBcInZhcigtLXRleHQtY29sb3IpXCI7XG4gICAgICBkZWxCdG4uc3R5bGUuYm9yZGVyID0gXCIxcHggc29saWQgdmFyKC0tYm9yZGVyLWNvbG9yKVwiO1xuICAgICAgZGVsQnRuLnN0eWxlLmJvcmRlclJhZGl1cyA9IFwiNHB4XCI7XG4gICAgICBkZWxCdG4uc3R5bGUucGFkZGluZyA9IFwiMnB4IDZweFwiO1xuICAgICAgZGVsQnRuLm9uY2xpY2sgPSBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgaWYgKGNvbmZpcm0oYERlbGV0ZSBzdGF0ZSBcIiR7c3RhdGUubmFtZX1cIj9gKSkge1xuICAgICAgICAgICAgICBhd2FpdCBzZW5kTWVzc2FnZShcImRlbGV0ZVNhdmVkU3RhdGVcIiwgeyBuYW1lOiBzdGF0ZS5uYW1lIH0pO1xuICAgICAgICAgICAgICBsaS5yZW1vdmUoKTtcbiAgICAgICAgICB9XG4gICAgICB9O1xuXG4gICAgICBsaS5hcHBlbmRDaGlsZChzcGFuKTtcbiAgICAgIGxpLmFwcGVuZENoaWxkKGRlbEJ0bik7XG4gICAgICBzYXZlZFN0YXRlTGlzdC5hcHBlbmRDaGlsZChsaSk7XG4gICAgfSk7XG4gICAgbG9hZFN0YXRlRGlhbG9nLnNob3dNb2RhbCgpO1xuICB9IGVsc2Uge1xuICAgICAgYWxlcnQoXCJGYWlsZWQgdG8gbG9hZCBzdGF0ZXM6IFwiICsgcmVzLmVycm9yKTtcbiAgfVxufSk7XG5cbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuQ2xvc2VMb2FkU3RhdGVcIik/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgbG9hZFN0YXRlRGlhbG9nLmNsb3NlKCk7XG59KTtcblxuc2VhcmNoSW5wdXQuYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsIHJlbmRlclRyZWUpO1xuXG4vLyBBdXRvLXJlZnJlc2hcbmNocm9tZS50YWJzLm9uVXBkYXRlZC5hZGRMaXN0ZW5lcigoKSA9PiBsb2FkU3RhdGUoKSk7XG5jaHJvbWUudGFicy5vblJlbW92ZWQuYWRkTGlzdGVuZXIoKCkgPT4gbG9hZFN0YXRlKCkpO1xuY2hyb21lLndpbmRvd3Mub25SZW1vdmVkLmFkZExpc3RlbmVyKCgpID0+IGxvYWRTdGF0ZSgpKTtcblxuLy8gLS0tIFRoZW1lIExvZ2ljIC0tLVxuY29uc3QgYnRuVGhlbWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0blRoZW1lXCIpO1xuY29uc3QgaWNvblN1biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaWNvblN1blwiKTtcbmNvbnN0IGljb25Nb29uID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJpY29uTW9vblwiKTtcblxuY29uc3QgYXBwbHlUaGVtZSA9ICh0aGVtZTogJ2xpZ2h0JyB8ICdkYXJrJywgc2F2ZSA9IGZhbHNlKSA9PiB7XG4gICAgaWYgKHRoZW1lID09PSAnbGlnaHQnKSB7XG4gICAgICAgIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LmFkZCgnbGlnaHQtbW9kZScpO1xuICAgICAgICBpZiAoaWNvblN1bikgaWNvblN1bi5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcbiAgICAgICAgaWYgKGljb25Nb29uKSBpY29uTW9vbi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LnJlbW92ZSgnbGlnaHQtbW9kZScpO1xuICAgICAgICBpZiAoaWNvblN1bikgaWNvblN1bi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICBpZiAoaWNvbk1vb24pIGljb25Nb29uLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuICAgIH1cblxuICAgIC8vIFN5bmMgd2l0aCBQcmVmZXJlbmNlc1xuICAgIGlmIChzYXZlKSB7XG4gICAgICAgIC8vIFdlIHVzZSBzYXZlUHJlZmVyZW5jZXMgd2hpY2ggY2FsbHMgdGhlIGJhY2tncm91bmQgdG8gc3RvcmUgaXRcbiAgICAgICAgbG9nSW5mbyhcIkFwcGx5aW5nIHRoZW1lXCIsIHsgdGhlbWUgfSk7XG4gICAgICAgIHNlbmRNZXNzYWdlKFwic2F2ZVByZWZlcmVuY2VzXCIsIHsgdGhlbWUgfSk7XG4gICAgfVxufTtcblxuLy8gSW5pdGlhbCBsb2FkIGZhbGxiYWNrIChiZWZvcmUgbG9hZFN0YXRlIGxvYWRzIHByZWZzKVxuY29uc3Qgc3RvcmVkVGhlbWUgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgndGhlbWUnKSBhcyAnbGlnaHQnIHwgJ2RhcmsnO1xuLy8gSWYgd2UgaGF2ZSBhIGxvY2FsIG92ZXJyaWRlLCB1c2UgaXQgdGVtcG9yYXJpbHksIGJ1dCBsb2FkU3RhdGUgd2lsbCBhdXRob3JpdGF0aXZlIGNoZWNrIHByZWZzXG5pZiAoc3RvcmVkVGhlbWUpIGFwcGx5VGhlbWUoc3RvcmVkVGhlbWUsIGZhbHNlKTtcblxuYnRuVGhlbWU/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgIGNvbnN0IGlzTGlnaHQgPSBkb2N1bWVudC5ib2R5LmNsYXNzTGlzdC5jb250YWlucygnbGlnaHQtbW9kZScpO1xuICAgIGNvbnN0IG5ld1RoZW1lID0gaXNMaWdodCA/ICdkYXJrJyA6ICdsaWdodCc7XG4gICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ3RoZW1lJywgbmV3VGhlbWUpOyAvLyBLZWVwIGxvY2FsIGNvcHkgZm9yIGZhc3QgYm9vdFxuICAgIGFwcGx5VGhlbWUobmV3VGhlbWUsIHRydWUpO1xufSk7XG5cbi8vIC0tLSBTZXR0aW5ncyBMb2dpYyAtLS1cbmNvbnN0IHNldHRpbmdzRGlhbG9nID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzZXR0aW5nc0RpYWxvZ1wiKSBhcyBIVE1MRGlhbG9nRWxlbWVudDtcbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuU2V0dGluZ3NcIik/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0dGluZ3NEaWFsb2cuc2hvd01vZGFsKCk7XG59KTtcbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuQ2xvc2VTZXR0aW5nc1wiKT8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXR0aW5nc0RpYWxvZy5jbG9zZSgpO1xufSk7XG5cbmNvbnN0IGxvZ0xldmVsU2VsZWN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsb2dMZXZlbFNlbGVjdFwiKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbmxvZ0xldmVsU2VsZWN0Py5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsIGFzeW5jICgpID0+IHtcbiAgICBjb25zdCBuZXdMZXZlbCA9IGxvZ0xldmVsU2VsZWN0LnZhbHVlIGFzIExvZ0xldmVsO1xuICAgIGlmIChwcmVmZXJlbmNlcykge1xuICAgICAgICBwcmVmZXJlbmNlcy5sb2dMZXZlbCA9IG5ld0xldmVsO1xuICAgICAgICAvLyBVcGRhdGUgbG9jYWwgbG9nZ2VyIGltbWVkaWF0ZWx5XG4gICAgICAgIHNldExvZ2dlclByZWZlcmVuY2VzKHByZWZlcmVuY2VzKTtcbiAgICAgICAgLy8gUGVyc2lzdFxuICAgICAgICBhd2FpdCBzZW5kTWVzc2FnZShcInNhdmVQcmVmZXJlbmNlc1wiLCB7IGxvZ0xldmVsOiBuZXdMZXZlbCB9KTtcbiAgICAgICAgbG9nRGVidWcoXCJMb2cgbGV2ZWwgdXBkYXRlZFwiLCB7IGxldmVsOiBuZXdMZXZlbCB9KTtcbiAgICB9XG59KTtcblxuLy8gLS0tIFBpbiAmIFJlc2l6ZSBMb2dpYyAtLS1cbmNvbnN0IGJ0blBpbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuUGluXCIpO1xuYnRuUGluPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICBjb25zdCB1cmwgPSBjaHJvbWUucnVudGltZS5nZXRVUkwoXCJ1aS9wb3B1cC5odG1sXCIpO1xuICBhd2FpdCBjaHJvbWUud2luZG93cy5jcmVhdGUoe1xuICAgIHVybCxcbiAgICB0eXBlOiBcInBvcHVwXCIsXG4gICAgd2lkdGg6IGRvY3VtZW50LmJvZHkub2Zmc2V0V2lkdGgsXG4gICAgaGVpZ2h0OiBkb2N1bWVudC5ib2R5Lm9mZnNldEhlaWdodFxuICB9KTtcbiAgd2luZG93LmNsb3NlKCk7XG59KTtcblxuY29uc3QgcmVzaXplSGFuZGxlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyZXNpemVIYW5kbGVcIik7XG5pZiAocmVzaXplSGFuZGxlKSB7XG4gIGNvbnN0IHNhdmVTaXplID0gKHc6IG51bWJlciwgaDogbnVtYmVyKSA9PiB7XG4gICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShcInBvcHVwU2l6ZVwiLCBKU09OLnN0cmluZ2lmeSh7IHdpZHRoOiB3LCBoZWlnaHQ6IGggfSkpO1xuICB9O1xuXG4gIHJlc2l6ZUhhbmRsZS5hZGRFdmVudExpc3RlbmVyKFwibW91c2Vkb3duXCIsIChlKSA9PiB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBjb25zdCBzdGFydFggPSBlLmNsaWVudFg7XG4gICAgICBjb25zdCBzdGFydFkgPSBlLmNsaWVudFk7XG4gICAgICBjb25zdCBzdGFydFdpZHRoID0gZG9jdW1lbnQuYm9keS5vZmZzZXRXaWR0aDtcbiAgICAgIGNvbnN0IHN0YXJ0SGVpZ2h0ID0gZG9jdW1lbnQuYm9keS5vZmZzZXRIZWlnaHQ7XG5cbiAgICAgIGNvbnN0IG9uTW91c2VNb3ZlID0gKGV2OiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICAgICAgY29uc3QgbmV3V2lkdGggPSBNYXRoLm1heCg1MDAsIHN0YXJ0V2lkdGggKyAoZXYuY2xpZW50WCAtIHN0YXJ0WCkpO1xuICAgICAgICAgIGNvbnN0IG5ld0hlaWdodCA9IE1hdGgubWF4KDUwMCwgc3RhcnRIZWlnaHQgKyAoZXYuY2xpZW50WSAtIHN0YXJ0WSkpO1xuICAgICAgICAgIGRvY3VtZW50LmJvZHkuc3R5bGUud2lkdGggPSBgJHtuZXdXaWR0aH1weGA7XG4gICAgICAgICAgZG9jdW1lbnQuYm9keS5zdHlsZS5oZWlnaHQgPSBgJHtuZXdIZWlnaHR9cHhgO1xuICAgICAgfTtcblxuICAgICAgY29uc3Qgb25Nb3VzZVVwID0gKGV2OiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICAgICAgIGNvbnN0IG5ld1dpZHRoID0gTWF0aC5tYXgoNTAwLCBzdGFydFdpZHRoICsgKGV2LmNsaWVudFggLSBzdGFydFgpKTtcbiAgICAgICAgICAgY29uc3QgbmV3SGVpZ2h0ID0gTWF0aC5tYXgoNTAwLCBzdGFydEhlaWdodCArIChldi5jbGllbnRZIC0gc3RhcnRZKSk7XG4gICAgICAgICAgIHNhdmVTaXplKG5ld1dpZHRoLCBuZXdIZWlnaHQpO1xuICAgICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwibW91c2Vtb3ZlXCIsIG9uTW91c2VNb3ZlKTtcbiAgICAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1vdXNldXBcIiwgb25Nb3VzZVVwKTtcbiAgICAgIH07XG5cbiAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZW1vdmVcIiwgb25Nb3VzZU1vdmUpO1xuICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNldXBcIiwgb25Nb3VzZVVwKTtcbiAgfSk7XG59XG5cbmNvbnN0IGFkanVzdEZvcldpbmRvd1R5cGUgPSBhc3luYyAoKSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3Qgd2luID0gYXdhaXQgY2hyb21lLndpbmRvd3MuZ2V0Q3VycmVudCgpO1xuICAgIGlmICh3aW4udHlwZSA9PT0gXCJwb3B1cFwiKSB7XG4gICAgICAgaWYgKGJ0blBpbikgYnRuUGluLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICAgICAvLyBFbmFibGUgcmVzaXplIGhhbmRsZSBpbiBwaW5uZWQgbW9kZSBpZiBpdCB3YXMgaGlkZGVuXG4gICAgICAgaWYgKHJlc2l6ZUhhbmRsZSkgcmVzaXplSGFuZGxlLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gICAgICAgZG9jdW1lbnQuYm9keS5zdHlsZS53aWR0aCA9IFwiMTAwJVwiO1xuICAgICAgIGRvY3VtZW50LmJvZHkuc3R5bGUuaGVpZ2h0ID0gXCIxMDAlXCI7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgLy8gRGlzYWJsZSByZXNpemUgaGFuZGxlIGluIGRvY2tlZCBtb2RlXG4gICAgICAgIGlmIChyZXNpemVIYW5kbGUpIHJlc2l6ZUhhbmRsZS5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgICAgIC8vIENsZWFyIGFueSBwcmV2aW91cyBzaXplIG92ZXJyaWRlc1xuICAgICAgICBkb2N1bWVudC5ib2R5LnN0eWxlLndpZHRoID0gXCJcIjtcbiAgICAgICAgZG9jdW1lbnQuYm9keS5zdHlsZS5oZWlnaHQgPSBcIlwiO1xuICAgIH1cbiAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yIGNoZWNraW5nIHdpbmRvdyB0eXBlOlwiLCBlKTtcbiAgfVxufTtcblxuYWRqdXN0Rm9yV2luZG93VHlwZSgpO1xubG9hZFN0YXRlKCkuY2F0Y2goZSA9PiBjb25zb2xlLmVycm9yKFwiTG9hZCBzdGF0ZSBmYWlsZWRcIiwgZSkpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUVPLElBQU0sZUFBZSxDQUFDLFFBQTZDO0FBQ3hFLE1BQUksQ0FBQyxJQUFJLE1BQU0sQ0FBQyxJQUFJLFNBQVUsUUFBTztBQUNyQyxTQUFPO0FBQUEsSUFDTCxJQUFJLElBQUk7QUFBQSxJQUNSLFVBQVUsSUFBSTtBQUFBLElBQ2QsT0FBTyxJQUFJLFNBQVM7QUFBQSxJQUNwQixLQUFLLElBQUksT0FBTztBQUFBLElBQ2hCLFFBQVEsUUFBUSxJQUFJLE1BQU07QUFBQSxJQUMxQixjQUFjLElBQUk7QUFBQSxJQUNsQixhQUFhLElBQUksZUFBZTtBQUFBLElBQ2hDLFlBQVksSUFBSTtBQUFBLElBQ2hCLFNBQVMsSUFBSTtBQUFBLElBQ2IsT0FBTyxJQUFJO0FBQUEsSUFDWCxRQUFRLElBQUk7QUFBQSxJQUNaLFFBQVEsSUFBSTtBQUFBLElBQ1osVUFBVSxJQUFJO0FBQUEsRUFDaEI7QUFDRjtBQUVPLElBQU0sdUJBQXVCLFlBQXlDO0FBQzNFLFNBQU8sSUFBSSxRQUFRLENBQUMsWUFBWTtBQUM5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Y0FBYztBQUMzRCxJQUFJLGNBQWM7QUFDaEIsUUFBTSxXQUFXLENBQUMsR0FBVyxNQUFjO0FBQ3ZDLGlCQUFhLFFBQVEsYUFBYSxLQUFLLFVBQVUsRUFBRSxPQUFPLEdBQUcsUUFBUSxFQUFFLENBQUMsQ0FBQztBQUFBLEVBQzdFO0FBRUEsZUFBYSxpQkFBaUIsYUFBYSxDQUFDLE1BQU07QUFDOUMsTUFBRSxlQUFlO0FBQ2pCLFVBQU0sU0FBUyxFQUFFO0FBQ2pCLFVBQU0sU0FBUyxFQUFFO0FBQ2pCLFVBQU0sYUFBYSxTQUFTLEtBQUs7QUFDakMsVUFBTSxjQUFjLFNBQVMsS0FBSztBQUVsQyxVQUFNLGNBQWMsQ0FBQyxPQUFtQjtBQUNwQyxZQUFNLFdBQVcsS0FBSyxJQUFJLEtBQUssY0FBYyxHQUFHLFVBQVUsT0FBTztBQUNqRSxZQUFNLFlBQVksS0FBSyxJQUFJLEtBQUssZUFBZSxHQUFHLFVBQVUsT0FBTztBQUNuRSxlQUFTLEtBQUssTUFBTSxRQUFRLEdBQUcsUUFBUTtBQUN2QyxlQUFTLEtBQUssTUFBTSxTQUFTLEdBQUcsU0FBUztBQUFBLElBQzdDO0FBRUEsVUFBTSxZQUFZLENBQUMsT0FBbUI7QUFDakMsWUFBTSxXQUFXLEtBQUssSUFBSSxLQUFLLGNBQWMsR0FBRyxVQUFVLE9BQU87QUFDakUsWUFBTSxZQUFZLEtBQUssSUFBSSxLQUFLLGVBQWUsR0FBRyxVQUFVLE9BQU87QUFDbkUsZUFBUyxVQUFVLFNBQVM7QUFDNUIsZUFBUyxvQkFBb0IsYUFBYSxXQUFXO0FBQ3JELGVBQVMsb0JBQW9CLFdBQVcsU0FBUztBQUFBLElBQ3REO0FBRUEsYUFBUyxpQkFBaUIsYUFBYSxXQUFXO0FBQ2xELGFBQVMsaUJBQWlCLFdBQVcsU0FBUztBQUFBLEVBQ2xELENBQUM7QUFDSDtBQUVBLElBQU0sc0JBQXNCLFlBQVk7QUFDdEMsTUFBSTtBQUNGLFVBQU0sTUFBTSxNQUFNLE9BQU8sUUFBUSxXQUFXO0FBQzVDLFFBQUksSUFBSSxTQUFTLFNBQVM7QUFDdkIsVUFBSSxPQUFRLFFBQU8sTUFBTSxVQUFVO0FBRW5DLFVBQUksYUFBYyxjQUFhLE1BQU0sVUFBVTtBQUMvQyxlQUFTLEtBQUssTUFBTSxRQUFRO0FBQzVCLGVBQVMsS0FBSyxNQUFNLFNBQVM7QUFBQSxJQUNoQyxPQUFPO0FBRUgsVUFBSSxhQUFjLGNBQWEsTUFBTSxVQUFVO0FBRS9DLGVBQVMsS0FBSyxNQUFNLFFBQVE7QUFDNUIsZUFBUyxLQUFLLE1BQU0sU0FBUztBQUFBLElBQ2pDO0FBQUEsRUFDRixTQUFTLEdBQUc7QUFDUixZQUFRLE1BQU0sK0JBQStCLENBQUM7QUFBQSxFQUNsRDtBQUNGO0FBRUEsb0JBQW9CO0FBQ3BCLFVBQVUsRUFBRSxNQUFNLE9BQUssUUFBUSxNQUFNLHFCQUFxQixDQUFDLENBQUM7IiwKICAibmFtZXMiOiBbImN1c3RvbVN0cmF0ZWdpZXMiLCAibWF0Y2giLCAicHJlZmVyZW5jZXMiLCAidGFicyIsICJ3aW5kb3ciLCAibGlzdCJdCn0K
