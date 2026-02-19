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
var logError = (message, context) => {
  addLog("error", message, context);
  if (shouldLog("error")) {
    console.error(`${PREFIX} [ERROR] ${formatMessage(message, context)}`);
  }
};

// src/background/extraction/logic.ts
function normalizeUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    const params = new URLSearchParams(url.search);
    const keys = [];
    params.forEach((_, key) => keys.push(key));
    const hostname = url.hostname.replace(/^www\./, "");
    const TRACKING = [/^utm_/, /^fbclid$/, /^gclid$/, /^_ga$/, /^ref$/, /^yclid$/, /^_hs/];
    const isYoutube = hostname.endsWith("youtube.com") || hostname.endsWith("youtu.be");
    const isGoogle = hostname.endsWith("google.com");
    const keep = [];
    if (isYoutube) keep.push("v", "list", "t", "c", "channel", "playlist");
    if (isGoogle) keep.push("q", "id", "sourceid");
    for (const key of keys) {
      if (TRACKING.some((r) => r.test(key))) {
        params.delete(key);
        continue;
      }
      if ((isYoutube || isGoogle) && !keep.includes(key)) {
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
    publishedAt = mainEntity.datePublished || null;
    modifiedAt = mainEntity.dateModified || null;
    tags = extractKeywords(mainEntity);
  }
  const breadcrumbs = extractBreadcrumbs(jsonLd);
  return { author, publishedAt, modifiedAt, tags, breadcrumbs };
}
function extractYouTubeChannelFromHtml(html) {
  const scriptRegex = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const json = JSON.parse(match[1]);
      const array = Array.isArray(json) ? json : [json];
      const fields = extractJsonLdFields(array);
      if (fields.author) return fields.author;
    } catch (e) {
    }
  }
  const linkNameRegex = /<link\s+itemprop=["']name["']\s+content=["']([^"']+)["']\s*\/?>/i;
  const linkMatch = linkNameRegex.exec(html);
  if (linkMatch && linkMatch[1]) return decodeHtmlEntities(linkMatch[1]);
  const metaAuthorRegex = /<meta\s+name=["']author["']\s+content=["']([^"']+)["']\s*\/?>/i;
  const metaMatch = metaAuthorRegex.exec(html);
  if (metaMatch && metaMatch[1]) {
    return decodeHtmlEntities(metaMatch[1]);
  }
  return null;
}
function extractYouTubeGenreFromHtml(html) {
  const metaGenreRegex = /<meta\s+itemprop=["']genre["']\s+content=["']([^"']+)["']\s*\/?>/i;
  const metaMatch = metaGenreRegex.exec(html);
  if (metaMatch && metaMatch[1]) {
    return decodeHtmlEntities(metaMatch[1]);
  }
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
            const channel = extractYouTubeChannelFromHtml(html);
            if (channel) {
              baseline.authorOrCreator = channel;
            }
            const genre = extractYouTubeGenreFromHtml(html);
            if (genre) {
              baseline.genre = genre;
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
    if (data.platform === "YouTube" || data.platform === "Netflix" || data.platform === "Spotify" || data.platform === "Twitch") {
      context = "Entertainment";
      source = "Extraction";
    } else if (data.platform === "GitHub" || data.platform === "Stack Overflow" || data.platform === "Jira" || data.platform === "GitLab") {
      context = "Development";
      source = "Extraction";
    } else if (data.platform === "Google" && (data.normalizedUrl.includes("docs") || data.normalizedUrl.includes("sheets") || data.normalizedUrl.includes("slides"))) {
      context = "Work";
      source = "Extraction";
    } else {
      if (data.objectType && data.objectType !== "unknown") {
        if (data.objectType === "video") context = "Entertainment";
        else if (data.objectType === "article") context = "News";
        else context = data.objectType.charAt(0).toUpperCase() + data.objectType.slice(1);
      } else {
        context = "General Web";
      }
      source = "Extraction";
    }
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
    appState.currentContextMap = await analyzeTabContext(mappedTabs);
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

// src/background/groupingStrategies.ts
var customStrategies = [];
var setCustomStrategies = (strategies) => {
  customStrategies = strategies;
};
var getCustomStrategies = () => customStrategies;
var COLORS = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];
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
var colorForKey = (key, offset) => COLORS[(Math.abs(hashCode(key)) + offset) % COLORS.length];
var hashCode = (value) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
};
var getLabelComponent = (strategy, tabs, allTabsMap) => {
  const firstTab = tabs[0];
  if (!firstTab) return "Unknown";
  const custom = customStrategies.find((s) => s.id === strategy);
  if (custom) {
    return groupingKey(firstTab, strategy);
  }
  switch (strategy) {
    case "domain": {
      const siteNames = new Set(tabs.map((t) => t.contextData?.siteName).filter(Boolean));
      if (siteNames.size === 1) {
        return stripTld(Array.from(siteNames)[0]);
      }
      return stripTld(domainFromUrl(firstTab.url));
    }
    case "domain_full":
      return domainFromUrl(firstTab.url);
    case "topic":
      return semanticBucket(firstTab.title, firstTab.url);
    case "lineage":
      if (firstTab.openerTabId !== void 0) {
        const parent = allTabsMap.get(firstTab.openerTabId);
        if (parent) {
          const parentTitle = parent.title.length > 20 ? parent.title.substring(0, 20) + "..." : parent.title;
          return `From: ${parentTitle}`;
        }
        return `From: Tab ${firstTab.openerTabId}`;
      }
      return `Window ${firstTab.windowId}`;
    case "context":
      return firstTab.context || "Uncategorized";
    case "pinned":
      return firstTab.pinned ? "Pinned" : "Unpinned";
    case "age":
      return getRecencyLabel(firstTab.lastAccessed ?? 0);
    case "url":
      return "URL Group";
    case "recency":
      return "Time Group";
    case "nesting":
      return firstTab.openerTabId !== void 0 ? "Children" : "Roots";
    default:
      const val = getFieldValue(firstTab, strategy);
      if (val !== void 0 && val !== null) {
        return String(val);
      }
      return "Unknown";
  }
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
var resolveWindowMode = (modes) => {
  if (modes.includes("new")) return "new";
  if (modes.includes("compound")) return "compound";
  return "current";
};
var groupTabs = (tabs, strategies) => {
  const availableStrategies = getStrategies(customStrategies);
  const effectiveStrategies = strategies.filter((s) => availableStrategies.find((avail) => avail.id === s)?.isGrouping);
  const buckets = /* @__PURE__ */ new Map();
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
        groupColor = colorForKey(bucketKey, buckets.size);
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
    }
    group.tabs.push(tab);
  });
  const groups = Array.from(buckets.values());
  groups.forEach((group) => {
    group.label = generateLabel(effectiveStrategies, group.tabs, allTabsMap);
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
      try {
        return new URL(val).hostname;
      } catch {
        return val;
      }
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
  let tabs = getMappedTabs();
  if (sortingStrats.length > 0) {
    tabs = sortTabs(tabs, sortingStrats);
  }
  const groups = groupTabs(tabs, groupingStrats);
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
            <span style="color: #999; font-size: 0.8em; margin-left: auto;">${escapeHtml(new URL(tab.url).hostname)}</span>
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
  const allStrategies = [...groupingStrats, ...sortingStrats];
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
function renderStrategyConfig() {
  const groupingList = document.getElementById("sim-grouping-list");
  const sortingList = document.getElementById("sim-sorting-list");
  const strategies = getStrategies(appState.localCustomStrategies);
  if (groupingList) {
    const groupingStrategies = strategies.filter((s) => s.isGrouping);
    renderStrategyList(groupingList, groupingStrategies, ["domain", "topic"]);
  }
  if (sortingList) {
    const sortingStrategies = strategies.filter((s) => s.isSorting);
    renderStrategyList(sortingList, sortingStrategies, ["pinned", "recency"]);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3VpL2RldnRvb2xzL3N0YXRlLnRzIiwgIi4uLy4uL3NyYy9zaGFyZWQvdXRpbHMudHMiLCAiLi4vLi4vc3JjL3VpL2RldnRvb2xzL2RhdGEudHMiLCAiLi4vLi4vc3JjL3NoYXJlZC9sb2dnZXIudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZXh0cmFjdGlvbi9sb2dpYy50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9leHRyYWN0aW9uL2dlbmVyYVJlZ2lzdHJ5LnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3N0b3JhZ2UudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvcHJlZmVyZW5jZXMudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZXh0cmFjdGlvbi9pbmRleC50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9jYXRlZ29yeVJ1bGVzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL2NvbnRleHRBbmFseXNpcy50cyIsICIuLi8uLi9zcmMvdWkvZGV2dG9vbHMvdGFic1RhYmxlLnRzIiwgIi4uLy4uL3NyYy9zaGFyZWQvc3RyYXRlZ3lSZWdpc3RyeS50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9ncm91cGluZ1N0cmF0ZWdpZXMudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvc29ydGluZ1N0cmF0ZWdpZXMudHMiLCAiLi4vLi4vc3JjL3VpL2NvbW1vbi50cyIsICIuLi8uLi9zcmMvdWkvZGV2dG9vbHMvY29tcG9uZW50cy50cyIsICIuLi8uLi9zcmMvdWkvZGV2dG9vbHMvc2ltdWxhdGlvbi50cyIsICIuLi8uLi9zcmMvdWkvZGV2dG9vbHMvc3RyYXRlZ2llcy50cyIsICIuLi8uLi9zcmMvdWkvZGV2dG9vbHMvc3RyYXRlZ3lCdWlsZGVyLnRzIiwgIi4uLy4uL3NyYy91aS9kZXZ0b29scy9sb2dzLnRzIiwgIi4uLy4uL3NyYy91aS9kZXZ0b29scy9nZW5lcmEudHMiLCAiLi4vLi4vc3JjL3VpL2RldnRvb2xzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyBDb250ZXh0UmVzdWx0IH0gZnJvbSBcIi4uLy4uL2JhY2tncm91bmQvY29udGV4dEFuYWx5c2lzLmpzXCI7XG5pbXBvcnQgeyBDdXN0b21TdHJhdGVneSwgTG9nRW50cnkgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29sdW1uRGVmaW5pdGlvbiB7XG4gICAga2V5OiBzdHJpbmc7XG4gICAgbGFiZWw6IHN0cmluZztcbiAgICB2aXNpYmxlOiBib29sZWFuO1xuICAgIHdpZHRoOiBzdHJpbmc7IC8vIENTUyB3aWR0aFxuICAgIGZpbHRlcmFibGU6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjb25zdCBhcHBTdGF0ZSA9IHtcbiAgICBjdXJyZW50VGFiczogW10gYXMgY2hyb21lLnRhYnMuVGFiW10sXG4gICAgbG9jYWxDdXN0b21TdHJhdGVnaWVzOiBbXSBhcyBDdXN0b21TdHJhdGVneVtdLFxuICAgIGN1cnJlbnRDb250ZXh0TWFwOiBuZXcgTWFwPG51bWJlciwgQ29udGV4dFJlc3VsdD4oKSxcbiAgICB0YWJUaXRsZXM6IG5ldyBNYXA8bnVtYmVyLCBzdHJpbmc+KCksXG4gICAgc29ydEtleTogbnVsbCBhcyBzdHJpbmcgfCBudWxsLFxuICAgIHNvcnREaXJlY3Rpb246ICdhc2MnIGFzICdhc2MnIHwgJ2Rlc2MnLFxuICAgIHNpbXVsYXRlZFNlbGVjdGlvbjogbmV3IFNldDxudW1iZXI+KCksXG4gICAgXG4gICAgLy8gTW9kZXJuIFRhYmxlIFN0YXRlXG4gICAgZ2xvYmFsU2VhcmNoUXVlcnk6ICcnLFxuICAgIGNvbHVtbkZpbHRlcnM6IHt9IGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz4sXG4gICAgY29sdW1uczogW1xuICAgICAgICB7IGtleTogJ2lkJywgbGFiZWw6ICdJRCcsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnNjBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICAgICAgeyBrZXk6ICdpbmRleCcsIGxhYmVsOiAnSW5kZXgnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzYwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgICAgIHsga2V5OiAnd2luZG93SWQnLCBsYWJlbDogJ1dpbmRvdycsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnNzBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICAgICAgeyBrZXk6ICdncm91cElkJywgbGFiZWw6ICdHcm91cCcsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnNzBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICAgICAgeyBrZXk6ICd0aXRsZScsIGxhYmVsOiAnVGl0bGUnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzIwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgICAgICB7IGtleTogJ3VybCcsIGxhYmVsOiAnVVJMJywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICcyNTBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICAgICAgeyBrZXk6ICdnZW5yZScsIGxhYmVsOiAnR2VucmUnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzEwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgICAgICB7IGtleTogJ2NvbnRleHQnLCBsYWJlbDogJ0NhdGVnb3J5JywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICcxMDBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICAgICAgeyBrZXk6ICdzaXRlTmFtZScsIGxhYmVsOiAnU2l0ZSBOYW1lJywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICcxMjBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICAgICAgeyBrZXk6ICdwbGF0Zm9ybScsIGxhYmVsOiAnUGxhdGZvcm0nLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzEwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgICAgICB7IGtleTogJ29iamVjdFR5cGUnLCBsYWJlbDogJ09iamVjdCBUeXBlJywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICcxMDBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICAgICAgeyBrZXk6ICdleHRyYWN0ZWRUaXRsZScsIGxhYmVsOiAnRXh0cmFjdGVkIFRpdGxlJywgdmlzaWJsZTogZmFsc2UsIHdpZHRoOiAnMjAwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgICAgIHsga2V5OiAnYXV0aG9yT3JDcmVhdG9yJywgbGFiZWw6ICdBdXRob3InLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzEyMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgICAgICB7IGtleTogJ3B1Ymxpc2hlZEF0JywgbGFiZWw6ICdQdWJsaXNoZWQnLCB2aXNpYmxlOiBmYWxzZSwgd2lkdGg6ICcxMDBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICAgICAgeyBrZXk6ICdzdGF0dXMnLCBsYWJlbDogJ1N0YXR1cycsIHZpc2libGU6IGZhbHNlLCB3aWR0aDogJzgwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgICAgIHsga2V5OiAnYWN0aXZlJywgbGFiZWw6ICdBY3RpdmUnLCB2aXNpYmxlOiBmYWxzZSwgd2lkdGg6ICc2MHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgICAgICB7IGtleTogJ3Bpbm5lZCcsIGxhYmVsOiAnUGlubmVkJywgdmlzaWJsZTogZmFsc2UsIHdpZHRoOiAnNjBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICAgICAgeyBrZXk6ICdvcGVuZXJUYWJJZCcsIGxhYmVsOiAnT3BlbmVyJywgdmlzaWJsZTogZmFsc2UsIHdpZHRoOiAnNzBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICAgICAgeyBrZXk6ICdwYXJlbnRUaXRsZScsIGxhYmVsOiAnUGFyZW50IFRpdGxlJywgdmlzaWJsZTogZmFsc2UsIHdpZHRoOiAnMTUwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgICAgIHsga2V5OiAnbGFzdEFjY2Vzc2VkJywgbGFiZWw6ICdMYXN0IEFjY2Vzc2VkJywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICcxNTBweCcsIGZpbHRlcmFibGU6IGZhbHNlIH0sXG4gICAgICAgIHsga2V5OiAnYWN0aW9ucycsIGxhYmVsOiAnQWN0aW9ucycsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnMTIwcHgnLCBmaWx0ZXJhYmxlOiBmYWxzZSB9XG4gICAgXSBhcyBDb2x1bW5EZWZpbml0aW9uW10sXG4gICAgXG4gICAgY3VycmVudExvZ3M6IFtdIGFzIExvZ0VudHJ5W11cbn07XG4iLCAiaW1wb3J0IHsgUHJlZmVyZW5jZXMsIFNvcnRpbmdTdHJhdGVneSwgVGFiTWV0YWRhdGEgfSBmcm9tIFwiLi90eXBlcy5qc1wiO1xuXG5leHBvcnQgY29uc3QgbWFwQ2hyb21lVGFiID0gKHRhYjogY2hyb21lLnRhYnMuVGFiKTogVGFiTWV0YWRhdGEgfCBudWxsID0+IHtcbiAgaWYgKCF0YWIuaWQgfHwgdGFiLmlkID09PSBjaHJvbWUudGFicy5UQUJfSURfTk9ORSB8fCAhdGFiLndpbmRvd0lkKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHtcbiAgICBpZDogdGFiLmlkLFxuICAgIHdpbmRvd0lkOiB0YWIud2luZG93SWQsXG4gICAgdGl0bGU6IHRhYi50aXRsZSB8fCBcIlVudGl0bGVkXCIsXG4gICAgdXJsOiB0YWIucGVuZGluZ1VybCB8fCB0YWIudXJsIHx8IFwiYWJvdXQ6YmxhbmtcIixcbiAgICBwaW5uZWQ6IEJvb2xlYW4odGFiLnBpbm5lZCksXG4gICAgbGFzdEFjY2Vzc2VkOiB0YWIubGFzdEFjY2Vzc2VkLFxuICAgIG9wZW5lclRhYklkOiB0YWIub3BlbmVyVGFiSWQgPz8gdW5kZWZpbmVkLFxuICAgIGZhdkljb25Vcmw6IHRhYi5mYXZJY29uVXJsLFxuICAgIGdyb3VwSWQ6IHRhYi5ncm91cElkLFxuICAgIGluZGV4OiB0YWIuaW5kZXgsXG4gICAgYWN0aXZlOiB0YWIuYWN0aXZlLFxuICAgIHN0YXR1czogdGFiLnN0YXR1cyxcbiAgICBzZWxlY3RlZDogdGFiLmhpZ2hsaWdodGVkXG4gIH07XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0U3RvcmVkUHJlZmVyZW5jZXMgPSBhc3luYyAoKTogUHJvbWlzZTxQcmVmZXJlbmNlcyB8IG51bGw+ID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFwicHJlZmVyZW5jZXNcIiwgKGl0ZW1zKSA9PiB7XG4gICAgICByZXNvbHZlKChpdGVtc1tcInByZWZlcmVuY2VzXCJdIGFzIFByZWZlcmVuY2VzKSA/PyBudWxsKTtcbiAgICB9KTtcbiAgfSk7XG59O1xuXG5leHBvcnQgY29uc3QgYXNBcnJheSA9IDxUPih2YWx1ZTogdW5rbm93bik6IFRbXSA9PiB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSByZXR1cm4gdmFsdWUgYXMgVFtdO1xuICAgIHJldHVybiBbXTtcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBlc2NhcGVIdG1sKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGlmICghdGV4dCkgcmV0dXJuICcnO1xuICByZXR1cm4gdGV4dFxuICAgIC5yZXBsYWNlKC8mL2csICcmYW1wOycpXG4gICAgLnJlcGxhY2UoLzwvZywgJyZsdDsnKVxuICAgIC5yZXBsYWNlKC8+L2csICcmZ3Q7JylcbiAgICAucmVwbGFjZSgvXCIvZywgJyZxdW90OycpXG4gICAgLnJlcGxhY2UoLycvZywgJyYjMDM5OycpO1xufVxuIiwgImltcG9ydCB7IGFwcFN0YXRlIH0gZnJvbSBcIi4vc3RhdGUuanNcIjtcbmltcG9ydCB7IG1hcENocm9tZVRhYiwgZXNjYXBlSHRtbCB9IGZyb20gXCIuLi8uLi9zaGFyZWQvdXRpbHMuanNcIjtcbmltcG9ydCB7IFRhYk1ldGFkYXRhIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC90eXBlcy5qc1wiO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0TWFwcGVkVGFicygpOiBUYWJNZXRhZGF0YVtdIHtcbiAgcmV0dXJuIGFwcFN0YXRlLmN1cnJlbnRUYWJzXG4gICAgLm1hcCh0YWIgPT4ge1xuICAgICAgICBjb25zdCBtZXRhZGF0YSA9IG1hcENocm9tZVRhYih0YWIpO1xuICAgICAgICBpZiAoIW1ldGFkYXRhKSByZXR1cm4gbnVsbDtcblxuICAgICAgICBjb25zdCBjb250ZXh0UmVzdWx0ID0gYXBwU3RhdGUuY3VycmVudENvbnRleHRNYXAuZ2V0KG1ldGFkYXRhLmlkKTtcbiAgICAgICAgaWYgKGNvbnRleHRSZXN1bHQpIHtcbiAgICAgICAgICAgIG1ldGFkYXRhLmNvbnRleHQgPSBjb250ZXh0UmVzdWx0LmNvbnRleHQ7XG4gICAgICAgICAgICBtZXRhZGF0YS5jb250ZXh0RGF0YSA9IGNvbnRleHRSZXN1bHQuZGF0YTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWV0YWRhdGE7XG4gICAgfSlcbiAgICAuZmlsdGVyKCh0KTogdCBpcyBUYWJNZXRhZGF0YSA9PiB0ICE9PSBudWxsKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN0cmlwSHRtbChodG1sOiBzdHJpbmcpIHtcbiAgICBsZXQgdG1wID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIkRJVlwiKTtcbiAgICB0bXAuaW5uZXJIVE1MID0gaHRtbDtcbiAgICByZXR1cm4gdG1wLnRleHRDb250ZW50IHx8IHRtcC5pbm5lclRleHQgfHwgXCJcIjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFNvcnRWYWx1ZSh0YWI6IGNocm9tZS50YWJzLlRhYiwga2V5OiBzdHJpbmcpOiBhbnkge1xuICBzd2l0Y2ggKGtleSkge1xuICAgIGNhc2UgJ3BhcmVudFRpdGxlJzpcbiAgICAgIHJldHVybiB0YWIub3BlbmVyVGFiSWQgPyAoYXBwU3RhdGUudGFiVGl0bGVzLmdldCh0YWIub3BlbmVyVGFiSWQpIHx8ICcnKSA6ICcnO1xuICAgIGNhc2UgJ2dlbnJlJzpcbiAgICAgIHJldHVybiAodGFiLmlkICYmIGFwcFN0YXRlLmN1cnJlbnRDb250ZXh0TWFwLmdldCh0YWIuaWQpPy5kYXRhPy5nZW5yZSkgfHwgJyc7XG4gICAgY2FzZSAnY29udGV4dCc6XG4gICAgICByZXR1cm4gKHRhYi5pZCAmJiBhcHBTdGF0ZS5jdXJyZW50Q29udGV4dE1hcC5nZXQodGFiLmlkKT8uY29udGV4dCkgfHwgJyc7XG4gICAgY2FzZSAnc2l0ZU5hbWUnOlxuICAgICAgcmV0dXJuICh0YWIuaWQgJiYgYXBwU3RhdGUuY3VycmVudENvbnRleHRNYXAuZ2V0KHRhYi5pZCk/LmRhdGE/LnNpdGVOYW1lKSB8fCAnJztcbiAgICBjYXNlICdwbGF0Zm9ybSc6XG4gICAgICByZXR1cm4gKHRhYi5pZCAmJiBhcHBTdGF0ZS5jdXJyZW50Q29udGV4dE1hcC5nZXQodGFiLmlkKT8uZGF0YT8ucGxhdGZvcm0pIHx8ICcnO1xuICAgIGNhc2UgJ29iamVjdFR5cGUnOlxuICAgICAgcmV0dXJuICh0YWIuaWQgJiYgYXBwU3RhdGUuY3VycmVudENvbnRleHRNYXAuZ2V0KHRhYi5pZCk/LmRhdGE/Lm9iamVjdFR5cGUpIHx8ICcnO1xuICAgIGNhc2UgJ2V4dHJhY3RlZFRpdGxlJzpcbiAgICAgIHJldHVybiAodGFiLmlkICYmIGFwcFN0YXRlLmN1cnJlbnRDb250ZXh0TWFwLmdldCh0YWIuaWQpPy5kYXRhPy50aXRsZSkgfHwgJyc7XG4gICAgY2FzZSAnYXV0aG9yT3JDcmVhdG9yJzpcbiAgICAgIHJldHVybiAodGFiLmlkICYmIGFwcFN0YXRlLmN1cnJlbnRDb250ZXh0TWFwLmdldCh0YWIuaWQpPy5kYXRhPy5hdXRob3JPckNyZWF0b3IpIHx8ICcnO1xuICAgIGNhc2UgJ3B1Ymxpc2hlZEF0JzpcbiAgICAgIHJldHVybiAodGFiLmlkICYmIGFwcFN0YXRlLmN1cnJlbnRDb250ZXh0TWFwLmdldCh0YWIuaWQpPy5kYXRhPy5wdWJsaXNoZWRBdCkgfHwgJyc7XG4gICAgY2FzZSAnYWN0aXZlJzpcbiAgICAgIHJldHVybiB0YWIuYWN0aXZlID8gMSA6IDA7XG4gICAgY2FzZSAncGlubmVkJzpcbiAgICAgIHJldHVybiB0YWIucGlubmVkID8gMSA6IDA7XG4gICAgY2FzZSAnaWQnOlxuICAgICAgcmV0dXJuIHRhYi5pZCA/PyAtMTtcbiAgICBjYXNlICdpbmRleCc6XG4gICAgICByZXR1cm4gdGFiLmluZGV4O1xuICAgIGNhc2UgJ3dpbmRvd0lkJzpcbiAgICAgIHJldHVybiB0YWIud2luZG93SWQ7XG4gICAgY2FzZSAnZ3JvdXBJZCc6XG4gICAgICByZXR1cm4gdGFiLmdyb3VwSWQ7XG4gICAgY2FzZSAnb3BlbmVyVGFiSWQnOlxuICAgICAgcmV0dXJuIHRhYi5vcGVuZXJUYWJJZCA/PyAtMTtcbiAgICBjYXNlICdsYXN0QWNjZXNzZWQnOlxuICAgICAgLy8gbGFzdEFjY2Vzc2VkIGlzIGEgdmFsaWQgcHJvcGVydHkgb2YgY2hyb21lLnRhYnMuVGFiIGluIG1vZGVybiBkZWZpbml0aW9uc1xuICAgICAgcmV0dXJuICh0YWIgYXMgY2hyb21lLnRhYnMuVGFiICYgeyBsYXN0QWNjZXNzZWQ/OiBudW1iZXIgfSkubGFzdEFjY2Vzc2VkIHx8IDA7XG4gICAgY2FzZSAndGl0bGUnOlxuICAgICAgcmV0dXJuICh0YWIudGl0bGUgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG4gICAgY2FzZSAndXJsJzpcbiAgICAgIHJldHVybiAodGFiLnVybCB8fCAnJykudG9Mb3dlckNhc2UoKTtcbiAgICBjYXNlICdzdGF0dXMnOlxuICAgICAgcmV0dXJuICh0YWIuc3RhdHVzIHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gJyc7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENlbGxWYWx1ZSh0YWI6IGNocm9tZS50YWJzLlRhYiwga2V5OiBzdHJpbmcpOiBzdHJpbmcgfCBIVE1MRWxlbWVudCB7XG4gICAgY29uc3QgZXNjYXBlID0gZXNjYXBlSHRtbDtcblxuICAgIHN3aXRjaCAoa2V5KSB7XG4gICAgICAgIGNhc2UgJ2lkJzogcmV0dXJuIFN0cmluZyh0YWIuaWQgPz8gJ04vQScpO1xuICAgICAgICBjYXNlICdpbmRleCc6IHJldHVybiBTdHJpbmcodGFiLmluZGV4KTtcbiAgICAgICAgY2FzZSAnd2luZG93SWQnOiByZXR1cm4gU3RyaW5nKHRhYi53aW5kb3dJZCk7XG4gICAgICAgIGNhc2UgJ2dyb3VwSWQnOiByZXR1cm4gU3RyaW5nKHRhYi5ncm91cElkKTtcbiAgICAgICAgY2FzZSAndGl0bGUnOiByZXR1cm4gZXNjYXBlKHRhYi50aXRsZSB8fCAnJyk7XG4gICAgICAgIGNhc2UgJ3VybCc6IHJldHVybiBlc2NhcGUodGFiLnVybCB8fCAnJyk7XG4gICAgICAgIGNhc2UgJ3N0YXR1cyc6IHJldHVybiBlc2NhcGUodGFiLnN0YXR1cyB8fCAnJyk7XG4gICAgICAgIGNhc2UgJ2FjdGl2ZSc6IHJldHVybiB0YWIuYWN0aXZlID8gJ1llcycgOiAnTm8nO1xuICAgICAgICBjYXNlICdwaW5uZWQnOiByZXR1cm4gdGFiLnBpbm5lZCA/ICdZZXMnIDogJ05vJztcbiAgICAgICAgY2FzZSAnb3BlbmVyVGFiSWQnOiByZXR1cm4gU3RyaW5nKHRhYi5vcGVuZXJUYWJJZCA/PyAnLScpO1xuICAgICAgICBjYXNlICdwYXJlbnRUaXRsZSc6XG4gICAgICAgICAgICAgcmV0dXJuIGVzY2FwZSh0YWIub3BlbmVyVGFiSWQgPyAoYXBwU3RhdGUudGFiVGl0bGVzLmdldCh0YWIub3BlbmVyVGFiSWQpIHx8ICdVbmtub3duJykgOiAnLScpO1xuICAgICAgICBjYXNlICdnZW5yZSc6XG4gICAgICAgICAgICAgcmV0dXJuIGVzY2FwZSgodGFiLmlkICYmIGFwcFN0YXRlLmN1cnJlbnRDb250ZXh0TWFwLmdldCh0YWIuaWQpPy5kYXRhPy5nZW5yZSkgfHwgJy0nKTtcbiAgICAgICAgY2FzZSAnY29udGV4dCc6IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRleHRSZXN1bHQgPSB0YWIuaWQgPyBhcHBTdGF0ZS5jdXJyZW50Q29udGV4dE1hcC5nZXQodGFiLmlkKSA6IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIGlmICghY29udGV4dFJlc3VsdCkgcmV0dXJuICdOL0EnO1xuXG4gICAgICAgICAgICBsZXQgY2VsbFN0eWxlID0gJyc7XG4gICAgICAgICAgICBsZXQgYWlDb250ZXh0ID0gJyc7XG5cbiAgICAgICAgICAgIGlmIChjb250ZXh0UmVzdWx0LnN0YXR1cyA9PT0gJ1JFU1RSSUNURUQnKSB7XG4gICAgICAgICAgICAgICAgYWlDb250ZXh0ID0gJ1VuZXh0cmFjdGFibGUgKHJlc3RyaWN0ZWQpJztcbiAgICAgICAgICAgICAgICBjZWxsU3R5bGUgPSAnY29sb3I6IGdyYXk7IGZvbnQtc3R5bGU6IGl0YWxpYzsnO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjb250ZXh0UmVzdWx0LmVycm9yKSB7XG4gICAgICAgICAgICAgICAgYWlDb250ZXh0ID0gYEVycm9yICgke2NvbnRleHRSZXN1bHQuZXJyb3J9KWA7XG4gICAgICAgICAgICAgICAgY2VsbFN0eWxlID0gJ2NvbG9yOiByZWQ7JztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY29udGV4dFJlc3VsdC5zb3VyY2UgPT09ICdFeHRyYWN0aW9uJykge1xuICAgICAgICAgICAgICAgIGFpQ29udGV4dCA9IGAke2NvbnRleHRSZXN1bHQuY29udGV4dH0gKEV4dHJhY3RlZClgO1xuICAgICAgICAgICAgICAgIGNlbGxTdHlsZSA9ICdjb2xvcjogZ3JlZW47IGZvbnQtd2VpZ2h0OiBib2xkOyc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICBhaUNvbnRleHQgPSBgJHtjb250ZXh0UmVzdWx0LmNvbnRleHR9YDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICBjb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdmbGV4JztcbiAgICAgICAgICAgIGNvbnRhaW5lci5zdHlsZS5mbGV4RGlyZWN0aW9uID0gJ2NvbHVtbic7XG4gICAgICAgICAgICBjb250YWluZXIuc3R5bGUuZ2FwID0gJzVweCc7XG5cbiAgICAgICAgICAgIGNvbnN0IHN1bW1hcnlEaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgIHN1bW1hcnlEaXYuc3R5bGUuY3NzVGV4dCA9IGNlbGxTdHlsZTtcbiAgICAgICAgICAgIHN1bW1hcnlEaXYudGV4dENvbnRlbnQgPSBhaUNvbnRleHQ7XG4gICAgICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoc3VtbWFyeURpdik7XG5cbiAgICAgICAgICAgIGlmIChjb250ZXh0UmVzdWx0LmRhdGEpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkZXRhaWxzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncHJlJyk7XG4gICAgICAgICAgICAgICAgZGV0YWlscy5zdHlsZS5jc3NUZXh0ID0gJ21heC1oZWlnaHQ6IDMwMHB4OyBvdmVyZmxvdzogYXV0bzsgZm9udC1zaXplOiAxMXB4OyB0ZXh0LWFsaWduOiBsZWZ0OyBiYWNrZ3JvdW5kOiAjZjVmNWY1OyBwYWRkaW5nOiA1cHg7IGJvcmRlcjogMXB4IHNvbGlkICNkZGQ7IG1hcmdpbjogMDsgd2hpdGUtc3BhY2U6IHByZS13cmFwOyBmb250LWZhbWlseTogbW9ub3NwYWNlOyc7XG4gICAgICAgICAgICAgICAgZGV0YWlscy50ZXh0Q29udGVudCA9IEpTT04uc3RyaW5naWZ5KGNvbnRleHRSZXN1bHQuZGF0YSwgbnVsbCwgMik7XG4gICAgICAgICAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKGRldGFpbHMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gY29udGFpbmVyO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgJ2xhc3RBY2Nlc3NlZCc6XG4gICAgICAgICAgICByZXR1cm4gbmV3IERhdGUoKHRhYiBhcyBhbnkpLmxhc3RBY2Nlc3NlZCB8fCAwKS50b0xvY2FsZVN0cmluZygpO1xuICAgICAgICBjYXNlICdhY3Rpb25zJzoge1xuICAgICAgICAgICAgY29uc3Qgd3JhcHBlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgd3JhcHBlci5pbm5lckhUTUwgPSBgXG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImdvdG8tdGFiLWJ0blwiIGRhdGEtdGFiLWlkPVwiJHt0YWIuaWR9XCIgZGF0YS13aW5kb3ctaWQ9XCIke3RhYi53aW5kb3dJZH1cIj5HbzwvYnV0dG9uPlxuICAgICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJjbG9zZS10YWItYnRuXCIgZGF0YS10YWItaWQ9XCIke3RhYi5pZH1cIiBzdHlsZT1cImJhY2tncm91bmQtY29sb3I6ICNkYzM1NDU7IG1hcmdpbi1sZWZ0OiAycHg7XCI+WDwvYnV0dG9uPlxuICAgICAgICAgICAgYDtcbiAgICAgICAgICAgIHJldHVybiB3cmFwcGVyO1xuICAgICAgICB9XG4gICAgICAgIGRlZmF1bHQ6IHJldHVybiAnJztcbiAgICB9XG59XG4iLCAiaW1wb3J0IHsgTG9nRW50cnksIExvZ0xldmVsLCBQcmVmZXJlbmNlcyB9IGZyb20gXCIuL3R5cGVzLmpzXCI7XG5cbmNvbnN0IFBSRUZJWCA9IFwiW1RhYlNvcnRlcl1cIjtcblxuY29uc3QgTEVWRUxfUFJJT1JJVFk6IFJlY29yZDxMb2dMZXZlbCwgbnVtYmVyPiA9IHtcbiAgZGVidWc6IDAsXG4gIGluZm86IDEsXG4gIHdhcm46IDIsXG4gIGVycm9yOiAzLFxuICBjcml0aWNhbDogNFxufTtcblxubGV0IGN1cnJlbnRMZXZlbDogTG9nTGV2ZWwgPSBcImluZm9cIjtcbmxldCBsb2dzOiBMb2dFbnRyeVtdID0gW107XG5jb25zdCBNQVhfTE9HUyA9IDEwMDA7XG5jb25zdCBTVE9SQUdFX0tFWSA9IFwic2Vzc2lvbkxvZ3NcIjtcblxuLy8gU2FmZSBjb250ZXh0IGNoZWNrXG5jb25zdCBpc1NlcnZpY2VXb3JrZXIgPSB0eXBlb2Ygc2VsZiAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVvZiAoc2VsZiBhcyBhbnkpLlNlcnZpY2VXb3JrZXJHbG9iYWxTY29wZSAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYgaW5zdGFuY2VvZiAoc2VsZiBhcyBhbnkpLlNlcnZpY2VXb3JrZXJHbG9iYWxTY29wZTtcbmxldCBpc1NhdmluZyA9IGZhbHNlO1xubGV0IHBlbmRpbmdTYXZlID0gZmFsc2U7XG5sZXQgc2F2ZVRpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsO1xuXG5jb25zdCBkb1NhdmUgPSAoKSA9PiB7XG4gICAgaWYgKCFpc1NlcnZpY2VXb3JrZXIgfHwgIWNocm9tZT8uc3RvcmFnZT8uc2Vzc2lvbiB8fCBpc1NhdmluZykge1xuICAgICAgICBwZW5kaW5nU2F2ZSA9IHRydWU7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpc1NhdmluZyA9IHRydWU7XG4gICAgcGVuZGluZ1NhdmUgPSBmYWxzZTtcblxuICAgIGNocm9tZS5zdG9yYWdlLnNlc3Npb24uc2V0KHsgW1NUT1JBR0VfS0VZXTogbG9ncyB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgaXNTYXZpbmcgPSBmYWxzZTtcbiAgICAgICAgaWYgKHBlbmRpbmdTYXZlKSB7XG4gICAgICAgICAgICBzYXZlTG9nc1RvU3RvcmFnZSgpO1xuICAgICAgICB9XG4gICAgfSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBzYXZlIGxvZ3NcIiwgZXJyKTtcbiAgICAgICAgaXNTYXZpbmcgPSBmYWxzZTtcbiAgICB9KTtcbn07XG5cbmNvbnN0IHNhdmVMb2dzVG9TdG9yYWdlID0gKCkgPT4ge1xuICAgIGlmIChzYXZlVGltZXIpIGNsZWFyVGltZW91dChzYXZlVGltZXIpO1xuICAgIHNhdmVUaW1lciA9IHNldFRpbWVvdXQoZG9TYXZlLCAxMDAwKTtcbn07XG5cbmxldCByZXNvbHZlTG9nZ2VyUmVhZHk6ICgpID0+IHZvaWQ7XG5leHBvcnQgY29uc3QgbG9nZ2VyUmVhZHkgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcbiAgICByZXNvbHZlTG9nZ2VyUmVhZHkgPSByZXNvbHZlO1xufSk7XG5cbmV4cG9ydCBjb25zdCBpbml0TG9nZ2VyID0gYXN5bmMgKCkgPT4ge1xuICAgIGlmIChpc1NlcnZpY2VXb3JrZXIgJiYgY2hyb21lPy5zdG9yYWdlPy5zZXNzaW9uKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjaHJvbWUuc3RvcmFnZS5zZXNzaW9uLmdldChTVE9SQUdFX0tFWSk7XG4gICAgICAgICAgICBpZiAocmVzdWx0W1NUT1JBR0VfS0VZXSAmJiBBcnJheS5pc0FycmF5KHJlc3VsdFtTVE9SQUdFX0tFWV0pKSB7XG4gICAgICAgICAgICAgICAgbG9ncyA9IHJlc3VsdFtTVE9SQUdFX0tFWV07XG4gICAgICAgICAgICAgICAgaWYgKGxvZ3MubGVuZ3RoID4gTUFYX0xPR1MpIGxvZ3MgPSBsb2dzLnNsaWNlKDAsIE1BWF9MT0dTKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byByZXN0b3JlIGxvZ3NcIiwgZSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKHJlc29sdmVMb2dnZXJSZWFkeSkgcmVzb2x2ZUxvZ2dlclJlYWR5KCk7XG59O1xuXG5leHBvcnQgY29uc3Qgc2V0TG9nZ2VyUHJlZmVyZW5jZXMgPSAocHJlZnM6IFByZWZlcmVuY2VzKSA9PiB7XG4gIGlmIChwcmVmcy5sb2dMZXZlbCkge1xuICAgIGN1cnJlbnRMZXZlbCA9IHByZWZzLmxvZ0xldmVsO1xuICB9IGVsc2UgaWYgKHByZWZzLmRlYnVnKSB7XG4gICAgY3VycmVudExldmVsID0gXCJkZWJ1Z1wiO1xuICB9IGVsc2Uge1xuICAgIGN1cnJlbnRMZXZlbCA9IFwiaW5mb1wiO1xuICB9XG59O1xuXG5jb25zdCBzaG91bGRMb2cgPSAobGV2ZWw6IExvZ0xldmVsKTogYm9vbGVhbiA9PiB7XG4gIHJldHVybiBMRVZFTF9QUklPUklUWVtsZXZlbF0gPj0gTEVWRUxfUFJJT1JJVFlbY3VycmVudExldmVsXTtcbn07XG5cbmNvbnN0IGZvcm1hdE1lc3NhZ2UgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgcmV0dXJuIGNvbnRleHQgPyBgJHttZXNzYWdlfSA6OiAke0pTT04uc3RyaW5naWZ5KGNvbnRleHQpfWAgOiBtZXNzYWdlO1xufTtcblxuY29uc3QgYWRkTG9nID0gKGxldmVsOiBMb2dMZXZlbCwgbWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgaWYgKHNob3VsZExvZyhsZXZlbCkpIHtcbiAgICAgIGNvbnN0IGVudHJ5OiBMb2dFbnRyeSA9IHtcbiAgICAgICAgICB0aW1lc3RhbXA6IERhdGUubm93KCksXG4gICAgICAgICAgbGV2ZWwsXG4gICAgICAgICAgbWVzc2FnZSxcbiAgICAgICAgICBjb250ZXh0XG4gICAgICB9O1xuXG4gICAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSB7XG4gICAgICAgICAgbG9ncy51bnNoaWZ0KGVudHJ5KTtcbiAgICAgICAgICBpZiAobG9ncy5sZW5ndGggPiBNQVhfTE9HUykge1xuICAgICAgICAgICAgICBsb2dzLnBvcCgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBzYXZlTG9nc1RvU3RvcmFnZSgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBJbiBvdGhlciBjb250ZXh0cywgc2VuZCB0byBTV1xuICAgICAgICAgIGlmIChjaHJvbWU/LnJ1bnRpbWU/LnNlbmRNZXNzYWdlKSB7XG4gICAgICAgICAgICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiAnbG9nRW50cnknLCBwYXlsb2FkOiBlbnRyeSB9KS5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgIC8vIElnbm9yZSBpZiBtZXNzYWdlIGZhaWxzIChlLmcuIGNvbnRleHQgaW52YWxpZGF0ZWQpXG4gICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgfVxuICB9XG59O1xuXG5leHBvcnQgY29uc3QgYWRkTG9nRW50cnkgPSAoZW50cnk6IExvZ0VudHJ5KSA9PiB7XG4gICAgaWYgKGlzU2VydmljZVdvcmtlcikge1xuICAgICAgICBsb2dzLnVuc2hpZnQoZW50cnkpO1xuICAgICAgICBpZiAobG9ncy5sZW5ndGggPiBNQVhfTE9HUykge1xuICAgICAgICAgICAgbG9ncy5wb3AoKTtcbiAgICAgICAgfVxuICAgICAgICBzYXZlTG9nc1RvU3RvcmFnZSgpO1xuICAgIH1cbn07XG5cbmV4cG9ydCBjb25zdCBnZXRMb2dzID0gKCkgPT4gWy4uLmxvZ3NdO1xuZXhwb3J0IGNvbnN0IGNsZWFyTG9ncyA9ICgpID0+IHtcbiAgICBsb2dzLmxlbmd0aCA9IDA7XG4gICAgaWYgKGlzU2VydmljZVdvcmtlcikgc2F2ZUxvZ3NUb1N0b3JhZ2UoKTtcbn07XG5cbmV4cG9ydCBjb25zdCBsb2dEZWJ1ZyA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBhZGRMb2coXCJkZWJ1Z1wiLCBtZXNzYWdlLCBjb250ZXh0KTtcbiAgaWYgKHNob3VsZExvZyhcImRlYnVnXCIpKSB7XG4gICAgY29uc29sZS5kZWJ1ZyhgJHtQUkVGSVh9IFtERUJVR10gJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nSW5mbyA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBhZGRMb2coXCJpbmZvXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwiaW5mb1wiKSkge1xuICAgIGNvbnNvbGUuaW5mbyhgJHtQUkVGSVh9IFtJTkZPXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgY29udGV4dCl9YCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBsb2dXYXJuID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcIndhcm5cIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJ3YXJuXCIpKSB7XG4gICAgY29uc29sZS53YXJuKGAke1BSRUZJWH0gW1dBUk5dICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0Vycm9yID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImVycm9yXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwiZXJyb3JcIikpIHtcbiAgICBjb25zb2xlLmVycm9yKGAke1BSRUZJWH0gW0VSUk9SXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgY29udGV4dCl9YCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBsb2dDcml0aWNhbCA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBhZGRMb2coXCJjcml0aWNhbFwiLCBtZXNzYWdlLCBjb250ZXh0KTtcbiAgaWYgKHNob3VsZExvZyhcImNyaXRpY2FsXCIpKSB7XG4gICAgLy8gQ3JpdGljYWwgbG9ncyB1c2UgZXJyb3IgY29uc29sZSBidXQgd2l0aCBkaXN0aW5jdCBwcmVmaXggYW5kIG1heWJlIHN0eWxpbmcgaWYgc3VwcG9ydGVkXG4gICAgY29uc29sZS5lcnJvcihgJHtQUkVGSVh9IFtDUklUSUNBTF0gXHVEODNEXHVERUE4ICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcbiIsICIvLyBsb2dpYy50c1xuLy8gUHVyZSBmdW5jdGlvbnMgZm9yIGV4dHJhY3Rpb24gbG9naWNcblxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZVVybCh1cmxTdHI6IHN0cmluZyk6IHN0cmluZyB7XG4gIHRyeSB7XG4gICAgY29uc3QgdXJsID0gbmV3IFVSTCh1cmxTdHIpO1xuICAgIGNvbnN0IHBhcmFtcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXModXJsLnNlYXJjaCk7XG4gICAgY29uc3Qga2V5czogc3RyaW5nW10gPSBbXTtcbiAgICBwYXJhbXMuZm9yRWFjaCgoXywga2V5KSA9PiBrZXlzLnB1c2goa2V5KSk7XG4gICAgY29uc3QgaG9zdG5hbWUgPSB1cmwuaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sICcnKTtcblxuICAgIGNvbnN0IFRSQUNLSU5HID0gWy9edXRtXy8sIC9eZmJjbGlkJC8sIC9eZ2NsaWQkLywgL15fZ2EkLywgL15yZWYkLywgL155Y2xpZCQvLCAvXl9ocy9dO1xuICAgIGNvbnN0IGlzWW91dHViZSA9IGhvc3RuYW1lLmVuZHNXaXRoKCd5b3V0dWJlLmNvbScpIHx8IGhvc3RuYW1lLmVuZHNXaXRoKCd5b3V0dS5iZScpO1xuICAgIGNvbnN0IGlzR29vZ2xlID0gaG9zdG5hbWUuZW5kc1dpdGgoJ2dvb2dsZS5jb20nKTtcblxuICAgIGNvbnN0IGtlZXA6IHN0cmluZ1tdID0gW107XG4gICAgaWYgKGlzWW91dHViZSkga2VlcC5wdXNoKCd2JywgJ2xpc3QnLCAndCcsICdjJywgJ2NoYW5uZWwnLCAncGxheWxpc3QnKTtcbiAgICBpZiAoaXNHb29nbGUpIGtlZXAucHVzaCgncScsICdpZCcsICdzb3VyY2VpZCcpO1xuXG4gICAgZm9yIChjb25zdCBrZXkgb2Yga2V5cykge1xuICAgICAgaWYgKFRSQUNLSU5HLnNvbWUociA9PiByLnRlc3Qoa2V5KSkpIHtcbiAgICAgICAgIHBhcmFtcy5kZWxldGUoa2V5KTtcbiAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKChpc1lvdXR1YmUgfHwgaXNHb29nbGUpICYmICFrZWVwLmluY2x1ZGVzKGtleSkpIHtcbiAgICAgICAgIHBhcmFtcy5kZWxldGUoa2V5KTtcbiAgICAgIH1cbiAgICB9XG4gICAgdXJsLnNlYXJjaCA9IHBhcmFtcy50b1N0cmluZygpO1xuICAgIHJldHVybiB1cmwudG9TdHJpbmcoKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIHJldHVybiB1cmxTdHI7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlWW91VHViZVVybCh1cmxTdHI6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHVybCA9IG5ldyBVUkwodXJsU3RyKTtcbiAgICAgICAgY29uc3QgdiA9IHVybC5zZWFyY2hQYXJhbXMuZ2V0KCd2Jyk7XG4gICAgICAgIGNvbnN0IGlzU2hvcnRzID0gdXJsLnBhdGhuYW1lLmluY2x1ZGVzKCcvc2hvcnRzLycpO1xuICAgICAgICBsZXQgdmlkZW9JZCA9XG4gICAgICAgICAgdiB8fFxuICAgICAgICAgIChpc1Nob3J0cyA/IHVybC5wYXRobmFtZS5zcGxpdCgnL3Nob3J0cy8nKVsxXSA6IG51bGwpIHx8XG4gICAgICAgICAgKHVybC5ob3N0bmFtZSA9PT0gJ3lvdXR1LmJlJyA/IHVybC5wYXRobmFtZS5yZXBsYWNlKCcvJywgJycpIDogbnVsbCk7XG5cbiAgICAgICAgY29uc3QgcGxheWxpc3RJZCA9IHVybC5zZWFyY2hQYXJhbXMuZ2V0KCdsaXN0Jyk7XG4gICAgICAgIGNvbnN0IHBsYXlsaXN0SW5kZXggPSBwYXJzZUludCh1cmwuc2VhcmNoUGFyYW1zLmdldCgnaW5kZXgnKSB8fCAnMCcsIDEwKTtcblxuICAgICAgICByZXR1cm4geyB2aWRlb0lkLCBpc1Nob3J0cywgcGxheWxpc3RJZCwgcGxheWxpc3RJbmRleCB9O1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcmV0dXJuIHsgdmlkZW9JZDogbnVsbCwgaXNTaG9ydHM6IGZhbHNlLCBwbGF5bGlzdElkOiBudWxsLCBwbGF5bGlzdEluZGV4OiBudWxsIH07XG4gICAgfVxufVxuXG5mdW5jdGlvbiBleHRyYWN0QXV0aG9yKGVudGl0eTogYW55KTogc3RyaW5nIHwgbnVsbCB7XG4gICAgaWYgKCFlbnRpdHkgfHwgIWVudGl0eS5hdXRob3IpIHJldHVybiBudWxsO1xuICAgIGlmICh0eXBlb2YgZW50aXR5LmF1dGhvciA9PT0gJ3N0cmluZycpIHJldHVybiBlbnRpdHkuYXV0aG9yO1xuICAgIGlmIChBcnJheS5pc0FycmF5KGVudGl0eS5hdXRob3IpKSByZXR1cm4gZW50aXR5LmF1dGhvclswXT8ubmFtZSB8fCBudWxsO1xuICAgIGlmICh0eXBlb2YgZW50aXR5LmF1dGhvciA9PT0gJ29iamVjdCcpIHJldHVybiBlbnRpdHkuYXV0aG9yLm5hbWUgfHwgbnVsbDtcbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gZXh0cmFjdEtleXdvcmRzKGVudGl0eTogYW55KTogc3RyaW5nW10ge1xuICAgIGlmICghZW50aXR5IHx8ICFlbnRpdHkua2V5d29yZHMpIHJldHVybiBbXTtcbiAgICBpZiAodHlwZW9mIGVudGl0eS5rZXl3b3JkcyA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmV0dXJuIGVudGl0eS5rZXl3b3Jkcy5zcGxpdCgnLCcpLm1hcCgoczogc3RyaW5nKSA9PiBzLnRyaW0oKSk7XG4gICAgfVxuICAgIGlmIChBcnJheS5pc0FycmF5KGVudGl0eS5rZXl3b3JkcykpIHJldHVybiBlbnRpdHkua2V5d29yZHM7XG4gICAgcmV0dXJuIFtdO1xufVxuXG5mdW5jdGlvbiBleHRyYWN0QnJlYWRjcnVtYnMoanNvbkxkOiBhbnlbXSk6IHN0cmluZ1tdIHtcbiAgICBjb25zdCBicmVhZGNydW1iTGQgPSBqc29uTGQuZmluZChpID0+IGkgJiYgaVsnQHR5cGUnXSA9PT0gJ0JyZWFkY3J1bWJMaXN0Jyk7XG4gICAgaWYgKCFicmVhZGNydW1iTGQgfHwgIUFycmF5LmlzQXJyYXkoYnJlYWRjcnVtYkxkLml0ZW1MaXN0RWxlbWVudCkpIHJldHVybiBbXTtcblxuICAgIGNvbnN0IGxpc3QgPSBicmVhZGNydW1iTGQuaXRlbUxpc3RFbGVtZW50LnNvcnQoKGE6IGFueSwgYjogYW55KSA9PiAoYS5wb3NpdGlvbiB8fCAwKSAtIChiLnBvc2l0aW9uIHx8IDApKTtcbiAgICBjb25zdCBicmVhZGNydW1iczogc3RyaW5nW10gPSBbXTtcbiAgICBsaXN0LmZvckVhY2goKGl0ZW06IGFueSkgPT4ge1xuICAgICAgICBpZiAoaXRlbS5uYW1lKSBicmVhZGNydW1icy5wdXNoKGl0ZW0ubmFtZSk7XG4gICAgICAgIGVsc2UgaWYgKGl0ZW0uaXRlbSAmJiBpdGVtLml0ZW0ubmFtZSkgYnJlYWRjcnVtYnMucHVzaChpdGVtLml0ZW0ubmFtZSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIGJyZWFkY3J1bWJzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXh0cmFjdEpzb25MZEZpZWxkcyhqc29uTGQ6IGFueVtdKSB7XG4gICAgLy8gRmluZCBtYWluIGVudGl0eVxuICAgIC8vIEFkZGVkIHNhZmV0eSBjaGVjazogaSAmJiBpWydAdHlwZSddXG4gICAgY29uc3QgbWFpbkVudGl0eSA9IGpzb25MZC5maW5kKGkgPT4gaSAmJiAoaVsnQHR5cGUnXSA9PT0gJ0FydGljbGUnIHx8IGlbJ0B0eXBlJ10gPT09ICdWaWRlb09iamVjdCcgfHwgaVsnQHR5cGUnXSA9PT0gJ05ld3NBcnRpY2xlJykpIHx8IGpzb25MZFswXTtcblxuICAgIGxldCBhdXRob3I6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgIGxldCBwdWJsaXNoZWRBdDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgbGV0IG1vZGlmaWVkQXQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgIGxldCB0YWdzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgaWYgKG1haW5FbnRpdHkpIHtcbiAgICAgICAgYXV0aG9yID0gZXh0cmFjdEF1dGhvcihtYWluRW50aXR5KTtcbiAgICAgICAgcHVibGlzaGVkQXQgPSBtYWluRW50aXR5LmRhdGVQdWJsaXNoZWQgfHwgbnVsbDtcbiAgICAgICAgbW9kaWZpZWRBdCA9IG1haW5FbnRpdHkuZGF0ZU1vZGlmaWVkIHx8IG51bGw7XG4gICAgICAgIHRhZ3MgPSBleHRyYWN0S2V5d29yZHMobWFpbkVudGl0eSk7XG4gICAgfVxuXG4gICAgY29uc3QgYnJlYWRjcnVtYnMgPSBleHRyYWN0QnJlYWRjcnVtYnMoanNvbkxkKTtcblxuICAgIHJldHVybiB7IGF1dGhvciwgcHVibGlzaGVkQXQsIG1vZGlmaWVkQXQsIHRhZ3MsIGJyZWFkY3J1bWJzIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0WW91VHViZUNoYW5uZWxGcm9tSHRtbChodG1sOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcbiAgLy8gMS4gVHJ5IEpTT04tTERcbiAgLy8gTG9vayBmb3IgPHNjcmlwdCB0eXBlPVwiYXBwbGljYXRpb24vbGQranNvblwiPi4uLjwvc2NyaXB0PlxuICAvLyBXZSBuZWVkIHRvIGxvb3AgYmVjYXVzZSB0aGVyZSBtaWdodCBiZSBtdWx0aXBsZSBzY3JpcHRzXG4gIGNvbnN0IHNjcmlwdFJlZ2V4ID0gLzxzY3JpcHRcXHMrdHlwZT1bXCInXWFwcGxpY2F0aW9uXFwvbGRcXCtqc29uW1wiJ11bXj5dKj4oW1xcc1xcU10qPyk8XFwvc2NyaXB0Pi9naTtcbiAgbGV0IG1hdGNoO1xuICB3aGlsZSAoKG1hdGNoID0gc2NyaXB0UmVnZXguZXhlYyhodG1sKSkgIT09IG51bGwpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QganNvbiA9IEpTT04ucGFyc2UobWF0Y2hbMV0pO1xuICAgICAgICAgIGNvbnN0IGFycmF5ID0gQXJyYXkuaXNBcnJheShqc29uKSA/IGpzb24gOiBbanNvbl07XG4gICAgICAgICAgY29uc3QgZmllbGRzID0gZXh0cmFjdEpzb25MZEZpZWxkcyhhcnJheSk7XG4gICAgICAgICAgaWYgKGZpZWxkcy5hdXRob3IpIHJldHVybiBmaWVsZHMuYXV0aG9yO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIC8vIGlnbm9yZSBwYXJzZSBlcnJvcnNcbiAgICAgIH1cbiAgfVxuXG4gIC8vIDIuIFRyeSA8bGluayBpdGVtcHJvcD1cIm5hbWVcIiBjb250ZW50PVwiLi4uXCI+IChZb3VUdWJlIG9mdGVuIHB1dHMgY2hhbm5lbCBuYW1lIGhlcmUgaW4gc29tZSBjb250ZXh0cylcbiAgLy8gT3IgPG1ldGEgaXRlbXByb3A9XCJjaGFubmVsSWRcIiBjb250ZW50PVwiLi4uXCI+IC0+IGJ1dCB0aGF0J3MgSUQuXG4gIC8vIDxsaW5rIGl0ZW1wcm9wPVwibmFtZVwiIGNvbnRlbnQ9XCJDaGFubmVsIE5hbWVcIj5cbiAgLy8gPHNwYW4gaXRlbXByb3A9XCJhdXRob3JcIiBpdGVtc2NvcGUgaXRlbXR5cGU9XCJodHRwOi8vc2NoZW1hLm9yZy9QZXJzb25cIj48bGluayBpdGVtcHJvcD1cIm5hbWVcIiBjb250ZW50PVwiQ2hhbm5lbCBOYW1lXCI+PC9zcGFuPlxuICBjb25zdCBsaW5rTmFtZVJlZ2V4ID0gLzxsaW5rXFxzK2l0ZW1wcm9wPVtcIiddbmFtZVtcIiddXFxzK2NvbnRlbnQ9W1wiJ10oW15cIiddKylbXCInXVxccypcXC8/Pi9pO1xuICBjb25zdCBsaW5rTWF0Y2ggPSBsaW5rTmFtZVJlZ2V4LmV4ZWMoaHRtbCk7XG4gIGlmIChsaW5rTWF0Y2ggJiYgbGlua01hdGNoWzFdKSByZXR1cm4gZGVjb2RlSHRtbEVudGl0aWVzKGxpbmtNYXRjaFsxXSk7XG5cbiAgLy8gMy4gVHJ5IG1ldGEgYXV0aG9yXG4gIGNvbnN0IG1ldGFBdXRob3JSZWdleCA9IC88bWV0YVxccytuYW1lPVtcIiddYXV0aG9yW1wiJ11cXHMrY29udGVudD1bXCInXShbXlwiJ10rKVtcIiddXFxzKlxcLz8+L2k7XG4gIGNvbnN0IG1ldGFNYXRjaCA9IG1ldGFBdXRob3JSZWdleC5leGVjKGh0bWwpO1xuICBpZiAobWV0YU1hdGNoICYmIG1ldGFNYXRjaFsxXSkge1xuICAgICAgLy8gWW91VHViZSBtZXRhIGF1dGhvciBpcyBvZnRlbiBcIkNoYW5uZWwgTmFtZVwiXG4gICAgICByZXR1cm4gZGVjb2RlSHRtbEVudGl0aWVzKG1ldGFNYXRjaFsxXSk7XG4gIH1cblxuICByZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RZb3VUdWJlR2VucmVGcm9tSHRtbChodG1sOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcbiAgLy8gMS4gVHJ5IDxtZXRhIGl0ZW1wcm9wPVwiZ2VucmVcIiBjb250ZW50PVwiLi4uXCI+XG4gIGNvbnN0IG1ldGFHZW5yZVJlZ2V4ID0gLzxtZXRhXFxzK2l0ZW1wcm9wPVtcIiddZ2VucmVbXCInXVxccytjb250ZW50PVtcIiddKFteXCInXSspW1wiJ11cXHMqXFwvPz4vaTtcbiAgY29uc3QgbWV0YU1hdGNoID0gbWV0YUdlbnJlUmVnZXguZXhlYyhodG1sKTtcbiAgaWYgKG1ldGFNYXRjaCAmJiBtZXRhTWF0Y2hbMV0pIHtcbiAgICAgIHJldHVybiBkZWNvZGVIdG1sRW50aXRpZXMobWV0YU1hdGNoWzFdKTtcbiAgfVxuXG4gIC8vIDIuIFRyeSBKU09OIFwiY2F0ZWdvcnlcIiBpbiBzY3JpcHRzXG4gIC8vIFwiY2F0ZWdvcnlcIjpcIkdhbWluZ1wiXG4gIGNvbnN0IGNhdGVnb3J5UmVnZXggPSAvXCJjYXRlZ29yeVwiXFxzKjpcXHMqXCIoW15cIl0rKVwiLztcbiAgY29uc3QgY2F0TWF0Y2ggPSBjYXRlZ29yeVJlZ2V4LmV4ZWMoaHRtbCk7XG4gIGlmIChjYXRNYXRjaCAmJiBjYXRNYXRjaFsxXSkge1xuICAgICAgcmV0dXJuIGRlY29kZUh0bWxFbnRpdGllcyhjYXRNYXRjaFsxXSk7XG4gIH1cblxuICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gZGVjb2RlSHRtbEVudGl0aWVzKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGlmICghdGV4dCkgcmV0dXJuIHRleHQ7XG5cbiAgY29uc3QgZW50aXRpZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgJyZhbXA7JzogJyYnLFxuICAgICcmbHQ7JzogJzwnLFxuICAgICcmZ3Q7JzogJz4nLFxuICAgICcmcXVvdDsnOiAnXCInLFxuICAgICcmIzM5Oyc6IFwiJ1wiLFxuICAgICcmYXBvczsnOiBcIidcIixcbiAgICAnJm5ic3A7JzogJyAnXG4gIH07XG5cbiAgcmV0dXJuIHRleHQucmVwbGFjZSgvJihbYS16MC05XSt8I1swLTldezEsNn18I3hbMC05YS1mQS1GXXsxLDZ9KTsvaWcsIChtYXRjaCkgPT4ge1xuICAgICAgY29uc3QgbG93ZXIgPSBtYXRjaC50b0xvd2VyQ2FzZSgpO1xuICAgICAgaWYgKGVudGl0aWVzW2xvd2VyXSkgcmV0dXJuIGVudGl0aWVzW2xvd2VyXTtcbiAgICAgIGlmIChlbnRpdGllc1ttYXRjaF0pIHJldHVybiBlbnRpdGllc1ttYXRjaF07XG5cbiAgICAgIGlmIChsb3dlci5zdGFydHNXaXRoKCcmI3gnKSkge1xuICAgICAgICAgIHRyeSB7IHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlKHBhcnNlSW50KGxvd2VyLnNsaWNlKDMsIC0xKSwgMTYpKTsgfSBjYXRjaCB7IHJldHVybiBtYXRjaDsgfVxuICAgICAgfVxuICAgICAgaWYgKGxvd2VyLnN0YXJ0c1dpdGgoJyYjJykpIHtcbiAgICAgICAgICB0cnkgeyByZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZShwYXJzZUludChsb3dlci5zbGljZSgyLCAtMSksIDEwKSk7IH0gY2F0Y2ggeyByZXR1cm4gbWF0Y2g7IH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBtYXRjaDtcbiAgfSk7XG59XG4iLCAiXG5leHBvcnQgY29uc3QgR0VORVJBX1JFR0lTVFJZOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAvLyBTZWFyY2hcbiAgJ2dvb2dsZS5jb20nOiAnU2VhcmNoJyxcbiAgJ2JpbmcuY29tJzogJ1NlYXJjaCcsXG4gICdkdWNrZHVja2dvLmNvbSc6ICdTZWFyY2gnLFxuICAneWFob28uY29tJzogJ1NlYXJjaCcsXG4gICdiYWlkdS5jb20nOiAnU2VhcmNoJyxcbiAgJ3lhbmRleC5jb20nOiAnU2VhcmNoJyxcbiAgJ2thZ2kuY29tJzogJ1NlYXJjaCcsXG4gICdlY29zaWEub3JnJzogJ1NlYXJjaCcsXG5cbiAgLy8gU29jaWFsXG4gICdmYWNlYm9vay5jb20nOiAnU29jaWFsJyxcbiAgJ3R3aXR0ZXIuY29tJzogJ1NvY2lhbCcsXG4gICd4LmNvbSc6ICdTb2NpYWwnLFxuICAnaW5zdGFncmFtLmNvbSc6ICdTb2NpYWwnLFxuICAnbGlua2VkaW4uY29tJzogJ1NvY2lhbCcsXG4gICdyZWRkaXQuY29tJzogJ1NvY2lhbCcsXG4gICd0aWt0b2suY29tJzogJ1NvY2lhbCcsXG4gICdwaW50ZXJlc3QuY29tJzogJ1NvY2lhbCcsXG4gICdzbmFwY2hhdC5jb20nOiAnU29jaWFsJyxcbiAgJ3R1bWJsci5jb20nOiAnU29jaWFsJyxcbiAgJ3RocmVhZHMubmV0JzogJ1NvY2lhbCcsXG4gICdibHVlc2t5LmFwcCc6ICdTb2NpYWwnLFxuICAnbWFzdG9kb24uc29jaWFsJzogJ1NvY2lhbCcsXG5cbiAgLy8gVmlkZW9cbiAgJ3lvdXR1YmUuY29tJzogJ1ZpZGVvJyxcbiAgJ3lvdXR1LmJlJzogJ1ZpZGVvJyxcbiAgJ3ZpbWVvLmNvbSc6ICdWaWRlbycsXG4gICd0d2l0Y2gudHYnOiAnVmlkZW8nLFxuICAnbmV0ZmxpeC5jb20nOiAnVmlkZW8nLFxuICAnaHVsdS5jb20nOiAnVmlkZW8nLFxuICAnZGlzbmV5cGx1cy5jb20nOiAnVmlkZW8nLFxuICAnZGFpbHltb3Rpb24uY29tJzogJ1ZpZGVvJyxcbiAgJ3ByaW1ldmlkZW8uY29tJzogJ1ZpZGVvJyxcbiAgJ2hib21heC5jb20nOiAnVmlkZW8nLFxuICAnbWF4LmNvbSc6ICdWaWRlbycsXG4gICdwZWFjb2NrdHYuY29tJzogJ1ZpZGVvJyxcblxuICAvLyBEZXZlbG9wbWVudFxuICAnZ2l0aHViLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdnaXRsYWIuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ3N0YWNrb3ZlcmZsb3cuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ25wbWpzLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdweXBpLm9yZyc6ICdEZXZlbG9wbWVudCcsXG4gICdkZXZlbG9wZXIubW96aWxsYS5vcmcnOiAnRGV2ZWxvcG1lbnQnLFxuICAndzNzY2hvb2xzLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdnZWVrc2ZvcmdlZWtzLm9yZyc6ICdEZXZlbG9wbWVudCcsXG4gICdqaXJhLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdhdGxhc3NpYW4ubmV0JzogJ0RldmVsb3BtZW50JywgLy8gb2Z0ZW4gamlyYVxuICAnYml0YnVja2V0Lm9yZyc6ICdEZXZlbG9wbWVudCcsXG4gICdkZXYudG8nOiAnRGV2ZWxvcG1lbnQnLFxuICAnaGFzaG5vZGUuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ21lZGl1bS5jb20nOiAnRGV2ZWxvcG1lbnQnLCAvLyBHZW5lcmFsIGJ1dCBvZnRlbiBkZXZcbiAgJ3ZlcmNlbC5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnbmV0bGlmeS5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnaGVyb2t1LmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdhd3MuYW1hem9uLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdjb25zb2xlLmF3cy5hbWF6b24uY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2Nsb3VkLmdvb2dsZS5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnYXp1cmUubWljcm9zb2Z0LmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdwb3J0YWwuYXp1cmUuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2RvY2tlci5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAna3ViZXJuZXRlcy5pbyc6ICdEZXZlbG9wbWVudCcsXG5cbiAgLy8gTmV3c1xuICAnY25uLmNvbSc6ICdOZXdzJyxcbiAgJ2JiYy5jb20nOiAnTmV3cycsXG4gICdueXRpbWVzLmNvbSc6ICdOZXdzJyxcbiAgJ3dhc2hpbmd0b25wb3N0LmNvbSc6ICdOZXdzJyxcbiAgJ3RoZWd1YXJkaWFuLmNvbSc6ICdOZXdzJyxcbiAgJ2ZvcmJlcy5jb20nOiAnTmV3cycsXG4gICdibG9vbWJlcmcuY29tJzogJ05ld3MnLFxuICAncmV1dGVycy5jb20nOiAnTmV3cycsXG4gICd3c2ouY29tJzogJ05ld3MnLFxuICAnY25iYy5jb20nOiAnTmV3cycsXG4gICdodWZmcG9zdC5jb20nOiAnTmV3cycsXG4gICduZXdzLmdvb2dsZS5jb20nOiAnTmV3cycsXG4gICdmb3huZXdzLmNvbSc6ICdOZXdzJyxcbiAgJ25iY25ld3MuY29tJzogJ05ld3MnLFxuICAnYWJjbmV3cy5nby5jb20nOiAnTmV3cycsXG4gICd1c2F0b2RheS5jb20nOiAnTmV3cycsXG5cbiAgLy8gU2hvcHBpbmdcbiAgJ2FtYXpvbi5jb20nOiAnU2hvcHBpbmcnLFxuICAnZWJheS5jb20nOiAnU2hvcHBpbmcnLFxuICAnd2FsbWFydC5jb20nOiAnU2hvcHBpbmcnLFxuICAnZXRzeS5jb20nOiAnU2hvcHBpbmcnLFxuICAndGFyZ2V0LmNvbSc6ICdTaG9wcGluZycsXG4gICdiZXN0YnV5LmNvbSc6ICdTaG9wcGluZycsXG4gICdhbGlleHByZXNzLmNvbSc6ICdTaG9wcGluZycsXG4gICdzaG9waWZ5LmNvbSc6ICdTaG9wcGluZycsXG4gICd0ZW11LmNvbSc6ICdTaG9wcGluZycsXG4gICdzaGVpbi5jb20nOiAnU2hvcHBpbmcnLFxuICAnd2F5ZmFpci5jb20nOiAnU2hvcHBpbmcnLFxuICAnY29zdGNvLmNvbSc6ICdTaG9wcGluZycsXG5cbiAgLy8gQ29tbXVuaWNhdGlvblxuICAnbWFpbC5nb29nbGUuY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnb3V0bG9vay5saXZlLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ3NsYWNrLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ2Rpc2NvcmQuY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnem9vbS51cyc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ3RlYW1zLm1pY3Jvc29mdC5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICd3aGF0c2FwcC5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICd0ZWxlZ3JhbS5vcmcnOiAnQ29tbXVuaWNhdGlvbicsXG4gICdtZXNzZW5nZXIuY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnc2t5cGUuY29tJzogJ0NvbW11bmljYXRpb24nLFxuXG4gIC8vIEZpbmFuY2VcbiAgJ3BheXBhbC5jb20nOiAnRmluYW5jZScsXG4gICdjaGFzZS5jb20nOiAnRmluYW5jZScsXG4gICdiYW5rb2ZhbWVyaWNhLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ3dlbGxzZmFyZ28uY29tJzogJ0ZpbmFuY2UnLFxuICAnYW1lcmljYW5leHByZXNzLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ3N0cmlwZS5jb20nOiAnRmluYW5jZScsXG4gICdjb2luYmFzZS5jb20nOiAnRmluYW5jZScsXG4gICdiaW5hbmNlLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2tyYWtlbi5jb20nOiAnRmluYW5jZScsXG4gICdyb2Jpbmhvb2QuY29tJzogJ0ZpbmFuY2UnLFxuICAnZmlkZWxpdHkuY29tJzogJ0ZpbmFuY2UnLFxuICAndmFuZ3VhcmQuY29tJzogJ0ZpbmFuY2UnLFxuICAnc2Nod2FiLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ21pbnQuaW50dWl0LmNvbSc6ICdGaW5hbmNlJyxcblxuICAvLyBFZHVjYXRpb25cbiAgJ3dpa2lwZWRpYS5vcmcnOiAnRWR1Y2F0aW9uJyxcbiAgJ2NvdXJzZXJhLm9yZyc6ICdFZHVjYXRpb24nLFxuICAndWRlbXkuY29tJzogJ0VkdWNhdGlvbicsXG4gICdlZHgub3JnJzogJ0VkdWNhdGlvbicsXG4gICdraGFuYWNhZGVteS5vcmcnOiAnRWR1Y2F0aW9uJyxcbiAgJ3F1aXpsZXQuY29tJzogJ0VkdWNhdGlvbicsXG4gICdkdW9saW5nby5jb20nOiAnRWR1Y2F0aW9uJyxcbiAgJ2NhbnZhcy5pbnN0cnVjdHVyZS5jb20nOiAnRWR1Y2F0aW9uJyxcbiAgJ2JsYWNrYm9hcmQuY29tJzogJ0VkdWNhdGlvbicsXG4gICdtaXQuZWR1JzogJ0VkdWNhdGlvbicsXG4gICdoYXJ2YXJkLmVkdSc6ICdFZHVjYXRpb24nLFxuICAnc3RhbmZvcmQuZWR1JzogJ0VkdWNhdGlvbicsXG4gICdhY2FkZW1pYS5lZHUnOiAnRWR1Y2F0aW9uJyxcbiAgJ3Jlc2VhcmNoZ2F0ZS5uZXQnOiAnRWR1Y2F0aW9uJyxcblxuICAvLyBEZXNpZ25cbiAgJ2ZpZ21hLmNvbSc6ICdEZXNpZ24nLFxuICAnY2FudmEuY29tJzogJ0Rlc2lnbicsXG4gICdiZWhhbmNlLm5ldCc6ICdEZXNpZ24nLFxuICAnZHJpYmJibGUuY29tJzogJ0Rlc2lnbicsXG4gICdhZG9iZS5jb20nOiAnRGVzaWduJyxcbiAgJ3Vuc3BsYXNoLmNvbSc6ICdEZXNpZ24nLFxuICAncGV4ZWxzLmNvbSc6ICdEZXNpZ24nLFxuICAncGl4YWJheS5jb20nOiAnRGVzaWduJyxcbiAgJ3NodXR0ZXJzdG9jay5jb20nOiAnRGVzaWduJyxcblxuICAvLyBQcm9kdWN0aXZpdHlcbiAgJ2RvY3MuZ29vZ2xlLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnc2hlZXRzLmdvb2dsZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ3NsaWRlcy5nb29nbGUuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdkcml2ZS5nb29nbGUuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdub3Rpb24uc28nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ3RyZWxsby5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2FzYW5hLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnbW9uZGF5LmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnYWlydGFibGUuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdldmVybm90ZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2Ryb3Bib3guY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdjbGlja3VwLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnbGluZWFyLmFwcCc6ICdQcm9kdWN0aXZpdHknLFxuICAnbWlyby5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2x1Y2lkY2hhcnQuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG5cbiAgLy8gQUlcbiAgJ29wZW5haS5jb20nOiAnQUknLFxuICAnY2hhdGdwdC5jb20nOiAnQUknLFxuICAnYW50aHJvcGljLmNvbSc6ICdBSScsXG4gICdtaWRqb3VybmV5LmNvbSc6ICdBSScsXG4gICdodWdnaW5nZmFjZS5jbyc6ICdBSScsXG4gICdiYXJkLmdvb2dsZS5jb20nOiAnQUknLFxuICAnZ2VtaW5pLmdvb2dsZS5jb20nOiAnQUknLFxuICAnY2xhdWRlLmFpJzogJ0FJJyxcbiAgJ3BlcnBsZXhpdHkuYWknOiAnQUknLFxuICAncG9lLmNvbSc6ICdBSScsXG5cbiAgLy8gTXVzaWMvQXVkaW9cbiAgJ3Nwb3RpZnkuY29tJzogJ011c2ljJyxcbiAgJ3NvdW5kY2xvdWQuY29tJzogJ011c2ljJyxcbiAgJ211c2ljLmFwcGxlLmNvbSc6ICdNdXNpYycsXG4gICdwYW5kb3JhLmNvbSc6ICdNdXNpYycsXG4gICd0aWRhbC5jb20nOiAnTXVzaWMnLFxuICAnYmFuZGNhbXAuY29tJzogJ011c2ljJyxcbiAgJ2F1ZGlibGUuY29tJzogJ011c2ljJyxcblxuICAvLyBHYW1pbmdcbiAgJ3N0ZWFtcG93ZXJlZC5jb20nOiAnR2FtaW5nJyxcbiAgJ3JvYmxveC5jb20nOiAnR2FtaW5nJyxcbiAgJ2VwaWNnYW1lcy5jb20nOiAnR2FtaW5nJyxcbiAgJ3hib3guY29tJzogJ0dhbWluZycsXG4gICdwbGF5c3RhdGlvbi5jb20nOiAnR2FtaW5nJyxcbiAgJ25pbnRlbmRvLmNvbSc6ICdHYW1pbmcnLFxuICAnaWduLmNvbSc6ICdHYW1pbmcnLFxuICAnZ2FtZXNwb3QuY29tJzogJ0dhbWluZycsXG4gICdrb3Rha3UuY29tJzogJ0dhbWluZycsXG4gICdwb2x5Z29uLmNvbSc6ICdHYW1pbmcnXG59O1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0R2VuZXJhKGhvc3RuYW1lOiBzdHJpbmcsIGN1c3RvbVJlZ2lzdHJ5PzogUmVjb3JkPHN0cmluZywgc3RyaW5nPik6IHN0cmluZyB8IG51bGwge1xuICBpZiAoIWhvc3RuYW1lKSByZXR1cm4gbnVsbDtcblxuICAvLyAwLiBDaGVjayBjdXN0b20gcmVnaXN0cnkgZmlyc3RcbiAgaWYgKGN1c3RvbVJlZ2lzdHJ5KSB7XG4gICAgICBjb25zdCBwYXJ0cyA9IGhvc3RuYW1lLnNwbGl0KCcuJyk7XG4gICAgICAvLyBDaGVjayBmdWxsIGhvc3RuYW1lIGFuZCBwcm9ncmVzc2l2ZWx5IHNob3J0ZXIgc3VmZml4ZXNcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGFydHMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICAgICAgY29uc3QgZG9tYWluID0gcGFydHMuc2xpY2UoaSkuam9pbignLicpO1xuICAgICAgICAgIGlmIChjdXN0b21SZWdpc3RyeVtkb21haW5dKSB7XG4gICAgICAgICAgICAgIHJldHVybiBjdXN0b21SZWdpc3RyeVtkb21haW5dO1xuICAgICAgICAgIH1cbiAgICAgIH1cbiAgfVxuXG4gIC8vIDEuIEV4YWN0IG1hdGNoXG4gIGlmIChHRU5FUkFfUkVHSVNUUllbaG9zdG5hbWVdKSB7XG4gICAgcmV0dXJuIEdFTkVSQV9SRUdJU1RSWVtob3N0bmFtZV07XG4gIH1cblxuICAvLyAyLiBTdWJkb21haW4gY2hlY2sgKHN0cmlwcGluZyBzdWJkb21haW5zKVxuICAvLyBlLmcuIFwiY29uc29sZS5hd3MuYW1hem9uLmNvbVwiIC0+IFwiYXdzLmFtYXpvbi5jb21cIiAtPiBcImFtYXpvbi5jb21cIlxuICBjb25zdCBwYXJ0cyA9IGhvc3RuYW1lLnNwbGl0KCcuJyk7XG5cbiAgLy8gVHJ5IG1hdGNoaW5nIHByb2dyZXNzaXZlbHkgc2hvcnRlciBzdWZmaXhlc1xuICAvLyBlLmcuIGEuYi5jLmNvbSAtPiBiLmMuY29tIC0+IGMuY29tXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcGFydHMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICBjb25zdCBkb21haW4gPSBwYXJ0cy5zbGljZShpKS5qb2luKCcuJyk7XG4gICAgICBpZiAoR0VORVJBX1JFR0lTVFJZW2RvbWFpbl0pIHtcbiAgICAgICAgICByZXR1cm4gR0VORVJBX1JFR0lTVFJZW2RvbWFpbl07XG4gICAgICB9XG4gIH1cblxuICByZXR1cm4gbnVsbDtcbn1cbiIsICJleHBvcnQgY29uc3QgZ2V0U3RvcmVkVmFsdWUgPSBhc3luYyA8VD4oa2V5OiBzdHJpbmcpOiBQcm9taXNlPFQgfCBudWxsPiA9PiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChrZXksIChpdGVtcykgPT4ge1xuICAgICAgcmVzb2x2ZSgoaXRlbXNba2V5XSBhcyBUKSA/PyBudWxsKTtcbiAgICB9KTtcbiAgfSk7XG59O1xuXG5leHBvcnQgY29uc3Qgc2V0U3RvcmVkVmFsdWUgPSBhc3luYyA8VD4oa2V5OiBzdHJpbmcsIHZhbHVlOiBUKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IFtrZXldOiB2YWx1ZSB9LCAoKSA9PiByZXNvbHZlKCkpO1xuICB9KTtcbn07XG4iLCAiaW1wb3J0IHsgQ3VzdG9tU3RyYXRlZ3ksIFByZWZlcmVuY2VzLCBTb3J0aW5nU3RyYXRlZ3kgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBnZXRTdG9yZWRWYWx1ZSwgc2V0U3RvcmVkVmFsdWUgfSBmcm9tIFwiLi9zdG9yYWdlLmpzXCI7XG5pbXBvcnQgeyBzZXRMb2dnZXJQcmVmZXJlbmNlcywgbG9nRGVidWcgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcblxuY29uc3QgUFJFRkVSRU5DRVNfS0VZID0gXCJwcmVmZXJlbmNlc1wiO1xuXG5leHBvcnQgY29uc3QgZGVmYXVsdFByZWZlcmVuY2VzOiBQcmVmZXJlbmNlcyA9IHtcbiAgc29ydGluZzogW1wicGlubmVkXCIsIFwicmVjZW5jeVwiXSxcbiAgZGVidWc6IGZhbHNlLFxuICBsb2dMZXZlbDogXCJpbmZvXCIsXG4gIHRoZW1lOiBcImRhcmtcIixcbiAgY3VzdG9tR2VuZXJhOiB7fVxufTtcblxuY29uc3Qgbm9ybWFsaXplU29ydGluZyA9IChzb3J0aW5nOiB1bmtub3duKTogU29ydGluZ1N0cmF0ZWd5W10gPT4ge1xuICBpZiAoQXJyYXkuaXNBcnJheShzb3J0aW5nKSkge1xuICAgIHJldHVybiBzb3J0aW5nLmZpbHRlcigodmFsdWUpOiB2YWx1ZSBpcyBTb3J0aW5nU3RyYXRlZ3kgPT4gdHlwZW9mIHZhbHVlID09PSBcInN0cmluZ1wiKTtcbiAgfVxuICBpZiAodHlwZW9mIHNvcnRpbmcgPT09IFwic3RyaW5nXCIpIHtcbiAgICByZXR1cm4gW3NvcnRpbmddO1xuICB9XG4gIHJldHVybiBbLi4uZGVmYXVsdFByZWZlcmVuY2VzLnNvcnRpbmddO1xufTtcblxuY29uc3Qgbm9ybWFsaXplU3RyYXRlZ2llcyA9IChzdHJhdGVnaWVzOiB1bmtub3duKTogQ3VzdG9tU3RyYXRlZ3lbXSA9PiB7XG4gICAgY29uc3QgYXJyID0gYXNBcnJheTxhbnk+KHN0cmF0ZWdpZXMpLmZpbHRlcihzID0+IHR5cGVvZiBzID09PSAnb2JqZWN0JyAmJiBzICE9PSBudWxsKTtcbiAgICByZXR1cm4gYXJyLm1hcChzID0+ICh7XG4gICAgICAgIC4uLnMsXG4gICAgICAgIGdyb3VwaW5nUnVsZXM6IGFzQXJyYXkocy5ncm91cGluZ1J1bGVzKSxcbiAgICAgICAgc29ydGluZ1J1bGVzOiBhc0FycmF5KHMuc29ydGluZ1J1bGVzKSxcbiAgICAgICAgZ3JvdXBTb3J0aW5nUnVsZXM6IHMuZ3JvdXBTb3J0aW5nUnVsZXMgPyBhc0FycmF5KHMuZ3JvdXBTb3J0aW5nUnVsZXMpIDogdW5kZWZpbmVkLFxuICAgICAgICBmaWx0ZXJzOiBzLmZpbHRlcnMgPyBhc0FycmF5KHMuZmlsdGVycykgOiB1bmRlZmluZWQsXG4gICAgICAgIGZpbHRlckdyb3Vwczogcy5maWx0ZXJHcm91cHMgPyBhc0FycmF5KHMuZmlsdGVyR3JvdXBzKS5tYXAoKGc6IGFueSkgPT4gYXNBcnJheShnKSkgOiB1bmRlZmluZWQsXG4gICAgICAgIHJ1bGVzOiBzLnJ1bGVzID8gYXNBcnJheShzLnJ1bGVzKSA6IHVuZGVmaW5lZFxuICAgIH0pKTtcbn07XG5cbmNvbnN0IG5vcm1hbGl6ZVByZWZlcmVuY2VzID0gKHByZWZzPzogUGFydGlhbDxQcmVmZXJlbmNlcz4gfCBudWxsKTogUHJlZmVyZW5jZXMgPT4ge1xuICBjb25zdCBtZXJnZWQgPSB7IC4uLmRlZmF1bHRQcmVmZXJlbmNlcywgLi4uKHByZWZzID8/IHt9KSB9O1xuICByZXR1cm4ge1xuICAgIC4uLm1lcmdlZCxcbiAgICBzb3J0aW5nOiBub3JtYWxpemVTb3J0aW5nKG1lcmdlZC5zb3J0aW5nKSxcbiAgICBjdXN0b21TdHJhdGVnaWVzOiBub3JtYWxpemVTdHJhdGVnaWVzKG1lcmdlZC5jdXN0b21TdHJhdGVnaWVzKVxuICB9O1xufTtcblxuZXhwb3J0IGNvbnN0IGxvYWRQcmVmZXJlbmNlcyA9IGFzeW5jICgpOiBQcm9taXNlPFByZWZlcmVuY2VzPiA9PiB7XG4gIGNvbnN0IHN0b3JlZCA9IGF3YWl0IGdldFN0b3JlZFZhbHVlPFByZWZlcmVuY2VzPihQUkVGRVJFTkNFU19LRVkpO1xuICBjb25zdCBtZXJnZWQgPSBub3JtYWxpemVQcmVmZXJlbmNlcyhzdG9yZWQgPz8gdW5kZWZpbmVkKTtcbiAgc2V0TG9nZ2VyUHJlZmVyZW5jZXMobWVyZ2VkKTtcbiAgcmV0dXJuIG1lcmdlZDtcbn07XG5cbmV4cG9ydCBjb25zdCBzYXZlUHJlZmVyZW5jZXMgPSBhc3luYyAocHJlZnM6IFBhcnRpYWw8UHJlZmVyZW5jZXM+KTogUHJvbWlzZTxQcmVmZXJlbmNlcz4gPT4ge1xuICBsb2dEZWJ1ZyhcIlVwZGF0aW5nIHByZWZlcmVuY2VzXCIsIHsga2V5czogT2JqZWN0LmtleXMocHJlZnMpIH0pO1xuICBjb25zdCBjdXJyZW50ID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gIGNvbnN0IG1lcmdlZCA9IG5vcm1hbGl6ZVByZWZlcmVuY2VzKHsgLi4uY3VycmVudCwgLi4ucHJlZnMgfSk7XG4gIGF3YWl0IHNldFN0b3JlZFZhbHVlKFBSRUZFUkVOQ0VTX0tFWSwgbWVyZ2VkKTtcbiAgc2V0TG9nZ2VyUHJlZmVyZW5jZXMobWVyZ2VkKTtcbiAgcmV0dXJuIG1lcmdlZDtcbn07XG4iLCAiaW1wb3J0IHsgUGFnZUNvbnRleHQsIFRhYk1ldGFkYXRhIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgbm9ybWFsaXplVXJsLCBwYXJzZVlvdVR1YmVVcmwsIGV4dHJhY3RZb3VUdWJlQ2hhbm5lbEZyb21IdG1sLCBleHRyYWN0WW91VHViZUdlbnJlRnJvbUh0bWwgfSBmcm9tIFwiLi9sb2dpYy5qc1wiO1xuaW1wb3J0IHsgZ2V0R2VuZXJhIH0gZnJvbSBcIi4vZ2VuZXJhUmVnaXN0cnkuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGxvYWRQcmVmZXJlbmNlcyB9IGZyb20gXCIuLi9wcmVmZXJlbmNlcy5qc1wiO1xuXG5pbnRlcmZhY2UgRXh0cmFjdGlvblJlc3BvbnNlIHtcbiAgZGF0YTogUGFnZUNvbnRleHQgfCBudWxsO1xuICBlcnJvcj86IHN0cmluZztcbiAgc3RhdHVzOlxuICAgIHwgJ09LJ1xuICAgIHwgJ1JFU1RSSUNURUQnXG4gICAgfCAnSU5KRUNUSU9OX0ZBSUxFRCdcbiAgICB8ICdOT19SRVNQT05TRSdcbiAgICB8ICdOT19IT1NUX1BFUk1JU1NJT04nXG4gICAgfCAnRlJBTUVfQUNDRVNTX0RFTklFRCc7XG59XG5cbi8vIFNpbXBsZSBjb25jdXJyZW5jeSBjb250cm9sXG5sZXQgYWN0aXZlRmV0Y2hlcyA9IDA7XG5jb25zdCBNQVhfQ09OQ1VSUkVOVF9GRVRDSEVTID0gNTsgLy8gQ29uc2VydmF0aXZlIGxpbWl0IHRvIGF2b2lkIHJhdGUgbGltaXRpbmdcbmNvbnN0IEZFVENIX1FVRVVFOiAoKCkgPT4gdm9pZClbXSA9IFtdO1xuXG5jb25zdCBmZXRjaFdpdGhUaW1lb3V0ID0gYXN5bmMgKHVybDogc3RyaW5nLCB0aW1lb3V0ID0gMjAwMCk6IFByb21pc2U8UmVzcG9uc2U+ID0+IHtcbiAgICBjb25zdCBjb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuICAgIGNvbnN0IGlkID0gc2V0VGltZW91dCgoKSA9PiBjb250cm9sbGVyLmFib3J0KCksIHRpbWVvdXQpO1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godXJsLCB7IHNpZ25hbDogY29udHJvbGxlci5zaWduYWwgfSk7XG4gICAgICAgIHJldHVybiByZXNwb25zZTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgICBjbGVhclRpbWVvdXQoaWQpO1xuICAgIH1cbn07XG5cbmNvbnN0IGVucXVldWVGZXRjaCA9IGFzeW5jIDxUPihmbjogKCkgPT4gUHJvbWlzZTxUPik6IFByb21pc2U8VD4gPT4ge1xuICAgIGlmIChhY3RpdmVGZXRjaGVzID49IE1BWF9DT05DVVJSRU5UX0ZFVENIRVMpIHtcbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBGRVRDSF9RVUVVRS5wdXNoKHJlc29sdmUpKTtcbiAgICB9XG4gICAgYWN0aXZlRmV0Y2hlcysrO1xuICAgIHRyeSB7XG4gICAgICAgIHJldHVybiBhd2FpdCBmbigpO1xuICAgIH0gZmluYWxseSB7XG4gICAgICAgIGFjdGl2ZUZldGNoZXMtLTtcbiAgICAgICAgaWYgKEZFVENIX1FVRVVFLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGNvbnN0IG5leHQgPSBGRVRDSF9RVUVVRS5zaGlmdCgpO1xuICAgICAgICAgICAgaWYgKG5leHQpIG5leHQoKTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbmV4cG9ydCBjb25zdCBleHRyYWN0UGFnZUNvbnRleHQgPSBhc3luYyAodGFiOiBUYWJNZXRhZGF0YSB8IGNocm9tZS50YWJzLlRhYik6IFByb21pc2U8RXh0cmFjdGlvblJlc3BvbnNlPiA9PiB7XG4gIHRyeSB7XG4gICAgaWYgKCF0YWIgfHwgIXRhYi51cmwpIHtcbiAgICAgICAgcmV0dXJuIHsgZGF0YTogbnVsbCwgZXJyb3I6IFwiVGFiIG5vdCBmb3VuZCBvciBubyBVUkxcIiwgc3RhdHVzOiAnTk9fUkVTUE9OU0UnIH07XG4gICAgfVxuXG4gICAgaWYgKFxuICAgICAgdGFiLnVybC5zdGFydHNXaXRoKCdjaHJvbWU6Ly8nKSB8fFxuICAgICAgdGFiLnVybC5zdGFydHNXaXRoKCdlZGdlOi8vJykgfHxcbiAgICAgIHRhYi51cmwuc3RhcnRzV2l0aCgnYWJvdXQ6JykgfHxcbiAgICAgIHRhYi51cmwuc3RhcnRzV2l0aCgnY2hyb21lLWV4dGVuc2lvbjovLycpIHx8XG4gICAgICB0YWIudXJsLnN0YXJ0c1dpdGgoJ2Nocm9tZS1lcnJvcjovLycpXG4gICAgKSB7XG4gICAgICAgIHJldHVybiB7IGRhdGE6IG51bGwsIGVycm9yOiBcIlJlc3RyaWN0ZWQgVVJMIHNjaGVtZVwiLCBzdGF0dXM6ICdSRVNUUklDVEVEJyB9O1xuICAgIH1cblxuICAgIGNvbnN0IHByZWZzID0gYXdhaXQgbG9hZFByZWZlcmVuY2VzKCk7XG4gICAgbGV0IGJhc2VsaW5lID0gYnVpbGRCYXNlbGluZUNvbnRleHQodGFiIGFzIGNocm9tZS50YWJzLlRhYiwgcHJlZnMuY3VzdG9tR2VuZXJhKTtcblxuICAgIC8vIEZldGNoIGFuZCBlbnJpY2ggZm9yIFlvdVR1YmUgaWYgYXV0aG9yIGlzIG1pc3NpbmcgYW5kIGl0IGlzIGEgdmlkZW9cbiAgICBjb25zdCB0YXJnZXRVcmwgPSB0YWIudXJsO1xuICAgIGNvbnN0IHVybE9iaiA9IG5ldyBVUkwodGFyZ2V0VXJsKTtcbiAgICBjb25zdCBob3N0bmFtZSA9IHVybE9iai5ob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgJycpO1xuICAgIGlmICgoaG9zdG5hbWUuZW5kc1dpdGgoJ3lvdXR1YmUuY29tJykgfHwgaG9zdG5hbWUuZW5kc1dpdGgoJ3lvdXR1LmJlJykpICYmICghYmFzZWxpbmUuYXV0aG9yT3JDcmVhdG9yIHx8IGJhc2VsaW5lLmdlbnJlID09PSAnVmlkZW8nKSkge1xuICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAvLyBXZSB1c2UgYSBxdWV1ZSB0byBwcmV2ZW50IGZsb29kaW5nIHJlcXVlc3RzXG4gICAgICAgICAgICAgYXdhaXQgZW5xdWV1ZUZldGNoKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaFdpdGhUaW1lb3V0KHRhcmdldFVybCk7XG4gICAgICAgICAgICAgICAgIGlmIChyZXNwb25zZS5vaykge1xuICAgICAgICAgICAgICAgICAgICAgY29uc3QgaHRtbCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNoYW5uZWwgPSBleHRyYWN0WW91VHViZUNoYW5uZWxGcm9tSHRtbChodG1sKTtcbiAgICAgICAgICAgICAgICAgICAgIGlmIChjaGFubmVsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgYmFzZWxpbmUuYXV0aG9yT3JDcmVhdG9yID0gY2hhbm5lbDtcbiAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGdlbnJlID0gZXh0cmFjdFlvdVR1YmVHZW5yZUZyb21IdG1sKGh0bWwpO1xuICAgICAgICAgICAgICAgICAgICAgaWYgKGdlbnJlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgYmFzZWxpbmUuZ2VucmUgPSBnZW5yZTtcbiAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgIH0pO1xuICAgICAgICAgfSBjYXRjaCAoZmV0Y2hFcnIpIHtcbiAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkZhaWxlZCB0byBmZXRjaCBZb3VUdWJlIHBhZ2UgY29udGVudFwiLCB7IGVycm9yOiBTdHJpbmcoZmV0Y2hFcnIpIH0pO1xuICAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBkYXRhOiBiYXNlbGluZSxcbiAgICAgIHN0YXR1czogJ09LJ1xuICAgIH07XG5cbiAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgbG9nRGVidWcoYEV4dHJhY3Rpb24gZmFpbGVkIGZvciB0YWIgJHt0YWIuaWR9YCwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgIHJldHVybiB7XG4gICAgICBkYXRhOiBudWxsLFxuICAgICAgZXJyb3I6IFN0cmluZyhlKSxcbiAgICAgIHN0YXR1czogJ0lOSkVDVElPTl9GQUlMRUQnXG4gICAgfTtcbiAgfVxufTtcblxuY29uc3QgYnVpbGRCYXNlbGluZUNvbnRleHQgPSAodGFiOiBjaHJvbWUudGFicy5UYWIsIGN1c3RvbUdlbmVyYT86IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pOiBQYWdlQ29udGV4dCA9PiB7XG4gIGNvbnN0IHVybCA9IHRhYi51cmwgfHwgXCJcIjtcbiAgbGV0IGhvc3RuYW1lID0gXCJcIjtcbiAgdHJ5IHtcbiAgICBob3N0bmFtZSA9IG5ldyBVUkwodXJsKS5ob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgJycpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgaG9zdG5hbWUgPSBcIlwiO1xuICB9XG5cbiAgLy8gRGV0ZXJtaW5lIE9iamVjdCBUeXBlIGZpcnN0XG4gIGxldCBvYmplY3RUeXBlOiBQYWdlQ29udGV4dFsnb2JqZWN0VHlwZSddID0gJ3Vua25vd24nO1xuICBsZXQgYXV0aG9yT3JDcmVhdG9yOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblxuICBpZiAodXJsLmluY2x1ZGVzKCcvbG9naW4nKSB8fCB1cmwuaW5jbHVkZXMoJy9zaWduaW4nKSkge1xuICAgICAgb2JqZWN0VHlwZSA9ICdsb2dpbic7XG4gIH0gZWxzZSBpZiAoaG9zdG5hbWUuaW5jbHVkZXMoJ3lvdXR1YmUuY29tJykgfHwgaG9zdG5hbWUuaW5jbHVkZXMoJ3lvdXR1LmJlJykpIHtcbiAgICAgIGNvbnN0IHsgdmlkZW9JZCB9ID0gcGFyc2VZb3VUdWJlVXJsKHVybCk7XG4gICAgICBpZiAodmlkZW9JZCkgb2JqZWN0VHlwZSA9ICd2aWRlbyc7XG5cbiAgICAgIC8vIFRyeSB0byBndWVzcyBjaGFubmVsIGZyb20gVVJMIGlmIHBvc3NpYmxlXG4gICAgICBpZiAodXJsLmluY2x1ZGVzKCcvQCcpKSB7XG4gICAgICAgICAgY29uc3QgcGFydHMgPSB1cmwuc3BsaXQoJy9AJyk7XG4gICAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgY29uc3QgaGFuZGxlID0gcGFydHNbMV0uc3BsaXQoJy8nKVswXTtcbiAgICAgICAgICAgICAgYXV0aG9yT3JDcmVhdG9yID0gJ0AnICsgaGFuZGxlO1xuICAgICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodXJsLmluY2x1ZGVzKCcvYy8nKSkge1xuICAgICAgICAgIGNvbnN0IHBhcnRzID0gdXJsLnNwbGl0KCcvYy8nKTtcbiAgICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICBhdXRob3JPckNyZWF0b3IgPSBkZWNvZGVVUklDb21wb25lbnQocGFydHNbMV0uc3BsaXQoJy8nKVswXSk7XG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICh1cmwuaW5jbHVkZXMoJy91c2VyLycpKSB7XG4gICAgICAgICAgY29uc3QgcGFydHMgPSB1cmwuc3BsaXQoJy91c2VyLycpO1xuICAgICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgIGF1dGhvck9yQ3JlYXRvciA9IGRlY29kZVVSSUNvbXBvbmVudChwYXJ0c1sxXS5zcGxpdCgnLycpWzBdKTtcbiAgICAgICAgICB9XG4gICAgICB9XG4gIH0gZWxzZSBpZiAoaG9zdG5hbWUgPT09ICdnaXRodWIuY29tJyAmJiB1cmwuaW5jbHVkZXMoJy9wdWxsLycpKSB7XG4gICAgICBvYmplY3RUeXBlID0gJ3RpY2tldCc7XG4gIH0gZWxzZSBpZiAoaG9zdG5hbWUgPT09ICdnaXRodWIuY29tJyAmJiAhdXJsLmluY2x1ZGVzKCcvcHVsbC8nKSAmJiB1cmwuc3BsaXQoJy8nKS5sZW5ndGggPj0gNSkge1xuICAgICAgLy8gcm91Z2ggY2hlY2sgZm9yIHJlcG9cbiAgICAgIG9iamVjdFR5cGUgPSAncmVwbyc7XG4gIH1cblxuICAvLyBEZXRlcm1pbmUgR2VucmVcbiAgLy8gUHJpb3JpdHkgMTogU2l0ZS1zcGVjaWZpYyBleHRyYWN0aW9uIChkZXJpdmVkIGZyb20gb2JqZWN0VHlwZSlcbiAgbGV0IGdlbnJlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbiAgaWYgKG9iamVjdFR5cGUgPT09ICd2aWRlbycpIGdlbnJlID0gJ1ZpZGVvJztcbiAgZWxzZSBpZiAob2JqZWN0VHlwZSA9PT0gJ3JlcG8nIHx8IG9iamVjdFR5cGUgPT09ICd0aWNrZXQnKSBnZW5yZSA9ICdEZXZlbG9wbWVudCc7XG5cbiAgLy8gUHJpb3JpdHkgMjogRmFsbGJhY2sgdG8gUmVnaXN0cnlcbiAgaWYgKCFnZW5yZSkge1xuICAgICBnZW5yZSA9IGdldEdlbmVyYShob3N0bmFtZSwgY3VzdG9tR2VuZXJhKSB8fCB1bmRlZmluZWQ7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNhbm9uaWNhbFVybDogdXJsIHx8IG51bGwsXG4gICAgbm9ybWFsaXplZFVybDogbm9ybWFsaXplVXJsKHVybCksXG4gICAgc2l0ZU5hbWU6IGhvc3RuYW1lIHx8IG51bGwsXG4gICAgcGxhdGZvcm06IGhvc3RuYW1lIHx8IG51bGwsXG4gICAgb2JqZWN0VHlwZSxcbiAgICBvYmplY3RJZDogdXJsIHx8IG51bGwsXG4gICAgdGl0bGU6IHRhYi50aXRsZSB8fCBudWxsLFxuICAgIGdlbnJlLFxuICAgIGRlc2NyaXB0aW9uOiBudWxsLFxuICAgIGF1dGhvck9yQ3JlYXRvcjogYXV0aG9yT3JDcmVhdG9yLFxuICAgIHB1Ymxpc2hlZEF0OiBudWxsLFxuICAgIG1vZGlmaWVkQXQ6IG51bGwsXG4gICAgbGFuZ3VhZ2U6IG51bGwsXG4gICAgdGFnczogW10sXG4gICAgYnJlYWRjcnVtYnM6IFtdLFxuICAgIGlzQXVkaWJsZTogZmFsc2UsXG4gICAgaXNNdXRlZDogZmFsc2UsXG4gICAgaXNDYXB0dXJpbmc6IGZhbHNlLFxuICAgIHByb2dyZXNzOiBudWxsLFxuICAgIGhhc1Vuc2F2ZWRDaGFuZ2VzTGlrZWx5OiBmYWxzZSxcbiAgICBpc0F1dGhlbnRpY2F0ZWRMaWtlbHk6IGZhbHNlLFxuICAgIHNvdXJjZXM6IHtcbiAgICAgIGNhbm9uaWNhbFVybDogJ3VybCcsXG4gICAgICBub3JtYWxpemVkVXJsOiAndXJsJyxcbiAgICAgIHNpdGVOYW1lOiAndXJsJyxcbiAgICAgIHBsYXRmb3JtOiAndXJsJyxcbiAgICAgIG9iamVjdFR5cGU6ICd1cmwnLFxuICAgICAgdGl0bGU6IHRhYi50aXRsZSA/ICd0YWInIDogJ3VybCcsXG4gICAgICBnZW5yZTogJ3JlZ2lzdHJ5J1xuICAgIH0sXG4gICAgY29uZmlkZW5jZToge31cbiAgfTtcbn07XG4iLCAiZXhwb3J0IHR5cGUgQ2F0ZWdvcnlSdWxlID0gc3RyaW5nIHwgc3RyaW5nW107XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2F0ZWdvcnlEZWZpbml0aW9uIHtcbiAgY2F0ZWdvcnk6IHN0cmluZztcbiAgcnVsZXM6IENhdGVnb3J5UnVsZVtdO1xufVxuXG5leHBvcnQgY29uc3QgQ0FURUdPUllfREVGSU5JVElPTlM6IENhdGVnb3J5RGVmaW5pdGlvbltdID0gW1xuICB7XG4gICAgY2F0ZWdvcnk6IFwiRGV2ZWxvcG1lbnRcIixcbiAgICBydWxlczogW1wiZ2l0aHViXCIsIFwic3RhY2tvdmVyZmxvd1wiLCBcImxvY2FsaG9zdFwiLCBcImppcmFcIiwgXCJnaXRsYWJcIl1cbiAgfSxcbiAge1xuICAgIGNhdGVnb3J5OiBcIldvcmtcIixcbiAgICBydWxlczogW1xuICAgICAgW1wiZ29vZ2xlXCIsIFwiZG9jc1wiXSwgW1wiZ29vZ2xlXCIsIFwic2hlZXRzXCJdLCBbXCJnb29nbGVcIiwgXCJzbGlkZXNcIl0sXG4gICAgICBcImxpbmtlZGluXCIsIFwic2xhY2tcIiwgXCJ6b29tXCIsIFwidGVhbXNcIlxuICAgIF1cbiAgfSxcbiAge1xuICAgIGNhdGVnb3J5OiBcIkVudGVydGFpbm1lbnRcIixcbiAgICBydWxlczogW1wibmV0ZmxpeFwiLCBcInNwb3RpZnlcIiwgXCJodWx1XCIsIFwiZGlzbmV5XCIsIFwieW91dHViZVwiXVxuICB9LFxuICB7XG4gICAgY2F0ZWdvcnk6IFwiU29jaWFsXCIsXG4gICAgcnVsZXM6IFtcInR3aXR0ZXJcIiwgXCJmYWNlYm9va1wiLCBcImluc3RhZ3JhbVwiLCBcInJlZGRpdFwiLCBcInRpa3Rva1wiLCBcInBpbnRlcmVzdFwiXVxuICB9LFxuICB7XG4gICAgY2F0ZWdvcnk6IFwiU2hvcHBpbmdcIixcbiAgICBydWxlczogW1wiYW1hem9uXCIsIFwiZWJheVwiLCBcIndhbG1hcnRcIiwgXCJ0YXJnZXRcIiwgXCJzaG9waWZ5XCJdXG4gIH0sXG4gIHtcbiAgICBjYXRlZ29yeTogXCJOZXdzXCIsXG4gICAgcnVsZXM6IFtcImNublwiLCBcImJiY1wiLCBcIm55dGltZXNcIiwgXCJ3YXNoaW5ndG9ucG9zdFwiLCBcImZveG5ld3NcIl1cbiAgfSxcbiAge1xuICAgIGNhdGVnb3J5OiBcIkVkdWNhdGlvblwiLFxuICAgIHJ1bGVzOiBbXCJjb3Vyc2VyYVwiLCBcInVkZW15XCIsIFwiZWR4XCIsIFwia2hhbmFjYWRlbXlcIiwgXCJjYW52YXNcIl1cbiAgfSxcbiAge1xuICAgIGNhdGVnb3J5OiBcIlRyYXZlbFwiLFxuICAgIHJ1bGVzOiBbXCJleHBlZGlhXCIsIFwiYm9va2luZ1wiLCBcImFpcmJuYlwiLCBcInRyaXBhZHZpc29yXCIsIFwia2F5YWtcIl1cbiAgfSxcbiAge1xuICAgIGNhdGVnb3J5OiBcIkhlYWx0aFwiLFxuICAgIHJ1bGVzOiBbXCJ3ZWJtZFwiLCBcIm1heW9jbGluaWNcIiwgXCJuaWguZ292XCIsIFwiaGVhbHRoXCJdXG4gIH0sXG4gIHtcbiAgICBjYXRlZ29yeTogXCJTcG9ydHNcIixcbiAgICBydWxlczogW1wiZXNwblwiLCBcIm5iYVwiLCBcIm5mbFwiLCBcIm1sYlwiLCBcImZpZmFcIl1cbiAgfSxcbiAge1xuICAgIGNhdGVnb3J5OiBcIlRlY2hub2xvZ3lcIixcbiAgICBydWxlczogW1widGVjaGNydW5jaFwiLCBcIndpcmVkXCIsIFwidGhldmVyZ2VcIiwgXCJhcnN0ZWNobmljYVwiXVxuICB9LFxuICB7XG4gICAgY2F0ZWdvcnk6IFwiU2NpZW5jZVwiLFxuICAgIHJ1bGVzOiBbXCJzY2llbmNlXCIsIFwibmF0dXJlLmNvbVwiLCBcIm5hc2EuZ292XCJdXG4gIH0sXG4gIHtcbiAgICBjYXRlZ29yeTogXCJHYW1pbmdcIixcbiAgICBydWxlczogW1widHdpdGNoXCIsIFwic3RlYW1cIiwgXCJyb2Jsb3hcIiwgXCJpZ25cIiwgXCJnYW1lc3BvdFwiXVxuICB9LFxuICB7XG4gICAgY2F0ZWdvcnk6IFwiTXVzaWNcIixcbiAgICBydWxlczogW1wic291bmRjbG91ZFwiLCBcImJhbmRjYW1wXCIsIFwibGFzdC5mbVwiXVxuICB9LFxuICB7XG4gICAgY2F0ZWdvcnk6IFwiQXJ0XCIsXG4gICAgcnVsZXM6IFtcImRldmlhbnRhcnRcIiwgXCJiZWhhbmNlXCIsIFwiZHJpYmJibGVcIiwgXCJhcnRzdGF0aW9uXCJdXG4gIH1cbl07XG5cbmV4cG9ydCBjb25zdCBnZXRDYXRlZ29yeUZyb21VcmwgPSAodXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBsb3dlclVybCA9IHVybC50b0xvd2VyQ2FzZSgpO1xuICBmb3IgKGNvbnN0IGRlZiBvZiBDQVRFR09SWV9ERUZJTklUSU9OUykge1xuICAgIGZvciAoY29uc3QgcnVsZSBvZiBkZWYucnVsZXMpIHtcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KHJ1bGUpKSB7XG4gICAgICAgIGlmIChydWxlLmV2ZXJ5KHBhcnQgPT4gbG93ZXJVcmwuaW5jbHVkZXMocGFydCkpKSB7XG4gICAgICAgICAgcmV0dXJuIGRlZi5jYXRlZ29yeTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGxvd2VyVXJsLmluY2x1ZGVzKHJ1bGUpKSB7XG4gICAgICAgICAgcmV0dXJuIGRlZi5jYXRlZ29yeTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gXCJVbmNhdGVnb3JpemVkXCI7XG59O1xuIiwgImltcG9ydCB7IFRhYk1ldGFkYXRhLCBQYWdlQ29udGV4dCB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnLCBsb2dFcnJvciB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBleHRyYWN0UGFnZUNvbnRleHQgfSBmcm9tIFwiLi9leHRyYWN0aW9uL2luZGV4LmpzXCI7XG5pbXBvcnQgeyBnZXRDYXRlZ29yeUZyb21VcmwgfSBmcm9tIFwiLi9jYXRlZ29yeVJ1bGVzLmpzXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29udGV4dFJlc3VsdCB7XG4gIGNvbnRleHQ6IHN0cmluZztcbiAgc291cmNlOiAnQUknIHwgJ0hldXJpc3RpYycgfCAnRXh0cmFjdGlvbic7XG4gIGRhdGE/OiBQYWdlQ29udGV4dDtcbiAgZXJyb3I/OiBzdHJpbmc7XG4gIHN0YXR1cz86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIENhY2hlRW50cnkge1xuICByZXN1bHQ6IENvbnRleHRSZXN1bHQ7XG4gIHRpbWVzdGFtcDogbnVtYmVyO1xuICAvLyBXZSB1c2UgdGhpcyB0byBkZWNpZGUgd2hlbiB0byBpbnZhbGlkYXRlIGNhY2hlXG59XG5cbmNvbnN0IGNvbnRleHRDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBDYWNoZUVudHJ5PigpO1xuY29uc3QgQ0FDSEVfVFRMX1NVQ0NFU1MgPSAyNCAqIDYwICogNjAgKiAxMDAwOyAvLyAyNCBob3Vyc1xuY29uc3QgQ0FDSEVfVFRMX0VSUk9SID0gNSAqIDYwICogMTAwMDsgLy8gNSBtaW51dGVzXG5cbmV4cG9ydCBjb25zdCBhbmFseXplVGFiQ29udGV4dCA9IGFzeW5jIChcbiAgdGFiczogVGFiTWV0YWRhdGFbXSxcbiAgb25Qcm9ncmVzcz86IChjb21wbGV0ZWQ6IG51bWJlciwgdG90YWw6IG51bWJlcikgPT4gdm9pZFxuKTogUHJvbWlzZTxNYXA8bnVtYmVyLCBDb250ZXh0UmVzdWx0Pj4gPT4ge1xuICBjb25zdCBjb250ZXh0TWFwID0gbmV3IE1hcDxudW1iZXIsIENvbnRleHRSZXN1bHQ+KCk7XG4gIGxldCBjb21wbGV0ZWQgPSAwO1xuICBjb25zdCB0b3RhbCA9IHRhYnMubGVuZ3RoO1xuXG4gIGNvbnN0IHByb21pc2VzID0gdGFicy5tYXAoYXN5bmMgKHRhYikgPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBjYWNoZUtleSA9IGAke3RhYi5pZH06OiR7dGFiLnVybH1gO1xuICAgICAgY29uc3QgY2FjaGVkID0gY29udGV4dENhY2hlLmdldChjYWNoZUtleSk7XG5cbiAgICAgIGlmIChjYWNoZWQpIHtcbiAgICAgICAgY29uc3QgaXNFcnJvciA9IGNhY2hlZC5yZXN1bHQuc3RhdHVzID09PSAnRVJST1InIHx8ICEhY2FjaGVkLnJlc3VsdC5lcnJvcjtcbiAgICAgICAgY29uc3QgdHRsID0gaXNFcnJvciA/IENBQ0hFX1RUTF9FUlJPUiA6IENBQ0hFX1RUTF9TVUNDRVNTO1xuXG4gICAgICAgIGlmIChEYXRlLm5vdygpIC0gY2FjaGVkLnRpbWVzdGFtcCA8IHR0bCkge1xuICAgICAgICAgIGNvbnRleHRNYXAuc2V0KHRhYi5pZCwgY2FjaGVkLnJlc3VsdCk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnRleHRDYWNoZS5kZWxldGUoY2FjaGVLZXkpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZldGNoQ29udGV4dEZvclRhYih0YWIpO1xuXG4gICAgICAvLyBDYWNoZSB3aXRoIGV4cGlyYXRpb24gbG9naWNcbiAgICAgIGNvbnRleHRDYWNoZS5zZXQoY2FjaGVLZXksIHtcbiAgICAgICAgcmVzdWx0LFxuICAgICAgICB0aW1lc3RhbXA6IERhdGUubm93KClcbiAgICAgIH0pO1xuXG4gICAgICBjb250ZXh0TWFwLnNldCh0YWIuaWQsIHJlc3VsdCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ0Vycm9yKGBGYWlsZWQgdG8gYW5hbHl6ZSBjb250ZXh0IGZvciB0YWIgJHt0YWIuaWR9YCwgeyBlcnJvcjogU3RyaW5nKGVycm9yKSB9KTtcbiAgICAgIC8vIEV2ZW4gaWYgZmV0Y2hDb250ZXh0Rm9yVGFiIGZhaWxzIGNvbXBsZXRlbHksIHdlIHRyeSBhIHNhZmUgc3luYyBmYWxsYmFja1xuICAgICAgY29udGV4dE1hcC5zZXQodGFiLmlkLCB7IGNvbnRleHQ6IFwiVW5jYXRlZ29yaXplZFwiLCBzb3VyY2U6ICdIZXVyaXN0aWMnLCBlcnJvcjogU3RyaW5nKGVycm9yKSwgc3RhdHVzOiAnRVJST1InIH0pO1xuICAgIH0gZmluYWxseSB7XG4gICAgICBjb21wbGV0ZWQrKztcbiAgICAgIGlmIChvblByb2dyZXNzKSBvblByb2dyZXNzKGNvbXBsZXRlZCwgdG90YWwpO1xuICAgIH1cbiAgfSk7XG5cbiAgYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICByZXR1cm4gY29udGV4dE1hcDtcbn07XG5cbmNvbnN0IGZldGNoQ29udGV4dEZvclRhYiA9IGFzeW5jICh0YWI6IFRhYk1ldGFkYXRhKTogUHJvbWlzZTxDb250ZXh0UmVzdWx0PiA9PiB7XG4gIC8vIDEuIFJ1biBHZW5lcmljIEV4dHJhY3Rpb24gKEFsd2F5cylcbiAgbGV0IGRhdGE6IFBhZ2VDb250ZXh0IHwgbnVsbCA9IG51bGw7XG4gIGxldCBlcnJvcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICBsZXQgc3RhdHVzOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbiAgdHJ5IHtcbiAgICAgIGNvbnN0IGV4dHJhY3Rpb24gPSBhd2FpdCBleHRyYWN0UGFnZUNvbnRleHQodGFiKTtcbiAgICAgIGRhdGEgPSBleHRyYWN0aW9uLmRhdGE7XG4gICAgICBlcnJvciA9IGV4dHJhY3Rpb24uZXJyb3I7XG4gICAgICBzdGF0dXMgPSBleHRyYWN0aW9uLnN0YXR1cztcbiAgfSBjYXRjaCAoZSkge1xuICAgICAgbG9nRGVidWcoYEV4dHJhY3Rpb24gZmFpbGVkIGZvciB0YWIgJHt0YWIuaWR9YCwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgZXJyb3IgPSBTdHJpbmcoZSk7XG4gICAgICBzdGF0dXMgPSAnRVJST1InO1xuICB9XG5cbiAgbGV0IGNvbnRleHQgPSBcIlVuY2F0ZWdvcml6ZWRcIjtcbiAgbGV0IHNvdXJjZTogQ29udGV4dFJlc3VsdFsnc291cmNlJ10gPSAnSGV1cmlzdGljJztcblxuICAvLyAyLiBUcnkgdG8gRGV0ZXJtaW5lIENhdGVnb3J5IGZyb20gRXh0cmFjdGlvbiBEYXRhXG4gIGlmIChkYXRhKSB7XG4gICAgICBpZiAoZGF0YS5wbGF0Zm9ybSA9PT0gJ1lvdVR1YmUnIHx8IGRhdGEucGxhdGZvcm0gPT09ICdOZXRmbGl4JyB8fCBkYXRhLnBsYXRmb3JtID09PSAnU3BvdGlmeScgfHwgZGF0YS5wbGF0Zm9ybSA9PT0gJ1R3aXRjaCcpIHtcbiAgICAgICAgICBjb250ZXh0ID0gXCJFbnRlcnRhaW5tZW50XCI7XG4gICAgICAgICAgc291cmNlID0gJ0V4dHJhY3Rpb24nO1xuICAgICAgfSBlbHNlIGlmIChkYXRhLnBsYXRmb3JtID09PSAnR2l0SHViJyB8fCBkYXRhLnBsYXRmb3JtID09PSAnU3RhY2sgT3ZlcmZsb3cnIHx8IGRhdGEucGxhdGZvcm0gPT09ICdKaXJhJyB8fCBkYXRhLnBsYXRmb3JtID09PSAnR2l0TGFiJykge1xuICAgICAgICAgIGNvbnRleHQgPSBcIkRldmVsb3BtZW50XCI7XG4gICAgICAgICAgc291cmNlID0gJ0V4dHJhY3Rpb24nO1xuICAgICAgfSBlbHNlIGlmIChkYXRhLnBsYXRmb3JtID09PSAnR29vZ2xlJyAmJiAoZGF0YS5ub3JtYWxpemVkVXJsLmluY2x1ZGVzKCdkb2NzJykgfHwgZGF0YS5ub3JtYWxpemVkVXJsLmluY2x1ZGVzKCdzaGVldHMnKSB8fCBkYXRhLm5vcm1hbGl6ZWRVcmwuaW5jbHVkZXMoJ3NsaWRlcycpKSkge1xuICAgICAgICAgIGNvbnRleHQgPSBcIldvcmtcIjtcbiAgICAgICAgICBzb3VyY2UgPSAnRXh0cmFjdGlvbic7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBJZiB3ZSBoYXZlIHN1Y2Nlc3NmdWwgZXh0cmFjdGlvbiBkYXRhIGJ1dCBubyBzcGVjaWZpYyBydWxlIG1hdGNoZWQsXG4gICAgICAgIC8vIHVzZSB0aGUgT2JqZWN0IFR5cGUgb3IgZ2VuZXJpYyBcIkdlbmVyYWwgV2ViXCIgdG8gaW5kaWNhdGUgZXh0cmFjdGlvbiB3b3JrZWQuXG4gICAgICAgIC8vIFdlIHByZWZlciBzcGVjaWZpYyBjYXRlZ29yaWVzLCBidXQgXCJBcnRpY2xlXCIgb3IgXCJWaWRlb1wiIGFyZSBiZXR0ZXIgdGhhbiBcIlVuY2F0ZWdvcml6ZWRcIi5cbiAgICAgICAgaWYgKGRhdGEub2JqZWN0VHlwZSAmJiBkYXRhLm9iamVjdFR5cGUgIT09ICd1bmtub3duJykge1xuICAgICAgICAgICAgIC8vIE1hcCBvYmplY3QgdHlwZXMgdG8gY2F0ZWdvcmllcyBpZiBwb3NzaWJsZVxuICAgICAgICAgICAgIGlmIChkYXRhLm9iamVjdFR5cGUgPT09ICd2aWRlbycpIGNvbnRleHQgPSAnRW50ZXJ0YWlubWVudCc7XG4gICAgICAgICAgICAgZWxzZSBpZiAoZGF0YS5vYmplY3RUeXBlID09PSAnYXJ0aWNsZScpIGNvbnRleHQgPSAnTmV3cyc7IC8vIExvb3NlIG1hcHBpbmcsIGJ1dCBiZXR0ZXIgdGhhbiBub3RoaW5nXG4gICAgICAgICAgICAgZWxzZSBjb250ZXh0ID0gZGF0YS5vYmplY3RUeXBlLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgZGF0YS5vYmplY3RUeXBlLnNsaWNlKDEpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgIGNvbnRleHQgPSBcIkdlbmVyYWwgV2ViXCI7XG4gICAgICAgIH1cbiAgICAgICAgc291cmNlID0gJ0V4dHJhY3Rpb24nO1xuICAgICAgfVxuICB9XG5cbiAgLy8gMy4gRmFsbGJhY2sgdG8gTG9jYWwgSGV1cmlzdGljIChVUkwgUmVnZXgpXG4gIGlmIChjb250ZXh0ID09PSBcIlVuY2F0ZWdvcml6ZWRcIikge1xuICAgICAgY29uc3QgaCA9IGF3YWl0IGxvY2FsSGV1cmlzdGljKHRhYik7XG4gICAgICBpZiAoaC5jb250ZXh0ICE9PSBcIlVuY2F0ZWdvcml6ZWRcIikge1xuICAgICAgICAgIGNvbnRleHQgPSBoLmNvbnRleHQ7XG4gICAgICAgICAgLy8gc291cmNlIHJlbWFpbnMgJ0hldXJpc3RpYycgKG9yIG1heWJlIHdlIHNob3VsZCBzYXkgJ0hldXJpc3RpYycgaXMgdGhlIHNvdXJjZT8pXG4gICAgICAgICAgLy8gVGhlIGxvY2FsSGV1cmlzdGljIGZ1bmN0aW9uIHJldHVybnMgeyBzb3VyY2U6ICdIZXVyaXN0aWMnIH1cbiAgICAgIH1cbiAgfVxuXG4gIC8vIDQuIEZhbGxiYWNrIHRvIEFJIChMTE0pIC0gUkVNT1ZFRFxuICAvLyBUaGUgSHVnZ2luZ0ZhY2UgQVBJIGVuZHBvaW50IGlzIDQxMCBHb25lIGFuZC9vciByZXF1aXJlcyBhdXRoZW50aWNhdGlvbiB3aGljaCB3ZSBkbyBub3QgaGF2ZS5cbiAgLy8gVGhlIGNvZGUgaGFzIGJlZW4gcmVtb3ZlZCB0byBwcmV2ZW50IGVycm9ycy5cblxuICBpZiAoY29udGV4dCAhPT0gXCJVbmNhdGVnb3JpemVkXCIgJiYgc291cmNlICE9PSBcIkV4dHJhY3Rpb25cIikge1xuICAgIGVycm9yID0gdW5kZWZpbmVkO1xuICAgIHN0YXR1cyA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gIHJldHVybiB7IGNvbnRleHQsIHNvdXJjZSwgZGF0YTogZGF0YSB8fCB1bmRlZmluZWQsIGVycm9yLCBzdGF0dXMgfTtcbn07XG5cbmNvbnN0IGxvY2FsSGV1cmlzdGljID0gYXN5bmMgKHRhYjogVGFiTWV0YWRhdGEpOiBQcm9taXNlPENvbnRleHRSZXN1bHQ+ID0+IHtcbiAgY29uc3QgY29udGV4dCA9IGdldENhdGVnb3J5RnJvbVVybCh0YWIudXJsKTtcbiAgcmV0dXJuIHsgY29udGV4dCwgc291cmNlOiAnSGV1cmlzdGljJyB9O1xufTtcbiIsICJpbXBvcnQgeyBhcHBTdGF0ZSwgQ29sdW1uRGVmaW5pdGlvbiB9IGZyb20gXCIuL3N0YXRlLmpzXCI7XG5pbXBvcnQgeyBnZXRTb3J0VmFsdWUsIGdldENlbGxWYWx1ZSwgZ2V0TWFwcGVkVGFicywgc3RyaXBIdG1sIH0gZnJvbSBcIi4vZGF0YS5qc1wiO1xuaW1wb3J0IHsgYW5hbHl6ZVRhYkNvbnRleHQgfSBmcm9tIFwiLi4vLi4vYmFja2dyb3VuZC9jb250ZXh0QW5hbHlzaXMuanNcIjtcbmltcG9ydCB7IGxvZ0luZm8gfSBmcm9tIFwiLi4vLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgZXNjYXBlSHRtbCB9IGZyb20gXCIuLi8uLi9zaGFyZWQvdXRpbHMuanNcIjtcbmltcG9ydCB7IFRhYk1ldGFkYXRhIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC90eXBlcy5qc1wiO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbG9hZFRhYnMoKSB7XG4gIGxvZ0luZm8oXCJMb2FkaW5nIHRhYnMgZm9yIERldlRvb2xzXCIpO1xuICBjb25zdCB0YWJzID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoe30pO1xuICBhcHBTdGF0ZS5jdXJyZW50VGFicyA9IHRhYnM7XG5cbiAgY29uc3QgdG90YWxUYWJzRWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndG90YWxUYWJzJyk7XG4gIGlmICh0b3RhbFRhYnNFbCkge1xuICAgIHRvdGFsVGFic0VsLnRleHRDb250ZW50ID0gdGFicy5sZW5ndGgudG9TdHJpbmcoKTtcbiAgfVxuXG4gIC8vIENyZWF0ZSBhIG1hcCBvZiB0YWIgSUQgdG8gdGl0bGUgZm9yIHBhcmVudCBsb29rdXBcbiAgYXBwU3RhdGUudGFiVGl0bGVzLmNsZWFyKCk7XG4gIHRhYnMuZm9yRWFjaCh0YWIgPT4ge1xuICAgIGlmICh0YWIuaWQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgYXBwU3RhdGUudGFiVGl0bGVzLnNldCh0YWIuaWQsIHRhYi50aXRsZSB8fCAnVW50aXRsZWQnKTtcbiAgICB9XG4gIH0pO1xuXG4gIC8vIENvbnZlcnQgdG8gVGFiTWV0YWRhdGEgZm9yIGNvbnRleHQgYW5hbHlzaXNcbiAgY29uc3QgbWFwcGVkVGFiczogVGFiTWV0YWRhdGFbXSA9IGdldE1hcHBlZFRhYnMoKTtcblxuICAvLyBBbmFseXplIGNvbnRleHRcbiAgdHJ5IHtcbiAgICAgIGFwcFN0YXRlLmN1cnJlbnRDb250ZXh0TWFwID0gYXdhaXQgYW5hbHl6ZVRhYkNvbnRleHQobWFwcGVkVGFicyk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGFuYWx5emUgY29udGV4dFwiLCBlcnJvcik7XG4gICAgICBhcHBTdGF0ZS5jdXJyZW50Q29udGV4dE1hcC5jbGVhcigpO1xuICB9XG5cbiAgcmVuZGVyVGFibGUoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlclRhYmxlKCkge1xuICBjb25zdCB0Ym9keSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyN0YWJzVGFibGUgdGJvZHknKTtcbiAgaWYgKCF0Ym9keSkgcmV0dXJuO1xuXG4gIC8vIDEuIEZpbHRlclxuICBsZXQgdGFic0Rpc3BsYXkgPSBhcHBTdGF0ZS5jdXJyZW50VGFicy5maWx0ZXIodGFiID0+IHtcbiAgICAgIC8vIEdsb2JhbCBTZWFyY2hcbiAgICAgIGlmIChhcHBTdGF0ZS5nbG9iYWxTZWFyY2hRdWVyeSkge1xuICAgICAgICAgIGNvbnN0IHEgPSBhcHBTdGF0ZS5nbG9iYWxTZWFyY2hRdWVyeS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgIGNvbnN0IHNlYXJjaGFibGVUZXh0ID0gYCR7dGFiLnRpdGxlfSAke3RhYi51cmx9ICR7dGFiLmlkfWAudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICBpZiAoIXNlYXJjaGFibGVUZXh0LmluY2x1ZGVzKHEpKSByZXR1cm4gZmFsc2U7XG4gICAgICB9XG5cbiAgICAgIC8vIENvbHVtbiBGaWx0ZXJzXG4gICAgICBmb3IgKGNvbnN0IFtrZXksIGZpbHRlcl0gb2YgT2JqZWN0LmVudHJpZXMoYXBwU3RhdGUuY29sdW1uRmlsdGVycykpIHtcbiAgICAgICAgICBpZiAoIWZpbHRlcikgY29udGludWU7XG4gICAgICAgICAgY29uc3QgdmFsID0gU3RyaW5nKGdldFNvcnRWYWx1ZSh0YWIsIGtleSkpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgaWYgKCF2YWwuaW5jbHVkZXMoZmlsdGVyLnRvTG93ZXJDYXNlKCkpKSByZXR1cm4gZmFsc2U7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB0cnVlO1xuICB9KTtcblxuICAvLyAyLiBTb3J0XG4gIGlmIChhcHBTdGF0ZS5zb3J0S2V5KSB7XG4gICAgdGFic0Rpc3BsYXkuc29ydCgoYSwgYikgPT4ge1xuICAgICAgbGV0IHZhbEE6IGFueSA9IGdldFNvcnRWYWx1ZShhLCBhcHBTdGF0ZS5zb3J0S2V5ISk7XG4gICAgICBsZXQgdmFsQjogYW55ID0gZ2V0U29ydFZhbHVlKGIsIGFwcFN0YXRlLnNvcnRLZXkhKTtcblxuICAgICAgaWYgKHZhbEEgPCB2YWxCKSByZXR1cm4gYXBwU3RhdGUuc29ydERpcmVjdGlvbiA9PT0gJ2FzYycgPyAtMSA6IDE7XG4gICAgICBpZiAodmFsQSA+IHZhbEIpIHJldHVybiBhcHBTdGF0ZS5zb3J0RGlyZWN0aW9uID09PSAnYXNjJyA/IDEgOiAtMTtcbiAgICAgIHJldHVybiAwO1xuICAgIH0pO1xuICB9XG5cbiAgdGJvZHkuaW5uZXJIVE1MID0gJyc7IC8vIENsZWFyIGV4aXN0aW5nIHJvd3NcblxuICAvLyAzLiBSZW5kZXJcbiAgY29uc3QgdmlzaWJsZUNvbHMgPSBhcHBTdGF0ZS5jb2x1bW5zLmZpbHRlcihjID0+IGMudmlzaWJsZSk7XG5cbiAgdGFic0Rpc3BsYXkuZm9yRWFjaCh0YWIgPT4ge1xuICAgIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3RyJyk7XG5cbiAgICB2aXNpYmxlQ29scy5mb3JFYWNoKGNvbCA9PiB7XG4gICAgICAgIGNvbnN0IHRkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndGQnKTtcbiAgICAgICAgaWYgKGNvbC5rZXkgPT09ICd0aXRsZScpIHRkLmNsYXNzTGlzdC5hZGQoJ3RpdGxlLWNlbGwnKTtcbiAgICAgICAgaWYgKGNvbC5rZXkgPT09ICd1cmwnKSB0ZC5jbGFzc0xpc3QuYWRkKCd1cmwtY2VsbCcpO1xuXG4gICAgICAgIGNvbnN0IHZhbCA9IGdldENlbGxWYWx1ZSh0YWIsIGNvbC5rZXkpO1xuXG4gICAgICAgIGlmICh2YWwgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkge1xuICAgICAgICAgICAgdGQuYXBwZW5kQ2hpbGQodmFsKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRkLmlubmVySFRNTCA9IHZhbDtcbiAgICAgICAgICAgIHRkLnRpdGxlID0gc3RyaXBIdG1sKFN0cmluZyh2YWwpKTtcbiAgICAgICAgfVxuICAgICAgICByb3cuYXBwZW5kQ2hpbGQodGQpO1xuICAgIH0pO1xuXG4gICAgdGJvZHkuYXBwZW5kQ2hpbGQocm93KTtcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJDb2x1bW5zTWVudSgpIHtcbiAgICBjb25zdCBtZW51ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NvbHVtbnNNZW51Jyk7XG4gICAgaWYgKCFtZW51KSByZXR1cm47XG5cbiAgICBtZW51LmlubmVySFRNTCA9IGFwcFN0YXRlLmNvbHVtbnMubWFwKGNvbCA9PiBgXG4gICAgICAgIDxsYWJlbCBjbGFzcz1cImNvbHVtbi10b2dnbGVcIj5cbiAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBkYXRhLWtleT1cIiR7Y29sLmtleX1cIiAke2NvbC52aXNpYmxlID8gJ2NoZWNrZWQnIDogJyd9PlxuICAgICAgICAgICAgJHtlc2NhcGVIdG1sKGNvbC5sYWJlbCl9XG4gICAgICAgIDwvbGFiZWw+XG4gICAgYCkuam9pbignJyk7XG5cbiAgICBtZW51LnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0JykuZm9yRWFjaChpbnB1dCA9PiB7XG4gICAgICAgIGlucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIChlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBrZXkgPSAoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkuZGF0YXNldC5rZXk7XG4gICAgICAgICAgICBjb25zdCBjaGVja2VkID0gKGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLmNoZWNrZWQ7XG4gICAgICAgICAgICBjb25zdCBjb2wgPSBhcHBTdGF0ZS5jb2x1bW5zLmZpbmQoYyA9PiBjLmtleSA9PT0ga2V5KTtcbiAgICAgICAgICAgIGlmIChjb2wpIHtcbiAgICAgICAgICAgICAgICBjb2wudmlzaWJsZSA9IGNoZWNrZWQ7XG4gICAgICAgICAgICAgICAgcmVuZGVyVGFibGVIZWFkZXIoKTsgLy8gUmUtcmVuZGVyIGhlYWRlciB0byBhZGQvcmVtb3ZlIGNvbHVtbnNcbiAgICAgICAgICAgICAgICByZW5kZXJUYWJsZSgpOyAvLyBSZS1yZW5kZXIgYm9keVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlclRhYmxlSGVhZGVyKCkge1xuICAgIGNvbnN0IGhlYWRlclJvdyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdoZWFkZXJSb3cnKTtcbiAgICBjb25zdCBmaWx0ZXJSb3cgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZmlsdGVyUm93Jyk7XG4gICAgaWYgKCFoZWFkZXJSb3cgfHwgIWZpbHRlclJvdykgcmV0dXJuO1xuXG4gICAgY29uc3QgdmlzaWJsZUNvbHMgPSBhcHBTdGF0ZS5jb2x1bW5zLmZpbHRlcihjID0+IGMudmlzaWJsZSk7XG5cbiAgICAvLyBSZW5kZXIgSGVhZGVyc1xuICAgIGhlYWRlclJvdy5pbm5lckhUTUwgPSB2aXNpYmxlQ29scy5tYXAoY29sID0+IGBcbiAgICAgICAgPHRoIGNsYXNzPVwiJHtjb2wua2V5ICE9PSAnYWN0aW9ucycgPyAnc29ydGFibGUnIDogJyd9XCIgZGF0YS1rZXk9XCIke2NvbC5rZXl9XCIgc3R5bGU9XCJ3aWR0aDogJHtjb2wud2lkdGh9OyBwb3NpdGlvbjogcmVsYXRpdmU7XCI+XG4gICAgICAgICAgICAke2VzY2FwZUh0bWwoY29sLmxhYmVsKX1cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJyZXNpemVyXCI+PC9kaXY+XG4gICAgICAgIDwvdGg+XG4gICAgYCkuam9pbignJyk7XG5cbiAgICAvLyBSZW5kZXIgRmlsdGVyIElucHV0c1xuICAgIGZpbHRlclJvdy5pbm5lckhUTUwgPSB2aXNpYmxlQ29scy5tYXAoY29sID0+IHtcbiAgICAgICAgaWYgKCFjb2wuZmlsdGVyYWJsZSkgcmV0dXJuICc8dGg+PC90aD4nO1xuICAgICAgICBjb25zdCB2YWwgPSBhcHBTdGF0ZS5jb2x1bW5GaWx0ZXJzW2NvbC5rZXldIHx8ICcnO1xuICAgICAgICByZXR1cm4gYFxuICAgICAgICAgICAgPHRoPlxuICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwidGV4dFwiIGNsYXNzPVwiZmlsdGVyLWlucHV0XCIgZGF0YS1rZXk9XCIke2NvbC5rZXl9XCIgdmFsdWU9XCIke2VzY2FwZUh0bWwodmFsKX1cIiBwbGFjZWhvbGRlcj1cIkZpbHRlci4uLlwiPlxuICAgICAgICAgICAgPC90aD5cbiAgICAgICAgYDtcbiAgICB9KS5qb2luKCcnKTtcblxuICAgIC8vIEF0dGFjaCBTb3J0IExpc3RlbmVyc1xuICAgIGhlYWRlclJvdy5xdWVyeVNlbGVjdG9yQWxsKCcuc29ydGFibGUnKS5mb3JFYWNoKHRoID0+IHtcbiAgICAgICAgdGguYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgICAgICAgICAgLy8gSWdub3JlIGlmIGNsaWNrZWQgb24gcmVzaXplclxuICAgICAgICAgICAgaWYgKChlLnRhcmdldCBhcyBIVE1MRWxlbWVudCkuY2xhc3NMaXN0LmNvbnRhaW5zKCdyZXNpemVyJykpIHJldHVybjtcblxuICAgICAgICAgICAgY29uc3Qga2V5ID0gdGguZ2V0QXR0cmlidXRlKCdkYXRhLWtleScpO1xuICAgICAgICAgICAgaWYgKGtleSkgaGFuZGxlU29ydChrZXkpO1xuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgIC8vIEF0dGFjaCBGaWx0ZXIgTGlzdGVuZXJzXG4gICAgZmlsdGVyUm93LnF1ZXJ5U2VsZWN0b3JBbGwoJy5maWx0ZXItaW5wdXQnKS5mb3JFYWNoKGlucHV0ID0+IHtcbiAgICAgICAgaW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCAoZSkgPT4ge1xuICAgICAgICAgICAgY29uc3Qga2V5ID0gKGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5kYXRhc2V0LmtleTtcbiAgICAgICAgICAgIGNvbnN0IHZhbCA9IChlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgIGlmIChrZXkpIHtcbiAgICAgICAgICAgICAgICBhcHBTdGF0ZS5jb2x1bW5GaWx0ZXJzW2tleV0gPSB2YWw7XG4gICAgICAgICAgICAgICAgcmVuZGVyVGFibGUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICAvLyBBdHRhY2ggUmVzaXplIExpc3RlbmVyc1xuICAgIGhlYWRlclJvdy5xdWVyeVNlbGVjdG9yQWxsKCcucmVzaXplcicpLmZvckVhY2gocmVzaXplciA9PiB7XG4gICAgICAgIGluaXRSZXNpemUocmVzaXplciBhcyBIVE1MRWxlbWVudCk7XG4gICAgfSk7XG5cbiAgICB1cGRhdGVIZWFkZXJTdHlsZXMoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhbmRsZVNvcnQoa2V5OiBzdHJpbmcpIHtcbiAgaWYgKGFwcFN0YXRlLnNvcnRLZXkgPT09IGtleSkge1xuICAgIGFwcFN0YXRlLnNvcnREaXJlY3Rpb24gPSBhcHBTdGF0ZS5zb3J0RGlyZWN0aW9uID09PSAnYXNjJyA/ICdkZXNjJyA6ICdhc2MnO1xuICB9IGVsc2Uge1xuICAgIGFwcFN0YXRlLnNvcnRLZXkgPSBrZXk7XG4gICAgYXBwU3RhdGUuc29ydERpcmVjdGlvbiA9ICdhc2MnO1xuICB9XG4gIHVwZGF0ZUhlYWRlclN0eWxlcygpO1xuICByZW5kZXJUYWJsZSgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlSGVhZGVyU3R5bGVzKCkge1xuICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCd0aC5zb3J0YWJsZScpLmZvckVhY2godGggPT4ge1xuICAgIHRoLmNsYXNzTGlzdC5yZW1vdmUoJ3NvcnQtYXNjJywgJ3NvcnQtZGVzYycpO1xuICAgIGlmICh0aC5nZXRBdHRyaWJ1dGUoJ2RhdGEta2V5JykgPT09IGFwcFN0YXRlLnNvcnRLZXkpIHtcbiAgICAgIHRoLmNsYXNzTGlzdC5hZGQoYXBwU3RhdGUuc29ydERpcmVjdGlvbiA9PT0gJ2FzYycgPyAnc29ydC1hc2MnIDogJ3NvcnQtZGVzYycpO1xuICAgIH1cbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbml0UmVzaXplKHJlc2l6ZXI6IEhUTUxFbGVtZW50KSB7XG4gICAgbGV0IHggPSAwO1xuICAgIGxldCB3ID0gMDtcbiAgICBsZXQgdGg6IEhUTUxFbGVtZW50O1xuXG4gICAgY29uc3QgbW91c2VEb3duSGFuZGxlciA9IChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICAgIHRoID0gcmVzaXplci5wYXJlbnRFbGVtZW50IGFzIEhUTUxFbGVtZW50O1xuICAgICAgICB4ID0gZS5jbGllbnRYO1xuICAgICAgICB3ID0gdGgub2Zmc2V0V2lkdGg7XG5cbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgbW91c2VNb3ZlSGFuZGxlcik7XG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCBtb3VzZVVwSGFuZGxlcik7XG4gICAgICAgIHJlc2l6ZXIuY2xhc3NMaXN0LmFkZCgncmVzaXppbmcnKTtcbiAgICB9O1xuXG4gICAgY29uc3QgbW91c2VNb3ZlSGFuZGxlciA9IChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICAgIGNvbnN0IGR4ID0gZS5jbGllbnRYIC0geDtcbiAgICAgICAgY29uc3QgY29sS2V5ID0gdGguZ2V0QXR0cmlidXRlKCdkYXRhLWtleScpO1xuICAgICAgICBjb25zdCBjb2wgPSBhcHBTdGF0ZS5jb2x1bW5zLmZpbmQoYyA9PiBjLmtleSA9PT0gY29sS2V5KTtcbiAgICAgICAgaWYgKGNvbCkge1xuICAgICAgICAgICAgY29uc3QgbmV3V2lkdGggPSBNYXRoLm1heCgzMCwgdyArIGR4KTsgLy8gTWluIHdpZHRoIDMwcHhcbiAgICAgICAgICAgIGNvbC53aWR0aCA9IGAke25ld1dpZHRofXB4YDtcbiAgICAgICAgICAgIHRoLnN0eWxlLndpZHRoID0gY29sLndpZHRoO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIGNvbnN0IG1vdXNlVXBIYW5kbGVyID0gKCkgPT4ge1xuICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCBtb3VzZU1vdmVIYW5kbGVyKTtcbiAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsIG1vdXNlVXBIYW5kbGVyKTtcbiAgICAgICAgcmVzaXplci5jbGFzc0xpc3QucmVtb3ZlKCdyZXNpemluZycpO1xuICAgIH07XG5cbiAgICByZXNpemVyLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIG1vdXNlRG93bkhhbmRsZXIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5pdFRhYnNUYWJsZSgpIHtcbiAgICAvLyBMaXN0ZW5lcnMgZm9yIFVJIGNvbnRyb2xzXG4gICAgY29uc3QgcmVmcmVzaEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZWZyZXNoQnRuJyk7XG4gICAgaWYgKHJlZnJlc2hCdG4pIHtcbiAgICAgICAgcmVmcmVzaEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGxvYWRUYWJzKTtcbiAgICB9XG5cbiAgICBjb25zdCBnbG9iYWxTZWFyY2hJbnB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnbG9iYWxTZWFyY2gnKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgIGlmIChnbG9iYWxTZWFyY2hJbnB1dCkge1xuICAgICAgICBnbG9iYWxTZWFyY2hJbnB1dC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIChlKSA9PiB7XG4gICAgICAgICAgICBhcHBTdGF0ZS5nbG9iYWxTZWFyY2hRdWVyeSA9IChlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgIHJlbmRlclRhYmxlKCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IGNvbHVtbnNCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY29sdW1uc0J0bicpO1xuICAgIGlmIChjb2x1bW5zQnRuKSB7XG4gICAgICAgIGNvbHVtbnNCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBtZW51ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NvbHVtbnNNZW51Jyk7XG4gICAgICAgICAgICBtZW51Py5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nKTtcbiAgICAgICAgICAgIHJlbmRlckNvbHVtbnNNZW51KCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IHJlc2V0Vmlld0J0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZXNldFZpZXdCdG4nKTtcbiAgICBpZiAocmVzZXRWaWV3QnRuKSB7XG4gICAgICAgIHJlc2V0Vmlld0J0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgICAgIC8vIFJlc2V0IGNvbHVtbnMgdG8gZGVmYXVsdHNcbiAgICAgICAgICAgIGFwcFN0YXRlLmNvbHVtbnMuZm9yRWFjaChjID0+IGMudmlzaWJsZSA9IFsnaWQnLCAndGl0bGUnLCAndXJsJywgJ3dpbmRvd0lkJywgJ2dyb3VwSWQnLCAnZ2VucmUnLCAnY29udGV4dCcsICdzaXRlTmFtZScsICdwbGF0Zm9ybScsICdvYmplY3RUeXBlJywgJ2F1dGhvck9yQ3JlYXRvcicsICdhY3Rpb25zJ10uaW5jbHVkZXMoYy5rZXkpKTtcbiAgICAgICAgICAgIGFwcFN0YXRlLmdsb2JhbFNlYXJjaFF1ZXJ5ID0gJyc7XG4gICAgICAgICAgICBpZiAoZ2xvYmFsU2VhcmNoSW5wdXQpIGdsb2JhbFNlYXJjaElucHV0LnZhbHVlID0gJyc7XG4gICAgICAgICAgICBhcHBTdGF0ZS5jb2x1bW5GaWx0ZXJzID0ge307XG4gICAgICAgICAgICByZW5kZXJUYWJsZUhlYWRlcigpO1xuICAgICAgICAgICAgcmVuZGVyVGFibGUoKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gSGlkZSBjb2x1bW4gbWVudSB3aGVuIGNsaWNraW5nIG91dHNpZGVcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICAgICAgICBpZiAoIXRhcmdldC5jbG9zZXN0KCcuY29sdW1ucy1tZW51LWNvbnRhaW5lcicpKSB7XG4gICAgICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY29sdW1uc01lbnUnKT8uY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIExpc3RlbiBmb3IgdGFiIHVwZGF0ZXMgdG8gcmVmcmVzaCBkYXRhIChTUEEgc3VwcG9ydClcbiAgICAvLyBXZSBjYW4gcHV0IHRoZXNlIGxpc3RlbmVycyBoZXJlIG9yIGluIHRoZSBtYWluIGVudHJ5IHBvaW50LiBcbiAgICAvLyBQdXR0aW5nIHRoZW0gaGVyZSBpc29sYXRlcyB0YWIgdGFibGUgbG9naWMuXG4gICAgY2hyb21lLnRhYnMub25VcGRhdGVkLmFkZExpc3RlbmVyKCh0YWJJZCwgY2hhbmdlSW5mbywgdGFiKSA9PiB7XG4gICAgICAgIGlmIChjaGFuZ2VJbmZvLnVybCB8fCBjaGFuZ2VJbmZvLnN0YXR1cyA9PT0gJ2NvbXBsZXRlJykge1xuICAgICAgICAgICAgbG9hZFRhYnMoKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgY2hyb21lLnRhYnMub25SZW1vdmVkLmFkZExpc3RlbmVyKCgpID0+IHtcbiAgICAgICAgbG9hZFRhYnMoKTtcbiAgICB9KTtcblxuICAgIHJlbmRlclRhYmxlSGVhZGVyKCk7XG59XG4iLCAiaW1wb3J0IHsgQ3VzdG9tU3RyYXRlZ3ksIFNvcnRpbmdTdHJhdGVneSB9IGZyb20gXCIuL3R5cGVzLmpzXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RyYXRlZ3lEZWZpbml0aW9uIHtcbiAgICBpZDogU29ydGluZ1N0cmF0ZWd5IHwgc3RyaW5nO1xuICAgIGxhYmVsOiBzdHJpbmc7XG4gICAgaXNHcm91cGluZzogYm9vbGVhbjtcbiAgICBpc1NvcnRpbmc6IGJvb2xlYW47XG4gICAgdGFncz86IHN0cmluZ1tdO1xuICAgIGF1dG9SdW4/OiBib29sZWFuO1xuICAgIGlzQ3VzdG9tPzogYm9vbGVhbjtcbn1cblxuLy8gUmVzdG9yZWQgc3RyYXRlZ2llcyBtYXRjaGluZyBiYWNrZ3JvdW5kIGNhcGFiaWxpdGllcy5cbmV4cG9ydCBjb25zdCBTVFJBVEVHSUVTOiBTdHJhdGVneURlZmluaXRpb25bXSA9IFtcbiAgICB7IGlkOiBcImRvbWFpblwiLCBsYWJlbDogXCJEb21haW5cIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImRvbWFpbl9mdWxsXCIsIGxhYmVsOiBcIkZ1bGwgRG9tYWluXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJ0b3BpY1wiLCBsYWJlbDogXCJUb3BpY1wiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwiY29udGV4dFwiLCBsYWJlbDogXCJDb250ZXh0XCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJsaW5lYWdlXCIsIGxhYmVsOiBcIkxpbmVhZ2VcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInBpbm5lZFwiLCBsYWJlbDogXCJQaW5uZWRcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInJlY2VuY3lcIiwgbGFiZWw6IFwiUmVjZW5jeVwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwiYWdlXCIsIGxhYmVsOiBcIkFnZVwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwidXJsXCIsIGxhYmVsOiBcIlVSTFwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwibmVzdGluZ1wiLCBsYWJlbDogXCJOZXN0aW5nXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJ0aXRsZVwiLCBsYWJlbDogXCJUaXRsZVwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuXTtcblxuZXhwb3J0IGNvbnN0IGdldFN0cmF0ZWdpZXMgPSAoY3VzdG9tU3RyYXRlZ2llcz86IEN1c3RvbVN0cmF0ZWd5W10pOiBTdHJhdGVneURlZmluaXRpb25bXSA9PiB7XG4gICAgaWYgKCFjdXN0b21TdHJhdGVnaWVzIHx8IGN1c3RvbVN0cmF0ZWdpZXMubGVuZ3RoID09PSAwKSByZXR1cm4gU1RSQVRFR0lFUztcblxuICAgIC8vIEN1c3RvbSBzdHJhdGVnaWVzIGNhbiBvdmVycmlkZSBidWlsdC1pbnMgaWYgSURzIG1hdGNoLCBvciBhZGQgbmV3IG9uZXMuXG4gICAgY29uc3QgY29tYmluZWQgPSBbLi4uU1RSQVRFR0lFU107XG5cbiAgICBjdXN0b21TdHJhdGVnaWVzLmZvckVhY2goY3VzdG9tID0+IHtcbiAgICAgICAgY29uc3QgZXhpc3RpbmdJbmRleCA9IGNvbWJpbmVkLmZpbmRJbmRleChzID0+IHMuaWQgPT09IGN1c3RvbS5pZCk7XG5cbiAgICAgICAgLy8gRGV0ZXJtaW5lIGNhcGFiaWxpdGllcyBiYXNlZCBvbiBydWxlcyBwcmVzZW5jZVxuICAgICAgICBjb25zdCBoYXNHcm91cGluZyA9IChjdXN0b20uZ3JvdXBpbmdSdWxlcyAmJiBjdXN0b20uZ3JvdXBpbmdSdWxlcy5sZW5ndGggPiAwKSB8fCAoY3VzdG9tLnJ1bGVzICYmIGN1c3RvbS5ydWxlcy5sZW5ndGggPiAwKSB8fCBmYWxzZTtcbiAgICAgICAgY29uc3QgaGFzU29ydGluZyA9IChjdXN0b20uc29ydGluZ1J1bGVzICYmIGN1c3RvbS5zb3J0aW5nUnVsZXMubGVuZ3RoID4gMCkgfHwgKGN1c3RvbS5ydWxlcyAmJiBjdXN0b20ucnVsZXMubGVuZ3RoID4gMCkgfHwgZmFsc2U7XG5cbiAgICAgICAgY29uc3QgdGFnczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgaWYgKGhhc0dyb3VwaW5nKSB0YWdzLnB1c2goXCJncm91cFwiKTtcbiAgICAgICAgaWYgKGhhc1NvcnRpbmcpIHRhZ3MucHVzaChcInNvcnRcIik7XG5cbiAgICAgICAgY29uc3QgZGVmaW5pdGlvbjogU3RyYXRlZ3lEZWZpbml0aW9uID0ge1xuICAgICAgICAgICAgaWQ6IGN1c3RvbS5pZCxcbiAgICAgICAgICAgIGxhYmVsOiBjdXN0b20ubGFiZWwsXG4gICAgICAgICAgICBpc0dyb3VwaW5nOiBoYXNHcm91cGluZyxcbiAgICAgICAgICAgIGlzU29ydGluZzogaGFzU29ydGluZyxcbiAgICAgICAgICAgIHRhZ3M6IHRhZ3MsXG4gICAgICAgICAgICBhdXRvUnVuOiBjdXN0b20uYXV0b1J1bixcbiAgICAgICAgICAgIGlzQ3VzdG9tOiB0cnVlXG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKGV4aXN0aW5nSW5kZXggIT09IC0xKSB7XG4gICAgICAgICAgICBjb21iaW5lZFtleGlzdGluZ0luZGV4XSA9IGRlZmluaXRpb247XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb21iaW5lZC5wdXNoKGRlZmluaXRpb24pO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gY29tYmluZWQ7XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0U3RyYXRlZ3kgPSAoaWQ6IFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZyk6IFN0cmF0ZWd5RGVmaW5pdGlvbiB8IHVuZGVmaW5lZCA9PiBTVFJBVEVHSUVTLmZpbmQocyA9PiBzLmlkID09PSBpZCk7XG4iLCAiaW1wb3J0IHsgR3JvdXBpbmdTdHJhdGVneSwgU29ydGluZ1N0cmF0ZWd5LCBUYWJHcm91cCwgVGFiTWV0YWRhdGEsIEN1c3RvbVN0cmF0ZWd5LCBTdHJhdGVneVJ1bGUsIFJ1bGVDb25kaXRpb24sIEdyb3VwaW5nUnVsZSwgU29ydGluZ1J1bGUgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBnZXRTdHJhdGVnaWVzIH0gZnJvbSBcIi4uL3NoYXJlZC9zdHJhdGVneVJlZ2lzdHJ5LmpzXCI7XG5pbXBvcnQgeyBsb2dEZWJ1ZyB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBhc0FycmF5IH0gZnJvbSBcIi4uL3NoYXJlZC91dGlscy5qc1wiO1xuXG5sZXQgY3VzdG9tU3RyYXRlZ2llczogQ3VzdG9tU3RyYXRlZ3lbXSA9IFtdO1xuXG5leHBvcnQgY29uc3Qgc2V0Q3VzdG9tU3RyYXRlZ2llcyA9IChzdHJhdGVnaWVzOiBDdXN0b21TdHJhdGVneVtdKSA9PiB7XG4gICAgY3VzdG9tU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXM7XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0Q3VzdG9tU3RyYXRlZ2llcyA9ICgpOiBDdXN0b21TdHJhdGVneVtdID0+IGN1c3RvbVN0cmF0ZWdpZXM7XG5cbmNvbnN0IENPTE9SUyA9IFtcImdyZXlcIiwgXCJibHVlXCIsIFwicmVkXCIsIFwieWVsbG93XCIsIFwiZ3JlZW5cIiwgXCJwaW5rXCIsIFwicHVycGxlXCIsIFwiY3lhblwiLCBcIm9yYW5nZVwiXTtcblxuY29uc3QgcmVnZXhDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBSZWdFeHA+KCk7XG5jb25zdCBkb21haW5DYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5jb25zdCBzdWJkb21haW5DYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5jb25zdCBNQVhfQ0FDSEVfU0laRSA9IDEwMDA7XG5cbmV4cG9ydCBjb25zdCBkb21haW5Gcm9tVXJsID0gKHVybDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgaWYgKGRvbWFpbkNhY2hlLmhhcyh1cmwpKSByZXR1cm4gZG9tYWluQ2FjaGUuZ2V0KHVybCkhO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgcGFyc2VkID0gbmV3IFVSTCh1cmwpO1xuICAgIGNvbnN0IGRvbWFpbiA9IHBhcnNlZC5ob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgXCJcIik7XG5cbiAgICBpZiAoZG9tYWluQ2FjaGUuc2l6ZSA+PSBNQVhfQ0FDSEVfU0laRSkgZG9tYWluQ2FjaGUuY2xlYXIoKTtcbiAgICBkb21haW5DYWNoZS5zZXQodXJsLCBkb21haW4pO1xuXG4gICAgcmV0dXJuIGRvbWFpbjtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBsb2dEZWJ1ZyhcIkZhaWxlZCB0byBwYXJzZSBkb21haW5cIiwgeyB1cmwsIGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICAgIHJldHVybiBcInVua25vd25cIjtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IHN1YmRvbWFpbkZyb21VcmwgPSAodXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgIGlmIChzdWJkb21haW5DYWNoZS5oYXModXJsKSkgcmV0dXJuIHN1YmRvbWFpbkNhY2hlLmdldCh1cmwpITtcblxuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHBhcnNlZCA9IG5ldyBVUkwodXJsKTtcbiAgICAgICAgbGV0IGhvc3RuYW1lID0gcGFyc2VkLmhvc3RuYW1lO1xuICAgICAgICAvLyBSZW1vdmUgd3d3LlxuICAgICAgICBob3N0bmFtZSA9IGhvc3RuYW1lLnJlcGxhY2UoL153d3dcXC4vLCBcIlwiKTtcblxuICAgICAgICBsZXQgcmVzdWx0ID0gXCJcIjtcbiAgICAgICAgY29uc3QgcGFydHMgPSBob3N0bmFtZS5zcGxpdCgnLicpO1xuICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMikge1xuICAgICAgICAgICAgIHJlc3VsdCA9IHBhcnRzLnNsaWNlKDAsIHBhcnRzLmxlbmd0aCAtIDIpLmpvaW4oJy4nKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdWJkb21haW5DYWNoZS5zaXplID49IE1BWF9DQUNIRV9TSVpFKSBzdWJkb21haW5DYWNoZS5jbGVhcigpO1xuICAgICAgICBzdWJkb21haW5DYWNoZS5zZXQodXJsLCByZXN1bHQpO1xuXG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBcIlwiO1xuICAgIH1cbn1cblxuY29uc3QgZ2V0TmVzdGVkUHJvcGVydHkgPSAob2JqOiB1bmtub3duLCBwYXRoOiBzdHJpbmcpOiB1bmtub3duID0+IHtcbiAgICBpZiAoIW9iaiB8fCB0eXBlb2Ygb2JqICE9PSAnb2JqZWN0JykgcmV0dXJuIHVuZGVmaW5lZDtcblxuICAgIGlmICghcGF0aC5pbmNsdWRlcygnLicpKSB7XG4gICAgICAgIHJldHVybiAob2JqIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtwYXRoXTtcbiAgICB9XG5cbiAgICBjb25zdCBwYXJ0cyA9IHBhdGguc3BsaXQoJy4nKTtcbiAgICBsZXQgY3VycmVudDogdW5rbm93biA9IG9iajtcblxuICAgIGZvciAoY29uc3Qga2V5IG9mIHBhcnRzKSB7XG4gICAgICAgIGlmICghY3VycmVudCB8fCB0eXBlb2YgY3VycmVudCAhPT0gJ29iamVjdCcpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIGN1cnJlbnQgPSAoY3VycmVudCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilba2V5XTtcbiAgICB9XG5cbiAgICByZXR1cm4gY3VycmVudDtcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRGaWVsZFZhbHVlID0gKHRhYjogVGFiTWV0YWRhdGEsIGZpZWxkOiBzdHJpbmcpOiBhbnkgPT4ge1xuICAgIHN3aXRjaChmaWVsZCkge1xuICAgICAgICBjYXNlICdpZCc6IHJldHVybiB0YWIuaWQ7XG4gICAgICAgIGNhc2UgJ2luZGV4JzogcmV0dXJuIHRhYi5pbmRleDtcbiAgICAgICAgY2FzZSAnd2luZG93SWQnOiByZXR1cm4gdGFiLndpbmRvd0lkO1xuICAgICAgICBjYXNlICdncm91cElkJzogcmV0dXJuIHRhYi5ncm91cElkO1xuICAgICAgICBjYXNlICd0aXRsZSc6IHJldHVybiB0YWIudGl0bGU7XG4gICAgICAgIGNhc2UgJ3VybCc6IHJldHVybiB0YWIudXJsO1xuICAgICAgICBjYXNlICdzdGF0dXMnOiByZXR1cm4gdGFiLnN0YXR1cztcbiAgICAgICAgY2FzZSAnYWN0aXZlJzogcmV0dXJuIHRhYi5hY3RpdmU7XG4gICAgICAgIGNhc2UgJ3NlbGVjdGVkJzogcmV0dXJuIHRhYi5zZWxlY3RlZDtcbiAgICAgICAgY2FzZSAncGlubmVkJzogcmV0dXJuIHRhYi5waW5uZWQ7XG4gICAgICAgIGNhc2UgJ29wZW5lclRhYklkJzogcmV0dXJuIHRhYi5vcGVuZXJUYWJJZDtcbiAgICAgICAgY2FzZSAnbGFzdEFjY2Vzc2VkJzogcmV0dXJuIHRhYi5sYXN0QWNjZXNzZWQ7XG4gICAgICAgIGNhc2UgJ2NvbnRleHQnOiByZXR1cm4gdGFiLmNvbnRleHQ7XG4gICAgICAgIGNhc2UgJ2dlbnJlJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uZ2VucmU7XG4gICAgICAgIGNhc2UgJ3NpdGVOYW1lJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uc2l0ZU5hbWU7XG4gICAgICAgIC8vIERlcml2ZWQgb3IgbWFwcGVkIGZpZWxkc1xuICAgICAgICBjYXNlICdkb21haW4nOiByZXR1cm4gZG9tYWluRnJvbVVybCh0YWIudXJsKTtcbiAgICAgICAgY2FzZSAnc3ViZG9tYWluJzogcmV0dXJuIHN1YmRvbWFpbkZyb21VcmwodGFiLnVybCk7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICByZXR1cm4gZ2V0TmVzdGVkUHJvcGVydHkodGFiLCBmaWVsZCk7XG4gICAgfVxufTtcblxuY29uc3Qgc3RyaXBUbGQgPSAoZG9tYWluOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gZG9tYWluLnJlcGxhY2UoL1xcLihjb218b3JnfGdvdnxuZXR8ZWR1fGlvKSQvaSwgXCJcIik7XG59O1xuXG5leHBvcnQgY29uc3Qgc2VtYW50aWNCdWNrZXQgPSAodGl0bGU6IHN0cmluZywgdXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBrZXkgPSBgJHt0aXRsZX0gJHt1cmx9YC50b0xvd2VyQ2FzZSgpO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiZG9jXCIpIHx8IGtleS5pbmNsdWRlcyhcInJlYWRtZVwiKSB8fCBrZXkuaW5jbHVkZXMoXCJndWlkZVwiKSkgcmV0dXJuIFwiRG9jc1wiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwibWFpbFwiKSB8fCBrZXkuaW5jbHVkZXMoXCJpbmJveFwiKSkgcmV0dXJuIFwiQ2hhdFwiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiZGFzaGJvYXJkXCIpIHx8IGtleS5pbmNsdWRlcyhcImNvbnNvbGVcIikpIHJldHVybiBcIkRhc2hcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImlzc3VlXCIpIHx8IGtleS5pbmNsdWRlcyhcInRpY2tldFwiKSkgcmV0dXJuIFwiVGFza3NcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImRyaXZlXCIpIHx8IGtleS5pbmNsdWRlcyhcInN0b3JhZ2VcIikpIHJldHVybiBcIkZpbGVzXCI7XG4gIHJldHVybiBcIk1pc2NcIjtcbn07XG5cbmV4cG9ydCBjb25zdCBuYXZpZ2F0aW9uS2V5ID0gKHRhYjogVGFiTWV0YWRhdGEpOiBzdHJpbmcgPT4ge1xuICBpZiAodGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gYGNoaWxkLW9mLSR7dGFiLm9wZW5lclRhYklkfWA7XG4gIH1cbiAgcmV0dXJuIGB3aW5kb3ctJHt0YWIud2luZG93SWR9YDtcbn07XG5cbmNvbnN0IGdldFJlY2VuY3lMYWJlbCA9IChsYXN0QWNjZXNzZWQ6IG51bWJlcik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gIGNvbnN0IGRpZmYgPSBub3cgLSBsYXN0QWNjZXNzZWQ7XG4gIGlmIChkaWZmIDwgMzYwMDAwMCkgcmV0dXJuIFwiSnVzdCBub3dcIjsgLy8gMWhcbiAgaWYgKGRpZmYgPCA4NjQwMDAwMCkgcmV0dXJuIFwiVG9kYXlcIjsgLy8gMjRoXG4gIGlmIChkaWZmIDwgMTcyODAwMDAwKSByZXR1cm4gXCJZZXN0ZXJkYXlcIjsgLy8gNDhoXG4gIGlmIChkaWZmIDwgNjA0ODAwMDAwKSByZXR1cm4gXCJUaGlzIFdlZWtcIjsgLy8gN2RcbiAgcmV0dXJuIFwiT2xkZXJcIjtcbn07XG5cbmNvbnN0IGNvbG9yRm9yS2V5ID0gKGtleTogc3RyaW5nLCBvZmZzZXQ6IG51bWJlcik6IHN0cmluZyA9PiBDT0xPUlNbKE1hdGguYWJzKGhhc2hDb2RlKGtleSkpICsgb2Zmc2V0KSAlIENPTE9SUy5sZW5ndGhdO1xuXG5jb25zdCBoYXNoQ29kZSA9ICh2YWx1ZTogc3RyaW5nKTogbnVtYmVyID0+IHtcbiAgbGV0IGhhc2ggPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHZhbHVlLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgaGFzaCA9IChoYXNoIDw8IDUpIC0gaGFzaCArIHZhbHVlLmNoYXJDb2RlQXQoaSk7XG4gICAgaGFzaCB8PSAwO1xuICB9XG4gIHJldHVybiBoYXNoO1xufTtcblxuLy8gSGVscGVyIHRvIGdldCBhIGh1bWFuLXJlYWRhYmxlIGxhYmVsIGNvbXBvbmVudCBmcm9tIGEgc3RyYXRlZ3kgYW5kIGEgc2V0IG9mIHRhYnNcbmNvbnN0IGdldExhYmVsQ29tcG9uZW50ID0gKHN0cmF0ZWd5OiBHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nLCB0YWJzOiBUYWJNZXRhZGF0YVtdLCBhbGxUYWJzTWFwOiBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YT4pOiBzdHJpbmcgfCBudWxsID0+IHtcbiAgY29uc3QgZmlyc3RUYWIgPSB0YWJzWzBdO1xuICBpZiAoIWZpcnN0VGFiKSByZXR1cm4gXCJVbmtub3duXCI7XG5cbiAgLy8gQ2hlY2sgY3VzdG9tIHN0cmF0ZWdpZXMgZmlyc3RcbiAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3kpO1xuICBpZiAoY3VzdG9tKSB7XG4gICAgICByZXR1cm4gZ3JvdXBpbmdLZXkoZmlyc3RUYWIsIHN0cmF0ZWd5KTtcbiAgfVxuXG4gIHN3aXRjaCAoc3RyYXRlZ3kpIHtcbiAgICBjYXNlIFwiZG9tYWluXCI6IHtcbiAgICAgIGNvbnN0IHNpdGVOYW1lcyA9IG5ldyBTZXQodGFicy5tYXAodCA9PiB0LmNvbnRleHREYXRhPy5zaXRlTmFtZSkuZmlsdGVyKEJvb2xlYW4pKTtcbiAgICAgIGlmIChzaXRlTmFtZXMuc2l6ZSA9PT0gMSkge1xuICAgICAgICByZXR1cm4gc3RyaXBUbGQoQXJyYXkuZnJvbShzaXRlTmFtZXMpWzBdIGFzIHN0cmluZyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gc3RyaXBUbGQoZG9tYWluRnJvbVVybChmaXJzdFRhYi51cmwpKTtcbiAgICB9XG4gICAgY2FzZSBcImRvbWFpbl9mdWxsXCI6XG4gICAgICByZXR1cm4gZG9tYWluRnJvbVVybChmaXJzdFRhYi51cmwpO1xuICAgIGNhc2UgXCJ0b3BpY1wiOlxuICAgICAgcmV0dXJuIHNlbWFudGljQnVja2V0KGZpcnN0VGFiLnRpdGxlLCBmaXJzdFRhYi51cmwpO1xuICAgIGNhc2UgXCJsaW5lYWdlXCI6XG4gICAgICBpZiAoZmlyc3RUYWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBjb25zdCBwYXJlbnQgPSBhbGxUYWJzTWFwLmdldChmaXJzdFRhYi5vcGVuZXJUYWJJZCk7XG4gICAgICAgIGlmIChwYXJlbnQpIHtcbiAgICAgICAgICBjb25zdCBwYXJlbnRUaXRsZSA9IHBhcmVudC50aXRsZS5sZW5ndGggPiAyMCA/IHBhcmVudC50aXRsZS5zdWJzdHJpbmcoMCwgMjApICsgXCIuLi5cIiA6IHBhcmVudC50aXRsZTtcbiAgICAgICAgICByZXR1cm4gYEZyb206ICR7cGFyZW50VGl0bGV9YDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYEZyb206IFRhYiAke2ZpcnN0VGFiLm9wZW5lclRhYklkfWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYFdpbmRvdyAke2ZpcnN0VGFiLndpbmRvd0lkfWA7XG4gICAgY2FzZSBcImNvbnRleHRcIjpcbiAgICAgIHJldHVybiBmaXJzdFRhYi5jb250ZXh0IHx8IFwiVW5jYXRlZ29yaXplZFwiO1xuICAgIGNhc2UgXCJwaW5uZWRcIjpcbiAgICAgIHJldHVybiBmaXJzdFRhYi5waW5uZWQgPyBcIlBpbm5lZFwiIDogXCJVbnBpbm5lZFwiO1xuICAgIGNhc2UgXCJhZ2VcIjpcbiAgICAgIHJldHVybiBnZXRSZWNlbmN5TGFiZWwoZmlyc3RUYWIubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgIGNhc2UgXCJ1cmxcIjpcbiAgICAgIHJldHVybiBcIlVSTCBHcm91cFwiO1xuICAgIGNhc2UgXCJyZWNlbmN5XCI6XG4gICAgICByZXR1cm4gXCJUaW1lIEdyb3VwXCI7XG4gICAgY2FzZSBcIm5lc3RpbmdcIjpcbiAgICAgIHJldHVybiBmaXJzdFRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkID8gXCJDaGlsZHJlblwiIDogXCJSb290c1wiO1xuICAgIGRlZmF1bHQ6XG4gICAgICBjb25zdCB2YWwgPSBnZXRGaWVsZFZhbHVlKGZpcnN0VGFiLCBzdHJhdGVneSk7XG4gICAgICBpZiAodmFsICE9PSB1bmRlZmluZWQgJiYgdmFsICE9PSBudWxsKSB7XG4gICAgICAgICAgcmV0dXJuIFN0cmluZyh2YWwpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIFwiVW5rbm93blwiO1xuICB9XG59O1xuXG5jb25zdCBnZW5lcmF0ZUxhYmVsID0gKFxuICBzdHJhdGVnaWVzOiAoR3JvdXBpbmdTdHJhdGVneSB8IHN0cmluZylbXSxcbiAgdGFiczogVGFiTWV0YWRhdGFbXSxcbiAgYWxsVGFic01hcDogTWFwPG51bWJlciwgVGFiTWV0YWRhdGE+XG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBsYWJlbHMgPSBzdHJhdGVnaWVzXG4gICAgLm1hcChzID0+IGdldExhYmVsQ29tcG9uZW50KHMsIHRhYnMsIGFsbFRhYnNNYXApKVxuICAgIC5maWx0ZXIobCA9PiBsICYmIGwgIT09IFwiVW5rbm93blwiICYmIGwgIT09IFwiR3JvdXBcIiAmJiBsICE9PSBcIlVSTCBHcm91cFwiICYmIGwgIT09IFwiVGltZSBHcm91cFwiICYmIGwgIT09IFwiTWlzY1wiKTtcblxuICBpZiAobGFiZWxzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIFwiR3JvdXBcIjtcbiAgcmV0dXJuIEFycmF5LmZyb20obmV3IFNldChsYWJlbHMpKS5qb2luKFwiIC0gXCIpO1xufTtcblxuY29uc3QgZ2V0U3RyYXRlZ3lDb2xvclJ1bGUgPSAoc3RyYXRlZ3lJZDogc3RyaW5nKTogR3JvdXBpbmdSdWxlIHwgdW5kZWZpbmVkID0+IHtcbiAgICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneUlkKTtcbiAgICBpZiAoIWN1c3RvbSkgcmV0dXJuIHVuZGVmaW5lZDtcblxuICAgIGNvbnN0IGdyb3VwaW5nUnVsZXNMaXN0ID0gYXNBcnJheTxHcm91cGluZ1J1bGU+KGN1c3RvbS5ncm91cGluZ1J1bGVzKTtcbiAgICAvLyBJdGVyYXRlIG1hbnVhbGx5IHRvIGNoZWNrIGNvbG9yXG4gICAgZm9yIChsZXQgaSA9IGdyb3VwaW5nUnVsZXNMaXN0Lmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgIGNvbnN0IHJ1bGUgPSBncm91cGluZ1J1bGVzTGlzdFtpXTtcbiAgICAgICAgaWYgKHJ1bGUgJiYgcnVsZS5jb2xvciAmJiBydWxlLmNvbG9yICE9PSAncmFuZG9tJykge1xuICAgICAgICAgICAgcmV0dXJuIHJ1bGU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbn07XG5cbmNvbnN0IHJlc29sdmVXaW5kb3dNb2RlID0gKG1vZGVzOiAoc3RyaW5nIHwgdW5kZWZpbmVkKVtdKTogXCJjdXJyZW50XCIgfCBcIm5ld1wiIHwgXCJjb21wb3VuZFwiID0+IHtcbiAgICBpZiAobW9kZXMuaW5jbHVkZXMoXCJuZXdcIikpIHJldHVybiBcIm5ld1wiO1xuICAgIGlmIChtb2Rlcy5pbmNsdWRlcyhcImNvbXBvdW5kXCIpKSByZXR1cm4gXCJjb21wb3VuZFwiO1xuICAgIHJldHVybiBcImN1cnJlbnRcIjtcbn07XG5cbmV4cG9ydCBjb25zdCBncm91cFRhYnMgPSAoXG4gIHRhYnM6IFRhYk1ldGFkYXRhW10sXG4gIHN0cmF0ZWdpZXM6IChTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmcpW11cbik6IFRhYkdyb3VwW10gPT4ge1xuICBjb25zdCBhdmFpbGFibGVTdHJhdGVnaWVzID0gZ2V0U3RyYXRlZ2llcyhjdXN0b21TdHJhdGVnaWVzKTtcbiAgY29uc3QgZWZmZWN0aXZlU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gYXZhaWxhYmxlU3RyYXRlZ2llcy5maW5kKGF2YWlsID0+IGF2YWlsLmlkID09PSBzKT8uaXNHcm91cGluZyk7XG4gIGNvbnN0IGJ1Y2tldHMgPSBuZXcgTWFwPHN0cmluZywgVGFiR3JvdXA+KCk7XG5cbiAgY29uc3QgYWxsVGFic01hcCA9IG5ldyBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YT4oKTtcbiAgdGFicy5mb3JFYWNoKHQgPT4gYWxsVGFic01hcC5zZXQodC5pZCwgdCkpO1xuXG4gIHRhYnMuZm9yRWFjaCgodGFiKSA9PiB7XG4gICAgbGV0IGtleXM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgYXBwbGllZFN0cmF0ZWdpZXM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgY29sbGVjdGVkTW9kZXM6IHN0cmluZ1tdID0gW107XG5cbiAgICB0cnkge1xuICAgICAgICBmb3IgKGNvbnN0IHMgb2YgZWZmZWN0aXZlU3RyYXRlZ2llcykge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gZ2V0R3JvdXBpbmdSZXN1bHQodGFiLCBzKTtcbiAgICAgICAgICAgIGlmIChyZXN1bHQua2V5ICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAga2V5cy5wdXNoKGAke3N9OiR7cmVzdWx0LmtleX1gKTtcbiAgICAgICAgICAgICAgICBhcHBsaWVkU3RyYXRlZ2llcy5wdXNoKHMpO1xuICAgICAgICAgICAgICAgIGNvbGxlY3RlZE1vZGVzLnB1c2gocmVzdWx0Lm1vZGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGdlbmVyYXRpbmcgZ3JvdXBpbmcga2V5XCIsIHsgdGFiSWQ6IHRhYi5pZCwgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgcmV0dXJuOyAvLyBTa2lwIHRoaXMgdGFiIG9uIGVycm9yXG4gICAgfVxuXG4gICAgLy8gSWYgbm8gc3RyYXRlZ2llcyBhcHBsaWVkIChlLmcuIGFsbCBmaWx0ZXJlZCBvdXQpLCBza2lwIGdyb3VwaW5nIGZvciB0aGlzIHRhYlxuICAgIGlmIChrZXlzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgZWZmZWN0aXZlTW9kZSA9IHJlc29sdmVXaW5kb3dNb2RlKGNvbGxlY3RlZE1vZGVzKTtcbiAgICBjb25zdCB2YWx1ZUtleSA9IGtleXMuam9pbihcIjo6XCIpO1xuICAgIGxldCBidWNrZXRLZXkgPSBcIlwiO1xuICAgIGlmIChlZmZlY3RpdmVNb2RlID09PSAnY3VycmVudCcpIHtcbiAgICAgICAgIGJ1Y2tldEtleSA9IGB3aW5kb3ctJHt0YWIud2luZG93SWR9OjpgICsgdmFsdWVLZXk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgIGJ1Y2tldEtleSA9IGBnbG9iYWw6OmAgKyB2YWx1ZUtleTtcbiAgICB9XG5cbiAgICBsZXQgZ3JvdXAgPSBidWNrZXRzLmdldChidWNrZXRLZXkpO1xuICAgIGlmICghZ3JvdXApIHtcbiAgICAgIGxldCBncm91cENvbG9yID0gbnVsbDtcbiAgICAgIGxldCBjb2xvckZpZWxkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICBsZXQgY29sb3JUcmFuc2Zvcm06IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgIGxldCBjb2xvclRyYW5zZm9ybVBhdHRlcm46IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICAgICAgZm9yIChjb25zdCBzSWQgb2YgYXBwbGllZFN0cmF0ZWdpZXMpIHtcbiAgICAgICAgY29uc3QgcnVsZSA9IGdldFN0cmF0ZWd5Q29sb3JSdWxlKHNJZCk7XG4gICAgICAgIGlmIChydWxlKSB7XG4gICAgICAgICAgICBncm91cENvbG9yID0gcnVsZS5jb2xvcjtcbiAgICAgICAgICAgIGNvbG9yRmllbGQgPSBydWxlLmNvbG9yRmllbGQ7XG4gICAgICAgICAgICBjb2xvclRyYW5zZm9ybSA9IHJ1bGUuY29sb3JUcmFuc2Zvcm07XG4gICAgICAgICAgICBjb2xvclRyYW5zZm9ybVBhdHRlcm4gPSBydWxlLmNvbG9yVHJhbnNmb3JtUGF0dGVybjtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChncm91cENvbG9yID09PSAnbWF0Y2gnKSB7XG4gICAgICAgIGdyb3VwQ29sb3IgPSBjb2xvckZvcktleSh2YWx1ZUtleSwgMCk7XG4gICAgICB9IGVsc2UgaWYgKGdyb3VwQ29sb3IgPT09ICdmaWVsZCcgJiYgY29sb3JGaWVsZCkge1xuICAgICAgICBjb25zdCB2YWwgPSBnZXRGaWVsZFZhbHVlKHRhYiwgY29sb3JGaWVsZCk7XG4gICAgICAgIGxldCBrZXkgPSB2YWwgIT09IHVuZGVmaW5lZCAmJiB2YWwgIT09IG51bGwgPyBTdHJpbmcodmFsKSA6IFwiXCI7XG4gICAgICAgIGlmIChjb2xvclRyYW5zZm9ybSkge1xuICAgICAgICAgICAga2V5ID0gYXBwbHlWYWx1ZVRyYW5zZm9ybShrZXksIGNvbG9yVHJhbnNmb3JtLCBjb2xvclRyYW5zZm9ybVBhdHRlcm4pO1xuICAgICAgICB9XG4gICAgICAgIGdyb3VwQ29sb3IgPSBjb2xvckZvcktleShrZXksIDApO1xuICAgICAgfSBlbHNlIGlmICghZ3JvdXBDb2xvciB8fCBncm91cENvbG9yID09PSAnZmllbGQnKSB7XG4gICAgICAgIGdyb3VwQ29sb3IgPSBjb2xvckZvcktleShidWNrZXRLZXksIGJ1Y2tldHMuc2l6ZSk7XG4gICAgICB9XG5cbiAgICAgIGdyb3VwID0ge1xuICAgICAgICBpZDogYnVja2V0S2V5LFxuICAgICAgICB3aW5kb3dJZDogdGFiLndpbmRvd0lkLFxuICAgICAgICBsYWJlbDogXCJcIixcbiAgICAgICAgY29sb3I6IGdyb3VwQ29sb3IsXG4gICAgICAgIHRhYnM6IFtdLFxuICAgICAgICByZWFzb246IGFwcGxpZWRTdHJhdGVnaWVzLmpvaW4oXCIgKyBcIiksXG4gICAgICAgIHdpbmRvd01vZGU6IGVmZmVjdGl2ZU1vZGVcbiAgICAgIH07XG4gICAgICBidWNrZXRzLnNldChidWNrZXRLZXksIGdyb3VwKTtcbiAgICB9XG4gICAgZ3JvdXAudGFicy5wdXNoKHRhYik7XG4gIH0pO1xuXG4gIGNvbnN0IGdyb3VwcyA9IEFycmF5LmZyb20oYnVja2V0cy52YWx1ZXMoKSk7XG4gIGdyb3Vwcy5mb3JFYWNoKGdyb3VwID0+IHtcbiAgICBncm91cC5sYWJlbCA9IGdlbmVyYXRlTGFiZWwoZWZmZWN0aXZlU3RyYXRlZ2llcywgZ3JvdXAudGFicywgYWxsVGFic01hcCk7XG4gIH0pO1xuXG4gIHJldHVybiBncm91cHM7XG59O1xuXG5jb25zdCBjaGVja1ZhbHVlTWF0Y2ggPSAoXG4gICAgb3BlcmF0b3I6IHN0cmluZyxcbiAgICByYXdWYWx1ZTogYW55LFxuICAgIHJ1bGVWYWx1ZTogc3RyaW5nXG4pOiB7IGlzTWF0Y2g6IGJvb2xlYW47IG1hdGNoT2JqOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsIH0gPT4ge1xuICAgIGNvbnN0IHZhbHVlU3RyID0gcmF3VmFsdWUgIT09IHVuZGVmaW5lZCAmJiByYXdWYWx1ZSAhPT0gbnVsbCA/IFN0cmluZyhyYXdWYWx1ZSkgOiBcIlwiO1xuICAgIGNvbnN0IHZhbHVlVG9DaGVjayA9IHZhbHVlU3RyLnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3QgcGF0dGVyblRvQ2hlY2sgPSBydWxlVmFsdWUgPyBydWxlVmFsdWUudG9Mb3dlckNhc2UoKSA6IFwiXCI7XG5cbiAgICBsZXQgaXNNYXRjaCA9IGZhbHNlO1xuICAgIGxldCBtYXRjaE9iajogUmVnRXhwRXhlY0FycmF5IHwgbnVsbCA9IG51bGw7XG5cbiAgICBzd2l0Y2ggKG9wZXJhdG9yKSB7XG4gICAgICAgIGNhc2UgJ2NvbnRhaW5zJzogaXNNYXRjaCA9IHZhbHVlVG9DaGVjay5pbmNsdWRlcyhwYXR0ZXJuVG9DaGVjayk7IGJyZWFrO1xuICAgICAgICBjYXNlICdkb2VzTm90Q29udGFpbic6IGlzTWF0Y2ggPSAhdmFsdWVUb0NoZWNrLmluY2x1ZGVzKHBhdHRlcm5Ub0NoZWNrKTsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2VxdWFscyc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2sgPT09IHBhdHRlcm5Ub0NoZWNrOyBicmVhaztcbiAgICAgICAgY2FzZSAnc3RhcnRzV2l0aCc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suc3RhcnRzV2l0aChwYXR0ZXJuVG9DaGVjayk7IGJyZWFrO1xuICAgICAgICBjYXNlICdlbmRzV2l0aCc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suZW5kc1dpdGgocGF0dGVyblRvQ2hlY2spOyBicmVhaztcbiAgICAgICAgY2FzZSAnZXhpc3RzJzogaXNNYXRjaCA9IHJhd1ZhbHVlICE9PSB1bmRlZmluZWQ7IGJyZWFrO1xuICAgICAgICBjYXNlICdkb2VzTm90RXhpc3QnOiBpc01hdGNoID0gcmF3VmFsdWUgPT09IHVuZGVmaW5lZDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2lzTnVsbCc6IGlzTWF0Y2ggPSByYXdWYWx1ZSA9PT0gbnVsbDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2lzTm90TnVsbCc6IGlzTWF0Y2ggPSByYXdWYWx1ZSAhPT0gbnVsbDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ21hdGNoZXMnOlxuICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKHJ1bGVWYWx1ZSwgJ2knKTtcbiAgICAgICAgICAgICAgICBtYXRjaE9iaiA9IHJlZ2V4LmV4ZWModmFsdWVTdHIpO1xuICAgICAgICAgICAgICAgIGlzTWF0Y2ggPSAhIW1hdGNoT2JqO1xuICAgICAgICAgICAgIH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHJldHVybiB7IGlzTWF0Y2gsIG1hdGNoT2JqIH07XG59O1xuXG5leHBvcnQgY29uc3QgY2hlY2tDb25kaXRpb24gPSAoY29uZGl0aW9uOiBSdWxlQ29uZGl0aW9uLCB0YWI6IFRhYk1ldGFkYXRhKTogYm9vbGVhbiA9PiB7XG4gICAgaWYgKCFjb25kaXRpb24pIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCByYXdWYWx1ZSA9IGdldEZpZWxkVmFsdWUodGFiLCBjb25kaXRpb24uZmllbGQpO1xuICAgIGNvbnN0IHsgaXNNYXRjaCB9ID0gY2hlY2tWYWx1ZU1hdGNoKGNvbmRpdGlvbi5vcGVyYXRvciwgcmF3VmFsdWUsIGNvbmRpdGlvbi52YWx1ZSk7XG4gICAgcmV0dXJuIGlzTWF0Y2g7XG59O1xuXG5leHBvcnQgY29uc3QgYXBwbHlWYWx1ZVRyYW5zZm9ybSA9ICh2YWw6IHN0cmluZywgdHJhbnNmb3JtOiBzdHJpbmcsIHBhdHRlcm4/OiBzdHJpbmcsIHJlcGxhY2VtZW50Pzogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICBpZiAoIXZhbCB8fCAhdHJhbnNmb3JtIHx8IHRyYW5zZm9ybSA9PT0gJ25vbmUnKSByZXR1cm4gdmFsO1xuXG4gICAgc3dpdGNoICh0cmFuc2Zvcm0pIHtcbiAgICAgICAgY2FzZSAnc3RyaXBUbGQnOlxuICAgICAgICAgICAgcmV0dXJuIHN0cmlwVGxkKHZhbCk7XG4gICAgICAgIGNhc2UgJ2xvd2VyY2FzZSc6XG4gICAgICAgICAgICByZXR1cm4gdmFsLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGNhc2UgJ3VwcGVyY2FzZSc6XG4gICAgICAgICAgICByZXR1cm4gdmFsLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgIGNhc2UgJ2ZpcnN0Q2hhcic6XG4gICAgICAgICAgICByZXR1cm4gdmFsLmNoYXJBdCgwKTtcbiAgICAgICAgY2FzZSAnZG9tYWluJzpcbiAgICAgICAgICAgIHJldHVybiBkb21haW5Gcm9tVXJsKHZhbCk7XG4gICAgICAgIGNhc2UgJ2hvc3RuYW1lJzpcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIHJldHVybiBuZXcgVVJMKHZhbCkuaG9zdG5hbWU7XG4gICAgICAgICAgICB9IGNhdGNoIHsgcmV0dXJuIHZhbDsgfVxuICAgICAgICBjYXNlICdyZWdleCc6XG4gICAgICAgICAgICBpZiAocGF0dGVybikge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCByZWdleCA9IHJlZ2V4Q2FjaGUuZ2V0KHBhdHRlcm4pO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXJlZ2V4KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWdleCA9IG5ldyBSZWdFeHAocGF0dGVybik7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWdleENhY2hlLnNldChwYXR0ZXJuLCByZWdleCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbWF0Y2ggPSByZWdleC5leGVjKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGV4dHJhY3RlZCA9IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IG1hdGNoLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXh0cmFjdGVkICs9IG1hdGNoW2ldIHx8IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZXh0cmFjdGVkO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgIGxvZ0RlYnVnKFwiSW52YWxpZCByZWdleCBpbiB0cmFuc2Zvcm1cIiwgeyBwYXR0ZXJuOiBwYXR0ZXJuLCBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICAgICAgfVxuICAgICAgICBjYXNlICdyZWdleFJlcGxhY2UnOlxuICAgICAgICAgICAgIGlmIChwYXR0ZXJuKSB7XG4gICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAvLyBVc2luZyAnZycgZ2xvYmFsIGZsYWcgYnkgZGVmYXVsdCBmb3IgcmVwbGFjZW1lbnRcbiAgICAgICAgICAgICAgICAgICAgIHJldHVybiB2YWwucmVwbGFjZShuZXcgUmVnRXhwKHBhdHRlcm4sICdnJyksIHJlcGxhY2VtZW50IHx8IFwiXCIpO1xuICAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkludmFsaWQgcmVnZXggaW4gdHJhbnNmb3JtXCIsIHsgcGF0dGVybjogcGF0dGVybiwgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICAgICAgICAgICAgIHJldHVybiB2YWw7XG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgcmV0dXJuIHZhbDtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHJldHVybiB2YWw7XG4gICAgfVxufTtcblxuZnVuY3Rpb24gZXZhbHVhdGVMZWdhY3lSdWxlcyhsZWdhY3lSdWxlczogU3RyYXRlZ3lSdWxlW10sIHRhYjogVGFiTWV0YWRhdGEpOiBzdHJpbmcgfCBudWxsIHtcbiAgICAvLyBEZWZlbnNpdmUgY2hlY2tcbiAgICBpZiAoIWxlZ2FjeVJ1bGVzIHx8ICFBcnJheS5pc0FycmF5KGxlZ2FjeVJ1bGVzKSkge1xuICAgICAgICBpZiAoIWxlZ2FjeVJ1bGVzKSByZXR1cm4gbnVsbDtcbiAgICAgICAgLy8gVHJ5IGFzQXJyYXkgaWYgaXQncyBub3QgYXJyYXkgYnV0IHRydXRoeSAodW5saWtlbHkgZ2l2ZW4gcHJldmlvdXMgbG9naWMgYnV0IHNhZmUpXG4gICAgfVxuXG4gICAgY29uc3QgbGVnYWN5UnVsZXNMaXN0ID0gYXNBcnJheTxTdHJhdGVneVJ1bGU+KGxlZ2FjeVJ1bGVzKTtcbiAgICBpZiAobGVnYWN5UnVsZXNMaXN0Lmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG5cbiAgICB0cnkge1xuICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgbGVnYWN5UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICBpZiAoIXJ1bGUpIGNvbnRpbnVlO1xuICAgICAgICAgICAgY29uc3QgcmF3VmFsdWUgPSBnZXRGaWVsZFZhbHVlKHRhYiwgcnVsZS5maWVsZCk7XG4gICAgICAgICAgICBjb25zdCB7IGlzTWF0Y2gsIG1hdGNoT2JqIH0gPSBjaGVja1ZhbHVlTWF0Y2gocnVsZS5vcGVyYXRvciwgcmF3VmFsdWUsIHJ1bGUudmFsdWUpO1xuXG4gICAgICAgICAgICBpZiAoaXNNYXRjaCkge1xuICAgICAgICAgICAgICAgIGxldCByZXN1bHQgPSBydWxlLnJlc3VsdDtcbiAgICAgICAgICAgICAgICBpZiAobWF0Y2hPYmopIHtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBtYXRjaE9iai5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKG5ldyBSZWdFeHAoYFxcXFwkJHtpfWAsICdnJyksIG1hdGNoT2JqW2ldIHx8IFwiXCIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGV2YWx1YXRpbmcgbGVnYWN5IHJ1bGVzXCIsIHsgZXJyb3I6IFN0cmluZyhlcnJvcikgfSk7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgY29uc3QgZ2V0R3JvdXBpbmdSZXN1bHQgPSAodGFiOiBUYWJNZXRhZGF0YSwgc3RyYXRlZ3k6IEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcpOiB7IGtleTogc3RyaW5nIHwgbnVsbCwgbW9kZTogXCJjdXJyZW50XCIgfCBcIm5ld1wiIHwgXCJjb21wb3VuZFwiIH0gPT4ge1xuICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneSk7XG4gIGlmIChjdXN0b20pIHtcbiAgICAgIGNvbnN0IGZpbHRlckdyb3Vwc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb25bXT4oY3VzdG9tLmZpbHRlckdyb3Vwcyk7XG4gICAgICBjb25zdCBmaWx0ZXJzTGlzdCA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbj4oY3VzdG9tLmZpbHRlcnMpO1xuXG4gICAgICBsZXQgbWF0Y2ggPSBmYWxzZTtcblxuICAgICAgaWYgKGZpbHRlckdyb3Vwc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIC8vIE9SIGxvZ2ljXG4gICAgICAgICAgZm9yIChjb25zdCBncm91cCBvZiBmaWx0ZXJHcm91cHNMaXN0KSB7XG4gICAgICAgICAgICAgIGNvbnN0IGdyb3VwUnVsZXMgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGdyb3VwKTtcbiAgICAgICAgICAgICAgaWYgKGdyb3VwUnVsZXMubGVuZ3RoID09PSAwIHx8IGdyb3VwUnVsZXMuZXZlcnkociA9PiBjaGVja0NvbmRpdGlvbihyLCB0YWIpKSkge1xuICAgICAgICAgICAgICAgICAgbWF0Y2ggPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGZpbHRlcnNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAvLyBMZWdhY3kvU2ltcGxlIEFORCBsb2dpY1xuICAgICAgICAgIGlmIChmaWx0ZXJzTGlzdC5ldmVyeShmID0+IGNoZWNrQ29uZGl0aW9uKGYsIHRhYikpKSB7XG4gICAgICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIE5vIGZpbHRlcnMgLT4gTWF0Y2ggYWxsXG4gICAgICAgICAgbWF0Y2ggPSB0cnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoIW1hdGNoKSB7XG4gICAgICAgICAgcmV0dXJuIHsga2V5OiBudWxsLCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICAgICAgfVxuXG4gICAgICBjb25zdCBncm91cGluZ1J1bGVzTGlzdCA9IGFzQXJyYXk8R3JvdXBpbmdSdWxlPihjdXN0b20uZ3JvdXBpbmdSdWxlcyk7XG4gICAgICBpZiAoZ3JvdXBpbmdSdWxlc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgIGNvbnN0IG1vZGVzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZ3JvdXBpbmdSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXJ1bGUpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIGxldCB2YWwgPSBcIlwiO1xuICAgICAgICAgICAgICAgIGlmIChydWxlLnNvdXJjZSA9PT0gJ2ZpZWxkJykge1xuICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmF3ID0gZ2V0RmllbGRWYWx1ZSh0YWIsIHJ1bGUudmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgdmFsID0gcmF3ICE9PSB1bmRlZmluZWQgJiYgcmF3ICE9PSBudWxsID8gU3RyaW5nKHJhdykgOiBcIlwiO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICB2YWwgPSBydWxlLnZhbHVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh2YWwgJiYgcnVsZS50cmFuc2Zvcm0gJiYgcnVsZS50cmFuc2Zvcm0gIT09ICdub25lJykge1xuICAgICAgICAgICAgICAgICAgICB2YWwgPSBhcHBseVZhbHVlVHJhbnNmb3JtKHZhbCwgcnVsZS50cmFuc2Zvcm0sIHJ1bGUudHJhbnNmb3JtUGF0dGVybiwgcnVsZS50cmFuc2Zvcm1SZXBsYWNlbWVudCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHZhbCkge1xuICAgICAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChydWxlLndpbmRvd01vZGUpIG1vZGVzLnB1c2gocnVsZS53aW5kb3dNb2RlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgIGxvZ0RlYnVnKFwiRXJyb3IgYXBwbHlpbmcgZ3JvdXBpbmcgcnVsZXNcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIHJldHVybiB7IGtleTogcGFydHMuam9pbihcIiAtIFwiKSwgbW9kZTogcmVzb2x2ZVdpbmRvd01vZGUobW9kZXMpIH07XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7IGtleTogY3VzdG9tLmZhbGxiYWNrIHx8IFwiTWlzY1wiLCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICAgICAgfSBlbHNlIGlmIChjdXN0b20ucnVsZXMpIHtcbiAgICAgICAgICBjb25zdCByZXN1bHQgPSBldmFsdWF0ZUxlZ2FjeVJ1bGVzKGFzQXJyYXk8U3RyYXRlZ3lSdWxlPihjdXN0b20ucnVsZXMpLCB0YWIpO1xuICAgICAgICAgIGlmIChyZXN1bHQpIHJldHVybiB7IGtleTogcmVzdWx0LCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICAgICAgfVxuXG4gICAgICByZXR1cm4geyBrZXk6IGN1c3RvbS5mYWxsYmFjayB8fCBcIk1pc2NcIiwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgfVxuXG4gIC8vIEJ1aWx0LWluIHN0cmF0ZWdpZXNcbiAgbGV0IHNpbXBsZUtleTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIHN3aXRjaCAoc3RyYXRlZ3kpIHtcbiAgICBjYXNlIFwiZG9tYWluXCI6XG4gICAgY2FzZSBcImRvbWFpbl9mdWxsXCI6XG4gICAgICBzaW1wbGVLZXkgPSBkb21haW5Gcm9tVXJsKHRhYi51cmwpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInRvcGljXCI6XG4gICAgICBzaW1wbGVLZXkgPSBzZW1hbnRpY0J1Y2tldCh0YWIudGl0bGUsIHRhYi51cmwpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcImxpbmVhZ2VcIjpcbiAgICAgIHNpbXBsZUtleSA9IG5hdmlnYXRpb25LZXkodGFiKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJjb250ZXh0XCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIuY29udGV4dCB8fCBcIlVuY2F0ZWdvcml6ZWRcIjtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJwaW5uZWRcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi5waW5uZWQgPyBcInBpbm5lZFwiIDogXCJ1bnBpbm5lZFwiO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcImFnZVwiOlxuICAgICAgc2ltcGxlS2V5ID0gZ2V0UmVjZW5jeUxhYmVsKHRhYi5sYXN0QWNjZXNzZWQgPz8gMCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwidXJsXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIudXJsO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInRpdGxlXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIudGl0bGU7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwicmVjZW5jeVwiOlxuICAgICAgc2ltcGxlS2V5ID0gU3RyaW5nKHRhYi5sYXN0QWNjZXNzZWQgPz8gMCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwibmVzdGluZ1wiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQgPyBcImNoaWxkXCIgOiBcInJvb3RcIjtcbiAgICAgIGJyZWFrO1xuICAgIGRlZmF1bHQ6XG4gICAgICAgIGNvbnN0IHZhbCA9IGdldEZpZWxkVmFsdWUodGFiLCBzdHJhdGVneSk7XG4gICAgICAgIGlmICh2YWwgIT09IHVuZGVmaW5lZCAmJiB2YWwgIT09IG51bGwpIHtcbiAgICAgICAgICAgIHNpbXBsZUtleSA9IFN0cmluZyh2YWwpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2ltcGxlS2V5ID0gXCJVbmtub3duXCI7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gIH1cbiAgcmV0dXJuIHsga2V5OiBzaW1wbGVLZXksIG1vZGU6IFwiY3VycmVudFwiIH07XG59O1xuXG5leHBvcnQgY29uc3QgZ3JvdXBpbmdLZXkgPSAodGFiOiBUYWJNZXRhZGF0YSwgc3RyYXRlZ3k6IEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcpOiBzdHJpbmcgfCBudWxsID0+IHtcbiAgICByZXR1cm4gZ2V0R3JvdXBpbmdSZXN1bHQodGFiLCBzdHJhdGVneSkua2V5O1xufTtcblxuZnVuY3Rpb24gaXNDb250ZXh0RmllbGQoZmllbGQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBmaWVsZCA9PT0gJ2NvbnRleHQnIHx8IGZpZWxkID09PSAnZ2VucmUnIHx8IGZpZWxkID09PSAnc2l0ZU5hbWUnIHx8IGZpZWxkLnN0YXJ0c1dpdGgoJ2NvbnRleHREYXRhLicpO1xufVxuXG5leHBvcnQgY29uc3QgcmVxdWlyZXNDb250ZXh0QW5hbHlzaXMgPSAoc3RyYXRlZ3lJZHM6IChzdHJpbmcgfCBTb3J0aW5nU3RyYXRlZ3kpW10pOiBib29sZWFuID0+IHtcbiAgICAvLyBDaGVjayBpZiBcImNvbnRleHRcIiBzdHJhdGVneSBpcyBleHBsaWNpdGx5IHJlcXVlc3RlZFxuICAgIGlmIChzdHJhdGVneUlkcy5pbmNsdWRlcyhcImNvbnRleHRcIikpIHJldHVybiB0cnVlO1xuXG4gICAgY29uc3Qgc3RyYXRlZ2llcyA9IGdldFN0cmF0ZWdpZXMoY3VzdG9tU3RyYXRlZ2llcyk7XG4gICAgLy8gZmlsdGVyIG9ubHkgdGhvc2UgdGhhdCBtYXRjaCB0aGUgcmVxdWVzdGVkIElEc1xuICAgIGNvbnN0IGFjdGl2ZURlZnMgPSBzdHJhdGVnaWVzLmZpbHRlcihzID0+IHN0cmF0ZWd5SWRzLmluY2x1ZGVzKHMuaWQpKTtcblxuICAgIGZvciAoY29uc3QgZGVmIG9mIGFjdGl2ZURlZnMpIHtcbiAgICAgICAgLy8gSWYgaXQncyBhIGJ1aWx0LWluIHN0cmF0ZWd5IHRoYXQgbmVlZHMgY29udGV4dCAob25seSAnY29udGV4dCcgZG9lcylcbiAgICAgICAgaWYgKGRlZi5pZCA9PT0gJ2NvbnRleHQnKSByZXR1cm4gdHJ1ZTtcblxuICAgICAgICAvLyBJZiBpdCBpcyBhIGN1c3RvbSBzdHJhdGVneSAob3Igb3ZlcnJpZGVzIGJ1aWx0LWluKSwgY2hlY2sgaXRzIHJ1bGVzXG4gICAgICAgIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChjID0+IGMuaWQgPT09IGRlZi5pZCk7XG4gICAgICAgIGlmIChjdXN0b20pIHtcbiAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzTGlzdCA9IGFzQXJyYXk8R3JvdXBpbmdSdWxlPihjdXN0b20uZ3JvdXBpbmdSdWxlcyk7XG4gICAgICAgICAgICAgY29uc3Qgc29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KGN1c3RvbS5zb3J0aW5nUnVsZXMpO1xuICAgICAgICAgICAgIGNvbnN0IGdyb3VwU29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KGN1c3RvbS5ncm91cFNvcnRpbmdSdWxlcyk7XG4gICAgICAgICAgICAgY29uc3QgZmlsdGVyc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGN1c3RvbS5maWx0ZXJzKTtcbiAgICAgICAgICAgICBjb25zdCBmaWx0ZXJHcm91cHNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uW10+KGN1c3RvbS5maWx0ZXJHcm91cHMpO1xuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwUnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIHJ1bGUuc291cmNlID09PSAnZmllbGQnICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUudmFsdWUpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgcnVsZS5jb2xvciA9PT0gJ2ZpZWxkJyAmJiBydWxlLmNvbG9yRmllbGQgJiYgaXNDb250ZXh0RmllbGQocnVsZS5jb2xvckZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIHNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBmaWx0ZXJzTGlzdCkge1xuICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBpc0NvbnRleHRGaWVsZChydWxlLmZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBncm91cCBvZiBmaWx0ZXJHcm91cHNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGNvbnN0IGdyb3VwUnVsZXMgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGdyb3VwKTtcbiAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwUnVsZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59O1xuIiwgImltcG9ydCB7IFNvcnRpbmdTdHJhdGVneSwgVGFiTWV0YWRhdGEsIEN1c3RvbVN0cmF0ZWd5LCBTb3J0aW5nUnVsZSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGRvbWFpbkZyb21VcmwsIHNlbWFudGljQnVja2V0LCBuYXZpZ2F0aW9uS2V5LCBncm91cGluZ0tleSwgZ2V0RmllbGRWYWx1ZSwgZ2V0Q3VzdG9tU3RyYXRlZ2llcyB9IGZyb20gXCIuL2dyb3VwaW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcblxuZXhwb3J0IGNvbnN0IHJlY2VuY3lTY29yZSA9ICh0YWI6IFRhYk1ldGFkYXRhKSA9PiB0YWIubGFzdEFjY2Vzc2VkID8/IDA7XG5leHBvcnQgY29uc3QgaGllcmFyY2h5U2NvcmUgPSAodGFiOiBUYWJNZXRhZGF0YSkgPT4gKHRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkID8gMSA6IDApO1xuZXhwb3J0IGNvbnN0IHBpbm5lZFNjb3JlID0gKHRhYjogVGFiTWV0YWRhdGEpID0+ICh0YWIucGlubmVkID8gMCA6IDEpO1xuXG5leHBvcnQgY29uc3Qgc29ydFRhYnMgPSAodGFiczogVGFiTWV0YWRhdGFbXSwgc3RyYXRlZ2llczogU29ydGluZ1N0cmF0ZWd5W10pOiBUYWJNZXRhZGF0YVtdID0+IHtcbiAgY29uc3Qgc2NvcmluZzogU29ydGluZ1N0cmF0ZWd5W10gPSBzdHJhdGVnaWVzLmxlbmd0aCA/IHN0cmF0ZWdpZXMgOiBbXCJwaW5uZWRcIiwgXCJyZWNlbmN5XCJdO1xuICByZXR1cm4gWy4uLnRhYnNdLnNvcnQoKGEsIGIpID0+IHtcbiAgICBmb3IgKGNvbnN0IHN0cmF0ZWd5IG9mIHNjb3JpbmcpIHtcbiAgICAgIGNvbnN0IGRpZmYgPSBjb21wYXJlQnkoc3RyYXRlZ3ksIGEsIGIpO1xuICAgICAgaWYgKGRpZmYgIT09IDApIHJldHVybiBkaWZmO1xuICAgIH1cbiAgICByZXR1cm4gYS5pZCAtIGIuaWQ7XG4gIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IGNvbXBhcmVCeSA9IChzdHJhdGVneTogU29ydGluZ1N0cmF0ZWd5IHwgc3RyaW5nLCBhOiBUYWJNZXRhZGF0YSwgYjogVGFiTWV0YWRhdGEpOiBudW1iZXIgPT4ge1xuICAvLyAxLiBDaGVjayBDdXN0b20gU3RyYXRlZ2llcyBmb3IgU29ydGluZyBSdWxlc1xuICBjb25zdCBjdXN0b21TdHJhdHMgPSBnZXRDdXN0b21TdHJhdGVnaWVzKCk7XG4gIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0cy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3kpO1xuICBpZiAoY3VzdG9tKSB7XG4gICAgICBjb25zdCBzb3J0UnVsZXNMaXN0ID0gYXNBcnJheTxTb3J0aW5nUnVsZT4oY3VzdG9tLnNvcnRpbmdSdWxlcyk7XG4gICAgICBpZiAoc29ydFJ1bGVzTGlzdC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgLy8gRXZhbHVhdGUgY3VzdG9tIHNvcnRpbmcgcnVsZXMgaW4gb3JkZXJcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2Ygc29ydFJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IHZhbEEgPSBnZXRGaWVsZFZhbHVlKGEsIHJ1bGUuZmllbGQpO1xuICAgICAgICAgICAgICAgICAgY29uc3QgdmFsQiA9IGdldEZpZWxkVmFsdWUoYiwgcnVsZS5maWVsZCk7XG5cbiAgICAgICAgICAgICAgICAgIGxldCByZXN1bHQgPSAwO1xuICAgICAgICAgICAgICAgICAgaWYgKHZhbEEgPCB2YWxCKSByZXN1bHQgPSAtMTtcbiAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKHZhbEEgPiB2YWxCKSByZXN1bHQgPSAxO1xuXG4gICAgICAgICAgICAgICAgICBpZiAocmVzdWx0ICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJ1bGUub3JkZXIgPT09ICdkZXNjJyA/IC1yZXN1bHQgOiByZXN1bHQ7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgIGxvZ0RlYnVnKFwiRXJyb3IgZXZhbHVhdGluZyBjdXN0b20gc29ydGluZyBydWxlc1wiLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIElmIGFsbCBydWxlcyBlcXVhbCwgY29udGludWUgdG8gbmV4dCBzdHJhdGVneSAocmV0dXJuIDApXG4gICAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9XG4gIH1cblxuICAvLyAyLiBCdWlsdC1pbiBvciBmYWxsYmFja1xuICBzd2l0Y2ggKHN0cmF0ZWd5KSB7XG4gICAgY2FzZSBcInJlY2VuY3lcIjpcbiAgICAgIHJldHVybiAoYi5sYXN0QWNjZXNzZWQgPz8gMCkgLSAoYS5sYXN0QWNjZXNzZWQgPz8gMCk7XG4gICAgY2FzZSBcIm5lc3RpbmdcIjogLy8gRm9ybWVybHkgaGllcmFyY2h5XG4gICAgICByZXR1cm4gaGllcmFyY2h5U2NvcmUoYSkgLSBoaWVyYXJjaHlTY29yZShiKTtcbiAgICBjYXNlIFwicGlubmVkXCI6XG4gICAgICByZXR1cm4gcGlubmVkU2NvcmUoYSkgLSBwaW5uZWRTY29yZShiKTtcbiAgICBjYXNlIFwidGl0bGVcIjpcbiAgICAgIHJldHVybiBhLnRpdGxlLmxvY2FsZUNvbXBhcmUoYi50aXRsZSk7XG4gICAgY2FzZSBcInVybFwiOlxuICAgICAgcmV0dXJuIGEudXJsLmxvY2FsZUNvbXBhcmUoYi51cmwpO1xuICAgIGNhc2UgXCJjb250ZXh0XCI6XG4gICAgICByZXR1cm4gKGEuY29udGV4dCA/PyBcIlwiKS5sb2NhbGVDb21wYXJlKGIuY29udGV4dCA/PyBcIlwiKTtcbiAgICBjYXNlIFwiZG9tYWluXCI6XG4gICAgY2FzZSBcImRvbWFpbl9mdWxsXCI6XG4gICAgICByZXR1cm4gZG9tYWluRnJvbVVybChhLnVybCkubG9jYWxlQ29tcGFyZShkb21haW5Gcm9tVXJsKGIudXJsKSk7XG4gICAgY2FzZSBcInRvcGljXCI6XG4gICAgICByZXR1cm4gc2VtYW50aWNCdWNrZXQoYS50aXRsZSwgYS51cmwpLmxvY2FsZUNvbXBhcmUoc2VtYW50aWNCdWNrZXQoYi50aXRsZSwgYi51cmwpKTtcbiAgICBjYXNlIFwibGluZWFnZVwiOlxuICAgICAgcmV0dXJuIG5hdmlnYXRpb25LZXkoYSkubG9jYWxlQ29tcGFyZShuYXZpZ2F0aW9uS2V5KGIpKTtcbiAgICBjYXNlIFwiYWdlXCI6XG4gICAgICAvLyBSZXZlcnNlIGFscGhhYmV0aWNhbCBmb3IgYWdlIGJ1Y2tldHMgKFRvZGF5IDwgWWVzdGVyZGF5KSwgcm91Z2ggYXBwcm94XG4gICAgICByZXR1cm4gKGdyb3VwaW5nS2V5KGEsIFwiYWdlXCIpIHx8IFwiXCIpLmxvY2FsZUNvbXBhcmUoZ3JvdXBpbmdLZXkoYiwgXCJhZ2VcIikgfHwgXCJcIik7XG4gICAgZGVmYXVsdDpcbiAgICAgIC8vIENoZWNrIGlmIGl0J3MgYSBnZW5lcmljIGZpZWxkIGZpcnN0XG4gICAgICBjb25zdCB2YWxBID0gZ2V0RmllbGRWYWx1ZShhLCBzdHJhdGVneSk7XG4gICAgICBjb25zdCB2YWxCID0gZ2V0RmllbGRWYWx1ZShiLCBzdHJhdGVneSk7XG5cbiAgICAgIGlmICh2YWxBICE9PSB1bmRlZmluZWQgJiYgdmFsQiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgaWYgKHZhbEEgPCB2YWxCKSByZXR1cm4gLTE7XG4gICAgICAgICAgaWYgKHZhbEEgPiB2YWxCKSByZXR1cm4gMTtcbiAgICAgICAgICByZXR1cm4gMDtcbiAgICAgIH1cblxuICAgICAgLy8gRmFsbGJhY2sgZm9yIGN1c3RvbSBzdHJhdGVnaWVzIGdyb3VwaW5nIGtleSAoaWYgdXNpbmcgY3VzdG9tIHN0cmF0ZWd5IGFzIHNvcnRpbmcgYnV0IG5vIHNvcnRpbmcgcnVsZXMgZGVmaW5lZClcbiAgICAgIC8vIG9yIHVuaGFuZGxlZCBidWlsdC1pbnNcbiAgICAgIHJldHVybiAoZ3JvdXBpbmdLZXkoYSwgc3RyYXRlZ3kpIHx8IFwiXCIpLmxvY2FsZUNvbXBhcmUoZ3JvdXBpbmdLZXkoYiwgc3RyYXRlZ3kpIHx8IFwiXCIpO1xuICB9XG59O1xuIiwgImltcG9ydCB7XG4gIEFwcGx5R3JvdXBpbmdQYXlsb2FkLFxuICBHcm91cGluZ1NlbGVjdGlvbixcbiAgUHJlZmVyZW5jZXMsXG4gIFJ1bnRpbWVNZXNzYWdlLFxuICBSdW50aW1lUmVzcG9uc2UsXG4gIFNhdmVkU3RhdGUsXG4gIFNvcnRpbmdTdHJhdGVneSxcbiAgVGFiR3JvdXAsXG4gIFRhYk1ldGFkYXRhXG59IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGZldGNoTG9jYWxTdGF0ZSB9IGZyb20gXCIuL2xvY2FsU3RhdGUuanNcIjtcblxuZXhwb3J0IGNvbnN0IHNlbmRNZXNzYWdlID0gYXN5bmMgPFREYXRhPih0eXBlOiBSdW50aW1lTWVzc2FnZVtcInR5cGVcIl0sIHBheWxvYWQ/OiBhbnkpOiBQcm9taXNlPFJ1bnRpbWVSZXNwb25zZTxURGF0YT4+ID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlLCBwYXlsb2FkIH0sIChyZXNwb25zZSkgPT4ge1xuICAgICAgaWYgKGNocm9tZS5ydW50aW1lLmxhc3RFcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiUnVudGltZSBlcnJvcjpcIiwgY2hyb21lLnJ1bnRpbWUubGFzdEVycm9yKTtcbiAgICAgICAgcmVzb2x2ZSh7IG9rOiBmYWxzZSwgZXJyb3I6IGNocm9tZS5ydW50aW1lLmxhc3RFcnJvci5tZXNzYWdlIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzb2x2ZShyZXNwb25zZSB8fCB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiTm8gcmVzcG9uc2UgZnJvbSBiYWNrZ3JvdW5kXCIgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0pO1xufTtcblxuZXhwb3J0IHR5cGUgVGFiV2l0aEdyb3VwID0gVGFiTWV0YWRhdGEgJiB7XG4gIGdyb3VwTGFiZWw/OiBzdHJpbmc7XG4gIGdyb3VwQ29sb3I/OiBzdHJpbmc7XG4gIHJlYXNvbj86IHN0cmluZztcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgV2luZG93VmlldyB7XG4gIGlkOiBudW1iZXI7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIHRhYnM6IFRhYldpdGhHcm91cFtdO1xuICB0YWJDb3VudDogbnVtYmVyO1xuICBncm91cENvdW50OiBudW1iZXI7XG4gIHBpbm5lZENvdW50OiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBJQ09OUyA9IHtcbiAgYWN0aXZlOiBgPHN2ZyB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBvbHlnb24gcG9pbnRzPVwiMyAxMSAyMiAyIDEzIDIxIDExIDEzIDMgMTFcIj48L3BvbHlnb24+PC9zdmc+YCxcbiAgaGlkZTogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwYXRoIGQ9XCJNMTcuOTQgMTcuOTRBMTAuMDcgMTAuMDcgMCAwIDEgMTIgMjBjLTcgMC0xMS04LTExLThhMTguNDUgMTguNDUgMCAwIDEgNS4wNi01Ljk0TTkuOSA0LjI0QTkuMTIgOS4xMiAwIDAgMSAxMiA0YzcgMCAxMSA4IDExIDhhMTguNSAxOC41IDAgMCAxLTIuMTYgMy4xOW0tNi43Mi0xLjA3YTMgMyAwIDEgMS00LjI0LTQuMjRcIj48L3BhdGg+PGxpbmUgeDE9XCIxXCIgeTE9XCIxXCIgeDI9XCIyM1wiIHkyPVwiMjNcIj48L2xpbmU+PC9zdmc+YCxcbiAgc2hvdzogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwYXRoIGQ9XCJNMSAxMnM0LTggMTEtOCAxMSA4IDExIDgtNCA4LTExIDgtMTEtOC0xMS04LTExLTh6XCI+PC9wYXRoPjxjaXJjbGUgY3g9XCIxMlwiIGN5PVwiMTJcIiByPVwiM1wiPjwvY2lyY2xlPjwvc3ZnPmAsXG4gIGZvY3VzOiBgPHN2ZyB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PGNpcmNsZSBjeD1cIjEyXCIgY3k9XCIxMlwiIHI9XCIxMFwiPjwvY2lyY2xlPjxjaXJjbGUgY3g9XCIxMlwiIGN5PVwiMTJcIiByPVwiNlwiPjwvY2lyY2xlPjxjaXJjbGUgY3g9XCIxMlwiIGN5PVwiMTJcIiByPVwiMlwiPjwvY2lyY2xlPjwvc3ZnPmAsXG4gIGNsb3NlOiBgPHN2ZyB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PGxpbmUgeDE9XCIxOFwiIHkxPVwiNlwiIHgyPVwiNlwiIHkyPVwiMThcIj48L2xpbmU+PGxpbmUgeDE9XCI2XCIgeTE9XCI2XCIgeDI9XCIxOFwiIHkyPVwiMThcIj48L2xpbmU+PC9zdmc+YCxcbiAgdW5ncm91cDogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxjaXJjbGUgY3g9XCIxMlwiIGN5PVwiMTJcIiByPVwiMTBcIj48L2NpcmNsZT48bGluZSB4MT1cIjhcIiB5MT1cIjEyXCIgeDI9XCIxNlwiIHkyPVwiMTJcIj48L2xpbmU+PC9zdmc+YCxcbiAgZGVmYXVsdEZpbGU6IGA8c3ZnIHdpZHRoPVwiMjRcIiBoZWlnaHQ9XCIyNFwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cGF0aCBkPVwiTTE0IDJINmEyIDIgMCAwIDAtMiAydjE2YTIgMiAwIDAgMCAyIDJoMTJhMiAyIDAgMCAwIDItMlY4elwiPjwvcGF0aD48cG9seWxpbmUgcG9pbnRzPVwiMTQgMiAxNCA4IDIwIDhcIj48L3BvbHlsaW5lPjxsaW5lIHgxPVwiMTZcIiB5MT1cIjEzXCIgeDI9XCI4XCIgeTI9XCIxM1wiPjwvbGluZT48bGluZSB4MT1cIjE2XCIgeTE9XCIxN1wiIHgyPVwiOFwiIHkyPVwiMTdcIj48L2xpbmU+PHBvbHlsaW5lIHBvaW50cz1cIjEwIDkgOSA5IDggOVwiPjwvcG9seWxpbmU+PC9zdmc+YCxcbiAgYXV0b1J1bjogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwb2x5Z29uIHBvaW50cz1cIjEzIDIgMyAxNCAxMiAxNCAxMSAyMiAyMSAxMCAxMiAxMCAxMyAyXCI+PC9wb2x5Z29uPjwvc3ZnPmBcbn07XG5cbmV4cG9ydCBjb25zdCBHUk9VUF9DT0xPUlM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gIGdyZXk6IFwiIzY0NzQ4YlwiLFxuICBibHVlOiBcIiMzYjgyZjZcIixcbiAgcmVkOiBcIiNlZjQ0NDRcIixcbiAgeWVsbG93OiBcIiNlYWIzMDhcIixcbiAgZ3JlZW46IFwiIzIyYzU1ZVwiLFxuICBwaW5rOiBcIiNlYzQ4OTlcIixcbiAgcHVycGxlOiBcIiNhODU1ZjdcIixcbiAgY3lhbjogXCIjMDZiNmQ0XCIsXG4gIG9yYW5nZTogXCIjZjk3MzE2XCJcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRHcm91cENvbG9yID0gKG5hbWU6IHN0cmluZykgPT4gR1JPVVBfQ09MT1JTW25hbWVdIHx8IFwiI2NiZDVlMVwiO1xuXG5leHBvcnQgY29uc3QgZmV0Y2hTdGF0ZSA9IGFzeW5jICgpID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHNlbmRNZXNzYWdlPHsgZ3JvdXBzOiBUYWJHcm91cFtdOyBwcmVmZXJlbmNlczogUHJlZmVyZW5jZXMgfT4oXCJnZXRTdGF0ZVwiKTtcbiAgICBpZiAocmVzcG9uc2Uub2sgJiYgcmVzcG9uc2UuZGF0YSkge1xuICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgIH1cbiAgICBjb25zb2xlLndhcm4oXCJmZXRjaFN0YXRlIGZhaWxlZCwgdXNpbmcgZmFsbGJhY2s6XCIsIHJlc3BvbnNlLmVycm9yKTtcbiAgICByZXR1cm4gYXdhaXQgZmV0Y2hMb2NhbFN0YXRlKCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBjb25zb2xlLndhcm4oXCJmZXRjaFN0YXRlIHRocmV3IGV4Y2VwdGlvbiwgdXNpbmcgZmFsbGJhY2s6XCIsIGUpO1xuICAgIHJldHVybiBhd2FpdCBmZXRjaExvY2FsU3RhdGUoKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGFwcGx5R3JvdXBpbmcgPSBhc3luYyAocGF5bG9hZDogQXBwbHlHcm91cGluZ1BheWxvYWQpID0+IHtcbiAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6IFwiYXBwbHlHcm91cGluZ1wiLCBwYXlsb2FkIH0pO1xuICByZXR1cm4gcmVzcG9uc2UgYXMgUnVudGltZVJlc3BvbnNlPHVua25vd24+O1xufTtcblxuZXhwb3J0IGNvbnN0IGFwcGx5U29ydGluZyA9IGFzeW5jIChwYXlsb2FkOiBBcHBseUdyb3VwaW5nUGF5bG9hZCkgPT4ge1xuICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogXCJhcHBseVNvcnRpbmdcIiwgcGF5bG9hZCB9KTtcbiAgcmV0dXJuIHJlc3BvbnNlIGFzIFJ1bnRpbWVSZXNwb25zZTx1bmtub3duPjtcbn07XG5cbmV4cG9ydCBjb25zdCBtYXBXaW5kb3dzID0gKGdyb3VwczogVGFiR3JvdXBbXSwgd2luZG93VGl0bGVzOiBNYXA8bnVtYmVyLCBzdHJpbmc+KTogV2luZG93Vmlld1tdID0+IHtcbiAgY29uc3Qgd2luZG93cyA9IG5ldyBNYXA8bnVtYmVyLCBUYWJXaXRoR3JvdXBbXT4oKTtcblxuICBncm91cHMuZm9yRWFjaCgoZ3JvdXApID0+IHtcbiAgICBjb25zdCBpc1VuZ3JvdXBlZCA9IGdyb3VwLnJlYXNvbiA9PT0gXCJVbmdyb3VwZWRcIjtcbiAgICBncm91cC50YWJzLmZvckVhY2goKHRhYikgPT4ge1xuICAgICAgY29uc3QgZGVjb3JhdGVkOiBUYWJXaXRoR3JvdXAgPSB7XG4gICAgICAgIC4uLnRhYixcbiAgICAgICAgZ3JvdXBMYWJlbDogaXNVbmdyb3VwZWQgPyB1bmRlZmluZWQgOiBncm91cC5sYWJlbCxcbiAgICAgICAgZ3JvdXBDb2xvcjogaXNVbmdyb3VwZWQgPyB1bmRlZmluZWQgOiBncm91cC5jb2xvcixcbiAgICAgICAgcmVhc29uOiBncm91cC5yZWFzb25cbiAgICAgIH07XG4gICAgICBjb25zdCBleGlzdGluZyA9IHdpbmRvd3MuZ2V0KHRhYi53aW5kb3dJZCkgPz8gW107XG4gICAgICBleGlzdGluZy5wdXNoKGRlY29yYXRlZCk7XG4gICAgICB3aW5kb3dzLnNldCh0YWIud2luZG93SWQsIGV4aXN0aW5nKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgcmV0dXJuIEFycmF5LmZyb20od2luZG93cy5lbnRyaWVzKCkpXG4gICAgLm1hcDxXaW5kb3dWaWV3PigoW2lkLCB0YWJzXSkgPT4ge1xuICAgICAgY29uc3QgZ3JvdXBDb3VudCA9IG5ldyBTZXQodGFicy5tYXAoKHRhYikgPT4gdGFiLmdyb3VwTGFiZWwpLmZpbHRlcigobCk6IGwgaXMgc3RyaW5nID0+ICEhbCkpLnNpemU7XG4gICAgICBjb25zdCBwaW5uZWRDb3VudCA9IHRhYnMuZmlsdGVyKCh0YWIpID0+IHRhYi5waW5uZWQpLmxlbmd0aDtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGlkLFxuICAgICAgICB0aXRsZTogd2luZG93VGl0bGVzLmdldChpZCkgPz8gYFdpbmRvdyAke2lkfWAsXG4gICAgICAgIHRhYnMsXG4gICAgICAgIHRhYkNvdW50OiB0YWJzLmxlbmd0aCxcbiAgICAgICAgZ3JvdXBDb3VudCxcbiAgICAgICAgcGlubmVkQ291bnRcbiAgICAgIH07XG4gICAgfSlcbiAgICAuc29ydCgoYSwgYikgPT4gYS5pZCAtIGIuaWQpO1xufTtcblxuZXhwb3J0IGNvbnN0IGZvcm1hdERvbWFpbiA9ICh1cmw6IHN0cmluZykgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHBhcnNlZCA9IG5ldyBVUkwodXJsKTtcbiAgICByZXR1cm4gcGFyc2VkLmhvc3RuYW1lLnJlcGxhY2UoL153d3dcXC4vLCBcIlwiKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICByZXR1cm4gdXJsO1xuICB9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RHJhZ0FmdGVyRWxlbWVudChjb250YWluZXI6IEhUTUxFbGVtZW50LCB5OiBudW1iZXIsIHNlbGVjdG9yOiBzdHJpbmcpIHtcbiAgY29uc3QgZHJhZ2dhYmxlRWxlbWVudHMgPSBBcnJheS5mcm9tKGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKSk7XG5cbiAgcmV0dXJuIGRyYWdnYWJsZUVsZW1lbnRzLnJlZHVjZSgoY2xvc2VzdCwgY2hpbGQpID0+IHtcbiAgICBjb25zdCBib3ggPSBjaGlsZC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICBjb25zdCBvZmZzZXQgPSB5IC0gYm94LnRvcCAtIGJveC5oZWlnaHQgLyAyO1xuICAgIGlmIChvZmZzZXQgPCAwICYmIG9mZnNldCA+IGNsb3Nlc3Qub2Zmc2V0KSB7XG4gICAgICByZXR1cm4geyBvZmZzZXQ6IG9mZnNldCwgZWxlbWVudDogY2hpbGQgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGNsb3Nlc3Q7XG4gICAgfVxuICB9LCB7IG9mZnNldDogTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZLCBlbGVtZW50OiBudWxsIGFzIEVsZW1lbnQgfCBudWxsIH0pLmVsZW1lbnQ7XG59XG4iLCAiaW1wb3J0IHsgZXNjYXBlSHRtbCB9IGZyb20gXCIuLi8uLi9zaGFyZWQvdXRpbHMuanNcIjtcbmltcG9ydCB7IGdldERyYWdBZnRlckVsZW1lbnQgfSBmcm9tIFwiLi4vY29tbW9uLmpzXCI7XG5pbXBvcnQgeyBhcHBTdGF0ZSB9IGZyb20gXCIuL3N0YXRlLmpzXCI7XG5pbXBvcnQgeyBHRU5FUkFfUkVHSVNUUlkgfSBmcm9tIFwiLi4vLi4vYmFja2dyb3VuZC9leHRyYWN0aW9uL2dlbmVyYVJlZ2lzdHJ5LmpzXCI7XG5pbXBvcnQge1xuICBkb21haW5Gcm9tVXJsLFxuICBzZW1hbnRpY0J1Y2tldCxcbiAgbmF2aWdhdGlvbktleSxcbiAgZ3JvdXBpbmdLZXlcbn0gZnJvbSBcIi4uLy4uL2JhY2tncm91bmQvZ3JvdXBpbmdTdHJhdGVnaWVzLmpzXCI7XG5pbXBvcnQge1xuICByZWNlbmN5U2NvcmUsXG4gIGhpZXJhcmNoeVNjb3JlLFxuICBwaW5uZWRTY29yZSxcbiAgY29tcGFyZUJ5XG59IGZyb20gXCIuLi8uLi9iYWNrZ3JvdW5kL3NvcnRpbmdTdHJhdGVnaWVzLmpzXCI7XG5pbXBvcnQgeyBTVFJBVEVHSUVTLCBTdHJhdGVneURlZmluaXRpb24sIGdldFN0cmF0ZWdpZXMgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL3N0cmF0ZWd5UmVnaXN0cnkuanNcIjtcblxuZXhwb3J0IGZ1bmN0aW9uIHNob3dNb2RhbCh0aXRsZTogc3RyaW5nLCBjb250ZW50OiBIVE1MRWxlbWVudCB8IHN0cmluZykge1xuICAgIGNvbnN0IG1vZGFsT3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIG1vZGFsT3ZlcmxheS5jbGFzc05hbWUgPSAnbW9kYWwtb3ZlcmxheSc7XG4gICAgbW9kYWxPdmVybGF5LmlubmVySFRNTCA9IGBcbiAgICAgICAgPGRpdiBjbGFzcz1cIm1vZGFsXCI+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwibW9kYWwtaGVhZGVyXCI+XG4gICAgICAgICAgICAgICAgPGgzPiR7ZXNjYXBlSHRtbCh0aXRsZSl9PC9oMz5cbiAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwibW9kYWwtY2xvc2VcIj4mdGltZXM7PC9idXR0b24+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJtb2RhbC1jb250ZW50XCI+PC9kaXY+XG4gICAgICAgIDwvZGl2PlxuICAgIGA7XG5cbiAgICBjb25zdCBjb250ZW50Q29udGFpbmVyID0gbW9kYWxPdmVybGF5LnF1ZXJ5U2VsZWN0b3IoJy5tb2RhbC1jb250ZW50JykgYXMgSFRNTEVsZW1lbnQ7XG4gICAgaWYgKHR5cGVvZiBjb250ZW50ID09PSAnc3RyaW5nJykge1xuICAgICAgICBjb250ZW50Q29udGFpbmVyLmlubmVySFRNTCA9IGNvbnRlbnQ7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgY29udGVudENvbnRhaW5lci5hcHBlbmRDaGlsZChjb250ZW50KTtcbiAgICB9XG5cbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG1vZGFsT3ZlcmxheSk7XG5cbiAgICBjb25zdCBjbG9zZUJ0biA9IG1vZGFsT3ZlcmxheS5xdWVyeVNlbGVjdG9yKCcubW9kYWwtY2xvc2UnKTtcbiAgICBjbG9zZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlQ2hpbGQobW9kYWxPdmVybGF5KTtcbiAgICB9KTtcblxuICAgIG1vZGFsT3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgICAgIGlmIChlLnRhcmdldCA9PT0gbW9kYWxPdmVybGF5KSB7XG4gICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZChtb2RhbE92ZXJsYXkpO1xuICAgICAgICB9XG4gICAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGREbkRMaXN0ZW5lcnMocm93OiBIVE1MRWxlbWVudCwgY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuICByb3cuYWRkRXZlbnRMaXN0ZW5lcignZHJhZ3N0YXJ0JywgKGUpID0+IHtcbiAgICByb3cuY2xhc3NMaXN0LmFkZCgnZHJhZ2dpbmcnKTtcbiAgICBpZiAoZS5kYXRhVHJhbnNmZXIpIHtcbiAgICAgICAgZS5kYXRhVHJhbnNmZXIuZWZmZWN0QWxsb3dlZCA9ICdtb3ZlJztcbiAgICAgICAgLy8gU2V0IGEgdHJhbnNwYXJlbnQgaW1hZ2Ugb3Igc2ltaWxhciBpZiBkZXNpcmVkLCBidXQgZGVmYXVsdCBpcyB1c3VhbGx5IGZpbmVcbiAgICB9XG4gIH0pO1xuXG4gIHJvdy5hZGRFdmVudExpc3RlbmVyKCdkcmFnZW5kJywgKCkgPT4ge1xuICAgIHJvdy5jbGFzc0xpc3QucmVtb3ZlKCdkcmFnZ2luZycpO1xuICB9KTtcblxuICAvLyBUaGUgY29udGFpbmVyIGhhbmRsZXMgdGhlIGRyb3Agem9uZSBsb2dpYyB2aWEgZHJhZ292ZXJcbiAgY29udGFpbmVyLmFkZEV2ZW50TGlzdGVuZXIoJ2RyYWdvdmVyJywgKGUpID0+IHtcbiAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgY29uc3QgYWZ0ZXJFbGVtZW50ID0gZ2V0RHJhZ0FmdGVyRWxlbWVudChjb250YWluZXIsIGUuY2xpZW50WSwgJy5zdHJhdGVneS1yb3c6bm90KC5kcmFnZ2luZyknKTtcbiAgICBjb25zdCBkcmFnZ2FibGUgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcignLmRyYWdnaW5nJyk7XG4gICAgaWYgKGRyYWdnYWJsZSkge1xuICAgICAgaWYgKGFmdGVyRWxlbWVudCA9PSBudWxsKSB7XG4gICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChkcmFnZ2FibGUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29udGFpbmVyLmluc2VydEJlZm9yZShkcmFnZ2FibGUsIGFmdGVyRWxlbWVudCk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNob3dTdHJhdGVneURldGFpbHModHlwZTogc3RyaW5nLCBuYW1lOiBzdHJpbmcpIHtcbiAgICBsZXQgY29udGVudCA9IFwiXCI7XG4gICAgbGV0IHRpdGxlID0gYCR7bmFtZX0gKCR7dHlwZX0pYDtcblxuICAgIGlmICh0eXBlID09PSAnZ3JvdXBpbmcnKSB7XG4gICAgICAgIGlmIChuYW1lID09PSAnZG9tYWluJykge1xuICAgICAgICAgICAgY29udGVudCA9IGBcbjxoMz5Mb2dpYzogRG9tYWluIEV4dHJhY3Rpb248L2gzPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwoZG9tYWluRnJvbVVybC50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+XG48aDM+TG9naWM6IEdyb3VwaW5nIEtleTwvaDM+XG48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChncm91cGluZ0tleS50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+XG4gICAgICAgICAgICBgO1xuICAgICAgICB9IGVsc2UgaWYgKG5hbWUgPT09ICd0b3BpYycpIHtcbiAgICAgICAgICAgIGNvbnRlbnQgPSBgXG48aDM+TG9naWM6IFNlbWFudGljIEJ1Y2tldGluZzwvaDM+XG48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChzZW1hbnRpY0J1Y2tldC50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+XG48aDM+TG9naWM6IEdyb3VwaW5nIEtleTwvaDM+XG48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChncm91cGluZ0tleS50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+XG4gICAgICAgICAgICBgO1xuICAgICAgICB9IGVsc2UgaWYgKG5hbWUgPT09ICdsaW5lYWdlJykge1xuICAgICAgICAgICAgY29udGVudCA9IGBcbjxoMz5Mb2dpYzogTmF2aWdhdGlvbiBLZXk8L2gzPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwobmF2aWdhdGlvbktleS50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+XG48aDM+TG9naWM6IEdyb3VwaW5nIEtleTwvaDM+XG48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChncm91cGluZ0tleS50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+XG4gICAgICAgICAgICBgO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIGN1c3RvbSBzdHJhdGVneSBkZXRhaWxzXG4gICAgICAgICAgICBjb25zdCBjdXN0b20gPSBhcHBTdGF0ZS5sb2NhbEN1c3RvbVN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IG5hbWUpO1xuICAgICAgICAgICAgaWYgKGN1c3RvbSkge1xuICAgICAgICAgICAgICAgIGNvbnRlbnQgPSBgXG48aDM+Q3VzdG9tIFN0cmF0ZWd5OiAke2VzY2FwZUh0bWwoY3VzdG9tLmxhYmVsKX08L2gzPlxuPHA+PGI+Q29uZmlndXJhdGlvbjo8L2I+PC9wPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwoSlNPTi5zdHJpbmdpZnkoY3VzdG9tLCBudWxsLCAyKSl9PC9jb2RlPjwvcHJlPlxuPGgzPkxvZ2ljOiBHcm91cGluZyBLZXk8L2gzPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwoZ3JvdXBpbmdLZXkudG9TdHJpbmcoKSl9PC9jb2RlPjwvcHJlPlxuICAgICAgICAgICAgICAgIGA7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnRlbnQgPSBgXG48aDM+TG9naWM6IEdyb3VwaW5nIEtleTwvaDM+XG48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChncm91cGluZ0tleS50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+XG4gICAgICAgICAgICAgICAgYDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3NvcnRpbmcnKSB7XG4gICAgICAgIGNvbnRlbnQgPSBgXG48aDM+TG9naWM6IENvbXBhcmlzb24gRnVuY3Rpb248L2gzPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwoY29tcGFyZUJ5LnRvU3RyaW5nKCkpfTwvY29kZT48L3ByZT5cbiAgICAgICAgYDtcblxuICAgICAgICBpZiAobmFtZSA9PT0gJ3JlY2VuY3knKSB7XG4gICAgICAgICAgICAgY29udGVudCArPSBgPGgzPkxvZ2ljOiBSZWNlbmN5IFNjb3JlPC9oMz48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChyZWNlbmN5U2NvcmUudG9TdHJpbmcoKSl9PC9jb2RlPjwvcHJlPmA7XG4gICAgICAgIH0gZWxzZSBpZiAobmFtZSA9PT0gJ25lc3RpbmcnKSB7XG4gICAgICAgICAgICAgY29udGVudCArPSBgPGgzPkxvZ2ljOiBIaWVyYXJjaHkgU2NvcmU8L2gzPjxwcmU+PGNvZGU+JHtlc2NhcGVIdG1sKGhpZXJhcmNoeVNjb3JlLnRvU3RyaW5nKCkpfTwvY29kZT48L3ByZT5gO1xuICAgICAgICB9IGVsc2UgaWYgKG5hbWUgPT09ICdwaW5uZWQnKSB7XG4gICAgICAgICAgICAgY29udGVudCArPSBgPGgzPkxvZ2ljOiBQaW5uZWQgU2NvcmU8L2gzPjxwcmU+PGNvZGU+JHtlc2NhcGVIdG1sKHBpbm5lZFNjb3JlLnRvU3RyaW5nKCkpfTwvY29kZT48L3ByZT5gO1xuICAgICAgICB9XG4gICAgfSBlbHNlIGlmICh0eXBlID09PSAncmVnaXN0cnknICYmIG5hbWUgPT09ICdnZW5lcmEnKSB7XG4gICAgICAgIGNvbnN0IGpzb24gPSBKU09OLnN0cmluZ2lmeShHRU5FUkFfUkVHSVNUUlksIG51bGwsIDIpO1xuICAgICAgICBjb250ZW50ID0gYFxuPGgzPkdlbmVyYSBSZWdpc3RyeSBEYXRhPC9oMz5cbjxwPk1hcHBpbmcgb2YgZG9tYWluIG5hbWVzIHRvIGNhdGVnb3JpZXMuPC9wPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwoanNvbil9PC9jb2RlPjwvcHJlPlxuICAgICAgICBgO1xuICAgIH1cblxuICAgIHNob3dNb2RhbCh0aXRsZSwgY29udGVudCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJBbGdvcml0aG1zVmlldygpIHtcbiAgY29uc3QgZ3JvdXBpbmdSZWYgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ3JvdXBpbmctcmVmJyk7XG4gIGNvbnN0IHNvcnRpbmdSZWYgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc29ydGluZy1yZWYnKTtcblxuICBpZiAoZ3JvdXBpbmdSZWYpIHtcbiAgICAgIC8vIFJlLXJlbmRlciBiZWNhdXNlIHN0cmF0ZWd5IGxpc3QgbWlnaHQgY2hhbmdlXG4gICAgICBjb25zdCBhbGxTdHJhdGVnaWVzOiBTdHJhdGVneURlZmluaXRpb25bXSA9IGdldFN0cmF0ZWdpZXMoYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzKTtcbiAgICAgIGNvbnN0IGdyb3VwaW5ncyA9IGFsbFN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gcy5pc0dyb3VwaW5nKTtcblxuICAgICAgZ3JvdXBpbmdSZWYuaW5uZXJIVE1MID0gZ3JvdXBpbmdzLm1hcChnID0+IHtcbiAgICAgICAgIGNvbnN0IGlzQ3VzdG9tID0gYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzLnNvbWUocyA9PiBzLmlkID09PSBnLmlkKTtcbiAgICAgICAgIGxldCBkZXNjID0gXCJCdWlsdC1pbiBzdHJhdGVneVwiO1xuICAgICAgICAgaWYgKGlzQ3VzdG9tKSBkZXNjID0gXCJDdXN0b20gc3RyYXRlZ3kgZGVmaW5lZCBieSBydWxlcy5cIjtcbiAgICAgICAgIGVsc2UgaWYgKGcuaWQgPT09ICdkb21haW4nKSBkZXNjID0gJ0dyb3VwcyB0YWJzIGJ5IHRoZWlyIGRvbWFpbiBuYW1lLic7XG4gICAgICAgICBlbHNlIGlmIChnLmlkID09PSAndG9waWMnKSBkZXNjID0gJ0dyb3VwcyBiYXNlZCBvbiBrZXl3b3JkcyBpbiB0aGUgdGl0bGUuJztcblxuICAgICAgICAgcmV0dXJuIGBcbiAgICAgICAgICA8ZGl2IGNsYXNzPVwic3RyYXRlZ3ktaXRlbVwiPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInN0cmF0ZWd5LW5hbWVcIj4ke2cubGFiZWx9ICgke2cuaWR9KSAke2lzQ3VzdG9tID8gJzxzcGFuIHN0eWxlPVwiY29sb3I6IGJsdWU7IGZvbnQtc2l6ZTogMC44ZW07XCI+Q3VzdG9tPC9zcGFuPicgOiAnJ308L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJzdHJhdGVneS1kZXNjXCI+JHtkZXNjfTwvZGl2PlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInN0cmF0ZWd5LXZpZXctYnRuXCIgZGF0YS10eXBlPVwiZ3JvdXBpbmdcIiBkYXRhLW5hbWU9XCIke2cuaWR9XCI+VmlldyBMb2dpYzwvYnV0dG9uPlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICBgO1xuICAgICAgfSkuam9pbignJyk7XG4gIH1cblxuICBpZiAoc29ydGluZ1JlZikge1xuICAgIC8vIFJlLXJlbmRlciBzb3J0aW5nIHN0cmF0ZWdpZXMgdG9vXG4gICAgY29uc3QgYWxsU3RyYXRlZ2llczogU3RyYXRlZ3lEZWZpbml0aW9uW10gPSBnZXRTdHJhdGVnaWVzKGFwcFN0YXRlLmxvY2FsQ3VzdG9tU3RyYXRlZ2llcyk7XG4gICAgY29uc3Qgc29ydGluZ3MgPSBhbGxTdHJhdGVnaWVzLmZpbHRlcihzID0+IHMuaXNTb3J0aW5nKTtcblxuICAgIHNvcnRpbmdSZWYuaW5uZXJIVE1MID0gc29ydGluZ3MubWFwKHMgPT4ge1xuICAgICAgICBsZXQgZGVzYyA9IFwiQnVpbHQtaW4gc29ydGluZ1wiO1xuICAgICAgICBpZiAocy5pZCA9PT0gJ3JlY2VuY3knKSBkZXNjID0gJ1NvcnRzIGJ5IGxhc3QgYWNjZXNzZWQgdGltZSAobW9zdCByZWNlbnQgZmlyc3QpLic7XG4gICAgICAgIGVsc2UgaWYgKHMuaWQgPT09ICduZXN0aW5nJykgZGVzYyA9ICdTb3J0cyBiYXNlZCBvbiBoaWVyYXJjaHkgKHJvb3RzIHZzIGNoaWxkcmVuKS4nO1xuICAgICAgICBlbHNlIGlmIChzLmlkID09PSAncGlubmVkJykgZGVzYyA9ICdLZWVwcyBwaW5uZWQgdGFicyBhdCB0aGUgYmVnaW5uaW5nIG9mIHRoZSBsaXN0Lic7XG5cbiAgICAgICAgcmV0dXJuIGBcbiAgICAgIDxkaXYgY2xhc3M9XCJzdHJhdGVneS1pdGVtXCI+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJzdHJhdGVneS1uYW1lXCI+JHtzLmxhYmVsfTwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzPVwic3RyYXRlZ3ktZGVzY1wiPiR7ZGVzY308L2Rpdj5cbiAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInN0cmF0ZWd5LXZpZXctYnRuXCIgZGF0YS10eXBlPVwic29ydGluZ1wiIGRhdGEtbmFtZT1cIiR7cy5pZH1cIj5WaWV3IExvZ2ljPC9idXR0b24+XG4gICAgICA8L2Rpdj5cbiAgICBgO1xuICAgIH0pLmpvaW4oJycpO1xuICB9XG5cbiAgY29uc3QgcmVnaXN0cnlSZWYgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncmVnaXN0cnktcmVmJyk7XG4gIGlmIChyZWdpc3RyeVJlZiAmJiByZWdpc3RyeVJlZi5jaGlsZHJlbi5sZW5ndGggPT09IDApIHtcbiAgICAgIHJlZ2lzdHJ5UmVmLmlubmVySFRNTCA9IGBcbiAgICAgICAgPGRpdiBjbGFzcz1cInN0cmF0ZWd5LWl0ZW1cIj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJzdHJhdGVneS1uYW1lXCI+R2VuZXJhIFJlZ2lzdHJ5PC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwic3RyYXRlZ3ktZGVzY1wiPlN0YXRpYyBsb29rdXAgdGFibGUgZm9yIGRvbWFpbiBjbGFzc2lmaWNhdGlvbiAoYXBwcm94ICR7T2JqZWN0LmtleXMoR0VORVJBX1JFR0lTVFJZKS5sZW5ndGh9IGVudHJpZXMpLjwvZGl2PlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInN0cmF0ZWd5LXZpZXctYnRuXCIgZGF0YS10eXBlPVwicmVnaXN0cnlcIiBkYXRhLW5hbWU9XCJnZW5lcmFcIj5WaWV3IFRhYmxlPC9idXR0b24+XG4gICAgICAgIDwvZGl2PlxuICAgICAgYDtcbiAgfVxufVxuIiwgImltcG9ydCB7IGFwcFN0YXRlIH0gZnJvbSBcIi4vc3RhdGUuanNcIjtcbmltcG9ydCB7IGdldE1hcHBlZFRhYnMgfSBmcm9tIFwiLi9kYXRhLmpzXCI7XG5pbXBvcnQgeyBsb2FkVGFicyB9IGZyb20gXCIuL3RhYnNUYWJsZS5qc1wiO1xuaW1wb3J0IHsgYWRkRG5ETGlzdGVuZXJzIH0gZnJvbSBcIi4vY29tcG9uZW50cy5qc1wiO1xuaW1wb3J0IHsgZ2V0U3RyYXRlZ2llcywgU3RyYXRlZ3lEZWZpbml0aW9uIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC9zdHJhdGVneVJlZ2lzdHJ5LmpzXCI7XG5pbXBvcnQgeyBzb3J0VGFicyB9IGZyb20gXCIuLi8uLi9iYWNrZ3JvdW5kL3NvcnRpbmdTdHJhdGVnaWVzLmpzXCI7XG5pbXBvcnQgeyBncm91cFRhYnMgfSBmcm9tIFwiLi4vLi4vYmFja2dyb3VuZC9ncm91cGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IFNvcnRpbmdTdHJhdGVneSB9IGZyb20gXCIuLi8uLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGVzY2FwZUh0bWwgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBydW5TaW11bGF0aW9uKCkge1xuICBjb25zdCBncm91cGluZ0xpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2ltLWdyb3VwaW5nLWxpc3QnKTtcbiAgY29uc3Qgc29ydGluZ0xpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2ltLXNvcnRpbmctbGlzdCcpO1xuICBjb25zdCByZXN1bHRDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2ltUmVzdWx0cycpO1xuXG4gIGlmICghZ3JvdXBpbmdMaXN0IHx8ICFzb3J0aW5nTGlzdCB8fCAhcmVzdWx0Q29udGFpbmVyKSByZXR1cm47XG5cbiAgY29uc3QgZ3JvdXBpbmdTdHJhdHMgPSBnZXRFbmFibGVkU3RyYXRlZ2llc0Zyb21VSShncm91cGluZ0xpc3QpO1xuICBjb25zdCBzb3J0aW5nU3RyYXRzID0gZ2V0RW5hYmxlZFN0cmF0ZWdpZXNGcm9tVUkoc29ydGluZ0xpc3QpO1xuXG4gIC8vIFByZXBhcmUgZGF0YVxuICBsZXQgdGFicyA9IGdldE1hcHBlZFRhYnMoKTtcblxuICAvLyAxLiBTb3J0XG4gIGlmIChzb3J0aW5nU3RyYXRzLmxlbmd0aCA+IDApIHtcbiAgICB0YWJzID0gc29ydFRhYnModGFicywgc29ydGluZ1N0cmF0cyk7XG4gIH1cblxuICAvLyAyLiBHcm91cFxuICBjb25zdCBncm91cHMgPSBncm91cFRhYnModGFicywgZ3JvdXBpbmdTdHJhdHMpO1xuXG4gIC8vIDMuIFJlbmRlclxuICBpZiAoZ3JvdXBzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmVzdWx0Q29udGFpbmVyLmlubmVySFRNTCA9ICc8cD5ObyBncm91cHMgY3JlYXRlZCAoYXJlIHRoZXJlIGFueSB0YWJzPykuPC9wPic7XG4gICAgICByZXR1cm47XG4gIH1cblxuICByZXN1bHRDb250YWluZXIuaW5uZXJIVE1MID0gZ3JvdXBzLm1hcChncm91cCA9PiBgXG4gICAgPGRpdiBjbGFzcz1cImdyb3VwLXJlc3VsdFwiPlxuICAgICAgPGRpdiBjbGFzcz1cImdyb3VwLWhlYWRlclwiIHN0eWxlPVwiYm9yZGVyLWxlZnQ6IDVweCBzb2xpZCAke2dyb3VwLmNvbG9yfVwiPlxuICAgICAgICA8c3Bhbj4ke2VzY2FwZUh0bWwoZ3JvdXAubGFiZWwgfHwgJ1VuZ3JvdXBlZCcpfTwvc3Bhbj5cbiAgICAgICAgPHNwYW4gY2xhc3M9XCJncm91cC1tZXRhXCI+JHtncm91cC50YWJzLmxlbmd0aH0gdGFicyAmYnVsbDsgUmVhc29uOiAke2VzY2FwZUh0bWwoZ3JvdXAucmVhc29uKX08L3NwYW4+XG4gICAgICA8L2Rpdj5cbiAgICAgIDx1bCBjbGFzcz1cImdyb3VwLXRhYnNcIj5cbiAgICAgICAgJHtncm91cC50YWJzLm1hcCh0YWIgPT4gYFxuICAgICAgICAgIDxsaSBjbGFzcz1cImdyb3VwLXRhYi1pdGVtXCI+XG4gICAgICAgICAgICAke3RhYi5mYXZJY29uVXJsID8gYDxpbWcgc3JjPVwiJHtlc2NhcGVIdG1sKHRhYi5mYXZJY29uVXJsKX1cIiBjbGFzcz1cInRhYi1pY29uXCIgb25lcnJvcj1cInRoaXMuc3R5bGUuZGlzcGxheT0nbm9uZSdcIj5gIDogJzxkaXYgY2xhc3M9XCJ0YWItaWNvblwiPjwvZGl2Pid9XG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cInRpdGxlLWNlbGxcIiB0aXRsZT1cIiR7ZXNjYXBlSHRtbCh0YWIudGl0bGUpfVwiPiR7ZXNjYXBlSHRtbCh0YWIudGl0bGUpfTwvc3Bhbj5cbiAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiY29sb3I6ICM5OTk7IGZvbnQtc2l6ZTogMC44ZW07IG1hcmdpbi1sZWZ0OiBhdXRvO1wiPiR7ZXNjYXBlSHRtbChuZXcgVVJMKHRhYi51cmwpLmhvc3RuYW1lKX08L3NwYW4+XG4gICAgICAgICAgPC9saT5cbiAgICAgICAgYCkuam9pbignJyl9XG4gICAgICA8L3VsPlxuICAgIDwvZGl2PlxuICBgKS5qb2luKCcnKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFwcGx5VG9Ccm93c2VyKCkge1xuICAgIGNvbnN0IGdyb3VwaW5nTGlzdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaW0tZ3JvdXBpbmctbGlzdCcpO1xuICAgIGNvbnN0IHNvcnRpbmdMaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpbS1zb3J0aW5nLWxpc3QnKTtcblxuICAgIGlmICghZ3JvdXBpbmdMaXN0IHx8ICFzb3J0aW5nTGlzdCkgcmV0dXJuO1xuXG4gICAgY29uc3QgZ3JvdXBpbmdTdHJhdHMgPSBnZXRFbmFibGVkU3RyYXRlZ2llc0Zyb21VSShncm91cGluZ0xpc3QpO1xuICAgIGNvbnN0IHNvcnRpbmdTdHJhdHMgPSBnZXRFbmFibGVkU3RyYXRlZ2llc0Zyb21VSShzb3J0aW5nTGlzdCk7XG5cbiAgICAvLyBDb21iaW5lIHN0cmF0ZWdpZXMuXG4gICAgLy8gV2UgcHJpb3JpdGl6ZSBncm91cGluZyBzdHJhdGVnaWVzIGZpcnN0LCB0aGVuIHNvcnRpbmcgc3RyYXRlZ2llcyxcbiAgICAvLyBhcyB0aGUgYmFja2VuZCBmaWx0ZXJzIHRoZW0gd2hlbiBwZXJmb3JtaW5nIGFjdGlvbnMuXG4gICAgY29uc3QgYWxsU3RyYXRlZ2llcyA9IFsuLi5ncm91cGluZ1N0cmF0cywgLi4uc29ydGluZ1N0cmF0c107XG5cbiAgICB0cnkge1xuICAgICAgICAvLyAxLiBTYXZlIFByZWZlcmVuY2VzXG4gICAgICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgIHR5cGU6ICdzYXZlUHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgcGF5bG9hZDogeyBzb3J0aW5nOiBhbGxTdHJhdGVnaWVzIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gMi4gVHJpZ2dlciBBcHBseSBHcm91cGluZyAod2hpY2ggdXNlcyB0aGUgbmV3IHByZWZlcmVuY2VzKVxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgIHR5cGU6ICdhcHBseUdyb3VwaW5nJyxcbiAgICAgICAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgICAgICAgICBzb3J0aW5nOiBhbGxTdHJhdGVnaWVzIC8vIFBhc3MgZXhwbGljaXRseSB0byBlbnN1cmUgaW1tZWRpYXRlIGVmZmVjdFxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2spIHtcbiAgICAgICAgICAgIGFsZXJ0KFwiQXBwbGllZCBzdWNjZXNzZnVsbHkhXCIpO1xuICAgICAgICAgICAgbG9hZFRhYnMoKTsgLy8gUmVmcmVzaCBkYXRhXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBhbGVydChcIkZhaWxlZCB0byBhcHBseTogXCIgKyAocmVzcG9uc2UuZXJyb3IgfHwgJ1Vua25vd24gZXJyb3InKSk7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJBcHBseSBmYWlsZWRcIiwgZSk7XG4gICAgICAgIGFsZXJ0KFwiQXBwbHkgZmFpbGVkOiBcIiArIGUpO1xuICAgIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlbmRlckxpdmVWaWV3KCkge1xuICAgIGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsaXZlLXZpZXctY29udGFpbmVyJyk7XG4gICAgaWYgKCFjb250YWluZXIpIHJldHVybjtcblxuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHRhYnMgPSBhd2FpdCBjaHJvbWUudGFicy5xdWVyeSh7fSk7XG4gICAgICAgIGNvbnN0IGdyb3VwcyA9IGF3YWl0IGNocm9tZS50YWJHcm91cHMucXVlcnkoe30pO1xuICAgICAgICBjb25zdCBncm91cE1hcCA9IG5ldyBNYXAoZ3JvdXBzLm1hcChnID0+IFtnLmlkLCBnXSkpO1xuXG4gICAgICAgIGNvbnN0IHdpbmRvd3MgPSBuZXcgU2V0KHRhYnMubWFwKHQgPT4gdC53aW5kb3dJZCkpO1xuICAgICAgICBjb25zdCB3aW5kb3dJZHMgPSBBcnJheS5mcm9tKHdpbmRvd3MpLnNvcnQoKGEsIGIpID0+IGEgLSBiKTtcblxuICAgICAgICBsZXQgaHRtbCA9ICc8ZGl2IHN0eWxlPVwiZm9udC1zaXplOiAwLjllbTsgY29sb3I6ICM2NjY7IG1hcmdpbi1ib3R0b206IDEwcHg7XCI+U2VsZWN0IGl0ZW1zIGJlbG93IHRvIHNpbXVsYXRlIHNwZWNpZmljIHNlbGVjdGlvbiBzdGF0ZXMuPC9kaXY+JztcblxuICAgICAgICBmb3IgKGNvbnN0IHdpbklkIG9mIHdpbmRvd0lkcykge1xuICAgICAgICAgICAgY29uc3Qgd2luVGFicyA9IHRhYnMuZmlsdGVyKHQgPT4gdC53aW5kb3dJZCA9PT0gd2luSWQpO1xuICAgICAgICAgICAgY29uc3Qgd2luU2VsZWN0ZWQgPSB3aW5UYWJzLmV2ZXJ5KHQgPT4gdC5pZCAmJiBhcHBTdGF0ZS5zaW11bGF0ZWRTZWxlY3Rpb24uaGFzKHQuaWQpKTtcblxuICAgICAgICAgICAgaHRtbCArPSBgPGRpdiBjbGFzcz1cInNlbGVjdGFibGUtaXRlbSAke3dpblNlbGVjdGVkID8gJ3NlbGVjdGVkJyA6ICcnfVwiIGRhdGEtdHlwZT1cIndpbmRvd1wiIGRhdGEtaWQ9XCIke3dpbklkfVwiIHN0eWxlPVwibWFyZ2luLWJvdHRvbTogMTVweDsgYm9yZGVyLXJhZGl1czogNHB4OyBwYWRkaW5nOiA1cHg7XCI+YDtcbiAgICAgICAgICAgIGh0bWwgKz0gYDxkaXYgc3R5bGU9XCJmb250LXdlaWdodDogYm9sZDtcIj5XaW5kb3cgJHt3aW5JZH08L2Rpdj5gO1xuXG4gICAgICAgICAgICAvLyBPcmdhbml6ZSBieSBncm91cFxuICAgICAgICAgICAgY29uc3Qgd2luR3JvdXBzID0gbmV3IE1hcDxudW1iZXIsIGNocm9tZS50YWJzLlRhYltdPigpO1xuICAgICAgICAgICAgY29uc3QgdW5ncm91cGVkOiBjaHJvbWUudGFicy5UYWJbXSA9IFtdO1xuXG4gICAgICAgICAgICB3aW5UYWJzLmZvckVhY2godCA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHQuZ3JvdXBJZCAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF3aW5Hcm91cHMuaGFzKHQuZ3JvdXBJZCkpIHdpbkdyb3Vwcy5zZXQodC5ncm91cElkLCBbXSk7XG4gICAgICAgICAgICAgICAgICAgIHdpbkdyb3Vwcy5nZXQodC5ncm91cElkKSEucHVzaCh0KTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB1bmdyb3VwZWQucHVzaCh0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gUmVuZGVyIFVuZ3JvdXBlZFxuICAgICAgICAgICAgaWYgKHVuZ3JvdXBlZC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgIGh0bWwgKz0gYDxkaXYgc3R5bGU9XCJtYXJnaW4tbGVmdDogMTBweDsgbWFyZ2luLXRvcDogNXB4O1wiPmA7XG4gICAgICAgICAgICAgICAgIGh0bWwgKz0gYDxkaXYgc3R5bGU9XCJmb250LXNpemU6IDAuOWVtOyBjb2xvcjogIzU1NTtcIj5Vbmdyb3VwZWQgKCR7dW5ncm91cGVkLmxlbmd0aH0pPC9kaXY+YDtcbiAgICAgICAgICAgICAgICAgdW5ncm91cGVkLmZvckVhY2godCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICBjb25zdCBpc1NlbGVjdGVkID0gdC5pZCAmJiBhcHBTdGF0ZS5zaW11bGF0ZWRTZWxlY3Rpb24uaGFzKHQuaWQpO1xuICAgICAgICAgICAgICAgICAgICAgaHRtbCArPSBgPGRpdiBjbGFzcz1cInNlbGVjdGFibGUtaXRlbSAke2lzU2VsZWN0ZWQgPyAnc2VsZWN0ZWQnIDogJyd9XCIgZGF0YS10eXBlPVwidGFiXCIgZGF0YS1pZD1cIiR7dC5pZH1cIiBzdHlsZT1cIm1hcmdpbi1sZWZ0OiAxMHB4OyBwYWRkaW5nOiAycHggNXB4OyBib3JkZXItcmFkaXVzOiAzcHg7IGN1cnNvcjogcG9pbnRlcjsgY29sb3I6ICMzMzM7IHdoaXRlLXNwYWNlOiBub3dyYXA7IG92ZXJmbG93OiBoaWRkZW47IHRleHQtb3ZlcmZsb3c6IGVsbGlwc2lzO1wiPi0gJHtlc2NhcGVIdG1sKHQudGl0bGUgfHwgJ1VudGl0bGVkJyl9PC9kaXY+YDtcbiAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgIGh0bWwgKz0gYDwvZGl2PmA7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFJlbmRlciBHcm91cHNcbiAgICAgICAgICAgIGZvciAoY29uc3QgW2dyb3VwSWQsIGdUYWJzXSBvZiB3aW5Hcm91cHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBncm91cEluZm8gPSBncm91cE1hcC5nZXQoZ3JvdXBJZCk7XG4gICAgICAgICAgICAgICAgY29uc3QgY29sb3IgPSBncm91cEluZm8/LmNvbG9yIHx8ICdncmV5JztcbiAgICAgICAgICAgICAgICBjb25zdCB0aXRsZSA9IGdyb3VwSW5mbz8udGl0bGUgfHwgJ1VudGl0bGVkIEdyb3VwJztcbiAgICAgICAgICAgICAgICBjb25zdCBncm91cFNlbGVjdGVkID0gZ1RhYnMuZXZlcnkodCA9PiB0LmlkICYmIGFwcFN0YXRlLnNpbXVsYXRlZFNlbGVjdGlvbi5oYXModC5pZCkpO1xuXG4gICAgICAgICAgICAgICAgaHRtbCArPSBgPGRpdiBjbGFzcz1cInNlbGVjdGFibGUtaXRlbSAke2dyb3VwU2VsZWN0ZWQgPyAnc2VsZWN0ZWQnIDogJyd9XCIgZGF0YS10eXBlPVwiZ3JvdXBcIiBkYXRhLWlkPVwiJHtncm91cElkfVwiIHN0eWxlPVwibWFyZ2luLWxlZnQ6IDEwcHg7IG1hcmdpbi10b3A6IDVweDsgYm9yZGVyLWxlZnQ6IDNweCBzb2xpZCAke2NvbG9yfTsgcGFkZGluZy1sZWZ0OiA1cHg7IHBhZGRpbmc6IDVweDsgYm9yZGVyLXJhZGl1czogM3B4O1wiPmA7XG4gICAgICAgICAgICAgICAgaHRtbCArPSBgPGRpdiBzdHlsZT1cImZvbnQtd2VpZ2h0OiBib2xkOyBmb250LXNpemU6IDAuOWVtO1wiPiR7ZXNjYXBlSHRtbCh0aXRsZSl9ICgke2dUYWJzLmxlbmd0aH0pPC9kaXY+YDtcbiAgICAgICAgICAgICAgICBnVGFicy5mb3JFYWNoKHQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNTZWxlY3RlZCA9IHQuaWQgJiYgYXBwU3RhdGUuc2ltdWxhdGVkU2VsZWN0aW9uLmhhcyh0LmlkKTtcbiAgICAgICAgICAgICAgICAgICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJzZWxlY3RhYmxlLWl0ZW0gJHtpc1NlbGVjdGVkID8gJ3NlbGVjdGVkJyA6ICcnfVwiIGRhdGEtdHlwZT1cInRhYlwiIGRhdGEtaWQ9XCIke3QuaWR9XCIgc3R5bGU9XCJtYXJnaW4tbGVmdDogMTBweDsgcGFkZGluZzogMnB4IDVweDsgYm9yZGVyLXJhZGl1czogM3B4OyBjdXJzb3I6IHBvaW50ZXI7IGNvbG9yOiAjMzMzOyB3aGl0ZS1zcGFjZTogbm93cmFwOyBvdmVyZmxvdzogaGlkZGVuOyB0ZXh0LW92ZXJmbG93OiBlbGxpcHNpcztcIj4tICR7ZXNjYXBlSHRtbCh0LnRpdGxlIHx8ICdVbnRpdGxlZCcpfTwvZGl2PmA7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgaHRtbCArPSBgPC9kaXY+YDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaHRtbCArPSBgPC9kaXY+YDtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnRhaW5lci5pbm5lckhUTUwgPSBodG1sO1xuXG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb250YWluZXIuaW5uZXJIVE1MID0gYDxwIHN0eWxlPVwiY29sb3I6cmVkXCI+RXJyb3IgbG9hZGluZyBsaXZlIHZpZXc6ICR7ZX08L3A+YDtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJTdHJhdGVneUNvbmZpZygpIHtcbiAgY29uc3QgZ3JvdXBpbmdMaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpbS1ncm91cGluZy1saXN0Jyk7XG4gIGNvbnN0IHNvcnRpbmdMaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpbS1zb3J0aW5nLWxpc3QnKTtcblxuICAvLyBVc2UgZHluYW1pYyBzdHJhdGVneSBsaXN0XG4gIGNvbnN0IHN0cmF0ZWdpZXM6IFN0cmF0ZWd5RGVmaW5pdGlvbltdID0gZ2V0U3RyYXRlZ2llcyhhcHBTdGF0ZS5sb2NhbEN1c3RvbVN0cmF0ZWdpZXMpO1xuXG4gIGlmIChncm91cGluZ0xpc3QpIHtcbiAgICAgIC8vIGdyb3VwaW5nU3RyYXRlZ2llcyBpcyBqdXN0IGZpbHRlcmVkIHN0cmF0ZWdpZXNcbiAgICAgIGNvbnN0IGdyb3VwaW5nU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gcy5pc0dyb3VwaW5nKTtcbiAgICAgIHJlbmRlclN0cmF0ZWd5TGlzdChncm91cGluZ0xpc3QsIGdyb3VwaW5nU3RyYXRlZ2llcywgWydkb21haW4nLCAndG9waWMnXSk7XG4gIH1cblxuICBpZiAoc29ydGluZ0xpc3QpIHtcbiAgICAgIGNvbnN0IHNvcnRpbmdTdHJhdGVnaWVzID0gc3RyYXRlZ2llcy5maWx0ZXIocyA9PiBzLmlzU29ydGluZyk7XG4gICAgICByZW5kZXJTdHJhdGVneUxpc3Qoc29ydGluZ0xpc3QsIHNvcnRpbmdTdHJhdGVnaWVzLCBbJ3Bpbm5lZCcsICdyZWNlbmN5J10pO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJTdHJhdGVneUxpc3QoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgc3RyYXRlZ2llczogU3RyYXRlZ3lEZWZpbml0aW9uW10sIGRlZmF1bHRFbmFibGVkOiBzdHJpbmdbXSkge1xuICAgIGNvbnRhaW5lci5pbm5lckhUTUwgPSAnJztcblxuICAgIC8vIFNvcnQgZW5hYmxlZCBieSB0aGVpciBpbmRleCBpbiBkZWZhdWx0RW5hYmxlZFxuICAgIGNvbnN0IGVuYWJsZWQgPSBzdHJhdGVnaWVzLmZpbHRlcihzID0+IGRlZmF1bHRFbmFibGVkLmluY2x1ZGVzKHMuaWQgYXMgc3RyaW5nKSk7XG4gICAgLy8gU2FmZSBpbmRleG9mIGNoZWNrIHNpbmNlIGlkcyBhcmUgc3RyaW5ncyBpbiBkZWZhdWx0RW5hYmxlZFxuICAgIGVuYWJsZWQuc29ydCgoYSwgYikgPT4gZGVmYXVsdEVuYWJsZWQuaW5kZXhPZihhLmlkIGFzIHN0cmluZykgLSBkZWZhdWx0RW5hYmxlZC5pbmRleE9mKGIuaWQgYXMgc3RyaW5nKSk7XG5cbiAgICBjb25zdCBkaXNhYmxlZCA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gIWRlZmF1bHRFbmFibGVkLmluY2x1ZGVzKHMuaWQgYXMgc3RyaW5nKSk7XG5cbiAgICAvLyBJbml0aWFsIHJlbmRlciBvcmRlcjogRW5hYmxlZCAob3JkZXJlZCkgdGhlbiBEaXNhYmxlZFxuICAgIGNvbnN0IG9yZGVyZWQgPSBbLi4uZW5hYmxlZCwgLi4uZGlzYWJsZWRdO1xuXG4gICAgb3JkZXJlZC5mb3JFYWNoKHN0cmF0ZWd5ID0+IHtcbiAgICAgICAgY29uc3QgaXNDaGVja2VkID0gZGVmYXVsdEVuYWJsZWQuaW5jbHVkZXMoc3RyYXRlZ3kuaWQpO1xuICAgICAgICBjb25zdCByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgcm93LmNsYXNzTmFtZSA9IGBzdHJhdGVneS1yb3cgJHtpc0NoZWNrZWQgPyAnJyA6ICdkaXNhYmxlZCd9YDtcbiAgICAgICAgcm93LmRhdGFzZXQuaWQgPSBzdHJhdGVneS5pZDtcbiAgICAgICAgcm93LmRyYWdnYWJsZSA9IHRydWU7XG5cbiAgICAgICAgcm93LmlubmVySFRNTCA9IGBcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJkcmFnLWhhbmRsZVwiPlx1MjYzMDwvZGl2PlxuICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiICR7aXNDaGVja2VkID8gJ2NoZWNrZWQnIDogJyd9PlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJzdHJhdGVneS1sYWJlbFwiPiR7c3RyYXRlZ3kubGFiZWx9PC9zcGFuPlxuICAgICAgICBgO1xuXG4gICAgICAgIC8vIEFkZCBsaXN0ZW5lcnNcbiAgICAgICAgY29uc3QgY2hlY2tib3ggPSByb3cucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cImNoZWNrYm94XCJdJyk7XG4gICAgICAgIGNoZWNrYm94Py5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgY2hlY2tlZCA9IChlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS5jaGVja2VkO1xuICAgICAgICAgICAgcm93LmNsYXNzTGlzdC50b2dnbGUoJ2Rpc2FibGVkJywgIWNoZWNrZWQpO1xuICAgICAgICB9KTtcblxuICAgICAgICBhZGREbkRMaXN0ZW5lcnMocm93LCBjb250YWluZXIpO1xuXG4gICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChyb3cpO1xuICAgIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RW5hYmxlZFN0cmF0ZWdpZXNGcm9tVUkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IFNvcnRpbmdTdHJhdGVneVtdIHtcbiAgICByZXR1cm4gQXJyYXkuZnJvbShjb250YWluZXIuY2hpbGRyZW4pXG4gICAgICAgIC5maWx0ZXIocm93ID0+IChyb3cucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cImNoZWNrYm94XCJdJykgYXMgSFRNTElucHV0RWxlbWVudCkuY2hlY2tlZClcbiAgICAgICAgLm1hcChyb3cgPT4gKHJvdyBhcyBIVE1MRWxlbWVudCkuZGF0YXNldC5pZCBhcyBTb3J0aW5nU3RyYXRlZ3kpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5pdFNpbXVsYXRpb24oKSB7XG4gIGNvbnN0IHJ1blNpbUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdydW5TaW1CdG4nKTtcbiAgaWYgKHJ1blNpbUJ0bikge1xuICAgIHJ1blNpbUJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHJ1blNpbXVsYXRpb24pO1xuICB9XG5cbiAgY29uc3QgYXBwbHlCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXBwbHlCdG4nKTtcbiAgaWYgKGFwcGx5QnRuKSB7XG4gICAgYXBwbHlCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBhcHBseVRvQnJvd3Nlcik7XG4gIH1cblxuICAvLyBJbml0aWFsIExpdmUgVmlld1xuICByZW5kZXJMaXZlVmlldygpO1xuICBjb25zdCByZWZyZXNoTGl2ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZWZyZXNoLWxpdmUtdmlldy1idG4nKTtcbiAgaWYgKHJlZnJlc2hMaXZlQnRuKSByZWZyZXNoTGl2ZUJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHJlbmRlckxpdmVWaWV3KTtcblxuICBjb25zdCBsaXZlQ29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xpdmUtdmlldy1jb250YWluZXInKTtcbiAgaWYgKGxpdmVDb250YWluZXIpIHtcbiAgICAgIGxpdmVDb250YWluZXIuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgICAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICAgICAgICAgIGNvbnN0IGl0ZW0gPSB0YXJnZXQuY2xvc2VzdCgnLnNlbGVjdGFibGUtaXRlbScpIGFzIEhUTUxFbGVtZW50O1xuICAgICAgICAgIGlmICghaXRlbSkgcmV0dXJuO1xuXG4gICAgICAgICAgY29uc3QgdHlwZSA9IGl0ZW0uZGF0YXNldC50eXBlO1xuICAgICAgICAgIGNvbnN0IGlkID0gTnVtYmVyKGl0ZW0uZGF0YXNldC5pZCk7XG4gICAgICAgICAgaWYgKCF0eXBlIHx8IGlzTmFOKGlkKSkgcmV0dXJuO1xuXG4gICAgICAgICAgaWYgKHR5cGUgPT09ICd0YWInKSB7XG4gICAgICAgICAgICAgIGlmIChhcHBTdGF0ZS5zaW11bGF0ZWRTZWxlY3Rpb24uaGFzKGlkKSkgYXBwU3RhdGUuc2ltdWxhdGVkU2VsZWN0aW9uLmRlbGV0ZShpZCk7XG4gICAgICAgICAgICAgIGVsc2UgYXBwU3RhdGUuc2ltdWxhdGVkU2VsZWN0aW9uLmFkZChpZCk7XG4gICAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSAnZ3JvdXAnKSB7XG4gICAgICAgICAgICAgIGNocm9tZS50YWJzLnF1ZXJ5KHt9KS50aGVuKHRhYnMgPT4ge1xuICAgICAgICAgICAgICAgICBjb25zdCBncm91cFRhYnMgPSB0YWJzLmZpbHRlcih0ID0+IHQuZ3JvdXBJZCA9PT0gaWQpO1xuICAgICAgICAgICAgICAgICBjb25zdCBhbGxTZWxlY3RlZCA9IGdyb3VwVGFicy5ldmVyeSh0ID0+IHQuaWQgJiYgYXBwU3RhdGUuc2ltdWxhdGVkU2VsZWN0aW9uLmhhcyh0LmlkKSk7XG4gICAgICAgICAgICAgICAgIGdyb3VwVGFicy5mb3JFYWNoKHQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgaWYgKHQuaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoYWxsU2VsZWN0ZWQpIGFwcFN0YXRlLnNpbXVsYXRlZFNlbGVjdGlvbi5kZWxldGUodC5pZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSBhcHBTdGF0ZS5zaW11bGF0ZWRTZWxlY3Rpb24uYWRkKHQuaWQpO1xuICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgcmVuZGVyTGl2ZVZpZXcoKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIHJldHVybjsgLy8gYXN5bmMgdXBkYXRlXG4gICAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSAnd2luZG93Jykge1xuICAgICAgICAgICAgICBjaHJvbWUudGFicy5xdWVyeSh7fSkudGhlbih0YWJzID0+IHtcbiAgICAgICAgICAgICAgICAgY29uc3Qgd2luVGFicyA9IHRhYnMuZmlsdGVyKHQgPT4gdC53aW5kb3dJZCA9PT0gaWQpO1xuICAgICAgICAgICAgICAgICBjb25zdCBhbGxTZWxlY3RlZCA9IHdpblRhYnMuZXZlcnkodCA9PiB0LmlkICYmIGFwcFN0YXRlLnNpbXVsYXRlZFNlbGVjdGlvbi5oYXModC5pZCkpO1xuICAgICAgICAgICAgICAgICB3aW5UYWJzLmZvckVhY2godCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICBpZiAodC5pZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChhbGxTZWxlY3RlZCkgYXBwU3RhdGUuc2ltdWxhdGVkU2VsZWN0aW9uLmRlbGV0ZSh0LmlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICBlbHNlIGFwcFN0YXRlLnNpbXVsYXRlZFNlbGVjdGlvbi5hZGQodC5pZCk7XG4gICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICByZW5kZXJMaXZlVmlldygpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgcmV0dXJuOyAvLyBhc3luYyB1cGRhdGVcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZW5kZXJMaXZlVmlldygpO1xuICAgICAgfSk7XG4gIH1cbn1cbiIsICJpbXBvcnQgeyBhcHBTdGF0ZSB9IGZyb20gXCIuL3N0YXRlLmpzXCI7XG5pbXBvcnQgeyBzZXRDdXN0b21TdHJhdGVnaWVzIH0gZnJvbSBcIi4uLy4uL2JhY2tncm91bmQvZ3JvdXBpbmdTdHJhdGVnaWVzLmpzXCI7XG5pbXBvcnQgeyByZW5kZXJBbGdvcml0aG1zVmlldywgc2hvd01vZGFsIH0gZnJvbSBcIi4vY29tcG9uZW50cy5qc1wiO1xuaW1wb3J0IHsgcmVuZGVyU3RyYXRlZ3lDb25maWcgfSBmcm9tIFwiLi9zaW11bGF0aW9uLmpzXCI7XG5pbXBvcnQgeyBQcmVmZXJlbmNlcywgQ3VzdG9tU3RyYXRlZ3kgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBTVFJBVEVHSUVTIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC9zdHJhdGVneVJlZ2lzdHJ5LmpzXCI7XG5pbXBvcnQgeyBsb2dJbmZvIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGVzY2FwZUh0bWwgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBsb2FkUHJlZmVyZW5jZXNBbmRJbml0KCkge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiAnbG9hZFByZWZlcmVuY2VzJyB9KTtcbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9rICYmIHJlc3BvbnNlLmRhdGEpIHtcbiAgICAgICAgICAgIGNvbnN0IHByZWZzID0gcmVzcG9uc2UuZGF0YSBhcyBQcmVmZXJlbmNlcztcbiAgICAgICAgICAgIGFwcFN0YXRlLmxvY2FsQ3VzdG9tU3RyYXRlZ2llcyA9IHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW107XG4gICAgICAgICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKGFwcFN0YXRlLmxvY2FsQ3VzdG9tU3RyYXRlZ2llcyk7XG4gICAgICAgICAgICByZW5kZXJTdHJhdGVneUxvYWRPcHRpb25zKCk7XG4gICAgICAgICAgICByZW5kZXJTdHJhdGVneUxpc3RUYWJsZSgpO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGxvYWQgcHJlZmVyZW5jZXNcIiwgZSk7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyU3RyYXRlZ3lMb2FkT3B0aW9ucygpIHtcbiAgICBjb25zdCBzZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXRlZ3ktbG9hZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCB8IG51bGw7XG4gICAgaWYgKCFzZWxlY3QpIHJldHVybjtcblxuICAgIGNvbnN0IGN1c3RvbU9wdGlvbnMgPSBhcHBTdGF0ZS5sb2NhbEN1c3RvbVN0cmF0ZWdpZXNcbiAgICAgICAgLnNsaWNlKClcbiAgICAgICAgLnNvcnQoKGEsIGIpID0+IGEubGFiZWwubG9jYWxlQ29tcGFyZShiLmxhYmVsKSlcbiAgICAgICAgLm1hcChzdHJhdGVneSA9PiBgXG4gICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiJHtlc2NhcGVIdG1sKHN0cmF0ZWd5LmlkKX1cIj4ke2VzY2FwZUh0bWwoc3RyYXRlZ3kubGFiZWwpfSAoJHtlc2NhcGVIdG1sKHN0cmF0ZWd5LmlkKX0pPC9vcHRpb24+XG4gICAgICAgIGApLmpvaW4oJycpO1xuXG4gICAgY29uc3QgYnVpbHRJbk9wdGlvbnMgPSBTVFJBVEVHSUVTXG4gICAgICAgIC5maWx0ZXIocyA9PiAhYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzLnNvbWUoY3MgPT4gY3MuaWQgPT09IHMuaWQpKVxuICAgICAgICAubWFwKHN0cmF0ZWd5ID0+IGBcbiAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCIke2VzY2FwZUh0bWwoc3RyYXRlZ3kuaWQgYXMgc3RyaW5nKX1cIj4ke2VzY2FwZUh0bWwoc3RyYXRlZ3kubGFiZWwpfSAoQnVpbHQtaW4pPC9vcHRpb24+XG4gICAgICAgIGApLmpvaW4oJycpO1xuXG4gICAgc2VsZWN0LmlubmVySFRNTCA9IGA8b3B0aW9uIHZhbHVlPVwiXCI+TG9hZCBzYXZlZCBzdHJhdGVneS4uLjwvb3B0aW9uPmAgK1xuICAgICAgICAoY3VzdG9tT3B0aW9ucyA/IGA8b3B0Z3JvdXAgbGFiZWw9XCJDdXN0b20gU3RyYXRlZ2llc1wiPiR7Y3VzdG9tT3B0aW9uc308L29wdGdyb3VwPmAgOiAnJykgK1xuICAgICAgICAoYnVpbHRJbk9wdGlvbnMgPyBgPG9wdGdyb3VwIGxhYmVsPVwiQnVpbHQtaW4gU3RyYXRlZ2llc1wiPiR7YnVpbHRJbk9wdGlvbnN9PC9vcHRncm91cD5gIDogJycpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyU3RyYXRlZ3lMaXN0VGFibGUoKSB7XG4gICAgY29uc3QgdGFibGVCb2R5ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0ZWd5LXRhYmxlLWJvZHknKTtcbiAgICBpZiAoIXRhYmxlQm9keSkgcmV0dXJuO1xuXG4gICAgY29uc3QgY3VzdG9tSWRzID0gbmV3IFNldChhcHBTdGF0ZS5sb2NhbEN1c3RvbVN0cmF0ZWdpZXMubWFwKHN0cmF0ZWd5ID0+IHN0cmF0ZWd5LmlkKSk7XG4gICAgY29uc3QgYnVpbHRJblJvd3MgPSBTVFJBVEVHSUVTLm1hcChzdHJhdGVneSA9PiAoe1xuICAgICAgICAuLi5zdHJhdGVneSxcbiAgICAgICAgc291cmNlTGFiZWw6ICdCdWlsdC1pbicsXG4gICAgICAgIGNvbmZpZ1N1bW1hcnk6ICdcdTIwMTQnLFxuICAgICAgICBhdXRvUnVuTGFiZWw6ICdcdTIwMTQnLFxuICAgICAgICBhY3Rpb25zOiAnJ1xuICAgIH0pKTtcblxuICAgIGNvbnN0IGN1c3RvbVJvd3MgPSBhcHBTdGF0ZS5sb2NhbEN1c3RvbVN0cmF0ZWdpZXMubWFwKHN0cmF0ZWd5ID0+IHtcbiAgICAgICAgY29uc3Qgb3ZlcnJpZGVzQnVpbHRJbiA9IGN1c3RvbUlkcy5oYXMoc3RyYXRlZ3kuaWQpICYmIFNUUkFURUdJRVMuc29tZShidWlsdEluID0+IGJ1aWx0SW4uaWQgPT09IHN0cmF0ZWd5LmlkKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGlkOiBzdHJhdGVneS5pZCxcbiAgICAgICAgICAgIGxhYmVsOiBzdHJhdGVneS5sYWJlbCxcbiAgICAgICAgICAgIGlzR3JvdXBpbmc6IHRydWUsXG4gICAgICAgICAgICBpc1NvcnRpbmc6IHRydWUsXG4gICAgICAgICAgICBzb3VyY2VMYWJlbDogb3ZlcnJpZGVzQnVpbHRJbiA/ICdDdXN0b20gKG92ZXJyaWRlcyBidWlsdC1pbiknIDogJ0N1c3RvbScsXG4gICAgICAgICAgICBjb25maWdTdW1tYXJ5OiBgRmlsdGVyczogJHtzdHJhdGVneS5maWx0ZXJzPy5sZW5ndGggfHwgMH0sIEdyb3VwczogJHtzdHJhdGVneS5ncm91cGluZ1J1bGVzPy5sZW5ndGggfHwgMH0sIFNvcnRzOiAke3N0cmF0ZWd5LnNvcnRpbmdSdWxlcz8ubGVuZ3RoIHx8IDB9YCxcbiAgICAgICAgICAgIGF1dG9SdW5MYWJlbDogc3RyYXRlZ3kuYXV0b1J1biA/ICdZZXMnIDogJ05vJyxcbiAgICAgICAgICAgIGFjdGlvbnM6IGA8YnV0dG9uIGNsYXNzPVwiZGVsZXRlLXN0cmF0ZWd5LXJvd1wiIGRhdGEtaWQ9XCIke2VzY2FwZUh0bWwoc3RyYXRlZ3kuaWQpfVwiIHN0eWxlPVwiY29sb3I6IHJlZDtcIj5EZWxldGU8L2J1dHRvbj5gXG4gICAgICAgIH07XG4gICAgfSk7XG5cbiAgICBjb25zdCBhbGxSb3dzID0gWy4uLmJ1aWx0SW5Sb3dzLCAuLi5jdXN0b21Sb3dzXTtcblxuICAgIGlmIChhbGxSb3dzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICB0YWJsZUJvZHkuaW5uZXJIVE1MID0gJzx0cj48dGQgY29sc3Bhbj1cIjdcIiBzdHlsZT1cImNvbG9yOiAjODg4O1wiPk5vIHN0cmF0ZWdpZXMgZm91bmQuPC90ZD48L3RyPic7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0YWJsZUJvZHkuaW5uZXJIVE1MID0gYWxsUm93cy5tYXAocm93ID0+IHtcbiAgICAgICAgY29uc3QgY2FwYWJpbGl0aWVzID0gW3Jvdy5pc0dyb3VwaW5nID8gJ0dyb3VwaW5nJyA6IG51bGwsIHJvdy5pc1NvcnRpbmcgPyAnU29ydGluZycgOiBudWxsXS5maWx0ZXIoQm9vbGVhbikuam9pbignLCAnKTtcbiAgICAgICAgcmV0dXJuIGBcbiAgICAgICAgPHRyPlxuICAgICAgICAgICAgPHRkPiR7ZXNjYXBlSHRtbChyb3cubGFiZWwpfTwvdGQ+XG4gICAgICAgICAgICA8dGQ+JHtlc2NhcGVIdG1sKFN0cmluZyhyb3cuaWQpKX08L3RkPlxuICAgICAgICAgICAgPHRkPiR7ZXNjYXBlSHRtbChyb3cuc291cmNlTGFiZWwpfTwvdGQ+XG4gICAgICAgICAgICA8dGQ+JHtlc2NhcGVIdG1sKGNhcGFiaWxpdGllcyl9PC90ZD5cbiAgICAgICAgICAgIDx0ZD4ke2VzY2FwZUh0bWwocm93LmNvbmZpZ1N1bW1hcnkpfTwvdGQ+XG4gICAgICAgICAgICA8dGQ+JHtlc2NhcGVIdG1sKHJvdy5hdXRvUnVuTGFiZWwpfTwvdGQ+XG4gICAgICAgICAgICA8dGQ+JHtyb3cuYWN0aW9uc308L3RkPlxuICAgICAgICA8L3RyPlxuICAgICAgICBgO1xuICAgIH0pLmpvaW4oJycpO1xuXG4gICAgdGFibGVCb2R5LnF1ZXJ5U2VsZWN0b3JBbGwoJy5kZWxldGUtc3RyYXRlZ3ktcm93JykuZm9yRWFjaChidG4gPT4ge1xuICAgICAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgaWQgPSAoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXQuaWQ7XG4gICAgICAgICAgICBpZiAoaWQgJiYgY29uZmlybShgRGVsZXRlIHN0cmF0ZWd5IFwiJHtpZH1cIj9gKSkge1xuICAgICAgICAgICAgICAgIGF3YWl0IGRlbGV0ZUN1c3RvbVN0cmF0ZWd5KGlkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBkZWxldGVDdXN0b21TdHJhdGVneShpZDogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgbG9nSW5mbyhcIkRlbGV0aW5nIHN0cmF0ZWd5XCIsIHsgaWQgfSk7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiAnbG9hZFByZWZlcmVuY2VzJyB9KTtcbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9rICYmIHJlc3BvbnNlLmRhdGEpIHtcbiAgICAgICAgICAgIGNvbnN0IHByZWZzID0gcmVzcG9uc2UuZGF0YSBhcyBQcmVmZXJlbmNlcztcbiAgICAgICAgICAgIGNvbnN0IG5ld1N0cmF0ZWdpZXMgPSAocHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXSkuZmlsdGVyKHMgPT4gcy5pZCAhPT0gaWQpO1xuXG4gICAgICAgICAgICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICAgICAgdHlwZTogJ3NhdmVQcmVmZXJlbmNlcycsXG4gICAgICAgICAgICAgICAgcGF5bG9hZDogeyBjdXN0b21TdHJhdGVnaWVzOiBuZXdTdHJhdGVnaWVzIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBhcHBTdGF0ZS5sb2NhbEN1c3RvbVN0cmF0ZWdpZXMgPSBuZXdTdHJhdGVnaWVzO1xuICAgICAgICAgICAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhhcHBTdGF0ZS5sb2NhbEN1c3RvbVN0cmF0ZWdpZXMpO1xuICAgICAgICAgICAgcmVuZGVyU3RyYXRlZ3lMb2FkT3B0aW9ucygpO1xuICAgICAgICAgICAgcmVuZGVyU3RyYXRlZ3lMaXN0VGFibGUoKTtcbiAgICAgICAgICAgIHJlbmRlckFsZ29yaXRobXNWaWV3KCk7XG4gICAgICAgICAgICByZW5kZXJTdHJhdGVneUNvbmZpZygpO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGRlbGV0ZSBzdHJhdGVneVwiLCBlKTtcbiAgICB9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzYXZlU3RyYXRlZ3koc3RyYXQ6IEN1c3RvbVN0cmF0ZWd5LCBzaG93U3VjY2VzczogYm9vbGVhbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIHRyeSB7XG4gICAgICAgIGxvZ0luZm8oXCJTYXZpbmcgc3RyYXRlZ3lcIiwgeyBpZDogc3RyYXQuaWQgfSk7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiAnbG9hZFByZWZlcmVuY2VzJyB9KTtcbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9rICYmIHJlc3BvbnNlLmRhdGEpIHtcbiAgICAgICAgICAgIGNvbnN0IHByZWZzID0gcmVzcG9uc2UuZGF0YSBhcyBQcmVmZXJlbmNlcztcbiAgICAgICAgICAgIGxldCBjdXJyZW50U3RyYXRlZ2llcyA9IHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW107XG5cbiAgICAgICAgICAgIC8vIEZpbmQgZXhpc3RpbmcgdG8gcHJlc2VydmUgcHJvcHMgKGxpa2UgYXV0b1J1bilcbiAgICAgICAgICAgIGNvbnN0IGV4aXN0aW5nID0gY3VycmVudFN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0LmlkKTtcbiAgICAgICAgICAgIGlmIChleGlzdGluZykge1xuICAgICAgICAgICAgICAgIHN0cmF0LmF1dG9SdW4gPSBleGlzdGluZy5hdXRvUnVuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBSZW1vdmUgZXhpc3RpbmcgaWYgc2FtZSBJRFxuICAgICAgICAgICAgY3VycmVudFN0cmF0ZWdpZXMgPSBjdXJyZW50U3RyYXRlZ2llcy5maWx0ZXIocyA9PiBzLmlkICE9PSBzdHJhdC5pZCk7XG4gICAgICAgICAgICBjdXJyZW50U3RyYXRlZ2llcy5wdXNoKHN0cmF0KTtcblxuICAgICAgICAgICAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICAgIHR5cGU6ICdzYXZlUHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgICAgIHBheWxvYWQ6IHsgY3VzdG9tU3RyYXRlZ2llczogY3VycmVudFN0cmF0ZWdpZXMgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGFwcFN0YXRlLmxvY2FsQ3VzdG9tU3RyYXRlZ2llcyA9IGN1cnJlbnRTdHJhdGVnaWVzO1xuICAgICAgICAgICAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhhcHBTdGF0ZS5sb2NhbEN1c3RvbVN0cmF0ZWdpZXMpO1xuXG4gICAgICAgICAgICByZW5kZXJTdHJhdGVneUxvYWRPcHRpb25zKCk7XG4gICAgICAgICAgICByZW5kZXJTdHJhdGVneUxpc3RUYWJsZSgpO1xuICAgICAgICAgICAgcmVuZGVyQWxnb3JpdGhtc1ZpZXcoKTtcbiAgICAgICAgICAgIHJlbmRlclN0cmF0ZWd5Q29uZmlnKCk7XG4gICAgICAgICAgICBpZiAoc2hvd1N1Y2Nlc3MpIGFsZXJ0KFwiU3RyYXRlZ3kgc2F2ZWQhXCIpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBzYXZlIHN0cmF0ZWd5XCIsIGUpO1xuICAgICAgICBhbGVydChcIkVycm9yIHNhdmluZyBzdHJhdGVneVwiKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4cG9ydEFsbFN0cmF0ZWdpZXMoKSB7XG4gICAgbG9nSW5mbyhcIkV4cG9ydGluZyBhbGwgc3RyYXRlZ2llc1wiLCB7IGNvdW50OiBhcHBTdGF0ZS5sb2NhbEN1c3RvbVN0cmF0ZWdpZXMubGVuZ3RoIH0pO1xuICAgIGNvbnN0IGpzb24gPSBKU09OLnN0cmluZ2lmeShhcHBTdGF0ZS5sb2NhbEN1c3RvbVN0cmF0ZWdpZXMsIG51bGwsIDIpO1xuICAgIGNvbnN0IGNvbnRlbnQgPSBgXG4gICAgICAgIDxwPkNvcHkgdGhlIEpTT04gYmVsb3cgKGNvbnRhaW5zICR7YXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzLmxlbmd0aH0gc3RyYXRlZ2llcyk6PC9wPlxuICAgICAgICA8dGV4dGFyZWEgc3R5bGU9XCJ3aWR0aDogMTAwJTsgaGVpZ2h0OiAzMDBweDsgZm9udC1mYW1pbHk6IG1vbm9zcGFjZTtcIj4ke2VzY2FwZUh0bWwoanNvbil9PC90ZXh0YXJlYT5cbiAgICBgO1xuICAgIHNob3dNb2RhbChcIkV4cG9ydCBBbGwgU3RyYXRlZ2llc1wiLCBjb250ZW50KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGltcG9ydEFsbFN0cmF0ZWdpZXMoKSB7XG4gICAgY29uc3QgY29udGVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGNvbnRlbnQuaW5uZXJIVE1MID0gYFxuICAgICAgICA8cD5QYXN0ZSBTdHJhdGVneSBMaXN0IEpTT04gYmVsb3c6PC9wPlxuICAgICAgICA8cCBzdHlsZT1cImZvbnQtc2l6ZTogMC45ZW07IGNvbG9yOiAjNjY2O1wiPk5vdGU6IFN0cmF0ZWdpZXMgd2l0aCBtYXRjaGluZyBJRHMgd2lsbCBiZSBvdmVyd3JpdHRlbi48L3A+XG4gICAgICAgIDx0ZXh0YXJlYSBpZD1cImltcG9ydC1hbGwtYXJlYVwiIHN0eWxlPVwid2lkdGg6IDEwMCU7IGhlaWdodDogMjAwcHg7IGZvbnQtZmFtaWx5OiBtb25vc3BhY2U7IG1hcmdpbi1ib3R0b206IDEwcHg7XCI+PC90ZXh0YXJlYT5cbiAgICAgICAgPGJ1dHRvbiBpZD1cImltcG9ydC1hbGwtY29uZmlybVwiIGNsYXNzPVwic3VjY2Vzcy1idG5cIj5JbXBvcnQgQWxsPC9idXR0b24+XG4gICAgYDtcblxuICAgIGNvbnN0IGJ0biA9IGNvbnRlbnQucXVlcnlTZWxlY3RvcignI2ltcG9ydC1hbGwtY29uZmlybScpO1xuICAgIGJ0bj8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBhc3luYyAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHR4dCA9IChjb250ZW50LnF1ZXJ5U2VsZWN0b3IoJyNpbXBvcnQtYWxsLWFyZWEnKSBhcyBIVE1MVGV4dEFyZWFFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGpzb24gPSBKU09OLnBhcnNlKHR4dCk7XG4gICAgICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkoanNvbikpIHtcbiAgICAgICAgICAgICAgICBhbGVydChcIkludmFsaWQgZm9ybWF0OiBFeHBlY3RlZCBhbiBhcnJheSBvZiBzdHJhdGVnaWVzLlwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFZhbGlkYXRlIGl0ZW1zXG4gICAgICAgICAgICBjb25zdCBpbnZhbGlkID0ganNvbi5maW5kKHMgPT4gIXMuaWQgfHwgIXMubGFiZWwpO1xuICAgICAgICAgICAgaWYgKGludmFsaWQpIHtcbiAgICAgICAgICAgICAgICBhbGVydChcIkludmFsaWQgc3RyYXRlZ3kgaW4gbGlzdDogbWlzc2luZyBJRCBvciBMYWJlbC5cIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBNZXJnZSBsb2dpYyAoVXBzZXJ0KVxuICAgICAgICAgICAgY29uc3Qgc3RyYXRNYXAgPSBuZXcgTWFwKGFwcFN0YXRlLmxvY2FsQ3VzdG9tU3RyYXRlZ2llcy5tYXAocyA9PiBbcy5pZCwgc10pKTtcblxuICAgICAgICAgICAgbGV0IGNvdW50ID0gMDtcbiAgICAgICAgICAgIGpzb24uZm9yRWFjaCgoczogQ3VzdG9tU3RyYXRlZ3kpID0+IHtcbiAgICAgICAgICAgICAgICBzdHJhdE1hcC5zZXQocy5pZCwgcyk7XG4gICAgICAgICAgICAgICAgY291bnQrKztcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBjb25zdCBuZXdTdHJhdGVnaWVzID0gQXJyYXkuZnJvbShzdHJhdE1hcC52YWx1ZXMoKSk7XG5cbiAgICAgICAgICAgIGxvZ0luZm8oXCJJbXBvcnRpbmcgYWxsIHN0cmF0ZWdpZXNcIiwgeyBjb3VudDogbmV3U3RyYXRlZ2llcy5sZW5ndGggfSk7XG5cbiAgICAgICAgICAgIC8vIFNhdmVcbiAgICAgICAgICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnc2F2ZVByZWZlcmVuY2VzJyxcbiAgICAgICAgICAgICAgICBwYXlsb2FkOiB7IGN1c3RvbVN0cmF0ZWdpZXM6IG5ld1N0cmF0ZWdpZXMgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIFVwZGF0ZSBsb2NhbCBzdGF0ZVxuICAgICAgICAgICAgYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzID0gbmV3U3RyYXRlZ2llcztcbiAgICAgICAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMoYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzKTtcblxuICAgICAgICAgICAgcmVuZGVyU3RyYXRlZ3lMb2FkT3B0aW9ucygpO1xuICAgICAgICAgICAgcmVuZGVyU3RyYXRlZ3lMaXN0VGFibGUoKTtcbiAgICAgICAgICAgIHJlbmRlckFsZ29yaXRobXNWaWV3KCk7XG4gICAgICAgICAgICByZW5kZXJTdHJhdGVneUNvbmZpZygpO1xuXG4gICAgICAgICAgICBhbGVydChgSW1wb3J0ZWQgJHtjb3VudH0gc3RyYXRlZ2llcy5gKTtcbiAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5tb2RhbC1vdmVybGF5Jyk/LnJlbW92ZSgpO1xuXG4gICAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgICAgYWxlcnQoXCJJbnZhbGlkIEpTT046IFwiICsgZSk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIHNob3dNb2RhbChcIkltcG9ydCBBbGwgU3RyYXRlZ2llc1wiLCBjb250ZW50KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRTdHJhdGVnaWVzKCkge1xuICAgIGNvbnN0IGV4cG9ydEFsbEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdGVneS1saXN0LWV4cG9ydC1idG4nKTtcbiAgICBjb25zdCBpbXBvcnRBbGxCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXRlZ3ktbGlzdC1pbXBvcnQtYnRuJyk7XG4gICAgaWYgKGV4cG9ydEFsbEJ0bikgZXhwb3J0QWxsQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZXhwb3J0QWxsU3RyYXRlZ2llcyk7XG4gICAgaWYgKGltcG9ydEFsbEJ0bikgaW1wb3J0QWxsQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgaW1wb3J0QWxsU3RyYXRlZ2llcyk7XG59XG4iLCAiaW1wb3J0IHsgYXBwU3RhdGUgfSBmcm9tIFwiLi9zdGF0ZS5qc1wiO1xuaW1wb3J0IHsgc2hvd01vZGFsIH0gZnJvbSBcIi4vY29tcG9uZW50cy5qc1wiO1xuaW1wb3J0IHsgc2F2ZVN0cmF0ZWd5LCByZW5kZXJTdHJhdGVneUxvYWRPcHRpb25zLCByZW5kZXJTdHJhdGVneUxpc3RUYWJsZSB9IGZyb20gXCIuL3N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IHJlbmRlclN0cmF0ZWd5Q29uZmlnLCByZW5kZXJMaXZlVmlldyB9IGZyb20gXCIuL3NpbXVsYXRpb24uanNcIjtcbmltcG9ydCB7IGdldE1hcHBlZFRhYnMgfSBmcm9tIFwiLi9kYXRhLmpzXCI7XG5pbXBvcnQgeyBsb2FkVGFicyB9IGZyb20gXCIuL3RhYnNUYWJsZS5qc1wiO1xuaW1wb3J0IHsgU1RSQVRFR0lFUywgZ2V0U3RyYXRlZ2llcyB9IGZyb20gXCIuLi8uLi9zaGFyZWQvc3RyYXRlZ3lSZWdpc3RyeS5qc1wiO1xuaW1wb3J0IHsgQ3VzdG9tU3RyYXRlZ3ksIFJ1bGVDb25kaXRpb24sIEdyb3VwaW5nUnVsZSwgU29ydGluZ1J1bGUgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBncm91cFRhYnMsIHNldEN1c3RvbVN0cmF0ZWdpZXMgfSBmcm9tIFwiLi4vLi4vYmFja2dyb3VuZC9ncm91cGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IHNvcnRUYWJzIH0gZnJvbSBcIi4uLy4uL2JhY2tncm91bmQvc29ydGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IGxvZ0luZm8gfSBmcm9tIFwiLi4vLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgZXNjYXBlSHRtbCB9IGZyb20gXCIuLi8uLi9zaGFyZWQvdXRpbHMuanNcIjtcblxuY29uc3QgRklFTERfT1BUSU9OUyA9IGBcbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwidXJsXCI+VVJMPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInRpdGxlXCI+VGl0bGU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZG9tYWluXCI+RG9tYWluPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInN1YmRvbWFpblwiPlN1YmRvbWFpbjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJpZFwiPklEPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImluZGV4XCI+SW5kZXg8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwid2luZG93SWRcIj5XaW5kb3cgSUQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZ3JvdXBJZFwiPkdyb3VwIElEPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImFjdGl2ZVwiPkFjdGl2ZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJzZWxlY3RlZFwiPlNlbGVjdGVkPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInBpbm5lZFwiPlBpbm5lZDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJzdGF0dXNcIj5TdGF0dXM8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwib3BlbmVyVGFiSWRcIj5PcGVuZXIgSUQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwicGFyZW50VGl0bGVcIj5QYXJlbnQgVGl0bGU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwibGFzdEFjY2Vzc2VkXCI+TGFzdCBBY2Nlc3NlZDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJnZW5yZVwiPkdlbnJlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHRcIj5Db250ZXh0IFN1bW1hcnk8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEuc2l0ZU5hbWVcIj5TaXRlIE5hbWU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEuY2Fub25pY2FsVXJsXCI+Q2Fub25pY2FsIFVSTDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5ub3JtYWxpemVkVXJsXCI+Tm9ybWFsaXplZCBVUkw8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEucGxhdGZvcm1cIj5QbGF0Zm9ybTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5vYmplY3RUeXBlXCI+T2JqZWN0IFR5cGU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEub2JqZWN0SWRcIj5PYmplY3QgSUQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEudGl0bGVcIj5FeHRyYWN0ZWQgVGl0bGU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEuZGVzY3JpcHRpb25cIj5EZXNjcmlwdGlvbjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5hdXRob3JPckNyZWF0b3JcIj5BdXRob3IvQ3JlYXRvcjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5wdWJsaXNoZWRBdFwiPlB1Ymxpc2hlZCBBdDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5tb2RpZmllZEF0XCI+TW9kaWZpZWQgQXQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEubGFuZ3VhZ2VcIj5MYW5ndWFnZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5pc0F1ZGlibGVcIj5JcyBBdWRpYmxlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHREYXRhLmlzTXV0ZWRcIj5JcyBNdXRlZDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5oYXNVbnNhdmVkQ2hhbmdlc0xpa2VseVwiPlVuc2F2ZWQgQ2hhbmdlczwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5pc0F1dGhlbnRpY2F0ZWRMaWtlbHlcIj5BdXRoZW50aWNhdGVkPC9vcHRpb24+YDtcblxuY29uc3QgT1BFUkFUT1JfT1BUSU9OUyA9IGBcbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGFpbnNcIj5jb250YWluczwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJkb2VzTm90Q29udGFpblwiPmRvZXMgbm90IGNvbnRhaW48L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwibWF0Y2hlc1wiPm1hdGNoZXMgcmVnZXg8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZXF1YWxzXCI+ZXF1YWxzPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInN0YXJ0c1dpdGhcIj5zdGFydHMgd2l0aDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJlbmRzV2l0aFwiPmVuZHMgd2l0aDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJleGlzdHNcIj5leGlzdHM8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZG9lc05vdEV4aXN0XCI+ZG9lcyBub3QgZXhpc3Q8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiaXNOdWxsXCI+aXMgbnVsbDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJpc05vdE51bGxcIj5pcyBub3QgbnVsbDwvb3B0aW9uPmA7XG5cbmV4cG9ydCBmdW5jdGlvbiBpbml0U3RyYXRlZ3lCdWlsZGVyKCkge1xuICAgIGNvbnN0IGFkZEZpbHRlckdyb3VwQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FkZC1maWx0ZXItZ3JvdXAtYnRuJyk7XG4gICAgY29uc3QgYWRkR3JvdXBCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWRkLWdyb3VwLWJ0bicpO1xuICAgIGNvbnN0IGFkZFNvcnRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWRkLXNvcnQtYnRuJyk7XG4gICAgY29uc3QgbG9hZFNlbGVjdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdGVneS1sb2FkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50IHwgbnVsbDtcblxuICAgIC8vIE5ldzogR3JvdXAgU29ydGluZ1xuICAgIGNvbnN0IGFkZEdyb3VwU29ydEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhZGQtZ3JvdXAtc29ydC1idG4nKTtcbiAgICBjb25zdCBncm91cFNvcnRDaGVjayA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1zb3J0Z3JvdXBzLWNoZWNrJyk7XG5cbiAgICBjb25zdCBzYXZlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J1aWxkZXItc2F2ZS1idG4nKTtcbiAgICBjb25zdCBydW5CdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnVpbGRlci1ydW4tYnRuJyk7XG4gICAgY29uc3QgcnVuTGl2ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdidWlsZGVyLXJ1bi1saXZlLWJ0bicpO1xuICAgIGNvbnN0IGNsZWFyQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J1aWxkZXItY2xlYXItYnRuJyk7XG5cbiAgICBjb25zdCBleHBvcnRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnVpbGRlci1leHBvcnQtYnRuJyk7XG4gICAgY29uc3QgaW1wb3J0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J1aWxkZXItaW1wb3J0LWJ0bicpO1xuXG4gICAgaWYgKGV4cG9ydEJ0bikgZXhwb3J0QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZXhwb3J0QnVpbGRlclN0cmF0ZWd5KTtcbiAgICBpZiAoaW1wb3J0QnRuKSBpbXBvcnRCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBpbXBvcnRCdWlsZGVyU3RyYXRlZ3kpO1xuXG4gICAgaWYgKGFkZEZpbHRlckdyb3VwQnRuKSBhZGRGaWx0ZXJHcm91cEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGFkZEZpbHRlckdyb3VwUm93KCkpO1xuICAgIGlmIChhZGRHcm91cEJ0bikgYWRkR3JvdXBCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBhZGRCdWlsZGVyUm93KCdncm91cCcpKTtcbiAgICBpZiAoYWRkU29ydEJ0bikgYWRkU29ydEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGFkZEJ1aWxkZXJSb3coJ3NvcnQnKSk7XG4gICAgaWYgKGFkZEdyb3VwU29ydEJ0bikgYWRkR3JvdXBTb3J0QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gYWRkQnVpbGRlclJvdygnZ3JvdXBTb3J0JykpO1xuXG4gICAgaWYgKGdyb3VwU29ydENoZWNrKSB7XG4gICAgICAgIGdyb3VwU29ydENoZWNrLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIChlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjaGVja2VkID0gKGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLmNoZWNrZWQ7XG4gICAgICAgICAgICBjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ3JvdXAtc29ydC1yb3dzLWNvbnRhaW5lcicpO1xuICAgICAgICAgICAgY29uc3QgYWRkQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FkZC1ncm91cC1zb3J0LWJ0bicpO1xuICAgICAgICAgICAgaWYgKGNvbnRhaW5lciAmJiBhZGRCdG4pIHtcbiAgICAgICAgICAgICAgICBjb250YWluZXIuc3R5bGUuZGlzcGxheSA9IGNoZWNrZWQgPyAnYmxvY2snIDogJ25vbmUnO1xuICAgICAgICAgICAgICAgIGFkZEJ0bi5zdHlsZS5kaXNwbGF5ID0gY2hlY2tlZCA/ICdibG9jaycgOiAnbm9uZSc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmIChzYXZlQnRuKSBzYXZlQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gc2F2ZUN1c3RvbVN0cmF0ZWd5RnJvbUJ1aWxkZXIodHJ1ZSkpO1xuICAgIGlmIChydW5CdG4pIHJ1bkJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHJ1bkJ1aWxkZXJTaW11bGF0aW9uKTtcbiAgICBpZiAocnVuTGl2ZUJ0bikgcnVuTGl2ZUJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHJ1bkJ1aWxkZXJMaXZlKTtcbiAgICBpZiAoY2xlYXJCdG4pIGNsZWFyQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgY2xlYXJCdWlsZGVyKTtcblxuICAgIGlmIChsb2FkU2VsZWN0KSB7XG4gICAgICAgIGxvYWRTZWxlY3QuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKCkgPT4ge1xuICAgICAgICAgICAgY29uc3Qgc2VsZWN0ZWRJZCA9IGxvYWRTZWxlY3QudmFsdWU7XG4gICAgICAgICAgICBpZiAoIXNlbGVjdGVkSWQpIHJldHVybjtcblxuICAgICAgICAgICAgbGV0IHN0cmF0ID0gYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzZWxlY3RlZElkKTtcbiAgICAgICAgICAgIGlmICghc3RyYXQpIHtcbiAgICAgICAgICAgICAgICBzdHJhdCA9IGdldEJ1aWx0SW5TdHJhdGVneUNvbmZpZyhzZWxlY3RlZElkKSB8fCB1bmRlZmluZWQ7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChzdHJhdCkge1xuICAgICAgICAgICAgICAgIHBvcHVsYXRlQnVpbGRlckZyb21TdHJhdGVneShzdHJhdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEJ1aWx0SW5TdHJhdGVneUNvbmZpZyhpZDogc3RyaW5nKTogQ3VzdG9tU3RyYXRlZ3kgfCBudWxsIHtcbiAgICBjb25zdCBiYXNlOiBDdXN0b21TdHJhdGVneSA9IHtcbiAgICAgICAgaWQ6IGlkLFxuICAgICAgICBsYWJlbDogU1RSQVRFR0lFUy5maW5kKHMgPT4gcy5pZCA9PT0gaWQpPy5sYWJlbCB8fCBpZCxcbiAgICAgICAgZmlsdGVyczogW10sXG4gICAgICAgIGdyb3VwaW5nUnVsZXM6IFtdLFxuICAgICAgICBzb3J0aW5nUnVsZXM6IFtdLFxuICAgICAgICBncm91cFNvcnRpbmdSdWxlczogW10sXG4gICAgICAgIGZhbGxiYWNrOiAnTWlzYycsXG4gICAgICAgIHNvcnRHcm91cHM6IGZhbHNlLFxuICAgICAgICBhdXRvUnVuOiBmYWxzZVxuICAgIH07XG5cbiAgICBzd2l0Y2ggKGlkKSB7XG4gICAgICAgIGNhc2UgJ2RvbWFpbic6XG4gICAgICAgICAgICBiYXNlLmdyb3VwaW5nUnVsZXMgPSBbeyBzb3VyY2U6ICdmaWVsZCcsIHZhbHVlOiAnZG9tYWluJywgdHJhbnNmb3JtOiAnc3RyaXBUbGQnLCBjb2xvcjogJ3JhbmRvbScgfV07XG4gICAgICAgICAgICBiYXNlLnNvcnRpbmdSdWxlcyA9IFt7IGZpZWxkOiAnZG9tYWluJywgb3JkZXI6ICdhc2MnIH1dO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2RvbWFpbl9mdWxsJzpcbiAgICAgICAgICAgICBiYXNlLmdyb3VwaW5nUnVsZXMgPSBbeyBzb3VyY2U6ICdmaWVsZCcsIHZhbHVlOiAnZG9tYWluJywgdHJhbnNmb3JtOiAnbm9uZScsIGNvbG9yOiAncmFuZG9tJyB9XTtcbiAgICAgICAgICAgICBiYXNlLnNvcnRpbmdSdWxlcyA9IFt7IGZpZWxkOiAnZG9tYWluJywgb3JkZXI6ICdhc2MnIH1dO1xuICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICd0b3BpYyc6XG4gICAgICAgICAgICBiYXNlLmdyb3VwaW5nUnVsZXMgPSBbeyBzb3VyY2U6ICdmaWVsZCcsIHZhbHVlOiAnZ2VucmUnLCBjb2xvcjogJ3JhbmRvbScgfV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnY29udGV4dCc6XG4gICAgICAgICAgICBiYXNlLmdyb3VwaW5nUnVsZXMgPSBbeyBzb3VyY2U6ICdmaWVsZCcsIHZhbHVlOiAnY29udGV4dCcsIGNvbG9yOiAncmFuZG9tJyB9XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdsaW5lYWdlJzpcbiAgICAgICAgICAgIGJhc2UuZ3JvdXBpbmdSdWxlcyA9IFt7IHNvdXJjZTogJ2ZpZWxkJywgdmFsdWU6ICdwYXJlbnRUaXRsZScsIGNvbG9yOiAncmFuZG9tJyB9XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdwaW5uZWQnOlxuICAgICAgICAgICAgIGJhc2Uuc29ydGluZ1J1bGVzID0gW3sgZmllbGQ6ICdwaW5uZWQnLCBvcmRlcjogJ2Rlc2MnIH1dO1xuICAgICAgICAgICAgIGJhc2UuZ3JvdXBpbmdSdWxlcyA9IFt7IHNvdXJjZTogJ2ZpZWxkJywgdmFsdWU6ICdwaW5uZWQnLCBjb2xvcjogJ3JhbmRvbScgfV07XG4gICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3JlY2VuY3knOlxuICAgICAgICAgICAgYmFzZS5zb3J0aW5nUnVsZXMgPSBbeyBmaWVsZDogJ2xhc3RBY2Nlc3NlZCcsIG9yZGVyOiAnZGVzYycgfV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnYWdlJzpcbiAgICAgICAgICAgICBiYXNlLnNvcnRpbmdSdWxlcyA9IFt7IGZpZWxkOiAnbGFzdEFjY2Vzc2VkJywgb3JkZXI6ICdkZXNjJyB9XTtcbiAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAndXJsJzpcbiAgICAgICAgICAgIGJhc2Uuc29ydGluZ1J1bGVzID0gW3sgZmllbGQ6ICd1cmwnLCBvcmRlcjogJ2FzYycgfV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAndGl0bGUnOlxuICAgICAgICAgICAgYmFzZS5zb3J0aW5nUnVsZXMgPSBbeyBmaWVsZDogJ3RpdGxlJywgb3JkZXI6ICdhc2MnIH1dO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ25lc3RpbmcnOlxuICAgICAgICAgICAgIGJhc2Uuc29ydGluZ1J1bGVzID0gW3sgZmllbGQ6ICdwYXJlbnRUaXRsZScsIG9yZGVyOiAnYXNjJyB9XTtcbiAgICAgICAgICAgICBicmVhaztcbiAgICB9XG5cbiAgICByZXR1cm4gYmFzZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZEZpbHRlckdyb3VwUm93KGNvbmRpdGlvbnM/OiBSdWxlQ29uZGl0aW9uW10pIHtcbiAgICBjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZmlsdGVyLXJvd3MtY29udGFpbmVyJyk7XG4gICAgaWYgKCFjb250YWluZXIpIHJldHVybjtcblxuICAgIGNvbnN0IGdyb3VwRGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgZ3JvdXBEaXYuY2xhc3NOYW1lID0gJ2ZpbHRlci1ncm91cC1yb3cnO1xuXG4gICAgZ3JvdXBEaXYuaW5uZXJIVE1MID0gYFxuICAgICAgICA8ZGl2IGNsYXNzPVwiZmlsdGVyLWdyb3VwLWhlYWRlclwiPlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJmaWx0ZXItZ3JvdXAtdGl0bGVcIj5Hcm91cCAoQU5EKTwvc3Bhbj5cbiAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJzbWFsbC1idG4gYnRuLWRlbC1ncm91cFwiPkRlbGV0ZSBHcm91cDwvYnV0dG9uPlxuICAgICAgICA8L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImNvbmRpdGlvbnMtY29udGFpbmVyXCI+PC9kaXY+XG4gICAgICAgIDxidXR0b24gY2xhc3M9XCJzbWFsbC1idG4gYnRuLWFkZC1jb25kaXRpb25cIj4rIEFkZCBDb25kaXRpb248L2J1dHRvbj5cbiAgICBgO1xuXG4gICAgZ3JvdXBEaXYucXVlcnlTZWxlY3RvcignLmJ0bi1kZWwtZ3JvdXAnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGdyb3VwRGl2LnJlbW92ZSgpO1xuICAgICAgICB1cGRhdGVCcmVhZGNydW1iKCk7XG4gICAgfSk7XG5cbiAgICBjb25zdCBjb25kaXRpb25zQ29udGFpbmVyID0gZ3JvdXBEaXYucXVlcnlTZWxlY3RvcignLmNvbmRpdGlvbnMtY29udGFpbmVyJykgYXMgSFRNTEVsZW1lbnQ7XG4gICAgY29uc3QgYWRkQ29uZGl0aW9uQnRuID0gZ3JvdXBEaXYucXVlcnlTZWxlY3RvcignLmJ0bi1hZGQtY29uZGl0aW9uJyk7XG5cbiAgICBjb25zdCBhZGRDb25kaXRpb24gPSAoZGF0YT86IFJ1bGVDb25kaXRpb24pID0+IHtcbiAgICAgICAgY29uc3QgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIGRpdi5jbGFzc05hbWUgPSAnYnVpbGRlci1yb3cgY29uZGl0aW9uLXJvdyc7XG4gICAgICAgIGRpdi5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuICAgICAgICBkaXYuc3R5bGUuZ2FwID0gJzVweCc7XG4gICAgICAgIGRpdi5zdHlsZS5tYXJnaW5Cb3R0b20gPSAnNXB4JztcbiAgICAgICAgZGl2LnN0eWxlLmFsaWduSXRlbXMgPSAnY2VudGVyJztcblxuICAgICAgICBkaXYuaW5uZXJIVE1MID0gYFxuICAgICAgICAgICAgPHNlbGVjdCBjbGFzcz1cImZpZWxkLXNlbGVjdFwiPlxuICAgICAgICAgICAgICAgICR7RklFTERfT1BUSU9OU31cbiAgICAgICAgICAgIDwvc2VsZWN0PlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJvcGVyYXRvci1jb250YWluZXJcIj5cbiAgICAgICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwib3BlcmF0b3Itc2VsZWN0XCI+XG4gICAgICAgICAgICAgICAgICAgICR7T1BFUkFUT1JfT1BUSU9OU31cbiAgICAgICAgICAgICAgICA8L3NlbGVjdD5cbiAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwidmFsdWUtY29udGFpbmVyXCI+XG4gICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgY2xhc3M9XCJ2YWx1ZS1pbnB1dFwiIHBsYWNlaG9sZGVyPVwiVmFsdWVcIj5cbiAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJzbWFsbC1idG4gYnRuLWRlbC1jb25kaXRpb25cIiBzdHlsZT1cImJhY2tncm91bmQ6IG5vbmU7IGJvcmRlcjogbm9uZTsgY29sb3I6IHJlZDtcIj4mdGltZXM7PC9idXR0b24+XG4gICAgICAgIGA7XG5cbiAgICAgICAgY29uc3QgZmllbGRTZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLmZpZWxkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICBjb25zdCBvcGVyYXRvckNvbnRhaW5lciA9IGRpdi5xdWVyeVNlbGVjdG9yKCcub3BlcmF0b3ItY29udGFpbmVyJykgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IHZhbHVlQ29udGFpbmVyID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1jb250YWluZXInKSBhcyBIVE1MRWxlbWVudDtcblxuICAgICAgICBjb25zdCB1cGRhdGVTdGF0ZSA9IChpbml0aWFsT3A/OiBzdHJpbmcsIGluaXRpYWxWYWw/OiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHZhbCA9IGZpZWxkU2VsZWN0LnZhbHVlO1xuICAgICAgICAgICAgLy8gSGFuZGxlIGJvb2xlYW4gZmllbGRzXG4gICAgICAgICAgICBpZiAoWydzZWxlY3RlZCcsICdwaW5uZWQnXS5pbmNsdWRlcyh2YWwpKSB7XG4gICAgICAgICAgICAgICAgb3BlcmF0b3JDb250YWluZXIuaW5uZXJIVE1MID0gYDxzZWxlY3QgY2xhc3M9XCJvcGVyYXRvci1zZWxlY3RcIiBkaXNhYmxlZCBzdHlsZT1cImJhY2tncm91bmQ6ICNlZWU7IGNvbG9yOiAjNTU1O1wiPjxvcHRpb24gdmFsdWU9XCJlcXVhbHNcIj5pczwvb3B0aW9uPjwvc2VsZWN0PmA7XG4gICAgICAgICAgICAgICAgdmFsdWVDb250YWluZXIuaW5uZXJIVE1MID0gYFxuICAgICAgICAgICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwidmFsdWUtaW5wdXRcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJ0cnVlXCI+VHJ1ZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImZhbHNlXCI+RmFsc2U8L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgICAgPC9zZWxlY3Q+XG4gICAgICAgICAgICAgICAgYDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgaWYgYWxyZWFkeSBpbiBzdGFuZGFyZCBtb2RlIHRvIGF2b2lkIHVubmVjZXNzYXJ5IERPTSB0aHJhc2hpbmdcbiAgICAgICAgICAgICAgICBpZiAoIW9wZXJhdG9yQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ3NlbGVjdDpub3QoW2Rpc2FibGVkXSknKSkge1xuICAgICAgICAgICAgICAgICAgICBvcGVyYXRvckNvbnRhaW5lci5pbm5lckhUTUwgPSBgPHNlbGVjdCBjbGFzcz1cIm9wZXJhdG9yLXNlbGVjdFwiPiR7T1BFUkFUT1JfT1BUSU9OU308L3NlbGVjdD5gO1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZUNvbnRhaW5lci5pbm5lckhUTUwgPSBgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgY2xhc3M9XCJ2YWx1ZS1pbnB1dFwiIHBsYWNlaG9sZGVyPVwiVmFsdWVcIj5gO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gUmVzdG9yZSB2YWx1ZXMgaWYgcHJvdmlkZWQgKGVzcGVjaWFsbHkgd2hlbiBzd2l0Y2hpbmcgYmFjayBvciBpbml0aWFsaXppbmcpXG4gICAgICAgICAgICBpZiAoaW5pdGlhbE9wIHx8IGluaXRpYWxWYWwpIHtcbiAgICAgICAgICAgICAgICAgY29uc3Qgb3BFbCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcub3BlcmF0b3Itc2VsZWN0JykgYXMgSFRNTElucHV0RWxlbWVudCB8IEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICAgICAgICAgICBjb25zdCB2YWxFbCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcudmFsdWUtaW5wdXQnKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgICAgICAgICAgIGlmIChvcEVsICYmIGluaXRpYWxPcCkgb3BFbC52YWx1ZSA9IGluaXRpYWxPcDtcbiAgICAgICAgICAgICAgICAgaWYgKHZhbEVsICYmIGluaXRpYWxWYWwpIHZhbEVsLnZhbHVlID0gaW5pdGlhbFZhbDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gUmUtYXR0YWNoIGxpc3RlbmVycyB0byBuZXcgZWxlbWVudHNcbiAgICAgICAgICAgIGRpdi5xdWVyeVNlbGVjdG9yQWxsKCdpbnB1dCwgc2VsZWN0JykuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgICAgICAgICAgZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgdXBkYXRlQnJlYWRjcnVtYik7XG4gICAgICAgICAgICAgICAgZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcignaW5wdXQnLCB1cGRhdGVCcmVhZGNydW1iKTtcbiAgICAgICAgICAgICAgICBlbC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB1cGRhdGVCcmVhZGNydW1iKTtcbiAgICAgICAgICAgICAgICBlbC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIHVwZGF0ZUJyZWFkY3J1bWIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgZmllbGRTZWxlY3QuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKCkgPT4ge1xuICAgICAgICAgICAgdXBkYXRlU3RhdGUoKTtcbiAgICAgICAgICAgIHVwZGF0ZUJyZWFkY3J1bWIoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKGRhdGEpIHtcbiAgICAgICAgICAgIGZpZWxkU2VsZWN0LnZhbHVlID0gZGF0YS5maWVsZDtcbiAgICAgICAgICAgIHVwZGF0ZVN0YXRlKGRhdGEub3BlcmF0b3IsIGRhdGEudmFsdWUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdXBkYXRlU3RhdGUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGRpdi5xdWVyeVNlbGVjdG9yKCcuYnRuLWRlbC1jb25kaXRpb24nKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgICBkaXYucmVtb3ZlKCk7XG4gICAgICAgICAgICB1cGRhdGVCcmVhZGNydW1iKCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbmRpdGlvbnNDb250YWluZXIuYXBwZW5kQ2hpbGQoZGl2KTtcbiAgICB9O1xuXG4gICAgYWRkQ29uZGl0aW9uQnRuPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGFkZENvbmRpdGlvbigpKTtcblxuICAgIGlmIChjb25kaXRpb25zICYmIGNvbmRpdGlvbnMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25kaXRpb25zLmZvckVhY2goYyA9PiBhZGRDb25kaXRpb24oYykpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIEFkZCBvbmUgZW1wdHkgY29uZGl0aW9uIGJ5IGRlZmF1bHRcbiAgICAgICAgYWRkQ29uZGl0aW9uKCk7XG4gICAgfVxuXG4gICAgY29udGFpbmVyLmFwcGVuZENoaWxkKGdyb3VwRGl2KTtcbiAgICB1cGRhdGVCcmVhZGNydW1iKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRCdWlsZGVyUm93KHR5cGU6ICdncm91cCcgfCAnc29ydCcgfCAnZ3JvdXBTb3J0JywgZGF0YT86IGFueSkge1xuICAgIGxldCBjb250YWluZXJJZCA9ICcnO1xuICAgIGlmICh0eXBlID09PSAnZ3JvdXAnKSBjb250YWluZXJJZCA9ICdncm91cC1yb3dzLWNvbnRhaW5lcic7XG4gICAgZWxzZSBpZiAodHlwZSA9PT0gJ3NvcnQnKSBjb250YWluZXJJZCA9ICdzb3J0LXJvd3MtY29udGFpbmVyJztcbiAgICBlbHNlIGlmICh0eXBlID09PSAnZ3JvdXBTb3J0JykgY29udGFpbmVySWQgPSAnZ3JvdXAtc29ydC1yb3dzLWNvbnRhaW5lcic7XG5cbiAgICBjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChjb250YWluZXJJZCk7XG4gICAgaWYgKCFjb250YWluZXIpIHJldHVybjtcblxuICAgIGNvbnN0IGRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGRpdi5jbGFzc05hbWUgPSAnYnVpbGRlci1yb3cnO1xuICAgIGRpdi5kYXRhc2V0LnR5cGUgPSB0eXBlO1xuXG4gICAgaWYgKHR5cGUgPT09ICdncm91cCcpIHtcbiAgICAgICAgZGl2LnN0eWxlLmZsZXhXcmFwID0gJ3dyYXAnO1xuICAgICAgICBkaXYuaW5uZXJIVE1MID0gYFxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJyb3ctbnVtYmVyXCI+PC9zcGFuPlxuICAgICAgICAgICAgPHNlbGVjdCBjbGFzcz1cInNvdXJjZS1zZWxlY3RcIj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZmllbGRcIj5GaWVsZDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJmaXhlZFwiPkZpeGVkIFZhbHVlPC9vcHRpb24+XG4gICAgICAgICAgICA8L3NlbGVjdD5cblxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJpbnB1dC1jb250YWluZXJcIj5cbiAgICAgICAgICAgICAgICAgPCEtLSBXaWxsIGJlIHBvcHVsYXRlZCBiYXNlZCBvbiBzb3VyY2Ugc2VsZWN0aW9uIC0tPlxuICAgICAgICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwiZmllbGQtc2VsZWN0IHZhbHVlLWlucHV0LWZpZWxkXCI+XG4gICAgICAgICAgICAgICAgICAgICR7RklFTERfT1BUSU9OU31cbiAgICAgICAgICAgICAgICAgPC9zZWxlY3Q+XG4gICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwidGV4dFwiIGNsYXNzPVwidmFsdWUtaW5wdXQtdGV4dFwiIHBsYWNlaG9sZGVyPVwiR3JvdXAgTmFtZVwiIHN0eWxlPVwiZGlzcGxheTpub25lO1wiPlxuICAgICAgICAgICAgPC9zcGFuPlxuXG4gICAgICAgICAgICA8c3BhbiBzdHlsZT1cIm1hcmdpbi1sZWZ0OiAxMHB4O1wiPlRyYW5zZm9ybTo8L3NwYW4+XG4gICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwidHJhbnNmb3JtLXNlbGVjdFwiPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJub25lXCI+Tm9uZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJzdHJpcFRsZFwiPlN0cmlwIFRMRDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJkb21haW5cIj5HZXQgRG9tYWluPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImhvc3RuYW1lXCI+R2V0IEhvc3RuYW1lPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImxvd2VyY2FzZVwiPkxvd2VyY2FzZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJ1cHBlcmNhc2VcIj5VcHBlcmNhc2U8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZmlyc3RDaGFyXCI+Rmlyc3QgQ2hhcjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJyZWdleFwiPlJlZ2V4IEV4dHJhY3Rpb248L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwicmVnZXhSZXBsYWNlXCI+UmVnZXggUmVwbGFjZTwvb3B0aW9uPlxuICAgICAgICAgICAgPC9zZWxlY3Q+XG5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJyZWdleC1jb250YWluZXJcIiBzdHlsZT1cImRpc3BsYXk6bm9uZTsgZmxleC1iYXNpczogMTAwJTsgbWFyZ2luLXRvcDogOHB4OyBwYWRkaW5nOiA4cHg7IGJhY2tncm91bmQ6ICNmOGY5ZmE7IGJvcmRlcjogMXB4IGRhc2hlZCAjY2VkNGRhOyBib3JkZXItcmFkaXVzOiA0cHg7XCI+XG4gICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGdhcDogOHB4OyBtYXJnaW4tYm90dG9tOiA1cHg7XCI+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiZm9udC13ZWlnaHQ6IDUwMDsgZm9udC1zaXplOiAwLjllbTtcIj5QYXR0ZXJuOjwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgY2xhc3M9XCJ0cmFuc2Zvcm0tcGF0dGVyblwiIHBsYWNlaG9sZGVyPVwiZS5nLiBeKFxcdyspLShcXGQrKSRcIiBzdHlsZT1cImZsZXg6MTtcIj5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW4gdGl0bGU9XCJGb3IgZXh0cmFjdGlvbjogQ2FwdHVyZXMgYWxsIGdyb3VwcyBhbmQgY29uY2F0ZW5hdGVzIHRoZW0uIEV4YW1wbGU6ICd1c2VyLShcXGQrKScgLT4gJzEyMycuIEZvciByZXBsYWNlbWVudDogU3RhbmRhcmQgSlMgcmVnZXguXCIgc3R5bGU9XCJjdXJzb3I6IGhlbHA7IGNvbG9yOiAjMDA3YmZmOyBmb250LXdlaWdodDogYm9sZDsgYmFja2dyb3VuZDogI2U3ZjFmZjsgd2lkdGg6IDE4cHg7IGhlaWdodDogMThweDsgZGlzcGxheTogaW5saW5lLWZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGp1c3RpZnktY29udGVudDogY2VudGVyOyBib3JkZXItcmFkaXVzOiA1MCU7IGZvbnQtc2l6ZTogMTJweDtcIj4/PC9zcGFuPlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJyZXBsYWNlbWVudC1jb250YWluZXJcIiBzdHlsZT1cImRpc3BsYXk6bm9uZTsgYWxpZ24taXRlbXM6IGNlbnRlcjsgZ2FwOiA4cHg7IG1hcmdpbi1ib3R0b206IDVweDtcIj5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJmb250LXdlaWdodDogNTAwOyBmb250LXNpemU6IDAuOWVtO1wiPlJlcGxhY2U6PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInRleHRcIiBjbGFzcz1cInRyYW5zZm9ybS1yZXBsYWNlbWVudFwiIHBsYWNlaG9sZGVyPVwiZS5nLiAkMiAkMVwiIHN0eWxlPVwiZmxleDoxO1wiPlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBnYXA6IDhweDsgYWxpZ24taXRlbXM6IGNlbnRlcjsgZm9udC1zaXplOiAwLjllbTtcIj5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJmb250LXdlaWdodDogNTAwO1wiPlRlc3Q6PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInRleHRcIiBjbGFzcz1cInJlZ2V4LXRlc3QtaW5wdXRcIiBwbGFjZWhvbGRlcj1cIlRlc3QgU3RyaW5nXCIgc3R5bGU9XCJmbGV4OiAxO1wiPlxuICAgICAgICAgICAgICAgICAgICA8c3Bhbj4mcmFycjs8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwicmVnZXgtdGVzdC1yZXN1bHRcIiBzdHlsZT1cImZvbnQtZmFtaWx5OiBtb25vc3BhY2U7IGJhY2tncm91bmQ6IHdoaXRlOyBwYWRkaW5nOiAycHggNXB4OyBib3JkZXI6IDFweCBzb2xpZCAjZGRkOyBib3JkZXItcmFkaXVzOiAzcHg7IG1pbi13aWR0aDogNjBweDtcIj4ocHJldmlldyk8L3NwYW4+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJtYXJnaW4tbGVmdDogMTBweDtcIj5XaW5kb3c6PC9zcGFuPlxuICAgICAgICAgICAgPHNlbGVjdCBjbGFzcz1cIndpbmRvdy1tb2RlLXNlbGVjdFwiPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjdXJyZW50XCI+Q3VycmVudDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb21wb3VuZFwiPkNvbXBvdW5kPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIm5ld1wiPk5ldzwvb3B0aW9uPlxuICAgICAgICAgICAgPC9zZWxlY3Q+XG5cbiAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwibWFyZ2luLWxlZnQ6IDEwcHg7XCI+Q29sb3I6PC9zcGFuPlxuICAgICAgICAgICAgPHNlbGVjdCBjbGFzcz1cImNvbG9yLWlucHV0XCI+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImdyZXlcIj5HcmV5PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImJsdWVcIj5CbHVlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInJlZFwiPlJlZDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJ5ZWxsb3dcIj5ZZWxsb3c8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZ3JlZW5cIj5HcmVlbjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJwaW5rXCI+UGluazwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJwdXJwbGVcIj5QdXJwbGU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY3lhblwiPkN5YW48L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwib3JhbmdlXCI+T3JhbmdlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIm1hdGNoXCI+TWF0Y2ggVmFsdWU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZmllbGRcIj5Db2xvciBieSBGaWVsZDwvb3B0aW9uPlxuICAgICAgICAgICAgPC9zZWxlY3Q+XG4gICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwiY29sb3ItZmllbGQtc2VsZWN0XCIgc3R5bGU9XCJkaXNwbGF5Om5vbmU7XCI+XG4gICAgICAgICAgICAgICAgJHtGSUVMRF9PUFRJT05TfVxuICAgICAgICAgICAgPC9zZWxlY3Q+XG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cImNvbG9yLXRyYW5zZm9ybS1jb250YWluZXJcIiBzdHlsZT1cImRpc3BsYXk6bm9uZTsgbWFyZ2luLWxlZnQ6IDVweDsgYWxpZ24taXRlbXM6IGNlbnRlcjtcIj5cbiAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cImZvbnQtc2l6ZTogMC45ZW07IG1hcmdpbi1yaWdodDogM3B4O1wiPlRyYW5zOjwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwiY29sb3ItdHJhbnNmb3JtLXNlbGVjdFwiPlxuICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwibm9uZVwiPk5vbmU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInN0cmlwVGxkXCI+U3RyaXAgVExEPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJkb21haW5cIj5HZXQgRG9tYWluPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJob3N0bmFtZVwiPkdldCBIb3N0bmFtZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwibG93ZXJjYXNlXCI+TG93ZXJjYXNlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJ1cHBlcmNhc2VcIj5VcHBlcmNhc2U8L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImZpcnN0Q2hhclwiPkZpcnN0IENoYXI8L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInJlZ2V4XCI+UmVnZXg8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8L3NlbGVjdD5cbiAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInRleHRcIiBjbGFzcz1cImNvbG9yLXRyYW5zZm9ybS1wYXR0ZXJuXCIgcGxhY2Vob2xkZXI9XCJSZWdleFwiIHN0eWxlPVwiZGlzcGxheTpub25lOyB3aWR0aDogODBweDsgbWFyZ2luLWxlZnQ6IDNweDtcIj5cbiAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgICAgIDxsYWJlbD48aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgY2xhc3M9XCJyYW5kb20tY29sb3ItY2hlY2tcIiBjaGVja2VkPiBSYW5kb208L2xhYmVsPlxuXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwicm93LWFjdGlvbnNcIj5cbiAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwic21hbGwtYnRuIGJ0bi1kZWxcIiBzdHlsZT1cImJhY2tncm91bmQ6ICNmZmNjY2M7IGNvbG9yOiBkYXJrcmVkO1wiPkRlbGV0ZTwvYnV0dG9uPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgIGA7XG5cbiAgICAgICAgLy8gQWRkIHNwZWNpZmljIGxpc3RlbmVycyBmb3IgR3JvdXAgcm93XG4gICAgICAgIGNvbnN0IHNvdXJjZVNlbGVjdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcuc291cmNlLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICBjb25zdCBmaWVsZFNlbGVjdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcudmFsdWUtaW5wdXQtZmllbGQnKSBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgY29uc3QgdGV4dElucHV0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dC10ZXh0JykgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IGNvbG9ySW5wdXQgPSBkaXYucXVlcnlTZWxlY3RvcignLmNvbG9yLWlucHV0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IGNvbG9yRmllbGRTZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLmNvbG9yLWZpZWxkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICBjb25zdCBjb2xvclRyYW5zZm9ybUNvbnRhaW5lciA9IGRpdi5xdWVyeVNlbGVjdG9yKCcuY29sb3ItdHJhbnNmb3JtLWNvbnRhaW5lcicpIGFzIEhUTUxFbGVtZW50O1xuICAgICAgICBjb25zdCBjb2xvclRyYW5zZm9ybVNlbGVjdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcuY29sb3ItdHJhbnNmb3JtLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICBjb25zdCBjb2xvclRyYW5zZm9ybVBhdHRlcm4gPSBkaXYucXVlcnlTZWxlY3RvcignLmNvbG9yLXRyYW5zZm9ybS1wYXR0ZXJuJykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgY29uc3QgcmFuZG9tQ2hlY2sgPSBkaXYucXVlcnlTZWxlY3RvcignLnJhbmRvbS1jb2xvci1jaGVjaycpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG5cbiAgICAgICAgLy8gUmVnZXggTG9naWNcbiAgICAgICAgY29uc3QgdHJhbnNmb3JtU2VsZWN0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy50cmFuc2Zvcm0tc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IHJlZ2V4Q29udGFpbmVyID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5yZWdleC1jb250YWluZXInKSBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgY29uc3QgcGF0dGVybklucHV0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy50cmFuc2Zvcm0tcGF0dGVybicpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IHJlcGxhY2VtZW50SW5wdXQgPSBkaXYucXVlcnlTZWxlY3RvcignLnRyYW5zZm9ybS1yZXBsYWNlbWVudCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IHRlc3RJbnB1dCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcucmVnZXgtdGVzdC1pbnB1dCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IHRlc3RSZXN1bHQgPSBkaXYucXVlcnlTZWxlY3RvcignLnJlZ2V4LXRlc3QtcmVzdWx0JykgYXMgSFRNTEVsZW1lbnQ7XG5cbiAgICAgICAgY29uc3QgdG9nZ2xlVHJhbnNmb3JtID0gKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgdmFsID0gdHJhbnNmb3JtU2VsZWN0LnZhbHVlO1xuICAgICAgICAgICAgaWYgKHZhbCA9PT0gJ3JlZ2V4JyB8fCB2YWwgPT09ICdyZWdleFJlcGxhY2UnKSB7XG4gICAgICAgICAgICAgICAgcmVnZXhDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVwQ29udGFpbmVyID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5yZXBsYWNlbWVudC1jb250YWluZXInKSBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgICAgICAgICBpZiAocmVwQ29udGFpbmVyKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlcENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gdmFsID09PSAncmVnZXhSZXBsYWNlJyA/ICdmbGV4JyA6ICdub25lJztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlZ2V4Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB1cGRhdGVCcmVhZGNydW1iKCk7XG4gICAgICAgIH07XG4gICAgICAgIHRyYW5zZm9ybVNlbGVjdC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB0b2dnbGVUcmFuc2Zvcm0pO1xuXG4gICAgICAgIGNvbnN0IHVwZGF0ZVRlc3QgPSAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBwYXQgPSBwYXR0ZXJuSW5wdXQudmFsdWU7XG4gICAgICAgICAgICBjb25zdCB0eHQgPSB0ZXN0SW5wdXQudmFsdWU7XG4gICAgICAgICAgICBpZiAoIXBhdCB8fCAhdHh0KSB7XG4gICAgICAgICAgICAgICAgIHRlc3RSZXN1bHQudGV4dENvbnRlbnQgPSBcIihwcmV2aWV3KVwiO1xuICAgICAgICAgICAgICAgICB0ZXN0UmVzdWx0LnN0eWxlLmNvbG9yID0gXCIjNTU1XCI7XG4gICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgaWYgKHRyYW5zZm9ybVNlbGVjdC52YWx1ZSA9PT0gJ3JlZ2V4UmVwbGFjZScpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVwID0gcmVwbGFjZW1lbnRJbnB1dC52YWx1ZSB8fCBcIlwiO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByZXMgPSB0eHQucmVwbGFjZShuZXcgUmVnRXhwKHBhdCwgJ2cnKSwgcmVwKTtcbiAgICAgICAgICAgICAgICAgICAgdGVzdFJlc3VsdC50ZXh0Q29udGVudCA9IHJlcztcbiAgICAgICAgICAgICAgICAgICAgdGVzdFJlc3VsdC5zdHlsZS5jb2xvciA9IFwiZ3JlZW5cIjtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByZWdleCA9IG5ldyBSZWdFeHAocGF0KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbWF0Y2ggPSByZWdleC5leGVjKHR4dCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgIGxldCBleHRyYWN0ZWQgPSBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgbWF0Y2gubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXh0cmFjdGVkICs9IG1hdGNoW2ldIHx8IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgIHRlc3RSZXN1bHQudGV4dENvbnRlbnQgPSBleHRyYWN0ZWQgfHwgXCIoZW1wdHkgZ3JvdXApXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgdGVzdFJlc3VsdC5zdHlsZS5jb2xvciA9IFwiZ3JlZW5cIjtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICB0ZXN0UmVzdWx0LnRleHRDb250ZW50ID0gXCIobm8gbWF0Y2gpXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgdGVzdFJlc3VsdC5zdHlsZS5jb2xvciA9IFwicmVkXCI7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgdGVzdFJlc3VsdC50ZXh0Q29udGVudCA9IFwiKGludmFsaWQgcmVnZXgpXCI7XG4gICAgICAgICAgICAgICAgdGVzdFJlc3VsdC5zdHlsZS5jb2xvciA9IFwicmVkXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHBhdHRlcm5JbnB1dC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsICgpID0+IHsgdXBkYXRlVGVzdCgpOyB1cGRhdGVCcmVhZGNydW1iKCk7IH0pO1xuICAgICAgICBpZiAocmVwbGFjZW1lbnRJbnB1dCkge1xuICAgICAgICAgICAgcmVwbGFjZW1lbnRJbnB1dC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsICgpID0+IHsgdXBkYXRlVGVzdCgpOyB1cGRhdGVCcmVhZGNydW1iKCk7IH0pO1xuICAgICAgICB9XG4gICAgICAgIHRlc3RJbnB1dC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIHVwZGF0ZVRlc3QpO1xuXG5cbiAgICAgICAgLy8gVG9nZ2xlIGlucHV0IHR5cGVcbiAgICAgICAgY29uc3QgdG9nZ2xlSW5wdXQgPSAoKSA9PiB7XG4gICAgICAgICAgICBpZiAoc291cmNlU2VsZWN0LnZhbHVlID09PSAnZmllbGQnKSB7XG4gICAgICAgICAgICAgICAgZmllbGRTZWxlY3Quc3R5bGUuZGlzcGxheSA9ICdpbmxpbmUtYmxvY2snO1xuICAgICAgICAgICAgICAgIHRleHRJbnB1dC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBmaWVsZFNlbGVjdC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICAgICAgICAgIHRleHRJbnB1dC5zdHlsZS5kaXNwbGF5ID0gJ2lubGluZS1ibG9jayc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB1cGRhdGVCcmVhZGNydW1iKCk7XG4gICAgICAgIH07XG4gICAgICAgIHNvdXJjZVNlbGVjdC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB0b2dnbGVJbnB1dCk7XG5cbiAgICAgICAgLy8gVG9nZ2xlIGNvbG9yIHRyYW5zZm9ybSBwYXR0ZXJuXG4gICAgICAgIGNvbnN0IHRvZ2dsZUNvbG9yVHJhbnNmb3JtID0gKCkgPT4ge1xuICAgICAgICAgICAgIGlmIChjb2xvclRyYW5zZm9ybVNlbGVjdC52YWx1ZSA9PT0gJ3JlZ2V4Jykge1xuICAgICAgICAgICAgICAgICBjb2xvclRyYW5zZm9ybVBhdHRlcm4uc3R5bGUuZGlzcGxheSA9ICdpbmxpbmUtYmxvY2snO1xuICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgIGNvbG9yVHJhbnNmb3JtUGF0dGVybi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB1cGRhdGVCcmVhZGNydW1iKCk7XG4gICAgICAgIH07XG4gICAgICAgIGNvbG9yVHJhbnNmb3JtU2VsZWN0LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIHRvZ2dsZUNvbG9yVHJhbnNmb3JtKTtcbiAgICAgICAgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuLmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgdXBkYXRlQnJlYWRjcnVtYik7XG5cbiAgICAgICAgLy8gVG9nZ2xlIGNvbG9yIGlucHV0XG4gICAgICAgIGNvbnN0IHRvZ2dsZUNvbG9yID0gKCkgPT4ge1xuICAgICAgICAgICAgaWYgKHJhbmRvbUNoZWNrLmNoZWNrZWQpIHtcbiAgICAgICAgICAgICAgICBjb2xvcklucHV0LmRpc2FibGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBjb2xvcklucHV0LnN0eWxlLm9wYWNpdHkgPSAnMC41JztcbiAgICAgICAgICAgICAgICBjb2xvckZpZWxkU2VsZWN0LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm1Db250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29sb3JJbnB1dC5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGNvbG9ySW5wdXQuc3R5bGUub3BhY2l0eSA9ICcxJztcbiAgICAgICAgICAgICAgICBpZiAoY29sb3JJbnB1dC52YWx1ZSA9PT0gJ2ZpZWxkJykge1xuICAgICAgICAgICAgICAgICAgICBjb2xvckZpZWxkU2VsZWN0LnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lLWJsb2NrJztcbiAgICAgICAgICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm1Db250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdpbmxpbmUtZmxleCc7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgY29sb3JGaWVsZFNlbGVjdC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICAgICAgICAgICAgICBjb2xvclRyYW5zZm9ybUNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgcmFuZG9tQ2hlY2suYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgdG9nZ2xlQ29sb3IpO1xuICAgICAgICBjb2xvcklucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIHRvZ2dsZUNvbG9yKTtcbiAgICAgICAgdG9nZ2xlQ29sb3IoKTsgLy8gaW5pdFxuXG4gICAgfSBlbHNlIGlmICh0eXBlID09PSAnc29ydCcgfHwgdHlwZSA9PT0gJ2dyb3VwU29ydCcpIHtcbiAgICAgICAgZGl2LmlubmVySFRNTCA9IGBcbiAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJmaWVsZC1zZWxlY3RcIj5cbiAgICAgICAgICAgICAgICAke0ZJRUxEX09QVElPTlN9XG4gICAgICAgICAgICA8L3NlbGVjdD5cbiAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJvcmRlci1zZWxlY3RcIj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiYXNjXCI+YSB0byB6IChhc2MpPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImRlc2NcIj56IHRvIGEgKGRlc2MpPC9vcHRpb24+XG4gICAgICAgICAgICA8L3NlbGVjdD5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJyb3ctYWN0aW9uc1wiPlxuICAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwic21hbGwtYnRuIGJ0bi1kZWxcIiBzdHlsZT1cImJhY2tncm91bmQ6ICNmZmNjY2M7IGNvbG9yOiBkYXJrcmVkO1wiPkRlbGV0ZTwvYnV0dG9uPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgIGA7XG4gICAgfVxuXG4gICAgLy8gUG9wdWxhdGUgZGF0YSBpZiBwcm92aWRlZCAoZm9yIGVkaXRpbmcpXG4gICAgaWYgKGRhdGEpIHtcbiAgICAgICAgaWYgKHR5cGUgPT09ICdncm91cCcpIHtcbiAgICAgICAgICAgIGNvbnN0IHNvdXJjZVNlbGVjdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcuc291cmNlLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICAgICAgY29uc3QgZmllbGRTZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLnZhbHVlLWlucHV0LWZpZWxkJykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgICAgICBjb25zdCB0ZXh0SW5wdXQgPSBkaXYucXVlcnlTZWxlY3RvcignLnZhbHVlLWlucHV0LXRleHQnKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICAgICAgY29uc3QgdHJhbnNmb3JtU2VsZWN0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy50cmFuc2Zvcm0tc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgICAgICBjb25zdCBjb2xvcklucHV0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5jb2xvci1pbnB1dCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICAgICAgY29uc3QgY29sb3JGaWVsZFNlbGVjdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcuY29sb3ItZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgICAgICBjb25zdCBjb2xvclRyYW5zZm9ybVNlbGVjdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcuY29sb3ItdHJhbnNmb3JtLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICAgICAgY29uc3QgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5jb2xvci10cmFuc2Zvcm0tcGF0dGVybicpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgICAgICBjb25zdCByYW5kb21DaGVjayA9IGRpdi5xdWVyeVNlbGVjdG9yKCcucmFuZG9tLWNvbG9yLWNoZWNrJykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgICAgIGNvbnN0IHdpbmRvd01vZGVTZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLndpbmRvdy1tb2RlLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuXG4gICAgICAgICAgICBpZiAoZGF0YS5zb3VyY2UpIHNvdXJjZVNlbGVjdC52YWx1ZSA9IGRhdGEuc291cmNlO1xuXG4gICAgICAgICAgICAvLyBUcmlnZ2VyIHRvZ2dsZSB0byBzaG93IGNvcnJlY3QgaW5wdXRcbiAgICAgICAgICAgIHNvdXJjZVNlbGVjdC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJykpO1xuXG4gICAgICAgICAgICBpZiAoZGF0YS5zb3VyY2UgPT09ICdmaWVsZCcpIHtcbiAgICAgICAgICAgICAgICBpZiAoZGF0YS52YWx1ZSkgZmllbGRTZWxlY3QudmFsdWUgPSBkYXRhLnZhbHVlO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAoZGF0YS52YWx1ZSkgdGV4dElucHV0LnZhbHVlID0gZGF0YS52YWx1ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGRhdGEudHJhbnNmb3JtKSB0cmFuc2Zvcm1TZWxlY3QudmFsdWUgPSBkYXRhLnRyYW5zZm9ybTtcbiAgICAgICAgICAgIGlmIChkYXRhLnRyYW5zZm9ybVBhdHRlcm4pIChkaXYucXVlcnlTZWxlY3RvcignLnRyYW5zZm9ybS1wYXR0ZXJuJykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUgPSBkYXRhLnRyYW5zZm9ybVBhdHRlcm47XG4gICAgICAgICAgICBpZiAoZGF0YS50cmFuc2Zvcm1SZXBsYWNlbWVudCkgKGRpdi5xdWVyeVNlbGVjdG9yKCcudHJhbnNmb3JtLXJlcGxhY2VtZW50JykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUgPSBkYXRhLnRyYW5zZm9ybVJlcGxhY2VtZW50O1xuXG4gICAgICAgICAgICAvLyBUcmlnZ2VyIHRvZ2dsZSBmb3IgcmVnZXggVUlcbiAgICAgICAgICAgIHRyYW5zZm9ybVNlbGVjdC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJykpO1xuXG4gICAgICAgICAgICBpZiAoZGF0YS53aW5kb3dNb2RlKSB3aW5kb3dNb2RlU2VsZWN0LnZhbHVlID0gZGF0YS53aW5kb3dNb2RlO1xuXG4gICAgICAgICAgICBpZiAoZGF0YS5jb2xvciAmJiBkYXRhLmNvbG9yICE9PSAncmFuZG9tJykge1xuICAgICAgICAgICAgICAgIHJhbmRvbUNoZWNrLmNoZWNrZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBjb2xvcklucHV0LnZhbHVlID0gZGF0YS5jb2xvcjtcbiAgICAgICAgICAgICAgICBpZiAoZGF0YS5jb2xvciA9PT0gJ2ZpZWxkJyAmJiBkYXRhLmNvbG9yRmllbGQpIHtcbiAgICAgICAgICAgICAgICAgICAgY29sb3JGaWVsZFNlbGVjdC52YWx1ZSA9IGRhdGEuY29sb3JGaWVsZDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGRhdGEuY29sb3JUcmFuc2Zvcm0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICBjb2xvclRyYW5zZm9ybVNlbGVjdC52YWx1ZSA9IGRhdGEuY29sb3JUcmFuc2Zvcm07XG4gICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRhdGEuY29sb3JUcmFuc2Zvcm1QYXR0ZXJuKSBjb2xvclRyYW5zZm9ybVBhdHRlcm4udmFsdWUgPSBkYXRhLmNvbG9yVHJhbnNmb3JtUGF0dGVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmFuZG9tQ2hlY2suY2hlY2tlZCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAgLy8gVHJpZ2dlciB0b2dnbGUgY29sb3JcbiAgICAgICAgICAgIHJhbmRvbUNoZWNrLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnKSk7XG4gICAgICAgICAgICBjb2xvclRyYW5zZm9ybVNlbGVjdC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJykpO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdzb3J0JyB8fCB0eXBlID09PSAnZ3JvdXBTb3J0Jykge1xuICAgICAgICAgICAgIGlmIChkYXRhLmZpZWxkKSAoZGl2LnF1ZXJ5U2VsZWN0b3IoJy5maWVsZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWUgPSBkYXRhLmZpZWxkO1xuICAgICAgICAgICAgIGlmIChkYXRhLm9yZGVyKSAoZGl2LnF1ZXJ5U2VsZWN0b3IoJy5vcmRlci1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWUgPSBkYXRhLm9yZGVyO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gTGlzdGVuZXJzIChHZW5lcmFsKVxuICAgIGRpdi5xdWVyeVNlbGVjdG9yKCcuYnRuLWRlbCcpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgZGl2LnJlbW92ZSgpO1xuICAgICAgICB1cGRhdGVCcmVhZGNydW1iKCk7XG4gICAgfSk7XG5cbiAgICAvLyBBTkQgLyBPUiBsaXN0ZW5lcnMgKFZpc3VhbCBtYWlubHksIG9yIGFwcGVuZGluZyBuZXcgcm93cylcbiAgICBkaXYucXVlcnlTZWxlY3RvcignLmJ0bi1hbmQnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGFkZEJ1aWxkZXJSb3codHlwZSk7IC8vIEp1c3QgYWRkIGFub3RoZXIgcm93XG4gICAgfSk7XG5cbiAgICBkaXYucXVlcnlTZWxlY3RvckFsbCgnaW5wdXQsIHNlbGVjdCcpLmZvckVhY2goZWwgPT4ge1xuICAgICAgICBlbC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB1cGRhdGVCcmVhZGNydW1iKTtcbiAgICAgICAgZWwuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCB1cGRhdGVCcmVhZGNydW1iKTtcbiAgICB9KTtcblxuICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChkaXYpO1xuICAgIHVwZGF0ZUJyZWFkY3J1bWIoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsZWFyQnVpbGRlcigpIHtcbiAgICAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LW5hbWUnKSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSA9ICcnO1xuICAgIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtZGVzYycpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlID0gJyc7XG5cbiAgICAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LWF1dG9ydW4nKSBhcyBIVE1MSW5wdXRFbGVtZW50KS5jaGVja2VkID0gZmFsc2U7XG4gICAgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1zZXBhcmF0ZS13aW5kb3cnKSBhcyBIVE1MSW5wdXRFbGVtZW50KS5jaGVja2VkID0gZmFsc2U7XG5cbiAgICBjb25zdCBzb3J0R3JvdXBzQ2hlY2sgPSAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LXNvcnRncm91cHMtY2hlY2snKSBhcyBIVE1MSW5wdXRFbGVtZW50KTtcbiAgICBpZiAoc29ydEdyb3Vwc0NoZWNrKSB7XG4gICAgICAgIHNvcnRHcm91cHNDaGVjay5jaGVja2VkID0gZmFsc2U7XG4gICAgICAgIC8vIFRyaWdnZXIgY2hhbmdlIHRvIGhpZGUgY29udGFpbmVyXG4gICAgICAgIHNvcnRHcm91cHNDaGVjay5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJykpO1xuICAgIH1cblxuICAgIGNvbnN0IGxvYWRTZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXRlZ3ktbG9hZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICBpZiAobG9hZFNlbGVjdCkgbG9hZFNlbGVjdC52YWx1ZSA9ICcnO1xuXG4gICAgWydmaWx0ZXItcm93cy1jb250YWluZXInLCAnZ3JvdXAtcm93cy1jb250YWluZXInLCAnc29ydC1yb3dzLWNvbnRhaW5lcicsICdncm91cC1zb3J0LXJvd3MtY29udGFpbmVyJ10uZm9yRWFjaChpZCA9PiB7XG4gICAgICAgIGNvbnN0IGVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaWQpO1xuICAgICAgICBpZiAoZWwpIGVsLmlubmVySFRNTCA9ICcnO1xuICAgIH0pO1xuXG4gICAgY29uc3QgYnVpbGRlclJlc3VsdHMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnVpbGRlci1yZXN1bHRzJyk7XG4gICAgaWYgKGJ1aWxkZXJSZXN1bHRzKSBidWlsZGVyUmVzdWx0cy5pbm5lckhUTUwgPSAnJztcblxuICAgIGFkZEZpbHRlckdyb3VwUm93KCk7IC8vIFJlc2V0IHdpdGggb25lIGVtcHR5IGZpbHRlciBncm91cFxuICAgIHVwZGF0ZUJyZWFkY3J1bWIoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZUJyZWFkY3J1bWIoKSB7XG4gICAgY29uc3QgYnJlYWRjcnVtYiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdGVneS1icmVhZGNydW1iJyk7XG4gICAgaWYgKCFicmVhZGNydW1iKSByZXR1cm47XG5cbiAgICBsZXQgdGV4dCA9ICdBbGwnO1xuXG4gICAgLy8gRmlsdGVyc1xuICAgIGNvbnN0IGZpbHRlcnMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZmlsdGVyLXJvd3MtY29udGFpbmVyJyk/LnF1ZXJ5U2VsZWN0b3JBbGwoJy5idWlsZGVyLXJvdycpO1xuICAgIGlmIChmaWx0ZXJzICYmIGZpbHRlcnMubGVuZ3RoID4gMCkge1xuICAgICAgICBmaWx0ZXJzLmZvckVhY2gocm93ID0+IHtcbiAgICAgICAgICAgICBjb25zdCBmaWVsZCA9IChyb3cucXVlcnlTZWxlY3RvcignLmZpZWxkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgICBjb25zdCBvcCA9IChyb3cucXVlcnlTZWxlY3RvcignLm9wZXJhdG9yLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgICBjb25zdCB2YWwgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgIGlmICh2YWwpIHRleHQgKz0gYCA+ICR7ZmllbGR9ICR7b3B9ICR7dmFsfWA7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIEdyb3Vwc1xuICAgIGNvbnN0IGdyb3VwcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdncm91cC1yb3dzLWNvbnRhaW5lcicpPy5xdWVyeVNlbGVjdG9yQWxsKCcuYnVpbGRlci1yb3cnKTtcbiAgICBpZiAoZ3JvdXBzICYmIGdyb3Vwcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGdyb3Vwcy5mb3JFYWNoKHJvdyA9PiB7XG4gICAgICAgICAgICAgY29uc3Qgc291cmNlID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcuc291cmNlLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgICBsZXQgdmFsID0gXCJcIjtcbiAgICAgICAgICAgICBpZiAoc291cmNlID09PSAnZmllbGQnKSB7XG4gICAgICAgICAgICAgICAgIHZhbCA9IChyb3cucXVlcnlTZWxlY3RvcignLnZhbHVlLWlucHV0LWZpZWxkJykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgICAgICB0ZXh0ICs9IGAgPiBHcm91cCBieSBGaWVsZDogJHt2YWx9YDtcbiAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICB2YWwgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dC10ZXh0JykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICAgICAgIHRleHQgKz0gYCA+IEdyb3VwIGJ5IE5hbWU6IFwiJHt2YWx9XCJgO1xuICAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gR3JvdXAgU29ydHNcbiAgICBjb25zdCBncm91cFNvcnRzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dyb3VwLXNvcnQtcm93cy1jb250YWluZXInKT8ucXVlcnlTZWxlY3RvckFsbCgnLmJ1aWxkZXItcm93Jyk7XG4gICAgaWYgKGdyb3VwU29ydHMgJiYgZ3JvdXBTb3J0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGdyb3VwU29ydHMuZm9yRWFjaChyb3cgPT4ge1xuICAgICAgICAgICAgY29uc3QgZmllbGQgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5maWVsZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICBjb25zdCBvcmRlciA9IChyb3cucXVlcnlTZWxlY3RvcignLm9yZGVyLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgIHRleHQgKz0gYCA+IEdyb3VwIHNvcnQgYnkgJHtmaWVsZH0gKCR7b3JkZXJ9KWA7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFNvcnRzXG4gICAgY29uc3Qgc29ydHMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc29ydC1yb3dzLWNvbnRhaW5lcicpPy5xdWVyeVNlbGVjdG9yQWxsKCcuYnVpbGRlci1yb3cnKTtcbiAgICBpZiAoc29ydHMgJiYgc29ydHMubGVuZ3RoID4gMCkge1xuICAgICAgICBzb3J0cy5mb3JFYWNoKHJvdyA9PiB7XG4gICAgICAgICAgICAgY29uc3QgZmllbGQgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5maWVsZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICAgY29uc3Qgb3JkZXIgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5vcmRlci1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICAgdGV4dCArPSBgID4gU29ydCBieSAke2ZpZWxkfSAoJHtvcmRlcn0pYDtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgYnJlYWRjcnVtYi50ZXh0Q29udGVudCA9IHRleHQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRCdWlsZGVyU3RyYXRlZ3koaWdub3JlVmFsaWRhdGlvbjogYm9vbGVhbiA9IGZhbHNlKTogQ3VzdG9tU3RyYXRlZ3kgfCBudWxsIHtcbiAgICBjb25zdCBpZElucHV0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LW5hbWUnKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgIGNvbnN0IGxhYmVsSW5wdXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtZGVzYycpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG5cbiAgICBsZXQgaWQgPSBpZElucHV0ID8gaWRJbnB1dC52YWx1ZS50cmltKCkgOiAnJztcbiAgICBsZXQgbGFiZWwgPSBsYWJlbElucHV0ID8gbGFiZWxJbnB1dC52YWx1ZS50cmltKCkgOiAnJztcbiAgICBjb25zdCBmYWxsYmFjayA9ICdNaXNjJzsgLy8gRmFsbGJhY2sgcmVtb3ZlZCBmcm9tIFVJLCBkZWZhdWx0IHRvIE1pc2NcbiAgICBjb25zdCBzb3J0R3JvdXBzID0gKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1zb3J0Z3JvdXBzLWNoZWNrJykgYXMgSFRNTElucHV0RWxlbWVudCkuY2hlY2tlZDtcblxuICAgIGlmICghaWdub3JlVmFsaWRhdGlvbiAmJiAoIWlkIHx8ICFsYWJlbCkpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgaWYgKGlnbm9yZVZhbGlkYXRpb24pIHtcbiAgICAgICAgaWYgKCFpZCkgaWQgPSAndGVtcF9zaW1faWQnO1xuICAgICAgICBpZiAoIWxhYmVsKSBsYWJlbCA9ICdTaW11bGF0aW9uJztcbiAgICB9XG5cbiAgICBjb25zdCBmaWx0ZXJHcm91cHM6IFJ1bGVDb25kaXRpb25bXVtdID0gW107XG4gICAgY29uc3QgZmlsdGVyQ29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2ZpbHRlci1yb3dzLWNvbnRhaW5lcicpO1xuXG4gICAgLy8gUGFyc2UgZmlsdGVyIGdyb3Vwc1xuICAgIGlmIChmaWx0ZXJDb250YWluZXIpIHtcbiAgICAgICAgY29uc3QgZ3JvdXBSb3dzID0gZmlsdGVyQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5maWx0ZXItZ3JvdXAtcm93Jyk7XG4gICAgICAgIGlmIChncm91cFJvd3MubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgZ3JvdXBSb3dzLmZvckVhY2goZ3JvdXBSb3cgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvbmRpdGlvbnM6IFJ1bGVDb25kaXRpb25bXSA9IFtdO1xuICAgICAgICAgICAgICAgIGdyb3VwUm93LnF1ZXJ5U2VsZWN0b3JBbGwoJy5idWlsZGVyLXJvdycpLmZvckVhY2gocm93ID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZmllbGQgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5maWVsZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG9wZXJhdG9yID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcub3BlcmF0b3Itc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlIGFzIGFueTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdmFsdWUgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgICAgICAgICAvLyBPbmx5IGFkZCBpZiB2YWx1ZSBpcyBwcmVzZW50IG9yIG9wZXJhdG9yIGRvZXNuJ3QgcmVxdWlyZSBpdFxuICAgICAgICAgICAgICAgICAgICBpZiAodmFsdWUgfHwgWydleGlzdHMnLCAnZG9lc05vdEV4aXN0JywgJ2lzTnVsbCcsICdpc05vdE51bGwnXS5pbmNsdWRlcyhvcGVyYXRvcikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbmRpdGlvbnMucHVzaCh7IGZpZWxkLCBvcGVyYXRvciwgdmFsdWUgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBpZiAoY29uZGl0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGZpbHRlckdyb3Vwcy5wdXNoKGNvbmRpdGlvbnMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gRm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHkgLyBzaW1wbGUgc3RyYXRlZ2llcywgcG9wdWxhdGUgZmlsdGVycyB3aXRoIHRoZSBmaXJzdCBncm91cFxuICAgIGNvbnN0IGZpbHRlcnM6IFJ1bGVDb25kaXRpb25bXSA9IGZpbHRlckdyb3Vwcy5sZW5ndGggPiAwID8gZmlsdGVyR3JvdXBzWzBdIDogW107XG5cbiAgICBjb25zdCBncm91cGluZ1J1bGVzOiBHcm91cGluZ1J1bGVbXSA9IFtdO1xuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdncm91cC1yb3dzLWNvbnRhaW5lcicpPy5xdWVyeVNlbGVjdG9yQWxsKCcuYnVpbGRlci1yb3cnKS5mb3JFYWNoKHJvdyA9PiB7XG4gICAgICAgIGNvbnN0IHNvdXJjZSA9IChyb3cucXVlcnlTZWxlY3RvcignLnNvdXJjZS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWUgYXMgXCJmaWVsZFwiIHwgXCJmaXhlZFwiO1xuICAgICAgICBsZXQgdmFsdWUgPSBcIlwiO1xuICAgICAgICBpZiAoc291cmNlID09PSAnZmllbGQnKSB7XG4gICAgICAgICAgICB2YWx1ZSA9IChyb3cucXVlcnlTZWxlY3RvcignLnZhbHVlLWlucHV0LWZpZWxkJykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWUgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dC10ZXh0JykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB0cmFuc2Zvcm0gPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy50cmFuc2Zvcm0tc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlIGFzIGFueTtcbiAgICAgICAgY29uc3QgdHJhbnNmb3JtUGF0dGVybiA9IChyb3cucXVlcnlTZWxlY3RvcignLnRyYW5zZm9ybS1wYXR0ZXJuJykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWU7XG4gICAgICAgIGNvbnN0IHRyYW5zZm9ybVJlcGxhY2VtZW50ID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcudHJhbnNmb3JtLXJlcGxhY2VtZW50JykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWU7XG4gICAgICAgIGNvbnN0IHdpbmRvd01vZGUgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy53aW5kb3ctbW9kZS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWUgYXMgYW55O1xuXG4gICAgICAgIGNvbnN0IHJhbmRvbUNoZWNrID0gcm93LnF1ZXJ5U2VsZWN0b3IoJy5yYW5kb20tY29sb3ItY2hlY2snKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICBjb25zdCBjb2xvcklucHV0ID0gcm93LnF1ZXJ5U2VsZWN0b3IoJy5jb2xvci1pbnB1dCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICBjb25zdCBjb2xvckZpZWxkU2VsZWN0ID0gcm93LnF1ZXJ5U2VsZWN0b3IoJy5jb2xvci1maWVsZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgY29uc3QgY29sb3JUcmFuc2Zvcm1TZWxlY3QgPSByb3cucXVlcnlTZWxlY3RvcignLmNvbG9yLXRyYW5zZm9ybS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgY29uc3QgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuID0gcm93LnF1ZXJ5U2VsZWN0b3IoJy5jb2xvci10cmFuc2Zvcm0tcGF0dGVybicpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG5cbiAgICAgICAgbGV0IGNvbG9yID0gJ3JhbmRvbSc7XG4gICAgICAgIGxldCBjb2xvckZpZWxkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICAgIGxldCBjb2xvclRyYW5zZm9ybTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgICBsZXQgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuVmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICAgICAgICBpZiAoIXJhbmRvbUNoZWNrLmNoZWNrZWQpIHtcbiAgICAgICAgICAgIGNvbG9yID0gY29sb3JJbnB1dC52YWx1ZTtcbiAgICAgICAgICAgIGlmIChjb2xvciA9PT0gJ2ZpZWxkJykge1xuICAgICAgICAgICAgICAgIGNvbG9yRmllbGQgPSBjb2xvckZpZWxkU2VsZWN0LnZhbHVlO1xuICAgICAgICAgICAgICAgIGNvbG9yVHJhbnNmb3JtID0gY29sb3JUcmFuc2Zvcm1TZWxlY3QudmFsdWUgYXMgYW55O1xuICAgICAgICAgICAgICAgIGlmIChjb2xvclRyYW5zZm9ybSA9PT0gJ3JlZ2V4Jykge1xuICAgICAgICAgICAgICAgICAgICBjb2xvclRyYW5zZm9ybVBhdHRlcm5WYWx1ZSA9IGNvbG9yVHJhbnNmb3JtUGF0dGVybi52YWx1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgICAgIGdyb3VwaW5nUnVsZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgc291cmNlLFxuICAgICAgICAgICAgICAgIHZhbHVlLFxuICAgICAgICAgICAgICAgIGNvbG9yLFxuICAgICAgICAgICAgICAgIGNvbG9yRmllbGQsXG4gICAgICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm06IGNvbG9yVHJhbnNmb3JtIGFzIGFueSxcbiAgICAgICAgICAgICAgICBjb2xvclRyYW5zZm9ybVBhdHRlcm46IGNvbG9yVHJhbnNmb3JtUGF0dGVyblZhbHVlLFxuICAgICAgICAgICAgICAgIHRyYW5zZm9ybSxcbiAgICAgICAgICAgICAgICB0cmFuc2Zvcm1QYXR0ZXJuOiAodHJhbnNmb3JtID09PSAncmVnZXgnIHx8IHRyYW5zZm9ybSA9PT0gJ3JlZ2V4UmVwbGFjZScpID8gdHJhbnNmb3JtUGF0dGVybiA6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICB0cmFuc2Zvcm1SZXBsYWNlbWVudDogdHJhbnNmb3JtID09PSAncmVnZXhSZXBsYWNlJyA/IHRyYW5zZm9ybVJlcGxhY2VtZW50IDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgICAgIHdpbmRvd01vZGVcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBjb25zdCBzb3J0aW5nUnVsZXM6IFNvcnRpbmdSdWxlW10gPSBbXTtcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc29ydC1yb3dzLWNvbnRhaW5lcicpPy5xdWVyeVNlbGVjdG9yQWxsKCcuYnVpbGRlci1yb3cnKS5mb3JFYWNoKHJvdyA9PiB7XG4gICAgICAgIGNvbnN0IGZpZWxkID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcuZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICBjb25zdCBvcmRlciA9IChyb3cucXVlcnlTZWxlY3RvcignLm9yZGVyLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZSBhcyBhbnk7XG4gICAgICAgIHNvcnRpbmdSdWxlcy5wdXNoKHsgZmllbGQsIG9yZGVyIH0pO1xuICAgIH0pO1xuXG4gICAgY29uc3QgZ3JvdXBTb3J0aW5nUnVsZXM6IFNvcnRpbmdSdWxlW10gPSBbXTtcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ3JvdXAtc29ydC1yb3dzLWNvbnRhaW5lcicpPy5xdWVyeVNlbGVjdG9yQWxsKCcuYnVpbGRlci1yb3cnKS5mb3JFYWNoKHJvdyA9PiB7XG4gICAgICAgIGNvbnN0IGZpZWxkID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcuZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICBjb25zdCBvcmRlciA9IChyb3cucXVlcnlTZWxlY3RvcignLm9yZGVyLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZSBhcyBhbnk7XG4gICAgICAgIGdyb3VwU29ydGluZ1J1bGVzLnB1c2goeyBmaWVsZCwgb3JkZXIgfSk7XG4gICAgfSk7XG4gICAgY29uc3QgYXBwbGllZEdyb3VwU29ydGluZ1J1bGVzID0gc29ydEdyb3VwcyA/IGdyb3VwU29ydGluZ1J1bGVzIDogW107XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBpZCxcbiAgICAgICAgbGFiZWwsXG4gICAgICAgIGZpbHRlcnMsXG4gICAgICAgIGZpbHRlckdyb3VwcyxcbiAgICAgICAgZ3JvdXBpbmdSdWxlcyxcbiAgICAgICAgc29ydGluZ1J1bGVzLFxuICAgICAgICBncm91cFNvcnRpbmdSdWxlczogYXBwbGllZEdyb3VwU29ydGluZ1J1bGVzLFxuICAgICAgICBmYWxsYmFjayxcbiAgICAgICAgc29ydEdyb3Vwc1xuICAgIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBydW5CdWlsZGVyU2ltdWxhdGlvbigpIHtcbiAgICAvLyBQYXNzIHRydWUgdG8gaWdub3JlIHZhbGlkYXRpb24gc28gd2UgY2FuIHNpbXVsYXRlIHdpdGhvdXQgSUQvTGFiZWxcbiAgICBjb25zdCBzdHJhdCA9IGdldEJ1aWxkZXJTdHJhdGVneSh0cnVlKTtcbiAgICBjb25zdCByZXN1bHRDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnVpbGRlci1yZXN1bHRzJyk7XG4gICAgY29uc3QgbmV3U3RhdGVQYW5lbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCduZXctc3RhdGUtcGFuZWwnKTtcblxuICAgIGlmICghc3RyYXQpIHJldHVybjsgLy8gU2hvdWxkIG5vdCBoYXBwZW4gd2l0aCBpZ25vcmVWYWxpZGF0aW9uPXRydWVcblxuICAgIGxvZ0luZm8oXCJSdW5uaW5nIGJ1aWxkZXIgc2ltdWxhdGlvblwiLCB7IHN0cmF0ZWd5OiBzdHJhdC5pZCB9KTtcblxuICAgIC8vIEZvciBzaW11bGF0aW9uLCB3ZSBjYW4gbW9jayBhbiBJRC9MYWJlbCBpZiBtaXNzaW5nXG4gICAgY29uc3Qgc2ltU3RyYXQ6IEN1c3RvbVN0cmF0ZWd5ID0gc3RyYXQ7XG5cbiAgICBpZiAoIXJlc3VsdENvbnRhaW5lciB8fCAhbmV3U3RhdGVQYW5lbCkgcmV0dXJuO1xuXG4gICAgLy8gU2hvdyB0aGUgcGFuZWxcbiAgICBuZXdTdGF0ZVBhbmVsLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cbiAgICAvLyBVcGRhdGUgbG9jYWxDdXN0b21TdHJhdGVnaWVzIHRlbXBvcmFyaWx5IGZvciBTaW1cbiAgICBjb25zdCBvcmlnaW5hbFN0cmF0ZWdpZXMgPSBbLi4uYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzXTtcblxuICAgIHRyeSB7XG4gICAgICAgIC8vIFJlcGxhY2Ugb3IgYWRkXG4gICAgICAgIGNvbnN0IGV4aXN0aW5nSWR4ID0gYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzLmZpbmRJbmRleChzID0+IHMuaWQgPT09IHNpbVN0cmF0LmlkKTtcbiAgICAgICAgaWYgKGV4aXN0aW5nSWR4ICE9PSAtMSkge1xuICAgICAgICAgICAgYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzW2V4aXN0aW5nSWR4XSA9IHNpbVN0cmF0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzLnB1c2goc2ltU3RyYXQpO1xuICAgICAgICB9XG4gICAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMoYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzKTtcblxuICAgICAgICAvLyBSdW4gTG9naWNcbiAgICAgICAgbGV0IHRhYnMgPSBnZXRNYXBwZWRUYWJzKCk7XG5cbiAgICAgICAgaWYgKHRhYnMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICByZXN1bHRDb250YWluZXIuaW5uZXJIVE1MID0gJzxwPk5vIHRhYnMgZm91bmQgdG8gc2ltdWxhdGUuPC9wPic7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBBcHBseSBTaW11bGF0ZWQgU2VsZWN0aW9uIE92ZXJyaWRlXG4gICAgICAgIGlmIChhcHBTdGF0ZS5zaW11bGF0ZWRTZWxlY3Rpb24uc2l6ZSA+IDApIHtcbiAgICAgICAgICAgIHRhYnMgPSB0YWJzLm1hcCh0ID0+ICh7XG4gICAgICAgICAgICAgICAgLi4udCxcbiAgICAgICAgICAgICAgICBzZWxlY3RlZDogYXBwU3RhdGUuc2ltdWxhdGVkU2VsZWN0aW9uLmhhcyh0LmlkKVxuICAgICAgICAgICAgfSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gU29ydCB1c2luZyB0aGlzIHN0cmF0ZWd5P1xuICAgICAgICAvLyBzb3J0VGFicyBleHBlY3RzIFNvcnRpbmdTdHJhdGVneVtdLlxuICAgICAgICAvLyBJZiB3ZSB1c2UgdGhpcyBzdHJhdGVneSBmb3Igc29ydGluZy4uLlxuICAgICAgICB0YWJzID0gc29ydFRhYnModGFicywgW3NpbVN0cmF0LmlkXSk7XG5cbiAgICAgICAgLy8gR3JvdXAgdXNpbmcgdGhpcyBzdHJhdGVneVxuICAgICAgICBjb25zdCBncm91cHMgPSBncm91cFRhYnModGFicywgW3NpbVN0cmF0LmlkXSk7XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgd2Ugc2hvdWxkIHNob3cgYSBmYWxsYmFjayByZXN1bHQgKGUuZy4gU29ydCBPbmx5KVxuICAgICAgICAvLyBJZiBubyBncm91cHMgd2VyZSBjcmVhdGVkLCBidXQgd2UgaGF2ZSB0YWJzLCBhbmQgdGhlIHN0cmF0ZWd5IGlzIG5vdCBhIGdyb3VwaW5nIHN0cmF0ZWd5LFxuICAgICAgICAvLyB3ZSBzaG93IHRoZSB0YWJzIGFzIGEgc2luZ2xlIGxpc3QuXG4gICAgICAgIGlmIChncm91cHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBjb25zdCBzdHJhdERlZiA9IGdldFN0cmF0ZWdpZXMoYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzKS5maW5kKHMgPT4gcy5pZCA9PT0gc2ltU3RyYXQuaWQpO1xuICAgICAgICAgICAgaWYgKHN0cmF0RGVmICYmICFzdHJhdERlZi5pc0dyb3VwaW5nKSB7XG4gICAgICAgICAgICAgICAgZ3JvdXBzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBpZDogJ3NpbS1zb3J0ZWQnLFxuICAgICAgICAgICAgICAgICAgICB3aW5kb3dJZDogMCxcbiAgICAgICAgICAgICAgICAgICAgbGFiZWw6ICdTb3J0ZWQgUmVzdWx0cyAoTm8gR3JvdXBpbmcpJyxcbiAgICAgICAgICAgICAgICAgICAgY29sb3I6ICdncmV5JyxcbiAgICAgICAgICAgICAgICAgICAgdGFiczogdGFicyxcbiAgICAgICAgICAgICAgICAgICAgcmVhc29uOiAnU29ydCBPbmx5J1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmVuZGVyIFJlc3VsdHNcbiAgICAgICAgaWYgKGdyb3Vwcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHJlc3VsdENvbnRhaW5lci5pbm5lckhUTUwgPSAnPHA+Tm8gZ3JvdXBzIGNyZWF0ZWQuPC9wPic7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICByZXN1bHRDb250YWluZXIuaW5uZXJIVE1MID0gZ3JvdXBzLm1hcChncm91cCA9PiBgXG4gICAgPGRpdiBjbGFzcz1cImdyb3VwLXJlc3VsdFwiIHN0eWxlPVwibWFyZ2luLWJvdHRvbTogMTBweDsgYm9yZGVyOiAxcHggc29saWQgI2RkZDsgYm9yZGVyLXJhZGl1czogNHB4OyBvdmVyZmxvdzogaGlkZGVuO1wiPlxuICAgICAgPGRpdiBjbGFzcz1cImdyb3VwLWhlYWRlclwiIHN0eWxlPVwiYm9yZGVyLWxlZnQ6IDVweCBzb2xpZCAke2dyb3VwLmNvbG9yfTsgcGFkZGluZzogNXB4OyBiYWNrZ3JvdW5kOiAjZjhmOWZhOyBmb250LXNpemU6IDAuOWVtOyBmb250LXdlaWdodDogYm9sZDsgZGlzcGxheTogZmxleDsganVzdGlmeS1jb250ZW50OiBzcGFjZS1iZXR3ZWVuO1wiPlxuICAgICAgICA8c3Bhbj4ke2VzY2FwZUh0bWwoZ3JvdXAubGFiZWwgfHwgJ1VuZ3JvdXBlZCcpfTwvc3Bhbj5cbiAgICAgICAgPHNwYW4gY2xhc3M9XCJncm91cC1tZXRhXCIgc3R5bGU9XCJmb250LXdlaWdodDogbm9ybWFsOyBmb250LXNpemU6IDAuOGVtOyBjb2xvcjogIzY2NjtcIj4ke2dyb3VwLnRhYnMubGVuZ3RofTwvc3Bhbj5cbiAgICAgIDwvZGl2PlxuICAgICAgPHVsIGNsYXNzPVwiZ3JvdXAtdGFic1wiIHN0eWxlPVwibGlzdC1zdHlsZTogbm9uZTsgbWFyZ2luOiAwOyBwYWRkaW5nOiAwO1wiPlxuICAgICAgICAke2dyb3VwLnRhYnMubWFwKHRhYiA9PiBgXG4gICAgICAgICAgPGxpIGNsYXNzPVwiZ3JvdXAtdGFiLWl0ZW1cIiBzdHlsZT1cInBhZGRpbmc6IDRweCA1cHg7IGJvcmRlci10b3A6IDFweCBzb2xpZCAjZWVlOyBkaXNwbGF5OiBmbGV4OyBnYXA6IDVweDsgYWxpZ24taXRlbXM6IGNlbnRlcjsgZm9udC1zaXplOiAwLjg1ZW07XCI+XG4gICAgICAgICAgICA8ZGl2IHN0eWxlPVwid2lkdGg6IDEycHg7IGhlaWdodDogMTJweDsgYmFja2dyb3VuZDogI2VlZTsgYm9yZGVyLXJhZGl1czogMnB4OyBmbGV4LXNocmluazogMDtcIj5cbiAgICAgICAgICAgICAgICAke3RhYi5mYXZJY29uVXJsID8gYDxpbWcgc3JjPVwiJHtlc2NhcGVIdG1sKHRhYi5mYXZJY29uVXJsKX1cIiBzdHlsZT1cIndpZHRoOiAxMDAlOyBoZWlnaHQ6IDEwMCU7IG9iamVjdC1maXQ6IGNvdmVyO1wiIG9uZXJyb3I9XCJ0aGlzLnN0eWxlLmRpc3BsYXk9J25vbmUnXCI+YCA6ICcnfVxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cInRpdGxlLWNlbGxcIiB0aXRsZT1cIiR7ZXNjYXBlSHRtbCh0YWIudGl0bGUpfVwiIHN0eWxlPVwid2hpdGUtc3BhY2U6IG5vd3JhcDsgb3ZlcmZsb3c6IGhpZGRlbjsgdGV4dC1vdmVyZmxvdzogZWxsaXBzaXM7XCI+JHtlc2NhcGVIdG1sKHRhYi50aXRsZSl9PC9zcGFuPlxuICAgICAgICAgIDwvbGk+XG4gICAgICAgIGApLmpvaW4oJycpfVxuICAgICAgPC91bD5cbiAgICA8L2Rpdj5cbiAgYCkuam9pbignJyk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiU2ltdWxhdGlvbiBmYWlsZWRcIiwgZSk7XG4gICAgICAgIHJlc3VsdENvbnRhaW5lci5pbm5lckhUTUwgPSBgPHAgc3R5bGU9XCJjb2xvcjogcmVkO1wiPlNpbXVsYXRpb24gZmFpbGVkOiAke2V9PC9wPmA7XG4gICAgICAgIGFsZXJ0KFwiU2ltdWxhdGlvbiBmYWlsZWQ6IFwiICsgZSk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgICAgLy8gUmVzdG9yZSBzdHJhdGVnaWVzXG4gICAgICAgIGFwcFN0YXRlLmxvY2FsQ3VzdG9tU3RyYXRlZ2llcyA9IG9yaWdpbmFsU3RyYXRlZ2llcztcbiAgICAgICAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhhcHBTdGF0ZS5sb2NhbEN1c3RvbVN0cmF0ZWdpZXMpO1xuICAgIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNhdmVDdXN0b21TdHJhdGVneUZyb21CdWlsZGVyKHNob3dTdWNjZXNzID0gdHJ1ZSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGNvbnN0IHN0cmF0ID0gZ2V0QnVpbGRlclN0cmF0ZWd5KCk7XG4gICAgaWYgKCFzdHJhdCkge1xuICAgICAgICBhbGVydChcIlBsZWFzZSBmaWxsIGluIElEIGFuZCBMYWJlbC5cIik7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHNhdmVTdHJhdGVneShzdHJhdCwgc2hvd1N1Y2Nlc3MpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcnVuQnVpbGRlckxpdmUoKSB7XG4gICAgY29uc3Qgc3RyYXQgPSBnZXRCdWlsZGVyU3RyYXRlZ3koKTtcbiAgICBpZiAoIXN0cmF0KSB7XG4gICAgICAgIGFsZXJ0KFwiUGxlYXNlIGZpbGwgaW4gSUQgYW5kIExhYmVsIHRvIHJ1biBsaXZlLlwiKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxvZ0luZm8oXCJBcHBseWluZyBzdHJhdGVneSBsaXZlXCIsIHsgaWQ6IHN0cmF0LmlkIH0pO1xuXG4gICAgLy8gU2F2ZSBzaWxlbnRseSBmaXJzdCB0byBlbnN1cmUgYmFja2VuZCBoYXMgdGhlIGRlZmluaXRpb25cbiAgICBjb25zdCBzYXZlZCA9IGF3YWl0IHNhdmVTdHJhdGVneShzdHJhdCwgZmFsc2UpO1xuICAgIGlmICghc2F2ZWQpIHJldHVybjtcblxuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgdHlwZTogJ2FwcGx5R3JvdXBpbmcnLFxuICAgICAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgICAgICAgIHNvcnRpbmc6IFtzdHJhdC5pZF1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9rKSB7XG4gICAgICAgICAgICBhbGVydChcIkFwcGxpZWQgc3VjY2Vzc2Z1bGx5IVwiKTtcbiAgICAgICAgICAgIGxvYWRUYWJzKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBhbGVydChcIkZhaWxlZCB0byBhcHBseTogXCIgKyAocmVzcG9uc2UuZXJyb3IgfHwgJ1Vua25vd24gZXJyb3InKSk7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJBcHBseSBmYWlsZWRcIiwgZSk7XG4gICAgICAgIGFsZXJ0KFwiQXBwbHkgZmFpbGVkOiBcIiArIGUpO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBvcHVsYXRlQnVpbGRlckZyb21TdHJhdGVneShzdHJhdDogQ3VzdG9tU3RyYXRlZ3kpIHtcbiAgICAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LW5hbWUnKSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSA9IHN0cmF0LmlkO1xuICAgIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtZGVzYycpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlID0gc3RyYXQubGFiZWw7XG5cbiAgICBjb25zdCBzb3J0R3JvdXBzQ2hlY2sgPSAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LXNvcnRncm91cHMtY2hlY2snKSBhcyBIVE1MSW5wdXRFbGVtZW50KTtcbiAgICBjb25zdCBoYXNHcm91cFNvcnQgPSAhIShzdHJhdC5ncm91cFNvcnRpbmdSdWxlcyAmJiBzdHJhdC5ncm91cFNvcnRpbmdSdWxlcy5sZW5ndGggPiAwKSB8fCAhIXN0cmF0LnNvcnRHcm91cHM7XG4gICAgc29ydEdyb3Vwc0NoZWNrLmNoZWNrZWQgPSBoYXNHcm91cFNvcnQ7XG4gICAgc29ydEdyb3Vwc0NoZWNrLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnKSk7XG5cbiAgICBjb25zdCBhdXRvUnVuQ2hlY2sgPSAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LWF1dG9ydW4nKSBhcyBIVE1MSW5wdXRFbGVtZW50KTtcbiAgICBhdXRvUnVuQ2hlY2suY2hlY2tlZCA9ICEhc3RyYXQuYXV0b1J1bjtcblxuICAgIFsnZmlsdGVyLXJvd3MtY29udGFpbmVyJywgJ2dyb3VwLXJvd3MtY29udGFpbmVyJywgJ3NvcnQtcm93cy1jb250YWluZXInLCAnZ3JvdXAtc29ydC1yb3dzLWNvbnRhaW5lciddLmZvckVhY2goaWQgPT4ge1xuICAgICAgICBjb25zdCBlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGlkKTtcbiAgICAgICAgaWYgKGVsKSBlbC5pbm5lckhUTUwgPSAnJztcbiAgICB9KTtcblxuICAgIGlmIChzdHJhdC5maWx0ZXJHcm91cHMgJiYgc3RyYXQuZmlsdGVyR3JvdXBzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgc3RyYXQuZmlsdGVyR3JvdXBzLmZvckVhY2goZyA9PiBhZGRGaWx0ZXJHcm91cFJvdyhnKSk7XG4gICAgfSBlbHNlIGlmIChzdHJhdC5maWx0ZXJzICYmIHN0cmF0LmZpbHRlcnMubGVuZ3RoID4gMCkge1xuICAgICAgICBhZGRGaWx0ZXJHcm91cFJvdyhzdHJhdC5maWx0ZXJzKTtcbiAgICB9XG5cbiAgICBzdHJhdC5ncm91cGluZ1J1bGVzPy5mb3JFYWNoKGcgPT4gYWRkQnVpbGRlclJvdygnZ3JvdXAnLCBnKSk7XG4gICAgc3RyYXQuc29ydGluZ1J1bGVzPy5mb3JFYWNoKHMgPT4gYWRkQnVpbGRlclJvdygnc29ydCcsIHMpKTtcbiAgICBzdHJhdC5ncm91cFNvcnRpbmdSdWxlcz8uZm9yRWFjaChncyA9PiBhZGRCdWlsZGVyUm93KCdncm91cFNvcnQnLCBncykpO1xuXG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI3ZpZXctc3RyYXRlZ2llcycpPy5zY3JvbGxJbnRvVmlldyh7IGJlaGF2aW9yOiAnc21vb3RoJyB9KTtcbiAgICB1cGRhdGVCcmVhZGNydW1iKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHBvcnRCdWlsZGVyU3RyYXRlZ3koKSB7XG4gICAgY29uc3Qgc3RyYXQgPSBnZXRCdWlsZGVyU3RyYXRlZ3koKTtcbiAgICBpZiAoIXN0cmF0KSB7XG4gICAgICAgIGFsZXJ0KFwiUGxlYXNlIGRlZmluZSBhIHN0cmF0ZWd5IHRvIGV4cG9ydCAoSUQgYW5kIExhYmVsIHJlcXVpcmVkKS5cIik7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbG9nSW5mbyhcIkV4cG9ydGluZyBzdHJhdGVneVwiLCB7IGlkOiBzdHJhdC5pZCB9KTtcbiAgICBjb25zdCBqc29uID0gSlNPTi5zdHJpbmdpZnkoc3RyYXQsIG51bGwsIDIpO1xuICAgIGNvbnN0IGNvbnRlbnQgPSBgXG4gICAgICAgIDxwPkNvcHkgdGhlIEpTT04gYmVsb3c6PC9wPlxuICAgICAgICA8dGV4dGFyZWEgc3R5bGU9XCJ3aWR0aDogMTAwJTsgaGVpZ2h0OiAzMDBweDsgZm9udC1mYW1pbHk6IG1vbm9zcGFjZTtcIj4ke2VzY2FwZUh0bWwoanNvbil9PC90ZXh0YXJlYT5cbiAgICBgO1xuICAgIHNob3dNb2RhbChcIkV4cG9ydCBTdHJhdGVneVwiLCBjb250ZW50KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGltcG9ydEJ1aWxkZXJTdHJhdGVneSgpIHtcbiAgICBjb25zdCBjb250ZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgY29udGVudC5pbm5lckhUTUwgPSBgXG4gICAgICAgIDxwPlBhc3RlIFN0cmF0ZWd5IEpTT04gYmVsb3c6PC9wPlxuICAgICAgICA8dGV4dGFyZWEgaWQ9XCJpbXBvcnQtc3RyYXQtYXJlYVwiIHN0eWxlPVwid2lkdGg6IDEwMCU7IGhlaWdodDogMjAwcHg7IGZvbnQtZmFtaWx5OiBtb25vc3BhY2U7IG1hcmdpbi1ib3R0b206IDEwcHg7XCI+PC90ZXh0YXJlYT5cbiAgICAgICAgPGJ1dHRvbiBpZD1cImltcG9ydC1zdHJhdC1jb25maXJtXCIgY2xhc3M9XCJzdWNjZXNzLWJ0blwiPkxvYWQ8L2J1dHRvbj5cbiAgICBgO1xuXG4gICAgY29uc3QgYnRuID0gY29udGVudC5xdWVyeVNlbGVjdG9yKCcjaW1wb3J0LXN0cmF0LWNvbmZpcm0nKTtcbiAgICBidG4/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICBjb25zdCB0eHQgPSAoY29udGVudC5xdWVyeVNlbGVjdG9yKCcjaW1wb3J0LXN0cmF0LWFyZWEnKSBhcyBIVE1MVGV4dEFyZWFFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGpzb24gPSBKU09OLnBhcnNlKHR4dCk7XG4gICAgICAgICAgICBpZiAoIWpzb24uaWQgfHwgIWpzb24ubGFiZWwpIHtcbiAgICAgICAgICAgICAgICBhbGVydChcIkludmFsaWQgc3RyYXRlZ3k6IElEIGFuZCBMYWJlbCBhcmUgcmVxdWlyZWQuXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGxvZ0luZm8oXCJJbXBvcnRpbmcgc3RyYXRlZ3lcIiwgeyBpZDoganNvbi5pZCB9KTtcbiAgICAgICAgICAgIHBvcHVsYXRlQnVpbGRlckZyb21TdHJhdGVneShqc29uKTtcbiAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5tb2RhbC1vdmVybGF5Jyk/LnJlbW92ZSgpO1xuICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICAgIGFsZXJ0KFwiSW52YWxpZCBKU09OOiBcIiArIGUpO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBzaG93TW9kYWwoXCJJbXBvcnQgU3RyYXRlZ3lcIiwgY29udGVudCk7XG59XG4iLCAiaW1wb3J0IHsgYXBwU3RhdGUgfSBmcm9tIFwiLi9zdGF0ZS5qc1wiO1xuaW1wb3J0IHsgTG9nRW50cnksIExvZ0xldmVsLCBQcmVmZXJlbmNlcyB9IGZyb20gXCIuLi8uLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGVzY2FwZUh0bWwgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBsb2FkTG9ncygpIHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2dldExvZ3MnIH0pO1xuICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2sgJiYgcmVzcG9uc2UuZGF0YSkge1xuICAgICAgICAgICAgYXBwU3RhdGUuY3VycmVudExvZ3MgPSByZXNwb25zZS5kYXRhO1xuICAgICAgICAgICAgcmVuZGVyTG9ncygpO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGxvYWQgbG9nc1wiLCBlKTtcbiAgICB9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjbGVhclJlbW90ZUxvZ3MoKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiAnY2xlYXJMb2dzJyB9KTtcbiAgICAgICAgbG9hZExvZ3MoKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gY2xlYXIgbG9nc1wiLCBlKTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJMb2dzKCkge1xuICAgIGNvbnN0IHRib2R5ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvZ3MtdGFibGUtYm9keScpO1xuICAgIGNvbnN0IGxldmVsRmlsdGVyID0gKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2ctbGV2ZWwtZmlsdGVyJykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgIGNvbnN0IHNlYXJjaFRleHQgPSAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvZy1zZWFyY2gnKSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZS50b0xvd2VyQ2FzZSgpO1xuXG4gICAgaWYgKCF0Ym9keSkgcmV0dXJuO1xuXG4gICAgdGJvZHkuaW5uZXJIVE1MID0gJyc7XG5cbiAgICBjb25zdCBmaWx0ZXJlZCA9IGFwcFN0YXRlLmN1cnJlbnRMb2dzLmZpbHRlcihlbnRyeSA9PiB7XG4gICAgICAgIGlmIChsZXZlbEZpbHRlciAhPT0gJ2FsbCcgJiYgZW50cnkubGV2ZWwgIT09IGxldmVsRmlsdGVyKSByZXR1cm4gZmFsc2U7XG4gICAgICAgIGlmIChzZWFyY2hUZXh0KSB7XG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gYCR7ZW50cnkubWVzc2FnZX0gJHtKU09OLnN0cmluZ2lmeShlbnRyeS5jb250ZXh0IHx8IHt9KX1gLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICBpZiAoIXRleHQuaW5jbHVkZXMoc2VhcmNoVGV4dCkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9KTtcblxuICAgIGlmIChmaWx0ZXJlZC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgdGJvZHkuaW5uZXJIVE1MID0gJzx0cj48dGQgY29sc3Bhbj1cIjRcIiBzdHlsZT1cInBhZGRpbmc6IDEwcHg7IHRleHQtYWxpZ246IGNlbnRlcjsgY29sb3I6ICM4ODg7XCI+Tm8gbG9ncyBmb3VuZC48L3RkPjwvdHI+JztcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGZpbHRlcmVkLmZvckVhY2goZW50cnkgPT4ge1xuICAgICAgICBjb25zdCByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd0cicpO1xuXG4gICAgICAgIC8vIENvbG9yIGNvZGUgbGV2ZWxcbiAgICAgICAgbGV0IGNvbG9yID0gJyMzMzMnO1xuICAgICAgICBpZiAoZW50cnkubGV2ZWwgPT09ICdlcnJvcicgfHwgZW50cnkubGV2ZWwgPT09ICdjcml0aWNhbCcpIGNvbG9yID0gJ3JlZCc7XG4gICAgICAgIGVsc2UgaWYgKGVudHJ5LmxldmVsID09PSAnd2FybicpIGNvbG9yID0gJ29yYW5nZSc7XG4gICAgICAgIGVsc2UgaWYgKGVudHJ5LmxldmVsID09PSAnZGVidWcnKSBjb2xvciA9ICdibHVlJztcblxuICAgICAgICByb3cuaW5uZXJIVE1MID0gYFxuICAgICAgICAgICAgPHRkIHN0eWxlPVwicGFkZGluZzogOHB4OyBib3JkZXItYm90dG9tOiAxcHggc29saWQgI2VlZTsgd2hpdGUtc3BhY2U6IG5vd3JhcDtcIj4ke25ldyBEYXRlKGVudHJ5LnRpbWVzdGFtcCkudG9Mb2NhbGVUaW1lU3RyaW5nKCl9ICgke2VudHJ5LnRpbWVzdGFtcH0pPC90ZD5cbiAgICAgICAgICAgIDx0ZCBzdHlsZT1cInBhZGRpbmc6IDhweDsgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkICNlZWU7IGNvbG9yOiAke2NvbG9yfTsgZm9udC13ZWlnaHQ6IGJvbGQ7XCI+JHtlbnRyeS5sZXZlbC50b1VwcGVyQ2FzZSgpfTwvdGQ+XG4gICAgICAgICAgICA8dGQgc3R5bGU9XCJwYWRkaW5nOiA4cHg7IGJvcmRlci1ib3R0b206IDFweCBzb2xpZCAjZWVlO1wiPiR7ZXNjYXBlSHRtbChlbnRyeS5tZXNzYWdlKX08L3RkPlxuICAgICAgICAgICAgPHRkIHN0eWxlPVwicGFkZGluZzogOHB4OyBib3JkZXItYm90dG9tOiAxcHggc29saWQgI2VlZTtcIj5cbiAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJtYXgtaGVpZ2h0OiAxMDBweDsgb3ZlcmZsb3cteTogYXV0bztcIj5cbiAgICAgICAgICAgICAgICAgICR7ZW50cnkuY29udGV4dCA/IGA8cHJlIHN0eWxlPVwibWFyZ2luOiAwO1wiPiR7ZXNjYXBlSHRtbChKU09OLnN0cmluZ2lmeShlbnRyeS5jb250ZXh0LCBudWxsLCAyKSl9PC9wcmU+YCA6ICctJ31cbiAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPC90ZD5cbiAgICAgICAgYDtcbiAgICAgICAgdGJvZHkuYXBwZW5kQ2hpbGQocm93KTtcbiAgICB9KTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGxvYWRHbG9iYWxMb2dMZXZlbCgpIHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2xvYWRQcmVmZXJlbmNlcycgfSk7XG4gICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vayAmJiByZXNwb25zZS5kYXRhKSB7XG4gICAgICAgICAgICBjb25zdCBwcmVmcyA9IHJlc3BvbnNlLmRhdGEgYXMgUHJlZmVyZW5jZXM7XG4gICAgICAgICAgICBjb25zdCBzZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2xvYmFsLWxvZy1sZXZlbCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICAgICAgaWYgKHNlbGVjdCkge1xuICAgICAgICAgICAgICAgIHNlbGVjdC52YWx1ZSA9IHByZWZzLmxvZ0xldmVsIHx8ICdpbmZvJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBsb2FkIHByZWZzIGZvciBsb2dzXCIsIGUpO1xuICAgIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHVwZGF0ZUdsb2JhbExvZ0xldmVsKCkge1xuICAgIGNvbnN0IHNlbGVjdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnbG9iYWwtbG9nLWxldmVsJykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgaWYgKCFzZWxlY3QpIHJldHVybjtcbiAgICBjb25zdCBsZXZlbCA9IHNlbGVjdC52YWx1ZSBhcyBMb2dMZXZlbDtcblxuICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgIHR5cGU6ICdzYXZlUHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgcGF5bG9hZDogeyBsb2dMZXZlbDogbGV2ZWwgfVxuICAgICAgICB9KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gc2F2ZSBsb2cgbGV2ZWxcIiwgZSk7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5pdExvZ3MoKSB7XG4gIGNvbnN0IHJlZnJlc2hMb2dzQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3JlZnJlc2gtbG9ncy1idG4nKTtcbiAgaWYgKHJlZnJlc2hMb2dzQnRuKSByZWZyZXNoTG9nc0J0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGxvYWRMb2dzKTtcblxuICBjb25zdCBjbGVhckxvZ3NCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY2xlYXItbG9ncy1idG4nKTtcbiAgaWYgKGNsZWFyTG9nc0J0bikgY2xlYXJMb2dzQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgY2xlYXJSZW1vdGVMb2dzKTtcblxuICBjb25zdCBsb2dMZXZlbEZpbHRlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2ctbGV2ZWwtZmlsdGVyJyk7XG4gIGlmIChsb2dMZXZlbEZpbHRlcikgbG9nTGV2ZWxGaWx0ZXIuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgcmVuZGVyTG9ncyk7XG5cbiAgY29uc3QgbG9nU2VhcmNoID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvZy1zZWFyY2gnKTtcbiAgaWYgKGxvZ1NlYXJjaCkgbG9nU2VhcmNoLmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgcmVuZGVyTG9ncyk7XG5cbiAgY29uc3QgZ2xvYmFsTG9nTGV2ZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2xvYmFsLWxvZy1sZXZlbCcpO1xuICBpZiAoZ2xvYmFsTG9nTGV2ZWwpIGdsb2JhbExvZ0xldmVsLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIHVwZGF0ZUdsb2JhbExvZ0xldmVsKTtcbn1cbiIsICJpbXBvcnQgeyBhcHBTdGF0ZSB9IGZyb20gXCIuL3N0YXRlLmpzXCI7XG5pbXBvcnQgeyBsb2FkVGFicyB9IGZyb20gXCIuL3RhYnNUYWJsZS5qc1wiO1xuaW1wb3J0IHsgUHJlZmVyZW5jZXMgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBsb2dJbmZvIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGVzY2FwZUh0bWwgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBsb2FkQ3VzdG9tR2VuZXJhKCkge1xuICAgIGNvbnN0IGxpc3RDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY3VzdG9tLWdlbmVyYS1saXN0Jyk7XG4gICAgaWYgKCFsaXN0Q29udGFpbmVyKSByZXR1cm47XG5cbiAgICB0cnkge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2xvYWRQcmVmZXJlbmNlcycgfSk7XG4gICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vayAmJiByZXNwb25zZS5kYXRhKSB7XG4gICAgICAgICAgICBjb25zdCBwcmVmcyA9IHJlc3BvbnNlLmRhdGEgYXMgUHJlZmVyZW5jZXM7XG4gICAgICAgICAgICByZW5kZXJDdXN0b21HZW5lcmFMaXN0KHByZWZzLmN1c3RvbUdlbmVyYSB8fCB7fSk7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gbG9hZCBjdXN0b20gZ2VuZXJhXCIsIGUpO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlckN1c3RvbUdlbmVyYUxpc3QoY3VzdG9tR2VuZXJhOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KSB7XG4gICAgY29uc3QgbGlzdENvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjdXN0b20tZ2VuZXJhLWxpc3QnKTtcbiAgICBpZiAoIWxpc3RDb250YWluZXIpIHJldHVybjtcblxuICAgIGlmIChPYmplY3Qua2V5cyhjdXN0b21HZW5lcmEpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICBsaXN0Q29udGFpbmVyLmlubmVySFRNTCA9ICc8cCBzdHlsZT1cImNvbG9yOiAjODg4OyBmb250LXN0eWxlOiBpdGFsaWM7XCI+Tm8gY3VzdG9tIGVudHJpZXMuPC9wPic7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsaXN0Q29udGFpbmVyLmlubmVySFRNTCA9IE9iamVjdC5lbnRyaWVzKGN1c3RvbUdlbmVyYSkubWFwKChbZG9tYWluLCBjYXRlZ29yeV0pID0+IGBcbiAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6IGZsZXg7IGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjsgYWxpZ24taXRlbXM6IGNlbnRlcjsgcGFkZGluZzogNXB4OyBib3JkZXItYm90dG9tOiAxcHggc29saWQgI2YwZjBmMDtcIj5cbiAgICAgICAgICAgIDxzcGFuPjxiPiR7ZXNjYXBlSHRtbChkb21haW4pfTwvYj46ICR7ZXNjYXBlSHRtbChjYXRlZ29yeSl9PC9zcGFuPlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImRlbGV0ZS1nZW5lcmEtYnRuXCIgZGF0YS1kb21haW49XCIke2VzY2FwZUh0bWwoZG9tYWluKX1cIiBzdHlsZT1cImJhY2tncm91bmQ6IG5vbmU7IGJvcmRlcjogbm9uZTsgY29sb3I6IHJlZDsgY3Vyc29yOiBwb2ludGVyO1wiPiZ0aW1lczs8L2J1dHRvbj5cbiAgICAgICAgPC9kaXY+XG4gICAgYCkuam9pbignJyk7XG5cbiAgICAvLyBSZS1hdHRhY2ggbGlzdGVuZXJzIGZvciBkZWxldGUgYnV0dG9uc1xuICAgIGxpc3RDb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLmRlbGV0ZS1nZW5lcmEtYnRuJykuZm9yRWFjaChidG4gPT4ge1xuICAgICAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgZG9tYWluID0gKGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5kYXRhc2V0LmRvbWFpbjtcbiAgICAgICAgICAgIGlmIChkb21haW4pIHtcbiAgICAgICAgICAgICAgICBhd2FpdCBkZWxldGVDdXN0b21HZW5lcmEoZG9tYWluKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhZGRDdXN0b21HZW5lcmEoKSB7XG4gICAgY29uc3QgZG9tYWluSW5wdXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbmV3LWdlbmVyYS1kb21haW4nKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgIGNvbnN0IGNhdGVnb3J5SW5wdXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbmV3LWdlbmVyYS1jYXRlZ29yeScpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG5cbiAgICBpZiAoIWRvbWFpbklucHV0IHx8ICFjYXRlZ29yeUlucHV0KSByZXR1cm47XG5cbiAgICBjb25zdCBkb21haW4gPSBkb21haW5JbnB1dC52YWx1ZS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgICBjb25zdCBjYXRlZ29yeSA9IGNhdGVnb3J5SW5wdXQudmFsdWUudHJpbSgpO1xuXG4gICAgaWYgKCFkb21haW4gfHwgIWNhdGVnb3J5KSB7XG4gICAgICAgIGFsZXJ0KFwiUGxlYXNlIGVudGVyIGJvdGggZG9tYWluIGFuZCBjYXRlZ29yeS5cIik7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsb2dJbmZvKFwiQWRkaW5nIGN1c3RvbSBnZW5lcmFcIiwgeyBkb21haW4sIGNhdGVnb3J5IH0pO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgLy8gRmV0Y2ggY3VycmVudCB0byBtZXJnZVxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2xvYWRQcmVmZXJlbmNlcycgfSk7XG4gICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vayAmJiByZXNwb25zZS5kYXRhKSB7XG4gICAgICAgICAgICBjb25zdCBwcmVmcyA9IHJlc3BvbnNlLmRhdGEgYXMgUHJlZmVyZW5jZXM7XG4gICAgICAgICAgICBjb25zdCBuZXdDdXN0b21HZW5lcmEgPSB7IC4uLihwcmVmcy5jdXN0b21HZW5lcmEgfHwge30pLCBbZG9tYWluXTogY2F0ZWdvcnkgfTtcblxuICAgICAgICAgICAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICAgIHR5cGU6ICdzYXZlUHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgICAgIHBheWxvYWQ6IHsgY3VzdG9tR2VuZXJhOiBuZXdDdXN0b21HZW5lcmEgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGRvbWFpbklucHV0LnZhbHVlID0gJyc7XG4gICAgICAgICAgICBjYXRlZ29yeUlucHV0LnZhbHVlID0gJyc7XG4gICAgICAgICAgICBsb2FkQ3VzdG9tR2VuZXJhKCk7XG4gICAgICAgICAgICBsb2FkVGFicygpOyAvLyBSZWZyZXNoIHRhYnMgdG8gYXBwbHkgbmV3IGNsYXNzaWZpY2F0aW9uIGlmIHJlbGV2YW50XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gYWRkIGN1c3RvbSBnZW5lcmFcIiwgZSk7XG4gICAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZGVsZXRlQ3VzdG9tR2VuZXJhKGRvbWFpbjogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgbG9nSW5mbyhcIkRlbGV0aW5nIGN1c3RvbSBnZW5lcmFcIiwgeyBkb21haW4gfSk7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiAnbG9hZFByZWZlcmVuY2VzJyB9KTtcbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9rICYmIHJlc3BvbnNlLmRhdGEpIHtcbiAgICAgICAgICAgIGNvbnN0IHByZWZzID0gcmVzcG9uc2UuZGF0YSBhcyBQcmVmZXJlbmNlcztcbiAgICAgICAgICAgIGNvbnN0IG5ld0N1c3RvbUdlbmVyYSA9IHsgLi4uKHByZWZzLmN1c3RvbUdlbmVyYSB8fCB7fSkgfTtcbiAgICAgICAgICAgIGRlbGV0ZSBuZXdDdXN0b21HZW5lcmFbZG9tYWluXTtcblxuICAgICAgICAgICAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICAgIHR5cGU6ICdzYXZlUHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgICAgIHBheWxvYWQ6IHsgY3VzdG9tR2VuZXJhOiBuZXdDdXN0b21HZW5lcmEgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGxvYWRDdXN0b21HZW5lcmEoKTtcbiAgICAgICAgICAgIGxvYWRUYWJzKCk7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gZGVsZXRlIGN1c3RvbSBnZW5lcmFcIiwgZSk7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5pdEdlbmVyYSgpIHtcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChldmVudCkgPT4ge1xuICAgICAgICBjb25zdCB0YXJnZXQgPSBldmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgICAgICBpZiAodGFyZ2V0ICYmIHRhcmdldC5pZCA9PT0gJ2FkZC1nZW5lcmEtYnRuJykge1xuICAgICAgICAgICAgYWRkQ3VzdG9tR2VuZXJhKCk7XG4gICAgICAgIH1cbiAgICB9KTtcbn1cbiIsICJpbXBvcnQgeyBhcHBTdGF0ZSB9IGZyb20gXCIuL2RldnRvb2xzL3N0YXRlLmpzXCI7XG5pbXBvcnQgeyBpbml0VGFic1RhYmxlLCBsb2FkVGFicyB9IGZyb20gXCIuL2RldnRvb2xzL3RhYnNUYWJsZS5qc1wiO1xuaW1wb3J0IHsgaW5pdFN0cmF0ZWdpZXMsIGxvYWRQcmVmZXJlbmNlc0FuZEluaXQgfSBmcm9tIFwiLi9kZXZ0b29scy9zdHJhdGVnaWVzLmpzXCI7XG5pbXBvcnQgeyBpbml0U3RyYXRlZ3lCdWlsZGVyIH0gZnJvbSBcIi4vZGV2dG9vbHMvc3RyYXRlZ3lCdWlsZGVyLmpzXCI7XG5pbXBvcnQgeyBpbml0TG9ncywgbG9hZExvZ3MsIGxvYWRHbG9iYWxMb2dMZXZlbCB9IGZyb20gXCIuL2RldnRvb2xzL2xvZ3MuanNcIjtcbmltcG9ydCB7IGluaXRHZW5lcmEsIGxvYWRDdXN0b21HZW5lcmEgfSBmcm9tIFwiLi9kZXZ0b29scy9nZW5lcmEuanNcIjtcbmltcG9ydCB7IGluaXRTaW11bGF0aW9uLCByZW5kZXJTdHJhdGVneUNvbmZpZyB9IGZyb20gXCIuL2RldnRvb2xzL3NpbXVsYXRpb24uanNcIjtcbmltcG9ydCB7IHJlbmRlckFsZ29yaXRobXNWaWV3LCBzaG93U3RyYXRlZ3lEZXRhaWxzIH0gZnJvbSBcIi4vZGV2dG9vbHMvY29tcG9uZW50cy5qc1wiO1xuaW1wb3J0IHsgbG9nSW5mbyB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBlc2NhcGVIdG1sIH0gZnJvbSBcIi4uL3NoYXJlZC91dGlscy5qc1wiO1xuXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgYXN5bmMgKCkgPT4ge1xuICAvLyBUYWIgU3dpdGNoaW5nIExvZ2ljXG4gIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy50YWItYnRuJykuZm9yRWFjaChidG4gPT4ge1xuICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgIC8vIFJlbW92ZSBhY3RpdmUgY2xhc3MgZnJvbSBhbGwgYnV0dG9ucyBhbmQgc2VjdGlvbnNcbiAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy50YWItYnRuJykuZm9yRWFjaChiID0+IGIuY2xhc3NMaXN0LnJlbW92ZSgnYWN0aXZlJykpO1xuICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnZpZXctc2VjdGlvbicpLmZvckVhY2gocyA9PiBzLmNsYXNzTGlzdC5yZW1vdmUoJ2FjdGl2ZScpKTtcblxuICAgICAgLy8gQWRkIGFjdGl2ZSBjbGFzcyB0byBjbGlja2VkIGJ1dHRvblxuICAgICAgYnRuLmNsYXNzTGlzdC5hZGQoJ2FjdGl2ZScpO1xuXG4gICAgICAvLyBTaG93IHRhcmdldCBzZWN0aW9uXG4gICAgICBjb25zdCB0YXJnZXRJZCA9IChidG4gYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXQudGFyZ2V0O1xuICAgICAgaWYgKHRhcmdldElkKSB7XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKHRhcmdldElkKT8uY2xhc3NMaXN0LmFkZCgnYWN0aXZlJyk7XG4gICAgICAgIGxvZ0luZm8oXCJTd2l0Y2hlZCB2aWV3XCIsIHsgdGFyZ2V0SWQgfSk7XG4gICAgICB9XG5cbiAgICAgIC8vIElmIHN3aXRjaGluZyB0byBhbGdvcml0aG1zLCBwb3B1bGF0ZSByZWZlcmVuY2UgaWYgZW1wdHlcbiAgICAgIGlmICh0YXJnZXRJZCA9PT0gJ3ZpZXctYWxnb3JpdGhtcycpIHtcbiAgICAgICAgIHJlbmRlckFsZ29yaXRobXNWaWV3KCk7XG4gICAgICAgICByZW5kZXJTdHJhdGVneUNvbmZpZygpOyAvLyBVcGRhdGUgc2ltIGxpc3QgdG9vXG4gICAgICB9IGVsc2UgaWYgKHRhcmdldElkID09PSAndmlldy1zdHJhdGVneS1saXN0Jykge1xuICAgICAgICAgLy8gU3RyYXRlZ3kgbGlzdCBpcyByZW5kZXJlZCBieSByZW5kZXJTdHJhdGVneUxpc3RUYWJsZSB3aGljaCBpcyBjYWxsZWQgaW4gaW5pdFxuICAgICAgICAgLy8gQnV0IG1heWJlIHdlIHNob3VsZCByZWZyZXNoIGl0P1xuICAgICAgICAgLy8gcmVuZGVyU3RyYXRlZ3lMaXN0VGFibGUoKTsgLy8gZXhwb3J0ZWQgZnJvbSBzdHJhdGVnaWVzLnRzXG4gICAgICB9IGVsc2UgaWYgKHRhcmdldElkID09PSAndmlldy1sb2dzJykge1xuICAgICAgICAgbG9hZExvZ3MoKTtcbiAgICAgICAgIGxvYWRHbG9iYWxMb2dMZXZlbCgpO1xuICAgICAgfVxuICAgIH0pO1xuICB9KTtcblxuICAvLyBHbG9iYWwgQ2xpY2sgTGlzdGVuZXIgZm9yIHNoYXJlZCBhY3Rpb25zIChjb250ZXh0IGpzb24sIGdvdG8gdGFiLCBjbG9zZSB0YWIsIHN0cmF0ZWd5IHZpZXcpXG4gIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGV2ZW50KSA9PiB7XG4gICAgY29uc3QgdGFyZ2V0ID0gZXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICBpZiAoIXRhcmdldCkgcmV0dXJuO1xuXG4gICAgaWYgKHRhcmdldC5tYXRjaGVzKCcuY29udGV4dC1qc29uLWJ0bicpKSB7XG4gICAgICBjb25zdCB0YWJJZCA9IE51bWJlcih0YXJnZXQuZGF0YXNldC50YWJJZCk7XG4gICAgICBpZiAoIXRhYklkKSByZXR1cm47XG4gICAgICBjb25zdCBkYXRhID0gYXBwU3RhdGUuY3VycmVudENvbnRleHRNYXAuZ2V0KHRhYklkKT8uZGF0YTtcbiAgICAgIGlmICghZGF0YSkgcmV0dXJuO1xuICAgICAgY29uc3QganNvbiA9IEpTT04uc3RyaW5naWZ5KGRhdGEsIG51bGwsIDIpO1xuICAgICAgY29uc3QgaHRtbENvbnRlbnQgPSBgXG4gICAgICAgIDwhRE9DVFlQRSBodG1sPlxuICAgICAgICA8aHRtbD5cbiAgICAgICAgPGhlYWQ+XG4gICAgICAgICAgPHRpdGxlPkpTT04gVmlldzwvdGl0bGU+XG4gICAgICAgICAgPHN0eWxlPlxuICAgICAgICAgICAgYm9keSB7IGZvbnQtZmFtaWx5OiBtb25vc3BhY2U7IGJhY2tncm91bmQtY29sb3I6ICNmMGYwZjA7IHBhZGRpbmc6IDIwcHg7IH1cbiAgICAgICAgICAgIHByZSB7IGJhY2tncm91bmQtY29sb3I6IHdoaXRlOyBwYWRkaW5nOiAxNXB4OyBib3JkZXItcmFkaXVzOiA1cHg7IGJvcmRlcjogMXB4IHNvbGlkICNjY2M7IG92ZXJmbG93OiBhdXRvOyB9XG4gICAgICAgICAgPC9zdHlsZT5cbiAgICAgICAgPC9oZWFkPlxuICAgICAgICA8Ym9keT5cbiAgICAgICAgICA8aDM+SlNPTiBEYXRhPC9oMz5cbiAgICAgICAgICA8cHJlPiR7ZXNjYXBlSHRtbChqc29uKX08L3ByZT5cbiAgICAgICAgPC9ib2R5PlxuICAgICAgICA8L2h0bWw+XG4gICAgICBgO1xuICAgICAgY29uc3QgYmxvYiA9IG5ldyBCbG9iKFtodG1sQ29udGVudF0sIHsgdHlwZTogJ3RleHQvaHRtbCcgfSk7XG4gICAgICBjb25zdCB1cmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpO1xuICAgICAgd2luZG93Lm9wZW4odXJsLCAnX2JsYW5rJywgJ25vb3BlbmVyLG5vcmVmZXJyZXInKTtcbiAgICB9IGVsc2UgaWYgKHRhcmdldC5tYXRjaGVzKCcuZ290by10YWItYnRuJykpIHtcbiAgICAgIGNvbnN0IHRhYklkID0gTnVtYmVyKHRhcmdldC5kYXRhc2V0LnRhYklkKTtcbiAgICAgIGNvbnN0IHdpbmRvd0lkID0gTnVtYmVyKHRhcmdldC5kYXRhc2V0LndpbmRvd0lkKTtcbiAgICAgIGlmICh0YWJJZCAmJiB3aW5kb3dJZCkge1xuICAgICAgICBjaHJvbWUudGFicy51cGRhdGUodGFiSWQsIHsgYWN0aXZlOiB0cnVlIH0pO1xuICAgICAgICBjaHJvbWUud2luZG93cy51cGRhdGUod2luZG93SWQsIHsgZm9jdXNlZDogdHJ1ZSB9KTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHRhcmdldC5tYXRjaGVzKCcuY2xvc2UtdGFiLWJ0bicpKSB7XG4gICAgICBjb25zdCB0YWJJZCA9IE51bWJlcih0YXJnZXQuZGF0YXNldC50YWJJZCk7XG4gICAgICBpZiAodGFiSWQpIHtcbiAgICAgICAgY2hyb21lLnRhYnMucmVtb3ZlKHRhYklkKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHRhcmdldC5tYXRjaGVzKCcuc3RyYXRlZ3ktdmlldy1idG4nKSkge1xuICAgICAgICBjb25zdCB0eXBlID0gdGFyZ2V0LmRhdGFzZXQudHlwZTtcbiAgICAgICAgY29uc3QgbmFtZSA9IHRhcmdldC5kYXRhc2V0Lm5hbWU7XG4gICAgICAgIGlmICh0eXBlICYmIG5hbWUpIHtcbiAgICAgICAgICAgIHNob3dTdHJhdGVneURldGFpbHModHlwZSwgbmFtZSk7XG4gICAgICAgIH1cbiAgICB9XG4gIH0pO1xuXG4gIC8vIEluaXRpYWxpemUgTW9kdWxlc1xuICBpbml0VGFic1RhYmxlKCk7XG4gIGluaXRTdHJhdGVnaWVzKCk7XG4gIGluaXRTdHJhdGVneUJ1aWxkZXIoKTtcbiAgaW5pdExvZ3MoKTtcbiAgaW5pdEdlbmVyYSgpO1xuICBpbml0U2ltdWxhdGlvbigpO1xuXG4gIGxvYWRUYWJzKCk7XG4gIFxuICAvLyBQcmUtcmVuZGVyIHN0YXRpYyBjb250ZW50XG4gIGF3YWl0IGxvYWRQcmVmZXJlbmNlc0FuZEluaXQoKTsgLy8gTG9hZCBwcmVmZXJlbmNlcyBmaXJzdCB0byBpbml0IHN0cmF0ZWdpZXNcbiAgXG4gIHJlbmRlckFsZ29yaXRobXNWaWV3KCk7XG4gIHJlbmRlclN0cmF0ZWd5Q29uZmlnKCk7XG4gIFxuICBsb2FkQ3VzdG9tR2VuZXJhKCk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFXTyxJQUFNLFdBQVc7QUFBQSxFQUNwQixhQUFhLENBQUM7QUFBQSxFQUNkLHVCQUF1QixDQUFDO0FBQUEsRUFDeEIsbUJBQW1CLG9CQUFJLElBQTJCO0FBQUEsRUFDbEQsV0FBVyxvQkFBSSxJQUFvQjtBQUFBLEVBQ25DLFNBQVM7QUFBQSxFQUNULGVBQWU7QUFBQSxFQUNmLG9CQUFvQixvQkFBSSxJQUFZO0FBQUE7QUFBQSxFQUdwQyxtQkFBbUI7QUFBQSxFQUNuQixlQUFlLENBQUM7QUFBQSxFQUNoQixTQUFTO0FBQUEsSUFDTCxFQUFFLEtBQUssTUFBTSxPQUFPLE1BQU0sU0FBUyxNQUFNLE9BQU8sUUFBUSxZQUFZLEtBQUs7QUFBQSxJQUN6RSxFQUFFLEtBQUssU0FBUyxPQUFPLFNBQVMsU0FBUyxNQUFNLE9BQU8sUUFBUSxZQUFZLEtBQUs7QUFBQSxJQUMvRSxFQUFFLEtBQUssWUFBWSxPQUFPLFVBQVUsU0FBUyxNQUFNLE9BQU8sUUFBUSxZQUFZLEtBQUs7QUFBQSxJQUNuRixFQUFFLEtBQUssV0FBVyxPQUFPLFNBQVMsU0FBUyxNQUFNLE9BQU8sUUFBUSxZQUFZLEtBQUs7QUFBQSxJQUNqRixFQUFFLEtBQUssU0FBUyxPQUFPLFNBQVMsU0FBUyxNQUFNLE9BQU8sU0FBUyxZQUFZLEtBQUs7QUFBQSxJQUNoRixFQUFFLEtBQUssT0FBTyxPQUFPLE9BQU8sU0FBUyxNQUFNLE9BQU8sU0FBUyxZQUFZLEtBQUs7QUFBQSxJQUM1RSxFQUFFLEtBQUssU0FBUyxPQUFPLFNBQVMsU0FBUyxNQUFNLE9BQU8s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TSxTQUFTLE1BQU07QUFDckIsUUFBSSxDQUFDLE9BQVE7QUFFYixRQUFJLE9BQU8sUUFBUSxtQkFBbUIsR0FBRztBQUN2QyxZQUFNLFFBQVEsT0FBTyxPQUFPLFFBQVEsS0FBSztBQUN6QyxVQUFJLENBQUMsTUFBTztBQUNaLFlBQU0sT0FBTyxTQUFTLGtCQUFrQixJQUFJLEtBQUssR0FBRztBQUNwRCxVQUFJLENBQUMsS0FBTTtBQUNYLFlBQU0sT0FBTyxLQUFLLFVBQVUsTUFBTSxNQUFNLENBQUM7QUFDekMsWUFBTSxjQUFjO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLGlCQVlULFdBQVcsSUFBSSxDQUFDO0FBQUE7QUFBQTtBQUFBO0FBSTNCLFlBQU0sT0FBTyxJQUFJLEtBQUssQ0FBQyxXQUFXLEdBQUcsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUMxRCxZQUFNLE1BQU0sSUFBSSxnQkFBZ0IsSUFBSTtBQUNwQyxhQUFPLEtBQUssS0FBSyxVQUFVLHFCQUFxQjtBQUFBLElBQ2xELFdBQVcsT0FBTyxRQUFRLGVBQWUsR0FBRztBQUMxQyxZQUFNLFFBQVEsT0FBTyxPQUFPLFFBQVEsS0FBSztBQUN6QyxZQUFNLFdBQVcsT0FBTyxPQUFPLFFBQVEsUUFBUTtBQUMvQyxVQUFJLFNBQVMsVUFBVTtBQUNyQixlQUFPLEtBQUssT0FBTyxPQUFPLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFDMUMsZUFBTyxRQUFRLE9BQU8sVUFBVSxFQUFFLFNBQVMsS0FBSyxDQUFDO0FBQUEsTUFDbkQ7QUFBQSxJQUNGLFdBQVcsT0FBTyxRQUFRLGdCQUFnQixHQUFHO0FBQzNDLFlBQU0sUUFBUSxPQUFPLE9BQU8sUUFBUSxLQUFLO0FBQ3pDLFVBQUksT0FBTztBQUNULGVBQU8sS0FBSyxPQUFPLEtBQUs7QUFBQSxNQUMxQjtBQUFBLElBQ0YsV0FBVyxPQUFPLFFBQVEsb0JBQW9CLEdBQUc7QUFDN0MsWUFBTSxPQUFPLE9BQU8sUUFBUTtBQUM1QixZQUFNLE9BQU8sT0FBTyxRQUFRO0FBQzVCLFVBQUksUUFBUSxNQUFNO0FBQ2QsNEJBQW9CLE1BQU0sSUFBSTtBQUFBLE1BQ2xDO0FBQUEsSUFDSjtBQUFBLEVBQ0YsQ0FBQztBQUdELGdCQUFjO0FBQ2QsaUJBQWU7QUFDZixzQkFBb0I7QUFDcEIsV0FBUztBQUNULGFBQVc7QUFDWCxpQkFBZTtBQUVmLFdBQVM7QUFHVCxRQUFNLHVCQUF1QjtBQUU3Qix1QkFBcUI7QUFDckIsdUJBQXFCO0FBRXJCLG1CQUFpQjtBQUNuQixDQUFDOyIsCiAgIm5hbWVzIjogWyJwYXJ0cyIsICJjdXN0b21TdHJhdGVnaWVzIiwgImdyb3VwVGFicyJdCn0K
