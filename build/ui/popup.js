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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3NoYXJlZC91dGlscy50cyIsICIuLi8uLi9zcmMvc2hhcmVkL3N0cmF0ZWd5UmVnaXN0cnkudHMiLCAiLi4vLi4vc3JjL3NoYXJlZC9sb2dnZXIudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZ3JvdXBpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3NvcnRpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy91aS9sb2NhbFN0YXRlLnRzIiwgIi4uLy4uL3NyYy91aS9jb21tb24udHMiLCAiLi4vLi4vc3JjL3VpL3BvcHVwLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyBQcmVmZXJlbmNlcywgU29ydGluZ1N0cmF0ZWd5LCBUYWJNZXRhZGF0YSB9IGZyb20gXCIuL3R5cGVzLmpzXCI7XG5cbmV4cG9ydCBjb25zdCBtYXBDaHJvbWVUYWIgPSAodGFiOiBjaHJvbWUudGFicy5UYWIpOiBUYWJNZXRhZGF0YSB8IG51bGwgPT4ge1xuICBpZiAoIXRhYi5pZCB8fCAhdGFiLndpbmRvd0lkKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHtcbiAgICBpZDogdGFiLmlkLFxuICAgIHdpbmRvd0lkOiB0YWIud2luZG93SWQsXG4gICAgdGl0bGU6IHRhYi50aXRsZSB8fCBcIlVudGl0bGVkXCIsXG4gICAgdXJsOiB0YWIudXJsIHx8IFwiYWJvdXQ6YmxhbmtcIixcbiAgICBwaW5uZWQ6IEJvb2xlYW4odGFiLnBpbm5lZCksXG4gICAgbGFzdEFjY2Vzc2VkOiB0YWIubGFzdEFjY2Vzc2VkLFxuICAgIG9wZW5lclRhYklkOiB0YWIub3BlbmVyVGFiSWQgPz8gdW5kZWZpbmVkLFxuICAgIGZhdkljb25Vcmw6IHRhYi5mYXZJY29uVXJsLFxuICAgIGdyb3VwSWQ6IHRhYi5ncm91cElkLFxuICAgIGluZGV4OiB0YWIuaW5kZXgsXG4gICAgYWN0aXZlOiB0YWIuYWN0aXZlLFxuICAgIHN0YXR1czogdGFiLnN0YXR1cyxcbiAgICBzZWxlY3RlZDogdGFiLmhpZ2hsaWdodGVkXG4gIH07XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0U3RvcmVkUHJlZmVyZW5jZXMgPSBhc3luYyAoKTogUHJvbWlzZTxQcmVmZXJlbmNlcyB8IG51bGw+ID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFwicHJlZmVyZW5jZXNcIiwgKGl0ZW1zKSA9PiB7XG4gICAgICByZXNvbHZlKChpdGVtc1tcInByZWZlcmVuY2VzXCJdIGFzIFByZWZlcmVuY2VzKSA/PyBudWxsKTtcbiAgICB9KTtcbiAgfSk7XG59O1xuXG5leHBvcnQgY29uc3QgYXNBcnJheSA9IDxUPih2YWx1ZTogdW5rbm93bik6IFRbXSA9PiB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSByZXR1cm4gdmFsdWUgYXMgVFtdO1xuICAgIHJldHVybiBbXTtcbn07XG4iLCAiaW1wb3J0IHsgQ3VzdG9tU3RyYXRlZ3ksIFNvcnRpbmdTdHJhdGVneSB9IGZyb20gXCIuL3R5cGVzLmpzXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RyYXRlZ3lEZWZpbml0aW9uIHtcbiAgICBpZDogU29ydGluZ1N0cmF0ZWd5IHwgc3RyaW5nO1xuICAgIGxhYmVsOiBzdHJpbmc7XG4gICAgaXNHcm91cGluZzogYm9vbGVhbjtcbiAgICBpc1NvcnRpbmc6IGJvb2xlYW47XG4gICAgdGFncz86IHN0cmluZ1tdO1xuICAgIGF1dG9SdW4/OiBib29sZWFuO1xuICAgIGlzQ3VzdG9tPzogYm9vbGVhbjtcbn1cblxuLy8gUmVzdG9yZWQgc3RyYXRlZ2llcyBtYXRjaGluZyBiYWNrZ3JvdW5kIGNhcGFiaWxpdGllcy5cbmV4cG9ydCBjb25zdCBTVFJBVEVHSUVTOiBTdHJhdGVneURlZmluaXRpb25bXSA9IFtcbiAgICB7IGlkOiBcImRvbWFpblwiLCBsYWJlbDogXCJEb21haW5cIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImRvbWFpbl9mdWxsXCIsIGxhYmVsOiBcIkZ1bGwgRG9tYWluXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJ0b3BpY1wiLCBsYWJlbDogXCJUb3BpY1wiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwiY29udGV4dFwiLCBsYWJlbDogXCJDb250ZXh0XCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJsaW5lYWdlXCIsIGxhYmVsOiBcIkxpbmVhZ2VcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInBpbm5lZFwiLCBsYWJlbDogXCJQaW5uZWRcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInJlY2VuY3lcIiwgbGFiZWw6IFwiUmVjZW5jeVwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwiYWdlXCIsIGxhYmVsOiBcIkFnZVwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwidXJsXCIsIGxhYmVsOiBcIlVSTFwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwibmVzdGluZ1wiLCBsYWJlbDogXCJOZXN0aW5nXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJ0aXRsZVwiLCBsYWJlbDogXCJUaXRsZVwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuXTtcblxuZXhwb3J0IGNvbnN0IGdldFN0cmF0ZWdpZXMgPSAoY3VzdG9tU3RyYXRlZ2llcz86IEN1c3RvbVN0cmF0ZWd5W10pOiBTdHJhdGVneURlZmluaXRpb25bXSA9PiB7XG4gICAgaWYgKCFjdXN0b21TdHJhdGVnaWVzIHx8IGN1c3RvbVN0cmF0ZWdpZXMubGVuZ3RoID09PSAwKSByZXR1cm4gU1RSQVRFR0lFUztcblxuICAgIC8vIEN1c3RvbSBzdHJhdGVnaWVzIGNhbiBvdmVycmlkZSBidWlsdC1pbnMgaWYgSURzIG1hdGNoLCBvciBhZGQgbmV3IG9uZXMuXG4gICAgY29uc3QgY29tYmluZWQgPSBbLi4uU1RSQVRFR0lFU107XG5cbiAgICBjdXN0b21TdHJhdGVnaWVzLmZvckVhY2goY3VzdG9tID0+IHtcbiAgICAgICAgY29uc3QgZXhpc3RpbmdJbmRleCA9IGNvbWJpbmVkLmZpbmRJbmRleChzID0+IHMuaWQgPT09IGN1c3RvbS5pZCk7XG5cbiAgICAgICAgLy8gRGV0ZXJtaW5lIGNhcGFiaWxpdGllcyBiYXNlZCBvbiBydWxlcyBwcmVzZW5jZVxuICAgICAgICBjb25zdCBoYXNHcm91cGluZyA9IChjdXN0b20uZ3JvdXBpbmdSdWxlcyAmJiBjdXN0b20uZ3JvdXBpbmdSdWxlcy5sZW5ndGggPiAwKSB8fCAoY3VzdG9tLnJ1bGVzICYmIGN1c3RvbS5ydWxlcy5sZW5ndGggPiAwKSB8fCBmYWxzZTtcbiAgICAgICAgY29uc3QgaGFzU29ydGluZyA9IChjdXN0b20uc29ydGluZ1J1bGVzICYmIGN1c3RvbS5zb3J0aW5nUnVsZXMubGVuZ3RoID4gMCkgfHwgKGN1c3RvbS5ydWxlcyAmJiBjdXN0b20ucnVsZXMubGVuZ3RoID4gMCkgfHwgZmFsc2U7XG5cbiAgICAgICAgY29uc3QgdGFnczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgaWYgKGhhc0dyb3VwaW5nKSB0YWdzLnB1c2goXCJncm91cFwiKTtcbiAgICAgICAgaWYgKGhhc1NvcnRpbmcpIHRhZ3MucHVzaChcInNvcnRcIik7XG5cbiAgICAgICAgY29uc3QgZGVmaW5pdGlvbjogU3RyYXRlZ3lEZWZpbml0aW9uID0ge1xuICAgICAgICAgICAgaWQ6IGN1c3RvbS5pZCxcbiAgICAgICAgICAgIGxhYmVsOiBjdXN0b20ubGFiZWwsXG4gICAgICAgICAgICBpc0dyb3VwaW5nOiBoYXNHcm91cGluZyxcbiAgICAgICAgICAgIGlzU29ydGluZzogaGFzU29ydGluZyxcbiAgICAgICAgICAgIHRhZ3M6IHRhZ3MsXG4gICAgICAgICAgICBhdXRvUnVuOiBjdXN0b20uYXV0b1J1bixcbiAgICAgICAgICAgIGlzQ3VzdG9tOiB0cnVlXG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKGV4aXN0aW5nSW5kZXggIT09IC0xKSB7XG4gICAgICAgICAgICBjb21iaW5lZFtleGlzdGluZ0luZGV4XSA9IGRlZmluaXRpb247XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb21iaW5lZC5wdXNoKGRlZmluaXRpb24pO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gY29tYmluZWQ7XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0U3RyYXRlZ3kgPSAoaWQ6IFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZyk6IFN0cmF0ZWd5RGVmaW5pdGlvbiB8IHVuZGVmaW5lZCA9PiBTVFJBVEVHSUVTLmZpbmQocyA9PiBzLmlkID09PSBpZCk7XG4iLCAiaW1wb3J0IHsgTG9nRW50cnksIExvZ0xldmVsLCBQcmVmZXJlbmNlcyB9IGZyb20gXCIuL3R5cGVzLmpzXCI7XG5cbmNvbnN0IFBSRUZJWCA9IFwiW1RhYlNvcnRlcl1cIjtcblxuY29uc3QgTEVWRUxfUFJJT1JJVFk6IFJlY29yZDxMb2dMZXZlbCwgbnVtYmVyPiA9IHtcbiAgZGVidWc6IDAsXG4gIGluZm86IDEsXG4gIHdhcm46IDIsXG4gIGVycm9yOiAzLFxuICBjcml0aWNhbDogNFxufTtcblxubGV0IGN1cnJlbnRMZXZlbDogTG9nTGV2ZWwgPSBcImluZm9cIjtcbmxldCBsb2dzOiBMb2dFbnRyeVtdID0gW107XG5jb25zdCBNQVhfTE9HUyA9IDEwMDA7XG5jb25zdCBTVE9SQUdFX0tFWSA9IFwic2Vzc2lvbkxvZ3NcIjtcblxuLy8gU2FmZSBjb250ZXh0IGNoZWNrXG5jb25zdCBpc1NlcnZpY2VXb3JrZXIgPSB0eXBlb2Ygc2VsZiAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVvZiAoc2VsZiBhcyBhbnkpLlNlcnZpY2VXb3JrZXJHbG9iYWxTY29wZSAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYgaW5zdGFuY2VvZiAoc2VsZiBhcyBhbnkpLlNlcnZpY2VXb3JrZXJHbG9iYWxTY29wZTtcbmxldCBpc1NhdmluZyA9IGZhbHNlO1xubGV0IHBlbmRpbmdTYXZlID0gZmFsc2U7XG5sZXQgc2F2ZVRpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsO1xuXG5jb25zdCBkb1NhdmUgPSAoKSA9PiB7XG4gICAgaWYgKCFpc1NlcnZpY2VXb3JrZXIgfHwgIWNocm9tZT8uc3RvcmFnZT8uc2Vzc2lvbiB8fCBpc1NhdmluZykge1xuICAgICAgICBwZW5kaW5nU2F2ZSA9IHRydWU7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpc1NhdmluZyA9IHRydWU7XG4gICAgcGVuZGluZ1NhdmUgPSBmYWxzZTtcblxuICAgIGNocm9tZS5zdG9yYWdlLnNlc3Npb24uc2V0KHsgW1NUT1JBR0VfS0VZXTogbG9ncyB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgaXNTYXZpbmcgPSBmYWxzZTtcbiAgICAgICAgaWYgKHBlbmRpbmdTYXZlKSB7XG4gICAgICAgICAgICBzYXZlTG9nc1RvU3RvcmFnZSgpO1xuICAgICAgICB9XG4gICAgfSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBzYXZlIGxvZ3NcIiwgZXJyKTtcbiAgICAgICAgaXNTYXZpbmcgPSBmYWxzZTtcbiAgICB9KTtcbn07XG5cbmNvbnN0IHNhdmVMb2dzVG9TdG9yYWdlID0gKCkgPT4ge1xuICAgIGlmIChzYXZlVGltZXIpIGNsZWFyVGltZW91dChzYXZlVGltZXIpO1xuICAgIHNhdmVUaW1lciA9IHNldFRpbWVvdXQoZG9TYXZlLCAxMDAwKTtcbn07XG5cbmxldCByZXNvbHZlTG9nZ2VyUmVhZHk6ICgpID0+IHZvaWQ7XG5leHBvcnQgY29uc3QgbG9nZ2VyUmVhZHkgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcbiAgICByZXNvbHZlTG9nZ2VyUmVhZHkgPSByZXNvbHZlO1xufSk7XG5cbmV4cG9ydCBjb25zdCBpbml0TG9nZ2VyID0gYXN5bmMgKCkgPT4ge1xuICAgIGlmIChpc1NlcnZpY2VXb3JrZXIgJiYgY2hyb21lPy5zdG9yYWdlPy5zZXNzaW9uKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjaHJvbWUuc3RvcmFnZS5zZXNzaW9uLmdldChTVE9SQUdFX0tFWSk7XG4gICAgICAgICAgICBpZiAocmVzdWx0W1NUT1JBR0VfS0VZXSAmJiBBcnJheS5pc0FycmF5KHJlc3VsdFtTVE9SQUdFX0tFWV0pKSB7XG4gICAgICAgICAgICAgICAgbG9ncyA9IHJlc3VsdFtTVE9SQUdFX0tFWV07XG4gICAgICAgICAgICAgICAgaWYgKGxvZ3MubGVuZ3RoID4gTUFYX0xPR1MpIGxvZ3MgPSBsb2dzLnNsaWNlKDAsIE1BWF9MT0dTKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byByZXN0b3JlIGxvZ3NcIiwgZSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKHJlc29sdmVMb2dnZXJSZWFkeSkgcmVzb2x2ZUxvZ2dlclJlYWR5KCk7XG59O1xuXG5leHBvcnQgY29uc3Qgc2V0TG9nZ2VyUHJlZmVyZW5jZXMgPSAocHJlZnM6IFByZWZlcmVuY2VzKSA9PiB7XG4gIGlmIChwcmVmcy5sb2dMZXZlbCkge1xuICAgIGN1cnJlbnRMZXZlbCA9IHByZWZzLmxvZ0xldmVsO1xuICB9IGVsc2UgaWYgKHByZWZzLmRlYnVnKSB7XG4gICAgY3VycmVudExldmVsID0gXCJkZWJ1Z1wiO1xuICB9IGVsc2Uge1xuICAgIGN1cnJlbnRMZXZlbCA9IFwiaW5mb1wiO1xuICB9XG59O1xuXG5jb25zdCBzaG91bGRMb2cgPSAobGV2ZWw6IExvZ0xldmVsKTogYm9vbGVhbiA9PiB7XG4gIHJldHVybiBMRVZFTF9QUklPUklUWVtsZXZlbF0gPj0gTEVWRUxfUFJJT1JJVFlbY3VycmVudExldmVsXTtcbn07XG5cbmNvbnN0IGZvcm1hdE1lc3NhZ2UgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgcmV0dXJuIGNvbnRleHQgPyBgJHttZXNzYWdlfSA6OiAke0pTT04uc3RyaW5naWZ5KGNvbnRleHQpfWAgOiBtZXNzYWdlO1xufTtcblxuY29uc3QgYWRkTG9nID0gKGxldmVsOiBMb2dMZXZlbCwgbWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgLy8gQWx3YXlzIGFkZCB0byBidWZmZXIgcmVnYXJkbGVzcyBvZiBjdXJyZW50IGNvbnNvbGUgbGV2ZWwgc2V0dGluZyxcbiAgLy8gb3Igc2hvdWxkIHdlIHJlc3BlY3QgaXQ/IFVzdWFsbHkgZGVidWcgbG9ncyBhcmUgbm9pc3kuXG4gIC8vIExldCdzIHJlc3BlY3Qgc2hvdWxkTG9nIGZvciB0aGUgYnVmZmVyIHRvbyB0byBzYXZlIG1lbW9yeS9ub2lzZSxcbiAgLy8gT1Igd2UgY2FuIHN0b3JlIGV2ZXJ5dGhpbmcgYnV0IGZpbHRlciBvbiB2aWV3LlxuICAvLyBHaXZlbiB3ZSB3YW50IHRvIGRlYnVnIGlzc3Vlcywgc3RvcmluZyBldmVyeXRoaW5nIG1pZ2h0IGJlIGJldHRlcixcbiAgLy8gYnV0IGlmIHdlIHN0b3JlIGV2ZXJ5dGhpbmcgd2UgbWlnaHQgZmlsbCBidWZmZXIgd2l0aCBkZWJ1ZyBub2lzZSBxdWlja2x5LlxuICAvLyBMZXQncyBzdGljayB0byBzdG9yaW5nIHdoYXQgaXMgY29uZmlndXJlZCB0byBiZSBsb2dnZWQuXG4gIC8vIFdhaXQsIGlmIEkgd2FudCB0byBcImRlYnVnXCIgc29tZXRoaW5nLCBJIHVzdWFsbHkgdHVybiBvbiBkZWJ1ZyBsb2dzLlxuICAvLyBJZiBJIGNhbid0IHNlZSBwYXN0IGxvZ3MgYmVjYXVzZSB0aGV5IHdlcmVuJ3Qgc3RvcmVkLCBJIGhhdmUgdG8gcmVwcm8uXG4gIC8vIExldCdzIHN0b3JlIGlmIGl0IHBhc3NlcyBgc2hvdWxkTG9nYC5cblxuICBpZiAoc2hvdWxkTG9nKGxldmVsKSkge1xuICAgICAgY29uc3QgZW50cnk6IExvZ0VudHJ5ID0ge1xuICAgICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcbiAgICAgICAgICBsZXZlbCxcbiAgICAgICAgICBtZXNzYWdlLFxuICAgICAgICAgIGNvbnRleHRcbiAgICAgIH07XG5cbiAgICAgIGlmIChpc1NlcnZpY2VXb3JrZXIpIHtcbiAgICAgICAgICBsb2dzLnVuc2hpZnQoZW50cnkpO1xuICAgICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSB7XG4gICAgICAgICAgICAgIGxvZ3MucG9wKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIEluIG90aGVyIGNvbnRleHRzLCBzZW5kIHRvIFNXXG4gICAgICAgICAgaWYgKGNocm9tZT8ucnVudGltZT8uc2VuZE1lc3NhZ2UpIHtcbiAgICAgICAgICAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdsb2dFbnRyeScsIHBheWxvYWQ6IGVudHJ5IH0pLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgLy8gSWdub3JlIGlmIG1lc3NhZ2UgZmFpbHMgKGUuZy4gY29udGV4dCBpbnZhbGlkYXRlZClcbiAgICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICB9XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBhZGRMb2dFbnRyeSA9IChlbnRyeTogTG9nRW50cnkpID0+IHtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSB7XG4gICAgICAgIGxvZ3MudW5zaGlmdChlbnRyeSk7XG4gICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSB7XG4gICAgICAgICAgICBsb2dzLnBvcCgpO1xuICAgICAgICB9XG4gICAgICAgIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG4gICAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGdldExvZ3MgPSAoKSA9PiBbLi4ubG9nc107XG5leHBvcnQgY29uc3QgY2xlYXJMb2dzID0gKCkgPT4ge1xuICAgIGxvZ3MubGVuZ3RoID0gMDtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSBzYXZlTG9nc1RvU3RvcmFnZSgpO1xufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0RlYnVnID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImRlYnVnXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwiZGVidWdcIikpIHtcbiAgICBjb25zb2xlLmRlYnVnKGAke1BSRUZJWH0gW0RFQlVHXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgY29udGV4dCl9YCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBsb2dJbmZvID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImluZm9cIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJpbmZvXCIpKSB7XG4gICAgY29uc29sZS5pbmZvKGAke1BSRUZJWH0gW0lORk9dICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ1dhcm4gPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwid2FyblwiLCBtZXNzYWdlLCBjb250ZXh0KTtcbiAgaWYgKHNob3VsZExvZyhcIndhcm5cIikpIHtcbiAgICBjb25zb2xlLndhcm4oYCR7UFJFRklYfSBbV0FSTl0gJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nRXJyb3IgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwiZXJyb3JcIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJlcnJvclwiKSkge1xuICAgIGNvbnNvbGUuZXJyb3IoYCR7UFJFRklYfSBbRVJST1JdICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0NyaXRpY2FsID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImNyaXRpY2FsXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwiY3JpdGljYWxcIikpIHtcbiAgICAvLyBDcml0aWNhbCBsb2dzIHVzZSBlcnJvciBjb25zb2xlIGJ1dCB3aXRoIGRpc3RpbmN0IHByZWZpeCBhbmQgbWF5YmUgc3R5bGluZyBpZiBzdXBwb3J0ZWRcbiAgICBjb25zb2xlLmVycm9yKGAke1BSRUZJWH0gW0NSSVRJQ0FMXSBcdUQ4M0RcdURFQTggJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuIiwgImltcG9ydCB7IEdyb3VwaW5nU3RyYXRlZ3ksIFNvcnRpbmdTdHJhdGVneSwgVGFiR3JvdXAsIFRhYk1ldGFkYXRhLCBDdXN0b21TdHJhdGVneSwgU3RyYXRlZ3lSdWxlLCBSdWxlQ29uZGl0aW9uLCBHcm91cGluZ1J1bGUsIFNvcnRpbmdSdWxlIH0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgZ2V0U3RyYXRlZ2llcyB9IGZyb20gXCIuLi9zaGFyZWQvc3RyYXRlZ3lSZWdpc3RyeS5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcblxubGV0IGN1c3RvbVN0cmF0ZWdpZXM6IEN1c3RvbVN0cmF0ZWd5W10gPSBbXTtcblxuZXhwb3J0IGNvbnN0IHNldEN1c3RvbVN0cmF0ZWdpZXMgPSAoc3RyYXRlZ2llczogQ3VzdG9tU3RyYXRlZ3lbXSkgPT4ge1xuICAgIGN1c3RvbVN0cmF0ZWdpZXMgPSBzdHJhdGVnaWVzO1xufTtcblxuZXhwb3J0IGNvbnN0IGdldEN1c3RvbVN0cmF0ZWdpZXMgPSAoKTogQ3VzdG9tU3RyYXRlZ3lbXSA9PiBjdXN0b21TdHJhdGVnaWVzO1xuXG5jb25zdCBDT0xPUlMgPSBbXCJncmV5XCIsIFwiYmx1ZVwiLCBcInJlZFwiLCBcInllbGxvd1wiLCBcImdyZWVuXCIsIFwicGlua1wiLCBcInB1cnBsZVwiLCBcImN5YW5cIiwgXCJvcmFuZ2VcIl07XG5cbmNvbnN0IHJlZ2V4Q2FjaGUgPSBuZXcgTWFwPHN0cmluZywgUmVnRXhwPigpO1xuXG5leHBvcnQgY29uc3QgZG9tYWluRnJvbVVybCA9ICh1cmw6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcGFyc2VkID0gbmV3IFVSTCh1cmwpO1xuICAgIHJldHVybiBwYXJzZWQuaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sIFwiXCIpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGxvZ0RlYnVnKFwiRmFpbGVkIHRvIHBhcnNlIGRvbWFpblwiLCB7IHVybCwgZXJyb3I6IFN0cmluZyhlcnJvcikgfSk7XG4gICAgcmV0dXJuIFwidW5rbm93blwiO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3Qgc3ViZG9tYWluRnJvbVVybCA9ICh1cmw6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcGFyc2VkID0gbmV3IFVSTCh1cmwpO1xuICAgICAgICBsZXQgaG9zdG5hbWUgPSBwYXJzZWQuaG9zdG5hbWU7XG4gICAgICAgIC8vIFJlbW92ZSB3d3cuXG4gICAgICAgIGhvc3RuYW1lID0gaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sIFwiXCIpO1xuXG4gICAgICAgIGNvbnN0IHBhcnRzID0gaG9zdG5hbWUuc3BsaXQoJy4nKTtcbiAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDIpIHtcbiAgICAgICAgICAgICByZXR1cm4gcGFydHMuc2xpY2UoMCwgcGFydHMubGVuZ3RoIC0gMikuam9pbignLicpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBcIlwiO1xuICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gXCJcIjtcbiAgICB9XG59XG5cbmV4cG9ydCBjb25zdCBnZXRGaWVsZFZhbHVlID0gKHRhYjogVGFiTWV0YWRhdGEsIGZpZWxkOiBzdHJpbmcpOiBhbnkgPT4ge1xuICAgIHN3aXRjaChmaWVsZCkge1xuICAgICAgICBjYXNlICdpZCc6IHJldHVybiB0YWIuaWQ7XG4gICAgICAgIGNhc2UgJ2luZGV4JzogcmV0dXJuIHRhYi5pbmRleDtcbiAgICAgICAgY2FzZSAnd2luZG93SWQnOiByZXR1cm4gdGFiLndpbmRvd0lkO1xuICAgICAgICBjYXNlICdncm91cElkJzogcmV0dXJuIHRhYi5ncm91cElkO1xuICAgICAgICBjYXNlICd0aXRsZSc6IHJldHVybiB0YWIudGl0bGU7XG4gICAgICAgIGNhc2UgJ3VybCc6IHJldHVybiB0YWIudXJsO1xuICAgICAgICBjYXNlICdzdGF0dXMnOiByZXR1cm4gdGFiLnN0YXR1cztcbiAgICAgICAgY2FzZSAnYWN0aXZlJzogcmV0dXJuIHRhYi5hY3RpdmU7XG4gICAgICAgIGNhc2UgJ3NlbGVjdGVkJzogcmV0dXJuIHRhYi5zZWxlY3RlZDtcbiAgICAgICAgY2FzZSAncGlubmVkJzogcmV0dXJuIHRhYi5waW5uZWQ7XG4gICAgICAgIGNhc2UgJ29wZW5lclRhYklkJzogcmV0dXJuIHRhYi5vcGVuZXJUYWJJZDtcbiAgICAgICAgY2FzZSAnbGFzdEFjY2Vzc2VkJzogcmV0dXJuIHRhYi5sYXN0QWNjZXNzZWQ7XG4gICAgICAgIGNhc2UgJ2NvbnRleHQnOiByZXR1cm4gdGFiLmNvbnRleHQ7XG4gICAgICAgIGNhc2UgJ2dlbnJlJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uZ2VucmU7XG4gICAgICAgIGNhc2UgJ3NpdGVOYW1lJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uc2l0ZU5hbWU7XG4gICAgICAgIC8vIERlcml2ZWQgb3IgbWFwcGVkIGZpZWxkc1xuICAgICAgICBjYXNlICdkb21haW4nOiByZXR1cm4gZG9tYWluRnJvbVVybCh0YWIudXJsKTtcbiAgICAgICAgY2FzZSAnc3ViZG9tYWluJzogcmV0dXJuIHN1YmRvbWFpbkZyb21VcmwodGFiLnVybCk7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBpZiAoZmllbGQuaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICAgICAgICAgICByZXR1cm4gZmllbGQuc3BsaXQoJy4nKS5yZWR1Y2UoKG9iaiwga2V5KSA9PiAob2JqICYmIHR5cGVvZiBvYmogPT09ICdvYmplY3QnICYmIG9iaiAhPT0gbnVsbCkgPyAob2JqIGFzIGFueSlba2V5XSA6IHVuZGVmaW5lZCwgdGFiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiAodGFiIGFzIGFueSlbZmllbGRdO1xuICAgIH1cbn07XG5cbmNvbnN0IHN0cmlwVGxkID0gKGRvbWFpbjogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIGRvbWFpbi5yZXBsYWNlKC9cXC4oY29tfG9yZ3xnb3Z8bmV0fGVkdXxpbykkL2ksIFwiXCIpO1xufTtcblxuZXhwb3J0IGNvbnN0IHNlbWFudGljQnVja2V0ID0gKHRpdGxlOiBzdHJpbmcsIHVybDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3Qga2V5ID0gYCR7dGl0bGV9ICR7dXJsfWAudG9Mb3dlckNhc2UoKTtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImRvY1wiKSB8fCBrZXkuaW5jbHVkZXMoXCJyZWFkbWVcIikgfHwga2V5LmluY2x1ZGVzKFwiZ3VpZGVcIikpIHJldHVybiBcIkRvY3NcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcIm1haWxcIikgfHwga2V5LmluY2x1ZGVzKFwiaW5ib3hcIikpIHJldHVybiBcIkNoYXRcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImRhc2hib2FyZFwiKSB8fCBrZXkuaW5jbHVkZXMoXCJjb25zb2xlXCIpKSByZXR1cm4gXCJEYXNoXCI7XG4gIGlmIChrZXkuaW5jbHVkZXMoXCJpc3N1ZVwiKSB8fCBrZXkuaW5jbHVkZXMoXCJ0aWNrZXRcIikpIHJldHVybiBcIlRhc2tzXCI7XG4gIGlmIChrZXkuaW5jbHVkZXMoXCJkcml2ZVwiKSB8fCBrZXkuaW5jbHVkZXMoXCJzdG9yYWdlXCIpKSByZXR1cm4gXCJGaWxlc1wiO1xuICByZXR1cm4gXCJNaXNjXCI7XG59O1xuXG5leHBvcnQgY29uc3QgbmF2aWdhdGlvbktleSA9ICh0YWI6IFRhYk1ldGFkYXRhKTogc3RyaW5nID0+IHtcbiAgaWYgKHRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIGBjaGlsZC1vZi0ke3RhYi5vcGVuZXJUYWJJZH1gO1xuICB9XG4gIHJldHVybiBgd2luZG93LSR7dGFiLndpbmRvd0lkfWA7XG59O1xuXG5jb25zdCBnZXRSZWNlbmN5TGFiZWwgPSAobGFzdEFjY2Vzc2VkOiBudW1iZXIpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICBjb25zdCBkaWZmID0gbm93IC0gbGFzdEFjY2Vzc2VkO1xuICBpZiAoZGlmZiA8IDM2MDAwMDApIHJldHVybiBcIkp1c3Qgbm93XCI7IC8vIDFoXG4gIGlmIChkaWZmIDwgODY0MDAwMDApIHJldHVybiBcIlRvZGF5XCI7IC8vIDI0aFxuICBpZiAoZGlmZiA8IDE3MjgwMDAwMCkgcmV0dXJuIFwiWWVzdGVyZGF5XCI7IC8vIDQ4aFxuICBpZiAoZGlmZiA8IDYwNDgwMDAwMCkgcmV0dXJuIFwiVGhpcyBXZWVrXCI7IC8vIDdkXG4gIHJldHVybiBcIk9sZGVyXCI7XG59O1xuXG5jb25zdCBjb2xvckZvcktleSA9IChrZXk6IHN0cmluZywgb2Zmc2V0OiBudW1iZXIpOiBzdHJpbmcgPT4gQ09MT1JTWyhNYXRoLmFicyhoYXNoQ29kZShrZXkpKSArIG9mZnNldCkgJSBDT0xPUlMubGVuZ3RoXTtcblxuY29uc3QgaGFzaENvZGUgPSAodmFsdWU6IHN0cmluZyk6IG51bWJlciA9PiB7XG4gIGxldCBoYXNoID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB2YWx1ZS5sZW5ndGg7IGkgKz0gMSkge1xuICAgIGhhc2ggPSAoaGFzaCA8PCA1KSAtIGhhc2ggKyB2YWx1ZS5jaGFyQ29kZUF0KGkpO1xuICAgIGhhc2ggfD0gMDtcbiAgfVxuICByZXR1cm4gaGFzaDtcbn07XG5cbi8vIEhlbHBlciB0byBnZXQgYSBodW1hbi1yZWFkYWJsZSBsYWJlbCBjb21wb25lbnQgZnJvbSBhIHN0cmF0ZWd5IGFuZCBhIHNldCBvZiB0YWJzXG5jb25zdCBnZXRMYWJlbENvbXBvbmVudCA9IChzdHJhdGVneTogR3JvdXBpbmdTdHJhdGVneSB8IHN0cmluZywgdGFiczogVGFiTWV0YWRhdGFbXSwgYWxsVGFic01hcDogTWFwPG51bWJlciwgVGFiTWV0YWRhdGE+KTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gIGNvbnN0IGZpcnN0VGFiID0gdGFic1swXTtcbiAgaWYgKCFmaXJzdFRhYikgcmV0dXJuIFwiVW5rbm93blwiO1xuXG4gIC8vIENoZWNrIGN1c3RvbSBzdHJhdGVnaWVzIGZpcnN0XG4gIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5KTtcbiAgaWYgKGN1c3RvbSkge1xuICAgICAgcmV0dXJuIGdyb3VwaW5nS2V5KGZpcnN0VGFiLCBzdHJhdGVneSk7XG4gIH1cblxuICBzd2l0Y2ggKHN0cmF0ZWd5KSB7XG4gICAgY2FzZSBcImRvbWFpblwiOiB7XG4gICAgICBjb25zdCBzaXRlTmFtZXMgPSBuZXcgU2V0KHRhYnMubWFwKHQgPT4gdC5jb250ZXh0RGF0YT8uc2l0ZU5hbWUpLmZpbHRlcihCb29sZWFuKSk7XG4gICAgICBpZiAoc2l0ZU5hbWVzLnNpemUgPT09IDEpIHtcbiAgICAgICAgcmV0dXJuIHN0cmlwVGxkKEFycmF5LmZyb20oc2l0ZU5hbWVzKVswXSBhcyBzdHJpbmcpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHN0cmlwVGxkKGRvbWFpbkZyb21VcmwoZmlyc3RUYWIudXJsKSk7XG4gICAgfVxuICAgIGNhc2UgXCJkb21haW5fZnVsbFwiOlxuICAgICAgcmV0dXJuIGRvbWFpbkZyb21VcmwoZmlyc3RUYWIudXJsKTtcbiAgICBjYXNlIFwidG9waWNcIjpcbiAgICAgIHJldHVybiBzZW1hbnRpY0J1Y2tldChmaXJzdFRhYi50aXRsZSwgZmlyc3RUYWIudXJsKTtcbiAgICBjYXNlIFwibGluZWFnZVwiOlxuICAgICAgaWYgKGZpcnN0VGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgY29uc3QgcGFyZW50ID0gYWxsVGFic01hcC5nZXQoZmlyc3RUYWIub3BlbmVyVGFiSWQpO1xuICAgICAgICBpZiAocGFyZW50KSB7XG4gICAgICAgICAgY29uc3QgcGFyZW50VGl0bGUgPSBwYXJlbnQudGl0bGUubGVuZ3RoID4gMjAgPyBwYXJlbnQudGl0bGUuc3Vic3RyaW5nKDAsIDIwKSArIFwiLi4uXCIgOiBwYXJlbnQudGl0bGU7XG4gICAgICAgICAgcmV0dXJuIGBGcm9tOiAke3BhcmVudFRpdGxlfWA7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGBGcm9tOiBUYWIgJHtmaXJzdFRhYi5vcGVuZXJUYWJJZH1gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGBXaW5kb3cgJHtmaXJzdFRhYi53aW5kb3dJZH1gO1xuICAgIGNhc2UgXCJjb250ZXh0XCI6XG4gICAgICByZXR1cm4gZmlyc3RUYWIuY29udGV4dCB8fCBcIlVuY2F0ZWdvcml6ZWRcIjtcbiAgICBjYXNlIFwicGlubmVkXCI6XG4gICAgICByZXR1cm4gZmlyc3RUYWIucGlubmVkID8gXCJQaW5uZWRcIiA6IFwiVW5waW5uZWRcIjtcbiAgICBjYXNlIFwiYWdlXCI6XG4gICAgICByZXR1cm4gZ2V0UmVjZW5jeUxhYmVsKGZpcnN0VGFiLmxhc3RBY2Nlc3NlZCA/PyAwKTtcbiAgICBjYXNlIFwidXJsXCI6XG4gICAgICByZXR1cm4gXCJVUkwgR3JvdXBcIjtcbiAgICBjYXNlIFwicmVjZW5jeVwiOlxuICAgICAgcmV0dXJuIFwiVGltZSBHcm91cFwiO1xuICAgIGNhc2UgXCJuZXN0aW5nXCI6XG4gICAgICByZXR1cm4gZmlyc3RUYWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCA/IFwiQ2hpbGRyZW5cIiA6IFwiUm9vdHNcIjtcbiAgICBkZWZhdWx0OlxuICAgICAgY29uc3QgdmFsID0gZ2V0RmllbGRWYWx1ZShmaXJzdFRhYiwgc3RyYXRlZ3kpO1xuICAgICAgaWYgKHZhbCAhPT0gdW5kZWZpbmVkICYmIHZhbCAhPT0gbnVsbCkge1xuICAgICAgICAgIHJldHVybiBTdHJpbmcodmFsKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBcIlVua25vd25cIjtcbiAgfVxufTtcblxuY29uc3QgZ2VuZXJhdGVMYWJlbCA9IChcbiAgc3RyYXRlZ2llczogKEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcpW10sXG4gIHRhYnM6IFRhYk1ldGFkYXRhW10sXG4gIGFsbFRhYnNNYXA6IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhPlxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgbGFiZWxzID0gc3RyYXRlZ2llc1xuICAgIC5tYXAocyA9PiBnZXRMYWJlbENvbXBvbmVudChzLCB0YWJzLCBhbGxUYWJzTWFwKSlcbiAgICAuZmlsdGVyKGwgPT4gbCAmJiBsICE9PSBcIlVua25vd25cIiAmJiBsICE9PSBcIkdyb3VwXCIgJiYgbCAhPT0gXCJVUkwgR3JvdXBcIiAmJiBsICE9PSBcIlRpbWUgR3JvdXBcIiAmJiBsICE9PSBcIk1pc2NcIik7XG5cbiAgaWYgKGxhYmVscy5sZW5ndGggPT09IDApIHJldHVybiBcIkdyb3VwXCI7XG4gIHJldHVybiBBcnJheS5mcm9tKG5ldyBTZXQobGFiZWxzKSkuam9pbihcIiAtIFwiKTtcbn07XG5cbmNvbnN0IGdldFN0cmF0ZWd5Q29sb3JSdWxlID0gKHN0cmF0ZWd5SWQ6IHN0cmluZyk6IEdyb3VwaW5nUnVsZSB8IHVuZGVmaW5lZCA9PiB7XG4gICAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3lJZCk7XG4gICAgaWYgKCFjdXN0b20pIHJldHVybiB1bmRlZmluZWQ7XG5cbiAgICBjb25zdCBncm91cGluZ1J1bGVzTGlzdCA9IGFzQXJyYXk8R3JvdXBpbmdSdWxlPihjdXN0b20uZ3JvdXBpbmdSdWxlcyk7XG4gICAgLy8gSXRlcmF0ZSBtYW51YWxseSB0byBjaGVjayBjb2xvclxuICAgIGZvciAobGV0IGkgPSBncm91cGluZ1J1bGVzTGlzdC5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICBjb25zdCBydWxlID0gZ3JvdXBpbmdSdWxlc0xpc3RbaV07XG4gICAgICAgIGlmIChydWxlICYmIHJ1bGUuY29sb3IgJiYgcnVsZS5jb2xvciAhPT0gJ3JhbmRvbScpIHtcbiAgICAgICAgICAgIHJldHVybiBydWxlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB1bmRlZmluZWQ7XG59O1xuXG5jb25zdCByZXNvbHZlV2luZG93TW9kZSA9IChtb2RlczogKHN0cmluZyB8IHVuZGVmaW5lZClbXSk6IFwiY3VycmVudFwiIHwgXCJuZXdcIiB8IFwiY29tcG91bmRcIiA9PiB7XG4gICAgaWYgKG1vZGVzLmluY2x1ZGVzKFwibmV3XCIpKSByZXR1cm4gXCJuZXdcIjtcbiAgICBpZiAobW9kZXMuaW5jbHVkZXMoXCJjb21wb3VuZFwiKSkgcmV0dXJuIFwiY29tcG91bmRcIjtcbiAgICByZXR1cm4gXCJjdXJyZW50XCI7XG59O1xuXG5leHBvcnQgY29uc3QgZ3JvdXBUYWJzID0gKFxuICB0YWJzOiBUYWJNZXRhZGF0YVtdLFxuICBzdHJhdGVnaWVzOiAoU29ydGluZ1N0cmF0ZWd5IHwgc3RyaW5nKVtdXG4pOiBUYWJHcm91cFtdID0+IHtcbiAgY29uc3QgYXZhaWxhYmxlU3RyYXRlZ2llcyA9IGdldFN0cmF0ZWdpZXMoY3VzdG9tU3RyYXRlZ2llcyk7XG4gIGNvbnN0IGVmZmVjdGl2ZVN0cmF0ZWdpZXMgPSBzdHJhdGVnaWVzLmZpbHRlcihzID0+IGF2YWlsYWJsZVN0cmF0ZWdpZXMuZmluZChhdmFpbCA9PiBhdmFpbC5pZCA9PT0gcyk/LmlzR3JvdXBpbmcpO1xuICBjb25zdCBidWNrZXRzID0gbmV3IE1hcDxzdHJpbmcsIFRhYkdyb3VwPigpO1xuXG4gIGNvbnN0IGFsbFRhYnNNYXAgPSBuZXcgTWFwPG51bWJlciwgVGFiTWV0YWRhdGE+KCk7XG4gIHRhYnMuZm9yRWFjaCh0ID0+IGFsbFRhYnNNYXAuc2V0KHQuaWQsIHQpKTtcblxuICB0YWJzLmZvckVhY2goKHRhYikgPT4ge1xuICAgIGxldCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IGFwcGxpZWRTdHJhdGVnaWVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IGNvbGxlY3RlZE1vZGVzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgZm9yIChjb25zdCBzIG9mIGVmZmVjdGl2ZVN0cmF0ZWdpZXMpIHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGdldEdyb3VwaW5nUmVzdWx0KHRhYiwgcyk7XG4gICAgICAgICAgICBpZiAocmVzdWx0LmtleSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGtleXMucHVzaChgJHtzfToke3Jlc3VsdC5rZXl9YCk7XG4gICAgICAgICAgICAgICAgYXBwbGllZFN0cmF0ZWdpZXMucHVzaChzKTtcbiAgICAgICAgICAgICAgICBjb2xsZWN0ZWRNb2Rlcy5wdXNoKHJlc3VsdC5tb2RlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgbG9nRGVidWcoXCJFcnJvciBnZW5lcmF0aW5nIGdyb3VwaW5nIGtleVwiLCB7IHRhYklkOiB0YWIuaWQsIGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgIHJldHVybjsgLy8gU2tpcCB0aGlzIHRhYiBvbiBlcnJvclxuICAgIH1cblxuICAgIC8vIElmIG5vIHN0cmF0ZWdpZXMgYXBwbGllZCAoZS5nLiBhbGwgZmlsdGVyZWQgb3V0KSwgc2tpcCBncm91cGluZyBmb3IgdGhpcyB0YWJcbiAgICBpZiAoa2V5cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGVmZmVjdGl2ZU1vZGUgPSByZXNvbHZlV2luZG93TW9kZShjb2xsZWN0ZWRNb2Rlcyk7XG4gICAgY29uc3QgdmFsdWVLZXkgPSBrZXlzLmpvaW4oXCI6OlwiKTtcbiAgICBsZXQgYnVja2V0S2V5ID0gXCJcIjtcbiAgICBpZiAoZWZmZWN0aXZlTW9kZSA9PT0gJ2N1cnJlbnQnKSB7XG4gICAgICAgICBidWNrZXRLZXkgPSBgd2luZG93LSR7dGFiLndpbmRvd0lkfTo6YCArIHZhbHVlS2V5O1xuICAgIH0gZWxzZSB7XG4gICAgICAgICBidWNrZXRLZXkgPSBgZ2xvYmFsOjpgICsgdmFsdWVLZXk7XG4gICAgfVxuXG4gICAgbGV0IGdyb3VwID0gYnVja2V0cy5nZXQoYnVja2V0S2V5KTtcbiAgICBpZiAoIWdyb3VwKSB7XG4gICAgICBsZXQgZ3JvdXBDb2xvciA9IG51bGw7XG4gICAgICBsZXQgY29sb3JGaWVsZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG4gICAgICBmb3IgKGNvbnN0IHNJZCBvZiBhcHBsaWVkU3RyYXRlZ2llcykge1xuICAgICAgICBjb25zdCBydWxlID0gZ2V0U3RyYXRlZ3lDb2xvclJ1bGUoc0lkKTtcbiAgICAgICAgaWYgKHJ1bGUpIHtcbiAgICAgICAgICAgIGdyb3VwQ29sb3IgPSBydWxlLmNvbG9yO1xuICAgICAgICAgICAgY29sb3JGaWVsZCA9IHJ1bGUuY29sb3JGaWVsZDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChncm91cENvbG9yID09PSAnbWF0Y2gnKSB7XG4gICAgICAgIGdyb3VwQ29sb3IgPSBjb2xvckZvcktleSh2YWx1ZUtleSwgMCk7XG4gICAgICB9IGVsc2UgaWYgKGdyb3VwQ29sb3IgPT09ICdmaWVsZCcgJiYgY29sb3JGaWVsZCkge1xuICAgICAgICBjb25zdCB2YWwgPSBnZXRGaWVsZFZhbHVlKHRhYiwgY29sb3JGaWVsZCk7XG4gICAgICAgIGNvbnN0IGtleSA9IHZhbCAhPT0gdW5kZWZpbmVkICYmIHZhbCAhPT0gbnVsbCA/IFN0cmluZyh2YWwpIDogXCJcIjtcbiAgICAgICAgZ3JvdXBDb2xvciA9IGNvbG9yRm9yS2V5KGtleSwgMCk7XG4gICAgICB9IGVsc2UgaWYgKCFncm91cENvbG9yIHx8IGdyb3VwQ29sb3IgPT09ICdmaWVsZCcpIHtcbiAgICAgICAgZ3JvdXBDb2xvciA9IGNvbG9yRm9yS2V5KGJ1Y2tldEtleSwgYnVja2V0cy5zaXplKTtcbiAgICAgIH1cblxuICAgICAgZ3JvdXAgPSB7XG4gICAgICAgIGlkOiBidWNrZXRLZXksXG4gICAgICAgIHdpbmRvd0lkOiB0YWIud2luZG93SWQsXG4gICAgICAgIGxhYmVsOiBcIlwiLFxuICAgICAgICBjb2xvcjogZ3JvdXBDb2xvcixcbiAgICAgICAgdGFiczogW10sXG4gICAgICAgIHJlYXNvbjogYXBwbGllZFN0cmF0ZWdpZXMuam9pbihcIiArIFwiKSxcbiAgICAgICAgd2luZG93TW9kZTogZWZmZWN0aXZlTW9kZVxuICAgICAgfTtcbiAgICAgIGJ1Y2tldHMuc2V0KGJ1Y2tldEtleSwgZ3JvdXApO1xuICAgIH1cbiAgICBncm91cC50YWJzLnB1c2godGFiKTtcbiAgfSk7XG5cbiAgY29uc3QgZ3JvdXBzID0gQXJyYXkuZnJvbShidWNrZXRzLnZhbHVlcygpKTtcbiAgZ3JvdXBzLmZvckVhY2goZ3JvdXAgPT4ge1xuICAgIGdyb3VwLmxhYmVsID0gZ2VuZXJhdGVMYWJlbChlZmZlY3RpdmVTdHJhdGVnaWVzLCBncm91cC50YWJzLCBhbGxUYWJzTWFwKTtcbiAgfSk7XG5cbiAgcmV0dXJuIGdyb3Vwcztcbn07XG5cbmV4cG9ydCBjb25zdCBjaGVja0NvbmRpdGlvbiA9IChjb25kaXRpb246IFJ1bGVDb25kaXRpb24sIHRhYjogVGFiTWV0YWRhdGEpOiBib29sZWFuID0+IHtcbiAgICBpZiAoIWNvbmRpdGlvbikgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IHJhd1ZhbHVlID0gZ2V0RmllbGRWYWx1ZSh0YWIsIGNvbmRpdGlvbi5maWVsZCk7XG4gICAgY29uc3QgdmFsdWVUb0NoZWNrID0gcmF3VmFsdWUgIT09IHVuZGVmaW5lZCAmJiByYXdWYWx1ZSAhPT0gbnVsbCA/IFN0cmluZyhyYXdWYWx1ZSkudG9Mb3dlckNhc2UoKSA6IFwiXCI7XG4gICAgY29uc3QgcGF0dGVybiA9IGNvbmRpdGlvbi52YWx1ZSA/IGNvbmRpdGlvbi52YWx1ZS50b0xvd2VyQ2FzZSgpIDogXCJcIjtcblxuICAgIHN3aXRjaCAoY29uZGl0aW9uLm9wZXJhdG9yKSB7XG4gICAgICAgIGNhc2UgJ2NvbnRhaW5zJzogcmV0dXJuIHZhbHVlVG9DaGVjay5pbmNsdWRlcyhwYXR0ZXJuKTtcbiAgICAgICAgY2FzZSAnZG9lc05vdENvbnRhaW4nOiByZXR1cm4gIXZhbHVlVG9DaGVjay5pbmNsdWRlcyhwYXR0ZXJuKTtcbiAgICAgICAgY2FzZSAnZXF1YWxzJzogcmV0dXJuIHZhbHVlVG9DaGVjayA9PT0gcGF0dGVybjtcbiAgICAgICAgY2FzZSAnc3RhcnRzV2l0aCc6IHJldHVybiB2YWx1ZVRvQ2hlY2suc3RhcnRzV2l0aChwYXR0ZXJuKTtcbiAgICAgICAgY2FzZSAnZW5kc1dpdGgnOiByZXR1cm4gdmFsdWVUb0NoZWNrLmVuZHNXaXRoKHBhdHRlcm4pO1xuICAgICAgICBjYXNlICdleGlzdHMnOiByZXR1cm4gcmF3VmFsdWUgIT09IHVuZGVmaW5lZDtcbiAgICAgICAgY2FzZSAnZG9lc05vdEV4aXN0JzogcmV0dXJuIHJhd1ZhbHVlID09PSB1bmRlZmluZWQ7XG4gICAgICAgIGNhc2UgJ2lzTnVsbCc6IHJldHVybiByYXdWYWx1ZSA9PT0gbnVsbDtcbiAgICAgICAgY2FzZSAnaXNOb3ROdWxsJzogcmV0dXJuIHJhd1ZhbHVlICE9PSBudWxsO1xuICAgICAgICBjYXNlICdtYXRjaGVzJzpcbiAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgUmVnRXhwKGNvbmRpdGlvbi52YWx1ZSwgJ2knKS50ZXN0KHJhd1ZhbHVlICE9PSB1bmRlZmluZWQgJiYgcmF3VmFsdWUgIT09IG51bGwgPyBTdHJpbmcocmF3VmFsdWUpIDogXCJcIik7XG4gICAgICAgICAgICAgfSBjYXRjaCB7IHJldHVybiBmYWxzZTsgfVxuICAgICAgICBkZWZhdWx0OiByZXR1cm4gZmFsc2U7XG4gICAgfVxufTtcblxuZnVuY3Rpb24gZXZhbHVhdGVMZWdhY3lSdWxlcyhsZWdhY3lSdWxlczogU3RyYXRlZ3lSdWxlW10sIHRhYjogVGFiTWV0YWRhdGEpOiBzdHJpbmcgfCBudWxsIHtcbiAgICAvLyBEZWZlbnNpdmUgY2hlY2tcbiAgICBpZiAoIWxlZ2FjeVJ1bGVzIHx8ICFBcnJheS5pc0FycmF5KGxlZ2FjeVJ1bGVzKSkge1xuICAgICAgICBpZiAoIWxlZ2FjeVJ1bGVzKSByZXR1cm4gbnVsbDtcbiAgICAgICAgLy8gVHJ5IGFzQXJyYXkgaWYgaXQncyBub3QgYXJyYXkgYnV0IHRydXRoeSAodW5saWtlbHkgZ2l2ZW4gcHJldmlvdXMgbG9naWMgYnV0IHNhZmUpXG4gICAgfVxuXG4gICAgY29uc3QgbGVnYWN5UnVsZXNMaXN0ID0gYXNBcnJheTxTdHJhdGVneVJ1bGU+KGxlZ2FjeVJ1bGVzKTtcbiAgICBpZiAobGVnYWN5UnVsZXNMaXN0Lmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG5cbiAgICB0cnkge1xuICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgbGVnYWN5UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICBpZiAoIXJ1bGUpIGNvbnRpbnVlO1xuICAgICAgICAgICAgY29uc3QgcmF3VmFsdWUgPSBnZXRGaWVsZFZhbHVlKHRhYiwgcnVsZS5maWVsZCk7XG4gICAgICAgICAgICBsZXQgdmFsdWVUb0NoZWNrID0gcmF3VmFsdWUgIT09IHVuZGVmaW5lZCAmJiByYXdWYWx1ZSAhPT0gbnVsbCA/IFN0cmluZyhyYXdWYWx1ZSkgOiBcIlwiO1xuICAgICAgICAgICAgdmFsdWVUb0NoZWNrID0gdmFsdWVUb0NoZWNrLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICBjb25zdCBwYXR0ZXJuID0gcnVsZS52YWx1ZSA/IHJ1bGUudmFsdWUudG9Mb3dlckNhc2UoKSA6IFwiXCI7XG5cbiAgICAgICAgICAgIGxldCBpc01hdGNoID0gZmFsc2U7XG4gICAgICAgICAgICBsZXQgbWF0Y2hPYmo6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGwgPSBudWxsO1xuXG4gICAgICAgICAgICBzd2l0Y2ggKHJ1bGUub3BlcmF0b3IpIHtcbiAgICAgICAgICAgICAgICBjYXNlICdjb250YWlucyc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suaW5jbHVkZXMocGF0dGVybik7IGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2RvZXNOb3RDb250YWluJzogaXNNYXRjaCA9ICF2YWx1ZVRvQ2hlY2suaW5jbHVkZXMocGF0dGVybik7IGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2VxdWFscyc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2sgPT09IHBhdHRlcm47IGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ3N0YXJ0c1dpdGgnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrLnN0YXJ0c1dpdGgocGF0dGVybik7IGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2VuZHNXaXRoJzogaXNNYXRjaCA9IHZhbHVlVG9DaGVjay5lbmRzV2l0aChwYXR0ZXJuKTsgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnZXhpc3RzJzogaXNNYXRjaCA9IHJhd1ZhbHVlICE9PSB1bmRlZmluZWQ7IGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2RvZXNOb3RFeGlzdCc6IGlzTWF0Y2ggPSByYXdWYWx1ZSA9PT0gdW5kZWZpbmVkOyBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdpc051bGwnOiBpc01hdGNoID0gcmF3VmFsdWUgPT09IG51bGw7IGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2lzTm90TnVsbCc6IGlzTWF0Y2ggPSByYXdWYWx1ZSAhPT0gbnVsbDsgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnbWF0Y2hlcyc6XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZWdleCA9IG5ldyBSZWdFeHAocnVsZS52YWx1ZSwgJ2knKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1hdGNoT2JqID0gcmVnZXguZXhlYyhyYXdWYWx1ZSAhPT0gdW5kZWZpbmVkICYmIHJhd1ZhbHVlICE9PSBudWxsID8gU3RyaW5nKHJhd1ZhbHVlKSA6IFwiXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaXNNYXRjaCA9ICEhbWF0Y2hPYmo7XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHt9XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoaXNNYXRjaCkge1xuICAgICAgICAgICAgICAgIGxldCByZXN1bHQgPSBydWxlLnJlc3VsdDtcbiAgICAgICAgICAgICAgICBpZiAobWF0Y2hPYmopIHtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBtYXRjaE9iai5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKG5ldyBSZWdFeHAoYFxcXFwkJHtpfWAsICdnJyksIG1hdGNoT2JqW2ldIHx8IFwiXCIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGV2YWx1YXRpbmcgbGVnYWN5IHJ1bGVzXCIsIHsgZXJyb3I6IFN0cmluZyhlcnJvcikgfSk7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgY29uc3QgZ2V0R3JvdXBpbmdSZXN1bHQgPSAodGFiOiBUYWJNZXRhZGF0YSwgc3RyYXRlZ3k6IEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcpOiB7IGtleTogc3RyaW5nIHwgbnVsbCwgbW9kZTogXCJjdXJyZW50XCIgfCBcIm5ld1wiIHwgXCJjb21wb3VuZFwiIH0gPT4ge1xuICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneSk7XG4gIGlmIChjdXN0b20pIHtcbiAgICAgIGNvbnN0IGZpbHRlckdyb3Vwc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb25bXT4oY3VzdG9tLmZpbHRlckdyb3Vwcyk7XG4gICAgICBjb25zdCBmaWx0ZXJzTGlzdCA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbj4oY3VzdG9tLmZpbHRlcnMpO1xuXG4gICAgICBsZXQgbWF0Y2ggPSBmYWxzZTtcblxuICAgICAgaWYgKGZpbHRlckdyb3Vwc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIC8vIE9SIGxvZ2ljXG4gICAgICAgICAgZm9yIChjb25zdCBncm91cCBvZiBmaWx0ZXJHcm91cHNMaXN0KSB7XG4gICAgICAgICAgICAgIGNvbnN0IGdyb3VwUnVsZXMgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGdyb3VwKTtcbiAgICAgICAgICAgICAgaWYgKGdyb3VwUnVsZXMubGVuZ3RoID09PSAwIHx8IGdyb3VwUnVsZXMuZXZlcnkociA9PiBjaGVja0NvbmRpdGlvbihyLCB0YWIpKSkge1xuICAgICAgICAgICAgICAgICAgbWF0Y2ggPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGZpbHRlcnNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAvLyBMZWdhY3kvU2ltcGxlIEFORCBsb2dpY1xuICAgICAgICAgIGlmIChmaWx0ZXJzTGlzdC5ldmVyeShmID0+IGNoZWNrQ29uZGl0aW9uKGYsIHRhYikpKSB7XG4gICAgICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIE5vIGZpbHRlcnMgLT4gTWF0Y2ggYWxsXG4gICAgICAgICAgbWF0Y2ggPSB0cnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoIW1hdGNoKSB7XG4gICAgICAgICAgcmV0dXJuIHsga2V5OiBudWxsLCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICAgICAgfVxuXG4gICAgICBjb25zdCBncm91cGluZ1J1bGVzTGlzdCA9IGFzQXJyYXk8R3JvdXBpbmdSdWxlPihjdXN0b20uZ3JvdXBpbmdSdWxlcyk7XG4gICAgICBpZiAoZ3JvdXBpbmdSdWxlc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgIGNvbnN0IG1vZGVzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZ3JvdXBpbmdSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXJ1bGUpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIGxldCB2YWwgPSBcIlwiO1xuICAgICAgICAgICAgICAgIGlmIChydWxlLnNvdXJjZSA9PT0gJ2ZpZWxkJykge1xuICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmF3ID0gZ2V0RmllbGRWYWx1ZSh0YWIsIHJ1bGUudmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgdmFsID0gcmF3ICE9PSB1bmRlZmluZWQgJiYgcmF3ICE9PSBudWxsID8gU3RyaW5nKHJhdykgOiBcIlwiO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICB2YWwgPSBydWxlLnZhbHVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh2YWwgJiYgcnVsZS50cmFuc2Zvcm0gJiYgcnVsZS50cmFuc2Zvcm0gIT09ICdub25lJykge1xuICAgICAgICAgICAgICAgICAgICBzd2l0Y2ggKHJ1bGUudHJhbnNmb3JtKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdzdHJpcFRsZCc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gc3RyaXBUbGQodmFsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ2xvd2VyY2FzZSc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gdmFsLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICd1cHBlcmNhc2UnOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHZhbC50b1VwcGVyQ2FzZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnZmlyc3RDaGFyJzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSB2YWwuY2hhckF0KDApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnZG9tYWluJzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBkb21haW5Gcm9tVXJsKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdob3N0bmFtZSc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IG5ldyBVUkwodmFsKS5ob3N0bmFtZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHsgLyoga2VlcCBhcyBpcyAqLyB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdyZWdleCc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJ1bGUudHJhbnNmb3JtUGF0dGVybikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHJlZ2V4ID0gcmVnZXhDYWNoZS5nZXQocnVsZS50cmFuc2Zvcm1QYXR0ZXJuKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghcmVnZXgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZWdleCA9IG5ldyBSZWdFeHAocnVsZS50cmFuc2Zvcm1QYXR0ZXJuKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZWdleENhY2hlLnNldChydWxlLnRyYW5zZm9ybVBhdHRlcm4sIHJlZ2V4KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1hdGNoID0gcmVnZXguZXhlYyh2YWwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGV4dHJhY3RlZCA9IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBtYXRjaC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleHRyYWN0ZWQgKz0gbWF0Y2hbaV0gfHwgXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gZXh0cmFjdGVkO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkludmFsaWQgcmVnZXggaW4gdHJhbnNmb3JtXCIsIHsgcGF0dGVybjogcnVsZS50cmFuc2Zvcm1QYXR0ZXJuLCBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHZhbCkge1xuICAgICAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChydWxlLndpbmRvd01vZGUpIG1vZGVzLnB1c2gocnVsZS53aW5kb3dNb2RlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgIGxvZ0RlYnVnKFwiRXJyb3IgYXBwbHlpbmcgZ3JvdXBpbmcgcnVsZXNcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIHJldHVybiB7IGtleTogcGFydHMuam9pbihcIiAtIFwiKSwgbW9kZTogcmVzb2x2ZVdpbmRvd01vZGUobW9kZXMpIH07XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7IGtleTogY3VzdG9tLmZhbGxiYWNrIHx8IFwiTWlzY1wiLCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICAgICAgfSBlbHNlIGlmIChjdXN0b20ucnVsZXMpIHtcbiAgICAgICAgICBjb25zdCByZXN1bHQgPSBldmFsdWF0ZUxlZ2FjeVJ1bGVzKGFzQXJyYXk8U3RyYXRlZ3lSdWxlPihjdXN0b20ucnVsZXMpLCB0YWIpO1xuICAgICAgICAgIGlmIChyZXN1bHQpIHJldHVybiB7IGtleTogcmVzdWx0LCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICAgICAgfVxuXG4gICAgICByZXR1cm4geyBrZXk6IGN1c3RvbS5mYWxsYmFjayB8fCBcIk1pc2NcIiwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgfVxuXG4gIC8vIEJ1aWx0LWluIHN0cmF0ZWdpZXNcbiAgbGV0IHNpbXBsZUtleTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIHN3aXRjaCAoc3RyYXRlZ3kpIHtcbiAgICBjYXNlIFwiZG9tYWluXCI6XG4gICAgY2FzZSBcImRvbWFpbl9mdWxsXCI6XG4gICAgICBzaW1wbGVLZXkgPSBkb21haW5Gcm9tVXJsKHRhYi51cmwpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInRvcGljXCI6XG4gICAgICBzaW1wbGVLZXkgPSBzZW1hbnRpY0J1Y2tldCh0YWIudGl0bGUsIHRhYi51cmwpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcImxpbmVhZ2VcIjpcbiAgICAgIHNpbXBsZUtleSA9IG5hdmlnYXRpb25LZXkodGFiKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJjb250ZXh0XCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIuY29udGV4dCB8fCBcIlVuY2F0ZWdvcml6ZWRcIjtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJwaW5uZWRcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi5waW5uZWQgPyBcInBpbm5lZFwiIDogXCJ1bnBpbm5lZFwiO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcImFnZVwiOlxuICAgICAgc2ltcGxlS2V5ID0gZ2V0UmVjZW5jeUxhYmVsKHRhYi5sYXN0QWNjZXNzZWQgPz8gMCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwidXJsXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIudXJsO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInRpdGxlXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIudGl0bGU7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwicmVjZW5jeVwiOlxuICAgICAgc2ltcGxlS2V5ID0gU3RyaW5nKHRhYi5sYXN0QWNjZXNzZWQgPz8gMCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwibmVzdGluZ1wiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQgPyBcImNoaWxkXCIgOiBcInJvb3RcIjtcbiAgICAgIGJyZWFrO1xuICAgIGRlZmF1bHQ6XG4gICAgICAgIGNvbnN0IHZhbCA9IGdldEZpZWxkVmFsdWUodGFiLCBzdHJhdGVneSk7XG4gICAgICAgIGlmICh2YWwgIT09IHVuZGVmaW5lZCAmJiB2YWwgIT09IG51bGwpIHtcbiAgICAgICAgICAgIHNpbXBsZUtleSA9IFN0cmluZyh2YWwpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2ltcGxlS2V5ID0gXCJVbmtub3duXCI7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gIH1cbiAgcmV0dXJuIHsga2V5OiBzaW1wbGVLZXksIG1vZGU6IFwiY3VycmVudFwiIH07XG59O1xuXG5leHBvcnQgY29uc3QgZ3JvdXBpbmdLZXkgPSAodGFiOiBUYWJNZXRhZGF0YSwgc3RyYXRlZ3k6IEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcpOiBzdHJpbmcgfCBudWxsID0+IHtcbiAgICByZXR1cm4gZ2V0R3JvdXBpbmdSZXN1bHQodGFiLCBzdHJhdGVneSkua2V5O1xufTtcblxuZnVuY3Rpb24gaXNDb250ZXh0RmllbGQoZmllbGQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBmaWVsZCA9PT0gJ2NvbnRleHQnIHx8IGZpZWxkID09PSAnZ2VucmUnIHx8IGZpZWxkID09PSAnc2l0ZU5hbWUnIHx8IGZpZWxkLnN0YXJ0c1dpdGgoJ2NvbnRleHREYXRhLicpO1xufVxuXG5leHBvcnQgY29uc3QgcmVxdWlyZXNDb250ZXh0QW5hbHlzaXMgPSAoc3RyYXRlZ3lJZHM6IChzdHJpbmcgfCBTb3J0aW5nU3RyYXRlZ3kpW10pOiBib29sZWFuID0+IHtcbiAgICAvLyBDaGVjayBpZiBcImNvbnRleHRcIiBzdHJhdGVneSBpcyBleHBsaWNpdGx5IHJlcXVlc3RlZFxuICAgIGlmIChzdHJhdGVneUlkcy5pbmNsdWRlcyhcImNvbnRleHRcIikpIHJldHVybiB0cnVlO1xuXG4gICAgY29uc3Qgc3RyYXRlZ2llcyA9IGdldFN0cmF0ZWdpZXMoY3VzdG9tU3RyYXRlZ2llcyk7XG4gICAgLy8gZmlsdGVyIG9ubHkgdGhvc2UgdGhhdCBtYXRjaCB0aGUgcmVxdWVzdGVkIElEc1xuICAgIGNvbnN0IGFjdGl2ZURlZnMgPSBzdHJhdGVnaWVzLmZpbHRlcihzID0+IHN0cmF0ZWd5SWRzLmluY2x1ZGVzKHMuaWQpKTtcblxuICAgIGZvciAoY29uc3QgZGVmIG9mIGFjdGl2ZURlZnMpIHtcbiAgICAgICAgLy8gSWYgaXQncyBhIGJ1aWx0LWluIHN0cmF0ZWd5IHRoYXQgbmVlZHMgY29udGV4dCAob25seSAnY29udGV4dCcgZG9lcylcbiAgICAgICAgaWYgKGRlZi5pZCA9PT0gJ2NvbnRleHQnKSByZXR1cm4gdHJ1ZTtcblxuICAgICAgICAvLyBJZiBpdCBpcyBhIGN1c3RvbSBzdHJhdGVneSAob3Igb3ZlcnJpZGVzIGJ1aWx0LWluKSwgY2hlY2sgaXRzIHJ1bGVzXG4gICAgICAgIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChjID0+IGMuaWQgPT09IGRlZi5pZCk7XG4gICAgICAgIGlmIChjdXN0b20pIHtcbiAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzTGlzdCA9IGFzQXJyYXk8R3JvdXBpbmdSdWxlPihjdXN0b20uZ3JvdXBpbmdSdWxlcyk7XG4gICAgICAgICAgICAgY29uc3Qgc29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KGN1c3RvbS5zb3J0aW5nUnVsZXMpO1xuICAgICAgICAgICAgIGNvbnN0IGdyb3VwU29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KGN1c3RvbS5ncm91cFNvcnRpbmdSdWxlcyk7XG4gICAgICAgICAgICAgY29uc3QgZmlsdGVyc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGN1c3RvbS5maWx0ZXJzKTtcbiAgICAgICAgICAgICBjb25zdCBmaWx0ZXJHcm91cHNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uW10+KGN1c3RvbS5maWx0ZXJHcm91cHMpO1xuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwUnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIHJ1bGUuc291cmNlID09PSAnZmllbGQnICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUudmFsdWUpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgcnVsZS5jb2xvciA9PT0gJ2ZpZWxkJyAmJiBydWxlLmNvbG9yRmllbGQgJiYgaXNDb250ZXh0RmllbGQocnVsZS5jb2xvckZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIHNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBmaWx0ZXJzTGlzdCkge1xuICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBpc0NvbnRleHRGaWVsZChydWxlLmZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBncm91cCBvZiBmaWx0ZXJHcm91cHNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGNvbnN0IGdyb3VwUnVsZXMgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGdyb3VwKTtcbiAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwUnVsZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59O1xuIiwgImltcG9ydCB7IFNvcnRpbmdTdHJhdGVneSwgVGFiTWV0YWRhdGEsIEN1c3RvbVN0cmF0ZWd5LCBTb3J0aW5nUnVsZSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGRvbWFpbkZyb21VcmwsIHNlbWFudGljQnVja2V0LCBuYXZpZ2F0aW9uS2V5LCBncm91cGluZ0tleSwgZ2V0RmllbGRWYWx1ZSwgZ2V0Q3VzdG9tU3RyYXRlZ2llcyB9IGZyb20gXCIuL2dyb3VwaW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcblxuZXhwb3J0IGNvbnN0IHJlY2VuY3lTY29yZSA9ICh0YWI6IFRhYk1ldGFkYXRhKSA9PiB0YWIubGFzdEFjY2Vzc2VkID8/IDA7XG5leHBvcnQgY29uc3QgaGllcmFyY2h5U2NvcmUgPSAodGFiOiBUYWJNZXRhZGF0YSkgPT4gKHRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkID8gMSA6IDApO1xuZXhwb3J0IGNvbnN0IHBpbm5lZFNjb3JlID0gKHRhYjogVGFiTWV0YWRhdGEpID0+ICh0YWIucGlubmVkID8gMCA6IDEpO1xuXG5leHBvcnQgY29uc3Qgc29ydFRhYnMgPSAodGFiczogVGFiTWV0YWRhdGFbXSwgc3RyYXRlZ2llczogU29ydGluZ1N0cmF0ZWd5W10pOiBUYWJNZXRhZGF0YVtdID0+IHtcbiAgY29uc3Qgc2NvcmluZzogU29ydGluZ1N0cmF0ZWd5W10gPSBzdHJhdGVnaWVzLmxlbmd0aCA/IHN0cmF0ZWdpZXMgOiBbXCJwaW5uZWRcIiwgXCJyZWNlbmN5XCJdO1xuICByZXR1cm4gWy4uLnRhYnNdLnNvcnQoKGEsIGIpID0+IHtcbiAgICBmb3IgKGNvbnN0IHN0cmF0ZWd5IG9mIHNjb3JpbmcpIHtcbiAgICAgIGNvbnN0IGRpZmYgPSBjb21wYXJlQnkoc3RyYXRlZ3ksIGEsIGIpO1xuICAgICAgaWYgKGRpZmYgIT09IDApIHJldHVybiBkaWZmO1xuICAgIH1cbiAgICByZXR1cm4gYS5pZCAtIGIuaWQ7XG4gIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IGNvbXBhcmVCeSA9IChzdHJhdGVneTogU29ydGluZ1N0cmF0ZWd5IHwgc3RyaW5nLCBhOiBUYWJNZXRhZGF0YSwgYjogVGFiTWV0YWRhdGEpOiBudW1iZXIgPT4ge1xuICAvLyAxLiBDaGVjayBDdXN0b20gU3RyYXRlZ2llcyBmb3IgU29ydGluZyBSdWxlc1xuICBjb25zdCBjdXN0b21TdHJhdHMgPSBnZXRDdXN0b21TdHJhdGVnaWVzKCk7XG4gIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0cy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3kpO1xuICBpZiAoY3VzdG9tKSB7XG4gICAgICBjb25zdCBzb3J0UnVsZXNMaXN0ID0gYXNBcnJheTxTb3J0aW5nUnVsZT4oY3VzdG9tLnNvcnRpbmdSdWxlcyk7XG4gICAgICBpZiAoc29ydFJ1bGVzTGlzdC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgLy8gRXZhbHVhdGUgY3VzdG9tIHNvcnRpbmcgcnVsZXMgaW4gb3JkZXJcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2Ygc29ydFJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IHZhbEEgPSBnZXRGaWVsZFZhbHVlKGEsIHJ1bGUuZmllbGQpO1xuICAgICAgICAgICAgICAgICAgY29uc3QgdmFsQiA9IGdldEZpZWxkVmFsdWUoYiwgcnVsZS5maWVsZCk7XG5cbiAgICAgICAgICAgICAgICAgIGxldCByZXN1bHQgPSAwO1xuICAgICAgICAgICAgICAgICAgaWYgKHZhbEEgPCB2YWxCKSByZXN1bHQgPSAtMTtcbiAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKHZhbEEgPiB2YWxCKSByZXN1bHQgPSAxO1xuXG4gICAgICAgICAgICAgICAgICBpZiAocmVzdWx0ICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJ1bGUub3JkZXIgPT09ICdkZXNjJyA/IC1yZXN1bHQgOiByZXN1bHQ7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgIGxvZ0RlYnVnKFwiRXJyb3IgZXZhbHVhdGluZyBjdXN0b20gc29ydGluZyBydWxlc1wiLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIElmIGFsbCBydWxlcyBlcXVhbCwgY29udGludWUgdG8gbmV4dCBzdHJhdGVneSAocmV0dXJuIDApXG4gICAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9XG4gIH1cblxuICAvLyAyLiBCdWlsdC1pbiBvciBmYWxsYmFja1xuICBzd2l0Y2ggKHN0cmF0ZWd5KSB7XG4gICAgY2FzZSBcInJlY2VuY3lcIjpcbiAgICAgIHJldHVybiAoYi5sYXN0QWNjZXNzZWQgPz8gMCkgLSAoYS5sYXN0QWNjZXNzZWQgPz8gMCk7XG4gICAgY2FzZSBcIm5lc3RpbmdcIjogLy8gRm9ybWVybHkgaGllcmFyY2h5XG4gICAgICByZXR1cm4gaGllcmFyY2h5U2NvcmUoYSkgLSBoaWVyYXJjaHlTY29yZShiKTtcbiAgICBjYXNlIFwicGlubmVkXCI6XG4gICAgICByZXR1cm4gcGlubmVkU2NvcmUoYSkgLSBwaW5uZWRTY29yZShiKTtcbiAgICBjYXNlIFwidGl0bGVcIjpcbiAgICAgIHJldHVybiBhLnRpdGxlLmxvY2FsZUNvbXBhcmUoYi50aXRsZSk7XG4gICAgY2FzZSBcInVybFwiOlxuICAgICAgcmV0dXJuIGEudXJsLmxvY2FsZUNvbXBhcmUoYi51cmwpO1xuICAgIGNhc2UgXCJjb250ZXh0XCI6XG4gICAgICByZXR1cm4gKGEuY29udGV4dCA/PyBcIlwiKS5sb2NhbGVDb21wYXJlKGIuY29udGV4dCA/PyBcIlwiKTtcbiAgICBjYXNlIFwiZG9tYWluXCI6XG4gICAgY2FzZSBcImRvbWFpbl9mdWxsXCI6XG4gICAgICByZXR1cm4gZG9tYWluRnJvbVVybChhLnVybCkubG9jYWxlQ29tcGFyZShkb21haW5Gcm9tVXJsKGIudXJsKSk7XG4gICAgY2FzZSBcInRvcGljXCI6XG4gICAgICByZXR1cm4gc2VtYW50aWNCdWNrZXQoYS50aXRsZSwgYS51cmwpLmxvY2FsZUNvbXBhcmUoc2VtYW50aWNCdWNrZXQoYi50aXRsZSwgYi51cmwpKTtcbiAgICBjYXNlIFwibGluZWFnZVwiOlxuICAgICAgcmV0dXJuIG5hdmlnYXRpb25LZXkoYSkubG9jYWxlQ29tcGFyZShuYXZpZ2F0aW9uS2V5KGIpKTtcbiAgICBjYXNlIFwiYWdlXCI6XG4gICAgICAvLyBSZXZlcnNlIGFscGhhYmV0aWNhbCBmb3IgYWdlIGJ1Y2tldHMgKFRvZGF5IDwgWWVzdGVyZGF5KSwgcm91Z2ggYXBwcm94XG4gICAgICByZXR1cm4gKGdyb3VwaW5nS2V5KGEsIFwiYWdlXCIpIHx8IFwiXCIpLmxvY2FsZUNvbXBhcmUoZ3JvdXBpbmdLZXkoYiwgXCJhZ2VcIikgfHwgXCJcIik7XG4gICAgZGVmYXVsdDpcbiAgICAgIC8vIENoZWNrIGlmIGl0J3MgYSBnZW5lcmljIGZpZWxkIGZpcnN0XG4gICAgICBjb25zdCB2YWxBID0gZ2V0RmllbGRWYWx1ZShhLCBzdHJhdGVneSk7XG4gICAgICBjb25zdCB2YWxCID0gZ2V0RmllbGRWYWx1ZShiLCBzdHJhdGVneSk7XG5cbiAgICAgIGlmICh2YWxBICE9PSB1bmRlZmluZWQgJiYgdmFsQiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgaWYgKHZhbEEgPCB2YWxCKSByZXR1cm4gLTE7XG4gICAgICAgICAgaWYgKHZhbEEgPiB2YWxCKSByZXR1cm4gMTtcbiAgICAgICAgICByZXR1cm4gMDtcbiAgICAgIH1cblxuICAgICAgLy8gRmFsbGJhY2sgZm9yIGN1c3RvbSBzdHJhdGVnaWVzIGdyb3VwaW5nIGtleSAoaWYgdXNpbmcgY3VzdG9tIHN0cmF0ZWd5IGFzIHNvcnRpbmcgYnV0IG5vIHNvcnRpbmcgcnVsZXMgZGVmaW5lZClcbiAgICAgIC8vIG9yIHVuaGFuZGxlZCBidWlsdC1pbnNcbiAgICAgIHJldHVybiAoZ3JvdXBpbmdLZXkoYSwgc3RyYXRlZ3kpIHx8IFwiXCIpLmxvY2FsZUNvbXBhcmUoZ3JvdXBpbmdLZXkoYiwgc3RyYXRlZ3kpIHx8IFwiXCIpO1xuICB9XG59O1xuIiwgImltcG9ydCB7IFRhYkdyb3VwLCBUYWJNZXRhZGF0YSwgUHJlZmVyZW5jZXMgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBtYXBDaHJvbWVUYWIsIGdldFN0b3JlZFByZWZlcmVuY2VzIH0gZnJvbSBcIi4uL3NoYXJlZC91dGlscy5qc1wiO1xuaW1wb3J0IHsgc2V0Q3VzdG9tU3RyYXRlZ2llcyB9IGZyb20gXCIuLi9iYWNrZ3JvdW5kL2dyb3VwaW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgc29ydFRhYnMgfSBmcm9tIFwiLi4vYmFja2dyb3VuZC9zb3J0aW5nU3RyYXRlZ2llcy5qc1wiO1xuXG5jb25zdCBkZWZhdWx0UHJlZmVyZW5jZXM6IFByZWZlcmVuY2VzID0ge1xuICBzb3J0aW5nOiBbXCJwaW5uZWRcIiwgXCJyZWNlbmN5XCJdLFxuICBkZWJ1ZzogZmFsc2UsXG4gIHRoZW1lOiBcImRhcmtcIixcbiAgY3VzdG9tR2VuZXJhOiB7fVxufTtcblxuZXhwb3J0IGNvbnN0IGZldGNoTG9jYWxTdGF0ZSA9IGFzeW5jICgpID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBbdGFicywgZ3JvdXBzLCBwcmVmc10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICBjaHJvbWUudGFicy5xdWVyeSh7fSksXG4gICAgICBjaHJvbWUudGFiR3JvdXBzLnF1ZXJ5KHt9KSxcbiAgICAgIGdldFN0b3JlZFByZWZlcmVuY2VzKClcbiAgICBdKTtcblxuICAgIGNvbnN0IHByZWZlcmVuY2VzID0gcHJlZnMgfHwgZGVmYXVsdFByZWZlcmVuY2VzO1xuXG4gICAgLy8gSW5pdGlhbGl6ZSBjdXN0b20gc3RyYXRlZ2llcyBmb3Igc29ydGluZ1xuICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMocHJlZmVyZW5jZXMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXSk7XG5cbiAgICBjb25zdCBncm91cE1hcCA9IG5ldyBNYXAoZ3JvdXBzLm1hcChnID0+IFtnLmlkLCBnXSkpO1xuICAgIGNvbnN0IG1hcHBlZCA9IHRhYnMubWFwKG1hcENocm9tZVRhYikuZmlsdGVyKCh0KTogdCBpcyBUYWJNZXRhZGF0YSA9PiBCb29sZWFuKHQpKTtcblxuICAgIGNvbnN0IHJlc3VsdEdyb3VwczogVGFiR3JvdXBbXSA9IFtdO1xuICAgIGNvbnN0IHRhYnNCeUdyb3VwSWQgPSBuZXcgTWFwPG51bWJlciwgVGFiTWV0YWRhdGFbXT4oKTtcbiAgICBjb25zdCB0YWJzQnlXaW5kb3dVbmdyb3VwZWQgPSBuZXcgTWFwPG51bWJlciwgVGFiTWV0YWRhdGFbXT4oKTtcblxuICAgIG1hcHBlZC5mb3JFYWNoKHRhYiA9PiB7XG4gICAgICAgIGNvbnN0IGdyb3VwSWQgPSB0YWIuZ3JvdXBJZCA/PyAtMTtcbiAgICAgICAgaWYgKGdyb3VwSWQgIT09IC0xKSB7XG4gICAgICAgICAgICBpZiAoIXRhYnNCeUdyb3VwSWQuaGFzKGdyb3VwSWQpKSB0YWJzQnlHcm91cElkLnNldChncm91cElkLCBbXSk7XG4gICAgICAgICAgICB0YWJzQnlHcm91cElkLmdldChncm91cElkKSEucHVzaCh0YWIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgIGlmICghdGFic0J5V2luZG93VW5ncm91cGVkLmhhcyh0YWIud2luZG93SWQpKSB0YWJzQnlXaW5kb3dVbmdyb3VwZWQuc2V0KHRhYi53aW5kb3dJZCwgW10pO1xuICAgICAgICAgICAgIHRhYnNCeVdpbmRvd1VuZ3JvdXBlZC5nZXQodGFiLndpbmRvd0lkKSEucHVzaCh0YWIpO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgVGFiR3JvdXAgb2JqZWN0cyBmb3IgYWN0dWFsIGdyb3Vwc1xuICAgIGZvciAoY29uc3QgW2dyb3VwSWQsIGdyb3VwVGFic10gb2YgdGFic0J5R3JvdXBJZCkge1xuICAgICAgICBjb25zdCBicm93c2VyR3JvdXAgPSBncm91cE1hcC5nZXQoZ3JvdXBJZCk7XG4gICAgICAgIGlmIChicm93c2VyR3JvdXApIHtcbiAgICAgICAgICAgIHJlc3VsdEdyb3Vwcy5wdXNoKHtcbiAgICAgICAgICAgICAgICBpZDogYGdyb3VwLSR7Z3JvdXBJZH1gLFxuICAgICAgICAgICAgICAgIHdpbmRvd0lkOiBicm93c2VyR3JvdXAud2luZG93SWQsXG4gICAgICAgICAgICAgICAgbGFiZWw6IGJyb3dzZXJHcm91cC50aXRsZSB8fCBcIlVudGl0bGVkIEdyb3VwXCIsXG4gICAgICAgICAgICAgICAgY29sb3I6IGJyb3dzZXJHcm91cC5jb2xvcixcbiAgICAgICAgICAgICAgICB0YWJzOiBzb3J0VGFicyhncm91cFRhYnMsIHByZWZlcmVuY2VzLnNvcnRpbmcpLFxuICAgICAgICAgICAgICAgIHJlYXNvbjogXCJNYW51YWxcIlxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBIYW5kbGUgdW5ncm91cGVkIHRhYnNcbiAgICBmb3IgKGNvbnN0IFt3aW5kb3dJZCwgdGFic10gb2YgdGFic0J5V2luZG93VW5ncm91cGVkKSB7XG4gICAgICAgIHJlc3VsdEdyb3Vwcy5wdXNoKHtcbiAgICAgICAgICAgIGlkOiBgdW5ncm91cGVkLSR7d2luZG93SWR9YCxcbiAgICAgICAgICAgIHdpbmRvd0lkOiB3aW5kb3dJZCxcbiAgICAgICAgICAgIGxhYmVsOiBcIlVuZ3JvdXBlZFwiLFxuICAgICAgICAgICAgY29sb3I6IFwiZ3JleVwiLFxuICAgICAgICAgICAgdGFiczogc29ydFRhYnModGFicywgcHJlZmVyZW5jZXMuc29ydGluZyksXG4gICAgICAgICAgICByZWFzb246IFwiVW5ncm91cGVkXCJcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc29sZS53YXJuKFwiRmV0Y2hlZCBsb2NhbCBzdGF0ZSAoZmFsbGJhY2spXCIpO1xuICAgIHJldHVybiB7IG9rOiB0cnVlLCBkYXRhOiB7IGdyb3VwczogcmVzdWx0R3JvdXBzLCBwcmVmZXJlbmNlcyB9IH07XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBjb25zb2xlLmVycm9yKFwiTG9jYWwgc3RhdGUgZmV0Y2ggZmFpbGVkOlwiLCBlKTtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBTdHJpbmcoZSkgfTtcbiAgfVxufTtcbiIsICJpbXBvcnQge1xuICBBcHBseUdyb3VwaW5nUGF5bG9hZCxcbiAgR3JvdXBpbmdTZWxlY3Rpb24sXG4gIFByZWZlcmVuY2VzLFxuICBSdW50aW1lTWVzc2FnZSxcbiAgUnVudGltZVJlc3BvbnNlLFxuICBTYXZlZFN0YXRlLFxuICBTb3J0aW5nU3RyYXRlZ3ksXG4gIFRhYkdyb3VwLFxuICBUYWJNZXRhZGF0YVxufSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBmZXRjaExvY2FsU3RhdGUgfSBmcm9tIFwiLi9sb2NhbFN0YXRlLmpzXCI7XG5cbmV4cG9ydCBjb25zdCBzZW5kTWVzc2FnZSA9IGFzeW5jIDxURGF0YT4odHlwZTogUnVudGltZU1lc3NhZ2VbXCJ0eXBlXCJdLCBwYXlsb2FkPzogYW55KTogUHJvbWlzZTxSdW50aW1lUmVzcG9uc2U8VERhdGE+PiA9PiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZSwgcGF5bG9hZCB9LCAocmVzcG9uc2UpID0+IHtcbiAgICAgIGlmIChjaHJvbWUucnVudGltZS5sYXN0RXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIlJ1bnRpbWUgZXJyb3I6XCIsIGNocm9tZS5ydW50aW1lLmxhc3RFcnJvcik7XG4gICAgICAgIHJlc29sdmUoeyBvazogZmFsc2UsIGVycm9yOiBjaHJvbWUucnVudGltZS5sYXN0RXJyb3IubWVzc2FnZSB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc29sdmUocmVzcG9uc2UgfHwgeyBvazogZmFsc2UsIGVycm9yOiBcIk5vIHJlc3BvbnNlIGZyb20gYmFja2dyb3VuZFwiIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICB9KTtcbn07XG5cbmV4cG9ydCB0eXBlIFRhYldpdGhHcm91cCA9IFRhYk1ldGFkYXRhICYge1xuICBncm91cExhYmVsPzogc3RyaW5nO1xuICBncm91cENvbG9yPzogc3RyaW5nO1xuICByZWFzb24/OiBzdHJpbmc7XG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFdpbmRvd1ZpZXcge1xuICBpZDogbnVtYmVyO1xuICB0aXRsZTogc3RyaW5nO1xuICB0YWJzOiBUYWJXaXRoR3JvdXBbXTtcbiAgdGFiQ291bnQ6IG51bWJlcjtcbiAgZ3JvdXBDb3VudDogbnVtYmVyO1xuICBwaW5uZWRDb3VudDogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgSUNPTlMgPSB7XG4gIGFjdGl2ZTogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwb2x5Z29uIHBvaW50cz1cIjMgMTEgMjIgMiAxMyAyMSAxMSAxMyAzIDExXCI+PC9wb2x5Z29uPjwvc3ZnPmAsXG4gIGhpZGU6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cGF0aCBkPVwiTTE3Ljk0IDE3Ljk0QTEwLjA3IDEwLjA3IDAgMCAxIDEyIDIwYy03IDAtMTEtOC0xMS04YTE4LjQ1IDE4LjQ1IDAgMCAxIDUuMDYtNS45NE05LjkgNC4yNEE5LjEyIDkuMTIgMCAwIDEgMTIgNGM3IDAgMTEgOCAxMSA4YTE4LjUgMTguNSAwIDAgMS0yLjE2IDMuMTltLTYuNzItMS4wN2EzIDMgMCAxIDEtNC4yNC00LjI0XCI+PC9wYXRoPjxsaW5lIHgxPVwiMVwiIHkxPVwiMVwiIHgyPVwiMjNcIiB5Mj1cIjIzXCI+PC9saW5lPjwvc3ZnPmAsXG4gIHNob3c6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cGF0aCBkPVwiTTEgMTJzNC04IDExLTggMTEgOCAxMSA4LTQgOC0xMSA4LTExLTgtMTEtOC0xMS04elwiPjwvcGF0aD48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjNcIj48L2NpcmNsZT48L3N2Zz5gLFxuICBmb2N1czogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxjaXJjbGUgY3g9XCIxMlwiIGN5PVwiMTJcIiByPVwiMTBcIj48L2NpcmNsZT48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjZcIj48L2NpcmNsZT48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjJcIj48L2NpcmNsZT48L3N2Zz5gLFxuICBjbG9zZTogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxsaW5lIHgxPVwiMThcIiB5MT1cIjZcIiB4Mj1cIjZcIiB5Mj1cIjE4XCI+PC9saW5lPjxsaW5lIHgxPVwiNlwiIHkxPVwiNlwiIHgyPVwiMThcIiB5Mj1cIjE4XCI+PC9saW5lPjwvc3ZnPmAsXG4gIHVuZ3JvdXA6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjEwXCI+PC9jaXJjbGU+PGxpbmUgeDE9XCI4XCIgeTE9XCIxMlwiIHgyPVwiMTZcIiB5Mj1cIjEyXCI+PC9saW5lPjwvc3ZnPmAsXG4gIGRlZmF1bHRGaWxlOiBgPHN2ZyB3aWR0aD1cIjI0XCIgaGVpZ2h0PVwiMjRcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBhdGggZD1cIk0xNCAySDZhMiAyIDAgMCAwLTIgMnYxNmEyIDIgMCAwIDAgMiAyaDEyYTIgMiAwIDAgMCAyLTJWOHpcIj48L3BhdGg+PHBvbHlsaW5lIHBvaW50cz1cIjE0IDIgMTQgOCAyMCA4XCI+PC9wb2x5bGluZT48bGluZSB4MT1cIjE2XCIgeTE9XCIxM1wiIHgyPVwiOFwiIHkyPVwiMTNcIj48L2xpbmU+PGxpbmUgeDE9XCIxNlwiIHkxPVwiMTdcIiB4Mj1cIjhcIiB5Mj1cIjE3XCI+PC9saW5lPjxwb2x5bGluZSBwb2ludHM9XCIxMCA5IDkgOSA4IDlcIj48L3BvbHlsaW5lPjwvc3ZnPmAsXG4gIGF1dG9SdW46IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cG9seWdvbiBwb2ludHM9XCIxMyAyIDMgMTQgMTIgMTQgMTEgMjIgMjEgMTAgMTIgMTAgMTMgMlwiPjwvcG9seWdvbj48L3N2Zz5gXG59O1xuXG5leHBvcnQgY29uc3QgR1JPVVBfQ09MT1JTOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICBncmV5OiBcIiM2NDc0OGJcIixcbiAgYmx1ZTogXCIjM2I4MmY2XCIsXG4gIHJlZDogXCIjZWY0NDQ0XCIsXG4gIHllbGxvdzogXCIjZWFiMzA4XCIsXG4gIGdyZWVuOiBcIiMyMmM1NWVcIixcbiAgcGluazogXCIjZWM0ODk5XCIsXG4gIHB1cnBsZTogXCIjYTg1NWY3XCIsXG4gIGN5YW46IFwiIzA2YjZkNFwiLFxuICBvcmFuZ2U6IFwiI2Y5NzMxNlwiXG59O1xuXG5leHBvcnQgY29uc3QgZ2V0R3JvdXBDb2xvciA9IChuYW1lOiBzdHJpbmcpID0+IEdST1VQX0NPTE9SU1tuYW1lXSB8fCBcIiNjYmQ1ZTFcIjtcblxuZXhwb3J0IGNvbnN0IGZldGNoU3RhdGUgPSBhc3luYyAoKSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBzZW5kTWVzc2FnZTx7IGdyb3VwczogVGFiR3JvdXBbXTsgcHJlZmVyZW5jZXM6IFByZWZlcmVuY2VzIH0+KFwiZ2V0U3RhdGVcIik7XG4gICAgaWYgKHJlc3BvbnNlLm9rICYmIHJlc3BvbnNlLmRhdGEpIHtcbiAgICAgIHJldHVybiByZXNwb25zZTtcbiAgICB9XG4gICAgY29uc29sZS53YXJuKFwiZmV0Y2hTdGF0ZSBmYWlsZWQsIHVzaW5nIGZhbGxiYWNrOlwiLCByZXNwb25zZS5lcnJvcik7XG4gICAgcmV0dXJuIGF3YWl0IGZldGNoTG9jYWxTdGF0ZSgpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgY29uc29sZS53YXJuKFwiZmV0Y2hTdGF0ZSB0aHJldyBleGNlcHRpb24sIHVzaW5nIGZhbGxiYWNrOlwiLCBlKTtcbiAgICByZXR1cm4gYXdhaXQgZmV0Y2hMb2NhbFN0YXRlKCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBhcHBseUdyb3VwaW5nID0gYXN5bmMgKHBheWxvYWQ6IEFwcGx5R3JvdXBpbmdQYXlsb2FkKSA9PiB7XG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImFwcGx5R3JvdXBpbmdcIiwgcGF5bG9hZCB9KTtcbiAgcmV0dXJuIHJlc3BvbnNlIGFzIFJ1bnRpbWVSZXNwb25zZTx1bmtub3duPjtcbn07XG5cbmV4cG9ydCBjb25zdCBhcHBseVNvcnRpbmcgPSBhc3luYyAocGF5bG9hZDogQXBwbHlHcm91cGluZ1BheWxvYWQpID0+IHtcbiAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6IFwiYXBwbHlTb3J0aW5nXCIsIHBheWxvYWQgfSk7XG4gIHJldHVybiByZXNwb25zZSBhcyBSdW50aW1lUmVzcG9uc2U8dW5rbm93bj47XG59O1xuXG5leHBvcnQgY29uc3QgbWFwV2luZG93cyA9IChncm91cHM6IFRhYkdyb3VwW10sIHdpbmRvd1RpdGxlczogTWFwPG51bWJlciwgc3RyaW5nPik6IFdpbmRvd1ZpZXdbXSA9PiB7XG4gIGNvbnN0IHdpbmRvd3MgPSBuZXcgTWFwPG51bWJlciwgVGFiV2l0aEdyb3VwW10+KCk7XG5cbiAgZ3JvdXBzLmZvckVhY2goKGdyb3VwKSA9PiB7XG4gICAgY29uc3QgaXNVbmdyb3VwZWQgPSBncm91cC5yZWFzb24gPT09IFwiVW5ncm91cGVkXCI7XG4gICAgZ3JvdXAudGFicy5mb3JFYWNoKCh0YWIpID0+IHtcbiAgICAgIGNvbnN0IGRlY29yYXRlZDogVGFiV2l0aEdyb3VwID0ge1xuICAgICAgICAuLi50YWIsXG4gICAgICAgIGdyb3VwTGFiZWw6IGlzVW5ncm91cGVkID8gdW5kZWZpbmVkIDogZ3JvdXAubGFiZWwsXG4gICAgICAgIGdyb3VwQ29sb3I6IGlzVW5ncm91cGVkID8gdW5kZWZpbmVkIDogZ3JvdXAuY29sb3IsXG4gICAgICAgIHJlYXNvbjogZ3JvdXAucmVhc29uXG4gICAgICB9O1xuICAgICAgY29uc3QgZXhpc3RpbmcgPSB3aW5kb3dzLmdldCh0YWIud2luZG93SWQpID8/IFtdO1xuICAgICAgZXhpc3RpbmcucHVzaChkZWNvcmF0ZWQpO1xuICAgICAgd2luZG93cy5zZXQodGFiLndpbmRvd0lkLCBleGlzdGluZyk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIHJldHVybiBBcnJheS5mcm9tKHdpbmRvd3MuZW50cmllcygpKVxuICAgIC5tYXA8V2luZG93Vmlldz4oKFtpZCwgdGFic10pID0+IHtcbiAgICAgIGNvbnN0IGdyb3VwQ291bnQgPSBuZXcgU2V0KHRhYnMubWFwKCh0YWIpID0+IHRhYi5ncm91cExhYmVsKS5maWx0ZXIoKGwpOiBsIGlzIHN0cmluZyA9PiAhIWwpKS5zaXplO1xuICAgICAgY29uc3QgcGlubmVkQ291bnQgPSB0YWJzLmZpbHRlcigodGFiKSA9PiB0YWIucGlubmVkKS5sZW5ndGg7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBpZCxcbiAgICAgICAgdGl0bGU6IHdpbmRvd1RpdGxlcy5nZXQoaWQpID8/IGBXaW5kb3cgJHtpZH1gLFxuICAgICAgICB0YWJzLFxuICAgICAgICB0YWJDb3VudDogdGFicy5sZW5ndGgsXG4gICAgICAgIGdyb3VwQ291bnQsXG4gICAgICAgIHBpbm5lZENvdW50XG4gICAgICB9O1xuICAgIH0pXG4gICAgLnNvcnQoKGEsIGIpID0+IGEuaWQgLSBiLmlkKTtcbn07XG5cbmV4cG9ydCBjb25zdCBmb3JtYXREb21haW4gPSAodXJsOiBzdHJpbmcpID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBwYXJzZWQgPSBuZXcgVVJMKHVybCk7XG4gICAgcmV0dXJuIHBhcnNlZC5ob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgXCJcIik7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgcmV0dXJuIHVybDtcbiAgfVxufTtcbiIsICJpbXBvcnQge1xuICBHcm91cGluZ1NlbGVjdGlvbixcbiAgUHJlZmVyZW5jZXMsXG4gIFNhdmVkU3RhdGUsXG4gIFNvcnRpbmdTdHJhdGVneSxcbiAgTG9nTGV2ZWwsXG4gIFRhYkdyb3VwXG59IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7XG4gIGFwcGx5R3JvdXBpbmcsXG4gIGFwcGx5U29ydGluZyxcbiAgZmV0Y2hTdGF0ZSxcbiAgSUNPTlMsXG4gIG1hcFdpbmRvd3MsXG4gIHNlbmRNZXNzYWdlLFxuICBUYWJXaXRoR3JvdXAsXG4gIFdpbmRvd1ZpZXcsXG4gIEdST1VQX0NPTE9SU1xufSBmcm9tIFwiLi9jb21tb24uanNcIjtcbmltcG9ydCB7IGdldFN0cmF0ZWdpZXMsIFNUUkFURUdJRVMsIFN0cmF0ZWd5RGVmaW5pdGlvbiB9IGZyb20gXCIuLi9zaGFyZWQvc3RyYXRlZ3lSZWdpc3RyeS5qc1wiO1xuaW1wb3J0IHsgc2V0TG9nZ2VyUHJlZmVyZW5jZXMsIGxvZ0RlYnVnLCBsb2dJbmZvIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGZldGNoTG9jYWxTdGF0ZSB9IGZyb20gXCIuL2xvY2FsU3RhdGUuanNcIjtcblxuLy8gRWxlbWVudHNcbmNvbnN0IHNlYXJjaElucHV0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ0YWJTZWFyY2hcIikgYXMgSFRNTElucHV0RWxlbWVudDtcbmNvbnN0IHdpbmRvd3NDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIndpbmRvd3NcIikgYXMgSFRNTERpdkVsZW1lbnQ7XG5cbmNvbnN0IHNlbGVjdEFsbENoZWNrYm94ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzZWxlY3RBbGxcIikgYXMgSFRNTElucHV0RWxlbWVudDtcbmNvbnN0IGJ0bkFwcGx5ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5BcHBseVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcbmNvbnN0IGJ0blVuZ3JvdXAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0blVuZ3JvdXBcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5jb25zdCBidG5NZXJnZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuTWVyZ2VcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5jb25zdCBidG5TcGxpdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuU3BsaXRcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5jb25zdCBidG5FeHBhbmRBbGwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0bkV4cGFuZEFsbFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcbmNvbnN0IGJ0bkNvbGxhcHNlQWxsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5Db2xsYXBzZUFsbFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcblxuY29uc3QgYWN0aXZlU3RyYXRlZ2llc0xpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImFjdGl2ZVN0cmF0ZWdpZXNMaXN0XCIpIGFzIEhUTUxEaXZFbGVtZW50O1xuY29uc3QgYWRkU3RyYXRlZ3lTZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImFkZFN0cmF0ZWd5U2VsZWN0XCIpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuXG4vLyBTdGF0c1xuY29uc3Qgc3RhdFRhYnMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInN0YXRUYWJzXCIpIGFzIEhUTUxFbGVtZW50O1xuY29uc3Qgc3RhdEdyb3VwcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3RhdEdyb3Vwc1wiKSBhcyBIVE1MRWxlbWVudDtcbmNvbnN0IHN0YXRXaW5kb3dzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzdGF0V2luZG93c1wiKSBhcyBIVE1MRWxlbWVudDtcblxuY29uc3QgcHJvZ3Jlc3NPdmVybGF5ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJwcm9ncmVzc092ZXJsYXlcIikgYXMgSFRNTERpdkVsZW1lbnQ7XG5jb25zdCBwcm9ncmVzc1RleHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInByb2dyZXNzVGV4dFwiKSBhcyBIVE1MRGl2RWxlbWVudDtcbmNvbnN0IHByb2dyZXNzQ291bnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInByb2dyZXNzQ291bnRcIikgYXMgSFRNTERpdkVsZW1lbnQ7XG5cbmNvbnN0IHNob3dMb2FkaW5nID0gKHRleHQ6IHN0cmluZykgPT4ge1xuICAgIGlmIChwcm9ncmVzc092ZXJsYXkpIHtcbiAgICAgICAgcHJvZ3Jlc3NUZXh0LnRleHRDb250ZW50ID0gdGV4dDtcbiAgICAgICAgcHJvZ3Jlc3NDb3VudC50ZXh0Q29udGVudCA9IFwiXCI7XG4gICAgICAgIHByb2dyZXNzT3ZlcmxheS5jbGFzc0xpc3QucmVtb3ZlKFwiaGlkZGVuXCIpO1xuICAgIH1cbn07XG5cbmNvbnN0IGhpZGVMb2FkaW5nID0gKCkgPT4ge1xuICAgIGlmIChwcm9ncmVzc092ZXJsYXkpIHtcbiAgICAgICAgcHJvZ3Jlc3NPdmVybGF5LmNsYXNzTGlzdC5hZGQoXCJoaWRkZW5cIik7XG4gICAgfVxufTtcblxuY29uc3QgdXBkYXRlUHJvZ3Jlc3MgPSAoY29tcGxldGVkOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+IHtcbiAgICBpZiAocHJvZ3Jlc3NPdmVybGF5ICYmICFwcm9ncmVzc092ZXJsYXkuY2xhc3NMaXN0LmNvbnRhaW5zKFwiaGlkZGVuXCIpKSB7XG4gICAgICAgIHByb2dyZXNzQ291bnQudGV4dENvbnRlbnQgPSBgJHtjb21wbGV0ZWR9IC8gJHt0b3RhbH1gO1xuICAgIH1cbn07XG5cbmxldCB3aW5kb3dTdGF0ZTogV2luZG93Vmlld1tdID0gW107XG5sZXQgZm9jdXNlZFdpbmRvd0lkOiBudW1iZXIgfCBudWxsID0gbnVsbDtcbmNvbnN0IHNlbGVjdGVkVGFicyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xubGV0IGluaXRpYWxTZWxlY3Rpb25Eb25lID0gZmFsc2U7XG5sZXQgcHJlZmVyZW5jZXM6IFByZWZlcmVuY2VzIHwgbnVsbCA9IG51bGw7XG5cbi8vIFRyZWUgU3RhdGVcbmNvbnN0IGV4cGFuZGVkTm9kZXMgPSBuZXcgU2V0PHN0cmluZz4oKTsgLy8gRGVmYXVsdCBlbXB0eSA9IGFsbCBjb2xsYXBzZWRcbmNvbnN0IFRSRUVfSUNPTlMgPSB7XG4gIGNoZXZyb25SaWdodDogYDxzdmcgd2lkdGg9XCIxMDAlXCIgaGVpZ2h0PVwiMTAwJVwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cG9seWxpbmUgcG9pbnRzPVwiOSAxOCAxNSAxMiA5IDZcIj48L3BvbHlsaW5lPjwvc3ZnPmAsXG4gIGZvbGRlcjogYDxzdmcgd2lkdGg9XCIxMDAlXCIgaGVpZ2h0PVwiMTAwJVwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cGF0aCBkPVwiTTIyIDE5YTIgMiAwIDAgMS0yIDJINGEyIDIgMCAwIDEtMi0yVjVhMiAyIDAgMCAxIDItMmg1bDIgM2g5YTIgMiAwIDAgMSAyIDJ6XCI+PC9wYXRoPjwvc3ZnPmBcbn07XG5cbmNvbnN0IGhleFRvUmdiYSA9IChoZXg6IHN0cmluZywgYWxwaGE6IG51bWJlcikgPT4ge1xuICAgIC8vIEVuc3VyZSBoZXggZm9ybWF0XG4gICAgaWYgKCFoZXguc3RhcnRzV2l0aCgnIycpKSByZXR1cm4gaGV4O1xuICAgIGNvbnN0IHIgPSBwYXJzZUludChoZXguc2xpY2UoMSwgMyksIDE2KTtcbiAgICBjb25zdCBnID0gcGFyc2VJbnQoaGV4LnNsaWNlKDMsIDUpLCAxNik7XG4gICAgY29uc3QgYiA9IHBhcnNlSW50KGhleC5zbGljZSg1LCA3KSwgMTYpO1xuICAgIHJldHVybiBgcmdiYSgke3J9LCAke2d9LCAke2J9LCAke2FscGhhfSlgO1xufTtcblxuY29uc3QgdXBkYXRlU3RhdHMgPSAoKSA9PiB7XG4gIGNvbnN0IHRvdGFsVGFicyA9IHdpbmRvd1N0YXRlLnJlZHVjZSgoYWNjLCB3aW4pID0+IGFjYyArIHdpbi50YWJDb3VudCwgMCk7XG4gIGNvbnN0IHRvdGFsR3JvdXBzID0gbmV3IFNldCh3aW5kb3dTdGF0ZS5mbGF0TWFwKHcgPT4gdy50YWJzLmZpbHRlcih0ID0+IHQuZ3JvdXBMYWJlbCkubWFwKHQgPT4gYCR7dy5pZH0tJHt0Lmdyb3VwTGFiZWx9YCkpKS5zaXplO1xuXG4gIHN0YXRUYWJzLnRleHRDb250ZW50ID0gYCR7dG90YWxUYWJzfSBUYWJzYDtcbiAgc3RhdEdyb3Vwcy50ZXh0Q29udGVudCA9IGAke3RvdGFsR3JvdXBzfSBHcm91cHNgO1xuICBzdGF0V2luZG93cy50ZXh0Q29udGVudCA9IGAke3dpbmRvd1N0YXRlLmxlbmd0aH0gV2luZG93c2A7XG5cbiAgLy8gVXBkYXRlIHNlbGVjdGlvbiBidXR0b25zXG4gIGNvbnN0IGhhc1NlbGVjdGlvbiA9IHNlbGVjdGVkVGFicy5zaXplID4gMDtcbiAgYnRuVW5ncm91cC5kaXNhYmxlZCA9ICFoYXNTZWxlY3Rpb247XG4gIGJ0bk1lcmdlLmRpc2FibGVkID0gIWhhc1NlbGVjdGlvbjtcbiAgYnRuU3BsaXQuZGlzYWJsZWQgPSAhaGFzU2VsZWN0aW9uO1xuXG4gIGJ0blVuZ3JvdXAuc3R5bGUub3BhY2l0eSA9IGhhc1NlbGVjdGlvbiA/IFwiMVwiIDogXCIwLjVcIjtcbiAgYnRuTWVyZ2Uuc3R5bGUub3BhY2l0eSA9IGhhc1NlbGVjdGlvbiA/IFwiMVwiIDogXCIwLjVcIjtcbiAgYnRuU3BsaXQuc3R5bGUub3BhY2l0eSA9IGhhc1NlbGVjdGlvbiA/IFwiMVwiIDogXCIwLjVcIjtcblxuICAvLyBVcGRhdGUgU2VsZWN0IEFsbCBDaGVja2JveCBTdGF0ZVxuICBpZiAodG90YWxUYWJzID09PSAwKSB7XG4gICAgc2VsZWN0QWxsQ2hlY2tib3guY2hlY2tlZCA9IGZhbHNlO1xuICAgIHNlbGVjdEFsbENoZWNrYm94LmluZGV0ZXJtaW5hdGUgPSBmYWxzZTtcbiAgfSBlbHNlIGlmIChzZWxlY3RlZFRhYnMuc2l6ZSA9PT0gdG90YWxUYWJzKSB7XG4gICAgc2VsZWN0QWxsQ2hlY2tib3guY2hlY2tlZCA9IHRydWU7XG4gICAgc2VsZWN0QWxsQ2hlY2tib3guaW5kZXRlcm1pbmF0ZSA9IGZhbHNlO1xuICB9IGVsc2UgaWYgKHNlbGVjdGVkVGFicy5zaXplID4gMCkge1xuICAgIHNlbGVjdEFsbENoZWNrYm94LmNoZWNrZWQgPSBmYWxzZTtcbiAgICBzZWxlY3RBbGxDaGVja2JveC5pbmRldGVybWluYXRlID0gdHJ1ZTtcbiAgfSBlbHNlIHtcbiAgICBzZWxlY3RBbGxDaGVja2JveC5jaGVja2VkID0gZmFsc2U7XG4gICAgc2VsZWN0QWxsQ2hlY2tib3guaW5kZXRlcm1pbmF0ZSA9IGZhbHNlO1xuICB9XG59O1xuXG5jb25zdCBjcmVhdGVOb2RlID0gKFxuICAgIGNvbnRlbnQ6IEhUTUxFbGVtZW50LFxuICAgIGNoaWxkcmVuQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IG51bGwsXG4gICAgbGV2ZWw6ICd3aW5kb3cnIHwgJ2dyb3VwJyB8ICd0YWInLFxuICAgIGlzRXhwYW5kZWQ6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICBvblRvZ2dsZT86ICgpID0+IHZvaWRcbikgPT4ge1xuICAgIGNvbnN0IG5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIG5vZGUuY2xhc3NOYW1lID0gYHRyZWUtbm9kZSBub2RlLSR7bGV2ZWx9YDtcblxuICAgIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgcm93LmNsYXNzTmFtZSA9IGB0cmVlLXJvdyAke2xldmVsfS1yb3dgO1xuXG4gICAgLy8gVG9nZ2xlXG4gICAgY29uc3QgdG9nZ2xlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICB0b2dnbGUuY2xhc3NOYW1lID0gYHRyZWUtdG9nZ2xlICR7aXNFeHBhbmRlZCA/ICdyb3RhdGVkJyA6ICcnfWA7XG4gICAgaWYgKGNoaWxkcmVuQ29udGFpbmVyKSB7XG4gICAgICAgIHRvZ2dsZS5pbm5lckhUTUwgPSBUUkVFX0lDT05TLmNoZXZyb25SaWdodDtcbiAgICAgICAgdG9nZ2xlLm9uY2xpY2sgPSAoZSkgPT4ge1xuICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgIGlmIChvblRvZ2dsZSkgb25Ub2dnbGUoKTtcbiAgICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB0b2dnbGUuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG4gICAgfVxuXG4gICAgcm93LmFwcGVuZENoaWxkKHRvZ2dsZSk7XG4gICAgcm93LmFwcGVuZENoaWxkKGNvbnRlbnQpOyAvLyBDb250ZW50IGhhbmRsZXMgY2hlY2tib3ggKyBpY29uICsgdGV4dCArIGFjdGlvbnNcblxuICAgIG5vZGUuYXBwZW5kQ2hpbGQocm93KTtcblxuICAgIGlmIChjaGlsZHJlbkNvbnRhaW5lcikge1xuICAgICAgICBjaGlsZHJlbkNvbnRhaW5lci5jbGFzc05hbWUgPSBgdHJlZS1jaGlsZHJlbiAke2lzRXhwYW5kZWQgPyAnZXhwYW5kZWQnIDogJyd9YDtcbiAgICAgICAgbm9kZS5hcHBlbmRDaGlsZChjaGlsZHJlbkNvbnRhaW5lcik7XG4gICAgfVxuXG4gICAgLy8gVG9nZ2xlIGludGVyYWN0aW9uIG9uIHJvdyBjbGljayBmb3IgV2luZG93cyBhbmQgR3JvdXBzXG4gICAgaWYgKGNoaWxkcmVuQ29udGFpbmVyICYmIGxldmVsICE9PSAndGFiJykge1xuICAgICAgICByb3cuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgICAgICAgICAgLy8gQXZvaWQgdG9nZ2xpbmcgaWYgY2xpY2tpbmcgYWN0aW9ucyBvciBjaGVja2JveFxuICAgICAgICAgICAgaWYgKChlLnRhcmdldCBhcyBIVE1MRWxlbWVudCkuY2xvc2VzdCgnLmFjdGlvbi1idG4nKSB8fCAoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpLmNsb3Nlc3QoJy50cmVlLWNoZWNrYm94JykpIHJldHVybjtcbiAgICAgICAgICAgIGlmIChvblRvZ2dsZSkgb25Ub2dnbGUoKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgbm9kZSwgdG9nZ2xlLCBjaGlsZHJlbkNvbnRhaW5lciB9O1xufTtcblxuY29uc3QgcmVuZGVyVHJlZSA9ICgpID0+IHtcbiAgY29uc3QgcXVlcnkgPSBzZWFyY2hJbnB1dC52YWx1ZS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgd2luZG93c0NvbnRhaW5lci5pbm5lckhUTUwgPSBcIlwiO1xuXG4gIC8vIEZpbHRlciBMb2dpY1xuICBjb25zdCBmaWx0ZXJlZCA9IHdpbmRvd1N0YXRlXG4gICAgLm1hcCgod2luZG93KSA9PiB7XG4gICAgICBpZiAoIXF1ZXJ5KSByZXR1cm4geyB3aW5kb3csIHZpc2libGVUYWJzOiB3aW5kb3cudGFicyB9O1xuICAgICAgY29uc3QgdmlzaWJsZVRhYnMgPSB3aW5kb3cudGFicy5maWx0ZXIoXG4gICAgICAgICh0YWIpID0+IHRhYi50aXRsZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHF1ZXJ5KSB8fCB0YWIudXJsLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMocXVlcnkpXG4gICAgICApO1xuICAgICAgcmV0dXJuIHsgd2luZG93LCB2aXNpYmxlVGFicyB9O1xuICAgIH0pXG4gICAgLmZpbHRlcigoeyB2aXNpYmxlVGFicyB9KSA9PiB2aXNpYmxlVGFicy5sZW5ndGggPiAwIHx8ICFxdWVyeSk7XG5cbiAgZmlsdGVyZWQuZm9yRWFjaCgoeyB3aW5kb3csIHZpc2libGVUYWJzIH0pID0+IHtcbiAgICBjb25zdCB3aW5kb3dLZXkgPSBgdy0ke3dpbmRvdy5pZH1gO1xuICAgIGNvbnN0IGlzRXhwYW5kZWQgPSAhIXF1ZXJ5IHx8IGV4cGFuZGVkTm9kZXMuaGFzKHdpbmRvd0tleSk7XG5cbiAgICAvLyBXaW5kb3cgQ2hlY2tib3ggTG9naWNcbiAgICBjb25zdCBhbGxUYWJJZHMgPSB2aXNpYmxlVGFicy5tYXAodCA9PiB0LmlkKTtcbiAgICBjb25zdCBzZWxlY3RlZENvdW50ID0gYWxsVGFiSWRzLmZpbHRlcihpZCA9PiBzZWxlY3RlZFRhYnMuaGFzKGlkKSkubGVuZ3RoO1xuICAgIGNvbnN0IGlzQWxsID0gc2VsZWN0ZWRDb3VudCA9PT0gYWxsVGFiSWRzLmxlbmd0aCAmJiBhbGxUYWJJZHMubGVuZ3RoID4gMDtcbiAgICBjb25zdCBpc1NvbWUgPSBzZWxlY3RlZENvdW50ID4gMCAmJiBzZWxlY3RlZENvdW50IDwgYWxsVGFiSWRzLmxlbmd0aDtcblxuICAgIGNvbnN0IHdpbkNoZWNrYm94ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImlucHV0XCIpO1xuICAgIHdpbkNoZWNrYm94LnR5cGUgPSBcImNoZWNrYm94XCI7XG4gICAgd2luQ2hlY2tib3guY2xhc3NOYW1lID0gXCJ0cmVlLWNoZWNrYm94XCI7XG4gICAgd2luQ2hlY2tib3guY2hlY2tlZCA9IGlzQWxsO1xuICAgIHdpbkNoZWNrYm94LmluZGV0ZXJtaW5hdGUgPSBpc1NvbWU7XG4gICAgd2luQ2hlY2tib3gub25jbGljayA9IChlKSA9PiB7XG4gICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgIGNvbnN0IHRhcmdldFN0YXRlID0gIWlzQWxsOyAvLyBJZiBhbGwgd2VyZSBzZWxlY3RlZCwgZGVzZWxlY3QuIE90aGVyd2lzZSBzZWxlY3QgYWxsLlxuICAgICAgICBhbGxUYWJJZHMuZm9yRWFjaChpZCA9PiB7XG4gICAgICAgICAgICBpZiAodGFyZ2V0U3RhdGUpIHNlbGVjdGVkVGFicy5hZGQoaWQpO1xuICAgICAgICAgICAgZWxzZSBzZWxlY3RlZFRhYnMuZGVsZXRlKGlkKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJlbmRlclRyZWUoKTtcbiAgICB9O1xuXG4gICAgLy8gV2luZG93IENvbnRlbnRcbiAgICBjb25zdCB3aW5Db250ZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICB3aW5Db250ZW50LnN0eWxlLmRpc3BsYXkgPSBcImZsZXhcIjtcbiAgICB3aW5Db250ZW50LnN0eWxlLmFsaWduSXRlbXMgPSBcImNlbnRlclwiO1xuICAgIHdpbkNvbnRlbnQuc3R5bGUuZmxleCA9IFwiMVwiO1xuICAgIHdpbkNvbnRlbnQuc3R5bGUub3ZlcmZsb3cgPSBcImhpZGRlblwiO1xuXG4gICAgY29uc3QgbGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGxhYmVsLmNsYXNzTmFtZSA9IFwidHJlZS1sYWJlbFwiO1xuICAgIGxhYmVsLnRleHRDb250ZW50ID0gd2luZG93LnRpdGxlO1xuXG4gICAgY29uc3QgY291bnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGNvdW50LmNsYXNzTmFtZSA9IFwidHJlZS1jb3VudFwiO1xuICAgIGNvdW50LnRleHRDb250ZW50ID0gYCgke3Zpc2libGVUYWJzLmxlbmd0aH0gVGFicylgO1xuXG4gICAgd2luQ29udGVudC5hcHBlbmQod2luQ2hlY2tib3gsIGxhYmVsLCBjb3VudCk7XG5cbiAgICAvLyBDaGlsZHJlbiAoR3JvdXBzKVxuICAgIGNvbnN0IGNoaWxkcmVuQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcblxuICAgIC8vIEdyb3VwIHRhYnNcbiAgICBjb25zdCBncm91cHMgPSBuZXcgTWFwPHN0cmluZywgeyBjb2xvcjogc3RyaW5nOyB0YWJzOiBUYWJXaXRoR3JvdXBbXSB9PigpO1xuICAgIGNvbnN0IHVuZ3JvdXBlZFRhYnM6IFRhYldpdGhHcm91cFtdID0gW107XG4gICAgdmlzaWJsZVRhYnMuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgICBpZiAodGFiLmdyb3VwTGFiZWwpIHtcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IHRhYi5ncm91cExhYmVsO1xuICAgICAgICAgICAgY29uc3QgZW50cnkgPSBncm91cHMuZ2V0KGtleSkgPz8geyBjb2xvcjogdGFiLmdyb3VwQ29sb3IhLCB0YWJzOiBbXSB9O1xuICAgICAgICAgICAgZW50cnkudGFicy5wdXNoKHRhYik7XG4gICAgICAgICAgICBncm91cHMuc2V0KGtleSwgZW50cnkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdW5ncm91cGVkVGFicy5wdXNoKHRhYik7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IGNyZWF0ZVRhYk5vZGUgPSAodGFiOiBUYWJXaXRoR3JvdXApID0+IHtcbiAgICAgICAgY29uc3QgdGFiQ29udGVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIHRhYkNvbnRlbnQuc3R5bGUuZGlzcGxheSA9IFwiZmxleFwiO1xuICAgICAgICB0YWJDb250ZW50LnN0eWxlLmFsaWduSXRlbXMgPSBcImNlbnRlclwiO1xuICAgICAgICB0YWJDb250ZW50LnN0eWxlLmZsZXggPSBcIjFcIjtcbiAgICAgICAgdGFiQ29udGVudC5zdHlsZS5vdmVyZmxvdyA9IFwiaGlkZGVuXCI7XG5cbiAgICAgICAgLy8gVGFiIENoZWNrYm94XG4gICAgICAgIGNvbnN0IHRhYkNoZWNrYm94ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImlucHV0XCIpO1xuICAgICAgICB0YWJDaGVja2JveC50eXBlID0gXCJjaGVja2JveFwiO1xuICAgICAgICB0YWJDaGVja2JveC5jbGFzc05hbWUgPSBcInRyZWUtY2hlY2tib3hcIjtcbiAgICAgICAgdGFiQ2hlY2tib3guY2hlY2tlZCA9IHNlbGVjdGVkVGFicy5oYXModGFiLmlkKTtcbiAgICAgICAgdGFiQ2hlY2tib3gub25jbGljayA9IChlKSA9PiB7XG4gICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgaWYgKHRhYkNoZWNrYm94LmNoZWNrZWQpIHNlbGVjdGVkVGFicy5hZGQodGFiLmlkKTtcbiAgICAgICAgICAgIGVsc2Ugc2VsZWN0ZWRUYWJzLmRlbGV0ZSh0YWIuaWQpO1xuICAgICAgICAgICAgcmVuZGVyVHJlZSgpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IHRhYkljb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICB0YWJJY29uLmNsYXNzTmFtZSA9IFwidHJlZS1pY29uXCI7XG4gICAgICAgIGlmICh0YWIuZmF2SWNvblVybCkge1xuICAgICAgICAgICAgY29uc3QgaW1nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImltZ1wiKTtcbiAgICAgICAgICAgIGltZy5zcmMgPSB0YWIuZmF2SWNvblVybDtcbiAgICAgICAgICAgIGltZy5vbmVycm9yID0gKCkgPT4geyB0YWJJY29uLmlubmVySFRNTCA9IElDT05TLmRlZmF1bHRGaWxlOyB9O1xuICAgICAgICAgICAgdGFiSWNvbi5hcHBlbmRDaGlsZChpbWcpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGFiSWNvbi5pbm5lckhUTUwgPSBJQ09OUy5kZWZhdWx0RmlsZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHRhYlRpdGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgdGFiVGl0bGUuY2xhc3NOYW1lID0gXCJ0cmVlLWxhYmVsXCI7XG4gICAgICAgIHRhYlRpdGxlLnRleHRDb250ZW50ID0gdGFiLnRpdGxlO1xuICAgICAgICB0YWJUaXRsZS50aXRsZSA9IHRhYi50aXRsZTtcblxuICAgICAgICBjb25zdCB0YWJBY3Rpb25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgdGFiQWN0aW9ucy5jbGFzc05hbWUgPSBcInJvdy1hY3Rpb25zXCI7XG4gICAgICAgIGNvbnN0IGNsb3NlQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgICAgICAgY2xvc2VCdG4uY2xhc3NOYW1lID0gXCJhY3Rpb24tYnRuIGRlbGV0ZVwiO1xuICAgICAgICBjbG9zZUJ0bi5pbm5lckhUTUwgPSBJQ09OUy5jbG9zZTtcbiAgICAgICAgY2xvc2VCdG4udGl0bGUgPSBcIkNsb3NlIFRhYlwiO1xuICAgICAgICBjbG9zZUJ0bi5vbmNsaWNrID0gYXN5bmMgKGUpID0+IHtcbiAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICBhd2FpdCBjaHJvbWUudGFicy5yZW1vdmUodGFiLmlkKTtcbiAgICAgICAgICAgIGF3YWl0IGxvYWRTdGF0ZSgpO1xuICAgICAgICB9O1xuICAgICAgICB0YWJBY3Rpb25zLmFwcGVuZENoaWxkKGNsb3NlQnRuKTtcblxuICAgICAgICB0YWJDb250ZW50LmFwcGVuZCh0YWJDaGVja2JveCwgdGFiSWNvbiwgdGFiVGl0bGUsIHRhYkFjdGlvbnMpO1xuXG4gICAgICAgIGNvbnN0IHsgbm9kZTogdGFiTm9kZSB9ID0gY3JlYXRlTm9kZSh0YWJDb250ZW50LCBudWxsLCAndGFiJyk7XG4gICAgICAgIHRhYk5vZGUub25jbGljayA9IGFzeW5jIChlKSA9PiB7XG4gICAgICAgICAgICAvLyBDbGlja2luZyB0YWIgcm93IGFjdGl2YXRlcyB0YWIgKHVubGVzcyBjbGlja2luZyBjaGVja2JveC9hY3Rpb24pXG4gICAgICAgICAgICBpZiAoKGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5jbG9zZXN0KCcudHJlZS1jaGVja2JveCcpKSByZXR1cm47XG4gICAgICAgICAgICBhd2FpdCBjaHJvbWUudGFicy51cGRhdGUodGFiLmlkLCB7IGFjdGl2ZTogdHJ1ZSB9KTtcbiAgICAgICAgICAgIGF3YWl0IGNocm9tZS53aW5kb3dzLnVwZGF0ZSh0YWIud2luZG93SWQsIHsgZm9jdXNlZDogdHJ1ZSB9KTtcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHRhYk5vZGU7XG4gICAgfTtcblxuICAgIEFycmF5LmZyb20oZ3JvdXBzLmVudHJpZXMoKSkuc29ydCgpLmZvckVhY2goKFtncm91cExhYmVsLCBncm91cERhdGFdKSA9PiB7XG4gICAgICAgIGNvbnN0IGdyb3VwS2V5ID0gYCR7d2luZG93S2V5fS1nLSR7Z3JvdXBMYWJlbH1gO1xuICAgICAgICBjb25zdCBpc0dyb3VwRXhwYW5kZWQgPSAhIXF1ZXJ5IHx8IGV4cGFuZGVkTm9kZXMuaGFzKGdyb3VwS2V5KTtcblxuICAgICAgICAvLyBHcm91cCBDaGVja2JveCBMb2dpY1xuICAgICAgICBjb25zdCBncm91cFRhYklkcyA9IGdyb3VwRGF0YS50YWJzLm1hcCh0ID0+IHQuaWQpO1xuICAgICAgICBjb25zdCBncnBTZWxlY3RlZENvdW50ID0gZ3JvdXBUYWJJZHMuZmlsdGVyKGlkID0+IHNlbGVjdGVkVGFicy5oYXMoaWQpKS5sZW5ndGg7XG4gICAgICAgIGNvbnN0IGdycElzQWxsID0gZ3JwU2VsZWN0ZWRDb3VudCA9PT0gZ3JvdXBUYWJJZHMubGVuZ3RoICYmIGdyb3VwVGFiSWRzLmxlbmd0aCA+IDA7XG4gICAgICAgIGNvbnN0IGdycElzU29tZSA9IGdycFNlbGVjdGVkQ291bnQgPiAwICYmIGdycFNlbGVjdGVkQ291bnQgPCBncm91cFRhYklkcy5sZW5ndGg7XG5cbiAgICAgICAgY29uc3QgZ3JwQ2hlY2tib3ggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW5wdXRcIik7XG4gICAgICAgIGdycENoZWNrYm94LnR5cGUgPSBcImNoZWNrYm94XCI7XG4gICAgICAgIGdycENoZWNrYm94LmNsYXNzTmFtZSA9IFwidHJlZS1jaGVja2JveFwiO1xuICAgICAgICBncnBDaGVja2JveC5jaGVja2VkID0gZ3JwSXNBbGw7XG4gICAgICAgIGdycENoZWNrYm94LmluZGV0ZXJtaW5hdGUgPSBncnBJc1NvbWU7XG4gICAgICAgIGdycENoZWNrYm94Lm9uY2xpY2sgPSAoZSkgPT4ge1xuICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldFN0YXRlID0gIWdycElzQWxsO1xuICAgICAgICAgICAgZ3JvdXBUYWJJZHMuZm9yRWFjaChpZCA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldFN0YXRlKSBzZWxlY3RlZFRhYnMuYWRkKGlkKTtcbiAgICAgICAgICAgICAgICBlbHNlIHNlbGVjdGVkVGFicy5kZWxldGUoaWQpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZW5kZXJUcmVlKCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgLy8gR3JvdXAgQ29udGVudFxuICAgICAgICBjb25zdCBncnBDb250ZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgZ3JwQ29udGVudC5zdHlsZS5kaXNwbGF5ID0gXCJmbGV4XCI7XG4gICAgICAgIGdycENvbnRlbnQuc3R5bGUuYWxpZ25JdGVtcyA9IFwiY2VudGVyXCI7XG4gICAgICAgIGdycENvbnRlbnQuc3R5bGUuZmxleCA9IFwiMVwiO1xuICAgICAgICBncnBDb250ZW50LnN0eWxlLm92ZXJmbG93ID0gXCJoaWRkZW5cIjtcblxuICAgICAgICBjb25zdCBpY29uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgaWNvbi5jbGFzc05hbWUgPSBcInRyZWUtaWNvblwiO1xuICAgICAgICBpY29uLmlubmVySFRNTCA9IFRSRUVfSUNPTlMuZm9sZGVyO1xuXG4gICAgICAgIGNvbnN0IGdycExhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgZ3JwTGFiZWwuY2xhc3NOYW1lID0gXCJ0cmVlLWxhYmVsXCI7XG4gICAgICAgIGdycExhYmVsLnRleHRDb250ZW50ID0gZ3JvdXBMYWJlbDtcblxuICAgICAgICBjb25zdCBncnBDb3VudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIGdycENvdW50LmNsYXNzTmFtZSA9IFwidHJlZS1jb3VudFwiO1xuICAgICAgICBncnBDb3VudC50ZXh0Q29udGVudCA9IGAoJHtncm91cERhdGEudGFicy5sZW5ndGh9KWA7XG5cbiAgICAgICAgLy8gR3JvdXAgQWN0aW9uc1xuICAgICAgICBjb25zdCBhY3Rpb25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgYWN0aW9ucy5jbGFzc05hbWUgPSBcInJvdy1hY3Rpb25zXCI7XG4gICAgICAgIGNvbnN0IHVuZ3JvdXBCdG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICAgICAgICB1bmdyb3VwQnRuLmNsYXNzTmFtZSA9IFwiYWN0aW9uLWJ0blwiO1xuICAgICAgICB1bmdyb3VwQnRuLmlubmVySFRNTCA9IElDT05TLnVuZ3JvdXA7XG4gICAgICAgIHVuZ3JvdXBCdG4udGl0bGUgPSBcIlVuZ3JvdXBcIjtcbiAgICAgICAgdW5ncm91cEJ0bi5vbmNsaWNrID0gYXN5bmMgKGUpID0+IHtcbiAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICBpZiAoY29uZmlybShgVW5ncm91cCAke2dyb3VwRGF0YS50YWJzLmxlbmd0aH0gdGFicz9gKSkge1xuICAgICAgICAgICAgICAgIGF3YWl0IGNocm9tZS50YWJzLnVuZ3JvdXAoZ3JvdXBEYXRhLnRhYnMubWFwKHQgPT4gdC5pZCkpO1xuICAgICAgICAgICAgICAgIGF3YWl0IGxvYWRTdGF0ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICBhY3Rpb25zLmFwcGVuZENoaWxkKHVuZ3JvdXBCdG4pO1xuXG4gICAgICAgIGdycENvbnRlbnQuYXBwZW5kKGdycENoZWNrYm94LCBpY29uLCBncnBMYWJlbCwgZ3JwQ291bnQsIGFjdGlvbnMpO1xuXG4gICAgICAgIC8vIFRhYnNcbiAgICAgICAgY29uc3QgdGFic0NvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIGdyb3VwRGF0YS50YWJzLmZvckVhY2godGFiID0+IHtcbiAgICAgICAgICAgIHRhYnNDb250YWluZXIuYXBwZW5kQ2hpbGQoY3JlYXRlVGFiTm9kZSh0YWIpKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgeyBub2RlOiBncm91cE5vZGUsIHRvZ2dsZTogZ3JwVG9nZ2xlLCBjaGlsZHJlbkNvbnRhaW5lcjogZ3JwQ2hpbGRyZW4gfSA9IGNyZWF0ZU5vZGUoXG4gICAgICAgICAgICBncnBDb250ZW50LFxuICAgICAgICAgICAgdGFic0NvbnRhaW5lcixcbiAgICAgICAgICAgICdncm91cCcsXG4gICAgICAgICAgICBpc0dyb3VwRXhwYW5kZWQsXG4gICAgICAgICAgICAoKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGV4cGFuZGVkTm9kZXMuaGFzKGdyb3VwS2V5KSkgZXhwYW5kZWROb2Rlcy5kZWxldGUoZ3JvdXBLZXkpO1xuICAgICAgICAgICAgICAgIGVsc2UgZXhwYW5kZWROb2Rlcy5hZGQoZ3JvdXBLZXkpO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgZXhwYW5kZWQgPSBleHBhbmRlZE5vZGVzLmhhcyhncm91cEtleSk7XG4gICAgICAgICAgICAgICAgZ3JwVG9nZ2xlLmNsYXNzTGlzdC50b2dnbGUoJ3JvdGF0ZWQnLCBleHBhbmRlZCk7XG4gICAgICAgICAgICAgICAgZ3JwQ2hpbGRyZW4hLmNsYXNzTGlzdC50b2dnbGUoJ2V4cGFuZGVkJywgZXhwYW5kZWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICApO1xuXG4gICAgICAgIC8vIEFwcGx5IGJhY2tncm91bmQgY29sb3IgdG8gZ3JvdXAgbm9kZVxuICAgICAgICBpZiAoZ3JvdXBEYXRhLmNvbG9yKSB7XG4gICAgICAgICAgICBjb25zdCBjb2xvck5hbWUgPSBncm91cERhdGEuY29sb3I7XG4gICAgICAgICAgICBjb25zdCBoZXggPSBHUk9VUF9DT0xPUlNbY29sb3JOYW1lXSB8fCBjb2xvck5hbWU7IC8vIEZhbGxiYWNrIGlmIGl0J3MgYWxyZWFkeSBoZXhcbiAgICAgICAgICAgIGlmIChoZXguc3RhcnRzV2l0aCgnIycpKSB7XG4gICAgICAgICAgICAgICAgZ3JvdXBOb2RlLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IGhleFRvUmdiYShoZXgsIDAuMSk7XG4gICAgICAgICAgICAgICAgZ3JvdXBOb2RlLnN0eWxlLmJvcmRlciA9IGAxcHggc29saWQgJHtoZXhUb1JnYmEoaGV4LCAwLjIpfWA7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBjaGlsZHJlbkNvbnRhaW5lci5hcHBlbmRDaGlsZChncm91cE5vZGUpO1xuICAgIH0pO1xuXG4gICAgdW5ncm91cGVkVGFicy5mb3JFYWNoKHRhYiA9PiB7XG4gICAgICAgIGNoaWxkcmVuQ29udGFpbmVyLmFwcGVuZENoaWxkKGNyZWF0ZVRhYk5vZGUodGFiKSk7XG4gICAgfSk7XG5cbiAgICBjb25zdCB7IG5vZGU6IHdpbk5vZGUsIHRvZ2dsZTogd2luVG9nZ2xlLCBjaGlsZHJlbkNvbnRhaW5lcjogd2luQ2hpbGRyZW4gfSA9IGNyZWF0ZU5vZGUoXG4gICAgICAgIHdpbkNvbnRlbnQsXG4gICAgICAgIGNoaWxkcmVuQ29udGFpbmVyLFxuICAgICAgICAnd2luZG93JyxcbiAgICAgICAgaXNFeHBhbmRlZCxcbiAgICAgICAgKCkgPT4ge1xuICAgICAgICAgICAgIGlmIChleHBhbmRlZE5vZGVzLmhhcyh3aW5kb3dLZXkpKSBleHBhbmRlZE5vZGVzLmRlbGV0ZSh3aW5kb3dLZXkpO1xuICAgICAgICAgICAgIGVsc2UgZXhwYW5kZWROb2Rlcy5hZGQod2luZG93S2V5KTtcblxuICAgICAgICAgICAgIGNvbnN0IGV4cGFuZGVkID0gZXhwYW5kZWROb2Rlcy5oYXMod2luZG93S2V5KTtcbiAgICAgICAgICAgICB3aW5Ub2dnbGUuY2xhc3NMaXN0LnRvZ2dsZSgncm90YXRlZCcsIGV4cGFuZGVkKTtcbiAgICAgICAgICAgICB3aW5DaGlsZHJlbiEuY2xhc3NMaXN0LnRvZ2dsZSgnZXhwYW5kZWQnLCBleHBhbmRlZCk7XG4gICAgICAgIH1cbiAgICApO1xuXG4gICAgd2luZG93c0NvbnRhaW5lci5hcHBlbmRDaGlsZCh3aW5Ob2RlKTtcbiAgfSk7XG5cbiAgdXBkYXRlU3RhdHMoKTtcbn07XG5cbi8vIFN0cmF0ZWd5IFJlbmRlcmluZ1xuZnVuY3Rpb24gdXBkYXRlU3RyYXRlZ3lWaWV3cyhzdHJhdGVnaWVzOiBTdHJhdGVneURlZmluaXRpb25bXSwgZW5hYmxlZElkczogc3RyaW5nW10pIHtcbiAgICAvLyAxLiBSZW5kZXIgQWN0aXZlIFN0cmF0ZWdpZXNcbiAgICBhY3RpdmVTdHJhdGVnaWVzTGlzdC5pbm5lckhUTUwgPSAnJztcblxuICAgIC8vIE1haW50YWluIG9yZGVyIGZyb20gZW5hYmxlZElkc1xuICAgIGNvbnN0IGVuYWJsZWRTdHJhdGVnaWVzID0gZW5hYmxlZElkc1xuICAgICAgICAubWFwKGlkID0+IHN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IGlkKSlcbiAgICAgICAgLmZpbHRlcigocyk6IHMgaXMgU3RyYXRlZ3lEZWZpbml0aW9uID0+ICEhcyk7XG5cbiAgICBlbmFibGVkU3RyYXRlZ2llcy5mb3JFYWNoKHN0cmF0ZWd5ID0+IHtcbiAgICAgICAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIHJvdy5jbGFzc05hbWUgPSAnc3RyYXRlZ3ktcm93JztcbiAgICAgICAgcm93LmRhdGFzZXQuaWQgPSBzdHJhdGVneS5pZDtcbiAgICAgICAgcm93LmRyYWdnYWJsZSA9IHRydWU7XG5cbiAgICAgICAgLy8gRHJhZyBIYW5kbGVcbiAgICAgICAgY29uc3QgaGFuZGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIGhhbmRsZS5jbGFzc05hbWUgPSAnc3RyYXRlZ3ktZHJhZy1oYW5kbGUnO1xuICAgICAgICBoYW5kbGUuaW5uZXJIVE1MID0gJ1x1MjJFRVx1MjJFRSc7XG5cbiAgICAgICAgLy8gTGFiZWxcbiAgICAgICAgY29uc3QgbGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG4gICAgICAgIGxhYmVsLmNsYXNzTmFtZSA9ICdzdHJhdGVneS1sYWJlbCc7XG4gICAgICAgIGxhYmVsLnRleHRDb250ZW50ID0gc3RyYXRlZ3kubGFiZWw7XG5cbiAgICAgICAgLy8gVGFnc1xuICAgICAgICBsZXQgdGFnc0h0bWwgPSAnJztcbiAgICAgICAgaWYgKHN0cmF0ZWd5LnRhZ3MpIHtcbiAgICAgICAgICAgICBzdHJhdGVneS50YWdzLmZvckVhY2godGFnID0+IHtcbiAgICAgICAgICAgICAgICB0YWdzSHRtbCArPSBgPHNwYW4gY2xhc3M9XCJ0YWcgdGFnLSR7dGFnfVwiPiR7dGFnfTwvc3Bhbj5gO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBjb250ZW50V3JhcHBlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICBjb250ZW50V3JhcHBlci5zdHlsZS5mbGV4ID0gXCIxXCI7XG4gICAgICAgIGNvbnRlbnRXcmFwcGVyLnN0eWxlLmRpc3BsYXkgPSBcImZsZXhcIjtcbiAgICAgICAgY29udGVudFdyYXBwZXIuc3R5bGUuYWxpZ25JdGVtcyA9IFwiY2VudGVyXCI7XG4gICAgICAgIGNvbnRlbnRXcmFwcGVyLmFwcGVuZENoaWxkKGxhYmVsKTtcbiAgICAgICAgaWYgKHRhZ3NIdG1sKSB7XG4gICAgICAgICAgICAgY29uc3QgdGFnc0NvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcbiAgICAgICAgICAgICB0YWdzQ29udGFpbmVyLmlubmVySFRNTCA9IHRhZ3NIdG1sO1xuICAgICAgICAgICAgIGNvbnRlbnRXcmFwcGVyLmFwcGVuZENoaWxkKHRhZ3NDb250YWluZXIpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmVtb3ZlIEJ1dHRvblxuICAgICAgICBjb25zdCByZW1vdmVCdG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgICAgICAgcmVtb3ZlQnRuLmNsYXNzTmFtZSA9ICdzdHJhdGVneS1yZW1vdmUtYnRuJztcbiAgICAgICAgcmVtb3ZlQnRuLmlubmVySFRNTCA9IElDT05TLmNsb3NlOyAvLyBVc2UgSWNvbiBmb3IgY29uc2lzdGVuY3lcbiAgICAgICAgcmVtb3ZlQnRuLnRpdGxlID0gXCJSZW1vdmUgc3RyYXRlZ3lcIjtcbiAgICAgICAgcmVtb3ZlQnRuLm9uY2xpY2sgPSBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICAgYXdhaXQgdG9nZ2xlU3RyYXRlZ3koc3RyYXRlZ3kuaWQsIGZhbHNlKTtcbiAgICAgICAgfTtcblxuICAgICAgICByb3cuYXBwZW5kQ2hpbGQoaGFuZGxlKTtcbiAgICAgICAgcm93LmFwcGVuZENoaWxkKGNvbnRlbnRXcmFwcGVyKTtcblxuICAgICAgICBpZiAoc3RyYXRlZ3kuaXNDdXN0b20pIHtcbiAgICAgICAgICAgICBjb25zdCBhdXRvUnVuQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgICAgICAgICAgICBhdXRvUnVuQnRuLmNsYXNzTmFtZSA9IGBhY3Rpb24tYnRuIGF1dG8tcnVuICR7c3RyYXRlZ3kuYXV0b1J1biA/ICdhY3RpdmUnIDogJyd9YDtcbiAgICAgICAgICAgICBhdXRvUnVuQnRuLmlubmVySFRNTCA9IElDT05TLmF1dG9SdW47XG4gICAgICAgICAgICAgYXV0b1J1bkJ0bi50aXRsZSA9IGBBdXRvIFJ1bjogJHtzdHJhdGVneS5hdXRvUnVuID8gJ09OJyA6ICdPRkYnfWA7XG4gICAgICAgICAgICAgYXV0b1J1bkJ0bi5zdHlsZS5vcGFjaXR5ID0gc3RyYXRlZ3kuYXV0b1J1biA/IFwiMVwiIDogXCIwLjNcIjtcbiAgICAgICAgICAgICBhdXRvUnVuQnRuLm9uY2xpY2sgPSBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgICBpZiAoIXByZWZlcmVuY2VzPy5jdXN0b21TdHJhdGVnaWVzKSByZXR1cm47XG4gICAgICAgICAgICAgICAgIGNvbnN0IGN1c3RvbVN0cmF0SW5kZXggPSBwcmVmZXJlbmNlcy5jdXN0b21TdHJhdGVnaWVzLmZpbmRJbmRleChzID0+IHMuaWQgPT09IHN0cmF0ZWd5LmlkKTtcbiAgICAgICAgICAgICAgICAgaWYgKGN1c3RvbVN0cmF0SW5kZXggIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN0cmF0ID0gcHJlZmVyZW5jZXMuY3VzdG9tU3RyYXRlZ2llc1tjdXN0b21TdHJhdEluZGV4XTtcbiAgICAgICAgICAgICAgICAgICAgc3RyYXQuYXV0b1J1biA9ICFzdHJhdC5hdXRvUnVuO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBpc0FjdGl2ZSA9ICEhc3RyYXQuYXV0b1J1bjtcbiAgICAgICAgICAgICAgICAgICAgYXV0b1J1bkJ0bi5jbGFzc0xpc3QudG9nZ2xlKCdhY3RpdmUnLCBpc0FjdGl2ZSk7XG4gICAgICAgICAgICAgICAgICAgIGF1dG9SdW5CdG4uc3R5bGUub3BhY2l0eSA9IGlzQWN0aXZlID8gXCIxXCIgOiBcIjAuM1wiO1xuICAgICAgICAgICAgICAgICAgICBhdXRvUnVuQnRuLnRpdGxlID0gYEF1dG8gUnVuOiAke2lzQWN0aXZlID8gJ09OJyA6ICdPRkYnfWA7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHNlbmRNZXNzYWdlKFwic2F2ZVByZWZlcmVuY2VzXCIsIHsgY3VzdG9tU3RyYXRlZ2llczogcHJlZmVyZW5jZXMuY3VzdG9tU3RyYXRlZ2llcyB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICByb3cuYXBwZW5kQ2hpbGQoYXV0b1J1bkJ0bik7XG4gICAgICAgIH1cblxuICAgICAgICByb3cuYXBwZW5kQ2hpbGQocmVtb3ZlQnRuKTtcblxuICAgICAgICBhZGREbkRMaXN0ZW5lcnMocm93KTtcbiAgICAgICAgYWN0aXZlU3RyYXRlZ2llc0xpc3QuYXBwZW5kQ2hpbGQocm93KTtcbiAgICB9KTtcblxuICAgIC8vIDIuIFJlbmRlciBBZGQgU3RyYXRlZ3kgT3B0aW9uc1xuICAgIGFkZFN0cmF0ZWd5U2VsZWN0LmlubmVySFRNTCA9ICc8b3B0aW9uIHZhbHVlPVwiXCIgZGlzYWJsZWQgc2VsZWN0ZWQ+U2VsZWN0IFN0cmF0ZWd5Li4uPC9vcHRpb24+JztcblxuICAgIGNvbnN0IGRpc2FibGVkU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gIWVuYWJsZWRJZHMuaW5jbHVkZXMocy5pZCkpO1xuICAgIGRpc2FibGVkU3RyYXRlZ2llcy5zb3J0KChhLCBiKSA9PiBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCkpO1xuXG4gICAgLy8gU2VwYXJhdGUgc3RyYXRlZ2llcyB3aXRoIEF1dG8tUnVuIGFjdGl2ZSBidXQgbm90IGluIHNvcnRpbmcgbGlzdFxuICAgIGNvbnN0IGJhY2tncm91bmRTdHJhdGVnaWVzOiBTdHJhdGVneURlZmluaXRpb25bXSA9IFtdO1xuICAgIGNvbnN0IGF2YWlsYWJsZVN0cmF0ZWdpZXM6IFN0cmF0ZWd5RGVmaW5pdGlvbltdID0gW107XG5cbiAgICBkaXNhYmxlZFN0cmF0ZWdpZXMuZm9yRWFjaChzID0+IHtcbiAgICAgICAgaWYgKHMuaXNDdXN0b20gJiYgcy5hdXRvUnVuKSB7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kU3RyYXRlZ2llcy5wdXNoKHMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYXZhaWxhYmxlU3RyYXRlZ2llcy5wdXNoKHMpO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBQb3B1bGF0ZSBTZWxlY3RcbiAgICAvLyBXZSBpbmNsdWRlIGJhY2tncm91bmQgc3RyYXRlZ2llcyBpbiB0aGUgZHJvcGRvd24gdG9vIHNvIHRoZXkgY2FuIGJlIG1vdmVkIHRvIFwiQWN0aXZlXCIgc29ydGluZyBlYXNpbHlcbiAgICAvLyBidXQgd2UgbWlnaHQgbWFyayB0aGVtXG4gICAgWy4uLmJhY2tncm91bmRTdHJhdGVnaWVzLCAuLi5hdmFpbGFibGVTdHJhdGVnaWVzXS5zb3J0KChhLCBiKSA9PiBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCkpLmZvckVhY2goc3RyYXRlZ3kgPT4ge1xuICAgICAgICBjb25zdCBvcHRpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdvcHRpb24nKTtcbiAgICAgICAgb3B0aW9uLnZhbHVlID0gc3RyYXRlZ3kuaWQ7XG4gICAgICAgIG9wdGlvbi50ZXh0Q29udGVudCA9IHN0cmF0ZWd5LmxhYmVsO1xuICAgICAgICBhZGRTdHJhdGVneVNlbGVjdC5hcHBlbmRDaGlsZChvcHRpb24pO1xuICAgIH0pO1xuXG4gICAgLy8gRm9yY2Ugc2VsZWN0aW9uIG9mIHBsYWNlaG9sZGVyXG4gICAgYWRkU3RyYXRlZ3lTZWxlY3QudmFsdWUgPSBcIlwiO1xuXG4gICAgLy8gMy4gUmVuZGVyIEJhY2tncm91bmQgU3RyYXRlZ2llcyBTZWN0aW9uIChpZiBhbnkpXG4gICAgbGV0IGJnU2VjdGlvbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYmFja2dyb3VuZFN0cmF0ZWdpZXNTZWN0aW9uXCIpO1xuICAgIGlmIChiYWNrZ3JvdW5kU3RyYXRlZ2llcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGlmICghYmdTZWN0aW9uKSB7XG4gICAgICAgICAgICBiZ1NlY3Rpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgYmdTZWN0aW9uLmlkID0gXCJiYWNrZ3JvdW5kU3RyYXRlZ2llc1NlY3Rpb25cIjtcbiAgICAgICAgICAgIGJnU2VjdGlvbi5jbGFzc05hbWUgPSBcImFjdGl2ZS1zdHJhdGVnaWVzLXNlY3Rpb25cIjtcbiAgICAgICAgICAgIC8vIFN0eWxlIGl0IHRvIGxvb2sgbGlrZSBhY3RpdmUgc2VjdGlvbiBidXQgZGlzdGluY3RcbiAgICAgICAgICAgIGJnU2VjdGlvbi5zdHlsZS5tYXJnaW5Ub3AgPSBcIjhweFwiO1xuICAgICAgICAgICAgYmdTZWN0aW9uLnN0eWxlLmJvcmRlclRvcCA9IFwiMXB4IGRhc2hlZCB2YXIoLS1ib3JkZXItY29sb3IpXCI7XG4gICAgICAgICAgICBiZ1NlY3Rpb24uc3R5bGUucGFkZGluZ1RvcCA9IFwiOHB4XCI7XG5cbiAgICAgICAgICAgIGNvbnN0IGhlYWRlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgICAgICBoZWFkZXIuY2xhc3NOYW1lID0gXCJzZWN0aW9uLWhlYWRlclwiO1xuICAgICAgICAgICAgaGVhZGVyLnRleHRDb250ZW50ID0gXCJCYWNrZ3JvdW5kIEF1dG8tUnVuXCI7XG4gICAgICAgICAgICBoZWFkZXIudGl0bGUgPSBcIlRoZXNlIHN0cmF0ZWdpZXMgcnVuIGF1dG9tYXRpY2FsbHkgYnV0IGFyZSBub3QgdXNlZCBmb3Igc29ydGluZy9ncm91cGluZyBvcmRlci5cIjtcbiAgICAgICAgICAgIGJnU2VjdGlvbi5hcHBlbmRDaGlsZChoZWFkZXIpO1xuXG4gICAgICAgICAgICBjb25zdCBsaXN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgICAgIGxpc3QuY2xhc3NOYW1lID0gXCJzdHJhdGVneS1saXN0XCI7XG4gICAgICAgICAgICBiZ1NlY3Rpb24uYXBwZW5kQ2hpbGQobGlzdCk7XG5cbiAgICAgICAgICAgIC8vIEluc2VydCBhZnRlciBhY3RpdmUgbGlzdFxuICAgICAgICAgICAgYWN0aXZlU3RyYXRlZ2llc0xpc3QucGFyZW50RWxlbWVudD8uYWZ0ZXIoYmdTZWN0aW9uKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGxpc3QgPSBiZ1NlY3Rpb24ucXVlcnlTZWxlY3RvcihcIi5zdHJhdGVneS1saXN0XCIpIGFzIEhUTUxFbGVtZW50O1xuICAgICAgICBsaXN0LmlubmVySFRNTCA9IFwiXCI7XG5cbiAgICAgICAgYmFja2dyb3VuZFN0cmF0ZWdpZXMuZm9yRWFjaChzdHJhdGVneSA9PiB7XG4gICAgICAgICAgICBjb25zdCByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgIHJvdy5jbGFzc05hbWUgPSAnc3RyYXRlZ3ktcm93JztcbiAgICAgICAgICAgIHJvdy5kYXRhc2V0LmlkID0gc3RyYXRlZ3kuaWQ7XG5cbiAgICAgICAgICAgIGNvbnN0IGxhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuICAgICAgICAgICAgbGFiZWwuY2xhc3NOYW1lID0gJ3N0cmF0ZWd5LWxhYmVsJztcbiAgICAgICAgICAgIGxhYmVsLnRleHRDb250ZW50ID0gc3RyYXRlZ3kubGFiZWw7XG4gICAgICAgICAgICBsYWJlbC5zdHlsZS5vcGFjaXR5ID0gXCIwLjdcIjtcblxuICAgICAgICAgICAgY29uc3QgYXV0b1J1bkJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gICAgICAgICAgICBhdXRvUnVuQnRuLmNsYXNzTmFtZSA9IGBhY3Rpb24tYnRuIGF1dG8tcnVuIGFjdGl2ZWA7XG4gICAgICAgICAgICBhdXRvUnVuQnRuLmlubmVySFRNTCA9IElDT05TLmF1dG9SdW47XG4gICAgICAgICAgICBhdXRvUnVuQnRuLnRpdGxlID0gYEF1dG8gUnVuOiBPTiAoQ2xpY2sgdG8gZGlzYWJsZSlgO1xuICAgICAgICAgICAgYXV0b1J1bkJ0bi5zdHlsZS5tYXJnaW5MZWZ0ID0gXCJhdXRvXCI7XG4gICAgICAgICAgICBhdXRvUnVuQnRuLm9uY2xpY2sgPSBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgICBpZiAoIXByZWZlcmVuY2VzPy5jdXN0b21TdHJhdGVnaWVzKSByZXR1cm47XG4gICAgICAgICAgICAgICAgIGNvbnN0IGN1c3RvbVN0cmF0SW5kZXggPSBwcmVmZXJlbmNlcy5jdXN0b21TdHJhdGVnaWVzLmZpbmRJbmRleChzID0+IHMuaWQgPT09IHN0cmF0ZWd5LmlkKTtcbiAgICAgICAgICAgICAgICAgaWYgKGN1c3RvbVN0cmF0SW5kZXggIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN0cmF0ID0gcHJlZmVyZW5jZXMuY3VzdG9tU3RyYXRlZ2llc1tjdXN0b21TdHJhdEluZGV4XTtcbiAgICAgICAgICAgICAgICAgICAgc3RyYXQuYXV0b1J1biA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBzZW5kTWVzc2FnZShcInNhdmVQcmVmZXJlbmNlc1wiLCB7IGN1c3RvbVN0cmF0ZWdpZXM6IHByZWZlcmVuY2VzLmN1c3RvbVN0cmF0ZWdpZXMgfSk7XG4gICAgICAgICAgICAgICAgICAgIC8vIFVJIHVwZGF0ZSB0cmlnZ2VycyB2aWEgc2VuZE1lc3NhZ2UgcmVzcG9uc2Ugb3IgcmUtcmVuZGVyXG4gICAgICAgICAgICAgICAgICAgIC8vIEJ1dCB3ZSBzaG91bGQgcmUtcmVuZGVyIGltbWVkaWF0ZWx5IGZvciByZXNwb25zaXZlbmVzc1xuICAgICAgICAgICAgICAgICAgICB1cGRhdGVTdHJhdGVneVZpZXdzKHN0cmF0ZWdpZXMsIGVuYWJsZWRJZHMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHJvdy5hcHBlbmRDaGlsZChsYWJlbCk7XG4gICAgICAgICAgICByb3cuYXBwZW5kQ2hpbGQoYXV0b1J1bkJ0bik7XG4gICAgICAgICAgICBsaXN0LmFwcGVuZENoaWxkKHJvdyk7XG4gICAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChiZ1NlY3Rpb24pIGJnU2VjdGlvbi5yZW1vdmUoKTtcbiAgICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHRvZ2dsZVN0cmF0ZWd5KGlkOiBzdHJpbmcsIGVuYWJsZTogYm9vbGVhbikge1xuICAgIGlmICghcHJlZmVyZW5jZXMpIHJldHVybjtcblxuICAgIGNvbnN0IGFsbFN0cmF0ZWdpZXMgPSBnZXRTdHJhdGVnaWVzKHByZWZlcmVuY2VzLmN1c3RvbVN0cmF0ZWdpZXMpO1xuICAgIGNvbnN0IHZhbGlkSWRzID0gbmV3IFNldChhbGxTdHJhdGVnaWVzLm1hcChzID0+IHMuaWQpKTtcblxuICAgIC8vIENsZWFuIGN1cnJlbnQgbGlzdCBieSByZW1vdmluZyBzdGFsZSBJRHNcbiAgICBsZXQgY3VycmVudCA9IChwcmVmZXJlbmNlcy5zb3J0aW5nIHx8IFtdKS5maWx0ZXIoc0lkID0+IHZhbGlkSWRzLmhhcyhzSWQpKTtcblxuICAgIGlmIChlbmFibGUpIHtcbiAgICAgICAgaWYgKCFjdXJyZW50LmluY2x1ZGVzKGlkKSkge1xuICAgICAgICAgICAgY3VycmVudC5wdXNoKGlkKTtcbiAgICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAgIGN1cnJlbnQgPSBjdXJyZW50LmZpbHRlcihzSWQgPT4gc0lkICE9PSBpZCk7XG4gICAgfVxuXG4gICAgcHJlZmVyZW5jZXMuc29ydGluZyA9IGN1cnJlbnQ7XG4gICAgYXdhaXQgc2VuZE1lc3NhZ2UoXCJzYXZlUHJlZmVyZW5jZXNcIiwgeyBzb3J0aW5nOiBjdXJyZW50IH0pO1xuXG4gICAgLy8gUmUtcmVuZGVyXG4gICAgdXBkYXRlU3RyYXRlZ3lWaWV3cyhhbGxTdHJhdGVnaWVzLCBjdXJyZW50KTtcbn1cblxuZnVuY3Rpb24gYWRkRG5ETGlzdGVuZXJzKHJvdzogSFRNTEVsZW1lbnQpIHtcbiAgcm93LmFkZEV2ZW50TGlzdGVuZXIoJ2RyYWdzdGFydCcsIChlKSA9PiB7XG4gICAgcm93LmNsYXNzTGlzdC5hZGQoJ2RyYWdnaW5nJyk7XG4gICAgaWYgKGUuZGF0YVRyYW5zZmVyKSB7XG4gICAgICAgIGUuZGF0YVRyYW5zZmVyLmVmZmVjdEFsbG93ZWQgPSAnbW92ZSc7XG4gICAgfVxuICB9KTtcblxuICByb3cuYWRkRXZlbnRMaXN0ZW5lcignZHJhZ2VuZCcsIGFzeW5jICgpID0+IHtcbiAgICByb3cuY2xhc3NMaXN0LnJlbW92ZSgnZHJhZ2dpbmcnKTtcbiAgICAvLyBTYXZlIG9yZGVyXG4gICAgaWYgKHByZWZlcmVuY2VzKSB7XG4gICAgICAgIGNvbnN0IGN1cnJlbnRTb3J0aW5nID0gZ2V0U2VsZWN0ZWRTb3J0aW5nKCk7XG4gICAgICAgIC8vIENoZWNrIGlmIG9yZGVyIGNoYW5nZWRcbiAgICAgICAgY29uc3Qgb2xkU29ydGluZyA9IHByZWZlcmVuY2VzLnNvcnRpbmcgfHwgW107XG4gICAgICAgIGlmIChKU09OLnN0cmluZ2lmeShjdXJyZW50U29ydGluZykgIT09IEpTT04uc3RyaW5naWZ5KG9sZFNvcnRpbmcpKSB7XG4gICAgICAgICAgICBwcmVmZXJlbmNlcy5zb3J0aW5nID0gY3VycmVudFNvcnRpbmc7XG4gICAgICAgICAgICBhd2FpdCBzZW5kTWVzc2FnZShcInNhdmVQcmVmZXJlbmNlc1wiLCB7IHNvcnRpbmc6IGN1cnJlbnRTb3J0aW5nIH0pO1xuICAgICAgICB9XG4gICAgfVxuICB9KTtcbn1cblxuZnVuY3Rpb24gc2V0dXBDb250YWluZXJEbkQoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnRhaW5lci5hZGRFdmVudExpc3RlbmVyKCdkcmFnb3ZlcicsIChlKSA9PiB7XG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgY29uc3QgYWZ0ZXJFbGVtZW50ID0gZ2V0RHJhZ0FmdGVyRWxlbWVudChjb250YWluZXIsIGUuY2xpZW50WSk7XG4gICAgICAgIGNvbnN0IGRyYWdnYWJsZVJvdyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5zdHJhdGVneS1yb3cuZHJhZ2dpbmcnKTtcbiAgICAgICAgaWYgKGRyYWdnYWJsZVJvdyAmJiBkcmFnZ2FibGVSb3cucGFyZW50RWxlbWVudCA9PT0gY29udGFpbmVyKSB7XG4gICAgICAgICAgICAgaWYgKGFmdGVyRWxlbWVudCA9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKGRyYWdnYWJsZVJvdyk7XG4gICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb250YWluZXIuaW5zZXJ0QmVmb3JlKGRyYWdnYWJsZVJvdywgYWZ0ZXJFbGVtZW50KTtcbiAgICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuc2V0dXBDb250YWluZXJEbkQoYWN0aXZlU3RyYXRlZ2llc0xpc3QpO1xuXG5mdW5jdGlvbiBnZXREcmFnQWZ0ZXJFbGVtZW50KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHk6IG51bWJlcikge1xuICBjb25zdCBkcmFnZ2FibGVFbGVtZW50cyA9IEFycmF5LmZyb20oY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5zdHJhdGVneS1yb3c6bm90KC5kcmFnZ2luZyknKSk7XG5cbiAgcmV0dXJuIGRyYWdnYWJsZUVsZW1lbnRzLnJlZHVjZSgoY2xvc2VzdCwgY2hpbGQpID0+IHtcbiAgICBjb25zdCBib3ggPSBjaGlsZC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICBjb25zdCBvZmZzZXQgPSB5IC0gYm94LnRvcCAtIGJveC5oZWlnaHQgLyAyO1xuICAgIGlmIChvZmZzZXQgPCAwICYmIG9mZnNldCA+IGNsb3Nlc3Qub2Zmc2V0KSB7XG4gICAgICByZXR1cm4geyBvZmZzZXQ6IG9mZnNldCwgZWxlbWVudDogY2hpbGQgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGNsb3Nlc3Q7XG4gICAgfVxuICB9LCB7IG9mZnNldDogTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZLCBlbGVtZW50OiBudWxsIGFzIEVsZW1lbnQgfCBudWxsIH0pLmVsZW1lbnQ7XG59XG5cbmNvbnN0IHVwZGF0ZVVJID0gKFxuICBzdGF0ZURhdGE6IHsgZ3JvdXBzOiBUYWJHcm91cFtdOyBwcmVmZXJlbmNlczogUHJlZmVyZW5jZXMgfSxcbiAgY3VycmVudFdpbmRvdzogY2hyb21lLndpbmRvd3MuV2luZG93IHwgdW5kZWZpbmVkLFxuICBjaHJvbWVXaW5kb3dzOiBjaHJvbWUud2luZG93cy5XaW5kb3dbXSxcbiAgaXNQcmVsaW1pbmFyeSA9IGZhbHNlXG4pID0+IHtcbiAgICBwcmVmZXJlbmNlcyA9IHN0YXRlRGF0YS5wcmVmZXJlbmNlcztcblxuICAgIGlmIChwcmVmZXJlbmNlcykge1xuICAgICAgY29uc3QgcyA9IHByZWZlcmVuY2VzLnNvcnRpbmcgfHwgW107XG5cbiAgICAgIC8vIEluaXRpYWxpemUgTG9nZ2VyXG4gICAgICBzZXRMb2dnZXJQcmVmZXJlbmNlcyhwcmVmZXJlbmNlcyk7XG5cbiAgICAgIGNvbnN0IGFsbFN0cmF0ZWdpZXMgPSBnZXRTdHJhdGVnaWVzKHByZWZlcmVuY2VzLmN1c3RvbVN0cmF0ZWdpZXMpO1xuXG4gICAgICAvLyBSZW5kZXIgdW5pZmllZCBzdHJhdGVneSBsaXN0XG4gICAgICB1cGRhdGVTdHJhdGVneVZpZXdzKGFsbFN0cmF0ZWdpZXMsIHMpO1xuXG4gICAgICAvLyBJbml0aWFsIHRoZW1lIGxvYWRcbiAgICAgIGlmIChwcmVmZXJlbmNlcy50aGVtZSkge1xuICAgICAgICBhcHBseVRoZW1lKHByZWZlcmVuY2VzLnRoZW1lLCBmYWxzZSk7XG4gICAgICB9XG5cbiAgICAgIC8vIEluaXQgc2V0dGluZ3MgVUlcbiAgICAgIGlmIChwcmVmZXJlbmNlcy5sb2dMZXZlbCkge1xuICAgICAgICAgIGNvbnN0IHNlbGVjdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2dMZXZlbFNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICAgIGlmIChzZWxlY3QpIHNlbGVjdC52YWx1ZSA9IHByZWZlcmVuY2VzLmxvZ0xldmVsO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChjdXJyZW50V2luZG93KSB7XG4gICAgICBmb2N1c2VkV2luZG93SWQgPSBjdXJyZW50V2luZG93LmlkID8/IG51bGw7XG4gICAgfSBlbHNlIHtcbiAgICAgIGZvY3VzZWRXaW5kb3dJZCA9IG51bGw7XG4gICAgICBjb25zb2xlLndhcm4oXCJGYWlsZWQgdG8gZ2V0IGN1cnJlbnQgd2luZG93XCIpO1xuICAgIH1cblxuICAgIGNvbnN0IHdpbmRvd1RpdGxlcyA9IG5ldyBNYXA8bnVtYmVyLCBzdHJpbmc+KCk7XG5cbiAgICBjaHJvbWVXaW5kb3dzLmZvckVhY2goKHdpbikgPT4ge1xuICAgICAgaWYgKCF3aW4uaWQpIHJldHVybjtcbiAgICAgIGNvbnN0IGFjdGl2ZVRhYlRpdGxlID0gd2luLnRhYnM/LmZpbmQoKHRhYikgPT4gdGFiLmFjdGl2ZSk/LnRpdGxlO1xuICAgICAgY29uc3QgdGl0bGUgPSBhY3RpdmVUYWJUaXRsZSA/PyBgV2luZG93ICR7d2luLmlkfWA7XG4gICAgICB3aW5kb3dUaXRsZXMuc2V0KHdpbi5pZCwgdGl0bGUpO1xuICAgIH0pO1xuXG4gICAgd2luZG93U3RhdGUgPSBtYXBXaW5kb3dzKHN0YXRlRGF0YS5ncm91cHMsIHdpbmRvd1RpdGxlcyk7XG5cbiAgICBpZiAoZm9jdXNlZFdpbmRvd0lkICE9PSBudWxsKSB7XG4gICAgICAgIHdpbmRvd1N0YXRlLnNvcnQoKGEsIGIpID0+IHtcbiAgICAgICAgICAgIGlmIChhLmlkID09PSBmb2N1c2VkV2luZG93SWQpIHJldHVybiAtMTtcbiAgICAgICAgICAgIGlmIChiLmlkID09PSBmb2N1c2VkV2luZG93SWQpIHJldHVybiAxO1xuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmICghaW5pdGlhbFNlbGVjdGlvbkRvbmUgJiYgZm9jdXNlZFdpbmRvd0lkICE9PSBudWxsKSB7XG4gICAgICAgIGNvbnN0IGFjdGl2ZVdpbmRvdyA9IHdpbmRvd1N0YXRlLmZpbmQodyA9PiB3LmlkID09PSBmb2N1c2VkV2luZG93SWQpO1xuICAgICAgICBpZiAoYWN0aXZlV2luZG93KSB7XG4gICAgICAgICAgICAgZXhwYW5kZWROb2Rlcy5hZGQoYHctJHthY3RpdmVXaW5kb3cuaWR9YCk7XG4gICAgICAgICAgICAgYWN0aXZlV2luZG93LnRhYnMuZm9yRWFjaCh0ID0+IHNlbGVjdGVkVGFicy5hZGQodC5pZCkpO1xuXG4gICAgICAgICAgICAgaWYgKCFpc1ByZWxpbWluYXJ5KSB7XG4gICAgICAgICAgICAgICAgIGluaXRpYWxTZWxlY3Rpb25Eb25lID0gdHJ1ZTtcbiAgICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZW5kZXJUcmVlKCk7XG59O1xuXG5jb25zdCBsb2FkU3RhdGUgPSBhc3luYyAoKSA9PiB7XG4gIGxvZ0luZm8oXCJMb2FkaW5nIHBvcHVwIHN0YXRlXCIpO1xuXG4gIGxldCBiZ0ZpbmlzaGVkID0gZmFsc2U7XG5cbiAgY29uc3QgZmFzdExvYWQgPSBhc3luYyAoKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgW2xvY2FsUmVzLCBjdywgYXddID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgICAgICAgZmV0Y2hMb2NhbFN0YXRlKCksXG4gICAgICAgICAgICBjaHJvbWUud2luZG93cy5nZXRDdXJyZW50KCkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKSxcbiAgICAgICAgICAgIGNocm9tZS53aW5kb3dzLmdldEFsbCh7IHdpbmRvd1R5cGVzOiBbXCJub3JtYWxcIl0sIHBvcHVsYXRlOiB0cnVlIH0pLmNhdGNoKCgpID0+IFtdKVxuICAgICAgICBdKTtcblxuICAgICAgICAvLyBPbmx5IHVwZGF0ZSBpZiBiYWNrZ3JvdW5kIGhhc24ndCBmaW5pc2hlZCB5ZXRcbiAgICAgICAgaWYgKCFiZ0ZpbmlzaGVkICYmIGxvY2FsUmVzLm9rICYmIGxvY2FsUmVzLmRhdGEpIHtcbiAgICAgICAgICAgICB1cGRhdGVVSShsb2NhbFJlcy5kYXRhLCBjdywgYXcgYXMgY2hyb21lLndpbmRvd3MuV2luZG93W10sIHRydWUpO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLndhcm4oXCJGYXN0IGxvYWQgZmFpbGVkXCIsIGUpO1xuICAgIH1cbiAgfTtcblxuICBjb25zdCBiZ0xvYWQgPSBhc3luYyAoKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgW2JnUmVzLCBjdywgYXddID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgICAgICAgZmV0Y2hTdGF0ZSgpLFxuICAgICAgICAgICAgY2hyb21lLndpbmRvd3MuZ2V0Q3VycmVudCgpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCksXG4gICAgICAgICAgICBjaHJvbWUud2luZG93cy5nZXRBbGwoeyB3aW5kb3dUeXBlczogW1wibm9ybWFsXCJdLCBwb3B1bGF0ZTogdHJ1ZSB9KS5jYXRjaCgoKSA9PiBbXSlcbiAgICAgICAgXSk7XG5cbiAgICAgICAgYmdGaW5pc2hlZCA9IHRydWU7IC8vIE1hcmsgYXMgZmluaXNoZWQgc28gZmFzdCBsb2FkIGRvZXNuJ3Qgb3ZlcndyaXRlIGlmIGl0J3Mgc29tZWhvdyBzbG93XG5cbiAgICAgICAgaWYgKGJnUmVzLm9rICYmIGJnUmVzLmRhdGEpIHtcbiAgICAgICAgICAgICB1cGRhdGVVSShiZ1Jlcy5kYXRhLCBjdywgYXcgYXMgY2hyb21lLndpbmRvd3MuV2luZG93W10pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBsb2FkIHN0YXRlOlwiLCBiZ1Jlcy5lcnJvciA/PyBcIlVua25vd24gZXJyb3JcIik7XG4gICAgICAgICAgICBpZiAod2luZG93U3RhdGUubGVuZ3RoID09PSAwKSB7IC8vIE9ubHkgc2hvdyBlcnJvciBpZiB3ZSBoYXZlIE5PVEhJTkcgc2hvd25cbiAgICAgICAgICAgICAgICB3aW5kb3dzQ29udGFpbmVyLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPVwiZXJyb3Itc3RhdGVcIiBzdHlsZT1cInBhZGRpbmc6IDIwcHg7IGNvbG9yOiB2YXIoLS1lcnJvci1jb2xvciwgcmVkKTsgdGV4dC1hbGlnbjogY2VudGVyO1wiPlxuICAgICAgICAgICAgICAgICAgICBGYWlsZWQgdG8gbG9hZCB0YWJzOiAke2JnUmVzLmVycm9yID8/IFwiVW5rbm93biBlcnJvclwifS48YnI+XG4gICAgICAgICAgICAgICAgICAgIFBsZWFzZSByZWxvYWQgdGhlIGV4dGVuc2lvbiBvciBjaGVjayBwZXJtaXNzaW9ucy5cbiAgICAgICAgICAgICAgICA8L2Rpdj5gO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3IgbG9hZGluZyBzdGF0ZTpcIiwgZSk7XG4gICAgfVxuICB9O1xuXG4gIC8vIFN0YXJ0IGJvdGggY29uY3VycmVudGx5XG4gIGF3YWl0IFByb21pc2UuYWxsKFtmYXN0TG9hZCgpLCBiZ0xvYWQoKV0pO1xufTtcblxuY29uc3QgZ2V0U2VsZWN0ZWRTb3J0aW5nID0gKCk6IFNvcnRpbmdTdHJhdGVneVtdID0+IHtcbiAgICAvLyBSZWFkIGZyb20gRE9NIHRvIGdldCBjdXJyZW50IG9yZGVyIG9mIGFjdGl2ZSBzdHJhdGVnaWVzXG4gICAgcmV0dXJuIEFycmF5LmZyb20oYWN0aXZlU3RyYXRlZ2llc0xpc3QuY2hpbGRyZW4pXG4gICAgICAgIC5tYXAocm93ID0+IChyb3cgYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXQuaWQgYXMgU29ydGluZ1N0cmF0ZWd5KTtcbn07XG5cbi8vIEFkZCBsaXN0ZW5lciBmb3Igc2VsZWN0XG5hZGRTdHJhdGVneVNlbGVjdC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBhc3luYyAoZSkgPT4ge1xuICAgIGNvbnN0IHNlbGVjdCA9IGUudGFyZ2V0IGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgIGNvbnN0IGlkID0gc2VsZWN0LnZhbHVlO1xuICAgIGlmIChpZCkge1xuICAgICAgICBhd2FpdCB0b2dnbGVTdHJhdGVneShpZCwgdHJ1ZSk7XG4gICAgICAgIHNlbGVjdC52YWx1ZSA9IFwiXCI7IC8vIFJlc2V0IHRvIHBsYWNlaG9sZGVyXG4gICAgfVxufSk7XG5cbmNvbnN0IHRyaWdnZXJHcm91cCA9IGFzeW5jIChzZWxlY3Rpb24/OiBHcm91cGluZ1NlbGVjdGlvbikgPT4ge1xuICAgIGxvZ0luZm8oXCJUcmlnZ2VyaW5nIGdyb3VwaW5nXCIsIHsgc2VsZWN0aW9uIH0pO1xuICAgIHNob3dMb2FkaW5nKFwiQXBwbHlpbmcgU3RyYXRlZ3kuLi5cIik7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgc29ydGluZyA9IGdldFNlbGVjdGVkU29ydGluZygpO1xuICAgICAgICBhd2FpdCBhcHBseUdyb3VwaW5nKHsgc2VsZWN0aW9uLCBzb3J0aW5nIH0pO1xuICAgICAgICBhd2FpdCBsb2FkU3RhdGUoKTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgICBoaWRlTG9hZGluZygpO1xuICAgIH1cbn07XG5cbmNocm9tZS5ydW50aW1lLm9uTWVzc2FnZS5hZGRMaXN0ZW5lcigobWVzc2FnZSkgPT4ge1xuICAgIGlmIChtZXNzYWdlLnR5cGUgPT09ICdncm91cGluZ1Byb2dyZXNzJykge1xuICAgICAgICBjb25zdCB7IGNvbXBsZXRlZCwgdG90YWwgfSA9IG1lc3NhZ2UucGF5bG9hZDtcbiAgICAgICAgdXBkYXRlUHJvZ3Jlc3MoY29tcGxldGVkLCB0b3RhbCk7XG4gICAgfVxufSk7XG5cbi8vIExpc3RlbmVyc1xuc2VsZWN0QWxsQ2hlY2tib3guYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCAoZSkgPT4ge1xuICAgIGNvbnN0IHRhcmdldFN0YXRlID0gKGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLmNoZWNrZWQ7XG4gICAgaWYgKHRhcmdldFN0YXRlKSB7XG4gICAgICAgIC8vIFNlbGVjdCBBbGxcbiAgICAgICAgd2luZG93U3RhdGUuZm9yRWFjaCh3aW4gPT4ge1xuICAgICAgICAgICAgd2luLnRhYnMuZm9yRWFjaCh0YWIgPT4gc2VsZWN0ZWRUYWJzLmFkZCh0YWIuaWQpKTtcbiAgICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgLy8gRGVzZWxlY3QgQWxsXG4gICAgICAgIHNlbGVjdGVkVGFicy5jbGVhcigpO1xuICAgIH1cbiAgICByZW5kZXJUcmVlKCk7XG59KTtcblxuYnRuQXBwbHk/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgbG9nSW5mbyhcIkFwcGx5IGJ1dHRvbiBjbGlja2VkXCIsIHsgc2VsZWN0ZWRDb3VudDogc2VsZWN0ZWRUYWJzLnNpemUgfSk7XG4gICAgdHJpZ2dlckdyb3VwKHsgdGFiSWRzOiBBcnJheS5mcm9tKHNlbGVjdGVkVGFicykgfSk7XG59KTtcblxuYnRuVW5ncm91cC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICBpZiAoY29uZmlybShgVW5ncm91cCAke3NlbGVjdGVkVGFicy5zaXplfSB0YWJzP2ApKSB7XG4gICAgICBsb2dJbmZvKFwiVW5ncm91cGluZyB0YWJzXCIsIHsgY291bnQ6IHNlbGVjdGVkVGFicy5zaXplIH0pO1xuICAgICAgYXdhaXQgY2hyb21lLnRhYnMudW5ncm91cChBcnJheS5mcm9tKHNlbGVjdGVkVGFicykpO1xuICAgICAgYXdhaXQgbG9hZFN0YXRlKCk7XG4gIH1cbn0pO1xuYnRuTWVyZ2UuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgaWYgKGNvbmZpcm0oYE1lcmdlICR7c2VsZWN0ZWRUYWJzLnNpemV9IHRhYnMgaW50byBvbmUgZ3JvdXA/YCkpIHtcbiAgICAgIGxvZ0luZm8oXCJNZXJnaW5nIHRhYnNcIiwgeyBjb3VudDogc2VsZWN0ZWRUYWJzLnNpemUgfSk7XG4gICAgICBjb25zdCByZXMgPSBhd2FpdCBzZW5kTWVzc2FnZShcIm1lcmdlU2VsZWN0aW9uXCIsIHsgdGFiSWRzOiBBcnJheS5mcm9tKHNlbGVjdGVkVGFicykgfSk7XG4gICAgICBpZiAoIXJlcy5vaykgYWxlcnQoXCJNZXJnZSBmYWlsZWQ6IFwiICsgcmVzLmVycm9yKTtcbiAgICAgIGVsc2UgYXdhaXQgbG9hZFN0YXRlKCk7XG4gIH1cbn0pO1xuYnRuU3BsaXQuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgaWYgKGNvbmZpcm0oYFNwbGl0ICR7c2VsZWN0ZWRUYWJzLnNpemV9IHRhYnMgaW50byBhIG5ldyB3aW5kb3c/YCkpIHtcbiAgICAgIGxvZ0luZm8oXCJTcGxpdHRpbmcgdGFic1wiLCB7IGNvdW50OiBzZWxlY3RlZFRhYnMuc2l6ZSB9KTtcbiAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHNlbmRNZXNzYWdlKFwic3BsaXRTZWxlY3Rpb25cIiwgeyB0YWJJZHM6IEFycmF5LmZyb20oc2VsZWN0ZWRUYWJzKSB9KTtcbiAgICAgIGlmICghcmVzLm9rKSBhbGVydChcIlNwbGl0IGZhaWxlZDogXCIgKyByZXMuZXJyb3IpO1xuICAgICAgZWxzZSBhd2FpdCBsb2FkU3RhdGUoKTtcbiAgfVxufSk7XG5cbmJ0bkV4cGFuZEFsbD8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICB3aW5kb3dTdGF0ZS5mb3JFYWNoKHdpbiA9PiB7XG4gICAgICAgIGV4cGFuZGVkTm9kZXMuYWRkKGB3LSR7d2luLmlkfWApO1xuICAgICAgICB3aW4udGFicy5mb3JFYWNoKHRhYiA9PiB7XG4gICAgICAgICAgICBpZiAodGFiLmdyb3VwTGFiZWwpIHtcbiAgICAgICAgICAgICAgICAgZXhwYW5kZWROb2Rlcy5hZGQoYHctJHt3aW4uaWR9LWctJHt0YWIuZ3JvdXBMYWJlbH1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfSk7XG4gICAgcmVuZGVyVHJlZSgpO1xufSk7XG5cbmJ0bkNvbGxhcHNlQWxsPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIGV4cGFuZGVkTm9kZXMuY2xlYXIoKTtcbiAgICByZW5kZXJUcmVlKCk7XG59KTtcblxuXG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0blVuZG9cIik/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIGxvZ0luZm8oXCJVbmRvIGNsaWNrZWRcIik7XG4gIGNvbnN0IHJlcyA9IGF3YWl0IHNlbmRNZXNzYWdlKFwidW5kb1wiKTtcbiAgaWYgKCFyZXMub2spIGFsZXJ0KFwiVW5kbyBmYWlsZWQ6IFwiICsgcmVzLmVycm9yKTtcbn0pO1xuXG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0blNhdmVTdGF0ZVwiKT8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgY29uc3QgbmFtZSA9IHByb21wdChcIkVudGVyIGEgbmFtZSBmb3IgdGhpcyBzdGF0ZTpcIik7XG4gIGlmIChuYW1lKSB7XG4gICAgbG9nSW5mbyhcIlNhdmluZyBzdGF0ZVwiLCB7IG5hbWUgfSk7XG4gICAgY29uc3QgcmVzID0gYXdhaXQgc2VuZE1lc3NhZ2UoXCJzYXZlU3RhdGVcIiwgeyBuYW1lIH0pO1xuICAgIGlmICghcmVzLm9rKSBhbGVydChcIlNhdmUgZmFpbGVkOiBcIiArIHJlcy5lcnJvcik7XG4gIH1cbn0pO1xuXG5jb25zdCBsb2FkU3RhdGVEaWFsb2cgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImxvYWRTdGF0ZURpYWxvZ1wiKSBhcyBIVE1MRGlhbG9nRWxlbWVudDtcbmNvbnN0IHNhdmVkU3RhdGVMaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzYXZlZFN0YXRlTGlzdFwiKSBhcyBIVE1MRWxlbWVudDtcblxuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5Mb2FkU3RhdGVcIik/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIGxvZ0luZm8oXCJPcGVuaW5nIExvYWQgU3RhdGUgZGlhbG9nXCIpO1xuICBjb25zdCByZXMgPSBhd2FpdCBzZW5kTWVzc2FnZTxTYXZlZFN0YXRlW10+KFwiZ2V0U2F2ZWRTdGF0ZXNcIik7XG4gIGlmIChyZXMub2sgJiYgcmVzLmRhdGEpIHtcbiAgICBzYXZlZFN0YXRlTGlzdC5pbm5lckhUTUwgPSBcIlwiO1xuICAgIHJlcy5kYXRhLmZvckVhY2goKHN0YXRlKSA9PiB7XG4gICAgICBjb25zdCBsaSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJsaVwiKTtcbiAgICAgIGxpLnN0eWxlLmRpc3BsYXkgPSBcImZsZXhcIjtcbiAgICAgIGxpLnN0eWxlLmp1c3RpZnlDb250ZW50ID0gXCJzcGFjZS1iZXR3ZWVuXCI7XG4gICAgICBsaS5zdHlsZS5wYWRkaW5nID0gXCI4cHhcIjtcbiAgICAgIGxpLnN0eWxlLmJvcmRlckJvdHRvbSA9IFwiMXB4IHNvbGlkIHZhcigtLWJvcmRlci1jb2xvcilcIjtcblxuICAgICAgY29uc3Qgc3BhbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICAgICAgc3Bhbi50ZXh0Q29udGVudCA9IGAke3N0YXRlLm5hbWV9ICgke25ldyBEYXRlKHN0YXRlLnRpbWVzdGFtcCkudG9Mb2NhbGVTdHJpbmcoKX0pYDtcbiAgICAgIHNwYW4uc3R5bGUuY3Vyc29yID0gXCJwb2ludGVyXCI7XG4gICAgICBzcGFuLm9uY2xpY2sgPSBhc3luYyAoKSA9PiB7XG4gICAgICAgIGlmIChjb25maXJtKGBMb2FkIHN0YXRlIFwiJHtzdGF0ZS5uYW1lfVwiP2ApKSB7XG4gICAgICAgICAgbG9nSW5mbyhcIlJlc3RvcmluZyBzdGF0ZVwiLCB7IG5hbWU6IHN0YXRlLm5hbWUgfSk7XG4gICAgICAgICAgY29uc3QgciA9IGF3YWl0IHNlbmRNZXNzYWdlKFwicmVzdG9yZVN0YXRlXCIsIHsgc3RhdGUgfSk7XG4gICAgICAgICAgaWYgKHIub2spIHtcbiAgICAgICAgICAgICAgbG9hZFN0YXRlRGlhbG9nLmNsb3NlKCk7XG4gICAgICAgICAgICAgIHdpbmRvdy5jbG9zZSgpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGFsZXJ0KFwiUmVzdG9yZSBmYWlsZWQ6IFwiICsgci5lcnJvcik7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9O1xuXG4gICAgICBjb25zdCBkZWxCdG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICAgICAgZGVsQnRuLnRleHRDb250ZW50ID0gXCJEZWxldGVcIjtcbiAgICAgIGRlbEJ0bi5zdHlsZS5tYXJnaW5MZWZ0ID0gXCI4cHhcIjtcbiAgICAgIGRlbEJ0bi5zdHlsZS5iYWNrZ3JvdW5kID0gXCJ0cmFuc3BhcmVudFwiO1xuICAgICAgZGVsQnRuLnN0eWxlLmNvbG9yID0gXCJ2YXIoLS10ZXh0LWNvbG9yKVwiO1xuICAgICAgZGVsQnRuLnN0eWxlLmJvcmRlciA9IFwiMXB4IHNvbGlkIHZhcigtLWJvcmRlci1jb2xvcilcIjtcbiAgICAgIGRlbEJ0bi5zdHlsZS5ib3JkZXJSYWRpdXMgPSBcIjRweFwiO1xuICAgICAgZGVsQnRuLnN0eWxlLnBhZGRpbmcgPSBcIjJweCA2cHhcIjtcbiAgICAgIGRlbEJ0bi5vbmNsaWNrID0gYXN5bmMgKGUpID0+IHtcbiAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgIGlmIChjb25maXJtKGBEZWxldGUgc3RhdGUgXCIke3N0YXRlLm5hbWV9XCI/YCkpIHtcbiAgICAgICAgICAgICAgYXdhaXQgc2VuZE1lc3NhZ2UoXCJkZWxldGVTYXZlZFN0YXRlXCIsIHsgbmFtZTogc3RhdGUubmFtZSB9KTtcbiAgICAgICAgICAgICAgbGkucmVtb3ZlKCk7XG4gICAgICAgICAgfVxuICAgICAgfTtcblxuICAgICAgbGkuYXBwZW5kQ2hpbGQoc3Bhbik7XG4gICAgICBsaS5hcHBlbmRDaGlsZChkZWxCdG4pO1xuICAgICAgc2F2ZWRTdGF0ZUxpc3QuYXBwZW5kQ2hpbGQobGkpO1xuICAgIH0pO1xuICAgIGxvYWRTdGF0ZURpYWxvZy5zaG93TW9kYWwoKTtcbiAgfSBlbHNlIHtcbiAgICAgIGFsZXJ0KFwiRmFpbGVkIHRvIGxvYWQgc3RhdGVzOiBcIiArIHJlcy5lcnJvcik7XG4gIH1cbn0pO1xuXG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0bkNsb3NlTG9hZFN0YXRlXCIpPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIGxvYWRTdGF0ZURpYWxvZy5jbG9zZSgpO1xufSk7XG5cbnNlYXJjaElucHV0LmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCByZW5kZXJUcmVlKTtcblxuLy8gQXV0by1yZWZyZXNoXG5jaHJvbWUudGFicy5vblVwZGF0ZWQuYWRkTGlzdGVuZXIoKCkgPT4gbG9hZFN0YXRlKCkpO1xuY2hyb21lLnRhYnMub25SZW1vdmVkLmFkZExpc3RlbmVyKCgpID0+IGxvYWRTdGF0ZSgpKTtcbmNocm9tZS53aW5kb3dzLm9uUmVtb3ZlZC5hZGRMaXN0ZW5lcigoKSA9PiBsb2FkU3RhdGUoKSk7XG5cbi8vIC0tLSBUaGVtZSBMb2dpYyAtLS1cbmNvbnN0IGJ0blRoZW1lID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5UaGVtZVwiKTtcbmNvbnN0IGljb25TdW4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImljb25TdW5cIik7XG5jb25zdCBpY29uTW9vbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaWNvbk1vb25cIik7XG5cbmNvbnN0IGFwcGx5VGhlbWUgPSAodGhlbWU6ICdsaWdodCcgfCAnZGFyaycsIHNhdmUgPSBmYWxzZSkgPT4ge1xuICAgIGlmICh0aGVtZSA9PT0gJ2xpZ2h0Jykge1xuICAgICAgICBkb2N1bWVudC5ib2R5LmNsYXNzTGlzdC5hZGQoJ2xpZ2h0LW1vZGUnKTtcbiAgICAgICAgaWYgKGljb25TdW4pIGljb25TdW4uc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG4gICAgICAgIGlmIChpY29uTW9vbikgaWNvbk1vb24uc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICB9IGVsc2Uge1xuICAgICAgICBkb2N1bWVudC5ib2R5LmNsYXNzTGlzdC5yZW1vdmUoJ2xpZ2h0LW1vZGUnKTtcbiAgICAgICAgaWYgKGljb25TdW4pIGljb25TdW4uc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgaWYgKGljb25Nb29uKSBpY29uTW9vbi5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcbiAgICB9XG5cbiAgICAvLyBTeW5jIHdpdGggUHJlZmVyZW5jZXNcbiAgICBpZiAoc2F2ZSkge1xuICAgICAgICAvLyBXZSB1c2Ugc2F2ZVByZWZlcmVuY2VzIHdoaWNoIGNhbGxzIHRoZSBiYWNrZ3JvdW5kIHRvIHN0b3JlIGl0XG4gICAgICAgIGxvZ0luZm8oXCJBcHBseWluZyB0aGVtZVwiLCB7IHRoZW1lIH0pO1xuICAgICAgICBzZW5kTWVzc2FnZShcInNhdmVQcmVmZXJlbmNlc1wiLCB7IHRoZW1lIH0pO1xuICAgIH1cbn07XG5cbi8vIEluaXRpYWwgbG9hZCBmYWxsYmFjayAoYmVmb3JlIGxvYWRTdGF0ZSBsb2FkcyBwcmVmcylcbmNvbnN0IHN0b3JlZFRoZW1lID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ3RoZW1lJykgYXMgJ2xpZ2h0JyB8ICdkYXJrJztcbi8vIElmIHdlIGhhdmUgYSBsb2NhbCBvdmVycmlkZSwgdXNlIGl0IHRlbXBvcmFyaWx5LCBidXQgbG9hZFN0YXRlIHdpbGwgYXV0aG9yaXRhdGl2ZSBjaGVjayBwcmVmc1xuaWYgKHN0b3JlZFRoZW1lKSBhcHBseVRoZW1lKHN0b3JlZFRoZW1lLCBmYWxzZSk7XG5cbmJ0blRoZW1lPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICBjb25zdCBpc0xpZ2h0ID0gZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QuY29udGFpbnMoJ2xpZ2h0LW1vZGUnKTtcbiAgICBjb25zdCBuZXdUaGVtZSA9IGlzTGlnaHQgPyAnZGFyaycgOiAnbGlnaHQnO1xuICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCd0aGVtZScsIG5ld1RoZW1lKTsgLy8gS2VlcCBsb2NhbCBjb3B5IGZvciBmYXN0IGJvb3RcbiAgICBhcHBseVRoZW1lKG5ld1RoZW1lLCB0cnVlKTtcbn0pO1xuXG4vLyAtLS0gU2V0dGluZ3MgTG9naWMgLS0tXG5jb25zdCBzZXR0aW5nc0RpYWxvZyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2V0dGluZ3NEaWFsb2dcIikgYXMgSFRNTERpYWxvZ0VsZW1lbnQ7XG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0blNldHRpbmdzXCIpPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldHRpbmdzRGlhbG9nLnNob3dNb2RhbCgpO1xufSk7XG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0bkNsb3NlU2V0dGluZ3NcIik/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgc2V0dGluZ3NEaWFsb2cuY2xvc2UoKTtcbn0pO1xuXG5jb25zdCBsb2dMZXZlbFNlbGVjdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibG9nTGV2ZWxTZWxlY3RcIikgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG5sb2dMZXZlbFNlbGVjdD8uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCBhc3luYyAoKSA9PiB7XG4gICAgY29uc3QgbmV3TGV2ZWwgPSBsb2dMZXZlbFNlbGVjdC52YWx1ZSBhcyBMb2dMZXZlbDtcbiAgICBpZiAocHJlZmVyZW5jZXMpIHtcbiAgICAgICAgcHJlZmVyZW5jZXMubG9nTGV2ZWwgPSBuZXdMZXZlbDtcbiAgICAgICAgLy8gVXBkYXRlIGxvY2FsIGxvZ2dlciBpbW1lZGlhdGVseVxuICAgICAgICBzZXRMb2dnZXJQcmVmZXJlbmNlcyhwcmVmZXJlbmNlcyk7XG4gICAgICAgIC8vIFBlcnNpc3RcbiAgICAgICAgYXdhaXQgc2VuZE1lc3NhZ2UoXCJzYXZlUHJlZmVyZW5jZXNcIiwgeyBsb2dMZXZlbDogbmV3TGV2ZWwgfSk7XG4gICAgICAgIGxvZ0RlYnVnKFwiTG9nIGxldmVsIHVwZGF0ZWRcIiwgeyBsZXZlbDogbmV3TGV2ZWwgfSk7XG4gICAgfVxufSk7XG5cbi8vIC0tLSBQaW4gJiBSZXNpemUgTG9naWMgLS0tXG5jb25zdCBidG5QaW4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0blBpblwiKTtcbmJ0blBpbj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgY29uc3QgdXJsID0gY2hyb21lLnJ1bnRpbWUuZ2V0VVJMKFwidWkvcG9wdXAuaHRtbFwiKTtcbiAgYXdhaXQgY2hyb21lLndpbmRvd3MuY3JlYXRlKHtcbiAgICB1cmwsXG4gICAgdHlwZTogXCJwb3B1cFwiLFxuICAgIHdpZHRoOiBkb2N1bWVudC5ib2R5Lm9mZnNldFdpZHRoLFxuICAgIGhlaWdodDogZG9jdW1lbnQuYm9keS5vZmZzZXRIZWlnaHRcbiAgfSk7XG4gIHdpbmRvdy5jbG9zZSgpO1xufSk7XG5cbmNvbnN0IHJlc2l6ZUhhbmRsZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicmVzaXplSGFuZGxlXCIpO1xuaWYgKHJlc2l6ZUhhbmRsZSkge1xuICBjb25zdCBzYXZlU2l6ZSA9ICh3OiBudW1iZXIsIGg6IG51bWJlcikgPT4ge1xuICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oXCJwb3B1cFNpemVcIiwgSlNPTi5zdHJpbmdpZnkoeyB3aWR0aDogdywgaGVpZ2h0OiBoIH0pKTtcbiAgfTtcblxuICByZXNpemVIYW5kbGUuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlZG93blwiLCAoZSkgPT4ge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgY29uc3Qgc3RhcnRYID0gZS5jbGllbnRYO1xuICAgICAgY29uc3Qgc3RhcnRZID0gZS5jbGllbnRZO1xuICAgICAgY29uc3Qgc3RhcnRXaWR0aCA9IGRvY3VtZW50LmJvZHkub2Zmc2V0V2lkdGg7XG4gICAgICBjb25zdCBzdGFydEhlaWdodCA9IGRvY3VtZW50LmJvZHkub2Zmc2V0SGVpZ2h0O1xuXG4gICAgICBjb25zdCBvbk1vdXNlTW92ZSA9IChldjogTW91c2VFdmVudCkgPT4ge1xuICAgICAgICAgIGNvbnN0IG5ld1dpZHRoID0gTWF0aC5tYXgoNTAwLCBzdGFydFdpZHRoICsgKGV2LmNsaWVudFggLSBzdGFydFgpKTtcbiAgICAgICAgICBjb25zdCBuZXdIZWlnaHQgPSBNYXRoLm1heCg1MDAsIHN0YXJ0SGVpZ2h0ICsgKGV2LmNsaWVudFkgLSBzdGFydFkpKTtcbiAgICAgICAgICBkb2N1bWVudC5ib2R5LnN0eWxlLndpZHRoID0gYCR7bmV3V2lkdGh9cHhgO1xuICAgICAgICAgIGRvY3VtZW50LmJvZHkuc3R5bGUuaGVpZ2h0ID0gYCR7bmV3SGVpZ2h0fXB4YDtcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IG9uTW91c2VVcCA9IChldjogTW91c2VFdmVudCkgPT4ge1xuICAgICAgICAgICBjb25zdCBuZXdXaWR0aCA9IE1hdGgubWF4KDUwMCwgc3RhcnRXaWR0aCArIChldi5jbGllbnRYIC0gc3RhcnRYKSk7XG4gICAgICAgICAgIGNvbnN0IG5ld0hlaWdodCA9IE1hdGgubWF4KDUwMCwgc3RhcnRIZWlnaHQgKyAoZXYuY2xpZW50WSAtIHN0YXJ0WSkpO1xuICAgICAgICAgICBzYXZlU2l6ZShuZXdXaWR0aCwgbmV3SGVpZ2h0KTtcbiAgICAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1vdXNlbW92ZVwiLCBvbk1vdXNlTW92ZSk7XG4gICAgICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb3VzZXVwXCIsIG9uTW91c2VVcCk7XG4gICAgICB9O1xuXG4gICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwibW91c2Vtb3ZlXCIsIG9uTW91c2VNb3ZlKTtcbiAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZXVwXCIsIG9uTW91c2VVcCk7XG4gIH0pO1xufVxuXG5jb25zdCBhZGp1c3RGb3JXaW5kb3dUeXBlID0gYXN5bmMgKCkgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHdpbiA9IGF3YWl0IGNocm9tZS53aW5kb3dzLmdldEN1cnJlbnQoKTtcbiAgICBpZiAod2luLnR5cGUgPT09IFwicG9wdXBcIikge1xuICAgICAgIGlmIChidG5QaW4pIGJ0blBpbi5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgICAgLy8gRW5hYmxlIHJlc2l6ZSBoYW5kbGUgaW4gcGlubmVkIG1vZGUgaWYgaXQgd2FzIGhpZGRlblxuICAgICAgIGlmIChyZXNpemVIYW5kbGUpIHJlc2l6ZUhhbmRsZS5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgICAgIGRvY3VtZW50LmJvZHkuc3R5bGUud2lkdGggPSBcIjEwMCVcIjtcbiAgICAgICBkb2N1bWVudC5ib2R5LnN0eWxlLmhlaWdodCA9IFwiMTAwJVwiO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIERpc2FibGUgcmVzaXplIGhhbmRsZSBpbiBkb2NrZWQgbW9kZVxuICAgICAgICBpZiAocmVzaXplSGFuZGxlKSByZXNpemVIYW5kbGUuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgICAgICAvLyBDbGVhciBhbnkgcHJldmlvdXMgc2l6ZSBvdmVycmlkZXNcbiAgICAgICAgZG9jdW1lbnQuYm9keS5zdHlsZS53aWR0aCA9IFwiXCI7XG4gICAgICAgIGRvY3VtZW50LmJvZHkuc3R5bGUuaGVpZ2h0ID0gXCJcIjtcbiAgICB9XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvciBjaGVja2luZyB3aW5kb3cgdHlwZTpcIiwgZSk7XG4gIH1cbn07XG5cbmFkanVzdEZvcldpbmRvd1R5cGUoKTtcbmxvYWRTdGF0ZSgpLmNhdGNoKGUgPT4gY29uc29sZS5lcnJvcihcIkxvYWQgc3RhdGUgZmFpbGVkXCIsIGUpKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFFTyxJQUFNLGVBQWUsQ0FBQyxRQUE2QztBQUN4RSxNQUFJLENBQUMsSUFBSSxNQUFNLENBQUMsSUFBSSxTQUFVLFFBQU87QUFDckMsU0FBTztBQUFBLElBQ0wsSUFBSSxJQUFJO0FBQUEsSUFDUixVQUFVLElBQUk7QUFBQSxJQUNkLE9BQU8sSUFBSSxTQUFTO0FBQUEsSUFDcEIsS0FBSyxJQUFJLE9BQU87QUFBQSxJQUNoQixRQUFRLFFBQVEsSUFBSSxNQUFNO0FBQUEsSUFDMUIsY0FBYyxJQUFJO0FBQUEsSUFDbEIsYUFBYSxJQUFJLGVBQWU7QUFBQSxJQUNoQyxZQUFZLElBQUk7QUFBQSxJQUNoQixTQUFTLElBQUk7QUFBQSxJQUNiLE9BQU8sSUFBSTtBQUFBLElBQ1gsUUFBUSxJQUFJO0FBQUEsSUFDWixRQUFRLElBQUk7QUFBQSxJQUNaLFVBQVUsSUFBSTtBQUFBLEVBQ2hCO0FBQ0Y7QUFFTyxJQUFNLHVCQUF1QixZQUF5QztBQUMzRSxTQUFPLElBQUksUUFBUSxDQUFDLFlBQVk7QUFDOUIsV0FBTyxRQUFRLE1BQU0sSUFBSSxlQUFlLENBQUMsVUFBVTtBQUNqRCxjQUFTLE1BQU0sYUFBYSxLQUFxQixJQUFJO0FBQUEsSUFDdkQsQ0FBQztBQUFBLEVBQ0gsQ0FBQztBQUNIO0FBRU8sSUFBTSxVQUFVLENBQUksVUFBd0I7QUFDL0MsTUFBSSxNQUFNLFFBQVEsS0FBSyxFQUFHLFFBQU87QUFDakMsU0FBTyxDQUFDO0FBQ1o7OztBQ25CTyxJQUFNLGFBQW1DO0FBQUEsRUFDNUMsRUFBRSxJQUFJLFVBQVUsT0FBTyxVQUFVLFlBQVksTUFBTSxXQUFXLE1BQU0sTUFBTSxDQUFDLFNBQVMsTUFBTSxFQUFFO0FBQUEsRUFDNUYsRUFBRSxJQUFJLGVBQWUsT0FBTyxlQUFlLFlB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
