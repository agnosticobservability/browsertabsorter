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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3NoYXJlZC91dGlscy50cyIsICIuLi8uLi9zcmMvc2hhcmVkL3N0cmF0ZWd5UmVnaXN0cnkudHMiLCAiLi4vLi4vc3JjL3NoYXJlZC9sb2dnZXIudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZ3JvdXBpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3NvcnRpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy91aS9sb2NhbFN0YXRlLnRzIiwgIi4uLy4uL3NyYy91aS9jb21tb24udHMiLCAiLi4vLi4vc3JjL3VpL3BvcHVwLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyBQcmVmZXJlbmNlcywgU29ydGluZ1N0cmF0ZWd5LCBUYWJNZXRhZGF0YSB9IGZyb20gXCIuL3R5cGVzLmpzXCI7XG5cbmV4cG9ydCBjb25zdCBtYXBDaHJvbWVUYWIgPSAodGFiOiBjaHJvbWUudGFicy5UYWIpOiBUYWJNZXRhZGF0YSB8IG51bGwgPT4ge1xuICBpZiAoIXRhYi5pZCB8fCAhdGFiLndpbmRvd0lkKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHtcbiAgICBpZDogdGFiLmlkLFxuICAgIHdpbmRvd0lkOiB0YWIud2luZG93SWQsXG4gICAgdGl0bGU6IHRhYi50aXRsZSB8fCBcIlVudGl0bGVkXCIsXG4gICAgdXJsOiB0YWIudXJsIHx8IFwiYWJvdXQ6YmxhbmtcIixcbiAgICBwaW5uZWQ6IEJvb2xlYW4odGFiLnBpbm5lZCksXG4gICAgbGFzdEFjY2Vzc2VkOiB0YWIubGFzdEFjY2Vzc2VkLFxuICAgIG9wZW5lclRhYklkOiB0YWIub3BlbmVyVGFiSWQgPz8gdW5kZWZpbmVkLFxuICAgIGZhdkljb25Vcmw6IHRhYi5mYXZJY29uVXJsLFxuICAgIGdyb3VwSWQ6IHRhYi5ncm91cElkLFxuICAgIGluZGV4OiB0YWIuaW5kZXgsXG4gICAgYWN0aXZlOiB0YWIuYWN0aXZlLFxuICAgIHN0YXR1czogdGFiLnN0YXR1cyxcbiAgICBzZWxlY3RlZDogdGFiLmhpZ2hsaWdodGVkXG4gIH07XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0U3RvcmVkUHJlZmVyZW5jZXMgPSBhc3luYyAoKTogUHJvbWlzZTxQcmVmZXJlbmNlcyB8IG51bGw+ID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFwicHJlZmVyZW5jZXNcIiwgKGl0ZW1zKSA9PiB7XG4gICAgICByZXNvbHZlKChpdGVtc1tcInByZWZlcmVuY2VzXCJdIGFzIFByZWZlcmVuY2VzKSA/PyBudWxsKTtcbiAgICB9KTtcbiAgfSk7XG59O1xuXG5leHBvcnQgY29uc3QgYXNBcnJheSA9IDxUPih2YWx1ZTogdW5rbm93bik6IFRbXSA9PiB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSByZXR1cm4gdmFsdWUgYXMgVFtdO1xuICAgIHJldHVybiBbXTtcbn07XG4iLCAiaW1wb3J0IHsgQ3VzdG9tU3RyYXRlZ3ksIFNvcnRpbmdTdHJhdGVneSB9IGZyb20gXCIuL3R5cGVzLmpzXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RyYXRlZ3lEZWZpbml0aW9uIHtcbiAgICBpZDogU29ydGluZ1N0cmF0ZWd5IHwgc3RyaW5nO1xuICAgIGxhYmVsOiBzdHJpbmc7XG4gICAgaXNHcm91cGluZzogYm9vbGVhbjtcbiAgICBpc1NvcnRpbmc6IGJvb2xlYW47XG4gICAgdGFncz86IHN0cmluZ1tdO1xuICAgIGF1dG9SdW4/OiBib29sZWFuO1xuICAgIGlzQ3VzdG9tPzogYm9vbGVhbjtcbn1cblxuLy8gUmVzdG9yZWQgc3RyYXRlZ2llcyBtYXRjaGluZyBiYWNrZ3JvdW5kIGNhcGFiaWxpdGllcy5cbmV4cG9ydCBjb25zdCBTVFJBVEVHSUVTOiBTdHJhdGVneURlZmluaXRpb25bXSA9IFtcbiAgICB7IGlkOiBcImRvbWFpblwiLCBsYWJlbDogXCJEb21haW5cIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImRvbWFpbl9mdWxsXCIsIGxhYmVsOiBcIkZ1bGwgRG9tYWluXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJ0b3BpY1wiLCBsYWJlbDogXCJUb3BpY1wiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwiY29udGV4dFwiLCBsYWJlbDogXCJDb250ZXh0XCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJsaW5lYWdlXCIsIGxhYmVsOiBcIkxpbmVhZ2VcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInBpbm5lZFwiLCBsYWJlbDogXCJQaW5uZWRcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInJlY2VuY3lcIiwgbGFiZWw6IFwiUmVjZW5jeVwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwiYWdlXCIsIGxhYmVsOiBcIkFnZVwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwidXJsXCIsIGxhYmVsOiBcIlVSTFwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwibmVzdGluZ1wiLCBsYWJlbDogXCJOZXN0aW5nXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJ0aXRsZVwiLCBsYWJlbDogXCJUaXRsZVwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuXTtcblxuZXhwb3J0IGNvbnN0IGdldFN0cmF0ZWdpZXMgPSAoY3VzdG9tU3RyYXRlZ2llcz86IEN1c3RvbVN0cmF0ZWd5W10pOiBTdHJhdGVneURlZmluaXRpb25bXSA9PiB7XG4gICAgaWYgKCFjdXN0b21TdHJhdGVnaWVzIHx8IGN1c3RvbVN0cmF0ZWdpZXMubGVuZ3RoID09PSAwKSByZXR1cm4gU1RSQVRFR0lFUztcblxuICAgIC8vIEN1c3RvbSBzdHJhdGVnaWVzIGNhbiBvdmVycmlkZSBidWlsdC1pbnMgaWYgSURzIG1hdGNoLCBvciBhZGQgbmV3IG9uZXMuXG4gICAgY29uc3QgY29tYmluZWQgPSBbLi4uU1RSQVRFR0lFU107XG5cbiAgICBjdXN0b21TdHJhdGVnaWVzLmZvckVhY2goY3VzdG9tID0+IHtcbiAgICAgICAgY29uc3QgZXhpc3RpbmdJbmRleCA9IGNvbWJpbmVkLmZpbmRJbmRleChzID0+IHMuaWQgPT09IGN1c3RvbS5pZCk7XG5cbiAgICAgICAgLy8gRGV0ZXJtaW5lIGNhcGFiaWxpdGllcyBiYXNlZCBvbiBydWxlcyBwcmVzZW5jZVxuICAgICAgICBjb25zdCBoYXNHcm91cGluZyA9IChjdXN0b20uZ3JvdXBpbmdSdWxlcyAmJiBjdXN0b20uZ3JvdXBpbmdSdWxlcy5sZW5ndGggPiAwKSB8fCAoY3VzdG9tLnJ1bGVzICYmIGN1c3RvbS5ydWxlcy5sZW5ndGggPiAwKSB8fCBmYWxzZTtcbiAgICAgICAgY29uc3QgaGFzU29ydGluZyA9IChjdXN0b20uc29ydGluZ1J1bGVzICYmIGN1c3RvbS5zb3J0aW5nUnVsZXMubGVuZ3RoID4gMCkgfHwgKGN1c3RvbS5ydWxlcyAmJiBjdXN0b20ucnVsZXMubGVuZ3RoID4gMCkgfHwgZmFsc2U7XG5cbiAgICAgICAgY29uc3QgdGFnczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgaWYgKGhhc0dyb3VwaW5nKSB0YWdzLnB1c2goXCJncm91cFwiKTtcbiAgICAgICAgaWYgKGhhc1NvcnRpbmcpIHRhZ3MucHVzaChcInNvcnRcIik7XG5cbiAgICAgICAgY29uc3QgZGVmaW5pdGlvbjogU3RyYXRlZ3lEZWZpbml0aW9uID0ge1xuICAgICAgICAgICAgaWQ6IGN1c3RvbS5pZCxcbiAgICAgICAgICAgIGxhYmVsOiBjdXN0b20ubGFiZWwsXG4gICAgICAgICAgICBpc0dyb3VwaW5nOiBoYXNHcm91cGluZyxcbiAgICAgICAgICAgIGlzU29ydGluZzogaGFzU29ydGluZyxcbiAgICAgICAgICAgIHRhZ3M6IHRhZ3MsXG4gICAgICAgICAgICBhdXRvUnVuOiBjdXN0b20uYXV0b1J1bixcbiAgICAgICAgICAgIGlzQ3VzdG9tOiB0cnVlXG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKGV4aXN0aW5nSW5kZXggIT09IC0xKSB7XG4gICAgICAgICAgICBjb21iaW5lZFtleGlzdGluZ0luZGV4XSA9IGRlZmluaXRpb247XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb21iaW5lZC5wdXNoKGRlZmluaXRpb24pO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gY29tYmluZWQ7XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0U3RyYXRlZ3kgPSAoaWQ6IFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZyk6IFN0cmF0ZWd5RGVmaW5pdGlvbiB8IHVuZGVmaW5lZCA9PiBTVFJBVEVHSUVTLmZpbmQocyA9PiBzLmlkID09PSBpZCk7XG4iLCAiaW1wb3J0IHsgTG9nRW50cnksIExvZ0xldmVsLCBQcmVmZXJlbmNlcyB9IGZyb20gXCIuL3R5cGVzLmpzXCI7XG5cbmNvbnN0IFBSRUZJWCA9IFwiW1RhYlNvcnRlcl1cIjtcblxuY29uc3QgTEVWRUxfUFJJT1JJVFk6IFJlY29yZDxMb2dMZXZlbCwgbnVtYmVyPiA9IHtcbiAgZGVidWc6IDAsXG4gIGluZm86IDEsXG4gIHdhcm46IDIsXG4gIGVycm9yOiAzLFxuICBjcml0aWNhbDogNFxufTtcblxubGV0IGN1cnJlbnRMZXZlbDogTG9nTGV2ZWwgPSBcImluZm9cIjtcbmxldCBsb2dzOiBMb2dFbnRyeVtdID0gW107XG5jb25zdCBNQVhfTE9HUyA9IDEwMDA7XG5jb25zdCBTVE9SQUdFX0tFWSA9IFwic2Vzc2lvbkxvZ3NcIjtcblxuLy8gU2FmZSBjb250ZXh0IGNoZWNrXG5jb25zdCBpc1NlcnZpY2VXb3JrZXIgPSB0eXBlb2Ygc2VsZiAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVvZiAoc2VsZiBhcyBhbnkpLlNlcnZpY2VXb3JrZXJHbG9iYWxTY29wZSAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYgaW5zdGFuY2VvZiAoc2VsZiBhcyBhbnkpLlNlcnZpY2VXb3JrZXJHbG9iYWxTY29wZTtcbmxldCBpc1NhdmluZyA9IGZhbHNlO1xubGV0IHBlbmRpbmdTYXZlID0gZmFsc2U7XG5sZXQgc2F2ZVRpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsO1xuXG5jb25zdCBkb1NhdmUgPSAoKSA9PiB7XG4gICAgaWYgKCFpc1NlcnZpY2VXb3JrZXIgfHwgIWNocm9tZT8uc3RvcmFnZT8uc2Vzc2lvbiB8fCBpc1NhdmluZykge1xuICAgICAgICBwZW5kaW5nU2F2ZSA9IHRydWU7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpc1NhdmluZyA9IHRydWU7XG4gICAgcGVuZGluZ1NhdmUgPSBmYWxzZTtcblxuICAgIGNocm9tZS5zdG9yYWdlLnNlc3Npb24uc2V0KHsgW1NUT1JBR0VfS0VZXTogbG9ncyB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgaXNTYXZpbmcgPSBmYWxzZTtcbiAgICAgICAgaWYgKHBlbmRpbmdTYXZlKSB7XG4gICAgICAgICAgICBzYXZlTG9nc1RvU3RvcmFnZSgpO1xuICAgICAgICB9XG4gICAgfSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBzYXZlIGxvZ3NcIiwgZXJyKTtcbiAgICAgICAgaXNTYXZpbmcgPSBmYWxzZTtcbiAgICB9KTtcbn07XG5cbmNvbnN0IHNhdmVMb2dzVG9TdG9yYWdlID0gKCkgPT4ge1xuICAgIGlmIChzYXZlVGltZXIpIGNsZWFyVGltZW91dChzYXZlVGltZXIpO1xuICAgIHNhdmVUaW1lciA9IHNldFRpbWVvdXQoZG9TYXZlLCAxMDAwKTtcbn07XG5cbmxldCByZXNvbHZlTG9nZ2VyUmVhZHk6ICgpID0+IHZvaWQ7XG5leHBvcnQgY29uc3QgbG9nZ2VyUmVhZHkgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcbiAgICByZXNvbHZlTG9nZ2VyUmVhZHkgPSByZXNvbHZlO1xufSk7XG5cbmV4cG9ydCBjb25zdCBpbml0TG9nZ2VyID0gYXN5bmMgKCkgPT4ge1xuICAgIGlmIChpc1NlcnZpY2VXb3JrZXIgJiYgY2hyb21lPy5zdG9yYWdlPy5zZXNzaW9uKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjaHJvbWUuc3RvcmFnZS5zZXNzaW9uLmdldChTVE9SQUdFX0tFWSk7XG4gICAgICAgICAgICBpZiAocmVzdWx0W1NUT1JBR0VfS0VZXSAmJiBBcnJheS5pc0FycmF5KHJlc3VsdFtTVE9SQUdFX0tFWV0pKSB7XG4gICAgICAgICAgICAgICAgbG9ncyA9IHJlc3VsdFtTVE9SQUdFX0tFWV07XG4gICAgICAgICAgICAgICAgaWYgKGxvZ3MubGVuZ3RoID4gTUFYX0xPR1MpIGxvZ3MgPSBsb2dzLnNsaWNlKDAsIE1BWF9MT0dTKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byByZXN0b3JlIGxvZ3NcIiwgZSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKHJlc29sdmVMb2dnZXJSZWFkeSkgcmVzb2x2ZUxvZ2dlclJlYWR5KCk7XG59O1xuXG5leHBvcnQgY29uc3Qgc2V0TG9nZ2VyUHJlZmVyZW5jZXMgPSAocHJlZnM6IFByZWZlcmVuY2VzKSA9PiB7XG4gIGlmIChwcmVmcy5sb2dMZXZlbCkge1xuICAgIGN1cnJlbnRMZXZlbCA9IHByZWZzLmxvZ0xldmVsO1xuICB9IGVsc2UgaWYgKHByZWZzLmRlYnVnKSB7XG4gICAgY3VycmVudExldmVsID0gXCJkZWJ1Z1wiO1xuICB9IGVsc2Uge1xuICAgIGN1cnJlbnRMZXZlbCA9IFwiaW5mb1wiO1xuICB9XG59O1xuXG5jb25zdCBzaG91bGRMb2cgPSAobGV2ZWw6IExvZ0xldmVsKTogYm9vbGVhbiA9PiB7XG4gIHJldHVybiBMRVZFTF9QUklPUklUWVtsZXZlbF0gPj0gTEVWRUxfUFJJT1JJVFlbY3VycmVudExldmVsXTtcbn07XG5cbmNvbnN0IGZvcm1hdE1lc3NhZ2UgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgcmV0dXJuIGNvbnRleHQgPyBgJHttZXNzYWdlfSA6OiAke0pTT04uc3RyaW5naWZ5KGNvbnRleHQpfWAgOiBtZXNzYWdlO1xufTtcblxuY29uc3QgYWRkTG9nID0gKGxldmVsOiBMb2dMZXZlbCwgbWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgLy8gQWx3YXlzIGFkZCB0byBidWZmZXIgcmVnYXJkbGVzcyBvZiBjdXJyZW50IGNvbnNvbGUgbGV2ZWwgc2V0dGluZyxcbiAgLy8gb3Igc2hvdWxkIHdlIHJlc3BlY3QgaXQ/IFVzdWFsbHkgZGVidWcgbG9ncyBhcmUgbm9pc3kuXG4gIC8vIExldCdzIHJlc3BlY3Qgc2hvdWxkTG9nIGZvciB0aGUgYnVmZmVyIHRvbyB0byBzYXZlIG1lbW9yeS9ub2lzZSxcbiAgLy8gT1Igd2UgY2FuIHN0b3JlIGV2ZXJ5dGhpbmcgYnV0IGZpbHRlciBvbiB2aWV3LlxuICAvLyBHaXZlbiB3ZSB3YW50IHRvIGRlYnVnIGlzc3Vlcywgc3RvcmluZyBldmVyeXRoaW5nIG1pZ2h0IGJlIGJldHRlcixcbiAgLy8gYnV0IGlmIHdlIHN0b3JlIGV2ZXJ5dGhpbmcgd2UgbWlnaHQgZmlsbCBidWZmZXIgd2l0aCBkZWJ1ZyBub2lzZSBxdWlja2x5LlxuICAvLyBMZXQncyBzdGljayB0byBzdG9yaW5nIHdoYXQgaXMgY29uZmlndXJlZCB0byBiZSBsb2dnZWQuXG4gIC8vIFdhaXQsIGlmIEkgd2FudCB0byBcImRlYnVnXCIgc29tZXRoaW5nLCBJIHVzdWFsbHkgdHVybiBvbiBkZWJ1ZyBsb2dzLlxuICAvLyBJZiBJIGNhbid0IHNlZSBwYXN0IGxvZ3MgYmVjYXVzZSB0aGV5IHdlcmVuJ3Qgc3RvcmVkLCBJIGhhdmUgdG8gcmVwcm8uXG4gIC8vIExldCdzIHN0b3JlIGlmIGl0IHBhc3NlcyBgc2hvdWxkTG9nYC5cblxuICBpZiAoc2hvdWxkTG9nKGxldmVsKSkge1xuICAgICAgY29uc3QgZW50cnk6IExvZ0VudHJ5ID0ge1xuICAgICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcbiAgICAgICAgICBsZXZlbCxcbiAgICAgICAgICBtZXNzYWdlLFxuICAgICAgICAgIGNvbnRleHRcbiAgICAgIH07XG5cbiAgICAgIGlmIChpc1NlcnZpY2VXb3JrZXIpIHtcbiAgICAgICAgICBsb2dzLnVuc2hpZnQoZW50cnkpO1xuICAgICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSB7XG4gICAgICAgICAgICAgIGxvZ3MucG9wKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIEluIG90aGVyIGNvbnRleHRzLCBzZW5kIHRvIFNXXG4gICAgICAgICAgaWYgKGNocm9tZT8ucnVudGltZT8uc2VuZE1lc3NhZ2UpIHtcbiAgICAgICAgICAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdsb2dFbnRyeScsIHBheWxvYWQ6IGVudHJ5IH0pLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgLy8gSWdub3JlIGlmIG1lc3NhZ2UgZmFpbHMgKGUuZy4gY29udGV4dCBpbnZhbGlkYXRlZClcbiAgICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICB9XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBhZGRMb2dFbnRyeSA9IChlbnRyeTogTG9nRW50cnkpID0+IHtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSB7XG4gICAgICAgIGxvZ3MudW5zaGlmdChlbnRyeSk7XG4gICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSB7XG4gICAgICAgICAgICBsb2dzLnBvcCgpO1xuICAgICAgICB9XG4gICAgICAgIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG4gICAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGdldExvZ3MgPSAoKSA9PiBbLi4ubG9nc107XG5leHBvcnQgY29uc3QgY2xlYXJMb2dzID0gKCkgPT4ge1xuICAgIGxvZ3MubGVuZ3RoID0gMDtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSBzYXZlTG9nc1RvU3RvcmFnZSgpO1xufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0RlYnVnID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImRlYnVnXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwiZGVidWdcIikpIHtcbiAgICBjb25zb2xlLmRlYnVnKGAke1BSRUZJWH0gW0RFQlVHXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgY29udGV4dCl9YCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBsb2dJbmZvID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImluZm9cIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJpbmZvXCIpKSB7XG4gICAgY29uc29sZS5pbmZvKGAke1BSRUZJWH0gW0lORk9dICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ1dhcm4gPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwid2FyblwiLCBtZXNzYWdlLCBjb250ZXh0KTtcbiAgaWYgKHNob3VsZExvZyhcIndhcm5cIikpIHtcbiAgICBjb25zb2xlLndhcm4oYCR7UFJFRklYfSBbV0FSTl0gJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nRXJyb3IgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwiZXJyb3JcIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJlcnJvclwiKSkge1xuICAgIGNvbnNvbGUuZXJyb3IoYCR7UFJFRklYfSBbRVJST1JdICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0NyaXRpY2FsID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImNyaXRpY2FsXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwiY3JpdGljYWxcIikpIHtcbiAgICAvLyBDcml0aWNhbCBsb2dzIHVzZSBlcnJvciBjb25zb2xlIGJ1dCB3aXRoIGRpc3RpbmN0IHByZWZpeCBhbmQgbWF5YmUgc3R5bGluZyBpZiBzdXBwb3J0ZWRcbiAgICBjb25zb2xlLmVycm9yKGAke1BSRUZJWH0gW0NSSVRJQ0FMXSBcdUQ4M0RcdURFQTggJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuIiwgImltcG9ydCB7IEdyb3VwaW5nU3RyYXRlZ3ksIFNvcnRpbmdTdHJhdGVneSwgVGFiR3JvdXAsIFRhYk1ldGFkYXRhLCBDdXN0b21TdHJhdGVneSwgU3RyYXRlZ3lSdWxlLCBSdWxlQ29uZGl0aW9uLCBHcm91cGluZ1J1bGUsIFNvcnRpbmdSdWxlIH0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgZ2V0U3RyYXRlZ2llcyB9IGZyb20gXCIuLi9zaGFyZWQvc3RyYXRlZ3lSZWdpc3RyeS5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcblxubGV0IGN1c3RvbVN0cmF0ZWdpZXM6IEN1c3RvbVN0cmF0ZWd5W10gPSBbXTtcblxuZXhwb3J0IGNvbnN0IHNldEN1c3RvbVN0cmF0ZWdpZXMgPSAoc3RyYXRlZ2llczogQ3VzdG9tU3RyYXRlZ3lbXSkgPT4ge1xuICAgIGN1c3RvbVN0cmF0ZWdpZXMgPSBzdHJhdGVnaWVzO1xufTtcblxuZXhwb3J0IGNvbnN0IGdldEN1c3RvbVN0cmF0ZWdpZXMgPSAoKTogQ3VzdG9tU3RyYXRlZ3lbXSA9PiBjdXN0b21TdHJhdGVnaWVzO1xuXG5jb25zdCBDT0xPUlMgPSBbXCJncmV5XCIsIFwiYmx1ZVwiLCBcInJlZFwiLCBcInllbGxvd1wiLCBcImdyZWVuXCIsIFwicGlua1wiLCBcInB1cnBsZVwiLCBcImN5YW5cIiwgXCJvcmFuZ2VcIl07XG5cbmNvbnN0IHJlZ2V4Q2FjaGUgPSBuZXcgTWFwPHN0cmluZywgUmVnRXhwPigpO1xuXG5leHBvcnQgY29uc3QgZG9tYWluRnJvbVVybCA9ICh1cmw6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcGFyc2VkID0gbmV3IFVSTCh1cmwpO1xuICAgIHJldHVybiBwYXJzZWQuaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sIFwiXCIpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGxvZ0RlYnVnKFwiRmFpbGVkIHRvIHBhcnNlIGRvbWFpblwiLCB7IHVybCwgZXJyb3I6IFN0cmluZyhlcnJvcikgfSk7XG4gICAgcmV0dXJuIFwidW5rbm93blwiO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3Qgc3ViZG9tYWluRnJvbVVybCA9ICh1cmw6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcGFyc2VkID0gbmV3IFVSTCh1cmwpO1xuICAgICAgICBsZXQgaG9zdG5hbWUgPSBwYXJzZWQuaG9zdG5hbWU7XG4gICAgICAgIC8vIFJlbW92ZSB3d3cuXG4gICAgICAgIGhvc3RuYW1lID0gaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sIFwiXCIpO1xuXG4gICAgICAgIGNvbnN0IHBhcnRzID0gaG9zdG5hbWUuc3BsaXQoJy4nKTtcbiAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDIpIHtcbiAgICAgICAgICAgICByZXR1cm4gcGFydHMuc2xpY2UoMCwgcGFydHMubGVuZ3RoIC0gMikuam9pbignLicpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBcIlwiO1xuICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gXCJcIjtcbiAgICB9XG59XG5cbmV4cG9ydCBjb25zdCBnZXRGaWVsZFZhbHVlID0gKHRhYjogVGFiTWV0YWRhdGEsIGZpZWxkOiBzdHJpbmcpOiBhbnkgPT4ge1xuICAgIHN3aXRjaChmaWVsZCkge1xuICAgICAgICBjYXNlICdpZCc6IHJldHVybiB0YWIuaWQ7XG4gICAgICAgIGNhc2UgJ2luZGV4JzogcmV0dXJuIHRhYi5pbmRleDtcbiAgICAgICAgY2FzZSAnd2luZG93SWQnOiByZXR1cm4gdGFiLndpbmRvd0lkO1xuICAgICAgICBjYXNlICdncm91cElkJzogcmV0dXJuIHRhYi5ncm91cElkO1xuICAgICAgICBjYXNlICd0aXRsZSc6IHJldHVybiB0YWIudGl0bGU7XG4gICAgICAgIGNhc2UgJ3VybCc6IHJldHVybiB0YWIudXJsO1xuICAgICAgICBjYXNlICdzdGF0dXMnOiByZXR1cm4gdGFiLnN0YXR1cztcbiAgICAgICAgY2FzZSAnYWN0aXZlJzogcmV0dXJuIHRhYi5hY3RpdmU7XG4gICAgICAgIGNhc2UgJ3NlbGVjdGVkJzogcmV0dXJuIHRhYi5zZWxlY3RlZDtcbiAgICAgICAgY2FzZSAncGlubmVkJzogcmV0dXJuIHRhYi5waW5uZWQ7XG4gICAgICAgIGNhc2UgJ29wZW5lclRhYklkJzogcmV0dXJuIHRhYi5vcGVuZXJUYWJJZDtcbiAgICAgICAgY2FzZSAnbGFzdEFjY2Vzc2VkJzogcmV0dXJuIHRhYi5sYXN0QWNjZXNzZWQ7XG4gICAgICAgIGNhc2UgJ2NvbnRleHQnOiByZXR1cm4gdGFiLmNvbnRleHQ7XG4gICAgICAgIGNhc2UgJ2dlbnJlJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uZ2VucmU7XG4gICAgICAgIGNhc2UgJ3NpdGVOYW1lJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uc2l0ZU5hbWU7XG4gICAgICAgIC8vIERlcml2ZWQgb3IgbWFwcGVkIGZpZWxkc1xuICAgICAgICBjYXNlICdkb21haW4nOiByZXR1cm4gZG9tYWluRnJvbVVybCh0YWIudXJsKTtcbiAgICAgICAgY2FzZSAnc3ViZG9tYWluJzogcmV0dXJuIHN1YmRvbWFpbkZyb21VcmwodGFiLnVybCk7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBpZiAoZmllbGQuaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICAgICAgICAgICByZXR1cm4gZmllbGQuc3BsaXQoJy4nKS5yZWR1Y2UoKG9iaiwga2V5KSA9PiAob2JqICYmIHR5cGVvZiBvYmogPT09ICdvYmplY3QnICYmIG9iaiAhPT0gbnVsbCkgPyAob2JqIGFzIGFueSlba2V5XSA6IHVuZGVmaW5lZCwgdGFiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiAodGFiIGFzIGFueSlbZmllbGRdO1xuICAgIH1cbn07XG5cbmNvbnN0IHN0cmlwVGxkID0gKGRvbWFpbjogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIGRvbWFpbi5yZXBsYWNlKC9cXC4oY29tfG9yZ3xnb3Z8bmV0fGVkdXxpbykkL2ksIFwiXCIpO1xufTtcblxuZXhwb3J0IGNvbnN0IHNlbWFudGljQnVja2V0ID0gKHRpdGxlOiBzdHJpbmcsIHVybDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3Qga2V5ID0gYCR7dGl0bGV9ICR7dXJsfWAudG9Mb3dlckNhc2UoKTtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImRvY1wiKSB8fCBrZXkuaW5jbHVkZXMoXCJyZWFkbWVcIikgfHwga2V5LmluY2x1ZGVzKFwiZ3VpZGVcIikpIHJldHVybiBcIkRvY3NcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcIm1haWxcIikgfHwga2V5LmluY2x1ZGVzKFwiaW5ib3hcIikpIHJldHVybiBcIkNoYXRcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImRhc2hib2FyZFwiKSB8fCBrZXkuaW5jbHVkZXMoXCJjb25zb2xlXCIpKSByZXR1cm4gXCJEYXNoXCI7XG4gIGlmIChrZXkuaW5jbHVkZXMoXCJpc3N1ZVwiKSB8fCBrZXkuaW5jbHVkZXMoXCJ0aWNrZXRcIikpIHJldHVybiBcIlRhc2tzXCI7XG4gIGlmIChrZXkuaW5jbHVkZXMoXCJkcml2ZVwiKSB8fCBrZXkuaW5jbHVkZXMoXCJzdG9yYWdlXCIpKSByZXR1cm4gXCJGaWxlc1wiO1xuICByZXR1cm4gXCJNaXNjXCI7XG59O1xuXG5leHBvcnQgY29uc3QgbmF2aWdhdGlvbktleSA9ICh0YWI6IFRhYk1ldGFkYXRhKTogc3RyaW5nID0+IHtcbiAgaWYgKHRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIGBjaGlsZC1vZi0ke3RhYi5vcGVuZXJUYWJJZH1gO1xuICB9XG4gIHJldHVybiBgd2luZG93LSR7dGFiLndpbmRvd0lkfWA7XG59O1xuXG5jb25zdCBnZXRSZWNlbmN5TGFiZWwgPSAobGFzdEFjY2Vzc2VkOiBudW1iZXIpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICBjb25zdCBkaWZmID0gbm93IC0gbGFzdEFjY2Vzc2VkO1xuICBpZiAoZGlmZiA8IDM2MDAwMDApIHJldHVybiBcIkp1c3Qgbm93XCI7IC8vIDFoXG4gIGlmIChkaWZmIDwgODY0MDAwMDApIHJldHVybiBcIlRvZGF5XCI7IC8vIDI0aFxuICBpZiAoZGlmZiA8IDE3MjgwMDAwMCkgcmV0dXJuIFwiWWVzdGVyZGF5XCI7IC8vIDQ4aFxuICBpZiAoZGlmZiA8IDYwNDgwMDAwMCkgcmV0dXJuIFwiVGhpcyBXZWVrXCI7IC8vIDdkXG4gIHJldHVybiBcIk9sZGVyXCI7XG59O1xuXG5jb25zdCBjb2xvckZvcktleSA9IChrZXk6IHN0cmluZywgb2Zmc2V0OiBudW1iZXIpOiBzdHJpbmcgPT4gQ09MT1JTWyhNYXRoLmFicyhoYXNoQ29kZShrZXkpKSArIG9mZnNldCkgJSBDT0xPUlMubGVuZ3RoXTtcblxuY29uc3QgaGFzaENvZGUgPSAodmFsdWU6IHN0cmluZyk6IG51bWJlciA9PiB7XG4gIGxldCBoYXNoID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB2YWx1ZS5sZW5ndGg7IGkgKz0gMSkge1xuICAgIGhhc2ggPSAoaGFzaCA8PCA1KSAtIGhhc2ggKyB2YWx1ZS5jaGFyQ29kZUF0KGkpO1xuICAgIGhhc2ggfD0gMDtcbiAgfVxuICByZXR1cm4gaGFzaDtcbn07XG5cbi8vIEhlbHBlciB0byBnZXQgYSBodW1hbi1yZWFkYWJsZSBsYWJlbCBjb21wb25lbnQgZnJvbSBhIHN0cmF0ZWd5IGFuZCBhIHNldCBvZiB0YWJzXG5jb25zdCBnZXRMYWJlbENvbXBvbmVudCA9IChzdHJhdGVneTogR3JvdXBpbmdTdHJhdGVneSB8IHN0cmluZywgdGFiczogVGFiTWV0YWRhdGFbXSwgYWxsVGFic01hcDogTWFwPG51bWJlciwgVGFiTWV0YWRhdGE+KTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gIGNvbnN0IGZpcnN0VGFiID0gdGFic1swXTtcbiAgaWYgKCFmaXJzdFRhYikgcmV0dXJuIFwiVW5rbm93blwiO1xuXG4gIC8vIENoZWNrIGN1c3RvbSBzdHJhdGVnaWVzIGZpcnN0XG4gIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5KTtcbiAgaWYgKGN1c3RvbSkge1xuICAgICAgcmV0dXJuIGdyb3VwaW5nS2V5KGZpcnN0VGFiLCBzdHJhdGVneSk7XG4gIH1cblxuICBzd2l0Y2ggKHN0cmF0ZWd5KSB7XG4gICAgY2FzZSBcImRvbWFpblwiOiB7XG4gICAgICBjb25zdCBzaXRlTmFtZXMgPSBuZXcgU2V0KHRhYnMubWFwKHQgPT4gdC5jb250ZXh0RGF0YT8uc2l0ZU5hbWUpLmZpbHRlcihCb29sZWFuKSk7XG4gICAgICBpZiAoc2l0ZU5hbWVzLnNpemUgPT09IDEpIHtcbiAgICAgICAgcmV0dXJuIHN0cmlwVGxkKEFycmF5LmZyb20oc2l0ZU5hbWVzKVswXSBhcyBzdHJpbmcpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHN0cmlwVGxkKGRvbWFpbkZyb21VcmwoZmlyc3RUYWIudXJsKSk7XG4gICAgfVxuICAgIGNhc2UgXCJkb21haW5fZnVsbFwiOlxuICAgICAgcmV0dXJuIGRvbWFpbkZyb21VcmwoZmlyc3RUYWIudXJsKTtcbiAgICBjYXNlIFwidG9waWNcIjpcbiAgICAgIHJldHVybiBzZW1hbnRpY0J1Y2tldChmaXJzdFRhYi50aXRsZSwgZmlyc3RUYWIudXJsKTtcbiAgICBjYXNlIFwibGluZWFnZVwiOlxuICAgICAgaWYgKGZpcnN0VGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgY29uc3QgcGFyZW50ID0gYWxsVGFic01hcC5nZXQoZmlyc3RUYWIub3BlbmVyVGFiSWQpO1xuICAgICAgICBpZiAocGFyZW50KSB7XG4gICAgICAgICAgY29uc3QgcGFyZW50VGl0bGUgPSBwYXJlbnQudGl0bGUubGVuZ3RoID4gMjAgPyBwYXJlbnQudGl0bGUuc3Vic3RyaW5nKDAsIDIwKSArIFwiLi4uXCIgOiBwYXJlbnQudGl0bGU7XG4gICAgICAgICAgcmV0dXJuIGBGcm9tOiAke3BhcmVudFRpdGxlfWA7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGBGcm9tOiBUYWIgJHtmaXJzdFRhYi5vcGVuZXJUYWJJZH1gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGBXaW5kb3cgJHtmaXJzdFRhYi53aW5kb3dJZH1gO1xuICAgIGNhc2UgXCJjb250ZXh0XCI6XG4gICAgICByZXR1cm4gZmlyc3RUYWIuY29udGV4dCB8fCBcIlVuY2F0ZWdvcml6ZWRcIjtcbiAgICBjYXNlIFwicGlubmVkXCI6XG4gICAgICByZXR1cm4gZmlyc3RUYWIucGlubmVkID8gXCJQaW5uZWRcIiA6IFwiVW5waW5uZWRcIjtcbiAgICBjYXNlIFwiYWdlXCI6XG4gICAgICByZXR1cm4gZ2V0UmVjZW5jeUxhYmVsKGZpcnN0VGFiLmxhc3RBY2Nlc3NlZCA/PyAwKTtcbiAgICBjYXNlIFwidXJsXCI6XG4gICAgICByZXR1cm4gXCJVUkwgR3JvdXBcIjtcbiAgICBjYXNlIFwicmVjZW5jeVwiOlxuICAgICAgcmV0dXJuIFwiVGltZSBHcm91cFwiO1xuICAgIGNhc2UgXCJuZXN0aW5nXCI6XG4gICAgICByZXR1cm4gZmlyc3RUYWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCA/IFwiQ2hpbGRyZW5cIiA6IFwiUm9vdHNcIjtcbiAgICBkZWZhdWx0OlxuICAgICAgY29uc3QgdmFsID0gZ2V0RmllbGRWYWx1ZShmaXJzdFRhYiwgc3RyYXRlZ3kpO1xuICAgICAgaWYgKHZhbCAhPT0gdW5kZWZpbmVkICYmIHZhbCAhPT0gbnVsbCkge1xuICAgICAgICAgIHJldHVybiBTdHJpbmcodmFsKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBcIlVua25vd25cIjtcbiAgfVxufTtcblxuY29uc3QgZ2VuZXJhdGVMYWJlbCA9IChcbiAgc3RyYXRlZ2llczogKEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcpW10sXG4gIHRhYnM6IFRhYk1ldGFkYXRhW10sXG4gIGFsbFRhYnNNYXA6IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhPlxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgbGFiZWxzID0gc3RyYXRlZ2llc1xuICAgIC5tYXAocyA9PiBnZXRMYWJlbENvbXBvbmVudChzLCB0YWJzLCBhbGxUYWJzTWFwKSlcbiAgICAuZmlsdGVyKGwgPT4gbCAmJiBsICE9PSBcIlVua25vd25cIiAmJiBsICE9PSBcIkdyb3VwXCIgJiYgbCAhPT0gXCJVUkwgR3JvdXBcIiAmJiBsICE9PSBcIlRpbWUgR3JvdXBcIiAmJiBsICE9PSBcIk1pc2NcIik7XG5cbiAgaWYgKGxhYmVscy5sZW5ndGggPT09IDApIHJldHVybiBcIkdyb3VwXCI7XG4gIHJldHVybiBBcnJheS5mcm9tKG5ldyBTZXQobGFiZWxzKSkuam9pbihcIiAtIFwiKTtcbn07XG5cbmNvbnN0IGdldFN0cmF0ZWd5Q29sb3JSdWxlID0gKHN0cmF0ZWd5SWQ6IHN0cmluZyk6IEdyb3VwaW5nUnVsZSB8IHVuZGVmaW5lZCA9PiB7XG4gICAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3lJZCk7XG4gICAgaWYgKCFjdXN0b20pIHJldHVybiB1bmRlZmluZWQ7XG5cbiAgICBjb25zdCBncm91cGluZ1J1bGVzTGlzdCA9IGFzQXJyYXk8R3JvdXBpbmdSdWxlPihjdXN0b20uZ3JvdXBpbmdSdWxlcyk7XG4gICAgLy8gSXRlcmF0ZSBtYW51YWxseSB0byBjaGVjayBjb2xvclxuICAgIGZvciAobGV0IGkgPSBncm91cGluZ1J1bGVzTGlzdC5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICBjb25zdCBydWxlID0gZ3JvdXBpbmdSdWxlc0xpc3RbaV07XG4gICAgICAgIGlmIChydWxlICYmIHJ1bGUuY29sb3IgJiYgcnVsZS5jb2xvciAhPT0gJ3JhbmRvbScpIHtcbiAgICAgICAgICAgIHJldHVybiBydWxlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB1bmRlZmluZWQ7XG59O1xuXG5jb25zdCByZXNvbHZlV2luZG93TW9kZSA9IChtb2RlczogKHN0cmluZyB8IHVuZGVmaW5lZClbXSk6IFwiY3VycmVudFwiIHwgXCJuZXdcIiB8IFwiY29tcG91bmRcIiA9PiB7XG4gICAgaWYgKG1vZGVzLmluY2x1ZGVzKFwibmV3XCIpKSByZXR1cm4gXCJuZXdcIjtcbiAgICBpZiAobW9kZXMuaW5jbHVkZXMoXCJjb21wb3VuZFwiKSkgcmV0dXJuIFwiY29tcG91bmRcIjtcbiAgICByZXR1cm4gXCJjdXJyZW50XCI7XG59O1xuXG5leHBvcnQgY29uc3QgZ3JvdXBUYWJzID0gKFxuICB0YWJzOiBUYWJNZXRhZGF0YVtdLFxuICBzdHJhdGVnaWVzOiAoU29ydGluZ1N0cmF0ZWd5IHwgc3RyaW5nKVtdXG4pOiBUYWJHcm91cFtdID0+IHtcbiAgY29uc3QgYXZhaWxhYmxlU3RyYXRlZ2llcyA9IGdldFN0cmF0ZWdpZXMoY3VzdG9tU3RyYXRlZ2llcyk7XG4gIGNvbnN0IGVmZmVjdGl2ZVN0cmF0ZWdpZXMgPSBzdHJhdGVnaWVzLmZpbHRlcihzID0+IGF2YWlsYWJsZVN0cmF0ZWdpZXMuZmluZChhdmFpbCA9PiBhdmFpbC5pZCA9PT0gcyk/LmlzR3JvdXBpbmcpO1xuICBjb25zdCBidWNrZXRzID0gbmV3IE1hcDxzdHJpbmcsIFRhYkdyb3VwPigpO1xuXG4gIGNvbnN0IGFsbFRhYnNNYXAgPSBuZXcgTWFwPG51bWJlciwgVGFiTWV0YWRhdGE+KCk7XG4gIHRhYnMuZm9yRWFjaCh0ID0+IGFsbFRhYnNNYXAuc2V0KHQuaWQsIHQpKTtcblxuICB0YWJzLmZvckVhY2goKHRhYikgPT4ge1xuICAgIGxldCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IGFwcGxpZWRTdHJhdGVnaWVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IGNvbGxlY3RlZE1vZGVzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgZm9yIChjb25zdCBzIG9mIGVmZmVjdGl2ZVN0cmF0ZWdpZXMpIHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGdldEdyb3VwaW5nUmVzdWx0KHRhYiwgcyk7XG4gICAgICAgICAgICBpZiAocmVzdWx0LmtleSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGtleXMucHVzaChgJHtzfToke3Jlc3VsdC5rZXl9YCk7XG4gICAgICAgICAgICAgICAgYXBwbGllZFN0cmF0ZWdpZXMucHVzaChzKTtcbiAgICAgICAgICAgICAgICBjb2xsZWN0ZWRNb2Rlcy5wdXNoKHJlc3VsdC5tb2RlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgbG9nRGVidWcoXCJFcnJvciBnZW5lcmF0aW5nIGdyb3VwaW5nIGtleVwiLCB7IHRhYklkOiB0YWIuaWQsIGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgIHJldHVybjsgLy8gU2tpcCB0aGlzIHRhYiBvbiBlcnJvclxuICAgIH1cblxuICAgIC8vIElmIG5vIHN0cmF0ZWdpZXMgYXBwbGllZCAoZS5nLiBhbGwgZmlsdGVyZWQgb3V0KSwgc2tpcCBncm91cGluZyBmb3IgdGhpcyB0YWJcbiAgICBpZiAoa2V5cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGVmZmVjdGl2ZU1vZGUgPSByZXNvbHZlV2luZG93TW9kZShjb2xsZWN0ZWRNb2Rlcyk7XG4gICAgY29uc3QgdmFsdWVLZXkgPSBrZXlzLmpvaW4oXCI6OlwiKTtcbiAgICBsZXQgYnVja2V0S2V5ID0gXCJcIjtcbiAgICBpZiAoZWZmZWN0aXZlTW9kZSA9PT0gJ2N1cnJlbnQnKSB7XG4gICAgICAgICBidWNrZXRLZXkgPSBgd2luZG93LSR7dGFiLndpbmRvd0lkfTo6YCArIHZhbHVlS2V5O1xuICAgIH0gZWxzZSB7XG4gICAgICAgICBidWNrZXRLZXkgPSBgZ2xvYmFsOjpgICsgdmFsdWVLZXk7XG4gICAgfVxuXG4gICAgbGV0IGdyb3VwID0gYnVja2V0cy5nZXQoYnVja2V0S2V5KTtcbiAgICBpZiAoIWdyb3VwKSB7XG4gICAgICBsZXQgZ3JvdXBDb2xvciA9IG51bGw7XG4gICAgICBsZXQgY29sb3JGaWVsZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG4gICAgICBmb3IgKGNvbnN0IHNJZCBvZiBhcHBsaWVkU3RyYXRlZ2llcykge1xuICAgICAgICBjb25zdCBydWxlID0gZ2V0U3RyYXRlZ3lDb2xvclJ1bGUoc0lkKTtcbiAgICAgICAgaWYgKHJ1bGUpIHtcbiAgICAgICAgICAgIGdyb3VwQ29sb3IgPSBydWxlLmNvbG9yO1xuICAgICAgICAgICAgY29sb3JGaWVsZCA9IHJ1bGUuY29sb3JGaWVsZDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChncm91cENvbG9yID09PSAnbWF0Y2gnKSB7XG4gICAgICAgIGdyb3VwQ29sb3IgPSBjb2xvckZvcktleSh2YWx1ZUtleSwgMCk7XG4gICAgICB9IGVsc2UgaWYgKGdyb3VwQ29sb3IgPT09ICdmaWVsZCcgJiYgY29sb3JGaWVsZCkge1xuICAgICAgICBjb25zdCB2YWwgPSBnZXRGaWVsZFZhbHVlKHRhYiwgY29sb3JGaWVsZCk7XG4gICAgICAgIGNvbnN0IGtleSA9IHZhbCAhPT0gdW5kZWZpbmVkICYmIHZhbCAhPT0gbnVsbCA/IFN0cmluZyh2YWwpIDogXCJcIjtcbiAgICAgICAgZ3JvdXBDb2xvciA9IGNvbG9yRm9yS2V5KGtleSwgMCk7XG4gICAgICB9IGVsc2UgaWYgKCFncm91cENvbG9yIHx8IGdyb3VwQ29sb3IgPT09ICdmaWVsZCcpIHtcbiAgICAgICAgZ3JvdXBDb2xvciA9IGNvbG9yRm9yS2V5KGJ1Y2tldEtleSwgYnVja2V0cy5zaXplKTtcbiAgICAgIH1cblxuICAgICAgZ3JvdXAgPSB7XG4gICAgICAgIGlkOiBidWNrZXRLZXksXG4gICAgICAgIHdpbmRvd0lkOiB0YWIud2luZG93SWQsXG4gICAgICAgIGxhYmVsOiBcIlwiLFxuICAgICAgICBjb2xvcjogZ3JvdXBDb2xvcixcbiAgICAgICAgdGFiczogW10sXG4gICAgICAgIHJlYXNvbjogYXBwbGllZFN0cmF0ZWdpZXMuam9pbihcIiArIFwiKSxcbiAgICAgICAgd2luZG93TW9kZTogZWZmZWN0aXZlTW9kZVxuICAgICAgfTtcbiAgICAgIGJ1Y2tldHMuc2V0KGJ1Y2tldEtleSwgZ3JvdXApO1xuICAgIH1cbiAgICBncm91cC50YWJzLnB1c2godGFiKTtcbiAgfSk7XG5cbiAgY29uc3QgZ3JvdXBzID0gQXJyYXkuZnJvbShidWNrZXRzLnZhbHVlcygpKTtcbiAgZ3JvdXBzLmZvckVhY2goZ3JvdXAgPT4ge1xuICAgIGdyb3VwLmxhYmVsID0gZ2VuZXJhdGVMYWJlbChlZmZlY3RpdmVTdHJhdGVnaWVzLCBncm91cC50YWJzLCBhbGxUYWJzTWFwKTtcbiAgfSk7XG5cbiAgcmV0dXJuIGdyb3Vwcztcbn07XG5cbmV4cG9ydCBjb25zdCBjaGVja0NvbmRpdGlvbiA9IChjb25kaXRpb246IFJ1bGVDb25kaXRpb24sIHRhYjogVGFiTWV0YWRhdGEpOiBib29sZWFuID0+IHtcbiAgICBpZiAoIWNvbmRpdGlvbikgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IHJhd1ZhbHVlID0gZ2V0RmllbGRWYWx1ZSh0YWIsIGNvbmRpdGlvbi5maWVsZCk7XG4gICAgY29uc3QgdmFsdWVUb0NoZWNrID0gcmF3VmFsdWUgIT09IHVuZGVmaW5lZCAmJiByYXdWYWx1ZSAhPT0gbnVsbCA/IFN0cmluZyhyYXdWYWx1ZSkudG9Mb3dlckNhc2UoKSA6IFwiXCI7XG4gICAgY29uc3QgcGF0dGVybiA9IGNvbmRpdGlvbi52YWx1ZSA/IGNvbmRpdGlvbi52YWx1ZS50b0xvd2VyQ2FzZSgpIDogXCJcIjtcblxuICAgIHN3aXRjaCAoY29uZGl0aW9uLm9wZXJhdG9yKSB7XG4gICAgICAgIGNhc2UgJ2NvbnRhaW5zJzogcmV0dXJuIHZhbHVlVG9DaGVjay5pbmNsdWRlcyhwYXR0ZXJuKTtcbiAgICAgICAgY2FzZSAnZG9lc05vdENvbnRhaW4nOiByZXR1cm4gIXZhbHVlVG9DaGVjay5pbmNsdWRlcyhwYXR0ZXJuKTtcbiAgICAgICAgY2FzZSAnZXF1YWxzJzogcmV0dXJuIHZhbHVlVG9DaGVjayA9PT0gcGF0dGVybjtcbiAgICAgICAgY2FzZSAnc3RhcnRzV2l0aCc6IHJldHVybiB2YWx1ZVRvQ2hlY2suc3RhcnRzV2l0aChwYXR0ZXJuKTtcbiAgICAgICAgY2FzZSAnZW5kc1dpdGgnOiByZXR1cm4gdmFsdWVUb0NoZWNrLmVuZHNXaXRoKHBhdHRlcm4pO1xuICAgICAgICBjYXNlICdleGlzdHMnOiByZXR1cm4gcmF3VmFsdWUgIT09IHVuZGVmaW5lZDtcbiAgICAgICAgY2FzZSAnZG9lc05vdEV4aXN0JzogcmV0dXJuIHJhd1ZhbHVlID09PSB1bmRlZmluZWQ7XG4gICAgICAgIGNhc2UgJ2lzTnVsbCc6IHJldHVybiByYXdWYWx1ZSA9PT0gbnVsbDtcbiAgICAgICAgY2FzZSAnaXNOb3ROdWxsJzogcmV0dXJuIHJhd1ZhbHVlICE9PSBudWxsO1xuICAgICAgICBjYXNlICdtYXRjaGVzJzpcbiAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgUmVnRXhwKGNvbmRpdGlvbi52YWx1ZSwgJ2knKS50ZXN0KHJhd1ZhbHVlICE9PSB1bmRlZmluZWQgJiYgcmF3VmFsdWUgIT09IG51bGwgPyBTdHJpbmcocmF3VmFsdWUpIDogXCJcIik7XG4gICAgICAgICAgICAgfSBjYXRjaCB7IHJldHVybiBmYWxzZTsgfVxuICAgICAgICBkZWZhdWx0OiByZXR1cm4gZmFsc2U7XG4gICAgfVxufTtcblxuZnVuY3Rpb24gZXZhbHVhdGVMZWdhY3lSdWxlcyhsZWdhY3lSdWxlczogU3RyYXRlZ3lSdWxlW10sIHRhYjogVGFiTWV0YWRhdGEpOiBzdHJpbmcgfCBudWxsIHtcbiAgICAvLyBEZWZlbnNpdmUgY2hlY2tcbiAgICBpZiAoIWxlZ2FjeVJ1bGVzIHx8ICFBcnJheS5pc0FycmF5KGxlZ2FjeVJ1bGVzKSkge1xuICAgICAgICBpZiAoIWxlZ2FjeVJ1bGVzKSByZXR1cm4gbnVsbDtcbiAgICAgICAgLy8gVHJ5IGFzQXJyYXkgaWYgaXQncyBub3QgYXJyYXkgYnV0IHRydXRoeSAodW5saWtlbHkgZ2l2ZW4gcHJldmlvdXMgbG9naWMgYnV0IHNhZmUpXG4gICAgfVxuXG4gICAgY29uc3QgbGVnYWN5UnVsZXNMaXN0ID0gYXNBcnJheTxTdHJhdGVneVJ1bGU+KGxlZ2FjeVJ1bGVzKTtcbiAgICBpZiAobGVnYWN5UnVsZXNMaXN0Lmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG5cbiAgICB0cnkge1xuICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgbGVnYWN5UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICBpZiAoIXJ1bGUpIGNvbnRpbnVlO1xuICAgICAgICAgICAgY29uc3QgcmF3VmFsdWUgPSBnZXRGaWVsZFZhbHVlKHRhYiwgcnVsZS5maWVsZCk7XG4gICAgICAgICAgICBsZXQgdmFsdWVUb0NoZWNrID0gcmF3VmFsdWUgIT09IHVuZGVmaW5lZCAmJiByYXdWYWx1ZSAhPT0gbnVsbCA/IFN0cmluZyhyYXdWYWx1ZSkgOiBcIlwiO1xuICAgICAgICAgICAgdmFsdWVUb0NoZWNrID0gdmFsdWVUb0NoZWNrLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICBjb25zdCBwYXR0ZXJuID0gcnVsZS52YWx1ZSA/IHJ1bGUudmFsdWUudG9Mb3dlckNhc2UoKSA6IFwiXCI7XG5cbiAgICAgICAgICAgIGxldCBpc01hdGNoID0gZmFsc2U7XG4gICAgICAgICAgICBsZXQgbWF0Y2hPYmo6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGwgPSBudWxsO1xuXG4gICAgICAgICAgICBzd2l0Y2ggKHJ1bGUub3BlcmF0b3IpIHtcbiAgICAgICAgICAgICAgICBjYXNlICdjb250YWlucyc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suaW5jbHVkZXMocGF0dGVybik7IGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2RvZXNOb3RDb250YWluJzogaXNNYXRjaCA9ICF2YWx1ZVRvQ2hlY2suaW5jbHVkZXMocGF0dGVybik7IGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2VxdWFscyc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2sgPT09IHBhdHRlcm47IGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ3N0YXJ0c1dpdGgnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrLnN0YXJ0c1dpdGgocGF0dGVybik7IGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2VuZHNXaXRoJzogaXNNYXRjaCA9IHZhbHVlVG9DaGVjay5lbmRzV2l0aChwYXR0ZXJuKTsgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnZXhpc3RzJzogaXNNYXRjaCA9IHJhd1ZhbHVlICE9PSB1bmRlZmluZWQ7IGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2RvZXNOb3RFeGlzdCc6IGlzTWF0Y2ggPSByYXdWYWx1ZSA9PT0gdW5kZWZpbmVkOyBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdpc051bGwnOiBpc01hdGNoID0gcmF3VmFsdWUgPT09IG51bGw7IGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ2lzTm90TnVsbCc6IGlzTWF0Y2ggPSByYXdWYWx1ZSAhPT0gbnVsbDsgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnbWF0Y2hlcyc6XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZWdleCA9IG5ldyBSZWdFeHAocnVsZS52YWx1ZSwgJ2knKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1hdGNoT2JqID0gcmVnZXguZXhlYyhyYXdWYWx1ZSAhPT0gdW5kZWZpbmVkICYmIHJhd1ZhbHVlICE9PSBudWxsID8gU3RyaW5nKHJhd1ZhbHVlKSA6IFwiXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaXNNYXRjaCA9ICEhbWF0Y2hPYmo7XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHt9XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoaXNNYXRjaCkge1xuICAgICAgICAgICAgICAgIGxldCByZXN1bHQgPSBydWxlLnJlc3VsdDtcbiAgICAgICAgICAgICAgICBpZiAobWF0Y2hPYmopIHtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBtYXRjaE9iai5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKG5ldyBSZWdFeHAoYFxcXFwkJHtpfWAsICdnJyksIG1hdGNoT2JqW2ldIHx8IFwiXCIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGV2YWx1YXRpbmcgbGVnYWN5IHJ1bGVzXCIsIHsgZXJyb3I6IFN0cmluZyhlcnJvcikgfSk7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgY29uc3QgZ2V0R3JvdXBpbmdSZXN1bHQgPSAodGFiOiBUYWJNZXRhZGF0YSwgc3RyYXRlZ3k6IEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcpOiB7IGtleTogc3RyaW5nIHwgbnVsbCwgbW9kZTogXCJjdXJyZW50XCIgfCBcIm5ld1wiIHwgXCJjb21wb3VuZFwiIH0gPT4ge1xuICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneSk7XG4gIGlmIChjdXN0b20pIHtcbiAgICAgIGNvbnN0IGZpbHRlckdyb3Vwc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb25bXT4oY3VzdG9tLmZpbHRlckdyb3Vwcyk7XG4gICAgICBjb25zdCBmaWx0ZXJzTGlzdCA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbj4oY3VzdG9tLmZpbHRlcnMpO1xuXG4gICAgICBsZXQgbWF0Y2ggPSBmYWxzZTtcblxuICAgICAgaWYgKGZpbHRlckdyb3Vwc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIC8vIE9SIGxvZ2ljXG4gICAgICAgICAgZm9yIChjb25zdCBncm91cCBvZiBmaWx0ZXJHcm91cHNMaXN0KSB7XG4gICAgICAgICAgICAgIGNvbnN0IGdyb3VwUnVsZXMgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGdyb3VwKTtcbiAgICAgICAgICAgICAgaWYgKGdyb3VwUnVsZXMubGVuZ3RoID09PSAwIHx8IGdyb3VwUnVsZXMuZXZlcnkociA9PiBjaGVja0NvbmRpdGlvbihyLCB0YWIpKSkge1xuICAgICAgICAgICAgICAgICAgbWF0Y2ggPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGZpbHRlcnNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAvLyBMZWdhY3kvU2ltcGxlIEFORCBsb2dpY1xuICAgICAgICAgIGlmIChmaWx0ZXJzTGlzdC5ldmVyeShmID0+IGNoZWNrQ29uZGl0aW9uKGYsIHRhYikpKSB7XG4gICAgICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIE5vIGZpbHRlcnMgLT4gTWF0Y2ggYWxsXG4gICAgICAgICAgbWF0Y2ggPSB0cnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoIW1hdGNoKSB7XG4gICAgICAgICAgcmV0dXJuIHsga2V5OiBudWxsLCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICAgICAgfVxuXG4gICAgICBjb25zdCBncm91cGluZ1J1bGVzTGlzdCA9IGFzQXJyYXk8R3JvdXBpbmdSdWxlPihjdXN0b20uZ3JvdXBpbmdSdWxlcyk7XG4gICAgICBpZiAoZ3JvdXBpbmdSdWxlc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgIGNvbnN0IG1vZGVzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZ3JvdXBpbmdSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXJ1bGUpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIGxldCB2YWwgPSBcIlwiO1xuICAgICAgICAgICAgICAgIGlmIChydWxlLnNvdXJjZSA9PT0gJ2ZpZWxkJykge1xuICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmF3ID0gZ2V0RmllbGRWYWx1ZSh0YWIsIHJ1bGUudmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgdmFsID0gcmF3ICE9PSB1bmRlZmluZWQgJiYgcmF3ICE9PSBudWxsID8gU3RyaW5nKHJhdykgOiBcIlwiO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICB2YWwgPSBydWxlLnZhbHVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh2YWwgJiYgcnVsZS50cmFuc2Zvcm0gJiYgcnVsZS50cmFuc2Zvcm0gIT09ICdub25lJykge1xuICAgICAgICAgICAgICAgICAgICBzd2l0Y2ggKHJ1bGUudHJhbnNmb3JtKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdzdHJpcFRsZCc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gc3RyaXBUbGQodmFsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ2xvd2VyY2FzZSc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gdmFsLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICd1cHBlcmNhc2UnOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHZhbC50b1VwcGVyQ2FzZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnZmlyc3RDaGFyJzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSB2YWwuY2hhckF0KDApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnZG9tYWluJzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBkb21haW5Gcm9tVXJsKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdob3N0bmFtZSc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IG5ldyBVUkwodmFsKS5ob3N0bmFtZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIHsgLyoga2VlcCBhcyBpcyAqLyB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdyZWdleCc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJ1bGUudHJhbnNmb3JtUGF0dGVybikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHJlZ2V4ID0gcmVnZXhDYWNoZS5nZXQocnVsZS50cmFuc2Zvcm1QYXR0ZXJuKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghcmVnZXgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZWdleCA9IG5ldyBSZWdFeHAocnVsZS50cmFuc2Zvcm1QYXR0ZXJuKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZWdleENhY2hlLnNldChydWxlLnRyYW5zZm9ybVBhdHRlcm4sIHJlZ2V4KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1hdGNoID0gcmVnZXguZXhlYyh2YWwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGV4dHJhY3RlZCA9IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBtYXRjaC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleHRyYWN0ZWQgKz0gbWF0Y2hbaV0gfHwgXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gZXh0cmFjdGVkO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkludmFsaWQgcmVnZXggaW4gdHJhbnNmb3JtXCIsIHsgcGF0dGVybjogcnVsZS50cmFuc2Zvcm1QYXR0ZXJuLCBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHZhbCkge1xuICAgICAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChydWxlLndpbmRvd01vZGUpIG1vZGVzLnB1c2gocnVsZS53aW5kb3dNb2RlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgIGxvZ0RlYnVnKFwiRXJyb3IgYXBwbHlpbmcgZ3JvdXBpbmcgcnVsZXNcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIHJldHVybiB7IGtleTogcGFydHMuam9pbihcIiAtIFwiKSwgbW9kZTogcmVzb2x2ZVdpbmRvd01vZGUobW9kZXMpIH07XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7IGtleTogY3VzdG9tLmZhbGxiYWNrIHx8IFwiTWlzY1wiLCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICAgICAgfSBlbHNlIGlmIChjdXN0b20ucnVsZXMpIHtcbiAgICAgICAgICBjb25zdCByZXN1bHQgPSBldmFsdWF0ZUxlZ2FjeVJ1bGVzKGFzQXJyYXk8U3RyYXRlZ3lSdWxlPihjdXN0b20ucnVsZXMpLCB0YWIpO1xuICAgICAgICAgIGlmIChyZXN1bHQpIHJldHVybiB7IGtleTogcmVzdWx0LCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICAgICAgfVxuXG4gICAgICByZXR1cm4geyBrZXk6IGN1c3RvbS5mYWxsYmFjayB8fCBcIk1pc2NcIiwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgfVxuXG4gIC8vIEJ1aWx0LWluIHN0cmF0ZWdpZXNcbiAgbGV0IHNpbXBsZUtleTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIHN3aXRjaCAoc3RyYXRlZ3kpIHtcbiAgICBjYXNlIFwiZG9tYWluXCI6XG4gICAgY2FzZSBcImRvbWFpbl9mdWxsXCI6XG4gICAgICBzaW1wbGVLZXkgPSBkb21haW5Gcm9tVXJsKHRhYi51cmwpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInRvcGljXCI6XG4gICAgICBzaW1wbGVLZXkgPSBzZW1hbnRpY0J1Y2tldCh0YWIudGl0bGUsIHRhYi51cmwpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcImxpbmVhZ2VcIjpcbiAgICAgIHNpbXBsZUtleSA9IG5hdmlnYXRpb25LZXkodGFiKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJjb250ZXh0XCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIuY29udGV4dCB8fCBcIlVuY2F0ZWdvcml6ZWRcIjtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJwaW5uZWRcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi5waW5uZWQgPyBcInBpbm5lZFwiIDogXCJ1bnBpbm5lZFwiO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcImFnZVwiOlxuICAgICAgc2ltcGxlS2V5ID0gZ2V0UmVjZW5jeUxhYmVsKHRhYi5sYXN0QWNjZXNzZWQgPz8gMCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwidXJsXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIudXJsO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInRpdGxlXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIudGl0bGU7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwicmVjZW5jeVwiOlxuICAgICAgc2ltcGxlS2V5ID0gU3RyaW5nKHRhYi5sYXN0QWNjZXNzZWQgPz8gMCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwibmVzdGluZ1wiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQgPyBcImNoaWxkXCIgOiBcInJvb3RcIjtcbiAgICAgIGJyZWFrO1xuICAgIGRlZmF1bHQ6XG4gICAgICAgIGNvbnN0IHZhbCA9IGdldEZpZWxkVmFsdWUodGFiLCBzdHJhdGVneSk7XG4gICAgICAgIGlmICh2YWwgIT09IHVuZGVmaW5lZCAmJiB2YWwgIT09IG51bGwpIHtcbiAgICAgICAgICAgIHNpbXBsZUtleSA9IFN0cmluZyh2YWwpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2ltcGxlS2V5ID0gXCJVbmtub3duXCI7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gIH1cbiAgcmV0dXJuIHsga2V5OiBzaW1wbGVLZXksIG1vZGU6IFwiY3VycmVudFwiIH07XG59O1xuXG5leHBvcnQgY29uc3QgZ3JvdXBpbmdLZXkgPSAodGFiOiBUYWJNZXRhZGF0YSwgc3RyYXRlZ3k6IEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcpOiBzdHJpbmcgfCBudWxsID0+IHtcbiAgICByZXR1cm4gZ2V0R3JvdXBpbmdSZXN1bHQodGFiLCBzdHJhdGVneSkua2V5O1xufTtcblxuZnVuY3Rpb24gaXNDb250ZXh0RmllbGQoZmllbGQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBmaWVsZCA9PT0gJ2NvbnRleHQnIHx8IGZpZWxkID09PSAnZ2VucmUnIHx8IGZpZWxkID09PSAnc2l0ZU5hbWUnIHx8IGZpZWxkLnN0YXJ0c1dpdGgoJ2NvbnRleHREYXRhLicpO1xufVxuXG5leHBvcnQgY29uc3QgcmVxdWlyZXNDb250ZXh0QW5hbHlzaXMgPSAoc3RyYXRlZ3lJZHM6IChzdHJpbmcgfCBTb3J0aW5nU3RyYXRlZ3kpW10pOiBib29sZWFuID0+IHtcbiAgICAvLyBDaGVjayBpZiBcImNvbnRleHRcIiBzdHJhdGVneSBpcyBleHBsaWNpdGx5IHJlcXVlc3RlZFxuICAgIGlmIChzdHJhdGVneUlkcy5pbmNsdWRlcyhcImNvbnRleHRcIikpIHJldHVybiB0cnVlO1xuXG4gICAgY29uc3Qgc3RyYXRlZ2llcyA9IGdldFN0cmF0ZWdpZXMoY3VzdG9tU3RyYXRlZ2llcyk7XG4gICAgLy8gZmlsdGVyIG9ubHkgdGhvc2UgdGhhdCBtYXRjaCB0aGUgcmVxdWVzdGVkIElEc1xuICAgIGNvbnN0IGFjdGl2ZURlZnMgPSBzdHJhdGVnaWVzLmZpbHRlcihzID0+IHN0cmF0ZWd5SWRzLmluY2x1ZGVzKHMuaWQpKTtcblxuICAgIGZvciAoY29uc3QgZGVmIG9mIGFjdGl2ZURlZnMpIHtcbiAgICAgICAgLy8gSWYgaXQncyBhIGJ1aWx0LWluIHN0cmF0ZWd5IHRoYXQgbmVlZHMgY29udGV4dCAob25seSAnY29udGV4dCcgZG9lcylcbiAgICAgICAgaWYgKGRlZi5pZCA9PT0gJ2NvbnRleHQnKSByZXR1cm4gdHJ1ZTtcblxuICAgICAgICAvLyBJZiBpdCBpcyBhIGN1c3RvbSBzdHJhdGVneSAob3Igb3ZlcnJpZGVzIGJ1aWx0LWluKSwgY2hlY2sgaXRzIHJ1bGVzXG4gICAgICAgIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChjID0+IGMuaWQgPT09IGRlZi5pZCk7XG4gICAgICAgIGlmIChjdXN0b20pIHtcbiAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzTGlzdCA9IGFzQXJyYXk8R3JvdXBpbmdSdWxlPihjdXN0b20uZ3JvdXBpbmdSdWxlcyk7XG4gICAgICAgICAgICAgY29uc3Qgc29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KGN1c3RvbS5zb3J0aW5nUnVsZXMpO1xuICAgICAgICAgICAgIGNvbnN0IGdyb3VwU29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KGN1c3RvbS5ncm91cFNvcnRpbmdSdWxlcyk7XG4gICAgICAgICAgICAgY29uc3QgZmlsdGVyc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGN1c3RvbS5maWx0ZXJzKTtcbiAgICAgICAgICAgICBjb25zdCBmaWx0ZXJHcm91cHNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uW10+KGN1c3RvbS5maWx0ZXJHcm91cHMpO1xuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwUnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIHJ1bGUuc291cmNlID09PSAnZmllbGQnICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUudmFsdWUpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgcnVsZS5jb2xvciA9PT0gJ2ZpZWxkJyAmJiBydWxlLmNvbG9yRmllbGQgJiYgaXNDb250ZXh0RmllbGQocnVsZS5jb2xvckZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIHNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBmaWx0ZXJzTGlzdCkge1xuICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBpc0NvbnRleHRGaWVsZChydWxlLmZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBncm91cCBvZiBmaWx0ZXJHcm91cHNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGNvbnN0IGdyb3VwUnVsZXMgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGdyb3VwKTtcbiAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwUnVsZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59O1xuIiwgImltcG9ydCB7IFNvcnRpbmdTdHJhdGVneSwgVGFiTWV0YWRhdGEsIEN1c3RvbVN0cmF0ZWd5LCBTb3J0aW5nUnVsZSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGRvbWFpbkZyb21VcmwsIHNlbWFudGljQnVja2V0LCBuYXZpZ2F0aW9uS2V5LCBncm91cGluZ0tleSwgZ2V0RmllbGRWYWx1ZSwgZ2V0Q3VzdG9tU3RyYXRlZ2llcyB9IGZyb20gXCIuL2dyb3VwaW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcblxuZXhwb3J0IGNvbnN0IHJlY2VuY3lTY29yZSA9ICh0YWI6IFRhYk1ldGFkYXRhKSA9PiB0YWIubGFzdEFjY2Vzc2VkID8/IDA7XG5leHBvcnQgY29uc3QgaGllcmFyY2h5U2NvcmUgPSAodGFiOiBUYWJNZXRhZGF0YSkgPT4gKHRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkID8gMSA6IDApO1xuZXhwb3J0IGNvbnN0IHBpbm5lZFNjb3JlID0gKHRhYjogVGFiTWV0YWRhdGEpID0+ICh0YWIucGlubmVkID8gMCA6IDEpO1xuXG5leHBvcnQgY29uc3Qgc29ydFRhYnMgPSAodGFiczogVGFiTWV0YWRhdGFbXSwgc3RyYXRlZ2llczogU29ydGluZ1N0cmF0ZWd5W10pOiBUYWJNZXRhZGF0YVtdID0+IHtcbiAgY29uc3Qgc2NvcmluZzogU29ydGluZ1N0cmF0ZWd5W10gPSBzdHJhdGVnaWVzLmxlbmd0aCA/IHN0cmF0ZWdpZXMgOiBbXCJwaW5uZWRcIiwgXCJyZWNlbmN5XCJdO1xuICByZXR1cm4gWy4uLnRhYnNdLnNvcnQoKGEsIGIpID0+IHtcbiAgICBmb3IgKGNvbnN0IHN0cmF0ZWd5IG9mIHNjb3JpbmcpIHtcbiAgICAgIGNvbnN0IGRpZmYgPSBjb21wYXJlQnkoc3RyYXRlZ3ksIGEsIGIpO1xuICAgICAgaWYgKGRpZmYgIT09IDApIHJldHVybiBkaWZmO1xuICAgIH1cbiAgICByZXR1cm4gYS5pZCAtIGIuaWQ7XG4gIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IGNvbXBhcmVCeSA9IChzdHJhdGVneTogU29ydGluZ1N0cmF0ZWd5IHwgc3RyaW5nLCBhOiBUYWJNZXRhZGF0YSwgYjogVGFiTWV0YWRhdGEpOiBudW1iZXIgPT4ge1xuICAvLyAxLiBDaGVjayBDdXN0b20gU3RyYXRlZ2llcyBmb3IgU29ydGluZyBSdWxlc1xuICBjb25zdCBjdXN0b21TdHJhdHMgPSBnZXRDdXN0b21TdHJhdGVnaWVzKCk7XG4gIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0cy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3kpO1xuICBpZiAoY3VzdG9tKSB7XG4gICAgICBjb25zdCBzb3J0UnVsZXNMaXN0ID0gYXNBcnJheTxTb3J0aW5nUnVsZT4oY3VzdG9tLnNvcnRpbmdSdWxlcyk7XG4gICAgICBpZiAoc29ydFJ1bGVzTGlzdC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgLy8gRXZhbHVhdGUgY3VzdG9tIHNvcnRpbmcgcnVsZXMgaW4gb3JkZXJcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2Ygc29ydFJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IHZhbEEgPSBnZXRGaWVsZFZhbHVlKGEsIHJ1bGUuZmllbGQpO1xuICAgICAgICAgICAgICAgICAgY29uc3QgdmFsQiA9IGdldEZpZWxkVmFsdWUoYiwgcnVsZS5maWVsZCk7XG5cbiAgICAgICAgICAgICAgICAgIGxldCByZXN1bHQgPSAwO1xuICAgICAgICAgICAgICAgICAgaWYgKHZhbEEgPCB2YWxCKSByZXN1bHQgPSAtMTtcbiAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKHZhbEEgPiB2YWxCKSByZXN1bHQgPSAxO1xuXG4gICAgICAgICAgICAgICAgICBpZiAocmVzdWx0ICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJ1bGUub3JkZXIgPT09ICdkZXNjJyA/IC1yZXN1bHQgOiByZXN1bHQ7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgIGxvZ0RlYnVnKFwiRXJyb3IgZXZhbHVhdGluZyBjdXN0b20gc29ydGluZyBydWxlc1wiLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIElmIGFsbCBydWxlcyBlcXVhbCwgY29udGludWUgdG8gbmV4dCBzdHJhdGVneSAocmV0dXJuIDApXG4gICAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9XG4gIH1cblxuICAvLyAyLiBCdWlsdC1pbiBvciBmYWxsYmFja1xuICBzd2l0Y2ggKHN0cmF0ZWd5KSB7XG4gICAgY2FzZSBcInJlY2VuY3lcIjpcbiAgICAgIHJldHVybiAoYi5sYXN0QWNjZXNzZWQgPz8gMCkgLSAoYS5sYXN0QWNjZXNzZWQgPz8gMCk7XG4gICAgY2FzZSBcIm5lc3RpbmdcIjogLy8gRm9ybWVybHkgaGllcmFyY2h5XG4gICAgICByZXR1cm4gaGllcmFyY2h5U2NvcmUoYSkgLSBoaWVyYXJjaHlTY29yZShiKTtcbiAgICBjYXNlIFwicGlubmVkXCI6XG4gICAgICByZXR1cm4gcGlubmVkU2NvcmUoYSkgLSBwaW5uZWRTY29yZShiKTtcbiAgICBjYXNlIFwidGl0bGVcIjpcbiAgICAgIHJldHVybiBhLnRpdGxlLmxvY2FsZUNvbXBhcmUoYi50aXRsZSk7XG4gICAgY2FzZSBcInVybFwiOlxuICAgICAgcmV0dXJuIGEudXJsLmxvY2FsZUNvbXBhcmUoYi51cmwpO1xuICAgIGNhc2UgXCJjb250ZXh0XCI6XG4gICAgICByZXR1cm4gKGEuY29udGV4dCA/PyBcIlwiKS5sb2NhbGVDb21wYXJlKGIuY29udGV4dCA/PyBcIlwiKTtcbiAgICBjYXNlIFwiZG9tYWluXCI6XG4gICAgY2FzZSBcImRvbWFpbl9mdWxsXCI6XG4gICAgICByZXR1cm4gZG9tYWluRnJvbVVybChhLnVybCkubG9jYWxlQ29tcGFyZShkb21haW5Gcm9tVXJsKGIudXJsKSk7XG4gICAgY2FzZSBcInRvcGljXCI6XG4gICAgICByZXR1cm4gc2VtYW50aWNCdWNrZXQoYS50aXRsZSwgYS51cmwpLmxvY2FsZUNvbXBhcmUoc2VtYW50aWNCdWNrZXQoYi50aXRsZSwgYi51cmwpKTtcbiAgICBjYXNlIFwibGluZWFnZVwiOlxuICAgICAgcmV0dXJuIG5hdmlnYXRpb25LZXkoYSkubG9jYWxlQ29tcGFyZShuYXZpZ2F0aW9uS2V5KGIpKTtcbiAgICBjYXNlIFwiYWdlXCI6XG4gICAgICAvLyBSZXZlcnNlIGFscGhhYmV0aWNhbCBmb3IgYWdlIGJ1Y2tldHMgKFRvZGF5IDwgWWVzdGVyZGF5KSwgcm91Z2ggYXBwcm94XG4gICAgICByZXR1cm4gKGdyb3VwaW5nS2V5KGEsIFwiYWdlXCIpIHx8IFwiXCIpLmxvY2FsZUNvbXBhcmUoZ3JvdXBpbmdLZXkoYiwgXCJhZ2VcIikgfHwgXCJcIik7XG4gICAgZGVmYXVsdDpcbiAgICAgIC8vIENoZWNrIGlmIGl0J3MgYSBnZW5lcmljIGZpZWxkIGZpcnN0XG4gICAgICBjb25zdCB2YWxBID0gZ2V0RmllbGRWYWx1ZShhLCBzdHJhdGVneSk7XG4gICAgICBjb25zdCB2YWxCID0gZ2V0RmllbGRWYWx1ZShiLCBzdHJhdGVneSk7XG5cbiAgICAgIGlmICh2YWxBICE9PSB1bmRlZmluZWQgJiYgdmFsQiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgaWYgKHZhbEEgPCB2YWxCKSByZXR1cm4gLTE7XG4gICAgICAgICAgaWYgKHZhbEEgPiB2YWxCKSByZXR1cm4gMTtcbiAgICAgICAgICByZXR1cm4gMDtcbiAgICAgIH1cblxuICAgICAgLy8gRmFsbGJhY2sgZm9yIGN1c3RvbSBzdHJhdGVnaWVzIGdyb3VwaW5nIGtleSAoaWYgdXNpbmcgY3VzdG9tIHN0cmF0ZWd5IGFzIHNvcnRpbmcgYnV0IG5vIHNvcnRpbmcgcnVsZXMgZGVmaW5lZClcbiAgICAgIC8vIG9yIHVuaGFuZGxlZCBidWlsdC1pbnNcbiAgICAgIHJldHVybiAoZ3JvdXBpbmdLZXkoYSwgc3RyYXRlZ3kpIHx8IFwiXCIpLmxvY2FsZUNvbXBhcmUoZ3JvdXBpbmdLZXkoYiwgc3RyYXRlZ3kpIHx8IFwiXCIpO1xuICB9XG59O1xuIiwgImltcG9ydCB7IFRhYkdyb3VwLCBUYWJNZXRhZGF0YSwgUHJlZmVyZW5jZXMgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBtYXBDaHJvbWVUYWIsIGdldFN0b3JlZFByZWZlcmVuY2VzIH0gZnJvbSBcIi4uL3NoYXJlZC91dGlscy5qc1wiO1xuaW1wb3J0IHsgc2V0Q3VzdG9tU3RyYXRlZ2llcyB9IGZyb20gXCIuLi9iYWNrZ3JvdW5kL2dyb3VwaW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgc29ydFRhYnMgfSBmcm9tIFwiLi4vYmFja2dyb3VuZC9zb3J0aW5nU3RyYXRlZ2llcy5qc1wiO1xuXG5jb25zdCBkZWZhdWx0UHJlZmVyZW5jZXM6IFByZWZlcmVuY2VzID0ge1xuICBzb3J0aW5nOiBbXCJwaW5uZWRcIiwgXCJyZWNlbmN5XCJdLFxuICBkZWJ1ZzogZmFsc2UsXG4gIHRoZW1lOiBcImRhcmtcIixcbiAgY3VzdG9tR2VuZXJhOiB7fVxufTtcblxuZXhwb3J0IGNvbnN0IGZldGNoTG9jYWxTdGF0ZSA9IGFzeW5jICgpID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBbdGFicywgZ3JvdXBzLCBwcmVmc10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICBjaHJvbWUudGFicy5xdWVyeSh7fSksXG4gICAgICBjaHJvbWUudGFiR3JvdXBzLnF1ZXJ5KHt9KSxcbiAgICAgIGdldFN0b3JlZFByZWZlcmVuY2VzKClcbiAgICBdKTtcblxuICAgIGNvbnN0IHByZWZlcmVuY2VzID0gcHJlZnMgfHwgZGVmYXVsdFByZWZlcmVuY2VzO1xuXG4gICAgLy8gSW5pdGlhbGl6ZSBjdXN0b20gc3RyYXRlZ2llcyBmb3Igc29ydGluZ1xuICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMocHJlZmVyZW5jZXMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXSk7XG5cbiAgICBjb25zdCBncm91cE1hcCA9IG5ldyBNYXAoZ3JvdXBzLm1hcChnID0+IFtnLmlkLCBnXSkpO1xuICAgIGNvbnN0IG1hcHBlZCA9IHRhYnMubWFwKG1hcENocm9tZVRhYikuZmlsdGVyKCh0KTogdCBpcyBUYWJNZXRhZGF0YSA9PiBCb29sZWFuKHQpKTtcblxuICAgIGNvbnN0IHJlc3VsdEdyb3VwczogVGFiR3JvdXBbXSA9IFtdO1xuICAgIGNvbnN0IHRhYnNCeUdyb3VwSWQgPSBuZXcgTWFwPG51bWJlciwgVGFiTWV0YWRhdGFbXT4oKTtcbiAgICBjb25zdCB0YWJzQnlXaW5kb3dVbmdyb3VwZWQgPSBuZXcgTWFwPG51bWJlciwgVGFiTWV0YWRhdGFbXT4oKTtcblxuICAgIG1hcHBlZC5mb3JFYWNoKHRhYiA9PiB7XG4gICAgICAgIGNvbnN0IGdyb3VwSWQgPSB0YWIuZ3JvdXBJZCA/PyAtMTtcbiAgICAgICAgaWYgKGdyb3VwSWQgIT09IC0xKSB7XG4gICAgICAgICAgICBpZiAoIXRhYnNCeUdyb3VwSWQuaGFzKGdyb3VwSWQpKSB0YWJzQnlHcm91cElkLnNldChncm91cElkLCBbXSk7XG4gICAgICAgICAgICB0YWJzQnlHcm91cElkLmdldChncm91cElkKSEucHVzaCh0YWIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgIGlmICghdGFic0J5V2luZG93VW5ncm91cGVkLmhhcyh0YWIud2luZG93SWQpKSB0YWJzQnlXaW5kb3dVbmdyb3VwZWQuc2V0KHRhYi53aW5kb3dJZCwgW10pO1xuICAgICAgICAgICAgIHRhYnNCeVdpbmRvd1VuZ3JvdXBlZC5nZXQodGFiLndpbmRvd0lkKSEucHVzaCh0YWIpO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgVGFiR3JvdXAgb2JqZWN0cyBmb3IgYWN0dWFsIGdyb3Vwc1xuICAgIGZvciAoY29uc3QgW2dyb3VwSWQsIGdyb3VwVGFic10gb2YgdGFic0J5R3JvdXBJZCkge1xuICAgICAgICBjb25zdCBicm93c2VyR3JvdXAgPSBncm91cE1hcC5nZXQoZ3JvdXBJZCk7XG4gICAgICAgIGlmIChicm93c2VyR3JvdXApIHtcbiAgICAgICAgICAgIHJlc3VsdEdyb3Vwcy5wdXNoKHtcbiAgICAgICAgICAgICAgICBpZDogYGdyb3VwLSR7Z3JvdXBJZH1gLFxuICAgICAgICAgICAgICAgIHdpbmRvd0lkOiBicm93c2VyR3JvdXAud2luZG93SWQsXG4gICAgICAgICAgICAgICAgbGFiZWw6IGJyb3dzZXJHcm91cC50aXRsZSB8fCBcIlVudGl0bGVkIEdyb3VwXCIsXG4gICAgICAgICAgICAgICAgY29sb3I6IGJyb3dzZXJHcm91cC5jb2xvcixcbiAgICAgICAgICAgICAgICB0YWJzOiBzb3J0VGFicyhncm91cFRhYnMsIHByZWZlcmVuY2VzLnNvcnRpbmcpLFxuICAgICAgICAgICAgICAgIHJlYXNvbjogXCJNYW51YWxcIlxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBIYW5kbGUgdW5ncm91cGVkIHRhYnNcbiAgICBmb3IgKGNvbnN0IFt3aW5kb3dJZCwgdGFic10gb2YgdGFic0J5V2luZG93VW5ncm91cGVkKSB7XG4gICAgICAgIHJlc3VsdEdyb3Vwcy5wdXNoKHtcbiAgICAgICAgICAgIGlkOiBgdW5ncm91cGVkLSR7d2luZG93SWR9YCxcbiAgICAgICAgICAgIHdpbmRvd0lkOiB3aW5kb3dJZCxcbiAgICAgICAgICAgIGxhYmVsOiBcIlVuZ3JvdXBlZFwiLFxuICAgICAgICAgICAgY29sb3I6IFwiZ3JleVwiLFxuICAgICAgICAgICAgdGFiczogc29ydFRhYnModGFicywgcHJlZmVyZW5jZXMuc29ydGluZyksXG4gICAgICAgICAgICByZWFzb246IFwiVW5ncm91cGVkXCJcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc29sZS53YXJuKFwiRmV0Y2hlZCBsb2NhbCBzdGF0ZSAoZmFsbGJhY2spXCIpO1xuICAgIHJldHVybiB7IG9rOiB0cnVlLCBkYXRhOiB7IGdyb3VwczogcmVzdWx0R3JvdXBzLCBwcmVmZXJlbmNlcyB9IH07XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBjb25zb2xlLmVycm9yKFwiTG9jYWwgc3RhdGUgZmV0Y2ggZmFpbGVkOlwiLCBlKTtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBTdHJpbmcoZSkgfTtcbiAgfVxufTtcbiIsICJpbXBvcnQge1xuICBBcHBseUdyb3VwaW5nUGF5bG9hZCxcbiAgR3JvdXBpbmdTZWxlY3Rpb24sXG4gIFByZWZlcmVuY2VzLFxuICBSdW50aW1lTWVzc2FnZSxcbiAgUnVudGltZVJlc3BvbnNlLFxuICBTYXZlZFN0YXRlLFxuICBTb3J0aW5nU3RyYXRlZ3ksXG4gIFRhYkdyb3VwLFxuICBUYWJNZXRhZGF0YVxufSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBmZXRjaExvY2FsU3RhdGUgfSBmcm9tIFwiLi9sb2NhbFN0YXRlLmpzXCI7XG5cbmV4cG9ydCBjb25zdCBzZW5kTWVzc2FnZSA9IGFzeW5jIDxURGF0YT4odHlwZTogUnVudGltZU1lc3NhZ2VbXCJ0eXBlXCJdLCBwYXlsb2FkPzogYW55KTogUHJvbWlzZTxSdW50aW1lUmVzcG9uc2U8VERhdGE+PiA9PiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZSwgcGF5bG9hZCB9LCAocmVzcG9uc2UpID0+IHtcbiAgICAgIGlmIChjaHJvbWUucnVudGltZS5sYXN0RXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIlJ1bnRpbWUgZXJyb3I6XCIsIGNocm9tZS5ydW50aW1lLmxhc3RFcnJvcik7XG4gICAgICAgIHJlc29sdmUoeyBvazogZmFsc2UsIGVycm9yOiBjaHJvbWUucnVudGltZS5sYXN0RXJyb3IubWVzc2FnZSB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc29sdmUocmVzcG9uc2UgfHwgeyBvazogZmFsc2UsIGVycm9yOiBcIk5vIHJlc3BvbnNlIGZyb20gYmFja2dyb3VuZFwiIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICB9KTtcbn07XG5cbmV4cG9ydCB0eXBlIFRhYldpdGhHcm91cCA9IFRhYk1ldGFkYXRhICYge1xuICBncm91cExhYmVsPzogc3RyaW5nO1xuICBncm91cENvbG9yPzogc3RyaW5nO1xuICByZWFzb24/OiBzdHJpbmc7XG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFdpbmRvd1ZpZXcge1xuICBpZDogbnVtYmVyO1xuICB0aXRsZTogc3RyaW5nO1xuICB0YWJzOiBUYWJXaXRoR3JvdXBbXTtcbiAgdGFiQ291bnQ6IG51bWJlcjtcbiAgZ3JvdXBDb3VudDogbnVtYmVyO1xuICBwaW5uZWRDb3VudDogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgSUNPTlMgPSB7XG4gIGFjdGl2ZTogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwb2x5Z29uIHBvaW50cz1cIjMgMTEgMjIgMiAxMyAyMSAxMSAxMyAzIDExXCI+PC9wb2x5Z29uPjwvc3ZnPmAsXG4gIGhpZGU6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cGF0aCBkPVwiTTE3Ljk0IDE3Ljk0QTEwLjA3IDEwLjA3IDAgMCAxIDEyIDIwYy03IDAtMTEtOC0xMS04YTE4LjQ1IDE4LjQ1IDAgMCAxIDUuMDYtNS45NE05LjkgNC4yNEE5LjEyIDkuMTIgMCAwIDEgMTIgNGM3IDAgMTEgOCAxMSA4YTE4LjUgMTguNSAwIDAgMS0yLjE2IDMuMTltLTYuNzItMS4wN2EzIDMgMCAxIDEtNC4yNC00LjI0XCI+PC9wYXRoPjxsaW5lIHgxPVwiMVwiIHkxPVwiMVwiIHgyPVwiMjNcIiB5Mj1cIjIzXCI+PC9saW5lPjwvc3ZnPmAsXG4gIHNob3c6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cGF0aCBkPVwiTTEgMTJzNC04IDExLTggMTEgOCAxMSA4LTQgOC0xMSA4LTExLTgtMTEtOC0xMS04elwiPjwvcGF0aD48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjNcIj48L2NpcmNsZT48L3N2Zz5gLFxuICBmb2N1czogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxjaXJjbGUgY3g9XCIxMlwiIGN5PVwiMTJcIiByPVwiMTBcIj48L2NpcmNsZT48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjZcIj48L2NpcmNsZT48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjJcIj48L2NpcmNsZT48L3N2Zz5gLFxuICBjbG9zZTogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxsaW5lIHgxPVwiMThcIiB5MT1cIjZcIiB4Mj1cIjZcIiB5Mj1cIjE4XCI+PC9saW5lPjxsaW5lIHgxPVwiNlwiIHkxPVwiNlwiIHgyPVwiMThcIiB5Mj1cIjE4XCI+PC9saW5lPjwvc3ZnPmAsXG4gIHVuZ3JvdXA6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjEwXCI+PC9jaXJjbGU+PGxpbmUgeDE9XCI4XCIgeTE9XCIxMlwiIHgyPVwiMTZcIiB5Mj1cIjEyXCI+PC9saW5lPjwvc3ZnPmAsXG4gIGRlZmF1bHRGaWxlOiBgPHN2ZyB3aWR0aD1cIjI0XCIgaGVpZ2h0PVwiMjRcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBhdGggZD1cIk0xNCAySDZhMiAyIDAgMCAwLTIgMnYxNmEyIDIgMCAwIDAgMiAyaDEyYTIgMiAwIDAgMCAyLTJWOHpcIj48L3BhdGg+PHBvbHlsaW5lIHBvaW50cz1cIjE0IDIgMTQgOCAyMCA4XCI+PC9wb2x5bGluZT48bGluZSB4MT1cIjE2XCIgeTE9XCIxM1wiIHgyPVwiOFwiIHkyPVwiMTNcIj48L2xpbmU+PGxpbmUgeDE9XCIxNlwiIHkxPVwiMTdcIiB4Mj1cIjhcIiB5Mj1cIjE3XCI+PC9saW5lPjxwb2x5bGluZSBwb2ludHM9XCIxMCA5IDkgOSA4IDlcIj48L3BvbHlsaW5lPjwvc3ZnPmAsXG4gIGF1dG9SdW46IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cG9seWdvbiBwb2ludHM9XCIxMyAyIDMgMTQgMTIgMTQgMTEgMjIgMjEgMTAgMTIgMTAgMTMgMlwiPjwvcG9seWdvbj48L3N2Zz5gXG59O1xuXG5leHBvcnQgY29uc3QgR1JPVVBfQ09MT1JTOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICBncmV5OiBcIiM2NDc0OGJcIixcbiAgYmx1ZTogXCIjM2I4MmY2XCIsXG4gIHJlZDogXCIjZWY0NDQ0XCIsXG4gIHllbGxvdzogXCIjZWFiMzA4XCIsXG4gIGdyZWVuOiBcIiMyMmM1NWVcIixcbiAgcGluazogXCIjZWM0ODk5XCIsXG4gIHB1cnBsZTogXCIjYTg1NWY3XCIsXG4gIGN5YW46IFwiIzA2YjZkNFwiLFxuICBvcmFuZ2U6IFwiI2Y5NzMxNlwiXG59O1xuXG5leHBvcnQgY29uc3QgZ2V0R3JvdXBDb2xvciA9IChuYW1lOiBzdHJpbmcpID0+IEdST1VQX0NPTE9SU1tuYW1lXSB8fCBcIiNjYmQ1ZTFcIjtcblxuZXhwb3J0IGNvbnN0IGZldGNoU3RhdGUgPSBhc3luYyAoKSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBzZW5kTWVzc2FnZTx7IGdyb3VwczogVGFiR3JvdXBbXTsgcHJlZmVyZW5jZXM6IFByZWZlcmVuY2VzIH0+KFwiZ2V0U3RhdGVcIik7XG4gICAgaWYgKHJlc3BvbnNlLm9rICYmIHJlc3BvbnNlLmRhdGEpIHtcbiAgICAgIHJldHVybiByZXNwb25zZTtcbiAgICB9XG4gICAgY29uc29sZS53YXJuKFwiZmV0Y2hTdGF0ZSBmYWlsZWQsIHVzaW5nIGZhbGxiYWNrOlwiLCByZXNwb25zZS5lcnJvcik7XG4gICAgcmV0dXJuIGF3YWl0IGZldGNoTG9jYWxTdGF0ZSgpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgY29uc29sZS53YXJuKFwiZmV0Y2hTdGF0ZSB0aHJldyBleGNlcHRpb24sIHVzaW5nIGZhbGxiYWNrOlwiLCBlKTtcbiAgICByZXR1cm4gYXdhaXQgZmV0Y2hMb2NhbFN0YXRlKCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBhcHBseUdyb3VwaW5nID0gYXN5bmMgKHBheWxvYWQ6IEFwcGx5R3JvdXBpbmdQYXlsb2FkKSA9PiB7XG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImFwcGx5R3JvdXBpbmdcIiwgcGF5bG9hZCB9KTtcbiAgcmV0dXJuIHJlc3BvbnNlIGFzIFJ1bnRpbWVSZXNwb25zZTx1bmtub3duPjtcbn07XG5cbmV4cG9ydCBjb25zdCBhcHBseVNvcnRpbmcgPSBhc3luYyAocGF5bG9hZDogQXBwbHlHcm91cGluZ1BheWxvYWQpID0+IHtcbiAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6IFwiYXBwbHlTb3J0aW5nXCIsIHBheWxvYWQgfSk7XG4gIHJldHVybiByZXNwb25zZSBhcyBSdW50aW1lUmVzcG9uc2U8dW5rbm93bj47XG59O1xuXG5leHBvcnQgY29uc3QgbWFwV2luZG93cyA9IChncm91cHM6IFRhYkdyb3VwW10sIHdpbmRvd1RpdGxlczogTWFwPG51bWJlciwgc3RyaW5nPik6IFdpbmRvd1ZpZXdbXSA9PiB7XG4gIGNvbnN0IHdpbmRvd3MgPSBuZXcgTWFwPG51bWJlciwgVGFiV2l0aEdyb3VwW10+KCk7XG5cbiAgZ3JvdXBzLmZvckVhY2goKGdyb3VwKSA9PiB7XG4gICAgY29uc3QgaXNVbmdyb3VwZWQgPSBncm91cC5yZWFzb24gPT09IFwiVW5ncm91cGVkXCI7XG4gICAgZ3JvdXAudGFicy5mb3JFYWNoKCh0YWIpID0+IHtcbiAgICAgIGNvbnN0IGRlY29yYXRlZDogVGFiV2l0aEdyb3VwID0ge1xuICAgICAgICAuLi50YWIsXG4gICAgICAgIGdyb3VwTGFiZWw6IGlzVW5ncm91cGVkID8gdW5kZWZpbmVkIDogZ3JvdXAubGFiZWwsXG4gICAgICAgIGdyb3VwQ29sb3I6IGlzVW5ncm91cGVkID8gdW5kZWZpbmVkIDogZ3JvdXAuY29sb3IsXG4gICAgICAgIHJlYXNvbjogZ3JvdXAucmVhc29uXG4gICAgICB9O1xuICAgICAgY29uc3QgZXhpc3RpbmcgPSB3aW5kb3dzLmdldCh0YWIud2luZG93SWQpID8/IFtdO1xuICAgICAgZXhpc3RpbmcucHVzaChkZWNvcmF0ZWQpO1xuICAgICAgd2luZG93cy5zZXQodGFiLndpbmRvd0lkLCBleGlzdGluZyk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIHJldHVybiBBcnJheS5mcm9tKHdpbmRvd3MuZW50cmllcygpKVxuICAgIC5tYXA8V2luZG93Vmlldz4oKFtpZCwgdGFic10pID0+IHtcbiAgICAgIGNvbnN0IGdyb3VwQ291bnQgPSBuZXcgU2V0KHRhYnMubWFwKCh0YWIpID0+IHRhYi5ncm91cExhYmVsKS5maWx0ZXIoKGwpOiBsIGlzIHN0cmluZyA9PiAhIWwpKS5zaXplO1xuICAgICAgY29uc3QgcGlubmVkQ291bnQgPSB0YWJzLmZpbHRlcigodGFiKSA9PiB0YWIucGlubmVkKS5sZW5ndGg7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBpZCxcbiAgICAgICAgdGl0bGU6IHdpbmRvd1RpdGxlcy5nZXQoaWQpID8/IGBXaW5kb3cgJHtpZH1gLFxuICAgICAgICB0YWJzLFxuICAgICAgICB0YWJDb3VudDogdGFicy5sZW5ndGgsXG4gICAgICAgIGdyb3VwQ291bnQsXG4gICAgICAgIHBpbm5lZENvdW50XG4gICAgICB9O1xuICAgIH0pXG4gICAgLnNvcnQoKGEsIGIpID0+IGEuaWQgLSBiLmlkKTtcbn07XG5cbmV4cG9ydCBjb25zdCBmb3JtYXREb21haW4gPSAodXJsOiBzdHJpbmcpID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBwYXJzZWQgPSBuZXcgVVJMKHVybCk7XG4gICAgcmV0dXJuIHBhcnNlZC5ob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgXCJcIik7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgcmV0dXJuIHVybDtcbiAgfVxufTtcbiIsICJpbXBvcnQge1xuICBHcm91cGluZ1NlbGVjdGlvbixcbiAgUHJlZmVyZW5jZXMsXG4gIFNhdmVkU3RhdGUsXG4gIFNvcnRpbmdTdHJhdGVneSxcbiAgTG9nTGV2ZWwsXG4gIFRhYkdyb3VwXG59IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7XG4gIGFwcGx5R3JvdXBpbmcsXG4gIGFwcGx5U29ydGluZyxcbiAgZmV0Y2hTdGF0ZSxcbiAgSUNPTlMsXG4gIG1hcFdpbmRvd3MsXG4gIHNlbmRNZXNzYWdlLFxuICBUYWJXaXRoR3JvdXAsXG4gIFdpbmRvd1ZpZXcsXG4gIEdST1VQX0NPTE9SU1xufSBmcm9tIFwiLi9jb21tb24uanNcIjtcbmltcG9ydCB7IGdldFN0cmF0ZWdpZXMsIFNUUkFURUdJRVMsIFN0cmF0ZWd5RGVmaW5pdGlvbiB9IGZyb20gXCIuLi9zaGFyZWQvc3RyYXRlZ3lSZWdpc3RyeS5qc1wiO1xuaW1wb3J0IHsgc2V0TG9nZ2VyUHJlZmVyZW5jZXMsIGxvZ0RlYnVnLCBsb2dJbmZvIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGZldGNoTG9jYWxTdGF0ZSB9IGZyb20gXCIuL2xvY2FsU3RhdGUuanNcIjtcblxuLy8gRWxlbWVudHNcbmNvbnN0IHNlYXJjaElucHV0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ0YWJTZWFyY2hcIikgYXMgSFRNTElucHV0RWxlbWVudDtcbmNvbnN0IHdpbmRvd3NDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIndpbmRvd3NcIikgYXMgSFRNTERpdkVsZW1lbnQ7XG5cbmNvbnN0IHNlbGVjdEFsbENoZWNrYm94ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzZWxlY3RBbGxcIikgYXMgSFRNTElucHV0RWxlbWVudDtcbmNvbnN0IGJ0bkFwcGx5ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5BcHBseVwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcbmNvbnN0IGJ0blVuZ3JvdXAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0blVuZ3JvdXBcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5jb25zdCBidG5NZXJnZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuTWVyZ2VcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5jb25zdCBidG5TcGxpdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuU3BsaXRcIikgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5jb25zdCBidG5FeHBhbmRBbGwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJ0bkV4cGFuZEFsbFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcbmNvbnN0IGJ0bkNvbGxhcHNlQWxsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5Db2xsYXBzZUFsbFwiKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcblxuY29uc3QgYWN0aXZlU3RyYXRlZ2llc0xpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImFjdGl2ZVN0cmF0ZWdpZXNMaXN0XCIpIGFzIEhUTUxEaXZFbGVtZW50O1xuY29uc3QgYWRkU3RyYXRlZ3lTZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImFkZFN0cmF0ZWd5U2VsZWN0XCIpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuXG4vLyBTdGF0c1xuY29uc3Qgc3RhdFRhYnMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInN0YXRUYWJzXCIpIGFzIEhUTUxFbGVtZW50O1xuY29uc3Qgc3RhdEdyb3VwcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3RhdEdyb3Vwc1wiKSBhcyBIVE1MRWxlbWVudDtcbmNvbnN0IHN0YXRXaW5kb3dzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzdGF0V2luZG93c1wiKSBhcyBIVE1MRWxlbWVudDtcblxuY29uc3QgcHJvZ3Jlc3NPdmVybGF5ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJwcm9ncmVzc092ZXJsYXlcIikgYXMgSFRNTERpdkVsZW1lbnQ7XG5jb25zdCBwcm9ncmVzc1RleHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInByb2dyZXNzVGV4dFwiKSBhcyBIVE1MRGl2RWxlbWVudDtcbmNvbnN0IHByb2dyZXNzQ291bnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInByb2dyZXNzQ291bnRcIikgYXMgSFRNTERpdkVsZW1lbnQ7XG5cbmNvbnN0IHNob3dMb2FkaW5nID0gKHRleHQ6IHN0cmluZykgPT4ge1xuICAgIGlmIChwcm9ncmVzc092ZXJsYXkpIHtcbiAgICAgICAgcHJvZ3Jlc3NUZXh0LnRleHRDb250ZW50ID0gdGV4dDtcbiAgICAgICAgcHJvZ3Jlc3NDb3VudC50ZXh0Q29udGVudCA9IFwiXCI7XG4gICAgICAgIHByb2dyZXNzT3ZlcmxheS5jbGFzc0xpc3QucmVtb3ZlKFwiaGlkZGVuXCIpO1xuICAgIH1cbn07XG5cbmNvbnN0IGhpZGVMb2FkaW5nID0gKCkgPT4ge1xuICAgIGlmIChwcm9ncmVzc092ZXJsYXkpIHtcbiAgICAgICAgcHJvZ3Jlc3NPdmVybGF5LmNsYXNzTGlzdC5hZGQoXCJoaWRkZW5cIik7XG4gICAgfVxufTtcblxuY29uc3QgdXBkYXRlUHJvZ3Jlc3MgPSAoY29tcGxldGVkOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+IHtcbiAgICBpZiAocHJvZ3Jlc3NPdmVybGF5ICYmICFwcm9ncmVzc092ZXJsYXkuY2xhc3NMaXN0LmNvbnRhaW5zKFwiaGlkZGVuXCIpKSB7XG4gICAgICAgIHByb2dyZXNzQ291bnQudGV4dENvbnRlbnQgPSBgJHtjb21wbGV0ZWR9IC8gJHt0b3RhbH1gO1xuICAgIH1cbn07XG5cbmxldCB3aW5kb3dTdGF0ZTogV2luZG93Vmlld1tdID0gW107XG5sZXQgZm9jdXNlZFdpbmRvd0lkOiBudW1iZXIgfCBudWxsID0gbnVsbDtcbmNvbnN0IHNlbGVjdGVkVGFicyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xubGV0IGluaXRpYWxTZWxlY3Rpb25Eb25lID0gZmFsc2U7XG5sZXQgcHJlZmVyZW5jZXM6IFByZWZlcmVuY2VzIHwgbnVsbCA9IG51bGw7XG5cbi8vIFRyZWUgU3RhdGVcbmNvbnN0IGV4cGFuZGVkTm9kZXMgPSBuZXcgU2V0PHN0cmluZz4oKTsgLy8gRGVmYXVsdCBlbXB0eSA9IGFsbCBjb2xsYXBzZWRcbmNvbnN0IFRSRUVfSUNPTlMgPSB7XG4gIGNoZXZyb25SaWdodDogYDxzdmcgd2lkdGg9XCIxMDAlXCIgaGVpZ2h0PVwiMTAwJVwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cG9seWxpbmUgcG9pbnRzPVwiOSAxOCAxNSAxMiA5IDZcIj48L3BvbHlsaW5lPjwvc3ZnPmAsXG4gIGZvbGRlcjogYDxzdmcgd2lkdGg9XCIxMDAlXCIgaGVpZ2h0PVwiMTAwJVwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cGF0aCBkPVwiTTIyIDE5YTIgMiAwIDAgMS0yIDJINGEyIDIgMCAwIDEtMi0yVjVhMiAyIDAgMCAxIDItMmg1bDIgM2g5YTIgMiAwIDAgMSAyIDJ6XCI+PC9wYXRoPjwvc3ZnPmBcbn07XG5cbmNvbnN0IGhleFRvUmdiYSA9IChoZXg6IHN0cmluZywgYWxwaGE6IG51bWJlcikgPT4ge1xuICAgIC8vIEVuc3VyZSBoZXggZm9ybWF0XG4gICAgaWYgKCFoZXguc3RhcnRzV2l0aCgnIycpKSByZXR1cm4gaGV4O1xuICAgIGNvbnN0IHIgPSBwYXJzZUludChoZXguc2xpY2UoMSwgMyksIDE2KTtcbiAgICBjb25zdCBnID0gcGFyc2VJbnQoaGV4LnNsaWNlKDMsIDUpLCAxNik7XG4gICAgY29uc3QgYiA9IHBhcnNlSW50KGhleC5zbGljZSg1LCA3KSwgMTYpO1xuICAgIHJldHVybiBgcmdiYSgke3J9LCAke2d9LCAke2J9LCAke2FscGhhfSlgO1xufTtcblxuY29uc3QgdXBkYXRlU3RhdHMgPSAoKSA9PiB7XG4gIGNvbnN0IHRvdGFsVGFicyA9IHdpbmRvd1N0YXRlLnJlZHVjZSgoYWNjLCB3aW4pID0+IGFjYyArIHdpbi50YWJDb3VudCwgMCk7XG4gIGNvbnN0IHRvdGFsR3JvdXBzID0gbmV3IFNldCh3aW5kb3dTdGF0ZS5mbGF0TWFwKHcgPT4gdy50YWJzLmZpbHRlcih0ID0+IHQuZ3JvdXBMYWJlbCkubWFwKHQgPT4gYCR7dy5pZH0tJHt0Lmdyb3VwTGFiZWx9YCkpKS5zaXplO1xuXG4gIHN0YXRUYWJzLnRleHRDb250ZW50ID0gYCR7dG90YWxUYWJzfSBUYWJzYDtcbiAgc3RhdEdyb3Vwcy50ZXh0Q29udGVudCA9IGAke3RvdGFsR3JvdXBzfSBHcm91cHNgO1xuICBzdGF0V2luZG93cy50ZXh0Q29udGVudCA9IGAke3dpbmRvd1N0YXRlLmxlbmd0aH0gV2luZG93c2A7XG5cbiAgLy8gVXBkYXRlIHNlbGVjdGlvbiBidXR0b25zXG4gIGNvbnN0IGhhc1NlbGVjdGlvbiA9IHNlbGVjdGVkVGFicy5zaXplID4gMDtcbiAgYnRuVW5ncm91cC5kaXNhYmxlZCA9ICFoYXNTZWxlY3Rpb247XG4gIGJ0bk1lcmdlLmRpc2FibGVkID0gIWhhc1NlbGVjdGlvbjtcbiAgYnRuU3BsaXQuZGlzYWJsZWQgPSAhaGFzU2VsZWN0aW9uO1xuXG4gIGJ0blVuZ3JvdXAuc3R5bGUub3BhY2l0eSA9IGhhc1NlbGVjdGlvbiA/IFwiMVwiIDogXCIwLjVcIjtcbiAgYnRuTWVyZ2Uuc3R5bGUub3BhY2l0eSA9IGhhc1NlbGVjdGlvbiA/IFwiMVwiIDogXCIwLjVcIjtcbiAgYnRuU3BsaXQuc3R5bGUub3BhY2l0eSA9IGhhc1NlbGVjdGlvbiA/IFwiMVwiIDogXCIwLjVcIjtcblxuICAvLyBVcGRhdGUgU2VsZWN0IEFsbCBDaGVja2JveCBTdGF0ZVxuICBpZiAodG90YWxUYWJzID09PSAwKSB7XG4gICAgc2VsZWN0QWxsQ2hlY2tib3guY2hlY2tlZCA9IGZhbHNlO1xuICAgIHNlbGVjdEFsbENoZWNrYm94LmluZGV0ZXJtaW5hdGUgPSBmYWxzZTtcbiAgfSBlbHNlIGlmIChzZWxlY3RlZFRhYnMuc2l6ZSA9PT0gdG90YWxUYWJzKSB7XG4gICAgc2VsZWN0QWxsQ2hlY2tib3guY2hlY2tlZCA9IHRydWU7XG4gICAgc2VsZWN0QWxsQ2hlY2tib3guaW5kZXRlcm1pbmF0ZSA9IGZhbHNlO1xuICB9IGVsc2UgaWYgKHNlbGVjdGVkVGFicy5zaXplID4gMCkge1xuICAgIHNlbGVjdEFsbENoZWNrYm94LmNoZWNrZWQgPSBmYWxzZTtcbiAgICBzZWxlY3RBbGxDaGVja2JveC5pbmRldGVybWluYXRlID0gdHJ1ZTtcbiAgfSBlbHNlIHtcbiAgICBzZWxlY3RBbGxDaGVja2JveC5jaGVja2VkID0gZmFsc2U7XG4gICAgc2VsZWN0QWxsQ2hlY2tib3guaW5kZXRlcm1pbmF0ZSA9IGZhbHNlO1xuICB9XG59O1xuXG5jb25zdCBjcmVhdGVOb2RlID0gKFxuICAgIGNvbnRlbnQ6IEhUTUxFbGVtZW50LFxuICAgIGNoaWxkcmVuQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IG51bGwsXG4gICAgbGV2ZWw6ICd3aW5kb3cnIHwgJ2dyb3VwJyB8ICd0YWInLFxuICAgIGlzRXhwYW5kZWQ6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICBvblRvZ2dsZT86ICgpID0+IHZvaWRcbikgPT4ge1xuICAgIGNvbnN0IG5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIG5vZGUuY2xhc3NOYW1lID0gYHRyZWUtbm9kZSBub2RlLSR7bGV2ZWx9YDtcblxuICAgIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgcm93LmNsYXNzTmFtZSA9IGB0cmVlLXJvdyAke2xldmVsfS1yb3dgO1xuXG4gICAgLy8gVG9nZ2xlXG4gICAgY29uc3QgdG9nZ2xlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICB0b2dnbGUuY2xhc3NOYW1lID0gYHRyZWUtdG9nZ2xlICR7aXNFeHBhbmRlZCA/ICdyb3RhdGVkJyA6ICcnfWA7XG4gICAgaWYgKGNoaWxkcmVuQ29udGFpbmVyKSB7XG4gICAgICAgIHRvZ2dsZS5pbm5lckhUTUwgPSBUUkVFX0lDT05TLmNoZXZyb25SaWdodDtcbiAgICAgICAgdG9nZ2xlLm9uY2xpY2sgPSAoZSkgPT4ge1xuICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgIGlmIChvblRvZ2dsZSkgb25Ub2dnbGUoKTtcbiAgICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB0b2dnbGUuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG4gICAgfVxuXG4gICAgcm93LmFwcGVuZENoaWxkKHRvZ2dsZSk7XG4gICAgcm93LmFwcGVuZENoaWxkKGNvbnRlbnQpOyAvLyBDb250ZW50IGhhbmRsZXMgY2hlY2tib3ggKyBpY29uICsgdGV4dCArIGFjdGlvbnNcblxuICAgIG5vZGUuYXBwZW5kQ2hpbGQocm93KTtcblxuICAgIGlmIChjaGlsZHJlbkNvbnRhaW5lcikge1xuICAgICAgICBjaGlsZHJlbkNvbnRhaW5lci5jbGFzc05hbWUgPSBgdHJlZS1jaGlsZHJlbiAke2lzRXhwYW5kZWQgPyAnZXhwYW5kZWQnIDogJyd9YDtcbiAgICAgICAgbm9kZS5hcHBlbmRDaGlsZChjaGlsZHJlbkNvbnRhaW5lcik7XG4gICAgfVxuXG4gICAgLy8gVG9nZ2xlIGludGVyYWN0aW9uIG9uIHJvdyBjbGljayBmb3IgV2luZG93cyBhbmQgR3JvdXBzXG4gICAgaWYgKGNoaWxkcmVuQ29udGFpbmVyICYmIGxldmVsICE9PSAndGFiJykge1xuICAgICAgICByb3cuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgICAgICAgICAgLy8gQXZvaWQgdG9nZ2xpbmcgaWYgY2xpY2tpbmcgYWN0aW9ucyBvciBjaGVja2JveFxuICAgICAgICAgICAgaWYgKChlLnRhcmdldCBhcyBIVE1MRWxlbWVudCkuY2xvc2VzdCgnLmFjdGlvbi1idG4nKSB8fCAoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpLmNsb3Nlc3QoJy50cmVlLWNoZWNrYm94JykpIHJldHVybjtcbiAgICAgICAgICAgIGlmIChvblRvZ2dsZSkgb25Ub2dnbGUoKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgbm9kZSwgdG9nZ2xlLCBjaGlsZHJlbkNvbnRhaW5lciB9O1xufTtcblxuY29uc3QgcmVuZGVyVHJlZSA9ICgpID0+IHtcbiAgY29uc3QgcXVlcnkgPSBzZWFyY2hJbnB1dC52YWx1ZS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgd2luZG93c0NvbnRhaW5lci5pbm5lckhUTUwgPSBcIlwiO1xuXG4gIC8vIEZpbHRlciBMb2dpY1xuICBjb25zdCBmaWx0ZXJlZCA9IHdpbmRvd1N0YXRlXG4gICAgLm1hcCgod2luZG93KSA9PiB7XG4gICAgICBpZiAoIXF1ZXJ5KSByZXR1cm4geyB3aW5kb3csIHZpc2libGVUYWJzOiB3aW5kb3cudGFicyB9O1xuICAgICAgY29uc3QgdmlzaWJsZVRhYnMgPSB3aW5kb3cudGFicy5maWx0ZXIoXG4gICAgICAgICh0YWIpID0+IHRhYi50aXRsZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHF1ZXJ5KSB8fCB0YWIudXJsLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMocXVlcnkpXG4gICAgICApO1xuICAgICAgcmV0dXJuIHsgd2luZG93LCB2aXNpYmxlVGFicyB9O1xuICAgIH0pXG4gICAgLmZpbHRlcigoeyB2aXNpYmxlVGFicyB9KSA9PiB2aXNpYmxlVGFicy5sZW5ndGggPiAwIHx8ICFxdWVyeSk7XG5cbiAgZmlsdGVyZWQuZm9yRWFjaCgoeyB3aW5kb3csIHZpc2libGVUYWJzIH0pID0+IHtcbiAgICBjb25zdCB3aW5kb3dLZXkgPSBgdy0ke3dpbmRvdy5pZH1gO1xuICAgIGNvbnN0IGlzRXhwYW5kZWQgPSAhIXF1ZXJ5IHx8IGV4cGFuZGVkTm9kZXMuaGFzKHdpbmRvd0tleSk7XG5cbiAgICAvLyBXaW5kb3cgQ2hlY2tib3ggTG9naWNcbiAgICBjb25zdCBhbGxUYWJJZHMgPSB2aXNpYmxlVGFicy5tYXAodCA9PiB0LmlkKTtcbiAgICBjb25zdCBzZWxlY3RlZENvdW50ID0gYWxsVGFiSWRzLmZpbHRlcihpZCA9PiBzZWxlY3RlZFRhYnMuaGFzKGlkKSkubGVuZ3RoO1xuICAgIGNvbnN0IGlzQWxsID0gc2VsZWN0ZWRDb3VudCA9PT0gYWxsVGFiSWRzLmxlbmd0aCAmJiBhbGxUYWJJZHMubGVuZ3RoID4gMDtcbiAgICBjb25zdCBpc1NvbWUgPSBzZWxlY3RlZENvdW50ID4gMCAmJiBzZWxlY3RlZENvdW50IDwgYWxsVGFiSWRzLmxlbmd0aDtcblxuICAgIGNvbnN0IHdpbkNoZWNrYm94ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImlucHV0XCIpO1xuICAgIHdpbkNoZWNrYm94LnR5cGUgPSBcImNoZWNrYm94XCI7XG4gICAgd2luQ2hlY2tib3guY2xhc3NOYW1lID0gXCJ0cmVlLWNoZWNrYm94XCI7XG4gICAgd2luQ2hlY2tib3guY2hlY2tlZCA9IGlzQWxsO1xuICAgIHdpbkNoZWNrYm94LmluZGV0ZXJtaW5hdGUgPSBpc1NvbWU7XG4gICAgd2luQ2hlY2tib3gub25jbGljayA9IChlKSA9PiB7XG4gICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgIGNvbnN0IHRhcmdldFN0YXRlID0gIWlzQWxsOyAvLyBJZiBhbGwgd2VyZSBzZWxlY3RlZCwgZGVzZWxlY3QuIE90aGVyd2lzZSBzZWxlY3QgYWxsLlxuICAgICAgICBhbGxUYWJJZHMuZm9yRWFjaChpZCA9PiB7XG4gICAgICAgICAgICBpZiAodGFyZ2V0U3RhdGUpIHNlbGVjdGVkVGFicy5hZGQoaWQpO1xuICAgICAgICAgICAgZWxzZSBzZWxlY3RlZFRhYnMuZGVsZXRlKGlkKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJlbmRlclRyZWUoKTtcbiAgICB9O1xuXG4gICAgLy8gV2luZG93IENvbnRlbnRcbiAgICBjb25zdCB3aW5Db250ZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICB3aW5Db250ZW50LnN0eWxlLmRpc3BsYXkgPSBcImZsZXhcIjtcbiAgICB3aW5Db250ZW50LnN0eWxlLmFsaWduSXRlbXMgPSBcImNlbnRlclwiO1xuICAgIHdpbkNvbnRlbnQuc3R5bGUuZmxleCA9IFwiMVwiO1xuICAgIHdpbkNvbnRlbnQuc3R5bGUub3ZlcmZsb3cgPSBcImhpZGRlblwiO1xuXG4gICAgY29uc3QgbGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGxhYmVsLmNsYXNzTmFtZSA9IFwidHJlZS1sYWJlbFwiO1xuICAgIGxhYmVsLnRleHRDb250ZW50ID0gd2luZG93LnRpdGxlO1xuXG4gICAgY29uc3QgY291bnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGNvdW50LmNsYXNzTmFtZSA9IFwidHJlZS1jb3VudFwiO1xuICAgIGNvdW50LnRleHRDb250ZW50ID0gYCgke3Zpc2libGVUYWJzLmxlbmd0aH0gVGFicylgO1xuXG4gICAgd2luQ29udGVudC5hcHBlbmQod2luQ2hlY2tib3gsIGxhYmVsLCBjb3VudCk7XG5cbiAgICAvLyBDaGlsZHJlbiAoR3JvdXBzKVxuICAgIGNvbnN0IGNoaWxkcmVuQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcblxuICAgIC8vIEdyb3VwIHRhYnNcbiAgICBjb25zdCBncm91cHMgPSBuZXcgTWFwPHN0cmluZywgeyBjb2xvcjogc3RyaW5nOyB0YWJzOiBUYWJXaXRoR3JvdXBbXSB9PigpO1xuICAgIGNvbnN0IHVuZ3JvdXBlZFRhYnM6IFRhYldpdGhHcm91cFtdID0gW107XG4gICAgdmlzaWJsZVRhYnMuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgICBpZiAodGFiLmdyb3VwTGFiZWwpIHtcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IHRhYi5ncm91cExhYmVsO1xuICAgICAgICAgICAgY29uc3QgZW50cnkgPSBncm91cHMuZ2V0KGtleSkgPz8geyBjb2xvcjogdGFiLmdyb3VwQ29sb3IhLCB0YWJzOiBbXSB9O1xuICAgICAgICAgICAgZW50cnkudGFicy5wdXNoKHRhYik7XG4gICAgICAgICAgICBncm91cHMuc2V0KGtleSwgZW50cnkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdW5ncm91cGVkVGFicy5wdXNoKHRhYik7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IGNyZWF0ZVRhYk5vZGUgPSAodGFiOiBUYWJXaXRoR3JvdXApID0+IHtcbiAgICAgICAgY29uc3QgdGFiQ29udGVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIHRhYkNvbnRlbnQuc3R5bGUuZGlzcGxheSA9IFwiZmxleFwiO1xuICAgICAgICB0YWJDb250ZW50LnN0eWxlLmFsaWduSXRlbXMgPSBcImNlbnRlclwiO1xuICAgICAgICB0YWJDb250ZW50LnN0eWxlLmZsZXggPSBcIjFcIjtcbiAgICAgICAgdGFiQ29udGVudC5zdHlsZS5vdmVyZmxvdyA9IFwiaGlkZGVuXCI7XG5cbiAgICAgICAgLy8gVGFiIENoZWNrYm94XG4gICAgICAgIGNvbnN0IHRhYkNoZWNrYm94ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImlucHV0XCIpO1xuICAgICAgICB0YWJDaGVja2JveC50eXBlID0gXCJjaGVja2JveFwiO1xuICAgICAgICB0YWJDaGVja2JveC5jbGFzc05hbWUgPSBcInRyZWUtY2hlY2tib3hcIjtcbiAgICAgICAgdGFiQ2hlY2tib3guY2hlY2tlZCA9IHNlbGVjdGVkVGFicy5oYXModGFiLmlkKTtcbiAgICAgICAgdGFiQ2hlY2tib3gub25jbGljayA9IChlKSA9PiB7XG4gICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgaWYgKHRhYkNoZWNrYm94LmNoZWNrZWQpIHNlbGVjdGVkVGFicy5hZGQodGFiLmlkKTtcbiAgICAgICAgICAgIGVsc2Ugc2VsZWN0ZWRUYWJzLmRlbGV0ZSh0YWIuaWQpO1xuICAgICAgICAgICAgcmVuZGVyVHJlZSgpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IHRhYkljb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICB0YWJJY29uLmNsYXNzTmFtZSA9IFwidHJlZS1pY29uXCI7XG4gICAgICAgIGlmICh0YWIuZmF2SWNvblVybCkge1xuICAgICAgICAgICAgY29uc3QgaW1nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImltZ1wiKTtcbiAgICAgICAgICAgIGltZy5zcmMgPSB0YWIuZmF2SWNvblVybDtcbiAgICAgICAgICAgIGltZy5vbmVycm9yID0gKCkgPT4geyB0YWJJY29uLmlubmVySFRNTCA9IElDT05TLmRlZmF1bHRGaWxlOyB9O1xuICAgICAgICAgICAgdGFiSWNvbi5hcHBlbmRDaGlsZChpbWcpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGFiSWNvbi5pbm5lckhUTUwgPSBJQ09OUy5kZWZhdWx0RmlsZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHRhYlRpdGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgdGFiVGl0bGUuY2xhc3NOYW1lID0gXCJ0cmVlLWxhYmVsXCI7XG4gICAgICAgIHRhYlRpdGxlLnRleHRDb250ZW50ID0gdGFiLnRpdGxlO1xuICAgICAgICB0YWJUaXRsZS50aXRsZSA9IHRhYi50aXRsZTtcblxuICAgICAgICBjb25zdCB0YWJBY3Rpb25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgdGFiQWN0aW9ucy5jbGFzc05hbWUgPSBcInJvdy1hY3Rpb25zXCI7XG4gICAgICAgIGNvbnN0IGNsb3NlQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgICAgICAgY2xvc2VCdG4uY2xhc3NOYW1lID0gXCJhY3Rpb24tYnRuIGRlbGV0ZVwiO1xuICAgICAgICBjbG9zZUJ0bi5pbm5lckhUTUwgPSBJQ09OUy5jbG9zZTtcbiAgICAgICAgY2xvc2VCdG4udGl0bGUgPSBcIkNsb3NlIFRhYlwiO1xuICAgICAgICBjbG9zZUJ0bi5vbmNsaWNrID0gYXN5bmMgKGUpID0+IHtcbiAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICBhd2FpdCBjaHJvbWUudGFicy5yZW1vdmUodGFiLmlkKTtcbiAgICAgICAgICAgIGF3YWl0IGxvYWRTdGF0ZSgpO1xuICAgICAgICB9O1xuICAgICAgICB0YWJBY3Rpb25zLmFwcGVuZENoaWxkKGNsb3NlQnRuKTtcblxuICAgICAgICB0YWJDb250ZW50LmFwcGVuZCh0YWJDaGVja2JveCwgdGFiSWNvbiwgdGFiVGl0bGUsIHRhYkFjdGlvbnMpO1xuXG4gICAgICAgIGNvbnN0IHsgbm9kZTogdGFiTm9kZSB9ID0gY3JlYXRlTm9kZSh0YWJDb250ZW50LCBudWxsLCAndGFiJyk7XG4gICAgICAgIHRhYk5vZGUub25jbGljayA9IGFzeW5jIChlKSA9PiB7XG4gICAgICAgICAgICAvLyBDbGlja2luZyB0YWIgcm93IGFjdGl2YXRlcyB0YWIgKHVubGVzcyBjbGlja2luZyBjaGVja2JveC9hY3Rpb24pXG4gICAgICAgICAgICBpZiAoKGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5jbG9zZXN0KCcudHJlZS1jaGVja2JveCcpKSByZXR1cm47XG4gICAgICAgICAgICBhd2FpdCBjaHJvbWUudGFicy51cGRhdGUodGFiLmlkLCB7IGFjdGl2ZTogdHJ1ZSB9KTtcbiAgICAgICAgICAgIGF3YWl0IGNocm9tZS53aW5kb3dzLnVwZGF0ZSh0YWIud2luZG93SWQsIHsgZm9jdXNlZDogdHJ1ZSB9KTtcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHRhYk5vZGU7XG4gICAgfTtcblxuICAgIEFycmF5LmZyb20oZ3JvdXBzLmVudHJpZXMoKSkuc29ydCgpLmZvckVhY2goKFtncm91cExhYmVsLCBncm91cERhdGFdKSA9PiB7XG4gICAgICAgIGNvbnN0IGdyb3VwS2V5ID0gYCR7d2luZG93S2V5fS1nLSR7Z3JvdXBMYWJlbH1gO1xuICAgICAgICBjb25zdCBpc0dyb3VwRXhwYW5kZWQgPSAhIXF1ZXJ5IHx8IGV4cGFuZGVkTm9kZXMuaGFzKGdyb3VwS2V5KTtcblxuICAgICAgICAvLyBHcm91cCBDaGVja2JveCBMb2dpY1xuICAgICAgICBjb25zdCBncm91cFRhYklkcyA9IGdyb3VwRGF0YS50YWJzLm1hcCh0ID0+IHQuaWQpO1xuICAgICAgICBjb25zdCBncnBTZWxlY3RlZENvdW50ID0gZ3JvdXBUYWJJZHMuZmlsdGVyKGlkID0+IHNlbGVjdGVkVGFicy5oYXMoaWQpKS5sZW5ndGg7XG4gICAgICAgIGNvbnN0IGdycElzQWxsID0gZ3JwU2VsZWN0ZWRDb3VudCA9PT0gZ3JvdXBUYWJJZHMubGVuZ3RoICYmIGdyb3VwVGFiSWRzLmxlbmd0aCA+IDA7XG4gICAgICAgIGNvbnN0IGdycElzU29tZSA9IGdycFNlbGVjdGVkQ291bnQgPiAwICYmIGdycFNlbGVjdGVkQ291bnQgPCBncm91cFRhYklkcy5sZW5ndGg7XG5cbiAgICAgICAgY29uc3QgZ3JwQ2hlY2tib3ggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW5wdXRcIik7XG4gICAgICAgIGdycENoZWNrYm94LnR5cGUgPSBcImNoZWNrYm94XCI7XG4gICAgICAgIGdycENoZWNrYm94LmNsYXNzTmFtZSA9IFwidHJlZS1jaGVja2JveFwiO1xuICAgICAgICBncnBDaGVja2JveC5jaGVja2VkID0gZ3JwSXNBbGw7XG4gICAgICAgIGdycENoZWNrYm94LmluZGV0ZXJtaW5hdGUgPSBncnBJc1NvbWU7XG4gICAgICAgIGdycENoZWNrYm94Lm9uY2xpY2sgPSAoZSkgPT4ge1xuICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldFN0YXRlID0gIWdycElzQWxsO1xuICAgICAgICAgICAgZ3JvdXBUYWJJZHMuZm9yRWFjaChpZCA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldFN0YXRlKSBzZWxlY3RlZFRhYnMuYWRkKGlkKTtcbiAgICAgICAgICAgICAgICBlbHNlIHNlbGVjdGVkVGFicy5kZWxldGUoaWQpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZW5kZXJUcmVlKCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgLy8gR3JvdXAgQ29udGVudFxuICAgICAgICBjb25zdCBncnBDb250ZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgZ3JwQ29udGVudC5zdHlsZS5kaXNwbGF5ID0gXCJmbGV4XCI7XG4gICAgICAgIGdycENvbnRlbnQuc3R5bGUuYWxpZ25JdGVtcyA9IFwiY2VudGVyXCI7XG4gICAgICAgIGdycENvbnRlbnQuc3R5bGUuZmxleCA9IFwiMVwiO1xuICAgICAgICBncnBDb250ZW50LnN0eWxlLm92ZXJmbG93ID0gXCJoaWRkZW5cIjtcblxuICAgICAgICBjb25zdCBpY29uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgaWNvbi5jbGFzc05hbWUgPSBcInRyZWUtaWNvblwiO1xuICAgICAgICBpY29uLmlubmVySFRNTCA9IFRSRUVfSUNPTlMuZm9sZGVyO1xuXG4gICAgICAgIGNvbnN0IGdycExhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgZ3JwTGFiZWwuY2xhc3NOYW1lID0gXCJ0cmVlLWxhYmVsXCI7XG4gICAgICAgIGdycExhYmVsLnRleHRDb250ZW50ID0gZ3JvdXBMYWJlbDtcblxuICAgICAgICBjb25zdCBncnBDb3VudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIGdycENvdW50LmNsYXNzTmFtZSA9IFwidHJlZS1jb3VudFwiO1xuICAgICAgICBncnBDb3VudC50ZXh0Q29udGVudCA9IGAoJHtncm91cERhdGEudGFicy5sZW5ndGh9KWA7XG5cbiAgICAgICAgLy8gR3JvdXAgQWN0aW9uc1xuICAgICAgICBjb25zdCBhY3Rpb25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgYWN0aW9ucy5jbGFzc05hbWUgPSBcInJvdy1hY3Rpb25zXCI7XG4gICAgICAgIGNvbnN0IHVuZ3JvdXBCdG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICAgICAgICB1bmdyb3VwQnRuLmNsYXNzTmFtZSA9IFwiYWN0aW9uLWJ0blwiO1xuICAgICAgICB1bmdyb3VwQnRuLmlubmVySFRNTCA9IElDT05TLnVuZ3JvdXA7XG4gICAgICAgIHVuZ3JvdXBCdG4udGl0bGUgPSBcIlVuZ3JvdXBcIjtcbiAgICAgICAgdW5ncm91cEJ0bi5vbmNsaWNrID0gYXN5bmMgKGUpID0+IHtcbiAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICBpZiAoY29uZmlybShgVW5ncm91cCAke2dyb3VwRGF0YS50YWJzLmxlbmd0aH0gdGFicz9gKSkge1xuICAgICAgICAgICAgICAgIGF3YWl0IGNocm9tZS50YWJzLnVuZ3JvdXAoZ3JvdXBEYXRhLnRhYnMubWFwKHQgPT4gdC5pZCkpO1xuICAgICAgICAgICAgICAgIGF3YWl0IGxvYWRTdGF0ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICBhY3Rpb25zLmFwcGVuZENoaWxkKHVuZ3JvdXBCdG4pO1xuXG4gICAgICAgIGdycENvbnRlbnQuYXBwZW5kKGdycENoZWNrYm94LCBpY29uLCBncnBMYWJlbCwgZ3JwQ291bnQsIGFjdGlvbnMpO1xuXG4gICAgICAgIC8vIFRhYnNcbiAgICAgICAgY29uc3QgdGFic0NvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIGdyb3VwRGF0YS50YWJzLmZvckVhY2godGFiID0+IHtcbiAgICAgICAgICAgIHRhYnNDb250YWluZXIuYXBwZW5kQ2hpbGQoY3JlYXRlVGFiTm9kZSh0YWIpKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgeyBub2RlOiBncm91cE5vZGUsIHRvZ2dsZTogZ3JwVG9nZ2xlLCBjaGlsZHJlbkNvbnRhaW5lcjogZ3JwQ2hpbGRyZW4gfSA9IGNyZWF0ZU5vZGUoXG4gICAgICAgICAgICBncnBDb250ZW50LFxuICAgICAgICAgICAgdGFic0NvbnRhaW5lcixcbiAgICAgICAgICAgICdncm91cCcsXG4gICAgICAgICAgICBpc0dyb3VwRXhwYW5kZWQsXG4gICAgICAgICAgICAoKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGV4cGFuZGVkTm9kZXMuaGFzKGdyb3VwS2V5KSkgZXhwYW5kZWROb2Rlcy5kZWxldGUoZ3JvdXBLZXkpO1xuICAgICAgICAgICAgICAgIGVsc2UgZXhwYW5kZWROb2Rlcy5hZGQoZ3JvdXBLZXkpO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgZXhwYW5kZWQgPSBleHBhbmRlZE5vZGVzLmhhcyhncm91cEtleSk7XG4gICAgICAgICAgICAgICAgZ3JwVG9nZ2xlLmNsYXNzTGlzdC50b2dnbGUoJ3JvdGF0ZWQnLCBleHBhbmRlZCk7XG4gICAgICAgICAgICAgICAgZ3JwQ2hpbGRyZW4hLmNsYXNzTGlzdC50b2dnbGUoJ2V4cGFuZGVkJywgZXhwYW5kZWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICApO1xuXG4gICAgICAgIC8vIEFwcGx5IGJhY2tncm91bmQgY29sb3IgdG8gZ3JvdXAgbm9kZVxuICAgICAgICBpZiAoZ3JvdXBEYXRhLmNvbG9yKSB7XG4gICAgICAgICAgICBjb25zdCBjb2xvck5hbWUgPSBncm91cERhdGEuY29sb3I7XG4gICAgICAgICAgICBjb25zdCBoZXggPSBHUk9VUF9DT0xPUlNbY29sb3JOYW1lXSB8fCBjb2xvck5hbWU7IC8vIEZhbGxiYWNrIGlmIGl0J3MgYWxyZWFkeSBoZXhcbiAgICAgICAgICAgIGlmIChoZXguc3RhcnRzV2l0aCgnIycpKSB7XG4gICAgICAgICAgICAgICAgZ3JvdXBOb2RlLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IGhleFRvUmdiYShoZXgsIDAuMSk7XG4gICAgICAgICAgICAgICAgZ3JvdXBOb2RlLnN0eWxlLmJvcmRlciA9IGAxcHggc29saWQgJHtoZXhUb1JnYmEoaGV4LCAwLjIpfWA7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBjaGlsZHJlbkNvbnRhaW5lci5hcHBlbmRDaGlsZChncm91cE5vZGUpO1xuICAgIH0pO1xuXG4gICAgdW5ncm91cGVkVGFicy5mb3JFYWNoKHRhYiA9PiB7XG4gICAgICAgIGNoaWxkcmVuQ29udGFpbmVyLmFwcGVuZENoaWxkKGNyZWF0ZVRhYk5vZGUodGFiKSk7XG4gICAgfSk7XG5cbiAgICBjb25zdCB7IG5vZGU6IHdpbk5vZGUsIHRvZ2dsZTogd2luVG9nZ2xlLCBjaGlsZHJlbkNvbnRhaW5lcjogd2luQ2hpbGRyZW4gfSA9IGNyZWF0ZU5vZGUoXG4gICAgICAgIHdpbkNvbnRlbnQsXG4gICAgICAgIGNoaWxkcmVuQ29udGFpbmVyLFxuICAgICAgICAnd2luZG93JyxcbiAgICAgICAgaXNFeHBhbmRlZCxcbiAgICAgICAgKCkgPT4ge1xuICAgICAgICAgICAgIGlmIChleHBhbmRlZE5vZGVzLmhhcyh3aW5kb3dLZXkpKSBleHBhbmRlZE5vZGVzLmRlbGV0ZSh3aW5kb3dLZXkpO1xuICAgICAgICAgICAgIGVsc2UgZXhwYW5kZWROb2Rlcy5hZGQod2luZG93S2V5KTtcblxuICAgICAgICAgICAgIGNvbnN0IGV4cGFuZGVkID0gZXhwYW5kZWROb2Rlcy5oYXMod2luZG93S2V5KTtcbiAgICAgICAgICAgICB3aW5Ub2dnbGUuY2xhc3NMaXN0LnRvZ2dsZSgncm90YXRlZCcsIGV4cGFuZGVkKTtcbiAgICAgICAgICAgICB3aW5DaGlsZHJlbiEuY2xhc3NMaXN0LnRvZ2dsZSgnZXhwYW5kZWQnLCBleHBhbmRlZCk7XG4gICAgICAgIH1cbiAgICApO1xuXG4gICAgd2luZG93c0NvbnRhaW5lci5hcHBlbmRDaGlsZCh3aW5Ob2RlKTtcbiAgfSk7XG5cbiAgdXBkYXRlU3RhdHMoKTtcbn07XG5cbi8vIFN0cmF0ZWd5IFJlbmRlcmluZ1xuZnVuY3Rpb24gdXBkYXRlU3RyYXRlZ3lWaWV3cyhzdHJhdGVnaWVzOiBTdHJhdGVneURlZmluaXRpb25bXSwgZW5hYmxlZElkczogc3RyaW5nW10pIHtcbiAgICAvLyAxLiBSZW5kZXIgQWN0aXZlIFN0cmF0ZWdpZXNcbiAgICBhY3RpdmVTdHJhdGVnaWVzTGlzdC5pbm5lckhUTUwgPSAnJztcblxuICAgIC8vIE1haW50YWluIG9yZGVyIGZyb20gZW5hYmxlZElkc1xuICAgIGNvbnN0IGVuYWJsZWRTdHJhdGVnaWVzID0gZW5hYmxlZElkc1xuICAgICAgICAubWFwKGlkID0+IHN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IGlkKSlcbiAgICAgICAgLmZpbHRlcigocyk6IHMgaXMgU3RyYXRlZ3lEZWZpbml0aW9uID0+ICEhcyk7XG5cbiAgICBlbmFibGVkU3RyYXRlZ2llcy5mb3JFYWNoKHN0cmF0ZWd5ID0+IHtcbiAgICAgICAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIHJvdy5jbGFzc05hbWUgPSAnc3RyYXRlZ3ktcm93JztcbiAgICAgICAgcm93LmRhdGFzZXQuaWQgPSBzdHJhdGVneS5pZDtcbiAgICAgICAgcm93LmRyYWdnYWJsZSA9IHRydWU7XG5cbiAgICAgICAgLy8gRHJhZyBIYW5kbGVcbiAgICAgICAgY29uc3QgaGFuZGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIGhhbmRsZS5jbGFzc05hbWUgPSAnc3RyYXRlZ3ktZHJhZy1oYW5kbGUnO1xuICAgICAgICBoYW5kbGUuaW5uZXJIVE1MID0gJ1x1MjJFRVx1MjJFRSc7XG5cbiAgICAgICAgLy8gTGFiZWxcbiAgICAgICAgY29uc3QgbGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG4gICAgICAgIGxhYmVsLmNsYXNzTmFtZSA9ICdzdHJhdGVneS1sYWJlbCc7XG4gICAgICAgIGxhYmVsLnRleHRDb250ZW50ID0gc3RyYXRlZ3kubGFiZWw7XG5cbiAgICAgICAgLy8gVGFnc1xuICAgICAgICBsZXQgdGFnc0h0bWwgPSAnJztcbiAgICAgICAgaWYgKHN0cmF0ZWd5LnRhZ3MpIHtcbiAgICAgICAgICAgICBzdHJhdGVneS50YWdzLmZvckVhY2godGFnID0+IHtcbiAgICAgICAgICAgICAgICB0YWdzSHRtbCArPSBgPHNwYW4gY2xhc3M9XCJ0YWcgdGFnLSR7dGFnfVwiPiR7dGFnfTwvc3Bhbj5gO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBjb250ZW50V3JhcHBlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICBjb250ZW50V3JhcHBlci5zdHlsZS5mbGV4ID0gXCIxXCI7XG4gICAgICAgIGNvbnRlbnRXcmFwcGVyLnN0eWxlLmRpc3BsYXkgPSBcImZsZXhcIjtcbiAgICAgICAgY29udGVudFdyYXBwZXIuc3R5bGUuYWxpZ25JdGVtcyA9IFwiY2VudGVyXCI7XG4gICAgICAgIGNvbnRlbnRXcmFwcGVyLmFwcGVuZENoaWxkKGxhYmVsKTtcbiAgICAgICAgaWYgKHRhZ3NIdG1sKSB7XG4gICAgICAgICAgICAgY29uc3QgdGFnc0NvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcbiAgICAgICAgICAgICB0YWdzQ29udGFpbmVyLmlubmVySFRNTCA9IHRhZ3NIdG1sO1xuICAgICAgICAgICAgIGNvbnRlbnRXcmFwcGVyLmFwcGVuZENoaWxkKHRhZ3NDb250YWluZXIpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmVtb3ZlIEJ1dHRvblxuICAgICAgICBjb25zdCByZW1vdmVCdG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgICAgICAgcmVtb3ZlQnRuLmNsYXNzTmFtZSA9ICdzdHJhdGVneS1yZW1vdmUtYnRuJztcbiAgICAgICAgcmVtb3ZlQnRuLmlubmVySFRNTCA9IElDT05TLmNsb3NlOyAvLyBVc2UgSWNvbiBmb3IgY29uc2lzdGVuY3lcbiAgICAgICAgcmVtb3ZlQnRuLnRpdGxlID0gXCJSZW1vdmUgc3RyYXRlZ3lcIjtcbiAgICAgICAgcmVtb3ZlQnRuLm9uY2xpY2sgPSBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICAgYXdhaXQgdG9nZ2xlU3RyYXRlZ3koc3RyYXRlZ3kuaWQsIGZhbHNlKTtcbiAgICAgICAgfTtcblxuICAgICAgICByb3cuYXBwZW5kQ2hpbGQoaGFuZGxlKTtcbiAgICAgICAgcm93LmFwcGVuZENoaWxkKGNvbnRlbnRXcmFwcGVyKTtcblxuICAgICAgICBpZiAoc3RyYXRlZ3kuaXNDdXN0b20pIHtcbiAgICAgICAgICAgICBjb25zdCBhdXRvUnVuQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgICAgICAgICAgICBhdXRvUnVuQnRuLmNsYXNzTmFtZSA9IGBhY3Rpb24tYnRuIGF1dG8tcnVuICR7c3RyYXRlZ3kuYXV0b1J1biA/ICdhY3RpdmUnIDogJyd9YDtcbiAgICAgICAgICAgICBhdXRvUnVuQnRuLmlubmVySFRNTCA9IElDT05TLmF1dG9SdW47XG4gICAgICAgICAgICAgYXV0b1J1bkJ0bi50aXRsZSA9IGBBdXRvIFJ1bjogJHtzdHJhdGVneS5hdXRvUnVuID8gJ09OJyA6ICdPRkYnfWA7XG4gICAgICAgICAgICAgYXV0b1J1bkJ0bi5zdHlsZS5vcGFjaXR5ID0gc3RyYXRlZ3kuYXV0b1J1biA/IFwiMVwiIDogXCIwLjNcIjtcbiAgICAgICAgICAgICBhdXRvUnVuQnRuLm9uY2xpY2sgPSBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgICBpZiAoIXByZWZlcmVuY2VzPy5jdXN0b21TdHJhdGVnaWVzKSByZXR1cm47XG4gICAgICAgICAgICAgICAgIGNvbnN0IGN1c3RvbVN0cmF0SW5kZXggPSBwcmVmZXJlbmNlcy5jdXN0b21TdHJhdGVnaWVzLmZpbmRJbmRleChzID0+IHMuaWQgPT09IHN0cmF0ZWd5LmlkKTtcbiAgICAgICAgICAgICAgICAgaWYgKGN1c3RvbVN0cmF0SW5kZXggIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN0cmF0ID0gcHJlZmVyZW5jZXMuY3VzdG9tU3RyYXRlZ2llc1tjdXN0b21TdHJhdEluZGV4XTtcbiAgICAgICAgICAgICAgICAgICAgc3RyYXQuYXV0b1J1biA9ICFzdHJhdC5hdXRvUnVuO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBpc0FjdGl2ZSA9ICEhc3RyYXQuYXV0b1J1bjtcbiAgICAgICAgICAgICAgICAgICAgYXV0b1J1bkJ0bi5jbGFzc0xpc3QudG9nZ2xlKCdhY3RpdmUnLCBpc0FjdGl2ZSk7XG4gICAgICAgICAgICAgICAgICAgIGF1dG9SdW5CdG4uc3R5bGUub3BhY2l0eSA9IGlzQWN0aXZlID8gXCIxXCIgOiBcIjAuM1wiO1xuICAgICAgICAgICAgICAgICAgICBhdXRvUnVuQnRuLnRpdGxlID0gYEF1dG8gUnVuOiAke2lzQWN0aXZlID8gJ09OJyA6ICdPRkYnfWA7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHNlbmRNZXNzYWdlKFwic2F2ZVByZWZlcmVuY2VzXCIsIHsgY3VzdG9tU3RyYXRlZ2llczogcHJlZmVyZW5jZXMuY3VzdG9tU3RyYXRlZ2llcyB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICByb3cuYXBwZW5kQ2hpbGQoYXV0b1J1bkJ0bik7XG4gICAgICAgIH1cblxuICAgICAgICByb3cuYXBwZW5kQ2hpbGQocmVtb3ZlQnRuKTtcblxuICAgICAgICBhZGREbkRMaXN0ZW5lcnMocm93KTtcbiAgICAgICAgYWN0aXZlU3RyYXRlZ2llc0xpc3QuYXBwZW5kQ2hpbGQocm93KTtcbiAgICB9KTtcblxuICAgIC8vIDIuIFJlbmRlciBBZGQgU3RyYXRlZ3kgT3B0aW9uc1xuICAgIGFkZFN0cmF0ZWd5U2VsZWN0LmlubmVySFRNTCA9ICc8b3B0aW9uIHZhbHVlPVwiXCIgZGlzYWJsZWQgc2VsZWN0ZWQ+VG9waWM8L29wdGlvbj4nO1xuXG4gICAgY29uc3QgZGlzYWJsZWRTdHJhdGVnaWVzID0gc3RyYXRlZ2llcy5maWx0ZXIocyA9PiAhZW5hYmxlZElkcy5pbmNsdWRlcyhzLmlkKSk7XG4gICAgZGlzYWJsZWRTdHJhdGVnaWVzLnNvcnQoKGEsIGIpID0+IGEubGFiZWwubG9jYWxlQ29tcGFyZShiLmxhYmVsKSk7XG5cbiAgICAvLyBTZXBhcmF0ZSBzdHJhdGVnaWVzIHdpdGggQXV0by1SdW4gYWN0aXZlIGJ1dCBub3QgaW4gc29ydGluZyBsaXN0XG4gICAgY29uc3QgYmFja2dyb3VuZFN0cmF0ZWdpZXM6IFN0cmF0ZWd5RGVmaW5pdGlvbltdID0gW107XG4gICAgY29uc3QgYXZhaWxhYmxlU3RyYXRlZ2llczogU3RyYXRlZ3lEZWZpbml0aW9uW10gPSBbXTtcblxuICAgIGRpc2FibGVkU3RyYXRlZ2llcy5mb3JFYWNoKHMgPT4ge1xuICAgICAgICBpZiAocy5pc0N1c3RvbSAmJiBzLmF1dG9SdW4pIHtcbiAgICAgICAgICAgIGJhY2tncm91bmRTdHJhdGVnaWVzLnB1c2gocyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBhdmFpbGFibGVTdHJhdGVnaWVzLnB1c2gocyk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIFBvcHVsYXRlIFNlbGVjdFxuICAgIC8vIFdlIGluY2x1ZGUgYmFja2dyb3VuZCBzdHJhdGVnaWVzIGluIHRoZSBkcm9wZG93biB0b28gc28gdGhleSBjYW4gYmUgbW92ZWQgdG8gXCJBY3RpdmVcIiBzb3J0aW5nIGVhc2lseVxuICAgIC8vIGJ1dCB3ZSBtaWdodCBtYXJrIHRoZW1cbiAgICBbLi4uYmFja2dyb3VuZFN0cmF0ZWdpZXMsIC4uLmF2YWlsYWJsZVN0cmF0ZWdpZXNdLnNvcnQoKGEsIGIpID0+IGEubGFiZWwubG9jYWxlQ29tcGFyZShiLmxhYmVsKSkuZm9yRWFjaChzdHJhdGVneSA9PiB7XG4gICAgICAgIGNvbnN0IG9wdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ29wdGlvbicpO1xuICAgICAgICBvcHRpb24udmFsdWUgPSBzdHJhdGVneS5pZDtcbiAgICAgICAgb3B0aW9uLnRleHRDb250ZW50ID0gc3RyYXRlZ3kubGFiZWw7XG4gICAgICAgIGFkZFN0cmF0ZWd5U2VsZWN0LmFwcGVuZENoaWxkKG9wdGlvbik7XG4gICAgfSk7XG5cbiAgICAvLyAzLiBSZW5kZXIgQmFja2dyb3VuZCBTdHJhdGVnaWVzIFNlY3Rpb24gKGlmIGFueSlcbiAgICBsZXQgYmdTZWN0aW9uID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJiYWNrZ3JvdW5kU3RyYXRlZ2llc1NlY3Rpb25cIik7XG4gICAgaWYgKGJhY2tncm91bmRTdHJhdGVnaWVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgaWYgKCFiZ1NlY3Rpb24pIHtcbiAgICAgICAgICAgIGJnU2VjdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgICAgICBiZ1NlY3Rpb24uaWQgPSBcImJhY2tncm91bmRTdHJhdGVnaWVzU2VjdGlvblwiO1xuICAgICAgICAgICAgYmdTZWN0aW9uLmNsYXNzTmFtZSA9IFwiYWN0aXZlLXN0cmF0ZWdpZXMtc2VjdGlvblwiO1xuICAgICAgICAgICAgLy8gU3R5bGUgaXQgdG8gbG9vayBsaWtlIGFjdGl2ZSBzZWN0aW9uIGJ1dCBkaXN0aW5jdFxuICAgICAgICAgICAgYmdTZWN0aW9uLnN0eWxlLm1hcmdpblRvcCA9IFwiOHB4XCI7XG4gICAgICAgICAgICBiZ1NlY3Rpb24uc3R5bGUuYm9yZGVyVG9wID0gXCIxcHggZGFzaGVkIHZhcigtLWJvcmRlci1jb2xvcilcIjtcbiAgICAgICAgICAgIGJnU2VjdGlvbi5zdHlsZS5wYWRkaW5nVG9wID0gXCI4cHhcIjtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY29uc3QgaGVhZGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgICAgIGhlYWRlci5jbGFzc05hbWUgPSBcInNlY3Rpb24taGVhZGVyXCI7XG4gICAgICAgICAgICBoZWFkZXIudGV4dENvbnRlbnQgPSBcIkJhY2tncm91bmQgQXV0by1SdW5cIjtcbiAgICAgICAgICAgIGhlYWRlci50aXRsZSA9IFwiVGhlc2Ugc3RyYXRlZ2llcyBydW4gYXV0b21hdGljYWxseSBidXQgYXJlIG5vdCB1c2VkIGZvciBzb3J0aW5nL2dyb3VwaW5nIG9yZGVyLlwiO1xuICAgICAgICAgICAgYmdTZWN0aW9uLmFwcGVuZENoaWxkKGhlYWRlcik7XG5cbiAgICAgICAgICAgIGNvbnN0IGxpc3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgbGlzdC5jbGFzc05hbWUgPSBcInN0cmF0ZWd5LWxpc3RcIjtcbiAgICAgICAgICAgIGJnU2VjdGlvbi5hcHBlbmRDaGlsZChsaXN0KTtcblxuICAgICAgICAgICAgLy8gSW5zZXJ0IGFmdGVyIGFjdGl2ZSBsaXN0XG4gICAgICAgICAgICBhY3RpdmVTdHJhdGVnaWVzTGlzdC5wYXJlbnRFbGVtZW50Py5hZnRlcihiZ1NlY3Rpb24pO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbGlzdCA9IGJnU2VjdGlvbi5xdWVyeVNlbGVjdG9yKFwiLnN0cmF0ZWd5LWxpc3RcIikgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICAgIGxpc3QuaW5uZXJIVE1MID0gXCJcIjtcblxuICAgICAgICBiYWNrZ3JvdW5kU3RyYXRlZ2llcy5mb3JFYWNoKHN0cmF0ZWd5ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgcm93LmNsYXNzTmFtZSA9ICdzdHJhdGVneS1yb3cnO1xuICAgICAgICAgICAgcm93LmRhdGFzZXQuaWQgPSBzdHJhdGVneS5pZDtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY29uc3QgbGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG4gICAgICAgICAgICBsYWJlbC5jbGFzc05hbWUgPSAnc3RyYXRlZ3ktbGFiZWwnO1xuICAgICAgICAgICAgbGFiZWwudGV4dENvbnRlbnQgPSBzdHJhdGVneS5sYWJlbDtcbiAgICAgICAgICAgIGxhYmVsLnN0eWxlLm9wYWNpdHkgPSBcIjAuN1wiO1xuXG4gICAgICAgICAgICBjb25zdCBhdXRvUnVuQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgICAgICAgICAgIGF1dG9SdW5CdG4uY2xhc3NOYW1lID0gYGFjdGlvbi1idG4gYXV0by1ydW4gYWN0aXZlYDtcbiAgICAgICAgICAgIGF1dG9SdW5CdG4uaW5uZXJIVE1MID0gSUNPTlMuYXV0b1J1bjtcbiAgICAgICAgICAgIGF1dG9SdW5CdG4udGl0bGUgPSBgQXV0byBSdW46IE9OIChDbGljayB0byBkaXNhYmxlKWA7XG4gICAgICAgICAgICBhdXRvUnVuQnRuLnN0eWxlLm1hcmdpbkxlZnQgPSBcImF1dG9cIjtcbiAgICAgICAgICAgIGF1dG9SdW5CdG4ub25jbGljayA9IGFzeW5jIChlKSA9PiB7XG4gICAgICAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICAgICAgIGlmICghcHJlZmVyZW5jZXM/LmN1c3RvbVN0cmF0ZWdpZXMpIHJldHVybjtcbiAgICAgICAgICAgICAgICAgY29uc3QgY3VzdG9tU3RyYXRJbmRleCA9IHByZWZlcmVuY2VzLmN1c3RvbVN0cmF0ZWdpZXMuZmluZEluZGV4KHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3kuaWQpO1xuICAgICAgICAgICAgICAgICBpZiAoY3VzdG9tU3RyYXRJbmRleCAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3RyYXQgPSBwcmVmZXJlbmNlcy5jdXN0b21TdHJhdGVnaWVzW2N1c3RvbVN0cmF0SW5kZXhdO1xuICAgICAgICAgICAgICAgICAgICBzdHJhdC5hdXRvUnVuID0gZmFsc2U7IFxuICAgICAgICAgICAgICAgICAgICBhd2FpdCBzZW5kTWVzc2FnZShcInNhdmVQcmVmZXJlbmNlc1wiLCB7IGN1c3RvbVN0cmF0ZWdpZXM6IHByZWZlcmVuY2VzLmN1c3RvbVN0cmF0ZWdpZXMgfSk7XG4gICAgICAgICAgICAgICAgICAgIC8vIFVJIHVwZGF0ZSB0cmlnZ2VycyB2aWEgc2VuZE1lc3NhZ2UgcmVzcG9uc2Ugb3IgcmUtcmVuZGVyXG4gICAgICAgICAgICAgICAgICAgIC8vIEJ1dCB3ZSBzaG91bGQgcmUtcmVuZGVyIGltbWVkaWF0ZWx5IGZvciByZXNwb25zaXZlbmVzc1xuICAgICAgICAgICAgICAgICAgICB1cGRhdGVTdHJhdGVneVZpZXdzKHN0cmF0ZWdpZXMsIGVuYWJsZWRJZHMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHJvdy5hcHBlbmRDaGlsZChsYWJlbCk7XG4gICAgICAgICAgICByb3cuYXBwZW5kQ2hpbGQoYXV0b1J1bkJ0bik7XG4gICAgICAgICAgICBsaXN0LmFwcGVuZENoaWxkKHJvdyk7XG4gICAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChiZ1NlY3Rpb24pIGJnU2VjdGlvbi5yZW1vdmUoKTtcbiAgICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHRvZ2dsZVN0cmF0ZWd5KGlkOiBzdHJpbmcsIGVuYWJsZTogYm9vbGVhbikge1xuICAgIGlmICghcHJlZmVyZW5jZXMpIHJldHVybjtcbiAgICBcbiAgICBjb25zdCBhbGxTdHJhdGVnaWVzID0gZ2V0U3RyYXRlZ2llcyhwcmVmZXJlbmNlcy5jdXN0b21TdHJhdGVnaWVzKTtcbiAgICBjb25zdCB2YWxpZElkcyA9IG5ldyBTZXQoYWxsU3RyYXRlZ2llcy5tYXAocyA9PiBzLmlkKSk7XG5cbiAgICAvLyBDbGVhbiBjdXJyZW50IGxpc3QgYnkgcmVtb3Zpbmcgc3RhbGUgSURzXG4gICAgbGV0IGN1cnJlbnQgPSAocHJlZmVyZW5jZXMuc29ydGluZyB8fCBbXSkuZmlsdGVyKHNJZCA9PiB2YWxpZElkcy5oYXMoc0lkKSk7XG5cbiAgICBpZiAoZW5hYmxlKSB7XG4gICAgICAgIGlmICghY3VycmVudC5pbmNsdWRlcyhpZCkpIHtcbiAgICAgICAgICAgIGN1cnJlbnQucHVzaChpZCk7XG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICBjdXJyZW50ID0gY3VycmVudC5maWx0ZXIoc0lkID0+IHNJZCAhPT0gaWQpO1xuICAgIH1cblxuICAgIHByZWZlcmVuY2VzLnNvcnRpbmcgPSBjdXJyZW50O1xuICAgIGF3YWl0IHNlbmRNZXNzYWdlKFwic2F2ZVByZWZlcmVuY2VzXCIsIHsgc29ydGluZzogY3VycmVudCB9KTtcblxuICAgIC8vIFJlLXJlbmRlclxuICAgIHVwZGF0ZVN0cmF0ZWd5Vmlld3MoYWxsU3RyYXRlZ2llcywgY3VycmVudCk7XG59XG5cbmZ1bmN0aW9uIGFkZERuRExpc3RlbmVycyhyb3c6IEhUTUxFbGVtZW50KSB7XG4gIHJvdy5hZGRFdmVudExpc3RlbmVyKCdkcmFnc3RhcnQnLCAoZSkgPT4ge1xuICAgIHJvdy5jbGFzc0xpc3QuYWRkKCdkcmFnZ2luZycpO1xuICAgIGlmIChlLmRhdGFUcmFuc2Zlcikge1xuICAgICAgICBlLmRhdGFUcmFuc2Zlci5lZmZlY3RBbGxvd2VkID0gJ21vdmUnO1xuICAgIH1cbiAgfSk7XG5cbiAgcm93LmFkZEV2ZW50TGlzdGVuZXIoJ2RyYWdlbmQnLCBhc3luYyAoKSA9PiB7XG4gICAgcm93LmNsYXNzTGlzdC5yZW1vdmUoJ2RyYWdnaW5nJyk7XG4gICAgLy8gU2F2ZSBvcmRlclxuICAgIGlmIChwcmVmZXJlbmNlcykge1xuICAgICAgICBjb25zdCBjdXJyZW50U29ydGluZyA9IGdldFNlbGVjdGVkU29ydGluZygpO1xuICAgICAgICAvLyBDaGVjayBpZiBvcmRlciBjaGFuZ2VkXG4gICAgICAgIGNvbnN0IG9sZFNvcnRpbmcgPSBwcmVmZXJlbmNlcy5zb3J0aW5nIHx8IFtdO1xuICAgICAgICBpZiAoSlNPTi5zdHJpbmdpZnkoY3VycmVudFNvcnRpbmcpICE9PSBKU09OLnN0cmluZ2lmeShvbGRTb3J0aW5nKSkge1xuICAgICAgICAgICAgcHJlZmVyZW5jZXMuc29ydGluZyA9IGN1cnJlbnRTb3J0aW5nO1xuICAgICAgICAgICAgYXdhaXQgc2VuZE1lc3NhZ2UoXCJzYXZlUHJlZmVyZW5jZXNcIiwgeyBzb3J0aW5nOiBjdXJyZW50U29ydGluZyB9KTtcbiAgICAgICAgfVxuICAgIH1cbiAgfSk7XG59XG5cbmZ1bmN0aW9uIHNldHVwQ29udGFpbmVyRG5EKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcbiAgICBjb250YWluZXIuYWRkRXZlbnRMaXN0ZW5lcignZHJhZ292ZXInLCAoZSkgPT4ge1xuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIGNvbnN0IGFmdGVyRWxlbWVudCA9IGdldERyYWdBZnRlckVsZW1lbnQoY29udGFpbmVyLCBlLmNsaWVudFkpO1xuICAgICAgICBjb25zdCBkcmFnZ2FibGVSb3cgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuc3RyYXRlZ3ktcm93LmRyYWdnaW5nJyk7XG4gICAgICAgIGlmIChkcmFnZ2FibGVSb3cgJiYgZHJhZ2dhYmxlUm93LnBhcmVudEVsZW1lbnQgPT09IGNvbnRhaW5lcikge1xuICAgICAgICAgICAgIGlmIChhZnRlckVsZW1lbnQgPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChkcmFnZ2FibGVSb3cpO1xuICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29udGFpbmVyLmluc2VydEJlZm9yZShkcmFnZ2FibGVSb3csIGFmdGVyRWxlbWVudCk7XG4gICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSk7XG59XG5cbnNldHVwQ29udGFpbmVyRG5EKGFjdGl2ZVN0cmF0ZWdpZXNMaXN0KTtcblxuZnVuY3Rpb24gZ2V0RHJhZ0FmdGVyRWxlbWVudChjb250YWluZXI6IEhUTUxFbGVtZW50LCB5OiBudW1iZXIpIHtcbiAgY29uc3QgZHJhZ2dhYmxlRWxlbWVudHMgPSBBcnJheS5mcm9tKGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcuc3RyYXRlZ3ktcm93Om5vdCguZHJhZ2dpbmcpJykpO1xuXG4gIHJldHVybiBkcmFnZ2FibGVFbGVtZW50cy5yZWR1Y2UoKGNsb3Nlc3QsIGNoaWxkKSA9PiB7XG4gICAgY29uc3QgYm94ID0gY2hpbGQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgY29uc3Qgb2Zmc2V0ID0geSAtIGJveC50b3AgLSBib3guaGVpZ2h0IC8gMjtcbiAgICBpZiAob2Zmc2V0IDwgMCAmJiBvZmZzZXQgPiBjbG9zZXN0Lm9mZnNldCkge1xuICAgICAgcmV0dXJuIHsgb2Zmc2V0OiBvZmZzZXQsIGVsZW1lbnQ6IGNoaWxkIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBjbG9zZXN0O1xuICAgIH1cbiAgfSwgeyBvZmZzZXQ6IE51bWJlci5ORUdBVElWRV9JTkZJTklUWSwgZWxlbWVudDogbnVsbCBhcyBFbGVtZW50IHwgbnVsbCB9KS5lbGVtZW50O1xufVxuXG5jb25zdCB1cGRhdGVVSSA9IChcbiAgc3RhdGVEYXRhOiB7IGdyb3VwczogVGFiR3JvdXBbXTsgcHJlZmVyZW5jZXM6IFByZWZlcmVuY2VzIH0sXG4gIGN1cnJlbnRXaW5kb3c6IGNocm9tZS53aW5kb3dzLldpbmRvdyB8IHVuZGVmaW5lZCxcbiAgY2hyb21lV2luZG93czogY2hyb21lLndpbmRvd3MuV2luZG93W10sXG4gIGlzUHJlbGltaW5hcnkgPSBmYWxzZVxuKSA9PiB7XG4gICAgcHJlZmVyZW5jZXMgPSBzdGF0ZURhdGEucHJlZmVyZW5jZXM7XG5cbiAgICBpZiAocHJlZmVyZW5jZXMpIHtcbiAgICAgIGNvbnN0IHMgPSBwcmVmZXJlbmNlcy5zb3J0aW5nIHx8IFtdO1xuXG4gICAgICAvLyBJbml0aWFsaXplIExvZ2dlclxuICAgICAgc2V0TG9nZ2VyUHJlZmVyZW5jZXMocHJlZmVyZW5jZXMpO1xuXG4gICAgICBjb25zdCBhbGxTdHJhdGVnaWVzID0gZ2V0U3RyYXRlZ2llcyhwcmVmZXJlbmNlcy5jdXN0b21TdHJhdGVnaWVzKTtcblxuICAgICAgLy8gUmVuZGVyIHVuaWZpZWQgc3RyYXRlZ3kgbGlzdFxuICAgICAgdXBkYXRlU3RyYXRlZ3lWaWV3cyhhbGxTdHJhdGVnaWVzLCBzKTtcblxuICAgICAgLy8gSW5pdGlhbCB0aGVtZSBsb2FkXG4gICAgICBpZiAocHJlZmVyZW5jZXMudGhlbWUpIHtcbiAgICAgICAgYXBwbHlUaGVtZShwcmVmZXJlbmNlcy50aGVtZSwgZmFsc2UpO1xuICAgICAgfVxuXG4gICAgICAvLyBJbml0IHNldHRpbmdzIFVJXG4gICAgICBpZiAocHJlZmVyZW5jZXMubG9nTGV2ZWwpIHtcbiAgICAgICAgICBjb25zdCBzZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbG9nTGV2ZWxTZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgICBpZiAoc2VsZWN0KSBzZWxlY3QudmFsdWUgPSBwcmVmZXJlbmNlcy5sb2dMZXZlbDtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoY3VycmVudFdpbmRvdykge1xuICAgICAgZm9jdXNlZFdpbmRvd0lkID0gY3VycmVudFdpbmRvdy5pZCA/PyBudWxsO1xuICAgIH0gZWxzZSB7XG4gICAgICBmb2N1c2VkV2luZG93SWQgPSBudWxsO1xuICAgICAgY29uc29sZS53YXJuKFwiRmFpbGVkIHRvIGdldCBjdXJyZW50IHdpbmRvd1wiKTtcbiAgICB9XG5cbiAgICBjb25zdCB3aW5kb3dUaXRsZXMgPSBuZXcgTWFwPG51bWJlciwgc3RyaW5nPigpO1xuXG4gICAgY2hyb21lV2luZG93cy5mb3JFYWNoKCh3aW4pID0+IHtcbiAgICAgIGlmICghd2luLmlkKSByZXR1cm47XG4gICAgICBjb25zdCBhY3RpdmVUYWJUaXRsZSA9IHdpbi50YWJzPy5maW5kKCh0YWIpID0+IHRhYi5hY3RpdmUpPy50aXRsZTtcbiAgICAgIGNvbnN0IHRpdGxlID0gYWN0aXZlVGFiVGl0bGUgPz8gYFdpbmRvdyAke3dpbi5pZH1gO1xuICAgICAgd2luZG93VGl0bGVzLnNldCh3aW4uaWQsIHRpdGxlKTtcbiAgICB9KTtcblxuICAgIHdpbmRvd1N0YXRlID0gbWFwV2luZG93cyhzdGF0ZURhdGEuZ3JvdXBzLCB3aW5kb3dUaXRsZXMpO1xuXG4gICAgaWYgKGZvY3VzZWRXaW5kb3dJZCAhPT0gbnVsbCkge1xuICAgICAgICB3aW5kb3dTdGF0ZS5zb3J0KChhLCBiKSA9PiB7XG4gICAgICAgICAgICBpZiAoYS5pZCA9PT0gZm9jdXNlZFdpbmRvd0lkKSByZXR1cm4gLTE7XG4gICAgICAgICAgICBpZiAoYi5pZCA9PT0gZm9jdXNlZFdpbmRvd0lkKSByZXR1cm4gMTtcbiAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBpZiAoIWluaXRpYWxTZWxlY3Rpb25Eb25lICYmIGZvY3VzZWRXaW5kb3dJZCAhPT0gbnVsbCkge1xuICAgICAgICBjb25zdCBhY3RpdmVXaW5kb3cgPSB3aW5kb3dTdGF0ZS5maW5kKHcgPT4gdy5pZCA9PT0gZm9jdXNlZFdpbmRvd0lkKTtcbiAgICAgICAgaWYgKGFjdGl2ZVdpbmRvdykge1xuICAgICAgICAgICAgIGV4cGFuZGVkTm9kZXMuYWRkKGB3LSR7YWN0aXZlV2luZG93LmlkfWApO1xuICAgICAgICAgICAgIGFjdGl2ZVdpbmRvdy50YWJzLmZvckVhY2godCA9PiBzZWxlY3RlZFRhYnMuYWRkKHQuaWQpKTtcblxuICAgICAgICAgICAgIGlmICghaXNQcmVsaW1pbmFyeSkge1xuICAgICAgICAgICAgICAgICBpbml0aWFsU2VsZWN0aW9uRG9uZSA9IHRydWU7XG4gICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmVuZGVyVHJlZSgpO1xufTtcblxuY29uc3QgbG9hZFN0YXRlID0gYXN5bmMgKCkgPT4ge1xuICBsb2dJbmZvKFwiTG9hZGluZyBwb3B1cCBzdGF0ZVwiKTtcblxuICBsZXQgYmdGaW5pc2hlZCA9IGZhbHNlO1xuXG4gIGNvbnN0IGZhc3RMb2FkID0gYXN5bmMgKCkgPT4ge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IFtsb2NhbFJlcywgY3csIGF3XSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgICAgICAgIGZldGNoTG9jYWxTdGF0ZSgpLFxuICAgICAgICAgICAgY2hyb21lLndpbmRvd3MuZ2V0Q3VycmVudCgpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCksXG4gICAgICAgICAgICBjaHJvbWUud2luZG93cy5nZXRBbGwoeyB3aW5kb3dUeXBlczogW1wibm9ybWFsXCJdLCBwb3B1bGF0ZTogdHJ1ZSB9KS5jYXRjaCgoKSA9PiBbXSlcbiAgICAgICAgXSk7XG5cbiAgICAgICAgLy8gT25seSB1cGRhdGUgaWYgYmFja2dyb3VuZCBoYXNuJ3QgZmluaXNoZWQgeWV0XG4gICAgICAgIGlmICghYmdGaW5pc2hlZCAmJiBsb2NhbFJlcy5vayAmJiBsb2NhbFJlcy5kYXRhKSB7XG4gICAgICAgICAgICAgdXBkYXRlVUkobG9jYWxSZXMuZGF0YSwgY3csIGF3IGFzIGNocm9tZS53aW5kb3dzLldpbmRvd1tdLCB0cnVlKTtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS53YXJuKFwiRmFzdCBsb2FkIGZhaWxlZFwiLCBlKTtcbiAgICB9XG4gIH07XG5cbiAgY29uc3QgYmdMb2FkID0gYXN5bmMgKCkgPT4ge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IFtiZ1JlcywgY3csIGF3XSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgICAgICAgIGZldGNoU3RhdGUoKSxcbiAgICAgICAgICAgIGNocm9tZS53aW5kb3dzLmdldEN1cnJlbnQoKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpLFxuICAgICAgICAgICAgY2hyb21lLndpbmRvd3MuZ2V0QWxsKHsgd2luZG93VHlwZXM6IFtcIm5vcm1hbFwiXSwgcG9wdWxhdGU6IHRydWUgfSkuY2F0Y2goKCkgPT4gW10pXG4gICAgICAgIF0pO1xuXG4gICAgICAgIGJnRmluaXNoZWQgPSB0cnVlOyAvLyBNYXJrIGFzIGZpbmlzaGVkIHNvIGZhc3QgbG9hZCBkb2Vzbid0IG92ZXJ3cml0ZSBpZiBpdCdzIHNvbWVob3cgc2xvd1xuXG4gICAgICAgIGlmIChiZ1Jlcy5vayAmJiBiZ1Jlcy5kYXRhKSB7XG4gICAgICAgICAgICAgdXBkYXRlVUkoYmdSZXMuZGF0YSwgY3csIGF3IGFzIGNocm9tZS53aW5kb3dzLldpbmRvd1tdKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gbG9hZCBzdGF0ZTpcIiwgYmdSZXMuZXJyb3IgPz8gXCJVbmtub3duIGVycm9yXCIpO1xuICAgICAgICAgICAgaWYgKHdpbmRvd1N0YXRlLmxlbmd0aCA9PT0gMCkgeyAvLyBPbmx5IHNob3cgZXJyb3IgaWYgd2UgaGF2ZSBOT1RISU5HIHNob3duXG4gICAgICAgICAgICAgICAgd2luZG93c0NvbnRhaW5lci5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz1cImVycm9yLXN0YXRlXCIgc3R5bGU9XCJwYWRkaW5nOiAyMHB4OyBjb2xvcjogdmFyKC0tZXJyb3ItY29sb3IsIHJlZCk7IHRleHQtYWxpZ246IGNlbnRlcjtcIj5cbiAgICAgICAgICAgICAgICAgICAgRmFpbGVkIHRvIGxvYWQgdGFiczogJHtiZ1Jlcy5lcnJvciA/PyBcIlVua25vd24gZXJyb3JcIn0uPGJyPlxuICAgICAgICAgICAgICAgICAgICBQbGVhc2UgcmVsb2FkIHRoZSBleHRlbnNpb24gb3IgY2hlY2sgcGVybWlzc2lvbnMuXG4gICAgICAgICAgICAgICAgPC9kaXY+YDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yIGxvYWRpbmcgc3RhdGU6XCIsIGUpO1xuICAgIH1cbiAgfTtcblxuICAvLyBTdGFydCBib3RoIGNvbmN1cnJlbnRseVxuICBhd2FpdCBQcm9taXNlLmFsbChbZmFzdExvYWQoKSwgYmdMb2FkKCldKTtcbn07XG5cbmNvbnN0IGdldFNlbGVjdGVkU29ydGluZyA9ICgpOiBTb3J0aW5nU3RyYXRlZ3lbXSA9PiB7XG4gICAgLy8gUmVhZCBmcm9tIERPTSB0byBnZXQgY3VycmVudCBvcmRlciBvZiBhY3RpdmUgc3RyYXRlZ2llc1xuICAgIHJldHVybiBBcnJheS5mcm9tKGFjdGl2ZVN0cmF0ZWdpZXNMaXN0LmNoaWxkcmVuKVxuICAgICAgICAubWFwKHJvdyA9PiAocm93IGFzIEhUTUxFbGVtZW50KS5kYXRhc2V0LmlkIGFzIFNvcnRpbmdTdHJhdGVneSk7XG59O1xuXG4vLyBBZGQgbGlzdGVuZXIgZm9yIHNlbGVjdFxuYWRkU3RyYXRlZ3lTZWxlY3QuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgYXN5bmMgKGUpID0+IHtcbiAgICBjb25zdCBzZWxlY3QgPSBlLnRhcmdldCBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICBjb25zdCBpZCA9IHNlbGVjdC52YWx1ZTtcbiAgICBpZiAoaWQpIHtcbiAgICAgICAgYXdhaXQgdG9nZ2xlU3RyYXRlZ3koaWQsIHRydWUpO1xuICAgICAgICBzZWxlY3QudmFsdWUgPSBcIlwiOyAvLyBSZXNldCB0byBwbGFjZWhvbGRlclxuICAgIH1cbn0pO1xuXG5jb25zdCB0cmlnZ2VyR3JvdXAgPSBhc3luYyAoc2VsZWN0aW9uPzogR3JvdXBpbmdTZWxlY3Rpb24pID0+IHtcbiAgICBsb2dJbmZvKFwiVHJpZ2dlcmluZyBncm91cGluZ1wiLCB7IHNlbGVjdGlvbiB9KTtcbiAgICBzaG93TG9hZGluZyhcIkFwcGx5aW5nIFN0cmF0ZWd5Li4uXCIpO1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHNvcnRpbmcgPSBnZXRTZWxlY3RlZFNvcnRpbmcoKTtcbiAgICAgICAgYXdhaXQgYXBwbHlHcm91cGluZyh7IHNlbGVjdGlvbiwgc29ydGluZyB9KTtcbiAgICAgICAgYXdhaXQgbG9hZFN0YXRlKCk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgICAgaGlkZUxvYWRpbmcoKTtcbiAgICB9XG59O1xuXG5jaHJvbWUucnVudGltZS5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoKG1lc3NhZ2UpID0+IHtcbiAgICBpZiAobWVzc2FnZS50eXBlID09PSAnZ3JvdXBpbmdQcm9ncmVzcycpIHtcbiAgICAgICAgY29uc3QgeyBjb21wbGV0ZWQsIHRvdGFsIH0gPSBtZXNzYWdlLnBheWxvYWQ7XG4gICAgICAgIHVwZGF0ZVByb2dyZXNzKGNvbXBsZXRlZCwgdG90YWwpO1xuICAgIH1cbn0pO1xuXG4vLyBMaXN0ZW5lcnNcbnNlbGVjdEFsbENoZWNrYm94LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKGUpID0+IHtcbiAgICBjb25zdCB0YXJnZXRTdGF0ZSA9IChlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS5jaGVja2VkO1xuICAgIGlmICh0YXJnZXRTdGF0ZSkge1xuICAgICAgICAvLyBTZWxlY3QgQWxsXG4gICAgICAgIHdpbmRvd1N0YXRlLmZvckVhY2god2luID0+IHtcbiAgICAgICAgICAgIHdpbi50YWJzLmZvckVhY2godGFiID0+IHNlbGVjdGVkVGFicy5hZGQodGFiLmlkKSk7XG4gICAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIERlc2VsZWN0IEFsbFxuICAgICAgICBzZWxlY3RlZFRhYnMuY2xlYXIoKTtcbiAgICB9XG4gICAgcmVuZGVyVHJlZSgpO1xufSk7XG5cbmJ0bkFwcGx5Py5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIGxvZ0luZm8oXCJBcHBseSBidXR0b24gY2xpY2tlZFwiLCB7IHNlbGVjdGVkQ291bnQ6IHNlbGVjdGVkVGFicy5zaXplIH0pO1xuICAgIHRyaWdnZXJHcm91cCh7IHRhYklkczogQXJyYXkuZnJvbShzZWxlY3RlZFRhYnMpIH0pO1xufSk7XG5cbmJ0blVuZ3JvdXAuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcbiAgaWYgKGNvbmZpcm0oYFVuZ3JvdXAgJHtzZWxlY3RlZFRhYnMuc2l6ZX0gdGFicz9gKSkge1xuICAgICAgbG9nSW5mbyhcIlVuZ3JvdXBpbmcgdGFic1wiLCB7IGNvdW50OiBzZWxlY3RlZFRhYnMuc2l6ZSB9KTtcbiAgICAgIGF3YWl0IGNocm9tZS50YWJzLnVuZ3JvdXAoQXJyYXkuZnJvbShzZWxlY3RlZFRhYnMpKTtcbiAgICAgIGF3YWl0IGxvYWRTdGF0ZSgpO1xuICB9XG59KTtcbmJ0bk1lcmdlLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIGlmIChjb25maXJtKGBNZXJnZSAke3NlbGVjdGVkVGFicy5zaXplfSB0YWJzIGludG8gb25lIGdyb3VwP2ApKSB7XG4gICAgICBsb2dJbmZvKFwiTWVyZ2luZyB0YWJzXCIsIHsgY291bnQ6IHNlbGVjdGVkVGFicy5zaXplIH0pO1xuICAgICAgY29uc3QgcmVzID0gYXdhaXQgc2VuZE1lc3NhZ2UoXCJtZXJnZVNlbGVjdGlvblwiLCB7IHRhYklkczogQXJyYXkuZnJvbShzZWxlY3RlZFRhYnMpIH0pO1xuICAgICAgaWYgKCFyZXMub2spIGFsZXJ0KFwiTWVyZ2UgZmFpbGVkOiBcIiArIHJlcy5lcnJvcik7XG4gICAgICBlbHNlIGF3YWl0IGxvYWRTdGF0ZSgpO1xuICB9XG59KTtcbmJ0blNwbGl0LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIGlmIChjb25maXJtKGBTcGxpdCAke3NlbGVjdGVkVGFicy5zaXplfSB0YWJzIGludG8gYSBuZXcgd2luZG93P2ApKSB7XG4gICAgICBsb2dJbmZvKFwiU3BsaXR0aW5nIHRhYnNcIiwgeyBjb3VudDogc2VsZWN0ZWRUYWJzLnNpemUgfSk7XG4gICAgICBjb25zdCByZXMgPSBhd2FpdCBzZW5kTWVzc2FnZShcInNwbGl0U2VsZWN0aW9uXCIsIHsgdGFiSWRzOiBBcnJheS5mcm9tKHNlbGVjdGVkVGFicykgfSk7XG4gICAgICBpZiAoIXJlcy5vaykgYWxlcnQoXCJTcGxpdCBmYWlsZWQ6IFwiICsgcmVzLmVycm9yKTtcbiAgICAgIGVsc2UgYXdhaXQgbG9hZFN0YXRlKCk7XG4gIH1cbn0pO1xuXG5idG5FeHBhbmRBbGw/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgd2luZG93U3RhdGUuZm9yRWFjaCh3aW4gPT4ge1xuICAgICAgICBleHBhbmRlZE5vZGVzLmFkZChgdy0ke3dpbi5pZH1gKTtcbiAgICAgICAgd2luLnRhYnMuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgICAgICAgaWYgKHRhYi5ncm91cExhYmVsKSB7XG4gICAgICAgICAgICAgICAgIGV4cGFuZGVkTm9kZXMuYWRkKGB3LSR7d2luLmlkfS1nLSR7dGFiLmdyb3VwTGFiZWx9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICAgIHJlbmRlclRyZWUoKTtcbn0pO1xuXG5idG5Db2xsYXBzZUFsbD8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBleHBhbmRlZE5vZGVzLmNsZWFyKCk7XG4gICAgcmVuZGVyVHJlZSgpO1xufSk7XG5cblxuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5VbmRvXCIpPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICBsb2dJbmZvKFwiVW5kbyBjbGlja2VkXCIpO1xuICBjb25zdCByZXMgPSBhd2FpdCBzZW5kTWVzc2FnZShcInVuZG9cIik7XG4gIGlmICghcmVzLm9rKSBhbGVydChcIlVuZG8gZmFpbGVkOiBcIiArIHJlcy5lcnJvcik7XG59KTtcblxuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5TYXZlU3RhdGVcIik/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIGNvbnN0IG5hbWUgPSBwcm9tcHQoXCJFbnRlciBhIG5hbWUgZm9yIHRoaXMgc3RhdGU6XCIpO1xuICBpZiAobmFtZSkge1xuICAgIGxvZ0luZm8oXCJTYXZpbmcgc3RhdGVcIiwgeyBuYW1lIH0pO1xuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHNlbmRNZXNzYWdlKFwic2F2ZVN0YXRlXCIsIHsgbmFtZSB9KTtcbiAgICBpZiAoIXJlcy5vaykgYWxlcnQoXCJTYXZlIGZhaWxlZDogXCIgKyByZXMuZXJyb3IpO1xuICB9XG59KTtcblxuY29uc3QgbG9hZFN0YXRlRGlhbG9nID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsb2FkU3RhdGVEaWFsb2dcIikgYXMgSFRNTERpYWxvZ0VsZW1lbnQ7XG5jb25zdCBzYXZlZFN0YXRlTGlzdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2F2ZWRTdGF0ZUxpc3RcIikgYXMgSFRNTEVsZW1lbnQ7XG5cbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuTG9hZFN0YXRlXCIpPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuICBsb2dJbmZvKFwiT3BlbmluZyBMb2FkIFN0YXRlIGRpYWxvZ1wiKTtcbiAgY29uc3QgcmVzID0gYXdhaXQgc2VuZE1lc3NhZ2U8U2F2ZWRTdGF0ZVtdPihcImdldFNhdmVkU3RhdGVzXCIpO1xuICBpZiAocmVzLm9rICYmIHJlcy5kYXRhKSB7XG4gICAgc2F2ZWRTdGF0ZUxpc3QuaW5uZXJIVE1MID0gXCJcIjtcbiAgICByZXMuZGF0YS5mb3JFYWNoKChzdGF0ZSkgPT4ge1xuICAgICAgY29uc3QgbGkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwibGlcIik7XG4gICAgICBsaS5zdHlsZS5kaXNwbGF5ID0gXCJmbGV4XCI7XG4gICAgICBsaS5zdHlsZS5qdXN0aWZ5Q29udGVudCA9IFwic3BhY2UtYmV0d2VlblwiO1xuICAgICAgbGkuc3R5bGUucGFkZGluZyA9IFwiOHB4XCI7XG4gICAgICBsaS5zdHlsZS5ib3JkZXJCb3R0b20gPSBcIjFweCBzb2xpZCB2YXIoLS1ib3JkZXItY29sb3IpXCI7XG5cbiAgICAgIGNvbnN0IHNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcbiAgICAgIHNwYW4udGV4dENvbnRlbnQgPSBgJHtzdGF0ZS5uYW1lfSAoJHtuZXcgRGF0ZShzdGF0ZS50aW1lc3RhbXApLnRvTG9jYWxlU3RyaW5nKCl9KWA7XG4gICAgICBzcGFuLnN0eWxlLmN1cnNvciA9IFwicG9pbnRlclwiO1xuICAgICAgc3Bhbi5vbmNsaWNrID0gYXN5bmMgKCkgPT4ge1xuICAgICAgICBpZiAoY29uZmlybShgTG9hZCBzdGF0ZSBcIiR7c3RhdGUubmFtZX1cIj9gKSkge1xuICAgICAgICAgIGxvZ0luZm8oXCJSZXN0b3Jpbmcgc3RhdGVcIiwgeyBuYW1lOiBzdGF0ZS5uYW1lIH0pO1xuICAgICAgICAgIGNvbnN0IHIgPSBhd2FpdCBzZW5kTWVzc2FnZShcInJlc3RvcmVTdGF0ZVwiLCB7IHN0YXRlIH0pO1xuICAgICAgICAgIGlmIChyLm9rKSB7XG4gICAgICAgICAgICAgIGxvYWRTdGF0ZURpYWxvZy5jbG9zZSgpO1xuICAgICAgICAgICAgICB3aW5kb3cuY2xvc2UoKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBhbGVydChcIlJlc3RvcmUgZmFpbGVkOiBcIiArIHIuZXJyb3IpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfTtcblxuICAgICAgY29uc3QgZGVsQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgICAgIGRlbEJ0bi50ZXh0Q29udGVudCA9IFwiRGVsZXRlXCI7XG4gICAgICBkZWxCdG4uc3R5bGUubWFyZ2luTGVmdCA9IFwiOHB4XCI7XG4gICAgICBkZWxCdG4uc3R5bGUuYmFja2dyb3VuZCA9IFwidHJhbnNwYXJlbnRcIjtcbiAgICAgIGRlbEJ0bi5zdHlsZS5jb2xvciA9IFwidmFyKC0tdGV4dC1jb2xvcilcIjtcbiAgICAgIGRlbEJ0bi5zdHlsZS5ib3JkZXIgPSBcIjFweCBzb2xpZCB2YXIoLS1ib3JkZXItY29sb3IpXCI7XG4gICAgICBkZWxCdG4uc3R5bGUuYm9yZGVyUmFkaXVzID0gXCI0cHhcIjtcbiAgICAgIGRlbEJ0bi5zdHlsZS5wYWRkaW5nID0gXCIycHggNnB4XCI7XG4gICAgICBkZWxCdG4ub25jbGljayA9IGFzeW5jIChlKSA9PiB7XG4gICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICBpZiAoY29uZmlybShgRGVsZXRlIHN0YXRlIFwiJHtzdGF0ZS5uYW1lfVwiP2ApKSB7XG4gICAgICAgICAgICAgIGF3YWl0IHNlbmRNZXNzYWdlKFwiZGVsZXRlU2F2ZWRTdGF0ZVwiLCB7IG5hbWU6IHN0YXRlLm5hbWUgfSk7XG4gICAgICAgICAgICAgIGxpLnJlbW92ZSgpO1xuICAgICAgICAgIH1cbiAgICAgIH07XG5cbiAgICAgIGxpLmFwcGVuZENoaWxkKHNwYW4pO1xuICAgICAgbGkuYXBwZW5kQ2hpbGQoZGVsQnRuKTtcbiAgICAgIHNhdmVkU3RhdGVMaXN0LmFwcGVuZENoaWxkKGxpKTtcbiAgICB9KTtcbiAgICBsb2FkU3RhdGVEaWFsb2cuc2hvd01vZGFsKCk7XG4gIH0gZWxzZSB7XG4gICAgICBhbGVydChcIkZhaWxlZCB0byBsb2FkIHN0YXRlczogXCIgKyByZXMuZXJyb3IpO1xuICB9XG59KTtcblxuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5DbG9zZUxvYWRTdGF0ZVwiKT8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBsb2FkU3RhdGVEaWFsb2cuY2xvc2UoKTtcbn0pO1xuXG5zZWFyY2hJbnB1dC5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgcmVuZGVyVHJlZSk7XG5cbi8vIEF1dG8tcmVmcmVzaFxuY2hyb21lLnRhYnMub25VcGRhdGVkLmFkZExpc3RlbmVyKCgpID0+IGxvYWRTdGF0ZSgpKTtcbmNocm9tZS50YWJzLm9uUmVtb3ZlZC5hZGRMaXN0ZW5lcigoKSA9PiBsb2FkU3RhdGUoKSk7XG5jaHJvbWUud2luZG93cy5vblJlbW92ZWQuYWRkTGlzdGVuZXIoKCkgPT4gbG9hZFN0YXRlKCkpO1xuXG4vLyAtLS0gVGhlbWUgTG9naWMgLS0tXG5jb25zdCBidG5UaGVtZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYnRuVGhlbWVcIik7XG5jb25zdCBpY29uU3VuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJpY29uU3VuXCIpO1xuY29uc3QgaWNvbk1vb24gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImljb25Nb29uXCIpO1xuXG5jb25zdCBhcHBseVRoZW1lID0gKHRoZW1lOiAnbGlnaHQnIHwgJ2RhcmsnLCBzYXZlID0gZmFsc2UpID0+IHtcbiAgICBpZiAodGhlbWUgPT09ICdsaWdodCcpIHtcbiAgICAgICAgZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QuYWRkKCdsaWdodC1tb2RlJyk7XG4gICAgICAgIGlmIChpY29uU3VuKSBpY29uU3VuLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuICAgICAgICBpZiAoaWNvbk1vb24pIGljb25Nb29uLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QucmVtb3ZlKCdsaWdodC1tb2RlJyk7XG4gICAgICAgIGlmIChpY29uU3VuKSBpY29uU3VuLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgICAgIGlmIChpY29uTW9vbikgaWNvbk1vb24uc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG4gICAgfVxuXG4gICAgLy8gU3luYyB3aXRoIFByZWZlcmVuY2VzXG4gICAgaWYgKHNhdmUpIHtcbiAgICAgICAgLy8gV2UgdXNlIHNhdmVQcmVmZXJlbmNlcyB3aGljaCBjYWxscyB0aGUgYmFja2dyb3VuZCB0byBzdG9yZSBpdFxuICAgICAgICBsb2dJbmZvKFwiQXBwbHlpbmcgdGhlbWVcIiwgeyB0aGVtZSB9KTtcbiAgICAgICAgc2VuZE1lc3NhZ2UoXCJzYXZlUHJlZmVyZW5jZXNcIiwgeyB0aGVtZSB9KTtcbiAgICB9XG59O1xuXG4vLyBJbml0aWFsIGxvYWQgZmFsbGJhY2sgKGJlZm9yZSBsb2FkU3RhdGUgbG9hZHMgcHJlZnMpXG5jb25zdCBzdG9yZWRUaGVtZSA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKCd0aGVtZScpIGFzICdsaWdodCcgfCAnZGFyayc7XG4vLyBJZiB3ZSBoYXZlIGEgbG9jYWwgb3ZlcnJpZGUsIHVzZSBpdCB0ZW1wb3JhcmlseSwgYnV0IGxvYWRTdGF0ZSB3aWxsIGF1dGhvcml0YXRpdmUgY2hlY2sgcHJlZnNcbmlmIChzdG9yZWRUaGVtZSkgYXBwbHlUaGVtZShzdG9yZWRUaGVtZSwgZmFsc2UpO1xuXG5idG5UaGVtZT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgY29uc3QgaXNMaWdodCA9IGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LmNvbnRhaW5zKCdsaWdodC1tb2RlJyk7XG4gICAgY29uc3QgbmV3VGhlbWUgPSBpc0xpZ2h0ID8gJ2RhcmsnIDogJ2xpZ2h0JztcbiAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgndGhlbWUnLCBuZXdUaGVtZSk7IC8vIEtlZXAgbG9jYWwgY29weSBmb3IgZmFzdCBib290XG4gICAgYXBwbHlUaGVtZShuZXdUaGVtZSwgdHJ1ZSk7XG59KTtcblxuLy8gLS0tIFNldHRpbmdzIExvZ2ljIC0tLVxuY29uc3Qgc2V0dGluZ3NEaWFsb2cgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNldHRpbmdzRGlhbG9nXCIpIGFzIEhUTUxEaWFsb2dFbGVtZW50O1xuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5TZXR0aW5nc1wiKT8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBzZXR0aW5nc0RpYWxvZy5zaG93TW9kYWwoKTtcbn0pO1xuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5DbG9zZVNldHRpbmdzXCIpPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIHNldHRpbmdzRGlhbG9nLmNsb3NlKCk7XG59KTtcblxuY29uc3QgbG9nTGV2ZWxTZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImxvZ0xldmVsU2VsZWN0XCIpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xubG9nTGV2ZWxTZWxlY3Q/LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgYXN5bmMgKCkgPT4ge1xuICAgIGNvbnN0IG5ld0xldmVsID0gbG9nTGV2ZWxTZWxlY3QudmFsdWUgYXMgTG9nTGV2ZWw7XG4gICAgaWYgKHByZWZlcmVuY2VzKSB7XG4gICAgICAgIHByZWZlcmVuY2VzLmxvZ0xldmVsID0gbmV3TGV2ZWw7XG4gICAgICAgIC8vIFVwZGF0ZSBsb2NhbCBsb2dnZXIgaW1tZWRpYXRlbHlcbiAgICAgICAgc2V0TG9nZ2VyUHJlZmVyZW5jZXMocHJlZmVyZW5jZXMpO1xuICAgICAgICAvLyBQZXJzaXN0XG4gICAgICAgIGF3YWl0IHNlbmRNZXNzYWdlKFwic2F2ZVByZWZlcmVuY2VzXCIsIHsgbG9nTGV2ZWw6IG5ld0xldmVsIH0pO1xuICAgICAgICBsb2dEZWJ1ZyhcIkxvZyBsZXZlbCB1cGRhdGVkXCIsIHsgbGV2ZWw6IG5ld0xldmVsIH0pO1xuICAgIH1cbn0pO1xuXG4vLyAtLS0gUGluICYgUmVzaXplIExvZ2ljIC0tLVxuY29uc3QgYnRuUGluID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG5QaW5cIik7XG5idG5QaW4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG4gIGNvbnN0IHVybCA9IGNocm9tZS5ydW50aW1lLmdldFVSTChcInVpL3BvcHVwLmh0bWxcIik7XG4gIGF3YWl0IGNocm9tZS53aW5kb3dzLmNyZWF0ZSh7XG4gICAgdXJsLFxuICAgIHR5cGU6IFwicG9wdXBcIixcbiAgICB3aWR0aDogZG9jdW1lbnQuYm9keS5vZmZzZXRXaWR0aCxcbiAgICBoZWlnaHQ6IGRvY3VtZW50LmJvZHkub2Zmc2V0SGVpZ2h0XG4gIH0pO1xuICB3aW5kb3cuY2xvc2UoKTtcbn0pO1xuXG5jb25zdCByZXNpemVIYW5kbGUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJlc2l6ZUhhbmRsZVwiKTtcbmlmIChyZXNpemVIYW5kbGUpIHtcbiAgY29uc3Qgc2F2ZVNpemUgPSAodzogbnVtYmVyLCBoOiBudW1iZXIpID0+IHtcbiAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKFwicG9wdXBTaXplXCIsIEpTT04uc3RyaW5naWZ5KHsgd2lkdGg6IHcsIGhlaWdodDogaCB9KSk7XG4gIH07XG5cbiAgcmVzaXplSGFuZGxlLmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWRvd25cIiwgKGUpID0+IHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGNvbnN0IHN0YXJ0WCA9IGUuY2xpZW50WDtcbiAgICAgIGNvbnN0IHN0YXJ0WSA9IGUuY2xpZW50WTtcbiAgICAgIGNvbnN0IHN0YXJ0V2lkdGggPSBkb2N1bWVudC5ib2R5Lm9mZnNldFdpZHRoO1xuICAgICAgY29uc3Qgc3RhcnRIZWlnaHQgPSBkb2N1bWVudC5ib2R5Lm9mZnNldEhlaWdodDtcblxuICAgICAgY29uc3Qgb25Nb3VzZU1vdmUgPSAoZXY6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgICAgICBjb25zdCBuZXdXaWR0aCA9IE1hdGgubWF4KDUwMCwgc3RhcnRXaWR0aCArIChldi5jbGllbnRYIC0gc3RhcnRYKSk7XG4gICAgICAgICAgY29uc3QgbmV3SGVpZ2h0ID0gTWF0aC5tYXgoNTAwLCBzdGFydEhlaWdodCArIChldi5jbGllbnRZIC0gc3RhcnRZKSk7XG4gICAgICAgICAgZG9jdW1lbnQuYm9keS5zdHlsZS53aWR0aCA9IGAke25ld1dpZHRofXB4YDtcbiAgICAgICAgICBkb2N1bWVudC5ib2R5LnN0eWxlLmhlaWdodCA9IGAke25ld0hlaWdodH1weGA7XG4gICAgICB9O1xuXG4gICAgICBjb25zdCBvbk1vdXNlVXAgPSAoZXY6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgICAgICAgY29uc3QgbmV3V2lkdGggPSBNYXRoLm1heCg1MDAsIHN0YXJ0V2lkdGggKyAoZXYuY2xpZW50WCAtIHN0YXJ0WCkpO1xuICAgICAgICAgICBjb25zdCBuZXdIZWlnaHQgPSBNYXRoLm1heCg1MDAsIHN0YXJ0SGVpZ2h0ICsgKGV2LmNsaWVudFkgLSBzdGFydFkpKTtcbiAgICAgICAgICAgc2F2ZVNpemUobmV3V2lkdGgsIG5ld0hlaWdodCk7XG4gICAgICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb3VzZW1vdmVcIiwgb25Nb3VzZU1vdmUpO1xuICAgICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwibW91c2V1cFwiLCBvbk1vdXNlVXApO1xuICAgICAgfTtcblxuICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlbW92ZVwiLCBvbk1vdXNlTW92ZSk7XG4gICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwibW91c2V1cFwiLCBvbk1vdXNlVXApO1xuICB9KTtcbn1cblxuY29uc3QgYWRqdXN0Rm9yV2luZG93VHlwZSA9IGFzeW5jICgpID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCB3aW4gPSBhd2FpdCBjaHJvbWUud2luZG93cy5nZXRDdXJyZW50KCk7XG4gICAgaWYgKHdpbi50eXBlID09PSBcInBvcHVwXCIpIHtcbiAgICAgICBpZiAoYnRuUGluKSBidG5QaW4uc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgICAgIC8vIEVuYWJsZSByZXNpemUgaGFuZGxlIGluIHBpbm5lZCBtb2RlIGlmIGl0IHdhcyBoaWRkZW5cbiAgICAgICBpZiAocmVzaXplSGFuZGxlKSByZXNpemVIYW5kbGUuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICAgICBkb2N1bWVudC5ib2R5LnN0eWxlLndpZHRoID0gXCIxMDAlXCI7XG4gICAgICAgZG9jdW1lbnQuYm9keS5zdHlsZS5oZWlnaHQgPSBcIjEwMCVcIjtcbiAgICB9IGVsc2Uge1xuICAgICAgICAvLyBEaXNhYmxlIHJlc2l6ZSBoYW5kbGUgaW4gZG9ja2VkIG1vZGVcbiAgICAgICAgaWYgKHJlc2l6ZUhhbmRsZSkgcmVzaXplSGFuZGxlLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICAgICAgLy8gQ2xlYXIgYW55IHByZXZpb3VzIHNpemUgb3ZlcnJpZGVzXG4gICAgICAgIGRvY3VtZW50LmJvZHkuc3R5bGUud2lkdGggPSBcIlwiO1xuICAgICAgICBkb2N1bWVudC5ib2R5LnN0eWxlLmhlaWdodCA9IFwiXCI7XG4gICAgfVxuICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3IgY2hlY2tpbmcgd2luZG93IHR5cGU6XCIsIGUpO1xuICB9XG59O1xuXG5hZGp1c3RGb3JXaW5kb3dUeXBlKCk7XG5sb2FkU3RhdGUoKS5jYXRjaChlID0+IGNvbnNvbGUuZXJyb3IoXCJMb2FkIHN0YXRlIGZhaWxlZFwiLCBlKSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBRU8sSUFBTSxlQUFlLENBQUMsUUFBNkM7QUFDeEUsTUFBSSxDQUFDLElBQUksTUFBTSxDQUFDLElBQUksU0FBVSxRQUFPO0FBQ3JDLFNBQU87QUFBQSxJQUNMLElBQUksSUFBSTtBQUFBLElBQ1IsVUFBVSxJQUFJO0FBQUEsSUFDZCxPQUFPLElBQUksU0FBUztBQUFBLElBQ3BCLEtBQUssSUFBSSxPQUFPO0FBQUEsSUFDaEIsUUFBUSxRQUFRLElBQUksTUFBTTtBQUFBLElBQzFCLGNBQWMsSUFBSTtBQUFBLElBQ2xCLGFBQWEsSUFBSSxlQUFlO0FBQUEsSUFDaEMsWUFBWSxJQUFJO0FBQUEsSUFDaEIsU0FBUyxJQUFJO0FBQUEsSUFDYixPQUFPLElBQUk7QUFBQSxJQUNYLFFBQVEsSUFBSTtBQUFBLElBQ1osUUFBUSxJQUFJO0FBQUEsSUFDWixVQUFVLElBQUk7QUFBQSxFQUNoQjtBQUNGO0FBRU8sSUFBTSx1QkFBdUIsWUFBeUM7QUFDM0UsU0FBTyxJQUFJLFFBQVEsQ0FBQyxZQUFZO0FBQzlCLFdBQU8sUUFBUSxNQUFNLElBQUksZUFBZSxDQUFDLFVBQVU7QUFDakQsY0FBUyxNQUFNLGFBQWEsS0FBcUIsSUFBSTtBQUFBLElBQ3ZELENBQUM7QUFBQSxFQUNILENBQUM7QUFDSDtBQUVPLElBQU0sVUFBVSxDQUFJLFVBQXdCO0FBQy9DLE1BQUksTUFBTSxRQUFRLEtBQUssRUFBRyxRQUFPO0FBQ2pDLFNBQU8sQ0FBQztBQUNaOzs7QUNuQk8sSUFBTSxhQUFtQztBQUFBLEVBQzVDLEVBQUUsSUFBSSxVQUFVLE9BQU8sVUFBVSxZQUFZLE1BQU0sV0FBVyxNQUFNLE1BQU0sQ0FBQyxTQUFTLE1BQU0sRUFBRTtBQUFBLEVBQzVGLEVBQUUsSUFBSSxlQUFlLE9BQU8sZUFBZSxZQUFZLE1BQU0sV0FBVyxNQUFNLE1BQU0sQ0FBQyxTQUFTLE1BQU0sRUFBRTtBQUFBLEVBQ3RHLEVBQUUsSUFBSSxTQUFTLE9BQU8sU0FBUyxZQUFZLE1BQU0sV0FBVyxNQUFNLE1BQU0sQ0FBQyxTQUFTLE1BQU0sRUFBRTtBQUFBLEVBQzFGLEVBQUUsSUFBSSxXQUFXLE9BQU8sV0FBVyxZQUFZLE1BQU0sV0FBVyxNQUFNLE1BQU0sQ0FBQyxTQUFTLE1BQU0sRUFBRTtBQUFBLEVBQzlGLEVBQUUsSUFBSSxXQUFXLE9BQU8sV0FBVyxZQUFZLE1BQU0sV0FBVyxNQUFNLE1BQU0sQ0FBQyxTQUFTLE1BQU0sRUFBRTtBQUFBLEVBQzlGLEVBQUUsSUFBSSxVQUFVLE9BQU8sVUFBVSxZQUFZLE1BQU0sV0FBVyxNQUFNLE1BQU0sQ0FBQyxTQUFTLE1BQU0sRUFBRTtBQUFBLEVBQzVGLEVBQUUsSUFBSSxXQUFXLE9BQU8sV0FBVyxZQUFZLE1BQU0sV0FBVyxNQUFNLE1BQU0sQ0FBQyxTQUFTLE1BQU0sRUFBRTtBQUFBLEVBQzlGLEVBQUUsSUFBSSxPQUFPLE9BQU8sT0FBTyxZQUFZLE1BQU0sV0FBVyxNQUFNLE1BQU0sQ0FBQyxTQUFTLE1BQU0sRUFBRTtBQUFBLEVBQ3RGLEVBQUUsSUFBSSxPQUFPLE9BQU8sT0FBTyxZQUFZLE1BQU0sV0FBVyxNQUFNLE1BQU0sQ0FBQyxTQUFTLE1BQU0sRUFBRTtBQUFBLEVBQ3RGLEVBQUUsSUFBSSxXQUFXLE9BQU8sV0FBVyxZQUFZLE1BQU0sV0FBVyxNQUFNLE1BQU0sQ0FBQyxTQUFTLE1BQU0sRUFBRTtBQUFBLEVBQzlGLEVBQUUsSUFBSSxTQUFTLE9BQU8sU0FBUyxZQUFZLE1BQU0sV0FBVyxNQUFNLE1BQU0sQ0FBQyxTQUFTLE1BQU0sRUFBRTtBQUM5RjtBQUVPLElBQU0sZ0JBQWdCLENBQUNBLHNCQUE4RDtBQUN4RixNQUFJLENBQUNBLHFCQUFvQkEsa0JBQWlCLFdBQVcsRUFBRyxRQUFPO0FBRy9ELFFBQU0sV0FBVyxDQUFDLEdBQUcsVUFBVTtBQUUvQixFQUFBQSxrQkFBaUIsUUFBUSxZQUFVO0FBQy9CLFVBQU0sZ0JBQWdCLFNBQVMsVUFBVSxPQUFLLEVBQUUsT0FBTyxPQUFPLEVBQUU7QUFHaEUsVUFBTSxjQUFlLE9BQU8saUJBQWlCLE9BQU8sY0FBYyxTQUFTLEtBQU8sT0FBTyxTQUFTLE9BQU8sTUFBTSxTQUFTLEtBQU07QUFDOUgsVUFBTSxhQUFjLE9BQU8sZ0JBQWdCLE9BQU8sYUFBYSxTQUFTLEtBQU8sT0FBTyxTQUFTLE9BQU8sTUFBTSxTQUFTLEtBQU07QUFFM0gsVUFBTSxPQUFpQixDQUFDO0FBQ3hCLFFBQUksWUFBYSxNQUFLLEtBQUssT0FBTztBQUNsQyxRQUFJLFdBQVksTUFBSyxLQUFLLE1BQU07QUFFaEMsVUFBTSxhQUFpQztBQUFBLE1BQ25DLElBQUksT0FBTztBQUFBLE1BQ1gsT0FBTyxPQUFPO0FBQUEsTUFDZCxZQUFZO0FBQUEsTUFDWixXQUFXO0FBQUEsTUFDWDtBQUFBLE1BQ0EsU0FBUyxPQUFPO0FBQUEsTUFDaEIsVUFBVTtBQUFBLElBQ2Q7QUFFQSxRQUFJLGtCQUFrQixJQUFJO0FBQ3RCLGVBQVMsYUFBYSxJQUFJO0FBQUEsSUFDOUIsT0FBTztBQUNILGVBQVMsS0FBSyxVQUFVO0FBQUEsSUFDNUI7QUFBQSxFQUNKLENBQUM7QUFFRCxTQUFPO0FBQ1g7OztBQzVEQSxJQUFNLFNBQVM7QUFFZixJQUFNLGlCQUEyQztBQUFBLEVBQy9DLE9BQU87QUFBQSxFQUNQLE1BQU07QUFBQSxFQUNOLE1BQU07QUFBQSxFQUNOLE9BQU87QUFBQSxFQUNQLFVBQVU7QUFDWjtBQUVBLElBQUksZUFBeUI7QUFDN0IsSUFBSSxPQUFtQixDQUFDO0FBQ3hCLElBQU0sV0FBVztBQUNqQixJQUFNLGNBQWM7QUFHcEIsSUFBTSxrQkFBa0IsT0FBTyxTQUFTLGVBQ2hCLE9BQVEsS0FBYSw2QkFBNkIsZUFDbEQsZ0JBQWlCLEtBQWE7QUFDdEQsSUFBSSxXQUFXO0FBQ2YsSUFBSSxjQUFjO0FBQ2xCLElBQUksWUFBa0Q7QUFFdEQsSUFBTSxTQUFTLE1BQU07QUFDakIsTUFBSSxDQUFDLG1CQUFtQixDQUFDLFFBQVEsU0FBUyxXQUFXLFVBQVU7QUFDM0Qsa0JBQWM7QUFDZDtBQUFBLEVBQ0o7QUFFQSxhQUFXO0FBQ1gsZ0JBQWM7QUFFZCxTQUFPLFFBQVEsUUFBUSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDLEVBQUUsS0FBSyxNQUFNO0FBQzNELGVBQVc7QUFDWCxRQUFJLGFBQWE7QUFDYix3QkFBa0I7QUFBQSxJQUN0QjtBQUFBLEVBQ0osQ0FBQyxFQUFFLE1BQU0sU0FBTztBQUNaLFlBQVEsTUFBTSx1QkFBdUIsR0FBRztBQUN4QyxlQUFXO0FBQUEsRUFDZixDQUFDO0FBQ0w7QUFFQSxJQUFNLG9CQUFvQixNQUFNO0FBQzVCLE1BQUksVUFBVyxjQUFhLFNBQVM7QUFDckMsY0FBWSxXQUFXLFFBQVEsR0FBSTtBQUN2QztBQUVBLElBQUk7QUFDRyxJQUFNLGNBQWMsSUFBSSxRQUFjLGFBQVc7QUFDcEQsdUJBQXFCO0FBQ3pCLENBQUM7QUFpQk0sSUFBTSx1QkFBdUIsQ0FBQyxVQUF1QjtBQUMxRCxNQUFJLE1BQU0sVUFBVTtBQUNsQixtQkFBZSxNQUFNO0FBQUEsRUFDdkIsV0FBVyxNQUFNLE9BQU87QUFDdEIsbUJBQWU7QUFBQSxFQUNqQixPQUFPO0FBQ0wsbUJBQWU7QUFBQSxFQUNqQjtBQUNGO0FBRUEsSUFBTSxZQUFZLENBQUMsVUFBNkI7QUFDOUMsU0FBTyxlQUFlLEtBQUssS0FBSyxlQUFlLFlBQVk7QUFDN0Q7QUFFQSxJQUFNLGdCQUFnQixDQUFDLFNBQWlCLFlBQXNDO0FBQzVFLFNBQU8sVUFBVSxHQUFHLE9BQU8sT0FBTyxLQUFLLFVBQVUsT0FBTyxDQUFDLEtBQUs7QUFDaEU7QUFFQSxJQUFNLFNBQVMsQ0FBQyxPQUFpQixTQUFpQixZQUFzQztBQVl0RixNQUFJLFVBQVUsS0FBSyxHQUFHO0FBQ2xCLFVBQU0sUUFBa0I7QUFBQSxNQUNwQixXQUFXLEtBQUssSUFBSTtBQUFBLE1BQ3BCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNKO0FBRUEsUUFBSSxpQkFBaUI7QUFDakIsV0FBSyxRQUFRLEtBQUs7QUFDbEIsVUFBSSxLQUFLLFNBQVMsVUFBVTtBQUN4QixhQUFLLElBQUk7QUFBQSxNQUNiO0FBQ0Esd0JBQWtCO0FBQUEsSUFDdEIsT0FBTztBQUVILFVBQUksUUFBUSxTQUFTLGFBQWE7QUFDL0IsZUFBTyxRQUFRLFlBQVksRUFBRSxNQUFNLFlBQVksU0FBUyxNQUFNLENBQUMsRUFBRSxNQUFNLE1BQU07QUFBQSxRQUU3RSxDQUFDO0FBQUEsTUFDSjtBQUFBLElBQ0o7QUFBQSxFQUNKO0FBQ0Y7QUFrQk8sSUFBTSxXQUFXLENBQUMsU0FBaUIsWUFBc0M7QUFDOUUsU0FBTyxTQUFTLFNBQVMsT0FBTztBQUNoQyxNQUFJLFVBQVUsT0FBTyxHQUFHO0FBQ3RCLFlBQVEsTUFBTSxHQUFHLE1BQU0sWUFBWSxjQUFjLFNBQVMsT0FBTyxDQUFDLEVBQUU7QUFBQSxFQUN0RTtBQUNGO0FBRU8sSUFBTSxVQUFVLENBQUMsU0FBaUIsWUFBc0M7QUFDN0UsU0FBTyxRQUFRLFNBQVMsT0FBTztBQUMvQixNQUFJLFVBQVUsTUFBTSxHQUFHO0FBQ3JCLFlBQVEsS0FBSyxHQUFHLE1BQU0sV0FBVyxjQUFjLFNBQVMsT0FBTyxDQUFDLEVBQUU7QUFBQSxFQUNwRTtBQUNGOzs7QUNwSkEsSUFBSSxtQkFBcUMsQ0FBQztBQUVuQyxJQUFNLHNCQUFzQixDQUFDLGVBQWlDO0FBQ2pFLHFCQUFtQjtBQUN2QjtBQUVPLElBQU0sc0JBQXNCLE1BQXdCO0FBSTNELElBQU0sYUFBYSxvQkFBSSxJQUFvQjtBQUVwQyxJQUFNLGdCQUFnQixDQUFDLFFBQXdCO0FBQ3BELE1BQUk7QUFDRixVQUFNLFNBQVMsSUFBSSxJQUFJLEdBQUc7QUFDMUIsV0FBTyxPQUFPLFNBQVMsUUFBUSxVQUFVLEVBQUU7QUFBQSxFQUM3QyxTQUFTLE9BQU87QUFDZCxhQUFTLDBCQUEwQixFQUFFLEtBQUssT0FBTyxPQUFPLEtBQUssRUFBRSxDQUFDO0FBQ2hFLFdBQU87QUFBQSxFQUNUO0FBQ0Y7QUFFTyxJQUFNLG1CQUFtQixDQUFDLFFBQXdCO0FBQ3JELE1BQUk7QUFDQSxVQUFNLFNBQVMsSUFBSSxJQUFJLEdBQUc7QUFDMUIsUUFBSSxXQUFXLE9BQU87QUFFdEIsZUFBVyxTQUFTLFFBQVEsVUFBVSxFQUFFO0FBRXhDLFVBQU0sUUFBUSxTQUFTLE1BQU0sR0FBRztBQUNoQyxRQUFJLE1BQU0sU0FBUyxHQUFHO0FBQ2pCLGFBQU8sTUFBTSxNQUFNLEdBQUcsTUFBTSxTQUFTLENBQUMsRUFBRSxLQUFLLEdBQUc7QUFBQSxJQUNyRDtBQUNBLFdBQU87QUFBQSxFQUNYLFFBQVE7QUFDSixXQUFPO0FBQUEsRUFDWDtBQUNKO0FBRU8sSUFBTSxnQkFBZ0IsQ0FBQyxLQUFrQixVQUF1QjtBQUNuRSxVQUFPLE9BQU87QUFBQSxJQUNWLEtBQUs7QUFBTSxhQUFPLElBQUk7QUFBQSxJQUN0QixLQUFLO0FBQVMsYUFBTyxJQUFJO0FBQUEsSUFDekIsS0FBSztBQUFZLGFBQU8sSUFBSTtBQUFBLElBQzVCLEtBQUs7QUFBVyxhQUFPLElBQUk7QUFBQSxJQUMzQixLQUFLO0FBQVMsYUFBTyxJQUFJO0FBQUEsSUFDekIsS0FBSztBQUFPLGFBQU8sSUFBSTtBQUFBLElBQ3ZCLEtBQUs7QUFBVSxhQUFPLElBQUk7QUFBQSxJQUMxQixLQUFLO0FBQVUsYUFBTyxJQUFJO0FBQUEsSUFDMUIsS0FBSztBQUFZLGFBQU8sSUFBSTtBQUFBLElBQzVCLEtBQUs7QUFBVSxhQUFPLElBQUk7QUFBQSxJQUMxQixLQUFLO0FBQWUsYUFBTyxJQUFJO0FBQUEsSUFDL0IsS0FBSztBQUFnQixhQUFPLElBQUk7QUFBQSxJQUNoQyxLQUFLO0FBQVcsYUFBTyxJQUFJO0FBQUEsSUFDM0IsS0FBSztBQUFTLGFBQU8sSUFBSSxhQUFhO0FBQUEsSUFDdEMsS0FBSztBQUFZLGFBQU8sSUFBSSxhQUFhO0FBQUE7QUFBQSxJQUV6QyxLQUFLO0FBQVUsYUFBTyxjQUFjLElBQUksR0FBRztBQUFBLElBQzNDLEtBQUs7QUFBYSxhQUFPLGlCQUFpQixJQUFJLEdBQUc7QUFBQSxJQUNqRDtBQUNJLFVBQUksTUFBTSxTQUFTLEdBQUcsR0FBRztBQUNwQixlQUFPLE1BQU0sTUFBTSxHQUFHLEVBQUUsT0FBTyxDQUFDLEtBQUssUUFBUyxPQUFPLE9BQU8sUUFBUSxZQUFZLFFBQVEsT0FBUyxJQUFZLEdBQUcsSUFBSSxRQUFXLEdBQUc7QUFBQSxNQUN2STtBQUNBLGFBQVEsSUFBWSxLQUFLO0FBQUEsRUFDakM7QUFDSjtBQUVBLElBQU0sV0FBVyxDQUFDLFdBQTJCO0FBQzNDLFNBQU8sT0FBTyxRQUFRLGdDQUFnQyxFQUFFO0FBQzFEO0FBRU8sSUFBTSxpQkFBaUIsQ0FBQyxPQUFlLFFBQXdCO0FBQ3BFLFFBQU0sTUFBTSxHQUFHLEtBQUssSUFBSSxHQUFHLEdBQUcsWUFBWTtBQUMxQyxNQUFJLElBQUksU0FBUyxLQUFLLEtBQUssSUFBSSxTQUFTLFFBQVEsS0FBSyxJQUFJLFNBQVMsT0FBTyxFQUFHLFFBQU87QUFDbkYsTUFBSSxJQUFJLFNBQVMsTUFBTSxLQUFLLElBQUksU0FBUyxPQUFPLEVBQUcsUUFBTztBQUMxRCxNQUFJLElBQUksU0FBUyxXQUFXLEtBQUssSUFBSSxTQUFTLFNBQVMsRUFBRyxRQUFPO0FBQ2pFLE1BQUksSUFBSSxTQUFTLE9BQU8sS0FBSyxJQUFJLFNBQVMsUUFBUSxFQUFHLFFBQU87QUFDNUQsTUFBSSxJQUFJLFNBQVMsT0FBTyxLQUFLLElBQUksU0FBUyxTQUFTLEVBQUcsUUFBTztBQUM3RCxTQUFPO0FBQ1Q7QUFFTyxJQUFNLGdCQUFnQixDQUFDLFFBQTZCO0FBQ3pELE1BQUksSUFBSSxnQkFBZ0IsUUFBVztBQUNqQyxXQUFPLFlBQVksSUFBSSxXQUFXO0FBQUEsRUFDcEM7QUFDQSxTQUFPLFVBQVUsSUFBSSxRQUFRO0FBQy9CO0FBRUEsSUFBTSxrQkFBa0IsQ0FBQyxpQkFBaUM7QUFDeEQsUUFBTSxNQUFNLEtBQUssSUFBSTtBQUNyQixRQUFNLE9BQU8sTUFBTTtBQUNuQixNQUFJLE9BQU8sS0FBUyxRQUFPO0FBQzNCLE1BQUksT0FBTyxNQUFVLFFBQU87QUFDNUIsTUFBSSxPQUFPLE9BQVcsUUFBTztBQUM3QixNQUFJLE9BQU8sT0FBVyxRQUFPO0FBQzdCLFNBQU87QUFDVDtBQStGQSxJQUFNLG9CQUFvQixDQUFDLFVBQWtFO0FBQ3pGLE1BQUksTUFBTSxTQUFTLEtBQUssRUFBRyxRQUFPO0FBQ2xDLE1BQUksTUFBTSxTQUFTLFVBQVUsRUFBRyxRQUFPO0FBQ3ZDLFNBQU87QUFDWDtBQTRGTyxJQUFNLGlCQUFpQixDQUFDLFdBQTBCLFFBQThCO0FBQ25GLE1BQUksQ0FBQyxVQUFXLFFBQU87QUFDdkIsUUFBTSxXQUFXLGNBQWMsS0FBSyxVQUFVLEtBQUs7QUFDbkQsUUFBTSxlQUFlLGFBQWEsVUFBYSxhQUFhLE9BQU8sT0FBTyxRQUFRLEVBQUUsWUFBWSxJQUFJO0FBQ3BHLFFBQU0sVUFBVSxVQUFVLFFBQVEsVUFBVSxNQUFNLFlBQVksSUFBSTtBQUVsRSxVQUFRLFVBQVUsVUFBVTtBQUFBLElBQ3hCLEtBQUs7QUFBWSxhQUFPLGFBQWEsU0FBUyxPQUFPO0FBQUEsSUFDckQsS0FBSztBQUFrQixhQUFPLENBQUMsYUFBYSxTQUFTLE9BQU87QUFBQSxJQUM1RCxLQUFLO0FBQVUsYUFBTyxpQkFBaUI7QUFBQSxJQUN2QyxLQUFLO0FBQWMsYUFBTyxhQUFhLFdBQVcsT0FBTztBQUFBLElBQ3pELEtBQUs7QUFBWSxhQUFPLGFBQWEsU0FBUyxPQUFPO0FBQUEsSUFDckQsS0FBSztBQUFVLGFBQU8sYUFBYTtBQUFBLElBQ25DLEtBQUs7QUFBZ0IsYUFBTyxhQUFhO0FBQUEsSUFDekMsS0FBSztBQUFVLGFBQU8sYUFBYTtBQUFBLElBQ25DLEtBQUs7QUFBYSxhQUFPLGFBQWE7QUFBQSxJQUN0QyxLQUFLO0FBQ0EsVUFBSTtBQUNELGVBQU8sSUFBSSxPQUFPLFVBQVUsT0FBTyxHQUFHLEVBQUUsS0FBSyxhQUFhLFVBQWEsYUFBYSxPQUFPLE9BQU8sUUFBUSxJQUFJLEVBQUU7QUFBQSxNQUNuSCxRQUFRO0FBQUUsZUFBTztBQUFBLE1BQU87QUFBQSxJQUM3QjtBQUFTLGFBQU87QUFBQSxFQUNwQjtBQUNKO0FBRUEsU0FBUyxvQkFBb0IsYUFBNkIsS0FBaUM7QUFFdkYsTUFBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNLFFBQVEsV0FBVyxHQUFHO0FBQzdDLFFBQUksQ0FBQyxZQUFhLFFBQU87QUFBQSxFQUU3QjtBQUVBLFFBQU0sa0JBQWtCLFFBQXNCLFdBQVc7QUFDekQsTUFBSSxnQkFBZ0IsV0FBVyxFQUFHLFFBQU87QUFFekMsTUFBSTtBQUNBLGVBQVcsUUFBUSxpQkFBaUI7QUFDaEMsVUFBSSxDQUFDLEtBQU07QUFDWCxZQUFNLFdBQVcsY0FBYyxLQUFLLEtBQUssS0FBSztBQUM5QyxVQUFJLGVBQWUsYUFBYSxVQUFhLGFBQWEsT0FBTyxPQUFPLFFBQVEsSUFBSTtBQUNwRixxQkFBZSxhQUFhLFlBQVk7QUFDeEMsWUFBTSxVQUFVLEtBQUssUUFBUSxLQUFLLE1BQU0sWUFBWSxJQUFJO0FBRXhELFVBQUksVUFBVTtBQUNkLFVBQUksV0FBbUM7QUFFdkMsY0FBUSxLQUFLLFVBQVU7QUFBQSxRQUNuQixLQUFLO0FBQVksb0JBQVUsYUFBYSxTQUFTLE9BQU87QUFBRztBQUFBLFFBQzNELEtBQUs7QUFBa0Isb0JBQVUsQ0FBQyxhQUFhLFNBQVMsT0FBTztBQUFHO0FBQUEsUUFDbEUsS0FBSztBQUFVLG9CQUFVLGlCQUFpQjtBQUFTO0FBQUEsUUFDbkQsS0FBSztBQUFjLG9CQUFVLGFBQWEsV0FBVyxPQUFPO0FBQUc7QUFBQSxRQUMvRCxLQUFLO0FBQVksb0JBQVUsYUFBYSxTQUFTLE9BQU87QUFBRztBQUFBLFFBQzNELEtBQUs7QUFBVSxvQkFBVSxhQUFhO0FBQVc7QUFBQSxRQUNqRCxLQUFLO0FBQWdCLG9CQUFVLGFBQWE7QUFBVztBQUFBLFFBQ3ZELEtBQUs7QUFBVSxvQkFBVSxhQUFhO0FBQU07QUFBQSxRQUM1QyxLQUFLO0FBQWEsb0JBQVUsYUFBYTtBQUFNO0FBQUEsUUFDL0MsS0FBSztBQUNELGNBQUk7QUFDQSxrQkFBTSxRQUFRLElBQUksT0FBTyxLQUFLLE9BQU8sR0FBRztBQUN4Qyx1QkFBVyxNQUFNLEtBQUssYUFBYSxVQUFhLGFBQWEsT0FBTyxPQUFPLFFBQVEsSUFBSSxFQUFFO0FBQ3pGLHNCQUFVLENBQUMsQ0FBQztBQUFBLFVBQ2hCLFNBQVMsR0FBRztBQUFBLFVBQUM7QUFDYjtBQUFBLE1BQ1I7QUFFQSxVQUFJLFNBQVM7QUFDVCxZQUFJLFNBQVMsS0FBSztBQUNsQixZQUFJLFVBQVU7QUFDVixtQkFBUyxJQUFJLEdBQUcsSUFBSSxTQUFTLFFBQVEsS0FBSztBQUNyQyxxQkFBUyxPQUFPLFFBQVEsSUFBSSxPQUFPLE1BQU0sQ0FBQyxJQUFJLEdBQUcsR0FBRyxTQUFTLENBQUMsS0FBSyxFQUFFO0FBQUEsVUFDMUU7QUFBQSxRQUNKO0FBQ0EsZUFBTztBQUFBLE1BQ1g7QUFBQSxJQUNKO0FBQUEsRUFDSixTQUFTLE9BQU87QUFDWixhQUFTLGlDQUFpQyxFQUFFLE9BQU8sT0FBTyxLQUFLLEVBQUUsQ0FBQztBQUFBLEVBQ3RFO0FBQ0EsU0FBTztBQUNYO0FBRU8sSUFBTSxvQkFBb0IsQ0FBQyxLQUFrQixhQUFzRztBQUN4SixRQUFNLFNBQVMsaUJBQWlCLEtBQUssT0FBSyxFQUFFLE9BQU8sUUFBUTtBQUMzRCxNQUFJLFFBQVE7QUFDUixVQUFNLG1CQUFtQixRQUF5QixPQUFPLFlBQVk7QUFDckUsVUFBTSxjQUFjLFFBQXVCLE9BQU8sT0FBTztBQUV6RCxRQUFJLFFBQVE7QUFFWixRQUFJLGlCQUFpQixTQUFTLEdBQUc7QUFFN0IsaUJBQVcsU0FBUyxrQkFBa0I7QUFDbEMsY0FBTSxhQUFhLFFBQXVCLEtBQUs7QUFDL0MsWUFBSSxXQUFXLFdBQVcsS0FBSyxXQUFXLE1BQU0sT0FBSyxlQUFlLEdBQUcsR0FBRyxDQUFDLEdBQUc7QUFDMUUsa0JBQVE7QUFDUjtBQUFBLFFBQ0o7QUFBQSxNQUNKO0FBQUEsSUFDSixXQUFXLFlBQVksU0FBUyxHQUFHO0FBRS9CLFVBQUksWUFBWSxNQUFNLE9BQUssZUFBZSxHQUFHLEdBQUcsQ0FBQyxHQUFHO0FBQ2hELGdCQUFRO0FBQUEsTUFDWjtBQUFBLElBQ0osT0FBTztBQUVILGNBQVE7QUFBQSxJQUNaO0FBRUEsUUFBSSxDQUFDLE9BQU87QUFDUixhQUFPLEVBQUUsS0FBSyxNQUFNLE1BQU0sVUFBVTtBQUFBLElBQ3hDO0FBRUEsVUFBTSxvQkFBb0IsUUFBc0IsT0FBTyxhQUFhO0FBQ3BFLFFBQUksa0JBQWtCLFNBQVMsR0FBRztBQUM5QixZQUFNLFFBQWtCLENBQUM7QUFDekIsWUFBTSxRQUFrQixDQUFDO0FBQ3pCLFVBQUk7QUFDRixtQkFBVyxRQUFRLG1CQUFtQjtBQUNsQyxjQUFJLENBQUMsS0FBTTtBQUNYLGNBQUksTUFBTTtBQUNWLGNBQUksS0FBSyxXQUFXLFNBQVM7QUFDeEIsa0JBQU0sTUFBTSxjQUFjLEtBQUssS0FBSyxLQUFLO0FBQ3pDLGtCQUFNLFFBQVEsVUFBYSxRQUFRLE9BQU8sT0FBTyxHQUFHLElBQUk7QUFBQSxVQUM3RCxPQUFPO0FBQ0Ysa0JBQU0sS0FBSztBQUFBLFVBQ2hCO0FBRUEsY0FBSSxPQUFPLEtBQUssYUFBYSxLQUFLLGNBQWMsUUFBUTtBQUNwRCxvQkFBUSxLQUFLLFdBQVc7QUFBQSxjQUNwQixLQUFLO0FBQ0Qsc0JBQU0sU0FBUyxHQUFHO0FBQ2xCO0FBQUEsY0FDSixLQUFLO0FBQ0Qsc0JBQU0sSUFBSSxZQUFZO0FBQ3RCO0FBQUEsY0FDSixLQUFLO0FBQ0Qsc0JBQU0sSUFBSSxZQUFZO0FBQ3RCO0FBQUEsY0FDSixLQUFLO0FBQ0Qsc0JBQU0sSUFBSSxPQUFPLENBQUM7QUFDbEI7QUFBQSxjQUNKLEtBQUs7QUFDRCxzQkFBTSxjQUFjLEdBQUc7QUFDdkI7QUFBQSxjQUNKLEtBQUs7QUFDRCxvQkFBSTtBQUNGLHdCQUFNLElBQUksSUFBSSxHQUFHLEVBQUU7QUFBQSxnQkFDckIsUUFBUTtBQUFBLGdCQUFtQjtBQUMzQjtBQUFBLGNBQ0osS0FBSztBQUNELG9CQUFJLEtBQUssa0JBQWtCO0FBQ3ZCLHNCQUFJO0FBQ0Esd0JBQUksUUFBUSxXQUFXLElBQUksS0FBSyxnQkFBZ0I7QUFDaEQsd0JBQUksQ0FBQyxPQUFPO0FBQ1IsOEJBQVEsSUFBSSxPQUFPLEtBQUssZ0JBQWdCO0FBQ3hDLGlDQUFXLElBQUksS0FBSyxrQkFBa0IsS0FBSztBQUFBLG9CQUMvQztBQUNBLDBCQUFNQyxTQUFRLE1BQU0sS0FBSyxHQUFHO0FBQzVCLHdCQUFJQSxRQUFPO0FBQ1AsMEJBQUksWUFBWTtBQUNoQiwrQkFBUyxJQUFJLEdBQUcsSUFBSUEsT0FBTSxRQUFRLEtBQUs7QUFDbkMscUNBQWFBLE9BQU0sQ0FBQyxLQUFLO0FBQUEsc0JBQzdCO0FBQ0EsNEJBQU07QUFBQSxvQkFDVixPQUFPO0FBQ0gsNEJBQU07QUFBQSxvQkFDVjtBQUFBLGtCQUNKLFNBQVMsR0FBRztBQUNSLDZCQUFTLDhCQUE4QixFQUFFLFNBQVMsS0FBSyxrQkFBa0IsT0FBTyxPQUFPLENBQUMsRUFBRSxDQUFDO0FBQzNGLDBCQUFNO0FBQUEsa0JBQ1Y7QUFBQSxnQkFDSixPQUFPO0FBQ0gsd0JBQU07QUFBQSxnQkFDVjtBQUNBO0FBQUEsWUFDUjtBQUFBLFVBQ0o7QUFFQSxjQUFJLEtBQUs7QUFDTCxrQkFBTSxLQUFLLEdBQUc7QUFDZCxnQkFBSSxLQUFLLFdBQVksT0FBTSxLQUFLLEtBQUssVUFBVTtBQUFBLFVBQ25EO0FBQUEsUUFDSjtBQUFBLE1BQ0YsU0FBUyxHQUFHO0FBQ1QsaUJBQVMsaUNBQWlDLEVBQUUsT0FBTyxPQUFPLENBQUMsRUFBRSxDQUFDO0FBQUEsTUFDakU7QUFFQSxVQUFJLE1BQU0sU0FBUyxHQUFHO0FBQ2xCLGVBQU8sRUFBRSxLQUFLLE1BQU0sS0FBSyxLQUFLLEdBQUcsTUFBTSxrQkFBa0IsS0FBSyxFQUFFO0FBQUEsTUFDcEU7QUFDQSxhQUFPLEVBQUUsS0FBSyxPQUFPLFlBQVksUUFBUSxNQUFNLFVBQVU7QUFBQSxJQUM3RCxXQUFXLE9BQU8sT0FBTztBQUNyQixZQUFNLFNBQVMsb0JBQW9CLFFBQXNCLE9BQU8sS0FBSyxHQUFHLEdBQUc7QUFDM0UsVUFBSSxPQUFRLFFBQU8sRUFBRSxLQUFLLFFBQVEsTUFBTSxVQUFVO0FBQUEsSUFDdEQ7QUFFQSxXQUFPLEVBQUUsS0FBSyxPQUFPLFlBQVksUUFBUSxNQUFNLFVBQVU7QUFBQSxFQUM3RDtBQUdBLE1BQUksWUFBMkI7QUFDL0IsVUFBUSxVQUFVO0FBQUEsSUFDaEIsS0FBSztBQUFBLElBQ0wsS0FBSztBQUNILGtCQUFZLGNBQWMsSUFBSSxHQUFHO0FBQ2pDO0FBQUEsSUFDRixLQUFLO0FBQ0gsa0JBQVksZUFBZSxJQUFJLE9BQU8sSUFBSSxHQUFHO0FBQzdDO0FBQUEsSUFDRixLQUFLO0FBQ0gsa0JBQVksY0FBYyxHQUFHO0FBQzdCO0FBQUEsSUFDRixLQUFLO0FBQ0gsa0JBQVksSUFBSSxXQUFXO0FBQzNCO0FBQUEsSUFDRixLQUFLO0FBQ0gsa0JBQVksSUFBSSxTQUFTLFdBQVc7QUFDcEM7QUFBQSxJQUNGLEtBQUs7QUFDSCxrQkFBWSxnQkFBZ0IsSUFBSSxnQkFBZ0IsQ0FBQztBQUNqRDtBQUFBLElBQ0YsS0FBSztBQUNILGtCQUFZLElBQUk7QUFDaEI7QUFBQSxJQUNGLEtBQUs7QUFDSCxrQkFBWSxJQUFJO0FBQ2hCO0FBQUEsSUFDRixLQUFLO0FBQ0gsa0JBQVksT0FBTyxJQUFJLGdCQUFnQixDQUFDO0FBQ3hDO0FBQUEsSUFDRixLQUFLO0FBQ0gsa0JBQVksSUFBSSxnQkFBZ0IsU0FBWSxVQUFVO0FBQ3REO0FBQUEsSUFDRjtBQUNJLFlBQU0sTUFBTSxjQUFjLEtBQUssUUFBUTtBQUN2QyxVQUFJLFFBQVEsVUFBYSxRQUFRLE1BQU07QUFDbkMsb0JBQVksT0FBTyxHQUFHO0FBQUEsTUFDMUIsT0FBTztBQUNILG9CQUFZO0FBQUEsTUFDaEI7QUFDQTtBQUFBLEVBQ047QUFDQSxTQUFPLEVBQUUsS0FBSyxXQUFXLE1BQU0sVUFBVTtBQUMzQztBQUVPLElBQU0sY0FBYyxDQUFDLEtBQWtCLGFBQXVEO0FBQ2pHLFNBQU8sa0JBQWtCLEtBQUssUUFBUSxFQUFFO0FBQzVDOzs7QUNwaEJPLElBQU0saUJBQWlCLENBQUMsUUFBc0IsSUFBSSxnQkFBZ0IsU0FBWSxJQUFJO0FBQ2xGLElBQU0sY0FBYyxDQUFDLFFBQXNCLElBQUksU0FBUyxJQUFJO0FBRTVELElBQU0sV0FBVyxDQUFDLE1BQXFCLGVBQWlEO0FBQzdGLFFBQU0sVUFBNkIsV0FBVyxTQUFTLGFBQWEsQ0FBQyxVQUFVLFNBQVM7QUFDeEYsU0FBTyxDQUFDLEdBQUcsSUFBSSxFQUFFLEtBQUssQ0FBQyxHQUFHLE1BQU07QUFDOUIsZUFBVyxZQUFZLFNBQVM7QUFDOUIsWUFBTSxPQUFPLFVBQVUsVUFBVSxHQUFHLENBQUM7QUFDckMsVUFBSSxTQUFTLEVBQUcsUUFBTztBQUFBLElBQ3pCO0FBQ0EsV0FBTyxFQUFFLEtBQUssRUFBRTtBQUFBLEVBQ2xCLENBQUM7QUFDSDtBQUVPLElBQU0sWUFBWSxDQUFDLFVBQW9DLEdBQWdCLE1BQTJCO0FBRXZHLFFBQU0sZUFBZSxvQkFBb0I7QUFDekMsUUFBTSxTQUFTLGFBQWEsS0FBSyxPQUFLLEVBQUUsT0FBTyxRQUFRO0FBQ3ZELE1BQUksUUFBUTtBQUNSLFVBQU0sZ0JBQWdCLFFBQXFCLE9BQU8sWUFBWTtBQUM5RCxRQUFJLGNBQWMsU0FBUyxHQUFHO0FBRTFCLFVBQUk7QUFDQSxtQkFBVyxRQUFRLGVBQWU7QUFDOUIsY0FBSSxDQUFDLEtBQU07QUFDWCxnQkFBTSxPQUFPLGNBQWMsR0FBRyxLQUFLLEtBQUs7QUFDeEMsZ0JBQU0sT0FBTyxjQUFjLEdBQUcsS0FBSyxLQUFLO0FBRXhDLGNBQUksU0FBUztBQUNiLGNBQUksT0FBTyxLQUFNLFVBQVM7QUFBQSxtQkFDakIsT0FBTyxLQUFNLFVBQVM7QUFFL0IsY0FBSSxXQUFXLEdBQUc7QUFDZCxtQkFBTyxLQUFLLFVBQVUsU0FBUyxDQUFDLFNBQVM7QUFBQSxVQUM3QztBQUFBLFFBQ0o7QUFBQSxNQUNKLFNBQVMsR0FBRztBQUNSLGlCQUFTLHlDQUF5QyxFQUFFLE9BQU8sT0FBTyxDQUFDLEVBQUUsQ0FBQztBQUFBLE1BQzFFO0FBRUEsYUFBTztBQUFBLElBQ1g7QUFBQSxFQUNKO0FBR0EsVUFBUSxVQUFVO0FBQUEsSUFDaEIsS0FBSztBQUNILGNBQVEsRUFBRSxnQkFBZ0IsTUFBTSxFQUFFLGdCQUFnQjtBQUFBLElBQ3BELEtBQUs7QUFDSCxhQUFPLGVBQWUsQ0FBQyxJQUFJLGVBQWUsQ0FBQztBQUFBLElBQzdDLEtBQUs7QUFDSCxhQUFPLFlBQVksQ0FBQyxJQUFJLFlBQVksQ0FBQztBQUFBLElBQ3ZDLEtBQUs7QUFDSCxhQUFPLEVBQUUsTUFBTSxjQUFjLEVBQUUsS0FBSztBQUFBLElBQ3RDLEtBQUs7QUFDSCxhQUFPLEVBQUUsSUFBSSxjQUFjLEVBQUUsR0FBRztBQUFBLElBQ2xDLEtBQUs7QUFDSCxjQUFRLEVBQUUsV0FBVyxJQUFJLGNBQWMsRUFBRSxXQUFXLEVBQUU7QUFBQSxJQUN4RCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQ0gsYUFBTyxjQUFjLEVBQUUsR0FBRyxFQUFFLGNBQWMsY0FBYyxFQUFFLEdBQUcsQ0FBQztBQUFBLElBQ2hFLEtBQUs7QUFDSCxhQUFPLGVBQWUsRUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLGNBQWMsZUFBZSxFQUFFLE9BQU8sRUFBRSxHQUFHLENBQUM7QUFBQSxJQUNwRixLQUFLO0FBQ0gsYUFBTyxjQUFjLENBQUMsRUFBRSxjQUFjLGNBQWMsQ0FBQyxDQUFDO0FBQUEsSUFDeEQsS0FBSztBQUVILGNBQVEsWUFBWSxHQUFHLEtBQUssS0FBSyxJQUFJLGNBQWMsWUFBWSxHQUFHLEtBQUssS0FBSyxFQUFFO0FBQUEsSUFDaEY7QUFFRSxZQUFNLE9BQU8sY0FBYyxHQUFHLFFBQVE7QUFDdEMsWUFBTSxPQUFPLGNBQWMsR0FBRyxRQUFRO0FBRXRDLFVBQUksU0FBUyxVQUFhLFNBQVMsUUFBVztBQUMxQyxZQUFJLE9BQU8sS0FBTSxRQUFPO0FBQ3hCLFlBQUksT0FBTyxLQUFNLFFBQU87QUFDeEIsZUFBTztBQUFBLE1BQ1g7QUFJQSxjQUFRLFlBQVksR0FBRyxRQUFRLEtBQUssSUFBSSxjQUFjLFlBQVksR0FBRyxRQUFRLEtBQUssRUFBRTtBQUFBLEVBQ3hGO0FBQ0Y7OztBQ3BGQSxJQUFNLHFCQUFrQztBQUFBLEVBQ3RDLFNBQVMsQ0FBQyxVQUFVLFNBQVM7QUFBQSxFQUM3QixPQUFPO0FBQUEsRUFDUCxPQUFPO0FBQUEsRUFDUCxjQUFjLENBQUM7QUFDakI7QUFFTyxJQUFNLGtCQUFrQixZQUFZO0FBQ3pDLE1BQUk7QUFDRixVQUFNLENBQUMsTUFBTSxRQUFRLEtBQUssSUFBSSxNQUFNLFFBQVEsSUFBSTtBQUFBLE1BQzlDLE9BQU8sS0FBSyxNQUFNLENBQUMsQ0FBQztBQUFBLE1BQ3BCLE9BQU8sVUFBVSxNQUFNLENBQUMsQ0FBQztBQUFBLE1BQ3pCLHFCQUFxQjtBQUFBLElBQ3ZCLENBQUM7QUFFRCxVQUFNQyxlQUFjLFNBQVM7QUFHN0Isd0JBQW9CQSxhQUFZLG9CQUFvQixDQUFDLENBQUM7QUFFdEQsVUFBTSxXQUFXLElBQUksSUFBSSxPQUFPLElBQUksT0FBSyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztBQUNuRCxVQUFNLFNBQVMsS0FBSyxJQUFJLFlBQVksRUFBRSxPQUFPLENBQUMsTUFBd0IsUUFBUSxDQUFDLENBQUM7QUFFaEYsVUFBTSxlQUEyQixDQUFDO0FBQ2xDLFVBQU0sZ0JBQWdCLG9CQUFJLElBQTJCO0FBQ3JELFVBQU0sd0JBQXdCLG9CQUFJLElBQTJCO0FBRTdELFdBQU8sUUFBUSxTQUFPO0FBQ2xCLFlBQU0sVUFBVSxJQUFJLFdBQVc7QUFDL0IsVUFBSSxZQUFZLElBQUk7QUFDaEIsWUFBSSxDQUFDLGNBQWMsSUFBSSxPQUFPLEVBQUcsZUFBYyxJQUFJLFNBQVMsQ0FBQyxDQUFDO0FBQzlELHNCQUFjLElBQUksT0FBTyxFQUFHLEtBQUssR0FBRztBQUFBLE1BQ3hDLE9BQU87QUFDRixZQUFJLENBQUMsc0JBQXNCLElBQUksSUFBSSxRQUFRLEVBQUcsdUJBQXNCLElBQUksSUFBSSxVQUFVLENBQUMsQ0FBQztBQUN4Riw4QkFBc0IsSUFBSSxJQUFJLFFBQVEsRUFBRyxLQUFLLEdBQUc7QUFBQSxNQUN0RDtBQUFBLElBQ0osQ0FBQztBQUdELGVBQVcsQ0FBQyxTQUFTLFNBQVMsS0FBSyxlQUFlO0FBQzlDLFlBQU0sZUFBZSxTQUFTLElBQUksT0FBTztBQUN6QyxVQUFJLGNBQWM7QUFDZCxxQkFBYSxLQUFLO0FBQUEsVUFDZCxJQUFJLFNBQVMsT0FBTztBQUFBLFVBQ3BCLFVBQVUsYUFBYTtBQUFBLFVBQ3ZCLE9BQU8sYUFBYSxTQUFTO0FBQUEsVUFDN0IsT0FBTyxhQUFhO0FBQUEsVUFDcEIsTUFBTSxTQUFTLFdBQVdBLGFBQVksT0FBTztBQUFBLFVBQzdDLFFBQVE7QUFBQSxRQUNaLENBQUM7QUFBQSxNQUNMO0FBQUEsSUFDSjtBQUdBLGVBQVcsQ0FBQyxVQUFVQyxLQUFJLEtBQUssdUJBQXVCO0FBQ2xELG1CQUFhLEtBQUs7QUFBQSxRQUNkLElBQUksYUFBYSxRQUFRO0FBQUEsUUFDekI7QUFBQSxRQUNBLE9BQU87QUFBQSxRQUNQLE9BQU87QUFBQSxRQUNQLE1BQU0sU0FBU0EsT0FBTUQsYUFBWSxPQUFPO0FBQUEsUUFDeEMsUUFBUTtBQUFBLE1BQ1osQ0FBQztBQUFBLElBQ0w7QUFFQSxZQUFRLEtBQUssZ0NBQWdDO0FBQzdDLFdBQU8sRUFBRSxJQUFJLE1BQU0sTUFBTSxFQUFFLFFBQVEsY0FBYyxhQUFBQSxhQUFZLEVBQUU7QUFBQSxFQUNqRSxTQUFTLEdBQUc7QUFDVixZQUFRLE1BQU0sNkJBQTZCLENBQUM7QUFDNUMsV0FBTyxFQUFFLElBQUksT0FBTyxPQUFPLE9BQU8sQ0FBQyxFQUFFO0FBQUEsRUFDdkM7QUFDRjs7O0FDL0RPLElBQU0sY0FBYyxPQUFjLE1BQThCLFlBQW1EO0FBQ3hILFNBQU8sSUFBSSxRQUFRLENBQUMsWUFBWTtBQUM5QixXQUFPLFFBQVEsWUFBWSxFQUFFLE1BQU0sUUFBUSxHQUFHLENBQUMsYUFBYTtBQUMxRCxVQUFJLE9BQU8sUUFBUSxXQUFXO0FBQzVCLGdCQUFRLE1BQU0sa0JBQWtCLE9BQU8sUUFBUSxTQUFTO0FBQ3hELGdCQUFRLEVBQUUsSUFBSSxPQUFPLE9BQU8sT0FBTyxRQUFRLFVBQVUsUUFBUSxDQUFDO0FBQUEsTUFDaEUsT0FBTztBQUNMLGdCQUFRLFlBQVksRUFBRSxJQUFJLE9BQU8sT0FBTyw4QkFBOEIsQ0FBQztBQUFBLE1BQ3pFO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDSCxDQUFDO0FBQ0g7QUFpQk8sSUFBTSxRQUFRO0FBQUEsRUFDbkIsUUFBUTtBQUFBLEVBQ1IsTUFBTTtBQUFBLEVBQ04sTUFBTTtBQUFBLEVBQ04sT0FBTztBQUFBLEVBQ1AsT0FBTztBQUFBLEVBQ1AsU0FBUztBQUFBLEVBQ1QsYUFBYTtBQUFBLEVBQ2IsU0FBUztBQUNYO0FBRU8sSUFBTSxlQUF1QztBQUFBLEVBQ2xELE1BQU07QUFBQSxFQUNOLE1BQU07QUFBQSxFQUNOLEtBQUs7QUFBQSxFQUNMLFFBQVE7QUFBQSxFQUNSLE9BQU87QUFBQSxFQUNQLE1BQU07QUFBQSxFQUNOLFFBQVE7QUFBQSxFQUNSLE1BQU07QUFBQSxFQUNOLFFBQVE7QUFDVjtBQUlPLElBQU0sYUFBYSxZQUFZO0FBQ3BDLE1BQUk7QUFDRixVQUFNLFdBQVcsTUFBTSxZQUE4RCxVQUFVO0FBQy9GLFFBQUksU0FBUyxNQUFNLFNBQVMsTUFBTTtBQUNoQyxhQUFPO0FBQUEsSUFDVDtBQUNBLFlBQVEsS0FBSyxzQ0FBc0MsU0FBUyxLQUFLO0FBQ2pFLFdBQU8sTUFBTSxnQkFBZ0I7QUFBQSxFQUMvQixTQUFTLEdBQUc7QUFDVixZQUFRLEtBQUssK0NBQStDLENBQUM7QUFDN0QsV0FBTyxNQUFNLGdCQUFnQjtBQUFBLEVBQy9CO0FBQ0Y7QUFFTyxJQUFNLGdCQUFnQixPQUFPLFlBQWtDO0FBQ3BFLFFBQU0sV0FBVyxNQUFNLE9BQU8sUUFBUSxZQUFZLEVBQUUsTUFBTSxpQkFBaUIsUUFBUSxDQUFDO0FBQ3BGLFNBQU87QUFDVDtBQU9PLElBQU0sYUFBYSxDQUFDLFFBQW9CLGlCQUFvRDtBQUNqRyxRQUFNLFVBQVUsb0JBQUksSUFBNEI7QUFFaEQsU0FBTyxRQUFRLENBQUMsVUFBVTtBQUN4QixVQUFNLGNBQWMsTUFBTSxXQUFXO0FBQ3JDLFVBQU0sS0FBSyxRQUFRLENBQUMsUUFBUTtBQUMxQixZQUFNLFlBQTBCO0FBQUEsUUFDOUIsR0FBRztBQUFBLFFBQ0gsWUFBWSxjQUFjLFNBQVksTUFBTTtBQUFBLFFBQzVDLFlBQVksY0FBYyxTQUFZLE1BQU07QUFBQSxRQUM1QyxRQUFRLE1BQU07QUFBQSxNQUNoQjtBQUNBLFlBQU0sV0FBVyxRQUFRLElBQUksSUFBSSxRQUFRLEtBQUssQ0FBQztBQUMvQyxlQUFTLEtBQUssU0FBUztBQUN2QixjQUFRLElBQUksSUFBSSxVQUFVLFFBQVE7QUFBQSxJQUNwQyxDQUFDO0FBQUEsRUFDSCxDQUFDO0FBRUQsU0FBTyxNQUFNLEtBQUssUUFBUSxRQUFRLENBQUMsRUFDaEMsSUFBZ0IsQ0FBQyxDQUFDLElBQUksSUFBSSxNQUFNO0FBQy9CLFVBQU0sYUFBYSxJQUFJLElBQUksS0FBSyxJQUFJLENBQUMsUUFBUSxJQUFJLFVBQVUsRUFBRSxPQUFPLENBQUMsTUFBbUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFO0FBQzlGLFVBQU0sY0FBYyxLQUFLLE9BQU8sQ0FBQyxRQUFRLElBQUksTUFBTSxFQUFFO0FBQ3JELFdBQU87QUFBQSxNQUNMO0FBQUEsTUFDQSxPQUFPLGFBQWEsSUFBSSxFQUFFLEtBQUssVUFBVSxFQUFFO0FBQUEsTUFDM0M7QUFBQSxNQUNBLFVBQVUsS0FBSztBQUFBLE1BQ2Y7QUFBQSxNQUNBO0FBQUEsSUFDRjtBQUFBLEVBQ0YsQ0FBQyxFQUNBLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxLQUFLLEVBQUUsRUFBRTtBQUMvQjs7O0FDbEdBLElBQU0sY0FBYyxTQUFTLGVBQWUsV0FBVztBQUN2RCxJQUFNLG1CQUFtQixTQUFTLGVBQWUsU0FBUztBQUUxRCxJQUFNLG9CQUFvQixTQUFTLGVBQWUsV0FBVztBQUM3RCxJQUFNLFdBQVcsU0FBUyxlQUFlLFVBQVU7QUFDbkQsSUFBTSxhQUFhLFNBQVMsZUFBZSxZQUFZO0FBQ3ZELElBQU0sV0FBVyxTQUFTLGVBQWUsVUFBVTtBQUNuRCxJQUFNLFdBQVcsU0FBUyxlQUFlLFVBQVU7QUFDbkQsSUFBTSxlQUFlLFNBQVMsZUFBZSxjQUFjO0FBQzNELElBQU0saUJBQWlCLFNBQVMsZUFBZSxnQkFBZ0I7QUFFL0QsSUFBTSx1QkFBdUIsU0FBUyxlQUFlLHNCQUFzQjtBQUMzRSxJQUFNLG9CQUFvQixTQUFTLGVBQWUsbUJBQW1CO0FBR3JFLElBQU0sV0FBVyxTQUFTLGVBQWUsVUFBVTtBQUNuRCxJQUFNLGFBQWEsU0FBUyxlQUFlLFlBQVk7QUFDdkQsSUFBTSxjQUFjLFNBQVMsZUFBZSxhQUFhO0FBRXpELElBQU0sa0JBQWtCLFNBQVMsZUFBZSxpQkFBaUI7QUFDakUsSUFBTSxlQUFlLFNBQVMsZUFBZSxjQUFjO0FBQzNELElBQU0sZ0JBQWdCLFNBQVMsZUFBZSxlQUFlO0FBRTdELElBQU0sY0FBYyxDQUFDLFNBQWlCO0FBQ2xDLE1BQUksaUJBQWlCO0FBQ2pCLGlCQUFhLGNBQWM7QUFDM0Isa0JBQWMsY0FBYztBQUM1QixvQkFBZ0IsVUFBVSxPQUFPLFFBQVE7QUFBQSxFQUM3QztBQUNKO0FBRUEsSUFBTSxjQUFjLE1BQU07QUFDdEIsTUFBSSxpQkFBaUI7QUFDakIsb0JBQWdCLFVBQVUsSUFBSSxRQUFRO0FBQUEsRUFDMUM7QUFDSjtBQUVBLElBQU0saUJBQWlCLENBQUMsV0FBbUIsVUFBa0I7QUFDekQsTUFBSSxtQkFBbUIsQ0FBQyxnQkFBZ0IsVUFBVSxTQUFTLFFBQVEsR0FBRztBQUNsRSxrQkFBYyxjQUFjLEdBQUcsU0FBUyxNQUFNLEtBQUs7QUFBQSxFQUN2RDtBQUNKO0FBRUEsSUFBSSxjQUE0QixDQUFDO0FBQ2pDLElBQUksa0JBQWlDO0FBQ3JDLElBQU0sZUFBZSxvQkFBSSxJQUFZO0FBQ3JDLElBQUksdUJBQXVCO0FBQzNCLElBQUksY0FBa0M7QUFHdEMsSUFBTSxnQkFBZ0Isb0JBQUksSUFBWTtBQUN0QyxJQUFNLGFBQWE7QUFBQSxFQUNqQixjQUFjO0FBQUEsRUFDZCxRQUFRO0FBQ1Y7QUFFQSxJQUFNLFlBQVksQ0FBQyxLQUFhLFVBQWtCO0FBRTlDLE1BQUksQ0FBQyxJQUFJLFdBQVcsR0FBRyxFQUFHLFFBQU87QUFDakMsUUFBTSxJQUFJLFNBQVMsSUFBSSxNQUFNLEdBQUcsQ0FBQyxHQUFHLEVBQUU7QUFDdEMsUUFBTSxJQUFJLFNBQVMsSUFBSSxNQUFNLEdBQUcsQ0FBQyxHQUFHLEVBQUU7QUFDdEMsUUFBTSxJQUFJLFNBQVMsSUFBSSxNQUFNLEdBQUcsQ0FBQyxHQUFHLEVBQUU7QUFDdEMsU0FBTyxRQUFRLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxLQUFLLEtBQUs7QUFDMUM7QUFFQSxJQUFNLGNBQWMsTUFBTTtBQUN4QixRQUFNLFlBQVksWUFBWSxPQUFPLENBQUMsS0FBSyxRQUFRLE1BQU0sSUFBSSxVQUFVLENBQUM7QUFDeEUsUUFBTSxjQUFjLElBQUksSUFBSSxZQUFZLFFBQVEsT0FBSyxFQUFFLEtBQUssT0FBTyxPQUFLLEVBQUUsVUFBVSxFQUFFLElBQUksT0FBSyxHQUFHLEVBQUUsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQyxFQUFFO0FBRTVILFdBQVMsY0FBYyxHQUFHLFNBQVM7QUFDbkMsYUFBVyxjQUFjLEdBQUcsV0FBVztBQUN2QyxjQUFZLGNBQWMsR0FBRyxZQUFZLE1BQU07QUFHL0MsUUFBTSxlQUFlLGFBQWEsT0FBTztBQUN6QyxhQUFXLFdBQVcsQ0FBQztBQUN2QixXQUFTLFdBQVcsQ0FBQztBQUNyQixXQUFTLFdBQVcsQ0FBQztBQUVyQixhQUFXLE1BQU0sVUFBVSxlQUFlLE1BQU07QUFDaEQsV0FBUyxNQUFNLFVBQVUsZUFBZSxNQUFNO0FBQzlDLFdBQVMsTUFBTSxVQUFVLGVBQWUsTUFBTTtBQUc5QyxNQUFJLGNBQWMsR0FBRztBQUNuQixzQkFBa0IsVUFBVTtBQUM1QixzQkFBa0IsZ0JBQWdCO0FBQUEsRUFDcEMsV0FBVyxhQUFhLFNBQVMsV0FBVztBQUMxQyxzQkFBa0IsVUFBVTtBQUM1QixzQkFBa0IsZ0JBQWdCO0FBQUEsRUFDcEMsV0FBVyxhQUFhLE9BQU8sR0FBRztBQUNoQyxzQkFBa0IsVUFBVTtBQUM1QixzQkFBa0IsZ0JBQWdCO0FBQUEsRUFDcEMsT0FBTztBQUNMLHNCQUFrQixVQUFVO0FBQzVCLHNCQUFrQixnQkFBZ0I7QUFBQSxFQUNwQztBQUNGO0FBRUEsSUFBTSxhQUFhLENBQ2YsU0FDQSxtQkFDQSxPQUNBLGFBQXNCLE9BQ3RCLGFBQ0M7QUFDRCxRQUFNLE9BQU8sU0FBUyxjQUFjLEtBQUs7QUFDekMsT0FBSyxZQUFZLGtCQUFrQixLQUFLO0FBRXhDLFFBQU0sTUFBTSxTQUFTLGNBQWMsS0FBSztBQUN4QyxNQUFJLFlBQVksWUFBWSxLQUFLO0FBR2pDLFFBQU0sU0FBUyxTQUFTLGNBQWMsS0FBSztBQUMzQyxTQUFPLFlBQVksZUFBZSxhQUFhLFlBQVksRUFBRTtBQUM3RCxNQUFJLG1CQUFtQjtBQUNuQixXQUFPLFlBQVksV0FBVztBQUM5QixXQUFPLFVBQVUsQ0FBQyxNQUFNO0FBQ3BCLFFBQUUsZ0JBQWdCO0FBQ2xCLFVBQUksU0FBVSxVQUFTO0FBQUEsSUFDM0I7QUFBQSxFQUNKLE9BQU87QUFDSCxXQUFPLFVBQVUsSUFBSSxRQUFRO0FBQUEsRUFDakM7QUFFQSxNQUFJLFlBQVksTUFBTTtBQUN0QixNQUFJLFlBQVksT0FBTztBQUV2QixPQUFLLFlBQVksR0FBRztBQUVwQixNQUFJLG1CQUFtQjtBQUNuQixzQkFBa0IsWUFBWSxpQkFBaUIsYUFBYSxhQUFhLEVBQUU7QUFDM0UsU0FBSyxZQUFZLGlCQUFpQjtBQUFBLEVBQ3RDO0FBR0EsTUFBSSxxQkFBcUIsVUFBVSxPQUFPO0FBQ3RDLFFBQUksaUJBQWlCLFNBQVMsQ0FBQyxNQUFNO0FBRWpDLFVBQUssRUFBRSxPQUF1QixRQUFRLGFBQWEsS0FBTSxFQUFFLE9BQXVCLFFBQVEsZ0JBQWdCLEVBQUc7QUFDN0csVUFBSSxTQUFVLFVBQVM7QUFBQSxJQUMzQixDQUFDO0FBQUEsRUFDTDtBQUVBLFNBQU8sRUFBRSxNQUFNLFFBQVEsa0JBQWtCO0FBQzdDO0FBRUEsSUFBTSxhQUFhLE1BQU07QUFDdkIsUUFBTSxRQUFRLFlBQVksTUFBTSxLQUFLLEVBQUUsWUFBWTtBQUNuRCxtQkFBaUIsWUFBWTtBQUc3QixRQUFNLFdBQVcsWUFDZCxJQUFJLENBQUNFLFlBQVc7QUFDZixRQUFJLENBQUMsTUFBTyxRQUFPLEVBQUUsUUFBQUEsU0FBUSxhQUFhQSxRQUFPLEtBQUs7QUFDdEQsVUFBTSxjQUFjQSxRQUFPLEtBQUs7QUFBQSxNQUM5QixDQUFDLFFBQVEsSUFBSSxNQUFNLFlBQVksRUFBRSxTQUFTLEtBQUssS0FBSyxJQUFJLElBQUksWUFBWSxFQUFFLFNBQVMsS0FBSztBQUFBLElBQzFGO0FBQ0EsV0FBTyxFQUFFLFFBQUFBLFNBQVEsWUFBWTtBQUFBLEVBQy9CLENBQUMsRUFDQSxPQUFPLENBQUMsRUFBRSxZQUFZLE1BQU0sWUFBWSxTQUFTLEtBQUssQ0FBQyxLQUFLO0FBRS9ELFdBQVMsUUFBUSxDQUFDLEVBQUUsUUFBQUEsU0FBUSxZQUFZLE1BQU07QUFDNUMsVUFBTSxZQUFZLEtBQUtBLFFBQU8sRUFBRTtBQUNoQyxVQUFNLGFBQWEsQ0FBQyxDQUFDLFNBQVMsY0FBYyxJQUFJLFNBQVM7QUFHekQsVUFBTSxZQUFZLFlBQVksSUFBSSxPQUFLLEVBQUUsRUFBRTtBQUMzQyxVQUFNLGdCQUFnQixVQUFVLE9BQU8sUUFBTSxhQUFhLElBQUksRUFBRSxDQUFDLEVBQUU7QUFDbkUsVUFBTSxRQUFRLGtCQUFrQixVQUFVLFVBQVUsVUFBVSxTQUFTO0FBQ3ZFLFVBQU0sU0FBUyxnQkFBZ0IsS0FBSyxnQkFBZ0IsVUFBVTtBQUU5RCxVQUFNLGNBQWMsU0FBUyxjQUFjLE9BQU87QUFDbEQsZ0JBQVksT0FBTztBQUNuQixnQkFBWSxZQUFZO0FBQ3hCLGdCQUFZLFVBQVU7QUFDdEIsZ0JBQVksZ0JBQWdCO0FBQzVCLGdCQUFZLFVBQVUsQ0FBQyxNQUFNO0FBQ3pCLFFBQUUsZ0JBQWdCO0FBQ2xCLFlBQU0sY0FBYyxDQUFDO0FBQ3JCLGdCQUFVLFFBQVEsUUFBTTtBQUNwQixZQUFJLFlBQWEsY0FBYSxJQUFJLEVBQUU7QUFBQSxZQUMvQixjQUFhLE9BQU8sRUFBRTtBQUFBLE1BQy9CLENBQUM7QUFDRCxpQkFBVztBQUFBLElBQ2Y7QUFHQSxVQUFNLGFBQWEsU0FBUyxjQUFjLEtBQUs7QUFDL0MsZUFBVyxNQUFNLFVBQVU7QUFDM0IsZUFBVyxNQUFNLGFBQWE7QUFDOUIsZUFBVyxNQUFNLE9BQU87QUFDeEIsZUFBVyxNQUFNLFdBQVc7QUFFNUIsVUFBTSxRQUFRLFNBQVMsY0FBYyxLQUFLO0FBQzFDLFVBQU0sWUFBWTtBQUNsQixVQUFNLGNBQWNBLFFBQU87QUFFM0IsVUFBTSxRQUFRLFNBQVMsY0FBYyxLQUFLO0FBQzFDLFVBQU0sWUFBWTtBQUNsQixVQUFNLGNBQWMsSUFBSSxZQUFZLE1BQU07QUFFMUMsZUFBVyxPQUFPLGFBQWEsT0FBTyxLQUFLO0FBRzNDLFVBQU0sb0JBQW9CLFNBQVMsY0FBYyxLQUFLO0FBR3RELFVBQU0sU0FBUyxvQkFBSSxJQUFxRDtBQUN4RSxVQUFNLGdCQUFnQyxDQUFDO0FBQ3ZDLGdCQUFZLFFBQVEsU0FBTztBQUN2QixVQUFJLElBQUksWUFBWTtBQUNoQixjQUFNLE1BQU0sSUFBSTtBQUNoQixjQUFNLFFBQVEsT0FBTyxJQUFJLEdBQUcsS0FBSyxFQUFFLE9BQU8sSUFBSSxZQUFhLE1BQU0sQ0FBQyxFQUFFO0FBQ3BFLGNBQU0sS0FBSyxLQUFLLEdBQUc7QUFDbkIsZUFBTyxJQUFJLEtBQUssS0FBSztBQUFBLE1BQ3pCLE9BQU87QUFDSCxzQkFBYyxLQUFLLEdBQUc7QUFBQSxNQUMxQjtBQUFBLElBQ0osQ0FBQztBQUVELFVBQU0sZ0JBQWdCLENBQUMsUUFBc0I7QUFDekMsWUFBTSxhQUFhLFNBQVMsY0FBYyxLQUFLO0FBQy9DLGlCQUFXLE1BQU0sVUFBVTtBQUMzQixpQkFBVyxNQUFNLGFBQWE7QUFDOUIsaUJBQVcsTUFBTSxPQUFPO0FBQ3hCLGlCQUFXLE1BQU0sV0FBVztBQUc1QixZQUFNLGNBQWMsU0FBUyxjQUFjLE9BQU87QUFDbEQsa0JBQVksT0FBTztBQUNuQixrQkFBWSxZQUFZO0FBQ3hCLGtCQUFZLFVBQVUsYUFBYSxJQUFJLElBQUksRUFBRTtBQUM3QyxrQkFBWSxVQUFVLENBQUMsTUFBTTtBQUN6QixVQUFFLGdCQUFnQjtBQUNsQixZQUFJLFlBQVksUUFBUyxjQUFhLElBQUksSUFBSSxFQUFFO0FBQUEsWUFDM0MsY0FBYSxPQUFPLElBQUksRUFBRTtBQUMvQixtQkFBVztBQUFBLE1BQ2Y7QUFFQSxZQUFNLFVBQVUsU0FBUyxjQUFjLEtBQUs7QUFDNUMsY0FBUSxZQUFZO0FBQ3BCLFVBQUksSUFBSSxZQUFZO0FBQ2hCLGNBQU0sTUFBTSxTQUFTLGNBQWMsS0FBSztBQUN4QyxZQUFJLE1BQU0sSUFBSTtBQUNkLFlBQUksVUFBVSxNQUFNO0FBQUUsa0JBQVEsWUFBWSxNQUFNO0FBQUEsUUFBYTtBQUM3RCxnQkFBUSxZQUFZLEdBQUc7QUFBQSxNQUMzQixPQUFPO0FBQ0gsZ0JBQVEsWUFBWSxNQUFNO0FBQUEsTUFDOUI7QUFFQSxZQUFNLFdBQVcsU0FBUyxjQUFjLEtBQUs7QUFDN0MsZUFBUyxZQUFZO0FBQ3JCLGVBQVMsY0FBYyxJQUFJO0FBQzNCLGVBQVMsUUFBUSxJQUFJO0FBRXJCLFlBQU0sYUFBYSxTQUFTLGNBQWMsS0FBSztBQUMvQyxpQkFBVyxZQUFZO0FBQ3ZCLFlBQU0sV0FBVyxTQUFTLGNBQWMsUUFBUTtBQUNoRCxlQUFTLFlBQVk7QUFDckIsZUFBUyxZQUFZLE1BQU07QUFDM0IsZUFBUyxRQUFRO0FBQ2pCLGVBQVMsVUFBVSxPQUFPLE1BQU07QUFDNUIsVUFBRSxnQkFBZ0I7QUFDbEIsY0FBTSxPQUFPLEtBQUssT0FBTyxJQUFJLEVBQUU7QUFDL0IsY0FBTSxVQUFVO0FBQUEsTUFDcEI7QUFDQSxpQkFBVyxZQUFZLFFBQVE7QUFFL0IsaUJBQVcsT0FBTyxhQUFhLFNBQVMsVUFBVSxVQUFVO0FBRTVELFlBQU0sRUFBRSxNQUFNLFFBQVEsSUFBSSxXQUFXLFlBQVksTUFBTSxLQUFLO0FBQzVELGNBQVEsVUFBVSxPQUFPLE1BQU07QUFFM0IsWUFBSyxFQUFFLE9BQXVCLFFBQVEsZ0JBQWdCLEVBQUc7QUFDekQsY0FBTSxPQUFPLEtBQUssT0FBTyxJQUFJLElBQUksRUFBRSxRQUFRLEtBQUssQ0FBQztBQUNqRCxjQUFNLE9BQU8sUUFBUSxPQUFPLElBQUksVUFBVSxFQUFFLFNBQVMsS0FBSyxDQUFDO0FBQUEsTUFDL0Q7QUFDQSxhQUFPO0FBQUEsSUFDWDtBQUVBLFVBQU0sS0FBSyxPQUFPLFFBQVEsQ0FBQyxFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQyxZQUFZLFNBQVMsTUFBTTtBQUNyRSxZQUFNLFdBQVcsR0FBRyxTQUFTLE1BQU0sVUFBVTtBQUM3QyxZQUFNLGtCQUFrQixDQUFDLENBQUMsU0FBUyxjQUFjLElBQUksUUFBUTtBQUc3RCxZQUFNLGNBQWMsVUFBVSxLQUFLLElBQUksT0FBSyxFQUFFLEVBQUU7QUFDaEQsWUFBTSxtQkFBbUIsWUFBWSxPQUFPLFFBQU0sYUFBYSxJQUFJLEVBQUUsQ0FBQyxFQUFFO0FBQ3hFLFlBQU0sV0FBVyxxQkFBcUIsWUFBWSxVQUFVLFlBQVksU0FBUztBQUNqRixZQUFNLFlBQVksbUJBQW1CLEtBQUssbUJBQW1CLFlBQVk7QUFFekUsWUFBTSxjQUFjLFNBQVMsY0FBYyxPQUFPO0FBQ2xELGtCQUFZLE9BQU87QUFDbkIsa0JBQVksWUFBWTtBQUN4QixrQkFBWSxVQUFVO0FBQ3RCLGtCQUFZLGdCQUFnQjtBQUM1QixrQkFBWSxVQUFVLENBQUMsTUFBTTtBQUN6QixVQUFFLGdCQUFnQjtBQUNsQixjQUFNLGNBQWMsQ0FBQztBQUNyQixvQkFBWSxRQUFRLFFBQU07QUFDdEIsY0FBSSxZQUFhLGNBQWEsSUFBSSxFQUFFO0FBQUEsY0FDL0IsY0FBYSxPQUFPLEVBQUU7QUFBQSxRQUMvQixDQUFDO0FBQ0QsbUJBQVc7QUFBQSxNQUNmO0FBR0EsWUFBTSxhQUFhLFNBQVMsY0FBYyxLQUFLO0FBQy9DLGlCQUFXLE1BQU0sVUFBVTtBQUMzQixpQkFBVyxNQUFNLGFBQWE7QUFDOUIsaUJBQVcsTUFBTSxPQUFPO0FBQ3hCLGlCQUFXLE1BQU0sV0FBVztBQUU1QixZQUFNLE9BQU8sU0FBUyxjQUFjLEtBQUs7QUFDekMsV0FBSyxZQUFZO0FBQ2pCLFdBQUssWUFBWSxXQUFXO0FBRTVCLFlBQU0sV0FBVyxTQUFTLGNBQWMsS0FBSztBQUM3QyxlQUFTLFlBQVk7QUFDckIsZUFBUyxjQUFjO0FBRXZCLFlBQU0sV0FBVyxTQUFTLGNBQWMsS0FBSztBQUM3QyxlQUFTLFlBQVk7QUFDckIsZUFBUyxjQUFjLElBQUksVUFBVSxLQUFLLE1BQU07QUFHaEQsWUFBTSxVQUFVLFNBQVMsY0FBYyxLQUFLO0FBQzVDLGNBQVEsWUFBWTtBQUNwQixZQUFNLGFBQWEsU0FBUyxjQUFjLFFBQVE7QUFDbEQsaUJBQVcsWUFBWTtBQUN2QixpQkFBVyxZQUFZLE1BQU07QUFDN0IsaUJBQVcsUUFBUTtBQUNuQixpQkFBVyxVQUFVLE9BQU8sTUFBTTtBQUM5QixVQUFFLGdCQUFnQjtBQUNsQixZQUFJLFFBQVEsV0FBVyxVQUFVLEtBQUssTUFBTSxRQUFRLEdBQUc7QUFDbkQsZ0JBQU0sT0FBTyxLQUFLLFFBQVEsVUFBVSxLQUFLLElBQUksT0FBSyxFQUFFLEVBQUUsQ0FBQztBQUN2RCxnQkFBTSxVQUFVO0FBQUEsUUFDcEI7QUFBQSxNQUNKO0FBQ0EsY0FBUSxZQUFZLFVBQVU7QUFFOUIsaUJBQVcsT0FBTyxhQUFhLE1BQU0sVUFBVSxVQUFVLE9BQU87QUFHaEUsWUFBTSxnQkFBZ0IsU0FBUyxjQUFjLEtBQUs7QUFDbEQsZ0JBQVUsS0FBSyxRQUFRLFNBQU87QUFDMUIsc0JBQWMsWUFBWSxjQUFjLEdBQUcsQ0FBQztBQUFBLE1BQ2hELENBQUM7QUFFRCxZQUFNLEVBQUUsTUFBTSxXQUFXLFFBQVEsV0FBVyxtQkFBbUIsWUFBWSxJQUFJO0FBQUEsUUFDM0U7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBLE1BQU07QUFDRixjQUFJLGNBQWMsSUFBSSxRQUFRLEVBQUcsZUFBYyxPQUFPLFFBQVE7QUFBQSxjQUN6RCxlQUFjLElBQUksUUFBUTtBQUUvQixnQkFBTSxXQUFXLGNBQWMsSUFBSSxRQUFRO0FBQzNDLG9CQUFVLFVBQVUsT0FBTyxXQUFXLFFBQVE7QUFDOUMsc0JBQWEsVUFBVSxPQUFPLFlBQVksUUFBUTtBQUFBLFFBQ3REO0FBQUEsTUFDSjtBQUdBLFVBQUksVUFBVSxPQUFPO0FBQ2pCLGNBQU0sWUFBWSxVQUFVO0FBQzVCLGNBQU0sTUFBTSxhQUFhLFNBQVMsS0FBSztBQUN2QyxZQUFJLElBQUksV0FBVyxHQUFHLEdBQUc7QUFDckIsb0JBQVUsTUFBTSxrQkFBa0IsVUFBVSxLQUFLLEdBQUc7QUFDcEQsb0JBQVUsTUFBTSxTQUFTLGFBQWEsVUFBVSxLQUFLLEdBQUcsQ0FBQztBQUFBLFFBQzdEO0FBQUEsTUFDSjtBQUVBLHdCQUFrQixZQUFZLFNBQVM7QUFBQSxJQUMzQyxDQUFDO0FBRUQsa0JBQWMsUUFBUSxTQUFPO0FBQ3pCLHdCQUFrQixZQUFZLGNBQWMsR0FBRyxDQUFDO0FBQUEsSUFDcEQsQ0FBQztBQUVELFVBQU0sRUFBRSxNQUFNLFNBQVMsUUFBUSxXQUFXLG1CQUFtQixZQUFZLElBQUk7QUFBQSxNQUN6RTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsTUFBTTtBQUNELFlBQUksY0FBYyxJQUFJLFNBQVMsRUFBRyxlQUFjLE9BQU8sU0FBUztBQUFBLFlBQzNELGVBQWMsSUFBSSxTQUFTO0FBRWhDLGNBQU0sV0FBVyxjQUFjLElBQUksU0FBUztBQUM1QyxrQkFBVSxVQUFVLE9BQU8sV0FBVyxRQUFRO0FBQzlDLG9CQUFhLFVBQVUsT0FBTyxZQUFZLFFBQVE7QUFBQSxNQUN2RDtBQUFBLElBQ0o7QUFFQSxxQkFBaUIsWUFBWSxPQUFPO0FBQUEsRUFDdEMsQ0FBQztBQUVELGNBQVk7QUFDZDtBQUdBLFNBQVMsb0JBQW9CLFlBQWtDLFlBQXNCO0FBRWpGLHVCQUFxQixZQUFZO0FBR2pDLFFBQU0sb0JBQW9CLFdBQ3JCLElBQUksUUFBTSxXQUFXLEtBQUssT0FBSyxFQUFFLE9BQU8sRUFBRSxDQUFDLEVBQzNDLE9BQU8sQ0FBQyxNQUErQixDQUFDLENBQUMsQ0FBQztBQUUvQyxvQkFBa0IsUUFBUSxjQUFZO0FBQ2xDLFVBQU0sTUFBTSxTQUFTLGNBQWMsS0FBSztBQUN4QyxRQUFJLFlBQVk7QUFDaEIsUUFBSSxRQUFRLEtBQUssU0FBUztBQUMxQixRQUFJLFlBQVk7QUFHaEIsVUFBTSxTQUFTLFNBQVMsY0FBYyxLQUFLO0FBQzNDLFdBQU8sWUFBWTtBQUNuQixXQUFPLFlBQVk7QUFHbkIsVUFBTSxRQUFRLFNBQVMsY0FBYyxNQUFNO0FBQzNDLFVBQU0sWUFBWTtBQUNsQixVQUFNLGNBQWMsU0FBUztBQUc3QixRQUFJLFdBQVc7QUFDZixRQUFJLFNBQVMsTUFBTTtBQUNkLGVBQVMsS0FBSyxRQUFRLFNBQU87QUFDMUIsb0JBQVksd0JBQXdCLEdBQUcsS0FBSyxHQUFHO0FBQUEsTUFDbkQsQ0FBQztBQUFBLElBQ0w7QUFFQSxVQUFNLGlCQUFpQixTQUFTLGNBQWMsS0FBSztBQUNuRCxtQkFBZSxNQUFNLE9BQU87QUFDNUIsbUJBQWUsTUFBTSxVQUFVO0FBQy9CLG1CQUFlLE1BQU0sYUFBYTtBQUNsQyxtQkFBZSxZQUFZLEtBQUs7QUFDaEMsUUFBSSxVQUFVO0FBQ1QsWUFBTSxnQkFBZ0IsU0FBUyxjQUFjLE1BQU07QUFDbkQsb0JBQWMsWUFBWTtBQUMxQixxQkFBZSxZQUFZLGFBQWE7QUFBQSxJQUM3QztBQUdBLFVBQU0sWUFBWSxTQUFTLGNBQWMsUUFBUTtBQUNqRCxjQUFVLFlBQVk7QUFDdEIsY0FBVSxZQUFZLE1BQU07QUFDNUIsY0FBVSxRQUFRO0FBQ2xCLGNBQVUsVUFBVSxPQUFPLE1BQU07QUFDNUIsUUFBRSxnQkFBZ0I7QUFDbEIsWUFBTSxlQUFlLFNBQVMsSUFBSSxLQUFLO0FBQUEsSUFDNUM7QUFFQSxRQUFJLFlBQVksTUFBTTtBQUN0QixRQUFJLFlBQVksY0FBYztBQUU5QixRQUFJLFNBQVMsVUFBVTtBQUNsQixZQUFNLGFBQWEsU0FBUyxjQUFjLFFBQVE7QUFDbEQsaUJBQVcsWUFBWSx1QkFBdUIsU0FBUyxVQUFVLFdBQVcsRUFBRTtBQUM5RSxpQkFBVyxZQUFZLE1BQU07QUFDN0IsaUJBQVcsUUFBUSxhQUFhLFNBQVMsVUFBVSxPQUFPLEtBQUs7QUFDL0QsaUJBQVcsTUFBTSxVQUFVLFNBQVMsVUFBVSxNQUFNO0FBQ3BELGlCQUFXLFVBQVUsT0FBTyxNQUFNO0FBQzlCLFVBQUUsZ0JBQWdCO0FBQ2xCLFlBQUksQ0FBQyxhQUFhLGlCQUFrQjtBQUNwQyxjQUFNLG1CQUFtQixZQUFZLGlCQUFpQixVQUFVLE9BQUssRUFBRSxPQUFPLFNBQVMsRUFBRTtBQUN6RixZQUFJLHFCQUFxQixJQUFJO0FBQzFCLGdCQUFNLFFBQVEsWUFBWSxpQkFBaUIsZ0JBQWdCO0FBQzNELGdCQUFNLFVBQVUsQ0FBQyxNQUFNO0FBQ3ZCLGdCQUFNLFdBQVcsQ0FBQyxDQUFDLE1BQU07QUFDekIscUJBQVcsVUFBVSxPQUFPLFVBQVUsUUFBUTtBQUM5QyxxQkFBVyxNQUFNLFVBQVUsV0FBVyxNQUFNO0FBQzVDLHFCQUFXLFFBQVEsYUFBYSxXQUFXLE9BQU8sS0FBSztBQUN2RCxnQkFBTSxZQUFZLG1CQUFtQixFQUFFLGtCQUFrQixZQUFZLGlCQUFpQixDQUFDO0FBQUEsUUFDM0Y7QUFBQSxNQUNIO0FBQ0EsVUFBSSxZQUFZLFVBQVU7QUFBQSxJQUMvQjtBQUVBLFFBQUksWUFBWSxTQUFTO0FBRXpCLG9CQUFnQixHQUFHO0FBQ25CLHlCQUFxQixZQUFZLEdBQUc7QUFBQSxFQUN4QyxDQUFDO0FBR0Qsb0JBQWtCLFlBQVk7QUFFOUIsUUFBTSxxQkFBcUIsV0FBVyxPQUFPLE9BQUssQ0FBQyxXQUFXLFNBQVMsRUFBRSxFQUFFLENBQUM7QUFDNUUscUJBQW1CLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxNQUFNLGNBQWMsRUFBRSxLQUFLLENBQUM7QUFHaEUsUUFBTSx1QkFBNkMsQ0FBQztBQUNwRCxRQUFNLHNCQUE0QyxDQUFDO0FBRW5ELHFCQUFtQixRQUFRLE9BQUs7QUFDNUIsUUFBSSxFQUFFLFlBQVksRUFBRSxTQUFTO0FBQ3pCLDJCQUFxQixLQUFLLENBQUM7QUFBQSxJQUMvQixPQUFPO0FBQ0gsMEJBQW9CLEtBQUssQ0FBQztBQUFBLElBQzlCO0FBQUEsRUFDSixDQUFDO0FBS0QsR0FBQyxHQUFHLHNCQUFzQixHQUFHLG1CQUFtQixFQUFFLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxNQUFNLGNBQWMsRUFBRSxLQUFLLENBQUMsRUFBRSxRQUFRLGNBQVk7QUFDakgsVUFBTSxTQUFTLFNBQVMsY0FBYyxRQUFRO0FBQzlDLFdBQU8sUUFBUSxTQUFTO0FBQ3hCLFdBQU8sY0FBYyxTQUFTO0FBQzlCLHNCQUFrQixZQUFZLE1BQU07QUFBQSxFQUN4QyxDQUFDO0FBR0QsTUFBSSxZQUFZLFNBQVMsZUFBZSw2QkFBNkI7QUFDckUsTUFBSSxxQkFBcUIsU0FBUyxHQUFHO0FBQ2pDLFFBQUksQ0FBQyxXQUFXO0FBQ1osa0JBQVksU0FBUyxjQUFjLEtBQUs7QUFDeEMsZ0JBQVUsS0FBSztBQUNmLGdCQUFVLFlBQVk7QUFFdEIsZ0JBQVUsTUFBTSxZQUFZO0FBQzVCLGdCQUFVLE1BQU0sWUFBWTtBQUM1QixnQkFBVSxNQUFNLGFBQWE7QUFFN0IsWUFBTSxTQUFTLFNBQVMsY0FBYyxLQUFLO0FBQzNDLGFBQU8sWUFBWTtBQUNuQixhQUFPLGNBQWM7QUFDckIsYUFBTyxRQUFRO0FBQ2YsZ0JBQVUsWUFBWSxNQUFNO0FBRTVCLFlBQU1DLFFBQU8sU0FBUyxjQUFjLEtBQUs7QUFDekMsTUFBQUEsTUFBSyxZQUFZO0FBQ2pCLGdCQUFVLFlBQVlBLEtBQUk7QUFHMUIsMkJBQXFCLGVBQWUsTUFBTSxTQUFTO0FBQUEsSUFDdkQ7QUFFQSxVQUFNLE9BQU8sVUFBVSxjQUFjLGdCQUFnQjtBQUNyRCxTQUFLLFlBQVk7QUFFakIseUJBQXFCLFFBQVEsY0FBWTtBQUNyQyxZQUFNLE1BQU0sU0FBUyxjQUFjLEtBQUs7QUFDeEMsVUFBSSxZQUFZO0FBQ2hCLFVBQUksUUFBUSxLQUFLLFNBQVM7QUFFMUIsWUFBTSxRQUFRLFNBQVMsY0FBYyxNQUFNO0FBQzNDLFlBQU0sWUFBWTtBQUNsQixZQUFNLGNBQWMsU0FBUztBQUM3QixZQUFNLE1BQU0sVUFBVTtBQUV0QixZQUFNLGFBQWEsU0FBUyxjQUFjLFFBQVE7QUFDbEQsaUJBQVcsWUFBWTtBQUN2QixpQkFBVyxZQUFZLE1BQU07QUFDN0IsaUJBQVcsUUFBUTtBQUNuQixpQkFBVyxNQUFNLGFBQWE7QUFDOUIsaUJBQVcsVUFBVSxPQUFPLE1BQU07QUFDN0IsVUFBRSxnQkFBZ0I7QUFDbEIsWUFBSSxDQUFDLGFBQWEsaUJBQWtCO0FBQ3BDLGNBQU0sbUJBQW1CLFlBQVksaUJBQWlCLFVBQVUsT0FBSyxFQUFFLE9BQU8sU0FBUyxFQUFFO0FBQ3pGLFlBQUkscUJBQXFCLElBQUk7QUFDMUIsZ0JBQU0sUUFBUSxZQUFZLGlCQUFpQixnQkFBZ0I7QUFDM0QsZ0JBQU0sVUFBVTtBQUNoQixnQkFBTSxZQUFZLG1CQUFtQixFQUFFLGtCQUFrQixZQUFZLGlCQUFpQixDQUFDO0FBR3ZGLDhCQUFvQixZQUFZLFVBQVU7QUFBQSxRQUM5QztBQUFBLE1BQ0o7QUFFQSxVQUFJLFlBQVksS0FBSztBQUNyQixVQUFJLFlBQVksVUFBVTtBQUMxQixXQUFLLFlBQVksR0FBRztBQUFBLElBQ3hCLENBQUM7QUFBQSxFQUNMLE9BQU87QUFDSCxRQUFJLFVBQVcsV0FBVSxPQUFPO0FBQUEsRUFDcEM7QUFDSjtBQUVBLGVBQWUsZUFBZSxJQUFZLFFBQWlCO0FBQ3ZELE1BQUksQ0FBQyxZQUFhO0FBRWxCLFFBQU0sZ0JBQWdCLGNBQWMsWUFBWSxnQkFBZ0I7QUFDaEUsUUFBTSxXQUFXLElBQUksSUFBSSxjQUFjLElBQUksT0FBSyxFQUFFLEVBQUUsQ0FBQztBQUdyRCxNQUFJLFdBQVcsWUFBWSxXQUFXLENBQUMsR0FBRyxPQUFPLFNBQU8sU0FBUyxJQUFJLEdBQUcsQ0FBQztBQUV6RSxNQUFJLFFBQVE7QUFDUixRQUFJLENBQUMsUUFBUSxTQUFTLEVBQUUsR0FBRztBQUN2QixjQUFRLEtBQUssRUFBRTtBQUFBLElBQ25CO0FBQUEsRUFDSixPQUFPO0FBQ0gsY0FBVSxRQUFRLE9BQU8sU0FBTyxRQUFRLEVBQUU7QUFBQSxFQUM5QztBQUVBLGNBQVksVUFBVTtBQUN0QixRQUFNLFlBQVksbUJBQW1CLEVBQUUsU0FBUyxRQUFRLENBQUM7QUFHekQsc0JBQW9CLGVBQWUsT0FBTztBQUM5QztBQUVBLFNBQVMsZ0JBQWdCLEtBQWtCO0FBQ3pDLE1BQUksaUJBQWlCLGFBQWEsQ0FBQyxNQUFNO0FBQ3ZDLFFBQUksVUFBVSxJQUFJLFVBQVU7QUFDNUIsUUFBSSxFQUFFLGNBQWM7QUFDaEIsUUFBRSxhQUFhLGdCQUFnQjtBQUFBLElBQ25DO0FBQUEsRUFDRixDQUFDO0FBRUQsTUFBSSxpQkFBaUIsV0FBVyxZQUFZO0FBQzFDLFFBQUksVUFBVSxPQUFPLFVBQVU7QUFFL0IsUUFBSSxhQUFhO0FBQ2IsWUFBTSxpQkFBaUIsbUJBQW1CO0FBRTFDLFlBQU0sYUFBYSxZQUFZLFdBQVcsQ0FBQztBQUMzQyxVQUFJLEtBQUssVUFBVSxjQUFjLE1BQU0sS0FBSyxVQUFVLFVBQVUsR0FBRztBQUMvRCxvQkFBWSxVQUFVO0FBQ3RCLGNBQU0sWUFBWSxtQkFBbUIsRUFBRSxTQUFTLGVBQWUsQ0FBQztBQUFBLE1BQ3BFO0FBQUEsSUFDSjtBQUFBLEVBQ0YsQ0FBQztBQUNIO0FBRUEsU0FBUyxrQkFBa0IsV0FBd0I7QUFDL0MsWUFBVSxpQkFBaUIsWUFBWSxDQUFDLE1BQU07QUFDMUMsTUFBRSxlQUFlO0FBQ2pCLFVBQU0sZUFBZSxvQkFBb0IsV0FBVyxFQUFFLE9BQU87QUFDN0QsVUFBTSxlQUFlLFNBQVMsY0FBYyx3QkFBd0I7QUFDcEUsUUFBSSxnQkFBZ0IsYUFBYSxrQkFBa0IsV0FBVztBQUN6RCxVQUFJLGdCQUFnQixNQUFNO0FBQ3ZCLGtCQUFVLFlBQVksWUFBWTtBQUFBLE1BQ3JDLE9BQU87QUFDSixrQkFBVSxhQUFhLGNBQWMsWUFBWTtBQUFBLE1BQ3BEO0FBQUEsSUFDTDtBQUFBLEVBQ0osQ0FBQztBQUNMO0FBRUEsa0JBQWtCLG9CQUFvQjtBQUV0QyxTQUFTLG9CQUFvQixXQUF3QixHQUFXO0FBQzlELFFBQU0sb0JBQW9CLE1BQU0sS0FBSyxVQUFVLGlCQUFpQiw4QkFBOEIsQ0FBQztBQUUvRixTQUFPLGtCQUFrQixPQUFPLENBQUMsU0FBUyxVQUFVO0FBQ2xELFVBQU0sTUFBTSxNQUFNLHNCQUFzQjtBQUN4QyxVQUFNLFNBQVMsSUFBSSxJQUFJLE1BQU0sSUFBSSxTQUFTO0FBQzFDLFFBQUksU0FBUyxLQUFLLFNBQVMsUUFBUSxRQUFRO0FBQ3pDLGFBQU8sRUFBRSxRQUFnQixTQUFTLE1BQU07QUFBQSxJQUMxQyxPQUFPO0FBQ0wsYUFBTztBQUFBLElBQ1Q7QUFBQSxFQUNGLEdBQUcsRUFBRSxRQUFRLE9BQU8sbUJBQW1CLFNBQVMsS0FBdUIsQ0FBQyxFQUFFO0FBQzVFO0FBRUEsSUFBTSxXQUFXLENBQ2YsV0FDQSxlQUNBLGVBQ0EsZ0JBQWdCLFVBQ2I7QUFDRCxnQkFBYyxVQUFVO0FBRXhCLE1BQUksYUFBYTtBQUNmLFVBQU0sSUFBSSxZQUFZLFdBQVcsQ0FBQztBQUdsQyx5QkFBcUIsV0FBVztBQUVoQyxVQUFNLGdCQUFnQixjQUFjLFlBQVksZ0JBQWdCO0FBR2hFLHdCQUFvQixlQUFlLENBQUM7QUFHcEMsUUFBSSxZQUFZLE9BQU87QUFDckIsaUJBQVcsWUFBWSxPQUFPLEtBQUs7QUFBQSxJQUNyQztBQUdBLFFBQUksWUFBWSxVQUFVO0FBQ3RCLFlBQU0sU0FBUyxTQUFTLGVBQWUsZ0JBQWdCO0FBQ3ZELFVBQUksT0FBUSxRQUFPLFFBQVEsWUFBWTtBQUFBLElBQzNDO0FBQUEsRUFDRjtBQUVBLE1BQUksZUFBZTtBQUNqQixzQkFBa0IsY0FBYyxNQUFNO0FBQUEsRUFDeEMsT0FBTztBQUNMLHNCQUFrQjtBQUNsQixZQUFRLEtBQUssOEJBQThCO0FBQUEsRUFDN0M7QUFFQSxRQUFNLGVBQWUsb0JBQUksSUFBb0I7QUFFN0MsZ0JBQWMsUUFBUSxDQUFDLFFBQVE7QUFDN0IsUUFBSSxDQUFDLElBQUksR0FBSTtBQUNiLFVBQU0saUJBQWlCLElBQUksTUFBTSxLQUFLLENBQUMsUUFBUSxJQUFJLE1BQU0sR0FBRztBQUM1RCxVQUFNLFFBQVEsa0JBQWtCLFVBQVUsSUFBSSxFQUFFO0FBQ2hELGlCQUFhLElBQUksSUFBSSxJQUFJLEtBQUs7QUFBQSxFQUNoQyxDQUFDO0FBRUQsZ0JBQWMsV0FBVyxVQUFVLFFBQVEsWUFBWTtBQUV2RCxNQUFJLG9CQUFvQixNQUFNO0FBQzFCLGdCQUFZLEtBQUssQ0FBQyxHQUFHLE1BQU07QUFDdkIsVUFBSSxFQUFFLE9BQU8sZ0JBQWlCLFFBQU87QUFDckMsVUFBSSxFQUFFLE9BQU8sZ0JBQWlCLFFBQU87QUFDckMsYUFBTztBQUFBLElBQ1gsQ0FBQztBQUFBLEVBQ0w7QUFFQSxNQUFJLENBQUMsd0JBQXdCLG9CQUFvQixNQUFNO0FBQ25ELFVBQU0sZUFBZSxZQUFZLEtBQUssT0FBSyxFQUFFLE9BQU8sZUFBZTtBQUNuRSxRQUFJLGNBQWM7QUFDYixvQkFBYyxJQUFJLEtBQUssYUFBYSxFQUFFLEVBQUU7QUFDeEMsbUJBQWEsS0FBSyxRQUFRLE9BQUssYUFBYSxJQUFJLEVBQUUsRUFBRSxDQUFDO0FBRXJELFVBQUksQ0FBQyxlQUFlO0FBQ2hCLCtCQUF1QjtBQUFBLE1BQzNCO0FBQUEsSUFDTDtBQUFBLEVBQ0o7QUFFQSxhQUFXO0FBQ2Y7QUFFQSxJQUFNLFlBQVksWUFBWTtBQUM1QixVQUFRLHFCQUFxQjtBQUU3QixNQUFJLGFBQWE7QUFFakIsUUFBTSxXQUFXLFlBQVk7QUFDM0IsUUFBSTtBQUNBLFlBQU0sQ0FBQyxVQUFVLElBQUksRUFBRSxJQUFJLE1BQU0sUUFBUSxJQUFJO0FBQUEsUUFDekMsZ0JBQWdCO0FBQUEsUUFDaEIsT0FBTyxRQUFRLFdBQVcsRUFBRSxNQUFNLE1BQU0sTUFBUztBQUFBLFFBQ2pELE9BQU8sUUFBUSxPQUFPLEVBQUUsYUFBYSxDQUFDLFFBQVEsR0FBRyxVQUFVLEtBQUssQ0FBQyxFQUFFLE1BQU0sTUFBTSxDQUFDLENBQUM7QUFBQSxNQUNyRixDQUFDO0FBR0QsVUFBSSxDQUFDLGNBQWMsU0FBUyxNQUFNLFNBQVMsTUFBTTtBQUM1QyxpQkFBUyxTQUFTLE1BQU0sSUFBSSxJQUErQixJQUFJO0FBQUEsTUFDcEU7QUFBQSxJQUNKLFNBQVMsR0FBRztBQUNSLGNBQVEsS0FBSyxvQkFBb0IsQ0FBQztBQUFBLElBQ3RDO0FBQUEsRUFDRjtBQUVBLFFBQU0sU0FBUyxZQUFZO0FBQ3pCLFFBQUk7QUFDQSxZQUFNLENBQUMsT0FBTyxJQUFJLEVBQUUsSUFBSSxNQUFNLFFBQVEsSUFBSTtBQUFBLFFBQ3RDLFdBQVc7QUFBQSxRQUNYLE9BQU8sUUFBUSxXQUFXLEVBQUUsTUFBTSxNQUFNLE1BQVM7QUFBQSxRQUNqRCxPQUFPLFFBQVEsT0FBTyxFQUFFLGFBQWEsQ0FBQyxRQUFRLEdBQUcsVUFBVSxLQUFLLENBQUMsRUFBRSxNQUFNLE1BQU0sQ0FBQyxDQUFDO0FBQUEsTUFDckYsQ0FBQztBQUVELG1CQUFhO0FBRWIsVUFBSSxNQUFNLE1BQU0sTUFBTSxNQUFNO0FBQ3ZCLGlCQUFTLE1BQU0sTUFBTSxJQUFJLEVBQTZCO0FBQUEsTUFDM0QsT0FBTztBQUNILGdCQUFRLE1BQU0seUJBQXlCLE1BQU0sU0FBUyxlQUFlO0FBQ3JFLFlBQUksWUFBWSxXQUFXLEdBQUc7QUFDMUIsMkJBQWlCLFlBQVk7QUFBQSwyQ0FDRixNQUFNLFNBQVMsZUFBZTtBQUFBO0FBQUE7QUFBQSxRQUc3RDtBQUFBLE1BQ0o7QUFBQSxJQUNKLFNBQVMsR0FBRztBQUNSLGNBQVEsTUFBTSx3QkFBd0IsQ0FBQztBQUFBLElBQzNDO0FBQUEsRUFDRjtBQUdBLFFBQU0sUUFBUSxJQUFJLENBQUMsU0FBUyxHQUFHLE9BQU8sQ0FBQyxDQUFDO0FBQzFDO0FBRUEsSUFBTSxxQkFBcUIsTUFBeUI7QUFFaEQsU0FBTyxNQUFNLEtBQUsscUJBQXFCLFFBQVEsRUFDMUMsSUFBSSxTQUFRLElBQW9CLFFBQVEsRUFBcUI7QUFDdEU7QUFHQSxrQkFBa0IsaUJBQWlCLFVBQVUsT0FBTyxNQUFNO0FBQ3RELFFBQU0sU0FBUyxFQUFFO0FBQ2pCLFFBQU0sS0FBSyxPQUFPO0FBQ2xCLE1BQUksSUFBSTtBQUNKLFVBQU0sZUFBZSxJQUFJLElBQUk7QUFDN0IsV0FBTyxRQUFRO0FBQUEsRUFDbkI7QUFDSixDQUFDO0FBRUQsSUFBTSxlQUFlLE9BQU8sY0FBa0M7QUFDMUQsVUFBUSx1QkFBdUIsRUFBRSxVQUFVLENBQUM7QUFDNUMsY0FBWSxzQkFBc0I7QUFDbEMsTUFBSTtBQUNBLFVBQU0sVUFBVSxtQkFBbUI7QUFDbkMsVUFBTSxjQUFjLEVBQUUsV0FBVyxRQUFRLENBQUM7QUFDMUMsVUFBTSxVQUFVO0FBQUEsRUFDcEIsVUFBRTtBQUNFLGdCQUFZO0FBQUEsRUFDaEI7QUFDSjtBQUVBLE9BQU8sUUFBUSxVQUFVLFlBQVksQ0FBQyxZQUFZO0FBQzlDLE1BQUksUUFBUSxTQUFTLG9CQUFvQjtBQUNyQyxVQUFNLEVBQUUsV0FBVyxNQUFNLElBQUksUUFBUTtBQUNyQyxtQkFBZSxXQUFXLEtBQUs7QUFBQSxFQUNuQztBQUNKLENBQUM7QUFHRCxrQkFBa0IsaUJBQWlCLFVBQVUsQ0FBQyxNQUFNO0FBQ2hELFFBQU0sY0FBZSxFQUFFLE9BQTRCO0FBQ25ELE1BQUksYUFBYTtBQUViLGdCQUFZLFFBQVEsU0FBTztBQUN2QixVQUFJLEtBQUssUUFBUSxTQUFPLGFBQWEsSUFBSSxJQUFJLEVBQUUsQ0FBQztBQUFBLElBQ3BELENBQUM7QUFBQSxFQUNMLE9BQU87QUFFSCxpQkFBYSxNQUFNO0FBQUEsRUFDdkI7QUFDQSxhQUFXO0FBQ2YsQ0FBQztBQUVELFVBQVUsaUJBQWlCLFNBQVMsTUFBTTtBQUN0QyxVQUFRLHdCQUF3QixFQUFFLGVBQWUsYUFBYSxLQUFLLENBQUM7QUFDcEUsZUFBYSxFQUFFLFFBQVEsTUFBTSxLQUFLLFlBQVksRUFBRSxDQUFDO0FBQ3JELENBQUM7QUFFRCxXQUFXLGlCQUFpQixTQUFTLFlBQVk7QUFDL0MsTUFBSSxRQUFRLFdBQVcsYUFBYSxJQUFJLFFBQVEsR0FBRztBQUMvQyxZQUFRLG1CQUFtQixFQUFFLE9BQU8sYUFBYSxLQUFLLENBQUM7QUFDdkQsVUFBTSxPQUFPLEtBQUssUUFBUSxNQUFNLEtBQUssWUFBWSxDQUFDO0FBQ2xELFVBQU0sVUFBVTtBQUFBLEVBQ3BCO0FBQ0YsQ0FBQztBQUNELFNBQVMsaUJBQWlCLFNBQVMsWUFBWTtBQUM3QyxNQUFJLFFBQVEsU0FBUyxhQUFhLElBQUksdUJBQXVCLEdBQUc7QUFDNUQsWUFBUSxnQkFBZ0IsRUFBRSxPQUFPLGFBQWEsS0FBSyxDQUFDO0FBQ3BELFVBQU0sTUFBTSxNQUFNLFlBQVksa0JBQWtCLEVBQUUsUUFBUSxNQUFNLEtBQUssWUFBWSxFQUFFLENBQUM7QUFDcEYsUUFBSSxDQUFDLElBQUksR0FBSSxPQUFNLG1CQUFtQixJQUFJLEtBQUs7QUFBQSxRQUMxQyxPQUFNLFVBQVU7QUFBQSxFQUN6QjtBQUNGLENBQUM7QUFDRCxTQUFTLGlCQUFpQixTQUFTLFlBQVk7QUFDN0MsTUFBSSxRQUFRLFNBQVMsYUFBYSxJQUFJLDBCQUEwQixHQUFHO0FBQy9ELFlBQVEsa0JBQWtCLEVBQUUsT0FBTyxhQUFhLEtBQUssQ0FBQztBQUN0RCxVQUFNLE1BQU0sTUFBTSxZQUFZLGtCQUFrQixFQUFFLFFBQVEsTUFBTSxLQUFLLFlBQVksRUFBRSxDQUFDO0FBQ3BGLFFBQUksQ0FBQyxJQUFJLEdBQUksT0FBTSxtQkFBbUIsSUFBSSxLQUFLO0FBQUEsUUFDMUMsT0FBTSxVQUFVO0FBQUEsRUFDekI7QUFDRixDQUFDO0FBRUQsY0FBYyxpQkFBaUIsU0FBUyxNQUFNO0FBQzFDLGNBQVksUUFBUSxTQUFPO0FBQ3ZCLGtCQUFjLElBQUksS0FBSyxJQUFJLEVBQUUsRUFBRTtBQUMvQixRQUFJLEtBQUssUUFBUSxTQUFPO0FBQ3BCLFVBQUksSUFBSSxZQUFZO0FBQ2Ysc0JBQWMsSUFBSSxLQUFLLElBQUksRUFBRSxNQUFNLElBQUksVUFBVSxFQUFFO0FBQUEsTUFDeEQ7QUFBQSxJQUNKLENBQUM7QUFBQSxFQUNMLENBQUM7QUFDRCxhQUFXO0FBQ2YsQ0FBQztBQUVELGdCQUFnQixpQkFBaUIsU0FBUyxNQUFNO0FBQzVDLGdCQUFjLE1BQU07QUFDcEIsYUFBVztBQUNmLENBQUM7QUFHRCxTQUFTLGVBQWUsU0FBUyxHQUFHLGlCQUFpQixTQUFTLFlBQVk7QUFDeEUsVUFBUSxjQUFjO0FBQ3RCLFFBQU0sTUFBTSxNQUFNLFlBQVksTUFBTTtBQUNwQyxNQUFJLENBQUMsSUFBSSxHQUFJLE9BQU0sa0JBQWtCLElBQUksS0FBSztBQUNoRCxDQUFDO0FBRUQsU0FBUyxlQUFlLGNBQWMsR0FBRyxpQkFBaUIsU0FBUyxZQUFZO0FBQzdFLFFBQU0sT0FBTyxPQUFPLDhCQUE4QjtBQUNsRCxNQUFJLE1BQU07QUFDUixZQUFRLGdCQUFnQixFQUFFLEtBQUssQ0FBQztBQUNoQyxVQUFNLE1BQU0sTUFBTSxZQUFZLGFBQWEsRUFBRSxLQUFLLENBQUM7QUFDbkQsUUFBSSxDQUFDLElBQUksR0FBSSxPQUFNLGtCQUFrQixJQUFJLEtBQUs7QUFBQSxFQUNoRDtBQUNGLENBQUM7QUFFRCxJQUFNLGtCQUFrQixTQUFTLGVBQWUsaUJBQWlCO0FBQ2pFLElBQU0saUJBQWlCLFNBQVMsZUFBZSxnQkFBZ0I7QUFFL0QsU0FBUyxlQUFlLGNBQWMsR0FBRyxpQkFBaUIsU0FBUyxZQUFZO0FBQzdFLFVBQVEsMkJBQTJCO0FBQ25DLFFBQU0sTUFBTSxNQUFNLFlBQTBCLGdCQUFnQjtBQUM1RCxNQUFJLElBQUksTUFBTSxJQUFJLE1BQU07QUFDdEIsbUJBQWUsWUFBWTtBQUMzQixRQUFJLEtBQUssUUFBUSxDQUFDLFVBQVU7QUFDMUIsWUFBTSxLQUFLLFNBQVMsY0FBYyxJQUFJO0FBQ3RDLFNBQUcsTUFBTSxVQUFVO0FBQ25CLFNBQUcsTUFBTSxpQkFBaUI7QUFDMUIsU0FBRyxNQUFNLFVBQVU7QUFDbkIsU0FBRyxNQUFNLGVBQWU7QUFFeEIsWUFBTSxPQUFPLFNBQVMsY0FBYyxNQUFNO0FBQzFDLFdBQUssY0FBYyxHQUFHLE1BQU0sSUFBSSxLQUFLLElBQUksS0FBSyxNQUFNLFNBQVMsRUFBRSxlQUFlLENBQUM7QUFDL0UsV0FBSyxNQUFNLFNBQVM7QUFDcEIsV0FBSyxVQUFVLFlBQVk7QUFDekIsWUFBSSxRQUFRLGVBQWUsTUFBTSxJQUFJLElBQUksR0FBRztBQUMxQyxrQkFBUSxtQkFBbUIsRUFBRSxNQUFNLE1BQU0sS0FBSyxDQUFDO0FBQy9DLGdCQUFNLElBQUksTUFBTSxZQUFZLGdCQUFnQixFQUFFLE1BQU0sQ0FBQztBQUNyRCxjQUFJLEVBQUUsSUFBSTtBQUNOLDRCQUFnQixNQUFNO0FBQ3RCLG1CQUFPLE1BQU07QUFBQSxVQUNqQixPQUFPO0FBQ0gsa0JBQU0scUJBQXFCLEVBQUUsS0FBSztBQUFBLFVBQ3RDO0FBQUEsUUFDRjtBQUFBLE1BQ0Y7QUFFQSxZQUFNLFNBQVMsU0FBUyxjQUFjLFFBQVE7QUFDOUMsYUFBTyxjQUFjO0FBQ3JCLGFBQU8sTUFBTSxhQUFhO0FBQzFCLGFBQU8sTUFBTSxhQUFhO0FBQzFCLGFBQU8sTUFBTSxRQUFRO0FBQ3JCLGFBQU8sTUFBTSxTQUFTO0FBQ3RCLGFBQU8sTUFBTSxlQUFlO0FBQzVCLGFBQU8sTUFBTSxVQUFVO0FBQ3ZCLGFBQU8sVUFBVSxPQUFPLE1BQU07QUFDMUIsVUFBRSxnQkFBZ0I7QUFDbEIsWUFBSSxRQUFRLGlCQUFpQixNQUFNLElBQUksSUFBSSxHQUFHO0FBQzFDLGdCQUFNLFlBQVksb0JBQW9CLEVBQUUsTUFBTSxNQUFNLEtBQUssQ0FBQztBQUMxRCxhQUFHLE9BQU87QUFBQSxRQUNkO0FBQUEsTUFDSjtBQUVBLFNBQUcsWUFBWSxJQUFJO0FBQ25CLFNBQUcsWUFBWSxNQUFNO0FBQ3JCLHFCQUFlLFlBQVksRUFBRTtBQUFBLElBQy9CLENBQUM7QUFDRCxvQkFBZ0IsVUFBVTtBQUFBLEVBQzVCLE9BQU87QUFDSCxVQUFNLDRCQUE0QixJQUFJLEtBQUs7QUFBQSxFQUMvQztBQUNGLENBQUM7QUFFRCxTQUFTLGVBQWUsbUJBQW1CLEdBQUcsaUJBQWlCLFNBQVMsTUFBTTtBQUMxRSxrQkFBZ0IsTUFBTTtBQUMxQixDQUFDO0FBRUQsWUFBWSxpQkFBaUIsU0FBUyxVQUFVO0FBR2hELE9BQU8sS0FBSyxVQUFVLFlBQVksTUFBTSxVQUFVLENBQUM7QUFDbkQsT0FBTyxLQUFLLFVBQVUsWUFBWSxNQUFNLFVBQVUsQ0FBQztBQUNuRCxPQUFPLFFBQVEsVUFBVSxZQUFZLE1BQU0sVUFBVSxDQUFDO0FBR3RELElBQU0sV0FBVyxTQUFTLGVBQWUsVUFBVTtBQUNuRCxJQUFNLFVBQVUsU0FBUyxlQUFlLFNBQVM7QUFDakQsSUFBTSxXQUFXLFNBQVMsZUFBZSxVQUFVO0FBRW5ELElBQU0sYUFBYSxDQUFDLE9BQXlCLE9BQU8sVUFBVTtBQUMxRCxNQUFJLFVBQVUsU0FBUztBQUNuQixhQUFTLEtBQUssVUFBVSxJQUFJLFlBQVk7QUFDeEMsUUFBSSxRQUFTLFNBQVEsTUFBTSxVQUFVO0FBQ3JDLFFBQUksU0FBVSxVQUFTLE1BQU0sVUFBVTtBQUFBLEVBQzNDLE9BQU87QUFDSCxhQUFTLEtBQUssVUFBVSxPQUFPLFlBQVk7QUFDM0MsUUFBSSxRQUFTLFNBQVEsTUFBTSxVQUFVO0FBQ3JDLFFBQUksU0FBVSxVQUFTLE1BQU0sVUFBVTtBQUFBLEVBQzNDO0FBR0EsTUFBSSxNQUFNO0FBRU4sWUFBUSxrQkFBa0IsRUFBRSxNQUFNLENBQUM7QUFDbkMsZ0JBQVksbUJBQW1CLEVBQUUsTUFBTSxDQUFDO0FBQUEsRUFDNUM7QUFDSjtBQUdBLElBQU0sY0FBYyxhQUFhLFFBQVEsT0FBTztBQUVoRCxJQUFJLFlBQWEsWUFBVyxhQUFhLEtBQUs7QUFFOUMsVUFBVSxpQkFBaUIsU0FBUyxNQUFNO0FBQ3RDLFFBQU0sVUFBVSxTQUFTLEtBQUssVUFBVSxTQUFTLFlBQVk7QUFDN0QsUUFBTSxXQUFXLFVBQVUsU0FBUztBQUNwQyxlQUFhLFFBQVEsU0FBUyxRQUFRO0FBQ3RDLGFBQVcsVUFBVSxJQUFJO0FBQzdCLENBQUM7QUFHRCxJQUFNLGlCQUFpQixTQUFTLGVBQWUsZ0JBQWdCO0FBQy9ELFNBQVMsZUFBZSxhQUFhLEdBQUcsaUJBQWlCLFNBQVMsTUFBTTtBQUNwRSxpQkFBZSxVQUFVO0FBQzdCLENBQUM7QUFDRCxTQUFTLGVBQWUsa0JBQWtCLEdBQUcsaUJBQWlCLFNBQVMsTUFBTTtBQUN6RSxpQkFBZSxNQUFNO0FBQ3pCLENBQUM7QUFFRCxJQUFNLGlCQUFpQixTQUFTLGVBQWUsZ0JBQWdCO0FBQy9ELGdCQUFnQixpQkFBaUIsVUFBVSxZQUFZO0FBQ25ELFFBQU0sV0FBVyxlQUFlO0FBQ2hDLE1BQUksYUFBYTtBQUNiLGdCQUFZLFdBQVc7QUFFdkIseUJBQXFCLFdBQVc7QUFFaEMsVUFBTSxZQUFZLG1CQUFtQixFQUFFLFVBQVUsU0FBUyxDQUFDO0FBQzNELGFBQVMscUJBQXFCLEVBQUUsT0FBTyxTQUFTLENBQUM7QUFBQSxFQUNyRDtBQUNKLENBQUM7QUFHRCxJQUFNLFNBQVMsU0FBUyxlQUFlLFFBQVE7QUFDL0MsUUFBUSxpQkFBaUIsU0FBUyxZQUFZO0FBQzVDLFFBQU0sTUFBTSxPQUFPLFFBQVEsT0FBTyxlQUFlO0FBQ2pELFFBQU0sT0FBTyxRQUFRLE9BQU87QUFBQSxJQUMxQjtBQUFBLElBQ0EsTUFBTTtBQUFBLElBQ04sT0FBTyxTQUFTLEtBQUs7QUFBQSxJQUNyQixRQUFRLFNBQVMsS0FBSztBQUFBLEVBQ3hCLENBQUM7QUFDRCxTQUFPLE1BQU07QUFDZixDQUFDO0FBRUQsSUFBTSxlQUFlLFNBQVMsZUFBZSxjQUFjO0FBQzNELElBQUksY0FBYztBQUNoQixRQUFNLFdBQVcsQ0FBQyxHQUFXLE1BQWM7QUFDdkMsaUJBQWEsUUFBUSxhQUFhLEtBQUssVUFBVSxFQUFFLE9BQU8sR0FBRyxRQUFRLEVBQUUsQ0FBQyxDQUFDO0FBQUEsRUFDN0U7QUFFQSxlQUFhLGlCQUFpQixhQUFhLENBQUMsTUFBTTtBQUM5QyxNQUFFLGVBQWU7QUFDakIsVUFBTSxTQUFTLEVBQUU7QUFDakIsVUFBTSxTQUFTLEVBQUU7QUFDakIsVUFBTSxhQUFhLFNBQVMsS0FBSztBQUNqQyxVQUFNLGNBQWMsU0FBUyxLQUFLO0FBRWxDLFVBQU0sY0FBYyxDQUFDLE9BQW1CO0FBQ3BDLFlBQU0sV0FBVyxLQUFLLElBQUksS0FBSyxjQUFjLEdBQUcsVUFBVSxPQUFPO0FBQ2pFLFlBQU0sWUFBWSxLQUFLLElBQUksS0FBSyxlQUFlLEdBQUcsVUFBVSxPQUFPO0FBQ25FLGVBQVMsS0FBSyxNQUFNLFFBQVEsR0FBRyxRQUFRO0FBQ3ZDLGVBQVMsS0FBSyxNQUFNLFNBQVMsR0FBRyxTQUFTO0FBQUEsSUFDN0M7QUFFQSxVQUFNLFlBQVksQ0FBQyxPQUFtQjtBQUNqQyxZQUFNLFdBQVcsS0FBSyxJQUFJLEtBQUssY0FBYyxHQUFHLFVBQVUsT0FBTztBQUNqRSxZQUFNLFlBQVksS0FBSyxJQUFJLEtBQUssZUFBZSxHQUFHLFVBQVUsT0FBTztBQUNuRSxlQUFTLFVBQVUsU0FBUztBQUM1QixlQUFTLG9CQUFvQixhQUFhLFdBQVc7QUFDckQsZUFBUyxvQkFBb0IsV0FBVyxTQUFTO0FBQUEsSUFDdEQ7QUFFQSxhQUFTLGlCQUFpQixhQUFhLFdBQVc7QUFDbEQsYUFBUyxpQkFBaUIsV0FBVyxTQUFTO0FBQUEsRUFDbEQsQ0FBQztBQUNIO0FBRUEsSUFBTSxzQkFBc0IsWUFBWTtBQUN0QyxNQUFJO0FBQ0YsVUFBTSxNQUFNLE1BQU0sT0FBTyxRQUFRLFdBQVc7QUFDNUMsUUFBSSxJQUFJLFNBQVMsU0FBUztBQUN2QixVQUFJLE9BQVEsUUFBTyxNQUFNLFVBQVU7QUFFbkMsVUFBSSxhQUFjLGNBQWEsTUFBTSxVQUFVO0FBQy9DLGVBQVMsS0FBSyxNQUFNLFFBQVE7QUFDNUIsZUFBUyxLQUFLLE1BQU0sU0FBUztBQUFBLElBQ2hDLE9BQU87QUFFSCxVQUFJLGFBQWMsY0FBYSxNQUFNLFVBQVU7QUFFL0MsZUFBUyxLQUFLLE1BQU0sUUFBUTtBQUM1QixlQUFTLEtBQUssTUFBTSxTQUFTO0FBQUEsSUFDakM7QUFBQSxFQUNGLFNBQVMsR0FBRztBQUNSLFlBQVEsTUFBTSwrQkFBK0IsQ0FBQztBQUFBLEVBQ2xEO0FBQ0Y7QUFFQSxvQkFBb0I7QUFDcEIsVUFBVSxFQUFFLE1BQU0sT0FBSyxRQUFRLE1BQU0scUJBQXFCLENBQUMsQ0FBQzsiLAogICJuYW1lcyI6IFsiY3VzdG9tU3RyYXRlZ2llcyIsICJtYXRjaCIsICJwcmVmZXJlbmNlcyIsICJ0YWJzIiwgIndpbmRvdyIsICJsaXN0Il0KfQo=
