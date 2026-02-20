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
var logError = (message, context) => {
  if (shouldLog("error")) {
    const safeContext = sanitizeContext(context);
    addLog("error", message, safeContext);
    console.error(`${PREFIX} [ERROR] ${formatMessage(message, safeContext)}`);
  }
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
var colorForKey = (key, offset) => COLORS[(Math.abs(hashCode(key)) + offset) % COLORS.length];
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3VpL2RldnRvb2xzL3N0YXRlLnRzIiwgIi4uLy4uL3NyYy9zaGFyZWQvdXRpbHMudHMiLCAiLi4vLi4vc3JjL3VpL2RldnRvb2xzL2RhdGEudHMiLCAiLi4vLi4vc3JjL3NoYXJlZC9sb2dnZXIudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZXh0cmFjdGlvbi9sb2dpYy50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9leHRyYWN0aW9uL2dlbmVyYVJlZ2lzdHJ5LnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3N0b3JhZ2UudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvcHJlZmVyZW5jZXMudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZXh0cmFjdGlvbi9pbmRleC50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9jYXRlZ29yeVJ1bGVzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL2NhdGVnb3JpemF0aW9uUnVsZXMudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvY29udGV4dEFuYWx5c2lzLnRzIiwgIi4uLy4uL3NyYy91aS9kZXZ0b29scy90YWJzVGFibGUudHMiLCAiLi4vLi4vc3JjL3NoYXJlZC9zdHJhdGVneVJlZ2lzdHJ5LnRzIiwgIi4uLy4uL3NyYy9zaGFyZWQvdXJsQ2FjaGUudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZ3JvdXBpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3NvcnRpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy91aS9jb21tb24udHMiLCAiLi4vLi4vc3JjL3VpL2RldnRvb2xzL2NvbXBvbmVudHMudHMiLCAiLi4vLi4vc3JjL3VpL2RldnRvb2xzL3NpbXVsYXRpb24udHMiLCAiLi4vLi4vc3JjL3VpL2RldnRvb2xzL3N0cmF0ZWdpZXMudHMiLCAiLi4vLi4vc3JjL3VpL2RldnRvb2xzL3N0cmF0ZWd5QnVpbGRlci50cyIsICIuLi8uLi9zcmMvdWkvZGV2dG9vbHMvbG9ncy50cyIsICIuLi8uLi9zcmMvdWkvZGV2dG9vbHMvZ2VuZXJhLnRzIiwgIi4uLy4uL3NyYy91aS9kZXZ0b29scy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgQ29udGV4dFJlc3VsdCB9IGZyb20gXCIuLi8uLi9iYWNrZ3JvdW5kL2NvbnRleHRBbmFseXNpcy5qc1wiO1xuaW1wb3J0IHsgQ3VzdG9tU3RyYXRlZ3ksIExvZ0VudHJ5IH0gZnJvbSBcIi4uLy4uL3NoYXJlZC90eXBlcy5qc1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIENvbHVtbkRlZmluaXRpb24ge1xuICAgIGtleTogc3RyaW5nO1xuICAgIGxhYmVsOiBzdHJpbmc7XG4gICAgdmlzaWJsZTogYm9vbGVhbjtcbiAgICB3aWR0aDogc3RyaW5nOyAvLyBDU1Mgd2lkdGhcbiAgICBmaWx0ZXJhYmxlOiBib29sZWFuO1xufVxuXG5leHBvcnQgY29uc3QgYXBwU3RhdGUgPSB7XG4gICAgY3VycmVudFRhYnM6IFtdIGFzIGNocm9tZS50YWJzLlRhYltdLFxuICAgIGxvY2FsQ3VzdG9tU3RyYXRlZ2llczogW10gYXMgQ3VzdG9tU3RyYXRlZ3lbXSxcbiAgICBjdXJyZW50Q29udGV4dE1hcDogbmV3IE1hcDxudW1iZXIsIENvbnRleHRSZXN1bHQ+KCksXG4gICAgdGFiVGl0bGVzOiBuZXcgTWFwPG51bWJlciwgc3RyaW5nPigpLFxuICAgIHNvcnRLZXk6IG51bGwgYXMgc3RyaW5nIHwgbnVsbCxcbiAgICBzb3J0RGlyZWN0aW9uOiAnYXNjJyBhcyAnYXNjJyB8ICdkZXNjJyxcbiAgICBzaW11bGF0ZWRTZWxlY3Rpb246IG5ldyBTZXQ8bnVtYmVyPigpLFxuXG4gICAgLy8gTW9kZXJuIFRhYmxlIFN0YXRlXG4gICAgZ2xvYmFsU2VhcmNoUXVlcnk6ICcnLFxuICAgIGNvbHVtbkZpbHRlcnM6IHt9IGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz4sXG4gICAgY29sdW1uczogW1xuICAgICAgICB7IGtleTogJ2lkJywgbGFiZWw6ICdJRCcsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnNjBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICAgICAgeyBrZXk6ICdpbmRleCcsIGxhYmVsOiAnSW5kZXgnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzYwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgICAgIHsga2V5OiAnd2luZG93SWQnLCBsYWJlbDogJ1dpbmRvdycsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnNzBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICAgICAgeyBrZXk6ICdncm91cElkJywgbGFiZWw6ICdHcm91cCcsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnNzBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICAgICAgeyBrZXk6ICd0aXRsZScsIGxhYmVsOiAnVGl0bGUnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzIwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgICAgICB7IGtleTogJ3VybCcsIGxhYmVsOiAnVVJMJywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICcyNTBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICAgICAgeyBrZXk6ICdnZW5yZScsIGxhYmVsOiAnR2VucmUnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzEwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgICAgICB7IGtleTogJ2NvbnRleHQnLCBsYWJlbDogJ0NhdGVnb3J5JywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICcxMDBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICAgICAgeyBrZXk6ICdzaXRlTmFtZScsIGxhYmVsOiAnU2l0ZSBOYW1lJywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICcxMjBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICAgICAgeyBrZXk6ICdwbGF0Zm9ybScsIGxhYmVsOiAnUGxhdGZvcm0nLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzEwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgICAgICB7IGtleTogJ29iamVjdFR5cGUnLCBsYWJlbDogJ09iamVjdCBUeXBlJywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICcxMDBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICAgICAgeyBrZXk6ICdleHRyYWN0ZWRUaXRsZScsIGxhYmVsOiAnRXh0cmFjdGVkIFRpdGxlJywgdmlzaWJsZTogZmFsc2UsIHdpZHRoOiAnMjAwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgICAgIHsga2V5OiAnYXV0aG9yT3JDcmVhdG9yJywgbGFiZWw6ICdBdXRob3InLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzEyMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgICAgICB7IGtleTogJ3B1Ymxpc2hlZEF0JywgbGFiZWw6ICdQdWJsaXNoZWQnLCB2aXNpYmxlOiBmYWxzZSwgd2lkdGg6ICcxMDBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICAgICAgeyBrZXk6ICdzdGF0dXMnLCBsYWJlbDogJ1N0YXR1cycsIHZpc2libGU6IGZhbHNlLCB3aWR0aDogJzgwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgICAgIHsga2V5OiAnYWN0aXZlJywgbGFiZWw6ICdBY3RpdmUnLCB2aXNpYmxlOiBmYWxzZSwgd2lkdGg6ICc2MHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgICAgICB7IGtleTogJ3Bpbm5lZCcsIGxhYmVsOiAnUGlubmVkJywgdmlzaWJsZTogZmFsc2UsIHdpZHRoOiAnNjBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICAgICAgeyBrZXk6ICdvcGVuZXJUYWJJZCcsIGxhYmVsOiAnT3BlbmVyJywgdmlzaWJsZTogZmFsc2UsIHdpZHRoOiAnNzBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICAgICAgeyBrZXk6ICdwYXJlbnRUaXRsZScsIGxhYmVsOiAnUGFyZW50IFRpdGxlJywgdmlzaWJsZTogZmFsc2UsIHdpZHRoOiAnMTUwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgICAgIHsga2V5OiAnbGFzdEFjY2Vzc2VkJywgbGFiZWw6ICdMYXN0IEFjY2Vzc2VkJywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICcxNTBweCcsIGZpbHRlcmFibGU6IGZhbHNlIH0sXG4gICAgICAgIHsga2V5OiAnYWN0aW9ucycsIGxhYmVsOiAnQWN0aW9ucycsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnMTIwcHgnLCBmaWx0ZXJhYmxlOiBmYWxzZSB9XG4gICAgXSBhcyBDb2x1bW5EZWZpbml0aW9uW10sXG5cbiAgICBjdXJyZW50TG9nczogW10gYXMgTG9nRW50cnlbXVxufTtcbiIsICJpbXBvcnQgeyBQcmVmZXJlbmNlcywgU29ydGluZ1N0cmF0ZWd5LCBUYWJNZXRhZGF0YSB9IGZyb20gXCIuL3R5cGVzLmpzXCI7XG5cbmV4cG9ydCBjb25zdCBtYXBDaHJvbWVUYWIgPSAodGFiOiBjaHJvbWUudGFicy5UYWIpOiBUYWJNZXRhZGF0YSB8IG51bGwgPT4ge1xuICBpZiAoIXRhYi5pZCB8fCB0YWIuaWQgPT09IGNocm9tZS50YWJzLlRBQl9JRF9OT05FIHx8ICF0YWIud2luZG93SWQpIHJldHVybiBudWxsO1xuICByZXR1cm4ge1xuICAgIGlkOiB0YWIuaWQsXG4gICAgd2luZG93SWQ6IHRhYi53aW5kb3dJZCxcbiAgICB0aXRsZTogdGFiLnRpdGxlIHx8IFwiVW50aXRsZWRcIixcbiAgICB1cmw6IHRhYi5wZW5kaW5nVXJsIHx8IHRhYi51cmwgfHwgXCJhYm91dDpibGFua1wiLFxuICAgIHBpbm5lZDogQm9vbGVhbih0YWIucGlubmVkKSxcbiAgICBsYXN0QWNjZXNzZWQ6IHRhYi5sYXN0QWNjZXNzZWQsXG4gICAgb3BlbmVyVGFiSWQ6IHRhYi5vcGVuZXJUYWJJZCA/PyB1bmRlZmluZWQsXG4gICAgZmF2SWNvblVybDogdGFiLmZhdkljb25VcmwsXG4gICAgZ3JvdXBJZDogdGFiLmdyb3VwSWQsXG4gICAgaW5kZXg6IHRhYi5pbmRleCxcbiAgICBhY3RpdmU6IHRhYi5hY3RpdmUsXG4gICAgc3RhdHVzOiB0YWIuc3RhdHVzLFxuICAgIHNlbGVjdGVkOiB0YWIuaGlnaGxpZ2h0ZWRcbiAgfTtcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRTdG9yZWRQcmVmZXJlbmNlcyA9IGFzeW5jICgpOiBQcm9taXNlPFByZWZlcmVuY2VzIHwgbnVsbD4gPT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoXCJwcmVmZXJlbmNlc1wiLCAoaXRlbXMpID0+IHtcbiAgICAgIHJlc29sdmUoKGl0ZW1zW1wicHJlZmVyZW5jZXNcIl0gYXMgUHJlZmVyZW5jZXMpID8/IG51bGwpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBhc0FycmF5ID0gPFQ+KHZhbHVlOiB1bmtub3duKTogVFtdID0+IHtcbiAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHJldHVybiB2YWx1ZSBhcyBUW107XG4gICAgcmV0dXJuIFtdO1xufTtcblxuZXhwb3J0IGZ1bmN0aW9uIGVzY2FwZUh0bWwodGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgaWYgKCF0ZXh0KSByZXR1cm4gJyc7XG4gIHJldHVybiB0ZXh0XG4gICAgLnJlcGxhY2UoLyYvZywgJyZhbXA7JylcbiAgICAucmVwbGFjZSgvPC9nLCAnJmx0OycpXG4gICAgLnJlcGxhY2UoLz4vZywgJyZndDsnKVxuICAgIC5yZXBsYWNlKC9cIi9nLCAnJnF1b3Q7JylcbiAgICAucmVwbGFjZSgvJy9nLCAnJiMwMzk7Jyk7XG59XG4iLCAiaW1wb3J0IHsgYXBwU3RhdGUgfSBmcm9tIFwiLi9zdGF0ZS5qc1wiO1xuaW1wb3J0IHsgbWFwQ2hyb21lVGFiLCBlc2NhcGVIdG1sIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC91dGlscy5qc1wiO1xuaW1wb3J0IHsgVGFiTWV0YWRhdGEgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRNYXBwZWRUYWJzKCk6IFRhYk1ldGFkYXRhW10ge1xuICByZXR1cm4gYXBwU3RhdGUuY3VycmVudFRhYnNcbiAgICAubWFwKHRhYiA9PiB7XG4gICAgICAgIGNvbnN0IG1ldGFkYXRhID0gbWFwQ2hyb21lVGFiKHRhYik7XG4gICAgICAgIGlmICghbWV0YWRhdGEpIHJldHVybiBudWxsO1xuXG4gICAgICAgIGNvbnN0IGNvbnRleHRSZXN1bHQgPSBhcHBTdGF0ZS5jdXJyZW50Q29udGV4dE1hcC5nZXQobWV0YWRhdGEuaWQpO1xuICAgICAgICBpZiAoY29udGV4dFJlc3VsdCkge1xuICAgICAgICAgICAgbWV0YWRhdGEuY29udGV4dCA9IGNvbnRleHRSZXN1bHQuY29udGV4dDtcbiAgICAgICAgICAgIG1ldGFkYXRhLmNvbnRleHREYXRhID0gY29udGV4dFJlc3VsdC5kYXRhO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtZXRhZGF0YTtcbiAgICB9KVxuICAgIC5maWx0ZXIoKHQpOiB0IGlzIFRhYk1ldGFkYXRhID0+IHQgIT09IG51bGwpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc3RyaXBIdG1sKGh0bWw6IHN0cmluZykge1xuICAgIGxldCB0bXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiRElWXCIpO1xuICAgIHRtcC5pbm5lckhUTUwgPSBodG1sO1xuICAgIHJldHVybiB0bXAudGV4dENvbnRlbnQgfHwgdG1wLmlubmVyVGV4dCB8fCBcIlwiO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U29ydFZhbHVlKHRhYjogY2hyb21lLnRhYnMuVGFiLCBrZXk6IHN0cmluZyk6IGFueSB7XG4gIHN3aXRjaCAoa2V5KSB7XG4gICAgY2FzZSAncGFyZW50VGl0bGUnOlxuICAgICAgcmV0dXJuIHRhYi5vcGVuZXJUYWJJZCA/IChhcHBTdGF0ZS50YWJUaXRsZXMuZ2V0KHRhYi5vcGVuZXJUYWJJZCkgfHwgJycpIDogJyc7XG4gICAgY2FzZSAnZ2VucmUnOlxuICAgICAgcmV0dXJuICh0YWIuaWQgJiYgYXBwU3RhdGUuY3VycmVudENvbnRleHRNYXAuZ2V0KHRhYi5pZCk/LmRhdGE/LmdlbnJlKSB8fCAnJztcbiAgICBjYXNlICdjb250ZXh0JzpcbiAgICAgIHJldHVybiAodGFiLmlkICYmIGFwcFN0YXRlLmN1cnJlbnRDb250ZXh0TWFwLmdldCh0YWIuaWQpPy5jb250ZXh0KSB8fCAnJztcbiAgICBjYXNlICdzaXRlTmFtZSc6XG4gICAgICByZXR1cm4gKHRhYi5pZCAmJiBhcHBTdGF0ZS5jdXJyZW50Q29udGV4dE1hcC5nZXQodGFiLmlkKT8uZGF0YT8uc2l0ZU5hbWUpIHx8ICcnO1xuICAgIGNhc2UgJ3BsYXRmb3JtJzpcbiAgICAgIHJldHVybiAodGFiLmlkICYmIGFwcFN0YXRlLmN1cnJlbnRDb250ZXh0TWFwLmdldCh0YWIuaWQpPy5kYXRhPy5wbGF0Zm9ybSkgfHwgJyc7XG4gICAgY2FzZSAnb2JqZWN0VHlwZSc6XG4gICAgICByZXR1cm4gKHRhYi5pZCAmJiBhcHBTdGF0ZS5jdXJyZW50Q29udGV4dE1hcC5nZXQodGFiLmlkKT8uZGF0YT8ub2JqZWN0VHlwZSkgfHwgJyc7XG4gICAgY2FzZSAnZXh0cmFjdGVkVGl0bGUnOlxuICAgICAgcmV0dXJuICh0YWIuaWQgJiYgYXBwU3RhdGUuY3VycmVudENvbnRleHRNYXAuZ2V0KHRhYi5pZCk/LmRhdGE/LnRpdGxlKSB8fCAnJztcbiAgICBjYXNlICdhdXRob3JPckNyZWF0b3InOlxuICAgICAgcmV0dXJuICh0YWIuaWQgJiYgYXBwU3RhdGUuY3VycmVudENvbnRleHRNYXAuZ2V0KHRhYi5pZCk/LmRhdGE/LmF1dGhvck9yQ3JlYXRvcikgfHwgJyc7XG4gICAgY2FzZSAncHVibGlzaGVkQXQnOlxuICAgICAgcmV0dXJuICh0YWIuaWQgJiYgYXBwU3RhdGUuY3VycmVudENvbnRleHRNYXAuZ2V0KHRhYi5pZCk/LmRhdGE/LnB1Ymxpc2hlZEF0KSB8fCAnJztcbiAgICBjYXNlICdhY3RpdmUnOlxuICAgICAgcmV0dXJuIHRhYi5hY3RpdmUgPyAxIDogMDtcbiAgICBjYXNlICdwaW5uZWQnOlxuICAgICAgcmV0dXJuIHRhYi5waW5uZWQgPyAxIDogMDtcbiAgICBjYXNlICdpZCc6XG4gICAgICByZXR1cm4gdGFiLmlkID8/IC0xO1xuICAgIGNhc2UgJ2luZGV4JzpcbiAgICAgIHJldHVybiB0YWIuaW5kZXg7XG4gICAgY2FzZSAnd2luZG93SWQnOlxuICAgICAgcmV0dXJuIHRhYi53aW5kb3dJZDtcbiAgICBjYXNlICdncm91cElkJzpcbiAgICAgIHJldHVybiB0YWIuZ3JvdXBJZDtcbiAgICBjYXNlICdvcGVuZXJUYWJJZCc6XG4gICAgICByZXR1cm4gdGFiLm9wZW5lclRhYklkID8/IC0xO1xuICAgIGNhc2UgJ2xhc3RBY2Nlc3NlZCc6XG4gICAgICAvLyBsYXN0QWNjZXNzZWQgaXMgYSB2YWxpZCBwcm9wZXJ0eSBvZiBjaHJvbWUudGFicy5UYWIgaW4gbW9kZXJuIGRlZmluaXRpb25zXG4gICAgICByZXR1cm4gKHRhYiBhcyBjaHJvbWUudGFicy5UYWIgJiB7IGxhc3RBY2Nlc3NlZD86IG51bWJlciB9KS5sYXN0QWNjZXNzZWQgfHwgMDtcbiAgICBjYXNlICd0aXRsZSc6XG4gICAgICByZXR1cm4gKHRhYi50aXRsZSB8fCAnJykudG9Mb3dlckNhc2UoKTtcbiAgICBjYXNlICd1cmwnOlxuICAgICAgcmV0dXJuICh0YWIudXJsIHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xuICAgIGNhc2UgJ3N0YXR1cyc6XG4gICAgICByZXR1cm4gKHRhYi5zdGF0dXMgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiAnJztcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2VsbFZhbHVlKHRhYjogY2hyb21lLnRhYnMuVGFiLCBrZXk6IHN0cmluZyk6IHN0cmluZyB8IEhUTUxFbGVtZW50IHtcbiAgICBjb25zdCBlc2NhcGUgPSBlc2NhcGVIdG1sO1xuXG4gICAgc3dpdGNoIChrZXkpIHtcbiAgICAgICAgY2FzZSAnaWQnOiByZXR1cm4gU3RyaW5nKHRhYi5pZCA/PyAnTi9BJyk7XG4gICAgICAgIGNhc2UgJ2luZGV4JzogcmV0dXJuIFN0cmluZyh0YWIuaW5kZXgpO1xuICAgICAgICBjYXNlICd3aW5kb3dJZCc6IHJldHVybiBTdHJpbmcodGFiLndpbmRvd0lkKTtcbiAgICAgICAgY2FzZSAnZ3JvdXBJZCc6IHJldHVybiBTdHJpbmcodGFiLmdyb3VwSWQpO1xuICAgICAgICBjYXNlICd0aXRsZSc6IHJldHVybiBlc2NhcGUodGFiLnRpdGxlIHx8ICcnKTtcbiAgICAgICAgY2FzZSAndXJsJzogcmV0dXJuIGVzY2FwZSh0YWIudXJsIHx8ICcnKTtcbiAgICAgICAgY2FzZSAnc3RhdHVzJzogcmV0dXJuIGVzY2FwZSh0YWIuc3RhdHVzIHx8ICcnKTtcbiAgICAgICAgY2FzZSAnYWN0aXZlJzogcmV0dXJuIHRhYi5hY3RpdmUgPyAnWWVzJyA6ICdObyc7XG4gICAgICAgIGNhc2UgJ3Bpbm5lZCc6IHJldHVybiB0YWIucGlubmVkID8gJ1llcycgOiAnTm8nO1xuICAgICAgICBjYXNlICdvcGVuZXJUYWJJZCc6IHJldHVybiBTdHJpbmcodGFiLm9wZW5lclRhYklkID8/ICctJyk7XG4gICAgICAgIGNhc2UgJ3BhcmVudFRpdGxlJzpcbiAgICAgICAgICAgICByZXR1cm4gZXNjYXBlKHRhYi5vcGVuZXJUYWJJZCA/IChhcHBTdGF0ZS50YWJUaXRsZXMuZ2V0KHRhYi5vcGVuZXJUYWJJZCkgfHwgJ1Vua25vd24nKSA6ICctJyk7XG4gICAgICAgIGNhc2UgJ2dlbnJlJzpcbiAgICAgICAgICAgICByZXR1cm4gZXNjYXBlKCh0YWIuaWQgJiYgYXBwU3RhdGUuY3VycmVudENvbnRleHRNYXAuZ2V0KHRhYi5pZCk/LmRhdGE/LmdlbnJlKSB8fCAnLScpO1xuICAgICAgICBjYXNlICdjb250ZXh0Jzoge1xuICAgICAgICAgICAgY29uc3QgY29udGV4dFJlc3VsdCA9IHRhYi5pZCA/IGFwcFN0YXRlLmN1cnJlbnRDb250ZXh0TWFwLmdldCh0YWIuaWQpIDogdW5kZWZpbmVkO1xuICAgICAgICAgICAgaWYgKCFjb250ZXh0UmVzdWx0KSByZXR1cm4gJ04vQSc7XG5cbiAgICAgICAgICAgIGxldCBjZWxsU3R5bGUgPSAnJztcbiAgICAgICAgICAgIGxldCBhaUNvbnRleHQgPSAnJztcblxuICAgICAgICAgICAgaWYgKGNvbnRleHRSZXN1bHQuc3RhdHVzID09PSAnUkVTVFJJQ1RFRCcpIHtcbiAgICAgICAgICAgICAgICBhaUNvbnRleHQgPSAnVW5leHRyYWN0YWJsZSAocmVzdHJpY3RlZCknO1xuICAgICAgICAgICAgICAgIGNlbGxTdHlsZSA9ICdjb2xvcjogZ3JheTsgZm9udC1zdHlsZTogaXRhbGljOyc7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNvbnRleHRSZXN1bHQuZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBhaUNvbnRleHQgPSBgRXJyb3IgKCR7Y29udGV4dFJlc3VsdC5lcnJvcn0pYDtcbiAgICAgICAgICAgICAgICBjZWxsU3R5bGUgPSAnY29sb3I6IHJlZDsnO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjb250ZXh0UmVzdWx0LnNvdXJjZSA9PT0gJ0V4dHJhY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgYWlDb250ZXh0ID0gYCR7Y29udGV4dFJlc3VsdC5jb250ZXh0fSAoRXh0cmFjdGVkKWA7XG4gICAgICAgICAgICAgICAgY2VsbFN0eWxlID0gJ2NvbG9yOiBncmVlbjsgZm9udC13ZWlnaHQ6IGJvbGQ7JztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgIGFpQ29udGV4dCA9IGAke2NvbnRleHRSZXN1bHQuY29udGV4dH1gO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgIGNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuICAgICAgICAgICAgY29udGFpbmVyLnN0eWxlLmZsZXhEaXJlY3Rpb24gPSAnY29sdW1uJztcbiAgICAgICAgICAgIGNvbnRhaW5lci5zdHlsZS5nYXAgPSAnNXB4JztcblxuICAgICAgICAgICAgY29uc3Qgc3VtbWFyeURpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgc3VtbWFyeURpdi5zdHlsZS5jc3NUZXh0ID0gY2VsbFN0eWxlO1xuICAgICAgICAgICAgc3VtbWFyeURpdi50ZXh0Q29udGVudCA9IGFpQ29udGV4dDtcbiAgICAgICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChzdW1tYXJ5RGl2KTtcblxuICAgICAgICAgICAgaWYgKGNvbnRleHRSZXN1bHQuZGF0YSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGRldGFpbHMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdwcmUnKTtcbiAgICAgICAgICAgICAgICBkZXRhaWxzLnN0eWxlLmNzc1RleHQgPSAnbWF4LWhlaWdodDogMzAwcHg7IG92ZXJmbG93OiBhdXRvOyBmb250LXNpemU6IDExcHg7IHRleHQtYWxpZ246IGxlZnQ7IGJhY2tncm91bmQ6ICNmNWY1ZjU7IHBhZGRpbmc6IDVweDsgYm9yZGVyOiAxcHggc29saWQgI2RkZDsgbWFyZ2luOiAwOyB3aGl0ZS1zcGFjZTogcHJlLXdyYXA7IGZvbnQtZmFtaWx5OiBtb25vc3BhY2U7JztcbiAgICAgICAgICAgICAgICBkZXRhaWxzLnRleHRDb250ZW50ID0gSlNPTi5zdHJpbmdpZnkoY29udGV4dFJlc3VsdC5kYXRhLCBudWxsLCAyKTtcbiAgICAgICAgICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoZGV0YWlscyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBjb250YWluZXI7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSAnbGFzdEFjY2Vzc2VkJzpcbiAgICAgICAgICAgIHJldHVybiBuZXcgRGF0ZSgodGFiIGFzIGFueSkubGFzdEFjY2Vzc2VkIHx8IDApLnRvTG9jYWxlU3RyaW5nKCk7XG4gICAgICAgIGNhc2UgJ2FjdGlvbnMnOiB7XG4gICAgICAgICAgICBjb25zdCB3cmFwcGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICB3cmFwcGVyLmlubmVySFRNTCA9IGBcbiAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiZ290by10YWItYnRuXCIgZGF0YS10YWItaWQ9XCIke3RhYi5pZH1cIiBkYXRhLXdpbmRvdy1pZD1cIiR7dGFiLndpbmRvd0lkfVwiPkdvPC9idXR0b24+XG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImNsb3NlLXRhYi1idG5cIiBkYXRhLXRhYi1pZD1cIiR7dGFiLmlkfVwiIHN0eWxlPVwiYmFja2dyb3VuZC1jb2xvcjogI2RjMzU0NTsgbWFyZ2luLWxlZnQ6IDJweDtcIj5YPC9idXR0b24+XG4gICAgICAgICAgICBgO1xuICAgICAgICAgICAgcmV0dXJuIHdyYXBwZXI7XG4gICAgICAgIH1cbiAgICAgICAgZGVmYXVsdDogcmV0dXJuICcnO1xuICAgIH1cbn1cbiIsICJpbXBvcnQgeyBMb2dFbnRyeSwgTG9nTGV2ZWwsIFByZWZlcmVuY2VzIH0gZnJvbSBcIi4vdHlwZXMuanNcIjtcblxuY29uc3QgUFJFRklYID0gXCJbVGFiU29ydGVyXVwiO1xuXG5jb25zdCBMRVZFTF9QUklPUklUWTogUmVjb3JkPExvZ0xldmVsLCBudW1iZXI+ID0ge1xuICBkZWJ1ZzogMCxcbiAgaW5mbzogMSxcbiAgd2FybjogMixcbiAgZXJyb3I6IDMsXG4gIGNyaXRpY2FsOiA0XG59O1xuXG5sZXQgY3VycmVudExldmVsOiBMb2dMZXZlbCA9IFwiaW5mb1wiO1xubGV0IGxvZ3M6IExvZ0VudHJ5W10gPSBbXTtcbmNvbnN0IE1BWF9MT0dTID0gMTAwMDtcbmNvbnN0IFNUT1JBR0VfS0VZID0gXCJzZXNzaW9uTG9nc1wiO1xuXG5jb25zdCBTRU5TSVRJVkVfS0VZUyA9IC9wYXNzd29yZHxzZWNyZXR8dG9rZW58Y3JlZGVudGlhbHxjb29raWV8c2Vzc2lvbnxhdXRob3JpemF0aW9ufCgoYXBpfGFjY2Vzc3xzZWNyZXR8cHJpdmF0ZSlbLV9dP2tleSkvaTtcblxuY29uc3Qgc2FuaXRpemVDb250ZXh0ID0gKGNvbnRleHQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQgPT4ge1xuICAgIGlmICghY29udGV4dCkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB0cnkge1xuICAgICAgICAvLyBEZWVwIGNsb25lIHRvIGVuc3VyZSB3ZSBkb24ndCBtb2RpZnkgdGhlIG9yaWdpbmFsIG9iamVjdCBhbmQgcmVtb3ZlIG5vbi1zZXJpYWxpemFibGUgZGF0YVxuICAgICAgICBjb25zdCBqc29uID0gSlNPTi5zdHJpbmdpZnkoY29udGV4dCk7XG4gICAgICAgIGNvbnN0IG9iaiA9IEpTT04ucGFyc2UoanNvbik7XG5cbiAgICAgICAgY29uc3QgcmVkYWN0ID0gKG86IGFueSkgPT4ge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBvICE9PSAnb2JqZWN0JyB8fCBvID09PSBudWxsKSByZXR1cm47XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGsgaW4gbykge1xuICAgICAgICAgICAgICAgIGlmIChTRU5TSVRJVkVfS0VZUy50ZXN0KGspKSB7XG4gICAgICAgICAgICAgICAgICAgIG9ba10gPSAnW1JFREFDVEVEXSc7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVkYWN0KG9ba10pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgcmVkYWN0KG9iaik7XG4gICAgICAgIHJldHVybiBvYmo7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICByZXR1cm4geyBlcnJvcjogXCJGYWlsZWQgdG8gc2FuaXRpemUgY29udGV4dFwiIH07XG4gICAgfVxufTtcblxuLy8gU2FmZSBjb250ZXh0IGNoZWNrXG5jb25zdCBpc1NlcnZpY2VXb3JrZXIgPSB0eXBlb2Ygc2VsZiAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVvZiAoc2VsZiBhcyBhbnkpLlNlcnZpY2VXb3JrZXJHbG9iYWxTY29wZSAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYgaW5zdGFuY2VvZiAoc2VsZiBhcyBhbnkpLlNlcnZpY2VXb3JrZXJHbG9iYWxTY29wZTtcbmxldCBpc1NhdmluZyA9IGZhbHNlO1xubGV0IHBlbmRpbmdTYXZlID0gZmFsc2U7XG5sZXQgc2F2ZVRpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsO1xuXG5jb25zdCBkb1NhdmUgPSAoKSA9PiB7XG4gICAgaWYgKCFpc1NlcnZpY2VXb3JrZXIgfHwgIWNocm9tZT8uc3RvcmFnZT8uc2Vzc2lvbiB8fCBpc1NhdmluZykge1xuICAgICAgICBwZW5kaW5nU2F2ZSA9IHRydWU7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpc1NhdmluZyA9IHRydWU7XG4gICAgcGVuZGluZ1NhdmUgPSBmYWxzZTtcblxuICAgIGNocm9tZS5zdG9yYWdlLnNlc3Npb24uc2V0KHsgW1NUT1JBR0VfS0VZXTogbG9ncyB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgaXNTYXZpbmcgPSBmYWxzZTtcbiAgICAgICAgaWYgKHBlbmRpbmdTYXZlKSB7XG4gICAgICAgICAgICBzYXZlTG9nc1RvU3RvcmFnZSgpO1xuICAgICAgICB9XG4gICAgfSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBzYXZlIGxvZ3NcIiwgZXJyKTtcbiAgICAgICAgaXNTYXZpbmcgPSBmYWxzZTtcbiAgICB9KTtcbn07XG5cbmNvbnN0IHNhdmVMb2dzVG9TdG9yYWdlID0gKCkgPT4ge1xuICAgIGlmIChzYXZlVGltZXIpIGNsZWFyVGltZW91dChzYXZlVGltZXIpO1xuICAgIHNhdmVUaW1lciA9IHNldFRpbWVvdXQoZG9TYXZlLCAxMDAwKTtcbn07XG5cbmxldCByZXNvbHZlTG9nZ2VyUmVhZHk6ICgpID0+IHZvaWQ7XG5leHBvcnQgY29uc3QgbG9nZ2VyUmVhZHkgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcbiAgICByZXNvbHZlTG9nZ2VyUmVhZHkgPSByZXNvbHZlO1xufSk7XG5cbmV4cG9ydCBjb25zdCBpbml0TG9nZ2VyID0gYXN5bmMgKCkgPT4ge1xuICAgIGlmIChpc1NlcnZpY2VXb3JrZXIgJiYgY2hyb21lPy5zdG9yYWdlPy5zZXNzaW9uKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjaHJvbWUuc3RvcmFnZS5zZXNzaW9uLmdldChTVE9SQUdFX0tFWSk7XG4gICAgICAgICAgICBpZiAocmVzdWx0W1NUT1JBR0VfS0VZXSAmJiBBcnJheS5pc0FycmF5KHJlc3VsdFtTVE9SQUdFX0tFWV0pKSB7XG4gICAgICAgICAgICAgICAgbG9ncyA9IHJlc3VsdFtTVE9SQUdFX0tFWV07XG4gICAgICAgICAgICAgICAgaWYgKGxvZ3MubGVuZ3RoID4gTUFYX0xPR1MpIGxvZ3MgPSBsb2dzLnNsaWNlKDAsIE1BWF9MT0dTKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byByZXN0b3JlIGxvZ3NcIiwgZSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKHJlc29sdmVMb2dnZXJSZWFkeSkgcmVzb2x2ZUxvZ2dlclJlYWR5KCk7XG59O1xuXG5leHBvcnQgY29uc3Qgc2V0TG9nZ2VyUHJlZmVyZW5jZXMgPSAocHJlZnM6IFByZWZlcmVuY2VzKSA9PiB7XG4gIGlmIChwcmVmcy5sb2dMZXZlbCkge1xuICAgIGN1cnJlbnRMZXZlbCA9IHByZWZzLmxvZ0xldmVsO1xuICB9IGVsc2UgaWYgKHByZWZzLmRlYnVnKSB7XG4gICAgY3VycmVudExldmVsID0gXCJkZWJ1Z1wiO1xuICB9IGVsc2Uge1xuICAgIGN1cnJlbnRMZXZlbCA9IFwiaW5mb1wiO1xuICB9XG59O1xuXG5jb25zdCBzaG91bGRMb2cgPSAobGV2ZWw6IExvZ0xldmVsKTogYm9vbGVhbiA9PiB7XG4gIHJldHVybiBMRVZFTF9QUklPUklUWVtsZXZlbF0gPj0gTEVWRUxfUFJJT1JJVFlbY3VycmVudExldmVsXTtcbn07XG5cbmNvbnN0IGZvcm1hdE1lc3NhZ2UgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgcmV0dXJuIGNvbnRleHQgPyBgJHttZXNzYWdlfSA6OiAke0pTT04uc3RyaW5naWZ5KGNvbnRleHQpfWAgOiBtZXNzYWdlO1xufTtcblxuY29uc3QgYWRkTG9nID0gKGxldmVsOiBMb2dMZXZlbCwgbWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgaWYgKHNob3VsZExvZyhsZXZlbCkpIHtcbiAgICAgIGNvbnN0IGVudHJ5OiBMb2dFbnRyeSA9IHtcbiAgICAgICAgICB0aW1lc3RhbXA6IERhdGUubm93KCksXG4gICAgICAgICAgbGV2ZWwsXG4gICAgICAgICAgbWVzc2FnZSxcbiAgICAgICAgICBjb250ZXh0XG4gICAgICB9O1xuXG4gICAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSB7XG4gICAgICAgICAgbG9ncy51bnNoaWZ0KGVudHJ5KTtcbiAgICAgICAgICBpZiAobG9ncy5sZW5ndGggPiBNQVhfTE9HUykge1xuICAgICAgICAgICAgICBsb2dzLnBvcCgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBzYXZlTG9nc1RvU3RvcmFnZSgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBJbiBvdGhlciBjb250ZXh0cywgc2VuZCB0byBTV1xuICAgICAgICAgIGlmIChjaHJvbWU/LnJ1bnRpbWU/LnNlbmRNZXNzYWdlKSB7XG4gICAgICAgICAgICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiAnbG9nRW50cnknLCBwYXlsb2FkOiBlbnRyeSB9KS5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgIC8vIElnbm9yZSBpZiBtZXNzYWdlIGZhaWxzIChlLmcuIGNvbnRleHQgaW52YWxpZGF0ZWQpXG4gICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgfVxuICB9XG59O1xuXG5leHBvcnQgY29uc3QgYWRkTG9nRW50cnkgPSAoZW50cnk6IExvZ0VudHJ5KSA9PiB7XG4gICAgaWYgKGlzU2VydmljZVdvcmtlcikge1xuICAgICAgICAvLyBFbnN1cmUgY29udGV4dCBpcyBzYW5pdGl6ZWQgYmVmb3JlIHN0b3JpbmdcbiAgICAgICAgY29uc3Qgc2FmZUNvbnRleHQgPSBzYW5pdGl6ZUNvbnRleHQoZW50cnkuY29udGV4dCk7XG4gICAgICAgIGNvbnN0IHNhZmVFbnRyeSA9IHsgLi4uZW50cnksIGNvbnRleHQ6IHNhZmVDb250ZXh0IH07XG5cbiAgICAgICAgbG9ncy51bnNoaWZ0KHNhZmVFbnRyeSk7XG4gICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSB7XG4gICAgICAgICAgICBsb2dzLnBvcCgpO1xuICAgICAgICB9XG4gICAgICAgIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG4gICAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGdldExvZ3MgPSAoKSA9PiBbLi4ubG9nc107XG5leHBvcnQgY29uc3QgY2xlYXJMb2dzID0gKCkgPT4ge1xuICAgIGxvZ3MubGVuZ3RoID0gMDtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSBzYXZlTG9nc1RvU3RvcmFnZSgpO1xufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0RlYnVnID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGlmIChzaG91bGRMb2coXCJkZWJ1Z1wiKSkge1xuICAgICAgY29uc3Qgc2FmZUNvbnRleHQgPSBzYW5pdGl6ZUNvbnRleHQoY29udGV4dCk7XG4gICAgICBhZGRMb2coXCJkZWJ1Z1wiLCBtZXNzYWdlLCBzYWZlQ29udGV4dCk7XG4gICAgICBjb25zb2xlLmRlYnVnKGAke1BSRUZJWH0gW0RFQlVHXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgc2FmZUNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nSW5mbyA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBpZiAoc2hvdWxkTG9nKFwiaW5mb1wiKSkge1xuICAgICAgY29uc3Qgc2FmZUNvbnRleHQgPSBzYW5pdGl6ZUNvbnRleHQoY29udGV4dCk7XG4gICAgICBhZGRMb2coXCJpbmZvXCIsIG1lc3NhZ2UsIHNhZmVDb250ZXh0KTtcbiAgICAgIGNvbnNvbGUuaW5mbyhgJHtQUkVGSVh9IFtJTkZPXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgc2FmZUNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nV2FybiA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBpZiAoc2hvdWxkTG9nKFwid2FyblwiKSkge1xuICAgICAgY29uc3Qgc2FmZUNvbnRleHQgPSBzYW5pdGl6ZUNvbnRleHQoY29udGV4dCk7XG4gICAgICBhZGRMb2coXCJ3YXJuXCIsIG1lc3NhZ2UsIHNhZmVDb250ZXh0KTtcbiAgICAgIGNvbnNvbGUud2FybihgJHtQUkVGSVh9IFtXQVJOXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgc2FmZUNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nRXJyb3IgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgaWYgKHNob3VsZExvZyhcImVycm9yXCIpKSB7XG4gICAgICBjb25zdCBzYWZlQ29udGV4dCA9IHNhbml0aXplQ29udGV4dChjb250ZXh0KTtcbiAgICAgIGFkZExvZyhcImVycm9yXCIsIG1lc3NhZ2UsIHNhZmVDb250ZXh0KTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYCR7UFJFRklYfSBbRVJST1JdICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBzYWZlQ29udGV4dCl9YCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBsb2dDcml0aWNhbCA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBpZiAoc2hvdWxkTG9nKFwiY3JpdGljYWxcIikpIHtcbiAgICAgIGNvbnN0IHNhZmVDb250ZXh0ID0gc2FuaXRpemVDb250ZXh0KGNvbnRleHQpO1xuICAgICAgYWRkTG9nKFwiY3JpdGljYWxcIiwgbWVzc2FnZSwgc2FmZUNvbnRleHQpO1xuICAgICAgLy8gQ3JpdGljYWwgbG9ncyB1c2UgZXJyb3IgY29uc29sZSBidXQgd2l0aCBkaXN0aW5jdCBwcmVmaXggYW5kIG1heWJlIHN0eWxpbmcgaWYgc3VwcG9ydGVkXG4gICAgICBjb25zb2xlLmVycm9yKGAke1BSRUZJWH0gW0NSSVRJQ0FMXSBcdUQ4M0RcdURFQTggJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIHNhZmVDb250ZXh0KX1gKTtcbiAgfVxufTtcbiIsICIvLyBsb2dpYy50c1xuLy8gUHVyZSBmdW5jdGlvbnMgZm9yIGV4dHJhY3Rpb24gbG9naWNcblxuY29uc3QgVFJBQ0tJTkdfUEFSQU1TID0gW1xuICAvXnV0bV8vLFxuICAvXmZiY2xpZCQvLFxuICAvXmdjbGlkJC8sXG4gIC9eX2dhJC8sXG4gIC9ecmVmJC8sXG4gIC9eeWNsaWQkLyxcbiAgL15faHMvXG5dO1xuXG5jb25zdCBET01BSU5fQUxMT1dMSVNUUzogUmVjb3JkPHN0cmluZywgc3RyaW5nW10+ID0ge1xuICAneW91dHViZS5jb20nOiBbJ3YnLCAnbGlzdCcsICd0JywgJ2MnLCAnY2hhbm5lbCcsICdwbGF5bGlzdCddLFxuICAneW91dHUuYmUnOiBbJ3YnLCAnbGlzdCcsICd0JywgJ2MnLCAnY2hhbm5lbCcsICdwbGF5bGlzdCddLFxuICAnZ29vZ2xlLmNvbSc6IFsncScsICdpZCcsICdzb3VyY2VpZCddXG59O1xuXG5mdW5jdGlvbiBnZXRBbGxvd2VkUGFyYW1zKGhvc3RuYW1lOiBzdHJpbmcpOiBzdHJpbmdbXSB8IG51bGwge1xuICBpZiAoRE9NQUlOX0FMTE9XTElTVFNbaG9zdG5hbWVdKSByZXR1cm4gRE9NQUlOX0FMTE9XTElTVFNbaG9zdG5hbWVdO1xuICBmb3IgKGNvbnN0IGRvbWFpbiBpbiBET01BSU5fQUxMT1dMSVNUUykge1xuICAgIGlmIChob3N0bmFtZS5lbmRzV2l0aCgnLicgKyBkb21haW4pKSByZXR1cm4gRE9NQUlOX0FMTE9XTElTVFNbZG9tYWluXTtcbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZVVybCh1cmxTdHI6IHN0cmluZyk6IHN0cmluZyB7XG4gIHRyeSB7XG4gICAgY29uc3QgdXJsID0gbmV3IFVSTCh1cmxTdHIpO1xuICAgIGNvbnN0IHBhcmFtcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXModXJsLnNlYXJjaCk7XG4gICAgY29uc3QgaG9zdG5hbWUgPSB1cmwuaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sICcnKTtcbiAgICBjb25zdCBhbGxvd2VkUGFyYW1zID0gZ2V0QWxsb3dlZFBhcmFtcyhob3N0bmFtZSk7XG5cbiAgICBjb25zdCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuICAgIHBhcmFtcy5mb3JFYWNoKChfLCBrZXkpID0+IGtleXMucHVzaChrZXkpKTtcblxuICAgIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICAgIGlmIChUUkFDS0lOR19QQVJBTVMuc29tZShyID0+IHIudGVzdChrZXkpKSkge1xuICAgICAgICBwYXJhbXMuZGVsZXRlKGtleSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKGFsbG93ZWRQYXJhbXMgJiYgIWFsbG93ZWRQYXJhbXMuaW5jbHVkZXMoa2V5KSkge1xuICAgICAgICBwYXJhbXMuZGVsZXRlKGtleSk7XG4gICAgICB9XG4gICAgfVxuICAgIHVybC5zZWFyY2ggPSBwYXJhbXMudG9TdHJpbmcoKTtcbiAgICByZXR1cm4gdXJsLnRvU3RyaW5nKCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICByZXR1cm4gdXJsU3RyO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVlvdVR1YmVVcmwodXJsU3RyOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHVybFN0cik7XG4gICAgICAgIGNvbnN0IHYgPSB1cmwuc2VhcmNoUGFyYW1zLmdldCgndicpO1xuICAgICAgICBjb25zdCBpc1Nob3J0cyA9IHVybC5wYXRobmFtZS5pbmNsdWRlcygnL3Nob3J0cy8nKTtcbiAgICAgICAgbGV0IHZpZGVvSWQgPVxuICAgICAgICAgIHYgfHxcbiAgICAgICAgICAoaXNTaG9ydHMgPyB1cmwucGF0aG5hbWUuc3BsaXQoJy9zaG9ydHMvJylbMV0gOiBudWxsKSB8fFxuICAgICAgICAgICh1cmwuaG9zdG5hbWUgPT09ICd5b3V0dS5iZScgPyB1cmwucGF0aG5hbWUucmVwbGFjZSgnLycsICcnKSA6IG51bGwpO1xuXG4gICAgICAgIGNvbnN0IHBsYXlsaXN0SWQgPSB1cmwuc2VhcmNoUGFyYW1zLmdldCgnbGlzdCcpO1xuICAgICAgICBjb25zdCBwbGF5bGlzdEluZGV4ID0gcGFyc2VJbnQodXJsLnNlYXJjaFBhcmFtcy5nZXQoJ2luZGV4JykgfHwgJzAnLCAxMCk7XG5cbiAgICAgICAgcmV0dXJuIHsgdmlkZW9JZCwgaXNTaG9ydHMsIHBsYXlsaXN0SWQsIHBsYXlsaXN0SW5kZXggfTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHJldHVybiB7IHZpZGVvSWQ6IG51bGwsIGlzU2hvcnRzOiBmYWxzZSwgcGxheWxpc3RJZDogbnVsbCwgcGxheWxpc3RJbmRleDogbnVsbCB9O1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZXh0cmFjdEF1dGhvcihlbnRpdHk6IGFueSk6IHN0cmluZyB8IG51bGwge1xuICAgIGlmICghZW50aXR5IHx8ICFlbnRpdHkuYXV0aG9yKSByZXR1cm4gbnVsbDtcbiAgICBpZiAodHlwZW9mIGVudGl0eS5hdXRob3IgPT09ICdzdHJpbmcnKSByZXR1cm4gZW50aXR5LmF1dGhvcjtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShlbnRpdHkuYXV0aG9yKSkgcmV0dXJuIGVudGl0eS5hdXRob3JbMF0/Lm5hbWUgfHwgbnVsbDtcbiAgICBpZiAodHlwZW9mIGVudGl0eS5hdXRob3IgPT09ICdvYmplY3QnKSByZXR1cm4gZW50aXR5LmF1dGhvci5uYW1lIHx8IG51bGw7XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIGV4dHJhY3RLZXl3b3JkcyhlbnRpdHk6IGFueSk6IHN0cmluZ1tdIHtcbiAgICBpZiAoIWVudGl0eSB8fCAhZW50aXR5LmtleXdvcmRzKSByZXR1cm4gW107XG4gICAgaWYgKHR5cGVvZiBlbnRpdHkua2V5d29yZHMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJldHVybiBlbnRpdHkua2V5d29yZHMuc3BsaXQoJywnKS5tYXAoKHM6IHN0cmluZykgPT4gcy50cmltKCkpO1xuICAgIH1cbiAgICBpZiAoQXJyYXkuaXNBcnJheShlbnRpdHkua2V5d29yZHMpKSByZXR1cm4gZW50aXR5LmtleXdvcmRzO1xuICAgIHJldHVybiBbXTtcbn1cblxuZnVuY3Rpb24gZXh0cmFjdEJyZWFkY3J1bWJzKGpzb25MZDogYW55W10pOiBzdHJpbmdbXSB7XG4gICAgY29uc3QgYnJlYWRjcnVtYkxkID0ganNvbkxkLmZpbmQoaSA9PiBpICYmIGlbJ0B0eXBlJ10gPT09ICdCcmVhZGNydW1iTGlzdCcpO1xuICAgIGlmICghYnJlYWRjcnVtYkxkIHx8ICFBcnJheS5pc0FycmF5KGJyZWFkY3J1bWJMZC5pdGVtTGlzdEVsZW1lbnQpKSByZXR1cm4gW107XG5cbiAgICBjb25zdCBsaXN0ID0gYnJlYWRjcnVtYkxkLml0ZW1MaXN0RWxlbWVudC5zb3J0KChhOiBhbnksIGI6IGFueSkgPT4gKGEucG9zaXRpb24gfHwgMCkgLSAoYi5wb3NpdGlvbiB8fCAwKSk7XG4gICAgY29uc3QgYnJlYWRjcnVtYnM6IHN0cmluZ1tdID0gW107XG4gICAgbGlzdC5mb3JFYWNoKChpdGVtOiBhbnkpID0+IHtcbiAgICAgICAgaWYgKGl0ZW0ubmFtZSkgYnJlYWRjcnVtYnMucHVzaChpdGVtLm5hbWUpO1xuICAgICAgICBlbHNlIGlmIChpdGVtLml0ZW0gJiYgaXRlbS5pdGVtLm5hbWUpIGJyZWFkY3J1bWJzLnB1c2goaXRlbS5pdGVtLm5hbWUpO1xuICAgIH0pO1xuICAgIHJldHVybiBicmVhZGNydW1icztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RKc29uTGRGaWVsZHMoanNvbkxkOiBhbnlbXSkge1xuICAgIC8vIEZpbmQgbWFpbiBlbnRpdHlcbiAgICAvLyBBZGRlZCBzYWZldHkgY2hlY2s6IGkgJiYgaVsnQHR5cGUnXVxuICAgIGNvbnN0IG1haW5FbnRpdHkgPSBqc29uTGQuZmluZChpID0+IGkgJiYgKGlbJ0B0eXBlJ10gPT09ICdBcnRpY2xlJyB8fCBpWydAdHlwZSddID09PSAnVmlkZW9PYmplY3QnIHx8IGlbJ0B0eXBlJ10gPT09ICdOZXdzQXJ0aWNsZScpKSB8fCBqc29uTGRbMF07XG5cbiAgICBsZXQgYXV0aG9yOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICBsZXQgcHVibGlzaGVkQXQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgIGxldCBtb2RpZmllZEF0OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICBsZXQgdGFnczogc3RyaW5nW10gPSBbXTtcblxuICAgIGlmIChtYWluRW50aXR5KSB7XG4gICAgICAgIGF1dGhvciA9IGV4dHJhY3RBdXRob3IobWFpbkVudGl0eSk7XG4gICAgICAgIHB1Ymxpc2hlZEF0ID0gbWFpbkVudGl0eS5kYXRlUHVibGlzaGVkIHx8IG51bGw7XG4gICAgICAgIG1vZGlmaWVkQXQgPSBtYWluRW50aXR5LmRhdGVNb2RpZmllZCB8fCBudWxsO1xuICAgICAgICB0YWdzID0gZXh0cmFjdEtleXdvcmRzKG1haW5FbnRpdHkpO1xuICAgIH1cblxuICAgIGNvbnN0IGJyZWFkY3J1bWJzID0gZXh0cmFjdEJyZWFkY3J1bWJzKGpzb25MZCk7XG5cbiAgICByZXR1cm4geyBhdXRob3IsIHB1Ymxpc2hlZEF0LCBtb2RpZmllZEF0LCB0YWdzLCBicmVhZGNydW1icyB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXh0cmFjdFlvdVR1YmVDaGFubmVsRnJvbUh0bWwoaHRtbDogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG4gIC8vIDEuIFRyeSBKU09OLUxEXG4gIC8vIExvb2sgZm9yIDxzY3JpcHQgdHlwZT1cImFwcGxpY2F0aW9uL2xkK2pzb25cIj4uLi48L3NjcmlwdD5cbiAgLy8gV2UgbmVlZCB0byBsb29wIGJlY2F1c2UgdGhlcmUgbWlnaHQgYmUgbXVsdGlwbGUgc2NyaXB0c1xuICBjb25zdCBzY3JpcHRSZWdleCA9IC88c2NyaXB0XFxzK3R5cGU9W1wiJ11hcHBsaWNhdGlvblxcL2xkXFwranNvbltcIiddW14+XSo+KFtcXHNcXFNdKj8pPFxcL3NjcmlwdD4vZ2k7XG4gIGxldCBtYXRjaDtcbiAgd2hpbGUgKChtYXRjaCA9IHNjcmlwdFJlZ2V4LmV4ZWMoaHRtbCkpICE9PSBudWxsKSB7XG4gICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGpzb24gPSBKU09OLnBhcnNlKG1hdGNoWzFdKTtcbiAgICAgICAgICBjb25zdCBhcnJheSA9IEFycmF5LmlzQXJyYXkoanNvbikgPyBqc29uIDogW2pzb25dO1xuICAgICAgICAgIGNvbnN0IGZpZWxkcyA9IGV4dHJhY3RKc29uTGRGaWVsZHMoYXJyYXkpO1xuICAgICAgICAgIGlmIChmaWVsZHMuYXV0aG9yKSByZXR1cm4gZmllbGRzLmF1dGhvcjtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAvLyBpZ25vcmUgcGFyc2UgZXJyb3JzXG4gICAgICB9XG4gIH1cblxuICAvLyAyLiBUcnkgPGxpbmsgaXRlbXByb3A9XCJuYW1lXCIgY29udGVudD1cIi4uLlwiPiAoWW91VHViZSBvZnRlbiBwdXRzIGNoYW5uZWwgbmFtZSBoZXJlIGluIHNvbWUgY29udGV4dHMpXG4gIC8vIE9yIDxtZXRhIGl0ZW1wcm9wPVwiY2hhbm5lbElkXCIgY29udGVudD1cIi4uLlwiPiAtPiBidXQgdGhhdCdzIElELlxuICAvLyA8bGluayBpdGVtcHJvcD1cIm5hbWVcIiBjb250ZW50PVwiQ2hhbm5lbCBOYW1lXCI+XG4gIC8vIDxzcGFuIGl0ZW1wcm9wPVwiYXV0aG9yXCIgaXRlbXNjb3BlIGl0ZW10eXBlPVwiaHR0cDovL3NjaGVtYS5vcmcvUGVyc29uXCI+PGxpbmsgaXRlbXByb3A9XCJuYW1lXCIgY29udGVudD1cIkNoYW5uZWwgTmFtZVwiPjwvc3Bhbj5cbiAgY29uc3QgbGlua05hbWVSZWdleCA9IC88bGlua1xccytpdGVtcHJvcD1bXCInXW5hbWVbXCInXVxccytjb250ZW50PVtcIiddKFteXCInXSspW1wiJ11cXHMqXFwvPz4vaTtcbiAgY29uc3QgbGlua01hdGNoID0gbGlua05hbWVSZWdleC5leGVjKGh0bWwpO1xuICBpZiAobGlua01hdGNoICYmIGxpbmtNYXRjaFsxXSkgcmV0dXJuIGRlY29kZUh0bWxFbnRpdGllcyhsaW5rTWF0Y2hbMV0pO1xuXG4gIC8vIDMuIFRyeSBtZXRhIGF1dGhvclxuICBjb25zdCBtZXRhQXV0aG9yUmVnZXggPSAvPG1ldGFcXHMrbmFtZT1bXCInXWF1dGhvcltcIiddXFxzK2NvbnRlbnQ9W1wiJ10oW15cIiddKylbXCInXVxccypcXC8/Pi9pO1xuICBjb25zdCBtZXRhTWF0Y2ggPSBtZXRhQXV0aG9yUmVnZXguZXhlYyhodG1sKTtcbiAgaWYgKG1ldGFNYXRjaCAmJiBtZXRhTWF0Y2hbMV0pIHtcbiAgICAgIC8vIFlvdVR1YmUgbWV0YSBhdXRob3IgaXMgb2Z0ZW4gXCJDaGFubmVsIE5hbWVcIlxuICAgICAgcmV0dXJuIGRlY29kZUh0bWxFbnRpdGllcyhtZXRhTWF0Y2hbMV0pO1xuICB9XG5cbiAgcmV0dXJuIG51bGw7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0WW91VHViZUdlbnJlRnJvbUh0bWwoaHRtbDogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG4gIC8vIDEuIFRyeSA8bWV0YSBpdGVtcHJvcD1cImdlbnJlXCIgY29udGVudD1cIi4uLlwiPlxuICBjb25zdCBtZXRhR2VucmVSZWdleCA9IC88bWV0YVxccytpdGVtcHJvcD1bXCInXWdlbnJlW1wiJ11cXHMrY29udGVudD1bXCInXShbXlwiJ10rKVtcIiddXFxzKlxcLz8+L2k7XG4gIGNvbnN0IG1ldGFNYXRjaCA9IG1ldGFHZW5yZVJlZ2V4LmV4ZWMoaHRtbCk7XG4gIGlmIChtZXRhTWF0Y2ggJiYgbWV0YU1hdGNoWzFdKSB7XG4gICAgICByZXR1cm4gZGVjb2RlSHRtbEVudGl0aWVzKG1ldGFNYXRjaFsxXSk7XG4gIH1cblxuICAvLyAyLiBUcnkgSlNPTiBcImNhdGVnb3J5XCIgaW4gc2NyaXB0c1xuICAvLyBcImNhdGVnb3J5XCI6XCJHYW1pbmdcIlxuICBjb25zdCBjYXRlZ29yeVJlZ2V4ID0gL1wiY2F0ZWdvcnlcIlxccyo6XFxzKlwiKFteXCJdKylcIi87XG4gIGNvbnN0IGNhdE1hdGNoID0gY2F0ZWdvcnlSZWdleC5leGVjKGh0bWwpO1xuICBpZiAoY2F0TWF0Y2ggJiYgY2F0TWF0Y2hbMV0pIHtcbiAgICAgIHJldHVybiBkZWNvZGVIdG1sRW50aXRpZXMoY2F0TWF0Y2hbMV0pO1xuICB9XG5cbiAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIGRlY29kZUh0bWxFbnRpdGllcyh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBpZiAoIXRleHQpIHJldHVybiB0ZXh0O1xuXG4gIGNvbnN0IGVudGl0aWVzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgICcmYW1wOyc6ICcmJyxcbiAgICAnJmx0Oyc6ICc8JyxcbiAgICAnJmd0Oyc6ICc+JyxcbiAgICAnJnF1b3Q7JzogJ1wiJyxcbiAgICAnJiMzOTsnOiBcIidcIixcbiAgICAnJmFwb3M7JzogXCInXCIsXG4gICAgJyZuYnNwOyc6ICcgJ1xuICB9O1xuXG4gIHJldHVybiB0ZXh0LnJlcGxhY2UoLyYoW2EtejAtOV0rfCNbMC05XXsxLDZ9fCN4WzAtOWEtZkEtRl17MSw2fSk7L2lnLCAobWF0Y2gpID0+IHtcbiAgICAgIGNvbnN0IGxvd2VyID0gbWF0Y2gudG9Mb3dlckNhc2UoKTtcbiAgICAgIGlmIChlbnRpdGllc1tsb3dlcl0pIHJldHVybiBlbnRpdGllc1tsb3dlcl07XG4gICAgICBpZiAoZW50aXRpZXNbbWF0Y2hdKSByZXR1cm4gZW50aXRpZXNbbWF0Y2hdO1xuXG4gICAgICBpZiAobG93ZXIuc3RhcnRzV2l0aCgnJiN4JykpIHtcbiAgICAgICAgICB0cnkgeyByZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZShwYXJzZUludChsb3dlci5zbGljZSgzLCAtMSksIDE2KSk7IH0gY2F0Y2ggeyByZXR1cm4gbWF0Y2g7IH1cbiAgICAgIH1cbiAgICAgIGlmIChsb3dlci5zdGFydHNXaXRoKCcmIycpKSB7XG4gICAgICAgICAgdHJ5IHsgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUocGFyc2VJbnQobG93ZXIuc2xpY2UoMiwgLTEpLCAxMCkpOyB9IGNhdGNoIHsgcmV0dXJuIG1hdGNoOyB9XG4gICAgICB9XG4gICAgICByZXR1cm4gbWF0Y2g7XG4gIH0pO1xufVxuIiwgIlxuZXhwb3J0IGNvbnN0IEdFTkVSQV9SRUdJU1RSWTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgLy8gU2VhcmNoXG4gICdnb29nbGUuY29tJzogJ1NlYXJjaCcsXG4gICdiaW5nLmNvbSc6ICdTZWFyY2gnLFxuICAnZHVja2R1Y2tnby5jb20nOiAnU2VhcmNoJyxcbiAgJ3lhaG9vLmNvbSc6ICdTZWFyY2gnLFxuICAnYmFpZHUuY29tJzogJ1NlYXJjaCcsXG4gICd5YW5kZXguY29tJzogJ1NlYXJjaCcsXG4gICdrYWdpLmNvbSc6ICdTZWFyY2gnLFxuICAnZWNvc2lhLm9yZyc6ICdTZWFyY2gnLFxuXG4gIC8vIFNvY2lhbFxuICAnZmFjZWJvb2suY29tJzogJ1NvY2lhbCcsXG4gICd0d2l0dGVyLmNvbSc6ICdTb2NpYWwnLFxuICAneC5jb20nOiAnU29jaWFsJyxcbiAgJ2luc3RhZ3JhbS5jb20nOiAnU29jaWFsJyxcbiAgJ2xpbmtlZGluLmNvbSc6ICdTb2NpYWwnLFxuICAncmVkZGl0LmNvbSc6ICdTb2NpYWwnLFxuICAndGlrdG9rLmNvbSc6ICdTb2NpYWwnLFxuICAncGludGVyZXN0LmNvbSc6ICdTb2NpYWwnLFxuICAnc25hcGNoYXQuY29tJzogJ1NvY2lhbCcsXG4gICd0dW1ibHIuY29tJzogJ1NvY2lhbCcsXG4gICd0aHJlYWRzLm5ldCc6ICdTb2NpYWwnLFxuICAnYmx1ZXNreS5hcHAnOiAnU29jaWFsJyxcbiAgJ21hc3RvZG9uLnNvY2lhbCc6ICdTb2NpYWwnLFxuXG4gIC8vIFZpZGVvXG4gICd5b3V0dWJlLmNvbSc6ICdWaWRlbycsXG4gICd5b3V0dS5iZSc6ICdWaWRlbycsXG4gICd2aW1lby5jb20nOiAnVmlkZW8nLFxuICAndHdpdGNoLnR2JzogJ1ZpZGVvJyxcbiAgJ25ldGZsaXguY29tJzogJ1ZpZGVvJyxcbiAgJ2h1bHUuY29tJzogJ1ZpZGVvJyxcbiAgJ2Rpc25leXBsdXMuY29tJzogJ1ZpZGVvJyxcbiAgJ2RhaWx5bW90aW9uLmNvbSc6ICdWaWRlbycsXG4gICdwcmltZXZpZGVvLmNvbSc6ICdWaWRlbycsXG4gICdoYm9tYXguY29tJzogJ1ZpZGVvJyxcbiAgJ21heC5jb20nOiAnVmlkZW8nLFxuICAncGVhY29ja3R2LmNvbSc6ICdWaWRlbycsXG5cbiAgLy8gRGV2ZWxvcG1lbnRcbiAgJ2dpdGh1Yi5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnZ2l0bGFiLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdzdGFja292ZXJmbG93LmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICducG1qcy5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAncHlwaS5vcmcnOiAnRGV2ZWxvcG1lbnQnLFxuICAnZGV2ZWxvcGVyLm1vemlsbGEub3JnJzogJ0RldmVsb3BtZW50JyxcbiAgJ3czc2Nob29scy5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnZ2Vla3Nmb3JnZWVrcy5vcmcnOiAnRGV2ZWxvcG1lbnQnLFxuICAnamlyYS5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnYXRsYXNzaWFuLm5ldCc6ICdEZXZlbG9wbWVudCcsIC8vIG9mdGVuIGppcmFcbiAgJ2JpdGJ1Y2tldC5vcmcnOiAnRGV2ZWxvcG1lbnQnLFxuICAnZGV2LnRvJzogJ0RldmVsb3BtZW50JyxcbiAgJ2hhc2hub2RlLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdtZWRpdW0uY29tJzogJ0RldmVsb3BtZW50JywgLy8gR2VuZXJhbCBidXQgb2Z0ZW4gZGV2XG4gICd2ZXJjZWwuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ25ldGxpZnkuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2hlcm9rdS5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnYXdzLmFtYXpvbi5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnY29uc29sZS5hd3MuYW1hem9uLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdjbG91ZC5nb29nbGUuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2F6dXJlLm1pY3Jvc29mdC5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAncG9ydGFsLmF6dXJlLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdkb2NrZXIuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2t1YmVybmV0ZXMuaW8nOiAnRGV2ZWxvcG1lbnQnLFxuXG4gIC8vIE5ld3NcbiAgJ2Nubi5jb20nOiAnTmV3cycsXG4gICdiYmMuY29tJzogJ05ld3MnLFxuICAnbnl0aW1lcy5jb20nOiAnTmV3cycsXG4gICd3YXNoaW5ndG9ucG9zdC5jb20nOiAnTmV3cycsXG4gICd0aGVndWFyZGlhbi5jb20nOiAnTmV3cycsXG4gICdmb3JiZXMuY29tJzogJ05ld3MnLFxuICAnYmxvb21iZXJnLmNvbSc6ICdOZXdzJyxcbiAgJ3JldXRlcnMuY29tJzogJ05ld3MnLFxuICAnd3NqLmNvbSc6ICdOZXdzJyxcbiAgJ2NuYmMuY29tJzogJ05ld3MnLFxuICAnaHVmZnBvc3QuY29tJzogJ05ld3MnLFxuICAnbmV3cy5nb29nbGUuY29tJzogJ05ld3MnLFxuICAnZm94bmV3cy5jb20nOiAnTmV3cycsXG4gICduYmNuZXdzLmNvbSc6ICdOZXdzJyxcbiAgJ2FiY25ld3MuZ28uY29tJzogJ05ld3MnLFxuICAndXNhdG9kYXkuY29tJzogJ05ld3MnLFxuXG4gIC8vIFNob3BwaW5nXG4gICdhbWF6b24uY29tJzogJ1Nob3BwaW5nJyxcbiAgJ2ViYXkuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ3dhbG1hcnQuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ2V0c3kuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ3RhcmdldC5jb20nOiAnU2hvcHBpbmcnLFxuICAnYmVzdGJ1eS5jb20nOiAnU2hvcHBpbmcnLFxuICAnYWxpZXhwcmVzcy5jb20nOiAnU2hvcHBpbmcnLFxuICAnc2hvcGlmeS5jb20nOiAnU2hvcHBpbmcnLFxuICAndGVtdS5jb20nOiAnU2hvcHBpbmcnLFxuICAnc2hlaW4uY29tJzogJ1Nob3BwaW5nJyxcbiAgJ3dheWZhaXIuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ2Nvc3Rjby5jb20nOiAnU2hvcHBpbmcnLFxuXG4gIC8vIENvbW11bmljYXRpb25cbiAgJ21haWwuZ29vZ2xlLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ291dGxvb2subGl2ZS5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICdzbGFjay5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICdkaXNjb3JkLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ3pvb20udXMnOiAnQ29tbXVuaWNhdGlvbicsXG4gICd0ZWFtcy5taWNyb3NvZnQuY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnd2hhdHNhcHAuY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAndGVsZWdyYW0ub3JnJzogJ0NvbW11bmljYXRpb24nLFxuICAnbWVzc2VuZ2VyLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ3NreXBlLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcblxuICAvLyBGaW5hbmNlXG4gICdwYXlwYWwuY29tJzogJ0ZpbmFuY2UnLFxuICAnY2hhc2UuY29tJzogJ0ZpbmFuY2UnLFxuICAnYmFua29mYW1lcmljYS5jb20nOiAnRmluYW5jZScsXG4gICd3ZWxsc2ZhcmdvLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2FtZXJpY2FuZXhwcmVzcy5jb20nOiAnRmluYW5jZScsXG4gICdzdHJpcGUuY29tJzogJ0ZpbmFuY2UnLFxuICAnY29pbmJhc2UuY29tJzogJ0ZpbmFuY2UnLFxuICAnYmluYW5jZS5jb20nOiAnRmluYW5jZScsXG4gICdrcmFrZW4uY29tJzogJ0ZpbmFuY2UnLFxuICAncm9iaW5ob29kLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2ZpZGVsaXR5LmNvbSc6ICdGaW5hbmNlJyxcbiAgJ3Zhbmd1YXJkLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ3NjaHdhYi5jb20nOiAnRmluYW5jZScsXG4gICdtaW50LmludHVpdC5jb20nOiAnRmluYW5jZScsXG5cbiAgLy8gRWR1Y2F0aW9uXG4gICd3aWtpcGVkaWEub3JnJzogJ0VkdWNhdGlvbicsXG4gICdjb3Vyc2VyYS5vcmcnOiAnRWR1Y2F0aW9uJyxcbiAgJ3VkZW15LmNvbSc6ICdFZHVjYXRpb24nLFxuICAnZWR4Lm9yZyc6ICdFZHVjYXRpb24nLFxuICAna2hhbmFjYWRlbXkub3JnJzogJ0VkdWNhdGlvbicsXG4gICdxdWl6bGV0LmNvbSc6ICdFZHVjYXRpb24nLFxuICAnZHVvbGluZ28uY29tJzogJ0VkdWNhdGlvbicsXG4gICdjYW52YXMuaW5zdHJ1Y3R1cmUuY29tJzogJ0VkdWNhdGlvbicsXG4gICdibGFja2JvYXJkLmNvbSc6ICdFZHVjYXRpb24nLFxuICAnbWl0LmVkdSc6ICdFZHVjYXRpb24nLFxuICAnaGFydmFyZC5lZHUnOiAnRWR1Y2F0aW9uJyxcbiAgJ3N0YW5mb3JkLmVkdSc6ICdFZHVjYXRpb24nLFxuICAnYWNhZGVtaWEuZWR1JzogJ0VkdWNhdGlvbicsXG4gICdyZXNlYXJjaGdhdGUubmV0JzogJ0VkdWNhdGlvbicsXG5cbiAgLy8gRGVzaWduXG4gICdmaWdtYS5jb20nOiAnRGVzaWduJyxcbiAgJ2NhbnZhLmNvbSc6ICdEZXNpZ24nLFxuICAnYmVoYW5jZS5uZXQnOiAnRGVzaWduJyxcbiAgJ2RyaWJiYmxlLmNvbSc6ICdEZXNpZ24nLFxuICAnYWRvYmUuY29tJzogJ0Rlc2lnbicsXG4gICd1bnNwbGFzaC5jb20nOiAnRGVzaWduJyxcbiAgJ3BleGVscy5jb20nOiAnRGVzaWduJyxcbiAgJ3BpeGFiYXkuY29tJzogJ0Rlc2lnbicsXG4gICdzaHV0dGVyc3RvY2suY29tJzogJ0Rlc2lnbicsXG5cbiAgLy8gUHJvZHVjdGl2aXR5XG4gICdkb2NzLmdvb2dsZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ3NoZWV0cy5nb29nbGUuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdzbGlkZXMuZ29vZ2xlLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnZHJpdmUuZ29vZ2xlLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnbm90aW9uLnNvJzogJ1Byb2R1Y3Rpdml0eScsXG4gICd0cmVsbG8uY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdhc2FuYS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ21vbmRheS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2FpcnRhYmxlLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnZXZlcm5vdGUuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdkcm9wYm94LmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnY2xpY2t1cC5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2xpbmVhci5hcHAnOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ21pcm8uY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdsdWNpZGNoYXJ0LmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuXG4gIC8vIEFJXG4gICdvcGVuYWkuY29tJzogJ0FJJyxcbiAgJ2NoYXRncHQuY29tJzogJ0FJJyxcbiAgJ2FudGhyb3BpYy5jb20nOiAnQUknLFxuICAnbWlkam91cm5leS5jb20nOiAnQUknLFxuICAnaHVnZ2luZ2ZhY2UuY28nOiAnQUknLFxuICAnYmFyZC5nb29nbGUuY29tJzogJ0FJJyxcbiAgJ2dlbWluaS5nb29nbGUuY29tJzogJ0FJJyxcbiAgJ2NsYXVkZS5haSc6ICdBSScsXG4gICdwZXJwbGV4aXR5LmFpJzogJ0FJJyxcbiAgJ3BvZS5jb20nOiAnQUknLFxuXG4gIC8vIE11c2ljL0F1ZGlvXG4gICdzcG90aWZ5LmNvbSc6ICdNdXNpYycsXG4gICdzb3VuZGNsb3VkLmNvbSc6ICdNdXNpYycsXG4gICdtdXNpYy5hcHBsZS5jb20nOiAnTXVzaWMnLFxuICAncGFuZG9yYS5jb20nOiAnTXVzaWMnLFxuICAndGlkYWwuY29tJzogJ011c2ljJyxcbiAgJ2JhbmRjYW1wLmNvbSc6ICdNdXNpYycsXG4gICdhdWRpYmxlLmNvbSc6ICdNdXNpYycsXG5cbiAgLy8gR2FtaW5nXG4gICdzdGVhbXBvd2VyZWQuY29tJzogJ0dhbWluZycsXG4gICdyb2Jsb3guY29tJzogJ0dhbWluZycsXG4gICdlcGljZ2FtZXMuY29tJzogJ0dhbWluZycsXG4gICd4Ym94LmNvbSc6ICdHYW1pbmcnLFxuICAncGxheXN0YXRpb24uY29tJzogJ0dhbWluZycsXG4gICduaW50ZW5kby5jb20nOiAnR2FtaW5nJyxcbiAgJ2lnbi5jb20nOiAnR2FtaW5nJyxcbiAgJ2dhbWVzcG90LmNvbSc6ICdHYW1pbmcnLFxuICAna290YWt1LmNvbSc6ICdHYW1pbmcnLFxuICAncG9seWdvbi5jb20nOiAnR2FtaW5nJ1xufTtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldEdlbmVyYShob3N0bmFtZTogc3RyaW5nLCBjdXN0b21SZWdpc3RyeT86IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pOiBzdHJpbmcgfCBudWxsIHtcbiAgaWYgKCFob3N0bmFtZSkgcmV0dXJuIG51bGw7XG5cbiAgLy8gMC4gQ2hlY2sgY3VzdG9tIHJlZ2lzdHJ5IGZpcnN0XG4gIGlmIChjdXN0b21SZWdpc3RyeSkge1xuICAgICAgY29uc3QgcGFydHMgPSBob3N0bmFtZS5zcGxpdCgnLicpO1xuICAgICAgLy8gQ2hlY2sgZnVsbCBob3N0bmFtZSBhbmQgcHJvZ3Jlc3NpdmVseSBzaG9ydGVyIHN1ZmZpeGVzXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHBhcnRzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgICAgIGNvbnN0IGRvbWFpbiA9IHBhcnRzLnNsaWNlKGkpLmpvaW4oJy4nKTtcbiAgICAgICAgICBpZiAoY3VzdG9tUmVnaXN0cnlbZG9tYWluXSkge1xuICAgICAgICAgICAgICByZXR1cm4gY3VzdG9tUmVnaXN0cnlbZG9tYWluXTtcbiAgICAgICAgICB9XG4gICAgICB9XG4gIH1cblxuICAvLyAxLiBFeGFjdCBtYXRjaFxuICBpZiAoR0VORVJBX1JFR0lTVFJZW2hvc3RuYW1lXSkge1xuICAgIHJldHVybiBHRU5FUkFfUkVHSVNUUllbaG9zdG5hbWVdO1xuICB9XG5cbiAgLy8gMi4gU3ViZG9tYWluIGNoZWNrIChzdHJpcHBpbmcgc3ViZG9tYWlucylcbiAgLy8gZS5nLiBcImNvbnNvbGUuYXdzLmFtYXpvbi5jb21cIiAtPiBcImF3cy5hbWF6b24uY29tXCIgLT4gXCJhbWF6b24uY29tXCJcbiAgY29uc3QgcGFydHMgPSBob3N0bmFtZS5zcGxpdCgnLicpO1xuXG4gIC8vIFRyeSBtYXRjaGluZyBwcm9ncmVzc2l2ZWx5IHNob3J0ZXIgc3VmZml4ZXNcbiAgLy8gZS5nLiBhLmIuYy5jb20gLT4gYi5jLmNvbSAtPiBjLmNvbVxuICBmb3IgKGxldCBpID0gMDsgaSA8IHBhcnRzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgY29uc3QgZG9tYWluID0gcGFydHMuc2xpY2UoaSkuam9pbignLicpO1xuICAgICAgaWYgKEdFTkVSQV9SRUdJU1RSWVtkb21haW5dKSB7XG4gICAgICAgICAgcmV0dXJuIEdFTkVSQV9SRUdJU1RSWVtkb21haW5dO1xuICAgICAgfVxuICB9XG5cbiAgcmV0dXJuIG51bGw7XG59XG4iLCAiZXhwb3J0IGNvbnN0IGdldFN0b3JlZFZhbHVlID0gYXN5bmMgPFQ+KGtleTogc3RyaW5nKTogUHJvbWlzZTxUIHwgbnVsbD4gPT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoa2V5LCAoaXRlbXMpID0+IHtcbiAgICAgIHJlc29sdmUoKGl0ZW1zW2tleV0gYXMgVCkgPz8gbnVsbCk7XG4gICAgfSk7XG4gIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IHNldFN0b3JlZFZhbHVlID0gYXN5bmMgPFQ+KGtleTogc3RyaW5nLCB2YWx1ZTogVCk6IFByb21pc2U8dm9pZD4gPT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBba2V5XTogdmFsdWUgfSwgKCkgPT4gcmVzb2x2ZSgpKTtcbiAgfSk7XG59O1xuIiwgImltcG9ydCB7IEN1c3RvbVN0cmF0ZWd5LCBQcmVmZXJlbmNlcywgU29ydGluZ1N0cmF0ZWd5IH0gZnJvbSBcIi4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgZ2V0U3RvcmVkVmFsdWUsIHNldFN0b3JlZFZhbHVlIH0gZnJvbSBcIi4vc3RvcmFnZS5qc1wiO1xuaW1wb3J0IHsgc2V0TG9nZ2VyUHJlZmVyZW5jZXMsIGxvZ0RlYnVnIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tIFwiLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5cbmNvbnN0IFBSRUZFUkVOQ0VTX0tFWSA9IFwicHJlZmVyZW5jZXNcIjtcblxuZXhwb3J0IGNvbnN0IGRlZmF1bHRQcmVmZXJlbmNlczogUHJlZmVyZW5jZXMgPSB7XG4gIHNvcnRpbmc6IFtcInBpbm5lZFwiLCBcInJlY2VuY3lcIl0sXG4gIGRlYnVnOiBmYWxzZSxcbiAgbG9nTGV2ZWw6IFwiaW5mb1wiLFxuICB0aGVtZTogXCJkYXJrXCIsXG4gIGN1c3RvbUdlbmVyYToge31cbn07XG5cbmNvbnN0IG5vcm1hbGl6ZVNvcnRpbmcgPSAoc29ydGluZzogdW5rbm93bik6IFNvcnRpbmdTdHJhdGVneVtdID0+IHtcbiAgaWYgKEFycmF5LmlzQXJyYXkoc29ydGluZykpIHtcbiAgICByZXR1cm4gc29ydGluZy5maWx0ZXIoKHZhbHVlKTogdmFsdWUgaXMgU29ydGluZ1N0cmF0ZWd5ID0+IHR5cGVvZiB2YWx1ZSA9PT0gXCJzdHJpbmdcIik7XG4gIH1cbiAgaWYgKHR5cGVvZiBzb3J0aW5nID09PSBcInN0cmluZ1wiKSB7XG4gICAgcmV0dXJuIFtzb3J0aW5nXTtcbiAgfVxuICByZXR1cm4gWy4uLmRlZmF1bHRQcmVmZXJlbmNlcy5zb3J0aW5nXTtcbn07XG5cbmNvbnN0IG5vcm1hbGl6ZVN0cmF0ZWdpZXMgPSAoc3RyYXRlZ2llczogdW5rbm93bik6IEN1c3RvbVN0cmF0ZWd5W10gPT4ge1xuICAgIGNvbnN0IGFyciA9IGFzQXJyYXk8YW55PihzdHJhdGVnaWVzKS5maWx0ZXIocyA9PiB0eXBlb2YgcyA9PT0gJ29iamVjdCcgJiYgcyAhPT0gbnVsbCk7XG4gICAgcmV0dXJuIGFyci5tYXAocyA9PiAoe1xuICAgICAgICAuLi5zLFxuICAgICAgICBncm91cGluZ1J1bGVzOiBhc0FycmF5KHMuZ3JvdXBpbmdSdWxlcyksXG4gICAgICAgIHNvcnRpbmdSdWxlczogYXNBcnJheShzLnNvcnRpbmdSdWxlcyksXG4gICAgICAgIGdyb3VwU29ydGluZ1J1bGVzOiBzLmdyb3VwU29ydGluZ1J1bGVzID8gYXNBcnJheShzLmdyb3VwU29ydGluZ1J1bGVzKSA6IHVuZGVmaW5lZCxcbiAgICAgICAgZmlsdGVyczogcy5maWx0ZXJzID8gYXNBcnJheShzLmZpbHRlcnMpIDogdW5kZWZpbmVkLFxuICAgICAgICBmaWx0ZXJHcm91cHM6IHMuZmlsdGVyR3JvdXBzID8gYXNBcnJheShzLmZpbHRlckdyb3VwcykubWFwKChnOiBhbnkpID0+IGFzQXJyYXkoZykpIDogdW5kZWZpbmVkLFxuICAgICAgICBydWxlczogcy5ydWxlcyA/IGFzQXJyYXkocy5ydWxlcykgOiB1bmRlZmluZWRcbiAgICB9KSk7XG59O1xuXG5jb25zdCBub3JtYWxpemVQcmVmZXJlbmNlcyA9IChwcmVmcz86IFBhcnRpYWw8UHJlZmVyZW5jZXM+IHwgbnVsbCk6IFByZWZlcmVuY2VzID0+IHtcbiAgY29uc3QgbWVyZ2VkID0geyAuLi5kZWZhdWx0UHJlZmVyZW5jZXMsIC4uLihwcmVmcyA/PyB7fSkgfTtcbiAgcmV0dXJuIHtcbiAgICAuLi5tZXJnZWQsXG4gICAgc29ydGluZzogbm9ybWFsaXplU29ydGluZyhtZXJnZWQuc29ydGluZyksXG4gICAgY3VzdG9tU3RyYXRlZ2llczogbm9ybWFsaXplU3RyYXRlZ2llcyhtZXJnZWQuY3VzdG9tU3RyYXRlZ2llcylcbiAgfTtcbn07XG5cbmV4cG9ydCBjb25zdCBsb2FkUHJlZmVyZW5jZXMgPSBhc3luYyAoKTogUHJvbWlzZTxQcmVmZXJlbmNlcz4gPT4ge1xuICBjb25zdCBzdG9yZWQgPSBhd2FpdCBnZXRTdG9yZWRWYWx1ZTxQcmVmZXJlbmNlcz4oUFJFRkVSRU5DRVNfS0VZKTtcbiAgY29uc3QgbWVyZ2VkID0gbm9ybWFsaXplUHJlZmVyZW5jZXMoc3RvcmVkID8/IHVuZGVmaW5lZCk7XG4gIHNldExvZ2dlclByZWZlcmVuY2VzKG1lcmdlZCk7XG4gIHJldHVybiBtZXJnZWQ7XG59O1xuXG5leHBvcnQgY29uc3Qgc2F2ZVByZWZlcmVuY2VzID0gYXN5bmMgKHByZWZzOiBQYXJ0aWFsPFByZWZlcmVuY2VzPik6IFByb21pc2U8UHJlZmVyZW5jZXM+ID0+IHtcbiAgbG9nRGVidWcoXCJVcGRhdGluZyBwcmVmZXJlbmNlc1wiLCB7IGtleXM6IE9iamVjdC5rZXlzKHByZWZzKSB9KTtcbiAgY29uc3QgY3VycmVudCA9IGF3YWl0IGxvYWRQcmVmZXJlbmNlcygpO1xuICBjb25zdCBtZXJnZWQgPSBub3JtYWxpemVQcmVmZXJlbmNlcyh7IC4uLmN1cnJlbnQsIC4uLnByZWZzIH0pO1xuICBhd2FpdCBzZXRTdG9yZWRWYWx1ZShQUkVGRVJFTkNFU19LRVksIG1lcmdlZCk7XG4gIHNldExvZ2dlclByZWZlcmVuY2VzKG1lcmdlZCk7XG4gIHJldHVybiBtZXJnZWQ7XG59O1xuIiwgImltcG9ydCB7IFBhZ2VDb250ZXh0LCBUYWJNZXRhZGF0YSB9IGZyb20gXCIuLi8uLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IG5vcm1hbGl6ZVVybCwgcGFyc2VZb3VUdWJlVXJsLCBleHRyYWN0WW91VHViZUNoYW5uZWxGcm9tSHRtbCwgZXh0cmFjdFlvdVR1YmVHZW5yZUZyb21IdG1sIH0gZnJvbSBcIi4vbG9naWMuanNcIjtcbmltcG9ydCB7IGdldEdlbmVyYSB9IGZyb20gXCIuL2dlbmVyYVJlZ2lzdHJ5LmpzXCI7XG5pbXBvcnQgeyBsb2dEZWJ1ZyB9IGZyb20gXCIuLi8uLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBsb2FkUHJlZmVyZW5jZXMgfSBmcm9tIFwiLi4vcHJlZmVyZW5jZXMuanNcIjtcblxuaW50ZXJmYWNlIEV4dHJhY3Rpb25SZXNwb25zZSB7XG4gIGRhdGE6IFBhZ2VDb250ZXh0IHwgbnVsbDtcbiAgZXJyb3I/OiBzdHJpbmc7XG4gIHN0YXR1czpcbiAgICB8ICdPSydcbiAgICB8ICdSRVNUUklDVEVEJ1xuICAgIHwgJ0lOSkVDVElPTl9GQUlMRUQnXG4gICAgfCAnTk9fUkVTUE9OU0UnXG4gICAgfCAnTk9fSE9TVF9QRVJNSVNTSU9OJ1xuICAgIHwgJ0ZSQU1FX0FDQ0VTU19ERU5JRUQnO1xufVxuXG4vLyBTaW1wbGUgY29uY3VycmVuY3kgY29udHJvbFxubGV0IGFjdGl2ZUZldGNoZXMgPSAwO1xuY29uc3QgTUFYX0NPTkNVUlJFTlRfRkVUQ0hFUyA9IDU7IC8vIENvbnNlcnZhdGl2ZSBsaW1pdCB0byBhdm9pZCByYXRlIGxpbWl0aW5nXG5jb25zdCBGRVRDSF9RVUVVRTogKCgpID0+IHZvaWQpW10gPSBbXTtcblxuY29uc3QgZmV0Y2hXaXRoVGltZW91dCA9IGFzeW5jICh1cmw6IHN0cmluZywgdGltZW91dCA9IDIwMDApOiBQcm9taXNlPFJlc3BvbnNlPiA9PiB7XG4gICAgY29uc3QgY29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgICBjb25zdCBpZCA9IHNldFRpbWVvdXQoKCkgPT4gY29udHJvbGxlci5hYm9ydCgpLCB0aW1lb3V0KTtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHVybCwgeyBzaWduYWw6IGNvbnRyb2xsZXIuc2lnbmFsIH0pO1xuICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KGlkKTtcbiAgICB9XG59O1xuXG5jb25zdCBlbnF1ZXVlRmV0Y2ggPSBhc3luYyA8VD4oZm46ICgpID0+IFByb21pc2U8VD4pOiBQcm9taXNlPFQ+ID0+IHtcbiAgICBpZiAoYWN0aXZlRmV0Y2hlcyA+PSBNQVhfQ09OQ1VSUkVOVF9GRVRDSEVTKSB7XG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gRkVUQ0hfUVVFVUUucHVzaChyZXNvbHZlKSk7XG4gICAgfVxuICAgIGFjdGl2ZUZldGNoZXMrKztcbiAgICB0cnkge1xuICAgICAgICByZXR1cm4gYXdhaXQgZm4oKTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgICBhY3RpdmVGZXRjaGVzLS07XG4gICAgICAgIGlmIChGRVRDSF9RVUVVRS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb25zdCBuZXh0ID0gRkVUQ0hfUVVFVUUuc2hpZnQoKTtcbiAgICAgICAgICAgIGlmIChuZXh0KSBuZXh0KCk7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5leHBvcnQgY29uc3QgZXh0cmFjdFBhZ2VDb250ZXh0ID0gYXN5bmMgKHRhYjogVGFiTWV0YWRhdGEgfCBjaHJvbWUudGFicy5UYWIpOiBQcm9taXNlPEV4dHJhY3Rpb25SZXNwb25zZT4gPT4ge1xuICB0cnkge1xuICAgIGlmICghdGFiIHx8ICF0YWIudXJsKSB7XG4gICAgICAgIHJldHVybiB7IGRhdGE6IG51bGwsIGVycm9yOiBcIlRhYiBub3QgZm91bmQgb3Igbm8gVVJMXCIsIHN0YXR1czogJ05PX1JFU1BPTlNFJyB9O1xuICAgIH1cblxuICAgIGlmIChcbiAgICAgIHRhYi51cmwuc3RhcnRzV2l0aCgnY2hyb21lOi8vJykgfHxcbiAgICAgIHRhYi51cmwuc3RhcnRzV2l0aCgnZWRnZTovLycpIHx8XG4gICAgICB0YWIudXJsLnN0YXJ0c1dpdGgoJ2Fib3V0OicpIHx8XG4gICAgICB0YWIudXJsLnN0YXJ0c1dpdGgoJ2Nocm9tZS1leHRlbnNpb246Ly8nKSB8fFxuICAgICAgdGFiLnVybC5zdGFydHNXaXRoKCdjaHJvbWUtZXJyb3I6Ly8nKVxuICAgICkge1xuICAgICAgICByZXR1cm4geyBkYXRhOiBudWxsLCBlcnJvcjogXCJSZXN0cmljdGVkIFVSTCBzY2hlbWVcIiwgc3RhdHVzOiAnUkVTVFJJQ1RFRCcgfTtcbiAgICB9XG5cbiAgICBjb25zdCBwcmVmcyA9IGF3YWl0IGxvYWRQcmVmZXJlbmNlcygpO1xuICAgIGxldCBiYXNlbGluZSA9IGJ1aWxkQmFzZWxpbmVDb250ZXh0KHRhYiBhcyBjaHJvbWUudGFicy5UYWIsIHByZWZzLmN1c3RvbUdlbmVyYSk7XG5cbiAgICAvLyBGZXRjaCBhbmQgZW5yaWNoIGZvciBZb3VUdWJlIGlmIGF1dGhvciBpcyBtaXNzaW5nIGFuZCBpdCBpcyBhIHZpZGVvXG4gICAgY29uc3QgdGFyZ2V0VXJsID0gdGFiLnVybDtcbiAgICBjb25zdCB1cmxPYmogPSBuZXcgVVJMKHRhcmdldFVybCk7XG4gICAgY29uc3QgaG9zdG5hbWUgPSB1cmxPYmouaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sICcnKTtcbiAgICBpZiAoKGhvc3RuYW1lLmVuZHNXaXRoKCd5b3V0dWJlLmNvbScpIHx8IGhvc3RuYW1lLmVuZHNXaXRoKCd5b3V0dS5iZScpKSAmJiAoIWJhc2VsaW5lLmF1dGhvck9yQ3JlYXRvciB8fCBiYXNlbGluZS5nZW5yZSA9PT0gJ1ZpZGVvJykpIHtcbiAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgLy8gV2UgdXNlIGEgcXVldWUgdG8gcHJldmVudCBmbG9vZGluZyByZXF1ZXN0c1xuICAgICAgICAgICAgIGF3YWl0IGVucXVldWVGZXRjaChhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2hXaXRoVGltZW91dCh0YXJnZXRVcmwpO1xuICAgICAgICAgICAgICAgICBpZiAocmVzcG9uc2Uub2spIHtcbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGh0bWwgPSBhd2FpdCByZXNwb25zZS50ZXh0KCk7XG4gICAgICAgICAgICAgICAgICAgICBjb25zdCBjaGFubmVsID0gZXh0cmFjdFlvdVR1YmVDaGFubmVsRnJvbUh0bWwoaHRtbCk7XG4gICAgICAgICAgICAgICAgICAgICBpZiAoY2hhbm5lbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgIGJhc2VsaW5lLmF1dGhvck9yQ3JlYXRvciA9IGNoYW5uZWw7XG4gICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICBjb25zdCBnZW5yZSA9IGV4dHJhY3RZb3VUdWJlR2VucmVGcm9tSHRtbChodG1sKTtcbiAgICAgICAgICAgICAgICAgICAgIGlmIChnZW5yZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgIGJhc2VsaW5lLmdlbnJlID0gZ2VucmU7XG4gICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9KTtcbiAgICAgICAgIH0gY2F0Y2ggKGZldGNoRXJyKSB7XG4gICAgICAgICAgICAgbG9nRGVidWcoXCJGYWlsZWQgdG8gZmV0Y2ggWW91VHViZSBwYWdlIGNvbnRlbnRcIiwgeyBlcnJvcjogU3RyaW5nKGZldGNoRXJyKSB9KTtcbiAgICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgZGF0YTogYmFzZWxpbmUsXG4gICAgICBzdGF0dXM6ICdPSydcbiAgICB9O1xuXG4gIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgIGxvZ0RlYnVnKGBFeHRyYWN0aW9uIGZhaWxlZCBmb3IgdGFiICR7dGFiLmlkfWAsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICByZXR1cm4ge1xuICAgICAgZGF0YTogbnVsbCxcbiAgICAgIGVycm9yOiBTdHJpbmcoZSksXG4gICAgICBzdGF0dXM6ICdJTkpFQ1RJT05fRkFJTEVEJ1xuICAgIH07XG4gIH1cbn07XG5cbmNvbnN0IGJ1aWxkQmFzZWxpbmVDb250ZXh0ID0gKHRhYjogY2hyb21lLnRhYnMuVGFiLCBjdXN0b21HZW5lcmE/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogUGFnZUNvbnRleHQgPT4ge1xuICBjb25zdCB1cmwgPSB0YWIudXJsIHx8IFwiXCI7XG4gIGxldCBob3N0bmFtZSA9IFwiXCI7XG4gIHRyeSB7XG4gICAgaG9zdG5hbWUgPSBuZXcgVVJMKHVybCkuaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sICcnKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGhvc3RuYW1lID0gXCJcIjtcbiAgfVxuXG4gIC8vIERldGVybWluZSBPYmplY3QgVHlwZSBmaXJzdFxuICBsZXQgb2JqZWN0VHlwZTogUGFnZUNvbnRleHRbJ29iamVjdFR5cGUnXSA9ICd1bmtub3duJztcbiAgbGV0IGF1dGhvck9yQ3JlYXRvcjogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cbiAgaWYgKHVybC5pbmNsdWRlcygnL2xvZ2luJykgfHwgdXJsLmluY2x1ZGVzKCcvc2lnbmluJykpIHtcbiAgICAgIG9iamVjdFR5cGUgPSAnbG9naW4nO1xuICB9IGVsc2UgaWYgKGhvc3RuYW1lLmluY2x1ZGVzKCd5b3V0dWJlLmNvbScpIHx8IGhvc3RuYW1lLmluY2x1ZGVzKCd5b3V0dS5iZScpKSB7XG4gICAgICBjb25zdCB7IHZpZGVvSWQgfSA9IHBhcnNlWW91VHViZVVybCh1cmwpO1xuICAgICAgaWYgKHZpZGVvSWQpIG9iamVjdFR5cGUgPSAndmlkZW8nO1xuXG4gICAgICAvLyBUcnkgdG8gZ3Vlc3MgY2hhbm5lbCBmcm9tIFVSTCBpZiBwb3NzaWJsZVxuICAgICAgaWYgKHVybC5pbmNsdWRlcygnL0AnKSkge1xuICAgICAgICAgIGNvbnN0IHBhcnRzID0gdXJsLnNwbGl0KCcvQCcpO1xuICAgICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGhhbmRsZSA9IHBhcnRzWzFdLnNwbGl0KCcvJylbMF07XG4gICAgICAgICAgICAgIGF1dGhvck9yQ3JlYXRvciA9ICdAJyArIGhhbmRsZTtcbiAgICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHVybC5pbmNsdWRlcygnL2MvJykpIHtcbiAgICAgICAgICBjb25zdCBwYXJ0cyA9IHVybC5zcGxpdCgnL2MvJyk7XG4gICAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgYXV0aG9yT3JDcmVhdG9yID0gZGVjb2RlVVJJQ29tcG9uZW50KHBhcnRzWzFdLnNwbGl0KCcvJylbMF0pO1xuICAgICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAodXJsLmluY2x1ZGVzKCcvdXNlci8nKSkge1xuICAgICAgICAgIGNvbnN0IHBhcnRzID0gdXJsLnNwbGl0KCcvdXNlci8nKTtcbiAgICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICBhdXRob3JPckNyZWF0b3IgPSBkZWNvZGVVUklDb21wb25lbnQocGFydHNbMV0uc3BsaXQoJy8nKVswXSk7XG4gICAgICAgICAgfVxuICAgICAgfVxuICB9IGVsc2UgaWYgKGhvc3RuYW1lID09PSAnZ2l0aHViLmNvbScgJiYgdXJsLmluY2x1ZGVzKCcvcHVsbC8nKSkge1xuICAgICAgb2JqZWN0VHlwZSA9ICd0aWNrZXQnO1xuICB9IGVsc2UgaWYgKGhvc3RuYW1lID09PSAnZ2l0aHViLmNvbScgJiYgIXVybC5pbmNsdWRlcygnL3B1bGwvJykgJiYgdXJsLnNwbGl0KCcvJykubGVuZ3RoID49IDUpIHtcbiAgICAgIC8vIHJvdWdoIGNoZWNrIGZvciByZXBvXG4gICAgICBvYmplY3RUeXBlID0gJ3JlcG8nO1xuICB9XG5cbiAgLy8gRGV0ZXJtaW5lIEdlbnJlXG4gIC8vIFByaW9yaXR5IDE6IFNpdGUtc3BlY2lmaWMgZXh0cmFjdGlvbiAoZGVyaXZlZCBmcm9tIG9iamVjdFR5cGUpXG4gIGxldCBnZW5yZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG4gIGlmIChvYmplY3RUeXBlID09PSAndmlkZW8nKSBnZW5yZSA9ICdWaWRlbyc7XG4gIGVsc2UgaWYgKG9iamVjdFR5cGUgPT09ICdyZXBvJyB8fCBvYmplY3RUeXBlID09PSAndGlja2V0JykgZ2VucmUgPSAnRGV2ZWxvcG1lbnQnO1xuXG4gIC8vIFByaW9yaXR5IDI6IEZhbGxiYWNrIHRvIFJlZ2lzdHJ5XG4gIGlmICghZ2VucmUpIHtcbiAgICAgZ2VucmUgPSBnZXRHZW5lcmEoaG9zdG5hbWUsIGN1c3RvbUdlbmVyYSkgfHwgdW5kZWZpbmVkO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjYW5vbmljYWxVcmw6IHVybCB8fCBudWxsLFxuICAgIG5vcm1hbGl6ZWRVcmw6IG5vcm1hbGl6ZVVybCh1cmwpLFxuICAgIHNpdGVOYW1lOiBob3N0bmFtZSB8fCBudWxsLFxuICAgIHBsYXRmb3JtOiBob3N0bmFtZSB8fCBudWxsLFxuICAgIG9iamVjdFR5cGUsXG4gICAgb2JqZWN0SWQ6IHVybCB8fCBudWxsLFxuICAgIHRpdGxlOiB0YWIudGl0bGUgfHwgbnVsbCxcbiAgICBnZW5yZSxcbiAgICBkZXNjcmlwdGlvbjogbnVsbCxcbiAgICBhdXRob3JPckNyZWF0b3I6IGF1dGhvck9yQ3JlYXRvcixcbiAgICBwdWJsaXNoZWRBdDogbnVsbCxcbiAgICBtb2RpZmllZEF0OiBudWxsLFxuICAgIGxhbmd1YWdlOiBudWxsLFxuICAgIHRhZ3M6IFtdLFxuICAgIGJyZWFkY3J1bWJzOiBbXSxcbiAgICBpc0F1ZGlibGU6IGZhbHNlLFxuICAgIGlzTXV0ZWQ6IGZhbHNlLFxuICAgIGlzQ2FwdHVyaW5nOiBmYWxzZSxcbiAgICBwcm9ncmVzczogbnVsbCxcbiAgICBoYXNVbnNhdmVkQ2hhbmdlc0xpa2VseTogZmFsc2UsXG4gICAgaXNBdXRoZW50aWNhdGVkTGlrZWx5OiBmYWxzZSxcbiAgICBzb3VyY2VzOiB7XG4gICAgICBjYW5vbmljYWxVcmw6ICd1cmwnLFxuICAgICAgbm9ybWFsaXplZFVybDogJ3VybCcsXG4gICAgICBzaXRlTmFtZTogJ3VybCcsXG4gICAgICBwbGF0Zm9ybTogJ3VybCcsXG4gICAgICBvYmplY3RUeXBlOiAndXJsJyxcbiAgICAgIHRpdGxlOiB0YWIudGl0bGUgPyAndGFiJyA6ICd1cmwnLFxuICAgICAgZ2VucmU6ICdyZWdpc3RyeSdcbiAgICB9LFxuICAgIGNvbmZpZGVuY2U6IHt9XG4gIH07XG59O1xuIiwgImV4cG9ydCB0eXBlIENhdGVnb3J5UnVsZSA9IHN0cmluZyB8IHN0cmluZ1tdO1xuXG5leHBvcnQgaW50ZXJmYWNlIENhdGVnb3J5RGVmaW5pdGlvbiB7XG4gIGNhdGVnb3J5OiBzdHJpbmc7XG4gIHJ1bGVzOiBDYXRlZ29yeVJ1bGVbXTtcbn1cblxuZXhwb3J0IGNvbnN0IENBVEVHT1JZX0RFRklOSVRJT05TOiBDYXRlZ29yeURlZmluaXRpb25bXSA9IFtcbiAge1xuICAgIGNhdGVnb3J5OiBcIkRldmVsb3BtZW50XCIsXG4gICAgcnVsZXM6IFtcImdpdGh1YlwiLCBcInN0YWNrb3ZlcmZsb3dcIiwgXCJsb2NhbGhvc3RcIiwgXCJqaXJhXCIsIFwiZ2l0bGFiXCJdXG4gIH0sXG4gIHtcbiAgICBjYXRlZ29yeTogXCJXb3JrXCIsXG4gICAgcnVsZXM6IFtcbiAgICAgIFtcImdvb2dsZVwiLCBcImRvY3NcIl0sIFtcImdvb2dsZVwiLCBcInNoZWV0c1wiXSwgW1wiZ29vZ2xlXCIsIFwic2xpZGVzXCJdLFxuICAgICAgXCJsaW5rZWRpblwiLCBcInNsYWNrXCIsIFwiem9vbVwiLCBcInRlYW1zXCJcbiAgICBdXG4gIH0sXG4gIHtcbiAgICBjYXRlZ29yeTogXCJFbnRlcnRhaW5tZW50XCIsXG4gICAgcnVsZXM6IFtcIm5ldGZsaXhcIiwgXCJzcG90aWZ5XCIsIFwiaHVsdVwiLCBcImRpc25leVwiLCBcInlvdXR1YmVcIl1cbiAgfSxcbiAge1xuICAgIGNhdGVnb3J5OiBcIlNvY2lhbFwiLFxuICAgIHJ1bGVzOiBbXCJ0d2l0dGVyXCIsIFwiZmFjZWJvb2tcIiwgXCJpbnN0YWdyYW1cIiwgXCJyZWRkaXRcIiwgXCJ0aWt0b2tcIiwgXCJwaW50ZXJlc3RcIl1cbiAgfSxcbiAge1xuICAgIGNhdGVnb3J5OiBcIlNob3BwaW5nXCIsXG4gICAgcnVsZXM6IFtcImFtYXpvblwiLCBcImViYXlcIiwgXCJ3YWxtYXJ0XCIsIFwidGFyZ2V0XCIsIFwic2hvcGlmeVwiXVxuICB9LFxuICB7XG4gICAgY2F0ZWdvcnk6IFwiTmV3c1wiLFxuICAgIHJ1bGVzOiBbXCJjbm5cIiwgXCJiYmNcIiwgXCJueXRpbWVzXCIsIFwid2FzaGluZ3RvbnBvc3RcIiwgXCJmb3huZXdzXCJdXG4gIH0sXG4gIHtcbiAgICBjYXRlZ29yeTogXCJFZHVjYXRpb25cIixcbiAgICBydWxlczogW1wiY291cnNlcmFcIiwgXCJ1ZGVteVwiLCBcImVkeFwiLCBcImtoYW5hY2FkZW15XCIsIFwiY2FudmFzXCJdXG4gIH0sXG4gIHtcbiAgICBjYXRlZ29yeTogXCJUcmF2ZWxcIixcbiAgICBydWxlczogW1wiZXhwZWRpYVwiLCBcImJvb2tpbmdcIiwgXCJhaXJibmJcIiwgXCJ0cmlwYWR2aXNvclwiLCBcImtheWFrXCJdXG4gIH0sXG4gIHtcbiAgICBjYXRlZ29yeTogXCJIZWFsdGhcIixcbiAgICBydWxlczogW1wid2VibWRcIiwgXCJtYXlvY2xpbmljXCIsIFwibmloLmdvdlwiLCBcImhlYWx0aFwiXVxuICB9LFxuICB7XG4gICAgY2F0ZWdvcnk6IFwiU3BvcnRzXCIsXG4gICAgcnVsZXM6IFtcImVzcG5cIiwgXCJuYmFcIiwgXCJuZmxcIiwgXCJtbGJcIiwgXCJmaWZhXCJdXG4gIH0sXG4gIHtcbiAgICBjYXRlZ29yeTogXCJUZWNobm9sb2d5XCIsXG4gICAgcnVsZXM6IFtcInRlY2hjcnVuY2hcIiwgXCJ3aXJlZFwiLCBcInRoZXZlcmdlXCIsIFwiYXJzdGVjaG5pY2FcIl1cbiAgfSxcbiAge1xuICAgIGNhdGVnb3J5OiBcIlNjaWVuY2VcIixcbiAgICBydWxlczogW1wic2NpZW5jZVwiLCBcIm5hdHVyZS5jb21cIiwgXCJuYXNhLmdvdlwiXVxuICB9LFxuICB7XG4gICAgY2F0ZWdvcnk6IFwiR2FtaW5nXCIsXG4gICAgcnVsZXM6IFtcInR3aXRjaFwiLCBcInN0ZWFtXCIsIFwicm9ibG94XCIsIFwiaWduXCIsIFwiZ2FtZXNwb3RcIl1cbiAgfSxcbiAge1xuICAgIGNhdGVnb3J5OiBcIk11c2ljXCIsXG4gICAgcnVsZXM6IFtcInNvdW5kY2xvdWRcIiwgXCJiYW5kY2FtcFwiLCBcImxhc3QuZm1cIl1cbiAgfSxcbiAge1xuICAgIGNhdGVnb3J5OiBcIkFydFwiLFxuICAgIHJ1bGVzOiBbXCJkZXZpYW50YXJ0XCIsIFwiYmVoYW5jZVwiLCBcImRyaWJiYmxlXCIsIFwiYXJ0c3RhdGlvblwiXVxuICB9XG5dO1xuXG5leHBvcnQgY29uc3QgZ2V0Q2F0ZWdvcnlGcm9tVXJsID0gKHVybDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgY29uc3QgbG93ZXJVcmwgPSB1cmwudG9Mb3dlckNhc2UoKTtcbiAgZm9yIChjb25zdCBkZWYgb2YgQ0FURUdPUllfREVGSU5JVElPTlMpIHtcbiAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZGVmLnJ1bGVzKSB7XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShydWxlKSkge1xuICAgICAgICBpZiAocnVsZS5ldmVyeShwYXJ0ID0+IGxvd2VyVXJsLmluY2x1ZGVzKHBhcnQpKSkge1xuICAgICAgICAgIHJldHVybiBkZWYuY2F0ZWdvcnk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChsb3dlclVybC5pbmNsdWRlcyhydWxlKSkge1xuICAgICAgICAgIHJldHVybiBkZWYuY2F0ZWdvcnk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIFwiVW5jYXRlZ29yaXplZFwiO1xufTtcbiIsICJpbXBvcnQgeyBQYWdlQ29udGV4dCB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcblxuZXhwb3J0IGludGVyZmFjZSBDYXRlZ29yaXphdGlvblJ1bGUge1xuICBpZDogc3RyaW5nO1xuICBjb25kaXRpb246IChjb250ZXh0OiBQYWdlQ29udGV4dCkgPT4gYm9vbGVhbjtcbiAgY2F0ZWdvcnk6IHN0cmluZztcbn1cblxuZXhwb3J0IGNvbnN0IENBVEVHT1JJWkFUSU9OX1JVTEVTOiBDYXRlZ29yaXphdGlvblJ1bGVbXSA9IFtcbiAge1xuICAgIGlkOiBcImVudGVydGFpbm1lbnQtcGxhdGZvcm1zXCIsXG4gICAgY29uZGl0aW9uOiAoZGF0YSkgPT4gWydZb3VUdWJlJywgJ05ldGZsaXgnLCAnU3BvdGlmeScsICdUd2l0Y2gnXS5pbmNsdWRlcyhkYXRhLnBsYXRmb3JtIHx8ICcnKSxcbiAgICBjYXRlZ29yeTogXCJFbnRlcnRhaW5tZW50XCJcbiAgfSxcbiAge1xuICAgIGlkOiBcImRldmVsb3BtZW50LXBsYXRmb3Jtc1wiLFxuICAgIGNvbmRpdGlvbjogKGRhdGEpID0+IFsnR2l0SHViJywgJ1N0YWNrIE92ZXJmbG93JywgJ0ppcmEnLCAnR2l0TGFiJ10uaW5jbHVkZXMoZGF0YS5wbGF0Zm9ybSB8fCAnJyksXG4gICAgY2F0ZWdvcnk6IFwiRGV2ZWxvcG1lbnRcIlxuICB9LFxuICB7XG4gICAgaWQ6IFwiZ29vZ2xlLXdvcmstc3VpdGVcIixcbiAgICBjb25kaXRpb246IChkYXRhKSA9PiBkYXRhLnBsYXRmb3JtID09PSAnR29vZ2xlJyAmJiBbJ2RvY3MnLCAnc2hlZXRzJywgJ3NsaWRlcyddLnNvbWUoayA9PiBkYXRhLm5vcm1hbGl6ZWRVcmwuaW5jbHVkZXMoaykpLFxuICAgIGNhdGVnb3J5OiBcIldvcmtcIlxuICB9XG5dO1xuXG5leHBvcnQgZnVuY3Rpb24gZGV0ZXJtaW5lQ2F0ZWdvcnlGcm9tQ29udGV4dChkYXRhOiBQYWdlQ29udGV4dCk6IHN0cmluZyB7XG4gIC8vIDEuIENoZWNrIGV4cGxpY2l0IHJ1bGVzXG4gIGZvciAoY29uc3QgcnVsZSBvZiBDQVRFR09SSVpBVElPTl9SVUxFUykge1xuICAgIGlmIChydWxlLmNvbmRpdGlvbihkYXRhKSkge1xuICAgICAgcmV0dXJuIHJ1bGUuY2F0ZWdvcnk7XG4gICAgfVxuICB9XG5cbiAgLy8gMi4gRmFsbGJhY2sgdG8gT2JqZWN0IFR5cGUgbWFwcGluZ1xuICBpZiAoZGF0YS5vYmplY3RUeXBlICYmIGRhdGEub2JqZWN0VHlwZSAhPT0gJ3Vua25vd24nKSB7XG4gICAgaWYgKGRhdGEub2JqZWN0VHlwZSA9PT0gJ3ZpZGVvJykgcmV0dXJuICdFbnRlcnRhaW5tZW50JztcbiAgICBpZiAoZGF0YS5vYmplY3RUeXBlID09PSAnYXJ0aWNsZScpIHJldHVybiAnTmV3cyc7XG4gICAgLy8gQ2FwaXRhbGl6ZSBmaXJzdCBsZXR0ZXIgZm9yIG90aGVyIHR5cGVzXG4gICAgcmV0dXJuIGRhdGEub2JqZWN0VHlwZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGRhdGEub2JqZWN0VHlwZS5zbGljZSgxKTtcbiAgfVxuXG4gIC8vIDMuIERlZmF1bHQgZmFsbGJhY2tcbiAgcmV0dXJuIFwiR2VuZXJhbCBXZWJcIjtcbn1cbiIsICJpbXBvcnQgeyBUYWJNZXRhZGF0YSwgUGFnZUNvbnRleHQgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBsb2dEZWJ1ZywgbG9nRXJyb3IgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgZXh0cmFjdFBhZ2VDb250ZXh0IH0gZnJvbSBcIi4vZXh0cmFjdGlvbi9pbmRleC5qc1wiO1xuaW1wb3J0IHsgZ2V0Q2F0ZWdvcnlGcm9tVXJsIH0gZnJvbSBcIi4vY2F0ZWdvcnlSdWxlcy5qc1wiO1xuaW1wb3J0IHsgZGV0ZXJtaW5lQ2F0ZWdvcnlGcm9tQ29udGV4dCB9IGZyb20gXCIuL2NhdGVnb3JpemF0aW9uUnVsZXMuanNcIjtcblxuZXhwb3J0IGludGVyZmFjZSBDb250ZXh0UmVzdWx0IHtcbiAgY29udGV4dDogc3RyaW5nO1xuICBzb3VyY2U6ICdBSScgfCAnSGV1cmlzdGljJyB8ICdFeHRyYWN0aW9uJztcbiAgZGF0YT86IFBhZ2VDb250ZXh0O1xuICBlcnJvcj86IHN0cmluZztcbiAgc3RhdHVzPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgQ2FjaGVFbnRyeSB7XG4gIHJlc3VsdDogQ29udGV4dFJlc3VsdDtcbiAgdGltZXN0YW1wOiBudW1iZXI7XG4gIC8vIFdlIHVzZSB0aGlzIHRvIGRlY2lkZSB3aGVuIHRvIGludmFsaWRhdGUgY2FjaGVcbn1cblxuY29uc3QgY29udGV4dENhY2hlID0gbmV3IE1hcDxzdHJpbmcsIENhY2hlRW50cnk+KCk7XG5jb25zdCBDQUNIRV9UVExfU1VDQ0VTUyA9IDI0ICogNjAgKiA2MCAqIDEwMDA7IC8vIDI0IGhvdXJzXG5jb25zdCBDQUNIRV9UVExfRVJST1IgPSA1ICogNjAgKiAxMDAwOyAvLyA1IG1pbnV0ZXNcblxuZXhwb3J0IGNvbnN0IGFuYWx5emVUYWJDb250ZXh0ID0gYXN5bmMgKFxuICB0YWJzOiBUYWJNZXRhZGF0YVtdLFxuICBvblByb2dyZXNzPzogKGNvbXBsZXRlZDogbnVtYmVyLCB0b3RhbDogbnVtYmVyKSA9PiB2b2lkXG4pOiBQcm9taXNlPE1hcDxudW1iZXIsIENvbnRleHRSZXN1bHQ+PiA9PiB7XG4gIGNvbnN0IGNvbnRleHRNYXAgPSBuZXcgTWFwPG51bWJlciwgQ29udGV4dFJlc3VsdD4oKTtcbiAgbGV0IGNvbXBsZXRlZCA9IDA7XG4gIGNvbnN0IHRvdGFsID0gdGFicy5sZW5ndGg7XG5cbiAgY29uc3QgcHJvbWlzZXMgPSB0YWJzLm1hcChhc3luYyAodGFiKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGNhY2hlS2V5ID0gYCR7dGFiLmlkfTo6JHt0YWIudXJsfWA7XG4gICAgICBjb25zdCBjYWNoZWQgPSBjb250ZXh0Q2FjaGUuZ2V0KGNhY2hlS2V5KTtcblxuICAgICAgaWYgKGNhY2hlZCkge1xuICAgICAgICBjb25zdCBpc0Vycm9yID0gY2FjaGVkLnJlc3VsdC5zdGF0dXMgPT09ICdFUlJPUicgfHwgISFjYWNoZWQucmVzdWx0LmVycm9yO1xuICAgICAgICBjb25zdCB0dGwgPSBpc0Vycm9yID8gQ0FDSEVfVFRMX0VSUk9SIDogQ0FDSEVfVFRMX1NVQ0NFU1M7XG5cbiAgICAgICAgaWYgKERhdGUubm93KCkgLSBjYWNoZWQudGltZXN0YW1wIDwgdHRsKSB7XG4gICAgICAgICAgY29udGV4dE1hcC5zZXQodGFiLmlkLCBjYWNoZWQucmVzdWx0KTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29udGV4dENhY2hlLmRlbGV0ZShjYWNoZUtleSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZmV0Y2hDb250ZXh0Rm9yVGFiKHRhYik7XG5cbiAgICAgIC8vIENhY2hlIHdpdGggZXhwaXJhdGlvbiBsb2dpY1xuICAgICAgY29udGV4dENhY2hlLnNldChjYWNoZUtleSwge1xuICAgICAgICByZXN1bHQsXG4gICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKVxuICAgICAgfSk7XG5cbiAgICAgIGNvbnRleHRNYXAuc2V0KHRhYi5pZCwgcmVzdWx0KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nRXJyb3IoYEZhaWxlZCB0byBhbmFseXplIGNvbnRleHQgZm9yIHRhYiAke3RhYi5pZH1gLCB7IGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICAgICAgLy8gRXZlbiBpZiBmZXRjaENvbnRleHRGb3JUYWIgZmFpbHMgY29tcGxldGVseSwgd2UgdHJ5IGEgc2FmZSBzeW5jIGZhbGxiYWNrXG4gICAgICBjb250ZXh0TWFwLnNldCh0YWIuaWQsIHsgY29udGV4dDogXCJVbmNhdGVnb3JpemVkXCIsIHNvdXJjZTogJ0hldXJpc3RpYycsIGVycm9yOiBTdHJpbmcoZXJyb3IpLCBzdGF0dXM6ICdFUlJPUicgfSk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGNvbXBsZXRlZCsrO1xuICAgICAgaWYgKG9uUHJvZ3Jlc3MpIG9uUHJvZ3Jlc3MoY29tcGxldGVkLCB0b3RhbCk7XG4gICAgfVxuICB9KTtcblxuICBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gIHJldHVybiBjb250ZXh0TWFwO1xufTtcblxuY29uc3QgZmV0Y2hDb250ZXh0Rm9yVGFiID0gYXN5bmMgKHRhYjogVGFiTWV0YWRhdGEpOiBQcm9taXNlPENvbnRleHRSZXN1bHQ+ID0+IHtcbiAgLy8gMS4gUnVuIEdlbmVyaWMgRXh0cmFjdGlvbiAoQWx3YXlzKVxuICBsZXQgZGF0YTogUGFnZUNvbnRleHQgfCBudWxsID0gbnVsbDtcbiAgbGV0IGVycm9yOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gIGxldCBzdGF0dXM6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICB0cnkge1xuICAgICAgY29uc3QgZXh0cmFjdGlvbiA9IGF3YWl0IGV4dHJhY3RQYWdlQ29udGV4dCh0YWIpO1xuICAgICAgZGF0YSA9IGV4dHJhY3Rpb24uZGF0YTtcbiAgICAgIGVycm9yID0gZXh0cmFjdGlvbi5lcnJvcjtcbiAgICAgIHN0YXR1cyA9IGV4dHJhY3Rpb24uc3RhdHVzO1xuICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2dEZWJ1ZyhgRXh0cmFjdGlvbiBmYWlsZWQgZm9yIHRhYiAke3RhYi5pZH1gLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICBlcnJvciA9IFN0cmluZyhlKTtcbiAgICAgIHN0YXR1cyA9ICdFUlJPUic7XG4gIH1cblxuICBsZXQgY29udGV4dCA9IFwiVW5jYXRlZ29yaXplZFwiO1xuICBsZXQgc291cmNlOiBDb250ZXh0UmVzdWx0Wydzb3VyY2UnXSA9ICdIZXVyaXN0aWMnO1xuXG4gIC8vIDIuIFRyeSB0byBEZXRlcm1pbmUgQ2F0ZWdvcnkgZnJvbSBFeHRyYWN0aW9uIERhdGFcbiAgaWYgKGRhdGEpIHtcbiAgICBjb250ZXh0ID0gZGV0ZXJtaW5lQ2F0ZWdvcnlGcm9tQ29udGV4dChkYXRhKTtcbiAgICBzb3VyY2UgPSAnRXh0cmFjdGlvbic7XG4gIH1cblxuICAvLyAzLiBGYWxsYmFjayB0byBMb2NhbCBIZXVyaXN0aWMgKFVSTCBSZWdleClcbiAgaWYgKGNvbnRleHQgPT09IFwiVW5jYXRlZ29yaXplZFwiKSB7XG4gICAgICBjb25zdCBoID0gYXdhaXQgbG9jYWxIZXVyaXN0aWModGFiKTtcbiAgICAgIGlmIChoLmNvbnRleHQgIT09IFwiVW5jYXRlZ29yaXplZFwiKSB7XG4gICAgICAgICAgY29udGV4dCA9IGguY29udGV4dDtcbiAgICAgICAgICAvLyBzb3VyY2UgcmVtYWlucyAnSGV1cmlzdGljJyAob3IgbWF5YmUgd2Ugc2hvdWxkIHNheSAnSGV1cmlzdGljJyBpcyB0aGUgc291cmNlPylcbiAgICAgICAgICAvLyBUaGUgbG9jYWxIZXVyaXN0aWMgZnVuY3Rpb24gcmV0dXJucyB7IHNvdXJjZTogJ0hldXJpc3RpYycgfVxuICAgICAgfVxuICB9XG5cbiAgLy8gNC4gRmFsbGJhY2sgdG8gQUkgKExMTSkgLSBSRU1PVkVEXG4gIC8vIFRoZSBIdWdnaW5nRmFjZSBBUEkgZW5kcG9pbnQgaXMgNDEwIEdvbmUgYW5kL29yIHJlcXVpcmVzIGF1dGhlbnRpY2F0aW9uIHdoaWNoIHdlIGRvIG5vdCBoYXZlLlxuICAvLyBUaGUgY29kZSBoYXMgYmVlbiByZW1vdmVkIHRvIHByZXZlbnQgZXJyb3JzLlxuXG4gIGlmIChjb250ZXh0ICE9PSBcIlVuY2F0ZWdvcml6ZWRcIiAmJiBzb3VyY2UgIT09IFwiRXh0cmFjdGlvblwiKSB7XG4gICAgZXJyb3IgPSB1bmRlZmluZWQ7XG4gICAgc3RhdHVzID0gdW5kZWZpbmVkO1xuICB9XG5cbiAgcmV0dXJuIHsgY29udGV4dCwgc291cmNlLCBkYXRhOiBkYXRhIHx8IHVuZGVmaW5lZCwgZXJyb3IsIHN0YXR1cyB9O1xufTtcblxuY29uc3QgbG9jYWxIZXVyaXN0aWMgPSBhc3luYyAodGFiOiBUYWJNZXRhZGF0YSk6IFByb21pc2U8Q29udGV4dFJlc3VsdD4gPT4ge1xuICBjb25zdCBjb250ZXh0ID0gZ2V0Q2F0ZWdvcnlGcm9tVXJsKHRhYi51cmwpO1xuICByZXR1cm4geyBjb250ZXh0LCBzb3VyY2U6ICdIZXVyaXN0aWMnIH07XG59O1xuIiwgImltcG9ydCB7IGFwcFN0YXRlLCBDb2x1bW5EZWZpbml0aW9uIH0gZnJvbSBcIi4vc3RhdGUuanNcIjtcbmltcG9ydCB7IGdldFNvcnRWYWx1ZSwgZ2V0Q2VsbFZhbHVlLCBnZXRNYXBwZWRUYWJzLCBzdHJpcEh0bWwgfSBmcm9tIFwiLi9kYXRhLmpzXCI7XG5pbXBvcnQgeyBhbmFseXplVGFiQ29udGV4dCB9IGZyb20gXCIuLi8uLi9iYWNrZ3JvdW5kL2NvbnRleHRBbmFseXNpcy5qc1wiO1xuaW1wb3J0IHsgbG9nSW5mbyB9IGZyb20gXCIuLi8uLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBlc2NhcGVIdG1sIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC91dGlscy5qc1wiO1xuaW1wb3J0IHsgVGFiTWV0YWRhdGEgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBsb2FkVGFicygpIHtcbiAgbG9nSW5mbyhcIkxvYWRpbmcgdGFicyBmb3IgRGV2VG9vbHNcIik7XG4gIGNvbnN0IHRhYnMgPSBhd2FpdCBjaHJvbWUudGFicy5xdWVyeSh7fSk7XG4gIGFwcFN0YXRlLmN1cnJlbnRUYWJzID0gdGFicztcblxuICBjb25zdCB0b3RhbFRhYnNFbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd0b3RhbFRhYnMnKTtcbiAgaWYgKHRvdGFsVGFic0VsKSB7XG4gICAgdG90YWxUYWJzRWwudGV4dENvbnRlbnQgPSB0YWJzLmxlbmd0aC50b1N0cmluZygpO1xuICB9XG5cbiAgLy8gQ3JlYXRlIGEgbWFwIG9mIHRhYiBJRCB0byB0aXRsZSBmb3IgcGFyZW50IGxvb2t1cFxuICBhcHBTdGF0ZS50YWJUaXRsZXMuY2xlYXIoKTtcbiAgdGFicy5mb3JFYWNoKHRhYiA9PiB7XG4gICAgaWYgKHRhYi5pZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBhcHBTdGF0ZS50YWJUaXRsZXMuc2V0KHRhYi5pZCwgdGFiLnRpdGxlIHx8ICdVbnRpdGxlZCcpO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gQ29udmVydCB0byBUYWJNZXRhZGF0YSBmb3IgY29udGV4dCBhbmFseXNpc1xuICBjb25zdCBtYXBwZWRUYWJzOiBUYWJNZXRhZGF0YVtdID0gZ2V0TWFwcGVkVGFicygpO1xuXG4gIC8vIEFuYWx5emUgY29udGV4dFxuICB0cnkge1xuICAgICAgYXBwU3RhdGUuY3VycmVudENvbnRleHRNYXAgPSBhd2FpdCBhbmFseXplVGFiQ29udGV4dChtYXBwZWRUYWJzKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gYW5hbHl6ZSBjb250ZXh0XCIsIGVycm9yKTtcbiAgICAgIGFwcFN0YXRlLmN1cnJlbnRDb250ZXh0TWFwLmNsZWFyKCk7XG4gIH1cblxuICByZW5kZXJUYWJsZSgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyVGFibGUoKSB7XG4gIGNvbnN0IHRib2R5ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI3RhYnNUYWJsZSB0Ym9keScpO1xuICBpZiAoIXRib2R5KSByZXR1cm47XG5cbiAgLy8gMS4gRmlsdGVyXG4gIGxldCB0YWJzRGlzcGxheSA9IGFwcFN0YXRlLmN1cnJlbnRUYWJzLmZpbHRlcih0YWIgPT4ge1xuICAgICAgLy8gR2xvYmFsIFNlYXJjaFxuICAgICAgaWYgKGFwcFN0YXRlLmdsb2JhbFNlYXJjaFF1ZXJ5KSB7XG4gICAgICAgICAgY29uc3QgcSA9IGFwcFN0YXRlLmdsb2JhbFNlYXJjaFF1ZXJ5LnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgY29uc3Qgc2VhcmNoYWJsZVRleHQgPSBgJHt0YWIudGl0bGV9ICR7dGFiLnVybH0gJHt0YWIuaWR9YC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgIGlmICghc2VhcmNoYWJsZVRleHQuaW5jbHVkZXMocSkpIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgLy8gQ29sdW1uIEZpbHRlcnNcbiAgICAgIGZvciAoY29uc3QgW2tleSwgZmlsdGVyXSBvZiBPYmplY3QuZW50cmllcyhhcHBTdGF0ZS5jb2x1bW5GaWx0ZXJzKSkge1xuICAgICAgICAgIGlmICghZmlsdGVyKSBjb250aW51ZTtcbiAgICAgICAgICBjb25zdCB2YWwgPSBTdHJpbmcoZ2V0U29ydFZhbHVlKHRhYiwga2V5KSkudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICBpZiAoIXZhbC5pbmNsdWRlcyhmaWx0ZXIudG9Mb3dlckNhc2UoKSkpIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHRydWU7XG4gIH0pO1xuXG4gIC8vIDIuIFNvcnRcbiAgaWYgKGFwcFN0YXRlLnNvcnRLZXkpIHtcbiAgICB0YWJzRGlzcGxheS5zb3J0KChhLCBiKSA9PiB7XG4gICAgICBsZXQgdmFsQTogYW55ID0gZ2V0U29ydFZhbHVlKGEsIGFwcFN0YXRlLnNvcnRLZXkhKTtcbiAgICAgIGxldCB2YWxCOiBhbnkgPSBnZXRTb3J0VmFsdWUoYiwgYXBwU3RhdGUuc29ydEtleSEpO1xuXG4gICAgICBpZiAodmFsQSA8IHZhbEIpIHJldHVybiBhcHBTdGF0ZS5zb3J0RGlyZWN0aW9uID09PSAnYXNjJyA/IC0xIDogMTtcbiAgICAgIGlmICh2YWxBID4gdmFsQikgcmV0dXJuIGFwcFN0YXRlLnNvcnREaXJlY3Rpb24gPT09ICdhc2MnID8gMSA6IC0xO1xuICAgICAgcmV0dXJuIDA7XG4gICAgfSk7XG4gIH1cblxuICB0Ym9keS5pbm5lckhUTUwgPSAnJzsgLy8gQ2xlYXIgZXhpc3Rpbmcgcm93c1xuXG4gIC8vIDMuIFJlbmRlclxuICBjb25zdCB2aXNpYmxlQ29scyA9IGFwcFN0YXRlLmNvbHVtbnMuZmlsdGVyKGMgPT4gYy52aXNpYmxlKTtcblxuICB0YWJzRGlzcGxheS5mb3JFYWNoKHRhYiA9PiB7XG4gICAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndHInKTtcblxuICAgIHZpc2libGVDb2xzLmZvckVhY2goY29sID0+IHtcbiAgICAgICAgY29uc3QgdGQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd0ZCcpO1xuICAgICAgICBpZiAoY29sLmtleSA9PT0gJ3RpdGxlJykgdGQuY2xhc3NMaXN0LmFkZCgndGl0bGUtY2VsbCcpO1xuICAgICAgICBpZiAoY29sLmtleSA9PT0gJ3VybCcpIHRkLmNsYXNzTGlzdC5hZGQoJ3VybC1jZWxsJyk7XG5cbiAgICAgICAgY29uc3QgdmFsID0gZ2V0Q2VsbFZhbHVlKHRhYiwgY29sLmtleSk7XG5cbiAgICAgICAgaWYgKHZhbCBpbnN0YW5jZW9mIEhUTUxFbGVtZW50KSB7XG4gICAgICAgICAgICB0ZC5hcHBlbmRDaGlsZCh2YWwpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGQuaW5uZXJIVE1MID0gdmFsO1xuICAgICAgICAgICAgdGQudGl0bGUgPSBzdHJpcEh0bWwoU3RyaW5nKHZhbCkpO1xuICAgICAgICB9XG4gICAgICAgIHJvdy5hcHBlbmRDaGlsZCh0ZCk7XG4gICAgfSk7XG5cbiAgICB0Ym9keS5hcHBlbmRDaGlsZChyb3cpO1xuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlckNvbHVtbnNNZW51KCkge1xuICAgIGNvbnN0IG1lbnUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY29sdW1uc01lbnUnKTtcbiAgICBpZiAoIW1lbnUpIHJldHVybjtcblxuICAgIG1lbnUuaW5uZXJIVE1MID0gYXBwU3RhdGUuY29sdW1ucy5tYXAoY29sID0+IGBcbiAgICAgICAgPGxhYmVsIGNsYXNzPVwiY29sdW1uLXRvZ2dsZVwiPlxuICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiIGRhdGEta2V5PVwiJHtjb2wua2V5fVwiICR7Y29sLnZpc2libGUgPyAnY2hlY2tlZCcgOiAnJ30+XG4gICAgICAgICAgICAke2VzY2FwZUh0bWwoY29sLmxhYmVsKX1cbiAgICAgICAgPC9sYWJlbD5cbiAgICBgKS5qb2luKCcnKTtcblxuICAgIG1lbnUucXVlcnlTZWxlY3RvckFsbCgnaW5wdXQnKS5mb3JFYWNoKGlucHV0ID0+IHtcbiAgICAgICAgaW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKGUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IChlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS5kYXRhc2V0LmtleTtcbiAgICAgICAgICAgIGNvbnN0IGNoZWNrZWQgPSAoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkuY2hlY2tlZDtcbiAgICAgICAgICAgIGNvbnN0IGNvbCA9IGFwcFN0YXRlLmNvbHVtbnMuZmluZChjID0+IGMua2V5ID09PSBrZXkpO1xuICAgICAgICAgICAgaWYgKGNvbCkge1xuICAgICAgICAgICAgICAgIGNvbC52aXNpYmxlID0gY2hlY2tlZDtcbiAgICAgICAgICAgICAgICByZW5kZXJUYWJsZUhlYWRlcigpOyAvLyBSZS1yZW5kZXIgaGVhZGVyIHRvIGFkZC9yZW1vdmUgY29sdW1uc1xuICAgICAgICAgICAgICAgIHJlbmRlclRhYmxlKCk7IC8vIFJlLXJlbmRlciBib2R5XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyVGFibGVIZWFkZXIoKSB7XG4gICAgY29uc3QgaGVhZGVyUm93ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2hlYWRlclJvdycpO1xuICAgIGNvbnN0IGZpbHRlclJvdyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmaWx0ZXJSb3cnKTtcbiAgICBpZiAoIWhlYWRlclJvdyB8fCAhZmlsdGVyUm93KSByZXR1cm47XG5cbiAgICBjb25zdCB2aXNpYmxlQ29scyA9IGFwcFN0YXRlLmNvbHVtbnMuZmlsdGVyKGMgPT4gYy52aXNpYmxlKTtcblxuICAgIC8vIFJlbmRlciBIZWFkZXJzXG4gICAgaGVhZGVyUm93LmlubmVySFRNTCA9IHZpc2libGVDb2xzLm1hcChjb2wgPT4gYFxuICAgICAgICA8dGggY2xhc3M9XCIke2NvbC5rZXkgIT09ICdhY3Rpb25zJyA/ICdzb3J0YWJsZScgOiAnJ31cIiBkYXRhLWtleT1cIiR7Y29sLmtleX1cIiBzdHlsZT1cIndpZHRoOiAke2NvbC53aWR0aH07IHBvc2l0aW9uOiByZWxhdGl2ZTtcIj5cbiAgICAgICAgICAgICR7ZXNjYXBlSHRtbChjb2wubGFiZWwpfVxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInJlc2l6ZXJcIj48L2Rpdj5cbiAgICAgICAgPC90aD5cbiAgICBgKS5qb2luKCcnKTtcblxuICAgIC8vIFJlbmRlciBGaWx0ZXIgSW5wdXRzXG4gICAgZmlsdGVyUm93LmlubmVySFRNTCA9IHZpc2libGVDb2xzLm1hcChjb2wgPT4ge1xuICAgICAgICBpZiAoIWNvbC5maWx0ZXJhYmxlKSByZXR1cm4gJzx0aD48L3RoPic7XG4gICAgICAgIGNvbnN0IHZhbCA9IGFwcFN0YXRlLmNvbHVtbkZpbHRlcnNbY29sLmtleV0gfHwgJyc7XG4gICAgICAgIHJldHVybiBgXG4gICAgICAgICAgICA8dGg+XG4gICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgY2xhc3M9XCJmaWx0ZXItaW5wdXRcIiBkYXRhLWtleT1cIiR7Y29sLmtleX1cIiB2YWx1ZT1cIiR7ZXNjYXBlSHRtbCh2YWwpfVwiIHBsYWNlaG9sZGVyPVwiRmlsdGVyLi4uXCI+XG4gICAgICAgICAgICA8L3RoPlxuICAgICAgICBgO1xuICAgIH0pLmpvaW4oJycpO1xuXG4gICAgLy8gQXR0YWNoIFNvcnQgTGlzdGVuZXJzXG4gICAgaGVhZGVyUm93LnF1ZXJ5U2VsZWN0b3JBbGwoJy5zb3J0YWJsZScpLmZvckVhY2godGggPT4ge1xuICAgICAgICB0aC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgICAgICAgICAvLyBJZ25vcmUgaWYgY2xpY2tlZCBvbiByZXNpemVyXG4gICAgICAgICAgICBpZiAoKGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5jbGFzc0xpc3QuY29udGFpbnMoJ3Jlc2l6ZXInKSkgcmV0dXJuO1xuXG4gICAgICAgICAgICBjb25zdCBrZXkgPSB0aC5nZXRBdHRyaWJ1dGUoJ2RhdGEta2V5Jyk7XG4gICAgICAgICAgICBpZiAoa2V5KSBoYW5kbGVTb3J0KGtleSk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgLy8gQXR0YWNoIEZpbHRlciBMaXN0ZW5lcnNcbiAgICBmaWx0ZXJSb3cucXVlcnlTZWxlY3RvckFsbCgnLmZpbHRlci1pbnB1dCcpLmZvckVhY2goaW5wdXQgPT4ge1xuICAgICAgICBpbnB1dC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIChlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBrZXkgPSAoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXQua2V5O1xuICAgICAgICAgICAgY29uc3QgdmFsID0gKGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgaWYgKGtleSkge1xuICAgICAgICAgICAgICAgIGFwcFN0YXRlLmNvbHVtbkZpbHRlcnNba2V5XSA9IHZhbDtcbiAgICAgICAgICAgICAgICByZW5kZXJUYWJsZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgIC8vIEF0dGFjaCBSZXNpemUgTGlzdGVuZXJzXG4gICAgaGVhZGVyUm93LnF1ZXJ5U2VsZWN0b3JBbGwoJy5yZXNpemVyJykuZm9yRWFjaChyZXNpemVyID0+IHtcbiAgICAgICAgaW5pdFJlc2l6ZShyZXNpemVyIGFzIEhUTUxFbGVtZW50KTtcbiAgICB9KTtcblxuICAgIHVwZGF0ZUhlYWRlclN0eWxlcygpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFuZGxlU29ydChrZXk6IHN0cmluZykge1xuICBpZiAoYXBwU3RhdGUuc29ydEtleSA9PT0ga2V5KSB7XG4gICAgYXBwU3RhdGUuc29ydERpcmVjdGlvbiA9IGFwcFN0YXRlLnNvcnREaXJlY3Rpb24gPT09ICdhc2MnID8gJ2Rlc2MnIDogJ2FzYyc7XG4gIH0gZWxzZSB7XG4gICAgYXBwU3RhdGUuc29ydEtleSA9IGtleTtcbiAgICBhcHBTdGF0ZS5zb3J0RGlyZWN0aW9uID0gJ2FzYyc7XG4gIH1cbiAgdXBkYXRlSGVhZGVyU3R5bGVzKCk7XG4gIHJlbmRlclRhYmxlKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVIZWFkZXJTdHlsZXMoKSB7XG4gIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ3RoLnNvcnRhYmxlJykuZm9yRWFjaCh0aCA9PiB7XG4gICAgdGguY2xhc3NMaXN0LnJlbW92ZSgnc29ydC1hc2MnLCAnc29ydC1kZXNjJyk7XG4gICAgaWYgKHRoLmdldEF0dHJpYnV0ZSgnZGF0YS1rZXknKSA9PT0gYXBwU3RhdGUuc29ydEtleSkge1xuICAgICAgdGguY2xhc3NMaXN0LmFkZChhcHBTdGF0ZS5zb3J0RGlyZWN0aW9uID09PSAnYXNjJyA/ICdzb3J0LWFzYycgOiAnc29ydC1kZXNjJyk7XG4gICAgfVxuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRSZXNpemUocmVzaXplcjogSFRNTEVsZW1lbnQpIHtcbiAgICBsZXQgeCA9IDA7XG4gICAgbGV0IHcgPSAwO1xuICAgIGxldCB0aDogSFRNTEVsZW1lbnQ7XG5cbiAgICBjb25zdCBtb3VzZURvd25IYW5kbGVyID0gKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgICAgdGggPSByZXNpemVyLnBhcmVudEVsZW1lbnQgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICAgIHggPSBlLmNsaWVudFg7XG4gICAgICAgIHcgPSB0aC5vZmZzZXRXaWR0aDtcblxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCBtb3VzZU1vdmVIYW5kbGVyKTtcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsIG1vdXNlVXBIYW5kbGVyKTtcbiAgICAgICAgcmVzaXplci5jbGFzc0xpc3QuYWRkKCdyZXNpemluZycpO1xuICAgIH07XG5cbiAgICBjb25zdCBtb3VzZU1vdmVIYW5kbGVyID0gKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgICAgY29uc3QgZHggPSBlLmNsaWVudFggLSB4O1xuICAgICAgICBjb25zdCBjb2xLZXkgPSB0aC5nZXRBdHRyaWJ1dGUoJ2RhdGEta2V5Jyk7XG4gICAgICAgIGNvbnN0IGNvbCA9IGFwcFN0YXRlLmNvbHVtbnMuZmluZChjID0+IGMua2V5ID09PSBjb2xLZXkpO1xuICAgICAgICBpZiAoY29sKSB7XG4gICAgICAgICAgICBjb25zdCBuZXdXaWR0aCA9IE1hdGgubWF4KDMwLCB3ICsgZHgpOyAvLyBNaW4gd2lkdGggMzBweFxuICAgICAgICAgICAgY29sLndpZHRoID0gYCR7bmV3V2lkdGh9cHhgO1xuICAgICAgICAgICAgdGguc3R5bGUud2lkdGggPSBjb2wud2lkdGg7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgY29uc3QgbW91c2VVcEhhbmRsZXIgPSAoKSA9PiB7XG4gICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIG1vdXNlTW92ZUhhbmRsZXIpO1xuICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgbW91c2VVcEhhbmRsZXIpO1xuICAgICAgICByZXNpemVyLmNsYXNzTGlzdC5yZW1vdmUoJ3Jlc2l6aW5nJyk7XG4gICAgfTtcblxuICAgIHJlc2l6ZXIuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgbW91c2VEb3duSGFuZGxlcik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbml0VGFic1RhYmxlKCkge1xuICAgIC8vIExpc3RlbmVycyBmb3IgVUkgY29udHJvbHNcbiAgICBjb25zdCByZWZyZXNoQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3JlZnJlc2hCdG4nKTtcbiAgICBpZiAocmVmcmVzaEJ0bikge1xuICAgICAgICByZWZyZXNoQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgbG9hZFRhYnMpO1xuICAgIH1cblxuICAgIGNvbnN0IGdsb2JhbFNlYXJjaElucHV0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dsb2JhbFNlYXJjaCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgaWYgKGdsb2JhbFNlYXJjaElucHV0KSB7XG4gICAgICAgIGdsb2JhbFNlYXJjaElucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgKGUpID0+IHtcbiAgICAgICAgICAgIGFwcFN0YXRlLmdsb2JhbFNlYXJjaFF1ZXJ5ID0gKGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgcmVuZGVyVGFibGUoKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgY29sdW1uc0J0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjb2x1bW5zQnRuJyk7XG4gICAgaWYgKGNvbHVtbnNCdG4pIHtcbiAgICAgICAgY29sdW1uc0J0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG1lbnUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY29sdW1uc01lbnUnKTtcbiAgICAgICAgICAgIG1lbnU/LmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicpO1xuICAgICAgICAgICAgcmVuZGVyQ29sdW1uc01lbnUoKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgcmVzZXRWaWV3QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Jlc2V0Vmlld0J0bicpO1xuICAgIGlmIChyZXNldFZpZXdCdG4pIHtcbiAgICAgICAgcmVzZXRWaWV3QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICAgICAgLy8gUmVzZXQgY29sdW1ucyB0byBkZWZhdWx0c1xuICAgICAgICAgICAgYXBwU3RhdGUuY29sdW1ucy5mb3JFYWNoKGMgPT4gYy52aXNpYmxlID0gWydpZCcsICd0aXRsZScsICd1cmwnLCAnd2luZG93SWQnLCAnZ3JvdXBJZCcsICdnZW5yZScsICdjb250ZXh0JywgJ3NpdGVOYW1lJywgJ3BsYXRmb3JtJywgJ29iamVjdFR5cGUnLCAnYXV0aG9yT3JDcmVhdG9yJywgJ2FjdGlvbnMnXS5pbmNsdWRlcyhjLmtleSkpO1xuICAgICAgICAgICAgYXBwU3RhdGUuZ2xvYmFsU2VhcmNoUXVlcnkgPSAnJztcbiAgICAgICAgICAgIGlmIChnbG9iYWxTZWFyY2hJbnB1dCkgZ2xvYmFsU2VhcmNoSW5wdXQudmFsdWUgPSAnJztcbiAgICAgICAgICAgIGFwcFN0YXRlLmNvbHVtbkZpbHRlcnMgPSB7fTtcbiAgICAgICAgICAgIHJlbmRlclRhYmxlSGVhZGVyKCk7XG4gICAgICAgICAgICByZW5kZXJUYWJsZSgpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBIaWRlIGNvbHVtbiBtZW51IHdoZW4gY2xpY2tpbmcgb3V0c2lkZVxuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICAgICAgY29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICAgIGlmICghdGFyZ2V0LmNsb3Nlc3QoJy5jb2x1bW5zLW1lbnUtY29udGFpbmVyJykpIHtcbiAgICAgICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjb2x1bW5zTWVudScpPy5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gTGlzdGVuIGZvciB0YWIgdXBkYXRlcyB0byByZWZyZXNoIGRhdGEgKFNQQSBzdXBwb3J0KVxuICAgIC8vIFdlIGNhbiBwdXQgdGhlc2UgbGlzdGVuZXJzIGhlcmUgb3IgaW4gdGhlIG1haW4gZW50cnkgcG9pbnQuXG4gICAgLy8gUHV0dGluZyB0aGVtIGhlcmUgaXNvbGF0ZXMgdGFiIHRhYmxlIGxvZ2ljLlxuICAgIGNocm9tZS50YWJzLm9uVXBkYXRlZC5hZGRMaXN0ZW5lcigodGFiSWQsIGNoYW5nZUluZm8sIHRhYikgPT4ge1xuICAgICAgICBpZiAoY2hhbmdlSW5mby51cmwgfHwgY2hhbmdlSW5mby5zdGF0dXMgPT09ICdjb21wbGV0ZScpIHtcbiAgICAgICAgICAgIGxvYWRUYWJzKCk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIGNocm9tZS50YWJzLm9uUmVtb3ZlZC5hZGRMaXN0ZW5lcigoKSA9PiB7XG4gICAgICAgIGxvYWRUYWJzKCk7XG4gICAgfSk7XG5cbiAgICByZW5kZXJUYWJsZUhlYWRlcigpO1xufVxuIiwgImltcG9ydCB7IEN1c3RvbVN0cmF0ZWd5LCBTb3J0aW5nU3RyYXRlZ3kgfSBmcm9tIFwiLi90eXBlcy5qc1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0cmF0ZWd5RGVmaW5pdGlvbiB7XG4gICAgaWQ6IFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZztcbiAgICBsYWJlbDogc3RyaW5nO1xuICAgIGlzR3JvdXBpbmc6IGJvb2xlYW47XG4gICAgaXNTb3J0aW5nOiBib29sZWFuO1xuICAgIHRhZ3M/OiBzdHJpbmdbXTtcbiAgICBhdXRvUnVuPzogYm9vbGVhbjtcbiAgICBpc0N1c3RvbT86IGJvb2xlYW47XG59XG5cbi8vIFJlc3RvcmVkIHN0cmF0ZWdpZXMgbWF0Y2hpbmcgYmFja2dyb3VuZCBjYXBhYmlsaXRpZXMuXG5leHBvcnQgY29uc3QgU1RSQVRFR0lFUzogU3RyYXRlZ3lEZWZpbml0aW9uW10gPSBbXG4gICAgeyBpZDogXCJkb21haW5cIiwgbGFiZWw6IFwiRG9tYWluXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJkb21haW5fZnVsbFwiLCBsYWJlbDogXCJGdWxsIERvbWFpblwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwidG9waWNcIiwgbGFiZWw6IFwiVG9waWNcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImNvbnRleHRcIiwgbGFiZWw6IFwiQ29udGV4dFwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwibGluZWFnZVwiLCBsYWJlbDogXCJMaW5lYWdlXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJwaW5uZWRcIiwgbGFiZWw6IFwiUGlubmVkXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJyZWNlbmN5XCIsIGxhYmVsOiBcIlJlY2VuY3lcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImFnZVwiLCBsYWJlbDogXCJBZ2VcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInVybFwiLCBsYWJlbDogXCJVUkxcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcIm5lc3RpbmdcIiwgbGFiZWw6IFwiTmVzdGluZ1wiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwidGl0bGVcIiwgbGFiZWw6IFwiVGl0bGVcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbl07XG5cbmV4cG9ydCBjb25zdCBnZXRTdHJhdGVnaWVzID0gKGN1c3RvbVN0cmF0ZWdpZXM/OiBDdXN0b21TdHJhdGVneVtdKTogU3RyYXRlZ3lEZWZpbml0aW9uW10gPT4ge1xuICAgIGlmICghY3VzdG9tU3RyYXRlZ2llcyB8fCBjdXN0b21TdHJhdGVnaWVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIFNUUkFURUdJRVM7XG5cbiAgICAvLyBDdXN0b20gc3RyYXRlZ2llcyBjYW4gb3ZlcnJpZGUgYnVpbHQtaW5zIGlmIElEcyBtYXRjaCwgb3IgYWRkIG5ldyBvbmVzLlxuICAgIGNvbnN0IGNvbWJpbmVkID0gWy4uLlNUUkFURUdJRVNdO1xuXG4gICAgY3VzdG9tU3RyYXRlZ2llcy5mb3JFYWNoKGN1c3RvbSA9PiB7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nSW5kZXggPSBjb21iaW5lZC5maW5kSW5kZXgocyA9PiBzLmlkID09PSBjdXN0b20uaWQpO1xuXG4gICAgICAgIC8vIERldGVybWluZSBjYXBhYmlsaXRpZXMgYmFzZWQgb24gcnVsZXMgcHJlc2VuY2VcbiAgICAgICAgY29uc3QgaGFzR3JvdXBpbmcgPSAoY3VzdG9tLmdyb3VwaW5nUnVsZXMgJiYgY3VzdG9tLmdyb3VwaW5nUnVsZXMubGVuZ3RoID4gMCkgfHwgKGN1c3RvbS5ydWxlcyAmJiBjdXN0b20ucnVsZXMubGVuZ3RoID4gMCkgfHwgZmFsc2U7XG4gICAgICAgIGNvbnN0IGhhc1NvcnRpbmcgPSAoY3VzdG9tLnNvcnRpbmdSdWxlcyAmJiBjdXN0b20uc29ydGluZ1J1bGVzLmxlbmd0aCA+IDApIHx8IChjdXN0b20ucnVsZXMgJiYgY3VzdG9tLnJ1bGVzLmxlbmd0aCA+IDApIHx8IGZhbHNlO1xuXG4gICAgICAgIGNvbnN0IHRhZ3M6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGlmIChoYXNHcm91cGluZykgdGFncy5wdXNoKFwiZ3JvdXBcIik7XG4gICAgICAgIGlmIChoYXNTb3J0aW5nKSB0YWdzLnB1c2goXCJzb3J0XCIpO1xuXG4gICAgICAgIGNvbnN0IGRlZmluaXRpb246IFN0cmF0ZWd5RGVmaW5pdGlvbiA9IHtcbiAgICAgICAgICAgIGlkOiBjdXN0b20uaWQsXG4gICAgICAgICAgICBsYWJlbDogY3VzdG9tLmxhYmVsLFxuICAgICAgICAgICAgaXNHcm91cGluZzogaGFzR3JvdXBpbmcsXG4gICAgICAgICAgICBpc1NvcnRpbmc6IGhhc1NvcnRpbmcsXG4gICAgICAgICAgICB0YWdzOiB0YWdzLFxuICAgICAgICAgICAgYXV0b1J1bjogY3VzdG9tLmF1dG9SdW4sXG4gICAgICAgICAgICBpc0N1c3RvbTogdHJ1ZVxuICAgICAgICB9O1xuXG4gICAgICAgIGlmIChleGlzdGluZ0luZGV4ICE9PSAtMSkge1xuICAgICAgICAgICAgY29tYmluZWRbZXhpc3RpbmdJbmRleF0gPSBkZWZpbml0aW9uO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29tYmluZWQucHVzaChkZWZpbml0aW9uKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGNvbWJpbmVkO1xufTtcblxuZXhwb3J0IGNvbnN0IGdldFN0cmF0ZWd5ID0gKGlkOiBTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmcpOiBTdHJhdGVneURlZmluaXRpb24gfCB1bmRlZmluZWQgPT4gU1RSQVRFR0lFUy5maW5kKHMgPT4gcy5pZCA9PT0gaWQpO1xuIiwgImNvbnN0IGhvc3RuYW1lQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuY29uc3QgTUFYX0NBQ0hFX1NJWkUgPSAxMDAwO1xuXG5leHBvcnQgY29uc3QgZ2V0SG9zdG5hbWUgPSAodXJsOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsID0+IHtcbiAgaWYgKGhvc3RuYW1lQ2FjaGUuaGFzKHVybCkpIHJldHVybiBob3N0bmFtZUNhY2hlLmdldCh1cmwpITtcblxuICB0cnkge1xuICAgIGNvbnN0IHBhcnNlZCA9IG5ldyBVUkwodXJsKTtcbiAgICBjb25zdCBob3N0bmFtZSA9IHBhcnNlZC5ob3N0bmFtZTtcbiAgICBcbiAgICBpZiAoaG9zdG5hbWVDYWNoZS5zaXplID49IE1BWF9DQUNIRV9TSVpFKSBob3N0bmFtZUNhY2hlLmNsZWFyKCk7XG4gICAgaG9zdG5hbWVDYWNoZS5zZXQodXJsLCBob3N0bmFtZSk7XG4gICAgcmV0dXJuIGhvc3RuYW1lO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufTtcbiIsICJpbXBvcnQgeyBHcm91cGluZ1N0cmF0ZWd5LCBTb3J0aW5nU3RyYXRlZ3ksIFRhYkdyb3VwLCBUYWJNZXRhZGF0YSwgQ3VzdG9tU3RyYXRlZ3ksIFN0cmF0ZWd5UnVsZSwgUnVsZUNvbmRpdGlvbiwgR3JvdXBpbmdSdWxlLCBTb3J0aW5nUnVsZSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGdldFN0cmF0ZWdpZXMgfSBmcm9tIFwiLi4vc2hhcmVkL3N0cmF0ZWd5UmVnaXN0cnkuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tIFwiLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5pbXBvcnQgeyBnZXRIb3N0bmFtZSB9IGZyb20gXCIuLi9zaGFyZWQvdXJsQ2FjaGUuanNcIjtcblxubGV0IGN1c3RvbVN0cmF0ZWdpZXM6IEN1c3RvbVN0cmF0ZWd5W10gPSBbXTtcblxuZXhwb3J0IGNvbnN0IHNldEN1c3RvbVN0cmF0ZWdpZXMgPSAoc3RyYXRlZ2llczogQ3VzdG9tU3RyYXRlZ3lbXSkgPT4ge1xuICAgIGN1c3RvbVN0cmF0ZWdpZXMgPSBzdHJhdGVnaWVzO1xufTtcblxuZXhwb3J0IGNvbnN0IGdldEN1c3RvbVN0cmF0ZWdpZXMgPSAoKTogQ3VzdG9tU3RyYXRlZ3lbXSA9PiBjdXN0b21TdHJhdGVnaWVzO1xuXG5jb25zdCBDT0xPUlMgPSBbXCJncmV5XCIsIFwiYmx1ZVwiLCBcInJlZFwiLCBcInllbGxvd1wiLCBcImdyZWVuXCIsIFwicGlua1wiLCBcInB1cnBsZVwiLCBcImN5YW5cIiwgXCJvcmFuZ2VcIl07XG5cbmNvbnN0IHJlZ2V4Q2FjaGUgPSBuZXcgTWFwPHN0cmluZywgUmVnRXhwPigpO1xuXG5leHBvcnQgY29uc3QgZG9tYWluRnJvbVVybCA9ICh1cmw6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGhvc3RuYW1lID0gZ2V0SG9zdG5hbWUodXJsKTtcbiAgaWYgKCFob3N0bmFtZSkgcmV0dXJuIFwidW5rbm93blwiO1xuICByZXR1cm4gaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sIFwiXCIpO1xufTtcblxuZXhwb3J0IGNvbnN0IHN1YmRvbWFpbkZyb21VcmwgPSAodXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBob3N0bmFtZSA9IGdldEhvc3RuYW1lKHVybCk7XG4gIGlmICghaG9zdG5hbWUpIHJldHVybiBcIlwiO1xuXG4gIGNvbnN0IGhvc3QgPSBob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgXCJcIik7XG4gIGNvbnN0IHBhcnRzID0gaG9zdC5zcGxpdCgnLicpO1xuICBpZiAocGFydHMubGVuZ3RoID4gMikge1xuICAgICAgcmV0dXJuIHBhcnRzLnNsaWNlKDAsIHBhcnRzLmxlbmd0aCAtIDIpLmpvaW4oJy4nKTtcbiAgfVxuICByZXR1cm4gXCJcIjtcbn1cblxuY29uc3QgZ2V0TmVzdGVkUHJvcGVydHkgPSAob2JqOiB1bmtub3duLCBwYXRoOiBzdHJpbmcpOiB1bmtub3duID0+IHtcbiAgICBpZiAoIW9iaiB8fCB0eXBlb2Ygb2JqICE9PSAnb2JqZWN0JykgcmV0dXJuIHVuZGVmaW5lZDtcblxuICAgIGlmICghcGF0aC5pbmNsdWRlcygnLicpKSB7XG4gICAgICAgIHJldHVybiAob2JqIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtwYXRoXTtcbiAgICB9XG5cbiAgICBjb25zdCBwYXJ0cyA9IHBhdGguc3BsaXQoJy4nKTtcbiAgICBsZXQgY3VycmVudDogdW5rbm93biA9IG9iajtcblxuICAgIGZvciAoY29uc3Qga2V5IG9mIHBhcnRzKSB7XG4gICAgICAgIGlmICghY3VycmVudCB8fCB0eXBlb2YgY3VycmVudCAhPT0gJ29iamVjdCcpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIGN1cnJlbnQgPSAoY3VycmVudCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilba2V5XTtcbiAgICB9XG5cbiAgICByZXR1cm4gY3VycmVudDtcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRGaWVsZFZhbHVlID0gKHRhYjogVGFiTWV0YWRhdGEsIGZpZWxkOiBzdHJpbmcpOiBhbnkgPT4ge1xuICAgIHN3aXRjaChmaWVsZCkge1xuICAgICAgICBjYXNlICdpZCc6IHJldHVybiB0YWIuaWQ7XG4gICAgICAgIGNhc2UgJ2luZGV4JzogcmV0dXJuIHRhYi5pbmRleDtcbiAgICAgICAgY2FzZSAnd2luZG93SWQnOiByZXR1cm4gdGFiLndpbmRvd0lkO1xuICAgICAgICBjYXNlICdncm91cElkJzogcmV0dXJuIHRhYi5ncm91cElkO1xuICAgICAgICBjYXNlICd0aXRsZSc6IHJldHVybiB0YWIudGl0bGU7XG4gICAgICAgIGNhc2UgJ3VybCc6IHJldHVybiB0YWIudXJsO1xuICAgICAgICBjYXNlICdzdGF0dXMnOiByZXR1cm4gdGFiLnN0YXR1cztcbiAgICAgICAgY2FzZSAnYWN0aXZlJzogcmV0dXJuIHRhYi5hY3RpdmU7XG4gICAgICAgIGNhc2UgJ3NlbGVjdGVkJzogcmV0dXJuIHRhYi5zZWxlY3RlZDtcbiAgICAgICAgY2FzZSAncGlubmVkJzogcmV0dXJuIHRhYi5waW5uZWQ7XG4gICAgICAgIGNhc2UgJ29wZW5lclRhYklkJzogcmV0dXJuIHRhYi5vcGVuZXJUYWJJZDtcbiAgICAgICAgY2FzZSAnbGFzdEFjY2Vzc2VkJzogcmV0dXJuIHRhYi5sYXN0QWNjZXNzZWQ7XG4gICAgICAgIGNhc2UgJ2NvbnRleHQnOiByZXR1cm4gdGFiLmNvbnRleHQ7XG4gICAgICAgIGNhc2UgJ2dlbnJlJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uZ2VucmU7XG4gICAgICAgIGNhc2UgJ3NpdGVOYW1lJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uc2l0ZU5hbWU7XG4gICAgICAgIC8vIERlcml2ZWQgb3IgbWFwcGVkIGZpZWxkc1xuICAgICAgICBjYXNlICdkb21haW4nOiByZXR1cm4gZG9tYWluRnJvbVVybCh0YWIudXJsKTtcbiAgICAgICAgY2FzZSAnc3ViZG9tYWluJzogcmV0dXJuIHN1YmRvbWFpbkZyb21VcmwodGFiLnVybCk7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICByZXR1cm4gZ2V0TmVzdGVkUHJvcGVydHkodGFiLCBmaWVsZCk7XG4gICAgfVxufTtcblxuY29uc3Qgc3RyaXBUbGQgPSAoZG9tYWluOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gZG9tYWluLnJlcGxhY2UoL1xcLihjb218b3JnfGdvdnxuZXR8ZWR1fGlvKSQvaSwgXCJcIik7XG59O1xuXG5leHBvcnQgY29uc3Qgc2VtYW50aWNCdWNrZXQgPSAodGl0bGU6IHN0cmluZywgdXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBrZXkgPSBgJHt0aXRsZX0gJHt1cmx9YC50b0xvd2VyQ2FzZSgpO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiZG9jXCIpIHx8IGtleS5pbmNsdWRlcyhcInJlYWRtZVwiKSB8fCBrZXkuaW5jbHVkZXMoXCJndWlkZVwiKSkgcmV0dXJuIFwiRG9jc1wiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwibWFpbFwiKSB8fCBrZXkuaW5jbHVkZXMoXCJpbmJveFwiKSkgcmV0dXJuIFwiQ2hhdFwiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiZGFzaGJvYXJkXCIpIHx8IGtleS5pbmNsdWRlcyhcImNvbnNvbGVcIikpIHJldHVybiBcIkRhc2hcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImlzc3VlXCIpIHx8IGtleS5pbmNsdWRlcyhcInRpY2tldFwiKSkgcmV0dXJuIFwiVGFza3NcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImRyaXZlXCIpIHx8IGtleS5pbmNsdWRlcyhcInN0b3JhZ2VcIikpIHJldHVybiBcIkZpbGVzXCI7XG4gIHJldHVybiBcIk1pc2NcIjtcbn07XG5cbmV4cG9ydCBjb25zdCBuYXZpZ2F0aW9uS2V5ID0gKHRhYjogVGFiTWV0YWRhdGEpOiBzdHJpbmcgPT4ge1xuICBpZiAodGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gYGNoaWxkLW9mLSR7dGFiLm9wZW5lclRhYklkfWA7XG4gIH1cbiAgcmV0dXJuIGB3aW5kb3ctJHt0YWIud2luZG93SWR9YDtcbn07XG5cbmNvbnN0IGdldFJlY2VuY3lMYWJlbCA9IChsYXN0QWNjZXNzZWQ6IG51bWJlcik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gIGNvbnN0IGRpZmYgPSBub3cgLSBsYXN0QWNjZXNzZWQ7XG4gIGlmIChkaWZmIDwgMzYwMDAwMCkgcmV0dXJuIFwiSnVzdCBub3dcIjsgLy8gMWhcbiAgaWYgKGRpZmYgPCA4NjQwMDAwMCkgcmV0dXJuIFwiVG9kYXlcIjsgLy8gMjRoXG4gIGlmIChkaWZmIDwgMTcyODAwMDAwKSByZXR1cm4gXCJZZXN0ZXJkYXlcIjsgLy8gNDhoXG4gIGlmIChkaWZmIDwgNjA0ODAwMDAwKSByZXR1cm4gXCJUaGlzIFdlZWtcIjsgLy8gN2RcbiAgcmV0dXJuIFwiT2xkZXJcIjtcbn07XG5cbmNvbnN0IGNvbG9yRm9yS2V5ID0gKGtleTogc3RyaW5nLCBvZmZzZXQ6IG51bWJlcik6IHN0cmluZyA9PiBDT0xPUlNbKE1hdGguYWJzKGhhc2hDb2RlKGtleSkpICsgb2Zmc2V0KSAlIENPTE9SUy5sZW5ndGhdO1xuXG5jb25zdCBoYXNoQ29kZSA9ICh2YWx1ZTogc3RyaW5nKTogbnVtYmVyID0+IHtcbiAgbGV0IGhhc2ggPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHZhbHVlLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgaGFzaCA9IChoYXNoIDw8IDUpIC0gaGFzaCArIHZhbHVlLmNoYXJDb2RlQXQoaSk7XG4gICAgaGFzaCB8PSAwO1xuICB9XG4gIHJldHVybiBoYXNoO1xufTtcblxudHlwZSBMYWJlbEdlbmVyYXRvciA9IChmaXJzdFRhYjogVGFiTWV0YWRhdGEsIHRhYnM6IFRhYk1ldGFkYXRhW10sIGFsbFRhYnNNYXA6IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhPikgPT4gc3RyaW5nIHwgbnVsbDtcblxuY29uc3QgYnVpbHRJbkxhYmVsU3RyYXRlZ2llczogUmVjb3JkPHN0cmluZywgTGFiZWxHZW5lcmF0b3I+ID0ge1xuICBkb21haW46IChmaXJzdFRhYiwgdGFicykgPT4ge1xuICAgIGNvbnN0IHNpdGVOYW1lcyA9IG5ldyBTZXQodGFicy5tYXAodCA9PiB0LmNvbnRleHREYXRhPy5zaXRlTmFtZSkuZmlsdGVyKEJvb2xlYW4pKTtcbiAgICBpZiAoc2l0ZU5hbWVzLnNpemUgPT09IDEpIHtcbiAgICAgIHJldHVybiBzdHJpcFRsZChBcnJheS5mcm9tKHNpdGVOYW1lcylbMF0gYXMgc3RyaW5nKTtcbiAgICB9XG4gICAgcmV0dXJuIHN0cmlwVGxkKGRvbWFpbkZyb21VcmwoZmlyc3RUYWIudXJsKSk7XG4gIH0sXG4gIGRvbWFpbl9mdWxsOiAoZmlyc3RUYWIpID0+IGRvbWFpbkZyb21VcmwoZmlyc3RUYWIudXJsKSxcbiAgdG9waWM6IChmaXJzdFRhYikgPT4gc2VtYW50aWNCdWNrZXQoZmlyc3RUYWIudGl0bGUsIGZpcnN0VGFiLnVybCksXG4gIGxpbmVhZ2U6IChmaXJzdFRhYiwgX3RhYnMsIGFsbFRhYnNNYXApID0+IHtcbiAgICBpZiAoZmlyc3RUYWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgY29uc3QgcGFyZW50ID0gYWxsVGFic01hcC5nZXQoZmlyc3RUYWIub3BlbmVyVGFiSWQpO1xuICAgICAgaWYgKHBhcmVudCkge1xuICAgICAgICBjb25zdCBwYXJlbnRUaXRsZSA9IHBhcmVudC50aXRsZS5sZW5ndGggPiAyMCA/IHBhcmVudC50aXRsZS5zdWJzdHJpbmcoMCwgMjApICsgXCIuLi5cIiA6IHBhcmVudC50aXRsZTtcbiAgICAgICAgcmV0dXJuIGBGcm9tOiAke3BhcmVudFRpdGxlfWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYEZyb206IFRhYiAke2ZpcnN0VGFiLm9wZW5lclRhYklkfWA7XG4gICAgfVxuICAgIHJldHVybiBgV2luZG93ICR7Zmlyc3RUYWIud2luZG93SWR9YDtcbiAgfSxcbiAgY29udGV4dDogKGZpcnN0VGFiKSA9PiBmaXJzdFRhYi5jb250ZXh0IHx8IFwiVW5jYXRlZ29yaXplZFwiLFxuICBwaW5uZWQ6IChmaXJzdFRhYikgPT4gZmlyc3RUYWIucGlubmVkID8gXCJQaW5uZWRcIiA6IFwiVW5waW5uZWRcIixcbiAgYWdlOiAoZmlyc3RUYWIpID0+IGdldFJlY2VuY3lMYWJlbChmaXJzdFRhYi5sYXN0QWNjZXNzZWQgPz8gMCksXG4gIHVybDogKCkgPT4gXCJVUkwgR3JvdXBcIixcbiAgcmVjZW5jeTogKCkgPT4gXCJUaW1lIEdyb3VwXCIsXG4gIG5lc3Rpbmc6IChmaXJzdFRhYikgPT4gZmlyc3RUYWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCA/IFwiQ2hpbGRyZW5cIiA6IFwiUm9vdHNcIixcbn07XG5cbi8vIEhlbHBlciB0byBnZXQgYSBodW1hbi1yZWFkYWJsZSBsYWJlbCBjb21wb25lbnQgZnJvbSBhIHN0cmF0ZWd5IGFuZCBhIHNldCBvZiB0YWJzXG5jb25zdCBnZXRMYWJlbENvbXBvbmVudCA9IChzdHJhdGVneTogR3JvdXBpbmdTdHJhdGVneSB8IHN0cmluZywgdGFiczogVGFiTWV0YWRhdGFbXSwgYWxsVGFic01hcDogTWFwPG51bWJlciwgVGFiTWV0YWRhdGE+KTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gIGNvbnN0IGZpcnN0VGFiID0gdGFic1swXTtcbiAgaWYgKCFmaXJzdFRhYikgcmV0dXJuIFwiVW5rbm93blwiO1xuXG4gIC8vIENoZWNrIGN1c3RvbSBzdHJhdGVnaWVzIGZpcnN0XG4gIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChzID0+IHMuaWQgPT09IHN0cmF0ZWd5KTtcbiAgaWYgKGN1c3RvbSkge1xuICAgICAgcmV0dXJuIGdyb3VwaW5nS2V5KGZpcnN0VGFiLCBzdHJhdGVneSk7XG4gIH1cblxuICBjb25zdCBnZW5lcmF0b3IgPSBidWlsdEluTGFiZWxTdHJhdGVnaWVzW3N0cmF0ZWd5XTtcbiAgaWYgKGdlbmVyYXRvcikge1xuICAgIHJldHVybiBnZW5lcmF0b3IoZmlyc3RUYWIsIHRhYnMsIGFsbFRhYnNNYXApO1xuICB9XG5cbiAgLy8gRGVmYXVsdCBmYWxsYmFjayBmb3IgZ2VuZXJpYyBmaWVsZHNcbiAgY29uc3QgdmFsID0gZ2V0RmllbGRWYWx1ZShmaXJzdFRhYiwgc3RyYXRlZ3kpO1xuICBpZiAodmFsICE9PSB1bmRlZmluZWQgJiYgdmFsICE9PSBudWxsKSB7XG4gICAgICByZXR1cm4gU3RyaW5nKHZhbCk7XG4gIH1cbiAgcmV0dXJuIFwiVW5rbm93blwiO1xufTtcblxuY29uc3QgZ2VuZXJhdGVMYWJlbCA9IChcbiAgc3RyYXRlZ2llczogKEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcpW10sXG4gIHRhYnM6IFRhYk1ldGFkYXRhW10sXG4gIGFsbFRhYnNNYXA6IE1hcDxudW1iZXIsIFRhYk1ldGFkYXRhPlxuKTogc3RyaW5nID0+IHtcbiAgY29uc3QgbGFiZWxzID0gc3RyYXRlZ2llc1xuICAgIC5tYXAocyA9PiBnZXRMYWJlbENvbXBvbmVudChzLCB0YWJzLCBhbGxUYWJzTWFwKSlcbiAgICAuZmlsdGVyKGwgPT4gbCAmJiBsICE9PSBcIlVua25vd25cIiAmJiBsICE9PSBcIkdyb3VwXCIgJiYgbCAhPT0gXCJVUkwgR3JvdXBcIiAmJiBsICE9PSBcIlRpbWUgR3JvdXBcIiAmJiBsICE9PSBcIk1pc2NcIik7XG5cbiAgaWYgKGxhYmVscy5sZW5ndGggPT09IDApIHJldHVybiBcIkdyb3VwXCI7XG4gIHJldHVybiBBcnJheS5mcm9tKG5ldyBTZXQobGFiZWxzKSkuam9pbihcIiAtIFwiKTtcbn07XG5cbmNvbnN0IGdldFN0cmF0ZWd5Q29sb3JSdWxlID0gKHN0cmF0ZWd5SWQ6IHN0cmluZyk6IEdyb3VwaW5nUnVsZSB8IHVuZGVmaW5lZCA9PiB7XG4gICAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3lJZCk7XG4gICAgaWYgKCFjdXN0b20pIHJldHVybiB1bmRlZmluZWQ7XG5cbiAgICBjb25zdCBncm91cGluZ1J1bGVzTGlzdCA9IGFzQXJyYXk8R3JvdXBpbmdSdWxlPihjdXN0b20uZ3JvdXBpbmdSdWxlcyk7XG4gICAgLy8gSXRlcmF0ZSBtYW51YWxseSB0byBjaGVjayBjb2xvclxuICAgIGZvciAobGV0IGkgPSBncm91cGluZ1J1bGVzTGlzdC5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICBjb25zdCBydWxlID0gZ3JvdXBpbmdSdWxlc0xpc3RbaV07XG4gICAgICAgIGlmIChydWxlICYmIHJ1bGUuY29sb3IgJiYgcnVsZS5jb2xvciAhPT0gJ3JhbmRvbScpIHtcbiAgICAgICAgICAgIHJldHVybiBydWxlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB1bmRlZmluZWQ7XG59O1xuXG5jb25zdCByZXNvbHZlV2luZG93TW9kZSA9IChtb2RlczogKHN0cmluZyB8IHVuZGVmaW5lZClbXSk6IFwiY3VycmVudFwiIHwgXCJuZXdcIiB8IFwiY29tcG91bmRcIiA9PiB7XG4gICAgaWYgKG1vZGVzLmluY2x1ZGVzKFwibmV3XCIpKSByZXR1cm4gXCJuZXdcIjtcbiAgICBpZiAobW9kZXMuaW5jbHVkZXMoXCJjb21wb3VuZFwiKSkgcmV0dXJuIFwiY29tcG91bmRcIjtcbiAgICByZXR1cm4gXCJjdXJyZW50XCI7XG59O1xuXG5leHBvcnQgY29uc3QgZ3JvdXBUYWJzID0gKFxuICB0YWJzOiBUYWJNZXRhZGF0YVtdLFxuICBzdHJhdGVnaWVzOiAoU29ydGluZ1N0cmF0ZWd5IHwgc3RyaW5nKVtdXG4pOiBUYWJHcm91cFtdID0+IHtcbiAgY29uc3QgYXZhaWxhYmxlU3RyYXRlZ2llcyA9IGdldFN0cmF0ZWdpZXMoY3VzdG9tU3RyYXRlZ2llcyk7XG4gIGNvbnN0IGVmZmVjdGl2ZVN0cmF0ZWdpZXMgPSBzdHJhdGVnaWVzLmZpbHRlcihzID0+IGF2YWlsYWJsZVN0cmF0ZWdpZXMuZmluZChhdmFpbCA9PiBhdmFpbC5pZCA9PT0gcyk/LmlzR3JvdXBpbmcpO1xuICBjb25zdCBidWNrZXRzID0gbmV3IE1hcDxzdHJpbmcsIFRhYkdyb3VwPigpO1xuXG4gIGNvbnN0IGFsbFRhYnNNYXAgPSBuZXcgTWFwPG51bWJlciwgVGFiTWV0YWRhdGE+KCk7XG4gIHRhYnMuZm9yRWFjaCh0ID0+IGFsbFRhYnNNYXAuc2V0KHQuaWQsIHQpKTtcblxuICB0YWJzLmZvckVhY2goKHRhYikgPT4ge1xuICAgIGxldCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IGFwcGxpZWRTdHJhdGVnaWVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IGNvbGxlY3RlZE1vZGVzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgZm9yIChjb25zdCBzIG9mIGVmZmVjdGl2ZVN0cmF0ZWdpZXMpIHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGdldEdyb3VwaW5nUmVzdWx0KHRhYiwgcyk7XG4gICAgICAgICAgICBpZiAocmVzdWx0LmtleSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGtleXMucHVzaChgJHtzfToke3Jlc3VsdC5rZXl9YCk7XG4gICAgICAgICAgICAgICAgYXBwbGllZFN0cmF0ZWdpZXMucHVzaChzKTtcbiAgICAgICAgICAgICAgICBjb2xsZWN0ZWRNb2Rlcy5wdXNoKHJlc3VsdC5tb2RlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgbG9nRGVidWcoXCJFcnJvciBnZW5lcmF0aW5nIGdyb3VwaW5nIGtleVwiLCB7IHRhYklkOiB0YWIuaWQsIGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgIHJldHVybjsgLy8gU2tpcCB0aGlzIHRhYiBvbiBlcnJvclxuICAgIH1cblxuICAgIC8vIElmIG5vIHN0cmF0ZWdpZXMgYXBwbGllZCAoZS5nLiBhbGwgZmlsdGVyZWQgb3V0KSwgc2tpcCBncm91cGluZyBmb3IgdGhpcyB0YWJcbiAgICBpZiAoa2V5cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGVmZmVjdGl2ZU1vZGUgPSByZXNvbHZlV2luZG93TW9kZShjb2xsZWN0ZWRNb2Rlcyk7XG4gICAgY29uc3QgdmFsdWVLZXkgPSBrZXlzLmpvaW4oXCI6OlwiKTtcbiAgICBsZXQgYnVja2V0S2V5ID0gXCJcIjtcbiAgICBpZiAoZWZmZWN0aXZlTW9kZSA9PT0gJ2N1cnJlbnQnKSB7XG4gICAgICAgICBidWNrZXRLZXkgPSBgd2luZG93LSR7dGFiLndpbmRvd0lkfTo6YCArIHZhbHVlS2V5O1xuICAgIH0gZWxzZSB7XG4gICAgICAgICBidWNrZXRLZXkgPSBgZ2xvYmFsOjpgICsgdmFsdWVLZXk7XG4gICAgfVxuXG4gICAgbGV0IGdyb3VwID0gYnVja2V0cy5nZXQoYnVja2V0S2V5KTtcbiAgICBpZiAoIWdyb3VwKSB7XG4gICAgICBsZXQgZ3JvdXBDb2xvciA9IG51bGw7XG4gICAgICBsZXQgY29sb3JGaWVsZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgbGV0IGNvbG9yVHJhbnNmb3JtOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICBsZXQgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbiAgICAgIGZvciAoY29uc3Qgc0lkIG9mIGFwcGxpZWRTdHJhdGVnaWVzKSB7XG4gICAgICAgIGNvbnN0IHJ1bGUgPSBnZXRTdHJhdGVneUNvbG9yUnVsZShzSWQpO1xuICAgICAgICBpZiAocnVsZSkge1xuICAgICAgICAgICAgZ3JvdXBDb2xvciA9IHJ1bGUuY29sb3I7XG4gICAgICAgICAgICBjb2xvckZpZWxkID0gcnVsZS5jb2xvckZpZWxkO1xuICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm0gPSBydWxlLmNvbG9yVHJhbnNmb3JtO1xuICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuID0gcnVsZS5jb2xvclRyYW5zZm9ybVBhdHRlcm47XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoZ3JvdXBDb2xvciA9PT0gJ21hdGNoJykge1xuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkodmFsdWVLZXksIDApO1xuICAgICAgfSBlbHNlIGlmIChncm91cENvbG9yID09PSAnZmllbGQnICYmIGNvbG9yRmllbGQpIHtcbiAgICAgICAgY29uc3QgdmFsID0gZ2V0RmllbGRWYWx1ZSh0YWIsIGNvbG9yRmllbGQpO1xuICAgICAgICBsZXQga2V5ID0gdmFsICE9PSB1bmRlZmluZWQgJiYgdmFsICE9PSBudWxsID8gU3RyaW5nKHZhbCkgOiBcIlwiO1xuICAgICAgICBpZiAoY29sb3JUcmFuc2Zvcm0pIHtcbiAgICAgICAgICAgIGtleSA9IGFwcGx5VmFsdWVUcmFuc2Zvcm0oa2V5LCBjb2xvclRyYW5zZm9ybSwgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuKTtcbiAgICAgICAgfVxuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkoa2V5LCAwKTtcbiAgICAgIH0gZWxzZSBpZiAoIWdyb3VwQ29sb3IgfHwgZ3JvdXBDb2xvciA9PT0gJ2ZpZWxkJykge1xuICAgICAgICBncm91cENvbG9yID0gY29sb3JGb3JLZXkoYnVja2V0S2V5LCBidWNrZXRzLnNpemUpO1xuICAgICAgfVxuXG4gICAgICBncm91cCA9IHtcbiAgICAgICAgaWQ6IGJ1Y2tldEtleSxcbiAgICAgICAgd2luZG93SWQ6IHRhYi53aW5kb3dJZCxcbiAgICAgICAgbGFiZWw6IFwiXCIsXG4gICAgICAgIGNvbG9yOiBncm91cENvbG9yLFxuICAgICAgICB0YWJzOiBbXSxcbiAgICAgICAgcmVhc29uOiBhcHBsaWVkU3RyYXRlZ2llcy5qb2luKFwiICsgXCIpLFxuICAgICAgICB3aW5kb3dNb2RlOiBlZmZlY3RpdmVNb2RlXG4gICAgICB9O1xuICAgICAgYnVja2V0cy5zZXQoYnVja2V0S2V5LCBncm91cCk7XG4gICAgfVxuICAgIGdyb3VwLnRhYnMucHVzaCh0YWIpO1xuICB9KTtcblxuICBjb25zdCBncm91cHMgPSBBcnJheS5mcm9tKGJ1Y2tldHMudmFsdWVzKCkpO1xuICBncm91cHMuZm9yRWFjaChncm91cCA9PiB7XG4gICAgZ3JvdXAubGFiZWwgPSBnZW5lcmF0ZUxhYmVsKGVmZmVjdGl2ZVN0cmF0ZWdpZXMsIGdyb3VwLnRhYnMsIGFsbFRhYnNNYXApO1xuICB9KTtcblxuICByZXR1cm4gZ3JvdXBzO1xufTtcblxuY29uc3QgY2hlY2tWYWx1ZU1hdGNoID0gKFxuICAgIG9wZXJhdG9yOiBzdHJpbmcsXG4gICAgcmF3VmFsdWU6IGFueSxcbiAgICBydWxlVmFsdWU6IHN0cmluZ1xuKTogeyBpc01hdGNoOiBib29sZWFuOyBtYXRjaE9iajogUmVnRXhwRXhlY0FycmF5IHwgbnVsbCB9ID0+IHtcbiAgICBjb25zdCB2YWx1ZVN0ciA9IHJhd1ZhbHVlICE9PSB1bmRlZmluZWQgJiYgcmF3VmFsdWUgIT09IG51bGwgPyBTdHJpbmcocmF3VmFsdWUpIDogXCJcIjtcbiAgICBjb25zdCB2YWx1ZVRvQ2hlY2sgPSB2YWx1ZVN0ci50b0xvd2VyQ2FzZSgpO1xuICAgIGNvbnN0IHBhdHRlcm5Ub0NoZWNrID0gcnVsZVZhbHVlID8gcnVsZVZhbHVlLnRvTG93ZXJDYXNlKCkgOiBcIlwiO1xuXG4gICAgbGV0IGlzTWF0Y2ggPSBmYWxzZTtcbiAgICBsZXQgbWF0Y2hPYmo6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGwgPSBudWxsO1xuXG4gICAgc3dpdGNoIChvcGVyYXRvcikge1xuICAgICAgICBjYXNlICdjb250YWlucyc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suaW5jbHVkZXMocGF0dGVyblRvQ2hlY2spOyBicmVhaztcbiAgICAgICAgY2FzZSAnZG9lc05vdENvbnRhaW4nOiBpc01hdGNoID0gIXZhbHVlVG9DaGVjay5pbmNsdWRlcyhwYXR0ZXJuVG9DaGVjayk7IGJyZWFrO1xuICAgICAgICBjYXNlICdlcXVhbHMnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrID09PSBwYXR0ZXJuVG9DaGVjazsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3N0YXJ0c1dpdGgnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrLnN0YXJ0c1dpdGgocGF0dGVyblRvQ2hlY2spOyBicmVhaztcbiAgICAgICAgY2FzZSAnZW5kc1dpdGgnOiBpc01hdGNoID0gdmFsdWVUb0NoZWNrLmVuZHNXaXRoKHBhdHRlcm5Ub0NoZWNrKTsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2V4aXN0cyc6IGlzTWF0Y2ggPSByYXdWYWx1ZSAhPT0gdW5kZWZpbmVkOyBicmVhaztcbiAgICAgICAgY2FzZSAnZG9lc05vdEV4aXN0JzogaXNNYXRjaCA9IHJhd1ZhbHVlID09PSB1bmRlZmluZWQ7IGJyZWFrO1xuICAgICAgICBjYXNlICdpc051bGwnOiBpc01hdGNoID0gcmF3VmFsdWUgPT09IG51bGw7IGJyZWFrO1xuICAgICAgICBjYXNlICdpc05vdE51bGwnOiBpc01hdGNoID0gcmF3VmFsdWUgIT09IG51bGw7IGJyZWFrO1xuICAgICAgICBjYXNlICdtYXRjaGVzJzpcbiAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChydWxlVmFsdWUsICdpJyk7XG4gICAgICAgICAgICAgICAgbWF0Y2hPYmogPSByZWdleC5leGVjKHZhbHVlU3RyKTtcbiAgICAgICAgICAgICAgICBpc01hdGNoID0gISFtYXRjaE9iajtcbiAgICAgICAgICAgICB9IGNhdGNoIHsgfVxuICAgICAgICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICByZXR1cm4geyBpc01hdGNoLCBtYXRjaE9iaiB9O1xufTtcblxuZXhwb3J0IGNvbnN0IGNoZWNrQ29uZGl0aW9uID0gKGNvbmRpdGlvbjogUnVsZUNvbmRpdGlvbiwgdGFiOiBUYWJNZXRhZGF0YSk6IGJvb2xlYW4gPT4ge1xuICAgIGlmICghY29uZGl0aW9uKSByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgcmF3VmFsdWUgPSBnZXRGaWVsZFZhbHVlKHRhYiwgY29uZGl0aW9uLmZpZWxkKTtcbiAgICBjb25zdCB7IGlzTWF0Y2ggfSA9IGNoZWNrVmFsdWVNYXRjaChjb25kaXRpb24ub3BlcmF0b3IsIHJhd1ZhbHVlLCBjb25kaXRpb24udmFsdWUpO1xuICAgIHJldHVybiBpc01hdGNoO1xufTtcblxuZXhwb3J0IGNvbnN0IGFwcGx5VmFsdWVUcmFuc2Zvcm0gPSAodmFsOiBzdHJpbmcsIHRyYW5zZm9ybTogc3RyaW5nLCBwYXR0ZXJuPzogc3RyaW5nLCByZXBsYWNlbWVudD86IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgaWYgKCF2YWwgfHwgIXRyYW5zZm9ybSB8fCB0cmFuc2Zvcm0gPT09ICdub25lJykgcmV0dXJuIHZhbDtcblxuICAgIHN3aXRjaCAodHJhbnNmb3JtKSB7XG4gICAgICAgIGNhc2UgJ3N0cmlwVGxkJzpcbiAgICAgICAgICAgIHJldHVybiBzdHJpcFRsZCh2YWwpO1xuICAgICAgICBjYXNlICdsb3dlcmNhc2UnOlxuICAgICAgICAgICAgcmV0dXJuIHZhbC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICBjYXNlICd1cHBlcmNhc2UnOlxuICAgICAgICAgICAgcmV0dXJuIHZhbC50b1VwcGVyQ2FzZSgpO1xuICAgICAgICBjYXNlICdmaXJzdENoYXInOlxuICAgICAgICAgICAgcmV0dXJuIHZhbC5jaGFyQXQoMCk7XG4gICAgICAgIGNhc2UgJ2RvbWFpbic6XG4gICAgICAgICAgICByZXR1cm4gZG9tYWluRnJvbVVybCh2YWwpO1xuICAgICAgICBjYXNlICdob3N0bmFtZSc6XG4gICAgICAgICAgICBjb25zdCBoID0gZ2V0SG9zdG5hbWUodmFsKTtcbiAgICAgICAgICAgIHJldHVybiBoICE9PSBudWxsID8gaCA6IHZhbDtcbiAgICAgICAgY2FzZSAncmVnZXgnOlxuICAgICAgICAgICAgaWYgKHBhdHRlcm4pIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBsZXQgcmVnZXggPSByZWdleENhY2hlLmdldChwYXR0ZXJuKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFyZWdleCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVnZXggPSBuZXcgUmVnRXhwKHBhdHRlcm4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVnZXhDYWNoZS5zZXQocGF0dGVybiwgcmVnZXgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1hdGNoID0gcmVnZXguZXhlYyh2YWwpO1xuICAgICAgICAgICAgICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBleHRyYWN0ZWQgPSBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBtYXRjaC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4dHJhY3RlZCArPSBtYXRjaFtpXSB8fCBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGV4dHJhY3RlZDtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkludmFsaWQgcmVnZXggaW4gdHJhbnNmb3JtXCIsIHsgcGF0dGVybjogcGF0dGVybiwgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgY2FzZSAncmVnZXhSZXBsYWNlJzpcbiAgICAgICAgICAgICBpZiAocGF0dGVybikge1xuICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgLy8gVXNpbmcgJ2cnIGdsb2JhbCBmbGFnIGJ5IGRlZmF1bHQgZm9yIHJlcGxhY2VtZW50XG4gICAgICAgICAgICAgICAgICAgICByZXR1cm4gdmFsLnJlcGxhY2UobmV3IFJlZ0V4cChwYXR0ZXJuLCAnZycpLCByZXBsYWNlbWVudCB8fCBcIlwiKTtcbiAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICAgbG9nRGVidWcoXCJJbnZhbGlkIHJlZ2V4IGluIHRyYW5zZm9ybVwiLCB7IHBhdHRlcm46IHBhdHRlcm4sIGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgICAgICAgICAgICAgICByZXR1cm4gdmFsO1xuICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgfVxuICAgICAgICAgICAgIHJldHVybiB2YWw7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICByZXR1cm4gdmFsO1xuICAgIH1cbn07XG5cbi8qKlxuICogRXZhbHVhdGVzIGxlZ2FjeSBydWxlcyAoc2ltcGxlIEFORC9PUiBjb25kaXRpb25zIHdpdGhvdXQgZ3JvdXBpbmcvZmlsdGVyIHNlcGFyYXRpb24pLlxuICogQGRlcHJlY2F0ZWQgVGhpcyBsb2dpYyBpcyBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eSB3aXRoIG9sZCBjdXN0b20gc3RyYXRlZ2llcy5cbiAqL1xuZnVuY3Rpb24gZXZhbHVhdGVMZWdhY3lSdWxlcyhsZWdhY3lSdWxlczogU3RyYXRlZ3lSdWxlW10sIHRhYjogVGFiTWV0YWRhdGEpOiBzdHJpbmcgfCBudWxsIHtcbiAgICBjb25zdCBsZWdhY3lSdWxlc0xpc3QgPSBhc0FycmF5PFN0cmF0ZWd5UnVsZT4obGVnYWN5UnVsZXMpO1xuICAgIGlmIChsZWdhY3lSdWxlc0xpc3QubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcblxuICAgIHRyeSB7XG4gICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBsZWdhY3lSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgIGlmICghcnVsZSkgY29udGludWU7XG4gICAgICAgICAgICBjb25zdCByYXdWYWx1ZSA9IGdldEZpZWxkVmFsdWUodGFiLCBydWxlLmZpZWxkKTtcbiAgICAgICAgICAgIGNvbnN0IHsgaXNNYXRjaCwgbWF0Y2hPYmogfSA9IGNoZWNrVmFsdWVNYXRjaChydWxlLm9wZXJhdG9yLCByYXdWYWx1ZSwgcnVsZS52YWx1ZSk7XG5cbiAgICAgICAgICAgIGlmIChpc01hdGNoKSB7XG4gICAgICAgICAgICAgICAgbGV0IHJlc3VsdCA9IHJ1bGUucmVzdWx0O1xuICAgICAgICAgICAgICAgIGlmIChtYXRjaE9iaiAmJiBtYXRjaE9iai5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgbWF0Y2hPYmoubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgPSByZXN1bHQucmVwbGFjZShuZXcgUmVnRXhwKGBcXFxcJCR7aX1gLCAnZycpLCBtYXRjaE9ialtpXSB8fCBcIlwiKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgbG9nRGVidWcoXCJFcnJvciBldmFsdWF0aW5nIGxlZ2FjeSBydWxlc1wiLCB7IGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGNvbnN0IGdldEdyb3VwaW5nUmVzdWx0ID0gKHRhYjogVGFiTWV0YWRhdGEsIHN0cmF0ZWd5OiBHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nKTogeyBrZXk6IHN0cmluZyB8IG51bGwsIG1vZGU6IFwiY3VycmVudFwiIHwgXCJuZXdcIiB8IFwiY29tcG91bmRcIiB9ID0+IHtcbiAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3kpO1xuICBpZiAoY3VzdG9tKSB7XG4gICAgICBjb25zdCBmaWx0ZXJHcm91cHNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uW10+KGN1c3RvbS5maWx0ZXJHcm91cHMpO1xuICAgICAgY29uc3QgZmlsdGVyc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGN1c3RvbS5maWx0ZXJzKTtcblxuICAgICAgbGV0IG1hdGNoID0gZmFsc2U7XG5cbiAgICAgIGlmIChmaWx0ZXJHcm91cHNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAvLyBPUiBsb2dpY1xuICAgICAgICAgIGZvciAoY29uc3QgZ3JvdXAgb2YgZmlsdGVyR3JvdXBzTGlzdCkge1xuICAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihncm91cCk7XG4gICAgICAgICAgICAgIGlmIChncm91cFJ1bGVzLmxlbmd0aCA9PT0gMCB8fCBncm91cFJ1bGVzLmV2ZXJ5KHIgPT4gY2hlY2tDb25kaXRpb24ociwgdGFiKSkpIHtcbiAgICAgICAgICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChmaWx0ZXJzTGlzdC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgLy8gTGVnYWN5L1NpbXBsZSBBTkQgbG9naWNcbiAgICAgICAgICBpZiAoZmlsdGVyc0xpc3QuZXZlcnkoZiA9PiBjaGVja0NvbmRpdGlvbihmLCB0YWIpKSkge1xuICAgICAgICAgICAgICBtYXRjaCA9IHRydWU7XG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBObyBmaWx0ZXJzIC0+IE1hdGNoIGFsbFxuICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFtYXRjaCkge1xuICAgICAgICAgIHJldHVybiB7IGtleTogbnVsbCwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZ3JvdXBpbmdSdWxlc0xpc3QgPSBhc0FycmF5PEdyb3VwaW5nUnVsZT4oY3VzdG9tLmdyb3VwaW5nUnVsZXMpO1xuICAgICAgaWYgKGdyb3VwaW5nUnVsZXNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICBjb25zdCBtb2Rlczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwaW5nUnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICBsZXQgdmFsID0gXCJcIjtcbiAgICAgICAgICAgICAgICBpZiAocnVsZS5zb3VyY2UgPT09ICdmaWVsZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJhdyA9IGdldEZpZWxkVmFsdWUodGFiLCBydWxlLnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHJhdyAhPT0gdW5kZWZpbmVkICYmIHJhdyAhPT0gbnVsbCA/IFN0cmluZyhyYXcpIDogXCJcIjtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgdmFsID0gcnVsZS52YWx1ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodmFsICYmIHJ1bGUudHJhbnNmb3JtICYmIHJ1bGUudHJhbnNmb3JtICE9PSAnbm9uZScpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFsID0gYXBwbHlWYWx1ZVRyYW5zZm9ybSh2YWwsIHJ1bGUudHJhbnNmb3JtLCBydWxlLnRyYW5zZm9ybVBhdHRlcm4sIHJ1bGUudHJhbnNmb3JtUmVwbGFjZW1lbnQpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh2YWwpIHtcbiAgICAgICAgICAgICAgICAgICAgcGFydHMucHVzaCh2YWwpO1xuICAgICAgICAgICAgICAgICAgICBpZiAocnVsZS53aW5kb3dNb2RlKSBtb2Rlcy5wdXNoKHJ1bGUud2luZG93TW9kZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGFwcGx5aW5nIGdyb3VwaW5nIHJ1bGVzXCIsIHsgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICByZXR1cm4geyBrZXk6IHBhcnRzLmpvaW4oXCIgLSBcIiksIG1vZGU6IHJlc29sdmVXaW5kb3dNb2RlKG1vZGVzKSB9O1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4geyBrZXk6IGN1c3RvbS5mYWxsYmFjayB8fCBcIk1pc2NcIiwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH0gZWxzZSBpZiAoY3VzdG9tLnJ1bGVzKSB7XG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0gZXZhbHVhdGVMZWdhY3lSdWxlcyhhc0FycmF5PFN0cmF0ZWd5UnVsZT4oY3VzdG9tLnJ1bGVzKSwgdGFiKTtcbiAgICAgICAgICBpZiAocmVzdWx0KSByZXR1cm4geyBrZXk6IHJlc3VsdCwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHsga2V5OiBjdXN0b20uZmFsbGJhY2sgfHwgXCJNaXNjXCIsIG1vZGU6IFwiY3VycmVudFwiIH07XG4gIH1cblxuICAvLyBCdWlsdC1pbiBzdHJhdGVnaWVzXG4gIGxldCBzaW1wbGVLZXk6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBzd2l0Y2ggKHN0cmF0ZWd5KSB7XG4gICAgY2FzZSBcImRvbWFpblwiOlxuICAgIGNhc2UgXCJkb21haW5fZnVsbFwiOlxuICAgICAgc2ltcGxlS2V5ID0gZG9tYWluRnJvbVVybCh0YWIudXJsKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJ0b3BpY1wiOlxuICAgICAgc2ltcGxlS2V5ID0gc2VtYW50aWNCdWNrZXQodGFiLnRpdGxlLCB0YWIudXJsKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJsaW5lYWdlXCI6XG4gICAgICBzaW1wbGVLZXkgPSBuYXZpZ2F0aW9uS2V5KHRhYik7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwiY29udGV4dFwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLmNvbnRleHQgfHwgXCJVbmNhdGVnb3JpemVkXCI7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwicGlubmVkXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIucGlubmVkID8gXCJwaW5uZWRcIiA6IFwidW5waW5uZWRcIjtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJhZ2VcIjpcbiAgICAgIHNpbXBsZUtleSA9IGdldFJlY2VuY3lMYWJlbCh0YWIubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInVybFwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLnVybDtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJ0aXRsZVwiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLnRpdGxlO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInJlY2VuY3lcIjpcbiAgICAgIHNpbXBsZUtleSA9IFN0cmluZyh0YWIubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcIm5lc3RpbmdcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkID8gXCJjaGlsZFwiIDogXCJyb290XCI7XG4gICAgICBicmVhaztcbiAgICBkZWZhdWx0OlxuICAgICAgICBjb25zdCB2YWwgPSBnZXRGaWVsZFZhbHVlKHRhYiwgc3RyYXRlZ3kpO1xuICAgICAgICBpZiAodmFsICE9PSB1bmRlZmluZWQgJiYgdmFsICE9PSBudWxsKSB7XG4gICAgICAgICAgICBzaW1wbGVLZXkgPSBTdHJpbmcodmFsKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNpbXBsZUtleSA9IFwiVW5rbm93blwiO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICB9XG4gIHJldHVybiB7IGtleTogc2ltcGxlS2V5LCBtb2RlOiBcImN1cnJlbnRcIiB9O1xufTtcblxuZXhwb3J0IGNvbnN0IGdyb3VwaW5nS2V5ID0gKHRhYjogVGFiTWV0YWRhdGEsIHN0cmF0ZWd5OiBHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nKTogc3RyaW5nIHwgbnVsbCA9PiB7XG4gICAgcmV0dXJuIGdldEdyb3VwaW5nUmVzdWx0KHRhYiwgc3RyYXRlZ3kpLmtleTtcbn07XG5cbmZ1bmN0aW9uIGlzQ29udGV4dEZpZWxkKGZpZWxkOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICByZXR1cm4gZmllbGQgPT09ICdjb250ZXh0JyB8fCBmaWVsZCA9PT0gJ2dlbnJlJyB8fCBmaWVsZCA9PT0gJ3NpdGVOYW1lJyB8fCBmaWVsZC5zdGFydHNXaXRoKCdjb250ZXh0RGF0YS4nKTtcbn1cblxuZXhwb3J0IGNvbnN0IHJlcXVpcmVzQ29udGV4dEFuYWx5c2lzID0gKHN0cmF0ZWd5SWRzOiAoc3RyaW5nIHwgU29ydGluZ1N0cmF0ZWd5KVtdKTogYm9vbGVhbiA9PiB7XG4gICAgLy8gQ2hlY2sgaWYgXCJjb250ZXh0XCIgc3RyYXRlZ3kgaXMgZXhwbGljaXRseSByZXF1ZXN0ZWRcbiAgICBpZiAoc3RyYXRlZ3lJZHMuaW5jbHVkZXMoXCJjb250ZXh0XCIpKSByZXR1cm4gdHJ1ZTtcblxuICAgIGNvbnN0IHN0cmF0ZWdpZXMgPSBnZXRTdHJhdGVnaWVzKGN1c3RvbVN0cmF0ZWdpZXMpO1xuICAgIC8vIGZpbHRlciBvbmx5IHRob3NlIHRoYXQgbWF0Y2ggdGhlIHJlcXVlc3RlZCBJRHNcbiAgICBjb25zdCBhY3RpdmVEZWZzID0gc3RyYXRlZ2llcy5maWx0ZXIocyA9PiBzdHJhdGVneUlkcy5pbmNsdWRlcyhzLmlkKSk7XG5cbiAgICBmb3IgKGNvbnN0IGRlZiBvZiBhY3RpdmVEZWZzKSB7XG4gICAgICAgIC8vIElmIGl0J3MgYSBidWlsdC1pbiBzdHJhdGVneSB0aGF0IG5lZWRzIGNvbnRleHQgKG9ubHkgJ2NvbnRleHQnIGRvZXMpXG4gICAgICAgIGlmIChkZWYuaWQgPT09ICdjb250ZXh0JykgcmV0dXJuIHRydWU7XG5cbiAgICAgICAgLy8gSWYgaXQgaXMgYSBjdXN0b20gc3RyYXRlZ3kgKG9yIG92ZXJyaWRlcyBidWlsdC1pbiksIGNoZWNrIGl0cyBydWxlc1xuICAgICAgICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQoYyA9PiBjLmlkID09PSBkZWYuaWQpO1xuICAgICAgICBpZiAoY3VzdG9tKSB7XG4gICAgICAgICAgICAgY29uc3QgZ3JvdXBSdWxlc0xpc3QgPSBhc0FycmF5PEdyb3VwaW5nUnVsZT4oY3VzdG9tLmdyb3VwaW5nUnVsZXMpO1xuICAgICAgICAgICAgIGNvbnN0IHNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihjdXN0b20uc29ydGluZ1J1bGVzKTtcbiAgICAgICAgICAgICBjb25zdCBncm91cFNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihjdXN0b20uZ3JvdXBTb3J0aW5nUnVsZXMpO1xuICAgICAgICAgICAgIGNvbnN0IGZpbHRlcnNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihjdXN0b20uZmlsdGVycyk7XG4gICAgICAgICAgICAgY29uc3QgZmlsdGVyR3JvdXBzTGlzdCA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbltdPihjdXN0b20uZmlsdGVyR3JvdXBzKTtcblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBydWxlLnNvdXJjZSA9PT0gJ2ZpZWxkJyAmJiBpc0NvbnRleHRGaWVsZChydWxlLnZhbHVlKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIHJ1bGUuY29sb3IgPT09ICdmaWVsZCcgJiYgcnVsZS5jb2xvckZpZWxkICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuY29sb3JGaWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBzb3J0UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZ3JvdXBTb3J0UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZmlsdGVyc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgZ3JvdXAgb2YgZmlsdGVyR3JvdXBzTGlzdCkge1xuICAgICAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uPihncm91cCk7XG4gICAgICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFJ1bGVzKSB7XG4gICAgICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBpc0NvbnRleHRGaWVsZChydWxlLmZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufTtcbiIsICJpbXBvcnQgeyBTb3J0aW5nU3RyYXRlZ3ksIFRhYk1ldGFkYXRhLCBDdXN0b21TdHJhdGVneSwgU29ydGluZ1J1bGUgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBkb21haW5Gcm9tVXJsLCBzZW1hbnRpY0J1Y2tldCwgbmF2aWdhdGlvbktleSwgZ3JvdXBpbmdLZXksIGdldEZpZWxkVmFsdWUsIGdldEN1c3RvbVN0cmF0ZWdpZXMgfSBmcm9tIFwiLi9ncm91cGluZ1N0cmF0ZWdpZXMuanNcIjtcbmltcG9ydCB7IGxvZ0RlYnVnIH0gZnJvbSBcIi4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tIFwiLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5cbi8vIEhlbHBlciBzY29yZXNcbmV4cG9ydCBjb25zdCByZWNlbmN5U2NvcmUgPSAodGFiOiBUYWJNZXRhZGF0YSkgPT4gdGFiLmxhc3RBY2Nlc3NlZCA/PyAwO1xuZXhwb3J0IGNvbnN0IGhpZXJhcmNoeVNjb3JlID0gKHRhYjogVGFiTWV0YWRhdGEpID0+ICh0YWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCA/IDEgOiAwKTtcbmV4cG9ydCBjb25zdCBwaW5uZWRTY29yZSA9ICh0YWI6IFRhYk1ldGFkYXRhKSA9PiAodGFiLnBpbm5lZCA/IDAgOiAxKTtcblxudHlwZSBDb21wYXJhdG9yID0gKGE6IFRhYk1ldGFkYXRhLCBiOiBUYWJNZXRhZGF0YSkgPT4gbnVtYmVyO1xuXG4vLyAtLS0gQnVpbHQtaW4gQ29tcGFyYXRvcnMgLS0tXG5cbmNvbnN0IGNvbXBhcmVSZWNlbmN5OiBDb21wYXJhdG9yID0gKGEsIGIpID0+IChiLmxhc3RBY2Nlc3NlZCA/PyAwKSAtIChhLmxhc3RBY2Nlc3NlZCA/PyAwKTtcbmNvbnN0IGNvbXBhcmVOZXN0aW5nOiBDb21wYXJhdG9yID0gKGEsIGIpID0+IGhpZXJhcmNoeVNjb3JlKGEpIC0gaGllcmFyY2h5U2NvcmUoYik7XG5jb25zdCBjb21wYXJlUGlubmVkOiBDb21wYXJhdG9yID0gKGEsIGIpID0+IHBpbm5lZFNjb3JlKGEpIC0gcGlubmVkU2NvcmUoYik7XG5jb25zdCBjb21wYXJlVGl0bGU6IENvbXBhcmF0b3IgPSAoYSwgYikgPT4gYS50aXRsZS5sb2NhbGVDb21wYXJlKGIudGl0bGUpO1xuY29uc3QgY29tcGFyZVVybDogQ29tcGFyYXRvciA9IChhLCBiKSA9PiBhLnVybC5sb2NhbGVDb21wYXJlKGIudXJsKTtcbmNvbnN0IGNvbXBhcmVDb250ZXh0OiBDb21wYXJhdG9yID0gKGEsIGIpID0+IChhLmNvbnRleHQgPz8gXCJcIikubG9jYWxlQ29tcGFyZShiLmNvbnRleHQgPz8gXCJcIik7XG5jb25zdCBjb21wYXJlRG9tYWluOiBDb21wYXJhdG9yID0gKGEsIGIpID0+IGRvbWFpbkZyb21VcmwoYS51cmwpLmxvY2FsZUNvbXBhcmUoZG9tYWluRnJvbVVybChiLnVybCkpO1xuY29uc3QgY29tcGFyZVRvcGljOiBDb21wYXJhdG9yID0gKGEsIGIpID0+IHNlbWFudGljQnVja2V0KGEudGl0bGUsIGEudXJsKS5sb2NhbGVDb21wYXJlKHNlbWFudGljQnVja2V0KGIudGl0bGUsIGIudXJsKSk7XG5jb25zdCBjb21wYXJlTGluZWFnZTogQ29tcGFyYXRvciA9IChhLCBiKSA9PiBuYXZpZ2F0aW9uS2V5KGEpLmxvY2FsZUNvbXBhcmUobmF2aWdhdGlvbktleShiKSk7XG5jb25zdCBjb21wYXJlQWdlOiBDb21wYXJhdG9yID0gKGEsIGIpID0+IChncm91cGluZ0tleShhLCBcImFnZVwiKSB8fCBcIlwiKS5sb2NhbGVDb21wYXJlKGdyb3VwaW5nS2V5KGIsIFwiYWdlXCIpIHx8IFwiXCIpO1xuXG5jb25zdCBzdHJhdGVneVJlZ2lzdHJ5OiBSZWNvcmQ8c3RyaW5nLCBDb21wYXJhdG9yPiA9IHtcbiAgcmVjZW5jeTogY29tcGFyZVJlY2VuY3ksXG4gIG5lc3Rpbmc6IGNvbXBhcmVOZXN0aW5nLFxuICBwaW5uZWQ6IGNvbXBhcmVQaW5uZWQsXG4gIHRpdGxlOiBjb21wYXJlVGl0bGUsXG4gIHVybDogY29tcGFyZVVybCxcbiAgY29udGV4dDogY29tcGFyZUNvbnRleHQsXG4gIGRvbWFpbjogY29tcGFyZURvbWFpbixcbiAgZG9tYWluX2Z1bGw6IGNvbXBhcmVEb21haW4sXG4gIHRvcGljOiBjb21wYXJlVG9waWMsXG4gIGxpbmVhZ2U6IGNvbXBhcmVMaW5lYWdlLFxuICBhZ2U6IGNvbXBhcmVBZ2UsXG59O1xuXG4vLyAtLS0gQ3VzdG9tIFN0cmF0ZWd5IEV2YWx1YXRpb24gLS0tXG5cbmNvbnN0IGV2YWx1YXRlQ3VzdG9tU3RyYXRlZ3kgPSAoc3RyYXRlZ3k6IHN0cmluZywgYTogVGFiTWV0YWRhdGEsIGI6IFRhYk1ldGFkYXRhKTogbnVtYmVyIHwgbnVsbCA9PiB7XG4gIGNvbnN0IGN1c3RvbVN0cmF0cyA9IGdldEN1c3RvbVN0cmF0ZWdpZXMoKTtcbiAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneSk7XG5cbiAgaWYgKCFjdXN0b20pIHJldHVybiBudWxsO1xuXG4gIGNvbnN0IHNvcnRSdWxlc0xpc3QgPSBhc0FycmF5PFNvcnRpbmdSdWxlPihjdXN0b20uc29ydGluZ1J1bGVzKTtcbiAgaWYgKHNvcnRSdWxlc0xpc3QubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcblxuICB0cnkge1xuICAgICAgZm9yIChjb25zdCBydWxlIG9mIHNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICBpZiAoIXJ1bGUpIGNvbnRpbnVlO1xuICAgICAgICAgIGNvbnN0IHZhbEEgPSBnZXRGaWVsZFZhbHVlKGEsIHJ1bGUuZmllbGQpO1xuICAgICAgICAgIGNvbnN0IHZhbEIgPSBnZXRGaWVsZFZhbHVlKGIsIHJ1bGUuZmllbGQpO1xuXG4gICAgICAgICAgbGV0IHJlc3VsdCA9IDA7XG4gICAgICAgICAgaWYgKHZhbEEgPCB2YWxCKSByZXN1bHQgPSAtMTtcbiAgICAgICAgICBlbHNlIGlmICh2YWxBID4gdmFsQikgcmVzdWx0ID0gMTtcblxuICAgICAgICAgIGlmIChyZXN1bHQgIT09IDApIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHJ1bGUub3JkZXIgPT09ICdkZXNjJyA/IC1yZXN1bHQgOiByZXN1bHQ7XG4gICAgICAgICAgfVxuICAgICAgfVxuICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2dEZWJ1ZyhcIkVycm9yIGV2YWx1YXRpbmcgY3VzdG9tIHNvcnRpbmcgcnVsZXNcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICB9XG5cbiAgLy8gSWYgcnVsZXMgZXhpc3QgYnV0IGFsbCBlcXVhbCwgcmV0dXJuIDAgKHRpZSlcbiAgcmV0dXJuIDA7XG59O1xuXG4vLyAtLS0gR2VuZXJpYyBGYWxsYmFjayAtLS1cblxuY29uc3QgZXZhbHVhdGVHZW5lcmljU3RyYXRlZ3kgPSAoc3RyYXRlZ3k6IHN0cmluZywgYTogVGFiTWV0YWRhdGEsIGI6IFRhYk1ldGFkYXRhKTogbnVtYmVyID0+IHtcbiAgICAvLyBDaGVjayBpZiBpdCdzIGEgZ2VuZXJpYyBmaWVsZCBmaXJzdFxuICAgIGNvbnN0IHZhbEEgPSBnZXRGaWVsZFZhbHVlKGEsIHN0cmF0ZWd5KTtcbiAgICBjb25zdCB2YWxCID0gZ2V0RmllbGRWYWx1ZShiLCBzdHJhdGVneSk7XG5cbiAgICBpZiAodmFsQSAhPT0gdW5kZWZpbmVkICYmIHZhbEIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBpZiAodmFsQSA8IHZhbEIpIHJldHVybiAtMTtcbiAgICAgICAgaWYgKHZhbEEgPiB2YWxCKSByZXR1cm4gMTtcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgfVxuXG4gICAgLy8gRmFsbGJhY2sgZm9yIGN1c3RvbSBzdHJhdGVnaWVzIGdyb3VwaW5nIGtleSAoaWYgdXNpbmcgY3VzdG9tIHN0cmF0ZWd5IGFzIHNvcnRpbmcgYnV0IG5vIHNvcnRpbmcgcnVsZXMgZGVmaW5lZClcbiAgICAvLyBvciB1bmhhbmRsZWQgYnVpbHQtaW5zXG4gICAgcmV0dXJuIChncm91cGluZ0tleShhLCBzdHJhdGVneSkgfHwgXCJcIikubG9jYWxlQ29tcGFyZShncm91cGluZ0tleShiLCBzdHJhdGVneSkgfHwgXCJcIik7XG59O1xuXG4vLyAtLS0gTWFpbiBFeHBvcnQgLS0tXG5cbmV4cG9ydCBjb25zdCBjb21wYXJlQnkgPSAoc3RyYXRlZ3k6IFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZywgYTogVGFiTWV0YWRhdGEsIGI6IFRhYk1ldGFkYXRhKTogbnVtYmVyID0+IHtcbiAgLy8gMS4gQ3VzdG9tIFN0cmF0ZWd5ICh0YWtlcyBwcmVjZWRlbmNlIGlmIHJ1bGVzIGV4aXN0KVxuICBjb25zdCBjdXN0b21EaWZmID0gZXZhbHVhdGVDdXN0b21TdHJhdGVneShzdHJhdGVneSwgYSwgYik7XG4gIGlmIChjdXN0b21EaWZmICE9PSBudWxsKSB7XG4gICAgICByZXR1cm4gY3VzdG9tRGlmZjtcbiAgfVxuXG4gIC8vIDIuIEJ1aWx0LWluIHJlZ2lzdHJ5XG4gIGNvbnN0IGJ1aWx0SW4gPSBzdHJhdGVneVJlZ2lzdHJ5W3N0cmF0ZWd5XTtcbiAgaWYgKGJ1aWx0SW4pIHtcbiAgICByZXR1cm4gYnVpbHRJbihhLCBiKTtcbiAgfVxuXG4gIC8vIDMuIEdlbmVyaWMvRmFsbGJhY2tcbiAgcmV0dXJuIGV2YWx1YXRlR2VuZXJpY1N0cmF0ZWd5KHN0cmF0ZWd5LCBhLCBiKTtcbn07XG5cbmV4cG9ydCBjb25zdCBzb3J0VGFicyA9ICh0YWJzOiBUYWJNZXRhZGF0YVtdLCBzdHJhdGVnaWVzOiBTb3J0aW5nU3RyYXRlZ3lbXSk6IFRhYk1ldGFkYXRhW10gPT4ge1xuICBjb25zdCBzY29yaW5nOiBTb3J0aW5nU3RyYXRlZ3lbXSA9IHN0cmF0ZWdpZXMubGVuZ3RoID8gc3RyYXRlZ2llcyA6IFtcInBpbm5lZFwiLCBcInJlY2VuY3lcIl07XG4gIHJldHVybiBbLi4udGFic10uc29ydCgoYSwgYikgPT4ge1xuICAgIGZvciAoY29uc3Qgc3RyYXRlZ3kgb2Ygc2NvcmluZykge1xuICAgICAgY29uc3QgZGlmZiA9IGNvbXBhcmVCeShzdHJhdGVneSwgYSwgYik7XG4gICAgICBpZiAoZGlmZiAhPT0gMCkgcmV0dXJuIGRpZmY7XG4gICAgfVxuICAgIHJldHVybiBhLmlkIC0gYi5pZDtcbiAgfSk7XG59O1xuIiwgImltcG9ydCB7XG4gIEFwcGx5R3JvdXBpbmdQYXlsb2FkLFxuICBHcm91cGluZ1NlbGVjdGlvbixcbiAgUHJlZmVyZW5jZXMsXG4gIFJ1bnRpbWVNZXNzYWdlLFxuICBSdW50aW1lUmVzcG9uc2UsXG4gIFNhdmVkU3RhdGUsXG4gIFNvcnRpbmdTdHJhdGVneSxcbiAgVGFiR3JvdXAsXG4gIFRhYk1ldGFkYXRhXG59IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGZldGNoTG9jYWxTdGF0ZSB9IGZyb20gXCIuL2xvY2FsU3RhdGUuanNcIjtcbmltcG9ydCB7IGdldEhvc3RuYW1lIH0gZnJvbSBcIi4uL3NoYXJlZC91cmxDYWNoZS5qc1wiO1xuXG5leHBvcnQgY29uc3Qgc2VuZE1lc3NhZ2UgPSBhc3luYyA8VERhdGE+KHR5cGU6IFJ1bnRpbWVNZXNzYWdlW1widHlwZVwiXSwgcGF5bG9hZD86IGFueSk6IFByb21pc2U8UnVudGltZVJlc3BvbnNlPFREYXRhPj4gPT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGUsIHBheWxvYWQgfSwgKHJlc3BvbnNlKSA9PiB7XG4gICAgICBpZiAoY2hyb21lLnJ1bnRpbWUubGFzdEVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJSdW50aW1lIGVycm9yOlwiLCBjaHJvbWUucnVudGltZS5sYXN0RXJyb3IpO1xuICAgICAgICByZXNvbHZlKHsgb2s6IGZhbHNlLCBlcnJvcjogY2hyb21lLnJ1bnRpbWUubGFzdEVycm9yLm1lc3NhZ2UgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXNvbHZlKHJlc3BvbnNlIHx8IHsgb2s6IGZhbHNlLCBlcnJvcjogXCJObyByZXNwb25zZSBmcm9tIGJhY2tncm91bmRcIiB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSk7XG59O1xuXG5leHBvcnQgdHlwZSBUYWJXaXRoR3JvdXAgPSBUYWJNZXRhZGF0YSAmIHtcbiAgZ3JvdXBMYWJlbD86IHN0cmluZztcbiAgZ3JvdXBDb2xvcj86IHN0cmluZztcbiAgcmVhc29uPzogc3RyaW5nO1xufTtcblxuZXhwb3J0IGludGVyZmFjZSBXaW5kb3dWaWV3IHtcbiAgaWQ6IG51bWJlcjtcbiAgdGl0bGU6IHN0cmluZztcbiAgdGFiczogVGFiV2l0aEdyb3VwW107XG4gIHRhYkNvdW50OiBudW1iZXI7XG4gIGdyb3VwQ291bnQ6IG51bWJlcjtcbiAgcGlubmVkQ291bnQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IElDT05TID0ge1xuICBhY3RpdmU6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cG9seWdvbiBwb2ludHM9XCIzIDExIDIyIDIgMTMgMjEgMTEgMTMgMyAxMVwiPjwvcG9seWdvbj48L3N2Zz5gLFxuICBoaWRlOiBgPHN2ZyB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBhdGggZD1cIk0xNy45NCAxNy45NEExMC4wNyAxMC4wNyAwIDAgMSAxMiAyMGMtNyAwLTExLTgtMTEtOGExOC40NSAxOC40NSAwIDAgMSA1LjA2LTUuOTRNOS45IDQuMjRBOS4xMiA5LjEyIDAgMCAxIDEyIDRjNyAwIDExIDggMTEgOGExOC41IDE4LjUgMCAwIDEtMi4xNiAzLjE5bS02LjcyLTEuMDdhMyAzIDAgMSAxLTQuMjQtNC4yNFwiPjwvcGF0aD48bGluZSB4MT1cIjFcIiB5MT1cIjFcIiB4Mj1cIjIzXCIgeTI9XCIyM1wiPjwvbGluZT48L3N2Zz5gLFxuICBzaG93OiBgPHN2ZyB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBhdGggZD1cIk0xIDEyczQtOCAxMS04IDExIDggMTEgOC00IDgtMTEgOC0xMS04LTExLTgtMTEtOHpcIj48L3BhdGg+PGNpcmNsZSBjeD1cIjEyXCIgY3k9XCIxMlwiIHI9XCIzXCI+PC9jaXJjbGU+PC9zdmc+YCxcbiAgZm9jdXM6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjEwXCI+PC9jaXJjbGU+PGNpcmNsZSBjeD1cIjEyXCIgY3k9XCIxMlwiIHI9XCI2XCI+PC9jaXJjbGU+PGNpcmNsZSBjeD1cIjEyXCIgY3k9XCIxMlwiIHI9XCIyXCI+PC9jaXJjbGU+PC9zdmc+YCxcbiAgY2xvc2U6IGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48bGluZSB4MT1cIjE4XCIgeTE9XCI2XCIgeDI9XCI2XCIgeTI9XCIxOFwiPjwvbGluZT48bGluZSB4MT1cIjZcIiB5MT1cIjZcIiB4Mj1cIjE4XCIgeTI9XCIxOFwiPjwvbGluZT48L3N2Zz5gLFxuICB1bmdyb3VwOiBgPHN2ZyB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PGNpcmNsZSBjeD1cIjEyXCIgY3k9XCIxMlwiIHI9XCIxMFwiPjwvY2lyY2xlPjxsaW5lIHgxPVwiOFwiIHkxPVwiMTJcIiB4Mj1cIjE2XCIgeTI9XCIxMlwiPjwvbGluZT48L3N2Zz5gLFxuICBkZWZhdWx0RmlsZTogYDxzdmcgd2lkdGg9XCIyNFwiIGhlaWdodD1cIjI0XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwYXRoIGQ9XCJNMTQgMkg2YTIgMiAwIDAgMC0yIDJ2MTZhMiAyIDAgMCAwIDIgMmgxMmEyIDIgMCAwIDAgMi0yVjh6XCI+PC9wYXRoPjxwb2x5bGluZSBwb2ludHM9XCIxNCAyIDE0IDggMjAgOFwiPjwvcG9seWxpbmU+PGxpbmUgeDE9XCIxNlwiIHkxPVwiMTNcIiB4Mj1cIjhcIiB5Mj1cIjEzXCI+PC9saW5lPjxsaW5lIHgxPVwiMTZcIiB5MT1cIjE3XCIgeDI9XCI4XCIgeTI9XCIxN1wiPjwvbGluZT48cG9seWxpbmUgcG9pbnRzPVwiMTAgOSA5IDkgOCA5XCI+PC9wb2x5bGluZT48L3N2Zz5gLFxuICBhdXRvUnVuOiBgPHN2ZyB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBvbHlnb24gcG9pbnRzPVwiMTMgMiAzIDE0IDEyIDE0IDExIDIyIDIxIDEwIDEyIDEwIDEzIDJcIj48L3BvbHlnb24+PC9zdmc+YFxufTtcblxuZXhwb3J0IGNvbnN0IEdST1VQX0NPTE9SUzogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgZ3JleTogXCIjNjQ3NDhiXCIsXG4gIGJsdWU6IFwiIzNiODJmNlwiLFxuICByZWQ6IFwiI2VmNDQ0NFwiLFxuICB5ZWxsb3c6IFwiI2VhYjMwOFwiLFxuICBncmVlbjogXCIjMjJjNTVlXCIsXG4gIHBpbms6IFwiI2VjNDg5OVwiLFxuICBwdXJwbGU6IFwiI2E4NTVmN1wiLFxuICBjeWFuOiBcIiMwNmI2ZDRcIixcbiAgb3JhbmdlOiBcIiNmOTczMTZcIlxufTtcblxuZXhwb3J0IGNvbnN0IGdldEdyb3VwQ29sb3IgPSAobmFtZTogc3RyaW5nKSA9PiBHUk9VUF9DT0xPUlNbbmFtZV0gfHwgXCIjY2JkNWUxXCI7XG5cbmV4cG9ydCBjb25zdCBmZXRjaFN0YXRlID0gYXN5bmMgKCkgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgc2VuZE1lc3NhZ2U8eyBncm91cHM6IFRhYkdyb3VwW107IHByZWZlcmVuY2VzOiBQcmVmZXJlbmNlcyB9PihcImdldFN0YXRlXCIpO1xuICAgIGlmIChyZXNwb25zZS5vayAmJiByZXNwb25zZS5kYXRhKSB7XG4gICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgfVxuICAgIGNvbnNvbGUud2FybihcImZldGNoU3RhdGUgZmFpbGVkLCB1c2luZyBmYWxsYmFjazpcIiwgcmVzcG9uc2UuZXJyb3IpO1xuICAgIHJldHVybiBhd2FpdCBmZXRjaExvY2FsU3RhdGUoKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGNvbnNvbGUud2FybihcImZldGNoU3RhdGUgdGhyZXcgZXhjZXB0aW9uLCB1c2luZyBmYWxsYmFjazpcIiwgZSk7XG4gICAgcmV0dXJuIGF3YWl0IGZldGNoTG9jYWxTdGF0ZSgpO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgYXBwbHlHcm91cGluZyA9IGFzeW5jIChwYXlsb2FkOiBBcHBseUdyb3VwaW5nUGF5bG9hZCkgPT4ge1xuICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogXCJhcHBseUdyb3VwaW5nXCIsIHBheWxvYWQgfSk7XG4gIHJldHVybiByZXNwb25zZSBhcyBSdW50aW1lUmVzcG9uc2U8dW5rbm93bj47XG59O1xuXG5leHBvcnQgY29uc3QgYXBwbHlTb3J0aW5nID0gYXN5bmMgKHBheWxvYWQ6IEFwcGx5R3JvdXBpbmdQYXlsb2FkKSA9PiB7XG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcImFwcGx5U29ydGluZ1wiLCBwYXlsb2FkIH0pO1xuICByZXR1cm4gcmVzcG9uc2UgYXMgUnVudGltZVJlc3BvbnNlPHVua25vd24+O1xufTtcblxuZXhwb3J0IGNvbnN0IG1hcFdpbmRvd3MgPSAoZ3JvdXBzOiBUYWJHcm91cFtdLCB3aW5kb3dUaXRsZXM6IE1hcDxudW1iZXIsIHN0cmluZz4pOiBXaW5kb3dWaWV3W10gPT4ge1xuICBjb25zdCB3aW5kb3dzID0gbmV3IE1hcDxudW1iZXIsIFRhYldpdGhHcm91cFtdPigpO1xuXG4gIGdyb3Vwcy5mb3JFYWNoKChncm91cCkgPT4ge1xuICAgIGNvbnN0IGlzVW5ncm91cGVkID0gZ3JvdXAucmVhc29uID09PSBcIlVuZ3JvdXBlZFwiO1xuICAgIGdyb3VwLnRhYnMuZm9yRWFjaCgodGFiKSA9PiB7XG4gICAgICBjb25zdCBkZWNvcmF0ZWQ6IFRhYldpdGhHcm91cCA9IHtcbiAgICAgICAgLi4udGFiLFxuICAgICAgICBncm91cExhYmVsOiBpc1VuZ3JvdXBlZCA/IHVuZGVmaW5lZCA6IGdyb3VwLmxhYmVsLFxuICAgICAgICBncm91cENvbG9yOiBpc1VuZ3JvdXBlZCA/IHVuZGVmaW5lZCA6IGdyb3VwLmNvbG9yLFxuICAgICAgICByZWFzb246IGdyb3VwLnJlYXNvblxuICAgICAgfTtcbiAgICAgIGNvbnN0IGV4aXN0aW5nID0gd2luZG93cy5nZXQodGFiLndpbmRvd0lkKSA/PyBbXTtcbiAgICAgIGV4aXN0aW5nLnB1c2goZGVjb3JhdGVkKTtcbiAgICAgIHdpbmRvd3Muc2V0KHRhYi53aW5kb3dJZCwgZXhpc3RpbmcpO1xuICAgIH0pO1xuICB9KTtcblxuICByZXR1cm4gQXJyYXkuZnJvbSh3aW5kb3dzLmVudHJpZXMoKSlcbiAgICAubWFwPFdpbmRvd1ZpZXc+KChbaWQsIHRhYnNdKSA9PiB7XG4gICAgICBjb25zdCBncm91cENvdW50ID0gbmV3IFNldCh0YWJzLm1hcCgodGFiKSA9PiB0YWIuZ3JvdXBMYWJlbCkuZmlsdGVyKChsKTogbCBpcyBzdHJpbmcgPT4gISFsKSkuc2l6ZTtcbiAgICAgIGNvbnN0IHBpbm5lZENvdW50ID0gdGFicy5maWx0ZXIoKHRhYikgPT4gdGFiLnBpbm5lZCkubGVuZ3RoO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgaWQsXG4gICAgICAgIHRpdGxlOiB3aW5kb3dUaXRsZXMuZ2V0KGlkKSA/PyBgV2luZG93ICR7aWR9YCxcbiAgICAgICAgdGFicyxcbiAgICAgICAgdGFiQ291bnQ6IHRhYnMubGVuZ3RoLFxuICAgICAgICBncm91cENvdW50LFxuICAgICAgICBwaW5uZWRDb3VudFxuICAgICAgfTtcbiAgICB9KVxuICAgIC5zb3J0KChhLCBiKSA9PiBhLmlkIC0gYi5pZCk7XG59O1xuXG5leHBvcnQgY29uc3QgZm9ybWF0RG9tYWluID0gKHVybDogc3RyaW5nKSA9PiB7XG4gIGNvbnN0IGhvc3RuYW1lID0gZ2V0SG9zdG5hbWUodXJsKTtcbiAgaWYgKGhvc3RuYW1lKSB7XG4gICAgcmV0dXJuIGhvc3RuYW1lLnJlcGxhY2UoL153d3dcXC4vLCBcIlwiKTtcbiAgfVxuICByZXR1cm4gdXJsO1xufTtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldERyYWdBZnRlckVsZW1lbnQoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgeTogbnVtYmVyLCBzZWxlY3Rvcjogc3RyaW5nKSB7XG4gIGNvbnN0IGRyYWdnYWJsZUVsZW1lbnRzID0gQXJyYXkuZnJvbShjb250YWluZXIucXVlcnlTZWxlY3RvckFsbChzZWxlY3RvcikpO1xuXG4gIHJldHVybiBkcmFnZ2FibGVFbGVtZW50cy5yZWR1Y2UoKGNsb3Nlc3QsIGNoaWxkKSA9PiB7XG4gICAgY29uc3QgYm94ID0gY2hpbGQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgY29uc3Qgb2Zmc2V0ID0geSAtIGJveC50b3AgLSBib3guaGVpZ2h0IC8gMjtcbiAgICBpZiAob2Zmc2V0IDwgMCAmJiBvZmZzZXQgPiBjbG9zZXN0Lm9mZnNldCkge1xuICAgICAgcmV0dXJuIHsgb2Zmc2V0OiBvZmZzZXQsIGVsZW1lbnQ6IGNoaWxkIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBjbG9zZXN0O1xuICAgIH1cbiAgfSwgeyBvZmZzZXQ6IE51bWJlci5ORUdBVElWRV9JTkZJTklUWSwgZWxlbWVudDogbnVsbCBhcyBFbGVtZW50IHwgbnVsbCB9KS5lbGVtZW50O1xufVxuIiwgImltcG9ydCB7IGVzY2FwZUh0bWwgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5pbXBvcnQgeyBnZXREcmFnQWZ0ZXJFbGVtZW50IH0gZnJvbSBcIi4uL2NvbW1vbi5qc1wiO1xuaW1wb3J0IHsgYXBwU3RhdGUgfSBmcm9tIFwiLi9zdGF0ZS5qc1wiO1xuaW1wb3J0IHsgR0VORVJBX1JFR0lTVFJZIH0gZnJvbSBcIi4uLy4uL2JhY2tncm91bmQvZXh0cmFjdGlvbi9nZW5lcmFSZWdpc3RyeS5qc1wiO1xuaW1wb3J0IHtcbiAgZG9tYWluRnJvbVVybCxcbiAgc2VtYW50aWNCdWNrZXQsXG4gIG5hdmlnYXRpb25LZXksXG4gIGdyb3VwaW5nS2V5XG59IGZyb20gXCIuLi8uLi9iYWNrZ3JvdW5kL2dyb3VwaW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHtcbiAgcmVjZW5jeVNjb3JlLFxuICBoaWVyYXJjaHlTY29yZSxcbiAgcGlubmVkU2NvcmUsXG4gIGNvbXBhcmVCeVxufSBmcm9tIFwiLi4vLi4vYmFja2dyb3VuZC9zb3J0aW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgU1RSQVRFR0lFUywgU3RyYXRlZ3lEZWZpbml0aW9uLCBnZXRTdHJhdGVnaWVzIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC9zdHJhdGVneVJlZ2lzdHJ5LmpzXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBzaG93TW9kYWwodGl0bGU6IHN0cmluZywgY29udGVudDogSFRNTEVsZW1lbnQgfCBzdHJpbmcpIHtcbiAgICBjb25zdCBtb2RhbE92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBtb2RhbE92ZXJsYXkuY2xhc3NOYW1lID0gJ21vZGFsLW92ZXJsYXknO1xuICAgIG1vZGFsT3ZlcmxheS5pbm5lckhUTUwgPSBgXG4gICAgICAgIDxkaXYgY2xhc3M9XCJtb2RhbFwiPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cIm1vZGFsLWhlYWRlclwiPlxuICAgICAgICAgICAgICAgIDxoMz4ke2VzY2FwZUh0bWwodGl0bGUpfTwvaDM+XG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cIm1vZGFsLWNsb3NlXCI+JnRpbWVzOzwvYnV0dG9uPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwibW9kYWwtY29udGVudFwiPjwvZGl2PlxuICAgICAgICA8L2Rpdj5cbiAgICBgO1xuXG4gICAgY29uc3QgY29udGVudENvbnRhaW5lciA9IG1vZGFsT3ZlcmxheS5xdWVyeVNlbGVjdG9yKCcubW9kYWwtY29udGVudCcpIGFzIEhUTUxFbGVtZW50O1xuICAgIGlmICh0eXBlb2YgY29udGVudCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgY29udGVudENvbnRhaW5lci5pbm5lckhUTUwgPSBjb250ZW50O1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnRlbnRDb250YWluZXIuYXBwZW5kQ2hpbGQoY29udGVudCk7XG4gICAgfVxuXG4gICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChtb2RhbE92ZXJsYXkpO1xuXG4gICAgY29uc3QgY2xvc2VCdG4gPSBtb2RhbE92ZXJsYXkucXVlcnlTZWxlY3RvcignLm1vZGFsLWNsb3NlJyk7XG4gICAgY2xvc2VCdG4/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICBkb2N1bWVudC5ib2R5LnJlbW92ZUNoaWxkKG1vZGFsT3ZlcmxheSk7XG4gICAgfSk7XG5cbiAgICBtb2RhbE92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgICAgICBpZiAoZS50YXJnZXQgPT09IG1vZGFsT3ZlcmxheSkge1xuICAgICAgICAgICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlQ2hpbGQobW9kYWxPdmVybGF5KTtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkRG5ETGlzdGVuZXJzKHJvdzogSFRNTEVsZW1lbnQsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcbiAgcm93LmFkZEV2ZW50TGlzdGVuZXIoJ2RyYWdzdGFydCcsIChlKSA9PiB7XG4gICAgcm93LmNsYXNzTGlzdC5hZGQoJ2RyYWdnaW5nJyk7XG4gICAgaWYgKGUuZGF0YVRyYW5zZmVyKSB7XG4gICAgICAgIGUuZGF0YVRyYW5zZmVyLmVmZmVjdEFsbG93ZWQgPSAnbW92ZSc7XG4gICAgICAgIC8vIFNldCBhIHRyYW5zcGFyZW50IGltYWdlIG9yIHNpbWlsYXIgaWYgZGVzaXJlZCwgYnV0IGRlZmF1bHQgaXMgdXN1YWxseSBmaW5lXG4gICAgfVxuICB9KTtcblxuICByb3cuYWRkRXZlbnRMaXN0ZW5lcignZHJhZ2VuZCcsICgpID0+IHtcbiAgICByb3cuY2xhc3NMaXN0LnJlbW92ZSgnZHJhZ2dpbmcnKTtcbiAgfSk7XG5cbiAgLy8gVGhlIGNvbnRhaW5lciBoYW5kbGVzIHRoZSBkcm9wIHpvbmUgbG9naWMgdmlhIGRyYWdvdmVyXG4gIGNvbnRhaW5lci5hZGRFdmVudExpc3RlbmVyKCdkcmFnb3ZlcicsIChlKSA9PiB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGNvbnN0IGFmdGVyRWxlbWVudCA9IGdldERyYWdBZnRlckVsZW1lbnQoY29udGFpbmVyLCBlLmNsaWVudFksICcuc3RyYXRlZ3ktcm93Om5vdCguZHJhZ2dpbmcpJyk7XG4gICAgY29uc3QgZHJhZ2dhYmxlID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5kcmFnZ2luZycpO1xuICAgIGlmIChkcmFnZ2FibGUpIHtcbiAgICAgIGlmIChhZnRlckVsZW1lbnQgPT0gbnVsbCkge1xuICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoZHJhZ2dhYmxlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnRhaW5lci5pbnNlcnRCZWZvcmUoZHJhZ2dhYmxlLCBhZnRlckVsZW1lbnQpO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzaG93U3RyYXRlZ3lEZXRhaWxzKHR5cGU6IHN0cmluZywgbmFtZTogc3RyaW5nKSB7XG4gICAgbGV0IGNvbnRlbnQgPSBcIlwiO1xuICAgIGxldCB0aXRsZSA9IGAke25hbWV9ICgke3R5cGV9KWA7XG5cbiAgICBpZiAodHlwZSA9PT0gJ2dyb3VwaW5nJykge1xuICAgICAgICBpZiAobmFtZSA9PT0gJ2RvbWFpbicpIHtcbiAgICAgICAgICAgIGNvbnRlbnQgPSBgXG48aDM+TG9naWM6IERvbWFpbiBFeHRyYWN0aW9uPC9oMz5cbjxwcmU+PGNvZGU+JHtlc2NhcGVIdG1sKGRvbWFpbkZyb21VcmwudG9TdHJpbmcoKSl9PC9jb2RlPjwvcHJlPlxuPGgzPkxvZ2ljOiBHcm91cGluZyBLZXk8L2gzPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwoZ3JvdXBpbmdLZXkudG9TdHJpbmcoKSl9PC9jb2RlPjwvcHJlPlxuICAgICAgICAgICAgYDtcbiAgICAgICAgfSBlbHNlIGlmIChuYW1lID09PSAndG9waWMnKSB7XG4gICAgICAgICAgICBjb250ZW50ID0gYFxuPGgzPkxvZ2ljOiBTZW1hbnRpYyBCdWNrZXRpbmc8L2gzPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwoc2VtYW50aWNCdWNrZXQudG9TdHJpbmcoKSl9PC9jb2RlPjwvcHJlPlxuPGgzPkxvZ2ljOiBHcm91cGluZyBLZXk8L2gzPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwoZ3JvdXBpbmdLZXkudG9TdHJpbmcoKSl9PC9jb2RlPjwvcHJlPlxuICAgICAgICAgICAgYDtcbiAgICAgICAgfSBlbHNlIGlmIChuYW1lID09PSAnbGluZWFnZScpIHtcbiAgICAgICAgICAgIGNvbnRlbnQgPSBgXG48aDM+TG9naWM6IE5hdmlnYXRpb24gS2V5PC9oMz5cbjxwcmU+PGNvZGU+JHtlc2NhcGVIdG1sKG5hdmlnYXRpb25LZXkudG9TdHJpbmcoKSl9PC9jb2RlPjwvcHJlPlxuPGgzPkxvZ2ljOiBHcm91cGluZyBLZXk8L2gzPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwoZ3JvdXBpbmdLZXkudG9TdHJpbmcoKSl9PC9jb2RlPjwvcHJlPlxuICAgICAgICAgICAgYDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIENoZWNrIGZvciBjdXN0b20gc3RyYXRlZ3kgZGV0YWlsc1xuICAgICAgICAgICAgY29uc3QgY3VzdG9tID0gYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBuYW1lKTtcbiAgICAgICAgICAgIGlmIChjdXN0b20pIHtcbiAgICAgICAgICAgICAgICBjb250ZW50ID0gYFxuPGgzPkN1c3RvbSBTdHJhdGVneTogJHtlc2NhcGVIdG1sKGN1c3RvbS5sYWJlbCl9PC9oMz5cbjxwPjxiPkNvbmZpZ3VyYXRpb246PC9iPjwvcD5cbjxwcmU+PGNvZGU+JHtlc2NhcGVIdG1sKEpTT04uc3RyaW5naWZ5KGN1c3RvbSwgbnVsbCwgMikpfTwvY29kZT48L3ByZT5cbjxoMz5Mb2dpYzogR3JvdXBpbmcgS2V5PC9oMz5cbjxwcmU+PGNvZGU+JHtlc2NhcGVIdG1sKGdyb3VwaW5nS2V5LnRvU3RyaW5nKCkpfTwvY29kZT48L3ByZT5cbiAgICAgICAgICAgICAgICBgO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb250ZW50ID0gYFxuPGgzPkxvZ2ljOiBHcm91cGluZyBLZXk8L2gzPlxuPHByZT48Y29kZT4ke2VzY2FwZUh0bWwoZ3JvdXBpbmdLZXkudG9TdHJpbmcoKSl9PC9jb2RlPjwvcHJlPlxuICAgICAgICAgICAgICAgIGA7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdzb3J0aW5nJykge1xuICAgICAgICBjb250ZW50ID0gYFxuPGgzPkxvZ2ljOiBDb21wYXJpc29uIEZ1bmN0aW9uPC9oMz5cbjxwcmU+PGNvZGU+JHtlc2NhcGVIdG1sKGNvbXBhcmVCeS50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+XG4gICAgICAgIGA7XG5cbiAgICAgICAgaWYgKG5hbWUgPT09ICdyZWNlbmN5Jykge1xuICAgICAgICAgICAgIGNvbnRlbnQgKz0gYDxoMz5Mb2dpYzogUmVjZW5jeSBTY29yZTwvaDM+PHByZT48Y29kZT4ke2VzY2FwZUh0bWwocmVjZW5jeVNjb3JlLnRvU3RyaW5nKCkpfTwvY29kZT48L3ByZT5gO1xuICAgICAgICB9IGVsc2UgaWYgKG5hbWUgPT09ICduZXN0aW5nJykge1xuICAgICAgICAgICAgIGNvbnRlbnQgKz0gYDxoMz5Mb2dpYzogSGllcmFyY2h5IFNjb3JlPC9oMz48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChoaWVyYXJjaHlTY29yZS50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+YDtcbiAgICAgICAgfSBlbHNlIGlmIChuYW1lID09PSAncGlubmVkJykge1xuICAgICAgICAgICAgIGNvbnRlbnQgKz0gYDxoMz5Mb2dpYzogUGlubmVkIFNjb3JlPC9oMz48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChwaW5uZWRTY29yZS50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+YDtcbiAgICAgICAgfVxuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3JlZ2lzdHJ5JyAmJiBuYW1lID09PSAnZ2VuZXJhJykge1xuICAgICAgICBjb25zdCBqc29uID0gSlNPTi5zdHJpbmdpZnkoR0VORVJBX1JFR0lTVFJZLCBudWxsLCAyKTtcbiAgICAgICAgY29udGVudCA9IGBcbjxoMz5HZW5lcmEgUmVnaXN0cnkgRGF0YTwvaDM+XG48cD5NYXBwaW5nIG9mIGRvbWFpbiBuYW1lcyB0byBjYXRlZ29yaWVzLjwvcD5cbjxwcmU+PGNvZGU+JHtlc2NhcGVIdG1sKGpzb24pfTwvY29kZT48L3ByZT5cbiAgICAgICAgYDtcbiAgICB9XG5cbiAgICBzaG93TW9kYWwodGl0bGUsIGNvbnRlbnQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyQWxnb3JpdGhtc1ZpZXcoKSB7XG4gIGNvbnN0IGdyb3VwaW5nUmVmID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dyb3VwaW5nLXJlZicpO1xuICBjb25zdCBzb3J0aW5nUmVmID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NvcnRpbmctcmVmJyk7XG5cbiAgaWYgKGdyb3VwaW5nUmVmKSB7XG4gICAgICAvLyBSZS1yZW5kZXIgYmVjYXVzZSBzdHJhdGVneSBsaXN0IG1pZ2h0IGNoYW5nZVxuICAgICAgY29uc3QgYWxsU3RyYXRlZ2llczogU3RyYXRlZ3lEZWZpbml0aW9uW10gPSBnZXRTdHJhdGVnaWVzKGFwcFN0YXRlLmxvY2FsQ3VzdG9tU3RyYXRlZ2llcyk7XG4gICAgICBjb25zdCBncm91cGluZ3MgPSBhbGxTdHJhdGVnaWVzLmZpbHRlcihzID0+IHMuaXNHcm91cGluZyk7XG5cbiAgICAgIGdyb3VwaW5nUmVmLmlubmVySFRNTCA9IGdyb3VwaW5ncy5tYXAoZyA9PiB7XG4gICAgICAgICBjb25zdCBpc0N1c3RvbSA9IGFwcFN0YXRlLmxvY2FsQ3VzdG9tU3RyYXRlZ2llcy5zb21lKHMgPT4gcy5pZCA9PT0gZy5pZCk7XG4gICAgICAgICBsZXQgZGVzYyA9IFwiQnVpbHQtaW4gc3RyYXRlZ3lcIjtcbiAgICAgICAgIGlmIChpc0N1c3RvbSkgZGVzYyA9IFwiQ3VzdG9tIHN0cmF0ZWd5IGRlZmluZWQgYnkgcnVsZXMuXCI7XG4gICAgICAgICBlbHNlIGlmIChnLmlkID09PSAnZG9tYWluJykgZGVzYyA9ICdHcm91cHMgdGFicyBieSB0aGVpciBkb21haW4gbmFtZS4nO1xuICAgICAgICAgZWxzZSBpZiAoZy5pZCA9PT0gJ3RvcGljJykgZGVzYyA9ICdHcm91cHMgYmFzZWQgb24ga2V5d29yZHMgaW4gdGhlIHRpdGxlLic7XG5cbiAgICAgICAgIHJldHVybiBgXG4gICAgICAgICAgPGRpdiBjbGFzcz1cInN0cmF0ZWd5LWl0ZW1cIj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJzdHJhdGVneS1uYW1lXCI+JHtnLmxhYmVsfSAoJHtnLmlkfSkgJHtpc0N1c3RvbSA/ICc8c3BhbiBzdHlsZT1cImNvbG9yOiBibHVlOyBmb250LXNpemU6IDAuOGVtO1wiPkN1c3RvbTwvc3Bhbj4nIDogJyd9PC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwic3RyYXRlZ3ktZGVzY1wiPiR7ZGVzY308L2Rpdj5cbiAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJzdHJhdGVneS12aWV3LWJ0blwiIGRhdGEtdHlwZT1cImdyb3VwaW5nXCIgZGF0YS1uYW1lPVwiJHtnLmlkfVwiPlZpZXcgTG9naWM8L2J1dHRvbj5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgYDtcbiAgICAgIH0pLmpvaW4oJycpO1xuICB9XG5cbiAgaWYgKHNvcnRpbmdSZWYpIHtcbiAgICAvLyBSZS1yZW5kZXIgc29ydGluZyBzdHJhdGVnaWVzIHRvb1xuICAgIGNvbnN0IGFsbFN0cmF0ZWdpZXM6IFN0cmF0ZWd5RGVmaW5pdGlvbltdID0gZ2V0U3RyYXRlZ2llcyhhcHBTdGF0ZS5sb2NhbEN1c3RvbVN0cmF0ZWdpZXMpO1xuICAgIGNvbnN0IHNvcnRpbmdzID0gYWxsU3RyYXRlZ2llcy5maWx0ZXIocyA9PiBzLmlzU29ydGluZyk7XG5cbiAgICBzb3J0aW5nUmVmLmlubmVySFRNTCA9IHNvcnRpbmdzLm1hcChzID0+IHtcbiAgICAgICAgbGV0IGRlc2MgPSBcIkJ1aWx0LWluIHNvcnRpbmdcIjtcbiAgICAgICAgaWYgKHMuaWQgPT09ICdyZWNlbmN5JykgZGVzYyA9ICdTb3J0cyBieSBsYXN0IGFjY2Vzc2VkIHRpbWUgKG1vc3QgcmVjZW50IGZpcnN0KS4nO1xuICAgICAgICBlbHNlIGlmIChzLmlkID09PSAnbmVzdGluZycpIGRlc2MgPSAnU29ydHMgYmFzZWQgb24gaGllcmFyY2h5IChyb290cyB2cyBjaGlsZHJlbikuJztcbiAgICAgICAgZWxzZSBpZiAocy5pZCA9PT0gJ3Bpbm5lZCcpIGRlc2MgPSAnS2VlcHMgcGlubmVkIHRhYnMgYXQgdGhlIGJlZ2lubmluZyBvZiB0aGUgbGlzdC4nO1xuXG4gICAgICAgIHJldHVybiBgXG4gICAgICA8ZGl2IGNsYXNzPVwic3RyYXRlZ3ktaXRlbVwiPlxuICAgICAgICA8ZGl2IGNsYXNzPVwic3RyYXRlZ3ktbmFtZVwiPiR7cy5sYWJlbH08L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzcz1cInN0cmF0ZWd5LWRlc2NcIj4ke2Rlc2N9PC9kaXY+XG4gICAgICAgIDxidXR0b24gY2xhc3M9XCJzdHJhdGVneS12aWV3LWJ0blwiIGRhdGEtdHlwZT1cInNvcnRpbmdcIiBkYXRhLW5hbWU9XCIke3MuaWR9XCI+VmlldyBMb2dpYzwvYnV0dG9uPlxuICAgICAgPC9kaXY+XG4gICAgYDtcbiAgICB9KS5qb2luKCcnKTtcbiAgfVxuXG4gIGNvbnN0IHJlZ2lzdHJ5UmVmID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3JlZ2lzdHJ5LXJlZicpO1xuICBpZiAocmVnaXN0cnlSZWYgJiYgcmVnaXN0cnlSZWYuY2hpbGRyZW4ubGVuZ3RoID09PSAwKSB7XG4gICAgICByZWdpc3RyeVJlZi5pbm5lckhUTUwgPSBgXG4gICAgICAgIDxkaXYgY2xhc3M9XCJzdHJhdGVneS1pdGVtXCI+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwic3RyYXRlZ3ktbmFtZVwiPkdlbmVyYSBSZWdpc3RyeTwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInN0cmF0ZWd5LWRlc2NcIj5TdGF0aWMgbG9va3VwIHRhYmxlIGZvciBkb21haW4gY2xhc3NpZmljYXRpb24gKGFwcHJveCAke09iamVjdC5rZXlzKEdFTkVSQV9SRUdJU1RSWSkubGVuZ3RofSBlbnRyaWVzKS48L2Rpdj5cbiAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJzdHJhdGVneS12aWV3LWJ0blwiIGRhdGEtdHlwZT1cInJlZ2lzdHJ5XCIgZGF0YS1uYW1lPVwiZ2VuZXJhXCI+VmlldyBUYWJsZTwvYnV0dG9uPlxuICAgICAgICA8L2Rpdj5cbiAgICAgIGA7XG4gIH1cbn1cbiIsICJpbXBvcnQgeyBhcHBTdGF0ZSB9IGZyb20gXCIuL3N0YXRlLmpzXCI7XG5pbXBvcnQgeyBnZXRNYXBwZWRUYWJzIH0gZnJvbSBcIi4vZGF0YS5qc1wiO1xuaW1wb3J0IHsgbG9hZFRhYnMgfSBmcm9tIFwiLi90YWJzVGFibGUuanNcIjtcbmltcG9ydCB7IGFkZERuRExpc3RlbmVycyB9IGZyb20gXCIuL2NvbXBvbmVudHMuanNcIjtcbmltcG9ydCB7IGdldFN0cmF0ZWdpZXMsIFN0cmF0ZWd5RGVmaW5pdGlvbiB9IGZyb20gXCIuLi8uLi9zaGFyZWQvc3RyYXRlZ3lSZWdpc3RyeS5qc1wiO1xuaW1wb3J0IHsgc29ydFRhYnMgfSBmcm9tIFwiLi4vLi4vYmFja2dyb3VuZC9zb3J0aW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgZ3JvdXBUYWJzIH0gZnJvbSBcIi4uLy4uL2JhY2tncm91bmQvZ3JvdXBpbmdTdHJhdGVnaWVzLmpzXCI7XG5pbXBvcnQgeyBTb3J0aW5nU3RyYXRlZ3kgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBlc2NhcGVIdG1sIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC91dGlscy5qc1wiO1xuXG5leHBvcnQgZnVuY3Rpb24gcnVuU2ltdWxhdGlvbigpIHtcbiAgY29uc3QgZ3JvdXBpbmdMaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpbS1ncm91cGluZy1saXN0Jyk7XG4gIGNvbnN0IHNvcnRpbmdMaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpbS1zb3J0aW5nLWxpc3QnKTtcbiAgY29uc3QgcmVzdWx0Q29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpbVJlc3VsdHMnKTtcblxuICBpZiAoIWdyb3VwaW5nTGlzdCB8fCAhc29ydGluZ0xpc3QgfHwgIXJlc3VsdENvbnRhaW5lcikgcmV0dXJuO1xuXG4gIGNvbnN0IGdyb3VwaW5nU3RyYXRzID0gZ2V0RW5hYmxlZFN0cmF0ZWdpZXNGcm9tVUkoZ3JvdXBpbmdMaXN0KTtcbiAgY29uc3Qgc29ydGluZ1N0cmF0cyA9IGdldEVuYWJsZWRTdHJhdGVnaWVzRnJvbVVJKHNvcnRpbmdMaXN0KTtcblxuICAvLyBQcmVwYXJlIGRhdGFcbiAgbGV0IHRhYnMgPSBnZXRNYXBwZWRUYWJzKCk7XG5cbiAgLy8gMS4gU29ydFxuICBpZiAoc29ydGluZ1N0cmF0cy5sZW5ndGggPiAwKSB7XG4gICAgdGFicyA9IHNvcnRUYWJzKHRhYnMsIHNvcnRpbmdTdHJhdHMpO1xuICB9XG5cbiAgLy8gMi4gR3JvdXBcbiAgY29uc3QgZ3JvdXBzID0gZ3JvdXBUYWJzKHRhYnMsIGdyb3VwaW5nU3RyYXRzKTtcblxuICAvLyAzLiBSZW5kZXJcbiAgaWYgKGdyb3Vwcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJlc3VsdENvbnRhaW5lci5pbm5lckhUTUwgPSAnPHA+Tm8gZ3JvdXBzIGNyZWF0ZWQgKGFyZSB0aGVyZSBhbnkgdGFicz8pLjwvcD4nO1xuICAgICAgcmV0dXJuO1xuICB9XG5cbiAgcmVzdWx0Q29udGFpbmVyLmlubmVySFRNTCA9IGdyb3Vwcy5tYXAoZ3JvdXAgPT4gYFxuICAgIDxkaXYgY2xhc3M9XCJncm91cC1yZXN1bHRcIj5cbiAgICAgIDxkaXYgY2xhc3M9XCJncm91cC1oZWFkZXJcIiBzdHlsZT1cImJvcmRlci1sZWZ0OiA1cHggc29saWQgJHtncm91cC5jb2xvcn1cIj5cbiAgICAgICAgPHNwYW4+JHtlc2NhcGVIdG1sKGdyb3VwLmxhYmVsIHx8ICdVbmdyb3VwZWQnKX08L3NwYW4+XG4gICAgICAgIDxzcGFuIGNsYXNzPVwiZ3JvdXAtbWV0YVwiPiR7Z3JvdXAudGFicy5sZW5ndGh9IHRhYnMgJmJ1bGw7IFJlYXNvbjogJHtlc2NhcGVIdG1sKGdyb3VwLnJlYXNvbil9PC9zcGFuPlxuICAgICAgPC9kaXY+XG4gICAgICA8dWwgY2xhc3M9XCJncm91cC10YWJzXCI+XG4gICAgICAgICR7Z3JvdXAudGFicy5tYXAodGFiID0+IGBcbiAgICAgICAgICA8bGkgY2xhc3M9XCJncm91cC10YWItaXRlbVwiPlxuICAgICAgICAgICAgJHt0YWIuZmF2SWNvblVybCA/IGA8aW1nIHNyYz1cIiR7ZXNjYXBlSHRtbCh0YWIuZmF2SWNvblVybCl9XCIgY2xhc3M9XCJ0YWItaWNvblwiIG9uZXJyb3I9XCJ0aGlzLnN0eWxlLmRpc3BsYXk9J25vbmUnXCI+YCA6ICc8ZGl2IGNsYXNzPVwidGFiLWljb25cIj48L2Rpdj4nfVxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJ0aXRsZS1jZWxsXCIgdGl0bGU9XCIke2VzY2FwZUh0bWwodGFiLnRpdGxlKX1cIj4ke2VzY2FwZUh0bWwodGFiLnRpdGxlKX08L3NwYW4+XG4gICAgICAgICAgICA8c3BhbiBzdHlsZT1cImNvbG9yOiAjOTk5OyBmb250LXNpemU6IDAuOGVtOyBtYXJnaW4tbGVmdDogYXV0bztcIj4ke2VzY2FwZUh0bWwobmV3IFVSTCh0YWIudXJsKS5ob3N0bmFtZSl9PC9zcGFuPlxuICAgICAgICAgIDwvbGk+XG4gICAgICAgIGApLmpvaW4oJycpfVxuICAgICAgPC91bD5cbiAgICA8L2Rpdj5cbiAgYCkuam9pbignJyk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhcHBseVRvQnJvd3NlcigpIHtcbiAgICBjb25zdCBncm91cGluZ0xpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2ltLWdyb3VwaW5nLWxpc3QnKTtcbiAgICBjb25zdCBzb3J0aW5nTGlzdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaW0tc29ydGluZy1saXN0Jyk7XG5cbiAgICBpZiAoIWdyb3VwaW5nTGlzdCB8fCAhc29ydGluZ0xpc3QpIHJldHVybjtcblxuICAgIGNvbnN0IGdyb3VwaW5nU3RyYXRzID0gZ2V0RW5hYmxlZFN0cmF0ZWdpZXNGcm9tVUkoZ3JvdXBpbmdMaXN0KTtcbiAgICBjb25zdCBzb3J0aW5nU3RyYXRzID0gZ2V0RW5hYmxlZFN0cmF0ZWdpZXNGcm9tVUkoc29ydGluZ0xpc3QpO1xuXG4gICAgLy8gQ29tYmluZSBzdHJhdGVnaWVzLlxuICAgIC8vIFdlIHByaW9yaXRpemUgZ3JvdXBpbmcgc3RyYXRlZ2llcyBmaXJzdCwgdGhlbiBzb3J0aW5nIHN0cmF0ZWdpZXMsXG4gICAgLy8gYXMgdGhlIGJhY2tlbmQgZmlsdGVycyB0aGVtIHdoZW4gcGVyZm9ybWluZyBhY3Rpb25zLlxuICAgIGNvbnN0IGFsbFN0cmF0ZWdpZXMgPSBbLi4uZ3JvdXBpbmdTdHJhdHMsIC4uLnNvcnRpbmdTdHJhdHNdO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgLy8gMS4gU2F2ZSBQcmVmZXJlbmNlc1xuICAgICAgICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICB0eXBlOiAnc2F2ZVByZWZlcmVuY2VzJyxcbiAgICAgICAgICAgIHBheWxvYWQ6IHsgc29ydGluZzogYWxsU3RyYXRlZ2llcyB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIDIuIFRyaWdnZXIgQXBwbHkgR3JvdXBpbmcgKHdoaWNoIHVzZXMgdGhlIG5ldyBwcmVmZXJlbmNlcylcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICB0eXBlOiAnYXBwbHlHcm91cGluZycsXG4gICAgICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgICAgICAgc29ydGluZzogYWxsU3RyYXRlZ2llcyAvLyBQYXNzIGV4cGxpY2l0bHkgdG8gZW5zdXJlIGltbWVkaWF0ZSBlZmZlY3RcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9rKSB7XG4gICAgICAgICAgICBhbGVydChcIkFwcGxpZWQgc3VjY2Vzc2Z1bGx5IVwiKTtcbiAgICAgICAgICAgIGxvYWRUYWJzKCk7IC8vIFJlZnJlc2ggZGF0YVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYWxlcnQoXCJGYWlsZWQgdG8gYXBwbHk6IFwiICsgKHJlc3BvbnNlLmVycm9yIHx8ICdVbmtub3duIGVycm9yJykpO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiQXBwbHkgZmFpbGVkXCIsIGUpO1xuICAgICAgICBhbGVydChcIkFwcGx5IGZhaWxlZDogXCIgKyBlKTtcbiAgICB9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZW5kZXJMaXZlVmlldygpIHtcbiAgICBjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbGl2ZS12aWV3LWNvbnRhaW5lcicpO1xuICAgIGlmICghY29udGFpbmVyKSByZXR1cm47XG5cbiAgICB0cnkge1xuICAgICAgICBjb25zdCB0YWJzID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoe30pO1xuICAgICAgICBjb25zdCBncm91cHMgPSBhd2FpdCBjaHJvbWUudGFiR3JvdXBzLnF1ZXJ5KHt9KTtcbiAgICAgICAgY29uc3QgZ3JvdXBNYXAgPSBuZXcgTWFwKGdyb3Vwcy5tYXAoZyA9PiBbZy5pZCwgZ10pKTtcblxuICAgICAgICBjb25zdCB3aW5kb3dzID0gbmV3IFNldCh0YWJzLm1hcCh0ID0+IHQud2luZG93SWQpKTtcbiAgICAgICAgY29uc3Qgd2luZG93SWRzID0gQXJyYXkuZnJvbSh3aW5kb3dzKS5zb3J0KChhLCBiKSA9PiBhIC0gYik7XG5cbiAgICAgICAgbGV0IGh0bWwgPSAnPGRpdiBzdHlsZT1cImZvbnQtc2l6ZTogMC45ZW07IGNvbG9yOiAjNjY2OyBtYXJnaW4tYm90dG9tOiAxMHB4O1wiPlNlbGVjdCBpdGVtcyBiZWxvdyB0byBzaW11bGF0ZSBzcGVjaWZpYyBzZWxlY3Rpb24gc3RhdGVzLjwvZGl2Pic7XG5cbiAgICAgICAgZm9yIChjb25zdCB3aW5JZCBvZiB3aW5kb3dJZHMpIHtcbiAgICAgICAgICAgIGNvbnN0IHdpblRhYnMgPSB0YWJzLmZpbHRlcih0ID0+IHQud2luZG93SWQgPT09IHdpbklkKTtcbiAgICAgICAgICAgIGNvbnN0IHdpblNlbGVjdGVkID0gd2luVGFicy5ldmVyeSh0ID0+IHQuaWQgJiYgYXBwU3RhdGUuc2ltdWxhdGVkU2VsZWN0aW9uLmhhcyh0LmlkKSk7XG5cbiAgICAgICAgICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJzZWxlY3RhYmxlLWl0ZW0gJHt3aW5TZWxlY3RlZCA/ICdzZWxlY3RlZCcgOiAnJ31cIiBkYXRhLXR5cGU9XCJ3aW5kb3dcIiBkYXRhLWlkPVwiJHt3aW5JZH1cIiBzdHlsZT1cIm1hcmdpbi1ib3R0b206IDE1cHg7IGJvcmRlci1yYWRpdXM6IDRweDsgcGFkZGluZzogNXB4O1wiPmA7XG4gICAgICAgICAgICBodG1sICs9IGA8ZGl2IHN0eWxlPVwiZm9udC13ZWlnaHQ6IGJvbGQ7XCI+V2luZG93ICR7d2luSWR9PC9kaXY+YDtcblxuICAgICAgICAgICAgLy8gT3JnYW5pemUgYnkgZ3JvdXBcbiAgICAgICAgICAgIGNvbnN0IHdpbkdyb3VwcyA9IG5ldyBNYXA8bnVtYmVyLCBjaHJvbWUudGFicy5UYWJbXT4oKTtcbiAgICAgICAgICAgIGNvbnN0IHVuZ3JvdXBlZDogY2hyb21lLnRhYnMuVGFiW10gPSBbXTtcblxuICAgICAgICAgICAgd2luVGFicy5mb3JFYWNoKHQgPT4ge1xuICAgICAgICAgICAgICAgIGlmICh0Lmdyb3VwSWQgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghd2luR3JvdXBzLmhhcyh0Lmdyb3VwSWQpKSB3aW5Hcm91cHMuc2V0KHQuZ3JvdXBJZCwgW10pO1xuICAgICAgICAgICAgICAgICAgICB3aW5Hcm91cHMuZ2V0KHQuZ3JvdXBJZCkhLnB1c2godCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdW5ncm91cGVkLnB1c2godCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIFJlbmRlciBVbmdyb3VwZWRcbiAgICAgICAgICAgIGlmICh1bmdyb3VwZWQubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICBodG1sICs9IGA8ZGl2IHN0eWxlPVwibWFyZ2luLWxlZnQ6IDEwcHg7IG1hcmdpbi10b3A6IDVweDtcIj5gO1xuICAgICAgICAgICAgICAgICBodG1sICs9IGA8ZGl2IHN0eWxlPVwiZm9udC1zaXplOiAwLjllbTsgY29sb3I6ICM1NTU7XCI+VW5ncm91cGVkICgke3VuZ3JvdXBlZC5sZW5ndGh9KTwvZGl2PmA7XG4gICAgICAgICAgICAgICAgIHVuZ3JvdXBlZC5mb3JFYWNoKHQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNTZWxlY3RlZCA9IHQuaWQgJiYgYXBwU3RhdGUuc2ltdWxhdGVkU2VsZWN0aW9uLmhhcyh0LmlkKTtcbiAgICAgICAgICAgICAgICAgICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJzZWxlY3RhYmxlLWl0ZW0gJHtpc1NlbGVjdGVkID8gJ3NlbGVjdGVkJyA6ICcnfVwiIGRhdGEtdHlwZT1cInRhYlwiIGRhdGEtaWQ9XCIke3QuaWR9XCIgc3R5bGU9XCJtYXJnaW4tbGVmdDogMTBweDsgcGFkZGluZzogMnB4IDVweDsgYm9yZGVyLXJhZGl1czogM3B4OyBjdXJzb3I6IHBvaW50ZXI7IGNvbG9yOiAjMzMzOyB3aGl0ZS1zcGFjZTogbm93cmFwOyBvdmVyZmxvdzogaGlkZGVuOyB0ZXh0LW92ZXJmbG93OiBlbGxpcHNpcztcIj4tICR7ZXNjYXBlSHRtbCh0LnRpdGxlIHx8ICdVbnRpdGxlZCcpfTwvZGl2PmA7XG4gICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICBodG1sICs9IGA8L2Rpdj5gO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBSZW5kZXIgR3JvdXBzXG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtncm91cElkLCBnVGFic10gb2Ygd2luR3JvdXBzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZ3JvdXBJbmZvID0gZ3JvdXBNYXAuZ2V0KGdyb3VwSWQpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvbG9yID0gZ3JvdXBJbmZvPy5jb2xvciB8fCAnZ3JleSc7XG4gICAgICAgICAgICAgICAgY29uc3QgdGl0bGUgPSBncm91cEluZm8/LnRpdGxlIHx8ICdVbnRpdGxlZCBHcm91cCc7XG4gICAgICAgICAgICAgICAgY29uc3QgZ3JvdXBTZWxlY3RlZCA9IGdUYWJzLmV2ZXJ5KHQgPT4gdC5pZCAmJiBhcHBTdGF0ZS5zaW11bGF0ZWRTZWxlY3Rpb24uaGFzKHQuaWQpKTtcblxuICAgICAgICAgICAgICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJzZWxlY3RhYmxlLWl0ZW0gJHtncm91cFNlbGVjdGVkID8gJ3NlbGVjdGVkJyA6ICcnfVwiIGRhdGEtdHlwZT1cImdyb3VwXCIgZGF0YS1pZD1cIiR7Z3JvdXBJZH1cIiBzdHlsZT1cIm1hcmdpbi1sZWZ0OiAxMHB4OyBtYXJnaW4tdG9wOiA1cHg7IGJvcmRlci1sZWZ0OiAzcHggc29saWQgJHtjb2xvcn07IHBhZGRpbmctbGVmdDogNXB4OyBwYWRkaW5nOiA1cHg7IGJvcmRlci1yYWRpdXM6IDNweDtcIj5gO1xuICAgICAgICAgICAgICAgIGh0bWwgKz0gYDxkaXYgc3R5bGU9XCJmb250LXdlaWdodDogYm9sZDsgZm9udC1zaXplOiAwLjllbTtcIj4ke2VzY2FwZUh0bWwodGl0bGUpfSAoJHtnVGFicy5sZW5ndGh9KTwvZGl2PmA7XG4gICAgICAgICAgICAgICAgZ1RhYnMuZm9yRWFjaCh0ID0+IHtcbiAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzU2VsZWN0ZWQgPSB0LmlkICYmIGFwcFN0YXRlLnNpbXVsYXRlZFNlbGVjdGlvbi5oYXModC5pZCk7XG4gICAgICAgICAgICAgICAgICAgICBodG1sICs9IGA8ZGl2IGNsYXNzPVwic2VsZWN0YWJsZS1pdGVtICR7aXNTZWxlY3RlZCA/ICdzZWxlY3RlZCcgOiAnJ31cIiBkYXRhLXR5cGU9XCJ0YWJcIiBkYXRhLWlkPVwiJHt0LmlkfVwiIHN0eWxlPVwibWFyZ2luLWxlZnQ6IDEwcHg7IHBhZGRpbmc6IDJweCA1cHg7IGJvcmRlci1yYWRpdXM6IDNweDsgY3Vyc29yOiBwb2ludGVyOyBjb2xvcjogIzMzMzsgd2hpdGUtc3BhY2U6IG5vd3JhcDsgb3ZlcmZsb3c6IGhpZGRlbjsgdGV4dC1vdmVyZmxvdzogZWxsaXBzaXM7XCI+LSAke2VzY2FwZUh0bWwodC50aXRsZSB8fCAnVW50aXRsZWQnKX08L2Rpdj5gO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGh0bWwgKz0gYDwvZGl2PmA7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGh0bWwgKz0gYDwvZGl2PmA7XG4gICAgICAgIH1cblxuICAgICAgICBjb250YWluZXIuaW5uZXJIVE1MID0gaHRtbDtcblxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29udGFpbmVyLmlubmVySFRNTCA9IGA8cCBzdHlsZT1cImNvbG9yOnJlZFwiPkVycm9yIGxvYWRpbmcgbGl2ZSB2aWV3OiAke2V9PC9wPmA7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyU3RyYXRlZ3lDb25maWcoKSB7XG4gIGNvbnN0IGdyb3VwaW5nTGlzdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaW0tZ3JvdXBpbmctbGlzdCcpO1xuICBjb25zdCBzb3J0aW5nTGlzdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaW0tc29ydGluZy1saXN0Jyk7XG5cbiAgLy8gVXNlIGR5bmFtaWMgc3RyYXRlZ3kgbGlzdFxuICBjb25zdCBzdHJhdGVnaWVzOiBTdHJhdGVneURlZmluaXRpb25bXSA9IGdldFN0cmF0ZWdpZXMoYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzKTtcblxuICBpZiAoZ3JvdXBpbmdMaXN0KSB7XG4gICAgICAvLyBncm91cGluZ1N0cmF0ZWdpZXMgaXMganVzdCBmaWx0ZXJlZCBzdHJhdGVnaWVzXG4gICAgICBjb25zdCBncm91cGluZ1N0cmF0ZWdpZXMgPSBzdHJhdGVnaWVzLmZpbHRlcihzID0+IHMuaXNHcm91cGluZyk7XG4gICAgICByZW5kZXJTdHJhdGVneUxpc3QoZ3JvdXBpbmdMaXN0LCBncm91cGluZ1N0cmF0ZWdpZXMsIFsnZG9tYWluJywgJ3RvcGljJ10pO1xuICB9XG5cbiAgaWYgKHNvcnRpbmdMaXN0KSB7XG4gICAgICBjb25zdCBzb3J0aW5nU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gcy5pc1NvcnRpbmcpO1xuICAgICAgcmVuZGVyU3RyYXRlZ3lMaXN0KHNvcnRpbmdMaXN0LCBzb3J0aW5nU3RyYXRlZ2llcywgWydwaW5uZWQnLCAncmVjZW5jeSddKTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyU3RyYXRlZ3lMaXN0KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHN0cmF0ZWdpZXM6IFN0cmF0ZWd5RGVmaW5pdGlvbltdLCBkZWZhdWx0RW5hYmxlZDogc3RyaW5nW10pIHtcbiAgICBjb250YWluZXIuaW5uZXJIVE1MID0gJyc7XG5cbiAgICAvLyBTb3J0IGVuYWJsZWQgYnkgdGhlaXIgaW5kZXggaW4gZGVmYXVsdEVuYWJsZWRcbiAgICBjb25zdCBlbmFibGVkID0gc3RyYXRlZ2llcy5maWx0ZXIocyA9PiBkZWZhdWx0RW5hYmxlZC5pbmNsdWRlcyhzLmlkIGFzIHN0cmluZykpO1xuICAgIC8vIFNhZmUgaW5kZXhvZiBjaGVjayBzaW5jZSBpZHMgYXJlIHN0cmluZ3MgaW4gZGVmYXVsdEVuYWJsZWRcbiAgICBlbmFibGVkLnNvcnQoKGEsIGIpID0+IGRlZmF1bHRFbmFibGVkLmluZGV4T2YoYS5pZCBhcyBzdHJpbmcpIC0gZGVmYXVsdEVuYWJsZWQuaW5kZXhPZihiLmlkIGFzIHN0cmluZykpO1xuXG4gICAgY29uc3QgZGlzYWJsZWQgPSBzdHJhdGVnaWVzLmZpbHRlcihzID0+ICFkZWZhdWx0RW5hYmxlZC5pbmNsdWRlcyhzLmlkIGFzIHN0cmluZykpO1xuXG4gICAgLy8gSW5pdGlhbCByZW5kZXIgb3JkZXI6IEVuYWJsZWQgKG9yZGVyZWQpIHRoZW4gRGlzYWJsZWRcbiAgICBjb25zdCBvcmRlcmVkID0gWy4uLmVuYWJsZWQsIC4uLmRpc2FibGVkXTtcblxuICAgIG9yZGVyZWQuZm9yRWFjaChzdHJhdGVneSA9PiB7XG4gICAgICAgIGNvbnN0IGlzQ2hlY2tlZCA9IGRlZmF1bHRFbmFibGVkLmluY2x1ZGVzKHN0cmF0ZWd5LmlkKTtcbiAgICAgICAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIHJvdy5jbGFzc05hbWUgPSBgc3RyYXRlZ3ktcm93ICR7aXNDaGVja2VkID8gJycgOiAnZGlzYWJsZWQnfWA7XG4gICAgICAgIHJvdy5kYXRhc2V0LmlkID0gc3RyYXRlZ3kuaWQ7XG4gICAgICAgIHJvdy5kcmFnZ2FibGUgPSB0cnVlO1xuXG4gICAgICAgIHJvdy5pbm5lckhUTUwgPSBgXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiZHJhZy1oYW5kbGVcIj5cdTI2MzA8L2Rpdj5cbiAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiAke2lzQ2hlY2tlZCA/ICdjaGVja2VkJyA6ICcnfT5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwic3RyYXRlZ3ktbGFiZWxcIj4ke3N0cmF0ZWd5LmxhYmVsfTwvc3Bhbj5cbiAgICAgICAgYDtcblxuICAgICAgICAvLyBBZGQgbGlzdGVuZXJzXG4gICAgICAgIGNvbnN0IGNoZWNrYm94ID0gcm93LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJjaGVja2JveFwiXScpO1xuICAgICAgICBjaGVja2JveD8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKGUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNoZWNrZWQgPSAoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkuY2hlY2tlZDtcbiAgICAgICAgICAgIHJvdy5jbGFzc0xpc3QudG9nZ2xlKCdkaXNhYmxlZCcsICFjaGVja2VkKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgYWRkRG5ETGlzdGVuZXJzKHJvdywgY29udGFpbmVyKTtcblxuICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQocm93KTtcbiAgICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEVuYWJsZWRTdHJhdGVnaWVzRnJvbVVJKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBTb3J0aW5nU3RyYXRlZ3lbXSB7XG4gICAgcmV0dXJuIEFycmF5LmZyb20oY29udGFpbmVyLmNoaWxkcmVuKVxuICAgICAgICAuZmlsdGVyKHJvdyA9PiAocm93LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W3R5cGU9XCJjaGVja2JveFwiXScpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLmNoZWNrZWQpXG4gICAgICAgIC5tYXAocm93ID0+IChyb3cgYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXQuaWQgYXMgU29ydGluZ1N0cmF0ZWd5KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRTaW11bGF0aW9uKCkge1xuICBjb25zdCBydW5TaW1CdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncnVuU2ltQnRuJyk7XG4gIGlmIChydW5TaW1CdG4pIHtcbiAgICBydW5TaW1CdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBydW5TaW11bGF0aW9uKTtcbiAgfVxuXG4gIGNvbnN0IGFwcGx5QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FwcGx5QnRuJyk7XG4gIGlmIChhcHBseUJ0bikge1xuICAgIGFwcGx5QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgYXBwbHlUb0Jyb3dzZXIpO1xuICB9XG5cbiAgLy8gSW5pdGlhbCBMaXZlIFZpZXdcbiAgcmVuZGVyTGl2ZVZpZXcoKTtcbiAgY29uc3QgcmVmcmVzaExpdmVCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncmVmcmVzaC1saXZlLXZpZXctYnRuJyk7XG4gIGlmIChyZWZyZXNoTGl2ZUJ0bikgcmVmcmVzaExpdmVCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCByZW5kZXJMaXZlVmlldyk7XG5cbiAgY29uc3QgbGl2ZUNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsaXZlLXZpZXctY29udGFpbmVyJyk7XG4gIGlmIChsaXZlQ29udGFpbmVyKSB7XG4gICAgICBsaXZlQ29udGFpbmVyLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICAgICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgICBjb25zdCBpdGVtID0gdGFyZ2V0LmNsb3Nlc3QoJy5zZWxlY3RhYmxlLWl0ZW0nKSBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgICBpZiAoIWl0ZW0pIHJldHVybjtcblxuICAgICAgICAgIGNvbnN0IHR5cGUgPSBpdGVtLmRhdGFzZXQudHlwZTtcbiAgICAgICAgICBjb25zdCBpZCA9IE51bWJlcihpdGVtLmRhdGFzZXQuaWQpO1xuICAgICAgICAgIGlmICghdHlwZSB8fCBpc05hTihpZCkpIHJldHVybjtcblxuICAgICAgICAgIGlmICh0eXBlID09PSAndGFiJykge1xuICAgICAgICAgICAgICBpZiAoYXBwU3RhdGUuc2ltdWxhdGVkU2VsZWN0aW9uLmhhcyhpZCkpIGFwcFN0YXRlLnNpbXVsYXRlZFNlbGVjdGlvbi5kZWxldGUoaWQpO1xuICAgICAgICAgICAgICBlbHNlIGFwcFN0YXRlLnNpbXVsYXRlZFNlbGVjdGlvbi5hZGQoaWQpO1xuICAgICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ2dyb3VwJykge1xuICAgICAgICAgICAgICBjaHJvbWUudGFicy5xdWVyeSh7fSkudGhlbih0YWJzID0+IHtcbiAgICAgICAgICAgICAgICAgY29uc3QgZ3JvdXBUYWJzID0gdGFicy5maWx0ZXIodCA9PiB0Lmdyb3VwSWQgPT09IGlkKTtcbiAgICAgICAgICAgICAgICAgY29uc3QgYWxsU2VsZWN0ZWQgPSBncm91cFRhYnMuZXZlcnkodCA9PiB0LmlkICYmIGFwcFN0YXRlLnNpbXVsYXRlZFNlbGVjdGlvbi5oYXModC5pZCkpO1xuICAgICAgICAgICAgICAgICBncm91cFRhYnMuZm9yRWFjaCh0ID0+IHtcbiAgICAgICAgICAgICAgICAgICAgIGlmICh0LmlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGFsbFNlbGVjdGVkKSBhcHBTdGF0ZS5zaW11bGF0ZWRTZWxlY3Rpb24uZGVsZXRlKHQuaWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgIGVsc2UgYXBwU3RhdGUuc2ltdWxhdGVkU2VsZWN0aW9uLmFkZCh0LmlkKTtcbiAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgIHJlbmRlckxpdmVWaWV3KCk7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICByZXR1cm47IC8vIGFzeW5jIHVwZGF0ZVxuICAgICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3dpbmRvdycpIHtcbiAgICAgICAgICAgICAgY2hyb21lLnRhYnMucXVlcnkoe30pLnRoZW4odGFicyA9PiB7XG4gICAgICAgICAgICAgICAgIGNvbnN0IHdpblRhYnMgPSB0YWJzLmZpbHRlcih0ID0+IHQud2luZG93SWQgPT09IGlkKTtcbiAgICAgICAgICAgICAgICAgY29uc3QgYWxsU2VsZWN0ZWQgPSB3aW5UYWJzLmV2ZXJ5KHQgPT4gdC5pZCAmJiBhcHBTdGF0ZS5zaW11bGF0ZWRTZWxlY3Rpb24uaGFzKHQuaWQpKTtcbiAgICAgICAgICAgICAgICAgd2luVGFicy5mb3JFYWNoKHQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgaWYgKHQuaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoYWxsU2VsZWN0ZWQpIGFwcFN0YXRlLnNpbXVsYXRlZFNlbGVjdGlvbi5kZWxldGUodC5pZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSBhcHBTdGF0ZS5zaW11bGF0ZWRTZWxlY3Rpb24uYWRkKHQuaWQpO1xuICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgcmVuZGVyTGl2ZVZpZXcoKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIHJldHVybjsgLy8gYXN5bmMgdXBkYXRlXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmVuZGVyTGl2ZVZpZXcoKTtcbiAgICAgIH0pO1xuICB9XG59XG4iLCAiaW1wb3J0IHsgYXBwU3RhdGUgfSBmcm9tIFwiLi9zdGF0ZS5qc1wiO1xuaW1wb3J0IHsgc2V0Q3VzdG9tU3RyYXRlZ2llcyB9IGZyb20gXCIuLi8uLi9iYWNrZ3JvdW5kL2dyb3VwaW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgcmVuZGVyQWxnb3JpdGhtc1ZpZXcsIHNob3dNb2RhbCB9IGZyb20gXCIuL2NvbXBvbmVudHMuanNcIjtcbmltcG9ydCB7IHJlbmRlclN0cmF0ZWd5Q29uZmlnIH0gZnJvbSBcIi4vc2ltdWxhdGlvbi5qc1wiO1xuaW1wb3J0IHsgUHJlZmVyZW5jZXMsIEN1c3RvbVN0cmF0ZWd5IH0gZnJvbSBcIi4uLy4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgU1RSQVRFR0lFUyB9IGZyb20gXCIuLi8uLi9zaGFyZWQvc3RyYXRlZ3lSZWdpc3RyeS5qc1wiO1xuaW1wb3J0IHsgbG9nSW5mbyB9IGZyb20gXCIuLi8uLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBlc2NhcGVIdG1sIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC91dGlscy5qc1wiO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbG9hZFByZWZlcmVuY2VzQW5kSW5pdCgpIHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2xvYWRQcmVmZXJlbmNlcycgfSk7XG4gICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vayAmJiByZXNwb25zZS5kYXRhKSB7XG4gICAgICAgICAgICBjb25zdCBwcmVmcyA9IHJlc3BvbnNlLmRhdGEgYXMgUHJlZmVyZW5jZXM7XG4gICAgICAgICAgICBhcHBTdGF0ZS5sb2NhbEN1c3RvbVN0cmF0ZWdpZXMgPSBwcmVmcy5jdXN0b21TdHJhdGVnaWVzIHx8IFtdO1xuICAgICAgICAgICAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhhcHBTdGF0ZS5sb2NhbEN1c3RvbVN0cmF0ZWdpZXMpO1xuICAgICAgICAgICAgcmVuZGVyU3RyYXRlZ3lMb2FkT3B0aW9ucygpO1xuICAgICAgICAgICAgcmVuZGVyU3RyYXRlZ3lMaXN0VGFibGUoKTtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBsb2FkIHByZWZlcmVuY2VzXCIsIGUpO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlclN0cmF0ZWd5TG9hZE9wdGlvbnMoKSB7XG4gICAgY29uc3Qgc2VsZWN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0ZWd5LWxvYWQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQgfCBudWxsO1xuICAgIGlmICghc2VsZWN0KSByZXR1cm47XG5cbiAgICBjb25zdCBjdXN0b21PcHRpb25zID0gYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzXG4gICAgICAgIC5zbGljZSgpXG4gICAgICAgIC5zb3J0KChhLCBiKSA9PiBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCkpXG4gICAgICAgIC5tYXAoc3RyYXRlZ3kgPT4gYFxuICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIiR7ZXNjYXBlSHRtbChzdHJhdGVneS5pZCl9XCI+JHtlc2NhcGVIdG1sKHN0cmF0ZWd5LmxhYmVsKX0gKCR7ZXNjYXBlSHRtbChzdHJhdGVneS5pZCl9KTwvb3B0aW9uPlxuICAgICAgICBgKS5qb2luKCcnKTtcblxuICAgIGNvbnN0IGJ1aWx0SW5PcHRpb25zID0gU1RSQVRFR0lFU1xuICAgICAgICAuZmlsdGVyKHMgPT4gIWFwcFN0YXRlLmxvY2FsQ3VzdG9tU3RyYXRlZ2llcy5zb21lKGNzID0+IGNzLmlkID09PSBzLmlkKSlcbiAgICAgICAgLm1hcChzdHJhdGVneSA9PiBgXG4gICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiJHtlc2NhcGVIdG1sKHN0cmF0ZWd5LmlkIGFzIHN0cmluZyl9XCI+JHtlc2NhcGVIdG1sKHN0cmF0ZWd5LmxhYmVsKX0gKEJ1aWx0LWluKTwvb3B0aW9uPlxuICAgICAgICBgKS5qb2luKCcnKTtcblxuICAgIHNlbGVjdC5pbm5lckhUTUwgPSBgPG9wdGlvbiB2YWx1ZT1cIlwiPkxvYWQgc2F2ZWQgc3RyYXRlZ3kuLi48L29wdGlvbj5gICtcbiAgICAgICAgKGN1c3RvbU9wdGlvbnMgPyBgPG9wdGdyb3VwIGxhYmVsPVwiQ3VzdG9tIFN0cmF0ZWdpZXNcIj4ke2N1c3RvbU9wdGlvbnN9PC9vcHRncm91cD5gIDogJycpICtcbiAgICAgICAgKGJ1aWx0SW5PcHRpb25zID8gYDxvcHRncm91cCBsYWJlbD1cIkJ1aWx0LWluIFN0cmF0ZWdpZXNcIj4ke2J1aWx0SW5PcHRpb25zfTwvb3B0Z3JvdXA+YCA6ICcnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlclN0cmF0ZWd5TGlzdFRhYmxlKCkge1xuICAgIGNvbnN0IHRhYmxlQm9keSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdGVneS10YWJsZS1ib2R5Jyk7XG4gICAgaWYgKCF0YWJsZUJvZHkpIHJldHVybjtcblxuICAgIGNvbnN0IGN1c3RvbUlkcyA9IG5ldyBTZXQoYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzLm1hcChzdHJhdGVneSA9PiBzdHJhdGVneS5pZCkpO1xuICAgIGNvbnN0IGJ1aWx0SW5Sb3dzID0gU1RSQVRFR0lFUy5tYXAoc3RyYXRlZ3kgPT4gKHtcbiAgICAgICAgLi4uc3RyYXRlZ3ksXG4gICAgICAgIHNvdXJjZUxhYmVsOiAnQnVpbHQtaW4nLFxuICAgICAgICBjb25maWdTdW1tYXJ5OiAnXHUyMDE0JyxcbiAgICAgICAgYXV0b1J1bkxhYmVsOiAnXHUyMDE0JyxcbiAgICAgICAgYWN0aW9uczogJydcbiAgICB9KSk7XG5cbiAgICBjb25zdCBjdXN0b21Sb3dzID0gYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzLm1hcChzdHJhdGVneSA9PiB7XG4gICAgICAgIGNvbnN0IG92ZXJyaWRlc0J1aWx0SW4gPSBjdXN0b21JZHMuaGFzKHN0cmF0ZWd5LmlkKSAmJiBTVFJBVEVHSUVTLnNvbWUoYnVpbHRJbiA9PiBidWlsdEluLmlkID09PSBzdHJhdGVneS5pZCk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBpZDogc3RyYXRlZ3kuaWQsXG4gICAgICAgICAgICBsYWJlbDogc3RyYXRlZ3kubGFiZWwsXG4gICAgICAgICAgICBpc0dyb3VwaW5nOiB0cnVlLFxuICAgICAgICAgICAgaXNTb3J0aW5nOiB0cnVlLFxuICAgICAgICAgICAgc291cmNlTGFiZWw6IG92ZXJyaWRlc0J1aWx0SW4gPyAnQ3VzdG9tIChvdmVycmlkZXMgYnVpbHQtaW4pJyA6ICdDdXN0b20nLFxuICAgICAgICAgICAgY29uZmlnU3VtbWFyeTogYEZpbHRlcnM6ICR7c3RyYXRlZ3kuZmlsdGVycz8ubGVuZ3RoIHx8IDB9LCBHcm91cHM6ICR7c3RyYXRlZ3kuZ3JvdXBpbmdSdWxlcz8ubGVuZ3RoIHx8IDB9LCBTb3J0czogJHtzdHJhdGVneS5zb3J0aW5nUnVsZXM/Lmxlbmd0aCB8fCAwfWAsXG4gICAgICAgICAgICBhdXRvUnVuTGFiZWw6IHN0cmF0ZWd5LmF1dG9SdW4gPyAnWWVzJyA6ICdObycsXG4gICAgICAgICAgICBhY3Rpb25zOiBgPGJ1dHRvbiBjbGFzcz1cImRlbGV0ZS1zdHJhdGVneS1yb3dcIiBkYXRhLWlkPVwiJHtlc2NhcGVIdG1sKHN0cmF0ZWd5LmlkKX1cIiBzdHlsZT1cImNvbG9yOiByZWQ7XCI+RGVsZXRlPC9idXR0b24+YFxuICAgICAgICB9O1xuICAgIH0pO1xuXG4gICAgY29uc3QgYWxsUm93cyA9IFsuLi5idWlsdEluUm93cywgLi4uY3VzdG9tUm93c107XG5cbiAgICBpZiAoYWxsUm93cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgdGFibGVCb2R5LmlubmVySFRNTCA9ICc8dHI+PHRkIGNvbHNwYW49XCI3XCIgc3R5bGU9XCJjb2xvcjogIzg4ODtcIj5ObyBzdHJhdGVnaWVzIGZvdW5kLjwvdGQ+PC90cj4nO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGFibGVCb2R5LmlubmVySFRNTCA9IGFsbFJvd3MubWFwKHJvdyA9PiB7XG4gICAgICAgIGNvbnN0IGNhcGFiaWxpdGllcyA9IFtyb3cuaXNHcm91cGluZyA/ICdHcm91cGluZycgOiBudWxsLCByb3cuaXNTb3J0aW5nID8gJ1NvcnRpbmcnIDogbnVsbF0uZmlsdGVyKEJvb2xlYW4pLmpvaW4oJywgJyk7XG4gICAgICAgIHJldHVybiBgXG4gICAgICAgIDx0cj5cbiAgICAgICAgICAgIDx0ZD4ke2VzY2FwZUh0bWwocm93LmxhYmVsKX08L3RkPlxuICAgICAgICAgICAgPHRkPiR7ZXNjYXBlSHRtbChTdHJpbmcocm93LmlkKSl9PC90ZD5cbiAgICAgICAgICAgIDx0ZD4ke2VzY2FwZUh0bWwocm93LnNvdXJjZUxhYmVsKX08L3RkPlxuICAgICAgICAgICAgPHRkPiR7ZXNjYXBlSHRtbChjYXBhYmlsaXRpZXMpfTwvdGQ+XG4gICAgICAgICAgICA8dGQ+JHtlc2NhcGVIdG1sKHJvdy5jb25maWdTdW1tYXJ5KX08L3RkPlxuICAgICAgICAgICAgPHRkPiR7ZXNjYXBlSHRtbChyb3cuYXV0b1J1bkxhYmVsKX08L3RkPlxuICAgICAgICAgICAgPHRkPiR7cm93LmFjdGlvbnN9PC90ZD5cbiAgICAgICAgPC90cj5cbiAgICAgICAgYDtcbiAgICB9KS5qb2luKCcnKTtcblxuICAgIHRhYmxlQm9keS5xdWVyeVNlbGVjdG9yQWxsKCcuZGVsZXRlLXN0cmF0ZWd5LXJvdycpLmZvckVhY2goYnRuID0+IHtcbiAgICAgICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgYXN5bmMgKGUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGlkID0gKGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5kYXRhc2V0LmlkO1xuICAgICAgICAgICAgaWYgKGlkICYmIGNvbmZpcm0oYERlbGV0ZSBzdHJhdGVneSBcIiR7aWR9XCI/YCkpIHtcbiAgICAgICAgICAgICAgICBhd2FpdCBkZWxldGVDdXN0b21TdHJhdGVneShpZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZGVsZXRlQ3VzdG9tU3RyYXRlZ3koaWQ6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICAgIGxvZ0luZm8oXCJEZWxldGluZyBzdHJhdGVneVwiLCB7IGlkIH0pO1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2xvYWRQcmVmZXJlbmNlcycgfSk7XG4gICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vayAmJiByZXNwb25zZS5kYXRhKSB7XG4gICAgICAgICAgICBjb25zdCBwcmVmcyA9IHJlc3BvbnNlLmRhdGEgYXMgUHJlZmVyZW5jZXM7XG4gICAgICAgICAgICBjb25zdCBuZXdTdHJhdGVnaWVzID0gKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pLmZpbHRlcihzID0+IHMuaWQgIT09IGlkKTtcblxuICAgICAgICAgICAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICAgIHR5cGU6ICdzYXZlUHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgICAgIHBheWxvYWQ6IHsgY3VzdG9tU3RyYXRlZ2llczogbmV3U3RyYXRlZ2llcyB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzID0gbmV3U3RyYXRlZ2llcztcbiAgICAgICAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMoYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzKTtcbiAgICAgICAgICAgIHJlbmRlclN0cmF0ZWd5TG9hZE9wdGlvbnMoKTtcbiAgICAgICAgICAgIHJlbmRlclN0cmF0ZWd5TGlzdFRhYmxlKCk7XG4gICAgICAgICAgICByZW5kZXJBbGdvcml0aG1zVmlldygpO1xuICAgICAgICAgICAgcmVuZGVyU3RyYXRlZ3lDb25maWcoKTtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBkZWxldGUgc3RyYXRlZ3lcIiwgZSk7XG4gICAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2F2ZVN0cmF0ZWd5KHN0cmF0OiBDdXN0b21TdHJhdGVneSwgc2hvd1N1Y2Nlc3M6IGJvb2xlYW4pOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICB0cnkge1xuICAgICAgICBsb2dJbmZvKFwiU2F2aW5nIHN0cmF0ZWd5XCIsIHsgaWQ6IHN0cmF0LmlkIH0pO1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2xvYWRQcmVmZXJlbmNlcycgfSk7XG4gICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vayAmJiByZXNwb25zZS5kYXRhKSB7XG4gICAgICAgICAgICBjb25zdCBwcmVmcyA9IHJlc3BvbnNlLmRhdGEgYXMgUHJlZmVyZW5jZXM7XG4gICAgICAgICAgICBsZXQgY3VycmVudFN0cmF0ZWdpZXMgPSBwcmVmcy5jdXN0b21TdHJhdGVnaWVzIHx8IFtdO1xuXG4gICAgICAgICAgICAvLyBGaW5kIGV4aXN0aW5nIHRvIHByZXNlcnZlIHByb3BzIChsaWtlIGF1dG9SdW4pXG4gICAgICAgICAgICBjb25zdCBleGlzdGluZyA9IGN1cnJlbnRTdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdC5pZCk7XG4gICAgICAgICAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgICAgICAgICAgICBzdHJhdC5hdXRvUnVuID0gZXhpc3RpbmcuYXV0b1J1bjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gUmVtb3ZlIGV4aXN0aW5nIGlmIHNhbWUgSURcbiAgICAgICAgICAgIGN1cnJlbnRTdHJhdGVnaWVzID0gY3VycmVudFN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gcy5pZCAhPT0gc3RyYXQuaWQpO1xuICAgICAgICAgICAgY3VycmVudFN0cmF0ZWdpZXMucHVzaChzdHJhdCk7XG5cbiAgICAgICAgICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnc2F2ZVByZWZlcmVuY2VzJyxcbiAgICAgICAgICAgICAgICBwYXlsb2FkOiB7IGN1c3RvbVN0cmF0ZWdpZXM6IGN1cnJlbnRTdHJhdGVnaWVzIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBhcHBTdGF0ZS5sb2NhbEN1c3RvbVN0cmF0ZWdpZXMgPSBjdXJyZW50U3RyYXRlZ2llcztcbiAgICAgICAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMoYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzKTtcblxuICAgICAgICAgICAgcmVuZGVyU3RyYXRlZ3lMb2FkT3B0aW9ucygpO1xuICAgICAgICAgICAgcmVuZGVyU3RyYXRlZ3lMaXN0VGFibGUoKTtcbiAgICAgICAgICAgIHJlbmRlckFsZ29yaXRobXNWaWV3KCk7XG4gICAgICAgICAgICByZW5kZXJTdHJhdGVneUNvbmZpZygpO1xuICAgICAgICAgICAgaWYgKHNob3dTdWNjZXNzKSBhbGVydChcIlN0cmF0ZWd5IHNhdmVkIVwiKTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gc2F2ZSBzdHJhdGVneVwiLCBlKTtcbiAgICAgICAgYWxlcnQoXCJFcnJvciBzYXZpbmcgc3RyYXRlZ3lcIik7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHBvcnRBbGxTdHJhdGVnaWVzKCkge1xuICAgIGxvZ0luZm8oXCJFeHBvcnRpbmcgYWxsIHN0cmF0ZWdpZXNcIiwgeyBjb3VudDogYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzLmxlbmd0aCB9KTtcbiAgICBjb25zdCBqc29uID0gSlNPTi5zdHJpbmdpZnkoYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzLCBudWxsLCAyKTtcbiAgICBjb25zdCBjb250ZW50ID0gYFxuICAgICAgICA8cD5Db3B5IHRoZSBKU09OIGJlbG93IChjb250YWlucyAke2FwcFN0YXRlLmxvY2FsQ3VzdG9tU3RyYXRlZ2llcy5sZW5ndGh9IHN0cmF0ZWdpZXMpOjwvcD5cbiAgICAgICAgPHRleHRhcmVhIHN0eWxlPVwid2lkdGg6IDEwMCU7IGhlaWdodDogMzAwcHg7IGZvbnQtZmFtaWx5OiBtb25vc3BhY2U7XCI+JHtlc2NhcGVIdG1sKGpzb24pfTwvdGV4dGFyZWE+XG4gICAgYDtcbiAgICBzaG93TW9kYWwoXCJFeHBvcnQgQWxsIFN0cmF0ZWdpZXNcIiwgY29udGVudCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbXBvcnRBbGxTdHJhdGVnaWVzKCkge1xuICAgIGNvbnN0IGNvbnRlbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBjb250ZW50LmlubmVySFRNTCA9IGBcbiAgICAgICAgPHA+UGFzdGUgU3RyYXRlZ3kgTGlzdCBKU09OIGJlbG93OjwvcD5cbiAgICAgICAgPHAgc3R5bGU9XCJmb250LXNpemU6IDAuOWVtOyBjb2xvcjogIzY2NjtcIj5Ob3RlOiBTdHJhdGVnaWVzIHdpdGggbWF0Y2hpbmcgSURzIHdpbGwgYmUgb3ZlcndyaXR0ZW4uPC9wPlxuICAgICAgICA8dGV4dGFyZWEgaWQ9XCJpbXBvcnQtYWxsLWFyZWFcIiBzdHlsZT1cIndpZHRoOiAxMDAlOyBoZWlnaHQ6IDIwMHB4OyBmb250LWZhbWlseTogbW9ub3NwYWNlOyBtYXJnaW4tYm90dG9tOiAxMHB4O1wiPjwvdGV4dGFyZWE+XG4gICAgICAgIDxidXR0b24gaWQ9XCJpbXBvcnQtYWxsLWNvbmZpcm1cIiBjbGFzcz1cInN1Y2Nlc3MtYnRuXCI+SW1wb3J0IEFsbDwvYnV0dG9uPlxuICAgIGA7XG5cbiAgICBjb25zdCBidG4gPSBjb250ZW50LnF1ZXJ5U2VsZWN0b3IoJyNpbXBvcnQtYWxsLWNvbmZpcm0nKTtcbiAgICBidG4/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgYXN5bmMgKCkgPT4ge1xuICAgICAgICBjb25zdCB0eHQgPSAoY29udGVudC5xdWVyeVNlbGVjdG9yKCcjaW1wb3J0LWFsbC1hcmVhJykgYXMgSFRNTFRleHRBcmVhRWxlbWVudCkudmFsdWU7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBqc29uID0gSlNPTi5wYXJzZSh0eHQpO1xuICAgICAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KGpzb24pKSB7XG4gICAgICAgICAgICAgICAgYWxlcnQoXCJJbnZhbGlkIGZvcm1hdDogRXhwZWN0ZWQgYW4gYXJyYXkgb2Ygc3RyYXRlZ2llcy5cIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBWYWxpZGF0ZSBpdGVtc1xuICAgICAgICAgICAgY29uc3QgaW52YWxpZCA9IGpzb24uZmluZChzID0+ICFzLmlkIHx8ICFzLmxhYmVsKTtcbiAgICAgICAgICAgIGlmIChpbnZhbGlkKSB7XG4gICAgICAgICAgICAgICAgYWxlcnQoXCJJbnZhbGlkIHN0cmF0ZWd5IGluIGxpc3Q6IG1pc3NpbmcgSUQgb3IgTGFiZWwuXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gTWVyZ2UgbG9naWMgKFVwc2VydClcbiAgICAgICAgICAgIGNvbnN0IHN0cmF0TWFwID0gbmV3IE1hcChhcHBTdGF0ZS5sb2NhbEN1c3RvbVN0cmF0ZWdpZXMubWFwKHMgPT4gW3MuaWQsIHNdKSk7XG5cbiAgICAgICAgICAgIGxldCBjb3VudCA9IDA7XG4gICAgICAgICAgICBqc29uLmZvckVhY2goKHM6IEN1c3RvbVN0cmF0ZWd5KSA9PiB7XG4gICAgICAgICAgICAgICAgc3RyYXRNYXAuc2V0KHMuaWQsIHMpO1xuICAgICAgICAgICAgICAgIGNvdW50Kys7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgY29uc3QgbmV3U3RyYXRlZ2llcyA9IEFycmF5LmZyb20oc3RyYXRNYXAudmFsdWVzKCkpO1xuXG4gICAgICAgICAgICBsb2dJbmZvKFwiSW1wb3J0aW5nIGFsbCBzdHJhdGVnaWVzXCIsIHsgY291bnQ6IG5ld1N0cmF0ZWdpZXMubGVuZ3RoIH0pO1xuXG4gICAgICAgICAgICAvLyBTYXZlXG4gICAgICAgICAgICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICAgICAgdHlwZTogJ3NhdmVQcmVmZXJlbmNlcycsXG4gICAgICAgICAgICAgICAgcGF5bG9hZDogeyBjdXN0b21TdHJhdGVnaWVzOiBuZXdTdHJhdGVnaWVzIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBVcGRhdGUgbG9jYWwgc3RhdGVcbiAgICAgICAgICAgIGFwcFN0YXRlLmxvY2FsQ3VzdG9tU3RyYXRlZ2llcyA9IG5ld1N0cmF0ZWdpZXM7XG4gICAgICAgICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKGFwcFN0YXRlLmxvY2FsQ3VzdG9tU3RyYXRlZ2llcyk7XG5cbiAgICAgICAgICAgIHJlbmRlclN0cmF0ZWd5TG9hZE9wdGlvbnMoKTtcbiAgICAgICAgICAgIHJlbmRlclN0cmF0ZWd5TGlzdFRhYmxlKCk7XG4gICAgICAgICAgICByZW5kZXJBbGdvcml0aG1zVmlldygpO1xuICAgICAgICAgICAgcmVuZGVyU3RyYXRlZ3lDb25maWcoKTtcblxuICAgICAgICAgICAgYWxlcnQoYEltcG9ydGVkICR7Y291bnR9IHN0cmF0ZWdpZXMuYCk7XG4gICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcubW9kYWwtb3ZlcmxheScpPy5yZW1vdmUoKTtcblxuICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICAgIGFsZXJ0KFwiSW52YWxpZCBKU09OOiBcIiArIGUpO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBzaG93TW9kYWwoXCJJbXBvcnQgQWxsIFN0cmF0ZWdpZXNcIiwgY29udGVudCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbml0U3RyYXRlZ2llcygpIHtcbiAgICBjb25zdCBleHBvcnRBbGxCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXRlZ3ktbGlzdC1leHBvcnQtYnRuJyk7XG4gICAgY29uc3QgaW1wb3J0QWxsQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0ZWd5LWxpc3QtaW1wb3J0LWJ0bicpO1xuICAgIGlmIChleHBvcnRBbGxCdG4pIGV4cG9ydEFsbEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGV4cG9ydEFsbFN0cmF0ZWdpZXMpO1xuICAgIGlmIChpbXBvcnRBbGxCdG4pIGltcG9ydEFsbEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGltcG9ydEFsbFN0cmF0ZWdpZXMpO1xufVxuIiwgImltcG9ydCB7IGFwcFN0YXRlIH0gZnJvbSBcIi4vc3RhdGUuanNcIjtcbmltcG9ydCB7IHNob3dNb2RhbCB9IGZyb20gXCIuL2NvbXBvbmVudHMuanNcIjtcbmltcG9ydCB7IHNhdmVTdHJhdGVneSwgcmVuZGVyU3RyYXRlZ3lMb2FkT3B0aW9ucywgcmVuZGVyU3RyYXRlZ3lMaXN0VGFibGUgfSBmcm9tIFwiLi9zdHJhdGVnaWVzLmpzXCI7XG5pbXBvcnQgeyByZW5kZXJTdHJhdGVneUNvbmZpZywgcmVuZGVyTGl2ZVZpZXcgfSBmcm9tIFwiLi9zaW11bGF0aW9uLmpzXCI7XG5pbXBvcnQgeyBnZXRNYXBwZWRUYWJzIH0gZnJvbSBcIi4vZGF0YS5qc1wiO1xuaW1wb3J0IHsgbG9hZFRhYnMgfSBmcm9tIFwiLi90YWJzVGFibGUuanNcIjtcbmltcG9ydCB7IFNUUkFURUdJRVMsIGdldFN0cmF0ZWdpZXMgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL3N0cmF0ZWd5UmVnaXN0cnkuanNcIjtcbmltcG9ydCB7IEN1c3RvbVN0cmF0ZWd5LCBSdWxlQ29uZGl0aW9uLCBHcm91cGluZ1J1bGUsIFNvcnRpbmdSdWxlIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgZ3JvdXBUYWJzLCBzZXRDdXN0b21TdHJhdGVnaWVzIH0gZnJvbSBcIi4uLy4uL2JhY2tncm91bmQvZ3JvdXBpbmdTdHJhdGVnaWVzLmpzXCI7XG5pbXBvcnQgeyBzb3J0VGFicyB9IGZyb20gXCIuLi8uLi9iYWNrZ3JvdW5kL3NvcnRpbmdTdHJhdGVnaWVzLmpzXCI7XG5pbXBvcnQgeyBsb2dJbmZvIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC9sb2dnZXIuanNcIjtcbmltcG9ydCB7IGVzY2FwZUh0bWwgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL3V0aWxzLmpzXCI7XG5cbmNvbnN0IEZJRUxEX09QVElPTlMgPSBgXG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInVybFwiPlVSTDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJ0aXRsZVwiPlRpdGxlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImRvbWFpblwiPkRvbWFpbjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJzdWJkb21haW5cIj5TdWJkb21haW48L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiaWRcIj5JRDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJpbmRleFwiPkluZGV4PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIndpbmRvd0lkXCI+V2luZG93IElEPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImdyb3VwSWRcIj5Hcm91cCBJRDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJhY3RpdmVcIj5BY3RpdmU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwic2VsZWN0ZWRcIj5TZWxlY3RlZDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJwaW5uZWRcIj5QaW5uZWQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwic3RhdHVzXCI+U3RhdHVzPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIm9wZW5lclRhYklkXCI+T3BlbmVyIElEPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInBhcmVudFRpdGxlXCI+UGFyZW50IFRpdGxlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImxhc3RBY2Nlc3NlZFwiPkxhc3QgQWNjZXNzZWQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZ2VucmVcIj5HZW5yZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0XCI+Q29udGV4dCBTdW1tYXJ5PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHREYXRhLnNpdGVOYW1lXCI+U2l0ZSBOYW1lPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHREYXRhLmNhbm9uaWNhbFVybFwiPkNhbm9uaWNhbCBVUkw8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEubm9ybWFsaXplZFVybFwiPk5vcm1hbGl6ZWQgVVJMPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHREYXRhLnBsYXRmb3JtXCI+UGxhdGZvcm08L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEub2JqZWN0VHlwZVwiPk9iamVjdCBUeXBlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHREYXRhLm9iamVjdElkXCI+T2JqZWN0IElEPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHREYXRhLnRpdGxlXCI+RXh0cmFjdGVkIFRpdGxlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHREYXRhLmRlc2NyaXB0aW9uXCI+RGVzY3JpcHRpb248L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEuYXV0aG9yT3JDcmVhdG9yXCI+QXV0aG9yL0NyZWF0b3I8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEucHVibGlzaGVkQXRcIj5QdWJsaXNoZWQgQXQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEubW9kaWZpZWRBdFwiPk1vZGlmaWVkIEF0PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHREYXRhLmxhbmd1YWdlXCI+TGFuZ3VhZ2U8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEuaXNBdWRpYmxlXCI+SXMgQXVkaWJsZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5pc011dGVkXCI+SXMgTXV0ZWQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEuaGFzVW5zYXZlZENoYW5nZXNMaWtlbHlcIj5VbnNhdmVkIENoYW5nZXM8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEuaXNBdXRoZW50aWNhdGVkTGlrZWx5XCI+QXV0aGVudGljYXRlZDwvb3B0aW9uPmA7XG5cbmNvbnN0IE9QRVJBVE9SX09QVElPTlMgPSBgXG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRhaW5zXCI+Y29udGFpbnM8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZG9lc05vdENvbnRhaW5cIj5kb2VzIG5vdCBjb250YWluPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIm1hdGNoZXNcIj5tYXRjaGVzIHJlZ2V4PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImVxdWFsc1wiPmVxdWFsczwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJzdGFydHNXaXRoXCI+c3RhcnRzIHdpdGg8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZW5kc1dpdGhcIj5lbmRzIHdpdGg8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZXhpc3RzXCI+ZXhpc3RzPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImRvZXNOb3RFeGlzdFwiPmRvZXMgbm90IGV4aXN0PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImlzTnVsbFwiPmlzIG51bGw8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiaXNOb3ROdWxsXCI+aXMgbm90IG51bGw8L29wdGlvbj5gO1xuXG5leHBvcnQgZnVuY3Rpb24gaW5pdFN0cmF0ZWd5QnVpbGRlcigpIHtcbiAgICBjb25zdCBhZGRGaWx0ZXJHcm91cEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhZGQtZmlsdGVyLWdyb3VwLWJ0bicpO1xuICAgIGNvbnN0IGFkZEdyb3VwQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FkZC1ncm91cC1idG4nKTtcbiAgICBjb25zdCBhZGRTb3J0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FkZC1zb3J0LWJ0bicpO1xuICAgIGNvbnN0IGxvYWRTZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXRlZ3ktbG9hZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCB8IG51bGw7XG5cbiAgICAvLyBOZXc6IEdyb3VwIFNvcnRpbmdcbiAgICBjb25zdCBhZGRHcm91cFNvcnRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWRkLWdyb3VwLXNvcnQtYnRuJyk7XG4gICAgY29uc3QgZ3JvdXBTb3J0Q2hlY2sgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtc29ydGdyb3Vwcy1jaGVjaycpO1xuXG4gICAgY29uc3Qgc2F2ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdidWlsZGVyLXNhdmUtYnRuJyk7XG4gICAgY29uc3QgcnVuQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J1aWxkZXItcnVuLWJ0bicpO1xuICAgIGNvbnN0IHJ1bkxpdmVCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnVpbGRlci1ydW4tbGl2ZS1idG4nKTtcbiAgICBjb25zdCBjbGVhckJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdidWlsZGVyLWNsZWFyLWJ0bicpO1xuXG4gICAgY29uc3QgZXhwb3J0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J1aWxkZXItZXhwb3J0LWJ0bicpO1xuICAgIGNvbnN0IGltcG9ydEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdidWlsZGVyLWltcG9ydC1idG4nKTtcblxuICAgIGlmIChleHBvcnRCdG4pIGV4cG9ydEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGV4cG9ydEJ1aWxkZXJTdHJhdGVneSk7XG4gICAgaWYgKGltcG9ydEJ0bikgaW1wb3J0QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgaW1wb3J0QnVpbGRlclN0cmF0ZWd5KTtcblxuICAgIGlmIChhZGRGaWx0ZXJHcm91cEJ0bikgYWRkRmlsdGVyR3JvdXBCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBhZGRGaWx0ZXJHcm91cFJvdygpKTtcbiAgICBpZiAoYWRkR3JvdXBCdG4pIGFkZEdyb3VwQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gYWRkQnVpbGRlclJvdygnZ3JvdXAnKSk7XG4gICAgaWYgKGFkZFNvcnRCdG4pIGFkZFNvcnRCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBhZGRCdWlsZGVyUm93KCdzb3J0JykpO1xuICAgIGlmIChhZGRHcm91cFNvcnRCdG4pIGFkZEdyb3VwU29ydEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGFkZEJ1aWxkZXJSb3coJ2dyb3VwU29ydCcpKTtcblxuICAgIGlmIChncm91cFNvcnRDaGVjaykge1xuICAgICAgICBncm91cFNvcnRDaGVjay5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgY2hlY2tlZCA9IChlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS5jaGVja2VkO1xuICAgICAgICAgICAgY29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dyb3VwLXNvcnQtcm93cy1jb250YWluZXInKTtcbiAgICAgICAgICAgIGNvbnN0IGFkZEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhZGQtZ3JvdXAtc29ydC1idG4nKTtcbiAgICAgICAgICAgIGlmIChjb250YWluZXIgJiYgYWRkQnRuKSB7XG4gICAgICAgICAgICAgICAgY29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSBjaGVja2VkID8gJ2Jsb2NrJyA6ICdub25lJztcbiAgICAgICAgICAgICAgICBhZGRCdG4uc3R5bGUuZGlzcGxheSA9IGNoZWNrZWQgPyAnYmxvY2snIDogJ25vbmUnO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBpZiAoc2F2ZUJ0bikgc2F2ZUJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHNhdmVDdXN0b21TdHJhdGVneUZyb21CdWlsZGVyKHRydWUpKTtcbiAgICBpZiAocnVuQnRuKSBydW5CdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBydW5CdWlsZGVyU2ltdWxhdGlvbik7XG4gICAgaWYgKHJ1bkxpdmVCdG4pIHJ1bkxpdmVCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBydW5CdWlsZGVyTGl2ZSk7XG4gICAgaWYgKGNsZWFyQnRuKSBjbGVhckJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGNsZWFyQnVpbGRlcik7XG5cbiAgICBpZiAobG9hZFNlbGVjdCkge1xuICAgICAgICBsb2FkU2VsZWN0LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHNlbGVjdGVkSWQgPSBsb2FkU2VsZWN0LnZhbHVlO1xuICAgICAgICAgICAgaWYgKCFzZWxlY3RlZElkKSByZXR1cm47XG5cbiAgICAgICAgICAgIGxldCBzdHJhdCA9IGFwcFN0YXRlLmxvY2FsQ3VzdG9tU3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gc2VsZWN0ZWRJZCk7XG4gICAgICAgICAgICBpZiAoIXN0cmF0KSB7XG4gICAgICAgICAgICAgICAgc3RyYXQgPSBnZXRCdWlsdEluU3RyYXRlZ3lDb25maWcoc2VsZWN0ZWRJZCkgfHwgdW5kZWZpbmVkO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoc3RyYXQpIHtcbiAgICAgICAgICAgICAgICBwb3B1bGF0ZUJ1aWxkZXJGcm9tU3RyYXRlZ3koc3RyYXQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRCdWlsdEluU3RyYXRlZ3lDb25maWcoaWQ6IHN0cmluZyk6IEN1c3RvbVN0cmF0ZWd5IHwgbnVsbCB7XG4gICAgY29uc3QgYmFzZTogQ3VzdG9tU3RyYXRlZ3kgPSB7XG4gICAgICAgIGlkOiBpZCxcbiAgICAgICAgbGFiZWw6IFNUUkFURUdJRVMuZmluZChzID0+IHMuaWQgPT09IGlkKT8ubGFiZWwgfHwgaWQsXG4gICAgICAgIGZpbHRlcnM6IFtdLFxuICAgICAgICBncm91cGluZ1J1bGVzOiBbXSxcbiAgICAgICAgc29ydGluZ1J1bGVzOiBbXSxcbiAgICAgICAgZ3JvdXBTb3J0aW5nUnVsZXM6IFtdLFxuICAgICAgICBmYWxsYmFjazogJ01pc2MnLFxuICAgICAgICBzb3J0R3JvdXBzOiBmYWxzZSxcbiAgICAgICAgYXV0b1J1bjogZmFsc2VcbiAgICB9O1xuXG4gICAgc3dpdGNoIChpZCkge1xuICAgICAgICBjYXNlICdkb21haW4nOlxuICAgICAgICAgICAgYmFzZS5ncm91cGluZ1J1bGVzID0gW3sgc291cmNlOiAnZmllbGQnLCB2YWx1ZTogJ2RvbWFpbicsIHRyYW5zZm9ybTogJ3N0cmlwVGxkJywgY29sb3I6ICdyYW5kb20nIH1dO1xuICAgICAgICAgICAgYmFzZS5zb3J0aW5nUnVsZXMgPSBbeyBmaWVsZDogJ2RvbWFpbicsIG9yZGVyOiAnYXNjJyB9XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdkb21haW5fZnVsbCc6XG4gICAgICAgICAgICAgYmFzZS5ncm91cGluZ1J1bGVzID0gW3sgc291cmNlOiAnZmllbGQnLCB2YWx1ZTogJ2RvbWFpbicsIHRyYW5zZm9ybTogJ25vbmUnLCBjb2xvcjogJ3JhbmRvbScgfV07XG4gICAgICAgICAgICAgYmFzZS5zb3J0aW5nUnVsZXMgPSBbeyBmaWVsZDogJ2RvbWFpbicsIG9yZGVyOiAnYXNjJyB9XTtcbiAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAndG9waWMnOlxuICAgICAgICAgICAgYmFzZS5ncm91cGluZ1J1bGVzID0gW3sgc291cmNlOiAnZmllbGQnLCB2YWx1ZTogJ2dlbnJlJywgY29sb3I6ICdyYW5kb20nIH1dO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2NvbnRleHQnOlxuICAgICAgICAgICAgYmFzZS5ncm91cGluZ1J1bGVzID0gW3sgc291cmNlOiAnZmllbGQnLCB2YWx1ZTogJ2NvbnRleHQnLCBjb2xvcjogJ3JhbmRvbScgfV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnbGluZWFnZSc6XG4gICAgICAgICAgICBiYXNlLmdyb3VwaW5nUnVsZXMgPSBbeyBzb3VyY2U6ICdmaWVsZCcsIHZhbHVlOiAncGFyZW50VGl0bGUnLCBjb2xvcjogJ3JhbmRvbScgfV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAncGlubmVkJzpcbiAgICAgICAgICAgICBiYXNlLnNvcnRpbmdSdWxlcyA9IFt7IGZpZWxkOiAncGlubmVkJywgb3JkZXI6ICdkZXNjJyB9XTtcbiAgICAgICAgICAgICBiYXNlLmdyb3VwaW5nUnVsZXMgPSBbeyBzb3VyY2U6ICdmaWVsZCcsIHZhbHVlOiAncGlubmVkJywgY29sb3I6ICdyYW5kb20nIH1dO1xuICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdyZWNlbmN5JzpcbiAgICAgICAgICAgIGJhc2Uuc29ydGluZ1J1bGVzID0gW3sgZmllbGQ6ICdsYXN0QWNjZXNzZWQnLCBvcmRlcjogJ2Rlc2MnIH1dO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2FnZSc6XG4gICAgICAgICAgICAgYmFzZS5zb3J0aW5nUnVsZXMgPSBbeyBmaWVsZDogJ2xhc3RBY2Nlc3NlZCcsIG9yZGVyOiAnZGVzYycgfV07XG4gICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3VybCc6XG4gICAgICAgICAgICBiYXNlLnNvcnRpbmdSdWxlcyA9IFt7IGZpZWxkOiAndXJsJywgb3JkZXI6ICdhc2MnIH1dO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3RpdGxlJzpcbiAgICAgICAgICAgIGJhc2Uuc29ydGluZ1J1bGVzID0gW3sgZmllbGQ6ICd0aXRsZScsIG9yZGVyOiAnYXNjJyB9XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICduZXN0aW5nJzpcbiAgICAgICAgICAgICBiYXNlLnNvcnRpbmdSdWxlcyA9IFt7IGZpZWxkOiAncGFyZW50VGl0bGUnLCBvcmRlcjogJ2FzYycgfV07XG4gICAgICAgICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgcmV0dXJuIGJhc2U7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRGaWx0ZXJHcm91cFJvdyhjb25kaXRpb25zPzogUnVsZUNvbmRpdGlvbltdKSB7XG4gICAgY29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2ZpbHRlci1yb3dzLWNvbnRhaW5lcicpO1xuICAgIGlmICghY29udGFpbmVyKSByZXR1cm47XG5cbiAgICBjb25zdCBncm91cERpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGdyb3VwRGl2LmNsYXNzTmFtZSA9ICdmaWx0ZXItZ3JvdXAtcm93JztcblxuICAgIGdyb3VwRGl2LmlubmVySFRNTCA9IGBcbiAgICAgICAgPGRpdiBjbGFzcz1cImZpbHRlci1ncm91cC1oZWFkZXJcIj5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiZmlsdGVyLWdyb3VwLXRpdGxlXCI+R3JvdXAgKEFORCk8L3NwYW4+XG4gICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwic21hbGwtYnRuIGJ0bi1kZWwtZ3JvdXBcIj5EZWxldGUgR3JvdXA8L2J1dHRvbj5cbiAgICAgICAgPC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJjb25kaXRpb25zLWNvbnRhaW5lclwiPjwvZGl2PlxuICAgICAgICA8YnV0dG9uIGNsYXNzPVwic21hbGwtYnRuIGJ0bi1hZGQtY29uZGl0aW9uXCI+KyBBZGQgQ29uZGl0aW9uPC9idXR0b24+XG4gICAgYDtcblxuICAgIGdyb3VwRGl2LnF1ZXJ5U2VsZWN0b3IoJy5idG4tZGVsLWdyb3VwJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICBncm91cERpdi5yZW1vdmUoKTtcbiAgICAgICAgdXBkYXRlQnJlYWRjcnVtYigpO1xuICAgIH0pO1xuXG4gICAgY29uc3QgY29uZGl0aW9uc0NvbnRhaW5lciA9IGdyb3VwRGl2LnF1ZXJ5U2VsZWN0b3IoJy5jb25kaXRpb25zLWNvbnRhaW5lcicpIGFzIEhUTUxFbGVtZW50O1xuICAgIGNvbnN0IGFkZENvbmRpdGlvbkJ0biA9IGdyb3VwRGl2LnF1ZXJ5U2VsZWN0b3IoJy5idG4tYWRkLWNvbmRpdGlvbicpO1xuXG4gICAgY29uc3QgYWRkQ29uZGl0aW9uID0gKGRhdGE/OiBSdWxlQ29uZGl0aW9uKSA9PiB7XG4gICAgICAgIGNvbnN0IGRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICBkaXYuY2xhc3NOYW1lID0gJ2J1aWxkZXItcm93IGNvbmRpdGlvbi1yb3cnO1xuICAgICAgICBkaXYuc3R5bGUuZGlzcGxheSA9ICdmbGV4JztcbiAgICAgICAgZGl2LnN0eWxlLmdhcCA9ICc1cHgnO1xuICAgICAgICBkaXYuc3R5bGUubWFyZ2luQm90dG9tID0gJzVweCc7XG4gICAgICAgIGRpdi5zdHlsZS5hbGlnbkl0ZW1zID0gJ2NlbnRlcic7XG5cbiAgICAgICAgZGl2LmlubmVySFRNTCA9IGBcbiAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJmaWVsZC1zZWxlY3RcIj5cbiAgICAgICAgICAgICAgICAke0ZJRUxEX09QVElPTlN9XG4gICAgICAgICAgICA8L3NlbGVjdD5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwib3BlcmF0b3ItY29udGFpbmVyXCI+XG4gICAgICAgICAgICAgICAgPHNlbGVjdCBjbGFzcz1cIm9wZXJhdG9yLXNlbGVjdFwiPlxuICAgICAgICAgICAgICAgICAgICAke09QRVJBVE9SX09QVElPTlN9XG4gICAgICAgICAgICAgICAgPC9zZWxlY3Q+XG4gICAgICAgICAgICA8L3NwYW4+XG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cInZhbHVlLWNvbnRhaW5lclwiPlxuICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwidGV4dFwiIGNsYXNzPVwidmFsdWUtaW5wdXRcIiBwbGFjZWhvbGRlcj1cIlZhbHVlXCI+XG4gICAgICAgICAgICA8L3NwYW4+XG4gICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwic21hbGwtYnRuIGJ0bi1kZWwtY29uZGl0aW9uXCIgc3R5bGU9XCJiYWNrZ3JvdW5kOiBub25lOyBib3JkZXI6IG5vbmU7IGNvbG9yOiByZWQ7XCI+JnRpbWVzOzwvYnV0dG9uPlxuICAgICAgICBgO1xuXG4gICAgICAgIGNvbnN0IGZpZWxkU2VsZWN0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5maWVsZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgY29uc3Qgb3BlcmF0b3JDb250YWluZXIgPSBkaXYucXVlcnlTZWxlY3RvcignLm9wZXJhdG9yLWNvbnRhaW5lcicpIGFzIEhUTUxFbGVtZW50O1xuICAgICAgICBjb25zdCB2YWx1ZUNvbnRhaW5lciA9IGRpdi5xdWVyeVNlbGVjdG9yKCcudmFsdWUtY29udGFpbmVyJykgYXMgSFRNTEVsZW1lbnQ7XG5cbiAgICAgICAgY29uc3QgdXBkYXRlU3RhdGUgPSAoaW5pdGlhbE9wPzogc3RyaW5nLCBpbml0aWFsVmFsPzogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgICBjb25zdCB2YWwgPSBmaWVsZFNlbGVjdC52YWx1ZTtcbiAgICAgICAgICAgIC8vIEhhbmRsZSBib29sZWFuIGZpZWxkc1xuICAgICAgICAgICAgaWYgKFsnc2VsZWN0ZWQnLCAncGlubmVkJ10uaW5jbHVkZXModmFsKSkge1xuICAgICAgICAgICAgICAgIG9wZXJhdG9yQ29udGFpbmVyLmlubmVySFRNTCA9IGA8c2VsZWN0IGNsYXNzPVwib3BlcmF0b3Itc2VsZWN0XCIgZGlzYWJsZWQgc3R5bGU9XCJiYWNrZ3JvdW5kOiAjZWVlOyBjb2xvcjogIzU1NTtcIj48b3B0aW9uIHZhbHVlPVwiZXF1YWxzXCI+aXM8L29wdGlvbj48L3NlbGVjdD5gO1xuICAgICAgICAgICAgICAgIHZhbHVlQ29udGFpbmVyLmlubmVySFRNTCA9IGBcbiAgICAgICAgICAgICAgICAgICAgPHNlbGVjdCBjbGFzcz1cInZhbHVlLWlucHV0XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwidHJ1ZVwiPlRydWU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJmYWxzZVwiPkZhbHNlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgICAgIDwvc2VsZWN0PlxuICAgICAgICAgICAgICAgIGA7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIGFscmVhZHkgaW4gc3RhbmRhcmQgbW9kZSB0byBhdm9pZCB1bm5lY2Vzc2FyeSBET00gdGhyYXNoaW5nXG4gICAgICAgICAgICAgICAgaWYgKCFvcGVyYXRvckNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdzZWxlY3Q6bm90KFtkaXNhYmxlZF0pJykpIHtcbiAgICAgICAgICAgICAgICAgICAgb3BlcmF0b3JDb250YWluZXIuaW5uZXJIVE1MID0gYDxzZWxlY3QgY2xhc3M9XCJvcGVyYXRvci1zZWxlY3RcIj4ke09QRVJBVE9SX09QVElPTlN9PC9zZWxlY3Q+YDtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWVDb250YWluZXIuaW5uZXJIVE1MID0gYDxpbnB1dCB0eXBlPVwidGV4dFwiIGNsYXNzPVwidmFsdWUtaW5wdXRcIiBwbGFjZWhvbGRlcj1cIlZhbHVlXCI+YDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFJlc3RvcmUgdmFsdWVzIGlmIHByb3ZpZGVkIChlc3BlY2lhbGx5IHdoZW4gc3dpdGNoaW5nIGJhY2sgb3IgaW5pdGlhbGl6aW5nKVxuICAgICAgICAgICAgaWYgKGluaXRpYWxPcCB8fCBpbml0aWFsVmFsKSB7XG4gICAgICAgICAgICAgICAgIGNvbnN0IG9wRWwgPSBkaXYucXVlcnlTZWxlY3RvcignLm9wZXJhdG9yLXNlbGVjdCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQgfCBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgICAgICAgICAgY29uc3QgdmFsRWwgPSBkaXYucXVlcnlTZWxlY3RvcignLnZhbHVlLWlucHV0JykgYXMgSFRNTElucHV0RWxlbWVudCB8IEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICAgICAgICAgICBpZiAob3BFbCAmJiBpbml0aWFsT3ApIG9wRWwudmFsdWUgPSBpbml0aWFsT3A7XG4gICAgICAgICAgICAgICAgIGlmICh2YWxFbCAmJiBpbml0aWFsVmFsKSB2YWxFbC52YWx1ZSA9IGluaXRpYWxWYWw7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFJlLWF0dGFjaCBsaXN0ZW5lcnMgdG8gbmV3IGVsZW1lbnRzXG4gICAgICAgICAgICBkaXYucXVlcnlTZWxlY3RvckFsbCgnaW5wdXQsIHNlbGVjdCcpLmZvckVhY2goZWwgPT4ge1xuICAgICAgICAgICAgICAgIGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIHVwZGF0ZUJyZWFkY3J1bWIpO1xuICAgICAgICAgICAgICAgIGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2lucHV0JywgdXBkYXRlQnJlYWRjcnVtYik7XG4gICAgICAgICAgICAgICAgZWwuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgdXBkYXRlQnJlYWRjcnVtYik7XG4gICAgICAgICAgICAgICAgZWwuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCB1cGRhdGVCcmVhZGNydW1iKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIGZpZWxkU2VsZWN0LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsICgpID0+IHtcbiAgICAgICAgICAgIHVwZGF0ZVN0YXRlKCk7XG4gICAgICAgICAgICB1cGRhdGVCcmVhZGNydW1iKCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChkYXRhKSB7XG4gICAgICAgICAgICBmaWVsZFNlbGVjdC52YWx1ZSA9IGRhdGEuZmllbGQ7XG4gICAgICAgICAgICB1cGRhdGVTdGF0ZShkYXRhLm9wZXJhdG9yLCBkYXRhLnZhbHVlKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHVwZGF0ZVN0YXRlKCk7XG4gICAgICAgIH1cblxuICAgICAgICBkaXYucXVlcnlTZWxlY3RvcignLmJ0bi1kZWwtY29uZGl0aW9uJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICAgICAgZGl2LnJlbW92ZSgpO1xuICAgICAgICAgICAgdXBkYXRlQnJlYWRjcnVtYigpO1xuICAgICAgICB9KTtcblxuICAgICAgICBjb25kaXRpb25zQ29udGFpbmVyLmFwcGVuZENoaWxkKGRpdik7XG4gICAgfTtcblxuICAgIGFkZENvbmRpdGlvbkJ0bj8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBhZGRDb25kaXRpb24oKSk7XG5cbiAgICBpZiAoY29uZGl0aW9ucyAmJiBjb25kaXRpb25zLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29uZGl0aW9ucy5mb3JFYWNoKGMgPT4gYWRkQ29uZGl0aW9uKGMpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICAvLyBBZGQgb25lIGVtcHR5IGNvbmRpdGlvbiBieSBkZWZhdWx0XG4gICAgICAgIGFkZENvbmRpdGlvbigpO1xuICAgIH1cblxuICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChncm91cERpdik7XG4gICAgdXBkYXRlQnJlYWRjcnVtYigpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkQnVpbGRlclJvdyh0eXBlOiAnZ3JvdXAnIHwgJ3NvcnQnIHwgJ2dyb3VwU29ydCcsIGRhdGE/OiBhbnkpIHtcbiAgICBsZXQgY29udGFpbmVySWQgPSAnJztcbiAgICBpZiAodHlwZSA9PT0gJ2dyb3VwJykgY29udGFpbmVySWQgPSAnZ3JvdXAtcm93cy1jb250YWluZXInO1xuICAgIGVsc2UgaWYgKHR5cGUgPT09ICdzb3J0JykgY29udGFpbmVySWQgPSAnc29ydC1yb3dzLWNvbnRhaW5lcic7XG4gICAgZWxzZSBpZiAodHlwZSA9PT0gJ2dyb3VwU29ydCcpIGNvbnRhaW5lcklkID0gJ2dyb3VwLXNvcnQtcm93cy1jb250YWluZXInO1xuXG4gICAgY29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoY29udGFpbmVySWQpO1xuICAgIGlmICghY29udGFpbmVyKSByZXR1cm47XG5cbiAgICBjb25zdCBkaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBkaXYuY2xhc3NOYW1lID0gJ2J1aWxkZXItcm93JztcbiAgICBkaXYuZGF0YXNldC50eXBlID0gdHlwZTtcblxuICAgIGlmICh0eXBlID09PSAnZ3JvdXAnKSB7XG4gICAgICAgIGRpdi5zdHlsZS5mbGV4V3JhcCA9ICd3cmFwJztcbiAgICAgICAgZGl2LmlubmVySFRNTCA9IGBcbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwicm93LW51bWJlclwiPjwvc3Bhbj5cbiAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJzb3VyY2Utc2VsZWN0XCI+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImZpZWxkXCI+RmllbGQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZml4ZWRcIj5GaXhlZCBWYWx1ZTwvb3B0aW9uPlxuICAgICAgICAgICAgPC9zZWxlY3Q+XG5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiaW5wdXQtY29udGFpbmVyXCI+XG4gICAgICAgICAgICAgICAgIDwhLS0gV2lsbCBiZSBwb3B1bGF0ZWQgYmFzZWQgb24gc291cmNlIHNlbGVjdGlvbiAtLT5cbiAgICAgICAgICAgICAgICAgPHNlbGVjdCBjbGFzcz1cImZpZWxkLXNlbGVjdCB2YWx1ZS1pbnB1dC1maWVsZFwiPlxuICAgICAgICAgICAgICAgICAgICAke0ZJRUxEX09QVElPTlN9XG4gICAgICAgICAgICAgICAgIDwvc2VsZWN0PlxuICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInRleHRcIiBjbGFzcz1cInZhbHVlLWlucHV0LXRleHRcIiBwbGFjZWhvbGRlcj1cIkdyb3VwIE5hbWVcIiBzdHlsZT1cImRpc3BsYXk6bm9uZTtcIj5cbiAgICAgICAgICAgIDwvc3Bhbj5cblxuICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJtYXJnaW4tbGVmdDogMTBweDtcIj5UcmFuc2Zvcm06PC9zcGFuPlxuICAgICAgICAgICAgPHNlbGVjdCBjbGFzcz1cInRyYW5zZm9ybS1zZWxlY3RcIj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwibm9uZVwiPk5vbmU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwic3RyaXBUbGRcIj5TdHJpcCBUTEQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZG9tYWluXCI+R2V0IERvbWFpbjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJob3N0bmFtZVwiPkdldCBIb3N0bmFtZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJsb3dlcmNhc2VcIj5Mb3dlcmNhc2U8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwidXBwZXJjYXNlXCI+VXBwZXJjYXNlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImZpcnN0Q2hhclwiPkZpcnN0IENoYXI8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwicmVnZXhcIj5SZWdleCBFeHRyYWN0aW9uPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInJlZ2V4UmVwbGFjZVwiPlJlZ2V4IFJlcGxhY2U8L29wdGlvbj5cbiAgICAgICAgICAgIDwvc2VsZWN0PlxuXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwicmVnZXgtY29udGFpbmVyXCIgc3R5bGU9XCJkaXNwbGF5Om5vbmU7IGZsZXgtYmFzaXM6IDEwMCU7IG1hcmdpbi10b3A6IDhweDsgcGFkZGluZzogOHB4OyBiYWNrZ3JvdW5kOiAjZjhmOWZhOyBib3JkZXI6IDFweCBkYXNoZWQgI2NlZDRkYTsgYm9yZGVyLXJhZGl1czogNHB4O1wiPlxuICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBnYXA6IDhweDsgbWFyZ2luLWJvdHRvbTogNXB4O1wiPlxuICAgICAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cImZvbnQtd2VpZ2h0OiA1MDA7IGZvbnQtc2l6ZTogMC45ZW07XCI+UGF0dGVybjo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwidGV4dFwiIGNsYXNzPVwidHJhbnNmb3JtLXBhdHRlcm5cIiBwbGFjZWhvbGRlcj1cImUuZy4gXihcXHcrKS0oXFxkKykkXCIgc3R5bGU9XCJmbGV4OjE7XCI+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIHRpdGxlPVwiRm9yIGV4dHJhY3Rpb246IENhcHR1cmVzIGFsbCBncm91cHMgYW5kIGNvbmNhdGVuYXRlcyB0aGVtLiBFeGFtcGxlOiAndXNlci0oXFxkKyknIC0+ICcxMjMnLiBGb3IgcmVwbGFjZW1lbnQ6IFN0YW5kYXJkIEpTIHJlZ2V4LlwiIHN0eWxlPVwiY3Vyc29yOiBoZWxwOyBjb2xvcjogIzAwN2JmZjsgZm9udC13ZWlnaHQ6IGJvbGQ7IGJhY2tncm91bmQ6ICNlN2YxZmY7IHdpZHRoOiAxOHB4OyBoZWlnaHQ6IDE4cHg7IGRpc3BsYXk6IGlubGluZS1mbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjsgYm9yZGVyLXJhZGl1czogNTAlOyBmb250LXNpemU6IDEycHg7XCI+Pzwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwicmVwbGFjZW1lbnQtY29udGFpbmVyXCIgc3R5bGU9XCJkaXNwbGF5Om5vbmU7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGdhcDogOHB4OyBtYXJnaW4tYm90dG9tOiA1cHg7XCI+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiZm9udC13ZWlnaHQ6IDUwMDsgZm9udC1zaXplOiAwLjllbTtcIj5SZXBsYWNlOjwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgY2xhc3M9XCJ0cmFuc2Zvcm0tcmVwbGFjZW1lbnRcIiBwbGFjZWhvbGRlcj1cImUuZy4gJDIgJDFcIiBzdHlsZT1cImZsZXg6MTtcIj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTogZmxleDsgZ2FwOiA4cHg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGZvbnQtc2l6ZTogMC45ZW07XCI+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiZm9udC13ZWlnaHQ6IDUwMDtcIj5UZXN0Ojwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgY2xhc3M9XCJyZWdleC10ZXN0LWlucHV0XCIgcGxhY2Vob2xkZXI9XCJUZXN0IFN0cmluZ1wiIHN0eWxlPVwiZmxleDogMTtcIj5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW4+JnJhcnI7PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz1cInJlZ2V4LXRlc3QtcmVzdWx0XCIgc3R5bGU9XCJmb250LWZhbWlseTogbW9ub3NwYWNlOyBiYWNrZ3JvdW5kOiB3aGl0ZTsgcGFkZGluZzogMnB4IDVweDsgYm9yZGVyOiAxcHggc29saWQgI2RkZDsgYm9yZGVyLXJhZGl1czogM3B4OyBtaW4td2lkdGg6IDYwcHg7XCI+KHByZXZpZXcpPC9zcGFuPlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwibWFyZ2luLWxlZnQ6IDEwcHg7XCI+V2luZG93Ojwvc3Bhbj5cbiAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJ3aW5kb3ctbW9kZS1zZWxlY3RcIj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY3VycmVudFwiPkN1cnJlbnQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29tcG91bmRcIj5Db21wb3VuZDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJuZXdcIj5OZXc8L29wdGlvbj5cbiAgICAgICAgICAgIDwvc2VsZWN0PlxuXG4gICAgICAgICAgICA8c3BhbiBzdHlsZT1cIm1hcmdpbi1sZWZ0OiAxMHB4O1wiPkNvbG9yOjwvc3Bhbj5cbiAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJjb2xvci1pbnB1dFwiPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJncmV5XCI+R3JleTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJibHVlXCI+Qmx1ZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJyZWRcIj5SZWQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwieWVsbG93XCI+WWVsbG93PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImdyZWVuXCI+R3JlZW48L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwicGlua1wiPlBpbms8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwicHVycGxlXCI+UHVycGxlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImN5YW5cIj5DeWFuPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIm9yYW5nZVwiPk9yYW5nZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJtYXRjaFwiPk1hdGNoIFZhbHVlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImZpZWxkXCI+Q29sb3IgYnkgRmllbGQ8L29wdGlvbj5cbiAgICAgICAgICAgIDwvc2VsZWN0PlxuICAgICAgICAgICAgPHNlbGVjdCBjbGFzcz1cImNvbG9yLWZpZWxkLXNlbGVjdFwiIHN0eWxlPVwiZGlzcGxheTpub25lO1wiPlxuICAgICAgICAgICAgICAgICR7RklFTERfT1BUSU9OU31cbiAgICAgICAgICAgIDwvc2VsZWN0PlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJjb2xvci10cmFuc2Zvcm0tY29udGFpbmVyXCIgc3R5bGU9XCJkaXNwbGF5Om5vbmU7IG1hcmdpbi1sZWZ0OiA1cHg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7XCI+XG4gICAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJmb250LXNpemU6IDAuOWVtOyBtYXJnaW4tcmlnaHQ6IDNweDtcIj5UcmFuczo8L3NwYW4+XG4gICAgICAgICAgICAgICAgPHNlbGVjdCBjbGFzcz1cImNvbG9yLXRyYW5zZm9ybS1zZWxlY3RcIj5cbiAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIm5vbmVcIj5Ob25lPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJzdHJpcFRsZFwiPlN0cmlwIFRMRDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZG9tYWluXCI+R2V0IERvbWFpbjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiaG9zdG5hbWVcIj5HZXQgSG9zdG5hbWU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImxvd2VyY2FzZVwiPkxvd2VyY2FzZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwidXBwZXJjYXNlXCI+VXBwZXJjYXNlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJmaXJzdENoYXJcIj5GaXJzdCBDaGFyPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJyZWdleFwiPlJlZ2V4PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPC9zZWxlY3Q+XG4gICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgY2xhc3M9XCJjb2xvci10cmFuc2Zvcm0tcGF0dGVyblwiIHBsYWNlaG9sZGVyPVwiUmVnZXhcIiBzdHlsZT1cImRpc3BsYXk6bm9uZTsgd2lkdGg6IDgwcHg7IG1hcmdpbi1sZWZ0OiAzcHg7XCI+XG4gICAgICAgICAgICA8L3NwYW4+XG4gICAgICAgICAgICA8bGFiZWw+PGlucHV0IHR5cGU9XCJjaGVja2JveFwiIGNsYXNzPVwicmFuZG9tLWNvbG9yLWNoZWNrXCIgY2hlY2tlZD4gUmFuZG9tPC9sYWJlbD5cblxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInJvdy1hY3Rpb25zXCI+XG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInNtYWxsLWJ0biBidG4tZGVsXCIgc3R5bGU9XCJiYWNrZ3JvdW5kOiAjZmZjY2NjOyBjb2xvcjogZGFya3JlZDtcIj5EZWxldGU8L2J1dHRvbj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICBgO1xuXG4gICAgICAgIC8vIEFkZCBzcGVjaWZpYyBsaXN0ZW5lcnMgZm9yIEdyb3VwIHJvd1xuICAgICAgICBjb25zdCBzb3VyY2VTZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLnNvdXJjZS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgY29uc3QgZmllbGRTZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLnZhbHVlLWlucHV0LWZpZWxkJykgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IHRleHRJbnB1dCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcudmFsdWUtaW5wdXQtdGV4dCcpIGFzIEhUTUxFbGVtZW50O1xuICAgICAgICBjb25zdCBjb2xvcklucHV0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5jb2xvci1pbnB1dCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICBjb25zdCBjb2xvckZpZWxkU2VsZWN0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5jb2xvci1maWVsZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgY29uc3QgY29sb3JUcmFuc2Zvcm1Db250YWluZXIgPSBkaXYucXVlcnlTZWxlY3RvcignLmNvbG9yLXRyYW5zZm9ybS1jb250YWluZXInKSBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgY29uc3QgY29sb3JUcmFuc2Zvcm1TZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLmNvbG9yLXRyYW5zZm9ybS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgY29uc3QgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5jb2xvci10cmFuc2Zvcm0tcGF0dGVybicpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IHJhbmRvbUNoZWNrID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5yYW5kb20tY29sb3ItY2hlY2snKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuXG4gICAgICAgIC8vIFJlZ2V4IExvZ2ljXG4gICAgICAgIGNvbnN0IHRyYW5zZm9ybVNlbGVjdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcudHJhbnNmb3JtLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICBjb25zdCByZWdleENvbnRhaW5lciA9IGRpdi5xdWVyeVNlbGVjdG9yKCcucmVnZXgtY29udGFpbmVyJykgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IHBhdHRlcm5JbnB1dCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcudHJhbnNmb3JtLXBhdHRlcm4nKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICBjb25zdCByZXBsYWNlbWVudElucHV0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy50cmFuc2Zvcm0tcmVwbGFjZW1lbnQnKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICBjb25zdCB0ZXN0SW5wdXQgPSBkaXYucXVlcnlTZWxlY3RvcignLnJlZ2V4LXRlc3QtaW5wdXQnKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICBjb25zdCB0ZXN0UmVzdWx0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5yZWdleC10ZXN0LXJlc3VsdCcpIGFzIEhUTUxFbGVtZW50O1xuXG4gICAgICAgIGNvbnN0IHRvZ2dsZVRyYW5zZm9ybSA9ICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHZhbCA9IHRyYW5zZm9ybVNlbGVjdC52YWx1ZTtcbiAgICAgICAgICAgIGlmICh2YWwgPT09ICdyZWdleCcgfHwgdmFsID09PSAncmVnZXhSZXBsYWNlJykge1xuICAgICAgICAgICAgICAgIHJlZ2V4Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlcENvbnRhaW5lciA9IGRpdi5xdWVyeVNlbGVjdG9yKCcucmVwbGFjZW1lbnQtY29udGFpbmVyJykgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICAgICAgICAgICAgaWYgKHJlcENvbnRhaW5lcikge1xuICAgICAgICAgICAgICAgICAgICByZXBDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IHZhbCA9PT0gJ3JlZ2V4UmVwbGFjZScgPyAnZmxleCcgOiAnbm9uZSc7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZWdleENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdXBkYXRlQnJlYWRjcnVtYigpO1xuICAgICAgICB9O1xuICAgICAgICB0cmFuc2Zvcm1TZWxlY3QuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgdG9nZ2xlVHJhbnNmb3JtKTtcblxuICAgICAgICBjb25zdCB1cGRhdGVUZXN0ID0gKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgcGF0ID0gcGF0dGVybklucHV0LnZhbHVlO1xuICAgICAgICAgICAgY29uc3QgdHh0ID0gdGVzdElucHV0LnZhbHVlO1xuICAgICAgICAgICAgaWYgKCFwYXQgfHwgIXR4dCkge1xuICAgICAgICAgICAgICAgICB0ZXN0UmVzdWx0LnRleHRDb250ZW50ID0gXCIocHJldmlldylcIjtcbiAgICAgICAgICAgICAgICAgdGVzdFJlc3VsdC5zdHlsZS5jb2xvciA9IFwiIzU1NVwiO1xuICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGlmICh0cmFuc2Zvcm1TZWxlY3QudmFsdWUgPT09ICdyZWdleFJlcGxhY2UnKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlcCA9IHJlcGxhY2VtZW50SW5wdXQudmFsdWUgfHwgXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzID0gdHh0LnJlcGxhY2UobmV3IFJlZ0V4cChwYXQsICdnJyksIHJlcCk7XG4gICAgICAgICAgICAgICAgICAgIHRlc3RSZXN1bHQudGV4dENvbnRlbnQgPSByZXM7XG4gICAgICAgICAgICAgICAgICAgIHRlc3RSZXN1bHQuc3R5bGUuY29sb3IgPSBcImdyZWVuXCI7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKHBhdCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1hdGNoID0gcmVnZXguZXhlYyh0eHQpO1xuICAgICAgICAgICAgICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICBsZXQgZXh0cmFjdGVkID0gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IG1hdGNoLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4dHJhY3RlZCArPSBtYXRjaFtpXSB8fCBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICB0ZXN0UmVzdWx0LnRleHRDb250ZW50ID0gZXh0cmFjdGVkIHx8IFwiKGVtcHR5IGdyb3VwKVwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgIHRlc3RSZXN1bHQuc3R5bGUuY29sb3IgPSBcImdyZWVuXCI7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgdGVzdFJlc3VsdC50ZXh0Q29udGVudCA9IFwiKG5vIG1hdGNoKVwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgIHRlc3RSZXN1bHQuc3R5bGUuY29sb3IgPSBcInJlZFwiO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIHRlc3RSZXN1bHQudGV4dENvbnRlbnQgPSBcIihpbnZhbGlkIHJlZ2V4KVwiO1xuICAgICAgICAgICAgICAgIHRlc3RSZXN1bHQuc3R5bGUuY29sb3IgPSBcInJlZFwiO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICBwYXR0ZXJuSW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCAoKSA9PiB7IHVwZGF0ZVRlc3QoKTsgdXBkYXRlQnJlYWRjcnVtYigpOyB9KTtcbiAgICAgICAgaWYgKHJlcGxhY2VtZW50SW5wdXQpIHtcbiAgICAgICAgICAgIHJlcGxhY2VtZW50SW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCAoKSA9PiB7IHVwZGF0ZVRlc3QoKTsgdXBkYXRlQnJlYWRjcnVtYigpOyB9KTtcbiAgICAgICAgfVxuICAgICAgICB0ZXN0SW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCB1cGRhdGVUZXN0KTtcblxuXG4gICAgICAgIC8vIFRvZ2dsZSBpbnB1dCB0eXBlXG4gICAgICAgIGNvbnN0IHRvZ2dsZUlucHV0ID0gKCkgPT4ge1xuICAgICAgICAgICAgaWYgKHNvdXJjZVNlbGVjdC52YWx1ZSA9PT0gJ2ZpZWxkJykge1xuICAgICAgICAgICAgICAgIGZpZWxkU2VsZWN0LnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lLWJsb2NrJztcbiAgICAgICAgICAgICAgICB0ZXh0SW5wdXQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZmllbGRTZWxlY3Quc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgICAgICAgICB0ZXh0SW5wdXQuc3R5bGUuZGlzcGxheSA9ICdpbmxpbmUtYmxvY2snO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdXBkYXRlQnJlYWRjcnVtYigpO1xuICAgICAgICB9O1xuICAgICAgICBzb3VyY2VTZWxlY3QuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgdG9nZ2xlSW5wdXQpO1xuXG4gICAgICAgIC8vIFRvZ2dsZSBjb2xvciB0cmFuc2Zvcm0gcGF0dGVyblxuICAgICAgICBjb25zdCB0b2dnbGVDb2xvclRyYW5zZm9ybSA9ICgpID0+IHtcbiAgICAgICAgICAgICBpZiAoY29sb3JUcmFuc2Zvcm1TZWxlY3QudmFsdWUgPT09ICdyZWdleCcpIHtcbiAgICAgICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuLnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lLWJsb2NrJztcbiAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICBjb2xvclRyYW5zZm9ybVBhdHRlcm4uc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgdXBkYXRlQnJlYWRjcnVtYigpO1xuICAgICAgICB9O1xuICAgICAgICBjb2xvclRyYW5zZm9ybVNlbGVjdC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB0b2dnbGVDb2xvclRyYW5zZm9ybSk7XG4gICAgICAgIGNvbG9yVHJhbnNmb3JtUGF0dGVybi5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIHVwZGF0ZUJyZWFkY3J1bWIpO1xuXG4gICAgICAgIC8vIFRvZ2dsZSBjb2xvciBpbnB1dFxuICAgICAgICBjb25zdCB0b2dnbGVDb2xvciA9ICgpID0+IHtcbiAgICAgICAgICAgIGlmIChyYW5kb21DaGVjay5jaGVja2VkKSB7XG4gICAgICAgICAgICAgICAgY29sb3JJbnB1dC5kaXNhYmxlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgY29sb3JJbnB1dC5zdHlsZS5vcGFjaXR5ID0gJzAuNSc7XG4gICAgICAgICAgICAgICAgY29sb3JGaWVsZFNlbGVjdC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICAgICAgICAgIGNvbG9yVHJhbnNmb3JtQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbG9ySW5wdXQuZGlzYWJsZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBjb2xvcklucHV0LnN0eWxlLm9wYWNpdHkgPSAnMSc7XG4gICAgICAgICAgICAgICAgaWYgKGNvbG9ySW5wdXQudmFsdWUgPT09ICdmaWVsZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgY29sb3JGaWVsZFNlbGVjdC5zdHlsZS5kaXNwbGF5ID0gJ2lubGluZS1ibG9jayc7XG4gICAgICAgICAgICAgICAgICAgIGNvbG9yVHJhbnNmb3JtQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lLWZsZXgnO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbG9yRmllbGRTZWxlY3Quc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm1Db250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHJhbmRvbUNoZWNrLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIHRvZ2dsZUNvbG9yKTtcbiAgICAgICAgY29sb3JJbnB1dC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB0b2dnbGVDb2xvcik7XG4gICAgICAgIHRvZ2dsZUNvbG9yKCk7IC8vIGluaXRcblxuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3NvcnQnIHx8IHR5cGUgPT09ICdncm91cFNvcnQnKSB7XG4gICAgICAgIGRpdi5pbm5lckhUTUwgPSBgXG4gICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwiZmllbGQtc2VsZWN0XCI+XG4gICAgICAgICAgICAgICAgJHtGSUVMRF9PUFRJT05TfVxuICAgICAgICAgICAgPC9zZWxlY3Q+XG4gICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwib3JkZXItc2VsZWN0XCI+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImFzY1wiPmEgdG8geiAoYXNjKTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJkZXNjXCI+eiB0byBhIChkZXNjKTwvb3B0aW9uPlxuICAgICAgICAgICAgPC9zZWxlY3Q+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwicm93LWFjdGlvbnNcIj5cbiAgICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInNtYWxsLWJ0biBidG4tZGVsXCIgc3R5bGU9XCJiYWNrZ3JvdW5kOiAjZmZjY2NjOyBjb2xvcjogZGFya3JlZDtcIj5EZWxldGU8L2J1dHRvbj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICBgO1xuICAgIH1cblxuICAgIC8vIFBvcHVsYXRlIGRhdGEgaWYgcHJvdmlkZWQgKGZvciBlZGl0aW5nKVxuICAgIGlmIChkYXRhKSB7XG4gICAgICAgIGlmICh0eXBlID09PSAnZ3JvdXAnKSB7XG4gICAgICAgICAgICBjb25zdCBzb3VyY2VTZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLnNvdXJjZS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkU2VsZWN0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dC1maWVsZCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICAgICAgY29uc3QgdGV4dElucHV0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dC10ZXh0JykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgICAgIGNvbnN0IHRyYW5zZm9ybVNlbGVjdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcudHJhbnNmb3JtLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICAgICAgY29uc3QgY29sb3JJbnB1dCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcuY29sb3ItaW5wdXQnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgICAgIGNvbnN0IGNvbG9yRmllbGRTZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLmNvbG9yLWZpZWxkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICAgICAgY29uc3QgY29sb3JUcmFuc2Zvcm1TZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLmNvbG9yLXRyYW5zZm9ybS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgICAgIGNvbnN0IGNvbG9yVHJhbnNmb3JtUGF0dGVybiA9IGRpdi5xdWVyeVNlbGVjdG9yKCcuY29sb3ItdHJhbnNmb3JtLXBhdHRlcm4nKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICAgICAgY29uc3QgcmFuZG9tQ2hlY2sgPSBkaXYucXVlcnlTZWxlY3RvcignLnJhbmRvbS1jb2xvci1jaGVjaycpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgICAgICBjb25zdCB3aW5kb3dNb2RlU2VsZWN0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy53aW5kb3ctbW9kZS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcblxuICAgICAgICAgICAgaWYgKGRhdGEuc291cmNlKSBzb3VyY2VTZWxlY3QudmFsdWUgPSBkYXRhLnNvdXJjZTtcblxuICAgICAgICAgICAgLy8gVHJpZ2dlciB0b2dnbGUgdG8gc2hvdyBjb3JyZWN0IGlucHV0XG4gICAgICAgICAgICBzb3VyY2VTZWxlY3QuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScpKTtcblxuICAgICAgICAgICAgaWYgKGRhdGEuc291cmNlID09PSAnZmllbGQnKSB7XG4gICAgICAgICAgICAgICAgaWYgKGRhdGEudmFsdWUpIGZpZWxkU2VsZWN0LnZhbHVlID0gZGF0YS52YWx1ZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKGRhdGEudmFsdWUpIHRleHRJbnB1dC52YWx1ZSA9IGRhdGEudmFsdWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChkYXRhLnRyYW5zZm9ybSkgdHJhbnNmb3JtU2VsZWN0LnZhbHVlID0gZGF0YS50cmFuc2Zvcm07XG4gICAgICAgICAgICBpZiAoZGF0YS50cmFuc2Zvcm1QYXR0ZXJuKSAoZGl2LnF1ZXJ5U2VsZWN0b3IoJy50cmFuc2Zvcm0tcGF0dGVybicpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlID0gZGF0YS50cmFuc2Zvcm1QYXR0ZXJuO1xuICAgICAgICAgICAgaWYgKGRhdGEudHJhbnNmb3JtUmVwbGFjZW1lbnQpIChkaXYucXVlcnlTZWxlY3RvcignLnRyYW5zZm9ybS1yZXBsYWNlbWVudCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlID0gZGF0YS50cmFuc2Zvcm1SZXBsYWNlbWVudDtcblxuICAgICAgICAgICAgLy8gVHJpZ2dlciB0b2dnbGUgZm9yIHJlZ2V4IFVJXG4gICAgICAgICAgICB0cmFuc2Zvcm1TZWxlY3QuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScpKTtcblxuICAgICAgICAgICAgaWYgKGRhdGEud2luZG93TW9kZSkgd2luZG93TW9kZVNlbGVjdC52YWx1ZSA9IGRhdGEud2luZG93TW9kZTtcblxuICAgICAgICAgICAgaWYgKGRhdGEuY29sb3IgJiYgZGF0YS5jb2xvciAhPT0gJ3JhbmRvbScpIHtcbiAgICAgICAgICAgICAgICByYW5kb21DaGVjay5jaGVja2VkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgY29sb3JJbnB1dC52YWx1ZSA9IGRhdGEuY29sb3I7XG4gICAgICAgICAgICAgICAgaWYgKGRhdGEuY29sb3IgPT09ICdmaWVsZCcgJiYgZGF0YS5jb2xvckZpZWxkKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbG9yRmllbGRTZWxlY3QudmFsdWUgPSBkYXRhLmNvbG9yRmllbGQ7XG4gICAgICAgICAgICAgICAgICAgIGlmIChkYXRhLmNvbG9yVHJhbnNmb3JtKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm1TZWxlY3QudmFsdWUgPSBkYXRhLmNvbG9yVHJhbnNmb3JtO1xuICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkYXRhLmNvbG9yVHJhbnNmb3JtUGF0dGVybikgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuLnZhbHVlID0gZGF0YS5jb2xvclRyYW5zZm9ybVBhdHRlcm47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJhbmRvbUNoZWNrLmNoZWNrZWQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgIC8vIFRyaWdnZXIgdG9nZ2xlIGNvbG9yXG4gICAgICAgICAgICByYW5kb21DaGVjay5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJykpO1xuICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm1TZWxlY3QuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScpKTtcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSAnc29ydCcgfHwgdHlwZSA9PT0gJ2dyb3VwU29ydCcpIHtcbiAgICAgICAgICAgICBpZiAoZGF0YS5maWVsZCkgKGRpdi5xdWVyeVNlbGVjdG9yKCcuZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlID0gZGF0YS5maWVsZDtcbiAgICAgICAgICAgICBpZiAoZGF0YS5vcmRlcikgKGRpdi5xdWVyeVNlbGVjdG9yKCcub3JkZXItc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlID0gZGF0YS5vcmRlcjtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIExpc3RlbmVycyAoR2VuZXJhbClcbiAgICBkaXYucXVlcnlTZWxlY3RvcignLmJ0bi1kZWwnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGRpdi5yZW1vdmUoKTtcbiAgICAgICAgdXBkYXRlQnJlYWRjcnVtYigpO1xuICAgIH0pO1xuXG4gICAgLy8gQU5EIC8gT1IgbGlzdGVuZXJzIChWaXN1YWwgbWFpbmx5LCBvciBhcHBlbmRpbmcgbmV3IHJvd3MpXG4gICAgZGl2LnF1ZXJ5U2VsZWN0b3IoJy5idG4tYW5kJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICBhZGRCdWlsZGVyUm93KHR5cGUpOyAvLyBKdXN0IGFkZCBhbm90aGVyIHJvd1xuICAgIH0pO1xuXG4gICAgZGl2LnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0LCBzZWxlY3QnKS5mb3JFYWNoKGVsID0+IHtcbiAgICAgICAgZWwuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgdXBkYXRlQnJlYWRjcnVtYik7XG4gICAgICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgdXBkYXRlQnJlYWRjcnVtYik7XG4gICAgfSk7XG5cbiAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoZGl2KTtcbiAgICB1cGRhdGVCcmVhZGNydW1iKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbGVhckJ1aWxkZXIoKSB7XG4gICAgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1uYW1lJykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUgPSAnJztcbiAgICAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LWRlc2MnKSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSA9ICcnO1xuXG4gICAgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1hdXRvcnVuJykgYXMgSFRNTElucHV0RWxlbWVudCkuY2hlY2tlZCA9IGZhbHNlO1xuICAgIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtc2VwYXJhdGUtd2luZG93JykgYXMgSFRNTElucHV0RWxlbWVudCkuY2hlY2tlZCA9IGZhbHNlO1xuXG4gICAgY29uc3Qgc29ydEdyb3Vwc0NoZWNrID0gKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1zb3J0Z3JvdXBzLWNoZWNrJykgYXMgSFRNTElucHV0RWxlbWVudCk7XG4gICAgaWYgKHNvcnRHcm91cHNDaGVjaykge1xuICAgICAgICBzb3J0R3JvdXBzQ2hlY2suY2hlY2tlZCA9IGZhbHNlO1xuICAgICAgICAvLyBUcmlnZ2VyIGNoYW5nZSB0byBoaWRlIGNvbnRhaW5lclxuICAgICAgICBzb3J0R3JvdXBzQ2hlY2suZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScpKTtcbiAgICB9XG5cbiAgICBjb25zdCBsb2FkU2VsZWN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0ZWd5LWxvYWQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgaWYgKGxvYWRTZWxlY3QpIGxvYWRTZWxlY3QudmFsdWUgPSAnJztcblxuICAgIFsnZmlsdGVyLXJvd3MtY29udGFpbmVyJywgJ2dyb3VwLXJvd3MtY29udGFpbmVyJywgJ3NvcnQtcm93cy1jb250YWluZXInLCAnZ3JvdXAtc29ydC1yb3dzLWNvbnRhaW5lciddLmZvckVhY2goaWQgPT4ge1xuICAgICAgICBjb25zdCBlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGlkKTtcbiAgICAgICAgaWYgKGVsKSBlbC5pbm5lckhUTUwgPSAnJztcbiAgICB9KTtcblxuICAgIGNvbnN0IGJ1aWxkZXJSZXN1bHRzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J1aWxkZXItcmVzdWx0cycpO1xuICAgIGlmIChidWlsZGVyUmVzdWx0cykgYnVpbGRlclJlc3VsdHMuaW5uZXJIVE1MID0gJyc7XG5cbiAgICBhZGRGaWx0ZXJHcm91cFJvdygpOyAvLyBSZXNldCB3aXRoIG9uZSBlbXB0eSBmaWx0ZXIgZ3JvdXBcbiAgICB1cGRhdGVCcmVhZGNydW1iKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVCcmVhZGNydW1iKCkge1xuICAgIGNvbnN0IGJyZWFkY3J1bWIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXRlZ3ktYnJlYWRjcnVtYicpO1xuICAgIGlmICghYnJlYWRjcnVtYikgcmV0dXJuO1xuXG4gICAgbGV0IHRleHQgPSAnQWxsJztcblxuICAgIC8vIEZpbHRlcnNcbiAgICBjb25zdCBmaWx0ZXJzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2ZpbHRlci1yb3dzLWNvbnRhaW5lcicpPy5xdWVyeVNlbGVjdG9yQWxsKCcuYnVpbGRlci1yb3cnKTtcbiAgICBpZiAoZmlsdGVycyAmJiBmaWx0ZXJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgZmlsdGVycy5mb3JFYWNoKHJvdyA9PiB7XG4gICAgICAgICAgICAgY29uc3QgZmllbGQgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5maWVsZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICAgY29uc3Qgb3AgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5vcGVyYXRvci1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICAgY29uc3QgdmFsID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcudmFsdWUtaW5wdXQnKSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgICBpZiAodmFsKSB0ZXh0ICs9IGAgPiAke2ZpZWxkfSAke29wfSAke3ZhbH1gO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBHcm91cHNcbiAgICBjb25zdCBncm91cHMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ3JvdXAtcm93cy1jb250YWluZXInKT8ucXVlcnlTZWxlY3RvckFsbCgnLmJ1aWxkZXItcm93Jyk7XG4gICAgaWYgKGdyb3VwcyAmJiBncm91cHMubGVuZ3RoID4gMCkge1xuICAgICAgICBncm91cHMuZm9yRWFjaChyb3cgPT4ge1xuICAgICAgICAgICAgIGNvbnN0IHNvdXJjZSA9IChyb3cucXVlcnlTZWxlY3RvcignLnNvdXJjZS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICAgbGV0IHZhbCA9IFwiXCI7XG4gICAgICAgICAgICAgaWYgKHNvdXJjZSA9PT0gJ2ZpZWxkJykge1xuICAgICAgICAgICAgICAgICB2YWwgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dC1maWVsZCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgICAgICAgdGV4dCArPSBgID4gR3JvdXAgYnkgRmllbGQ6ICR7dmFsfWA7XG4gICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgdmFsID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcudmFsdWUtaW5wdXQtdGV4dCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgICAgICB0ZXh0ICs9IGAgPiBHcm91cCBieSBOYW1lOiBcIiR7dmFsfVwiYDtcbiAgICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIEdyb3VwIFNvcnRzXG4gICAgY29uc3QgZ3JvdXBTb3J0cyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdncm91cC1zb3J0LXJvd3MtY29udGFpbmVyJyk/LnF1ZXJ5U2VsZWN0b3JBbGwoJy5idWlsZGVyLXJvdycpO1xuICAgIGlmIChncm91cFNvcnRzICYmIGdyb3VwU29ydHMubGVuZ3RoID4gMCkge1xuICAgICAgICBncm91cFNvcnRzLmZvckVhY2gocm93ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcuZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgY29uc3Qgb3JkZXIgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5vcmRlci1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICB0ZXh0ICs9IGAgPiBHcm91cCBzb3J0IGJ5ICR7ZmllbGR9ICgke29yZGVyfSlgO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBTb3J0c1xuICAgIGNvbnN0IHNvcnRzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NvcnQtcm93cy1jb250YWluZXInKT8ucXVlcnlTZWxlY3RvckFsbCgnLmJ1aWxkZXItcm93Jyk7XG4gICAgaWYgKHNvcnRzICYmIHNvcnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgc29ydHMuZm9yRWFjaChyb3cgPT4ge1xuICAgICAgICAgICAgIGNvbnN0IGZpZWxkID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcuZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgIGNvbnN0IG9yZGVyID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcub3JkZXItc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgIHRleHQgKz0gYCA+IFNvcnQgYnkgJHtmaWVsZH0gKCR7b3JkZXJ9KWA7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGJyZWFkY3J1bWIudGV4dENvbnRlbnQgPSB0ZXh0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0QnVpbGRlclN0cmF0ZWd5KGlnbm9yZVZhbGlkYXRpb246IGJvb2xlYW4gPSBmYWxzZSk6IEN1c3RvbVN0cmF0ZWd5IHwgbnVsbCB7XG4gICAgY29uc3QgaWRJbnB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1uYW1lJykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICBjb25zdCBsYWJlbElucHV0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LWRlc2MnKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuXG4gICAgbGV0IGlkID0gaWRJbnB1dCA/IGlkSW5wdXQudmFsdWUudHJpbSgpIDogJyc7XG4gICAgbGV0IGxhYmVsID0gbGFiZWxJbnB1dCA/IGxhYmVsSW5wdXQudmFsdWUudHJpbSgpIDogJyc7XG4gICAgY29uc3QgZmFsbGJhY2sgPSAnTWlzYyc7IC8vIEZhbGxiYWNrIHJlbW92ZWQgZnJvbSBVSSwgZGVmYXVsdCB0byBNaXNjXG4gICAgY29uc3Qgc29ydEdyb3VwcyA9IChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtc29ydGdyb3Vwcy1jaGVjaycpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLmNoZWNrZWQ7XG5cbiAgICBpZiAoIWlnbm9yZVZhbGlkYXRpb24gJiYgKCFpZCB8fCAhbGFiZWwpKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGlmIChpZ25vcmVWYWxpZGF0aW9uKSB7XG4gICAgICAgIGlmICghaWQpIGlkID0gJ3RlbXBfc2ltX2lkJztcbiAgICAgICAgaWYgKCFsYWJlbCkgbGFiZWwgPSAnU2ltdWxhdGlvbic7XG4gICAgfVxuXG4gICAgY29uc3QgZmlsdGVyR3JvdXBzOiBSdWxlQ29uZGl0aW9uW11bXSA9IFtdO1xuICAgIGNvbnN0IGZpbHRlckNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmaWx0ZXItcm93cy1jb250YWluZXInKTtcblxuICAgIC8vIFBhcnNlIGZpbHRlciBncm91cHNcbiAgICBpZiAoZmlsdGVyQ29udGFpbmVyKSB7XG4gICAgICAgIGNvbnN0IGdyb3VwUm93cyA9IGZpbHRlckNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcuZmlsdGVyLWdyb3VwLXJvdycpO1xuICAgICAgICBpZiAoZ3JvdXBSb3dzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGdyb3VwUm93cy5mb3JFYWNoKGdyb3VwUm93ID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBjb25kaXRpb25zOiBSdWxlQ29uZGl0aW9uW10gPSBbXTtcbiAgICAgICAgICAgICAgICBncm91cFJvdy5xdWVyeVNlbGVjdG9yQWxsKCcuYnVpbGRlci1yb3cnKS5mb3JFYWNoKHJvdyA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZpZWxkID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcuZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBvcGVyYXRvciA9IChyb3cucXVlcnlTZWxlY3RvcignLm9wZXJhdG9yLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZSBhcyBhbnk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcudmFsdWUtaW5wdXQnKSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgLy8gT25seSBhZGQgaWYgdmFsdWUgaXMgcHJlc2VudCBvciBvcGVyYXRvciBkb2Vzbid0IHJlcXVpcmUgaXRcbiAgICAgICAgICAgICAgICAgICAgaWYgKHZhbHVlIHx8IFsnZXhpc3RzJywgJ2RvZXNOb3RFeGlzdCcsICdpc051bGwnLCAnaXNOb3ROdWxsJ10uaW5jbHVkZXMob3BlcmF0b3IpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25kaXRpb25zLnB1c2goeyBmaWVsZCwgb3BlcmF0b3IsIHZhbHVlIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgaWYgKGNvbmRpdGlvbnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICBmaWx0ZXJHcm91cHMucHVzaChjb25kaXRpb25zKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIEZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5IC8gc2ltcGxlIHN0cmF0ZWdpZXMsIHBvcHVsYXRlIGZpbHRlcnMgd2l0aCB0aGUgZmlyc3QgZ3JvdXBcbiAgICBjb25zdCBmaWx0ZXJzOiBSdWxlQ29uZGl0aW9uW10gPSBmaWx0ZXJHcm91cHMubGVuZ3RoID4gMCA/IGZpbHRlckdyb3Vwc1swXSA6IFtdO1xuXG4gICAgY29uc3QgZ3JvdXBpbmdSdWxlczogR3JvdXBpbmdSdWxlW10gPSBbXTtcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ3JvdXAtcm93cy1jb250YWluZXInKT8ucXVlcnlTZWxlY3RvckFsbCgnLmJ1aWxkZXItcm93JykuZm9yRWFjaChyb3cgPT4ge1xuICAgICAgICBjb25zdCBzb3VyY2UgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5zb3VyY2Utc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlIGFzIFwiZmllbGRcIiB8IFwiZml4ZWRcIjtcbiAgICAgICAgbGV0IHZhbHVlID0gXCJcIjtcbiAgICAgICAgaWYgKHNvdXJjZSA9PT0gJ2ZpZWxkJykge1xuICAgICAgICAgICAgdmFsdWUgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dC1maWVsZCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcudmFsdWUtaW5wdXQtdGV4dCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdHJhbnNmb3JtID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcudHJhbnNmb3JtLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZSBhcyBhbnk7XG4gICAgICAgIGNvbnN0IHRyYW5zZm9ybVBhdHRlcm4gPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy50cmFuc2Zvcm0tcGF0dGVybicpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICBjb25zdCB0cmFuc2Zvcm1SZXBsYWNlbWVudCA9IChyb3cucXVlcnlTZWxlY3RvcignLnRyYW5zZm9ybS1yZXBsYWNlbWVudCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICBjb25zdCB3aW5kb3dNb2RlID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcud2luZG93LW1vZGUtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlIGFzIGFueTtcblxuICAgICAgICBjb25zdCByYW5kb21DaGVjayA9IHJvdy5xdWVyeVNlbGVjdG9yKCcucmFuZG9tLWNvbG9yLWNoZWNrJykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgY29uc3QgY29sb3JJbnB1dCA9IHJvdy5xdWVyeVNlbGVjdG9yKCcuY29sb3ItaW5wdXQnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgY29uc3QgY29sb3JGaWVsZFNlbGVjdCA9IHJvdy5xdWVyeVNlbGVjdG9yKCcuY29sb3ItZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IGNvbG9yVHJhbnNmb3JtU2VsZWN0ID0gcm93LnF1ZXJ5U2VsZWN0b3IoJy5jb2xvci10cmFuc2Zvcm0tc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IGNvbG9yVHJhbnNmb3JtUGF0dGVybiA9IHJvdy5xdWVyeVNlbGVjdG9yKCcuY29sb3ItdHJhbnNmb3JtLXBhdHRlcm4nKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuXG4gICAgICAgIGxldCBjb2xvciA9ICdyYW5kb20nO1xuICAgICAgICBsZXQgY29sb3JGaWVsZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgICBsZXQgY29sb3JUcmFuc2Zvcm06IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgICAgbGV0IGNvbG9yVHJhbnNmb3JtUGF0dGVyblZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbiAgICAgICAgaWYgKCFyYW5kb21DaGVjay5jaGVja2VkKSB7XG4gICAgICAgICAgICBjb2xvciA9IGNvbG9ySW5wdXQudmFsdWU7XG4gICAgICAgICAgICBpZiAoY29sb3IgPT09ICdmaWVsZCcpIHtcbiAgICAgICAgICAgICAgICBjb2xvckZpZWxkID0gY29sb3JGaWVsZFNlbGVjdC52YWx1ZTtcbiAgICAgICAgICAgICAgICBjb2xvclRyYW5zZm9ybSA9IGNvbG9yVHJhbnNmb3JtU2VsZWN0LnZhbHVlIGFzIGFueTtcbiAgICAgICAgICAgICAgICBpZiAoY29sb3JUcmFuc2Zvcm0gPT09ICdyZWdleCcpIHtcbiAgICAgICAgICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuVmFsdWUgPSBjb2xvclRyYW5zZm9ybVBhdHRlcm4udmFsdWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgICBncm91cGluZ1J1bGVzLnB1c2goe1xuICAgICAgICAgICAgICAgIHNvdXJjZSxcbiAgICAgICAgICAgICAgICB2YWx1ZSxcbiAgICAgICAgICAgICAgICBjb2xvcixcbiAgICAgICAgICAgICAgICBjb2xvckZpZWxkLFxuICAgICAgICAgICAgICAgIGNvbG9yVHJhbnNmb3JtOiBjb2xvclRyYW5zZm9ybSBhcyBhbnksXG4gICAgICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuOiBjb2xvclRyYW5zZm9ybVBhdHRlcm5WYWx1ZSxcbiAgICAgICAgICAgICAgICB0cmFuc2Zvcm0sXG4gICAgICAgICAgICAgICAgdHJhbnNmb3JtUGF0dGVybjogKHRyYW5zZm9ybSA9PT0gJ3JlZ2V4JyB8fCB0cmFuc2Zvcm0gPT09ICdyZWdleFJlcGxhY2UnKSA/IHRyYW5zZm9ybVBhdHRlcm4gOiB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgdHJhbnNmb3JtUmVwbGFjZW1lbnQ6IHRyYW5zZm9ybSA9PT0gJ3JlZ2V4UmVwbGFjZScgPyB0cmFuc2Zvcm1SZXBsYWNlbWVudCA6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICB3aW5kb3dNb2RlXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgY29uc3Qgc29ydGluZ1J1bGVzOiBTb3J0aW5nUnVsZVtdID0gW107XG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NvcnQtcm93cy1jb250YWluZXInKT8ucXVlcnlTZWxlY3RvckFsbCgnLmJ1aWxkZXItcm93JykuZm9yRWFjaChyb3cgPT4ge1xuICAgICAgICBjb25zdCBmaWVsZCA9IChyb3cucXVlcnlTZWxlY3RvcignLmZpZWxkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgY29uc3Qgb3JkZXIgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5vcmRlci1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWUgYXMgYW55O1xuICAgICAgICBzb3J0aW5nUnVsZXMucHVzaCh7IGZpZWxkLCBvcmRlciB9KTtcbiAgICB9KTtcblxuICAgIGNvbnN0IGdyb3VwU29ydGluZ1J1bGVzOiBTb3J0aW5nUnVsZVtdID0gW107XG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dyb3VwLXNvcnQtcm93cy1jb250YWluZXInKT8ucXVlcnlTZWxlY3RvckFsbCgnLmJ1aWxkZXItcm93JykuZm9yRWFjaChyb3cgPT4ge1xuICAgICAgICBjb25zdCBmaWVsZCA9IChyb3cucXVlcnlTZWxlY3RvcignLmZpZWxkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgY29uc3Qgb3JkZXIgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5vcmRlci1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWUgYXMgYW55O1xuICAgICAgICBncm91cFNvcnRpbmdSdWxlcy5wdXNoKHsgZmllbGQsIG9yZGVyIH0pO1xuICAgIH0pO1xuICAgIGNvbnN0IGFwcGxpZWRHcm91cFNvcnRpbmdSdWxlcyA9IHNvcnRHcm91cHMgPyBncm91cFNvcnRpbmdSdWxlcyA6IFtdO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgaWQsXG4gICAgICAgIGxhYmVsLFxuICAgICAgICBmaWx0ZXJzLFxuICAgICAgICBmaWx0ZXJHcm91cHMsXG4gICAgICAgIGdyb3VwaW5nUnVsZXMsXG4gICAgICAgIHNvcnRpbmdSdWxlcyxcbiAgICAgICAgZ3JvdXBTb3J0aW5nUnVsZXM6IGFwcGxpZWRHcm91cFNvcnRpbmdSdWxlcyxcbiAgICAgICAgZmFsbGJhY2ssXG4gICAgICAgIHNvcnRHcm91cHNcbiAgICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcnVuQnVpbGRlclNpbXVsYXRpb24oKSB7XG4gICAgLy8gUGFzcyB0cnVlIHRvIGlnbm9yZSB2YWxpZGF0aW9uIHNvIHdlIGNhbiBzaW11bGF0ZSB3aXRob3V0IElEL0xhYmVsXG4gICAgY29uc3Qgc3RyYXQgPSBnZXRCdWlsZGVyU3RyYXRlZ3kodHJ1ZSk7XG4gICAgY29uc3QgcmVzdWx0Q29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J1aWxkZXItcmVzdWx0cycpO1xuICAgIGNvbnN0IG5ld1N0YXRlUGFuZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbmV3LXN0YXRlLXBhbmVsJyk7XG5cbiAgICBpZiAoIXN0cmF0KSByZXR1cm47IC8vIFNob3VsZCBub3QgaGFwcGVuIHdpdGggaWdub3JlVmFsaWRhdGlvbj10cnVlXG5cbiAgICBsb2dJbmZvKFwiUnVubmluZyBidWlsZGVyIHNpbXVsYXRpb25cIiwgeyBzdHJhdGVneTogc3RyYXQuaWQgfSk7XG5cbiAgICAvLyBGb3Igc2ltdWxhdGlvbiwgd2UgY2FuIG1vY2sgYW4gSUQvTGFiZWwgaWYgbWlzc2luZ1xuICAgIGNvbnN0IHNpbVN0cmF0OiBDdXN0b21TdHJhdGVneSA9IHN0cmF0O1xuXG4gICAgaWYgKCFyZXN1bHRDb250YWluZXIgfHwgIW5ld1N0YXRlUGFuZWwpIHJldHVybjtcblxuICAgIC8vIFNob3cgdGhlIHBhbmVsXG4gICAgbmV3U3RhdGVQYW5lbC5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXG4gICAgLy8gVXBkYXRlIGxvY2FsQ3VzdG9tU3RyYXRlZ2llcyB0ZW1wb3JhcmlseSBmb3IgU2ltXG4gICAgY29uc3Qgb3JpZ2luYWxTdHJhdGVnaWVzID0gWy4uLmFwcFN0YXRlLmxvY2FsQ3VzdG9tU3RyYXRlZ2llc107XG5cbiAgICB0cnkge1xuICAgICAgICAvLyBSZXBsYWNlIG9yIGFkZFxuICAgICAgICBjb25zdCBleGlzdGluZ0lkeCA9IGFwcFN0YXRlLmxvY2FsQ3VzdG9tU3RyYXRlZ2llcy5maW5kSW5kZXgocyA9PiBzLmlkID09PSBzaW1TdHJhdC5pZCk7XG4gICAgICAgIGlmIChleGlzdGluZ0lkeCAhPT0gLTEpIHtcbiAgICAgICAgICAgIGFwcFN0YXRlLmxvY2FsQ3VzdG9tU3RyYXRlZ2llc1tleGlzdGluZ0lkeF0gPSBzaW1TdHJhdDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGFwcFN0YXRlLmxvY2FsQ3VzdG9tU3RyYXRlZ2llcy5wdXNoKHNpbVN0cmF0KTtcbiAgICAgICAgfVxuICAgICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKGFwcFN0YXRlLmxvY2FsQ3VzdG9tU3RyYXRlZ2llcyk7XG5cbiAgICAgICAgLy8gUnVuIExvZ2ljXG4gICAgICAgIGxldCB0YWJzID0gZ2V0TWFwcGVkVGFicygpO1xuXG4gICAgICAgIGlmICh0YWJzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgcmVzdWx0Q29udGFpbmVyLmlubmVySFRNTCA9ICc8cD5ObyB0YWJzIGZvdW5kIHRvIHNpbXVsYXRlLjwvcD4nO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQXBwbHkgU2ltdWxhdGVkIFNlbGVjdGlvbiBPdmVycmlkZVxuICAgICAgICBpZiAoYXBwU3RhdGUuc2ltdWxhdGVkU2VsZWN0aW9uLnNpemUgPiAwKSB7XG4gICAgICAgICAgICB0YWJzID0gdGFicy5tYXAodCA9PiAoe1xuICAgICAgICAgICAgICAgIC4uLnQsXG4gICAgICAgICAgICAgICAgc2VsZWN0ZWQ6IGFwcFN0YXRlLnNpbXVsYXRlZFNlbGVjdGlvbi5oYXModC5pZClcbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNvcnQgdXNpbmcgdGhpcyBzdHJhdGVneT9cbiAgICAgICAgLy8gc29ydFRhYnMgZXhwZWN0cyBTb3J0aW5nU3RyYXRlZ3lbXS5cbiAgICAgICAgLy8gSWYgd2UgdXNlIHRoaXMgc3RyYXRlZ3kgZm9yIHNvcnRpbmcuLi5cbiAgICAgICAgdGFicyA9IHNvcnRUYWJzKHRhYnMsIFtzaW1TdHJhdC5pZF0pO1xuXG4gICAgICAgIC8vIEdyb3VwIHVzaW5nIHRoaXMgc3RyYXRlZ3lcbiAgICAgICAgY29uc3QgZ3JvdXBzID0gZ3JvdXBUYWJzKHRhYnMsIFtzaW1TdHJhdC5pZF0pO1xuXG4gICAgICAgIC8vIENoZWNrIGlmIHdlIHNob3VsZCBzaG93IGEgZmFsbGJhY2sgcmVzdWx0IChlLmcuIFNvcnQgT25seSlcbiAgICAgICAgLy8gSWYgbm8gZ3JvdXBzIHdlcmUgY3JlYXRlZCwgYnV0IHdlIGhhdmUgdGFicywgYW5kIHRoZSBzdHJhdGVneSBpcyBub3QgYSBncm91cGluZyBzdHJhdGVneSxcbiAgICAgICAgLy8gd2Ugc2hvdyB0aGUgdGFicyBhcyBhIHNpbmdsZSBsaXN0LlxuICAgICAgICBpZiAoZ3JvdXBzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgY29uc3Qgc3RyYXREZWYgPSBnZXRTdHJhdGVnaWVzKGFwcFN0YXRlLmxvY2FsQ3VzdG9tU3RyYXRlZ2llcykuZmluZChzID0+IHMuaWQgPT09IHNpbVN0cmF0LmlkKTtcbiAgICAgICAgICAgIGlmIChzdHJhdERlZiAmJiAhc3RyYXREZWYuaXNHcm91cGluZykge1xuICAgICAgICAgICAgICAgIGdyb3Vwcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgaWQ6ICdzaW0tc29ydGVkJyxcbiAgICAgICAgICAgICAgICAgICAgd2luZG93SWQ6IDAsXG4gICAgICAgICAgICAgICAgICAgIGxhYmVsOiAnU29ydGVkIFJlc3VsdHMgKE5vIEdyb3VwaW5nKScsXG4gICAgICAgICAgICAgICAgICAgIGNvbG9yOiAnZ3JleScsXG4gICAgICAgICAgICAgICAgICAgIHRhYnM6IHRhYnMsXG4gICAgICAgICAgICAgICAgICAgIHJlYXNvbjogJ1NvcnQgT25seSdcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJlbmRlciBSZXN1bHRzXG4gICAgICAgIGlmIChncm91cHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICByZXN1bHRDb250YWluZXIuaW5uZXJIVE1MID0gJzxwPk5vIGdyb3VwcyBjcmVhdGVkLjwvcD4nO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgcmVzdWx0Q29udGFpbmVyLmlubmVySFRNTCA9IGdyb3Vwcy5tYXAoZ3JvdXAgPT4gYFxuICAgIDxkaXYgY2xhc3M9XCJncm91cC1yZXN1bHRcIiBzdHlsZT1cIm1hcmdpbi1ib3R0b206IDEwcHg7IGJvcmRlcjogMXB4IHNvbGlkICNkZGQ7IGJvcmRlci1yYWRpdXM6IDRweDsgb3ZlcmZsb3c6IGhpZGRlbjtcIj5cbiAgICAgIDxkaXYgY2xhc3M9XCJncm91cC1oZWFkZXJcIiBzdHlsZT1cImJvcmRlci1sZWZ0OiA1cHggc29saWQgJHtncm91cC5jb2xvcn07IHBhZGRpbmc6IDVweDsgYmFja2dyb3VuZDogI2Y4ZjlmYTsgZm9udC1zaXplOiAwLjllbTsgZm9udC13ZWlnaHQ6IGJvbGQ7IGRpc3BsYXk6IGZsZXg7IGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjtcIj5cbiAgICAgICAgPHNwYW4+JHtlc2NhcGVIdG1sKGdyb3VwLmxhYmVsIHx8ICdVbmdyb3VwZWQnKX08L3NwYW4+XG4gICAgICAgIDxzcGFuIGNsYXNzPVwiZ3JvdXAtbWV0YVwiIHN0eWxlPVwiZm9udC13ZWlnaHQ6IG5vcm1hbDsgZm9udC1zaXplOiAwLjhlbTsgY29sb3I6ICM2NjY7XCI+JHtncm91cC50YWJzLmxlbmd0aH08L3NwYW4+XG4gICAgICA8L2Rpdj5cbiAgICAgIDx1bCBjbGFzcz1cImdyb3VwLXRhYnNcIiBzdHlsZT1cImxpc3Qtc3R5bGU6IG5vbmU7IG1hcmdpbjogMDsgcGFkZGluZzogMDtcIj5cbiAgICAgICAgJHtncm91cC50YWJzLm1hcCh0YWIgPT4gYFxuICAgICAgICAgIDxsaSBjbGFzcz1cImdyb3VwLXRhYi1pdGVtXCIgc3R5bGU9XCJwYWRkaW5nOiA0cHggNXB4OyBib3JkZXItdG9wOiAxcHggc29saWQgI2VlZTsgZGlzcGxheTogZmxleDsgZ2FwOiA1cHg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGZvbnQtc2l6ZTogMC44NWVtO1wiPlxuICAgICAgICAgICAgPGRpdiBzdHlsZT1cIndpZHRoOiAxMnB4OyBoZWlnaHQ6IDEycHg7IGJhY2tncm91bmQ6ICNlZWU7IGJvcmRlci1yYWRpdXM6IDJweDsgZmxleC1zaHJpbms6IDA7XCI+XG4gICAgICAgICAgICAgICAgJHt0YWIuZmF2SWNvblVybCA/IGA8aW1nIHNyYz1cIiR7ZXNjYXBlSHRtbCh0YWIuZmF2SWNvblVybCl9XCIgc3R5bGU9XCJ3aWR0aDogMTAwJTsgaGVpZ2h0OiAxMDAlOyBvYmplY3QtZml0OiBjb3ZlcjtcIiBvbmVycm9yPVwidGhpcy5zdHlsZS5kaXNwbGF5PSdub25lJ1wiPmAgOiAnJ31cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJ0aXRsZS1jZWxsXCIgdGl0bGU9XCIke2VzY2FwZUh0bWwodGFiLnRpdGxlKX1cIiBzdHlsZT1cIndoaXRlLXNwYWNlOiBub3dyYXA7IG92ZXJmbG93OiBoaWRkZW47IHRleHQtb3ZlcmZsb3c6IGVsbGlwc2lzO1wiPiR7ZXNjYXBlSHRtbCh0YWIudGl0bGUpfTwvc3Bhbj5cbiAgICAgICAgICA8L2xpPlxuICAgICAgICBgKS5qb2luKCcnKX1cbiAgICAgIDwvdWw+XG4gICAgPC9kaXY+XG4gIGApLmpvaW4oJycpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIlNpbXVsYXRpb24gZmFpbGVkXCIsIGUpO1xuICAgICAgICByZXN1bHRDb250YWluZXIuaW5uZXJIVE1MID0gYDxwIHN0eWxlPVwiY29sb3I6IHJlZDtcIj5TaW11bGF0aW9uIGZhaWxlZDogJHtlfTwvcD5gO1xuICAgICAgICBhbGVydChcIlNpbXVsYXRpb24gZmFpbGVkOiBcIiArIGUpO1xuICAgIH0gZmluYWxseSB7XG4gICAgICAgIC8vIFJlc3RvcmUgc3RyYXRlZ2llc1xuICAgICAgICBhcHBTdGF0ZS5sb2NhbEN1c3RvbVN0cmF0ZWdpZXMgPSBvcmlnaW5hbFN0cmF0ZWdpZXM7XG4gICAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMoYXBwU3RhdGUubG9jYWxDdXN0b21TdHJhdGVnaWVzKTtcbiAgICB9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzYXZlQ3VzdG9tU3RyYXRlZ3lGcm9tQnVpbGRlcihzaG93U3VjY2VzcyA9IHRydWUpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBjb25zdCBzdHJhdCA9IGdldEJ1aWxkZXJTdHJhdGVneSgpO1xuICAgIGlmICghc3RyYXQpIHtcbiAgICAgICAgYWxlcnQoXCJQbGVhc2UgZmlsbCBpbiBJRCBhbmQgTGFiZWwuXCIpO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiBzYXZlU3RyYXRlZ3koc3RyYXQsIHNob3dTdWNjZXNzKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJ1bkJ1aWxkZXJMaXZlKCkge1xuICAgIGNvbnN0IHN0cmF0ID0gZ2V0QnVpbGRlclN0cmF0ZWd5KCk7XG4gICAgaWYgKCFzdHJhdCkge1xuICAgICAgICBhbGVydChcIlBsZWFzZSBmaWxsIGluIElEIGFuZCBMYWJlbCB0byBydW4gbGl2ZS5cIik7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsb2dJbmZvKFwiQXBwbHlpbmcgc3RyYXRlZ3kgbGl2ZVwiLCB7IGlkOiBzdHJhdC5pZCB9KTtcblxuICAgIC8vIFNhdmUgc2lsZW50bHkgZmlyc3QgdG8gZW5zdXJlIGJhY2tlbmQgaGFzIHRoZSBkZWZpbml0aW9uXG4gICAgY29uc3Qgc2F2ZWQgPSBhd2FpdCBzYXZlU3RyYXRlZ3koc3RyYXQsIGZhbHNlKTtcbiAgICBpZiAoIXNhdmVkKSByZXR1cm47XG5cbiAgICB0cnkge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgIHR5cGU6ICdhcHBseUdyb3VwaW5nJyxcbiAgICAgICAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgICAgICAgICBzb3J0aW5nOiBbc3RyYXQuaWRdXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vaykge1xuICAgICAgICAgICAgYWxlcnQoXCJBcHBsaWVkIHN1Y2Nlc3NmdWxseSFcIik7XG4gICAgICAgICAgICBsb2FkVGFicygpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYWxlcnQoXCJGYWlsZWQgdG8gYXBwbHk6IFwiICsgKHJlc3BvbnNlLmVycm9yIHx8ICdVbmtub3duIGVycm9yJykpO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiQXBwbHkgZmFpbGVkXCIsIGUpO1xuICAgICAgICBhbGVydChcIkFwcGx5IGZhaWxlZDogXCIgKyBlKTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwb3B1bGF0ZUJ1aWxkZXJGcm9tU3RyYXRlZ3koc3RyYXQ6IEN1c3RvbVN0cmF0ZWd5KSB7XG4gICAgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1uYW1lJykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUgPSBzdHJhdC5pZDtcbiAgICAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LWRlc2MnKSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSA9IHN0cmF0LmxhYmVsO1xuXG4gICAgY29uc3Qgc29ydEdyb3Vwc0NoZWNrID0gKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1zb3J0Z3JvdXBzLWNoZWNrJykgYXMgSFRNTElucHV0RWxlbWVudCk7XG4gICAgY29uc3QgaGFzR3JvdXBTb3J0ID0gISEoc3RyYXQuZ3JvdXBTb3J0aW5nUnVsZXMgJiYgc3RyYXQuZ3JvdXBTb3J0aW5nUnVsZXMubGVuZ3RoID4gMCkgfHwgISFzdHJhdC5zb3J0R3JvdXBzO1xuICAgIHNvcnRHcm91cHNDaGVjay5jaGVja2VkID0gaGFzR3JvdXBTb3J0O1xuICAgIHNvcnRHcm91cHNDaGVjay5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJykpO1xuXG4gICAgY29uc3QgYXV0b1J1bkNoZWNrID0gKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1hdXRvcnVuJykgYXMgSFRNTElucHV0RWxlbWVudCk7XG4gICAgYXV0b1J1bkNoZWNrLmNoZWNrZWQgPSAhIXN0cmF0LmF1dG9SdW47XG5cbiAgICBbJ2ZpbHRlci1yb3dzLWNvbnRhaW5lcicsICdncm91cC1yb3dzLWNvbnRhaW5lcicsICdzb3J0LXJvd3MtY29udGFpbmVyJywgJ2dyb3VwLXNvcnQtcm93cy1jb250YWluZXInXS5mb3JFYWNoKGlkID0+IHtcbiAgICAgICAgY29uc3QgZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChpZCk7XG4gICAgICAgIGlmIChlbCkgZWwuaW5uZXJIVE1MID0gJyc7XG4gICAgfSk7XG5cbiAgICBpZiAoc3RyYXQuZmlsdGVyR3JvdXBzICYmIHN0cmF0LmZpbHRlckdyb3Vwcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHN0cmF0LmZpbHRlckdyb3Vwcy5mb3JFYWNoKGcgPT4gYWRkRmlsdGVyR3JvdXBSb3coZykpO1xuICAgIH0gZWxzZSBpZiAoc3RyYXQuZmlsdGVycyAmJiBzdHJhdC5maWx0ZXJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgYWRkRmlsdGVyR3JvdXBSb3coc3RyYXQuZmlsdGVycyk7XG4gICAgfVxuXG4gICAgc3RyYXQuZ3JvdXBpbmdSdWxlcz8uZm9yRWFjaChnID0+IGFkZEJ1aWxkZXJSb3coJ2dyb3VwJywgZykpO1xuICAgIHN0cmF0LnNvcnRpbmdSdWxlcz8uZm9yRWFjaChzID0+IGFkZEJ1aWxkZXJSb3coJ3NvcnQnLCBzKSk7XG4gICAgc3RyYXQuZ3JvdXBTb3J0aW5nUnVsZXM/LmZvckVhY2goZ3MgPT4gYWRkQnVpbGRlclJvdygnZ3JvdXBTb3J0JywgZ3MpKTtcblxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyN2aWV3LXN0cmF0ZWdpZXMnKT8uc2Nyb2xsSW50b1ZpZXcoeyBiZWhhdmlvcjogJ3Ntb290aCcgfSk7XG4gICAgdXBkYXRlQnJlYWRjcnVtYigpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXhwb3J0QnVpbGRlclN0cmF0ZWd5KCkge1xuICAgIGNvbnN0IHN0cmF0ID0gZ2V0QnVpbGRlclN0cmF0ZWd5KCk7XG4gICAgaWYgKCFzdHJhdCkge1xuICAgICAgICBhbGVydChcIlBsZWFzZSBkZWZpbmUgYSBzdHJhdGVneSB0byBleHBvcnQgKElEIGFuZCBMYWJlbCByZXF1aXJlZCkuXCIpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGxvZ0luZm8oXCJFeHBvcnRpbmcgc3RyYXRlZ3lcIiwgeyBpZDogc3RyYXQuaWQgfSk7XG4gICAgY29uc3QganNvbiA9IEpTT04uc3RyaW5naWZ5KHN0cmF0LCBudWxsLCAyKTtcbiAgICBjb25zdCBjb250ZW50ID0gYFxuICAgICAgICA8cD5Db3B5IHRoZSBKU09OIGJlbG93OjwvcD5cbiAgICAgICAgPHRleHRhcmVhIHN0eWxlPVwid2lkdGg6IDEwMCU7IGhlaWdodDogMzAwcHg7IGZvbnQtZmFtaWx5OiBtb25vc3BhY2U7XCI+JHtlc2NhcGVIdG1sKGpzb24pfTwvdGV4dGFyZWE+XG4gICAgYDtcbiAgICBzaG93TW9kYWwoXCJFeHBvcnQgU3RyYXRlZ3lcIiwgY29udGVudCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbXBvcnRCdWlsZGVyU3RyYXRlZ3koKSB7XG4gICAgY29uc3QgY29udGVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGNvbnRlbnQuaW5uZXJIVE1MID0gYFxuICAgICAgICA8cD5QYXN0ZSBTdHJhdGVneSBKU09OIGJlbG93OjwvcD5cbiAgICAgICAgPHRleHRhcmVhIGlkPVwiaW1wb3J0LXN0cmF0LWFyZWFcIiBzdHlsZT1cIndpZHRoOiAxMDAlOyBoZWlnaHQ6IDIwMHB4OyBmb250LWZhbWlseTogbW9ub3NwYWNlOyBtYXJnaW4tYm90dG9tOiAxMHB4O1wiPjwvdGV4dGFyZWE+XG4gICAgICAgIDxidXR0b24gaWQ9XCJpbXBvcnQtc3RyYXQtY29uZmlybVwiIGNsYXNzPVwic3VjY2Vzcy1idG5cIj5Mb2FkPC9idXR0b24+XG4gICAgYDtcblxuICAgIGNvbnN0IGJ0biA9IGNvbnRlbnQucXVlcnlTZWxlY3RvcignI2ltcG9ydC1zdHJhdC1jb25maXJtJyk7XG4gICAgYnRuPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgY29uc3QgdHh0ID0gKGNvbnRlbnQucXVlcnlTZWxlY3RvcignI2ltcG9ydC1zdHJhdC1hcmVhJykgYXMgSFRNTFRleHRBcmVhRWxlbWVudCkudmFsdWU7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBqc29uID0gSlNPTi5wYXJzZSh0eHQpO1xuICAgICAgICAgICAgaWYgKCFqc29uLmlkIHx8ICFqc29uLmxhYmVsKSB7XG4gICAgICAgICAgICAgICAgYWxlcnQoXCJJbnZhbGlkIHN0cmF0ZWd5OiBJRCBhbmQgTGFiZWwgYXJlIHJlcXVpcmVkLlwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsb2dJbmZvKFwiSW1wb3J0aW5nIHN0cmF0ZWd5XCIsIHsgaWQ6IGpzb24uaWQgfSk7XG4gICAgICAgICAgICBwb3B1bGF0ZUJ1aWxkZXJGcm9tU3RyYXRlZ3koanNvbik7XG4gICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcubW9kYWwtb3ZlcmxheScpPy5yZW1vdmUoKTtcbiAgICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgICBhbGVydChcIkludmFsaWQgSlNPTjogXCIgKyBlKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgc2hvd01vZGFsKFwiSW1wb3J0IFN0cmF0ZWd5XCIsIGNvbnRlbnQpO1xufVxuIiwgImltcG9ydCB7IGFwcFN0YXRlIH0gZnJvbSBcIi4vc3RhdGUuanNcIjtcbmltcG9ydCB7IExvZ0VudHJ5LCBMb2dMZXZlbCwgUHJlZmVyZW5jZXMgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBlc2NhcGVIdG1sIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC91dGlscy5qc1wiO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbG9hZExvZ3MoKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdnZXRMb2dzJyB9KTtcbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9rICYmIHJlc3BvbnNlLmRhdGEpIHtcbiAgICAgICAgICAgIGFwcFN0YXRlLmN1cnJlbnRMb2dzID0gcmVzcG9uc2UuZGF0YTtcbiAgICAgICAgICAgIHJlbmRlckxvZ3MoKTtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBsb2FkIGxvZ3NcIiwgZSk7XG4gICAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY2xlYXJSZW1vdGVMb2dzKCkge1xuICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2NsZWFyTG9ncycgfSk7XG4gICAgICAgIGxvYWRMb2dzKCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGNsZWFyIGxvZ3NcIiwgZSk7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyTG9ncygpIHtcbiAgICBjb25zdCB0Ym9keSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2dzLXRhYmxlLWJvZHknKTtcbiAgICBjb25zdCBsZXZlbEZpbHRlciA9IChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbG9nLWxldmVsLWZpbHRlcicpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICBjb25zdCBzZWFyY2hUZXh0ID0gKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2ctc2VhcmNoJykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUudG9Mb3dlckNhc2UoKTtcblxuICAgIGlmICghdGJvZHkpIHJldHVybjtcblxuICAgIHRib2R5LmlubmVySFRNTCA9ICcnO1xuXG4gICAgY29uc3QgZmlsdGVyZWQgPSBhcHBTdGF0ZS5jdXJyZW50TG9ncy5maWx0ZXIoZW50cnkgPT4ge1xuICAgICAgICBpZiAobGV2ZWxGaWx0ZXIgIT09ICdhbGwnICYmIGVudHJ5LmxldmVsICE9PSBsZXZlbEZpbHRlcikgcmV0dXJuIGZhbHNlO1xuICAgICAgICBpZiAoc2VhcmNoVGV4dCkge1xuICAgICAgICAgICAgY29uc3QgdGV4dCA9IGAke2VudHJ5Lm1lc3NhZ2V9ICR7SlNPTi5zdHJpbmdpZnkoZW50cnkuY29udGV4dCB8fCB7fSl9YC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgaWYgKCF0ZXh0LmluY2x1ZGVzKHNlYXJjaFRleHQpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSk7XG5cbiAgICBpZiAoZmlsdGVyZWQubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHRib2R5LmlubmVySFRNTCA9ICc8dHI+PHRkIGNvbHNwYW49XCI0XCIgc3R5bGU9XCJwYWRkaW5nOiAxMHB4OyB0ZXh0LWFsaWduOiBjZW50ZXI7IGNvbG9yOiAjODg4O1wiPk5vIGxvZ3MgZm91bmQuPC90ZD48L3RyPic7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBmaWx0ZXJlZC5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgICAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndHInKTtcblxuICAgICAgICAvLyBDb2xvciBjb2RlIGxldmVsXG4gICAgICAgIGxldCBjb2xvciA9ICcjMzMzJztcbiAgICAgICAgaWYgKGVudHJ5LmxldmVsID09PSAnZXJyb3InIHx8IGVudHJ5LmxldmVsID09PSAnY3JpdGljYWwnKSBjb2xvciA9ICdyZWQnO1xuICAgICAgICBlbHNlIGlmIChlbnRyeS5sZXZlbCA9PT0gJ3dhcm4nKSBjb2xvciA9ICdvcmFuZ2UnO1xuICAgICAgICBlbHNlIGlmIChlbnRyeS5sZXZlbCA9PT0gJ2RlYnVnJykgY29sb3IgPSAnYmx1ZSc7XG5cbiAgICAgICAgcm93LmlubmVySFRNTCA9IGBcbiAgICAgICAgICAgIDx0ZCBzdHlsZT1cInBhZGRpbmc6IDhweDsgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkICNlZWU7IHdoaXRlLXNwYWNlOiBub3dyYXA7XCI+JHtuZXcgRGF0ZShlbnRyeS50aW1lc3RhbXApLnRvTG9jYWxlVGltZVN0cmluZygpfSAoJHtlbnRyeS50aW1lc3RhbXB9KTwvdGQ+XG4gICAgICAgICAgICA8dGQgc3R5bGU9XCJwYWRkaW5nOiA4cHg7IGJvcmRlci1ib3R0b206IDFweCBzb2xpZCAjZWVlOyBjb2xvcjogJHtjb2xvcn07IGZvbnQtd2VpZ2h0OiBib2xkO1wiPiR7ZW50cnkubGV2ZWwudG9VcHBlckNhc2UoKX08L3RkPlxuICAgICAgICAgICAgPHRkIHN0eWxlPVwicGFkZGluZzogOHB4OyBib3JkZXItYm90dG9tOiAxcHggc29saWQgI2VlZTtcIj4ke2VzY2FwZUh0bWwoZW50cnkubWVzc2FnZSl9PC90ZD5cbiAgICAgICAgICAgIDx0ZCBzdHlsZT1cInBhZGRpbmc6IDhweDsgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkICNlZWU7XCI+XG4gICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwibWF4LWhlaWdodDogMTAwcHg7IG92ZXJmbG93LXk6IGF1dG87XCI+XG4gICAgICAgICAgICAgICAgICAke2VudHJ5LmNvbnRleHQgPyBgPHByZSBzdHlsZT1cIm1hcmdpbjogMDtcIj4ke2VzY2FwZUh0bWwoSlNPTi5zdHJpbmdpZnkoZW50cnkuY29udGV4dCwgbnVsbCwgMikpfTwvcHJlPmAgOiAnLSd9XG4gICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDwvdGQ+XG4gICAgICAgIGA7XG4gICAgICAgIHRib2R5LmFwcGVuZENoaWxkKHJvdyk7XG4gICAgfSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBsb2FkR2xvYmFsTG9nTGV2ZWwoKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdsb2FkUHJlZmVyZW5jZXMnIH0pO1xuICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2sgJiYgcmVzcG9uc2UuZGF0YSkge1xuICAgICAgICAgICAgY29uc3QgcHJlZnMgPSByZXNwb25zZS5kYXRhIGFzIFByZWZlcmVuY2VzO1xuICAgICAgICAgICAgY29uc3Qgc2VsZWN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dsb2JhbC1sb2ctbGV2ZWwnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgICAgIGlmIChzZWxlY3QpIHtcbiAgICAgICAgICAgICAgICBzZWxlY3QudmFsdWUgPSBwcmVmcy5sb2dMZXZlbCB8fCAnaW5mbyc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gbG9hZCBwcmVmcyBmb3IgbG9nc1wiLCBlKTtcbiAgICB9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB1cGRhdGVHbG9iYWxMb2dMZXZlbCgpIHtcbiAgICBjb25zdCBzZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2xvYmFsLWxvZy1sZXZlbCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgIGlmICghc2VsZWN0KSByZXR1cm47XG4gICAgY29uc3QgbGV2ZWwgPSBzZWxlY3QudmFsdWUgYXMgTG9nTGV2ZWw7XG5cbiAgICB0cnkge1xuICAgICAgICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICB0eXBlOiAnc2F2ZVByZWZlcmVuY2VzJyxcbiAgICAgICAgICAgIHBheWxvYWQ6IHsgbG9nTGV2ZWw6IGxldmVsIH1cbiAgICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIHNhdmUgbG9nIGxldmVsXCIsIGUpO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRMb2dzKCkge1xuICBjb25zdCByZWZyZXNoTG9nc0J0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZWZyZXNoLWxvZ3MtYnRuJyk7XG4gIGlmIChyZWZyZXNoTG9nc0J0bikgcmVmcmVzaExvZ3NCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBsb2FkTG9ncyk7XG5cbiAgY29uc3QgY2xlYXJMb2dzQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NsZWFyLWxvZ3MtYnRuJyk7XG4gIGlmIChjbGVhckxvZ3NCdG4pIGNsZWFyTG9nc0J0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGNsZWFyUmVtb3RlTG9ncyk7XG5cbiAgY29uc3QgbG9nTGV2ZWxGaWx0ZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbG9nLWxldmVsLWZpbHRlcicpO1xuICBpZiAobG9nTGV2ZWxGaWx0ZXIpIGxvZ0xldmVsRmlsdGVyLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIHJlbmRlckxvZ3MpO1xuXG4gIGNvbnN0IGxvZ1NlYXJjaCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2ctc2VhcmNoJyk7XG4gIGlmIChsb2dTZWFyY2gpIGxvZ1NlYXJjaC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIHJlbmRlckxvZ3MpO1xuXG4gIGNvbnN0IGdsb2JhbExvZ0xldmVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dsb2JhbC1sb2ctbGV2ZWwnKTtcbiAgaWYgKGdsb2JhbExvZ0xldmVsKSBnbG9iYWxMb2dMZXZlbC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB1cGRhdGVHbG9iYWxMb2dMZXZlbCk7XG59XG4iLCAiaW1wb3J0IHsgYXBwU3RhdGUgfSBmcm9tIFwiLi9zdGF0ZS5qc1wiO1xuaW1wb3J0IHsgbG9hZFRhYnMgfSBmcm9tIFwiLi90YWJzVGFibGUuanNcIjtcbmltcG9ydCB7IFByZWZlcmVuY2VzIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC90eXBlcy5qc1wiO1xuaW1wb3J0IHsgbG9nSW5mbyB9IGZyb20gXCIuLi8uLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBlc2NhcGVIdG1sIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC91dGlscy5qc1wiO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbG9hZEN1c3RvbUdlbmVyYSgpIHtcbiAgICBjb25zdCBsaXN0Q29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2N1c3RvbS1nZW5lcmEtbGlzdCcpO1xuICAgIGlmICghbGlzdENvbnRhaW5lcikgcmV0dXJuO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdsb2FkUHJlZmVyZW5jZXMnIH0pO1xuICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2sgJiYgcmVzcG9uc2UuZGF0YSkge1xuICAgICAgICAgICAgY29uc3QgcHJlZnMgPSByZXNwb25zZS5kYXRhIGFzIFByZWZlcmVuY2VzO1xuICAgICAgICAgICAgcmVuZGVyQ3VzdG9tR2VuZXJhTGlzdChwcmVmcy5jdXN0b21HZW5lcmEgfHwge30pO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGxvYWQgY3VzdG9tIGdlbmVyYVwiLCBlKTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJDdXN0b21HZW5lcmFMaXN0KGN1c3RvbUdlbmVyYTogUmVjb3JkPHN0cmluZywgc3RyaW5nPikge1xuICAgIGNvbnN0IGxpc3RDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY3VzdG9tLWdlbmVyYS1saXN0Jyk7XG4gICAgaWYgKCFsaXN0Q29udGFpbmVyKSByZXR1cm47XG5cbiAgICBpZiAoT2JqZWN0LmtleXMoY3VzdG9tR2VuZXJhKS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgbGlzdENvbnRhaW5lci5pbm5lckhUTUwgPSAnPHAgc3R5bGU9XCJjb2xvcjogIzg4ODsgZm9udC1zdHlsZTogaXRhbGljO1wiPk5vIGN1c3RvbSBlbnRyaWVzLjwvcD4nO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgbGlzdENvbnRhaW5lci5pbm5lckhUTUwgPSBPYmplY3QuZW50cmllcyhjdXN0b21HZW5lcmEpLm1hcCgoW2RvbWFpbiwgY2F0ZWdvcnldKSA9PiBgXG4gICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47IGFsaWduLWl0ZW1zOiBjZW50ZXI7IHBhZGRpbmc6IDVweDsgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkICNmMGYwZjA7XCI+XG4gICAgICAgICAgICA8c3Bhbj48Yj4ke2VzY2FwZUh0bWwoZG9tYWluKX08L2I+OiAke2VzY2FwZUh0bWwoY2F0ZWdvcnkpfTwvc3Bhbj5cbiAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJkZWxldGUtZ2VuZXJhLWJ0blwiIGRhdGEtZG9tYWluPVwiJHtlc2NhcGVIdG1sKGRvbWFpbil9XCIgc3R5bGU9XCJiYWNrZ3JvdW5kOiBub25lOyBib3JkZXI6IG5vbmU7IGNvbG9yOiByZWQ7IGN1cnNvcjogcG9pbnRlcjtcIj4mdGltZXM7PC9idXR0b24+XG4gICAgICAgIDwvZGl2PlxuICAgIGApLmpvaW4oJycpO1xuXG4gICAgLy8gUmUtYXR0YWNoIGxpc3RlbmVycyBmb3IgZGVsZXRlIGJ1dHRvbnNcbiAgICBsaXN0Q29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5kZWxldGUtZ2VuZXJhLWJ0bicpLmZvckVhY2goYnRuID0+IHtcbiAgICAgICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgYXN5bmMgKGUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGRvbWFpbiA9IChlLnRhcmdldCBhcyBIVE1MRWxlbWVudCkuZGF0YXNldC5kb21haW47XG4gICAgICAgICAgICBpZiAoZG9tYWluKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgZGVsZXRlQ3VzdG9tR2VuZXJhKGRvbWFpbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYWRkQ3VzdG9tR2VuZXJhKCkge1xuICAgIGNvbnN0IGRvbWFpbklucHV0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ25ldy1nZW5lcmEtZG9tYWluJykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICBjb25zdCBjYXRlZ29yeUlucHV0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ25ldy1nZW5lcmEtY2F0ZWdvcnknKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuXG4gICAgaWYgKCFkb21haW5JbnB1dCB8fCAhY2F0ZWdvcnlJbnB1dCkgcmV0dXJuO1xuXG4gICAgY29uc3QgZG9tYWluID0gZG9tYWluSW5wdXQudmFsdWUudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3QgY2F0ZWdvcnkgPSBjYXRlZ29yeUlucHV0LnZhbHVlLnRyaW0oKTtcblxuICAgIGlmICghZG9tYWluIHx8ICFjYXRlZ29yeSkge1xuICAgICAgICBhbGVydChcIlBsZWFzZSBlbnRlciBib3RoIGRvbWFpbiBhbmQgY2F0ZWdvcnkuXCIpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgbG9nSW5mbyhcIkFkZGluZyBjdXN0b20gZ2VuZXJhXCIsIHsgZG9tYWluLCBjYXRlZ29yeSB9KTtcblxuICAgIHRyeSB7XG4gICAgICAgIC8vIEZldGNoIGN1cnJlbnQgdG8gbWVyZ2VcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdsb2FkUHJlZmVyZW5jZXMnIH0pO1xuICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2sgJiYgcmVzcG9uc2UuZGF0YSkge1xuICAgICAgICAgICAgY29uc3QgcHJlZnMgPSByZXNwb25zZS5kYXRhIGFzIFByZWZlcmVuY2VzO1xuICAgICAgICAgICAgY29uc3QgbmV3Q3VzdG9tR2VuZXJhID0geyAuLi4ocHJlZnMuY3VzdG9tR2VuZXJhIHx8IHt9KSwgW2RvbWFpbl06IGNhdGVnb3J5IH07XG5cbiAgICAgICAgICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnc2F2ZVByZWZlcmVuY2VzJyxcbiAgICAgICAgICAgICAgICBwYXlsb2FkOiB7IGN1c3RvbUdlbmVyYTogbmV3Q3VzdG9tR2VuZXJhIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBkb21haW5JbnB1dC52YWx1ZSA9ICcnO1xuICAgICAgICAgICAgY2F0ZWdvcnlJbnB1dC52YWx1ZSA9ICcnO1xuICAgICAgICAgICAgbG9hZEN1c3RvbUdlbmVyYSgpO1xuICAgICAgICAgICAgbG9hZFRhYnMoKTsgLy8gUmVmcmVzaCB0YWJzIHRvIGFwcGx5IG5ldyBjbGFzc2lmaWNhdGlvbiBpZiByZWxldmFudFxuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGFkZCBjdXN0b20gZ2VuZXJhXCIsIGUpO1xuICAgIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGRlbGV0ZUN1c3RvbUdlbmVyYShkb21haW46IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICAgIGxvZ0luZm8oXCJEZWxldGluZyBjdXN0b20gZ2VuZXJhXCIsIHsgZG9tYWluIH0pO1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2xvYWRQcmVmZXJlbmNlcycgfSk7XG4gICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vayAmJiByZXNwb25zZS5kYXRhKSB7XG4gICAgICAgICAgICBjb25zdCBwcmVmcyA9IHJlc3BvbnNlLmRhdGEgYXMgUHJlZmVyZW5jZXM7XG4gICAgICAgICAgICBjb25zdCBuZXdDdXN0b21HZW5lcmEgPSB7IC4uLihwcmVmcy5jdXN0b21HZW5lcmEgfHwge30pIH07XG4gICAgICAgICAgICBkZWxldGUgbmV3Q3VzdG9tR2VuZXJhW2RvbWFpbl07XG5cbiAgICAgICAgICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnc2F2ZVByZWZlcmVuY2VzJyxcbiAgICAgICAgICAgICAgICBwYXlsb2FkOiB7IGN1c3RvbUdlbmVyYTogbmV3Q3VzdG9tR2VuZXJhIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBsb2FkQ3VzdG9tR2VuZXJhKCk7XG4gICAgICAgICAgICBsb2FkVGFicygpO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGRlbGV0ZSBjdXN0b20gZ2VuZXJhXCIsIGUpO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRHZW5lcmEoKSB7XG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZXZlbnQpID0+IHtcbiAgICAgICAgY29uc3QgdGFyZ2V0ID0gZXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICAgICAgaWYgKHRhcmdldCAmJiB0YXJnZXQuaWQgPT09ICdhZGQtZ2VuZXJhLWJ0bicpIHtcbiAgICAgICAgICAgIGFkZEN1c3RvbUdlbmVyYSgpO1xuICAgICAgICB9XG4gICAgfSk7XG59XG4iLCAiaW1wb3J0IHsgYXBwU3RhdGUgfSBmcm9tIFwiLi9kZXZ0b29scy9zdGF0ZS5qc1wiO1xuaW1wb3J0IHsgaW5pdFRhYnNUYWJsZSwgbG9hZFRhYnMgfSBmcm9tIFwiLi9kZXZ0b29scy90YWJzVGFibGUuanNcIjtcbmltcG9ydCB7IGluaXRTdHJhdGVnaWVzLCBsb2FkUHJlZmVyZW5jZXNBbmRJbml0IH0gZnJvbSBcIi4vZGV2dG9vbHMvc3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgaW5pdFN0cmF0ZWd5QnVpbGRlciB9IGZyb20gXCIuL2RldnRvb2xzL3N0cmF0ZWd5QnVpbGRlci5qc1wiO1xuaW1wb3J0IHsgaW5pdExvZ3MsIGxvYWRMb2dzLCBsb2FkR2xvYmFsTG9nTGV2ZWwgfSBmcm9tIFwiLi9kZXZ0b29scy9sb2dzLmpzXCI7XG5pbXBvcnQgeyBpbml0R2VuZXJhLCBsb2FkQ3VzdG9tR2VuZXJhIH0gZnJvbSBcIi4vZGV2dG9vbHMvZ2VuZXJhLmpzXCI7XG5pbXBvcnQgeyBpbml0U2ltdWxhdGlvbiwgcmVuZGVyU3RyYXRlZ3lDb25maWcgfSBmcm9tIFwiLi9kZXZ0b29scy9zaW11bGF0aW9uLmpzXCI7XG5pbXBvcnQgeyByZW5kZXJBbGdvcml0aG1zVmlldywgc2hvd1N0cmF0ZWd5RGV0YWlscyB9IGZyb20gXCIuL2RldnRvb2xzL2NvbXBvbmVudHMuanNcIjtcbmltcG9ydCB7IGxvZ0luZm8gfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgZXNjYXBlSHRtbCB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcblxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsIGFzeW5jICgpID0+IHtcbiAgLy8gVGFiIFN3aXRjaGluZyBMb2dpY1xuICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcudGFiLWJ0bicpLmZvckVhY2goYnRuID0+IHtcbiAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAvLyBSZW1vdmUgYWN0aXZlIGNsYXNzIGZyb20gYWxsIGJ1dHRvbnMgYW5kIHNlY3Rpb25zXG4gICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcudGFiLWJ0bicpLmZvckVhY2goYiA9PiBiLmNsYXNzTGlzdC5yZW1vdmUoJ2FjdGl2ZScpKTtcbiAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy52aWV3LXNlY3Rpb24nKS5mb3JFYWNoKHMgPT4gcy5jbGFzc0xpc3QucmVtb3ZlKCdhY3RpdmUnKSk7XG5cbiAgICAgIC8vIEFkZCBhY3RpdmUgY2xhc3MgdG8gY2xpY2tlZCBidXR0b25cbiAgICAgIGJ0bi5jbGFzc0xpc3QuYWRkKCdhY3RpdmUnKTtcblxuICAgICAgLy8gU2hvdyB0YXJnZXQgc2VjdGlvblxuICAgICAgY29uc3QgdGFyZ2V0SWQgPSAoYnRuIGFzIEhUTUxFbGVtZW50KS5kYXRhc2V0LnRhcmdldDtcbiAgICAgIGlmICh0YXJnZXRJZCkge1xuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCh0YXJnZXRJZCk/LmNsYXNzTGlzdC5hZGQoJ2FjdGl2ZScpO1xuICAgICAgICBsb2dJbmZvKFwiU3dpdGNoZWQgdmlld1wiLCB7IHRhcmdldElkIH0pO1xuICAgICAgfVxuXG4gICAgICAvLyBJZiBzd2l0Y2hpbmcgdG8gYWxnb3JpdGhtcywgcG9wdWxhdGUgcmVmZXJlbmNlIGlmIGVtcHR5XG4gICAgICBpZiAodGFyZ2V0SWQgPT09ICd2aWV3LWFsZ29yaXRobXMnKSB7XG4gICAgICAgICByZW5kZXJBbGdvcml0aG1zVmlldygpO1xuICAgICAgICAgcmVuZGVyU3RyYXRlZ3lDb25maWcoKTsgLy8gVXBkYXRlIHNpbSBsaXN0IHRvb1xuICAgICAgfSBlbHNlIGlmICh0YXJnZXRJZCA9PT0gJ3ZpZXctc3RyYXRlZ3ktbGlzdCcpIHtcbiAgICAgICAgIC8vIFN0cmF0ZWd5IGxpc3QgaXMgcmVuZGVyZWQgYnkgcmVuZGVyU3RyYXRlZ3lMaXN0VGFibGUgd2hpY2ggaXMgY2FsbGVkIGluIGluaXRcbiAgICAgICAgIC8vIEJ1dCBtYXliZSB3ZSBzaG91bGQgcmVmcmVzaCBpdD9cbiAgICAgICAgIC8vIHJlbmRlclN0cmF0ZWd5TGlzdFRhYmxlKCk7IC8vIGV4cG9ydGVkIGZyb20gc3RyYXRlZ2llcy50c1xuICAgICAgfSBlbHNlIGlmICh0YXJnZXRJZCA9PT0gJ3ZpZXctbG9ncycpIHtcbiAgICAgICAgIGxvYWRMb2dzKCk7XG4gICAgICAgICBsb2FkR2xvYmFsTG9nTGV2ZWwoKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSk7XG5cbiAgLy8gR2xvYmFsIENsaWNrIExpc3RlbmVyIGZvciBzaGFyZWQgYWN0aW9ucyAoY29udGV4dCBqc29uLCBnb3RvIHRhYiwgY2xvc2UgdGFiLCBzdHJhdGVneSB2aWV3KVxuICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChldmVudCkgPT4ge1xuICAgIGNvbnN0IHRhcmdldCA9IGV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgaWYgKCF0YXJnZXQpIHJldHVybjtcblxuICAgIGlmICh0YXJnZXQubWF0Y2hlcygnLmNvbnRleHQtanNvbi1idG4nKSkge1xuICAgICAgY29uc3QgdGFiSWQgPSBOdW1iZXIodGFyZ2V0LmRhdGFzZXQudGFiSWQpO1xuICAgICAgaWYgKCF0YWJJZCkgcmV0dXJuO1xuICAgICAgY29uc3QgZGF0YSA9IGFwcFN0YXRlLmN1cnJlbnRDb250ZXh0TWFwLmdldCh0YWJJZCk/LmRhdGE7XG4gICAgICBpZiAoIWRhdGEpIHJldHVybjtcbiAgICAgIGNvbnN0IGpzb24gPSBKU09OLnN0cmluZ2lmeShkYXRhLCBudWxsLCAyKTtcbiAgICAgIGNvbnN0IGh0bWxDb250ZW50ID0gYFxuICAgICAgICA8IURPQ1RZUEUgaHRtbD5cbiAgICAgICAgPGh0bWw+XG4gICAgICAgIDxoZWFkPlxuICAgICAgICAgIDx0aXRsZT5KU09OIFZpZXc8L3RpdGxlPlxuICAgICAgICAgIDxzdHlsZT5cbiAgICAgICAgICAgIGJvZHkgeyBmb250LWZhbWlseTogbW9ub3NwYWNlOyBiYWNrZ3JvdW5kLWNvbG9yOiAjZjBmMGYwOyBwYWRkaW5nOiAyMHB4OyB9XG4gICAgICAgICAgICBwcmUgeyBiYWNrZ3JvdW5kLWNvbG9yOiB3aGl0ZTsgcGFkZGluZzogMTVweDsgYm9yZGVyLXJhZGl1czogNXB4OyBib3JkZXI6IDFweCBzb2xpZCAjY2NjOyBvdmVyZmxvdzogYXV0bzsgfVxuICAgICAgICAgIDwvc3R5bGU+XG4gICAgICAgIDwvaGVhZD5cbiAgICAgICAgPGJvZHk+XG4gICAgICAgICAgPGgzPkpTT04gRGF0YTwvaDM+XG4gICAgICAgICAgPHByZT4ke2VzY2FwZUh0bWwoanNvbil9PC9wcmU+XG4gICAgICAgIDwvYm9keT5cbiAgICAgICAgPC9odG1sPlxuICAgICAgYDtcbiAgICAgIGNvbnN0IGJsb2IgPSBuZXcgQmxvYihbaHRtbENvbnRlbnRdLCB7IHR5cGU6ICd0ZXh0L2h0bWwnIH0pO1xuICAgICAgY29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbiAgICAgIHdpbmRvdy5vcGVuKHVybCwgJ19ibGFuaycsICdub29wZW5lcixub3JlZmVycmVyJyk7XG4gICAgfSBlbHNlIGlmICh0YXJnZXQubWF0Y2hlcygnLmdvdG8tdGFiLWJ0bicpKSB7XG4gICAgICBjb25zdCB0YWJJZCA9IE51bWJlcih0YXJnZXQuZGF0YXNldC50YWJJZCk7XG4gICAgICBjb25zdCB3aW5kb3dJZCA9IE51bWJlcih0YXJnZXQuZGF0YXNldC53aW5kb3dJZCk7XG4gICAgICBpZiAodGFiSWQgJiYgd2luZG93SWQpIHtcbiAgICAgICAgY2hyb21lLnRhYnMudXBkYXRlKHRhYklkLCB7IGFjdGl2ZTogdHJ1ZSB9KTtcbiAgICAgICAgY2hyb21lLndpbmRvd3MudXBkYXRlKHdpbmRvd0lkLCB7IGZvY3VzZWQ6IHRydWUgfSk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0YXJnZXQubWF0Y2hlcygnLmNsb3NlLXRhYi1idG4nKSkge1xuICAgICAgY29uc3QgdGFiSWQgPSBOdW1iZXIodGFyZ2V0LmRhdGFzZXQudGFiSWQpO1xuICAgICAgaWYgKHRhYklkKSB7XG4gICAgICAgIGNocm9tZS50YWJzLnJlbW92ZSh0YWJJZCk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0YXJnZXQubWF0Y2hlcygnLnN0cmF0ZWd5LXZpZXctYnRuJykpIHtcbiAgICAgICAgY29uc3QgdHlwZSA9IHRhcmdldC5kYXRhc2V0LnR5cGU7XG4gICAgICAgIGNvbnN0IG5hbWUgPSB0YXJnZXQuZGF0YXNldC5uYW1lO1xuICAgICAgICBpZiAodHlwZSAmJiBuYW1lKSB7XG4gICAgICAgICAgICBzaG93U3RyYXRlZ3lEZXRhaWxzKHR5cGUsIG5hbWUpO1xuICAgICAgICB9XG4gICAgfVxuICB9KTtcblxuICAvLyBJbml0aWFsaXplIE1vZHVsZXNcbiAgaW5pdFRhYnNUYWJsZSgpO1xuICBpbml0U3RyYXRlZ2llcygpO1xuICBpbml0U3RyYXRlZ3lCdWlsZGVyKCk7XG4gIGluaXRMb2dzKCk7XG4gIGluaXRHZW5lcmEoKTtcbiAgaW5pdFNpbXVsYXRpb24oKTtcblxuICBsb2FkVGFicygpO1xuXG4gIC8vIFByZS1yZW5kZXIgc3RhdGljIGNvbnRlbnRcbiAgYXdhaXQgbG9hZFByZWZlcmVuY2VzQW5kSW5pdCgpOyAvLyBMb2FkIHByZWZlcmVuY2VzIGZpcnN0IHRvIGluaXQgc3RyYXRlZ2llc1xuXG4gIHJlbmRlckFsZ29yaXRobXNWaWV3KCk7XG4gIHJlbmRlclN0cmF0ZWd5Q29uZmlnKCk7XG5cbiAgbG9hZEN1c3RvbUdlbmVyYSgpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBV08sSUFBTSxXQUFXO0FBQUEsRUFDcEIsYUFBYSxDQUFDO0FBQUEsRUFDZCx1QkFBdUIsQ0FBQztBQUFBLEVBQ3hCLG1CQUFtQixvQkFBSSxJQUEyQjtBQUFBLEVBQ2xELFdBQVcsb0JBQUksSUFBb0I7QUFBQSxFQUNuQyxTQUFTO0FBQUEsRUFDVCxlQUFlO0FBQUEsRUFDZixvQkFBb0Isb0JBQUksSUFBWTtBQUFBO0FBQUEsRUFHcEMsbUJBQW1CO0FBQUEsRUFDbkIsZUFBZSxDQUFDO0FBQUEsRUFDaEIsU0FBUztBQUFBLElBQ0wsRUFBRSxLQUFLLE1BQU0sT0FBTyxNQUFNLFNBQVMsTUFBTSxPQUFPLFFBQVEsWUFBWSxLQUFLO0FBQUEsSUFDekUsRUFBRSxLQUFLLFNBQVMsT0FBTyxTQUFTLFNBQVMsTUFBTSxPQUFPLFFBQVEsWUFBWSxLQUFLO0FBQUEsSUFDL0UsRUFBRSxLQUFLLFlBQVksT0FBTyxVQUFVLFNBQVMsTUFBTSxPQUFPLFFBQVEsWUFBWSxLQUFLO0FBQUEsSUFDbkYsRUFBRSxLQUFLLFdBQVcsT0FBTyxTQUFTLFNBQVMsTUFBTSxPQUFPLFFBQVEsWUFBWSxLQUFLO0FBQUEsSUFDakYsRUFBRSxLQUFLLFNBQVMsT0FBTyxTQUFTLFNBQVMsTUFBTSxPQUFPLFNBQVMsWUFBWSxLQUFLO0FBQUEsSUFDaEYsRUFBRSxLQUFLLE9BQU8sT0FBTyxPQUFPLFNBQVMsTUFBTSxPQUFPLFNBQVMsWUFBWSxLQUFLO0FBQUEsSUFDNUUsRUFBRSxLQUFLLFNBQVMsT0FBTyxTQUFT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SztBQUN6QyxZQUFNLFdBQVcsT0FBTyxPQUFPLFFBQVEsUUFBUTtBQUMvQyxVQUFJLFNBQVMsVUFBVTtBQUNyQixlQUFPLEtBQUssT0FBTyxPQUFPLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFDMUMsZUFBTyxRQUFRLE9BQU8sVUFBVSxFQUFFLFNBQVMsS0FBSyxDQUFDO0FBQUEsTUFDbkQ7QUFBQSxJQUNGLFdBQVcsT0FBTyxRQUFRLGdCQUFnQixHQUFHO0FBQzNDLFlBQU0sUUFBUSxPQUFPLE9BQU8sUUFBUSxLQUFLO0FBQ3pDLFVBQUksT0FBTztBQUNULGVBQU8sS0FBSyxPQUFPLEtBQUs7QUFBQSxNQUMxQjtBQUFBLElBQ0YsV0FBVyxPQUFPLFFBQVEsb0JBQW9CLEdBQUc7QUFDN0MsWUFBTSxPQUFPLE9BQU8sUUFBUTtBQUM1QixZQUFNLE9BQU8sT0FBTyxRQUFRO0FBQzVCLFVBQUksUUFBUSxNQUFNO0FBQ2QsNEJBQW9CLE1BQU0sSUFBSTtBQUFBLE1BQ2xDO0FBQUEsSUFDSjtBQUFBLEVBQ0YsQ0FBQztBQUdELGdCQUFjO0FBQ2QsaUJBQWU7QUFDZixzQkFBb0I7QUFDcEIsV0FBUztBQUNULGFBQVc7QUFDWCxpQkFBZTtBQUVmLFdBQVM7QUFHVCxRQUFNLHVCQUF1QjtBQUU3Qix1QkFBcUI7QUFDckIsdUJBQXFCO0FBRXJCLG1CQUFpQjtBQUNuQixDQUFDOyIsCiAgIm5hbWVzIjogWyJwYXJ0cyIsICJjdXN0b21TdHJhdGVnaWVzIiwgImdyb3VwVGFicyJdCn0K
