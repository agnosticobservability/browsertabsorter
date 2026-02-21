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
    const safeContext = sanitizeContext(entry.context);
    const safeEntry = { ...entry, context: safeContext };
    logs.unshift(safeEntry);
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
var logError = (message, context) => {
  if (shouldLog("error")) {
    const safeContext = sanitizeContext(context);
    addLog("error", message, safeContext);
    console.error(`${PREFIX} [ERROR] ${formatMessage(message, safeContext)}`);
  }
};

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
var asArray = (value) => {
  if (Array.isArray(value)) return value;
  return [];
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
var COLORS = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];
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
var colorForKey = (key, offset) => COLORS[Math.abs(hashCode(key) + offset) % COLORS.length];
var hashCode = (value) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
};
var builtInLabelStrategies = {
  domain: (firstTab, tabs) => {
    const siteNames = new Set(tabs.map((t) => t.contextData?.siteName).filter(Boolean));
    if (siteNames.size === 1) {
      return stripTld(Array.from(siteNames)[0]);
    }
    return stripTld(domainFromUrl(firstTab.url));
  },
  domain_full: (firstTab) => domainFromUrl(firstTab.url),
  topic: (firstTab) => semanticBucket(firstTab.title, firstTab.url),
  lineage: (firstTab, _tabs, allTabsMap) => {
    if (firstTab.openerTabId !== void 0) {
      const parent = allTabsMap.get(firstTab.openerTabId);
      if (parent) {
        const parentTitle = parent.title.length > 20 ? parent.title.substring(0, 20) + "..." : parent.title;
        return `From: ${parentTitle}`;
      }
      return `From: Tab ${firstTab.openerTabId}`;
    }
    return `Window ${firstTab.windowId}`;
  },
  context: (firstTab) => firstTab.context || "Uncategorized",
  pinned: (firstTab) => firstTab.pinned ? "Pinned" : "Unpinned",
  age: (firstTab) => getRecencyLabel(firstTab.lastAccessed ?? 0),
  url: () => "URL Group",
  recency: () => "Time Group",
  nesting: (firstTab) => firstTab.openerTabId !== void 0 ? "Children" : "Roots"
};
var getLabelComponent = (strategy, tabs, allTabsMap) => {
  const firstTab = tabs[0];
  if (!firstTab) return "Unknown";
  const custom = customStrategies.find((s) => s.id === strategy);
  if (custom) {
    return groupingKey(firstTab, strategy);
  }
  const generator = builtInLabelStrategies[strategy];
  if (generator) {
    return generator(firstTab, tabs, allTabsMap);
  }
  const val = getFieldValue(firstTab, strategy);
  if (val !== void 0 && val !== null) {
    return String(val);
  }
  return "Unknown";
};
var generateLabel = (strategies, tabs, allTabsMap) => {
  const labels = strategies.map((s) => getLabelComponent(s, tabs, allTabsMap)).filter((l) => l && l !== "Unknown" && l !== "Group" && l !== "URL Group" && l !== "Time Group" && l !== "Misc");
  if (labels.length === 0) return "Group";
  return Array.from(new Set(labels)).join(" - ");
};
var getStrategyColorRule = (strategyId) => {
  const custom = customStrategies.find((s) => s.id === strategyId);
  if (!custom) return void 0;
  const groupingRulesList = asArray(custom.groupingRules);
  for (let i = groupingRulesList.length - 1; i >= 0; i--) {
    const rule = groupingRulesList[i];
    if (rule && rule.color && rule.color !== "random") {
      return rule;
    }
  }
  return void 0;
};
var getColorValueFromTabs = (tabs, colorField, colorTransform, colorTransformPattern) => {
  const keys = tabs.map((tab) => {
    const raw = getFieldValue(tab, colorField);
    let key = raw !== void 0 && raw !== null ? String(raw) : "";
    if (key && colorTransform) {
      key = applyValueTransform(key, colorTransform, colorTransformPattern);
    }
    return key.trim();
  }).filter(Boolean);
  if (keys.length === 0) return "";
  return Array.from(new Set(keys)).sort().join("|");
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
  const bucketMeta = /* @__PURE__ */ new Map();
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
      let colorField;
      let colorTransform;
      let colorTransformPattern;
      for (const sId of appliedStrategies) {
        const rule = getStrategyColorRule(sId);
        if (rule) {
          groupColor = rule.color;
          colorField = rule.colorField;
          colorTransform = rule.colorTransform;
          colorTransformPattern = rule.colorTransformPattern;
          break;
        }
      }
      if (groupColor === "match") {
        groupColor = colorForKey(valueKey, 0);
      } else if (groupColor === "field" && colorField) {
        const val = getFieldValue(tab, colorField);
        let key = val !== void 0 && val !== null ? String(val) : "";
        if (colorTransform) {
          key = applyValueTransform(key, colorTransform, colorTransformPattern);
        }
        if (key) {
          groupColor = colorForKey(key, 0);
        } else {
          groupColor = colorForKey(valueKey, 0);
        }
      } else if (!groupColor || groupColor === "field") {
        groupColor = colorForKey(valueKey, 0);
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
      bucketMeta.set(bucketKey, { valueKey, appliedStrategies: [...appliedStrategies] });
    }
    group.tabs.push(tab);
  });
  const groups = Array.from(buckets.values());
  groups.forEach((group) => {
    group.label = generateLabel(effectiveStrategies, group.tabs, allTabsMap);
    const meta = bucketMeta.get(group.id);
    if (!meta) return;
    for (const sId of meta.appliedStrategies) {
      const rule = getStrategyColorRule(sId);
      if (!rule) continue;
      if (rule.color === "match") {
        group.color = colorForKey(meta.valueKey, 0);
      } else if (rule.color === "field" && rule.colorField) {
        const colorValue = getColorValueFromTabs(group.tabs, rule.colorField, rule.colorTransform, rule.colorTransformPattern);
        group.color = colorForKey(colorValue || meta.valueKey, 0);
      } else if (rule.color) {
        group.color = rule.color;
      }
      break;
    }
  });
  return groups;
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
        if (rule && rule.color === "field" && rule.colorField && isContextField(rule.colorField)) return true;
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

// src/background/extraction/logic.ts
var TRACKING_PARAMS = [
  /^utm_/,
  /^fbclid$/,
  /^gclid$/,
  /^_ga$/,
  /^ref$/,
  /^yclid$/,
  /^_hs/
];
var DOMAIN_ALLOWLISTS = {
  "youtube.com": ["v", "list", "t", "c", "channel", "playlist"],
  "youtu.be": ["v", "list", "t", "c", "channel", "playlist"],
  "google.com": ["q", "id", "sourceid"]
};
function getAllowedParams(hostname) {
  if (DOMAIN_ALLOWLISTS[hostname]) return DOMAIN_ALLOWLISTS[hostname];
  for (const domain in DOMAIN_ALLOWLISTS) {
    if (hostname.endsWith("." + domain)) return DOMAIN_ALLOWLISTS[domain];
  }
  return null;
}
function normalizeUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    const params = new URLSearchParams(url.search);
    const hostname = url.hostname.replace(/^www\./, "");
    const allowedParams = getAllowedParams(hostname);
    const keys = [];
    params.forEach((_, key) => keys.push(key));
    for (const key of keys) {
      if (TRACKING_PARAMS.some((r) => r.test(key))) {
        params.delete(key);
        continue;
      }
      if (allowedParams && !allowedParams.includes(key)) {
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
function extractAuthor(entity) {
  if (!entity || !entity.author) return null;
  if (typeof entity.author === "string") return entity.author;
  if (Array.isArray(entity.author)) return entity.author[0]?.name || null;
  if (typeof entity.author === "object") return entity.author.name || null;
  return null;
}
function extractKeywords(entity) {
  if (!entity || !entity.keywords) return [];
  if (typeof entity.keywords === "string") {
    return entity.keywords.split(",").map((s) => s.trim());
  }
  if (Array.isArray(entity.keywords)) return entity.keywords;
  return [];
}
function extractBreadcrumbs(jsonLd) {
  const breadcrumbLd = jsonLd.find((i) => i && i["@type"] === "BreadcrumbList");
  if (!breadcrumbLd || !Array.isArray(breadcrumbLd.itemListElement)) return [];
  const list = breadcrumbLd.itemListElement.sort((a, b) => (a.position || 0) - (b.position || 0));
  const breadcrumbs = [];
  list.forEach((item) => {
    if (item.name) breadcrumbs.push(item.name);
    else if (item.item && item.item.name) breadcrumbs.push(item.item.name);
  });
  return breadcrumbs;
}
function extractJsonLdFields(jsonLd) {
  const mainEntity = jsonLd.find((i) => i && (i["@type"] === "Article" || i["@type"] === "VideoObject" || i["@type"] === "NewsArticle")) || jsonLd[0];
  let author = null;
  let publishedAt = null;
  let modifiedAt = null;
  let tags = [];
  if (mainEntity) {
    author = extractAuthor(mainEntity);
    publishedAt = mainEntity.datePublished || mainEntity.uploadDate || null;
    modifiedAt = mainEntity.dateModified || null;
    tags = extractKeywords(mainEntity);
  }
  const breadcrumbs = extractBreadcrumbs(jsonLd);
  return { author, publishedAt, modifiedAt, tags, breadcrumbs };
}
function getMetaContent(html, keyAttr, keyValue) {
  const pattern1 = new RegExp(`<meta\\s+(?:[^>]*?\\s+)?${keyAttr}=["']${keyValue}["'](?:[^>]*?\\s+)?content=["']([^"']+)["']`, "i");
  const match1 = pattern1.exec(html);
  if (match1 && match1[1]) return match1[1];
  const pattern2 = new RegExp(`<meta\\s+(?:[^>]*?\\s+)?content=["']([^"']+)["'](?:[^>]*?\\s+)?${keyAttr}=["']${keyValue}["']`, "i");
  const match2 = pattern2.exec(html);
  if (match2 && match2[1]) return match2[1];
  return null;
}
function extractYouTubeMetadataFromHtml(html) {
  let author = null;
  let publishedAt = null;
  let genre = null;
  const scriptRegex = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const json = JSON.parse(match[1]);
      const array = Array.isArray(json) ? json : [json];
      const fields = extractJsonLdFields(array);
      if (fields.author && !author) author = fields.author;
      if (fields.publishedAt && !publishedAt) publishedAt = fields.publishedAt;
    } catch (e) {
    }
  }
  if (!author) {
    const linkName = getMetaContent(html.replace(/<link/gi, "<meta"), "itemprop", "name");
    if (linkName) author = decodeHtmlEntities(linkName);
  }
  if (!author) {
    const metaAuthor = getMetaContent(html, "name", "author");
    if (metaAuthor) author = decodeHtmlEntities(metaAuthor);
  }
  if (!publishedAt) {
    publishedAt = getMetaContent(html, "itemprop", "datePublished");
  }
  if (!publishedAt) {
    publishedAt = getMetaContent(html, "itemprop", "uploadDate");
  }
  genre = extractYouTubeGenreFromHtml(html);
  return { author, publishedAt, genre };
}
function extractYouTubeGenreFromHtml(html) {
  const metaGenre = getMetaContent(html, "itemprop", "genre");
  if (metaGenre) return decodeHtmlEntities(metaGenre);
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
            const metadata = extractYouTubeMetadataFromHtml(html);
            if (metadata.author) {
              baseline.authorOrCreator = metadata.author;
            }
            if (metadata.genre) {
              baseline.genre = metadata.genre;
            }
            if (metadata.publishedAt) {
              baseline.publishedAt = metadata.publishedAt;
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

// src/background/categoryRules.ts
var CATEGORY_DEFINITIONS = [
  {
    category: "Development",
    rules: ["github", "stackoverflow", "localhost", "jira", "gitlab"]
  },
  {
    category: "Work",
    rules: [
      ["google", "docs"],
      ["google", "sheets"],
      ["google", "slides"],
      "linkedin",
      "slack",
      "zoom",
      "teams"
    ]
  },
  {
    category: "Entertainment",
    rules: ["netflix", "spotify", "hulu", "disney", "youtube"]
  },
  {
    category: "Social",
    rules: ["twitter", "facebook", "instagram", "reddit", "tiktok", "pinterest"]
  },
  {
    category: "Shopping",
    rules: ["amazon", "ebay", "walmart", "target", "shopify"]
  },
  {
    category: "News",
    rules: ["cnn", "bbc", "nytimes", "washingtonpost", "foxnews"]
  },
  {
    category: "Education",
    rules: ["coursera", "udemy", "edx", "khanacademy", "canvas"]
  },
  {
    category: "Travel",
    rules: ["expedia", "booking", "airbnb", "tripadvisor", "kayak"]
  },
  {
    category: "Health",
    rules: ["webmd", "mayoclinic", "nih.gov", "health"]
  },
  {
    category: "Sports",
    rules: ["espn", "nba", "nfl", "mlb", "fifa"]
  },
  {
    category: "Technology",
    rules: ["techcrunch", "wired", "theverge", "arstechnica"]
  },
  {
    category: "Science",
    rules: ["science", "nature.com", "nasa.gov"]
  },
  {
    category: "Gaming",
    rules: ["twitch", "steam", "roblox", "ign", "gamespot"]
  },
  {
    category: "Music",
    rules: ["soundcloud", "bandcamp", "last.fm"]
  },
  {
    category: "Art",
    rules: ["deviantart", "behance", "dribbble", "artstation"]
  }
];
var getCategoryFromUrl = (url) => {
  const lowerUrl = url.toLowerCase();
  for (const def of CATEGORY_DEFINITIONS) {
    for (const rule of def.rules) {
      if (Array.isArray(rule)) {
        if (rule.every((part) => lowerUrl.includes(part))) {
          return def.category;
        }
      } else {
        if (lowerUrl.includes(rule)) {
          return def.category;
        }
      }
    }
  }
  return "Uncategorized";
};

// src/background/categorizationRules.ts
var CATEGORIZATION_RULES = [
  {
    id: "entertainment-platforms",
    condition: (data) => ["YouTube", "Netflix", "Spotify", "Twitch"].includes(data.platform || ""),
    category: "Entertainment"
  },
  {
    id: "development-platforms",
    condition: (data) => ["GitHub", "Stack Overflow", "Jira", "GitLab"].includes(data.platform || ""),
    category: "Development"
  },
  {
    id: "google-work-suite",
    condition: (data) => data.platform === "Google" && ["docs", "sheets", "slides"].some((k) => data.normalizedUrl.includes(k)),
    category: "Work"
  }
];
function determineCategoryFromContext(data) {
  for (const rule of CATEGORIZATION_RULES) {
    if (rule.condition(data)) {
      return rule.category;
    }
  }
  if (data.objectType && data.objectType !== "unknown") {
    if (data.objectType === "video") return "Entertainment";
    if (data.objectType === "article") return "News";
    return data.objectType.charAt(0).toUpperCase() + data.objectType.slice(1);
  }
  return "General Web";
}

// src/background/contextAnalysis.ts
var contextCache = /* @__PURE__ */ new Map();
var CACHE_TTL_SUCCESS = 24 * 60 * 60 * 1e3;
var CACHE_TTL_ERROR = 5 * 60 * 1e3;
var analyzeTabContext = async (tabs, onProgress) => {
  const contextMap = /* @__PURE__ */ new Map();
  let completed = 0;
  const total = tabs.length;
  const promises = tabs.map(async (tab) => {
    try {
      const cacheKey = `${tab.id}::${tab.url}`;
      const cached = contextCache.get(cacheKey);
      if (cached) {
        const isError = cached.result.status === "ERROR" || !!cached.result.error;
        const ttl = isError ? CACHE_TTL_ERROR : CACHE_TTL_SUCCESS;
        if (Date.now() - cached.timestamp < ttl) {
          contextMap.set(tab.id, cached.result);
          return;
        } else {
          contextCache.delete(cacheKey);
        }
      }
      const result = await fetchContextForTab(tab);
      contextCache.set(cacheKey, {
        result,
        timestamp: Date.now()
      });
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
    context = determineCategoryFromContext(data);
    source = "Extraction";
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
  const context = getCategoryFromUrl(tab.url);
  return { context, source: "Heuristic" };
};

// src/background/tabManager.ts
var getTabsForFilter = async (filter) => {
  const windowIds = filter?.windowIds;
  const tabIds = filter?.tabIds;
  const hasWindowIds = windowIds && windowIds.length > 0;
  const hasTabIds = tabIds && tabIds.length > 0;
  if (!filter || !hasWindowIds && !hasTabIds) {
    return chrome.tabs.query({});
  }
  const promises = [];
  if (hasWindowIds) {
    windowIds.forEach((windowId) => {
      promises.push(chrome.tabs.query({ windowId }).catch(() => []));
    });
  }
  if (hasTabIds) {
    tabIds.forEach((tabId) => {
      promises.push(chrome.tabs.get(tabId).catch(() => null));
    });
  }
  const results = await Promise.all(promises);
  const allTabs = [];
  for (const res of results) {
    if (Array.isArray(res)) {
      allTabs.push(...res);
    } else if (res) {
      allTabs.push(res);
    }
  }
  const uniqueTabs = /* @__PURE__ */ new Map();
  for (const tab of allTabs) {
    if (tab.id !== void 0) {
      uniqueTabs.set(tab.id, tab);
    }
  }
  return Array.from(uniqueTabs.values());
};
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
  const chromeTabs = await getTabsForFilter(filter);
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
      if (candidateGroupId === void 0) {
        try {
          const windowGroups = await chrome.tabGroups.query({ windowId: targetWinId });
          const matchingGroup = windowGroups.find((g) => g.title === group.label && !claimedGroupIds.has(g.id));
          if (matchingGroup) {
            candidateGroupId = matchingGroup.id;
          }
        } catch (e) {
          logError("Error finding matching group by label", { error: String(e) });
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
  const targetWindowIds = /* @__PURE__ */ new Set();
  let chromeTabs = [];
  const explicitWindowIds = filter?.windowIds ?? [];
  const explicitTabIds = filter?.tabIds ?? [];
  const hasFilter = explicitWindowIds.length > 0 || explicitTabIds.length > 0;
  if (!hasFilter) {
    chromeTabs = await chrome.tabs.query({});
    chromeTabs.forEach((t) => {
      if (t.windowId) targetWindowIds.add(t.windowId);
    });
  } else {
    explicitWindowIds.forEach((id) => targetWindowIds.add(id));
    if (explicitTabIds.length > 0) {
      const specificTabs = await Promise.all(explicitTabIds.map((id) => chrome.tabs.get(id).catch(() => null)));
      specificTabs.forEach((t) => {
        if (t && t.windowId) targetWindowIds.add(t.windowId);
      });
    }
    const windowPromises = Array.from(targetWindowIds).map(
      (windowId) => chrome.tabs.query({ windowId }).catch(() => [])
    );
    const results = await Promise.all(windowPromises);
    chromeTabs = results.flat();
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
var getTabsByIds = async (tabIds) => {
  if (!tabIds.length) return [];
  const allTabs = await chrome.tabs.query({});
  const tabMap = new Map(allTabs.map((t) => [t.id, t]));
  return tabIds.map((id) => tabMap.get(id)).filter((t) => t !== void 0 && t.id !== void 0 && t.windowId !== void 0);
};
var mergeTabs = async (tabIds) => {
  if (!tabIds.length) return;
  const validTabs = await getTabsByIds(tabIds);
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
  const validTabs = await getTabsByIds(tabIds);
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
    try {
      await chrome.tabs.move(tabIds, { windowId: targetWindowId, index: 0 });
    } catch (e) {
      logError("Failed to batch move tabs, falling back to individual moves", { error: e });
      for (let j = 0; j < tabsToMove.length; j++) {
        const { tabId } = tabsToMove[j];
        try {
          await chrome.tabs.move(tabId, { windowId: targetWindowId, index: j });
        } catch (e2) {
          logError("Failed to move tab individually", { tabId, error: e2 });
        }
      }
    }
    for (const { tabId, stored } of tabsToMove) {
      try {
        if (stored.pinned) {
          await chrome.tabs.update(tabId, { pinned: true });
        } else {
          const current = await chrome.tabs.get(tabId);
          if (current.pinned) await chrome.tabs.update(tabId, { pinned: false });
        }
      } catch (e) {
        logError("Failed to update tab pin state", { tabId, error: e });
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
var dirtyTabIds = /* @__PURE__ */ new Set();
var tabProcessingTimeout = null;
var triggerAutoRun = (tabId) => {
  if (tabId !== void 0) {
    dirtyTabIds.add(tabId);
    if (tabProcessingTimeout) clearTimeout(tabProcessingTimeout);
    tabProcessingTimeout = setTimeout(async () => {
      const ids = Array.from(dirtyTabIds);
      dirtyTabIds.clear();
      if (ids.length === 0) return;
      try {
        const prefs = await loadPreferences();
        setCustomStrategies(prefs.customStrategies || []);
        const autoRunStrats = prefs.customStrategies?.filter((s) => s.autoRun);
        if (autoRunStrats && autoRunStrats.length > 0) {
          const strategyIds = autoRunStrats.map((s) => s.id);
          const groups = await calculateTabGroups({ ...prefs, sorting: strategyIds }, { tabIds: ids });
          await applyTabGroups(groups);
          logInfo("Auto-run targeted", { tabs: ids, strategies: strategyIds });
        }
      } catch (e) {
        console.error("Auto-run targeted failed", e);
      }
    }, 200);
  }
  if (autoRunTimeout) clearTimeout(autoRunTimeout);
  autoRunTimeout = setTimeout(async () => {
    try {
      const prefs = await loadPreferences();
      setCustomStrategies(prefs.customStrategies || []);
      const autoRunStrats = prefs.customStrategies?.filter((s) => s.autoRun);
      if (autoRunStrats && autoRunStrats.length > 0) {
        logInfo("Auto-running strategies (global)", {
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
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id) triggerAutoRun(tab.id);
  else triggerAutoRun();
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    triggerAutoRun(tabId);
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3NoYXJlZC9zdHJhdGVneVJlZ2lzdHJ5LnRzIiwgIi4uLy4uL3NyYy9zaGFyZWQvbG9nZ2VyLnRzIiwgIi4uLy4uL3NyYy9zaGFyZWQvdXRpbHMudHMiLCAiLi4vLi4vc3JjL3NoYXJlZC91cmxDYWNoZS50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9ncm91cGluZ1N0cmF0ZWdpZXMudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvc29ydGluZ1N0cmF0ZWdpZXMudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZXh0cmFjdGlvbi9sb2dpYy50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9leHRyYWN0aW9uL2dlbmVyYVJlZ2lzdHJ5LnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3N0b3JhZ2UudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvcHJlZmVyZW5jZXMudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZXh0cmFjdGlvbi9pbmRleC50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9jYXRlZ29yeVJ1bGVzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL2NhdGVnb3JpemF0aW9uUnVsZXMudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvY29udGV4dEFuYWx5c2lzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3RhYk1hbmFnZXIudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvc3RhdGVNYW5hZ2VyLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3NlcnZpY2VXb3JrZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IEN1c3RvbVN0cmF0ZWd5LCBTb3J0aW5nU3RyYXRlZ3kgfSBmcm9tIFwiLi90eXBlcy5qc1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0cmF0ZWd5RGVmaW5pdGlvbiB7XG4gICAgaWQ6IFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZztcbiAgICBsYWJlbDogc3RyaW5nO1xuICAgIGlzR3JvdXBpbmc6IGJvb2xlYW47XG4gICAgaXNTb3J0aW5nOiBib29sZWFuO1xuICAgIHRhZ3M/OiBzdHJpbmdbXTtcbiAgICBhdXRvUnVuPzogYm9vbGVhbjtcbiAgICBpc0N1c3RvbT86IGJvb2xlYW47XG59XG5cbi8vIFJlc3RvcmVkIHN0cmF0ZWdpZXMgbWF0Y2hpbmcgYmFja2dyb3VuZCBjYXBhYmlsaXRpZXMuXG5leHBvcnQgY29uc3QgU1RSQVRFR0lFUzogU3RyYXRlZ3lEZWZpbml0aW9uW10gPSBbXG4gICAgeyBpZDogXCJkb21haW5cIiwgbGFiZWw6IFwiRG9tYWluXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJkb21haW5fZnVsbFwiLCBsYWJlbDogXCJGdWxsIERvbWFpblwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwidG9waWNcIiwgbGFiZWw6IFwiVG9waWNcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImNvbnRleHRcIiwgbGFiZWw6IFwiQ29udGV4dFwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwibGluZWFnZVwiLCBsYWJlbDogXCJMaW5lYWdlXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJwaW5uZWRcIiwgbGFiZWw6IFwiUGlubmVkXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJyZWNlbmN5XCIsIGxhYmVsOiBcIlJlY2VuY3lcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImFnZVwiLCBsYWJlbDogXCJBZ2VcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInVybFwiLCBsYWJlbDogXCJVUkxcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcIm5lc3RpbmdcIiwgbGFiZWw6IFwiTmVzdGluZ1wiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwidGl0bGVcIiwgbGFiZWw6IFwiVGl0bGVcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbl07XG5cbmV4cG9ydCBjb25zdCBnZXRTdHJhdGVnaWVzID0gKGN1c3RvbVN0cmF0ZWdpZXM/OiBDdXN0b21TdHJhdGVneVtdKTogU3RyYXRlZ3lEZWZpbml0aW9uW10gPT4ge1xuICAgIGlmICghY3VzdG9tU3RyYXRlZ2llcyB8fCBjdXN0b21TdHJhdGVnaWVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIFNUUkFURUdJRVM7XG5cbiAgICAvLyBDdXN0b20gc3RyYXRlZ2llcyBjYW4gb3ZlcnJpZGUgYnVpbHQtaW5zIGlmIElEcyBtYXRjaCwgb3IgYWRkIG5ldyBvbmVzLlxuICAgIGNvbnN0IGNvbWJpbmVkID0gWy4uLlNUUkFURUdJRVNdO1xuXG4gICAgY3VzdG9tU3RyYXRlZ2llcy5mb3JFYWNoKGN1c3RvbSA9PiB7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nSW5kZXggPSBjb21iaW5lZC5maW5kSW5kZXgocyA9PiBzLmlkID09PSBjdXN0b20uaWQpO1xuXG4gICAgICAgIC8vIERldGVybWluZSBjYXBhYmlsaXRpZXMgYmFzZWQgb24gcnVsZXMgcHJlc2VuY2VcbiAgICAgICAgY29uc3QgaGFzR3JvdXBpbmcgPSAoY3VzdG9tLmdyb3VwaW5nUnVsZXMgJiYgY3VzdG9tLmdyb3VwaW5nUnVsZXMubGVuZ3RoID4gMCkgfHwgKGN1c3RvbS5ydWxlcyAmJiBjdXN0b20ucnVsZXMubGVuZ3RoID4gMCkgfHwgZmFsc2U7XG4gICAgICAgIGNvbnN0IGhhc1NvcnRpbmcgPSAoY3VzdG9tLnNvcnRpbmdSdWxlcyAmJiBjdXN0b20uc29ydGluZ1J1bGVzLmxlbmd0aCA+IDApIHx8IChjdXN0b20ucnVsZXMgJiYgY3VzdG9tLnJ1bGVzLmxlbmd0aCA+IDApIHx8IGZhbHNlO1xuXG4gICAgICAgIGNvbnN0IHRhZ3M6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGlmIChoYXNHcm91cGluZykgdGFncy5wdXNoKFwiZ3JvdXBcIik7XG4gICAgICAgIGlmIChoYXNTb3J0aW5nKSB0YWdzLnB1c2goXCJzb3J0XCIpO1xuXG4gICAgICAgIGNvbnN0IGRlZmluaXRpb246IFN0cmF0ZWd5RGVmaW5pdGlvbiA9IHtcbiAgICAgICAgICAgIGlkOiBjdXN0b20uaWQsXG4gICAgICAgICAgICBsYWJlbDogY3VzdG9tLmxhYmVsLFxuICAgICAgICAgICAgaXNHcm91cGluZzogaGFzR3JvdXBpbmcsXG4gICAgICAgICAgICBpc1NvcnRpbmc6IGhhc1NvcnRpbmcsXG4gICAgICAgICAgICB0YWdzOiB0YWdzLFxuICAgICAgICAgICAgYXV0b1J1bjogY3VzdG9tLmF1dG9SdW4sXG4gICAgICAgICAgICBpc0N1c3RvbTogdHJ1ZVxuICAgICAgICB9O1xuXG4gICAgICAgIGlmIChleGlzdGluZ0luZGV4ICE9PSAtMSkge1xuICAgICAgICAgICAgY29tYmluZWRbZXhpc3RpbmdJbmRleF0gPSBkZWZpbml0aW9uO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29tYmluZWQucHVzaChkZWZpbml0aW9uKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGNvbWJpbmVkO1xufTtcblxuZXhwb3J0IGNvbnN0IGdldFN0cmF0ZWd5ID0gKGlkOiBTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmcpOiBTdHJhdGVneURlZmluaXRpb24gfCB1bmRlZmluZWQgPT4gU1RSQVRFR0lFUy5maW5kKHMgPT4gcy5pZCA9PT0gaWQpO1xuIiwgImltcG9ydCB7IExvZ0VudHJ5LCBMb2dMZXZlbCwgUHJlZmVyZW5jZXMgfSBmcm9tIFwiLi90eXBlcy5qc1wiO1xuXG5jb25zdCBQUkVGSVggPSBcIltUYWJTb3J0ZXJdXCI7XG5cbmNvbnN0IExFVkVMX1BSSU9SSVRZOiBSZWNvcmQ8TG9nTGV2ZWwsIG51bWJlcj4gPSB7XG4gIGRlYnVnOiAwLFxuICBpbmZvOiAxLFxuICB3YXJuOiAyLFxuICBlcnJvcjogMyxcbiAgY3JpdGljYWw6IDRcbn07XG5cbmxldCBjdXJyZW50TGV2ZWw6IExvZ0xldmVsID0gXCJpbmZvXCI7XG5sZXQgbG9nczogTG9nRW50cnlbXSA9IFtdO1xuY29uc3QgTUFYX0xPR1MgPSAxMDAwO1xuY29uc3QgU1RPUkFHRV9LRVkgPSBcInNlc3Npb25Mb2dzXCI7XG5cbmNvbnN0IFNFTlNJVElWRV9LRVlTID0gL3Bhc3N3b3JkfHNlY3JldHx0b2tlbnxjcmVkZW50aWFsfGNvb2tpZXxzZXNzaW9ufGF1dGhvcml6YXRpb258KChhcGl8YWNjZXNzfHNlY3JldHxwcml2YXRlKVstX10/a2V5KS9pO1xuXG5jb25zdCBzYW5pdGl6ZUNvbnRleHQgPSAoY29udGV4dDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCA9PiB7XG4gICAgaWYgKCFjb250ZXh0KSByZXR1cm4gdW5kZWZpbmVkO1xuICAgIHRyeSB7XG4gICAgICAgIC8vIERlZXAgY2xvbmUgdG8gZW5zdXJlIHdlIGRvbid0IG1vZGlmeSB0aGUgb3JpZ2luYWwgb2JqZWN0IGFuZCByZW1vdmUgbm9uLXNlcmlhbGl6YWJsZSBkYXRhXG4gICAgICAgIGNvbnN0IGpzb24gPSBKU09OLnN0cmluZ2lmeShjb250ZXh0KTtcbiAgICAgICAgY29uc3Qgb2JqID0gSlNPTi5wYXJzZShqc29uKTtcblxuICAgICAgICBjb25zdCByZWRhY3QgPSAobzogYW55KSA9PiB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIG8gIT09ICdvYmplY3QnIHx8IG8gPT09IG51bGwpIHJldHVybjtcbiAgICAgICAgICAgIGZvciAoY29uc3QgayBpbiBvKSB7XG4gICAgICAgICAgICAgICAgaWYgKFNFTlNJVElWRV9LRVlTLnRlc3QoaykpIHtcbiAgICAgICAgICAgICAgICAgICAgb1trXSA9ICdbUkVEQUNURURdJztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZWRhY3Qob1trXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICByZWRhY3Qob2JqKTtcbiAgICAgICAgcmV0dXJuIG9iajtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHJldHVybiB7IGVycm9yOiBcIkZhaWxlZCB0byBzYW5pdGl6ZSBjb250ZXh0XCIgfTtcbiAgICB9XG59O1xuXG4vLyBTYWZlIGNvbnRleHQgY2hlY2tcbmNvbnN0IGlzU2VydmljZVdvcmtlciA9IHR5cGVvZiBzZWxmICE9PSAndW5kZWZpbmVkJyAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZW9mIChzZWxmIGFzIGFueSkuU2VydmljZVdvcmtlckdsb2JhbFNjb3BlICE9PSAndW5kZWZpbmVkJyAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZiBpbnN0YW5jZW9mIChzZWxmIGFzIGFueSkuU2VydmljZVdvcmtlckdsb2JhbFNjb3BlO1xubGV0IGlzU2F2aW5nID0gZmFsc2U7XG5sZXQgcGVuZGluZ1NhdmUgPSBmYWxzZTtcbmxldCBzYXZlVGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgbnVsbCA9IG51bGw7XG5cbmNvbnN0IGRvU2F2ZSA9ICgpID0+IHtcbiAgICBpZiAoIWlzU2VydmljZVdvcmtlciB8fCAhY2hyb21lPy5zdG9yYWdlPy5zZXNzaW9uIHx8IGlzU2F2aW5nKSB7XG4gICAgICAgIHBlbmRpbmdTYXZlID0gdHJ1ZTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlzU2F2aW5nID0gdHJ1ZTtcbiAgICBwZW5kaW5nU2F2ZSA9IGZhbHNlO1xuXG4gICAgY2hyb21lLnN0b3JhZ2Uuc2Vzc2lvbi5zZXQoeyBbU1RPUkFHRV9LRVldOiBsb2dzIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICBpc1NhdmluZyA9IGZhbHNlO1xuICAgICAgICBpZiAocGVuZGluZ1NhdmUpIHtcbiAgICAgICAgICAgIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG4gICAgICAgIH1cbiAgICB9KS5jYXRjaChlcnIgPT4ge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIHNhdmUgbG9nc1wiLCBlcnIpO1xuICAgICAgICBpc1NhdmluZyA9IGZhbHNlO1xuICAgIH0pO1xufTtcblxuY29uc3Qgc2F2ZUxvZ3NUb1N0b3JhZ2UgPSAoKSA9PiB7XG4gICAgaWYgKHNhdmVUaW1lcikgY2xlYXJUaW1lb3V0KHNhdmVUaW1lcik7XG4gICAgc2F2ZVRpbWVyID0gc2V0VGltZW91dChkb1NhdmUsIDEwMDApO1xufTtcblxubGV0IHJlc29sdmVMb2dnZXJSZWFkeTogKCkgPT4gdm9pZDtcbmV4cG9ydCBjb25zdCBsb2dnZXJSZWFkeSA9IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuICAgIHJlc29sdmVMb2dnZXJSZWFkeSA9IHJlc29sdmU7XG59KTtcblxuZXhwb3J0IGNvbnN0IGluaXRMb2dnZXIgPSBhc3luYyAoKSA9PiB7XG4gICAgaWYgKGlzU2VydmljZVdvcmtlciAmJiBjaHJvbWU/LnN0b3JhZ2U/LnNlc3Npb24pIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNocm9tZS5zdG9yYWdlLnNlc3Npb24uZ2V0KFNUT1JBR0VfS0VZKTtcbiAgICAgICAgICAgIGlmIChyZXN1bHRbU1RPUkFHRV9LRVldICYmIEFycmF5LmlzQXJyYXkocmVzdWx0W1NUT1JBR0VfS0VZXSkpIHtcbiAgICAgICAgICAgICAgICBsb2dzID0gcmVzdWx0W1NUT1JBR0VfS0VZXTtcbiAgICAgICAgICAgICAgICBpZiAobG9ncy5sZW5ndGggPiBNQVhfTE9HUykgbG9ncyA9IGxvZ3Muc2xpY2UoMCwgTUFYX0xPR1MpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIHJlc3RvcmUgbG9nc1wiLCBlKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAocmVzb2x2ZUxvZ2dlclJlYWR5KSByZXNvbHZlTG9nZ2VyUmVhZHkoKTtcbn07XG5cbmV4cG9ydCBjb25zdCBzZXRMb2dnZXJQcmVmZXJlbmNlcyA9IChwcmVmczogUHJlZmVyZW5jZXMpID0+IHtcbiAgaWYgKHByZWZzLmxvZ0xldmVsKSB7XG4gICAgY3VycmVudExldmVsID0gcHJlZnMubG9nTGV2ZWw7XG4gIH0gZWxzZSBpZiAocHJlZnMuZGVidWcpIHtcbiAgICBjdXJyZW50TGV2ZWwgPSBcImRlYnVnXCI7XG4gIH0gZWxzZSB7XG4gICAgY3VycmVudExldmVsID0gXCJpbmZvXCI7XG4gIH1cbn07XG5cbmNvbnN0IHNob3VsZExvZyA9IChsZXZlbDogTG9nTGV2ZWwpOiBib29sZWFuID0+IHtcbiAgcmV0dXJuIExFVkVMX1BSSU9SSVRZW2xldmVsXSA+PSBMRVZFTF9QUklPUklUWVtjdXJyZW50TGV2ZWxdO1xufTtcblxuY29uc3QgZm9ybWF0TWVzc2FnZSA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICByZXR1cm4gY29udGV4dCA/IGAke21lc3NhZ2V9IDo6ICR7SlNPTi5zdHJpbmdpZnkoY29udGV4dCl9YCA6IG1lc3NhZ2U7XG59O1xuXG5jb25zdCBhZGRMb2cgPSAobGV2ZWw6IExvZ0xldmVsLCBtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBpZiAoc2hvdWxkTG9nKGxldmVsKSkge1xuICAgICAgY29uc3QgZW50cnk6IExvZ0VudHJ5ID0ge1xuICAgICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcbiAgICAgICAgICBsZXZlbCxcbiAgICAgICAgICBtZXNzYWdlLFxuICAgICAgICAgIGNvbnRleHRcbiAgICAgIH07XG5cbiAgICAgIGlmIChpc1NlcnZpY2VXb3JrZXIpIHtcbiAgICAgICAgICBsb2dzLnVuc2hpZnQoZW50cnkpO1xuICAgICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSB7XG4gICAgICAgICAgICAgIGxvZ3MucG9wKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIEluIG90aGVyIGNvbnRleHRzLCBzZW5kIHRvIFNXXG4gICAgICAgICAgaWYgKGNocm9tZT8ucnVudGltZT8uc2VuZE1lc3NhZ2UpIHtcbiAgICAgICAgICAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdsb2dFbnRyeScsIHBheWxvYWQ6IGVudHJ5IH0pLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgLy8gSWdub3JlIGlmIG1lc3NhZ2UgZmFpbHMgKGUuZy4gY29udGV4dCBpbnZhbGlkYXRlZClcbiAgICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICB9XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBhZGRMb2dFbnRyeSA9IChlbnRyeTogTG9nRW50cnkpID0+IHtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSB7XG4gICAgICAgIC8vIEVuc3VyZSBjb250ZXh0IGlzIHNhbml0aXplZCBiZWZvcmUgc3RvcmluZ1xuICAgICAgICBjb25zdCBzYWZlQ29udGV4dCA9IHNhbml0aXplQ29udGV4dChlbnRyeS5jb250ZXh0KTtcbiAgICAgICAgY29uc3Qgc2FmZUVudHJ5ID0geyAuLi5lbnRyeSwgY29udGV4dDogc2FmZUNvbnRleHQgfTtcblxuICAgICAgICBsb2dzLnVuc2hpZnQoc2FmZUVudHJ5KTtcbiAgICAgICAgaWYgKGxvZ3MubGVuZ3RoID4gTUFYX0xPR1MpIHtcbiAgICAgICAgICAgIGxvZ3MucG9wKCk7XG4gICAgICAgIH1cbiAgICAgICAgc2F2ZUxvZ3NUb1N0b3JhZ2UoKTtcbiAgICB9XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0TG9ncyA9ICgpID0+IFsuLi5sb2dzXTtcbmV4cG9ydCBjb25zdCBjbGVhckxvZ3MgPSAoKSA9PiB7XG4gICAgbG9ncy5sZW5ndGggPSAwO1xuICAgIGlmIChpc1NlcnZpY2VXb3JrZXIpIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG59O1xuXG5leHBvcnQgY29uc3QgbG9nRGVidWcgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgaWYgKHNob3VsZExvZyhcImRlYnVnXCIpKSB7XG4gICAgICBjb25zdCBzYWZlQ29udGV4dCA9IHNhbml0aXplQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGFkZExvZyhcImRlYnVnXCIsIG1lc3NhZ2UsIHNhZmVDb250ZXh0KTtcbiAgICAgIGNvbnNvbGUuZGVidWcoYCR7UFJFRklYfSBbREVCVUddICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBzYWZlQ29udGV4dCl9YCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBsb2dJbmZvID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGlmIChzaG91bGRMb2coXCJpbmZvXCIpKSB7XG4gICAgICBjb25zdCBzYWZlQ29udGV4dCA9IHNhbml0aXplQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGFkZExvZyhcImluZm9cIiwgbWVzc2FnZSwgc2FmZUNvbnRleHQpO1xuICAgICAgY29uc29sZS5pbmZvKGAke1BSRUZJWH0gW0lORk9dICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBzYWZlQ29udGV4dCl9YCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBsb2dXYXJuID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGlmIChzaG91bGRMb2coXCJ3YXJuXCIpKSB7XG4gICAgICBjb25zdCBzYWZlQ29udGV4dCA9IHNhbml0aXplQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGFkZExvZyhcIndhcm5cIiwgbWVzc2FnZSwgc2FmZUNvbnRleHQpO1xuICAgICAgY29uc29sZS53YXJuKGAke1BSRUZJWH0gW1dBUk5dICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBzYWZlQ29udGV4dCl9YCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBsb2dFcnJvciA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBpZiAoc2hvdWxkTG9nKFwiZXJyb3JcIikpIHtcbiAgICAgIGNvbnN0IHNhZmVDb250ZXh0ID0gc2FuaXRpemVDb250ZXh0KGNvbnRleHQpO1xuICAgICAgYWRkTG9nKFwiZXJyb3JcIiwgbWVzc2FnZSwgc2FmZUNvbnRleHQpO1xuICAgICAgY29uc29sZS5lcnJvcihgJHtQUkVGSVh9IFtFUlJPUl0gJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIHNhZmVDb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0NyaXRpY2FsID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGlmIChzaG91bGRMb2coXCJjcml0aWNhbFwiKSkge1xuICAgICAgY29uc3Qgc2FmZUNvbnRleHQgPSBzYW5pdGl6ZUNvbnRleHQoY29udGV4dCk7XG4gICAgICBhZGRMb2coXCJjcml0aWNhbFwiLCBtZXNzYWdlLCBzYWZlQ29udGV4dCk7XG4gICAgICAvLyBDcml0aWNhbCBsb2dzIHVzZSBlcnJvciBjb25zb2xlIGJ1dCB3aXRoIGRpc3RpbmN0IHByZWZpeCBhbmQgbWF5YmUgc3R5bGluZyBpZiBzdXBwb3J0ZWRcbiAgICAgIGNvbnNvbGUuZXJyb3IoYCR7UFJFRklYfSBbQ1JJVElDQUxdIFx1RDgzRFx1REVBOCAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgc2FmZUNvbnRleHQpfWApO1xuICB9XG59O1xuIiwgImltcG9ydCB7IFByZWZlcmVuY2VzLCBTb3J0aW5nU3RyYXRlZ3ksIFRhYk1ldGFkYXRhIH0gZnJvbSBcIi4vdHlwZXMuanNcIjtcblxuZXhwb3J0IGNvbnN0IG1hcENocm9tZVRhYiA9ICh0YWI6IGNocm9tZS50YWJzLlRhYik6IFRhYk1ldGFkYXRhIHwgbnVsbCA9PiB7XG4gIGlmICghdGFiLmlkIHx8IHRhYi5pZCA9PT0gY2hyb21lLnRhYnMuVEFCX0lEX05PTkUgfHwgIXRhYi53aW5kb3dJZCkgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7XG4gICAgaWQ6IHRhYi5pZCxcbiAgICB3aW5kb3dJZDogdGFiLndpbmRvd0lkLFxuICAgIHRpdGxlOiB0YWIudGl0bGUgfHwgXCJVbnRpdGxlZFwiLFxuICAgIHVybDogdGFiLnBlbmRpbmdVcmwgfHwgdGFiLnVybCB8fCBcImFib3V0OmJsYW5rXCIsXG4gICAgcGlubmVkOiBCb29sZWFuKHRhYi5waW5uZWQpLFxuICAgIGxhc3RBY2Nlc3NlZDogdGFiLmxhc3RBY2Nlc3NlZCxcbiAgICBvcGVuZXJUYWJJZDogdGFiLm9wZW5lclRhYklkID8/IHVuZGVmaW5lZCxcbiAgICBmYXZJY29uVXJsOiB0YWIuZmF2SWNvblVybCxcbiAgICBncm91cElkOiB0YWIuZ3JvdXBJZCxcbiAgICBpbmRleDogdGFiLmluZGV4LFxuICAgIGFjdGl2ZTogdGFiLmFjdGl2ZSxcbiAgICBzdGF0dXM6IHRhYi5zdGF0dXMsXG4gICAgc2VsZWN0ZWQ6IHRhYi5oaWdobGlnaHRlZFxuICB9O1xufTtcblxuZXhwb3J0IGNvbnN0IGdldFN0b3JlZFByZWZlcmVuY2VzID0gYXN5bmMgKCk6IFByb21pc2U8UHJlZmVyZW5jZXMgfCBudWxsPiA9PiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChcInByZWZlcmVuY2VzXCIsIChpdGVtcykgPT4ge1xuICAgICAgcmVzb2x2ZSgoaXRlbXNbXCJwcmVmZXJlbmNlc1wiXSBhcyBQcmVmZXJlbmNlcykgPz8gbnVsbCk7XG4gICAgfSk7XG4gIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IGFzQXJyYXkgPSA8VD4odmFsdWU6IHVua25vd24pOiBUW10gPT4ge1xuICAgIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkgcmV0dXJuIHZhbHVlIGFzIFRbXTtcbiAgICByZXR1cm4gW107XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gZXNjYXBlSHRtbCh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBpZiAoIXRleHQpIHJldHVybiAnJztcbiAgcmV0dXJuIHRleHRcbiAgICAucmVwbGFjZSgvJi9nLCAnJmFtcDsnKVxuICAgIC5yZXBsYWNlKC88L2csICcmbHQ7JylcbiAgICAucmVwbGFjZSgvPi9nLCAnJmd0OycpXG4gICAgLnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKVxuICAgIC5yZXBsYWNlKC8nL2csICcmIzAzOTsnKTtcbn1cbiIsICJjb25zdCBob3N0bmFtZUNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcbmNvbnN0IE1BWF9DQUNIRV9TSVpFID0gMTAwMDtcblxuZXhwb3J0IGNvbnN0IGdldEhvc3RuYW1lID0gKHVybDogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gIGlmIChob3N0bmFtZUNhY2hlLmhhcyh1cmwpKSByZXR1cm4gaG9zdG5hbWVDYWNoZS5nZXQodXJsKSE7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBwYXJzZWQgPSBuZXcgVVJMKHVybCk7XG4gICAgY29uc3QgaG9zdG5hbWUgPSBwYXJzZWQuaG9zdG5hbWU7XG5cbiAgICBpZiAoaG9zdG5hbWVDYWNoZS5zaXplID49IE1BWF9DQUNIRV9TSVpFKSBob3N0bmFtZUNhY2hlLmNsZWFyKCk7XG4gICAgaG9zdG5hbWVDYWNoZS5zZXQodXJsLCBob3N0bmFtZSk7XG4gICAgcmV0dXJuIGhvc3RuYW1lO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufTtcbiIsICJpbXBvcnQgeyBHcm91cGluZ1N0cmF0ZWd5LCBTb3J0aW5nU3RyYXRlZ3ksIFRhYkdyb3VwLCBUYWJNZXRhZGF0YSwgQ3VzdG9tU3RyYXRlZ3ksIFN0cmF0ZWd5UnVsZSwgUnVsZUNvbmRpdGlvbiwgR3JvdXBpbmdSdWxlLCBTb3J0aW5nUnVsZSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGdldFN0cmF0ZWdpZXMgfSBmcm9tIFwiLi4vc2hhcmVkL3N0cmF0ZWd5UmVnaXN0cnkuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tIFwiLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5pbXBvcnQgeyBnZXRIb3N0bmFtZSB9IGZyb20gXCIuLi9zaGFyZWQvdXJsQ2FjaGUuanNcIjtcblxubGV0IGN1c3RvbVN0cmF0ZWdpZXM6IEN1c3RvbVN0cmF0ZWd5W10gPSBbXTtcblxuZXhwb3J0IGNvbnN0IHNldEN1c3RvbVN0cmF0ZWdpZXMgPSAoc3RyYXRlZ2llczogQ3VzdG9tU3RyYXRlZ3lbXSkgPT4ge1xuICAgIGN1c3RvbVN0cmF0ZWdpZXMgPSBzdHJhdGVnaWVzO1xufTtcblxuZXhwb3J0IGNvbnN0IGdldEN1c3RvbVN0cmF0ZWdpZXMgPSAoKTogQ3VzdG9tU3RyYXRlZ3lbXSA9PiBjdXN0b21TdHJhdGVnaWVzO1xuXG5jb25zdCBDT0xPUlMgPSBbXCJncmV5XCIsIFwiYmx1ZVwiLCBcInJlZFwiLCBcInllbGxvd1wiLCBcImdyZWVuXCIsIFwicGlua1wiLCBcInB1cnBsZVwiLCBcImN5YW5cIiwgXCJvcmFuZ2VcIl07XG5cbmNvbnN0IHJlZ2V4Q2FjaGUgPSBuZXcgTWFwPHN0cmluZywgUmVnRXhwPigpO1xuXG5leHBvcnQgY29uc3QgZG9tYWluRnJvbVVybCA9ICh1cmw6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGhvc3RuYW1lID0gZ2V0SG9zdG5hbWUodXJsKTtcbiAgaWYgKCFob3N0bmFtZSkgcmV0dXJuIFwidW5rbm93blwiO1xuICByZXR1cm4gaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sIFwiXCIpO1xufTtcblxuZXhwb3J0IGNvbnN0IHN1YmRvbWFpbkZyb21VcmwgPSAodXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBob3N0bmFtZSA9IGdldEhvc3RuYW1lKHVybCk7XG4gIGlmICghaG9zdG5hbWUpIHJldHVybiBcIlwiO1xuXG4gIGNvbnN0IGhvc3QgPSBob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgXCJcIik7XG4gIGNvbnN0IHBhcnRzID0gaG9zdC5zcGxpdCgnLicpO1xuICBpZiAocGFydHMubGVuZ3RoID4gMikge1xuICAgICAgcmV0dXJuIHBhcnRzLnNsaWNlKDAsIHBhcnRzLmxlbmd0aCAtIDIpLmpvaW4oJy4nKTtcbiAgfVxuICByZXR1cm4gXCJcIjtcbn1cblxuY29uc3QgZ2V0TmVzdGVkUHJvcGVydHkgPSAob2JqOiB1bmtub3duLCBwYXRoOiBzdHJpbmcpOiB1bmtub3duID0+IHtcbiAgICBpZiAoIW9iaiB8fCB0eXBlb2Ygb2JqICE9PSAnb2JqZWN0JykgcmV0dXJuIHVuZGVmaW5lZDtcblxuICAgIGlmICghcGF0aC5pbmNsdWRlcygnLicpKSB7XG4gICAgICAgIHJldHVybiAob2JqIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtwYXRoXTtcbiAgICB9XG5cbiAgICBjb25zdCBwYXJ0cyA9IHBhdGguc3BsaXQoJy4nKTtcbiAgICBsZXQgY3VycmVudDogdW5rbm93biA9IG9iajtcblxuICAgIGZvciAoY29uc3Qga2V5IG9mIHBhcnRzKSB7XG4gICAgICAgIGlmICghY3VycmVudCB8fCB0eXBlb2YgY3VycmVudCAhPT0gJ29iamVjdCcpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIGN1cnJlbnQgPSAoY3VycmVudCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilba2V5XTtcbiAgICB9XG5cbiAgICByZXR1cm4gY3VycmVudDtcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRGaWVsZFZhbHVlID0gKHRhYjogVGFiTWV0YWRhdGEsIGZpZWxkOiBzdHJpbmcpOiBhbnkgPT4ge1xuICAgIHN3aXRjaChmaWVsZCkge1xuICAgICAgICBjYXNlICdpZCc6IHJldHVybiB0YWIuaWQ7XG4gICAgICAgIGNhc2UgJ2luZGV4JzogcmV0dXJuIHRhYi5pbmRleDtcbiAgICAgICAgY2FzZSAnd2luZG93SWQnOiByZXR1cm4gdGFiLndpbmRvd0lkO1xuICAgICAgICBjYXNlICdncm91cElkJzogcmV0dXJuIHRhYi5ncm91cElkO1xuICAgICAgICBjYXNlICd0aXRsZSc6IHJldHVybiB0YWIudGl0bGU7XG4gICAgICAgIGNhc2UgJ3VybCc6IHJldHVybiB0YWIudXJsO1xuICAgICAgICBjYXNlICdzdGF0dXMnOiByZXR1cm4gdGFiLnN0YXR1cztcbiAgICAgICAgY2FzZSAnYWN0aXZlJzogcmV0dXJuIHRhYi5hY3RpdmU7XG4gICAgICAgIGNhc2UgJ3NlbGVjdGVkJzogcmV0dXJuIHRhYi5zZWxlY3RlZDtcbiAgICAgICAgY2FzZSAncGlubmVkJzogcmV0dXJuIHRhYi5waW5uZWQ7XG4gICAgICAgIGNhc2UgJ29wZW5lclRhYklkJzogcmV0dXJuIHRhYi5vcGVuZXJUYWJJZDtcbiAgICAgICAgY2FzZSAnbGFzdEFjY2Vzc2VkJzogcmV0dXJuIHRhYi5sYXN0QWNjZXNzZWQ7XG4gICAgICAgIGNhc2UgJ2NvbnRleHQnOiByZXR1cm4gdGFiLmNvbnRleHQ7XG4gICAgICAgIGNhc2UgJ2dlbnJlJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uZ2VucmU7XG4gICAgICAgIGNhc2UgJ3NpdGVOYW1lJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uc2l0ZU5hbWU7XG4gICAgICAgIC8vIERlcml2ZWQgb3IgbWFwcGVkIGZpZWxkc1xuICAgICAgICBjYXNlICdkb21haW4nOiByZXR1cm4gZG9tYWluRnJvbVVybCh0YWIudXJsKTtcbiAgICAgICAgY2FzZSAnc3ViZG9tYWluJzogcmV0dXJuIHN1YmRvbWFpbkZyb21VcmwodGFiLnVybCk7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICByZXR1cm4gZ2V0TmVzdGVkUHJvcGVydHkodGFiLCBmaWVsZCk7XG4gICAgfVxufTtcblxuY29uc3Qgc3RyaXBUbGQgPSAoZG9tYWluOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gZG9tYWluLnJlcGxhY2UoL1xcLihjb218b3JnfGdvdnxuZXR8ZWR1fGlvKSQvaSwgXCJcIik7XG59O1xuXG5leHBvcnQgY29uc3Qgc2VtYW50aWNCdWNrZXQgPSAodGl0bGU6IHN0cmluZywgdXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBrZXkgPSBgJHt0aXRsZX0gJHt1cmx9YC50b0xvd2VyQ2FzZSgpO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiZG9jXCIpIHx8IGtleS5pbmNsdWRlcyhcInJlYWRtZVwiKSB8fCBrZXkuaW5jbHVkZXMoXCJndWlkZVwiKSkgcmV0dXJuIFwiRG9jc1wiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwibWFpbFwiKSB8fCBrZXkuaW5jbHVkZXMoXCJpbmJveFwiKSkgcmV0dXJuIFwiQ2hhdFwiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiZGFzaGJvYXJkXCIpIHx8IGtleS5pbmNsdWRlcyhcImNvbnNvbGVcIikpIHJldHVybiBcIkRhc2hcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImlzc3VlXCIpIHx8IGtleS5pbmNsdWRlcyhcInRpY2tldFwiKSkgcmV0dXJuIFwiVGFza3NcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImRyaXZlXCIpIHx8IGtleS5pbmNsdWRlcyhcInN0b3JhZ2VcIikpIHJldHVybiBcIkZpbGVzXCI7XG4gIHJldHVybiBcIk1pc2NcIjtcbn07XG5cbmV4cG9ydCBjb25zdCBuYXZpZ2F0aW9uS2V5ID0gKHRhYjogVGFiTWV0YWRhdGEpOiBzdHJpbmcgPT4ge1xuICBpZiAodGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gYGNoaWxkLW9mLSR7dGFiLm9wZW5lclRhYklkfWA7XG4gIH1cbiAgcmV0dXJuIGB3aW5kb3ctJHt0YWIud2luZG93SWR9YDtcbn07XG5cbmNvbnN0IGdldFJlY2VuY3lMYWJlbCA9IChsYXN0QWNjZXNzZWQ6IG51bWJlcik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gIGNvbnN0IGRpZmYgPSBub3cgLSBsYXN0QWNjZXNzZWQ7XG4gIGlmIChkaWZmIDwgMzYwMDAwMCkgcmV0dXJuIFwiSnVzdCBub3dcIjsgLy8gMWhcbiAgaWYgKGRpZmYgPCA4NjQwMDAwMCkgcmV0dXJuIFwiVG9kYXlcIjsgLy8gMjRoXG4gIGlmIChkaWZmIDwgMTcyODAwMDAwKSByZXR1cm4gXCJZZXN0ZXJkYXlcIjsgLy8gNDhoXG4gIGlmIChkaWZmIDwgNjA0ODAwMDAwKSByZXR1cm4gXCJUaGlzIFdlZWtcIjsgLy8gN2RcbiAgcmV0dXJuIFwiT2xkZXJcIjtcbn07XG5cbmNvbnN0IGNvbG9yRm9yS2V5ID0gKGtleTogc3RyaW5nLCBvZmZzZXQ6IG51bWJlcik6IHN0cmluZyA9PiBDT0xPUlNbTWF0aC5hYnMoaGFzaENvZGUoa2V5KSArIG9mZnNldCkgJSBDT0xPUlMubGVuZ3RoXTtcblxuY29uc3QgaGFzaENvZGUgPSAodmFsdWU6IHN0cmluZyk6IG51bWJlciA9PiB7XG4gIGxldCBoYXNoID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB2YWx1ZS5sZW5ndGg7IGkgKz0gMSkge1xuICAgIGhhc2ggPSAoaGFzaCA8PCA1KSAtIGhhc2ggKyB2YWx1ZS5jaGFyQ29kZUF0KGkpO1xuICAgIGhhc2ggfD0gMDtcbiAgfVxuICByZXR1cm4gaGFzaDtcbn07XG5cbnR5cGUgTGFiZWxHZW5lcmF0b3IgPSAoZmlyc3RUYWI6IFRhYk1ldGFkYXRhLCB0YWJzOiBUYWJNZXRhZGF0YVtdLCBhbGxUYWJzTWFwOiBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YT4pID0+IHN0cmluZyB8IG51bGw7XG5cbmNvbnN0IGJ1aWx0SW5MYWJlbFN0cmF0ZWdpZXM6IFJlY29yZDxzdHJpbmcsIExhYmVsR2VuZXJhdG9yPiA9IHtcbiAgZG9tYWluOiAoZmlyc3RUYWIsIHRhYnMpID0+IHtcbiAgICBjb25zdCBzaXRlTmFtZXMgPSBuZXcgU2V0KHRhYnMubWFwKHQgPT4gdC5jb250ZXh0RGF0YT8uc2l0ZU5hbWUpLmZpbHRlcihCb29sZWFuKSk7XG4gICAgaWYgKHNpdGVOYW1lcy5zaXplID09PSAxKSB7XG4gICAgICByZXR1cm4gc3RyaXBUbGQoQXJyYXkuZnJvbShzaXRlTmFtZXMpWzBdIGFzIHN0cmluZyk7XG4gICAgfVxuICAgIHJldHVybiBzdHJpcFRsZChkb21haW5Gcm9tVXJsKGZpcnN0VGFiLnVybCkpO1xuICB9LFxuICBkb21haW5fZnVsbDogKGZpcnN0VGFiKSA9PiBkb21haW5Gcm9tVXJsKGZpcnN0VGFiLnVybCksXG4gIHRvcGljOiAoZmlyc3RUYWIpID0+IHNlbWFudGljQnVja2V0KGZpcnN0VGFiLnRpdGxlLCBmaXJzdFRhYi51cmwpLFxuICBsaW5lYWdlOiAoZmlyc3RUYWIsIF90YWJzLCBhbGxUYWJzTWFwKSA9PiB7XG4gICAgaWYgKGZpcnN0VGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGNvbnN0IHBhcmVudCA9IGFsbFRhYnNNYXAuZ2V0KGZpcnN0VGFiLm9wZW5lclRhYklkKTtcbiAgICAgIGlmIChwYXJlbnQpIHtcbiAgICAgICAgY29uc3QgcGFyZW50VGl0bGUgPSBwYXJlbnQudGl0bGUubGVuZ3RoID4gMjAgPyBwYXJlbnQudGl0bGUuc3Vic3RyaW5nKDAsIDIwKSArIFwiLi4uXCIgOiBwYXJlbnQudGl0bGU7XG4gICAgICAgIHJldHVybiBgRnJvbTogJHtwYXJlbnRUaXRsZX1gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGBGcm9tOiBUYWIgJHtmaXJzdFRhYi5vcGVuZXJUYWJJZH1gO1xuICAgIH1cbiAgICByZXR1cm4gYFdpbmRvdyAke2ZpcnN0VGFiLndpbmRvd0lkfWA7XG4gIH0sXG4gIGNvbnRleHQ6IChmaXJzdFRhYikgPT4gZmlyc3RUYWIuY29udGV4dCB8fCBcIlVuY2F0ZWdvcml6ZWRcIixcbiAgcGlubmVkOiAoZmlyc3RUYWIpID0+IGZpcnN0VGFiLnBpbm5lZCA/IFwiUGlubmVkXCIgOiBcIlVucGlubmVkXCIsXG4gIGFnZTogKGZpcnN0VGFiKSA9PiBnZXRSZWNlbmN5TGFiZWwoZmlyc3RUYWIubGFzdEFjY2Vzc2VkID8/IDApLFxuICB1cmw6ICgpID0+IFwiVVJMIEdyb3VwXCIsXG4gIHJlY2VuY3k6ICgpID0+IFwiVGltZSBHcm91cFwiLFxuICBuZXN0aW5nOiAoZmlyc3RUYWIpID0+IGZpcnN0VGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQgPyBcIkNoaWxkcmVuXCIgOiBcIlJvb3RzXCIsXG59O1xuXG4vLyBIZWxwZXIgdG8gZ2V0IGEgaHVtYW4tcmVhZGFibGUgbGFiZWwgY29tcG9uZW50IGZyb20gYSBzdHJhdGVneSBhbmQgYSBzZXQgb2YgdGFic1xuY29uc3QgZ2V0TGFiZWxDb21wb25lbnQgPSAoc3RyYXRlZ3k6IEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcsIHRhYnM6IFRhYk1ldGFkYXRhW10sIGFsbFRhYnNNYXA6IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhPik6IHN0cmluZyB8IG51bGwgPT4ge1xuICBjb25zdCBmaXJzdFRhYiA9IHRhYnNbMF07XG4gIGlmICghZmlyc3RUYWIpIHJldHVybiBcIlVua25vd25cIjtcblxuICAvLyBDaGVjayBjdXN0b20gc3RyYXRlZ2llcyBmaXJzdFxuICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneSk7XG4gIGlmIChjdXN0b20pIHtcbiAgICAgIHJldHVybiBncm91cGluZ0tleShmaXJzdFRhYiwgc3RyYXRlZ3kpO1xuICB9XG5cbiAgY29uc3QgZ2VuZXJhdG9yID0gYnVpbHRJbkxhYmVsU3RyYXRlZ2llc1tzdHJhdGVneV07XG4gIGlmIChnZW5lcmF0b3IpIHtcbiAgICByZXR1cm4gZ2VuZXJhdG9yKGZpcnN0VGFiLCB0YWJzLCBhbGxUYWJzTWFwKTtcbiAgfVxuXG4gIC8vIERlZmF1bHQgZmFsbGJhY2sgZm9yIGdlbmVyaWMgZmllbGRzXG4gIGNvbnN0IHZhbCA9IGdldEZpZWxkVmFsdWUoZmlyc3RUYWIsIHN0cmF0ZWd5KTtcbiAgaWYgKHZhbCAhPT0gdW5kZWZpbmVkICYmIHZhbCAhPT0gbnVsbCkge1xuICAgICAgcmV0dXJuIFN0cmluZyh2YWwpO1xuICB9XG4gIHJldHVybiBcIlVua25vd25cIjtcbn07XG5cbmNvbnN0IGdlbmVyYXRlTGFiZWwgPSAoXG4gIHN0cmF0ZWdpZXM6IChHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nKVtdLFxuICB0YWJzOiBUYWJNZXRhZGF0YVtdLFxuICBhbGxUYWJzTWFwOiBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YT5cbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGxhYmVscyA9IHN0cmF0ZWdpZXNcbiAgICAubWFwKHMgPT4gZ2V0TGFiZWxDb21wb25lbnQocywgdGFicywgYWxsVGFic01hcCkpXG4gICAgLmZpbHRlcihsID0+IGwgJiYgbCAhPT0gXCJVbmtub3duXCIgJiYgbCAhPT0gXCJHcm91cFwiICYmIGwgIT09IFwiVVJMIEdyb3VwXCIgJiYgbCAhPT0gXCJUaW1lIEdyb3VwXCIgJiYgbCAhPT0gXCJNaXNjXCIpO1xuXG4gIGlmIChsYWJlbHMubGVuZ3RoID09PSAwKSByZXR1cm4gXCJHcm91cFwiO1xuICByZXR1cm4gQXJyYXkuZnJvbShuZXcgU2V0KGxhYmVscykpLmpvaW4oXCIgLSBcIik7XG59O1xuXG5jb25zdCBnZXRTdHJhdGVneUNvbG9yUnVsZSA9IChzdHJhdGVneUlkOiBzdHJpbmcpOiBHcm91cGluZ1J1bGUgfCB1bmRlZmluZWQgPT4ge1xuICAgIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5SWQpO1xuICAgIGlmICghY3VzdG9tKSByZXR1cm4gdW5kZWZpbmVkO1xuXG4gICAgY29uc3QgZ3JvdXBpbmdSdWxlc0xpc3QgPSBhc0FycmF5PEdyb3VwaW5nUnVsZT4oY3VzdG9tLmdyb3VwaW5nUnVsZXMpO1xuICAgIC8vIEl0ZXJhdGUgbWFudWFsbHkgdG8gY2hlY2sgY29sb3JcbiAgICBmb3IgKGxldCBpID0gZ3JvdXBpbmdSdWxlc0xpc3QubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgY29uc3QgcnVsZSA9IGdyb3VwaW5nUnVsZXNMaXN0W2ldO1xuICAgICAgICBpZiAocnVsZSAmJiBydWxlLmNvbG9yICYmIHJ1bGUuY29sb3IgIT09ICdyYW5kb20nKSB7XG4gICAgICAgICAgICByZXR1cm4gcnVsZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xufTtcblxuY29uc3QgZ2V0Q29sb3JWYWx1ZUZyb21UYWJzID0gKFxuICB0YWJzOiBUYWJNZXRhZGF0YVtdLFxuICBjb2xvckZpZWxkOiBzdHJpbmcsXG4gIGNvbG9yVHJhbnNmb3JtPzogc3RyaW5nLFxuICBjb2xvclRyYW5zZm9ybVBhdHRlcm4/OiBzdHJpbmdcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGtleXMgPSB0YWJzXG4gICAgLm1hcCgodGFiKSA9PiB7XG4gICAgICBjb25zdCByYXcgPSBnZXRGaWVsZFZhbHVlKHRhYiwgY29sb3JGaWVsZCk7XG4gICAgICBsZXQga2V5ID0gcmF3ICE9PSB1bmRlZmluZWQgJiYgcmF3ICE9PSBudWxsID8gU3RyaW5nKHJhdykgOiBcIlwiO1xuICAgICAgaWYgKGtleSAmJiBjb2xvclRyYW5zZm9ybSkge1xuICAgICAgICBrZXkgPSBhcHBseVZhbHVlVHJhbnNmb3JtKGtleSwgY29sb3JUcmFuc2Zvcm0sIGNvbG9yVHJhbnNmb3JtUGF0dGVybik7XG4gICAgICB9XG4gICAgICByZXR1cm4ga2V5LnRyaW0oKTtcbiAgICB9KVxuICAgIC5maWx0ZXIoQm9vbGVhbik7XG5cbiAgaWYgKGtleXMubGVuZ3RoID09PSAwKSByZXR1cm4gXCJcIjtcblxuICAvLyBNYWtlIGNvbG9yaW5nIHN0YWJsZSBhbmQgaW5kZXBlbmRlbnQgZnJvbSB0YWIgcXVlcnkvb3JkZXIgY2h1cm4uXG4gIHJldHVybiBBcnJheS5mcm9tKG5ldyBTZXQoa2V5cykpLnNvcnQoKS5qb2luKFwifFwiKTtcbn07XG5cbmNvbnN0IHJlc29sdmVXaW5kb3dNb2RlID0gKG1vZGVzOiAoc3RyaW5nIHwgdW5kZWZpbmVkKVtdKTogXCJjdXJyZW50XCIgfCBcIm5ld1wiIHwgXCJjb21wb3VuZFwiID0+IHtcbiAgICBpZiAobW9kZXMuaW5jbHVkZXMoXCJuZXdcIikpIHJldHVybiBcIm5ld1wiO1xuICAgIGlmIChtb2Rlcy5pbmNsdWRlcyhcImNvbXBvdW5kXCIpKSByZXR1cm4gXCJjb21wb3VuZFwiO1xuICAgIHJldHVybiBcImN1cnJlbnRcIjtcbn07XG5cbmV4cG9ydCBjb25zdCBncm91cFRhYnMgPSAoXG4gIHRhYnM6IFRhYk1ldGFkYXRhW10sXG4gIHN0cmF0ZWdpZXM6IChTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmcpW11cbik6IFRhYkdyb3VwW10gPT4ge1xuICBjb25zdCBhdmFpbGFibGVTdHJhdGVnaWVzID0gZ2V0U3RyYXRlZ2llcyhjdXN0b21TdHJhdGVnaWVzKTtcbiAgY29uc3QgZWZmZWN0aXZlU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gYXZhaWxhYmxlU3RyYXRlZ2llcy5maW5kKGF2YWlsID0+IGF2YWlsLmlkID09PSBzKT8uaXNHcm91cGluZyk7XG4gIGNvbnN0IGJ1Y2tldHMgPSBuZXcgTWFwPHN0cmluZywgVGFiR3JvdXA+KCk7XG4gIGNvbnN0IGJ1Y2tldE1ldGEgPSBuZXcgTWFwPHN0cmluZywgeyB2YWx1ZUtleTogc3RyaW5nOyBhcHBsaWVkU3RyYXRlZ2llczogc3RyaW5nW10gfT4oKTtcblxuICBjb25zdCBhbGxUYWJzTWFwID0gbmV3IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhPigpO1xuICB0YWJzLmZvckVhY2godCA9PiBhbGxUYWJzTWFwLnNldCh0LmlkLCB0KSk7XG5cbiAgdGFicy5mb3JFYWNoKCh0YWIpID0+IHtcbiAgICBsZXQga2V5czogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBhcHBsaWVkU3RyYXRlZ2llczogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBjb2xsZWN0ZWRNb2Rlczogc3RyaW5nW10gPSBbXTtcblxuICAgIHRyeSB7XG4gICAgICAgIGZvciAoY29uc3QgcyBvZiBlZmZlY3RpdmVTdHJhdGVnaWVzKSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBnZXRHcm91cGluZ1Jlc3VsdCh0YWIsIHMpO1xuICAgICAgICAgICAgaWYgKHJlc3VsdC5rZXkgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBrZXlzLnB1c2goYCR7c306JHtyZXN1bHQua2V5fWApO1xuICAgICAgICAgICAgICAgIGFwcGxpZWRTdHJhdGVnaWVzLnB1c2gocyk7XG4gICAgICAgICAgICAgICAgY29sbGVjdGVkTW9kZXMucHVzaChyZXN1bHQubW9kZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGxvZ0RlYnVnKFwiRXJyb3IgZ2VuZXJhdGluZyBncm91cGluZyBrZXlcIiwgeyB0YWJJZDogdGFiLmlkLCBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICByZXR1cm47IC8vIFNraXAgdGhpcyB0YWIgb24gZXJyb3JcbiAgICB9XG5cbiAgICAvLyBJZiBubyBzdHJhdGVnaWVzIGFwcGxpZWQgKGUuZy4gYWxsIGZpbHRlcmVkIG91dCksIHNraXAgZ3JvdXBpbmcgZm9yIHRoaXMgdGFiXG4gICAgaWYgKGtleXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBlZmZlY3RpdmVNb2RlID0gcmVzb2x2ZVdpbmRvd01vZGUoY29sbGVjdGVkTW9kZXMpO1xuICAgIGNvbnN0IHZhbHVlS2V5ID0ga2V5cy5qb2luKFwiOjpcIik7XG4gICAgbGV0IGJ1Y2tldEtleSA9IFwiXCI7XG4gICAgaWYgKGVmZmVjdGl2ZU1vZGUgPT09ICdjdXJyZW50Jykge1xuICAgICAgICAgYnVja2V0S2V5ID0gYHdpbmRvdy0ke3RhYi53aW5kb3dJZH06OmAgKyB2YWx1ZUtleTtcbiAgICB9IGVsc2Uge1xuICAgICAgICAgYnVja2V0S2V5ID0gYGdsb2JhbDo6YCArIHZhbHVlS2V5O1xuICAgIH1cblxuICAgIGxldCBncm91cCA9IGJ1Y2tldHMuZ2V0KGJ1Y2tldEtleSk7XG4gICAgaWYgKCFncm91cCkge1xuICAgICAgbGV0IGdyb3VwQ29sb3IgPSBudWxsO1xuICAgICAgbGV0IGNvbG9yRmllbGQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgIGxldCBjb2xvclRyYW5zZm9ybTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgbGV0IGNvbG9yVHJhbnNmb3JtUGF0dGVybjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG4gICAgICBmb3IgKGNvbnN0IHNJZCBvZiBhcHBsaWVkU3RyYXRlZ2llcykge1xuICAgICAgICBjb25zdCBydWxlID0gZ2V0U3RyYXRlZ3lDb2xvclJ1bGUoc0lkKTtcbiAgICAgICAgaWYgKHJ1bGUpIHtcbiAgICAgICAgICAgIGdyb3VwQ29sb3IgPSBydWxlLmNvbG9yO1xuICAgICAgICAgICAgY29sb3JGaWVsZCA9IHJ1bGUuY29sb3JGaWVsZDtcbiAgICAgICAgICAgIGNvbG9yVHJhbnNmb3JtID0gcnVsZS5jb2xvclRyYW5zZm9ybTtcbiAgICAgICAgICAgIGNvbG9yVHJhbnNmb3JtUGF0dGVybiA9IHJ1bGUuY29sb3JUcmFuc2Zvcm1QYXR0ZXJuO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKGdyb3VwQ29sb3IgPT09ICdtYXRjaCcpIHtcbiAgICAgICAgZ3JvdXBDb2xvciA9IGNvbG9yRm9yS2V5KHZhbHVlS2V5LCAwKTtcbiAgICAgIH0gZWxzZSBpZiAoZ3JvdXBDb2xvciA9PT0gJ2ZpZWxkJyAmJiBjb2xvckZpZWxkKSB7XG4gICAgICAgIGNvbnN0IHZhbCA9IGdldEZpZWxkVmFsdWUodGFiLCBjb2xvckZpZWxkKTtcbiAgICAgICAgbGV0IGtleSA9IHZhbCAhPT0gdW5kZWZpbmVkICYmIHZhbCAhPT0gbnVsbCA/IFN0cmluZyh2YWwpIDogXCJcIjtcbiAgICAgICAgaWYgKGNvbG9yVHJhbnNmb3JtKSB7XG4gICAgICAgICAgICBrZXkgPSBhcHBseVZhbHVlVHJhbnNmb3JtKGtleSwgY29sb3JUcmFuc2Zvcm0sIGNvbG9yVHJhbnNmb3JtUGF0dGVybik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoa2V5KSB7XG4gICAgICAgICAgICAgZ3JvdXBDb2xvciA9IGNvbG9yRm9yS2V5KGtleSwgMCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgLy8gRmFsbGJhY2sgdG8gcmFuZG9tL2dyb3VwLWJhc2VkIGNvbG9yIGlmIGtleSBpcyBlbXB0eVxuICAgICAgICAgICAgIGdyb3VwQ29sb3IgPSBjb2xvckZvcktleSh2YWx1ZUtleSwgMCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoIWdyb3VwQ29sb3IgfHwgZ3JvdXBDb2xvciA9PT0gJ2ZpZWxkJykge1xuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkodmFsdWVLZXksIDApO1xuICAgICAgfVxuXG4gICAgICBncm91cCA9IHtcbiAgICAgICAgaWQ6IGJ1Y2tldEtleSxcbiAgICAgICAgd2luZG93SWQ6IHRhYi53aW5kb3dJZCxcbiAgICAgICAgbGFiZWw6IFwiXCIsXG4gICAgICAgIGNvbG9yOiBncm91cENvbG9yLFxuICAgICAgICB0YWJzOiBbXSxcbiAgICAgICAgcmVhc29uOiBhcHBsaWVkU3RyYXRlZ2llcy5qb2luKFwiICsgXCIpLFxuICAgICAgICB3aW5kb3dNb2RlOiBlZmZlY3RpdmVNb2RlXG4gICAgICB9O1xuICAgICAgYnVja2V0cy5zZXQoYnVja2V0S2V5LCBncm91cCk7XG4gICAgICBidWNrZXRNZXRhLnNldChidWNrZXRLZXksIHsgdmFsdWVLZXksIGFwcGxpZWRTdHJhdGVnaWVzOiBbLi4uYXBwbGllZFN0cmF0ZWdpZXNdIH0pO1xuICAgIH1cbiAgICBncm91cC50YWJzLnB1c2godGFiKTtcbiAgfSk7XG5cbiAgY29uc3QgZ3JvdXBzID0gQXJyYXkuZnJvbShidWNrZXRzLnZhbHVlcygpKTtcbiAgZ3JvdXBzLmZvckVhY2goZ3JvdXAgPT4ge1xuICAgIGdyb3VwLmxhYmVsID0gZ2VuZXJhdGVMYWJlbChlZmZlY3RpdmVTdHJhdGVnaWVzLCBncm91cC50YWJzLCBhbGxUYWJzTWFwKTtcblxuICAgIGNvbnN0IG1ldGEgPSBidWNrZXRNZXRhLmdldChncm91cC5pZCk7XG4gICAgaWYgKCFtZXRhKSByZXR1cm47XG5cbiAgICBmb3IgKGNvbnN0IHNJZCBvZiBtZXRhLmFwcGxpZWRTdHJhdGVnaWVzKSB7XG4gICAgICBjb25zdCBydWxlID0gZ2V0U3RyYXRlZ3lDb2xvclJ1bGUoc0lkKTtcbiAgICAgIGlmICghcnVsZSkgY29udGludWU7XG5cbiAgICAgIGlmIChydWxlLmNvbG9yID09PSAnbWF0Y2gnKSB7XG4gICAgICAgIGdyb3VwLmNvbG9yID0gY29sb3JGb3JLZXkobWV0YS52YWx1ZUtleSwgMCk7XG4gICAgICB9IGVsc2UgaWYgKHJ1bGUuY29sb3IgPT09ICdmaWVsZCcgJiYgcnVsZS5jb2xvckZpZWxkKSB7XG4gICAgICAgIGNvbnN0IGNvbG9yVmFsdWUgPSBnZXRDb2xvclZhbHVlRnJvbVRhYnMoZ3JvdXAudGFicywgcnVsZS5jb2xvckZpZWxkLCBydWxlLmNvbG9yVHJhbnNmb3JtLCBydWxlLmNvbG9yVHJhbnNmb3JtUGF0dGVybik7XG4gICAgICAgIGdyb3VwLmNvbG9yID0gY29sb3JGb3JLZXkoY29sb3JWYWx1ZSB8fCBtZXRhLnZhbHVlS2V5LCAwKTtcbiAgICAgIH0gZWxzZSBpZiAocnVsZS5jb2xvcikge1xuICAgICAgICBncm91cC5jb2xvciA9IHJ1bGUuY29sb3I7XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICB9XG4gIH0pO1xuXG4gIHJldHVybiBncm91cHM7XG59O1xuXG5jb25zdCBjaGVja1ZhbHVlTWF0Y2ggPSAoXG4gICAgb3BlcmF0b3I6IHN0cmluZyxcbiAgICByYXdWYWx1ZTogYW55LFxuICAgIHJ1bGVWYWx1ZTogc3RyaW5nXG4pOiB7IGlzTWF0Y2g6IGJvb2xlYW47IG1hdGNoT2JqOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsIH0gPT4ge1xuICAgIGNvbnN0IHZhbHVlU3RyID0gcmF3VmFsdWUgIT09IHVuZGVmaW5lZCAmJiByYXdWYWx1ZSAhPT0gbnVsbCA/IFN0cmluZyhyYXdWYWx1ZSkgOiBcIlwiO1xuICAgIGNvbnN0IHZhbHVlVG9DaGVjayA9IHZhbHVlU3RyLnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3QgcGF0dGVyblRvQ2hlY2sgPSBydWxlVmFsdWUgPyBydWxlVmFsdWUudG9Mb3dlckNhc2UoKSA6IFwiXCI7XG5cbiAgICBsZXQgaXNNYXRjaCA9IGZhbHNlO1xuICAgIGxldCBtYXRjaE9iajogUmVnRXhwRXhlY0FycmF5IHwgbnVsbCA9IG51bGw7XG5cbiAgICBzd2l0Y2ggKG9wZXJhdG9yKSB7XG4gICAgICAgIGNhc2UgJ2NvbnRhaW5zJzogaXNNYXRjaCA9IHZhbHVlVG9DaGVjay5pbmNsdWRlcyhwYXR0ZXJuVG9DaGVjayk7IGJyZWFrO1xuICAgICAgICBjYXNlICdkb2VzTm90Q29udGFpbic6IGlzTWF0Y2ggPSAhdmFsdWVUb0NoZWNrLmluY2x1ZGVzKHBhdHRlcm5Ub0NoZWNrKTsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2VxdWFscyc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2sgPT09IHBhdHRlcm5Ub0NoZWNrOyBicmVhaztcbiAgICAgICAgY2FzZSAnc3RhcnRzV2l0aCc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suc3RhcnRzV2l0aChwYXR0ZXJuVG9DaGVjayk7IGJyZWFrO1xuICAgICAgICBjYXNlICdlbmRzV2l0aCc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suZW5kc1dpdGgocGF0dGVyblRvQ2hlY2spOyBicmVhaztcbiAgICAgICAgY2FzZSAnZXhpc3RzJzogaXNNYXRjaCA9IHJhd1ZhbHVlICE9PSB1bmRlZmluZWQ7IGJyZWFrO1xuICAgICAgICBjYXNlICdkb2VzTm90RXhpc3QnOiBpc01hdGNoID0gcmF3VmFsdWUgPT09IHVuZGVmaW5lZDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2lzTnVsbCc6IGlzTWF0Y2ggPSByYXdWYWx1ZSA9PT0gbnVsbDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2lzTm90TnVsbCc6IGlzTWF0Y2ggPSByYXdWYWx1ZSAhPT0gbnVsbDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ21hdGNoZXMnOlxuICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKHJ1bGVWYWx1ZSwgJ2knKTtcbiAgICAgICAgICAgICAgICBtYXRjaE9iaiA9IHJlZ2V4LmV4ZWModmFsdWVTdHIpO1xuICAgICAgICAgICAgICAgIGlzTWF0Y2ggPSAhIW1hdGNoT2JqO1xuICAgICAgICAgICAgIH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHJldHVybiB7IGlzTWF0Y2gsIG1hdGNoT2JqIH07XG59O1xuXG5leHBvcnQgY29uc3QgY2hlY2tDb25kaXRpb24gPSAoY29uZGl0aW9uOiBSdWxlQ29uZGl0aW9uLCB0YWI6IFRhYk1ldGFkYXRhKTogYm9vbGVhbiA9PiB7XG4gICAgaWYgKCFjb25kaXRpb24pIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCByYXdWYWx1ZSA9IGdldEZpZWxkVmFsdWUodGFiLCBjb25kaXRpb24uZmllbGQpO1xuICAgIGNvbnN0IHsgaXNNYXRjaCB9ID0gY2hlY2tWYWx1ZU1hdGNoKGNvbmRpdGlvbi5vcGVyYXRvciwgcmF3VmFsdWUsIGNvbmRpdGlvbi52YWx1ZSk7XG4gICAgcmV0dXJuIGlzTWF0Y2g7XG59O1xuXG5leHBvcnQgY29uc3QgYXBwbHlWYWx1ZVRyYW5zZm9ybSA9ICh2YWw6IHN0cmluZywgdHJhbnNmb3JtOiBzdHJpbmcsIHBhdHRlcm4/OiBzdHJpbmcsIHJlcGxhY2VtZW50Pzogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICBpZiAoIXZhbCB8fCAhdHJhbnNmb3JtIHx8IHRyYW5zZm9ybSA9PT0gJ25vbmUnKSByZXR1cm4gdmFsO1xuXG4gICAgc3dpdGNoICh0cmFuc2Zvcm0pIHtcbiAgICAgICAgY2FzZSAnc3RyaXBUbGQnOlxuICAgICAgICAgICAgcmV0dXJuIHN0cmlwVGxkKHZhbCk7XG4gICAgICAgIGNhc2UgJ2xvd2VyY2FzZSc6XG4gICAgICAgICAgICByZXR1cm4gdmFsLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGNhc2UgJ3VwcGVyY2FzZSc6XG4gICAgICAgICAgICByZXR1cm4gdmFsLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgIGNhc2UgJ2ZpcnN0Q2hhcic6XG4gICAgICAgICAgICByZXR1cm4gdmFsLmNoYXJBdCgwKTtcbiAgICAgICAgY2FzZSAnZG9tYWluJzpcbiAgICAgICAgICAgIHJldHVybiBkb21haW5Gcm9tVXJsKHZhbCk7XG4gICAgICAgIGNhc2UgJ2hvc3RuYW1lJzpcbiAgICAgICAgICAgIGNvbnN0IGggPSBnZXRIb3N0bmFtZSh2YWwpO1xuICAgICAgICAgICAgcmV0dXJuIGggIT09IG51bGwgPyBoIDogdmFsO1xuICAgICAgICBjYXNlICdyZWdleCc6XG4gICAgICAgICAgICBpZiAocGF0dGVybikge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCByZWdleCA9IHJlZ2V4Q2FjaGUuZ2V0KHBhdHRlcm4pO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXJlZ2V4KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWdleCA9IG5ldyBSZWdFeHAocGF0dGVybik7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWdleENhY2hlLnNldChwYXR0ZXJuLCByZWdleCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbWF0Y2ggPSByZWdleC5leGVjKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGV4dHJhY3RlZCA9IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IG1hdGNoLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXh0cmFjdGVkICs9IG1hdGNoW2ldIHx8IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZXh0cmFjdGVkO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgIGxvZ0RlYnVnKFwiSW52YWxpZCByZWdleCBpbiB0cmFuc2Zvcm1cIiwgeyBwYXR0ZXJuOiBwYXR0ZXJuLCBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICAgICAgfVxuICAgICAgICBjYXNlICdyZWdleFJlcGxhY2UnOlxuICAgICAgICAgICAgIGlmIChwYXR0ZXJuKSB7XG4gICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAvLyBVc2luZyAnZycgZ2xvYmFsIGZsYWcgYnkgZGVmYXVsdCBmb3IgcmVwbGFjZW1lbnRcbiAgICAgICAgICAgICAgICAgICAgIHJldHVybiB2YWwucmVwbGFjZShuZXcgUmVnRXhwKHBhdHRlcm4sICdnJyksIHJlcGxhY2VtZW50IHx8IFwiXCIpO1xuICAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkludmFsaWQgcmVnZXggaW4gdHJhbnNmb3JtXCIsIHsgcGF0dGVybjogcGF0dGVybiwgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICAgICAgICAgICAgIHJldHVybiB2YWw7XG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgcmV0dXJuIHZhbDtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHJldHVybiB2YWw7XG4gICAgfVxufTtcblxuLyoqXG4gKiBFdmFsdWF0ZXMgbGVnYWN5IHJ1bGVzIChzaW1wbGUgQU5EL09SIGNvbmRpdGlvbnMgd2l0aG91dCBncm91cGluZy9maWx0ZXIgc2VwYXJhdGlvbikuXG4gKiBAZGVwcmVjYXRlZCBUaGlzIGxvZ2ljIGlzIGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5IHdpdGggb2xkIGN1c3RvbSBzdHJhdGVnaWVzLlxuICovXG5mdW5jdGlvbiBldmFsdWF0ZUxlZ2FjeVJ1bGVzKGxlZ2FjeVJ1bGVzOiBTdHJhdGVneVJ1bGVbXSwgdGFiOiBUYWJNZXRhZGF0YSk6IHN0cmluZyB8IG51bGwge1xuICAgIGNvbnN0IGxlZ2FjeVJ1bGVzTGlzdCA9IGFzQXJyYXk8U3RyYXRlZ3lSdWxlPihsZWdhY3lSdWxlcyk7XG4gICAgaWYgKGxlZ2FjeVJ1bGVzTGlzdC5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGxlZ2FjeVJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IHJhd1ZhbHVlID0gZ2V0RmllbGRWYWx1ZSh0YWIsIHJ1bGUuZmllbGQpO1xuICAgICAgICAgICAgY29uc3QgeyBpc01hdGNoLCBtYXRjaE9iaiB9ID0gY2hlY2tWYWx1ZU1hdGNoKHJ1bGUub3BlcmF0b3IsIHJhd1ZhbHVlLCBydWxlLnZhbHVlKTtcblxuICAgICAgICAgICAgaWYgKGlzTWF0Y2gpIHtcbiAgICAgICAgICAgICAgICBsZXQgcmVzdWx0ID0gcnVsZS5yZXN1bHQ7XG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoT2JqICYmIG1hdGNoT2JqLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBtYXRjaE9iai5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKG5ldyBSZWdFeHAoYFxcXFwkJHtpfWAsICdnJyksIG1hdGNoT2JqW2ldIHx8IFwiXCIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGV2YWx1YXRpbmcgbGVnYWN5IHJ1bGVzXCIsIHsgZXJyb3I6IFN0cmluZyhlcnJvcikgfSk7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgY29uc3QgZ2V0R3JvdXBpbmdSZXN1bHQgPSAodGFiOiBUYWJNZXRhZGF0YSwgc3RyYXRlZ3k6IEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcpOiB7IGtleTogc3RyaW5nIHwgbnVsbCwgbW9kZTogXCJjdXJyZW50XCIgfCBcIm5ld1wiIHwgXCJjb21wb3VuZFwiIH0gPT4ge1xuICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneSk7XG4gIGlmIChjdXN0b20pIHtcbiAgICAgIGNvbnN0IGZpbHRlckdyb3Vwc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb25bXT4oY3VzdG9tLmZpbHRlckdyb3Vwcyk7XG4gICAgICBjb25zdCBmaWx0ZXJzTGlzdCA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbj4oY3VzdG9tLmZpbHRlcnMpO1xuXG4gICAgICBsZXQgbWF0Y2ggPSBmYWxzZTtcblxuICAgICAgaWYgKGZpbHRlckdyb3Vwc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIC8vIE9SIGxvZ2ljXG4gICAgICAgICAgZm9yIChjb25zdCBncm91cCBvZiBmaWx0ZXJHcm91cHNMaXN0KSB7XG4gICAgICAgICAgICAgIGNvbnN0IGdyb3VwUnVsZXMgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGdyb3VwKTtcbiAgICAgICAgICAgICAgaWYgKGdyb3VwUnVsZXMubGVuZ3RoID09PSAwIHx8IGdyb3VwUnVsZXMuZXZlcnkociA9PiBjaGVja0NvbmRpdGlvbihyLCB0YWIpKSkge1xuICAgICAgICAgICAgICAgICAgbWF0Y2ggPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGZpbHRlcnNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAvLyBMZWdhY3kvU2ltcGxlIEFORCBsb2dpY1xuICAgICAgICAgIGlmIChmaWx0ZXJzTGlzdC5ldmVyeShmID0+IGNoZWNrQ29uZGl0aW9uKGYsIHRhYikpKSB7XG4gICAgICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIE5vIGZpbHRlcnMgLT4gTWF0Y2ggYWxsXG4gICAgICAgICAgbWF0Y2ggPSB0cnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoIW1hdGNoKSB7XG4gICAgICAgICAgcmV0dXJuIHsga2V5OiBudWxsLCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICAgICAgfVxuXG4gICAgICBjb25zdCBncm91cGluZ1J1bGVzTGlzdCA9IGFzQXJyYXk8R3JvdXBpbmdSdWxlPihjdXN0b20uZ3JvdXBpbmdSdWxlcyk7XG4gICAgICBpZiAoZ3JvdXBpbmdSdWxlc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgIGNvbnN0IG1vZGVzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZ3JvdXBpbmdSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXJ1bGUpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIGxldCB2YWwgPSBcIlwiO1xuICAgICAgICAgICAgICAgIGlmIChydWxlLnNvdXJjZSA9PT0gJ2ZpZWxkJykge1xuICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmF3ID0gZ2V0RmllbGRWYWx1ZSh0YWIsIHJ1bGUudmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgdmFsID0gcmF3ICE9PSB1bmRlZmluZWQgJiYgcmF3ICE9PSBudWxsID8gU3RyaW5nKHJhdykgOiBcIlwiO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICB2YWwgPSBydWxlLnZhbHVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh2YWwgJiYgcnVsZS50cmFuc2Zvcm0gJiYgcnVsZS50cmFuc2Zvcm0gIT09ICdub25lJykge1xuICAgICAgICAgICAgICAgICAgICB2YWwgPSBhcHBseVZhbHVlVHJhbnNmb3JtKHZhbCwgcnVsZS50cmFuc2Zvcm0sIHJ1bGUudHJhbnNmb3JtUGF0dGVybiwgcnVsZS50cmFuc2Zvcm1SZXBsYWNlbWVudCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHZhbCkge1xuICAgICAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChydWxlLndpbmRvd01vZGUpIG1vZGVzLnB1c2gocnVsZS53aW5kb3dNb2RlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgIGxvZ0RlYnVnKFwiRXJyb3IgYXBwbHlpbmcgZ3JvdXBpbmcgcnVsZXNcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIHJldHVybiB7IGtleTogcGFydHMuam9pbihcIiAtIFwiKSwgbW9kZTogcmVzb2x2ZVdpbmRvd01vZGUobW9kZXMpIH07XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7IGtleTogY3VzdG9tLmZhbGxiYWNrIHx8IFwiTWlzY1wiLCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICAgICAgfSBlbHNlIGlmIChjdXN0b20ucnVsZXMpIHtcbiAgICAgICAgICBjb25zdCByZXN1bHQgPSBldmFsdWF0ZUxlZ2FjeVJ1bGVzKGFzQXJyYXk8U3RyYXRlZ3lSdWxlPihjdXN0b20ucnVsZXMpLCB0YWIpO1xuICAgICAgICAgIGlmIChyZXN1bHQpIHJldHVybiB7IGtleTogcmVzdWx0LCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICAgICAgfVxuXG4gICAgICByZXR1cm4geyBrZXk6IGN1c3RvbS5mYWxsYmFjayB8fCBcIk1pc2NcIiwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgfVxuXG4gIC8vIEJ1aWx0LWluIHN0cmF0ZWdpZXNcbiAgbGV0IHNpbXBsZUtleTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIHN3aXRjaCAoc3RyYXRlZ3kpIHtcbiAgICBjYXNlIFwiZG9tYWluXCI6XG4gICAgY2FzZSBcImRvbWFpbl9mdWxsXCI6XG4gICAgICBzaW1wbGVLZXkgPSBkb21haW5Gcm9tVXJsKHRhYi51cmwpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInRvcGljXCI6XG4gICAgICBzaW1wbGVLZXkgPSBzZW1hbnRpY0J1Y2tldCh0YWIudGl0bGUsIHRhYi51cmwpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcImxpbmVhZ2VcIjpcbiAgICAgIHNpbXBsZUtleSA9IG5hdmlnYXRpb25LZXkodGFiKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJjb250ZXh0XCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIuY29udGV4dCB8fCBcIlVuY2F0ZWdvcml6ZWRcIjtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJwaW5uZWRcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi5waW5uZWQgPyBcInBpbm5lZFwiIDogXCJ1bnBpbm5lZFwiO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcImFnZVwiOlxuICAgICAgc2ltcGxlS2V5ID0gZ2V0UmVjZW5jeUxhYmVsKHRhYi5sYXN0QWNjZXNzZWQgPz8gMCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwidXJsXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIudXJsO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInRpdGxlXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIudGl0bGU7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwicmVjZW5jeVwiOlxuICAgICAgc2ltcGxlS2V5ID0gU3RyaW5nKHRhYi5sYXN0QWNjZXNzZWQgPz8gMCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwibmVzdGluZ1wiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQgPyBcImNoaWxkXCIgOiBcInJvb3RcIjtcbiAgICAgIGJyZWFrO1xuICAgIGRlZmF1bHQ6XG4gICAgICAgIGNvbnN0IHZhbCA9IGdldEZpZWxkVmFsdWUodGFiLCBzdHJhdGVneSk7XG4gICAgICAgIGlmICh2YWwgIT09IHVuZGVmaW5lZCAmJiB2YWwgIT09IG51bGwpIHtcbiAgICAgICAgICAgIHNpbXBsZUtleSA9IFN0cmluZyh2YWwpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2ltcGxlS2V5ID0gXCJVbmtub3duXCI7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gIH1cbiAgcmV0dXJuIHsga2V5OiBzaW1wbGVLZXksIG1vZGU6IFwiY3VycmVudFwiIH07XG59O1xuXG5leHBvcnQgY29uc3QgZ3JvdXBpbmdLZXkgPSAodGFiOiBUYWJNZXRhZGF0YSwgc3RyYXRlZ3k6IEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcpOiBzdHJpbmcgfCBudWxsID0+IHtcbiAgICByZXR1cm4gZ2V0R3JvdXBpbmdSZXN1bHQodGFiLCBzdHJhdGVneSkua2V5O1xufTtcblxuZnVuY3Rpb24gaXNDb250ZXh0RmllbGQoZmllbGQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBmaWVsZCA9PT0gJ2NvbnRleHQnIHx8IGZpZWxkID09PSAnZ2VucmUnIHx8IGZpZWxkID09PSAnc2l0ZU5hbWUnIHx8IGZpZWxkLnN0YXJ0c1dpdGgoJ2NvbnRleHREYXRhLicpO1xufVxuXG5leHBvcnQgY29uc3QgcmVxdWlyZXNDb250ZXh0QW5hbHlzaXMgPSAoc3RyYXRlZ3lJZHM6IChzdHJpbmcgfCBTb3J0aW5nU3RyYXRlZ3kpW10pOiBib29sZWFuID0+IHtcbiAgICAvLyBDaGVjayBpZiBcImNvbnRleHRcIiBzdHJhdGVneSBpcyBleHBsaWNpdGx5IHJlcXVlc3RlZFxuICAgIGlmIChzdHJhdGVneUlkcy5pbmNsdWRlcyhcImNvbnRleHRcIikpIHJldHVybiB0cnVlO1xuXG4gICAgY29uc3Qgc3RyYXRlZ2llcyA9IGdldFN0cmF0ZWdpZXMoY3VzdG9tU3RyYXRlZ2llcyk7XG4gICAgLy8gZmlsdGVyIG9ubHkgdGhvc2UgdGhhdCBtYXRjaCB0aGUgcmVxdWVzdGVkIElEc1xuICAgIGNvbnN0IGFjdGl2ZURlZnMgPSBzdHJhdGVnaWVzLmZpbHRlcihzID0+IHN0cmF0ZWd5SWRzLmluY2x1ZGVzKHMuaWQpKTtcblxuICAgIGZvciAoY29uc3QgZGVmIG9mIGFjdGl2ZURlZnMpIHtcbiAgICAgICAgLy8gSWYgaXQncyBhIGJ1aWx0LWluIHN0cmF0ZWd5IHRoYXQgbmVlZHMgY29udGV4dCAob25seSAnY29udGV4dCcgZG9lcylcbiAgICAgICAgaWYgKGRlZi5pZCA9PT0gJ2NvbnRleHQnKSByZXR1cm4gdHJ1ZTtcblxuICAgICAgICAvLyBJZiBpdCBpcyBhIGN1c3RvbSBzdHJhdGVneSAob3Igb3ZlcnJpZGVzIGJ1aWx0LWluKSwgY2hlY2sgaXRzIHJ1bGVzXG4gICAgICAgIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChjID0+IGMuaWQgPT09IGRlZi5pZCk7XG4gICAgICAgIGlmIChjdXN0b20pIHtcbiAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzTGlzdCA9IGFzQXJyYXk8R3JvdXBpbmdSdWxlPihjdXN0b20uZ3JvdXBpbmdSdWxlcyk7XG4gICAgICAgICAgICAgY29uc3Qgc29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KGN1c3RvbS5zb3J0aW5nUnVsZXMpO1xuICAgICAgICAgICAgIGNvbnN0IGdyb3VwU29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KGN1c3RvbS5ncm91cFNvcnRpbmdSdWxlcyk7XG4gICAgICAgICAgICAgY29uc3QgZmlsdGVyc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGN1c3RvbS5maWx0ZXJzKTtcbiAgICAgICAgICAgICBjb25zdCBmaWx0ZXJHcm91cHNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uW10+KGN1c3RvbS5maWx0ZXJHcm91cHMpO1xuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwUnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIHJ1bGUuc291cmNlID09PSAnZmllbGQnICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUudmFsdWUpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgcnVsZS5jb2xvciA9PT0gJ2ZpZWxkJyAmJiBydWxlLmNvbG9yRmllbGQgJiYgaXNDb250ZXh0RmllbGQocnVsZS5jb2xvckZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIHNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBmaWx0ZXJzTGlzdCkge1xuICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBpc0NvbnRleHRGaWVsZChydWxlLmZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBncm91cCBvZiBmaWx0ZXJHcm91cHNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGNvbnN0IGdyb3VwUnVsZXMgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGdyb3VwKTtcbiAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwUnVsZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59O1xuIiwgImltcG9ydCB7IFNvcnRpbmdTdHJhdGVneSwgVGFiTWV0YWRhdGEsIEN1c3RvbVN0cmF0ZWd5LCBTb3J0aW5nUnVsZSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGRvbWFpbkZyb21VcmwsIHNlbWFudGljQnVja2V0LCBuYXZpZ2F0aW9uS2V5LCBncm91cGluZ0tleSwgZ2V0RmllbGRWYWx1ZSwgZ2V0Q3VzdG9tU3RyYXRlZ2llcyB9IGZyb20gXCIuL2dyb3VwaW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcblxuLy8gSGVscGVyIHNjb3Jlc1xuZXhwb3J0IGNvbnN0IHJlY2VuY3lTY29yZSA9ICh0YWI6IFRhYk1ldGFkYXRhKSA9PiB0YWIubGFzdEFjY2Vzc2VkID8/IDA7XG5leHBvcnQgY29uc3QgaGllcmFyY2h5U2NvcmUgPSAodGFiOiBUYWJNZXRhZGF0YSkgPT4gKHRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkID8gMSA6IDApO1xuZXhwb3J0IGNvbnN0IHBpbm5lZFNjb3JlID0gKHRhYjogVGFiTWV0YWRhdGEpID0+ICh0YWIucGlubmVkID8gMCA6IDEpO1xuXG5leHBvcnQgY29uc3QgY29tcGFyZVZhbHVlcyA9IChhOiBhbnksIGI6IGFueSwgb3JkZXI6ICdhc2MnIHwgJ2Rlc2MnID0gJ2FzYycpOiBudW1iZXIgPT4ge1xuICAgIC8vIFRyZWF0IHVuZGVmaW5lZC9udWxsIGFzIFwiZ3JlYXRlclwiIHRoYW4gZXZlcnl0aGluZyBlbHNlIChwdXNoZWQgdG8gZW5kIGluIGFzYylcbiAgICBjb25zdCBpc0FOdWxsID0gYSA9PT0gdW5kZWZpbmVkIHx8IGEgPT09IG51bGw7XG4gICAgY29uc3QgaXNCTnVsbCA9IGIgPT09IHVuZGVmaW5lZCB8fCBiID09PSBudWxsO1xuXG4gICAgaWYgKGlzQU51bGwgJiYgaXNCTnVsbCkgcmV0dXJuIDA7XG4gICAgaWYgKGlzQU51bGwpIHJldHVybiAxOyAvLyBhID4gYiAoYSBpcyBudWxsKVxuICAgIGlmIChpc0JOdWxsKSByZXR1cm4gLTE7IC8vIGIgPiBhIChiIGlzIG51bGwpIC0+IGEgPCBiXG5cbiAgICBsZXQgcmVzdWx0ID0gMDtcbiAgICBpZiAoYSA8IGIpIHJlc3VsdCA9IC0xO1xuICAgIGVsc2UgaWYgKGEgPiBiKSByZXN1bHQgPSAxO1xuXG4gICAgcmV0dXJuIG9yZGVyID09PSAnZGVzYycgPyAtcmVzdWx0IDogcmVzdWx0O1xufTtcblxuZXhwb3J0IGNvbnN0IGNvbXBhcmVCeVNvcnRpbmdSdWxlcyA9IChydWxlczogU29ydGluZ1J1bGVbXSwgYTogVGFiTWV0YWRhdGEsIGI6IFRhYk1ldGFkYXRhKTogbnVtYmVyID0+IHtcbiAgICBjb25zdCBzb3J0UnVsZXNMaXN0ID0gYXNBcnJheTxTb3J0aW5nUnVsZT4ocnVsZXMpO1xuICAgIGlmIChzb3J0UnVsZXNMaXN0Lmxlbmd0aCA9PT0gMCkgcmV0dXJuIDA7XG5cbiAgICB0cnkge1xuICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2Ygc29ydFJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IHZhbEEgPSBnZXRGaWVsZFZhbHVlKGEsIHJ1bGUuZmllbGQpO1xuICAgICAgICAgICAgY29uc3QgdmFsQiA9IGdldEZpZWxkVmFsdWUoYiwgcnVsZS5maWVsZCk7XG5cbiAgICAgICAgICAgIGNvbnN0IGRpZmYgPSBjb21wYXJlVmFsdWVzKHZhbEEsIHZhbEIsIHJ1bGUub3JkZXIgfHwgJ2FzYycpO1xuICAgICAgICAgICAgaWYgKGRpZmYgIT09IDApIHJldHVybiBkaWZmO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGV2YWx1YXRpbmcgc29ydGluZyBydWxlc1wiLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgfVxuICAgIHJldHVybiAwO1xufTtcblxudHlwZSBDb21wYXJhdG9yID0gKGE6IFRhYk1ldGFkYXRhLCBiOiBUYWJNZXRhZGF0YSkgPT4gbnVtYmVyO1xuXG4vLyAtLS0gQnVpbHQtaW4gQ29tcGFyYXRvcnMgLS0tXG5cbmNvbnN0IGNvbXBhcmVSZWNlbmN5OiBDb21wYXJhdG9yID0gKGEsIGIpID0+IChiLmxhc3RBY2Nlc3NlZCA/PyAwKSAtIChhLmxhc3RBY2Nlc3NlZCA/PyAwKTtcbmNvbnN0IGNvbXBhcmVOZXN0aW5nOiBDb21wYXJhdG9yID0gKGEsIGIpID0+IGhpZXJhcmNoeVNjb3JlKGEpIC0gaGllcmFyY2h5U2NvcmUoYik7XG5jb25zdCBjb21wYXJlUGlubmVkOiBDb21wYXJhdG9yID0gKGEsIGIpID0+IHBpbm5lZFNjb3JlKGEpIC0gcGlubmVkU2NvcmUoYik7XG5jb25zdCBjb21wYXJlVGl0bGU6IENvbXBhcmF0b3IgPSAoYSwgYikgPT4gYS50aXRsZS5sb2NhbGVDb21wYXJlKGIudGl0bGUpO1xuY29uc3QgY29tcGFyZVVybDogQ29tcGFyYXRvciA9IChhLCBiKSA9PiBhLnVybC5sb2NhbGVDb21wYXJlKGIudXJsKTtcbmNvbnN0IGNvbXBhcmVDb250ZXh0OiBDb21wYXJhdG9yID0gKGEsIGIpID0+IChhLmNvbnRleHQgPz8gXCJcIikubG9jYWxlQ29tcGFyZShiLmNvbnRleHQgPz8gXCJcIik7XG5jb25zdCBjb21wYXJlRG9tYWluOiBDb21wYXJhdG9yID0gKGEsIGIpID0+IGRvbWFpbkZyb21VcmwoYS51cmwpLmxvY2FsZUNvbXBhcmUoZG9tYWluRnJvbVVybChiLnVybCkpO1xuY29uc3QgY29tcGFyZVRvcGljOiBDb21wYXJhdG9yID0gKGEsIGIpID0+IHNlbWFudGljQnVja2V0KGEudGl0bGUsIGEudXJsKS5sb2NhbGVDb21wYXJlKHNlbWFudGljQnVja2V0KGIudGl0bGUsIGIudXJsKSk7XG5jb25zdCBjb21wYXJlTGluZWFnZTogQ29tcGFyYXRvciA9IChhLCBiKSA9PiBuYXZpZ2F0aW9uS2V5KGEpLmxvY2FsZUNvbXBhcmUobmF2aWdhdGlvbktleShiKSk7XG5jb25zdCBjb21wYXJlQWdlOiBDb21wYXJhdG9yID0gKGEsIGIpID0+IChncm91cGluZ0tleShhLCBcImFnZVwiKSB8fCBcIlwiKS5sb2NhbGVDb21wYXJlKGdyb3VwaW5nS2V5KGIsIFwiYWdlXCIpIHx8IFwiXCIpO1xuXG5jb25zdCBzdHJhdGVneVJlZ2lzdHJ5OiBSZWNvcmQ8c3RyaW5nLCBDb21wYXJhdG9yPiA9IHtcbiAgcmVjZW5jeTogY29tcGFyZVJlY2VuY3ksXG4gIG5lc3Rpbmc6IGNvbXBhcmVOZXN0aW5nLFxuICBwaW5uZWQ6IGNvbXBhcmVQaW5uZWQsXG4gIHRpdGxlOiBjb21wYXJlVGl0bGUsXG4gIHVybDogY29tcGFyZVVybCxcbiAgY29udGV4dDogY29tcGFyZUNvbnRleHQsXG4gIGRvbWFpbjogY29tcGFyZURvbWFpbixcbiAgZG9tYWluX2Z1bGw6IGNvbXBhcmVEb21haW4sXG4gIHRvcGljOiBjb21wYXJlVG9waWMsXG4gIGxpbmVhZ2U6IGNvbXBhcmVMaW5lYWdlLFxuICBhZ2U6IGNvbXBhcmVBZ2UsXG59O1xuXG4vLyAtLS0gQ3VzdG9tIFN0cmF0ZWd5IEV2YWx1YXRpb24gLS0tXG5cbmNvbnN0IGV2YWx1YXRlQ3VzdG9tU3RyYXRlZ3kgPSAoc3RyYXRlZ3k6IHN0cmluZywgYTogVGFiTWV0YWRhdGEsIGI6IFRhYk1ldGFkYXRhKTogbnVtYmVyIHwgbnVsbCA9PiB7XG4gIGNvbnN0IGN1c3RvbVN0cmF0cyA9IGdldEN1c3RvbVN0cmF0ZWdpZXMoKTtcbiAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneSk7XG5cbiAgaWYgKCFjdXN0b20pIHJldHVybiBudWxsO1xuXG4gIGNvbnN0IHNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihjdXN0b20uc29ydGluZ1J1bGVzKTtcbiAgaWYgKHNvcnRSdWxlc0xpc3QubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcblxuICByZXR1cm4gY29tcGFyZUJ5U29ydGluZ1J1bGVzKHNvcnRSdWxlc0xpc3QsIGEsIGIpO1xufTtcblxuLy8gLS0tIEdlbmVyaWMgRmFsbGJhY2sgLS0tXG5cbmNvbnN0IGV2YWx1YXRlR2VuZXJpY1N0cmF0ZWd5ID0gKHN0cmF0ZWd5OiBzdHJpbmcsIGE6IFRhYk1ldGFkYXRhLCBiOiBUYWJNZXRhZGF0YSk6IG51bWJlciA9PiB7XG4gICAgLy8gQ2hlY2sgaWYgaXQncyBhIGdlbmVyaWMgZmllbGQgZmlyc3RcbiAgICBjb25zdCB2YWxBID0gZ2V0RmllbGRWYWx1ZShhLCBzdHJhdGVneSk7XG4gICAgY29uc3QgdmFsQiA9IGdldEZpZWxkVmFsdWUoYiwgc3RyYXRlZ3kpO1xuXG4gICAgaWYgKHZhbEEgIT09IHVuZGVmaW5lZCAmJiB2YWxCICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgaWYgKHZhbEEgPCB2YWxCKSByZXR1cm4gLTE7XG4gICAgICAgIGlmICh2YWxBID4gdmFsQikgcmV0dXJuIDE7XG4gICAgICAgIHJldHVybiAwO1xuICAgIH1cblxuICAgIC8vIEZhbGxiYWNrIGZvciBjdXN0b20gc3RyYXRlZ2llcyBncm91cGluZyBrZXkgKGlmIHVzaW5nIGN1c3RvbSBzdHJhdGVneSBhcyBzb3J0aW5nIGJ1dCBubyBzb3J0aW5nIHJ1bGVzIGRlZmluZWQpXG4gICAgLy8gb3IgdW5oYW5kbGVkIGJ1aWx0LWluc1xuICAgIHJldHVybiAoZ3JvdXBpbmdLZXkoYSwgc3RyYXRlZ3kpIHx8IFwiXCIpLmxvY2FsZUNvbXBhcmUoZ3JvdXBpbmdLZXkoYiwgc3RyYXRlZ3kpIHx8IFwiXCIpO1xufTtcblxuLy8gLS0tIE1haW4gRXhwb3J0IC0tLVxuXG5leHBvcnQgY29uc3QgY29tcGFyZUJ5ID0gKHN0cmF0ZWd5OiBTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmcsIGE6IFRhYk1ldGFkYXRhLCBiOiBUYWJNZXRhZGF0YSk6IG51bWJlciA9PiB7XG4gIC8vIDEuIEN1c3RvbSBTdHJhdGVneSAodGFrZXMgcHJlY2VkZW5jZSBpZiBydWxlcyBleGlzdClcbiAgY29uc3QgY3VzdG9tRGlmZiA9IGV2YWx1YXRlQ3VzdG9tU3RyYXRlZ3koc3RyYXRlZ3ksIGEsIGIpO1xuICBpZiAoY3VzdG9tRGlmZiAhPT0gbnVsbCkge1xuICAgICAgcmV0dXJuIGN1c3RvbURpZmY7XG4gIH1cblxuICAvLyAyLiBCdWlsdC1pbiByZWdpc3RyeVxuICBjb25zdCBidWlsdEluID0gc3RyYXRlZ3lSZWdpc3RyeVtzdHJhdGVneV07XG4gIGlmIChidWlsdEluKSB7XG4gICAgcmV0dXJuIGJ1aWx0SW4oYSwgYik7XG4gIH1cblxuICAvLyAzLiBHZW5lcmljL0ZhbGxiYWNrXG4gIHJldHVybiBldmFsdWF0ZUdlbmVyaWNTdHJhdGVneShzdHJhdGVneSwgYSwgYik7XG59O1xuXG5leHBvcnQgY29uc3Qgc29ydFRhYnMgPSAodGFiczogVGFiTWV0YWRhdGFbXSwgc3RyYXRlZ2llczogU29ydGluZ1N0cmF0ZWd5W10pOiBUYWJNZXRhZGF0YVtdID0+IHtcbiAgY29uc3Qgc2NvcmluZzogU29ydGluZ1N0cmF0ZWd5W10gPSBzdHJhdGVnaWVzLmxlbmd0aCA/IHN0cmF0ZWdpZXMgOiBbXCJwaW5uZWRcIiwgXCJyZWNlbmN5XCJdO1xuICByZXR1cm4gWy4uLnRhYnNdLnNvcnQoKGEsIGIpID0+IHtcbiAgICBmb3IgKGNvbnN0IHN0cmF0ZWd5IG9mIHNjb3JpbmcpIHtcbiAgICAgIGNvbnN0IGRpZmYgPSBjb21wYXJlQnkoc3RyYXRlZ3ksIGEsIGIpO1xuICAgICAgaWYgKGRpZmYgIT09IDApIHJldHVybiBkaWZmO1xuICAgIH1cbiAgICByZXR1cm4gYS5pZCAtIGIuaWQ7XG4gIH0pO1xufTtcbiIsICIvLyBsb2dpYy50c1xuLy8gUHVyZSBmdW5jdGlvbnMgZm9yIGV4dHJhY3Rpb24gbG9naWNcblxuY29uc3QgVFJBQ0tJTkdfUEFSQU1TID0gW1xuICAvXnV0bV8vLFxuICAvXmZiY2xpZCQvLFxuICAvXmdjbGlkJC8sXG4gIC9eX2dhJC8sXG4gIC9ecmVmJC8sXG4gIC9eeWNsaWQkLyxcbiAgL15faHMvXG5dO1xuXG5jb25zdCBET01BSU5fQUxMT1dMSVNUUzogUmVjb3JkPHN0cmluZywgc3RyaW5nW10+ID0ge1xuICAneW91dHViZS5jb20nOiBbJ3YnLCAnbGlzdCcsICd0JywgJ2MnLCAnY2hhbm5lbCcsICdwbGF5bGlzdCddLFxuICAneW91dHUuYmUnOiBbJ3YnLCAnbGlzdCcsICd0JywgJ2MnLCAnY2hhbm5lbCcsICdwbGF5bGlzdCddLFxuICAnZ29vZ2xlLmNvbSc6IFsncScsICdpZCcsICdzb3VyY2VpZCddXG59O1xuXG5mdW5jdGlvbiBnZXRBbGxvd2VkUGFyYW1zKGhvc3RuYW1lOiBzdHJpbmcpOiBzdHJpbmdbXSB8IG51bGwge1xuICBpZiAoRE9NQUlOX0FMTE9XTElTVFNbaG9zdG5hbWVdKSByZXR1cm4gRE9NQUlOX0FMTE9XTElTVFNbaG9zdG5hbWVdO1xuICBmb3IgKGNvbnN0IGRvbWFpbiBpbiBET01BSU5fQUxMT1dMSVNUUykge1xuICAgIGlmIChob3N0bmFtZS5lbmRzV2l0aCgnLicgKyBkb21haW4pKSByZXR1cm4gRE9NQUlOX0FMTE9XTElTVFNbZG9tYWluXTtcbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZVVybCh1cmxTdHI6IHN0cmluZyk6IHN0cmluZyB7XG4gIHRyeSB7XG4gICAgY29uc3QgdXJsID0gbmV3IFVSTCh1cmxTdHIpO1xuICAgIGNvbnN0IHBhcmFtcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXModXJsLnNlYXJjaCk7XG4gICAgY29uc3QgaG9zdG5hbWUgPSB1cmwuaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sICcnKTtcbiAgICBjb25zdCBhbGxvd2VkUGFyYW1zID0gZ2V0QWxsb3dlZFBhcmFtcyhob3N0bmFtZSk7XG5cbiAgICBjb25zdCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuICAgIHBhcmFtcy5mb3JFYWNoKChfLCBrZXkpID0+IGtleXMucHVzaChrZXkpKTtcblxuICAgIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICAgIGlmIChUUkFDS0lOR19QQVJBTVMuc29tZShyID0+IHIudGVzdChrZXkpKSkge1xuICAgICAgICBwYXJhbXMuZGVsZXRlKGtleSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKGFsbG93ZWRQYXJhbXMgJiYgIWFsbG93ZWRQYXJhbXMuaW5jbHVkZXMoa2V5KSkge1xuICAgICAgICBwYXJhbXMuZGVsZXRlKGtleSk7XG4gICAgICB9XG4gICAgfVxuICAgIHVybC5zZWFyY2ggPSBwYXJhbXMudG9TdHJpbmcoKTtcbiAgICByZXR1cm4gdXJsLnRvU3RyaW5nKCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICByZXR1cm4gdXJsU3RyO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVlvdVR1YmVVcmwodXJsU3RyOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHVybFN0cik7XG4gICAgICAgIGNvbnN0IHYgPSB1cmwuc2VhcmNoUGFyYW1zLmdldCgndicpO1xuICAgICAgICBjb25zdCBpc1Nob3J0cyA9IHVybC5wYXRobmFtZS5pbmNsdWRlcygnL3Nob3J0cy8nKTtcbiAgICAgICAgbGV0IHZpZGVvSWQgPVxuICAgICAgICAgIHYgfHxcbiAgICAgICAgICAoaXNTaG9ydHMgPyB1cmwucGF0aG5hbWUuc3BsaXQoJy9zaG9ydHMvJylbMV0gOiBudWxsKSB8fFxuICAgICAgICAgICh1cmwuaG9zdG5hbWUgPT09ICd5b3V0dS5iZScgPyB1cmwucGF0aG5hbWUucmVwbGFjZSgnLycsICcnKSA6IG51bGwpO1xuXG4gICAgICAgIGNvbnN0IHBsYXlsaXN0SWQgPSB1cmwuc2VhcmNoUGFyYW1zLmdldCgnbGlzdCcpO1xuICAgICAgICBjb25zdCBwbGF5bGlzdEluZGV4ID0gcGFyc2VJbnQodXJsLnNlYXJjaFBhcmFtcy5nZXQoJ2luZGV4JykgfHwgJzAnLCAxMCk7XG5cbiAgICAgICAgcmV0dXJuIHsgdmlkZW9JZCwgaXNTaG9ydHMsIHBsYXlsaXN0SWQsIHBsYXlsaXN0SW5kZXggfTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHJldHVybiB7IHZpZGVvSWQ6IG51bGwsIGlzU2hvcnRzOiBmYWxzZSwgcGxheWxpc3RJZDogbnVsbCwgcGxheWxpc3RJbmRleDogbnVsbCB9O1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZXh0cmFjdEF1dGhvcihlbnRpdHk6IGFueSk6IHN0cmluZyB8IG51bGwge1xuICAgIGlmICghZW50aXR5IHx8ICFlbnRpdHkuYXV0aG9yKSByZXR1cm4gbnVsbDtcbiAgICBpZiAodHlwZW9mIGVudGl0eS5hdXRob3IgPT09ICdzdHJpbmcnKSByZXR1cm4gZW50aXR5LmF1dGhvcjtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShlbnRpdHkuYXV0aG9yKSkgcmV0dXJuIGVudGl0eS5hdXRob3JbMF0/Lm5hbWUgfHwgbnVsbDtcbiAgICBpZiAodHlwZW9mIGVudGl0eS5hdXRob3IgPT09ICdvYmplY3QnKSByZXR1cm4gZW50aXR5LmF1dGhvci5uYW1lIHx8IG51bGw7XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIGV4dHJhY3RLZXl3b3JkcyhlbnRpdHk6IGFueSk6IHN0cmluZ1tdIHtcbiAgICBpZiAoIWVudGl0eSB8fCAhZW50aXR5LmtleXdvcmRzKSByZXR1cm4gW107XG4gICAgaWYgKHR5cGVvZiBlbnRpdHkua2V5d29yZHMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJldHVybiBlbnRpdHkua2V5d29yZHMuc3BsaXQoJywnKS5tYXAoKHM6IHN0cmluZykgPT4gcy50cmltKCkpO1xuICAgIH1cbiAgICBpZiAoQXJyYXkuaXNBcnJheShlbnRpdHkua2V5d29yZHMpKSByZXR1cm4gZW50aXR5LmtleXdvcmRzO1xuICAgIHJldHVybiBbXTtcbn1cblxuZnVuY3Rpb24gZXh0cmFjdEJyZWFkY3J1bWJzKGpzb25MZDogYW55W10pOiBzdHJpbmdbXSB7XG4gICAgY29uc3QgYnJlYWRjcnVtYkxkID0ganNvbkxkLmZpbmQoaSA9PiBpICYmIGlbJ0B0eXBlJ10gPT09ICdCcmVhZGNydW1iTGlzdCcpO1xuICAgIGlmICghYnJlYWRjcnVtYkxkIHx8ICFBcnJheS5pc0FycmF5KGJyZWFkY3J1bWJMZC5pdGVtTGlzdEVsZW1lbnQpKSByZXR1cm4gW107XG5cbiAgICBjb25zdCBsaXN0ID0gYnJlYWRjcnVtYkxkLml0ZW1MaXN0RWxlbWVudC5zb3J0KChhOiBhbnksIGI6IGFueSkgPT4gKGEucG9zaXRpb24gfHwgMCkgLSAoYi5wb3NpdGlvbiB8fCAwKSk7XG4gICAgY29uc3QgYnJlYWRjcnVtYnM6IHN0cmluZ1tdID0gW107XG4gICAgbGlzdC5mb3JFYWNoKChpdGVtOiBhbnkpID0+IHtcbiAgICAgICAgaWYgKGl0ZW0ubmFtZSkgYnJlYWRjcnVtYnMucHVzaChpdGVtLm5hbWUpO1xuICAgICAgICBlbHNlIGlmIChpdGVtLml0ZW0gJiYgaXRlbS5pdGVtLm5hbWUpIGJyZWFkY3J1bWJzLnB1c2goaXRlbS5pdGVtLm5hbWUpO1xuICAgIH0pO1xuICAgIHJldHVybiBicmVhZGNydW1icztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RKc29uTGRGaWVsZHMoanNvbkxkOiBhbnlbXSkge1xuICAgIC8vIEZpbmQgbWFpbiBlbnRpdHlcbiAgICAvLyBBZGRlZCBzYWZldHkgY2hlY2s6IGkgJiYgaVsnQHR5cGUnXVxuICAgIGNvbnN0IG1haW5FbnRpdHkgPSBqc29uTGQuZmluZChpID0+IGkgJiYgKGlbJ0B0eXBlJ10gPT09ICdBcnRpY2xlJyB8fCBpWydAdHlwZSddID09PSAnVmlkZW9PYmplY3QnIHx8IGlbJ0B0eXBlJ10gPT09ICdOZXdzQXJ0aWNsZScpKSB8fCBqc29uTGRbMF07XG5cbiAgICBsZXQgYXV0aG9yOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICBsZXQgcHVibGlzaGVkQXQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgIGxldCBtb2RpZmllZEF0OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICBsZXQgdGFnczogc3RyaW5nW10gPSBbXTtcblxuICAgIGlmIChtYWluRW50aXR5KSB7XG4gICAgICAgIGF1dGhvciA9IGV4dHJhY3RBdXRob3IobWFpbkVudGl0eSk7XG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIHVwbG9hZERhdGUgZm9yIFZpZGVvT2JqZWN0IGlmIGRhdGVQdWJsaXNoZWQgaXMgbWlzc2luZ1xuICAgICAgICBwdWJsaXNoZWRBdCA9IG1haW5FbnRpdHkuZGF0ZVB1Ymxpc2hlZCB8fCBtYWluRW50aXR5LnVwbG9hZERhdGUgfHwgbnVsbDtcbiAgICAgICAgbW9kaWZpZWRBdCA9IG1haW5FbnRpdHkuZGF0ZU1vZGlmaWVkIHx8IG51bGw7XG4gICAgICAgIHRhZ3MgPSBleHRyYWN0S2V5d29yZHMobWFpbkVudGl0eSk7XG4gICAgfVxuXG4gICAgY29uc3QgYnJlYWRjcnVtYnMgPSBleHRyYWN0QnJlYWRjcnVtYnMoanNvbkxkKTtcblxuICAgIHJldHVybiB7IGF1dGhvciwgcHVibGlzaGVkQXQsIG1vZGlmaWVkQXQsIHRhZ3MsIGJyZWFkY3J1bWJzIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgWW91VHViZU1ldGFkYXRhIHtcbiAgYXV0aG9yOiBzdHJpbmcgfCBudWxsO1xuICBwdWJsaXNoZWRBdDogc3RyaW5nIHwgbnVsbDtcbiAgZ2VucmU6IHN0cmluZyB8IG51bGw7XG59XG5cbmZ1bmN0aW9uIGdldE1ldGFDb250ZW50KGh0bWw6IHN0cmluZywga2V5QXR0cjogc3RyaW5nLCBrZXlWYWx1ZTogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG4gIC8vIFRyeSBwYXR0ZXJuOiBrZXlBdHRyPVwia2V5VmFsdWVcIiAuLi4gY29udGVudD1cInZhbHVlXCJcbiAgLy8gU2FmZSByZWdleCB0aGF0IGF2b2lkcyBjYXRhc3Ryb3BoaWMgYmFja3RyYWNraW5nIGJ5IGNvbnN1bWluZyBjaGFycyBub24tZ3JlZWRpbHlcbiAgLy8gVGhpcyBtYXRjaGVzOiA8bWV0YSAuLi4ga2V5QXR0cj1cImtleVZhbHVlXCIgLi4uIGNvbnRlbnQ9XCJ2YWx1ZVwiIC4uLiA+XG4gIGNvbnN0IHBhdHRlcm4xID0gbmV3IFJlZ0V4cChgPG1ldGFcXFxccysoPzpbXj5dKj9cXFxccyspPyR7a2V5QXR0cn09W1wiJ10ke2tleVZhbHVlfVtcIiddKD86W14+XSo/XFxcXHMrKT9jb250ZW50PVtcIiddKFteXCInXSspW1wiJ11gLCAnaScpO1xuICBjb25zdCBtYXRjaDEgPSBwYXR0ZXJuMS5leGVjKGh0bWwpO1xuICBpZiAobWF0Y2gxICYmIG1hdGNoMVsxXSkgcmV0dXJuIG1hdGNoMVsxXTtcblxuICAvLyBUcnkgcGF0dGVybjogY29udGVudD1cInZhbHVlXCIgLi4uIGtleUF0dHI9XCJrZXlWYWx1ZVwiXG4gIGNvbnN0IHBhdHRlcm4yID0gbmV3IFJlZ0V4cChgPG1ldGFcXFxccysoPzpbXj5dKj9cXFxccyspP2NvbnRlbnQ9W1wiJ10oW15cIiddKylbXCInXSg/OltePl0qP1xcXFxzKyk/JHtrZXlBdHRyfT1bXCInXSR7a2V5VmFsdWV9W1wiJ11gLCAnaScpO1xuICBjb25zdCBtYXRjaDIgPSBwYXR0ZXJuMi5leGVjKGh0bWwpO1xuICBpZiAobWF0Y2gyICYmIG1hdGNoMlsxXSkgcmV0dXJuIG1hdGNoMlsxXTtcblxuICByZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RZb3VUdWJlTWV0YWRhdGFGcm9tSHRtbChodG1sOiBzdHJpbmcpOiBZb3VUdWJlTWV0YWRhdGEge1xuICBsZXQgYXV0aG9yOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgbGV0IHB1Ymxpc2hlZEF0OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgbGV0IGdlbnJlOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblxuICAvLyAxLiBUcnkgSlNPTi1MRFxuICAvLyBMb29rIGZvciA8c2NyaXB0IHR5cGU9XCJhcHBsaWNhdGlvbi9sZCtqc29uXCI+Li4uPC9zY3JpcHQ+XG4gIC8vIFdlIG5lZWQgdG8gbG9vcCBiZWNhdXNlIHRoZXJlIG1pZ2h0IGJlIG11bHRpcGxlIHNjcmlwdHNcbiAgY29uc3Qgc2NyaXB0UmVnZXggPSAvPHNjcmlwdFxccyt0eXBlPVtcIiddYXBwbGljYXRpb25cXC9sZFxcK2pzb25bXCInXVtePl0qPihbXFxzXFxTXSo/KTxcXC9zY3JpcHQ+L2dpO1xuICBsZXQgbWF0Y2g7XG4gIHdoaWxlICgobWF0Y2ggPSBzY3JpcHRSZWdleC5leGVjKGh0bWwpKSAhPT0gbnVsbCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBqc29uID0gSlNPTi5wYXJzZShtYXRjaFsxXSk7XG4gICAgICAgICAgY29uc3QgYXJyYXkgPSBBcnJheS5pc0FycmF5KGpzb24pID8ganNvbiA6IFtqc29uXTtcbiAgICAgICAgICBjb25zdCBmaWVsZHMgPSBleHRyYWN0SnNvbkxkRmllbGRzKGFycmF5KTtcbiAgICAgICAgICBpZiAoZmllbGRzLmF1dGhvciAmJiAhYXV0aG9yKSBhdXRob3IgPSBmaWVsZHMuYXV0aG9yO1xuICAgICAgICAgIGlmIChmaWVsZHMucHVibGlzaGVkQXQgJiYgIXB1Ymxpc2hlZEF0KSBwdWJsaXNoZWRBdCA9IGZpZWxkcy5wdWJsaXNoZWRBdDtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAvLyBpZ25vcmUgcGFyc2UgZXJyb3JzXG4gICAgICB9XG4gIH1cblxuICAvLyAyLiBUcnkgPGxpbmsgaXRlbXByb3A9XCJuYW1lXCIgY29udGVudD1cIi4uLlwiPiAoWW91VHViZSBvZnRlbiBwdXRzIGNoYW5uZWwgbmFtZSBoZXJlIGluIHNvbWUgY29udGV4dHMpXG4gIGlmICghYXV0aG9yKSB7XG4gICAgLy8gTm90ZTogPGxpbms+IHRhZ3MgdXN1YWxseSBoYXZlIGl0ZW1wcm9wIGJlZm9yZSBjb250ZW50LCBidXQgd2UgdXNlIHJvYnVzdCBoZWxwZXIganVzdCBpbiBjYXNlXG4gICAgLy8gRm9yIGxpbmsgdGFncywgc3RydWN0dXJlIGlzIHNpbWlsYXIgdG8gbWV0YSBidXQgdGFnIG5hbWUgaXMgZGlmZmVyZW50LlxuICAgIC8vIFdlIGNhbiByZXBsYWNlIGxpbmsgd2l0aCBtZXRhIHRlbXBvcmFyaWx5IG9yIGp1c3QgZHVwbGljYXRlIGxvZ2ljLiBSZXBsYWNpbmcgaXMgZWFzaWVyIGZvciByZXVzZS5cbiAgICBjb25zdCBsaW5rTmFtZSA9IGdldE1ldGFDb250ZW50KGh0bWwucmVwbGFjZSgvPGxpbmsvZ2ksICc8bWV0YScpLCAnaXRlbXByb3AnLCAnbmFtZScpO1xuICAgIGlmIChsaW5rTmFtZSkgYXV0aG9yID0gZGVjb2RlSHRtbEVudGl0aWVzKGxpbmtOYW1lKTtcbiAgfVxuXG4gIC8vIDMuIFRyeSBtZXRhIGF1dGhvclxuICBpZiAoIWF1dGhvcikge1xuICAgICAgY29uc3QgbWV0YUF1dGhvciA9IGdldE1ldGFDb250ZW50KGh0bWwsICduYW1lJywgJ2F1dGhvcicpO1xuICAgICAgaWYgKG1ldGFBdXRob3IpIGF1dGhvciA9IGRlY29kZUh0bWxFbnRpdGllcyhtZXRhQXV0aG9yKTtcbiAgfVxuXG4gIC8vIDQuIFRyeSBtZXRhIGRhdGVQdWJsaXNoZWQgLyB1cGxvYWREYXRlXG4gIGlmICghcHVibGlzaGVkQXQpIHtcbiAgICAgIHB1Ymxpc2hlZEF0ID0gZ2V0TWV0YUNvbnRlbnQoaHRtbCwgJ2l0ZW1wcm9wJywgJ2RhdGVQdWJsaXNoZWQnKTtcbiAgfVxuICBpZiAoIXB1Ymxpc2hlZEF0KSB7XG4gICAgICBwdWJsaXNoZWRBdCA9IGdldE1ldGFDb250ZW50KGh0bWwsICdpdGVtcHJvcCcsICd1cGxvYWREYXRlJyk7XG4gIH1cblxuICAvLyA1LiBHZW5yZVxuICBnZW5yZSA9IGV4dHJhY3RZb3VUdWJlR2VucmVGcm9tSHRtbChodG1sKTtcblxuICByZXR1cm4geyBhdXRob3IsIHB1Ymxpc2hlZEF0LCBnZW5yZSB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXh0cmFjdFlvdVR1YmVHZW5yZUZyb21IdG1sKGh0bWw6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuICAvLyAxLiBUcnkgPG1ldGEgaXRlbXByb3A9XCJnZW5yZVwiIGNvbnRlbnQ9XCIuLi5cIj5cbiAgY29uc3QgbWV0YUdlbnJlID0gZ2V0TWV0YUNvbnRlbnQoaHRtbCwgJ2l0ZW1wcm9wJywgJ2dlbnJlJyk7XG4gIGlmIChtZXRhR2VucmUpIHJldHVybiBkZWNvZGVIdG1sRW50aXRpZXMobWV0YUdlbnJlKTtcblxuICAvLyAyLiBUcnkgSlNPTiBcImNhdGVnb3J5XCIgaW4gc2NyaXB0c1xuICAvLyBcImNhdGVnb3J5XCI6XCJHYW1pbmdcIlxuICBjb25zdCBjYXRlZ29yeVJlZ2V4ID0gL1wiY2F0ZWdvcnlcIlxccyo6XFxzKlwiKFteXCJdKylcIi87XG4gIGNvbnN0IGNhdE1hdGNoID0gY2F0ZWdvcnlSZWdleC5leGVjKGh0bWwpO1xuICBpZiAoY2F0TWF0Y2ggJiYgY2F0TWF0Y2hbMV0pIHtcbiAgICAgIHJldHVybiBkZWNvZGVIdG1sRW50aXRpZXMoY2F0TWF0Y2hbMV0pO1xuICB9XG5cbiAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIGRlY29kZUh0bWxFbnRpdGllcyh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBpZiAoIXRleHQpIHJldHVybiB0ZXh0O1xuXG4gIGNvbnN0IGVudGl0aWVzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgICcmYW1wOyc6ICcmJyxcbiAgICAnJmx0Oyc6ICc8JyxcbiAgICAnJmd0Oyc6ICc+JyxcbiAgICAnJnF1b3Q7JzogJ1wiJyxcbiAgICAnJiMzOTsnOiBcIidcIixcbiAgICAnJmFwb3M7JzogXCInXCIsXG4gICAgJyZuYnNwOyc6ICcgJ1xuICB9O1xuXG4gIHJldHVybiB0ZXh0LnJlcGxhY2UoLyYoW2EtejAtOV0rfCNbMC05XXsxLDZ9fCN4WzAtOWEtZkEtRl17MSw2fSk7L2lnLCAobWF0Y2gpID0+IHtcbiAgICAgIGNvbnN0IGxvd2VyID0gbWF0Y2gudG9Mb3dlckNhc2UoKTtcbiAgICAgIGlmIChlbnRpdGllc1tsb3dlcl0pIHJldHVybiBlbnRpdGllc1tsb3dlcl07XG4gICAgICBpZiAoZW50aXRpZXNbbWF0Y2hdKSByZXR1cm4gZW50aXRpZXNbbWF0Y2hdO1xuXG4gICAgICBpZiAobG93ZXIuc3RhcnRzV2l0aCgnJiN4JykpIHtcbiAgICAgICAgICB0cnkgeyByZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZShwYXJzZUludChsb3dlci5zbGljZSgzLCAtMSksIDE2KSk7IH0gY2F0Y2ggeyByZXR1cm4gbWF0Y2g7IH1cbiAgICAgIH1cbiAgICAgIGlmIChsb3dlci5zdGFydHNXaXRoKCcmIycpKSB7XG4gICAgICAgICAgdHJ5IHsgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUocGFyc2VJbnQobG93ZXIuc2xpY2UoMiwgLTEpLCAxMCkpOyB9IGNhdGNoIHsgcmV0dXJuIG1hdGNoOyB9XG4gICAgICB9XG4gICAgICByZXR1cm4gbWF0Y2g7XG4gIH0pO1xufVxuIiwgIlxuZXhwb3J0IGNvbnN0IEdFTkVSQV9SRUdJU1RSWTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgLy8gU2VhcmNoXG4gICdnb29nbGUuY29tJzogJ1NlYXJjaCcsXG4gICdiaW5nLmNvbSc6ICdTZWFyY2gnLFxuICAnZHVja2R1Y2tnby5jb20nOiAnU2VhcmNoJyxcbiAgJ3lhaG9vLmNvbSc6ICdTZWFyY2gnLFxuICAnYmFpZHUuY29tJzogJ1NlYXJjaCcsXG4gICd5YW5kZXguY29tJzogJ1NlYXJjaCcsXG4gICdrYWdpLmNvbSc6ICdTZWFyY2gnLFxuICAnZWNvc2lhLm9yZyc6ICdTZWFyY2gnLFxuXG4gIC8vIFNvY2lhbFxuICAnZmFjZWJvb2suY29tJzogJ1NvY2lhbCcsXG4gICd0d2l0dGVyLmNvbSc6ICdTb2NpYWwnLFxuICAneC5jb20nOiAnU29jaWFsJyxcbiAgJ2luc3RhZ3JhbS5jb20nOiAnU29jaWFsJyxcbiAgJ2xpbmtlZGluLmNvbSc6ICdTb2NpYWwnLFxuICAncmVkZGl0LmNvbSc6ICdTb2NpYWwnLFxuICAndGlrdG9rLmNvbSc6ICdTb2NpYWwnLFxuICAncGludGVyZXN0LmNvbSc6ICdTb2NpYWwnLFxuICAnc25hcGNoYXQuY29tJzogJ1NvY2lhbCcsXG4gICd0dW1ibHIuY29tJzogJ1NvY2lhbCcsXG4gICd0aHJlYWRzLm5ldCc6ICdTb2NpYWwnLFxuICAnYmx1ZXNreS5hcHAnOiAnU29jaWFsJyxcbiAgJ21hc3RvZG9uLnNvY2lhbCc6ICdTb2NpYWwnLFxuXG4gIC8vIFZpZGVvXG4gICd5b3V0dWJlLmNvbSc6ICdWaWRlbycsXG4gICd5b3V0dS5iZSc6ICdWaWRlbycsXG4gICd2aW1lby5jb20nOiAnVmlkZW8nLFxuICAndHdpdGNoLnR2JzogJ1ZpZGVvJyxcbiAgJ25ldGZsaXguY29tJzogJ1ZpZGVvJyxcbiAgJ2h1bHUuY29tJzogJ1ZpZGVvJyxcbiAgJ2Rpc25leXBsdXMuY29tJzogJ1ZpZGVvJyxcbiAgJ2RhaWx5bW90aW9uLmNvbSc6ICdWaWRlbycsXG4gICdwcmltZXZpZGVvLmNvbSc6ICdWaWRlbycsXG4gICdoYm9tYXguY29tJzogJ1ZpZGVvJyxcbiAgJ21heC5jb20nOiAnVmlkZW8nLFxuICAncGVhY29ja3R2LmNvbSc6ICdWaWRlbycsXG5cbiAgLy8gRGV2ZWxvcG1lbnRcbiAgJ2dpdGh1Yi5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnZ2l0bGFiLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdzdGFja292ZXJmbG93LmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICducG1qcy5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAncHlwaS5vcmcnOiAnRGV2ZWxvcG1lbnQnLFxuICAnZGV2ZWxvcGVyLm1vemlsbGEub3JnJzogJ0RldmVsb3BtZW50JyxcbiAgJ3czc2Nob29scy5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnZ2Vla3Nmb3JnZWVrcy5vcmcnOiAnRGV2ZWxvcG1lbnQnLFxuICAnamlyYS5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnYXRsYXNzaWFuLm5ldCc6ICdEZXZlbG9wbWVudCcsIC8vIG9mdGVuIGppcmFcbiAgJ2JpdGJ1Y2tldC5vcmcnOiAnRGV2ZWxvcG1lbnQnLFxuICAnZGV2LnRvJzogJ0RldmVsb3BtZW50JyxcbiAgJ2hhc2hub2RlLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdtZWRpdW0uY29tJzogJ0RldmVsb3BtZW50JywgLy8gR2VuZXJhbCBidXQgb2Z0ZW4gZGV2XG4gICd2ZXJjZWwuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ25ldGxpZnkuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2hlcm9rdS5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnYXdzLmFtYXpvbi5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnY29uc29sZS5hd3MuYW1hem9uLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdjbG91ZC5nb29nbGUuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2F6dXJlLm1pY3Jvc29mdC5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAncG9ydGFsLmF6dXJlLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdkb2NrZXIuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2t1YmVybmV0ZXMuaW8nOiAnRGV2ZWxvcG1lbnQnLFxuXG4gIC8vIE5ld3NcbiAgJ2Nubi5jb20nOiAnTmV3cycsXG4gICdiYmMuY29tJzogJ05ld3MnLFxuICAnbnl0aW1lcy5jb20nOiAnTmV3cycsXG4gICd3YXNoaW5ndG9ucG9zdC5jb20nOiAnTmV3cycsXG4gICd0aGVndWFyZGlhbi5jb20nOiAnTmV3cycsXG4gICdmb3JiZXMuY29tJzogJ05ld3MnLFxuICAnYmxvb21iZXJnLmNvbSc6ICdOZXdzJyxcbiAgJ3JldXRlcnMuY29tJzogJ05ld3MnLFxuICAnd3NqLmNvbSc6ICdOZXdzJyxcbiAgJ2NuYmMuY29tJzogJ05ld3MnLFxuICAnaHVmZnBvc3QuY29tJzogJ05ld3MnLFxuICAnbmV3cy5nb29nbGUuY29tJzogJ05ld3MnLFxuICAnZm94bmV3cy5jb20nOiAnTmV3cycsXG4gICduYmNuZXdzLmNvbSc6ICdOZXdzJyxcbiAgJ2FiY25ld3MuZ28uY29tJzogJ05ld3MnLFxuICAndXNhdG9kYXkuY29tJzogJ05ld3MnLFxuXG4gIC8vIFNob3BwaW5nXG4gICdhbWF6b24uY29tJzogJ1Nob3BwaW5nJyxcbiAgJ2ViYXkuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ3dhbG1hcnQuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ2V0c3kuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ3RhcmdldC5jb20nOiAnU2hvcHBpbmcnLFxuICAnYmVzdGJ1eS5jb20nOiAnU2hvcHBpbmcnLFxuICAnYWxpZXhwcmVzcy5jb20nOiAnU2hvcHBpbmcnLFxuICAnc2hvcGlmeS5jb20nOiAnU2hvcHBpbmcnLFxuICAndGVtdS5jb20nOiAnU2hvcHBpbmcnLFxuICAnc2hlaW4uY29tJzogJ1Nob3BwaW5nJyxcbiAgJ3dheWZhaXIuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ2Nvc3Rjby5jb20nOiAnU2hvcHBpbmcnLFxuXG4gIC8vIENvbW11bmljYXRpb25cbiAgJ21haWwuZ29vZ2xlLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ291dGxvb2subGl2ZS5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICdzbGFjay5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICdkaXNjb3JkLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ3pvb20udXMnOiAnQ29tbXVuaWNhdGlvbicsXG4gICd0ZWFtcy5taWNyb3NvZnQuY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnd2hhdHNhcHAuY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAndGVsZWdyYW0ub3JnJzogJ0NvbW11bmljYXRpb24nLFxuICAnbWVzc2VuZ2VyLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ3NreXBlLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcblxuICAvLyBGaW5hbmNlXG4gICdwYXlwYWwuY29tJzogJ0ZpbmFuY2UnLFxuICAnY2hhc2UuY29tJzogJ0ZpbmFuY2UnLFxuICAnYmFua29mYW1lcmljYS5jb20nOiAnRmluYW5jZScsXG4gICd3ZWxsc2ZhcmdvLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2FtZXJpY2FuZXhwcmVzcy5jb20nOiAnRmluYW5jZScsXG4gICdzdHJpcGUuY29tJzogJ0ZpbmFuY2UnLFxuICAnY29pbmJhc2UuY29tJzogJ0ZpbmFuY2UnLFxuICAnYmluYW5jZS5jb20nOiAnRmluYW5jZScsXG4gICdrcmFrZW4uY29tJzogJ0ZpbmFuY2UnLFxuICAncm9iaW5ob29kLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2ZpZGVsaXR5LmNvbSc6ICdGaW5hbmNlJyxcbiAgJ3Zhbmd1YXJkLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ3NjaHdhYi5jb20nOiAnRmluYW5jZScsXG4gICdtaW50LmludHVpdC5jb20nOiAnRmluYW5jZScsXG5cbiAgLy8gRWR1Y2F0aW9uXG4gICd3aWtpcGVkaWEub3JnJzogJ0VkdWNhdGlvbicsXG4gICdjb3Vyc2VyYS5vcmcnOiAnRWR1Y2F0aW9uJyxcbiAgJ3VkZW15LmNvbSc6ICdFZHVjYXRpb24nLFxuICAnZWR4Lm9yZyc6ICdFZHVjYXRpb24nLFxuICAna2hhbmFjYWRlbXkub3JnJzogJ0VkdWNhdGlvbicsXG4gICdxdWl6bGV0LmNvbSc6ICdFZHVjYXRpb24nLFxuICAnZHVvbGluZ28uY29tJzogJ0VkdWNhdGlvbicsXG4gICdjYW52YXMuaW5zdHJ1Y3R1cmUuY29tJzogJ0VkdWNhdGlvbicsXG4gICdibGFja2JvYXJkLmNvbSc6ICdFZHVjYXRpb24nLFxuICAnbWl0LmVkdSc6ICdFZHVjYXRpb24nLFxuICAnaGFydmFyZC5lZHUnOiAnRWR1Y2F0aW9uJyxcbiAgJ3N0YW5mb3JkLmVkdSc6ICdFZHVjYXRpb24nLFxuICAnYWNhZGVtaWEuZWR1JzogJ0VkdWNhdGlvbicsXG4gICdyZXNlYXJjaGdhdGUubmV0JzogJ0VkdWNhdGlvbicsXG5cbiAgLy8gRGVzaWduXG4gICdmaWdtYS5jb20nOiAnRGVzaWduJyxcbiAgJ2NhbnZhLmNvbSc6ICdEZXNpZ24nLFxuICAnYmVoYW5jZS5uZXQnOiAnRGVzaWduJyxcbiAgJ2RyaWJiYmxlLmNvbSc6ICdEZXNpZ24nLFxuICAnYWRvYmUuY29tJzogJ0Rlc2lnbicsXG4gICd1bnNwbGFzaC5jb20nOiAnRGVzaWduJyxcbiAgJ3BleGVscy5jb20nOiAnRGVzaWduJyxcbiAgJ3BpeGFiYXkuY29tJzogJ0Rlc2lnbicsXG4gICdzaHV0dGVyc3RvY2suY29tJzogJ0Rlc2lnbicsXG5cbiAgLy8gUHJvZHVjdGl2aXR5XG4gICdkb2NzLmdvb2dsZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ3NoZWV0cy5nb29nbGUuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdzbGlkZXMuZ29vZ2xlLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnZHJpdmUuZ29vZ2xlLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnbm90aW9uLnNvJzogJ1Byb2R1Y3Rpdml0eScsXG4gICd0cmVsbG8uY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdhc2FuYS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ21vbmRheS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2FpcnRhYmxlLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnZXZlcm5vdGUuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdkcm9wYm94LmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnY2xpY2t1cC5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2xpbmVhci5hcHAnOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ21pcm8uY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdsdWNpZGNoYXJ0LmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuXG4gIC8vIEFJXG4gICdvcGVuYWkuY29tJzogJ0FJJyxcbiAgJ2NoYXRncHQuY29tJzogJ0FJJyxcbiAgJ2FudGhyb3BpYy5jb20nOiAnQUknLFxuICAnbWlkam91cm5leS5jb20nOiAnQUknLFxuICAnaHVnZ2luZ2ZhY2UuY28nOiAnQUknLFxuICAnYmFyZC5nb29nbGUuY29tJzogJ0FJJyxcbiAgJ2dlbWluaS5nb29nbGUuY29tJzogJ0FJJyxcbiAgJ2NsYXVkZS5haSc6ICdBSScsXG4gICdwZXJwbGV4aXR5LmFpJzogJ0FJJyxcbiAgJ3BvZS5jb20nOiAnQUknLFxuXG4gIC8vIE11c2ljL0F1ZGlvXG4gICdzcG90aWZ5LmNvbSc6ICdNdXNpYycsXG4gICdzb3VuZGNsb3VkLmNvbSc6ICdNdXNpYycsXG4gICdtdXNpYy5hcHBsZS5jb20nOiAnTXVzaWMnLFxuICAncGFuZG9yYS5jb20nOiAnTXVzaWMnLFxuICAndGlkYWwuY29tJzogJ011c2ljJyxcbiAgJ2JhbmRjYW1wLmNvbSc6ICdNdXNpYycsXG4gICdhdWRpYmxlLmNvbSc6ICdNdXNpYycsXG5cbiAgLy8gR2FtaW5nXG4gICdzdGVhbXBvd2VyZWQuY29tJzogJ0dhbWluZycsXG4gICdyb2Jsb3guY29tJzogJ0dhbWluZycsXG4gICdlcGljZ2FtZXMuY29tJzogJ0dhbWluZycsXG4gICd4Ym94LmNvbSc6ICdHYW1pbmcnLFxuICAncGxheXN0YXRpb24uY29tJzogJ0dhbWluZycsXG4gICduaW50ZW5kby5jb20nOiAnR2FtaW5nJyxcbiAgJ2lnbi5jb20nOiAnR2FtaW5nJyxcbiAgJ2dhbWVzcG90LmNvbSc6ICdHYW1pbmcnLFxuICAna290YWt1LmNvbSc6ICdHYW1pbmcnLFxuICAncG9seWdvbi5jb20nOiAnR2FtaW5nJ1xufTtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldEdlbmVyYShob3N0bmFtZTogc3RyaW5nLCBjdXN0b21SZWdpc3RyeT86IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pOiBzdHJpbmcgfCBudWxsIHtcbiAgaWYgKCFob3N0bmFtZSkgcmV0dXJuIG51bGw7XG5cbiAgLy8gMC4gQ2hlY2sgY3VzdG9tIHJlZ2lzdHJ5IGZpcnN0XG4gIGlmIChjdXN0b21SZWdpc3RyeSkge1xuICAgICAgY29uc3QgcGFydHMgPSBob3N0bmFtZS5zcGxpdCgnLicpO1xuICAgICAgLy8gQ2hlY2sgZnVsbCBob3N0bmFtZSBhbmQgcHJvZ3Jlc3NpdmVseSBzaG9ydGVyIHN1ZmZpeGVzXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHBhcnRzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgICAgIGNvbnN0IGRvbWFpbiA9IHBhcnRzLnNsaWNlKGkpLmpvaW4oJy4nKTtcbiAgICAgICAgICBpZiAoY3VzdG9tUmVnaXN0cnlbZG9tYWluXSkge1xuICAgICAgICAgICAgICByZXR1cm4gY3VzdG9tUmVnaXN0cnlbZG9tYWluXTtcbiAgICAgICAgICB9XG4gICAgICB9XG4gIH1cblxuICAvLyAxLiBFeGFjdCBtYXRjaFxuICBpZiAoR0VORVJBX1JFR0lTVFJZW2hvc3RuYW1lXSkge1xuICAgIHJldHVybiBHRU5FUkFfUkVHSVNUUllbaG9zdG5hbWVdO1xuICB9XG5cbiAgLy8gMi4gU3ViZG9tYWluIGNoZWNrIChzdHJpcHBpbmcgc3ViZG9tYWlucylcbiAgLy8gZS5nLiBcImNvbnNvbGUuYXdzLmFtYXpvbi5jb21cIiAtPiBcImF3cy5hbWF6b24uY29tXCIgLT4gXCJhbWF6b24uY29tXCJcbiAgY29uc3QgcGFydHMgPSBob3N0bmFtZS5zcGxpdCgnLicpO1xuXG4gIC8vIFRyeSBtYXRjaGluZyBwcm9ncmVzc2l2ZWx5IHNob3J0ZXIgc3VmZml4ZXNcbiAgLy8gZS5nLiBhLmIuYy5jb20gLT4gYi5jLmNvbSAtPiBjLmNvbVxuICBmb3IgKGxldCBpID0gMDsgaSA8IHBhcnRzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgY29uc3QgZG9tYWluID0gcGFydHMuc2xpY2UoaSkuam9pbignLicpO1xuICAgICAgaWYgKEdFTkVSQV9SRUdJU1RSWVtkb21haW5dKSB7XG4gICAgICAgICAgcmV0dXJuIEdFTkVSQV9SRUdJU1RSWVtkb21haW5dO1xuICAgICAgfVxuICB9XG5cbiAgcmV0dXJuIG51bGw7XG59XG4iLCAiZXhwb3J0IGNvbnN0IGdldFN0b3JlZFZhbHVlID0gYXN5bmMgPFQ+KGtleTogc3RyaW5nKTogUHJvbWlzZTxUIHwgbnVsbD4gPT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoa2V5LCAoaXRlbXMpID0+IHtcbiAgICAgIHJlc29sdmUoKGl0ZW1zW2tleV0gYXMgVCkgPz8gbnVsbCk7XG4gICAgfSk7XG4gIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IHNldFN0b3JlZFZhbHVlID0gYXN5bmMgPFQ+KGtleTogc3RyaW5nLCB2YWx1ZTogVCk6IFByb21pc2U8dm9pZD4gPT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBba2V5XTogdmFsdWUgfSwgKCkgPT4gcmVzb2x2ZSgpKTtcbiAgfSk7XG59O1xuIiwgImltcG9ydCB7IEN1c3RvbVN0cmF0ZWd5LCBQcmVmZXJlbmNlcywgU29ydGluZ1N0cmF0ZWd5IH0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgZ2V0U3RvcmVkVmFsdWUsIHNldFN0b3JlZFZhbHVlIH0gZnJvbSBcIi4vc3RvcmFnZS5qc1wiO1xuaW1wb3J0IHsgc2V0TG9nZ2VyUHJlZmVyZW5jZXMsIGxvZ0RlYnVnIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tIFwiLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5cbmNvbnN0IFBSRUZFUkVOQ0VTX0tFWSA9IFwicHJlZmVyZW5jZXNcIjtcblxuZXhwb3J0IGNvbnN0IGRlZmF1bHRQcmVmZXJlbmNlczogUHJlZmVyZW5jZXMgPSB7XG4gIHNvcnRpbmc6IFtcInBpbm5lZFwiLCBcInJlY2VuY3lcIl0sXG4gIGRlYnVnOiBmYWxzZSxcbiAgbG9nTGV2ZWw6IFwiaW5mb1wiLFxuICB0aGVtZTogXCJkYXJrXCIsXG4gIGN1c3RvbUdlbmVyYToge31cbn07XG5cbmNvbnN0IG5vcm1hbGl6ZVNvcnRpbmcgPSAoc29ydGluZzogdW5rbm93bik6IFNvcnRpbmdTdHJhdGVneVtdID0+IHtcbiAgaWYgKEFycmF5LmlzQXJyYXkoc29ydGluZykpIHtcbiAgICByZXR1cm4gc29ydGluZy5maWx0ZXIoKHZhbHVlKTogdmFsdWUgaXMgU29ydGluZ1N0cmF0ZWd5ID0+IHR5cGVvZiB2YWx1ZSA9PT0gXCJzdHJpbmdcIik7XG4gIH1cbiAgaWYgKHR5cGVvZiBzb3J0aW5nID09PSBcInN0cmluZ1wiKSB7XG4gICAgcmV0dXJuIFtzb3J0aW5nXTtcbiAgfVxuICByZXR1cm4gWy4uLmRlZmF1bHRQcmVmZXJlbmNlcy5zb3J0aW5nXTtcbn07XG5cbmNvbnN0IG5vcm1hbGl6ZVN0cmF0ZWdpZXMgPSAoc3RyYXRlZ2llczogdW5rbm93bik6IEN1c3RvbVN0cmF0ZWd5W10gPT4ge1xuICAgIGNvbnN0IGFyciA9IGFzQXJyYXk8YW55PihzdHJhdGVnaWVzKS5maWx0ZXIocyA9PiB0eXBlb2YgcyA9PT0gJ29iamVjdCcgJiYgcyAhPT0gbnVsbCk7XG4gICAgcmV0dXJuIGFyci5tYXAocyA9PiAoe1xuICAgICAgICAuLi5zLFxuICAgICAgICBncm91cGluZ1J1bGVzOiBhc0FycmF5KHMuZ3JvdXBpbmdSdWxlcyksXG4gICAgICAgIHNvcnRpbmdSdWxlczogYXNBcnJheShzLnNvcnRpbmdSdWxlcyksXG4gICAgICAgIGdyb3VwU29ydGluZ1J1bGVzOiBzLmdyb3VwU29ydGluZ1J1bGVzID8gYXNBcnJheShzLmdyb3VwU29ydGluZ1J1bGVzKSA6IHVuZGVmaW5lZCxcbiAgICAgICAgZmlsdGVyczogcy5maWx0ZXJzID8gYXNBcnJheShzLmZpbHRlcnMpIDogdW5kZWZpbmVkLFxuICAgICAgICBmaWx0ZXJHcm91cHM6IHMuZmlsdGVyR3JvdXBzID8gYXNBcnJheShzLmZpbHRlckdyb3VwcykubWFwKChnOiBhbnkpID0+IGFzQXJyYXkoZykpIDogdW5kZWZpbmVkLFxuICAgICAgICBydWxlczogcy5ydWxlcyA/IGFzQXJyYXkocy5ydWxlcykgOiB1bmRlZmluZWRcbiAgICB9KSk7XG59O1xuXG5jb25zdCBub3JtYWxpemVQcmVmZXJlbmNlcyA9IChwcmVmcz86IFBhcnRpYWw8UHJlZmVyZW5jZXM+IHwgbnVsbCk6IFByZWZlcmVuY2VzID0+IHtcbiAgY29uc3QgbWVyZ2VkID0geyAuLi5kZWZhdWx0UHJlZmVyZW5jZXMsIC4uLihwcmVmcyA/PyB7fSkgfTtcbiAgcmV0dXJuIHtcbiAgICAuLi5tZXJnZWQsXG4gICAgc29ydGluZzogbm9ybWFsaXplU29ydGluZyhtZXJnZWQuc29ydGluZyksXG4gICAgY3VzdG9tU3RyYXRlZ2llczogbm9ybWFsaXplU3RyYXRlZ2llcyhtZXJnZWQuY3VzdG9tU3RyYXRlZ2llcylcbiAgfTtcbn07XG5cbmV4cG9ydCBjb25zdCBsb2FkUHJlZmVyZW5jZXMgPSBhc3luYyAoKTogUHJvbWlzZTxQcmVmZXJlbmNlcz4gPT4ge1xuICBjb25zdCBzdG9yZWQgPSBhd2FpdCBnZXRTdG9yZWRWYWx1ZTxQcmVmZXJlbmNlcz4oUFJFRkVSRU5DRVNfS0VZKTtcbiAgY29uc3QgbWVyZ2VkID0gbm9ybWFsaXplUHJlZmVyZW5jZXMoc3RvcmVkID8/IHVuZGVmaW5lZCk7XG4gIHNldExvZ2dlclByZWZlcmVuY2VzKG1lcmdlZCk7XG4gIHJldHVybiBtZXJnZWQ7XG59O1xuXG5leHBvcnQgY29uc3Qgc2F2ZVByZWZlcmVuY2VzID0gYXN5bmMgKHByZWZzOiBQYXJ0aWFsPFByZWZlcmVuY2VzPik6IFByb21pc2U8UHJlZmVyZW5jZXM+ID0+IHtcbiAgbG9nRGVidWcoXCJVcGRhdGluZyBwcmVmZXJlbmNlc1wiLCB7IGtleXM6IE9iamVjdC5rZXlzKHByZWZzKSB9KTtcbiAgY29uc3QgY3VycmVudCA9IGF3YWl0IGxvYWRQcmVmZXJlbmNlcygpO1xuICBjb25zdCBtZXJnZWQgPSBub3JtYWxpemVQcmVmZXJlbmNlcyh7IC4uLmN1cnJlbnQsIC4uLnByZWZzIH0pO1xuICBhd2FpdCBzZXRTdG9yZWRWYWx1ZShQUkVGRVJFTkNFU19LRVksIG1lcmdlZCk7XG4gIHNldExvZ2dlclByZWZlcmVuY2VzKG1lcmdlZCk7XG4gIHJldHVybiBtZXJnZWQ7XG59O1xuIiwgImltcG9ydCB7IFBhZ2VDb250ZXh0LCBUYWJNZXRhZGF0YSB9IGZyb20gXCIuLi8uLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IG5vcm1hbGl6ZVVybCwgcGFyc2VZb3VUdWJlVXJsLCBleHRyYWN0WW91VHViZU1ldGFkYXRhRnJvbUh0bWwgfSBmcm9tIFwiLi9sb2dpYy5qc1wiO1xuaW1wb3J0IHsgZ2V0R2VuZXJhIH0gZnJvbSBcIi4vZ2VuZXJhUmVnaXN0cnkuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGxvYWRQcmVmZXJlbmNlcyB9IGZyb20gXCIuLi9wcmVmZXJlbmNlcy5qc1wiO1xuXG5pbnRlcmZhY2UgRXh0cmFjdGlvblJlc3BvbnNlIHtcbiAgZGF0YTogUGFnZUNvbnRleHQgfCBudWxsO1xuICBlcnJvcj86IHN0cmluZztcbiAgc3RhdHVzOlxuICAgIHwgJ09LJ1xuICAgIHwgJ1JFU1RSSUNURUQnXG4gICAgfCAnSU5KRUNUSU9OX0ZBSUxFRCdcbiAgICB8ICdOT19SRVNQT05TRSdcbiAgICB8ICdOT19IT1NUX1BFUk1JU1NJT04nXG4gICAgfCAnRlJBTUVfQUNDRVNTX0RFTklFRCc7XG59XG5cbi8vIFNpbXBsZSBjb25jdXJyZW5jeSBjb250cm9sXG5sZXQgYWN0aXZlRmV0Y2hlcyA9IDA7XG5jb25zdCBNQVhfQ09OQ1VSUkVOVF9GRVRDSEVTID0gNTsgLy8gQ29uc2VydmF0aXZlIGxpbWl0IHRvIGF2b2lkIHJhdGUgbGltaXRpbmdcbmNvbnN0IEZFVENIX1FVRVVFOiAoKCkgPT4gdm9pZClbXSA9IFtdO1xuXG5jb25zdCBmZXRjaFdpdGhUaW1lb3V0ID0gYXN5bmMgKHVybDogc3RyaW5nLCB0aW1lb3V0ID0gMjAwMCk6IFByb21pc2U8UmVzcG9uc2U+ID0+IHtcbiAgICBjb25zdCBjb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuICAgIGNvbnN0IGlkID0gc2V0VGltZW91dCgoKSA9PiBjb250cm9sbGVyLmFib3J0KCksIHRpbWVvdXQpO1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godXJsLCB7IHNpZ25hbDogY29udHJvbGxlci5zaWduYWwgfSk7XG4gICAgICAgIHJldHVybiByZXNwb25zZTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgICBjbGVhclRpbWVvdXQoaWQpO1xuICAgIH1cbn07XG5cbmNvbnN0IGVucXVldWVGZXRjaCA9IGFzeW5jIDxUPihmbjogKCkgPT4gUHJvbWlzZTxUPik6IFByb21pc2U8VD4gPT4ge1xuICAgIGlmIChhY3RpdmVGZXRjaGVzID49IE1BWF9DT05DVVJSRU5UX0ZFVENIRVMpIHtcbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBGRVRDSF9RVUVVRS5wdXNoKHJlc29sdmUpKTtcbiAgICB9XG4gICAgYWN0aXZlRmV0Y2hlcysrO1xuICAgIHRyeSB7XG4gICAgICAgIHJldHVybiBhd2FpdCBmbigpO1xuICAgIH0gZmluYWxseSB7XG4gICAgICAgIGFjdGl2ZUZldGNoZXMtLTtcbiAgICAgICAgaWYgKEZFVENIX1FVRVVFLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGNvbnN0IG5leHQgPSBGRVRDSF9RVUVVRS5zaGlmdCgpO1xuICAgICAgICAgICAgaWYgKG5leHQpIG5leHQoKTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbmV4cG9ydCBjb25zdCBleHRyYWN0UGFnZUNvbnRleHQgPSBhc3luYyAodGFiOiBUYWJNZXRhZGF0YSB8IGNocm9tZS50YWJzLlRhYik6IFByb21pc2U8RXh0cmFjdGlvblJlc3BvbnNlPiA9PiB7XG4gIHRyeSB7XG4gICAgaWYgKCF0YWIgfHwgIXRhYi51cmwpIHtcbiAgICAgICAgcmV0dXJuIHsgZGF0YTogbnVsbCwgZXJyb3I6IFwiVGFiIG5vdCBmb3VuZCBvciBubyBVUkxcIiwgc3RhdHVzOiAnTk9fUkVTUE9OU0UnIH07XG4gICAgfVxuXG4gICAgaWYgKFxuICAgICAgdGFiLnVybC5zdGFydHNXaXRoKCdjaHJvbWU6Ly8nKSB8fFxuICAgICAgdGFiLnVybC5zdGFydHNXaXRoKCdlZGdlOi8vJykgfHxcbiAgICAgIHRhYi51cmwuc3RhcnRzV2l0aCgnYWJvdXQ6JykgfHxcbiAgICAgIHRhYi51cmwuc3RhcnRzV2l0aCgnY2hyb21lLWV4dGVuc2lvbjovLycpIHx8XG4gICAgICB0YWIudXJsLnN0YXJ0c1dpdGgoJ2Nocm9tZS1lcnJvcjovLycpXG4gICAgKSB7XG4gICAgICAgIHJldHVybiB7IGRhdGE6IG51bGwsIGVycm9yOiBcIlJlc3RyaWN0ZWQgVVJMIHNjaGVtZVwiLCBzdGF0dXM6ICdSRVNUUklDVEVEJyB9O1xuICAgIH1cblxuICAgIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gICAgbGV0IGJhc2VsaW5lID0gYnVpbGRCYXNlbGluZUNvbnRleHQodGFiIGFzIGNocm9tZS50YWJzLlRhYiwgcHJlZnMuY3VzdG9tR2VuZXJhKTtcblxuICAgIC8vIEZldGNoIGFuZCBlbnJpY2ggZm9yIFlvdVR1YmUgaWYgYXV0aG9yIGlzIG1pc3NpbmcgYW5kIGl0IGlzIGEgdmlkZW9cbiAgICBjb25zdCB0YXJnZXRVcmwgPSB0YWIudXJsO1xuICAgIGNvbnN0IHVybE9iaiA9IG5ldyBVUkwodGFyZ2V0VXJsKTtcbiAgICBjb25zdCBob3N0bmFtZSA9IHVybE9iai5ob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgJycpO1xuICAgIGlmICgoaG9zdG5hbWUuZW5kc1dpdGgoJ3lvdXR1YmUuY29tJykgfHwgaG9zdG5hbWUuZW5kc1dpdGgoJ3lvdXR1LmJlJykpICYmICghYmFzZWxpbmUuYXV0aG9yT3JDcmVhdG9yIHx8IGJhc2VsaW5lLmdlbnJlID09PSAnVmlkZW8nKSkge1xuICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAvLyBXZSB1c2UgYSBxdWV1ZSB0byBwcmV2ZW50IGZsb29kaW5nIHJlcXVlc3RzXG4gICAgICAgICAgICAgYXdhaXQgZW5xdWV1ZUZldGNoKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaFdpdGhUaW1lb3V0KHRhcmdldFVybCk7XG4gICAgICAgICAgICAgICAgIGlmIChyZXNwb25zZS5vaykge1xuICAgICAgICAgICAgICAgICAgICAgY29uc3QgaHRtbCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG1ldGFkYXRhID0gZXh0cmFjdFlvdVR1YmVNZXRhZGF0YUZyb21IdG1sKGh0bWwpO1xuXG4gICAgICAgICAgICAgICAgICAgICBpZiAobWV0YWRhdGEuYXV0aG9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgYmFzZWxpbmUuYXV0aG9yT3JDcmVhdG9yID0gbWV0YWRhdGEuYXV0aG9yO1xuICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgaWYgKG1ldGFkYXRhLmdlbnJlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgYmFzZWxpbmUuZ2VucmUgPSBtZXRhZGF0YS5nZW5yZTtcbiAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgIGlmIChtZXRhZGF0YS5wdWJsaXNoZWRBdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgIGJhc2VsaW5lLnB1Ymxpc2hlZEF0ID0gbWV0YWRhdGEucHVibGlzaGVkQXQ7XG4gICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9KTtcbiAgICAgICAgIH0gY2F0Y2ggKGZldGNoRXJyKSB7XG4gICAgICAgICAgICAgbG9nRGVidWcoXCJGYWlsZWQgdG8gZmV0Y2ggWW91VHViZSBwYWdlIGNvbnRlbnRcIiwgeyBlcnJvcjogU3RyaW5nKGZldGNoRXJyKSB9KTtcbiAgICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgZGF0YTogYmFzZWxpbmUsXG4gICAgICBzdGF0dXM6ICdPSydcbiAgICB9O1xuXG4gIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgIGxvZ0RlYnVnKGBFeHRyYWN0aW9uIGZhaWxlZCBmb3IgdGFiICR7dGFiLmlkfWAsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICByZXR1cm4ge1xuICAgICAgZGF0YTogbnVsbCxcbiAgICAgIGVycm9yOiBTdHJpbmcoZSksXG4gICAgICBzdGF0dXM6ICdJTkpFQ1RJT05fRkFJTEVEJ1xuICAgIH07XG4gIH1cbn07XG5cbmNvbnN0IGJ1aWxkQmFzZWxpbmVDb250ZXh0ID0gKHRhYjogY2hyb21lLnRhYnMuVGFiLCBjdXN0b21HZW5lcmE/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogUGFnZUNvbnRleHQgPT4ge1xuICBjb25zdCB1cmwgPSB0YWIudXJsIHx8IFwiXCI7XG4gIGxldCBob3N0bmFtZSA9IFwiXCI7XG4gIHRyeSB7XG4gICAgaG9zdG5hbWUgPSBuZXcgVVJMKHVybCkuaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sICcnKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGhvc3RuYW1lID0gXCJcIjtcbiAgfVxuXG4gIC8vIERldGVybWluZSBPYmplY3QgVHlwZSBmaXJzdFxuICBsZXQgb2JqZWN0VHlwZTogUGFnZUNvbnRleHRbJ29iamVjdFR5cGUnXSA9ICd1bmtub3duJztcbiAgbGV0IGF1dGhvck9yQ3JlYXRvcjogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cbiAgaWYgKHVybC5pbmNsdWRlcygnL2xvZ2luJykgfHwgdXJsLmluY2x1ZGVzKCcvc2lnbmluJykpIHtcbiAgICAgIG9iamVjdFR5cGUgPSAnbG9naW4nO1xuICB9IGVsc2UgaWYgKGhvc3RuYW1lLmluY2x1ZGVzKCd5b3V0dWJlLmNvbScpIHx8IGhvc3RuYW1lLmluY2x1ZGVzKCd5b3V0dS5iZScpKSB7XG4gICAgICBjb25zdCB7IHZpZGVvSWQgfSA9IHBhcnNlWW91VHViZVVybCh1cmwpO1xuICAgICAgaWYgKHZpZGVvSWQpIG9iamVjdFR5cGUgPSAndmlkZW8nO1xuXG4gICAgICAvLyBUcnkgdG8gZ3Vlc3MgY2hhbm5lbCBmcm9tIFVSTCBpZiBwb3NzaWJsZVxuICAgICAgaWYgKHVybC5pbmNsdWRlcygnL0AnKSkge1xuICAgICAgICAgIGNvbnN0IHBhcnRzID0gdXJsLnNwbGl0KCcvQCcpO1xuICAgICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGhhbmRsZSA9IHBhcnRzWzFdLnNwbGl0KCcvJylbMF07XG4gICAgICAgICAgICAgIGF1dGhvck9yQ3JlYXRvciA9ICdAJyArIGhhbmRsZTtcbiAgICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHVybC5pbmNsdWRlcygnL2MvJykpIHtcbiAgICAgICAgICBjb25zdCBwYXJ0cyA9IHVybC5zcGxpdCgnL2MvJyk7XG4gICAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgYXV0aG9yT3JDcmVhdG9yID0gZGVjb2RlVVJJQ29tcG9uZW50KHBhcnRzWzFdLnNwbGl0KCcvJylbMF0pO1xuICAgICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodXJsLmluY2x1ZGVzKCcvdXNlci8nKSkge1xuICAgICAgICAgIGNvbnN0IHBhcnRzID0gdXJsLnNwbGl0KCcvdXNlci8nKTtcbiAgICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICBhdXRob3JPckNyZWF0b3IgPSBkZWNvZGVVUklDb21wb25lbnQocGFydHNbMV0uc3BsaXQoJy8nKVswXSk7XG4gICAgICAgICAgfVxuICAgICAgfVxuICB9IGVsc2UgaWYgKGhvc3RuYW1lID09PSAnZ2l0aHViLmNvbScgJiYgdXJsLmluY2x1ZGVzKCcvcHVsbC8nKSkge1xuICAgICAgb2JqZWN0VHlwZSA9ICd0aWNrZXQnO1xuICB9IGVsc2UgaWYgKGhvc3RuYW1lID09PSAnZ2l0aHViLmNvbScgJiYgIXVybC5pbmNsdWRlcygnL3B1bGwvJykgJiYgdXJsLnNwbGl0KCcvJykubGVuZ3RoID49IDUpIHtcbiAgICAgIC8vIHJvdWdoIGNoZWNrIGZvciByZXBvXG4gICAgICBvYmplY3RUeXBlID0gJ3JlcG8nO1xuICB9XG5cbiAgLy8gRGV0ZXJtaW5lIEdlbnJlXG4gIC8vIFByaW9yaXR5IDE6IFNpdGUtc3BlY2lmaWMgZXh0cmFjdGlvbiAoZGVyaXZlZCBmcm9tIG9iamVjdFR5cGUpXG4gIGxldCBnZW5yZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG4gIGlmIChvYmplY3RUeXBlID09PSAndmlkZW8nKSBnZW5yZSA9ICdWaWRlbyc7XG4gIGVsc2UgaWYgKG9iamVjdFR5cGUgPT09ICdyZXBvJyB8fCBvYmplY3RUeXBlID09PSAndGlja2V0JykgZ2VucmUgPSAnRGV2ZWxvcG1lbnQnO1xuXG4gIC8vIFByaW9yaXR5IDI6IEZhbGxiYWNrIHRvIFJlZ2lzdHJ5XG4gIGlmICghZ2VucmUpIHtcbiAgICAgZ2VucmUgPSBnZXRHZW5lcmEoaG9zdG5hbWUsIGN1c3RvbUdlbmVyYSkgfHwgdW5kZWZpbmVkO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjYW5vbmljYWxVcmw6IHVybCB8fCBudWxsLFxuICAgIG5vcm1hbGl6ZWRVcmw6IG5vcm1hbGl6ZVVybCh1cmwpLFxuICAgIHNpdGVOYW1lOiBob3N0bmFtZSB8fCBudWxsLFxuICAgIHBsYXRmb3JtOiBob3N0bmFtZSB8fCBudWxsLFxuICAgIG9iamVjdFR5cGUsXG4gICAgb2JqZWN0SWQ6IHVybCB8fCBudWxsLFxuICAgIHRpdGxlOiB0YWIudGl0bGUgfHwgbnVsbCxcbiAgICBnZW5yZSxcbiAgICBkZXNjcmlwdGlvbjogbnVsbCxcbiAgICBhdXRob3JPckNyZWF0b3I6IGF1dGhvck9yQ3JlYXRvcixcbiAgICBwdWJsaXNoZWRBdDogbnVsbCxcbiAgICBtb2RpZmllZEF0OiBudWxsLFxuICAgIGxhbmd1YWdlOiBudWxsLFxuICAgIHRhZ3M6IFtdLFxuICAgIGJyZWFkY3J1bWJzOiBbXSxcbiAgICBpc0F1ZGlibGU6IGZhbHNlLFxuICAgIGlzTXV0ZWQ6IGZhbHNlLFxuICAgIGlzQ2FwdHVyaW5nOiBmYWxzZSxcbiAgICBwcm9ncmVzczogbnVsbCxcbiAgICBoYXNVbnNhdmVkQ2hhbmdlc0xpa2VseTogZmFsc2UsXG4gICAgaXNBdXRoZW50aWNhdGVkTGlrZWx5OiBmYWxzZSxcbiAgICBzb3VyY2VzOiB7XG4gICAgICBjYW5vbmljYWxVcmw6ICd1cmwnLFxuICAgICAgbm9ybWFsaXplZFVybDogJ3VybCcsXG4gICAgICBzaXRlTmFtZTogJ3VybCcsXG4gICAgICBwbGF0Zm9ybTogJ3VybCcsXG4gICAgICBvYmplY3RUeXBlOiAndXJsJyxcbiAgICAgIHRpdGxlOiB0YWIudGl0bGUgPyAndGFiJyA6ICd1cmwnLFxuICAgICAgZ2VucmU6ICdyZWdpc3RyeSdcbiAgICB9LFxuICAgIGNvbmZpZGVuY2U6IHt9XG4gIH07XG59O1xuIiwgImV4cG9ydCB0eXBlIENhdGVnb3J5UnVsZSA9IHN0cmluZyB8IHN0cmluZ1tdO1xuXG5leHBvcnQgaW50ZXJmYWNlIENhdGVnb3J5RGVmaW5pdGlvbiB7XG4gIGNhdGVnb3J5OiBzdHJpbmc7XG4gIHJ1bGVzOiBDYXRlZ29yeVJ1bGVbXTtcbn1cblxuZXhwb3J0IGNvbnN0IENBVEVHT1JZX0RFRklOSVRJT05TOiBDYXRlZ29yeURlZmluaXRpb25bXSA9IFtcbiAge1xuICAgIGNhdGVnb3J5OiBcIkRldmVsb3BtZW50XCIsXG4gICAgcnVsZXM6IFtcImdpdGh1YlwiLCBcInN0YWNrb3ZlcmZsb3dcIiwgXCJsb2NhbGhvc3RcIiwgXCJqaXJhXCIsIFwiZ2l0bGFiXCJdXG4gIH0sXG4gIHtcbiAgICBjYXRlZ29yeTogXCJXb3JrXCIsXG4gICAgcnVsZXM6IFtcbiAgICAgIFtcImdvb2dsZVwiLCBcImRvY3NcIl0sIFtcImdvb2dsZVwiLCBcInNoZWV0c1wiXSwgW1wiZ29vZ2xlXCIsIFwic2xpZGVzXCJdLFxuICAgICAgXCJsaW5rZWRpblwiLCBcInNsYWNrXCIsIFwiem9vbVwiLCBcInRlYW1zXCJcbiAgICBdXG4gIH0sXG4gIHtcbiAgICBjYXRlZ29yeTogXCJFbnRlcnRhaW5tZW50XCIsXG4gICAgcnVsZXM6IFtcIm5ldGZsaXhcIiwgXCJzcG90aWZ5XCIsIFwiaHVsdVwiLCBcImRpc25leVwiLCBcInlvdXR1YmVcIl1cbiAgfSxcbiAge1xuICAgIGNhdGVnb3J5OiBcIlNvY2lhbFwiLFxuICAgIHJ1bGVzOiBbXCJ0d2l0dGVyXCIsIFwiZmFjZWJvb2tcIiwgXCJpbnN0YWdyYW1cIiwgXCJyZWRkaXRcIiwgXCJ0aWt0b2tcIiwgXCJwaW50ZXJlc3RcIl1cbiAgfSxcbiAge1xuICAgIGNhdGVnb3J5OiBcIlNob3BwaW5nXCIsXG4gICAgcnVsZXM6IFtcImFtYXpvblwiLCBcImViYXlcIiwgXCJ3YWxtYXJ0XCIsIFwidGFyZ2V0XCIsIFwic2hvcGlmeVwiXVxuICB9LFxuICB7XG4gICAgY2F0ZWdvcnk6IFwiTmV3c1wiLFxuICAgIHJ1bGVzOiBbXCJjbm5cIiwgXCJiYmNcIiwgXCJueXRpbWVzXCIsIFwid2FzaGluZ3RvbnBvc3RcIiwgXCJmb3huZXdzXCJdXG4gIH0sXG4gIHtcbiAgICBjYXRlZ29yeTogXCJFZHVjYXRpb25cIixcbiAgICBydWxlczogW1wiY291cnNlcmFcIiwgXCJ1ZGVteVwiLCBcImVkeFwiLCBcImtoYW5hY2FkZW15XCIsIFwiY2FudmFzXCJdXG4gIH0sXG4gIHtcbiAgICBjYXRlZ29yeTogXCJUcmF2ZWxcIixcbiAgICBydWxlczogW1wiZXhwZWRpYVwiLCBcImJvb2tpbmdcIiwgXCJhaXJibmJcIiwgXCJ0cmlwYWR2aXNvclwiLCBcImtheWFrXCJdXG4gIH0sXG4gIHtcbiAgICBjYXRlZ29yeTogXCJIZWFsdGhcIixcbiAgICBydWxlczogW1wid2VibWRcIiwgXCJtYXlvY2xpbmljXCIsIFwibmloLmdvdlwiLCBcImhlYWx0aFwiXVxuICB9LFxuICB7XG4gICAgY2F0ZWdvcnk6IFwiU3BvcnRzXCIsXG4gICAgcnVsZXM6IFtcImVzcG5cIiwgXCJuYmFcIiwgXCJuZmxcIiwgXCJtbGJcIiwgXCJmaWZhXCJdXG4gIH0sXG4gIHtcbiAgICBjYXRlZ29yeTogXCJUZWNobm9sb2d5XCIsXG4gICAgcnVsZXM6IFtcInRlY2hjcnVuY2hcIiwgXCJ3aXJlZFwiLCBcInRoZXZlcmdlXCIsIFwiYXJzdGVjaG5pY2FcIl1cbiAgfSxcbiAge1xuICAgIGNhdGVnb3J5OiBcIlNjaWVuY2VcIixcbiAgICBydWxlczogW1wic2NpZW5jZVwiLCBcIm5hdHVyZS5jb21cIiwgXCJuYXNhLmdvdlwiXVxuICB9LFxuICB7XG4gICAgY2F0ZWdvcnk6IFwiR2FtaW5nXCIsXG4gICAgcnVsZXM6IFtcInR3aXRjaFwiLCBcInN0ZWFtXCIsIFwicm9ibG94XCIsIFwiaWduXCIsIFwiZ2FtZXNwb3RcIl1cbiAgfSxcbiAge1xuICAgIGNhdGVnb3J5OiBcIk11c2ljXCIsXG4gICAgcnVsZXM6IFtcInNvdW5kY2xvdWRcIiwgXCJiYW5kY2FtcFwiLCBcImxhc3QuZm1cIl1cbiAgfSxcbiAge1xuICAgIGNhdGVnb3J5OiBcIkFydFwiLFxuICAgIHJ1bGVzOiBbXCJkZXZpYW50YXJ0XCIsIFwiYmVoYW5jZVwiLCBcImRyaWJiYmxlXCIsIFwiYXJ0c3RhdGlvblwiXVxuICB9XG5dO1xuXG5leHBvcnQgY29uc3QgZ2V0Q2F0ZWdvcnlGcm9tVXJsID0gKHVybDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3QgbG93ZXJVcmwgPSB1cmwudG9Mb3dlckNhc2UoKTtcbiAgZm9yIChjb25zdCBkZWYgb2YgQ0FURUdPUllfREVGSU5JVElPTlMpIHtcbiAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZGVmLnJ1bGVzKSB7XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShydWxlKSkge1xuICAgICAgICBpZiAocnVsZS5ldmVyeShwYXJ0ID0+IGxvd2VyVXJsLmluY2x1ZGVzKHBhcnQpKSkge1xuICAgICAgICAgIHJldHVybiBkZWYuY2F0ZWdvcnk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChsb3dlclVybC5pbmNsdWRlcyhydWxlKSkge1xuICAgICAgICAgIHJldHVybiBkZWYuY2F0ZWdvcnk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIFwiVW5jYXRlZ29yaXplZFwiO1xufTtcbiIsICJpbXBvcnQgeyBQYWdlQ29udGV4dCB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcblxuZXhwb3J0IGludGVyZmFjZSBDYXRlZ29yaXphdGlvblJ1bGUge1xuICBpZDogc3RyaW5nO1xuICBjb25kaXRpb246IChjb250ZXh0OiBQYWdlQ29udGV4dCkgPT4gYm9vbGVhbjtcbiAgY2F0ZWdvcnk6IHN0cmluZztcbn1cblxuZXhwb3J0IGNvbnN0IENBVEVHT1JJWkFUSU9OX1JVTEVTOiBDYXRlZ29yaXphdGlvblJ1bGVbXSA9IFtcbiAge1xuICAgIGlkOiBcImVudGVydGFpbm1lbnQtcGxhdGZvcm1zXCIsXG4gICAgY29uZGl0aW9uOiAoZGF0YSkgPT4gWydZb3VUdWJlJywgJ05ldGZsaXgnLCAnU3BvdGlmeScsICdUd2l0Y2gnXS5pbmNsdWRlcyhkYXRhLnBsYXRmb3JtIHx8ICcnKSxcbiAgICBjYXRlZ29yeTogXCJFbnRlcnRhaW5tZW50XCJcbiAgfSxcbiAge1xuICAgIGlkOiBcImRldmVsb3BtZW50LXBsYXRmb3Jtc1wiLFxuICAgIGNvbmRpdGlvbjogKGRhdGEpID0+IFsnR2l0SHViJywgJ1N0YWNrIE92ZXJmbG93JywgJ0ppcmEnLCAnR2l0TGFiJ10uaW5jbHVkZXMoZGF0YS5wbGF0Zm9ybSB8fCAnJyksXG4gICAgY2F0ZWdvcnk6IFwiRGV2ZWxvcG1lbnRcIlxuICB9LFxuICB7XG4gICAgaWQ6IFwiZ29vZ2xlLXdvcmstc3VpdGVcIixcbiAgICBjb25kaXRpb246IChkYXRhKSA9PiBkYXRhLnBsYXRmb3JtID09PSAnR29vZ2xlJyAmJiBbJ2RvY3MnLCAnc2hlZXRzJywgJ3NsaWRlcyddLnNvbWUoayA9PiBkYXRhLm5vcm1hbGl6ZWRVcmwuaW5jbHVkZXMoaykpLFxuICAgIGNhdGVnb3J5OiBcIldvcmtcIlxuICB9XG5dO1xuXG5leHBvcnQgZnVuY3Rpb24gZGV0ZXJtaW5lQ2F0ZWdvcnlGcm9tQ29udGV4dChkYXRhOiBQYWdlQ29udGV4dCk6IHN0cmluZyB7XG4gIC8vIDEuIENoZWNrIGV4cGxpY2l0IHJ1bGVzXG4gIGZvciAoY29uc3QgcnVsZSBvZiBDQVRFR09SSVpBVElPTl9SVUxFUykge1xuICAgIGlmIChydWxlLmNvbmRpdGlvbihkYXRhKSkge1xuICAgICAgcmV0dXJuIHJ1bGUuY2F0ZWdvcnk7XG4gICAgfVxuICB9XG5cbiAgLy8gMi4gRmFsbGJhY2sgdG8gT2JqZWN0IFR5cGUgbWFwcGluZ1xuICBpZiAoZGF0YS5vYmplY3RUeXBlICYmIGRhdGEub2JqZWN0VHlwZSAhPT0gJ3Vua25vd24nKSB7XG4gICAgaWYgKGRhdGEub2JqZWN0VHlwZSA9PT0gJ3ZpZGVvJykgcmV0dXJuICdFbnRlcnRhaW5tZW50JztcbiAgICBpZiAoZGF0YS5vYmplY3RUeXBlID09PSAnYXJ0aWNsZScpIHJldHVybiAnTmV3cyc7XG4gICAgLy8gQ2FwaXRhbGl6ZSBmaXJzdCBsZXR0ZXIgZm9yIG90aGVyIHR5cGVzXG4gICAgcmV0dXJuIGRhdGEub2JqZWN0VHlwZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGRhdGEub2JqZWN0VHlwZS5zbGljZSgxKTtcbiAgfVxuXG4gIC8vIDMuIERlZmF1bHQgZmFsbGJhY2tcbiAgcmV0dXJuIFwiR2VuZXJhbCBXZWJcIjtcbn1cbiIsICJpbXBvcnQgeyBUYWJNZXRhZGF0YSwgUGFnZUNvbnRleHQgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBsb2dEZWJ1ZywgbG9nRXJyb3IgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgZXh0cmFjdFBhZ2VDb250ZXh0IH0gZnJvbSBcIi4vZXh0cmFjdGlvbi9pbmRleC5qc1wiO1xuaW1wb3J0IHsgZ2V0Q2F0ZWdvcnlGcm9tVXJsIH0gZnJvbSBcIi4vY2F0ZWdvcnlSdWxlcy5qc1wiO1xuaW1wb3J0IHsgZGV0ZXJtaW5lQ2F0ZWdvcnlGcm9tQ29udGV4dCB9IGZyb20gXCIuL2NhdGVnb3JpemF0aW9uUnVsZXMuanNcIjtcblxuZXhwb3J0IGludGVyZmFjZSBDb250ZXh0UmVzdWx0IHtcbiAgY29udGV4dDogc3RyaW5nO1xuICBzb3VyY2U6ICdBSScgfCAnSGV1cmlzdGljJyB8ICdFeHRyYWN0aW9uJztcbiAgZGF0YT86IFBhZ2VDb250ZXh0O1xuICBlcnJvcj86IHN0cmluZztcbiAgc3RhdHVzPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgQ2FjaGVFbnRyeSB7XG4gIHJlc3VsdDogQ29udGV4dFJlc3VsdDtcbiAgdGltZXN0YW1wOiBudW1iZXI7XG4gIC8vIFdlIHVzZSB0aGlzIHRvIGRlY2lkZSB3aGVuIHRvIGludmFsaWRhdGUgY2FjaGVcbn1cblxuY29uc3QgY29udGV4dENhY2hlID0gbmV3IE1hcDxzdHJpbmcsIENhY2hlRW50cnk+KCk7XG5jb25zdCBDQUNIRV9UVExfU1VDQ0VTUyA9IDI0ICogNjAgKiA2MCAqIDEwMDA7IC8vIDI0IGhvdXJzXG5jb25zdCBDQUNIRV9UVExfRVJST1IgPSA1ICogNjAgKiAxMDAwOyAvLyA1IG1pbnV0ZXNcblxuZXhwb3J0IGNvbnN0IGFuYWx5emVUYWJDb250ZXh0ID0gYXN5bmMgKFxuICB0YWJzOiBUYWJNZXRhZGF0YVtdLFxuICBvblByb2dyZXNzPzogKGNvbXBsZXRlZDogbnVtYmVyLCB0b3RhbDogbnVtYmVyKSA9PiB2b2lkXG4pOiBQcm9taXNlPE1hcDxudW1iZXIsIENvbnRleHRSZXN1bHQ+PiA9PiB7XG4gIGNvbnN0IGNvbnRleHRNYXAgPSBuZXcgTWFwPG51bWJlciwgQ29udGV4dFJlc3VsdD4oKTtcbiAgbGV0IGNvbXBsZXRlZCA9IDA7XG4gIGNvbnN0IHRvdGFsID0gdGFicy5sZW5ndGg7XG5cbiAgY29uc3QgcHJvbWlzZXMgPSB0YWJzLm1hcChhc3luYyAodGFiKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGNhY2hlS2V5ID0gYCR7dGFiLmlkfTo6JHt0YWIudXJsfWA7XG4gICAgICBjb25zdCBjYWNoZWQgPSBjb250ZXh0Q2FjaGUuZ2V0KGNhY2hlS2V5KTtcblxuICAgICAgaWYgKGNhY2hlZCkge1xuICAgICAgICBjb25zdCBpc0Vycm9yID0gY2FjaGVkLnJlc3VsdC5zdGF0dXMgPT09ICdFUlJPUicgfHwgISFjYWNoZWQucmVzdWx0LmVycm9yO1xuICAgICAgICBjb25zdCB0dGwgPSBpc0Vycm9yID8gQ0FDSEVfVFRMX0VSUk9SIDogQ0FDSEVfVFRMX1NVQ0NFU1M7XG5cbiAgICAgICAgaWYgKERhdGUubm93KCkgLSBjYWNoZWQudGltZXN0YW1wIDwgdHRsKSB7XG4gICAgICAgICAgY29udGV4dE1hcC5zZXQodGFiLmlkLCBjYWNoZWQucmVzdWx0KTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29udGV4dENhY2hlLmRlbGV0ZShjYWNoZUtleSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZmV0Y2hDb250ZXh0Rm9yVGFiKHRhYik7XG5cbiAgICAgIC8vIENhY2hlIHdpdGggZXhwaXJhdGlvbiBsb2dpY1xuICAgICAgY29udGV4dENhY2hlLnNldChjYWNoZUtleSwge1xuICAgICAgICByZXN1bHQsXG4gICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKVxuICAgICAgfSk7XG5cbiAgICAgIGNvbnRleHRNYXAuc2V0KHRhYi5pZCwgcmVzdWx0KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nRXJyb3IoYEZhaWxlZCB0byBhbmFseXplIGNvbnRleHQgZm9yIHRhYiAke3RhYi5pZH1gLCB7IGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICAgICAgLy8gRXZlbiBpZiBmZXRjaENvbnRleHRGb3JUYWIgZmFpbHMgY29tcGxldGVseSwgd2UgdHJ5IGEgc2FmZSBzeW5jIGZhbGxiYWNrXG4gICAgICBjb250ZXh0TWFwLnNldCh0YWIuaWQsIHsgY29udGV4dDogXCJVbmNhdGVnb3JpemVkXCIsIHNvdXJjZTogJ0hldXJpc3RpYycsIGVycm9yOiBTdHJpbmcoZXJyb3IpLCBzdGF0dXM6ICdFUlJPUicgfSk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGNvbXBsZXRlZCsrO1xuICAgICAgaWYgKG9uUHJvZ3Jlc3MpIG9uUHJvZ3Jlc3MoY29tcGxldGVkLCB0b3RhbCk7XG4gICAgfVxuICB9KTtcblxuICBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gIHJldHVybiBjb250ZXh0TWFwO1xufTtcblxuY29uc3QgZmV0Y2hDb250ZXh0Rm9yVGFiID0gYXN5bmMgKHRhYjogVGFiTWV0YWRhdGEpOiBQcm9taXNlPENvbnRleHRSZXN1bHQ+ID0+IHtcbiAgLy8gMS4gUnVuIEdlbmVyaWMgRXh0cmFjdGlvbiAoQWx3YXlzKVxuICBsZXQgZGF0YTogUGFnZUNvbnRleHQgfCBudWxsID0gbnVsbDtcbiAgbGV0IGVycm9yOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gIGxldCBzdGF0dXM6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICB0cnkge1xuICAgICAgY29uc3QgZXh0cmFjdGlvbiA9IGF3YWl0IGV4dHJhY3RQYWdlQ29udGV4dCh0YWIpO1xuICAgICAgZGF0YSA9IGV4dHJhY3Rpb24uZGF0YTtcbiAgICAgIGVycm9yID0gZXh0cmFjdGlvbi5lcnJvcjtcbiAgICAgIHN0YXR1cyA9IGV4dHJhY3Rpb24uc3RhdHVzO1xuICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2dEZWJ1ZyhgRXh0cmFjdGlvbiBmYWlsZWQgZm9yIHRhYiAke3RhYi5pZH1gLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICBlcnJvciA9IFN0cmluZyhlKTtcbiAgICAgIHN0YXR1cyA9ICdFUlJPUic7XG4gIH1cblxuICBsZXQgY29udGV4dCA9IFwiVW5jYXRlZ29yaXplZFwiO1xuICBsZXQgc291cmNlOiBDb250ZXh0UmVzdWx0Wydzb3VyY2UnXSA9ICdIZXVyaXN0aWMnO1xuXG4gIC8vIDIuIFRyeSB0byBEZXRlcm1pbmUgQ2F0ZWdvcnkgZnJvbSBFeHRyYWN0aW9uIERhdGFcbiAgaWYgKGRhdGEpIHtcbiAgICBjb250ZXh0ID0gZGV0ZXJtaW5lQ2F0ZWdvcnlGcm9tQ29udGV4dChkYXRhKTtcbiAgICBzb3VyY2UgPSAnRXh0cmFjdGlvbic7XG4gIH1cblxuICAvLyAzLiBGYWxsYmFjayB0byBMb2NhbCBIZXVyaXN0aWMgKFVSTCBSZWdleClcbiAgaWYgKGNvbnRleHQgPT09IFwiVW5jYXRlZ29yaXplZFwiKSB7XG4gICAgICBjb25zdCBoID0gYXdhaXQgbG9jYWxIZXVyaXN0aWModGFiKTtcbiAgICAgIGlmIChoLmNvbnRleHQgIT09IFwiVW5jYXRlZ29yaXplZFwiKSB7XG4gICAgICAgICAgY29udGV4dCA9IGguY29udGV4dDtcbiAgICAgICAgICAvLyBzb3VyY2UgcmVtYWlucyAnSGV1cmlzdGljJyAob3IgbWF5YmUgd2Ugc2hvdWxkIHNheSAnSGV1cmlzdGljJyBpcyB0aGUgc291cmNlPylcbiAgICAgICAgICAvLyBUaGUgbG9jYWxIZXVyaXN0aWMgZnVuY3Rpb24gcmV0dXJucyB7IHNvdXJjZTogJ0hldXJpc3RpYycgfVxuICAgICAgfVxuICB9XG5cbiAgLy8gNC4gRmFsbGJhY2sgdG8gQUkgKExMTSkgLSBSRU1PVkVEXG4gIC8vIFRoZSBIdWdnaW5nRmFjZSBBUEkgZW5kcG9pbnQgaXMgNDEwIEdvbmUgYW5kL29yIHJlcXVpcmVzIGF1dGhlbnRpY2F0aW9uIHdoaWNoIHdlIGRvIG5vdCBoYXZlLlxuICAvLyBUaGUgY29kZSBoYXMgYmVlbiByZW1vdmVkIHRvIHByZXZlbnQgZXJyb3JzLlxuXG4gIGlmIChjb250ZXh0ICE9PSBcIlVuY2F0ZWdvcml6ZWRcIiAmJiBzb3VyY2UgIT09IFwiRXh0cmFjdGlvblwiKSB7XG4gICAgZXJyb3IgPSB1bmRlZmluZWQ7XG4gICAgc3RhdHVzID0gdW5kZWZpbmVkO1xuICB9XG5cbiAgcmV0dXJuIHsgY29udGV4dCwgc291cmNlLCBkYXRhOiBkYXRhIHx8IHVuZGVmaW5lZCwgZXJyb3IsIHN0YXR1cyB9O1xufTtcblxuY29uc3QgbG9jYWxIZXVyaXN0aWMgPSBhc3luYyAodGFiOiBUYWJNZXRhZGF0YSk6IFByb21pc2U8Q29udGV4dFJlc3VsdD4gPT4ge1xuICBjb25zdCBjb250ZXh0ID0gZ2V0Q2F0ZWdvcnlGcm9tVXJsKHRhYi51cmwpO1xuICByZXR1cm4geyBjb250ZXh0LCBzb3VyY2U6ICdIZXVyaXN0aWMnIH07XG59O1xuIiwgImltcG9ydCB7IGdyb3VwVGFicywgZ2V0Q3VzdG9tU3RyYXRlZ2llcywgZ2V0RmllbGRWYWx1ZSwgcmVxdWlyZXNDb250ZXh0QW5hbHlzaXMgfSBmcm9tIFwiLi9ncm91cGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IHNvcnRUYWJzLCBjb21wYXJlQnksIGNvbXBhcmVCeVNvcnRpbmdSdWxlcyB9IGZyb20gXCIuL3NvcnRpbmdTdHJhdGVnaWVzLmpzXCI7XG5pbXBvcnQgeyBhbmFseXplVGFiQ29udGV4dCB9IGZyb20gXCIuL2NvbnRleHRBbmFseXNpcy5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcsIGxvZ0Vycm9yLCBsb2dJbmZvIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IEdyb3VwaW5nU2VsZWN0aW9uLCBQcmVmZXJlbmNlcywgVGFiR3JvdXAsIFRhYk1ldGFkYXRhLCBTb3J0aW5nUnVsZSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGdldFN0b3JlZFZhbHVlLCBzZXRTdG9yZWRWYWx1ZSB9IGZyb20gXCIuL3N0b3JhZ2UuanNcIjtcbmltcG9ydCB7IG1hcENocm9tZVRhYiwgYXNBcnJheSB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcblxuY29uc3QgZ2V0VGFic0ZvckZpbHRlciA9IGFzeW5jIChmaWx0ZXI/OiBHcm91cGluZ1NlbGVjdGlvbik6IFByb21pc2U8Y2hyb21lLnRhYnMuVGFiW10+ID0+IHtcbiAgY29uc3Qgd2luZG93SWRzID0gZmlsdGVyPy53aW5kb3dJZHM7XG4gIGNvbnN0IHRhYklkcyA9IGZpbHRlcj8udGFiSWRzO1xuICBjb25zdCBoYXNXaW5kb3dJZHMgPSB3aW5kb3dJZHMgJiYgd2luZG93SWRzLmxlbmd0aCA+IDA7XG4gIGNvbnN0IGhhc1RhYklkcyA9IHRhYklkcyAmJiB0YWJJZHMubGVuZ3RoID4gMDtcblxuICBpZiAoIWZpbHRlciB8fCAoIWhhc1dpbmRvd0lkcyAmJiAhaGFzVGFiSWRzKSkge1xuICAgIHJldHVybiBjaHJvbWUudGFicy5xdWVyeSh7fSk7XG4gIH1cblxuICBjb25zdCBwcm9taXNlczogUHJvbWlzZTxhbnk+W10gPSBbXTtcblxuICBpZiAoaGFzV2luZG93SWRzKSB7XG4gICAgd2luZG93SWRzLmZvckVhY2god2luZG93SWQgPT4ge1xuICAgICAgcHJvbWlzZXMucHVzaChjaHJvbWUudGFicy5xdWVyeSh7IHdpbmRvd0lkIH0pLmNhdGNoKCgpID0+IFtdKSk7XG4gICAgfSk7XG4gIH1cblxuICBpZiAoaGFzVGFiSWRzKSB7XG4gICAgdGFiSWRzLmZvckVhY2godGFiSWQgPT4ge1xuICAgICAgcHJvbWlzZXMucHVzaChjaHJvbWUudGFicy5nZXQodGFiSWQpLmNhdGNoKCgpID0+IG51bGwpKTtcbiAgICB9KTtcbiAgfVxuXG4gIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG5cbiAgLy8gRmxhdHRlbiBhbmQgZmlsdGVyIG91dCBudWxsc1xuICBjb25zdCBhbGxUYWJzOiBjaHJvbWUudGFicy5UYWJbXSA9IFtdO1xuICBmb3IgKGNvbnN0IHJlcyBvZiByZXN1bHRzKSB7XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShyZXMpKSB7XG4gICAgICAgICAgYWxsVGFicy5wdXNoKC4uLnJlcyk7XG4gICAgICB9IGVsc2UgaWYgKHJlcykge1xuICAgICAgICAgIGFsbFRhYnMucHVzaChyZXMpO1xuICAgICAgfVxuICB9XG5cbiAgLy8gRGVkdXBsaWNhdGUgYnkgSURcbiAgY29uc3QgdW5pcXVlVGFicyA9IG5ldyBNYXA8bnVtYmVyLCBjaHJvbWUudGFicy5UYWI+KCk7XG4gIGZvciAoY29uc3QgdGFiIG9mIGFsbFRhYnMpIHtcbiAgICAgIGlmICh0YWIuaWQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHVuaXF1ZVRhYnMuc2V0KHRhYi5pZCwgdGFiKTtcbiAgICAgIH1cbiAgfVxuXG4gIHJldHVybiBBcnJheS5mcm9tKHVuaXF1ZVRhYnMudmFsdWVzKCkpO1xufTtcblxuZXhwb3J0IGNvbnN0IGZldGNoQ3VycmVudFRhYkdyb3VwcyA9IGFzeW5jIChcbiAgcHJlZmVyZW5jZXM6IFByZWZlcmVuY2VzLFxuICBvblByb2dyZXNzPzogKGNvbXBsZXRlZDogbnVtYmVyLCB0b3RhbDogbnVtYmVyKSA9PiB2b2lkXG4pOiBQcm9taXNlPFRhYkdyb3VwW10+ID0+IHtcbiAgdHJ5IHtcbiAgY29uc3QgdGFicyA9IGF3YWl0IGNocm9tZS50YWJzLnF1ZXJ5KHt9KTtcbiAgY29uc3QgZ3JvdXBzID0gYXdhaXQgY2hyb21lLnRhYkdyb3Vwcy5xdWVyeSh7fSk7XG4gIGNvbnN0IGdyb3VwTWFwID0gbmV3IE1hcChncm91cHMubWFwKGcgPT4gW2cuaWQsIGddKSk7XG5cbiAgLy8gTWFwIHRhYnMgdG8gbWV0YWRhdGFcbiAgY29uc3QgbWFwcGVkID0gdGFicy5tYXAobWFwQ2hyb21lVGFiKS5maWx0ZXIoKHQpOiB0IGlzIFRhYk1ldGFkYXRhID0+IEJvb2xlYW4odCkpO1xuXG4gIGlmIChyZXF1aXJlc0NvbnRleHRBbmFseXNpcyhwcmVmZXJlbmNlcy5zb3J0aW5nKSkge1xuICAgICAgY29uc3QgY29udGV4dE1hcCA9IGF3YWl0IGFuYWx5emVUYWJDb250ZXh0KG1hcHBlZCwgb25Qcm9ncmVzcyk7XG4gICAgICBtYXBwZWQuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgICBjb25zdCByZXMgPSBjb250ZXh0TWFwLmdldCh0YWIuaWQpO1xuICAgICAgICB0YWIuY29udGV4dCA9IHJlcz8uY29udGV4dDtcbiAgICAgICAgdGFiLmNvbnRleHREYXRhID0gcmVzPy5kYXRhO1xuICAgICAgfSk7XG4gIH1cblxuICBjb25zdCByZXN1bHRHcm91cHM6IFRhYkdyb3VwW10gPSBbXTtcbiAgY29uc3QgdGFic0J5R3JvdXBJZCA9IG5ldyBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YVtdPigpO1xuICBjb25zdCB0YWJzQnlXaW5kb3dVbmdyb3VwZWQgPSBuZXcgTWFwPG51bWJlciwgVGFiTWV0YWRhdGFbXT4oKTtcblxuICBtYXBwZWQuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgY29uc3QgZ3JvdXBJZCA9IHRhYi5ncm91cElkID8/IC0xO1xuICAgICAgaWYgKGdyb3VwSWQgIT09IC0xKSB7XG4gICAgICAgICAgaWYgKCF0YWJzQnlHcm91cElkLmhhcyhncm91cElkKSkgdGFic0J5R3JvdXBJZC5zZXQoZ3JvdXBJZCwgW10pO1xuICAgICAgICAgIHRhYnNCeUdyb3VwSWQuZ2V0KGdyb3VwSWQpIS5wdXNoKHRhYik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgICBpZiAoIXRhYnNCeVdpbmRvd1VuZ3JvdXBlZC5oYXModGFiLndpbmRvd0lkKSkgdGFic0J5V2luZG93VW5ncm91cGVkLnNldCh0YWIud2luZG93SWQsIFtdKTtcbiAgICAgICAgICAgdGFic0J5V2luZG93VW5ncm91cGVkLmdldCh0YWIud2luZG93SWQpIS5wdXNoKHRhYik7XG4gICAgICB9XG4gIH0pO1xuXG4gIC8vIENyZWF0ZSBUYWJHcm91cCBvYmplY3RzIGZvciBhY3R1YWwgZ3JvdXBzXG4gIGZvciAoY29uc3QgW2dyb3VwSWQsIGdyb3VwVGFic10gb2YgdGFic0J5R3JvdXBJZCkge1xuICAgICAgY29uc3QgYnJvd3Nlckdyb3VwID0gZ3JvdXBNYXAuZ2V0KGdyb3VwSWQpO1xuICAgICAgaWYgKGJyb3dzZXJHcm91cCkge1xuICAgICAgICAgIHJlc3VsdEdyb3Vwcy5wdXNoKHtcbiAgICAgICAgICAgICAgaWQ6IGBncm91cC0ke2dyb3VwSWR9YCxcbiAgICAgICAgICAgICAgd2luZG93SWQ6IGJyb3dzZXJHcm91cC53aW5kb3dJZCxcbiAgICAgICAgICAgICAgbGFiZWw6IGJyb3dzZXJHcm91cC50aXRsZSB8fCBcIlVudGl0bGVkIEdyb3VwXCIsXG4gICAgICAgICAgICAgIGNvbG9yOiBicm93c2VyR3JvdXAuY29sb3IsXG4gICAgICAgICAgICAgIHRhYnM6IHNvcnRUYWJzKGdyb3VwVGFicywgcHJlZmVyZW5jZXMuc29ydGluZyksXG4gICAgICAgICAgICAgIHJlYXNvbjogXCJNYW51YWxcIlxuICAgICAgICAgIH0pO1xuICAgICAgfVxuICB9XG5cbiAgLy8gSGFuZGxlIHVuZ3JvdXBlZCB0YWJzXG4gIGZvciAoY29uc3QgW3dpbmRvd0lkLCB0YWJzXSBvZiB0YWJzQnlXaW5kb3dVbmdyb3VwZWQpIHtcbiAgICAgIHJlc3VsdEdyb3Vwcy5wdXNoKHtcbiAgICAgICAgICBpZDogYHVuZ3JvdXBlZC0ke3dpbmRvd0lkfWAsXG4gICAgICAgICAgd2luZG93SWQ6IHdpbmRvd0lkLFxuICAgICAgICAgIGxhYmVsOiBcIlVuZ3JvdXBlZFwiLFxuICAgICAgICAgIGNvbG9yOiBcImdyZXlcIixcbiAgICAgICAgICB0YWJzOiBzb3J0VGFicyh0YWJzLCBwcmVmZXJlbmNlcy5zb3J0aW5nKSxcbiAgICAgICAgICByZWFzb246IFwiVW5ncm91cGVkXCJcbiAgICAgIH0pO1xuICB9XG5cbiAgbG9nSW5mbyhcIkZldGNoZWQgY3VycmVudCB0YWIgZ3JvdXBzXCIsIHsgZ3JvdXBzOiByZXN1bHRHcm91cHMubGVuZ3RoLCB0YWJzOiBtYXBwZWQubGVuZ3RoIH0pO1xuICByZXR1cm4gcmVzdWx0R3JvdXBzO1xuICB9IGNhdGNoIChlKSB7XG4gICAgbG9nRXJyb3IoXCJFcnJvciBpbiBmZXRjaEN1cnJlbnRUYWJHcm91cHNcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgIHRocm93IGU7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBjYWxjdWxhdGVUYWJHcm91cHMgPSBhc3luYyAoXG4gIHByZWZlcmVuY2VzOiBQcmVmZXJlbmNlcyxcbiAgZmlsdGVyPzogR3JvdXBpbmdTZWxlY3Rpb24sXG4gIG9uUHJvZ3Jlc3M/OiAoY29tcGxldGVkOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+IHZvaWRcbik6IFByb21pc2U8VGFiR3JvdXBbXT4gPT4ge1xuICBjb25zdCBjaHJvbWVUYWJzID0gYXdhaXQgZ2V0VGFic0ZvckZpbHRlcihmaWx0ZXIpO1xuICBjb25zdCB3aW5kb3dJZFNldCA9IG5ldyBTZXQoZmlsdGVyPy53aW5kb3dJZHMgPz8gW10pO1xuICBjb25zdCB0YWJJZFNldCA9IG5ldyBTZXQoZmlsdGVyPy50YWJJZHMgPz8gW10pO1xuICBjb25zdCBoYXNGaWx0ZXJzID0gd2luZG93SWRTZXQuc2l6ZSA+IDAgfHwgdGFiSWRTZXQuc2l6ZSA+IDA7XG4gIGNvbnN0IGZpbHRlcmVkVGFicyA9IGNocm9tZVRhYnMuZmlsdGVyKCh0YWIpID0+IHtcbiAgICBpZiAoIWhhc0ZpbHRlcnMpIHJldHVybiB0cnVlO1xuICAgIHJldHVybiAodGFiLndpbmRvd0lkICYmIHdpbmRvd0lkU2V0Lmhhcyh0YWIud2luZG93SWQpKSB8fCAodGFiLmlkICYmIHRhYklkU2V0Lmhhcyh0YWIuaWQpKTtcbiAgfSk7XG4gIGNvbnN0IG1hcHBlZCA9IGZpbHRlcmVkVGFic1xuICAgIC5tYXAobWFwQ2hyb21lVGFiKVxuICAgIC5maWx0ZXIoKHRhYik6IHRhYiBpcyBUYWJNZXRhZGF0YSA9PiBCb29sZWFuKHRhYikpO1xuXG4gIGlmIChyZXF1aXJlc0NvbnRleHRBbmFseXNpcyhwcmVmZXJlbmNlcy5zb3J0aW5nKSkge1xuICAgIGNvbnN0IGNvbnRleHRNYXAgPSBhd2FpdCBhbmFseXplVGFiQ29udGV4dChtYXBwZWQsIG9uUHJvZ3Jlc3MpO1xuICAgIG1hcHBlZC5mb3JFYWNoKHRhYiA9PiB7XG4gICAgICBjb25zdCByZXMgPSBjb250ZXh0TWFwLmdldCh0YWIuaWQpO1xuICAgICAgdGFiLmNvbnRleHQgPSByZXM/LmNvbnRleHQ7XG4gICAgICB0YWIuY29udGV4dERhdGEgPSByZXM/LmRhdGE7XG4gICAgfSk7XG4gIH1cblxuICBjb25zdCBncm91cGVkID0gZ3JvdXBUYWJzKG1hcHBlZCwgcHJlZmVyZW5jZXMuc29ydGluZyk7XG4gIGdyb3VwZWQuZm9yRWFjaCgoZ3JvdXApID0+IHtcbiAgICBncm91cC50YWJzID0gc29ydFRhYnMoZ3JvdXAudGFicywgcHJlZmVyZW5jZXMuc29ydGluZyk7XG4gIH0pO1xuICBsb2dJbmZvKFwiQ2FsY3VsYXRlZCB0YWIgZ3JvdXBzXCIsIHsgZ3JvdXBzOiBncm91cGVkLmxlbmd0aCwgdGFiczogbWFwcGVkLmxlbmd0aCB9KTtcbiAgcmV0dXJuIGdyb3VwZWQ7XG59O1xuXG5jb25zdCBWQUxJRF9DT0xPUlMgPSBbXCJncmV5XCIsIFwiYmx1ZVwiLCBcInJlZFwiLCBcInllbGxvd1wiLCBcImdyZWVuXCIsIFwicGlua1wiLCBcInB1cnBsZVwiLCBcImN5YW5cIiwgXCJvcmFuZ2VcIl07XG5cbmV4cG9ydCBjb25zdCBhcHBseVRhYkdyb3VwcyA9IGFzeW5jIChncm91cHM6IFRhYkdyb3VwW10pID0+IHtcbiAgY29uc3QgY2xhaW1lZEdyb3VwSWRzID0gbmV3IFNldDxudW1iZXI+KCk7XG5cbiAgZm9yIChjb25zdCBncm91cCBvZiBncm91cHMpIHtcbiAgICBsZXQgdGFic1RvUHJvY2VzczogeyB3aW5kb3dJZDogbnVtYmVyLCB0YWJzOiBUYWJNZXRhZGF0YVtdIH1bXSA9IFtdO1xuXG4gICAgaWYgKGdyb3VwLndpbmRvd01vZGUgPT09ICduZXcnKSB7XG4gICAgICBpZiAoZ3JvdXAudGFicy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgZmlyc3QgPSBncm91cC50YWJzWzBdO1xuICAgICAgICAgIGNvbnN0IHdpbiA9IGF3YWl0IGNocm9tZS53aW5kb3dzLmNyZWF0ZSh7IHRhYklkOiBmaXJzdC5pZCB9KTtcbiAgICAgICAgICBjb25zdCB3aW5JZCA9IHdpbi5pZCE7XG4gICAgICAgICAgY29uc3Qgb3RoZXJzID0gZ3JvdXAudGFicy5zbGljZSgxKS5tYXAodCA9PiB0LmlkKTtcbiAgICAgICAgICBpZiAob3RoZXJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGF3YWl0IGNocm9tZS50YWJzLm1vdmUob3RoZXJzLCB7IHdpbmRvd0lkOiB3aW5JZCwgaW5kZXg6IC0xIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0YWJzVG9Qcm9jZXNzLnB1c2goeyB3aW5kb3dJZDogd2luSWQsIHRhYnM6IGdyb3VwLnRhYnMgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBsb2dFcnJvcihcIkVycm9yIGNyZWF0aW5nIG5ldyB3aW5kb3cgZm9yIGdyb3VwXCIsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZ3JvdXAud2luZG93TW9kZSA9PT0gJ2NvbXBvdW5kJykge1xuICAgICAgaWYgKGdyb3VwLnRhYnMubGVuZ3RoID4gMCkge1xuICAgICAgICAvLyBEZXRlcm1pbmUgdGFyZ2V0IHdpbmRvdyAobWFqb3JpdHkgd2lucylcbiAgICAgICAgY29uc3QgY291bnRzID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcj4oKTtcbiAgICAgICAgZ3JvdXAudGFicy5mb3JFYWNoKHQgPT4gY291bnRzLnNldCh0LndpbmRvd0lkLCAoY291bnRzLmdldCh0LndpbmRvd0lkKSB8fCAwKSArIDEpKTtcbiAgICAgICAgbGV0IHRhcmdldFdpbmRvd0lkID0gZ3JvdXAudGFic1swXS53aW5kb3dJZDtcbiAgICAgICAgbGV0IG1heCA9IDA7XG4gICAgICAgIGZvciAoY29uc3QgW3dpZCwgY291bnRdIG9mIGNvdW50cykge1xuICAgICAgICAgIGlmIChjb3VudCA+IG1heCkgeyBtYXggPSBjb3VudDsgdGFyZ2V0V2luZG93SWQgPSB3aWQ7IH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE1vdmUgdGFicyBub3QgaW4gdGFyZ2V0XG4gICAgICAgIGNvbnN0IHRvTW92ZSA9IGdyb3VwLnRhYnMuZmlsdGVyKHQgPT4gdC53aW5kb3dJZCAhPT0gdGFyZ2V0V2luZG93SWQpLm1hcCh0ID0+IHQuaWQpO1xuICAgICAgICBpZiAodG9Nb3ZlLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMubW92ZSh0b01vdmUsIHsgd2luZG93SWQ6IHRhcmdldFdpbmRvd0lkLCBpbmRleDogLTEgfSk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgbG9nRXJyb3IoXCJFcnJvciBtb3ZpbmcgdGFicyBmb3IgY29tcG91bmQgZ3JvdXBcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0YWJzVG9Qcm9jZXNzLnB1c2goeyB3aW5kb3dJZDogdGFyZ2V0V2luZG93SWQsIHRhYnM6IGdyb3VwLnRhYnMgfSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIEN1cnJlbnQgbW9kZTogc3BsaXQgYnkgc291cmNlIHdpbmRvd1xuICAgICAgY29uc3QgbWFwID0gZ3JvdXAudGFicy5yZWR1Y2U8TWFwPG51bWJlciwgVGFiTWV0YWRhdGFbXT4+KChhY2MsIHRhYikgPT4ge1xuICAgICAgICBjb25zdCBleGlzdGluZyA9IGFjYy5nZXQodGFiLndpbmRvd0lkKSA/PyBbXTtcbiAgICAgICAgZXhpc3RpbmcucHVzaCh0YWIpO1xuICAgICAgICBhY2Muc2V0KHRhYi53aW5kb3dJZCwgZXhpc3RpbmcpO1xuICAgICAgICByZXR1cm4gYWNjO1xuICAgICAgfSwgbmV3IE1hcCgpKTtcbiAgICAgIGZvciAoY29uc3QgW3dpZCwgdF0gb2YgbWFwKSB7XG4gICAgICAgIHRhYnNUb1Byb2Nlc3MucHVzaCh7IHdpbmRvd0lkOiB3aWQsIHRhYnM6IHQgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCB7IHdpbmRvd0lkOiB0YXJnZXRXaW5JZCwgdGFicyB9IG9mIHRhYnNUb1Byb2Nlc3MpIHtcbiAgICAgIC8vIEZpbmQgY2FuZGlkYXRlIGdyb3VwIElEIHRvIHJldXNlXG4gICAgICBsZXQgY2FuZGlkYXRlR3JvdXBJZDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuICAgICAgY29uc3QgY291bnRzID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcj4oKTtcbiAgICAgIGZvciAoY29uc3QgdCBvZiB0YWJzKSB7XG4gICAgICAgIC8vIE9ubHkgY29uc2lkZXIgZ3JvdXBzIHRoYXQgd2VyZSBhbHJlYWR5IGluIHRoaXMgd2luZG93XG4gICAgICAgIGlmICh0Lmdyb3VwSWQgJiYgdC5ncm91cElkICE9PSAtMSAmJiB0LndpbmRvd0lkID09PSB0YXJnZXRXaW5JZCkge1xuICAgICAgICAgIGNvdW50cy5zZXQodC5ncm91cElkLCAoY291bnRzLmdldCh0Lmdyb3VwSWQpIHx8IDApICsgMSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gUHJpb3JpdGl6ZSB0aGUgbW9zdCBmcmVxdWVudCBncm91cCBJRCB0aGF0IGhhc24ndCBiZWVuIGNsYWltZWQgeWV0XG4gICAgICBjb25zdCBzb3J0ZWRDYW5kaWRhdGVzID0gQXJyYXkuZnJvbShjb3VudHMuZW50cmllcygpKVxuICAgICAgICAuc29ydCgoYSwgYikgPT4gYlsxXSAtIGFbMV0pXG4gICAgICAgIC5tYXAoKFtpZF0pID0+IGlkKTtcblxuICAgICAgZm9yIChjb25zdCBpZCBvZiBzb3J0ZWRDYW5kaWRhdGVzKSB7XG4gICAgICAgIGlmICghY2xhaW1lZEdyb3VwSWRzLmhhcyhpZCkpIHtcbiAgICAgICAgICBjYW5kaWRhdGVHcm91cElkID0gaWQ7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gRmFsbGJhY2s6IElmIG5vIGNhbmRpZGF0ZSBncm91cCBJRCBmcm9tIHRhYnMgKGUuZy4gc2luZ2xlIG5ldyB0YWIpLCBsb29rIGZvciBleGlzdGluZyBncm91cCBieSBsYWJlbCBpbiB0YXJnZXQgd2luZG93XG4gICAgICBpZiAoY2FuZGlkYXRlR3JvdXBJZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgIGNvbnN0IHdpbmRvd0dyb3VwcyA9IGF3YWl0IGNocm9tZS50YWJHcm91cHMucXVlcnkoeyB3aW5kb3dJZDogdGFyZ2V0V2luSWQgfSk7XG4gICAgICAgICAgIC8vIEZpbmQgYSBncm91cCB3aXRoIHRoZSBzYW1lIHRpdGxlIHRoYXQgaGFzbid0IGJlZW4gY2xhaW1lZCB5ZXRcbiAgICAgICAgICAgY29uc3QgbWF0Y2hpbmdHcm91cCA9IHdpbmRvd0dyb3Vwcy5maW5kKGcgPT4gZy50aXRsZSA9PT0gZ3JvdXAubGFiZWwgJiYgIWNsYWltZWRHcm91cElkcy5oYXMoZy5pZCkpO1xuICAgICAgICAgICBpZiAobWF0Y2hpbmdHcm91cCkge1xuICAgICAgICAgICAgIGNhbmRpZGF0ZUdyb3VwSWQgPSBtYXRjaGluZ0dyb3VwLmlkO1xuICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgbG9nRXJyb3IoXCJFcnJvciBmaW5kaW5nIG1hdGNoaW5nIGdyb3VwIGJ5IGxhYmVsXCIsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBsZXQgZmluYWxHcm91cElkOiBudW1iZXI7XG5cbiAgICAgIGlmIChjYW5kaWRhdGVHcm91cElkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgY2xhaW1lZEdyb3VwSWRzLmFkZChjYW5kaWRhdGVHcm91cElkKTtcbiAgICAgICAgZmluYWxHcm91cElkID0gY2FuZGlkYXRlR3JvdXBJZDtcblxuICAgICAgICAvLyBDbGVhbiB1cCBsZWZ0b3ZlcnMgYW5kIGFkZCBtaXNzaW5nIHRhYnNcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBleGlzdGluZ1RhYnMgPSBhd2FpdCBjaHJvbWUudGFicy5xdWVyeSh7IGdyb3VwSWQ6IGZpbmFsR3JvdXBJZCB9KTtcbiAgICAgICAgICBjb25zdCBleGlzdGluZ1RhYklkcyA9IG5ldyBTZXQoZXhpc3RpbmdUYWJzLm1hcCh0ID0+IHQuaWQpKTtcbiAgICAgICAgICBjb25zdCB0YXJnZXRUYWJJZHMgPSBuZXcgU2V0KHRhYnMubWFwKHQgPT4gdC5pZCkpO1xuXG4gICAgICAgICAgLy8gMS4gVW5ncm91cCB0YWJzIHRoYXQgc2hvdWxkbid0IGJlIGhlcmVcbiAgICAgICAgICBjb25zdCBsZWZ0b3ZlcnMgPSBleGlzdGluZ1RhYnMuZmlsdGVyKHQgPT4gdC5pZCAhPT0gdW5kZWZpbmVkICYmICF0YXJnZXRUYWJJZHMuaGFzKHQuaWQpKTtcbiAgICAgICAgICBpZiAobGVmdG92ZXJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGF3YWl0IGNocm9tZS50YWJzLnVuZ3JvdXAobGVmdG92ZXJzLm1hcCh0ID0+IHQuaWQhKSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gMi4gQWRkIG9ubHkgdGhlIHRhYnMgdGhhdCBhcmVuJ3QgYWxyZWFkeSBpbiB0aGUgZ3JvdXBcbiAgICAgICAgICBjb25zdCB0YWJzVG9BZGQgPSB0YWJzLmZpbHRlcih0ID0+ICFleGlzdGluZ1RhYklkcy5oYXModC5pZCkpO1xuICAgICAgICAgIGlmICh0YWJzVG9BZGQubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgIC8vIEZvciBuZXcvY29tcG91bmQsIHRhYnMgbWlnaHQgaGF2ZSBiZWVuIG1vdmVkLCBzbyB3ZSBtdXN0IHBhc3MgdGFiSWRzXG4gICAgICAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMuZ3JvdXAoeyBncm91cElkOiBmaW5hbEdyb3VwSWQsIHRhYklkczogdGFic1RvQWRkLm1hcCh0ID0+IHQuaWQpIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIGxvZ0Vycm9yKFwiRXJyb3IgbWFuYWdpbmcgZ3JvdXAgcmV1c2VcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBDcmVhdGUgbmV3IGdyb3VwIChkZWZhdWx0IGJlaGF2aW9yOiBleHBhbmRlZClcbiAgICAgICAgLy8gRW5zdXJlIHdlIGNyZWF0ZSBpdCBpbiB0aGUgdGFyZ2V0IHdpbmRvdyAoaWYgc3RyaWN0bHkgbmV3LCB0YWJJZHMgaW1wbGllcyB3aW5kb3cgaWYgdGhleSBhcmUgaW4gaXQpXG4gICAgICAgIC8vIElmIHRhYnMgd2VyZSBqdXN0IG1vdmVkLCB0aGV5IGFyZSBpbiB0YXJnZXRXaW5JZC5cbiAgICAgICAgLy8gY2hyb21lLnRhYnMuZ3JvdXAgd2l0aCB0YWJJZHMgd2lsbCBpbmZlciB3aW5kb3cgZnJvbSB0YWJzLlxuICAgICAgICBmaW5hbEdyb3VwSWQgPSBhd2FpdCBjaHJvbWUudGFicy5ncm91cCh7XG4gICAgICAgICAgdGFiSWRzOiB0YWJzLm1hcCh0ID0+IHQuaWQpLFxuICAgICAgICAgIGNyZWF0ZVByb3BlcnRpZXM6IHsgd2luZG93SWQ6IHRhcmdldFdpbklkIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGNsYWltZWRHcm91cElkcy5hZGQoZmluYWxHcm91cElkKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgdXBkYXRlUHJvcHM6IGNocm9tZS50YWJHcm91cHMuVXBkYXRlUHJvcGVydGllcyA9IHtcbiAgICAgICAgdGl0bGU6IGdyb3VwLmxhYmVsXG4gICAgICB9O1xuICAgICAgaWYgKFZBTElEX0NPTE9SUy5pbmNsdWRlcyhncm91cC5jb2xvcikpIHtcbiAgICAgICAgICB1cGRhdGVQcm9wcy5jb2xvciA9IGdyb3VwLmNvbG9yIGFzIGNocm9tZS50YWJHcm91cHMuQ29sb3JFbnVtO1xuICAgICAgfVxuICAgICAgYXdhaXQgY2hyb21lLnRhYkdyb3Vwcy51cGRhdGUoZmluYWxHcm91cElkLCB1cGRhdGVQcm9wcyk7XG4gICAgfVxuICB9XG4gIGxvZ0luZm8oXCJBcHBsaWVkIHRhYiBncm91cHNcIiwgeyBjb3VudDogZ3JvdXBzLmxlbmd0aCB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBhcHBseVRhYlNvcnRpbmcgPSBhc3luYyAoXG4gIHByZWZlcmVuY2VzOiBQcmVmZXJlbmNlcyxcbiAgZmlsdGVyPzogR3JvdXBpbmdTZWxlY3Rpb24sXG4gIG9uUHJvZ3Jlc3M/OiAoY29tcGxldGVkOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+IHZvaWRcbikgPT4ge1xuICBjb25zdCB0YXJnZXRXaW5kb3dJZHMgPSBuZXcgU2V0PG51bWJlcj4oKTtcbiAgbGV0IGNocm9tZVRhYnM6IGNocm9tZS50YWJzLlRhYltdID0gW107XG5cbiAgY29uc3QgZXhwbGljaXRXaW5kb3dJZHMgPSBmaWx0ZXI/LndpbmRvd0lkcyA/PyBbXTtcbiAgY29uc3QgZXhwbGljaXRUYWJJZHMgPSBmaWx0ZXI/LnRhYklkcyA/PyBbXTtcbiAgY29uc3QgaGFzRmlsdGVyID0gZXhwbGljaXRXaW5kb3dJZHMubGVuZ3RoID4gMCB8fCBleHBsaWNpdFRhYklkcy5sZW5ndGggPiAwO1xuXG4gIGlmICghaGFzRmlsdGVyKSB7XG4gICAgICBjaHJvbWVUYWJzID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoe30pO1xuICAgICAgY2hyb21lVGFicy5mb3JFYWNoKHQgPT4geyBpZiAodC53aW5kb3dJZCkgdGFyZ2V0V2luZG93SWRzLmFkZCh0LndpbmRvd0lkKTsgfSk7XG4gIH0gZWxzZSB7XG4gICAgICBleHBsaWNpdFdpbmRvd0lkcy5mb3JFYWNoKGlkID0+IHRhcmdldFdpbmRvd0lkcy5hZGQoaWQpKTtcblxuICAgICAgaWYgKGV4cGxpY2l0VGFiSWRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBjb25zdCBzcGVjaWZpY1RhYnMgPSBhd2FpdCBQcm9taXNlLmFsbChleHBsaWNpdFRhYklkcy5tYXAoaWQgPT4gY2hyb21lLnRhYnMuZ2V0KGlkKS5jYXRjaCgoKSA9PiBudWxsKSkpO1xuICAgICAgICAgIHNwZWNpZmljVGFicy5mb3JFYWNoKHQgPT4ge1xuICAgICAgICAgICAgICBpZiAodCAmJiB0LndpbmRvd0lkKSB0YXJnZXRXaW5kb3dJZHMuYWRkKHQud2luZG93SWQpO1xuICAgICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB3aW5kb3dQcm9taXNlcyA9IEFycmF5LmZyb20odGFyZ2V0V2luZG93SWRzKS5tYXAod2luZG93SWQgPT5cbiAgICAgICAgICBjaHJvbWUudGFicy5xdWVyeSh7IHdpbmRvd0lkIH0pLmNhdGNoKCgpID0+IFtdKVxuICAgICAgKTtcbiAgICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbCh3aW5kb3dQcm9taXNlcyk7XG4gICAgICBjaHJvbWVUYWJzID0gcmVzdWx0cy5mbGF0KCk7XG4gIH1cblxuICBmb3IgKGNvbnN0IHdpbmRvd0lkIG9mIHRhcmdldFdpbmRvd0lkcykge1xuICAgICAgY29uc3Qgd2luZG93VGFicyA9IGNocm9tZVRhYnMuZmlsdGVyKHQgPT4gdC53aW5kb3dJZCA9PT0gd2luZG93SWQpO1xuICAgICAgY29uc3QgbWFwcGVkID0gd2luZG93VGFicy5tYXAobWFwQ2hyb21lVGFiKS5maWx0ZXIoKHQpOiB0IGlzIFRhYk1ldGFkYXRhID0+IEJvb2xlYW4odCkpO1xuXG4gICAgICBpZiAocmVxdWlyZXNDb250ZXh0QW5hbHlzaXMocHJlZmVyZW5jZXMuc29ydGluZykpIHtcbiAgICAgICAgY29uc3QgY29udGV4dE1hcCA9IGF3YWl0IGFuYWx5emVUYWJDb250ZXh0KG1hcHBlZCwgb25Qcm9ncmVzcyk7XG4gICAgICAgIG1hcHBlZC5mb3JFYWNoKHRhYiA9PiB7XG4gICAgICAgICAgY29uc3QgcmVzID0gY29udGV4dE1hcC5nZXQodGFiLmlkKTtcbiAgICAgICAgICB0YWIuY29udGV4dCA9IHJlcz8uY29udGV4dDtcbiAgICAgICAgICB0YWIuY29udGV4dERhdGEgPSByZXM/LmRhdGE7XG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICAvLyBHcm91cCB0YWJzIGJ5IGdyb3VwSWQgdG8gc29ydCB3aXRoaW4gZ3JvdXBzXG4gICAgICBjb25zdCB0YWJzQnlHcm91cCA9IG5ldyBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YVtdPigpO1xuICAgICAgY29uc3QgdW5ncm91cGVkVGFiczogVGFiTWV0YWRhdGFbXSA9IFtdO1xuXG4gICAgICBtYXBwZWQuZm9yRWFjaCh0YWIgPT4ge1xuICAgICAgICBjb25zdCBncm91cElkID0gdGFiLmdyb3VwSWQgPz8gLTE7XG4gICAgICAgIGlmIChncm91cElkICE9PSAtMSkge1xuICAgICAgICAgIGNvbnN0IGdyb3VwID0gdGFic0J5R3JvdXAuZ2V0KGdyb3VwSWQpID8/IFtdO1xuICAgICAgICAgIGdyb3VwLnB1c2godGFiKTtcbiAgICAgICAgICB0YWJzQnlHcm91cC5zZXQoZ3JvdXBJZCwgZ3JvdXApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHVuZ3JvdXBlZFRhYnMucHVzaCh0YWIpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgLy8gMS4gU29ydCB0YWJzIHdpdGhpbiBlYWNoIGdyb3VwXG4gICAgICBmb3IgKGNvbnN0IFtncm91cElkLCB0YWJzXSBvZiB0YWJzQnlHcm91cCkge1xuICAgICAgICBjb25zdCBncm91cFRhYkluZGljZXMgPSB3aW5kb3dUYWJzXG4gICAgICAgICAgLmZpbHRlcih0ID0+IHQuZ3JvdXBJZCA9PT0gZ3JvdXBJZClcbiAgICAgICAgICAubWFwKHQgPT4gdC5pbmRleClcbiAgICAgICAgICAuc29ydCgoYSwgYikgPT4gYSAtIGIpO1xuXG4gICAgICAgIGNvbnN0IHN0YXJ0SW5kZXggPSBncm91cFRhYkluZGljZXNbMF0gPz8gMDtcblxuICAgICAgICBjb25zdCBzb3J0ZWRHcm91cFRhYnMgPSBzb3J0VGFicyh0YWJzLCBwcmVmZXJlbmNlcy5zb3J0aW5nKTtcbiAgICAgICAgY29uc3Qgc29ydGVkSWRzID0gc29ydGVkR3JvdXBUYWJzLm1hcCh0ID0+IHQuaWQpO1xuXG4gICAgICAgIGlmIChzb3J0ZWRJZHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICBhd2FpdCBjaHJvbWUudGFicy5tb3ZlKHNvcnRlZElkcywgeyBpbmRleDogc3RhcnRJbmRleCB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyAyLiBTb3J0IHVuZ3JvdXBlZCB0YWJzXG4gICAgICBpZiAodW5ncm91cGVkVGFicy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvbnN0IHNvcnRlZFVuZ3JvdXBlZCA9IHNvcnRUYWJzKHVuZ3JvdXBlZFRhYnMsIHByZWZlcmVuY2VzLnNvcnRpbmcpO1xuICAgICAgICBjb25zdCBzb3J0ZWRJZHMgPSBzb3J0ZWRVbmdyb3VwZWQubWFwKHQgPT4gdC5pZCk7XG5cbiAgICAgICAgLy8gTW92ZSB0byBpbmRleCAwICh0b3Agb2Ygd2luZG93KVxuICAgICAgICBhd2FpdCBjaHJvbWUudGFicy5tb3ZlKHNvcnRlZElkcywgeyBpbmRleDogMCB9KTtcbiAgICAgIH1cblxuICAgICAgLy8gMy4gU29ydCBHcm91cHMgKGlmIGVuYWJsZWQpXG4gICAgICBhd2FpdCBzb3J0R3JvdXBzSWZFbmFibGVkKHdpbmRvd0lkLCBwcmVmZXJlbmNlcy5zb3J0aW5nLCB0YWJzQnlHcm91cCk7XG4gIH1cbiAgbG9nSW5mbyhcIkFwcGxpZWQgdGFiIHNvcnRpbmdcIik7XG59O1xuXG5jb25zdCBzb3J0R3JvdXBzSWZFbmFibGVkID0gYXN5bmMgKFxuICAgIHdpbmRvd0lkOiBudW1iZXIsXG4gICAgc29ydGluZ1ByZWZlcmVuY2VzOiBzdHJpbmdbXSxcbiAgICB0YWJzQnlHcm91cDogTWFwPG51bWJlciwgVGFiTWV0YWRhdGFbXT5cbikgPT4ge1xuICAgIC8vIENoZWNrIGlmIGFueSBhY3RpdmUgc3RyYXRlZ3kgaGFzIHNvcnRHcm91cHM6IHRydWVcbiAgICBjb25zdCBjdXN0b21TdHJhdHMgPSBnZXRDdXN0b21TdHJhdGVnaWVzKCk7XG4gICAgbGV0IGdyb3VwU29ydGVyU3RyYXRlZ3k6IFJldHVyblR5cGU8dHlwZW9mIGN1c3RvbVN0cmF0cy5maW5kPiB8IG51bGwgPSBudWxsO1xuXG4gICAgZm9yIChjb25zdCBpZCBvZiBzb3J0aW5nUHJlZmVyZW5jZXMpIHtcbiAgICAgICAgY29uc3Qgc3RyYXRlZ3kgPSBjdXN0b21TdHJhdHMuZmluZChzID0+IHMuaWQgPT09IGlkKTtcbiAgICAgICAgaWYgKHN0cmF0ZWd5ICYmIChzdHJhdGVneS5zb3J0R3JvdXBzIHx8IChzdHJhdGVneS5ncm91cFNvcnRpbmdSdWxlcyAmJiBzdHJhdGVneS5ncm91cFNvcnRpbmdSdWxlcy5sZW5ndGggPiAwKSkpIHtcbiAgICAgICAgICAgIGdyb3VwU29ydGVyU3RyYXRlZ3kgPSBzdHJhdGVneTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKCFncm91cFNvcnRlclN0cmF0ZWd5KSByZXR1cm47XG5cbiAgICAvLyBHZXQgZ3JvdXAgZGV0YWlsc1xuICAgIGNvbnN0IGdyb3VwcyA9IGF3YWl0IGNocm9tZS50YWJHcm91cHMucXVlcnkoeyB3aW5kb3dJZCB9KTtcbiAgICBpZiAoZ3JvdXBzLmxlbmd0aCA8PSAxKSByZXR1cm47XG5cbiAgICAvLyBXZSBzb3J0IGdyb3VwcyBiYXNlZCBvbiB0aGUgc3RyYXRlZ3kuXG4gICAgLy8gU2luY2UgY29tcGFyZUJ5IGV4cGVjdHMgVGFiTWV0YWRhdGEsIHdlIG5lZWQgdG8gY3JlYXRlIGEgcmVwcmVzZW50YXRpdmUgVGFiTWV0YWRhdGEgZm9yIGVhY2ggZ3JvdXAuXG4gICAgLy8gV2UnbGwgdXNlIHRoZSBmaXJzdCB0YWIgb2YgdGhlIGdyb3VwIChzb3J0ZWQpIGFzIHRoZSByZXByZXNlbnRhdGl2ZS5cblxuICAgIGNvbnN0IGdyb3VwUmVwczogeyBncm91cDogY2hyb21lLnRhYkdyb3Vwcy5UYWJHcm91cDsgcmVwOiBUYWJNZXRhZGF0YSB9W10gPSBbXTtcblxuICAgIGZvciAoY29uc3QgZ3JvdXAgb2YgZ3JvdXBzKSB7XG4gICAgICAgIGNvbnN0IHRhYnMgPSB0YWJzQnlHcm91cC5nZXQoZ3JvdXAuaWQpO1xuICAgICAgICBpZiAodGFicyAmJiB0YWJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIC8vIHRhYnMgYXJlIGFscmVhZHkgc29ydGVkIGJ5IHNvcnRUYWJzIGluIHByZXZpb3VzIHN0ZXAgaWYgdGhhdCBzdHJhdGVneSB3YXMgYXBwbGllZFxuICAgICAgICAgICAgLy8gb3Igd2UganVzdCB0YWtlIHRoZSBmaXJzdCBvbmUuXG4gICAgICAgICAgICAvLyBJZGVhbGx5IHdlIHVzZSB0aGUgXCJiZXN0XCIgdGFiLlxuICAgICAgICAgICAgLy8gQnV0IHNpbmNlIHdlIGFscmVhZHkgc29ydGVkIHRhYnMgd2l0aGluIGdyb3VwcywgdGFic1swXSBpcyB0aGUgZmlyc3Qgb25lLlxuICAgICAgICAgICAgZ3JvdXBSZXBzLnB1c2goeyBncm91cCwgcmVwOiB0YWJzWzBdIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gU29ydCB0aGUgZ3JvdXBzXG4gICAgaWYgKGdyb3VwU29ydGVyU3RyYXRlZ3kuZ3JvdXBTb3J0aW5nUnVsZXMgJiYgQXJyYXkuaXNBcnJheShncm91cFNvcnRlclN0cmF0ZWd5Lmdyb3VwU29ydGluZ1J1bGVzKSAmJiBncm91cFNvcnRlclN0cmF0ZWd5Lmdyb3VwU29ydGluZ1J1bGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgZ3JvdXBSZXBzLnNvcnQoKGEsIGIpID0+IGNvbXBhcmVCeVNvcnRpbmdSdWxlcyhncm91cFNvcnRlclN0cmF0ZWd5IS5ncm91cFNvcnRpbmdSdWxlcyEsIGEucmVwLCBiLnJlcCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGdyb3VwUmVwcy5zb3J0KChhLCBiKSA9PiBjb21wYXJlQnkoZ3JvdXBTb3J0ZXJTdHJhdGVneSEuaWQsIGEucmVwLCBiLnJlcCkpO1xuICAgIH1cblxuICAgIC8vIEFwcGx5IHRoZSBvcmRlclxuICAgIC8vIGNocm9tZS50YWJHcm91cHMubW92ZShncm91cElkLCB7IGluZGV4OiAuLi4gfSlcbiAgICAvLyBXZSB3YW50IHRoZW0gdG8gYmUgYWZ0ZXIgdW5ncm91cGVkIHRhYnMgKHdoaWNoIGFyZSBhdCBpbmRleCAwLi5OKS5cbiAgICAvLyBBY3R1YWxseSwgY2hyb21lLnRhYkdyb3Vwcy5tb3ZlIGluZGV4IGlzIHRoZSB0YWIgaW5kZXggd2hlcmUgdGhlIGdyb3VwIHN0YXJ0cy5cbiAgICAvLyBJZiB3ZSB3YW50IHRvIHN0cmljdGx5IG9yZGVyIGdyb3Vwcywgd2Ugc2hvdWxkIGNhbGN1bGF0ZSB0aGUgdGFyZ2V0IGluZGV4LlxuICAgIC8vIEJ1dCBzaW5jZSBncm91cHMgYXJlIGNvbnRpZ3VvdXMgYmxvY2tzIG9mIHRhYnMsIHdlIGp1c3QgbmVlZCB0byBwbGFjZSB0aGVtIGluIG9yZGVyLlxuXG4gICAgLy8gQ2FsY3VsYXRlIHRoZSBzdGFydGluZyBpbmRleCBmb3IgZ3JvdXBzLlxuICAgIC8vIFVuZ3JvdXBlZCB0YWJzIGFyZSBhdCB0aGUgc3RhcnQgKGluZGV4IDApLlxuICAgIC8vIFNvIHRoZSBmaXJzdCBncm91cCBzaG91bGQgc3RhcnQgYWZ0ZXIgdGhlIGxhc3QgdW5ncm91cGVkIHRhYi5cbiAgICAvLyBXYWl0LCBlYXJsaWVyIHdlIG1vdmVkIHVuZ3JvdXBlZCB0YWJzIHRvIGluZGV4IDAuXG4gICAgLy8gQnV0IHdlIG5lZWQgdG8ga25vdyBob3cgbWFueSB1bmdyb3VwZWQgdGFicyB0aGVyZSBhcmUgaW4gdGhpcyB3aW5kb3cuXG5cbiAgICAvLyBMZXQncyBnZXQgY3VycmVudCB0YWJzIGFnYWluIG9yIHRyYWNrIGNvdW50P1xuICAgIC8vIFdlIGNhbiBhc3N1bWUgdW5ncm91cGVkIHRhYnMgYXJlIGF0IHRoZSB0b3AuXG4gICAgLy8gQnV0IGB0YWJzQnlHcm91cGAgb25seSBjb250YWlucyBncm91cGVkIHRhYnMuXG4gICAgLy8gV2UgbmVlZCB0byBrbm93IHdoZXJlIHRvIHN0YXJ0IHBsYWNpbmcgZ3JvdXBzLlxuICAgIC8vIFRoZSBzYWZlc3Qgd2F5IGlzIHRvIG1vdmUgdGhlbSBvbmUgYnkgb25lIHRvIHRoZSBlbmQgKG9yIHNwZWNpZmljIGluZGV4KS5cblxuICAgIC8vIElmIHdlIGp1c3QgbW92ZSB0aGVtIGluIG9yZGVyIHRvIGluZGV4IC0xLCB0aGV5IHdpbGwgYXBwZW5kIHRvIHRoZSBlbmQuXG4gICAgLy8gSWYgd2Ugd2FudCB0aGVtIGFmdGVyIHVuZ3JvdXBlZCB0YWJzLCB3ZSBuZWVkIHRvIGZpbmQgdGhlIGluZGV4LlxuXG4gICAgLy8gTGV0J3MgdXNlIGluZGV4ID0gLTEgdG8gcHVzaCB0byBlbmQsIHNlcXVlbnRpYWxseS5cbiAgICAvLyBCdXQgd2FpdCwgaWYgd2UgcHVzaCB0byBlbmQsIHRoZSBvcmRlciBpcyBwcmVzZXJ2ZWQ/XG4gICAgLy8gTm8sIGlmIHdlIGl0ZXJhdGUgc29ydGVkIGdyb3VwcyBhbmQgbW92ZSBlYWNoIHRvIC0xLCB0aGUgbGFzdCBvbmUgbW92ZWQgd2lsbCBiZSBhdCB0aGUgZW5kLlxuICAgIC8vIFNvIHdlIHNob3VsZCBpdGVyYXRlIGluIG9yZGVyIGFuZCBtb3ZlIHRvIC0xPyBObywgdGhhdCB3b3VsZCByZXZlcnNlIHRoZW0gaWYgd2UgY29uc2lkZXIgXCJlbmRcIi5cbiAgICAvLyBBY3R1YWxseSwgaWYgd2UgbW92ZSBHcm91cCBBIHRvIC0xLCBpdCBnb2VzIHRvIGVuZC4gVGhlbiBHcm91cCBCIHRvIC0xLCBpdCBnb2VzIGFmdGVyIEEuXG4gICAgLy8gU28gaXRlcmF0aW5nIGluIHNvcnRlZCBvcmRlciBhbmQgbW92aW5nIHRvIC0xIHdvcmtzIHRvIGFycmFuZ2UgdGhlbSBhdCB0aGUgZW5kIG9mIHRoZSB3aW5kb3cuXG5cbiAgICAvLyBIb3dldmVyLCBpZiB0aGVyZSBhcmUgcGlubmVkIHRhYnMgb3IgdW5ncm91cGVkIHRhYnMsIHRoZXkgc2hvdWxkIHN0YXkgYXQgdG9wP1xuICAgIC8vIFVuZ3JvdXBlZCB0YWJzIHdlcmUgbW92ZWQgdG8gaW5kZXggMC5cbiAgICAvLyBQaW5uZWQgdGFiczogYGNocm9tZS50YWJzLm1vdmVgIGhhbmRsZXMgcGlubmVkIGNvbnN0cmFpbnQgKHBpbm5lZCB0YWJzIG11c3QgYmUgZmlyc3QpLlxuICAgIC8vIEdyb3VwcyBjYW5ub3QgY29udGFpbiBwaW5uZWQgdGFicy5cbiAgICAvLyBTbyBncm91cHMgd2lsbCBiZSBhZnRlciBwaW5uZWQgdGFicy5cbiAgICAvLyBJZiB3ZSBtb3ZlIHRvIC0xLCB0aGV5IGdvIHRvIHRoZSB2ZXJ5IGVuZC5cblxuICAgIC8vIFdoYXQgaWYgd2Ugd2FudCB0aGVtIHNwZWNpZmljYWxseSBhcnJhbmdlZD9cbiAgICAvLyBJZiB3ZSBtb3ZlIHRoZW0gc2VxdWVudGlhbGx5IHRvIC0xLCB0aGV5IHdpbGwgYmUgb3JkZXJlZCBBLCBCLCBDLi4uIGF0IHRoZSBib3R0b20uXG4gICAgLy8gVGhpcyBzZWVtcyBjb3JyZWN0IGZvciBcInNvcnRpbmcgZ3JvdXBzXCIuXG5cbiAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgZ3JvdXBSZXBzKSB7XG4gICAgICAgIGF3YWl0IGNocm9tZS50YWJHcm91cHMubW92ZShpdGVtLmdyb3VwLmlkLCB7IGluZGV4OiAtMSB9KTtcbiAgICB9XG59O1xuXG5leHBvcnQgY29uc3QgY2xvc2VHcm91cCA9IGFzeW5jIChncm91cDogVGFiR3JvdXApID0+IHtcbiAgY29uc3QgaWRzID0gZ3JvdXAudGFicy5tYXAoKHRhYikgPT4gdGFiLmlkKTtcbiAgYXdhaXQgY2hyb21lLnRhYnMucmVtb3ZlKGlkcyk7XG4gIGxvZ0luZm8oXCJDbG9zZWQgZ3JvdXBcIiwgeyBsYWJlbDogZ3JvdXAubGFiZWwsIGNvdW50OiBpZHMubGVuZ3RoIH0pO1xufTtcblxuY29uc3QgZ2V0VGFic0J5SWRzID0gYXN5bmMgKHRhYklkczogbnVtYmVyW10pOiBQcm9taXNlPGNocm9tZS50YWJzLlRhYltdPiA9PiB7XG4gIGlmICghdGFiSWRzLmxlbmd0aCkgcmV0dXJuIFtdO1xuICBjb25zdCBhbGxUYWJzID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoe30pO1xuICBjb25zdCB0YWJNYXAgPSBuZXcgTWFwKGFsbFRhYnMubWFwKHQgPT4gW3QuaWQsIHRdKSk7XG4gIHJldHVybiB0YWJJZHNcbiAgICAubWFwKGlkID0+IHRhYk1hcC5nZXQoaWQpKVxuICAgIC5maWx0ZXIoKHQpOiB0IGlzIGNocm9tZS50YWJzLlRhYiA9PiB0ICE9PSB1bmRlZmluZWQgJiYgdC5pZCAhPT0gdW5kZWZpbmVkICYmIHQud2luZG93SWQgIT09IHVuZGVmaW5lZCk7XG59O1xuXG5leHBvcnQgY29uc3QgbWVyZ2VUYWJzID0gYXN5bmMgKHRhYklkczogbnVtYmVyW10pID0+IHtcbiAgaWYgKCF0YWJJZHMubGVuZ3RoKSByZXR1cm47XG4gIGNvbnN0IHZhbGlkVGFicyA9IGF3YWl0IGdldFRhYnNCeUlkcyh0YWJJZHMpO1xuXG4gIGlmICh2YWxpZFRhYnMubGVuZ3RoID09PSAwKSByZXR1cm47XG5cbiAgLy8gVGFyZ2V0IFdpbmRvdzogVGhlIG9uZSB3aXRoIHRoZSBtb3N0IHNlbGVjdGVkIHRhYnMsIG9yIHRoZSBmaXJzdCBvbmUuXG4gIC8vIFVzaW5nIHRoZSBmaXJzdCB0YWIncyB3aW5kb3cgYXMgdGhlIHRhcmdldC5cbiAgY29uc3QgdGFyZ2V0V2luZG93SWQgPSB2YWxpZFRhYnNbMF0ud2luZG93SWQ7XG5cbiAgLy8gMS4gTW92ZSB0YWJzIHRvIHRhcmdldCB3aW5kb3dcbiAgY29uc3QgdGFic1RvTW92ZSA9IHZhbGlkVGFicy5maWx0ZXIodCA9PiB0LndpbmRvd0lkICE9PSB0YXJnZXRXaW5kb3dJZCk7XG4gIGlmICh0YWJzVG9Nb3ZlLmxlbmd0aCA+IDApIHtcbiAgICBjb25zdCBtb3ZlSWRzID0gdGFic1RvTW92ZS5tYXAodCA9PiB0LmlkISk7XG4gICAgYXdhaXQgY2hyb21lLnRhYnMubW92ZShtb3ZlSWRzLCB7IHdpbmRvd0lkOiB0YXJnZXRXaW5kb3dJZCwgaW5kZXg6IC0xIH0pO1xuICB9XG5cbiAgLy8gMi4gR3JvdXAgdGhlbVxuICAvLyBDaGVjayBpZiB0aGVyZSBpcyBhbiBleGlzdGluZyBncm91cCBpbiB0aGUgdGFyZ2V0IHdpbmRvdyB0aGF0IHdhcyBwYXJ0IG9mIHRoZSBzZWxlY3Rpb24uXG4gIC8vIFdlIHByaW9yaXRpemUgdGhlIGdyb3VwIG9mIHRoZSBmaXJzdCB0YWIgaWYgaXQgaGFzIG9uZS5cbiAgY29uc3QgZmlyc3RUYWJHcm91cElkID0gdmFsaWRUYWJzWzBdLmdyb3VwSWQ7XG4gIGxldCB0YXJnZXRHcm91cElkOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cbiAgaWYgKGZpcnN0VGFiR3JvdXBJZCAmJiBmaXJzdFRhYkdyb3VwSWQgIT09IC0xKSB7XG4gICAgICAvLyBWZXJpZnkgdGhlIGdyb3VwIGlzIGluIHRoZSB0YXJnZXQgd2luZG93IChpdCBzaG91bGQgYmUsIGFzIHdlIHBpY2tlZCB0YXJnZXRXaW5kb3dJZCBmcm9tIHZhbGlkVGFic1swXSlcbiAgICAgIC8vIEJ1dCBpZiB2YWxpZFRhYnNbMF0gd2FzIG1vdmVkIChpdCB3YXNuJ3QsIGFzIGl0IGRlZmluZWQgdGhlIHRhcmdldCksIGl0J3MgZmluZS5cbiAgICAgIHRhcmdldEdyb3VwSWQgPSBmaXJzdFRhYkdyb3VwSWQ7XG4gIH0gZWxzZSB7XG4gICAgICAvLyBMb29rIGZvciBhbnkgb3RoZXIgZ3JvdXAgaW4gdGhlIHNlbGVjdGlvbiB0aGF0IGlzIGluIHRoZSB0YXJnZXQgd2luZG93XG4gICAgICBjb25zdCBvdGhlckdyb3VwID0gdmFsaWRUYWJzLmZpbmQodCA9PiB0LndpbmRvd0lkID09PSB0YXJnZXRXaW5kb3dJZCAmJiB0Lmdyb3VwSWQgIT09IC0xKTtcbiAgICAgIGlmIChvdGhlckdyb3VwKSB7XG4gICAgICAgICAgdGFyZ2V0R3JvdXBJZCA9IG90aGVyR3JvdXAuZ3JvdXBJZDtcbiAgICAgIH1cbiAgfVxuXG4gIGNvbnN0IGlkcyA9IHZhbGlkVGFicy5tYXAodCA9PiB0LmlkISk7XG4gIGF3YWl0IGNocm9tZS50YWJzLmdyb3VwKHsgdGFiSWRzOiBpZHMsIGdyb3VwSWQ6IHRhcmdldEdyb3VwSWQgfSk7XG4gIGxvZ0luZm8oXCJNZXJnZWQgdGFic1wiLCB7IGNvdW50OiBpZHMubGVuZ3RoLCB0YXJnZXRXaW5kb3dJZCwgdGFyZ2V0R3JvdXBJZCB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBzcGxpdFRhYnMgPSBhc3luYyAodGFiSWRzOiBudW1iZXJbXSkgPT4ge1xuICBpZiAodGFiSWRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuXG4gIC8vIDEuIFZhbGlkYXRlIHRhYnNcbiAgY29uc3QgdmFsaWRUYWJzID0gYXdhaXQgZ2V0VGFic0J5SWRzKHRhYklkcyk7XG5cbiAgaWYgKHZhbGlkVGFicy5sZW5ndGggPT09IDApIHJldHVybjtcblxuICAvLyAyLiBDcmVhdGUgbmV3IHdpbmRvdyB3aXRoIHRoZSBmaXJzdCB0YWJcbiAgY29uc3QgZmlyc3RUYWIgPSB2YWxpZFRhYnNbMF07XG4gIGNvbnN0IG5ld1dpbmRvdyA9IGF3YWl0IGNocm9tZS53aW5kb3dzLmNyZWF0ZSh7IHRhYklkOiBmaXJzdFRhYi5pZCB9KTtcblxuICAvLyAzLiBNb3ZlIHJlbWFpbmluZyB0YWJzIHRvIG5ldyB3aW5kb3dcbiAgaWYgKHZhbGlkVGFicy5sZW5ndGggPiAxKSB7XG4gICAgY29uc3QgcmVtYWluaW5nVGFiSWRzID0gdmFsaWRUYWJzLnNsaWNlKDEpLm1hcCh0ID0+IHQuaWQhKTtcbiAgICBhd2FpdCBjaHJvbWUudGFicy5tb3ZlKHJlbWFpbmluZ1RhYklkcywgeyB3aW5kb3dJZDogbmV3V2luZG93LmlkISwgaW5kZXg6IC0xIH0pO1xuICB9XG5cbiAgbG9nSW5mbyhcIlNwbGl0IHRhYnMgdG8gbmV3IHdpbmRvd1wiLCB7IGNvdW50OiB2YWxpZFRhYnMubGVuZ3RoLCBuZXdXaW5kb3dJZDogbmV3V2luZG93LmlkIH0pO1xufTtcbiIsICJpbXBvcnQgeyBVbmRvU3RhdGUsIFNhdmVkU3RhdGUsIFdpbmRvd1N0YXRlLCBTdG9yZWRUYWJTdGF0ZSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGdldFN0b3JlZFZhbHVlLCBzZXRTdG9yZWRWYWx1ZSB9IGZyb20gXCIuL3N0b3JhZ2UuanNcIjtcbmltcG9ydCB7IGxvZ0luZm8sIGxvZ0Vycm9yIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcblxuY29uc3QgTUFYX1VORE9fU1RBQ0sgPSAxMDtcbmNvbnN0IFVORE9fU1RBQ0tfS0VZID0gXCJ1bmRvU3RhY2tcIjtcbmNvbnN0IFNBVkVEX1NUQVRFU19LRVkgPSBcInNhdmVkU3RhdGVzXCI7XG5cbmV4cG9ydCBjb25zdCBjYXB0dXJlQ3VycmVudFN0YXRlID0gYXN5bmMgKCk6IFByb21pc2U8VW5kb1N0YXRlPiA9PiB7XG4gIGNvbnN0IHdpbmRvd3MgPSBhd2FpdCBjaHJvbWUud2luZG93cy5nZXRBbGwoeyBwb3B1bGF0ZTogdHJ1ZSB9KTtcbiAgY29uc3Qgd2luZG93U3RhdGVzOiBXaW5kb3dTdGF0ZVtdID0gW107XG5cbiAgZm9yIChjb25zdCB3aW4gb2Ygd2luZG93cykge1xuICAgIGlmICghd2luLnRhYnMpIGNvbnRpbnVlO1xuICAgIGNvbnN0IHRhYlN0YXRlczogU3RvcmVkVGFiU3RhdGVbXSA9IHdpbi50YWJzLm1hcCgodGFiKSA9PiB7XG4gICAgICBsZXQgZ3JvdXBUaXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgbGV0IGdyb3VwQ29sb3I6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgIC8vIE5vdGU6IHRhYi5ncm91cElkIGlzIC0xIGlmIG5vdCBncm91cGVkLlxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgaWQ6IHRhYi5pZCxcbiAgICAgICAgdXJsOiB0YWIudXJsIHx8IFwiXCIsXG4gICAgICAgIHBpbm5lZDogQm9vbGVhbih0YWIucGlubmVkKSxcbiAgICAgICAgZ3JvdXBJZDogdGFiLmdyb3VwSWQsXG4gICAgICAgIGdyb3VwVGl0bGUsIC8vIFdpbGwgbmVlZCB0byBmZXRjaCBpZiBncm91cGVkXG4gICAgICAgIGdyb3VwQ29sb3IsXG4gICAgICB9O1xuICAgIH0pO1xuXG4gICAgLy8gUG9wdWxhdGUgZ3JvdXAgaW5mbyBpZiBuZWVkZWRcbiAgICAvLyBXZSBkbyB0aGlzIGluIGEgc2Vjb25kIHBhc3MgdG8gYmF0Y2ggb3IganVzdCBpbmRpdmlkdWFsbHkgaWYgbmVlZGVkLlxuICAgIC8vIEFjdHVhbGx5LCB3ZSBjYW4gZ2V0IGdyb3VwIGluZm8gZnJvbSBjaHJvbWUudGFiR3JvdXBzLlxuICAgIC8vIEhvd2V2ZXIsIHRoZSB0YWIgb2JqZWN0IGRvZXNuJ3QgaGF2ZSB0aGUgZ3JvdXAgdGl0bGUgZGlyZWN0bHkuXG5cbiAgICAvLyBPcHRpbWl6YXRpb246IEdldCBhbGwgZ3JvdXBzIGZpcnN0LlxuXG4gICAgd2luZG93U3RhdGVzLnB1c2goeyB0YWJzOiB0YWJTdGF0ZXMgfSk7XG4gIH1cblxuICAvLyBFbnJpY2ggd2l0aCBncm91cCBpbmZvXG4gIGNvbnN0IGFsbEdyb3VwcyA9IGF3YWl0IGNocm9tZS50YWJHcm91cHMucXVlcnkoe30pO1xuICBjb25zdCBncm91cE1hcCA9IG5ldyBNYXAoYWxsR3JvdXBzLm1hcChnID0+IFtnLmlkLCBnXSkpO1xuXG4gIGZvciAoY29uc3Qgd2luIG9mIHdpbmRvd1N0YXRlcykge1xuICAgIGZvciAoY29uc3QgdGFiIG9mIHdpbi50YWJzKSB7XG4gICAgICBpZiAodGFiLmdyb3VwSWQgJiYgdGFiLmdyb3VwSWQgIT09IGNocm9tZS50YWJHcm91cHMuVEFCX0dST1VQX0lEX05PTkUpIHtcbiAgICAgICAgY29uc3QgZyA9IGdyb3VwTWFwLmdldCh0YWIuZ3JvdXBJZCk7XG4gICAgICAgIGlmIChnKSB7XG4gICAgICAgICAgdGFiLmdyb3VwVGl0bGUgPSBnLnRpdGxlO1xuICAgICAgICAgIHRhYi5ncm91cENvbG9yID0gZy5jb2xvcjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxuICAgIHdpbmRvd3M6IHdpbmRvd1N0YXRlcyxcbiAgfTtcbn07XG5cbmV4cG9ydCBjb25zdCBwdXNoVW5kb1N0YXRlID0gYXN5bmMgKCkgPT4ge1xuICBjb25zdCBzdGF0ZSA9IGF3YWl0IGNhcHR1cmVDdXJyZW50U3RhdGUoKTtcbiAgY29uc3Qgc3RhY2sgPSAoYXdhaXQgZ2V0U3RvcmVkVmFsdWU8VW5kb1N0YXRlW10+KFVORE9fU1RBQ0tfS0VZKSkgfHwgW107XG4gIHN0YWNrLnB1c2goc3RhdGUpO1xuICBpZiAoc3RhY2subGVuZ3RoID4gTUFYX1VORE9fU1RBQ0spIHtcbiAgICBzdGFjay5zaGlmdCgpO1xuICB9XG4gIGF3YWl0IHNldFN0b3JlZFZhbHVlKFVORE9fU1RBQ0tfS0VZLCBzdGFjayk7XG4gIGxvZ0luZm8oXCJQdXNoZWQgdW5kbyBzdGF0ZVwiLCB7IHN0YWNrU2l6ZTogc3RhY2subGVuZ3RoIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IHNhdmVTdGF0ZSA9IGFzeW5jIChuYW1lOiBzdHJpbmcpID0+IHtcbiAgY29uc3QgdW5kb1N0YXRlID0gYXdhaXQgY2FwdHVyZUN1cnJlbnRTdGF0ZSgpO1xuICBjb25zdCBzYXZlZFN0YXRlOiBTYXZlZFN0YXRlID0ge1xuICAgIG5hbWUsXG4gICAgdGltZXN0YW1wOiB1bmRvU3RhdGUudGltZXN0YW1wLFxuICAgIHdpbmRvd3M6IHVuZG9TdGF0ZS53aW5kb3dzLFxuICB9O1xuICBjb25zdCBzYXZlZFN0YXRlcyA9IChhd2FpdCBnZXRTdG9yZWRWYWx1ZTxTYXZlZFN0YXRlW10+KFNBVkVEX1NUQVRFU19LRVkpKSB8fCBbXTtcbiAgc2F2ZWRTdGF0ZXMucHVzaChzYXZlZFN0YXRlKTtcbiAgYXdhaXQgc2V0U3RvcmVkVmFsdWUoU0FWRURfU1RBVEVTX0tFWSwgc2F2ZWRTdGF0ZXMpO1xuICBsb2dJbmZvKFwiU2F2ZWQgc3RhdGVcIiwgeyBuYW1lIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IGdldFNhdmVkU3RhdGVzID0gYXN5bmMgKCk6IFByb21pc2U8U2F2ZWRTdGF0ZVtdPiA9PiB7XG4gIHJldHVybiAoYXdhaXQgZ2V0U3RvcmVkVmFsdWU8U2F2ZWRTdGF0ZVtdPihTQVZFRF9TVEFURVNfS0VZKSkgfHwgW107XG59O1xuXG5leHBvcnQgY29uc3QgZGVsZXRlU2F2ZWRTdGF0ZSA9IGFzeW5jIChuYW1lOiBzdHJpbmcpID0+IHtcbiAgbGV0IHNhdmVkU3RhdGVzID0gKGF3YWl0IGdldFN0b3JlZFZhbHVlPFNhdmVkU3RhdGVbXT4oU0FWRURfU1RBVEVTX0tFWSkpIHx8IFtdO1xuICBzYXZlZFN0YXRlcyA9IHNhdmVkU3RhdGVzLmZpbHRlcihzID0+IHMubmFtZSAhPT0gbmFtZSk7XG4gIGF3YWl0IHNldFN0b3JlZFZhbHVlKFNBVkVEX1NUQVRFU19LRVksIHNhdmVkU3RhdGVzKTtcbiAgbG9nSW5mbyhcIkRlbGV0ZWQgc2F2ZWQgc3RhdGVcIiwgeyBuYW1lIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IHVuZG8gPSBhc3luYyAoKSA9PiB7XG4gIGNvbnN0IHN0YWNrID0gKGF3YWl0IGdldFN0b3JlZFZhbHVlPFVuZG9TdGF0ZVtdPihVTkRPX1NUQUNLX0tFWSkpIHx8IFtdO1xuICBjb25zdCBzdGF0ZSA9IHN0YWNrLnBvcCgpO1xuICBpZiAoIXN0YXRlKSB7XG4gICAgbG9nSW5mbyhcIlVuZG8gc3RhY2sgZW1wdHlcIik7XG4gICAgcmV0dXJuO1xuICB9XG4gIGF3YWl0IHNldFN0b3JlZFZhbHVlKFVORE9fU1RBQ0tfS0VZLCBzdGFjayk7XG4gIGF3YWl0IHJlc3RvcmVTdGF0ZShzdGF0ZSk7XG4gIGxvZ0luZm8oXCJVbmRpZCBsYXN0IGFjdGlvblwiKTtcbn07XG5cbmV4cG9ydCBjb25zdCByZXN0b3JlU3RhdGUgPSBhc3luYyAoc3RhdGU6IFVuZG9TdGF0ZSB8IFNhdmVkU3RhdGUpID0+IHtcbiAgLy8gU3RyYXRlZ3k6XG4gIC8vIDEuIFVuZ3JvdXAgYWxsIHRhYnMgKG9wdGlvbmFsLCBidXQgY2xlYW5lcikuXG4gIC8vIDIuIE1vdmUgdGFicyB0byBjb3JyZWN0IHdpbmRvd3MgYW5kIGluZGljZXMuXG4gIC8vIDMuIFJlLWdyb3VwIHRhYnMuXG5cbiAgLy8gV2UgbmVlZCB0byBtYXRjaCBjdXJyZW50IHRhYnMgdG8gc3RvcmVkIHRhYnMuXG4gIC8vIFByaW9yaXR5OiBJRCBtYXRjaCAtPiBVUkwgbWF0Y2guXG5cbiAgY29uc3QgY3VycmVudFRhYnMgPSBhd2FpdCBjaHJvbWUudGFicy5xdWVyeSh7fSk7XG4gIGNvbnN0IGN1cnJlbnRUYWJNYXAgPSBuZXcgTWFwPG51bWJlciwgY2hyb21lLnRhYnMuVGFiPigpO1xuICBjb25zdCBjdXJyZW50VXJsTWFwID0gbmV3IE1hcDxzdHJpbmcsIGNocm9tZS50YWJzLlRhYltdPigpOyAvLyBVUkwgLT4gbGlzdCBvZiB0YWJzXG5cbiAgY3VycmVudFRhYnMuZm9yRWFjaCh0ID0+IHtcbiAgICBpZiAodC5pZCkgY3VycmVudFRhYk1hcC5zZXQodC5pZCwgdCk7XG4gICAgaWYgKHQudXJsKSB7XG4gICAgICBjb25zdCBsaXN0ID0gY3VycmVudFVybE1hcC5nZXQodC51cmwpIHx8IFtdO1xuICAgICAgbGlzdC5wdXNoKHQpO1xuICAgICAgY3VycmVudFVybE1hcC5zZXQodC51cmwsIGxpc3QpO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gSGVscGVyIHRvIGZpbmQgYSB0YWIgKGFzeW5jIHRvIGFsbG93IGNyZWF0aW9uKVxuICBjb25zdCBmaW5kT3JDcmVhdGVUYWIgPSBhc3luYyAoc3RvcmVkOiBTdG9yZWRUYWJTdGF0ZSk6IFByb21pc2U8Y2hyb21lLnRhYnMuVGFiIHwgdW5kZWZpbmVkPiA9PiB7XG4gICAgLy8gVHJ5IElEXG4gICAgaWYgKHN0b3JlZC5pZCAmJiBjdXJyZW50VGFiTWFwLmhhcyhzdG9yZWQuaWQpKSB7XG4gICAgICBjb25zdCB0ID0gY3VycmVudFRhYk1hcC5nZXQoc3RvcmVkLmlkKTtcbiAgICAgIGN1cnJlbnRUYWJNYXAuZGVsZXRlKHN0b3JlZC5pZCEpOyAvLyBDb25zdW1lXG4gICAgICAvLyBBbHNvIHJlbW92ZSBmcm9tIHVybCBtYXAgdG8gYXZvaWQgZG91YmxlIHVzYWdlXG4gICAgICBpZiAodD8udXJsKSB7XG4gICAgICAgICBjb25zdCBsaXN0ID0gY3VycmVudFVybE1hcC5nZXQodC51cmwpO1xuICAgICAgICAgaWYgKGxpc3QpIHtcbiAgICAgICAgICAgIGNvbnN0IGlkeCA9IGxpc3QuZmluZEluZGV4KHggPT4geC5pZCA9PT0gdC5pZCk7XG4gICAgICAgICAgICBpZiAoaWR4ICE9PSAtMSkgbGlzdC5zcGxpY2UoaWR4LCAxKTtcbiAgICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiB0O1xuICAgIH1cbiAgICAvLyBUcnkgVVJMXG4gICAgY29uc3QgbGlzdCA9IGN1cnJlbnRVcmxNYXAuZ2V0KHN0b3JlZC51cmwpO1xuICAgIGlmIChsaXN0ICYmIGxpc3QubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgdCA9IGxpc3Quc2hpZnQoKTtcbiAgICAgIGlmICh0Py5pZCkgY3VycmVudFRhYk1hcC5kZWxldGUodC5pZCk7IC8vIENvbnN1bWVcbiAgICAgIHJldHVybiB0O1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSBpZiBtaXNzaW5nXG4gICAgaWYgKHN0b3JlZC51cmwpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHQgPSBhd2FpdCBjaHJvbWUudGFicy5jcmVhdGUoeyB1cmw6IHN0b3JlZC51cmwsIGFjdGl2ZTogZmFsc2UgfSk7XG4gICAgICAgICAgICByZXR1cm4gdDtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgbG9nRXJyb3IoXCJGYWlsZWQgdG8gY3JlYXRlIHRhYlwiLCB7IHVybDogc3RvcmVkLnVybCwgZXJyb3I6IGUgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9O1xuXG4gIC8vIFdlIG5lZWQgdG8gcmVjb25zdHJ1Y3Qgd2luZG93cy5cbiAgLy8gSWRlYWxseSwgd2UgbWFwIHN0YXRlIHdpbmRvd3MgdG8gY3VycmVudCB3aW5kb3dzLlxuICAvLyBCdXQgc3RyaWN0bHksIHdlIGNhbiBqdXN0IG1vdmUgdGFicy5cblxuICAvLyBGb3Igc2ltcGxpY2l0eSwgbGV0J3MgYXNzdW1lIHdlIHVzZSBleGlzdGluZyB3aW5kb3dzIGFzIG11Y2ggYXMgcG9zc2libGUuXG4gIC8vIE9yIGNyZWF0ZSBuZXcgb25lcyBpZiB3ZSBydW4gb3V0P1xuICAvLyBMZXQncyBpdGVyYXRlIHN0b3JlZCB3aW5kb3dzLlxuXG4gIGNvbnN0IGN1cnJlbnRXaW5kb3dzID0gYXdhaXQgY2hyb21lLndpbmRvd3MuZ2V0QWxsKCk7XG5cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdGF0ZS53aW5kb3dzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3Qgd2luU3RhdGUgPSBzdGF0ZS53aW5kb3dzW2ldO1xuXG4gICAgLy8gSWRlbnRpZnkgYWxsIHRhYnMgZm9yIHRoaXMgd2luZG93IGZpcnN0LlxuICAgIC8vIFdlIGRvIHRoaXMgQkVGT1JFIGNyZWF0aW5nIGEgd2luZG93IHRvIGF2b2lkIGNyZWF0aW5nIGVtcHR5IHdpbmRvd3MuXG4gICAgY29uc3QgdGFic1RvTW92ZTogeyB0YWJJZDogbnVtYmVyLCBzdG9yZWQ6IFN0b3JlZFRhYlN0YXRlIH1bXSA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBzdG9yZWRUYWIgb2Ygd2luU3RhdGUudGFicykge1xuICAgICAgY29uc3QgZm91bmQgPSBhd2FpdCBmaW5kT3JDcmVhdGVUYWIoc3RvcmVkVGFiKTtcbiAgICAgIGlmIChmb3VuZCAmJiBmb3VuZC5pZCkge1xuICAgICAgICB0YWJzVG9Nb3ZlLnB1c2goeyB0YWJJZDogZm91bmQuaWQsIHN0b3JlZDogc3RvcmVkVGFiIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICh0YWJzVG9Nb3ZlLmxlbmd0aCA9PT0gMCkgY29udGludWU7XG5cbiAgICBsZXQgdGFyZ2V0V2luZG93SWQ6IG51bWJlcjtcblxuICAgIGlmIChpIDwgY3VycmVudFdpbmRvd3MubGVuZ3RoKSB7XG4gICAgICB0YXJnZXRXaW5kb3dJZCA9IGN1cnJlbnRXaW5kb3dzW2ldLmlkITtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gQ3JlYXRlIG5ldyB3aW5kb3dcbiAgICAgIGNvbnN0IHdpbiA9IGF3YWl0IGNocm9tZS53aW5kb3dzLmNyZWF0ZSh7fSk7XG4gICAgICB0YXJnZXRXaW5kb3dJZCA9IHdpbi5pZCE7XG4gICAgICAvLyBOb3RlOiBOZXcgd2luZG93IGNyZWF0aW9uIGFkZHMgYSB0YWIuIFdlIG1pZ2h0IHdhbnQgdG8gcmVtb3ZlIGl0IGxhdGVyIG9yIGlnbm9yZSBpdC5cbiAgICB9XG5cbiAgICAvLyBNb3ZlIGFsbCB0byB3aW5kb3cuXG4gICAgLy8gTm90ZTogSWYgd2UgbW92ZSB0byBpbmRleCAwLCB0aGV5IHdpbGwgYmUgcHJlcGVuZGVkLlxuICAgIC8vIFdlIHNob3VsZCBwcm9iYWJseSBqdXN0IG1vdmUgdGhlbSB0byB0aGUgd2luZG93IGZpcnN0LlxuICAgIC8vIElmIHdlIG1vdmUgdGhlbSBpbmRpdmlkdWFsbHkgdG8gY29ycmVjdCBpbmRleCwgaXQncyBzYWZlci5cblxuICAgIGNvbnN0IHRhYklkcyA9IHRhYnNUb01vdmUubWFwKHQgPT4gdC50YWJJZCk7XG4gICAgdHJ5IHtcbiAgICAgIC8vIE9wdGltaXphdGlvbjogQmF0Y2ggbW92ZSBhbGwgdGFicyBhdCBvbmNlXG4gICAgICBhd2FpdCBjaHJvbWUudGFicy5tb3ZlKHRhYklkcywgeyB3aW5kb3dJZDogdGFyZ2V0V2luZG93SWQsIGluZGV4OiAwIH0pO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZ0Vycm9yKFwiRmFpbGVkIHRvIGJhdGNoIG1vdmUgdGFicywgZmFsbGluZyBiYWNrIHRvIGluZGl2aWR1YWwgbW92ZXNcIiwgeyBlcnJvcjogZSB9KTtcbiAgICAgIC8vIEZhbGxiYWNrOiBNb3ZlIGluZGl2aWR1YWxseSBpZiBiYXRjaCBmYWlsc1xuICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCB0YWJzVG9Nb3ZlLmxlbmd0aDsgaisrKSB7XG4gICAgICAgIGNvbnN0IHsgdGFiSWQgfSA9IHRhYnNUb01vdmVbal07XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgYXdhaXQgY2hyb21lLnRhYnMubW92ZSh0YWJJZCwgeyB3aW5kb3dJZDogdGFyZ2V0V2luZG93SWQsIGluZGV4OiBqIH0pO1xuICAgICAgICB9IGNhdGNoIChlMikge1xuICAgICAgICAgIGxvZ0Vycm9yKFwiRmFpbGVkIHRvIG1vdmUgdGFiIGluZGl2aWR1YWxseVwiLCB7IHRhYklkLCBlcnJvcjogZTIgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBIYW5kbGUgcGlubmluZyBhZnRlciBtb3ZlXG4gICAgZm9yIChjb25zdCB7IHRhYklkLCBzdG9yZWQgfSBvZiB0YWJzVG9Nb3ZlKSB7XG4gICAgICB0cnkge1xuICAgICAgICBpZiAoc3RvcmVkLnBpbm5lZCkge1xuICAgICAgICAgIGF3YWl0IGNocm9tZS50YWJzLnVwZGF0ZSh0YWJJZCwgeyBwaW5uZWQ6IHRydWUgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gSWYgY3VycmVudGx5IHBpbm5lZCBidXQgc2hvdWxkbid0IGJlXG4gICAgICAgICAgY29uc3QgY3VycmVudCA9IGF3YWl0IGNocm9tZS50YWJzLmdldCh0YWJJZCk7XG4gICAgICAgICAgaWYgKGN1cnJlbnQucGlubmVkKSBhd2FpdCBjaHJvbWUudGFicy51cGRhdGUodGFiSWQsIHsgcGlubmVkOiBmYWxzZSB9KTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2dFcnJvcihcIkZhaWxlZCB0byB1cGRhdGUgdGFiIHBpbiBzdGF0ZVwiLCB7IHRhYklkLCBlcnJvcjogZSB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBIYW5kbGUgR3JvdXBzXG4gICAgLy8gSWRlbnRpZnkgZ3JvdXBzIGluIHRoaXMgd2luZG93XG4gICAgY29uc3QgZ3JvdXBzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcltdPigpOyAvLyB0aXRsZStjb2xvciAtPiB0YWJJZHNcbiAgICBjb25zdCBncm91cENvbG9ycyA9IG5ldyBNYXA8c3RyaW5nLCBjaHJvbWUudGFiR3JvdXBzLkNvbG9yRW51bT4oKTtcblxuICAgIGZvciAoY29uc3QgaXRlbSBvZiB0YWJzVG9Nb3ZlKSB7XG4gICAgICBpZiAoaXRlbS5zdG9yZWQuZ3JvdXBUaXRsZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIC8vIFVzZSB0aXRsZSBhcyBrZXkgKG9yIHVuaXF1ZSBJRCBpZiB3ZSBoYWQgb25lLCBidXQgd2UgZG9uJ3QgcGVyc2lzdCBncm91cCBJRHMpXG4gICAgICAgIC8vIEdyb3VwIElEIGluIHN0b3JhZ2UgaXMgZXBoZW1lcmFsLiBUaXRsZSBpcyBrZXkuXG4gICAgICAgIGNvbnN0IGtleSA9IGl0ZW0uc3RvcmVkLmdyb3VwVGl0bGU7XG4gICAgICAgIGNvbnN0IGxpc3QgPSBncm91cHMuZ2V0KGtleSkgfHwgW107XG4gICAgICAgIGxpc3QucHVzaChpdGVtLnRhYklkKTtcbiAgICAgICAgZ3JvdXBzLnNldChrZXksIGxpc3QpO1xuICAgICAgICBpZiAoaXRlbS5zdG9yZWQuZ3JvdXBDb2xvcikge1xuICAgICAgICAgICAgIGdyb3VwQ29sb3JzLnNldChrZXksIGl0ZW0uc3RvcmVkLmdyb3VwQ29sb3IgYXMgY2hyb21lLnRhYkdyb3Vwcy5Db2xvckVudW0pO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgLy8gVW5ncm91cCBpZiBuZWVkZWRcbiAgICAgICAgIGF3YWl0IGNocm9tZS50YWJzLnVuZ3JvdXAoaXRlbS50YWJJZCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBbdGl0bGUsIGlkc10gb2YgZ3JvdXBzLmVudHJpZXMoKSkge1xuICAgICAgaWYgKGlkcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvbnN0IGdyb3VwSWQgPSBhd2FpdCBjaHJvbWUudGFicy5ncm91cCh7IHRhYklkczogaWRzIH0pO1xuICAgICAgICBhd2FpdCBjaHJvbWUudGFiR3JvdXBzLnVwZGF0ZShncm91cElkLCB7XG4gICAgICAgICAgICAgdGl0bGU6IHRpdGxlLFxuICAgICAgICAgICAgIGNvbG9yOiBncm91cENvbG9ycy5nZXQodGl0bGUpIHx8IFwiZ3JleVwiXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcbiIsICJpbXBvcnQgeyBhcHBseVRhYkdyb3VwcywgYXBwbHlUYWJTb3J0aW5nLCBjYWxjdWxhdGVUYWJHcm91cHMsIGZldGNoQ3VycmVudFRhYkdyb3VwcywgbWVyZ2VUYWJzLCBzcGxpdFRhYnMgfSBmcm9tIFwiLi90YWJNYW5hZ2VyLmpzXCI7XG5pbXBvcnQgeyBsb2FkUHJlZmVyZW5jZXMsIHNhdmVQcmVmZXJlbmNlcyB9IGZyb20gXCIuL3ByZWZlcmVuY2VzLmpzXCI7XG5pbXBvcnQgeyBzZXRDdXN0b21TdHJhdGVnaWVzIH0gZnJvbSBcIi4vZ3JvdXBpbmdTdHJhdGVnaWVzLmpzXCI7XG5pbXBvcnQgeyBsb2dEZWJ1ZywgbG9nSW5mbywgZ2V0TG9ncywgY2xlYXJMb2dzLCBzZXRMb2dnZXJQcmVmZXJlbmNlcywgaW5pdExvZ2dlciwgYWRkTG9nRW50cnksIGxvZ2dlclJlYWR5IH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IHB1c2hVbmRvU3RhdGUsIHNhdmVTdGF0ZSwgdW5kbywgZ2V0U2F2ZWRTdGF0ZXMsIGRlbGV0ZVNhdmVkU3RhdGUsIHJlc3RvcmVTdGF0ZSB9IGZyb20gXCIuL3N0YXRlTWFuYWdlci5qc1wiO1xuaW1wb3J0IHtcbiAgQXBwbHlHcm91cGluZ1BheWxvYWQsXG4gIEdyb3VwaW5nU2VsZWN0aW9uLFxuICBHcm91cGluZ1N0cmF0ZWd5LFxuICBQcmVmZXJlbmNlcyxcbiAgUnVudGltZU1lc3NhZ2UsXG4gIFJ1bnRpbWVSZXNwb25zZSxcbiAgU29ydGluZ1N0cmF0ZWd5LFxuICBUYWJHcm91cFxufSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5cbmNocm9tZS5ydW50aW1lLm9uSW5zdGFsbGVkLmFkZExpc3RlbmVyKGFzeW5jICgpID0+IHtcbiAgY29uc3QgcHJlZnMgPSBhd2FpdCBsb2FkUHJlZmVyZW5jZXMoKTtcbiAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhwcmVmcy5jdXN0b21TdHJhdGVnaWVzIHx8IFtdKTtcbiAgbG9nSW5mbyhcIkV4dGVuc2lvbiBpbnN0YWxsZWRcIiwge1xuICAgIHZlcnNpb246IGNocm9tZS5ydW50aW1lLmdldE1hbmlmZXN0KCkudmVyc2lvbixcbiAgICBsb2dMZXZlbDogcHJlZnMubG9nTGV2ZWwsXG4gICAgc3RyYXRlZ2llc0NvdW50OiBwcmVmcy5jdXN0b21TdHJhdGVnaWVzPy5sZW5ndGggfHwgMFxuICB9KTtcbn0pO1xuXG4vLyBJbml0aWFsaXplIGxvZ2dlciBvbiBzdGFydHVwXG5sb2FkUHJlZmVyZW5jZXMoKS50aGVuKGFzeW5jIChwcmVmcykgPT4ge1xuICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMocHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXSk7XG4gICAgYXdhaXQgaW5pdExvZ2dlcigpO1xuICAgIGxvZ0luZm8oXCJTZXJ2aWNlIFdvcmtlciBJbml0aWFsaXplZFwiLCB7XG4gICAgICAgIHZlcnNpb246IGNocm9tZS5ydW50aW1lLmdldE1hbmlmZXN0KCkudmVyc2lvbixcbiAgICAgICAgbG9nTGV2ZWw6IHByZWZzLmxvZ0xldmVsXG4gICAgfSk7XG59KTtcblxuY29uc3QgaGFuZGxlTWVzc2FnZSA9IGFzeW5jIDxURGF0YT4oXG4gIG1lc3NhZ2U6IFJ1bnRpbWVNZXNzYWdlLFxuICBzZW5kZXI6IGNocm9tZS5ydW50aW1lLk1lc3NhZ2VTZW5kZXJcbik6IFByb21pc2U8UnVudGltZVJlc3BvbnNlPFREYXRhPj4gPT4ge1xuICBsb2dEZWJ1ZyhcIlJlY2VpdmVkIG1lc3NhZ2VcIiwgeyB0eXBlOiBtZXNzYWdlLnR5cGUsIGZyb206IHNlbmRlci5pZCB9KTtcbiAgc3dpdGNoIChtZXNzYWdlLnR5cGUpIHtcbiAgICBjYXNlIFwiZ2V0U3RhdGVcIjoge1xuICAgICAgY29uc3QgcHJlZnMgPSBhd2FpdCBsb2FkUHJlZmVyZW5jZXMoKTtcbiAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMocHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXSk7XG4gICAgICAvLyBVc2UgZmV0Y2hDdXJyZW50VGFiR3JvdXBzIHRvIHJldHVybiB0aGUgYWN0dWFsIHN0YXRlIG9mIHRoZSBicm93c2VyIHRhYnNcbiAgICAgIGNvbnN0IGdyb3VwcyA9IGF3YWl0IGZldGNoQ3VycmVudFRhYkdyb3VwcyhwcmVmcyk7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSwgZGF0YTogeyBncm91cHMsIHByZWZlcmVuY2VzOiBwcmVmcyB9IGFzIFREYXRhIH07XG4gICAgfVxuICAgIGNhc2UgXCJhcHBseUdyb3VwaW5nXCI6IHtcbiAgICAgIGxvZ0luZm8oXCJBcHBseWluZyBncm91cGluZyBmcm9tIG1lc3NhZ2VcIiwgeyBzb3J0aW5nOiAobWVzc2FnZS5wYXlsb2FkIGFzIGFueSk/LnNvcnRpbmcgfSk7XG4gICAgICBhd2FpdCBwdXNoVW5kb1N0YXRlKCk7XG4gICAgICBjb25zdCBwcmVmcyA9IGF3YWl0IGxvYWRQcmVmZXJlbmNlcygpO1xuICAgICAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhwcmVmcy5jdXN0b21TdHJhdGVnaWVzIHx8IFtdKTtcbiAgICAgIGNvbnN0IHBheWxvYWQgPSAobWVzc2FnZS5wYXlsb2FkIGFzIEFwcGx5R3JvdXBpbmdQYXlsb2FkIHwgdW5kZWZpbmVkKSA/PyB7fTtcbiAgICAgIGNvbnN0IHNlbGVjdGlvbiA9IHBheWxvYWQuc2VsZWN0aW9uID8/IHt9O1xuICAgICAgY29uc3Qgc29ydGluZyA9IHBheWxvYWQuc29ydGluZz8ubGVuZ3RoID8gcGF5bG9hZC5zb3J0aW5nIDogdW5kZWZpbmVkO1xuXG4gICAgICBjb25zdCBwcmVmZXJlbmNlcyA9IHNvcnRpbmcgPyB7IC4uLnByZWZzLCBzb3J0aW5nIH0gOiBwcmVmcztcblxuICAgICAgY29uc3Qgb25Qcm9ncmVzcyA9IChjb21wbGV0ZWQ6IG51bWJlciwgdG90YWw6IG51bWJlcikgPT4ge1xuICAgICAgICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgICAgdHlwZTogXCJncm91cGluZ1Byb2dyZXNzXCIsXG4gICAgICAgICAgICAgIHBheWxvYWQ6IHsgY29tcGxldGVkLCB0b3RhbCB9XG4gICAgICAgICAgfSkuY2F0Y2goKCkgPT4ge30pO1xuICAgICAgfTtcblxuICAgICAgLy8gVXNlIGNhbGN1bGF0ZVRhYkdyb3VwcyB0byBkZXRlcm1pbmUgdGhlIHRhcmdldCBncm91cGluZ1xuICAgICAgY29uc3QgZ3JvdXBzID0gYXdhaXQgY2FsY3VsYXRlVGFiR3JvdXBzKHByZWZlcmVuY2VzLCBzZWxlY3Rpb24sIG9uUHJvZ3Jlc3MpO1xuICAgICAgYXdhaXQgYXBwbHlUYWJHcm91cHMoZ3JvdXBzKTtcbiAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBkYXRhOiB7IGdyb3VwcyB9IGFzIFREYXRhIH07XG4gICAgfVxuICAgIGNhc2UgXCJhcHBseVNvcnRpbmdcIjoge1xuICAgICAgbG9nSW5mbyhcIkFwcGx5aW5nIHNvcnRpbmcgZnJvbSBtZXNzYWdlXCIpO1xuICAgICAgYXdhaXQgcHVzaFVuZG9TdGF0ZSgpO1xuICAgICAgY29uc3QgcHJlZnMgPSBhd2FpdCBsb2FkUHJlZmVyZW5jZXMoKTtcbiAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMocHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXSk7XG4gICAgICBjb25zdCBwYXlsb2FkID0gKG1lc3NhZ2UucGF5bG9hZCBhcyBBcHBseUdyb3VwaW5nUGF5bG9hZCB8IHVuZGVmaW5lZCkgPz8ge307XG4gICAgICBjb25zdCBzZWxlY3Rpb24gPSBwYXlsb2FkLnNlbGVjdGlvbiA/PyB7fTtcbiAgICAgIGNvbnN0IHNvcnRpbmcgPSBwYXlsb2FkLnNvcnRpbmc/Lmxlbmd0aCA/IHBheWxvYWQuc29ydGluZyA6IHVuZGVmaW5lZDtcbiAgICAgIGNvbnN0IHByZWZlcmVuY2VzID0gc29ydGluZyA/IHsgLi4ucHJlZnMsIHNvcnRpbmcgfSA6IHByZWZzO1xuXG4gICAgICBjb25zdCBvblByb2dyZXNzID0gKGNvbXBsZXRlZDogbnVtYmVyLCB0b3RhbDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICB0eXBlOiBcImdyb3VwaW5nUHJvZ3Jlc3NcIixcbiAgICAgICAgICAgICAgcGF5bG9hZDogeyBjb21wbGV0ZWQsIHRvdGFsIH1cbiAgICAgICAgICB9KS5jYXRjaCgoKSA9PiB7fSk7XG4gICAgICB9O1xuXG4gICAgICBhd2FpdCBhcHBseVRhYlNvcnRpbmcocHJlZmVyZW5jZXMsIHNlbGVjdGlvbiwgb25Qcm9ncmVzcyk7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgIH1cbiAgICBjYXNlIFwibWVyZ2VTZWxlY3Rpb25cIjoge1xuICAgICAgbG9nSW5mbyhcIk1lcmdpbmcgc2VsZWN0aW9uIGZyb20gbWVzc2FnZVwiKTtcbiAgICAgIGF3YWl0IHB1c2hVbmRvU3RhdGUoKTtcbiAgICAgIGNvbnN0IHBheWxvYWQgPSBtZXNzYWdlLnBheWxvYWQgYXMgeyB0YWJJZHM6IG51bWJlcltdIH07XG4gICAgICBpZiAocGF5bG9hZD8udGFiSWRzPy5sZW5ndGgpIHtcbiAgICAgICAgYXdhaXQgbWVyZ2VUYWJzKHBheWxvYWQudGFiSWRzKTtcbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiTm8gdGFicyBzZWxlY3RlZFwiIH07XG4gICAgfVxuICAgIGNhc2UgXCJzcGxpdFNlbGVjdGlvblwiOiB7XG4gICAgICBsb2dJbmZvKFwiU3BsaXR0aW5nIHNlbGVjdGlvbiBmcm9tIG1lc3NhZ2VcIik7XG4gICAgICBhd2FpdCBwdXNoVW5kb1N0YXRlKCk7XG4gICAgICBjb25zdCBwYXlsb2FkID0gbWVzc2FnZS5wYXlsb2FkIGFzIHsgdGFiSWRzOiBudW1iZXJbXSB9O1xuICAgICAgaWYgKHBheWxvYWQ/LnRhYklkcz8ubGVuZ3RoKSB7XG4gICAgICAgIGF3YWl0IHNwbGl0VGFicyhwYXlsb2FkLnRhYklkcyk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICB9XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIk5vIHRhYnMgc2VsZWN0ZWRcIiB9O1xuICAgIH1cbiAgICBjYXNlIFwidW5kb1wiOiB7XG4gICAgICBsb2dJbmZvKFwiVW5kb2luZyBsYXN0IGFjdGlvblwiKTtcbiAgICAgIGF3YWl0IHVuZG8oKTtcbiAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgfVxuICAgIGNhc2UgXCJzYXZlU3RhdGVcIjoge1xuICAgICAgY29uc3QgbmFtZSA9IChtZXNzYWdlLnBheWxvYWQgYXMgYW55KT8ubmFtZTtcbiAgICAgIGlmICh0eXBlb2YgbmFtZSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICBsb2dJbmZvKFwiU2F2aW5nIHN0YXRlIGZyb20gbWVzc2FnZVwiLCB7IG5hbWUgfSk7XG4gICAgICAgIGF3YWl0IHNhdmVTdGF0ZShuYW1lKTtcbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBuYW1lXCIgfTtcbiAgICB9XG4gICAgY2FzZSBcImdldFNhdmVkU3RhdGVzXCI6IHtcbiAgICAgIGNvbnN0IHN0YXRlcyA9IGF3YWl0IGdldFNhdmVkU3RhdGVzKCk7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSwgZGF0YTogc3RhdGVzIGFzIFREYXRhIH07XG4gICAgfVxuICAgIGNhc2UgXCJyZXN0b3JlU3RhdGVcIjoge1xuICAgICAgY29uc3Qgc3RhdGUgPSAobWVzc2FnZS5wYXlsb2FkIGFzIGFueSk/LnN0YXRlO1xuICAgICAgaWYgKHN0YXRlKSB7XG4gICAgICAgIGxvZ0luZm8oXCJSZXN0b3Jpbmcgc3RhdGUgZnJvbSBtZXNzYWdlXCIsIHsgbmFtZTogc3RhdGUubmFtZSB9KTtcbiAgICAgICAgYXdhaXQgcmVzdG9yZVN0YXRlKHN0YXRlKTtcbiAgICAgICAgcmV0dXJuIHsgb2s6IHRydWUgfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiSW52YWxpZCBzdGF0ZVwiIH07XG4gICAgfVxuICAgIGNhc2UgXCJkZWxldGVTYXZlZFN0YXRlXCI6IHtcbiAgICAgIGNvbnN0IG5hbWUgPSAobWVzc2FnZS5wYXlsb2FkIGFzIGFueSk/Lm5hbWU7XG4gICAgICBpZiAodHlwZW9mIG5hbWUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgbG9nSW5mbyhcIkRlbGV0aW5nIHNhdmVkIHN0YXRlIGZyb20gbWVzc2FnZVwiLCB7IG5hbWUgfSk7XG4gICAgICAgIGF3YWl0IGRlbGV0ZVNhdmVkU3RhdGUobmFtZSk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgICB9XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIkludmFsaWQgbmFtZVwiIH07XG4gICAgfVxuICAgIGNhc2UgXCJsb2FkUHJlZmVyZW5jZXNcIjoge1xuICAgICAgY29uc3QgcHJlZnMgPSBhd2FpdCBsb2FkUHJlZmVyZW5jZXMoKTtcbiAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMocHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXSk7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSwgZGF0YTogcHJlZnMgYXMgVERhdGEgfTtcbiAgICB9XG4gICAgY2FzZSBcInNhdmVQcmVmZXJlbmNlc1wiOiB7XG4gICAgICBsb2dJbmZvKFwiU2F2aW5nIHByZWZlcmVuY2VzIGZyb20gbWVzc2FnZVwiKTtcbiAgICAgIGNvbnN0IHByZWZzID0gYXdhaXQgc2F2ZVByZWZlcmVuY2VzKG1lc3NhZ2UucGF5bG9hZCBhcyBhbnkpO1xuICAgICAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhwcmVmcy5jdXN0b21TdHJhdGVnaWVzIHx8IFtdKTtcbiAgICAgIHNldExvZ2dlclByZWZlcmVuY2VzKHByZWZzKTtcbiAgICAgIHJldHVybiB7IG9rOiB0cnVlLCBkYXRhOiBwcmVmcyBhcyBURGF0YSB9O1xuICAgIH1cbiAgICBjYXNlIFwiZ2V0TG9nc1wiOiB7XG4gICAgICAgIGF3YWl0IGxvZ2dlclJlYWR5O1xuICAgICAgICBjb25zdCBsb2dzID0gZ2V0TG9ncygpO1xuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSwgZGF0YTogbG9ncyBhcyBURGF0YSB9O1xuICAgIH1cbiAgICBjYXNlIFwiY2xlYXJMb2dzXCI6IHtcbiAgICAgICAgY2xlYXJMb2dzKCk7XG4gICAgICAgIHJldHVybiB7IG9rOiB0cnVlIH07XG4gICAgfVxuICAgIGNhc2UgXCJsb2dFbnRyeVwiOiB7XG4gICAgICAgIGNvbnN0IGVudHJ5ID0gbWVzc2FnZS5wYXlsb2FkIGFzIGFueTtcbiAgICAgICAgaWYgKGVudHJ5ICYmIGVudHJ5LmxldmVsICYmIGVudHJ5Lm1lc3NhZ2UpIHtcbiAgICAgICAgICAgIGFkZExvZ0VudHJ5KGVudHJ5KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xuICAgIH1cbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJVbmtub3duIG1lc3NhZ2VcIiB9O1xuICB9XG59O1xuXG5jaHJvbWUucnVudGltZS5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoXG4gIChcbiAgICBtZXNzYWdlOiBSdW50aW1lTWVzc2FnZSxcbiAgICBzZW5kZXI6IGNocm9tZS5ydW50aW1lLk1lc3NhZ2VTZW5kZXIsXG4gICAgc2VuZFJlc3BvbnNlOiAocmVzcG9uc2U6IFJ1bnRpbWVSZXNwb25zZSkgPT4gdm9pZFxuICApID0+IHtcbiAgICBoYW5kbGVNZXNzYWdlKG1lc3NhZ2UsIHNlbmRlcilcbiAgICAudGhlbigocmVzcG9uc2UpID0+IHNlbmRSZXNwb25zZShyZXNwb25zZSkpXG4gICAgLmNhdGNoKChlcnJvcikgPT4ge1xuICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGVycm9yKSB9KTtcbiAgICB9KTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuKTtcblxuY2hyb21lLnRhYkdyb3Vwcy5vblJlbW92ZWQuYWRkTGlzdGVuZXIoYXN5bmMgKGdyb3VwKSA9PiB7XG4gIGxvZ0luZm8oXCJUYWIgZ3JvdXAgcmVtb3ZlZFwiLCB7IGdyb3VwIH0pO1xufSk7XG5cbmxldCBhdXRvUnVuVGltZW91dDogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCBudWxsID0gbnVsbDtcbmNvbnN0IGRpcnR5VGFiSWRzID0gbmV3IFNldDxudW1iZXI+KCk7XG5sZXQgdGFiUHJvY2Vzc2luZ1RpbWVvdXQ6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgbnVsbCA9IG51bGw7XG5cbmNvbnN0IHRyaWdnZXJBdXRvUnVuID0gKHRhYklkPzogbnVtYmVyKSA9PiB7XG4gIC8vIDEuIFNjaGVkdWxlIGZhc3QsIHRhcmdldGVkIHVwZGF0ZSBmb3Igc3BlY2lmaWMgdGFic1xuICBpZiAodGFiSWQgIT09IHVuZGVmaW5lZCkge1xuICAgIGRpcnR5VGFiSWRzLmFkZCh0YWJJZCk7XG4gICAgaWYgKHRhYlByb2Nlc3NpbmdUaW1lb3V0KSBjbGVhclRpbWVvdXQodGFiUHJvY2Vzc2luZ1RpbWVvdXQpO1xuXG4gICAgdGFiUHJvY2Vzc2luZ1RpbWVvdXQgPSBzZXRUaW1lb3V0KGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGlkcyA9IEFycmF5LmZyb20oZGlydHlUYWJJZHMpO1xuICAgICAgZGlydHlUYWJJZHMuY2xlYXIoKTtcbiAgICAgIGlmIChpZHMubGVuZ3RoID09PSAwKSByZXR1cm47XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gICAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMocHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXSk7XG5cbiAgICAgICAgY29uc3QgYXV0b1J1blN0cmF0cyA9IHByZWZzLmN1c3RvbVN0cmF0ZWdpZXM/LmZpbHRlcihzID0+IHMuYXV0b1J1bik7XG4gICAgICAgIGlmIChhdXRvUnVuU3RyYXRzICYmIGF1dG9SdW5TdHJhdHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNvbnN0IHN0cmF0ZWd5SWRzID0gYXV0b1J1blN0cmF0cy5tYXAocyA9PiBzLmlkKTtcbiAgICAgICAgICAvLyBPbmx5IHByb2Nlc3MgdGhlIGRpcnR5IHRhYnMgZm9yIHF1aWNrIGdyb3VwaW5nXG4gICAgICAgICAgY29uc3QgZ3JvdXBzID0gYXdhaXQgY2FsY3VsYXRlVGFiR3JvdXBzKHsgLi4ucHJlZnMsIHNvcnRpbmc6IHN0cmF0ZWd5SWRzIH0sIHsgdGFiSWRzOiBpZHMgfSk7XG4gICAgICAgICAgYXdhaXQgYXBwbHlUYWJHcm91cHMoZ3JvdXBzKTtcbiAgICAgICAgICBsb2dJbmZvKFwiQXV0by1ydW4gdGFyZ2V0ZWRcIiwgeyB0YWJzOiBpZHMsIHN0cmF0ZWdpZXM6IHN0cmF0ZWd5SWRzIH0pO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJBdXRvLXJ1biB0YXJnZXRlZCBmYWlsZWRcIiwgZSk7XG4gICAgICB9XG4gICAgfSwgMjAwKTsgLy8gRmFzdCBkZWJvdW5jZSBmb3IgcmVzcG9uc2l2ZW5lc3NcbiAgfVxuXG4gIC8vIDIuIFNjaGVkdWxlIGdsb2JhbCB1cGRhdGUgKHNsb3dlciBkZWJvdW5jZSkgdG8gZW5zdXJlIGNvbnNpc3RlbmN5IGFuZCBzb3J0aW5nXG4gIGlmIChhdXRvUnVuVGltZW91dCkgY2xlYXJUaW1lb3V0KGF1dG9SdW5UaW1lb3V0KTtcbiAgYXV0b1J1blRpbWVvdXQgPSBzZXRUaW1lb3V0KGFzeW5jICgpID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcHJlZnMgPSBhd2FpdCBsb2FkUHJlZmVyZW5jZXMoKTtcbiAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMocHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXSk7XG5cbiAgICAgIGNvbnN0IGF1dG9SdW5TdHJhdHMgPSBwcmVmcy5jdXN0b21TdHJhdGVnaWVzPy5maWx0ZXIocyA9PiBzLmF1dG9SdW4pO1xuICAgICAgaWYgKGF1dG9SdW5TdHJhdHMgJiYgYXV0b1J1blN0cmF0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGxvZ0luZm8oXCJBdXRvLXJ1bm5pbmcgc3RyYXRlZ2llcyAoZ2xvYmFsKVwiLCB7XG4gICAgICAgICAgc3RyYXRlZ2llczogYXV0b1J1blN0cmF0cy5tYXAocyA9PiBzLmlkKSxcbiAgICAgICAgICBjb3VudDogYXV0b1J1blN0cmF0cy5sZW5ndGhcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IGlkcyA9IGF1dG9SdW5TdHJhdHMubWFwKHMgPT4gcy5pZCk7XG5cbiAgICAgICAgLy8gV2UgYXBwbHkgZ3JvdXBpbmcgdXNpbmcgdGhlc2Ugc3RyYXRlZ2llc1xuICAgICAgICBjb25zdCBncm91cHMgPSBhd2FpdCBjYWxjdWxhdGVUYWJHcm91cHMoeyAuLi5wcmVmcywgc29ydGluZzogaWRzIH0pO1xuICAgICAgICBhd2FpdCBhcHBseVRhYkdyb3Vwcyhncm91cHMpO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJBdXRvLXJ1biBmYWlsZWRcIiwgZSk7XG4gICAgfVxuICB9LCAxMDAwKTtcbn07XG5cbmNocm9tZS50YWJzLm9uQ3JlYXRlZC5hZGRMaXN0ZW5lcigodGFiKSA9PiB7XG4gIGlmICh0YWIuaWQpIHRyaWdnZXJBdXRvUnVuKHRhYi5pZCk7XG4gIGVsc2UgdHJpZ2dlckF1dG9SdW4oKTtcbn0pO1xuY2hyb21lLnRhYnMub25VcGRhdGVkLmFkZExpc3RlbmVyKCh0YWJJZCwgY2hhbmdlSW5mbykgPT4ge1xuICBpZiAoY2hhbmdlSW5mby51cmwgfHwgY2hhbmdlSW5mby5zdGF0dXMgPT09ICdjb21wbGV0ZScpIHtcbiAgICB0cmlnZ2VyQXV0b1J1bih0YWJJZCk7XG4gIH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQWFPLElBQU0sYUFBbUM7QUFBQSxFQUM1QyxFQUFFLElBQUksVUFBVSxPQUFPLFVBQVUsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUM1RixFQUFFLElBQUksZUFBZSxPQUFPLGVBQWUsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUN0RyxFQUFFLElBQUksU0FBUyxPQUFPLFNBQVMsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUMxRixFQUFFLElBQUksV0FBVyxPQUFPLFdBQVcsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUM5RixFQUFFLElBQUksV0FBVyxPQUFPLFdBQVcsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUM5RixFQUFFLElBQUksVUFBVSxPQUFPLFVBQVUsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUM1RixFQUFFLElBQUksV0FBVyxPQUFPLFdBQVcsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUM5RixFQUFFLElBQUksT0FBTyxPQUFPLE9BQU8sWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUN0RixFQUFFLElBQUksT0FBTyxPQUFPLE9BQU8sWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUN0RixFQUFFLElBQUksV0FBVyxPQUFPLFdBQVcsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUM5RixFQUFFLElBQUksU0FBUyxPQUFPLFNBQVMsWUFBWSxNQUFNLFdBQVcsTUFBTSxNQUFNLENBQUMsU0FBUyxNQUFNLEVBQUU7QUFDOUY7QUFFTyxJQUFNLGdCQUFnQixDQUFDQSxzQkFBOEQ7QUFD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QUFNLGdCQUFnQjtBQUNwQywwQkFBb0IsTUFBTSxvQkFBb0IsQ0FBQyxDQUFDO0FBRWhELFlBQU0sZ0JBQWdCLE1BQU0sa0JBQWtCLE9BQU8sT0FBSyxFQUFFLE9BQU87QUFDbkUsVUFBSSxpQkFBaUIsY0FBYyxTQUFTLEdBQUc7QUFDN0MsZ0JBQVEsb0NBQW9DO0FBQUEsVUFDMUMsWUFBWSxjQUFjLElBQUksT0FBSyxFQUFFLEVBQUU7QUFBQSxVQUN2QyxPQUFPLGNBQWM7QUFBQSxRQUN2QixDQUFDO0FBQ0QsY0FBTSxNQUFNLGNBQWMsSUFBSSxPQUFLLEVBQUUsRUFBRTtBQUd2QyxjQUFNLFNBQVMsTUFBTSxtQkFBbUIsRUFBRSxHQUFHLE9BQU8sU0FBUyxJQUFJLENBQUM7QUFDbEUsY0FBTSxlQUFlLE1BQU07QUFBQSxNQUM3QjtBQUFBLElBQ0YsU0FBUyxHQUFHO0FBQ1YsY0FBUSxNQUFNLG1CQUFtQixDQUFDO0FBQUEsSUFDcEM7QUFBQSxFQUNGLEdBQUcsR0FBSTtBQUNUO0FBRUEsT0FBTyxLQUFLLFVBQVUsWUFBWSxDQUFDLFFBQVE7QUFDekMsTUFBSSxJQUFJLEdBQUksZ0JBQWUsSUFBSSxFQUFFO0FBQUEsTUFDNUIsZ0JBQWU7QUFDdEIsQ0FBQztBQUNELE9BQU8sS0FBSyxVQUFVLFlBQVksQ0FBQyxPQUFPLGVBQWU7QUFDdkQsTUFBSSxXQUFXLE9BQU8sV0FBVyxXQUFXLFlBQVk7QUFDdEQsbUJBQWUsS0FBSztBQUFBLEVBQ3RCO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFsiY3VzdG9tU3RyYXRlZ2llcyIsICJwYXJ0cyIsICJncm91cFRhYnMiLCAidGFicyIsICJsaXN0IiwgImxvZ3MiXQp9Cg==
