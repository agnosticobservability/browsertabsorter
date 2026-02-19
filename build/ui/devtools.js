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
  const url = tab.url.toLowerCase();
  let context = "Uncategorized";
  if (url.includes("github") || url.includes("stackoverflow") || url.includes("localhost") || url.includes("jira") || url.includes("gitlab")) context = "Development";
  else if (url.includes("google") && (url.includes("docs") || url.includes("sheets") || url.includes("slides"))) context = "Work";
  else if (url.includes("linkedin") || url.includes("slack") || url.includes("zoom") || url.includes("teams")) context = "Work";
  else if (url.includes("netflix") || url.includes("spotify") || url.includes("hulu") || url.includes("disney") || url.includes("youtube")) context = "Entertainment";
  else if (url.includes("twitter") || url.includes("facebook") || url.includes("instagram") || url.includes("reddit") || url.includes("tiktok") || url.includes("pinterest")) context = "Social";
  else if (url.includes("amazon") || url.includes("ebay") || url.includes("walmart") || url.includes("target") || url.includes("shopify")) context = "Shopping";
  else if (url.includes("cnn") || url.includes("bbc") || url.includes("nytimes") || url.includes("washingtonpost") || url.includes("foxnews")) context = "News";
  else if (url.includes("coursera") || url.includes("udemy") || url.includes("edx") || url.includes("khanacademy") || url.includes("canvas")) context = "Education";
  else if (url.includes("expedia") || url.includes("booking") || url.includes("airbnb") || url.includes("tripadvisor") || url.includes("kayak")) context = "Travel";
  else if (url.includes("webmd") || url.includes("mayoclinic") || url.includes("nih.gov") || url.includes("health")) context = "Health";
  else if (url.includes("espn") || url.includes("nba") || url.includes("nfl") || url.includes("mlb") || url.includes("fifa")) context = "Sports";
  else if (url.includes("techcrunch") || url.includes("wired") || url.includes("theverge") || url.includes("arstechnica")) context = "Technology";
  else if (url.includes("science") || url.includes("nature.com") || url.includes("nasa.gov")) context = "Science";
  else if (url.includes("twitch") || url.includes("steam") || url.includes("roblox") || url.includes("ign") || url.includes("gamespot")) context = "Gaming";
  else if (url.includes("soundcloud") || url.includes("bandcamp") || url.includes("last.fm")) context = "Music";
  else if (url.includes("deviantart") || url.includes("behance") || url.includes("dribbble") || url.includes("artstation")) context = "Art";
  return { context, source: "Heuristic" };
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
function setupDraggableItem(row, onDragEnd) {
  row.setAttribute("draggable", "true");
  row.addEventListener("dragstart", (e) => {
    row.classList.add("dragging");
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
    }
  });
  row.addEventListener("dragend", () => {
    row.classList.remove("dragging");
    if (onDragEnd) onDragEnd(row);
  });
}
function setupDropZone(container, itemSelector) {
  container.addEventListener("dragover", (e) => {
    e.preventDefault();
    const afterElement = getDragAfterElement(container, e.clientY, `${itemSelector}:not(.dragging)`);
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

// src/ui/devtools.ts
var currentTabs = [];
var localCustomStrategies = [];
var currentContextMap = /* @__PURE__ */ new Map();
var tabTitles = /* @__PURE__ */ new Map();
var sortKey = null;
var sortDirection = "asc";
var simulatedSelection = /* @__PURE__ */ new Set();
var globalSearchQuery = "";
var columnFilters = {};
var columns = [
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
  { key: "genre", label: "Genre", visible: true, width: "100px", filterable: true },
  { key: "context", label: "Extracted Context", visible: true, width: "400px", filterable: true },
  { key: "lastAccessed", label: "Last Accessed", visible: true, width: "150px", filterable: false },
  { key: "actions", label: "Actions", visible: true, width: "120px", filterable: false }
];
document.addEventListener("DOMContentLoaded", async () => {
  const refreshBtn = document.getElementById("refreshBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", loadTabs);
  }
  const groupingList = document.getElementById("sim-grouping-list");
  const sortingList = document.getElementById("sim-sorting-list");
  if (groupingList) setupDropZone(groupingList, ".strategy-row");
  if (sortingList) setupDropZone(sortingList, ".strategy-row");
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
      } else if (targetId === "view-strategy-list") {
        renderStrategyListTable();
      } else if (targetId === "view-logs") {
        loadLogs();
        loadGlobalLogLevel();
      }
    });
  });
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
  const runSimBtn = document.getElementById("runSimBtn");
  if (runSimBtn) {
    runSimBtn.addEventListener("click", runSimulation);
  }
  const applyBtn = document.getElementById("applyBtn");
  if (applyBtn) {
    applyBtn.addEventListener("click", applyToBrowser);
  }
  const globalSearchInput = document.getElementById("globalSearch");
  if (globalSearchInput) {
    globalSearchInput.addEventListener("input", (e) => {
      globalSearchQuery = e.target.value;
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
      columns.forEach((c) => c.visible = ["id", "title", "url", "windowId", "groupId", "genre", "context", "siteName", "platform", "objectType", "authorOrCreator", "actions"].includes(c.key));
      globalSearchQuery = "";
      if (globalSearchInput) globalSearchInput.value = "";
      columnFilters = {};
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
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!target) return;
    if (target.matches(".context-json-btn")) {
      const tabId = Number(target.dataset.tabId);
      if (!tabId) return;
      const data = currentContextMap.get(tabId)?.data;
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
  renderTableHeader();
  loadTabs();
  await loadPreferencesAndInit();
  renderAlgorithmsView();
  loadCustomGenera();
  initStrategyBuilder();
  const exportAllBtn = document.getElementById("strategy-list-export-btn");
  const importAllBtn = document.getElementById("strategy-list-import-btn");
  if (exportAllBtn) exportAllBtn.addEventListener("click", exportAllStrategies);
  if (importAllBtn) importAllBtn.addEventListener("click", importAllStrategies);
});
function renderColumnsMenu() {
  const menu = document.getElementById("columnsMenu");
  if (!menu) return;
  menu.innerHTML = columns.map((col) => `
        <label class="column-toggle">
            <input type="checkbox" data-key="${col.key}" ${col.visible ? "checked" : ""}>
            ${escapeHtml(col.label)}
        </label>
    `).join("");
  menu.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", (e) => {
      const key = e.target.dataset.key;
      const checked = e.target.checked;
      const col = columns.find((c) => c.key === key);
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
  const visibleCols = columns.filter((c) => c.visible);
  headerRow.innerHTML = visibleCols.map((col) => `
        <th class="${col.key !== "actions" ? "sortable" : ""}" data-key="${col.key}" style="width: ${col.width}; position: relative;">
            ${escapeHtml(col.label)}
            <div class="resizer"></div>
        </th>
    `).join("");
  filterRow.innerHTML = visibleCols.map((col) => {
    if (!col.filterable) return "<th></th>";
    const val = columnFilters[col.key] || "";
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
        columnFilters[key] = val;
        renderTable();
      }
    });
  });
  headerRow.querySelectorAll(".resizer").forEach((resizer) => {
    initResize(resizer);
  });
  updateHeaderStyles();
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
    const col = columns.find((c) => c.key === colKey);
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
async function loadPreferencesAndInit() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "loadPreferences" });
    if (response && response.ok && response.data) {
      const prefs = response.data;
      localCustomStrategies = prefs.customStrategies || [];
      setCustomStrategies(localCustomStrategies);
      renderStrategyLoadOptions();
      renderStrategyListTable();
    }
  } catch (e) {
    console.error("Failed to load preferences", e);
  }
}
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
      let strat = localCustomStrategies.find((s) => s.id === selectedId);
      if (!strat) {
        strat = getBuiltInStrategyConfig(selectedId) || void 0;
      }
      if (strat) {
        populateBuilderFromStrategy(strat);
      }
    });
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
        if (simulatedSelection.has(id)) simulatedSelection.delete(id);
        else simulatedSelection.add(id);
      } else if (type === "group") {
        chrome.tabs.query({}).then((tabs) => {
          const groupTabs2 = tabs.filter((t) => t.groupId === id);
          const allSelected = groupTabs2.every((t) => t.id && simulatedSelection.has(t.id));
          groupTabs2.forEach((t) => {
            if (t.id) {
              if (allSelected) simulatedSelection.delete(t.id);
              else simulatedSelection.add(t.id);
            }
          });
          renderLiveView();
        });
        return;
      } else if (type === "window") {
        chrome.tabs.query({}).then((tabs) => {
          const winTabs = tabs.filter((t) => t.windowId === id);
          const allSelected = winTabs.every((t) => t.id && simulatedSelection.has(t.id));
          winTabs.forEach((t) => {
            if (t.id) {
              if (allSelected) simulatedSelection.delete(t.id);
              else simulatedSelection.add(t.id);
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
function exportAllStrategies() {
  logInfo("Exporting all strategies", { count: localCustomStrategies.length });
  const json = JSON.stringify(localCustomStrategies, null, 2);
  const content = `
        <p>Copy the JSON below (contains ${localCustomStrategies.length} strategies):</p>
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
      const stratMap = new Map(localCustomStrategies.map((s) => [s.id, s]));
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
      localCustomStrategies = newStrategies;
      setCustomStrategies(localCustomStrategies);
      renderStrategyLoadOptions();
      renderStrategyListTable();
      renderAlgorithmsView();
      alert(`Imported ${count} strategies.`);
      document.querySelector(".modal-overlay")?.remove();
    } catch (e) {
      alert("Invalid JSON: " + e);
    }
  });
  showModal("Import All Strategies", content);
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
  const originalStrategies = [...localCustomStrategies];
  try {
    const existingIdx = localCustomStrategies.findIndex((s) => s.id === simStrat.id);
    if (existingIdx !== -1) {
      localCustomStrategies[existingIdx] = simStrat;
    } else {
      localCustomStrategies.push(simStrat);
    }
    setCustomStrategies(localCustomStrategies);
    let tabs = getMappedTabs();
    if (tabs.length === 0) {
      resultContainer.innerHTML = "<p>No tabs found to simulate.</p>";
      return;
    }
    if (simulatedSelection.size > 0) {
      tabs = tabs.map((t) => ({
        ...t,
        selected: simulatedSelection.has(t.id)
      }));
    }
    tabs = sortTabs(tabs, [simStrat.id]);
    const groups = groupTabs(tabs, [simStrat.id]);
    if (groups.length === 0) {
      const stratDef = getStrategies(localCustomStrategies).find((s) => s.id === simStrat.id);
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
    localCustomStrategies = originalStrategies;
    setCustomStrategies(localCustomStrategies);
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
      localCustomStrategies = currentStrategies;
      setCustomStrategies(localCustomStrategies);
      renderStrategyLoadOptions();
      renderStrategyListTable();
      renderAlgorithmsView();
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
function renderStrategyLoadOptions() {
  const select = document.getElementById("strategy-load-select");
  if (!select) return;
  const customOptions = localCustomStrategies.slice().sort((a, b) => a.label.localeCompare(b.label)).map((strategy) => `
            <option value="${escapeHtml(strategy.id)}">${escapeHtml(strategy.label)} (${escapeHtml(strategy.id)})</option>
        `).join("");
  const builtInOptions = STRATEGIES.filter((s) => !localCustomStrategies.some((cs) => cs.id === s.id)).map((strategy) => `
            <option value="${escapeHtml(strategy.id)}">${escapeHtml(strategy.label)} (Built-in)</option>
        `).join("");
  select.innerHTML = `<option value="">Load saved strategy...</option>` + (customOptions ? `<optgroup label="Custom Strategies">${customOptions}</optgroup>` : "") + (builtInOptions ? `<optgroup label="Built-in Strategies">${builtInOptions}</optgroup>` : "");
}
function renderStrategyListTable() {
  const tableBody = document.getElementById("strategy-table-body");
  if (!tableBody) return;
  const customIds = new Set(localCustomStrategies.map((strategy) => strategy.id));
  const builtInRows = STRATEGIES.map((strategy) => ({
    ...strategy,
    sourceLabel: "Built-in",
    configSummary: "\u2014",
    autoRunLabel: "\u2014",
    actions: ""
  }));
  const customRows = localCustomStrategies.map((strategy) => {
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
      localCustomStrategies = newStrategies;
      setCustomStrategies(localCustomStrategies);
      renderStrategyLoadOptions();
      renderStrategyListTable();
      renderAlgorithmsView();
    }
  } catch (e) {
    console.error("Failed to delete strategy", e);
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
document.addEventListener("click", (event) => {
  const target = event.target;
  if (target && target.id === "add-genera-btn") {
    addCustomGenera();
  }
});
async function loadTabs() {
  logInfo("Loading tabs for DevTools");
  const tabs = await chrome.tabs.query({});
  currentTabs = tabs;
  const totalTabsEl = document.getElementById("totalTabs");
  if (totalTabsEl) {
    totalTabsEl.textContent = tabs.length.toString();
  }
  tabTitles.clear();
  tabs.forEach((tab) => {
    if (tab.id !== void 0) {
      tabTitles.set(tab.id, tab.title || "Untitled");
    }
  });
  const mappedTabs = getMappedTabs();
  try {
    currentContextMap = await analyzeTabContext(mappedTabs);
  } catch (error) {
    console.error("Failed to analyze context", error);
    currentContextMap.clear();
  }
  renderTable();
}
function getMappedTabs() {
  return currentTabs.map((tab) => {
    const metadata = mapChromeTab(tab);
    if (!metadata) return null;
    const contextResult = currentContextMap.get(metadata.id);
    if (contextResult) {
      metadata.context = contextResult.context;
      metadata.contextData = contextResult.data;
    }
    return metadata;
  }).filter((t) => t !== null);
}
function handleSort(key) {
  if (sortKey === key) {
    sortDirection = sortDirection === "asc" ? "desc" : "asc";
  } else {
    sortKey = key;
    sortDirection = "asc";
  }
  updateHeaderStyles();
  renderTable();
}
function updateHeaderStyles() {
  document.querySelectorAll("th.sortable").forEach((th) => {
    th.classList.remove("sort-asc", "sort-desc");
    if (th.getAttribute("data-key") === sortKey) {
      th.classList.add(sortDirection === "asc" ? "sort-asc" : "sort-desc");
    }
  });
}
function getSortValue(tab, key) {
  switch (key) {
    case "parentTitle":
      return tab.openerTabId ? tabTitles.get(tab.openerTabId) || "" : "";
    case "genre":
      return tab.id && currentContextMap.get(tab.id)?.data?.genre || "";
    case "context":
      return tab.id && currentContextMap.get(tab.id)?.context || "";
    case "active":
    case "pinned":
      return tab[key] ? 1 : 0;
    case "id":
    case "index":
    case "windowId":
    case "groupId":
    case "openerTabId":
      return tab[key] || -1;
    case "lastAccessed":
      return tab[key] || 0;
    case "title":
    case "url":
    case "status":
      return (tab[key] || "").toLowerCase();
    default:
      return tab[key];
  }
}
function renderTable() {
  const tbody = document.querySelector("#tabsTable tbody");
  if (!tbody) return;
  let tabsDisplay = currentTabs.filter((tab) => {
    if (globalSearchQuery) {
      const q = globalSearchQuery.toLowerCase();
      const searchableText = `${tab.title} ${tab.url} ${tab.id}`.toLowerCase();
      if (!searchableText.includes(q)) return false;
    }
    for (const [key, filter] of Object.entries(columnFilters)) {
      if (!filter) continue;
      const val = String(getSortValue(tab, key)).toLowerCase();
      if (!val.includes(filter.toLowerCase())) return false;
    }
    return true;
  });
  if (sortKey) {
    tabsDisplay.sort((a, b) => {
      let valA = getSortValue(a, sortKey);
      let valB = getSortValue(b, sortKey);
      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }
  tbody.innerHTML = "";
  const visibleCols = columns.filter((c) => c.visible);
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
function stripHtml(html) {
  let tmp = document.createElement("DIV");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
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
      return escape(tab.openerTabId ? tabTitles.get(tab.openerTabId) || "Unknown" : "-");
    case "genre":
      return escape(tab.id && currentContextMap.get(tab.id)?.data?.genre || "-");
    case "context": {
      const contextResult = tab.id ? currentContextMap.get(tab.id) : void 0;
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
function renderAlgorithmsView() {
  renderStrategyConfig();
  const groupingRef = document.getElementById("grouping-ref");
  const sortingRef = document.getElementById("sorting-ref");
  if (groupingRef) {
    const allStrategies = getStrategies(localCustomStrategies);
    const groupings = allStrategies.filter((s) => s.isGrouping);
    groupingRef.innerHTML = groupings.map((g) => {
      const isCustom = localCustomStrategies.some((s) => s.id === g.id);
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
    const allStrategies = getStrategies(localCustomStrategies);
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
function renderStrategyConfig() {
  const groupingList = document.getElementById("sim-grouping-list");
  const sortingList = document.getElementById("sim-sorting-list");
  const strategies = getStrategies(localCustomStrategies);
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
    setupDraggableItem(row);
    container.appendChild(row);
  });
}
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
      const custom = localCustomStrategies.find((s) => s.id === name);
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
function getEnabledStrategiesFromUI(container) {
  return Array.from(container.children).filter((row) => row.querySelector('input[type="checkbox"]').checked).map((row) => row.dataset.id);
}
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
function escapeHtml(text) {
  if (!text) return "";
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
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
      const winSelected = winTabs.every((t) => t.id && simulatedSelection.has(t.id));
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
          const isSelected = t.id && simulatedSelection.has(t.id);
          html += `<div class="selectable-item ${isSelected ? "selected" : ""}" data-type="tab" data-id="${t.id}" style="margin-left: 10px; padding: 2px 5px; border-radius: 3px; cursor: pointer; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">- ${escapeHtml(t.title || "Untitled")}</div>`;
        });
        html += `</div>`;
      }
      for (const [groupId, gTabs] of winGroups) {
        const groupInfo = groupMap.get(groupId);
        const color = groupInfo?.color || "grey";
        const title = groupInfo?.title || "Untitled Group";
        const groupSelected = gTabs.every((t) => t.id && simulatedSelection.has(t.id));
        html += `<div class="selectable-item ${groupSelected ? "selected" : ""}" data-type="group" data-id="${groupId}" style="margin-left: 10px; margin-top: 5px; border-left: 3px solid ${color}; padding-left: 5px; padding: 5px; border-radius: 3px;">`;
        html += `<div style="font-weight: bold; font-size: 0.9em;">${escapeHtml(title)} (${gTabs.length})</div>`;
        gTabs.forEach((t) => {
          const isSelected = t.id && simulatedSelection.has(t.id);
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
var currentLogs = [];
async function loadLogs() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "getLogs" });
    if (response && response.ok && response.data) {
      currentLogs = response.data;
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
  const filtered = currentLogs.filter((entry) => {
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3NoYXJlZC9sb2dnZXIudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZXh0cmFjdGlvbi9sb2dpYy50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9leHRyYWN0aW9uL2dlbmVyYVJlZ2lzdHJ5LnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3N0b3JhZ2UudHMiLCAiLi4vLi4vc3JjL3NoYXJlZC91dGlscy50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9wcmVmZXJlbmNlcy50cyIsICIuLi8uLi9zcmMvYmFja2dyb3VuZC9leHRyYWN0aW9uL2luZGV4LnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL2NvbnRleHRBbmFseXNpcy50cyIsICIuLi8uLi9zcmMvc2hhcmVkL3N0cmF0ZWd5UmVnaXN0cnkudHMiLCAiLi4vLi4vc3JjL2JhY2tncm91bmQvZ3JvdXBpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3NvcnRpbmdTdHJhdGVnaWVzLnRzIiwgIi4uLy4uL3NyYy91aS9jb21tb24udHMiLCAiLi4vLi4vc3JjL3VpL2RldnRvb2xzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyBMb2dFbnRyeSwgTG9nTGV2ZWwsIFByZWZlcmVuY2VzIH0gZnJvbSBcIi4vdHlwZXMuanNcIjtcblxuY29uc3QgUFJFRklYID0gXCJbVGFiU29ydGVyXVwiO1xuXG5jb25zdCBMRVZFTF9QUklPUklUWTogUmVjb3JkPExvZ0xldmVsLCBudW1iZXI+ID0ge1xuICBkZWJ1ZzogMCxcbiAgaW5mbzogMSxcbiAgd2FybjogMixcbiAgZXJyb3I6IDMsXG4gIGNyaXRpY2FsOiA0XG59O1xuXG5sZXQgY3VycmVudExldmVsOiBMb2dMZXZlbCA9IFwiaW5mb1wiO1xubGV0IGxvZ3M6IExvZ0VudHJ5W10gPSBbXTtcbmNvbnN0IE1BWF9MT0dTID0gMTAwMDtcbmNvbnN0IFNUT1JBR0VfS0VZID0gXCJzZXNzaW9uTG9nc1wiO1xuXG4vLyBTYWZlIGNvbnRleHQgY2hlY2tcbmNvbnN0IGlzU2VydmljZVdvcmtlciA9IHR5cGVvZiBzZWxmICE9PSAndW5kZWZpbmVkJyAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZW9mIChzZWxmIGFzIGFueSkuU2VydmljZVdvcmtlckdsb2JhbFNjb3BlICE9PSAndW5kZWZpbmVkJyAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZiBpbnN0YW5jZW9mIChzZWxmIGFzIGFueSkuU2VydmljZVdvcmtlckdsb2JhbFNjb3BlO1xubGV0IGlzU2F2aW5nID0gZmFsc2U7XG5sZXQgcGVuZGluZ1NhdmUgPSBmYWxzZTtcbmxldCBzYXZlVGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgbnVsbCA9IG51bGw7XG5cbmNvbnN0IGRvU2F2ZSA9ICgpID0+IHtcbiAgICBpZiAoIWlzU2VydmljZVdvcmtlciB8fCAhY2hyb21lPy5zdG9yYWdlPy5zZXNzaW9uIHx8IGlzU2F2aW5nKSB7XG4gICAgICAgIHBlbmRpbmdTYXZlID0gdHJ1ZTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlzU2F2aW5nID0gdHJ1ZTtcbiAgICBwZW5kaW5nU2F2ZSA9IGZhbHNlO1xuXG4gICAgY2hyb21lLnN0b3JhZ2Uuc2Vzc2lvbi5zZXQoeyBbU1RPUkFHRV9LRVldOiBsb2dzIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICBpc1NhdmluZyA9IGZhbHNlO1xuICAgICAgICBpZiAocGVuZGluZ1NhdmUpIHtcbiAgICAgICAgICAgIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG4gICAgICAgIH1cbiAgICB9KS5jYXRjaChlcnIgPT4ge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIHNhdmUgbG9nc1wiLCBlcnIpO1xuICAgICAgICBpc1NhdmluZyA9IGZhbHNlO1xuICAgIH0pO1xufTtcblxuY29uc3Qgc2F2ZUxvZ3NUb1N0b3JhZ2UgPSAoKSA9PiB7XG4gICAgaWYgKHNhdmVUaW1lcikgY2xlYXJUaW1lb3V0KHNhdmVUaW1lcik7XG4gICAgc2F2ZVRpbWVyID0gc2V0VGltZW91dChkb1NhdmUsIDEwMDApO1xufTtcblxubGV0IHJlc29sdmVMb2dnZXJSZWFkeTogKCkgPT4gdm9pZDtcbmV4cG9ydCBjb25zdCBsb2dnZXJSZWFkeSA9IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuICAgIHJlc29sdmVMb2dnZXJSZWFkeSA9IHJlc29sdmU7XG59KTtcblxuZXhwb3J0IGNvbnN0IGluaXRMb2dnZXIgPSBhc3luYyAoKSA9PiB7XG4gICAgaWYgKGlzU2VydmljZVdvcmtlciAmJiBjaHJvbWU/LnN0b3JhZ2U/LnNlc3Npb24pIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNocm9tZS5zdG9yYWdlLnNlc3Npb24uZ2V0KFNUT1JBR0VfS0VZKTtcbiAgICAgICAgICAgIGlmIChyZXN1bHRbU1RPUkFHRV9LRVldICYmIEFycmF5LmlzQXJyYXkocmVzdWx0W1NUT1JBR0VfS0VZXSkpIHtcbiAgICAgICAgICAgICAgICBsb2dzID0gcmVzdWx0W1NUT1JBR0VfS0VZXTtcbiAgICAgICAgICAgICAgICBpZiAobG9ncy5sZW5ndGggPiBNQVhfTE9HUykgbG9ncyA9IGxvZ3Muc2xpY2UoMCwgTUFYX0xPR1MpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIHJlc3RvcmUgbG9nc1wiLCBlKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAocmVzb2x2ZUxvZ2dlclJlYWR5KSByZXNvbHZlTG9nZ2VyUmVhZHkoKTtcbn07XG5cbmV4cG9ydCBjb25zdCBzZXRMb2dnZXJQcmVmZXJlbmNlcyA9IChwcmVmczogUHJlZmVyZW5jZXMpID0+IHtcbiAgaWYgKHByZWZzLmxvZ0xldmVsKSB7XG4gICAgY3VycmVudExldmVsID0gcHJlZnMubG9nTGV2ZWw7XG4gIH0gZWxzZSBpZiAocHJlZnMuZGVidWcpIHtcbiAgICBjdXJyZW50TGV2ZWwgPSBcImRlYnVnXCI7XG4gIH0gZWxzZSB7XG4gICAgY3VycmVudExldmVsID0gXCJpbmZvXCI7XG4gIH1cbn07XG5cbmNvbnN0IHNob3VsZExvZyA9IChsZXZlbDogTG9nTGV2ZWwpOiBib29sZWFuID0+IHtcbiAgcmV0dXJuIExFVkVMX1BSSU9SSVRZW2xldmVsXSA+PSBMRVZFTF9QUklPUklUWVtjdXJyZW50TGV2ZWxdO1xufTtcblxuY29uc3QgZm9ybWF0TWVzc2FnZSA9IChtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICByZXR1cm4gY29udGV4dCA/IGAke21lc3NhZ2V9IDo6ICR7SlNPTi5zdHJpbmdpZnkoY29udGV4dCl9YCA6IG1lc3NhZ2U7XG59O1xuXG5jb25zdCBhZGRMb2cgPSAobGV2ZWw6IExvZ0xldmVsLCBtZXNzYWdlOiBzdHJpbmcsIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICBpZiAoc2hvdWxkTG9nKGxldmVsKSkge1xuICAgICAgY29uc3QgZW50cnk6IExvZ0VudHJ5ID0ge1xuICAgICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcbiAgICAgICAgICBsZXZlbCxcbiAgICAgICAgICBtZXNzYWdlLFxuICAgICAgICAgIGNvbnRleHRcbiAgICAgIH07XG5cbiAgICAgIGlmIChpc1NlcnZpY2VXb3JrZXIpIHtcbiAgICAgICAgICBsb2dzLnVuc2hpZnQoZW50cnkpO1xuICAgICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSB7XG4gICAgICAgICAgICAgIGxvZ3MucG9wKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIEluIG90aGVyIGNvbnRleHRzLCBzZW5kIHRvIFNXXG4gICAgICAgICAgaWYgKGNocm9tZT8ucnVudGltZT8uc2VuZE1lc3NhZ2UpIHtcbiAgICAgICAgICAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdsb2dFbnRyeScsIHBheWxvYWQ6IGVudHJ5IH0pLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgLy8gSWdub3JlIGlmIG1lc3NhZ2UgZmFpbHMgKGUuZy4gY29udGV4dCBpbnZhbGlkYXRlZClcbiAgICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICB9XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBhZGRMb2dFbnRyeSA9IChlbnRyeTogTG9nRW50cnkpID0+IHtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSB7XG4gICAgICAgIGxvZ3MudW5zaGlmdChlbnRyeSk7XG4gICAgICAgIGlmIChsb2dzLmxlbmd0aCA+IE1BWF9MT0dTKSB7XG4gICAgICAgICAgICBsb2dzLnBvcCgpO1xuICAgICAgICB9XG4gICAgICAgIHNhdmVMb2dzVG9TdG9yYWdlKCk7XG4gICAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGdldExvZ3MgPSAoKSA9PiBbLi4ubG9nc107XG5leHBvcnQgY29uc3QgY2xlYXJMb2dzID0gKCkgPT4ge1xuICAgIGxvZ3MubGVuZ3RoID0gMDtcbiAgICBpZiAoaXNTZXJ2aWNlV29ya2VyKSBzYXZlTG9nc1RvU3RvcmFnZSgpO1xufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0RlYnVnID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImRlYnVnXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwiZGVidWdcIikpIHtcbiAgICBjb25zb2xlLmRlYnVnKGAke1BSRUZJWH0gW0RFQlVHXSAke2Zvcm1hdE1lc3NhZ2UobWVzc2FnZSwgY29udGV4dCl9YCk7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBsb2dJbmZvID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImluZm9cIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJpbmZvXCIpKSB7XG4gICAgY29uc29sZS5pbmZvKGAke1BSRUZJWH0gW0lORk9dICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ1dhcm4gPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwid2FyblwiLCBtZXNzYWdlLCBjb250ZXh0KTtcbiAgaWYgKHNob3VsZExvZyhcIndhcm5cIikpIHtcbiAgICBjb25zb2xlLndhcm4oYCR7UFJFRklYfSBbV0FSTl0gJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgbG9nRXJyb3IgPSAobWVzc2FnZTogc3RyaW5nLCBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgYWRkTG9nKFwiZXJyb3JcIiwgbWVzc2FnZSwgY29udGV4dCk7XG4gIGlmIChzaG91bGRMb2coXCJlcnJvclwiKSkge1xuICAgIGNvbnNvbGUuZXJyb3IoYCR7UFJFRklYfSBbRVJST1JdICR7Zm9ybWF0TWVzc2FnZShtZXNzYWdlLCBjb250ZXh0KX1gKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGxvZ0NyaXRpY2FsID0gKG1lc3NhZ2U6IHN0cmluZywgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gIGFkZExvZyhcImNyaXRpY2FsXCIsIG1lc3NhZ2UsIGNvbnRleHQpO1xuICBpZiAoc2hvdWxkTG9nKFwiY3JpdGljYWxcIikpIHtcbiAgICAvLyBDcml0aWNhbCBsb2dzIHVzZSBlcnJvciBjb25zb2xlIGJ1dCB3aXRoIGRpc3RpbmN0IHByZWZpeCBhbmQgbWF5YmUgc3R5bGluZyBpZiBzdXBwb3J0ZWRcbiAgICBjb25zb2xlLmVycm9yKGAke1BSRUZJWH0gW0NSSVRJQ0FMXSBcdUQ4M0RcdURFQTggJHtmb3JtYXRNZXNzYWdlKG1lc3NhZ2UsIGNvbnRleHQpfWApO1xuICB9XG59O1xuIiwgIi8vIGxvZ2ljLnRzXG4vLyBQdXJlIGZ1bmN0aW9ucyBmb3IgZXh0cmFjdGlvbiBsb2dpY1xuXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplVXJsKHVybFN0cjogc3RyaW5nKTogc3RyaW5nIHtcbiAgdHJ5IHtcbiAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHVybFN0cik7XG4gICAgY29uc3QgcGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcyh1cmwuc2VhcmNoKTtcbiAgICBjb25zdCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuICAgIHBhcmFtcy5mb3JFYWNoKChfLCBrZXkpID0+IGtleXMucHVzaChrZXkpKTtcbiAgICBjb25zdCBob3N0bmFtZSA9IHVybC5ob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgJycpO1xuXG4gICAgY29uc3QgVFJBQ0tJTkcgPSBbL151dG1fLywgL15mYmNsaWQkLywgL15nY2xpZCQvLCAvXl9nYSQvLCAvXnJlZiQvLCAvXnljbGlkJC8sIC9eX2hzL107XG4gICAgY29uc3QgaXNZb3V0dWJlID0gaG9zdG5hbWUuZW5kc1dpdGgoJ3lvdXR1YmUuY29tJykgfHwgaG9zdG5hbWUuZW5kc1dpdGgoJ3lvdXR1LmJlJyk7XG4gICAgY29uc3QgaXNHb29nbGUgPSBob3N0bmFtZS5lbmRzV2l0aCgnZ29vZ2xlLmNvbScpO1xuXG4gICAgY29uc3Qga2VlcDogc3RyaW5nW10gPSBbXTtcbiAgICBpZiAoaXNZb3V0dWJlKSBrZWVwLnB1c2goJ3YnLCAnbGlzdCcsICd0JywgJ2MnLCAnY2hhbm5lbCcsICdwbGF5bGlzdCcpO1xuICAgIGlmIChpc0dvb2dsZSkga2VlcC5wdXNoKCdxJywgJ2lkJywgJ3NvdXJjZWlkJyk7XG5cbiAgICBmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG4gICAgICBpZiAoVFJBQ0tJTkcuc29tZShyID0+IHIudGVzdChrZXkpKSkge1xuICAgICAgICAgcGFyYW1zLmRlbGV0ZShrZXkpO1xuICAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAoKGlzWW91dHViZSB8fCBpc0dvb2dsZSkgJiYgIWtlZXAuaW5jbHVkZXMoa2V5KSkge1xuICAgICAgICAgcGFyYW1zLmRlbGV0ZShrZXkpO1xuICAgICAgfVxuICAgIH1cbiAgICB1cmwuc2VhcmNoID0gcGFyYW1zLnRvU3RyaW5nKCk7XG4gICAgcmV0dXJuIHVybC50b1N0cmluZygpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgcmV0dXJuIHVybFN0cjtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VZb3VUdWJlVXJsKHVybFN0cjogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgdXJsID0gbmV3IFVSTCh1cmxTdHIpO1xuICAgICAgICBjb25zdCB2ID0gdXJsLnNlYXJjaFBhcmFtcy5nZXQoJ3YnKTtcbiAgICAgICAgY29uc3QgaXNTaG9ydHMgPSB1cmwucGF0aG5hbWUuaW5jbHVkZXMoJy9zaG9ydHMvJyk7XG4gICAgICAgIGxldCB2aWRlb0lkID1cbiAgICAgICAgICB2IHx8XG4gICAgICAgICAgKGlzU2hvcnRzID8gdXJsLnBhdGhuYW1lLnNwbGl0KCcvc2hvcnRzLycpWzFdIDogbnVsbCkgfHxcbiAgICAgICAgICAodXJsLmhvc3RuYW1lID09PSAneW91dHUuYmUnID8gdXJsLnBhdGhuYW1lLnJlcGxhY2UoJy8nLCAnJykgOiBudWxsKTtcblxuICAgICAgICBjb25zdCBwbGF5bGlzdElkID0gdXJsLnNlYXJjaFBhcmFtcy5nZXQoJ2xpc3QnKTtcbiAgICAgICAgY29uc3QgcGxheWxpc3RJbmRleCA9IHBhcnNlSW50KHVybC5zZWFyY2hQYXJhbXMuZ2V0KCdpbmRleCcpIHx8ICcwJywgMTApO1xuXG4gICAgICAgIHJldHVybiB7IHZpZGVvSWQsIGlzU2hvcnRzLCBwbGF5bGlzdElkLCBwbGF5bGlzdEluZGV4IH07XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICByZXR1cm4geyB2aWRlb0lkOiBudWxsLCBpc1Nob3J0czogZmFsc2UsIHBsYXlsaXN0SWQ6IG51bGwsIHBsYXlsaXN0SW5kZXg6IG51bGwgfTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGV4dHJhY3RBdXRob3IoZW50aXR5OiBhbnkpOiBzdHJpbmcgfCBudWxsIHtcbiAgICBpZiAoIWVudGl0eSB8fCAhZW50aXR5LmF1dGhvcikgcmV0dXJuIG51bGw7XG4gICAgaWYgKHR5cGVvZiBlbnRpdHkuYXV0aG9yID09PSAnc3RyaW5nJykgcmV0dXJuIGVudGl0eS5hdXRob3I7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZW50aXR5LmF1dGhvcikpIHJldHVybiBlbnRpdHkuYXV0aG9yWzBdPy5uYW1lIHx8IG51bGw7XG4gICAgaWYgKHR5cGVvZiBlbnRpdHkuYXV0aG9yID09PSAnb2JqZWN0JykgcmV0dXJuIGVudGl0eS5hdXRob3IubmFtZSB8fCBudWxsO1xuICAgIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBleHRyYWN0S2V5d29yZHMoZW50aXR5OiBhbnkpOiBzdHJpbmdbXSB7XG4gICAgaWYgKCFlbnRpdHkgfHwgIWVudGl0eS5rZXl3b3JkcykgcmV0dXJuIFtdO1xuICAgIGlmICh0eXBlb2YgZW50aXR5LmtleXdvcmRzID09PSAnc3RyaW5nJykge1xuICAgICAgICByZXR1cm4gZW50aXR5LmtleXdvcmRzLnNwbGl0KCcsJykubWFwKChzOiBzdHJpbmcpID0+IHMudHJpbSgpKTtcbiAgICB9XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZW50aXR5LmtleXdvcmRzKSkgcmV0dXJuIGVudGl0eS5rZXl3b3JkcztcbiAgICByZXR1cm4gW107XG59XG5cbmZ1bmN0aW9uIGV4dHJhY3RCcmVhZGNydW1icyhqc29uTGQ6IGFueVtdKTogc3RyaW5nW10ge1xuICAgIGNvbnN0IGJyZWFkY3J1bWJMZCA9IGpzb25MZC5maW5kKGkgPT4gaSAmJiBpWydAdHlwZSddID09PSAnQnJlYWRjcnVtYkxpc3QnKTtcbiAgICBpZiAoIWJyZWFkY3J1bWJMZCB8fCAhQXJyYXkuaXNBcnJheShicmVhZGNydW1iTGQuaXRlbUxpc3RFbGVtZW50KSkgcmV0dXJuIFtdO1xuXG4gICAgY29uc3QgbGlzdCA9IGJyZWFkY3J1bWJMZC5pdGVtTGlzdEVsZW1lbnQuc29ydCgoYTogYW55LCBiOiBhbnkpID0+IChhLnBvc2l0aW9uIHx8IDApIC0gKGIucG9zaXRpb24gfHwgMCkpO1xuICAgIGNvbnN0IGJyZWFkY3J1bWJzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGxpc3QuZm9yRWFjaCgoaXRlbTogYW55KSA9PiB7XG4gICAgICAgIGlmIChpdGVtLm5hbWUpIGJyZWFkY3J1bWJzLnB1c2goaXRlbS5uYW1lKTtcbiAgICAgICAgZWxzZSBpZiAoaXRlbS5pdGVtICYmIGl0ZW0uaXRlbS5uYW1lKSBicmVhZGNydW1icy5wdXNoKGl0ZW0uaXRlbS5uYW1lKTtcbiAgICB9KTtcbiAgICByZXR1cm4gYnJlYWRjcnVtYnM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0SnNvbkxkRmllbGRzKGpzb25MZDogYW55W10pIHtcbiAgICAvLyBGaW5kIG1haW4gZW50aXR5XG4gICAgLy8gQWRkZWQgc2FmZXR5IGNoZWNrOiBpICYmIGlbJ0B0eXBlJ11cbiAgICBjb25zdCBtYWluRW50aXR5ID0ganNvbkxkLmZpbmQoaSA9PiBpICYmIChpWydAdHlwZSddID09PSAnQXJ0aWNsZScgfHwgaVsnQHR5cGUnXSA9PT0gJ1ZpZGVvT2JqZWN0JyB8fCBpWydAdHlwZSddID09PSAnTmV3c0FydGljbGUnKSkgfHwganNvbkxkWzBdO1xuXG4gICAgbGV0IGF1dGhvcjogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgbGV0IHB1Ymxpc2hlZEF0OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICBsZXQgbW9kaWZpZWRBdDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgbGV0IHRhZ3M6IHN0cmluZ1tdID0gW107XG5cbiAgICBpZiAobWFpbkVudGl0eSkge1xuICAgICAgICBhdXRob3IgPSBleHRyYWN0QXV0aG9yKG1haW5FbnRpdHkpO1xuICAgICAgICBwdWJsaXNoZWRBdCA9IG1haW5FbnRpdHkuZGF0ZVB1Ymxpc2hlZCB8fCBudWxsO1xuICAgICAgICBtb2RpZmllZEF0ID0gbWFpbkVudGl0eS5kYXRlTW9kaWZpZWQgfHwgbnVsbDtcbiAgICAgICAgdGFncyA9IGV4dHJhY3RLZXl3b3JkcyhtYWluRW50aXR5KTtcbiAgICB9XG5cbiAgICBjb25zdCBicmVhZGNydW1icyA9IGV4dHJhY3RCcmVhZGNydW1icyhqc29uTGQpO1xuXG4gICAgcmV0dXJuIHsgYXV0aG9yLCBwdWJsaXNoZWRBdCwgbW9kaWZpZWRBdCwgdGFncywgYnJlYWRjcnVtYnMgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RZb3VUdWJlQ2hhbm5lbEZyb21IdG1sKGh0bWw6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuICAvLyAxLiBUcnkgSlNPTi1MRFxuICAvLyBMb29rIGZvciA8c2NyaXB0IHR5cGU9XCJhcHBsaWNhdGlvbi9sZCtqc29uXCI+Li4uPC9zY3JpcHQ+XG4gIC8vIFdlIG5lZWQgdG8gbG9vcCBiZWNhdXNlIHRoZXJlIG1pZ2h0IGJlIG11bHRpcGxlIHNjcmlwdHNcbiAgY29uc3Qgc2NyaXB0UmVnZXggPSAvPHNjcmlwdFxccyt0eXBlPVtcIiddYXBwbGljYXRpb25cXC9sZFxcK2pzb25bXCInXVtePl0qPihbXFxzXFxTXSo/KTxcXC9zY3JpcHQ+L2dpO1xuICBsZXQgbWF0Y2g7XG4gIHdoaWxlICgobWF0Y2ggPSBzY3JpcHRSZWdleC5leGVjKGh0bWwpKSAhPT0gbnVsbCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBqc29uID0gSlNPTi5wYXJzZShtYXRjaFsxXSk7XG4gICAgICAgICAgY29uc3QgYXJyYXkgPSBBcnJheS5pc0FycmF5KGpzb24pID8ganNvbiA6IFtqc29uXTtcbiAgICAgICAgICBjb25zdCBmaWVsZHMgPSBleHRyYWN0SnNvbkxkRmllbGRzKGFycmF5KTtcbiAgICAgICAgICBpZiAoZmllbGRzLmF1dGhvcikgcmV0dXJuIGZpZWxkcy5hdXRob3I7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgLy8gaWdub3JlIHBhcnNlIGVycm9yc1xuICAgICAgfVxuICB9XG5cbiAgLy8gMi4gVHJ5IDxsaW5rIGl0ZW1wcm9wPVwibmFtZVwiIGNvbnRlbnQ9XCIuLi5cIj4gKFlvdVR1YmUgb2Z0ZW4gcHV0cyBjaGFubmVsIG5hbWUgaGVyZSBpbiBzb21lIGNvbnRleHRzKVxuICAvLyBPciA8bWV0YSBpdGVtcHJvcD1cImNoYW5uZWxJZFwiIGNvbnRlbnQ9XCIuLi5cIj4gLT4gYnV0IHRoYXQncyBJRC5cbiAgLy8gPGxpbmsgaXRlbXByb3A9XCJuYW1lXCIgY29udGVudD1cIkNoYW5uZWwgTmFtZVwiPlxuICAvLyA8c3BhbiBpdGVtcHJvcD1cImF1dGhvclwiIGl0ZW1zY29wZSBpdGVtdHlwZT1cImh0dHA6Ly9zY2hlbWEub3JnL1BlcnNvblwiPjxsaW5rIGl0ZW1wcm9wPVwibmFtZVwiIGNvbnRlbnQ9XCJDaGFubmVsIE5hbWVcIj48L3NwYW4+XG4gIGNvbnN0IGxpbmtOYW1lUmVnZXggPSAvPGxpbmtcXHMraXRlbXByb3A9W1wiJ11uYW1lW1wiJ11cXHMrY29udGVudD1bXCInXShbXlwiJ10rKVtcIiddXFxzKlxcLz8+L2k7XG4gIGNvbnN0IGxpbmtNYXRjaCA9IGxpbmtOYW1lUmVnZXguZXhlYyhodG1sKTtcbiAgaWYgKGxpbmtNYXRjaCAmJiBsaW5rTWF0Y2hbMV0pIHJldHVybiBkZWNvZGVIdG1sRW50aXRpZXMobGlua01hdGNoWzFdKTtcblxuICAvLyAzLiBUcnkgbWV0YSBhdXRob3JcbiAgY29uc3QgbWV0YUF1dGhvclJlZ2V4ID0gLzxtZXRhXFxzK25hbWU9W1wiJ11hdXRob3JbXCInXVxccytjb250ZW50PVtcIiddKFteXCInXSspW1wiJ11cXHMqXFwvPz4vaTtcbiAgY29uc3QgbWV0YU1hdGNoID0gbWV0YUF1dGhvclJlZ2V4LmV4ZWMoaHRtbCk7XG4gIGlmIChtZXRhTWF0Y2ggJiYgbWV0YU1hdGNoWzFdKSB7XG4gICAgICAvLyBZb3VUdWJlIG1ldGEgYXV0aG9yIGlzIG9mdGVuIFwiQ2hhbm5lbCBOYW1lXCJcbiAgICAgIHJldHVybiBkZWNvZGVIdG1sRW50aXRpZXMobWV0YU1hdGNoWzFdKTtcbiAgfVxuXG4gIHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXh0cmFjdFlvdVR1YmVHZW5yZUZyb21IdG1sKGh0bWw6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuICAvLyAxLiBUcnkgPG1ldGEgaXRlbXByb3A9XCJnZW5yZVwiIGNvbnRlbnQ9XCIuLi5cIj5cbiAgY29uc3QgbWV0YUdlbnJlUmVnZXggPSAvPG1ldGFcXHMraXRlbXByb3A9W1wiJ11nZW5yZVtcIiddXFxzK2NvbnRlbnQ9W1wiJ10oW15cIiddKylbXCInXVxccypcXC8/Pi9pO1xuICBjb25zdCBtZXRhTWF0Y2ggPSBtZXRhR2VucmVSZWdleC5leGVjKGh0bWwpO1xuICBpZiAobWV0YU1hdGNoICYmIG1ldGFNYXRjaFsxXSkge1xuICAgICAgcmV0dXJuIGRlY29kZUh0bWxFbnRpdGllcyhtZXRhTWF0Y2hbMV0pO1xuICB9XG5cbiAgLy8gMi4gVHJ5IEpTT04gXCJjYXRlZ29yeVwiIGluIHNjcmlwdHNcbiAgLy8gXCJjYXRlZ29yeVwiOlwiR2FtaW5nXCJcbiAgY29uc3QgY2F0ZWdvcnlSZWdleCA9IC9cImNhdGVnb3J5XCJcXHMqOlxccypcIihbXlwiXSspXCIvO1xuICBjb25zdCBjYXRNYXRjaCA9IGNhdGVnb3J5UmVnZXguZXhlYyhodG1sKTtcbiAgaWYgKGNhdE1hdGNoICYmIGNhdE1hdGNoWzFdKSB7XG4gICAgICByZXR1cm4gZGVjb2RlSHRtbEVudGl0aWVzKGNhdE1hdGNoWzFdKTtcbiAgfVxuXG4gIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBkZWNvZGVIdG1sRW50aXRpZXModGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgaWYgKCF0ZXh0KSByZXR1cm4gdGV4dDtcblxuICBjb25zdCBlbnRpdGllczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICAnJmFtcDsnOiAnJicsXG4gICAgJyZsdDsnOiAnPCcsXG4gICAgJyZndDsnOiAnPicsXG4gICAgJyZxdW90Oyc6ICdcIicsXG4gICAgJyYjMzk7JzogXCInXCIsXG4gICAgJyZhcG9zOyc6IFwiJ1wiLFxuICAgICcmbmJzcDsnOiAnICdcbiAgfTtcblxuICByZXR1cm4gdGV4dC5yZXBsYWNlKC8mKFthLXowLTldK3wjWzAtOV17MSw2fXwjeFswLTlhLWZBLUZdezEsNn0pOy9pZywgKG1hdGNoKSA9PiB7XG4gICAgICBjb25zdCBsb3dlciA9IG1hdGNoLnRvTG93ZXJDYXNlKCk7XG4gICAgICBpZiAoZW50aXRpZXNbbG93ZXJdKSByZXR1cm4gZW50aXRpZXNbbG93ZXJdO1xuICAgICAgaWYgKGVudGl0aWVzW21hdGNoXSkgcmV0dXJuIGVudGl0aWVzW21hdGNoXTtcblxuICAgICAgaWYgKGxvd2VyLnN0YXJ0c1dpdGgoJyYjeCcpKSB7XG4gICAgICAgICAgdHJ5IHsgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUocGFyc2VJbnQobG93ZXIuc2xpY2UoMywgLTEpLCAxNikpOyB9IGNhdGNoIHsgcmV0dXJuIG1hdGNoOyB9XG4gICAgICB9XG4gICAgICBpZiAobG93ZXIuc3RhcnRzV2l0aCgnJiMnKSkge1xuICAgICAgICAgIHRyeSB7IHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlKHBhcnNlSW50KGxvd2VyLnNsaWNlKDIsIC0xKSwgMTApKTsgfSBjYXRjaCB7IHJldHVybiBtYXRjaDsgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIG1hdGNoO1xuICB9KTtcbn1cbiIsICJcbmV4cG9ydCBjb25zdCBHRU5FUkFfUkVHSVNUUlk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gIC8vIFNlYXJjaFxuICAnZ29vZ2xlLmNvbSc6ICdTZWFyY2gnLFxuICAnYmluZy5jb20nOiAnU2VhcmNoJyxcbiAgJ2R1Y2tkdWNrZ28uY29tJzogJ1NlYXJjaCcsXG4gICd5YWhvby5jb20nOiAnU2VhcmNoJyxcbiAgJ2JhaWR1LmNvbSc6ICdTZWFyY2gnLFxuICAneWFuZGV4LmNvbSc6ICdTZWFyY2gnLFxuICAna2FnaS5jb20nOiAnU2VhcmNoJyxcbiAgJ2Vjb3NpYS5vcmcnOiAnU2VhcmNoJyxcblxuICAvLyBTb2NpYWxcbiAgJ2ZhY2Vib29rLmNvbSc6ICdTb2NpYWwnLFxuICAndHdpdHRlci5jb20nOiAnU29jaWFsJyxcbiAgJ3guY29tJzogJ1NvY2lhbCcsXG4gICdpbnN0YWdyYW0uY29tJzogJ1NvY2lhbCcsXG4gICdsaW5rZWRpbi5jb20nOiAnU29jaWFsJyxcbiAgJ3JlZGRpdC5jb20nOiAnU29jaWFsJyxcbiAgJ3Rpa3Rvay5jb20nOiAnU29jaWFsJyxcbiAgJ3BpbnRlcmVzdC5jb20nOiAnU29jaWFsJyxcbiAgJ3NuYXBjaGF0LmNvbSc6ICdTb2NpYWwnLFxuICAndHVtYmxyLmNvbSc6ICdTb2NpYWwnLFxuICAndGhyZWFkcy5uZXQnOiAnU29jaWFsJyxcbiAgJ2JsdWVza3kuYXBwJzogJ1NvY2lhbCcsXG4gICdtYXN0b2Rvbi5zb2NpYWwnOiAnU29jaWFsJyxcblxuICAvLyBWaWRlb1xuICAneW91dHViZS5jb20nOiAnVmlkZW8nLFxuICAneW91dHUuYmUnOiAnVmlkZW8nLFxuICAndmltZW8uY29tJzogJ1ZpZGVvJyxcbiAgJ3R3aXRjaC50dic6ICdWaWRlbycsXG4gICduZXRmbGl4LmNvbSc6ICdWaWRlbycsXG4gICdodWx1LmNvbSc6ICdWaWRlbycsXG4gICdkaXNuZXlwbHVzLmNvbSc6ICdWaWRlbycsXG4gICdkYWlseW1vdGlvbi5jb20nOiAnVmlkZW8nLFxuICAncHJpbWV2aWRlby5jb20nOiAnVmlkZW8nLFxuICAnaGJvbWF4LmNvbSc6ICdWaWRlbycsXG4gICdtYXguY29tJzogJ1ZpZGVvJyxcbiAgJ3BlYWNvY2t0di5jb20nOiAnVmlkZW8nLFxuXG4gIC8vIERldmVsb3BtZW50XG4gICdnaXRodWIuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2dpdGxhYi5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnc3RhY2tvdmVyZmxvdy5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnbnBtanMuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ3B5cGkub3JnJzogJ0RldmVsb3BtZW50JyxcbiAgJ2RldmVsb3Blci5tb3ppbGxhLm9yZyc6ICdEZXZlbG9wbWVudCcsXG4gICd3M3NjaG9vbHMuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2dlZWtzZm9yZ2Vla3Mub3JnJzogJ0RldmVsb3BtZW50JyxcbiAgJ2ppcmEuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2F0bGFzc2lhbi5uZXQnOiAnRGV2ZWxvcG1lbnQnLCAvLyBvZnRlbiBqaXJhXG4gICdiaXRidWNrZXQub3JnJzogJ0RldmVsb3BtZW50JyxcbiAgJ2Rldi50byc6ICdEZXZlbG9wbWVudCcsXG4gICdoYXNobm9kZS5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnbWVkaXVtLmNvbSc6ICdEZXZlbG9wbWVudCcsIC8vIEdlbmVyYWwgYnV0IG9mdGVuIGRldlxuICAndmVyY2VsLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICduZXRsaWZ5LmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdoZXJva3UuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2F3cy5hbWF6b24uY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ2NvbnNvbGUuYXdzLmFtYXpvbi5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnY2xvdWQuZ29vZ2xlLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdhenVyZS5taWNyb3NvZnQuY29tJzogJ0RldmVsb3BtZW50JyxcbiAgJ3BvcnRhbC5henVyZS5jb20nOiAnRGV2ZWxvcG1lbnQnLFxuICAnZG9ja2VyLmNvbSc6ICdEZXZlbG9wbWVudCcsXG4gICdrdWJlcm5ldGVzLmlvJzogJ0RldmVsb3BtZW50JyxcblxuICAvLyBOZXdzXG4gICdjbm4uY29tJzogJ05ld3MnLFxuICAnYmJjLmNvbSc6ICdOZXdzJyxcbiAgJ255dGltZXMuY29tJzogJ05ld3MnLFxuICAnd2FzaGluZ3RvbnBvc3QuY29tJzogJ05ld3MnLFxuICAndGhlZ3VhcmRpYW4uY29tJzogJ05ld3MnLFxuICAnZm9yYmVzLmNvbSc6ICdOZXdzJyxcbiAgJ2Jsb29tYmVyZy5jb20nOiAnTmV3cycsXG4gICdyZXV0ZXJzLmNvbSc6ICdOZXdzJyxcbiAgJ3dzai5jb20nOiAnTmV3cycsXG4gICdjbmJjLmNvbSc6ICdOZXdzJyxcbiAgJ2h1ZmZwb3N0LmNvbSc6ICdOZXdzJyxcbiAgJ25ld3MuZ29vZ2xlLmNvbSc6ICdOZXdzJyxcbiAgJ2ZveG5ld3MuY29tJzogJ05ld3MnLFxuICAnbmJjbmV3cy5jb20nOiAnTmV3cycsXG4gICdhYmNuZXdzLmdvLmNvbSc6ICdOZXdzJyxcbiAgJ3VzYXRvZGF5LmNvbSc6ICdOZXdzJyxcblxuICAvLyBTaG9wcGluZ1xuICAnYW1hem9uLmNvbSc6ICdTaG9wcGluZycsXG4gICdlYmF5LmNvbSc6ICdTaG9wcGluZycsXG4gICd3YWxtYXJ0LmNvbSc6ICdTaG9wcGluZycsXG4gICdldHN5LmNvbSc6ICdTaG9wcGluZycsXG4gICd0YXJnZXQuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ2Jlc3RidXkuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ2FsaWV4cHJlc3MuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ3Nob3BpZnkuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ3RlbXUuY29tJzogJ1Nob3BwaW5nJyxcbiAgJ3NoZWluLmNvbSc6ICdTaG9wcGluZycsXG4gICd3YXlmYWlyLmNvbSc6ICdTaG9wcGluZycsXG4gICdjb3N0Y28uY29tJzogJ1Nob3BwaW5nJyxcblxuICAvLyBDb21tdW5pY2F0aW9uXG4gICdtYWlsLmdvb2dsZS5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICdvdXRsb29rLmxpdmUuY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnc2xhY2suY29tJzogJ0NvbW11bmljYXRpb24nLFxuICAnZGlzY29yZC5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICd6b29tLnVzJzogJ0NvbW11bmljYXRpb24nLFxuICAndGVhbXMubWljcm9zb2Z0LmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ3doYXRzYXBwLmNvbSc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ3RlbGVncmFtLm9yZyc6ICdDb21tdW5pY2F0aW9uJyxcbiAgJ21lc3Nlbmdlci5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG4gICdza3lwZS5jb20nOiAnQ29tbXVuaWNhdGlvbicsXG5cbiAgLy8gRmluYW5jZVxuICAncGF5cGFsLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2NoYXNlLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2JhbmtvZmFtZXJpY2EuY29tJzogJ0ZpbmFuY2UnLFxuICAnd2VsbHNmYXJnby5jb20nOiAnRmluYW5jZScsXG4gICdhbWVyaWNhbmV4cHJlc3MuY29tJzogJ0ZpbmFuY2UnLFxuICAnc3RyaXBlLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2NvaW5iYXNlLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ2JpbmFuY2UuY29tJzogJ0ZpbmFuY2UnLFxuICAna3Jha2VuLmNvbSc6ICdGaW5hbmNlJyxcbiAgJ3JvYmluaG9vZC5jb20nOiAnRmluYW5jZScsXG4gICdmaWRlbGl0eS5jb20nOiAnRmluYW5jZScsXG4gICd2YW5ndWFyZC5jb20nOiAnRmluYW5jZScsXG4gICdzY2h3YWIuY29tJzogJ0ZpbmFuY2UnLFxuICAnbWludC5pbnR1aXQuY29tJzogJ0ZpbmFuY2UnLFxuXG4gIC8vIEVkdWNhdGlvblxuICAnd2lraXBlZGlhLm9yZyc6ICdFZHVjYXRpb24nLFxuICAnY291cnNlcmEub3JnJzogJ0VkdWNhdGlvbicsXG4gICd1ZGVteS5jb20nOiAnRWR1Y2F0aW9uJyxcbiAgJ2VkeC5vcmcnOiAnRWR1Y2F0aW9uJyxcbiAgJ2toYW5hY2FkZW15Lm9yZyc6ICdFZHVjYXRpb24nLFxuICAncXVpemxldC5jb20nOiAnRWR1Y2F0aW9uJyxcbiAgJ2R1b2xpbmdvLmNvbSc6ICdFZHVjYXRpb24nLFxuICAnY2FudmFzLmluc3RydWN0dXJlLmNvbSc6ICdFZHVjYXRpb24nLFxuICAnYmxhY2tib2FyZC5jb20nOiAnRWR1Y2F0aW9uJyxcbiAgJ21pdC5lZHUnOiAnRWR1Y2F0aW9uJyxcbiAgJ2hhcnZhcmQuZWR1JzogJ0VkdWNhdGlvbicsXG4gICdzdGFuZm9yZC5lZHUnOiAnRWR1Y2F0aW9uJyxcbiAgJ2FjYWRlbWlhLmVkdSc6ICdFZHVjYXRpb24nLFxuICAncmVzZWFyY2hnYXRlLm5ldCc6ICdFZHVjYXRpb24nLFxuXG4gIC8vIERlc2lnblxuICAnZmlnbWEuY29tJzogJ0Rlc2lnbicsXG4gICdjYW52YS5jb20nOiAnRGVzaWduJyxcbiAgJ2JlaGFuY2UubmV0JzogJ0Rlc2lnbicsXG4gICdkcmliYmJsZS5jb20nOiAnRGVzaWduJyxcbiAgJ2Fkb2JlLmNvbSc6ICdEZXNpZ24nLFxuICAndW5zcGxhc2guY29tJzogJ0Rlc2lnbicsXG4gICdwZXhlbHMuY29tJzogJ0Rlc2lnbicsXG4gICdwaXhhYmF5LmNvbSc6ICdEZXNpZ24nLFxuICAnc2h1dHRlcnN0b2NrLmNvbSc6ICdEZXNpZ24nLFxuXG4gIC8vIFByb2R1Y3Rpdml0eVxuICAnZG9jcy5nb29nbGUuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdzaGVldHMuZ29vZ2xlLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnc2xpZGVzLmdvb2dsZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2RyaXZlLmdvb2dsZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ25vdGlvbi5zbyc6ICdQcm9kdWN0aXZpdHknLFxuICAndHJlbGxvLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnYXNhbmEuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdtb25kYXkuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdhaXJ0YWJsZS5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2V2ZXJub3RlLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnZHJvcGJveC5jb20nOiAnUHJvZHVjdGl2aXR5JyxcbiAgJ2NsaWNrdXAuY29tJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdsaW5lYXIuYXBwJzogJ1Byb2R1Y3Rpdml0eScsXG4gICdtaXJvLmNvbSc6ICdQcm9kdWN0aXZpdHknLFxuICAnbHVjaWRjaGFydC5jb20nOiAnUHJvZHVjdGl2aXR5JyxcblxuICAvLyBBSVxuICAnb3BlbmFpLmNvbSc6ICdBSScsXG4gICdjaGF0Z3B0LmNvbSc6ICdBSScsXG4gICdhbnRocm9waWMuY29tJzogJ0FJJyxcbiAgJ21pZGpvdXJuZXkuY29tJzogJ0FJJyxcbiAgJ2h1Z2dpbmdmYWNlLmNvJzogJ0FJJyxcbiAgJ2JhcmQuZ29vZ2xlLmNvbSc6ICdBSScsXG4gICdnZW1pbmkuZ29vZ2xlLmNvbSc6ICdBSScsXG4gICdjbGF1ZGUuYWknOiAnQUknLFxuICAncGVycGxleGl0eS5haSc6ICdBSScsXG4gICdwb2UuY29tJzogJ0FJJyxcblxuICAvLyBNdXNpYy9BdWRpb1xuICAnc3BvdGlmeS5jb20nOiAnTXVzaWMnLFxuICAnc291bmRjbG91ZC5jb20nOiAnTXVzaWMnLFxuICAnbXVzaWMuYXBwbGUuY29tJzogJ011c2ljJyxcbiAgJ3BhbmRvcmEuY29tJzogJ011c2ljJyxcbiAgJ3RpZGFsLmNvbSc6ICdNdXNpYycsXG4gICdiYW5kY2FtcC5jb20nOiAnTXVzaWMnLFxuICAnYXVkaWJsZS5jb20nOiAnTXVzaWMnLFxuXG4gIC8vIEdhbWluZ1xuICAnc3RlYW1wb3dlcmVkLmNvbSc6ICdHYW1pbmcnLFxuICAncm9ibG94LmNvbSc6ICdHYW1pbmcnLFxuICAnZXBpY2dhbWVzLmNvbSc6ICdHYW1pbmcnLFxuICAneGJveC5jb20nOiAnR2FtaW5nJyxcbiAgJ3BsYXlzdGF0aW9uLmNvbSc6ICdHYW1pbmcnLFxuICAnbmludGVuZG8uY29tJzogJ0dhbWluZycsXG4gICdpZ24uY29tJzogJ0dhbWluZycsXG4gICdnYW1lc3BvdC5jb20nOiAnR2FtaW5nJyxcbiAgJ2tvdGFrdS5jb20nOiAnR2FtaW5nJyxcbiAgJ3BvbHlnb24uY29tJzogJ0dhbWluZydcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRHZW5lcmEoaG9zdG5hbWU6IHN0cmluZywgY3VzdG9tUmVnaXN0cnk/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogc3RyaW5nIHwgbnVsbCB7XG4gIGlmICghaG9zdG5hbWUpIHJldHVybiBudWxsO1xuXG4gIC8vIDAuIENoZWNrIGN1c3RvbSByZWdpc3RyeSBmaXJzdFxuICBpZiAoY3VzdG9tUmVnaXN0cnkpIHtcbiAgICAgIGNvbnN0IHBhcnRzID0gaG9zdG5hbWUuc3BsaXQoJy4nKTtcbiAgICAgIC8vIENoZWNrIGZ1bGwgaG9zdG5hbWUgYW5kIHByb2dyZXNzaXZlbHkgc2hvcnRlciBzdWZmaXhlc1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwYXJ0cy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgICAgICBjb25zdCBkb21haW4gPSBwYXJ0cy5zbGljZShpKS5qb2luKCcuJyk7XG4gICAgICAgICAgaWYgKGN1c3RvbVJlZ2lzdHJ5W2RvbWFpbl0pIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGN1c3RvbVJlZ2lzdHJ5W2RvbWFpbl07XG4gICAgICAgICAgfVxuICAgICAgfVxuICB9XG5cbiAgLy8gMS4gRXhhY3QgbWF0Y2hcbiAgaWYgKEdFTkVSQV9SRUdJU1RSWVtob3N0bmFtZV0pIHtcbiAgICByZXR1cm4gR0VORVJBX1JFR0lTVFJZW2hvc3RuYW1lXTtcbiAgfVxuXG4gIC8vIDIuIFN1YmRvbWFpbiBjaGVjayAoc3RyaXBwaW5nIHN1YmRvbWFpbnMpXG4gIC8vIGUuZy4gXCJjb25zb2xlLmF3cy5hbWF6b24uY29tXCIgLT4gXCJhd3MuYW1hem9uLmNvbVwiIC0+IFwiYW1hem9uLmNvbVwiXG4gIGNvbnN0IHBhcnRzID0gaG9zdG5hbWUuc3BsaXQoJy4nKTtcblxuICAvLyBUcnkgbWF0Y2hpbmcgcHJvZ3Jlc3NpdmVseSBzaG9ydGVyIHN1ZmZpeGVzXG4gIC8vIGUuZy4gYS5iLmMuY29tIC0+IGIuYy5jb20gLT4gYy5jb21cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBwYXJ0cy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgIGNvbnN0IGRvbWFpbiA9IHBhcnRzLnNsaWNlKGkpLmpvaW4oJy4nKTtcbiAgICAgIGlmIChHRU5FUkFfUkVHSVNUUllbZG9tYWluXSkge1xuICAgICAgICAgIHJldHVybiBHRU5FUkFfUkVHSVNUUllbZG9tYWluXTtcbiAgICAgIH1cbiAgfVxuXG4gIHJldHVybiBudWxsO1xufVxuIiwgImV4cG9ydCBjb25zdCBnZXRTdG9yZWRWYWx1ZSA9IGFzeW5jIDxUPihrZXk6IHN0cmluZyk6IFByb21pc2U8VCB8IG51bGw+ID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KGtleSwgKGl0ZW1zKSA9PiB7XG4gICAgICByZXNvbHZlKChpdGVtc1trZXldIGFzIFQpID8/IG51bGwpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBzZXRTdG9yZWRWYWx1ZSA9IGFzeW5jIDxUPihrZXk6IHN0cmluZywgdmFsdWU6IFQpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgW2tleV06IHZhbHVlIH0sICgpID0+IHJlc29sdmUoKSk7XG4gIH0pO1xufTtcbiIsICJpbXBvcnQgeyBQcmVmZXJlbmNlcywgU29ydGluZ1N0cmF0ZWd5LCBUYWJNZXRhZGF0YSB9IGZyb20gXCIuL3R5cGVzLmpzXCI7XG5cbmV4cG9ydCBjb25zdCBtYXBDaHJvbWVUYWIgPSAodGFiOiBjaHJvbWUudGFicy5UYWIpOiBUYWJNZXRhZGF0YSB8IG51bGwgPT4ge1xuICBpZiAoIXRhYi5pZCB8fCB0YWIuaWQgPT09IGNocm9tZS50YWJzLlRBQl9JRF9OT05FIHx8ICF0YWIud2luZG93SWQpIHJldHVybiBudWxsO1xuICByZXR1cm4ge1xuICAgIGlkOiB0YWIuaWQsXG4gICAgd2luZG93SWQ6IHRhYi53aW5kb3dJZCxcbiAgICB0aXRsZTogdGFiLnRpdGxlIHx8IFwiVW50aXRsZWRcIixcbiAgICB1cmw6IHRhYi5wZW5kaW5nVXJsIHx8IHRhYi51cmwgfHwgXCJhYm91dDpibGFua1wiLFxuICAgIHBpbm5lZDogQm9vbGVhbih0YWIucGlubmVkKSxcbiAgICBsYXN0QWNjZXNzZWQ6IHRhYi5sYXN0QWNjZXNzZWQsXG4gICAgb3BlbmVyVGFiSWQ6IHRhYi5vcGVuZXJUYWJJZCA/PyB1bmRlZmluZWQsXG4gICAgZmF2SWNvblVybDogdGFiLmZhdkljb25VcmwsXG4gICAgZ3JvdXBJZDogdGFiLmdyb3VwSWQsXG4gICAgaW5kZXg6IHRhYi5pbmRleCxcbiAgICBhY3RpdmU6IHRhYi5hY3RpdmUsXG4gICAgc3RhdHVzOiB0YWIuc3RhdHVzLFxuICAgIHNlbGVjdGVkOiB0YWIuaGlnaGxpZ2h0ZWRcbiAgfTtcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRTdG9yZWRQcmVmZXJlbmNlcyA9IGFzeW5jICgpOiBQcm9taXNlPFByZWZlcmVuY2VzIHwgbnVsbD4gPT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoXCJwcmVmZXJlbmNlc1wiLCAoaXRlbXMpID0+IHtcbiAgICAgIHJlc29sdmUoKGl0ZW1zW1wicHJlZmVyZW5jZXNcIl0gYXMgUHJlZmVyZW5jZXMpID8/IG51bGwpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbmV4cG9ydCBjb25zdCBhc0FycmF5ID0gPFQ+KHZhbHVlOiB1bmtub3duKTogVFtdID0+IHtcbiAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHJldHVybiB2YWx1ZSBhcyBUW107XG4gICAgcmV0dXJuIFtdO1xufTtcbiIsICJpbXBvcnQgeyBDdXN0b21TdHJhdGVneSwgUHJlZmVyZW5jZXMsIFNvcnRpbmdTdHJhdGVneSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGdldFN0b3JlZFZhbHVlLCBzZXRTdG9yZWRWYWx1ZSB9IGZyb20gXCIuL3N0b3JhZ2UuanNcIjtcbmltcG9ydCB7IHNldExvZ2dlclByZWZlcmVuY2VzLCBsb2dEZWJ1ZyB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBhc0FycmF5IH0gZnJvbSBcIi4uL3NoYXJlZC91dGlscy5qc1wiO1xuXG5jb25zdCBQUkVGRVJFTkNFU19LRVkgPSBcInByZWZlcmVuY2VzXCI7XG5cbmV4cG9ydCBjb25zdCBkZWZhdWx0UHJlZmVyZW5jZXM6IFByZWZlcmVuY2VzID0ge1xuICBzb3J0aW5nOiBbXCJwaW5uZWRcIiwgXCJyZWNlbmN5XCJdLFxuICBkZWJ1ZzogZmFsc2UsXG4gIGxvZ0xldmVsOiBcImluZm9cIixcbiAgdGhlbWU6IFwiZGFya1wiLFxuICBjdXN0b21HZW5lcmE6IHt9XG59O1xuXG5jb25zdCBub3JtYWxpemVTb3J0aW5nID0gKHNvcnRpbmc6IHVua25vd24pOiBTb3J0aW5nU3RyYXRlZ3lbXSA9PiB7XG4gIGlmIChBcnJheS5pc0FycmF5KHNvcnRpbmcpKSB7XG4gICAgcmV0dXJuIHNvcnRpbmcuZmlsdGVyKCh2YWx1ZSk6IHZhbHVlIGlzIFNvcnRpbmdTdHJhdGVneSA9PiB0eXBlb2YgdmFsdWUgPT09IFwic3RyaW5nXCIpO1xuICB9XG4gIGlmICh0eXBlb2Ygc29ydGluZyA9PT0gXCJzdHJpbmdcIikge1xuICAgIHJldHVybiBbc29ydGluZ107XG4gIH1cbiAgcmV0dXJuIFsuLi5kZWZhdWx0UHJlZmVyZW5jZXMuc29ydGluZ107XG59O1xuXG5jb25zdCBub3JtYWxpemVTdHJhdGVnaWVzID0gKHN0cmF0ZWdpZXM6IHVua25vd24pOiBDdXN0b21TdHJhdGVneVtdID0+IHtcbiAgICBjb25zdCBhcnIgPSBhc0FycmF5PGFueT4oc3RyYXRlZ2llcykuZmlsdGVyKHMgPT4gdHlwZW9mIHMgPT09ICdvYmplY3QnICYmIHMgIT09IG51bGwpO1xuICAgIHJldHVybiBhcnIubWFwKHMgPT4gKHtcbiAgICAgICAgLi4ucyxcbiAgICAgICAgZ3JvdXBpbmdSdWxlczogYXNBcnJheShzLmdyb3VwaW5nUnVsZXMpLFxuICAgICAgICBzb3J0aW5nUnVsZXM6IGFzQXJyYXkocy5zb3J0aW5nUnVsZXMpLFxuICAgICAgICBncm91cFNvcnRpbmdSdWxlczogcy5ncm91cFNvcnRpbmdSdWxlcyA/IGFzQXJyYXkocy5ncm91cFNvcnRpbmdSdWxlcykgOiB1bmRlZmluZWQsXG4gICAgICAgIGZpbHRlcnM6IHMuZmlsdGVycyA/IGFzQXJyYXkocy5maWx0ZXJzKSA6IHVuZGVmaW5lZCxcbiAgICAgICAgZmlsdGVyR3JvdXBzOiBzLmZpbHRlckdyb3VwcyA/IGFzQXJyYXkocy5maWx0ZXJHcm91cHMpLm1hcCgoZzogYW55KSA9PiBhc0FycmF5KGcpKSA6IHVuZGVmaW5lZCxcbiAgICAgICAgcnVsZXM6IHMucnVsZXMgPyBhc0FycmF5KHMucnVsZXMpIDogdW5kZWZpbmVkXG4gICAgfSkpO1xufTtcblxuY29uc3Qgbm9ybWFsaXplUHJlZmVyZW5jZXMgPSAocHJlZnM/OiBQYXJ0aWFsPFByZWZlcmVuY2VzPiB8IG51bGwpOiBQcmVmZXJlbmNlcyA9PiB7XG4gIGNvbnN0IG1lcmdlZCA9IHsgLi4uZGVmYXVsdFByZWZlcmVuY2VzLCAuLi4ocHJlZnMgPz8ge30pIH07XG4gIHJldHVybiB7XG4gICAgLi4ubWVyZ2VkLFxuICAgIHNvcnRpbmc6IG5vcm1hbGl6ZVNvcnRpbmcobWVyZ2VkLnNvcnRpbmcpLFxuICAgIGN1c3RvbVN0cmF0ZWdpZXM6IG5vcm1hbGl6ZVN0cmF0ZWdpZXMobWVyZ2VkLmN1c3RvbVN0cmF0ZWdpZXMpXG4gIH07XG59O1xuXG5leHBvcnQgY29uc3QgbG9hZFByZWZlcmVuY2VzID0gYXN5bmMgKCk6IFByb21pc2U8UHJlZmVyZW5jZXM+ID0+IHtcbiAgY29uc3Qgc3RvcmVkID0gYXdhaXQgZ2V0U3RvcmVkVmFsdWU8UHJlZmVyZW5jZXM+KFBSRUZFUkVOQ0VTX0tFWSk7XG4gIGNvbnN0IG1lcmdlZCA9IG5vcm1hbGl6ZVByZWZlcmVuY2VzKHN0b3JlZCA/PyB1bmRlZmluZWQpO1xuICBzZXRMb2dnZXJQcmVmZXJlbmNlcyhtZXJnZWQpO1xuICByZXR1cm4gbWVyZ2VkO1xufTtcblxuZXhwb3J0IGNvbnN0IHNhdmVQcmVmZXJlbmNlcyA9IGFzeW5jIChwcmVmczogUGFydGlhbDxQcmVmZXJlbmNlcz4pOiBQcm9taXNlPFByZWZlcmVuY2VzPiA9PiB7XG4gIGxvZ0RlYnVnKFwiVXBkYXRpbmcgcHJlZmVyZW5jZXNcIiwgeyBrZXlzOiBPYmplY3Qua2V5cyhwcmVmcykgfSk7XG4gIGNvbnN0IGN1cnJlbnQgPSBhd2FpdCBsb2FkUHJlZmVyZW5jZXMoKTtcbiAgY29uc3QgbWVyZ2VkID0gbm9ybWFsaXplUHJlZmVyZW5jZXMoeyAuLi5jdXJyZW50LCAuLi5wcmVmcyB9KTtcbiAgYXdhaXQgc2V0U3RvcmVkVmFsdWUoUFJFRkVSRU5DRVNfS0VZLCBtZXJnZWQpO1xuICBzZXRMb2dnZXJQcmVmZXJlbmNlcyhtZXJnZWQpO1xuICByZXR1cm4gbWVyZ2VkO1xufTtcbiIsICJpbXBvcnQgeyBQYWdlQ29udGV4dCwgVGFiTWV0YWRhdGEgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBub3JtYWxpemVVcmwsIHBhcnNlWW91VHViZVVybCwgZXh0cmFjdFlvdVR1YmVDaGFubmVsRnJvbUh0bWwsIGV4dHJhY3RZb3VUdWJlR2VucmVGcm9tSHRtbCB9IGZyb20gXCIuL2xvZ2ljLmpzXCI7XG5pbXBvcnQgeyBnZXRHZW5lcmEgfSBmcm9tIFwiLi9nZW5lcmFSZWdpc3RyeS5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgbG9hZFByZWZlcmVuY2VzIH0gZnJvbSBcIi4uL3ByZWZlcmVuY2VzLmpzXCI7XG5cbmludGVyZmFjZSBFeHRyYWN0aW9uUmVzcG9uc2Uge1xuICBkYXRhOiBQYWdlQ29udGV4dCB8IG51bGw7XG4gIGVycm9yPzogc3RyaW5nO1xuICBzdGF0dXM6XG4gICAgfCAnT0snXG4gICAgfCAnUkVTVFJJQ1RFRCdcbiAgICB8ICdJTkpFQ1RJT05fRkFJTEVEJ1xuICAgIHwgJ05PX1JFU1BPTlNFJ1xuICAgIHwgJ05PX0hPU1RfUEVSTUlTU0lPTidcbiAgICB8ICdGUkFNRV9BQ0NFU1NfREVOSUVEJztcbn1cblxuLy8gU2ltcGxlIGNvbmN1cnJlbmN5IGNvbnRyb2xcbmxldCBhY3RpdmVGZXRjaGVzID0gMDtcbmNvbnN0IE1BWF9DT05DVVJSRU5UX0ZFVENIRVMgPSA1OyAvLyBDb25zZXJ2YXRpdmUgbGltaXQgdG8gYXZvaWQgcmF0ZSBsaW1pdGluZ1xuY29uc3QgRkVUQ0hfUVVFVUU6ICgoKSA9PiB2b2lkKVtdID0gW107XG5cbmNvbnN0IGZldGNoV2l0aFRpbWVvdXQgPSBhc3luYyAodXJsOiBzdHJpbmcsIHRpbWVvdXQgPSAyMDAwKTogUHJvbWlzZTxSZXNwb25zZT4gPT4ge1xuICAgIGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG4gICAgY29uc3QgaWQgPSBzZXRUaW1lb3V0KCgpID0+IGNvbnRyb2xsZXIuYWJvcnQoKSwgdGltZW91dCk7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCh1cmwsIHsgc2lnbmFsOiBjb250cm9sbGVyLnNpZ25hbCB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgIH0gZmluYWxseSB7XG4gICAgICAgIGNsZWFyVGltZW91dChpZCk7XG4gICAgfVxufTtcblxuY29uc3QgZW5xdWV1ZUZldGNoID0gYXN5bmMgPFQ+KGZuOiAoKSA9PiBQcm9taXNlPFQ+KTogUHJvbWlzZTxUPiA9PiB7XG4gICAgaWYgKGFjdGl2ZUZldGNoZXMgPj0gTUFYX0NPTkNVUlJFTlRfRkVUQ0hFUykge1xuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IEZFVENIX1FVRVVFLnB1c2gocmVzb2x2ZSkpO1xuICAgIH1cbiAgICBhY3RpdmVGZXRjaGVzKys7XG4gICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIGF3YWl0IGZuKCk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgICAgYWN0aXZlRmV0Y2hlcy0tO1xuICAgICAgICBpZiAoRkVUQ0hfUVVFVUUubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY29uc3QgbmV4dCA9IEZFVENIX1FVRVVFLnNoaWZ0KCk7XG4gICAgICAgICAgICBpZiAobmV4dCkgbmV4dCgpO1xuICAgICAgICB9XG4gICAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGV4dHJhY3RQYWdlQ29udGV4dCA9IGFzeW5jICh0YWI6IFRhYk1ldGFkYXRhIHwgY2hyb21lLnRhYnMuVGFiKTogUHJvbWlzZTxFeHRyYWN0aW9uUmVzcG9uc2U+ID0+IHtcbiAgdHJ5IHtcbiAgICBpZiAoIXRhYiB8fCAhdGFiLnVybCkge1xuICAgICAgICByZXR1cm4geyBkYXRhOiBudWxsLCBlcnJvcjogXCJUYWIgbm90IGZvdW5kIG9yIG5vIFVSTFwiLCBzdGF0dXM6ICdOT19SRVNQT05TRScgfTtcbiAgICB9XG5cbiAgICBpZiAoXG4gICAgICB0YWIudXJsLnN0YXJ0c1dpdGgoJ2Nocm9tZTovLycpIHx8XG4gICAgICB0YWIudXJsLnN0YXJ0c1dpdGgoJ2VkZ2U6Ly8nKSB8fFxuICAgICAgdGFiLnVybC5zdGFydHNXaXRoKCdhYm91dDonKSB8fFxuICAgICAgdGFiLnVybC5zdGFydHNXaXRoKCdjaHJvbWUtZXh0ZW5zaW9uOi8vJykgfHxcbiAgICAgIHRhYi51cmwuc3RhcnRzV2l0aCgnY2hyb21lLWVycm9yOi8vJylcbiAgICApIHtcbiAgICAgICAgcmV0dXJuIHsgZGF0YTogbnVsbCwgZXJyb3I6IFwiUmVzdHJpY3RlZCBVUkwgc2NoZW1lXCIsIHN0YXR1czogJ1JFU1RSSUNURUQnIH07XG4gICAgfVxuXG4gICAgY29uc3QgcHJlZnMgPSBhd2FpdCBsb2FkUHJlZmVyZW5jZXMoKTtcbiAgICBsZXQgYmFzZWxpbmUgPSBidWlsZEJhc2VsaW5lQ29udGV4dCh0YWIgYXMgY2hyb21lLnRhYnMuVGFiLCBwcmVmcy5jdXN0b21HZW5lcmEpO1xuXG4gICAgLy8gRmV0Y2ggYW5kIGVucmljaCBmb3IgWW91VHViZSBpZiBhdXRob3IgaXMgbWlzc2luZyBhbmQgaXQgaXMgYSB2aWRlb1xuICAgIGNvbnN0IHRhcmdldFVybCA9IHRhYi51cmw7XG4gICAgY29uc3QgdXJsT2JqID0gbmV3IFVSTCh0YXJnZXRVcmwpO1xuICAgIGNvbnN0IGhvc3RuYW1lID0gdXJsT2JqLmhvc3RuYW1lLnJlcGxhY2UoL153d3dcXC4vLCAnJyk7XG4gICAgaWYgKChob3N0bmFtZS5lbmRzV2l0aCgneW91dHViZS5jb20nKSB8fCBob3N0bmFtZS5lbmRzV2l0aCgneW91dHUuYmUnKSkgJiYgKCFiYXNlbGluZS5hdXRob3JPckNyZWF0b3IgfHwgYmFzZWxpbmUuZ2VucmUgPT09ICdWaWRlbycpKSB7XG4gICAgICAgICB0cnkge1xuICAgICAgICAgICAgIC8vIFdlIHVzZSBhIHF1ZXVlIHRvIHByZXZlbnQgZmxvb2RpbmcgcmVxdWVzdHNcbiAgICAgICAgICAgICBhd2FpdCBlbnF1ZXVlRmV0Y2goYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoV2l0aFRpbWVvdXQodGFyZ2V0VXJsKTtcbiAgICAgICAgICAgICAgICAgaWYgKHJlc3BvbnNlLm9rKSB7XG4gICAgICAgICAgICAgICAgICAgICBjb25zdCBodG1sID0gYXdhaXQgcmVzcG9uc2UudGV4dCgpO1xuICAgICAgICAgICAgICAgICAgICAgY29uc3QgY2hhbm5lbCA9IGV4dHJhY3RZb3VUdWJlQ2hhbm5lbEZyb21IdG1sKGh0bWwpO1xuICAgICAgICAgICAgICAgICAgICAgaWYgKGNoYW5uZWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICBiYXNlbGluZS5hdXRob3JPckNyZWF0b3IgPSBjaGFubmVsO1xuICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgY29uc3QgZ2VucmUgPSBleHRyYWN0WW91VHViZUdlbnJlRnJvbUh0bWwoaHRtbCk7XG4gICAgICAgICAgICAgICAgICAgICBpZiAoZ2VucmUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICBiYXNlbGluZS5nZW5yZSA9IGdlbnJlO1xuICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgfSk7XG4gICAgICAgICB9IGNhdGNoIChmZXRjaEVycikge1xuICAgICAgICAgICAgIGxvZ0RlYnVnKFwiRmFpbGVkIHRvIGZldGNoIFlvdVR1YmUgcGFnZSBjb250ZW50XCIsIHsgZXJyb3I6IFN0cmluZyhmZXRjaEVycikgfSk7XG4gICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGRhdGE6IGJhc2VsaW5lLFxuICAgICAgc3RhdHVzOiAnT0snXG4gICAgfTtcblxuICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICBsb2dEZWJ1ZyhgRXh0cmFjdGlvbiBmYWlsZWQgZm9yIHRhYiAke3RhYi5pZH1gLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIGRhdGE6IG51bGwsXG4gICAgICBlcnJvcjogU3RyaW5nKGUpLFxuICAgICAgc3RhdHVzOiAnSU5KRUNUSU9OX0ZBSUxFRCdcbiAgICB9O1xuICB9XG59O1xuXG5jb25zdCBidWlsZEJhc2VsaW5lQ29udGV4dCA9ICh0YWI6IGNocm9tZS50YWJzLlRhYiwgY3VzdG9tR2VuZXJhPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPik6IFBhZ2VDb250ZXh0ID0+IHtcbiAgY29uc3QgdXJsID0gdGFiLnVybCB8fCBcIlwiO1xuICBsZXQgaG9zdG5hbWUgPSBcIlwiO1xuICB0cnkge1xuICAgIGhvc3RuYW1lID0gbmV3IFVSTCh1cmwpLmhvc3RuYW1lLnJlcGxhY2UoL153d3dcXC4vLCAnJyk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBob3N0bmFtZSA9IFwiXCI7XG4gIH1cblxuICAvLyBEZXRlcm1pbmUgT2JqZWN0IFR5cGUgZmlyc3RcbiAgbGV0IG9iamVjdFR5cGU6IFBhZ2VDb250ZXh0WydvYmplY3RUeXBlJ10gPSAndW5rbm93bic7XG4gIGxldCBhdXRob3JPckNyZWF0b3I6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXG4gIGlmICh1cmwuaW5jbHVkZXMoJy9sb2dpbicpIHx8IHVybC5pbmNsdWRlcygnL3NpZ25pbicpKSB7XG4gICAgICBvYmplY3RUeXBlID0gJ2xvZ2luJztcbiAgfSBlbHNlIGlmIChob3N0bmFtZS5pbmNsdWRlcygneW91dHViZS5jb20nKSB8fCBob3N0bmFtZS5pbmNsdWRlcygneW91dHUuYmUnKSkge1xuICAgICAgY29uc3QgeyB2aWRlb0lkIH0gPSBwYXJzZVlvdVR1YmVVcmwodXJsKTtcbiAgICAgIGlmICh2aWRlb0lkKSBvYmplY3RUeXBlID0gJ3ZpZGVvJztcblxuICAgICAgLy8gVHJ5IHRvIGd1ZXNzIGNoYW5uZWwgZnJvbSBVUkwgaWYgcG9zc2libGVcbiAgICAgIGlmICh1cmwuaW5jbHVkZXMoJy9AJykpIHtcbiAgICAgICAgICBjb25zdCBwYXJ0cyA9IHVybC5zcGxpdCgnL0AnKTtcbiAgICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICBjb25zdCBoYW5kbGUgPSBwYXJ0c1sxXS5zcGxpdCgnLycpWzBdO1xuICAgICAgICAgICAgICBhdXRob3JPckNyZWF0b3IgPSAnQCcgKyBoYW5kbGU7XG4gICAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICh1cmwuaW5jbHVkZXMoJy9jLycpKSB7XG4gICAgICAgICAgY29uc3QgcGFydHMgPSB1cmwuc3BsaXQoJy9jLycpO1xuICAgICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgIGF1dGhvck9yQ3JlYXRvciA9IGRlY29kZVVSSUNvbXBvbmVudChwYXJ0c1sxXS5zcGxpdCgnLycpWzBdKTtcbiAgICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHVybC5pbmNsdWRlcygnL3VzZXIvJykpIHtcbiAgICAgICAgICBjb25zdCBwYXJ0cyA9IHVybC5zcGxpdCgnL3VzZXIvJyk7XG4gICAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgYXV0aG9yT3JDcmVhdG9yID0gZGVjb2RlVVJJQ29tcG9uZW50KHBhcnRzWzFdLnNwbGl0KCcvJylbMF0pO1xuICAgICAgICAgIH1cbiAgICAgIH1cbiAgfSBlbHNlIGlmIChob3N0bmFtZSA9PT0gJ2dpdGh1Yi5jb20nICYmIHVybC5pbmNsdWRlcygnL3B1bGwvJykpIHtcbiAgICAgIG9iamVjdFR5cGUgPSAndGlja2V0JztcbiAgfSBlbHNlIGlmIChob3N0bmFtZSA9PT0gJ2dpdGh1Yi5jb20nICYmICF1cmwuaW5jbHVkZXMoJy9wdWxsLycpICYmIHVybC5zcGxpdCgnLycpLmxlbmd0aCA+PSA1KSB7XG4gICAgICAvLyByb3VnaCBjaGVjayBmb3IgcmVwb1xuICAgICAgb2JqZWN0VHlwZSA9ICdyZXBvJztcbiAgfVxuXG4gIC8vIERldGVybWluZSBHZW5yZVxuICAvLyBQcmlvcml0eSAxOiBTaXRlLXNwZWNpZmljIGV4dHJhY3Rpb24gKGRlcml2ZWQgZnJvbSBvYmplY3RUeXBlKVxuICBsZXQgZ2VucmU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICBpZiAob2JqZWN0VHlwZSA9PT0gJ3ZpZGVvJykgZ2VucmUgPSAnVmlkZW8nO1xuICBlbHNlIGlmIChvYmplY3RUeXBlID09PSAncmVwbycgfHwgb2JqZWN0VHlwZSA9PT0gJ3RpY2tldCcpIGdlbnJlID0gJ0RldmVsb3BtZW50JztcblxuICAvLyBQcmlvcml0eSAyOiBGYWxsYmFjayB0byBSZWdpc3RyeVxuICBpZiAoIWdlbnJlKSB7XG4gICAgIGdlbnJlID0gZ2V0R2VuZXJhKGhvc3RuYW1lLCBjdXN0b21HZW5lcmEpIHx8IHVuZGVmaW5lZDtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY2Fub25pY2FsVXJsOiB1cmwgfHwgbnVsbCxcbiAgICBub3JtYWxpemVkVXJsOiBub3JtYWxpemVVcmwodXJsKSxcbiAgICBzaXRlTmFtZTogaG9zdG5hbWUgfHwgbnVsbCxcbiAgICBwbGF0Zm9ybTogaG9zdG5hbWUgfHwgbnVsbCxcbiAgICBvYmplY3RUeXBlLFxuICAgIG9iamVjdElkOiB1cmwgfHwgbnVsbCxcbiAgICB0aXRsZTogdGFiLnRpdGxlIHx8IG51bGwsXG4gICAgZ2VucmUsXG4gICAgZGVzY3JpcHRpb246IG51bGwsXG4gICAgYXV0aG9yT3JDcmVhdG9yOiBhdXRob3JPckNyZWF0b3IsXG4gICAgcHVibGlzaGVkQXQ6IG51bGwsXG4gICAgbW9kaWZpZWRBdDogbnVsbCxcbiAgICBsYW5ndWFnZTogbnVsbCxcbiAgICB0YWdzOiBbXSxcbiAgICBicmVhZGNydW1iczogW10sXG4gICAgaXNBdWRpYmxlOiBmYWxzZSxcbiAgICBpc011dGVkOiBmYWxzZSxcbiAgICBpc0NhcHR1cmluZzogZmFsc2UsXG4gICAgcHJvZ3Jlc3M6IG51bGwsXG4gICAgaGFzVW5zYXZlZENoYW5nZXNMaWtlbHk6IGZhbHNlLFxuICAgIGlzQXV0aGVudGljYXRlZExpa2VseTogZmFsc2UsXG4gICAgc291cmNlczoge1xuICAgICAgY2Fub25pY2FsVXJsOiAndXJsJyxcbiAgICAgIG5vcm1hbGl6ZWRVcmw6ICd1cmwnLFxuICAgICAgc2l0ZU5hbWU6ICd1cmwnLFxuICAgICAgcGxhdGZvcm06ICd1cmwnLFxuICAgICAgb2JqZWN0VHlwZTogJ3VybCcsXG4gICAgICB0aXRsZTogdGFiLnRpdGxlID8gJ3RhYicgOiAndXJsJyxcbiAgICAgIGdlbnJlOiAncmVnaXN0cnknXG4gICAgfSxcbiAgICBjb25maWRlbmNlOiB7fVxuICB9O1xufTtcbiIsICJpbXBvcnQgeyBUYWJNZXRhZGF0YSwgUGFnZUNvbnRleHQgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBsb2dEZWJ1ZywgbG9nRXJyb3IgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgZXh0cmFjdFBhZ2VDb250ZXh0IH0gZnJvbSBcIi4vZXh0cmFjdGlvbi9pbmRleC5qc1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIENvbnRleHRSZXN1bHQge1xuICBjb250ZXh0OiBzdHJpbmc7XG4gIHNvdXJjZTogJ0FJJyB8ICdIZXVyaXN0aWMnIHwgJ0V4dHJhY3Rpb24nO1xuICBkYXRhPzogUGFnZUNvbnRleHQ7XG4gIGVycm9yPzogc3RyaW5nO1xuICBzdGF0dXM/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBDYWNoZUVudHJ5IHtcbiAgcmVzdWx0OiBDb250ZXh0UmVzdWx0O1xuICB0aW1lc3RhbXA6IG51bWJlcjtcbn1cblxuY29uc3QgY29udGV4dENhY2hlID0gbmV3IE1hcDxzdHJpbmcsIENhY2hlRW50cnk+KCk7XG5jb25zdCBDQUNIRV9UVExfU1VDQ0VTUyA9IDI0ICogNjAgKiA2MCAqIDEwMDA7IC8vIDI0IGhvdXJzXG5jb25zdCBDQUNIRV9UVExfRVJST1IgPSA1ICogNjAgKiAxMDAwOyAvLyA1IG1pbnV0ZXNcblxuZXhwb3J0IGNvbnN0IGFuYWx5emVUYWJDb250ZXh0ID0gYXN5bmMgKFxuICB0YWJzOiBUYWJNZXRhZGF0YVtdLFxuICBvblByb2dyZXNzPzogKGNvbXBsZXRlZDogbnVtYmVyLCB0b3RhbDogbnVtYmVyKSA9PiB2b2lkXG4pOiBQcm9taXNlPE1hcDxudW1iZXIsIENvbnRleHRSZXN1bHQ+PiA9PiB7XG4gIGNvbnN0IGNvbnRleHRNYXAgPSBuZXcgTWFwPG51bWJlciwgQ29udGV4dFJlc3VsdD4oKTtcbiAgbGV0IGNvbXBsZXRlZCA9IDA7XG4gIGNvbnN0IHRvdGFsID0gdGFicy5sZW5ndGg7XG5cbiAgY29uc3QgcHJvbWlzZXMgPSB0YWJzLm1hcChhc3luYyAodGFiKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGNhY2hlS2V5ID0gYCR7dGFiLmlkfTo6JHt0YWIudXJsfWA7XG4gICAgICBjb25zdCBjYWNoZWQgPSBjb250ZXh0Q2FjaGUuZ2V0KGNhY2hlS2V5KTtcblxuICAgICAgaWYgKGNhY2hlZCkge1xuICAgICAgICBjb25zdCBpc0Vycm9yID0gY2FjaGVkLnJlc3VsdC5zdGF0dXMgPT09ICdFUlJPUicgfHwgISFjYWNoZWQucmVzdWx0LmVycm9yO1xuICAgICAgICBjb25zdCB0dGwgPSBpc0Vycm9yID8gQ0FDSEVfVFRMX0VSUk9SIDogQ0FDSEVfVFRMX1NVQ0NFU1M7XG5cbiAgICAgICAgaWYgKERhdGUubm93KCkgLSBjYWNoZWQudGltZXN0YW1wIDwgdHRsKSB7XG4gICAgICAgICAgY29udGV4dE1hcC5zZXQodGFiLmlkLCBjYWNoZWQucmVzdWx0KTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29udGV4dENhY2hlLmRlbGV0ZShjYWNoZUtleSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZmV0Y2hDb250ZXh0Rm9yVGFiKHRhYik7XG5cbiAgICAgIC8vIENhY2hlIHdpdGggZXhwaXJhdGlvbiBsb2dpY1xuICAgICAgY29udGV4dENhY2hlLnNldChjYWNoZUtleSwge1xuICAgICAgICByZXN1bHQsXG4gICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKVxuICAgICAgfSk7XG5cbiAgICAgIGNvbnRleHRNYXAuc2V0KHRhYi5pZCwgcmVzdWx0KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nRXJyb3IoYEZhaWxlZCB0byBhbmFseXplIGNvbnRleHQgZm9yIHRhYiAke3RhYi5pZH1gLCB7IGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICAgICAgLy8gRXZlbiBpZiBmZXRjaENvbnRleHRGb3JUYWIgZmFpbHMgY29tcGxldGVseSwgd2UgdHJ5IGEgc2FmZSBzeW5jIGZhbGxiYWNrXG4gICAgICBjb250ZXh0TWFwLnNldCh0YWIuaWQsIHsgY29udGV4dDogXCJVbmNhdGVnb3JpemVkXCIsIHNvdXJjZTogJ0hldXJpc3RpYycsIGVycm9yOiBTdHJpbmcoZXJyb3IpLCBzdGF0dXM6ICdFUlJPUicgfSk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGNvbXBsZXRlZCsrO1xuICAgICAgaWYgKG9uUHJvZ3Jlc3MpIG9uUHJvZ3Jlc3MoY29tcGxldGVkLCB0b3RhbCk7XG4gICAgfVxuICB9KTtcblxuICBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gIHJldHVybiBjb250ZXh0TWFwO1xufTtcblxuY29uc3QgZmV0Y2hDb250ZXh0Rm9yVGFiID0gYXN5bmMgKHRhYjogVGFiTWV0YWRhdGEpOiBQcm9taXNlPENvbnRleHRSZXN1bHQ+ID0+IHtcbiAgLy8gMS4gUnVuIEdlbmVyaWMgRXh0cmFjdGlvbiAoQWx3YXlzKVxuICBsZXQgZGF0YTogUGFnZUNvbnRleHQgfCBudWxsID0gbnVsbDtcbiAgbGV0IGVycm9yOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gIGxldCBzdGF0dXM6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICB0cnkge1xuICAgICAgY29uc3QgZXh0cmFjdGlvbiA9IGF3YWl0IGV4dHJhY3RQYWdlQ29udGV4dCh0YWIpO1xuICAgICAgZGF0YSA9IGV4dHJhY3Rpb24uZGF0YTtcbiAgICAgIGVycm9yID0gZXh0cmFjdGlvbi5lcnJvcjtcbiAgICAgIHN0YXR1cyA9IGV4dHJhY3Rpb24uc3RhdHVzO1xuICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2dEZWJ1ZyhgRXh0cmFjdGlvbiBmYWlsZWQgZm9yIHRhYiAke3RhYi5pZH1gLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICBlcnJvciA9IFN0cmluZyhlKTtcbiAgICAgIHN0YXR1cyA9ICdFUlJPUic7XG4gIH1cblxuICBsZXQgY29udGV4dCA9IFwiVW5jYXRlZ29yaXplZFwiO1xuICBsZXQgc291cmNlOiBDb250ZXh0UmVzdWx0Wydzb3VyY2UnXSA9ICdIZXVyaXN0aWMnO1xuXG4gIC8vIDIuIFRyeSB0byBEZXRlcm1pbmUgQ2F0ZWdvcnkgZnJvbSBFeHRyYWN0aW9uIERhdGFcbiAgaWYgKGRhdGEpIHtcbiAgICAgIGlmIChkYXRhLnBsYXRmb3JtID09PSAnWW91VHViZScgfHwgZGF0YS5wbGF0Zm9ybSA9PT0gJ05ldGZsaXgnIHx8IGRhdGEucGxhdGZvcm0gPT09ICdTcG90aWZ5JyB8fCBkYXRhLnBsYXRmb3JtID09PSAnVHdpdGNoJykge1xuICAgICAgICAgIGNvbnRleHQgPSBcIkVudGVydGFpbm1lbnRcIjtcbiAgICAgICAgICBzb3VyY2UgPSAnRXh0cmFjdGlvbic7XG4gICAgICB9IGVsc2UgaWYgKGRhdGEucGxhdGZvcm0gPT09ICdHaXRIdWInIHx8IGRhdGEucGxhdGZvcm0gPT09ICdTdGFjayBPdmVyZmxvdycgfHwgZGF0YS5wbGF0Zm9ybSA9PT0gJ0ppcmEnIHx8IGRhdGEucGxhdGZvcm0gPT09ICdHaXRMYWInKSB7XG4gICAgICAgICAgY29udGV4dCA9IFwiRGV2ZWxvcG1lbnRcIjtcbiAgICAgICAgICBzb3VyY2UgPSAnRXh0cmFjdGlvbic7XG4gICAgICB9IGVsc2UgaWYgKGRhdGEucGxhdGZvcm0gPT09ICdHb29nbGUnICYmIChkYXRhLm5vcm1hbGl6ZWRVcmwuaW5jbHVkZXMoJ2RvY3MnKSB8fCBkYXRhLm5vcm1hbGl6ZWRVcmwuaW5jbHVkZXMoJ3NoZWV0cycpIHx8IGRhdGEubm9ybWFsaXplZFVybC5pbmNsdWRlcygnc2xpZGVzJykpKSB7XG4gICAgICAgICAgY29udGV4dCA9IFwiV29ya1wiO1xuICAgICAgICAgIHNvdXJjZSA9ICdFeHRyYWN0aW9uJztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIElmIHdlIGhhdmUgc3VjY2Vzc2Z1bCBleHRyYWN0aW9uIGRhdGEgYnV0IG5vIHNwZWNpZmljIHJ1bGUgbWF0Y2hlZCxcbiAgICAgICAgLy8gdXNlIHRoZSBPYmplY3QgVHlwZSBvciBnZW5lcmljIFwiR2VuZXJhbCBXZWJcIiB0byBpbmRpY2F0ZSBleHRyYWN0aW9uIHdvcmtlZC5cbiAgICAgICAgLy8gV2UgcHJlZmVyIHNwZWNpZmljIGNhdGVnb3JpZXMsIGJ1dCBcIkFydGljbGVcIiBvciBcIlZpZGVvXCIgYXJlIGJldHRlciB0aGFuIFwiVW5jYXRlZ29yaXplZFwiLlxuICAgICAgICBpZiAoZGF0YS5vYmplY3RUeXBlICYmIGRhdGEub2JqZWN0VHlwZSAhPT0gJ3Vua25vd24nKSB7XG4gICAgICAgICAgICAgLy8gTWFwIG9iamVjdCB0eXBlcyB0byBjYXRlZ29yaWVzIGlmIHBvc3NpYmxlXG4gICAgICAgICAgICAgaWYgKGRhdGEub2JqZWN0VHlwZSA9PT0gJ3ZpZGVvJykgY29udGV4dCA9ICdFbnRlcnRhaW5tZW50JztcbiAgICAgICAgICAgICBlbHNlIGlmIChkYXRhLm9iamVjdFR5cGUgPT09ICdhcnRpY2xlJykgY29udGV4dCA9ICdOZXdzJzsgLy8gTG9vc2UgbWFwcGluZywgYnV0IGJldHRlciB0aGFuIG5vdGhpbmdcbiAgICAgICAgICAgICBlbHNlIGNvbnRleHQgPSBkYXRhLm9iamVjdFR5cGUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBkYXRhLm9iamVjdFR5cGUuc2xpY2UoMSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgY29udGV4dCA9IFwiR2VuZXJhbCBXZWJcIjtcbiAgICAgICAgfVxuICAgICAgICBzb3VyY2UgPSAnRXh0cmFjdGlvbic7XG4gICAgICB9XG4gIH1cblxuICAvLyAzLiBGYWxsYmFjayB0byBMb2NhbCBIZXVyaXN0aWMgKFVSTCBSZWdleClcbiAgaWYgKGNvbnRleHQgPT09IFwiVW5jYXRlZ29yaXplZFwiKSB7XG4gICAgICBjb25zdCBoID0gYXdhaXQgbG9jYWxIZXVyaXN0aWModGFiKTtcbiAgICAgIGlmIChoLmNvbnRleHQgIT09IFwiVW5jYXRlZ29yaXplZFwiKSB7XG4gICAgICAgICAgY29udGV4dCA9IGguY29udGV4dDtcbiAgICAgICAgICAvLyBzb3VyY2UgcmVtYWlucyAnSGV1cmlzdGljJyAob3IgbWF5YmUgd2Ugc2hvdWxkIHNheSAnSGV1cmlzdGljJyBpcyB0aGUgc291cmNlPylcbiAgICAgICAgICAvLyBUaGUgbG9jYWxIZXVyaXN0aWMgZnVuY3Rpb24gcmV0dXJucyB7IHNvdXJjZTogJ0hldXJpc3RpYycgfVxuICAgICAgfVxuICB9XG5cbiAgLy8gNC4gRmFsbGJhY2sgdG8gQUkgKExMTSkgLSBSRU1PVkVEXG4gIC8vIFRoZSBIdWdnaW5nRmFjZSBBUEkgZW5kcG9pbnQgaXMgNDEwIEdvbmUgYW5kL29yIHJlcXVpcmVzIGF1dGhlbnRpY2F0aW9uIHdoaWNoIHdlIGRvIG5vdCBoYXZlLlxuICAvLyBUaGUgY29kZSBoYXMgYmVlbiByZW1vdmVkIHRvIHByZXZlbnQgZXJyb3JzLlxuXG4gIGlmIChjb250ZXh0ICE9PSBcIlVuY2F0ZWdvcml6ZWRcIiAmJiBzb3VyY2UgIT09IFwiRXh0cmFjdGlvblwiKSB7XG4gICAgZXJyb3IgPSB1bmRlZmluZWQ7XG4gICAgc3RhdHVzID0gdW5kZWZpbmVkO1xuICB9XG5cbiAgcmV0dXJuIHsgY29udGV4dCwgc291cmNlLCBkYXRhOiBkYXRhIHx8IHVuZGVmaW5lZCwgZXJyb3IsIHN0YXR1cyB9O1xufTtcblxuY29uc3QgbG9jYWxIZXVyaXN0aWMgPSBhc3luYyAodGFiOiBUYWJNZXRhZGF0YSk6IFByb21pc2U8Q29udGV4dFJlc3VsdD4gPT4ge1xuICBjb25zdCB1cmwgPSB0YWIudXJsLnRvTG93ZXJDYXNlKCk7XG4gIGxldCBjb250ZXh0ID0gXCJVbmNhdGVnb3JpemVkXCI7XG5cbiAgaWYgKHVybC5pbmNsdWRlcyhcImdpdGh1YlwiKSB8fCB1cmwuaW5jbHVkZXMoXCJzdGFja292ZXJmbG93XCIpIHx8IHVybC5pbmNsdWRlcyhcImxvY2FsaG9zdFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJqaXJhXCIpIHx8IHVybC5pbmNsdWRlcyhcImdpdGxhYlwiKSkgY29udGV4dCA9IFwiRGV2ZWxvcG1lbnRcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwiZ29vZ2xlXCIpICYmICh1cmwuaW5jbHVkZXMoXCJkb2NzXCIpIHx8IHVybC5pbmNsdWRlcyhcInNoZWV0c1wiKSB8fCB1cmwuaW5jbHVkZXMoXCJzbGlkZXNcIikpKSBjb250ZXh0ID0gXCJXb3JrXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcImxpbmtlZGluXCIpIHx8IHVybC5pbmNsdWRlcyhcInNsYWNrXCIpIHx8IHVybC5pbmNsdWRlcyhcInpvb21cIikgfHwgdXJsLmluY2x1ZGVzKFwidGVhbXNcIikpIGNvbnRleHQgPSBcIldvcmtcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwibmV0ZmxpeFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJzcG90aWZ5XCIpIHx8IHVybC5pbmNsdWRlcyhcImh1bHVcIikgfHwgdXJsLmluY2x1ZGVzKFwiZGlzbmV5XCIpIHx8IHVybC5pbmNsdWRlcyhcInlvdXR1YmVcIikpIGNvbnRleHQgPSBcIkVudGVydGFpbm1lbnRcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwidHdpdHRlclwiKSB8fCB1cmwuaW5jbHVkZXMoXCJmYWNlYm9va1wiKSB8fCB1cmwuaW5jbHVkZXMoXCJpbnN0YWdyYW1cIikgfHwgdXJsLmluY2x1ZGVzKFwicmVkZGl0XCIpIHx8IHVybC5pbmNsdWRlcyhcInRpa3Rva1wiKSB8fCB1cmwuaW5jbHVkZXMoXCJwaW50ZXJlc3RcIikpIGNvbnRleHQgPSBcIlNvY2lhbFwiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJhbWF6b25cIikgfHwgdXJsLmluY2x1ZGVzKFwiZWJheVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJ3YWxtYXJ0XCIpIHx8IHVybC5pbmNsdWRlcyhcInRhcmdldFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJzaG9waWZ5XCIpKSBjb250ZXh0ID0gXCJTaG9wcGluZ1wiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJjbm5cIikgfHwgdXJsLmluY2x1ZGVzKFwiYmJjXCIpIHx8IHVybC5pbmNsdWRlcyhcIm55dGltZXNcIikgfHwgdXJsLmluY2x1ZGVzKFwid2FzaGluZ3RvbnBvc3RcIikgfHwgdXJsLmluY2x1ZGVzKFwiZm94bmV3c1wiKSkgY29udGV4dCA9IFwiTmV3c1wiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJjb3Vyc2VyYVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJ1ZGVteVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJlZHhcIikgfHwgdXJsLmluY2x1ZGVzKFwia2hhbmFjYWRlbXlcIikgfHwgdXJsLmluY2x1ZGVzKFwiY2FudmFzXCIpKSBjb250ZXh0ID0gXCJFZHVjYXRpb25cIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwiZXhwZWRpYVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJib29raW5nXCIpIHx8IHVybC5pbmNsdWRlcyhcImFpcmJuYlwiKSB8fCB1cmwuaW5jbHVkZXMoXCJ0cmlwYWR2aXNvclwiKSB8fCB1cmwuaW5jbHVkZXMoXCJrYXlha1wiKSkgY29udGV4dCA9IFwiVHJhdmVsXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcIndlYm1kXCIpIHx8IHVybC5pbmNsdWRlcyhcIm1heW9jbGluaWNcIikgfHwgdXJsLmluY2x1ZGVzKFwibmloLmdvdlwiKSB8fCB1cmwuaW5jbHVkZXMoXCJoZWFsdGhcIikpIGNvbnRleHQgPSBcIkhlYWx0aFwiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJlc3BuXCIpIHx8IHVybC5pbmNsdWRlcyhcIm5iYVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJuZmxcIikgfHwgdXJsLmluY2x1ZGVzKFwibWxiXCIpIHx8IHVybC5pbmNsdWRlcyhcImZpZmFcIikpIGNvbnRleHQgPSBcIlNwb3J0c1wiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJ0ZWNoY3J1bmNoXCIpIHx8IHVybC5pbmNsdWRlcyhcIndpcmVkXCIpIHx8IHVybC5pbmNsdWRlcyhcInRoZXZlcmdlXCIpIHx8IHVybC5pbmNsdWRlcyhcImFyc3RlY2huaWNhXCIpKSBjb250ZXh0ID0gXCJUZWNobm9sb2d5XCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcInNjaWVuY2VcIikgfHwgdXJsLmluY2x1ZGVzKFwibmF0dXJlLmNvbVwiKSB8fCB1cmwuaW5jbHVkZXMoXCJuYXNhLmdvdlwiKSkgY29udGV4dCA9IFwiU2NpZW5jZVwiO1xuICBlbHNlIGlmICh1cmwuaW5jbHVkZXMoXCJ0d2l0Y2hcIikgfHwgdXJsLmluY2x1ZGVzKFwic3RlYW1cIikgfHwgdXJsLmluY2x1ZGVzKFwicm9ibG94XCIpIHx8IHVybC5pbmNsdWRlcyhcImlnblwiKSB8fCB1cmwuaW5jbHVkZXMoXCJnYW1lc3BvdFwiKSkgY29udGV4dCA9IFwiR2FtaW5nXCI7XG4gIGVsc2UgaWYgKHVybC5pbmNsdWRlcyhcInNvdW5kY2xvdWRcIikgfHwgdXJsLmluY2x1ZGVzKFwiYmFuZGNhbXBcIikgfHwgdXJsLmluY2x1ZGVzKFwibGFzdC5mbVwiKSkgY29udGV4dCA9IFwiTXVzaWNcIjtcbiAgZWxzZSBpZiAodXJsLmluY2x1ZGVzKFwiZGV2aWFudGFydFwiKSB8fCB1cmwuaW5jbHVkZXMoXCJiZWhhbmNlXCIpIHx8IHVybC5pbmNsdWRlcyhcImRyaWJiYmxlXCIpIHx8IHVybC5pbmNsdWRlcyhcImFydHN0YXRpb25cIikpIGNvbnRleHQgPSBcIkFydFwiO1xuXG4gIHJldHVybiB7IGNvbnRleHQsIHNvdXJjZTogJ0hldXJpc3RpYycgfTtcbn07XG4iLCAiaW1wb3J0IHsgQ3VzdG9tU3RyYXRlZ3ksIFNvcnRpbmdTdHJhdGVneSB9IGZyb20gXCIuL3R5cGVzLmpzXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RyYXRlZ3lEZWZpbml0aW9uIHtcbiAgICBpZDogU29ydGluZ1N0cmF0ZWd5IHwgc3RyaW5nO1xuICAgIGxhYmVsOiBzdHJpbmc7XG4gICAgaXNHcm91cGluZzogYm9vbGVhbjtcbiAgICBpc1NvcnRpbmc6IGJvb2xlYW47XG4gICAgdGFncz86IHN0cmluZ1tdO1xuICAgIGF1dG9SdW4/OiBib29sZWFuO1xuICAgIGlzQ3VzdG9tPzogYm9vbGVhbjtcbn1cblxuLy8gUmVzdG9yZWQgc3RyYXRlZ2llcyBtYXRjaGluZyBiYWNrZ3JvdW5kIGNhcGFiaWxpdGllcy5cbmV4cG9ydCBjb25zdCBTVFJBVEVHSUVTOiBTdHJhdGVneURlZmluaXRpb25bXSA9IFtcbiAgICB7IGlkOiBcImRvbWFpblwiLCBsYWJlbDogXCJEb21haW5cIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcImRvbWFpbl9mdWxsXCIsIGxhYmVsOiBcIkZ1bGwgRG9tYWluXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJ0b3BpY1wiLCBsYWJlbDogXCJUb3BpY1wiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwiY29udGV4dFwiLCBsYWJlbDogXCJDb250ZXh0XCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJsaW5lYWdlXCIsIGxhYmVsOiBcIkxpbmVhZ2VcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInBpbm5lZFwiLCBsYWJlbDogXCJQaW5uZWRcIiwgaXNHcm91cGluZzogdHJ1ZSwgaXNTb3J0aW5nOiB0cnVlLCB0YWdzOiBbXCJncm91cFwiLCBcInNvcnRcIl0gfSxcbiAgICB7IGlkOiBcInJlY2VuY3lcIiwgbGFiZWw6IFwiUmVjZW5jeVwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwiYWdlXCIsIGxhYmVsOiBcIkFnZVwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwidXJsXCIsIGxhYmVsOiBcIlVSTFwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuICAgIHsgaWQ6IFwibmVzdGluZ1wiLCBsYWJlbDogXCJOZXN0aW5nXCIsIGlzR3JvdXBpbmc6IHRydWUsIGlzU29ydGluZzogdHJ1ZSwgdGFnczogW1wiZ3JvdXBcIiwgXCJzb3J0XCJdIH0sXG4gICAgeyBpZDogXCJ0aXRsZVwiLCBsYWJlbDogXCJUaXRsZVwiLCBpc0dyb3VwaW5nOiB0cnVlLCBpc1NvcnRpbmc6IHRydWUsIHRhZ3M6IFtcImdyb3VwXCIsIFwic29ydFwiXSB9LFxuXTtcblxuZXhwb3J0IGNvbnN0IGdldFN0cmF0ZWdpZXMgPSAoY3VzdG9tU3RyYXRlZ2llcz86IEN1c3RvbVN0cmF0ZWd5W10pOiBTdHJhdGVneURlZmluaXRpb25bXSA9PiB7XG4gICAgaWYgKCFjdXN0b21TdHJhdGVnaWVzIHx8IGN1c3RvbVN0cmF0ZWdpZXMubGVuZ3RoID09PSAwKSByZXR1cm4gU1RSQVRFR0lFUztcblxuICAgIC8vIEN1c3RvbSBzdHJhdGVnaWVzIGNhbiBvdmVycmlkZSBidWlsdC1pbnMgaWYgSURzIG1hdGNoLCBvciBhZGQgbmV3IG9uZXMuXG4gICAgY29uc3QgY29tYmluZWQgPSBbLi4uU1RSQVRFR0lFU107XG5cbiAgICBjdXN0b21TdHJhdGVnaWVzLmZvckVhY2goY3VzdG9tID0+IHtcbiAgICAgICAgY29uc3QgZXhpc3RpbmdJbmRleCA9IGNvbWJpbmVkLmZpbmRJbmRleChzID0+IHMuaWQgPT09IGN1c3RvbS5pZCk7XG5cbiAgICAgICAgLy8gRGV0ZXJtaW5lIGNhcGFiaWxpdGllcyBiYXNlZCBvbiBydWxlcyBwcmVzZW5jZVxuICAgICAgICBjb25zdCBoYXNHcm91cGluZyA9IChjdXN0b20uZ3JvdXBpbmdSdWxlcyAmJiBjdXN0b20uZ3JvdXBpbmdSdWxlcy5sZW5ndGggPiAwKSB8fCAoY3VzdG9tLnJ1bGVzICYmIGN1c3RvbS5ydWxlcy5sZW5ndGggPiAwKSB8fCBmYWxzZTtcbiAgICAgICAgY29uc3QgaGFzU29ydGluZyA9IChjdXN0b20uc29ydGluZ1J1bGVzICYmIGN1c3RvbS5zb3J0aW5nUnVsZXMubGVuZ3RoID4gMCkgfHwgKGN1c3RvbS5ydWxlcyAmJiBjdXN0b20ucnVsZXMubGVuZ3RoID4gMCkgfHwgZmFsc2U7XG5cbiAgICAgICAgY29uc3QgdGFnczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgaWYgKGhhc0dyb3VwaW5nKSB0YWdzLnB1c2goXCJncm91cFwiKTtcbiAgICAgICAgaWYgKGhhc1NvcnRpbmcpIHRhZ3MucHVzaChcInNvcnRcIik7XG5cbiAgICAgICAgY29uc3QgZGVmaW5pdGlvbjogU3RyYXRlZ3lEZWZpbml0aW9uID0ge1xuICAgICAgICAgICAgaWQ6IGN1c3RvbS5pZCxcbiAgICAgICAgICAgIGxhYmVsOiBjdXN0b20ubGFiZWwsXG4gICAgICAgICAgICBpc0dyb3VwaW5nOiBoYXNHcm91cGluZyxcbiAgICAgICAgICAgIGlzU29ydGluZzogaGFzU29ydGluZyxcbiAgICAgICAgICAgIHRhZ3M6IHRhZ3MsXG4gICAgICAgICAgICBhdXRvUnVuOiBjdXN0b20uYXV0b1J1bixcbiAgICAgICAgICAgIGlzQ3VzdG9tOiB0cnVlXG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKGV4aXN0aW5nSW5kZXggIT09IC0xKSB7XG4gICAgICAgICAgICBjb21iaW5lZFtleGlzdGluZ0luZGV4XSA9IGRlZmluaXRpb247XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb21iaW5lZC5wdXNoKGRlZmluaXRpb24pO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gY29tYmluZWQ7XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0U3RyYXRlZ3kgPSAoaWQ6IFNvcnRpbmdTdHJhdGVneSB8IHN0cmluZyk6IFN0cmF0ZWd5RGVmaW5pdGlvbiB8IHVuZGVmaW5lZCA9PiBTVFJBVEVHSUVTLmZpbmQocyA9PiBzLmlkID09PSBpZCk7XG4iLCAiaW1wb3J0IHsgR3JvdXBpbmdTdHJhdGVneSwgU29ydGluZ1N0cmF0ZWd5LCBUYWJHcm91cCwgVGFiTWV0YWRhdGEsIEN1c3RvbVN0cmF0ZWd5LCBTdHJhdGVneVJ1bGUsIFJ1bGVDb25kaXRpb24sIEdyb3VwaW5nUnVsZSwgU29ydGluZ1J1bGUgfSBmcm9tIFwiLi4vc2hhcmVkL3R5cGVzLmpzXCI7XG5pbXBvcnQgeyBnZXRTdHJhdGVnaWVzIH0gZnJvbSBcIi4uL3NoYXJlZC9zdHJhdGVneVJlZ2lzdHJ5LmpzXCI7XG5pbXBvcnQgeyBsb2dEZWJ1ZyB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5pbXBvcnQgeyBhc0FycmF5IH0gZnJvbSBcIi4uL3NoYXJlZC91dGlscy5qc1wiO1xuXG5sZXQgY3VzdG9tU3RyYXRlZ2llczogQ3VzdG9tU3RyYXRlZ3lbXSA9IFtdO1xuXG5leHBvcnQgY29uc3Qgc2V0Q3VzdG9tU3RyYXRlZ2llcyA9IChzdHJhdGVnaWVzOiBDdXN0b21TdHJhdGVneVtdKSA9PiB7XG4gICAgY3VzdG9tU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXM7XG59O1xuXG5leHBvcnQgY29uc3QgZ2V0Q3VzdG9tU3RyYXRlZ2llcyA9ICgpOiBDdXN0b21TdHJhdGVneVtdID0+IGN1c3RvbVN0cmF0ZWdpZXM7XG5cbmNvbnN0IENPTE9SUyA9IFtcImdyZXlcIiwgXCJibHVlXCIsIFwicmVkXCIsIFwieWVsbG93XCIsIFwiZ3JlZW5cIiwgXCJwaW5rXCIsIFwicHVycGxlXCIsIFwiY3lhblwiLCBcIm9yYW5nZVwiXTtcblxuY29uc3QgcmVnZXhDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBSZWdFeHA+KCk7XG5jb25zdCBkb21haW5DYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5jb25zdCBzdWJkb21haW5DYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5jb25zdCBNQVhfQ0FDSEVfU0laRSA9IDEwMDA7XG5cbmV4cG9ydCBjb25zdCBkb21haW5Gcm9tVXJsID0gKHVybDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgaWYgKGRvbWFpbkNhY2hlLmhhcyh1cmwpKSByZXR1cm4gZG9tYWluQ2FjaGUuZ2V0KHVybCkhO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgcGFyc2VkID0gbmV3IFVSTCh1cmwpO1xuICAgIGNvbnN0IGRvbWFpbiA9IHBhcnNlZC5ob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgXCJcIik7XG5cbiAgICBpZiAoZG9tYWluQ2FjaGUuc2l6ZSA+PSBNQVhfQ0FDSEVfU0laRSkgZG9tYWluQ2FjaGUuY2xlYXIoKTtcbiAgICBkb21haW5DYWNoZS5zZXQodXJsLCBkb21haW4pO1xuXG4gICAgcmV0dXJuIGRvbWFpbjtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBsb2dEZWJ1ZyhcIkZhaWxlZCB0byBwYXJzZSBkb21haW5cIiwgeyB1cmwsIGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICAgIHJldHVybiBcInVua25vd25cIjtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IHN1YmRvbWFpbkZyb21VcmwgPSAodXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgIGlmIChzdWJkb21haW5DYWNoZS5oYXModXJsKSkgcmV0dXJuIHN1YmRvbWFpbkNhY2hlLmdldCh1cmwpITtcblxuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHBhcnNlZCA9IG5ldyBVUkwodXJsKTtcbiAgICAgICAgbGV0IGhvc3RuYW1lID0gcGFyc2VkLmhvc3RuYW1lO1xuICAgICAgICAvLyBSZW1vdmUgd3d3LlxuICAgICAgICBob3N0bmFtZSA9IGhvc3RuYW1lLnJlcGxhY2UoL153d3dcXC4vLCBcIlwiKTtcblxuICAgICAgICBsZXQgcmVzdWx0ID0gXCJcIjtcbiAgICAgICAgY29uc3QgcGFydHMgPSBob3N0bmFtZS5zcGxpdCgnLicpO1xuICAgICAgICBpZiAocGFydHMubGVuZ3RoID4gMikge1xuICAgICAgICAgICAgIHJlc3VsdCA9IHBhcnRzLnNsaWNlKDAsIHBhcnRzLmxlbmd0aCAtIDIpLmpvaW4oJy4nKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdWJkb21haW5DYWNoZS5zaXplID49IE1BWF9DQUNIRV9TSVpFKSBzdWJkb21haW5DYWNoZS5jbGVhcigpO1xuICAgICAgICBzdWJkb21haW5DYWNoZS5zZXQodXJsLCByZXN1bHQpO1xuXG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBcIlwiO1xuICAgIH1cbn1cblxuY29uc3QgZ2V0TmVzdGVkUHJvcGVydHkgPSAob2JqOiB1bmtub3duLCBwYXRoOiBzdHJpbmcpOiB1bmtub3duID0+IHtcbiAgICBpZiAoIW9iaiB8fCB0eXBlb2Ygb2JqICE9PSAnb2JqZWN0JykgcmV0dXJuIHVuZGVmaW5lZDtcblxuICAgIGlmICghcGF0aC5pbmNsdWRlcygnLicpKSB7XG4gICAgICAgIHJldHVybiAob2JqIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtwYXRoXTtcbiAgICB9XG5cbiAgICBjb25zdCBwYXJ0cyA9IHBhdGguc3BsaXQoJy4nKTtcbiAgICBsZXQgY3VycmVudDogdW5rbm93biA9IG9iajtcblxuICAgIGZvciAoY29uc3Qga2V5IG9mIHBhcnRzKSB7XG4gICAgICAgIGlmICghY3VycmVudCB8fCB0eXBlb2YgY3VycmVudCAhPT0gJ29iamVjdCcpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIGN1cnJlbnQgPSAoY3VycmVudCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilba2V5XTtcbiAgICB9XG5cbiAgICByZXR1cm4gY3VycmVudDtcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRGaWVsZFZhbHVlID0gKHRhYjogVGFiTWV0YWRhdGEsIGZpZWxkOiBzdHJpbmcpOiBhbnkgPT4ge1xuICAgIHN3aXRjaChmaWVsZCkge1xuICAgICAgICBjYXNlICdpZCc6IHJldHVybiB0YWIuaWQ7XG4gICAgICAgIGNhc2UgJ2luZGV4JzogcmV0dXJuIHRhYi5pbmRleDtcbiAgICAgICAgY2FzZSAnd2luZG93SWQnOiByZXR1cm4gdGFiLndpbmRvd0lkO1xuICAgICAgICBjYXNlICdncm91cElkJzogcmV0dXJuIHRhYi5ncm91cElkO1xuICAgICAgICBjYXNlICd0aXRsZSc6IHJldHVybiB0YWIudGl0bGU7XG4gICAgICAgIGNhc2UgJ3VybCc6IHJldHVybiB0YWIudXJsO1xuICAgICAgICBjYXNlICdzdGF0dXMnOiByZXR1cm4gdGFiLnN0YXR1cztcbiAgICAgICAgY2FzZSAnYWN0aXZlJzogcmV0dXJuIHRhYi5hY3RpdmU7XG4gICAgICAgIGNhc2UgJ3NlbGVjdGVkJzogcmV0dXJuIHRhYi5zZWxlY3RlZDtcbiAgICAgICAgY2FzZSAncGlubmVkJzogcmV0dXJuIHRhYi5waW5uZWQ7XG4gICAgICAgIGNhc2UgJ29wZW5lclRhYklkJzogcmV0dXJuIHRhYi5vcGVuZXJUYWJJZDtcbiAgICAgICAgY2FzZSAnbGFzdEFjY2Vzc2VkJzogcmV0dXJuIHRhYi5sYXN0QWNjZXNzZWQ7XG4gICAgICAgIGNhc2UgJ2NvbnRleHQnOiByZXR1cm4gdGFiLmNvbnRleHQ7XG4gICAgICAgIGNhc2UgJ2dlbnJlJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uZ2VucmU7XG4gICAgICAgIGNhc2UgJ3NpdGVOYW1lJzogcmV0dXJuIHRhYi5jb250ZXh0RGF0YT8uc2l0ZU5hbWU7XG4gICAgICAgIC8vIERlcml2ZWQgb3IgbWFwcGVkIGZpZWxkc1xuICAgICAgICBjYXNlICdkb21haW4nOiByZXR1cm4gZG9tYWluRnJvbVVybCh0YWIudXJsKTtcbiAgICAgICAgY2FzZSAnc3ViZG9tYWluJzogcmV0dXJuIHN1YmRvbWFpbkZyb21VcmwodGFiLnVybCk7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICByZXR1cm4gZ2V0TmVzdGVkUHJvcGVydHkodGFiLCBmaWVsZCk7XG4gICAgfVxufTtcblxuY29uc3Qgc3RyaXBUbGQgPSAoZG9tYWluOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gZG9tYWluLnJlcGxhY2UoL1xcLihjb218b3JnfGdvdnxuZXR8ZWR1fGlvKSQvaSwgXCJcIik7XG59O1xuXG5leHBvcnQgY29uc3Qgc2VtYW50aWNCdWNrZXQgPSAodGl0bGU6IHN0cmluZywgdXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBjb25zdCBrZXkgPSBgJHt0aXRsZX0gJHt1cmx9YC50b0xvd2VyQ2FzZSgpO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiZG9jXCIpIHx8IGtleS5pbmNsdWRlcyhcInJlYWRtZVwiKSB8fCBrZXkuaW5jbHVkZXMoXCJndWlkZVwiKSkgcmV0dXJuIFwiRG9jc1wiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwibWFpbFwiKSB8fCBrZXkuaW5jbHVkZXMoXCJpbmJveFwiKSkgcmV0dXJuIFwiQ2hhdFwiO1xuICBpZiAoa2V5LmluY2x1ZGVzKFwiZGFzaGJvYXJkXCIpIHx8IGtleS5pbmNsdWRlcyhcImNvbnNvbGVcIikpIHJldHVybiBcIkRhc2hcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImlzc3VlXCIpIHx8IGtleS5pbmNsdWRlcyhcInRpY2tldFwiKSkgcmV0dXJuIFwiVGFza3NcIjtcbiAgaWYgKGtleS5pbmNsdWRlcyhcImRyaXZlXCIpIHx8IGtleS5pbmNsdWRlcyhcInN0b3JhZ2VcIikpIHJldHVybiBcIkZpbGVzXCI7XG4gIHJldHVybiBcIk1pc2NcIjtcbn07XG5cbmV4cG9ydCBjb25zdCBuYXZpZ2F0aW9uS2V5ID0gKHRhYjogVGFiTWV0YWRhdGEpOiBzdHJpbmcgPT4ge1xuICBpZiAodGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gYGNoaWxkLW9mLSR7dGFiLm9wZW5lclRhYklkfWA7XG4gIH1cbiAgcmV0dXJuIGB3aW5kb3ctJHt0YWIud2luZG93SWR9YDtcbn07XG5cbmNvbnN0IGdldFJlY2VuY3lMYWJlbCA9IChsYXN0QWNjZXNzZWQ6IG51bWJlcik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gIGNvbnN0IGRpZmYgPSBub3cgLSBsYXN0QWNjZXNzZWQ7XG4gIGlmIChkaWZmIDwgMzYwMDAwMCkgcmV0dXJuIFwiSnVzdCBub3dcIjsgLy8gMWhcbiAgaWYgKGRpZmYgPCA4NjQwMDAwMCkgcmV0dXJuIFwiVG9kYXlcIjsgLy8gMjRoXG4gIGlmIChkaWZmIDwgMTcyODAwMDAwKSByZXR1cm4gXCJZZXN0ZXJkYXlcIjsgLy8gNDhoXG4gIGlmIChkaWZmIDwgNjA0ODAwMDAwKSByZXR1cm4gXCJUaGlzIFdlZWtcIjsgLy8gN2RcbiAgcmV0dXJuIFwiT2xkZXJcIjtcbn07XG5cbmNvbnN0IGNvbG9yRm9yS2V5ID0gKGtleTogc3RyaW5nLCBvZmZzZXQ6IG51bWJlcik6IHN0cmluZyA9PiBDT0xPUlNbKE1hdGguYWJzKGhhc2hDb2RlKGtleSkpICsgb2Zmc2V0KSAlIENPTE9SUy5sZW5ndGhdO1xuXG5jb25zdCBoYXNoQ29kZSA9ICh2YWx1ZTogc3RyaW5nKTogbnVtYmVyID0+IHtcbiAgbGV0IGhhc2ggPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHZhbHVlLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgaGFzaCA9IChoYXNoIDw8IDUpIC0gaGFzaCArIHZhbHVlLmNoYXJDb2RlQXQoaSk7XG4gICAgaGFzaCB8PSAwO1xuICB9XG4gIHJldHVybiBoYXNoO1xufTtcblxuLy8gSGVscGVyIHRvIGdldCBhIGh1bWFuLXJlYWRhYmxlIGxhYmVsIGNvbXBvbmVudCBmcm9tIGEgc3RyYXRlZ3kgYW5kIGEgc2V0IG9mIHRhYnNcbmNvbnN0IGdldExhYmVsQ29tcG9uZW50ID0gKHN0cmF0ZWd5OiBHcm91cGluZ1N0cmF0ZWd5IHwgc3RyaW5nLCB0YWJzOiBUYWJNZXRhZGF0YVtdLCBhbGxUYWJzTWFwOiBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YT4pOiBzdHJpbmcgfCBudWxsID0+IHtcbiAgY29uc3QgZmlyc3RUYWIgPSB0YWJzWzBdO1xuICBpZiAoIWZpcnN0VGFiKSByZXR1cm4gXCJVbmtub3duXCI7XG5cbiAgLy8gQ2hlY2sgY3VzdG9tIHN0cmF0ZWdpZXMgZmlyc3RcbiAgY29uc3QgY3VzdG9tID0gY3VzdG9tU3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3kpO1xuICBpZiAoY3VzdG9tKSB7XG4gICAgICByZXR1cm4gZ3JvdXBpbmdLZXkoZmlyc3RUYWIsIHN0cmF0ZWd5KTtcbiAgfVxuXG4gIHN3aXRjaCAoc3RyYXRlZ3kpIHtcbiAgICBjYXNlIFwiZG9tYWluXCI6IHtcbiAgICAgIGNvbnN0IHNpdGVOYW1lcyA9IG5ldyBTZXQodGFicy5tYXAodCA9PiB0LmNvbnRleHREYXRhPy5zaXRlTmFtZSkuZmlsdGVyKEJvb2xlYW4pKTtcbiAgICAgIGlmIChzaXRlTmFtZXMuc2l6ZSA9PT0gMSkge1xuICAgICAgICByZXR1cm4gc3RyaXBUbGQoQXJyYXkuZnJvbShzaXRlTmFtZXMpWzBdIGFzIHN0cmluZyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gc3RyaXBUbGQoZG9tYWluRnJvbVVybChmaXJzdFRhYi51cmwpKTtcbiAgICB9XG4gICAgY2FzZSBcImRvbWFpbl9mdWxsXCI6XG4gICAgICByZXR1cm4gZG9tYWluRnJvbVVybChmaXJzdFRhYi51cmwpO1xuICAgIGNhc2UgXCJ0b3BpY1wiOlxuICAgICAgcmV0dXJuIHNlbWFudGljQnVja2V0KGZpcnN0VGFiLnRpdGxlLCBmaXJzdFRhYi51cmwpO1xuICAgIGNhc2UgXCJsaW5lYWdlXCI6XG4gICAgICBpZiAoZmlyc3RUYWIub3BlbmVyVGFiSWQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBjb25zdCBwYXJlbnQgPSBhbGxUYWJzTWFwLmdldChmaXJzdFRhYi5vcGVuZXJUYWJJZCk7XG4gICAgICAgIGlmIChwYXJlbnQpIHtcbiAgICAgICAgICBjb25zdCBwYXJlbnRUaXRsZSA9IHBhcmVudC50aXRsZS5sZW5ndGggPiAyMCA/IHBhcmVudC50aXRsZS5zdWJzdHJpbmcoMCwgMjApICsgXCIuLi5cIiA6IHBhcmVudC50aXRsZTtcbiAgICAgICAgICByZXR1cm4gYEZyb206ICR7cGFyZW50VGl0bGV9YDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYEZyb206IFRhYiAke2ZpcnN0VGFiLm9wZW5lclRhYklkfWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gYFdpbmRvdyAke2ZpcnN0VGFiLndpbmRvd0lkfWA7XG4gICAgY2FzZSBcImNvbnRleHRcIjpcbiAgICAgIHJldHVybiBmaXJzdFRhYi5jb250ZXh0IHx8IFwiVW5jYXRlZ29yaXplZFwiO1xuICAgIGNhc2UgXCJwaW5uZWRcIjpcbiAgICAgIHJldHVybiBmaXJzdFRhYi5waW5uZWQgPyBcIlBpbm5lZFwiIDogXCJVbnBpbm5lZFwiO1xuICAgIGNhc2UgXCJhZ2VcIjpcbiAgICAgIHJldHVybiBnZXRSZWNlbmN5TGFiZWwoZmlyc3RUYWIubGFzdEFjY2Vzc2VkID8/IDApO1xuICAgIGNhc2UgXCJ1cmxcIjpcbiAgICAgIHJldHVybiBcIlVSTCBHcm91cFwiO1xuICAgIGNhc2UgXCJyZWNlbmN5XCI6XG4gICAgICByZXR1cm4gXCJUaW1lIEdyb3VwXCI7XG4gICAgY2FzZSBcIm5lc3RpbmdcIjpcbiAgICAgIHJldHVybiBmaXJzdFRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkID8gXCJDaGlsZHJlblwiIDogXCJSb290c1wiO1xuICAgIGRlZmF1bHQ6XG4gICAgICBjb25zdCB2YWwgPSBnZXRGaWVsZFZhbHVlKGZpcnN0VGFiLCBzdHJhdGVneSk7XG4gICAgICBpZiAodmFsICE9PSB1bmRlZmluZWQgJiYgdmFsICE9PSBudWxsKSB7XG4gICAgICAgICAgcmV0dXJuIFN0cmluZyh2YWwpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIFwiVW5rbm93blwiO1xuICB9XG59O1xuXG5jb25zdCBnZW5lcmF0ZUxhYmVsID0gKFxuICBzdHJhdGVnaWVzOiAoR3JvdXBpbmdTdHJhdGVneSB8IHN0cmluZylbXSxcbiAgdGFiczogVGFiTWV0YWRhdGFbXSxcbiAgYWxsVGFic01hcDogTWFwPG51bWJlciwgVGFiTWV0YWRhdGE+XG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBsYWJlbHMgPSBzdHJhdGVnaWVzXG4gICAgLm1hcChzID0+IGdldExhYmVsQ29tcG9uZW50KHMsIHRhYnMsIGFsbFRhYnNNYXApKVxuICAgIC5maWx0ZXIobCA9PiBsICYmIGwgIT09IFwiVW5rbm93blwiICYmIGwgIT09IFwiR3JvdXBcIiAmJiBsICE9PSBcIlVSTCBHcm91cFwiICYmIGwgIT09IFwiVGltZSBHcm91cFwiICYmIGwgIT09IFwiTWlzY1wiKTtcblxuICBpZiAobGFiZWxzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIFwiR3JvdXBcIjtcbiAgcmV0dXJuIEFycmF5LmZyb20obmV3IFNldChsYWJlbHMpKS5qb2luKFwiIC0gXCIpO1xufTtcblxuY29uc3QgZ2V0U3RyYXRlZ3lDb2xvclJ1bGUgPSAoc3RyYXRlZ3lJZDogc3RyaW5nKTogR3JvdXBpbmdSdWxlIHwgdW5kZWZpbmVkID0+IHtcbiAgICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneUlkKTtcbiAgICBpZiAoIWN1c3RvbSkgcmV0dXJuIHVuZGVmaW5lZDtcblxuICAgIGNvbnN0IGdyb3VwaW5nUnVsZXNMaXN0ID0gYXNBcnJheTxHcm91cGluZ1J1bGU+KGN1c3RvbS5ncm91cGluZ1J1bGVzKTtcbiAgICAvLyBJdGVyYXRlIG1hbnVhbGx5IHRvIGNoZWNrIGNvbG9yXG4gICAgZm9yIChsZXQgaSA9IGdyb3VwaW5nUnVsZXNMaXN0Lmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgIGNvbnN0IHJ1bGUgPSBncm91cGluZ1J1bGVzTGlzdFtpXTtcbiAgICAgICAgaWYgKHJ1bGUgJiYgcnVsZS5jb2xvciAmJiBydWxlLmNvbG9yICE9PSAncmFuZG9tJykge1xuICAgICAgICAgICAgcmV0dXJuIHJ1bGU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbn07XG5cbmNvbnN0IHJlc29sdmVXaW5kb3dNb2RlID0gKG1vZGVzOiAoc3RyaW5nIHwgdW5kZWZpbmVkKVtdKTogXCJjdXJyZW50XCIgfCBcIm5ld1wiIHwgXCJjb21wb3VuZFwiID0+IHtcbiAgICBpZiAobW9kZXMuaW5jbHVkZXMoXCJuZXdcIikpIHJldHVybiBcIm5ld1wiO1xuICAgIGlmIChtb2Rlcy5pbmNsdWRlcyhcImNvbXBvdW5kXCIpKSByZXR1cm4gXCJjb21wb3VuZFwiO1xuICAgIHJldHVybiBcImN1cnJlbnRcIjtcbn07XG5cbmV4cG9ydCBjb25zdCBncm91cFRhYnMgPSAoXG4gIHRhYnM6IFRhYk1ldGFkYXRhW10sXG4gIHN0cmF0ZWdpZXM6IChTb3J0aW5nU3RyYXRlZ3kgfCBzdHJpbmcpW11cbik6IFRhYkdyb3VwW10gPT4ge1xuICBjb25zdCBhdmFpbGFibGVTdHJhdGVnaWVzID0gZ2V0U3RyYXRlZ2llcyhjdXN0b21TdHJhdGVnaWVzKTtcbiAgY29uc3QgZWZmZWN0aXZlU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gYXZhaWxhYmxlU3RyYXRlZ2llcy5maW5kKGF2YWlsID0+IGF2YWlsLmlkID09PSBzKT8uaXNHcm91cGluZyk7XG4gIGNvbnN0IGJ1Y2tldHMgPSBuZXcgTWFwPHN0cmluZywgVGFiR3JvdXA+KCk7XG5cbiAgY29uc3QgYWxsVGFic01hcCA9IG5ldyBNYXA8bnVtYmVyLCBUYWJNZXRhZGF0YT4oKTtcbiAgdGFicy5mb3JFYWNoKHQgPT4gYWxsVGFic01hcC5zZXQodC5pZCwgdCkpO1xuXG4gIHRhYnMuZm9yRWFjaCgodGFiKSA9PiB7XG4gICAgbGV0IGtleXM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgYXBwbGllZFN0cmF0ZWdpZXM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgY29sbGVjdGVkTW9kZXM6IHN0cmluZ1tdID0gW107XG5cbiAgICB0cnkge1xuICAgICAgICBmb3IgKGNvbnN0IHMgb2YgZWZmZWN0aXZlU3RyYXRlZ2llcykge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gZ2V0R3JvdXBpbmdSZXN1bHQodGFiLCBzKTtcbiAgICAgICAgICAgIGlmIChyZXN1bHQua2V5ICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAga2V5cy5wdXNoKGAke3N9OiR7cmVzdWx0LmtleX1gKTtcbiAgICAgICAgICAgICAgICBhcHBsaWVkU3RyYXRlZ2llcy5wdXNoKHMpO1xuICAgICAgICAgICAgICAgIGNvbGxlY3RlZE1vZGVzLnB1c2gocmVzdWx0Lm1vZGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGdlbmVyYXRpbmcgZ3JvdXBpbmcga2V5XCIsIHsgdGFiSWQ6IHRhYi5pZCwgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgcmV0dXJuOyAvLyBTa2lwIHRoaXMgdGFiIG9uIGVycm9yXG4gICAgfVxuXG4gICAgLy8gSWYgbm8gc3RyYXRlZ2llcyBhcHBsaWVkIChlLmcuIGFsbCBmaWx0ZXJlZCBvdXQpLCBza2lwIGdyb3VwaW5nIGZvciB0aGlzIHRhYlxuICAgIGlmIChrZXlzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgZWZmZWN0aXZlTW9kZSA9IHJlc29sdmVXaW5kb3dNb2RlKGNvbGxlY3RlZE1vZGVzKTtcbiAgICBjb25zdCB2YWx1ZUtleSA9IGtleXMuam9pbihcIjo6XCIpO1xuICAgIGxldCBidWNrZXRLZXkgPSBcIlwiO1xuICAgIGlmIChlZmZlY3RpdmVNb2RlID09PSAnY3VycmVudCcpIHtcbiAgICAgICAgIGJ1Y2tldEtleSA9IGB3aW5kb3ctJHt0YWIud2luZG93SWR9OjpgICsgdmFsdWVLZXk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgIGJ1Y2tldEtleSA9IGBnbG9iYWw6OmAgKyB2YWx1ZUtleTtcbiAgICB9XG5cbiAgICBsZXQgZ3JvdXAgPSBidWNrZXRzLmdldChidWNrZXRLZXkpO1xuICAgIGlmICghZ3JvdXApIHtcbiAgICAgIGxldCBncm91cENvbG9yID0gbnVsbDtcbiAgICAgIGxldCBjb2xvckZpZWxkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICBsZXQgY29sb3JUcmFuc2Zvcm06IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgIGxldCBjb2xvclRyYW5zZm9ybVBhdHRlcm46IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICAgICAgZm9yIChjb25zdCBzSWQgb2YgYXBwbGllZFN0cmF0ZWdpZXMpIHtcbiAgICAgICAgY29uc3QgcnVsZSA9IGdldFN0cmF0ZWd5Q29sb3JSdWxlKHNJZCk7XG4gICAgICAgIGlmIChydWxlKSB7XG4gICAgICAgICAgICBncm91cENvbG9yID0gcnVsZS5jb2xvcjtcbiAgICAgICAgICAgIGNvbG9yRmllbGQgPSBydWxlLmNvbG9yRmllbGQ7XG4gICAgICAgICAgICBjb2xvclRyYW5zZm9ybSA9IHJ1bGUuY29sb3JUcmFuc2Zvcm07XG4gICAgICAgICAgICBjb2xvclRyYW5zZm9ybVBhdHRlcm4gPSBydWxlLmNvbG9yVHJhbnNmb3JtUGF0dGVybjtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChncm91cENvbG9yID09PSAnbWF0Y2gnKSB7XG4gICAgICAgIGdyb3VwQ29sb3IgPSBjb2xvckZvcktleSh2YWx1ZUtleSwgMCk7XG4gICAgICB9IGVsc2UgaWYgKGdyb3VwQ29sb3IgPT09ICdmaWVsZCcgJiYgY29sb3JGaWVsZCkge1xuICAgICAgICBjb25zdCB2YWwgPSBnZXRGaWVsZFZhbHVlKHRhYiwgY29sb3JGaWVsZCk7XG4gICAgICAgIGxldCBrZXkgPSB2YWwgIT09IHVuZGVmaW5lZCAmJiB2YWwgIT09IG51bGwgPyBTdHJpbmcodmFsKSA6IFwiXCI7XG4gICAgICAgIGlmIChjb2xvclRyYW5zZm9ybSkge1xuICAgICAgICAgICAga2V5ID0gYXBwbHlWYWx1ZVRyYW5zZm9ybShrZXksIGNvbG9yVHJhbnNmb3JtLCBjb2xvclRyYW5zZm9ybVBhdHRlcm4pO1xuICAgICAgICB9XG4gICAgICAgIGdyb3VwQ29sb3IgPSBjb2xvckZvcktleShrZXksIDApO1xuICAgICAgfSBlbHNlIGlmICghZ3JvdXBDb2xvciB8fCBncm91cENvbG9yID09PSAnZmllbGQnKSB7XG4gICAgICAgIGdyb3VwQ29sb3IgPSBjb2xvckZvcktleShidWNrZXRLZXksIGJ1Y2tldHMuc2l6ZSk7XG4gICAgICB9XG5cbiAgICAgIGdyb3VwID0ge1xuICAgICAgICBpZDogYnVja2V0S2V5LFxuICAgICAgICB3aW5kb3dJZDogdGFiLndpbmRvd0lkLFxuICAgICAgICBsYWJlbDogXCJcIixcbiAgICAgICAgY29sb3I6IGdyb3VwQ29sb3IsXG4gICAgICAgIHRhYnM6IFtdLFxuICAgICAgICByZWFzb246IGFwcGxpZWRTdHJhdGVnaWVzLmpvaW4oXCIgKyBcIiksXG4gICAgICAgIHdpbmRvd01vZGU6IGVmZmVjdGl2ZU1vZGVcbiAgICAgIH07XG4gICAgICBidWNrZXRzLnNldChidWNrZXRLZXksIGdyb3VwKTtcbiAgICB9XG4gICAgZ3JvdXAudGFicy5wdXNoKHRhYik7XG4gIH0pO1xuXG4gIGNvbnN0IGdyb3VwcyA9IEFycmF5LmZyb20oYnVja2V0cy52YWx1ZXMoKSk7XG4gIGdyb3Vwcy5mb3JFYWNoKGdyb3VwID0+IHtcbiAgICBncm91cC5sYWJlbCA9IGdlbmVyYXRlTGFiZWwoZWZmZWN0aXZlU3RyYXRlZ2llcywgZ3JvdXAudGFicywgYWxsVGFic01hcCk7XG4gIH0pO1xuXG4gIHJldHVybiBncm91cHM7XG59O1xuXG5jb25zdCBjaGVja1ZhbHVlTWF0Y2ggPSAoXG4gICAgb3BlcmF0b3I6IHN0cmluZyxcbiAgICByYXdWYWx1ZTogYW55LFxuICAgIHJ1bGVWYWx1ZTogc3RyaW5nXG4pOiB7IGlzTWF0Y2g6IGJvb2xlYW47IG1hdGNoT2JqOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsIH0gPT4ge1xuICAgIGNvbnN0IHZhbHVlU3RyID0gcmF3VmFsdWUgIT09IHVuZGVmaW5lZCAmJiByYXdWYWx1ZSAhPT0gbnVsbCA/IFN0cmluZyhyYXdWYWx1ZSkgOiBcIlwiO1xuICAgIGNvbnN0IHZhbHVlVG9DaGVjayA9IHZhbHVlU3RyLnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3QgcGF0dGVyblRvQ2hlY2sgPSBydWxlVmFsdWUgPyBydWxlVmFsdWUudG9Mb3dlckNhc2UoKSA6IFwiXCI7XG5cbiAgICBsZXQgaXNNYXRjaCA9IGZhbHNlO1xuICAgIGxldCBtYXRjaE9iajogUmVnRXhwRXhlY0FycmF5IHwgbnVsbCA9IG51bGw7XG5cbiAgICBzd2l0Y2ggKG9wZXJhdG9yKSB7XG4gICAgICAgIGNhc2UgJ2NvbnRhaW5zJzogaXNNYXRjaCA9IHZhbHVlVG9DaGVjay5pbmNsdWRlcyhwYXR0ZXJuVG9DaGVjayk7IGJyZWFrO1xuICAgICAgICBjYXNlICdkb2VzTm90Q29udGFpbic6IGlzTWF0Y2ggPSAhdmFsdWVUb0NoZWNrLmluY2x1ZGVzKHBhdHRlcm5Ub0NoZWNrKTsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2VxdWFscyc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2sgPT09IHBhdHRlcm5Ub0NoZWNrOyBicmVhaztcbiAgICAgICAgY2FzZSAnc3RhcnRzV2l0aCc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suc3RhcnRzV2l0aChwYXR0ZXJuVG9DaGVjayk7IGJyZWFrO1xuICAgICAgICBjYXNlICdlbmRzV2l0aCc6IGlzTWF0Y2ggPSB2YWx1ZVRvQ2hlY2suZW5kc1dpdGgocGF0dGVyblRvQ2hlY2spOyBicmVhaztcbiAgICAgICAgY2FzZSAnZXhpc3RzJzogaXNNYXRjaCA9IHJhd1ZhbHVlICE9PSB1bmRlZmluZWQ7IGJyZWFrO1xuICAgICAgICBjYXNlICdkb2VzTm90RXhpc3QnOiBpc01hdGNoID0gcmF3VmFsdWUgPT09IHVuZGVmaW5lZDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2lzTnVsbCc6IGlzTWF0Y2ggPSByYXdWYWx1ZSA9PT0gbnVsbDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2lzTm90TnVsbCc6IGlzTWF0Y2ggPSByYXdWYWx1ZSAhPT0gbnVsbDsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ21hdGNoZXMnOlxuICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKHJ1bGVWYWx1ZSwgJ2knKTtcbiAgICAgICAgICAgICAgICBtYXRjaE9iaiA9IHJlZ2V4LmV4ZWModmFsdWVTdHIpO1xuICAgICAgICAgICAgICAgIGlzTWF0Y2ggPSAhIW1hdGNoT2JqO1xuICAgICAgICAgICAgIH0gY2F0Y2ggeyB9XG4gICAgICAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHJldHVybiB7IGlzTWF0Y2gsIG1hdGNoT2JqIH07XG59O1xuXG5leHBvcnQgY29uc3QgY2hlY2tDb25kaXRpb24gPSAoY29uZGl0aW9uOiBSdWxlQ29uZGl0aW9uLCB0YWI6IFRhYk1ldGFkYXRhKTogYm9vbGVhbiA9PiB7XG4gICAgaWYgKCFjb25kaXRpb24pIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCByYXdWYWx1ZSA9IGdldEZpZWxkVmFsdWUodGFiLCBjb25kaXRpb24uZmllbGQpO1xuICAgIGNvbnN0IHsgaXNNYXRjaCB9ID0gY2hlY2tWYWx1ZU1hdGNoKGNvbmRpdGlvbi5vcGVyYXRvciwgcmF3VmFsdWUsIGNvbmRpdGlvbi52YWx1ZSk7XG4gICAgcmV0dXJuIGlzTWF0Y2g7XG59O1xuXG5leHBvcnQgY29uc3QgYXBwbHlWYWx1ZVRyYW5zZm9ybSA9ICh2YWw6IHN0cmluZywgdHJhbnNmb3JtOiBzdHJpbmcsIHBhdHRlcm4/OiBzdHJpbmcsIHJlcGxhY2VtZW50Pzogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICBpZiAoIXZhbCB8fCAhdHJhbnNmb3JtIHx8IHRyYW5zZm9ybSA9PT0gJ25vbmUnKSByZXR1cm4gdmFsO1xuXG4gICAgc3dpdGNoICh0cmFuc2Zvcm0pIHtcbiAgICAgICAgY2FzZSAnc3RyaXBUbGQnOlxuICAgICAgICAgICAgcmV0dXJuIHN0cmlwVGxkKHZhbCk7XG4gICAgICAgIGNhc2UgJ2xvd2VyY2FzZSc6XG4gICAgICAgICAgICByZXR1cm4gdmFsLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGNhc2UgJ3VwcGVyY2FzZSc6XG4gICAgICAgICAgICByZXR1cm4gdmFsLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgIGNhc2UgJ2ZpcnN0Q2hhcic6XG4gICAgICAgICAgICByZXR1cm4gdmFsLmNoYXJBdCgwKTtcbiAgICAgICAgY2FzZSAnZG9tYWluJzpcbiAgICAgICAgICAgIHJldHVybiBkb21haW5Gcm9tVXJsKHZhbCk7XG4gICAgICAgIGNhc2UgJ2hvc3RuYW1lJzpcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIHJldHVybiBuZXcgVVJMKHZhbCkuaG9zdG5hbWU7XG4gICAgICAgICAgICB9IGNhdGNoIHsgcmV0dXJuIHZhbDsgfVxuICAgICAgICBjYXNlICdyZWdleCc6XG4gICAgICAgICAgICBpZiAocGF0dGVybikge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCByZWdleCA9IHJlZ2V4Q2FjaGUuZ2V0KHBhdHRlcm4pO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXJlZ2V4KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWdleCA9IG5ldyBSZWdFeHAocGF0dGVybik7XG4gICAgICAgICAgICAgICAgICAgICAgICByZWdleENhY2hlLnNldChwYXR0ZXJuLCByZWdleCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbWF0Y2ggPSByZWdleC5leGVjKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGV4dHJhY3RlZCA9IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IG1hdGNoLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXh0cmFjdGVkICs9IG1hdGNoW2ldIHx8IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZXh0cmFjdGVkO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgIGxvZ0RlYnVnKFwiSW52YWxpZCByZWdleCBpbiB0cmFuc2Zvcm1cIiwgeyBwYXR0ZXJuOiBwYXR0ZXJuLCBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICAgICAgfVxuICAgICAgICBjYXNlICdyZWdleFJlcGxhY2UnOlxuICAgICAgICAgICAgIGlmIChwYXR0ZXJuKSB7XG4gICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAvLyBVc2luZyAnZycgZ2xvYmFsIGZsYWcgYnkgZGVmYXVsdCBmb3IgcmVwbGFjZW1lbnRcbiAgICAgICAgICAgICAgICAgICAgIHJldHVybiB2YWwucmVwbGFjZShuZXcgUmVnRXhwKHBhdHRlcm4sICdnJyksIHJlcGxhY2VtZW50IHx8IFwiXCIpO1xuICAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgICBsb2dEZWJ1ZyhcIkludmFsaWQgcmVnZXggaW4gdHJhbnNmb3JtXCIsIHsgcGF0dGVybjogcGF0dGVybiwgZXJyb3I6IFN0cmluZyhlKSB9KTtcbiAgICAgICAgICAgICAgICAgICAgIHJldHVybiB2YWw7XG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgcmV0dXJuIHZhbDtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHJldHVybiB2YWw7XG4gICAgfVxufTtcblxuZnVuY3Rpb24gZXZhbHVhdGVMZWdhY3lSdWxlcyhsZWdhY3lSdWxlczogU3RyYXRlZ3lSdWxlW10sIHRhYjogVGFiTWV0YWRhdGEpOiBzdHJpbmcgfCBudWxsIHtcbiAgICAvLyBEZWZlbnNpdmUgY2hlY2tcbiAgICBpZiAoIWxlZ2FjeVJ1bGVzIHx8ICFBcnJheS5pc0FycmF5KGxlZ2FjeVJ1bGVzKSkge1xuICAgICAgICBpZiAoIWxlZ2FjeVJ1bGVzKSByZXR1cm4gbnVsbDtcbiAgICAgICAgLy8gVHJ5IGFzQXJyYXkgaWYgaXQncyBub3QgYXJyYXkgYnV0IHRydXRoeSAodW5saWtlbHkgZ2l2ZW4gcHJldmlvdXMgbG9naWMgYnV0IHNhZmUpXG4gICAgfVxuXG4gICAgY29uc3QgbGVnYWN5UnVsZXNMaXN0ID0gYXNBcnJheTxTdHJhdGVneVJ1bGU+KGxlZ2FjeVJ1bGVzKTtcbiAgICBpZiAobGVnYWN5UnVsZXNMaXN0Lmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG5cbiAgICB0cnkge1xuICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgbGVnYWN5UnVsZXNMaXN0KSB7XG4gICAgICAgICAgICBpZiAoIXJ1bGUpIGNvbnRpbnVlO1xuICAgICAgICAgICAgY29uc3QgcmF3VmFsdWUgPSBnZXRGaWVsZFZhbHVlKHRhYiwgcnVsZS5maWVsZCk7XG4gICAgICAgICAgICBjb25zdCB7IGlzTWF0Y2gsIG1hdGNoT2JqIH0gPSBjaGVja1ZhbHVlTWF0Y2gocnVsZS5vcGVyYXRvciwgcmF3VmFsdWUsIHJ1bGUudmFsdWUpO1xuXG4gICAgICAgICAgICBpZiAoaXNNYXRjaCkge1xuICAgICAgICAgICAgICAgIGxldCByZXN1bHQgPSBydWxlLnJlc3VsdDtcbiAgICAgICAgICAgICAgICBpZiAobWF0Y2hPYmopIHtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBtYXRjaE9iai5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKG5ldyBSZWdFeHAoYFxcXFwkJHtpfWAsICdnJyksIG1hdGNoT2JqW2ldIHx8IFwiXCIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBsb2dEZWJ1ZyhcIkVycm9yIGV2YWx1YXRpbmcgbGVnYWN5IHJ1bGVzXCIsIHsgZXJyb3I6IFN0cmluZyhlcnJvcikgfSk7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgY29uc3QgZ2V0R3JvdXBpbmdSZXN1bHQgPSAodGFiOiBUYWJNZXRhZGF0YSwgc3RyYXRlZ3k6IEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcpOiB7IGtleTogc3RyaW5nIHwgbnVsbCwgbW9kZTogXCJjdXJyZW50XCIgfCBcIm5ld1wiIHwgXCJjb21wb3VuZFwiIH0gPT4ge1xuICBjb25zdCBjdXN0b20gPSBjdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdGVneSk7XG4gIGlmIChjdXN0b20pIHtcbiAgICAgIGNvbnN0IGZpbHRlckdyb3Vwc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb25bXT4oY3VzdG9tLmZpbHRlckdyb3Vwcyk7XG4gICAgICBjb25zdCBmaWx0ZXJzTGlzdCA9IGFzQXJyYXk8UnVsZUNvbmRpdGlvbj4oY3VzdG9tLmZpbHRlcnMpO1xuXG4gICAgICBsZXQgbWF0Y2ggPSBmYWxzZTtcblxuICAgICAgaWYgKGZpbHRlckdyb3Vwc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIC8vIE9SIGxvZ2ljXG4gICAgICAgICAgZm9yIChjb25zdCBncm91cCBvZiBmaWx0ZXJHcm91cHNMaXN0KSB7XG4gICAgICAgICAgICAgIGNvbnN0IGdyb3VwUnVsZXMgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGdyb3VwKTtcbiAgICAgICAgICAgICAgaWYgKGdyb3VwUnVsZXMubGVuZ3RoID09PSAwIHx8IGdyb3VwUnVsZXMuZXZlcnkociA9PiBjaGVja0NvbmRpdGlvbihyLCB0YWIpKSkge1xuICAgICAgICAgICAgICAgICAgbWF0Y2ggPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGZpbHRlcnNMaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAvLyBMZWdhY3kvU2ltcGxlIEFORCBsb2dpY1xuICAgICAgICAgIGlmIChmaWx0ZXJzTGlzdC5ldmVyeShmID0+IGNoZWNrQ29uZGl0aW9uKGYsIHRhYikpKSB7XG4gICAgICAgICAgICAgIG1hdGNoID0gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIE5vIGZpbHRlcnMgLT4gTWF0Y2ggYWxsXG4gICAgICAgICAgbWF0Y2ggPSB0cnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoIW1hdGNoKSB7XG4gICAgICAgICAgcmV0dXJuIHsga2V5OiBudWxsLCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICAgICAgfVxuXG4gICAgICBjb25zdCBncm91cGluZ1J1bGVzTGlzdCA9IGFzQXJyYXk8R3JvdXBpbmdSdWxlPihjdXN0b20uZ3JvdXBpbmdSdWxlcyk7XG4gICAgICBpZiAoZ3JvdXBpbmdSdWxlc0xpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgIGNvbnN0IG1vZGVzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2YgZ3JvdXBpbmdSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXJ1bGUpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIGxldCB2YWwgPSBcIlwiO1xuICAgICAgICAgICAgICAgIGlmIChydWxlLnNvdXJjZSA9PT0gJ2ZpZWxkJykge1xuICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmF3ID0gZ2V0RmllbGRWYWx1ZSh0YWIsIHJ1bGUudmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgdmFsID0gcmF3ICE9PSB1bmRlZmluZWQgJiYgcmF3ICE9PSBudWxsID8gU3RyaW5nKHJhdykgOiBcIlwiO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICB2YWwgPSBydWxlLnZhbHVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh2YWwgJiYgcnVsZS50cmFuc2Zvcm0gJiYgcnVsZS50cmFuc2Zvcm0gIT09ICdub25lJykge1xuICAgICAgICAgICAgICAgICAgICB2YWwgPSBhcHBseVZhbHVlVHJhbnNmb3JtKHZhbCwgcnVsZS50cmFuc2Zvcm0sIHJ1bGUudHJhbnNmb3JtUGF0dGVybiwgcnVsZS50cmFuc2Zvcm1SZXBsYWNlbWVudCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHZhbCkge1xuICAgICAgICAgICAgICAgICAgICBwYXJ0cy5wdXNoKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChydWxlLndpbmRvd01vZGUpIG1vZGVzLnB1c2gocnVsZS53aW5kb3dNb2RlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgIGxvZ0RlYnVnKFwiRXJyb3IgYXBwbHlpbmcgZ3JvdXBpbmcgcnVsZXNcIiwgeyBlcnJvcjogU3RyaW5nKGUpIH0pO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIHJldHVybiB7IGtleTogcGFydHMuam9pbihcIiAtIFwiKSwgbW9kZTogcmVzb2x2ZVdpbmRvd01vZGUobW9kZXMpIH07XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7IGtleTogY3VzdG9tLmZhbGxiYWNrIHx8IFwiTWlzY1wiLCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICAgICAgfSBlbHNlIGlmIChjdXN0b20ucnVsZXMpIHtcbiAgICAgICAgICBjb25zdCByZXN1bHQgPSBldmFsdWF0ZUxlZ2FjeVJ1bGVzKGFzQXJyYXk8U3RyYXRlZ3lSdWxlPihjdXN0b20ucnVsZXMpLCB0YWIpO1xuICAgICAgICAgIGlmIChyZXN1bHQpIHJldHVybiB7IGtleTogcmVzdWx0LCBtb2RlOiBcImN1cnJlbnRcIiB9O1xuICAgICAgfVxuXG4gICAgICByZXR1cm4geyBrZXk6IGN1c3RvbS5mYWxsYmFjayB8fCBcIk1pc2NcIiwgbW9kZTogXCJjdXJyZW50XCIgfTtcbiAgfVxuXG4gIC8vIEJ1aWx0LWluIHN0cmF0ZWdpZXNcbiAgbGV0IHNpbXBsZUtleTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIHN3aXRjaCAoc3RyYXRlZ3kpIHtcbiAgICBjYXNlIFwiZG9tYWluXCI6XG4gICAgY2FzZSBcImRvbWFpbl9mdWxsXCI6XG4gICAgICBzaW1wbGVLZXkgPSBkb21haW5Gcm9tVXJsKHRhYi51cmwpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInRvcGljXCI6XG4gICAgICBzaW1wbGVLZXkgPSBzZW1hbnRpY0J1Y2tldCh0YWIudGl0bGUsIHRhYi51cmwpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcImxpbmVhZ2VcIjpcbiAgICAgIHNpbXBsZUtleSA9IG5hdmlnYXRpb25LZXkodGFiKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJjb250ZXh0XCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIuY29udGV4dCB8fCBcIlVuY2F0ZWdvcml6ZWRcIjtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJwaW5uZWRcIjpcbiAgICAgIHNpbXBsZUtleSA9IHRhYi5waW5uZWQgPyBcInBpbm5lZFwiIDogXCJ1bnBpbm5lZFwiO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcImFnZVwiOlxuICAgICAgc2ltcGxlS2V5ID0gZ2V0UmVjZW5jeUxhYmVsKHRhYi5sYXN0QWNjZXNzZWQgPz8gMCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwidXJsXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIudXJsO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcInRpdGxlXCI6XG4gICAgICBzaW1wbGVLZXkgPSB0YWIudGl0bGU7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwicmVjZW5jeVwiOlxuICAgICAgc2ltcGxlS2V5ID0gU3RyaW5nKHRhYi5sYXN0QWNjZXNzZWQgPz8gMCk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFwibmVzdGluZ1wiOlxuICAgICAgc2ltcGxlS2V5ID0gdGFiLm9wZW5lclRhYklkICE9PSB1bmRlZmluZWQgPyBcImNoaWxkXCIgOiBcInJvb3RcIjtcbiAgICAgIGJyZWFrO1xuICAgIGRlZmF1bHQ6XG4gICAgICAgIGNvbnN0IHZhbCA9IGdldEZpZWxkVmFsdWUodGFiLCBzdHJhdGVneSk7XG4gICAgICAgIGlmICh2YWwgIT09IHVuZGVmaW5lZCAmJiB2YWwgIT09IG51bGwpIHtcbiAgICAgICAgICAgIHNpbXBsZUtleSA9IFN0cmluZyh2YWwpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2ltcGxlS2V5ID0gXCJVbmtub3duXCI7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gIH1cbiAgcmV0dXJuIHsga2V5OiBzaW1wbGVLZXksIG1vZGU6IFwiY3VycmVudFwiIH07XG59O1xuXG5leHBvcnQgY29uc3QgZ3JvdXBpbmdLZXkgPSAodGFiOiBUYWJNZXRhZGF0YSwgc3RyYXRlZ3k6IEdyb3VwaW5nU3RyYXRlZ3kgfCBzdHJpbmcpOiBzdHJpbmcgfCBudWxsID0+IHtcbiAgICByZXR1cm4gZ2V0R3JvdXBpbmdSZXN1bHQodGFiLCBzdHJhdGVneSkua2V5O1xufTtcblxuZnVuY3Rpb24gaXNDb250ZXh0RmllbGQoZmllbGQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBmaWVsZCA9PT0gJ2NvbnRleHQnIHx8IGZpZWxkID09PSAnZ2VucmUnIHx8IGZpZWxkID09PSAnc2l0ZU5hbWUnIHx8IGZpZWxkLnN0YXJ0c1dpdGgoJ2NvbnRleHREYXRhLicpO1xufVxuXG5leHBvcnQgY29uc3QgcmVxdWlyZXNDb250ZXh0QW5hbHlzaXMgPSAoc3RyYXRlZ3lJZHM6IChzdHJpbmcgfCBTb3J0aW5nU3RyYXRlZ3kpW10pOiBib29sZWFuID0+IHtcbiAgICAvLyBDaGVjayBpZiBcImNvbnRleHRcIiBzdHJhdGVneSBpcyBleHBsaWNpdGx5IHJlcXVlc3RlZFxuICAgIGlmIChzdHJhdGVneUlkcy5pbmNsdWRlcyhcImNvbnRleHRcIikpIHJldHVybiB0cnVlO1xuXG4gICAgY29uc3Qgc3RyYXRlZ2llcyA9IGdldFN0cmF0ZWdpZXMoY3VzdG9tU3RyYXRlZ2llcyk7XG4gICAgLy8gZmlsdGVyIG9ubHkgdGhvc2UgdGhhdCBtYXRjaCB0aGUgcmVxdWVzdGVkIElEc1xuICAgIGNvbnN0IGFjdGl2ZURlZnMgPSBzdHJhdGVnaWVzLmZpbHRlcihzID0+IHN0cmF0ZWd5SWRzLmluY2x1ZGVzKHMuaWQpKTtcblxuICAgIGZvciAoY29uc3QgZGVmIG9mIGFjdGl2ZURlZnMpIHtcbiAgICAgICAgLy8gSWYgaXQncyBhIGJ1aWx0LWluIHN0cmF0ZWd5IHRoYXQgbmVlZHMgY29udGV4dCAob25seSAnY29udGV4dCcgZG9lcylcbiAgICAgICAgaWYgKGRlZi5pZCA9PT0gJ2NvbnRleHQnKSByZXR1cm4gdHJ1ZTtcblxuICAgICAgICAvLyBJZiBpdCBpcyBhIGN1c3RvbSBzdHJhdGVneSAob3Igb3ZlcnJpZGVzIGJ1aWx0LWluKSwgY2hlY2sgaXRzIHJ1bGVzXG4gICAgICAgIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0ZWdpZXMuZmluZChjID0+IGMuaWQgPT09IGRlZi5pZCk7XG4gICAgICAgIGlmIChjdXN0b20pIHtcbiAgICAgICAgICAgICBjb25zdCBncm91cFJ1bGVzTGlzdCA9IGFzQXJyYXk8R3JvdXBpbmdSdWxlPihjdXN0b20uZ3JvdXBpbmdSdWxlcyk7XG4gICAgICAgICAgICAgY29uc3Qgc29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KGN1c3RvbS5zb3J0aW5nUnVsZXMpO1xuICAgICAgICAgICAgIGNvbnN0IGdyb3VwU29ydFJ1bGVzTGlzdCA9IGFzQXJyYXk8U29ydGluZ1J1bGU+KGN1c3RvbS5ncm91cFNvcnRpbmdSdWxlcyk7XG4gICAgICAgICAgICAgY29uc3QgZmlsdGVyc0xpc3QgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGN1c3RvbS5maWx0ZXJzKTtcbiAgICAgICAgICAgICBjb25zdCBmaWx0ZXJHcm91cHNMaXN0ID0gYXNBcnJheTxSdWxlQ29uZGl0aW9uW10+KGN1c3RvbS5maWx0ZXJHcm91cHMpO1xuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwUnVsZXNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGlmIChydWxlICYmIHJ1bGUuc291cmNlID09PSAnZmllbGQnICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUudmFsdWUpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgcnVsZS5jb2xvciA9PT0gJ2ZpZWxkJyAmJiBydWxlLmNvbG9yRmllbGQgJiYgaXNDb250ZXh0RmllbGQocnVsZS5jb2xvckZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIHNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBncm91cFNvcnRSdWxlc0xpc3QpIHtcbiAgICAgICAgICAgICAgICAgaWYgKHJ1bGUgJiYgaXNDb250ZXh0RmllbGQocnVsZS5maWVsZCkpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgIGZvciAoY29uc3QgcnVsZSBvZiBmaWx0ZXJzTGlzdCkge1xuICAgICAgICAgICAgICAgICBpZiAocnVsZSAmJiBpc0NvbnRleHRGaWVsZChydWxlLmZpZWxkKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgZm9yIChjb25zdCBncm91cCBvZiBmaWx0ZXJHcm91cHNMaXN0KSB7XG4gICAgICAgICAgICAgICAgIGNvbnN0IGdyb3VwUnVsZXMgPSBhc0FycmF5PFJ1bGVDb25kaXRpb24+KGdyb3VwKTtcbiAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBydWxlIG9mIGdyb3VwUnVsZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgIGlmIChydWxlICYmIGlzQ29udGV4dEZpZWxkKHJ1bGUuZmllbGQpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59O1xuIiwgImltcG9ydCB7IFNvcnRpbmdTdHJhdGVneSwgVGFiTWV0YWRhdGEsIEN1c3RvbVN0cmF0ZWd5LCBTb3J0aW5nUnVsZSB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGRvbWFpbkZyb21VcmwsIHNlbWFudGljQnVja2V0LCBuYXZpZ2F0aW9uS2V5LCBncm91cGluZ0tleSwgZ2V0RmllbGRWYWx1ZSwgZ2V0Q3VzdG9tU3RyYXRlZ2llcyB9IGZyb20gXCIuL2dyb3VwaW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgbG9nRGVidWcgfSBmcm9tIFwiLi4vc2hhcmVkL2xvZ2dlci5qc1wiO1xuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gXCIuLi9zaGFyZWQvdXRpbHMuanNcIjtcblxuZXhwb3J0IGNvbnN0IHJlY2VuY3lTY29yZSA9ICh0YWI6IFRhYk1ldGFkYXRhKSA9PiB0YWIubGFzdEFjY2Vzc2VkID8/IDA7XG5leHBvcnQgY29uc3QgaGllcmFyY2h5U2NvcmUgPSAodGFiOiBUYWJNZXRhZGF0YSkgPT4gKHRhYi5vcGVuZXJUYWJJZCAhPT0gdW5kZWZpbmVkID8gMSA6IDApO1xuZXhwb3J0IGNvbnN0IHBpbm5lZFNjb3JlID0gKHRhYjogVGFiTWV0YWRhdGEpID0+ICh0YWIucGlubmVkID8gMCA6IDEpO1xuXG5leHBvcnQgY29uc3Qgc29ydFRhYnMgPSAodGFiczogVGFiTWV0YWRhdGFbXSwgc3RyYXRlZ2llczogU29ydGluZ1N0cmF0ZWd5W10pOiBUYWJNZXRhZGF0YVtdID0+IHtcbiAgY29uc3Qgc2NvcmluZzogU29ydGluZ1N0cmF0ZWd5W10gPSBzdHJhdGVnaWVzLmxlbmd0aCA/IHN0cmF0ZWdpZXMgOiBbXCJwaW5uZWRcIiwgXCJyZWNlbmN5XCJdO1xuICByZXR1cm4gWy4uLnRhYnNdLnNvcnQoKGEsIGIpID0+IHtcbiAgICBmb3IgKGNvbnN0IHN0cmF0ZWd5IG9mIHNjb3JpbmcpIHtcbiAgICAgIGNvbnN0IGRpZmYgPSBjb21wYXJlQnkoc3RyYXRlZ3ksIGEsIGIpO1xuICAgICAgaWYgKGRpZmYgIT09IDApIHJldHVybiBkaWZmO1xuICAgIH1cbiAgICByZXR1cm4gYS5pZCAtIGIuaWQ7XG4gIH0pO1xufTtcblxuZXhwb3J0IGNvbnN0IGNvbXBhcmVCeSA9IChzdHJhdGVneTogU29ydGluZ1N0cmF0ZWd5IHwgc3RyaW5nLCBhOiBUYWJNZXRhZGF0YSwgYjogVGFiTWV0YWRhdGEpOiBudW1iZXIgPT4ge1xuICAvLyAxLiBDaGVjayBDdXN0b20gU3RyYXRlZ2llcyBmb3IgU29ydGluZyBSdWxlc1xuICBjb25zdCBjdXN0b21TdHJhdHMgPSBnZXRDdXN0b21TdHJhdGVnaWVzKCk7XG4gIGNvbnN0IGN1c3RvbSA9IGN1c3RvbVN0cmF0cy5maW5kKHMgPT4gcy5pZCA9PT0gc3RyYXRlZ3kpO1xuICBpZiAoY3VzdG9tKSB7XG4gICAgICBjb25zdCBzb3J0UnVsZXNMaXN0ID0gYXNBcnJheTxTb3J0aW5nUnVsZT4oY3VzdG9tLnNvcnRpbmdSdWxlcyk7XG4gICAgICBpZiAoc29ydFJ1bGVzTGlzdC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgLy8gRXZhbHVhdGUgY3VzdG9tIHNvcnRpbmcgcnVsZXMgaW4gb3JkZXJcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICBmb3IgKGNvbnN0IHJ1bGUgb2Ygc29ydFJ1bGVzTGlzdCkge1xuICAgICAgICAgICAgICAgICAgaWYgKCFydWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IHZhbEEgPSBnZXRGaWVsZFZhbHVlKGEsIHJ1bGUuZmllbGQpO1xuICAgICAgICAgICAgICAgICAgY29uc3QgdmFsQiA9IGdldEZpZWxkVmFsdWUoYiwgcnVsZS5maWVsZCk7XG5cbiAgICAgICAgICAgICAgICAgIGxldCByZXN1bHQgPSAwO1xuICAgICAgICAgICAgICAgICAgaWYgKHZhbEEgPCB2YWxCKSByZXN1bHQgPSAtMTtcbiAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKHZhbEEgPiB2YWxCKSByZXN1bHQgPSAxO1xuXG4gICAgICAgICAgICAgICAgICBpZiAocmVzdWx0ICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJ1bGUub3JkZXIgPT09ICdkZXNjJyA/IC1yZXN1bHQgOiByZXN1bHQ7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgIGxvZ0RlYnVnKFwiRXJyb3IgZXZhbHVhdGluZyBjdXN0b20gc29ydGluZyBydWxlc1wiLCB7IGVycm9yOiBTdHJpbmcoZSkgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIElmIGFsbCBydWxlcyBlcXVhbCwgY29udGludWUgdG8gbmV4dCBzdHJhdGVneSAocmV0dXJuIDApXG4gICAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9XG4gIH1cblxuICAvLyAyLiBCdWlsdC1pbiBvciBmYWxsYmFja1xuICBzd2l0Y2ggKHN0cmF0ZWd5KSB7XG4gICAgY2FzZSBcInJlY2VuY3lcIjpcbiAgICAgIHJldHVybiAoYi5sYXN0QWNjZXNzZWQgPz8gMCkgLSAoYS5sYXN0QWNjZXNzZWQgPz8gMCk7XG4gICAgY2FzZSBcIm5lc3RpbmdcIjogLy8gRm9ybWVybHkgaGllcmFyY2h5XG4gICAgICByZXR1cm4gaGllcmFyY2h5U2NvcmUoYSkgLSBoaWVyYXJjaHlTY29yZShiKTtcbiAgICBjYXNlIFwicGlubmVkXCI6XG4gICAgICByZXR1cm4gcGlubmVkU2NvcmUoYSkgLSBwaW5uZWRTY29yZShiKTtcbiAgICBjYXNlIFwidGl0bGVcIjpcbiAgICAgIHJldHVybiBhLnRpdGxlLmxvY2FsZUNvbXBhcmUoYi50aXRsZSk7XG4gICAgY2FzZSBcInVybFwiOlxuICAgICAgcmV0dXJuIGEudXJsLmxvY2FsZUNvbXBhcmUoYi51cmwpO1xuICAgIGNhc2UgXCJjb250ZXh0XCI6XG4gICAgICByZXR1cm4gKGEuY29udGV4dCA/PyBcIlwiKS5sb2NhbGVDb21wYXJlKGIuY29udGV4dCA/PyBcIlwiKTtcbiAgICBjYXNlIFwiZG9tYWluXCI6XG4gICAgY2FzZSBcImRvbWFpbl9mdWxsXCI6XG4gICAgICByZXR1cm4gZG9tYWluRnJvbVVybChhLnVybCkubG9jYWxlQ29tcGFyZShkb21haW5Gcm9tVXJsKGIudXJsKSk7XG4gICAgY2FzZSBcInRvcGljXCI6XG4gICAgICByZXR1cm4gc2VtYW50aWNCdWNrZXQoYS50aXRsZSwgYS51cmwpLmxvY2FsZUNvbXBhcmUoc2VtYW50aWNCdWNrZXQoYi50aXRsZSwgYi51cmwpKTtcbiAgICBjYXNlIFwibGluZWFnZVwiOlxuICAgICAgcmV0dXJuIG5hdmlnYXRpb25LZXkoYSkubG9jYWxlQ29tcGFyZShuYXZpZ2F0aW9uS2V5KGIpKTtcbiAgICBjYXNlIFwiYWdlXCI6XG4gICAgICAvLyBSZXZlcnNlIGFscGhhYmV0aWNhbCBmb3IgYWdlIGJ1Y2tldHMgKFRvZGF5IDwgWWVzdGVyZGF5KSwgcm91Z2ggYXBwcm94XG4gICAgICByZXR1cm4gKGdyb3VwaW5nS2V5KGEsIFwiYWdlXCIpIHx8IFwiXCIpLmxvY2FsZUNvbXBhcmUoZ3JvdXBpbmdLZXkoYiwgXCJhZ2VcIikgfHwgXCJcIik7XG4gICAgZGVmYXVsdDpcbiAgICAgIC8vIENoZWNrIGlmIGl0J3MgYSBnZW5lcmljIGZpZWxkIGZpcnN0XG4gICAgICBjb25zdCB2YWxBID0gZ2V0RmllbGRWYWx1ZShhLCBzdHJhdGVneSk7XG4gICAgICBjb25zdCB2YWxCID0gZ2V0RmllbGRWYWx1ZShiLCBzdHJhdGVneSk7XG5cbiAgICAgIGlmICh2YWxBICE9PSB1bmRlZmluZWQgJiYgdmFsQiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgaWYgKHZhbEEgPCB2YWxCKSByZXR1cm4gLTE7XG4gICAgICAgICAgaWYgKHZhbEEgPiB2YWxCKSByZXR1cm4gMTtcbiAgICAgICAgICByZXR1cm4gMDtcbiAgICAgIH1cblxuICAgICAgLy8gRmFsbGJhY2sgZm9yIGN1c3RvbSBzdHJhdGVnaWVzIGdyb3VwaW5nIGtleSAoaWYgdXNpbmcgY3VzdG9tIHN0cmF0ZWd5IGFzIHNvcnRpbmcgYnV0IG5vIHNvcnRpbmcgcnVsZXMgZGVmaW5lZClcbiAgICAgIC8vIG9yIHVuaGFuZGxlZCBidWlsdC1pbnNcbiAgICAgIHJldHVybiAoZ3JvdXBpbmdLZXkoYSwgc3RyYXRlZ3kpIHx8IFwiXCIpLmxvY2FsZUNvbXBhcmUoZ3JvdXBpbmdLZXkoYiwgc3RyYXRlZ3kpIHx8IFwiXCIpO1xuICB9XG59O1xuIiwgImltcG9ydCB7XG4gIEFwcGx5R3JvdXBpbmdQYXlsb2FkLFxuICBHcm91cGluZ1NlbGVjdGlvbixcbiAgUHJlZmVyZW5jZXMsXG4gIFJ1bnRpbWVNZXNzYWdlLFxuICBSdW50aW1lUmVzcG9uc2UsXG4gIFNhdmVkU3RhdGUsXG4gIFNvcnRpbmdTdHJhdGVneSxcbiAgVGFiR3JvdXAsXG4gIFRhYk1ldGFkYXRhXG59IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IGZldGNoTG9jYWxTdGF0ZSB9IGZyb20gXCIuL2xvY2FsU3RhdGUuanNcIjtcblxuZXhwb3J0IGNvbnN0IHNlbmRNZXNzYWdlID0gYXN5bmMgPFREYXRhPih0eXBlOiBSdW50aW1lTWVzc2FnZVtcInR5cGVcIl0sIHBheWxvYWQ/OiBhbnkpOiBQcm9taXNlPFJ1bnRpbWVSZXNwb25zZTxURGF0YT4+ID0+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlLCBwYXlsb2FkIH0sIChyZXNwb25zZSkgPT4ge1xuICAgICAgaWYgKGNocm9tZS5ydW50aW1lLmxhc3RFcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiUnVudGltZSBlcnJvcjpcIiwgY2hyb21lLnJ1bnRpbWUubGFzdEVycm9yKTtcbiAgICAgICAgcmVzb2x2ZSh7IG9rOiBmYWxzZSwgZXJyb3I6IGNocm9tZS5ydW50aW1lLmxhc3RFcnJvci5tZXNzYWdlIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzb2x2ZShyZXNwb25zZSB8fCB7IG9rOiBmYWxzZSwgZXJyb3I6IFwiTm8gcmVzcG9uc2UgZnJvbSBiYWNrZ3JvdW5kXCIgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0pO1xufTtcblxuZXhwb3J0IHR5cGUgVGFiV2l0aEdyb3VwID0gVGFiTWV0YWRhdGEgJiB7XG4gIGdyb3VwTGFiZWw/OiBzdHJpbmc7XG4gIGdyb3VwQ29sb3I/OiBzdHJpbmc7XG4gIHJlYXNvbj86IHN0cmluZztcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgV2luZG93VmlldyB7XG4gIGlkOiBudW1iZXI7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIHRhYnM6IFRhYldpdGhHcm91cFtdO1xuICB0YWJDb3VudDogbnVtYmVyO1xuICBncm91cENvdW50OiBudW1iZXI7XG4gIHBpbm5lZENvdW50OiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBJQ09OUyA9IHtcbiAgYWN0aXZlOiBgPHN2ZyB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBvbHlnb24gcG9pbnRzPVwiMyAxMSAyMiAyIDEzIDIxIDExIDEzIDMgMTFcIj48L3BvbHlnb24+PC9zdmc+YCxcbiAgaGlkZTogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwYXRoIGQ9XCJNMTcuOTQgMTcuOTRBMTAuMDcgMTAuMDcgMCAwIDEgMTIgMjBjLTcgMC0xMS04LTExLThhMTguNDUgMTguNDUgMCAwIDEgNS4wNi01Ljk0TTkuOSA0LjI0QTkuMTIgOS4xMiAwIDAgMSAxMiA0YzcgMCAxMSA4IDExIDhhMTguNSAxOC41IDAgMCAxLTIuMTYgMy4xOW0tNi43Mi0xLjA3YTMgMyAwIDEgMS00LjI0LTQuMjRcIj48L3BhdGg+PGxpbmUgeDE9XCIxXCIgeTE9XCIxXCIgeDI9XCIyM1wiIHkyPVwiMjNcIj48L2xpbmU+PC9zdmc+YCxcbiAgc2hvdzogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwYXRoIGQ9XCJNMSAxMnM0LTggMTEtOCAxMSA4IDExIDgtNCA4LTExIDgtMTEtOC0xMS04LTExLTh6XCI+PC9wYXRoPjxjaXJjbGUgY3g9XCIxMlwiIGN5PVwiMTJcIiByPVwiM1wiPjwvY2lyY2xlPjwvc3ZnPmAsXG4gIGZvY3VzOiBgPHN2ZyB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PGNpcmNsZSBjeD1cIjEyXCIgY3k9XCIxMlwiIHI9XCIxMFwiPjwvY2lyY2xlPjxjaXJjbGUgY3g9XCIxMlwiIGN5PVwiMTJcIiByPVwiNlwiPjwvY2lyY2xlPjxjaXJjbGUgY3g9XCIxMlwiIGN5PVwiMTJcIiByPVwiMlwiPjwvY2lyY2xlPjwvc3ZnPmAsXG4gIGNsb3NlOiBgPHN2ZyB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PGxpbmUgeDE9XCIxOFwiIHkxPVwiNlwiIHgyPVwiNlwiIHkyPVwiMThcIj48L2xpbmU+PGxpbmUgeDE9XCI2XCIgeTE9XCI2XCIgeDI9XCIxOFwiIHkyPVwiMThcIj48L2xpbmU+PC9zdmc+YCxcbiAgdW5ncm91cDogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxjaXJjbGUgY3g9XCIxMlwiIGN5PVwiMTJcIiByPVwiMTBcIj48L2NpcmNsZT48bGluZSB4MT1cIjhcIiB5MT1cIjEyXCIgeDI9XCIxNlwiIHkyPVwiMTJcIj48L2xpbmU+PC9zdmc+YCxcbiAgZGVmYXVsdEZpbGU6IGA8c3ZnIHdpZHRoPVwiMjRcIiBoZWlnaHQ9XCIyNFwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cGF0aCBkPVwiTTE0IDJINmEyIDIgMCAwIDAtMiAydjE2YTIgMiAwIDAgMCAyIDJoMTJhMiAyIDAgMCAwIDItMlY4elwiPjwvcGF0aD48cG9seWxpbmUgcG9pbnRzPVwiMTQgMiAxNCA4IDIwIDhcIj48L3BvbHlsaW5lPjxsaW5lIHgxPVwiMTZcIiB5MT1cIjEzXCIgeDI9XCI4XCIgeTI9XCIxM1wiPjwvbGluZT48bGluZSB4MT1cIjE2XCIgeTE9XCIxN1wiIHgyPVwiOFwiIHkyPVwiMTdcIj48L2xpbmU+PHBvbHlsaW5lIHBvaW50cz1cIjEwIDkgOSA5IDggOVwiPjwvcG9seWxpbmU+PC9zdmc+YCxcbiAgYXV0b1J1bjogYDxzdmcgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwb2x5Z29uIHBvaW50cz1cIjEzIDIgMyAxNCAxMiAxNCAxMSAyMiAyMSAxMCAxMiAxMCAxMyAyXCI+PC9wb2x5Z29uPjwvc3ZnPmBcbn07XG5cbmV4cG9ydCBjb25zdCBHUk9VUF9DT0xPUlM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gIGdyZXk6IFwiIzY0NzQ4YlwiLFxuICBibHVlOiBcIiMzYjgyZjZcIixcbiAgcmVkOiBcIiNlZjQ0NDRcIixcbiAgeWVsbG93OiBcIiNlYWIzMDhcIixcbiAgZ3JlZW46IFwiIzIyYzU1ZVwiLFxuICBwaW5rOiBcIiNlYzQ4OTlcIixcbiAgcHVycGxlOiBcIiNhODU1ZjdcIixcbiAgY3lhbjogXCIjMDZiNmQ0XCIsXG4gIG9yYW5nZTogXCIjZjk3MzE2XCJcbn07XG5cbmV4cG9ydCBjb25zdCBnZXRHcm91cENvbG9yID0gKG5hbWU6IHN0cmluZykgPT4gR1JPVVBfQ09MT1JTW25hbWVdIHx8IFwiI2NiZDVlMVwiO1xuXG5leHBvcnQgY29uc3QgZmV0Y2hTdGF0ZSA9IGFzeW5jICgpID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHNlbmRNZXNzYWdlPHsgZ3JvdXBzOiBUYWJHcm91cFtdOyBwcmVmZXJlbmNlczogUHJlZmVyZW5jZXMgfT4oXCJnZXRTdGF0ZVwiKTtcbiAgICBpZiAocmVzcG9uc2Uub2sgJiYgcmVzcG9uc2UuZGF0YSkge1xuICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgIH1cbiAgICBjb25zb2xlLndhcm4oXCJmZXRjaFN0YXRlIGZhaWxlZCwgdXNpbmcgZmFsbGJhY2s6XCIsIHJlc3BvbnNlLmVycm9yKTtcbiAgICByZXR1cm4gYXdhaXQgZmV0Y2hMb2NhbFN0YXRlKCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBjb25zb2xlLndhcm4oXCJmZXRjaFN0YXRlIHRocmV3IGV4Y2VwdGlvbiwgdXNpbmcgZmFsbGJhY2s6XCIsIGUpO1xuICAgIHJldHVybiBhd2FpdCBmZXRjaExvY2FsU3RhdGUoKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGFwcGx5R3JvdXBpbmcgPSBhc3luYyAocGF5bG9hZDogQXBwbHlHcm91cGluZ1BheWxvYWQpID0+IHtcbiAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6IFwiYXBwbHlHcm91cGluZ1wiLCBwYXlsb2FkIH0pO1xuICByZXR1cm4gcmVzcG9uc2UgYXMgUnVudGltZVJlc3BvbnNlPHVua25vd24+O1xufTtcblxuZXhwb3J0IGNvbnN0IGFwcGx5U29ydGluZyA9IGFzeW5jIChwYXlsb2FkOiBBcHBseUdyb3VwaW5nUGF5bG9hZCkgPT4ge1xuICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogXCJhcHBseVNvcnRpbmdcIiwgcGF5bG9hZCB9KTtcbiAgcmV0dXJuIHJlc3BvbnNlIGFzIFJ1bnRpbWVSZXNwb25zZTx1bmtub3duPjtcbn07XG5cbmV4cG9ydCBjb25zdCBtYXBXaW5kb3dzID0gKGdyb3VwczogVGFiR3JvdXBbXSwgd2luZG93VGl0bGVzOiBNYXA8bnVtYmVyLCBzdHJpbmc+KTogV2luZG93Vmlld1tdID0+IHtcbiAgY29uc3Qgd2luZG93cyA9IG5ldyBNYXA8bnVtYmVyLCBUYWJXaXRoR3JvdXBbXT4oKTtcblxuICBncm91cHMuZm9yRWFjaCgoZ3JvdXApID0+IHtcbiAgICBjb25zdCBpc1VuZ3JvdXBlZCA9IGdyb3VwLnJlYXNvbiA9PT0gXCJVbmdyb3VwZWRcIjtcbiAgICBncm91cC50YWJzLmZvckVhY2goKHRhYikgPT4ge1xuICAgICAgY29uc3QgZGVjb3JhdGVkOiBUYWJXaXRoR3JvdXAgPSB7XG4gICAgICAgIC4uLnRhYixcbiAgICAgICAgZ3JvdXBMYWJlbDogaXNVbmdyb3VwZWQgPyB1bmRlZmluZWQgOiBncm91cC5sYWJlbCxcbiAgICAgICAgZ3JvdXBDb2xvcjogaXNVbmdyb3VwZWQgPyB1bmRlZmluZWQgOiBncm91cC5jb2xvcixcbiAgICAgICAgcmVhc29uOiBncm91cC5yZWFzb25cbiAgICAgIH07XG4gICAgICBjb25zdCBleGlzdGluZyA9IHdpbmRvd3MuZ2V0KHRhYi53aW5kb3dJZCkgPz8gW107XG4gICAgICBleGlzdGluZy5wdXNoKGRlY29yYXRlZCk7XG4gICAgICB3aW5kb3dzLnNldCh0YWIud2luZG93SWQsIGV4aXN0aW5nKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgcmV0dXJuIEFycmF5LmZyb20od2luZG93cy5lbnRyaWVzKCkpXG4gICAgLm1hcDxXaW5kb3dWaWV3PigoW2lkLCB0YWJzXSkgPT4ge1xuICAgICAgY29uc3QgZ3JvdXBDb3VudCA9IG5ldyBTZXQodGFicy5tYXAoKHRhYikgPT4gdGFiLmdyb3VwTGFiZWwpLmZpbHRlcigobCk6IGwgaXMgc3RyaW5nID0+ICEhbCkpLnNpemU7XG4gICAgICBjb25zdCBwaW5uZWRDb3VudCA9IHRhYnMuZmlsdGVyKCh0YWIpID0+IHRhYi5waW5uZWQpLmxlbmd0aDtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGlkLFxuICAgICAgICB0aXRsZTogd2luZG93VGl0bGVzLmdldChpZCkgPz8gYFdpbmRvdyAke2lkfWAsXG4gICAgICAgIHRhYnMsXG4gICAgICAgIHRhYkNvdW50OiB0YWJzLmxlbmd0aCxcbiAgICAgICAgZ3JvdXBDb3VudCxcbiAgICAgICAgcGlubmVkQ291bnRcbiAgICAgIH07XG4gICAgfSlcbiAgICAuc29ydCgoYSwgYikgPT4gYS5pZCAtIGIuaWQpO1xufTtcblxuZXhwb3J0IGNvbnN0IGZvcm1hdERvbWFpbiA9ICh1cmw6IHN0cmluZykgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHBhcnNlZCA9IG5ldyBVUkwodXJsKTtcbiAgICByZXR1cm4gcGFyc2VkLmhvc3RuYW1lLnJlcGxhY2UoL153d3dcXC4vLCBcIlwiKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICByZXR1cm4gdXJsO1xuICB9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RHJhZ0FmdGVyRWxlbWVudChjb250YWluZXI6IEhUTUxFbGVtZW50LCB5OiBudW1iZXIsIHNlbGVjdG9yOiBzdHJpbmcpIHtcbiAgY29uc3QgZHJhZ2dhYmxlRWxlbWVudHMgPSBBcnJheS5mcm9tKGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKSk7XG5cbiAgcmV0dXJuIGRyYWdnYWJsZUVsZW1lbnRzLnJlZHVjZSgoY2xvc2VzdCwgY2hpbGQpID0+IHtcbiAgICBjb25zdCBib3ggPSBjaGlsZC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICBjb25zdCBvZmZzZXQgPSB5IC0gYm94LnRvcCAtIGJveC5oZWlnaHQgLyAyO1xuICAgIGlmIChvZmZzZXQgPCAwICYmIG9mZnNldCA+IGNsb3Nlc3Qub2Zmc2V0KSB7XG4gICAgICByZXR1cm4geyBvZmZzZXQ6IG9mZnNldCwgZWxlbWVudDogY2hpbGQgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGNsb3Nlc3Q7XG4gICAgfVxuICB9LCB7IG9mZnNldDogTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZLCBlbGVtZW50OiBudWxsIGFzIEVsZW1lbnQgfCBudWxsIH0pLmVsZW1lbnQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXR1cERyYWdnYWJsZUl0ZW0oXG4gIHJvdzogSFRNTEVsZW1lbnQsXG4gIG9uRHJhZ0VuZD86IChyb3c6IEhUTUxFbGVtZW50KSA9PiB2b2lkXG4pIHtcbiAgcm93LnNldEF0dHJpYnV0ZSgnZHJhZ2dhYmxlJywgJ3RydWUnKTtcbiAgcm93LmFkZEV2ZW50TGlzdGVuZXIoJ2RyYWdzdGFydCcsIChlKSA9PiB7XG4gICAgcm93LmNsYXNzTGlzdC5hZGQoJ2RyYWdnaW5nJyk7XG4gICAgaWYgKGUuZGF0YVRyYW5zZmVyKSB7XG4gICAgICAgIGUuZGF0YVRyYW5zZmVyLmVmZmVjdEFsbG93ZWQgPSAnbW92ZSc7XG4gICAgfVxuICB9KTtcblxuICByb3cuYWRkRXZlbnRMaXN0ZW5lcignZHJhZ2VuZCcsICgpID0+IHtcbiAgICByb3cuY2xhc3NMaXN0LnJlbW92ZSgnZHJhZ2dpbmcnKTtcbiAgICBpZiAob25EcmFnRW5kKSBvbkRyYWdFbmQocm93KTtcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXR1cERyb3Bab25lKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGl0ZW1TZWxlY3Rvcjogc3RyaW5nKSB7XG4gIGNvbnRhaW5lci5hZGRFdmVudExpc3RlbmVyKCdkcmFnb3ZlcicsIChlKSA9PiB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGNvbnN0IGFmdGVyRWxlbWVudCA9IGdldERyYWdBZnRlckVsZW1lbnQoY29udGFpbmVyLCBlLmNsaWVudFksIGAke2l0ZW1TZWxlY3Rvcn06bm90KC5kcmFnZ2luZylgKTtcbiAgICBjb25zdCBkcmFnZ2FibGUgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcignLmRyYWdnaW5nJyk7XG4gICAgaWYgKGRyYWdnYWJsZSkge1xuICAgICAgaWYgKGFmdGVyRWxlbWVudCA9PSBudWxsKSB7XG4gICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChkcmFnZ2FibGUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29udGFpbmVyLmluc2VydEJlZm9yZShkcmFnZ2FibGUsIGFmdGVyRWxlbWVudCk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbn1cbiIsICJpbXBvcnQgeyBhbmFseXplVGFiQ29udGV4dCwgQ29udGV4dFJlc3VsdCB9IGZyb20gXCIuLi9iYWNrZ3JvdW5kL2NvbnRleHRBbmFseXNpcy5qc1wiO1xuaW1wb3J0IHtcbiAgZ3JvdXBUYWJzLFxuICBkb21haW5Gcm9tVXJsLFxuICBzZW1hbnRpY0J1Y2tldCxcbiAgbmF2aWdhdGlvbktleSxcbiAgZ3JvdXBpbmdLZXlcbn0gZnJvbSBcIi4uL2JhY2tncm91bmQvZ3JvdXBpbmdTdHJhdGVnaWVzLmpzXCI7XG5pbXBvcnQgeyBHRU5FUkFfUkVHSVNUUlkgfSBmcm9tIFwiLi4vYmFja2dyb3VuZC9leHRyYWN0aW9uL2dlbmVyYVJlZ2lzdHJ5LmpzXCI7XG5pbXBvcnQge1xuICBzb3J0VGFicyxcbiAgcmVjZW5jeVNjb3JlLFxuICBoaWVyYXJjaHlTY29yZSxcbiAgcGlubmVkU2NvcmUsXG4gIGNvbXBhcmVCeVxufSBmcm9tIFwiLi4vYmFja2dyb3VuZC9zb3J0aW5nU3RyYXRlZ2llcy5qc1wiO1xuaW1wb3J0IHsgbWFwQ2hyb21lVGFiIH0gZnJvbSBcIi4uL3NoYXJlZC91dGlscy5qc1wiO1xuaW1wb3J0IHsgZ2V0RHJhZ0FmdGVyRWxlbWVudCwgc2V0dXBEcmFnZ2FibGVJdGVtLCBzZXR1cERyb3Bab25lIH0gZnJvbSBcIi4vY29tbW9uLmpzXCI7XG5pbXBvcnQgeyBzZXRDdXN0b21TdHJhdGVnaWVzIH0gZnJvbSBcIi4uL2JhY2tncm91bmQvZ3JvdXBpbmdTdHJhdGVnaWVzLmpzXCI7XG5pbXBvcnQgeyBHcm91cGluZ1N0cmF0ZWd5LCBQcmVmZXJlbmNlcywgU29ydGluZ1N0cmF0ZWd5LCBUYWJNZXRhZGF0YSwgVGFiR3JvdXAsIEN1c3RvbVN0cmF0ZWd5LCBTdHJhdGVneVJ1bGUsIFJ1bGVDb25kaXRpb24sIEdyb3VwaW5nUnVsZSwgU29ydGluZ1J1bGUsIExvZ0VudHJ5LCBMb2dMZXZlbCB9IGZyb20gXCIuLi9zaGFyZWQvdHlwZXMuanNcIjtcbmltcG9ydCB7IFNUUkFURUdJRVMsIFN0cmF0ZWd5RGVmaW5pdGlvbiwgZ2V0U3RyYXRlZ2llcyB9IGZyb20gXCIuLi9zaGFyZWQvc3RyYXRlZ3lSZWdpc3RyeS5qc1wiO1xuaW1wb3J0IHsgbG9nSW5mbyB9IGZyb20gXCIuLi9zaGFyZWQvbG9nZ2VyLmpzXCI7XG5cbi8vIFR5cGVzXG5pbnRlcmZhY2UgQ29sdW1uRGVmaW5pdGlvbiB7XG4gICAga2V5OiBzdHJpbmc7XG4gICAgbGFiZWw6IHN0cmluZztcbiAgICB2aXNpYmxlOiBib29sZWFuO1xuICAgIHdpZHRoOiBzdHJpbmc7IC8vIENTUyB3aWR0aFxuICAgIGZpbHRlcmFibGU6IGJvb2xlYW47XG59XG5cbi8vIFN0YXRlXG5sZXQgY3VycmVudFRhYnM6IGNocm9tZS50YWJzLlRhYltdID0gW107XG5sZXQgbG9jYWxDdXN0b21TdHJhdGVnaWVzOiBDdXN0b21TdHJhdGVneVtdID0gW107XG5sZXQgY3VycmVudENvbnRleHRNYXAgPSBuZXcgTWFwPG51bWJlciwgQ29udGV4dFJlc3VsdD4oKTtcbmxldCB0YWJUaXRsZXMgPSBuZXcgTWFwPG51bWJlciwgc3RyaW5nPigpO1xubGV0IHNvcnRLZXk6IHN0cmluZyB8IG51bGwgPSBudWxsO1xubGV0IHNvcnREaXJlY3Rpb246ICdhc2MnIHwgJ2Rlc2MnID0gJ2FzYyc7XG5sZXQgc2ltdWxhdGVkU2VsZWN0aW9uID0gbmV3IFNldDxudW1iZXI+KCk7XG5cbi8vIE1vZGVybiBUYWJsZSBTdGF0ZVxubGV0IGdsb2JhbFNlYXJjaFF1ZXJ5ID0gJyc7XG5sZXQgY29sdW1uRmlsdGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xubGV0IGNvbHVtbnM6IENvbHVtbkRlZmluaXRpb25bXSA9IFtcbiAgICB7IGtleTogJ2lkJywgbGFiZWw6ICdJRCcsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnNjBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ2luZGV4JywgbGFiZWw6ICdJbmRleCcsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnNjBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ3dpbmRvd0lkJywgbGFiZWw6ICdXaW5kb3cnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzcwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgeyBrZXk6ICdncm91cElkJywgbGFiZWw6ICdHcm91cCcsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnNzBweCcsIGZpbHRlcmFibGU6IHRydWUgfSxcbiAgICB7IGtleTogJ3RpdGxlJywgbGFiZWw6ICdUaXRsZScsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnMjAwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgeyBrZXk6ICd1cmwnLCBsYWJlbDogJ1VSTCcsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnMjUwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgeyBrZXk6ICdnZW5yZScsIGxhYmVsOiAnR2VucmUnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzEwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnY29udGV4dCcsIGxhYmVsOiAnQ2F0ZWdvcnknLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzEwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnc2l0ZU5hbWUnLCBsYWJlbDogJ1NpdGUgTmFtZScsIHZpc2libGU6IHRydWUsIHdpZHRoOiAnMTIwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgeyBrZXk6ICdwbGF0Zm9ybScsIGxhYmVsOiAnUGxhdGZvcm0nLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzEwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnb2JqZWN0VHlwZScsIGxhYmVsOiAnT2JqZWN0IFR5cGUnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzEwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnZXh0cmFjdGVkVGl0bGUnLCBsYWJlbDogJ0V4dHJhY3RlZCBUaXRsZScsIHZpc2libGU6IGZhbHNlLCB3aWR0aDogJzIwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnYXV0aG9yT3JDcmVhdG9yJywgbGFiZWw6ICdBdXRob3InLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzEyMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAncHVibGlzaGVkQXQnLCBsYWJlbDogJ1B1Ymxpc2hlZCcsIHZpc2libGU6IGZhbHNlLCB3aWR0aDogJzEwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnc3RhdHVzJywgbGFiZWw6ICdTdGF0dXMnLCB2aXNpYmxlOiBmYWxzZSwgd2lkdGg6ICc4MHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnYWN0aXZlJywgbGFiZWw6ICdBY3RpdmUnLCB2aXNpYmxlOiBmYWxzZSwgd2lkdGg6ICc2MHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAncGlubmVkJywgbGFiZWw6ICdQaW5uZWQnLCB2aXNpYmxlOiBmYWxzZSwgd2lkdGg6ICc2MHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnb3BlbmVyVGFiSWQnLCBsYWJlbDogJ09wZW5lcicsIHZpc2libGU6IGZhbHNlLCB3aWR0aDogJzcwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgeyBrZXk6ICdwYXJlbnRUaXRsZScsIGxhYmVsOiAnUGFyZW50IFRpdGxlJywgdmlzaWJsZTogZmFsc2UsIHdpZHRoOiAnMTUwcHgnLCBmaWx0ZXJhYmxlOiB0cnVlIH0sXG4gICAgeyBrZXk6ICdnZW5yZScsIGxhYmVsOiAnR2VucmUnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzEwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnY29udGV4dCcsIGxhYmVsOiAnRXh0cmFjdGVkIENvbnRleHQnLCB2aXNpYmxlOiB0cnVlLCB3aWR0aDogJzQwMHB4JywgZmlsdGVyYWJsZTogdHJ1ZSB9LFxuICAgIHsga2V5OiAnbGFzdEFjY2Vzc2VkJywgbGFiZWw6ICdMYXN0IEFjY2Vzc2VkJywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICcxNTBweCcsIGZpbHRlcmFibGU6IGZhbHNlIH0sXG4gICAgeyBrZXk6ICdhY3Rpb25zJywgbGFiZWw6ICdBY3Rpb25zJywgdmlzaWJsZTogdHJ1ZSwgd2lkdGg6ICcxMjBweCcsIGZpbHRlcmFibGU6IGZhbHNlIH1cbl07XG5cblxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsIGFzeW5jICgpID0+IHtcbiAgY29uc3QgcmVmcmVzaEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZWZyZXNoQnRuJyk7XG4gIGlmIChyZWZyZXNoQnRuKSB7XG4gICAgcmVmcmVzaEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGxvYWRUYWJzKTtcbiAgfVxuXG4gIC8vIFNldHVwIERyb3AgWm9uZXMgZm9yIHNpbXVsYXRpb24gbGlzdHNcbiAgY29uc3QgZ3JvdXBpbmdMaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpbS1ncm91cGluZy1saXN0Jyk7XG4gIGNvbnN0IHNvcnRpbmdMaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpbS1zb3J0aW5nLWxpc3QnKTtcbiAgaWYgKGdyb3VwaW5nTGlzdCkgc2V0dXBEcm9wWm9uZShncm91cGluZ0xpc3QsICcuc3RyYXRlZ3ktcm93Jyk7XG4gIGlmIChzb3J0aW5nTGlzdCkgc2V0dXBEcm9wWm9uZShzb3J0aW5nTGlzdCwgJy5zdHJhdGVneS1yb3cnKTtcblxuICAvLyBUYWIgU3dpdGNoaW5nIExvZ2ljXG4gIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy50YWItYnRuJykuZm9yRWFjaChidG4gPT4ge1xuICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgIC8vIFJlbW92ZSBhY3RpdmUgY2xhc3MgZnJvbSBhbGwgYnV0dG9ucyBhbmQgc2VjdGlvbnNcbiAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy50YWItYnRuJykuZm9yRWFjaChiID0+IGIuY2xhc3NMaXN0LnJlbW92ZSgnYWN0aXZlJykpO1xuICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnZpZXctc2VjdGlvbicpLmZvckVhY2gocyA9PiBzLmNsYXNzTGlzdC5yZW1vdmUoJ2FjdGl2ZScpKTtcblxuICAgICAgLy8gQWRkIGFjdGl2ZSBjbGFzcyB0byBjbGlja2VkIGJ1dHRvblxuICAgICAgYnRuLmNsYXNzTGlzdC5hZGQoJ2FjdGl2ZScpO1xuXG4gICAgICAvLyBTaG93IHRhcmdldCBzZWN0aW9uXG4gICAgICBjb25zdCB0YXJnZXRJZCA9IChidG4gYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXQudGFyZ2V0O1xuICAgICAgaWYgKHRhcmdldElkKSB7XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKHRhcmdldElkKT8uY2xhc3NMaXN0LmFkZCgnYWN0aXZlJyk7XG4gICAgICAgIGxvZ0luZm8oXCJTd2l0Y2hlZCB2aWV3XCIsIHsgdGFyZ2V0SWQgfSk7XG4gICAgICB9XG5cbiAgICAgIC8vIElmIHN3aXRjaGluZyB0byBhbGdvcml0aG1zLCBwb3B1bGF0ZSByZWZlcmVuY2UgaWYgZW1wdHlcbiAgICAgIGlmICh0YXJnZXRJZCA9PT0gJ3ZpZXctYWxnb3JpdGhtcycpIHtcbiAgICAgICAgIHJlbmRlckFsZ29yaXRobXNWaWV3KCk7XG4gICAgICB9IGVsc2UgaWYgKHRhcmdldElkID09PSAndmlldy1zdHJhdGVneS1saXN0Jykge1xuICAgICAgICAgcmVuZGVyU3RyYXRlZ3lMaXN0VGFibGUoKTtcbiAgICAgIH0gZWxzZSBpZiAodGFyZ2V0SWQgPT09ICd2aWV3LWxvZ3MnKSB7XG4gICAgICAgICBsb2FkTG9ncygpO1xuICAgICAgICAgbG9hZEdsb2JhbExvZ0xldmVsKCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0pO1xuXG4gIC8vIExvZyBWaWV3ZXIgTG9naWNcbiAgY29uc3QgcmVmcmVzaExvZ3NCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncmVmcmVzaC1sb2dzLWJ0bicpO1xuICBpZiAocmVmcmVzaExvZ3NCdG4pIHJlZnJlc2hMb2dzQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgbG9hZExvZ3MpO1xuXG4gIGNvbnN0IGNsZWFyTG9nc0J0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjbGVhci1sb2dzLWJ0bicpO1xuICBpZiAoY2xlYXJMb2dzQnRuKSBjbGVhckxvZ3NCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBjbGVhclJlbW90ZUxvZ3MpO1xuXG4gIGNvbnN0IGxvZ0xldmVsRmlsdGVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvZy1sZXZlbC1maWx0ZXInKTtcbiAgaWYgKGxvZ0xldmVsRmlsdGVyKSBsb2dMZXZlbEZpbHRlci5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCByZW5kZXJMb2dzKTtcblxuICBjb25zdCBsb2dTZWFyY2ggPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbG9nLXNlYXJjaCcpO1xuICBpZiAobG9nU2VhcmNoKSBsb2dTZWFyY2guYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCByZW5kZXJMb2dzKTtcblxuICBjb25zdCBnbG9iYWxMb2dMZXZlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnbG9iYWwtbG9nLWxldmVsJyk7XG4gIGlmIChnbG9iYWxMb2dMZXZlbCkgZ2xvYmFsTG9nTGV2ZWwuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgdXBkYXRlR2xvYmFsTG9nTGV2ZWwpO1xuXG4gIC8vIFNpbXVsYXRpb24gTG9naWNcbiAgY29uc3QgcnVuU2ltQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3J1blNpbUJ0bicpO1xuICBpZiAocnVuU2ltQnRuKSB7XG4gICAgcnVuU2ltQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgcnVuU2ltdWxhdGlvbik7XG4gIH1cblxuICBjb25zdCBhcHBseUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhcHBseUJ0bicpO1xuICBpZiAoYXBwbHlCdG4pIHtcbiAgICBhcHBseUJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGFwcGx5VG9Ccm93c2VyKTtcbiAgfVxuXG4gIC8vIE1vZGVybiBUYWJsZSBDb250cm9sc1xuICBjb25zdCBnbG9iYWxTZWFyY2hJbnB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnbG9iYWxTZWFyY2gnKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICBpZiAoZ2xvYmFsU2VhcmNoSW5wdXQpIHtcbiAgICAgIGdsb2JhbFNlYXJjaElucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgKGUpID0+IHtcbiAgICAgICAgICBnbG9iYWxTZWFyY2hRdWVyeSA9IChlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICByZW5kZXJUYWJsZSgpO1xuICAgICAgfSk7XG4gIH1cblxuICBjb25zdCBjb2x1bW5zQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NvbHVtbnNCdG4nKTtcbiAgaWYgKGNvbHVtbnNCdG4pIHtcbiAgICAgIGNvbHVtbnNCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgY29uc3QgbWVudSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjb2x1bW5zTWVudScpO1xuICAgICAgICAgIG1lbnU/LmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicpO1xuICAgICAgICAgIHJlbmRlckNvbHVtbnNNZW51KCk7XG4gICAgICB9KTtcbiAgfVxuXG4gIGNvbnN0IHJlc2V0Vmlld0J0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZXNldFZpZXdCdG4nKTtcbiAgaWYgKHJlc2V0Vmlld0J0bikge1xuICAgICAgcmVzZXRWaWV3QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICAgIC8vIFJlc2V0IGNvbHVtbnMgdG8gZGVmYXVsdHMgKHNpbXBsaWZpZWQsIGp1c3Qgc2hvdyBhbGwgcmVhc29uYWJsZSBvbmVzKVxuICAgICAgICAgICAgY29sdW1ucy5mb3JFYWNoKGMgPT4gYy52aXNpYmxlID0gWydpZCcsICd0aXRsZScsICd1cmwnLCAnd2luZG93SWQnLCAnZ3JvdXBJZCcsICdnZW5yZScsICdjb250ZXh0JywgJ3NpdGVOYW1lJywgJ3BsYXRmb3JtJywgJ29iamVjdFR5cGUnLCAnYXV0aG9yT3JDcmVhdG9yJywgJ2FjdGlvbnMnXS5pbmNsdWRlcyhjLmtleSkpO1xuICAgICAgICAgIGdsb2JhbFNlYXJjaFF1ZXJ5ID0gJyc7XG4gICAgICAgICAgaWYgKGdsb2JhbFNlYXJjaElucHV0KSBnbG9iYWxTZWFyY2hJbnB1dC52YWx1ZSA9ICcnO1xuICAgICAgICAgIGNvbHVtbkZpbHRlcnMgPSB7fTtcbiAgICAgICAgICByZW5kZXJUYWJsZUhlYWRlcigpO1xuICAgICAgICAgIHJlbmRlclRhYmxlKCk7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIEhpZGUgY29sdW1uIG1lbnUgd2hlbiBjbGlja2luZyBvdXRzaWRlXG4gIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICAgICAgaWYgKCF0YXJnZXQuY2xvc2VzdCgnLmNvbHVtbnMtbWVudS1jb250YWluZXInKSkge1xuICAgICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjb2x1bW5zTWVudScpPy5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcbiAgICAgIH1cbiAgfSk7XG5cblxuICAvLyBMaXN0ZW4gZm9yIHRhYiB1cGRhdGVzIHRvIHJlZnJlc2ggZGF0YSAoU1BBIHN1cHBvcnQpXG4gIGNocm9tZS50YWJzLm9uVXBkYXRlZC5hZGRMaXN0ZW5lcigodGFiSWQsIGNoYW5nZUluZm8sIHRhYikgPT4ge1xuICAgIC8vIFdlIHVwZGF0ZSBpZiBVUkwgY2hhbmdlcyBvciBzdGF0dXMgY2hhbmdlcyB0byBjb21wbGV0ZVxuICAgIGlmIChjaGFuZ2VJbmZvLnVybCB8fCBjaGFuZ2VJbmZvLnN0YXR1cyA9PT0gJ2NvbXBsZXRlJykge1xuICAgICAgICBsb2FkVGFicygpO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gTGlzdGVuIGZvciB0YWIgcmVtb3ZhbHMgdG8gcmVmcmVzaCBkYXRhXG4gIGNocm9tZS50YWJzLm9uUmVtb3ZlZC5hZGRMaXN0ZW5lcigoKSA9PiB7XG4gICAgbG9hZFRhYnMoKTtcbiAgfSk7XG5cbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZXZlbnQpID0+IHtcbiAgICBjb25zdCB0YXJnZXQgPSBldmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgIGlmICghdGFyZ2V0KSByZXR1cm47XG5cbiAgICBpZiAodGFyZ2V0Lm1hdGNoZXMoJy5jb250ZXh0LWpzb24tYnRuJykpIHtcbiAgICAgIGNvbnN0IHRhYklkID0gTnVtYmVyKHRhcmdldC5kYXRhc2V0LnRhYklkKTtcbiAgICAgIGlmICghdGFiSWQpIHJldHVybjtcbiAgICAgIGNvbnN0IGRhdGEgPSBjdXJyZW50Q29udGV4dE1hcC5nZXQodGFiSWQpPy5kYXRhO1xuICAgICAgaWYgKCFkYXRhKSByZXR1cm47XG4gICAgICBjb25zdCBqc29uID0gSlNPTi5zdHJpbmdpZnkoZGF0YSwgbnVsbCwgMik7XG4gICAgICBjb25zdCBodG1sQ29udGVudCA9IGBcbiAgICAgICAgPCFET0NUWVBFIGh0bWw+XG4gICAgICAgIDxodG1sPlxuICAgICAgICA8aGVhZD5cbiAgICAgICAgICA8dGl0bGU+SlNPTiBWaWV3PC90aXRsZT5cbiAgICAgICAgICA8c3R5bGU+XG4gICAgICAgICAgICBib2R5IHsgZm9udC1mYW1pbHk6IG1vbm9zcGFjZTsgYmFja2dyb3VuZC1jb2xvcjogI2YwZjBmMDsgcGFkZGluZzogMjBweDsgfVxuICAgICAgICAgICAgcHJlIHsgYmFja2dyb3VuZC1jb2xvcjogd2hpdGU7IHBhZGRpbmc6IDE1cHg7IGJvcmRlci1yYWRpdXM6IDVweDsgYm9yZGVyOiAxcHggc29saWQgI2NjYzsgb3ZlcmZsb3c6IGF1dG87IH1cbiAgICAgICAgICA8L3N0eWxlPlxuICAgICAgICA8L2hlYWQ+XG4gICAgICAgIDxib2R5PlxuICAgICAgICAgIDxoMz5KU09OIERhdGE8L2gzPlxuICAgICAgICAgIDxwcmU+JHtlc2NhcGVIdG1sKGpzb24pfTwvcHJlPlxuICAgICAgICA8L2JvZHk+XG4gICAgICAgIDwvaHRtbD5cbiAgICAgIGA7XG4gICAgICBjb25zdCBibG9iID0gbmV3IEJsb2IoW2h0bWxDb250ZW50XSwgeyB0eXBlOiAndGV4dC9odG1sJyB9KTtcbiAgICAgIGNvbnN0IHVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG4gICAgICB3aW5kb3cub3Blbih1cmwsICdfYmxhbmsnLCAnbm9vcGVuZXIsbm9yZWZlcnJlcicpO1xuICAgIH0gZWxzZSBpZiAodGFyZ2V0Lm1hdGNoZXMoJy5nb3RvLXRhYi1idG4nKSkge1xuICAgICAgY29uc3QgdGFiSWQgPSBOdW1iZXIodGFyZ2V0LmRhdGFzZXQudGFiSWQpO1xuICAgICAgY29uc3Qgd2luZG93SWQgPSBOdW1iZXIodGFyZ2V0LmRhdGFzZXQud2luZG93SWQpO1xuICAgICAgaWYgKHRhYklkICYmIHdpbmRvd0lkKSB7XG4gICAgICAgIGNocm9tZS50YWJzLnVwZGF0ZSh0YWJJZCwgeyBhY3RpdmU6IHRydWUgfSk7XG4gICAgICAgIGNocm9tZS53aW5kb3dzLnVwZGF0ZSh3aW5kb3dJZCwgeyBmb2N1c2VkOiB0cnVlIH0pO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodGFyZ2V0Lm1hdGNoZXMoJy5jbG9zZS10YWItYnRuJykpIHtcbiAgICAgIGNvbnN0IHRhYklkID0gTnVtYmVyKHRhcmdldC5kYXRhc2V0LnRhYklkKTtcbiAgICAgIGlmICh0YWJJZCkge1xuICAgICAgICBjaHJvbWUudGFicy5yZW1vdmUodGFiSWQpO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodGFyZ2V0Lm1hdGNoZXMoJy5zdHJhdGVneS12aWV3LWJ0bicpKSB7XG4gICAgICAgIGNvbnN0IHR5cGUgPSB0YXJnZXQuZGF0YXNldC50eXBlO1xuICAgICAgICBjb25zdCBuYW1lID0gdGFyZ2V0LmRhdGFzZXQubmFtZTtcbiAgICAgICAgaWYgKHR5cGUgJiYgbmFtZSkge1xuICAgICAgICAgICAgc2hvd1N0cmF0ZWd5RGV0YWlscyh0eXBlLCBuYW1lKTtcbiAgICAgICAgfVxuICAgIH1cbiAgfSk7XG5cbiAgLy8gSW5pdCB0YWJsZSBoZWFkZXJcbiAgcmVuZGVyVGFibGVIZWFkZXIoKTtcblxuICBsb2FkVGFicygpO1xuICAvLyBQcmUtcmVuZGVyIHN0YXRpYyBjb250ZW50XG4gIGF3YWl0IGxvYWRQcmVmZXJlbmNlc0FuZEluaXQoKTsgLy8gTG9hZCBwcmVmZXJlbmNlcyBmaXJzdCB0byBpbml0IHN0cmF0ZWdpZXNcbiAgcmVuZGVyQWxnb3JpdGhtc1ZpZXcoKTtcbiAgbG9hZEN1c3RvbUdlbmVyYSgpO1xuICBpbml0U3RyYXRlZ3lCdWlsZGVyKCk7XG5cbiAgY29uc3QgZXhwb3J0QWxsQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0ZWd5LWxpc3QtZXhwb3J0LWJ0bicpO1xuICBjb25zdCBpbXBvcnRBbGxCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXRlZ3ktbGlzdC1pbXBvcnQtYnRuJyk7XG4gIGlmIChleHBvcnRBbGxCdG4pIGV4cG9ydEFsbEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGV4cG9ydEFsbFN0cmF0ZWdpZXMpO1xuICBpZiAoaW1wb3J0QWxsQnRuKSBpbXBvcnRBbGxCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBpbXBvcnRBbGxTdHJhdGVnaWVzKTtcbn0pO1xuXG4vLyBDb2x1bW4gTWFuYWdlbWVudFxuXG5mdW5jdGlvbiByZW5kZXJDb2x1bW5zTWVudSgpIHtcbiAgICBjb25zdCBtZW51ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NvbHVtbnNNZW51Jyk7XG4gICAgaWYgKCFtZW51KSByZXR1cm47XG5cbiAgICBtZW51LmlubmVySFRNTCA9IGNvbHVtbnMubWFwKGNvbCA9PiBgXG4gICAgICAgIDxsYWJlbCBjbGFzcz1cImNvbHVtbi10b2dnbGVcIj5cbiAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBkYXRhLWtleT1cIiR7Y29sLmtleX1cIiAke2NvbC52aXNpYmxlID8gJ2NoZWNrZWQnIDogJyd9PlxuICAgICAgICAgICAgJHtlc2NhcGVIdG1sKGNvbC5sYWJlbCl9XG4gICAgICAgIDwvbGFiZWw+XG4gICAgYCkuam9pbignJyk7XG5cbiAgICBtZW51LnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0JykuZm9yRWFjaChpbnB1dCA9PiB7XG4gICAgICAgIGlucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIChlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBrZXkgPSAoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkuZGF0YXNldC5rZXk7XG4gICAgICAgICAgICBjb25zdCBjaGVja2VkID0gKGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLmNoZWNrZWQ7XG4gICAgICAgICAgICBjb25zdCBjb2wgPSBjb2x1bW5zLmZpbmQoYyA9PiBjLmtleSA9PT0ga2V5KTtcbiAgICAgICAgICAgIGlmIChjb2wpIHtcbiAgICAgICAgICAgICAgICBjb2wudmlzaWJsZSA9IGNoZWNrZWQ7XG4gICAgICAgICAgICAgICAgcmVuZGVyVGFibGVIZWFkZXIoKTsgLy8gUmUtcmVuZGVyIGhlYWRlciB0byBhZGQvcmVtb3ZlIGNvbHVtbnNcbiAgICAgICAgICAgICAgICByZW5kZXJUYWJsZSgpOyAvLyBSZS1yZW5kZXIgYm9keVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyVGFibGVIZWFkZXIoKSB7XG4gICAgY29uc3QgaGVhZGVyUm93ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2hlYWRlclJvdycpO1xuICAgIGNvbnN0IGZpbHRlclJvdyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmaWx0ZXJSb3cnKTtcbiAgICBpZiAoIWhlYWRlclJvdyB8fCAhZmlsdGVyUm93KSByZXR1cm47XG5cbiAgICBjb25zdCB2aXNpYmxlQ29scyA9IGNvbHVtbnMuZmlsdGVyKGMgPT4gYy52aXNpYmxlKTtcblxuICAgIC8vIFJlbmRlciBIZWFkZXJzXG4gICAgaGVhZGVyUm93LmlubmVySFRNTCA9IHZpc2libGVDb2xzLm1hcChjb2wgPT4gYFxuICAgICAgICA8dGggY2xhc3M9XCIke2NvbC5rZXkgIT09ICdhY3Rpb25zJyA/ICdzb3J0YWJsZScgOiAnJ31cIiBkYXRhLWtleT1cIiR7Y29sLmtleX1cIiBzdHlsZT1cIndpZHRoOiAke2NvbC53aWR0aH07IHBvc2l0aW9uOiByZWxhdGl2ZTtcIj5cbiAgICAgICAgICAgICR7ZXNjYXBlSHRtbChjb2wubGFiZWwpfVxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInJlc2l6ZXJcIj48L2Rpdj5cbiAgICAgICAgPC90aD5cbiAgICBgKS5qb2luKCcnKTtcblxuICAgIC8vIFJlbmRlciBGaWx0ZXIgSW5wdXRzXG4gICAgZmlsdGVyUm93LmlubmVySFRNTCA9IHZpc2libGVDb2xzLm1hcChjb2wgPT4ge1xuICAgICAgICBpZiAoIWNvbC5maWx0ZXJhYmxlKSByZXR1cm4gJzx0aD48L3RoPic7XG4gICAgICAgIGNvbnN0IHZhbCA9IGNvbHVtbkZpbHRlcnNbY29sLmtleV0gfHwgJyc7XG4gICAgICAgIHJldHVybiBgXG4gICAgICAgICAgICA8dGg+XG4gICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgY2xhc3M9XCJmaWx0ZXItaW5wdXRcIiBkYXRhLWtleT1cIiR7Y29sLmtleX1cIiB2YWx1ZT1cIiR7ZXNjYXBlSHRtbCh2YWwpfVwiIHBsYWNlaG9sZGVyPVwiRmlsdGVyLi4uXCI+XG4gICAgICAgICAgICA8L3RoPlxuICAgICAgICBgO1xuICAgIH0pLmpvaW4oJycpO1xuXG4gICAgLy8gQXR0YWNoIFNvcnQgTGlzdGVuZXJzXG4gICAgaGVhZGVyUm93LnF1ZXJ5U2VsZWN0b3JBbGwoJy5zb3J0YWJsZScpLmZvckVhY2godGggPT4ge1xuICAgICAgICB0aC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgICAgICAgICAvLyBJZ25vcmUgaWYgY2xpY2tlZCBvbiByZXNpemVyXG4gICAgICAgICAgICBpZiAoKGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5jbGFzc0xpc3QuY29udGFpbnMoJ3Jlc2l6ZXInKSkgcmV0dXJuO1xuXG4gICAgICAgICAgICBjb25zdCBrZXkgPSB0aC5nZXRBdHRyaWJ1dGUoJ2RhdGEta2V5Jyk7XG4gICAgICAgICAgICBpZiAoa2V5KSBoYW5kbGVTb3J0KGtleSk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgLy8gQXR0YWNoIEZpbHRlciBMaXN0ZW5lcnNcbiAgICBmaWx0ZXJSb3cucXVlcnlTZWxlY3RvckFsbCgnLmZpbHRlci1pbnB1dCcpLmZvckVhY2goaW5wdXQgPT4ge1xuICAgICAgICBpbnB1dC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIChlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBrZXkgPSAoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXQua2V5O1xuICAgICAgICAgICAgY29uc3QgdmFsID0gKGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgaWYgKGtleSkge1xuICAgICAgICAgICAgICAgIGNvbHVtbkZpbHRlcnNba2V5XSA9IHZhbDtcbiAgICAgICAgICAgICAgICByZW5kZXJUYWJsZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgIC8vIEF0dGFjaCBSZXNpemUgTGlzdGVuZXJzXG4gICAgaGVhZGVyUm93LnF1ZXJ5U2VsZWN0b3JBbGwoJy5yZXNpemVyJykuZm9yRWFjaChyZXNpemVyID0+IHtcbiAgICAgICAgaW5pdFJlc2l6ZShyZXNpemVyIGFzIEhUTUxFbGVtZW50KTtcbiAgICB9KTtcblxuICAgIHVwZGF0ZUhlYWRlclN0eWxlcygpO1xufVxuXG5mdW5jdGlvbiBpbml0UmVzaXplKHJlc2l6ZXI6IEhUTUxFbGVtZW50KSB7XG4gICAgbGV0IHggPSAwO1xuICAgIGxldCB3ID0gMDtcbiAgICBsZXQgdGg6IEhUTUxFbGVtZW50O1xuXG4gICAgY29uc3QgbW91c2VEb3duSGFuZGxlciA9IChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICAgIHRoID0gcmVzaXplci5wYXJlbnRFbGVtZW50IGFzIEhUTUxFbGVtZW50O1xuICAgICAgICB4ID0gZS5jbGllbnRYO1xuICAgICAgICB3ID0gdGgub2Zmc2V0V2lkdGg7XG5cbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgbW91c2VNb3ZlSGFuZGxlcik7XG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCBtb3VzZVVwSGFuZGxlcik7XG4gICAgICAgIHJlc2l6ZXIuY2xhc3NMaXN0LmFkZCgncmVzaXppbmcnKTtcbiAgICB9O1xuXG4gICAgY29uc3QgbW91c2VNb3ZlSGFuZGxlciA9IChlOiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICAgIGNvbnN0IGR4ID0gZS5jbGllbnRYIC0geDtcbiAgICAgICAgY29uc3QgY29sS2V5ID0gdGguZ2V0QXR0cmlidXRlKCdkYXRhLWtleScpO1xuICAgICAgICBjb25zdCBjb2wgPSBjb2x1bW5zLmZpbmQoYyA9PiBjLmtleSA9PT0gY29sS2V5KTtcbiAgICAgICAgaWYgKGNvbCkge1xuICAgICAgICAgICAgY29uc3QgbmV3V2lkdGggPSBNYXRoLm1heCgzMCwgdyArIGR4KTsgLy8gTWluIHdpZHRoIDMwcHhcbiAgICAgICAgICAgIGNvbC53aWR0aCA9IGAke25ld1dpZHRofXB4YDtcbiAgICAgICAgICAgIHRoLnN0eWxlLndpZHRoID0gY29sLndpZHRoO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIGNvbnN0IG1vdXNlVXBIYW5kbGVyID0gKCkgPT4ge1xuICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCBtb3VzZU1vdmVIYW5kbGVyKTtcbiAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsIG1vdXNlVXBIYW5kbGVyKTtcbiAgICAgICAgcmVzaXplci5jbGFzc0xpc3QucmVtb3ZlKCdyZXNpemluZycpO1xuICAgIH07XG5cbiAgICByZXNpemVyLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIG1vdXNlRG93bkhhbmRsZXIpO1xufVxuXG5cbmFzeW5jIGZ1bmN0aW9uIGxvYWRQcmVmZXJlbmNlc0FuZEluaXQoKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdsb2FkUHJlZmVyZW5jZXMnIH0pO1xuICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2sgJiYgcmVzcG9uc2UuZGF0YSkge1xuICAgICAgICAgICAgY29uc3QgcHJlZnMgPSByZXNwb25zZS5kYXRhIGFzIFByZWZlcmVuY2VzO1xuICAgICAgICAgICAgbG9jYWxDdXN0b21TdHJhdGVnaWVzID0gcHJlZnMuY3VzdG9tU3RyYXRlZ2llcyB8fCBbXTtcbiAgICAgICAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMobG9jYWxDdXN0b21TdHJhdGVnaWVzKTtcbiAgICAgICAgICAgIHJlbmRlclN0cmF0ZWd5TG9hZE9wdGlvbnMoKTtcbiAgICAgICAgICAgIHJlbmRlclN0cmF0ZWd5TGlzdFRhYmxlKCk7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gbG9hZCBwcmVmZXJlbmNlc1wiLCBlKTtcbiAgICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGxvYWRDdXN0b21HZW5lcmEoKSB7XG4gICAgY29uc3QgbGlzdENvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjdXN0b20tZ2VuZXJhLWxpc3QnKTtcbiAgICBpZiAoIWxpc3RDb250YWluZXIpIHJldHVybjtcblxuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiAnbG9hZFByZWZlcmVuY2VzJyB9KTtcbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9rICYmIHJlc3BvbnNlLmRhdGEpIHtcbiAgICAgICAgICAgIGNvbnN0IHByZWZzID0gcmVzcG9uc2UuZGF0YSBhcyBQcmVmZXJlbmNlcztcbiAgICAgICAgICAgIHJlbmRlckN1c3RvbUdlbmVyYUxpc3QocHJlZnMuY3VzdG9tR2VuZXJhIHx8IHt9KTtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBsb2FkIGN1c3RvbSBnZW5lcmFcIiwgZSk7XG4gICAgfVxufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tIFNUUkFURUdZIEJVSUxERVIgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5mdW5jdGlvbiBnZXRCdWlsdEluU3RyYXRlZ3lDb25maWcoaWQ6IHN0cmluZyk6IEN1c3RvbVN0cmF0ZWd5IHwgbnVsbCB7XG4gICAgY29uc3QgYmFzZTogQ3VzdG9tU3RyYXRlZ3kgPSB7XG4gICAgICAgIGlkOiBpZCxcbiAgICAgICAgbGFiZWw6IFNUUkFURUdJRVMuZmluZChzID0+IHMuaWQgPT09IGlkKT8ubGFiZWwgfHwgaWQsXG4gICAgICAgIGZpbHRlcnM6IFtdLFxuICAgICAgICBncm91cGluZ1J1bGVzOiBbXSxcbiAgICAgICAgc29ydGluZ1J1bGVzOiBbXSxcbiAgICAgICAgZ3JvdXBTb3J0aW5nUnVsZXM6IFtdLFxuICAgICAgICBmYWxsYmFjazogJ01pc2MnLFxuICAgICAgICBzb3J0R3JvdXBzOiBmYWxzZSxcbiAgICAgICAgYXV0b1J1bjogZmFsc2VcbiAgICB9O1xuXG4gICAgc3dpdGNoIChpZCkge1xuICAgICAgICBjYXNlICdkb21haW4nOlxuICAgICAgICAgICAgYmFzZS5ncm91cGluZ1J1bGVzID0gW3sgc291cmNlOiAnZmllbGQnLCB2YWx1ZTogJ2RvbWFpbicsIHRyYW5zZm9ybTogJ3N0cmlwVGxkJywgY29sb3I6ICdyYW5kb20nIH1dO1xuICAgICAgICAgICAgYmFzZS5zb3J0aW5nUnVsZXMgPSBbeyBmaWVsZDogJ2RvbWFpbicsIG9yZGVyOiAnYXNjJyB9XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdkb21haW5fZnVsbCc6XG4gICAgICAgICAgICAgYmFzZS5ncm91cGluZ1J1bGVzID0gW3sgc291cmNlOiAnZmllbGQnLCB2YWx1ZTogJ2RvbWFpbicsIHRyYW5zZm9ybTogJ25vbmUnLCBjb2xvcjogJ3JhbmRvbScgfV07XG4gICAgICAgICAgICAgYmFzZS5zb3J0aW5nUnVsZXMgPSBbeyBmaWVsZDogJ2RvbWFpbicsIG9yZGVyOiAnYXNjJyB9XTtcbiAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAndG9waWMnOlxuICAgICAgICAgICAgYmFzZS5ncm91cGluZ1J1bGVzID0gW3sgc291cmNlOiAnZmllbGQnLCB2YWx1ZTogJ2dlbnJlJywgY29sb3I6ICdyYW5kb20nIH1dO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2NvbnRleHQnOlxuICAgICAgICAgICAgYmFzZS5ncm91cGluZ1J1bGVzID0gW3sgc291cmNlOiAnZmllbGQnLCB2YWx1ZTogJ2NvbnRleHQnLCBjb2xvcjogJ3JhbmRvbScgfV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnbGluZWFnZSc6XG4gICAgICAgICAgICBiYXNlLmdyb3VwaW5nUnVsZXMgPSBbeyBzb3VyY2U6ICdmaWVsZCcsIHZhbHVlOiAncGFyZW50VGl0bGUnLCBjb2xvcjogJ3JhbmRvbScgfV07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAncGlubmVkJzpcbiAgICAgICAgICAgICBiYXNlLnNvcnRpbmdSdWxlcyA9IFt7IGZpZWxkOiAncGlubmVkJywgb3JkZXI6ICdkZXNjJyB9XTtcbiAgICAgICAgICAgICBiYXNlLmdyb3VwaW5nUnVsZXMgPSBbeyBzb3VyY2U6ICdmaWVsZCcsIHZhbHVlOiAncGlubmVkJywgY29sb3I6ICdyYW5kb20nIH1dO1xuICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdyZWNlbmN5JzpcbiAgICAgICAgICAgIGJhc2Uuc29ydGluZ1J1bGVzID0gW3sgZmllbGQ6ICdsYXN0QWNjZXNzZWQnLCBvcmRlcjogJ2Rlc2MnIH1dO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2FnZSc6XG4gICAgICAgICAgICAgYmFzZS5zb3J0aW5nUnVsZXMgPSBbeyBmaWVsZDogJ2xhc3RBY2Nlc3NlZCcsIG9yZGVyOiAnZGVzYycgfV07XG4gICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3VybCc6XG4gICAgICAgICAgICBiYXNlLnNvcnRpbmdSdWxlcyA9IFt7IGZpZWxkOiAndXJsJywgb3JkZXI6ICdhc2MnIH1dO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3RpdGxlJzpcbiAgICAgICAgICAgIGJhc2Uuc29ydGluZ1J1bGVzID0gW3sgZmllbGQ6ICd0aXRsZScsIG9yZGVyOiAnYXNjJyB9XTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICduZXN0aW5nJzpcbiAgICAgICAgICAgICBiYXNlLnNvcnRpbmdSdWxlcyA9IFt7IGZpZWxkOiAncGFyZW50VGl0bGUnLCBvcmRlcjogJ2FzYycgfV07XG4gICAgICAgICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgcmV0dXJuIGJhc2U7XG59XG5cbmNvbnN0IEZJRUxEX09QVElPTlMgPSBgXG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInVybFwiPlVSTDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJ0aXRsZVwiPlRpdGxlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImRvbWFpblwiPkRvbWFpbjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJzdWJkb21haW5cIj5TdWJkb21haW48L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiaWRcIj5JRDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJpbmRleFwiPkluZGV4PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIndpbmRvd0lkXCI+V2luZG93IElEPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImdyb3VwSWRcIj5Hcm91cCBJRDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJhY3RpdmVcIj5BY3RpdmU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwic2VsZWN0ZWRcIj5TZWxlY3RlZDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJwaW5uZWRcIj5QaW5uZWQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwic3RhdHVzXCI+U3RhdHVzPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIm9wZW5lclRhYklkXCI+T3BlbmVyIElEPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInBhcmVudFRpdGxlXCI+UGFyZW50IFRpdGxlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImxhc3RBY2Nlc3NlZFwiPkxhc3QgQWNjZXNzZWQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZ2VucmVcIj5HZW5yZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0XCI+Q29udGV4dCBTdW1tYXJ5PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHREYXRhLnNpdGVOYW1lXCI+U2l0ZSBOYW1lPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHREYXRhLmNhbm9uaWNhbFVybFwiPkNhbm9uaWNhbCBVUkw8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEubm9ybWFsaXplZFVybFwiPk5vcm1hbGl6ZWQgVVJMPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHREYXRhLnBsYXRmb3JtXCI+UGxhdGZvcm08L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEub2JqZWN0VHlwZVwiPk9iamVjdCBUeXBlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHREYXRhLm9iamVjdElkXCI+T2JqZWN0IElEPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHREYXRhLnRpdGxlXCI+RXh0cmFjdGVkIFRpdGxlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHREYXRhLmRlc2NyaXB0aW9uXCI+RGVzY3JpcHRpb248L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEuYXV0aG9yT3JDcmVhdG9yXCI+QXV0aG9yL0NyZWF0b3I8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEucHVibGlzaGVkQXRcIj5QdWJsaXNoZWQgQXQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEubW9kaWZpZWRBdFwiPk1vZGlmaWVkIEF0PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRleHREYXRhLmxhbmd1YWdlXCI+TGFuZ3VhZ2U8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEuaXNBdWRpYmxlXCI+SXMgQXVkaWJsZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjb250ZXh0RGF0YS5pc011dGVkXCI+SXMgTXV0ZWQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEuaGFzVW5zYXZlZENoYW5nZXNMaWtlbHlcIj5VbnNhdmVkIENoYW5nZXM8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiY29udGV4dERhdGEuaXNBdXRoZW50aWNhdGVkTGlrZWx5XCI+QXV0aGVudGljYXRlZDwvb3B0aW9uPmA7XG5cbmNvbnN0IE9QRVJBVE9SX09QVElPTlMgPSBgXG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbnRhaW5zXCI+Y29udGFpbnM8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZG9lc05vdENvbnRhaW5cIj5kb2VzIG5vdCBjb250YWluPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIm1hdGNoZXNcIj5tYXRjaGVzIHJlZ2V4PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImVxdWFsc1wiPmVxdWFsczwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJzdGFydHNXaXRoXCI+c3RhcnRzIHdpdGg8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZW5kc1dpdGhcIj5lbmRzIHdpdGg8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZXhpc3RzXCI+ZXhpc3RzPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImRvZXNOb3RFeGlzdFwiPmRvZXMgbm90IGV4aXN0PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImlzTnVsbFwiPmlzIG51bGw8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiaXNOb3ROdWxsXCI+aXMgbm90IG51bGw8L29wdGlvbj5gO1xuXG5mdW5jdGlvbiBpbml0U3RyYXRlZ3lCdWlsZGVyKCkge1xuICAgIGNvbnN0IGFkZEZpbHRlckdyb3VwQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FkZC1maWx0ZXItZ3JvdXAtYnRuJyk7XG4gICAgY29uc3QgYWRkR3JvdXBCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWRkLWdyb3VwLWJ0bicpO1xuICAgIGNvbnN0IGFkZFNvcnRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWRkLXNvcnQtYnRuJyk7XG4gICAgY29uc3QgbG9hZFNlbGVjdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdGVneS1sb2FkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50IHwgbnVsbDtcblxuICAgIC8vIE5ldzogR3JvdXAgU29ydGluZ1xuICAgIGNvbnN0IGFkZEdyb3VwU29ydEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhZGQtZ3JvdXAtc29ydC1idG4nKTtcbiAgICBjb25zdCBncm91cFNvcnRDaGVjayA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1zb3J0Z3JvdXBzLWNoZWNrJyk7XG5cbiAgICBjb25zdCBzYXZlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J1aWxkZXItc2F2ZS1idG4nKTtcbiAgICBjb25zdCBydW5CdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnVpbGRlci1ydW4tYnRuJyk7XG4gICAgY29uc3QgcnVuTGl2ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdidWlsZGVyLXJ1bi1saXZlLWJ0bicpO1xuICAgIGNvbnN0IGNsZWFyQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J1aWxkZXItY2xlYXItYnRuJyk7XG5cbiAgICBjb25zdCBleHBvcnRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnVpbGRlci1leHBvcnQtYnRuJyk7XG4gICAgY29uc3QgaW1wb3J0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J1aWxkZXItaW1wb3J0LWJ0bicpO1xuXG4gICAgaWYgKGV4cG9ydEJ0bikgZXhwb3J0QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZXhwb3J0QnVpbGRlclN0cmF0ZWd5KTtcbiAgICBpZiAoaW1wb3J0QnRuKSBpbXBvcnRCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBpbXBvcnRCdWlsZGVyU3RyYXRlZ3kpO1xuXG4gICAgaWYgKGFkZEZpbHRlckdyb3VwQnRuKSBhZGRGaWx0ZXJHcm91cEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGFkZEZpbHRlckdyb3VwUm93KCkpO1xuICAgIGlmIChhZGRHcm91cEJ0bikgYWRkR3JvdXBCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBhZGRCdWlsZGVyUm93KCdncm91cCcpKTtcbiAgICBpZiAoYWRkU29ydEJ0bikgYWRkU29ydEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGFkZEJ1aWxkZXJSb3coJ3NvcnQnKSk7XG4gICAgaWYgKGFkZEdyb3VwU29ydEJ0bikgYWRkR3JvdXBTb3J0QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gYWRkQnVpbGRlclJvdygnZ3JvdXBTb3J0JykpO1xuXG4gICAgaWYgKGdyb3VwU29ydENoZWNrKSB7XG4gICAgICAgIGdyb3VwU29ydENoZWNrLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIChlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjaGVja2VkID0gKGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLmNoZWNrZWQ7XG4gICAgICAgICAgICBjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ3JvdXAtc29ydC1yb3dzLWNvbnRhaW5lcicpO1xuICAgICAgICAgICAgY29uc3QgYWRkQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FkZC1ncm91cC1zb3J0LWJ0bicpO1xuICAgICAgICAgICAgaWYgKGNvbnRhaW5lciAmJiBhZGRCdG4pIHtcbiAgICAgICAgICAgICAgICBjb250YWluZXIuc3R5bGUuZGlzcGxheSA9IGNoZWNrZWQgPyAnYmxvY2snIDogJ25vbmUnO1xuICAgICAgICAgICAgICAgIGFkZEJ0bi5zdHlsZS5kaXNwbGF5ID0gY2hlY2tlZCA/ICdibG9jaycgOiAnbm9uZSc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmIChzYXZlQnRuKSBzYXZlQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gc2F2ZUN1c3RvbVN0cmF0ZWd5RnJvbUJ1aWxkZXIodHJ1ZSkpO1xuICAgIGlmIChydW5CdG4pIHJ1bkJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHJ1bkJ1aWxkZXJTaW11bGF0aW9uKTtcbiAgICBpZiAocnVuTGl2ZUJ0bikgcnVuTGl2ZUJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHJ1bkJ1aWxkZXJMaXZlKTtcbiAgICBpZiAoY2xlYXJCdG4pIGNsZWFyQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgY2xlYXJCdWlsZGVyKTtcblxuICAgIGlmIChsb2FkU2VsZWN0KSB7XG4gICAgICAgIGxvYWRTZWxlY3QuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKCkgPT4ge1xuICAgICAgICAgICAgY29uc3Qgc2VsZWN0ZWRJZCA9IGxvYWRTZWxlY3QudmFsdWU7XG4gICAgICAgICAgICBpZiAoIXNlbGVjdGVkSWQpIHJldHVybjtcblxuICAgICAgICAgICAgbGV0IHN0cmF0ID0gbG9jYWxDdXN0b21TdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzZWxlY3RlZElkKTtcbiAgICAgICAgICAgIGlmICghc3RyYXQpIHtcbiAgICAgICAgICAgICAgICBzdHJhdCA9IGdldEJ1aWx0SW5TdHJhdGVneUNvbmZpZyhzZWxlY3RlZElkKSB8fCB1bmRlZmluZWQ7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChzdHJhdCkge1xuICAgICAgICAgICAgICAgIHBvcHVsYXRlQnVpbGRlckZyb21TdHJhdGVneShzdHJhdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIEluaXRpYWwgTGl2ZSBWaWV3XG4gICAgcmVuZGVyTGl2ZVZpZXcoKTtcbiAgICBjb25zdCByZWZyZXNoTGl2ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZWZyZXNoLWxpdmUtdmlldy1idG4nKTtcbiAgICBpZiAocmVmcmVzaExpdmVCdG4pIHJlZnJlc2hMaXZlQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgcmVuZGVyTGl2ZVZpZXcpO1xuXG4gICAgY29uc3QgbGl2ZUNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsaXZlLXZpZXctY29udGFpbmVyJyk7XG4gICAgaWYgKGxpdmVDb250YWluZXIpIHtcbiAgICAgICAgbGl2ZUNvbnRhaW5lci5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgICAgIGNvbnN0IGl0ZW0gPSB0YXJnZXQuY2xvc2VzdCgnLnNlbGVjdGFibGUtaXRlbScpIGFzIEhUTUxFbGVtZW50O1xuICAgICAgICAgICAgaWYgKCFpdGVtKSByZXR1cm47XG5cbiAgICAgICAgICAgIGNvbnN0IHR5cGUgPSBpdGVtLmRhdGFzZXQudHlwZTtcbiAgICAgICAgICAgIGNvbnN0IGlkID0gTnVtYmVyKGl0ZW0uZGF0YXNldC5pZCk7XG4gICAgICAgICAgICBpZiAoIXR5cGUgfHwgaXNOYU4oaWQpKSByZXR1cm47XG5cbiAgICAgICAgICAgIGlmICh0eXBlID09PSAndGFiJykge1xuICAgICAgICAgICAgICAgIGlmIChzaW11bGF0ZWRTZWxlY3Rpb24uaGFzKGlkKSkgc2ltdWxhdGVkU2VsZWN0aW9uLmRlbGV0ZShpZCk7XG4gICAgICAgICAgICAgICAgZWxzZSBzaW11bGF0ZWRTZWxlY3Rpb24uYWRkKGlkKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ2dyb3VwJykge1xuICAgICAgICAgICAgICAgIC8vIFRvZ2dsZSBhbGwgdGFicyBpbiBncm91cFxuICAgICAgICAgICAgICAgIC8vIFdlIG5lZWQgdG8ga25vdyB3aGljaCB0YWJzIGFyZSBpbiB0aGUgZ3JvdXAuXG4gICAgICAgICAgICAgICAgLy8gV2UgY2FuIGZpbmQgdGhlbSBpbiBET00gb3IgcmVmZXRjaC4gRE9NIGlzIGVhc2llci5cbiAgICAgICAgICAgICAgICAvLyBPciBiZXR0ZXIsIGxvZ2ljIGluIHJlbmRlckxpdmVWaWV3IGhhbmRsZXMgcmVuZGVyaW5nLCBoZXJlIHdlIGhhbmRsZSBkYXRhLlxuICAgICAgICAgICAgICAgIC8vIExldCdzIHJlbHkgb24gRE9NIHN0cnVjdHVyZSBvciByZS1xdWVyeS5cbiAgICAgICAgICAgICAgICAvLyBSZS1xdWVyeWluZyBpcyByb2J1c3QuXG4gICAgICAgICAgICAgICAgY2hyb21lLnRhYnMucXVlcnkoe30pLnRoZW4odGFicyA9PiB7XG4gICAgICAgICAgICAgICAgICAgY29uc3QgZ3JvdXBUYWJzID0gdGFicy5maWx0ZXIodCA9PiB0Lmdyb3VwSWQgPT09IGlkKTtcbiAgICAgICAgICAgICAgICAgICBjb25zdCBhbGxTZWxlY3RlZCA9IGdyb3VwVGFicy5ldmVyeSh0ID0+IHQuaWQgJiYgc2ltdWxhdGVkU2VsZWN0aW9uLmhhcyh0LmlkKSk7XG4gICAgICAgICAgICAgICAgICAgZ3JvdXBUYWJzLmZvckVhY2godCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgIGlmICh0LmlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoYWxsU2VsZWN0ZWQpIHNpbXVsYXRlZFNlbGVjdGlvbi5kZWxldGUodC5pZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICBlbHNlIHNpbXVsYXRlZFNlbGVjdGlvbi5hZGQodC5pZCk7XG4gICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICByZW5kZXJMaXZlVmlldygpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybjsgLy8gYXN5bmMgdXBkYXRlXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICd3aW5kb3cnKSB7XG4gICAgICAgICAgICAgICAgY2hyb21lLnRhYnMucXVlcnkoe30pLnRoZW4odGFicyA9PiB7XG4gICAgICAgICAgICAgICAgICAgY29uc3Qgd2luVGFicyA9IHRhYnMuZmlsdGVyKHQgPT4gdC53aW5kb3dJZCA9PT0gaWQpO1xuICAgICAgICAgICAgICAgICAgIGNvbnN0IGFsbFNlbGVjdGVkID0gd2luVGFicy5ldmVyeSh0ID0+IHQuaWQgJiYgc2ltdWxhdGVkU2VsZWN0aW9uLmhhcyh0LmlkKSk7XG4gICAgICAgICAgICAgICAgICAgd2luVGFicy5mb3JFYWNoKHQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICBpZiAodC5pZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGFsbFNlbGVjdGVkKSBzaW11bGF0ZWRTZWxlY3Rpb24uZGVsZXRlKHQuaWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSBzaW11bGF0ZWRTZWxlY3Rpb24uYWRkKHQuaWQpO1xuICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgcmVuZGVyTGl2ZVZpZXcoKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm47IC8vIGFzeW5jIHVwZGF0ZVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZW5kZXJMaXZlVmlldygpO1xuICAgICAgICB9KTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGFkZEZpbHRlckdyb3VwUm93KGNvbmRpdGlvbnM/OiBSdWxlQ29uZGl0aW9uW10pIHtcbiAgICBjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZmlsdGVyLXJvd3MtY29udGFpbmVyJyk7XG4gICAgaWYgKCFjb250YWluZXIpIHJldHVybjtcblxuICAgIGNvbnN0IGdyb3VwRGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgZ3JvdXBEaXYuY2xhc3NOYW1lID0gJ2ZpbHRlci1ncm91cC1yb3cnO1xuXG4gICAgZ3JvdXBEaXYuaW5uZXJIVE1MID0gYFxuICAgICAgICA8ZGl2IGNsYXNzPVwiZmlsdGVyLWdyb3VwLWhlYWRlclwiPlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJmaWx0ZXItZ3JvdXAtdGl0bGVcIj5Hcm91cCAoQU5EKTwvc3Bhbj5cbiAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJzbWFsbC1idG4gYnRuLWRlbC1ncm91cFwiPkRlbGV0ZSBHcm91cDwvYnV0dG9uPlxuICAgICAgICA8L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImNvbmRpdGlvbnMtY29udGFpbmVyXCI+PC9kaXY+XG4gICAgICAgIDxidXR0b24gY2xhc3M9XCJzbWFsbC1idG4gYnRuLWFkZC1jb25kaXRpb25cIj4rIEFkZCBDb25kaXRpb248L2J1dHRvbj5cbiAgICBgO1xuXG4gICAgZ3JvdXBEaXYucXVlcnlTZWxlY3RvcignLmJ0bi1kZWwtZ3JvdXAnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGdyb3VwRGl2LnJlbW92ZSgpO1xuICAgICAgICB1cGRhdGVCcmVhZGNydW1iKCk7XG4gICAgfSk7XG5cbiAgICBjb25zdCBjb25kaXRpb25zQ29udGFpbmVyID0gZ3JvdXBEaXYucXVlcnlTZWxlY3RvcignLmNvbmRpdGlvbnMtY29udGFpbmVyJykgYXMgSFRNTEVsZW1lbnQ7XG4gICAgY29uc3QgYWRkQ29uZGl0aW9uQnRuID0gZ3JvdXBEaXYucXVlcnlTZWxlY3RvcignLmJ0bi1hZGQtY29uZGl0aW9uJyk7XG5cbiAgICBjb25zdCBhZGRDb25kaXRpb24gPSAoZGF0YT86IFJ1bGVDb25kaXRpb24pID0+IHtcbiAgICAgICAgY29uc3QgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIGRpdi5jbGFzc05hbWUgPSAnYnVpbGRlci1yb3cgY29uZGl0aW9uLXJvdyc7XG4gICAgICAgIGRpdi5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuICAgICAgICBkaXYuc3R5bGUuZ2FwID0gJzVweCc7XG4gICAgICAgIGRpdi5zdHlsZS5tYXJnaW5Cb3R0b20gPSAnNXB4JztcbiAgICAgICAgZGl2LnN0eWxlLmFsaWduSXRlbXMgPSAnY2VudGVyJztcblxuICAgICAgICBkaXYuaW5uZXJIVE1MID0gYFxuICAgICAgICAgICAgPHNlbGVjdCBjbGFzcz1cImZpZWxkLXNlbGVjdFwiPlxuICAgICAgICAgICAgICAgICR7RklFTERfT1BUSU9OU31cbiAgICAgICAgICAgIDwvc2VsZWN0PlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJvcGVyYXRvci1jb250YWluZXJcIj5cbiAgICAgICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwib3BlcmF0b3Itc2VsZWN0XCI+XG4gICAgICAgICAgICAgICAgICAgICR7T1BFUkFUT1JfT1BUSU9OU31cbiAgICAgICAgICAgICAgICA8L3NlbGVjdD5cbiAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwidmFsdWUtY29udGFpbmVyXCI+XG4gICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgY2xhc3M9XCJ2YWx1ZS1pbnB1dFwiIHBsYWNlaG9sZGVyPVwiVmFsdWVcIj5cbiAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJzbWFsbC1idG4gYnRuLWRlbC1jb25kaXRpb25cIiBzdHlsZT1cImJhY2tncm91bmQ6IG5vbmU7IGJvcmRlcjogbm9uZTsgY29sb3I6IHJlZDtcIj4mdGltZXM7PC9idXR0b24+XG4gICAgICAgIGA7XG5cbiAgICAgICAgY29uc3QgZmllbGRTZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLmZpZWxkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICBjb25zdCBvcGVyYXRvckNvbnRhaW5lciA9IGRpdi5xdWVyeVNlbGVjdG9yKCcub3BlcmF0b3ItY29udGFpbmVyJykgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IHZhbHVlQ29udGFpbmVyID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1jb250YWluZXInKSBhcyBIVE1MRWxlbWVudDtcblxuICAgICAgICBjb25zdCB1cGRhdGVTdGF0ZSA9IChpbml0aWFsT3A/OiBzdHJpbmcsIGluaXRpYWxWYWw/OiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHZhbCA9IGZpZWxkU2VsZWN0LnZhbHVlO1xuICAgICAgICAgICAgLy8gSGFuZGxlIGJvb2xlYW4gZmllbGRzXG4gICAgICAgICAgICBpZiAoWydzZWxlY3RlZCcsICdwaW5uZWQnXS5pbmNsdWRlcyh2YWwpKSB7XG4gICAgICAgICAgICAgICAgb3BlcmF0b3JDb250YWluZXIuaW5uZXJIVE1MID0gYDxzZWxlY3QgY2xhc3M9XCJvcGVyYXRvci1zZWxlY3RcIiBkaXNhYmxlZCBzdHlsZT1cImJhY2tncm91bmQ6ICNlZWU7IGNvbG9yOiAjNTU1O1wiPjxvcHRpb24gdmFsdWU9XCJlcXVhbHNcIj5pczwvb3B0aW9uPjwvc2VsZWN0PmA7XG4gICAgICAgICAgICAgICAgdmFsdWVDb250YWluZXIuaW5uZXJIVE1MID0gYFxuICAgICAgICAgICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwidmFsdWUtaW5wdXRcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJ0cnVlXCI+VHJ1ZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImZhbHNlXCI+RmFsc2U8L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgICAgPC9zZWxlY3Q+XG4gICAgICAgICAgICAgICAgYDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgaWYgYWxyZWFkeSBpbiBzdGFuZGFyZCBtb2RlIHRvIGF2b2lkIHVubmVjZXNzYXJ5IERPTSB0aHJhc2hpbmdcbiAgICAgICAgICAgICAgICBpZiAoIW9wZXJhdG9yQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ3NlbGVjdDpub3QoW2Rpc2FibGVkXSknKSkge1xuICAgICAgICAgICAgICAgICAgICBvcGVyYXRvckNvbnRhaW5lci5pbm5lckhUTUwgPSBgPHNlbGVjdCBjbGFzcz1cIm9wZXJhdG9yLXNlbGVjdFwiPiR7T1BFUkFUT1JfT1BUSU9OU308L3NlbGVjdD5gO1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZUNvbnRhaW5lci5pbm5lckhUTUwgPSBgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgY2xhc3M9XCJ2YWx1ZS1pbnB1dFwiIHBsYWNlaG9sZGVyPVwiVmFsdWVcIj5gO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gUmVzdG9yZSB2YWx1ZXMgaWYgcHJvdmlkZWQgKGVzcGVjaWFsbHkgd2hlbiBzd2l0Y2hpbmcgYmFjayBvciBpbml0aWFsaXppbmcpXG4gICAgICAgICAgICBpZiAoaW5pdGlhbE9wIHx8IGluaXRpYWxWYWwpIHtcbiAgICAgICAgICAgICAgICAgY29uc3Qgb3BFbCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcub3BlcmF0b3Itc2VsZWN0JykgYXMgSFRNTElucHV0RWxlbWVudCB8IEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICAgICAgICAgICBjb25zdCB2YWxFbCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcudmFsdWUtaW5wdXQnKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgICAgICAgICAgIGlmIChvcEVsICYmIGluaXRpYWxPcCkgb3BFbC52YWx1ZSA9IGluaXRpYWxPcDtcbiAgICAgICAgICAgICAgICAgaWYgKHZhbEVsICYmIGluaXRpYWxWYWwpIHZhbEVsLnZhbHVlID0gaW5pdGlhbFZhbDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gUmUtYXR0YWNoIGxpc3RlbmVycyB0byBuZXcgZWxlbWVudHNcbiAgICAgICAgICAgIGRpdi5xdWVyeVNlbGVjdG9yQWxsKCdpbnB1dCwgc2VsZWN0JykuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgICAgICAgICAgZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgdXBkYXRlQnJlYWRjcnVtYik7XG4gICAgICAgICAgICAgICAgZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcignaW5wdXQnLCB1cGRhdGVCcmVhZGNydW1iKTtcbiAgICAgICAgICAgICAgICBlbC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB1cGRhdGVCcmVhZGNydW1iKTtcbiAgICAgICAgICAgICAgICBlbC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIHVwZGF0ZUJyZWFkY3J1bWIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgZmllbGRTZWxlY3QuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKCkgPT4ge1xuICAgICAgICAgICAgdXBkYXRlU3RhdGUoKTtcbiAgICAgICAgICAgIHVwZGF0ZUJyZWFkY3J1bWIoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKGRhdGEpIHtcbiAgICAgICAgICAgIGZpZWxkU2VsZWN0LnZhbHVlID0gZGF0YS5maWVsZDtcbiAgICAgICAgICAgIHVwZGF0ZVN0YXRlKGRhdGEub3BlcmF0b3IsIGRhdGEudmFsdWUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdXBkYXRlU3RhdGUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGRpdi5xdWVyeVNlbGVjdG9yKCcuYnRuLWRlbC1jb25kaXRpb24nKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgICBkaXYucmVtb3ZlKCk7XG4gICAgICAgICAgICB1cGRhdGVCcmVhZGNydW1iKCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbmRpdGlvbnNDb250YWluZXIuYXBwZW5kQ2hpbGQoZGl2KTtcbiAgICB9O1xuXG4gICAgYWRkQ29uZGl0aW9uQnRuPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGFkZENvbmRpdGlvbigpKTtcblxuICAgIGlmIChjb25kaXRpb25zICYmIGNvbmRpdGlvbnMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25kaXRpb25zLmZvckVhY2goYyA9PiBhZGRDb25kaXRpb24oYykpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIEFkZCBvbmUgZW1wdHkgY29uZGl0aW9uIGJ5IGRlZmF1bHRcbiAgICAgICAgYWRkQ29uZGl0aW9uKCk7XG4gICAgfVxuXG4gICAgY29udGFpbmVyLmFwcGVuZENoaWxkKGdyb3VwRGl2KTtcbiAgICB1cGRhdGVCcmVhZGNydW1iKCk7XG59XG5cbmZ1bmN0aW9uIGFkZEJ1aWxkZXJSb3codHlwZTogJ2dyb3VwJyB8ICdzb3J0JyB8ICdncm91cFNvcnQnLCBkYXRhPzogYW55KSB7XG4gICAgbGV0IGNvbnRhaW5lcklkID0gJyc7XG4gICAgaWYgKHR5cGUgPT09ICdncm91cCcpIGNvbnRhaW5lcklkID0gJ2dyb3VwLXJvd3MtY29udGFpbmVyJztcbiAgICBlbHNlIGlmICh0eXBlID09PSAnc29ydCcpIGNvbnRhaW5lcklkID0gJ3NvcnQtcm93cy1jb250YWluZXInO1xuICAgIGVsc2UgaWYgKHR5cGUgPT09ICdncm91cFNvcnQnKSBjb250YWluZXJJZCA9ICdncm91cC1zb3J0LXJvd3MtY29udGFpbmVyJztcblxuICAgIGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGNvbnRhaW5lcklkKTtcbiAgICBpZiAoIWNvbnRhaW5lcikgcmV0dXJuO1xuXG4gICAgY29uc3QgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgZGl2LmNsYXNzTmFtZSA9ICdidWlsZGVyLXJvdyc7XG4gICAgZGl2LmRhdGFzZXQudHlwZSA9IHR5cGU7XG5cbiAgICBpZiAodHlwZSA9PT0gJ2dyb3VwJykge1xuICAgICAgICBkaXYuc3R5bGUuZmxleFdyYXAgPSAnd3JhcCc7XG4gICAgICAgIGRpdi5pbm5lckhUTUwgPSBgXG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cInJvdy1udW1iZXJcIj48L3NwYW4+XG4gICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwic291cmNlLXNlbGVjdFwiPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJmaWVsZFwiPkZpZWxkPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImZpeGVkXCI+Rml4ZWQgVmFsdWU8L29wdGlvbj5cbiAgICAgICAgICAgIDwvc2VsZWN0PlxuXG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cImlucHV0LWNvbnRhaW5lclwiPlxuICAgICAgICAgICAgICAgICA8IS0tIFdpbGwgYmUgcG9wdWxhdGVkIGJhc2VkIG9uIHNvdXJjZSBzZWxlY3Rpb24gLS0+XG4gICAgICAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJmaWVsZC1zZWxlY3QgdmFsdWUtaW5wdXQtZmllbGRcIj5cbiAgICAgICAgICAgICAgICAgICAgJHtGSUVMRF9PUFRJT05TfVxuICAgICAgICAgICAgICAgICA8L3NlbGVjdD5cbiAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgY2xhc3M9XCJ2YWx1ZS1pbnB1dC10ZXh0XCIgcGxhY2Vob2xkZXI9XCJHcm91cCBOYW1lXCIgc3R5bGU9XCJkaXNwbGF5Om5vbmU7XCI+XG4gICAgICAgICAgICA8L3NwYW4+XG5cbiAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwibWFyZ2luLWxlZnQ6IDEwcHg7XCI+VHJhbnNmb3JtOjwvc3Bhbj5cbiAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJ0cmFuc2Zvcm0tc2VsZWN0XCI+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIm5vbmVcIj5Ob25lPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInN0cmlwVGxkXCI+U3RyaXAgVExEPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImRvbWFpblwiPkdldCBEb21haW48L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiaG9zdG5hbWVcIj5HZXQgSG9zdG5hbWU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwibG93ZXJjYXNlXCI+TG93ZXJjYXNlPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInVwcGVyY2FzZVwiPlVwcGVyY2FzZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJmaXJzdENoYXJcIj5GaXJzdCBDaGFyPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInJlZ2V4XCI+UmVnZXggRXh0cmFjdGlvbjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJyZWdleFJlcGxhY2VcIj5SZWdleCBSZXBsYWNlPC9vcHRpb24+XG4gICAgICAgICAgICA8L3NlbGVjdD5cblxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInJlZ2V4LWNvbnRhaW5lclwiIHN0eWxlPVwiZGlzcGxheTpub25lOyBmbGV4LWJhc2lzOiAxMDAlOyBtYXJnaW4tdG9wOiA4cHg7IHBhZGRpbmc6IDhweDsgYmFja2dyb3VuZDogI2Y4ZjlmYTsgYm9yZGVyOiAxcHggZGFzaGVkICNjZWQ0ZGE7IGJvcmRlci1yYWRpdXM6IDRweDtcIj5cbiAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTogZmxleDsgYWxpZ24taXRlbXM6IGNlbnRlcjsgZ2FwOiA4cHg7IG1hcmdpbi1ib3R0b206IDVweDtcIj5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJmb250LXdlaWdodDogNTAwOyBmb250LXNpemU6IDAuOWVtO1wiPlBhdHRlcm46PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInRleHRcIiBjbGFzcz1cInRyYW5zZm9ybS1wYXR0ZXJuXCIgcGxhY2Vob2xkZXI9XCJlLmcuIF4oXFx3KyktKFxcZCspJFwiIHN0eWxlPVwiZmxleDoxO1wiPlxuICAgICAgICAgICAgICAgICAgICA8c3BhbiB0aXRsZT1cIkZvciBleHRyYWN0aW9uOiBDYXB0dXJlcyBhbGwgZ3JvdXBzIGFuZCBjb25jYXRlbmF0ZXMgdGhlbS4gRXhhbXBsZTogJ3VzZXItKFxcZCspJyAtPiAnMTIzJy4gRm9yIHJlcGxhY2VtZW50OiBTdGFuZGFyZCBKUyByZWdleC5cIiBzdHlsZT1cImN1cnNvcjogaGVscDsgY29sb3I6ICMwMDdiZmY7IGZvbnQtd2VpZ2h0OiBib2xkOyBiYWNrZ3JvdW5kOiAjZTdmMWZmOyB3aWR0aDogMThweDsgaGVpZ2h0OiAxOHB4OyBkaXNwbGF5OiBpbmxpbmUtZmxleDsgYWxpZ24taXRlbXM6IGNlbnRlcjsganVzdGlmeS1jb250ZW50OiBjZW50ZXI7IGJvcmRlci1yYWRpdXM6IDUwJTsgZm9udC1zaXplOiAxMnB4O1wiPj88L3NwYW4+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cInJlcGxhY2VtZW50LWNvbnRhaW5lclwiIHN0eWxlPVwiZGlzcGxheTpub25lOyBhbGlnbi1pdGVtczogY2VudGVyOyBnYXA6IDhweDsgbWFyZ2luLWJvdHRvbTogNXB4O1wiPlxuICAgICAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cImZvbnQtd2VpZ2h0OiA1MDA7IGZvbnQtc2l6ZTogMC45ZW07XCI+UmVwbGFjZTo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwidGV4dFwiIGNsYXNzPVwidHJhbnNmb3JtLXJlcGxhY2VtZW50XCIgcGxhY2Vob2xkZXI9XCJlLmcuICQyICQxXCIgc3R5bGU9XCJmbGV4OjE7XCI+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6IGZsZXg7IGdhcDogOHB4OyBhbGlnbi1pdGVtczogY2VudGVyOyBmb250LXNpemU6IDAuOWVtO1wiPlxuICAgICAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cImZvbnQtd2VpZ2h0OiA1MDA7XCI+VGVzdDo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwidGV4dFwiIGNsYXNzPVwicmVnZXgtdGVzdC1pbnB1dFwiIHBsYWNlaG9sZGVyPVwiVGVzdCBTdHJpbmdcIiBzdHlsZT1cImZsZXg6IDE7XCI+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuPiZyYXJyOzwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJyZWdleC10ZXN0LXJlc3VsdFwiIHN0eWxlPVwiZm9udC1mYW1pbHk6IG1vbm9zcGFjZTsgYmFja2dyb3VuZDogd2hpdGU7IHBhZGRpbmc6IDJweCA1cHg7IGJvcmRlcjogMXB4IHNvbGlkICNkZGQ7IGJvcmRlci1yYWRpdXM6IDNweDsgbWluLXdpZHRoOiA2MHB4O1wiPihwcmV2aWV3KTwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgICA8c3BhbiBzdHlsZT1cIm1hcmdpbi1sZWZ0OiAxMHB4O1wiPldpbmRvdzo8L3NwYW4+XG4gICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwid2luZG93LW1vZGUtc2VsZWN0XCI+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImN1cnJlbnRcIj5DdXJyZW50PC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImNvbXBvdW5kXCI+Q29tcG91bmQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwibmV3XCI+TmV3PC9vcHRpb24+XG4gICAgICAgICAgICA8L3NlbGVjdD5cblxuICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJtYXJnaW4tbGVmdDogMTBweDtcIj5Db2xvcjo8L3NwYW4+XG4gICAgICAgICAgICA8c2VsZWN0IGNsYXNzPVwiY29sb3ItaW5wdXRcIj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZ3JleVwiPkdyZXk8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiYmx1ZVwiPkJsdWU8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwicmVkXCI+UmVkPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInllbGxvd1wiPlllbGxvdzwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJncmVlblwiPkdyZWVuPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInBpbmtcIj5QaW5rPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInB1cnBsZVwiPlB1cnBsZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJjeWFuXCI+Q3lhbjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJvcmFuZ2VcIj5PcmFuZ2U8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwibWF0Y2hcIj5NYXRjaCBWYWx1ZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJmaWVsZFwiPkNvbG9yIGJ5IEZpZWxkPC9vcHRpb24+XG4gICAgICAgICAgICA8L3NlbGVjdD5cbiAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJjb2xvci1maWVsZC1zZWxlY3RcIiBzdHlsZT1cImRpc3BsYXk6bm9uZTtcIj5cbiAgICAgICAgICAgICAgICAke0ZJRUxEX09QVElPTlN9XG4gICAgICAgICAgICA8L3NlbGVjdD5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiY29sb3ItdHJhbnNmb3JtLWNvbnRhaW5lclwiIHN0eWxlPVwiZGlzcGxheTpub25lOyBtYXJnaW4tbGVmdDogNXB4OyBhbGlnbi1pdGVtczogY2VudGVyO1wiPlxuICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiZm9udC1zaXplOiAwLjllbTsgbWFyZ2luLXJpZ2h0OiAzcHg7XCI+VHJhbnM6PC9zcGFuPlxuICAgICAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9XCJjb2xvci10cmFuc2Zvcm0tc2VsZWN0XCI+XG4gICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJub25lXCI+Tm9uZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwic3RyaXBUbGRcIj5TdHJpcCBUTEQ8L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImRvbWFpblwiPkdldCBEb21haW48L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImhvc3RuYW1lXCI+R2V0IEhvc3RuYW1lPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJsb3dlcmNhc2VcIj5Mb3dlcmNhc2U8L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInVwcGVyY2FzZVwiPlVwcGVyY2FzZTwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZmlyc3RDaGFyXCI+Rmlyc3QgQ2hhcjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwicmVnZXhcIj5SZWdleDwvb3B0aW9uPlxuICAgICAgICAgICAgICAgIDwvc2VsZWN0PlxuICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwidGV4dFwiIGNsYXNzPVwiY29sb3ItdHJhbnNmb3JtLXBhdHRlcm5cIiBwbGFjZWhvbGRlcj1cIlJlZ2V4XCIgc3R5bGU9XCJkaXNwbGF5Om5vbmU7IHdpZHRoOiA4MHB4OyBtYXJnaW4tbGVmdDogM3B4O1wiPlxuICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICAgICAgPGxhYmVsPjxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBjbGFzcz1cInJhbmRvbS1jb2xvci1jaGVja1wiIGNoZWNrZWQ+IFJhbmRvbTwvbGFiZWw+XG5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJyb3ctYWN0aW9uc1wiPlxuICAgICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJzbWFsbC1idG4gYnRuLWRlbFwiIHN0eWxlPVwiYmFja2dyb3VuZDogI2ZmY2NjYzsgY29sb3I6IGRhcmtyZWQ7XCI+RGVsZXRlPC9idXR0b24+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgYDtcblxuICAgICAgICAvLyBBZGQgc3BlY2lmaWMgbGlzdGVuZXJzIGZvciBHcm91cCByb3dcbiAgICAgICAgY29uc3Qgc291cmNlU2VsZWN0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5zb3VyY2Utc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IGZpZWxkU2VsZWN0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dC1maWVsZCcpIGFzIEhUTUxFbGVtZW50O1xuICAgICAgICBjb25zdCB0ZXh0SW5wdXQgPSBkaXYucXVlcnlTZWxlY3RvcignLnZhbHVlLWlucHV0LXRleHQnKSBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgY29uc3QgY29sb3JJbnB1dCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcuY29sb3ItaW5wdXQnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgY29uc3QgY29sb3JGaWVsZFNlbGVjdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcuY29sb3ItZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IGNvbG9yVHJhbnNmb3JtQ29udGFpbmVyID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5jb2xvci10cmFuc2Zvcm0tY29udGFpbmVyJykgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IGNvbG9yVHJhbnNmb3JtU2VsZWN0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5jb2xvci10cmFuc2Zvcm0tc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IGNvbG9yVHJhbnNmb3JtUGF0dGVybiA9IGRpdi5xdWVyeVNlbGVjdG9yKCcuY29sb3ItdHJhbnNmb3JtLXBhdHRlcm4nKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICBjb25zdCByYW5kb21DaGVjayA9IGRpdi5xdWVyeVNlbGVjdG9yKCcucmFuZG9tLWNvbG9yLWNoZWNrJykgYXMgSFRNTElucHV0RWxlbWVudDtcblxuICAgICAgICAvLyBSZWdleCBMb2dpY1xuICAgICAgICBjb25zdCB0cmFuc2Zvcm1TZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLnRyYW5zZm9ybS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgY29uc3QgcmVnZXhDb250YWluZXIgPSBkaXYucXVlcnlTZWxlY3RvcignLnJlZ2V4LWNvbnRhaW5lcicpIGFzIEhUTUxFbGVtZW50O1xuICAgICAgICBjb25zdCBwYXR0ZXJuSW5wdXQgPSBkaXYucXVlcnlTZWxlY3RvcignLnRyYW5zZm9ybS1wYXR0ZXJuJykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgY29uc3QgcmVwbGFjZW1lbnRJbnB1dCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcudHJhbnNmb3JtLXJlcGxhY2VtZW50JykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgY29uc3QgdGVzdElucHV0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5yZWdleC10ZXN0LWlucHV0JykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgY29uc3QgdGVzdFJlc3VsdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcucmVnZXgtdGVzdC1yZXN1bHQnKSBhcyBIVE1MRWxlbWVudDtcblxuICAgICAgICBjb25zdCB0b2dnbGVUcmFuc2Zvcm0gPSAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCB2YWwgPSB0cmFuc2Zvcm1TZWxlY3QudmFsdWU7XG4gICAgICAgICAgICBpZiAodmFsID09PSAncmVnZXgnIHx8IHZhbCA9PT0gJ3JlZ2V4UmVwbGFjZScpIHtcbiAgICAgICAgICAgICAgICByZWdleENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcbiAgICAgICAgICAgICAgICBjb25zdCByZXBDb250YWluZXIgPSBkaXYucXVlcnlTZWxlY3RvcignLnJlcGxhY2VtZW50LWNvbnRhaW5lcicpIGFzIEhUTUxFbGVtZW50O1xuICAgICAgICAgICAgICAgIGlmIChyZXBDb250YWluZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVwQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSB2YWwgPT09ICdyZWdleFJlcGxhY2UnID8gJ2ZsZXgnIDogJ25vbmUnO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmVnZXhDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHVwZGF0ZUJyZWFkY3J1bWIoKTtcbiAgICAgICAgfTtcbiAgICAgICAgdHJhbnNmb3JtU2VsZWN0LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIHRvZ2dsZVRyYW5zZm9ybSk7XG5cbiAgICAgICAgY29uc3QgdXBkYXRlVGVzdCA9ICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHBhdCA9IHBhdHRlcm5JbnB1dC52YWx1ZTtcbiAgICAgICAgICAgIGNvbnN0IHR4dCA9IHRlc3RJbnB1dC52YWx1ZTtcbiAgICAgICAgICAgIGlmICghcGF0IHx8ICF0eHQpIHtcbiAgICAgICAgICAgICAgICAgdGVzdFJlc3VsdC50ZXh0Q29udGVudCA9IFwiKHByZXZpZXcpXCI7XG4gICAgICAgICAgICAgICAgIHRlc3RSZXN1bHQuc3R5bGUuY29sb3IgPSBcIiM1NTVcIjtcbiAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBpZiAodHJhbnNmb3JtU2VsZWN0LnZhbHVlID09PSAncmVnZXhSZXBsYWNlJykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByZXAgPSByZXBsYWNlbWVudElucHV0LnZhbHVlIHx8IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlcyA9IHR4dC5yZXBsYWNlKG5ldyBSZWdFeHAocGF0LCAnZycpLCByZXApO1xuICAgICAgICAgICAgICAgICAgICB0ZXN0UmVzdWx0LnRleHRDb250ZW50ID0gcmVzO1xuICAgICAgICAgICAgICAgICAgICB0ZXN0UmVzdWx0LnN0eWxlLmNvbG9yID0gXCJncmVlblwiO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChwYXQpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtYXRjaCA9IHJlZ2V4LmV4ZWModHh0KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGV4dHJhY3RlZCA9IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBtYXRjaC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleHRyYWN0ZWQgKz0gbWF0Y2hbaV0gfHwgXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgdGVzdFJlc3VsdC50ZXh0Q29udGVudCA9IGV4dHJhY3RlZCB8fCBcIihlbXB0eSBncm91cClcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICB0ZXN0UmVzdWx0LnN0eWxlLmNvbG9yID0gXCJncmVlblwiO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgIHRlc3RSZXN1bHQudGV4dENvbnRlbnQgPSBcIihubyBtYXRjaClcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICB0ZXN0UmVzdWx0LnN0eWxlLmNvbG9yID0gXCJyZWRcIjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICB0ZXN0UmVzdWx0LnRleHRDb250ZW50ID0gXCIoaW52YWxpZCByZWdleClcIjtcbiAgICAgICAgICAgICAgICB0ZXN0UmVzdWx0LnN0eWxlLmNvbG9yID0gXCJyZWRcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgcGF0dGVybklucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgKCkgPT4geyB1cGRhdGVUZXN0KCk7IHVwZGF0ZUJyZWFkY3J1bWIoKTsgfSk7XG4gICAgICAgIGlmIChyZXBsYWNlbWVudElucHV0KSB7XG4gICAgICAgICAgICByZXBsYWNlbWVudElucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgKCkgPT4geyB1cGRhdGVUZXN0KCk7IHVwZGF0ZUJyZWFkY3J1bWIoKTsgfSk7XG4gICAgICAgIH1cbiAgICAgICAgdGVzdElucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgdXBkYXRlVGVzdCk7XG5cblxuICAgICAgICAvLyBUb2dnbGUgaW5wdXQgdHlwZVxuICAgICAgICBjb25zdCB0b2dnbGVJbnB1dCA9ICgpID0+IHtcbiAgICAgICAgICAgIGlmIChzb3VyY2VTZWxlY3QudmFsdWUgPT09ICdmaWVsZCcpIHtcbiAgICAgICAgICAgICAgICBmaWVsZFNlbGVjdC5zdHlsZS5kaXNwbGF5ID0gJ2lubGluZS1ibG9jayc7XG4gICAgICAgICAgICAgICAgdGV4dElucHV0LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGZpZWxkU2VsZWN0LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgICAgICAgICAgICAgdGV4dElucHV0LnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lLWJsb2NrJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHVwZGF0ZUJyZWFkY3J1bWIoKTtcbiAgICAgICAgfTtcbiAgICAgICAgc291cmNlU2VsZWN0LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIHRvZ2dsZUlucHV0KTtcblxuICAgICAgICAvLyBUb2dnbGUgY29sb3IgdHJhbnNmb3JtIHBhdHRlcm5cbiAgICAgICAgY29uc3QgdG9nZ2xlQ29sb3JUcmFuc2Zvcm0gPSAoKSA9PiB7XG4gICAgICAgICAgICAgaWYgKGNvbG9yVHJhbnNmb3JtU2VsZWN0LnZhbHVlID09PSAncmVnZXgnKSB7XG4gICAgICAgICAgICAgICAgIGNvbG9yVHJhbnNmb3JtUGF0dGVybi5zdHlsZS5kaXNwbGF5ID0gJ2lubGluZS1ibG9jayc7XG4gICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgICAgICAgICAgfVxuICAgICAgICAgICAgIHVwZGF0ZUJyZWFkY3J1bWIoKTtcbiAgICAgICAgfTtcbiAgICAgICAgY29sb3JUcmFuc2Zvcm1TZWxlY3QuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgdG9nZ2xlQ29sb3JUcmFuc2Zvcm0pO1xuICAgICAgICBjb2xvclRyYW5zZm9ybVBhdHRlcm4uYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCB1cGRhdGVCcmVhZGNydW1iKTtcblxuICAgICAgICAvLyBUb2dnbGUgY29sb3IgaW5wdXRcbiAgICAgICAgY29uc3QgdG9nZ2xlQ29sb3IgPSAoKSA9PiB7XG4gICAgICAgICAgICBpZiAocmFuZG9tQ2hlY2suY2hlY2tlZCkge1xuICAgICAgICAgICAgICAgIGNvbG9ySW5wdXQuZGlzYWJsZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGNvbG9ySW5wdXQuc3R5bGUub3BhY2l0eSA9ICcwLjUnO1xuICAgICAgICAgICAgICAgIGNvbG9yRmllbGRTZWxlY3Quc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgICAgICAgICBjb2xvclRyYW5zZm9ybUNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb2xvcklucHV0LmRpc2FibGVkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgY29sb3JJbnB1dC5zdHlsZS5vcGFjaXR5ID0gJzEnO1xuICAgICAgICAgICAgICAgIGlmIChjb2xvcklucHV0LnZhbHVlID09PSAnZmllbGQnKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbG9yRmllbGRTZWxlY3Quc3R5bGUuZGlzcGxheSA9ICdpbmxpbmUtYmxvY2snO1xuICAgICAgICAgICAgICAgICAgICBjb2xvclRyYW5zZm9ybUNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ2lubGluZS1mbGV4JztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBjb2xvckZpZWxkU2VsZWN0LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgICAgICAgICAgICAgICAgIGNvbG9yVHJhbnNmb3JtQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICByYW5kb21DaGVjay5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB0b2dnbGVDb2xvcik7XG4gICAgICAgIGNvbG9ySW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgdG9nZ2xlQ29sb3IpO1xuICAgICAgICB0b2dnbGVDb2xvcigpOyAvLyBpbml0XG5cbiAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdzb3J0JyB8fCB0eXBlID09PSAnZ3JvdXBTb3J0Jykge1xuICAgICAgICBkaXYuaW5uZXJIVE1MID0gYFxuICAgICAgICAgICAgPHNlbGVjdCBjbGFzcz1cImZpZWxkLXNlbGVjdFwiPlxuICAgICAgICAgICAgICAgICR7RklFTERfT1BUSU9OU31cbiAgICAgICAgICAgIDwvc2VsZWN0PlxuICAgICAgICAgICAgPHNlbGVjdCBjbGFzcz1cIm9yZGVyLXNlbGVjdFwiPlxuICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJhc2NcIj5hIHRvIHogKGFzYyk8L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZGVzY1wiPnogdG8gYSAoZGVzYyk8L29wdGlvbj5cbiAgICAgICAgICAgIDwvc2VsZWN0PlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInJvdy1hY3Rpb25zXCI+XG4gICAgICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJzbWFsbC1idG4gYnRuLWRlbFwiIHN0eWxlPVwiYmFja2dyb3VuZDogI2ZmY2NjYzsgY29sb3I6IGRhcmtyZWQ7XCI+RGVsZXRlPC9idXR0b24+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgYDtcbiAgICB9XG5cbiAgICAvLyBQb3B1bGF0ZSBkYXRhIGlmIHByb3ZpZGVkIChmb3IgZWRpdGluZylcbiAgICBpZiAoZGF0YSkge1xuICAgICAgICBpZiAodHlwZSA9PT0gJ2dyb3VwJykge1xuICAgICAgICAgICAgY29uc3Qgc291cmNlU2VsZWN0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5zb3VyY2Utc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgICAgICBjb25zdCBmaWVsZFNlbGVjdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcudmFsdWUtaW5wdXQtZmllbGQnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgICAgIGNvbnN0IHRleHRJbnB1dCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcudmFsdWUtaW5wdXQtdGV4dCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgICAgICBjb25zdCB0cmFuc2Zvcm1TZWxlY3QgPSBkaXYucXVlcnlTZWxlY3RvcignLnRyYW5zZm9ybS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgICAgIGNvbnN0IGNvbG9ySW5wdXQgPSBkaXYucXVlcnlTZWxlY3RvcignLmNvbG9yLWlucHV0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgICAgICBjb25zdCBjb2xvckZpZWxkU2VsZWN0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5jb2xvci1maWVsZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgICAgIGNvbnN0IGNvbG9yVHJhbnNmb3JtU2VsZWN0ID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5jb2xvci10cmFuc2Zvcm0tc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgICAgICBjb25zdCBjb2xvclRyYW5zZm9ybVBhdHRlcm4gPSBkaXYucXVlcnlTZWxlY3RvcignLmNvbG9yLXRyYW5zZm9ybS1wYXR0ZXJuJykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgICAgIGNvbnN0IHJhbmRvbUNoZWNrID0gZGl2LnF1ZXJ5U2VsZWN0b3IoJy5yYW5kb20tY29sb3ItY2hlY2snKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICAgICAgY29uc3Qgd2luZG93TW9kZVNlbGVjdCA9IGRpdi5xdWVyeVNlbGVjdG9yKCcud2luZG93LW1vZGUtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG5cbiAgICAgICAgICAgIGlmIChkYXRhLnNvdXJjZSkgc291cmNlU2VsZWN0LnZhbHVlID0gZGF0YS5zb3VyY2U7XG5cbiAgICAgICAgICAgIC8vIFRyaWdnZXIgdG9nZ2xlIHRvIHNob3cgY29ycmVjdCBpbnB1dFxuICAgICAgICAgICAgc291cmNlU2VsZWN0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnKSk7XG5cbiAgICAgICAgICAgIGlmIChkYXRhLnNvdXJjZSA9PT0gJ2ZpZWxkJykge1xuICAgICAgICAgICAgICAgIGlmIChkYXRhLnZhbHVlKSBmaWVsZFNlbGVjdC52YWx1ZSA9IGRhdGEudmFsdWU7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmIChkYXRhLnZhbHVlKSB0ZXh0SW5wdXQudmFsdWUgPSBkYXRhLnZhbHVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoZGF0YS50cmFuc2Zvcm0pIHRyYW5zZm9ybVNlbGVjdC52YWx1ZSA9IGRhdGEudHJhbnNmb3JtO1xuICAgICAgICAgICAgaWYgKGRhdGEudHJhbnNmb3JtUGF0dGVybikgKGRpdi5xdWVyeVNlbGVjdG9yKCcudHJhbnNmb3JtLXBhdHRlcm4nKSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSA9IGRhdGEudHJhbnNmb3JtUGF0dGVybjtcbiAgICAgICAgICAgIGlmIChkYXRhLnRyYW5zZm9ybVJlcGxhY2VtZW50KSAoZGl2LnF1ZXJ5U2VsZWN0b3IoJy50cmFuc2Zvcm0tcmVwbGFjZW1lbnQnKSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSA9IGRhdGEudHJhbnNmb3JtUmVwbGFjZW1lbnQ7XG5cbiAgICAgICAgICAgIC8vIFRyaWdnZXIgdG9nZ2xlIGZvciByZWdleCBVSVxuICAgICAgICAgICAgdHJhbnNmb3JtU2VsZWN0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnKSk7XG5cbiAgICAgICAgICAgIGlmIChkYXRhLndpbmRvd01vZGUpIHdpbmRvd01vZGVTZWxlY3QudmFsdWUgPSBkYXRhLndpbmRvd01vZGU7XG5cbiAgICAgICAgICAgIGlmIChkYXRhLmNvbG9yICYmIGRhdGEuY29sb3IgIT09ICdyYW5kb20nKSB7XG4gICAgICAgICAgICAgICAgcmFuZG9tQ2hlY2suY2hlY2tlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGNvbG9ySW5wdXQudmFsdWUgPSBkYXRhLmNvbG9yO1xuICAgICAgICAgICAgICAgIGlmIChkYXRhLmNvbG9yID09PSAnZmllbGQnICYmIGRhdGEuY29sb3JGaWVsZCkge1xuICAgICAgICAgICAgICAgICAgICBjb2xvckZpZWxkU2VsZWN0LnZhbHVlID0gZGF0YS5jb2xvckZpZWxkO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZGF0YS5jb2xvclRyYW5zZm9ybSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgIGNvbG9yVHJhbnNmb3JtU2VsZWN0LnZhbHVlID0gZGF0YS5jb2xvclRyYW5zZm9ybTtcbiAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZGF0YS5jb2xvclRyYW5zZm9ybVBhdHRlcm4pIGNvbG9yVHJhbnNmb3JtUGF0dGVybi52YWx1ZSA9IGRhdGEuY29sb3JUcmFuc2Zvcm1QYXR0ZXJuO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByYW5kb21DaGVjay5jaGVja2VkID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAvLyBUcmlnZ2VyIHRvZ2dsZSBjb2xvclxuICAgICAgICAgICAgcmFuZG9tQ2hlY2suZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScpKTtcbiAgICAgICAgICAgIGNvbG9yVHJhbnNmb3JtU2VsZWN0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnKSk7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3NvcnQnIHx8IHR5cGUgPT09ICdncm91cFNvcnQnKSB7XG4gICAgICAgICAgICAgaWYgKGRhdGEuZmllbGQpIChkaXYucXVlcnlTZWxlY3RvcignLmZpZWxkLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZSA9IGRhdGEuZmllbGQ7XG4gICAgICAgICAgICAgaWYgKGRhdGEub3JkZXIpIChkaXYucXVlcnlTZWxlY3RvcignLm9yZGVyLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZSA9IGRhdGEub3JkZXI7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBMaXN0ZW5lcnMgKEdlbmVyYWwpXG4gICAgZGl2LnF1ZXJ5U2VsZWN0b3IoJy5idG4tZGVsJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICBkaXYucmVtb3ZlKCk7XG4gICAgICAgIHVwZGF0ZUJyZWFkY3J1bWIoKTtcbiAgICB9KTtcblxuICAgIC8vIEFORCAvIE9SIGxpc3RlbmVycyAoVmlzdWFsIG1haW5seSwgb3IgYXBwZW5kaW5nIG5ldyByb3dzKVxuICAgIGRpdi5xdWVyeVNlbGVjdG9yKCcuYnRuLWFuZCcpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgYWRkQnVpbGRlclJvdyh0eXBlKTsgLy8gSnVzdCBhZGQgYW5vdGhlciByb3dcbiAgICB9KTtcblxuICAgIGRpdi5xdWVyeVNlbGVjdG9yQWxsKCdpbnB1dCwgc2VsZWN0JykuZm9yRWFjaChlbCA9PiB7XG4gICAgICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIHVwZGF0ZUJyZWFkY3J1bWIpO1xuICAgICAgICBlbC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIHVwZGF0ZUJyZWFkY3J1bWIpO1xuICAgIH0pO1xuXG4gICAgY29udGFpbmVyLmFwcGVuZENoaWxkKGRpdik7XG4gICAgdXBkYXRlQnJlYWRjcnVtYigpO1xufVxuXG5mdW5jdGlvbiBjbGVhckJ1aWxkZXIoKSB7XG4gICAgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1uYW1lJykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUgPSAnJztcbiAgICAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LWRlc2MnKSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSA9ICcnO1xuXG4gICAgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1hdXRvcnVuJykgYXMgSFRNTElucHV0RWxlbWVudCkuY2hlY2tlZCA9IGZhbHNlO1xuICAgIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtc2VwYXJhdGUtd2luZG93JykgYXMgSFRNTElucHV0RWxlbWVudCkuY2hlY2tlZCA9IGZhbHNlO1xuXG4gICAgY29uc3Qgc29ydEdyb3Vwc0NoZWNrID0gKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1zb3J0Z3JvdXBzLWNoZWNrJykgYXMgSFRNTElucHV0RWxlbWVudCk7XG4gICAgaWYgKHNvcnRHcm91cHNDaGVjaykge1xuICAgICAgICBzb3J0R3JvdXBzQ2hlY2suY2hlY2tlZCA9IGZhbHNlO1xuICAgICAgICAvLyBUcmlnZ2VyIGNoYW5nZSB0byBoaWRlIGNvbnRhaW5lclxuICAgICAgICBzb3J0R3JvdXBzQ2hlY2suZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScpKTtcbiAgICB9XG5cbiAgICBjb25zdCBsb2FkU2VsZWN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0ZWd5LWxvYWQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgaWYgKGxvYWRTZWxlY3QpIGxvYWRTZWxlY3QudmFsdWUgPSAnJztcblxuICAgIFsnZmlsdGVyLXJvd3MtY29udGFpbmVyJywgJ2dyb3VwLXJvd3MtY29udGFpbmVyJywgJ3NvcnQtcm93cy1jb250YWluZXInLCAnZ3JvdXAtc29ydC1yb3dzLWNvbnRhaW5lciddLmZvckVhY2goaWQgPT4ge1xuICAgICAgICBjb25zdCBlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGlkKTtcbiAgICAgICAgaWYgKGVsKSBlbC5pbm5lckhUTUwgPSAnJztcbiAgICB9KTtcblxuICAgIGNvbnN0IGJ1aWxkZXJSZXN1bHRzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J1aWxkZXItcmVzdWx0cycpO1xuICAgIGlmIChidWlsZGVyUmVzdWx0cykgYnVpbGRlclJlc3VsdHMuaW5uZXJIVE1MID0gJyc7XG5cbiAgICBhZGRGaWx0ZXJHcm91cFJvdygpOyAvLyBSZXNldCB3aXRoIG9uZSBlbXB0eSBmaWx0ZXIgZ3JvdXBcbiAgICB1cGRhdGVCcmVhZGNydW1iKCk7XG59XG5cbmZ1bmN0aW9uIGV4cG9ydEJ1aWxkZXJTdHJhdGVneSgpIHtcbiAgICBjb25zdCBzdHJhdCA9IGdldEJ1aWxkZXJTdHJhdGVneSgpO1xuICAgIGlmICghc3RyYXQpIHtcbiAgICAgICAgYWxlcnQoXCJQbGVhc2UgZGVmaW5lIGEgc3RyYXRlZ3kgdG8gZXhwb3J0IChJRCBhbmQgTGFiZWwgcmVxdWlyZWQpLlwiKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBsb2dJbmZvKFwiRXhwb3J0aW5nIHN0cmF0ZWd5XCIsIHsgaWQ6IHN0cmF0LmlkIH0pO1xuICAgIGNvbnN0IGpzb24gPSBKU09OLnN0cmluZ2lmeShzdHJhdCwgbnVsbCwgMik7XG4gICAgY29uc3QgY29udGVudCA9IGBcbiAgICAgICAgPHA+Q29weSB0aGUgSlNPTiBiZWxvdzo8L3A+XG4gICAgICAgIDx0ZXh0YXJlYSBzdHlsZT1cIndpZHRoOiAxMDAlOyBoZWlnaHQ6IDMwMHB4OyBmb250LWZhbWlseTogbW9ub3NwYWNlO1wiPiR7ZXNjYXBlSHRtbChqc29uKX08L3RleHRhcmVhPlxuICAgIGA7XG4gICAgc2hvd01vZGFsKFwiRXhwb3J0IFN0cmF0ZWd5XCIsIGNvbnRlbnQpO1xufVxuXG5mdW5jdGlvbiBpbXBvcnRCdWlsZGVyU3RyYXRlZ3koKSB7XG4gICAgY29uc3QgY29udGVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGNvbnRlbnQuaW5uZXJIVE1MID0gYFxuICAgICAgICA8cD5QYXN0ZSBTdHJhdGVneSBKU09OIGJlbG93OjwvcD5cbiAgICAgICAgPHRleHRhcmVhIGlkPVwiaW1wb3J0LXN0cmF0LWFyZWFcIiBzdHlsZT1cIndpZHRoOiAxMDAlOyBoZWlnaHQ6IDIwMHB4OyBmb250LWZhbWlseTogbW9ub3NwYWNlOyBtYXJnaW4tYm90dG9tOiAxMHB4O1wiPjwvdGV4dGFyZWE+XG4gICAgICAgIDxidXR0b24gaWQ9XCJpbXBvcnQtc3RyYXQtY29uZmlybVwiIGNsYXNzPVwic3VjY2Vzcy1idG5cIj5Mb2FkPC9idXR0b24+XG4gICAgYDtcblxuICAgIGNvbnN0IGJ0biA9IGNvbnRlbnQucXVlcnlTZWxlY3RvcignI2ltcG9ydC1zdHJhdC1jb25maXJtJyk7XG4gICAgYnRuPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgY29uc3QgdHh0ID0gKGNvbnRlbnQucXVlcnlTZWxlY3RvcignI2ltcG9ydC1zdHJhdC1hcmVhJykgYXMgSFRNTFRleHRBcmVhRWxlbWVudCkudmFsdWU7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBqc29uID0gSlNPTi5wYXJzZSh0eHQpO1xuICAgICAgICAgICAgaWYgKCFqc29uLmlkIHx8ICFqc29uLmxhYmVsKSB7XG4gICAgICAgICAgICAgICAgYWxlcnQoXCJJbnZhbGlkIHN0cmF0ZWd5OiBJRCBhbmQgTGFiZWwgYXJlIHJlcXVpcmVkLlwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsb2dJbmZvKFwiSW1wb3J0aW5nIHN0cmF0ZWd5XCIsIHsgaWQ6IGpzb24uaWQgfSk7XG4gICAgICAgICAgICBwb3B1bGF0ZUJ1aWxkZXJGcm9tU3RyYXRlZ3koanNvbik7XG4gICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcubW9kYWwtb3ZlcmxheScpPy5yZW1vdmUoKTtcbiAgICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgICBhbGVydChcIkludmFsaWQgSlNPTjogXCIgKyBlKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgc2hvd01vZGFsKFwiSW1wb3J0IFN0cmF0ZWd5XCIsIGNvbnRlbnQpO1xufVxuXG5mdW5jdGlvbiBleHBvcnRBbGxTdHJhdGVnaWVzKCkge1xuICAgIGxvZ0luZm8oXCJFeHBvcnRpbmcgYWxsIHN0cmF0ZWdpZXNcIiwgeyBjb3VudDogbG9jYWxDdXN0b21TdHJhdGVnaWVzLmxlbmd0aCB9KTtcbiAgICBjb25zdCBqc29uID0gSlNPTi5zdHJpbmdpZnkobG9jYWxDdXN0b21TdHJhdGVnaWVzLCBudWxsLCAyKTtcbiAgICBjb25zdCBjb250ZW50ID0gYFxuICAgICAgICA8cD5Db3B5IHRoZSBKU09OIGJlbG93IChjb250YWlucyAke2xvY2FsQ3VzdG9tU3RyYXRlZ2llcy5sZW5ndGh9IHN0cmF0ZWdpZXMpOjwvcD5cbiAgICAgICAgPHRleHRhcmVhIHN0eWxlPVwid2lkdGg6IDEwMCU7IGhlaWdodDogMzAwcHg7IGZvbnQtZmFtaWx5OiBtb25vc3BhY2U7XCI+JHtlc2NhcGVIdG1sKGpzb24pfTwvdGV4dGFyZWE+XG4gICAgYDtcbiAgICBzaG93TW9kYWwoXCJFeHBvcnQgQWxsIFN0cmF0ZWdpZXNcIiwgY29udGVudCk7XG59XG5cbmZ1bmN0aW9uIGltcG9ydEFsbFN0cmF0ZWdpZXMoKSB7XG4gICAgY29uc3QgY29udGVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGNvbnRlbnQuaW5uZXJIVE1MID0gYFxuICAgICAgICA8cD5QYXN0ZSBTdHJhdGVneSBMaXN0IEpTT04gYmVsb3c6PC9wPlxuICAgICAgICA8cCBzdHlsZT1cImZvbnQtc2l6ZTogMC45ZW07IGNvbG9yOiAjNjY2O1wiPk5vdGU6IFN0cmF0ZWdpZXMgd2l0aCBtYXRjaGluZyBJRHMgd2lsbCBiZSBvdmVyd3JpdHRlbi48L3A+XG4gICAgICAgIDx0ZXh0YXJlYSBpZD1cImltcG9ydC1hbGwtYXJlYVwiIHN0eWxlPVwid2lkdGg6IDEwMCU7IGhlaWdodDogMjAwcHg7IGZvbnQtZmFtaWx5OiBtb25vc3BhY2U7IG1hcmdpbi1ib3R0b206IDEwcHg7XCI+PC90ZXh0YXJlYT5cbiAgICAgICAgPGJ1dHRvbiBpZD1cImltcG9ydC1hbGwtY29uZmlybVwiIGNsYXNzPVwic3VjY2Vzcy1idG5cIj5JbXBvcnQgQWxsPC9idXR0b24+XG4gICAgYDtcblxuICAgIGNvbnN0IGJ0biA9IGNvbnRlbnQucXVlcnlTZWxlY3RvcignI2ltcG9ydC1hbGwtY29uZmlybScpO1xuICAgIGJ0bj8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBhc3luYyAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHR4dCA9IChjb250ZW50LnF1ZXJ5U2VsZWN0b3IoJyNpbXBvcnQtYWxsLWFyZWEnKSBhcyBIVE1MVGV4dEFyZWFFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGpzb24gPSBKU09OLnBhcnNlKHR4dCk7XG4gICAgICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkoanNvbikpIHtcbiAgICAgICAgICAgICAgICBhbGVydChcIkludmFsaWQgZm9ybWF0OiBFeHBlY3RlZCBhbiBhcnJheSBvZiBzdHJhdGVnaWVzLlwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFZhbGlkYXRlIGl0ZW1zXG4gICAgICAgICAgICBjb25zdCBpbnZhbGlkID0ganNvbi5maW5kKHMgPT4gIXMuaWQgfHwgIXMubGFiZWwpO1xuICAgICAgICAgICAgaWYgKGludmFsaWQpIHtcbiAgICAgICAgICAgICAgICBhbGVydChcIkludmFsaWQgc3RyYXRlZ3kgaW4gbGlzdDogbWlzc2luZyBJRCBvciBMYWJlbC5cIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBNZXJnZSBsb2dpYyAoVXBzZXJ0KVxuICAgICAgICAgICAgY29uc3Qgc3RyYXRNYXAgPSBuZXcgTWFwKGxvY2FsQ3VzdG9tU3RyYXRlZ2llcy5tYXAocyA9PiBbcy5pZCwgc10pKTtcblxuICAgICAgICAgICAgbGV0IGNvdW50ID0gMDtcbiAgICAgICAgICAgIGpzb24uZm9yRWFjaCgoczogQ3VzdG9tU3RyYXRlZ3kpID0+IHtcbiAgICAgICAgICAgICAgICBzdHJhdE1hcC5zZXQocy5pZCwgcyk7XG4gICAgICAgICAgICAgICAgY291bnQrKztcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBjb25zdCBuZXdTdHJhdGVnaWVzID0gQXJyYXkuZnJvbShzdHJhdE1hcC52YWx1ZXMoKSk7XG5cbiAgICAgICAgICAgIGxvZ0luZm8oXCJJbXBvcnRpbmcgYWxsIHN0cmF0ZWdpZXNcIiwgeyBjb3VudDogbmV3U3RyYXRlZ2llcy5sZW5ndGggfSk7XG5cbiAgICAgICAgICAgIC8vIFNhdmVcbiAgICAgICAgICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnc2F2ZVByZWZlcmVuY2VzJyxcbiAgICAgICAgICAgICAgICBwYXlsb2FkOiB7IGN1c3RvbVN0cmF0ZWdpZXM6IG5ld1N0cmF0ZWdpZXMgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIFVwZGF0ZSBsb2NhbCBzdGF0ZVxuICAgICAgICAgICAgbG9jYWxDdXN0b21TdHJhdGVnaWVzID0gbmV3U3RyYXRlZ2llcztcbiAgICAgICAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMobG9jYWxDdXN0b21TdHJhdGVnaWVzKTtcblxuICAgICAgICAgICAgcmVuZGVyU3RyYXRlZ3lMb2FkT3B0aW9ucygpO1xuICAgICAgICAgICAgcmVuZGVyU3RyYXRlZ3lMaXN0VGFibGUoKTtcbiAgICAgICAgICAgIHJlbmRlckFsZ29yaXRobXNWaWV3KCk7XG5cbiAgICAgICAgICAgIGFsZXJ0KGBJbXBvcnRlZCAke2NvdW50fSBzdHJhdGVnaWVzLmApO1xuICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLm1vZGFsLW92ZXJsYXknKT8ucmVtb3ZlKCk7XG5cbiAgICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgICBhbGVydChcIkludmFsaWQgSlNPTjogXCIgKyBlKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgc2hvd01vZGFsKFwiSW1wb3J0IEFsbCBTdHJhdGVnaWVzXCIsIGNvbnRlbnQpO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVCcmVhZGNydW1iKCkge1xuICAgIGNvbnN0IGJyZWFkY3J1bWIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXRlZ3ktYnJlYWRjcnVtYicpO1xuICAgIGlmICghYnJlYWRjcnVtYikgcmV0dXJuO1xuXG4gICAgbGV0IHRleHQgPSAnQWxsJztcblxuICAgIC8vIEZpbHRlcnNcbiAgICBjb25zdCBmaWx0ZXJzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2ZpbHRlci1yb3dzLWNvbnRhaW5lcicpPy5xdWVyeVNlbGVjdG9yQWxsKCcuYnVpbGRlci1yb3cnKTtcbiAgICBpZiAoZmlsdGVycyAmJiBmaWx0ZXJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgZmlsdGVycy5mb3JFYWNoKHJvdyA9PiB7XG4gICAgICAgICAgICAgY29uc3QgZmllbGQgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5maWVsZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICAgY29uc3Qgb3AgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5vcGVyYXRvci1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICAgY29uc3QgdmFsID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcudmFsdWUtaW5wdXQnKSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgICBpZiAodmFsKSB0ZXh0ICs9IGAgPiAke2ZpZWxkfSAke29wfSAke3ZhbH1gO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBHcm91cHNcbiAgICBjb25zdCBncm91cHMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ3JvdXAtcm93cy1jb250YWluZXInKT8ucXVlcnlTZWxlY3RvckFsbCgnLmJ1aWxkZXItcm93Jyk7XG4gICAgaWYgKGdyb3VwcyAmJiBncm91cHMubGVuZ3RoID4gMCkge1xuICAgICAgICBncm91cHMuZm9yRWFjaChyb3cgPT4ge1xuICAgICAgICAgICAgIGNvbnN0IHNvdXJjZSA9IChyb3cucXVlcnlTZWxlY3RvcignLnNvdXJjZS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICAgbGV0IHZhbCA9IFwiXCI7XG4gICAgICAgICAgICAgaWYgKHNvdXJjZSA9PT0gJ2ZpZWxkJykge1xuICAgICAgICAgICAgICAgICB2YWwgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dC1maWVsZCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICAgICAgICAgICAgICAgdGV4dCArPSBgID4gR3JvdXAgYnkgRmllbGQ6ICR7dmFsfWA7XG4gICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgdmFsID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcudmFsdWUtaW5wdXQtdGV4dCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgICAgICB0ZXh0ICs9IGAgPiBHcm91cCBieSBOYW1lOiBcIiR7dmFsfVwiYDtcbiAgICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIEdyb3VwIFNvcnRzXG4gICAgY29uc3QgZ3JvdXBTb3J0cyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdncm91cC1zb3J0LXJvd3MtY29udGFpbmVyJyk/LnF1ZXJ5U2VsZWN0b3JBbGwoJy5idWlsZGVyLXJvdycpO1xuICAgIGlmIChncm91cFNvcnRzICYmIGdyb3VwU29ydHMubGVuZ3RoID4gMCkge1xuICAgICAgICBncm91cFNvcnRzLmZvckVhY2gocm93ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcuZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgY29uc3Qgb3JkZXIgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5vcmRlci1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICB0ZXh0ICs9IGAgPiBHcm91cCBzb3J0IGJ5ICR7ZmllbGR9ICgke29yZGVyfSlgO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBTb3J0c1xuICAgIGNvbnN0IHNvcnRzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NvcnQtcm93cy1jb250YWluZXInKT8ucXVlcnlTZWxlY3RvckFsbCgnLmJ1aWxkZXItcm93Jyk7XG4gICAgaWYgKHNvcnRzICYmIHNvcnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgc29ydHMuZm9yRWFjaChyb3cgPT4ge1xuICAgICAgICAgICAgIGNvbnN0IGZpZWxkID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcuZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgIGNvbnN0IG9yZGVyID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcub3JkZXItc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgIHRleHQgKz0gYCA+IFNvcnQgYnkgJHtmaWVsZH0gKCR7b3JkZXJ9KWA7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGJyZWFkY3J1bWIudGV4dENvbnRlbnQgPSB0ZXh0O1xufVxuXG5mdW5jdGlvbiBnZXRCdWlsZGVyU3RyYXRlZ3koaWdub3JlVmFsaWRhdGlvbjogYm9vbGVhbiA9IGZhbHNlKTogQ3VzdG9tU3RyYXRlZ3kgfCBudWxsIHtcbiAgICBjb25zdCBpZElucHV0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmF0LW5hbWUnKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgIGNvbnN0IGxhYmVsSW5wdXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtZGVzYycpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG5cbiAgICBsZXQgaWQgPSBpZElucHV0ID8gaWRJbnB1dC52YWx1ZS50cmltKCkgOiAnJztcbiAgICBsZXQgbGFiZWwgPSBsYWJlbElucHV0ID8gbGFiZWxJbnB1dC52YWx1ZS50cmltKCkgOiAnJztcbiAgICBjb25zdCBmYWxsYmFjayA9ICdNaXNjJzsgLy8gRmFsbGJhY2sgcmVtb3ZlZCBmcm9tIFVJLCBkZWZhdWx0IHRvIE1pc2NcbiAgICBjb25zdCBzb3J0R3JvdXBzID0gKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1zb3J0Z3JvdXBzLWNoZWNrJykgYXMgSFRNTElucHV0RWxlbWVudCkuY2hlY2tlZDtcblxuICAgIGlmICghaWdub3JlVmFsaWRhdGlvbiAmJiAoIWlkIHx8ICFsYWJlbCkpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgaWYgKGlnbm9yZVZhbGlkYXRpb24pIHtcbiAgICAgICAgaWYgKCFpZCkgaWQgPSAndGVtcF9zaW1faWQnO1xuICAgICAgICBpZiAoIWxhYmVsKSBsYWJlbCA9ICdTaW11bGF0aW9uJztcbiAgICB9XG5cbiAgICBjb25zdCBmaWx0ZXJHcm91cHM6IFJ1bGVDb25kaXRpb25bXVtdID0gW107XG4gICAgY29uc3QgZmlsdGVyQ29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2ZpbHRlci1yb3dzLWNvbnRhaW5lcicpO1xuXG4gICAgLy8gUGFyc2UgZmlsdGVyIGdyb3Vwc1xuICAgIGlmIChmaWx0ZXJDb250YWluZXIpIHtcbiAgICAgICAgY29uc3QgZ3JvdXBSb3dzID0gZmlsdGVyQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5maWx0ZXItZ3JvdXAtcm93Jyk7XG4gICAgICAgIGlmIChncm91cFJvd3MubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgZ3JvdXBSb3dzLmZvckVhY2goZ3JvdXBSb3cgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvbmRpdGlvbnM6IFJ1bGVDb25kaXRpb25bXSA9IFtdO1xuICAgICAgICAgICAgICAgIGdyb3VwUm93LnF1ZXJ5U2VsZWN0b3JBbGwoJy5idWlsZGVyLXJvdycpLmZvckVhY2gocm93ID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZmllbGQgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy5maWVsZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG9wZXJhdG9yID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcub3BlcmF0b3Itc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlIGFzIGFueTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdmFsdWUgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICAgICAgICAgICAgICAvLyBPbmx5IGFkZCBpZiB2YWx1ZSBpcyBwcmVzZW50IG9yIG9wZXJhdG9yIGRvZXNuJ3QgcmVxdWlyZSBpdFxuICAgICAgICAgICAgICAgICAgICBpZiAodmFsdWUgfHwgWydleGlzdHMnLCAnZG9lc05vdEV4aXN0JywgJ2lzTnVsbCcsICdpc05vdE51bGwnXS5pbmNsdWRlcyhvcGVyYXRvcikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbmRpdGlvbnMucHVzaCh7IGZpZWxkLCBvcGVyYXRvciwgdmFsdWUgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBpZiAoY29uZGl0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGZpbHRlckdyb3Vwcy5wdXNoKGNvbmRpdGlvbnMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gRm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHkgLyBzaW1wbGUgc3RyYXRlZ2llcywgcG9wdWxhdGUgZmlsdGVycyB3aXRoIHRoZSBmaXJzdCBncm91cFxuICAgIGNvbnN0IGZpbHRlcnM6IFJ1bGVDb25kaXRpb25bXSA9IGZpbHRlckdyb3Vwcy5sZW5ndGggPiAwID8gZmlsdGVyR3JvdXBzWzBdIDogW107XG5cbiAgICBjb25zdCBncm91cGluZ1J1bGVzOiBHcm91cGluZ1J1bGVbXSA9IFtdO1xuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdncm91cC1yb3dzLWNvbnRhaW5lcicpPy5xdWVyeVNlbGVjdG9yQWxsKCcuYnVpbGRlci1yb3cnKS5mb3JFYWNoKHJvdyA9PiB7XG4gICAgICAgIGNvbnN0IHNvdXJjZSA9IChyb3cucXVlcnlTZWxlY3RvcignLnNvdXJjZS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWUgYXMgXCJmaWVsZFwiIHwgXCJmaXhlZFwiO1xuICAgICAgICBsZXQgdmFsdWUgPSBcIlwiO1xuICAgICAgICBpZiAoc291cmNlID09PSAnZmllbGQnKSB7XG4gICAgICAgICAgICB2YWx1ZSA9IChyb3cucXVlcnlTZWxlY3RvcignLnZhbHVlLWlucHV0LWZpZWxkJykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWUgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy52YWx1ZS1pbnB1dC10ZXh0JykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB0cmFuc2Zvcm0gPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy50cmFuc2Zvcm0tc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlIGFzIGFueTtcbiAgICAgICAgY29uc3QgdHJhbnNmb3JtUGF0dGVybiA9IChyb3cucXVlcnlTZWxlY3RvcignLnRyYW5zZm9ybS1wYXR0ZXJuJykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWU7XG4gICAgICAgIGNvbnN0IHRyYW5zZm9ybVJlcGxhY2VtZW50ID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcudHJhbnNmb3JtLXJlcGxhY2VtZW50JykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWU7XG4gICAgICAgIGNvbnN0IHdpbmRvd01vZGUgPSAocm93LnF1ZXJ5U2VsZWN0b3IoJy53aW5kb3ctbW9kZS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCkudmFsdWUgYXMgYW55O1xuXG4gICAgICAgIGNvbnN0IHJhbmRvbUNoZWNrID0gcm93LnF1ZXJ5U2VsZWN0b3IoJy5yYW5kb20tY29sb3ItY2hlY2snKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICBjb25zdCBjb2xvcklucHV0ID0gcm93LnF1ZXJ5U2VsZWN0b3IoJy5jb2xvci1pbnB1dCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICBjb25zdCBjb2xvckZpZWxkU2VsZWN0ID0gcm93LnF1ZXJ5U2VsZWN0b3IoJy5jb2xvci1maWVsZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgY29uc3QgY29sb3JUcmFuc2Zvcm1TZWxlY3QgPSByb3cucXVlcnlTZWxlY3RvcignLmNvbG9yLXRyYW5zZm9ybS1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICAgICAgY29uc3QgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuID0gcm93LnF1ZXJ5U2VsZWN0b3IoJy5jb2xvci10cmFuc2Zvcm0tcGF0dGVybicpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG5cbiAgICAgICAgbGV0IGNvbG9yID0gJ3JhbmRvbSc7XG4gICAgICAgIGxldCBjb2xvckZpZWxkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICAgIGxldCBjb2xvclRyYW5zZm9ybTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgICBsZXQgY29sb3JUcmFuc2Zvcm1QYXR0ZXJuVmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICAgICAgICBpZiAoIXJhbmRvbUNoZWNrLmNoZWNrZWQpIHtcbiAgICAgICAgICAgIGNvbG9yID0gY29sb3JJbnB1dC52YWx1ZTtcbiAgICAgICAgICAgIGlmIChjb2xvciA9PT0gJ2ZpZWxkJykge1xuICAgICAgICAgICAgICAgIGNvbG9yRmllbGQgPSBjb2xvckZpZWxkU2VsZWN0LnZhbHVlO1xuICAgICAgICAgICAgICAgIGNvbG9yVHJhbnNmb3JtID0gY29sb3JUcmFuc2Zvcm1TZWxlY3QudmFsdWUgYXMgYW55O1xuICAgICAgICAgICAgICAgIGlmIChjb2xvclRyYW5zZm9ybSA9PT0gJ3JlZ2V4Jykge1xuICAgICAgICAgICAgICAgICAgICBjb2xvclRyYW5zZm9ybVBhdHRlcm5WYWx1ZSA9IGNvbG9yVHJhbnNmb3JtUGF0dGVybi52YWx1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgICAgIGdyb3VwaW5nUnVsZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgc291cmNlLFxuICAgICAgICAgICAgICAgIHZhbHVlLFxuICAgICAgICAgICAgICAgIGNvbG9yLFxuICAgICAgICAgICAgICAgIGNvbG9yRmllbGQsXG4gICAgICAgICAgICAgICAgY29sb3JUcmFuc2Zvcm06IGNvbG9yVHJhbnNmb3JtIGFzIGFueSxcbiAgICAgICAgICAgICAgICBjb2xvclRyYW5zZm9ybVBhdHRlcm46IGNvbG9yVHJhbnNmb3JtUGF0dGVyblZhbHVlLFxuICAgICAgICAgICAgICAgIHRyYW5zZm9ybSxcbiAgICAgICAgICAgICAgICB0cmFuc2Zvcm1QYXR0ZXJuOiAodHJhbnNmb3JtID09PSAncmVnZXgnIHx8IHRyYW5zZm9ybSA9PT0gJ3JlZ2V4UmVwbGFjZScpID8gdHJhbnNmb3JtUGF0dGVybiA6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICB0cmFuc2Zvcm1SZXBsYWNlbWVudDogdHJhbnNmb3JtID09PSAncmVnZXhSZXBsYWNlJyA/IHRyYW5zZm9ybVJlcGxhY2VtZW50IDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgICAgIHdpbmRvd01vZGVcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBjb25zdCBzb3J0aW5nUnVsZXM6IFNvcnRpbmdSdWxlW10gPSBbXTtcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc29ydC1yb3dzLWNvbnRhaW5lcicpPy5xdWVyeVNlbGVjdG9yQWxsKCcuYnVpbGRlci1yb3cnKS5mb3JFYWNoKHJvdyA9PiB7XG4gICAgICAgIGNvbnN0IGZpZWxkID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcuZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICBjb25zdCBvcmRlciA9IChyb3cucXVlcnlTZWxlY3RvcignLm9yZGVyLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZSBhcyBhbnk7XG4gICAgICAgIHNvcnRpbmdSdWxlcy5wdXNoKHsgZmllbGQsIG9yZGVyIH0pO1xuICAgIH0pO1xuXG4gICAgY29uc3QgZ3JvdXBTb3J0aW5nUnVsZXM6IFNvcnRpbmdSdWxlW10gPSBbXTtcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ3JvdXAtc29ydC1yb3dzLWNvbnRhaW5lcicpPy5xdWVyeVNlbGVjdG9yQWxsKCcuYnVpbGRlci1yb3cnKS5mb3JFYWNoKHJvdyA9PiB7XG4gICAgICAgIGNvbnN0IGZpZWxkID0gKHJvdy5xdWVyeVNlbGVjdG9yKCcuZmllbGQtc2VsZWN0JykgYXMgSFRNTFNlbGVjdEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICBjb25zdCBvcmRlciA9IChyb3cucXVlcnlTZWxlY3RvcignLm9yZGVyLXNlbGVjdCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZSBhcyBhbnk7XG4gICAgICAgIGdyb3VwU29ydGluZ1J1bGVzLnB1c2goeyBmaWVsZCwgb3JkZXIgfSk7XG4gICAgfSk7XG4gICAgY29uc3QgYXBwbGllZEdyb3VwU29ydGluZ1J1bGVzID0gc29ydEdyb3VwcyA/IGdyb3VwU29ydGluZ1J1bGVzIDogW107XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBpZCxcbiAgICAgICAgbGFiZWwsXG4gICAgICAgIGZpbHRlcnMsXG4gICAgICAgIGZpbHRlckdyb3VwcyxcbiAgICAgICAgZ3JvdXBpbmdSdWxlcyxcbiAgICAgICAgc29ydGluZ1J1bGVzLFxuICAgICAgICBncm91cFNvcnRpbmdSdWxlczogYXBwbGllZEdyb3VwU29ydGluZ1J1bGVzLFxuICAgICAgICBmYWxsYmFjayxcbiAgICAgICAgc29ydEdyb3Vwc1xuICAgIH07XG59XG5cbmZ1bmN0aW9uIHJ1bkJ1aWxkZXJTaW11bGF0aW9uKCkge1xuICAgIC8vIFBhc3MgdHJ1ZSB0byBpZ25vcmUgdmFsaWRhdGlvbiBzbyB3ZSBjYW4gc2ltdWxhdGUgd2l0aG91dCBJRC9MYWJlbFxuICAgIGNvbnN0IHN0cmF0ID0gZ2V0QnVpbGRlclN0cmF0ZWd5KHRydWUpO1xuICAgIGNvbnN0IHJlc3VsdENvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdidWlsZGVyLXJlc3VsdHMnKTtcbiAgICBjb25zdCBuZXdTdGF0ZVBhbmVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ25ldy1zdGF0ZS1wYW5lbCcpO1xuXG4gICAgaWYgKCFzdHJhdCkgcmV0dXJuOyAvLyBTaG91bGQgbm90IGhhcHBlbiB3aXRoIGlnbm9yZVZhbGlkYXRpb249dHJ1ZVxuXG4gICAgbG9nSW5mbyhcIlJ1bm5pbmcgYnVpbGRlciBzaW11bGF0aW9uXCIsIHsgc3RyYXRlZ3k6IHN0cmF0LmlkIH0pO1xuXG4gICAgLy8gRm9yIHNpbXVsYXRpb24sIHdlIGNhbiBtb2NrIGFuIElEL0xhYmVsIGlmIG1pc3NpbmdcbiAgICBjb25zdCBzaW1TdHJhdDogQ3VzdG9tU3RyYXRlZ3kgPSBzdHJhdDtcblxuICAgIGlmICghcmVzdWx0Q29udGFpbmVyIHx8ICFuZXdTdGF0ZVBhbmVsKSByZXR1cm47XG5cbiAgICAvLyBTaG93IHRoZSBwYW5lbFxuICAgIG5ld1N0YXRlUGFuZWwuc3R5bGUuZGlzcGxheSA9ICdmbGV4JztcblxuICAgIC8vIFVwZGF0ZSBsb2NhbEN1c3RvbVN0cmF0ZWdpZXMgdGVtcG9yYXJpbHkgZm9yIFNpbVxuICAgIGNvbnN0IG9yaWdpbmFsU3RyYXRlZ2llcyA9IFsuLi5sb2NhbEN1c3RvbVN0cmF0ZWdpZXNdO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgLy8gUmVwbGFjZSBvciBhZGRcbiAgICAgICAgY29uc3QgZXhpc3RpbmdJZHggPSBsb2NhbEN1c3RvbVN0cmF0ZWdpZXMuZmluZEluZGV4KHMgPT4gcy5pZCA9PT0gc2ltU3RyYXQuaWQpO1xuICAgICAgICBpZiAoZXhpc3RpbmdJZHggIT09IC0xKSB7XG4gICAgICAgICAgICBsb2NhbEN1c3RvbVN0cmF0ZWdpZXNbZXhpc3RpbmdJZHhdID0gc2ltU3RyYXQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsb2NhbEN1c3RvbVN0cmF0ZWdpZXMucHVzaChzaW1TdHJhdCk7XG4gICAgICAgIH1cbiAgICAgICAgc2V0Q3VzdG9tU3RyYXRlZ2llcyhsb2NhbEN1c3RvbVN0cmF0ZWdpZXMpO1xuXG4gICAgICAgIC8vIFJ1biBMb2dpY1xuICAgICAgICBsZXQgdGFicyA9IGdldE1hcHBlZFRhYnMoKTtcblxuICAgICAgICBpZiAodGFicy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHJlc3VsdENvbnRhaW5lci5pbm5lckhUTUwgPSAnPHA+Tm8gdGFicyBmb3VuZCB0byBzaW11bGF0ZS48L3A+JztcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEFwcGx5IFNpbXVsYXRlZCBTZWxlY3Rpb24gT3ZlcnJpZGVcbiAgICAgICAgaWYgKHNpbXVsYXRlZFNlbGVjdGlvbi5zaXplID4gMCkge1xuICAgICAgICAgICAgdGFicyA9IHRhYnMubWFwKHQgPT4gKHtcbiAgICAgICAgICAgICAgICAuLi50LFxuICAgICAgICAgICAgICAgIHNlbGVjdGVkOiBzaW11bGF0ZWRTZWxlY3Rpb24uaGFzKHQuaWQpXG4gICAgICAgICAgICB9KSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBTb3J0IHVzaW5nIHRoaXMgc3RyYXRlZ3k/XG4gICAgICAgIC8vIHNvcnRUYWJzIGV4cGVjdHMgU29ydGluZ1N0cmF0ZWd5W10uXG4gICAgICAgIC8vIElmIHdlIHVzZSB0aGlzIHN0cmF0ZWd5IGZvciBzb3J0aW5nLi4uXG4gICAgICAgIHRhYnMgPSBzb3J0VGFicyh0YWJzLCBbc2ltU3RyYXQuaWRdKTtcblxuICAgICAgICAvLyBHcm91cCB1c2luZyB0aGlzIHN0cmF0ZWd5XG4gICAgICAgIGNvbnN0IGdyb3VwcyA9IGdyb3VwVGFicyh0YWJzLCBbc2ltU3RyYXQuaWRdKTtcblxuICAgICAgICAvLyBDaGVjayBpZiB3ZSBzaG91bGQgc2hvdyBhIGZhbGxiYWNrIHJlc3VsdCAoZS5nLiBTb3J0IE9ubHkpXG4gICAgICAgIC8vIElmIG5vIGdyb3VwcyB3ZXJlIGNyZWF0ZWQsIGJ1dCB3ZSBoYXZlIHRhYnMsIGFuZCB0aGUgc3RyYXRlZ3kgaXMgbm90IGEgZ3JvdXBpbmcgc3RyYXRlZ3ksXG4gICAgICAgIC8vIHdlIHNob3cgdGhlIHRhYnMgYXMgYSBzaW5nbGUgbGlzdC5cbiAgICAgICAgaWYgKGdyb3Vwcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIGNvbnN0IHN0cmF0RGVmID0gZ2V0U3RyYXRlZ2llcyhsb2NhbEN1c3RvbVN0cmF0ZWdpZXMpLmZpbmQocyA9PiBzLmlkID09PSBzaW1TdHJhdC5pZCk7XG4gICAgICAgICAgICBpZiAoc3RyYXREZWYgJiYgIXN0cmF0RGVmLmlzR3JvdXBpbmcpIHtcbiAgICAgICAgICAgICAgICBncm91cHMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIGlkOiAnc2ltLXNvcnRlZCcsXG4gICAgICAgICAgICAgICAgICAgIHdpbmRvd0lkOiAwLFxuICAgICAgICAgICAgICAgICAgICBsYWJlbDogJ1NvcnRlZCBSZXN1bHRzIChObyBHcm91cGluZyknLFxuICAgICAgICAgICAgICAgICAgICBjb2xvcjogJ2dyZXknLFxuICAgICAgICAgICAgICAgICAgICB0YWJzOiB0YWJzLFxuICAgICAgICAgICAgICAgICAgICByZWFzb246ICdTb3J0IE9ubHknXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBSZW5kZXIgUmVzdWx0c1xuICAgICAgICBpZiAoZ3JvdXBzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgcmVzdWx0Q29udGFpbmVyLmlubmVySFRNTCA9ICc8cD5ObyBncm91cHMgY3JlYXRlZC48L3A+JztcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHJlc3VsdENvbnRhaW5lci5pbm5lckhUTUwgPSBncm91cHMubWFwKGdyb3VwID0+IGBcbiAgICA8ZGl2IGNsYXNzPVwiZ3JvdXAtcmVzdWx0XCIgc3R5bGU9XCJtYXJnaW4tYm90dG9tOiAxMHB4OyBib3JkZXI6IDFweCBzb2xpZCAjZGRkOyBib3JkZXItcmFkaXVzOiA0cHg7IG92ZXJmbG93OiBoaWRkZW47XCI+XG4gICAgICA8ZGl2IGNsYXNzPVwiZ3JvdXAtaGVhZGVyXCIgc3R5bGU9XCJib3JkZXItbGVmdDogNXB4IHNvbGlkICR7Z3JvdXAuY29sb3J9OyBwYWRkaW5nOiA1cHg7IGJhY2tncm91bmQ6ICNmOGY5ZmE7IGZvbnQtc2l6ZTogMC45ZW07IGZvbnQtd2VpZ2h0OiBib2xkOyBkaXNwbGF5OiBmbGV4OyBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47XCI+XG4gICAgICAgIDxzcGFuPiR7ZXNjYXBlSHRtbChncm91cC5sYWJlbCB8fCAnVW5ncm91cGVkJyl9PC9zcGFuPlxuICAgICAgICA8c3BhbiBjbGFzcz1cImdyb3VwLW1ldGFcIiBzdHlsZT1cImZvbnQtd2VpZ2h0OiBub3JtYWw7IGZvbnQtc2l6ZTogMC44ZW07IGNvbG9yOiAjNjY2O1wiPiR7Z3JvdXAudGFicy5sZW5ndGh9PC9zcGFuPlxuICAgICAgPC9kaXY+XG4gICAgICA8dWwgY2xhc3M9XCJncm91cC10YWJzXCIgc3R5bGU9XCJsaXN0LXN0eWxlOiBub25lOyBtYXJnaW46IDA7IHBhZGRpbmc6IDA7XCI+XG4gICAgICAgICR7Z3JvdXAudGFicy5tYXAodGFiID0+IGBcbiAgICAgICAgICA8bGkgY2xhc3M9XCJncm91cC10YWItaXRlbVwiIHN0eWxlPVwicGFkZGluZzogNHB4IDVweDsgYm9yZGVyLXRvcDogMXB4IHNvbGlkICNlZWU7IGRpc3BsYXk6IGZsZXg7IGdhcDogNXB4OyBhbGlnbi1pdGVtczogY2VudGVyOyBmb250LXNpemU6IDAuODVlbTtcIj5cbiAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJ3aWR0aDogMTJweDsgaGVpZ2h0OiAxMnB4OyBiYWNrZ3JvdW5kOiAjZWVlOyBib3JkZXItcmFkaXVzOiAycHg7IGZsZXgtc2hyaW5rOiAwO1wiPlxuICAgICAgICAgICAgICAgICR7dGFiLmZhdkljb25VcmwgPyBgPGltZyBzcmM9XCIke2VzY2FwZUh0bWwodGFiLmZhdkljb25VcmwpfVwiIHN0eWxlPVwid2lkdGg6IDEwMCU7IGhlaWdodDogMTAwJTsgb2JqZWN0LWZpdDogY292ZXI7XCIgb25lcnJvcj1cInRoaXMuc3R5bGUuZGlzcGxheT0nbm9uZSdcIj5gIDogJyd9XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwidGl0bGUtY2VsbFwiIHRpdGxlPVwiJHtlc2NhcGVIdG1sKHRhYi50aXRsZSl9XCIgc3R5bGU9XCJ3aGl0ZS1zcGFjZTogbm93cmFwOyBvdmVyZmxvdzogaGlkZGVuOyB0ZXh0LW92ZXJmbG93OiBlbGxpcHNpcztcIj4ke2VzY2FwZUh0bWwodGFiLnRpdGxlKX08L3NwYW4+XG4gICAgICAgICAgPC9saT5cbiAgICAgICAgYCkuam9pbignJyl9XG4gICAgICA8L3VsPlxuICAgIDwvZGl2PlxuICBgKS5qb2luKCcnKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJTaW11bGF0aW9uIGZhaWxlZFwiLCBlKTtcbiAgICAgICAgcmVzdWx0Q29udGFpbmVyLmlubmVySFRNTCA9IGA8cCBzdHlsZT1cImNvbG9yOiByZWQ7XCI+U2ltdWxhdGlvbiBmYWlsZWQ6ICR7ZX08L3A+YDtcbiAgICAgICAgYWxlcnQoXCJTaW11bGF0aW9uIGZhaWxlZDogXCIgKyBlKTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgICAvLyBSZXN0b3JlIHN0cmF0ZWdpZXNcbiAgICAgICAgbG9jYWxDdXN0b21TdHJhdGVnaWVzID0gb3JpZ2luYWxTdHJhdGVnaWVzO1xuICAgICAgICBzZXRDdXN0b21TdHJhdGVnaWVzKGxvY2FsQ3VzdG9tU3RyYXRlZ2llcyk7XG4gICAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBzYXZlQ3VzdG9tU3RyYXRlZ3lGcm9tQnVpbGRlcihzaG93U3VjY2VzcyA9IHRydWUpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBjb25zdCBzdHJhdCA9IGdldEJ1aWxkZXJTdHJhdGVneSgpO1xuICAgIGlmICghc3RyYXQpIHtcbiAgICAgICAgYWxlcnQoXCJQbGVhc2UgZmlsbCBpbiBJRCBhbmQgTGFiZWwuXCIpO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiBzYXZlU3RyYXRlZ3koc3RyYXQsIHNob3dTdWNjZXNzKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gc2F2ZVN0cmF0ZWd5KHN0cmF0OiBDdXN0b21TdHJhdGVneSwgc2hvd1N1Y2Nlc3M6IGJvb2xlYW4pOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICB0cnkge1xuICAgICAgICBsb2dJbmZvKFwiU2F2aW5nIHN0cmF0ZWd5XCIsIHsgaWQ6IHN0cmF0LmlkIH0pO1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2xvYWRQcmVmZXJlbmNlcycgfSk7XG4gICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vayAmJiByZXNwb25zZS5kYXRhKSB7XG4gICAgICAgICAgICBjb25zdCBwcmVmcyA9IHJlc3BvbnNlLmRhdGEgYXMgUHJlZmVyZW5jZXM7XG4gICAgICAgICAgICBsZXQgY3VycmVudFN0cmF0ZWdpZXMgPSBwcmVmcy5jdXN0b21TdHJhdGVnaWVzIHx8IFtdO1xuXG4gICAgICAgICAgICAvLyBGaW5kIGV4aXN0aW5nIHRvIHByZXNlcnZlIHByb3BzIChsaWtlIGF1dG9SdW4pXG4gICAgICAgICAgICBjb25zdCBleGlzdGluZyA9IGN1cnJlbnRTdHJhdGVnaWVzLmZpbmQocyA9PiBzLmlkID09PSBzdHJhdC5pZCk7XG4gICAgICAgICAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgICAgICAgICAgICBzdHJhdC5hdXRvUnVuID0gZXhpc3RpbmcuYXV0b1J1bjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gUmVtb3ZlIGV4aXN0aW5nIGlmIHNhbWUgSURcbiAgICAgICAgICAgIGN1cnJlbnRTdHJhdGVnaWVzID0gY3VycmVudFN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gcy5pZCAhPT0gc3RyYXQuaWQpO1xuICAgICAgICAgICAgY3VycmVudFN0cmF0ZWdpZXMucHVzaChzdHJhdCk7XG5cbiAgICAgICAgICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnc2F2ZVByZWZlcmVuY2VzJyxcbiAgICAgICAgICAgICAgICBwYXlsb2FkOiB7IGN1c3RvbVN0cmF0ZWdpZXM6IGN1cnJlbnRTdHJhdGVnaWVzIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBsb2NhbEN1c3RvbVN0cmF0ZWdpZXMgPSBjdXJyZW50U3RyYXRlZ2llcztcbiAgICAgICAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMobG9jYWxDdXN0b21TdHJhdGVnaWVzKTtcblxuICAgICAgICAgICAgcmVuZGVyU3RyYXRlZ3lMb2FkT3B0aW9ucygpO1xuICAgICAgICAgICAgcmVuZGVyU3RyYXRlZ3lMaXN0VGFibGUoKTtcbiAgICAgICAgICAgIHJlbmRlckFsZ29yaXRobXNWaWV3KCk7XG4gICAgICAgICAgICBpZiAoc2hvd1N1Y2Nlc3MpIGFsZXJ0KFwiU3RyYXRlZ3kgc2F2ZWQhXCIpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBzYXZlIHN0cmF0ZWd5XCIsIGUpO1xuICAgICAgICBhbGVydChcIkVycm9yIHNhdmluZyBzdHJhdGVneVwiKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gcnVuQnVpbGRlckxpdmUoKSB7XG4gICAgY29uc3Qgc3RyYXQgPSBnZXRCdWlsZGVyU3RyYXRlZ3koKTtcbiAgICBpZiAoIXN0cmF0KSB7XG4gICAgICAgIGFsZXJ0KFwiUGxlYXNlIGZpbGwgaW4gSUQgYW5kIExhYmVsIHRvIHJ1biBsaXZlLlwiKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxvZ0luZm8oXCJBcHBseWluZyBzdHJhdGVneSBsaXZlXCIsIHsgaWQ6IHN0cmF0LmlkIH0pO1xuXG4gICAgLy8gU2F2ZSBzaWxlbnRseSBmaXJzdCB0byBlbnN1cmUgYmFja2VuZCBoYXMgdGhlIGRlZmluaXRpb25cbiAgICBjb25zdCBzYXZlZCA9IGF3YWl0IHNhdmVTdHJhdGVneShzdHJhdCwgZmFsc2UpO1xuICAgIGlmICghc2F2ZWQpIHJldHVybjtcblxuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgdHlwZTogJ2FwcGx5R3JvdXBpbmcnLFxuICAgICAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgICAgICAgIHNvcnRpbmc6IFtzdHJhdC5pZF1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9rKSB7XG4gICAgICAgICAgICBhbGVydChcIkFwcGxpZWQgc3VjY2Vzc2Z1bGx5IVwiKTtcbiAgICAgICAgICAgIGxvYWRUYWJzKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBhbGVydChcIkZhaWxlZCB0byBhcHBseTogXCIgKyAocmVzcG9uc2UuZXJyb3IgfHwgJ1Vua25vd24gZXJyb3InKSk7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJBcHBseSBmYWlsZWRcIiwgZSk7XG4gICAgICAgIGFsZXJ0KFwiQXBwbHkgZmFpbGVkOiBcIiArIGUpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gcG9wdWxhdGVCdWlsZGVyRnJvbVN0cmF0ZWd5KHN0cmF0OiBDdXN0b21TdHJhdGVneSkge1xuICAgIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtbmFtZScpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlID0gc3RyYXQuaWQ7XG4gICAgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHJhdC1kZXNjJykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUgPSBzdHJhdC5sYWJlbDtcblxuICAgIGNvbnN0IHNvcnRHcm91cHNDaGVjayA9IChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtc29ydGdyb3Vwcy1jaGVjaycpIGFzIEhUTUxJbnB1dEVsZW1lbnQpO1xuICAgIGNvbnN0IGhhc0dyb3VwU29ydCA9ICEhKHN0cmF0Lmdyb3VwU29ydGluZ1J1bGVzICYmIHN0cmF0Lmdyb3VwU29ydGluZ1J1bGVzLmxlbmd0aCA+IDApIHx8ICEhc3RyYXQuc29ydEdyb3VwcztcbiAgICBzb3J0R3JvdXBzQ2hlY2suY2hlY2tlZCA9IGhhc0dyb3VwU29ydDtcbiAgICBzb3J0R3JvdXBzQ2hlY2suZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScpKTtcblxuICAgIGNvbnN0IGF1dG9SdW5DaGVjayA9IChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXQtYXV0b3J1bicpIGFzIEhUTUxJbnB1dEVsZW1lbnQpO1xuICAgIGF1dG9SdW5DaGVjay5jaGVja2VkID0gISFzdHJhdC5hdXRvUnVuO1xuXG4gICAgWydmaWx0ZXItcm93cy1jb250YWluZXInLCAnZ3JvdXAtcm93cy1jb250YWluZXInLCAnc29ydC1yb3dzLWNvbnRhaW5lcicsICdncm91cC1zb3J0LXJvd3MtY29udGFpbmVyJ10uZm9yRWFjaChpZCA9PiB7XG4gICAgICAgIGNvbnN0IGVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaWQpO1xuICAgICAgICBpZiAoZWwpIGVsLmlubmVySFRNTCA9ICcnO1xuICAgIH0pO1xuXG4gICAgaWYgKHN0cmF0LmZpbHRlckdyb3VwcyAmJiBzdHJhdC5maWx0ZXJHcm91cHMubGVuZ3RoID4gMCkge1xuICAgICAgICBzdHJhdC5maWx0ZXJHcm91cHMuZm9yRWFjaChnID0+IGFkZEZpbHRlckdyb3VwUm93KGcpKTtcbiAgICB9IGVsc2UgaWYgKHN0cmF0LmZpbHRlcnMgJiYgc3RyYXQuZmlsdGVycy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGFkZEZpbHRlckdyb3VwUm93KHN0cmF0LmZpbHRlcnMpO1xuICAgIH1cblxuICAgIHN0cmF0Lmdyb3VwaW5nUnVsZXM/LmZvckVhY2goZyA9PiBhZGRCdWlsZGVyUm93KCdncm91cCcsIGcpKTtcbiAgICBzdHJhdC5zb3J0aW5nUnVsZXM/LmZvckVhY2gocyA9PiBhZGRCdWlsZGVyUm93KCdzb3J0JywgcykpO1xuICAgIHN0cmF0Lmdyb3VwU29ydGluZ1J1bGVzPy5mb3JFYWNoKGdzID0+IGFkZEJ1aWxkZXJSb3coJ2dyb3VwU29ydCcsIGdzKSk7XG5cbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjdmlldy1zdHJhdGVnaWVzJyk/LnNjcm9sbEludG9WaWV3KHsgYmVoYXZpb3I6ICdzbW9vdGgnIH0pO1xuICAgIHVwZGF0ZUJyZWFkY3J1bWIoKTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyU3RyYXRlZ3lMb2FkT3B0aW9ucygpIHtcbiAgICBjb25zdCBzZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXRlZ3ktbG9hZC1zZWxlY3QnKSBhcyBIVE1MU2VsZWN0RWxlbWVudCB8IG51bGw7XG4gICAgaWYgKCFzZWxlY3QpIHJldHVybjtcblxuICAgIGNvbnN0IGN1c3RvbU9wdGlvbnMgPSBsb2NhbEN1c3RvbVN0cmF0ZWdpZXNcbiAgICAgICAgLnNsaWNlKClcbiAgICAgICAgLnNvcnQoKGEsIGIpID0+IGEubGFiZWwubG9jYWxlQ29tcGFyZShiLmxhYmVsKSlcbiAgICAgICAgLm1hcChzdHJhdGVneSA9PiBgXG4gICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiJHtlc2NhcGVIdG1sKHN0cmF0ZWd5LmlkKX1cIj4ke2VzY2FwZUh0bWwoc3RyYXRlZ3kubGFiZWwpfSAoJHtlc2NhcGVIdG1sKHN0cmF0ZWd5LmlkKX0pPC9vcHRpb24+XG4gICAgICAgIGApLmpvaW4oJycpO1xuXG4gICAgY29uc3QgYnVpbHRJbk9wdGlvbnMgPSBTVFJBVEVHSUVTXG4gICAgICAgIC5maWx0ZXIocyA9PiAhbG9jYWxDdXN0b21TdHJhdGVnaWVzLnNvbWUoY3MgPT4gY3MuaWQgPT09IHMuaWQpKVxuICAgICAgICAubWFwKHN0cmF0ZWd5ID0+IGBcbiAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCIke2VzY2FwZUh0bWwoc3RyYXRlZ3kuaWQgYXMgc3RyaW5nKX1cIj4ke2VzY2FwZUh0bWwoc3RyYXRlZ3kubGFiZWwpfSAoQnVpbHQtaW4pPC9vcHRpb24+XG4gICAgICAgIGApLmpvaW4oJycpO1xuXG4gICAgc2VsZWN0LmlubmVySFRNTCA9IGA8b3B0aW9uIHZhbHVlPVwiXCI+TG9hZCBzYXZlZCBzdHJhdGVneS4uLjwvb3B0aW9uPmAgK1xuICAgICAgICAoY3VzdG9tT3B0aW9ucyA/IGA8b3B0Z3JvdXAgbGFiZWw9XCJDdXN0b20gU3RyYXRlZ2llc1wiPiR7Y3VzdG9tT3B0aW9uc308L29wdGdyb3VwPmAgOiAnJykgK1xuICAgICAgICAoYnVpbHRJbk9wdGlvbnMgPyBgPG9wdGdyb3VwIGxhYmVsPVwiQnVpbHQtaW4gU3RyYXRlZ2llc1wiPiR7YnVpbHRJbk9wdGlvbnN9PC9vcHRncm91cD5gIDogJycpO1xufVxuXG5mdW5jdGlvbiByZW5kZXJTdHJhdGVneUxpc3RUYWJsZSgpIHtcbiAgICBjb25zdCB0YWJsZUJvZHkgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyYXRlZ3ktdGFibGUtYm9keScpO1xuICAgIGlmICghdGFibGVCb2R5KSByZXR1cm47XG5cbiAgICBjb25zdCBjdXN0b21JZHMgPSBuZXcgU2V0KGxvY2FsQ3VzdG9tU3RyYXRlZ2llcy5tYXAoc3RyYXRlZ3kgPT4gc3RyYXRlZ3kuaWQpKTtcbiAgICBjb25zdCBidWlsdEluUm93cyA9IFNUUkFURUdJRVMubWFwKHN0cmF0ZWd5ID0+ICh7XG4gICAgICAgIC4uLnN0cmF0ZWd5LFxuICAgICAgICBzb3VyY2VMYWJlbDogJ0J1aWx0LWluJyxcbiAgICAgICAgY29uZmlnU3VtbWFyeTogJ1x1MjAxNCcsXG4gICAgICAgIGF1dG9SdW5MYWJlbDogJ1x1MjAxNCcsXG4gICAgICAgIGFjdGlvbnM6ICcnXG4gICAgfSkpO1xuXG4gICAgY29uc3QgY3VzdG9tUm93cyA9IGxvY2FsQ3VzdG9tU3RyYXRlZ2llcy5tYXAoc3RyYXRlZ3kgPT4ge1xuICAgICAgICBjb25zdCBvdmVycmlkZXNCdWlsdEluID0gY3VzdG9tSWRzLmhhcyhzdHJhdGVneS5pZCkgJiYgU1RSQVRFR0lFUy5zb21lKGJ1aWx0SW4gPT4gYnVpbHRJbi5pZCA9PT0gc3RyYXRlZ3kuaWQpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgaWQ6IHN0cmF0ZWd5LmlkLFxuICAgICAgICAgICAgbGFiZWw6IHN0cmF0ZWd5LmxhYmVsLFxuICAgICAgICAgICAgaXNHcm91cGluZzogdHJ1ZSxcbiAgICAgICAgICAgIGlzU29ydGluZzogdHJ1ZSxcbiAgICAgICAgICAgIHNvdXJjZUxhYmVsOiBvdmVycmlkZXNCdWlsdEluID8gJ0N1c3RvbSAob3ZlcnJpZGVzIGJ1aWx0LWluKScgOiAnQ3VzdG9tJyxcbiAgICAgICAgICAgIGNvbmZpZ1N1bW1hcnk6IGBGaWx0ZXJzOiAke3N0cmF0ZWd5LmZpbHRlcnM/Lmxlbmd0aCB8fCAwfSwgR3JvdXBzOiAke3N0cmF0ZWd5Lmdyb3VwaW5nUnVsZXM/Lmxlbmd0aCB8fCAwfSwgU29ydHM6ICR7c3RyYXRlZ3kuc29ydGluZ1J1bGVzPy5sZW5ndGggfHwgMH1gLFxuICAgICAgICAgICAgYXV0b1J1bkxhYmVsOiBzdHJhdGVneS5hdXRvUnVuID8gJ1llcycgOiAnTm8nLFxuICAgICAgICAgICAgYWN0aW9uczogYDxidXR0b24gY2xhc3M9XCJkZWxldGUtc3RyYXRlZ3ktcm93XCIgZGF0YS1pZD1cIiR7ZXNjYXBlSHRtbChzdHJhdGVneS5pZCl9XCIgc3R5bGU9XCJjb2xvcjogcmVkO1wiPkRlbGV0ZTwvYnV0dG9uPmBcbiAgICAgICAgfTtcbiAgICB9KTtcblxuICAgIGNvbnN0IGFsbFJvd3MgPSBbLi4uYnVpbHRJblJvd3MsIC4uLmN1c3RvbVJvd3NdO1xuXG4gICAgaWYgKGFsbFJvd3MubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHRhYmxlQm9keS5pbm5lckhUTUwgPSAnPHRyPjx0ZCBjb2xzcGFuPVwiN1wiIHN0eWxlPVwiY29sb3I6ICM4ODg7XCI+Tm8gc3RyYXRlZ2llcyBmb3VuZC48L3RkPjwvdHI+JztcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRhYmxlQm9keS5pbm5lckhUTUwgPSBhbGxSb3dzLm1hcChyb3cgPT4ge1xuICAgICAgICBjb25zdCBjYXBhYmlsaXRpZXMgPSBbcm93LmlzR3JvdXBpbmcgPyAnR3JvdXBpbmcnIDogbnVsbCwgcm93LmlzU29ydGluZyA/ICdTb3J0aW5nJyA6IG51bGxdLmZpbHRlcihCb29sZWFuKS5qb2luKCcsICcpO1xuICAgICAgICByZXR1cm4gYFxuICAgICAgICA8dHI+XG4gICAgICAgICAgICA8dGQ+JHtlc2NhcGVIdG1sKHJvdy5sYWJlbCl9PC90ZD5cbiAgICAgICAgICAgIDx0ZD4ke2VzY2FwZUh0bWwoU3RyaW5nKHJvdy5pZCkpfTwvdGQ+XG4gICAgICAgICAgICA8dGQ+JHtlc2NhcGVIdG1sKHJvdy5zb3VyY2VMYWJlbCl9PC90ZD5cbiAgICAgICAgICAgIDx0ZD4ke2VzY2FwZUh0bWwoY2FwYWJpbGl0aWVzKX08L3RkPlxuICAgICAgICAgICAgPHRkPiR7ZXNjYXBlSHRtbChyb3cuY29uZmlnU3VtbWFyeSl9PC90ZD5cbiAgICAgICAgICAgIDx0ZD4ke2VzY2FwZUh0bWwocm93LmF1dG9SdW5MYWJlbCl9PC90ZD5cbiAgICAgICAgICAgIDx0ZD4ke3Jvdy5hY3Rpb25zfTwvdGQ+XG4gICAgICAgIDwvdHI+XG4gICAgICAgIGA7XG4gICAgfSkuam9pbignJyk7XG5cbiAgICB0YWJsZUJvZHkucXVlcnlTZWxlY3RvckFsbCgnLmRlbGV0ZS1zdHJhdGVneS1yb3cnKS5mb3JFYWNoKGJ0biA9PiB7XG4gICAgICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGFzeW5jIChlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBpZCA9IChlLnRhcmdldCBhcyBIVE1MRWxlbWVudCkuZGF0YXNldC5pZDtcbiAgICAgICAgICAgIGlmIChpZCAmJiBjb25maXJtKGBEZWxldGUgc3RyYXRlZ3kgXCIke2lkfVwiP2ApKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgZGVsZXRlQ3VzdG9tU3RyYXRlZ3koaWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZGVsZXRlQ3VzdG9tU3RyYXRlZ3koaWQ6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICAgIGxvZ0luZm8oXCJEZWxldGluZyBzdHJhdGVneVwiLCB7IGlkIH0pO1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2xvYWRQcmVmZXJlbmNlcycgfSk7XG4gICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vayAmJiByZXNwb25zZS5kYXRhKSB7XG4gICAgICAgICAgICBjb25zdCBwcmVmcyA9IHJlc3BvbnNlLmRhdGEgYXMgUHJlZmVyZW5jZXM7XG4gICAgICAgICAgICBjb25zdCBuZXdTdHJhdGVnaWVzID0gKHByZWZzLmN1c3RvbVN0cmF0ZWdpZXMgfHwgW10pLmZpbHRlcihzID0+IHMuaWQgIT09IGlkKTtcblxuICAgICAgICAgICAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICAgIHR5cGU6ICdzYXZlUHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgICAgIHBheWxvYWQ6IHsgY3VzdG9tU3RyYXRlZ2llczogbmV3U3RyYXRlZ2llcyB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgbG9jYWxDdXN0b21TdHJhdGVnaWVzID0gbmV3U3RyYXRlZ2llcztcbiAgICAgICAgICAgIHNldEN1c3RvbVN0cmF0ZWdpZXMobG9jYWxDdXN0b21TdHJhdGVnaWVzKTtcbiAgICAgICAgICAgIHJlbmRlclN0cmF0ZWd5TG9hZE9wdGlvbnMoKTtcbiAgICAgICAgICAgIHJlbmRlclN0cmF0ZWd5TGlzdFRhYmxlKCk7XG4gICAgICAgICAgICByZW5kZXJBbGdvcml0aG1zVmlldygpO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGRlbGV0ZSBzdHJhdGVneVwiLCBlKTtcbiAgICB9XG59XG5cbi8vIC4uLiBHZW5lcmEgbWFuYWdlbWVudCAuLi4gKGtlcHQgYXMgaXMpXG5mdW5jdGlvbiByZW5kZXJDdXN0b21HZW5lcmFMaXN0KGN1c3RvbUdlbmVyYTogUmVjb3JkPHN0cmluZywgc3RyaW5nPikge1xuICAgIGNvbnN0IGxpc3RDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY3VzdG9tLWdlbmVyYS1saXN0Jyk7XG4gICAgaWYgKCFsaXN0Q29udGFpbmVyKSByZXR1cm47XG5cbiAgICBpZiAoT2JqZWN0LmtleXMoY3VzdG9tR2VuZXJhKS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgbGlzdENvbnRhaW5lci5pbm5lckhUTUwgPSAnPHAgc3R5bGU9XCJjb2xvcjogIzg4ODsgZm9udC1zdHlsZTogaXRhbGljO1wiPk5vIGN1c3RvbSBlbnRyaWVzLjwvcD4nO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgbGlzdENvbnRhaW5lci5pbm5lckhUTUwgPSBPYmplY3QuZW50cmllcyhjdXN0b21HZW5lcmEpLm1hcCgoW2RvbWFpbiwgY2F0ZWdvcnldKSA9PiBgXG4gICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47IGFsaWduLWl0ZW1zOiBjZW50ZXI7IHBhZGRpbmc6IDVweDsgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkICNmMGYwZjA7XCI+XG4gICAgICAgICAgICA8c3Bhbj48Yj4ke2VzY2FwZUh0bWwoZG9tYWluKX08L2I+OiAke2VzY2FwZUh0bWwoY2F0ZWdvcnkpfTwvc3Bhbj5cbiAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJkZWxldGUtZ2VuZXJhLWJ0blwiIGRhdGEtZG9tYWluPVwiJHtlc2NhcGVIdG1sKGRvbWFpbil9XCIgc3R5bGU9XCJiYWNrZ3JvdW5kOiBub25lOyBib3JkZXI6IG5vbmU7IGNvbG9yOiByZWQ7IGN1cnNvcjogcG9pbnRlcjtcIj4mdGltZXM7PC9idXR0b24+XG4gICAgICAgIDwvZGl2PlxuICAgIGApLmpvaW4oJycpO1xuXG4gICAgLy8gUmUtYXR0YWNoIGxpc3RlbmVycyBmb3IgZGVsZXRlIGJ1dHRvbnNcbiAgICBsaXN0Q29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5kZWxldGUtZ2VuZXJhLWJ0bicpLmZvckVhY2goYnRuID0+IHtcbiAgICAgICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgYXN5bmMgKGUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGRvbWFpbiA9IChlLnRhcmdldCBhcyBIVE1MRWxlbWVudCkuZGF0YXNldC5kb21haW47XG4gICAgICAgICAgICBpZiAoZG9tYWluKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgZGVsZXRlQ3VzdG9tR2VuZXJhKGRvbWFpbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBhZGRDdXN0b21HZW5lcmEoKSB7XG4gICAgY29uc3QgZG9tYWluSW5wdXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbmV3LWdlbmVyYS1kb21haW4nKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgIGNvbnN0IGNhdGVnb3J5SW5wdXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbmV3LWdlbmVyYS1jYXRlZ29yeScpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG5cbiAgICBpZiAoIWRvbWFpbklucHV0IHx8ICFjYXRlZ29yeUlucHV0KSByZXR1cm47XG5cbiAgICBjb25zdCBkb21haW4gPSBkb21haW5JbnB1dC52YWx1ZS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgICBjb25zdCBjYXRlZ29yeSA9IGNhdGVnb3J5SW5wdXQudmFsdWUudHJpbSgpO1xuXG4gICAgaWYgKCFkb21haW4gfHwgIWNhdGVnb3J5KSB7XG4gICAgICAgIGFsZXJ0KFwiUGxlYXNlIGVudGVyIGJvdGggZG9tYWluIGFuZCBjYXRlZ29yeS5cIik7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsb2dJbmZvKFwiQWRkaW5nIGN1c3RvbSBnZW5lcmFcIiwgeyBkb21haW4sIGNhdGVnb3J5IH0pO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgLy8gRmV0Y2ggY3VycmVudCB0byBtZXJnZVxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2xvYWRQcmVmZXJlbmNlcycgfSk7XG4gICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vayAmJiByZXNwb25zZS5kYXRhKSB7XG4gICAgICAgICAgICBjb25zdCBwcmVmcyA9IHJlc3BvbnNlLmRhdGEgYXMgUHJlZmVyZW5jZXM7XG4gICAgICAgICAgICBjb25zdCBuZXdDdXN0b21HZW5lcmEgPSB7IC4uLihwcmVmcy5jdXN0b21HZW5lcmEgfHwge30pLCBbZG9tYWluXTogY2F0ZWdvcnkgfTtcblxuICAgICAgICAgICAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICAgIHR5cGU6ICdzYXZlUHJlZmVyZW5jZXMnLFxuICAgICAgICAgICAgICAgIHBheWxvYWQ6IHsgY3VzdG9tR2VuZXJhOiBuZXdDdXN0b21HZW5lcmEgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGRvbWFpbklucHV0LnZhbHVlID0gJyc7XG4gICAgICAgICAgICBjYXRlZ29yeUlucHV0LnZhbHVlID0gJyc7XG4gICAgICAgICAgICBsb2FkQ3VzdG9tR2VuZXJhKCk7XG4gICAgICAgICAgICBsb2FkVGFicygpOyAvLyBSZWZyZXNoIHRhYnMgdG8gYXBwbHkgbmV3IGNsYXNzaWZpY2F0aW9uIGlmIHJlbGV2YW50XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gYWRkIGN1c3RvbSBnZW5lcmFcIiwgZSk7XG4gICAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBkZWxldGVDdXN0b21HZW5lcmEoZG9tYWluOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgICBsb2dJbmZvKFwiRGVsZXRpbmcgY3VzdG9tIGdlbmVyYVwiLCB7IGRvbWFpbiB9KTtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdsb2FkUHJlZmVyZW5jZXMnIH0pO1xuICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2sgJiYgcmVzcG9uc2UuZGF0YSkge1xuICAgICAgICAgICAgY29uc3QgcHJlZnMgPSByZXNwb25zZS5kYXRhIGFzIFByZWZlcmVuY2VzO1xuICAgICAgICAgICAgY29uc3QgbmV3Q3VzdG9tR2VuZXJhID0geyAuLi4ocHJlZnMuY3VzdG9tR2VuZXJhIHx8IHt9KSB9O1xuICAgICAgICAgICAgZGVsZXRlIG5ld0N1c3RvbUdlbmVyYVtkb21haW5dO1xuXG4gICAgICAgICAgICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICAgICAgdHlwZTogJ3NhdmVQcmVmZXJlbmNlcycsXG4gICAgICAgICAgICAgICAgcGF5bG9hZDogeyBjdXN0b21HZW5lcmE6IG5ld0N1c3RvbUdlbmVyYSB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgbG9hZEN1c3RvbUdlbmVyYSgpO1xuICAgICAgICAgICAgbG9hZFRhYnMoKTtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBkZWxldGUgY3VzdG9tIGdlbmVyYVwiLCBlKTtcbiAgICB9XG59XG5cbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGV2ZW50KSA9PiB7XG4gICAgY29uc3QgdGFyZ2V0ID0gZXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICBpZiAodGFyZ2V0ICYmIHRhcmdldC5pZCA9PT0gJ2FkZC1nZW5lcmEtYnRuJykge1xuICAgICAgICBhZGRDdXN0b21HZW5lcmEoKTtcbiAgICB9XG59KTtcblxuYXN5bmMgZnVuY3Rpb24gbG9hZFRhYnMoKSB7XG4gIGxvZ0luZm8oXCJMb2FkaW5nIHRhYnMgZm9yIERldlRvb2xzXCIpO1xuICBjb25zdCB0YWJzID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoe30pO1xuICBjdXJyZW50VGFicyA9IHRhYnM7XG5cbiAgY29uc3QgdG90YWxUYWJzRWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndG90YWxUYWJzJyk7XG4gIGlmICh0b3RhbFRhYnNFbCkge1xuICAgIHRvdGFsVGFic0VsLnRleHRDb250ZW50ID0gdGFicy5sZW5ndGgudG9TdHJpbmcoKTtcbiAgfVxuXG4gIC8vIENyZWF0ZSBhIG1hcCBvZiB0YWIgSUQgdG8gdGl0bGUgZm9yIHBhcmVudCBsb29rdXBcbiAgdGFiVGl0bGVzLmNsZWFyKCk7XG4gIHRhYnMuZm9yRWFjaCh0YWIgPT4ge1xuICAgIGlmICh0YWIuaWQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgdGFiVGl0bGVzLnNldCh0YWIuaWQsIHRhYi50aXRsZSB8fCAnVW50aXRsZWQnKTtcbiAgICB9XG4gIH0pO1xuXG4gIC8vIENvbnZlcnQgdG8gVGFiTWV0YWRhdGEgZm9yIGNvbnRleHQgYW5hbHlzaXNcbiAgY29uc3QgbWFwcGVkVGFiczogVGFiTWV0YWRhdGFbXSA9IGdldE1hcHBlZFRhYnMoKTtcblxuICAvLyBBbmFseXplIGNvbnRleHRcbiAgdHJ5IHtcbiAgICAgIGN1cnJlbnRDb250ZXh0TWFwID0gYXdhaXQgYW5hbHl6ZVRhYkNvbnRleHQobWFwcGVkVGFicyk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGFuYWx5emUgY29udGV4dFwiLCBlcnJvcik7XG4gICAgICBjdXJyZW50Q29udGV4dE1hcC5jbGVhcigpO1xuICB9XG5cbiAgcmVuZGVyVGFibGUoKTtcbn1cblxuZnVuY3Rpb24gZ2V0TWFwcGVkVGFicygpOiBUYWJNZXRhZGF0YVtdIHtcbiAgcmV0dXJuIGN1cnJlbnRUYWJzXG4gICAgLm1hcCh0YWIgPT4ge1xuICAgICAgICBjb25zdCBtZXRhZGF0YSA9IG1hcENocm9tZVRhYih0YWIpO1xuICAgICAgICBpZiAoIW1ldGFkYXRhKSByZXR1cm4gbnVsbDtcblxuICAgICAgICBjb25zdCBjb250ZXh0UmVzdWx0ID0gY3VycmVudENvbnRleHRNYXAuZ2V0KG1ldGFkYXRhLmlkKTtcbiAgICAgICAgaWYgKGNvbnRleHRSZXN1bHQpIHtcbiAgICAgICAgICAgIG1ldGFkYXRhLmNvbnRleHQgPSBjb250ZXh0UmVzdWx0LmNvbnRleHQ7XG4gICAgICAgICAgICBtZXRhZGF0YS5jb250ZXh0RGF0YSA9IGNvbnRleHRSZXN1bHQuZGF0YTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWV0YWRhdGE7XG4gICAgfSlcbiAgICAuZmlsdGVyKCh0KTogdCBpcyBUYWJNZXRhZGF0YSA9PiB0ICE9PSBudWxsKTtcbn1cblxuZnVuY3Rpb24gaGFuZGxlU29ydChrZXk6IHN0cmluZykge1xuICBpZiAoc29ydEtleSA9PT0ga2V5KSB7XG4gICAgc29ydERpcmVjdGlvbiA9IHNvcnREaXJlY3Rpb24gPT09ICdhc2MnID8gJ2Rlc2MnIDogJ2FzYyc7XG4gIH0gZWxzZSB7XG4gICAgc29ydEtleSA9IGtleTtcbiAgICBzb3J0RGlyZWN0aW9uID0gJ2FzYyc7XG4gIH1cbiAgdXBkYXRlSGVhZGVyU3R5bGVzKCk7XG4gIHJlbmRlclRhYmxlKCk7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUhlYWRlclN0eWxlcygpIHtcbiAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgndGguc29ydGFibGUnKS5mb3JFYWNoKHRoID0+IHtcbiAgICB0aC5jbGFzc0xpc3QucmVtb3ZlKCdzb3J0LWFzYycsICdzb3J0LWRlc2MnKTtcbiAgICBpZiAodGguZ2V0QXR0cmlidXRlKCdkYXRhLWtleScpID09PSBzb3J0S2V5KSB7XG4gICAgICB0aC5jbGFzc0xpc3QuYWRkKHNvcnREaXJlY3Rpb24gPT09ICdhc2MnID8gJ3NvcnQtYXNjJyA6ICdzb3J0LWRlc2MnKTtcbiAgICB9XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBnZXRTb3J0VmFsdWUodGFiOiBjaHJvbWUudGFicy5UYWIsIGtleTogc3RyaW5nKTogYW55IHtcbiAgc3dpdGNoIChrZXkpIHtcbiAgICBjYXNlICdwYXJlbnRUaXRsZSc6XG4gICAgICByZXR1cm4gdGFiLm9wZW5lclRhYklkID8gKHRhYlRpdGxlcy5nZXQodGFiLm9wZW5lclRhYklkKSB8fCAnJykgOiAnJztcbiAgICBjYXNlICdnZW5yZSc6XG4gICAgICByZXR1cm4gKHRhYi5pZCAmJiBjdXJyZW50Q29udGV4dE1hcC5nZXQodGFiLmlkKT8uZGF0YT8uZ2VucmUpIHx8ICcnO1xuICAgIGNhc2UgJ2NvbnRleHQnOlxuICAgICAgcmV0dXJuICh0YWIuaWQgJiYgY3VycmVudENvbnRleHRNYXAuZ2V0KHRhYi5pZCk/LmNvbnRleHQpIHx8ICcnO1xuICAgIGNhc2UgJ2FjdGl2ZSc6XG4gICAgY2FzZSAncGlubmVkJzpcbiAgICAgIHJldHVybiAodGFiIGFzIGFueSlba2V5XSA/IDEgOiAwO1xuICAgIGNhc2UgJ2lkJzpcbiAgICBjYXNlICdpbmRleCc6XG4gICAgY2FzZSAnd2luZG93SWQnOlxuICAgIGNhc2UgJ2dyb3VwSWQnOlxuICAgIGNhc2UgJ29wZW5lclRhYklkJzpcbiAgICAgIHJldHVybiAodGFiIGFzIGFueSlba2V5XSB8fCAtMTtcbiAgICBjYXNlICdsYXN0QWNjZXNzZWQnOlxuICAgICAgcmV0dXJuICh0YWIgYXMgYW55KVtrZXldIHx8IDA7XG4gICAgY2FzZSAndGl0bGUnOlxuICAgIGNhc2UgJ3VybCc6XG4gICAgY2FzZSAnc3RhdHVzJzpcbiAgICAgIHJldHVybiAoKHRhYiBhcyBhbnkpW2tleV0gfHwgJycpLnRvTG93ZXJDYXNlKCk7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiAodGFiIGFzIGFueSlba2V5XTtcbiAgfVxufVxuXG5mdW5jdGlvbiByZW5kZXJUYWJsZSgpIHtcbiAgY29uc3QgdGJvZHkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjdGFic1RhYmxlIHRib2R5Jyk7XG4gIGlmICghdGJvZHkpIHJldHVybjtcblxuICAvLyAxLiBGaWx0ZXJcbiAgbGV0IHRhYnNEaXNwbGF5ID0gY3VycmVudFRhYnMuZmlsdGVyKHRhYiA9PiB7XG4gICAgICAvLyBHbG9iYWwgU2VhcmNoXG4gICAgICBpZiAoZ2xvYmFsU2VhcmNoUXVlcnkpIHtcbiAgICAgICAgICBjb25zdCBxID0gZ2xvYmFsU2VhcmNoUXVlcnkudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICBjb25zdCBzZWFyY2hhYmxlVGV4dCA9IGAke3RhYi50aXRsZX0gJHt0YWIudXJsfSAke3RhYi5pZH1gLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgaWYgKCFzZWFyY2hhYmxlVGV4dC5pbmNsdWRlcyhxKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuXG4gICAgICAvLyBDb2x1bW4gRmlsdGVyc1xuICAgICAgZm9yIChjb25zdCBba2V5LCBmaWx0ZXJdIG9mIE9iamVjdC5lbnRyaWVzKGNvbHVtbkZpbHRlcnMpKSB7XG4gICAgICAgICAgaWYgKCFmaWx0ZXIpIGNvbnRpbnVlO1xuICAgICAgICAgIGNvbnN0IHZhbCA9IFN0cmluZyhnZXRTb3J0VmFsdWUodGFiLCBrZXkpKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgIGlmICghdmFsLmluY2x1ZGVzKGZpbHRlci50b0xvd2VyQ2FzZSgpKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgfSk7XG5cbiAgLy8gMi4gU29ydFxuICBpZiAoc29ydEtleSkge1xuICAgIHRhYnNEaXNwbGF5LnNvcnQoKGEsIGIpID0+IHtcbiAgICAgIGxldCB2YWxBOiBhbnkgPSBnZXRTb3J0VmFsdWUoYSwgc29ydEtleSEpO1xuICAgICAgbGV0IHZhbEI6IGFueSA9IGdldFNvcnRWYWx1ZShiLCBzb3J0S2V5ISk7XG5cbiAgICAgIGlmICh2YWxBIDwgdmFsQikgcmV0dXJuIHNvcnREaXJlY3Rpb24gPT09ICdhc2MnID8gLTEgOiAxO1xuICAgICAgaWYgKHZhbEEgPiB2YWxCKSByZXR1cm4gc29ydERpcmVjdGlvbiA9PT0gJ2FzYycgPyAxIDogLTE7XG4gICAgICByZXR1cm4gMDtcbiAgICB9KTtcbiAgfVxuXG4gIHRib2R5LmlubmVySFRNTCA9ICcnOyAvLyBDbGVhciBleGlzdGluZyByb3dzXG5cbiAgLy8gMy4gUmVuZGVyXG4gIGNvbnN0IHZpc2libGVDb2xzID0gY29sdW1ucy5maWx0ZXIoYyA9PiBjLnZpc2libGUpO1xuXG4gIHRhYnNEaXNwbGF5LmZvckVhY2godGFiID0+IHtcbiAgICBjb25zdCByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd0cicpO1xuXG4gICAgdmlzaWJsZUNvbHMuZm9yRWFjaChjb2wgPT4ge1xuICAgICAgICBjb25zdCB0ZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3RkJyk7XG4gICAgICAgIGlmIChjb2wua2V5ID09PSAndGl0bGUnKSB0ZC5jbGFzc0xpc3QuYWRkKCd0aXRsZS1jZWxsJyk7XG4gICAgICAgIGlmIChjb2wua2V5ID09PSAndXJsJykgdGQuY2xhc3NMaXN0LmFkZCgndXJsLWNlbGwnKTtcblxuICAgICAgICBjb25zdCB2YWwgPSBnZXRDZWxsVmFsdWUodGFiLCBjb2wua2V5KTtcblxuICAgICAgICBpZiAodmFsIGluc3RhbmNlb2YgSFRNTEVsZW1lbnQpIHtcbiAgICAgICAgICAgIHRkLmFwcGVuZENoaWxkKHZhbCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0ZC5pbm5lckhUTUwgPSB2YWw7XG4gICAgICAgICAgICB0ZC50aXRsZSA9IHN0cmlwSHRtbChTdHJpbmcodmFsKSk7XG4gICAgICAgIH1cbiAgICAgICAgcm93LmFwcGVuZENoaWxkKHRkKTtcbiAgICB9KTtcblxuICAgIHRib2R5LmFwcGVuZENoaWxkKHJvdyk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBzdHJpcEh0bWwoaHRtbDogc3RyaW5nKSB7XG4gICAgbGV0IHRtcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJESVZcIik7XG4gICAgdG1wLmlubmVySFRNTCA9IGh0bWw7XG4gICAgcmV0dXJuIHRtcC50ZXh0Q29udGVudCB8fCB0bXAuaW5uZXJUZXh0IHx8IFwiXCI7XG59XG5cblxuZnVuY3Rpb24gZ2V0Q2VsbFZhbHVlKHRhYjogY2hyb21lLnRhYnMuVGFiLCBrZXk6IHN0cmluZyk6IHN0cmluZyB8IEhUTUxFbGVtZW50IHtcbiAgICBjb25zdCBlc2NhcGUgPSBlc2NhcGVIdG1sO1xuXG4gICAgc3dpdGNoIChrZXkpIHtcbiAgICAgICAgY2FzZSAnaWQnOiByZXR1cm4gU3RyaW5nKHRhYi5pZCA/PyAnTi9BJyk7XG4gICAgICAgIGNhc2UgJ2luZGV4JzogcmV0dXJuIFN0cmluZyh0YWIuaW5kZXgpO1xuICAgICAgICBjYXNlICd3aW5kb3dJZCc6IHJldHVybiBTdHJpbmcodGFiLndpbmRvd0lkKTtcbiAgICAgICAgY2FzZSAnZ3JvdXBJZCc6IHJldHVybiBTdHJpbmcodGFiLmdyb3VwSWQpO1xuICAgICAgICBjYXNlICd0aXRsZSc6IHJldHVybiBlc2NhcGUodGFiLnRpdGxlIHx8ICcnKTtcbiAgICAgICAgY2FzZSAndXJsJzogcmV0dXJuIGVzY2FwZSh0YWIudXJsIHx8ICcnKTtcbiAgICAgICAgY2FzZSAnc3RhdHVzJzogcmV0dXJuIGVzY2FwZSh0YWIuc3RhdHVzIHx8ICcnKTtcbiAgICAgICAgY2FzZSAnYWN0aXZlJzogcmV0dXJuIHRhYi5hY3RpdmUgPyAnWWVzJyA6ICdObyc7XG4gICAgICAgIGNhc2UgJ3Bpbm5lZCc6IHJldHVybiB0YWIucGlubmVkID8gJ1llcycgOiAnTm8nO1xuICAgICAgICBjYXNlICdvcGVuZXJUYWJJZCc6IHJldHVybiBTdHJpbmcodGFiLm9wZW5lclRhYklkID8/ICctJyk7XG4gICAgICAgIGNhc2UgJ3BhcmVudFRpdGxlJzpcbiAgICAgICAgICAgICByZXR1cm4gZXNjYXBlKHRhYi5vcGVuZXJUYWJJZCA/ICh0YWJUaXRsZXMuZ2V0KHRhYi5vcGVuZXJUYWJJZCkgfHwgJ1Vua25vd24nKSA6ICctJyk7XG4gICAgICAgIGNhc2UgJ2dlbnJlJzpcbiAgICAgICAgICAgICByZXR1cm4gZXNjYXBlKCh0YWIuaWQgJiYgY3VycmVudENvbnRleHRNYXAuZ2V0KHRhYi5pZCk/LmRhdGE/LmdlbnJlKSB8fCAnLScpO1xuICAgICAgICBjYXNlICdjb250ZXh0Jzoge1xuICAgICAgICAgICAgY29uc3QgY29udGV4dFJlc3VsdCA9IHRhYi5pZCA/IGN1cnJlbnRDb250ZXh0TWFwLmdldCh0YWIuaWQpIDogdW5kZWZpbmVkO1xuICAgICAgICAgICAgaWYgKCFjb250ZXh0UmVzdWx0KSByZXR1cm4gJ04vQSc7XG5cbiAgICAgICAgICAgIGxldCBjZWxsU3R5bGUgPSAnJztcbiAgICAgICAgICAgIGxldCBhaUNvbnRleHQgPSAnJztcblxuICAgICAgICAgICAgaWYgKGNvbnRleHRSZXN1bHQuc3RhdHVzID09PSAnUkVTVFJJQ1RFRCcpIHtcbiAgICAgICAgICAgICAgICBhaUNvbnRleHQgPSAnVW5leHRyYWN0YWJsZSAocmVzdHJpY3RlZCknO1xuICAgICAgICAgICAgICAgIGNlbGxTdHlsZSA9ICdjb2xvcjogZ3JheTsgZm9udC1zdHlsZTogaXRhbGljOyc7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNvbnRleHRSZXN1bHQuZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBhaUNvbnRleHQgPSBgRXJyb3IgKCR7Y29udGV4dFJlc3VsdC5lcnJvcn0pYDtcbiAgICAgICAgICAgICAgICBjZWxsU3R5bGUgPSAnY29sb3I6IHJlZDsnO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjb250ZXh0UmVzdWx0LnNvdXJjZSA9PT0gJ0V4dHJhY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgYWlDb250ZXh0ID0gYCR7Y29udGV4dFJlc3VsdC5jb250ZXh0fSAoRXh0cmFjdGVkKWA7XG4gICAgICAgICAgICAgICAgY2VsbFN0eWxlID0gJ2NvbG9yOiBncmVlbjsgZm9udC13ZWlnaHQ6IGJvbGQ7JztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgIGFpQ29udGV4dCA9IGAke2NvbnRleHRSZXN1bHQuY29udGV4dH1gO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgIGNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuICAgICAgICAgICAgY29udGFpbmVyLnN0eWxlLmZsZXhEaXJlY3Rpb24gPSAnY29sdW1uJztcbiAgICAgICAgICAgIGNvbnRhaW5lci5zdHlsZS5nYXAgPSAnNXB4JztcblxuICAgICAgICAgICAgY29uc3Qgc3VtbWFyeURpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgc3VtbWFyeURpdi5zdHlsZS5jc3NUZXh0ID0gY2VsbFN0eWxlO1xuICAgICAgICAgICAgc3VtbWFyeURpdi50ZXh0Q29udGVudCA9IGFpQ29udGV4dDtcbiAgICAgICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChzdW1tYXJ5RGl2KTtcblxuICAgICAgICAgICAgaWYgKGNvbnRleHRSZXN1bHQuZGF0YSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGRldGFpbHMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdwcmUnKTtcbiAgICAgICAgICAgICAgICBkZXRhaWxzLnN0eWxlLmNzc1RleHQgPSAnbWF4LWhlaWdodDogMzAwcHg7IG92ZXJmbG93OiBhdXRvOyBmb250LXNpemU6IDExcHg7IHRleHQtYWxpZ246IGxlZnQ7IGJhY2tncm91bmQ6ICNmNWY1ZjU7IHBhZGRpbmc6IDVweDsgYm9yZGVyOiAxcHggc29saWQgI2RkZDsgbWFyZ2luOiAwOyB3aGl0ZS1zcGFjZTogcHJlLXdyYXA7IGZvbnQtZmFtaWx5OiBtb25vc3BhY2U7JztcbiAgICAgICAgICAgICAgICBkZXRhaWxzLnRleHRDb250ZW50ID0gSlNPTi5zdHJpbmdpZnkoY29udGV4dFJlc3VsdC5kYXRhLCBudWxsLCAyKTtcbiAgICAgICAgICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoZGV0YWlscyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBjb250YWluZXI7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSAnbGFzdEFjY2Vzc2VkJzpcbiAgICAgICAgICAgIHJldHVybiBuZXcgRGF0ZSgodGFiIGFzIGFueSkubGFzdEFjY2Vzc2VkIHx8IDApLnRvTG9jYWxlU3RyaW5nKCk7XG4gICAgICAgIGNhc2UgJ2FjdGlvbnMnOiB7XG4gICAgICAgICAgICBjb25zdCB3cmFwcGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgICAgICB3cmFwcGVyLmlubmVySFRNTCA9IGBcbiAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiZ290by10YWItYnRuXCIgZGF0YS10YWItaWQ9XCIke3RhYi5pZH1cIiBkYXRhLXdpbmRvdy1pZD1cIiR7dGFiLndpbmRvd0lkfVwiPkdvPC9idXR0b24+XG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImNsb3NlLXRhYi1idG5cIiBkYXRhLXRhYi1pZD1cIiR7dGFiLmlkfVwiIHN0eWxlPVwiYmFja2dyb3VuZC1jb2xvcjogI2RjMzU0NTsgbWFyZ2luLWxlZnQ6IDJweDtcIj5YPC9idXR0b24+XG4gICAgICAgICAgICBgO1xuICAgICAgICAgICAgcmV0dXJuIHdyYXBwZXI7XG4gICAgICAgIH1cbiAgICAgICAgZGVmYXVsdDogcmV0dXJuICcnO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gcmVuZGVyQWxnb3JpdGhtc1ZpZXcoKSB7XG4gIC8vIFVzZSB1cGRhdGVkIHN0cmF0ZWdpZXMgbGlzdCBpbmNsdWRpbmcgY3VzdG9tIG9uZXNcbiAgcmVuZGVyU3RyYXRlZ3lDb25maWcoKTtcblxuICBjb25zdCBncm91cGluZ1JlZiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdncm91cGluZy1yZWYnKTtcbiAgY29uc3Qgc29ydGluZ1JlZiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzb3J0aW5nLXJlZicpO1xuXG4gIGlmIChncm91cGluZ1JlZikge1xuICAgICAgLy8gUmUtcmVuZGVyIGJlY2F1c2Ugc3RyYXRlZ3kgbGlzdCBtaWdodCBjaGFuZ2VcbiAgICAgIGNvbnN0IGFsbFN0cmF0ZWdpZXM6IFN0cmF0ZWd5RGVmaW5pdGlvbltdID0gZ2V0U3RyYXRlZ2llcyhsb2NhbEN1c3RvbVN0cmF0ZWdpZXMpO1xuICAgICAgY29uc3QgZ3JvdXBpbmdzID0gYWxsU3RyYXRlZ2llcy5maWx0ZXIocyA9PiBzLmlzR3JvdXBpbmcpO1xuXG4gICAgICBncm91cGluZ1JlZi5pbm5lckhUTUwgPSBncm91cGluZ3MubWFwKGcgPT4ge1xuICAgICAgICAgY29uc3QgaXNDdXN0b20gPSBsb2NhbEN1c3RvbVN0cmF0ZWdpZXMuc29tZShzID0+IHMuaWQgPT09IGcuaWQpO1xuICAgICAgICAgbGV0IGRlc2MgPSBcIkJ1aWx0LWluIHN0cmF0ZWd5XCI7XG4gICAgICAgICBpZiAoaXNDdXN0b20pIGRlc2MgPSBcIkN1c3RvbSBzdHJhdGVneSBkZWZpbmVkIGJ5IHJ1bGVzLlwiO1xuICAgICAgICAgZWxzZSBpZiAoZy5pZCA9PT0gJ2RvbWFpbicpIGRlc2MgPSAnR3JvdXBzIHRhYnMgYnkgdGhlaXIgZG9tYWluIG5hbWUuJztcbiAgICAgICAgIGVsc2UgaWYgKGcuaWQgPT09ICd0b3BpYycpIGRlc2MgPSAnR3JvdXBzIGJhc2VkIG9uIGtleXdvcmRzIGluIHRoZSB0aXRsZS4nO1xuXG4gICAgICAgICByZXR1cm4gYFxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJzdHJhdGVneS1pdGVtXCI+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwic3RyYXRlZ3ktbmFtZVwiPiR7Zy5sYWJlbH0gKCR7Zy5pZH0pICR7aXNDdXN0b20gPyAnPHNwYW4gc3R5bGU9XCJjb2xvcjogYmx1ZTsgZm9udC1zaXplOiAwLjhlbTtcIj5DdXN0b208L3NwYW4+JyA6ICcnfTwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInN0cmF0ZWd5LWRlc2NcIj4ke2Rlc2N9PC9kaXY+XG4gICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwic3RyYXRlZ3ktdmlldy1idG5cIiBkYXRhLXR5cGU9XCJncm91cGluZ1wiIGRhdGEtbmFtZT1cIiR7Zy5pZH1cIj5WaWV3IExvZ2ljPC9idXR0b24+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgIGA7XG4gICAgICB9KS5qb2luKCcnKTtcbiAgfVxuXG4gIGlmIChzb3J0aW5nUmVmKSB7XG4gICAgLy8gUmUtcmVuZGVyIHNvcnRpbmcgc3RyYXRlZ2llcyB0b29cbiAgICBjb25zdCBhbGxTdHJhdGVnaWVzOiBTdHJhdGVneURlZmluaXRpb25bXSA9IGdldFN0cmF0ZWdpZXMobG9jYWxDdXN0b21TdHJhdGVnaWVzKTtcbiAgICBjb25zdCBzb3J0aW5ncyA9IGFsbFN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gcy5pc1NvcnRpbmcpO1xuXG4gICAgc29ydGluZ1JlZi5pbm5lckhUTUwgPSBzb3J0aW5ncy5tYXAocyA9PiB7XG4gICAgICAgIGxldCBkZXNjID0gXCJCdWlsdC1pbiBzb3J0aW5nXCI7XG4gICAgICAgIGlmIChzLmlkID09PSAncmVjZW5jeScpIGRlc2MgPSAnU29ydHMgYnkgbGFzdCBhY2Nlc3NlZCB0aW1lIChtb3N0IHJlY2VudCBmaXJzdCkuJztcbiAgICAgICAgZWxzZSBpZiAocy5pZCA9PT0gJ25lc3RpbmcnKSBkZXNjID0gJ1NvcnRzIGJhc2VkIG9uIGhpZXJhcmNoeSAocm9vdHMgdnMgY2hpbGRyZW4pLic7XG4gICAgICAgIGVsc2UgaWYgKHMuaWQgPT09ICdwaW5uZWQnKSBkZXNjID0gJ0tlZXBzIHBpbm5lZCB0YWJzIGF0IHRoZSBiZWdpbm5pbmcgb2YgdGhlIGxpc3QuJztcblxuICAgICAgICByZXR1cm4gYFxuICAgICAgPGRpdiBjbGFzcz1cInN0cmF0ZWd5LWl0ZW1cIj5cbiAgICAgICAgPGRpdiBjbGFzcz1cInN0cmF0ZWd5LW5hbWVcIj4ke3MubGFiZWx9PC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJzdHJhdGVneS1kZXNjXCI+JHtkZXNjfTwvZGl2PlxuICAgICAgICA8YnV0dG9uIGNsYXNzPVwic3RyYXRlZ3ktdmlldy1idG5cIiBkYXRhLXR5cGU9XCJzb3J0aW5nXCIgZGF0YS1uYW1lPVwiJHtzLmlkfVwiPlZpZXcgTG9naWM8L2J1dHRvbj5cbiAgICAgIDwvZGl2PlxuICAgIGA7XG4gICAgfSkuam9pbignJyk7XG4gIH1cblxuICBjb25zdCByZWdpc3RyeVJlZiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZWdpc3RyeS1yZWYnKTtcbiAgaWYgKHJlZ2lzdHJ5UmVmICYmIHJlZ2lzdHJ5UmVmLmNoaWxkcmVuLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmVnaXN0cnlSZWYuaW5uZXJIVE1MID0gYFxuICAgICAgICA8ZGl2IGNsYXNzPVwic3RyYXRlZ3ktaXRlbVwiPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInN0cmF0ZWd5LW5hbWVcIj5HZW5lcmEgUmVnaXN0cnk8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJzdHJhdGVneS1kZXNjXCI+U3RhdGljIGxvb2t1cCB0YWJsZSBmb3IgZG9tYWluIGNsYXNzaWZpY2F0aW9uIChhcHByb3ggJHtPYmplY3Qua2V5cyhHRU5FUkFfUkVHSVNUUlkpLmxlbmd0aH0gZW50cmllcykuPC9kaXY+XG4gICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwic3RyYXRlZ3ktdmlldy1idG5cIiBkYXRhLXR5cGU9XCJyZWdpc3RyeVwiIGRhdGEtbmFtZT1cImdlbmVyYVwiPlZpZXcgVGFibGU8L2J1dHRvbj5cbiAgICAgICAgPC9kaXY+XG4gICAgICBgO1xuICB9XG59XG5cbmZ1bmN0aW9uIHJlbmRlclN0cmF0ZWd5Q29uZmlnKCkge1xuICBjb25zdCBncm91cGluZ0xpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2ltLWdyb3VwaW5nLWxpc3QnKTtcbiAgY29uc3Qgc29ydGluZ0xpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2ltLXNvcnRpbmctbGlzdCcpO1xuXG4gIC8vIFVzZSBkeW5hbWljIHN0cmF0ZWd5IGxpc3RcbiAgY29uc3Qgc3RyYXRlZ2llczogU3RyYXRlZ3lEZWZpbml0aW9uW10gPSBnZXRTdHJhdGVnaWVzKGxvY2FsQ3VzdG9tU3RyYXRlZ2llcyk7XG5cbiAgaWYgKGdyb3VwaW5nTGlzdCkge1xuICAgICAgY29uc3QgZ3JvdXBpbmdTdHJhdGVnaWVzID0gc3RyYXRlZ2llcy5maWx0ZXIocyA9PiBzLmlzR3JvdXBpbmcpO1xuICAgICAgLy8gV2Ugc2hvdWxkIHByZXNlcnZlIGNoZWNrZWQgc3RhdGUgaWYgcmUtcmVuZGVyaW5nLCBidXQgZm9yIG5vdyBqdXN0IGRlZmF1bHRpbmcgaXMgb2theSBvciByZWFkaW5nIGN1cnJlbnQgRE9NXG4gICAgICAvLyBTaW1wbGlmaWNhdGlvbjoganVzdCByZS1yZW5kZXIuXG4gICAgICByZW5kZXJTdHJhdGVneUxpc3QoZ3JvdXBpbmdMaXN0LCBncm91cGluZ1N0cmF0ZWdpZXMsIFsnZG9tYWluJywgJ3RvcGljJ10pO1xuICB9XG5cbiAgaWYgKHNvcnRpbmdMaXN0KSB7XG4gICAgICBjb25zdCBzb3J0aW5nU3RyYXRlZ2llcyA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gcy5pc1NvcnRpbmcpO1xuICAgICAgcmVuZGVyU3RyYXRlZ3lMaXN0KHNvcnRpbmdMaXN0LCBzb3J0aW5nU3RyYXRlZ2llcywgWydwaW5uZWQnLCAncmVjZW5jeSddKTtcbiAgfVxufVxuXG5mdW5jdGlvbiByZW5kZXJTdHJhdGVneUxpc3QoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgc3RyYXRlZ2llczogU3RyYXRlZ3lEZWZpbml0aW9uW10sIGRlZmF1bHRFbmFibGVkOiBzdHJpbmdbXSkge1xuICAgIGNvbnRhaW5lci5pbm5lckhUTUwgPSAnJztcblxuICAgIC8vIFNvcnQgZW5hYmxlZCBieSB0aGVpciBpbmRleCBpbiBkZWZhdWx0RW5hYmxlZFxuICAgIGNvbnN0IGVuYWJsZWQgPSBzdHJhdGVnaWVzLmZpbHRlcihzID0+IGRlZmF1bHRFbmFibGVkLmluY2x1ZGVzKHMuaWQgYXMgc3RyaW5nKSk7XG4gICAgLy8gU2FmZSBpbmRleG9mIGNoZWNrIHNpbmNlIGlkcyBhcmUgc3RyaW5ncyBpbiBkZWZhdWx0RW5hYmxlZFxuICAgIGVuYWJsZWQuc29ydCgoYSwgYikgPT4gZGVmYXVsdEVuYWJsZWQuaW5kZXhPZihhLmlkIGFzIHN0cmluZykgLSBkZWZhdWx0RW5hYmxlZC5pbmRleE9mKGIuaWQgYXMgc3RyaW5nKSk7XG5cbiAgICBjb25zdCBkaXNhYmxlZCA9IHN0cmF0ZWdpZXMuZmlsdGVyKHMgPT4gIWRlZmF1bHRFbmFibGVkLmluY2x1ZGVzKHMuaWQgYXMgc3RyaW5nKSk7XG5cbiAgICAvLyBJbml0aWFsIHJlbmRlciBvcmRlcjogRW5hYmxlZCAob3JkZXJlZCkgdGhlbiBEaXNhYmxlZFxuICAgIGNvbnN0IG9yZGVyZWQgPSBbLi4uZW5hYmxlZCwgLi4uZGlzYWJsZWRdO1xuXG4gICAgb3JkZXJlZC5mb3JFYWNoKHN0cmF0ZWd5ID0+IHtcbiAgICAgICAgY29uc3QgaXNDaGVja2VkID0gZGVmYXVsdEVuYWJsZWQuaW5jbHVkZXMoc3RyYXRlZ3kuaWQpO1xuICAgICAgICBjb25zdCByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgcm93LmNsYXNzTmFtZSA9IGBzdHJhdGVneS1yb3cgJHtpc0NoZWNrZWQgPyAnJyA6ICdkaXNhYmxlZCd9YDtcbiAgICAgICAgcm93LmRhdGFzZXQuaWQgPSBzdHJhdGVneS5pZDtcbiAgICAgICAgcm93LmRyYWdnYWJsZSA9IHRydWU7XG5cbiAgICAgICAgcm93LmlubmVySFRNTCA9IGBcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJkcmFnLWhhbmRsZVwiPlx1MjYzMDwvZGl2PlxuICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiICR7aXNDaGVja2VkID8gJ2NoZWNrZWQnIDogJyd9PlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJzdHJhdGVneS1sYWJlbFwiPiR7c3RyYXRlZ3kubGFiZWx9PC9zcGFuPlxuICAgICAgICBgO1xuXG4gICAgICAgIC8vIEFkZCBsaXN0ZW5lcnNcbiAgICAgICAgY29uc3QgY2hlY2tib3ggPSByb3cucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cImNoZWNrYm94XCJdJyk7XG4gICAgICAgIGNoZWNrYm94Py5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgY2hlY2tlZCA9IChlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS5jaGVja2VkO1xuICAgICAgICAgICAgcm93LmNsYXNzTGlzdC50b2dnbGUoJ2Rpc2FibGVkJywgIWNoZWNrZWQpO1xuICAgICAgICB9KTtcblxuICAgICAgICBzZXR1cERyYWdnYWJsZUl0ZW0ocm93KTtcblxuICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQocm93KTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gc2hvd01vZGFsKHRpdGxlOiBzdHJpbmcsIGNvbnRlbnQ6IEhUTUxFbGVtZW50IHwgc3RyaW5nKSB7XG4gICAgY29uc3QgbW9kYWxPdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgbW9kYWxPdmVybGF5LmNsYXNzTmFtZSA9ICdtb2RhbC1vdmVybGF5JztcbiAgICBtb2RhbE92ZXJsYXkuaW5uZXJIVE1MID0gYFxuICAgICAgICA8ZGl2IGNsYXNzPVwibW9kYWxcIj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJtb2RhbC1oZWFkZXJcIj5cbiAgICAgICAgICAgICAgICA8aDM+JHtlc2NhcGVIdG1sKHRpdGxlKX08L2gzPlxuICAgICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJtb2RhbC1jbG9zZVwiPiZ0aW1lczs8L2J1dHRvbj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cIm1vZGFsLWNvbnRlbnRcIj48L2Rpdj5cbiAgICAgICAgPC9kaXY+XG4gICAgYDtcblxuICAgIGNvbnN0IGNvbnRlbnRDb250YWluZXIgPSBtb2RhbE92ZXJsYXkucXVlcnlTZWxlY3RvcignLm1vZGFsLWNvbnRlbnQnKSBhcyBIVE1MRWxlbWVudDtcbiAgICBpZiAodHlwZW9mIGNvbnRlbnQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGNvbnRlbnRDb250YWluZXIuaW5uZXJIVE1MID0gY29udGVudDtcbiAgICB9IGVsc2Uge1xuICAgICAgICBjb250ZW50Q29udGFpbmVyLmFwcGVuZENoaWxkKGNvbnRlbnQpO1xuICAgIH1cblxuICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQobW9kYWxPdmVybGF5KTtcblxuICAgIGNvbnN0IGNsb3NlQnRuID0gbW9kYWxPdmVybGF5LnF1ZXJ5U2VsZWN0b3IoJy5tb2RhbC1jbG9zZScpO1xuICAgIGNsb3NlQnRuPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZChtb2RhbE92ZXJsYXkpO1xuICAgIH0pO1xuXG4gICAgbW9kYWxPdmVybGF5LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICAgICAgaWYgKGUudGFyZ2V0ID09PSBtb2RhbE92ZXJsYXkpIHtcbiAgICAgICAgICAgICBkb2N1bWVudC5ib2R5LnJlbW92ZUNoaWxkKG1vZGFsT3ZlcmxheSk7XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gc2hvd1N0cmF0ZWd5RGV0YWlscyh0eXBlOiBzdHJpbmcsIG5hbWU6IHN0cmluZykge1xuICAgIGxldCBjb250ZW50ID0gXCJcIjtcbiAgICBsZXQgdGl0bGUgPSBgJHtuYW1lfSAoJHt0eXBlfSlgO1xuXG4gICAgaWYgKHR5cGUgPT09ICdncm91cGluZycpIHtcbiAgICAgICAgaWYgKG5hbWUgPT09ICdkb21haW4nKSB7XG4gICAgICAgICAgICBjb250ZW50ID0gYFxuPGgzPkxvZ2ljOiBEb21haW4gRXh0cmFjdGlvbjwvaDM+XG48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChkb21haW5Gcm9tVXJsLnRvU3RyaW5nKCkpfTwvY29kZT48L3ByZT5cbjxoMz5Mb2dpYzogR3JvdXBpbmcgS2V5PC9oMz5cbjxwcmU+PGNvZGU+JHtlc2NhcGVIdG1sKGdyb3VwaW5nS2V5LnRvU3RyaW5nKCkpfTwvY29kZT48L3ByZT5cbiAgICAgICAgICAgIGA7XG4gICAgICAgIH0gZWxzZSBpZiAobmFtZSA9PT0gJ3RvcGljJykge1xuICAgICAgICAgICAgY29udGVudCA9IGBcbjxoMz5Mb2dpYzogU2VtYW50aWMgQnVja2V0aW5nPC9oMz5cbjxwcmU+PGNvZGU+JHtlc2NhcGVIdG1sKHNlbWFudGljQnVja2V0LnRvU3RyaW5nKCkpfTwvY29kZT48L3ByZT5cbjxoMz5Mb2dpYzogR3JvdXBpbmcgS2V5PC9oMz5cbjxwcmU+PGNvZGU+JHtlc2NhcGVIdG1sKGdyb3VwaW5nS2V5LnRvU3RyaW5nKCkpfTwvY29kZT48L3ByZT5cbiAgICAgICAgICAgIGA7XG4gICAgICAgIH0gZWxzZSBpZiAobmFtZSA9PT0gJ2xpbmVhZ2UnKSB7XG4gICAgICAgICAgICBjb250ZW50ID0gYFxuPGgzPkxvZ2ljOiBOYXZpZ2F0aW9uIEtleTwvaDM+XG48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChuYXZpZ2F0aW9uS2V5LnRvU3RyaW5nKCkpfTwvY29kZT48L3ByZT5cbjxoMz5Mb2dpYzogR3JvdXBpbmcgS2V5PC9oMz5cbjxwcmU+PGNvZGU+JHtlc2NhcGVIdG1sKGdyb3VwaW5nS2V5LnRvU3RyaW5nKCkpfTwvY29kZT48L3ByZT5cbiAgICAgICAgICAgIGA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBDaGVjayBmb3IgY3VzdG9tIHN0cmF0ZWd5IGRldGFpbHNcbiAgICAgICAgICAgIGNvbnN0IGN1c3RvbSA9IGxvY2FsQ3VzdG9tU3RyYXRlZ2llcy5maW5kKHMgPT4gcy5pZCA9PT0gbmFtZSk7XG4gICAgICAgICAgICBpZiAoY3VzdG9tKSB7XG4gICAgICAgICAgICAgICAgY29udGVudCA9IGBcbjxoMz5DdXN0b20gU3RyYXRlZ3k6ICR7ZXNjYXBlSHRtbChjdXN0b20ubGFiZWwpfTwvaDM+XG48cD48Yj5Db25maWd1cmF0aW9uOjwvYj48L3A+XG48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChKU09OLnN0cmluZ2lmeShjdXN0b20sIG51bGwsIDIpKX08L2NvZGU+PC9wcmU+XG48aDM+TG9naWM6IEdyb3VwaW5nIEtleTwvaDM+XG48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChncm91cGluZ0tleS50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+XG4gICAgICAgICAgICAgICAgYDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29udGVudCA9IGBcbjxoMz5Mb2dpYzogR3JvdXBpbmcgS2V5PC9oMz5cbjxwcmU+PGNvZGU+JHtlc2NhcGVIdG1sKGdyb3VwaW5nS2V5LnRvU3RyaW5nKCkpfTwvY29kZT48L3ByZT5cbiAgICAgICAgICAgICAgICBgO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBlbHNlIGlmICh0eXBlID09PSAnc29ydGluZycpIHtcbiAgICAgICAgY29udGVudCA9IGBcbjxoMz5Mb2dpYzogQ29tcGFyaXNvbiBGdW5jdGlvbjwvaDM+XG48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChjb21wYXJlQnkudG9TdHJpbmcoKSl9PC9jb2RlPjwvcHJlPlxuICAgICAgICBgO1xuXG4gICAgICAgIGlmIChuYW1lID09PSAncmVjZW5jeScpIHtcbiAgICAgICAgICAgICBjb250ZW50ICs9IGA8aDM+TG9naWM6IFJlY2VuY3kgU2NvcmU8L2gzPjxwcmU+PGNvZGU+JHtlc2NhcGVIdG1sKHJlY2VuY3lTY29yZS50b1N0cmluZygpKX08L2NvZGU+PC9wcmU+YDtcbiAgICAgICAgfSBlbHNlIGlmIChuYW1lID09PSAnbmVzdGluZycpIHtcbiAgICAgICAgICAgICBjb250ZW50ICs9IGA8aDM+TG9naWM6IEhpZXJhcmNoeSBTY29yZTwvaDM+PHByZT48Y29kZT4ke2VzY2FwZUh0bWwoaGllcmFyY2h5U2NvcmUudG9TdHJpbmcoKSl9PC9jb2RlPjwvcHJlPmA7XG4gICAgICAgIH0gZWxzZSBpZiAobmFtZSA9PT0gJ3Bpbm5lZCcpIHtcbiAgICAgICAgICAgICBjb250ZW50ICs9IGA8aDM+TG9naWM6IFBpbm5lZCBTY29yZTwvaDM+PHByZT48Y29kZT4ke2VzY2FwZUh0bWwocGlubmVkU2NvcmUudG9TdHJpbmcoKSl9PC9jb2RlPjwvcHJlPmA7XG4gICAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdyZWdpc3RyeScgJiYgbmFtZSA9PT0gJ2dlbmVyYScpIHtcbiAgICAgICAgY29uc3QganNvbiA9IEpTT04uc3RyaW5naWZ5KEdFTkVSQV9SRUdJU1RSWSwgbnVsbCwgMik7XG4gICAgICAgIGNvbnRlbnQgPSBgXG48aDM+R2VuZXJhIFJlZ2lzdHJ5IERhdGE8L2gzPlxuPHA+TWFwcGluZyBvZiBkb21haW4gbmFtZXMgdG8gY2F0ZWdvcmllcy48L3A+XG48cHJlPjxjb2RlPiR7ZXNjYXBlSHRtbChqc29uKX08L2NvZGU+PC9wcmU+XG4gICAgICAgIGA7XG4gICAgfVxuXG4gICAgc2hvd01vZGFsKHRpdGxlLCBjb250ZW50KTtcbn1cblxuZnVuY3Rpb24gZ2V0RW5hYmxlZFN0cmF0ZWdpZXNGcm9tVUkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IFNvcnRpbmdTdHJhdGVneVtdIHtcbiAgICByZXR1cm4gQXJyYXkuZnJvbShjb250YWluZXIuY2hpbGRyZW4pXG4gICAgICAgIC5maWx0ZXIocm93ID0+IChyb3cucXVlcnlTZWxlY3RvcignaW5wdXRbdHlwZT1cImNoZWNrYm94XCJdJykgYXMgSFRNTElucHV0RWxlbWVudCkuY2hlY2tlZClcbiAgICAgICAgLm1hcChyb3cgPT4gKHJvdyBhcyBIVE1MRWxlbWVudCkuZGF0YXNldC5pZCBhcyBTb3J0aW5nU3RyYXRlZ3kpO1xufVxuXG5mdW5jdGlvbiBydW5TaW11bGF0aW9uKCkge1xuICBjb25zdCBncm91cGluZ0xpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2ltLWdyb3VwaW5nLWxpc3QnKTtcbiAgY29uc3Qgc29ydGluZ0xpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2ltLXNvcnRpbmctbGlzdCcpO1xuICBjb25zdCByZXN1bHRDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2ltUmVzdWx0cycpO1xuXG4gIGlmICghZ3JvdXBpbmdMaXN0IHx8ICFzb3J0aW5nTGlzdCB8fCAhcmVzdWx0Q29udGFpbmVyKSByZXR1cm47XG5cbiAgY29uc3QgZ3JvdXBpbmdTdHJhdHMgPSBnZXRFbmFibGVkU3RyYXRlZ2llc0Zyb21VSShncm91cGluZ0xpc3QpO1xuICBjb25zdCBzb3J0aW5nU3RyYXRzID0gZ2V0RW5hYmxlZFN0cmF0ZWdpZXNGcm9tVUkoc29ydGluZ0xpc3QpO1xuXG4gIC8vIFByZXBhcmUgZGF0YVxuICBsZXQgdGFicyA9IGdldE1hcHBlZFRhYnMoKTtcblxuICAvLyAxLiBTb3J0XG4gIGlmIChzb3J0aW5nU3RyYXRzLmxlbmd0aCA+IDApIHtcbiAgICB0YWJzID0gc29ydFRhYnModGFicywgc29ydGluZ1N0cmF0cyk7XG4gIH1cblxuICAvLyAyLiBHcm91cFxuICBjb25zdCBncm91cHMgPSBncm91cFRhYnModGFicywgZ3JvdXBpbmdTdHJhdHMpO1xuXG4gIC8vIDMuIFJlbmRlclxuICBpZiAoZ3JvdXBzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmVzdWx0Q29udGFpbmVyLmlubmVySFRNTCA9ICc8cD5ObyBncm91cHMgY3JlYXRlZCAoYXJlIHRoZXJlIGFueSB0YWJzPykuPC9wPic7XG4gICAgICByZXR1cm47XG4gIH1cblxuICByZXN1bHRDb250YWluZXIuaW5uZXJIVE1MID0gZ3JvdXBzLm1hcChncm91cCA9PiBgXG4gICAgPGRpdiBjbGFzcz1cImdyb3VwLXJlc3VsdFwiPlxuICAgICAgPGRpdiBjbGFzcz1cImdyb3VwLWhlYWRlclwiIHN0eWxlPVwiYm9yZGVyLWxlZnQ6IDVweCBzb2xpZCAke2dyb3VwLmNvbG9yfVwiPlxuICAgICAgICA8c3Bhbj4ke2VzY2FwZUh0bWwoZ3JvdXAubGFiZWwgfHwgJ1VuZ3JvdXBlZCcpfTwvc3Bhbj5cbiAgICAgICAgPHNwYW4gY2xhc3M9XCJncm91cC1tZXRhXCI+JHtncm91cC50YWJzLmxlbmd0aH0gdGFicyAmYnVsbDsgUmVhc29uOiAke2VzY2FwZUh0bWwoZ3JvdXAucmVhc29uKX08L3NwYW4+XG4gICAgICA8L2Rpdj5cbiAgICAgIDx1bCBjbGFzcz1cImdyb3VwLXRhYnNcIj5cbiAgICAgICAgJHtncm91cC50YWJzLm1hcCh0YWIgPT4gYFxuICAgICAgICAgIDxsaSBjbGFzcz1cImdyb3VwLXRhYi1pdGVtXCI+XG4gICAgICAgICAgICAke3RhYi5mYXZJY29uVXJsID8gYDxpbWcgc3JjPVwiJHtlc2NhcGVIdG1sKHRhYi5mYXZJY29uVXJsKX1cIiBjbGFzcz1cInRhYi1pY29uXCIgb25lcnJvcj1cInRoaXMuc3R5bGUuZGlzcGxheT0nbm9uZSdcIj5gIDogJzxkaXYgY2xhc3M9XCJ0YWItaWNvblwiPjwvZGl2Pid9XG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cInRpdGxlLWNlbGxcIiB0aXRsZT1cIiR7ZXNjYXBlSHRtbCh0YWIudGl0bGUpfVwiPiR7ZXNjYXBlSHRtbCh0YWIudGl0bGUpfTwvc3Bhbj5cbiAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiY29sb3I6ICM5OTk7IGZvbnQtc2l6ZTogMC44ZW07IG1hcmdpbi1sZWZ0OiBhdXRvO1wiPiR7ZXNjYXBlSHRtbChuZXcgVVJMKHRhYi51cmwpLmhvc3RuYW1lKX08L3NwYW4+XG4gICAgICAgICAgPC9saT5cbiAgICAgICAgYCkuam9pbignJyl9XG4gICAgICA8L3VsPlxuICAgIDwvZGl2PlxuICBgKS5qb2luKCcnKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gYXBwbHlUb0Jyb3dzZXIoKSB7XG4gICAgY29uc3QgZ3JvdXBpbmdMaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NpbS1ncm91cGluZy1saXN0Jyk7XG4gICAgY29uc3Qgc29ydGluZ0xpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2ltLXNvcnRpbmctbGlzdCcpO1xuXG4gICAgaWYgKCFncm91cGluZ0xpc3QgfHwgIXNvcnRpbmdMaXN0KSByZXR1cm47XG5cbiAgICBjb25zdCBncm91cGluZ1N0cmF0cyA9IGdldEVuYWJsZWRTdHJhdGVnaWVzRnJvbVVJKGdyb3VwaW5nTGlzdCk7XG4gICAgY29uc3Qgc29ydGluZ1N0cmF0cyA9IGdldEVuYWJsZWRTdHJhdGVnaWVzRnJvbVVJKHNvcnRpbmdMaXN0KTtcblxuICAgIC8vIENvbWJpbmUgc3RyYXRlZ2llcy5cbiAgICAvLyBXZSBwcmlvcml0aXplIGdyb3VwaW5nIHN0cmF0ZWdpZXMgZmlyc3QsIHRoZW4gc29ydGluZyBzdHJhdGVnaWVzLFxuICAgIC8vIGFzIHRoZSBiYWNrZW5kIGZpbHRlcnMgdGhlbSB3aGVuIHBlcmZvcm1pbmcgYWN0aW9ucy5cbiAgICBjb25zdCBhbGxTdHJhdGVnaWVzID0gWy4uLmdyb3VwaW5nU3RyYXRzLCAuLi5zb3J0aW5nU3RyYXRzXTtcblxuICAgIHRyeSB7XG4gICAgICAgIC8vIDEuIFNhdmUgUHJlZmVyZW5jZXNcbiAgICAgICAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgdHlwZTogJ3NhdmVQcmVmZXJlbmNlcycsXG4gICAgICAgICAgICBwYXlsb2FkOiB7IHNvcnRpbmc6IGFsbFN0cmF0ZWdpZXMgfVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyAyLiBUcmlnZ2VyIEFwcGx5IEdyb3VwaW5nICh3aGljaCB1c2VzIHRoZSBuZXcgcHJlZmVyZW5jZXMpXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgdHlwZTogJ2FwcGx5R3JvdXBpbmcnLFxuICAgICAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgICAgICAgIHNvcnRpbmc6IGFsbFN0cmF0ZWdpZXMgLy8gUGFzcyBleHBsaWNpdGx5IHRvIGVuc3VyZSBpbW1lZGlhdGUgZWZmZWN0XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vaykge1xuICAgICAgICAgICAgYWxlcnQoXCJBcHBsaWVkIHN1Y2Nlc3NmdWxseSFcIik7XG4gICAgICAgICAgICBsb2FkVGFicygpOyAvLyBSZWZyZXNoIGRhdGFcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGFsZXJ0KFwiRmFpbGVkIHRvIGFwcGx5OiBcIiArIChyZXNwb25zZS5lcnJvciB8fCAnVW5rbm93biBlcnJvcicpKTtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkFwcGx5IGZhaWxlZFwiLCBlKTtcbiAgICAgICAgYWxlcnQoXCJBcHBseSBmYWlsZWQ6IFwiICsgZSk7XG4gICAgfVxufVxuXG5cbmZ1bmN0aW9uIGVzY2FwZUh0bWwodGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgaWYgKCF0ZXh0KSByZXR1cm4gJyc7XG4gIHJldHVybiB0ZXh0XG4gICAgLnJlcGxhY2UoLyYvZywgJyZhbXA7JylcbiAgICAucmVwbGFjZSgvPC9nLCAnJmx0OycpXG4gICAgLnJlcGxhY2UoLz4vZywgJyZndDsnKVxuICAgIC5yZXBsYWNlKC9cIi9nLCAnJnF1b3Q7JylcbiAgICAucmVwbGFjZSgvJy9nLCAnJiMwMzk7Jyk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlbmRlckxpdmVWaWV3KCkge1xuICAgIGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsaXZlLXZpZXctY29udGFpbmVyJyk7XG4gICAgaWYgKCFjb250YWluZXIpIHJldHVybjtcblxuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHRhYnMgPSBhd2FpdCBjaHJvbWUudGFicy5xdWVyeSh7fSk7XG4gICAgICAgIGNvbnN0IGdyb3VwcyA9IGF3YWl0IGNocm9tZS50YWJHcm91cHMucXVlcnkoe30pO1xuICAgICAgICBjb25zdCBncm91cE1hcCA9IG5ldyBNYXAoZ3JvdXBzLm1hcChnID0+IFtnLmlkLCBnXSkpO1xuXG4gICAgICAgIGNvbnN0IHdpbmRvd3MgPSBuZXcgU2V0KHRhYnMubWFwKHQgPT4gdC53aW5kb3dJZCkpO1xuICAgICAgICBjb25zdCB3aW5kb3dJZHMgPSBBcnJheS5mcm9tKHdpbmRvd3MpLnNvcnQoKGEsIGIpID0+IGEgLSBiKTtcblxuICAgICAgICBsZXQgaHRtbCA9ICc8ZGl2IHN0eWxlPVwiZm9udC1zaXplOiAwLjllbTsgY29sb3I6ICM2NjY7IG1hcmdpbi1ib3R0b206IDEwcHg7XCI+U2VsZWN0IGl0ZW1zIGJlbG93IHRvIHNpbXVsYXRlIHNwZWNpZmljIHNlbGVjdGlvbiBzdGF0ZXMuPC9kaXY+JztcblxuICAgICAgICBmb3IgKGNvbnN0IHdpbklkIG9mIHdpbmRvd0lkcykge1xuICAgICAgICAgICAgY29uc3Qgd2luVGFicyA9IHRhYnMuZmlsdGVyKHQgPT4gdC53aW5kb3dJZCA9PT0gd2luSWQpO1xuICAgICAgICAgICAgY29uc3Qgd2luU2VsZWN0ZWQgPSB3aW5UYWJzLmV2ZXJ5KHQgPT4gdC5pZCAmJiBzaW11bGF0ZWRTZWxlY3Rpb24uaGFzKHQuaWQpKTtcblxuICAgICAgICAgICAgaHRtbCArPSBgPGRpdiBjbGFzcz1cInNlbGVjdGFibGUtaXRlbSAke3dpblNlbGVjdGVkID8gJ3NlbGVjdGVkJyA6ICcnfVwiIGRhdGEtdHlwZT1cIndpbmRvd1wiIGRhdGEtaWQ9XCIke3dpbklkfVwiIHN0eWxlPVwibWFyZ2luLWJvdHRvbTogMTVweDsgYm9yZGVyLXJhZGl1czogNHB4OyBwYWRkaW5nOiA1cHg7XCI+YDtcbiAgICAgICAgICAgIGh0bWwgKz0gYDxkaXYgc3R5bGU9XCJmb250LXdlaWdodDogYm9sZDtcIj5XaW5kb3cgJHt3aW5JZH08L2Rpdj5gO1xuXG4gICAgICAgICAgICAvLyBPcmdhbml6ZSBieSBncm91cFxuICAgICAgICAgICAgY29uc3Qgd2luR3JvdXBzID0gbmV3IE1hcDxudW1iZXIsIGNocm9tZS50YWJzLlRhYltdPigpO1xuICAgICAgICAgICAgY29uc3QgdW5ncm91cGVkOiBjaHJvbWUudGFicy5UYWJbXSA9IFtdO1xuXG4gICAgICAgICAgICB3aW5UYWJzLmZvckVhY2godCA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHQuZ3JvdXBJZCAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF3aW5Hcm91cHMuaGFzKHQuZ3JvdXBJZCkpIHdpbkdyb3Vwcy5zZXQodC5ncm91cElkLCBbXSk7XG4gICAgICAgICAgICAgICAgICAgIHdpbkdyb3Vwcy5nZXQodC5ncm91cElkKSEucHVzaCh0KTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB1bmdyb3VwZWQucHVzaCh0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gUmVuZGVyIFVuZ3JvdXBlZFxuICAgICAgICAgICAgaWYgKHVuZ3JvdXBlZC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgIGh0bWwgKz0gYDxkaXYgc3R5bGU9XCJtYXJnaW4tbGVmdDogMTBweDsgbWFyZ2luLXRvcDogNXB4O1wiPmA7XG4gICAgICAgICAgICAgICAgIGh0bWwgKz0gYDxkaXYgc3R5bGU9XCJmb250LXNpemU6IDAuOWVtOyBjb2xvcjogIzU1NTtcIj5Vbmdyb3VwZWQgKCR7dW5ncm91cGVkLmxlbmd0aH0pPC9kaXY+YDtcbiAgICAgICAgICAgICAgICAgdW5ncm91cGVkLmZvckVhY2godCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICBjb25zdCBpc1NlbGVjdGVkID0gdC5pZCAmJiBzaW11bGF0ZWRTZWxlY3Rpb24uaGFzKHQuaWQpO1xuICAgICAgICAgICAgICAgICAgICAgaHRtbCArPSBgPGRpdiBjbGFzcz1cInNlbGVjdGFibGUtaXRlbSAke2lzU2VsZWN0ZWQgPyAnc2VsZWN0ZWQnIDogJyd9XCIgZGF0YS10eXBlPVwidGFiXCIgZGF0YS1pZD1cIiR7dC5pZH1cIiBzdHlsZT1cIm1hcmdpbi1sZWZ0OiAxMHB4OyBwYWRkaW5nOiAycHggNXB4OyBib3JkZXItcmFkaXVzOiAzcHg7IGN1cnNvcjogcG9pbnRlcjsgY29sb3I6ICMzMzM7IHdoaXRlLXNwYWNlOiBub3dyYXA7IG92ZXJmbG93OiBoaWRkZW47IHRleHQtb3ZlcmZsb3c6IGVsbGlwc2lzO1wiPi0gJHtlc2NhcGVIdG1sKHQudGl0bGUgfHwgJ1VudGl0bGVkJyl9PC9kaXY+YDtcbiAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgIGh0bWwgKz0gYDwvZGl2PmA7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFJlbmRlciBHcm91cHNcbiAgICAgICAgICAgIGZvciAoY29uc3QgW2dyb3VwSWQsIGdUYWJzXSBvZiB3aW5Hcm91cHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBncm91cEluZm8gPSBncm91cE1hcC5nZXQoZ3JvdXBJZCk7XG4gICAgICAgICAgICAgICAgY29uc3QgY29sb3IgPSBncm91cEluZm8/LmNvbG9yIHx8ICdncmV5JztcbiAgICAgICAgICAgICAgICBjb25zdCB0aXRsZSA9IGdyb3VwSW5mbz8udGl0bGUgfHwgJ1VudGl0bGVkIEdyb3VwJztcbiAgICAgICAgICAgICAgICBjb25zdCBncm91cFNlbGVjdGVkID0gZ1RhYnMuZXZlcnkodCA9PiB0LmlkICYmIHNpbXVsYXRlZFNlbGVjdGlvbi5oYXModC5pZCkpO1xuXG4gICAgICAgICAgICAgICAgaHRtbCArPSBgPGRpdiBjbGFzcz1cInNlbGVjdGFibGUtaXRlbSAke2dyb3VwU2VsZWN0ZWQgPyAnc2VsZWN0ZWQnIDogJyd9XCIgZGF0YS10eXBlPVwiZ3JvdXBcIiBkYXRhLWlkPVwiJHtncm91cElkfVwiIHN0eWxlPVwibWFyZ2luLWxlZnQ6IDEwcHg7IG1hcmdpbi10b3A6IDVweDsgYm9yZGVyLWxlZnQ6IDNweCBzb2xpZCAke2NvbG9yfTsgcGFkZGluZy1sZWZ0OiA1cHg7IHBhZGRpbmc6IDVweDsgYm9yZGVyLXJhZGl1czogM3B4O1wiPmA7XG4gICAgICAgICAgICAgICAgaHRtbCArPSBgPGRpdiBzdHlsZT1cImZvbnQtd2VpZ2h0OiBib2xkOyBmb250LXNpemU6IDAuOWVtO1wiPiR7ZXNjYXBlSHRtbCh0aXRsZSl9ICgke2dUYWJzLmxlbmd0aH0pPC9kaXY+YDtcbiAgICAgICAgICAgICAgICBnVGFicy5mb3JFYWNoKHQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNTZWxlY3RlZCA9IHQuaWQgJiYgc2ltdWxhdGVkU2VsZWN0aW9uLmhhcyh0LmlkKTtcbiAgICAgICAgICAgICAgICAgICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9XCJzZWxlY3RhYmxlLWl0ZW0gJHtpc1NlbGVjdGVkID8gJ3NlbGVjdGVkJyA6ICcnfVwiIGRhdGEtdHlwZT1cInRhYlwiIGRhdGEtaWQ9XCIke3QuaWR9XCIgc3R5bGU9XCJtYXJnaW4tbGVmdDogMTBweDsgcGFkZGluZzogMnB4IDVweDsgYm9yZGVyLXJhZGl1czogM3B4OyBjdXJzb3I6IHBvaW50ZXI7IGNvbG9yOiAjMzMzOyB3aGl0ZS1zcGFjZTogbm93cmFwOyBvdmVyZmxvdzogaGlkZGVuOyB0ZXh0LW92ZXJmbG93OiBlbGxpcHNpcztcIj4tICR7ZXNjYXBlSHRtbCh0LnRpdGxlIHx8ICdVbnRpdGxlZCcpfTwvZGl2PmA7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgaHRtbCArPSBgPC9kaXY+YDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaHRtbCArPSBgPC9kaXY+YDtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnRhaW5lci5pbm5lckhUTUwgPSBodG1sO1xuXG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb250YWluZXIuaW5uZXJIVE1MID0gYDxwIHN0eWxlPVwiY29sb3I6cmVkXCI+RXJyb3IgbG9hZGluZyBsaXZlIHZpZXc6ICR7ZX08L3A+YDtcbiAgICB9XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gTE9HIFZJRVdFUiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmxldCBjdXJyZW50TG9nczogTG9nRW50cnlbXSA9IFtdO1xuXG5hc3luYyBmdW5jdGlvbiBsb2FkTG9ncygpIHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2dldExvZ3MnIH0pO1xuICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2sgJiYgcmVzcG9uc2UuZGF0YSkge1xuICAgICAgICAgICAgY3VycmVudExvZ3MgPSByZXNwb25zZS5kYXRhO1xuICAgICAgICAgICAgcmVuZGVyTG9ncygpO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGxvYWQgbG9nc1wiLCBlKTtcbiAgICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNsZWFyUmVtb3RlTG9ncygpIHtcbiAgICB0cnkge1xuICAgICAgICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdjbGVhckxvZ3MnIH0pO1xuICAgICAgICBsb2FkTG9ncygpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBjbGVhciBsb2dzXCIsIGUpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gcmVuZGVyTG9ncygpIHtcbiAgICBjb25zdCB0Ym9keSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2dzLXRhYmxlLWJvZHknKTtcbiAgICBjb25zdCBsZXZlbEZpbHRlciA9IChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbG9nLWxldmVsLWZpbHRlcicpIGFzIEhUTUxTZWxlY3RFbGVtZW50KS52YWx1ZTtcbiAgICBjb25zdCBzZWFyY2hUZXh0ID0gKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2ctc2VhcmNoJykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUudG9Mb3dlckNhc2UoKTtcblxuICAgIGlmICghdGJvZHkpIHJldHVybjtcblxuICAgIHRib2R5LmlubmVySFRNTCA9ICcnO1xuXG4gICAgY29uc3QgZmlsdGVyZWQgPSBjdXJyZW50TG9ncy5maWx0ZXIoZW50cnkgPT4ge1xuICAgICAgICBpZiAobGV2ZWxGaWx0ZXIgIT09ICdhbGwnICYmIGVudHJ5LmxldmVsICE9PSBsZXZlbEZpbHRlcikgcmV0dXJuIGZhbHNlO1xuICAgICAgICBpZiAoc2VhcmNoVGV4dCkge1xuICAgICAgICAgICAgY29uc3QgdGV4dCA9IGAke2VudHJ5Lm1lc3NhZ2V9ICR7SlNPTi5zdHJpbmdpZnkoZW50cnkuY29udGV4dCB8fCB7fSl9YC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgaWYgKCF0ZXh0LmluY2x1ZGVzKHNlYXJjaFRleHQpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSk7XG5cbiAgICBpZiAoZmlsdGVyZWQubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHRib2R5LmlubmVySFRNTCA9ICc8dHI+PHRkIGNvbHNwYW49XCI0XCIgc3R5bGU9XCJwYWRkaW5nOiAxMHB4OyB0ZXh0LWFsaWduOiBjZW50ZXI7IGNvbG9yOiAjODg4O1wiPk5vIGxvZ3MgZm91bmQuPC90ZD48L3RyPic7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBmaWx0ZXJlZC5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgICAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndHInKTtcblxuICAgICAgICAvLyBDb2xvciBjb2RlIGxldmVsXG4gICAgICAgIGxldCBjb2xvciA9ICcjMzMzJztcbiAgICAgICAgaWYgKGVudHJ5LmxldmVsID09PSAnZXJyb3InIHx8IGVudHJ5LmxldmVsID09PSAnY3JpdGljYWwnKSBjb2xvciA9ICdyZWQnO1xuICAgICAgICBlbHNlIGlmIChlbnRyeS5sZXZlbCA9PT0gJ3dhcm4nKSBjb2xvciA9ICdvcmFuZ2UnO1xuICAgICAgICBlbHNlIGlmIChlbnRyeS5sZXZlbCA9PT0gJ2RlYnVnJykgY29sb3IgPSAnYmx1ZSc7XG5cbiAgICAgICAgcm93LmlubmVySFRNTCA9IGBcbiAgICAgICAgICAgIDx0ZCBzdHlsZT1cInBhZGRpbmc6IDhweDsgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkICNlZWU7IHdoaXRlLXNwYWNlOiBub3dyYXA7XCI+JHtuZXcgRGF0ZShlbnRyeS50aW1lc3RhbXApLnRvTG9jYWxlVGltZVN0cmluZygpfSAoJHtlbnRyeS50aW1lc3RhbXB9KTwvdGQ+XG4gICAgICAgICAgICA8dGQgc3R5bGU9XCJwYWRkaW5nOiA4cHg7IGJvcmRlci1ib3R0b206IDFweCBzb2xpZCAjZWVlOyBjb2xvcjogJHtjb2xvcn07IGZvbnQtd2VpZ2h0OiBib2xkO1wiPiR7ZW50cnkubGV2ZWwudG9VcHBlckNhc2UoKX08L3RkPlxuICAgICAgICAgICAgPHRkIHN0eWxlPVwicGFkZGluZzogOHB4OyBib3JkZXItYm90dG9tOiAxcHggc29saWQgI2VlZTtcIj4ke2VzY2FwZUh0bWwoZW50cnkubWVzc2FnZSl9PC90ZD5cbiAgICAgICAgICAgIDx0ZCBzdHlsZT1cInBhZGRpbmc6IDhweDsgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkICNlZWU7XCI+XG4gICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwibWF4LWhlaWdodDogMTAwcHg7IG92ZXJmbG93LXk6IGF1dG87XCI+XG4gICAgICAgICAgICAgICAgICAke2VudHJ5LmNvbnRleHQgPyBgPHByZSBzdHlsZT1cIm1hcmdpbjogMDtcIj4ke2VzY2FwZUh0bWwoSlNPTi5zdHJpbmdpZnkoZW50cnkuY29udGV4dCwgbnVsbCwgMikpfTwvcHJlPmAgOiAnLSd9XG4gICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDwvdGQ+XG4gICAgICAgIGA7XG4gICAgICAgIHRib2R5LmFwcGVuZENoaWxkKHJvdyk7XG4gICAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGxvYWRHbG9iYWxMb2dMZXZlbCgpIHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ2xvYWRQcmVmZXJlbmNlcycgfSk7XG4gICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vayAmJiByZXNwb25zZS5kYXRhKSB7XG4gICAgICAgICAgICBjb25zdCBwcmVmcyA9IHJlc3BvbnNlLmRhdGEgYXMgUHJlZmVyZW5jZXM7XG4gICAgICAgICAgICBjb25zdCBzZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2xvYmFsLWxvZy1sZXZlbCcpIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuICAgICAgICAgICAgaWYgKHNlbGVjdCkge1xuICAgICAgICAgICAgICAgIHNlbGVjdC52YWx1ZSA9IHByZWZzLmxvZ0xldmVsIHx8ICdpbmZvJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBsb2FkIHByZWZzIGZvciBsb2dzXCIsIGUpO1xuICAgIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gdXBkYXRlR2xvYmFsTG9nTGV2ZWwoKSB7XG4gICAgY29uc3Qgc2VsZWN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dsb2JhbC1sb2ctbGV2ZWwnKSBhcyBIVE1MU2VsZWN0RWxlbWVudDtcbiAgICBpZiAoIXNlbGVjdCkgcmV0dXJuO1xuICAgIGNvbnN0IGxldmVsID0gc2VsZWN0LnZhbHVlIGFzIExvZ0xldmVsO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgdHlwZTogJ3NhdmVQcmVmZXJlbmNlcycsXG4gICAgICAgICAgICBwYXlsb2FkOiB7IGxvZ0xldmVsOiBsZXZlbCB9XG4gICAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBzYXZlIGxvZyBsZXZlbFwiLCBlKTtcbiAgICB9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBRUEsSUFBTSxTQUFTO0FBRWYsSUFBTSxpQkFBMkM7QUFBQSxFQUMvQyxPQUFPO0FBQUEsRUFDUCxNQUFNO0FBQUEsRUFDTixNQUFNO0FBQUEsRUFDTixPQUFPO0FBQUEsRUFDUCxVQUFVO0FBQ1o7QUFFQSxJQUFJLGVBQXlCO0FBQzdCLElBQUksT0FBbUIsQ0FBQztBQUN4QixJQUFNLFdBQVc7QUFDakIsSUFBTSxjQUFjO0FBR3BCLElBQU0sa0JBQWtCLE9BQU8sU0FBUyxlQUNoQixPQUFRLEtBQWEsNkJBQTZCLGVBQ2xELGdCQUFpQixLQUFhO0FBQ3RELElBQUksV0FBVztBQUNmLElBQUksY0FBYztBQUNsQixJQUFJLFlBQWtEO0FBRXRELElBQU0sU0FBUyxNQUFNO0FBQ2pCLE1BQUksQ0FBQyxtQkFBbUIsQ0FBQyxRQUFRLFNBQVMsV0FBVyxVQUFVO0FBQzNELGtCQUFjO0FBQ2Q7QUFBQSxFQUNKO0FBRUEsYUFBVztBQUNYLGdCQUFjO0FBRWQsU0FBTyxRQUFRLFFBQVEsSUFBSSxFQUFFLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQyxFQUFFLEtBQUssTUFBTTtBQUMzRCxlQUFXO0FBQ1gsUUFBSSxhQUFhO0FBQ2Isd0JBQWtCO0FBQUEsSUFDdEI7QUFBQSxFQUNKLENB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QUFVLFlBQWEsUUFBTztBQUNqRSxRQUFJLFlBQVk7QUFDWixZQUFNLE9BQU8sR0FBRyxNQUFNLE9BQU8sSUFBSSxLQUFLLFVBQVUsTUFBTSxXQUFXLENBQUMsQ0FBQyxDQUFDLEdBQUcsWUFBWTtBQUNuRixVQUFJLENBQUMsS0FBSyxTQUFTLFVBQVUsRUFBRyxRQUFPO0FBQUEsSUFDM0M7QUFDQSxXQUFPO0FBQUEsRUFDWCxDQUFDO0FBRUQsTUFBSSxTQUFTLFdBQVcsR0FBRztBQUN2QixVQUFNLFlBQVk7QUFDbEI7QUFBQSxFQUNKO0FBRUEsV0FBUyxRQUFRLFdBQVM7QUFDdEIsVUFBTSxNQUFNLFNBQVMsY0FBYyxJQUFJO0FBR3ZDLFFBQUksUUFBUTtBQUNaLFFBQUksTUFBTSxVQUFVLFdBQVcsTUFBTSxVQUFVLFdBQVksU0FBUTtBQUFBLGFBQzFELE1BQU0sVUFBVSxPQUFRLFNBQVE7QUFBQSxhQUNoQyxNQUFNLFVBQVUsUUFBUyxTQUFRO0FBRTFDLFFBQUksWUFBWTtBQUFBLDRGQUNvRSxJQUFJLEtBQUssTUFBTSxTQUFTLEVBQUUsbUJBQW1CLENBQUMsS0FBSyxNQUFNLFNBQVM7QUFBQSw2RUFDakYsS0FBSyx5QkFBeUIsTUFBTSxNQUFNLFlBQVksQ0FBQztBQUFBLHVFQUM3RCxXQUFXLE1BQU0sT0FBTyxDQUFDO0FBQUE7QUFBQTtBQUFBLG9CQUc1RSxNQUFNLFVBQVUsMkJBQTJCLFdBQVcsS0FBSyxVQUFVLE1BQU0sU0FBUyxNQUFNLENBQUMsQ0FBQyxDQUFDLFdBQVcsR0FBRztBQUFBO0FBQUE7QUFBQTtBQUl2SCxVQUFNLFlBQVksR0FBRztBQUFBLEVBQ3pCLENBQUM7QUFDTDtBQUVBLGVBQWUscUJBQXFCO0FBQ2hDLE1BQUk7QUFDQSxVQUFNLFdBQVcsTUFBTSxPQUFPLFFBQVEsWUFBWSxFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFDN0UsUUFBSSxZQUFZLFNBQVMsTUFBTSxTQUFTLE1BQU07QUFDMUMsWUFBTSxRQUFRLFNBQVM7QUFDdkIsWUFBTSxTQUFTLFNBQVMsZUFBZSxrQkFBa0I7QUFDekQsVUFBSSxRQUFRO0FBQ1IsZUFBTyxRQUFRLE1BQU0sWUFBWTtBQUFBLE1BQ3JDO0FBQUEsSUFDSjtBQUFBLEVBQ0osU0FBUyxHQUFHO0FBQ1IsWUFBUSxNQUFNLGlDQUFpQyxDQUFDO0FBQUEsRUFDcEQ7QUFDSjtBQUVBLGVBQWUsdUJBQXVCO0FBQ2xDLFFBQU0sU0FBUyxTQUFTLGVBQWUsa0JBQWtCO0FBQ3pELE1BQUksQ0FBQyxPQUFRO0FBQ2IsUUFBTSxRQUFRLE9BQU87QUFFckIsTUFBSTtBQUNBLFVBQU0sT0FBTyxRQUFRLFlBQVk7QUFBQSxNQUM3QixNQUFNO0FBQUEsTUFDTixTQUFTLEVBQUUsVUFBVSxNQUFNO0FBQUEsSUFDL0IsQ0FBQztBQUFBLEVBQ0wsU0FBUyxHQUFHO0FBQ1IsWUFBUSxNQUFNLDRCQUE0QixDQUFDO0FBQUEsRUFDL0M7QUFDSjsiLAogICJuYW1lcyI6IFsicGFydHMiLCAiY3VzdG9tU3RyYXRlZ2llcyIsICJncm91cFRhYnMiXQp9Cg==
