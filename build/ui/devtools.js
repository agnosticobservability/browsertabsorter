// src/ui/devtools/state.ts
var appState = {
  currentTabs: [],
  localCustomStrategies: [],
  currentContextMap: /* @__PURE__ */ new Map(),
  tabTitles: /* @__PURE__ */ new Map(),
  sortKey: null,
  sortDirection: "asc",
  simulatedSelection: /* @__PURE__ */ new Set(),
  // Modern Table State
  globalSearchQuery: "",
  columnFilters: {},
  columns: [
    { key: "id", label: "ID", visible: true, width: "60px", filterable: true },
    { key: "index", label: "Index", visible: true, width: "60px", filterable: true },
    { key: "windowId", label: "Window", visible: true, width: "70px", filterable: true },
    { key: "groupId", label: "Group", visible: true, width: "70px", filterable: true },
    { key: "title", label: "Title", visible: true, width: "200px", filterable: true },
    { key: "url", label: "URL", visible: true, width: "250px", filterable: true },
    { key: "genre", label: "Genre", visible: true, width: "100px", filterable: true },
    { key: "context", label: "Category", visible: true, width: "100px", filterable: true },
    { key: "siteName", label: "Site Name", visible: true, width: "120px", filterable: true },
    { key: "platform", label: "Platform", visible: true, width: "100px", filterable: true },
    { key: "objectType", label: "Object Type", visible: true, width: "100px", filterable: true },
    { key: "extractedTitle", label: "Extracted Title", visible: false, width: "200px", filterable: true },
    { key: "authorOrCreator", label: "Author", visible: true, width: "120px", filterable: true },
    { key: "publishedAt", label: "Published", visible: false, width: "100px", filterable: true },
    { key: "status", label: "Status", visible: false, width: "80px", filterable: true },
    { key: "active", label: "Active", visible: false, width: "60px", filterable: true },
    { key: "pinned", label: "Pinned", visible: false, width: "60px", filterable: true },
    { key: "openerTabId", label: "Opener", visible: false, width: "70px", filterable: true },
    { key: "parentTitle", label: "Parent Title", visible: false, width: "150px", filterable: true },
    { key: "lastAccessed", label: "Last Accessed", visible: true, width: "150px", filterable: false },
    { key: "actions", label: "Actions", visible: true, width: "120px", filterable: false }
  ],
  currentLogs: []
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
function escapeHtml(text) {
  if (!text) return "";
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// src/ui/devtools/data.ts
function getMappedTabs() {
  return appState.currentTabs.map((tab) => {
    const metadata = mapChromeTab(tab);
    if (!metadata) return null;
    const contextResult = appState.currentContextMap.get(metadata.id);
    if (contextResult) {
      metadata.context = contextResult.context;
      metadata.contextData = contextResult.data;
    }
    return metadata;
  }).filter((t) => t !== null);
}
function stripHtml(html) {
  let tmp = document.createElement("DIV");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}
function getSortValue(tab, key) {
  switch (key) {
    case "parentTitle":
      return tab.openerTabId ? appState.tabTitles.get(tab.openerTabId) || "" : "";
    case "genre":
      return tab.id && appState.currentContextMap.get(tab.id)?.data?.genre || "";
    case "context":
      return tab.id && appState.currentContextMap.get(tab.id)?.context || "";
    case "siteName":
      return tab.id && appState.currentContextMap.get(tab.id)?.data?.siteName || "";
    case "platform":
      return tab.id && appState.currentContextMap.get(tab.id)?.data?.platform || "";
    case "objectType":
      return tab.id && appState.currentContextMap.get(tab.id)?.data?.objectType || "";
    case "extractedTitle":
      return tab.id && appState.currentContextMap.get(tab.id)?.data?.title || "";
    case "authorOrCreator":
      return tab.id && appState.currentContextMap.get(tab.id)?.data?.authorOrCreator || "";
    case "publishedAt":
      return tab.id && appState.currentContextMap.get(tab.id)?.data?.publishedAt || "";
    case "active":
      return tab.active ? 1 : 0;
    case "pinned":
      return tab.pinned ? 1 : 0;
    case "id":
      return tab.id ?? -1;
    case "index":
      return tab.index;
    case "windowId":
      return tab.windowId;
    case "groupId":
      return tab.groupId;
    case "openerTabId":
      return tab.openerTabId ?? -1;
    case "lastAccessed":
      return tab.lastAccessed || 0;
    case "title":
      return (tab.title || "").toLowerCase();
    case "url":
      return (tab.url || "").toLowerCase();
    case "status":
      return (tab.status || "").toLowerCase();
    default:
      return "";
  }
}
function getCellValue(tab, key) {
  const escape = escapeHtml;
  switch (key) {
    case "id":
      return String(tab.id ?? "N/A");
    case "index":
      return String(tab.index);
    case "windowId":
      return String(tab.windowId);
    case "groupId":
      return String(tab.groupId);
    case "title":
      return escape(tab.title || "");
    case "url":
      return escape(tab.url || "");
    case "status":
      return escape(tab.status || "");
    case "active":
      return tab.active ? "Yes" : "No";
    case "pinned":
      return tab.pinned ? "Yes" : "No";
    case "openerTabId":
      return String(tab.openerTabId ?? "-");
    case "parentTitle":
      return escape(tab.openerTabId ? appState.tabTitles.get(tab.openerTabId) || "Unknown" : "-");
    case "genre":
      return escape(tab.id && appState.currentContextMap.get(tab.id)?.data?.genre || "-");
    case "context": {
      const contextResult = tab.id ? appState.currentContextMap.get(tab.id) : void 0;
      if (!contextResult) return "N/A";
      let cellStyle = "";
      let aiContext = "";
      if (contextResult.status === "RESTRICTED") {
        aiContext = "Unextractable (restricted)";
        cellStyle = "color: gray; font-style: italic;";
      } else if (contextResult.error) {
        aiContext = `Error (${contextResult.error})`;
        cellStyle = "color: red;";
      } else if (contextResult.source === "Extraction") {
        aiContext = `${contextResult.context} (Extracted)`;
        cellStyle = "color: green; font-weight: bold;";
      } else {
        aiContext = `${contextResult.context}`;
      }
      const container = document.createElement("div");
      container.style.display = "flex";
      container.style.flexDirection = "column";
      container.style.gap = "5px";
      const summaryDiv = document.createElement("div");
      summaryDiv.style.cssText = cellStyle;
      summaryDiv.textContent = aiContext;
      container.appendChild(summaryDiv);
      if (contextResult.data) {
        const details = document.createElement("pre");
        details.style.cssText = "max-height: 300px; overflow: auto; font-size: 11px; text-align: left; background: #f5f5f5; padding: 5px; border: 1px solid #ddd; margin: 0; white-space: pre-wrap; font-family: monospace;";
        details.textContent = JSON.stringify(contextResult.data, null, 2);
        container.appendChild(details);
      }
      return container;
    }
    case "lastAccessed":
      return new Date(tab.lastAccessed || 0).toLocaleString();
    case "actions": {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = `
                <button class="goto-tab-btn" data-tab-id="${tab.id}" data-window-id="${tab.windowId}">Go</button>
                <button class="close-tab-btn" data-tab-id="${tab.id}" style="background-color: #dc3545; margin-left: 2px;">X</button>
            `;
      return wrapper;
    }
    default:
      return "";
  }
}

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

// src/ui/devtools/tabsTable.ts
async function loadTabs() {
  logInfo("Loading tabs for DevTools");
  const tabs = await chrome.tabs.query({});
  appState.currentTabs = tabs;
  const totalTabsEl = document.getElementById("totalTabs");
  if (totalTabsEl) {
    totalTabsEl.textContent = tabs.length.toString();
  }
  appState.tabTitles.clear();
  tabs.forEach((tab) => {
    if (tab.id !== void 0) {
      appState.tabTitles.set(tab.id, tab.title || "Untitled");
    }
  });
  const mappedTabs = getMappedTabs();
  try {
    const response = await chrome.runtime.sendMessage({
      type: "analyzeTabs",
      payload: { tabIds: mappedTabs.map((t) => t.id) }
    });
    if (response && response.ok && response.data) {
      appState.currentContextMap = new Map(response.data);
    } else {
      console.warn("Failed to analyze context from background", response?.error);
      appState.currentContextMap.clear();
    }
  } catch (error) {
    console.error("Failed to analyze context", error);
    appState.currentContextMap.clear();
  }
  renderTable();
}
function renderTable() {
  const tbody = document.querySelector("#tabsTable tbody");
  if (!tbody) return;
  let tabsDisplay = appState.currentTabs.filter((tab) => {
    if (appState.globalSearchQuery) {
      const q = appState.globalSearchQuery.toLowerCase();
      const searchableText = `${tab.title} ${tab.url} ${tab.id}`.toLowerCase();
      if (!searchableText.includes(q)) return false;
    }
    for (const [key, filter] of Object.entries(appState.columnFilters)) {
      if (!filter) continue;
      const val = String(getSortValue(tab, key)).toLowerCase();
      if (!val.includes(filter.toLowerCase())) return false;
    }
    return true;
  });
  if (appState.sortKey) {
    tabsDisplay.sort((a, b) => {
      let valA = getSortValue(a, appState.sortKey);
      let valB = getSortValue(b, appState.sortKey);
      if (valA < valB) return appState.sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return appState.sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }
  tbody.innerHTML = "";
  const visibleCols = appState.columns.filter((c) => c.visible);
  tabsDisplay.forEach((tab) => {
    const row = document.createElement("tr");
    visibleCols.forEach((col) => {
      const td = document.createElement("td");
      if (col.key === "title") td.classList.add("title-cell");
      if (col.key === "url") td.classList.add("url-cell");
      const val = getCellValue(tab, col.key);
      if (val instanceof HTMLElement) {
        td.appendChild(val);
      } else {
        td.innerHTML = val;
        td.title = stripHtml(String(val));
      }
      row.appendChild(td);
    });
    tbody.appendChild(row);
  });
}
function renderColumnsMenu() {
  const menu = document.getElementById("columnsMenu");
  if (!menu) return;
  menu.innerHTML = appState.columns.map((col) => `
        <label class="column-toggle">
            <input type="checkbox" data-key="${col.key}" ${col.visible ? "checked" : ""}>
            ${escapeHtml(col.label)}
        </label>
    `).join("");
  menu.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", (e) => {
      const key = e.target.dataset.key;
      const checked = e.target.checked;
      const col = appState.columns.find((c) => c.key === key);
      if (col) {
        col.visible = checked;
        renderTableHeader();
        renderTable();
      }
    });
  });
}
function renderTableHeader() {
  const headerRow = document.getElementById("headerRow");
  const filterRow = document.getElementById("filterRow");
  if (!headerRow || !filterRow) return;
  const visibleCols = appState.columns.filter((c) => c.visible);
  headerRow.innerHTML = visibleCols.map((col) => `
        <th class="${col.key !== "actions" ? "sortable" : ""}" data-key="${col.key}" style="width: ${col.width}; position: relative;">
            ${escapeHtml(col.label)}
            <div class="resizer"></div>
        </th>
    `).join("");
  filterRow.innerHTML = visibleCols.map((col) => {
    if (!col.filterable) return "<th></th>";
    const val = appState.columnFilters[col.key] || "";
    return `
            <th>
                <input type="text" class="filter-input" data-key="${col.key}" value="${escapeHtml(val)}" placeholder="Filter...">
            </th>
        `;
  }).join("");
  headerRow.querySelectorAll(".sortable").forEach((th) => {
    th.addEventListener("click", (e) => {
      if (e.target.classList.contains("resizer")) return;
      const key = th.getAttribute("data-key");
      if (key) handleSort(key);
    });
  });
  filterRow.querySelectorAll(".filter-input").forEach((input) => {
    input.addEventListener("input", (e) => {
      const key = e.target.dataset.key;
      const val = e.target.value;
      if (key) {
        appState.columnFilters[key] = val;
        renderTable();
      }
    });
  });
  headerRow.querySelectorAll(".resizer").forEach((resizer) => {
    initResize(resizer);
  });
  updateHeaderStyles();
}
function handleSort(key) {
  if (appState.sortKey === key) {
    appState.sortDirection = appState.sortDirection === "asc" ? "desc" : "asc";
  } else {
    appState.sortKey = key;
    appState.sortDirection = "asc";
  }
  updateHeaderStyles();
  renderTable();
}
function updateHeaderStyles() {
  document.querySelectorAll("th.sortable").forEach((th) => {
    th.classList.remove("sort-asc", "sort-desc");
    if (th.getAttribute("data-key") === appState.sortKey) {
      th.classList.add(appState.sortDirection === "asc" ? "sort-asc" : "sort-desc");
    }
  });
}
function initResize(resizer) {
  let x = 0;
  let w = 0;
  let th;
  const mouseDownHandler = (e) => {
    th = resizer.parentElement;
    x = e.clientX;
    w = th.offsetWidth;
    document.addEventListener("mousemove", mouseMoveHandler);
    document.addEventListener("mouseup", mouseUpHandler);
    resizer.classList.add("resizing");
  };
  const mouseMoveHandler = (e) => {
    const dx = e.clientX - x;
    const colKey = th.getAttribute("data-key");
    const col = appState.columns.find((c) => c.key === colKey);
    if (col) {
      const newWidth = Math.max(30, w + dx);
      col.width = `${newWidth}px`;
      th.style.width = col.width;
    }
  };
  const mouseUpHandler = () => {
    document.removeEventListener("mousemove", mouseMoveHandler);
    document.removeEventListener("mouseup", mouseUpHandler);
    resizer.classList.remove("resizing");
  };
  resizer.addEventListener("mousedown", mouseDownHandler);
}
function initTabsTable() {
  const refreshBtn = document.getElementById("refreshBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", loadTabs);
  }
  const globalSearchInput = document.getElementById("globalSearch");
  if (globalSearchInput) {
    globalSearchInput.addEventListener("input", (e) => {
      appState.globalSearchQuery = e.target.value;
      renderTable();
    });
  }
  const columnsBtn = document.getElementById("columnsBtn");
  if (columnsBtn) {
    columnsBtn.addEventListener("click", () => {
      const menu = document.getElementById("columnsMenu");
      menu?.classList.toggle("hidden");
      renderColumnsMenu();
    });
  }
  const resetViewBtn = document.getElementById("resetViewBtn");
  if (resetViewBtn) {
    resetViewBtn.addEventListener("click", () => {
      appState.columns.forEach((c) => c.visible = ["id", "title", "url", "windowId", "groupId", "genre", "context", "siteName", "platform", "objectType", "authorOrCreator", "actions"].includes(c.key));
      appState.globalSearchQuery = "";
      if (globalSearchInput) globalSearchInput.value = "";
      appState.columnFilters = {};
      renderTableHeader();
      renderTable();
    });
  }
  document.addEventListener("click", (e) => {
    const target = e.target;
    if (!target.closest(".columns-menu-container")) {
      document.getElementById("columnsMenu")?.classList.add("hidden");
    }
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.status === "complete") {
      loadTabs();
    }
  });
  chrome.tabs.onRemoved.addListener(() => {
    loadTabs();
  });
  renderTableHeader();
}

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
        groupColor = colorForKey(key, 0);
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
        group.color = colorForKey(colorValue, 0);
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

// src/background/sortingStrategies.ts
var recencyScore = (tab) => tab.lastAccessed ?? 0;
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

// src/ui/common.ts
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

// src/ui/devtools/components.ts
function showModal(title, content) {
  const modalOverlay = document.createElement("div");
  modalOverlay.className = "modal-overlay";
  modalOverlay.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h3>${escapeHtml(title)}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-content"></div>
        </div>
    `;
  const contentContainer = modalOverlay.querySelector(".modal-content");
  if (typeof content === "string") {
    contentContainer.innerHTML = content;
  } else {
    contentContainer.appendChild(content);
  }
  document.body.appendChild(modalOverlay);
  const closeBtn = modalOverlay.querySelector(".modal-close");
  closeBtn?.addEventListener("click", () => {
    document.body.removeChild(modalOverlay);
  });
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) {
      document.body.removeChild(modalOverlay);
    }
  });
}
function addDnDListeners(row, container) {
  row.addEventListener("dragstart", (e) => {
    row.classList.add("dragging");
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
    }
  });
  row.addEventListener("dragend", () => {
    row.classList.remove("dragging");
  });
  container.addEventListener("dragover", (e) => {
    e.preventDefault();
    const afterElement = getDragAfterElement(container, e.clientY, ".strategy-row:not(.dragging)");
    const draggable = container.querySelector(".dragging");
    if (draggable) {
      if (afterElement == null) {
        container.appendChild(draggable);
      } else {
        container.insertBefore(draggable, afterElement);
      }
    }
  });
}
function showStrategyDetails(type, name) {
  let content = "";
  let title = `${name} (${type})`;
  if (type === "grouping") {
    if (name === "domain") {
      content = `
<h3>Logic: Domain Extraction</h3>
<pre><code>${escapeHtml(domainFromUrl.toString())}</code></pre>
<h3>Logic: Grouping Key</h3>
<pre><code>${escapeHtml(groupingKey.toString())}</code></pre>
            `;
    } else if (name === "topic") {
      content = `
<h3>Logic: Semantic Bucketing</h3>
<pre><code>${escapeHtml(semanticBucket.toString())}</code></pre>
<h3>Logic: Grouping Key</h3>
<pre><code>${escapeHtml(groupingKey.toString())}</code></pre>
            `;
    } else if (name === "lineage") {
      content = `
<h3>Logic: Navigation Key</h3>
<pre><code>${escapeHtml(navigationKey.toString())}</code></pre>
<h3>Logic: Grouping Key</h3>
<pre><code>${escapeHtml(groupingKey.toString())}</code></pre>
            `;
    } else {
      const custom = appState.localCustomStrategies.find((s) => s.id === name);
      if (custom) {
        content = `
<h3>Custom Strategy: ${escapeHtml(custom.label)}</h3>
<p><b>Configuration:</b></p>
<pre><code>${escapeHtml(JSON.stringify(custom, null, 2))}</code></pre>
<h3>Logic: Grouping Key</h3>
<pre><code>${escapeHtml(groupingKey.toString())}</code></pre>
                `;
      } else {
        content = `
<h3>Logic: Grouping Key</h3>
<pre><code>${escapeHtml(groupingKey.toString())}</code></pre>
                `;
      }
    }
  } else if (type === "sorting") {
    content = `
<h3>Logic: Comparison Function</h3>
<pre><code>${escapeHtml(compareBy.toString())}</code></pre>
        `;
    if (name === "recency") {
      content += `<h3>Logic: Recency Score</h3><pre><code>${escapeHtml(recencyScore.toString())}</code></pre>`;
    } else if (name === "nesting") {
      content += `<h3>Logic: Hierarchy Score</h3><pre><code>${escapeHtml(hierarchyScore.toString())}</code></pre>`;
    } else if (name === "pinned") {
      content += `<h3>Logic: Pinned Score</h3><pre><code>${escapeHtml(pinnedScore.toString())}</code></pre>`;
    }
  } else if (type === "registry" && name === "genera") {
    const json = JSON.stringify(GENERA_REGISTRY, null, 2);
    content = `
<h3>Genera Registry Data</h3>
<p>Mapping of domain names to categories.</p>
<pre><code>${escapeHtml(json)}</code></pre>
        `;
  }
  showModal(title, content);
}
function renderAlgorithmsView() {
  const groupingRef = document.getElementById("grouping-ref");
  const sortingRef = document.getElementById("sorting-ref");
  if (groupingRef) {
    const allStrategies = getStrategies(appState.localCustomStrategies);
    const groupings = allStrategies.filter((s) => s.isGrouping);
    groupingRef.innerHTML = groupings.map((g) => {
      const isCustom = appState.localCustomStrategies.some((s) => s.id === g.id);
      let desc = "Built-in strategy";
      if (isCustom) desc = "Custom strategy defined by rules.";
      else if (g.id === "domain") desc = "Groups tabs by their domain name.";
      else if (g.id === "topic") desc = "Groups based on keywords in the title.";
      return `
          <div class="strategy-item">
            <div class="strategy-name">${g.label} (${g.id}) ${isCustom ? '<span style="color: blue; font-size: 0.8em;">Custom</span>' : ""}</div>
            <div class="strategy-desc">${desc}</div>
            <button class="strategy-view-btn" data-type="grouping" data-name="${g.id}">View Logic</button>
          </div>
        `;
    }).join("");
  }
  if (sortingRef) {
    const allStrategies = getStrategies(appState.localCustomStrategies);
    const sortings = allStrategies.filter((s) => s.isSorting);
    sortingRef.innerHTML = sortings.map((s) => {
      let desc = "Built-in sorting";
      if (s.id === "recency") desc = "Sorts by last accessed time (most recent first).";
      else if (s.id === "nesting") desc = "Sorts based on hierarchy (roots vs children).";
      else if (s.id === "pinned") desc = "Keeps pinned tabs at the beginning of the list.";
      return `
      <div class="strategy-item">
        <div class="strategy-name">${s.label}</div>
        <div class="strategy-desc">${desc}</div>
        <button class="strategy-view-btn" data-type="sorting" data-name="${s.id}">View Logic</button>
      </div>
    `;
    }).join("");
  }
  const registryRef = document.getElementById("registry-ref");
  if (registryRef && registryRef.children.length === 0) {
    registryRef.innerHTML = `
        <div class="strategy-item">
            <div class="strategy-name">Genera Registry</div>
            <div class="strategy-desc">Static lookup table for domain classification (approx ${Object.keys(GENERA_REGISTRY).length} entries).</div>
            <button class="strategy-view-btn" data-type="registry" data-name="genera">View Table</button>
        </div>
      `;
  }
}

// src/ui/devtools/simulation.ts
function runSimulation() {
  const groupingList = document.getElementById("sim-grouping-list");
  const sortingList = document.getElementById("sim-sorting-list");
  const resultContainer = document.getElementById("simResults");
  if (!groupingList || !sortingList || !resultContainer) return;
  const groupingStrats = getEnabledStrategiesFromUI(groupingList);
  const sortingStrats = getEnabledStrategiesFromUI(sortingList);
  const combinedStrategies = Array.from(/* @__PURE__ */ new Set([...groupingStrats, ...sortingStrats]));
  let tabs = getMappedTabs();
  const groups = groupTabs(tabs, combinedStrategies);
  groups.forEach((group) => {
    group.tabs = sortTabs(group.tabs, combinedStrategies);
  });
  const customStrats = getCustomStrategies();
  let groupSorterStrategy = null;
  for (const id of combinedStrategies) {
    const strategy = customStrats.find((s) => s.id === id);
    if (strategy && (strategy.sortGroups || strategy.groupSortingRules && strategy.groupSortingRules.length > 0)) {
      groupSorterStrategy = strategy;
      break;
    }
  }
  if (groupSorterStrategy) {
    groups.sort((gA, gB) => {
      if (gA.windowId !== gB.windowId) return gA.windowId - gB.windowId;
      const repA = gA.tabs[0];
      const repB = gB.tabs[0];
      if (!repA && !repB) return 0;
      if (!repA) return 1;
      if (!repB) return -1;
      if (groupSorterStrategy.groupSortingRules && groupSorterStrategy.groupSortingRules.length > 0) {
        return compareBySortingRules(groupSorterStrategy.groupSortingRules, repA, repB);
      } else {
        return compareBy(groupSorterStrategy.id, repA, repB);
      }
    });
  } else {
    groups.sort((a, b) => a.windowId - b.windowId);
  }
  if (groups.length === 0) {
    resultContainer.innerHTML = "<p>No groups created (are there any tabs?).</p>";
    return;
  }
  resultContainer.innerHTML = groups.map((group) => `
    <div class="group-result">
      <div class="group-header" style="border-left: 5px solid ${group.color}">
        <span>${escapeHtml(group.label || "Ungrouped")}</span>
        <span class="group-meta">${group.tabs.length} tabs &bull; Reason: ${escapeHtml(group.reason)}</span>
      </div>
      <ul class="group-tabs">
        ${group.tabs.map((tab) => `
          <li class="group-tab-item">
            ${tab.favIconUrl ? `<img src="${escapeHtml(tab.favIconUrl)}" class="tab-icon" onerror="this.style.display='none'">` : '<div class="tab-icon"></div>'}
            <span class="title-cell" title="${escapeHtml(tab.title)}">${escapeHtml(tab.title)}</span>
            <span style="color: #999; font-size: 0.8em; margin-left: auto;">${escapeHtml(getHostname(tab.url) || "")}</span>
          </li>
        `).join("")}
      </ul>
    </div>
  `).join("");
}
async function applyToBrowser() {
  const groupingList = document.getElementById("sim-grouping-list");
  const sortingList = document.getElementById("sim-sorting-list");
  if (!groupingList || !sortingList) return;
  const groupingStrats = getEnabledStrategiesFromUI(groupingList);
  const sortingStrats = getEnabledStrategiesFromUI(sortingList);
  const allStrategies = Array.from(/* @__PURE__ */ new Set([...groupingStrats, ...sortingStrats]));
  try {
    await chrome.runtime.sendMessage({
      type: "savePreferences",
      payload: { sorting: allStrategies }
    });
    const response = await chrome.runtime.sendMessage({
      type: "applyGrouping",
      payload: {
        sorting: allStrategies
        // Pass explicitly to ensure immediate effect
      }
    });
    if (response && response.ok) {
      alert("Applied successfully!");
      loadTabs();
    } else {
      alert("Failed to apply: " + (response.error || "Unknown error"));
    }
  } catch (e) {
    console.error("Apply failed", e);
    alert("Apply failed: " + e);
  }
}
async function renderLiveView() {
  const container = document.getElementById("live-view-container");
  if (!container) return;
  try {
    const tabs = await chrome.tabs.query({});
    const groups = await chrome.tabGroups.query({});
    const groupMap = new Map(groups.map((g) => [g.id, g]));
    const windows = new Set(tabs.map((t) => t.windowId));
    const windowIds = Array.from(windows).sort((a, b) => a - b);
    let html = '<div style="font-size: 0.9em; color: #666; margin-bottom: 10px;">Select items below to simulate specific selection states.</div>';
    for (const winId of windowIds) {
      const winTabs = tabs.filter((t) => t.windowId === winId);
      const winSelected = winTabs.every((t) => t.id && appState.simulatedSelection.has(t.id));
      html += `<div class="selectable-item ${winSelected ? "selected" : ""}" data-type="window" data-id="${winId}" style="margin-bottom: 15px; border-radius: 4px; padding: 5px;">`;
      html += `<div style="font-weight: bold;">Window ${winId}</div>`;
      const winGroups = /* @__PURE__ */ new Map();
      const ungrouped = [];
      winTabs.forEach((t) => {
        if (t.groupId !== -1) {
          if (!winGroups.has(t.groupId)) winGroups.set(t.groupId, []);
          winGroups.get(t.groupId).push(t);
        } else {
          ungrouped.push(t);
        }
      });
      if (ungrouped.length > 0) {
        html += `<div style="margin-left: 10px; margin-top: 5px;">`;
        html += `<div style="font-size: 0.9em; color: #555;">Ungrouped (${ungrouped.length})</div>`;
        ungrouped.forEach((t) => {
          const isSelected = t.id && appState.simulatedSelection.has(t.id);
          html += `<div class="selectable-item ${isSelected ? "selected" : ""}" data-type="tab" data-id="${t.id}" style="margin-left: 10px; padding: 2px 5px; border-radius: 3px; cursor: pointer; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">- ${escapeHtml(t.title || "Untitled")}</div>`;
        });
        html += `</div>`;
      }
      for (const [groupId, gTabs] of winGroups) {
        const groupInfo = groupMap.get(groupId);
        const color = groupInfo?.color || "grey";
        const title = groupInfo?.title || "Untitled Group";
        const groupSelected = gTabs.every((t) => t.id && appState.simulatedSelection.has(t.id));
        html += `<div class="selectable-item ${groupSelected ? "selected" : ""}" data-type="group" data-id="${groupId}" style="margin-left: 10px; margin-top: 5px; border-left: 3px solid ${color}; padding-left: 5px; padding: 5px; border-radius: 3px;">`;
        html += `<div style="font-weight: bold; font-size: 0.9em;">${escapeHtml(title)} (${gTabs.length})</div>`;
        gTabs.forEach((t) => {
          const isSelected = t.id && appState.simulatedSelection.has(t.id);
          html += `<div class="selectable-item ${isSelected ? "selected" : ""}" data-type="tab" data-id="${t.id}" style="margin-left: 10px; padding: 2px 5px; border-radius: 3px; cursor: pointer; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">- ${escapeHtml(t.title || "Untitled")}</div>`;
        });
        html += `</div>`;
      }
      html += `</div>`;
    }
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<p style="color:red">Error loading live view: ${e}</p>`;
  }
}
async function renderStrategyConfig() {
  const groupingList = document.getElementById("sim-grouping-list");
  const sortingList = document.getElementById("sim-sorting-list");
  const strategies = getStrategies(appState.localCustomStrategies);
  let enabledFromPrefs = [];
  try {
    const response = await chrome.runtime.sendMessage({ type: "loadPreferences" });
    if (response?.ok && response.data?.sorting && Array.isArray(response.data.sorting)) {
      enabledFromPrefs = response.data.sorting;
    }
  } catch (e) {
    console.warn("Failed to load simulation preferences, using defaults.", e);
  }
  const defaultGrouping = enabledFromPrefs.filter((id) => strategies.some((s) => s.id === id && s.isGrouping));
  const defaultSorting = enabledFromPrefs.filter((id) => strategies.some((s) => s.id === id && s.isSorting));
  if (groupingList) {
    const groupingStrategies = strategies.filter((s) => s.isGrouping);
    renderStrategyList(groupingList, groupingStrategies, defaultGrouping.length ? defaultGrouping : ["domain", "topic"]);
  }
  if (sortingList) {
    const sortingStrategies = strategies.filter((s) => s.isSorting);
    renderStrategyList(sortingList, sortingStrategies, defaultSorting.length ? defaultSorting : ["pinned", "recency"]);
  }
}
function renderStrategyList(container, strategies, defaultEnabled) {
  container.innerHTML = "";
  const enabled = strategies.filter((s) => defaultEnabled.includes(s.id));
  enabled.sort((a, b) => defaultEnabled.indexOf(a.id) - defaultEnabled.indexOf(b.id));
  const disabled = strategies.filter((s) => !defaultEnabled.includes(s.id));
  const ordered = [...enabled, ...disabled];
  ordered.forEach((strategy) => {
    const isChecked = defaultEnabled.includes(strategy.id);
    const row = document.createElement("div");
    row.className = `strategy-row ${isChecked ? "" : "disabled"}`;
    row.dataset.id = strategy.id;
    row.draggable = true;
    row.innerHTML = `
            <div class="drag-handle">\u2630</div>
            <input type="checkbox" ${isChecked ? "checked" : ""}>
            <span class="strategy-label">${strategy.label}</span>
        `;
    const checkbox = row.querySelector('input[type="checkbox"]');
    checkbox?.addEventListener("change", (e) => {
      const checked = e.target.checked;
      row.classList.toggle("disabled", !checked);
    });
    addDnDListeners(row, container);
    container.appendChild(row);
  });
}
function getEnabledStrategiesFromUI(container) {
  return Array.from(container.children).filter((row) => row.querySelector('input[type="checkbox"]').checked).map((row) => row.dataset.id);
}
function initSimulation() {
  const runSimBtn = document.getElementById("runSimBtn");
  if (runSimBtn) {
    runSimBtn.addEventListener("click", runSimulation);
  }
  const applyBtn = document.getElementById("applyBtn");
  if (applyBtn) {
    applyBtn.addEventListener("click", applyToBrowser);
  }
  renderLiveView();
  const refreshLiveBtn = document.getElementById("refresh-live-view-btn");
  if (refreshLiveBtn) refreshLiveBtn.addEventListener("click", renderLiveView);
  const liveContainer = document.getElementById("live-view-container");
  if (liveContainer) {
    liveContainer.addEventListener("click", (e) => {
      const target = e.target;
      const item = target.closest(".selectable-item");
      if (!item) return;
      const type = item.dataset.type;
      const id = Number(item.dataset.id);
      if (!type || isNaN(id)) return;
      if (type === "tab") {
        if (appState.simulatedSelection.has(id)) appState.simulatedSelection.delete(id);
        else appState.simulatedSelection.add(id);
      } else if (type === "group") {
        chrome.tabs.query({}).then((tabs) => {
          const groupTabs2 = tabs.filter((t) => t.groupId === id);
          const allSelected = groupTabs2.every((t) => t.id && appState.simulatedSelection.has(t.id));
          groupTabs2.forEach((t) => {
            if (t.id) {
              if (allSelected) appState.simulatedSelection.delete(t.id);
              else appState.simulatedSelection.add(t.id);
            }
          });
          renderLiveView();
        });
        return;
      } else if (type === "window") {
        chrome.tabs.query({}).then((tabs) => {
          const winTabs = tabs.filter((t) => t.windowId === id);
          const allSelected = winTabs.every((t) => t.id && appState.simulatedSelection.has(t.id));
          winTabs.forEach((t) => {
            if (t.id) {
              if (allSelected) appState.simulatedSelection.delete(t.id);
              else appState.simulatedSelection.add(t.id);
            }
          });
          renderLiveView();
        });
        return;
      }
      renderLiveView();
    });
  }
}

// src/ui/devtools/strategies.ts
async function loadPreferencesAndInit() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "loadPreferences" });
    if (response && response.ok && response.data) {
      const prefs = response.data;
      appState.localCustomStrategies = prefs.customStrategies || [];
      setCustomStrategies(appState.localCustomStrategies);
      renderStrategyLoadOptions();
      renderStrategyListTable();
    }
  } catch (e) {
    console.error("Failed to load preferences", e);
  }
}
function renderStrategyLoadOptions() {
  const select = document.getElementById("strategy-load-select");
  if (!select) return;
  const customOptions = appState.localCustomStrategies.slice().sort((a, b) => a.label.localeCompare(b.label)).map((strategy) => `
            <option value="${escapeHtml(strategy.id)}">${escapeHtml(strategy.label)} (${escapeHtml(strategy.id)})</option>
        `).join("");
  const builtInOptions = STRATEGIES.filter((s) => !appState.localCustomStrategies.some((cs) => cs.id === s.id)).map((strategy) => `
            <option value="${escapeHtml(strategy.id)}">${escapeHtml(strategy.label)} (Built-in)</option>
        `).join("");
  select.innerHTML = `<option value="">Load saved strategy...</option>` + (customOptions ? `<optgroup label="Custom Strategies">${customOptions}</optgroup>` : "") + (builtInOptions ? `<optgroup label="Built-in Strategies">${builtInOptions}</optgroup>` : "");
}
function renderStrategyListTable() {
  const tableBody = document.getElementById("strategy-table-body");
  if (!tableBody) return;
  const customIds = new Set(appState.localCustomStrategies.map((strategy) => strategy.id));
  const builtInRows = STRATEGIES.map((strategy) => ({
    ...strategy,
    sourceLabel: "Built-in",
    configSummary: "\u2014",
    autoRunLabel: "\u2014",
    actions: ""
  }));
  const customRows = appState.localCustomStrategies.map((strategy) => {
    const overridesBuiltIn = customIds.has(strategy.id) && STRATEGIES.some((builtIn) => builtIn.id === strategy.id);
    return {
      id: strategy.id,
      label: strategy.label,
      isGrouping: true,
      isSorting: true,
      sourceLabel: overridesBuiltIn ? "Custom (overrides built-in)" : "Custom",
      configSummary: `Filters: ${strategy.filters?.length || 0}, Groups: ${strategy.groupingRules?.length || 0}, Sorts: ${strategy.sortingRules?.length || 0}`,
      autoRunLabel: strategy.autoRun ? "Yes" : "No",
      actions: `<button class="delete-strategy-row" data-id="${escapeHtml(strategy.id)}" style="color: red;">Delete</button>`
    };
  });
  const allRows = [...builtInRows, ...customRows];
  if (allRows.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="7" style="color: #888;">No strategies found.</td></tr>';
    return;
  }
  tableBody.innerHTML = allRows.map((row) => {
    const capabilities = [row.isGrouping ? "Grouping" : null, row.isSorting ? "Sorting" : null].filter(Boolean).join(", ");
    return `
        <tr>
            <td>${escapeHtml(row.label)}</td>
            <td>${escapeHtml(String(row.id))}</td>
            <td>${escapeHtml(row.sourceLabel)}</td>
            <td>${escapeHtml(capabilities)}</td>
            <td>${escapeHtml(row.configSummary)}</td>
            <td>${escapeHtml(row.autoRunLabel)}</td>
            <td>${row.actions}</td>
        </tr>
        `;
  }).join("");
  tableBody.querySelectorAll(".delete-strategy-row").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.dataset.id;
      if (id && confirm(`Delete strategy "${id}"?`)) {
        await deleteCustomStrategy(id);
      }
    });
  });
}
async function deleteCustomStrategy(id) {
  try {
    logInfo("Deleting strategy", { id });
    const response = await chrome.runtime.sendMessage({ type: "loadPreferences" });
    if (response && response.ok && response.data) {
      const prefs = response.data;
      const newStrategies = (prefs.customStrategies || []).filter((s) => s.id !== id);
      await chrome.runtime.sendMessage({
        type: "savePreferences",
        payload: { customStrategies: newStrategies }
      });
      appState.localCustomStrategies = newStrategies;
      setCustomStrategies(appState.localCustomStrategies);
      renderStrategyLoadOptions();
      renderStrategyListTable();
      renderAlgorithmsView();
      renderStrategyConfig();
    }
  } catch (e) {
    console.error("Failed to delete strategy", e);
  }
}
async function saveStrategy(strat, showSuccess) {
  try {
    logInfo("Saving strategy", { id: strat.id });
    const response = await chrome.runtime.sendMessage({ type: "loadPreferences" });
    if (response && response.ok && response.data) {
      const prefs = response.data;
      let currentStrategies = prefs.customStrategies || [];
      const existing = currentStrategies.find((s) => s.id === strat.id);
      if (existing) {
        strat.autoRun = existing.autoRun;
      }
      currentStrategies = currentStrategies.filter((s) => s.id !== strat.id);
      currentStrategies.push(strat);
      await chrome.runtime.sendMessage({
        type: "savePreferences",
        payload: { customStrategies: currentStrategies }
      });
      appState.localCustomStrategies = currentStrategies;
      setCustomStrategies(appState.localCustomStrategies);
      renderStrategyLoadOptions();
      renderStrategyListTable();
      renderAlgorithmsView();
      renderStrategyConfig();
      if (showSuccess) alert("Strategy saved!");
      return true;
    }
    return false;
  } catch (e) {
    console.error("Failed to save strategy", e);
    alert("Error saving strategy");
    return false;
  }
}
function exportAllStrategies() {
  logInfo("Exporting all strategies", { count: appState.localCustomStrategies.length });
  const json = JSON.stringify(appState.localCustomStrategies, null, 2);
  const content = `
        <p>Copy the JSON below (contains ${appState.localCustomStrategies.length} strategies):</p>
        <textarea style="width: 100%; height: 300px; font-family: monospace;">${escapeHtml(json)}</textarea>
    `;
  showModal("Export All Strategies", content);
}
function importAllStrategies() {
  const content = document.createElement("div");
  content.innerHTML = `
        <p>Paste Strategy List JSON below:</p>
        <p style="font-size: 0.9em; color: #666;">Note: Strategies with matching IDs will be overwritten.</p>
        <textarea id="import-all-area" style="width: 100%; height: 200px; font-family: monospace; margin-bottom: 10px;"></textarea>
        <button id="import-all-confirm" class="success-btn">Import All</button>
    `;
  const btn = content.querySelector("#import-all-confirm");
  btn?.addEventListener("click", async () => {
    const txt = content.querySelector("#import-all-area").value;
    try {
      const json = JSON.parse(txt);
      if (!Array.isArray(json)) {
        alert("Invalid format: Expected an array of strategies.");
        return;
      }
      const invalid = json.find((s) => !s.id || !s.label);
      if (invalid) {
        alert("Invalid strategy in list: missing ID or Label.");
        return;
      }
      const stratMap = new Map(appState.localCustomStrategies.map((s) => [s.id, s]));
      let count = 0;
      json.forEach((s) => {
        stratMap.set(s.id, s);
        count++;
      });
      const newStrategies = Array.from(stratMap.values());
      logInfo("Importing all strategies", { count: newStrategies.length });
      await chrome.runtime.sendMessage({
        type: "savePreferences",
        payload: { customStrategies: newStrategies }
      });
      appState.localCustomStrategies = newStrategies;
      setCustomStrategies(appState.localCustomStrategies);
      renderStrategyLoadOptions();
      renderStrategyListTable();
      renderAlgorithmsView();
      renderStrategyConfig();
      alert(`Imported ${count} strategies.`);
      document.querySelector(".modal-overlay")?.remove();
    } catch (e) {
      alert("Invalid JSON: " + e);
    }
  });
  showModal("Import All Strategies", content);
}
function initStrategies() {
  const exportAllBtn = document.getElementById("strategy-list-export-btn");
  const importAllBtn = document.getElementById("strategy-list-import-btn");
  if (exportAllBtn) exportAllBtn.addEventListener("click", exportAllStrategies);
  if (importAllBtn) importAllBtn.addEventListener("click", importAllStrategies);
}

// src/ui/devtools/strategyBuilder.ts
var FIELD_OPTIONS = `
                <option value="url">URL</option>
                <option value="title">Title</option>
                <option value="domain">Domain</option>
                <option value="subdomain">Subdomain</option>
                <option value="id">ID</option>
                <option value="index">Index</option>
                <option value="windowId">Window ID</option>
                <option value="groupId">Group ID</option>
                <option value="active">Active</option>
                <option value="selected">Selected</option>
                <option value="pinned">Pinned</option>
                <option value="status">Status</option>
                <option value="openerTabId">Opener ID</option>
                <option value="parentTitle">Parent Title</option>
                <option value="lastAccessed">Last Accessed</option>
                <option value="genre">Genre</option>
                <option value="context">Context Summary</option>
                <option value="contextData.siteName">Site Name</option>
                <option value="contextData.canonicalUrl">Canonical URL</option>
                <option value="contextData.normalizedUrl">Normalized URL</option>
                <option value="contextData.platform">Platform</option>
                <option value="contextData.objectType">Object Type</option>
                <option value="contextData.objectId">Object ID</option>
                <option value="contextData.title">Extracted Title</option>
                <option value="contextData.description">Description</option>
                <option value="contextData.authorOrCreator">Author/Creator</option>
                <option value="contextData.publishedAt">Published At</option>
                <option value="contextData.modifiedAt">Modified At</option>
                <option value="contextData.language">Language</option>
                <option value="contextData.isAudible">Is Audible</option>
                <option value="contextData.isMuted">Is Muted</option>
                <option value="contextData.hasUnsavedChangesLikely">Unsaved Changes</option>
                <option value="contextData.isAuthenticatedLikely">Authenticated</option>`;
var OPERATOR_OPTIONS = `
                <option value="contains">contains</option>
                <option value="doesNotContain">does not contain</option>
                <option value="matches">matches regex</option>
                <option value="equals">equals</option>
                <option value="startsWith">starts with</option>
                <option value="endsWith">ends with</option>
                <option value="exists">exists</option>
                <option value="doesNotExist">does not exist</option>
                <option value="isNull">is null</option>
                <option value="isNotNull">is not null</option>`;
function initStrategyBuilder() {
  const addFilterGroupBtn = document.getElementById("add-filter-group-btn");
  const addGroupBtn = document.getElementById("add-group-btn");
  const addSortBtn = document.getElementById("add-sort-btn");
  const loadSelect = document.getElementById("strategy-load-select");
  const addGroupSortBtn = document.getElementById("add-group-sort-btn");
  const groupSortCheck = document.getElementById("strat-sortgroups-check");
  const saveBtn = document.getElementById("builder-save-btn");
  const runBtn = document.getElementById("builder-run-btn");
  const runLiveBtn = document.getElementById("builder-run-live-btn");
  const clearBtn = document.getElementById("builder-clear-btn");
  const exportBtn = document.getElementById("builder-export-btn");
  const importBtn = document.getElementById("builder-import-btn");
  if (exportBtn) exportBtn.addEventListener("click", exportBuilderStrategy);
  if (importBtn) importBtn.addEventListener("click", importBuilderStrategy);
  if (addFilterGroupBtn) addFilterGroupBtn.addEventListener("click", () => addFilterGroupRow());
  if (addGroupBtn) addGroupBtn.addEventListener("click", () => addBuilderRow("group"));
  if (addSortBtn) addSortBtn.addEventListener("click", () => addBuilderRow("sort"));
  if (addGroupSortBtn) addGroupSortBtn.addEventListener("click", () => addBuilderRow("groupSort"));
  if (groupSortCheck) {
    groupSortCheck.addEventListener("change", (e) => {
      const checked = e.target.checked;
      const container = document.getElementById("group-sort-rows-container");
      const addBtn = document.getElementById("add-group-sort-btn");
      if (container && addBtn) {
        container.style.display = checked ? "block" : "none";
        addBtn.style.display = checked ? "block" : "none";
      }
    });
  }
  if (saveBtn) saveBtn.addEventListener("click", () => saveCustomStrategyFromBuilder(true));
  if (runBtn) runBtn.addEventListener("click", runBuilderSimulation);
  if (runLiveBtn) runLiveBtn.addEventListener("click", runBuilderLive);
  if (clearBtn) clearBtn.addEventListener("click", clearBuilder);
  if (loadSelect) {
    loadSelect.addEventListener("change", () => {
      const selectedId = loadSelect.value;
      if (!selectedId) return;
      let strat = appState.localCustomStrategies.find((s) => s.id === selectedId);
      if (!strat) {
        strat = getBuiltInStrategyConfig(selectedId) || void 0;
      }
      if (strat) {
        populateBuilderFromStrategy(strat);
      }
    });
  }
}
function getBuiltInStrategyConfig(id) {
  const base = {
    id,
    label: STRATEGIES.find((s) => s.id === id)?.label || id,
    filters: [],
    groupingRules: [],
    sortingRules: [],
    groupSortingRules: [],
    fallback: "Misc",
    sortGroups: false,
    autoRun: false
  };
  switch (id) {
    case "domain":
      base.groupingRules = [{ source: "field", value: "domain", transform: "stripTld", color: "random" }];
      base.sortingRules = [{ field: "domain", order: "asc" }];
      break;
    case "domain_full":
      base.groupingRules = [{ source: "field", value: "domain", transform: "none", color: "random" }];
      base.sortingRules = [{ field: "domain", order: "asc" }];
      break;
    case "topic":
      base.groupingRules = [{ source: "field", value: "genre", color: "random" }];
      break;
    case "context":
      base.groupingRules = [{ source: "field", value: "context", color: "random" }];
      break;
    case "lineage":
      base.groupingRules = [{ source: "field", value: "parentTitle", color: "random" }];
      break;
    case "pinned":
      base.sortingRules = [{ field: "pinned", order: "desc" }];
      base.groupingRules = [{ source: "field", value: "pinned", color: "random" }];
      break;
    case "recency":
      base.sortingRules = [{ field: "lastAccessed", order: "desc" }];
      break;
    case "age":
      base.sortingRules = [{ field: "lastAccessed", order: "desc" }];
      break;
    case "url":
      base.sortingRules = [{ field: "url", order: "asc" }];
      break;
    case "title":
      base.sortingRules = [{ field: "title", order: "asc" }];
      break;
    case "nesting":
      base.sortingRules = [{ field: "parentTitle", order: "asc" }];
      break;
  }
  return base;
}
function addFilterGroupRow(conditions) {
  const container = document.getElementById("filter-rows-container");
  if (!container) return;
  const groupDiv = document.createElement("div");
  groupDiv.className = "filter-group-row";
  groupDiv.innerHTML = `
        <div class="filter-group-header">
            <span class="filter-group-title">Group (AND)</span>
            <button class="small-btn btn-del-group">Delete Group</button>
        </div>
        <div class="conditions-container"></div>
        <button class="small-btn btn-add-condition">+ Add Condition</button>
    `;
  groupDiv.querySelector(".btn-del-group")?.addEventListener("click", () => {
    groupDiv.remove();
    updateBreadcrumb();
  });
  const conditionsContainer = groupDiv.querySelector(".conditions-container");
  const addConditionBtn = groupDiv.querySelector(".btn-add-condition");
  const addCondition = (data) => {
    const div = document.createElement("div");
    div.className = "builder-row condition-row";
    div.style.display = "flex";
    div.style.gap = "5px";
    div.style.marginBottom = "5px";
    div.style.alignItems = "center";
    div.innerHTML = `
            <select class="field-select">
                ${FIELD_OPTIONS}
            </select>
            <span class="operator-container">
                <select class="operator-select">
                    ${OPERATOR_OPTIONS}
                </select>
            </span>
            <span class="value-container">
                <input type="text" class="value-input" placeholder="Value">
            </span>
            <button class="small-btn btn-del-condition" style="background: none; border: none; color: red;">&times;</button>
        `;
    const fieldSelect = div.querySelector(".field-select");
    const operatorContainer = div.querySelector(".operator-container");
    const valueContainer = div.querySelector(".value-container");
    const updateState = (initialOp, initialVal) => {
      const val = fieldSelect.value;
      if (["selected", "pinned"].includes(val)) {
        operatorContainer.innerHTML = `<select class="operator-select" disabled style="background: #eee; color: #555;"><option value="equals">is</option></select>`;
        valueContainer.innerHTML = `
                    <select class="value-input">
                        <option value="true">True</option>
                        <option value="false">False</option>
                    </select>
                `;
      } else {
        if (!operatorContainer.querySelector("select:not([disabled])")) {
          operatorContainer.innerHTML = `<select class="operator-select">${OPERATOR_OPTIONS}</select>`;
          valueContainer.innerHTML = `<input type="text" class="value-input" placeholder="Value">`;
        }
      }
      if (initialOp || initialVal) {
        const opEl = div.querySelector(".operator-select");
        const valEl = div.querySelector(".value-input");
        if (opEl && initialOp) opEl.value = initialOp;
        if (valEl && initialVal) valEl.value = initialVal;
      }
      div.querySelectorAll("input, select").forEach((el) => {
        el.removeEventListener("change", updateBreadcrumb);
        el.removeEventListener("input", updateBreadcrumb);
        el.addEventListener("change", updateBreadcrumb);
        el.addEventListener("input", updateBreadcrumb);
      });
    };
    fieldSelect.addEventListener("change", () => {
      updateState();
      updateBreadcrumb();
    });
    if (data) {
      fieldSelect.value = data.field;
      updateState(data.operator, data.value);
    } else {
      updateState();
    }
    div.querySelector(".btn-del-condition")?.addEventListener("click", () => {
      div.remove();
      updateBreadcrumb();
    });
    conditionsContainer.appendChild(div);
  };
  addConditionBtn?.addEventListener("click", () => addCondition());
  if (conditions && conditions.length > 0) {
    conditions.forEach((c) => addCondition(c));
  } else {
    addCondition();
  }
  container.appendChild(groupDiv);
  updateBreadcrumb();
}
function addBuilderRow(type, data) {
  let containerId = "";
  if (type === "group") containerId = "group-rows-container";
  else if (type === "sort") containerId = "sort-rows-container";
  else if (type === "groupSort") containerId = "group-sort-rows-container";
  const container = document.getElementById(containerId);
  if (!container) return;
  const div = document.createElement("div");
  div.className = "builder-row";
  div.dataset.type = type;
  if (type === "group") {
    div.style.flexWrap = "wrap";
    div.innerHTML = `
            <span class="row-number"></span>
            <select class="source-select">
                <option value="field">Field</option>
                <option value="fixed">Fixed Value</option>
            </select>

            <span class="input-container">
                 <!-- Will be populated based on source selection -->
                 <select class="field-select value-input-field">
                    ${FIELD_OPTIONS}
                 </select>
                 <input type="text" class="value-input-text" placeholder="Group Name" style="display:none;">
            </span>

            <span style="margin-left: 10px;">Transform:</span>
            <select class="transform-select">
                <option value="none">None</option>
                <option value="stripTld">Strip TLD</option>
                <option value="domain">Get Domain</option>
                <option value="hostname">Get Hostname</option>
                <option value="lowercase">Lowercase</option>
                <option value="uppercase">Uppercase</option>
                <option value="firstChar">First Char</option>
                <option value="regex">Regex Extraction</option>
                <option value="regexReplace">Regex Replace</option>
            </select>

            <div class="regex-container" style="display:none; flex-basis: 100%; margin-top: 8px; padding: 8px; background: #f8f9fa; border: 1px dashed #ced4da; border-radius: 4px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
                    <span style="font-weight: 500; font-size: 0.9em;">Pattern:</span>
                    <input type="text" class="transform-pattern" placeholder="e.g. ^(w+)-(d+)$" style="flex:1;">
                    <span title="For extraction: Captures all groups and concatenates them. Example: 'user-(d+)' -> '123'. For replacement: Standard JS regex." style="cursor: help; color: #007bff; font-weight: bold; background: #e7f1ff; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 12px;">?</span>
                </div>
                <div class="replacement-container" style="display:none; align-items: center; gap: 8px; margin-bottom: 5px;">
                    <span style="font-weight: 500; font-size: 0.9em;">Replace:</span>
                    <input type="text" class="transform-replacement" placeholder="e.g. $2 $1" style="flex:1;">
                </div>
                <div style="display: flex; gap: 8px; align-items: center; font-size: 0.9em;">
                    <span style="font-weight: 500;">Test:</span>
                    <input type="text" class="regex-test-input" placeholder="Test String" style="flex: 1;">
                    <span>&rarr;</span>
                    <span class="regex-test-result" style="font-family: monospace; background: white; padding: 2px 5px; border: 1px solid #ddd; border-radius: 3px; min-width: 60px;">(preview)</span>
                </div>
            </div>

            <span style="margin-left: 10px;">Window:</span>
            <select class="window-mode-select">
                <option value="current">Current</option>
                <option value="compound">Compound</option>
                <option value="new">New</option>
            </select>

            <span style="margin-left: 10px;">Color:</span>
            <select class="color-input">
                <option value="grey">Grey</option>
                <option value="blue">Blue</option>
                <option value="red">Red</option>
                <option value="yellow">Yellow</option>
                <option value="green">Green</option>
                <option value="pink">Pink</option>
                <option value="purple">Purple</option>
                <option value="cyan">Cyan</option>
                <option value="orange">Orange</option>
                <option value="match">Match Value</option>
                <option value="field">Color by Field</option>
            </select>
            <select class="color-field-select" style="display:none;">
                ${FIELD_OPTIONS}
            </select>
            <span class="color-transform-container" style="display:none; margin-left: 5px; align-items: center;">
                <span style="font-size: 0.9em; margin-right: 3px;">Trans:</span>
                <select class="color-transform-select">
                    <option value="none">None</option>
                    <option value="stripTld">Strip TLD</option>
                    <option value="domain">Get Domain</option>
                    <option value="hostname">Get Hostname</option>
                    <option value="lowercase">Lowercase</option>
                    <option value="uppercase">Uppercase</option>
                    <option value="firstChar">First Char</option>
                    <option value="regex">Regex</option>
                </select>
                <input type="text" class="color-transform-pattern" placeholder="Regex" style="display:none; width: 80px; margin-left: 3px;">
            </span>
            <label><input type="checkbox" class="random-color-check" checked> Random</label>

            <div class="row-actions">
                <button class="small-btn btn-del" style="background: #ffcccc; color: darkred;">Delete</button>
            </div>
        `;
    const sourceSelect = div.querySelector(".source-select");
    const fieldSelect = div.querySelector(".value-input-field");
    const textInput = div.querySelector(".value-input-text");
    const colorInput = div.querySelector(".color-input");
    const colorFieldSelect = div.querySelector(".color-field-select");
    const colorTransformContainer = div.querySelector(".color-transform-container");
    const colorTransformSelect = div.querySelector(".color-transform-select");
    const colorTransformPattern = div.querySelector(".color-transform-pattern");
    const randomCheck = div.querySelector(".random-color-check");
    const transformSelect = div.querySelector(".transform-select");
    const regexContainer = div.querySelector(".regex-container");
    const patternInput = div.querySelector(".transform-pattern");
    const replacementInput = div.querySelector(".transform-replacement");
    const testInput = div.querySelector(".regex-test-input");
    const testResult = div.querySelector(".regex-test-result");
    const toggleTransform = () => {
      const val = transformSelect.value;
      if (val === "regex" || val === "regexReplace") {
        regexContainer.style.display = "block";
        const repContainer = div.querySelector(".replacement-container");
        if (repContainer) {
          repContainer.style.display = val === "regexReplace" ? "flex" : "none";
        }
      } else {
        regexContainer.style.display = "none";
      }
      updateBreadcrumb();
    };
    transformSelect.addEventListener("change", toggleTransform);
    const updateTest = () => {
      const pat = patternInput.value;
      const txt = testInput.value;
      if (!pat || !txt) {
        testResult.textContent = "(preview)";
        testResult.style.color = "#555";
        return;
      }
      try {
        if (transformSelect.value === "regexReplace") {
          const rep = replacementInput.value || "";
          const res = txt.replace(new RegExp(pat, "g"), rep);
          testResult.textContent = res;
          testResult.style.color = "green";
        } else {
          const regex = new RegExp(pat);
          const match = regex.exec(txt);
          if (match) {
            let extracted = "";
            for (let i = 1; i < match.length; i++) {
              extracted += match[i] || "";
            }
            testResult.textContent = extracted || "(empty group)";
            testResult.style.color = "green";
          } else {
            testResult.textContent = "(no match)";
            testResult.style.color = "red";
          }
        }
      } catch (e) {
        testResult.textContent = "(invalid regex)";
        testResult.style.color = "red";
      }
    };
    patternInput.addEventListener("input", () => {
      updateTest();
      updateBreadcrumb();
    });
    if (replacementInput) {
      replacementInput.addEventListener("input", () => {
        updateTest();
        updateBreadcrumb();
      });
    }
    testInput.addEventListener("input", updateTest);
    const toggleInput = () => {
      if (sourceSelect.value === "field") {
        fieldSelect.style.display = "inline-block";
        textInput.style.display = "none";
      } else {
        fieldSelect.style.display = "none";
        textInput.style.display = "inline-block";
      }
      updateBreadcrumb();
    };
    sourceSelect.addEventListener("change", toggleInput);
    const toggleColorTransform = () => {
      if (colorTransformSelect.value === "regex") {
        colorTransformPattern.style.display = "inline-block";
      } else {
        colorTransformPattern.style.display = "none";
      }
      updateBreadcrumb();
    };
    colorTransformSelect.addEventListener("change", toggleColorTransform);
    colorTransformPattern.addEventListener("input", updateBreadcrumb);
    const toggleColor = () => {
      if (randomCheck.checked) {
        colorInput.disabled = true;
        colorInput.style.opacity = "0.5";
        colorFieldSelect.style.display = "none";
        colorTransformContainer.style.display = "none";
      } else {
        colorInput.disabled = false;
        colorInput.style.opacity = "1";
        if (colorInput.value === "field") {
          colorFieldSelect.style.display = "inline-block";
          colorTransformContainer.style.display = "inline-flex";
        } else {
          colorFieldSelect.style.display = "none";
          colorTransformContainer.style.display = "none";
        }
      }
    };
    randomCheck.addEventListener("change", toggleColor);
    colorInput.addEventListener("change", toggleColor);
    toggleColor();
  } else if (type === "sort" || type === "groupSort") {
    div.innerHTML = `
            <select class="field-select">
                ${FIELD_OPTIONS}
            </select>
            <select class="order-select">
                <option value="asc">a to z (asc)</option>
                <option value="desc">z to a (desc)</option>
            </select>
            <div class="row-actions">
                 <button class="small-btn btn-del" style="background: #ffcccc; color: darkred;">Delete</button>
            </div>
        `;
  }
  if (data) {
    if (type === "group") {
      const sourceSelect = div.querySelector(".source-select");
      const fieldSelect = div.querySelector(".value-input-field");
      const textInput = div.querySelector(".value-input-text");
      const transformSelect = div.querySelector(".transform-select");
      const colorInput = div.querySelector(".color-input");
      const colorFieldSelect = div.querySelector(".color-field-select");
      const colorTransformSelect = div.querySelector(".color-transform-select");
      const colorTransformPattern = div.querySelector(".color-transform-pattern");
      const randomCheck = div.querySelector(".random-color-check");
      const windowModeSelect = div.querySelector(".window-mode-select");
      if (data.source) sourceSelect.value = data.source;
      sourceSelect.dispatchEvent(new Event("change"));
      if (data.source === "field") {
        if (data.value) fieldSelect.value = data.value;
      } else {
        if (data.value) textInput.value = data.value;
      }
      if (data.transform) transformSelect.value = data.transform;
      if (data.transformPattern) div.querySelector(".transform-pattern").value = data.transformPattern;
      if (data.transformReplacement) div.querySelector(".transform-replacement").value = data.transformReplacement;
      transformSelect.dispatchEvent(new Event("change"));
      if (data.windowMode) windowModeSelect.value = data.windowMode;
      if (data.color && data.color !== "random") {
        randomCheck.checked = false;
        colorInput.value = data.color;
        if (data.color === "field" && data.colorField) {
          colorFieldSelect.value = data.colorField;
          if (data.colorTransform) {
            colorTransformSelect.value = data.colorTransform;
            if (data.colorTransformPattern) colorTransformPattern.value = data.colorTransformPattern;
          }
        }
      } else {
        randomCheck.checked = true;
      }
      randomCheck.dispatchEvent(new Event("change"));
      colorTransformSelect.dispatchEvent(new Event("change"));
    } else if (type === "sort" || type === "groupSort") {
      if (data.field) div.querySelector(".field-select").value = data.field;
      if (data.order) div.querySelector(".order-select").value = data.order;
    }
  }
  div.querySelector(".btn-del")?.addEventListener("click", () => {
    div.remove();
    updateBreadcrumb();
  });
  div.querySelector(".btn-and")?.addEventListener("click", () => {
    addBuilderRow(type);
  });
  div.querySelectorAll("input, select").forEach((el) => {
    el.addEventListener("change", updateBreadcrumb);
    el.addEventListener("input", updateBreadcrumb);
  });
  container.appendChild(div);
  updateBreadcrumb();
}
function clearBuilder() {
  document.getElementById("strat-name").value = "";
  document.getElementById("strat-desc").value = "";
  document.getElementById("strat-autorun").checked = false;
  document.getElementById("strat-separate-window").checked = false;
  const sortGroupsCheck = document.getElementById("strat-sortgroups-check");
  if (sortGroupsCheck) {
    sortGroupsCheck.checked = false;
    sortGroupsCheck.dispatchEvent(new Event("change"));
  }
  const loadSelect = document.getElementById("strategy-load-select");
  if (loadSelect) loadSelect.value = "";
  ["filter-rows-container", "group-rows-container", "sort-rows-container", "group-sort-rows-container"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = "";
  });
  const builderResults = document.getElementById("builder-results");
  if (builderResults) builderResults.innerHTML = "";
  addFilterGroupRow();
  updateBreadcrumb();
}
function updateBreadcrumb() {
  const breadcrumb = document.getElementById("strategy-breadcrumb");
  if (!breadcrumb) return;
  let text = "All";
  const filters = document.getElementById("filter-rows-container")?.querySelectorAll(".builder-row");
  if (filters && filters.length > 0) {
    filters.forEach((row) => {
      const field = row.querySelector(".field-select").value;
      const op = row.querySelector(".operator-select").value;
      const val = row.querySelector(".value-input").value;
      if (val) text += ` > ${field} ${op} ${val}`;
    });
  }
  const groups = document.getElementById("group-rows-container")?.querySelectorAll(".builder-row");
  if (groups && groups.length > 0) {
    groups.forEach((row) => {
      const source = row.querySelector(".source-select").value;
      let val = "";
      if (source === "field") {
        val = row.querySelector(".value-input-field").value;
        text += ` > Group by Field: ${val}`;
      } else {
        val = row.querySelector(".value-input-text").value;
        text += ` > Group by Name: "${val}"`;
      }
    });
  }
  const groupSorts = document.getElementById("group-sort-rows-container")?.querySelectorAll(".builder-row");
  if (groupSorts && groupSorts.length > 0) {
    groupSorts.forEach((row) => {
      const field = row.querySelector(".field-select").value;
      const order = row.querySelector(".order-select").value;
      text += ` > Group sort by ${field} (${order})`;
    });
  }
  const sorts = document.getElementById("sort-rows-container")?.querySelectorAll(".builder-row");
  if (sorts && sorts.length > 0) {
    sorts.forEach((row) => {
      const field = row.querySelector(".field-select").value;
      const order = row.querySelector(".order-select").value;
      text += ` > Sort by ${field} (${order})`;
    });
  }
  breadcrumb.textContent = text;
}
function getBuilderStrategy(ignoreValidation = false) {
  const idInput = document.getElementById("strat-name");
  const labelInput = document.getElementById("strat-desc");
  let id = idInput ? idInput.value.trim() : "";
  let label = labelInput ? labelInput.value.trim() : "";
  const fallback = "Misc";
  const sortGroups = document.getElementById("strat-sortgroups-check").checked;
  if (!ignoreValidation && (!id || !label)) {
    return null;
  }
  if (ignoreValidation) {
    if (!id) id = "temp_sim_id";
    if (!label) label = "Simulation";
  }
  const filterGroups = [];
  const filterContainer = document.getElementById("filter-rows-container");
  if (filterContainer) {
    const groupRows = filterContainer.querySelectorAll(".filter-group-row");
    if (groupRows.length > 0) {
      groupRows.forEach((groupRow) => {
        const conditions = [];
        groupRow.querySelectorAll(".builder-row").forEach((row) => {
          const field = row.querySelector(".field-select").value;
          const operator = row.querySelector(".operator-select").value;
          const value = row.querySelector(".value-input").value;
          if (value || ["exists", "doesNotExist", "isNull", "isNotNull"].includes(operator)) {
            conditions.push({ field, operator, value });
          }
        });
        if (conditions.length > 0) {
          filterGroups.push(conditions);
        }
      });
    }
  }
  const filters = filterGroups.length > 0 ? filterGroups[0] : [];
  const groupingRules = [];
  document.getElementById("group-rows-container")?.querySelectorAll(".builder-row").forEach((row) => {
    const source = row.querySelector(".source-select").value;
    let value = "";
    if (source === "field") {
      value = row.querySelector(".value-input-field").value;
    } else {
      value = row.querySelector(".value-input-text").value;
    }
    const transform = row.querySelector(".transform-select").value;
    const transformPattern = row.querySelector(".transform-pattern").value;
    const transformReplacement = row.querySelector(".transform-replacement").value;
    const windowMode = row.querySelector(".window-mode-select").value;
    const randomCheck = row.querySelector(".random-color-check");
    const colorInput = row.querySelector(".color-input");
    const colorFieldSelect = row.querySelector(".color-field-select");
    const colorTransformSelect = row.querySelector(".color-transform-select");
    const colorTransformPattern = row.querySelector(".color-transform-pattern");
    let color = "random";
    let colorField;
    let colorTransform;
    let colorTransformPatternValue;
    if (!randomCheck.checked) {
      color = colorInput.value;
      if (color === "field") {
        colorField = colorFieldSelect.value;
        colorTransform = colorTransformSelect.value;
        if (colorTransform === "regex") {
          colorTransformPatternValue = colorTransformPattern.value;
        }
      }
    }
    if (value) {
      groupingRules.push({
        source,
        value,
        color,
        colorField,
        colorTransform,
        colorTransformPattern: colorTransformPatternValue,
        transform,
        transformPattern: transform === "regex" || transform === "regexReplace" ? transformPattern : void 0,
        transformReplacement: transform === "regexReplace" ? transformReplacement : void 0,
        windowMode
      });
    }
  });
  const sortingRules = [];
  document.getElementById("sort-rows-container")?.querySelectorAll(".builder-row").forEach((row) => {
    const field = row.querySelector(".field-select").value;
    const order = row.querySelector(".order-select").value;
    sortingRules.push({ field, order });
  });
  const groupSortingRules = [];
  document.getElementById("group-sort-rows-container")?.querySelectorAll(".builder-row").forEach((row) => {
    const field = row.querySelector(".field-select").value;
    const order = row.querySelector(".order-select").value;
    groupSortingRules.push({ field, order });
  });
  const appliedGroupSortingRules = sortGroups ? groupSortingRules : [];
  return {
    id,
    label,
    filters,
    filterGroups,
    groupingRules,
    sortingRules,
    groupSortingRules: appliedGroupSortingRules,
    fallback,
    sortGroups
  };
}
function runBuilderSimulation() {
  const strat = getBuilderStrategy(true);
  const resultContainer = document.getElementById("builder-results");
  const newStatePanel = document.getElementById("new-state-panel");
  if (!strat) return;
  logInfo("Running builder simulation", { strategy: strat.id });
  const simStrat = strat;
  if (!resultContainer || !newStatePanel) return;
  newStatePanel.style.display = "flex";
  const originalStrategies = [...appState.localCustomStrategies];
  try {
    const existingIdx = appState.localCustomStrategies.findIndex((s) => s.id === simStrat.id);
    if (existingIdx !== -1) {
      appState.localCustomStrategies[existingIdx] = simStrat;
    } else {
      appState.localCustomStrategies.push(simStrat);
    }
    setCustomStrategies(appState.localCustomStrategies);
    let tabs = getMappedTabs();
    if (tabs.length === 0) {
      resultContainer.innerHTML = "<p>No tabs found to simulate.</p>";
      return;
    }
    if (appState.simulatedSelection.size > 0) {
      tabs = tabs.map((t) => ({
        ...t,
        selected: appState.simulatedSelection.has(t.id)
      }));
    }
    tabs = sortTabs(tabs, [simStrat.id]);
    const groups = groupTabs(tabs, [simStrat.id]);
    if (groups.length === 0) {
      const stratDef = getStrategies(appState.localCustomStrategies).find((s) => s.id === simStrat.id);
      if (stratDef && !stratDef.isGrouping) {
        groups.push({
          id: "sim-sorted",
          windowId: 0,
          label: "Sorted Results (No Grouping)",
          color: "grey",
          tabs,
          reason: "Sort Only"
        });
      }
    }
    if (groups.length === 0) {
      resultContainer.innerHTML = "<p>No groups created.</p>";
      return;
    }
    resultContainer.innerHTML = groups.map((group) => `
    <div class="group-result" style="margin-bottom: 10px; border: 1px solid #ddd; border-radius: 4px; overflow: hidden;">
      <div class="group-header" style="border-left: 5px solid ${group.color}; padding: 5px; background: #f8f9fa; font-size: 0.9em; font-weight: bold; display: flex; justify-content: space-between;">
        <span>${escapeHtml(group.label || "Ungrouped")}</span>
        <span class="group-meta" style="font-weight: normal; font-size: 0.8em; color: #666;">${group.tabs.length}</span>
      </div>
      <ul class="group-tabs" style="list-style: none; margin: 0; padding: 0;">
        ${group.tabs.map((tab) => `
          <li class="group-tab-item" style="padding: 4px 5px; border-top: 1px solid #eee; display: flex; gap: 5px; align-items: center; font-size: 0.85em;">
            <div style="width: 12px; height: 12px; background: #eee; border-radius: 2px; flex-shrink: 0;">
                ${tab.favIconUrl ? `<img src="${escapeHtml(tab.favIconUrl)}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'">` : ""}
            </div>
            <span class="title-cell" title="${escapeHtml(tab.title)}" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(tab.title)}</span>
          </li>
        `).join("")}
      </ul>
    </div>
  `).join("");
  } catch (e) {
    console.error("Simulation failed", e);
    resultContainer.innerHTML = `<p style="color: red;">Simulation failed: ${e}</p>`;
    alert("Simulation failed: " + e);
  } finally {
    appState.localCustomStrategies = originalStrategies;
    setCustomStrategies(appState.localCustomStrategies);
  }
}
async function saveCustomStrategyFromBuilder(showSuccess = true) {
  const strat = getBuilderStrategy();
  if (!strat) {
    alert("Please fill in ID and Label.");
    return false;
  }
  return saveStrategy(strat, showSuccess);
}
async function runBuilderLive() {
  const strat = getBuilderStrategy();
  if (!strat) {
    alert("Please fill in ID and Label to run live.");
    return;
  }
  logInfo("Applying strategy live", { id: strat.id });
  const saved = await saveStrategy(strat, false);
  if (!saved) return;
  try {
    const response = await chrome.runtime.sendMessage({
      type: "applyGrouping",
      payload: {
        sorting: [strat.id]
      }
    });
    if (response && response.ok) {
      alert("Applied successfully!");
      loadTabs();
    } else {
      alert("Failed to apply: " + (response.error || "Unknown error"));
    }
  } catch (e) {
    console.error("Apply failed", e);
    alert("Apply failed: " + e);
  }
}
function populateBuilderFromStrategy(strat) {
  document.getElementById("strat-name").value = strat.id;
  document.getElementById("strat-desc").value = strat.label;
  const sortGroupsCheck = document.getElementById("strat-sortgroups-check");
  const hasGroupSort = !!(strat.groupSortingRules && strat.groupSortingRules.length > 0) || !!strat.sortGroups;
  sortGroupsCheck.checked = hasGroupSort;
  sortGroupsCheck.dispatchEvent(new Event("change"));
  const autoRunCheck = document.getElementById("strat-autorun");
  autoRunCheck.checked = !!strat.autoRun;
  ["filter-rows-container", "group-rows-container", "sort-rows-container", "group-sort-rows-container"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = "";
  });
  if (strat.filterGroups && strat.filterGroups.length > 0) {
    strat.filterGroups.forEach((g) => addFilterGroupRow(g));
  } else if (strat.filters && strat.filters.length > 0) {
    addFilterGroupRow(strat.filters);
  }
  strat.groupingRules?.forEach((g) => addBuilderRow("group", g));
  strat.sortingRules?.forEach((s) => addBuilderRow("sort", s));
  strat.groupSortingRules?.forEach((gs) => addBuilderRow("groupSort", gs));
  document.querySelector("#view-strategies")?.scrollIntoView({ behavior: "smooth" });
  updateBreadcrumb();
}
function exportBuilderStrategy() {
  const strat = getBuilderStrategy();
  if (!strat) {
    alert("Please define a strategy to export (ID and Label required).");
    return;
  }
  logInfo("Exporting strategy", { id: strat.id });
  const json = JSON.stringify(strat, null, 2);
  const content = `
        <p>Copy the JSON below:</p>
        <textarea style="width: 100%; height: 300px; font-family: monospace;">${escapeHtml(json)}</textarea>
    `;
  showModal("Export Strategy", content);
}
function importBuilderStrategy() {
  const content = document.createElement("div");
  content.innerHTML = `
        <p>Paste Strategy JSON below:</p>
        <textarea id="import-strat-area" style="width: 100%; height: 200px; font-family: monospace; margin-bottom: 10px;"></textarea>
        <button id="import-strat-confirm" class="success-btn">Load</button>
    `;
  const btn = content.querySelector("#import-strat-confirm");
  btn?.addEventListener("click", () => {
    const txt = content.querySelector("#import-strat-area").value;
    try {
      const json = JSON.parse(txt);
      if (!json.id || !json.label) {
        alert("Invalid strategy: ID and Label are required.");
        return;
      }
      logInfo("Importing strategy", { id: json.id });
      populateBuilderFromStrategy(json);
      document.querySelector(".modal-overlay")?.remove();
    } catch (e) {
      alert("Invalid JSON: " + e);
    }
  });
  showModal("Import Strategy", content);
}

// src/ui/devtools/logs.ts
async function loadLogs() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "getLogs" });
    if (response && response.ok && response.data) {
      appState.currentLogs = response.data;
      renderLogs();
    }
  } catch (e) {
    console.error("Failed to load logs", e);
  }
}
async function clearRemoteLogs() {
  try {
    await chrome.runtime.sendMessage({ type: "clearLogs" });
    loadLogs();
  } catch (e) {
    console.error("Failed to clear logs", e);
  }
}
function renderLogs() {
  const tbody = document.getElementById("logs-table-body");
  const levelFilter = document.getElementById("log-level-filter").value;
  const searchText = document.getElementById("log-search").value.toLowerCase();
  if (!tbody) return;
  tbody.innerHTML = "";
  const filtered = appState.currentLogs.filter((entry) => {
    if (levelFilter !== "all" && entry.level !== levelFilter) return false;
    if (searchText) {
      const text = `${entry.message} ${JSON.stringify(entry.context || {})}`.toLowerCase();
      if (!text.includes(searchText)) return false;
    }
    return true;
  });
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="padding: 10px; text-align: center; color: #888;">No logs found.</td></tr>';
    return;
  }
  filtered.forEach((entry) => {
    const row = document.createElement("tr");
    let color = "#333";
    if (entry.level === "error" || entry.level === "critical") color = "red";
    else if (entry.level === "warn") color = "orange";
    else if (entry.level === "debug") color = "blue";
    row.innerHTML = `
            <td style="padding: 8px; border-bottom: 1px solid #eee; white-space: nowrap;">${new Date(entry.timestamp).toLocaleTimeString()} (${entry.timestamp})</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; color: ${color}; font-weight: bold;">${entry.level.toUpperCase()}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(entry.message)}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">
               <div style="max-height: 100px; overflow-y: auto;">
                  ${entry.context ? `<pre style="margin: 0;">${escapeHtml(JSON.stringify(entry.context, null, 2))}</pre>` : "-"}
               </div>
            </td>
        `;
    tbody.appendChild(row);
  });
}
async function loadGlobalLogLevel() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "loadPreferences" });
    if (response && response.ok && response.data) {
      const prefs = response.data;
      const select = document.getElementById("global-log-level");
      if (select) {
        select.value = prefs.logLevel || "info";
      }
    }
  } catch (e) {
    console.error("Failed to load prefs for logs", e);
  }
}
async function updateGlobalLogLevel() {
  const select = document.getElementById("global-log-level");
  if (!select) return;
  const level = select.value;
  try {
    await chrome.runtime.sendMessage({
      type: "savePreferences",
      payload: { logLevel: level }
    });
  } catch (e) {
    console.error("Failed to save log level", e);
  }
}
function initLogs() {
  const refreshLogsBtn = document.getElementById("refresh-logs-btn");
  if (refreshLogsBtn) refreshLogsBtn.addEventListener("click", loadLogs);
  const clearLogsBtn = document.getElementById("clear-logs-btn");
  if (clearLogsBtn) clearLogsBtn.addEventListener("click", clearRemoteLogs);
  const logLevelFilter = document.getElementById("log-level-filter");
  if (logLevelFilter) logLevelFilter.addEventListener("change", renderLogs);
  const logSearch = document.getElementById("log-search");
  if (logSearch) logSearch.addEventListener("input", renderLogs);
  const globalLogLevel = document.getElementById("global-log-level");
  if (globalLogLevel) globalLogLevel.addEventListener("change", updateGlobalLogLevel);
}

// src/ui/devtools/genera.ts
async function loadCustomGenera() {
  const listContainer = document.getElementById("custom-genera-list");
  if (!listContainer) return;
  try {
    const response = await chrome.runtime.sendMessage({ type: "loadPreferences" });
    if (response && response.ok && response.data) {
      const prefs = response.data;
      renderCustomGeneraList(prefs.customGenera || {});
    }
  } catch (e) {
    console.error("Failed to load custom genera", e);
  }
}
function renderCustomGeneraList(customGenera) {
  const listContainer = document.getElementById("custom-genera-list");
  if (!listContainer) return;
  if (Object.keys(customGenera).length === 0) {
    listContainer.innerHTML = '<p style="color: #888; font-style: italic;">No custom entries.</p>';
    return;
  }
  listContainer.innerHTML = Object.entries(customGenera).map(([domain, category]) => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px; border-bottom: 1px solid #f0f0f0;">
            <span><b>${escapeHtml(domain)}</b>: ${escapeHtml(category)}</span>
            <button class="delete-genera-btn" data-domain="${escapeHtml(domain)}" style="background: none; border: none; color: red; cursor: pointer;">&times;</button>
        </div>
    `).join("");
  listContainer.querySelectorAll(".delete-genera-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const domain = e.target.dataset.domain;
      if (domain) {
        await deleteCustomGenera(domain);
      }
    });
  });
}
async function addCustomGenera() {
  const domainInput = document.getElementById("new-genera-domain");
  const categoryInput = document.getElementById("new-genera-category");
  if (!domainInput || !categoryInput) return;
  const domain = domainInput.value.trim().toLowerCase();
  const category = categoryInput.value.trim();
  if (!domain || !category) {
    alert("Please enter both domain and category.");
    return;
  }
  logInfo("Adding custom genera", { domain, category });
  try {
    const response = await chrome.runtime.sendMessage({ type: "loadPreferences" });
    if (response && response.ok && response.data) {
      const prefs = response.data;
      const newCustomGenera = { ...prefs.customGenera || {}, [domain]: category };
      await chrome.runtime.sendMessage({
        type: "savePreferences",
        payload: { customGenera: newCustomGenera }
      });
      domainInput.value = "";
      categoryInput.value = "";
      loadCustomGenera();
      loadTabs();
    }
  } catch (e) {
    console.error("Failed to add custom genera", e);
  }
}
async function deleteCustomGenera(domain) {
  try {
    logInfo("Deleting custom genera", { domain });
    const response = await chrome.runtime.sendMessage({ type: "loadPreferences" });
    if (response && response.ok && response.data) {
      const prefs = response.data;
      const newCustomGenera = { ...prefs.customGenera || {} };
      delete newCustomGenera[domain];
      await chrome.runtime.sendMessage({
        type: "savePreferences",
        payload: { customGenera: newCustomGenera }
      });
      loadCustomGenera();
      loadTabs();
    }
  } catch (e) {
    console.error("Failed to delete custom genera", e);
  }
}
function initGenera() {
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (target && target.id === "add-genera-btn") {
      addCustomGenera();
    }
  });
}

// src/ui/devtools.ts
document.addEventListener("DOMContentLoaded", async () => {
  const themeToggleBtn = document.getElementById("themeToggleBtn");
  const storedTheme = localStorage.getItem("theme");
  if (storedTheme === "dark") {
    document.body.classList.add("dark-mode");
  }
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      document.body.classList.toggle("dark-mode");
      const isDark = document.body.classList.contains("dark-mode");
      localStorage.setItem("theme", isDark ? "dark" : "light");
    });
  }
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".view-section").forEach((s) => s.classList.remove("active"));
      btn.classList.add("active");
      const targetId = btn.dataset.target;
      if (targetId) {
        document.getElementById(targetId)?.classList.add("active");
        logInfo("Switched view", { targetId });
      }
      if (targetId === "view-algorithms") {
        renderAlgorithmsView();
        renderStrategyConfig();
      } else if (targetId === "view-strategy-list") {
      } else if (targetId === "view-logs") {
        loadLogs();
        loadGlobalLogLevel();
      }
    });
  });
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!target) return;
    if (target.matches(".context-json-btn")) {
      const tabId = Number(target.dataset.tabId);
      if (!tabId) return;
      const data = appState.currentContextMap.get(tabId)?.data;
      if (!data) return;
      const json = JSON.stringify(data, null, 2);
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>JSON View</title>
          <style>
            body { font-family: monospace; background-color: #f0f0f0; padding: 20px; }
            pre { background-color: white; padding: 15px; border-radius: 5px; border: 1px solid #ccc; overflow: auto; }
          </style>
        </head>
        <body>
          <h3>JSON Data</h3>
          <pre>${escapeHtml(json)}</pre>
        </body>
        </html>
      `;
      const blob = new Blob([htmlContent], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
    } else if (target.matches(".goto-tab-btn")) {
      const tabId = Number(target.dataset.tabId);
      const windowId = Number(target.dataset.windowId);
      if (tabId && windowId) {
        chrome.tabs.update(tabId, { active: true });
        chrome.windows.update(windowId, { focused: true });
      }
    } else if (target.matches(".close-tab-btn")) {
      const tabId = Number(target.dataset.tabId);
      if (tabId) {
        chrome.tabs.remove(tabId);
      }
    } else if (target.matches(".strategy-view-btn")) {
      const type = target.dataset.type;
      const name = target.dataset.name;
      if (type && name) {
        showStrategyDetails(type, name);
      }
    }
  });
  initTabsTable();
  initStrategies();
  initStrategyBuilder();
  initLogs();
  initGenera();
  initSimulation();
  loadTabs();
  await loadPreferencesAndInit();
  renderAlgorithmsView();
  renderStrategyConfig();
  loadCustomGenera();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3VpL2RldnRvb2xzL3N0YXRlLnRzIiwgIi4uLy4uL3NyYy9zaGFyZWQvdXRpbHMudHMiLCAiLi4vLi4vc3JjL3VpL2RldnRvb2xzL2RhdGEudHMiLCAiLi4vLi4vc3JjL3NoYXJlZC9sb2dnZXIudHMiLCAiLi4vLi4vc3JjL3VpL2RldnRvb2xzL3RhYnNUYWJsZS50cyIsICIuLi8uLi9zcmMvc2hhcmVkL3N0cmF0ZWd5UmVnaXN0cnkudHMiLCAiLi4vLi4vc3JjL3NoYXJlZC91cmxDYWNoZS50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9ncm91cGluZ1N0cmF0ZWdpZXMudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvc29ydGluZ1N0cmF0ZWdpZXMudHMiLCAiLi4vLi4vc3JjL3VpL2NvbW1vbi50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9leHRyYWN0aW9uL2dlbmVyYVJlZ2lzdHJ5LnRzIiwgIi4uLy4uL3NyYy91aS9kZXZ0b29scy9jb21wb25lbnRzLnRzIiwgIi4uLy4uL3NyYy91aS9kZXZ0b29scy9zaW11bGF0aW9uLnRzIiwgIi4uLy4uL3NyYy91aS9kZXZ0b29scy9zdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy91aS9kZXZ0b29scy9zdHJhdGVneUJ1aWxkZXIudHMiLCAiLi4vLi4vc3JjL3VpL2RldnRvb2xzL2xvZ3MudHMiLCAiLi4vLi4vc3JjL3VpL2RldnRvb2xzL2dlbmVyYS50cyIsICIuLi8uLi9zcmMvdWkvZGV2dG9vbHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IENvbnRleHRSZXN1bHQsIEN1c3RvbVN0cmF0ZWd5LCBMb2dFbnRyeSB9IGZyb20gXCIuLi8uLi9zaGFyZWQvdHlwZXMuanNcIjtcblxuZXhwb3J0IGludGVyZmFjZSBDb2x1bW5EZWZpbml0aW9uIHtcbiAgICBrZXk6IHN0cmluZztcbiAgICBsYWJlbDogc3RyaW5nO1xuICAgIHZpc2libGU6IGJvb2xlYW47XG4gICAgd2lkdGg6IHN0cmluZzsgLy8gQ1NTIHdpZHRoXG4gICAgZmlsdGVyYWJsZTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNvbnN0IGFwcFN0YXRlID0ge1xuICAgIGN1cnJlbnRUYWJzOiBbXSBhcyBjaHJvbWUudGFicy5UYWJbXSxcbiAgICBsb2NhbEN1c3RvbVN0cmF0ZWdpZXM6IFtdIGFzIEN1c3RvbVN0cmF0ZWd5W10sXG4gICAgY3VycmVudENvbnRleHRNYXA6IG5ldyBNYXA8bnVtYmVyLCBDb250ZXh0UmVzdWx0PigpLFxuICAgIHRhYlRpdGxlczogbmV3IE1hcDxudW1iZXIsIHN0cmluZz4oKSxcbiAgICBzb3J0S2V5OiBudWxsIGFzIHN0cmluZyB8IG51bGwsXG4gICAgc29ydERpcmVjdGlvbjogJ2FzYycgYXMgJ2FzYycgfCAnZGVzYycsXG4gICAgc2ltdWxhdGVkU2VsZWN0aW9uOiBuZXcgU2V0PG51bWJlcj4oKSxcblxuICAgIC8vIE1vZGVybiBUYWJsZSBTdGF0ZVxuICAgIGdsb2JhbFNlYXJjaFF1ZXJ5OiAnJyxcbiAgICBjb2x1bW5GaWx0ZXJzOiB7fSBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+LFxuICAgIGNvbHVtbnM6IFtcbiAgICAgICAgeyBrZXk6ICdpZCcsIGxhYmVsOiAnSUQnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzYwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgICAgIHsga2V5OiAnaW5kZXgnLCBsYWJlbDogJ0luZGV4JywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICc2MHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgICAgICB7IGtleTogJ3dpbmRvd0lkJywgbGFiZWw6ICdXaW5kb3cnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzcwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgICAgIHsga2V5OiAnZ3JvdXBJZCcsIGxhYmVsOiAnR3JvdXAnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzcwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgICAgIHsga2V5OiAndGl0bGUnLCBsYWJlbDogJ1RpdGxlJywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICcyMDBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICAgICAgeyBrZXk6ICd1cmwnLCBsYWJlbDogJ1VSTCcsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnMjUwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgICAgIHsga2V5OiAnZ2VucmUnLCBsYWJlbDogJ0dlbnJlJywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICcxMDBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICAgICAgeyBrZXk6ICdjb250ZXh0JywgbGFiZWw6ICdDYXRlZ29yeScsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnMTAwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgICAgIHsga2V5OiAnc2l0ZU5hbWUnLCBsYWJlbDogJ1NpdGUgTmFtZScsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnMTIwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgICAgIHsga2V5OiAncGxhdGZvcm0nLCBsYWJlbDogJ1BsYXRmb3JtJywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICcxMDBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICAgICAgeyBrZXk6ICdvYmplY3RUeXBlJywgbGFiZWw6ICdPYmplY3QgVHlwZScsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnMTAwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgICAgIHsga2V5OiAnZXh0cmFjdGVkVGl0bGUnLCBsYWJlbDogJ0V4dHJhY3RlZCBUaXRsZScsIHZpc2libGU6IGZhbHNlLCB3aWR0aDogJzIwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgICAgICB7IGtleTogJ2F1dGhvck9yQ3JlYXRvcicsIGxhYmVsOiAnQXV0aG9yJywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICcxMjBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICAgICAgeyBrZXk6ICdwdWJsaXNoZWRBdCcsIGxhYmVsOiAnUHVibGlzaGVkJywgdmlzaWJsZTogZmFsc2UsIHdpZHRoOiAnMTAwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgICAgIHsga2V5OiAnc3RhdHVzJywgbGFiZWw6ICdTdGF0dXMnLCB2aXNpYmxlOiBmYWxzZSwgd2lkdGg6ICc4MHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgICAgICB7IGtleTogJ2FjdGl2ZScsIGxhYmVsOiAnQWN0aXZlJywgdmlzaWJsZTogZmFsc2UsIHdpZHRoOiAnNjBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICAgICAgeyBrZXk6ICdwaW5uZWQnLCBsYWJlbDogJ1Bpbm5lZCcsIHZpc2libGU6IGZhbHNlLCB3aWR0aDogJzYwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgICAgIHsga2V5OiAnb3BlbmVyVGFiSWQnLCBsYWJlbDogJ09wZW5lcicsIHZpc2libGU6IGZhbHNlLCB3aWR0aDogJzcwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgICAgIHsga2V5OiAncGFyZW50VGl0bGUnLCBsYWJlbDogJ1BhcmVudCBUaXRsZScsIHZpc2libGU6IGZhbHNlLCB3aWR0aDogJzE1MHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgICAgICB7IGtleTogJ2xhc3RBY2Nlc3NlZCcsIGxhYmVsOiAnTGFzdCBBY2Nlc3NlZCcsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnMTUwcHgnLCBmaWx0ZXJhYmxlOiBmYWxzZSB9LFxuICAgICAgICB7IGtleTogJ2FjdGlvbnMnLCBsYWJlbDogJ0FjdGlvbnMnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzEyMHB4JywgZmlsdGVyYWJsZTogZmFsc2UgfVxuICAgIF0gYXMgQ29sdW1uRGVmaW5pdGlvbltdLFxuXG4gICAgY3VycmVudExvZ3M6IFtdIGFzIExvZ0VudHJ5W11cbn07XG4iLCAiaW1wb3J0IHsgUHJlZmVyZW5jZXMsIFNvcnRpbmdTdHJhdGVneSwgVGFiTWV0YWRhdGEgfSBmcm9tIFwiLi90eXBlcy5qc1wiO1xuXG5leHBvcnQgY29uc3QgbWFwQ2hyb21lVGFiID0gKHRhYjogY2hyb21lLnRhYnMuVGFiKTogVGFiTWV0YWRhdGEgfCBudWxsID0+IHtcbiAgaWYgKCF0YWIuaWQgfHwgdGFiLmlkID09PSBjaHJvbWUudGFicy5UQUJfSURfTk9ORSB8fCAhdGFiLndpbmRvd0lkKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHtcbiAgICBpZDogdGFiLmlkLFxuICAgIHdpbmRvd0lkOiB0YWIud2luZG93SWQsXG4gICAgdGl0bGU6IHRhYi50aXRsZSB8fCBcIlVudGl0bGVkXCIsXG4gICAgdXJsOiB0YWIucGVuZGluZ1VybCB8fCB0YWIudXJsIHx8IFwiYWJvdXQ6YmxhbmtcIixcbiAgICBwaW5uZWQ6IEJvb2xlYW4odGFiLnBpbm5lZCksXG4gICAgbGFzdEFjY2Vzc2VkOiB0YWIubGFzdEFjY2Vzc2VkLFxuICAgIG9wZW5lclRhYklkOiB0YWIub3BlbmVyVGFiSWQgPz8gdW5kZWZpbmVkLFxuICAgIGZhdkljb25Vcmw6IHRhYi5mYXZJY29uVXJsLFxuICAgIGdyb3VwSWQ6IHRhYi5ncm91cElkLFxuICAgIGluZGV4OiB0YWIuaW5kZXgsXG4gICAgYWN0aXZlOiB0YWIuYWN0aXZlLFxuICAgIHN0YXR1czogdGFiLnN0YXR1cyxcbiAgICBzZWxlY3RlZDogdGFiLmhpZ2hsaWdodGVkXG4gIH07XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0U3RvcmVkUHJlZmVyZW5jZXMgPSBhc3luYyAoKTogUHJvbWlzZTxQcmVmZXJlbmNlcyB8IG51bGw+ID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFwicHJlZmVyZW5jZXNcIiwgKGl0ZW1zKSA9PiB7XG4gICAgICByZXNvbHZlKChpdGVtc1tcInByZWZlcmVuY2VzXCJdIGFzIFByZWZlcmVuY2VzKSA/PyBudWxsKTtcbiAgICB9KTtcbiAgfSk7XG59O1xuXG5leHBvcnQgY29uc3QgYXNBcnJheSA9IDxUPih2YWx1ZTogdW5rbm93bik6IFRbXSA9PiB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSByZXR1cm4gdmFsdWUgYXMgVFtdO1xuICAgIHJldHVybiBbXTtcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBlc2NhcGVIdG1sKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGlmICghdGV4dCkgcmV0dXJuICcnO1xuICByZXR1cm4gdGV4dFxuICAgIC5yZXBsYWNlKC8mL2csICcmYW1wOycpXG4gICAgLnJlcGxhY2UoLzwvZywgJyZsdDsnKVxuICAgIC5yZXBsYWNlKC8+L2csICcmZ3Q7JylcbiAgICAucmVwbGFjZSgvXCIvZywgJyZxdW90OycpXG4gICAgLnJlcGxhY2UoLycvZywgJyYjMDM5OycpO1xufVxuIiwgImltcG9ydCB7IGFwcFN0YXRlIH0gZnJvbSBcIi4vc3RhdGUuanNcIjtcbmltcG9ydCB7IG1hcENocm9tZVRhYiwgZXNjYXBlSHRtbCB9IGZyb20gXCIuLi8uLi9zaGFyZWQvdXRpbHMuanNcIjtcbmltcG9ydCB7IFRhYk1ldGFkYXRhIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC90eXBlcy5qc1wiO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0TWFwcGVkVGFicygpOiBUYWJNZXRhZGF0YVtdIHtcbiAgcmV0dXJuIGFwcFN0YXRlLmN1cnJlbnRUYWJzXG4gICAgLm1hcCh0YWIgPT4ge1xuICAgICAgICBjb25zdCBtZXRhZGF0YSA9IG1hcENocm9tZVRhYih0YWIpO1xuICAgICAgICBpZiAoIW1ldGFkYXRhKSByZXR1cm4gbnVsbDtcblxuICAgICAgICBjb25zdCBjb250ZXh0UmVzdWx0ID0gYXBwU3RhdGUuY3VycmVudENvbnRleHRNYXAuZ2V0KG1ldGFkYXRhLmlkKTtcbiAgICAgICAgaWYgKGNvbnRleHRSZXN1bHQpIHtcbiAgICAgICAgICAgIG1ldGFkYXRhLmNvbnRleHQgPSBjb250ZXh0UmVzdWx0LmNvbnRleHQ7XG4gICAgICAgICAgICBtZXRhZGF0YS5jb250ZXh0RGF0YSA9IGNvbnRleHRSZXN1bHQuZGF0YTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWV0YWRhdGE7XG4gICAgfSlcbiAgICAuZmlsdGVyKCh0KTogdCBpcyBUYWJNZXRhZGF0YSA9PiB0ICE9PSBudWxsKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN0cmlwSHRtbChodG1sOiBzdHJpbmcpIHtcbiAgICBsZXQgdG1wID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIkRJVlwiKTtcbiAgICB0bXAuaW5uZXJIVE1MID0gaHRtbDtcbiAgICByZXR1cm4gdG1wLnRleHRDb250ZW50IHx8IHRtcC5pbm5lclRleHQgfHwgXCJcIjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFNvcnRWYWx1ZSh0YWI6IGNocm9tZS50YWJzLlRhYiwga2V5OiBzdHJpbmcpOiBhbnkge1xuICBzd2l0Y2ggKGtleSkge1xuICAgIGNhc2UgJ3BhcmVudFRpdGxlJzpcbiAgICAgIHJldHVybiB0YWIub3BlbmVyVGFiSWQgPyAoYXBwU3RhdGUudGFiVGl0bGVzLmdldCh0YWIub3BlbmVyVGFiSWQpIHx8ICcnKSA6ICcnO1xuICAgIGNhc2UgJ2dlbnJlJzpcbiAgICAgIHJldHVybiAodGFiLmlkICYmIGFwcFN0YXRlLmN1cnJlbnRDb250ZXh0TWFwLmdldCh0YWIuaWQpPy5kYXRhPy5nZW5yZSkgfHwgJyc7XG4gICAgY2FzZSAnY29udGV4dCc6XG4gICAgICByZXR1cm4gKHRhYi5pZCAmJiBhcHBTdGF0ZS5jdXJyZW50Q29udGV4dE1hcC5nZXQodGFiLmlkKT8uY29udGV4dCkgfHwgJyc7XG4gICAgY2FzZSAnc2l0ZU5hbWUnOlxuICAgICAgcmV0dXJuICh0YWIuaWQgJiYgYXBwU3RhdGUuY3VycmVudENvbnRleHRNYXAuZ2V0KHRhYi5pZCk/LmRhdGE/LnNpdGVOYW1lKSB8fCAnJztcbiAgICBjYXNlICdwbGF0Zm9ybSc6XG4gICAgICByZXR1cm4gKHRhYi5pZCAmJiBhcHBTdGF0ZS5jdXJyZW50Q29udGV4dE1hcC5nZXQodGFiLmlkKT8uZGF0YT8ucGxhdGZvcm0pIHx8ICcnO1xuICAgIGNhc2UgJ29iamVjdFR5cGUnOlxuICAgICAgcmV0dXJuICh0YWIuaWQgJiYgYXBwU3RhdGUuY3VycmVudENvbnRleHRNYXAuZ2V0KHRhYi5pZCk/LmRhdGE/Lm9iamVjdFR5cGUpIHx8ICcnO1xuICAgIGNhc2UgJ2V4dHJhY3RlZFRpdGxlJzpcbiAgICAgIHJldHVybiAodGFiLmlkICYmIGFwcFN0YXRlLmN1cnJlbnRDb250ZXh0TWFwLmdldCh0YWIuaWQpPy5kYXRhPy50aXRsZSkgfHwgJyc7XG4gICAgY2FzZSAnYXV0aG9yT3JDcmVhdG9yJzpcbiAgICAgIHJldHVybiAodGFiLmlkICYmIGFwcFN0YXRlLmN1cnJlbnRDb250ZXh0TWFwLmdldCh0YWIuaWQpPy5kYXRhPy5hdXRob3JPckNyZWF0b3IpIHx8ICcnO1xuICAgIGNhc2UgJ3B1Ymxpc2hlZEF0JzpcbiAgICAgIHJldHVybiAodGFiLmlkICYmIGFwcFN0YXRlLmN1cnJlbnRDb250ZXh0TWFwLmdldCh0YWIuaWQpPy5kYXRhPy5wdWJsaXNoZWRBdCkgfHwgJyc7XG4gICAgY2FzZSAnYWN0aXZlJzpcbiAgICAgIHJldHVybiB0YWIuYWN0aXZlID8gMSA6IDA7XG4gICAgY2FzZSAncGlubmVkJzpcbiAgICAgIHJldHVybiB0YWIucGlubmVkID8gMSA6IDA7XG4gICAgY2FzZSAnaWQnOlxuICAgICAgcmV0dXJuIHRhYi5pZCA/PyAtMTtcbiAgICBjYXNlICdpbmRleCc6XG4gICAgICByZXR1cm4gdGFiLmluZGV4O1xuICAgIGNhc2UgJ3dpbmRvd0lkJzpcbiAgICAgIHJldHVybiB0YWIud2luZG93SWQ7XG4gICAgY2FzZSAnZ3JvdXBJZCc6XG4gICAgICByZXR1cm4gdGFiLmdyb3VwSWQ7XG4gICAgY2FzZSAnb3BlbmVyVGFiSWQnOlxuICAgICAgcmV0dXJuIHRhYi5vcGVuZXJUYWJJZCA/PyAtMTtcbiAgICBjYXNlICdsYXN0QWNjZXNzZWQnOlxuICAgICAgLy8gbGFzdEFjY2Vzc2VkIGlzIGEgdmFsaWQgcHJvcGVydHkgb2YgY2hyb21lLnRhYnMuVGFiIGluIG1vZGVybiBkZWZpbml0aW9uc1xuICAgICAgcmV0dXJuICh0YWIgYXMgY2hyb21lLnRhYnMuVGFiICYgeyBsYXN0QWNjZXNzZWQ/OiBudW1iZXIgfSkubGFzdEFjY2Vzc2VkIHx8IDA7XG4gICAgY2FzZSAndGl0bGUnOlxuICAgICAgcmV0dXJuICh0YWIudGl0bGUgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG4gICAgY2FzZSAndXJsJzpcbiAgICAgIHJldHVybiAodGFiLnVybCB8fCAnJykudG9Mb3dlckNhc2UoKTtcbiAgICBjYXNlICdzdGF0dXMnOlxuICAgICAgcmV0dXJuICh0YWIuc3RhdHVzIHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gJyc7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENlbGxWYWx1ZSh0YWI6IGNocm9tZS50YWJzLlRhYiwga2V5OiBzdHJpbmcpOiBzdHJpbmcgfCBIVE1MRWxlbWVudCB7XG4gICAgY29uc3QgZXNjYXBlID0gZXNjYXBlSHRtbDtcblxuICAgIHN3aXRjaCAoa2V5KSB7XG4gICAgICAgIGNhc2UgJ2lkJzogcmV0dXJuIFN0cmluZyh0YWIuaWQgPz8gJ04vQScpO1xuICAgICAgICBjYXNlICdpbmRleCc6IHJldHVybiBTdHJpbmcodGFiLmluZGV4KTtcbiAgICAgICAgY2FzZSAnd2luZG93SWQnOiByZXR1cm4gU3RyaW5nKHRhYi53aW5kb3dJZCk7XG4gICAgICAgIGNhc2UgJ2dyb3VwSWQnOiByZXR1cm4gU3RyaW5nKHRhYi5ncm91cElkKTtcbiAgICAgICAgY2FzZSAndGl0bGUnOiByZXR1cm4gZXNjYXBlKHRhYi50aXRsZSB8fCAnJyk7XG4gICAgICAgIGNhc2UgJ3VybCc6IHJldHVybiBlc2NhcGUodGFiLnVybCB8fCAnJyk7XG4gICAgICAgIGNhc2UgJ3N0YXR1cyc6IHJldHVybiBlc2NhcGUodGFiLnN0YXR1cyB8fCAnJyk7XG4gICAgICAgIGNhc2UgJ2FjdGl2ZSc6IHJldHVybiB0YWIuYWN0aXZlID8gJ1llcycgOiAnTm8nO1xuICAgICAgICBjYXNlICdwaW5uZWQnOiByZXR1cm4gdGFiLnBpbm5lZCA/ICdZZXMnIDogJ05vJztcbiAgICAgICAgY2FzZSAnb3BlbmVyVGFiSWQnOiByZXR1cm4gU3RyaW5nKHRhYi5vcGVuZXJUYWJJZCA/PyAnLScpO1xuICAgICAgICBjYXNlICdwYXJlbnRUaXRsZSc6XG4gICAgICAgICAgICAgcmV0dXJuIGVzY2FwZSh0YWIub3BlbmVyVGFiSWQgPyAoYXBwU3RhdGUudGFiVGl0bGVzLmdldCh0YWIub3BlbmVyVGFiSWQpIHx8ICdVbmtub3duJykgOiAnLScpO1xuICAgICAgICBjYXNlICdnZW5yZSc6XG4gICAgICAgICAgICAgcmV0dXJuIGVzY2FwZSgodGFiLmlkICYmIGFwcFN0YXRlLmN1cnJlbnRDb250ZXh0TWFwLmdldCh0YWIuaWQpPy5kYXRhPy5nZW5yZSkgfHwgJy0nKTtcbiAgICAgICAgY2FzZSAnY29udGV4dCc6IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRleHRSZXN1bHQgPSB0YWIuaWQgPyBhcHBTdGF0ZS5jdXJyZW50Q29udGV4dE1hcC5nZXQodGFiLmlkKSA6IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIGlmICghY29udGV4dFJlc3VsdCkgcmV0dXJuICdOL0EnO1xuXG4gICAgICAgICAgICBsZXQgY2VsbFN0eWxlID0gJyc7XG4gICAgICAgICAgICBsZXQgYWlDb250ZXh0ID0gJyc7XG5cbiAgICAgICAgICAgIGlmIChjb250ZXh0UmVzdWx0LnN0YXR1cyA9PT0gJ1JFU1RSSUNURUQnKSB7XG4gICAgICAgICAgICAgICAgYWlDb250ZXh0ID0gJ1VuZXh0cmFjdGFibGUgKHJlc3RyaWN0ZWQpJztcbiAgICAgICAgICAgICAgICBjZWxsU3R5bGUgPSAnY29sb3I6IGdyYXk7IGZvbnQtc3R5bGU6IGl0YWxpYzsnO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjb250ZXh0UmVzdWx0LmVycm9yKSB7XG4gICAgICAgICAgICAgICAgYWlDb250ZXh0ID0gYEVycm9yICgke2NvbnRleHRSZXN1bHQuZXJyb3J9KWA7XG4gICAgICAgICAgICAgICAgY2VsbFN0eWxlID0gJ2NvbG9yOiByZWQ7JztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY29udGV4dFJlc3VsdC5zb3VyY2UgPT09ICdFeHRyYWN0aW9uJykge1xuICAgICAgICAgICAgICAgIGFpQ29udGV4dCA9IGAke2NvbnRleHRSZXN1bHQuY29udGV4dH0gKEV4dHJhY3RlZClgO1xuICAgICAgICAgICAgICAgIGNlbGxTdHlsZSA9ICdjb2xvcjogZ3JlZW47IGZvbnQtd2VpZ2h0OiBib2xkOyc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICBhaUNvbnRleHQgPSBgJHtjb250ZXh0UmVzdWx0LmNvbnRleHR9YDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICBjb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdmbGV4JztcbiAgICAgICAgICAgIGNvbnRhaW5lci5zdHlsZS5mbGV4RGlyZWN0aW9uID0gJ2NvbHVtbic7XG4gICAgICAgICAgICBjb250YWluZXIuc3R5bGUuZ2FwID0gJzVweCc7XG5cbiAgICAgICAgICAgIGNvbnN0IHN1bW1hcnlEaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgIHN1bW1hcnlEaXYuc3R5bGUuY3NzVGV4dCA9IGNlbGxTdHlsZTtcbiAgICAgICAgICAgIHN1bW1hcnlEaXYudGV4dENvbnRlbnQgPSBhaUNvbnRleHQ7XG4gICAgICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoc3VtbWFyeURpdik7XG5cbiAgICAgICAgICAgIGlmIChjb250ZXh0UmVzdWx0LmRhdGEpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkZXRhaWxzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncHJlJyk7XG4gICAgICAgICAgICAgICAgZGV0YWlscy5zdHlsZS5jc3NUZXh0ID0gJ21heC1oZWlnaHQ6IDMwMHB4OyBvdmVyZmxvdzogYXV0bzsgZm9udC1zaXplOiAxMXB4OyB0ZXh0LWFsaWduOiBsZWZ0OyBiYWNrZ3JvdW5kOiAjZjVmNWY1OyBwYWRkaW5nOiA1cHg7IGJvcmRlcjogMXB4IHNvbGlkICNkZGQ7IG1hcmdpbjogMDsgd2hpdGUtc3BhY2U6IHByZS13cmFwOyBmb250LWZhbWlseTogbW9ub3NwYWNlOyc7XG4gICAgICAgICAgICAgICAgZGV0YWlscy50ZXh0Q29udGVudCA9IEpTT04uc3RyaW5naWZ5KGNvbnRleHRSZXN1bHQuZGF0YSwgbnVsbCwgMik7XG4gICAgICAgICAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKGRldGFpbHMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gY29udGFpbmVyO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgJ2xhc3RBY2Nlc3NlZCc6XG4gICAgICAgICAgICByZXR1cm4gbmV3IERhdGUoKHRhYiBhcyBhbnkpLmxhc3RBY2Nlc3NlZCB8fCAwKS50b0xvY2FsZVN0cmluZygpO1xuICAgICAgICBjYXNlICdhY3Rpb25zJzoge1xuICAgICAgICAgICAgY29uc3Qgd3JhcHBlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgd3JhcHBlci5pbm5lckhUTUwgPSBgXG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImdvdG8tdGFiLWJ0blwiIGRhdGEtdGFiLWlkPVwiJHt0YWIuaWR9XCIgZGF0YS13aW5kb3ctaWQ9XCIke3RhYi53aW5kb3dJZH1cIj5HbzwvYnV0dG9uPlxuICAgICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJjbG9zZS10YWItYnRuXCIgZGF0YS10YWItaWQ9XCIke3RhYi5pZH1cIiBzdHlsZT1cImJhY2tncm91bmQtY29sb3I6ICNkYzM1NDU7IG1hcmdpbi1sZWZ0OiAycHg7XCI+WDwvYnV0dG9uPlxuICAgICAgICAgICAgYDtcbiAgICAgICAgICAgIHJldHVybiB3cmFwcGVyO1xuICAgICAgICB9XG4gICAgICAgIGRlZmF1bHQ6IHJldHVybiAnJztcbiAgICB9XG59XG4iLCAiaW1wb3J0IHsgTG9nRW50cnksIExvZ0xldmVsLCBQcmVmZXJlbmNlcyB9IGZyb20gXCIuL3R5cGVzLmpzXCI7XG5cbmNvbnN0IFBSRUZJWCA9IFwiW1RhYlNvcnRlcl1cIjtcblxuY29uc3QgTEVWRUxfUFJJT1JJVFk6IFJlY29yZDxMb2dMZXZlbCwgbnVtYmVyPiA9IHtcbiAgZGVidWc6IDAsXG4gIGluZm86IDEsXG4gIHdhcm46IDIsXG4gIGVycm9yOiAzLFxuICBjcml0aWNhbDogNFxufTtcblxubGV0IGN1cnJlbnRMZXZlbDogTG9nTGV2ZWwgPSBcImluZm9cIjtcbmxldCBsb2dzOiBMb2dFbnRyeVtdID0gW107XG5jb25zdCBNQVhfTE9HUyA9IDEwMDA7XG5jb25zdCBTVE9SQUdFX0tFWSA9IFwic2Vzc2lvbkxvZ3NcIjtcblxuY29uc3QgU0VOU0lUSVZFX0tFWVMgPSAvcGFzc3dvcmR8c2VjcmV0fHRva2VufGNyZWRlbnRpYWx8Y29va2llfHNlc3Npb258YXV0aG9yaXphdGlvbnwoKGFwaXxhY2Nlc3N8c2VjcmV0fHByaXZhdGUpWy1fXT9rZXkpL2k7XG5cbmNvbnN0IHNhbml0aXplQ29udGV4dCA9IChjb250ZXh0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkID0+IHtcbiAgICBpZiAoIWNvbnRleHQpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgdHJ5IHtcbiAgICAgICAgLy8gRGVlcCBjbG9uZSB0byBlbnN1cmUgd2UgZG9uJ3QgbW9kaWZ5IHRoZSBvcmlnaW5hbCBvYmplY3QgYW5kIHJlbW92ZSBub24tc2VyaWFsaXphYmxlIGRhdGFcbiAgICAgICAgY29uc3QganNvbiA9IEpTT04uc3RyaW5naWZ5KGNvbnRleHQpO1xuICAgICAgICBjb25zdCBvYmogPSBKU09OLnBhcnNlKGpzb24pO1xuXG4gICAgICAgIGNvbnN0IHJlZGFjdCA9IChvOiBhbnkpID0+IHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgbyAhPT0gJ29iamVjdCcgfHwgbyA9PT0gbnVsbCkgcmV0dXJuO1xuICAgICAgICAgICAgZm9yIChjb25zdCBrIGluIG8pIHtcbiAgICAgICAgICAgICAgICBpZiAoU0VOU0lUSVZFX0tFWVMudGVzdChrKSkge1xuICAgICAgICAgICAgICAgICAgICBvW2tdID0gJ1tSRURBQ1RFRF0nO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlZGFjdChvW2tdKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHJlZGFjdChvYmopO1xuICAgICAgICByZXR1cm4gb2JqO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcmV0dXJuIHsgZXJyb3I6IFwiRmFpbGVkIHRvIHNhbml0aXplIGNvbnRleHRcIiB9O1xuICAgIH1cbn07XG5cbi8vIFNhZmUgY29udGV4dCBjaGVja1xuY29uc3QgaXNTZXJ2aWNlV29ya2VyID0gdHlwZW9mIHNlbGYgIT09ICd1bmRlZmluZWQnICYmXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlb2YgKHNlbGYgYXMgYW55KS5TZXJ2aWNlV29ya2VyR2xvYmFsU2NvcGUgIT09ICd1bmRlZmluZWQnICYmXG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxmIGluc3RhbmNlb2YgKHNlbGYgYXMgYW55KS5TZXJ2aWNlV29ya2VyR2xvYmFsU2NvcGU7XG5sZXQgaXNTYXZpbmcgPSBmYWxzZTtcbmxldCBwZW5kaW5nU2F2ZSA9IGZhbHNlO1xubGV0IHNhdmVUaW1lcjogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCBudWxsID0gbnVsbDtcblxuY29uc3QgZG9TYXZlID0gKCkgPT4ge1xuICAgIGlmICghaXNTZXJ2aWNlV29ya2VyIHx8ICFjaHJvbWU/LnN0b3JhZ2U/LnNlc3Npb24gfHwgaXNTYXZpbmcpIHtcbiAgICAgICAgcGVuZGluZ1NhdmUgPSB0cnVlO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaXNTYXZpbmcgPSB0cnVlO1xuICAgIHBlbmRpbmdTYXZlID0gZmFsc2U7XG5cbiAgICBjaHJvbWUuc3RvcmFnZS5zZXNzaW9uLnNldCh7IFtTVE9SQUdFX0tFWV06IGxvZ3MgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIGlzU2F2aW5nID0gZmFsc2U7XG4gICAgICAgIGlmIChwZW5kaW5nU2F2ZSkge1xuICAgICAgICAgICAgc2F2ZUxvZ3NUb1N0b3JhZ2UoKTtcbiAgICAgICAgfVxuICAgIH0pLmNhdGNoKGVyciA9PiB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gc2F2ZSBsb2dzXCIsIGVycik7XG4gICAgICAgIGlzU2F2aW5nID0gZmFsc2U7XG4gICAgfSk7XG59O1xuXG5jb25zdCBzYXZlTG9nc1RvU3RvcmFnZSA9ICgpID0+IHtcbiAgICBpZiAoc2F2ZVRpbWVyKSBjbGVhclRpbWVvdXQoc2F2ZVRpbWVyKTtcbiAgICBzYXZlVGltZXIgPSBzZXRUaW1lb3V0KGRvU2F2ZSwgMTAwMCk7XG59O1xuXG5sZXQgcmVzb2x2ZUxvZ2dlclJlYWR5OiAoKSA9PiB2b2lkO1xuZXhwb3J0IGNvbnN0IGxvZ2dlclJlYWR5ID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG4gICAgcmVzb2x2ZUxvZ2dlclJlYWR5ID0gcmVzb2x2ZTtcbn0pO1xuXG5leHBvcnQgY29uc3QgaW5pdExvZ2dlciA9IGFzeW5jICgpID0+IHtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyICYmIGNocm9tZT8uc3RvcmFnZT8uc2Vzc2lvbikge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY2hyb21lLnN0b3JhZ2Uuc2Vzc2lvbi5nZXQoU1RPUkFHRV9LRVkpO1xuICAgICAgICAgICAgaWYgKHJlc3VsdFtTVE9SQUdFX0tFWV0gJiYgQXJyYXkuaXNBcnJheShyZXN1bHRbU1RPUkFHRV9LRVldKSkge1xuICAgICAgICAgICAgICAgIGxvZ3MgPSByZXN1bHRbU1RPUkFHRV9LRVldO1xuICAgICAgICAgICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSBsb2dzID0gbG9ncy5zbGljZSgwLCBNQVhfTE9HUyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gcmVzdG9yZSBsb2dzXCIsIGUpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGlmIChyZXNvbHZlTG9nZ2VyUmVhZHkpIHJlc29sdmVMb2dnZXJSZWFkeSgpO1xufTtcblxuZXhwb3J0IGNvbnN0IHNldExvZ2dlclByZWZlcmVuY2VzID0gKHByZWZzOiBQcmVmZXJlbmNlcykgPT4ge1xuICBpZiAocHJlZnMubG9nTGV2ZWwpIHtcbiAgICBjdXJyZW50TGV2ZWwgPSBwcmVmcy5sb2dMZXZlbDtcbiAgfSBlbHNlIGlmIChwcmVmcy5kZWJ1Zykge1xuICAgIGN1cnJlbnRMZXZlbCA9IFwiZGVidWdcIjtcbiAgfSBlbHNlIHtcbiAgICBjdXJyZW50TGV2ZWwgPSBcImluZm9cIjtcbiAgfVxufTtcblxuY29uc3Qgc2hvdWxkTG9nID0gKGxldmVsOiBMb2dMZXZlbCk6IGJvb2xlYW4gPT4ge1xuICByZXR1cm4gTEVWRUxfUFJJT1JJVFlbbGV2ZWxdID49IExFVkVMX1BSSU9SSVRZW2N1cnJlbnRMZXZlbF07XG59O1xuXG5jb25zdCBmb3JtYXRNZXNzYWdlID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIHJldHVybiBjb250ZXh0ID8gYCR7bWVzc2FnZX0gOjogJHtKU09OLnN0cmluZ2lmeShjb250ZXh0KX1gIDogbWVzc2FnZTtcbn07XG5cbmNvbnN0IGFkZExvZyA9IChsZXZlbDogTG9nTGV2ZWwsIG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGlmIChzaG91bGRMb2cobGV2ZWwpKSB7XG4gICAgICBjb25zdCBlbnRyeTogTG9nRW50cnkgPSB7XG4gICAgICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxuICAgICAgICAgIGxldmVsLFxuICAgICAgICAgIG1lc3NhZ2UsXG4gICAgICAgICAgY29udGV4dFxuICAgICAgfTtcblxuICAgICAgaWYgKGlzU2VydmljZVdvcmtlcikge1xuICAgICAgICAgIGxvZ3MudW5zaGlmdChlbnRyeSk7XG4gICAgICAgICAgaWYgKGxvZ3MubGVuZ3RoID4gTUFYX0xPR1MpIHtcbiAgICAgICAgICAgICAgbG9ncy5wb3AoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgc2F2ZUxvZ3NUb1N0b3JhZ2UoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gSW4gb3RoZXIgY29udGV4dHMsIHNlbmQgdG8gU1dcbiAgICAgICAgICBpZiAoY2hyb21lPy5ydW50aW1lPy5zZW5kTWVzc2FnZSkge1xuICAgICAgICAgICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2xvZ0VudHJ5JywgcGF5bG9hZDogZW50cnkgfSkuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgICAgICAgICAvLyBJZ25vcmUgaWYgbWVzc2FnZSBmYWlscyAoZS5nLiBjb250ZXh0IGludmFsaWRhdGVkKVxuICAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgIH1cbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGFkZExvZ0VudHJ5ID0gKGVudHJ5OiBMb2dFbnRyeSkgPT4ge1xuICAgIGlmIChpc1NlcnZpY2VXb3JrZXIpIHtcbiAgICAgICAgLy8gRW5zdXJlIGNvbnRleHQgaXMgc2FuaXRpemVkIGJlZm9yZSBzdG9yaW5nXG4gICAgICAgIGNvbnN0IHNhZmVDb250ZXh0ID0gc2FuaXRpemVDb250ZXh0KGVudHJ5LmNvbnRleHQpO1xuICAgICAgICBjb25zdCBzYWZlRW50cnkgPSB7IC4uLmVudHJ5LCBjb250ZXh0OiBzYWZlQ29udGV4dCB9O1xuXG4gICAgICAgIGxvZ3MudW5zaGlmdChzYWZlRW50cnkpO1xuICAgICAgICBpZiAobG9ncy5sZW5ndGggPiBNQVhfTE9HUykge1xuICAgICAgICAgICAgbG9ncy5wb3AoKTtcbiAgICAgICAgfVxuICAgICAgICBzYXZlTG9nc1RvU3RvcmFnZSgpO1xuICAgIH1cbn07XG5cbmV4cG9ydCBjb25zdCBnZXRMb2dzID0gKCkgPT4gWy4uLmxvZ3NdO1xuZXhwb3J0IGNvbnN0IGNsZWFyTG9ncyA9ICgpID0+IHtcbiAgICBsb2dzLmxlbmd0aCA9IDA7XG4gICAgaWYgKGlzU2VydmljZVdvcmtlcikgc2F2ZUxvZ3NUb1N0b3JhZ2UoKTtcbn07XG5cbmV4cG9ydCBjb25zdCBsb2dEZWJ1ZyA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBpZiAoc2hvdWxkTG9nKFwiZGVidWdcIikpIHtcbiAgICAgIGNvbnN0IHNhZmVDb250ZXh0ID0gc2FuaXRpemVDb250ZXh0KGNvbnRleHQpO1xuICAgICAgYWRkTG9nKFwiZGVidWdcIiwgbWVzc2FnZSwgc2FmZUNvbnRleHQpO1xuICAgICAgY29uc29sZS5kZWJ1ZyhgJHtQUkVGSVh9IFtERUJVR10gJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIHNhZmVDb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0luZm8gPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgaWYgKHNob3VsZExvZyhcImluZm9cIikpIHtcbiAgICAgIGNvbnN0IHNhZmVDb250ZXh0ID0gc2FuaXRpemVDb250ZXh0KGNvbnRleHQpO1xuICAgICAgYWRkTG9nKFwiaW5mb1wiLCBtZXNzYWdlLCBzYWZlQ29udGV4dCk7XG4gICAgICBjb25zb2xlLmluZm8oYCR7UFJFRklYfSBbSU5GT10gJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIHNhZmVDb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ1dhcm4gPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgaWYgKHNob3VsZExvZyhcIndhcm5cIikpIHtcbiAgICAgIGNvbnN0IHNhZmVDb250ZXh0ID0gc2FuaXRpemVDb250ZXh0KGNvbnRleHQpO1xuICAgICAgYWRkTG9nKFwid2FyblwiLCBtZXNzYWdlLCBzYWZlQ29udGV4dCk7XG4gICAgICBjb25zb2xlLndhcm4oYCR7UFJFRklYfSBbV0FSTl0gJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIHNhZmVDb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0Vycm9yID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGlmIChzaG91bGRMb2coXCJlcnJvclwiKSkge1xuICAgICAgY29uc3Qgc2FmZUNvbnRleHQgPSBzYW5pdGl6ZUNvbnRleHQoY29udGV4dCk7XG4gICAgICBhZGRMb2coXCJlcnJvclwiLCBtZXNzYWdlLCBzYWZlQ29udGV4dCk7XG4gICAgICBjb25zb2xlLmVycm9yKGAke1BSRUZJWH0gW0VSUk9SXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgc2FmZUNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nQ3JpdGljYWwgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgaWYgKHNob3VsZExvZyhcImNyaXRpY2FsXCIpKSB7XG4gICAgICBjb25zdCBzYWZlQ29udGV4dCA9IHNhbml0aXplQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGFkZExvZyhcImNyaXRpY2FsXCIsIG1lc3NhZ2UsIHNhZmVDb250ZXh0KTtcbiAgICAgIC8vIENyaXRpY2FsIGxvZ3MgdXNlIGVycm9yIGNvbnNvbGUgYnV0IHdpdGggZGlzdGluY3QgcHJlZml4IGFuZCBtYXliZSBzdHlsaW5nIGlmIHN1cHBvcnRlZFxuICAgICAgY29uc29sZS5lcnJvcihgJHtQUkVGSVh9IFtDUklUSUNBTF0gXHVEODNEXHVERUE4ICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBzYWZlQ29udGV4dCl9YCk7XG4gIH1cbn07XG4iLCAiaW1wb3J0IHsgYXBwU3RhdGUsIENvbHVtbkRlZmluaXRpb24gfSBmcm9tIFwiLi9zdGF0ZS5qc1wiO1xuaW1wb3J0IHsgZ2V0U29ydFZhbHVlLCBnZXRDZWxsVmFsdWUsIGdldE1hcHBlZFRhYnMsIHN0cmlwSHRtbCB9IGZyb20gXCIuL2RhdGEuanNcIjtcbmltcG9ydCB7IGxvZ0luZm8gfSBmcm9tIFwiLi4vLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgZXNjYXBlSHRtbCB9IGZyb20gXCIuLi8uLi9zaGFyZWQvdXRpbHMuanNcIjtcbmltcG9ydCB7IFRhYk1ldGFkYXRhIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC90eXBlcy5qc1wiO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbG9hZFRhYnMoKSB7XG4gIGxvZ0luZm8oXCJMb2FkaW5nIHRhYnMgZm9yIERldlRvb2xzXCIpO1xuICBjb25zdCB0YWJzID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoe30pO1xuICBhcHBTdGF0ZS5jdXJyZW50VGFicyA9IHRhYnM7XG5cbiAgY29uc3QgdG90YWxUYWJzRWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndG90YWxUYWJzJyk7XG4gIGlmICh0b3RhbFRhYnNFbCkge1xuICAgIHRvdGFsVGFic0VsLnRleHRDb250ZW50ID0gdGFicy5sZW5ndGgudG9TdHJpbmcoKTtcbiAgfVxuXG4gIC8vIENyZWF0ZSBhIG1hcCBvZiB0YWIgSUQgdG8gdGl0bGUgZm9yIHBhcmVudCBsb29rdXBcbiAgYXBwU3RhdGUudGFiVGl0bGVzLmNsZWFyKCk7XG4gIHRhYnMuZm9yRWFjaCh0YWIgPT4ge1xuICAgIGlmICh0YWIuaWQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgYXBwU3RhdGUudGFiVGl0bGVzLnNldCh0YWIuaWQsIHRhYi50aXRsZSB8fCAnVW50aXRsZWQnKTtcbiAgICB9XG4gIH0pO1xuXG4gIC8vIENvbnZlcnQgdG8gVGFiTWV0YWRhdGEgZm9yIGNvbnRleHQgYW5hbHlzaXNcbiAgY29uc3QgbWFwcGVkVGFiczogVGFiTWV0YWRhdGFbXSA9IGdldE1hcHBlZFRhYnMoKTtcblxuICAvLyBBbmFseXplIGNvbnRleHRcbiAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgIHR5cGU6IFwiYW5hbHl6ZVRhYnNcIixcbiAgICAgICAgICBwYXlsb2FkOiB7IHRhYklkczogbWFwcGVkVGFicy5tYXAodCA9PiB0LmlkKSB9XG4gICAgICB9KTtcbiAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vayAmJiByZXNwb25zZS5kYXRhKSB7XG4gICAgICAgICAgYXBwU3RhdGUuY3VycmVudENvbnRleHRNYXAgPSBuZXcgTWFwKHJlc3BvbnNlLmRhdGEpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zb2xlLndhcm4oXCJGYWlsZWQgdG8gYW5hbHl6ZSBjb250ZXh0IGZyb20gYmFja2dyb3VuZFwiLCByZXNwb25zZT8uZXJyb3IpO1xuICAgICAgICAgIGFwcFN0YXRlLmN1cnJlbnRDb250ZXh0TWFwLmNsZWFyKCk7XG4gICAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGFuYWx5emUgY29udGV4dFwiLCBlcnJvcik7XG4gICAgICBhcHBTdGF0ZS5jdXJyZW50Q29udGV4dE1hcC5jbGVhcigpO1xuICB9XG5cbiAgcmVuZGVyVGFibGUoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlclRhYmxlKCkge1xuICBjb25zdCB0Ym9keSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyN0YWJzVGFibGUgdGJvZHknKTtcbiAgaWYgKCF0Ym9keSkgcmV0dXJuO1xuXG4gIC8vIDEuIEZpbHRlclxuICBsZXQgdGFic0Rpc3BsYXkgPSBhcHBTdGF0ZS5jdXJyZW50VGFicy5maWx0ZXIodGFiID0+IHtcbiAgICAgIC8vIEdsb2JhbCBTZWFyY2hcbiAgICAgIGlmIChhcHBTdGF0ZS5nbG9iYWxTZWFyY2hRdWVyeSkge1xuICAgICAgICAgIGNvbnN0IHEgPSBhcHBTdGF0ZS5nbG9iYWxTZWFyY2hRdWVyeS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgIGNvbnN0IHNlYXJjaGFibGVUZXh0ID0gYCR7dGFiLnRpdGxlfSAke3RhYi51cmx9ICR7dGFiLmlkfWAudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICBpZiAoIXNlYXJjaGFibGVUZXh0LmluY2x1ZGVzKHEpKSByZXR1cm4gZmFsc2U7XG4gICAgICB9XG5cbiAgICAgIC8vIENvbHVtbiBGaWx0ZXJzXG4gICAgICBmb3IgKGNvbnN0IFtrZXksIGZpbHRlcl0gb2YgT2JqZWN0LmVudHJpZXMoYXBwU3RhdGUuY29sdW1uRmlsdGVycykpIHtcbiAgICAgICAgICBpZiAoIWZpbHRlcikgY29udGludWU7XG4gICAgICAgICAgY29uc3QgdmFsID0gU3RyaW5nKGdldFNvcnRWYWx1ZSh0YWIsIGtleSkpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgaWYgKCF2YWwuaW5jbHVkZXMoZmlsdGVyLnRvTG93ZXJDYXNlKCkpKSByZXR1cm4gZmFsc2U7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB0cnVlO1xuICB9KTtcblxuICAvLyAyLiBTb3J0XG4gIGlmIChhcHBTdGF0ZS5zb3J0S2V5KSB7XG4gICAgdGFic0Rpc3BsYXkuc29ydCgoYSwgYikgPT4ge1xuICAgICAgbGV0IHZhbEE6IGFueSA9IGdldFNvcnRWYWx1ZShhLCBhcHBTdGF0ZS5zb3J0S2V5ISk7XG4gICAgICBsZXQgdmFsQjogYW55ID0gZ2V0U29ydFZhbHVlKGIsIGFwcFN0YXRlLnNvcnRLZXkhKTtcblxuICAgICAgaWYgKHZhbEEgPCB2YWxCKSByZXR1cm4gYXBwU3RhdGUuc29ydERpcmVjdGlvbiA9PT0gJ2FzYycgPyAtMSA6IDE7XG4gICAgICBpZiAodmFsQSA+IHZhbEIpIHJldHVybiBhcHBTdGF0ZS5zb3J0RGlyZWN0aW9uID09PSAnYXNjJyA/IDEgOiAtMTtcbiAgICAgIHJldHVybiAwO1xuICAgIH0pO1xuICB9XG5cbiAgdGJvZHkuaW5uZXJIVE1MID0gJyc7IC8vIENsZWFyIGV4aXN0aW5nIHJvd3NcblxuICAvLyAzLiBSZW5kZXJcbiAgY29uc3QgdmlzaWJsZUNvbHMgPSBhcHBTdGF0ZS5jb2x1bW5zLmZpbHRlcihjID0+IGMudmlzaWJsZSk7XG5cbiAgdGFic0Rpc3BsYXkuZm9yRWFjaCh0YWIgPT4ge1xuICAgIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3RyJyk7XG5cbiAgICB2aXNpYmxlQ29scy5mb3JFYWNoKGNvbCA9PiB7XG4gICAgICAgIGNvbnN0IHRkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndGQnKTtcbiAgICAgICAgaWYgKGNvbC5rZXkgPT09ICd0aXRsZScpIHRkLmNsYXNzTGlzdC5hZGQoJ3RpdGxlLWNlbGwnKTtcbiAgICAgICAgaWYgKGNvbC5rZXkgPT09ICd1cmwnKSB0ZC5jbGFzc0xpc3QuYWRkKCd1cmwtY2VsbCcpO1xuXG4gICAgICAgIGNvbnN0IHZhbCA9IGdldENlbGxWYWx1ZSh0YWIsIGNvbC5rZXkpO1xuXG4gICAgICAgIGlmICh2YWwgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkge1xuICAgICAgICAgICAgdGQuYXBwZW5kQ2hpbGQodmFsKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRkLmlubmVySFRNTCA9IHZhbDtcbiAgICAgICAgICAgIHRkLnRpdGxlID0gc3RyaXBIdG1sKFN0cmluZyh2YWwpKTtcbiAgICAgICAgfVxuICAgICAgICByb3cuYXBwZW5kQ2hpbGQodGQpO1xuICAgIH0pO1xuXG4gICAgdGJvZHkuYXBwZW5kQ2hpbGQocm93KTtcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJDb2x1bW5zTWVudSgpIHtcbiAgICBjb25zdCBtZW51ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NvbHVtbnNNZW51Jyk7XG4gICAgaWYgKCFtZW51KSByZXR1cm47XG5cbiAgICBtZW51LmlubmVySFRNTCA9IGFwcFN0YXRlLmNvbHVtbnMubWFwKGNvbCA9PiBgXG4gICAgICAgIDxsYWJlbCBjbGFzcz1cImNvbHVtbi10b2dnbGVcIj5cbiAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBkYXRhLWtleT1cIiR7Y29sLmtleX1cIiAke2NvbC52aXNpYmxlID8gJ2NoZWNrZWQnIDogJyd9PlxuICAgICAgICAgICAgJHtlc2NhcGVIdG1sKGNvbC5sYWJlbCl9XG4gICAgICAgIDwvbGFiZWw+XG4gICAgYCkuam9pbignJyk7XG5cbiAgICBtZW51LnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0JykuZm9yRWFjaChpbnB1dCA9PiB7XG4gICAgICAgIGlucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIChlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBrZXkgPSAoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkuZGF0YXNldC5rZXk7XG4gICAgICAgICAgICBjb25zdCBjaGVja2VkID0gKGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLmNoZWNrZWQ7XG4gICAgICAgICAgICBjb25zdCBjb2wgPSBhcHBTdGF0ZS5jb2x1bW5zLmZpbmQoYyA9PiBjLmtleSA9PT0ga2V5KTtcbiAgICAgICAgICAgIGlmIChjb2wpIHtcbiAgICAgICAgICAgICAgICBjb2wudmlzaWJsZSA9IGNoZWNrZWQ7XG4gICAgICAgICAgICAgICAgcmVuZGVyVGFibGVIZWFkZXIoKTsgLy8gUmUtcmVuZGVyIGhlYWRlciB0byBhZGQvcmVtb3ZlIGNvbHVtbnNcbiAgICAgICAgICAgICAgICByZW5kZXJUYWJsZSgpOyAvLyBSZS1yZW5kZXIgYm9keVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlclRhYmxlSGVhZGVyKCkge1xuICAgIGNvbnN0IGhlYWRlclJvdyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdoZWFkZXJSb3cnKTtcbiAgICBjb25zdCBmaWx0ZXJSb3cgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZmlsdGVyUm93Jyk7XG4gICAgaWYgKCFoZWFkZXJSb3cgfHwgIWZpbHRlclJvdykgcmV0dXJuO1xuXG4gICAgY29uc3QgdmlzaWJsZUNvbHMgPSBhcHBTdGF0ZS5jb2x1bW5zLmZpbHRlcihjID0+IGMudmlzaWJsZSk7XG5cbiAgICAvLyBSZW5kZXIgSGVhZGVyc1xuICAgIGhlYWRlclJvdy5pbm5lckhUTUwgPSB2aXNpYmxlQ29scy5tYXAoY29sID0+IGBcbiAgICAgICAgPHRoIGNsYXNzPVwiJHtjb2wua2V5ICE9PSAnYWN0aW9ucycgPyAnc29ydGFibGUnIDogJyd9XCIgZGF0YS1rZXk9XCIke2NvbC5rZXl9XCIgc3R5bGU9XCJ3aWR0aDogJHtjb2wud2lkdGh9OyBwb3NpdGlvbjogcmVsYXRpdmU7XCI+XG4gICAgICAgICAgICAke2VzY2FwZUh0bWwoY29sLmxhYmVsKX1cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJyZXNpemVyXCI+PC9kaXY+XG4gICAgICAgIDwvdGg+XG4gICAgYCkuam9pbignJyk7XG5cbiAgICAvLyBSZW5kZXIgRmlsdGVyIElucHV0c1xuICAgIGZpbHRlclJvdy5pbm5lckhUTUwgPSB2aXNpYmxlQ29scy5tYXAoY29sID0+IHtcbiAgICAgICAgaWYgKCFjb2wuZmlsdGVyYWJsZSkgcmV0dXJuICc8dGg+PC90aD4nO1xuICAgICAgICBjb25zdCB2YWwgPSBhcHBTdGF0ZS5jb2x1bW5GaWx0ZXJzW2NvbC5rZXldIHx8ICcnO1xuICAgICAgICByZXR1cm4gYFxuICAgICAgICAgICAgPHRoPlxuICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwidGV4dFwiIGNsYXNzPVwiZmlsdGVyLWlucHV0XCIgZGF0YS1rZXk9XCIke2NvbC5rZXl9XCIgdmFsdWU9XCIke2VzY2FwZUh0bWwodmFsKX1cIiBwbGFjZWhvbGRlcj1cIkZpbHRlci4uLlwiPlxuICAgICAgICAgICAgPC90aD5cbiAgICAgICAgYDtcbiAgICB9KS5qb2luKCcnKTtcblxuICAgIC8vIEF0dGFjaCBTb3J0IExpc3RlbmVyc1xuICAgIGhlYWRlclJvdy5xdWVyeVNlbGVjdG9yQWxsKCcuc29ydGFibGUnKS5mb3JFYWNoKHRoID0+IHtcbiAgICAgICAgdGguYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgICAgICAgICAgLy8gSWdub3JlIGlmIGNsaWNrZWQgb24gcmVzaXplclxuICAgICAgICAgICAgaWYgKChlLnRhcmdldCBhcyBIVE1MRWxlbWVudCkuY2xhc3NMaXN0LmNvbnRhaW5zKCdyZXNpemVyJykpIHJldHVybjtcblxuICAgICAgICAgICAgY29uc3Qga2V5ID0gdGguZ2V0QXR0cmlidXRlKCdkYXRhLWtleScpO1xuICAgICAgICAgICAgaWYgKGtleSkgaGFuZGxlU29ydChrZXkpO1xuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgIC8vIEF0dGFjaCBGaWx0ZXIgTGlzdGVuZXJzXG4gICAgZmlsdGVyUm93LnF1ZXJ5U2VsZWN0b3JBbGwoJy5maWx0ZXItaW5wdXQnKS5mb3JFYWNoKGlucHV0ID0+IHtcbiAgICAgICAgaW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCAoZSkgPT4ge1xuICAgICAgICAgICAgY29uc3Qga2V5ID0gKGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5kYXRhc2V0LmtleTtcbiAgICAgICAgICAgIGNvbnN0IHZhbCA9IChlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgIGlmIChrZXkpIHtcbiAgICAgICAgICAgICAgICBhcHBTdGF0ZS5jb2x1bW5GaWx0ZXJzW2tleV0gPSB2YWw7XG4gICAgICAgICAgICAgICAgcmVuZGVyVGFibGUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICAvLyBBdHRhY2ggUmVzaXplIExpc3RlbmVyc1xuICAgIGhlYWRlclJvdy5xdWVyeVNlbGVjdG9yQWxsKCcucmVzaXplcicpLmZvckVhY2gocmVzaXplciA9PiB7XG4gICAgICAgIGluaXRSZXNpemUocmVzaXplciBhcyBIVE1MRWxlbWVudCk7XG4gICAgfSk7XG5cbiAgICB1cGRhdGVIZWFkZXJTdHlsZXMoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhbmRsZVNvcnQoa2V5OiBzdHJpbmcpIHtcbiAgaWYgKGFwcFN0YXRlLnNvcnRLZXkgPT09IGtleSkge1xuICAgIGFwcFN0YXRlLnNvcnREaXJlY3Rpb24gPSBhcHBTdGF0ZS5zb3J0RGlyZWN0aW9uID09PSAnYXNjJyA/ICdkZXNjJyA6ICdhc2MnO1xuICB9IGVsc2Uge1xuICAgIGFwcFN0YXRlLnNvcnRLZXkgPSBrZXk7XG4gICAgYXBwU3RhdGUuc29ydERpcmVjdGlvbiA9ICdhc2MnO1xuICB9XG4gIHVwZGF0ZUhlYWRlclN0eWxlcygpO1xuICByZW5kZXJUYWJsZSgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlSGVhZGVyU3R5bGVzKCkge1xuICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCd0aC5zb3J0YWJsZScpLmZvckVhY2godGggPT4ge1xuICAgIHRoLmNsYXNzTGlzdC5yZW1vdmUoJ3NvcnQtYXNjJywgJ3NvcnQtZGVzYycpO1xuICAgIGlmICh0aC5nZXRBdHRyaWJ1dGUoJ2RhdGEta2V5JykgPT09IGFwcFN0YXRlLnNvcnRLZXkpIHtcbiAgICAgIHRoLmNsYXNzTGlzdC5hZGQoYXBwU3RhdGUuc29ydERpcmVjdGlvbiA9PT0gJ2FzYycgPyAnc29ydC1hc2MnIDogJ3NvcnQtZGVzYycpO1xuICAgIH1cbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbml0UmVzaXplKHJlc2l6ZXI6IEhUTUxFbGVtZW50KSB7XG4gICAgbGV0IHggPSAwO1xuICAgIGxldCB3ID0gMDtcbiAgICBsZXQgdGg6IEhUTUxFbGVtZW50O1xuXG4gICAgY29uc3QgbW91c2VEb3duSGFuZGxlciA9IChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICAgIHRoID0gcmVzaXplci5wYXJlbnRFbGVtZW50IGFzIEhUTUxFbGVtZW50O1xuICAgICAgICB4ID0gZS5jbGllbnRYO1xuICAgICAgICB3ID0gdGgub2Zmc2V0V2lkdGg7XG5cbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgbW91c2VNb3ZlSGFuZGxlcik7XG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCBtb3VzZVVwSGFuZGxlcik7XG4gICAgICAgIHJlc2l6ZXIuY2xhc3NMaXN0LmFkZCgncmVzaXppbmcnKTtcbiAgICB9O1xuXG4gICAgY29uc3QgbW91c2VNb3ZlSGFuZGxlciA9IChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICAgIGNvbnN0IGR4ID0gZS5jbGllbnRYIC0geDtcbiAgICAgICAgY29uc3QgY29sS2V5ID0gdGguZ2V0QXR0cmlidXRlKCdkYXRhLWtleScpO1xuICAgICAgICBjb25zdCBjb2wgPSBhcHBTdGF0ZS5jb2x1bW5zLmZpbmQoYyA9PiBjLmtleSA9PT0gY29sS2V5KTtcbiAgICAgICAgaWYgKGNvbCkge1xuICAgICAgICAgICAgY29uc3QgbmV3V2lkdGggPSBNYXRoLm1heCgzMCwgdyArIGR4KTsgLy8gTWluIHdpZHRoIDMwcHhcbiAgICAgICAgICAgIGNvbC53aWR0aCA9IGAke25ld1dpZHRofXB4YDtcbiAgICAgICAgICAgIHRoLnN0eWxlLndpZHRoID0gY29sLndpZHRoO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIGNvbnN0IG1vdXNlVXBIYW5kbGVyID0gKCkgPT4ge1xuICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCBtb3VzZU1vdmVIYW5kbGVyKTtcbiAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsIG1vdXNlVXBIYW5kbGVyKTtcbiAgICAgICAgcmVzaXplci5jbGFzc0xpc3QucmVtb3ZlKCdyZXNpemluZycpO1xuICAgIH07XG5cbiAgICByZXNpemVyLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIG1vdXNlRG93bkhhbmRsZXIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5pdFRhYnNUYWJsZSgpIHtcbiAgICAvLyBMaXN0ZW5lcnMgZm9yIFVJIGNvbnRyb2xzXG4gICAgY29uc3QgcmVmcmVzaEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZWZyZXNoQnRuJyk7XG4gICAgaWYgKHJlZnJlc2hCdG4pIHtcbiAgICAgICAgcmVmcmVzaEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGxvYWRUYWJzKTtcbiAgICB9XG5cbiAgICBjb25zdCBnbG9iYWxTZWFyY2hJbnB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnbG9iYWxTZWFyY2gnKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgIGlmIChnbG9iYWxTZWFyY2hJbnB1dCkge1xuICAgICAgICBnbG9iYWxTZWFyY2hJbnB1dC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIChlKSA9PiB7XG4gICAgICAgICAgICBhcHBTdGF0ZS5nbG9iYWxTZWFyY2hRdWVyeSA9IChlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgIHJlbmRlclRhYmxlKCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IGNvbHVtbnNCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY29sdW1uc0J0bicpO1xuICAgIGlmIChjb2x1bW5zQnRuKSB7XG4gICAgICAgIGNvbHVtbnNCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBtZW51ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NvbHVtbnNNZW51Jyk7XG4gICAgICAgICAgICBtZW51Py5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nKTtcbiAgICAgICAgICAgIHJlbmRlckNvbHVtbnNNZW51KCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IHJlc2V0Vmlld0J0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZXNldFZpZXdCdG4nKTtcbiAgICBpZiAocmVzZXRWaWV3QnRuKSB7XG4gICAgICAgIHJlc2V0Vmlld0J0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgICAgIC8vIFJlc2V0IGNvbHVtbnMgdG8gZGVmYXVsdHNcbiAgICAgICAgICAgIGFwcFN0YXRlLmNvbHVtbnMuZm9yRWFjaChjID0+IGMudmlzaWJsZSA9IFsnaWQnLCAndGl0bGUnLCAndXJsJywgJ3dpbmRvd0lkJywgJ2dyb3VwSWQnLCAnZ2VucmUnLCAnY29udGV4dCcsICdzaXRlTmFtZScsICdwbGF0Zm9ybScsICdvYmplY3RUeXBlJywgJ2F1dGhvck9yQ3JlYXRvcicsICdhY3Rpb25zJ10uaW5jbHVkZXMoYy5rZXkpKTtcbiAgICAgICAgICAgIGFwcFN0YXRlLmdsb2JhbFNlYXJjaFF1ZXJ5ID0gJyc7XG4gICAgICAgICAgICBpZiAoZ2xvYmFsU2VhcmNoSW5wdXQpIGdsb2JhbFNlYXJjaElucHV0LnZhbHVlID0gJyc7XG4gICAgICAgICAgICBhcHBTdGF0ZS5jb2x1bW5GaWx0ZXJzID0ge307XG4gICAgICAgICAgICByZW5kZXJUYWJsZUhlYWRlcigpO1xuICAgICAgICAgICAgcmVuZGVyVGFibGUoKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gSGlkZSBjb2x1bW4gbWVudSB3aGVuIGNsaWNraW5nIG91dHNpZGVcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICAgICAgICBpZiAoIXRhcmdldC5jbG9zZXN0KCcuY29sdW1ucy1tZW51LWNvbnRhaW5lcicpKSB7XG4gICAgICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY29sdW1uc01lbnUnKT8uY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIExpc3RlbiBmb3IgdGFiIHVwZGF0ZXMgdG8gcmVmcmVzaCBkYXRhIChTUEEgc3VwcG9ydClcbiAgICAvLyBXZSBjYW4gcHV0IHRoZXNlIGxpc3RlbmVycyBoZXJlIG9yIGluIHRoZSBtYWluIGVudHJ5IHBvaW50LlxuICAgIC8vIFB1dHRpbmcgdGhlbSBoZXJlIGlzb2xhdGVzIHRhYiB0YWJsZSBsb2dpYy5cbiAgICBjaHJvbWUudGFicy5vblVwZGF0ZWQuYWRkTGlzdGVuZXIoKHRhYklkLCBjaGFuZ2VJbmZvLCB0YWIpID0+IHtcbiAgICAgICAgaWYgKGNoYW5nZUluZm8udXJsIHx8IGNoYW5nZUluZm8uc3RhdHVzID09PSAnY29tcGxldGUnKSB7XG4gICAgICAgICAgICBsb2FkVGFicygpO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBjaHJvbWUudGFicy5vblJlbW92ZWQuYWRkTGlzdGVuZXIoKCkgPT4ge1xuICAgICAgICBsb2FkVGFicygpO1xuICAgIH0pO1xuXG4gICAgcmVuZGVyVGFibGVIZWFkZXIoKTtcbn1cbiIsICJpbXBvcnQgeyBDdXN0b21TdHJhdGVneSwgU29ydGluZ1N0cmF0ZWd5IH0gZnJvbSBcIi4vdHlwZXMuanNcIjtcblxuZXhwb3J0IGludGVyZmFjZSBTdHJhdGVneURlZmluaXRpb24ge1xuICAgIGlkOiBTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmc7XG4gICAgbGFiZWw6IHN0cmluZztcbiAgICBpc0dyb3VwaW5nOiBib29sZWFuO1xuICAgIGlzU29ydGluZzogYm9vbGVhbjtcbiAgICB0YWdzPzogc3RyaW5nW107XG4gICAgYXV0b1J1bj86IGJvb2xlYW47XG4gICAgaXNDdXN0b20/OiBib29sZWFuO1xufVxuXG4vLyBSZXN0b3JlZCBzdHJhdGVnaWVzIG1hdGNoaW5nIGJhY2tncm91bmQgY2FwYWJpbGl0aWVzLlxuZXhwb3J0IGNvbnN0IFNUUkFURUdJRVM6IFN0cmF0ZWd5RGVmaW5pdGlvbltdID0gW1xuICAgIHsgaWQ6IFwiZG9tYWluXCIsIGxhYmVsOiBcIkRvbWFpblwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwiZG9tYWluX2Z1bGxcIiwgbGFiZWw6IFwiRnVsbCBEb21haW5cIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInRvcGljXCIsIGxhYmVsOiBcIlRvcGljXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJjb250ZXh0XCIsIGxhYmVsOiBcIkNvbnRleHRcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImxpbmVhZ2VcIiwgbGFiZWw6IFwiTGluZWFnZVwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwicGlubmVkXCIsIGxhYmVsOiBcIlBpbm5lZFwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwicmVjZW5jeVwiLCBsYWJlbDogXCJSZWNlbmN5XCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJhZ2VcIiwgbGFiZWw6IFwiQWdlXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJ1cmxcIiwgbGFiZWw6IFwiVVJMXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJuZXN0aW5nXCIsIGxhYmVsOiBcIk5lc3RpbmdcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInRpdGxlXCIsIGxhYmVsOiBcIlRpdGxlXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG5dO1xuXG5leHBvcnQgY29uc3QgZ2V0U3RyYXRlZ2llcyA9IChjdXN0b21TdHJhdGVnaWVzPzogQ3VzdG9tU3RyYXRlZ3lbXSk6IFN0cmF0ZWd5RGVmaW5pdGlvbltdID0+IHtcbiAgICBpZiAoIWN1c3RvbVN0cmF0ZWdpZXMgfHwgY3VzdG9tU3RyYXRlZ2llcy5sZW5ndGggPT09IDApIHJldHVybiBTVFJBVEVHSUVTO1xuXG4gICAgLy8gQ3VzdG9tIHN0cmF0ZWdpZXMgY2FuIG92ZXJyaWRlIGJ1aWx0LWlucyBpZiBJRHMgbWF0Y2gsIG9yIGFkZCBuZXcgb25lcy5cbiAgICBjb25zdCBjb21iaW5lZCA9IFsuLi5TVFJBVEVHSUVTXTtcblxuICAgIGN1c3RvbVN0cmF0ZWdpZXMuZm9yRWFjaChjdXN0b20gPT4ge1xuICAgICAgICBjb25zdCBleGlzdGluZ0luZGV4ID0gY29tYmluZWQuZmluZEluZGV4KHMgPT4gcy5pZCA9PT0gY3VzdG9tLmlkKTtcblxuICAgICAgICAvLyBEZXRlcm1pbmUgY2FwYWJpbGl0aWVzIGJhc2VkIG9uIHJ1bGVzIHByZXNlbmNlXG4gICAgICAgIGNvbnN0IGhhc0dyb3VwaW5nID0gKGN1c3RvbS5ncm91cGluZ1J1bGVzICYmIGN1c3RvbS5ncm91cGluZ1J1bGVzLmxlbmd0aCA+IDApIHx8IChjdXN0b20ucnVsZXMgJiYgY3VzdG9tLnJ1bGVzLmxlbmd0aCA+IDApIHx8IGZhbHNlO1xuICAgICAgICBjb25zdCBoYXNTb3J0aW5nID0gKGN1c3RvbS5zb3J0aW5nUnVsZXMgJiYgY3VzdG9tLnNvcnRpbmdSdWxlcy5sZW5ndGggPiAwKSB8fCAoY3VzdG9tLnJ1bGVzICYmIGN1c3RvbS5ydWxlcy5sZW5ndGggPiAwKSB8fCBmYWxzZTtcblxuICAgICAgICBjb25zdCB0YWdzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBpZiAoaGFzR3JvdXBpbmcpIHRhZ3MucHVzaChcImdyb3VwXCIpO1xuICAgICAgICBpZiAoaGFzU29ydGluZykgdGFncy5wdXNoKFwic29ydFwiKTtcblxuICAgICAgICBjb25zdCBkZWZpbml0aW9uOiBTdHJhdGVneURlZmluaXRpb24gPSB7XG4gICAgICAgICAgICBpZDogY3VzdG9tLmlkLFxuICAgICAgICAgICAgbGFiZWw6IGN1c3RvbS5sYWJlbCxcbiAgICAgICAgICAgIGlzR3JvdXBpbmc6IGhhc0dyb3VwaW5nLFxuICAgICAgICAgICAgaXNTb3J0aW5nOiBoYXNTb3J0aW5nLFxuICAgICAgICAgICAgdGFnczogdGFncyxcbiAgICAgICAgICAgIGF1dG9SdW46IGN1c3RvbS5hdXRvUnVuLFxuICAgICAgICAgICAgaXNDdXN0b206IHRydWVcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAoZXhpc3RpbmdJbmRleCAhPT0gLTEpIHtcbiAgICAgICAgICAgIGNvbWJpbmVkW2V4aXN0aW5nSW5kZXhdID0gZGVmaW5pdGlvbjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbWJpbmVkLnB1c2goZGVmaW5pdGlvbik7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBjb21iaW5lZDtcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRTdHJhdGVneSA9IChpZDogU29ydGluZ1N0cmF0ZWd5IHwgc3RyaW5nKTogU3RyYXRlZ3lEZWZpbml0aW9uIHwgdW5kZWZpbmVkID0+IFNUUkFURUdJRVMuZmluZChzID0+IHMuaWQgPT09IGlkKTtcbiIsICJjb25zdCBob3N0bmFtZUNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcbmNvbnN0IE1BWF9DQUNIRV9TSVpFID0gMTAwMDtcblxuZXhwb3J0IGNvbnN0IGdldEhvc3RuYW1lID0gKHVybDogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gIGlmIChob3N0bmFtZUNhY2hlLmhhcyh1cmwpKSByZXR1cm4gaG9zdG5hbWVDYWNoZS5nZXQodXJsKSE7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBwYXJzZWQgPSBuZXcgVVJMKHVybCk7XG4gICAgY29uc3QgaG9zdG5hbWUgPSBwYXJzZWQuaG9zdG5hbWU7XG5cbiAgICBpZiAoaG9zdG5hbWVDYWNoZS5zaXplID49IE1BWF9DQUNIRV9TSVpFKSBob3N0bmFtZUNhY2hlLmNsZWFyKCk7XG4gICAgaG9zdG5hbWVDYWNoZS5zZXQodXJsLCBob3N0bmFtZSk7XG4gICAgcmV0dXJuIGhvc3RuYW1lO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufTtcbiIsICJpbXBvcnQgeyBHcm91cGluZ1N0cmF0ZWd5LCBTb3J0aW5nU3RyYXRlZ3ksIFRhYkdyb3VwLCBUYWJNZXRhZGF0YSwgQ3VzdG9tU3RyYXRlZ3ksIFN0cmF0ZWd5UnVsZSwgUnVsZUNvbmRpdGlvbiwgR3JvdXBpbmdSdWxlLCBTb3J0aW5nUnVsZSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGdldFN0cmF0ZWdpZXMgfSBmcm9tIFwiLi4vc2hhcmVkL3N0cmF0ZWd5UmVnaXN0cnkuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tIFwiLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5pbXBvcnQgeyBnZXRIb3N0bmFtZSB9IGZyb20gXCIuLi9zaGFyZWQvdXJsQ2FjaGUuanNcIjtcblxubGV0IGN1c3RvbVN0cmF0ZWdpZXM6IEN1c3RvbVN0cmF0ZWd5W10gPSBbXTtcblxuZXhwb3J0IGNvbnN0IHNldEN1c3RvbVN0cmF0ZWdpZXMgPSAoc3RyYXRlZ2llczogQ3VzdG9tU3RyYXRlZ3lbXSkgPT4ge1xuICAgIGN1c3RvbVN0cmF0ZWdpZXMgPSBzdHJhdGVnaWVzO1xufTtcblxuZXhwb3J0IGNvbnN0IGdldEN1c3RvbVN0cmF0ZWdpZXMgPSAoKTogQ3VzdG9tU3RyYXRlZ3lbXSA9PiBjdXN0b21TdHJhdGVnaWVzO1xuXG5jb25zdCBDT0xPUlMgPSBbXCJncmV5XCIsIFwiYmx1ZVwiLCBcInJlZFwiLCBcInllbGxvd1wiLCBcImdyZWVuXCIsIFwicGlua1wiLCBcInB1cnBsZVwiLCBcImN5YW5cIiwgXCJvcmFuZ2VcIl07XG5cbmNvbnN0IHJlZ2V4Q2FjaGUgPSBuZXcgTWFwPHN0cmluZywgUmVnRXhwPigpO1xuXG5leHBvcnQgY29uc3QgZG9tYWluRnJvbVVybCA9ICh1cmw6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGhvc3RuYW1lID0gZ2V0SG9zdG5hbWUodXJsKTtcbiAgaWYgKCFob3N0bmFtZSkgcmV0dXJuIFwidW5rbm93blwiO1xuICByZXR1cm4gaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sIFwiXCIpO1xufTtcblxuZXhwb3J0IGNvbnN0IHN1YmRvbWFpbkZyb21VcmwgPSAodXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBob3N0bmFtZSA9IGdldEhvc3RuYW1lKHVybCk7XG4gIGlmICghaG9zdG5hbWUpIHJldHVybiBcIlwiO1xuXG4gIGNvbnN0IGhvc3QgPSBob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgXCJcIik7XG4gIGNvbnN0IHBhcnRzID0gaG9zdC5zcGxpdCgnLicpO1xuICBpZiAocGFydHMubGVuZ3RoID4gMikge1xuICAgICAgcmV0dXJuIHBhcnRzLnNsaWNlKDAsIHBhcnRzLmxlbmd0aCAtIDIpLmpvaW4oJy4nKTtcbiAgfVxuICByZXR1cm4gXCJcIjtcbn1cblxuY29uc3QgZ2V0TmVzdGVkUHJvcGVydHkgPSAob2JqOiB1bmtub3duLCBwYXRoOiBzdHJpbmcpOiB1bmtub3duID0+IHtcbiAgICBpZiAoIW9iaiB8fCB0eXBlb2Ygb2JqICE9PSAnb2JqZWN0JykgcmV0dXJuIHVuZGVmaW5lZDtcblxuICAgIGlmICghcGF0aC5pbmNsdWRlcygnLicpKSB7XG4gICAgICAgIHJldHVybiAob2JqIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtwYXRoXTtcbiAgICB9XG5cbiAgICBjb25zdCBwYXJ0cyA9IHBhdGguc3BsaXQoJy4nKTtcbiAgICBsZXQgY3VycmVudDogdW5rbm93biA9IG9iajtcblxuICAgIGZvciAoY29uc3Qga2V5IG9mIHBhcnRzKSB7XG4gICAgICAgIGlmICghY3VycmVudCB8fCB0eXBlb2YgY3VycmVudCAhPT0gJ29iamVjdCcpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIGN1cnJlbnQgPSAoY3VycmVudCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilba2V5XTtcbiAgICB9XG5cbiAgICByZXR1cm4gY3VycmVudDtcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRGaWVsZFZhbHVlID0gKHRhYjogVGFiTWV0YWRhdGEsIGZpZWxkOiBzdHJpbmcpOiBhbnkgPT4ge1xuICAgIHN3aXRjaChmaWVsZCkge1xuICAgICAgICBjYXNlICdpZCc6IHJldHVybiB0YWIuaWQ7XG4gICAgICAgIGNhc2UgJ2luZGV4JzogcmV0dXJuIHRhYi5pbmRleDtcbiAgICAgICAgY2FzZSAnd2luZG93SWQnOiByZXR1cm4gdGFiLndpbmRvd0lkO1xuICAgICAgICBjYXNlICdncm91cElkJzogcmV0dXJuIHRhYi5ncm91cElkO1xuICAgICAgICBjYXNlICd0aXRsZSc6IHJldHVybiB0YWIudGl0bGU7XG4gICAgICAgIGNhc2UgJ3VybCc6IHJldHVybiB0YWIudXJsO1xuICAgICAgICBjYXNlICdzdGF0dXMnOiByZXR1cm4gdGFiLnN0YXR1cztcbiAgICAgICAgY2FzZSAnYWN0aXZlJzogcmV0dXJuIHRhYi5hY3RpdmU7XG4gICAgICAgIGNhc2UgJ3NlbGVjdGVkJzogcmV0dXJuIHRhYi5zZWxlY3RlZDtcbiAgICAgICAgY2FzZSAncGlubmVkJzogcmV0dXJuIHRhYi5waW5uZWQ7XG4gICAgICAgIGNhc2UgJ29wZW5lclRhYklkJzogcmV0dXJuIHRhYi5vcGVuZXJUYWJJZDtcbiAgICAgICAgY2FzZSAnbGFzdEFjY2Vzc2VkJzogcmV0dXJuIHRhYi5sYXN0QWNjZXNzZWQ7XG4gICAgICAgIGNhc2UgJ2NvbnRleHQnOiByZXR1cm4gdGFiLmNvbnRleHQ7XG4gICAgICAgIGNhc2UgJ2dlbnJlJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uZ2VucmU7XG4gICAgICAgIGNhc2UgJ3NpdGVOYW1lJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uc2l0ZU5hbWU7XG4gICAgICAgIC8vIERlcml2ZWQgb3IgbWFwcGVkIGZpZWxkc1xuICAgICAgICBjYXNlICdkb21haW4nOiByZXR1cm4gZG9tYWluRnJvbVVybCh0YWIudXJsKTtcbiAgICAgICAgY2FzZSAnc3ViZG9tYWluJzogcmV0dXJuIHN1YmRvbWFpbkZyb21VcmwodGFiLnVybCk7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICByZXR1cm4gZ2V0TmVzdGVkUHJvcGVydHkodGFiLCBmaWVsZCk7XG4gICAgfVxufTtcblxuY29uc3Qgc3RyaXBUbGQgPSAoZG9tYWluOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gZG9tYWluLnJlcGxhY2UoL1xcLihjb218b3JnfGdvdnxuZXR8ZWR1fGlvKSQvaSwgXCJcIik7XG59O1xuXG5leHBvcnQgY29uc3Qgc2VtYW50aWNCdWNrZXQgPSAodGl0bGU6IHN0cmluZywgdXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBrZXkgPSBgJHt0aXRsZX0gJHt1cmx9YC50b0xvd2VyQ2FzZSgpO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiZG9jXCIpIHx8IGtleS5pbmNsdWRlcyhcInJlYWRtZVwiKSB8fCBrZXkuaW5jbHVkZXMoXCJndWlkZVwiKSkgcmV0dXJuIFwiRG9jc1wiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwibWFpbFwiKSB8fCBrZXkuaW5jbHVkZXMoXCJpbmJveFwiKSkgcmV0dXJuIFwiQ2hhdFwiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiZGFzaGJvYXJkXCIpIHx8IGtleS5pbmNsdWRlcyhcImNvbnNvbGVcIikpIHJldHVybiBcIkRhc2hcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImlzc3VlXCIpIHx8IGtleS5pbmNsdWRlcyhcInRpY2tldFwiKSkgcmV0dXJuIFwiVGFza3NcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImRyaXZlXCIpIHx8IGtleS5pbmNsdWRlcyhcInN0b3JhZ2VcIikpIHJldHVybiBcIkZpbGVzXCI7XG4gIHJldHVybiBcIk1pc2NcIjtcbn07XG5cbmV4cG9ydCBjb25zdCBuYXZpZ2F0aW9uS2V5ID0gKHRhYjogVGFiTWV0YWRhdGEpOiBzdHJpbmcgPT4ge1xuICBpZiAodGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gYGNoaWxkLW9mLSR7dGFiLm9wZW5lclRhYklkfWA7XG4gIH1cbiAgcmV0dXJuIGB3aW5kb3ctJHt0YWIud2luZG93SWR9YDtcbn07XG5cbmNvbnN0IGdldFJlY2VuY3lMYWJlbCA9IChsYXN0QWNjZXNzZWQ6IG51bWJlcik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gIGNvbnN0IGRpZmYgPSBub3cgLSBsYXN0QWNjZXNzZWQ7XG4gIGlmIChkaWZmIDwgMzYwMDAwMCkgcmV0dXJuIFwiSnVzdCBub3dcIjsgLy8gMWhcbiAgaWYgKGRpZmYgPCA4NjQwMDAwMCkgcmV0dXJuIFwiVG9kYXlcIjsgLy8gMjRoXG4gIGlmIChkaWZmIDwgMTcyODAwMDAwKSByZXR1cm4gXCJZZXN0ZXJkYXlcIjsgLy8gNDhoXG4gIGlmIChkaWZmIDwgNjA0ODAwMDAwKSByZXR1cm4gXCJUaGlzIFdlZWtcIjsgLy8gN2RcbiAgcmV0dXJuIFwiT2xkZXJcIjtcbn07XG5cbmNvbnN0IGNvbG9yRm9yS2V5ID0gKGtleTogc3RyaW5nLCBvZmZzZXQ6IG51bWJlcik6IHN0cmluZyA9PiBDT0xPUlNbTWF0aC5hYnMoaGFzaENvZGUoa2V5KSArIG9mZnNldCkgJSBDT0xPUlMubGVuZ3RoXTtcblxuY29uc3QgaGFzaENvZGUgPSAodmFsdWU6IHN0cmluZyk6IG51bWJlciA9PiB7XG4gIGxldCBoYXNoID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB2YWx1ZS5sZW5ndGg7IGkgKz0gMSkge1xuICAgIGhhc2ggPSAoaGFzaCA8PCA1KSAtIGhhc2ggKyB2YWx1ZS5jaGFyQ29kZUF0KGkpO1xuICAgIGhhc2ggfD0gMDtcbiAgfVxuICByZXR1cm4gaGFzaDtcbn07XG5cbnR5cGUgTGFiZWxHZW5lcmF0b3IgPSAoZmlyc3RUYWI6IFRhYk1ldGFkYXRhLCB0YWJzOiBUYWJNZXRhZGF0YVtdLCBhbGxUYWJzTWFwOiBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YT4pID0+IHN0cmluZyB8IG51bGw7XG5cbmNvbnN0IGJ1aWx0SW5MYWJlbFN0cmF0ZWdpZXM6IFJlY29yZDxzdHJpbmcsIExhYmVsR2VuZXJhdG9yPiA9IHtcbiAgZG9tYWluOiAoZmlyc3RUYWIsIHRhYnMpID0+IHtcbiAgICBjb25zdCBzaXRlTmFtZXMgPSBuZXcgU2V0KHRhYnMubWFwKHQgPT4gdC5jb250ZXh0RGF0YT8uc2l0ZU5hbWUpLmZpbHRlcihCb29sZWFuKSk7XG4gICAgaWYgKHNpdGVOYW1lcy5zaXplID09PSAxKSB7XG4gICAgICByZXR1cm4gc3RyaXBUbGQoQXJyYXkuZnJvbShzaXRlTmFtZXMpWzBdIGFzIHN0cmluZyk7XG4gICAgfVxuICAgIHJldHVybiBzdHJpcFRsZChkb21haW5Gcm9tVXJsKGZpcnN0VGFiLnVybCkpO1xuICB9LFxuICBkb21haW5fZnVsbDogKGZpcnN0VGFiKSA9PiBkb21haW5Gcm9tVXJsKGZpcnN0VGFiLnVybCksXG4gIHRvcGljOiAoZmlyc3RUYWIpID0+IHNlbWFudGljQnVja2V0KGZpcnN0VGFiLnRpdGxlLCBmaXJzdFRhYi51cmwpLFxuICBsaW5lYWdlOiAoZmlyc3RUYWIsIF90YWJzLCBhbGxUYWJzTWFwKSA9PiB7XG4gICAgaWYgKGZpcnN0VGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGNvbnN0IHBhcmVudCA9IGFsbFRhYnNNYXAuZ2V0KGZpcnN0VGFiLm9wZW5lclRhYklkKTtcbiAgICAgIGlmIChwYXJlbnQpIHtcbiAgICAgICAgY29uc3QgcGFyZW50VGl0bGUgPSBwYXJlbnQudGl0bGUubGVuZ3RoID4gMjAgPyBwYXJlbnQudGl0bGUuc3Vic3RyaW5nKDAsIDIwKSArIFwiLi4uXCIgOiBwYXJlbnQudGl0bGU7XG4gICAgICAgIHJldHVybiBgRnJvbTogJHtwYXJlbnRUaXRsZX1gO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGBGcm9tOiBUYWIgJHtmaXJzdFRhYi5vcGVuZXJUYWJJZH1gO1xuICAgIH1cbiAgICByZXR1cm4gYFdpbmRvdyAke2ZpcnN0VGFiLndpbmRvd0lkfWA7XG4gIH0sXG4gIGNvbnRleHQ6IChmaXJzdFRhYikgPT4gZmlyc3RUYWIuY29udGV4dCB8fCBcIlVuY2F0ZWdvcml6ZWRcIixcbiAgcGlubmVkOiAoZmlyc3RUYWIpID0+IGZpcnN0VGFiLnBpbm5lZCA/IFwiUGlubmVkXCIgOiBcIlVucGlubmVkXCIsXG4gIGFnZTogKGZpcnN0VGFiKSA9PiBnZXRSZWNlbmN5TGFiZWwoZmlyc3RUYWIubGFzdEFjY2Vzc2VkID8/IDApLFxuICB1cmw6ICgpID0+IFwiVVJMIEdyb3VwXCIsXG4gIHJlY2VuY3k6ICgpID0+IFwiVGltZSBHcm91cFwiLFxuICBuZXN0aW5nOiAoZmlyc3RUYWIpID0+IGZpcnN0VGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQgPyBcIkNoaWxkcmVuXCIgOiBcIlJvb3RzXCIsXG59O1xuXG4vLyBIZWxwZXIgdG8gZ2V0IGEgaHVtYW4tcmVhZGFibGUgbGFiZWwgY29tcG9uZW50IGZyb20gYSBzdHJhdGVneSBhbmQgYSBzZXQgb2YgdGFic1xuY29uc3QgZ2V0TGFiZWxDb21wb25lbnQgPSAoc3RyYXRlZ3k6IEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcsIHRhYnM6IFRhYk1ldGFkYXRhW10sIGFsbFRhYnNNYXA6IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhPik6IHN0cmluZyB8IG51bGwgPT4ge1xuICBjb25zdCBmaXJzdFRhYiA9IHRhYnNbMF07XG4gIGlmICghZmlyc3RUYWIpIHJldHVybiBcIlVua25vd25cIjtcblxuICAvLyBDaGVjayBjdXN0b20gc3RyYXRlZ2llcyBmaXJzdFxuICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneSk7XG4gIGlmIChjdXN0b20pIHtcbiAgICAgIHJldHVybiBncm91cGluZ0tleShmaXJzdFRhYiwgc3RyYXRlZ3kpO1xuICB9XG5cbiAgY29uc3QgZ2VuZXJhdG9yID0gYnVpbHRJbkxhYmVsU3RyYXRlZ2llc1tzdHJhdGVneV07XG4gIGlmIChnZW5lcmF0b3IpIHtcbiAgICByZXR1cm4gZ2VuZXJhdG9yKGZpcnN0VGFiLCB0YWJzLCBhbGxUYWJzTWFwKTtcbiAgfVxuXG4gIC8vIERlZmF1bHQgZmFsbGJhY2sgZm9yIGdlbmVyaWMgZmllbGRzXG4gIGNvbnN0IHZhbCA9IGdldEZpZWxkVmFsdWUoZmlyc3RUYWIsIHN0cmF0ZWd5KTtcbiAgaWYgKHZhbCAhPT0gdW5kZWZpbmVkICYmIHZhbCAhPT0gbnVsbCkge1xuICAgICAgcmV0dXJuIFN0cmluZyh2YWwpO1xuICB9XG4gIHJldHVybiBcIlVua25vd25cIjtcbn07XG5cbmNvbnN0IGdlbmVyYXRlTGFiZWwgPSAoXG4gIHN0cmF0ZWdpZXM6IChHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nKVtdLFxuICB0YWJzOiBUYWJNZXRhZGF0YVtdLFxuICBhbGxUYWJzTWFwOiBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YT5cbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGxhYmVscyA9IHN0cmF0ZWdpZXNcbiAgICAubWFwKHMgPT4gZ2V0TGFiZWxDb21wb25lbnQocywgdGFicywgYWxsVGFic01hcCkpXG4gICAgLmZpbHRlcihsID0+IGwgJiYgbCAhPT0gXCJVbmtub3duXCIgJiYgbCAhPT0gXCJHcm91cFwiICYmIGwgIT09IFwiVVJMIEdyb3VwXCIgJiYgbCAhPT0gXCJUaW1lIEdyb3VwXCIgJiYgbCAhPT0gXCJNaXNjXCIpO1xuXG4gIGlmIChsYWJlbHMubGVuZ3RoID09PSAwKSByZXR1cm4gXCJHcm91cFwiO1xuICByZXR1cm4gQXJyYXkuZnJvbShuZXcgU2V0KGxhYmVscykpLmpvaW4oXCIgLSBcIik7XG59O1xuXG5jb25zdCBnZXRTdHJhdGVneUNvbG9yUnVsZSA9IChzdHJhdGVneUlkOiBzdHJpbmcpOiBHcm91cGluZ1J1bGUgfCB1bmRlZmluZWQgPT4ge1xuICAgIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5SWQpO1xuICAgIGlmICghY3VzdG9tKSByZXR1cm4gdW5kZWZpbmVkO1xuXG4gICAgY29uc3QgZ3JvdXBpbmdSdWxlc0xpc3QgPSBhc0FycmF5PEdyb3VwaW5nUnVsZT4oY3VzdG9tLmdyb3VwaW5nUnVsZXMpO1xuICAgIC8vIEl0ZXJhdGUgbWFudWFsbHkgdG8gY2hlY2sgY29sb3JcbiAgICBmb3IgKGxldCBpID0gZ3JvdXBpbmdSdWxlc0xpc3QubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgY29uc3QgcnVsZSA9IGdyb3VwaW5nUnVsZXNMaXN0W2ldO1xuICAgICAgICBpZiAocnVsZSAmJiBydWxlLmNvbG9yICYmIHJ1bGUuY29sb3IgIT09ICdyYW5kb20nKSB7XG4gICAgICAgICAgICByZXR1cm4gcnVsZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xufTtcblxuY29uc3QgZ2V0Q29sb3JWYWx1ZUZyb21UYWJzID0gKFxuICB0YWJzOiBUYWJNZXRhZGF0YVtdLFxuICBjb2xvckZpZWxkOiBzdHJpbmcsXG4gIGNvbG9yVHJhbnNmb3JtPzogc3RyaW5nLFxuICBjb2xvclRyYW5zZm9ybVBhdHRlcm4/OiBzdHJpbmdcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGtleXMgPSB0YWJzXG4gICAgLm1hcCgodGFiKSA9PiB7XG4gICAgICBjb25zdCByYXcgPSBnZXRGaWVsZFZhbHVlKHRhYiwgY29sb3JGaWVsZCk7XG4gICAgICBsZXQga2V5ID0gcmF3ICE9PSB1bmRlZmluZWQgJiYgcmF3ICE9PSBudWxsID8gU3RyaW5nKHJhdykgOiBcIlwiO1xuICAgICAgaWYgKGtleSAmJiBjb2xvclRyYW5zZm9ybSkge1xuICAgICAgICBrZXkgPSBhcHBseVZhbHVlVHJhbnNmb3JtKGtleSwgY29sb3JUcmFuc2Zvcm0sIGNvbG9yVHJhbnNmb3JtUGF0dGVybik7XG4gICAgICB9XG4gICAgICByZXR1cm4ga2V5LnRyaW0oKTtcbiAgICB9KVxuICAgIC5maWx0ZXIoQm9vbGVhbik7XG5cbiAgaWYgKGtleXMubGVuZ3RoID09PSAwKSByZXR1cm4gXCJcIjtcblxuICAvLyBNYWtlIGNvbG9yaW5nIHN0YWJsZSBhbmQgaW5kZXBlbmRlbnQgZnJvbSB0YWIgcXVlcnkvb3JkZXIgY2h1cm4uXG4gIHJldHVybiBBcnJheS5mcm9tKG5ldyBTZXQoa2V5cykpLnNvcnQoKS5qb2luKFwifFwiKTtcbn07XG5cbmNvbnN0IHJlc29sdmVXaW5kb3dNb2RlID0gKG1vZGVzOiAoc3RyaW5nIHwgdW5kZWZpbmVkKVtdKTogXCJjdXJyZW50XCIgfCBcIm5ld1wiIHwgXCJjb21wb3VuZFwiID0+IHtcbiAgICBpZiAobW9kZXMuaW5jbHVkZXMoXCJuZXdcIikpIHJldHVybiBcIm5ld1wiO1xuICAgIGlmIChtb2Rlcy5pbmNsdWRlcyhcImNvbXBvdW5kXCIpKSByZXR1cm4gXCJjb21wb3VuZFwiO1xuICAgIHJldHVybiBcImN1cnJlbnRcIjtcbn07XG5cbmV4cG9ydCBjb25zdCBncm91cFRhYnMgPSAoXG4gIHRhYnM6IFRhYk1ldGFkYXRhW10sXG4gIHN0cmF0ZWdpZXM6IChTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmcpW11cbik6IFRhYkdyb3VwW10gPT4ge1xuICBjb25zdCBhdmFpbGFibGVTdHJhdGVnaWVzID0gZ2V0U3RyYXRlZ2llcyhjdXN0b21TdHJhdGVnaWVzKTtcbiAgY29uc3QgZWZmZWN0aXZlU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gYXZhaWxhYmxlU3RyYXRlZ2llcy5maW5kKGF2YWlsID0+IGF2YWlsLmlkID09PSBzKT8uaXNHcm91cGluZyk7XG4gIGNvbnN0IGJ1Y2tldHMgPSBuZXcgTWFwPHN0cmluZywgVGFiR3JvdXA+KCk7XG4gIGNvbnN0IGJ1Y2tldE1ldGEgPSBuZXcgTWFwPHN0cmluZywgeyB2YWx1ZUtleTogc3RyaW5nOyBhcHBsaWVkU3RyYXRlZ2llczogc3RyaW5nW10gfT4oKTtcblxuICBjb25zdCBhbGxUYWJzTWFwID0gbmV3IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhPigpO1xuICB0YWJzLmZvckVhY2godCA9PiBhbGxUYWJzTWFwLnNldCh0LmlkLCB0KSk7XG5cbiAgdGFicy5mb3JFYWNoKCh0YWIpID0+IHtcbiAgICBsZXQga2V5czogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBhcHBsaWVkU3RyYXRlZ2llczogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBjb2xsZWN0ZWRNb2Rlczogc3RyaW5nW10gPSBbXTtcblxuICAgIHRyeSB7XG4gICAgICAgIGZvciAoY29uc3QgcyBvZiBlZmZlY3RpdmVTdHJhdGVnaWVzKSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBnZXRHcm91cGluZ1Jlc3VsdCh0YWIsIHMpO1xuICAgICAgICAgICAgaWYgKHJlc3VsdC5rZXkgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBrZXlzLnB1c2goYCR7c306JHtyZXN1bHQua2V5fWApO1xuICAgICAgICAgICAgICAgIGFwcGxpZWRTdHJhdGVnaWVzLnB1c2gocyk7XG4gICAgICAgICAgICAgICAgY29sbGVjdGVkTW9kZXMucHVzaChyZXN1bHQubW9kZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGxvZ0RlYnVnKFwiRXJyb3IgZ2VuZXJhdGluZyBncm91cGluZyBrZXlcIiwgeyB0YWJJZDogdGFiLmlkLCBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICByZXR1cm47IC8vIFNraXAgdGhpcyB0YWIgb24gZXJyb3JcbiAgICB9XG5cbiAgICAvLyBJZiBubyBzdHJhdGVnaWVzIGFwcGxpZWQgKGUuZy4gYWxsIGZpbHRlcmVkIG91dCksIHNraXAgZ3JvdXBpbmcgZm9yIHRoaXMgdGFiXG4gICAgaWYgKGtleXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBlZmZlY3RpdmVNb2RlID0gcmVzb2x2ZVdpbmRvd01vZGUoY29sbGVjdGVkTW9kZXMpO1xuICAgIGNvbnN0IHZhbHVlS2V5ID0ga2V5cy5qb2luKFwiOjpcIik7XG4gICAgbGV0IGJ1Y2tldEtleSA9IFwiXCI7XG4gICAgaWYgKGVmZmVjdGl2ZU1vZGUgPT09ICdjdXJyZW50Jykge1xuICAgICAgICAgYnVja2V0S2V5ID0gYHdpbmRvdy0ke3RhYi53aW5kb3dJZH06OmAgKyB2YWx1ZUtleTtcbiAgICB9IGVsc2Uge1xuICAgICAgICAgYnVja2V0S2V5ID0gYGdsb2JhbDo6YCArIHZhbHVlS2V5O1xuICAgIH1cblxuICAgIGxldCBncm91cCA9IGJ1Y2tldHMuZ2V0KGJ1Y2tldEtleSk7XG4gICAgaWYgKCFncm91cCkge1xuICAgICAgbGV0IGdyb3VwQ29sb3IgPSBudWxsO1xuICAgICAgbGV0IGNvbG9yRmllbGQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgIGxldCBjb2xvclRyYW5zZm9ybTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgbGV0IGNvbG9yVHJhbnNmb3JtUGF0dGVybjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG4gICAgICBmb3IgKGNvbnN0IHNJZCBvZiBhcHBsaWVkU3RyYXRlZ2llcykge1xuICAgICAgICBjb25zdCBydWxlID0gZ2V0U3RyYXRlZ3lDb2xvclJ1bGUoc0lkKTtcbiAgICAgICAgaWYgKHJ1bGUpIHtcbiAgICAgICAgICAgIGdyb3VwQ29sb3IgPSBydWxlLmNvbG9yO1xuICAgICAgICAgICAgY29sb3JGaWVsZCA9IHJ1bGUuY29sb3JGaWVsZDtcbiAgICAgICAgICAgIGNvbG9yVHJhbnNmb3JtID0gcnVsZS5jb2xvclRyYW5zZm9ybTtcbiAgICAgICAgICAgIGNvbG9yVHJhbnNmb3JtUGF0dGVybiA9IHJ1bGUuY29sb3JUcmFuc2Zvcm1QYXR0ZXJuO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKGdyb3VwQ29sb3IgPT09ICdtYXRjaCcpIHtcbiAgICAgICAgZ3JvdXBDb2xvciA9IGNvbG9yRm9yS2V5KHZhbHVlS2V5LCAwKTtcbiAgICAgIH0gZWxzZSBpZiAoZ3JvdXBDb2xvciA9PT0gJ2ZpZWxkJyAmJiBjb2xvckZpZWxkKSB7XG4gICAgICAgIGNvbnN0IHZhbCA9IGdldEZpZWxkVmFsdWUodGFiLCBjb2xvckZpZWxkKTtcbiAgICAgICAgbGV0IGtleSA9IHZhbCAhPT0gdW5kZWZpbmVkICYmIHZhbCAhPT0gbnVsbCA/IFN0cmluZyh2YWwpIDogXCJcIjtcbiAgICAgICAgaWYgKGNvbG9yVHJhbnNmb3JtKSB7XG4gICAgICAgICAgICBrZXkgPSBhcHBseVZhbHVlVHJhbnNmb3JtKGtleSwgY29sb3JUcmFuc2Zvcm0sIGNvbG9yVHJhbnNmb3JtUGF0dGVybik7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBVc2Uga2V5IGV2ZW4gaWYgZW1wdHkgKHJlcHJlc2VudGluZyBtaXNzaW5nIGZpZWxkKSB0byBlbnN1cmUgY29uc2lzdGVudCBjb2xvcmluZ1xuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkoa2V5LCAwKTtcbiAgICAgIH0gZWxzZSBpZiAoIWdyb3VwQ29sb3IgfHwgZ3JvdXBDb2xvciA9PT0gJ2ZpZWxkJykge1xuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkodmFsdWVLZXksIDApO1xuICAgICAgfVxuXG4gICAgICBncm91cCA9IHtcbiAgICAgICAgaWQ6IGJ1Y2tldEtleSxcbiAgICAgICAgd2luZG93SWQ6IHRhYi53aW5kb3dJZCxcbiAgICAgICAgbGFiZWw6IFwiXCIsXG4gICAgICAgIGNvbG9yOiBncm91cENvbG9yLFxuICAgICAgICB0YWJzOiBbXSxcbiAgICAgICAgcmVhc29uOiBhcHBsaWVkU3RyYXRlZ2llcy5qb2luKFwiICsgXCIpLFxuICAgICAgICB3aW5kb3dNb2RlOiBlZmZlY3RpdmVNb2RlXG4gICAgICB9O1xuICAgICAgYnVja2V0cy5zZXQoYnVja2V0S2V5LCBncm91cCk7XG4gICAgICBidWNrZXRNZXRhLnNldChidWNrZXRLZXksIHsgdmFsdWVLZXksIGFwcGxpZWRTdHJhdGVnaWVzOiBbLi4uYXBwbGllZFN0cmF0ZWdpZXNdIH0pO1xuICAgIH1cbiAgICBncm91cC50YWJzLnB1c2godGFiKTtcbiAgfSk7XG5cbiAgY29uc3QgZ3JvdXBzID0gQXJyYXkuZnJvbShidWNrZXRzLnZhbHVlcygpKTtcbiAgZ3JvdXBzLmZvckVhY2goZ3JvdXAgPT4ge1xuICAgIGdyb3VwLmxhYmVsID0gZ2VuZXJhdGVMYWJlbChlZmZlY3RpdmVTdHJhdGVnaWVzLCBncm91cC50YWJzLCBhbGxUYWJzTWFwKTtcblxuICAgIGNvbnN0IG1ldGEgPSBidWNrZXRNZXRhLmdldChncm91cC5pZCk7XG4gICAgaWYgKCFtZXRhKSByZXR1cm47XG5cbiAgICBmb3IgKGNvbnN0IHNJZCBvZiBtZXRhLmFwcGxpZWRTdHJhdGVnaWVzKSB7XG4gICAgICBjb25zdCBydWxlID0gZ2V0U3RyYXRlZ3lDb2xvclJ1bGUoc0lkKTtcbiAgICAgIGlmICghcnVsZSkgY29udGludWU7XG5cbiAgICAgIGlmIChydWxlLmNvbG9yID09PSAnbWF0Y2gnKSB7XG4gICAgICAgIGdyb3VwLmNvbG9yID0gY29sb3JGb3JLZXkobWV0YS52YWx1ZUtleSwgMCk7XG4gICAgICB9IGVsc2UgaWYgKHJ1bGUuY29sb3IgPT09ICdmaWVsZCcgJiYgcnVsZS5jb2xvckZpZWxkKSB7XG4gICAgICAgIGNvbnN0IGNvbG9yVmFsdWUgPSBnZXRDb2xvclZhbHVlRnJvbVRhYnMoZ3JvdXAudGFicywgcnVsZS5jb2xvckZpZWxkLCBydWxlLmNvbG9yVHJhbnNmb3JtLCBydWxlLmNvbG9yVHJhbnNmb3JtUGF0dGVybik7XG4gICAgICAgIC8vIFVzZSBjb2xvclZhbHVlIGRpcmVjdGx5IGV2ZW4gaWYgZW1wdHlcbiAgICAgICAgZ3JvdXAuY29sb3IgPSBjb2xvckZvcktleShjb2xvclZhbHVlLCAwKTtcbiAgICAgIH0gZWxzZSBpZiAocnVsZS5jb2xvcikge1xuICAgICAgICBncm91cC5jb2xvciA9IHJ1bGUuY29sb3I7XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICB9XG4gIH0pO1xuXG4gIHJldHVybiBncm91cHM7XG59O1xuXG5jb25zdCBjaGVja1ZhbHVlTWF0Y2ggPSAoXG4gICAgb3BlcmF0b3I6IHN0cmluZyxcbiAgICByYXdWYWx1ZTogYW55LFxuICAgIHJ1bGVWYWx1ZTogc3RyaW5nXG4pOiB7IGlzTWF0Y2g6IGJvb2xlYW47IG1hdGNoT2JqOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsIH0gPT4ge1xuICAgIGNvbnN0IHZhbHVlU3RyID0gcmF3VmFsdWUgIT09IHVuZGVmaW5lZCAmJiByYXdWYWx1ZSAhPT0gbnVsbCA/IFN0cmluZyhyYXdWYWx1ZSkgOiBcIlwiO1xuICAgIGNvbnN0IHZhbHVlVG9DaGVjayA9IHZhbHVlU3RyLnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3QgcGF0dGVyblRvQ2hlY2sgPSBydWxlVmFsdWUgPyBydWxlVmFsdWUudG9Mb3dlckNhc2UoKSA6IFwiXCI7XG5cbiAgICBsZXQgaXNNYXRjaCA9IGZhbHNlO1xuICAgIGxldCBtYXRjaE9iajogUmVnRXhwRXhlY0FycmF5IHwgbnVsbCA9IG51bGw7XG5cbiAgICBzd2l0Y2ggKG9wZXJhdG9yKSB7XG4gICAgICAgIGNhc2UgJ2NvbnRhaW5zJzogaXNNYXRjaCA9IHZhbHVlVG9DaGVjay5pbmNsdWRlcyhwYXR0ZXJuVG9DaGVjayk7IGJyZWFrO1xuICAgICAgICBjYXNlICdkb2VzTm90Q29udGFpbic6IGlzTWF0Y2ggPSAhdmFsdWVUb0NoZWNrLmluY2x1ZGVzKHBhdHRlcm5Ub0NoZWNrKTsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2VxdWFscyc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2sgPT09IHBhdHRlcm5Ub0NoZWNrOyBicmVhaztcbiAgICAgICAgY2FzZSAnc3RhcnRzV2l0aCc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suc3RhcnRzV2l0aChwYXR0ZXJuVG9DaGVjayk7IGJyZWFrO1xuICAgICAgICBjYXNlICdlbmRzV2l0aCc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suZW5kc1dpdGgocGF0dGVyblRvQ2hlY2spOyBicmVhaztcbiAgICAgICAgY2FzZSAnZXhpc3RzJzogaXNNYXRjaCA9IHJhd1ZhbHVlICE9PSB1bmRlZmluZWQ7IGJyZWFrO1xuICAgICAgICBjYXNlICdkb2VzTm90RXhpc3QnOiBpc01hdGNoID0gcmF3VmFsdWUgPT09IHVuZGVmaW5lZDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2lzTnVsbCc6IGlzTWF0Y2ggPSByYXdWYWx1ZSA9PT0gbnVsbDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2lzTm90TnVsbCc6IGlzTWF0Y2ggPSByYXdWYWx1ZSAhPT0gbnVsbDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ21hdGNoZXMnOlxuICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKHJ1bGVWYWx1ZSwgJ2knKTtcbiAgICAgICAgICAgICAgICBtYXRjaE9iaiA9IHJlZ2V4LmV4ZWModmFsdWVTdHIpO1xuICAgICAgICAgICAgICAgIGlzTWF0Y2ggPSAhIW1hdGNoT2JqO1xuICAgICAgICAgICAgIH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHJldHVybiB7IGlzTWF0Y2gsIG1hdGNoT2JqIH07XG59O1xuXG5leHBvcnQgY29uc3QgY2hlY2tDb25kaXRpb24gPSAoY29uZGl0aW9uOiBSdWxlQ29uZGl0aW9uLCB0YWI6IFRhYk1ldGFkYXRhKTogYm9vbGVhbiA9PiB7XG4gICAgaWYgKCFjb25kaXRpb24pIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCByYXdWYWx1ZSA9IGdldEZpZWxkVmFsdWUodGFiLCBjb25kaXRpb24uZmllbGQpO1xuICAgIGNvbnN0IHsgaXNNYXRjaCB9ID0gY2hlY2tWYWx1ZU1hdGNoKGNvbmRpdGlvbi5vcGVyYXRvciwgcmF3VmFsdWUsIGNvbmRpdGlvbi52YWx1ZSk7XG4gICAgcmV0dXJuIGlzTWF0Y2g7XG59O1xuXG5leHBvcnQgY29uc3QgYXBwbHlWYWx1ZVRyYW5zZm9ybSA9ICh2YWw6IHN0cmluZywgdHJhbnNmb3JtOiBzdHJpbmcsIHBhdHRlcm4/OiBzdHJpbmcsIHJlcGxhY2VtZW50Pzogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICBpZiAoIXZhbCB8fCAhdHJhbnNmb3JtIHx8IHRyYW5zZm9ybSA9PT0gJ25vbmUnKSByZXR1cm4gdmFsO1xuXG4gICAgc3dpdGNoICh0cmFuc2Zvcm0pIHtcbiAgICAgICAgY2FzZSAnc3RyaXBUbGQnOlxuICAgICAgICAgICAgcmV0dXJuIHN0cmlwVGxkKHZhbCk7XG4gICAgICAgIGNhc2UgJ2xvd2VyY2FzZSc6XG4gICAgICAgICAgICByZXR1cm4gdmFsLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGNhc2UgJ3VwcGVyY2FzZSc6XG4gICAgICAgICAgICByZXR1cm4gdmFsLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgIGNhc2UgJ2ZpcnN0Q2hhcic6XG4gICAgICAgICAgICByZXR1cm4gdmFsLmNoYXJBdCgwKTtcbiAgICAgICAgY2FzZSAnZG9tYWluJzpcbiAgICAgICAgICAgIHJldHVybiBkb21haW5Gcm9tVXJsKHZhbCk7XG4gICAgICAgIGNhc2UgJ2hvc3RuYW1lJzpcbiAgICAgICAgICAgIGNvbnN0IGggPSBnZXRIb3N0bmFtZSh2YWwpO1xuICAgICAgICAgICAgcmV0dXJuIGggIT09IG51bGwgPyBoIDogdmFsO1xuICAgICAgICBjYXNlICdyZWdleCc6XG4gICAgICAgICAgICBpZiAocGF0dGVybikge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCByZWdleCA9IHJlZ2V4Q2FjaGUuZ2V0KHBhdHRlcm4pO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXJlZ2V4KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWdleCA9IG5ldyBSZWdFeHAocGF0dGVybik7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWdleENhY2hlLnNldChwYXR0ZXJuLCByZWdleCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbWF0Y2ggPSByZWdleC5leGVjKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGV4dHJhY3RlZCA9IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IG1hdGNoLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXh0cmFjdGVkICs9IG1hdGNoW2ldIHx8IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZXh0cmFjdGVkO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgIGxvZ0RlYnVnKFwiSW52YWxpZCByZWdleCBpbiB0cmFuc2Zvcm1cIiwgeyBwYXR0ZXJuOiBwYXR0ZXJuLCBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICAgICAgfVxuICAgICAgICBjYXNlICdyZWdleFJlcGxhY2UnOlxuICAgICAgICAgICAgIGlmIChwYXR0ZXJuKSB7XG4gICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAvLyBVc2luZyAnZycgZ2xvYmFsIGZsYWcgYnkgZGVmYXVsdCBmb3IgcmVwbGFjZW1lbnRcbiAgICAgICAgICAgICAgICAgICAgIHJldHVybiB2YWwucmVwbGFjZShuZXcgUmVnRXhwKHBhdHRlcm4sICdnJyksIHJlcGxhY2VtZW50IHx8IFwiXCIpO1xuICAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkludmFsaWQgcmVnZXggaW4gdHJhbnNmb3JtXCIsIHsgcGF0dGVybjogcGF0dGVybiwgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICAgICAgICAgICAgIHJldHVybiB2YWw7XG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgcmV0dXJuIHZhbDtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHJldHVybiB2YWw7XG4gICAgfVxufTtcblxuLyoqXG4gKiBFdmFsdWF0ZXMgbGVnYWN5IHJ1bGVzIChzaW1wbGUgQU5EL09SIGNvbmRpdGlvbnMgd2l0aG91dCBncm91cGluZy9maWx0ZXIgc2VwYXJhdGlvbikuXG4gKiBAZGVwcmVjYXRlZCBUaGlzIGxvZ2ljIGlzIGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5IHdpdGggb2xkIGN1c3RvbSBzdHJhdGVnaWVzLlxuICovXG5mdW5jdGlvbiBldmFsdWF0ZUxlZ2FjeVJ1bGVzKGxlZ2FjeVJ1bGVzOiBTdHJhdGVneVJ1bGVbXSwgdGFiOiBUYWJNZXRhZGF0YSk6IHN0cmluZyB8IG51bGwge1xuICAgIGNvbnN0IGxlZ2FjeVJ1bGVzTGlzdCA9IGFzQXJyYXk8U3RyYXRlZ3lSdWxlPihsZWdhY3lSdWxlcyk7XG4gICAgaWYgKGxlZ2FjeVJ1bGVzTGlzdC5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGxlZ2FjeVJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IHJhd1ZhbHVlID0gZ2V0RmllbGRWYWx1ZSh0YWIsIHJ1bGUuZmllbGQpO1xuICAgICAgICAgICAgY29uc3QgeyBpc01hdGNoLCBtYXRjaE9iaiB9ID0gY2hlY2tWYWx1ZU1hdGNoKHJ1bGUub3BlcmF0b3IsIHJhd1ZhbHVlLCBydWxlLnZhbHVlKTtcblxuICAgICAgICAgICAgaWYgKGlzTWF0Y2gpIHtcbiAgICAgICAgICAgICAgICBsZXQgcmVzdWx0ID0gcnVsZS5yZXN1bHQ7XG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoT2JqICYmIG1hdGNoT2JqLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBtYXRjaE9iai5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKG5ldyBSZWdFeHAoYFxcXFwkJHtpfWAsICdnJyksIG1hdGNoT2JqW2ldIHx8IFwiXCIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGV2YWx1YXRpbmcgbGVnYWN5IHJ1bGVzXCIsIHsgZXJyb3I6IFN0cmluZyhlcnJvcikgfSk7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgY29uc3QgZ2V0R3JvdXBpbmdSZXN1bHQgPSAodGFiOiBUYWJNZXRhZGF0YSwgc3RyYXRlZ3k6IEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcpOiB7IGtleTogc3RyaW5nIHwgbnVsbCwgbW9kZTogXCJjdXJyZW50XCIgfCBcIm5ld1wiIHwgXCJjb21wb3VuZFwiIH0gPT4ge1xuICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneSk7XG4gIGlmIChjdXN0b20pIHtcbiAgICAgIGNvbnN0IGZpbHRlckdyb3Vwc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb25bXT4oY3VzdG9tLmZpbHRlckdyb3Vwcyk7XG4gICAgICBjb25zdCBmaWx0ZXJzTGlzdCA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbj4oY3VzdG9tLmZpbHRlcnMpO1xuXG4gICAgICBsZXQgbWF0Y2ggPSBmYWxzZTtcblxuICAgICAgaWYgKGZpbHRlckdyb3Vwc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIC8vIE9SIGxvZ2ljXG4gICAgICAgICAgZm9yIChjb25zdCBncm91cCBvZiBmaWx0ZXJHcm91cHNMaXN0KSB7XG4gICAgICAgICAgICAgIGNvbnN0IGdyb3VwUnVsZXMgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGdyb3VwKTtcbiAgICAgICAgICAgICAgaWYgKGdyb3VwUnVsZXMubGVuZ3RoID09PSAwIHx8IGdyb3VwUnVsZXMuZXZlcnkociA9PiBjaGVja0NvbmRpdGlvbihyLCB0YWIpKSkge1xuICAgICAgICAgICAgICAgICAgbWF0Y2ggPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGZpbHRlcnNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAvLyBMZWdhY3kvU2ltcGxlIEFORCBsb2dpY1xuICAgICAgICAgIGlmIChmaWx0ZXJzTGlzdC5ldmVyeShmID0+IGNoZWNrQ29uZGl0aW9uKGYsIHRhYikpKSB7XG4gICAgICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIE5vIGZpbHRlcnMgLT4gTWF0Y2ggYWxsXG4gICAgICAgICAgbWF0Y2ggPSB0cnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoIW1hdGNoKSB7XG4gICAgICAgICAgcmV0dXJuIHsga2V5OiBudWxsLCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICAgICAgfVxuXG4gICAgICBjb25zdCBncm91cGluZ1J1bGVzTGlzdCA9IGFzQXJyYXk8R3JvdXBpbmdSdWxlPihjdXN0b20uZ3JvdXBpbmdSdWxlcyk7XG4gICAgICBpZiAoZ3JvdXBpbmdSdWxlc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgIGNvbnN0IG1vZGVzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZ3JvdXBpbmdSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXJ1bGUpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIGxldCB2YWwgPSBcIlwiO1xuICAgICAgICAgICAgICAgIGlmIChydWxlLnNvdXJjZSA9PT0gJ2ZpZWxkJykge1xuICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmF3ID0gZ2V0RmllbGRWYWx1ZSh0YWIsIHJ1bGUudmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgdmFsID0gcmF3ICE9PSB1bmRlZmluZWQgJiYgcmF3ICE9PSBudWxsID8gU3RyaW5nKHJhdykgOiBcIlwiO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICB2YWwgPSBydWxlLnZhbHVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh2YWwgJiYgcnVsZS50cmFuc2Zvcm0gJiYgcnVsZS50cmFuc2Zvcm0gIT09ICdub25lJykge1xuICAgICAgICAgICAgICAgICAgICB2YWwgPSBhcHBseVZhbHVlVHJhbnNmb3JtKHZhbCwgcnVsZS50cmFuc2Zvcm0sIHJ1bGUudHJhbnNmb3JtUGF0dGVybiwgcnVsZS50cmFuc2Zvcm1SZXBsYWNlbWVudCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHZhbCkge1xuICAgICAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChydWxlLndpbmRvd01vZGUpIG1vZGVzLnB1c2gocnVsZS53aW5kb3dNb2RlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgIGxvZ0RlYnVnKFwiRXJyb3IgYXBwbHlpbmcgZ3JvdXBpbmcgcnVsZXNcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIHJldHVybiB7IGtleTogcGFydHMuam9pbihcIiAtIFwiKSwgbW9kZTogcmVzb2x2ZVdpbmRvd01vZGUobW9kZXMpIH07XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7IGtleTogY3VzdG9tLmZhbGxiYWNrIHx8IFwiTWlzY1wiLCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICAgICAgfSBlbHNlIGlmIChjdXN0b20ucnVsZXMpIHtcbiAgICAgICAgICBjb25zdCByZXN1bHQgPSBldmFsdWF0ZUxlZ2FjeVJ1bGVzKGFzQXJyYXk8U3RyYXRlZ3lSdWxlPihjdXN0b20ucnVsZXMpLCB0YWIpO1xuICAgICAgICAgIGlmIChyZXN1bHQpIHJldHVybiB7IGtleTogcmVzdWx0LCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICAgICAgfVxuXG4gICAgICByZXR1cm4geyBrZXk6IGN1c3RvbS5mYWxsYmFjayB8fCBcIk1pc2NcIiwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgfVxuXG4gIC8vIEJ1aWx0LWluIHN0cmF0ZWdpZXNcbiAgbGV0IHNpbXBsZUtleTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIHN3aXRjaCAoc3RyYXRlZ3kpIHtcbiAgICBjYXNlIFwiZG9tYWluXCI6XG4gICAgY2FzZSBcImRvbWFpbl9mdWxsXCI6XG4gICAgICBzaW1wbGVLZXkgPSBkb21haW5Gcm9tVXJsKHRhYi51cmwpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInRvcGljXCI6XG4gICAgICBzaW1wbGVLZXkgPSBzZW1hbnRpY0J1Y2tldCh0YWIudGl0bGUsIHRhYi51cmwpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcImxpbmVhZ2VcIjpcbiAgICAgIHNpbXBsZUtleSA9IG5hdmlnYXRpb25LZXkodGFiKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJjb250ZXh0XCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIuY29udGV4dCB8fCBcIlVuY2F0ZWdvcml6ZWRcIjtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJwaW5uZWRcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi5waW5uZWQgPyBcInBpbm5lZFwiIDogXCJ1bnBpbm5lZFwiO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcImFnZVwiOlxuICAgICAgc2ltcGxlS2V5ID0gZ2V0UmVjZW5jeUxhYmVsKHRhYi5sYXN0QWNjZXNzZWQgPz8gMCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwidXJsXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIudXJsO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInRpdGxlXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIudGl0bGU7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwicmVjZW5jeVwiOlxuICAgICAgc2ltcGxlS2V5ID0gU3RyaW5nKHRhYi5sYXN0QWNjZXNzZWQgPz8gMCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwibmVzdGluZ1wiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQgPyBcImNoaWxkXCIgOiBcInJvb3RcIjtcbiAgICAgIGJyZWFrO1xuICAgIGRlZmF1bHQ6XG4gICAgICAgIGNvbnN0IHZhbCA9IGdldEZpZWxkVmFsdWUodGFiLCBzdHJhdGVneSk7XG4gICAgICAgIGlmICh2YWwgIT09IHVuZGVmaW5lZCAmJiB2YWwgIT09IG51bGwpIHtcbiAgICAgICAgICAgIHNpbXBsZUtleSA9IFN0cmluZyh2YWwpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2ltcGxlS2V5ID0gXCJVbmtub3duXCI7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gIH1cbiAgcmV0dXJuIHsga2V5OiBzaW1wbGVLZXksIG1vZGU6IFwiY3VycmVudFwiIH07XG59O1xuXG5leHBvcnQgY29uc3QgZ3JvdXBpbmdLZXkgPSAodGFiOiBUYWJNZXRhZGF0YSwgc3RyYXRlZ3k6IEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcpOiBzdHJpbmcgfCBudWxsID0+IHtcbiAgICByZXR1cm4gZ2V0R3JvdXBpbmdSZXN1bHQodGFiLCBzdHJhdGVneSkua2V5O1xufTtcblxuZnVuY3Rpb24gaXNDb250ZXh0RmllbGQoZmllbGQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBmaWVsZCA9PT0gJ2NvbnRleHQnIHx8IGZpZWxkID09PSAnZ2VucmUnIHx8IGZpZWxkID09PSAnc2l0ZU5hbWUnIHx8IGZpZWxkLnN0YXJ0c1dpdGgoJ2NvbnRleHREYXRhLicpO1xufVxuXG5leHBvcnQgY29uc3QgcmVxdWlyZXNDb250ZXh0QW5hbHlzaXMgPSAoc3RyYXRlZ3lJZHM6IChzdHJpbmcgfCBTb3J0aW5nU3RyYXRlZ3kpW10pOiBib29sZWFuID0+IHtcbiAgICAvLyBDaGVjayBpZiBcImNvbnRleHRcIiBzdHJhdGVneSBpcyBleHBsaWNpdGx5IHJlcXVlc3RlZFxuICAgIGlmIChzdHJhdGVneUlkcy5pbmNsdWRlcyhcImNvbnRleHRcIikpIHJldHVybiB0cnVlO1xuXG4gICAgY29uc3Qgc3RyYXRlZ2llcyA9IGdldFN0cmF0ZWdpZXMoY3VzdG9tU3RyYXRlZ2llcyk7XG4gICAgLy8gZmlsdGVyIG9ubHkgdGhvc2UgdGhhdCBtYXRjaCB0aGUgcmVxdWVzdGVkIElEc1xuICAgIGNvbnN0IGFjdGl2ZURlZnMgPSBzdHJhdGVnaWVzLmZpbHRlcihzID0+IHN0cmF0ZWd5SWRzLmluY2x1ZGVzKHMuaWQpKTtcblxuICAgIGZvciAoY29uc3QgZGVmIG9mIGFjdGl2ZURlZnMpIHtcbiAgICAgICAgLy8gSWYgaXQncyBhIGJ1aWx0LWluIHN0cmF0ZWd5IHRoYXQgbmVlZHMgY29udGV4dCAob25seSAnY29udGV4dCcgZG9lcylcbiAgICAgICAgaWYgKGRlZi5pZCA9PT0gJ2NvbnRleHQnKSByZXR1cm4gdHJ1ZTtcblxuICAgICAgICAvLyBJZiBpdCBpcyBhIGN1c3RvbSBzdHJhdGVneSAob3Igb3ZlcnJpZGVzIGJ1aWx0LWluKSwgY2hlY2sgaXRzIHJ1bGVzXG4gICAgICAgIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChjID0+IGMuaWQgPT09IGRlZi5pZCk7XG4gICAgICAgIGlmIChjdXN0b20pIHtcbiAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzTGlzdCA9IGFzQXJyYXk8R3JvdXBpbmdSdWxlPihjdXN0b20uZ3JvdXBpbmdSdWxlcyk7XG4gICAgICAgICAgICAgY29uc3Qgc29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KGN1c3RvbS5zb3J0aW5nUnVsZXMpO1xuICAgICAgICAgICAgIGNvbnN0IGdyb3VwU29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KGN1c3RvbS5ncm91cFNvcnRpbmdSdWxlcyk7XG4gICAgICAgICAgICAgY29uc3QgZmlsdGVyc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGN1c3RvbS5maWx0ZXJzKTtcbiAgICAgICAgICAgICBjb25zdCBmaWx0ZXJHcm91cHNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uW10+KGN1c3RvbS5maWx0ZXJHcm91cHMpO1xuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwUnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIHJ1bGUuc291cmNlID09PSAnZmllbGQnICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUudmFsdWUpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgcnVsZS5jb2xvciA9PT0gJ2ZpZWxkJyAmJiBydWxlLmNvbG9yRmllbGQgJiYgaXNDb250ZXh0RmllbGQocnVsZS5jb2xvckZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIHNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBmaWx0ZXJzTGlzdCkge1xuICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBpc0NvbnRleHRGaWVsZChydWxlLmZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBncm91cCBvZiBmaWx0ZXJHcm91cHNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGNvbnN0IGdyb3VwUnVsZXMgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGdyb3VwKTtcbiAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwUnVsZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59O1xuIiwgImltcG9ydCB7IFNvcnRpbmdTdHJhdGVneSwgVGFiTWV0YWRhdGEsIEN1c3RvbVN0cmF0ZWd5LCBTb3J0aW5nUnVsZSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGRvbWFpbkZyb21VcmwsIHNlbWFudGljQnVja2V0LCBuYXZpZ2F0aW9uS2V5LCBncm91cGluZ0tleSwgZ2V0RmllbGRWYWx1ZSwgZ2V0Q3VzdG9tU3RyYXRlZ2llcyB9IGZyb20gXCIuL2dyb3VwaW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcblxuLy8gSGVscGVyIHNjb3Jlc1xuZXhwb3J0IGNvbnN0IHJlY2VuY3lTY29yZSA9ICh0YWI6IFRhYk1ldGFkYXRhKSA9PiB0YWIubGFzdEFjY2Vzc2VkID8/IDA7XG5leHBvcnQgY29uc3QgaGllcmFyY2h5U2NvcmUgPSAodGFiOiBUYWJNZXRhZGF0YSkgPT4gKHRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkID8gMSA6IDApO1xuZXhwb3J0IGNvbnN0IHBpbm5lZFNjb3JlID0gKHRhYjogVGFiTWV0YWRhdGEpID0+ICh0YWIucGlubmVkID8gMCA6IDEpO1xuXG5leHBvcnQgY29uc3QgY29tcGFyZVZhbHVlcyA9IChhOiBhbnksIGI6IGFueSwgb3JkZXI6ICdhc2MnIHwgJ2Rlc2MnID0gJ2FzYycpOiBudW1iZXIgPT4ge1xuICAgIC8vIFRyZWF0IHVuZGVmaW5lZC9udWxsIGFzIFwiZ3JlYXRlclwiIHRoYW4gZXZlcnl0aGluZyBlbHNlIChwdXNoZWQgdG8gZW5kIGluIGFzYylcbiAgICBjb25zdCBpc0FOdWxsID0gYSA9PT0gdW5kZWZpbmVkIHx8IGEgPT09IG51bGw7XG4gICAgY29uc3QgaXNCTnVsbCA9IGIgPT09IHVuZGVmaW5lZCB8fCBiID09PSBudWxsO1xuXG4gICAgaWYgKGlzQU51bGwgJiYgaXNCTnVsbCkgcmV0dXJuIDA7XG4gICAgaWYgKGlzQU51bGwpIHJldHVybiAxOyAvLyBhID4gYiAoYSBpcyBudWxsKVxuICAgIGlmIChpc0JOdWxsKSByZXR1cm4gLTE7IC8vIGIgPiBhIChiIGlzIG51bGwpIC0+IGEgPCBiXG5cbiAgICBsZXQgcmVzdWx0ID0gMDtcbiAgICBpZiAoYSA8IGIpIHJlc3VsdCA9IC0xO1xuICAgIGVsc2UgaWYgKGEgPiBiKSByZXN1bHQgPSAxO1xuXG4gICAgcmV0dXJuIG9yZGVyID09PSAnZGVzYycgPyAtcmVzdWx0IDogcmVzdWx0O1xufTtcblxuZXhwb3J0IGNvbnN0IGNvbXBhcmVCeVNvcnRpbmdSdWxlcyA9IChydWxlczogU29ydGluZ1J1bGVbXSwgYTogVGFiTWV0YWRhdGEsIGI6IFRhYk1ldGFkYXRhKTogbnVtYmVyID0+IHtcbiAgICBjb25zdCBzb3J0UnVsZXNMaXN0ID0gYXNBcnJheTxTb3J0aW5nUnVsZT4ocnVsZXMpO1xuICAgIGlmIChzb3J0UnVsZXNMaXN0Lmxlbmd0aCA9PT0gMCkgcmV0dXJuIDA7XG5cbiAgICB0cnkge1xuICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2Ygc29ydFJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IHZhbEEgPSBnZXRGaWVsZFZhbHVlKGEsIHJ1bGUuZmllbGQpO1xuICAgICAgICAgICAgY29uc3QgdmFsQiA9IGdldEZpZWxkVmFsdWUoYiwgcnVsZS5maWVsZCk7XG5cbiAgICAgICAgICAgIGNvbnN0IGRpZmYgPSBjb21wYXJlVmFsdWVzKHZhbEEsIHZhbEIsIHJ1bGUub3JkZXIgfHwgJ2FzYycpO1xuICAgICAgICAgICAgaWYgKGRpZmYgIT09IDApIHJldHVybiBkaWZmO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGV2YWx1YXRpbmcgc29ydGluZyBydWxlc1wiLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgfVxuICAgIHJldHVybiAwO1xufTtcblxudHlwZSBDb21wYXJhdG9yID0gKGE6IFRhYk1ldGFkYXRhLCBiOiBUYWJNZXRhZGF0YSkgPT4gbnVtYmVyO1xuXG4vLyAtLS0gQnVpbHQtaW4gQ29tcGFyYXRvcnMgLS0tXG5cbmNvbnN0IGNvbXBhcmVSZWNlbmN5OiBDb21wYXJhdG9yID0gKGEsIGIpID0+IChiLmxhc3RBY2Nlc3NlZCA/PyAwKSAtIChhLmxhc3RBY2Nlc3NlZCA/PyAwKTtcbmNvbnN0IGNvbXBhcmVOZXN0aW5nOiBDb21wYXJhdG9yID0gKGEsIGIpID0+IGhpZXJhcmNoeVNjb3JlKGEpIC0gaGllcmFyY2h5U2NvcmUoYik7XG5jb25zdCBjb21wYXJlUGlubmVkOiBDb21wYXJhdG9yID0gKGEsIGIpID0+IHBpbm5lZFNjb3JlKGEpIC0gcGlubmVkU2NvcmUoYik7XG5jb25zdCBjb21wYXJlVGl0bGU6IENvbXBhcmF0b3IgPSAoYSwgYikgPT4gYS50aXRsZS5sb2NhbGVDb21wYXJlKGIudGl0bGUpO1xuY29uc3QgY29tcGFyZVVybDogQ29tcGFyYXRvciA9IChhLCBiKSA9PiBhLnVybC5sb2NhbGVDb21wYXJlKGIudXJsKTtcbmNvbnN0IGNvbXBhcmVDb250ZXh0OiBDb21wYXJhdG9yID0gKGEsIGIpID0+IChhLmNvbnRleHQgPz8gXCJcIikubG9jYWxlQ29tcGFyZShiLmNvbnRleHQgPz8gXCJcIik7XG5jb25zdCBjb21wYXJlRG9tYWluOiBDb21wYXJhdG9yID0gKGEsIGIpID0+IGRvbWFpbkZyb21VcmwoYS51cmwpLmxvY2FsZUNvbXBhcmUoZG9tYWluRnJvbVVybChiLnVybCkpO1xuY29uc3QgY29tcGFyZVRvcGljOiBDb21wYXJhdG9yID0gKGEsIGIpID0+IHNlbWFudGljQnVja2V0KGEudGl0bGUsIGEudXJsKS5sb2NhbGVDb21wYXJlKHNlbWFudGljQnVja2V0KGIudGl0bGUsIGIudXJsKSk7XG5jb25zdCBjb21wYXJlTGluZWFnZTogQ29tcGFyYXRvciA9IChhLCBiKSA9PiBuYXZpZ2F0aW9uS2V5KGEpLmxvY2FsZUNvbXBhcmUobmF2aWdhdGlvbktleShiKSk7XG5jb25zdCBjb21wYXJlQWdlOiBDb21wYXJhdG9yID0gKGEsIGIpID0+IChncm91cGluZ0tleShhLCBcImFnZVwiKSB8fCBcIlwiKS5sb2NhbGVDb21wYXJlKGdyb3VwaW5nS2V5KGIsIFwiYWdlXCIpIHx8IFwiXCIpO1xuXG5jb25zdCBzdHJhdGVneVJlZ2lzdHJ5OiBSZWNvcmQ8c3RyaW5nLCBDb21wYXJhdG9yPiA9IHtcbiAgcmVjZW5jeTogY29tcGFyZVJlY2VuY3ksXG4gIG5lc3Rpbmc6IGNvbXBhcmVOZXN0aW5nLFxuICBwaW5uZWQ6IGNvbXBhcmVQaW5uZWQsXG4gIHRpdGxlOiBjb21wYXJlVGl0bGUsXG4gIHVybDogY29tcGFyZVVybCxcbiAgY29udGV4dDogY29tcGFyZUNvbnRleHQsXG4gIGRvbWFpbjogY29tcGFyZURvbWFpbixcbiAgZG9tYWluX2Z1bGw6IGNvbXBhcmVEb21haW4sXG4gIHRvcGljOiBjb21wYXJlVG9waWMsXG4gIGxpbmVhZ2U6IGNvbXBhcmVMaW5lYWdlLFxuICBhZ2U6IGNvbXBhcmVBZ2UsXG59O1xuXG4vLyAtLS0gQ3VzdG9tIFN0cmF0ZWd5IEV2YWx1YXRpb24gLS0tXG5cbmNvbnN0IGV2YWx1YXRlQ3VzdG9tU3RyYXRlZ3kgPSAoc3RyYXRlZ3k6IHN0cmluZywgYTogVGFiTWV0YWRhdGEsIGI6IFRhYk1ldGFkYXRhKTogbnVtYmVyIHwgbnVsbCA9PiB7XG4gIGNvbnN0IGN1c3RvbVN0cmF0cyA9IGdldEN1c3RvbVN0cmF0ZWdpZXMoKTtcbiAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneSk7XG5cbiAgaWYgKCFjdXN0b20pIHJldHVybiBudWxsO1xuXG4gIGNvbnN0IHNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihjdXN0b20uc29ydGluZ1J1bGVzKTtcbiAgaWYgKHNvcnRSdWxlc0xpc3QubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcblxuICByZXR1cm4gY29tcGFyZUJ5U29ydGluZ1J1bGVzKHNvcnRSdWxlc0xpc3QsIGEsIGIpO1xufTtcblxuLy8gLS0tIEdlbmVyaWMgRmFsbGJhY2sgLS0tXG5cbmNvbnN0IGV2YWx1YXRlR2VuZXJpY1N0cmF0ZWd5ID0gKHN0cmF0ZWd5OiBzdHJpbmcsIGE6IFRhYk1ldGFkYXRhLCBiOiBUYWJNZXRhZGF0YSk6IG51bWJlciA9PiB7XG4gICAgLy8gQ2hlY2sgaWYgaXQncyBhIGdlbmVyaWMgZmllbGQgZmlyc3RcbiAgICBjb25zdCB2YWxBID0gZ2V0RmllbGRWYWx1ZShhLCBzdHJhdGVneSk7XG4gICAgY29uc3QgdmFsQiA9IGdldEZpZWxkVmFsdWUoYiwgc3RyYXRlZ3kpO1xuXG4gICAgaWYgKHZhbEEgIT09IHVuZGVmaW5lZCAmJiB2YWxCICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgaWYgKHZhbEEgPCB2YWxCKSByZXR1cm4gLTE7XG4gICAgICAgIGlmICh2YWxBID4gdmFsQikgcmV0dXJuIDE7XG4gICAgICAgIHJldHVybiAwO1xuICAgIH1cblxuICAgIC8vIEZhbGxiYWNrIGZvciBjdXN0b20gc3RyYXRlZ2llcyBncm91cGluZyBrZXkgKGlmIHVzaW5nIGN1c3RvbSBzdHJhdGVneSBhcyBzb3J0aW5nIGJ1dCBubyBzb3J0aW5nIHJ1bGVzIGRlZmluZWQpXG4gICAgLy8gb3IgdW5oYW5kbGVkIGJ1aWx0LWluc1xuICAgIHJldHVybiAoZ3JvdXBpbmdLZXkoYSwgc3RyYXRlZ3kpIHx8IFwiXCIpLmxvY2FsZUNvbXBhcmUoZ3JvdXBpbmdLZXkoYiwgc3RyYXRlZ3kpIHx8IFwiXCIpO1xufTtcblxuLy8gLS0tIE1haW4gRXhwb3J0IC0tLVxuXG5leHBvcnQgY29uc3QgY29tcGFyZUJ5ID0gKHN0cmF0ZWd5OiBTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmcsIGE6IFRhYk1ldGFkYXRhLCBiOiBUYWJNZXRhZGF0YSk6IG51bWJlciA9PiB7XG4gIC8vIDEuIEN1c3RvbSBTdHJhdGVneSAodGFrZXMgcHJlY2VkZW5jZSBpZiBydWxlcyBleGlzdClcbiAgY29uc3QgY3VzdG9tRGlmZiA9IGV2YWx1YXRlQ3VzdG9tU3RyYXRlZ3koc3RyYXRlZ3ksIGEsIGIpO1xuICBpZiAoY3VzdG9tRGlmZiAhPT0gbnVsbCkge1xuICAgICAgcmV0dXJuIGN1c3RvbURpZmY7XG4gIH1cblxuICAvLyAyLiBCdWlsdC1pbiByZWdpc3RyeVxuICBjb25zdCBidWlsdEluID0gc3RyYXRlZ3lSZWdpc3RyeVtzdHJhdGVneV07XG4gIGlmIChidWlsdEluKSB7XG4gICAgcmV0dXJuIGJ1aWx0SW4oYSwgYik7XG4gIH1cblxuICAvLyAzLiBHZW5lcmljL0ZhbGxiYWNrXG4gIHJldHVybiBldmFsdWF0ZUdlbmVyaWNTdHJhdGVneShzdHJhdGVneSwgYSwgYik7XG59O1xuXG5leHBvcnQgY29uc3Qgc29ydFRhYnMgPSAodGFiczogVGFiTWV0YWRhdGFbXSwgc3RyYXRlZ2llczogU29ydGluZ1N0cmF0ZWd5W10pOiBUYWJNZXRhZGF0YVtdID0+IHtcbiAgY29uc3Qgc2NvcmluZzogU29ydGluZ1N0cmF0ZWd5W10gPSBzdHJhdGVnaWVzLmxlbmd0aCA/IHN0cmF0ZWdpZXMgOiBbXCJwaW5uZWRcIiwgXCJyZWNlbmN5XCJdO1xuICByZXR1cm4gWy4uLnRhYnNdLnNvcnQoKGEsIGIpID0+IHtcbiAgICBmb3IgKGNvbnN0IHN0cmF0ZWd5IG9mIHNjb3JpbmcpIHtcbiAgICAgIGNvbnN0IGRpZmYgPSBjb21wYXJlQnkoc3RyYXRlZ3ksIGEsIGIpO1xuICAgICAgaWYgKGRpZmYgIT09IDApIHJldHVybiBkaWZmO1xuICAgIH1cbiAgICByZXR1cm4gYS5pZCAtIGIuaWQ7XG4gIH0pO1xufTtcbiIsICJpbXBvcnQge1xuICBBcHBseUdyb3VwaW5nUGF5bG9hZCxcbiAgR3JvdXBpbmdTZWxlY3Rpb24sXG4gIFByZWZlcmVuY2VzLFxuICBSdW50aW1lTWVzc2FnZSxcbiAgUnVudGltZVJlc3BvbnNlLFxuICBTYXZlZFN0YXRlLFxuICBTb3J0aW5nU3RyYXRlZ3ksXG4gIFRhYkdyb3VwLFxuICBUYWJNZXRhZGF0YVxufSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBmZXRjaExvY2FsU3RhdGUgfSBmcm9tIFwiLi9sb2NhbFN0YXRlLmpzXCI7XG5pbXBvcnQgeyBnZXRIb3N0bmFtZSB9IGZyb20gXCIuLi9zaGFyZWQvdXJsQ2FjaGUuanNcIjtcblxuZXhwb3J0IGNvbnN0IHNlbmRNZXNzYWdlID0gYXN5bmMgPFREYXRhPih0eXBlOiBSdW50aW1lTWVzc2FnZVtcInR5cGVcIl0sIHBheWxvYWQ/OiBhbnkpOiBQcm9taXNlPFJ1bnRpbWVSZXNwb25zZTxURGF0YT4+ID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlLCBwYXlsb2FkIH0sIChyZXNwb25zZSkgPT4ge1xuICAgICAgaWYgKGNocm9tZS5ydW50aW1lLmxhc3RFcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiUnVudGltZSBlcnJvcjpcIiwgY2hyb21lLnJ1bnRpbWUubGFzdEVycm9yKTtcbiAgICAgICAgcmVzb2x2ZSh7IG9rOiBmYWxzZSwgZXJyb3I6IGNocm9tZS5ydW50aW1lLmxhc3RFcnJvci5tZXNzYWdlIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzb2x2ZShyZXNwb25zZSB8fCB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiTm8gcmVzcG9uc2UgZnJvbSBiYWNrZ3JvdW5kXCIgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0pO1xufTtcblxuZXhwb3J0IHR5cGUgVGFiV2l0aEdyb3VwID0gVGFiTWV0YWRhdGEgJiB7XG4gIGdyb3VwTGFiZWw/OiBzdHJpbmc7XG4gIGdyb3VwQ29sb3I/OiBzdHJpbmc7XG4gIHJlYXNvbj86IHN0cmluZztcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgV2luZG93VmlldyB7XG4gIGlkOiBudW1iZXI7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIHRhYnM6IFRhYldpdGhHcm91cFtdO1xuICB0YWJDb3VudDogbnVtYmVyO1xuICBncm91cENvdW50OiBudW1iZXI7XG4gIHBpbm5lZENvdW50OiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBJQ09OUyA9IHtcbiAgYWN0aXZlOiBgPHN2ZyB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBvbHlnb24gcG9pbnRzPVwiMyAxMSAyMiAyIDEzIDIxIDExIDEzIDMgMTFcIj48L3BvbHlnb24+PC9zdmc+YCxcbiAgaGlkZTogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwYXRoIGQ9XCJNMTcuOTQgMTcuOTRBMTAuMDcgMTAuMDcgMCAwIDEgMTIgMjBjLTcgMC0xMS04LTExLThhMTguNDUgMTguNDUgMCAwIDEgNS4wNi01Ljk0TTkuOSA0LjI0QTkuMTIgOS4xMiAwIDAgMSAxMiA0YzcgMCAxMSA4IDExIDhhMTguNSAxOC41IDAgMCAxLTIuMTYgMy4xOW0tNi43Mi0xLjA3YTMgMyAwIDEgMS00LjI0LTQuMjRcIj48L3BhdGg+PGxpbmUgeDE9XCIxXCIgeTE9XCIxXCIgeDI9XCIyM1wiIHkyPVwiMjNcIj48L2xpbmU+PC9zdmc+YCxcbiAgc2hvdzogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwYXRoIGQ9XCJNMSAxMnM0LTggMTEtOCAxMSA4IDExIDgtNCA4LTExIDgtMTEtOC0xMS04LTExLTh6XCI+PC9wYXRoPjxjaXJjbGUgY3g9XCIxMlwiIGN5PVwiMTJcIiByPVwiM1wiPjwvY2lyY2xlPjwvc3ZnPmAsXG4gIGZvY3VzOiBgPHN2ZyB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PGNpcmNsZSBjeD1cIjEyXCIgY3k9XCIxMlwiIHI9XCIxMFwiPjwvY2lyY2xlPjxjaXJjbGUgY3g9XCIxMlwiIGN5PVwiMTJcIiByPVwiNlwiPjwvY2lyY2xlPjxjaXJjbGUgY3g9XCIxMlwiIGN5PVwiMTJcIiByPVwiMlwiPjwvY2lyY2xlPjwvc3ZnPmAsXG4gIGNsb3NlOiBgPHN2ZyB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PGxpbmUgeDE9XCIxOFwiIHkxPVwiNlwiIHgyPVwiNlwiIHkyPVwiMThcIj48L2xpbmU+PGxpbmUgeDE9XCI2XCIgeTE9XCI2XCIgeDI9XCIxOFwiIHkyPVwiMThcIj48L2xpbmU+PC9zdmc+YCxcbiAgdW5ncm91cDogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxjaXJjbGUgY3g9XCIxMlwiIGN5PVwiMTJcIiByPVwiMTBcIj48L2NpcmNsZT48bGluZSB4MT1cIjhcIiB5MT1cIjEyXCIgeDI9XCIxNlwiIHkyPVwiMTJcIj48L2xpbmU+PC9zdmc+YCxcbiAgZGVmYXVsdEZpbGU6IGA8c3ZnIHdpZHRoPVwiMjRcIiBoZWlnaHQ9XCIyNFwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cGF0aCBkPVwiTTE0IDJINmEyIDIgMCAwIDAtMiAydjE2YTIgMiAwIDAgMCAyIDJoMTJhMiAyIDAgMCAwIDItMlY4elwiPjwvcGF0aD48cG9seWxpbmUgcG9pbnRzPVwiMTQgMiAxNCA4IDIwIDhcIj48L3BvbHlsaW5lPjxsaW5lIHgxPVwiMTZcIiB5MT1cIjEzXCIgeDI9XCI4XCIgeTI9XCIxM1wiPjwvbGluZT48bGluZSB4MT1cIjE2XCIgeTE9XCIxN1wiIHgyPVwiOFwiIHkyPVwiMTdcIj48L2xpbmU+PHBvbHlsaW5lIHBvaW50cz1cIjEwIDkgOSA5IDggOVwiPjwvcG9seWxpbmU+PC9zdmc+YCxcbiAgYXV0b1J1bjogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwb2x5Z29uIHBvaW50cz1cIjEzIDIgMyAxNCAxMiAxNCAxMSAyMiAyMSAxMCAxMiAxMCAxMyAyXCI+PC9wb2x5Z29uPjwvc3ZnPmBcbn07XG5cbmV4cG9ydCBjb25zdCBHUk9VUF9DT0xPUlM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gIGdyZXk6IFwiIzY0NzQ4YlwiLFxuICBibHVlOiBcIiMzYjgyZjZcIixcbiAgcmVkOiBcIiNlZjQ0NDRcIixcbiAgeWVsbG93OiBcIiNlYWIzMDhcIixcbiAgZ3JlZW46IFwiIzIyYzU1ZVwiLFxuICBwaW5rOiBcIiNlYzQ4OTlcIixcbiAgcHVycGxlOiBcIiNhODU1ZjdcIixcbiAgY3lhbjogXCIjMDZiNmQ0XCIsXG4gIG9yYW5nZTogXCIjZjk3MzE2XCJcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRHcm91cENvbG9yID0gKG5hbWU6IHN0cmluZykgPT4gR1JPVVBfQ09MT1JTW25hbWVdIHx8IFwiI2NiZDVlMVwiO1xuXG5leHBvcnQgY29uc3QgZmV0Y2hTdGF0ZSA9IGFzeW5jICgpID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHNlbmRNZXNzYWdlPHsgZ3JvdXBzOiBUYWJHcm91cFtdOyBwcmVmZXJlbmNlczogUHJlZmVyZW5jZXMgfT4oXCJnZXRTdGF0ZVwiKTtcbiAgICBpZiAocmVzcG9uc2Uub2sgJiYgcmVzcG9uc2UuZGF0YSkge1xuICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgIH1cbiAgICBjb25zb2xlLndhcm4oXCJmZXRjaFN0YXRlIGZhaWxlZCwgdXNpbmcgZmFsbGJhY2s6XCIsIHJlc3BvbnNlLmVycm9yKTtcbiAgICByZXR1cm4gYXdhaXQgZmV0Y2hMb2NhbFN0YXRlKCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBjb25zb2xlLndhcm4oXCJmZXRjaFN0YXRlIHRocmV3IGV4Y2VwdGlvbiwgdXNpbmcgZmFsbGJhY2s6XCIsIGUpO1xuICAgIHJldHVybiBhd2FpdCBmZXRjaExvY2FsU3RhdGUoKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGFwcGx5R3JvdXBpbmcgPSBhc3luYyAocGF5bG9hZDogQXBwbHlHcm91cGluZ1BheWxvYWQpID0+IHtcbiAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6IFwiYXBwbHlHcm91cGluZ1wiLCBwYXlsb2FkIH0pO1xuICByZXR1cm4gcmVzcG9uc2UgYXMgUnVudGltZVJlc3BvbnNlPHVua25vd24+O1xufTtcblxuZXhwb3J0IGNvbnN0IGFwcGx5U29ydGluZyA9IGFzeW5jIChwYXlsb2FkOiBBcHBseUdyb3VwaW5nUGF5bG9hZCkgPT4ge1xuICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogXCJhcHBseVNvcnRpbmdcIiwgcGF5bG9hZCB9KTtcbiAgcmV0dXJuIHJlc3BvbnNlIGFzIFJ1bnRpbWVSZXNwb25zZTx1bmtub3duPjtcbn07XG5cbmV4cG9ydCBjb25zdCBtYXBXaW5kb3dzID0gKGdyb3VwczogVGFiR3JvdXBbXSwgd2luZG93VGl0bGVzOiBNYXA8bnVtYmVyLCBzdHJpbmc+KTogV2luZG93Vmlld1tdID0+IHtcbiAgY29uc3Qgd2luZG93cyA9IG5ldyBNYXA8bnVtYmVyLCBUYWJXaXRoR3JvdXBbXT4oKTtcblxuICBncm91cHMuZm9yRWFjaCgoZ3JvdXApID0+IHtcbiAgICBjb25zdCBpc1VuZ3JvdXBlZCA9IGdyb3VwLnJlYXNvbiA9PT0gXCJVbmdyb3VwZWRcIjtcbiAgICBncm91cC50YWJzLmZvckVhY2goKHRhYikgPT4ge1xuICAgICAgY29uc3QgZGVjb3JhdGVkOiBUYWJXaXRoR3JvdXAgPSB7XG4gICAgICAgIC4uLnRhYixcbiAgICAgICAgZ3JvdXBMYWJlbDogaXNVbmdyb3VwZWQgPyB1bmRlZmluZWQgOiBncm91cC5sYWJlbCxcbiAgICAgICAgZ3JvdXBDb2xvcjogaXNVbmdyb3VwZWQgPyB1bmRlZmluZWQgOiBncm91cC5jb2xvcixcbiAgICAgICAgcmVhc29uOiBncm91cC5yZWFzb25cbiAgICAgIH07XG4gICAgICBjb25zdCBleGlzdGluZyA9IHdpbmRvd3MuZ2V0KHRhYi53aW5kb3dJZCkgPz8gW107XG4gICAgICBleGlzdGluZy5wdXNoKGRlY29yYXRlZCk7XG4gICAgICB3aW5kb3dzLnNldCh0YWIud2luZG93SWQsIGV4aXN0aW5nKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgcmV0dXJuIEFycmF5LmZyb20od2luZG93cy5lbnRyaWVzKCkpXG4gICAgLm1hcDxXaW5kb3dWaWV3PigoW2lkLCB0YWJzXSkgPT4ge1xuICAgICAgY29uc3QgZ3JvdXBDb3VudCA9IG5ldyBTZXQodGFicy5tYXAoKHRhYikgPT4gdGFiLmdyb3VwTGFiZWwpLmZpbHRlcigobCk6IGwgaXMgc3RyaW5nID0+ICEhbCkpLnNpemU7XG4gICAgICBjb25zdCBwaW5uZWRDb3VudCA9IHRhYnMuZmlsdGVyKCh0YWIpID0+IHRhYi5waW5uZWQpLmxlbmd0aDtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGlkLFxuICAgICAgICB0aXRsZTogd2luZG93VGl0bGVzLmdldChpZCkgPz8gYFdpbmRvdyAke2lkfWAsXG4gICAgICAgIHRhYnMsXG4gICAgICAgIHRhYkNvdW50OiB0YWJzLmxlbmd0aCxcbiAgICAgICAgZ3JvdXBDb3VudCxcbiAgICAgICAgcGlubmVkQ291bnRcbiAgICAgIH07XG4gICAgfSlcbiAgICAuc29ydCgoYSwgYikgPT4gYS5pZCAtIGIuaWQpO1xufTtcblxuZXhwb3J0IGNvbnN0IGZvcm1hdERvbWFpbiA9ICh1cmw6IHN0cmluZykgPT4ge1xuICBjb25zdCBob3N0bmFtZSA9IGdldEhvc3RuYW1lKHVybCk7XG4gIGlmIChob3N0bmFtZSkge1xuICAgIHJldHVybiBob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgXCJcIik7XG4gIH1cbiAgcmV0dXJuIHVybDtcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXREcmFnQWZ0ZXJFbGVtZW50KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHk6IG51bWJlciwgc2VsZWN0b3I6IHN0cmluZykge1xuICBjb25zdCBkcmFnZ2FibGVFbGVtZW50cyA9IEFycmF5LmZyb20oY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpKTtcblxuICByZXR1cm4gZHJhZ2dhYmxlRWxlbWVudHMucmVkdWNlKChjbG9zZXN0LCBjaGlsZCkgPT4ge1xuICAgIGNvbnN0IGJveCA9IGNoaWxkLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIGNvbnN0IG9mZnNldCA9IHkgLSBib3gudG9wIC0gYm94LmhlaWdodCAvIDI7XG4gICAgaWYgKG9mZnNldCA8IDAgJiYgb2Zmc2V0ID4gY2xvc2VzdC5vZmZzZXQpIHtcbiAgICAgIHJldHVybiB7IG9mZnNldDogb2Zmc2V0LCBlbGVtZW50OiBjaGlsZCB9O1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gY2xvc2VzdDtcbiAgICB9XG4gIH0sIHsgb2Zmc2V0OiBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFksIGVsZW1lbnQ6IG51bGwgYXMgRWxlbWVudCB8IG51bGwgfSkuZWxlbWVudDtcbn1cbiIsICJcbmV4cG9ydCBjb25zdCBHRU5FUkFfUkVHSVNUUlk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gIC8vIFNlYXJjaFxuICAnZ29vZ2xlLmNvbSc6ICdTZWFyY2gnLFxuICAnYmluZy5jb20nOiAnU2VhcmNoJyxcbiAgJ2R1Y2tkdWNrZ28uY29tJzogJ1NlYXJjaCcsXG4gICd5YWhvby5jb20nOiAnU2VhcmNoJyxcbiAgJ2JhaWR1LmNvbSc6ICdTZWFyY2gnLFxuICAneWFuZGV4LmNvbSc6ICdTZWFyY2gnLFxuICAna2FnaS5jb20nOiAnU2VhcmNoJyxcbiAgJ2Vjb3NpYS5vcmcnOiAnU2VhcmNoJyxcblxuICAvLyBTb2NpYWxcbiAgJ2ZhY2Vib29rLmNvbSc6ICdTb2NpYWwnLFxuICAndHdpdHRlci5jb20nOiAnU29jaWFsJyxcbiAgJ3guY29tJzogJ1NvY2lhbCcsXG4gICdpbnN0YWdyYW0uY29tJzogJ1NvY2lhbCcsXG4gICdsaW5rZWRpbi5jb20nOiAnU29jaWFsJyxcbiAgJ3JlZGRpdC5jb20nOiAnU29jaWFsJyxcbiAgJ3Rpa3Rvay5jb20nOiAnU29jaWFsJyxcbiAgJ3BpbnRlcmVzdC5jb20nOiAnU29jaWFsJyxcbiAgJ3NuYXBjaGF0LmNvbSc6ICdTb2NpYWwnLFxuICAndHVtYmxyLmNvbSc6ICdTb2NpYWwnLFxuICAndGhyZWFkcy5uZXQnOiAnU29jaWFsJyxcbiAgJ2JsdWVza3kuYXBwJzogJ1NvY2lhbCcsXG4gICdtYXN0b2Rvbi5zb2NpYWwnOiAnU29jaWFsJyxcblxuICAvLyBWaWRlb1xuICAneW91dHViZS5jb20nOiAnVmlkZW8nLFxuICAneW91dHUuYmUnOiAnVmlkZW8nLFxuICAndmltZW8uY29tJzogJ1ZpZGVvJyxcbiAgJ3R3aXRjaC50dic6ICdWaWRlbycsXG4gICduZXRmbGl4LmNvbSc6ICdWaWRlbycsXG4gICdodWx1LmNvbSc6ICdWaWRlbycsXG4gICdkaXNuZXlwbHVzLmNvbSc6ICdWaWRlbycsXG4gICdkYWlseW1vdGlvbi5jb20nOiAnVmlkZW8nLFxuICAncHJpbWV2aWRlby5jb20nOiAnVmlkZW8nLFxuICAnaGJvbWF4LmNvbSc6ICdWaWRlbycsXG4gICdtYXguY29tJzogJ1ZpZGVvJyxcbiAgJ3BlYWNvY2t0di5jb20nOiAnVmlkZW8nLFxuXG4gIC8vIERldmVsb3BtZW50XG4gICdnaXRodWIuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2dpdGxhYi5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnc3RhY2tvdmVyZmxvdy5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnbnBtanMuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ3B5cGkub3JnJzogJ0RldmVsb3BtZW50JyxcbiAgJ2RldmVsb3Blci5tb3ppbGxhLm9yZyc6ICdEZXZlbG9wbWVudCcsXG4gICd3M3NjaG9vbHMuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2dlZWtzZm9yZ2Vla3Mub3JnJzogJ0RldmVsb3BtZW50JyxcbiAgJ2ppcmEuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2F0bGFzc2lhbi5uZXQnOiAnRGV2ZWxvcG1lbnQnLCAvLyBvZnRlbiBqaXJhXG4gICdiaXRidWNrZXQub3JnJzogJ0RldmVsb3BtZW50JyxcbiAgJ2Rldi50byc6ICdEZXZlbG9wbWVudCcsXG4gICdoYXNobm9kZS5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnbWVkaXVtLmNvbSc6ICdEZXZlbG9wbWVudCcsIC8vIEdlbmVyYWwgYnV0IG9mdGVuIGRldlxuICAndmVyY2VsLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICduZXRsaWZ5LmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdoZXJva3UuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2F3cy5hbWF6b24uY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2NvbnNvbGUuYXdzLmFtYXpvbi5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnY2xvdWQuZ29vZ2xlLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdhenVyZS5taWNyb3NvZnQuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ3BvcnRhbC5henVyZS5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnZG9ja2VyLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdrdWJlcm5ldGVzLmlvJzogJ0RldmVsb3BtZW50JyxcblxuICAvLyBOZXdzXG4gICdjbm4uY29tJzogJ05ld3MnLFxuICAnYmJjLmNvbSc6ICdOZXdzJyxcbiAgJ255dGltZXMuY29tJzogJ05ld3MnLFxuICAnd2FzaGluZ3RvbnBvc3QuY29tJzogJ05ld3MnLFxuICAndGhlZ3VhcmRpYW4uY29tJzogJ05ld3MnLFxuICAnZm9yYmVzLmNvbSc6ICdOZXdzJyxcbiAgJ2Jsb29tYmVyZy5jb20nOiAnTmV3cycsXG4gICdyZXV0ZXJzLmNvbSc6ICdOZXdzJyxcbiAgJ3dzai5jb20nOiAnTmV3cycsXG4gICdjbmJjLmNvbSc6ICdOZXdzJyxcbiAgJ2h1ZmZwb3N0LmNvbSc6ICdOZXdzJyxcbiAgJ25ld3MuZ29vZ2xlLmNvbSc6ICdOZXdzJyxcbiAgJ2ZveG5ld3MuY29tJzogJ05ld3MnLFxuICAnbmJjbmV3cy5jb20nOiAnTmV3cycsXG4gICdhYmNuZXdzLmdvLmNvbSc6ICdOZXdzJyxcbiAgJ3VzYXRvZGF5LmNvbSc6ICdOZXdzJyxcblxuICAvLyBTaG9wcGluZ1xuICAnYW1hem9uLmNvbSc6ICdTaG9wcGluZycsXG4gICdlYmF5LmNvbSc6ICdTaG9wcGluZycsXG4gICd3YWxtYXJ0LmNvbSc6ICdTaG9wcGluZycsXG4gICdldHN5LmNvbSc6ICdTaG9wcGluZycsXG4gICd0YXJnZXQuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ2Jlc3RidXkuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ2FsaWV4cHJlc3MuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ3Nob3BpZnkuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ3RlbXUuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ3NoZWluLmNvbSc6ICdTaG9wcGluZycsXG4gICd3YXlmYWlyLmNvbSc6ICdTaG9wcGluZycsXG4gICdjb3N0Y28uY29tJzogJ1Nob3BwaW5nJyxcblxuICAvLyBDb21tdW5pY2F0aW9uXG4gICdtYWlsLmdvb2dsZS5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICdvdXRsb29rLmxpdmUuY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnc2xhY2suY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnZGlzY29yZC5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICd6b29tLnVzJzogJ0NvbW11bmljYXRpb24nLFxuICAndGVhbXMubWljcm9zb2Z0LmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ3doYXRzYXBwLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ3RlbGVncmFtLm9yZyc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ21lc3Nlbmdlci5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICdza3lwZS5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG5cbiAgLy8gRmluYW5jZVxuICAncGF5cGFsLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2NoYXNlLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2JhbmtvZmFtZXJpY2EuY29tJzogJ0ZpbmFuY2UnLFxuICAnd2VsbHNmYXJnby5jb20nOiAnRmluYW5jZScsXG4gICdhbWVyaWNhbmV4cHJlc3MuY29tJzogJ0ZpbmFuY2UnLFxuICAnc3RyaXBlLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2NvaW5iYXNlLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2JpbmFuY2UuY29tJzogJ0ZpbmFuY2UnLFxuICAna3Jha2VuLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ3JvYmluaG9vZC5jb20nOiAnRmluYW5jZScsXG4gICdmaWRlbGl0eS5jb20nOiAnRmluYW5jZScsXG4gICd2YW5ndWFyZC5jb20nOiAnRmluYW5jZScsXG4gICdzY2h3YWIuY29tJzogJ0ZpbmFuY2UnLFxuICAnbWludC5pbnR1aXQuY29tJzogJ0ZpbmFuY2UnLFxuXG4gIC8vIEVkdWNhdGlvblxuICAnd2lraXBlZGlhLm9yZyc6ICdFZHVjYXRpb24nLFxuICAnY291cnNlcmEub3JnJzogJ0VkdWNhdGlvbicsXG4gICd1ZGVteS5jb20nOiAnRWR1Y2F0aW9uJyxcbiAgJ2VkeC5vcmcnOiAnRWR1Y2F0aW9uJyxcbiAgJ2toYW5hY2FkZW15Lm9yZyc6ICdFZHVjYXRpb24nLFxuICAncXVpemxldC5jb20nOiAnRWR1Y2F0aW9uJyxcbiAgJ2R1b2xpbmdvLmNvbSc6ICdFZHVjYXRpb24nLFxuICAnY2FudmFzLmluc3RydWN0dXJlLmNvbSc6ICdFZHVjYXRpb24nLFxuICAnYmxhY2tib2FyZC5jb20nOiAnRWR1Y2F0aW9uJyxcbiAgJ21pdC5lZHUnOiAnRWR1Y2F0aW9uJyxcbiAgJ2hhcnZhcmQuZWR1JzogJ0VkdWNhdGlvbicsXG4gICdzdGFuZm9yZC5lZHUnOiAnRWR1Y2F0aW9uJyxcbiAgJ2FjYWRlbWlhLmVkdSc6ICdFZHVjYXRpb24nLFxuICAncmVzZWFyY2hnYXRlLm5ldCc6ICdFZHVjYXRpb24nLFxuXG4gIC8vIERlc2lnblxuICAnZmlnbWEuY29tJzogJ0Rlc2lnbicsXG4gICdjYW52YS5jb20nOiAnRGVzaWduJyxcbiAgJ2JlaGFuY2UubmV0JzogJ0Rlc2lnbicsXG4gICdkcmliYmJsZS5jb20nOiAnRGVzaWduJyxcbiAgJ2Fkb2JlLmNvbSc6ICdEZXNpZ24nLFxuICAndW5zcGxhc2guY29tJzogJ0Rlc2lnbicsXG4gICdwZXhlbHMuY29tJzogJ0Rlc2lnbicsXG4gICdwaXhhYmF5LmNvbSc6ICdEZXNpZ24nLFxuICAnc2h1dHRlcnN0b2NrLmNvbSc6ICdEZXNpZ24nLFxuXG4gIC8vIFByb2R1Y3Rpdml0eVxuICAnZG9jcy5nb29nbGUuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdzaGVldHMuZ29vZ2xlLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnc2xpZGVzLmdvb2dsZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2RyaXZlLmdvb2dsZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ25vdGlvbi5zbyc6ICdQcm9kdWN0aXZpdHknLFxuICAndHJlbGxvLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnYXNhbmEuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdtb25kYXkuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdhaXJ0YWJsZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2V2ZXJub3RlLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnZHJvcGJveC5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2NsaWNrdXAuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdsaW5lYXIuYXBwJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdtaXJvLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnbHVjaWRjaGFydC5jb20nOiAnUHJvZHVjdGl2aXR5JyxcblxuICAvLyBBSVxuICAnb3BlbmFpLmNvbSc6ICdBSScsXG4gICdjaGF0Z3B0LmNvbSc6ICdBSScsXG4gICdhbnRocm9waWMuY29tJzogJ0FJJyxcbiAgJ21pZGpvdXJuZXkuY29tJzogJ0FJJyxcbiAgJ2h1Z2dpbmdmYWNlLmNvJzogJ0FJJyxcbiAgJ2JhcmQuZ29vZ2xlLmNvbSc6ICdBSScsXG4gICdnZW1pbmkuZ29vZ2xlLmNvbSc6ICdBSScsXG4gICdjbGF1ZGUuYWknOiAnQUknLFxuICAncGVycGxleGl0eS5haSc6ICdBSScsXG4gICdwb2UuY29tJzogJ0FJJyxcblxuICAvLyBNdXNpYy9BdWRpb1xuICAnc3BvdGlmeS5jb20nOiAnTXVzaWMnLFxuICAnc291bmRjbG91ZC5jb20nOiAnTXVzaWMnLFxuICAnbXVzaWMuYXBwbGUuY29tJzogJ011c2ljJyxcbiAgJ3BhbmRvcmEuY29tJzogJ011c2ljJyxcbiAgJ3RpZGFsLmNvbSc6ICdNdXNpYycsXG4gICdiYW5kY2FtcC5jb20nOiAnTXVzaWMnLFxuICAnYXVkaWJsZS5jb20nOiAnTXVzaWMnLFxuXG4gIC8vIEdhbWluZ1xuICAnc3RlYW1wb3dlcmVkLmNvbSc6ICdHYW1pbmcnLFxuICAncm9ibG94LmNvbSc6ICdHYW1pbmcnLFxuICAnZXBpY2dhbWVzLmNvbSc6ICdHYW1pbmcnLFxuICAneGJveC5jb20nOiAnR2FtaW5nJyxcbiAgJ3BsYXlzdGF0aW9uLmNvbSc6ICdHYW1pbmcnLFxuICAnbmludGVuZG8uY29tJzogJ0dhbWluZycsXG4gICdpZ24uY29tJzogJ0dhbWluZycsXG4gICdnYW1lc3BvdC5jb20nOiAnR2FtaW5nJyxcbiAgJ2tvdGFrdS5jb20nOiAnR2FtaW5nJyxcbiAgJ3BvbHlnb24uY29tJzogJ0dhbWluZydcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRHZW5lcmEoaG9zdG5hbWU6IHN0cmluZywgY3VzdG9tUmVnaXN0cnk/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogc3RyaW5nIHwgbnVsbCB7XG4gIGlmICghaG9zdG5hbWUpIHJldHVybiBudWxsO1xuXG4gIC8vIDAuIENoZWNrIGN1c3RvbSByZWdpc3RyeSBmaXJzdFxuICBpZiAoY3VzdG9tUmVnaXN0cnkpIHtcbiAgICAgIGNvbnN0IHBhcnRzID0gaG9zdG5hbWUuc3BsaXQoJy4nKTtcbiAgICAgIC8vIENoZWNrIGZ1bGwgaG9zdG5hbWUgYW5kIHByb2dyZXNzaXZlbHkgc2hvcnRlciBzdWZmaXhlc1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwYXJ0cy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgICAgICBjb25zdCBkb21haW4gPSBwYXJ0cy5zbGljZShpKS5qb2luKCcuJyk7XG4gICAgICAgICAgaWYgKGN1c3RvbVJlZ2lzdHJ5W2RvbWFpbl0pIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGN1c3RvbVJlZ2lzdHJ5W2RvbWFpbl07XG4gICAgICAgICAgfVxuICAgICAgfVxuICB9XG5cbiAgLy8gMS4gRXhhY3QgbWF0Y2hcbiAgaWYgKEdFTkVSQV9SRUdJU1RSWVtob3N0bmFtZV0pIHtcbiAgICByZXR1cm4gR0VORVJBX1JFR0lTVFJZW2hvc3RuYW1lXTtcbiAgfVxuXG4gIC8vIDIuIFN1YmRvbWFpbiBjaGVjayAoc3RyaXBwaW5nIHN1YmRvbWFpbnMpXG4gIC8vIGUuZy4gXCJjb25zb2xlLmF3cy5hbWF6b24uY29tXCIgLT4gXCJhd3MuYW1hem9uLmNvbVwiIC0+IFwiYW1hem9uLmNvbVwiXG4gIGNvbnN0IHBhcnRzID0gaG9zdG5hbWUuc3BsaXQoJy4nKTtcblxuICAvLyBUcnkgbWF0Y2hpbmcgcHJvZ3Jlc3NpdmVseSBzaG9ydGVyIHN1ZmZpeGVzXG4gIC8vIGUuZy4gYS5iLmMuY29tIC0+IGIuYy5jb20gLT4gYy5jb21cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBwYXJ0cy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgIGNvbnN0IGRvbWFpbiA9IHBhcnRzLnNsaWNlKGkpLmpvaW4oJy4nKTtcbiAgICAgIGlmIChHRU5FUkFfUkVHSVNUUllbZG9tYWluXSkge1xuICAgICAgICAgIHJldHVybiBHRU5FUkFfUkVHSVNUUllbZG9tYWluXTtcbiAgICAgIH1cbiAgfVxuXG4gIHJldHVybiBudWxsO1xufVxuIiwgImltcG9ydCB7IGVzY2FwZUh0bWwgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5pbXBvcnQgeyBnZXREcmFnQWZ0ZXJFbGVtZW50IH0gZnJvbSBcIi4uL2NvbW1vbi5qc1wiO1xuaW1wb3J0IHsgYXBwU3RhdGUgfSBmcm9tIFwiLi9zdGF0ZS5qc1wiO1xuaW1wb3J0IHsgR0VORVJBX1JFR0lTVFJZIH0gZnJvbSBcIi4uLy4uL2JhY2tncm91bmQvZXh0cmFjdGlvbi9nZW5lcmFSZWdpc3RyeS5qc1wiO1xuaW1wb3J0IHtcbiAgZG9tYWluRnJvbVVybCxcbiAgc2VtYW50aWNCdWNrZXQsXG4gIG5hdmlnYXRpb25LZXksXG4gIGdyb3VwaW5nS2V5XG59IGZyb20gXCIuLi8uLi9iYWNrZ3JvdW5kL2dyb3VwaW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHtcbiAgcmVjZW5jeVNjb3JlLFxuICBoaWVyYXJjaHlTY29yZSxcbiAgcGlubmVkU2NvcmUsXG4gIGNvbXBhcmVCeVxufSBmcm9tIFwiLi4vLi4vYmFja2dyb3VuZC9zb3J0aW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgU1RSQVRFR0lFUywgU3RyYXRlZ3lEZWZpbml0aW9uLCBnZXRTdHJhdGVnaWVzIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC9zdHJhdGVneVJlZ2lzdHJ5LmpzXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBzaG93TW9kYWwodGl0bGU6IHN0cmluZywgY29udGVudDogSFRNTEVsZW1lbnQgfCBzdHJpbmcpIHtcbiAgICBjb25zdCBtb2RhbE92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBtb2RhbE92ZXJsYXkuY2xhc3NOYW1lID0gJ21vZGFsLW92ZXJsYXknO1xuICAgIG1vZGFsT3ZlcmxheS5pbm5lckhUTUwgPSBgXG4gICAgICAgIDxkaXYgY2xhc3M9XCJtb2RhbFwiPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cIm1vZGFsLWhlYWRlclwiPlxuICAgICAgICAgICAgICAgIDxoMz4ke2VzY2FwZUh0bWwodGl0bGUpfTwvaDM+XG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cIm1vZGFsLWNsb3NlXCI+JnRpbWVzOzwvYnV0dG9uPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwibW9kYWwtY29udGVudFwiPjwvZGl2PlxuICAgICAgICA8L2Rpdj5cbiAgICBgO1xuXG4gICAgY29uc3QgY29udGVudENvbnRhaW5lciA9IG1vZGFsT3ZlcmxheS5xdWVyeVNlbGVjdG9yKCcubW9kYWwtY29udGVudCcpIGFzIEhUTUxFbGVtZW50O1xuICAgIGlmICh0eXBlb2YgY29udGVudCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgY29udGVudENvbnRhaW5lci5pbm5lckhUTUwgPSBjb250ZW50O1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnRlbnRDb250YWluZXIuYXBwZW5kQ2hpbGQoY29udGVudCk7XG4gICAgfVxuXG4gICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChtb2RhbE92ZXJsYXkpO1xuXG4gICAgY29uc3QgY2xvc2VCdG4gPSBtb2RhbE92ZXJsYXkucXVlcnlTZWxlY3RvcignLm1vZGFsLWNsb3NlJyk7XG4gICAgY2xvc2VCdG4/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICBkb2N1bWVudC5ib2R5LnJlbW92ZUNoaWxkKG1vZGFsT3ZlcmxheSk7XG4gICAgfSk7XG5cbiAgICBtb2RhbE92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgICAgICBpZiAoZS50YXJnZXQgPT09IG1vZGFsT3ZlcmxheSkge1xuICAgICAgICAgICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlQ2hpbGQobW9kYWxPdmVybGF5KTtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkRG5ETGlzdGVuZXJzKHJvdzogSFRNTEVsZW1lbnQsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcbiAgcm93LmFkZEV2ZW50TGlzdGVuZXIoJ2RyYWdzdGFydCcsIChlKSA9PiB7XG4gICAgcm93LmNsYXNzTGlzdC5hZGQoJ2RyYWdnaW5nJyk7XG4gICAgaWYgKGUuZGF0YVRyYW5zZmVyKSB7XG4gICAgICAgIGUuZGF0YVRyYW5zZmVyLmVmZmVjdEFsbG93ZWQgPSAnbW92ZSc7XG4gICAgICAgIC8vIFNldCBhIHRyYW5zcGFyZW50IGltYWdlIG9yIHNpbWlsYXIgaWYgZGVzaXJlZCwgYnV0IGRlZmF1bHQgaXMgdXN1YWxseSBmaW5lXG4gICAgfVxuICB9KTtcblxuICByb3cuYWRkRXZlbnRMaXN0ZW5lcignZHJhZ2VuZCcsICgpID0+IHtcbiAgICByb3cuY2xhc3NMaXN0LnJlbW92ZSgnZHJhZ2dpbmcnKTtcbiAgfSk7XG5cbiAgLy8gVGhlIGNvbnRhaW5lciBoYW5kbGVzIHRoZSBkcm9wIHpvbmUgbG9naWMgdmlhIGRyYWdvdmVyXG4gIGNvbnRhaW5lci5hZGRFdmVudExpc3RlbmVyKCdkcmFnb3ZlcicsIChlKSA9PiB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGNvbnN0IGFmdGVyRWxlbWVudCA9IGdldERyYWdBZnRlckVsZW1lbnQoY29udGFpbmVyLCBlLmNsaWVudFksICcuc3RyYXRlZ3ktcm93Om5vdCguZHJhZ2dpbmcpJyk7XG4gICAgY29uc3QgZHJhZ2dhYmxlID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5kcmFnZ2luZycpO1xuICAgIGlmIChkcmFnZ2FibGUpIHtcbiAgICAgIGlmIChhZnRlckVsZW1lbnQgPT0gbnVsbCkge1xuICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoZHJhZ2dhYmxlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnRhaW5lci5pbnNlcnRCZWZvcmUoZHJhZ2dhYmxlLCBhZnRlckVsZW1lbnQpO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzaG93U3RyYXRlZ3lEZXRhaWxzKHR5cGU6IHN0cmluZywgbmFtZTogc3RyaW5nKSB7XG4gICAgbGV0IGNvbnRlbnQgPSBcIlwiO1xuICAgIGxldCB0aXRsZSA9IGAke25hbWV9ICgke3R5cGV9KWA7XG5cbiAgICBpZiAodHlwZSA9PT0gJ2dyb3VwaW5nJykge1xuICAgICAgICBpZiAobmFtZSA9PT0gJ2RvbWFpbicpIHtcbiAgICAgICAgICAgIGNvbnRlbnQgPSBgXG48aDM+TG9naWM6IERvbWFpbiBFeHRyYWN0aW9uPC9oMz5cbjxwcmU+PGNvZGU+JHtlc2NhcGVIdG1sKGRvbWFpbkZyb21VcmwudG9TdHJpbmcoKSl9PC9jb2RlPjwvcHJlPlxuPGgzPkxvZ2ljOiBHcm91cGluZyBLZXk8L2gzPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwoZ3JvdXBpbmdLZXkudG9TdHJpbmcoKSl9PC9jb2RlPjwvcHJlPlxuICAgICAgICAgICAgYDtcbiAgICAgICAgfSBlbHNlIGlmIChuYW1lID09PSAndG9waWMnKSB7XG4gICAgICAgICAgICBjb250ZW50ID0gYFxuPGgzPkxvZ2ljOiBTZW1hbnRpYyBCdWNrZXRpbmc8L2gzPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwoc2VtYW50aWNCdWNrZXQudG9TdHJpbmcoKSl9PC9jb2RlPjwvcHJlPlxuPGgzPkxvZ2ljOiBHcm91cGluZyBLZXk8L2gzPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwoZ3JvdXBpbmdLZXkudG9TdHJpbmcoKSl9PC9jb2RlPjwvcHJlPlxuICAgICAgICAgICAgYDtcbiAgICAgICAgfSBlbHNlIGlmIChuYW1lID09PSAnbGluZWFnZScpIHtcbiAgICAgICAgICAgIGNvbnRlbnQgPSBgXG48aDM+TG9naWM6IE5hdmlnYXRpb24gS2V5PC9oMz5cbjxwcmU+PGNvZGU+JHtlc2NhcGVIdG1sKG5hdmlnYXRpb25LZXkudG9TdHJpbmcoKSl9PC9jb2RlPjwvcHJlPlxuPGgzPkxvZ2ljOiBHcm91cGluZyBLZXk8L2gzPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwoZ3JvdXBpbmdLZXkudG9TdHJpbmcoKSl9PC9jb2RlPjwvcHJlPlxuICAgICAgICAgICAgYDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIENoZWNrIGZvciBjdXN0b20gc3RyYXRlZ3kgZGV0YWlsc1xuICAgICAgICAgICAgY29uc3QgY3VzdG9tID0gYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBuYW1lKTtcbiAgICAgICAgICAgIGlmIChjdXN0b20pIHtcbiAgICAgICAgICAgICAgICBjb250ZW50ID0gYFxuPGgzPkN1c3RvbSBTdHJhdGVneTogJHtlc2NhcGVIdG1sKGN1c3RvbS5sYWJlbCl9PC9oMz5cbjxwPjxiPkNvbmZpZ3VyYXRpb246PC9iPjwvcD5cbjxwcmU+PGNvZGU+JHtlc2NhcGVIdG1sKEpTT04uc3RyaW5naWZ5KGN1c3RvbSwgbnVsbCwgMikpfTwvY29kZT48L3ByZT5cbjxoMz5Mb2dpYzogR3JvdXBpbmcgS2V5PC9oMz5cbjxwcmU+PGNvZGU+JHtlc2NhcGVIdG1sKGdyb3VwaW5nS2V5LnRvU3RyaW5nKCkpfTwvY29kZT48L3ByZT5cbiAgICAgICAgICAgICAgICBgO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb250ZW50ID0gYFxuPGgzPkxvZ2ljOiBHcm91cGluZyBLZXk8L2gzPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwoZ3JvdXBpbmdLZXkudG9TdHJpbmcoKSl9PC9jb2RlPjwvcHJlPlxuICAgICAgICAgICAgICAgIGA7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdzb3J0aW5nJykge1xuICAgICAgICBjb250ZW50ID0gYFxuPGgzPkxvZ2ljOiBDb21wYXJpc29uIEZ1bmN0aW9uPC9oMz5cbjxwcmU+PGNvZGU+JHtlc2NhcGVIdG1sKGNvbXBhcmVCeS50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+XG4gICAgICAgIGA7XG5cbiAgICAgICAgaWYgKG5hbWUgPT09ICdyZWNlbmN5Jykge1xuICAgICAgICAgICAgIGNvbnRlbnQgKz0gYDxoMz5Mb2dpYzogUmVjZW5jeSBTY29yZTwvaDM+PHByZT48Y29kZT4ke2VzY2FwZUh0bWwocmVjZW5jeVNjb3JlLnRvU3RyaW5nKCkpfTwvY29kZT48L3ByZT5gO1xuICAgICAgICB9IGVsc2UgaWYgKG5hbWUgPT09ICduZXN0aW5nJykge1xuICAgICAgICAgICAgIGNvbnRlbnQgKz0gYDxoMz5Mb2dpYzogSGllcmFyY2h5IFNjb3JlPC9oMz48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChoaWVyYXJjaHlTY29yZS50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+YDtcbiAgICAgICAgfSBlbHNlIGlmIChuYW1lID09PSAncGlubmVkJykge1xuICAgICAgICAgICAgIGNvbnRlbnQgKz0gYDxoMz5Mb2dpYzogUGlubmVkIFNjb3JlPC9oMz48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChwaW5uZWRTY29yZS50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+YDtcbiAgICAgICAgfVxuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3JlZ2lzdHJ5JyAmJiBuYW1lID09PSAnZ2VuZXJhJykge1xuICAgICAgICBjb25zdCBqc29uID0gSlNPTi5zdHJpbmdpZnkoR0VORVJBX1JFR0lTVFJZLCBudWxsLCAyKTtcbiAgICAgICAgY29udGVudCA9IGBcbjxoMz5HZW5lcmEgUmVnaXN0cnkgRGF0YTwvaDM+XG48cD5NYXBwaW5nIG9mIGRvbWFpbiBuYW1lcyB0byBjYXRlZ29yaWVzLjwvcD5cbjxwcmU+PGNvZGU+JHtlc2NhcGVIdG1sKGpzb24pfTwvY29kZT48L3ByZT5cbiAgICAgICAgYDtcbiAgICB9XG5cbiAgICBzaG93TW9kYWwodGl0bGUsIGNvbnRlbnQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyQWxnb3JpdGhtc1ZpZXcoKSB7XG4gIGNvbnN0IGdyb3VwaW5nUmVmID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dyb3VwaW5nLXJlZicpO1xuICBjb25zdCBzb3J0aW5nUmVmID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NvcnRpbmctcmVmJyk7XG5cbiAgaWYgKGdyb3VwaW5nUmVmKSB7XG4gICAgICAvLyBSZS1yZW5kZXIgYmVjYXVzZSBzdHJhdGVneSBsaXN0IG1pZ2h0IGNoYW5nZVxuICAgICAgY29uc3QgYWxsU3RyYXRlZ2llczogU3RyYXRlZ3lEZWZpbml0aW9uW10gPSBnZXRTdHJhdGVnaWVzKGFwcFN0YXRlLmxvY2FsQ3VzdG9tU3RyYXRlZ2llcyk7XG4gICAgICBjb25zdCBncm91cGluZ3MgPSBhbGxTdHJhdGVnaWVzLmZpbHRlcihzID0+IHMuaXNHcm91cGluZyk7XG5cbiAgICAgIGdyb3VwaW5nUmVmLmlubmVySFRNTCA9IGdyb3VwaW5ncy5tYXAoZyA9PiB7XG4gICAgICAgICBjb25zdCBpc0N1c3RvbSA9IGFwcFN0YXRlLmxvY2FsQ3VzdG9tU3RyYXRlZ2llcy5zb21lKHMgPT4gcy5pZCA9PT0gZy5pZCk7XG4gICAgICAgICBsZXQgZGVzYyA9IFwiQnVpbHQtaW4gc3RyYXRlZ3lcIjtcbiAgICAgICAgIGlmIChpc0N1c3RvbSkgZGVzYyA9IFwiQ3VzdG9tIHN0cmF0ZWd5IGRlZmluZWQgYnkgcnVsZXMuXCI7XG4gICAgICAgICBlbHNlIGlmIChnLmlkID09PSAnZG9tYWluJykgZGVzYyA9ICdHcm91cHMgdGFicyBieSB0aGVpciBkb21haW4gbmFtZS4nO1xuICAgICAgICAgZWxzZSBpZiAoZy5pZCA9PT0gJ3RvcGljJykgZGVzYyA9ICdHcm91cHMgYmFzZWQgb24ga2V5d29yZHMgaW4gdGhlIHRpdGxlLic7XG5cbiAgICAgICAgIHJldHVybiBgXG4gICAgICAgICAgPGRpdiBjbGFzcz1cInN0cmF0ZWd5LWl0ZW1cIj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJzdHJhdGVneS1uYW1lXCI+JHtnLmxhYmVsfSAoJHtnLmlkfSkgJHtpc0N1c3RvbSA/ICc8c3BhbiBzdHlsZT1cImNvbG9yOiBibHVlOyBmb250LXNpemU6IDAuOGVtO1wiPkN1c3RvbTwvc3Bhbj4nIDogJyd9PC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwic3RyYXRlZ3ktZGVzY1wiPiR7ZGVzY308L2Rpdj5cbiAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJzdHJhdGVneS12aWV3LWJ0blwiIGRhdGEtdHlwZT1cImdyb3VwaW5nXCIgZGF0YS1uYW1lPVwiJHtnLmlkfVwiPlZpZXcgTG9naWM8L2J1dHRvbj5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgYDtcbiAgICAgIH0pLmpvaW4oJycpO1xuICB9XG5cbiAgaWYgKHNvcnRpbmdSZWYpIHtcbiAgICAvLyBSZS1yZW5kZXIgc29ydGluZyBzdHJhdGVnaWVzIHRvb1xuICAgIGNvbnN0IGFsbFN0cmF0ZWdpZXM6IFN0cmF0ZWd5RGVmaW5pdGlvbltdID0gZ2V0U3RyYXRlZ2llcyhhcHBTdGF0ZS5sb2NhbEN1c3RvbVN0cmF0ZWdpZXMpO1xuICAgIGNvbnN0IHNvcnRpbmdzID0gYWxsU3RyYXRlZ2llcy5maWx0ZXIocyA9PiBzLmlzU29ydGluZyk7XG5cbiAgICBzb3J0aW5nUmVmLmlubmVySFRNTCA9IHNvcnRpbmdzLm1hcChzID0+IHtcbiAgICAgICAgbGV0IGRlc2MgPSBcIkJ1aWx0LWluIHNvcnRpbmdcIjtcbiAgICAgICAgaWYgKHMuaWQgPT09ICdyZWNlbmN5JykgZGVzYyA9ICdTb3J0cyBieSBsYXN0IGFjY2Vzc2VkIHRpbWUgKG1vc3QgcmVjZW50IGZpcnN0KS4nO1xuICAgICAgICBlbHNlIGlmIChzLmlkID09PSAnbmVzdGluZycpIGRlc2MgPSAnU29ydHMgYmFzZWQgb24gaGllcmFyY2h5IChyb290cyB2cyBjaGlsZHJlbikuJztcbiAgICAgICAgZWxzZSBpZiAocy5pZCA9PT0gJ3Bpbm5lZCcpIGRlc2MgPSAnS2VlcHMgcGlubmVkIHRhYnMgYXQgdGhlIGJlZ2lubmluZyBvZiB0aGUgbGlzdC4nO1xuXG4gICAgICAgIHJldHVybiBgXG4gICAgICA8ZGl2IGNsYXNzPVwic3RyYXRlZ3ktaXRlbVwiPlxuICAgICAgICA8ZGl2IGNsYXNzPVwic3RyYXRlZ3ktbmFtZVwiPiR7cy5sYWJlbH08L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzcz1cInN0cmF0ZWd5LWRlc2NcIj4ke2Rlc2N9PC9kaXY+XG4gICAgICAgIDxidXR0b24gY2xhc3M9XCJzdHJhdGVneS12aWV3LWJ0blwiIGRhdGEtdHlwZT1cInNvcnRpbmdcIiBkYXRhLW5hbWU9XCIke3MuaWR9XCI+VmlldyBMb2dpYzwvYnV0dG9uPlxuICAgICAgPC9kaXY+XG4gICAgYDtcbiAgICB9KS5qb2luKCcnKTtcbiAgfVxuXG4gIGNvbnN0IHJlZ2lzdHJ5UmVmID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3JlZ2lzdHJ5LXJlZicpO1xuICBpZiAocmVnaXN0cnlSZWYgJiYgcmVnaXN0cnlSZWYuY2hpbGRyZW4ubGVuZ3RoID09PSAwKSB7XG4gICAgICByZWdpc3RyeVJlZi5pbm5lckhUTUwgPSBgXG4gICAgICAgIDxkaXYgY2xhc3M9XCJzdHJhdGVneS1pdGVtXCI+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwic3RyYXRlZ3ktbmFtZVwiPkdlbmVyYSBSZWdpc3RyeTwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInN0cmF0ZWd5LWRlc2NcIj5TdGF0aWMgbG9va3VwIHRhYmxlIGZvciBkb21haW4gY2xhc3NpZmljYXRpb24gKGFwcHJveCAke09iamVjdC5rZXlzKEdFTkVSQV9SRUdJU1RSWSkubGVuZ3RofSBlbnRyaWVzKS48L2Rpdj5cbiAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJzdHJhdGVneS12aWV3LWJ0blwiIGRhdGEtdHlwZT1cInJlZ2lzdHJ5XCIgZGF0YS1uYW1lPVwiZ2VuZXJhXCI+VmlldyBUYWJsZTwvYnV0dG9uPlxuICAgICAgICA8L2Rpdj5cbiAgICAgIGA7XG4gIH1cbn1cbiIsICJpbXBvcnQgeyBhcHBTdGF0ZSB9IGZyb20gXCIuL3N0YXRlLmpzXCI7XG5pbXBvcnQgeyBnZXRNYXBwZWRUYWJzIH0gZnJvbSBcIi4vZGF0YS5qc1wiO1xuaW1wb3J0IHsgbG9hZFRhYnMgfSBmcm9tIFwiLi90YWJzVGFibGUuanNcIjtcbmltcG9ydCB7IGFkZERuRExpc3RlbmVycyB9IGZyb20gXCIuL2NvbXBvbmVudHMuanNcIjtcbmltcG9ydCB7IGdldFN0cmF0ZWdpZXMsIFN0cmF0ZWd5RGVmaW5pdGlvbiB9IGZyb20gXCIuLi8uLi9zaGFyZWQvc3RyYXRlZ3lSZWdpc3RyeS5qc1wiO1xuaW1wb3J0IHsgc29ydFRhYnMsIGNvbXBhcmVCeSwgY29tcGFyZUJ5U29ydGluZ1J1bGVzIH0gZnJvbSBcIi4uLy4uL2JhY2tncm91bmQvc29ydGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IGdyb3VwVGFicywgZ2V0Q3VzdG9tU3RyYXRlZ2llcyB9IGZyb20gXCIuLi8uLi9iYWNrZ3JvdW5kL2dyb3VwaW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgU29ydGluZ1N0cmF0ZWd5IH0gZnJvbSBcIi4uLy4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgZXNjYXBlSHRtbCB9IGZyb20gXCIuLi8uLi9zaGFyZWQvdXRpbHMuanNcIjtcbmltcG9ydCB7IGdldEhvc3RuYW1lIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC91cmxDYWNoZS5qc1wiO1xuXG5leHBvcnQgZnVuY3Rpb24gcnVuU2ltdWxhdGlvbigpIHtcbiAgY29uc3QgZ3JvdXBpbmdMaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpbS1ncm91cGluZy1saXN0Jyk7XG4gIGNvbnN0IHNvcnRpbmdMaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpbS1zb3J0aW5nLWxpc3QnKTtcbiAgY29uc3QgcmVzdWx0Q29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpbVJlc3VsdHMnKTtcblxuICBpZiAoIWdyb3VwaW5nTGlzdCB8fCAhc29ydGluZ0xpc3QgfHwgIXJlc3VsdENvbnRhaW5lcikgcmV0dXJuO1xuXG4gIGNvbnN0IGdyb3VwaW5nU3RyYXRzID0gZ2V0RW5hYmxlZFN0cmF0ZWdpZXNGcm9tVUkoZ3JvdXBpbmdMaXN0KTtcbiAgY29uc3Qgc29ydGluZ1N0cmF0cyA9IGdldEVuYWJsZWRTdHJhdGVnaWVzRnJvbVVJKHNvcnRpbmdMaXN0KTtcblxuICAvLyBDb21iaW5lIHN0cmF0ZWdpZXMgdG8gbWF0Y2ggTGl2ZSBiZWhhdmlvciAod2hpY2ggdXNlcyBhIHNpbmdsZSBsaXN0KVxuICAvLyBEZWR1cGxpY2F0ZSB3aGlsZSBwcmVzZXJ2aW5nIG9yZGVyIChncm91cGluZyBmaXJzdCwgdGhlbiBzb3J0aW5nKVxuICBjb25zdCBjb21iaW5lZFN0cmF0ZWdpZXMgPSBBcnJheS5mcm9tKG5ldyBTZXQoWy4uLmdyb3VwaW5nU3RyYXRzLCAuLi5zb3J0aW5nU3RyYXRzXSkpO1xuXG4gIC8vIFByZXBhcmUgZGF0YVxuICBsZXQgdGFicyA9IGdldE1hcHBlZFRhYnMoKTtcblxuICAvLyAxLiBHcm91cCAob24gcmF3IHRhYnMsIG1hdGNoaW5nIExpdmUgYmVoYXZpb3IpXG4gIGNvbnN0IGdyb3VwcyA9IGdyb3VwVGFicyh0YWJzLCBjb21iaW5lZFN0cmF0ZWdpZXMpO1xuXG4gIC8vIDIuIFNvcnQgdGFicyB3aXRoaW4gZ3JvdXBzXG4gIGdyb3Vwcy5mb3JFYWNoKGdyb3VwID0+IHtcbiAgICAgIGdyb3VwLnRhYnMgPSBzb3J0VGFicyhncm91cC50YWJzLCBjb21iaW5lZFN0cmF0ZWdpZXMpO1xuICB9KTtcblxuICAvLyAzLiBTb3J0IEdyb3Vwc1xuICAvLyBDaGVjayBmb3IgZ3JvdXAgc29ydGluZyBzdHJhdGVneSBpbiB0aGUgYWN0aXZlIGxpc3RcbiAgY29uc3QgY3VzdG9tU3RyYXRzID0gZ2V0Q3VzdG9tU3RyYXRlZ2llcygpO1xuICBsZXQgZ3JvdXBTb3J0ZXJTdHJhdGVneSA9IG51bGw7XG5cbiAgZm9yIChjb25zdCBpZCBvZiBjb21iaW5lZFN0cmF0ZWdpZXMpIHtcbiAgICAgIGNvbnN0IHN0cmF0ZWd5ID0gY3VzdG9tU3RyYXRzLmZpbmQocyA9PiBzLmlkID09PSBpZCk7XG4gICAgICBpZiAoc3RyYXRlZ3kgJiYgKHN0cmF0ZWd5LnNvcnRHcm91cHMgfHwgKHN0cmF0ZWd5Lmdyb3VwU29ydGluZ1J1bGVzICYmIHN0cmF0ZWd5Lmdyb3VwU29ydGluZ1J1bGVzLmxlbmd0aCA+IDApKSkge1xuICAgICAgICAgIGdyb3VwU29ydGVyU3RyYXRlZ3kgPSBzdHJhdGVneTtcbiAgICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgfVxuXG4gIGlmIChncm91cFNvcnRlclN0cmF0ZWd5KSB7XG4gICAgICBncm91cHMuc29ydCgoZ0EsIGdCKSA9PiB7XG4gICAgICAgICAgLy8gUHJpbWFyeTogS2VlcCB3aW5kb3dzIHRvZ2V0aGVyXG4gICAgICAgICAgaWYgKGdBLndpbmRvd0lkICE9PSBnQi53aW5kb3dJZCkgcmV0dXJuIGdBLndpbmRvd0lkIC0gZ0Iud2luZG93SWQ7XG5cbiAgICAgICAgICAvLyBTZWNvbmRhcnk6IFNvcnQgYnkgc3RyYXRlZ3kgdXNpbmcgcmVwcmVzZW50YXRpdmUgdGFiIChmaXJzdCB0YWIpXG4gICAgICAgICAgY29uc3QgcmVwQSA9IGdBLnRhYnNbMF07XG4gICAgICAgICAgY29uc3QgcmVwQiA9IGdCLnRhYnNbMF07XG5cbiAgICAgICAgICBpZiAoIXJlcEEgJiYgIXJlcEIpIHJldHVybiAwO1xuICAgICAgICAgIGlmICghcmVwQSkgcmV0dXJuIDE7XG4gICAgICAgICAgaWYgKCFyZXBCKSByZXR1cm4gLTE7XG5cbiAgICAgICAgICBpZiAoZ3JvdXBTb3J0ZXJTdHJhdGVneS5ncm91cFNvcnRpbmdSdWxlcyAmJiBncm91cFNvcnRlclN0cmF0ZWd5Lmdyb3VwU29ydGluZ1J1bGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgIHJldHVybiBjb21wYXJlQnlTb3J0aW5nUnVsZXMoZ3JvdXBTb3J0ZXJTdHJhdGVneS5ncm91cFNvcnRpbmdSdWxlcywgcmVwQSwgcmVwQik7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgIHJldHVybiBjb21wYXJlQnkoZ3JvdXBTb3J0ZXJTdHJhdGVneS5pZCwgcmVwQSwgcmVwQik7XG4gICAgICAgICAgfVxuICAgICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgICAvLyBEZWZhdWx0OiBTb3J0IGJ5IHdpbmRvd0lkIHRvIGtlZXAgZGlzcGxheSBvcmdhbml6ZWRcbiAgICAgIGdyb3Vwcy5zb3J0KChhLCBiKSA9PiBhLndpbmRvd0lkIC0gYi53aW5kb3dJZCk7XG4gIH1cblxuICAvLyA0LiBSZW5kZXJcbiAgaWYgKGdyb3Vwcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJlc3VsdENvbnRhaW5lci5pbm5lckhUTUwgPSAnPHA+Tm8gZ3JvdXBzIGNyZWF0ZWQgKGFyZSB0aGVyZSBhbnkgdGFicz8pLjwvcD4nO1xuICAgICAgcmV0dXJuO1xuICB9XG5cbiAgcmVzdWx0Q29udGFpbmVyLmlubmVySFRNTCA9IGdyb3Vwcy5tYXAoZ3JvdXAgPT4gYFxuICAgIDxkaXYgY2xhc3M9XCJncm91cC1yZXN1bHRcIj5cbiAgICAgIDxkaXYgY2xhc3M9XCJncm91cC1oZWFkZXJcIiBzdHlsZT1cImJvcmRlci1sZWZ0OiA1cHggc29saWQgJHtncm91cC5jb2xvcn1cIj5cbiAgICAgICAgPHNwYW4+JHtlc2NhcGVIdG1sKGdyb3VwLmxhYmVsIHx8ICdVbmdyb3VwZWQnKX08L3NwYW4+XG4gICAgICAgIDxzcGFuIGNsYXNzPVwiZ3JvdXAtbWV0YVwiPiR7Z3JvdXAudGFicy5sZW5ndGh9IHRhYnMgJmJ1bGw7IFJlYXNvbjogJHtlc2NhcGVIdG1sKGdyb3VwLnJlYXNvbil9PC9zcGFuPlxuICAgICAgPC9kaXY+XG4gICAgICA8dWwgY2xhc3M9XCJncm91cC10YWJzXCI+XG4gICAgICAgICR7Z3JvdXAudGFicy5tYXAodGFiID0+IGBcbiAgICAgICAgICA8bGkgY2xhc3M9XCJncm91cC10YWItaXRlbVwiPlxuICAgICAgICAgICAgJHt0YWIuZmF2SWNvblVybCA/IGA8aW1nIHNyYz1cIiR7ZXNjYXBlSHRtbCh0YWIuZmF2SWNvblVybCl9XCIgY2xhc3M9XCJ0YWItaWNvblwiIG9uZXJyb3I9XCJ0aGlzLnN0eWxlLmRpc3BsYXk9J25vbmUnXCI+YCA6ICc8ZGl2IGNsYXNzPVwidGFiLWljb25cIj48L2Rpdj4nfVxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJ0aXRsZS1jZWxsXCIgdGl0bGU9XCIke2VzY2FwZUh0bWwodGFiLnRpdGxlKX1cIj4ke2VzY2FwZUh0bWwodGFiLnRpdGxlKX08L3NwYW4+XG4gICAgICAgICAgICA8c3BhbiBzdHlsZT1cImNvbG9yOiAjOTk5OyBmb250LXNpemU6IDAuOGVtOyBtYXJnaW4tbGVmdDogYXV0bztcIj4ke2VzY2FwZUh0bWwoZ2V0SG9zdG5hbWUodGFiLnVybCkgfHwgXCJcIil9PC9zcGFuPlxuICAgICAgICAgIDwvbGk+XG4gICAgICAgIGApLmpvaW4oJycpfVxuICAgICAgPC91bD5cbiAgICA8L2Rpdj5cbiAgYCkuam9pbignJyk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhcHBseVRvQnJvd3NlcigpIHtcbiAgICBjb25zdCBncm91cGluZ0xpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2ltLWdyb3VwaW5nLWxpc3QnKTtcbiAgICBjb25zdCBzb3J0aW5nTGlzdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaW0tc29ydGluZy1saXN0Jyk7XG5cbiAgICBpZiAoIWdyb3VwaW5nTGlzdCB8fCAhc29ydGluZ0xpc3QpIHJldHVybjtcblxuICAgIGNvbnN0IGdyb3VwaW5nU3RyYXRzID0gZ2V0RW5hYmxlZFN0cmF0ZWdpZXNGcm9tVUkoZ3JvdXBpbmdMaXN0KTtcbiAgICBjb25zdCBzb3J0aW5nU3RyYXRzID0gZ2V0RW5hYmxlZFN0cmF0ZWdpZXNGcm9tVUkoc29ydGluZ0xpc3QpO1xuXG4gICAgLy8gQ29tYmluZSBzdHJhdGVnaWVzLlxuICAgIC8vIFdlIHByaW9yaXRpemUgZ3JvdXBpbmcgc3RyYXRlZ2llcyBmaXJzdCwgdGhlbiBzb3J0aW5nIHN0cmF0ZWdpZXMsXG4gICAgLy8gYXMgdGhlIGJhY2tlbmQgZmlsdGVycyB0aGVtIHdoZW4gcGVyZm9ybWluZyBhY3Rpb25zLlxuICAgIC8vIERlZHVwbGljYXRlIHRvIHNlbmQgYSBjbGVhbiBsaXN0LlxuICAgIGNvbnN0IGFsbFN0cmF0ZWdpZXMgPSBBcnJheS5mcm9tKG5ldyBTZXQoWy4uLmdyb3VwaW5nU3RyYXRzLCAuLi5zb3J0aW5nU3RyYXRzXSkpO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgLy8gMS4gU2F2ZSBQcmVmZXJlbmNlc1xuICAgICAgICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICB0eXBlOiAnc2F2ZVByZWZlcmVuY2VzJyxcbiAgICAgICAgICAgIHBheWxvYWQ6IHsgc29ydGluZzogYWxsU3RyYXRlZ2llcyB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIDIuIFRyaWdnZXIgQXBwbHkgR3JvdXBpbmcgKHdoaWNoIHVzZXMgdGhlIG5ldyBwcmVmZXJlbmNlcylcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICB0eXBlOiAnYXBwbHlHcm91cGluZycsXG4gICAgICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgICAgICAgc29ydGluZzogYWxsU3RyYXRlZ2llcyAvLyBQYXNzIGV4cGxpY2l0bHkgdG8gZW5zdXJlIGltbWVkaWF0ZSBlZmZlY3RcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9rKSB7XG4gICAgICAgICAgICBhbGVydChcIkFwcGxpZWQgc3VjY2Vzc2Z1bGx5IVwiKTtcbiAgICAgICAgICAgIGxvYWRUYWJzKCk7IC8vIFJlZnJlc2ggZGF0YVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYWxlcnQoXCJGYWlsZWQgdG8gYXBwbHk6IFwiICsgKHJlc3BvbnNlLmVycm9yIHx8ICdVbmtub3duIGVycm9yJykpO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiQXBwbHkgZmFpbGVkXCIsIGUpO1xuICAgICAgICBhbGVydChcIkFwcGx5IGZhaWxlZDogXCIgKyBlKTtcbiAgICB9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZW5kZXJMaXZlVmlldygpIHtcbiAgICBjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbGl2ZS12aWV3LWNvbnRhaW5lcicpO1xuICAgIGlmICghY29udGFpbmVyKSByZXR1cm47XG5cbiAgICB0cnkge1xuICAgICAgICBjb25zdCB0YWJzID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoe30pO1xuICAgICAgICBjb25zdCBncm91cHMgPSBhd2FpdCBjaHJvbWUudGFiR3JvdXBzLnF1ZXJ5KHt9KTtcbiAgICAgICAgY29uc3QgZ3JvdXBNYXAgPSBuZXcgTWFwKGdyb3Vwcy5tYXAoZyA9PiBbZy5pZCwgZ10pKTtcblxuICAgICAgICBjb25zdCB3aW5kb3dzID0gbmV3IFNldCh0YWJzLm1hcCh0ID0+IHQud2luZG93SWQpKTtcbiAgICAgICAgY29uc3Qgd2luZG93SWRzID0gQXJyYXkuZnJvbSh3aW5kb3dzKS5zb3J0KChhLCBiKSA9PiBhIC0gYik7XG5cbiAgICAgICAgbGV0IGh0bWwgPSAnPGRpdiBzdHlsZT1cImZvbnQtc2l6ZTogMC45ZW07IGNvbG9yOiAjNjY2OyBtYXJnaW4tYm90dG9tOiAxMHB4O1wiPlNlbGVjdCBpdGVtcyBiZWxvdyB0byBzaW11bGF0ZSBzcGVjaWZpYyBzZWxlY3Rpb24gc3RhdGVzLjwvZGl2Pic7XG5cbiAgICAgICAgZm9yIChjb25zdCB3aW5JZCBvZiB3aW5kb3dJZHMpIHtcbiAgICAgICAgICAgIGNvbnN0IHdpblRhYnMgPSB0YWJzLmZpbHRlcih0ID0+IHQud2luZG93SWQgPT09IHdpbklkKTtcbiAgICAgICAgICAgIGNvbnN0IHdpblNlbGVjdGVkID0gd2luVGFicy5ldmVyeSh0ID0+IHQuaWQgJiYgYXBwU3RhdGUuc2ltdWxhdGVkU2VsZWN0aW9uLmhhcyh0LmlkKSk7XG5cbiAgICAgICAgICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJzZWxlY3RhYmxlLWl0ZW0gJHt3aW5TZWxlY3RlZCA/ICdzZWxlY3RlZCcgOiAnJ31cIiBkYXRhLXR5cGU9XCJ3aW5kb3dcIiBkYXRhLWlkPVwiJHt3aW5JZH1cIiBzdHlsZT1cIm1hcmdpbi1ib3R0b206IDE1cHg7IGJvcmRlci1yYWRpdXM6IDRweDsgcGFkZGluZzogNXB4O1wiPmA7XG4gICAgICAgICAgICBodG1sICs9IGA8ZGl2IHN0eWxlPVwiZm9udC13ZWlnaHQ6IGJvbGQ7XCI+V2luZG93ICR7d2luSWR9PC9kaXY+YDtcblxuICAgICAgICAgICAgLy8gT3JnYW5pemUgYnkgZ3JvdXBcbiAgICAgICAgICAgIGNvbnN0IHdpbkdyb3VwcyA9IG5ldyBNYXA8bnVtYmVyLCBjaHJvbWUudGFicy5UYWJbXT4oKTtcbiAgICAgICAgICAgIGNvbnN0IHVuZ3JvdXBlZDogY2hyb21lLnRhYnMuVGFiW10gPSBbXTtcblxuICAgICAgICAgICAgd2luVGFicy5mb3JFYWNoKHQgPT4ge1xuICAgICAgICAgICAgICAgIGlmICh0Lmdyb3VwSWQgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghd2luR3JvdXBzLmhhcyh0Lmdyb3VwSWQpKSB3aW5Hcm91cHMuc2V0KHQuZ3JvdXBJZCwgW10pO1xuICAgICAgICAgICAgICAgICAgICB3aW5Hcm91cHMuZ2V0KHQuZ3JvdXBJZCkhLnB1c2godCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdW5ncm91cGVkLnB1c2godCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIFJlbmRlciBVbmdyb3VwZWRcbiAgICAgICAgICAgIGlmICh1bmdyb3VwZWQubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICBodG1sICs9IGA8ZGl2IHN0eWxlPVwibWFyZ2luLWxlZnQ6IDEwcHg7IG1hcmdpbi10b3A6IDVweDtcIj5gO1xuICAgICAgICAgICAgICAgICBodG1sICs9IGA8ZGl2IHN0eWxlPVwiZm9udC1zaXplOiAwLjllbTsgY29sb3I6ICM1NTU7XCI+VW5ncm91cGVkICgke3VuZ3JvdXBlZC5sZW5ndGh9KTwvZGl2PmA7XG4gICAgICAgICAgICAgICAgIHVuZ3JvdXBlZC5mb3JFYWNoKHQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNTZWxlY3RlZCA9IHQuaWQgJiYgYXBwU3RhdGUuc2ltdWxhdGVkU2VsZWN0aW9uLmhhcyh0LmlkKTtcbiAgICAgICAgICAgICAgICAgICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJzZWxlY3RhYmxlLWl0ZW0gJHtpc1NlbGVjdGVkID8gJ3NlbGVjdGVkJyA6ICcnfVwiIGRhdGEtdHlwZT1cInRhYlwiIGRhdGEtaWQ9XCIke3QuaWR9XCIgc3R5bGU9XCJtYXJnaW4tbGVmdDogMTBweDsgcGFkZGluZzogMnB4IDVweDsgYm9yZGVyLXJhZGl1czogM3B4OyBjdXJzb3I6IHBvaW50ZXI7IGNvbG9yOiAjMzMzOyB3aGl0ZS1zcGFjZTogbm93cmFwOyBvdmVyZmxvdzogaGlkZGVuOyB0ZXh0LW92ZXJmbG93OiBlbGxpcHNpcztcIj4tICR7ZXNjYXBlSHRtbCh0LnRpdGxlIHx8ICdVbnRpdGxlZCcpfTwvZGl2PmA7XG4gICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICBodG1sICs9IGA8L2Rpdj5gO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBSZW5kZXIgR3JvdXBzXG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtncm91cElkLCBnVGFic10gb2Ygd2luR3JvdXBzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZ3JvdXBJbmZvID0gZ3JvdXBNYXAuZ2V0KGdyb3VwSWQpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvbG9yID0gZ3JvdXBJbmZvPy5jb2xvciB8fCAnZ3JleSc7XG4gICAgICAgICAgICAgICAgY29uc3QgdGl0bGUgPSBncm91cEluZm8/LnRpdGxlIHx8ICdVbnRpdGxlZCBHcm91cCc7XG4gICAgICAgICAgICAgICAgY29uc3QgZ3JvdXBTZWxlY3RlZCA9IGdUYWJzLmV2ZXJ5KHQgPT4gdC5pZCAmJiBhcHBTdGF0ZS5zaW11bGF0ZWRTZWxlY3Rpb24uaGFzKHQuaWQpKTtcblxuICAgICAgICAgICAgICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJzZWxlY3RhYmxlLWl0ZW0gJHtncm91cFNlbGVjdGVkID8gJ3NlbGVjdGVkJyA6ICcnfVwiIGRhdGEtdHlwZT1cImdyb3VwXCIgZGF0YS1pZD1cIiR7Z3JvdXBJZH1cIiBzdHlsZT1cIm1hcmdpbi1sZWZ0OiAxMHB4OyBtYXJnaW4tdG9wOiA1cHg7IGJvcmRlci1sZWZ0OiAzcHggc29saWQgJHtjb2xvcn07IHBhZGRpbmctbGVmdDogNXB4OyBwYWRkaW5nOiA1cHg7IGJvcmRlci1yYWRpdXM6IDNweDtcIj5gO1xuICAgICAgICAgICAgICAgIGh0bWwgKz0gYDxkaXYgc3R5bGU9XCJmb250LXdlaWdodDogYm9sZDsgZm9udC1zaXplOiAwLjllbTtcIj4ke2VzY2FwZUh0bWwodGl0bGUpfSAoJHtnVGFicy5sZW5ndGh9KTwvZGl2PmA7XG4gICAgICAgICAgICAgICAgZ1RhYnMuZm9yRWFjaCh0ID0+IHtcbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzU2VsZWN0ZWQgPSB0LmlkICYmIGFwcFN0YXRlLnNpbXVsYXRlZFNlbGVjdGlvbi5oYXModC5pZCk7XG4gICAgICAgICAgICAgICAgICAgICBodG1sICs9IGA8ZGl2IGNsYXNzPVwic2VsZWN0YWJsZS1pdGVtICR7aXNTZWxlY3RlZCA/ICdzZWxlY3RlZCcgOiAnJ31cIiBkYXRhLXR5cGU9XCJ0YWJcIiBkYXRhLWlkPVwiJHt0LmlkfVwiIHN0eWxlPVwibWFyZ2luLWxlZnQ6IDEwcHg7IHBhZGRpbmc6IDJweCA1cHg7IGJvcmRlci1yYWRpdXM6IDNweDsgY3Vyc29yOiBwb2ludGVyOyBjb2xvcjogIzMzMzsgd2hpdGUtc3BhY2U6IG5vd3JhcDsgb3ZlcmZsb3c6IGhpZGRlbjsgdGV4dC1vdmVyZmxvdzogZWxsaXBzaXM7XCI+LSAke2VzY2FwZUh0bWwodC50aXRsZSB8fCAnVW50aXRsZWQnKX08L2Rpdj5gO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGh0bWwgKz0gYDwvZGl2PmA7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGh0bWwgKz0gYDwvZGl2PmA7XG4gICAgICAgIH1cblxuICAgICAgICBjb250YWluZXIuaW5uZXJIVE1MID0gaHRtbDtcblxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29udGFpbmVyLmlubmVySFRNTCA9IGA8cCBzdHlsZT1cImNvbG9yOnJlZFwiPkVycm9yIGxvYWRpbmcgbGl2ZSB2aWV3OiAke2V9PC9wPmA7XG4gICAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVuZGVyU3RyYXRlZ3lDb25maWcoKSB7XG4gIGNvbnN0IGdyb3VwaW5nTGlzdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaW0tZ3JvdXBpbmctbGlzdCcpO1xuICBjb25zdCBzb3J0aW5nTGlzdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaW0tc29ydGluZy1saXN0Jyk7XG5cbiAgLy8gVXNlIGR5bmFtaWMgc3RyYXRlZ3kgbGlzdFxuICBjb25zdCBzdHJhdGVnaWVzOiBTdHJhdGVneURlZmluaXRpb25bXSA9IGdldFN0cmF0ZWdpZXMoYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzKTtcbiAgbGV0IGVuYWJsZWRGcm9tUHJlZnM6IHN0cmluZ1tdID0gW107XG5cbiAgdHJ5IHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2xvYWRQcmVmZXJlbmNlcycgfSk7XG4gICAgaWYgKHJlc3BvbnNlPy5vayAmJiByZXNwb25zZS5kYXRhPy5zb3J0aW5nICYmIEFycmF5LmlzQXJyYXkocmVzcG9uc2UuZGF0YS5zb3J0aW5nKSkge1xuICAgICAgZW5hYmxlZEZyb21QcmVmcyA9IHJlc3BvbnNlLmRhdGEuc29ydGluZztcbiAgICB9XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBjb25zb2xlLndhcm4oJ0ZhaWxlZCB0byBsb2FkIHNpbXVsYXRpb24gcHJlZmVyZW5jZXMsIHVzaW5nIGRlZmF1bHRzLicsIGUpO1xuICB9XG5cbiAgY29uc3QgZGVmYXVsdEdyb3VwaW5nID0gZW5hYmxlZEZyb21QcmVmcy5maWx0ZXIoKGlkKSA9PiBzdHJhdGVnaWVzLnNvbWUoKHMpID0+IHMuaWQgPT09IGlkICYmIHMuaXNHcm91cGluZykpO1xuICBjb25zdCBkZWZhdWx0U29ydGluZyA9IGVuYWJsZWRGcm9tUHJlZnMuZmlsdGVyKChpZCkgPT4gc3RyYXRlZ2llcy5zb21lKChzKSA9PiBzLmlkID09PSBpZCAmJiBzLmlzU29ydGluZykpO1xuXG4gIGlmIChncm91cGluZ0xpc3QpIHtcbiAgICAgIC8vIGdyb3VwaW5nU3RyYXRlZ2llcyBpcyBqdXN0IGZpbHRlcmVkIHN0cmF0ZWdpZXNcbiAgICAgIGNvbnN0IGdyb3VwaW5nU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gcy5pc0dyb3VwaW5nKTtcbiAgICAgIHJlbmRlclN0cmF0ZWd5TGlzdChncm91cGluZ0xpc3QsIGdyb3VwaW5nU3RyYXRlZ2llcywgZGVmYXVsdEdyb3VwaW5nLmxlbmd0aCA/IGRlZmF1bHRHcm91cGluZyA6IFsnZG9tYWluJywgJ3RvcGljJ10pO1xuICB9XG5cbiAgaWYgKHNvcnRpbmdMaXN0KSB7XG4gICAgICBjb25zdCBzb3J0aW5nU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gcy5pc1NvcnRpbmcpO1xuICAgICAgcmVuZGVyU3RyYXRlZ3lMaXN0KHNvcnRpbmdMaXN0LCBzb3J0aW5nU3RyYXRlZ2llcywgZGVmYXVsdFNvcnRpbmcubGVuZ3RoID8gZGVmYXVsdFNvcnRpbmcgOiBbJ3Bpbm5lZCcsICdyZWNlbmN5J10pO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJTdHJhdGVneUxpc3QoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgc3RyYXRlZ2llczogU3RyYXRlZ3lEZWZpbml0aW9uW10sIGRlZmF1bHRFbmFibGVkOiBzdHJpbmdbXSkge1xuICAgIGNvbnRhaW5lci5pbm5lckhUTUwgPSAnJztcblxuICAgIC8vIFNvcnQgZW5hYmxlZCBieSB0aGVpciBpbmRleCBpbiBkZWZhdWx0RW5hYmxlZFxuICAgIGNvbnN0IGVuYWJsZWQgPSBzdHJhdGVnaWVzLmZpbHRlcihzID0+IGRlZmF1bHRFbmFibGVkLmluY2x1ZGVzKHMuaWQgYXMgc3RyaW5nKSk7XG4gICAgLy8gU2FmZSBpbmRleG9mIGNoZWNrIHNpbmNlIGlkcyBhcmUgc3RyaW5ncyBpbiBkZWZhdWx0RW5hYmxlZFxuICAgIGVuYWJsZWQuc29ydCgoYSwgYikgPT4gZGVmYXVsdEVuYWJsZWQuaW5kZXhPZihhLmlkIGFzIHN0cmluZykgLSBkZWZhdWx0RW5hYmxlZC5pbmRleE9mKGIuaWQgYXMgc3RyaW5nKSk7XG5cbiAgICBjb25zdCBkaXNhYmxlZCA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gIWRlZmF1bHRFbmFibGVkLmluY2x1ZGVzKHMuaWQgYXMgc3RyaW5nKSk7XG5cbiAgICAvLyBJbml0aWFsIHJlbmRlciBvcmRlcjogRW5hYmxlZCAob3JkZXJlZCkgdGhlbiBEaXNhYmxlZFxuICAgIGNvbnN0IG9yZGVyZWQgPSBbLi4uZW5hYmxlZCwgLi4uZGlzYWJsZWRdO1xuXG4gICAgb3JkZXJlZC5mb3JFYWNoKHN0cmF0ZWd5ID0+IHtcbiAgICAgICAgY29uc3QgaXNDaGVja2VkID0gZGVmYXVsdEVuYWJsZWQuaW5jbHVkZXMoc3RyYXRlZ3kuaWQpO1xuICAgICAgICBjb25zdCByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgcm93LmNsYXNzTmFtZSA9IGBzdHJhdGVneS1yb3cgJHtpc0NoZWNrZWQgPyAnJyA6ICdkaXNhYmxlZCd9YDtcbiAgICAgICAgcm93LmRhdGFzZXQuaWQgPSBzdHJhdGVneS5pZDtcbiAgICAgICAgcm93LmRyYWdnYWJsZSA9IHRydWU7XG5cbiAgICAgICAgcm93LmlubmVySFRNTCA9IGBcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJkcmFnLWhhbmRsZVwiPlx1MjYzMDwvZGl2PlxuICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiICR7aXNDaGVja2VkID8gJ2NoZWNrZWQnIDogJyd9PlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJzdHJhdGVneS1sYWJlbFwiPiR7c3RyYXRlZ3kubGFiZWx9PC9zcGFuPlxuICAgICAgICBgO1xuXG4gICAgICAgIC8vIEFkZCBsaXN0ZW5lcnNcbiAgICAgICAgY29uc3QgY2hlY2tib3ggPSByb3cucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cImNoZWNrYm94XCJdJyk7XG4gICAgICAgIGNoZWNrYm94Py5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgY2hlY2tlZCA9IChlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS5jaGVja2VkO1xuICAgICAgICAgICAgcm93LmNsYXNzTGlzdC50b2dnbGUoJ2Rpc2FibGVkJywgIWNoZWNrZWQpO1xuICAgICAgICB9KTtcblxuICAgICAgICBhZGREbkRMaXN0ZW5lcnMocm93LCBjb250YWluZXIpO1xuXG4gICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChyb3cpO1xuICAgIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RW5hYmxlZFN0cmF0ZWdpZXNGcm9tVUkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IFNvcnRpbmdTdHJhdGVneVtdIHtcbiAgICByZXR1cm4gQXJyYXkuZnJvbShjb250YWluZXIuY2hpbGRyZW4pXG4gICAgICAgIC5maWx0ZXIocm93ID0+IChyb3cucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cImNoZWNrYm94XCJdJykgYXMgSFRNTElucHV0RWxlbWVudCkuY2hlY2tlZClcbiAgICAgICAgLm1hcChyb3cgPT4gKHJvdyBhcyBIVE1MRWxlbWVudCkuZGF0YXNldC5pZCBhcyBTb3J0aW5nU3RyYXRlZ3kpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5pdFNpbXVsYXRpb24oKSB7XG4gIGNvbnN0IHJ1blNpbUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdydW5TaW1CdG4nKTtcbiAgaWYgKHJ1blNpbUJ0bikge1xuICAgIHJ1blNpbUJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHJ1blNpbXVsYXRpb24pO1xuICB9XG5cbiAgY29uc3QgYXBwbHlCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXBwbHlCdG4nKTtcbiAgaWYgKGFwcGx5QnRuKSB7XG4gICAgYXBwbHlCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBhcHBseVRvQnJvd3Nlcik7XG4gIH1cblxuICAvLyBJbml0aWFsIExpdmUgVmlld1xuICByZW5kZXJMaXZlVmlldygpO1xuICBjb25zdCByZWZyZXNoTGl2ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZWZyZXNoLWxpdmUtdmlldy1idG4nKTtcbiAgaWYgKHJlZnJlc2hMaXZlQnRuKSByZWZyZXNoTGl2ZUJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHJlbmRlckxpdmVWaWV3KTtcblxuICBjb25zdCBsaXZlQ29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xpdmUtdmlldy1jb250YWluZXInKTtcbiAgaWYgKGxpdmVDb250YWluZXIpIHtcbiAgICAgIGxpdmVDb250YWluZXIuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgICAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICAgICAgICAgIGNvbnN0IGl0ZW0gPSB0YXJnZXQuY2xvc2VzdCgnLnNlbGVjdGFibGUtaXRlbScpIGFzIEhUTUxFbGVtZW50O1xuICAgICAgICAgIGlmICghaXRlbSkgcmV0dXJuO1xuXG4gICAgICAgICAgY29uc3QgdHlwZSA9IGl0ZW0uZGF0YXNldC50eXBlO1xuICAgICAgICAgIGNvbnN0IGlkID0gTnVtYmVyKGl0ZW0uZGF0YXNldC5pZCk7XG4gICAgICAgICAgaWYgKCF0eXBlIHx8IGlzTmFOKGlkKSkgcmV0dXJuO1xuXG4gICAgICAgICAgaWYgKHR5cGUgPT09ICd0YWInKSB7XG4gICAgICAgICAgICAgIGlmIChhcHBTdGF0ZS5zaW11bGF0ZWRTZWxlY3Rpb24uaGFzKGlkKSkgYXBwU3RhdGUuc2ltdWxhdGVkU2VsZWN0aW9uLmRlbGV0ZShpZCk7XG4gICAgICAgICAgICAgIGVsc2UgYXBwU3RhdGUuc2ltdWxhdGVkU2VsZWN0aW9uLmFkZChpZCk7XG4gICAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSAnZ3JvdXAnKSB7XG4gICAgICAgICAgICAgIGNocm9tZS50YWJzLnF1ZXJ5KHt9KS50aGVuKHRhYnMgPT4ge1xuICAgICAgICAgICAgICAgICBjb25zdCBncm91cFRhYnMgPSB0YWJzLmZpbHRlcih0ID0+IHQuZ3JvdXBJZCA9PT0gaWQpO1xuICAgICAgICAgICAgICAgICBjb25zdCBhbGxTZWxlY3RlZCA9IGdyb3VwVGFicy5ldmVyeSh0ID0+IHQuaWQgJiYgYXBwU3RhdGUuc2ltdWxhdGVkU2VsZWN0aW9uLmhhcyh0LmlkKSk7XG4gICAgICAgICAgICAgICAgIGdyb3VwVGFicy5mb3JFYWNoKHQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgaWYgKHQuaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoYWxsU2VsZWN0ZWQpIGFwcFN0YXRlLnNpbXVsYXRlZFNlbGVjdGlvbi5kZWxldGUodC5pZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSBhcHBTdGF0ZS5zaW11bGF0ZWRTZWxlY3Rpb24uYWRkKHQuaWQpO1xuICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgcmVuZGVyTGl2ZVZpZXcoKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIHJldHVybjsgLy8gYXN5bmMgdXBkYXRlXG4gICAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSAnd2luZG93Jykge1xuICAgICAgICAgICAgICBjaHJvbWUudGFicy5xdWVyeSh7fSkudGhlbih0YWJzID0+IHtcbiAgICAgICAgICAgICAgICAgY29uc3Qgd2luVGFicyA9IHRhYnMuZmlsdGVyKHQgPT4gdC53aW5kb3dJZCA9PT0gaWQpO1xuICAgICAgICAgICAgICAgICBjb25zdCBhbGxTZWxlY3RlZCA9IHdpblRhYnMuZXZlcnkodCA9PiB0LmlkICYmIGFwcFN0YXRlLnNpbXVsYXRlZFNlbGVjdGlvbi5oYXModC5pZCkpO1xuICAgICAgICAgICAgICAgICB3aW5UYWJzLmZvckVhY2godCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICBpZiAodC5pZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChhbGxTZWxlY3RlZCkgYXBwU3RhdGUuc2ltdWxhdGVkU2VsZWN0aW9uLmRlbGV0ZSh0LmlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICBlbHNlIGFwcFN0YXRlLnNpbXVsYXRlZFNlbGVjdGlvbi5hZGQodC5pZCk7XG4gICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICByZW5kZXJMaXZlVmlldygpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgcmV0dXJuOyAvLyBhc3luYyB1cGRhdGVcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZW5kZXJMaXZlVmlldygpO1xuICAgICAgfSk7XG4gIH1cbn1cbiIsICJpbXBvcnQgeyBhcHBTdGF0ZSB9IGZyb20gXCIuL3N0YXRlLmpzXCI7XG5pbXBvcnQgeyBzZXRDdXN0b21TdHJhdGVnaWVzIH0gZnJvbSBcIi4uLy4uL2JhY2tncm91bmQvZ3JvdXBpbmdTdHJhdGVnaWVzLmpzXCI7XG5pbXBvcnQgeyByZW5kZXJBbGdvcml0aG1zVmlldywgc2hvd01vZGFsIH0gZnJvbSBcIi4vY29tcG9uZW50cy5qc1wiO1xuaW1wb3J0IHsgcmVuZGVyU3RyYXRlZ3lDb25maWcgfSBmcm9tIFwiLi9zaW11bGF0aW9uLmpzXCI7XG5pbXBvcnQgeyBQcmVmZXJlbmNlcywgQ3VzdG9tU3RyYXRlZ3kgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBTVFJBVEVHSUVTIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC9zdHJhdGVneVJlZ2lzdHJ5LmpzXCI7XG5pbXBvcnQgeyBsb2dJbmZvIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGVzY2FwZUh0bWwgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBsb2FkUHJlZmVyZW5jZXNBbmRJbml0KCkge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiAnbG9hZFByZWZlcmVuY2VzJyB9KTtcbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9rICYmIHJlc3BvbnNlLmRhdGEpIHtcbiAgICAgICAgICAgIGNvbnN0IHByZWZzID0gcmVzcG9uc2UuZGF0YSBhcyBQcmVmZXJlbmNlcztcbiAgICAgICAgICAgIGFwcFN0YXRlLmxvY2FsQ3VzdG9tU3RyYXRlZ2llcyA9IHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW107XG4gICAgICAgICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKGFwcFN0YXRlLmxvY2FsQ3VzdG9tU3RyYXRlZ2llcyk7XG4gICAgICAgICAgICByZW5kZXJTdHJhdGVneUxvYWRPcHRpb25zKCk7XG4gICAgICAgICAgICByZW5kZXJTdHJhdGVneUxpc3RUYWJsZSgpO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGxvYWQgcHJlZmVyZW5jZXNcIiwgZSk7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyU3RyYXRlZ3lMb2FkT3B0aW9ucygpIHtcbiAgICBjb25zdCBzZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXRlZ3ktbG9hZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCB8IG51bGw7XG4gICAgaWYgKCFzZWxlY3QpIHJldHVybjtcblxuICAgIGNvbnN0IGN1c3RvbU9wdGlvbnMgPSBhcHBTdGF0ZS5sb2NhbEN1c3RvbVN0cmF0ZWdpZXNcbiAgICAgICAgLnNsaWNlKClcbiAgICAgICAgLnNvcnQoKGEsIGIpID0+IGEubGFiZWwubG9jYWxlQ29tcGFyZShiLmxhYmVsKSlcbiAgICAgICAgLm1hcChzdHJhdGVneSA9PiBgXG4gICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiJHtlc2NhcGVIdG1sKHN0cmF0ZWd5LmlkKX1cIj4ke2VzY2FwZUh0bWwoc3RyYXRlZ3kubGFiZWwpfSAoJHtlc2NhcGVIdG1sKHN0cmF0ZWd5LmlkKX0pPC9vcHRpb24+XG4gICAgICAgIGApLmpvaW4oJycpO1xuXG4gICAgY29uc3QgYnVpbHRJbk9wdGlvbnMgPSBTVFJBVEVHSUVTXG4gICAgICAgIC5maWx0ZXIocyA9PiAhYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzLnNvbWUoY3MgPT4gY3MuaWQgPT09IHMuaWQpKVxuICAgICAgICAubWFwKHN0cmF0ZWd5ID0+IGBcbiAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCIke2VzY2FwZUh0bWwoc3RyYXRlZ3kuaWQgYXMgc3RyaW5nKX1cIj4ke2VzY2FwZUh0bWwoc3RyYXRlZ3kubGFiZWwpfSAoQnVpbHQtaW4pPC9vcHRpb24+XG4gICAgICAgIGApLmpvaW4oJycpO1xuXG4gICAgc2VsZWN0LmlubmVySFRNTCA9IGA8b3B0aW9uIHZhbHVlPVwiXCI+TG9hZCBzYXZlZCBzdHJhdGVneS4uLjwvb3B0aW9uPmAgK1xuICAgICAgICAoY3VzdG9tT3B0aW9ucyA/IGA8b3B0Z3JvdXAgbGFiZWw9XCJDdXN0b20gU3RyYXRlZ2llc1wiPiR7Y3VzdG9tT3B0aW9uc308L29wdGdyb3VwPmAgOiAnJykgK1xuICAgICAgICAoYnVpbHRJbk9wdGlvbnMgPyBgPG9wdGdyb3VwIGxhYmVsPVwiQnVpbHQtaW4gU3RyYXRlZ2llc1wiPiR7YnVpbHRJbk9wdGlvbnN9PC9vcHRncm91cD5gIDogJycpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyU3RyYXRlZ3lMaXN0VGFibGUoKSB7XG4gICAgY29uc3QgdGFibGVCb2R5ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0ZWd5LXRhYmxlLWJvZHknKTtcbiAgICBpZiAoIXRhYmxlQm9keSkgcmV0dXJuO1xuXG4gICAgY29uc3QgY3VzdG9tSWRzID0gbmV3IFNldChhcHBTdGF0ZS5sb2NhbEN1c3RvbVN0cmF0ZWdpZXMubWFwKHN0cmF0ZWd5ID0+IHN0cmF0ZWd5LmlkKSk7XG4gICAgY29uc3QgYnVpbHRJblJvd3MgPSBTVFJBVEVHSUVTLm1hcChzdHJhdGVneSA9PiAoe1xuICAgICAgICAuLi5zdHJhdGVneSxcbiAgICAgICAgc291cmNlTGFiZWw6ICdCdWlsdC1pbicsXG4gICAgICAgIGNvbmZpZ1N1bW1hcnk6ICdcdTIwMTQnLFxuICAgICAgICBhdXRvUnVuTGFiZWw6ICdcdTIwMTQnLFxuICAgICAgICBhY3Rpb25zOiAnJ1xuICAgIH0pKTtcblxuICAgIGNvbnN0IGN1c3RvbVJvd3MgPSBhcHBTdGF0ZS5sb2NhbEN1c3RvbVN0cmF0ZWdpZXMubWFwKHN0cmF0ZWd5ID0+IHtcbiAgICAgICAgY29uc3Qgb3ZlcnJpZGVzQnVpbHRJbiA9IGN1c3RvbUlkcy5oYXMoc3RyYXRlZ3kuaWQpICYmIFNUUkFURUdJRVMuc29tZShidWlsdEluID0+IGJ1aWx0SW4uaWQgPT09IHN0cmF0ZWd5LmlkKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGlkOiBzdHJhdGVneS5pZCxcbiAgICAgICAgICAgIGxhYmVsOiBzdHJhdGVneS5sYWJlbCxcbiAgICAgICAgICAgIGlzR3JvdXBpbmc6IHRydWUsXG4gICAgICAgICAgICBpc1NvcnRpbmc6IHRydWUsXG4gICAgICAgICAgICBzb3VyY2VMYWJlbDogb3ZlcnJpZGVzQnVpbHRJbiA/ICdDdXN0b20gKG92ZXJyaWRlcyBidWlsdC1pbiknIDogJ0N1c3RvbScsXG4gICAgICAgICAgICBjb25maWdTdW1tYXJ5OiBgRmlsdGVyczogJHtzdHJhdGVneS5maWx0ZXJzPy5sZW5ndGggfHwgMH0sIEdyb3VwczogJHtzdHJhdGVneS5ncm91cGluZ1J1bGVzPy5sZW5ndGggfHwgMH0sIFNvcnRzOiAke3N0cmF0ZWd5LnNvcnRpbmdSdWxlcz8ubGVuZ3RoIHx8IDB9YCxcbiAgICAgICAgICAgIGF1dG9SdW5MYWJlbDogc3RyYXRlZ3kuYXV0b1J1biA/ICdZZXMnIDogJ05vJyxcbiAgICAgICAgICAgIGFjdGlvbnM6IGA8YnV0dG9uIGNsYXNzPVwiZGVsZXRlLXN0cmF0ZWd5LXJvd1wiIGRhdGEtaWQ9XCIke2VzY2FwZUh0bWwoc3RyYXRlZ3kuaWQpfVwiIHN0eWxlPVwiY29sb3I6IHJlZDtcIj5EZWxldGU8L2J1dHRvbj5gXG4gICAgICAgIH07XG4gICAgfSk7XG5cbiAgICBjb25zdCBhbGxSb3dzID0gWy4uLmJ1aWx0SW5Sb3dzLCAuLi5jdXN0b21Sb3dzXTtcblxuICAgIGlmIChhbGxSb3dzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICB0YWJsZUJvZHkuaW5uZXJIVE1MID0gJzx0cj48dGQgY29sc3Bhbj1cIjdcIiBzdHlsZT1cImNvbG9yOiAjODg4O1wiPk5vIHN0cmF0ZWdpZXMgZm91bmQuPC90ZD48L3RyPic7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0YWJsZUJvZHkuaW5uZXJIVE1MID0gYWxsUm93cy5tYXAocm93ID0+IHtcbiAgICAgICAgY29uc3QgY2FwYWJpbGl0aWVzID0gW3Jvdy5pc0dyb3VwaW5nID8gJ0dyb3VwaW5nJyA6IG51bGwsIHJvdy5pc1NvcnRpbmcgPyAnU29ydGluZycgOiBudWxsXS5maWx0ZXIoQm9vbGVhbikuam9pbignLCAnKTtcbiAgICAgICAgcmV0dXJuIGBcbiAgICAgICAgPHRyPlxuICAgICAgICAgICAgPHRkPiR7ZXNjYXBlSHRtbChyb3cubGFiZWwpfTwvdGQ+XG4gICAgICAgICAgICA8dGQ+JHtlc2NhcGVIdG1sKFN0cmluZyhyb3cuaWQpKX08L3RkPlxuICAgICAgICAgICAgPHRkPiR7ZXNjYXBlSHRtbChyb3cuc291cmNlTGFiZWwpfTwvdGQ+XG4gICAgICAgICAgICA8dGQ+JHtlc2NhcGVIdG1sKGNhcGFiaWxpdGllcyl9PC90ZD5cbiAgICAgICAgICAgIDx0ZD4ke2VzY2FwZUh0bWwocm93LmNvbmZpZ1N1bW1hcnkpfTwvdGQ+XG4gICAgICAgICAgICA8dGQ+JHtlc2NhcGVIdG1sKHJvdy5hdXRvUnVuTGFiZWwpfTwvdGQ+XG4gICAgICAgICAgICA8dGQ+JHtyb3cuYWN0aW9uc308L3RkPlxuICAgICAgICA8L3RyPlxuICAgICAgICBgO1xuICAgIH0pLmpvaW4oJycpO1xuXG4gICAgdGFibGVCb2R5LnF1ZXJ5U2VsZWN0b3JBbGwoJy5kZWxldGUtc3RyYXRlZ3ktcm93JykuZm9yRWFjaChidG4gPT4ge1xuICAgICAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgaWQgPSAoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXQuaWQ7XG4gICAgICAgICAgICBpZiAoaWQgJiYgY29uZmlybShgRGVsZXRlIHN0cmF0ZWd5IFwiJHtpZH1cIj9gKSkge1xuICAgICAgICAgICAgICAgIGF3YWl0IGRlbGV0ZUN1c3RvbVN0cmF0ZWd5KGlkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBkZWxldGVDdXN0b21TdHJhdGVneShpZDogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgbG9nSW5mbyhcIkRlbGV0aW5nIHN0cmF0ZWd5XCIsIHsgaWQgfSk7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiAnbG9hZFByZWZlcmVuY2VzJyB9KTtcbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9rICYmIHJlc3BvbnNlLmRhdGEpIHtcbiAgICAgICAgICAgIGNvbnN0IHByZWZzID0gcmVzcG9uc2UuZGF0YSBhcyBQcmVmZXJlbmNlcztcbiAgICAgICAgICAgIGNvbnN0IG5ld1N0cmF0ZWdpZXMgPSAocHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXSkuZmlsdGVyKHMgPT4gcy5pZCAhPT0gaWQpO1xuXG4gICAgICAgICAgICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICAgICAgdHlwZTogJ3NhdmVQcmVmZXJlbmNlcycsXG4gICAgICAgICAgICAgICAgcGF5bG9hZDogeyBjdXN0b21TdHJhdGVnaWVzOiBuZXdTdHJhdGVnaWVzIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBhcHBTdGF0ZS5sb2NhbEN1c3RvbVN0cmF0ZWdpZXMgPSBuZXdTdHJhdGVnaWVzO1xuICAgICAgICAgICAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhhcHBTdGF0ZS5sb2NhbEN1c3RvbVN0cmF0ZWdpZXMpO1xuICAgICAgICAgICAgcmVuZGVyU3RyYXRlZ3lMb2FkT3B0aW9ucygpO1xuICAgICAgICAgICAgcmVuZGVyU3RyYXRlZ3lMaXN0VGFibGUoKTtcbiAgICAgICAgICAgIHJlbmRlckFsZ29yaXRobXNWaWV3KCk7XG4gICAgICAgICAgICByZW5kZXJTdHJhdGVneUNvbmZpZygpO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGRlbGV0ZSBzdHJhdGVneVwiLCBlKTtcbiAgICB9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzYXZlU3RyYXRlZ3koc3RyYXQ6IEN1c3RvbVN0cmF0ZWd5LCBzaG93U3VjY2VzczogYm9vbGVhbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIHRyeSB7XG4gICAgICAgIGxvZ0luZm8oXCJTYXZpbmcgc3RyYXRlZ3lcIiwgeyBpZDogc3RyYXQuaWQgfSk7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiAnbG9hZFByZWZlcmVuY2VzJyB9KTtcbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9rICYmIHJlc3BvbnNlLmRhdGEpIHtcbiAgICAgICAgICAgIGNvbnN0IHByZWZzID0gcmVzcG9uc2UuZGF0YSBhcyBQcmVmZXJlbmNlcztcbiAgICAgICAgICAgIGxldCBjdXJyZW50U3RyYXRlZ2llcyA9IHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW107XG5cbiAgICAgICAgICAgIC8vIEZpbmQgZXhpc3RpbmcgdG8gcHJlc2VydmUgcHJvcHMgKGxpa2UgYXV0b1J1bilcbiAgICAgICAgICAgIGNvbnN0IGV4aXN0aW5nID0gY3VycmVudFN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0LmlkKTtcbiAgICAgICAgICAgIGlmIChleGlzdGluZykge1xuICAgICAgICAgICAgICAgIHN0cmF0LmF1dG9SdW4gPSBleGlzdGluZy5hdXRvUnVuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBSZW1vdmUgZXhpc3RpbmcgaWYgc2FtZSBJRFxuICAgICAgICAgICAgY3VycmVudFN0cmF0ZWdpZXMgPSBjdXJyZW50U3RyYXRlZ2llcy5maWx0ZXIocyA9PiBzLmlkICE9PSBzdHJhdC5pZCk7XG4gICAgICAgICAgICBjdXJyZW50U3RyYXRlZ2llcy5wdXNoKHN0cmF0KTtcblxuICAgICAgICAgICAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICAgIHR5cGU6ICdzYXZlUHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgICAgIHBheWxvYWQ6IHsgY3VzdG9tU3RyYXRlZ2llczogY3VycmVudFN0cmF0ZWdpZXMgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGFwcFN0YXRlLmxvY2FsQ3VzdG9tU3RyYXRlZ2llcyA9IGN1cnJlbnRTdHJhdGVnaWVzO1xuICAgICAgICAgICAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhhcHBTdGF0ZS5sb2NhbEN1c3RvbVN0cmF0ZWdpZXMpO1xuXG4gICAgICAgICAgICByZW5kZXJTdHJhdGVneUxvYWRPcHRpb25zKCk7XG4gICAgICAgICAgICByZW5kZXJTdHJhdGVneUxpc3RUYWJsZSgpO1xuICAgICAgICAgICAgcmVuZGVyQWxnb3JpdGhtc1ZpZXcoKTtcbiAgICAgICAgICAgIHJlbmRlclN0cmF0ZWd5Q29uZmlnKCk7XG4gICAgICAgICAgICBpZiAoc2hvd1N1Y2Nlc3MpIGFsZXJ0KFwiU3RyYXRlZ3kgc2F2ZWQhXCIpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBzYXZlIHN0cmF0ZWd5XCIsIGUpO1xuICAgICAgICBhbGVydChcIkVycm9yIHNhdmluZyBzdHJhdGVneVwiKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4cG9ydEFsbFN0cmF0ZWdpZXMoKSB7XG4gICAgbG9nSW5mbyhcIkV4cG9ydGluZyBhbGwgc3RyYXRlZ2llc1wiLCB7IGNvdW50OiBhcHBTdGF0ZS5sb2NhbEN1c3RvbVN0cmF0ZWdpZXMubGVuZ3RoIH0pO1xuICAgIGNvbnN0IGpzb24gPSBKU09OLnN0cmluZ2lmeShhcHBTdGF0ZS5sb2NhbEN1c3RvbVN0cmF0ZWdpZXMsIG51bGwsIDIpO1xuICAgIGNvbnN0IGNvbnRlbnQgPSBgXG4gICAgICAgIDxwPkNvcHkgdGhlIEpTT04gYmVsb3cgKGNvbnRhaW5zICR7YXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzLmxlbmd0aH0gc3RyYXRlZ2llcyk6PC9wPlxuICAgICAgICA8dGV4dGFyZWEgc3R5bGU9XCJ3aWR0aDogMTAwJTsgaGVpZ2h0OiAzMDBweDsgZm9udC1mYW1pbHk6IG1vbm9zcGFjZTtcIj4ke2VzY2FwZUh0bWwoanNvbil9PC90ZXh0YXJlYT5cbiAgICBgO1xuICAgIHNob3dNb2RhbChcIkV4cG9ydCBBbGwgU3RyYXRlZ2llc1wiLCBjb250ZW50KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGltcG9ydEFsbFN0cmF0ZWdpZXMoKSB7XG4gICAgY29uc3QgY29udGVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGNvbnRlbnQuaW5uZXJIVE1MID0gYFxuICAgICAgICA8cD5QYXN0ZSBTdHJhdGVneSBMaXN0IEpTT04gYmVsb3c6PC9wPlxuICAgICAgICA8cCBzdHlsZT1cImZvbnQtc2l6ZTogMC45ZW07IGNvbG9yOiAjNjY2O1wiPk5vdGU6IFN0cmF0ZWdpZXMgd2l0aCBtYXRjaGluZyBJRHMgd2lsbCBiZSBvdmVyd3JpdHRlbi48L3A+XG4gICAgICAgIDx0ZXh0YXJlYSBpZD1cImltcG9ydC1hbGwtYXJlYVwiIHN0eWxlPVwid2lkdGg6IDEwMCU7IGhlaWdodDogMjAwcHg7IGZvbnQtZmFtaWx5OiBtb25vc3BhY2U7IG1hcmdpbi1ib3R0b206IDEwcHg7XCI+PC90ZXh0YXJlYT5cbiAgICAgICAgPGJ1dHRvbiBpZD1cImltcG9ydC1hbGwtY29uZmlybVwiIGNsYXNzPVwic3VjY2Vzcy1idG5cIj5JbXBvcnQgQWxsPC9idXR0b24+XG4gICAgYDtcblxuICAgIGNvbnN0IGJ0biA9IGNvbnRlbnQucXVlcnlTZWxlY3RvcignI2ltcG9ydC1hbGwtY29uZmlybScpO1xuICAgIGJ0bj8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBhc3luYyAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHR4dCA9IChjb250ZW50LnF1ZXJ5U2VsZWN0b3IoJyNpbXBvcnQtYWxsLWFyZWEnKSBhcyBIVE1MVGV4dEFyZWFFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGpzb24gPSBKU09OLnBhcnNlKHR4dCk7XG4gICAgICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkoanNvbikpIHtcbiAgICAgICAgICAgICAgICBhbGVydChcIkludmFsaWQgZm9ybWF0OiBFeHBlY3RlZCBhbiBhcnJheSBvZiBzdHJhdGVnaWVzLlwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFZhbGlkYXRlIGl0ZW1zXG4gICAgICAgICAgICBjb25zdCBpbnZhbGlkID0ganNvbi5maW5kKHMgPT4gIXMuaWQgfHwgIXMubGFiZWwpO1xuICAgICAgICAgICAgaWYgKGludmFsaWQpIHtcbiAgICAgICAgICAgICAgICBhbGVydChcIkludmFsaWQgc3RyYXRlZ3kgaW4gbGlzdDogbWlzc2luZyBJRCBvciBMYWJlbC5cIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBNZXJnZSBsb2dpYyAoVXBzZXJ0KVxuICAgICAgICAgICAgY29uc3Qgc3RyYXRNYXAgPSBuZXcgTWFwKGFwcFN0YXRlLmxvY2FsQ3VzdG9tU3RyYXRlZ2llcy5tYXAocyA9PiBbcy5pZCwgc10pKTtcblxuICAgICAgICAgICAgbGV0IGNvdW50ID0gMDtcbiAgICAgICAgICAgIGpzb24uZm9yRWFjaCgoczogQ3VzdG9tU3RyYXRlZ3kpID0+IHtcbiAgICAgICAgICAgICAgICBzdHJhdE1hcC5zZXQocy5pZCwgcyk7XG4gICAgICAgICAgICAgICAgY291bnQrKztcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBjb25zdCBuZXdTdHJhdGVnaWVzID0gQXJyYXkuZnJvbShzdHJhdE1hcC52YWx1ZXMoKSk7XG5cbiAgICAgICAgICAgIGxvZ0luZm8oXCJJbXBvcnRpbmcgYWxsIHN0cmF0ZWdpZXNcIiwgeyBjb3VudDogbmV3U3RyYXRlZ2llcy5sZW5ndGggfSk7XG5cbiAgICAgICAgICAgIC8vIFNhdmVcbiAgICAgICAgICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnc2F2ZVByZWZlcmVuY2VzJyxcbiAgICAgICAgICAgICAgICBwYXlsb2FkOiB7IGN1c3RvbVN0cmF0ZWdpZXM6IG5ld1N0cmF0ZWdpZXMgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIFVwZGF0ZSBsb2NhbCBzdGF0ZVxuICAgICAgICAgICAgYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzID0gbmV3U3RyYXRlZ2llcztcbiAgICAgICAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMoYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzKTtcblxuICAgICAgICAgICAgcmVuZGVyU3RyYXRlZ3lMb2FkT3B0aW9ucygpO1xuICAgICAgICAgICAgcmVuZGVyU3RyYXRlZ3lMaXN0VGFibGUoKTtcbiAgICAgICAgICAgIHJlbmRlckFsZ29yaXRobXNWaWV3KCk7XG4gICAgICAgICAgICByZW5kZXJTdHJhdGVneUNvbmZpZygpO1xuXG4gICAgICAgICAgICBhbGVydChgSW1wb3J0ZWQgJHtjb3VudH0gc3RyYXRlZ2llcy5gKTtcbiAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5tb2RhbC1vdmVybGF5Jyk/LnJlbW92ZSgpO1xuXG4gICAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgICAgYWxlcnQoXCJJbnZhbGlkIEpTT046IFwiICsgZSk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIHNob3dNb2RhbChcIkltcG9ydCBBbGwgU3RyYXRlZ2llc1wiLCBjb250ZW50KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRTdHJhdGVnaWVzKCkge1xuICAgIGNvbnN0IGV4cG9ydEFsbEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdGVneS1saXN0LWV4cG9ydC1idG4nKTtcbiAgICBjb25zdCBpbXBvcnRBbGxCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXRlZ3ktbGlzdC1pbXBvcnQtYnRuJyk7XG4gICAgaWYgKGV4cG9ydEFsbEJ0bikgZXhwb3J0QWxsQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZXhwb3J0QWxsU3RyYXRlZ2llcyk7XG4gICAgaWYgKGltcG9ydEFsbEJ0bikgaW1wb3J0QWxsQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgaW1wb3J0QWxsU3RyYXRlZ2llcyk7XG59XG4iLCAiaW1wb3J0IHsgYXBwU3RhdGUgfSBmcm9tIFwiLi9zdGF0ZS5qc1wiO1xuaW1wb3J0IHsgc2hvd01vZGFsIH0gZnJvbSBcIi4vY29tcG9uZW50cy5qc1wiO1xuaW1wb3J0IHsgc2F2ZVN0cmF0ZWd5LCByZW5kZXJTdHJhdGVneUxvYWRPcHRpb25zLCByZW5kZXJTdHJhdGVneUxpc3RUYWJsZSB9IGZyb20gXCIuL3N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IHJlbmRlclN0cmF0ZWd5Q29uZmlnLCByZW5kZXJMaXZlVmlldyB9IGZyb20gXCIuL3NpbXVsYXRpb24uanNcIjtcbmltcG9ydCB7IGdldE1hcHBlZFRhYnMgfSBmcm9tIFwiLi9kYXRhLmpzXCI7XG5pbXBvcnQgeyBsb2FkVGFicyB9IGZyb20gXCIuL3RhYnNUYWJsZS5qc1wiO1xuaW1wb3J0IHsgU1RSQVRFR0lFUywgZ2V0U3RyYXRlZ2llcyB9IGZyb20gXCIuLi8uLi9zaGFyZWQvc3RyYXRlZ3lSZWdpc3RyeS5qc1wiO1xuaW1wb3J0IHsgQ3VzdG9tU3RyYXRlZ3ksIFJ1bGVDb25kaXRpb24sIEdyb3VwaW5nUnVsZSwgU29ydGluZ1J1bGUgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBncm91cFRhYnMsIHNldEN1c3RvbVN0cmF0ZWdpZXMgfSBmcm9tIFwiLi4vLi4vYmFja2dyb3VuZC9ncm91cGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IHNvcnRUYWJzIH0gZnJvbSBcIi4uLy4uL2JhY2tncm91bmQvc29ydGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IGxvZ0luZm8gfSBmcm9tIFwiLi4vLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgZXNjYXBlSHRtbCB9IGZyb20gXCIuLi8uLi9zaGFyZWQvdXRpbHMuanNcIjtcblxuY29uc3QgRklFTERfT1BUSU9OUyA9IGBcbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwidXJsXCI+VVJMPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInRpdGxlXCI+VGl0bGU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZG9tYWluXCI+RG9tYWluPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInN1YmRvbWFpblwiPlN1YmRvbWFpbjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJpZFwiPklEPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImluZGV4XCI+SW5kZXg8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwid2luZG93SWRcIj5XaW5kb3cgSUQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZ3JvdXBJZFwiPkdyb3VwIElEPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImFjdGl2ZVwiPkFjdGl2ZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJzZWxlY3RlZFwiPlNlbGVjdGVkPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInBpbm5lZFwiPlBpbm5lZDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJzdGF0dXNcIj5TdGF0dXM8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwib3BlbmVyVGFiSWRcIj5PcGVuZXIgSUQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwicGFyZW50VGl0bGVcIj5QYXJlbnQgVGl0bGU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwibGFzdEFjY2Vzc2VkXCI+TGFzdCBBY2Nlc3NlZDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJnZW5yZVwiPkdlbnJlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHRcIj5Db250ZXh0IFN1bW1hcnk8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEuc2l0ZU5hbWVcIj5TaXRlIE5hbWU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEuY2Fub25pY2FsVXJsXCI+Q2Fub25pY2FsIFVSTDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5ub3JtYWxpemVkVXJsXCI+Tm9ybWFsaXplZCBVUkw8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEucGxhdGZvcm1cIj5QbGF0Zm9ybTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5vYmplY3RUeXBlXCI+T2JqZWN0IFR5cGU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEub2JqZWN0SWRcIj5PYmplY3QgSUQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEudGl0bGVcIj5FeHRyYWN0ZWQgVGl0bGU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEuZGVzY3JpcHRpb25cIj5EZXNjcmlwdGlvbjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5hdXRob3JPckNyZWF0b3JcIj5BdXRob3IvQ3JlYXRvcjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5wdWJsaXNoZWRBdFwiPlB1Ymxpc2hlZCBBdDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5tb2RpZmllZEF0XCI+TW9kaWZpZWQgQXQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEubGFuZ3VhZ2VcIj5MYW5ndWFnZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5pc0F1ZGlibGVcIj5JcyBBdWRpYmxlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHREYXRhLmlzTXV0ZWRcIj5JcyBNdXRlZDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5oYXNVbnNhdmVkQ2hhbmdlc0xpa2VseVwiPlVuc2F2ZWQgQ2hhbmdlczwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5pc0F1dGhlbnRpY2F0ZWRMaWtlbHlcIj5BdXRoZW50aWNhdGVkPC9vcHRpb24+YDtcblxuY29uc3QgT1BFUkFUT1JfT1BUSU9OUyA9IGBcbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGFpbnNcIj5jb250YWluczwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJkb2VzTm90Q29udGFpblwiPmRvZXMgbm90IGNvbnRhaW48L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwibWF0Y2hlc1wiPm1hdGNoZXMgcmVnZXg8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZXF1YWxzXCI+ZXF1YWxzPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInN0YXJ0c1dpdGhcIj5zdGFydHMgd2l0aDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJlbmRzV2l0aFwiPmVuZHMgd2l0aDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJleGlzdHNcIj5leGlzdHM8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZG9lc05vdEV4aXN0XCI+ZG9lcyBub3QgZXhpc3Q8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiaXNOdWxsXCI+aXMgbnVsbDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJpc05vdE51bGxcIj5pcyBub3QgbnVsbDwvb3B0aW9uPmA7XG5cbmV4cG9ydCBmdW5jdGlvbiBpbml0U3RyYXRlZ3lCdWlsZGVyKCkge1xuICAgIGNvbnN0IGFkZEZpbHRlckdyb3VwQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FkZC1maWx0ZXItZ3JvdXAtYnRuJyk7XG4gICAgY29uc3QgYWRkR3JvdXBCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWRkLWdyb3VwLWJ0bicpO1xuICAgIGNvbnN0IGFkZFNvcnRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWRkLXNvcnQtYnRuJyk7XG4gICAgY29uc3QgbG9hZFNlbGVjdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdGVneS1sb2FkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50IHwgbnVsbDtcblxuICAgIC8vIE5ldzogR3JvdXAgU29ydGluZ1xuICAgIGNvbnN0IGFkZEdyb3VwU29ydEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhZGQtZ3JvdXAtc29ydC1idG4nKTtcbiAgICBjb25zdCBncm91cFNvcnRDaGVjayA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1zb3J0Z3JvdXBzLWNoZWNrJyk7XG5cbiAgICBjb25zdCBzYXZlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J1aWxkZXItc2F2ZS1idG4nKTtcbiAgICBjb25zdCBydW5CdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnVpbGRlci1ydW4tYnRuJyk7XG4gICAgY29uc3QgcnVuTGl2ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdidWlsZGVyLXJ1bi1saXZlLWJ0bicpO1xuICAgIGNvbnN0IGNsZWFyQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J1aWxkZXItY2xlYXItYnRuJyk7XG5cbiAgICBjb25zdCBleHBvcnRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnVpbGRlci1leHBvcnQtYnRuJyk7XG4gICAgY29uc3QgaW1wb3J0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J1aWxkZXItaW1wb3J0LWJ0bicpO1xuXG4gICAgaWYgKGV4cG9ydEJ0bikgZXhwb3J0QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZXhwb3J0QnVpbGRlclN0cmF0ZWd5KTtcbiAgICBpZiAoaW1wb3J0QnRuKSBpbXBvcnRCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBpbXBvcnRCdWlsZGVyU3RyYXRlZ3kpO1xuXG4gICAgaWYgKGFkZEZpbHRlckdyb3VwQnRuKSBhZGRGaWx0ZXJHcm91cEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGFkZEZpbHRlckdyb3VwUm93KCkpO1xuICAgIGlmIChhZGRHcm91cEJ0bikgYWRkR3JvdXBCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBhZGRCdWlsZGVyUm93KCdncm91cCcpKTtcbiAgICBpZiAoYWRkU29ydEJ0bikgYWRkU29ydEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGFkZEJ1aWxkZXJSb3coJ3NvcnQnKSk7XG4gICAgaWYgKGFkZEdyb3VwU29ydEJ0bikgYWRkR3JvdXBTb3J0QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gYWRkQnVpbGRlclJvdygnZ3JvdXBTb3J0JykpO1xuXG4gICAgaWYgKGdyb3VwU29ydENoZWNrKSB7XG4gICAgICAgIGdyb3VwU29ydENoZWNrLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIChlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjaGVja2VkID0gKGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLmNoZWNrZWQ7XG4gICAgICAgICAgICBjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ3JvdXAtc29ydC1yb3dzLWNvbnRhaW5lcicpO1xuICAgICAgICAgICAgY29uc3QgYWRkQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FkZC1ncm91cC1zb3J0LWJ0bicpO1xuICAgICAgICAgICAgaWYgKGNvbnRhaW5lciAmJiBhZGRCdG4pIHtcbiAgICAgICAgICAgICAgICBjb250YWluZXIuc3R5bGUuZGlzcGxheSA9IGNoZWNrZWQgPyAnYmxvY2snIDogJ25vbmUnO1xuICAgICAgICAgICAgICAgIGFkZEJ0bi5zdHlsZS5kaXNwbGF5ID0gY2hlY2tlZCA/ICdibG9jaycgOiAnbm9uZSc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmIChzYXZlQnRuKSBzYXZlQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gc2F2ZUN1c3RvbVN0cmF0ZWd5RnJvbUJ1aWxkZXIodHJ1ZSkpO1xuICAgIGlmIChydW5CdG4pIHJ1bkJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHJ1bkJ1aWxkZXJTaW11bGF0aW9uKTtcbiAgICBpZiAocnVuTGl2ZUJ0bikgcnVuTGl2ZUJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHJ1bkJ1aWxkZXJMaXZlKTtcbiAgICBpZiAoY2xlYXJCdG4pIGNsZWFyQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgY2xlYXJCdWlsZGVyKTtcblxuICAgIGlmIChsb2FkU2VsZWN0KSB7XG4gICAgICAgIGxvYWRTZWxlY3QuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKCkgPT4ge1xuICAgICAgICAgICAgY29uc3Qgc2VsZWN0ZWRJZCA9IGxvYWRTZWxlY3QudmFsdWU7XG4gICAgICAgICAgICBpZiAoIXNlbGVjdGVkSWQpIHJldHVybjtcblxuICAgICAgICAgICAgbGV0IHN0cmF0ID0gYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzZWxlY3RlZElkKTtcbiAgICAgICAgICAgIGlmICghc3RyYXQpIHtcbiAgICAgICAgICAgICAgICBzdHJhdCA9IGdldEJ1aWx0SW5TdHJhdGVneUNvbmZpZyhzZWxlY3RlZElkKSB8fCB1bmRlZmluZWQ7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChzdHJhdCkge1xuICAgICAgICAgICAgICAgIHBvcHVsYXRlQnVpbGRlckZyb21TdHJhdGVneShzdHJhdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEJ1aWx0SW5TdHJhdGVneUNvbmZpZyhpZDogc3RyaW5nKTogQ3VzdG9tU3RyYXRlZ3kgfCBudWxsIHtcbiAgICBjb25zdCBiYXNlOiBDdXN0b21TdHJhdGVneSA9IHtcbiAgICAgICAgaWQ6IGlkLFxuICAgICAgICBsYWJlbDogU1RSQVRFR0lFUy5maW5kKHMgPT4gcy5pZCA9PT0gaWQpPy5sYWJlbCB8fCBpZCxcbiAgICAgICAgZmlsdGVyczogW10sXG4gICAgICAgIGdyb3VwaW5nUnVsZXM6IFtdLFxuICAgICAgICBzb3J0aW5nUnVsZXM6IFtdLFxuICAgICAgICBncm91cFNvcnRpbmdSdWxlczogW10sXG4gICAgICAgIGZhbGxiYWNrOiAnTWlzYycsXG4gICAgICAgIHNvcnRHcm91cHM6IGZhbHNlLFxuICAgICAgICBhdXRvUnVuOiBmYWxzZVxuICAgIH07XG5cbiAgICBzd2l0Y2ggKGlkKSB7XG4gICAgICAgIGNhc2UgJ2RvbWFpbic6XG4gICAgICAgICAgICBiYXNlLmdyb3VwaW5nUnVsZXMgPSBbeyBzb3VyY2U6ICdmaWVsZCcsIHZhbHVlOiAnZG9tYWluJywgdHJhbnNmb3JtOiAnc3RyaXBUbGQnLCBjb2xvcjogJ3JhbmRvbScgfV07XG4gICAgICAgICAgICBiYXNlLnNvcnRpbmdSdWxlcyA9IFt7IGZpZWxkOiAnZG9tYWluJywgb3JkZXI6ICdhc2MnIH1dO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2RvbWFpbl9mdWxsJzpcbiAgICAgICAgICAgICBiYXNlLmdyb3VwaW5nUnVsZXMgPSBbeyBzb3VyY2U6ICdmaWVsZCcsIHZhbHVlOiAnZG9tYWluJywgdHJhbnNmb3JtOiAnbm9uZScsIGNvbG9yOiAncmFuZG9tJyB9XTtcbiAgICAgICAgICAgICBiYXNlLnNvcnRpbmdSdWxlcyA9IFt7IGZpZWxkOiAnZG9tYWluJywgb3JkZXI6ICdhc2MnIH1dO1xuICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICd0b3BpYyc6XG4gICAgICAgICAgICBiYXNlLmdyb3VwaW5nUnVsZXMgPSBbeyBzb3VyY2U6ICdmaWVsZCcsIHZhbHVlOiAnZ2VucmUnLCBjb2xvcjogJ3JhbmRvbScgfV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnY29udGV4dCc6XG4gICAgICAgICAgICBiYXNlLmdyb3VwaW5nUnVsZXMgPSBbeyBzb3VyY2U6ICdmaWVsZCcsIHZhbHVlOiAnY29udGV4dCcsIGNvbG9yOiAncmFuZG9tJyB9XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdsaW5lYWdlJzpcbiAgICAgICAgICAgIGJhc2UuZ3JvdXBpbmdSdWxlcyA9IFt7IHNvdXJjZTogJ2ZpZWxkJywgdmFsdWU6ICdwYXJlbnRUaXRsZScsIGNvbG9yOiAncmFuZG9tJyB9XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdwaW5uZWQnOlxuICAgICAgICAgICAgIGJhc2Uuc29ydGluZ1J1bGVzID0gW3sgZmllbGQ6ICdwaW5uZWQnLCBvcmRlcjogJ2Rlc2MnIH1dO1xuICAgICAgICAgICAgIGJhc2UuZ3JvdXBpbmdSdWxlcyA9IFt7IHNvdXJjZTogJ2ZpZWxkJywgdmFsdWU6ICdwaW5uZWQnLCBjb2xvcjogJ3JhbmRvbScgfV07XG4gICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3JlY2VuY3knOlxuICAgICAgICAgICAgYmFzZS5zb3J0aW5nUnVsZXMgPSBbeyBmaWVsZDogJ2xhc3RBY2Nlc3NlZCcsIG9yZGVyOiAnZGVzYycgfV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnYWdlJzpcbiAgICAgICAgICAgICBiYXNlLnNvcnRpbmdSdWxlcyA9IFt7IGZpZWxkOiAnbGFzdEFjY2Vzc2VkJywgb3JkZXI6ICdkZXNjJyB9XTtcbiAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAndXJsJzpcbiAgICAgICAgICAgIGJhc2Uuc29ydGluZ1J1bGVzID0gW3sgZmllbGQ6ICd1cmwnLCBvcmRlcjogJ2FzYycgfV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAndGl0bGUnOlxuICAgICAgICAgICAgYmFzZS5zb3J0aW5nUnVsZXMgPSBbeyBmaWVsZDogJ3RpdGxlJywgb3JkZXI6ICdhc2MnIH1dO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ25lc3RpbmcnOlxuICAgICAgICAgICAgIGJhc2Uuc29ydGluZ1J1bGVzID0gW3sgZmllbGQ6ICdwYXJlbnRUaXRsZScsIG9yZGVyOiAnYXNjJyB9XTtcbiAgICAgICAgICAgICBicmVhaztcbiAgICB9XG5cbiAgICByZXR1cm4gYmFzZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZEZpbHRlckdyb3VwUm93KGNvbmRpdGlvbnM/OiBSdWxlQ29uZGl0aW9uW10pIHtcbiAgICBjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZmlsdGVyLXJvd3MtY29udGFpbmVyJyk7XG4gICAgaWYgKCFjb250YWluZXIpIHJldHVybjtcblxuICAgIGNvbnN0IGdyb3VwRGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgZ3JvdXBEaXYuY2xhc3NOYW1lID0gJ2ZpbHRlci1ncm91cC1yb3cnO1xuXG4gICAgZ3JvdXBEaXYuaW5uZXJIVE1MID0gYFxuICAgICAgICA8ZGl2IGNsYXNzPVwiZmlsdGVyLWdyb3VwLWhlYWRlclwiPlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJmaWx0ZXItZ3JvdXAtdGl0bGVcIj5Hcm91cCAoQU5EKTwvc3Bhbj5cbiAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJzbWFsbC1idG4gYnRuLWRlbC1ncm91cFwiPkRlbGV0ZSBHcm91cDwvYnV0dG9uPlxuICAgICAgICA8L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImNvbmRpdGlvbnMtY29udGFpbmVyXCI+PC9kaXY+XG4gICAgICAgIDxidXR0b24gY2xhc3M9XCJzbWFsbC1idG4gYnRuLWFkZC1jb25kaXRpb25cIj4rIEFkZCBDb25kaXRpb248L2J1dHRvbj5cbiAgICBgO1xuXG4gICAgZ3JvdXBEaXYucXVlcnlTZWxlY3RvcignLmJ0bi1kZWwtZ3JvdXAnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGdyb3VwRGl2LnJlbW92ZSgpO1xuICAgICAgICB1cGRhdGVCcmVhZGNydW1iKCk7XG4gICAgfSk7XG5cbiAgICBjb25zdCBjb25kaXRpb25zQ29udGFpbmVyID0gZ3JvdXBEaXYucXVlcnlTZWxlY3RvcignLmNvbmRpdGlvbnMtY29udGFpbmVyJykgYXMgSFRNTEVsZW1lbnQ7XG4gICAgY29uc3QgYWRkQ29uZGl0aW9uQnRuID0gZ3JvdXBEaXYucXVlcnlTZWxlY3RvcignLmJ0bi1hZGQtY29uZGl0aW9uJyk7XG5cbiAgICBjb25zdCBhZGRDb25kaXRpb24gPSAoZGF0YT86IFJ1bGVDb25kaXRpb24pID0+IHtcbiAgICAgICAgY29uc3QgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIGRpdi5jbGFzc05hbWUgPSAnYnVpbGRlci1yb3cgY29uZGl0aW9uLXJvdyc7XG4gICAgICAgIGRpdi5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuICAgICAgICBkaXYuc3R5bGUuZ2FwID0gJzVweCc7XG4gICAgICAgIGRpdi5zdHlsZS5tYXJnaW5Cb3R0b20gPSAnNXB4JztcbiAgICAgICAgZGl2LnN0eWxlLmFsaWduSXRlbXMgPSAnY2VudGVyJztcblxuICAgICAgICBkaXYuaW5uZXJIVE1MID0gYFxuICAgICAgICAgICAgPHNlbGVjdCBjbGFzcz1cImZpZWxkLXNlbGVjdFwiPlxuICAgICAgICAgICAgICAgICR7RklFTERfT1BUSU9OU31cbiAgICAgICAgICAgIDwvc2VsZWN0PlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJvcGVyYXRvci1jb250YWluZXJcIj5cbiAgICAgICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwib3BlcmF0b3Itc2VsZWN0XCI+XG4gICAgICAgICAgICAgICAgICAgICR7T1BFUkFUT1JfT1BUSU9OU31cbiAgICAgICAgICAgICAgICA8L3NlbGVjdD5cbiAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwidmFsdWUtY29udGFpbmVyXCI+XG4gICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgY2xhc3M9XCJ2YWx1ZS1pbnB1dFwiIHBsYWNlaG9sZGVyPVwiVmFsdWVcIj5cbiAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJzbWFsbC1idG4gYnRuLWRlbC1jb25kaXRpb25cIiBzdHlsZT1cImJhY2tncm91bmQ6IG5vbmU7IGJvcmRlcjogbm9uZTsgY29sb3I6IHJlZDtcIj4mdGltZXM7PC9idXR0b24+XG4gICAgICAgIGA7XG5cbiAgICAgICAgY29uc3QgZmllbGRTZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLmZpZWxkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICBjb25zdCBvcGVyYXRvckNvbnRhaW5lciA9IGRpdi5xdWVyeVNlbGVjdG9yKCcub3BlcmF0b3ItY29udGFpbmVyJykgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IHZhbHVlQ29udGFpbmVyID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1jb250YWluZXInKSBhcyBIVE1MRWxlbWVudDtcblxuICAgICAgICBjb25zdCB1cGRhdGVTdGF0ZSA9IChpbml0aWFsT3A/OiBzdHJpbmcsIGluaXRpYWxWYWw/OiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHZhbCA9IGZpZWxkU2VsZWN0LnZhbHVlO1xuICAgICAgICAgICAgLy8gSGFuZGxlIGJvb2xlYW4gZmllbGRzXG4gICAgICAgICAgICBpZiAoWydzZWxlY3RlZCcsICdwaW5uZWQnXS5pbmNsdWRlcyh2YWwpKSB7XG4gICAgICAgICAgICAgICAgb3BlcmF0b3JDb250YWluZXIuaW5uZXJIVE1MID0gYDxzZWxlY3QgY2xhc3M9XCJvcGVyYXRvci1zZWxlY3RcIiBkaXNhYmxlZCBzdHlsZT1cImJhY2tncm91bmQ6ICNlZWU7IGNvbG9yOiAjNTU1O1wiPjxvcHRpb24gdmFsdWU9XCJlcXVhbHNcIj5pczwvb3B0aW9uPjwvc2VsZWN0PmA7XG4gICAgICAgICAgICAgICAgdmFsdWVDb250YWluZXIuaW5uZXJIVE1MID0gYFxuICAgICAgICAgICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwidmFsdWUtaW5wdXRcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJ0cnVlXCI+VHJ1ZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImZhbHNlXCI+RmFsc2U8L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgICAgPC9zZWxlY3Q+XG4gICAgICAgICAgICAgICAgYDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgaWYgYWxyZWFkeSBpbiBzdGFuZGFyZCBtb2RlIHRvIGF2b2lkIHVubmVjZXNzYXJ5IERPTSB0aHJhc2hpbmdcbiAgICAgICAgICAgICAgICBpZiAoIW9wZXJhdG9yQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ3NlbGVjdDpub3QoW2Rpc2FibGVkXSknKSkge1xuICAgICAgICAgICAgICAgICAgICBvcGVyYXRvckNvbnRhaW5lci5pbm5lckhUTUwgPSBgPHNlbGVjdCBjbGFzcz1cIm9wZXJhdG9yLXNlbGVjdFwiPiR7T1BFUkFUT1JfT1BUSU9OU308L3NlbGVjdD5gO1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZUNvbnRhaW5lci5pbm5lckhUTUwgPSBgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgY2xhc3M9XCJ2YWx1ZS1pbnB1dFwiIHBsYWNlaG9sZGVyPVwiVmFsdWVcIj5gO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gUmVzdG9yZSB2YWx1ZXMgaWYgcHJvdmlkZWQgKGVzcGVjaWFsbHkgd2hlbiBzd2l0Y2hpbmcgYmFjayBvciBpbml0aWFsaXppbmcpXG4gICAgICAgICAgICBpZiAoaW5pdGlhbE9wIHx8IGluaXRpYWxWYWwpIHtcbiAgICAgICAgICAgICAgICAgY29uc3Qgb3BFbCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcub3BlcmF0b3Itc2VsZWN0JykgYXMgSFRNTElucHV0RWxlbWVudCB8IEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICAgICAgICAgICBjb25zdCB2YWxFbCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcudmFsdWUtaW5wdXQnKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgICAgICAgICAgIGlmIChvcEVsICYmIGluaXRpYWxPcCkgb3BFbC52YWx1ZSA9IGluaXRpYWxPcDtcbiAgICAgICAgICAgICAgICAgaWYgKHZhbEVsICYmIGluaXRpYWxWYWwpIHZhbEVsLnZhbHVlID0gaW5pdGlhbFZhbDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gUmUtYXR0YWNoIGxpc3RlbmVycyB0byBuZXcgZWxlbWVudHNcbiAgICAgICAgICAgIGRpdi5xdWVyeVNlbGVjdG9yQWxsKCdpbnB1dCwgc2VsZWN0JykuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgICAgICAgICAgZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgdXBkYXRlQnJlYWRjcnVtYik7XG4gICAgICAgICAgICAgICAgZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcignaW5wdXQnLCB1cGRhdGVCcmVhZGNydW1iKTtcbiAgICAgICAgICAgICAgICBlbC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB1cGRhdGVCcmVhZGNydW1iKTtcbiAgICAgICAgICAgICAgICBlbC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIHVwZGF0ZUJyZWFkY3J1bWIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgZmllbGRTZWxlY3QuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKCkgPT4ge1xuICAgICAgICAgICAgdXBkYXRlU3RhdGUoKTtcbiAgICAgICAgICAgIHVwZGF0ZUJyZWFkY3J1bWIoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKGRhdGEpIHtcbiAgICAgICAgICAgIGZpZWxkU2VsZWN0LnZhbHVlID0gZGF0YS5maWVsZDtcbiAgICAgICAgICAgIHVwZGF0ZVN0YXRlKGRhdGEub3BlcmF0b3IsIGRhdGEudmFsdWUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdXBkYXRlU3RhdGUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGRpdi5xdWVyeVNlbGVjdG9yKCcuYnRuLWRlbC1jb25kaXRpb24nKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgICBkaXYucmVtb3ZlKCk7XG4gICAgICAgICAgICB1cGRhdGVCcmVhZGNydW1iKCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbmRpdGlvbnNDb250YWluZXIuYXBwZW5kQ2hpbGQoZGl2KTtcbiAgICB9O1xuXG4gICAgYWRkQ29uZGl0aW9uQnRuPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGFkZENvbmRpdGlvbigpKTtcblxuICAgIGlmIChjb25kaXRpb25zICYmIGNvbmRpdGlvbnMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25kaXRpb25zLmZvckVhY2goYyA9PiBhZGRDb25kaXRpb24oYykpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIEFkZCBvbmUgZW1wdHkgY29uZGl0aW9uIGJ5IGRlZmF1bHRcbiAgICAgICAgYWRkQ29uZGl0aW9uKCk7XG4gICAgfVxuXG4gICAgY29udGFpbmVyLmFwcGVuZENoaWxkKGdyb3VwRGl2KTtcbiAgICB1cGRhdGVCcmVhZGNydW1iKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRCdWlsZGVyUm93KHR5cGU6ICdncm91cCcgfCAnc29ydCcgfCAnZ3JvdXBTb3J0JywgZGF0YT86IGFueSkge1xuICAgIGxldCBjb250YWluZXJJZCA9ICcnO1xuICAgIGlmICh0eXBlID09PSAnZ3JvdXAnKSBjb250YWluZXJJZCA9ICdncm91cC1yb3dzLWNvbnRhaW5lcic7XG4gICAgZWxzZSBpZiAodHlwZSA9PT0gJ3NvcnQnKSBjb250YWluZXJJZCA9ICdzb3J0LXJvd3MtY29udGFpbmVyJztcbiAgICBlbHNlIGlmICh0eXBlID09PSAnZ3JvdXBTb3J0JykgY29udGFpbmVySWQgPSAnZ3JvdXAtc29ydC1yb3dzLWNvbnRhaW5lcic7XG5cbiAgICBjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChjb250YWluZXJJZCk7XG4gICAgaWYgKCFjb250YWluZXIpIHJldHVybjtcblxuICAgIGNvbnN0IGRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGRpdi5jbGFzc05hbWUgPSAnYnVpbGRlci1yb3cnO1xuICAgIGRpdi5kYXRhc2V0LnR5cGUgPSB0eXBlO1xuXG4gICAgaWYgKHR5cGUgPT09ICdncm91cCcpIHtcbiAgICAgICAgZGl2LnN0eWxlLmZsZXhXcmFwID0gJ3dyYXAnO1xuICAgICAgICBkaXYuaW5uZXJIVE1MID0gYFxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJyb3ctbnVtYmVyXCI+PC9zcGFuPlxuICAgICAgICAgICAgPHNlbGVjdCBjbGFzcz1cInNvdXJjZS1zZWxlY3RcIj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZmllbGRcIj5GaWVsZDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJmaXhlZFwiPkZpeGVkIFZhbHVlPC9vcHRpb24+XG4gICAgICAgICAgICA8L3NlbGVjdD5cblxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJpbnB1dC1jb250YWluZXJcIj5cbiAgICAgICAgICAgICAgICAgPCEtLSBXaWxsIGJlIHBvcHVsYXRlZCBiYXNlZCBvbiBzb3VyY2Ugc2VsZWN0aW9uIC0tPlxuICAgICAgICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwiZmllbGQtc2VsZWN0IHZhbHVlLWlucHV0LWZpZWxkXCI+XG4gICAgICAgICAgICAgICAgICAgICR7RklFTERfT1BUSU9OU31cbiAgICAgICAgICAgICAgICAgPC9zZWxlY3Q+XG4gICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwidGV4dFwiIGNsYXNzPVwidmFsdWUtaW5wdXQtdGV4dFwiIHBsYWNlaG9sZGVyPVwiR3JvdXAgTmFtZVwiIHN0eWxlPVwiZGlzcGxheTpub25lO1wiPlxuICAgICAgICAgICAgPC9zcGFuPlxuXG4gICAgICAgICAgICA8c3BhbiBzdHlsZT1cIm1hcmdpbi1sZWZ0OiAxMHB4O1wiPlRyYW5zZm9ybTo8L3NwYW4+XG4gICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwidHJhbnNmb3JtLXNlbGVjdFwiPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJub25lXCI+Tm9uZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJzdHJpcFRsZFwiPlN0cmlwIFRMRDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJkb21haW5cIj5HZXQgRG9tYWluPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImhvc3RuYW1lXCI+R2V0IEhvc3RuYW1lPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImxvd2VyY2FzZVwiPkxvd2VyY2FzZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJ1cHBlcmNhc2VcIj5VcHBlcmNhc2U8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZmlyc3RDaGFyXCI+Rmlyc3QgQ2hhcjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJyZWdleFwiPlJlZ2V4IEV4dHJhY3Rpb248L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwicmVnZXhSZXBsYWNlXCI+UmVnZXggUmVwbGFjZTwvb3B0aW9uPlxuICAgICAgICAgICAgPC9zZWxlY3Q+XG5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJyZWdleC1jb250YWluZXJcIiBzdHlsZT1cImRpc3BsYXk6bm9uZTsgZmxleC1iYXNpczogMTAwJTsgbWFyZ2luLXRvcDogOHB4OyBwYWRkaW5nOiA4cHg7IGJhY2tncm91bmQ6ICNmOGY5ZmE7IGJvcmRlcjogMXB4IGRhc2hlZCAjY2VkNGRhOyBib3JkZXItcmFkaXVzOiA0cHg7XCI+XG4gICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGdhcDogOHB4OyBtYXJnaW4tYm90dG9tOiA1cHg7XCI+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiZm9udC13ZWlnaHQ6IDUwMDsgZm9udC1zaXplOiAwLjllbTtcIj5QYXR0ZXJuOjwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgY2xhc3M9XCJ0cmFuc2Zvcm0tcGF0dGVyblwiIHBsYWNlaG9sZGVyPVwiZS5nLiBeKFxcdyspLShcXGQrKSRcIiBzdHlsZT1cImZsZXg6MTtcIj5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW4gdGl0bGU9XCJGb3IgZXh0cmFjdGlvbjogQ2FwdHVyZXMgYWxsIGdyb3VwcyBhbmQgY29uY2F0ZW5hdGVzIHRoZW0uIEV4YW1wbGU6ICd1c2VyLShcXGQrKScgLT4gJzEyMycuIEZvciByZXBsYWNlbWVudDogU3RhbmRhcmQgSlMgcmVnZXguXCIgc3R5bGU9XCJjdXJzb3I6IGhlbHA7IGNvbG9yOiAjMDA3YmZmOyBmb250LXdlaWdodDogYm9sZDsgYmFja2dyb3VuZDogI2U3ZjFmZjsgd2lkdGg6IDE4cHg7IGhlaWdodDogMThweDsgZGlzcGxheTogaW5saW5lLWZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGp1c3RpZnktY29udGVudDogY2VudGVyOyBib3JkZXItcmFkaXVzOiA1MCU7IGZvbnQtc2l6ZTogMTJweDtcIj4/PC9zcGFuPlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJyZXBsYWNlbWVudC1jb250YWluZXJcIiBzdHlsZT1cImRpc3BsYXk6bm9uZTsgYWxpZ24taXRlbXM6IGNlbnRlcjsgZ2FwOiA4cHg7IG1hcmdpbi1ib3R0b206IDVweDtcIj5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJmb250LXdlaWdodDogNTAwOyBmb250LXNpemU6IDAuOWVtO1wiPlJlcGxhY2U6PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInRleHRcIiBjbGFzcz1cInRyYW5zZm9ybS1yZXBsYWNlbWVudFwiIHBsYWNlaG9sZGVyPVwiZS5nLiAkMiAkMVwiIHN0eWxlPVwiZmxleDoxO1wiPlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBnYXA6IDhweDsgYWxpZ24taXRlbXM6IGNlbnRlcjsgZm9udC1zaXplOiAwLjllbTtcIj5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJmb250LXdlaWdodDogNTAwO1wiPlRlc3Q6PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInRleHRcIiBjbGFzcz1cInJlZ2V4LXRlc3QtaW5wdXRcIiBwbGFjZWhvbGRlcj1cIlRlc3QgU3RyaW5nXCIgc3R5bGU9XCJmbGV4OiAxO1wiPlxuICAgICAgICAgICAgICAgICAgICA8c3Bhbj4mcmFycjs8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwicmVnZXgtdGVzdC1yZXN1bHRcIiBzdHlsZT1cImZvbnQtZmFtaWx5OiBtb25vc3BhY2U7IGJhY2tncm91bmQ6IHdoaXRlOyBwYWRkaW5nOiAycHggNXB4OyBib3JkZXI6IDFweCBzb2xpZCAjZGRkOyBib3JkZXItcmFkaXVzOiAzcHg7IG1pbi13aWR0aDogNjBweDtcIj4ocHJldmlldyk8L3NwYW4+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJtYXJnaW4tbGVmdDogMTBweDtcIj5XaW5kb3c6PC9zcGFuPlxuICAgICAgICAgICAgPHNlbGVjdCBjbGFzcz1cIndpbmRvdy1tb2RlLXNlbGVjdFwiPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjdXJyZW50XCI+Q3VycmVudDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb21wb3VuZFwiPkNvbXBvdW5kPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIm5ld1wiPk5ldzwvb3B0aW9uPlxuICAgICAgICAgICAgPC9zZWxlY3Q+XG5cbiAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwibWFyZ2luLWxlZnQ6IDEwcHg7XCI+Q29sb3I6PC9zcGFuPlxuICAgICAgICAgICAgPHNlbGVjdCBjbGFzcz1cImNvbG9yLWlucHV0XCI+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImdyZXlcIj5HcmV5PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImJsdWVcIj5CbHVlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInJlZFwiPlJlZDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJ5ZWxsb3dcIj5ZZWxsb3c8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZ3JlZW5cIj5HcmVlbjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJwaW5rXCI+UGluazwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJwdXJwbGVcIj5QdXJwbGU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY3lhblwiPkN5YW48L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwib3JhbmdlXCI+T3JhbmdlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIm1hdGNoXCI+TWF0Y2ggVmFsdWU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZmllbGRcIj5Db2xvciBieSBGaWVsZDwvb3B0aW9uPlxuICAgICAgICAgICAgPC9zZWxlY3Q+XG4gICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwiY29sb3ItZmllbGQtc2VsZWN0XCIgc3R5bGU9XCJkaXNwbGF5Om5vbmU7XCI+XG4gICAgICAgICAgICAgICAgJHtGSUVMRF9PUFRJT05TfVxuICAgICAgICAgICAgPC9zZWxlY3Q+XG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cImNvbG9yLXRyYW5zZm9ybS1jb250YWluZXJcIiBzdHlsZT1cImRpc3BsYXk6bm9uZTsgbWFyZ2luLWxlZnQ6IDVweDsgYWxpZ24taXRlbXM6IGNlbnRlcjtcIj5cbiAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cImZvbnQtc2l6ZTogMC45ZW07IG1hcmdpbi1yaWdodDogM3B4O1wiPlRyYW5zOjwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwiY29sb3ItdHJhbnNmb3JtLXNlbGVjdFwiPlxuICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwibm9uZVwiPk5vbmU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInN0cmlwVGxkXCI+U3RyaXAgVExEPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJkb21haW5cIj5HZXQgRG9tYWluPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJob3N0bmFtZVwiPkdldCBIb3N0bmFtZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwibG93ZXJjYXNlXCI+TG93ZXJjYXNlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJ1cHBlcmNhc2VcIj5VcHBlcmNhc2U8L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImZpcnN0Q2hhclwiPkZpcnN0IENoYXI8L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInJlZ2V4XCI+UmVnZXg8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8L3NlbGVjdD5cbiAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInRleHRcIiBjbGFzcz1cImNvbG9yLXRyYW5zZm9ybS1wYXR0ZXJuXCIgcGxhY2Vob2xkZXI9XCJSZWdleFwiIHN0eWxlPVwiZGlzcGxheTpub25lOyB3aWR0aDogODBweDsgbWFyZ2luLWxlZnQ6IDNweDtcIj5cbiAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgICAgIDxsYWJlbD48aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgY2xhc3M9XCJyYW5kb20tY29sb3ItY2hlY2tcIiBjaGVja2VkPiBSYW5kb208L2xhYmVsPlxuXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwicm93LWFjdGlvbnNcIj5cbiAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwic21hbGwtYnRuIGJ0bi1kZWxcIiBzdHlsZT1cImJhY2tncm91bmQ6ICNmZmNjY2M7IGNvbG9yOiBkYXJrcmVkO1wiPkRlbGV0ZTwvYnV0dG9uPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgIGA7XG5cbiAgICAgICAgLy8gQWRkIHNwZWNpZmljIGxpc3RlbmVycyBmb3IgR3JvdXAgcm93XG4gICAgICAgIGNvbnN0IHNvdXJjZVNlbGVjdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcuc291cmNlLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICBjb25zdCBmaWVsZFNlbGVjdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcudmFsdWUtaW5wdXQtZmllbGQnKSBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgY29uc3QgdGV4dElucHV0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dC10ZXh0JykgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IGNvbG9ySW5wdXQgPSBkaXYucXVlcnlTZWxlY3RvcignLmNvbG9yLWlucHV0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IGNvbG9yRmllbGRTZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLmNvbG9yLWZpZWxkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICBjb25zdCBjb2xvclRyYW5zZm9ybUNvbnRhaW5lciA9IGRpdi5xdWVyeVNlbGVjdG9yKCcuY29sb3ItdHJhbnNmb3JtLWNvbnRhaW5lcicpIGFzIEhUTUxFbGVtZW50O1xuICAgICAgICBjb25zdCBjb2xvclRyYW5zZm9ybVNlbGVjdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcuY29sb3ItdHJhbnNmb3JtLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICBjb25zdCBjb2xvclRyYW5zZm9ybVBhdHRlcm4gPSBkaXYucXVlcnlTZWxlY3RvcignLmNvbG9yLXRyYW5zZm9ybS1wYXR0ZXJuJykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgY29uc3QgcmFuZG9tQ2hlY2sgPSBkaXYucXVlcnlTZWxlY3RvcignLnJhbmRvbS1jb2xvci1jaGVjaycpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG5cbiAgICAgICAgLy8gUmVnZXggTG9naWNcbiAgICAgICAgY29uc3QgdHJhbnNmb3JtU2VsZWN0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy50cmFuc2Zvcm0tc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IHJlZ2V4Q29udGFpbmVyID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5yZWdleC1jb250YWluZXInKSBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgY29uc3QgcGF0dGVybklucHV0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy50cmFuc2Zvcm0tcGF0dGVybicpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IHJlcGxhY2VtZW50SW5wdXQgPSBkaXYucXVlcnlTZWxlY3RvcignLnRyYW5zZm9ybS1yZXBsYWNlbWVudCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IHRlc3RJbnB1dCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcucmVnZXgtdGVzdC1pbnB1dCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IHRlc3RSZXN1bHQgPSBkaXYucXVlcnlTZWxlY3RvcignLnJlZ2V4LXRlc3QtcmVzdWx0JykgYXMgSFRNTEVsZW1lbnQ7XG5cbiAgICAgICAgY29uc3QgdG9nZ2xlVHJhbnNmb3JtID0gKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgdmFsID0gdHJhbnNmb3JtU2VsZWN0LnZhbHVlO1xuICAgICAgICAgICAgaWYgKHZhbCA9PT0gJ3JlZ2V4JyB8fCB2YWwgPT09ICdyZWdleFJlcGxhY2UnKSB7XG4gICAgICAgICAgICAgICAgcmVnZXhDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVwQ29udGFpbmVyID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5yZXBsYWNlbWVudC1jb250YWluZXInKSBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgICAgICAgICBpZiAocmVwQ29udGFpbmVyKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlcENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gdmFsID09PSAncmVnZXhSZXBsYWNlJyA/ICdmbGV4JyA6ICdub25lJztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlZ2V4Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB1cGRhdGVCcmVhZGNydW1iKCk7XG4gICAgICAgIH07XG4gICAgICAgIHRyYW5zZm9ybVNlbGVjdC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB0b2dnbGVUcmFuc2Zvcm0pO1xuXG4gICAgICAgIGNvbnN0IHVwZGF0ZVRlc3QgPSAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBwYXQgPSBwYXR0ZXJuSW5wdXQudmFsdWU7XG4gICAgICAgICAgICBjb25zdCB0eHQgPSB0ZXN0SW5wdXQudmFsdWU7XG4gICAgICAgICAgICBpZiAoIXBhdCB8fCAhdHh0KSB7XG4gICAgICAgICAgICAgICAgIHRlc3RSZXN1bHQudGV4dENvbnRlbnQgPSBcIihwcmV2aWV3KVwiO1xuICAgICAgICAgICAgICAgICB0ZXN0UmVzdWx0LnN0eWxlLmNvbG9yID0gXCIjNTU1XCI7XG4gICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgaWYgKHRyYW5zZm9ybVNlbGVjdC52YWx1ZSA9PT0gJ3JlZ2V4UmVwbGFjZScpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVwID0gcmVwbGFjZW1lbnRJbnB1dC52YWx1ZSB8fCBcIlwiO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByZXMgPSB0eHQucmVwbGFjZShuZXcgUmVnRXhwKHBhdCwgJ2cnKSwgcmVwKTtcbiAgICAgICAgICAgICAgICAgICAgdGVzdFJlc3VsdC50ZXh0Q29udGVudCA9IHJlcztcbiAgICAgICAgICAgICAgICAgICAgdGVzdFJlc3VsdC5zdHlsZS5jb2xvciA9IFwiZ3JlZW5cIjtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByZWdleCA9IG5ldyBSZWdFeHAocGF0KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbWF0Y2ggPSByZWdleC5leGVjKHR4dCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgIGxldCBleHRyYWN0ZWQgPSBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgbWF0Y2gubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXh0cmFjdGVkICs9IG1hdGNoW2ldIHx8IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgIHRlc3RSZXN1bHQudGV4dENvbnRlbnQgPSBleHRyYWN0ZWQgfHwgXCIoZW1wdHkgZ3JvdXApXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgdGVzdFJlc3VsdC5zdHlsZS5jb2xvciA9IFwiZ3JlZW5cIjtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICB0ZXN0UmVzdWx0LnRleHRDb250ZW50ID0gXCIobm8gbWF0Y2gpXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgdGVzdFJlc3VsdC5zdHlsZS5jb2xvciA9IFwicmVkXCI7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgdGVzdFJlc3VsdC50ZXh0Q29udGVudCA9IFwiKGludmFsaWQgcmVnZXgpXCI7XG4gICAgICAgICAgICAgICAgdGVzdFJlc3VsdC5zdHlsZS5jb2xvciA9IFwicmVkXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHBhdHRlcm5JbnB1dC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsICgpID0+IHsgdXBkYXRlVGVzdCgpOyB1cGRhdGVCcmVhZGNydW1iKCk7IH0pO1xuICAgICAgICBpZiAocmVwbGFjZW1lbnRJbnB1dCkge1xuICAgICAgICAgICAgcmVwbGFjZW1lbnRJbnB1dC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsICgpID0+IHsgdXBkYXRlVGVzdCgpOyB1cGRhdGVCcmVhZGNydW1iKCk7IH0pO1xuICAgICAgICB9XG4gICAgICAgIHRlc3RJbnB1dC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIHVwZGF0ZVRlc3QpO1xuXG5cbiAgICAgICAgLy8gVG9nZ2xlIGlucHV0IHR5cGVcbiAgICAgICAgY29uc3QgdG9nZ2xlSW5wdXQgPSAoKSA9PiB7XG4gICAgICAgICAgICBpZiAoc291cmNlU2VsZWN0LnZhbHVlID09PSAnZmllbGQnKSB7XG4gICAgICAgICAgICAgICAgZmllbGRTZWxlY3Quc3R5bGUuZGlzcGxheSA9ICdpbmxpbmUtYmxvY2snO1xuICAgICAgICAgICAgICAgIHRleHRJbnB1dC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBmaWVsZFNlbGVjdC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICAgICAgICAgIHRleHRJbnB1dC5zdHlsZS5kaXNwbGF5ID0gJ2lubGluZS1ibG9jayc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB1cGRhdGVCcmVhZGNydW1iKCk7XG4gICAgICAgIH07XG4gICAgICAgIHNvdXJjZVNlbGVjdC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB0b2dnbGVJbnB1dCk7XG5cbiAgICAgICAgLy8gVG9nZ2xlIGNvbG9yIHRyYW5zZm9ybSBwYXR0ZXJuXG4gICAgICAgIGNvbnN0IHRvZ2dsZUNvbG9yVHJhbnNmb3JtID0gKCkgPT4ge1xuICAgICAgICAgICAgIGlmIChjb2xvclRyYW5zZm9ybVNlbGVjdC52YWx1ZSA9PT0gJ3JlZ2V4Jykge1xuICAgICAgICAgICAgICAgICBjb2xvclRyYW5zZm9ybVBhdHRlcm4uc3R5bGUuZGlzcGxheSA9ICdpbmxpbmUtYmxvY2snO1xuICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgIGNvbG9yVHJhbnNmb3JtUGF0dGVybi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB1cGRhdGVCcmVhZGNydW1iKCk7XG4gICAgICAgIH07XG4gICAgICAgIGNvbG9yVHJhbnNmb3JtU2VsZWN0LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIHRvZ2dsZUNvbG9yVHJhbnNmb3JtKTtcbiAgICAgICAgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuLmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgdXBkYXRlQnJlYWRjcnVtYik7XG5cbiAgICAgICAgLy8gVG9nZ2xlIGNvbG9yIGlucHV0XG4gICAgICAgIGNvbnN0IHRvZ2dsZUNvbG9yID0gKCkgPT4ge1xuICAgICAgICAgICAgaWYgKHJhbmRvbUNoZWNrLmNoZWNrZWQpIHtcbiAgICAgICAgICAgICAgICBjb2xvcklucHV0LmRpc2FibGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBjb2xvcklucHV0LnN0eWxlLm9wYWNpdHkgPSAnMC41JztcbiAgICAgICAgICAgICAgICBjb2xvckZpZWxkU2VsZWN0LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm1Db250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29sb3JJbnB1dC5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGNvbG9ySW5wdXQuc3R5bGUub3BhY2l0eSA9ICcxJztcbiAgICAgICAgICAgICAgICBpZiAoY29sb3JJbnB1dC52YWx1ZSA9PT0gJ2ZpZWxkJykge1xuICAgICAgICAgICAgICAgICAgICBjb2xvckZpZWxkU2VsZWN0LnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lLWJsb2NrJztcbiAgICAgICAgICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm1Db250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdpbmxpbmUtZmxleCc7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgY29sb3JGaWVsZFNlbGVjdC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICAgICAgICAgICAgICBjb2xvclRyYW5zZm9ybUNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgcmFuZG9tQ2hlY2suYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgdG9nZ2xlQ29sb3IpO1xuICAgICAgICBjb2xvcklucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIHRvZ2dsZUNvbG9yKTtcbiAgICAgICAgdG9nZ2xlQ29sb3IoKTsgLy8gaW5pdFxuXG4gICAgfSBlbHNlIGlmICh0eXBlID09PSAnc29ydCcgfHwgdHlwZSA9PT0gJ2dyb3VwU29ydCcpIHtcbiAgICAgICAgZGl2LmlubmVySFRNTCA9IGBcbiAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJmaWVsZC1zZWxlY3RcIj5cbiAgICAgICAgICAgICAgICAke0ZJRUxEX09QVElPTlN9XG4gICAgICAgICAgICA8L3NlbGVjdD5cbiAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJvcmRlci1zZWxlY3RcIj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiYXNjXCI+YSB0byB6IChhc2MpPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImRlc2NcIj56IHRvIGEgKGRlc2MpPC9vcHRpb24+XG4gICAgICAgICAgICA8L3NlbGVjdD5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJyb3ctYWN0aW9uc1wiPlxuICAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwic21hbGwtYnRuIGJ0bi1kZWxcIiBzdHlsZT1cImJhY2tncm91bmQ6ICNmZmNjY2M7IGNvbG9yOiBkYXJrcmVkO1wiPkRlbGV0ZTwvYnV0dG9uPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgIGA7XG4gICAgfVxuXG4gICAgLy8gUG9wdWxhdGUgZGF0YSBpZiBwcm92aWRlZCAoZm9yIGVkaXRpbmcpXG4gICAgaWYgKGRhdGEpIHtcbiAgICAgICAgaWYgKHR5cGUgPT09ICdncm91cCcpIHtcbiAgICAgICAgICAgIGNvbnN0IHNvdXJjZVNlbGVjdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcuc291cmNlLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICAgICAgY29uc3QgZmllbGRTZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLnZhbHVlLWlucHV0LWZpZWxkJykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgICAgICBjb25zdCB0ZXh0SW5wdXQgPSBkaXYucXVlcnlTZWxlY3RvcignLnZhbHVlLWlucHV0LXRleHQnKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICAgICAgY29uc3QgdHJhbnNmb3JtU2VsZWN0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy50cmFuc2Zvcm0tc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgICAgICBjb25zdCBjb2xvcklucHV0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5jb2xvci1pbnB1dCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICAgICAgY29uc3QgY29sb3JGaWVsZFNlbGVjdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcuY29sb3ItZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgICAgICBjb25zdCBjb2xvclRyYW5zZm9ybVNlbGVjdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcuY29sb3ItdHJhbnNmb3JtLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICAgICAgY29uc3QgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5jb2xvci10cmFuc2Zvcm0tcGF0dGVybicpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgICAgICBjb25zdCByYW5kb21DaGVjayA9IGRpdi5xdWVyeVNlbGVjdG9yKCcucmFuZG9tLWNvbG9yLWNoZWNrJykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgICAgIGNvbnN0IHdpbmRvd01vZGVTZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLndpbmRvdy1tb2RlLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuXG4gICAgICAgICAgICBpZiAoZGF0YS5zb3VyY2UpIHNvdXJjZVNlbGVjdC52YWx1ZSA9IGRhdGEuc291cmNlO1xuXG4gICAgICAgICAgICAvLyBUcmlnZ2VyIHRvZ2dsZSB0byBzaG93IGNvcnJlY3QgaW5wdXRcbiAgICAgICAgICAgIHNvdXJjZVNlbGVjdC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJykpO1xuXG4gICAgICAgICAgICBpZiAoZGF0YS5zb3VyY2UgPT09ICdmaWVsZCcpIHtcbiAgICAgICAgICAgICAgICBpZiAoZGF0YS52YWx1ZSkgZmllbGRTZWxlY3QudmFsdWUgPSBkYXRhLnZhbHVlO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAoZGF0YS52YWx1ZSkgdGV4dElucHV0LnZhbHVlID0gZGF0YS52YWx1ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGRhdGEudHJhbnNmb3JtKSB0cmFuc2Zvcm1TZWxlY3QudmFsdWUgPSBkYXRhLnRyYW5zZm9ybTtcbiAgICAgICAgICAgIGlmIChkYXRhLnRyYW5zZm9ybVBhdHRlcm4pIChkaXYucXVlcnlTZWxlY3RvcignLnRyYW5zZm9ybS1wYXR0ZXJuJykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUgPSBkYXRhLnRyYW5zZm9ybVBhdHRlcm47XG4gICAgICAgICAgICBpZiAoZGF0YS50cmFuc2Zvcm1SZXBsYWNlbWVudCkgKGRpdi5xdWVyeVNlbGVjdG9yKCcudHJhbnNmb3JtLXJlcGxhY2VtZW50JykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUgPSBkYXRhLnRyYW5zZm9ybVJlcGxhY2VtZW50O1xuXG4gICAgICAgICAgICAvLyBUcmlnZ2VyIHRvZ2dsZSBmb3IgcmVnZXggVUlcbiAgICAgICAgICAgIHRyYW5zZm9ybVNlbGVjdC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJykpO1xuXG4gICAgICAgICAgICBpZiAoZGF0YS53aW5kb3dNb2RlKSB3aW5kb3dNb2RlU2VsZWN0LnZhbHVlID0gZGF0YS53aW5kb3dNb2RlO1xuXG4gICAgICAgICAgICBpZiAoZGF0YS5jb2xvciAmJiBkYXRhLmNvbG9yICE9PSAncmFuZG9tJykge1xuICAgICAgICAgICAgICAgIHJhbmRvbUNoZWNrLmNoZWNrZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBjb2xvcklucHV0LnZhbHVlID0gZGF0YS5jb2xvcjtcbiAgICAgICAgICAgICAgICBpZiAoZGF0YS5jb2xvciA9PT0gJ2ZpZWxkJyAmJiBkYXRhLmNvbG9yRmllbGQpIHtcbiAgICAgICAgICAgICAgICAgICAgY29sb3JGaWVsZFNlbGVjdC52YWx1ZSA9IGRhdGEuY29sb3JGaWVsZDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGRhdGEuY29sb3JUcmFuc2Zvcm0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICBjb2xvclRyYW5zZm9ybVNlbGVjdC52YWx1ZSA9IGRhdGEuY29sb3JUcmFuc2Zvcm07XG4gICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRhdGEuY29sb3JUcmFuc2Zvcm1QYXR0ZXJuKSBjb2xvclRyYW5zZm9ybVBhdHRlcm4udmFsdWUgPSBkYXRhLmNvbG9yVHJhbnNmb3JtUGF0dGVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmFuZG9tQ2hlY2suY2hlY2tlZCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAgLy8gVHJpZ2dlciB0b2dnbGUgY29sb3JcbiAgICAgICAgICAgIHJhbmRvbUNoZWNrLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnKSk7XG4gICAgICAgICAgICBjb2xvclRyYW5zZm9ybVNlbGVjdC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJykpO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdzb3J0JyB8fCB0eXBlID09PSAnZ3JvdXBTb3J0Jykge1xuICAgICAgICAgICAgIGlmIChkYXRhLmZpZWxkKSAoZGl2LnF1ZXJ5U2VsZWN0b3IoJy5maWVsZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWUgPSBkYXRhLmZpZWxkO1xuICAgICAgICAgICAgIGlmIChkYXRhLm9yZGVyKSAoZGl2LnF1ZXJ5U2VsZWN0b3IoJy5vcmRlci1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWUgPSBkYXRhLm9yZGVyO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gTGlzdGVuZXJzIChHZW5lcmFsKVxuICAgIGRpdi5xdWVyeVNlbGVjdG9yKCcuYnRuLWRlbCcpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgZGl2LnJlbW92ZSgpO1xuICAgICAgICB1cGRhdGVCcmVhZGNydW1iKCk7XG4gICAgfSk7XG5cbiAgICAvLyBBTkQgLyBPUiBsaXN0ZW5lcnMgKFZpc3VhbCBtYWlubHksIG9yIGFwcGVuZGluZyBuZXcgcm93cylcbiAgICBkaXYucXVlcnlTZWxlY3RvcignLmJ0bi1hbmQnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGFkZEJ1aWxkZXJSb3codHlwZSk7IC8vIEp1c3QgYWRkIGFub3RoZXIgcm93XG4gICAgfSk7XG5cbiAgICBkaXYucXVlcnlTZWxlY3RvckFsbCgnaW5wdXQsIHNlbGVjdCcpLmZvckVhY2goZWwgPT4ge1xuICAgICAgICBlbC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB1cGRhdGVCcmVhZGNydW1iKTtcbiAgICAgICAgZWwuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCB1cGRhdGVCcmVhZGNydW1iKTtcbiAgICB9KTtcblxuICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChkaXYpO1xuICAgIHVwZGF0ZUJyZWFkY3J1bWIoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsZWFyQnVpbGRlcigpIHtcbiAgICAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LW5hbWUnKSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSA9ICcnO1xuICAgIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtZGVzYycpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlID0gJyc7XG5cbiAgICAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LWF1dG9ydW4nKSBhcyBIVE1MSW5wdXRFbGVtZW50KS5jaGVja2VkID0gZmFsc2U7XG4gICAgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1zZXBhcmF0ZS13aW5kb3cnKSBhcyBIVE1MSW5wdXRFbGVtZW50KS5jaGVja2VkID0gZmFsc2U7XG5cbiAgICBjb25zdCBzb3J0R3JvdXBzQ2hlY2sgPSAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LXNvcnRncm91cHMtY2hlY2snKSBhcyBIVE1MSW5wdXRFbGVtZW50KTtcbiAgICBpZiAoc29ydEdyb3Vwc0NoZWNrKSB7XG4gICAgICAgIHNvcnRHcm91cHNDaGVjay5jaGVja2VkID0gZmFsc2U7XG4gICAgICAgIC8vIFRyaWdnZXIgY2hhbmdlIHRvIGhpZGUgY29udGFpbmVyXG4gICAgICAgIHNvcnRHcm91cHNDaGVjay5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJykpO1xuICAgIH1cblxuICAgIGNvbnN0IGxvYWRTZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXRlZ3ktbG9hZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICBpZiAobG9hZFNlbGVjdCkgbG9hZFNlbGVjdC52YWx1ZSA9ICcnO1xuXG4gICAgWydmaWx0ZXItcm93cy1jb250YWluZXInLCAnZ3JvdXAtcm93cy1jb250YWluZXInLCAnc29ydC1yb3dzLWNvbnRhaW5lcicsICdncm91cC1zb3J0LXJvd3MtY29udGFpbmVyJ10uZm9yRWFjaChpZCA9PiB7XG4gICAgICAgIGNvbnN0IGVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaWQpO1xuICAgICAgICBpZiAoZWwpIGVsLmlubmVySFRNTCA9ICcnO1xuICAgIH0pO1xuXG4gICAgY29uc3QgYnVpbGRlclJlc3VsdHMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnVpbGRlci1yZXN1bHRzJyk7XG4gICAgaWYgKGJ1aWxkZXJSZXN1bHRzKSBidWlsZGVyUmVzdWx0cy5pbm5lckhUTUwgPSAnJztcblxuICAgIGFkZEZpbHRlckdyb3VwUm93KCk7IC8vIFJlc2V0IHdpdGggb25lIGVtcHR5IGZpbHRlciBncm91cFxuICAgIHVwZGF0ZUJyZWFkY3J1bWIoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZUJyZWFkY3J1bWIoKSB7XG4gICAgY29uc3QgYnJlYWRjcnVtYiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdGVneS1icmVhZGNydW1iJyk7XG4gICAgaWYgKCFicmVhZGNydW1iKSByZXR1cm47XG5cbiAgICBsZXQgdGV4dCA9ICdBbGwnO1xuXG4gICAgLy8gRmlsdGVyc1xuICAgIGNvbnN0IGZpbHRlcnMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZmlsdGVyLXJvd3MtY29udGFpbmVyJyk/LnF1ZXJ5U2VsZWN0b3JBbGwoJy5idWlsZGVyLXJvdycpO1xuICAgIGlmIChmaWx0ZXJzICYmIGZpbHRlcnMubGVuZ3RoID4gMCkge1xuICAgICAgICBmaWx0ZXJzLmZvckVhY2gocm93ID0+IHtcbiAgICAgICAgICAgICBjb25zdCBmaWVsZCA9IChyb3cucXVlcnlTZWxlY3RvcignLmZpZWxkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgICBjb25zdCBvcCA9IChyb3cucXVlcnlTZWxlY3RvcignLm9wZXJhdG9yLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgICBjb25zdCB2YWwgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgIGlmICh2YWwpIHRleHQgKz0gYCA+ICR7ZmllbGR9ICR7b3B9ICR7dmFsfWA7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIEdyb3Vwc1xuICAgIGNvbnN0IGdyb3VwcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdncm91cC1yb3dzLWNvbnRhaW5lcicpPy5xdWVyeVNlbGVjdG9yQWxsKCcuYnVpbGRlci1yb3cnKTtcbiAgICBpZiAoZ3JvdXBzICYmIGdyb3Vwcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGdyb3Vwcy5mb3JFYWNoKHJvdyA9PiB7XG4gICAgICAgICAgICAgY29uc3Qgc291cmNlID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcuc291cmNlLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgICBsZXQgdmFsID0gXCJcIjtcbiAgICAgICAgICAgICBpZiAoc291cmNlID09PSAnZmllbGQnKSB7XG4gICAgICAgICAgICAgICAgIHZhbCA9IChyb3cucXVlcnlTZWxlY3RvcignLnZhbHVlLWlucHV0LWZpZWxkJykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgICAgICB0ZXh0ICs9IGAgPiBHcm91cCBieSBGaWVsZDogJHt2YWx9YDtcbiAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICB2YWwgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dC10ZXh0JykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICAgICAgIHRleHQgKz0gYCA+IEdyb3VwIGJ5IE5hbWU6IFwiJHt2YWx9XCJgO1xuICAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gR3JvdXAgU29ydHNcbiAgICBjb25zdCBncm91cFNvcnRzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dyb3VwLXNvcnQtcm93cy1jb250YWluZXInKT8ucXVlcnlTZWxlY3RvckFsbCgnLmJ1aWxkZXItcm93Jyk7XG4gICAgaWYgKGdyb3VwU29ydHMgJiYgZ3JvdXBTb3J0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGdyb3VwU29ydHMuZm9yRWFjaChyb3cgPT4ge1xuICAgICAgICAgICAgY29uc3QgZmllbGQgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5maWVsZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICBjb25zdCBvcmRlciA9IChyb3cucXVlcnlTZWxlY3RvcignLm9yZGVyLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgIHRleHQgKz0gYCA+IEdyb3VwIHNvcnQgYnkgJHtmaWVsZH0gKCR7b3JkZXJ9KWA7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFNvcnRzXG4gICAgY29uc3Qgc29ydHMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc29ydC1yb3dzLWNvbnRhaW5lcicpPy5xdWVyeVNlbGVjdG9yQWxsKCcuYnVpbGRlci1yb3cnKTtcbiAgICBpZiAoc29ydHMgJiYgc29ydHMubGVuZ3RoID4gMCkge1xuICAgICAgICBzb3J0cy5mb3JFYWNoKHJvdyA9PiB7XG4gICAgICAgICAgICAgY29uc3QgZmllbGQgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5maWVsZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICAgY29uc3Qgb3JkZXIgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5vcmRlci1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICAgdGV4dCArPSBgID4gU29ydCBieSAke2ZpZWxkfSAoJHtvcmRlcn0pYDtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgYnJlYWRjcnVtYi50ZXh0Q29udGVudCA9IHRleHQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRCdWlsZGVyU3RyYXRlZ3koaWdub3JlVmFsaWRhdGlvbjogYm9vbGVhbiA9IGZhbHNlKTogQ3VzdG9tU3RyYXRlZ3kgfCBudWxsIHtcbiAgICBjb25zdCBpZElucHV0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LW5hbWUnKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgIGNvbnN0IGxhYmVsSW5wdXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtZGVzYycpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG5cbiAgICBsZXQgaWQgPSBpZElucHV0ID8gaWRJbnB1dC52YWx1ZS50cmltKCkgOiAnJztcbiAgICBsZXQgbGFiZWwgPSBsYWJlbElucHV0ID8gbGFiZWxJbnB1dC52YWx1ZS50cmltKCkgOiAnJztcbiAgICBjb25zdCBmYWxsYmFjayA9ICdNaXNjJzsgLy8gRmFsbGJhY2sgcmVtb3ZlZCBmcm9tIFVJLCBkZWZhdWx0IHRvIE1pc2NcbiAgICBjb25zdCBzb3J0R3JvdXBzID0gKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1zb3J0Z3JvdXBzLWNoZWNrJykgYXMgSFRNTElucHV0RWxlbWVudCkuY2hlY2tlZDtcblxuICAgIGlmICghaWdub3JlVmFsaWRhdGlvbiAmJiAoIWlkIHx8ICFsYWJlbCkpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgaWYgKGlnbm9yZVZhbGlkYXRpb24pIHtcbiAgICAgICAgaWYgKCFpZCkgaWQgPSAndGVtcF9zaW1faWQnO1xuICAgICAgICBpZiAoIWxhYmVsKSBsYWJlbCA9ICdTaW11bGF0aW9uJztcbiAgICB9XG5cbiAgICBjb25zdCBmaWx0ZXJHcm91cHM6IFJ1bGVDb25kaXRpb25bXVtdID0gW107XG4gICAgY29uc3QgZmlsdGVyQ29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2ZpbHRlci1yb3dzLWNvbnRhaW5lcicpO1xuXG4gICAgLy8gUGFyc2UgZmlsdGVyIGdyb3Vwc1xuICAgIGlmIChmaWx0ZXJDb250YWluZXIpIHtcbiAgICAgICAgY29uc3QgZ3JvdXBSb3dzID0gZmlsdGVyQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5maWx0ZXItZ3JvdXAtcm93Jyk7XG4gICAgICAgIGlmIChncm91cFJvd3MubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgZ3JvdXBSb3dzLmZvckVhY2goZ3JvdXBSb3cgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvbmRpdGlvbnM6IFJ1bGVDb25kaXRpb25bXSA9IFtdO1xuICAgICAgICAgICAgICAgIGdyb3VwUm93LnF1ZXJ5U2VsZWN0b3JBbGwoJy5idWlsZGVyLXJvdycpLmZvckVhY2gocm93ID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZmllbGQgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5maWVsZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG9wZXJhdG9yID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcub3BlcmF0b3Itc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlIGFzIGFueTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdmFsdWUgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgICAgICAgICAvLyBPbmx5IGFkZCBpZiB2YWx1ZSBpcyBwcmVzZW50IG9yIG9wZXJhdG9yIGRvZXNuJ3QgcmVxdWlyZSBpdFxuICAgICAgICAgICAgICAgICAgICBpZiAodmFsdWUgfHwgWydleGlzdHMnLCAnZG9lc05vdEV4aXN0JywgJ2lzTnVsbCcsICdpc05vdE51bGwnXS5pbmNsdWRlcyhvcGVyYXRvcikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbmRpdGlvbnMucHVzaCh7IGZpZWxkLCBvcGVyYXRvciwgdmFsdWUgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBpZiAoY29uZGl0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGZpbHRlckdyb3Vwcy5wdXNoKGNvbmRpdGlvbnMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gRm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHkgLyBzaW1wbGUgc3RyYXRlZ2llcywgcG9wdWxhdGUgZmlsdGVycyB3aXRoIHRoZSBmaXJzdCBncm91cFxuICAgIGNvbnN0IGZpbHRlcnM6IFJ1bGVDb25kaXRpb25bXSA9IGZpbHRlckdyb3Vwcy5sZW5ndGggPiAwID8gZmlsdGVyR3JvdXBzWzBdIDogW107XG5cbiAgICBjb25zdCBncm91cGluZ1J1bGVzOiBHcm91cGluZ1J1bGVbXSA9IFtdO1xuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdncm91cC1yb3dzLWNvbnRhaW5lcicpPy5xdWVyeVNlbGVjdG9yQWxsKCcuYnVpbGRlci1yb3cnKS5mb3JFYWNoKHJvdyA9PiB7XG4gICAgICAgIGNvbnN0IHNvdXJjZSA9IChyb3cucXVlcnlTZWxlY3RvcignLnNvdXJjZS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWUgYXMgXCJmaWVsZFwiIHwgXCJmaXhlZFwiO1xuICAgICAgICBsZXQgdmFsdWUgPSBcIlwiO1xuICAgICAgICBpZiAoc291cmNlID09PSAnZmllbGQnKSB7XG4gICAgICAgICAgICB2YWx1ZSA9IChyb3cucXVlcnlTZWxlY3RvcignLnZhbHVlLWlucHV0LWZpZWxkJykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWUgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dC10ZXh0JykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB0cmFuc2Zvcm0gPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy50cmFuc2Zvcm0tc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlIGFzIGFueTtcbiAgICAgICAgY29uc3QgdHJhbnNmb3JtUGF0dGVybiA9IChyb3cucXVlcnlTZWxlY3RvcignLnRyYW5zZm9ybS1wYXR0ZXJuJykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWU7XG4gICAgICAgIGNvbnN0IHRyYW5zZm9ybVJlcGxhY2VtZW50ID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcudHJhbnNmb3JtLXJlcGxhY2VtZW50JykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWU7XG4gICAgICAgIGNvbnN0IHdpbmRvd01vZGUgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy53aW5kb3ctbW9kZS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWUgYXMgYW55O1xuXG4gICAgICAgIGNvbnN0IHJhbmRvbUNoZWNrID0gcm93LnF1ZXJ5U2VsZWN0b3IoJy5yYW5kb20tY29sb3ItY2hlY2snKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICBjb25zdCBjb2xvcklucHV0ID0gcm93LnF1ZXJ5U2VsZWN0b3IoJy5jb2xvci1pbnB1dCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICBjb25zdCBjb2xvckZpZWxkU2VsZWN0ID0gcm93LnF1ZXJ5U2VsZWN0b3IoJy5jb2xvci1maWVsZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgY29uc3QgY29sb3JUcmFuc2Zvcm1TZWxlY3QgPSByb3cucXVlcnlTZWxlY3RvcignLmNvbG9yLXRyYW5zZm9ybS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgY29uc3QgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuID0gcm93LnF1ZXJ5U2VsZWN0b3IoJy5jb2xvci10cmFuc2Zvcm0tcGF0dGVybicpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG5cbiAgICAgICAgbGV0IGNvbG9yID0gJ3JhbmRvbSc7XG4gICAgICAgIGxldCBjb2xvckZpZWxkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICAgIGxldCBjb2xvclRyYW5zZm9ybTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgICBsZXQgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuVmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICAgICAgICBpZiAoIXJhbmRvbUNoZWNrLmNoZWNrZWQpIHtcbiAgICAgICAgICAgIGNvbG9yID0gY29sb3JJbnB1dC52YWx1ZTtcbiAgICAgICAgICAgIGlmIChjb2xvciA9PT0gJ2ZpZWxkJykge1xuICAgICAgICAgICAgICAgIGNvbG9yRmllbGQgPSBjb2xvckZpZWxkU2VsZWN0LnZhbHVlO1xuICAgICAgICAgICAgICAgIGNvbG9yVHJhbnNmb3JtID0gY29sb3JUcmFuc2Zvcm1TZWxlY3QudmFsdWUgYXMgYW55O1xuICAgICAgICAgICAgICAgIGlmIChjb2xvclRyYW5zZm9ybSA9PT0gJ3JlZ2V4Jykge1xuICAgICAgICAgICAgICAgICAgICBjb2xvclRyYW5zZm9ybVBhdHRlcm5WYWx1ZSA9IGNvbG9yVHJhbnNmb3JtUGF0dGVybi52YWx1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgICAgIGdyb3VwaW5nUnVsZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgc291cmNlLFxuICAgICAgICAgICAgICAgIHZhbHVlLFxuICAgICAgICAgICAgICAgIGNvbG9yLFxuICAgICAgICAgICAgICAgIGNvbG9yRmllbGQsXG4gICAgICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm06IGNvbG9yVHJhbnNmb3JtIGFzIGFueSxcbiAgICAgICAgICAgICAgICBjb2xvclRyYW5zZm9ybVBhdHRlcm46IGNvbG9yVHJhbnNmb3JtUGF0dGVyblZhbHVlLFxuICAgICAgICAgICAgICAgIHRyYW5zZm9ybSxcbiAgICAgICAgICAgICAgICB0cmFuc2Zvcm1QYXR0ZXJuOiAodHJhbnNmb3JtID09PSAncmVnZXgnIHx8IHRyYW5zZm9ybSA9PT0gJ3JlZ2V4UmVwbGFjZScpID8gdHJhbnNmb3JtUGF0dGVybiA6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICB0cmFuc2Zvcm1SZXBsYWNlbWVudDogdHJhbnNmb3JtID09PSAncmVnZXhSZXBsYWNlJyA/IHRyYW5zZm9ybVJlcGxhY2VtZW50IDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgICAgIHdpbmRvd01vZGVcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBjb25zdCBzb3J0aW5nUnVsZXM6IFNvcnRpbmdSdWxlW10gPSBbXTtcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc29ydC1yb3dzLWNvbnRhaW5lcicpPy5xdWVyeVNlbGVjdG9yQWxsKCcuYnVpbGRlci1yb3cnKS5mb3JFYWNoKHJvdyA9PiB7XG4gICAgICAgIGNvbnN0IGZpZWxkID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcuZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICBjb25zdCBvcmRlciA9IChyb3cucXVlcnlTZWxlY3RvcignLm9yZGVyLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZSBhcyBhbnk7XG4gICAgICAgIHNvcnRpbmdSdWxlcy5wdXNoKHsgZmllbGQsIG9yZGVyIH0pO1xuICAgIH0pO1xuXG4gICAgY29uc3QgZ3JvdXBTb3J0aW5nUnVsZXM6IFNvcnRpbmdSdWxlW10gPSBbXTtcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ3JvdXAtc29ydC1yb3dzLWNvbnRhaW5lcicpPy5xdWVyeVNlbGVjdG9yQWxsKCcuYnVpbGRlci1yb3cnKS5mb3JFYWNoKHJvdyA9PiB7XG4gICAgICAgIGNvbnN0IGZpZWxkID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcuZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICBjb25zdCBvcmRlciA9IChyb3cucXVlcnlTZWxlY3RvcignLm9yZGVyLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZSBhcyBhbnk7XG4gICAgICAgIGdyb3VwU29ydGluZ1J1bGVzLnB1c2goeyBmaWVsZCwgb3JkZXIgfSk7XG4gICAgfSk7XG4gICAgY29uc3QgYXBwbGllZEdyb3VwU29ydGluZ1J1bGVzID0gc29ydEdyb3VwcyA/IGdyb3VwU29ydGluZ1J1bGVzIDogW107XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBpZCxcbiAgICAgICAgbGFiZWwsXG4gICAgICAgIGZpbHRlcnMsXG4gICAgICAgIGZpbHRlckdyb3VwcyxcbiAgICAgICAgZ3JvdXBpbmdSdWxlcyxcbiAgICAgICAgc29ydGluZ1J1bGVzLFxuICAgICAgICBncm91cFNvcnRpbmdSdWxlczogYXBwbGllZEdyb3VwU29ydGluZ1J1bGVzLFxuICAgICAgICBmYWxsYmFjayxcbiAgICAgICAgc29ydEdyb3Vwc1xuICAgIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBydW5CdWlsZGVyU2ltdWxhdGlvbigpIHtcbiAgICAvLyBQYXNzIHRydWUgdG8gaWdub3JlIHZhbGlkYXRpb24gc28gd2UgY2FuIHNpbXVsYXRlIHdpdGhvdXQgSUQvTGFiZWxcbiAgICBjb25zdCBzdHJhdCA9IGdldEJ1aWxkZXJTdHJhdGVneSh0cnVlKTtcbiAgICBjb25zdCByZXN1bHRDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnVpbGRlci1yZXN1bHRzJyk7XG4gICAgY29uc3QgbmV3U3RhdGVQYW5lbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCduZXctc3RhdGUtcGFuZWwnKTtcblxuICAgIGlmICghc3RyYXQpIHJldHVybjsgLy8gU2hvdWxkIG5vdCBoYXBwZW4gd2l0aCBpZ25vcmVWYWxpZGF0aW9uPXRydWVcblxuICAgIGxvZ0luZm8oXCJSdW5uaW5nIGJ1aWxkZXIgc2ltdWxhdGlvblwiLCB7IHN0cmF0ZWd5OiBzdHJhdC5pZCB9KTtcblxuICAgIC8vIEZvciBzaW11bGF0aW9uLCB3ZSBjYW4gbW9jayBhbiBJRC9MYWJlbCBpZiBtaXNzaW5nXG4gICAgY29uc3Qgc2ltU3RyYXQ6IEN1c3RvbVN0cmF0ZWd5ID0gc3RyYXQ7XG5cbiAgICBpZiAoIXJlc3VsdENvbnRhaW5lciB8fCAhbmV3U3RhdGVQYW5lbCkgcmV0dXJuO1xuXG4gICAgLy8gU2hvdyB0aGUgcGFuZWxcbiAgICBuZXdTdGF0ZVBhbmVsLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cbiAgICAvLyBVcGRhdGUgbG9jYWxDdXN0b21TdHJhdGVnaWVzIHRlbXBvcmFyaWx5IGZvciBTaW1cbiAgICBjb25zdCBvcmlnaW5hbFN0cmF0ZWdpZXMgPSBbLi4uYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzXTtcblxuICAgIHRyeSB7XG4gICAgICAgIC8vIFJlcGxhY2Ugb3IgYWRkXG4gICAgICAgIGNvbnN0IGV4aXN0aW5nSWR4ID0gYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzLmZpbmRJbmRleChzID0+IHMuaWQgPT09IHNpbVN0cmF0LmlkKTtcbiAgICAgICAgaWYgKGV4aXN0aW5nSWR4ICE9PSAtMSkge1xuICAgICAgICAgICAgYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzW2V4aXN0aW5nSWR4XSA9IHNpbVN0cmF0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzLnB1c2goc2ltU3RyYXQpO1xuICAgICAgICB9XG4gICAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMoYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzKTtcblxuICAgICAgICAvLyBSdW4gTG9naWNcbiAgICAgICAgbGV0IHRhYnMgPSBnZXRNYXBwZWRUYWJzKCk7XG5cbiAgICAgICAgaWYgKHRhYnMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICByZXN1bHRDb250YWluZXIuaW5uZXJIVE1MID0gJzxwPk5vIHRhYnMgZm91bmQgdG8gc2ltdWxhdGUuPC9wPic7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBBcHBseSBTaW11bGF0ZWQgU2VsZWN0aW9uIE92ZXJyaWRlXG4gICAgICAgIGlmIChhcHBTdGF0ZS5zaW11bGF0ZWRTZWxlY3Rpb24uc2l6ZSA+IDApIHtcbiAgICAgICAgICAgIHRhYnMgPSB0YWJzLm1hcCh0ID0+ICh7XG4gICAgICAgICAgICAgICAgLi4udCxcbiAgICAgICAgICAgICAgICBzZWxlY3RlZDogYXBwU3RhdGUuc2ltdWxhdGVkU2VsZWN0aW9uLmhhcyh0LmlkKVxuICAgICAgICAgICAgfSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gU29ydCB1c2luZyB0aGlzIHN0cmF0ZWd5P1xuICAgICAgICAvLyBzb3J0VGFicyBleHBlY3RzIFNvcnRpbmdTdHJhdGVneVtdLlxuICAgICAgICAvLyBJZiB3ZSB1c2UgdGhpcyBzdHJhdGVneSBmb3Igc29ydGluZy4uLlxuICAgICAgICB0YWJzID0gc29ydFRhYnModGFicywgW3NpbVN0cmF0LmlkXSk7XG5cbiAgICAgICAgLy8gR3JvdXAgdXNpbmcgdGhpcyBzdHJhdGVneVxuICAgICAgICBjb25zdCBncm91cHMgPSBncm91cFRhYnModGFicywgW3NpbVN0cmF0LmlkXSk7XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgd2Ugc2hvdWxkIHNob3cgYSBmYWxsYmFjayByZXN1bHQgKGUuZy4gU29ydCBPbmx5KVxuICAgICAgICAvLyBJZiBubyBncm91cHMgd2VyZSBjcmVhdGVkLCBidXQgd2UgaGF2ZSB0YWJzLCBhbmQgdGhlIHN0cmF0ZWd5IGlzIG5vdCBhIGdyb3VwaW5nIHN0cmF0ZWd5LFxuICAgICAgICAvLyB3ZSBzaG93IHRoZSB0YWJzIGFzIGEgc2luZ2xlIGxpc3QuXG4gICAgICAgIGlmIChncm91cHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBjb25zdCBzdHJhdERlZiA9IGdldFN0cmF0ZWdpZXMoYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzKS5maW5kKHMgPT4gcy5pZCA9PT0gc2ltU3RyYXQuaWQpO1xuICAgICAgICAgICAgaWYgKHN0cmF0RGVmICYmICFzdHJhdERlZi5pc0dyb3VwaW5nKSB7XG4gICAgICAgICAgICAgICAgZ3JvdXBzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBpZDogJ3NpbS1zb3J0ZWQnLFxuICAgICAgICAgICAgICAgICAgICB3aW5kb3dJZDogMCxcbiAgICAgICAgICAgICAgICAgICAgbGFiZWw6ICdTb3J0ZWQgUmVzdWx0cyAoTm8gR3JvdXBpbmcpJyxcbiAgICAgICAgICAgICAgICAgICAgY29sb3I6ICdncmV5JyxcbiAgICAgICAgICAgICAgICAgICAgdGFiczogdGFicyxcbiAgICAgICAgICAgICAgICAgICAgcmVhc29uOiAnU29ydCBPbmx5J1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmVuZGVyIFJlc3VsdHNcbiAgICAgICAgaWYgKGdyb3Vwcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHJlc3VsdENvbnRhaW5lci5pbm5lckhUTUwgPSAnPHA+Tm8gZ3JvdXBzIGNyZWF0ZWQuPC9wPic7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICByZXN1bHRDb250YWluZXIuaW5uZXJIVE1MID0gZ3JvdXBzLm1hcChncm91cCA9PiBgXG4gICAgPGRpdiBjbGFzcz1cImdyb3VwLXJlc3VsdFwiIHN0eWxlPVwibWFyZ2luLWJvdHRvbTogMTBweDsgYm9yZGVyOiAxcHggc29saWQgI2RkZDsgYm9yZGVyLXJhZGl1czogNHB4OyBvdmVyZmxvdzogaGlkZGVuO1wiPlxuICAgICAgPGRpdiBjbGFzcz1cImdyb3VwLWhlYWRlclwiIHN0eWxlPVwiYm9yZGVyLWxlZnQ6IDVweCBzb2xpZCAke2dyb3VwLmNvbG9yfTsgcGFkZGluZzogNXB4OyBiYWNrZ3JvdW5kOiAjZjhmOWZhOyBmb250LXNpemU6IDAuOWVtOyBmb250LXdlaWdodDogYm9sZDsgZGlzcGxheTogZmxleDsganVzdGlmeS1jb250ZW50OiBzcGFjZS1iZXR3ZWVuO1wiPlxuICAgICAgICA8c3Bhbj4ke2VzY2FwZUh0bWwoZ3JvdXAubGFiZWwgfHwgJ1VuZ3JvdXBlZCcpfTwvc3Bhbj5cbiAgICAgICAgPHNwYW4gY2xhc3M9XCJncm91cC1tZXRhXCIgc3R5bGU9XCJmb250LXdlaWdodDogbm9ybWFsOyBmb250LXNpemU6IDAuOGVtOyBjb2xvcjogIzY2NjtcIj4ke2dyb3VwLnRhYnMubGVuZ3RofTwvc3Bhbj5cbiAgICAgIDwvZGl2PlxuICAgICAgPHVsIGNsYXNzPVwiZ3JvdXAtdGFic1wiIHN0eWxlPVwibGlzdC1zdHlsZTogbm9uZTsgbWFyZ2luOiAwOyBwYWRkaW5nOiAwO1wiPlxuICAgICAgICAke2dyb3VwLnRhYnMubWFwKHRhYiA9PiBgXG4gICAgICAgICAgPGxpIGNsYXNzPVwiZ3JvdXAtdGFiLWl0ZW1cIiBzdHlsZT1cInBhZGRpbmc6IDRweCA1cHg7IGJvcmRlci10b3A6IDFweCBzb2xpZCAjZWVlOyBkaXNwbGF5OiBmbGV4OyBnYXA6IDVweDsgYWxpZ24taXRlbXM6IGNlbnRlcjsgZm9udC1zaXplOiAwLjg1ZW07XCI+XG4gICAgICAgICAgICA8ZGl2IHN0eWxlPVwid2lkdGg6IDEycHg7IGhlaWdodDogMTJweDsgYmFja2dyb3VuZDogI2VlZTsgYm9yZGVyLXJhZGl1czogMnB4OyBmbGV4LXNocmluazogMDtcIj5cbiAgICAgICAgICAgICAgICAke3RhYi5mYXZJY29uVXJsID8gYDxpbWcgc3JjPVwiJHtlc2NhcGVIdG1sKHRhYi5mYXZJY29uVXJsKX1cIiBzdHlsZT1cIndpZHRoOiAxMDAlOyBoZWlnaHQ6IDEwMCU7IG9iamVjdC1maXQ6IGNvdmVyO1wiIG9uZXJyb3I9XCJ0aGlzLnN0eWxlLmRpc3BsYXk9J25vbmUnXCI+YCA6ICcnfVxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cInRpdGxlLWNlbGxcIiB0aXRsZT1cIiR7ZXNjYXBlSHRtbCh0YWIudGl0bGUpfVwiIHN0eWxlPVwid2hpdGUtc3BhY2U6IG5vd3JhcDsgb3ZlcmZsb3c6IGhpZGRlbjsgdGV4dC1vdmVyZmxvdzogZWxsaXBzaXM7XCI+JHtlc2NhcGVIdG1sKHRhYi50aXRsZSl9PC9zcGFuPlxuICAgICAgICAgIDwvbGk+XG4gICAgICAgIGApLmpvaW4oJycpfVxuICAgICAgPC91bD5cbiAgICA8L2Rpdj5cbiAgYCkuam9pbignJyk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiU2ltdWxhdGlvbiBmYWlsZWRcIiwgZSk7XG4gICAgICAgIHJlc3VsdENvbnRhaW5lci5pbm5lckhUTUwgPSBgPHAgc3R5bGU9XCJjb2xvcjogcmVkO1wiPlNpbXVsYXRpb24gZmFpbGVkOiAke2V9PC9wPmA7XG4gICAgICAgIGFsZXJ0KFwiU2ltdWxhdGlvbiBmYWlsZWQ6IFwiICsgZSk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgICAgLy8gUmVzdG9yZSBzdHJhdGVnaWVzXG4gICAgICAgIGFwcFN0YXRlLmxvY2FsQ3VzdG9tU3RyYXRlZ2llcyA9IG9yaWdpbmFsU3RyYXRlZ2llcztcbiAgICAgICAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhhcHBTdGF0ZS5sb2NhbEN1c3RvbVN0cmF0ZWdpZXMpO1xuICAgIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNhdmVDdXN0b21TdHJhdGVneUZyb21CdWlsZGVyKHNob3dTdWNjZXNzID0gdHJ1ZSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGNvbnN0IHN0cmF0ID0gZ2V0QnVpbGRlclN0cmF0ZWd5KCk7XG4gICAgaWYgKCFzdHJhdCkge1xuICAgICAgICBhbGVydChcIlBsZWFzZSBmaWxsIGluIElEIGFuZCBMYWJlbC5cIik7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHNhdmVTdHJhdGVneShzdHJhdCwgc2hvd1N1Y2Nlc3MpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcnVuQnVpbGRlckxpdmUoKSB7XG4gICAgY29uc3Qgc3RyYXQgPSBnZXRCdWlsZGVyU3RyYXRlZ3koKTtcbiAgICBpZiAoIXN0cmF0KSB7XG4gICAgICAgIGFsZXJ0KFwiUGxlYXNlIGZpbGwgaW4gSUQgYW5kIExhYmVsIHRvIHJ1biBsaXZlLlwiKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxvZ0luZm8oXCJBcHBseWluZyBzdHJhdGVneSBsaXZlXCIsIHsgaWQ6IHN0cmF0LmlkIH0pO1xuXG4gICAgLy8gU2F2ZSBzaWxlbnRseSBmaXJzdCB0byBlbnN1cmUgYmFja2VuZCBoYXMgdGhlIGRlZmluaXRpb25cbiAgICBjb25zdCBzYXZlZCA9IGF3YWl0IHNhdmVTdHJhdGVneShzdHJhdCwgZmFsc2UpO1xuICAgIGlmICghc2F2ZWQpIHJldHVybjtcblxuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgdHlwZTogJ2FwcGx5R3JvdXBpbmcnLFxuICAgICAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgICAgICAgIHNvcnRpbmc6IFtzdHJhdC5pZF1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9rKSB7XG4gICAgICAgICAgICBhbGVydChcIkFwcGxpZWQgc3VjY2Vzc2Z1bGx5IVwiKTtcbiAgICAgICAgICAgIGxvYWRUYWJzKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBhbGVydChcIkZhaWxlZCB0byBhcHBseTogXCIgKyAocmVzcG9uc2UuZXJyb3IgfHwgJ1Vua25vd24gZXJyb3InKSk7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJBcHBseSBmYWlsZWRcIiwgZSk7XG4gICAgICAgIGFsZXJ0KFwiQXBwbHkgZmFpbGVkOiBcIiArIGUpO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBvcHVsYXRlQnVpbGRlckZyb21TdHJhdGVneShzdHJhdDogQ3VzdG9tU3RyYXRlZ3kpIHtcbiAgICAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LW5hbWUnKSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSA9IHN0cmF0LmlkO1xuICAgIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtZGVzYycpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlID0gc3RyYXQubGFiZWw7XG5cbiAgICBjb25zdCBzb3J0R3JvdXBzQ2hlY2sgPSAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LXNvcnRncm91cHMtY2hlY2snKSBhcyBIVE1MSW5wdXRFbGVtZW50KTtcbiAgICBjb25zdCBoYXNHcm91cFNvcnQgPSAhIShzdHJhdC5ncm91cFNvcnRpbmdSdWxlcyAmJiBzdHJhdC5ncm91cFNvcnRpbmdSdWxlcy5sZW5ndGggPiAwKSB8fCAhIXN0cmF0LnNvcnRHcm91cHM7XG4gICAgc29ydEdyb3Vwc0NoZWNrLmNoZWNrZWQgPSBoYXNHcm91cFNvcnQ7XG4gICAgc29ydEdyb3Vwc0NoZWNrLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnKSk7XG5cbiAgICBjb25zdCBhdXRvUnVuQ2hlY2sgPSAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LWF1dG9ydW4nKSBhcyBIVE1MSW5wdXRFbGVtZW50KTtcbiAgICBhdXRvUnVuQ2hlY2suY2hlY2tlZCA9ICEhc3RyYXQuYXV0b1J1bjtcblxuICAgIFsnZmlsdGVyLXJvd3MtY29udGFpbmVyJywgJ2dyb3VwLXJvd3MtY29udGFpbmVyJywgJ3NvcnQtcm93cy1jb250YWluZXInLCAnZ3JvdXAtc29ydC1yb3dzLWNvbnRhaW5lciddLmZvckVhY2goaWQgPT4ge1xuICAgICAgICBjb25zdCBlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGlkKTtcbiAgICAgICAgaWYgKGVsKSBlbC5pbm5lckhUTUwgPSAnJztcbiAgICB9KTtcblxuICAgIGlmIChzdHJhdC5maWx0ZXJHcm91cHMgJiYgc3RyYXQuZmlsdGVyR3JvdXBzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgc3RyYXQuZmlsdGVyR3JvdXBzLmZvckVhY2goZyA9PiBhZGRGaWx0ZXJHcm91cFJvdyhnKSk7XG4gICAgfSBlbHNlIGlmIChzdHJhdC5maWx0ZXJzICYmIHN0cmF0LmZpbHRlcnMubGVuZ3RoID4gMCkge1xuICAgICAgICBhZGRGaWx0ZXJHcm91cFJvdyhzdHJhdC5maWx0ZXJzKTtcbiAgICB9XG5cbiAgICBzdHJhdC5ncm91cGluZ1J1bGVzPy5mb3JFYWNoKGcgPT4gYWRkQnVpbGRlclJvdygnZ3JvdXAnLCBnKSk7XG4gICAgc3RyYXQuc29ydGluZ1J1bGVzPy5mb3JFYWNoKHMgPT4gYWRkQnVpbGRlclJvdygnc29ydCcsIHMpKTtcbiAgICBzdHJhdC5ncm91cFNvcnRpbmdSdWxlcz8uZm9yRWFjaChncyA9PiBhZGRCdWlsZGVyUm93KCdncm91cFNvcnQnLCBncykpO1xuXG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI3ZpZXctc3RyYXRlZ2llcycpPy5zY3JvbGxJbnRvVmlldyh7IGJlaGF2aW9yOiAnc21vb3RoJyB9KTtcbiAgICB1cGRhdGVCcmVhZGNydW1iKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHBvcnRCdWlsZGVyU3RyYXRlZ3koKSB7XG4gICAgY29uc3Qgc3RyYXQgPSBnZXRCdWlsZGVyU3RyYXRlZ3koKTtcbiAgICBpZiAoIXN0cmF0KSB7XG4gICAgICAgIGFsZXJ0KFwiUGxlYXNlIGRlZmluZSBhIHN0cmF0ZWd5IHRvIGV4cG9ydCAoSUQgYW5kIExhYmVsIHJlcXVpcmVkKS5cIik7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbG9nSW5mbyhcIkV4cG9ydGluZyBzdHJhdGVneVwiLCB7IGlkOiBzdHJhdC5pZCB9KTtcbiAgICBjb25zdCBqc29uID0gSlNPTi5zdHJpbmdpZnkoc3RyYXQsIG51bGwsIDIpO1xuICAgIGNvbnN0IGNvbnRlbnQgPSBgXG4gICAgICAgIDxwPkNvcHkgdGhlIEpTT04gYmVsb3c6PC9wPlxuICAgICAgICA8dGV4dGFyZWEgc3R5bGU9XCJ3aWR0aDogMTAwJTsgaGVpZ2h0OiAzMDBweDsgZm9udC1mYW1pbHk6IG1vbm9zcGFjZTtcIj4ke2VzY2FwZUh0bWwoanNvbil9PC90ZXh0YXJlYT5cbiAgICBgO1xuICAgIHNob3dNb2RhbChcIkV4cG9ydCBTdHJhdGVneVwiLCBjb250ZW50KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGltcG9ydEJ1aWxkZXJTdHJhdGVneSgpIHtcbiAgICBjb25zdCBjb250ZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgY29udGVudC5pbm5lckhUTUwgPSBgXG4gICAgICAgIDxwPlBhc3RlIFN0cmF0ZWd5IEpTT04gYmVsb3c6PC9wPlxuICAgICAgICA8dGV4dGFyZWEgaWQ9XCJpbXBvcnQtc3RyYXQtYXJlYVwiIHN0eWxlPVwid2lkdGg6IDEwMCU7IGhlaWdodDogMjAwcHg7IGZvbnQtZmFtaWx5OiBtb25vc3BhY2U7IG1hcmdpbi1ib3R0b206IDEwcHg7XCI+PC90ZXh0YXJlYT5cbiAgICAgICAgPGJ1dHRvbiBpZD1cImltcG9ydC1zdHJhdC1jb25maXJtXCIgY2xhc3M9XCJzdWNjZXNzLWJ0blwiPkxvYWQ8L2J1dHRvbj5cbiAgICBgO1xuXG4gICAgY29uc3QgYnRuID0gY29udGVudC5xdWVyeVNlbGVjdG9yKCcjaW1wb3J0LXN0cmF0LWNvbmZpcm0nKTtcbiAgICBidG4/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICBjb25zdCB0eHQgPSAoY29udGVudC5xdWVyeVNlbGVjdG9yKCcjaW1wb3J0LXN0cmF0LWFyZWEnKSBhcyBIVE1MVGV4dEFyZWFFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGpzb24gPSBKU09OLnBhcnNlKHR4dCk7XG4gICAgICAgICAgICBpZiAoIWpzb24uaWQgfHwgIWpzb24ubGFiZWwpIHtcbiAgICAgICAgICAgICAgICBhbGVydChcIkludmFsaWQgc3RyYXRlZ3k6IElEIGFuZCBMYWJlbCBhcmUgcmVxdWlyZWQuXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGxvZ0luZm8oXCJJbXBvcnRpbmcgc3RyYXRlZ3lcIiwgeyBpZDoganNvbi5pZCB9KTtcbiAgICAgICAgICAgIHBvcHVsYXRlQnVpbGRlckZyb21TdHJhdGVneShqc29uKTtcbiAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5tb2RhbC1vdmVybGF5Jyk/LnJlbW92ZSgpO1xuICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICAgIGFsZXJ0KFwiSW52YWxpZCBKU09OOiBcIiArIGUpO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBzaG93TW9kYWwoXCJJbXBvcnQgU3RyYXRlZ3lcIiwgY29udGVudCk7XG59XG4iLCAiaW1wb3J0IHsgYXBwU3RhdGUgfSBmcm9tIFwiLi9zdGF0ZS5qc1wiO1xuaW1wb3J0IHsgTG9nRW50cnksIExvZ0xldmVsLCBQcmVmZXJlbmNlcyB9IGZyb20gXCIuLi8uLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGVzY2FwZUh0bWwgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBsb2FkTG9ncygpIHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2dldExvZ3MnIH0pO1xuICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2sgJiYgcmVzcG9uc2UuZGF0YSkge1xuICAgICAgICAgICAgYXBwU3RhdGUuY3VycmVudExvZ3MgPSByZXNwb25zZS5kYXRhO1xuICAgICAgICAgICAgcmVuZGVyTG9ncygpO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGxvYWQgbG9nc1wiLCBlKTtcbiAgICB9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjbGVhclJlbW90ZUxvZ3MoKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiAnY2xlYXJMb2dzJyB9KTtcbiAgICAgICAgbG9hZExvZ3MoKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gY2xlYXIgbG9nc1wiLCBlKTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJMb2dzKCkge1xuICAgIGNvbnN0IHRib2R5ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvZ3MtdGFibGUtYm9keScpO1xuICAgIGNvbnN0IGxldmVsRmlsdGVyID0gKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2ctbGV2ZWwtZmlsdGVyJykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgIGNvbnN0IHNlYXJjaFRleHQgPSAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvZy1zZWFyY2gnKSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZS50b0xvd2VyQ2FzZSgpO1xuXG4gICAgaWYgKCF0Ym9keSkgcmV0dXJuO1xuXG4gICAgdGJvZHkuaW5uZXJIVE1MID0gJyc7XG5cbiAgICBjb25zdCBmaWx0ZXJlZCA9IGFwcFN0YXRlLmN1cnJlbnRMb2dzLmZpbHRlcihlbnRyeSA9PiB7XG4gICAgICAgIGlmIChsZXZlbEZpbHRlciAhPT0gJ2FsbCcgJiYgZW50cnkubGV2ZWwgIT09IGxldmVsRmlsdGVyKSByZXR1cm4gZmFsc2U7XG4gICAgICAgIGlmIChzZWFyY2hUZXh0KSB7XG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gYCR7ZW50cnkubWVzc2FnZX0gJHtKU09OLnN0cmluZ2lmeShlbnRyeS5jb250ZXh0IHx8IHt9KX1gLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICBpZiAoIXRleHQuaW5jbHVkZXMoc2VhcmNoVGV4dCkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9KTtcblxuICAgIGlmIChmaWx0ZXJlZC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgdGJvZHkuaW5uZXJIVE1MID0gJzx0cj48dGQgY29sc3Bhbj1cIjRcIiBzdHlsZT1cInBhZGRpbmc6IDEwcHg7IHRleHQtYWxpZ246IGNlbnRlcjsgY29sb3I6ICM4ODg7XCI+Tm8gbG9ncyBmb3VuZC48L3RkPjwvdHI+JztcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGZpbHRlcmVkLmZvckVhY2goZW50cnkgPT4ge1xuICAgICAgICBjb25zdCByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd0cicpO1xuXG4gICAgICAgIC8vIENvbG9yIGNvZGUgbGV2ZWxcbiAgICAgICAgbGV0IGNvbG9yID0gJyMzMzMnO1xuICAgICAgICBpZiAoZW50cnkubGV2ZWwgPT09ICdlcnJvcicgfHwgZW50cnkubGV2ZWwgPT09ICdjcml0aWNhbCcpIGNvbG9yID0gJ3JlZCc7XG4gICAgICAgIGVsc2UgaWYgKGVudHJ5LmxldmVsID09PSAnd2FybicpIGNvbG9yID0gJ29yYW5nZSc7XG4gICAgICAgIGVsc2UgaWYgKGVudHJ5LmxldmVsID09PSAnZGVidWcnKSBjb2xvciA9ICdibHVlJztcblxuICAgICAgICByb3cuaW5uZXJIVE1MID0gYFxuICAgICAgICAgICAgPHRkIHN0eWxlPVwicGFkZGluZzogOHB4OyBib3JkZXItYm90dG9tOiAxcHggc29saWQgI2VlZTsgd2hpdGUtc3BhY2U6IG5vd3JhcDtcIj4ke25ldyBEYXRlKGVudHJ5LnRpbWVzdGFtcCkudG9Mb2NhbGVUaW1lU3RyaW5nKCl9ICgke2VudHJ5LnRpbWVzdGFtcH0pPC90ZD5cbiAgICAgICAgICAgIDx0ZCBzdHlsZT1cInBhZGRpbmc6IDhweDsgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkICNlZWU7IGNvbG9yOiAke2NvbG9yfTsgZm9udC13ZWlnaHQ6IGJvbGQ7XCI+JHtlbnRyeS5sZXZlbC50b1VwcGVyQ2FzZSgpfTwvdGQ+XG4gICAgICAgICAgICA8dGQgc3R5bGU9XCJwYWRkaW5nOiA4cHg7IGJvcmRlci1ib3R0b206IDFweCBzb2xpZCAjZWVlO1wiPiR7ZXNjYXBlSHRtbChlbnRyeS5tZXNzYWdlKX08L3RkPlxuICAgICAgICAgICAgPHRkIHN0eWxlPVwicGFkZGluZzogOHB4OyBib3JkZXItYm90dG9tOiAxcHggc29saWQgI2VlZTtcIj5cbiAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJtYXgtaGVpZ2h0OiAxMDBweDsgb3ZlcmZsb3cteTogYXV0bztcIj5cbiAgICAgICAgICAgICAgICAgICR7ZW50cnkuY29udGV4dCA/IGA8cHJlIHN0eWxlPVwibWFyZ2luOiAwO1wiPiR7ZXNjYXBlSHRtbChKU09OLnN0cmluZ2lmeShlbnRyeS5jb250ZXh0LCBudWxsLCAyKSl9PC9wcmU+YCA6ICctJ31cbiAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPC90ZD5cbiAgICAgICAgYDtcbiAgICAgICAgdGJvZHkuYXBwZW5kQ2hpbGQocm93KTtcbiAgICB9KTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGxvYWRHbG9iYWxMb2dMZXZlbCgpIHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2xvYWRQcmVmZXJlbmNlcycgfSk7XG4gICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vayAmJiByZXNwb25zZS5kYXRhKSB7XG4gICAgICAgICAgICBjb25zdCBwcmVmcyA9IHJlc3BvbnNlLmRhdGEgYXMgUHJlZmVyZW5jZXM7XG4gICAgICAgICAgICBjb25zdCBzZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2xvYmFsLWxvZy1sZXZlbCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICAgICAgaWYgKHNlbGVjdCkge1xuICAgICAgICAgICAgICAgIHNlbGVjdC52YWx1ZSA9IHByZWZzLmxvZ0xldmVsIHx8ICdpbmZvJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBsb2FkIHByZWZzIGZvciBsb2dzXCIsIGUpO1xuICAgIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHVwZGF0ZUdsb2JhbExvZ0xldmVsKCkge1xuICAgIGNvbnN0IHNlbGVjdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnbG9iYWwtbG9nLWxldmVsJykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgaWYgKCFzZWxlY3QpIHJldHVybjtcbiAgICBjb25zdCBsZXZlbCA9IHNlbGVjdC52YWx1ZSBhcyBMb2dMZXZlbDtcblxuICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgIHR5cGU6ICdzYXZlUHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgcGF5bG9hZDogeyBsb2dMZXZlbDogbGV2ZWwgfVxuICAgICAgICB9KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gc2F2ZSBsb2cgbGV2ZWxcIiwgZSk7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5pdExvZ3MoKSB7XG4gIGNvbnN0IHJlZnJlc2hMb2dzQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3JlZnJlc2gtbG9ncy1idG4nKTtcbiAgaWYgKHJlZnJlc2hMb2dzQnRuKSByZWZyZXNoTG9nc0J0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGxvYWRMb2dzKTtcblxuICBjb25zdCBjbGVhckxvZ3NCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY2xlYXItbG9ncy1idG4nKTtcbiAgaWYgKGNsZWFyTG9nc0J0bikgY2xlYXJMb2dzQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgY2xlYXJSZW1vdGVMb2dzKTtcblxuICBjb25zdCBsb2dMZXZlbEZpbHRlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2ctbGV2ZWwtZmlsdGVyJyk7XG4gIGlmIChsb2dMZXZlbEZpbHRlcikgbG9nTGV2ZWxGaWx0ZXIuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgcmVuZGVyTG9ncyk7XG5cbiAgY29uc3QgbG9nU2VhcmNoID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvZy1zZWFyY2gnKTtcbiAgaWYgKGxvZ1NlYXJjaCkgbG9nU2VhcmNoLmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgcmVuZGVyTG9ncyk7XG5cbiAgY29uc3QgZ2xvYmFsTG9nTGV2ZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2xvYmFsLWxvZy1sZXZlbCcpO1xuICBpZiAoZ2xvYmFsTG9nTGV2ZWwpIGdsb2JhbExvZ0xldmVsLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIHVwZGF0ZUdsb2JhbExvZ0xldmVsKTtcbn1cbiIsICJpbXBvcnQgeyBhcHBTdGF0ZSB9IGZyb20gXCIuL3N0YXRlLmpzXCI7XG5pbXBvcnQgeyBsb2FkVGFicyB9IGZyb20gXCIuL3RhYnNUYWJsZS5qc1wiO1xuaW1wb3J0IHsgUHJlZmVyZW5jZXMgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBsb2dJbmZvIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGVzY2FwZUh0bWwgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBsb2FkQ3VzdG9tR2VuZXJhKCkge1xuICAgIGNvbnN0IGxpc3RDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY3VzdG9tLWdlbmVyYS1saXN0Jyk7XG4gICAgaWYgKCFsaXN0Q29udGFpbmVyKSByZXR1cm47XG5cbiAgICB0cnkge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2xvYWRQcmVmZXJlbmNlcycgfSk7XG4gICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vayAmJiByZXNwb25zZS5kYXRhKSB7XG4gICAgICAgICAgICBjb25zdCBwcmVmcyA9IHJlc3BvbnNlLmRhdGEgYXMgUHJlZmVyZW5jZXM7XG4gICAgICAgICAgICByZW5kZXJDdXN0b21HZW5lcmFMaXN0KHByZWZzLmN1c3RvbUdlbmVyYSB8fCB7fSk7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gbG9hZCBjdXN0b20gZ2VuZXJhXCIsIGUpO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlckN1c3RvbUdlbmVyYUxpc3QoY3VzdG9tR2VuZXJhOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KSB7XG4gICAgY29uc3QgbGlzdENvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjdXN0b20tZ2VuZXJhLWxpc3QnKTtcbiAgICBpZiAoIWxpc3RDb250YWluZXIpIHJldHVybjtcblxuICAgIGlmIChPYmplY3Qua2V5cyhjdXN0b21HZW5lcmEpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICBsaXN0Q29udGFpbmVyLmlubmVySFRNTCA9ICc8cCBzdHlsZT1cImNvbG9yOiAjODg4OyBmb250LXN0eWxlOiBpdGFsaWM7XCI+Tm8gY3VzdG9tIGVudHJpZXMuPC9wPic7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsaXN0Q29udGFpbmVyLmlubmVySFRNTCA9IE9iamVjdC5lbnRyaWVzKGN1c3RvbUdlbmVyYSkubWFwKChbZG9tYWluLCBjYXRlZ29yeV0pID0+IGBcbiAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6IGZsZXg7IGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjsgYWxpZ24taXRlbXM6IGNlbnRlcjsgcGFkZGluZzogNXB4OyBib3JkZXItYm90dG9tOiAxcHggc29saWQgI2YwZjBmMDtcIj5cbiAgICAgICAgICAgIDxzcGFuPjxiPiR7ZXNjYXBlSHRtbChkb21haW4pfTwvYj46ICR7ZXNjYXBlSHRtbChjYXRlZ29yeSl9PC9zcGFuPlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImRlbGV0ZS1nZW5lcmEtYnRuXCIgZGF0YS1kb21haW49XCIke2VzY2FwZUh0bWwoZG9tYWluKX1cIiBzdHlsZT1cImJhY2tncm91bmQ6IG5vbmU7IGJvcmRlcjogbm9uZTsgY29sb3I6IHJlZDsgY3Vyc29yOiBwb2ludGVyO1wiPiZ0aW1lczs8L2J1dHRvbj5cbiAgICAgICAgPC9kaXY+XG4gICAgYCkuam9pbignJyk7XG5cbiAgICAvLyBSZS1hdHRhY2ggbGlzdGVuZXJzIGZvciBkZWxldGUgYnV0dG9uc1xuICAgIGxpc3RDb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLmRlbGV0ZS1nZW5lcmEtYnRuJykuZm9yRWFjaChidG4gPT4ge1xuICAgICAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgZG9tYWluID0gKGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5kYXRhc2V0LmRvbWFpbjtcbiAgICAgICAgICAgIGlmIChkb21haW4pIHtcbiAgICAgICAgICAgICAgICBhd2FpdCBkZWxldGVDdXN0b21HZW5lcmEoZG9tYWluKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhZGRDdXN0b21HZW5lcmEoKSB7XG4gICAgY29uc3QgZG9tYWluSW5wdXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbmV3LWdlbmVyYS1kb21haW4nKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgIGNvbnN0IGNhdGVnb3J5SW5wdXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbmV3LWdlbmVyYS1jYXRlZ29yeScpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG5cbiAgICBpZiAoIWRvbWFpbklucHV0IHx8ICFjYXRlZ29yeUlucHV0KSByZXR1cm47XG5cbiAgICBjb25zdCBkb21haW4gPSBkb21haW5JbnB1dC52YWx1ZS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgICBjb25zdCBjYXRlZ29yeSA9IGNhdGVnb3J5SW5wdXQudmFsdWUudHJpbSgpO1xuXG4gICAgaWYgKCFkb21haW4gfHwgIWNhdGVnb3J5KSB7XG4gICAgICAgIGFsZXJ0KFwiUGxlYXNlIGVudGVyIGJvdGggZG9tYWluIGFuZCBjYXRlZ29yeS5cIik7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsb2dJbmZvKFwiQWRkaW5nIGN1c3RvbSBnZW5lcmFcIiwgeyBkb21haW4sIGNhdGVnb3J5IH0pO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgLy8gRmV0Y2ggY3VycmVudCB0byBtZXJnZVxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2xvYWRQcmVmZXJlbmNlcycgfSk7XG4gICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vayAmJiByZXNwb25zZS5kYXRhKSB7XG4gICAgICAgICAgICBjb25zdCBwcmVmcyA9IHJlc3BvbnNlLmRhdGEgYXMgUHJlZmVyZW5jZXM7XG4gICAgICAgICAgICBjb25zdCBuZXdDdXN0b21HZW5lcmEgPSB7IC4uLihwcmVmcy5jdXN0b21HZW5lcmEgfHwge30pLCBbZG9tYWluXTogY2F0ZWdvcnkgfTtcblxuICAgICAgICAgICAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICAgIHR5cGU6ICdzYXZlUHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgICAgIHBheWxvYWQ6IHsgY3VzdG9tR2VuZXJhOiBuZXdDdXN0b21HZW5lcmEgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGRvbWFpbklucHV0LnZhbHVlID0gJyc7XG4gICAgICAgICAgICBjYXRlZ29yeUlucHV0LnZhbHVlID0gJyc7XG4gICAgICAgICAgICBsb2FkQ3VzdG9tR2VuZXJhKCk7XG4gICAgICAgICAgICBsb2FkVGFicygpOyAvLyBSZWZyZXNoIHRhYnMgdG8gYXBwbHkgbmV3IGNsYXNzaWZpY2F0aW9uIGlmIHJlbGV2YW50XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gYWRkIGN1c3RvbSBnZW5lcmFcIiwgZSk7XG4gICAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZGVsZXRlQ3VzdG9tR2VuZXJhKGRvbWFpbjogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgbG9nSW5mbyhcIkRlbGV0aW5nIGN1c3RvbSBnZW5lcmFcIiwgeyBkb21haW4gfSk7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiAnbG9hZFByZWZlcmVuY2VzJyB9KTtcbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9rICYmIHJlc3BvbnNlLmRhdGEpIHtcbiAgICAgICAgICAgIGNvbnN0IHByZWZzID0gcmVzcG9uc2UuZGF0YSBhcyBQcmVmZXJlbmNlcztcbiAgICAgICAgICAgIGNvbnN0IG5ld0N1c3RvbUdlbmVyYSA9IHsgLi4uKHByZWZzLmN1c3RvbUdlbmVyYSB8fCB7fSkgfTtcbiAgICAgICAgICAgIGRlbGV0ZSBuZXdDdXN0b21HZW5lcmFbZG9tYWluXTtcblxuICAgICAgICAgICAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICAgIHR5cGU6ICdzYXZlUHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgICAgIHBheWxvYWQ6IHsgY3VzdG9tR2VuZXJhOiBuZXdDdXN0b21HZW5lcmEgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGxvYWRDdXN0b21HZW5lcmEoKTtcbiAgICAgICAgICAgIGxvYWRUYWJzKCk7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gZGVsZXRlIGN1c3RvbSBnZW5lcmFcIiwgZSk7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5pdEdlbmVyYSgpIHtcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChldmVudCkgPT4ge1xuICAgICAgICBjb25zdCB0YXJnZXQgPSBldmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgICAgICBpZiAodGFyZ2V0ICYmIHRhcmdldC5pZCA9PT0gJ2FkZC1nZW5lcmEtYnRuJykge1xuICAgICAgICAgICAgYWRkQ3VzdG9tR2VuZXJhKCk7XG4gICAgICAgIH1cbiAgICB9KTtcbn1cbiIsICJpbXBvcnQgeyBhcHBTdGF0ZSB9IGZyb20gXCIuL2RldnRvb2xzL3N0YXRlLmpzXCI7XG5pbXBvcnQgeyBpbml0VGFic1RhYmxlLCBsb2FkVGFicyB9IGZyb20gXCIuL2RldnRvb2xzL3RhYnNUYWJsZS5qc1wiO1xuaW1wb3J0IHsgaW5pdFN0cmF0ZWdpZXMsIGxvYWRQcmVmZXJlbmNlc0FuZEluaXQgfSBmcm9tIFwiLi9kZXZ0b29scy9zdHJhdGVnaWVzLmpzXCI7XG5pbXBvcnQgeyBpbml0U3RyYXRlZ3lCdWlsZGVyIH0gZnJvbSBcIi4vZGV2dG9vbHMvc3RyYXRlZ3lCdWlsZGVyLmpzXCI7XG5pbXBvcnQgeyBpbml0TG9ncywgbG9hZExvZ3MsIGxvYWRHbG9iYWxMb2dMZXZlbCB9IGZyb20gXCIuL2RldnRvb2xzL2xvZ3MuanNcIjtcbmltcG9ydCB7IGluaXRHZW5lcmEsIGxvYWRDdXN0b21HZW5lcmEgfSBmcm9tIFwiLi9kZXZ0b29scy9nZW5lcmEuanNcIjtcbmltcG9ydCB7IGluaXRTaW11bGF0aW9uLCByZW5kZXJTdHJhdGVneUNvbmZpZyB9IGZyb20gXCIuL2RldnRvb2xzL3NpbXVsYXRpb24uanNcIjtcbmltcG9ydCB7IHJlbmRlckFsZ29yaXRobXNWaWV3LCBzaG93U3RyYXRlZ3lEZXRhaWxzIH0gZnJvbSBcIi4vZGV2dG9vbHMvY29tcG9uZW50cy5qc1wiO1xuaW1wb3J0IHsgbG9nSW5mbyB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBlc2NhcGVIdG1sIH0gZnJvbSBcIi4uL3NoYXJlZC91dGlscy5qc1wiO1xuXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgYXN5bmMgKCkgPT4ge1xuICAvLyBUaGVtZSBUb2dnbGUgTG9naWNcbiAgY29uc3QgdGhlbWVUb2dnbGVCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndGhlbWVUb2dnbGVCdG4nKTtcbiAgY29uc3Qgc3RvcmVkVGhlbWUgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgndGhlbWUnKTtcbiAgaWYgKHN0b3JlZFRoZW1lID09PSAnZGFyaycpIHtcbiAgICBkb2N1bWVudC5ib2R5LmNsYXNzTGlzdC5hZGQoJ2RhcmstbW9kZScpO1xuICB9XG5cbiAgaWYgKHRoZW1lVG9nZ2xlQnRuKSB7XG4gICAgdGhlbWVUb2dnbGVCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICBkb2N1bWVudC5ib2R5LmNsYXNzTGlzdC50b2dnbGUoJ2RhcmstbW9kZScpO1xuICAgICAgY29uc3QgaXNEYXJrID0gZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QuY29udGFpbnMoJ2RhcmstbW9kZScpO1xuICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ3RoZW1lJywgaXNEYXJrID8gJ2RhcmsnIDogJ2xpZ2h0Jyk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBUYWIgU3dpdGNoaW5nIExvZ2ljXG4gIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy50YWItYnRuJykuZm9yRWFjaChidG4gPT4ge1xuICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgIC8vIFJlbW92ZSBhY3RpdmUgY2xhc3MgZnJvbSBhbGwgYnV0dG9ucyBhbmQgc2VjdGlvbnNcbiAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy50YWItYnRuJykuZm9yRWFjaChiID0+IGIuY2xhc3NMaXN0LnJlbW92ZSgnYWN0aXZlJykpO1xuICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnZpZXctc2VjdGlvbicpLmZvckVhY2gocyA9PiBzLmNsYXNzTGlzdC5yZW1vdmUoJ2FjdGl2ZScpKTtcblxuICAgICAgLy8gQWRkIGFjdGl2ZSBjbGFzcyB0byBjbGlja2VkIGJ1dHRvblxuICAgICAgYnRuLmNsYXNzTGlzdC5hZGQoJ2FjdGl2ZScpO1xuXG4gICAgICAvLyBTaG93IHRhcmdldCBzZWN0aW9uXG4gICAgICBjb25zdCB0YXJnZXRJZCA9IChidG4gYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXQudGFyZ2V0O1xuICAgICAgaWYgKHRhcmdldElkKSB7XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKHRhcmdldElkKT8uY2xhc3NMaXN0LmFkZCgnYWN0aXZlJyk7XG4gICAgICAgIGxvZ0luZm8oXCJTd2l0Y2hlZCB2aWV3XCIsIHsgdGFyZ2V0SWQgfSk7XG4gICAgICB9XG5cbiAgICAgIC8vIElmIHN3aXRjaGluZyB0byBhbGdvcml0aG1zLCBwb3B1bGF0ZSByZWZlcmVuY2UgaWYgZW1wdHlcbiAgICAgIGlmICh0YXJnZXRJZCA9PT0gJ3ZpZXctYWxnb3JpdGhtcycpIHtcbiAgICAgICAgIHJlbmRlckFsZ29yaXRobXNWaWV3KCk7XG4gICAgICAgICByZW5kZXJTdHJhdGVneUNvbmZpZygpOyAvLyBVcGRhdGUgc2ltIGxpc3QgdG9vXG4gICAgICB9IGVsc2UgaWYgKHRhcmdldElkID09PSAndmlldy1zdHJhdGVneS1saXN0Jykge1xuICAgICAgICAgLy8gU3RyYXRlZ3kgbGlzdCBpcyByZW5kZXJlZCBieSByZW5kZXJTdHJhdGVneUxpc3RUYWJsZSB3aGljaCBpcyBjYWxsZWQgaW4gaW5pdFxuICAgICAgICAgLy8gQnV0IG1heWJlIHdlIHNob3VsZCByZWZyZXNoIGl0P1xuICAgICAgICAgLy8gcmVuZGVyU3RyYXRlZ3lMaXN0VGFibGUoKTsgLy8gZXhwb3J0ZWQgZnJvbSBzdHJhdGVnaWVzLnRzXG4gICAgICB9IGVsc2UgaWYgKHRhcmdldElkID09PSAndmlldy1sb2dzJykge1xuICAgICAgICAgbG9hZExvZ3MoKTtcbiAgICAgICAgIGxvYWRHbG9iYWxMb2dMZXZlbCgpO1xuICAgICAgfVxuICAgIH0pO1xuICB9KTtcblxuICAvLyBHbG9iYWwgQ2xpY2sgTGlzdGVuZXIgZm9yIHNoYXJlZCBhY3Rpb25zIChjb250ZXh0IGpzb24sIGdvdG8gdGFiLCBjbG9zZSB0YWIsIHN0cmF0ZWd5IHZpZXcpXG4gIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGV2ZW50KSA9PiB7XG4gICAgY29uc3QgdGFyZ2V0ID0gZXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICBpZiAoIXRhcmdldCkgcmV0dXJuO1xuXG4gICAgaWYgKHRhcmdldC5tYXRjaGVzKCcuY29udGV4dC1qc29uLWJ0bicpKSB7XG4gICAgICBjb25zdCB0YWJJZCA9IE51bWJlcih0YXJnZXQuZGF0YXNldC50YWJJZCk7XG4gICAgICBpZiAoIXRhYklkKSByZXR1cm47XG4gICAgICBjb25zdCBkYXRhID0gYXBwU3RhdGUuY3VycmVudENvbnRleHRNYXAuZ2V0KHRhYklkKT8uZGF0YTtcbiAgICAgIGlmICghZGF0YSkgcmV0dXJuO1xuICAgICAgY29uc3QganNvbiA9IEpTT04uc3RyaW5naWZ5KGRhdGEsIG51bGwsIDIpO1xuICAgICAgY29uc3QgaHRtbENvbnRlbnQgPSBgXG4gICAgICAgIDwhRE9DVFlQRSBodG1sPlxuICAgICAgICA8aHRtbD5cbiAgICAgICAgPGhlYWQ+XG4gICAgICAgICAgPHRpdGxlPkpTT04gVmlldzwvdGl0bGU+XG4gICAgICAgICAgPHN0eWxlPlxuICAgICAgICAgICAgYm9keSB7IGZvbnQtZmFtaWx5OiBtb25vc3BhY2U7IGJhY2tncm91bmQtY29sb3I6ICNmMGYwZjA7IHBhZGRpbmc6IDIwcHg7IH1cbiAgICAgICAgICAgIHByZSB7IGJhY2tncm91bmQtY29sb3I6IHdoaXRlOyBwYWRkaW5nOiAxNXB4OyBib3JkZXItcmFkaXVzOiA1cHg7IGJvcmRlcjogMXB4IHNvbGlkICNjY2M7IG92ZXJmbG93OiBhdXRvOyB9XG4gICAgICAgICAgPC9zdHlsZT5cbiAgICAgICAgPC9oZWFkPlxuICAgICAgICA8Ym9keT5cbiAgICAgICAgICA8aDM+SlNPTiBEYXRhPC9oMz5cbiAgICAgICAgICA8cHJlPiR7ZXNjYXBlSHRtbChqc29uKX08L3ByZT5cbiAgICAgICAgPC9ib2R5PlxuICAgICAgICA8L2h0bWw+XG4gICAgICBgO1xuICAgICAgY29uc3QgYmxvYiA9IG5ldyBCbG9iKFtodG1sQ29udGVudF0sIHsgdHlwZTogJ3RleHQvaHRtbCcgfSk7XG4gICAgICBjb25zdCB1cmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpO1xuICAgICAgd2luZG93Lm9wZW4odXJsLCAnX2JsYW5rJywgJ25vb3BlbmVyLG5vcmVmZXJyZXInKTtcbiAgICB9IGVsc2UgaWYgKHRhcmdldC5tYXRjaGVzKCcuZ290by10YWItYnRuJykpIHtcbiAgICAgIGNvbnN0IHRhYklkID0gTnVtYmVyKHRhcmdldC5kYXRhc2V0LnRhYklkKTtcbiAgICAgIGNvbnN0IHdpbmRvd0lkID0gTnVtYmVyKHRhcmdldC5kYXRhc2V0LndpbmRvd0lkKTtcbiAgICAgIGlmICh0YWJJZCAmJiB3aW5kb3dJZCkge1xuICAgICAgICBjaHJvbWUudGFicy51cGRhdGUodGFiSWQsIHsgYWN0aXZlOiB0cnVlIH0pO1xuICAgICAgICBjaHJvbWUud2luZG93cy51cGRhdGUod2luZG93SWQsIHsgZm9jdXNlZDogdHJ1ZSB9KTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHRhcmdldC5tYXRjaGVzKCcuY2xvc2UtdGFiLWJ0bicpKSB7XG4gICAgICBjb25zdCB0YWJJZCA9IE51bWJlcih0YXJnZXQuZGF0YXNldC50YWJJZCk7XG4gICAgICBpZiAodGFiSWQpIHtcbiAgICAgICAgY2hyb21lLnRhYnMucmVtb3ZlKHRhYklkKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHRhcmdldC5tYXRjaGVzKCcuc3RyYXRlZ3ktdmlldy1idG4nKSkge1xuICAgICAgICBjb25zdCB0eXBlID0gdGFyZ2V0LmRhdGFzZXQudHlwZTtcbiAgICAgICAgY29uc3QgbmFtZSA9IHRhcmdldC5kYXRhc2V0Lm5hbWU7XG4gICAgICAgIGlmICh0eXBlICYmIG5hbWUpIHtcbiAgICAgICAgICAgIHNob3dTdHJhdGVneURldGFpbHModHlwZSwgbmFtZSk7XG4gICAgICAgIH1cbiAgICB9XG4gIH0pO1xuXG4gIC8vIEluaXRpYWxpemUgTW9kdWxlc1xuICBpbml0VGFic1RhYmxlKCk7XG4gIGluaXRTdHJhdGVnaWVzKCk7XG4gIGluaXRTdHJhdGVneUJ1aWxkZXIoKTtcbiAgaW5pdExvZ3MoKTtcbiAgaW5pdEdlbmVyYSgpO1xuICBpbml0U2ltdWxhdGlvbigpO1xuXG4gIGxvYWRUYWJzKCk7XG5cbiAgLy8gUHJlLXJlbmRlciBzdGF0aWMgY29udGVudFxuICBhd2FpdCBsb2FkUHJlZmVyZW5jZXNBbmRJbml0KCk7IC8vIExvYWQgcHJlZmVyZW5jZXMgZmlyc3QgdG8gaW5pdCBzdHJhdGVnaWVzXG5cbiAgcmVuZGVyQWxnb3JpdGhtc1ZpZXcoKTtcbiAgcmVuZGVyU3RyYXRlZ3lDb25maWcoKTtcblxuICBsb2FkQ3VzdG9tR2VuZXJhKCk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFVTyxJQUFNLFdBQVc7QUFBQSxFQUNwQixhQUFhLENBQUM7QUFBQSxFQUNkLHVCQUF1QixDQUFDO0FBQUEsRUFDeEIsbUJBQW1CLG9CQUFJLElBQTJCO0FBQUEsRUFDbEQsV0FBVyxvQkFBSSxJQUFvQjtBQUFBLEVBQ25DLFNBQVM7QUFBQSxFQUNULGVBQWU7QUFBQSxFQUNmLG9CQUFvQixvQkFBSSxJQUFZO0FBQUE7QUFBQSxFQUdwQyxtQkFBbUI7QUFBQSxFQUNuQixlQUFlLENBQUM7QUFBQSxFQUNoQixTQUFTO0FBQUEsSUFDTCxFQUFFLEtBQUssTUFBTSxPQUFPLE1BQU0sU0FBUyxNQUFNLE9BQU8s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
